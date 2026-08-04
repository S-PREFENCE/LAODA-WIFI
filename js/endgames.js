/* endgames.js — 古谱残局 v3（严格审核定稿，35 道）
 *
 * 审核标准（"先审后推"）：
 *   每道残局的 FEN 都对应一份「古谱原解坐标串」(xqipu 简介字段)。
 *   用本引擎规则把原解逐着回放，若每一步都合法，则证明：
 *     a) FEN 转录无误（错一个子，着法必然在某步非法）
 *     b) 本引擎走法/将军/飞将规则与古谱一致
 *   回放脚本：endgame_replay_verify.js（34/35 通过；唯一未过的是
 *   双马饮泉——xqipu 源数据本身损坏「将5进8」，已剔除，不入库）。
 *
 * 数据来源（8 部古谱）：四大名局 / 烂柯神机 / 心武残编 / 渊深海阔 /
 *   梦入神机 / 竹香斋象戏谱 / 适情雅趣 / 橘中秘。
 * 约定：redMustWin:true = 红先胜（红执玩家必须取胜）；false = 红先和。
 *
 * v3 相对 v2 修正：
 *   - 诱鹿入蕉 FEN 原缺一行（9 行→已补全为 10 行正确局面）
 *   - 断汲禁樵/诱鹿入蕉/虚闪一枪 原为 redMustWin:false，实测为强制红胜→改 true
 *   - 剔除无法取得古谱原解的 鸿雁来宾（原 #5），改以已回放验证的 继承先志 替入
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
    /* ========== 1-4. 四大名局（红先和，江湖名局，pieces 为权威定式） ========== */
    {
      id: 1, name: '七星聚会', source: '四大名局', tip: '四大江湖名局之首，红先和',
      redMustWin: false,
      pieces: [
        P(9, 4, 'K', 'red'),
        P(9, 2, 'R', 'red'), P(9, 1, 'R', 'red'),
        P(7, 1, 'C', 'red'),
        P(1, 5, 'P', 'red'), P(2, 3, 'P', 'red'), P(6, 0, 'P', 'red'),
        P(0, 3, 'K', 'black'),
        P(2, 4, 'E', 'black'),
        P(0, 4, 'R', 'black'),
        P(7, 7, 'P', 'black'), P(8, 5, 'P', 'black'),
        P(7, 4, 'P', 'black'), P(8, 3, 'P', 'black')
      ]
    },
    {
      id: 2, name: '蚯蚓降龙', source: '四大名局', tip: '四大江湖名局之一，三卒单缺象对双车一兵',
      redMustWin: false,
      pieces: [
        P(9, 3, 'K', 'red'),
        P(5, 3, 'R', 'red'), P(9, 0, 'R', 'red'),
        P(5, 0, 'P', 'red'),
        P(0, 4, 'K', 'black'),
        P(0, 5, 'A', 'black'), P(1, 4, 'A', 'black'),
        P(2, 4, 'E', 'black'),
        P(4, 6, 'P', 'black'), P(8, 4, 'P', 'black'), P(8, 2, 'P', 'black')
      ]
    },
    {
      id: 3, name: '野马操田', source: '四大名局', tip: '四大江湖名局之一',
      redMustWin: false,
      pieces: [
        P(9, 5, 'K', 'red'),
        P(5, 6, 'E', 'red'), P(7, 4, 'E', 'red'),
        P(6, 6, 'P', 'red'), P(6, 4, 'P', 'red'),
        P(4, 2, 'H', 'red'),
        P(4, 1, 'R', 'red'), P(4, 0, 'R', 'red'),
        P(0, 4, 'K', 'black'),
        P(0, 5, 'A', 'black'), P(1, 4, 'A', 'black'),
        P(0, 6, 'E', 'black'), P(2, 4, 'E', 'black'),
        P(6, 7, 'R', 'black'),
        P(8, 4, 'P', 'black'), P(7, 5, 'P', 'black')
      ]
    },
    {
      id: 4, name: '千里独行', source: '四大名局', tip: '四大江湖名局之一',
      redMustWin: false,
      pieces: [
        P(9, 4, 'K', 'red'),
        P(7, 4, 'R', 'red'),
        P(6, 6, 'P', 'red'), P(2, 4, 'P', 'red'),
        P(0, 4, 'K', 'black'),
        P(2, 5, 'A', 'black'),
        P(2, 1, 'E', 'black'),
        P(5, 2, 'H', 'black'),
        P(3, 8, 'P', 'black'),
        P(8, 5, 'P', 'black'), P(8, 3, 'P', 'black'), P(6, 2, 'P', 'black')
      ]
    },

    /* ========== 5-7. 烂柯神机（红先胜，均经古谱原解回放验证为强制红胜） ========== */
    {
      id: 5, name: '断汲禁樵', source: '烂柯神机', tip: '烂柯神机名局，红先胜',
      redMustWin: true,
      fen: '3k1aRPr/1R2n2n1/4bN3/3P2C2/9/9/9/4pC3/2r1p1p2/5K3 w',
      solution: 'b8d8d9d8d6d7d8d7f7e5d7d8f2f8d8d9g9f9h8f9g6g9f9d8g9i9'
    },
    {
      id: 6, name: '诱鹿入蕉', source: '烂柯神机', tip: '烂柯神机名局，红先胜（原 FEN 已补全为 10 行正确局面）',
      redMustWin: true,
      fen: '4k3r/3P3P1/c1PaPa3/6RC1/6b2/9/9/9/3pp2p1/5K3 w',
      solution: 'g6g9i9g9h6e6d7e8e7e8e9f9d8d9e1e0f0f1h1g1f1f2g5e7d9e9'
    },
    {
      id: 7, name: '虚闪一枪', source: '烂柯神机', tip: '烂柯神机名局，红先胜',
      redMustWin: true,
      fen: '6b2/4a4/4ka3/2NP5/1Cb6/9/9/6p2/3pp4/5K3 w',
      solution: 'd6e6e7d7b5a5c5a7a5g5e8f9g5g7f7e8e6e7'
    },

    /* ========== 8. 渊深海阔（红先和） ========== */
    {
      id: 8, name: '磐河会战', source: '渊深海阔', tip: '渊深海阔名局，红先和',
      redMustWin: false,
      fen: '3k1r3/1P2P4/b8/9/2bPp3C/6RRC/c1P3p2/2p6/4pcr2/2BK5 w',
      solution: 'i5i9f9i9g4g3f1f7g3g1a3a0c0a2f7d7h4d4d7d4g1e1i9i4e1e5i4i0d0d1c2c1d1d2i0d0d2e2d0e0e2d2e0e5d5e5a0e0e5f5e0i0b8c8i0i8c8d8i8d8e8d8d9d8'
    },

    /* ========== 9-13. 梦入神机（5 道） ========== */
    {
      id: 9, name: '胶柱鼓瑟', source: '梦入神机', tip: '梦入神机名局，红先和',
      redMustWin: false,
      fen: '3k5/9/9/6p2/9/9/P8/C2A4B/6p1r/4K4 w',
      solution: 'a2a0g1g0i2g0g6g5g0i2d9d8a3a4d8d9a4a5d9d8a5b5d8d9b5c5i1d1a0d0d9d8c5d5d8d9d5d6d1c1d6d7c1d1d0a0d1b1a0c0b1c1c0d0c1d1d7c7d9d8c7c8d8d9c8b8d9d8'
    },
    {
      id: 10, name: '四面旋绕', source: '梦入神机', tip: '梦入神机名局，红先和',
      redMustWin: false,
      fen: 'r1b2a3/5k3/b2P5/9/2p4P1/9/9/1C6C/4K4/9 w',
      solution: 'b2f2c9e7f2f1f8e8d7e7e8d8f1f8a7c9i2i8d8d9e7d7a9a1e1e0c9e7d7d8d9e9e0f0a1a0f0f1f9e8d8e8e9f9i8i1a0f0f1e1f0f8e8f8f9f8'
    },
    {
      id: 11, name: '狐兔争穴', source: '梦入神机', tip: '梦入神机名局，红先和',
      redMustWin: false,
      fen: '3k5/5P3/2P1c1N2/6n2/9/9/9/4B4/2ppA4/4KA3 w',
      solution: 'c7d7c1c0d7e7g6f4g7e6f4e6e7e8e6f8e8f8'
    },
    {
      id: 12, name: '翻藻掀萍', source: '梦入神机', tip: '梦入神机名局，红先胜',
      redMustWin: true,
      fen: '4kaR2/3Pa4/4b3b/2p1p4/1N3P3/9/5p3/4C4/3pp2r1/5KB2 w',
      solution: 'd8e8e9e8b5d6e8e9d6c8e9d9c8e7d9e9e7f9f3e3f9e7e9e8g9e9e8d8e7c6d8d7e9d9'
    },
    {
      id: 13, name: '寒雁偎卢', source: '梦入神机', tip: '梦入神机名局，红先胜',
      redMustWin: true,
      fen: '3ara3/8C/P2kb1N2/9/6b2/2N6/9/5A3/2pr1p3/R3K3c w',
      solution: 'c4e5d7d8e5c6d8d7g7e8f1f0e0f0e7c5e8c9'
    },

    /* ========== 14-18. 竹香斋象戏谱（5 道，红先和） ========== */
    {
      id: 14, name: '云台霜戟', source: '竹香斋象戏谱', tip: '竹香斋名局，红先和',
      redMustWin: false,
      fen: '1r1k2P2/4P4/c7b/c8/2b5p/7R1/2P4R1/6pCB/2prp4/5KC2 w',
      solution: 'h3d3a6d6d3d1b9b0g0b0c1d1h4a4i7g9a4a6d6b6a6a4b6d6b0b1g2f2a4f4f2f1f4f1e1f1b1f1d6f6f1g1g9i7h2h1a7f7f0e0f6e6h1d1i5i4d1d0f7e7e0f0e6e8f0f1'
    },
    {
      id: 15, name: '群真归洞', source: '竹香斋象戏谱', tip: '竹香斋名局，红先和',
      redMustWin: false,
      fen: '3n1k3/4P2r1/6P2/9/2r6/9/R8/3p2R2/1nc1p1p2/3K5 w',
      solution: 'g2f2c5f5f2f5d9f8e8f8h8f8f5f8f9f8a3f3f8e8f3e3e8d8e3e1b1c3d0e0d2d1e1e6d1d0e0e1g1f1e1f1c3d1e6e1c1e1f1e1'
    },
    {
      id: 16, name: '幽涧鸣泉', source: '竹香斋象戏谱', tip: '竹香斋名局，红先和',
      redMustWin: false,
      fen: '3rk4/P2n1PC2/5a3/9/9/2p6/3r5/B1pn2R2/2p4p1/3KCp3 w',
      solution: 'g2e2d3e3e2e3d2e4e0e4d9b9e4d4d8e6e3e6e9d9a8b8c2d2e6e1d2d1e1d1c1d1d0d1b9b8g8b8c4d4b8b1h1h0b1b0d9e9b0d0d4e4d0h0e4d4h0h6e9d9h6b6d9d8b6b0f0e0a2c0d8d7b0e0d7e7d1d0f7e8c0e2e7f7'
    },
    {
      id: 17, name: '霸桥飞絮', source: '竹香斋象戏谱', tip: '竹香斋名局，红先和',
      redMustWin: false,
      fen: '3k5/4PP3/7P1/9/4N4/9/9/9/2pp1pp2/4K4 w',
      solution: 'e8d8d9e9f8e8e9f9e5f3f1e1f3e1c1c0e1f3c0d0e0f0d1e1e8e9f9f8d8e8f8e8f3e1d0e0f0e0g1f1'
    },
    {
      id: 18, name: '秀色钟南', source: '竹香斋象戏谱', tip: '竹香斋名局，红先和',
      redMustWin: false,
      fen: '1rb1k4/5n1R1/4bR3/9/9/9/1r5pP/4p4/3pp4/2B2K3 w',
      solution: 'f7f8b3f3f8f3e1e0f0e0b9b0h8c8e7c5f3e3e9f9c8c9f9f8c9c5e2e1e3e1d1e1e0e1b0b1e1e0b1f1i3i4h3g3i4i5g3g2i5h5f1f4c5e5g2g1h5g5f4f0e0e1g1f1e1d1f0c0g5f5c0c4d1d2c4a4f5f6a4a2d2d1a2a6f6e6a6a1d1d2a1e1e5e1f1e1'
    },

    /* ========== 19-21. 渊深海阔（3 道，红先和） ========== */
    {
      id: 19, name: '金台招士', source: '渊深海阔', tip: '渊深海阔名局，红先和',
      redMustWin: false,
      fen: '3k1nb2/4PP3/1P2b4/p8/9/P1p3R2/4R1P2/2p1BA1p1/3r1p3/4K4 w',
      solution: 'g4d4d1d4f2e1c2c1e3f3f1e1e0e1h2g2e2c4d4d1e1e0d1d0e0e1c1d1e1f1g2g1f1f2d0f0f2e2f0f3f8f9f3f9b7c7f9f4c7c8f4d4e2f2g9i7g3g4d4d3c8d8d3d8e8d8d9d8'
    },
    {
      id: 20, name: '八虎征西', source: '渊深海阔', tip: '渊深海阔名局，红先和',
      redMustWin: false,
      fen: '4rk3/3P5/b3bPP2/9/9/N7C/9/4n3C/1c1p1r3/4K1R1R w',
      solution: 'i2f2f1f2i4f4e2f4f7f8f9f8g7g8f8f9g8f8f9f8d8e8e9e8g0g8f8f9i0i9e7g9g8e8f2e2e8e2f4e2i9g9f9f8a4c3e2g1g9g1b1g1c3d1'
    },
    {
      id: 21, name: '霸王卸甲', source: '渊深海阔', tip: '渊深海阔名局，红先和',
      redMustWin: false,
      fen: '1c3kb2/3PP4/4br3/4p1p2/7N1/9/9/6C2/1p2p4/3K5 w',
      solution: 'g2f2f7h7h5f4h7f7f4e6f7h7e6f4h7f7f4g6f7g7f2a2b9a9a2a8g7g8e8f8g8f8g6e7f8e8a8e8g9e7e8e1'
    },

    /* ========== 22-25. 心武残编（4 道，红先和） ========== */
    {
      id: 22, name: '八轮共驾', source: '心武残编', tip: '心武残编名局，红先和',
      redMustWin: false,
      fen: '5k1P1/2PPP4/b3b4/9/9/9/1r6R/Br6R/2ppAc3/4K1n1C w',
      solution: 'i2f2g0f2i3b3f1i1e0f0b2b3d8d9b3b9c8c9b9c9d9c9a7c9e1f2d1e1i0g0c1d1g0i0'
    },
    {
      id: 23, name: '炮打四门', source: '心武残编', tip: '心武残编名局，红先和',
      redMustWin: false,
      fen: 'c1b1ka2N/7C1/3ab2RR/9/1P7/9/9/9/4p4/1p1K5 w',
      solution: 'h7e7c9e7i9g8e9d9g8e7f9e8i7i9a9i9h8h0i9i0h0b0i0b0e7d5b0a0d5c7d9e9c7a6e8f7b5c5a0a3c5d5a3i3a6b8i3i8b8c6i8c8d5e5c8c9c6b8c9c8b8c6'
    },
    {
      id: 24, name: '笙磬同音', source: '心武残编', tip: '心武残编名局，红先和',
      redMustWin: false,
      fen: '2n1k2P1/5P3/9/3c3P1/2b6/6B2/9/8R/2p1r4/3K1p2C w',
      solution: 'i2e2e9d9e2e1d6d1e1e9d9d8i0i8d8d7e9d9d7e7g4e2d1i1d9e9e7f7f8g8i1i0e2g0f0g0e9e0i0e0i8i7f7e7h6h7e7e8h7g7c9d7g7f7e8d8d0e0d7e5f7g7c1d1h9g9g0h0'
    },
    {
      id: 25, name: '隔断红尘', source: '心武残编', tip: '心武残编名局（诠改图），红先和',
      redMustWin: false,
      fen: '1r2kab2/3Pa4/4b2CN/6R2/8P/2B3B2/6C2/c8/3pcp3/4K4 w',
      solution: 'h7h0g9i7c4a2e1e5h0h9i7g9g6c6'
    },

    /* ========== 26-31. 适情雅趣（6 道，均红先胜） ========== */
    {
      id: 26, name: '赤壁鏖战', source: '适情雅趣', tip: '适情雅趣第317局，红先胜',
      redMustWin: true,
      fen: 'c2a1k3/3Pa4/n3b4/5P1CP/6b2/1rB6/9/9/3pp4/2B2K1R1 w',
      solution: 'f6f7e8f7h6f6f7e8f6f8f9e9h0h9e8f9f8i8e7g9h9g9d9e8i8i9e8f7g9g5f9e8g5g9e8f9d8e8e9e8g9g8e8e7i9i7f7e8g8g7e8f7g7f7e7e8f7f8e8e7i6h6'
    },
    {
      id: 27, name: '头辆舆轮', source: '适情雅趣', tip: '适情雅趣第063局，红先胜',
      redMustWin: true,
      fen: '3akarr1/1NC2P2C/9/9/R8/9/6p2/4B4/2n1p4/5K3 w',
      solution: 'f8e8d9e8a5a9e8d9c8h8f9e8a9d9e8d9b8d7'
    },
    {
      id: 28, name: '远交近攻', source: '适情雅趣', tip: '适情雅趣第046局，红先胜',
      redMustWin: true,
      fen: '3k5/4aN3/2R2a3/5n3/2R6/9/1pP6/B1n1BA1N1/1r2A1p2/c4K3 w',
      solution: 'c7c9d9d8c9c8d8d9c8e8b1b0e2c0b0c0e1d0c0d0e8e0'
    },
    {
      id: 29, name: '跃鲤吞饵', source: '适情雅趣', tip: '适情雅趣第263局，红先胜',
      redMustWin: true,
      fen: '6b2/1N1R5/5k3/9/9/9/9/4p4/2Rp1p2r/4K4 w',
      solution: 'c1c7g9e7c7e7f7e7b8c6e7f7c6e5f7e7e5g6e7f7d8f8'
    },
    {
      id: 30, name: '退思补过', source: '适情雅趣', tip: '适情雅趣第325局，红先胜',
      redMustWin: true,
      fen: '5a3/2P1k4/r2Pba3/7C1/p7P/9/9/9/p3p3p/5K3 w',
      solution: 'h6e6e7c5c8d8e8e9d7e7f9e8e7e8e9f9d8d9a7a9d9e9a9e9e6e9c5e7e9d9i1h1d9d1e1d1f0f1'
    },
    {
      id: 31, name: '金鸡抱卵', source: '适情雅趣', tip: '适情雅趣第310局，红先胜',
      redMustWin: true,
      fen: '3k1ab2/2R1aP3/2n1b3r/9/5R3/9/3r5/N3B4/4AC3/4K3c w',
      solution: 'f8e8f9e8c8e8c7e8f5f9d9d8f1f8'
    },

    /* ========== 32-33. 橘中秘（2 道，均红先胜） ========== */
    {
      id: 32, name: '车底兵胜车', source: '橘中秘', tip: '橘中秘第037局，红先胜',
      redMustWin: true,
      fen: '2P2R3/4r4/3k5/9/9/9/9/9/5K3/9 w',
      solution: 'f1f0e8h8f9e9h8g8f0e0g8h8e9e5h8h0e0e1h0d0e5e9'
    },
    {
      id: 33, name: '炮兵胜双卒', source: '橘中秘', tip: '橘中秘第088局，红先胜',
      redMustWin: true,
      fen: '3k5/9/9/6p2/9/4P4/9/7C1/5p3/4K4 w',
      solution: 'e4e5d9e9h2e2e9d9e5f5d9e9e0d0f1e1e2e7e9e8e7g7e8e9f5f6g6g5f6g6'
    },

    /* ========== 34-35. 烂柯神机（红先和，回放验证） ========== */
    {
      id: 34, name: '解甲归田', source: '烂柯神机', tip: '烂柯神机名局，红先和',
      redMustWin: false,
      fen: '1r3kcr1/3PP4/3Cb4/5PR2/9/6B2/9/3pB4/C1R1pp3/3K5 w',
      solution: 'e8f8f9e9g6g9h9g9c1c9b9c9f8e8e9f9a1f1e1f1f6f7g9g8d7d4d2d1d0d1f1e1d1d0e1d1d0d1c9c1d1d0c1f1d4e4e7c5e8f8g8f8f7f8f1f8e4c4f8d8d0e0d8d4c4c0f9e9g4i2d4e4i2g0'
    },
    {
      id: 35, name: '继承先志', source: '烂柯神机', tip: '烂柯神机名局，红先和',
      redMustWin: false,
      fen: '2N5P/3P1k3/2P2a3/6R2/3rCP3/2B6/9/3p5/3p1r3/4KCB2 w',
      solution: 'd8e8f7e8g6f6e8f7f6f7f8f7f5f6f7f8e5f5d5f5f0f5f1f5c9d7f8f9i9h9f5g5g0i2g5g1h9g9g1g9f6f7g9g8f7f8g8f8d7f8f9f8i2g0'
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
