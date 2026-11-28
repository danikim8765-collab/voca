// VOCA 계정 서버 (Cloudflare Workers + D1). 아이디·비밀번호로 로그인하고, 계정마다 진도 파일을 저장한다.
// 앱(js/sync.js)이 예전 GitHub Gist처럼 파일을 통째로 받고(GET /api/files) 바뀐 파일만 올린다(PUT /api/files).
// 기록을 합치는 건 앱이 한다(core.js mergeProgress 등). 서버는 저장만.
//
// 설정 (Cloudflare 대시보드 또는 wrangler, server/README.md):
//   DB        D1 데이터베이스 (server/schema.sql)
//   INVITE    초대 코드 (비밀 값). 쉼표로 여러 개. 이게 맞아야 가입됨
//   MAX_USERS 가입할 수 있는 사람 수 (기본 30). 무료 한도를 지키려고
//   ORIGINS   앱 주소 (쉼표로 여러 개, 예: https://이름.github.io). 비우면 어디서든
//   ADMINS    관리자 아이디 (쉼표로 여러 개). 관리자는 가입한 사람 목록을 보고, 비밀번호를 잊은 친구에게 초기화 코드를 만들어 줌
//
// 보안:
// - 비밀번호 원문은 서버에 안 옴: 앱이 PBKDF2(비밀번호, 'voca:' + 아이디, 10만 번)으로 바꾼 key만 보냄.
//   서버는 key를 사용자마다 다른 salt와 SHA-256해서 저장(무료 플랜은 요청마다 CPU 10ms라 서버에서 오래 돌리는 해시는 못 씀)
// - 로그인 토큰은 기기에만 원문, 서버엔 SHA-256. 180일 안 쓰면 풀림
// - 비밀번호를 8번 연달아 틀리면 15분 잠금
// - 비밀번호를 잊으면 관리자가 초기화 코드를 만들어 주고, 앱의 '비밀번호 찾기'에 넣어 새 비밀번호를 만듦(POST /api/recover).
//   관리자도 비밀번호는 볼 수 없음. 예전 앱은 가입·비밀번호 바꾸기 때 받은 복구 코드를 보여 줬음(지금도 그대로 돌려줘서 예전 앱이 안 깨짐)

const DAY = 86400000;
const SESSION_DAYS = 180;
const LOCK_FAILS = 8, LOCK_MS = 15 * 60000;
const FILE_MAX = 1_500_000, TOTAL_MAX = 6_000_000, FILES_MAX = 12;
const ID_RE = /^[a-z0-9_]{3,20}$/;
const KEY_RE = /^[A-Za-z0-9+/=_-]{40,90}$/;
const FILE_RE = /^[a-z0-9][a-z0-9.-]{0,40}\.json$/;
const REC_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0 O 1 I) 뺌

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newToken = () => b64url(rand(32));
const newSalt = () => hex(rand(16));
export function newRecovery() {
  const b = rand(12);
  const s = [...b].map(x => REC_ABC[x % REC_ABC.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
const cleanRec = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// 같은 길이 글자 비교를 시간 차 없이
function same(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

class Err extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }
const bad = (code, msg) => new Err(400, code, msg);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = String(env.ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allow = !list.length ? '*' : list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Body-Gzip',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req, env, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req, env) } });

// 앱이 올리는 진도는 gzip으로 줄여서 옴(X-Body-Gzip: 1): 문제마다 동기화해도 폰 데이터를 덜 쓰게
async function readBody(req) {
  const t = req.headers.get('X-Body-Gzip') === '1' && req.body
    ? await new Response(req.body.pipeThrough(new DecompressionStream('gzip'))).text()
    : await req.text();
  if (t.length > TOTAL_MAX + 100000) throw new Err(413, 'too_big', '보낸 내용이 너무 커요');
  try { return t ? JSON.parse(t) : {}; } catch { throw bad('bad_json', '잘못된 요청이에요'); }
}

// 로그인한 사람: Authorization: Bearer <토큰>
async function auth(req, env) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('Authorization') || '');
  if (!m) throw new Err(401, 'no_login', '로그인이 필요해요');
  const t = await sha(m[1]);
  const s = await env.DB.prepare('SELECT user, seen FROM sessions WHERE token = ?').bind(t).first();
  const now = Date.now();
  if (!s || now - s.seen > SESSION_DAYS * DAY) {
    if (s) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(t).run();
    throw new Err(401, 'no_login', '로그인이 풀렸어요. 다시 로그인해 주세요');
  }
  // 쓴 날은 하루에 한 번만 고침 (D1 쓰기 아끼기)
  if (now - s.seen > DAY) await env.DB.prepare('UPDATE sessions SET seen = ? WHERE token = ?').bind(now, t).run();
  return { user: s.user, token: t };
}
async function startSession(env, user) {
  const token = newToken(), now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, user, created, seen) VALUES (?, ?, ?, ?)').bind(await sha(token), user, now, now).run();
  return token;
}
const cleanId = v => String(v || '').trim().toLowerCase();
const cleanName = v => String(v || '').replace(/\s+/g, ' ').trim();
// 관리자: 설정 값 ADMINS에 적힌 아이디
const isAdmin = (env, id) => String(env.ADMINS || '').split(',').map(cleanId).filter(Boolean).includes(id);
// 앱에 돌려주는 사용자: 관리자면 admin: true (앱이 계정 화면에 관리자 카드를 보임)
const userOut = (env, id, name) => (isAdmin(env, id) ? { id, name, admin: true } : { id, name });
function checkKey(key) { if (!KEY_RE.test(String(key || ''))) throw bad('bad_key', '비밀번호를 다시 넣어 주세요'); return String(key); }

async function signup(req, env) {
  const b = await readBody(req);
  const id = cleanId(b.id), name = cleanName(b.name), key = checkKey(b.key);
  if (!ID_RE.test(id)) throw bad('bad_id', '아이디는 영어 소문자·숫자·_로 3~20자예요');
  if (!name || name.length > 20) throw bad('bad_name', '이름은 1~20자예요');
  const codes = String(env.INVITE || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!codes.length) throw new Err(403, 'no_invite', '아직 가입을 받지 않아요 (초대 코드가 정해지지 않았어요)');
  const inv = String(b.invite || '').trim();
  if (!codes.some(c => same(c, inv))) throw new Err(403, 'bad_invite', '초대 코드가 맞지 않아요');
  const max = Number(env.MAX_USERS) || 30;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if (n && n.n >= max) throw new Err(403, 'full', '가입할 수 있는 사람 수가 다 찼어요');
  if (await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()) throw new Err(409, 'taken', '이미 있는 아이디예요');
  const salt = newSalt(), rec = newRecovery();
  await env.DB.prepare('INSERT INTO users (id, name, pw, salt, rec, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, await sha(salt + key), salt, await sha(salt + cleanRec(rec)), Date.now()).run();
  return { token: await startSession(env, id), user: userOut(env, id, name), recovery: rec };
}

async function login(req, env) {
  const b = await readBody(req);
  const id = cleanId(b.id), key = checkKey(b.key);
  const u = ID_RE.test(id) ? await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() : null;
  // 없는 아이디와 틀린 비밀번호를 같은 말로 (아이디가 있는지 떠보지 못하게)
  const wrong = new Err(401, 'wrong', '아이디나 비밀번호가 맞지 않아요');
  if (!u) throw wrong;
  const now = Date.now();
  if (u.lock_until > now) throw new Err(429, 'locked', `비밀번호를 여러 번 틀려서 ${Math.ceil((u.lock_until - now) / 60000)}분 동안 잠겼어요`);
  if (!same(await sha(u.salt + key), u.pw)) {
    const fails = u.fails + 1;
    await env.DB.prepare('UPDATE users SET fails = ?, lock_until = ? WHERE id = ?').bind(fails >= LOCK_FAILS ? 0 : fails, fails >= LOCK_FAILS ? now + LOCK_MS : 0, id).run();
    throw wrong;
  }
  if (u.fails) await env.DB.prepare('UPDATE users SET fails = 0, lock_until = 0 WHERE id = ?').bind(id).run();
  return { token: await startSession(env, id), user: userOut(env, id, u.name) };
}

// 복구 코드로 새 비밀번호: 다른 기기 로그인은 모두 풀고, 새 복구 코드를 줌 (쓴 코드는 다시 못 씀)
async function recover(req, env) {
  const b = await readBody(req);
  const id = cleanId(b.id), key = checkKey(b.key);
  const u = ID_RE.test(id) ? await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() : null;
  const wrong = new Err(401, 'wrong', '아이디나 초기화 코드가 맞지 않아요');
  if (!u) throw wrong;
  const now = Date.now();
  if (u.lock_until > now) throw new Err(429, 'locked', `여러 번 틀려서 ${Math.ceil((u.lock_until - now) / 60000)}분 동안 잠겼어요`);
  if (!same(await sha(u.salt + cleanRec(b.recovery)), u.rec)) {
    const fails = u.fails + 1;
    await env.DB.prepare('UPDATE users SET fails = ?, lock_until = ? WHERE id = ?').bind(fails >= LOCK_FAILS ? 0 : fails, fails >= LOCK_FAILS ? now + LOCK_MS : 0, id).run();
    throw wrong;
  }
  const salt = newSalt(), rec = newRecovery();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw = ?, salt = ?, rec = ?, fails = 0, lock_until = 0 WHERE id = ?').bind(await sha(salt + key), salt, await sha(salt + cleanRec(rec)), id),
    env.DB.prepare('DELETE FROM sessions WHERE user = ?').bind(id),
  ]);
  return { token: await startSession(env, id), user: userOut(env, id, u.name), recovery: rec };
}

// 비밀번호 바꾸기: 지금 비밀번호(old)가 맞아야. 이 기기 말고 다른 기기 로그인은 풀림
async function changePassword(req, env, me) {
  const b = await readBody(req);
  const old = checkKey(b.old), key = checkKey(b.key);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(me.user).first();
  if (!u || !same(await sha(u.salt + old), u.pw)) throw new Err(401, 'wrong', '지금 비밀번호가 맞지 않아요');
  const salt = newSalt();
  // 복구 코드는 그대로 쓰게 salt가 바뀌어도 다시 계산할 수 없어서 새로 줌
  const rec = newRecovery();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw = ?, salt = ?, rec = ? WHERE id = ?').bind(await sha(salt + key), salt, await sha(salt + cleanRec(rec)), me.user),
    env.DB.prepare('DELETE FROM sessions WHERE user = ? AND token <> ?').bind(me.user, me.token),
  ]);
  return { ok: true, recovery: rec };
}

// have = 앱이 이미 가진 파일과 그 시각 ('이름:시각,이름:시각'). 시각이 같은 파일은 내용 없이 시각만 (문제마다 동기화해도 다 받지 않게).
// have가 없으면(예전 앱) 전부
async function getFiles(env, me, have = '') {
  const known = new Map();
  for (const p of String(have).split(',')) { const i = p.lastIndexOf(':'); if (i > 0) known.set(p.slice(0, i), Number(p.slice(i + 1))); }
  const r = await env.DB.prepare('SELECT name, at FROM files WHERE user = ?').bind(me.user).all();
  const files = {}, need = [];
  for (const f of r.results || []) { if (known.get(f.name) === f.at) files[f.name] = { at: f.at }; else need.push(f.name); }
  if (need.length) {
    const b = await env.DB.prepare(`SELECT name, body, at FROM files WHERE user = ? AND name IN (${need.map(() => '?').join(',')})`).bind(me.user, ...need).all();
    for (const f of b.results || []) files[f.name] = { content: f.body, at: f.at };
  }
  return { files };
}
// files: { 이름: 내용(글자) | null(지움) }
async function putFiles(req, env, me) {
  const b = await readBody(req);
  const want = b && typeof b.files === 'object' && b.files ? b.files : null;
  if (!want) throw bad('bad_files', '잘못된 요청이에요');
  const names = Object.keys(want);
  if (!names.length) return { ok: true };
  for (const n of names) {
    if (!FILE_RE.test(n)) throw bad('bad_name', `파일 이름이 이상해요: ${n}`);
    const v = want[n];
    if (v !== null && typeof v !== 'string') throw bad('bad_file', '잘못된 요청이에요');
    if (typeof v === 'string' && v.length > FILE_MAX) throw new Err(413, 'too_big', `${n}이(가) 너무 커요`);
  }
  // 파일 수 · 모두 합친 크기
  const cur = (await env.DB.prepare('SELECT name, LENGTH(body) AS n FROM files WHERE user = ?').bind(me.user).all()).results || [];
  const size = new Map(cur.map(f => [f.name, f.n]));
  for (const n of names) { if (want[n] === null) size.delete(n); else size.set(n, want[n].length); }
  if (size.size > FILES_MAX) throw new Err(413, 'too_many', '파일이 너무 많아요');
  if ([...size.values()].reduce((a, x) => a + x, 0) > TOTAL_MAX) throw new Err(413, 'too_big', '저장할 수 있는 크기를 넘었어요');
  const now = Date.now();
  await env.DB.batch(names.map(n => want[n] === null
    ? env.DB.prepare('DELETE FROM files WHERE user = ? AND name = ?').bind(me.user, n)
    : env.DB.prepare('INSERT INTO files (user, name, body, at) VALUES (?, ?, ?, ?) ON CONFLICT(user, name) DO UPDATE SET body = excluded.body, at = excluded.at').bind(me.user, n, want[n], now)));
  return { ok: true, at: now };
}

// 계정 지우기: 비밀번호(key)가 맞아야. 진도·로그인 모두 지움
async function deleteAccount(req, env, me) {
  const b = await readBody(req);
  const key = checkKey(b.key);
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(me.user).first();
  if (!u || !same(await sha(u.salt + key), u.pw)) throw new Err(401, 'wrong', '비밀번호가 맞지 않아요');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM files WHERE user = ?').bind(me.user),
    env.DB.prepare('DELETE FROM sessions WHERE user = ?').bind(me.user),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(me.user),
  ]);
  return { ok: true };
}

// ---------- 관리자 (ADMINS에 적힌 아이디만) ----------
function needAdmin(env, me) { if (!isAdmin(env, me.user)) throw new Err(403, 'not_admin', '관리자만 할 수 있어요'); }
// 가입한 사람 목록: 아이디·이름·가입한 날·마지막으로 쓴 날 (비밀번호·진도는 안 줌)
async function adminUsers(env, me) {
  needAdmin(env, me);
  const users = (await env.DB.prepare('SELECT id, name, created FROM users ORDER BY created').all()).results || [];
  const seen = (await env.DB.prepare('SELECT user, MAX(seen) AS seen FROM sessions GROUP BY user').all()).results || [];
  const last = Object.fromEntries(seen.map(r => [r.user, r.seen]));
  return { users: users.map(u => ({ id: u.id, name: u.name, created: u.created, seen: last[u.id] || 0, admin: isAdmin(env, u.id) || undefined })), max: Number(env.MAX_USERS) || 30 };
}
// 초기화 코드 만들기: 비밀번호를 잊은 친구에게. 친구는 앱의 '비밀번호 찾기'에 넣고 새 비밀번호를 만듦.
// 지금 비밀번호는 그대로 둠(친구가 새로 만들 때까지 원래 비밀번호로도 로그인됨). 잠금도 풂
async function adminReset(req, env, me) {
  needAdmin(env, me);
  const b = await readBody(req);
  const id = cleanId(b.id);
  const u = ID_RE.test(id) ? await env.DB.prepare('SELECT id, name, salt FROM users WHERE id = ?').bind(id).first() : null;
  if (!u) throw new Err(404, 'no_user', '그런 아이디가 없어요');
  const code = newRecovery();
  await env.DB.prepare('UPDATE users SET rec = ?, fails = 0, lock_until = 0 WHERE id = ?').bind(await sha(u.salt + cleanRec(code)), id).run();
  return { id, name: u.name, code };
}

export async function handle(req, env) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const m = req.method;
  try {
    if (path === '' || path === '/api') return json(req, env, { ok: true, app: 'voca' });
    if (m === 'POST' && path === '/api/signup') return json(req, env, await signup(req, env));
    if (m === 'POST' && path === '/api/login') return json(req, env, await login(req, env));
    if (m === 'POST' && path === '/api/recover') return json(req, env, await recover(req, env));
    const me = await auth(req, env);
    if (m === 'GET' && path === '/api/me') {
      const u = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(me.user).first();
      if (!u) throw new Err(401, 'no_login', '계정이 없어졌어요');
      return json(req, env, { user: userOut(env, u.id, u.name) });
    }
    if (m === 'POST' && path === '/api/logout') { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(me.token).run(); return json(req, env, { ok: true }); }
    if (m === 'POST' && path === '/api/password') return json(req, env, await changePassword(req, env, me));
    if (m === 'GET' && path === '/api/files') return json(req, env, await getFiles(env, me, new URL(req.url).searchParams.get('have') || ''));
    if (m === 'PUT' && path === '/api/files') return json(req, env, await putFiles(req, env, me));
    if (m === 'DELETE' && path === '/api/account') return json(req, env, await deleteAccount(req, env, me));
    if (m === 'GET' && path === '/api/admin/users') return json(req, env, await adminUsers(env, me));
    if (m === 'POST' && path === '/api/admin/reset') return json(req, env, await adminReset(req, env, me));
    throw new Err(404, 'not_found', '없는 주소예요');
  } catch (e) {
    if (e instanceof Err) return json(req, env, { error: e.code, message: e.message }, e.status);
    console.error(e);
    return json(req, env, { error: 'server', message: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' }, 500);
  }
}

export default { fetch: handle };
