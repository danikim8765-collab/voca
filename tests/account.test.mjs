// 앱의 계정 모듈(js/account.js) + 동기화(js/sync.js)가 계정 서버(server/worker.js)와 실제로 맞물리는지:
// fetch를 서버의 handle로 바로 넘기고, D1은 Node SQLite로 흉내
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle } from '../server/worker.js';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  _exec: () => db.prepare(sql).run(...args),
});
const env = { DB: { prepare: sql => stmt(sql), batch: async l => { l.forEach(s => s._exec()); return []; } }, INVITE: 'voca-friends' };
const SERVER = 'https://acct.test';
let calls = 0;
globalThis.fetch = async (url, opts = {}) => { calls++; return handle(new Request(url, opts), env); };
store.set('voca.account.api', SERVER);

const acct = await import('../js/account.js');
const { createSync } = await import('../js/sync.js');

test('비밀번호 규칙 · key는 아이디마다 달라짐(원문은 안 보냄)', async () => {
  assert.equal(acct.passwordProblem('minji', '123'), '비밀번호는 6자 이상이에요');
  assert.equal(acct.passwordProblem('minji', 'minji1'), '');
  assert.match(acct.passwordProblem('minji1', 'MINJI1'), /아이디와 다르게/);
  assert.match(acct.passwordProblem('a', 'aaaaaaa'), /쉬운/);
  const k1 = await acct.passKey('minji', 'secret-pw'), k2 = await acct.passKey('other', 'secret-pw');
  assert.notEqual(k1, k2);
  assert.ok(!k1.includes('secret'));
  assert.equal(k1, await acct.passKey(' MINJI ', 'secret-pw')); // 아이디 대소문자·공백은 같게
});

test('가입 → 두 기기가 같은 계정으로 진도를 맞춤 → 로그아웃', async () => {
  await assert.rejects(acct.signup({ id: 'minji', name: '민지', password: 'secret-pw', invite: 'wrong' }), e => e.status === 403 && /초대 코드/.test(e.message));
  const r = await acct.signup({ id: 'Minji', name: ' 민지 ', password: 'secret-pw', invite: 'voca-friends' });
  assert.deepEqual(r.user, { id: 'minji', name: '민지' });
  assert.ok(r.recovery);
  await assert.rejects(acct.login({ id: 'minji', password: 'nope-nope' }), e => e.status === 401);

  // 기기 하나 = 진도 하나. 같은 localStorage라 기기마다 동기화 설정은 따로 꺼내 씀
  const device = stats => {
    const d = { stats, conf: null };
    d.sync = () => {
      store.set('voca.sync.v1', d.conf || '{}');
      const s = createSync({
        getLocal: () => ({ v: 2, resetAt: 0, stats: d.stats, prefs: {} }),
        applyMerged: m => { d.stats = m.stats; },
      });
      return s;
    };
    d.keep = () => { d.conf = store.get('voca.sync.v1'); };
    return d;
  };
  const T = Date.now();
  const phone = device({ '26|a': { st: 2, c: 2, w: 0, due: '2026-12-01', s: T - 1000 } });
  const pad = device({ '26|b': { st: 1, c: 1, w: 1, due: '2026-12-02', s: T - 500 } });
  // 폰: 가입한 토큰으로 연결 → 올림
  let s = phone.sync();
  await s.connectAccount({ token: r.token, user: r.user, server: SERVER });
  assert.equal(s.kind, 'account');
  assert.equal(s.status, 'ok');
  assert.equal(s.name, '민지');
  phone.keep();
  // 패드: 로그인 → 받아서 합치고 올림
  const l = await acct.login({ id: 'minji', password: 'secret-pw' });
  s = pad.sync();
  await s.connectAccount({ token: l.token, user: l.user, server: SERVER });
  pad.keep();
  assert.deepEqual(Object.keys(pad.stats).sort(), ['26|a', '26|b']);
  // 폰이 다시 받으면 패드 것도
  s = phone.sync();
  await s.now();
  assert.deepEqual(Object.keys(phone.stats).sort(), ['26|a', '26|b']);
  // 바뀐 게 없으면 올리지 않음 (받기 한 번만)
  calls = 0;
  await s.now();
  assert.equal(calls, 1);
  // 로그아웃하면 그 토큰으로는 못 받음 → 다시 로그인하라는 말
  await acct.logout(l.token);
  s = pad.sync();
  await s.now();
  assert.equal(s.status, 'error');
  assert.match(s.error, /다시 로그인/);
});

test('복구 코드로 새 비밀번호 · 비밀번호 바꾸기 · 계정 지우기', async () => {
  const r = await acct.signup({ id: 'jun', name: '준', password: 'first-pw', invite: 'voca-friends' });
  const rc = await acct.recover({ id: 'jun', recovery: r.recovery, password: 'second-pw' });
  assert.ok(rc.recovery && rc.recovery !== r.recovery);
  await assert.rejects(acct.login({ id: 'jun', password: 'first-pw' }), e => e.status === 401);
  const l = await acct.login({ id: 'jun', password: 'second-pw' });
  const ch = await acct.changePassword({ token: l.token, id: 'jun', old: 'second-pw', password: 'third-pw' });
  assert.ok(ch.recovery);
  await assert.rejects(acct.deleteAccount({ token: l.token, id: 'jun', password: 'second-pw' }), e => e.status === 401);
  await acct.deleteAccount({ token: l.token, id: 'jun', password: 'third-pw' });
  await assert.rejects(acct.login({ id: 'jun', password: 'third-pw' }), e => e.status === 401);
});

test('서버 주소가 없으면 부르지 않고 알려 줌 · 기본 주소가 들어 있음', async () => {
  await assert.rejects(acct.api('/api/me', { server: '' }), e => e.code === 'no_server');
  store.delete('voca.account.api');
  assert.equal(acct.accountApi(), acct.ACCOUNT_API_DEFAULT);
  assert.match(acct.ACCOUNT_API_DEFAULT, /^https:\/\/.+\.workers\.dev$/);
  store.set('voca.account.api', SERVER);
});
