/* constants.js — 棋子定义、初始布局、子力价值、位置价值
 * 同时兼容浏览器(window.XQ)与 Node(global.XQ) 以便自检。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  XQ.ROWS = 10;
  XQ.COLS = 9;

  XQ.T = { ROOK: 'R', HORSE: 'H', CANNON: 'C', ELEPHANT: 'E', ADVISOR: 'A', KING: 'K', PAWN: 'P' };

  // 显示用汉字：红方与黑方在 相/象、仕/士、帅/将、兵/卒 上区分
  XQ.CHAR = {
    red:   { R: '车', H: '马', C: '炮', E: '相', A: '仕', K: '帅', P: '兵' },
    black: { R: '车', H: '马', C: '炮', E: '象', A: '士', K: '将', P: '卒' }
  };

  // 子力价值（红方视角，正数对红有利）
  XQ.VALUE = { K: 100000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 };

  // 标准开局初始局面
  XQ.initialBoard = function () {
    var b = [];
    for (var r = 0; r < 10; r++) { b.push(new Array(9).fill(null)); }
    var back = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
    for (var c = 0; c < 9; c++) {
      b[0][c] = { type: back[c], side: 'black' };
      b[9][c] = { type: back[c], side: 'red' };
    }
    b[2][1] = { type: 'C', side: 'black' }; b[2][7] = { type: 'C', side: 'black' };
    b[7][1] = { type: 'C', side: 'red' };   b[7][7] = { type: 'C', side: 'red' };
    for (var c2 = 0; c2 < 9; c2 += 2) {
      b[3][c2] = { type: 'P', side: 'black' };
      b[6][c2] = { type: 'P', side: 'red' };
    }
    return b;
  };

  // 位置价值（红方视角，红方在下，row 越大越靠红方底线）
  // 采用公式化计算，避免冗长字面量表。
  XQ.positional = function (type, side, r, c) {
    var bonus = 0;
    var adv; // 推进度：红方越往上(小row)越好，黑方越往下(大row)越好
    if (side === 'red') adv = (9 - r);
    else adv = r;
    var centerFile = 4 - Math.abs(c - 4); // 0..4，越大越居中

    switch (type) {
      case 'P':
        // 过河兵价值大增，越靠近敌阵越好，居中更好
        bonus += adv * 6;
        if (side === 'red' && r <= 4) bonus += 35;        // 已过河
        if (side === 'black' && r >= 5) bonus += 35;
        bonus += centerFile * 4;
        break;
      case 'H':
      case 'C':
        bonus += centerFile * 3 + adv * 1;
        break;
      case 'R':
        bonus += centerFile * 2 + adv * 1;
        break;
      case 'E':
      case 'A':
        // 守在家门附近略好，避免过早出动
        bonus += centerFile * 1;
        break;
      case 'K':
        // 王将尽量待在九宫中心列附近，避免暴露
        bonus += centerFile * 2;
        break;
    }
    return bonus;
  };

  XQ.opponent = function (side) { return side === 'red' ? 'black' : 'red'; };

})(typeof window !== 'undefined' ? window : globalThis);
