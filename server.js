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

/* 棋盘/棋子序列化（供房间复用、悔棋回滚、断线重连时下发全量状态） */
function serPiece(p) { return p ? p.side[0] + p.type : null; }
function serializeBoard(board) {
  var g = board.grid, arr = [];
  for (var r = 0; r < 10; r++) {
    var row = [];
    for (var c = 0; c < 9; c++) { var p = g[r][c]; row.push(serPiece(p)); }
    arr.push(row);
  }
  return arr;
}
function serializeHistory(hist) {
  return hist.map(function (h) {
    return { from: h.from, to: h.to, side: h.side, piece: serPiece(h.piece) };
  });
}
function opposite(c) { return c === 'red' ? 'black' : 'red'; }

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
  // 清除悬而未决的求和/悔棋请求
  room.pendingDraw = null;
  room.pendingUndo = null;
  if (room.sockets.length === 0) {
    // 仅当房间从未开局（创建后无人加入）才彻底删除并释放房间码；
    // 已开局的对局保留房间与棋盘，允许任一方凭房间码重连回归。
    if (!room.started) {
      delete rooms[code];
      delete usedCodes[code];
    }
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
        ply: 0,
        history: [],            // 每步: {from,to,side,piece,captured}
        capturedRed: [],       // 红方俘获（黑子）
        capturedBlack: [],     // 黑方俘获（红子）
        pendingDraw: null,     // 待确认的和棋请求方
        pendingUndo: null      // 待确认的悔棋请求方
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
    // 分配颜色：已有 1 人 → 占空缺颜色（支持一方断线后凭房间码回归）；0 人 → 占红方
    var assignColor = (r.sockets.length === 1)
      ? (r.sockets[0].color === 'red' ? 'black' : 'red')
      : 'red';
    r.sockets.push(sock);
    sock.roomCode = c;
    sock.color = assignColor;
    r.started = true;

    if (r.sockets.length === 2) {
      // 双方到齐 → 先发 start(着色+可走) 再发 state(权威棋盘)，兼容首局与中途重连
      r.sockets.forEach(function (s) { sendWs(s, { type: 'start', color: s.color }); });
      // 通知加入者其加入成功（房间码 + 颜色），与原单局流程一致
      sendWs(sock, { type: 'joined', room: c, color: assignColor });
      if (r.finished) {
        // 再来一局：重置棋盘（state 不再下发，start 已含新局）
        r.board = new XQ.Board();
        r.turn = 'red'; r.ply = 0; r.history = []; r.capturedRed = []; r.capturedBlack = []; r.finished = false;
        r.pendingDraw = null; r.pendingUndo = null;
      } else {
        var st = {
          type: 'state', board: serializeBoard(r.board), turn: r.turn, ply: r.ply,
          history: serializeHistory(r.history),
          capturedRed: r.capturedRed.map(serPiece), capturedBlack: r.capturedBlack.map(serPiece),
          finished: false, winner: null, resumed: r.ply > 0, ready: true
        };
        r.sockets.forEach(function (s) { sendWs(s, st); });
      }
    } else {
      // 第一个凭码回归的人（另一人尚未回来）：发 start(着色) + state(当前棋盘, 未就位)
      sendWs(sock, { type: 'start', color: assignColor });
      sendWs(sock, { type: 'state', board: serializeBoard(r.board), turn: r.turn, ply: r.ply,
        history: serializeHistory(r.history),
        capturedRed: r.capturedRed.map(serPiece), capturedBlack: r.capturedBlack.map(serPiece),
        finished: r.finished, winner: r.winner || null, resumed: true, ready: false });
      sendWs(sock, { type: 'joined', room: c, color: assignColor, waiting: true });
    }
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
    var captured = room.board.grid[to.r][to.c]; // move 前取出，可能是被吃子
    var movedPiece = { side: piece.side, type: piece.type };
    room.board.move({ from: from, to: to });
    room.history.push({
      from: from, to: to, side: sock.color,
      piece: movedPiece,
      captured: captured ? { side: captured.side, type: captured.type } : null
    });
    if (captured) {
      if (captured.side === 'black') room.capturedRed.push({ side: 'black', type: captured.type });
      else room.capturedBlack.push({ side: 'red', type: captured.type });
    }
    room.ply += 1;
    room.turn = XQ.opponent(room.turn);
    room.pendingDraw = null; // 任一步走子后，悬而未决的求和/悔棋请求作废
    room.pendingUndo = null;
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

  /* ---------- 聊天（中继给对手） ---------- */
  if (msg.type === 'chat') {
    var rc = sock.roomCode && rooms[sock.roomCode];
    if (!rc) return;
    var text = String(msg.text || '').slice(0, 200).trim();
    if (!text) return;
    broadcast(rc, { type: 'chat', from: sock.color, text: text }, sock);
    return;
  }

  /* ---------- 求和（双方确认） ---------- */
  if (msg.type === 'draw_offer') {
    var rd = sock.roomCode && rooms[sock.roomCode];
    if (!rd || !rd.started || rd.finished) return;
    rd.pendingDraw = sock.color;
    broadcast(rd, { type: 'draw_offer', from: sock.color }, sock);
    return;
  }
  if (msg.type === 'draw_accept') {
    var rda = sock.roomCode && rooms[sock.roomCode];
    if (!rda || !rda.started || rda.finished || !rda.pendingDraw) return;
    rda.finished = true; rda.pendingDraw = null; rda.pendingUndo = null;
    broadcast(rda, { type: 'game_over', winner: 'draw' });
    return;
  }
  if (msg.type === 'draw_decline') {
    var rdd = sock.roomCode && rooms[sock.roomCode];
    if (!rdd) return;
    rdd.pendingDraw = null;
    broadcast(rdd, { type: 'draw_decline' }, sock);
    return;
  }

  /* ---------- 悔棋（双方确认，服务端权威回滚） ---------- */
  if (msg.type === 'undo_request') {
    var ru = sock.roomCode && rooms[sock.roomCode];
    if (!ru || !ru.started || ru.finished) return;
    if (ru.history.length === 0) { sendWs(sock, { type: 'error', msg: '暂无可悔棋步' }); return; }
    ru.pendingUndo = sock.color;
    broadcast(ru, { type: 'undo_request', from: sock.color }, sock);
    return;
  }
  if (msg.type === 'undo_accept') {
    var rua = sock.roomCode && rooms[sock.roomCode];
    if (!rua || !rua.started || rua.finished || !rua.pendingUndo) return;
    if (rua.history.length === 0) { rua.pendingUndo = null; return; }
    var last = rua.history.pop();
    // 回滚：把走动的子归位，被吃子（若有）复位
    rua.board.set(last.to.r, last.to.c, last.captured || null);
    rua.board.set(last.from.r, last.from.c, last.piece);
    rua.turn = last.side;
    rua.ply = Math.max(0, rua.ply - 1);
    if (last.captured) {
      if (last.captured.side === 'black') rua.capturedRed.pop();
      else rua.capturedBlack.pop();
    }
    rua.pendingUndo = null; rua.pendingDraw = null;
    rua.sockets.forEach(function (s) {
      sendWs(s, {
        type: 'state', board: serializeBoard(rua.board), turn: rua.turn, ply: rua.ply,
        history: serializeHistory(rua.history),
        capturedRed: rua.capturedRed.map(serPiece), capturedBlack: rua.capturedBlack.map(serPiece),
        finished: false, winner: null, appliedUndo: true, ready: true
      });
    });
    return;
  }
  if (msg.type === 'undo_decline') {
    var rud = sock.roomCode && rooms[sock.roomCode];
    if (!rud) return;
    rud.pendingUndo = null;
    broadcast(rud, { type: 'undo_decline' }, sock);
    return;
  }

  /* ---------- 再来一局（房间复用，对局结束后无需重建房间） ---------- */
  if (msg.type === 'rematch') {
    var rm = sock.roomCode && rooms[sock.roomCode];
    if (!rm || !rm.started) return;
    if (rm.sockets.length < 2) { sendWs(sock, { type: 'error', msg: '对手已离开，无法再来一局' }); return; }
    if (!rm.finished) return; // 仅对局结束后允许
    rm.board = new XQ.Board();
    rm.turn = 'red'; rm.ply = 0; rm.history = []; rm.capturedRed = []; rm.capturedBlack = [];
    rm.finished = false; rm.pendingDraw = null; rm.pendingUndo = null;
    rm.sockets.forEach(function (s) { sendWs(s, { type: 'start', color: s.color }); });
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
