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
    { id: 16, name: '终极残局', tip: '双车压境，炮卒助威', pieces: [P(9,4,'K','red'), P(1,4,'R','red'), P(8,0,'R','red'), P(7,4,'C','red'), P(6,4,'P','red')].concat(blackFort()) },

    /* ========== 玩家 1:1 还原的 9 个新增残局（最难） ==========
     * redMustWin:
     *   true  — 红先走必胜（用 AI 短对弈验证）
     *   false — 红先走求和极难（开局红不输，引擎不将死红方）*/
    { id: 17, name: '割地求和', tip: '经典名局 编号36，红方和棋极难', redMustWin: false, pieces: [
      P(0,4,'K','black'), P(0,7,'E','black'),
      P(2,5,'P','red'), P(3,5,'P','red'),
      P(6,2,'R','black'), P(6,5,'P','black'),
      P(6,7,'C','black'),
      P(7,8,'C','black'),
      P(9,5,'K','red')
    ] },
    { id: 18, name: '炮兵逞威', tip: '经典名局 编号11，炮兵联攻', redMustWin: true, pieces: [
      P(0,5,'K','black'),
      P(0,1,'P','red'),
      P(1,3,'P','red'), P(1,4,'P','red'),
      P(2,3,'P','red'),
      P(6,3,'P','black'), P(6,4,'P','black'),
      P(6,5,'C','red'),
      P(6,8,'P','black'),
      P(8,5,'K','red')
    ] },
    { id: 19, name: '弈亦大战', tip: '经典名局 编号4，子力繁多，攻杀复杂', redMustWin: false, pieces: [
      P(1,4,'P','red'),
      P(2,2,'E','red'), P(2,3,'A','red'), P(2,4,'K','black'), P(2,5,'A','black'), P(2,6,'R','red'),
      P(3,2,'P','red'), P(3,5,'P','red'),
      P(4,2,'P','black'), P(4,3,'P','red'), P(4,6,'C','black'), P(4,7,'E','black'),
      P(5,3,'R','black'), P(5,5,'C','black'),
      P(6,0,'R','black'), P(6,2,'P','red'), P(6,3,'E','red'), P(6,4,'P','black'), P(6,5,'P','black'), P(6,6,'C','red'), P(6,7,'H','red'),
      P(7,3,'K','red'), P(7,5,'A','red'),
      P(8,2,'P','black'), P(8,6,'H','red')
    ] },
    { id: 20, name: '玲珑剔透', tip: '经典名局 编号3，多子归边', redMustWin: false, pieces: [
      P(1,4,'A','red'),
      P(2,3,'K','black'), P(2,5,'A','red'),
      P(3,2,'R','red'), P(3,6,'R','black'),
      P(4,1,'H','red'), P(4,7,'H','red'),
      P(5,0,'C','red'), P(5,8,'C','black'),
      P(6,2,'H','red'), P(6,7,'H','red'),
      P(7,2,'R','red'), P(7,6,'R','black'),
      P(8,3,'P','black'), P(8,5,'P','black'),
      P(9,4,'K','red')
    ] },
    { id: 21, name: '紫云双塔', tip: '经典名局 编号2，双塔高耸', redMustWin: true, pieces: [
      P(1,4,'C','black'),
      P(2,4,'A','red'),
      P(3,0,'E','black'), P(3,3,'A','red'), P(3,4,'H','red'), P(3,5,'K','black'), P(3,8,'E','black'),
      P(5,2,'R','red'), P(5,3,'R','red'), P(5,4,'R','red'), P(5,6,'C','black'), P(5,7,'R','black'), P(5,8,'C','red'),
      P(6,6,'P','black'),
      P(7,3,'R','red'), P(7,4,'K','red'), P(7,5,'A','red'),
      P(8,3,'C','black'), P(8,4,'A','red'),
      P(9,4,'H','red')
    ] },
    { id: 22, name: '月上柳梢', tip: '经典名局 编号1，攻杀凌厉', redMustWin: true, pieces: [
      P(1,2,'C','red'), P(1,3,'C','black'), P(1,4,'A','red'),
      P(2,3,'K','black'), P(2,5,'C','red'),
      P(3,4,'P','red'), P(3,6,'P','black'),
      P(4,4,'H','red'), P(4,6,'E','black'),
      P(5,4,'R','red'), P(5,6,'R','black'),
      P(6,4,'C','black'), P(6,5,'H','red'),
      P(7,2,'P','black'),
      P(8,0,'R','black'), P(8,2,'R','red'), P(8,3,'K','red')
    ] },
    { id: 23, name: '郑伯克段于鄢(一)', tip: '古谱残局，红方必胜', redMustWin: true, pieces: [
      P(1,2,'E','black'), P(1,3,'A','black'), P(1,4,'K','black'), P(1,5,'A','black'),
      P(2,2,'P','red'),
      P(3,0,'C','black'), P(3,4,'E','black'),
      P(5,1,'C','red'),
      P(6,3,'R','red'), P(6,4,'E','red'),
      P(7,4,'P','black'), P(7,6,'R','black'),
      P(8,5,'K','red'), P(8,6,'E','red')
    ] },
    { id: 24, name: '古谱残局·第2关', tip: '古谱残局，红方必胜', redMustWin: false, pieces: [
      P(0,3,'K','black'), P(0,8,'C','black'),
      P(1,2,'P','red'), P(1,4,'A','red'),
      P(2,3,'H','red'), P(2,5,'A','red'), P(2,6,'R','red'), P(2,7,'E','red'),
      P(3,6,'R','black'),
      P(4,7,'H','red'),
      P(5,6,'P','black'), P(6,6,'P','black'), P(6,7,'P','black'), P(6,8,'C','red'),
      P(7,1,'C','black'), P(7,2,'R','black'), P(7,3,'P','black'), P(7,5,'P','black'),
      P(8,4,'K','red')
    ] },
    { id: 25, name: '古谱残局·第1关', tip: '古谱残局，红方必胜', redMustWin: false, pieces: [
      P(1,3,'K','black'),
      P(2,6,'R','red'), P(2,8,'C','red'),
      P(3,3,'C','black'),
      P(4,6,'E','red'),
      P(5,6,'E','black'),
      P(7,2,'R','black'), P(7,4,'P','black'), P(7,6,'P','black'),
      P(8,5,'K','red')
    ] }
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
