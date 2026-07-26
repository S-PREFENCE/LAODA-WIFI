/* rules.js — 走法生成、将军检测、合法性（含飞将）、胜负判定 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  function enemyAt(board, tr, tc, bySide) {
    var p = board.grid[tr][tc];
    return p && p.side === bySide;
  }

  // 攻击判定用：目标格可落子/攻击 = 空格或不是攻击方自己的子（含敌王）
  function landable(board, tr, tc, bySide) {
    var p = board.grid[tr][tc];
    return !p || p.side !== bySide;
  }

  function pathClear(board, r, c, tr, tc) {
    var dr = Math.sign(tr - r), dc = Math.sign(tc - c);
    var rr = r + dr, cc = c + dc;
    while (rr !== tr || cc !== tc) {
      if (board.grid[rr][cc]) return false;
      rr += dr; cc += dc;
    }
    return true;
  }

  function countBetween(board, r, c, tr, tc) {
    var dr = Math.sign(tr - r), dc = Math.sign(tc - c);
    var n = 0, rr = r + dr, cc = c + dc;
    while (rr !== tr || cc !== tc) {
      if (board.grid[rr][cc]) n++;
      rr += dr; cc += dc;
    }
    return n;
  }

  // 某子 (r,c) 是否攻击 (tr,tc)
  XQ.attacksSquare = function (board, r, c, tr, tc, type, side) {
    if (!board.inBoard(tr, tc)) return false;
    var dr = tr - r, dc = tc - c;
    var t = board.grid[tr][tc];

    switch (type) {
      case 'R': // 车：同线、路径空、目标可落（空格或敌子/敌王）
        if (r !== tr && c !== tc) return false;
        return pathClear(board, r, c, tr, tc) && landable(board, tr, tc, side);
      case 'C': // 炮：同线、中间恰一子（炮架）、目标可落
        if (r !== tr && c !== tc) return false;
        return countBetween(board, r, c, tr, tc) === 1 && landable(board, tr, tc, side);
      case 'H': { // 马：日字 + 蹩马腿
        var ad = Math.abs(dr), bd = Math.abs(dc);
        if (!((ad === 2 && bd === 1) || (ad === 1 && bd === 2))) return false;
        var lr, lc;
        if (ad === 2) { lr = r + dr / 2; lc = c; } else { lr = r; lc = c + dc / 2; }
        if (board.grid[lr][lc]) return false; // 蹩马腿
        return landable(board, tr, tc, side);
      }
      case 'E': { // 象：田字 + 象眼 + 不过河
        if (Math.abs(dr) !== 2 || Math.abs(dc) !== 2) return false;
        var er = r + dr / 2, ec = c + dc / 2;
        if (board.grid[er][ec]) return false; // 塞象眼
        if (side === 'red' && tr < 5) return false;   // 红象不过河
        if (side === 'black' && tr > 4) return false; // 黑象不过河
        return landable(board, tr, tc, side);
      }
      case 'A': // 士：九宫斜一步
        if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return false;
        if (!board.inPalace(side, tr, tc)) return false;
        return landable(board, tr, tc, side);
      case 'K': // 将：九宫直一步（飞将的“攻击”由 kingsFace 处理，不在此）
        if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
        if (!board.inPalace(side, tr, tc)) return false;
        return landable(board, tr, tc, side);
      case 'P': { // 兵：向前一步；过河后可横一步；永不后退
        var fwd = side === 'red' ? -1 : 1;
        if (dr === fwd && dc === 0) return landable(board, tr, tc, side);
        if (dc !== 0) {
          if (Math.abs(dc) !== 1 || dr !== 0) return false;
          if (!board.crossedRiver(side, r)) return false; // 未过河不能横走
          return landable(board, tr, tc, side);
        }
        return false;
      }
    }
    return false;
  };

  // 某点是否被 bySide 攻击
  XQ.isAttacked = function (board, r, c, bySide) {
    for (var rr = 0; rr < 10; rr++)
      for (var cc = 0; cc < 9; cc++) {
        var p = board.grid[rr][cc];
        if (p && p.side === bySide) {
          if (XQ.attacksSquare(board, rr, cc, r, c, p.type, bySide)) return true;
        }
      }
    return false;
  };

  XQ.isInCheck = function (board, side) {
    var k = board.findKing(side);
    if (!k) return false;
    return XQ.isAttacked(board, k.r, k.c, XQ.opponent(side));
  };

  // 枚举某子的伪合法走法（目标为空格或敌子，含各子规则，但不检查己方被将/飞将）
  function genPieceMoves(board, r, c, out) {
    var p = board.grid[r][c];
    var side = p.side;
    function add(tr, tc) {
      if (!board.inBoard(tr, tc)) return;
      var t = board.grid[tr][tc];
      if (t && t.side === side) return; // 己方子阻挡
      out.push({ from: { r: r, c: c }, to: { r: tr, c: tc }, capture: !!t });
    }
    var i, dr, dc, tr, tc, lr, lc, er, ec;
    switch (p.type) {
      case 'R':
        var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (i = 0; i < 4; i++) {
          dr = dirs[i][0]; dc = dirs[i][1];
          tr = r + dr; tc = c + dc;
          while (board.inBoard(tr, tc)) {
            var t = board.grid[tr][tc];
            if (!t) { add(tr, tc); }
            else { if (t.side !== side) add(tr, tc); break; }
            tr += dr; tc += dc;
          }
        }
        break;
      case 'C':
        var cdirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (i = 0; i < 4; i++) {
          dr = cdirs[i][0]; dc = cdirs[i][1];
          tr = r + dr; tc = c + dc;
          var screen = false;
          while (board.inBoard(tr, tc)) {
            var tt = board.grid[tr][tc];
            if (!screen) {
              if (!tt) add(tr, tc);
              else screen = true;
            } else {
              if (tt) { if (tt.side !== side) add(tr, tc); break; }
            }
            tr += dr; tc += dc;
          }
        }
        break;
      case 'H':
        var hm = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (i = 0; i < 8; i++) {
          dr = hm[i][0]; dc = hm[i][1];
          tr = r + dr; tc = c + dc;
          if (!board.inBoard(tr, tc)) continue;
          if (Math.abs(dr) === 2) { lr = r + dr / 2; lc = c; }
          else { lr = r; lc = c + dc / 2; }
          if (board.grid[lr][lc]) continue; // 蹩马腿
          add(tr, tc);
        }
        break;
      case 'E':
        var em = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
        for (i = 0; i < 4; i++) {
          dr = em[i][0]; dc = em[i][1];
          tr = r + dr; tc = c + dc;
          if (!board.inBoard(tr, tc)) continue;
          if (side === 'red' && tr < 5) continue;
          if (side === 'black' && tr > 4) continue;
          er = r + dr / 2; ec = c + dc / 2;
          if (board.grid[er][ec]) continue; // 塞象眼
          add(tr, tc);
        }
        break;
      case 'A':
        var am = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (i = 0; i < 4; i++) {
          tr = r + am[i][0]; tc = c + am[i][1];
          if (!board.inBoard(tr, tc)) continue;
          if (!board.inPalace(side, tr, tc)) continue;
          add(tr, tc);
        }
        break;
      case 'K':
        var km = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (i = 0; i < 4; i++) {
          tr = r + km[i][0]; tc = c + km[i][1];
          if (!board.inBoard(tr, tc)) continue;
          if (!board.inPalace(side, tr, tc)) continue;
          add(tr, tc);
        }
        break;
      case 'P':
        var fwd = side === 'red' ? -1 : 1;
        add(r + fwd, c); // 前进
        if (board.crossedRiver(side, r)) { add(r, c - 1); add(r, c + 1); }
        break;
    }
  }

  XQ.pseudoMoves = function (board, side) {
    var out = [];
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++) {
        var p = board.grid[r][c];
        if (p && p.side === side) genPieceMoves(board, r, c, out);
      }
    return out;
  };

  // 应用一步（返回新棋盘，不修改原盘）
  XQ.applyMove = function (board, m) {
    var b = board.clone();
    var p = b.grid[m.from.r][m.from.c];
    b.grid[m.to.r][m.to.c] = p;
    b.grid[m.from.r][m.from.c] = null;
    return b;
  };

  // 原地应用，返回被吃子或 null（供游戏控制器使用）
  XQ.Board.prototype.move = function (m) {
    var captured = this.grid[m.to.r][m.to.c];
    var p = this.grid[m.from.r][m.from.c];
    this.grid[m.to.r][m.to.c] = p;
    this.grid[m.from.r][m.from.c] = null;
    return captured;
  };

  // 合法走法：伪合法 + 过滤“己方被将”与“飞将照面”
  // 采用就地落子/撤销，避免每步克隆棋盘，显著提升搜索速度。
  XQ.legalMoves = function (board, side) {
    var pseudo = XQ.pseudoMoves(board, side);
    var legal = [];
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      var fr = m.from.r, fc = m.from.c, tr = m.to.r, tc = m.to.c;
      var moving = board.grid[fr][fc];
      var captured = board.grid[tr][tc];
      // 落子
      board.grid[tr][tc] = moving;
      board.grid[fr][fc] = null;
      var bad = XQ.isInCheck(board, side) || board.kingsFace();
      // 撤销
      board.grid[fr][fc] = moving;
      board.grid[tr][tc] = captured;
      if (!bad) legal.push(m);
    }
    return legal;
  };

  // 局面结果：sideToMove 无合法走法 → 该方负（将死/困毙）
  XQ.getResult = function (board, sideToMove) {
    var moves = XQ.legalMoves(board, sideToMove);
    if (moves.length === 0) {
      return { over: true, winner: XQ.opponent(sideToMove), reason: 'no-moves' };
    }
    return { over: false };
  };

})(typeof window !== 'undefined' ? window : globalThis);
