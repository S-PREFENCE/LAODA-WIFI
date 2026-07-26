/* server.js — 劳大象棋联机服务端（零依赖，仅用 Node 标准库）
 * 职责：
 *   1) 静态托管前端（index.html / css / js / assets）
 *   2) 手写最小 WebSocket，做「房间码配对 + 棋步中继 + 轻量权威」
 *      - 服务端保存一份棋盘，逐步校验走法合法性（防两端不同步/误传）
 *      - 红先黑后；房间满 2 人即开局
 * 用法：node server.js [端口]   默认 3000
 * 主机：监听 0.0.0.0，会在控制台打印内网 IP，供同一内网的玩家浏览器访问。
 */

'use strict';

var http = require('http');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var os = require('os');

/* ---------- 载入前端规则引擎，供服务端做权威校验（单一事实源，不重写规则） ---------- */
global.XQ = global.XQ || {};
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
var XQ = global.XQ;

/* ---------- 静态托管 ---------- */
var ROOT = __dirname;
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safeJoin(base, p) {
  var resolved = path.normalize(path.join(base, p));
  if (resolved.indexOf(base) !== 0) return null; // 防目录穿越
  return resolved;
}

function serveStatic(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' ) urlPath = '/index.html';
  var filePath = safeJoin(ROOT, urlPath);
  if (!filePath) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(filePath, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------- WebSocket 帧编解码（RFC 6455，最小实现，仅文本/关闭/ping/pong） ---------- */
function encodeFrame(data, opcode) {
  opcode = opcode || 0x1;
  var payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  var len = payload.length;
  var header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode; // FIN=1
  return Buffer.concat([header, payload]);
}

function decodeFrame(buf) {
  if (buf.length < 2) return null;
  var b0 = buf[0], b1 = buf[1];
  var fin = (b0 & 0x80) !== 0;
  var opcode = b0 & 0x0f;
  var masked = (b1 & 0x80) !== 0;
  var len = b1 & 0x7f;
  var offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2); offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    var hi = buf.readUInt32BE(2), lo = buf.readUInt32BE(6);
    len = hi * 4294967296 + lo; offset = 10;
  }
  var maskKey = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.slice(offset, offset + 4); offset += 4;
  }
  if (buf.length < offset + len) return null;
  var payload = Buffer.from(buf.slice(offset, offset + len));
  if (masked) {
    for (var i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
  }
  return { fin: fin, opcode: opcode, payload: payload, total: offset + len };
}

/* ---------- 房间与连接管理 ---------- */
var GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var rooms = {}; // code -> room
var usedCodes = {};

function genCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混字符 I O 0 1
  var code;
  do {
    code = '';
    for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (usedCodes[code]);
  return code;
}

function sendWs(sock, obj, opcode) {
  try { sock.write(encodeFrame(JSON.stringify(obj), opcode || 0x1)); } catch (e) {}
}

function broadcast(room, obj, exceptSock) {
  room.sockets.forEach(function (s) {
    if (s !== exceptSock) sendWs(s, obj);
  });
}

function setupWs(sock) {
  sock.buf = Buffer.alloc(0);
  sock.roomCode = null;
  sock.color = null;
  sock.alive = true;

  sock.on('data', function (chunk) {
    sock.buf = Buffer.concat([sock.buf, chunk]);
    // 循环解析缓冲区中的完整帧
    while (true) {
      var frame = decodeFrame(sock.buf);
      if (!frame) break;
      sock.buf = sock.buf.slice(frame.total);
      if (frame.opcode === 0x8) { // close
        try { sock.end(); } catch (e) {}
        return;
      }
      if (frame.opcode === 0x9) { // ping -> pong
        sendWs(sock, frame.payload, 0xA);
        continue;
      }
      if (frame.opcode === 0x1) { // text
        var msg;
        try { msg = JSON.parse(frame.payload.toString('utf8')); } catch (e) { continue; }
        handleMessage(sock, msg);
      }
    }
  });

  sock.on('close', function () { onDisconnect(sock); });
  sock.on('error', function () { onDisconnect(sock); });
}

function onDisconnect(sock) {
  var code = sock.roomCode;
  if (!code || !rooms[code]) return;
  var room = rooms[code];
  // 从房间移除
  room.sockets = room.sockets.filter(function (s) { return s !== sock; });
  if (room.sockets.length === 0) {
    delete rooms[code];
    delete usedCodes[code];
  } else {
    // 通知仍在房间的对手
    broadcast(room, { type: 'opponent_left' });
  }
}

function handleMessage(sock, msg) {
  if (msg.type === 'create') {
    var code = genCode();
    var room = {
      code: code,
      sockets: [sock],
      board: new XQ.Board(),
      turn: 'red',
      started: false,
      finished: false,
      ply: 0
    };
    rooms[code] = room;
    usedCodes[code] = true;
    sock.roomCode = code;
    sock.color = 'red';
    sendWs(sock, { type: 'created', room: code, color: 'red' });
    return;
  }

  if (msg.type === 'join') {
    var c = (msg.room || '').toUpperCase();
    var r = rooms[c];
    if (!r) { sendWs(sock, { type: 'error', msg: '房间不存在或已失效' }); return; }
    if (r.sockets.length >= 2) { sendWs(sock, { type: 'error', msg: '房间已满' }); return; }
    r.sockets.push(sock);
    sock.roomCode = c;
    sock.color = 'black';
    r.started = true;
    // 通知加入者
    sendWs(sock, { type: 'joined', room: c, color: 'black' });
    // 双方开局（各自拿到自己的颜色）
    r.sockets.forEach(function (s) {
      sendWs(s, { type: 'start', color: s.color });
    });
    return;
  }

  if (msg.type === 'move') {
    var room = sock.roomCode && rooms[sock.roomCode];
    if (!room || !room.started || room.finished) return;
    if (sock.color !== room.turn) { sendWs(sock, { type: 'error', msg: '还没轮到你' }); return; }
    var from = msg.from, to = msg.to;
    if (!from || !to) return;
    var piece = room.board.grid[from.r][from.c];
    if (!piece || piece.side !== sock.color) {
      sendWs(sock, { type: 'error', msg: '非法走法' }); return;
    }
    // 轻量权威：用前端同一套规则校验
    var legal = XQ.legalMoves(room.board, sock.color);
    var ok = false;
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].from.r === from.r && legal[i].from.c === from.c &&
          legal[i].to.r === to.r && legal[i].to.c === to.c) { ok = true; break; }
    }
    if (!ok) { sendWs(sock, { type: 'error', msg: '非法走法' }); return; }
    // 应用并更新服务端棋盘
    room.board.move({ from: from, to: to });
    room.ply += 1;
    room.turn = XQ.opponent(room.turn);
    var captured = !!(room.board.grid[to.r][to.c]); // 已在 move 前取出，这里仅作提示字段
    // 转发给对手（不走子方自己，避免本地重复落子）
    broadcast(room, { type: 'move', from: from, to: to, color: sock.color, ply: room.ply }, sock);
    // 终局检测（权威）
    var res = XQ.getResult(room.board, room.turn);
    if (res.over) {
      room.finished = true;
      broadcast(room, { type: 'game_over', winner: res.winner });
    }
    return;
  }

  if (msg.type === 'resign') {
    var room2 = sock.roomCode && rooms[sock.roomCode];
    if (!room2 || room2.finished) return;
    room2.finished = true;
    var winner = XQ.opponent(sock.color);
    broadcast(room2, { type: 'resigned', winner: winner });
    return;
  }
}

/* ---------- HTTP + Upgrade ---------- */
var server = http.createServer(serveStatic);

server.on('upgrade', function (req, socket) {
  var key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  var accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  var headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + accept
  ];
  socket.write(headers.join('\r\n') + '\r\n\r\n');
  setupWs(socket);
});

/* ---------- 启动 ---------- */
var PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', function () {
  console.log('劳大象棋 · 联机服务端已启动');
  console.log('本机访问：  http://127.0.0.1:' + PORT + '/');
  // 打印内网 IP，方便同网段其他设备访问
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log('内网访问：  http://' + n.address + ':' + PORT + '/  （' + name + '）');
      }
    });
  });
  console.log('把上面的「内网访问」地址发给同事，对方浏览器打开即可联机。');
});
