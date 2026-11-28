// 계정 서버(server/worker.js)를 Node의 SQLite로 D1 흉내를 내서 시험
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle, newRecovery } from '../server/worker.js';

// D1처럼: prepare(sql).bind(...).first() / all() / run(), batch([...])
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
    _exec: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: sql => stmt(sql),
    batch: async list => { db.exec('BEGIN'); try { list.forEach(s => s._exec()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
    raw: db,
  };
}
let env;
beforeEach(() => { env = { DB: fakeD1(), INVITE: 'hello-voca, second', MAX_USERS: '3' }; });
const KEY = 'a'.repeat(43), KEY2 = 'b'.repeat(43);
async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', Origin: 'https://x.github.io' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await handle(new Request(`https://voca.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, body: await res.json(), headers: res.headers };
}
const signup = (o = {}) => call('POST', '/api/signup', { id: 'minji_01', name: '민지', key: KEY, invite: 'hello-voca', ...o });

test('가입: 초대 코드가 맞아야 · 아이디·이름 확인 · 복구 코드를 한 번 줌', async () => {
  assert.equal((await signup({ invite: 'nope' })).status, 403);
  assert.equal((await signup({ id: 'A!' })).body.error, 'bad_id');
  assert.equal((await signup({ name: '' })).body.error, 'bad_name');
  assert.equal((await signup({ key: 'short' })).body.error, 'bad_key');
  const r = await signup({ id: 'MinJi_01' }); // 대문자는 소문자로
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: 'minji_01', name: '민지' });
  assert.match(r.body.recovery, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(r.body.token.length > 30);
  assert.equal((await signup()).body.error, 'taken');
  assert.equal((await signup({ id: 'other', invite: 'second' })).status, 200); // 초대 코드 여러 개
  // 비밀번호·토큰·복구 코드 원문은 DB에 없음
  const row = env.DB.raw.prepare('SELECT * FROM users WHERE id = ?').get('minji_01');
  assert.notEqual(row.pw, KEY);
  assert.ok(!JSON.stringify(env.DB.raw.prepare('SELECT * FROM sessions').all()).includes(r.body.token));
  assert.ok(!JSON.stringify(row).includes(r.body.recovery.replace(/-/g, '')));
});

test('가입: 사람 수 한도 · 초대 코드가 없으면 가입을 안 받음', async () => {
  for (const id of ['aaa', 'bbb', 'ccc']) assert.equal((await signup({ id })).status, 200);
  assert.equal((await signup({ id: 'ddd' })).body.error, 'full');
  env.INVITE = '';
  assert.equal((await signup({ id: 'eee' })).body.error, 'no_invite');
});

test('로그인 · 틀린 비밀번호 8번이면 15분 잠금 · 없는 아이디도 같은 말', async () => {
  await signup();
  assert.equal((await call('POST', '/api/login', { id: 'minji_01', key: KEY })).status, 200);
  const none = await call('POST', '/api/login', { id: 'nobody', key: KEY });
  const wrong = await call('POST', '/api/login', { id: 'minji_01', key: KEY2 });
  assert.equal(none.status, 401);
  assert.equal(none.body.message, wrong.body.message);
  for (let i = 0; i < 7; i++) await call('POST', '/api/login', { id: 'minji_01', key: KEY2 });
  const locked = await call('POST', '/api/login', { id: 'minji_01', key: KEY });
  assert.equal(locked.status, 429);
  assert.match(locked.body.message, /15분/);
});

test('파일: 올리고 받기 · 지우기 · 이름·크기 확인 · 다른 사람 파일은 안 보임', async () => {
  const a = (await signup()).body.token;
  const b = (await signup({ id: 'other' })).body.token;
  assert.equal((await call('GET', '/api/files', null, null)).status, 401);
  assert.deepEqual((await call('GET', '/api/files', null, a)).body, { files: {} });
  assert.equal((await call('PUT', '/api/files', { files: { 'voca-progress.json': '{"v":2}', 'voca-marks.json': '{}' } }, a)).status, 200);
  const got = (await call('GET', '/api/files', null, a)).body.files;
  assert.equal(got['voca-progress.json'].content, '{"v":2}');
  assert.ok(got['voca-progress.json'].at > 0);
  // 덮어쓰기 · 지우기
  await call('PUT', '/api/files', { files: { 'voca-progress.json': '{"v":3}', 'voca-marks.json': null } }, a);
  assert.deepEqual(Object.keys((await call('GET', '/api/files', null, a)).body.files), ['voca-progress.json']);
  assert.equal((await call('GET', '/api/files', null, a)).body.files['voca-progress.json'].content, '{"v":3}');
  assert.deepEqual((await call('GET', '/api/files', null, b)).body, { files: {} });
  assert.equal((await call('PUT', '/api/files', { files: { '../x.json': '{}' } }, a)).body.error, 'bad_name');
  assert.equal((await call('PUT', '/api/files', { files: { 'a.json': 'x'.repeat(1_600_000) } }, a)).status, 413);
});

test('로그아웃 · 비밀번호 바꾸기(다른 기기는 풀림) · 복구 코드로 새 비밀번호', async () => {
  const r = await signup();
  const t1 = r.body.token;
  const t2 = (await call('POST', '/api/login', { id: 'minji_01', key: KEY })).body.token;
  assert.deepEqual((await call('GET', '/api/me', null, t1)).body.user, { id: 'minji_01', name: '민지' });
  // 비밀번호 바꾸기: 지금 비밀번호가 맞아야
  assert.equal((await call('POST', '/api/password', { old: KEY2, key: KEY2 }, t1)).status, 401);
  const ch = await call('POST', '/api/password', { old: KEY, key: KEY2 }, t1);
  assert.equal(ch.status, 200);
  assert.equal((await call('GET', '/api/me', null, t1)).status, 200); // 이 기기는 그대로
  assert.equal((await call('GET', '/api/me', null, t2)).status, 401); // 다른 기기는 풀림
  assert.equal((await call('POST', '/api/login', { id: 'minji_01', key: KEY })).status, 401);
  assert.equal((await call('POST', '/api/login', { id: 'minji_01', key: KEY2 })).status, 200);
  // 복구: 예전 복구 코드는 비밀번호를 바꿀 때 새로 받아서 못 씀, 새 코드로
  assert.equal((await call('POST', '/api/recover', { id: 'minji_01', recovery: r.body.recovery, key: KEY })).status, 401);
  const rec = await call('POST', '/api/recover', { id: 'minji_01', recovery: ch.body.recovery.toLowerCase().replace(/-/g, ' '), key: KEY });
  assert.equal(rec.status, 200);
  assert.notEqual(rec.body.recovery, ch.body.recovery);
  assert.equal((await call('GET', '/api/me', null, t1)).status, 401); // 복구하면 모든 기기 풀림
  assert.equal((await call('POST', '/api/login', { id: 'minji_01', key: KEY })).status, 200);
  // 로그아웃
  const t3 = rec.body.token;
  await call('POST', '/api/logout', null, t3);
  assert.equal((await call('GET', '/api/me', null, t3)).status, 401);
});

test('계정 지우기: 비밀번호가 맞아야, 진도·로그인 모두 지움', async () => {
  const t = (await signup()).body.token;
  await call('PUT', '/api/files', { files: { 'voca-progress.json': '{}' } }, t);
  assert.equal((await call('DELETE', '/api/account', { key: KEY2 }, t)).status, 401);
  assert.equal((await call('DELETE', '/api/account', { key: KEY }, t)).status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM files').get().n, 0);
  assert.equal((await call('POST', '/api/login', { id: 'minji_01', key: KEY })).status, 401);
});

test('CORS: 앱 주소(ORIGINS)만 · 미리 묻기(OPTIONS)', async () => {
  env.ORIGINS = 'https://x.github.io';
  const r = await call('GET', '/api', null);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://x.github.io');
  const pre = await handle(new Request('https://voca.test/api/files', { method: 'OPTIONS', headers: { Origin: 'https://x.github.io' } }), env);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  assert.match(newRecovery(), /^[A-Z2-9-]{14}$/);
});
