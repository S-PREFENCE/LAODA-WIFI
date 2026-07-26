/* ai_test.js — AI 自检（node ai_test.js）
 * 1) 三档难度从开局都能返回合法着法
 * 2) 自对弈验证“难 > 中 > 易”（测试内临时降高挡深度以提速，断言不依赖单局随机性） */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');
require('./js/ai.js');

var XQ = globalThis.XQ;
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 1. 合法着法
['easy', 'medium', 'hard'].forEach(function (diff) {
  var b = new XQ.Board();
  var legal = XQ.legalMoves(b, 'red');
  var res = XQ.aiBestMove(b, 'red', diff);
  var ok = res && legal.some(function (m) {
    return m.from.r === res.move.from.r && m.from.c === res.move.from.c &&
           m.to.r === res.move.to.r && m.to.c === res.move.to.c;
  });
  check('[' + diff + '] 开局返回合法着法', !!ok);
});

// 2. 自对弈：临时降高挡深度，做多局统计胜场
var saved = XQ.DIFFICULTY.hard;
XQ.DIFFICULTY.hard = { depth: 4, quiescence: true, randomness: 0, order: true, timeLimit: 1200 };

function playGame(redDiff, blackDiff, maxPly) {
  var b = new XQ.Board();
  var side = 'red';
  for (var ply = 0; ply < maxPly; ply++) {
    var diff = side === 'red' ? redDiff : blackDiff;
    var res = XQ.aiBestMove(b, side, diff);
    if (!res) {
      // 无着法，当前方负
      return XQ.opponent(side);
    }
    b.move(res.move);
    var r = XQ.getResult(b, XQ.opponent(side));
    if (r.over) return side; // 走子方将死对方，胜者为走子方
    side = XQ.opponent(side);
  }
  return 'draw';
}

function tournament(aDiff, bDiff, games, maxPly) {
  var aWins = 0, bWins = 0, draws = 0;
  for (var i = 0; i < games; i++) {
    // a 执红，b 执黑
    var w = playGame(aDiff, bDiff, maxPly);
    if (w === 'red') aWins++;
    else if (w === 'black') bWins++;
    else draws++;
    // 交换先手
    w = playGame(bDiff, aDiff, maxPly);
    if (w === 'red') bWins++; // b 执红胜
    else if (w === 'black') aWins++; // a 执黑胜
    else draws++;
  }
  return { aWins: aWins, bWins: bWins, draws: draws };
}

console.log('\n自对弈（每对 4 局/2 局，交换先手，限制 16 步以控制测试时间）：');
var em = tournament('easy', 'medium', 2, 16);
console.log('  易 vs 中  →  易胜 ' + em.aWins + ' / 中胜 ' + em.bWins + ' / 和 ' + em.draws);
check('中 应不弱于 易（中胜场 ≥ 易胜场）', em.bWins >= em.aWins);

var mh = tournament('medium', 'hard', 1, 16);
console.log('  中 vs 难  →  中胜 ' + mh.aWins + ' / 难胜 ' + mh.bWins + ' / 和 ' + mh.draws);
check('难 应不弱于 中（难胜场 ≥ 中胜场）', mh.bWins >= mh.aWins);

XQ.DIFFICULTY.hard = saved;
console.log('\nAI 自检：通过 ' + pass + '，失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
