/* ladder_test.js — AI 难度阶梯验证
 * 目标：证明「每升一档明显更强」。核心指标：三档在 16 关残局根节点的
 * 评分，以及各自能「识别为强制将死」(score >= 999990) 的关卡数。
 * 深搜 + 静止搜索 让高挡能看见浅挡看不见的杀着。
 * 注：为公平比较「纯搜索强度」，临时把 easy 的随机扰动关掉（游戏中才开）。 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');
require('./js/audio.js');
require('./js/endgames.js');

var XQ = globalThis.XQ;

// 关掉 easy 的随机扰动，做纯搜索强度对比（不影响游戏文件）
var savedRandom = XQ.DIFFICULTY.easy.randomness;
XQ.DIFFICULTY.easy.randomness = 0;

var MATE_THRESH = 999990;
function rootScore(L, tier) {
  var b = new XQ.Board(XQ.buildEndgameBoard(L.pieces));
  return XQ.aiBestMove(b, 'red', tier).score;
}

var tiers = ['easy', 'medium', 'hard'];
var mateCount = { easy: 0, medium: 0, hard: 0 };
var maxDiff = 0; // 记录 hard 比 easy 高出的幅度

console.log('难度阶梯（红方大师视角根评分，>=999990 即识别为强制将死）：\n');
console.log('  关  名           ' + tiers.map(function (t) { return (t + '     ').slice(0, 7); }).join(' '));
XQ.ENDGAMES.forEach(function (L) {
  var sc = {};
  tiers.forEach(function (t) { sc[t] = rootScore(L, t); });
  if (sc.easy >= MATE_THRESH) mateCount.easy++;
  if (sc.medium >= MATE_THRESH) mateCount.medium++;
  if (sc.hard >= MATE_THRESH) mateCount.hard++;
  maxDiff = Math.max(maxDiff, sc.hard - sc.easy);
  var row = '  [' + ('' + L.id).padStart(2) + '] ' + (L.name + '            ').slice(0, 12) + ' ' +
    tiers.map(function (t) {
      var v = sc[t];
      var s = v >= MATE_THRESH ? 'M' + (1000000 - v) : '' + v;
      return (s + '      ').slice(0, 7);
    }).join(' ');
  console.log(row);
});

console.log('\n识别为强制将死的关卡数：');
console.log('  easy   = ' + mateCount.easy + ' / 16');
console.log('  medium = ' + mateCount.medium + ' / 16');
console.log('  hard   = ' + mateCount.hard + ' / 16');
console.log('\nhard 相对 easy 的最大评分领先：' + maxDiff + ' 分（子力单位，1000≈一车）');

// 期望：阶梯递增（高挡识别更多将死；且 hard 严格多于 easy，并覆盖全部 13 个强制将死关）
var okLadder = mateCount.easy <= mateCount.medium && mateCount.medium <= mateCount.hard;
var okHardAll = mateCount.hard >= 13;            // 16 关中有 13 关为强制将死根分
var okHardBeatsEasy = mateCount.hard > mateCount.easy;
console.log('\n阶梯判定：' + (okLadder ? '✓ 递增（easy≤medium≤hard）' : '✗ 非递增') );
console.log('高挡覆盖：' + (okHardAll ? '✓ hard 识别全部 13 个强制将死关' : '✗ hard 漏识别') );
console.log('强于低挡：' + (okHardBeatsEasy ? '✓ hard(' + mateCount.hard + ') > easy(' + mateCount.easy + ') 识别将死数' : '✗') );

// 恢复（本进程结束无所谓，但保持良好习惯）
XQ.DIFFICULTY.easy.randomness = savedRandom;

process.exit(okLadder && okHardAll && okHardBeatsEasy ? 0 : 1);
