/* endgames.js — 残局挑战 16 关
 * 每关：红方先走且存在可解胜着；防守方由大师级 AI 把守，故每关极难。
 * 关卡按由易到难排列（相对）。board 为棋子列表，空盘基础上摆放。 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  function P(r, c, type, side) { return { r: r, c: c, type: type, side: side }; }

  // 助手：黑方九宫标配（将 + 双士）
  function blackFort() {
    return [P(0, 4, 'K', 'black'), P(0, 3, 'A', 'black'), P(0, 5, 'A', 'black')];
  }

  var LEVELS = [
    { id: 1, name: '车兵擒王', tip: '车卒合势，逼宫而胜', pieces: [P(9,3,'K','red'), P(5,0,'R','red'), P(6,4,'P','red'), P(0,4,'K','black'), P(0,3,'A','black')] },
    { id: 2, name: '双车夹攻', tip: '双车错杀，封锁九宫', pieces: [P(9,3,'K','red'), P(1,0,'R','red'), P(1,8,'R','red')].concat(blackFort()) },
    { id: 3, name: '车马合璧', tip: '车正马威，步步紧逼', pieces: [P(9,4,'K','red'), P(2,4,'R','red'), P(7,1,'H','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 4, name: '单车擒士', tip: '一车制双士', pieces: [P(9,4,'K','red'), P(4,4,'R','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 5, name: '炮马争雄', tip: '马炮联动，破卫入局', pieces: [P(9,4,'K','red'), P(7,4,'C','red'), P(7,2,'H','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 6, name: '车炮攻坚', tip: '车炮夹击，摧枯拉朽', pieces: [P(9,4,'K','red'), P(3,4,'R','red'), P(7,4,'C','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 7, name: '车卒破卫', tip: '车卒逼宫，士象难全', pieces: [P(9,3,'K','red'), P(5,4,'R','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 8, name: '马跃檀溪', tip: '马借车势，冷着连连', pieces: [P(9,4,'K','red'), P(2,4,'H','red'), P(9,0,'R','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 9, name: '车炮远攻', tip: '沉底车炮，侧翼突袭', pieces: [P(9,4,'K','red'), P(2,0,'R','red'), P(4,8,'C','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 10, name: '双车闹宫', tip: '双车锁宫，将无路走', pieces: [P(9,3,'K','red'), P(0,0,'R','red'), P(0,8,'R','red')].concat(blackFort()) },
    { id: 11, name: '车马冷着', tip: '车控要道，马踏连营', pieces: [P(9,4,'K','red'), P(4,4,'R','red'), P(2,2,'H','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 12, name: '炮卒逞能', tip: '炮镇当头，卒助攻杀', pieces: [P(9,4,'K','red'), P(7,4,'C','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 13, name: '车卒破象', tip: '车卒破双象，残局见功', pieces: [P(9,4,'K','red'), P(5,4,'R','red'), P(6,4,'P','red'), P(0,2,'E','black')].concat(blackFort()) },
    { id: 14, name: '双马饮泉', tip: '双马盘旋，借帅成杀', pieces: [P(9,4,'K','red'), P(7,2,'H','red'), P(7,6,'H','red'), P(6,4,'P','red'), P(0,4,'K','black')] },
    { id: 15, name: '车马炮局', tip: '车马炮三子归边', pieces: [P(9,4,'K','red'), P(2,4,'R','red'), P(7,1,'H','red'), P(7,7,'C','red'), P(6,4,'P','red')].concat(blackFort()) },
    { id: 16, name: '终极残局', tip: '双车压境，炮卒助威', pieces: [P(9,4,'K','red'), P(1,4,'R','red'), P(8,0,'R','red'), P(7,4,'C','red'), P(6,4,'P','red')].concat(blackFort()) }
  ];

  // 由 pieces 列表构建棋盘
  XQ.buildEndgameBoard = function (pieces) {
    var b = [];
    for (var r = 0; r < 10; r++) b.push(new Array(9).fill(null));
    pieces.forEach(function (p) { b[p.r][p.c] = { type: p.type, side: p.side }; });
    return b;
  };

  XQ.ENDGAMES = LEVELS;

})(typeof window !== 'undefined' ? window : globalThis);
