/* game.js — 游戏控制器：串联规则/AI/音效/UI，三种模式 + 悔棋 + 记谱 + 残局解锁 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var game = {
    mode: 'pvp',
    difficulty: 'medium',
    humanSide: 'red',
    aiSide: 'black',
    board: null,
    turn: 'red',
    selected: null,
    legalTargets: null,
    legalMovesSelected: null,
    history: [],
    capturedRed: [],   // 红方俘获（黑子）
    capturedBlack: [], // 黑方俘获（红子）
    lastMove: null,
    checkPos: null,
    gameOver: false,
    winner: null,
    banner: null,
    message: '',
    messageType: '',
    aiThinking: false,
    currentLevelId: null,
    endReason: null,            // 本局结束原因：'no-moves'(被将死/困毙) 等
    checkmateAudioPlayed: false, // 绝杀音频每局仅播放一次
    chatLog: [],                // 联机聊天记录

    /* ---------- 联机对战状态 ---------- */
    onlineColor: null,    // 本端执 'red' / 'black'
    onlineReady: false,   // 双方已就位，可走子
    onlineRoom: null,     // 房间码
    pendingOut: null,     // 本端已发出待对方确认的请求：'draw' / 'undo'
    pendingIn: null,      // 收到对方待本端确认的请求：'draw' / 'undo'

    /* ---------- 初始化 ---------- */
    init: function () {
      var self = this;
      XQ.UI.init({
        onSquareClick: function (r, c) { self.onSquareClick(r, c); },
        onMode: function (m) { self.setMode(m); },
        onDiff: function (d) { self.difficulty = d; if (self.mode === 'pvai') self.restart(); },
        onSide: function (s) { self.humanSide = s; self.aiSide = XQ.opponent(s); if (self.mode === 'pvai') self.restart(); },
        onUndo: function () { self.undo(); },
        onRestart: function () { self.restart(); },
        onToggleSound: function () { self.toggleSound(); },
        onLevelClick: function (id) { self.loadLevel(id); },
        onNetCreate: function () { self.onNetCreate(); },
        onNetJoin: function (code) { self.onNetJoin(code); },
        onNetResign: function () { self.onNetResign(); },
        onNetDraw: function () { self.onNetDraw(); },
        onNetUndoReq: function () { self.onNetUndoReq(); },
        onNetRematch: function () { self.onNetRematch(); },
        onNetReqAccept: function () { self.onNetReqAccept(); },
        onNetReqDecline: function () { self.onNetReqDecline(); },
        onSendChat: function (t) { self.sendChat(t); }
      });
      if (XQ.Net) XQ.Net.init({
        onStatus: function (s) { self.onNetStatus(s); },
        onCreated: function (m) { self.onNetCreated(m); },
        onJoined: function (m) { self.onNetJoined(m); },
        onStart: function (m) { self.onNetStart(m); },
        onRemoteMove: function (m) { self.onRemoteMove(m); },
        onOpponentLeft: function (m) { self.onOpponentLeft(m); },
        onGameOver: function (m) { self.onGameOver(m); },
        onResigned: function (m) { self.onResigned(m); },
        onState: function (m) { self.onNetState(m); },
        onDrawOffer: function (m) { self.onNetDrawOffer(m); },
        onDrawDecline: function (m) { self.onNetDrawDecline(m); },
        onUndoRequest: function (m) { self.onNetUndoRequest(m); },
        onUndoDecline: function (m) { self.onNetUndoDecline(m); },
        onChat: function (m) { self.onChat(m); },
        onError: function (m) { self.onNetError(m); }
      });
      XQ.UI.setSoundLabel(!XQ.Audio.isMuted());
      this.newGame('pvp');
    },

    loadProgress: function () { return 0; },
    saveProgress: function () {},

    /* ---------- 模式与开局 ---------- */
    setMode: function (m) {
      this.mode = m;
      XQ.UI.setModeActive(m);
      XQ.UI.showPanel(m);
      if (m === 'pvp') this.newGame('pvp');
      else if (m === 'pvai') this.newGame('pvai');
      else if (m === 'endgame') {
        this.loadLevel(1);
      } else if (m === 'online') {
        this.enterOnline();
      }
    },

    newGame: function (mode) {
      this.mode = mode;
      this.board = new XQ.Board();
      this.turn = 'red';
      this.resetRound();
      this.message = mode === 'pvai'
        ? (this.humanSide === 'red' ? '你执红，先走' : '你执黑，等待对手')
        : '点击棋子开始对弈';
      this.render();
      this.maybeTriggerAI();
    },

    loadLevel: function (id) {
      var lv = XQ.ENDGAMES.filter(function (x) { return x.id === id; })[0];
      if (!lv) return;
      this.mode = 'endgame';
      XQ.UI.setModeActive('endgame');
      XQ.UI.showPanel('endgame');
      this.currentLevelId = id;
      this.board = new XQ.Board(XQ.buildEndgameBoard(lv.pieces));
      // 防守方固定大师级；玩家执红
      this.humanSide = 'red'; this.aiSide = 'black';
      this.turn = 'red';
      this.resetRound();
      this.message = '第' + id + '关 · ' + lv.name + '（红先胜）';
      this.messageType = '';
      this.render();
    },

    resetRound: function () {
      this.selected = null;
      this.legalTargets = null;
      this.legalMovesSelected = null;
      this.history = [];
      this.capturedRed = [];
      this.capturedBlack = [];
      this.lastMove = null;
      this.checkPos = null;
      this.gameOver = false;
      this.winner = null;
      this.banner = null;
      this.aiThinking = false;
      this.endReason = null;
      this.checkmateAudioPlayed = false;
      this.positions = [{ pos: XQ.boardKey(this.board), turn: this.turn }];
    },

    // 重连后依据重建的 history 重算 positions（保证重复局面判定不失效）
    rebuildPositions: function () {
      var b = new XQ.Board();
      this.positions = [{ pos: XQ.boardKey(b), turn: 'red' }];
      for (var i = 0; i < this.history.length; i++) {
        var h = this.history[i];
        b.move(h.move);
        var t = XQ.opponent(this.positions[this.positions.length - 1].turn);
        this.positions.push({ pos: XQ.boardKey(b), turn: t });
        h.pos = XQ.boardKey(b);
        h.turn = t;
        h.check = XQ.isInCheck(b, t);
      }
    },

    restart: function () {
      if (this.mode === 'online') {
        if (this.gameOver) { this.onNetRematch(); return; }
        this.message = '对局进行中：可认输、求和或悔棋；结束后再「再来一局」';
        this.messageType = 'alert';
        this.render();
        return;
      }
      if (this.mode === 'endgame' && this.currentLevelId) this.loadLevel(this.currentLevelId);
      else this.newGame(this.mode);
    },

    /* ---------- 联机对战 ---------- */
    enterOnline: function () {
      this.mode = 'online';
      XQ.UI.setModeActive('online');
      XQ.UI.showPanel('online');
      this.board = new XQ.Board();
      this.resetRound();
      this.onlineColor = null;
      this.onlineReady = false;
      this.onlineRoom = null;
      this.chatLog = [];
      this.message = '点击下方「创建房间」，或输入房间码后「加入房间」以开始';
      this.messageType = '';
      XQ.Net.connect();
      this.render();
    },

    onNetStatus: function (s) { XQ.UI.setOnlineStatus(s); },

    onNetCreate: function () { XQ.Net.createRoom(); },

    onNetJoin: function (code) {
      if (!code || !code.trim()) { this.message = '请输入房间码'; this.messageType = 'alert'; this.render(); return; }
      XQ.Net.joinRoom(code.trim());
    },

    onNetResign: function () {
      if (this.mode !== 'online' || !this.onlineReady) return;
      XQ.Net.resign();
      this.message = '你已认输';
      this.messageType = 'alert';
      this.render();
    },

    /* ---------- 求和 / 悔棋（双方确认） ---------- */
    onNetDraw: function () {
      if (this.mode !== 'online' || !this.onlineReady || this.gameOver) return;
      if (this.pendingOut) { this.message = '已发送请求，等待对方回应…'; this.render(); return; }
      this.pendingOut = 'draw';
      XQ.Net.drawOffer();
      this.message = '已发送和棋请求，等待对方同意…';
      this.messageType = 'alert';
      this.render();
    },

    onNetDrawOffer: function (m) {
      if (this.mode !== 'online') return;
      this.pendingIn = 'draw';
      this.render();
    },

    onNetDrawDecline: function (m) {
      if (this.mode !== 'online') return;
      this.pendingOut = null;
      this.message = '对方拒绝了和棋请求';
      this.messageType = 'alert';
      this.render();
    },

    onNetUndoReq: function () {
      if (this.mode !== 'online' || !this.onlineReady || this.gameOver) return;
      if (this.history.length === 0) { this.message = '暂无可悔棋步'; this.messageType = 'alert'; this.render(); return; }
      if (this.pendingOut) { this.message = '已发送请求，等待对方回应…'; this.render(); return; }
      this.pendingOut = 'undo';
      XQ.Net.undoRequest();
      this.message = '已发送悔棋请求，等待对方同意…';
      this.messageType = 'alert';
      this.render();
    },

    onNetUndoRequest: function (m) {
      if (this.mode !== 'online') return;
      this.pendingIn = 'undo';
      this.render();
    },

    onNetUndoDecline: function (m) {
      if (this.mode !== 'online') return;
      this.pendingOut = null;
      this.message = '对方拒绝了悔棋请求';
      this.messageType = 'alert';
      this.render();
    },

    // 收到对方请求后，本端点击「同意 / 拒绝」
    onNetReqAccept: function () {
      if (this.mode !== 'online' || !this.pendingIn) return;
      var kind = this.pendingIn;
      this.pendingIn = null;
      if (kind === 'draw') XQ.Net.drawAccept();
      else XQ.Net.undoAccept();
      this.message = (kind === 'draw') ? '已同意和棋' : '已同意悔棋';
      this.messageType = 'alert';
      this.render();
    },

    onNetReqDecline: function () {
      if (this.mode !== 'online' || !this.pendingIn) return;
      var kind = this.pendingIn;
      this.pendingIn = null;
      if (kind === 'draw') XQ.Net.drawDecline();
      else XQ.Net.undoDecline();
      this.message = (kind === 'draw') ? '已拒绝和棋' : '已拒绝悔棋';
      this.messageType = 'alert';
      this.render();
    },

    onNetRematch: function () {
      if (this.mode !== 'online' || !this.gameOver) return;
      XQ.Net.rematch();
      this.message = '已请求再来一局，等待对手…';
      this.messageType = 'alert';
      this.render();
    },

    // 服务端下发的全量状态（断线重连 / 悔棋回滚后恢复棋盘）
    onNetState: function (st) {
      if (this.mode !== 'online') return;
      this.applyOnlineState(st);
      this.rebuildPositions();
      var label;
      if (st.appliedUndo) label = '悔棋成功，已撤回上一步';
      else if (st.resumed) label = '已恢复对局';
      else label = '对局开始';
      this.message = st.ready ? (label + '，' + (this.turn === this.onlineColor ? '轮到你走' : '等待对手')) : '已恢复棋盘，等待对手加入…';
      this.messageType = '';
      this.gameOver = false; this.winner = null; this.banner = null;
      this.render();
    },

    applyOnlineState: function (st) {
      var self = this;
      this.board = new XQ.Board();
      for (var r = 0; r < 10; r++) {
        for (var c = 0; c < 9; c++) {
          var ch = st.board[r][c];
          if (ch) this.board.set(r, c, { side: ch[0] === 'r' ? 'red' : 'black', type: ch[1] });
        }
      }
      this.turn = st.turn;
      this.history = (st.history || []).map(function (h) {
        var fromPiece = h.piece ? { side: h.piece[0] === 'r' ? 'red' : 'black', type: h.piece[1] } : null;
        return {
          move: { from: h.from, to: h.to },
          captured: null,
          side: h.side,
          text: self.notation({ from: h.from, to: h.to }, h.side, fromPiece)
        };
      });
      this.capturedRed = (st.capturedRed || []).filter(Boolean).map(function (p) { return { side: 'black', type: p[1] }; });
      this.capturedBlack = (st.capturedBlack || []).filter(Boolean).map(function (p) { return { side: 'red', type: p[1] }; });
      this.lastMove = this.history.length
        ? { from: this.history[this.history.length - 1].move.from, to: this.history[this.history.length - 1].move.to }
        : null;
      this.checkPos = XQ.isInCheck(this.board, this.turn) ? this.board.findKing(this.turn) : null;
      this.onlineReady = !!st.ready;
      this.clearSelection();
    },

    onNetCreated: function (m) {
      this.onlineColor = 'red';
      this.onlineRoom = m.room;
      this.chatLog = [];
      XQ.UI.showRoomCode(m.room);
      this.message = '房间已创建：' + m.room + '，等待对手加入…';
      this.messageType = '';
      this.render();
    },

    onNetJoined: function (m) {
      this.onlineColor = 'black';
      this.onlineRoom = m.room;
      this.chatLog = [];
      XQ.UI.showRoomCode(m.room);
      this.message = '已加入房间 ' + m.room + '，等待开局…';
      this.messageType = '';
      this.render();
    },

    onNetStart: function (m) {
      this.onlineColor = m.color;
      this.onlineReady = true;
      this.board = new XQ.Board();
      this.turn = 'red';
      this.resetRound();
      this.message = (this.onlineColor === 'red') ? '你执红，先走' : '你执黑，等待对手';
      this.messageType = '';
      this.render();
    },

    onRemoteMove: function (m) {
      if (!this.onlineReady) return;
      // 任一步走子后，悬而未决的求和/悔棋请求作废
      this.pendingOut = null;
      this.pendingIn = null;
      this.applyMove({ from: m.from, to: m.to }, { remote: true });
      this.render();
    },

    onOpponentLeft: function () {
      this.onlineReady = false;
      this.pendingOut = null;
      this.pendingIn = null;
      this.message = '对手已离开。可凭房间码 ' + (this.onlineRoom || '----') + ' 重新连回本局，或等待其返回。';
      this.messageType = 'alert';
      this.render();
    },

    onGameOver: function (m) {
      if (this.gameOver) return;
      this.gameOver = true;
      this.winner = m.winner;
      this.endReason = null;
      this.handleEnd();
      this.render();
    },

    onResigned: function (m) {
      if (this.gameOver) return;
      this.gameOver = true;
      this.winner = m.winner;
      this.endReason = null;
      this.handleEnd();
      this.render();
    },

    onNetError: function (m) {
      this.message = (m && m.msg) ? m.msg : '网络错误';
      this.messageType = 'alert';
      this.render();
    },

    /* ---------- 联机聊天 ---------- */
    onChat: function (m) {
      if (this.mode !== 'online') return;
      this.chatLog.push({ side: m.from, text: String(m.text || '') });
      this.render();
    },

    sendChat: function (text) {
      if (this.mode !== 'online') return;
      text = String(text || '').trim();
      if (!text) return;
      text = text.slice(0, 200);
      // 本地先显示自己的消息（服务端只把消息中继给对手，不会回送自己）
      this.chatLog.push({ side: this.onlineColor || 'red', text: text, self: true });
      if (XQ.Net) XQ.Net.sendChat(text);
      this.render();
    },

    /* ---------- 交互 ---------- */
    isHumanTurn: function () {
      if (this.mode === 'pvp') return true;
      if (this.mode === 'online') return this.onlineReady && this.turn === this.onlineColor;
      return this.turn === this.humanSide;
    },

    onSquareClick: function (r, c) {
      if (this.gameOver || this.aiThinking) return;
      if (this.mode === 'online' && !this.onlineReady) { this.clearSelection(); this.render(); return; }
      if (r == null) { this.clearSelection(); this.render(); return; }

      if (this.selected) {
        var key = r + ',' + c;
        if (this.legalTargets && this.legalTargets.has(key)) {
          this.doHumanMove({ from: this.selected, to: { r: r, c: c } });
          return;
        }
      }
      var p = this.board.get(r, c);
      if (p && p.side === this.turn && this.isHumanTurn()) {
        this.selected = { r: r, c: c };
        this.computeTargets();
      } else {
        this.clearSelection();
      }
      this.render();
    },

    clearSelection: function () {
      this.selected = null;
      this.legalTargets = null;
      this.legalMovesSelected = null;
    },

    computeTargets: function () {
      var all = XQ.legalMoves(this.board, this.turn);
      var set = new Set();
      var list = [];
      for (var i = 0; i < all.length; i++) {
        var m = all[i];
        if (m.from.r === this.selected.r && m.from.c === this.selected.c) {
          set.add(m.to.r + ',' + m.to.c);
          list.push(m);
        }
      }
      this.legalTargets = set;
      this.legalMovesSelected = list;
    },

    doHumanMove: function (move) {
      this.applyMove(move, { local: true });
      this.maybeTriggerAI();
      this.render();
    },

    /* ---------- 行棋与判定 ---------- */
    applyMove: function (move, opts) {
      opts = opts || {};
      var side = this.turn;
      var fromPiece = this.board.get(move.from.r, move.from.c);
      var captured = this.board.move(move);
      this.history.push({
        move: { from: { r: move.from.r, c: move.from.c }, to: { r: move.to.r, c: move.to.c } },
        captured: captured, side: side, text: this.notation(move, side, fromPiece)
      });
      if (captured) {
        if (captured.side === 'black') this.capturedRed.push(captured);
        else this.capturedBlack.push(captured);
      }
      this.lastMove = { from: { r: move.from.r, c: move.from.c }, to: { r: move.to.r, c: move.to.c } };
      XQ.Audio.play(captured ? 'capture' : 'move');
      XQ.UI.impactAt(move.to.r, move.to.c, captured ? 'capture' : 'move');
      this.turn = XQ.opponent(this.turn);
      this.history[this.history.length - 1].check = XQ.isInCheck(this.board, this.turn);
      this.positions.push({ pos: XQ.boardKey(this.board), turn: this.turn });
      if (this.mode === 'online' && opts.local && XQ.Net) XQ.Net.sendMove(move);
      this.clearSelection();
      this.updateCheckAndEnd();
    },

    updateCheckAndEnd: function () {
      var inChk = XQ.isInCheck(this.board, this.turn);
      this.checkPos = inChk ? this.board.findKing(this.turn) : null;
      var res = XQ.getResult(this.board, this.turn);
      if (res.over) {
        this.gameOver = true;
        this.winner = res.winner;
        this.endReason = res.reason;
        this.handleEnd();
        return;
      }
      var rep = XQ.analyzeRepetition(this.positions, this.history);
      if (rep) {
        this.gameOver = true;
        if (rep.result === 'perpetual-check') {
          this.winner = XQ.opponent(rep.loser);
          this.endReason = 'perpetual-check';
        } else {
          this.winner = 'draw';
          this.endReason = 'draw';
        }
        this.handleEnd();
        return;
      } else if (inChk) {
        this.message = '将军！';
        this.messageType = 'alert';
        XQ.Audio.play('check');
      } else {
        this.message = (this.turn === 'red' ? '红方' : '黑方') + '行棋';
        this.messageType = '';
      }
    },

    handleEnd: function () {
      var w = this.winner;
      if (w === 'draw') {
        this.banner = { title: '和 棋', sub: '重复局面，判和' };
        XQ.Audio.play('win');
        return;
      }
      var title, sub, win = false;
      if (this.mode === 'endgame') {
        if (w === 'red') { title = '过 关 !'; sub = '第' + this.currentLevelId + '关 通关'; win = true; }
        else { title = '惜 败'; sub = '再接再厉，重来一局'; }
      } else if (this.mode === 'pvai') {
        if (w === this.humanSide) { title = '你 赢 了 !'; sub = '击败了' + this.diffName() + '对手'; win = true; }
        else { title = '你 输 了'; sub = '再战一局？'; }
      } else {
        if (w === 'draw') { title = '和 棋'; sub = '握手言和'; win = true; }
        else { title = (w === 'red' ? '红方胜 !' : '黑方胜 !'); sub = '点击重新开始'; win = true; }
      }
      this.banner = { title: title, sub: sub };
      // 绝杀结算：仅当「被将死/困毙」(no-moves) 且本局尚未播放过时播放曼巴熬音频，否则用合成音
      if (this.endReason === 'no-moves' && !this.checkmateAudioPlayed) {
        XQ.Audio.play('checkmate');
        this.checkmateAudioPlayed = true;
      } else {
        XQ.Audio.play(win ? 'win' : 'lose');
      }
    },

    diffName: function () {
      return this.difficulty === 'easy' ? '入门' : this.difficulty === 'hard' ? '大师' : '进阶';
    },

    maybeTriggerAI: function () {
      if (this.gameOver) return;
      var aiTurn = (this.mode === 'pvai' && this.turn === this.aiSide) ||
                   (this.mode === 'endgame' && this.turn === 'black');
      if (aiTurn) this.runAI();
    },

    runAI: function () {
      var self = this;
      this.aiThinking = true;
      this.message = '对手思考中…';
      this.messageType = 'alert';
      this.render();
      setTimeout(function () {
        var diff = self.mode === 'endgame' ? 'hard' : self.difficulty;
        var res = XQ.aiBestMove(self.board, self.aiSide, diff);
        self.aiThinking = false;
        if (!res) return; // 理论上不会发生
        self.applyMove(res.move);
        self.render();
        // 残局/人机中 AI 走完通常轮到人类；若链式则再触发
        self.maybeTriggerAI();
      }, 40);
    },

    /* ---------- 悔棋 ---------- */
    undo: function () {
      if (this.mode === 'online') {
        this.onNetUndoReq();
        return;
      }
      if (this.history.length === 0) return;
      this.undoOnePly();
      // 人机/残局：若撤销后轮到 AI，再撤一着回到人类回合
      if ((this.mode === 'pvai' || this.mode === 'endgame') && this.turn === this.aiSide && this.history.length > 0) {
        this.undoOnePly();
      }
      this.gameOver = false; this.winner = null; this.banner = null;
      this.checkPos = null;
      this.message = (this.turn === 'red' ? '红方' : '黑方') + '行棋';
      this.messageType = '';
      this.clearSelection();
      this.render();
    },

    undoOnePly: function () {
      var e = this.history.pop();
      var m = e.move;
      var piece = this.board.get(m.to.r, m.to.c);
      this.board.set(m.from.r, m.from.c, piece);
      this.board.set(m.to.r, m.to.c, e.captured || null);
      this.turn = e.side;
      if (e.captured) {
        if (e.captured.side === 'black') this.capturedRed.pop();
        else this.capturedBlack.pop();
      }
      this.lastMove = this.history.length
        ? this.history[this.history.length - 1].move : null;
    },

    /* ---------- 记谱 ---------- */
    notation: function (move, side, fromPiece) {
      var p = fromPiece;
      var type = p.type;
      var pname = XQ.CHAR[side][type];
      var fc = side === 'red' ? 9 - move.from.c : move.from.c + 1;
      var tc = side === 'red' ? 9 - move.to.c : move.to.c + 1;
      var txt;
      if (move.from.r === move.to.r) {
        txt = pname + fc + '平' + tc;
      } else {
        var forward = side === 'red' ? (move.to.r < move.from.r) : (move.to.r > move.from.r);
        var verb = forward ? '进' : '退';
        var dest;
        if (type === 'H' || type === 'E' || type === 'A') dest = tc; // 斜走→落点所在线
        else dest = side === 'red' ? 10 - move.to.r : move.to.r + 1;   // 直走→落点所在格
        txt = pname + fc + verb + dest;
      }
      return txt;
    },

    toggleSound: function () {
      var m = XQ.Audio.toggle();
      XQ.UI.setSoundLabel(!m);
    },

    /* ---------- 渲染 ---------- */
    levelList: function () {
      if (this.mode !== 'endgame') return null;
      return XQ.ENDGAMES.map(function (L) {
        return { id: L.id, name: L.name, active: L.id === this.currentLevelId };
      }, this);
    },

    render: function () {
      XQ.UI.render({
        board: this.board,
        selected: this.selected,
        legalTargets: this.legalTargets,
        lastMove: this.lastMove,
        checkPos: this.checkPos,
        turn: this.turn,
        mode: this.mode,
        gameOver: this.gameOver,
        message: this.message,
        messageType: this.messageType,
        history: this.history.map(function (h) {
          return { text: (h.side === 'red' ? '红 ' : '黑 ') + h.text, side: h.side };
        }),
        capturedRed: this.capturedRed,
        capturedBlack: this.capturedBlack,
        levels: this.levelList(),
        banner: this.banner,
        chatLog: this.chatLog,
        online: {
          room: this.onlineRoom,
          ready: this.onlineReady,
          pendingOut: this.pendingOut,
          pendingIn: this.pendingIn
        }
      });
    }
  };

  XQ.game = game;

})(typeof window !== 'undefined' ? window : globalThis);
