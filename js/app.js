import {
  rowsToWords, makeBlanks, normalizeAnswer, displayAnswer, answerParts,
  applyResult, buildPlan, pickReview, pickSrsReview, retentionCurve, PRESETS, normalizeStat, isDue, dateStr, daysBetween, pickDistractors, shuffle,
  highlightMeaning, nextLetterHint, typingHintTarget, blankUnit, coachFeedback, makeWordFinder, addDays, gradeMeaning, pickMeaningDistractors,
  synAnt, mergeMarks, nearestKey, makeSynQuestion, hasSynAnt, shortMeaning, examAt, coachPlan,
} from './core.js';
import { createSync } from './sync.js';
import { aiGradeMeaning, aiExplainWrong, aiCoach, aiConnect, aiDisconnect, aiEnabled, aiOnline, aiSwitch, setAiSwitch, aiHasKey } from './ai.js';
import { DATA_FILES, CSV_CACHE_KEY, loadCSVTexts, cachedCSVTexts, sameTexts } from './files.js';
import { COACH_ART, COACH_COLORS, COACH_NAMES } from './coach-art.js';

// 앱 버전: PR에선 바꾸지 않음. 정해진 시간 머지(GitHub Actions)가 version.txt와 같이 올림. 다르면 홈 화면 앱이 스스로 새로고침
const APP_VERSION = '202611120905';

// 단어 CSV 파일 목록은 js/files.js (예문·단어 모드가 같이 씀)

// 예문 모드(./) · 단어 모드(./?m=word): 화면과 흐름은 같고 문제·색·진도 저장만 다름
const WORD = document.documentElement.dataset.mode === 'word';
// 컴퓨터(마우스·키보드): 화면 키보드는 숨기고 실제 키보드로 입력. 넓은 창(1000px~)이면 두 칸 배치 (index.html 머리에서 정함)
const DESK = document.documentElement.classList.contains('desk');
const wideDesk = () => DESK && window.innerWidth >= 1000;
const P = WORD ? 'voca.word.' : 'voca.';
const KEY = {
  stats: P + 'stats.v1',
  settings: P + 'settings.v1',
  session: P + 'session.v1',
  csv: CSV_CACHE_KEY,
  resetAt: P + 'resetAt.v1',
  marks: 'voca.marks.v1', // 단어장 형광펜 표시: 두 모드가 같이 씀
  day: P + 'day.v1', // 오늘의 복습 단어 목록 {date, review: [id]} (시작할 때 정해서 고정)
};

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
// 진도: stats(살아 있는 기록)와 tombs(DAY별로 지운 기록 표시 { del: 1, s }). 저장·동기화는 둘을 합쳐서
let stats = {}, tombs = {};
function setAllStats(all) {
  stats = {}; tombs = {};
  for (const [k, v] of Object.entries(all || {})) { if (v && v.del) tombs[k] = v; else if (v) stats[k] = v; }
}
setAllStats(load(KEY.stats, {}));
// 예전 형식(단계 0~6, 복습 시각)을 새 형식(단계 0~4, 복습일)으로. 원본은 따로 보관
if (Object.values(stats).some(v => v && v.st == null)) {
  save('voca.stats.backup-before-v2', stats);
  stats = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, normalizeStat(v)]));
  save(KEY.stats, { ...stats, ...tombs });
}
const settings = Object.assign({
  from: null, to: null, kind: 'choice', newPerDay: 20, exam: '', prefsAt: 0,
  // 주기 복습 (설정에서 켬, 목표일·시험일 둘 다 있어야 동작): 복습 간격 다섯 가지, 목표일, 오늘의 복습 개수(0 = 제한 없음)
  srs: false, srsPreset: 'm', goal: '', reviewLimit: 0,
  reviewSize: 20, // 오늘의 복습 수 (기본 방식, 주기 복습에서 '개수 제한'을 켰을 때도)
  accent: 'en-US', rate: 0.9, autoSpeak: true, showKo: true, showMeaning: false, appKeyboard: true,
  baseAccept: 'pause', // 원형이 예문 형태의 앞부분일 때(outlaw → outlawed): pause = 0.8초 멈추면 정답, instant = 바로
  extraN: 20, // 추가 학습·복습 개수
  strict: 'mid', // 단어 모드 직접 입력 채점: easy | mid | hard
  // 단어 코치: 시험일에 맞춰 목표일(coachGoal)과 하루 새 단어 수를 정해 줌. coachBase = 일정을 짤 때의 하루 개수, coachKey = 그때의 시험일·범위
  // coachReview = 코치와 상의해서 정한 시험 전 전체 복습 날 수 (0 = 코치가 정함)
  coach: false, coachGoal: '', coachBase: 0, coachKey: '', coachReview: 0,
}, load(KEY.settings, {}));
// 화면 설정 (기기마다, 예문·단어 모드가 같이 씀)
const UI_KEY = 'voca.ui.v1';
const ui = Object.assign({
  simpleHome: true, // 홈 간단히 보기: 학습 범위·문제 방식을 '학습 계획' 화면으로. 끄면 예전처럼 홈에
  choiceLayout: DESK ? 'list' : 'grid', // 4지선다 선지 배치: grid(2×2) · list(한 줄씩)
  lean: 'mid', // 폰 4지선다 선지 쏠림: left(왼쪽 칸 넓게) · mid · right(오른쪽 칸 넓게). 한 손으로 누를 때
}, load(UI_KEY, {}));
// 학습 범위·문제 방식 카드를 홈 또는 학습 계획 화면으로 옮김 (같은 요소라 기능은 그대로)
function applyHomeLayout() {
  const range = $('#card-range'), kind = $('#card-kind'), prog = $('#range-progress'), sum = $('#plan-sum-card');
  if (ui.simpleHome) {
    $('#plan > header').after(range);
    sum.appendChild(prog);
  } else {
    $('#card-today').after(range);
    range.appendChild(prog);
  }
  range.after(kind);
  sum.hidden = !ui.simpleHome;
}
applyHomeLayout();
let session = null;
let planFrom = null; // 학습 계획 화면을 설정에서 열었으면 ←가 설정으로
let soloDay = null; // DAY 박스를 누르면 그 DAY만 따로 학습 (정규 카드 자리에 간단히)
let dataInfo = '';

const allStats = () => ({ ...stats, ...tombs });
const saveStats = () => save(KEY.stats, allStats());
let resetAt = load(KEY.resetAt, 0);

// 형광펜 표시 (두 모드 공용)
let marks = load(KEY.marks, {});
const isUnknown = id => !!(marks[id] && marks[id].on);
function toggleUnknown(id) {
  marks[id] = { on: isUnknown(id) ? 0 : 1, t: Date.now() };
  save(KEY.marks, marks);
  sync.soon();
  return isUnknown(id);
}
// 다른 모드 진도: 단어장에서 두 모드 기록을 합쳐 보여 줌
const OTHER_P = WORD ? 'voca.' : 'voca.word.';
const otherProgress = () => ({ resetAt: load(OTHER_P + 'resetAt.v1', 0), stats: load(OTHER_P + 'stats.v1', {}) });

// 시험일을 바꾼 시각 (예전 설정엔 없어서 설정 전체를 바꾼 시각으로 봄)
const myExamAt = () => examAt({ examAt: settings.examAt, at: settings.prefsAt });
// 시험일은 예문·단어 모드가 같이 씀: 다른 모드의 설정에도 시험일과 그 시각만 적어 둠.
// 다른 모드의 prefsAt은 건드리지 않음 (건드리면 안 쓰던 모드의 기본값이 '최신 설정'으로 동기화돼 다른 기기 설정을 덮어씀)
function shareExam(v, at) {
  const o = load(OTHER_P + 'settings.v1', {});
  if (examAt({ examAt: o.examAt, at: o.prefsAt }) > at) return; // 다른 모드 쪽이 더 최근이면 그대로
  o.exam = v; o.examAt = at;
  save(OTHER_P + 'settings.v1', o);
}

// ---------- 기기 간 동기화 ----------
const sync = createSync({
  file: WORD ? 'voca-word-progress.json' : 'voca-progress.json',
  getLocal: () => ({ v: 2, resetAt, stats: allStats(), prefs: { exam: settings.exam, examAt: myExamAt(), newPerDay: settings.newPerDay, srs: settings.srs, srsPreset: settings.srsPreset, goal: settings.goal, reviewLimit: settings.reviewLimit, reviewSize: settings.reviewSize, from: settings.from, to: settings.to, coach: !!settings.coach, coachGoal: settings.coachGoal || '', coachBase: settings.coachBase || 0, coachKey: settings.coachKey || '', coachReview: settings.coachReview || 0, at: settings.prefsAt || 0 } }),
  applyMerged: m => {
    setAllStats(m.stats);
    resetAt = m.resetAt;
    saveStats();
    save(KEY.resetAt, resetAt);
    // 시험일은 다른 설정과 따로: 더 최근에 바꾼 쪽으로. 두 모드가 같이 쓰니 다른 모드 설정에도 적어 둠
    if (m.prefs && examAt(m.prefs) > myExamAt()) {
      Object.assign(settings, { exam: m.prefs.exam || '', examAt: examAt(m.prefs) });
      saveSettings();
      shareExam(settings.exam, settings.examAt);
    }
    if (m.prefs && (m.prefs.at || 0) > (settings.prefsAt || 0)) {
      const p = m.prefs;
      Object.assign(settings, { newPerDay: p.newPerDay || 20, prefsAt: p.at });
      if ('srs' in p) Object.assign(settings, { srs: !!p.srs, srsPreset: p.srsPreset || 'm', goal: p.goal || '', reviewLimit: p.reviewLimit || 0 });
      if (p.reviewSize) settings.reviewSize = p.reviewSize;
      if ('coach' in p) Object.assign(settings, { coach: !!p.coach, coachGoal: p.coachGoal || '', coachBase: p.coachBase || 0, coachKey: p.coachKey || '', coachReview: p.coachReview || 0 });
      // 학습 범위도 기기끼리 맞춤 (없는 DAY면 renderHome이 맞춰 줌)
      if (p.from != null && p.to != null) Object.assign(settings, { from: p.from, to: p.to });
      saveSettings();
    }
    if (current === 'home') renderHome();
  },
  onStatus: () => renderSyncStatus(),
  marks: {
    get: () => marks,
    set: m => { marks = m; save(KEY.marks, marks); if (current === 'list') renderList(); },
  },
  other: { get: otherProgress, set: st => save(OTHER_P + 'stats.v1', st) },
});
const saveSettings = () => save(KEY.settings, settings);
// 유반의어 테스트(noSave)는 기록에 영향을 주지 않아서 이어하기에도 안 남김 (하던 정규 학습의 이어하기를 지우지 않게)
const saveSession = () => (session ? session.noSave || save(KEY.session, session) : localStorage.removeItem(KEY.session));

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

// 열린 창(확인 창·숫자 키패드)과 뒤로 가기: 창을 열 때 기록을 하나 쌓아 두고, 뒤로 가기를 누르면 창만 닫음.
// 버튼으로 닫으면 쌓아 둔 기록을 되돌린 다음에 결과를 넘김 (그 뒤에 화면을 바꿔도 기록이 꼬이지 않게)
let modal = null, afterPop = null;
function modalOpen(onBack) {
  modal = { onBack };
  history.pushState({ ...(history.state || {}), dlg: 1 }, '');
}
function modalDone(cb) {
  if (!modal) { cb(); return; } // 뒤로 가기로 이미 닫힘
  modal = null;
  const run = () => { if (afterPop !== run) return; afterPop = null; cb(); };
  afterPop = run;
  history.back();
  setTimeout(run, 500); // 혹시 popstate가 안 오면
}

// 확인 창: await ask({ title, body, ok: '지우기', danger: true }) → 누르면 true, 취소·바깥·Esc는 false
function ask({ title, body = '', ok = '확인', cancel = '취소', danger = false }) {
  const d = $('#dialog'), okb = $('#dlg-ok'), nob = $('#dlg-cancel');
  $('#dlg-title').textContent = title;
  $('#dlg-body').textContent = body;
  $('#dlg-body').hidden = !body;
  $('#dlg-icon').hidden = !danger;
  okb.textContent = ok;
  okb.classList.toggle('danger', danger);
  nob.textContent = cancel;
  const prev = document.activeElement;
  d.hidden = false;
  nob.focus(); // 실수로 Enter를 눌러도 지워지지 않게 취소에 먼저
  return new Promise(resolve => {
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
    const close = () => {
      d.hidden = true;
      okb.onclick = nob.onclick = d.onclick = null;
      document.removeEventListener('keydown', key, true);
      if (prev && prev.focus) prev.focus();
    };
    const done = v => { close(); modalDone(() => resolve(v)); };
    modalOpen(() => { close(); resolve(false); });
    okb.onclick = () => done(true);
    nob.onclick = () => done(false);
    d.onclick = e => { if (e.target === d) done(false); };
    document.addEventListener('keydown', key, true);
  });
}

// ---------- 화면 전환 (안드로이드 뒤로가기 지원) ----------
let current = 'home';
// 퀴즈 바탕 색: 유반의어 테스트는 파랑→빨강, DAY 학습은 연두→초록 (DAY 박스를 밀 때 띠 색). 홈으로 가면 원래대로
function setTint(t) { if (t) document.body.dataset.tint = t; else delete document.body.dataset.tint; }
function show(id, push = true) {
  if (id === 'home') setTint(null);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (push && id !== 'home' && current === 'home') history.pushState({ s: id }, '');
  if (id === 'quiz' && current !== 'quiz') { clearTimeout(toast.timer); $('#toast').hidden = true; }
  current = id;
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  if (afterPop) { afterPop(); return; } // 창을 버튼으로 닫은 뒤의 되돌리기
  if (modal) { const m = modal; modal = null; m.onBack(); return; } // 창이 열린 채 뒤로 가기 → 창만 닫음
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
const describeData = (texts, fromCache, missing) =>
  `${texts.map(t => t.name.replace('local:', '폰: ')).join(', ') || '없음'}`
  + (fromCache ? ` (오프라인: 저장된 데이터 ${fromCache}개 사용)` : '')
  + (missing.length ? `\n못 찾은 파일: ${missing.join(', ')}` : '');

// 서버에서 받아서 씀. shown과 같으면 단어 목록은 그대로 두고 false
async function loadData(shown) {
  const { texts, fromCache, missing } = await loadCSVTexts();
  const changed = !shown || !sameTexts(texts, shown);
  if (changed) setWords(rowsToWords(texts));
  await applyHighlights();
  dataInfo = describeData(texts, fromCache, missing);
  return changed;
}

// 해석에서 뜻 부분이 자동으로 안 찾아지는 단어용 강조어 목록 (없어도 됨)
const applyHighlightMap = map => { for (const w of words) if (!w.koMark && map[w.word]) w.koMark = map[w.word]; };
async function applyHighlights() {
  let map = load('voca.highlights.v1', {});
  try {
    const res = await fetch('highlights.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) { map = await res.json(); save('voca.highlights.v1', map); }
  } catch {}
  applyHighlightMap(map);
}

let findWord = () => null; // 단어장에서 그 말(변화형 포함)인 단어 찾기 (오답 풀이용)
function setWords(list) {
  words = list;
  findWord = makeWordFinder(words);
  byId = new Map(words.map(w => [w.id, w]));
  days = [...new Set(words.map(w => w.day))].sort((a, b) => a - b);
}

// ---------- 홈 ----------
function rangeWords() {
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  return words.filter(w => w.day >= from && w.day <= to);
}
// 단어 코치: 켜져 있고 시험일이 앞으로 남아 있으면 코치가 목표일과 하루 새 단어 수를 정함 (복습은 주기 복습 방식으로)
const coachActive = () => !!(settings.coach && settings.exam && settings.exam > dateStr());
const goalDate = () => (coachActive() ? settings.coachGoal || '' : settings.goal);
// 주기 복습: 설정에서 켜고, 목표일·시험일이 둘 다 있고 목표일이 먼저일 때만 (코치가 켜져 있으면 코치의 목표일로 언제나)
const srsOn = () => (coachActive() ? !!settings.coachGoal : !!(settings.srs && settings.goal && settings.exam && settings.goal < settings.exam));
const intervals = () => (srsOn() && PRESETS[settings.srsPreset]) || PRESETS.m;
const maxStage = () => intervals().length; // 기본 4단계(1·3·7·14일)
// 다음 복습일이 넘지 않을 날: 주기 복습이면 목표일 전까진 목표일, 그 뒤엔 시험일
const deadline = (today = dateStr()) => (srsOn() && today < goalDate() ? goalDate() : settings.exam);
const isMastered = s => s && s.st >= maxStage(); // 마지막 단계(기본 14일 간격)까지 올라간 단어
const isWrongRaw = s => !!(s && s.st === 0);        // 마지막에 틀린 단어 (0단계)
// 다시 볼 단어: 0단계인데, '다시 볼 단어'에서 오늘 다시 맞힌 것(r = 오늘)은 뺌. 복습 일정은 그대로라 내일 복습에 다시 나옴
const isWrongNote = s => isWrongRaw(s) && s.r !== dateStr();
// 복습도 학습 범위 안의 단어에서만 (범위 밖 DAY를 실수로 풀어도 복습에 안 섞이게)
// 오늘 배울 새 단어 총수: 맨 위 숫자로 오늘만 바꿨으면 그 값, 아니면 하루 새 단어 수
const newToday = () => Object.values(stats).filter(s => s && s.f === dateStr()).length;
const todayNewTarget = () => { const d = loadDay(); return d.newTarget != null ? d.newTarget : coachActive() ? coachDaily() : settings.newPerDay; };
const todayPlan = () => buildPlan(rangeWords(), rangeWords(), stats, { today: dateStr(), newPerDay: todayNewTarget(), exam: settings.exam, srs: srsOn() ? { goal: goalDate(), exam: settings.exam } : null });
// 오늘의 복습 고르기: 기본은 전에 한 단어 20개, 주기 복습이면 알고리즘(복습일 된 단어 / 목표일부터 범위 전부를 나눠서)
const srsPick = () => pickSrsReview(rangeWords(), rangeWords(), stats, { today: dateStr(), goal: goalDate(), exam: settings.exam, limit: settings.reviewLimit ? settings.reviewSize : 0 });
const pickToday = () => (srsOn() ? srsPick().words : pickReview(rangeWords(), stats, { n: settings.reviewSize }));
const seenToday = id => { const s = stats[id]; return !!(s && s.s && dateStr(s.s) === dateStr()); };
const loadDay = () => { const d = load(KEY.day, null); return d && d.date === dateStr() ? d : { date: dateStr() }; };

// 오늘의 복습: 시작하면 그날 목록을 고정. 그 전에는 지금 고르면 나올 단어로 미리 보여 줌
// 힌트를 쓴 채 그만둔 문제 (다시 열어도 힌트 쓴 걸로)
const hintedId = () => loadDay().hint || null;
function reviewState() {
  const day = loadDay();
  const started = Array.isArray(day.review);
  const ids = started ? day.review.filter(id => byId.has(id)) : pickToday().map(w => w.id);
  const left = started ? ids.filter(id => !seenToday(id)) : ids;
  return { started, total: ids.length, left, done: !left.length };
}

// 오늘의 학습 → 오늘의 복습 → 추가 학습·복습 순서로 열림
function flowState() {
  const plan = todayPlan();
  const learnLeft = plan.final.length + plan.fresh.length;
  const rv = reviewState();
  // 복습을 이미 시작했으면(그 사이 하루 새 단어 수를 늘렸어도) 복습부터 마저
  const stage = learnLeft && !rv.started ? 'learn' : !rv.done ? 'review' : learnLeft ? 'learn' : 'extra';
  return { plan, learnLeft, rv, stage };
}
const extraNew = n => rangeWords().filter(w => !stats[w.id]).slice(0, n);
const extraReview = n => pickReview(rangeWords(), stats, { n, again: true }); // 다 봤으면 오늘 본·배운 단어도 다시

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
  settings.prefsAt = Date.now(); // 학습 범위도 동기화
  saveSettings();
  renderHome();
  sync.soon();
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
  setSeg('#seg-ko', settings.showKo ? 'show' : 'hide');
  setSeg('#seg-new', String(settings.newPerDay));
  setSeg('#seg-rev', String(settings.reviewSize));
  $('#exam-date').value = settings.exam || '';
  renderPlan();

  const rw = rangeWords();
  let seen = 0, mastered = 0, wrong = 0;
  for (const w of rw) {
    const s = stats[w.id];
    if (s) seen++;
    if (isMastered(s)) mastered++;
    if (isWrongNote(s)) wrong++;
  }
  const st = $('#range-stats');
  st.innerHTML = '';
  for (const [n, l] of [[rw.length, '단어'], [seen, '학습'], [mastered, '암기 완료'], [wrong, '다시 볼 것']]) {
    const d = el('div');
    d.append(el('b', null, n), l);
    st.appendChild(d);
  }
  $('#range-bar').style.width = rw.length ? `${(mastered / rw.length) * 100}%` : '0';
  // 홈의 학습 계획 요약 한 줄 (바꾸는 건 학습 계획 화면에서)
  const lo = Math.min(settings.from, settings.to), hi = Math.max(settings.from, settings.to);
  $('#plan-sum').textContent = [
    lo === hi ? `DAY ${lo}` : `DAY ${lo}~${hi}`,
    settings.kind === 'type' ? '직접 입력' : '4지선다',
    ...(!WORD && !settings.showKo ? ['해석 가림'] : []),
    ...(coachActive()
      ? (dateStr() < goalDate() ? [`코치 · 새 단어 ${todayNewTarget()}`, `${fmtDay(lastLearnDay())}까지`] : ['코치 · 전체 복습 중'])
      : [`새 단어 ${settings.newPerDay}`, srsOn() ? '주기 복습' : `복습 ${settings.reviewSize}`]),
  ].join(' · ');
  $('#wrong-count').textContent = wrong || '';
  $('#btn-wrong').disabled = !wrong || $('#range-practice').classList.contains('dim');

  const grid = $('#day-grid');
  grid.innerHTML = '';
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  for (const d of days) {
    const dw = words.filter(w => w.day === d);
    const seen = dw.filter(w => stats[w.id]).length;
    const m = dw.filter(w => isMastered(stats[w.id])).length;
    const wr = dw.filter(w => isWrongNote(stats[w.id])).length;
    const wrap = el('div', 'day-wrap');
    const b = el('button', 'day' + (d >= from && d <= to ? ' sel' : ''));
    b.append(el('b', null, `DAY ${d}`), el('span', 'muted', `${seen}/${dw.length}` + (wr ? ` · 다시 ${wr}` : '')));
    b.title = `학습 ${seen} · 암기 완료 ${m} · 다시 볼 것 ${wr}`;
    // 막대: 학습한 단어는 연하게, 암기 완료(14일 간격까지 올라간 단어)는 진하게
    const bar = el('div', 'bar two');
    const fs = el('div', 'bar-fill seen');
    fs.style.width = `${(seen / dw.length) * 100}%`;
    const f = el('div', 'bar-fill');
    f.style.width = `${(m / dw.length) * 100}%`;
    bar.append(fs, f);
    b.appendChild(bar);
    if (d === soloDay) b.classList.add('solo');
    // 누르면 그 DAY 단어장 · 왼쪽으로 밀면 유반의어 테스트 · 오른쪽으로 밀면 그 DAY 학습
    const study = el('div', 'swipe-bg study'), synBg = el('div', 'swipe-bg syn');
    study.appendChild(el('span', null, '학습'));
    synBg.appendChild(el('span', null, '유반의어'));
    wrap.append(study, synBg, b);
    b.setAttribute('aria-label', `DAY ${d} 단어장 (왼쪽으로 밀면 유반의어, 오른쪽으로 밀면 학습)`);
    attachSwipe(b, wrap, { onTap: () => openDayBook(d), onLeft: () => startSynSession(d), onRight: () => startDayStudy(d) });
    grid.appendChild(wrap);
  }
  swipeHintOnce(grid);

  const saved = load(KEY.session, null);
  const rc = $('#resume-card');
  if (saved && saved.queue && saved.pos < saved.queue.length && saved.date === dateStr()) {
    rc.hidden = false;
    $('#resume-info').textContent = `${saved.label} · ${saved.done.length}/${saved.total} 완료`;
  } else rc.hidden = true;
}

// DAY 박스 오른쪽으로 밀기: 오늘 카드가 그 DAY만 학습하는 카드로 (예전에 누르면 하던 것)
function startDayStudy(d) {
  soloDay = d;
  if (current !== 'home') { goHome(); return; }
  renderHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// DAY 박스 누르기: 그 DAY 단어장 (단어장의 DAY 고르기는 건드리지 않고 이번에만)
let bookOnly = null;
function openDayBook(d) {
  bookOnly = d;
  bookQuery = ''; $('#book-search').value = '';
  listFilter = 'all';
  show('list');
  renderList(true);
}

// 옆으로 밀기: 밀면 뒤에 색 띠가 드러나고, 박스 폭의 30% 넘게 밀었다 놓거나 휙 튕기면 실행. 위아래로 움직이면 그냥 스크롤
// - 손가락이 6px 움직였을 때 가로가 세로보다 크면 밀기로 봄 (엄지로 밀면 비스듬히 움직여서, 너무 엄격하면 자꾸 스크롤로 빠짐)
// - 거리가 모자라도 빠르게 튕기면(0.45px/ms 넘게, 20px 넘게) 실행
function attachSwipe(card, wrap, { onTap, onLeft, onRight }) {
  let x0 = 0, y0 = 0, dx = 0, mode = null, pid = null, moved = false, trail = [];
  const limit = () => card.offsetWidth * 0.72;
  const th = () => Math.max(32, card.offsetWidth * 0.3);
  const reset = () => {
    wrap.classList.remove('dragging');
    card.style.transform = '';
    clearTimeout(reset.t);
    reset.t = setTimeout(() => wrap.classList.remove('to-left', 'to-right', 'armed'), 230);
  };
  // 손을 떼기 전 100ms 동안 움직인 속도 (px/ms, 부호 있음). 시각은 이벤트가 생긴 때(e.timeStamp)로
  const speed = now => {
    const recent = trail.filter(p => now - p.t <= 100);
    if (recent.length < 2) return 0;
    const a = recent[0], b = recent[recent.length - 1];
    return b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
  };
  card.addEventListener('pointerdown', e => {
    if (e.button !== 0 || mode === 'drag') return; // 밀고 있는 중의 두 번째 손가락만 무시 (남은 상태는 새로 시작)
    x0 = e.clientX; y0 = e.clientY; dx = 0; mode = 'wait'; pid = e.pointerId; moved = false;
    trail = [{ x: e.clientX, t: e.timeStamp }];
  });
  card.addEventListener('pointermove', e => {
    if (e.pointerId !== pid || !mode) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (mode === 'wait') {
      if (Math.hypot(mx, my) < 6) return;
      if (Math.abs(mx) < Math.abs(my)) { mode = null; return; } // 세로 → 스크롤
      mode = 'drag'; moved = true;
      try { card.setPointerCapture(pid); } catch {}
      clearTimeout(reset.t);
      wrap.classList.add('dragging');
    }
    trail.push({ x: e.clientX, t: e.timeStamp });
    if (trail.length > 12) trail.shift();
    dx = Math.max(-limit(), Math.min(limit(), e.clientX - x0));
    card.style.transform = `translateX(${dx}px)`;
    wrap.classList.toggle('to-left', dx < 0);
    wrap.classList.toggle('to-right', dx > 0);
    const armed = Math.abs(dx) >= th();
    if (armed && !wrap.classList.contains('armed') && navigator.vibrate) navigator.vibrate(8);
    wrap.classList.toggle('armed', armed);
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    const was = mode;
    mode = null; pid = null;
    if (was !== 'drag') return;
    const v = speed(e.timeStamp);
    const flick = Math.abs(dx) >= 20 && Math.abs(v) >= 0.45 && Math.sign(v) === Math.sign(dx);
    const fire = e.type === 'pointerup' && (Math.abs(dx) >= th() || flick) ? (dx < 0 ? onLeft : onRight) : null;
    reset();
    if (fire) { ui.swiped = true; save(UI_KEY, ui); $('#toast').hidden = true; setTimeout(fire, 170); }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  card.addEventListener('lostpointercapture', end);
  card.addEventListener('click', e => {
    if (moved) { moved = false; e.preventDefault(); return; } // 밀고 난 뒤 생기는 클릭은 무시
    onTap();
  });
}

// 처음 몇 번은 DAY 박스가 화면에 보일 때 하나를 살짝 좌우로 흔들어서 밀 수 있다는 걸 보여 줌 (한 번이라도 밀어 보면 그만)
let swipeHinted = false, swipeIO = null; // 홈을 다시 그리면 박스도 새로 생기니 그때마다 새로 지켜봄
function swipeHintOnce(grid) {
  if (swipeIO) { swipeIO.disconnect(); swipeIO = null; }
  if (swipeHinted || ui.swiped || (ui.swipeHints || 0) >= 3 || !('IntersectionObserver' in window)) return;
  const first = grid.querySelector('.day-wrap .day.sel') || grid.querySelector('.day-wrap .day');
  if (!first) return;
  const io = swipeIO = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting) || current !== 'home' || ui.swiped || swipeHinted) return;
    io.disconnect();
    swipeHinted = true;
    const wrap = first.parentElement;
    if (!wrap || !wrap.isConnected) return;
    ui.swipeHints = (ui.swipeHints || 0) + 1;
    save(UI_KEY, ui);
    setTimeout(() => {
      if (current !== 'home' || ui.swiped) return;
      wrap.classList.add('hinting');
      setTimeout(() => wrap.classList.remove('hinting'), 2000);
      toast('DAY 박스 · 누르면 단어장\n← 밀면 유반의어 · 밀면 학습 →', 3800);
    }, 500);
  }, { threshold: 0.9 });
  io.observe(first.parentElement);
}

// ---------- 단어 코치 ----------
// 시험일만 알려 주면 남은 날을 '새 단어를 배우는 날'과 '범위 전체를 훑는 날'로 나눠 목표일과 하루 분량을 정하고(core.js coachPlan),
// 매일 남은 단어 ÷ 목표일까지 남은 날로 오늘 몫을 다시 계산함. 홈 맨 위에서 고른 코치 캐릭터가 말로 알려 줌. 설정에서 끌 수 있음
const fmtDay = d => { const [, m, dd] = String(d || '').split('-'); return m ? `${+m}월 ${+dd}일` : ''; };
const leftNew = () => rangeWords().filter(w => !stats[w.id]).length;
// 목표일(coachGoal)은 전체 복습을 시작하는 날이라 새 단어를 보는 마지막 날은 그 전날
const lastLearnDay = () => addDays(settings.coachGoal, -1);
const coachKeyNow = () => [settings.exam, Math.min(settings.from, settings.to), Math.max(settings.from, settings.to)].join('|');
// 오늘 배울 새 단어 수: (남은 새 단어 + 오늘 이미 배운 수) ÷ 목표일까지 남은 날. 밀리면 늘고 앞서가면 줄어듦
function coachDaily() {
  const today = dateStr(), goal = settings.coachGoal;
  if (!goal || today >= goal) return 0;
  return Math.ceil((leftNew() + newToday()) / daysBetween(today, goal));
}
// 일정 짜기. byUser: 사람이 시킨 것(켜기, 다시 짜기, 시험일 바꾸기)이면 다른 기기에도 이 일정이 가게 설정 바꾼 시각을 올림
const coachPlanFor = review => coachPlan({ today: dateStr(), exam: settings.exam, total: rangeWords().length, remaining: leftNew() + newToday(), review });
function planCoach(byUser) {
  const p = coachPlanFor(settings.coachReview || 0);
  if (!p) return null;
  Object.assign(settings, { coachGoal: p.goal, coachBase: p.perDay, coachKey: coachKeyNow() });
  if (byUser) settings.prefsAt = Date.now();
  saveSettings();
  if (byUser) sync.soon();
  return p;
}
// 일정이 지금 상황과 안 맞으면 다시 짬: 처음이거나, 시험일·범위가 바뀌었거나, 목표일이 됐는데 새 단어가 남았을 때
let coachMoved = false; // 목표일이 지나 일정을 미뤘다는 걸 말해 주려고
function ensureCoachPlan() {
  if (!coachActive() || !words.length) return;
  const today = dateStr(), g = settings.coachGoal, left = leftNew();
  if (settings.coachKey !== coachKeyNow() || !g || g > settings.exam) { planCoach(false); return; }
  if (today >= g && left > 0) { planCoach(false); coachMoved = true; return; }
  // 새 단어를 일찍 다 끝냈으면(오늘 끝낸 날은 빼고) 오늘부터 전체 훑기
  if (today < g && !left && !newToday()) { settings.coachGoal = today; saveSettings(); }
}
// 코치 켜고 끄기. 예문·단어 모드가 같이 씀(시험일처럼): 다른 모드 설정에도 적어 두면 그 모드를 열 때 제 진도로 일정을 짬
function setCoach(on) {
  settings.coach = !!on;
  settings.prefsAt = Date.now();
  ui.coachAsked = true;
  save(UI_KEY, ui);
  const o = load(OTHER_P + 'settings.v1', {});
  o.coach = settings.coach;
  save(OTHER_P + 'settings.v1', o);
  if (on && coachActive()) planCoach(true); else { saveSettings(); sync.soon(); }
  coachMoved = false;
  if (current === 'settings') renderSrs();
  renderHome();
}

// 코치 캐릭터 (js/coach-art.js의 32×32 픽셀 그림): 고양이·햄스터·부엉이·슬라임 가운데 고름. 기기마다 저장(ui.coachChar), 두 모드가 같이 씀
// 기분: normal 기본 · happy 기쁨(정답) · worry 걱정(오답) · sleep 졸림 · cheer 응원
const COACH_MOOD = { normal: 'idle', happy: 'correct', worry: 'wrong', sleep: 'sleepy', cheer: 'cheer' };
const coachChar = () => (COACH_ART[ui.coachChar] ? ui.coachChar : 'cat');
const coachSvgCache = new Map();
function coachSvg(mood = 'normal', char = coachChar()) {
  const key = `${char}|${mood}`;
  if (coachSvgCache.has(key)) return coachSvgCache.get(key);
  const rows = COACH_ART[char][COACH_MOOD[mood]] || COACH_ART[char].idle;
  let out = '<svg class="buddy-svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) { // 같은 색이 이어진 칸은 한 줄로 묶어 그림
      const c = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === c) n++;
      if (c !== '.') out += `<rect fill="${COACH_COLORS[c]}" x="${x}" y="${y}" width="${n}" height="1"/>`;
      x += n;
    }
  });
  out += '</svg>';
  coachSvgCache.set(key, out);
  return out;
}

// 코치 고르기 창: 처음 켤 때 뜨고, 설정에서 언제든 바꿀 수 있음. 고르면 캐릭터 이름, 취소면 null
function pickCoach() {
  const d = $('#coach-pick'), box = $('#cp-choices');
  let cur = coachChar();
  const draw = () => {
    box.innerHTML = '';
    for (const c of Object.keys(COACH_ART)) {
      const b = el('button', 'coach-choice' + (c === cur ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', c === cur);
      b.innerHTML = coachSvg(c === cur ? 'cheer' : 'normal', c);
      b.appendChild(el('span', null, COACH_NAMES[c]));
      b.addEventListener('click', () => { cur = c; draw(); });
      box.appendChild(b);
    }
  };
  draw();
  d.hidden = false;
  return new Promise(resolve => {
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(cur); } };
    const close = () => { d.hidden = true; d.onclick = null; document.removeEventListener('keydown', key, true); };
    const done = v => { close(); modalDone(() => resolve(v)); };
    modalOpen(() => { close(); resolve(null); });
    $('#cp-ok').onclick = () => done(cur);
    $('#cp-cancel').onclick = () => done(null);
    d.onclick = e => { if (e.target === d) done(null); };
    document.addEventListener('keydown', key, true);
  });
}
function setCoachChar(c) {
  ui.coachChar = c;
  save(UI_KEY, ui);
  if (current === 'settings') renderSrs();
  renderCoach();
}
// 스위치·'켜기' 버튼: 처음 켤 땐 코치부터 고름 (취소하면 안 켬)
async function toggleCoach(on) {
  if (on && !COACH_ART[ui.coachChar]) {
    const c = await pickCoach();
    if (!c) { renderPlan(); if (current === 'settings') renderSrs(); return; } // 스위치를 원래대로
    ui.coachChar = c;
    save(UI_KEY, ui);
  }
  setCoach(on);
}
// 정답 시트 한쪽에서 코치가 맞았는지 틀렸는지 같이 반응 (코치가 켜져 있을 때만)
function setFbCoach(state) {
  const box = $('#fb-coach');
  box.hidden = !settings.coach;
  if (settings.coach) box.innerHTML = coachSvg(state === 'ok' ? 'happy' : state === 'bad' ? 'worry' : 'normal');
}

// 코치가 지금 할 말: { mood, text, acts: [[버튼 글자, 할 일]] }
function coachSay() {
  const today = dateStr();
  const openPlan = () => { planFrom = null; show('plan'); setTimeout(() => { const i = $('#exam-date'); i.scrollIntoView({ block: 'center' }); i.focus(); }, 60); };
  if (!settings.exam) return { mood: 'normal', text: '시험일을 알려 주면 남은 날에 맞춰 목표일과 하루 분량을 짜 줄게요.', acts: [['시험일 정하기', openPlan]] };
  if (settings.exam === today) return { mood: 'cheer', text: '오늘이 시험 날이에요. 외운 만큼 다 쓰고 와요! 가기 전에 다시 볼 단어만 한 번 훑어도 좋아요.', acts: [] };
  if (settings.exam < today) return { mood: 'sleep', text: '시험이 끝났어요. 수고했어요! 다음 시험일을 정하면 일정을 다시 짜 줄게요.', acts: [['시험일 정하기', openPlan]] };
  const D = daysBetween(today, settings.exam), goal = settings.coachGoal, rd = daysBetween(goal, settings.exam);
  const f = flowState();
  const fresh = f.plan.fresh.length, rv = f.rv.left.length, allDone = !f.learnLeft && f.rv.done;
  const moved = coachMoved ? '목표일이 지나서 일정을 다시 짰어요. ' : '';
  const replan = ['일정 다시 짜기', () => { planCoach(true); coachMoved = false; renderHome(); toast('남은 날에 맞춰 일정을 다시 짰어요'); }];
  const talk = ['일정 상의하기', talkCoach];
  const todo = [fresh ? `새 단어 ${fresh}개` : '', rv ? `복습 ${rv}개` : ''].filter(Boolean).join(' + ');
  if (today >= goal) { // 범위 전체를 다시 훑는 기간
    if (allDone) return { mood: 'happy', text: `오늘 복습 끝! 시험까지 ${D}일, 내일도 이어서 훑어요.`, acts: [] };
    return { mood: 'normal', text: `새 단어는 다 봤어요. 시험까지 ${D}일 동안 범위 전체를 다시 훑어요. 오늘은 복습 ${rv}개예요.`, acts: [] };
  }
  const span = rd === 1 ? '하루' : `${rd}일`;
  const tail = rd > 0 ? `마지막 ${span}는 전체 복습이에요`.replace('일는', '일은') : '시험 전날까지 새 단어를 봐요';
  const last = lastLearnDay(), by = last === today ? '오늘' : fmtDay(last);
  if (allDone) return { mood: 'happy', text: `${moved}오늘 몫 끝! ` + (last === today ? `새 단어를 다 봤어요. 내일부터 시험 전날까지는 전체 복습이에요.` : `이대로면 ${by}에 새 단어를 다 보고, ${tail}.`), acts: last === today ? [] : [talk] };
  const target = todayNewTarget(), base = settings.coachBase || 0;
  if (base && fresh && target > base * 1.25 + 2) {
    return { mood: 'worry', text: `조금 밀렸어요. ${by}까지 새 단어를 끝내려면 오늘 ${target}개예요 (처음 계획은 하루 ${base}개). 벅차면 일정을 다시 짜거나 같이 바꿔 봐요.`, acts: [replan, talk] };
  }
  if (base > 80) {
    return { mood: 'worry', text: `${moved}시험까지 ${D}일인데 새 단어가 ${leftNew()}개 남았어요. 하루 ${target}개는 많이 빡빡해요. 학습 범위를 줄이는 걸 권해요. 오늘은 ${todo}예요.`, acts: [['학습 범위 바꾸기', () => { planFrom = null; show('plan'); }], talk] };
  }
  return { mood: 'normal', text: `${moved}시험까지 ${D}일. ${by}까지 새 단어를 끝내고 ${tail}. 오늘은 ${todo || '할 게 없어요'}${todo ? '예요' : ''}.`, acts: last === today ? [] : [talk] };
}

// 일정 상의하기: 시험 전 전체 복습을 며칠 할지 −/+로 고르면, 코치가 그러면 하루 몇 개인지 말해 줌. 정하면 이 날 수를 계속 따름
// (목표일 = 시험일 − 복습 날 수, 하루 새 단어 수는 거기에 맞춰 매일 다시 계산). '코치 추천대로'면 다시 코치가 정함
function talkCoach() {
  if (!coachActive() || !leftNew()) return;
  const d = $('#coach-talk'), auto = coachPlanFor(0);
  if (!auto || auto.days < 2) { toast('시험이 너무 가까워서 바꿀 수 없어요'); return; }
  const max = auto.days - 1; // 새 단어를 볼 날은 적어도 하루
  let r = Math.min(max, settings.coachReview || auto.auto);
  const draw = () => {
    const p = coachPlanFor(r), mine = r === auto.auto;
    const end = addDays(p.goal, -1), endTxt = end === dateStr() ? '오늘' : fmtDay(end);
    let mood, say;
    if (p.perDay > 80) { mood = 'worry'; say = `하루 새 단어 ${p.perDay}개는 너무 많아요. 복습 날을 줄이거나 학습 범위를 줄이는 게 좋겠어요.`; }
    else if (p.perDay > 40) { mood = 'worry'; say = `하루 새 단어 ${p.perDay}개라 조금 빡빡해요. 할 수 있으면 좋아요!`; }
    else if (mine) { mood = 'happy'; say = `제가 추천하는 일정이에요. 배우는 날과 복습하는 날의 하루 부담이 비슷해요.`; }
    else if (r > auto.auto) { mood = 'cheer'; say = `복습을 길게 가져가요! 대신 새 단어를 하루 ${p.perDay}개씩 조금 서둘러 봐야 해요.`; }
    else { mood = 'normal'; say = `새 단어는 여유 있게 보지만, 전체 복습은 하루 ${p.finalPerDay}개쯤으로 늘어요.`; }
    $('#ct-char').innerHTML = coachSvg(mood);
    $('#ct-text').textContent = say;
    $('#ct-val').textContent = `${r}일`;
    $('#ct-sum').textContent = `새 단어: ${endTxt}까지 하루 ${p.perDay}개\n전체 복습: ${fmtDay(p.goal)}부터 ${p.reviewDays}일, 하루 ${p.finalPerDay}개쯤`;
    $('#ct-minus').disabled = r <= 1;
    $('#ct-plus').disabled = r >= max;
    $('#ct-auto').textContent = mine ? '코치 추천이에요' : `코치 추천으로 (${auto.auto}일)`;
    $('#ct-auto').disabled = mine;
  };
  draw();
  d.hidden = false;
  const step = n => { r = Math.max(1, Math.min(max, r + n)); draw(); };
  return new Promise(resolve => {
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); step(1); }
    };
    const close = () => { d.hidden = true; d.onclick = null; document.removeEventListener('keydown', key, true); };
    const done = ok => {
      close();
      modalDone(() => {
        if (ok) {
          settings.coachReview = r === auto.auto ? 0 : r; // 추천과 같으면 코치에게 맡김 (범위·진도가 바뀌면 추천도 따라 바뀌게)
          planCoach(true);
          coachMoved = false;
          toast(`시험 전 ${r}일은 전체 복습으로 할게요`);
          renderHome();
          if (current === 'settings') renderSrs();
        }
        resolve(ok);
      });
    };
    modalOpen(() => { close(); resolve(false); });
    $('#ct-minus').onclick = () => step(-1);
    $('#ct-plus').onclick = () => step(1);
    $('#ct-auto').onclick = () => { r = auto.auto; draw(); };
    $('#ct-ok').onclick = () => done(true);
    $('#ct-cancel').onclick = () => done(false);
    d.onclick = e => { if (e.target === d) done(false); };
    document.addEventListener('keydown', key, true);
  });
}

// 홈 맨 위 코치 카드. 꺼져 있으면 한 번만 켤지 물어봄(괜찮아요를 누르면 다시 안 물음)
function renderCoach(stage = soloDay != null && days.includes(soloDay) ? 'day' : null) {
  const card = $('#buddy-card');
  let say = null;
  if (stage === 'day') say = null; // DAY 단독 학습 중엔 숨김
  else if (settings.coach) say = coachSay();
  else if (!ui.coachAsked) {
    say = {
      mood: 'cheer', text: '단어 코치를 켜 볼까요? 시험일만 알려 주면 목표일과 하루 분량을 짜서 매일 알려 줄게요.',
      acts: [['켜기', () => toggleCoach(true)], ['괜찮아요', () => { ui.coachAsked = true; save(UI_KEY, ui); renderCoach(); toast('설정 > 복습 방식에서 언제든 켤 수 있어요'); }]],
    };
  }
  card.hidden = !say;
  if (!say) return;
  $('#buddy-char').innerHTML = coachSvg(say.mood);
  $('#buddy-char').setAttribute('aria-label', `단어 코치 ${COACH_NAMES[coachChar()]}`);
  $('#buddy-text').textContent = say.text;
  const acts = $('#buddy-acts');
  acts.innerHTML = '';
  say.acts.forEach(([label, fn], i) => {
    const b = el('button', 'btn small ' + (i ? 'ghost' : 'secondary'), label);
    b.addEventListener('click', fn);
    acts.appendChild(b);
  });
  acts.hidden = !say.acts.length;
}

// 홈의 오늘 카드: 오늘의 학습(시험 대비 → 새 단어) → 오늘의 복습 → 더 하기 순서로 한 카드 안에서 바뀜
let viewStage = null; // 학습 › 복습 › 더 하기를 눌러 직접 본 단계 (세션을 시작하면 다시 자동)
function renderPlan() {
  ensureCoachPlan();
  const { plan, learnLeft, rv, stage: regular } = flowState();
  // 눌러서 갈 수 있는 단계: 학습·복습은 언제나(복습을 먼저 해도 됨), 더 하기는 둘 다 끝냈으면
  const can = { learn: true, review: true, extra: !learnLeft && rv.done };
  if (viewStage && !can[viewStage]) viewStage = null;
  const stage = soloDay != null && days.includes(soloDay) ? 'day' : viewStage || regular;
  // items: [숫자, 이름, 누르면 할 일(있으면 눌러서 직접 정하기)]
  const fill = (box, items) => {
    box.innerHTML = '';
    for (const [n, l, onEdit] of items) {
      const d = el(onEdit ? 'button' : 'div', onEdit ? 'editable' : null);
      d.append(el('b', null, n), l);
      if (onEdit) { d.title = '눌러서 개수 정하기'; d.appendChild(el('i', 'edit-ic', '✎')); d.addEventListener('click', onEdit); }
      box.appendChild(d);
    }
  };
  const order = ['learn', 'review', 'extra'];
  $('#today-title').textContent = { learn: '오늘의 학습', review: '오늘의 복습', extra: '더 하기', day: `DAY ${soloDay} 학습` }[stage];
  $('#today-flow').hidden = stage === 'day';
  $('#btn-solo-close').hidden = stage !== 'day';
  $('#stage-day').hidden = stage !== 'day';
  $('#card-today').classList.toggle('solo-mode', stage === 'day'); // DAY 단독 학습: 고른 DAY 박스와 같은 주황으로
  // DAY만 학습할 땐 정규 학습용(학습 범위, 하루 새 단어 수, 시험일, 범위 연습 버튼)은 회색으로. 문제 방식만 그대로
  for (const sel of ['#card-range', '#regular-opts', '#range-practice']) {
    const box = $(sel);
    box.classList.toggle('dim', stage === 'day');
    box.querySelectorAll('select, button, input').forEach(x => {
      if (stage === 'day') x.disabled = true;
      else if (x.id !== 'btn-wrong') x.disabled = false; // 다시 볼 단어는 renderHome이 개수로 정함
    });
  }
  // 홈의 학습 계획 요약은 흐리게만 (문제 방식은 DAY 단독 학습에서도 바꿀 수 있어서 눌러 들어갈 수는 있음)
  $('#plan-sum-card').classList.toggle('faded', stage === 'day');
  const finished = { learn: !learnLeft, review: !learnLeft && rv.done, extra: false };
  document.querySelectorAll('#today-flow span').forEach(sp => {
    const k = sp.dataset.s;
    sp.className = [finished[k] ? 'done' : '', k === stage ? 'on' : '', can[k] && k !== stage ? 'link' : ''].filter(Boolean).join(' ');
  });
  for (const k of order) $(`#stage-${k}`).hidden = k !== stage;
  const dd = $('#exam-dday');
  // 주기 복습이면 목표일 전엔 목표 D-n, 그 뒤엔 시험 D-n
  const toGoal = srsOn() && dateStr() < goalDate();
  const left = toGoal ? daysBetween(dateStr(), goalDate()) : settings.exam ? daysBetween(dateStr(), settings.exam) : null;
  dd.hidden = left == null || left < 0 || stage === 'day';
  if (!dd.hidden) { dd.textContent = left === 0 && !toGoal ? 'D-day' : `${toGoal ? '목표' : '시험'} D-${left}`; dd.className = 'tag' + (left <= 3 ? ' dday' : ''); }
  let note = '';

  if (stage === 'day') {
    const dw = words.filter(w => w.day === soloDay);
    const seen = dw.filter(w => stats[w.id]).length;
    $('#btn-day').textContent = `DAY ${soloDay} 학습 시작 (${dw.length})`;
    $('#btn-day-reset').hidden = !dayHasRecords(soloDay);
    note = `${dw.length}단어 중 ${seen}개 배움 · 정규 학습과 기록이 같이 쌓여요`;
  }

  if (stage === 'learn') {
    const items = [[plan.fresh.length, '새 단어', editNewToday]];
    if (plan.examInfo && plan.examInfo.finalDay) items.unshift([plan.final.length, `시험 대비 ${plan.examInfo.finalDay}/3`]);
    fill($('#plan-info'), items);
    $('#btn-start').textContent = learnLeft ? `오늘 학습 시작 (${learnLeft})` : '오늘 학습 완료 ✓';
    $('#btn-start').disabled = !learnLeft;
    const waiting = rv.started ? rv.left.length : plan.review.length;
    note = !learnLeft ? '숫자를 누르면 오늘 더 배울 수 있어요.'
      : waiting ? `복습할 단어 ${waiting}개가 기다려요 · 위의 '복습'을 누르면 먼저 할 수 있어요.` : '';
  } else if (stage === 'review') {
    // 기본: 전에 한 단어 20개(복습일 된 단어 먼저) · 주기 복습: 알고리즘이 고른 단어
    const due = plan.review.length;
    const shown = rv.left.length;
    const dueIn = rv.left.filter(id => isDue(stats[id], dateStr())).length;
    fill($('#review-info'), [[shown, '복습', editReviewToday], [dueIn, '복습일 된 단어']]);
    $('#btn-review').textContent = shown ? `오늘 복습 시작 (${shown})` : '오늘 복습 완료 ✓';
    $('#btn-review').disabled = !shown;
    if (srsOn()) {
      const sp = srsPick();
      const cap = settings.reviewLimit ? settings.reviewSize : 0;
      note = sp.phase === 'final' ? `목표일부터 시험 전까지 학습 범위 ${rangeWords().length}단어를 ${sp.days}일에 나눠 전부 복습해요 (하루 ${sp.size}개쯤).`
        : cap && due > cap ? `복습일이 된 단어가 ${due}개라 밀린 것부터 ${cap}개만 해요. 설정에서 '제한 없음'으로 바꿀 수 있어요.`
          : '주기 복습: 오늘 복습일이 된 단어예요.';
    } else note = due > dueIn ? `복습일이 된 단어가 ${due}개라 오늘은 밀린 것부터 ${shown}개 해요. 나머지는 추가 복습에서 나와요.` : '';
  } else if (stage === 'extra') {
    const n = settings.extraN;
    setSeg('#seg-extra', String(n)); // 5·10·20·40이 아니면(슬라이더로 고른 값) 아무것도 안 켜짐
    $('#extra-range').value = n;
    $('#extra-n').textContent = `${n}개`;
    const nNew = extraNew(n).length, nRev = extraReview(n).length;
    const bn = $('#btn-extra-new'), br = $('#btn-extra-review');
    bn.textContent = nNew ? `추가 학습 (${nNew})` : '새 단어 없음';
    br.textContent = nRev ? `추가 복습 (${nRev})` : '복습할 단어 없음';
    bn.disabled = !nNew;
    br.disabled = !nRev;
    note = nNew ? '오늘 할 건 다 했어요 👏 더 하고 싶으면 개수를 골라요.' : '이 범위의 새 단어를 다 배웠어요. 학습 범위를 넓히면 더 할 수 있어요.';
  }
  $('#today-note').textContent = note;
  // 코치가 켜져 있으면 하루 새 단어 수는 코치가 정함 (버튼은 흐리게)
  const ca = coachActive();
  $('#seg-new').classList.toggle('dim', ca);
  $('#coach-new-note').hidden = !ca;
  if (ca) $('#coach-new-note').textContent = `코치가 남은 날에 맞춰 정해요 · 오늘 ${todayNewTarget()}개`;
  $('#opt-coach-plan').checked = !!settings.coach;
  renderCoach(stage);
}

// 숫자 키패드 (앱 안): await askNumber({ title, value, extra }) → 숫자, 또는 extra를 고르면 extra.value, 취소면 null
// 폰·패드는 시스템 키보드 없이 이 키패드로, 컴퓨터는 키패드는 숨기고 실제 키보드의 숫자·Backspace·Enter·Esc로
function askNumber({ title, value, hint = '', extra = null, min = 1, max = 300 }) {
  const d = $('#numpad');
  $('#np-title').textContent = title;
  $('#np-hint').textContent = hint;
  let cur = String(value || ''), fresh = true; // 처음 누르는 숫자는 새로 쓰기
  const show = () => { $('#np-val').textContent = cur || '0'; $('#np-ok').disabled = !(+cur >= min); };
  return new Promise(resolve => {
    const close = () => { d.hidden = true; document.removeEventListener('keydown', onKey, true); };
    const done = v => { close(); modalDone(() => resolve(v)); };
    modalOpen(() => { close(); resolve(null); });
    const press = k => {
      if (k === 'back') { cur = fresh ? '' : cur.slice(0, -1); fresh = false; }
      else if (/^\d$/.test(k)) { cur = fresh ? k : (cur + k).replace(/^0+/, ''); fresh = false; if (+cur > max) cur = String(max); }
      show();
    };
    const ok = () => { if (+cur >= min) done(Math.min(max, +cur)); };
    const onKey = e => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') ok();
      else if (e.key === 'Escape') done(null);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const keys = $('#np-keys');
    keys.innerHTML = '';
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']) {
      const b = el('button', 'np-key' + (k === 'back' ? ' fn' : ''), k === 'back' ? '⌫' : k);
      if (!k) { b.disabled = true; b.classList.add('blank-key'); }
      else b.addEventListener('click', () => press(k));
      keys.appendChild(b);
    }
    const chips = $('#np-chips');
    chips.innerHTML = '';
    for (const n of [10, 20, 30, 40]) {
      const c = el('button', 'chip', String(n));
      c.addEventListener('click', () => { cur = String(n); fresh = true; show(); });
      chips.appendChild(c);
    }
    if (extra) { const c = el('button', 'chip', extra.label); c.addEventListener('click', () => done(extra.value)); chips.appendChild(c); }
    $('#np-ok').onclick = ok;
    $('#np-cancel').onclick = () => done(null);
    d.onclick = e => { if (e.target === d) done(null); };
    document.addEventListener('keydown', onKey, true);
    show();
    d.hidden = false;
  });
}

// 맨 위 카드의 숫자를 눌러 '오늘' 남은 새 단어·복습 개수를 바꿈 (오늘만. 매일 개수는 문제 방식 카드의 버튼으로)
async function editNewToday() {
  const left = todayPlan().fresh.length;
  const n = await askNumber({ title: '오늘 더 배울 새 단어', value: left, min: 0, hint: coachActive() ? '오늘만 바뀌어요 · 내일부터는 코치가 남은 날에 맞춰 다시 나눠요' : '오늘만 바뀌어요 · 매일 개수는 학습 계획의 \'하루 새 단어 수\'' });
  if (n == null) return;
  const day = loadDay();
  day.newTarget = newToday() + n; // 오늘 이미 배운 수 + 더 배울 수
  save(KEY.day, day);
  viewStage = 'learn';
  renderPlan();
}
async function editReviewToday() {
  const srs = srsOn();
  const left = reviewState().left.length;
  const n = await askNumber({
    title: '오늘 복습할 단어', value: left, min: 0,
    hint: srs ? '오늘만 바뀌어요 · 주기 복습: 복습일이 된 단어에서' : '오늘만 바뀌어요 · 매일 개수는 학습 계획의 \'하루 복습 수\'',
    extra: srs ? { label: '전부(제한 없음)', value: -1 } : null,
  });
  if (n == null) return;
  // 오늘 이미 복습한 단어는 두고, 남은 단어를 n개(전부면 다)로 다시 고름
  const day = loadDay();
  const done = Array.isArray(day.review) ? day.review.filter(id => byId.has(id) && seenToday(id)) : [];
  const want = n < 0 ? 0 : n;
  const picked = srs
    ? pickSrsReview(rangeWords(), rangeWords(), stats, { today: dateStr(), goal: goalDate(), exam: settings.exam, limit: want }).words
    : pickReview(rangeWords(), stats, { n: want });
  const rest = picked.map(w => w.id).filter(id => !done.includes(id));
  day.review = [...done, ...(n < 0 ? rest : rest.slice(0, want))];
  save(KEY.day, day);
  viewStage = 'review';
  renderPlan();
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
async function startSession(mode, list) {
  // 하던 학습이 있으면: 같은 학습이면 이어서, 다른 학습이면 물어보고 (말없이 덮어쓰지 않게)
  const saved = mode === 'retry' ? null : load(KEY.session, null);
  if (saved && saved.date === dateStr() && saved.pos > 0 && saved.pos < saved.queue.length) {
    if (saved.mode === mode && (mode === 'today' || mode === 'review')) { resumeSession(); return; }
    if (!(await ask({
      title: '하던 학습을 그만두고 새로 시작할까요?',
      body: `${saved.label} · ${saved.done.length}/${saved.total}까지 했어요.\n맞히고 틀린 기록은 그대로 남고, 이어하기만 사라져요.`,
      ok: '새로 시작',
    }))) return;
  }
  const startedFrom = current; // 단어장에서 시작했으면 그만둘 때 단어장으로
  viewStage = null;
  const rw = rangeWords();
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  const range = from === to ? `DAY ${from}` : `DAY ${from}~${to}`;
  let ids, label;
  if (mode === 'today') {
    const plan = todayPlan();
    // 시험 대비 → 새 단어(교재 순서) 순으로
    ids = [...shuffle(plan.final), ...plan.fresh].map(w => w.id);
    if (!ids.length) { toast('오늘 새 단어는 다 했어요'); return; }
    label = '오늘의 학습';
  } else if (mode === 'review') {
    // 처음 시작할 때 오늘의 복습 목록을 고정 → 중간에 그만둬도 남은 단어만 이어서
    const day = loadDay();
    if (!Array.isArray(day.review)) { day.review = pickToday().map(w => w.id); save(KEY.day, day); }
    ids = shuffle(day.review.filter(id => byId.has(id) && !seenToday(id)));
    if (!ids.length) { toast('오늘 복습은 다 했어요'); return; }
    label = '오늘의 복습';
  } else if (mode === 'extraNew') {
    ids = extraNew(settings.extraN).map(w => w.id);
    if (!ids.length) { toast('이 범위에 새 단어가 없어요'); return; }
    label = '추가 학습';
  } else if (mode === 'extraReview') {
    ids = shuffle(extraReview(settings.extraN)).map(w => w.id);
    if (!ids.length) { toast('복습할 단어가 없어요'); return; }
    label = '추가 복습';
  } else if (mode === 'day') {
    // 그 DAY만: 안 배운 단어는 교재 순서로 먼저, 배운 단어는 섞어서
    const dw = words.filter(w => w.day === soloDay);
    ids = [...dw.filter(w => !stats[w.id]), ...shuffle(dw.filter(w => stats[w.id]))].map(w => w.id);
    if (!ids.length) return;
    label = `DAY ${soloDay}`;
  } else if (mode === 'unknown') {
    ids = shuffle(bookWords().filter(w => isUnknown(w.id))).map(w => w.id);
    if (!ids.length) { toast('형광펜 친 단어가 없어요'); return; }
    label = '형광펜 단어 테스트';
  } else if (list && mode !== 'order') {
    ids = shuffle(list).map(w => w.id);
    label = '다시 볼 단어';
  } else if (mode === 'wrong') {
    ids = shuffle(rw.filter(w => isWrongNote(stats[w.id]))).map(w => w.id);
    if (!ids.length) { toast('이 범위에 다시 볼 단어가 없어요'); return; }
    label = `${range} 다시 볼 단어`;
  } else {
    ids = (list || rw).map(w => w.id);
    label = `${range} 순서대로`;
  }
  session = { label, mode, queue: ids, pos: 0, total: ids.length, done: [], wrong: [], hinted: [], again: {}, date: dateStr() };
  if (startedFrom === 'list') session.from = 'list';
  if (mode !== 'retry') setTint(mode === 'day' ? 'study' : null); // 틀린 단어 다시 풀기는 하던 색 그대로
  saveSession();
  show('quiz');
  renderQuestion();
}

// 범위 순서대로 연습: 몇 개 할지 고름. 지난번에 한 데 다음부터 이어서 (범위를 바꾸면 처음부터)
async function startOrder() {
  const rw = rangeWords();
  if (!rw.length) return;
  const key = `${Math.min(settings.from, settings.to)}-${Math.max(settings.from, settings.to)}`;
  const op = settings.orderPos;
  const pos = op && op.key === key && op.at < rw.length ? op.at : 0;
  const n = await askNumber({
    title: '몇 개 연습할까요?', value: Math.min(40, rw.length), max: rw.length,
    hint: pos ? `지난번에 이어서 ${pos + 1}번째 단어부터 · 범위 ${rw.length}개` : `범위의 처음부터 순서대로 · 범위 ${rw.length}개`,
    extra: { label: '전부', value: -1 },
  });
  if (n == null) return;
  const list = n < 0 ? rw : rw.slice(pos, pos + n);
  await startSession('order', list);
  if (!session || session.mode !== 'order') return;
  settings.orderPos = n < 0 ? null : { key, at: pos + list.length >= rw.length ? 0 : pos + list.length };
  saveSettings();
}

function resumeSession() {
  const saved = load(KEY.session, null);
  if (!saved) return;
  if (saved.date !== dateStr()) { localStorage.removeItem(KEY.session); renderHome(); toast('날짜가 바뀌어서 오늘의 학습을 새로 만들었어요'); return; }
  saved.queue = saved.queue.filter(id => byId.has(id));
  saved.hinted = saved.hinted || [];
  delete saved.from;
  session = saved;
  setTint(session.mode === 'day' ? 'study' : null);
  if (session.pos >= session.queue.length) { finishSession(); return; }
  show('quiz');
  renderQuestion();
}

// ---------- 유반의어 테스트 (DAY 박스를 왼쪽으로 밀면) ----------
// 예문 모드: 예문 속 밑줄 친 단어와 뜻이 비슷한(반대인) 말 고르기 / 단어 모드: 유의어(반의어)를 보고 그 단어 고르기
// 학습 기록·복습 일정·다시 볼 단어에 영향 없음. 이어하기에도 안 남김
function startSynSession(day, list) {
  viewStage = null;
  const pool = (list || words.filter(w => w.day === day)).filter(Boolean);
  const ids = shuffle(pool.filter(hasSynAnt)).map(w => w.id);
  if (!ids.length) { toast(`DAY ${day}에는 유의어·반의어가 있는 단어가 없어요`); return; }
  setTint('syn');
  session = { label: `DAY ${day} 유반의어`, mode: 'syn', synDay: day, noSave: true, queue: ids, pos: 0, total: ids.length, done: [], wrong: [], hinted: [], again: {}, date: dateStr() };
  show('quiz');
  renderQuestion();
}

const SYN_LABEL = { syn: '유의어', ant: '반의어' };
// 예문 속 그 단어에 밑줄 (빈칸 대신)
function underlineCard(b, ko, n, src, showKo) {
  const card = el('div', 'sent');
  const head = el('div', 'sent-head');
  head.appendChild(el('span', 'num', `예문 ${n}` + (src ? ` · ${src}` : '')));
  if (showKo) head.appendChild(speakBtn(speakText(b.segs)));
  card.appendChild(head);
  const en = el('div', 'en');
  for (const x of b.segs) en.appendChild(x.t === 'text' ? document.createTextNode(x.v) : el('u', 'ul', x.v));
  card.appendChild(en);
  if (showKo && ko) card.appendChild(el('div', 'ko', ko));
  return card;
}
function synCard(sq, w, answered) {
  if (sq.sentence) {
    const s = sq.sentence;
    return underlineCard(s.b, s.ko, s.n, s.n === 2 ? w.ex2src : w.ex1src, answered);
  }
  if (!sq.shown.length) return wordCard(w); // 예문 모드인데 예문의 뜻을 못 정한 단어: 단어만
  const card = el('div', 'sent word-card syn-shown');
  card.appendChild(el('div', 'qw', sq.shown.join(' · ')));
  return card;
}

function renderSynQuestion(w) {
  // 보기는 가까운 DAY 단어에서 (시험지처럼 아는 단어들로), 모자라면 전체에서
  const near = words.filter(x => Math.abs(x.day - w.day) <= 2);
  const sq = makeSynQuestion(w, near, { byExample: !WORD }) || makeSynQuestion(w, words, { byExample: !WORD });
  if (!sq) { // 낼 수 없는 단어는 건너뜀
    session.queue.splice(session.pos, 1);
    session.total = Math.max(0, session.total - 1);
    return session.pos < session.queue.length ? renderQuestion() : finishSession();
  }
  q = { w, syn: sq, answered: false };
  $('#feedback').hidden = true;
  $('#fb-head').hidden = true;
  const prompt = document.querySelector('.q-prompt');
  prompt.classList.remove('my-answer');
  const rel = sq.kind === 'syn' ? '가장 비슷한' : '반대인';
  prompt.textContent = sq.sentence ? `밑줄 친 부분과 의미가 ${rel} 것은?`
    : sq.shown.length ? `이 말과 의미가 ${rel} 단어는?` : `이 단어와 의미가 ${rel} 것은?`;
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = `DAY ${w.day}`;
  $('#q-again').hidden = !session.again[w.id];
  const kt = $('#q-kind');
  kt.hidden = false;
  kt.className = `tag kind-tag ${sq.kind}`;
  kt.textContent = SYN_LABEL[sq.kind];
  const box = $('#q-sentences');
  box.className = '';
  box.innerHTML = '';
  box.appendChild(synCard(sq, w, false));
  // 힌트: 예문이면 해석, 아니면 단어 뜻
  const mEl = $('#q-meaning');
  mEl.textContent = sq.sentence ? sq.sentence.ko || meaningText(w) : `뜻: ${meaningText(w)}`;
  mEl.hidden = true;
  $('#btn-hint').hidden = !mEl.textContent;
  $('#btn-hint').textContent = '💡 힌트';
  $('#btn-idk').hidden = false;
  const actions = $('#q-actions');
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'pin-choices');
  $('.quiz-body').style.paddingBottom = '';
  sq.options.forEach((o, i) => {
    const b = el('button', 'choice');
    b.append(el('span', 'n', i + 1), el('span', null, o.text));
    if (o.ok) b.dataset.ok = '1';
    b.addEventListener('click', () => {
      if (q.answered) return;
      b.classList.add(o.ok ? 'correct' : 'wrong');
      if (!o.ok) actions.querySelector('.choice[data-ok="1"]').classList.add('correct');
      actions.querySelectorAll('.choice').forEach(x => (x.disabled = true));
      q.picked = o;
      if (o.ok && q.usedHint) answer(false, null, 'hint');
      else answer(o.ok, o.ok ? null : o.text);
    });
    actions.appendChild(b);
  });
  fitChoices();
}

// 유반의어 채점: 기록·동기화 없이 이번 테스트 안에서만 (틀리면 3~5문제 뒤에 다시)
function synAnswer(correct, given, kind) {
  q.answered = true;
  const id = q.w.id;
  let label;
  if (!correct && kind !== 'hint') {
    if (!session.wrong.includes(id)) session.wrong.push(id);
    session.again[id] = (session.again[id] || 0) + 1;
    const at = Math.min(session.queue.length, session.pos + 1 + 3 + Math.floor(Math.random() * 3));
    session.queue.splice(at, 0, id);
    label = kind === 'idk' ? '모름 · 잠시 후 다시' : '오답 · 잠시 후 다시';
  } else {
    session.done.push(id);
    if (kind === 'hint' && !session.hinted.includes(id)) session.hinted.push(id);
    label = kind === 'hint' ? '힌트 사용' : '정답!';
  }
  session.pos++;
  showProgress();
  showSynFeedback(correct, given, kind, label);
}

function showSynFeedback(correct, given, kind, label) {
  const { w, syn: sq } = q;
  const state = correct ? 'ok' : kind === 'hint' ? 'hint' : 'bad';
  const head = $('#fb-head');
  head.hidden = false;
  head.className = 'tag fb-head ' + state;
  head.textContent = label;
  const prompt = document.querySelector('.q-prompt');
  prompt.textContent = !correct && given ? `내 답: ${given}` : ' ';
  prompt.classList.toggle('my-answer', !correct && !!given);
  const box = $('#q-sentences');
  box.innerHTML = '';
  box.className = 'answered ' + state;
  box.appendChild(synCard(sq, w, true));
  $('#btn-hint').hidden = true;
  $('#btn-idk').hidden = true;
  // 보기 풀이: 정답은 왜 정답인지, 다른 보기는 무슨 뜻인지
  const card = el('div', 'fb-card opts');
  card.appendChild(el('b', null, '보기 풀이'));
  const rel = SYN_LABEL[sq.kind], other = SYN_LABEL[sq.kind === 'syn' ? 'ant' : 'syn'];
  for (const o of sq.options) {
    const row = el('div', 'opt' + (o.ok ? ' ok' : '') + (q.picked === o && !o.ok ? ' picked' : ''));
    row.appendChild(el('span', 'opt-ic', o.ok ? '✓' : q.picked === o ? '✕' : '·'));
    row.appendChild(el('b', null, o.text));
    const why = o.role === 'answer' && !sq.shown.length ? `${w.word}의 ${rel}`
      : o.role === 'answer' ? `${sq.shown.join(', ')}의 ${rel === '유의어' ? '유의어' : '반의어'}`
      : o.role === 'trap' ? `${w.word}의 ${other} (함정)`
      : o.w ? `${shortMeaning(o.w.meaning) || o.w.meaning} · DAY ${o.w.day}` : '';
    row.appendChild(el('span', 'muted', why));
    card.appendChild(row);
  }
  setFbCoach(state);
  openSheet(w, [card]);
}

let q = null; // 현재 문제 상태

function renderQuestion() {
  const id = session.queue[session.pos];
  const w = byId.get(id);
  if (!w) { session.pos++; return session.pos < session.queue.length ? renderQuestion() : finishSession(); }
  $('#q-kind').hidden = true;
  if (session.mode === 'syn') return renderSynQuestion(w);
  if (WORD) return renderWordQuestion(w);
  $('#btn-idk').hidden = true;
  const b1 = w.ex1 ? makeBlanks(w.ex1, w.blank, w.word) : null;
  const b2 = w.ex2 ? makeBlanks(w.ex2, w.blank, w.word) : null;
  q = { w, b1, b2, answered: false, letterHint: false, revealed: false, usedHint: hintedId() === id };

  $('#feedback').hidden = true;
  $('#fb-head').hidden = true;
  $('#q-sentences').className = '';
  document.querySelector('.q-prompt').classList.remove('my-answer');
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = `DAY ${w.day}`;
  $('#q-again').hidden = !session.again[id];

  const box = $('#q-sentences');
  box.innerHTML = '';
  const noBlank = !(b1 && b1.ok) && !(b2 && b2.ok);
  [[b1, w.ex1ko], [b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (!b || !b.segs.length) return;
    box.appendChild(sentenceCard(b, ko, i + 1, false, false, w, i ? w.ex2src : w.ex1src));
  });
  document.querySelector('.q-prompt').textContent = noBlank ? '뜻에 맞는 말을 고르세요'
    : { same: '빈칸에 공통으로 들어갈 말은?', single: '빈칸에 들어갈 말은?',
      diff: settings.kind === 'type' ? '빈칸에 들어갈 단어는? (원형으로 써도 돼요)' : '빈칸에 들어갈 단어는? (문장에 맞게 형태가 바뀌어요)' }[blankForms(b1, b2)];
  if (noBlank) box.innerHTML = ''; // 빈칸을 못 만든 예문은 정답이 보이므로 숨김

  const mEl = $('#q-meaning');
  mEl.textContent = meaningText(w);
  mEl.hidden = !(settings.showMeaning || noBlank) || !mEl.textContent;
  $('#btn-hint').hidden = false;
  $('#btn-hint').textContent = '💡 힌트';

  const actions = $('#q-actions');
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'pin-choices');
  $('.quiz-body').style.paddingBottom = '';
  if (settings.kind === 'type') renderTyping(actions);
  else {
    renderChoices(actions);
    if (q.usedHint) { strikeChoices(); setHintButtons(null); }
    actions.dataset.layout = ui.choiceLayout;
    // 폰: 예문이 길면 선지가 화면 밖으로 밀려나서, 선지를 2×2로 화면 아래에 고정하고 문장 아래 여백 확보
    if (!DESK) {
      $('#quiz').classList.add('pin-choices');
      if (ui.choiceLayout === 'grid') actions.prepend(leanBar(actions)); // 쏠림은 격자에서만
      else delete actions.dataset.lean;
      $('.quiz-body').style.paddingBottom = `${actions.offsetHeight + 12}px`;
    }
    fitChoices();
  }
}

// 빈칸에 들어갈 말이 모든 문장에서 같은 꼴인지 (deteriorated / deteriorate처럼 다르면 '공통으로'라고 묻지 않음)
// 'same' 여러 번 나오는데 다 같은 꼴 · 'diff' 꼴이 다름 · 'single' 한 번만 나옴
function blankForms(b1, b2) {
  const bs = [b1, b2].filter(b => b && b.ok && b.blanks.length);
  if (!bs.length) return 'single';
  const unit = blankUnit(bs[0].blanks).map(x => x.toLowerCase());
  if (!bs.every(b => b.blanks.every((x, i) => x.toLowerCase() === unit[i % unit.length]))) return 'diff';
  return bs.length > 1 || bs[0].blanks.length > unit.length ? 'same' : 'single';
}

// 4지선다 '보기 풀이': 정답과 내가 고른 보기가 각각 무슨 단어·뜻인지 (틀렸거나 힌트를 썼을 때 정답 시트에)
function choiceNotes(choices, right, picked) {
  const card = el('div', 'fb-card opts');
  card.appendChild(el('b', null, '보기 풀이'));
  for (const c of choices) {
    const ok = c === right, mine = c === picked && !ok;
    const row = el('div', 'opt' + (ok ? ' ok' : '') + (mine ? ' picked' : ''));
    row.append(el('span', 'opt-ic', ok ? '✓' : mine ? '✕' : '·'), el('b', null, WORD ? c.word : displayAnswer(c)),
      el('span', 'muted', `${shortMeaning(c.meaning) || c.meaning} · DAY ${c.day}`));
    card.appendChild(row);
  }
  return card;
}

// 컴퓨터: 선지가 창 아래로 넘치면(낮은 창, 긴 예문) 2×2로 줄여서 한 화면에
function fitChoices() {
  if (!DESK) return;
  const actions = $('#q-actions');
  actions.classList.remove('fit');
  if (actions.querySelector('.choice') && actions.getBoundingClientRect().bottom > window.innerHeight - 8) actions.classList.add('fit');
}

// ---------- 단어 모드: 단어를 보고 뜻 맞히기 ----------
const synonymOf = w => { const e = w.extras.find(([h]) => h.replace(/\s/g, '') === '유의어'); return e ? e[1] : ''; };
const wordHint = w => (synonymOf(w) ? `유의어: ${synonymOf(w)}` : w.ex1 ? `예문: ${w.ex1}` : '');
const STRICT_DESC = {
  easy: '뜻 하나만 통하면 정답이에요. 비슷한 표현·동의어도 정답 (AI를 켜면 뜻으로 채점해요).',
  mid: '뜻 갈래(1. 2. …)마다 하나씩은 써야 정답이에요. 같은 갈래의 비슷한 말은 하나만 써도 돼요.',
  hard: '나와 있는 뜻 낱말을 전부 써야 정답이에요.',
};

function wordCard(w) {
  const card = el('div', 'sent word-card');
  card.append(speakBtn(w.word), el('div', 'qw', w.word));
  if (w.pron) card.appendChild(el('div', 'pron', w.pron));
  return card;
}

function renderWordQuestion(w) {
  q = { w, answered: false, usedHint: hintedId() === w.id };
  $('#feedback').hidden = true;
  $('#fb-head').hidden = true;
  const prompt = document.querySelector('.q-prompt');
  prompt.classList.remove('my-answer');
  prompt.textContent = settings.kind === 'type' ? '이 단어의 뜻을 써 보세요' : '이 단어의 뜻은?';
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = `DAY ${w.day}`;
  $('#q-again').hidden = !session.again[w.id];
  const box = $('#q-sentences');
  box.className = '';
  box.innerHTML = '';
  box.appendChild(wordCard(w));
  const mEl = $('#q-meaning');
  mEl.textContent = wordHint(w);
  mEl.hidden = true;
  $('#btn-hint').hidden = !mEl.textContent;
  $('#btn-hint').textContent = '💡 힌트';
  $('#btn-idk').hidden = false;
  const actions = $('#q-actions');
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'pin-choices');
  $('.quiz-body').style.paddingBottom = '';
  if (settings.kind === 'type') renderMeaningTyping(actions);
  else { renderMeaningChoices(actions); fitChoices(); }
}

function renderMeaningChoices(actions) {
  const w = q.w;
  const pool = rangeWords().length >= 8 ? rangeWords() : words;
  let opts = pickMeaningDistractors(w, pool, 3);
  if (opts.length < 3) opts = opts.concat(pickMeaningDistractors(w, words, 3).filter(o => !opts.some(x => x.meaning === o.meaning))).slice(0, 3);
  const choices = shuffle([w, ...opts]);
  q.choices = choices;
  choices.forEach((c, i) => {
    const b = el('button', 'choice');
    b.append(el('span', 'n', i + 1), el('span', null, c.meaning));
    if (c === w) b.dataset.ok = '1'; // '모르겠어요'를 누르면 이 보기를 정답으로 표시
    b.addEventListener('click', () => {
      if (q.answered) return;
      const ok = c === w;
      b.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) actions.querySelectorAll('.choice')[choices.indexOf(w)].classList.add('correct');
      actions.querySelectorAll('.choice').forEach(x => (x.disabled = true));
      q.answered = true;
      q.picked = c;
      q.userAnswer = c.meaning; // '왜 틀렸어?'에 씀
      q.how = 'choice';
      if (ok && q.usedHint) answer(false, null, 'hint');
      else answer(ok, ok ? null : c.meaning);
    });
    actions.appendChild(b);
  });
}

// 직접 쓰기: 폰 키보드로 한글 뜻을 쓰고 확인. 채점은 설정의 느슨/보통/엄격
function renderMeaningTyping(actions) {
  const input = el('input', 'type-input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'done' });
  input.placeholder = '뜻 입력 (여러 뜻은 쉼표로)';
  const ok = el('button', 'btn primary', '확인');
  const level = { easy: '느슨', mid: '보통', hard: '엄격' }[settings.strict] || '보통';
  const grader = aiOnline() ? `${level} · 오답이면 AI 재확인` : aiEnabled() ? `${level} (오프라인)` : level;
  actions.append(input, el('div', 'type-help', `채점: ${grader} · 설정에서 바꿀 수 있어요`), ok);
  let busy = false;
  const submit = async () => {
    if (q.answered || busy) return;
    const v = input.value.trim();
    if (!v) { toast('뜻을 먼저 써 주세요'); input.focus(); return; }
    const cur = q;
    cur.userAnswer = v; // '왜 틀렸어?'에 씀
    cur.how = 'type';
    input.blur();
    // 규칙 채점으로 바로. 정답이 아닐 때만(오답·부분 정답) 인터넷이 되면 AI가 다시 봄. AI가 실패하면 규칙 결과 그대로
    let res = gradeMeaning(v, cur.w.meaning, settings.strict);
    if (res.score < 2 && aiOnline()) {
      busy = true;
      input.disabled = ok.disabled = true;
      ok.textContent = `AI 확인 중…`;
      const ai = await aiGradeMeaning({ word: cur.w.word, meaning: cur.w.meaning, user: v, strict: settings.strict });
      busy = false;
      if (q !== cur || cur.answered) return; // 채점 중에 다른 화면으로 나갔으면 버림
      input.disabled = ok.disabled = false;
      ok.textContent = '확인';
      if (ai) res = ai;
    }
    const { score, missing, note = '' } = res;
    const tail = note ? ` · ${note}` : score === 1 ? ` · ${missing}개 뜻이 빠졌어요` : '';
    if (score === 2) answer(!cur.usedHint, null, cur.usedHint ? 'hint' : undefined);
    else if (score === 1) answer(false, v + tail, 'partial');
    else answer(false, v + tail);
  };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter는 무시
    e.preventDefault();
    e.stopPropagation();
    submit();
  });
  setTimeout(() => input.focus(), 50);
}

// 예전 단어 모드(약한 단어 목록)에서 넘어올 때 한 번: 약한 단어를 오늘 '다시 볼 단어'로
function migrateOldWordMode() {
  if (!WORD) return;
  const old = 'voca-meaning.voca:weak';
  let weak = null;
  try { weak = JSON.parse(localStorage.getItem(old) || 'null'); } catch {}
  if (!weak || typeof weak !== 'object') return;
  const today = dateStr();
  let n = 0;
  for (const w of words) {
    if (!(w.word in weak) || stats[w.id]) continue;
    const st = applyResult(null, 'wrong', { today });
    st.due = today;
    st.f = addDays(today, -1); // 오늘의 새 단어 수에서 빠지게
    stats[w.id] = st;
    n++;
  }
  saveStats();
  localStorage.removeItem(old);
  localStorage.removeItem('voca-meaning.voca:session');
  if (n) toast(`예전 약한 단어 ${n}개를 '다시 볼 단어'로 옮겼어요`, 3500);
}

// "1. 치명적인 2. 결정적인" → 번호마다 줄바꿈
const formatMeaning = m => String(m || '').replace(/\s+(?=\d+\.\s)/g, '\n');

function meaningText(w) {
  return [w.pos, formatMeaning(w.meaning)].filter(Boolean).join(' ');
}

// 예문 한 칸에 문장이 여럿이면(" / "로 이어 적음) 문장마다 나눔. segs를 문장별 묶음으로
const SENT_SEP = /\s+\/\s+/;
function splitSegs(segs) {
  const parts = [[]];
  for (const s of segs) {
    if (s.t !== 'text') { parts[parts.length - 1].push(s); continue; }
    s.v.split(SENT_SEP).forEach((v, i) => {
      if (i) parts.push([]);
      if (v) parts[parts.length - 1].push({ t: 'text', v });
    });
  }
  return parts.filter(p => p.length);
}
// 읽어 줄 때 " / "를 '슬래시'로 읽지 않게
const speakText = segs => segs.map(s => s.v).join('').replace(/\s+\/\s+/g, '. ').replace(/\.\. /g, '. ');

function sentenceCard(b, ko, n, filled, wrongAnswer, w, src) {
  const card = el('div', 'sent');
  const head = el('div', 'sent-head');
  head.appendChild(el('span', 'num', `예문 ${n}` + (src ? ` · ${src}` : '')));
  if (filled) head.appendChild(speakBtn(speakText(b.segs)));
  card.appendChild(head);
  const enLine = segs => {
    const en = el('div', 'en');
    for (const s of segs) {
      if (s.t === 'text') en.appendChild(document.createTextNode(s.v));
      else {
        // 빈칸 폭 = 정답 단어 폭: 정답을 안 보이게 깔고(sz) 그 위에 입력/정답을 겹쳐 씀(fl)
        const span = el('span', 'blank');
        span.dataset.i = s.i;
        span.append(el('span', 'sz', s.v || '\u00a0\u00a0\u00a0'), el('span', 'fl', filled ? s.v : ''));
        if (filled) span.classList.add('filled');
        if (filled && wrongAnswer) span.classList.add('bad');
        en.appendChild(span);
      }
    }
    return en;
  };
  const koLine = text => {
    const k = el('div', 'ko' + (!filled && !settings.showKo ? ' hide' : ''));
    for (const s of highlightMeaning(text, w && w.meaning, w && w.koMark)) k.appendChild(s.t === 'mark' ? el('b', 'ko-mark', s.v) : document.createTextNode(s.v));
    if (!filled && !settings.showKo) k.addEventListener('click', () => k.classList.remove('hide'));
    return k;
  };
  const parts = splitSegs(b.segs);
  const kos = ko ? String(ko).split(SENT_SEP) : [];
  if (parts.length > 1) {
    // 해석도 같은 수로 나뉘면 문장 바로 아래에 하나씩, 아니면 맨 아래에 한꺼번에
    const paired = kos.length === parts.length;
    card.classList.add('multi');
    parts.forEach((segs, i) => {
      const part = el('div', 'sent-part');
      part.appendChild(enLine(segs));
      if (paired) part.appendChild(koLine(kos[i]));
      card.appendChild(part);
    });
    if (ko && !paired) card.appendChild(koLine(ko));
  } else {
    card.appendChild(enLine(b.segs));
    if (ko) card.appendChild(koLine(ko));
  }
  return card;
}

// 폰 4지선다: ‹ › 를 누르면 선지 칸이 그쪽으로 넓어짐 (한 손으로 누를 때). 반대쪽을 누르면 가운데로
function leanBar(actions) {
  const bar = el('div', 'lean-bar');
  const apply = () => {
    actions.dataset.lean = ui.lean;
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === ui.lean));
  };
  for (const [d, label, aria] of [['left', '‹', '선지를 왼쪽으로'], ['right', '›', '선지를 오른쪽으로']]) {
    const b = el('button', 'lean-btn', label);
    b.type = 'button';
    b.dataset.d = d;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => {
      ui.lean = ui.lean === 'mid' ? d : ui.lean === d ? d : 'mid';
      save(UI_KEY, ui);
      apply();
    });
    bar.appendChild(b);
  }
  apply();
  return bar;
}

function renderChoices(actions) {
  const w = q.w;
  const pool = rangeWords().length >= 8 ? rangeWords() : words;
  let opts = pickDistractors(w, pool, 3);
  if (opts.length < 3) opts = opts.concat(pickDistractors(w, words, 3).filter(o => !opts.includes(o))).slice(0, 3);
  const choices = shuffle([w, ...opts]);
  q.choices = choices;
  choices.forEach((c, i) => {
    const b = el('button', 'choice');
    b.append(el('span', 'n', i + 1), el('span', null, displayAnswer(c)));
    if (c === w) b.dataset.ok = '1';
    b.addEventListener('click', () => {
      if (q.answered) return;
      const ok = c === w;
      b.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) actions.querySelectorAll('.choice')[choices.indexOf(w)].classList.add('correct');
      actions.querySelectorAll('.choice').forEach(x => (x.disabled = true));
      q.answered = true;
      q.picked = c;
      if (ok && q.usedHint) answer(false, null, 'hint');
      else answer(ok, ok ? null : displayAnswer(c));
    });
    actions.appendChild(b);
  });
}

// 오답 풀이 말풍선: 키보드 바로 위(앱 키보드) 또는 입력칸 위(폰 키보드).
// 문제 푸는 걸 막지 않게: 잠깐(글 길이에 따라 2.5~4.5초) 보였다가 저절로 사라지고, 다시 쓰기 시작해도 바로 사라짐. 눌러도 아래가 그대로 눌림
const COACH_ICON = { spell: '✏️', near: '🌱', off: '🤔', wait: '💭' }; // off(빨강)는 AI 풀이일 때만
function showCoach(actions, f, { stay = false } = {}) {
  hideCoach();
  const box = el('div', `coach ${f.kind}`);
  box.setAttribute('role', 'status');
  const msg = el('div', 'coach-msg');
  if (f.diff) {
    const d = el('span', 'coach-diff');
    for (const seg of f.diff) d.appendChild(seg.t === 'ok' ? document.createTextNode(seg.v) : el('b', seg.t, seg.v));
    msg.append(d, ` · ${f.text}`);
  } else msg.textContent = f.text;
  box.append(el('span', 'coach-ic', COACH_ICON[f.kind] || '💬'), msg);
  actions.prepend(box);
  if (stay) return; // 'AI가 살펴보는 중…'은 결과가 올 때까지
  const ms = Math.min(6000, 2500 + f.text.length * 35);
  hideCoach.timer = setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 300); }, ms);
}
function hideCoach() { clearTimeout(hideCoach.timer); document.querySelectorAll('.coach').forEach(c => c.remove()); }

const coachCache = new Map(), coachBusy = new Set(); // AI 풀이: 같은 단어·같은 답은 한 번만 물어봄

const PAUSE_ACCEPT_MS = 800;
const COACH_IDLE_MS = 1200; // 정답에서 벗어난 채로 이만큼 멈추면 말풍선 // 원형까지 쓰고 이만큼 멈추면 정답

function renderTyping(actions) {
  // 빈칸 수: 숙어는 단어마다 한 칸 (반복된 숙어는 한 번 분량)
  const parts = blankUnit((q.b1 && q.b1.blanks.length ? q.b1 : q.b2 || { blanks: [] }).blanks).length || answerParts(q.w.blank).length;
  const placeholder = parts > 1 ? `빈칸 ${parts}곳을 순서대로 입력` : '빈칸에 들어갈 말';
  const helpText = parts > 1 ? '칸을 다 채우면 다음 칸으로 넘어가요 (띄어쓰기로도 넘어가요)' : '대소문자는 구분하지 않아요';
  // 정답: 단어 원형(abound)도, 예문 속 형태(abounds)도 인정 — 단어를 외우는 게 우선
  const cands = [...new Set([
    q.w.word, // 단어장에 적힌 그대로 (convince A of B도)
    answerParts(q.w.blank).join(' '),
    typingHintTarget(q.w, q.b1 && q.b1.blanks, null),
    typingHintTarget(q.w, q.b2 && q.b2.blanks, null),
  ].map(normalizeAnswer).filter(Boolean))];
  const isRight = value => cands.includes(normalizeAnswer(value));
  // 칸을 다 채우면 다음 칸으로: 지금 칸에 쓴 단어가 그 칸의 정답 단어이고, 그걸로 시작하는 더 긴 정답 단어가 없을 때
  const candWords = cands.map(c => c.split(' '));
  const fillsSlot = value => {
    const ws = value.toLowerCase().replace(/[’‘]/g, "'").split(' ');
    const i = ws.length - 1, cur = ws[i], prev = ws.slice(0, i).join(' ');
    if (!cur) return false;
    const same = candWords.filter(cw => cw.length > i && cw.slice(0, i).join(' ') === prev);
    return same.some(cw => cw.length > i + 1 && cw[i] === cur) && !same.some(cw => cw[i] !== cur && cw[i].startsWith(cur));
  };
  // 더 이어질 정답이 없으면(outlawed, fatal) 쓰는 순간 넘어감.
  // 원형이 예문 형태의 앞부분이면(outlaw → outlawed): 설정에 따라 0.8초 멈추면(또는 확인) 넘어가거나 바로 넘어감
  const isFinal = value => {
    const n = normalizeAnswer(value);
    return cands.includes(n) && !cands.some(c => c !== n && c.startsWith(n));
  };
  // 직접 입력엔 오답이 없음: 정답이 될 때까지 계속 씀.
  // 힌트를 쓴 단어는 외운 걸로 치지 않고 잠시 후 한 번 더 나옴
  const check = value => {
    if (q.answered || !isRight(value)) return false;
    if (q.usedHint) answer(false, null, q.revealed ? 'copied' : 'hint');
    else answer(true, null);
    return true;
  };
  const thisQ = q;
  let pause = null;
  // 확인 버튼을 빛나게(정답 상태) — 0.8초 동안 버튼이 차오르고 다 차면 넘어감
  // 확인 버튼과 예문 박스 테두리에 0.8초 게이지 (컴퓨터처럼 확인 버튼이 안 보여도 언제 넘어가는지 보이게)
  const setReady = on => document.querySelectorAll('#q-actions .key.enter, #q-actions .btn.primary, #q-sentences .sent').forEach(b => {
    b.classList.remove('ready');
    b.classList.toggle('hinted', !!(on && q && q.usedHint)); // 힌트를 썼으면 노랑 게이지 (외운 걸로 안 침)
    if (on) { void b.offsetWidth; b.style.setProperty('--pause', `${PAUSE_ACCEPT_MS}ms`); b.classList.add('ready'); }
  });
  let coachIdle = null;
  const autoCheck = value => {
    clearTimeout(pause);
    clearTimeout(coachIdle);
    const right = isRight(value);
    // 정답에서 벗어난 채로 잠깐 멈추면 확인을 안 눌러도 말풍선이 자동으로 (정답 쪽으로 쓰는 중이면 안 나옴)
    const n = normalizeAnswer(value);
    if (n && !right && !q.revealed && !cands.some(c => c.startsWith(n))) {
      coachIdle = setTimeout(() => {
        if (q !== thisQ || q.answered || !q.typing || normalizeAnswer(q.typing.get()) !== n) return;
        notYet(value, true);
      }, COACH_IDLE_MS);
    }
    if (right && (settings.baseAccept === 'instant' || isFinal(value))) return check(value);
    setReady(right);
    if (right) {
      pause = setTimeout(() => {
        if (q !== thisQ || q.answered || !q.typing || normalizeAnswer(q.typing.get()) !== normalizeAnswer(value)) return;
        if (check(value) && document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }, PAUSE_ACCEPT_MS);
    }
    return false;
  };
  // 틀린 답이 아깝거나 비슷하면 말풍선으로 (철자·형태 노랑 · 뜻이 통하는 말 초록). 상관없는 말엔 안 띄움
  // AI가 켜져 있으면: 철자 실수·빈칸 덜 채움은 바로 규칙 말풍선, 그 밖엔 AI가 두 예문을 보고 풀이 (실패하면 규칙 말풍선)
  const notYet = async (value, auto) => {
    clearTimeout(coachIdle);
    const n = normalizeAnswer(value);
    const f = coachFeedback(value, q.w, { cands, find: t => findWord(t, q.w.id) });
    const plain = () => { if (f) showCoach(actions, f); else if (!auto) toast('아직 정답이 아니에요. 모르면 💡 힌트를 눌러보세요'); };
    if (!aiOnline() || n.length < 2 || q.revealed || (f && f.kind === 'spell')) return plain();
    const key = `${q.w.id}|${n}`;
    let r = coachCache.get(key);
    if (r === undefined) {
      if (coachBusy.has(key)) return; // 같은 답으로 이미 물어보는 중
      coachBusy.add(key);
      showCoach(actions, { kind: 'wait', text: 'AI가 살펴보는 중…' }, { stay: true });
      const blankText = b => (b && b.segs.length ? b.segs.map(x => (x.t === 'blank' ? '___' : x.v)).join('') : '');
      r = await aiCoach({
        word: q.w.word, meaning: q.w.meaning, user: value.trim(),
        sentences: [blankText(q.b1), blankText(q.b2)].filter(Boolean),
        answers: [...new Set([q.w.word, ...cands])],
      });
      coachBusy.delete(key);
      coachCache.set(key, r); // 실패(null)도 기억해서 같은 답으로 또 안 부름
    }
    // 그 사이 다음 문제로 넘어갔거나 다시 쓰기 시작했으면 안 보여 줌
    if (q !== thisQ || q.answered || !q.typing || normalizeAnswer(q.typing.get()) !== n) return;
    if (r) showCoach(actions, r); else { hideCoach(); plain(); }
  };
  if (settings.appKeyboard || DESK) {
    const kbHelp = DESK ? `${parts > 1 ? `빈칸 ${parts}곳 · ` : ''}키보드로 바로 치세요 · Enter 확인 · Shift 힌트`
      : parts > 1 ? `빈칸 ${parts}곳 · 다 채우면 다음 칸으로` : '키보드로 바로 입력하세요';
    return renderAppKeyboard(actions, kbHelp, check, autoCheck, notYet, fillsSlot);
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
    if (!check(input.value)) { if (input.value.trim()) notYet(input.value); input.focus(); return; }
    input.blur();
  };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', e => {
    hideCoach();
    // 칸을 다 채우면 띄어쓰기를 넣어 다음 칸으로 (끝에 이어 쓸 때만)
    if (e.inputType && e.inputType.startsWith('insert') && input.selectionStart === input.value.length && fillsSlot(input.value)) input.value += ' ';
    if (autoCheck(input.value)) input.blur();
  });
  setTimeout(() => input.focus(), 50);
}

// ---------- 앱 자체 영어 키보드 (폰 키보드 대신) ----------
// 입력값을 문장의 빈칸들에 나눠 넣기. 같은 단어가 반복된 빈칸(cues … cues)은 모두 같은 값
function fillBlanks(value, targets) {
  // 같은 말이 반복된 빈칸(give up … give up)은 한 번 분량에 나눠 넣고 반복되는 칸에도 똑같이
  const unit = blankUnit(targets);
  const words = value.split(' ');
  const uf = [];
  let wi = 0, active = 0;
  unit.forEach((t, i) => {
    const n = i === unit.length - 1 ? Infinity : t.trim().split(/\s+/).length;
    const take = words.slice(wi, wi + n);
    if (take.length) active = i;
    wi += take.length;
    uf.push(take.join(' '));
  });
  return { fill: targets.map((_, i) => uf[i % unit.length] || ''), active };
}
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', "'zxcvbnm⌫"];
let kb = null; // 현재 키보드 상태 { value, type(key), submit() }

function renderAppKeyboard(actions, helpText, check, autoCheck, notYet, fillsSlot = () => false) {
  $('#quiz').classList.add('kb-mode');
  const top = el('div', 'kb-top');
  const hintBtn = el('button', 'btn ghost small kb-hint', '💡 힌트');
  // 힌트는 힌트 버튼에서 누르기 시작한 탭만 (바로 아래 키보드 틈을 누른 탭이 힌트로 잡히지 않게)
  // (크롬은 버튼 바로 옆 빈 곳을 누른 탭을 버튼으로 옮김 → 실제 터치 위치가 힌트 버튼 아래면 키보드 입력으로 넘김)
  let hintArmed = false;
  hintBtn.addEventListener('pointerdown', e => {
    hintArmed = e.clientY <= hintBtn.getBoundingClientRect().bottom;
    if (!hintArmed) press(e);
  });
  hintBtn.addEventListener('click', e => {
    if (!hintArmed && e.detail !== 0) return;
    hintArmed = false;
    useHint();
  });
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
      // 정답 보고 쓰기: 아직 안 쓴 부분을 회색으로
      const ghostFill = ci === 0 && ghostLen ? fillBlanks(ghostText.slice(0, ghostLen), targets[0]).fill : [];
      spans.forEach((sp, i) => {
        sp.classList.add('typing');
        sp.classList.toggle('active', i === active);
        const typed = fill[i] || '';
        const want = (targets[ci] || [])[i] || '';
        const ghost = want.slice(0, ci === 0 ? (ghostFill[i] || '').length : q.revealed ? want.length : 0);
        const onTrack = want.toLowerCase().startsWith(typed.toLowerCase());
        const fl = sp.querySelector('.fl');
        fl.textContent = '';
        // 정답 보고 쓰기에서 다르게 쓴 글자는 빨갛게(첫 문장 기준)
        if (q.revealed && !onTrack && ci === 0) fl.appendChild(el('span', 'typo', typed));
        else fl.appendChild(document.createTextNode(typed));
        if (ci === 0 && i === active) fl.appendChild(caret);
        if (onTrack && ghost.length > typed.length) fl.appendChild(el('span', 'ghost', ghost.slice(typed.length)));
      });
    });
  };
  const board = el('div', 'kb');
  kb = {
    value: '',
    type(key) {
      if (q.answered) return;
      hideCoach(); // 다시 쓰기 시작하면 말풍선은 닫힘
      if (key === 'back') kb.value = kb.value.slice(0, -1);
      else if (key === ' ') { if (kb.value && !kb.value.endsWith(' ')) kb.value += ' '; }
      else if (kb.value.length < 60) {
        kb.value += key;
        if (fillsSlot(kb.value)) kb.value += ' '; // 칸을 다 채우면 다음 칸으로
      }
      render();
      autoCheck(kb.value);
    },
    submit() {
      if (q.answered) return;
      const shake = () => { const c = cards[0] || top; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); };
      if (!kb.value.trim()) { shake(); return; }
      if (!check(kb.value)) { shake(); notYet(kb.value); }
    },
  };
  // 키마다 따로 듣지 않고 키보드 전체에서 받음: 키 사이 틈·가장자리를 눌러도 가장 가까운 키가 눌림
  const keyFn = new Map();
  const key = (label, cls, fn) => {
    const b = el('button', 'key' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    keyFn.set(b, fn);
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
  const down = new Map(); // pointerId → 눌린 키 (누른 모양 표시)
  const release = id => { const b = down.get(id); if (b) { b.classList.remove('down'); down.delete(id); } };
  // pointerdown으로 바로 반응 (터치 지연 없음), 지우기는 길게 누르면 연속 삭제
  const press = e => {
    e.preventDefault();
    const hit = e.target.closest && e.target.closest('.key');
    const b = hit && keyFn.has(hit) ? hit
      : nearestKey([...keyFn.keys()].map(el => ({ el, r: el.getBoundingClientRect() })), e.clientX, e.clientY)?.el;
    if (!b) return;
    const fn = keyFn.get(b);
    release(e.pointerId);
    b.classList.add('down');
    down.set(e.pointerId, b);
    fn();
    if (b.textContent === '⌫') {
      clearInterval(kb.repeat);
      kb.hold = setTimeout(() => { kb.repeat = setInterval(fn, 70); }, 400);
    }
    if (navigator.vibrate) navigator.vibrate(8);
  };
  board.addEventListener('pointerdown', press);
  const stopRepeat = e => { release(e.pointerId); clearTimeout(kb && kb.hold); clearInterval(kb && kb.repeat); };
  board.addEventListener('pointerup', stopRepeat);
  board.addEventListener('pointercancel', stopRepeat);
  board.addEventListener('pointerleave', stopRepeat);
  hintBtn.addEventListener('pointerup', stopRepeat); // 힌트 버튼 쪽에서 넘어온 키 입력의 손 뗌
  hintBtn.addEventListener('pointercancel', stopRepeat);
  actions.append(top, board);
  render();
  q.typing = {
    get: () => kb.value,
    set: v => { kb.value = v; render(); },
    // 정답 보고 쓰기: keep까지는 입력으로 남기고 나머지 정답을 회색으로 보여줌
    reveal: (target, keep) => {
      kb.value = keep;
      ghostText = target;
      ghostLen = Infinity;
      help.textContent = '회색 글자를 따라 써보세요';
      render();
    },
  };
  // 고정된 키보드에 문장이 가리지 않게 아래 여백 확보
  if (!DESK) requestAnimationFrame(() => { $('.quiz-body').style.paddingBottom = `${actions.offsetHeight + 12}px`; });
}

function useHint() {
  if (!q || q.answered) return;
  q.usedHint = true;
  if (session && !session.noSave && hintedId() !== q.w.id) { const d = loadDay(); d.hint = q.w.id; save(KEY.day, d); }
  if (WORD || q.syn) { $('#q-meaning').hidden = false; setHintButtons(null); return; }
  if (q.typing) {
    if (q.revealed) return;
    hideCoach(); // 힌트로 글자가 바뀌니 앞의 말풍선(… 한 글자 달라요)은 치움
    const target = typingHintTarget(q.w, q.b1 && q.b1.blanks, q.b2 && q.b2.blanks);
    const cur = q.typing.get();
    let k = 0;
    const low = cur.toLowerCase();
    while (k < low.length && low[k] === target[k]) k++;
    const keep = target.slice(0, k); // 맞게 쓴 데까지만 남김
    // 첫 번째: 맞게 쓴 데까지 살리고 그다음 2글자를 채워줌
    if (!q.letterHint) {
      const next = nextLetterHint(cur, target);
      q.letterHint = true;
      if (next != null) {
        q.typing.set(next);
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
  // 객관식: 틀린 보기 두 개를 지움 (첫 글자를 보여 주면 보기 첫 글자가 대개 달라서 답이 그대로 드러남)
  strikeChoices();
  setHintButtons(null);
}

function strikeChoices() {
  const wrong = shuffle([...document.querySelectorAll('#q-actions .choice:not([data-ok])')]).slice(0, 2);
  for (const b of wrong) { b.classList.add('gone'); b.disabled = true; }
}

function setHintButtons(label) {
  for (const b of [$('#btn-hint'), document.querySelector('.kb-hint')]) {
    if (!b) continue;
    b.hidden = label == null;
    if (label) b.textContent = label;
  }
}

// 진행 막대·개수: 문제를 그릴 때와 답한 바로 그때
function showProgress() {
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
}

function answer(correct, given, kind) {
  if (session.mode === 'syn') return synAnswer(correct, given, kind);
  hideCoach();
  q.answered = true;
  const w = q.w;
  const id = w.id;
  const today = dateStr();
  // 힌트 없이 맞힘 / 힌트 쓰고 맞힘 / 틀림(정답 보고 따라 쓴 것 포함)
  const outcome = correct ? 'ok' : kind === 'hint' || kind === 'partial' ? 'hint' : 'wrong';
  const before = stats[id];
  // 일정에 반영: 오늘의 학습이거나, 새 단어이거나, 복습일이 된 단어. 이번 학습에서 이미 틀렸던 단어는 맞혀도 내일 다시
  const retry = session.wrong.includes(id);
  const scheduled = !retry && (session.mode === 'today' || !before || isDue(before, today));
  delete tombs[id]; // 지운 DAY 단어를 다시 풀면 새 기록으로
  stats[id] = applyResult(before, outcome, { today, exam: deadline(today), scheduled, intervals: intervals() });
  // 다시 볼 단어(또는 틀린 단어 다시 풀기)에서 힌트 없이 맞히면 오늘은 목록에서 뺌
  const cleared = outcome === 'ok' && !retry && !scheduled && isWrongRaw(before) && (session.mode === 'wrong' || session.mode === 'retry');
  if (cleared) stats[id].r = today; else delete stats[id].r;
  if (hintedId() === id) { const d = loadDay(); delete d.hint; save(KEY.day, d); }

  let label;
  if (outcome === 'wrong') {
    if (!retry) session.wrong.push(id);
    session.again[id] = (session.again[id] || 0) + 1;
    // 같은 학습 중 3~5문제 뒤에 다시
    const at = Math.min(session.queue.length, session.pos + 1 + 3 + Math.floor(Math.random() * 3));
    session.queue.splice(at, 0, id);
    label = kind === 'copied' ? '정답 보고 씀 · 잠시 후 다시' : kind === 'idk' ? '모름 · 잠시 후 다시' : '오답 · 잠시 후 다시';
  } else {
    session.done.push(id);
    if (outcome === 'hint' && !session.hinted.includes(id)) session.hinted.push(id);
    const n = stats[id].due ? daysBetween(today, stats[id].due) : 0;
    label = kind === 'partial' ? '부분 정답 · 내일 다시'
      : outcome === 'hint' ? '힌트 사용 · 내일 다시'
      : retry ? '정답! · 내일 다시'
        : scheduled && n > 0 ? `정답! · ${n === 1 ? '내일' : `${n}일 뒤`} 복습`
          : cleared ? '정답! · 다시 볼 단어에서 뺐어요' : '정답!';
  }
  session.pos++;
  showProgress();
  saveStats();
  sync.soon();
  saveSession();
  showFeedback(correct, given, kind, label);
}

// 단어 모드 '모르겠어요': 틀린 걸로 치고 정답을 보여 줌 (같은 학습 중 3~5문제 뒤 + 내일 다시)
function giveUp() {
  if (!q || q.answered || current !== 'quiz' || (!WORD && !q.syn)) return;
  const right = document.querySelector('#q-actions .choice[data-ok="1"]');
  if (right) right.classList.add('correct');
  document.querySelectorAll('#q-actions .choice, #q-actions input, #q-actions button').forEach(x => (x.disabled = true));
  $('#btn-idk').hidden = true;
  answer(false, null, 'idk');
}

function showFeedback(correct, given, kind, label) {
  const w = q.w;
  const state = correct ? 'ok' : kind === 'partial' ? 'hint' : kind === 'idk' ? 'bad' : kind || 'bad';
  // 카드 위 상태 표시
  const head = $('#fb-head');
  head.hidden = false;
  head.className = 'tag fb-head ' + state;
  head.textContent = label;
  const prompt = document.querySelector('.q-prompt');
  prompt.textContent = !correct && given ? `내 답: ${given}` : '\u00a0';
  prompt.classList.toggle('my-answer', !correct && !!given);
  // 문장 카드에 정답 채우기
  const box = $('#q-sentences');
  box.innerHTML = '';
  box.className = 'answered ' + state;
  if (WORD) box.appendChild(wordCard(w));
  else {
    [[q.b1, w.ex1ko], [q.b2, w.ex2ko]].forEach(([b, ko], i) => {
      if (b && b.segs.length) box.appendChild(sentenceCard(b, ko, i + 1, true, state === 'bad', w, i ? w.ex2src : w.ex1src));
    });
  }
  $('#btn-hint').hidden = true;
  $('#btn-idk').hidden = true;
  if (settings.kind === 'type') {
    $('#q-actions').innerHTML = '';
    $('#quiz').classList.remove('kb-mode', 'pin-choices');
  } else if ($('#quiz').classList.contains('pin-choices')) {
    $('#quiz').classList.remove('pin-choices'); // 정답 시트가 아래를 덮으니 고정은 풂
    $('.quiz-body').style.paddingBottom = '';
  }

  setFbCoach(state);
  const more = [];
  if (q.choices && !correct) more.push(choiceNotes(q.choices, w, q.picked));
  if (WORD && !correct && kind !== 'hint' && q.userAnswer && aiOnline()) more.push(explainBox(q));
  openSheet(w, more);
}

// 아래 정답 시트: 단어, 발음, 뜻/예문 탭. more = 뜻 카드 바로 아래에 넣을 카드
function openSheet(w, more = []) {
  $('#fb-word').textContent = w.word;
  $('#fb-pron').textContent = w.pron || '';
  $('#fb-speak').onclick = () => speak(w.word);
  const fm = $('#fb-mark');
  fm.classList.toggle('on', isUnknown(w.id));
  fm.onclick = () => fm.classList.toggle('on', toggleUnknown(w.id));

  const mean = $('#fb-mean');
  mean.innerHTML = '';
  const card = el('div', 'fb-card');
  const tags = el('div', 'fb-tags');
  if (w.pos) tags.appendChild(el('span', 'tag', w.pos));
  tags.appendChild(el('span', 'tag', `DAY ${w.day}`));
  card.append(tags, el('div', 'fb-meaning', formatMeaning(w.meaning)));
  if (!WORD && !(q && q.syn) && answerParts(w.blank).length > 1) card.appendChild(el('div', 'muted', `빈칸: ${displayAnswer(w)}`));
  mean.appendChild(card);
  for (const m of more) mean.appendChild(m);
  if (w.extras.length) {
    const ex = el('div', 'fb-card extras');
    for (const [k, v] of w.extras) {
      const d = el('div');
      d.append(el('b', null, k), v);
      ex.appendChild(d);
    }
    mean.appendChild(ex);
  }

  const exPane = $('#fb-ex');
  exPane.innerHTML = '';
  [[w.ex1, w.ex1ko, w.ex1src], [w.ex2, w.ex2ko, w.ex2src]].forEach(([en, ko, src], i) => {
    if (en) exPane.appendChild(sentenceCard(makeBlanks(en, w.blank, w.word), ko, i + 1, true, false, w, src));
  });
  setFbTab('mean');

  $('#feedback').hidden = false;
  // 시트에 가리지 않게 문장 아래 여백
  // 넓은 컴퓨터 화면에선 정답 시트가 오른쪽 칸이라 여백 필요 없음
  if (!wideDesk()) requestAnimationFrame(() => { $('.quiz-body').style.paddingBottom = `${$('#feedback .sheet-inner').offsetHeight + 16}px`; });
  $('#fb-mean').scrollTop = 0;
  if (settings.autoSpeak) speak(w.word);
}

// 단어 모드 오답: 누르면 AI가 왜 틀렸는지 설명 (AI 사용 스위치가 켜져 있고 인터넷이 될 때만 보임)
function explainBox(cur) {
  const box = el('div', 'fb-card explain');
  const btn = el('button', 'btn secondary small', `🤖 왜 틀렸어?`);
  box.appendChild(btn);
  const showText = t => { box.innerHTML = ''; box.append(el('b', null, `AI 설명`), el('div', 'explain-text', t)); };
  if (cur.explain) { showText(cur.explain); return box; }
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = `AI가 설명 쓰는 중…`;
    const t = await aiExplainWrong({ word: cur.w.word, meaning: cur.w.meaning, user: cur.userAnswer, how: cur.how, extra: synonymOf(cur.w) ? `유의어 ${synonymOf(cur.w)}` : '' });
    if (t) { cur.explain = t; showText(t); return; }
    btn.disabled = false;
    btn.textContent = '🤖 다시 시도';
    toast('설명을 받지 못했어요. 인터넷이나 무료 한도를 확인해 주세요', 3000);
  });
  return box;
}

function setFbTab(t) {
  document.querySelectorAll('#fb-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#fb-mean').hidden = t !== 'mean';
  $('#fb-ex').hidden = t !== 'ex';
}

// 그만하기: 진행 상황은 저장되어 있어 홈에서 이어하기 가능. 단어장에서 시작한 학습이면 단어장으로
function quitQuiz() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  const toList = session && session.from === 'list' && history.state && history.state.s === 'list';
  session = null;
  if (toList) { show('list', false); renderList(); } else goHome();
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
  if (!s.noSave) saveSession();
  $('#feedback').hidden = true;
  const wrong = [...new Set([...s.wrong, ...(s.hinted || [])])].filter(id => byId.has(id));
  $('#res-title').textContent = `${s.label} 끝`;
  $('#res-detail').textContent = `${s.total}단어를 다 봤어요.`;
  const rk = $('#res-buddy');
  rk.hidden = !settings.coach;
  if (settings.coach) rk.innerHTML = coachSvg(wrong.length ? 'normal' : 'cheer');
  $('#res-wrong-label').textContent = wrong.length ? `틀렸거나 헷갈린 단어 ${wrong.length}개 · 한 번씩만 더 보고 가요` : '';
  const list = $('#res-wrong');
  list.innerHTML = '';
  if (!wrong.length) list.appendChild(el('div', 'card center muted', '틀린 단어 없이 다 맞혔어요 👏'));
  const view = bookView();
  for (const id of wrong) list.appendChild(wordItem(byId.get(id), view));
  // 틀린 게 있으면 그 단어만 한 번 더, 없으면 다음 할 일(오늘의 복습 · 더 하기)로
  const again = $('#btn-res-again');
  const f = flowState();
  const nextStep = f.stage === 'review' ? ['오늘의 복습 하기', () => startSession('review')] : null;
  if (s.mode === 'syn') {
    // 유반의어: 틀린 단어만 다시, 다 맞혔으면 같은 DAY를 새 문제로 한 번 더 (기록엔 영향 없음)
    $('#res-detail').textContent = `${s.total}단어를 다 풀었어요. 학습 기록에는 남지 않아요.`;
    again.textContent = wrong.length ? '틀린 단어 다시 풀기' : '한 번 더';
    again.onclick = () => startSynSession(s.synDay, wrong.length ? wrong.map(id => byId.get(id)) : null);
  } else if (wrong.length) {
    again.textContent = '틀린 단어 다시 풀기';
    again.onclick = () => startSession('retry', wrong.map(id => byId.get(id)));
  } else if (nextStep) {
    [again.textContent, again.onclick] = nextStep;
  } else {
    again.textContent = '홈으로';
    again.onclick = () => goHome();
  }
  $('#btn-res-home').hidden = again.textContent === '홈으로'; // 같은 버튼이 두 개 나오지 않게
  show('result', false);
}

// ---------- 단어장 ----------
let listFilter = 'all';
let bookQuery = ''; // 단어장 검색어 (있으면 고른 DAY와 상관없이 전체에서 찾음)
// 단어장 기록은 예문·단어 두 모드를 합쳐서: 틀린 횟수는 더하고, 단계는 더 높은 쪽, 마지막에 틀렸으면(어느 모드든) 오답
function bookView() {
  const o = otherProgress().stats;
  return id => {
    const a = stats[id], b = o[id] && !o[id].del ? normalizeStat(o[id]) : null;
    return {
      seen: !!(a || b),
      w: ((a && a.w) || 0) + ((b && b.w) || 0),
      st: Math.max((a && a.st) || 0, (b && b.st) || 0),
      wrong: isWrongRaw(a) || isWrongRaw(b),
    };
  };
}

const HL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';

function markBtn(id, onChange) {
  const b = el('button', 'mark-btn' + (isUnknown(id) ? ' on' : ''));
  b.innerHTML = HL_ICON;
  b.setAttribute('aria-label', '형광펜');
  b.setAttribute('aria-pressed', isUnknown(id));
  b.addEventListener('click', e => {
    e.stopPropagation();
    const on = toggleUnknown(id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    const item = b.closest('.item');
    if (item) item.classList.toggle('hl', on);
    if (onChange) onChange(on);
  });
  return b;
}

function wordItem(w, view = bookView(), onMark) {
  const s = view(w.id);
  const { syn, ant, rest } = synAnt(w.extras);
  const item = el('div', 'item' + (isUnknown(w.id) ? ' hl' : ''));
  const head = el('div', 'item-head');
  const main = el('div', 'item-main');
  const top = el('div');
  top.appendChild(el('span', 'w', w.word));
  if (s.w) top.append(' ', el('span', 'badge-wrong', `✕${s.w}`));
  main.append(top, el('div', 'm', [w.pos, w.meaning].filter(Boolean).join(' ')));
  // 유의어(초록) · 반의어(빨강)
  if (syn || ant) {
    const rel = el('div', 'rel');
    if (syn) { const x = el('span', 'syn'); x.append(el('b', null, '유'), syn); rel.appendChild(x); }
    if (ant) { const x = el('span', 'ant'); x.append(el('b', null, '반'), ant); rel.appendChild(x); }
    main.appendChild(rel);
  }
  const dots = el('div', 'dots');
  for (let i = 1; i <= maxStage(); i++) dots.appendChild(el('i', s.st >= i ? 'on' : ''));
  main.appendChild(dots);
  head.append(main, markBtn(w.id, onMark), speakBtn(w.word));
  item.appendChild(head);
  item.addEventListener('click', () => {
    if (!ui.bookOpened) { ui.bookOpened = true; save(UI_KEY, ui); const tip = $('#list-tip'); if (tip) tip.hidden = true; }
    if (item.classList.toggle('open')) {
      const det = el('div', 'detail');
      [[w.ex1, w.ex1ko], [w.ex2, w.ex2ko]].forEach(([en, ko], i) => {
        if (!en) return;
        const b = makeBlanks(en, w.blank, w.word);
        det.appendChild(sentenceCard(b, ko, i + 1, true, false, w, i ? w.ex2src : w.ex1src));
      });
      for (const [k, v] of rest) {
        const d = el('div', 'muted');
        d.textContent = `${k}: ${v}`;
        det.appendChild(d);
      }
      item.appendChild(det);
    } else { const d = item.querySelector('.detail'); if (d) d.remove(); }
  });
  return item;
}

// 그 DAY 단어들의 학습 기록(이 모드)을 지움. 동기화돼도 되살아나지 않게 지운 표시를 남김. 형광펜은 그대로
// 그 DAY에 기록이 있는지 (예문·단어 모드 어느 쪽이든)
function dayHasRecords(d) {
  const o = otherProgress().stats;
  return words.some(w => w.day === d && (stats[w.id] || (o[w.id] && !o[w.id].del)));
}
// 그 DAY 단어들의 학습 기록을 예문·단어 두 모드 모두 지움. 동기화돼도 되살아나지 않게 지운 표시를 남김. 형광펜은 그대로
async function deleteDayRecords(d) {
  const dw = words.filter(w => w.day === d);
  const o = otherProgress().stats;
  const mine = dw.filter(w => stats[w.id]).map(w => w.id);
  const theirs = dw.filter(w => o[w.id] && !o[w.id].del).map(w => w.id);
  const n = new Set([...mine, ...theirs]).size;
  if (!n) { toast(`DAY ${d}에는 지울 기록이 없어요`); return; }
  if (!(await ask({
    title: `DAY ${d} 기록을 지울까요?`,
    body: `예문·단어 모드에서 DAY ${d} 단어 ${n}개의 학습 기록(맞힌·틀린 횟수, 복습 일정)이 지워져요.` + (sync.enabled ? ' 동기화된 다른 기기에서도 지워져요.' : '') + '\n형광펜 표시는 그대로예요. 지운 기록은 되돌릴 수 없어요.',
    ok: '지우기', danger: true,
  }))) return;
  const now = Date.now();
  for (const id of mine) { delete stats[id]; tombs[id] = { del: 1, s: now }; }
  saveStats();
  if (theirs.length) {
    const os = load(OTHER_P + 'stats.v1', {});
    for (const id of theirs) os[id] = { del: 1, s: now };
    save(OTHER_P + 'stats.v1', os);
  }
  // 오늘의 복습 목록에서도 빼기
  const day = loadDay();
  if (Array.isArray(day.review)) { day.review = day.review.filter(id => !mine.includes(id)); save(KEY.day, day); }
  sync.soon();
  if (current === 'list') renderList(); else renderHome();
  toast(`DAY ${d} 기록을 지웠어요`);
}

// 단어장에서 볼 DAY (여러 개 고르기). 정규 학습 범위와 따로, 처음엔 학습 범위
function bookDays() {
  if (bookOnly != null && days.includes(bookOnly)) return new Set([bookOnly]);
  const saved = (settings.bookDays || []).filter(d => days.includes(d));
  if (saved.length || settings.bookDays) return new Set(saved);
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  return new Set(days.filter(d => d >= from && d <= to));
}
const bookWords = () => { const sel = bookDays(); return words.filter(w => sel.has(w.day)); };
function setBookDays(set) {
  bookOnly = null;
  settings.bookDays = days.filter(d => set.has(d));
  saveSettings();
  renderList();
}

function renderBookDays(scrollToSel) {
  const box = $('#book-days');
  const sel = bookDays();
  const keep = box.scrollLeft;
  box.innerHTML = '';
  const all = el('button', 'dp all' + (sel.size === days.length ? ' on' : ''), '전체');
  all.addEventListener('click', () => setBookDays(sel.size === days.length ? new Set() : new Set(days)));
  box.appendChild(all);
  for (const d of days) {
    const b = el('button', 'dp' + (sel.has(d) ? ' on' : ''), String(d));
    b.setAttribute('aria-label', `DAY ${d}`);
    // 전부 켜져 있을 때 하나를 누르면 그 DAY만 (하나만 보려고 나머지를 다 끌 필요 없게). 그 밖엔 켜고 끄기
    b.addEventListener('click', () => {
      if (sel.size === days.length && days.length > 1) { setBookDays(new Set([d])); return; }
      const n = new Set(sel); n.has(d) ? n.delete(d) : n.add(d); setBookDays(n);
    });
    box.appendChild(b);
  }
  if (scrollToSel) {
    const first = box.querySelector('.dp.on:not(.all)');
    box.scrollLeft = first ? Math.max(0, first.offsetLeft - box.offsetLeft - 60) : 0;
  } else box.scrollLeft = keep;
}

// 단어장 목록은 길어서(1000단어) 처음 몇 십 개만 바로 그리고 나머지는 화면이 멈추지 않게 조금씩 이어 그림
let listRun = 0;
const LIST_FIRST = 30, LIST_STEP = 60;
function renderList(scrollToSel) {
  renderBookDays(scrollToSel);
  setSeg('#seg-filter', listFilter);
  $('#list-tip').hidden = !!ui.bookOpened; // '누르면 펼쳐져요' 안내는 한 번 펼쳐 보면 그만
  const run = ++listRun; // 다시 그리기 시작하면 앞에서 이어 그리던 건 그만
  const box = $('#word-list');
  box.innerHTML = '';
  const view = bookView();
  const bw = bookWords();
  const qy = bookQuery.trim().toLowerCase();
  const hit = w => w.word.toLowerCase().includes(qy) || w.meaning.toLowerCase().includes(qy) || w.extras.some(([, v]) => String(v).toLowerCase().includes(qy));
  $('#book-days').classList.toggle('dim', !!qy);
  const filtered = (qy ? words.filter(hit) : bw).filter(w => {
    const s = view(w.id);
    if (listFilter === 'wrong') return s.wrong;
    if (listFilter === 'new') return !s.seen;
    if (listFilter === 'done') return s.st >= maxStage();
    if (listFilter === 'unknown') return isUnknown(w.id);
    return true;
  });
  if (qy && !filtered.length) box.appendChild(el('div', 'card center muted', `'${bookQuery.trim()}'에 맞는 단어가 없어요`));
  else if (qy) { /* 검색 결과 */ }
  else if (!bw.length) box.appendChild(el('div', 'card center muted', '위에서 볼 DAY를 골라 주세요'));
  else if (!filtered.length) box.appendChild(el('div', 'card center muted', listFilter === 'unknown' ? '단어 옆 형광펜을 누르면 여기 모여요' : '해당하는 단어가 없어요'));
  const acts = $('#day-acts');
  acts.hidden = bookOnly == null;
  if (bookOnly != null) {
    $('#btn-day-study').textContent = `DAY ${bookOnly} 학습`;
    $('#btn-day-syn').disabled = !bw.some(hasSynAnt);
  }
  const updateTest = () => {
    const n = bw.filter(w => isUnknown(w.id)).length;
    const b = $('#btn-unknown-test');
    // 형광펜 친 단어가 없으면 버튼을 숨겨 목록 자리를 넓힘 (형광펜 탭에서는 안내로 남김)
    b.hidden = !n && listFilter !== 'unknown';
    b.disabled = !n;
    b.textContent = n ? `형광펜 친 단어만 테스트 (${n})` : '형광펜 친 단어가 없어요';
    b.closest('.sticky-bottom').hidden = b.hidden && acts.hidden;
  };
  // DAY마다 제목(단어 수)으로 나눠서. 기록이 있는 DAY에만 '기록 지우기'
  const count = {};
  for (const w of filtered) count[w.day] = (count[w.day] || 0) + 1;
  const hasRec = new Set(words.filter(w => view(w.id).seen).map(w => w.day));
  let lastDay = null;
  const add = w => {
    if (w.day !== lastDay) {
      const h = el('div', 'day-head');
      h.append(el('b', null, `DAY ${w.day}`), el('span', null, `${count[w.day]}단어`));
      const d = w.day;
      if (hasRec.has(d)) {
        const del = el('button', 'day-del', '기록 지우기');
        del.addEventListener('click', () => deleteDayRecords(d));
        h.appendChild(del);
      }
      box.appendChild(h);
      lastDay = w.day;
    }
    box.appendChild(wordItem(w, view, updateTest));
  };
  let i = 0;
  const step = n => {
    if (run !== listRun) return;
    for (const end = Math.min(filtered.length, i + n); i < end; i++) add(filtered[i]);
    if (i < filtered.length) setTimeout(() => step(LIST_STEP), 0);
  };
  step(LIST_FIRST);
  updateTest();
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

// 설정의 복습 방식 카드: 켜기, 목표일·시험일, 기억 유지 그래프, 복습 주기, 오늘의 복습 개수
const PRESET_LABEL = { xs: '매우 짧게', s: '짧게', m: '보통', l: '길게', xl: '매우 길게' };
function renderSrs() {
  ensureCoachPlan();
  const g = settings.goal, ex = settings.exam;
  $('#goal-date').value = g || '';
  $('#srs-exam-date').value = ex || '';
  $('#opt-srs').checked = !!settings.srs;
  // 단어 코치가 켜져 있으면 목표일은 코치가 정하니 직접 정하는 칸(주기 복습 스위치·목표일)은 숨김
  const coach = !!settings.coach;
  $('#opt-coach').checked = coach;
  $('#srs-manual').hidden = coach;
  $('#goal-label').hidden = coach;
  const cp = $('#coach-plan');
  cp.hidden = !coach;
  // 코치 캐릭터: 눌러서 언제든 바꿈
  const cc = $('#coach-chars');
  $('#coach-chars-label').hidden = cc.hidden = !coach;
  cc.innerHTML = '';
  if (coach) for (const c of Object.keys(COACH_ART)) {
    const b = el('button', 'coach-choice' + (c === coachChar() ? ' on' : ''));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', c === coachChar());
    b.innerHTML = coachSvg('normal', c);
    b.appendChild(el('span', null, COACH_NAMES[c]));
    b.addEventListener('click', () => setCoachChar(c));
    cc.appendChild(b);
  }
  $('#btn-coach-replan').hidden = !coachActive();
  $('#btn-coach-talk').hidden = !coachActive() || dateStr() >= settings.coachGoal || !leftNew();
  if (coach) {
    const today = dateStr();
    if (!ex) cp.textContent = '아래에 시험일을 정하면 코치가 목표일과 하루 새 단어 수를 정해 줘요.';
    else if (ex <= today) cp.textContent = '시험일이 지났어요. 다음 시험일을 정하면 일정을 다시 짜요. 그때까지는 기본 방식으로 해요.';
    else {
      const gd = settings.coachGoal, rd = daysBetween(gd, ex);
      cp.textContent = today >= gd ? `새 단어는 끝났어요. 시험 전날까지 ${daysBetween(today, ex)}일 동안 범위 전체를 나눠 복습해요.`
        : `시험까지 ${daysBetween(today, ex)}일 · 새 단어는 ${fmtDay(lastLearnDay())}까지(오늘 ${todayNewTarget()}개) · ` + (rd > 0 ? `마지막 ${rd === 1 ? '하루' : `${rd}일`}는 범위 전체 복습`.replace('일는', '일은') : '시험 전날까지 새 단어')
          + (settings.coachReview ? ' (복습 날 수는 직접 정함)' : '');
    }
  }
  const warn = $('#srs-warn');
  const msg = coach || !settings.srs ? ''
    : !g || !ex ? '목표일과 시험일을 둘 다 정해야 주기 복습이 켜져요. 그 전까지는 기본 방식으로 해요.'
      : g >= ex ? '목표일은 시험일보다 앞이어야 해요.' : '';
  warn.hidden = !msg;
  warn.textContent = msg;
  const on = coach ? coachActive() : settings.srs;
  $('#srs-opts').hidden = !on;
  if (!on) return;
  // 복습 주기 목록
  const box = $('#srs-presets');
  box.innerHTML = '';
  for (const k of Object.keys(PRESETS)) {
    const b = el('button', 'preset' + (settings.srsPreset === k ? ' on' : ''));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', settings.srsPreset === k);
    b.append(el('span', 'p-name', PRESET_LABEL[k]), el('span', 'p-days', PRESETS[k].join(' · ') + '일'));
    if (k === 'm') b.appendChild(el('span', 'p-tag', '추천'));
    b.appendChild(el('i', 'p-radio'));
    b.addEventListener('click', () => { settings.srsPreset = k; settings.prefsAt = Date.now(); saveSettings(); sync.soon(); renderSrs(); });
    box.appendChild(b);
  }
  renderSrsGraph(PRESETS[settings.srsPreset] || PRESETS.m);
  setSeg('#seg-limit', settings.reviewLimit ? '1' : '0');
  $('#limit-n').textContent = `${settings.reviewSize}개까지`;
}

// 기억 유지 그래프 (0~30일): 고른 주기대로 복습했을 때(초록) / 안 했을 때(회색). 간단한 망각 곡선 모형
function renderSrsGraph(iv) {
  const W = 320, H = 170, L = 34, R = 14, T = 22, B = 24;
  const x = d => L + (d / 30) * (W - L - R), y = v => T + (1 - v) * (H - T - B);
  const c = retentionCurve(iv, 30);
  const path = pts => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join('');
  // 복습 순간은 떨어진 값 → 100%로 수직선
  const seq = [];
  let j = 0;
  for (const [d, v] of c.pts) {
    while (j < c.reviews.length && c.reviews[j] <= d + 1e-9) { seq.push([c.reviews[j], c.before[j][1]], [c.reviews[j], 1]); j++; }
    if (!c.reviews.some(r => Math.abs(r - d) < 1e-9)) seq.push([d, v]);
  }
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="기억 유지 그래프">`;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) svg += `<line class="g-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="g-ax" x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${v * 100}%</text>`;
  for (const d of [0, 7, 14, 21, 30]) svg += `<text class="g-ax" x="${x(d)}" y="${H - 6}" text-anchor="${d === 30 ? 'end' : 'middle'}">${d}일</text>`;
  svg += `<path class="g-none" d="${path(c.none)}"/><path class="g-rev" d="${path([[0, 1], ...seq])}"/>`;
  svg += `<circle class="g-dot" cx="${x(0)}" cy="${y(1)}" r="3"/>` + c.reviews.map(r => `<circle class="g-dot" cx="${x(r)}" cy="${y(1)}" r="3"/>`).join('');
  svg += `<g class="g-leg"><circle class="g-dot" cx="${W - 150}" cy="10" r="3.5"/><text x="${W - 143}" y="13.5">복습 했을 때</text><circle class="g-off" cx="${W - 70}" cy="10" r="3.5"/><text x="${W - 63}" y="13.5">안 했을 때</text></g>`;
  $('#srs-graph').innerHTML = svg + '</svg>';
}

function renderSettings() {
  renderVersion();
  renderSrs();
  setSeg('#seg-accent', settings.accent);
  $('#rate').value = settings.rate;
  $('#rate-val').textContent = `${settings.rate}x`;
  $('#opt-autospeak').checked = settings.autoSpeak;
  $('#opt-meaning').checked = settings.showMeaning;
  $('#opt-appkb').checked = settings.appKeyboard;
  $('#opt-simplehome').checked = ui.simpleHome;
  setSeg('#seg-base', settings.baseAccept);
  setSeg('#seg-layout', ui.choiceLayout);
  setSeg('#seg-strict', settings.strict);
  $('#strict-desc').textContent = STRICT_DESC[settings.strict] || '';
  renderAiStatus();
  $('#data-info').textContent = `단어 ${words.length}개 · DAY ${days.length ? days[0] : '-'}~${days.length ? days[days.length - 1] : '-'}\n${dataInfo}`;
  $('#data-info').style.whiteSpace = 'pre-line';
}

function renderAiStatus() {
  const sw = aiSwitch(), key = aiHasKey();
  $('#opt-ai').checked = sw;
  $('#ai-box').hidden = !sw;
  $('#ai-off').hidden = key;
  $('#ai-on').hidden = !key;
  if (key) $('#ai-info').textContent = navigator.onLine === false ? `AI 연결됨 · 지금은 오프라인이라 ${WORD ? '규칙대로 채점해요' : '기본 말풍선만 보여요'}`
    : WORD ? 'AI 연결됨 · 규칙 채점에서 오답이 나오면 AI가 다시 확인해요' : 'AI 연결됨 · 직접 입력에서 틀리면 AI가 왜 안 맞는지 말풍선으로 알려줘요';
}

// 백업 파일 하나에 예문·단어 두 모드의 진도·학습 설정과 형광펜을 모두 담음 (예전 파일은 한 모드만 들어 있음)
function exportProgress() {
  const mine = { stats: allStats(), settings };
  const other = { stats: load(OTHER_P + 'stats.v1', {}), settings: load(OTHER_P + 'settings.v1', {}) };
  const data = JSON.stringify({ app: 'voca-all', v: 2, at: new Date().toISOString(), ex: WORD ? other : mine, word: WORD ? mine : other, marks }, null, 0);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voca-backup-${dateStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// 백업 파일에 든 모드별 묶음 { ex?, word? }. 새 형식(두 모드)과 예전 형식(한 모드) 모두 읽음
function backupParts(data) {
  const okPart = p => p && p.stats && typeof p.stats === 'object' && !Array.isArray(p.stats);
  const parts = {};
  if (data && data.app === 'voca-all') { for (const m of ['ex', 'word']) if (okPart(data[m])) parts[m] = data[m]; }
  else if (okPart(data)) parts[data.app === 'voca-word' ? 'word' : 'ex'] = { stats: data.stats, settings: data.settings };
  return parts;
}

async function importProgress(file) {
  try {
    const data = JSON.parse(await file.text());
    const parts = backupParts(data);
    const modes = Object.keys(parts);
    if (!modes.length) throw new Error();
    const name = m => (m === 'word' ? '단어' : '예문');
    const count = m => Object.values(parts[m].stats).filter(v => v && !v.del).length;
    const missing = ['ex', 'word'].filter(m => !parts[m]);
    if (!(await ask({
      title: '백업으로 덮어쓸까요?',
      body: `${modes.map(m => `${name(m)} 모드 ${count(m)}단어`).join(' · ')}의 진도와 학습 설정이 백업 파일의 것으로 바뀌어요.`
        + (missing.length ? `\n이 파일에는 ${name(missing[0])} 모드 진도가 없어서 그쪽은 그대로 둬요.` : '')
        + (sync.enabled ? '\n동기화된 다른 기기의 진도도 백업의 것으로 바뀌어요.' : ''),
      ok: '덮어쓰기', danger: true,
    }))) return;
    const now = Date.now();
    // 동기화 중이면 '초기화한 시각'과 기록 시각을 지금으로 맞춰서, 합칠 때 다른 기기의 기록이 아니라 백업이 남게 함
    // (그냥 두면 더 최근 기록과 섞이고, 초기화한 뒤 불러온 백업은 초기화 전 기록이라 다시 지워짐)
    const stamp = sync.enabled;
    const norm = st => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v && v.del ? v : normalizeStat(v)])
      .filter(([, v]) => v).map(([k, v]) => [k, stamp ? { ...v, s: now } : v]));
    // 되돌린 설정이 동기화에서 예전 것으로 밀리지 않게 바꾼 시각을 지금으로
    const prefs = st => (st && typeof st === 'object' ? { ...st, prefsAt: now, examAt: now } : null);
    const mineKey = WORD ? 'word' : 'ex';
    for (const m of modes) {
      const p = parts[m];
      if (m === mineKey) {
        setAllStats(norm(p.stats));
        saveStats();
        if (stamp) { resetAt = now; save(KEY.resetAt, resetAt); }
        if (prefs(p.settings)) { Object.assign(settings, prefs(p.settings)); saveSettings(); }
        localStorage.removeItem(KEY.session); // 하던 학습은 예전 진도 기준이라 지움
      } else {
        save(OTHER_P + 'stats.v1', norm(p.stats));
        if (stamp) save(OTHER_P + 'resetAt.v1', now);
        if (prefs(p.settings)) save(OTHER_P + 'settings.v1', { ...load(OTHER_P + 'settings.v1', {}), ...prefs(p.settings) });
        localStorage.removeItem(OTHER_P + 'session.v1');
      }
    }
    if (data.marks && typeof data.marks === 'object') { marks = mergeMarks(marks, data.marks); save(KEY.marks, marks); }
    sync.now();
    toast(`${modes.map(name).join('·')} 모드 진도를 불러왔어요`);
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
  await applyHighlights();
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
  migrateOldWordMode();
  fillDaySelects();
  if (fromLocal) { settings.from = days[0]; settings.to = days[days.length - 1]; }
  renderHome();
}

// 지난 날짜를 시험일로 고르면 알려 주고 원래 값으로
function examOk(input) {
  if (!input.value || input.value >= dateStr()) return true;
  toast('지난 날짜는 시험일로 정할 수 없어요');
  input.value = settings.exam || '';
  return false;
}

function bind() {
  $('#day-from').addEventListener('change', e => setRange(+e.target.value, settings.to));
  $('#day-to').addEventListener('change', e => setRange(settings.from, +e.target.value));
  $('#range-chips').addEventListener('click', e => {
    const cb = e.target.closest('button');
    const r = cb && cb.dataset.range;
    const last = days[days.length - 1];
    if (r === 'last') setRange(last, last);
    if (r === 'last3') setRange(days[Math.max(0, days.length - 3)], last);
    if (r === 'all') setRange(days[0], last);
  });
  onSeg('#seg-kind', v => { settings.kind = v; saveSettings(); });
  onSeg('#seg-layout', v => { ui.choiceLayout = v; save(UI_KEY, ui); });
  // 설정 바로가기: 그 카드로 스크롤
  $('#set-nav').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) document.getElementById(b.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btn-set-plan').addEventListener('click', () => { if (ui.simpleHome) { renderHome(); planFrom = 'settings'; show('plan', false); } else goHome(); });
  onSeg('#seg-ko', v => { settings.showKo = v === 'show'; saveSettings(); renderHome(); });
  onSeg('#seg-new', v => { settings.newPerDay = +v; settings.prefsAt = Date.now(); saveSettings(); renderPlan(); sync.soon(); });
  onSeg('#seg-rev', v => { settings.reviewSize = +v; settings.prefsAt = Date.now(); saveSettings(); renderPlan(); sync.soon(); });
  // 학습 › 복습 › 더 하기를 눌러 그 단계로
  $('#today-flow').addEventListener('click', e => {
    const sp = e.target.closest('span[data-s]');
    if (!sp) return;
    if (sp.classList.contains('link')) { viewStage = sp.dataset.s; renderPlan(); }
    else if (!sp.classList.contains('on')) toast('오늘의 학습과 복습을 끝내면 열려요');
  });
  const setExam = v => { settings.exam = v; settings.examAt = Date.now(); saveSettings(); shareExam(v, settings.examAt); if (coachActive()) planCoach(true); coachMoved = false; renderHome(); sync.soon(); };
  $('#exam-date').addEventListener('change', e => { if (examOk(e.target)) setExam(e.target.value); });
  $('#btn-exam-clear').addEventListener('click', () => { $('#exam-date').value = ''; setExam(''); });
  $('#btn-start').addEventListener('click', () => startSession('today'));
  $('#btn-review').addEventListener('click', () => startSession('review'));
  $('#btn-day').addEventListener('click', () => startSession('day'));
  $('#btn-solo-close').addEventListener('click', () => { soloDay = null; renderHome(); });
  $('#btn-day-reset').addEventListener('click', () => { if (soloDay != null) deleteDayRecords(soloDay); });
  $('#btn-unknown-test').addEventListener('click', () => startSession('unknown'));
  $('#btn-extra-new').addEventListener('click', () => startSession('extraNew'));
  $('#btn-extra-review').addEventListener('click', () => startSession('extraReview'));
  onSeg('#seg-extra', v => { settings.extraN = +v; saveSettings(); renderPlan(); });
  // 슬라이더: 5개 단위로 5~100개
  $('#extra-range').addEventListener('input', e => { settings.extraN = +e.target.value; saveSettings(); renderPlan(); });
  $('#btn-wrong').addEventListener('click', () => startSession('wrong'));
  $('#btn-order').addEventListener('click', startOrder);
  $('#btn-resume').addEventListener('click', resumeSession);
  $('#btn-resume-drop').addEventListener('click', async () => {
    if (!(await ask({ title: '정말 지울까요?', body: '이어하던 학습 기록이 지워져요.\n지운 기록은 되돌릴 수 없어요.', ok: '지우기', danger: true }))) return;
    localStorage.removeItem(KEY.session);
    renderHome();
    toast('지웠어요');
  });
  $('#btn-list').addEventListener('click', () => { bookOnly = null; listFilter = 'all'; bookQuery = ''; $('#book-search').value = ''; show('list'); renderList(true); });
  // 검색: 글자를 칠 때마다 다시 그리지 않고 잠깐 멈추면 한 번
  let searchT = null;
  $('#book-search').addEventListener('input', e => {
    bookQuery = e.target.value;
    clearTimeout(searchT);
    searchT = setTimeout(() => renderList(), 140);
  });
  $('#btn-day-syn').addEventListener('click', () => { if (bookOnly != null) startSynSession(bookOnly); });
  $('#btn-day-study').addEventListener('click', () => { if (bookOnly != null) startDayStudy(bookOnly); });
  $('#btn-list-back').addEventListener('click', () => goHome());
  $('#plan-sum-card').addEventListener('click', () => { planFrom = null; show('plan'); });
  $('#btn-plan-back').addEventListener('click', () => {
    if (planFrom === 'settings' && history.state && history.state.s === 'settings') { planFrom = null; renderSettings(); renderSyncStatus(); show('settings', false); }
    else goHome();
  });
  onSeg('#seg-filter', v => { listFilter = v; renderList(); });

  $('#btn-quit').addEventListener('click', quitQuiz);
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-idk').addEventListener('click', giveUp);
  $('#fb-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setFbTab(b.dataset.t); });
  $('#btn-next').addEventListener('click', next);
  $('#btn-res-home').addEventListener('click', () => goHome());

  $('#btn-settings').addEventListener('click', () => { renderSettings(); renderSyncStatus(); show('settings'); });
  $('#btn-settings-back').addEventListener('click', () => goHome());
  onSeg('#seg-accent', v => { settings.accent = v; saveSettings(); });
  onSeg('#seg-strict', v => { settings.strict = v; saveSettings(); $('#strict-desc').textContent = STRICT_DESC[v] || ''; });
  $('#rate').addEventListener('input', e => { settings.rate = +e.target.value; $('#rate-val').textContent = `${settings.rate}x`; saveSettings(); });
  $('#opt-autospeak').addEventListener('change', e => { settings.autoSpeak = e.target.checked; saveSettings(); });
  $('#opt-meaning').addEventListener('change', e => { settings.showMeaning = e.target.checked; saveSettings(); });
  $('#opt-appkb').addEventListener('change', e => { settings.appKeyboard = e.target.checked; saveSettings(); });
  $('#opt-simplehome').addEventListener('change', e => { ui.simpleHome = e.target.checked; save(UI_KEY, ui); applyHomeLayout(); });
  onSeg('#seg-base', v => { settings.baseAccept = v; saveSettings(); });
  $('#btn-test-voice').addEventListener('click', () => {
    speak('I tried to convince him of the danger.');
    if (window.speechSynthesis && !pickVoice()) toast('이 기기에서 영어 음성을 찾지 못했어요. 기기 설정의 음성(TTS)을 확인해 주세요', 3500);
  });
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
  $('#opt-ai').addEventListener('change', e => { setAiSwitch(e.target.checked); renderAiStatus(); });
  $('#btn-ai-connect').addEventListener('click', async () => {
    const key = $('#ai-key').value.trim();
    if (!key) { toast('API 키를 붙여넣어 주세요'); return; }
    const btn = $('#btn-ai-connect');
    btn.disabled = true;
    btn.textContent = '확인 중…';
    try {
      await aiConnect(key);
      $('#ai-key').value = '';
      toast(`AI 재확인을 켰어요`);
    } catch (e) {
      toast(e.status === 404 ? '지금 쓸 수 있는 무료 모델을 찾지 못했어요' : e.status === 401 || e.status === 403 ? 'API 키가 맞지 않아요. gsk_로 시작하는 키를 다시 복사해서 붙여넣어 주세요' : '확인하지 못했어요. 인터넷과 API 키를 확인해 주세요', 3500);
    }
    btn.disabled = false;
    btn.textContent = '연결';
    renderAiStatus();
  });
  $('#btn-ai-off').addEventListener('click', async () => {
    if (!(await ask({ title: 'AI 재확인 연결을 끊을까요?', body: '이 기기에서 API 키를 지우고 규칙대로 채점해요.', ok: '연결 끊기' }))) return;
    aiDisconnect();
    renderAiStatus();
  });
  $('#btn-sync-now').addEventListener('click', async () => { await sync.now(); toast(sync.status === 'ok' ? '동기화했어요' : sync.error); });
  $('#btn-sync-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(sync.token); toast('토큰을 복사했어요. 다른 기기의 설정에 붙여넣으세요'); }
    catch { prompt('이 토큰을 복사하세요', sync.token); }
  });
  $('#btn-sync-off').addEventListener('click', async () => {
    if (!(await ask({ title: '동기화 연결을 끊을까요?', body: '진도는 이 기기에 그대로 남아요.', ok: '연결 끊기' }))) return;
    sync.disconnect();
    renderSyncStatus();
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ''; });
  $('#btn-reset').addEventListener('click', async () => {
    if (!(await ask({
      title: `${WORD ? '단어' : '예문'} 모드 진도를 모두 지울까요?`,
      body: `${WORD ? '예문' : '단어'} 모드 진도와 형광펜은 그대로 남아요.\n` + (sync.enabled ? '동기화된 다른 기기에서도 함께 지워져요.\n' : '') + '지운 진도는 되돌릴 수 없어요.',
      ok: '지우기', danger: true,
    }))) return;
    stats = {}; tombs = {};
    resetAt = Date.now(); // 다른 기기의 예전 기록도 함께 지워지게
    save(KEY.resetAt, resetAt);
    saveStats();
    sync.now();
    localStorage.removeItem(KEY.session);
    toast(`${WORD ? '단어' : '예문'} 모드 진도를 초기화했어요`);
  });
  $('#btn-reload').addEventListener('click', async () => {
    await loadData();
    boot();
    renderSettings();
    toast(`단어 ${words.length}개 · DAY ${days[0]}~${days[days.length - 1]}`);
  });
  $('#btn-local-csv').addEventListener('click', () => $('#csv-file').click());
  // 복습 방식 (주기 복습)
  const srsChanged = () => { settings.prefsAt = Date.now(); saveSettings(); sync.soon(); renderSrs(); };
  $('#opt-srs').addEventListener('change', e => { settings.srs = e.target.checked; srsChanged(); });
  $('#goal-date').addEventListener('change', e => { settings.goal = e.target.value; srsChanged(); });
  $('#srs-exam-date').addEventListener('change', e => { if (!examOk(e.target)) return; settings.exam = e.target.value; settings.examAt = Date.now(); shareExam(settings.exam, settings.examAt); if (coachActive()) planCoach(true); coachMoved = false; srsChanged(); });
  // 단어 코치: 설정과 학습 계획 화면의 스위치, 일정 다시 짜기, 캐릭터를 누르면 폴짝
  $('#opt-coach').addEventListener('change', e => toggleCoach(e.target.checked));
  $('#opt-coach-plan').addEventListener('change', e => toggleCoach(e.target.checked));
  $('#btn-coach-talk').addEventListener('click', () => talkCoach());
  $('#btn-coach-replan').addEventListener('click', () => { if (planCoach(true)) { coachMoved = false; renderSrs(); toast('남은 날에 맞춰 일정을 다시 짰어요'); } });
  $('#buddy-char').addEventListener('click', e => { const c = e.currentTarget; c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop'); });
  onSeg('#seg-limit', v => { settings.reviewLimit = +v; srsChanged(); });
  $('#btn-update').addEventListener('click', async () => {
    try {
      const v = await latestVersion();
      if (v && v !== APP_VERSION) { location.reload(); return; }
      toast('최신 버전이에요');
      renderVersion();
    } catch { toast('인터넷 연결을 확인해 주세요'); }
  });
  $('#csv-file').addEventListener('change', e => { if (e.target.files.length) importLocalCSV([...e.target.files]); e.target.value = ''; });

  // 컴퓨터 키보드: Shift만 눌렀다 떼면 힌트 (대문자 치려고 Shift+글자를 누른 건 힌트 아님)
  let shiftAlone = false;
  document.addEventListener('keydown', e => { shiftAlone = e.key === 'Shift' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey; }, true);
  document.addEventListener('keyup', e => {
    if (e.key !== 'Shift' || !shiftAlone) return;
    shiftAlone = false;
    if (current === 'quiz' && $('#feedback').hidden && q && !q.answered) useHint();
  });
  document.addEventListener('pointerdown', () => { shiftAlone = false; }, true);

  // 키보드 (PC에서 테스트할 때)
  document.addEventListener('keydown', e => {
    if (current !== 'quiz') return;
    if (!$('#feedback').hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); return; }
    // 4지선다: 숫자는 보기를 고르기만 하고 Enter로 채점 (마우스로 누르면 바로 채점)
    if (e.key === 'Enter' && !(q && q.answered) && !e.isComposing) {
      const p = $('#q-actions').querySelector('.choice.picked:not(:disabled)');
      if (p) { e.preventDefault(); p.click(); return; }
    }
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); quitQuiz(); return; }
    if (kb && !(q && q.answered) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // 한글 자판 상태(e.key가 'Process'나 한글)여도 누른 자리(e.code)의 영문자로 받음
      const byCode = /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : e.code === 'Space' ? ' ' : e.code === 'Quote' ? "'" : e.code === 'Minus' ? '-' : '';
      const ch = /^[a-zA-Z' -]$/.test(e.key) ? e.key.toLowerCase() : e.key.length !== 1 || e.key.charCodeAt(0) > 127 ? byCode : '';
      if (e.key === 'Enter') kb.submit();
      else if (e.key === 'Backspace') kb.type('back');
      else if (ch) kb.type(ch);
      else return;
      e.preventDefault();
      return;
    }
    if ((settings.kind === 'choice' || (q && q.syn)) && /^[1-4]$/.test(e.key) && !(q && q.answered)) {
      const c = $('#q-actions').querySelectorAll('.choice')[+e.key - 1];
      if (c && !c.disabled) {
        e.preventDefault();
        $('#q-actions').querySelectorAll('.choice.picked').forEach(x => x.classList.remove('picked'));
        c.classList.add('picked');
        c.scrollIntoView({ block: 'nearest' });
      }
    }
  });
}

bind();
window.__vocaStarted = true;
// 저장해 둔 단어로 바로 화면을 띄우고(모드 전환이 빠르게), 서버 확인은 뒤에서.
// 서버 CSV가 바뀌었을 때만 다시 그림. 처음 여는 기기면 서버에서 받을 때까지 기다림.
const quickTexts = cachedCSVTexts();
if (quickTexts.length) {
  setWords(rowsToWords(quickTexts));
  applyHighlightMap(load('voca.highlights.v1', {}));
  dataInfo = describeData(quickTexts, 0, []);
  boot(); renderSyncStatus(); sync.now();
}
loadData(quickTexts.length ? quickTexts : null).then(changed => {
  if (!quickTexts.length) { boot(); renderSyncStatus(); sync.now(); }
  else if (changed) boot();
}).catch(err => {
  if (!quickTexts.length) $('#load-status').textContent = '단어를 불러오지 못했어요: ' + err.message;
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { if (words.length) sync.now(); return; }
  checkUpdate();
  if (words.length) sync.now();
});

// 홈 화면 앱은 계속 켜져 있어서 새 버전이 안 보일 수 있음 → 앱을 열 때·앱으로 돌아올 때 확인
let updateReady = false;
async function latestVersion() {
  const res = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
  return res.ok ? (await res.text()).trim() : '';
}
async function checkUpdate() {
  try {
    const v = await latestVersion();
    if (v && v !== APP_VERSION) {
      // 같은 새 버전으로는 한 번만 자동 새로고침 (혹시 옛 파일이 계속 오면 무한 새로고침 방지)
      try { if (sessionStorage.getItem('voca.reloadFor') === v) return; sessionStorage.setItem('voca.reloadFor', v); } catch {}
      updateReady = true;
      if (current !== 'quiz') location.reload(); // 퀴즈 중이면 끝나고 홈으로 갈 때 새로고침
    }
  } catch {}
}
checkUpdate();

// 설정의 앱 버전: 이 폰에서 돌아가는 버전과 서버의 최신 버전
const fmtVer = v => (/^\d{12}$/.test(v) ? `${v.slice(0, 4)}.${v.slice(4, 6)}.${v.slice(6, 8)}-${v.slice(8)}` : v);
async function renderVersion() {
  $('#app-ver').textContent = fmtVer(APP_VERSION);
  const st = $('#app-ver-state');
  st.textContent = '확인 중…';
  try {
    const v = await latestVersion();
    st.textContent = !v ? '' : v === APP_VERSION ? '· 최신 버전이에요' : `· 새 버전이 있어요 (${fmtVer(v)})`;
    $('#btn-update').textContent = v && v !== APP_VERSION ? '지금 새 버전으로' : '새 버전 확인';
  } catch { st.textContent = '· 인터넷 연결을 확인해 주세요'; }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
