/* endgame_verify.js — 残局可解性自检
 * 对 16 关，让大师级红方搜索根节点，确认红方存在明确优势（可解且难）。
 * 另对若干关做 red(hard) vs black(medium) 短对弈，确认红方确实能赢。 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');
require('./js/audio.js');
require('./js/endgames.js');

var XQ = globalThis.XQ;

// 1) 根节点评分：红方（大师）最佳着法分值（红视角，正=红优）
console.log('关卡评分（红方大师搜索，正值为红优）：');
var bad = [];
XQ.ENDGAMES.forEach(function (L) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  var t0 = Date.now();
  var res = XQ.aiBestMove(b, 'red', 'hard');
  var dt = Date.now() - t0;
  var mv = res.move.from.r + ',' + res.move.from.c + '→' + res.move.to.r + ',' + res.move.to.c;
  console.log('  [' + L.id + '] ' + L.name + '  score=' + res.score + '  best=' + mv + '  (' + dt + 'ms)');
  if (res.score <= 0) bad.push(L.id);
});
console.log(bad.length ? ('  警告：以下关卡红方未显优势 → ' + bad.join(',')) : '  全部关卡红方均占优 ✓');

// 2) 短对弈确认红能赢（红=hard，黑=medium，限制步数）
console.log('\n短对弈（红大师 vs 黑进阶，验证可胜）：');
function play(L, maxPly) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  var side = 'red';
  for (var p = 0; p < maxPly; p++) {
    var diff = side === 'red' ? 'hard' : 'medium';
    var r = XQ.aiBestMove(b, side, diff);
    if (!r) return XQ.opponent(side);
    b.move(r.move);
    var res = XQ.getResult(b, XQ.opponent(side));
    if (res.over) return side; // 走子方将死对方
    side = XQ.opponent(side);
  }
  return 'draw';
}
var lost = [];
XQ.ENDGAMES.forEach(function (L) {
  var w = play(L, 70);
  console.log('  [' + L.id + '] ' + L.name + ' → ' + (w === 'red' ? '红胜 ✓' : w === 'black' ? '黑胜 ✗' : '和/未分'));
  if (w !== 'red') lost.push(L.id);
});
console.log(lost.length ? ('  需调整关卡 → ' + lost.join(',')) : '  全部红胜 ✓');
process.exit((bad.length + lost.length) === 0 ? 0 : 1);
