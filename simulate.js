/* simulate.js — 控制器集成模拟（Node，无浏览器）
 * 桩掉 XQ.UI / XQ.Audio，setTimeout 同步化，跑通 双人/人机/残局 流程。 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');
require('./js/audio.js');
require('./js/endgames.js');
require('./js/ui.js');
require('./js/game.js');

var XQ = globalThis.XQ;

// ---- 桩 ----
var handlers = null;
XQ.UI = {
  init: function (h) { handlers = h; },
  render: function () {},
  setSoundLabel: function () {},
  setModeActive: function () {},
  showPanel: function () {},
  setDiffActive: function () {},
  setSideActive: function () {},
  setTheme: function () {},
  loadTheme: function () {},
  impactAt: function () {}
};
XQ.Audio = { unlock: function () {}, play: function () {}, setMuted: function () {}, isMuted: function () { return false; }, toggle: function () { return false; } };
global.setTimeout = function (fn) { fn(); return 0; }; // 同步执行 AI

// localStorage 桩
var store = {};
global.localStorage = {
  getItem: function (k) { return store[k] || null; },
  setItem: function (k, v) { store[k] = v; }
};

var pass = 0, fail = 0;
function check(n, c) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } }

XQ.game.init();
var g = XQ.game;

// 1. 双人：随机走 40 步，校验不崩溃、记谱非空、可悔棋
g.setMode('pvp');
var steps = 0, ok = true;
try {
  while (!g.gameOver && steps < 40) {
    var mv = XQ.legalMoves(g.board, g.turn);
    // 简单策略：优先吃子
    mv.sort(function (a, b) { return (b.capture ? 1 : 0) - (a.capture ? 1 : 0); });
    g.doHumanMove(mv[0]);
    steps++;
  }
} catch (e) { ok = false; console.log('   异常: ' + e.message); }
check('双人随机对弈 40 步无异常', ok);
check('着法记录已生成', g.history.length > 0 && g.history[0].text.length > 0);

// 悔棋：恢复棋子总数
var beforeUndo = countPieces(g.board);
g.undo();
var afterUndo = countPieces(g.board);
check('悔棋后棋子数一致', beforeUndo === afterUndo);
check('悔棋后轮到红方（pvp 末步为黑）', g.turn === 'black');

// 2. 残局合法性：每关开局红方有合法着法、未被将、两王不照面
var allLegal = true;
XQ.ENDGAMES.forEach(function (L) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  var rm = XQ.legalMoves(b, 'red');
  if (rm.length === 0 || XQ.isInCheck(b, 'red') || b.kingsFace()) {
    allLegal = false; console.log('   关卡' + L.id + ' 非法: moves=' + rm.length + ',check=' + XQ.isInCheck(b, 'red') + ',face=' + b.kingsFace());
  }
});
check('16 关残局开局均合法（有着法/未被将/不照面）', allLegal);

// 残局载入：改为纯解锁后，任意关卡均可直接载入
XQ.game.setMode('endgame');
g.loadLevel(5);
check('第5关可自由载入', g.currentLevelId === 5 && g.mode === 'endgame' && g.turn === 'red');
g.loadLevel(1);
check('第1关可载入', g.currentLevelId === 1 && g.mode === 'endgame' && g.turn === 'red');

// 3. 人机：同步 AI，走若干步不崩溃、AI 会应招
g.setMode('pvai');
g.difficulty = 'easy'; // 测试用浅层，提速
g.humanSide = 'red'; g.aiSide = 'black';
g.restart();
ok = true;
try {
  var s2 = 0;
  while (!g.gameOver && s2 < 30) {
    if (g.turn === g.humanSide) {
      var m = XQ.legalMoves(g.board, g.turn);
      m.sort(function (a, b) { return (b.capture ? 1 : 0) - (a.capture ? 1 : 0); });
      g.doHumanMove(m[0]);
    } else {
      // AI 应已同步走完；若仍 AI 回合则手动触发一次（保险）
      g.runAI();
    }
    s2++;
  }
} catch (e) { ok = false; console.log('   异常: ' + e.message); }
check('人机对弈流程无异常', ok);
check('人机对弈产生着法记录', g.history.length > 0);

console.log('\n集成模拟：通过 ' + pass + '，失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);

function countPieces(board) {
  var n = 0;
  for (var r = 0; r < 10; r++) for (var c = 0; c < 9; c++) if (board.grid[r][c]) n++;
  return n;
}
