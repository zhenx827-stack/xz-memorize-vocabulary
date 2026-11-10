/** 冒烟测试：需先启动服务（npm start） */
const BASE = process.env.BASE || 'http://localhost:3000';

const ok = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`);
const hit = async (path, init) => {
  const r = await fetch(BASE + path, init);
  return { status: r.status, body: await r.json().catch(() => null) };
};

const deviceId = 'smoke-test-device';

const health = await hit('/api/health');
ok(health.status === 200 && health.body.ok, `GET /api/health → aiReady=${health.body?.aiReady} model=${health.body?.model}`);

const batch = await hit('/api/words/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ level: 'cet4', count: 5 }),
});
const words = batch.body?.words || [];
ok(batch.status === 200 && words.length === 5, `POST /api/words/batch → source=${batch.body?.source} 降级=${batch.body?.degraded} `);
ok(words.every((w) => w.options?.length === 4 && w.options.filter((o) => o.correct).length === 1), '每个单词都有 4 个选项且只有 1 个正确答案');
console.log('   样例:', JSON.stringify(words[0]));

const add = await hit('/api/wrongbook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
  body: JSON.stringify({ word: words[0] }),
});
ok(add.status === 200 && add.body.total >= 1, `POST /api/wrongbook → total=${add.body?.total}`);

const list = await hit('/api/wrongbook', { headers: { 'x-device-id': deviceId } });
ok(list.status === 200 && list.body.list.length >= 1, `GET /api/wrongbook → ${list.body?.total} 条错题`);

const del = await hit(`/api/wrongbook/${encodeURIComponent(words[0].word)}`, {
  method: 'DELETE',
  headers: { 'x-device-id': deviceId },
});
ok(del.status === 200, `DELETE /api/wrongbook/${words[0].word} → 剩余 ${del.body?.total}`);
