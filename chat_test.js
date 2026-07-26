/* chat_test.js — 联机聊天中继自测（Node / Python 双端）
 * 启动 server(.js/.py) → 两客户端建/进房 → 验证聊天双向中继 + 空白忽略 */
const { spawn } = require('child_process');
const WS = global.WebSocket;
const PORT = 3411;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeClient() {
  const ws = new WS(`ws://127.0.0.1:${PORT}`);
  const q = [];
  const waiters = [];
  ws.onmessage = (ev) => {
    const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf-8');
    const m = JSON.parse(raw);
    const wi = waiters.findIndex(w => !w.pred || w.pred(m));
    if (wi >= 0) { const w = waiters.splice(wi, 1)[0]; w.fn(m); }
    else q.push(m);
  };
  return {
    send: (o) => ws.send(JSON.stringify(o)),
    queue: () => q.slice(),
    clear: () => { q.length = 0; },
    close: () => { try { ws.close(); } catch (e) {} },
    ready: () => new Promise(res => { if (ws.readyState === 1) return res(); ws.onopen = res; }),
    next: (pred, ms = 3000) => new Promise((res, rej) => {
      const i = q.findIndex(m => !pred || pred(m));
      if (i >= 0) { res(q.splice(i, 1)[0]); return; }
      const waiter = { pred, fn: null };
      const to = setTimeout(() => {
        const wi = waiters.indexOf(waiter);
        if (wi >= 0) waiters.splice(wi, 1);
        rej(new Error('超时等待消息 ' + (pred && pred.toString().slice(0, 40))));
      }, ms);
      waiter.fn = (m) => { clearTimeout(to); res(m); };
      waiters.push(waiter);
    })
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name); }
}

(async () => {
  const bin = process.env.SERVER_BIN === 'python' ? 'python' : 'node';
  const args = bin === 'python' ? ['server.py', String(PORT)] : ['server.js', String(PORT)];
  const server = spawn(bin, args, { cwd: __dirname, stdio: 'ignore' });
  await sleep(900);

  try {
    const A = makeClient(); await A.ready();
    const B = makeClient(); await B.ready();
    A.send({ type: 'create' });
    const cr = await A.next(m => m.type === 'created');
    const code = cr.room;
    B.send({ type: 'join', room: code });
    await B.next(m => m.type === 'joined');
    await A.next(m => m.type === 'start');
    await B.next(m => m.type === 'start');
    await A.next(m => m.type === 'state').catch(() => {});
    await B.next(m => m.type === 'state').catch(() => {});
    A.clear(); B.clear();

    // 1) A → B
    A.send({ type: 'chat', text: '将军不慌' });
    const bChat = await B.next(m => m.type === 'chat');
    check('聊天从 A 中继到 B', bChat && bChat.text === '将军不慌' && bChat.from === 'red');

    // 2) B → A
    B.send({ type: 'chat', text: '稳一手' });
    const aChat = await A.next(m => m.type === 'chat');
    check('聊天从 B 中继到 A', aChat && aChat.text === '稳一手' && aChat.from === 'black');

    // 3) 空白消息忽略
    A.send({ type: 'chat', text: '   ' });
    await sleep(300);
    check('空白聊天被忽略（B 未收到 chat）', !B.queue().some(m => m.type === 'chat'));

    console.log(`\n聊天自测: ${pass} 通过 / ${fail} 失败`);
  } catch (e) {
    console.log('测试异常:', e.message);
    fail++;
  } finally {
    try { server.kill(); } catch (e) {}
    process.exit(fail ? 1 : 0);
  }
})();
