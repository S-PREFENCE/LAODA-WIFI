/* net_test.js — 联机逻辑自测（Node 全局 WebSocket 模拟两名玩家）
 * 验证：创建房间 → 加入 → 开局 → 合法走子双向同步 → 非法走法被服务端拒绝 → 认输广播。
 * 用法：node net_test.js   （会在子进程启动 server.js，测试完自动关闭） */
'use strict';
const { spawn } = require('child_process');

const PORT = 3210;
const WS = global.WebSocket;
if (!WS) { console.error('当前 Node 无全局 WebSocket，无法运行自测（需 Node 22+）'); process.exit(2); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function makeClient() {
  const ws = new WS(`ws://127.0.0.1:${PORT}`);
  const q = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const raw = (typeof ev.data === 'string') ? ev.data : Buffer.from(ev.data).toString('utf-8');
    const m = JSON.parse(raw);
    if (waiters.length) waiters.shift()(m);
    else q.push(m);
  };
  return {
    send: (o) => ws.send(JSON.stringify(o)),
    queue: () => q.slice(),
    ready: () => new Promise(res => { if (ws.readyState === 1) return res(); ws.onopen = res; }),
    next: (pred, ms = 3000) => new Promise((res, rej) => {
      const i = q.findIndex(m => !pred || pred(m));
      if (i >= 0) { res(q.splice(i, 1)[0]); return; }
      const to = setTimeout(() => rej(new Error('等待消息超时')), ms);
      waiters.push((m) => { clearTimeout(to); res(m); });
    })
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name); }
}

(async () => {
  const server = spawn('node', ['server.js', String(PORT)], { cwd: __dirname, stdio: 'ignore' });
  await sleep(800);

  try {
    const A = makeClient(); await A.ready();
    const B = makeClient(); await B.ready();

    // 1) A 创建房间
    A.send({ type: 'create' });
    const created = await A.next(m => m.type === 'created');
    check('创建房间返回房间码', typeof created.room === 'string' && created.room.length === 6);
    check('创建者分配为红方', created.color === 'red');
    const code = created.room;

    // 2) B 加入
    B.send({ type: 'join', room: code });
    const joined = await B.next(m => m.type === 'joined');
    check('加入者分配为黑方', joined.color === 'black');

    // 3) 双方收到开局
    const aStart = await A.next(m => m.type === 'start');
    const bStart = await B.next(m => m.type === 'start');
    check('红方开局颜色正确', aStart.color === 'red');
    check('黑方开局颜色正确', bStart.color === 'black');

    // 4) 红方走一步合法棋（马 9,1 -> 7,2）
    A.send({ type: 'move', from: { r: 9, c: 1 }, to: { r: 7, c: 2 } });
    const bMove = await B.next(m => m.type === 'move');
    check('合法走子已中继到对手', bMove.from.r === 9 && bMove.from.c === 1 && bMove.to.r === 7 && bMove.to.c === 2);
    check('中继棋步携带走子方颜色', bMove.color === 'red');

    // 5) 黑方走一步非法棋（车 0,0 -> 0,2 被己方马阻挡），应被拒绝
    B.send({ type: 'move', from: { r: 0, c: 0 }, to: { r: 0, c: 2 } });
    const bErr = await B.next(m => m.type === 'error');
    check('非法走法被服务端拒绝', !!bErr && /非法/.test(bErr.msg));
    // 确保对手未收到这步（A 队列里不应有 move）
    await sleep(200);
    check('非法走法未广播给对手', !A.queue().some(m => m.type === 'move'));

    // 6) 红方认输，双方应收到 resigned，赢家为黑
    A.send({ type: 'resign' });
    const aRes = await A.next(m => m.type === 'resigned');
    const bRes = await B.next(m => m.type === 'resigned');
    check('认输广播给双方', aRes.winner === 'black' && bRes.winner === 'black');

    console.log('\n联机自测结果：' + pass + ' 通过 / ' + fail + ' 失败');
  } catch (e) {
    console.error('自测异常：', e.message);
    fail++;
  } finally {
    server.kill();
    await sleep(200);
    process.exit(fail === 0 ? 0 : 1);
  }
})();
