/* endgames.js — 古谱残局 v2
 * 来源：「35 道古谱残局表格手册」（玩家提供）
 * 当前进度：v1 = 9 道（已搜到精确 FEN 并校验开局合法）
 *   1-4:  四大名局（七星聚会、蚯蚓降龙、野马操田、千里独行）
 *   5:    心武残编·鸿雁来宾
 *   6-7:  烂柯神机·断汲禁樵 / 诱鹿入蕉
 *   8-9:  烂柯神机·虚闪一枪 / 渊深海阔·磐河会战
 * 数据来源：xqipu.com / baike.baidu.com / qimingjiemeng.com
 * 坐标系转换：搜索结果 (x,y) → 引擎 (r,c)，见 endgame_solver_test.js
 * 后续：剩余 26 道待搜 FEN 后再补入
 */
(function (root) {
  var XQ = root.XQ = root.XQ || {};

  function P(r, c, type, side) { return { r: r, c: c, type: type, side: side }; }

  // FEN 解析（兼容 xqipu 混用字符约定：K=帅/将, R=车, H/N=马, C=炮, E/B=相/象, A=仕/士, P=兵/卒）
  // 大写红方, 小写黑方
  var CHAR2TYPE = {
    'K': 'K', 'k': 'K',
    'R': 'R', 'r': 'R',
    'H': 'H', 'h': 'H', 'N': 'H', 'n': 'H',
    'C': 'C', 'c': 'C',
    'E': 'E', 'e': 'E', 'B': 'E', 'b': 'E',
    'A': 'A', 'a': 'A',
    'P': 'P', 'p': 'P'
  };

  XQ.parseFen = function (fen) {
    var body = fen.trim().split(/\s+/)[0];
    var rows = body.split('/');
    var pieces = [];
    for (var i = 0; i < rows.length && i < 10; i++) {
      var row = rows[i];
      var c = 0;
      for (var j = 0; j < row.length; j++) {
        var ch = row[j];
        if (/[0-9]/.test(ch)) {
          c += parseInt(ch, 10);
        } else {
          var type = CHAR2TYPE[ch];
          if (!type) throw new Error('未知字符: ' + ch);
          var side = (ch === ch.toUpperCase()) ? 'red' : 'black';
          pieces.push(P(i, c, type, side));
          c++;
        }
      }
    }
    return pieces;
  };

  var LEVELS = [
    /* ========== 1. 七星聚会（红先和，四大名局之首） ========== */
    {
      id: 1, name: '七星聚会', tip: '四大江湖名局之首，红先和', redMustWin: false,
      fen: null,
      pieces: [
        // 红方: 帅(4,0),车(6,0)(7,0),炮(7,2),兵(3,8)(5,7)(8,3)
        // 转换 (x,y) → (r,c): r=9-y, c=8-x
        P(9, 4, 'K', 'red'),
        P(9, 2, 'R', 'red'), P(9, 1, 'R', 'red'),
        P(7, 1, 'C', 'red'),
        P(1, 5, 'P', 'red'), P(2, 3, 'P', 'red'), P(6, 0, 'P', 'red'),
        // 黑方: 将(5,9),象(4,7),车(4,9),卒(1,2)(3,1)(4,2)(5,1)
        P(0, 3, 'K', 'black'),
        P(2, 4, 'E', 'black'),
        P(0, 4, 'R', 'black'),
        P(7, 7, 'P', 'black'), P(8, 5, 'P', 'black'),
        P(7, 4, 'P', 'black'), P(8, 3, 'P', 'black')
      ]
    },
    /* ========== 2. 蚯蚓降龙（红先和） ========== */
    {
      id: 2, name: '蚯蚓降龙', tip: '四大江湖名局之一，三卒单缺象对双车一兵', redMustWin: false,
      pieces: [
        // 红方: 帅(5,0),车(5,4)(8,0),兵(8,4)
        P(9, 3, 'K', 'red'),
        P(5, 3, 'R', 'red'), P(9, 0, 'R', 'red'),
        P(5, 0, 'P', 'red'),
        // 黑方: 将(4,9),士(3,9)(4,8),象(4,7),卒(2,5)(4,1)(6,1)
        P(0, 4, 'K', 'black'),
        P(0, 5, 'A', 'black'), P(1, 4, 'A', 'black'),
        P(2, 4, 'E', 'black'),
        P(4, 6, 'P', 'black'), P(8, 4, 'P', 'black'), P(8, 2, 'P', 'black')
      ]
    },
    /* ========== 3. 野马操田（红先和） ========== */
    {
      id: 3, name: '野马操田', tip: '四大江湖名局之一', redMustWin: false,
      pieces: [
        // 红方: 帅(3,0),相(2,4)(4,2),兵(2,3)(4,3),马(6,5),车(7,5)(8,5)
        P(9, 5, 'K', 'red'),
        P(5, 6, 'E', 'red'), P(7, 4, 'E', 'red'),
        P(6, 6, 'P', 'red'), P(6, 4, 'P', 'red'),
        P(4, 2, 'H', 'red'),
        P(4, 1, 'R', 'red'), P(4, 0, 'R', 'red'),
        // 黑方: 将(4,9),士(3,9)(4,8),象(2,9)(4,7),车(1,3),卒(4,1)(3,2)
        P(0, 4, 'K', 'black'),
        P(0, 5, 'A', 'black'), P(1, 4, 'A', 'black'),
        P(0, 6, 'E', 'black'), P(2, 4, 'E', 'black'),
        P(6, 7, 'R', 'black'),
        P(8, 4, 'P', 'black'), P(7, 5, 'P', 'black')
      ]
    },
    /* ========== 4. 千里独行（红先和） ========== */
    {
      id: 4, name: '千里独行', tip: '四大江湖名局之一', redMustWin: false,
      pieces: [
        // 红方: 帅(4,0),车(4,2),兵(2,3)(4,7)
        P(9, 4, 'K', 'red'),
        P(7, 4, 'R', 'red'),
        P(6, 6, 'P', 'red'), P(2, 4, 'P', 'red'),
        // 黑方: 将(4,9),士(3,7),象(7,7),马(6,4),卒(0,6)(3,1)(5,1)(6,3)
        P(0, 4, 'K', 'black'),
        P(2, 5, 'A', 'black'),
        P(2, 1, 'E', 'black'),
        P(5, 2, 'H', 'black'),
        P(3, 8, 'P', 'black'),
        P(8, 5, 'P', 'black'), P(8, 3, 'P', 'black'), P(6, 2, 'P', 'black')
      ]
    },
    /* ========== 5. 心武残编·鸿雁来宾（红先和） ========== */
    {
      id: 5, name: '鸿雁来宾', tip: '心武残编名局', redMustWin: false,
      fen: '2ck5/4P4/3r3P1/6C2/6C2/P1p3R2/9/B2p4R/4p4/3K2B2 w',
      pieces: null
    },
    /* ========== 6. 烂柯神机·断汲禁樵（红先和） ========== */
    {
      id: 6, name: '断汲禁樵', tip: '烂柯神机名局', redMustWin: false,
      fen: '3k1aRPr/1R2n2n1/4bN3/3P2C2/9/9/9/4pC3/2r1p1p2/5K3 w',
      pieces: null
    },
    /* ========== 7. 烂柯神机·诱鹿入蕉（红先和） ========== */
    {
      id: 7, name: '诱鹿入蕉', tip: '烂柯神机名局', redMustWin: false,
      fen: '4k3r/3P3P1/c1PaPa3/6RC1/6b2/9/9/3pp2p1/5K3 w',
      pieces: null
    },
    /* ========== 8. 烂柯神机·虚闪一枪（红先和） ========== */
    {
      id: 8, name: '虚闪一枪', tip: '烂柯神机名局', redMustWin: false,
      fen: '6b2/4a4/4ka3/2NP5/1Cb6/9/9/6p2/3pp4/5K3 w',
      pieces: null
    },
    /* ========== 9. 渊深海阔·磐河会战（红先和） ========== */
    {
      id: 9, name: '磐河会战', tip: '渊深海阔名局', redMustWin: false,
      fen: '3k1r3/1P2P4/b8/9/2bPp3C/6RRC/c1P3p2/2p6/4pcr2/2BK5 w',
      pieces: null
    }
  ];

  XQ.buildEndgameBoard = function (pieces) {
    var b = [];
    for (var r = 0; r < 10; r++) b.push(new Array(9).fill(null));
    pieces.forEach(function (p) { b[p.r][p.c] = { type: p.type, side: p.side }; });
    return b;
  };

  // 把 LEVELS 里 fen-only 项展开成 pieces
  XQ.ENDGAMES = LEVELS.map(function (L) {
    if (L.fen && !L.pieces) L.pieces = XQ.parseFen(L.fen);
    return L;
  });
})(typeof window !== 'undefined' ? window : globalThis);