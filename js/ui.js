/* ui.js — 棋盘 SVG 绘制、棋子渲染、点击交互、侧栏与高亮
 * 暴露 XQ.UI 给 game.js 调用。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var PAD = 30, CELL = 56, PIECE = 48;

  function pos(r, c) { return { x: PAD + c * CELL, y: PAD + r * CELL }; }
  XQ.uiPos = pos;

  // 将鼠标/触摸坐标映射到最近的棋位（稳健吸附：点哪格算哪格，不依赖命中微小落点）
  function cellFromEvent(e) {
    var rect = el.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var W = 8 * CELL + 2 * PAD, H = 9 * CELL + 2 * PAD;
    var scaleX = rect.width / W, scaleY = rect.height / H;
    var x = (e.clientX - rect.left) / scaleX;
    var y = (e.clientY - rect.top) / scaleY;
    var c = Math.round((x - PAD) / CELL);
    var r = Math.round((y - PAD) / CELL);
    if (r < 0 || r > 9 || c < 0 || c > 8) return null;
    return { r: r, c: c };
  }
  XQ.cellFromEvent = cellFromEvent;

  var el = {}; // 缓存的 DOM 引用
  var handlers = {};

  function $(id) { return document.getElementById(id); }

  XQ.UI = {
    init: function (h) {
      handlers = h || {};
      el.board = $('board');
      el.svg = $('board-svg');
      el.pieces = $('pieces');
      el.dots = $('dots');
      el.overlays = $('overlays');
      el.pieceNodes = {};
      el.banner = $('banner');
      el.turnText = $('turn-text');
      el.turnDot = el.board.parentNode.querySelector('.turn-dot'); // 备用
      el.turnIndicator = $('turn-indicator');
      el.message = $('message');
      el.history = $('history');
      el.capRed = $('cap-red');
      el.capBlack = $('cap-black');
      el.levels = $('levels');
      el.modeSeg = $('mode-seg');
      el.diffSeg = $('diff-seg');
      el.sideSeg = $('side-seg');
      el.pvaiPanel = $('pvai-panel');
      el.endgamePanel = $('endgame-panel');
      el.btnUndo = $('btn-undo');
      el.btnRestart = $('btn-restart');
      el.btnSound = $('btn-sound');
      el.themeSeg = $('theme-seg');
      el.onlinePanel = $('online-panel');
      el.onlineCode = $('online-code');
      el.onlineJoinInput = $('online-join');
      el.btnCreate = $('btn-create');
      el.btnJoin = $('btn-join');
      el.btnResign = $('btn-resign');
      el.onlineStatus = $('online-status');

      this.buildSVG();

      // 点击委托：基于坐标映射到最近棋位（稳健吸附，点哪格算哪格）
      el.board.addEventListener('click', function (e) {
        var cell = cellFromEvent(e);
        if (handlers.onSquareClick) handlers.onSquareClick(cell ? cell.r : null, cell ? cell.c : null);
      });

      // 分段按钮
      bindSeg(el.modeSeg, 'mode', handlers.onMode);
      bindSeg(el.diffSeg, 'diff', handlers.onDiff);
      bindSeg(el.sideSeg, 'side', handlers.onSide);

      var self = this;
      bindSeg(el.themeSeg, 'theme', function (theme) { self.setTheme(theme); });
      this.loadTheme();

      el.btnUndo.addEventListener('click', function () { if (handlers.onUndo) handlers.onUndo(); });
      el.btnRestart.addEventListener('click', function () { if (handlers.onRestart) handlers.onRestart(); });
      el.btnSound.addEventListener('click', function () { if (handlers.onToggleSound) handlers.onToggleSound(); });

      // 联机按钮
      if (el.btnCreate) el.btnCreate.addEventListener('click', function () { if (handlers.onNetCreate) handlers.onNetCreate(); });
      if (el.btnJoin) el.btnJoin.addEventListener('click', function () {
        if (handlers.onNetJoin) handlers.onNetJoin(el.onlineJoinInput ? el.onlineJoinInput.value : '');
      });
      if (el.btnResign) el.btnResign.addEventListener('click', function () { if (handlers.onNetResign) handlers.onNetResign(); });
    },

    buildSVG: function () {
      var W = 8 * CELL + 2 * PAD, H = 9 * CELL + 2 * PAD;
      var s = '';
      function line(x1, y1, x2, y2, w, op) {
        var col = op >= 0.8 ? 'var(--line)' : 'var(--line-soft)';
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
          '" stroke="' + col + '" stroke-width="' + w + '"/>';
      }
      // 外框
      s += line(PAD, PAD, W - PAD, PAD, 2.4, 0.85);
      s += line(PAD, H - PAD, W - PAD, H - PAD, 2.4, 0.85);
      s += line(PAD, PAD, PAD, H - PAD, 2.4, 0.85);
      s += line(W - PAD, PAD, W - PAD, H - PAD, 2.4, 0.85);
      // 横线 10 条
      for (var r = 0; r < 10; r++) {
        var y = PAD + r * CELL;
        s += line(PAD, y, W - PAD, y, 1.2, 0.7);
      }
      // 竖线 9 条（河界处断开：分两段）
      for (var c = 0; c < 9; c++) {
        var x = PAD + c * CELL;
        s += line(x, PAD, x, PAD + 4 * CELL, 1.2, 0.7);
        s += line(x, PAD + 5 * CELL, x, H - PAD, 1.2, 0.7);
      }
      // 九宫斜线
      function diag(r1, c1, r2, c2) {
        var a = pos(r1, c1), b = pos(r2, c2);
        return line(a.x, a.y, b.x, b.y, 1.2, 0.7);
      }
      s += diag(0, 3, 2, 5); s += diag(0, 5, 2, 3);     // 黑宫
      s += diag(7, 3, 9, 5); s += diag(7, 5, 9, 3);     // 红宫

      // 河界文字
      var riverY = PAD + 4.5 * CELL;
      s += '<text x="' + (PAD + 1.2 * CELL) + '" y="' + riverY + '" fill="var(--river-text)" font-family="STKaiti,KaiTi,楷体,serif" font-size="26" font-weight="700">楚 河</text>';
      s += '<text x="' + (PAD + 5.0 * CELL) + '" y="' + riverY + '" fill="var(--river-text)" font-family="STKaiti,KaiTi,楷体,serif" font-size="26" font-weight="700">漢 界</text>';

      el.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      el.svg.innerHTML = s;
    },

    render: function (st) {
      this.renderPieces(st);
      this.renderDots(st);

      // 行棋方
      el.turnText.textContent = (st.turn === 'red' ? '红方' : '黑方') + '行棋';
      var dot = el.turnIndicator.querySelector('.turn-dot');
      if (dot) dot.className = 'turn-dot ' + st.turn;

      // 消息
      el.message.textContent = st.message || '';
      el.message.className = 'message' + (st.messageType ? ' ' + st.messageType : '');

      this.renderHistory(st);
      this.renderCaptured(st);
      this.renderLevels(st);

      // 横幅
      if (st.banner) {
        el.banner.classList.remove('hidden');
        el.banner.innerHTML = '<div class="big">' + st.banner.title + '</div>' + (st.banner.sub ? '<div class="sub">' + st.banner.sub + '</div>' : '');
      } else {
        el.banner.classList.add('hidden');
      }
    },

    // 棋子：增量协调（不每次全量重建 DOM，消除卡顿）
    renderPieces: function (st) {
      if (this._boardRef !== st.board) {
        this._boardRef = st.board;
        el.pieces.innerHTML = '';
        el.pieceNodes = {};
      }
      var grid = st.board.grid;
      var seen = {};
      for (var r = 0; r < 10; r++) {
        for (var c = 0; c < 9; c++) {
          var p = grid[r][c];
          if (!p) continue;
          var key = r + ',' + c;
          seen[key] = true;
          var node = el.pieceNodes[key];
          if (!node) {
            node = document.createElement('div');
            node.dataset.r = r; node.dataset.c = c;
            el.pieces.appendChild(node);
            el.pieceNodes[key] = node;
          }
          var xy = pos(r, c);
          var cls = 'piece ' + p.side;
          if (st.selected && st.selected.r === r && st.selected.c === c) cls += ' selected';
          if (st.lastMove) {
            if (st.lastMove.from.r === r && st.lastMove.from.c === c) cls += ' lastmove';
            if (st.lastMove.to.r === r && st.lastMove.to.c === c) cls += ' lastmove landed';
          }
          if (st.checkPos && st.checkPos.r === r && st.checkPos.c === c) cls += ' in-check';
          node.className = cls;
          node.textContent = XQ.CHAR[p.side][p.type];
          node.style.left = (xy.x - PIECE / 2) + 'px';
          node.style.top = (xy.y - PIECE / 2) + 'px';
        }
      }
      for (var k in el.pieceNodes) {
        if (!seen[k]) {
          var n = el.pieceNodes[k];
          if (n.parentNode) n.parentNode.removeChild(n);
          delete el.pieceNodes[k];
        }
      }
    },

    // 合法落点：独立图层，随选择高频刷新（元素极少，开销可忽略）
    renderDots: function (st) {
      if (!el.dots) return;
      if (!st.legalTargets || !st.legalTargets.size) { el.dots.innerHTML = ''; return; }
      var html = '';
      st.legalTargets.forEach(function (key) {
        var parts = key.split(',');
        var rr = +parts[0], cc = +parts[1];
        var xy = pos(rr, cc);
        var occupied = st.board.grid[rr][cc];
        var dcls = occupied ? 'dot capture' : 'dot';
        html += '<div class="' + dcls + '" style="left:' + xy.x + 'px;top:' + xy.y + 'px"></div>';
      });
      el.dots.innerHTML = html;
    },

    // 着法记录：仅变化时才重建
    renderHistory: function (st) {
      var sig = st.history.length + ':' + (st.history.length ? st.history[st.history.length - 1].text : '');
      if (this._histSig === sig) return;
      this._histSig = sig;
      var h = '';
      st.history.forEach(function (m) { h += '<li class="' + m.side + '">' + m.text + '</li>'; });
      el.history.innerHTML = h;
    },

    // 俘获：仅数量变化时才重建
    renderCaptured: function (st) {
      var sig = st.capturedRed.length + ',' + st.capturedBlack.length;
      if (this._capSig === sig) return;
      this._capSig = sig;
      el.capRed.innerHTML = st.capturedRed.map(function (p) { return '<span class="' + p.side + '">' + XQ.CHAR[p.side][p.type] + '</span>'; }).join('');
      el.capBlack.innerHTML = st.capturedBlack.map(function (p) { return '<span class="' + p.side + '">' + XQ.CHAR[p.side][p.type] + '</span>'; }).join('');
    },

    // 关卡：仅首次绑定监听，之后只切换高亮
    renderLevels: function (st) {
      if (!st.levels) return;
      if (!this._lvlBound) {
        var lv = '';
        st.levels.forEach(function (L) {
          lv += '<button class="lvl' + (L.active ? ' active' : '') + '" data-level="' + L.id + '">' + L.id + '</button>';
        });
        el.levels.innerHTML = lv;
        Array.prototype.forEach.call(el.levels.querySelectorAll('.lvl'), function (btn) {
          btn.addEventListener('click', function () {
            if (handlers.onLevelClick) handlers.onLevelClick(parseInt(btn.dataset.level, 10));
          });
        });
        this._lvlBound = true;
      } else {
        Array.prototype.forEach.call(el.levels.querySelectorAll('.lvl'), function (btn, i) {
          btn.classList.toggle('active', st.levels[i] && st.levels[i].active);
        });
      }
    },

    setThinking: function (on) {
      if (on) { el.message.textContent = '对手思考中…'; el.message.className = 'message alert'; }
    },

    // 切换面板可见性
    showPanel: function (name) {
      el.pvaiPanel.classList.toggle('hidden', name !== 'pvai');
      el.endgamePanel.classList.toggle('hidden', name !== 'endgame');
      if (el.onlinePanel) el.onlinePanel.classList.toggle('hidden', name !== 'online');
    },

    setSoundLabel: function (on) {
      el.btnSound.textContent = '声音：' + (on ? '开' : '关');
    },

    setModeActive: function (mode) {
      Array.prototype.forEach.call(el.modeSeg.children, function (b) {
        b.classList.toggle('active', b.dataset.mode === mode);
      });
    },
    setDiffActive: function (d) {
      Array.prototype.forEach.call(el.diffSeg.children, function (b) {
        b.classList.toggle('active', b.dataset.diff === d);
      });
    },
    setSideActive: function (s) {
      Array.prototype.forEach.call(el.sideSeg.children, function (b) {
        b.classList.toggle('active', b.dataset.side === s);
      });
    },

    /* ---------- 联机状态显示 ---------- */
    setOnlineStatus: function (text) {
      if (el.onlineStatus) el.onlineStatus.textContent = text || '';
    },
    showRoomCode: function (code) {
      if (el.onlineCode) el.onlineCode.textContent = code || '----';
    },

    /* ---------- 主题 ---------- */
    setTheme: function (name) {
      document.body.className = 'theme-' + name;
      try { localStorage.setItem('xq_theme', name); } catch (e) {}
      if (el.themeSeg) {
        Array.prototype.forEach.call(el.themeSeg.children, function (b) {
          b.classList.toggle('active', b.dataset.theme === name);
        });
      }
    },
    loadTheme: function () {
      var name = 'lacquer';
      try { name = localStorage.getItem('xq_theme') || 'lacquer'; } catch (e) {}
      this.setTheme(name);
    },

    /* ---------- 打击感反馈 ---------- */
    impactAt: function (r, c, type) {
      if (!el.overlays) return;
      var xy = pos(r, c);
      var div = document.createElement('div');
      div.className = 'impact-ring impact-' + (type || 'move');
      div.style.left = xy.x + 'px';
      div.style.top = xy.y + 'px';
      el.overlays.appendChild(div);
      var remove = function () { if (div.parentNode) div.parentNode.removeChild(div); };
      div.addEventListener('animationend', remove);
      setTimeout(remove, 500);
    }
  };

  function bindSeg(container, attr, cb) {
    if (!container) return;
    Array.prototype.forEach.call(container.children, function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(container.children, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        if (cb) cb(b.dataset[attr]);
      });
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
