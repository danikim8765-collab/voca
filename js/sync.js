// 기기 간 진도 동기화: 내 GitHub 계정의 비밀 Gist 하나(voca-progress.json)에 진도를 저장하고 합친다.
import { mergeProgress, sameStats, samePrefs } from './core.js';

const API = 'https://api.github.com';
const FILE = 'voca-progress.json';
const KEY = 'voca.sync.v1';

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function createSync({ getLocal, applyMerged, onStatus }) {
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
      const g = list.find(x => x.files && x.files[FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    const body = { description: 'VOCA 빈칸 암기 진도 (자동 동기화용, 지우지 마세요)', public: false, files: { [FILE]: { content: JSON.stringify(getLocal()) } } };
    return (await gh('/gists', { method: 'POST', body: JSON.stringify(body) })).id;
  }

  async function readRemote() {
    const g = await gh(`/gists/${conf.gistId}`);
    const f = g.files && g.files[FILE];
    if (!f) return {};
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    try { return JSON.parse(text || '{}'); } catch { return {}; }
  }

  async function run() {
    setStatus('syncing');
    try {
      if (!conf.gistId) { conf.gistId = await findOrCreateGist(); save(); }
      const remote = await readRemote();
      const local = getLocal();
      const merged = mergeProgress(local, remote);
      const differs = x => !sameStats(merged.stats, x.stats || {}) || merged.resetAt !== (x.resetAt || 0) || !samePrefs(merged.prefs, x.prefs);
      if (differs(local)) applyMerged(merged);
      if (differs(remote)) {
        await gh(`/gists/${conf.gistId}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(merged) } } }) });
      }
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
