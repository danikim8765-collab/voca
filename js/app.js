import {
  rowsToWords, makeBlanks, isTypedCorrect, displayAnswer, answerParts,
  applyResult, pickWords, pickDistractors, shuffle, MAX_BOX, highlightMeaning, nextLetterHint, typingHintTarget,
} from './core.js';
import { createSync } from './sync.js';

// 앱 버전: 고칠 때마다 version.txt와 같이 올림. 다르면 홈 화면 앱이 스스로 새로고침
const APP_VERSION = '202610290942';

// 단어 CSV 파일 (저장소 루트). 새 파일이 생기면 여기에 이름만 추가하면 됨.
const DATA_FILES = ['VOCA_26-37.csv', 'VOCA_38-.csv'];

const KEY = {
  stats: 'voca.stats.v1',
  settings: 'voca.settings.v1',
  session: 'voca.session.v1',
  csv: 'voca.csvcache.v1',
  resetAt: 'voca.resetAt.v1',
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
  accent: 'en-US', rate: 0.9, autoSpeak: true, showKo: true, showMeaning: false, appKeyboard: true,
}, load(KEY.settings, {}));
let session = null;
let dataInfo = '';

const saveStats = () => save(KEY.stats, stats);
let resetAt = load(KEY.resetAt, 0);

// ---------- 기기 간 동기화 ----------
const sync = createSync({
  getLocal: () => ({ v: 1, resetAt, stats }),
  applyMerged: m => {
    stats = m.stats;
    resetAt = m.resetAt;
    saveStats();
    save(KEY.resetAt, resetAt);
    if (current === 'home') renderHome();
  },
  onStatus: () => renderSyncStatus(),
});
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
  if (updateReady) { location.reload(); return; }
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
  const u = new SpeechSynthesisUtterance(text.replace(/\[[^\]]*\]/g, ' ').replace(/[~〜…_]+|\.{3}/g, ' '));
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
  q = { w, b1, b2, answered: false, letterHint: false, revealed: false };

  $('#feedback').hidden = true;
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = `DAY ${w.day}`;
  $('#q-again').hidden = !session.again[id];
  $('#q-star').hidden = !w.star;

  const box = $('#q-sentences');
  box.innerHTML = '';
  const noBlank = !(b1 && b1.ok) && !(b2 && b2.ok);
  [[b1, w.ex1ko], [b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (!b || !b.segs.length) return;
    box.appendChild(sentenceCard(b, ko, i + 1, false, false, w.meaning, i ? w.ex2src : w.ex1src));
  });
  document.querySelector('.q-prompt').textContent = noBlank ? '뜻에 맞는 말을 고르세요' : '빈칸에 공통으로 들어갈 말은?';
  if (noBlank) box.innerHTML = ''; // 빈칸을 못 만든 예문은 정답이 보이므로 숨김

  const mEl = $('#q-meaning');
  mEl.textContent = meaningText(w);
  mEl.hidden = !(settings.showMeaning || noBlank) || !mEl.textContent;
  $('#btn-hint').hidden = false;
  $('#btn-hint').textContent = '💡 힌트';

  const actions = $('#q-actions');
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode');
  $('.quiz-body').style.paddingBottom = '';
  if (settings.kind === 'type') renderTyping(actions);
  else renderChoices(actions);
}

// "1. 치명적인 2. 결정적인" → 번호마다 줄바꿈
const formatMeaning = m => String(m || '').replace(/\s+(?=\d+\.\s)/g, '\n');

function meaningText(w) {
  return [w.pos, formatMeaning(w.meaning)].filter(Boolean).join(' ');
}

function sentenceCard(b, ko, n, filled, wrongAnswer, meaning, src) {
  const card = el('div', 'sent');
  const head = el('div', 'sent-head');
  head.appendChild(el('span', 'num', `예문 ${n}` + (src ? ` · ${src}` : '')));
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
}

function renderTyping(actions) {
  const parts = answerParts(q.w.blank).length;
  const placeholder = parts > 1 ? `빈칸 ${parts}곳을 순서대로 입력` : '빈칸에 들어갈 말';
  const helpText = parts > 1 ? '빈칸 사이는 띄어쓰기로 구분 (예: convinced of)' : '대소문자는 구분하지 않아요';
  const isRight = value => isTypedCorrect(value, q.w, q.b1 && q.b1.blanks, q.b2 && q.b2.blanks);
  // 확인을 눌렀을 때. 정답을 보고 쓰는 중이면 다 따라 쓸 때까지 제출하지 않음
  const check = value => {
    if (q.answered) return false;
    const correct = isRight(value);
    if (q.revealed) { if (correct) answer(false, null, true); return correct; }
    answer(correct, correct ? null : value.trim());
    return true;
  };
  // 정답을 다 쓰는 순간 확인 없이 바로 처리 (틀린 답은 확인을 눌러야 제출)
  const autoCheck = value => {
    if (!q.answered && isRight(value)) { check(value); return true; }
    return false;
  };
  if (settings.appKeyboard) {
    const kbHelp = parts > 1 ? `빈칸 ${parts}곳 · 띄어쓰기로 다음 빈칸` : '키보드로 바로 입력하세요';
    return renderAppKeyboard(actions, kbHelp, check, autoCheck);
  }

  const input = el('input', 'type-input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'done' });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.placeholder = placeholder;
  const ok = el('button', 'btn primary', '확인');
  actions.append(input, el('div', 'type-help', helpText), ok);
  q.typing = {
    get: () => input.value,
    set: v => { input.value = v; input.focus(); },
    reveal: (target, keep) => {
      // 문장 빈칸에 정답을 회색으로 보여주고, 입력칸에 따라 쓰게 함
      document.querySelectorAll('#q-sentences .blank').forEach(sp => sp.classList.add('ghost-full'));
      input.value = keep;
      input.placeholder = target;
      input.focus();
    },
  };
  const submit = () => {
    if (!input.value.trim()) { input.focus(); return; }
    if (!check(input.value)) { input.focus(); return; }
    input.blur();
  };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => { if (isTypedCorrect(input.value, q.w, q.b1 && q.b1.blanks, q.b2 && q.b2.blanks)) input.blur(); autoCheck(input.value); });
  setTimeout(() => input.focus(), 50);
}

// ---------- 앱 자체 영어 키보드 (폰 키보드 대신) ----------
// 입력값을 문장의 빈칸들에 나눠 넣기. 같은 단어가 반복된 빈칸(cues … cues)은 모두 같은 값
function fillBlanks(value, targets) {
  if (targets.length <= 1 || targets.every(t => t.toLowerCase() === targets[0].toLowerCase())) {
    return { fill: targets.map(() => value), active: 0 };
  }
  const words = value.split(' ');
  const fill = [];
  let wi = 0, active = 0;
  targets.forEach((t, i) => {
    const n = i === targets.length - 1 ? Infinity : t.trim().split(/\s+/).length;
    const take = words.slice(wi, wi + n);
    if (take.length) active = i;
    wi += take.length;
    fill.push(take.join(' '));
  });
  return { fill, active };
}
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', "'zxcvbnm⌫"];
let kb = null; // 현재 키보드 상태 { value, type(key), submit() }

function renderAppKeyboard(actions, helpText, check, autoCheck) {
  $('#quiz').classList.add('kb-mode');
  const top = el('div', 'kb-top');
  const hintBtn = el('button', 'btn ghost small kb-hint', '💡 힌트');
  hintBtn.addEventListener('click', useHint);
  const help = el('div', 'type-help', helpText);
  top.append(help, hintBtn);

  // 입력한 글자는 문장 속 빈칸에 바로 써짐. 갈라진 숙어는 띄어쓰기 기준으로 다음 빈칸으로 넘어감
  const cards = [...document.querySelectorAll('#q-sentences .sent')];
  const targets = [q.b1, q.b2].filter(b => b && b.segs.length).map(b => b.blanks);
  const caret = el('span', 'kb-caret');
  let ghostText = '', ghostLen = 0;
  const render = () => {
    cards.forEach((card, ci) => {
      const spans = [...card.querySelectorAll('.blank')];
      const { fill, active } = fillBlanks(kb.value, targets[ci] || []);
      // 힌트로 보여줄 회색 글자: 첫 힌트는 몇 글자만, 정답 보고 쓰기는 전부
      const ghostFill = ci === 0 && ghostLen ? fillBlanks(ghostText.slice(0, ghostLen), targets[0]).fill : [];
      spans.forEach((sp, i) => {
        sp.classList.add('typing');
        sp.classList.toggle('active', i === active);
        const typed = fill[i] || '';
        const want = (targets[ci] || [])[i] || '';
        const ghost = want.slice(0, ci === 0 ? (ghostFill[i] || '').length : q.revealed ? want.length : 0);
        const onTrack = want.toLowerCase().startsWith(typed.toLowerCase());
        sp.textContent = '';
        // 정답 보고 쓰기에서 다르게 쓴 글자는 빨갛게(첫 문장 기준)
        if (q.revealed && !onTrack && ci === 0) sp.appendChild(el('span', 'typo', typed));
        else sp.appendChild(document.createTextNode(typed));
        if (ci === 0 && i === active) sp.appendChild(caret);
        if (onTrack && ghost.length > typed.length) sp.appendChild(el('span', 'ghost', ghost.slice(typed.length)));
        else if (!typed) sp.appendChild(document.createTextNode('\u00a0'));
      });
    });
  };
  const board = el('div', 'kb');
  kb = {
    value: '',
    type(key) {
      if (q.answered) return;
      if (key === 'back') kb.value = kb.value.slice(0, -1);
      else if (key === ' ') { if (kb.value && !kb.value.endsWith(' ')) kb.value += ' '; }
      else if (kb.value.length < 60) kb.value += key;
      render();
      autoCheck(kb.value);
    },
    submit() {
      if (q.answered) return;
      const shake = () => { const c = cards[0] || top; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); };
      if (!kb.value.trim()) { shake(); return; }
      if (!check(kb.value)) shake();
    },
  };
  const key = (label, cls, fn) => {
    const b = el('button', 'key' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    // pointerdown으로 바로 반응 (터치 지연 없음), 지우기는 길게 누르면 연속 삭제
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      fn();
      if (label === '⌫') {
        clearInterval(kb.repeat);
        kb.hold = setTimeout(() => { kb.repeat = setInterval(fn, 70); }, 400);
      }
      if (navigator.vibrate) navigator.vibrate(8);
    });
    return b;
  };
  for (const row of KB_ROWS) {
    const r = el('div', 'kb-row');
    for (const ch of row) {
      if (ch === '⌫') r.appendChild(key('⌫', 'wide fn', () => kb.type('back')));
      else if (ch === "'") r.appendChild(key("'", 'fn', () => kb.type("'")));
      else r.appendChild(key(ch, '', () => kb.type(ch)));
    }
    board.appendChild(r);
  }
  const last = el('div', 'kb-row');
  last.append(
    key('-', 'fn', () => kb.type('-')),
    key('띄어쓰기', 'space', () => kb.type(' ')),
    key('확인', 'enter', () => kb.submit()),
  );
  board.appendChild(last);
  const stopRepeat = () => { clearTimeout(kb && kb.hold); clearInterval(kb && kb.repeat); };
  board.addEventListener('pointerup', stopRepeat);
  board.addEventListener('pointercancel', stopRepeat);
  board.addEventListener('pointerleave', stopRepeat);
  actions.append(top, board);
  render();
  q.typing = {
    get: () => kb.value,
    set: v => { kb.value = v; render(); },
    // 회색 글자 힌트: keep까지는 입력으로 남기고, upto 글자까지 회색으로 보여줌
    ghost: (target, keep, upto) => {
      kb.value = keep;
      ghostText = target;
      ghostLen = upto;
      help.textContent = '회색 글자를 따라 써보세요';
      render();
    },
    reveal: (target, keep) => q.typing.ghost(target, keep, Infinity),
  };
  // 고정된 키보드에 문장이 가리지 않게 아래 여백 확보
  requestAnimationFrame(() => { $('.quiz-body').style.paddingBottom = `${actions.offsetHeight + 12}px`; });
}

function useHint() {
  if (!q || q.answered) return;
  if (q.typing) {
    if (q.revealed) return;
    const target = typingHintTarget(q.w, q.b1 && q.b1.blanks, q.b2 && q.b2.blanks);
    const cur = q.typing.get();
    let k = 0;
    const low = cur.toLowerCase();
    while (k < low.length && low[k] === target[k]) k++;
    const keep = target.slice(0, k); // 맞게 쓴 데까지만 남김
    // 첫 번째: 그다음 2글자를 회색으로 보여줌 (앱 키보드) / 채워줌 (폰 키보드)
    if (!q.letterHint) {
      const next = nextLetterHint(cur, target);
      q.letterHint = true;
      if (next != null) {
        if (q.typing.ghost) q.typing.ghost(target, keep, next.length);
        else q.typing.set(next);
        setHintButtons('💡 정답 보고 쓰기');
        return;
      }
    }
    // 두 번째: 전체 정답을 회색으로 보여주고 따라 쓰게 함 (틀린 것으로 기록, 곧 다시 나옴)
    q.revealed = true;
    q.typing.reveal(target, keep);
    setHintButtons(null);
    return;
  }
  // 객관식: 빈칸마다 첫 글자
  document.querySelectorAll('#q-sentences .blank').forEach(s => {
    const v = s.textContent.trim();
    if (v) { s.textContent = v[0] + '·'.repeat(Math.max(0, Math.min(v.length - 1, 8))); s.classList.add('hint'); }
  });
  setHintButtons(null);
}

function setHintButtons(label) {
  for (const b of [$('#btn-hint'), document.querySelector('.kb-hint')]) {
    if (!b) continue;
    b.hidden = label == null;
    if (label) b.textContent = label;
  }
}

function answer(correct, given, copied) {
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
  sync.soon();
  saveSession();
  showFeedback(correct, given, copied);
}

function showFeedback(correct, given, copied) {
  const w = q.w;
  const head = $('#fb-head');
  head.className = 'fb-head ' + (correct ? 'ok' : copied ? 'copied' : 'bad');
  head.textContent = correct ? '정답이에요! 👏' : copied ? '잘 따라 썼어요 · 조금 뒤에 다시 나와요' : given ? `아쉬워요 · 내 답: ${given}` : '정답을 확인하세요';
  $('#fb-word').textContent = w.word;
  $('#fb-pron').textContent = w.pron || (w.blank !== w.word ? `빈칸: ${displayAnswer(w)}` : '');
  const sp = $('#fb-speak');
  sp.onclick = () => speak(w.word);
  const m = $('#fb-meaning');
  m.innerHTML = '';
  if (w.pos) m.appendChild(el('span', 'pos', w.pos));
  m.appendChild(document.createTextNode(formatMeaning(w.meaning)));

  const box = $('#fb-sentences');
  box.innerHTML = '';
  [[q.b1, w.ex1ko], [q.b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (b && b.segs.length) box.appendChild(sentenceCard(b, ko, i + 1, true, !correct && !copied, w.meaning, i ? w.ex2src : w.ex1src));
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
  sync.now();
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
  if (w.star) top.append(' ', el('span', 'tag star', '형광'));
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
        det.appendChild(sentenceCard(b, ko, i + 1, true, false, w.meaning, i ? w.ex2src : w.ex1src));
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
function renderSyncStatus() {
  const badge = $('#sync-badge');
  badge.hidden = !sync.enabled;
  badge.className = 'sync-badge ' + sync.status;
  badge.textContent = { syncing: '☁︎ 동기화 중', ok: '☁︎ 동기화됨', error: '☁︎ 동기화 오류', idle: '☁︎' }[sync.status] || '';
  $('#sync-off').hidden = sync.enabled;
  $('#sync-on').hidden = !sync.enabled;
  if (sync.enabled) {
    const t = sync.last ? new Date(sync.last).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '아직 없음';
    $('#sync-info').textContent = `GitHub 계정 ${sync.login}에 연결됨\n마지막 동기화: ${t}` + (sync.status === 'error' ? `\n⚠︎ ${sync.error}` : sync.status === 'syncing' ? '\n동기화 중…' : '');
  }
}

function renderSettings() {
  setSeg('#seg-accent', settings.accent);
  $('#rate').value = settings.rate;
  $('#rate-val').textContent = `${settings.rate}x`;
  $('#opt-autospeak').checked = settings.autoSpeak;
  $('#opt-ko').checked = settings.showKo;
  $('#opt-meaning').checked = settings.showMeaning;
  $('#opt-appkb').checked = settings.appKeyboard;
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
    sync.now();
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

  $('#btn-settings').addEventListener('click', () => { renderSettings(); renderSyncStatus(); show('settings'); });
  $('#btn-settings-back').addEventListener('click', () => goHome());
  onSeg('#seg-accent', v => { settings.accent = v; saveSettings(); });
  $('#rate').addEventListener('input', e => { settings.rate = +e.target.value; $('#rate-val').textContent = `${settings.rate}x`; saveSettings(); });
  $('#opt-autospeak').addEventListener('change', e => { settings.autoSpeak = e.target.checked; saveSettings(); });
  $('#opt-ko').addEventListener('change', e => { settings.showKo = e.target.checked; saveSettings(); });
  $('#opt-meaning').addEventListener('change', e => { settings.showMeaning = e.target.checked; saveSettings(); });
  $('#opt-appkb').addEventListener('change', e => { settings.appKeyboard = e.target.checked; saveSettings(); });
  $('#btn-test-voice').addEventListener('click', () => speak('I tried to convince him of the danger.'));
  $('#btn-export').addEventListener('click', exportProgress);
  $('#btn-sync-connect').addEventListener('click', async () => {
    const token = $('#sync-token').value.trim();
    if (!token) { toast('토큰을 붙여넣어 주세요'); return; }
    const btn = $('#btn-sync-connect');
    btn.disabled = true;
    btn.textContent = '연결 중…';
    try {
      const login = await sync.connect(token);
      $('#sync-token').value = '';
      toast(`${login} 계정으로 연결했어요`);
    } catch (e) {
      toast(e.status === 401 ? '토큰이 맞지 않아요. 다시 복사해서 붙여넣어 주세요' : '연결하지 못했어요. 인터넷과 토큰을 확인해 주세요', 3500);
    }
    btn.disabled = false;
    btn.textContent = '연결';
    renderSyncStatus();
  });
  $('#btn-sync-now').addEventListener('click', async () => { await sync.now(); toast(sync.status === 'ok' ? '동기화했어요' : sync.error); });
  $('#btn-sync-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(sync.token); toast('토큰을 복사했어요. 다른 기기의 설정에 붙여넣으세요'); }
    catch { prompt('이 토큰을 복사하세요', sync.token); }
  });
  $('#btn-sync-off').addEventListener('click', () => {
    if (!confirm('이 기기의 동기화 연결을 끊을까요? (진도는 이 기기에 그대로 남아요)')) return;
    sync.disconnect();
    renderSyncStatus();
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ''; });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm(sync.enabled ? '모든 학습 진도를 지울까요? 동기화된 다른 기기의 진도도 함께 지워져요. 되돌릴 수 없어요.' : '모든 학습 진도를 지울까요? 되돌릴 수 없어요.')) return;
    stats = {};
    resetAt = Date.now(); // 다른 기기의 예전 기록도 함께 지워지게
    save(KEY.resetAt, resetAt);
    saveStats();
    sync.now();
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
    if (kb && !q?.answered && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'Enter') kb.submit();
      else if (e.key === 'Backspace') kb.type('back');
      else if (/^[a-zA-Z' -]$/.test(e.key)) kb.type(e.key.toLowerCase());
      else return;
      e.preventDefault();
      return;
    }
    if (settings.kind === 'choice' && /^[1-4]$/.test(e.key) && !q?.answered) {
      $('#q-actions').querySelectorAll('.choice')[+e.key - 1]?.click();
    }
  });
}

bind();
loadData().then(() => { boot(); renderSyncStatus(); sync.now(); }).catch(err => {
  $('#load-status').textContent = '단어를 불러오지 못했어요: ' + err.message;
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { if (words.length) sync.now(); return; }
  checkUpdate();
  if (words.length) sync.now();
});

// 홈 화면 앱은 계속 켜져 있어서 새 버전이 안 보일 수 있음 → 앱으로 돌아올 때 확인
let updateReady = false;
async function checkUpdate() {
  try {
    const res = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const v = (await res.text()).trim();
    if (v && v !== APP_VERSION) {
      updateReady = true;
      if (current !== 'quiz') location.reload(); // 퀴즈 중이면 끝나고 홈으로 갈 때 새로고침
    }
  } catch {}
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
