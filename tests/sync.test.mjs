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
const { createSync, isLimited, limitWait } = await import('../js/sync.js');

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

test('GitHub 쓰기 제한: 막힌 것과 권한 문제를 구분, 기다릴 시간은 1분~1시간', () => {
  assert.ok(isLimited(429));
  assert.ok(isLimited(403, { remaining: '0' }));
  assert.ok(isLimited(403, { retryAfter: '60' }));
  assert.ok(isLimited(403, {}, 'You have exceeded a secondary rate limit.'));
  assert.ok(!isLimited(403, {}, 'Resource not accessible by personal access token'));
  assert.ok(!isLimited(404));
  assert.equal(limitWait({ wait: 5000 }), 60000);
  assert.equal(limitWait({ wait: 120000 }), 120000);
  assert.equal(limitWait({}, 0), 60000);
  assert.equal(limitWait({}, 2), 240000);
  assert.equal(limitWait({}, 20), 3600000);
});

test('GitHub가 막으면 기다리는 동안 아무것도 안 보내고, Gist가 지워졌으면 바로 새로 만듦', async () => {
  const real = globalThis.fetch;
  const headers = h => ({ get: n => h[n] ?? null });
  store.clear();
  store.set('voca.sync.v1', JSON.stringify({ token: 't', gistId: 'g1' }));
  // 1) 막힘: 상태는 '잠시 뒤', 다시 불러도 GitHub에 안 감
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return { ok: false, status: 403, headers: headers({ 'retry-after': '120' }), json: async () => ({ message: 'You have exceeded a secondary rate limit.' }) };
  };
  const d = device(null);
  await d.sync.now();
  assert.equal(d.sync.status, 'wait');
  assert.match(d.sync.error, /2분 뒤/);
  const n = calls.length;
  await d.sync.now();
  d.sync.soon(0);
  assert.equal(calls.length, n);
  assert.ok(JSON.parse(store.get('voca.sync.v1')).pauseUntil > Date.now());
  d.sync.disconnect(); // 다시 하기 타이머 정리

  // 2) Gist가 지워짐(404): 같은 동기화 안에서 새로 만들고 정상
  store.set('voca.sync.v1', JSON.stringify({ token: 't', gistId: 'gone' }));
  gist = {};
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (/\/gists\/gone$/.test(url)) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    if (/\/gists\?/.test(url)) return ok([]);
    if (/\/gists$/.test(url) && opts.method === 'POST') return ok({ id: 'g1' });
    return real(url, opts);
  };
  const e = device({ char: 'owl', at: 1 });
  await e.sync.now();
  assert.equal(e.sync.status, 'ok');
  assert.equal(JSON.parse(store.get('voca.sync.v1')).gistId, 'g1');
  assert.deepEqual(JSON.parse(gist['voca-marks.json']).coach, { char: 'owl', at: 1 });
  globalThis.fetch = real;
});

test('코치 이야기·학습 기록(voca-coach.json): 폰에서 한 학습을 PC 코치가 앎', async () => {
  const { mergeCoachData, sameCoachData } = await import('../js/core.js');
  store.clear();
  store.set('voca.sync.v1', JSON.stringify({ token: 't', gistId: 'g1' }));
  gist = {};
  const now = Date.now();
  const dev = data => {
    const d = { data };
    d.sync = createSync({
      getLocal: () => ({ v: 2, resetAt: 0, stats: {}, prefs: {} }),
      applyMerged: () => {},
      extra: [{ file: 'voca-coach.json', get: () => d.data, set: m => { d.data = m; }, merge: mergeCoachData, same: sameCoachData }],
    });
    return d;
  };
  const phone = dev({ chat: { items: [{ who: 'me', text: '폰에서', t: now - 5 }], notes: [] }, log: [{ t: now - 3, m: 'e', sid: 1, id: 'a', o: 'wrong' }] });
  await phone.sync.now();
  const pc = dev({ chat: { items: [{ who: 'me', text: 'PC에서', t: now - 4 }], notes: [] }, log: [] });
  await pc.sync.now();
  assert.deepEqual(pc.data.log.map(e => e.id), ['a']);
  assert.deepEqual(pc.data.chat.items.map(x => x.text), ['폰에서', 'PC에서']);
  await phone.sync.now();
  assert.deepEqual(phone.data.chat.items.map(x => x.text), ['폰에서', 'PC에서']);
  // 바뀐 게 없으면 올리지 않음
  calls = [];
  await phone.sync.now();
  assert.ok(!calls.some(c => c.opts.method === 'PATCH'));
});
