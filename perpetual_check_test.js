/* perpetual_check_test.js — 长将 / 重复局面判定单元测试（Node：node perpetual_check_test.js）
 * 验证：
 *   1. boardKey 确定性 / 区分红黑
 *   2. 无重复 → null
 *   3. 三次重复且循环方每步都将军 → 长将，负方为来回走子方
 *   4. 三次重复但循环方并非每步将军 → 和棋
 *   5. 仅两次重复（未达阈值）→ null
 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');

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

// 2. 无重复 → null
assert('无重复返回 null', XQ.analyzeRepetition(
  [{ pos: 'a', turn: 'red' }, { pos: 'b', turn: 'black' }, { pos: 'c', turn: 'red' }],
  [{ side: 'red', check: false }, { side: 'black', check: false }]
) === null);

// 3. 三次重复 + 循环方(black)每步将军 → 长将，loser=black
(function () {
  var positions = [
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }
  ];
  var history = [
    { side: 'red', check: false }, { side: 'black', check: true },
    { side: 'red', check: false }, { side: 'black', check: true }
  ];
  var r = XQ.analyzeRepetition(positions, history);
  assert('长将判定返回 perpetual-check', r && r.result === 'perpetual-check');
  assert('长将负方为来回走子方(black)', r && r.loser === 'black');
  assert('长将胜方为对手(red)', r && XQ.opponent(r.loser) === 'red');
})();

// 4. 三次重复但循环方并非每步将军 → 和棋
(function () {
  var positions = [
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }, { pos: 'P1', turn: 'black' },
    { pos: 'P0', turn: 'red' }
  ];
  var history = [
    { side: 'red', check: false }, { side: 'black', check: false },
    { side: 'red', check: false }, { side: 'black', check: false }
  ];
  var r = XQ.analyzeRepetition(positions, history);
  assert('非长将重复判定为 draw', r && r.result === 'draw');
})();

// 5. 仅两次重复（未达阈值）→ null
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

console.log('\n长将/重复判定测试：通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
