// 계정 서버(server/worker.js)와 주고받기: 가입 · 로그인 · 복구 · 비밀번호 바꾸기 · 계정 지우기.
// 진도 파일 주고받기는 js/sync.js가 이 모듈의 api()로 함.
// 비밀번호 원문은 서버에 안 보냄: 이 기기에서 PBKDF2(비밀번호, 'voca:' + 아이디, 10만 번)으로 바꾼 key만 보냄
// (서버는 무료 플랜이라 요청마다 CPU 10ms뿐이어서 무거운 해시는 여기서)

// 서버 주소 (Cloudflare Workers, 2026-11-28에 올림).
// 시험할 땐 localStorage 'voca.account.api'로 바꿀 수 있음
export const ACCOUNT_API_DEFAULT = 'https://voca-account.lexioative.workers.dev';
export const accountApi = () => {
  try { return (localStorage.getItem('voca.account.api') || ACCOUNT_API_DEFAULT).replace(/\/+$/, ''); } catch { return ACCOUNT_API_DEFAULT; }
};
export const accountReady = () => !!accountApi();

export const ID_RE = /^[a-z0-9_]{3,20}$/;
export const PW_MIN = 6;
const ITER = 100000;

export async function passKey(id, password) {
  if (!globalThis.crypto || !crypto.subtle) { const e = new Error('이 주소에서는 로그인할 수 없어요. https:// 로 시작하는 앱 주소로 열어 주세요'); e.code = 'no_crypto'; throw e; }
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`voca:${String(id).trim().toLowerCase()}`), iterations: ITER }, base, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// 서버 부르기. 실패면 Error { status, code, message(사람이 읽을 말) }
// 글자를 gzip으로 (브라우저가 지원할 때만, 아니면 null)
export async function gzipText(text) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); } catch { return null; }
}
// gzip: true면 보낼 내용을 줄여서 (문제마다 동기화할 때 폰 데이터 아끼기. 서버가 X-Body-Gzip을 보고 풂)
export async function api(path, { method = 'GET', body, token, server = accountApi(), timeout = 15000, gzip = false } = {}) {
  if (!server) { const e = new Error('계정 서버가 아직 준비되지 않았어요'); e.status = 0; e.code = 'no_server'; throw e; }
  const headers = {};
  let payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) {
    const z = gzip && payload.length > 1024 ? await gzipText(payload) : null;
    if (z) { payload = z; headers['Content-Type'] = 'application/octet-stream'; headers['X-Body-Gzip'] = '1'; }
    else headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(server + path, { method, headers, body: payload, cache: 'no-store', signal: ctrl.signal });
  } catch {
    const e = new Error(ctrl.signal.aborted ? '서버 답이 너무 늦어요. 잠시 뒤에 다시 해 주세요' : '인터넷 연결을 확인해 주세요');
    e.status = 0; e.code = 'network';
    throw e;
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* 본문이 없을 수도 */ }
  if (!res.ok) {
    const e = new Error((data && data.message) || `서버 오류 (${res.status})`);
    e.status = res.status; e.code = (data && data.error) || '';
    if (res.status === 429) { const ra = res.headers && res.headers.get && res.headers.get('retry-after'); e.limited = e.code !== 'locked'; e.wait = ra ? +ra * 1000 : 0; }
    throw e;
  }
  return data || {};
}

export const cleanId = v => String(v || '').trim().toLowerCase();

export async function signup({ id, name, password, invite }) {
  id = cleanId(id);
  return api('/api/signup', { method: 'POST', body: { id, name: String(name || '').trim(), invite: String(invite || '').trim(), key: await passKey(id, password) } });
}
export async function login({ id, password }) {
  id = cleanId(id);
  return api('/api/login', { method: 'POST', body: { id, key: await passKey(id, password) } });
}
export async function recover({ id, recovery, password }) {
  id = cleanId(id);
  return api('/api/recover', { method: 'POST', body: { id, recovery, key: await passKey(id, password) } });
}
export async function changePassword({ token, id, old, password }) {
  return api('/api/password', { method: 'POST', token, body: { old: await passKey(id, old), key: await passKey(id, password) } });
}
export async function deleteAccount({ token, id, password }) {
  return api('/api/account', { method: 'DELETE', token, body: { key: await passKey(id, password) } });
}
export const logout = token => api('/api/logout', { method: 'POST', token }).catch(() => null); // 서버가 안 돼도 이 기기에선 로그아웃

// 비밀번호 규칙 (앱에서만 봄: 서버는 원문을 모름). 문제가 있으면 그 말, 없으면 ''
export function passwordProblem(id, pw) {
  pw = String(pw || '');
  if (pw.length < PW_MIN) return `비밀번호는 ${PW_MIN}자 이상이에요`;
  if (pw.toLowerCase() === cleanId(id)) return '비밀번호를 아이디와 다르게 해 주세요';
  if (/^(.)\1+$/.test(pw) || /^(123456|1234567|12345678|qwerty|password)$/i.test(pw)) return '너무 쉬운 비밀번호예요';
  return '';
}
