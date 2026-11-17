import { test } from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 전역 흉내: localStorage와 GitHub Gist API
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
let gist = {}, calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, opts });
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  if (/\/gists\/g1$/.test(url) && opts.method === 'PATCH') {
    for (const [k, v] of Object.entries(JSON.parse(opts.body).files)) gist[k] = v.content;
    return ok({});
  }
  if (/\/gists\/g1$/.test(url)) return ok({ files: Object.fromEntries(Object.entries(gist).map(([k, v]) => [k, { content: v }])) });
  return ok({});
};
const { createSync } = await import('../js/sync.js');

// 한 기기: 진도는 비워 두고 코치 캐릭터만
function device(char) {
  const d = { char, marks: {} };
  d.sync = createSync({
    getLocal: () => ({ v: 2, resetAt: 0, stats: {}, prefs: {} }),
    applyMerged: () => {},
    marks: { get: () => d.marks, set: m => { d.marks = m; } },
    coach: { get: () => d.char, set: c => { d.char = c; } },
  });
  return d;
}

test('코치 캐릭터: 동기화를 켰을 때만 다른 기기와 맞춰짐', async () => {
  // 토큰이 없으면 아무 데도 안 보냄
  store.clear();
  const solo = device({ char: 'owl', at: 5 });
  await solo.sync.now();
  assert.equal(calls.length, 0);
  // 토큰이 있으면: 폰에서 고른 부엉이가 Gist를 거쳐 아이패드로
  store.set('voca.sync.v1', JSON.stringify({ token: 't', gistId: 'g1' }));
  gist = { 'voca-marks.json': JSON.stringify({ v: 1, marks: { w1: { on: 1, t: 1 } } }) };
  const phone = device({ char: 'owl', at: 5 });
  await phone.sync.now();
  assert.deepEqual(JSON.parse(gist['voca-marks.json']), { v: 1, marks: { w1: { on: 1, t: 1 } }, coach: { char: 'owl', at: 5 } });
  const pad = device(null);
  await pad.sync.now();
  assert.deepEqual(pad.char, { char: 'owl', at: 5 });
  assert.deepEqual(pad.marks, { w1: { on: 1, t: 1 } });
  // 아이패드에서 나중에 슬라임으로 바꾸면 폰도 슬라임
  pad.char = { char: 'slime', at: 9 };
  await pad.sync.now();
  await phone.sync.now();
  assert.deepEqual(phone.char, { char: 'slime', at: 9 });
  // 형광펜만 바뀌어도 코치 캐릭터는 지워지지 않음
  phone.marks = { ...phone.marks, w2: { on: 1, t: 10 } };
  await phone.sync.now();
  assert.deepEqual(JSON.parse(gist['voca-marks.json']).coach, { char: 'slime', at: 9 });
  // 바뀐 게 없으면 올리지 않음
  calls = [];
  await phone.sync.now();
  assert.ok(!calls.some(c => c.opts.method === 'PATCH'));
});

test('화면 꾸미기: 더 최근에 바꾼 기기 것으로, 끈 기기는 주고받지 않음', async () => {
  const { createRequire } = await import('node:module');
  const L = createRequire(import.meta.url)('../js/look.js');
  store.clear();
  store.set('voca.sync.v1', JSON.stringify({ token: 't', gistId: 'g1' }));
  gist = {};
  const dev = (look, share = true) => {
    const d = { look: L.clean({ ...look, share }), marks: {} };
    d.sync = createSync({
      getLocal: () => ({ v: 2, resetAt: 0, stats: {}, prefs: {} }),
      applyMerged: () => {},
      marks: { get: () => d.marks, set: m => { d.marks = m; } },
      look: { get: () => (d.look.share ? L.shared(d.look) : null), set: o => { d.look = L.clean({ ...o, share: d.look.share }); }, merge: L.mergeLook, same: L.sameLook },
    });
    return d;
  };
  const phone = dev({ size: 'xl', ex: { accent: 'grape' }, at: 10 });
  await phone.sync.now();
  assert.equal(JSON.parse(gist['voca-marks.json']).look.size, 'xl');
  assert.ok(!('share' in JSON.parse(gist['voca-marks.json']).look)); // 기기마다인 스위치는 안 올림
  // 아이패드(예전 그대로)는 폰 것으로
  const pad = dev({});
  await pad.sync.now();
  assert.equal(pad.look.size, 'xl');
  assert.equal(pad.look.ex.accent, 'grape');
  // 끈 기기: 받지도 않고, 형광펜만 올릴 때 파일의 꾸미기도 지우지 않음
  const mine = dev({ size: 's', at: 99 }, false);
  mine.marks = { w9: { on: 1, t: 3 } };
  await mine.sync.now();
  assert.equal(mine.look.size, 's');
  const f = JSON.parse(gist['voca-marks.json']);
  assert.equal(f.look.size, 'xl');
  assert.deepEqual(f.marks.w9, { on: 1, t: 3 });
  // 아이패드에서 나중에 바꾸면 폰도
  pad.look = L.clean({ ...pad.look, size: 'l', at: 20 });
  await pad.sync.now();
  await phone.sync.now();
  assert.equal(phone.look.size, 'l');
});
