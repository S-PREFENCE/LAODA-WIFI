/* net.js — 劳大象棋联机客户端（浏览器原生 WebSocket，零依赖）
 * 连接「同源」的 WebSocket：前端由 server.js / server.py 托管，
 * 因此直接连 ws://<当前域名:端口>，无需硬编码主机地址，天然适配内网。
 * 仅负责收发 JSON 消息；棋步落地交由 game.js 处理。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var ws = null;
  var cb = {};
  var queue = [];      // 连接建立前暂存的待发消息
  var connecting = false;

  function url() {
    var proto = (location.protocol === 'https:' || location.protocol === 'wss:') ? 'wss:' : 'ws:';
    return proto + '//' + location.host;
  }

  function flush() {
    if (!ws || ws.readyState !== 1) return;
    while (queue.length) {
      var m = queue.shift();
      try { ws.send(JSON.stringify(m)); } catch (e) {}
    }
  }

  XQ.Net = {
    init: function (handlers) { cb = handlers || {}; },

    connect: function () {
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return; // 正在连/已连
      connecting = true;
      try { ws = new WebSocket(url()); }
      catch (e) { if (cb.onStatus) cb.onStatus('无法建立连接'); return; }

      ws.onopen = function () {
        connecting = false;
        if (cb.onStatus) cb.onStatus('已连接服务器');
        flush();
      };
      ws.onclose = function () {
        if (cb.onStatus) cb.onStatus('与服务器断开');
      };
      ws.onerror = function () {
        if (cb.onStatus) cb.onStatus('连接出错，请确认服务端已启动');
      };
      ws.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        XQ.Net._handle(msg);
      };
    },

    _handle: function (msg) {
      switch (msg.type) {
        case 'created':       if (cb.onCreated) cb.onCreated(msg); break;
        case 'joined':        if (cb.onJoined) cb.onJoined(msg); break;
        case 'start':         if (cb.onStart) cb.onStart(msg); break;
        case 'move':          if (cb.onRemoteMove) cb.onRemoteMove(msg); break;
        case 'state':         if (cb.onState) cb.onState(msg); break;
        case 'opponent_left': if (cb.onOpponentLeft) cb.onOpponentLeft(msg); break;
        case 'game_over':     if (cb.onGameOver) cb.onGameOver(msg); break;
        case 'resigned':      if (cb.onResigned) cb.onResigned(msg); break;
        case 'draw_offer':    if (cb.onDrawOffer) cb.onDrawOffer(msg); break;
        case 'draw_decline':  if (cb.onDrawDecline) cb.onDrawDecline(msg); break;
        case 'undo_request':  if (cb.onUndoRequest) cb.onUndoRequest(msg); break;
        case 'undo_decline':  if (cb.onUndoDecline) cb.onUndoDecline(msg); break;
        case 'error':         if (cb.onError) cb.onError(msg); break;
        default: break;
      }
    },

    createRoom: function () { queue.push({ type: 'create' }); flush(); },
    joinRoom: function (code) { queue.push({ type: 'join', room: (code || '').toUpperCase() }); flush(); },
    sendMove: function (move) { queue.push({ type: 'move', from: move.from, to: move.to }); flush(); },
    resign: function () { queue.push({ type: 'resign' }); flush(); },
    drawOffer: function () { queue.push({ type: 'draw_offer' }); flush(); },
    drawAccept: function () { queue.push({ type: 'draw_accept' }); flush(); },
    drawDecline: function () { queue.push({ type: 'draw_decline' }); flush(); },
    undoRequest: function () { queue.push({ type: 'undo_request' }); flush(); },
    undoAccept: function () { queue.push({ type: 'undo_accept' }); flush(); },
    undoDecline: function () { queue.push({ type: 'undo_decline' }); flush(); },
    rematch: function () { queue.push({ type: 'rematch' }); flush(); },
    disconnect: function () { if (ws) { try { ws.close(); } catch (e) {} } ws = null; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
