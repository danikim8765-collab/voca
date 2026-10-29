import {
  rowsToWords, makeBlanks, isTypedCorrect, displayAnswer, answerParts,
  applyResult, pickWords, pickDistractors, shuffle, MAX_BOX, highlightMeaning,
} from './core.js';

// 단어 CSV 파일 (저장소 루트). 새 파일이 생기면 여기에 이름만 추가하면 됨.
const DATA_FILES = ['VOCA_26-37.csv', 'VOCA_38-.csv'];

const KEY = {
  stats: 'voca.stats.v1',
  settings: 'voca.settings.v1',
  session: 'voca.session.v1',
  csv: 'voca.csvcache.v1',
};
const REQUEUE_GAP = 4; // 틀린 단어는 4문제 뒤에 다시

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const load = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

let words = [];
let byId = new Map();
let days = [];
let stats = load(KEY.stats, {});
const settings = Object.assign({
  from: null, to: null, kind: 'choice', size: 20,
  accent: 'en-US', rate: 0.9, autoSpeak: true, showKo: true, showMeaning: false,
}, load(KEY.settings, {}));
let session = null;
let dataInfo = '';

const saveStats = () => save(KEY.stats, stats);
const saveSettings = () => save(KEY.settings, settings);
const saveSession = () => (session ? save(KEY.session, session) : localStorage.removeItem(KEY.session));

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

// ---------- 화면 전환 (안드로이드 뒤로가기 지원) ----------
let current = 'home';
function show(id, push = true) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (push && id !== 'home' && current === 'home') history.pushState({ s: id }, '');
  current = id;
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  if (current === 'quiz') { $('#feedback').hidden = true; }
  if (current !== 'home') goHome(false);
});
function goHome(viaHistory = true) {
  if (viaHistory && current !== 'home' && history.state && history.state.s) { history.back(); return; }
  show('home', false);
  renderHome();
}

// ---------- 발음 (Web Speech API) ----------
let voices = [];
const loadVoices = () => { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; };
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
function pickVoice() {
  if (!voices.length) loadVoices();
  const lang = settings.accent.toLowerCase();
  const en = voices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  const pref = /samantha|google us|google uk|daniel|serena|karen|ava|allison|natural|premium|enhanced/i;
  return en.find(v => pref.test(v.name)) || en[0] || voices.find(v => /^en/i.test(v.lang)) || null;
}
function speak(text) {
  if (!text) return;
  if (!window.speechSynthesis) { toast('이 브라우저는 발음 듣기를 지원하지 않아요'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[~〜…_]+|\.{3}/g, ' '));
  u.lang = settings.accent;
  u.rate = settings.rate;
  const v = pickVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function speakBtn(text, big) {
  const b = el('button', 'speak' + (big ? ' big' : ''), '🔊');
  b.setAttribute('aria-label', '발음 듣기');
  b.addEventListener('click', e => { e.stopPropagation(); speak(text); });
  return b;
}

// ---------- 데이터 ----------
async function fetchCSV(name) {
  const res = await fetch(encodeURI(name) + '?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const buf = await res.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf); // utf-8-sig의 BOM은 parseCSV에서 제거
}

async function loadData() {
  const cached = load(KEY.csv, {});
  const texts = [];
  let fromCache = 0, missing = [];
  await Promise.all(DATA_FILES.map(async name => {
    try {
      const text = await fetchCSV(name);
      cached[name] = text;
      texts.push({ name, text });
    } catch {
      if (cached[name]) { texts.push({ name, text: cached[name] }); fromCache++; } else missing.push(name);
    }
  }));
  for (const name of Object.keys(cached)) {
    if (name.startsWith('local:') && !texts.some(t => t.name === name)) texts.push({ name, text: cached[name] });
  }
  save(KEY.csv, cached);
  texts.sort((a, b) => a.name.localeCompare(b.name));
  setWords(rowsToWords(texts));
  dataInfo = `${texts.map(t => t.name.replace('local:', '폰: ')).join(', ') || '없음'}`
    + (fromCache ? ` (오프라인: 저장된 데이터 ${fromCache}개 사용)` : '')
    + (missing.length ? `\n못 찾은 파일: ${missing.join(', ')}` : '');
}

function setWords(list) {
  words = list;
  byId = new Map(words.map(w => [w.id, w]));
  days = [...new Set(words.map(w => w.day))].sort((a, b) => a - b);
}

// ---------- 홈 ----------
function rangeWords() {
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  return words.filter(w => w.day >= from && w.day <= to);
}
const isMastered = s => s && s.b >= 3;
const isWrongNote = s => s && s.w > 0 && s.b < 3;

function fillDaySelects() {
  for (const sel of [$('#day-from'), $('#day-to')]) {
    sel.innerHTML = '';
    for (const d of days) {
      const o = el('option', null, `DAY ${d}`);
      o.value = d;
      sel.appendChild(o);
    }
  }
}

function setRange(from, to) {
  settings.from = from;
  settings.to = to;
  saveSettings();
  renderHome();
}

function renderHome() {
  if (!words.length) return;
  const last = days[days.length - 1];
  if (!days.includes(settings.from)) settings.from = days[0];
  if (!days.includes(settings.to)) settings.to = last;
  // 새 DAY가 추가됐는데 끝 범위가 이전 마지막 DAY였다면 따라가게 함
  if (settings.lastMax != null && settings.to === settings.lastMax && last > settings.lastMax) settings.to = last;
  settings.lastMax = last;
  saveSettings();

  $('#day-from').value = settings.from;
  $('#day-to').value = settings.to;
  setSeg('#seg-kind', settings.kind);
  setSeg('#seg-size', String(settings.size));

  const rw = rangeWords();
  const now = Date.now();
  let seen = 0, mastered = 0, due = 0, wrong = 0;
  for (const w of rw) {
    const s = stats[w.id];
    if (s) seen++;
    if (isMastered(s)) mastered++;
    if (s && s.d <= now) due++;
    if (isWrongNote(s)) wrong++;
  }
  const st = $('#range-stats');
  st.innerHTML = '';
  for (const [n, l] of [[rw.length, '단어'], [seen, '학습'], [mastered, '암기'], [due, '복습할 것']]) {
    const d = el('div');
    d.append(el('b', null, n), l);
    st.appendChild(d);
  }
  $('#range-bar').style.width = rw.length ? `${(mastered / rw.length) * 100}%` : '0';
  $('#wrong-count').textContent = wrong || '';
  $('#btn-wrong').disabled = !wrong;

  const grid = $('#day-grid');
  grid.innerHTML = '';
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  for (const d of days) {
    const dw = words.filter(w => w.day === d);
    const m = dw.filter(w => isMastered(stats[w.id])).length;
    const wr = dw.filter(w => isWrongNote(stats[w.id])).length;
    const b = el('button', 'day' + (d >= from && d <= to ? ' sel' : ''));
    b.append(el('b', null, `DAY ${d}`), el('span', 'muted', `${m}/${dw.length}` + (wr ? ` · 오답 ${wr}` : '')));
    const bar = el('div', 'bar');
    const f = el('div', 'bar-fill');
    f.style.width = `${(m / dw.length) * 100}%`;
    bar.appendChild(f);
    b.appendChild(bar);
    b.addEventListener('click', () => setRange(d, d));
    grid.appendChild(b);
  }

  const saved = load(KEY.session, null);
  const rc = $('#resume-card');
  if (saved && saved.queue && saved.pos < saved.queue.length) {
    rc.hidden = false;
    $('#resume-info').textContent = `${saved.label} · ${saved.done.length}/${saved.total} 완료`;
  } else rc.hidden = true;
}

function setSeg(sel, v) {
  document.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
function onSeg(sel, fn) {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    setSeg(sel, b.dataset.v);
    fn(b.dataset.v);
  });
}

// ---------- 학습 세션 ----------
function startSession(mode, list) {
  const rw = list || rangeWords();
  const size = settings.size || rw.length;
  const picked = list ? shuffle(list) : pickWords(rw, stats, size, mode === 'order' ? 'order' : mode);
  if (!picked.length) { toast(mode === 'wrong' ? '이 범위에 오답 단어가 없어요' : '학습할 단어가 없어요'); return; }
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  const label = (from === to ? `DAY ${from}` : `DAY ${from}~${to}`)
    + (mode === 'wrong' ? ' 오답' : mode === 'order' ? ' 순서대로' : list ? ' 다시' : '');
  // 순서대로 모드가 아니면 섞어서 출제
  const ids = (mode === 'order' ? picked : shuffle(picked)).map(w => w.id);
  session = { label, mode, queue: ids, pos: 0, total: ids.length, done: [], wrong: [], again: {} };
  saveSession();
  show('quiz');
  renderQuestion();
}

function resumeSession() {
  const saved = load(KEY.session, null);
  if (!saved) return;
  saved.queue = saved.queue.filter(id => byId.has(id));
  session = saved;
  if (session.pos >= session.queue.length) { finishSession(); return; }
  show('quiz');
  renderQuestion();
}

let q = null; // 현재 문제 상태

function renderQuestion() {
  const id = session.queue[session.pos];
  const w = byId.get(id);
  if (!w) { session.pos++; return session.pos < session.queue.length ? renderQuestion() : finishSession(); }
  const b1 = w.ex1 ? makeBlanks(w.ex1, w.blank, w.word) : null;
  const b2 = w.ex2 ? makeBlanks(w.ex2, w.blank, w.word) : null;
  q = { w, b1, b2, answered: false, hint: 0 };

  $('#feedback').hidden = true;
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = `DAY ${w.day}`;
  $('#q-again').hidden = !session.again[id];

  const box = $('#q-sentences');
  box.innerHTML = '';
  const noBlank = !(b1 && b1.ok) && !(b2 && b2.ok);
  [[b1, w.ex1ko], [b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (!b || !b.segs.length) return;
    box.appendChild(sentenceCard(b, ko, i + 1, false, false, w.meaning));
  });
  document.querySelector('.q-prompt').textContent = noBlank ? '뜻에 맞는 말을 고르세요' : '빈칸에 공통으로 들어갈 말은?';
  if (noBlank) box.innerHTML = ''; // 빈칸을 못 만든 예문은 정답이 보이므로 숨김

  const mEl = $('#q-meaning');
  mEl.textContent = meaningText(w);
  mEl.hidden = !(settings.showMeaning || noBlank) || !mEl.textContent;
  q.hint = mEl.hidden ? 0 : 1;
  $('#btn-hint').hidden = false;

  const actions = $('#q-actions');
  actions.innerHTML = '';
  if (settings.kind === 'type') renderTyping(actions);
  else renderChoices(actions);
}

function meaningText(w) {
  return [w.pos, w.meaning].filter(Boolean).join(' ');
}

function sentenceCard(b, ko, n, filled, wrongAnswer, meaning) {
  const card = el('div', 'sent');
  const head = el('div', 'sent-head');
  head.appendChild(el('span', 'num', `예문 ${n}`));
  if (filled) head.appendChild(speakBtn(b.segs.map(s => s.v).join('')));
  card.appendChild(head);
  const en = el('div', 'en');
  for (const s of b.segs) {
    if (s.t === 'text') en.appendChild(document.createTextNode(s.v));
    else {
      const span = el('span', 'blank');
      span.dataset.i = s.i;
      span.textContent = s.v || '   ';
      // 빈칸 길이는 정답 길이와 비슷하게 (힌트가 되지 않도록 약간 랜덤)
      if (!filled) span.style.minWidth = `${Math.max(3, Math.min(10, (s.v || '').length * 0.55 + 1.5))}em`;
      if (filled) span.classList.add('filled');
      if (filled && wrongAnswer) span.classList.add('bad');
      en.appendChild(span);
    }
  }
  card.appendChild(en);
  if (ko) {
    const k = el('div', 'ko' + (!filled && !settings.showKo ? ' hide' : ''));
    for (const s of highlightMeaning(ko, meaning)) k.appendChild(s.t === 'mark' ? el('b', 'ko-mark', s.v) : document.createTextNode(s.v));
    if (!filled && !settings.showKo) k.addEventListener('click', () => k.classList.remove('hide'));
    card.appendChild(k);
  }
  return card;
}

function renderChoices(actions) {
  const w = q.w;
  const pool = rangeWords().length >= 8 ? rangeWords() : words;
  let opts = pickDistractors(w, pool, 3);
  if (opts.length < 3) opts = opts.concat(pickDistractors(w, words, 3).filter(o => !opts.includes(o))).slice(0, 3);
  const choices = shuffle([w, ...opts]);
  choices.forEach((c, i) => {
    const b = el('button', 'choice');
    b.append(el('span', 'n', i + 1), el('span', null, displayAnswer(c)));
    b.addEventListener('click', () => {
      if (q.answered) return;
      const ok = c === w;
      b.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) actions.querySelectorAll('.choice')[choices.indexOf(w)].classList.add('correct');
      actions.querySelectorAll('.choice').forEach(x => (x.disabled = true));
      answer(ok, ok ? null : displayAnswer(c));
    });
    actions.appendChild(b);
  });
  const dk = el('button', 'btn ghost small', '모르겠어요');
  dk.addEventListener('click', () => {
    if (q.answered) return;
    actions.querySelectorAll('.choice')[choices.indexOf(w)].classList.add('correct');
    answer(false, null);
  });
  actions.appendChild(dk);
}

function renderTyping(actions) {
  const parts = answerParts(q.w.blank).length;
  const input = el('input', 'type-input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'done' });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.placeholder = parts > 1 ? `빈칸 ${parts}곳을 순서대로 입력` : '빈칸에 들어갈 말';
  const help = el('div', 'type-help', parts > 1 ? '빈칸 사이는 띄어쓰기로 구분 (예: convinced of)' : '대소문자는 구분하지 않아요');
  const row = el('div', 'row two');
  const dk = el('button', 'btn secondary', '모르겠어요');
  const ok = el('button', 'btn primary', '확인');
  row.append(dk, ok);
  actions.append(input, help, row);
  const submit = () => {
    if (q.answered) return;
    if (!input.value.trim()) { input.focus(); return; }
    const correct = isTypedCorrect(input.value, q.w, q.b1 && q.b1.blanks, q.b2 && q.b2.blanks);
    input.blur();
    answer(correct, correct ? null : input.value.trim());
  };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  dk.addEventListener('click', () => { if (!q.answered) { input.blur(); answer(false, null); } });
  setTimeout(() => input.focus(), 50);
}

function useHint() {
  if (!q || q.answered) return;
  const mEl = $('#q-meaning');
  if (q.hint === 0 && mEl.textContent) {
    mEl.hidden = false;
    q.hint = 1;
    return;
  }
  // 두 번째 힌트: 빈칸마다 첫 글자
  q.hint = 2;
  document.querySelectorAll('#q-sentences .blank').forEach(s => {
    const v = s.textContent.trim();
    if (v) { s.textContent = v[0] + '·'.repeat(Math.max(0, Math.min(v.length - 1, 8))); s.classList.add('hint'); }
  });
  $('#btn-hint').hidden = true;
}

function answer(correct, given) {
  q.answered = true;
  const w = q.w;
  const id = w.id;
  const firstTime = !session.done.includes(id) && !session.wrong.includes(id);

  if (correct) {
    // 이번 세션에서 처음 맞힌 경우만 단계 상승, 틀렸다가 맞힌 건 그대로 0단계 유지
    if (firstTime) stats[id] = applyResult(stats[id], true);
    else stats[id] = { ...stats[id], c: (stats[id].c || 0) + 1, s: Date.now() };
    session.done.push(id);
  } else {
    if (!session.wrong.includes(id)) {
      session.wrong.push(id);
      stats[id] = applyResult(stats[id], false);
    } else stats[id] = { ...stats[id], w: stats[id].w + 1, s: Date.now() };
    session.again[id] = (session.again[id] || 0) + 1;
    // 틀린 단어는 몇 문제 뒤에 다시 출제 (맞힐 때까지)
    const at = Math.min(session.queue.length, session.pos + 1 + REQUEUE_GAP);
    session.queue.splice(at, 0, id);
  }
  session.pos++;
  saveStats();
  saveSession();
  showFeedback(correct, given);
}

function showFeedback(correct, given) {
  const w = q.w;
  const head = $('#fb-head');
  head.className = 'fb-head ' + (correct ? 'ok' : 'bad');
  head.textContent = correct ? '정답이에요! 👏' : given ? `아쉬워요 · 내 답: ${given}` : '정답을 확인하세요';
  $('#fb-word').textContent = w.word;
  $('#fb-pron').textContent = w.pron || (w.blank !== w.word ? `빈칸: ${displayAnswer(w)}` : '');
  const sp = $('#fb-speak');
  sp.onclick = () => speak(w.word);
  const m = $('#fb-meaning');
  m.innerHTML = '';
  if (w.pos) m.appendChild(el('span', 'pos', w.pos));
  m.appendChild(document.createTextNode(w.meaning || ''));

  const box = $('#fb-sentences');
  box.innerHTML = '';
  [[q.b1, w.ex1ko], [q.b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (b && b.segs.length) box.appendChild(sentenceCard(b, ko, i + 1, true, !correct, w.meaning));
  });
  const ex = $('#fb-extras');
  ex.innerHTML = '';
  for (const [k, v] of w.extras) {
    const d = el('div');
    d.append(el('b', null, k), v);
    ex.appendChild(d);
  }
  $('#feedback').hidden = false;
  $('#btn-next').focus({ preventScroll: true });
  if (settings.autoSpeak) speak(w.word);
}

function next() {
  if (!session) return;
  if (session.pos >= session.queue.length) finishSession();
  else renderQuestion();
}

function finishSession() {
  const s = session;
  session = null;
  saveSession();
  $('#feedback').hidden = true;
  const total = s.total;
  const wrong = s.wrong.filter(id => byId.has(id));
  const firstOk = total - wrong.length;
  $('#res-score').textContent = `${Math.round((firstOk / Math.max(1, total)) * 100)}%`;
  $('#res-detail').textContent = `${s.label} · ${total}단어 중 한 번에 맞힌 단어 ${firstOk}개`;
  const list = $('#res-wrong');
  list.innerHTML = '';
  if (!wrong.length) list.appendChild(el('div', 'card center muted', '틀린 단어가 없어요. 완벽해요!'));
  for (const id of wrong) list.appendChild(wordItem(byId.get(id)));
  const again = $('#btn-res-again');
  again.textContent = wrong.length ? '틀린 단어 다시' : '한 번 더';
  again.onclick = () => (wrong.length ? startSession('retry', wrong.map(id => byId.get(id))) : startSession('smart'));
  show('result', false);
}

// ---------- 단어장 ----------
let listFilter = 'all';
function wordItem(w) {
  const s = stats[w.id];
  const item = el('div', 'item');
  const head = el('div', 'item-head');
  const main = el('div', 'item-main');
  const top = el('div');
  top.appendChild(el('span', 'w', w.word));
  if (s && s.w) top.append(' ', el('span', 'badge-wrong', `✕${s.w}`));
  main.append(top, el('div', 'm', [w.pos, w.meaning].filter(Boolean).join(' ')));
  const dots = el('div', 'dots');
  for (let i = 1; i <= MAX_BOX; i++) dots.appendChild(el('i', s && s.b >= i ? 'on' : ''));
  main.appendChild(dots);
  head.append(main, speakBtn(w.word));
  item.appendChild(head);
  item.addEventListener('click', () => {
    if (item.classList.toggle('open')) {
      const det = el('div', 'detail');
      [[w.ex1, w.ex1ko], [w.ex2, w.ex2ko]].forEach(([en, ko], i) => {
        if (!en) return;
        const b = makeBlanks(en, w.blank, w.word);
        det.appendChild(sentenceCard(b, ko, i + 1, true, false, w.meaning));
      });
      for (const [k, v] of w.extras) {
        const d = el('div', 'muted');
        d.textContent = `${k}: ${v}`;
        det.appendChild(d);
      }
      item.appendChild(det);
    } else item.querySelector('.detail')?.remove();
  });
  return item;
}

function renderList() {
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  $('#list-title').textContent = from === to ? `DAY ${from}` : `DAY ${from}~${to}`;
  setSeg('#seg-filter', listFilter);
  const box = $('#word-list');
  box.innerHTML = '';
  const filtered = rangeWords().filter(w => {
    const s = stats[w.id];
    if (listFilter === 'wrong') return isWrongNote(s);
    if (listFilter === 'new') return !s;
    if (listFilter === 'done') return isMastered(s);
    return true;
  });
  if (!filtered.length) box.appendChild(el('div', 'card center muted', '해당하는 단어가 없어요'));
  let lastDay = null;
  for (const w of filtered) {
    if (w.day !== lastDay && from !== to) { box.appendChild(el('div', 'label mt', `DAY ${w.day}`)); lastDay = w.day; }
    box.appendChild(wordItem(w));
  }
}

// ---------- 설정 ----------
function renderSettings() {
  setSeg('#seg-accent', settings.accent);
  $('#rate').value = settings.rate;
  $('#rate-val').textContent = `${settings.rate}x`;
  $('#opt-autospeak').checked = settings.autoSpeak;
  $('#opt-ko').checked = settings.showKo;
  $('#opt-meaning').checked = settings.showMeaning;
  $('#data-info').textContent = `단어 ${words.length}개 · DAY ${days[0] ?? '-'}~${days[days.length - 1] ?? '-'}\n${dataInfo}`;
  $('#data-info').style.whiteSpace = 'pre-line';
}

function exportProgress() {
  const data = JSON.stringify({ app: 'voca', v: 1, at: new Date().toISOString(), stats, settings }, null, 0);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voca-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importProgress(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.stats !== 'object') throw new Error();
    if (!confirm('백업 파일의 진도로 덮어쓸까요?')) return;
    stats = data.stats;
    saveStats();
    toast('진도를 불러왔어요');
    renderSettings();
  } catch {
    toast('백업 파일을 읽을 수 없어요');
  }
}

async function importLocalCSV(files) {
  const cached = load(KEY.csv, {});
  for (const f of files) cached['local:' + f.name] = await f.text();
  if (!save(KEY.csv, cached)) toast('저장 공간이 부족해서 이번에만 사용돼요');
  const texts = Object.entries(cached).map(([name, text]) => ({ name, text }));
  setWords(rowsToWords(texts));
  dataInfo = texts.map(t => t.name.replace('local:', '폰: ')).join(', ');
  boot(true);
  toast(`단어 ${words.length}개를 불러왔어요`);
}

// ---------- 시작 ----------
function boot(fromLocal) {
  const status = $('#load-status');
  if (!words.length) {
    status.hidden = false;
    status.innerHTML = '';
    status.append(
      '단어 데이터를 찾지 못했어요.\n저장소에 ',
      el('code', null, DATA_FILES.join(', ')),
      ' 파일을 올렸는지 확인해 주세요.\n\n',
    );
    const b = el('button', 'btn secondary small', '폰에 있는 CSV 직접 열기');
    b.addEventListener('click', () => $('#csv-file').click());
    status.appendChild(b);
    $('#home-body').hidden = true;
    return;
  }
  status.hidden = true;
  $('#home-body').hidden = false;
  fillDaySelects();
  if (fromLocal) { settings.from = days[0]; settings.to = days[days.length - 1]; }
  renderHome();
}

function bind() {
  $('#day-from').addEventListener('change', e => setRange(+e.target.value, settings.to));
  $('#day-to').addEventListener('change', e => setRange(settings.from, +e.target.value));
  $('#range-chips').addEventListener('click', e => {
    const r = e.target.closest('button')?.dataset.range;
    const last = days[days.length - 1];
    if (r === 'last') setRange(last, last);
    if (r === 'last3') setRange(days[Math.max(0, days.length - 3)], last);
    if (r === 'all') setRange(days[0], last);
  });
  onSeg('#seg-kind', v => { settings.kind = v; saveSettings(); });
  onSeg('#seg-size', v => { settings.size = +v; saveSettings(); });
  $('#btn-start').addEventListener('click', () => startSession('smart'));
  $('#btn-wrong').addEventListener('click', () => startSession('wrong'));
  $('#btn-order').addEventListener('click', () => startSession('order'));
  $('#btn-resume').addEventListener('click', resumeSession);
  $('#btn-resume-drop').addEventListener('click', () => { localStorage.removeItem(KEY.session); renderHome(); });
  $('#btn-list').addEventListener('click', () => { listFilter = 'all'; renderList(); show('list'); });
  $('#btn-list-back').addEventListener('click', () => goHome());
  onSeg('#seg-filter', v => { listFilter = v; renderList(); });

  $('#btn-quit').addEventListener('click', () => {
    if (window.speechSynthesis) speechSynthesis.cancel();
    session = null; // 진행 상황은 저장되어 있어 홈에서 이어하기 가능
    goHome();
  });
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-next').addEventListener('click', next);
  $('#btn-res-home').addEventListener('click', () => goHome());

  $('#btn-settings').addEventListener('click', () => { renderSettings(); show('settings'); });
  $('#btn-settings-back').addEventListener('click', () => goHome());
  onSeg('#seg-accent', v => { settings.accent = v; saveSettings(); });
  $('#rate').addEventListener('input', e => { settings.rate = +e.target.value; $('#rate-val').textContent = `${settings.rate}x`; saveSettings(); });
  $('#opt-autospeak').addEventListener('change', e => { settings.autoSpeak = e.target.checked; saveSettings(); });
  $('#opt-ko').addEventListener('change', e => { settings.showKo = e.target.checked; saveSettings(); });
  $('#opt-meaning').addEventListener('change', e => { settings.showMeaning = e.target.checked; saveSettings(); });
  $('#btn-test-voice').addEventListener('click', () => speak('I tried to convince him of the danger.'));
  $('#btn-export').addEventListener('click', exportProgress);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ''; });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('모든 학습 진도를 지울까요? 되돌릴 수 없어요.')) return;
    stats = {};
    saveStats();
    localStorage.removeItem(KEY.session);
    toast('진도를 초기화했어요');
  });
  $('#btn-reload').addEventListener('click', async () => {
    await loadData();
    boot();
    renderSettings();
    toast(`단어 ${words.length}개 · DAY ${days[0]}~${days[days.length - 1]}`);
  });
  $('#btn-local-csv').addEventListener('click', () => $('#csv-file').click());
  $('#csv-file').addEventListener('change', e => { if (e.target.files.length) importLocalCSV([...e.target.files]); e.target.value = ''; });

  // 키보드 (PC에서 테스트할 때)
  document.addEventListener('keydown', e => {
    if (current !== 'quiz') return;
    if (!$('#feedback').hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); return; }
    if (settings.kind === 'choice' && /^[1-4]$/.test(e.key) && !q?.answered) {
      $('#q-actions').querySelectorAll('.choice')[+e.key - 1]?.click();
    }
  });
}

bind();
loadData().then(() => boot()).catch(err => {
  $('#load-status').textContent = '단어를 불러오지 못했어요: ' + err.message;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
