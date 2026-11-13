// 기기 간 진도 동기화: 내 GitHub 계정의 비밀 Gist 하나(voca-progress.json)에 진도를 저장하고 합친다.
import { mergeProgress, sameStats, samePrefs, mergeMarks, sameMarks, mergeCoach, sameCoach } from './core.js';

const API = 'https://api.github.com';
// 예문 모드 진도는 voca-progress.json, 단어 모드는 같은 Gist의 voca-word-progress.json
const FILES = ['voca-progress.json', 'voca-word-progress.json'];
const MARKS = 'voca-marks.json'; // 단어장 '모름' 표시와 고른 코치 캐릭터: 두 모드가 같이 씀
const KEY = 'voca.sync.v1'; // 토큰·Gist는 두 모드가 같이 씀

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

// marks: { get, set } 모름 표시. coach: { get, set } 고른 코치 캐릭터 { char, at } (토큰을 넣어 동기화할 때만 다른 기기와 맞춰짐). other: { get, set } 다른 모드 진도(단어장에서 두 모드 기록을 합쳐 보여 주려고 받아만 둠)
export function createSync({ getLocal, applyMerged, onStatus, file = FILES[0], marks = null, coach = null, other = null }) {
  const FILE = file;
  const OTHER = FILES.find(f => f !== FILE);
  let conf = load(); // { token, gistId, login, last }
  let running = null;
  let again = false;
  let timer = null;
  let status = conf.token ? 'idle' : 'off';
  let error = '';

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(conf)); } catch {} };
  const setStatus = (s, e = '') => { status = s; error = e; onStatus && onStatus(); };

  async function gh(path, opts = {}, token = conf.token) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
    if (!res.ok) {
      const err = new Error(String(res.status));
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function findOrCreateGist() {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && [...FILES, MARKS].some(f => x.files[f]));
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

  async function run() {
    setStatus('syncing');
    try {
      if (!conf.gistId) { conf.gistId = await findOrCreateGist(); save(); }
      const g = await gh(`/gists/${conf.gistId}`);
      const remote = await readFile(g, FILE);
      const local = getLocal();
      const merged = mergeProgress(local, remote);
      const differs = x => !sameStats(merged.stats, x.stats || {}) || merged.resetAt !== (x.resetAt || 0) || !samePrefs(merged.prefs, x.prefs);
      const files = {};
      if (differs(local)) applyMerged(merged);
      if (differs(remote)) files[FILE] = { content: JSON.stringify(merged) };
      if (marks || coach) {
        const rf = await readFile(g, MARKS);
        const rm = rf.marks || {}, rc = rf.coach || null;
        let mm = rm, mc = rc;
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
        // 한 파일에 같이 들어 있어서, 하나만 바뀌어도 둘 다 적어 올림
        if (!sameMarks(mm, rm) || !sameCoach(mc, rc)) files[MARKS] = { content: JSON.stringify({ v: 1, marks: mm, ...(mc ? { coach: mc } : {}) }) };
      }
      if (other && g.files && g.files[OTHER]) {
        const lo = other.get();
        const ro = await readFile(g, OTHER);
        const mo = mergeProgress(lo, ro);
        if (!sameStats(mo.stats, lo.stats || {})) other.set(mo.stats);
        // 이 기기에서 다른 모드 기록을 지웠으면(DAY 기록 지우기) 그 파일에도 바로 올림
        if (!sameStats(mo.stats, ro.stats || {})) files[OTHER] = { content: JSON.stringify(mo) };
      }
      if (Object.keys(files).length) await gh(`/gists/${conf.gistId}`, { method: 'PATCH', body: JSON.stringify({ files }) });
      conf.last = Date.now();
      save();
      setStatus('ok');
    } catch (e) {
      if (e.status === 404) { conf.gistId = null; save(); } // Gist가 지워졌으면 다음에 새로 만듦
      setStatus('error', e.status === 401 ? '토큰이 만료됐거나 잘못됐어요. 새 토큰으로 다시 연결해 주세요.'
        : e.status === 403 || e.status === 404 ? '토큰에 gist 권한이 있는지 확인해 주세요.'
          : '인터넷 연결을 확인해 주세요. 연결되면 다시 시도해요.');
    }
  }

  async function now() {
    if (!conf.token) return;
    if (running) { again = true; return running; }
    running = run();
    await running;
    running = null;
    if (again) { again = false; return now(); }
  }

  return {
    get enabled() { return !!conf.token; },
    get status() { return status; },
    get error() { return error; },
    get login() { return conf.login || ''; },
    get last() { return conf.last || 0; },
    get token() { return conf.token || ''; },
    now,
    // 답을 고를 때마다 바로 보내지 않고 잠깐 모아서 보냄
    soon(ms = 4000) {
      if (!conf.token) return;
      clearTimeout(timer);
      timer = setTimeout(now, ms);
    },
    async connect(token) {
      token = token.trim();
      const user = await gh('/user', {}, token);
      conf = { token, login: user.login, gistId: null, last: 0 };
      save();
      await now();
      return user.login;
    },
    disconnect() {
      conf = {};
      save();
      setStatus('off');
    },
  };
}
