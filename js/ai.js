/* ai.js — 人机 AI：极大极小(negamax) + α-β 剪枝 + 静止搜索 + 三档难度
 * 设计目标：每升一档明显更强（深度递增 + 高挡开静止搜索 + 低挡加随机扰动）。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  var MATE = 1000000;
  var INF = 2000000;

  // 三档难度配置
  XQ.DIFFICULTY = {
    easy:   { depth: 2, quiescence: false, randomness: 45, order: false, timeLimit: 0 },
    medium: { depth: 3, quiescence: true,  randomness: 0,  order: true,  timeLimit: 0 },
    hard:   { depth: 5, quiescence: true,  randomness: 0,  order: true,  timeLimit: 1500 }
  };

  // 评估（红方视角）
  function evaluate(board) {
    var s = 0;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board.grid[r][c];
        if (!p) continue;
        var v = XQ.VALUE[p.type] + XQ.positional(p.type, p.side, r, c);
        s += (p.side === 'red') ? v : -v;
      }
    }
    return s;
  }

  function relativeEval(board, side) {
    var e = evaluate(board);
    return side === 'red' ? e : -e;
  }

  // 走法排序：吃子优先（按被吃子价值），提升 α-β 剪枝效率
  function orderMoves(moves, board) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var t = board.grid[m.to.r][m.to.c];
      m._score = t ? XQ.VALUE[t.type] : 0;
    }
    moves.sort(function (a, b) { return b._score - a._score; });
    return moves;
  }

  // 静止搜索：仅在吃子（或被将需应着）时继续，防止“水平线效应”
  function quiescence(board, side, alpha, beta, cfg, deadline, qdepth) {
    if (deadline && Date.now() > deadline) return relativeEval(board, side);
    var stand = relativeEval(board, side);
    if (qdepth <= 0) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    var moves = XQ.legalMoves(board, side);
    var inCheck = XQ.isInCheck(board, side);
    if (!inCheck) {
      moves = moves.filter(function (m) { return m.capture; });
    }
    if (moves.length === 0) {
      // 无吃子且未被将，停在此；若被将且无着则判负
      if (inCheck) return -MATE;
      return stand;
    }
    if (cfg.order) moves = orderMoves(moves, board);
    var opp = XQ.opponent(side);
    for (var i = 0; i < moves.length; i++) {
      var child = XQ.applyMove(board, moves[i]);
      var val = -quiescence(child, opp, -beta, -alpha, cfg, deadline, qdepth - 1);
      if (val >= beta) return beta;
      if (val > alpha) alpha = val;
    }
    return alpha;
  }

  // negamax + α-β
  function negamax(board, side, depth, alpha, beta, cfg, deadline, ply) {
    var moves = XQ.legalMoves(board, side);
    if (moves.length === 0) {
      // 无合法走法：当前方负（将死/困毙），越早越糟
      return -(MATE - ply);
    }
    if (deadline && Date.now() > deadline) return relativeEval(board, side);
    if (depth <= 0) {
      if (cfg.quiescence) return quiescence(board, side, alpha, beta, cfg, deadline, 6);
      return relativeEval(board, side);
    }
    if (cfg.order) moves = orderMoves(moves, board);
    var opp = XQ.opponent(side);
    var best = -INF;
    for (var i = 0; i < moves.length; i++) {
      var child = XQ.applyMove(board, moves[i]);
      var val = -negamax(child, opp, depth - 1, -beta, -alpha, cfg, deadline, ply + 1);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // 根节点搜索：返回最佳走法（带可选随机扰动用于低难度）
  XQ.aiBestMove = function (board, aiSide, difficultyName, forbidCheck) {
    var cfg = XQ.DIFFICULTY[difficultyName] || XQ.DIFFICULTY.medium;
    var moves = XQ.legalMoves(board, aiSide);
    if (moves.length === 0) return null;
    if (forbidCheck) {
      // 禁手：本步不得将军；若存在「非将军」合法着法才过滤，否则放开以免无棋可走
      var safe = moves.filter(function (m) { return !XQ.wouldCheck(board, m, aiSide); });
      if (safe.length > 0) moves = safe;
    }
    if (cfg.order) moves = orderMoves(moves, board);

    var opp = XQ.opponent(aiSide);
    var deadline = cfg.timeLimit ? Date.now() + cfg.timeLimit : 0;
    var bestMove = moves[0];
    var bestScore = -INF;

    // 迭代加深（高挡防卡顿）：逐层加深，保留已完成层的最佳着法
    var maxDepth = cfg.depth;
    for (var d = 1; d <= maxDepth; d++) {
      var alpha = -INF, beta = INF;
      var localBest = moves[0], localScore = -INF;
      var aborted = false;
      for (var i = 0; i < moves.length; i++) {
        var child = XQ.applyMove(board, moves[i]);
        var val = -negamax(child, opp, d - 1, -beta, -alpha, cfg, deadline, 1);
        if (deadline && Date.now() > deadline && d > 1) { aborted = true; break; }
        // 低难度随机扰动：在同等分数附近抖动，制造可乘之机
        if (cfg.randomness) val += (Math.random() * 2 - 1) * cfg.randomness;
        if (val > localScore) { localScore = val; localBest = moves[i]; }
        if (localScore > alpha) alpha = localScore;
      }
      if (!aborted) { bestMove = localBest; bestScore = localScore; }
      else break; // 超时，保留上一层结果
    }
    return { move: bestMove, score: bestScore };
  };

  // 便捷：用字符串难度名取得配置
  XQ.aiConfig = function (name) { return XQ.DIFFICULTY[name] || XQ.DIFFICULTY.medium; };

})(typeof window !== 'undefined' ? window : globalThis);
