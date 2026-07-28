/* perpetual_check_test.js — 连续将军禁手 / 重复局面 单元测试（Node：node perpetual_check_test.js）
 * 验证：
 *   1. boardKey 确定性 / 区分红黑
 *   2. wouldCheck：将军着法识别正确
 *   3. 三次重复 → 判和（不再因长将判负）
 *   4. 仅两次重复（未达阈值）→ null
 *   5. recomputeCheckBan：连续 3 次将军 → 该方被禁手；走非将军着法后解除
 *   6. isForbiddenCheck：被禁手方走将军着法被拦截；走非将军着法放行
 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');
require('./js/game.js');

var XQ = globalThis.XQ;
var pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 1. boardKey
var bA = { get: function (r, c) { return (r === 0 && c === 0) ? { side: 'red', type: 'K' } : null; } };
var bB = { get: function (r, c) { return (r === 0 && c === 0) ? { side: 'red', type: 'K' } : null; } };
assert('boardKey 确定性', XQ.boardKey(bA) === XQ.boardKey(bB));
var bRed = { get: function (r, c) { return (r + c === 0) ? { side: 'red', type: 'K' } : null; } };
var bBlack = { get: function (r, c) { return (r + c === 0) ? { side: 'black', type: 'K' } : null; } };
assert('boardKey 区分红黑', XQ.boardKey(bRed) !== XQ.boardKey(bBlack));

// 2. wouldCheck（构造一个红方车可将军黑将的局面）
function emptyGrid() {
  var g = [];
  for (var r = 0; r < 10; r++) { g.push(new Array(9).fill(null)); }
  return g;
}
var grid = emptyGrid();
grid[9][4] = { side: 'red', type: 'K' };   // 红帅
grid[0][3] = { side: 'black', type: 'K' };  // 黑将
grid[0][0] = { side: 'red', type: 'R' };    // 红车
var board = new XQ.Board(grid);
assert('wouldCheck：车(0,0)->(0,2) 形成将军', XQ.wouldCheck(board, { from: { r: 0, c: 0 }, to: { r: 0, c: 2 } }, 'red') === true);
assert('wouldCheck：车(0,0)->(1,0) 非将军', XQ.wouldCheck(board, { from: { r: 0, c: 0 }, to: { r: 1, c: 0 } }, 'red') === false);

// 3. 三次重复 → 判和（长将不再判负）
(function () {
  var positions = [
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }
  ];
  var history = [
    { side: 'red', check: true }, { side: 'black', check: true },
    { side: 'red', check: true }, { side: 'black', check: true }
  ];
  var r = XQ.analyzeRepetition(positions, history);
  assert('三次重复判定为 draw（不再 perpetual-check 判负）', r && r.result === 'draw' && !r.loser);
})();

// 4. 仅两次重复（未达阈值）→ null
(function () {
  var positions = [
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' }
  ];
  var history = [
    { side: 'red', check: true }, { side: 'black', check: true },
    { side: 'red', check: true }
  ];
  var r = XQ.analyzeRepetition(positions, history);
  assert('两次重复未达阈值返回 null', r === null);
})();

// 5 & 6. 连续将军禁手逻辑（走子层）
(function () {
  var g = XQ.game;
  g.board = board;
  g.history = [];
  g.consecutiveChecks = { red: 0, black: 0 };
  g.checkBanned = { red: false, black: false };

  // 红方连续 3 次将军（中间黑方走非将军着法），随后应被禁手
  g.history = [
    { side: 'red', check: true }, { side: 'black', check: false },
    { side: 'red', check: true }, { side: 'black', check: false },
    { side: 'red', check: true }
  ];
  g.recomputeCheckBan();
  assert('连续3次将军后 red 被禁手', g.checkBanned.red === true);
  assert('连续3次将军后 black 未被禁手', g.checkBanned.black === false);

  var checkMove = { from: { r: 0, c: 0 }, to: { r: 0, c: 2 } };
  var nonCheckMove = { from: { r: 0, c: 0 }, to: { r: 1, c: 0 } };
  assert('被禁手方走将军着法 → 拦截', g.isForbiddenCheck('red', checkMove) === true);
  assert('被禁手方走非将军着法 → 放行', g.isForbiddenCheck('red', nonCheckMove) === false);
  assert('未禁手方走将军着法 → 放行', g.isForbiddenCheck('black', checkMove) === false);

  // 红方改走一步非将军着法，连续计数清零，禁手解除
  g.history.push({ side: 'red', check: false });
  g.recomputeCheckBan();
  assert('走非将军着法后 red 禁手解除', g.checkBanned.red === false);
  assert('禁手解除后红方将军着法放行', g.isForbiddenCheck('red', checkMove) === false);
})();

console.log('\n连续将军禁手 / 重复判定测试：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
