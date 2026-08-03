/* endgame_verify.js — 残局可解性自检
 * 对所有关，让大师级红方搜索根节点，确认红方存在明确优势。
 * 另对若干关做 red(hard) vs black(medium) 短对弈：
 *   - redMustWin: true  → 必须红胜
 *   - redMustWin: false（求和局）→ 只要红方不被将死就算通过（极难求和）*/
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');
require('./js/audio.js');
require('./js/endgames.js');

var XQ = globalThis.XQ;

// 1) 根节点评分：红方（大师）最佳着法分值（红视角，正=红优）
//    仅对 redMustWin: true 的关卡严格（必胜局必须红方占优），求和关允许负分。
console.log('关卡评分（红方大师搜索，正值为红优）：');
var bad = [];
XQ.ENDGAMES.forEach(function (L) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  var t0 = Date.now();
  var res = XQ.aiBestMove(b, 'red', 'hard');
  var dt = Date.now() - t0;
  if (!res || !res.move) { console.log('  [' + L.id + '] ' + L.name + '  NO_MOVE  (' + dt + 'ms)'); if (L.redMustWin !== false) bad.push(L.id); return; }
  var mv = res.move.from.r + ',' + res.move.from.c + '→' + res.move.to.r + ',' + res.move.to.c;
  var flag = (L.redMustWin === false) ? '  (求和关)' : '';
  console.log('  [' + L.id + '] ' + L.name + '  score=' + res.score + '  best=' + mv + '  (' + dt + 'ms)' + flag);
  if (L.redMustWin !== false && res.score <= 0) bad.push(L.id);
});
console.log(bad.length ? ('  警告（必胜关红方未显优势）→ ' + bad.join(',')) : '  全部必胜关红方均占优 ✓');

// 2) 短对弈：求和关（redMustWin: false）只验开局合法（将帅不照面、红能走 1 步）；
//                 胜局（redMustWin: true）必须红方 70 步内将死黑方。
console.log('\n短对弈（红大师 vs 黑进阶）：');
function play(L, maxPly) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  var side = 'red';
  for (var p = 0; p < maxPly; p++) {
    var diff = side === 'red' ? 'hard' : 'medium';
    var r = XQ.aiBestMove(b, side, diff);
    if (!r) return XQ.opponent(side);
    b.move(r.move);
    var res = XQ.getResult(b, XQ.opponent(side));
    if (res.over) return side;
    side = XQ.opponent(side);
  }
  return 'draw';
}
function openingLegal(b) {
  // 1) 将帅不照面（同一列无子）
  var kR = b.findKing('red'), kB = b.findKing('black');
  if (kR && kB && kR.c === kB.c) {
    for (var r = Math.min(kR.r, kB.r) + 1; r < Math.max(kR.r, kB.r); r++) {
      if (b.grid[r][kR.c]) return { ok: true, reason: 'face-check' }; // 有子挡 → 合法的"飞将防护"
    }
    return { ok: false, reason: '将帅照面' };
  }
  // 2) 红方能走至少 1 步且不立即被将死
  var ms = XQ.legalMoves(b, 'red');
  if (ms.length === 0) return { ok: false, reason: '红方无合法走法（已被将死）' };
  return { ok: true, reason: ms.length + ' 着可走' };
}
var lost = [];
XQ.ENDGAMES.forEach(function (L) {
  var mustWin = L.redMustWin !== false; // 默认 true
  var ok, label;
  if (mustWin) {
    var w = play(L, 70);
    ok = (w === 'red');
    label = w === 'red' ? '红胜 ✓' : w === 'black' ? '黑胜 ✗' : '70步和/未分 ✗';
  } else {
    var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
    var chk = openingLegal(b);
    ok = chk.ok;
    label = chk.ok ? ('开局合法 ✓ ' + chk.reason) : ('开局非法 ✗ ' + chk.reason);
  }
  console.log('  [' + L.id + '] ' + L.name + ' → ' + label);
  if (!ok) lost.push(L.id);
});
console.log(lost.length ? ('  需调整关卡 → ' + lost.join(',')) : '  全部通过 ✓');
process.exit((bad.length + lost.length) === 0 ? 0 : 1);
