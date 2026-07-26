/* board.js — 棋盘状态与基础工具
 * 棋盘为 board[row][col]，row 0..9（0=黑方底线，9=红方底线），col 0..8。
 * 每格为 null 或 { type, side }。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  XQ.Board = function (state) {
    // state: 二维数组（可被克隆传入）
    this.grid = state || XQ.initialBoard();
  };

  XQ.Board.prototype.clone = function () {
    var g = new Array(10);
    for (var r = 0; r < 10; r++) {
      g[r] = new Array(9);
      for (var c = 0; c < 9; c++) {
        var p = this.grid[r][c];
        g[r][c] = p ? { type: p.type, side: p.side } : null;
      }
    }
    return new XQ.Board(g);
  };

  XQ.Board.prototype.get = function (r, c) { return this.grid[r][c]; };
  XQ.Board.prototype.set = function (r, c, v) { this.grid[r][c] = v; };

  XQ.Board.prototype.inBoard = function (r, c) {
    return r >= 0 && r < 10 && c >= 0 && c < 9;
  };

  XQ.Board.prototype.findKing = function (side) {
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++) {
        var p = this.grid[r][c];
        if (p && p.type === 'K' && p.side === side) return { r: r, c: c };
      }
    return null;
  };

  //  palaces: 红九宫 row7-9 col3-5；黑九宫 row0-2 col3-5
  XQ.Board.prototype.inPalace = function (side, r, c) {
    if (c < 3 || c > 5) return false;
    if (side === 'red') return r >= 7 && r <= 9;
    return r >= 0 && r <= 2;
  };

  // 是否已过河：红兵到 row<=4 算过河；黑兵到 row>=5 算过河
  XQ.Board.prototype.crossedRiver = function (side, r) {
    return side === 'red' ? r <= 4 : r >= 5;
  };

  // 判断两将是否“照面”（同列且中间无子）——用于飞将限制
  XQ.Board.prototype.kingsFace = function () {
    var rk = this.findKing('red'), bk = this.findKing('black');
    if (!rk || !bk) return false;
    if (rk.c !== bk.c) return false;
    var step = rk.r < bk.r ? 1 : -1;
    for (var r = rk.r + step; r !== bk.r; r += step) {
      if (this.grid[r][rk.c]) return false;
    }
    return true;
  };

})(typeof window !== 'undefined' ? window : globalThis);
