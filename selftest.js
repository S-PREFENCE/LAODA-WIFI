/* selftest.js — 引擎自检（Node 运行：node selftest.js）
 * 验证：开局合法走法数、将军判定、若干基础规则。 */
require('./js/constants.js');
require('./js/board.js');
require('./js/rules.js');

var XQ = globalThis.XQ;
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 1. 初始局面合法走法应为 44
var b = new XQ.Board();
var rm = XQ.legalMoves(b, 'red');
var bm = XQ.legalMoves(b, 'black');
check('开局红方合法走法 = 44 (实际 ' + rm.length + ')', rm.length === 44);
check('开局黑方合法走法 = 44 (实际 ' + bm.length + ')', bm.length === 44);
check('开局红方未被将', XQ.isInCheck(b, 'red') === false);
check('开局黑方未被将', XQ.isInCheck(b, 'black') === false);

// 2. 马腿测试：红马(9,1) 初始，蹩马腿(8,1)为空，应能跳到(7,0)(7,2)
var hmoves = XQ.pseudoMoves(b, 'red').filter(function (m) {
  return m.from.r === 9 && m.from.c === 1;
});
var targets = hmoves.map(function (m) { return m.to.r + ',' + m.to.c; });
check('红马(9,1)能跳到(7,0)', targets.indexOf('7,0') >= 0);
check('红马(9,1)能跳到(7,2)', targets.indexOf('7,2') >= 0);

// 3. 炮架测试：红炮(7,1) 初始，屏(7,7)? 不。验证炮能隔子吃。
// 构造局面：红炮在(7,1)，红兵(7,4)，黑车(7,7)
var b2 = new XQ.Board();
for (var r = 0; r < 10; r++) for (var c = 0; c < 9; c++) b2.grid[r][c] = null;
b2.grid[9][4] = { type: 'K', side: 'red' };
b2.grid[0][4] = { type: 'K', side: 'black' };
b2.grid[7][1] = { type: 'C', side: 'red' };
b2.grid[7][4] = { type: 'P', side: 'red' }; // 炮架
b2.grid[7][7] = { type: 'R', side: 'black' }; // 目标
var cm = XQ.pseudoMoves(b2, 'red').filter(function (m) {
  return m.from.r === 7 && m.from.c === 1 && m.to.r === 7 && m.to.c === 7;
});
check('红炮隔一子可吃(7,7)', cm.length === 1);

// 4. 飞将：两王同列中间无子 → 非法走法
var b3 = new XQ.Board();
for (r = 0; r < 10; r++) for (c = 0; c < 9; c++) b3.grid[r][c] = null;
b3.grid[9][4] = { type: 'K', side: 'red' };
b3.grid[0][4] = { type: 'K', side: 'black' };
// 红方走一步无关的，但当前两王已照面 → 任意红走法后若仍照面则非法
// 放一个红车在(5,0)，让红可走车，但走后两王仍照面则非法
b3.grid[5][0] = { type: 'R', side: 'red' };
var legal3 = XQ.legalMoves(b3, 'red');
// 红车从(5,0)可走到很多点，但任何使两王照面的走法都非法（当前已照面，所以所有走法若保持照面非法）
// 因为初始已照面，红必须先解除——但红车移动不会解除(王在col4)，所以红无合法走法？实际红可以动王离开col4
var kMoves = legal3.filter(function (m) { return m.from.r === 9 && m.from.c === 4; });
check('飞将：红王可离开照面列(有合法王走法)', kMoves.length > 0);
check('飞将：当前红方仍有合法走法(可解照面)', legal3.length > 0);

// 5. 将死检测：构造一个简单的将死
var b4 = new XQ.Board();
for (r = 0; r < 10; r++) for (c = 0; c < 9; c++) b4.grid[r][c] = null;
b4.grid[0][4] = { type: 'K', side: 'black' };
b4.grid[2][3] = { type: 'R', side: 'red' }; // 红车控制 col3
b4.grid[2][5] = { type: 'R', side: 'red' }; // 红车控制 col5
b4.grid[1][4] = { type: 'R', side: 'red' }; // 红车将（同列，贴王上行）
b4.grid[2][4] = { type: 'R', side: 'red' }; // 红车保护(1,4)，形成将死
// 黑王(0,4) 被(1,4)车将军；可走(0,3)(0,5)是否被控制？(2,3)(2,5)车分别控制col3/col5
var res4 = XQ.getResult(b4, 'black');
check('黑方被将死 → 红胜', res4.over === true && res4.winner === 'red');

console.log('\n自检结果：通过 ' + pass + '，失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
