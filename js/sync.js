// 기기 간 진도 동기화: 파일 몇 개(voca-progress.json 등)에 진도를 저장하고 합친다.
// 저장하는 곳은 둘 중 하나(conf.kind): 'account' = VOCA 계정 서버(server/worker.js, 아이디로 로그인) · 'gist' = 내 GitHub 계정의 비밀 Gist(예전 방식, 토큰)
// 합치는 방법은 어느 쪽이든 같음: 받아 와서 이 기기 것과 합치고(core.js), 달라진 파일만 올림
import { mergeProgress, sameStats, samePrefs, mergeMarks, sameMarks, mergeCoach, sameCoach, TOMB_KEEP } from './core.js';
import { api as accountCall } from './account.js';

const API = 'https://api.github.com';
// 예문 모드 진도는 voca-progress.json, 단어 모드는 같은 Gist의 voca-word-progress.json
const FILES = ['voca-progress.json', 'voca-word-progress.json'];
const MARKS = 'voca-marks.json'; // 단어장 '모름' 표시, 고른 코치 캐릭터, 화면 꾸미기: 두 모드가 같이 씀
const MY = 'voca-mywords.json'; // 내 단어(노트에서 올린 단어)·독해에서 막힌 단어책 단어·단어책 바퀴: 두 모드가 같이 씀 (js/mywords.js)
const KEY = 'voca.sync.v1'; // 토큰·Gist는 두 모드가 같이 씀

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

// GitHub는 '쓰기'(Gist 고치기)를 한 시간에 500번쯤까지만 받고, 넘으면 한동안 막음(403·429).
// 그래서 문제 풀 때 저절로 올리는 건 15초에 한 번까지만 (기기 둘이 동시에 풀어도 한 시간에 480번) (앱을 닫거나 다른 앱으로 갈 때는 바로 올림)
export const SOON_GAP = 15000;
// 계정 서버는 하루 요청 10만 번까지라 넉넉해서, 문제를 풀 때마다 바로(1.5초 모아서) 올림. 대신 바뀐 파일만 받고 올릴 땐 줄여서 (js/account.js)
export const ACCOUNT_GAP = 1500;
// 막혔을 때 기다릴 시간: GitHub가 알려 주면 그만큼, 아니면 1분 → 2분 → 4분 … 최대 1시간
export function limitWait(err, tries = 0) {
  const told = err && err.wait > 0 ? err.wait : 60000 * 2 ** Math.min(tries, 6);
  return Math.min(Math.max(told, 60000), 3600000);
}
// GitHub가 너무 자주 쓴다고 막은 거면 true (토큰 권한 문제인 403과 구분)
export function isLimited(status, headers = {}, message = '') {
  if (status === 429) return true;
  if (status !== 403) return false;
  return headers.remaining === '0' || !!headers.retryAfter || /rate limit|abuse|secondary/i.test(message);
}

// look: { get, set, merge, same } 화면 꾸미기 (get이 null이면 이 기기는 꾸미기를 주고받지 않음, js/look.js).
// mine: { get, set, merge, same } 내 단어 묶음 (js/mywords.js).
// extra: [{ file, get, set, merge, same }] 그 밖에 파일 하나씩 통째로 합치는 것 (코치 이야기·학습 기록 voca-coach.json). get이 null이면 그 파일은 건너뜀.
// marks: { get, set } 모름 표시. coach: { get, set } 고른 코치 캐릭터 { char, at } (토큰을 넣어 동기화할 때만 다른 기기와 맞춰짐). other: { get, set } 다른 모드 진도(단어장에서 두 모드 기록을 합쳐 보여 주려고 받아만 둠)
export function createSync({ getLocal, applyMerged, onStatus, file = FILES[0], marks = null, coach = null, look = null, other = null, mine = null, extra = [] }) {
  const FILE = file;
  const OTHER = FILES.find(f => f !== FILE);
  let conf = load(); // { token, gistId, login, last }
  let running = null;
  let again = false;
  let timer = null;
  let status = conf.token ? 'idle' : 'off';
  let error = '';
  let lastRun = 0; // 마지막으로 GitHub에 다녀온 시각 (soon 간격용)
  let pauseTimer = null;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch {} };
  const setStatus = (s, e = '') => { status = s; error = e; onStatus && onStatus(); };

  async function gh(path, opts = {}, token = conf.token) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
    if (!res.ok) {
      const err = new Error(String(res.status));
      err.status = res.status;
      const h = n => (res.headers && res.headers.get ? res.headers.get(n) : null);
      let message = '';
      try { message = (await res.json()).message || ''; } catch { /* 본문이 없을 수도 */ }
      const retryAfter = h('retry-after'), reset = h('x-ratelimit-reset');
      err.limited = isLimited(res.status, { remaining: h('x-ratelimit-remaining'), retryAfter }, message);
      err.wait = retryAfter ? +retryAfter * 1000 : reset ? +reset * 1000 - Date.now() : 0;
      throw err;
    }
    return res.json();
  }

  async function findOrCreateGist() {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && [...FILES, MARKS, MY].some(f => x.files[f]));
      if (g) return g.id;
      if (list.length < 100) break;
    }
    const body = { description: 'VOCA 진도 (자동 동기화용, 지우지 마세요)', public: false, files: { [FILE]: { content: JSON.stringify(getLocal()) } } };
    return (await gh('/gists', { method: 'POST', body: JSON.stringify(body) })).id;
  }

  async function readFile(g, name) {
    const f = g.files && g.files[name];
    if (!f) return {};
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    try { return JSON.parse(text || '{}'); } catch { return {}; }
  }

  // Gist를 받아 옴. 지워졌으면(404) 바로 찾거나 새로 만들어서 다시 (오류로 안 보이게)
  async function getGist() {
    if (!conf.gistId) { conf.gistId = await findOrCreateGist(); save(); }
    try { return await gh(`/gists/${conf.gistId}`); } catch (e) {
      if (e.status !== 404) throw e;
      conf.gistId = await findOrCreateGist(); save();
      return gh(`/gists/${conf.gistId}`);
    }
  }

  const isAccount = () => conf.kind === 'account';
  // 계정 서버에 있는 파일 (이 앱을 연 동안만 기억): { 이름: { at: 서버 시각, content } }.
  // 받을 때 가진 시각을 알려 주면 서버는 달라진 파일만 내용째 보냄 → 문제마다 동기화해도 다 받지 않음
  let acache = {}, acacheUser = '';
  async function getAccount() {
    if (acacheUser !== conf.login) { acache = {}; acacheUser = conf.login; }
    const have = Object.entries(acache).map(([n, f]) => `${n}:${f.at}`).join(',');
    const r = await accountCall(`/api/files${have ? `?have=${encodeURIComponent(have)}` : ''}`, { token: conf.token, server: conf.server });
    const next = {};
    let missing = false;
    for (const [n, f] of Object.entries(r.files || {})) {
      if (typeof f.content === 'string') next[n] = { at: f.at, content: f.content };
      else if (acache[n] && acache[n].at === f.at) next[n] = acache[n];
      else missing = true;
    }
    acache = next; // 서버에서 없어진 파일은 빠짐
    if (missing) { acache = {}; return getAccount(); } // 그새 달라졌으면 처음부터 한 번 더
    return { files: Object.fromEntries(Object.entries(acache).map(([n, f]) => [n, { content: f.content }])) };
  }
  // 받아 오기: 어느 쪽이든 { files: { 이름: { content } } } 모양으로
  const getRemote = () => (isAccount() ? getAccount() : getGist());
  // 올리기: files = { 이름: { content } }. 계정 서버엔 줄여서 보내고, 올린 건 서버에 있는 것으로 기억
  async function putRemote(files) {
    if (!isAccount()) return gh(`/gists/${conf.gistId}`, { method: 'PATCH', body: JSON.stringify({ files }) });
    const body = { files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.content])) };
    const r = await accountCall('/api/files', { method: 'PUT', token: conf.token, server: conf.server, body, gzip: true });
    for (const [n, c] of Object.entries(body.files)) acache[n] = { at: r.at, content: c };
    return r;
  }

  async function run() {
    setStatus('syncing');
    lastRun = Date.now();
    try {
      const g = await getRemote();
      const remote = await readFile(g, FILE);
      const local = getLocal();
      const prune = { pruneBefore: Date.now() - TOMB_KEEP };
      const merged = mergeProgress(local, remote, prune);
      const differs = x => !sameStats(merged.stats, x.stats || {}) || merged.resetAt !== (x.resetAt || 0) || (merged.bookResetAt || 0) !== (x.bookResetAt || 0) || !samePrefs(merged.prefs, x.prefs) || !samePrefs(merged.sess, x.sess);
      const files = {};
      if (differs(local)) applyMerged(merged);
      if (differs(remote)) files[FILE] = { content: JSON.stringify(merged) };
      if (marks || coach || look) {
        const rf = await readFile(g, MARKS);
        const rm = rf.marks || {}, rc = rf.coach || null, rl = rf.look || null;
        let mm = rm, mc = rc, ml = rl;
        if (marks) {
          const lm = marks.get();
          mm = mergeMarks(lm, rm);
          if (!sameMarks(mm, lm)) marks.set(mm);
        }
        if (coach) {
          const lc = coach.get();
          mc = mergeCoach(lc, rc);
          if (mc && !sameCoach(mc, lc)) coach.set(mc);
        }
        // 꾸미기: 이 기기가 주고받기를 껐으면(get이 null) 받지도 보내지도 않고, 파일에 있던 건 그대로 둠
        const ll = look && look.get();
        if (ll) {
          ml = look.merge(ll, rl);
          if (ml && !look.same(ml, ll)) look.set(ml);
        }
        // 한 파일에 같이 들어 있어서, 하나만 바뀌어도 다 적어 올림 (모르는 칸도 지우지 않게 받은 걸 바탕으로)
        const lookChanged = !!ll && !!ml && !look.same(ml, rl);
        if (!sameMarks(mm, rm) || !sameCoach(mc, rc) || lookChanged) {
          files[MARKS] = { content: JSON.stringify({ ...rf, v: 1, marks: mm, ...(mc ? { coach: mc } : {}), ...(ml ? { look: ml } : {}) }) };
        }
      }
      if (mine) {
        const lm = mine.get();
        const rm = await readFile(g, MY);
        const mm = mine.merge(lm, rm);
        if (!mine.same(mm, lm)) mine.set(mm);
        if (!mine.same(mm, rm)) files[MY] = { content: JSON.stringify(mm) };
      }
      for (const x of extra) {
        const lx = x.get();
        if (!lx) continue;
        const rx = await readFile(g, x.file);
        const mx = x.merge(lx, rx);
        if (!x.same(mx, lx)) x.set(mx);
        if (!x.same(mx, rx)) files[x.file] = { content: JSON.stringify(mx) };
      }
      // 다른 모드 파일이 아직 없어도 이 기기에 그 모드 기록이 있으면(총정리에서 두 모드 문제를 풀면 생김) 새로 올림
      const lo = other && other.get();
      if (other && g.files && (g.files[OTHER] || Object.keys((lo && lo.stats) || {}).length)) {
        const ro = await readFile(g, OTHER);
        const mo = mergeProgress(lo, ro, prune);
        if (!sameStats(mo.stats, lo.stats || {}) || (mo.bookResetAt || 0) !== (lo.bookResetAt || 0)) other.set(mo.stats, mo);
        // 이 기기에서 다른 모드 기록을 지웠으면(DAY 기록 지우기 · 독해에서 막혀 처음부터 · 단어책 새로 시작) 그 파일에도 바로 올림
        if (!sameStats(mo.stats, ro.stats || {}) || (mo.bookResetAt || 0) !== (ro.bookResetAt || 0)) files[OTHER] = { content: JSON.stringify(mo) };
      }
      if (Object.keys(files).length) await putRemote(files);
      conf.last = Date.now();
      delete conf.pauseUntil; delete conf.tries;
      save();
      setStatus('ok');
    } catch (e) {
      if (e.limited) { pause(limitWait(e, conf.tries || 0)); return; }
      if (isAccount()) {
        setStatus('error', e.status === 401 ? '로그인이 풀렸어요. 다시 로그인해 주세요. 진도는 이 기기에 그대로 있어요.'
          : e.status === 413 ? '저장할 수 있는 크기를 넘었어요.'
            : e.status ? `서버에 문제가 있어요 (${e.status}). 잠시 뒤에 다시 해요.` : e.message || '인터넷 연결을 확인해 주세요. 연결되면 다시 시도해요.');
        return;
      }
      if (e.status === 404) { conf.gistId = null; save(); } // Gist를 못 찾으면 다음에 다시 찾거나 새로 만듦
      setStatus('error', e.status === 401 ? '토큰이 만료됐거나 잘못됐어요. 새 토큰으로 다시 연결해 주세요.'
        : e.status === 403 || e.status === 404 ? '토큰에 gist 권한이 있는지 확인해 주세요.'
          : '인터넷 연결을 확인해 주세요. 연결되면 다시 시도해요.');
    }
  }

  // GitHub가 막았으면 그동안은 아무것도 안 보내고(더 보내면 더 오래 막힘), 시간이 되면 알아서 다시
  function pause(ms) {
    conf.pauseUntil = Date.now() + ms;
    conf.tries = (conf.tries || 0) + 1;
    save();
    waitPause();
  }
  function waitPause() {
    const left = (conf.pauseUntil || 0) - Date.now();
    if (left <= 0) return false;
    const min = Math.ceil(left / 60000);
    setStatus('wait', `${isAccount() ? '서버가' : 'GitHub가'} 잠깐 막았어요. ${min}분 뒤에 알아서 다시 할게요. 진도는 이 기기에 그대로 있어요.`);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { pauseTimer = null; now(); }, left + 1000);
    return true;
  }

  async function now() {
    if (!conf.token) return;
    if (waitPause()) return;
    if (running) { again = true; return running; }
    running = run();
    await running;
    running = null;
    if (again) { again = false; return now(); }
  }

  return {
    get enabled() { return !!conf.token; },
    get kind() { return conf.token ? conf.kind || 'gist' : ''; }, // 'account' | 'gist' | ''
    get name() { return conf.name || ''; },                       // 계정 이름 (가입할 때 적은 것)
    get temp() { return !!conf.temp; },                           // '로그인 상태 유지'를 껐음
    get status() { return status; },
    get error() { return error; },
    get login() { return conf.login || ''; },
    get last() { return conf.last || 0; },
    get token() { return conf.token || ''; },
    now,
    // 답을 고를 때마다 바로 보내지 않고 잠깐 모아서 보냄
    // 마지막으로 다녀온 지 15초가 안 됐으면 15초가 될 때까지 모아 둠 (GitHub 쓰기 제한 안 넘게)
    // 이미 기다리는 게 있으면 그대로 둠 (계속 빨리 풀어도 미뤄지기만 하지 않게)
    // 계정 서버면 문제를 풀 때마다 바로 (1.5초만 모아서)
    soon(ms) {
      if (!conf.token || timer) return;
      const acct = isAccount();
      const wait = ms ?? (acct ? 1000 : 4000), gap = acct ? ACCOUNT_GAP : SOON_GAP;
      timer = setTimeout(() => { timer = null; now(); }, Math.max(wait, lastRun + gap - Date.now()));
    },
    async connect(token) {
      token = token.trim();
      const user = await gh('/user', {}, token);
      conf = { kind: 'gist', token, login: user.login, gistId: null, last: 0 };
      save();
      await now();
      return user.login;
    },
    // 계정 서버로 로그인했을 때 (가입·로그인·복구가 준 토큰과 사용자). 바로 한 번 합침
    // temp: '로그인 상태 유지'를 껐을 때 (앱을 닫았다 열면 로그아웃, app.js)
    async connectAccount({ token, user, server, temp = false }) {
      clearTimeout(pauseTimer); clearTimeout(timer); timer = null;
      conf = { kind: 'account', token, login: user.id, name: user.name || '', server, last: 0, ...(temp ? { temp: true } : {}) };
      acache = {}; acacheUser = user.id;
      save();
      setStatus('idle');
      await now();
      return user.id;
    },
    disconnect() {
      clearTimeout(pauseTimer); clearTimeout(timer); timer = null;
      conf = {};
      save();
      setStatus('off');
    },
  };
}
