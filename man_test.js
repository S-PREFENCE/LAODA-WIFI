/* man_test.js — MAN 交互自测：求和 / 悔棋 / 再来一局 / 断线凭码重连
 * 全部走「双方确认」与「服务端权威」，验证联机版三项交互工作正常。
 * 用法：node man_test.js   （子进程启动 server.js，测试完自动关闭） */
'use strict';
const { spawn } = require('child_process');

const PORT = 3399;
const WS = global.WebSocket;
if (!WS) { console.error('当前 Node 无全局 WebSocket，需 Node 22+'); process.exit(2); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeClient() {
  const ws = new WS(`ws://127.0.0.1:${PORT}`);
  const q = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const raw = (typeof ev.data === 'string') ? ev.data : Buffer.from(ev.data).toString('utf-8');
    const m = JSON.parse(raw);
    // 只把消息交给「谓词匹配」的等待者；否则入队，供后续 next 匹配
    const wi = waiters.findIndex(w => !w.pred || w.pred(m));
    if (wi >= 0) { const w = waiters.splice(wi, 1)[0]; w.fn(m); }
    else q.push(m);
  };
  return {
    send: (o) => ws.send(JSON.stringify(o)),
    queue: () => q.slice(),
    clear: () => { q.length = 0; waiters.length = 0; },
    close: () => { try { ws.close(); } catch (e) {} },
    ready: () => new Promise(res => { if (ws.readyState === 1) return res(); ws.onopen = res; }),
    next: (pred, ms = 3000, label) => new Promise((res, rej) => {
      const i = q.findIndex(m => !pred || pred(m));
      if (i >= 0) { res(q.splice(i, 1)[0]); return; }
      const waiter = { pred: pred, fn: (m) => { clearTimeout(to); res(m); } };
      waiters.push(waiter);
      const to = setTimeout(() => {
        const wi = waiters.indexOf(waiter);
        if (wi >= 0) waiters.splice(wi, 1);
        rej(new Error('等待消息超时 @ ' + (label || '?') + ' | 队列: ' + q.map(m => m.type).join(',')));
      }, ms);
    })
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name); }
}

async function setup() {
  const A = makeClient(); await A.ready();
  const B = makeClient(); await B.ready();
  A.send({ type: 'create' });
  const created = await A.next(m => m.type === 'created');
  const code = created.room;
  B.send({ type: 'join', room: code });
  await B.next(m => m.type === 'joined');
  await A.next(m => m.type === 'start');
  await B.next(m => m.type === 'start');
  // 排出握手阶段下发的 state（首局/重连），避免污染后续断言
  await A.next(m => m.type === 'state');
  await B.next(m => m.type === 'state');
  A.clear(); B.clear();
  return { A, B, code };
}

(async () => {
  // 默认用 node server.js；设置 SERVER_BIN=python 可验证 server.py 等价实现
  const bin = process.env.SERVER_BIN === 'python'
    ? ['C:\\Users\\ZhuanZ\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe', 'server.py']
    : ['node', 'server.js'];
  const server = spawn(bin[0], [bin[1], String(PORT)], { cwd: __dirname, stdio: 'ignore' });
  await sleep(800);

  try {
    /* ---------- 1) 求和（双方确认） ---------- */
    console.log('\n[1] 求和中继与双方确认');
    let s = await setup();
    s.A.send({ type: 'draw_offer' });
    const bOffer = await s.B.next(m => m.type === 'draw_offer');
    check('求和请求已中继给对手', bOffer && bOffer.from === 'red');
    s.B.send({ type: 'draw_accept' });
    const aOver = await s.A.next(m => m.type === 'game_over');
    const bOver = await s.B.next(m => m.type === 'game_over');
    check('和棋后双方收到 game_over(winner=draw)', aOver.winner === 'draw' && bOver.winner === 'draw');
    s.A.close(); s.B.close();

    /* ---------- 2) 悔棋（双方确认 + 服务端回滚） ---------- */
    console.log('\n[2] 悔棋请求与权威回滚');
    s = await setup();
    s.A.send({ type: 'move', from: { r: 9, c: 1 }, to: { r: 7, c: 2 } }); // 红马起步
    await s.B.next(m => m.type === 'move', 3000, 'T2-B-move');
    s.A.send({ type: 'undo_request' });
    const bUndoReq = await s.B.next(m => m.type === 'undo_request', 3000, 'T2-B-undoReq');
    check('悔棋请求已中继给对手', bUndoReq && bUndoReq.from === 'red');
    s.B.send({ type: 'undo_accept' });
    const aState = await s.A.next(m => m.type === 'state', 3000, 'T2-A-state');
    const bState = await s.B.next(m => m.type === 'state', 3000, 'T2-B-state');
    check('双方收到回滚后的全量棋盘', aState.appliedUndo === true && bState.appliedUndo === true);
    check('回滚后历史为空（撤回了一步）', aState.history.length === 0);
    check('回滚后红马归位(9,1)且(7,2)清空', aState.board[9][1] === 'rH' && aState.board[7][2] === null);
    check('回滚后轮到红方', aState.turn === 'red');
    s.A.close(); s.B.close();

    /* ---------- 3) 再来一局（房间复用，无需重建） ---------- */
    console.log('\n[3] 对局结束后再来一局（房间码不变）');
    s = await setup();
    s.A.send({ type: 'resign' });
    await s.A.next(m => m.type === 'resigned');
    await s.B.next(m => m.type === 'resigned');
    s.A.send({ type: 'rematch' });
    const aStart = await s.A.next(m => m.type === 'start');
    const bStart = await s.B.next(m => m.type === 'start');
    check('再来一局双方重新开局', aStart.color === 'red' && bStart.color === 'black');
    // 重开后红方走一步应被中继（验证房间仍可用）
    s.A.send({ type: 'move', from: { r: 9, c: 1 }, to: { r: 7, c: 2 } });
    const bMove2 = await s.B.next(m => m.type === 'move');
    check('再来一局后棋步仍正常同步', bMove2 && bMove2.from.r === 9 && bMove2.to.r === 7);
    s.A.close(); s.B.close();

    /* ---------- 4) 断线凭房间码重连，棋盘保留 ---------- */
    console.log('\n[4] 一方断线后凭房间码重连恢复对局');
    s = await setup();
    s.A.send({ type: 'move', from: { r: 9, c: 1 }, to: { r: 7, c: 2 } });
    await s.B.next(m => m.type === 'move');
    // A 断线
    s.A.close();
    const bLeft = await s.B.next(m => m.type === 'opponent_left');
    check('对手离开时另一方收到通知', !!bLeft);
    await sleep(300);
    // A 用新连接凭同一房间码回归
    const A2 = makeClient(); await A2.ready();
    A2.send({ type: 'join', room: s.code });
    const aState2 = await A2.next(m => m.type === 'state');
    const bState2 = await s.B.next(m => m.type === 'state');
    check('重连后双方收到恢复态(resumed)', aState2.resumed === true && bState2.resumed === true);
    check('重连后双方就位(ready)', aState2.ready === true && bState2.ready === true);
    check('重连后棋盘保留（红马在7,2）', aState2.board[7][2] === 'rH');
    check('重连后轮到黑方（上一手红走完）', aState2.turn === 'black');
    A2.close(); s.B.close();

    console.log('\nMAN 交互自测结果：' + pass + ' 通过 / ' + fail + ' 失败');
  } catch (e) {
    console.error('自测异常：', e.message);
    fail++;
  } finally {
    server.kill();
    await sleep(200);
    process.exit(fail === 0 ? 0 : 1);
  }
})();
