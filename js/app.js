import {
  rowsToWords, makeBlanks, normalizeAnswer, displayAnswer, answerParts,
  applyResult, buildPlan, pickReview, pickSrsReview, reviewPace, retentionCurve, PRESETS, normalizeStat, isDue, dateStr, daysBetween, pickDistractors, shuffle,
  highlightMeaning, nextLetterHint, typingHintTarget, blankUnit, answerWordCount, coachFeedback, makeWordFinder, addDays, gradeMeaning, pickMeaningDistractors,
  synAnt, mergeMarks, nearestKey, makeSynQuestion, hasSynAnt, shortMeaning, examAt, restAt, mergeChats, AGAIN_SLOTS, AGAIN_REC, AGAIN_OLD, AGAIN_FULL, cleanAgain, sameAgain, requeue, findMentioned, coachPlan, cleanRest, isRestDay, studyDays, questionKind,
  willGraduate, choicesFirst, GRAD_BOOK, GRAD_MY, isMyId,
} from './core.js';
import { MY_KEY, CLAUDE_PROMPT, emptyMy, myCfg, myId, keyOfId, parseMyText, matchRows, applyImport, myWordObjects, overlayHit, mergeMy, sameMy, slimMy, exportMyCSV, deleteMy, editMy, MY_PRUNE } from './mywords.js';
import { createSync } from './sync.js';
import { KEYS_KEY, KEY_ACTIONS, WHILE_ANSWERING, cleanKeys, assignKey, actionFor, keyOf, isModKey, modBase, kbTypes, isTypingKey, keyLabel } from './keys.js';
import { aiGradeMeaning, aiExplainWrong, aiAskWord, aiHint, aiCoachSay, aiCoachResult, aiCoachChat, aiCoachSummary, chatStart, aiCoachError, aiConnect, aiDisconnect, aiEnabled, aiOnline, aiCoachOnline, aiCoachName, aiName, aiSwitch, setAiSwitch, aiHasKey } from './ai.js';
import { DATA_FILES, CSV_CACHE_KEY, loadCSVTexts, cachedCSVTexts, sameTexts } from './files.js';
import { COACH_ART, COACH_COLORS, COACH_NAMES, COACH_BIO } from './coach-art.js';
import { reportRepo, reportReasons, reportText, issueUrl, pushError, REPORT_FORM, formReady, formRequest, queueReport } from './report.js';

// 앱 버전: PR에선 바꾸지 않음. 정해진 시간 머지(GitHub Actions)가 version.txt와 같이 올림. 다르면 홈 화면 앱이 스스로 새로고침
const APP_VERSION = '202611240825';

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
  bookResetAt: P + 'bookResetAt.v1', // '단어책 새로 시작'한 시각: 그 전 단어책 기록은 버림(내 단어 기록은 그대로)
};

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ---------- 아이콘: 선 굵기·모서리를 맞춘 SVG 한 벌 (이모지 대신. 기기마다 모양이 달라지지 않게) ----------
const svgIcon = body => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  speak: svgIcon('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  gear: svgIcon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  back: svgIcon('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  close: svgIcon('<path d="M18 6 6 18M6 6l12 12"/>'),
  bulb: svgIcon('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>'),
  help: svgIcon('<circle cx="12" cy="12" r="9.5"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
  edit: svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  grid: svgIcon('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  lines: svgIcon('<path d="M4 6h4M11 6h9M4 12h4M11 12h6M4 18h4M11 18h8"/>'),
  heat: svgIcon('<rect x="3.5" y="3.5" width="4" height="4" rx="1"/><rect x="10" y="3.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="16.5" y="3.5" width="4" height="4" rx="1"/><rect x="3.5" y="10" width="4" height="4" rx="1" fill="currentColor"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="16.5" y="10" width="4" height="4" rx="1" fill="currentColor"/><rect x="3.5" y="16.5" width="4" height="4" rx="1"/><rect x="10" y="16.5" width="4" height="4" rx="1" fill="currentColor"/><rect x="16.5" y="16.5" width="4" height="4" rx="1"/>'),
  down: svgIcon('<path d="m6 9 6 6 6-6"/>'),
  mark: svgIcon('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
  // 아래 탭
  tabHome: svgIcon('<path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"/>'),
  tabDays: svgIcon('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  tabBook: svgIcon('<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"/><path d="M4.5 20.5V5.5M19.5 18v3H7"/>'),
  send: svgIcon('<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5z"/>'), // 종이비행기
  memo: svgIcon('<path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M9.5 10h6M9.5 13.5h6M9.5 17h3.5"/>'),
  trash: svgIcon('<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"/>'),
  retry: svgIcon('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>'),
  plus: svgIcon('<path d="M12 5v14M5 12h14"/>'),
  tabCoach: svgIcon('<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z"/>'),
};
// 아이콘 + 글자 버튼: 글자만 바꿀 땐 setLabel (아이콘은 그대로)
const iconBtn = (cls, name, label) => { const b = el('button', cls); b.innerHTML = ICON[name] + '<span class="lbl"></span>'; b.lastChild.textContent = label; return b; };
const setLabel = (b, t) => { const s = b.querySelector('.lbl'); if (s) s.textContent = t; else b.textContent = t; };
// index.html의 data-icon 자리에 아이콘을 채움 (모듈이라 첫 화면 그리기 전에 실행됨)
document.querySelectorAll('[data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', ICON[b.dataset.icon] || ''));

// 꾸미기 설정 (js/look.js가 <head>에서 먼저 불러 둠: 밝기·색·글자 크기·홈에 보일 것 …)
const LOOK = window.VocaLook || { get: () => ({ days: 'grid', hide: [], ex: {}, word: {} }), set() {}, reset() {}, CHOICES: { accent: [] }, HIDE: [] };

const load = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

// 버그 신고에 붙일 최근 오류 (두 모드가 같이 씀, 이 기기에만)
const ERR_KEY = 'voca.errlog.v1';
const logError = m => save(ERR_KEY, pushError(load(ERR_KEY, []), m));
window.addEventListener('error', e => logError(`${e.message || e.error || '오류'}${e.filename ? ` @${String(e.filename).split('/').pop()}:${e.lineno}` : ''}`));
window.addEventListener('unhandledrejection', e => logError(`(promise) ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`));

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
  // 복습: 복습 간격 다섯 가지(srsPreset), 목표일(goal = 전체 복습을 시작하는 날. 시험일도 있으면 그날부터 시험 전날까지 범위 전체를 나눠 복습)
  srsPreset: 'm', goal: '',
  accent: 'en-US', rate: 0.9, autoSpeak: true, showKo: true, showMeaning: false, appKeyboard: true,
  baseAccept: 'pause', // 원형이 예문 형태의 앞부분일 때(outlaw → outlawed): pause = 0.8초 멈추면 정답, instant = 바로
  extraN: 20, // 추가 학습·복습 개수
  strict: 'mid', // 단어 모드 직접 입력 채점: easy | mid | hard
  // 단어 코치: 시험일에 맞춰 목표일(coachGoal)과 하루 새 단어 수를 정해 줌. coachBase = 일정을 짤 때의 하루 개수, coachKey = 그때의 시험일·범위
  // coachReview = 코치와 상의해서 정한 시험 전 전체 복습 날 수 (0 = 코치가 정함)
  // coachFix = 코치와 정한 하루 새 단어 수(0 = 고정 안 함. 고정하면 복습 날 수는 거기서 정해짐), coachTail = 남는 단어를 'last' 마지막 날에 붙임 · 'extra' 하루 더
  // coachRest = 쉬는 요일(0 일 … 6 토). 그날은 새 단어·전체 복습 몫 없이 쉼
  coach: false, coachGoal: '', coachBase: 0, coachKey: '', coachReview: 0, coachRest: [], coachFix: 0, coachTail: '',
  // 다시 나오기 (core.js AGAIN_*): 틀림·힌트 두 번·힌트 한 번마다 이번 학습에서 다시 나올 때. 두 모드가 같이 씀(againAt = 바꾼 시각)
  again: AGAIN_REC, againAt: 0,
  reviewMix: false, // 복습은 외운 단어만 4지선다 (core.js questionKind)
}, load(KEY.settings, {}));
// 잠깐 있던 문제 방식 '섞어서'(새 단어도 직접 입력) → 직접 입력 + 복습은 외운 단어만 4지선다
if (settings.kind === 'mix') Object.assign(settings, { kind: 'type', reviewMix: true });
// 화면 설정 (기기마다, 예문·단어 모드가 같이 씀)
const UI_KEY = 'voca.ui.v1';
const ui = Object.assign({
  simpleHome: true, // 홈 간단히 보기: 학습 범위·문제 방식을 '학습 계획' 화면으로. 끄면 예전처럼 홈에
  choiceLayout: DESK ? 'list' : 'grid', // 4지선다 선지 배치: grid(2×2) · list(한 줄씩)
  lean: 'mid', // 폰 4지선다 선지 쏠림: left(왼쪽 칸 넓게) · mid · right(오른쪽 칸 넓게). 한 손으로 누를 때
}, load(UI_KEY, {}));
const uiWasSaved = Object.keys(load(UI_KEY, {})).length > 0; // 이 기기에서 전에 앱을 써 봤는지 (고급 기능 처음 값)
// 학습 범위·문제 방식 카드를 홈 또는 학습 계획 화면으로 옮김 (같은 요소라 기능은 그대로)
function applyHomeLayout() {
  const range = $('#card-range'), kind = $('#card-kind'), prog = $('#range-progress'), sum = $('#plan-sum-card'), pc = $('#prog-card');
  if (ui.simpleHome) {
    $('#plan > header').after(range);
    pc.appendChild(prog);
  } else {
    $('#card-today').after(range);
    range.appendChild(prog);
  }
  range.after(kind);
  kind.after($('#regular-opts')); // 하루 분량도 문제 카드 바로 아래에 같이 다님
  sum.hidden = pc.hidden = !ui.simpleHome;
}
applyHomeLayout();
settingsRows();
let session = null;
let planFrom = null; // 학습 계획 화면을 설정에서 열었으면 ←가 설정으로
let soloDay = null; // DAY 박스를 누르면 그 DAY만 따로 학습 (정규 카드 자리에 간단히)
let dataInfo = '';

const allStats = () => ({ ...stats, ...tombs });
const saveStats = () => save(KEY.stats, allStats());
let resetAt = load(KEY.resetAt, 0);
let bookResetAt = load(KEY.bookResetAt, 0);

// ---------- 내 단어 (js/mywords.js): 노트에서 올린 단어 · 독해에서 막힌 단어책 단어. 두 모드가 같이 씀 ----------
let myStore = load(MY_KEY, null) || emptyMy();
let myWords = []; // 퀴즈·단어장에서 쓰는 내 단어 객체 (day 0, my: true). byId에도 들어감
let myVer = 0; // 내 단어가 바뀔 때마다 +1 (reviewPool 다시 계산)
const hitOf = id => { const h = myStore.hit && myStore.hit[id]; return h && !h.del ? h : null; };
// 단어책 새로 시작 뒤에 독해에서 또 막힌, 아직 안 배운 단어책 단어 → 내 단어처럼 오늘의 학습에 먼저
const hitNew = id => { const h = hitOf(id); return !!h && (h.t || 0) > bookResetAt; };
// 내 단어 몫으로 배운 단어 (단어책 하루 몫과 따로 셈)
const viaMy = id => isMyId(id) || hitNew(id);
const gradDays = id => (isMyId(id) || hitOf(id) ? GRAD_MY : GRAD_BOOK); // 내 단어·독해에서 막힌 단어는 56일, 단어책은 28일 간격에서 맞히면 졸업
const cfg = () => myCfg(myStore);
const dayTag = w => (w && w.my ? '내 단어' : `DAY ${w ? w.day : ''}`);
function applyMy() {
  myVer++;
  myWords = myWordObjects(myStore);
  for (const id of [...byId.keys()]) if (isMyId(id)) byId.delete(id);
  for (const w of myWords) byId.set(w.id, w);
  for (const w of words) overlayHit(w, hitOf(w.id));
}
function saveMy(store, { quiet = false } = {}) {
  myStore = store;
  if (!save(MY_KEY, myStore)) toast('저장 공간이 부족해요. 설정 > 연결에서 백업을 저장해 두세요', 4000);
  applyMy();
  if (!quiet) sync.soon();
}

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
const otherProgress = () => ({ resetAt: load(OTHER_P + 'resetAt.v1', 0), bookResetAt: load(OTHER_P + 'bookResetAt.v1', 0), stats: load(OTHER_P + 'stats.v1', {}) });

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
// 쉬는 요일도 두 모드가 같이 씀(코치가 하나라서). 시험일처럼 다른 모드 설정에는 쉬는 요일과 그 시각만
const myRestAt = () => restAt({ restAt: settings.restAt, at: settings.prefsAt });
function shareRest(v, at) {
  const o = load(OTHER_P + 'settings.v1', {});
  if (restAt({ restAt: o.restAt, at: o.prefsAt }) > at) return;
  o.coachRest = cleanRest(v); o.restAt = at;
  save(OTHER_P + 'settings.v1', o);
}
// 다시 나오기 설정도 두 모드가 같이 씀 (쉬는 요일처럼 바꾼 시각을 따로)
function shareAgain(v, at) {
  const o = load(OTHER_P + 'settings.v1', {});
  if ((o.againAt || 0) > at) return;
  o.again = cleanAgain(v); o.againAt = at;
  save(OTHER_P + 'settings.v1', o);
}
function setAgain(v) {
  settings.again = cleanAgain(v);
  settings.againAt = Date.now();
  saveSettings();
  shareAgain(settings.again, settings.againAt);
  sync.soon();
}
function setRest(v) {
  settings.coachRest = cleanRest(v);
  settings.restAt = Date.now();
  shareRest(settings.coachRest, settings.restAt);
}

// ---------- 기기 간 동기화 ----------
const sync = createSync({
  file: WORD ? 'voca-word-progress.json' : 'voca-progress.json',
  getLocal: () => ({ v: 2, resetAt, bookResetAt, stats: allStats(), prefs: { reviewMix: !!settings.reviewMix, exam: settings.exam, examAt: myExamAt(), newPerDay: settings.newPerDay, srs: true, srsPreset: settings.srsPreset, goal: settings.goal, from: settings.from, to: settings.to, coach: !!settings.coach, coachGoal: settings.coachGoal || '', coachBase: settings.coachBase || 0, coachKey: settings.coachKey || '', coachReview: settings.coachReview || 0, coachRest: cleanRest(settings.coachRest), restAt: myRestAt(), again: cleanAgain(settings.again), againAt: settings.againAt || 0, coachFix: settings.coachFix || 0, coachTail: settings.coachTail || '', at: settings.prefsAt || 0 }, sess: { at: load(SESS_AT, 0), data: load(KEY.session, null) } }),
  applyMerged: m => {
    setAllStats(m.stats);
    resetAt = m.resetAt;
    bookResetAt = m.bookResetAt || 0;
    saveStats();
    save(KEY.resetAt, resetAt);
    save(KEY.bookResetAt, bookResetAt);
    // 시험일은 다른 설정과 따로: 더 최근에 바꾼 쪽으로. 두 모드가 같이 쓰니 다른 모드 설정에도 적어 둠
    if (m.prefs && examAt(m.prefs) > myExamAt()) {
      Object.assign(settings, { exam: m.prefs.exam || '', examAt: examAt(m.prefs) });
      saveSettings();
      shareExam(settings.exam, settings.examAt);
    }
    // 다른 기기에서 더 최근에 하던 학습이 있으면 그걸로 (지금 이 기기에서 문제를 풀고 있으면 건드리지 않음)
    if (m.sess && (m.sess.at || 0) > load(SESS_AT, 0) && !(current === 'quiz' && session)) {
      const d = m.sess.data;
      if (d && d.queue) save(KEY.session, d); else localStorage.removeItem(KEY.session);
      save(SESS_AT, m.sess.at);
    }
    if (m.prefs && m.prefs.again && (m.prefs.againAt || 0) > (settings.againAt || 0)) {
      Object.assign(settings, { again: cleanAgain(m.prefs.again), againAt: m.prefs.againAt });
      saveSettings();
      shareAgain(settings.again, settings.againAt);
    }
    if (m.prefs && restAt(m.prefs) > myRestAt()) {
      Object.assign(settings, { coachRest: cleanRest(m.prefs.coachRest), restAt: restAt(m.prefs) });
      saveSettings();
      shareRest(settings.coachRest, settings.restAt);
    }
    if (m.prefs && (m.prefs.at || 0) > (settings.prefsAt || 0)) {
      const p = m.prefs;
      Object.assign(settings, { newPerDay: p.newPerDay || 20, prefsAt: p.at });
      // srs: true는 예전 버전 앱이 복습 주기·목표일을 받아 가게 하려고 보냄 (주기 복습 스위치는 없어짐)
      if ('srs' in p || 'srsPreset' in p) Object.assign(settings, { srsPreset: p.srsPreset || 'm', goal: p.goal || '' });
      if ('reviewMix' in p) settings.reviewMix = !!p.reviewMix;
      if ('coach' in p) Object.assign(settings, { coach: !!p.coach, coachGoal: p.coachGoal || '', coachBase: p.coachBase || 0, coachKey: p.coachKey || '', coachReview: p.coachReview || 0, coachRest: cleanRest(p.coachRest), restAt: restAt(p), coachFix: p.coachFix || 0, coachTail: p.coachTail || '' });
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
  // 고른 코치 캐릭터: 동기화(토큰)를 켰을 때만 다른 기기와 맞춰짐. 안 켰으면 이 기기에만
  coach: {
    get: () => (COACH_ART[ui.coachChar] ? { char: ui.coachChar, at: ui.coachCharAt || 0 } : null),
    set: c => {
      if (!COACH_ART[c.char]) return; // 모르는 캐릭터(새 버전에서 고른 것 등)는 그대로 둠
      ui.coachChar = c.char;
      ui.coachCharAt = c.at;
      save(UI_KEY, ui);
      if (current === 'settings') renderSrs();
      if (current === 'home') renderCoach();
    },
  },
  // 화면 꾸미기 (js/look.js): '꾸미기도 동기화·백업하기'를 끈 기기는 주고받지 않음
  look: {
    get: () => (LOOK.get().share ? LOOK.shared(LOOK.get()) : null),
    set: o => { LOOK.adopt(o); if (current === 'settings') renderLook(); if (current === 'home') renderHome(); },
    merge: (l, r) => LOOK.mergeLook(l, r),
    same: (x, y) => LOOK.sameLook(x, y),
  },
  other: { get: otherProgress, set: (st, m) => { save(OTHER_P + 'stats.v1', st); if (m) save(OTHER_P + 'bookResetAt.v1', m.bookResetAt || 0); } },
  // 내 단어 (voca-mywords.json): 단어마다 더 최근에 고친 쪽으로
  mine: {
    get: () => myStore,
    set: m => { saveMy(m, { quiet: true }); if (current === 'list') renderList(); if (current === 'home') renderHome(); if (current === 'settings') renderMySettings(); },
    merge: (l, r) => mergeMy(l, r, { pruneBefore: Date.now() - MY_PRUNE }),
    same: sameMy,
  },
});
LOOK.onChange = () => sync.soon(); // 꾸미기를 바꾸면 잠깐 뒤 다른 기기로
const saveSettings = () => save(KEY.settings, settings);
// 유반의어 테스트(noSave)는 기록에 영향을 주지 않아서 이어하기에도 안 남김 (하던 정규 학습의 이어하기를 지우지 않게)
// 하던 학습은 기기끼리도 맞춤(동기화를 켰을 때): 바꾼 시각을 같이 적어 두고, 더 최근에 바꾼 기기의 것으로
const SESS_AT = P + 'sessionAt.v1';
const putSession = s => { if (s) save(KEY.session, s); else localStorage.removeItem(KEY.session); save(SESS_AT, Date.now()); };
const dropSession = () => putSession(null);
const saveSession = () => (session ? session.noSave || putSession(session) : dropSession());

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
  if (current === 'coach' && id !== 'coach' && coachLeave) { const f = coachLeave; coachLeave = null; f(); }
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id; // 화면별 CSS (style.css body[data-screen])
  if (id !== 'settings') stopKeyCapture();
  if (push && id !== 'home' && current === 'home') history.pushState({ s: id }, '');
  if (id === 'quiz' && current !== 'quiz') { clearTimeout(toast.timer); $('#toast').hidden = true; }
  current = id;
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => {
    const on = b.dataset.tab === id;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
// 아래 탭: 진도 · 단어장 · 홈 · 코치 · 설정. 코치를 끄면 코치 탭, 고급 기능을 끄면 설정 탭을 숨기고 홈이 가운데 오게 다시 놓음
let coachLeave = null; // 코치 탭을 떠날 때 할 일 (채팅 정리)
function renderTabs() {
  const bar = $('#tabbar');
  const shown = { days: true, list: true, coach: !!settings.coach && advOn(), settings: advOn() };
  const side = ['days', 'list', 'coach', 'settings'].filter(k => shown[k]);
  const order = [...side];
  order.splice(Math.floor(side.length / 2), 0, 'home');
  for (const b of bar.querySelectorAll('[data-tab]')) b.hidden = !order.includes(b.dataset.tab);
  order.forEach(k => bar.appendChild(bar.querySelector(`[data-tab="${k}"]`)));
  if (current === 'coach' && !shown.coach) goHome();
}
function openTab(tab) {
  if (tab === current && tab !== 'list') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (tab === 'home') goHome();
  else if (tab === 'days') { renderHome(); show('days'); }
  else if (tab === 'list') openBook();
  else if (tab === 'coach') openCoach();
  else if (tab === 'settings') { renderSettings(); renderSyncStatus(); show('settings'); }
}
function openBook() { bookOnly = null; listFilter = 'all'; bookQuery = ''; $('#book-search').value = ''; show('list'); renderList(true); }
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
// 기기 안의 목소리를 먼저: 크롬·엣지의 'Google …'·'… Online' 목소리는 인터넷으로 받아 와서 한 박자 늦게 나옴
function pickVoice() {
  if (!voices.length) loadVoices();
  const lang = settings.accent.toLowerCase();
  const en = voices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  const pref = /samantha|google us|google uk|daniel|serena|karen|ava|allison|natural|premium|enhanced/i;
  const local = en.filter(v => v.localService);
  return local.find(v => pref.test(v.name)) || local[0] || en.find(v => pref.test(v.name)) || en[0] || voices.find(v => /^en/i.test(v.lang)) || null;
}
function speak(text) {
  if (!text) return;
  if (!window.speechSynthesis) { toast('이 브라우저는 발음 듣기를 지원하지 않아요'); return; }
  // 말하는 중일 때만 끊음 (크롬은 아무것도 안 할 때 cancel()하면 바로 다음 말이 늦게 나옴)
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  if (speechSynthesis.paused) speechSynthesis.resume();
  const u = new SpeechSynthesisUtterance(text.replace(/\[[^\]]*\]/g, ' ').replace(/[~〜…_]+|\.{3}/g, ' '));
  u.lang = settings.accent;
  u.rate = settings.rate;
  const v = pickVoice();
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function speakBtn(text, big) {
  const b = el('button', 'speak' + (big ? ' big' : ''));
  b.innerHTML = ICON.speak;
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
  byDay = new Map();
  for (const w of words) { if (!byDay.has(w.day)) byDay.set(w.day, []); byDay.get(w.day).push(w); }
  days = [...byDay.keys()].sort((a, b) => a - b);
  applyMy();
}
// DAY별 단어 (setWords에서 한 번 나눠 둠. 화면마다 words 전체를 다시 거르지 않게)
let byDay = new Map();
const dayWords = d => byDay.get(d) || [];

// ---------- 홈 ----------
// 학습 범위 단어: 홈 한 번 그릴 때 수십 번 불려서 범위·단어 목록이 같으면 앞서 거른 걸 그대로 씀 (고치지 말고 읽기만)
let rangeMemo = { list: null, from: 0, to: 0, out: [] };
function rangeWords() {
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  const m = rangeMemo;
  if (m.list !== words || m.from !== from || m.to !== to) rangeMemo = { list: words, from, to, out: words.filter(w => w.day >= from && w.day <= to) };
  return rangeMemo.out;
}
// 단어 코치: 켜져 있고 시험일이 앞으로 남아 있으면 코치가 목표일과 하루 새 단어 수를 정함
const coachActive = () => !!(settings.coach && settings.exam && settings.exam > dateStr());
const goalDate = () => (coachActive() ? settings.coachGoal || '' : settings.goal);
// 시험 전 전체 복습이 있는 일정인지: 목표일·시험일이 둘 다 있고 목표일이 먼저일 때 (코치가 켜져 있으면 코치의 목표일로 언제나)
const sweepOn = () => (coachActive() ? !!settings.coachGoal : !!(settings.goal && settings.exam && settings.goal < settings.exam));
const intervals = () => PRESETS[settings.srsPreset] || PRESETS.m;
const maxStage = () => intervals().length; // 기본 4단계(1·3·7·14일)
// 전체 복습 기간(목표일 ~ 시험 전날): 오늘의 복습이 범위 전체를 나눠 훑는 때
const inSweep = (today = dateStr()) => sweepOn() && !!goalDate() && today >= goalDate() && !!settings.exam && today < settings.exam;
// 복습에 나오는 단어: 학습 범위 + 내 단어 + 범위 밖이어도 독해에서 막힌 단어책 단어
let poolMemo = { rw: null, ver: -1, out: [] };
function reviewPool() {
  const rw = rangeWords();
  if (poolMemo.rw !== rw || poolMemo.ver !== myVer) {
    const inRange = new Set(rw.map(w => w.id));
    const extra = [...words.filter(w => !inRange.has(w.id) && hitOf(w.id)), ...myWords];
    poolMemo = { rw, ver: myVer, out: extra.length ? [...rw, ...extra] : rw };
  }
  return poolMemo.out;
}
// 날짜별로 이미 잡힌 복습 수 (복습에 나오는 단어만). 다음 복습일을 덜 붐비는 날로 고르려고
function dueLoad() {
  const m = new Map();
  for (const w of reviewPool()) { const s = stats[w.id]; if (s && s.due && !s.del && !s.g) m.set(s.due, (m.get(s.due) || 0) + 1); }
  return d => m.get(d) || 0;
}
// 오늘 넣을 새 내 단어: 하루 개수(설정)에서 오늘 이미 배운 내 단어를 뺌
const myQuotaLeft = () => Math.max(0, cfg().per - myNewToday());
// 새 내 단어 대기열: 독해에서 또 막힌 안 배운 단어책 단어(적은 순) → 내 단어(올린 순)
const myQueue = () => [
  ...words.filter(w => !stats[w.id] && hitNew(w.id)).sort((a, b) => hitOf(a.id).t - hitOf(b.id).t),
  ...myWords.filter(w => !stats[w.id]),
];
const isMastered = s => s && s.st >= maxStage(); // 마지막 단계(기본 14일 간격)까지 올라간 단어
const isWrongRaw = s => !!(s && s.st === 0);        // 마지막에 틀린 단어 (0단계)
// 다시 볼 단어: 0단계인데, '다시 볼 단어'에서 오늘 다시 맞힌 것(r = 오늘)은 뺌. 복습 일정은 그대로라 내일 복습에 다시 나옴
const isWrongNote = s => isWrongRaw(s) && s.r !== dateStr();
// 복습도 학습 범위 안의 단어에서만 (범위 밖 DAY를 실수로 풀어도 복습에 안 섞이게)
// 오늘 배울 새 단어 총수: 맨 위 숫자로 오늘만 바꿨으면 그 값, 아니면 하루 새 단어 수
// 오늘 배운 새 단어 수: 단어책 몫(newToday)과 내 단어 몫(myNewToday)을 따로
const newToday = () => { const t = dateStr(); return Object.entries(stats).filter(([id, s]) => s && s.f === t && !viaMy(id)).length; };
const myNewToday = () => { const t = dateStr(); return Object.entries(stats).filter(([id, s]) => s && s.f === t && viaMy(id)).length; };
const todayNewTarget = () => { const d = loadDay(); return d.newTarget != null ? d.newTarget : coachActive() ? coachDaily() : settings.newPerDay; };
const newTargetMine = () => loadDay().newTarget != null; // 오늘 새 단어 수를 맨 위 숫자로 직접 정했는지
// 오늘의 학습: 단어책 몫(fresh, 내 단어 대기열에 든 단어는 빼고) + 내 단어 몫(mine)
function todayPlan() {
  const rw = rangeWords();
  const bookRange = rw.some(w => hitNew(w.id) && !stats[w.id]) ? rw.filter(w => !(hitNew(w.id) && !stats[w.id])) : rw;
  const plan = buildPlan(reviewPool(), bookRange, stats, { today: dateStr(), newPerDay: todayNewTarget(), exam: settings.exam, srs: sweepOn() ? { goal: goalDate(), exam: settings.exam } : null, newToday: newToday() });
  plan.mine = myQueue().slice(0, myQuotaLeft());
  return plan;
}
// 오늘의 복습 고르기: 복습일이 된 단어 전부(까먹었을 가능성이 큰 것부터, 개수 제한 없음). 목표일부터 시험 전날까진 범위 전체를 나눈 오늘 몫도 같이
// limit은 '오늘 복습할 단어' 숫자를 오늘만 바꿨을 때만
const reviewPick = (limit = 0) => pickSrsReview(reviewPool(), rangeWords(), stats, { today: dateStr(), goal: sweepOn() ? goalDate() : '', exam: settings.exam, limit, rest: restNow() });
const pickToday = () => reviewPick().words;
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
  const learnLeft = plan.final.length + plan.fresh.length + plan.mine.length;
  const rv = reviewState();
  // 복습을 이미 시작했으면(그 사이 하루 새 단어 수를 늘렸어도) 복습부터 마저
  const stage = learnLeft && !rv.started ? 'learn' : !rv.done ? 'review' : learnLeft ? 'learn' : 'extra';
  return { plan, learnLeft, rv, stage };
}
// 추가 학습: 기다리는 내 단어 먼저, 그다음 범위의 새 단어
const extraNew = n => [...myQueue(), ...rangeWords().filter(w => !stats[w.id] && !hitNew(w.id))].slice(0, n);
const extraReview = n => pickReview(reviewPool(), stats, { n, again: true }); // 다 봤으면 오늘 본·배운 단어도 다시

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
  applyAdv();
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
  $('#opt-review-mix').checked = !!settings.reviewMix;
  setSeg('#seg-ko', settings.showKo ? 'show' : 'hide');
  setSeg('#seg-new', String(settings.newPerDay));
  $('#exam-date').value = settings.exam || '';
  // 시험일 옆 D-n, 목표일(설정 > 복습의 목표일과 같은 칸. 코치가 켜져 있으면 코치 일정의 목표일을 보여 주고 바꾸면 거기에 맞춰 다시 짬)
  const dn = settings.exam ? daysBetween(dateStr(), settings.exam) : null;
  $('#exam-dn').textContent = dn == null ? '' : dn > 0 ? `D-${dn}` : dn === 0 ? 'D-day' : '지났어요';
  $('#exam-dn').hidden = dn == null;
  renderPlan(); // 코치 일정을 먼저 맞춘 뒤에 목표일 칸을 채움
  fillGoalInput($('#plan-goal-date'));
  $('#plan-goal-d').textContent = goalNote();
  $('#btn-goal-clear').hidden = !$('#plan-goal-date').value;

  const rw = rangeWords();
  let seen = 0, mastered = 0, wrong = 0;
  for (const w of rw) {
    const s = stats[w.id];
    if (s) seen++;
    if (isMastered(s)) mastered++;
    if (isWrongNote(s)) wrong++;
  }
  // 홈 진도 카드는 외운 수 하나만 크게. 범위 단어 수·배운 수는 학습 범위 카드에
  const num = n => n.toLocaleString('ko-KR');
  $('#prog-done').textContent = num(mastered);
  $('#prog-total').textContent = ` / ${num(rw.length)}`;
  $('#range-sum').textContent = `${num(rw.length)}단어 중 ${num(seen)}개 배움`;
  $('#range-bar').style.width = rw.length ? `${(mastered / rw.length) * 100}%` : '0';
  // 홈의 학습 계획 요약 한 줄 (바꾸는 건 학습 계획 화면에서)
  const lo = Math.min(settings.from, settings.to), hi = Math.max(settings.from, settings.to);
  const sumBox = $('#plan-sum');
  sumBox.innerHTML = '';
  sumBox.append(el('b', 'plan-sum-range', lo === hi ? `DAY ${lo}` : `DAY ${lo}~${hi}`), el('span', 'plan-sum-desc', [
    settings.kind === 'type' ? '직접 입력' : '4지선다',
    ...(settings.reviewMix ? ['복습 섞어서'] : []),
    ...(!WORD && !settings.showKo ? ['해석 가림'] : []),
    ...(coachActive()
      ? (dateStr() < goalDate() ? [`코치 · 새 단어 ${todayNewTarget()}`, `${fmtDay(lastLearnDay())}까지`] : ['코치 · 전체 복습 중'])
      : [`새 단어 ${settings.newPerDay}`, ...(!sweepOn() ? [] : dateStr() < goalDate() ? [`${fmtDay(addDays(goalDate(), -1))}까지`] : ['전체 복습 중'])]),
  ].join(' · ')));
  $('#wrong-count').textContent = wrong || '';
  $('#btn-wrong').disabled = !wrong || $('#range-practice').classList.contains('dim');

  const grid = $('#day-grid');
  grid.innerHTML = '';
  // 보기 방식: 격자 · 줄 막대 · 잔디 (설정은 js/look.js, 제목 옆 버튼으로 바꿈)
  const view = LOOK.get().days;
  grid.className = 'days' + (view === 'grid' ? '' : ' ' + view);
  setSeg('#seg-days', view);
  $('#heat-legend').hidden = view !== 'heat';
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  for (const d of days) {
    const dw = dayWords(d);
    let seen = 0, m = 0, wr = 0;
    for (const w of dw) { const s = stats[w.id]; if (s) seen++; if (isMastered(s)) m++; if (isWrongNote(s)) wr++; }
    const wrap = el('div', 'day-wrap');
    const b = el('button', 'day' + (d >= from && d <= to ? ' sel' : ''));
    if (view === 'heat') { const p = (seen + m) / (2 * dw.length || 1); b.style.setProperty('--p', p.toFixed(3)); b.classList.toggle('dense', p > .55); }
    b.append(el('b', null, view === 'heat' ? String(d) : `DAY ${d}`), el('span', 'muted', `${seen}/${dw.length}` + (wr ? ` · 다시 ${wr}` : '')));
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
    // 좁으면 '학습 이름'과 '몇 개 완료' 사이에서만 줄이 바뀌게 (낱말 중간 '완/료'에서 갈리지 않게)
    const info = $('#resume-info');
    info.innerHTML = '';
    info.append(saved.label, ' · ', el('span', 'nobr', `${saved.done.length}/${saved.total} 완료`));
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
// 쉬는 요일은 다른 모드에서 바뀔 수 있어서(두 모드가 같이 씀) 있을 때만 붙임 (없으면 예전 열쇠 그대로라 일정을 괜히 다시 짜지 않음)
const coachKeyNow = () => { const r = cleanRest(settings.coachRest); return [settings.exam, Math.min(settings.from, settings.to), Math.max(settings.from, settings.to)].join('|') + (r.length ? `|r${r.join('')}` : ''); };
// 오늘 배울 새 단어 수: (남은 새 단어 + 오늘 이미 배운 수) ÷ 목표일까지 남은 날. 밀리면 늘고 앞서가면 줄어듦
// 쉬는 요일이 있으면 쉬는 날은 0개, 공부하는 날로만 나눔
// 하루 개수를 고정했으면(coachFix) 그 개수 그대로. 마지막 날만 남는 단어에 맞춤 (그 개수로 모자라게 되면 남은 날에 고르게)
function coachDaily() {
  const today = dateStr(), goal = settings.coachGoal, rest = restNow();
  if (!goal || today >= goal || isRestDay(today, rest)) return 0;
  if (settings.coachFix) { const p = coachPlanNow(); if (p && p.fix) return p.todayNew; }
  return Math.ceil((leftNew() + newToday()) / Math.max(1, studyDays(today, goal, rest)));
}
// 쉬는 요일 (코치가 켜져 있을 때만 씀)
const restNow = () => (coachActive() ? cleanRest(settings.coachRest) : []);
const restLabel = rest => (rest.length ? rest.map(i => WEEKDAY[i]).join('·') + '요일' : '');
// 일정 짜기. byUser: 사람이 시킨 것(켜기, 다시 짜기, 시험일 바꾸기)이면 다른 기기에도 이 일정이 가게 설정 바꾼 시각을 올림
const coachPlanFor = (review, rest = restNow(), fix = 0, tail = '') => coachPlan({ today: dateStr(), exam: settings.exam, total: rangeWords().length, remaining: leftNew() + newToday(), review, rest, fix, tail });
// 지금 설정대로의 일정 (복습 날 수를 정했거나, 하루 개수를 고정했거나, 코치에게 맡겼거나)
const coachPlanNow = () => coachPlanFor(settings.coachReview || 0, restNow(), settings.coachFix || 0, settings.coachTail || '');
function planCoach(byUser) {
  const p = coachPlanNow();
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
  // 하루 개수를 고정했으면 목표일이 진도를 따라 움직임 (덜 하면 뒤로, 더 하면 앞으로)
  if (settings.coachFix && left > 0) { const p = coachPlanNow(); if (p && p.goal !== g) planCoach(false); return; }
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

// 코치 캐릭터 (js/coach-art.js의 32×32 픽셀 그림): 고양이·햄스터·부엉이·슬라임 가운데 고름. 기기에 저장(ui.coachChar, 고른 때 ui.coachCharAt), 두 모드가 같이 씀.
// 동기화를 켰으면 더 최근에 고른 쪽으로 다른 기기와 맞춰짐(Gist의 voca-marks.json)
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
    $('#cp-bio').textContent = COACH_BIO[cur] || '';
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
  ui.coachCharAt = Date.now();
  save(UI_KEY, ui);
  sync.soon();
  if (current === 'settings') renderSrs();
  renderCoach();
}
// 스위치·'켜기' 버튼: 처음 켤 땐 코치부터 고름 (취소하면 안 켬)
async function toggleCoach(on) {
  if (on && !COACH_ART[ui.coachChar]) {
    const c = await pickCoach();
    if (!c) { renderPlan(); if (current === 'settings') renderSrs(); return; } // 스위치를 원래대로
    ui.coachChar = c;
    ui.coachCharAt = Date.now();
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
  const fresh = f.plan.fresh.length, mine = f.plan.mine.length, rv = f.rv.left.length, allDone = !f.learnLeft && f.rv.done;
  const moved = coachMoved ? '목표일이 지나서 일정을 다시 짰어요. ' : '';
  const replan = ['일정 다시 짜기', () => { planCoach(true); coachMoved = false; renderHome(); toast('남은 날에 맞춰 일정을 다시 짰어요'); }];
  const talk = [aiCoachOnline() ? '코치와 이야기하기' : '일정 상의하기', talkCoach];
  const rest = restNow(), restTxt = rest.length ? ` ${restLabel(rest)}은 쉬어요.` : '';
  // 쉬는 날: 새 단어·전체 복습 몫 없이 복습일 된 단어만 (오늘 개수를 직접 정했으면 아래 그대로)
  if (isRestDay(today, rest) && !newTargetMine()) {
    if (today >= goal) return { mood: 'sleep', text: `오늘은 쉬는 날이에요. ${rv ? `복습일이 된 단어 ${rv}개만 보면 돼요.` : '푹 쉬고 내일 다시 훑어요.'}`, acts: aiCoachOnline() ? [talk] : [] };
    const next = addDays(today, 1), n = studyDays(next, goal, rest), more = n ? Math.ceil(leftNew() / n) : 0;
    return { mood: 'sleep', text: `오늘은 쉬는 날이에요. 새 단어는 쉬고${rv ? ` 복습 ${rv}개만 하면 돼요` : ' 푹 쉬어요'}.` + (more ? ` 다음 공부하는 날부터 하루 ${more}개쯤이에요.` : ''), acts: [talk] };
  }
  const todo = [fresh ? `새 단어 ${fresh}개` : '', mine ? `내 단어 ${mine}개` : '', rv ? `복습 ${rv}개` : ''].filter(Boolean).join(' + ');
  const chat = aiCoachOnline() ? [talk] : [];
  if (today >= goal) { // 범위 전체를 다시 훑는 기간
    if (allDone) return { mood: 'happy', text: `오늘 복습 끝! 시험까지 ${D}일, 내일도 이어서 훑어요.`, acts: chat };
    return { mood: 'normal', text: `새 단어는 다 봤어요. 시험까지 ${D}일 동안 범위 전체를 다시 훑어요.${restTxt} 오늘은 복습 ${rv}개예요.`, acts: chat };
  }
  const span = rd === 1 ? '하루' : `${rd}일`;
  const tail = rd > 0 ? `마지막 ${span}는 전체 복습이에요`.replace('일는', '일은') : '시험 전날까지 새 단어를 봐요';
  const last = lastLearnDay(), by = last === today ? '오늘' : fmtDay(last);
  if (allDone) return { mood: 'happy', text: `${moved}오늘 몫 끝! ` + (last === today ? `새 단어를 다 봤어요. 내일부터 시험 전날까지는 전체 복습이에요.` : `이대로면 ${by}에 새 단어를 다 보고, ${tail}.`), acts: last === today ? chat : [talk] };
  // 밀렸는지는 코치 계산(남은 새 단어 ÷ 남은 날)으로 봄. 오늘 개수를 직접 늘린 건 밀린 게 아님
  const target = todayNewTarget(), need = coachDaily(), base = settings.coachBase || 0;
  const fixed = settings.coachFix ? coachPlanNow() : null;
  if (fixed && fixed.fix && !fixed.fits && fresh && !newTargetMine()) {
    return { mood: 'worry', text: `하루 ${fixed.fix}개로는 시험 전에 새 단어를 다 못 보게 됐어요. 그래서 오늘은 ${need}개예요. 일정을 다시 상의해요.`, acts: [talk] };
  }
  if (newTargetMine() && fresh && target !== need) {
    return {
      mood: target > need ? 'cheer' : 'normal',
      text: `${moved}오늘은 직접 정한 대로 새 단어 ${target}개예요 (코치 계획은 하루 ${need}개). ` + (target > need ? '많이 해 두는 만큼 내일부터 하루 몫이 줄어요.' : '덜 한 만큼 내일부터 하루 몫이 조금 늘어요.'),
      acts: [talk],
    };
  }
  if (base && fresh && need > base * 1.25 + 2) {
    return { mood: 'worry', text: `조금 밀렸어요. ${by}까지 새 단어를 끝내려면 오늘 ${need}개예요 (처음 계획은 하루 ${base}개). 벅차면 일정을 다시 짜거나 같이 바꿔 봐요.`, acts: [replan, talk] };
  }
  if (base > 80) {
    return { mood: 'worry', text: `${moved}시험까지 ${D}일인데 새 단어가 ${leftNew()}개 남았어요. 하루 ${need}개는 많이 빡빡해요. 학습 범위를 줄이는 걸 권해요. 오늘은 ${todo}예요.`, acts: [['학습 범위 바꾸기', () => { planFrom = null; show('plan'); }], talk] };
  }
  return { mood: 'normal', text: `${moved}시험까지 ${D}일. ${by}까지 새 단어를 끝내고 ${tail}.${restTxt} 오늘은 ${todo || '할 게 없어요'}${todo ? '예요' : ''}.`, acts: last === today ? chat : [talk] };
}

// 일정 상의하기: 코치가 시험 전 전체 복습 날 수를 몇 가지 골라 주고(여유 있게 · 추천 · 길게 · 아주 길게), 고르면 그 날 수를 계속 따름
// (목표일 = 시험일 − 복습 날 수, 하루 새 단어 수는 거기에 맞춰 매일 다시 계산). 추천을 고르면 다시 코치가 정함
function coachOptions() {
  const auto = coachPlanFor(0);
  if (!auto || auto.days < 2) return [];
  const a = auto.auto, max = auto.days - 1; // 새 단어를 볼 날은 적어도 하루
  const opts = [];
  const add = (r, name) => {
    r = Math.max(1, Math.min(max, r));
    if (opts.some(o => o.r === r)) return;
    const p = coachPlanFor(r);
    if (r !== a && p.perDay > 80) return; // 너무 벅찬 건 권하지 않음
    opts.push({ r, name, p, rec: r === a });
  };
  add(a, '코치 추천');
  add(Math.ceil(a / 2), '새 단어 여유 있게');
  add(Math.max(a + 2, a * 2), '복습 길게');
  add(Math.max(a + 4, a * 3), '복습 아주 길게');
  if (settings.coachReview) add(settings.coachReview, '지금 일정');
  return opts.sort((x, y) => x.r - y.r);
}
// 고른 선택지에 대한 코치의 말
function optionSay({ r, p, rec }, a) {
  const end = addDays(p.goal, -1), by = end === dateStr() ? '오늘' : fmtDay(end);
  const plan = `${by}까지 새 단어를 하루 ${p.perDay}개씩 보고, 마지막 ${r === 1 ? '하루' : `${r}일`}는 하루 ${p.finalPerDay}개쯤 전체 복습해요.`.replace('일는', '일은');
  if (rec) return ['happy', `${plan} 배우는 날과 복습하는 날의 부담이 비슷해서 제일 무난해요.`];
  if (p.perDay > 40) return ['worry', `${plan} 새 단어가 하루 ${p.perDay}개라 조금 빡빡해요. 할 수 있으면 좋아요!`];
  if (r > a) return ['cheer', `${plan} 시험 전에 천천히 여러 날 훑을 수 있어요.`];
  return ['normal', `${plan} 새 단어는 여유 있지만 복습 날이 바빠요.`];
}
// AI를 못 부른 까닭을 코치 말로
function coachErrorText() {
  const e = aiCoachError();
  return e === '429' ? 'AI가 지금 바쁘거나 무료 한도를 다 썼어요. 1분쯤 뒤에 다시 보내 주세요.'
    : e === '413' ? '보낼 이야기가 AI 무료 한도보다 길어요. 1분쯤 뒤에 짧게 다시 보내 주세요.'
    : e === 'timeout' ? 'AI 답이 너무 늦어요. 다시 보내 볼까요?'
      : e === 'offline' || e === 'network' ? '인터넷이 안 돼서 AI와 이야기할 수 없어요. 연결을 확인하고 다시 보내 주세요.'
        : e === '401' || e === '403' ? 'AI 키가 맞지 않아요. 설정 > AI에서 다시 연결해 주세요.'
          : e === '404' ? `${aiCoachName()} 모델을 찾을 수 없어요. 설정 > AI에서 코치 AI를 끊고 다시 연결해 주세요.`
            : e === 'cut' ? 'AI 답이 중간에 끊겼어요. 다시 보내 볼까요?'
              : /^5\d\d$/.test(e) ? `AI 쪽에 사람이 몰려서 지금 답을 못 받았어요(${e}). 조금 뒤에 다시 보내 주세요.`
                : /^\d+$/.test(e) ? `AI가 오류(${e})를 냈어요. 조금 뒤에 다시 보내 주세요.`
                  : 'AI 답을 제대로 못 받았어요. 다시 보내 볼까요?';
}
// 코치와 이야기하기 / 일정 상의하기: AI가 되면 대화 화면, 아니면 선택지 창
function talkCoach() { return aiCoachOnline() ? openCoach() : pickSchedule(); }
const canPlanNow = () => coachActive() && !!leftNew() && dateStr() < settings.coachGoal;

// 일정 상의하기(선택지): 시험 전 전체 복습을 며칠 할지 고름. 고르면 하루 개수 고정은 풀림
function pickSchedule() {
  const opts = canPlanNow() ? coachOptions() : [];
  if (opts.length < 2) { toast(coachActive() && leftNew() ? '시험이 너무 가까워서 일정을 바꿀 수 없어요' : '지금은 바꿀 일정이 없어요'); return; }
  const d = $('#coach-talk'), box = $('#ct-opts');
  const recOpt = opts.find(o => o.rec), a = recOpt ? recOpt.r : 0;
  let cur = (!settings.coachFix && opts.find(o => o.r === (settings.coachReview || a))) || recOpt || opts[0];
  const draw = () => {
    const [mood, say] = optionSay(cur, a);
    $('#ct-char').innerHTML = coachSvg(mood);
    $('#ct-text').textContent = say;
    box.innerHTML = '';
    for (const o of opts) {
      const b = el('button', 'preset' + (o === cur ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', o === cur);
      const main = el('span', 'p-main');
      main.append(el('span', 'p-name', o.name), el('span', 'p-days', `복습 ${o.r}일 · 새 단어 하루 ${o.p.perDay}개`));
      b.appendChild(main);
      b.appendChild(el('i', 'p-radio'));
      b.addEventListener('click', () => { cur = o; draw(); });
      box.appendChild(b);
    }
  };
  draw();
  d.hidden = false;
  return new Promise(resolve => {
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const i = opts.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1);
        if (opts[i]) { cur = opts[i]; draw(); }
      }
    };
    const close = () => { d.hidden = true; d.onclick = null; document.removeEventListener('keydown', key, true); };
    const done = ok => {
      close();
      modalDone(() => {
        if (ok && cur) {
          Object.assign(settings, { coachReview: cur.rec ? 0 : cur.r, coachFix: 0, coachTail: '' }); // 추천이면 코치에게 맡김 (범위·진도가 바뀌면 추천도 따라 바뀌게)
          planCoach(true);
          coachMoved = false;
          toast(`시험 전 ${cur.r}일은 전체 복습`, 3000);
          renderHome();
          if (current === 'settings') renderSrs();
        }
        resolve(ok);
      });
    };
    modalOpen(() => { close(); resolve(false); });
    $('#ct-ok').onclick = () => done(true);
    $('#ct-cancel').onclick = () => done(false);
    d.onclick = e => { if (e.target === d) done(false); };
    document.addEventListener('keydown', key, true);
  });
}

// ---------- 코치와 이야기하기 (AI) ----------
// 메신저처럼 주고받는 화면. 이야기와 코치가 기억해 둔 것은 이 기기에만 저장하고(동기화 안 함) 날이 바뀌어도 이어짐.
// 일정 얘기면 AI는 학생이 원하는 값만 뽑고(js/ai.js aiCoachChat), 계산과 숫자는 앱이 카드로 보여 줌(coachProposal).
// 실제로 바뀌는 건 카드의 '이렇게 할게요'를 눌렀을 때
// 코치는 예문·단어 모드가 하나: 이야기와 기억도 같이 씀. 예전 단어 모드 기록(voca.word.coach.chat.v1)은 처음 열 때 합침
const CHAT_KEY = 'voca.coach.chat.v1'; // { items: [{ who: 'me'|'coach'|'app'|'note', text, t, mood?, err? }], notes: [{ text, t }] }
const OLD_WORD_CHAT = 'voca.word.coach.chat.v1';
const CHAT_KEEP = 200, NOTE_KEEP = 30;
const MODE_NAME = WORD ? '단어 모드' : '예문 모드';
const OTHER_NAME = WORD ? '예문 모드' : '단어 모드';
function loadChat() {
  const old = load(OLD_WORD_CHAT, null);
  if (old) {
    save(CHAT_KEY, mergeChats(load(CHAT_KEY, null), old, { keep: CHAT_KEEP, notes: NOTE_KEEP }));
    try { localStorage.removeItem(OLD_WORD_CHAT); } catch {}
  }
  const c = load(CHAT_KEY, null) || {};
  return { items: Array.isArray(c.items) ? c.items.filter(m => m && m.text) : [], notes: Array.isArray(c.notes) ? c.notes.filter(n => n && n.text) : [], sum: c.sum && (c.sum.text || c.sum.upTo) ? c.sum : null, sumFail: c.sumFail || 0 };
}
// 실패 안내(err)는 저장하지 않음: 다시 열면 사라짐
// sum = 창 밖으로 밀려난 앞선 이야기의 요약 { text, upTo: 거기까지 줄인 마지막 이야기의 시각 }
const saveChat = c => save(CHAT_KEY, { items: c.items.filter(m => !m.err).slice(-CHAT_KEEP), notes: c.notes.slice(-NOTE_KEEP), ...(c.sum ? { sum: c.sum } : {}), ...(c.sumFail ? { sumFail: c.sumFail } : {}) });

// 약한 단어: 틀린 적이 있는 단어를 많이 틀린 순으로 (지금 0단계면 앞으로). 코치가 짚어 주려고
// 코치는 두 모드가 하나라 예문·단어 기록을 합쳐서 봄 (틀린·맞힌 횟수는 더하고, 마지막에 틀렸는지는 더 최근에 푼 쪽)
function weakWords(n = 12) {
  const os = load(OTHER_P + 'stats.v1', {});
  const live = x => (x && !x.del ? x : null);
  return rangeWords().map(w => {
    const a = live(stats[w.id]), b = live(os[w.id]);
    if (!a && !b) return null;
    const last = !b || (a && (a.s || 0) >= (b.s || 0)) ? a : b;
    const s = { w: ((a && a.w) || 0) + ((b && b.w) || 0), c: ((a && a.c) || 0) + ((b && b.c) || 0), st: last.st, s: last.s || 0, here: (a && a.w) || 0, there: (b && b.w) || 0 };
    return { w, s };
  }).filter(x => x && x.s.w > 0)
    .map(x => ({ ...x, score: x.s.w * 2 + (x.s.st === 0 ? 3 : 0) + 3 * x.s.w / (x.s.w + (x.s.c || 0)) }))
    .sort((a, b) => b.score - a.score || (b.s.s || 0) - (a.s.s || 0)).slice(0, n);
}
function weakText() {
  const today = dateStr();
  const where = s => (s.here && s.there ? ` (${MODE_NAME.slice(0, 2)} ${s.here} · ${OTHER_NAME.slice(0, 2)} ${s.there})` : s.there ? ` (${OTHER_NAME}에서)` : ` (${MODE_NAME}에서)`);
  const lines = weakWords().map(({ w, s }) => `- ${w.word}: ${String(w.meaning || '').slice(0, 60)} (틀림 ${s.w}번${where(s)}, 맞힘 ${s.c || 0}번${s.st === 0 ? ', 마지막에도 틀림' : ''})`);
  // 복습일이 지났는데 오래 안 본 단어
  const late = rangeWords().filter(w => { const s = stats[w.id]; return s && s.due && s.due < today; })
    .sort((a, b) => stats[a.id].due.localeCompare(stats[b.id].due)).slice(0, 5);
  if (late.length) lines.push(`${MODE_NAME}에서 복습일이 지났는데 아직 안 본 단어: ${late.map(w => `${w.word}(${daysBetween(stats[w.id].due, today)}일 지남)`).join(', ')}`);
  return lines.join('\n');
}
// 그날 처음 열면 코치가 먼저 건네는 말 (앱이 씀. AI를 부르지 않음)
function coachGreeting() {
  const hello = {
    cat: '왔어요? 딱히 기다린 건 아니에요.',
    hamster: '왔다! 오늘도 같이 차곡차곡 모아 봐요!',
    owl: '어서 와요. 오늘은 무슨 이야기를 해 볼까요?',
    slime: '어서 와요~ 천천히 이야기해요.',
  }[coachChar()];
  const weak = weakWords(2).map(x => `'${x.w.word}'`);
  return `${hello} ${weak.length ? `요즘 ${weak.join(', ')}에서 자주 걸리던데, 같이 볼까요? 일정 얘기도 좋아요.` : '일정이든 단어든 공부 고민이든 편하게 말해 줘요.'}`;
}

/**
 * 학생이 원하는 값(ch: { rest?, perDay?, review?, today? })으로 일정을 계산해 카드로.
 * 반환 { title, lines: [글자], choices?: [{ label, sub, pick }], ok?: 적용할 값, alt?: [버튼 글자, 다시 계산할 값] }
 */
function coachProposal(ch) {
  if (!coachActive()) return { title: '지금은 계산할 일정이 없어요', lines: [settings.exam ? '단어 코치가 꺼져 있어요. 설정에서 켜면 같이 짤 수 있어요.' : '시험일을 먼저 정해 주세요. 학습 계획 화면에서 정할 수 있어요.'] };
  const today = dateStr(), cur = coachPlanNow();
  const rest = ch.rest ? cleanRest(ch.rest) : restNow();
  const restTxt = rest.length ? `${restLabel(rest)} 쉼` : '쉬는 날 없이 매일';
  const by = p => { const end = addDays(p.goal, -1); return end === today ? '오늘' : fmtDay(end); };
  const span = n => (n === 1 ? '하루' : `${n}일`);
  if (!canPlanNow()) { // 새 단어를 다 봤으면 바꿀 수 있는 건 쉬는 요일뿐
    if (!ch.rest) return { title: '지금은 바꿀 일정이 없어요', lines: ['새 단어를 다 봐서 시험 전날까지 전체 복습만 남았어요. 쉬는 요일은 바꿀 수 있어요.'] };
    const k = studyDays(today, settings.exam, rest);
    return { title: restTxt, lines: [`전체 복습: 시험 전날까지 공부하는 날 ${k}일, 하루 ${Math.ceil(rangeWords().length / Math.max(1, k))}개쯤`], ok: { rest } };
  }
  const left = leftNew() + newToday();
  const fix = ch.perDay || (ch.review ? 0 : settings.coachFix || 0);
  const review = fix ? 0 : ch.review || settings.coachReview || 0;
  const mk = tail => coachPlanFor(review, rest, fix, tail);
  const reviewLine = p => (p.reviewDays ? `전체 복습: ${fmtDay(p.goal)}부터 ${span(p.reviewDays)} (공부하는 날 ${studyDays(p.goal, settings.exam, rest)}일), 하루 ${p.finalPerDay}개쯤` : '전체 복습: 할 날이 안 남아요 (시험 전날까지 새 단어)');
  const curLine = cur ? `지금 일정: 하루 ${cur.perDay}개, 전체 복습 ${cur.reviewDays}일${restNow().length ? `, ${restLabel(restNow())} 쉼` : ''}` : '';
  const todayN = ch.today != null ? Math.max(ch.today, newToday()) : null;
  const todayLine = todayN != null ? `오늘 새 단어: ${todayN}개 (오늘만)` : '';
  // 코치의 한마디 (앱이 씀)
  const verdict = p => (!p.reviewDays ? '복습할 날이 하나도 안 남아서 권하고 싶진 않아요.'
    : p.load === 'heavy' ? '솔직히 이건 너무 많아요. 범위를 줄이는 쪽을 권해요.'
      : p.load === 'busy' ? '조금 빡빡하지만 할 수 있어요.'
        : p.reviewDays === 1 ? '할 만해요. 다만 복습이 하루뿐이라 빠듯해요.' : '할 만해요.');
  // 오늘 개수만 바꾸기
  if (todayN != null && !ch.rest && !ch.perDay && !ch.review) {
    const next = addDays(today, 1), n = studyDays(next, settings.coachGoal, rest), more = Math.max(0, left - todayN);
    return {
      title: `오늘만 새 단어 ${todayN}개`,
      lines: [settings.coachFix ? `내일부터는 다시 하루 ${settings.coachFix}개` : n ? `내일부터는 하루 ${Math.ceil(more / n)}개쯤 (${fmtDay(lastLearnDay())}까지)` : '오늘이 새 단어를 보는 마지막 날이에요', `지금 계획으로는 오늘 ${coachDaily()}개`],
      ok: { today: todayN },
    };
  }
  const head = `${restTxt} · 새 단어 하루 ${fix || mk('').perDay}개`;
  if (fix) {
    const p = mk(ch.perDay ? '' : settings.coachTail);
    const all = studyDays(today, settings.exam, rest);
    if (!p.fits) {
      return {
        title: `하루 ${fix}개로는 모자라요`,
        lines: [`남은 새 단어 ${left}개 · 시험 전날까지 공부하는 날 ${all}일 (${restTxt})`, `하루 ${fix}개씩이면 ${all * fix}개까지만 볼 수 있어요.`, `적어도 하루 ${p.minPerDay}개는 해야 시험 전날까지 다 볼 수 있어요.`, curLine].filter(Boolean),
        alt: p.minPerDay !== fix ? [`하루 ${p.minPerDay}개로 계산해 보기`, { ...ch, perDay: p.minPerDay }] : null,
      };
    }
    // 남는 단어: 마지막 날에 붙일지, 하루를 늘릴지 학생이 고름
    if (p.over && ch.perDay) {
      const a = mk('last'), b = mk('extra');
      return {
        title: head,
        lines: [`남은 새 단어 ${left}개를 하루 ${fix}개씩 보면 ${p.over}개가 남아요. 어떻게 할까요?`, todayLine, curLine].filter(Boolean),
        choices: [
          { label: '마지막 날에 붙이기', sub: `${by(a)}에 끝 (그날만 ${a.lastDay}개) · 전체 복습 ${a.reviewDays}일`, pick: { rest: ch.rest ? rest : null, fix, tail: 'last', today: todayN } },
          { label: '하루 늘리기', sub: `${by(b)}에 끝 (그날은 ${b.lastDay}개) · 전체 복습 ${b.reviewDays}일`, pick: { rest: ch.rest ? rest : null, fix, tail: 'extra', today: todayN } },
        ],
      };
    }
    if (p.studyN === 1) { // 남은 단어가 하루치도 안 됨
      return {
        title: `${restTxt} · 새 단어 하루 ${fix}개`,
        lines: [`남은 새 단어가 ${left}개라 ${isRestDay(today, rest) ? `${by(p)} 하루에` : '오늘 하루에'} 다 보게 돼요.`, reviewLine(p), curLine, left > 80 ? '솔직히 하루에 보기엔 너무 많아요. 나눠서 보는 쪽을 권해요.' : ''].filter(Boolean),
        ok: { rest: ch.rest ? rest : null, fix, tail: '', today: null },
      };
    }
    return {
      title: head,
      lines: [
        `새 단어: ${by(p)}까지 공부하는 날 ${p.studyN}일` + (p.studyN > 1 && p.lastDay !== fix ? ` (마지막 날은 ${p.lastDay}개)` : ''),
        reviewLine(p), todayLine, curLine, verdict(p),
      ].filter(Boolean),
      ok: { rest: ch.rest ? rest : null, fix, tail: p.tail, today: todayN },
    };
  }
  const p = mk('');
  if (!p) return null;
  return {
    title: head,
    lines: [`새 단어: ${by(p)}까지 공부하는 날 ${studyDays(today, p.goal, rest)}일 동안 하루 ${p.perDay}개`, reviewLine(p), todayLine, curLine, verdict(p)].filter(Boolean),
    ok: { rest: ch.rest ? rest : null, review: ch.review ? p.reviewDays : null, today: todayN },
  };
}
// 카드 제목에 어느 모드 일정인지 (하루 개수·복습 날 수는 지금 모드만, 쉬는 요일만 바꾸면 두 모드 같이)
function modeProposal(ch) {
  const d = coachProposal(ch);
  if (!d || !(d.ok || d.choices)) return d;
  const restOnly = ch.rest && !ch.perDay && !ch.review && ch.today == null;
  if (restOnly) return { ...d, lines: [...d.lines, `쉬는 요일은 예문·단어 모드에 같이 적용돼요. 위 개수는 ${MODE_NAME} 기준이에요.`] };
  return { ...d, title: `${MODE_NAME} · ${d.title}` };
}
// 카드에서 '이렇게 할게요'를 눌렀을 때: 일정을 실제로 바꿈. 반환: 바뀐 것을 알리는 말
function applyProposal(o) {
  const msgs = [];
  if (o.rest) { setRest(o.rest); msgs.push(o.rest.length ? `${restLabel(o.rest)}은 쉬어요` : '쉬는 요일 없이 해요'); }
  if (o.fix) { Object.assign(settings, { coachFix: o.fix, coachTail: o.tail || '', coachReview: 0 }); msgs.push(`새 단어 하루 ${o.fix}개`); }
  else if (o.review) {
    const auto = coachPlanFor(0, cleanRest(settings.coachRest));
    Object.assign(settings, { coachFix: 0, coachTail: '', coachReview: auto && o.review === auto.auto ? 0 : o.review });
    msgs.push(`시험 전 ${o.review}일은 전체 복습`);
  }
  if (o.today != null) { const day = loadDay(); day.newTarget = o.today; save(KEY.day, day); msgs.push(`오늘은 새 단어 ${o.today}개`); }
  if (coachActive()) planCoach(true); else { settings.prefsAt = Date.now(); saveSettings(); sync.soon(); }
  coachMoved = false;
  renderHome();
  if (current === 'settings') renderSrs();
  return msgs.join(' · ');
}

// 지금 일정을 한 줄로 (AI가 바뀐 결과를 정확히 알게)
function planNowText() {
  const p = coachActive() ? coachPlanNow() : null;
  if (!p) return '';
  const rest = restNow();
  return `바뀐 일정: ${p.perDay ? `새 단어는 ${fmtDay(addDays(p.goal, -1))}까지 하루 ${p.perDay}개` + (p.fix && p.fits && p.studyN > 1 && p.lastDay !== p.fix ? `(마지막 날만 ${p.lastDay}개)` : '') + ', ' : ''}전체 복습은 ${p.reviewDays}일${rest.length ? `, ${restLabel(rest)} 쉼` : ''}`;
}

function openCoachChat() {
  const d = $('#coach'), log = $('#cc-log'), inp = $('#cc-input'), send = $('#cc-send'), chips = $('#cc-chips'), mem = $('#cc-mem');
  const chat = loadChat();
  const today = dateStr();
  let busy = false, card = null, mood = 'normal', open = true;
  // 받는 중인 코치 말: 받은 글(target)을 한 번에 붙이지 않고 몇 글자씩 늘려 보여 줌 (조각이 몰려 와도 고르게)
  const live = { target: '', n: 0, raf: 0, el: null, done: null };
  const last = chat.items[chat.items.length - 1];
  if (!last || dateStr(last.t) !== today) chat.items.push({ who: 'coach', text: coachGreeting(), t: Date.now(), mood: 'cheer' });
  $('#cc-name').textContent = `${COACH_NAMES[coachChar()]} 코치`;
  $('#cc-sub').textContent = `${aiCoachName()} · 예문·단어 같이 · 이 기기에만 저장`;
  $('#cc-menu').hidden = false;
  $('#cc-ask').hidden = false;
  $('#cc-noai').hidden = true;
  $('#cc-chips').hidden = false;
  const dayLabel = t => { const x = dateStr(t); return x === today ? '오늘' : x === addDays(today, -1) ? '어제' : fmtDay(x); };
  // AI에게 넘길 앞선 이야기 (실패 안내와 '기억해 둘게요' 줄은 뺌)
  // t는 AI에 보내지 않고, 다음 번에도 같은 이야기부터 넘기려고(캐시) 씀
  const forAi = () => chat.items.filter(m => !m.err && m.who !== 'note').map(m => ({ who: m.who, text: m.text, day: fmtDay(dateStr(m.t)), t: m.t }));
  const cardBox = (c, liveCard) => {
    const box = el('div', 'chat-plan');
    box.appendChild(el('div', 'cp-title', c.title));
    for (const l of c.lines) box.appendChild(el('div', 'cp-line', l));
    if (!liveCard) return box;
    let pick = c.ok || null;
    const okBtn = el('button', 'btn small cp-ok', '이렇게 할게요');
    okBtn.type = 'button';
    if (c.choices) {
      const row = el('div', 'cp-choices');
      for (const o of c.choices) {
        const b = el('button', 'cp-choice');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.append(el('b', null, o.label), el('span', null, o.sub));
        b.addEventListener('click', () => {
          pick = o.pick;
          row.querySelectorAll('.cp-choice').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
          okBtn.disabled = false;
        });
        row.appendChild(b);
      }
      box.appendChild(row);
      okBtn.disabled = true;
    }
    if (c.alt) {
      const b = el('button', 'btn small secondary cp-alt', c.alt[0]);
      b.type = 'button';
      b.addEventListener('click', () => { if (!busy) showCard(c.alt[1]); });
      box.appendChild(b);
    }
    if (c.ok || c.choices) {
      okBtn.addEventListener('click', () => {
        if (!pick) return;
        const said = applyProposal(pick);
        card = null;
        chat.items.push({ who: 'note', text: `일정을 바꿨어요(${pick.rest && !pick.fix && !pick.review && pick.today == null ? '두 모드 같이' : MODE_NAME}): ${said}`, t: Date.now() });
        chat.items.push({ who: 'app', text: `학생이 '이렇게 할게요'를 눌러 ${MODE_NAME} 일정을 바꿈: ${said}. ${planNowText()}`, t: Date.now(), hide: true });
        saveChat(chat);
        mood = 'happy';
        draw();
        toast(said, 3000);
      });
      box.appendChild(okBtn);
    }
    return box;
  };
  const draw = () => {
    $('#cc-char').innerHTML = coachSvg(mood);
    log.innerHTML = '';
    let day = '';
    for (const m of chat.items.slice(-80)) {
      if (m.hide) continue;
      const dl = dayLabel(m.t);
      if (dl !== day) { day = dl; log.appendChild(el('div', 'chat-day', dl)); }
      if (m.who === 'note') { log.appendChild(el('div', 'chat-note', m.text)); continue; }
      if (m.who === 'app') { log.appendChild(card && card.item === m ? cardBox(card.data, true) : cardBox(m.card || { title: '코치 계산', lines: m.text.split('\n') }, false)); continue; }
      const b = el('div', `chat-msg ${m.who === 'me' ? 'me' : 'bot'}` + (m.err ? ' err' : ''), m.text);
      if (m.err && m.retry) {
        const r = el('button', 'chat-retry');
        r.type = 'button';
        r.innerHTML = ICON.retry;
        r.setAttribute('aria-label', '다시 보내기');
        r.title = '다시 보내기';
        r.addEventListener('click', () => { if (busy) return; chat.items.splice(chat.items.indexOf(m), 1); talk(m.retry, true); });
        b.appendChild(r);
      }
      log.appendChild(b);
    }
    live.el = null;
    if (busy && live.target) { live.el = el('div', 'chat-msg bot live', live.target.slice(0, live.n)); log.appendChild(live.el); }
    else if (busy) { const t = el('div', 'chat-msg bot typing'); t.setAttribute('aria-label', '코치가 생각하고 있어요'); t.append(el('i'), el('i'), el('i')); log.appendChild(t); }
    log.scrollTop = log.scrollHeight;
    send.disabled = busy || !inp.value.trim();
  };
  // 한 화면(1/60초)마다 남은 글의 1/14쯤, 적어도 2글자씩. 밀린 글이 많으면 빨리, 따라잡으면 받는 속도대로
  const liveTick = () => {
    live.raf = 0;
    const t = live.target;
    if (live.n < t.length) live.n = Math.min(t.length, live.n + Math.max(2, Math.ceil((t.length - live.n) / 14)));
    if (!open) live.n = t.length;
    if (open && (!live.el || !live.el.isConnected)) draw();
    else if (open) {
      const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60; // 위로 올려 읽는 중이면 안 끌어내림
      live.el.textContent = t.slice(0, live.n);
      if (atEnd) log.scrollTop = log.scrollHeight;
    }
    if (live.n < t.length) live.raf = requestAnimationFrame(liveTick);
    else if (live.done) { const f = live.done; live.done = null; f(); }
  };
  const liveSet = t => {
    // 앞에 보여 준 글과 이어지지 않으면(다른 모델로 다시 받음, 다 받고 고친 말) 같은 데까지만 남기고 거기서부터
    const old = live.target;
    let k = 0;
    while (k < old.length && k < t.length && old[k] === t[k]) k++;
    if (live.n > k) live.n = k;
    live.target = t;
    if (!live.raf) live.raf = requestAnimationFrame(liveTick);
  };
  // 다 받은 말까지 마저 보여 주고 끝냄 (창을 닫았거나 화면이 꺼져 있으면 바로)
  const liveEnd = t => new Promise(done => {
    if (!open || document.hidden || !live.target) { cancelAnimationFrame(live.raf); Object.assign(live, { target: '', n: 0, raf: 0, el: null, done: null }); return done(); }
    live.done = () => { Object.assign(live, { target: '', n: 0, el: null }); done(); };
    liveSet(t);
  });
  // 앱이 계산한 카드를 이야기에 붙임 (가장 최근 카드만 누를 수 있음)
  const showCard = ch => {
    const data = modeProposal(ch);
    if (!data) return;
    const text = [data.title, ...data.lines, ...(data.choices || []).map(o => `선택지 [${o.label}] ${o.sub}`)].join('\n');
    const item = { who: 'app', text, t: Date.now(), card: { title: data.title, lines: [...data.lines, ...(data.choices || []).map(o => `${o.label}: ${o.sub}`)] } };
    chat.items.push(item);
    card = { item, data };
    saveChat(chat);
    draw();
  };
  // 토큰 아끼기: 앞선 이야기는 최근 것만 넘기고, 이번에 창 밖으로 밀려나는 이야기는 AI가 짧은 메모로 줄여 둠.
  // 넘칠 때만(이야기 일고여덟 번에 한 번) AI를 한 번 더 부름. 실패하면 10분 동안은 다시 안 해 봄(요약 없이 그대로 이야기)
  const catchUp = async history => {
    const upTo = (chat.sum && chat.sum.upTo) || 0;
    const drop = history.slice(0, chatStart(history)).filter(h => (h.t || 0) > upTo);
    if (!drop.length || Date.now() - (chat.sumFail || 0) < 600000) return;
    const text = await aiCoachSummary({ summary: chat.sum ? chat.sum.text : '', history: drop });
    if (!text) { chat.sumFail = Date.now(); saveChat(chat); return; }
    chat.sum = { text, upTo: drop[drop.length - 1].t || Date.now() };
    chat.sumFail = 0;
    saveChat(chat);
  };
  const talk = async (msg, again = false) => {
    msg = String(msg || '').trim();
    if (!msg || busy) return;
    busy = true;
    if (!again) chat.items.push({ who: 'me', text: msg, t: Date.now() });
    saveChat(chat);
    mood = 'normal';
    draw();
    const history = forAi().slice(0, -1);
    await catchUp(history);
    // 학생 말과 바로 앞 코치 말에 나온 단어를 찾아 그 자료를 같이 (퀴즈를 내고 학생이 답할 때도 그 단어를 알게)
    const prevCoach = [...history].reverse().find(h => h.who === 'coach');
    const res = await aiCoachChat({ char: coachChar(), facts: coachFacts(true), data: coachData(), lookup: coachLookup([msg, prevCoach ? prevCoach.text : '']), weak: weakText(), notes: chat.notes.map(n => n.text), summary: chat.sum ? chat.sum.text : '', history, message: msg, day: fmtDay(today), onText: liveSet });
    // 받은 말을 끝까지 보여 준 뒤에 이야기에 넣음 (실패면 받다 만 말은 지움)
    await liveEnd(res ? res.text : '');
    busy = false;
    if (!res) {
      chat.items.push({ who: 'coach', text: coachErrorText(), t: Date.now(), err: true, retry: msg });
      mood = 'worry';
    } else {
      mood = res.mood;
      if (res.text) chat.items.push({ who: 'coach', text: res.text, t: Date.now(), mood: res.mood });
      if (res.remember && !chat.notes.some(n => n.text === res.remember)) {
        chat.notes.push({ text: res.remember, t: Date.now() });
        chat.items.push({ who: 'note', text: `기억해 둘게요: ${res.remember}`, t: Date.now() });
      }
      if (res.plan) { saveChat(chat); if (open) showCard(res.plan); else { const data = modeProposal(res.plan); if (data) chat.items.push({ who: 'app', text: [data.title, ...data.lines].join('\n'), t: Date.now() }); } }
    }
    saveChat(chat);
    if (open) draw();
  };
  // 자주 하는 말
  const quick = ['약한 단어 짚어 줘', '오늘 뭐부터 할까?', ...(canPlanNow() ? ['일정을 바꾸고 싶어'] : []), '퀴즈 내 줘'];
  chips.innerHTML = '';
  for (const [label, fn] of coachSay().acts.filter(a => a[1] !== talkCoach)) {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    chips.appendChild(b);
  }
  for (const q of quick) {
    const b = el('button', 'chip', q);
    b.type = 'button';
    b.addEventListener('click', () => talk(q));
    chips.appendChild(b);
  }
  if (canPlanNow() && coachOptions().length > 1) {
    const b = el('button', 'chip', '선택지에서 고르기');
    b.type = 'button';
    b.addEventListener('click', () => pickSchedule());
    chips.appendChild(b);
  }
  // 기억: 코치가 기억해 둔 것 보기·지우기
  const drawMem = () => {
    const list = $('#cc-mem-list');
    list.innerHTML = '';
    if (!chat.notes.length) list.appendChild(el('p', 'muted', '아직 기억해 둔 게 없어요. 이야기하다가 알아 두면 좋은 사정(예: 수요일은 학원)이 나오면 코치가 적어 둬요.'));
    chat.notes.forEach((n, i) => {
      const row = el('div', 'mem-row');
      row.appendChild(el('span', null, n.text));
      const x = el('button', 'mem-del');
      x.type = 'button';
      x.innerHTML = ICON.trash;
      x.setAttribute('aria-label', '지우기');
      x.title = '지우기';
      x.addEventListener('click', () => { chat.notes.splice(i, 1); saveChat(chat); drawMem(); });
      row.appendChild(x);
      list.appendChild(row);
    });
    if (chat.sum && chat.sum.text) {
      list.appendChild(el('div', 'mem-sum-head', '지난 이야기 요약'));
      const row = el('div', 'mem-row mem-sum');
      row.appendChild(el('span', null, chat.sum.text));
      const x = el('button', 'mem-del');
      x.type = 'button';
      x.innerHTML = ICON.trash;
      x.setAttribute('aria-label', '지우기');
      x.title = '지우기';
      x.addEventListener('click', () => { chat.sum = { text: '', upTo: chat.sum.upTo }; saveChat(chat); drawMem(); }); // 줄인 데까지는 그대로 둬서 지운 이야기가 다시 요약되지 않게
      row.appendChild(x);
      list.appendChild(row);
    }
    const wipe = $('#cc-wipe');
    wipe.textContent = '이야기와 기억 모두 지우기';
    wipe.dataset.sure = '';
  };
  $('#cc-menu').onclick = () => { mem.hidden = !mem.hidden; if (!mem.hidden) drawMem(); };
  $('#cc-mem-close').onclick = () => { mem.hidden = true; };
  $('#cc-wipe').onclick = e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '한 번 더 누르면 지워요'; return; }
    chat.items = [{ who: 'coach', text: '다 지웠어요. 처음부터 다시 이야기해요.', t: Date.now() }];
    chat.notes = [];
    chat.sum = null;
    card = null;
    saveChat(chat);
    mem.hidden = true;
    draw();
  };
  mem.hidden = true;
  inp.value = '';
  // 높이 = 글 높이 + 테두리 (scrollHeight엔 테두리가 빠져 있어서 그대로 쓰면 몇 px 모자라 스크롤 막대가 생김)
  const grow = () => {
    inp.style.height = 'auto';
    const h = inp.scrollHeight + inp.offsetHeight - inp.clientHeight;
    inp.style.height = Math.min(h, 120) + 'px';
    inp.style.overflowY = h > 120 ? 'auto' : 'hidden';
    send.disabled = busy || !inp.value.trim();
  };
  inp.oninput = grow;
  const submit = () => { const v = inp.value; inp.value = ''; grow(); talk(v); };
  send.onclick = () => { submit(); if (DESK) inp.focus(); };
  // 폰에서 키보드가 올라오면 보이는 높이에 맞춤
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    d.style.height = vv.height + 'px'; d.style.top = vv.offsetTop + 'px';
    document.body.classList.toggle('kb-up', vv.height < window.innerHeight - 120); // 폰 키보드가 올라오면 아래 탭은 숨김
    log.scrollTop = log.scrollHeight;
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
  saveChat(chat);
  draw();
  grow();
  if (DESK) setTimeout(() => inp.focus(), 50); // 폰은 키보드가 바로 올라오지 않게
  const key = e => {
    if (e.key === 'Escape' && !mem.hidden) { e.preventDefault(); e.stopPropagation(); mem.hidden = true; }
    else if (e.target === inp && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
  };
  // 다른 탭으로 가면 (show가 부름): 받는 중인 말은 마저 받아 저장만 하고 화면은 그만 그림
  coachLeave = () => {
    open = false;
    d.style.height = d.style.top = '';
    document.body.classList.remove('kb-up');
    document.removeEventListener('keydown', key, true);
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
  };
  document.addEventListener('keydown', key, true);
}

// ---------- 코치 + AI ----------
// AI가 켜져 있으면(설정 > AI) 코치의 말을 AI가 캐릭터 말투로 지음. 일정·개수는 앱이 계산한 걸 사실(facts)로 넘기고,
// AI가 사실에 없는 숫자를 말하면 버림(js/ai.js numbersOk). 안 되면 위의 기본 말 그대로
const WEEKDAY = '일월화수목금토';
const weekday = d => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
function coachFacts(both = false) {
  const today = dateStr(), ex = settings.exam, rw = rangeWords();
  const from = Math.min(settings.from, settings.to), to = Math.max(settings.from, settings.to);
  const lines = [`오늘: ${fmtDay(today)} ${weekday(today)}요일`];
  if (both) {
    lines.push(`지금 보는 화면: ${WORD ? '단어 모드(영단어를 보고 뜻 맞히기)' : '예문 모드(두 예문의 빈칸에 들어갈 영단어 맞히기)'}. 코치는 예문·단어 모드가 하나예요.`);
    lines.push(`두 모드는 진도·학습 범위·하루 새 단어 일정이 따로이고, 시험일·쉬는 요일은 같이 써요. 아래 진도와 일정은 ${MODE_NAME} 것이고, ${OTHER_NAME} 것은 맨 아래에 따로 있어요. 일정 카드로 바꾸는 하루 개수·복습 날 수는 지금 보는 ${MODE_NAME}에만, 쉬는 요일은 두 모드에 같이 적용돼요.`);
  }
  const learned = rw.filter(w => stats[w.id]).length;
  lines.push(`학습 범위: DAY ${from}~${to}, ${rw.length}단어 (배운 단어 ${learned}개, 아직 안 배운 새 단어 ${rw.length - learned}개)`);
  if (!ex) lines.push('시험일: 아직 안 정함 (그래서 목표일도 없음. 학습 계획 화면에서 시험일을 정하면 코치가 목표일과 하루 새 단어 수를 정함)');
  else if (ex === today) lines.push('오늘이 시험 날');
  else if (ex < today) lines.push('시험이 끝남');
  else {
    const g = settings.coachGoal, f = flowState();
    // 목표일과 시험일을 헷갈리지 않게 이름을 붙여 따로 적음. 목표일 = 새 단어를 보는 마지막 날(coachGoal 전날), 홈의 '목표 D-n'과 같은 셈
    const dEx = daysBetween(today, ex);
    lines.push(`시험일(시험 보는 날): ${fmtDay(ex)} ${weekday(ex)}요일, 시험까지 ${dEx}일`);
    if (g && today >= g) {
      lines.push('목표일(새 단어를 다 배우는 날)은 지남. 지금은 전체 복습 기간: 새 단어는 다 봤고, 시험 전날까지 범위 전체를 날마다 나눠 복습');
      lines.push(`홈 위쪽 표시: '시험 D-${dEx}'`);
    } else if (g) {
      const last = lastLearnDay(), dg = daysBetween(today, last);
      const rd = daysBetween(g, ex), base = settings.coachBase || 0, need = coachDaily(), target = todayNewTarget();
      lines.push(`목표일(새 단어를 다 배우는 마지막 날, 시험일과 다름): ${fmtDay(last)} ${weekday(last)}요일, ` + (dg > 0 ? `목표일까지 ${dg}일` : '오늘이 목표일'));
      lines.push(`홈 위쪽 표시: ${dg > 0 ? `'목표 D-${dg}'` : "'목표 D-day'"} (목표일이 지나면 '시험 D-n'으로 바뀜)`);
      lines.push(`일정: ${fmtDay(last)}까지 새 단어, ${fmtDay(g)}부터 시험 전날까지 ${rd}일 전체 복습 (${settings.coachFix ? `학생이 하루 새 단어를 ${settings.coachFix}개로 고정함` : settings.coachReview ? '복습 날 수는 학생이 정함' : '코치가 추천한 일정'})`);
      lines.push(`처음 계획은 하루 새 단어 ${base}개, 코치 계산으로 오늘 필요한 건 ${need}개` + (base && need > base * 1.25 + 2 ? ' (밀려서 늘어남)' : base && need < base ? ' (앞서 있어서 줄어듦)' : ' (계획대로)'));
      if (newTargetMine() && target !== need) lines.push(`학생이 오늘만 새 단어 목표를 ${target}개로 직접 정함 (${target > need ? '계획보다 많이 하려는 것, 밀린 게 아님' : '오늘은 덜 하려는 것'})`);
    }
    const fresh = f.plan.fresh.length, rv = f.rv.left.length, mine = f.plan.mine.length;
    lines.push(!f.learnLeft && f.rv.done ? '오늘 몫(새 단어·복습)을 다 끝냄' : `오늘 남은 할 일: 새 단어 ${fresh}개, ${mine ? `내 단어(독해 노트에서 올린 단어) ${mine}개, ` : ''}복습 ${rv}개`);
    if (myWords.length) lines.push(`내 단어: 영어 문제를 풀다 모르는 단어를 노트에 적어 올린 것 ${myWords.length}개 (졸업 ${myWords.filter(w => stats[w.id] && stats[w.id].g).length}개)`);
    lines.push(`오늘 배운 새 단어 ${newToday()}개`);
  }
  let wrong = 0, mastered = 0, last = 0;
  for (const w of rw) {
    const st = stats[w.id];
    if (!st) continue;
    if (isWrongNote(st)) wrong++;
    if (isMastered(st)) mastered++;
    if (st.s > last) last = st.s;
  }
  lines.push(`다시 볼 단어(마지막에 틀린 단어) ${wrong}개, 암기 완료 ${mastered}개`);
  if (last) { const n = daysBetween(dateStr(last), today); lines.push(n ? `마지막으로 공부한 날: ${n}일 전` : '오늘 이미 공부함'); }
  else lines.push('아직 공부한 적 없음');
  if (coachActive()) {
    const rest = restNow();
    lines.push(rest.length ? `쉬는 요일: ${restLabel(rest)} (그날은 새 단어·전체 복습 몫 없이 쉼)` : '쉬는 요일: 없음 (매일 공부)');
    if (isRestDay(today, rest)) lines.push('오늘은 쉬는 날');
  }
  if (coachMoved) lines.push('목표일이 지났는데 새 단어가 남아서 일정을 방금 다시 짬');
  if (both) lines.push(...otherFacts());
  return lines.join('\n');
}
// 다른 모드 진도 요약 (그 모드 설정·기록을 읽기만 함)
function otherFacts() {
  const today = dateStr(), o = load(OTHER_P + 'settings.v1', {}), st = load(OTHER_P + 'stats.v1', {});
  const lo = o.from != null && o.to != null ? Math.min(o.from, o.to) : days[0], hi = o.from != null && o.to != null ? Math.max(o.from, o.to) : days[days.length - 1];
  const rw = words.filter(w => w.day >= lo && w.day <= hi);
  let learned = 0, wrong = 0, mastered = 0, last = 0;
  for (const w of rw) {
    const s = st[w.id];
    if (!s || s.del) continue;
    learned++;
    if (s.st === 0 && s.r !== today) wrong++;
    if (isMastered(s)) mastered++;
    if ((s.s || 0) > last) last = s.s;
  }
  const fresh = Object.values(st).filter(s => s && !s.del && s.f === today).length;
  const out = [`[${OTHER_NAME}] 학습 범위: DAY ${lo}~${hi}, ${rw.length}단어 (배운 단어 ${learned}개, 아직 안 배운 새 단어 ${rw.length - learned}개), 다시 볼 단어 ${wrong}개, 암기 완료 ${mastered}개, 오늘 배운 새 단어 ${fresh}개`];
  if (last) { const n = daysBetween(dateStr(last), today); out.push(`[${OTHER_NAME}] ${n ? `마지막으로 공부한 날: ${n}일 전` : '오늘 공부함'}`); }
  else out.push(`[${OTHER_NAME}] 아직 공부한 적 없음`);
  if (o.coach && o.coachGoal && ex() && today < o.coachGoal) out.push(`[${OTHER_NAME}] 일정: ${fmtDay(addDays(o.coachGoal, -1))}까지 새 단어${o.coachFix ? ` (학생이 하루 ${o.coachFix}개로 고정함)` : o.coachBase ? ` (처음 계획 하루 ${o.coachBase}개)` : ''}, 그 뒤 시험 전날까지 전체 복습`);
  return out;
  function ex() { return settings.exam && settings.exam > today; }
}
// 코치와 이야기할 때 넘기는 자세한 자료: 앱이 아는 진도·기록·설정을 코치도 다 알게 (홈 말풍선엔 안 넘김. 길어서)
// 모양: '- 이름: 값' 줄들. 숫자는 앱이 센 그대로라 코치가 그대로 써도 됨
const md = d => { const [, m, dd] = String(d || '').split('-'); return m ? `${+m}/${+dd}` : ''; };
function wordState(s) {
  if (!s) return '안 배움';
  if (isWrongNote(s)) return '다시 볼 단어';
  if (isMastered(s)) return '암기 완료';
  return `외우는 중 ${s.st || 0}단계`;
}
function coachData() {
  const today = dateStr(), rw = rangeWords(), os = load(OTHER_P + 'stats.v1', {}), lines = [];
  // 단어장 전체와 범위 밖
  const learnedAll = words.filter(w => stats[w.id]).length;
  lines.push(`- 단어장 전체: DAY ${days[0]}~${days[days.length - 1]}, ${words.length}단어. ${MODE_NAME}에서 배운 단어는 전체 ${learnedAll}개 (학습 범위 밖 포함)`);
  // DAY별 진도 (학습 범위)
  // 아직 하나도 안 배운 DAY가 이어지면 한 덩어리로 (길이 줄이기)
  const per = [];
  let gap = null;
  const flush = () => { if (gap) per.push(gap[0] === gap[1] ? `DAY ${gap[0]} 아직 안 배움` : `DAY ${gap[0]}~${gap[1]} 아직 안 배움`); gap = null; };
  for (const d of [...new Set(rw.map(w => w.day))]) {
    const dw = dayWords(d);
    let l = 0, m = 0, x = 0;
    for (const w of dw) { const s = stats[w.id]; if (!s) continue; l++; if (isMastered(s)) m++; if (isWrongNote(s)) x++; }
    if (!l) { gap = gap ? [gap[0], d] : [d, d]; continue; }
    flush();
    per.push(`DAY ${d} ${l}/${dw.length}·${m}·${x}`);
  }
  flush();
  lines.push(`- DAY별 진도 (배운 단어/전체·암기 완료·다시 볼 단어): ${per.join(', ')}`);
  // 정답 기록
  let c = 0, w = 0, h = 0;
  for (const x of rw) { const s = stats[x.id]; if (s) { c += s.c || 0; w += s.w || 0; h += s.h || 0; } }
  if (c + w) lines.push(`- 학습 범위에서 지금까지 맞힘 ${c}번(그중 힌트 쓰고 맞힘 ${h}번), 틀림 ${w}번, 정답률 ${Math.round(100 * c / (c + w))}%`);
  // 최근 2주 동안 새 단어를 배운 날 (복습만 한 날은 기록이 남지 않아 모름)
  const byF = new Map();
  for (const s of Object.values(stats)) if (s && s.f && s.f > addDays(today, -14)) byF.set(s.f, (byF.get(s.f) || 0) + 1);
  const fl = [...byF].sort((a, b) => a[0].localeCompare(b[0])).map(([d, n]) => `${md(d)} ${n}개`);
  lines.push(`- 최근 2주 새 단어를 배운 날: ${fl.length ? fl.join(', ') : '없음'} (복습만 한 날은 기록에 안 남음)`);
  // 앞으로 7일 복습 예정
  const due = new Map();
  let late = 0;
  for (const x of rw) { const s = stats[x.id]; if (!s || !s.due) continue; if (s.due < today) late++; else if (s.due <= addDays(today, 7)) due.set(s.due, (due.get(s.due) || 0) + 1); }
  const dl = [...due].sort((a, b) => a[0].localeCompare(b[0])).map(([d, n]) => `${md(d)} ${n}개`);
  lines.push(`- 복습일 예정(앞으로 7일, 주기 복습 기준): ${dl.length ? dl.join(', ') : '없음'}${late ? `. 복습일이 지났는데 아직 안 본 단어 ${late}개` : ''}`);
  // 오늘 할 단어
  const f = flowState();
  if (f.plan.fresh.length) lines.push(`- 오늘 배울 새 단어: ${f.plan.fresh.slice(0, 30).map(x => x.word).join(', ')}${f.plan.fresh.length > 30 ? ' …' : ''}`);
  if (f.rv.left.length) lines.push(`- 오늘 남은 복습 단어: ${f.rv.left.slice(0, 30).map(id => (byId.get(id) || {}).word).filter(Boolean).join(', ')}${f.rv.left.length > 30 ? ' …' : ''}`);
  const sess = load(KEY.session, null);
  if (sess && sess.queue && sess.date === today) lines.push(`- 중간에 멈춘 학습: '${sess.label || '학습'}' ${sess.total}문제 중 ${sess.pos}문제 품 (홈의 '이어서 학습하기')`);
  // 형광펜 (두 모드 공용)
  const hl = words.filter(x => isUnknown(x.id));
  lines.push(`- 형광펜 친 단어 ${hl.length}개${hl.length ? `: ${hl.slice(0, 20).map(x => x.word).join(', ')}${hl.length > 20 ? ' …' : ''}` : ''}`);
  // 설정
  const ag = cleanAgain(settings.again), agName = sameAgain(ag, AGAIN_REC) ? '추천' : sameAgain(ag, AGAIN_OLD) ? '가볍게' : sameAgain(ag, AGAIN_FULL) ? '꼼꼼하게' : '직접 고름';
  lines.push(`- 설정: 문제 방식 ${settings.kind === 'type' ? '직접 입력' : '4지선다'}${settings.reviewMix ? '(복습은 외운 단어만 4지선다)' : ''}` +
    `, 하루 새 단어 수 ${coachActive() ? '코치가 정함' : `${settings.newPerDay}개`}, 오늘의 복습은 복습일이 된 단어 전부` +
    `, 복습 주기 ${PRESET_LABEL[settings.srsPreset] || '보통'}(${(PRESETS[settings.srsPreset] || PRESETS.m).join('·')}일 간격)` +
    (!coachActive() && sweepOn() ? `, 학생이 정한 목표일 ${fmtDay(addDays(goalDate(), -1))}(그다음 날부터 시험 전날까지 전체 복습)` : '') +
    `, 틀린 단어 다시 나오기 ${agName}` + (WORD ? `, 직접 입력 채점 ${{ easy: '너그럽게', mid: '보통', hard: '엄격하게' }[settings.strict] || '보통'}` : `, 예문 해석 ${settings.showKo ? '보이기' : '가리기'}`) +
    `, 발음 ${settings.accent === 'en-GB' ? '영국식' : '미국식'}${settings.autoSpeak ? '(자동 읽기)' : ''}, 동기화 ${sync.enabled ? '켜짐' : '꺼짐'}, 코치에 쓰는 AI ${aiCoachName()}`);
  // 일정 선택지 (앱 계산). 학생이 '어떤 일정이 좋아?'라고 물으면 이걸로 비교
  if (canPlanNow()) {
    const opts = coachOptions();
    if (opts.length) lines.push(`- 일정 선택지(앱 계산, 복습 날 수별): ${opts.map(o => `${o.name}${o.rec && !o.name.includes('추천') ? '(추천)' : ''} 복습 ${o.r}일 → ${fmtDay(addDays(o.p.goal, -1))}까지 하루 ${o.p.perDay}개`).join(' / ')}`);
  }
  // 다른 모드에서 다시 볼 단어
  const ow = rw.filter(x => os[x.id] && !os[x.id].del && os[x.id].st === 0 && os[x.id].r !== today).slice(0, 15);
  if (ow.length) lines.push(`- [${OTHER_NAME}] 다시 볼 단어: ${ow.map(x => x.word).join(', ')}`);
  return lines.join('\n');
}
// 학생 말(과 바로 앞 코치 말)에 나온 단어·DAY의 자세한 자료: 단어장에 있는 뜻·유의어·반의어·파생어·예문과 두 모드의 기록
function coachLookup(texts) {
  const { words: hit, days: dl } = findMentioned(words, texts);
  if (!hit.length && !dl.length) return '';
  const os = load(OTHER_P + 'stats.v1', {});
  const rec = s => (s && !s.del ? `${wordState(s)}, 맞힘 ${s.c || 0}번 · 틀림 ${s.w || 0}번${s.h ? ` · 힌트 ${s.h}번` : ''}${s.f ? `, 처음 배운 날 ${md(s.f)}` : ''}${s.s ? `, 마지막으로 본 날 ${md(dateStr(s.s))}` : ''}${s.due ? `, 다음 복습일 ${md(s.due)}` : ''}` : '안 배움');
  const out = hit.map(w => [
    `[${w.word}] DAY ${w.day}${rangeWords().includes(w) ? '' : ' (학습 범위 밖)'}${isUnknown(w.id) ? ', 형광펜' : ''}`,
    `뜻: ${w.meaning}`,
    ...(w.extras || []).map(([k, v]) => `${k}: ${v}`),
    w.ex1 ? `예문: ${w.ex1}${w.ex1ko ? ` (${w.ex1ko})` : ''}` : '',
    w.ex2 ? `예문2: ${w.ex2}${w.ex2ko ? ` (${w.ex2ko})` : ''}` : '',
    `${MODE_NAME} 기록: ${rec(stats[w.id])}`,
    `${OTHER_NAME} 기록: ${rec(os[w.id])}`,
  ].filter(Boolean).join('\n'));
  for (const d of dl) {
    const dw = dayWords(d);
    out.push(`[DAY ${d}] ${dw.length}단어${rangeWords().some(w => w.day === d) ? '' : ' (학습 범위 밖)'}: ` + dw.map(w => `${w.word}(${shortMeaning(w.meaning).replace(/\s*\/\s*$/, '')}${stats[w.id] ? `, ${wordState(stats[w.id])}` : ''})`).join(', '));
  }
  return out.join('\n\n');
}
// 홈 말은 상황이 바뀔 때만 새로 지음 (날짜, 할 일 단계, 일정, 캐릭터, 기본 말의 표정). 실패하면 10분 뒤에 다시
const SAY_KEY = P + 'coachsay.v1';
let sayPending = '';
function coachSayKey(say) {
  const f = flowState();
  return [dateStr(), f.stage, !f.learnLeft && f.rv.done, todayNewTarget(), restNow().join(''), settings.coachFix || 0, settings.coachGoal, settings.exam, settings.from, settings.to, coachChar(), say.mood, coachMoved].join('|');
}
function aiSayFor(say) {
  if (!aiCoachOnline() || !settings.coach) return null;
  const key = coachSayKey(say), c = load(SAY_KEY, {});
  if (c.key === key && c.text) return c;
  if ((c.key === key && Date.now() - (c.at || 0) < 600000) || sayPending === key) return null;
  sayPending = key;
  aiCoachSay({ char: coachChar(), facts: coachFacts(), fallback: say.text }).then(r => {
    sayPending = '';
    save(SAY_KEY, r ? { key, mood: r.mood, text: r.text } : { key, at: Date.now() });
    if (r && current === 'coach' && !aiCoachOnline()) drawCoachPlain();
  });
  return null;
}

// 코치: 홈 대신 아래 '코치' 탭에서 말함. 탭이 보일지(코치를 켰는지)와, 코치 탭을 보고 있으면 오늘 말을 새로
function renderCoach() {
  renderTabs();
  if (current === 'coach' && !aiCoachOnline()) drawCoachPlain();
}
// 코치 탭 열기: AI를 켰으면 주고받는 채팅, 아니면 오늘 코치 말 + 할 일 버튼 (같은 채팅 모양)
function openCoach() {
  if (coachLeave) { const f = coachLeave; coachLeave = null; f(); }
  show('coach');
  if (aiCoachOnline()) openCoachChat(); else drawCoachPlain();
}
function drawCoachPlain() {
  const say = coachSay();
  $('#cc-char').innerHTML = coachSvg(say.mood);
  $('#cc-name').textContent = `${COACH_NAMES[coachChar()]} 코치`;
  $('#cc-sub').textContent = '오늘 할 일을 같이 챙겨요';
  $('#cc-menu').hidden = true;
  $('#cc-mem').hidden = true;
  $('#cc-ask').hidden = true;
  $('#cc-noai').hidden = false;
  const log = $('#cc-log');
  log.innerHTML = '';
  log.append(el('div', 'chat-day', '오늘'), el('div', 'chat-msg bot', say.text));
  const chips = $('#cc-chips');
  chips.innerHTML = '';
  for (const [label, fn] of say.acts) {
    const b = el('button', 'chip', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    chips.appendChild(b);
  }
  chips.hidden = !say.acts.length;
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
      if (onEdit) { d.title = '눌러서 개수 정하기'; { const ic = el('i', 'edit-ic'); ic.innerHTML = ICON.edit; d.appendChild(ic); } d.addEventListener('click', onEdit); }
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
  // 목표일이 있으면 그 전엔 목표 D-n, 그 뒤엔 시험 D-n.
  // 'O월 O일까지 새 단어'로 새 단어를 보는 마지막 날(전체 복습 시작 전날)을 보여 주니, D-n도 그날로 셈 (D-11과 27일까지가 하루 어긋나 보이지 않게)
  const toGoal = sweepOn() && dateStr() < goalDate();
  const goalEnd = addDays(goalDate(), -1);
  const left = toGoal ? daysBetween(dateStr(), goalEnd) : settings.exam ? daysBetween(dateStr(), settings.exam) : null;
  dd.hidden = left == null || left < 0 || stage === 'day';
  if (!dd.hidden) { dd.textContent = left === 0 ? (toGoal ? '목표 D-day' : 'D-day') : `${toGoal ? '목표' : '시험'} D-${left}`; dd.className = 'tag' + (left <= 3 ? ' dday' : ''); }
  let note = '';

  if (stage === 'day') {
    const dw = dayWords(soloDay);
    const seen = dw.filter(w => stats[w.id]).length;
    fill($('#day-info'), [[dw.length, `DAY ${soloDay} 단어`]]);
    $('#btn-day').textContent = `DAY ${soloDay} 학습 시작`;
    $('#btn-day-reset').hidden = !dayHasRecords(soloDay);
    note = `${dw.length}단어 중 ${seen}개 배움 · 정규 학습과 기록이 같이 쌓여요`;
  }

  if (stage === 'learn') {
    const items = [[plan.fresh.length, '새 단어', editNewToday]];
    if (plan.mine.length) items.push([plan.mine.length, '내 단어']);
    if (plan.examInfo && plan.examInfo.finalDay) items.unshift([plan.final.length, `시험 대비 ${plan.examInfo.finalDay}/3`]);
    fill($('#plan-info'), items);
    $('#btn-start').textContent = learnLeft ? '오늘 학습 시작' : '오늘 학습 완료 ✓';
    $('#btn-start').disabled = !learnLeft;
    const waiting = rv.started ? rv.left.length : plan.review.length;
    note = !learnLeft ? '숫자를 누르면 오늘 더 배울 수 있어요.'
      : waiting ? `복습할 단어 ${waiting}개가 기다려요 · 위의 '복습'을 누르면 먼저 할 수 있어요.` : '';
  } else if (stage === 'review') {
    // 복습일이 된 단어 전부 · 전체 복습 기간엔 범위를 나눈 오늘 몫도
    const shown = rv.left.length;
    const dueIn = rv.left.filter(id => isDue(stats[id], dateStr())).length;
    fill($('#review-info'), [[shown, '복습', editReviewToday], [dueIn, '복습일 된 단어']]);
    $('#btn-review').textContent = shown ? '오늘 복습 시작' : '오늘 복습 완료 ✓';
    $('#btn-review').disabled = !shown;
    const sp = reviewPick();
    if (sp.phase === 'final') note = `목표일부터 시험 전까지 학습 범위 ${rangeWords().length}단어를 ${sp.days}일에 나눠 전부 복습해요 (하루 ${sp.size}개쯤).`;
    const pace = paceNote();
    if (pace) note = pace;
  } else if (stage === 'extra') {
    const n = settings.extraN;
    setSeg('#seg-extra', String(n)); // 5·10·20·40이 아니면(슬라이더로 고른 값) 아무것도 안 켜짐
    $('#extra-range').value = n;
    $('#extra-n').textContent = `${n}개`;
    const nNew = extraNew(n).length, nRev = extraReview(n).length;
    const bn = $('#btn-extra-new'), br = $('#btn-extra-review');
    bn.textContent = nNew ? '추가 학습' : '새 단어 없음';
    br.textContent = nRev ? '추가 복습' : '복습할 단어 없음';
    bn.disabled = !nNew;
    br.disabled = !nRev;
    note = nNew ? '오늘 할 건 다 했어요 👏 더 하고 싶으면 개수를 골라요.' : '이 범위의 새 단어를 다 배웠어요. 학습 범위를 넓히면 더 할 수 있어요.';
  }
  $('#today-note').textContent = note;
  // 시작할 게 있으면 카드 전체가 시작 버튼 (인디고로 칠함). 다 했거나 '더 하기'면 흰 카드
  const go = { day: true, learn: !!learnLeft, review: !!rv.left.length, extra: false }[stage];
  $('#card-today').classList.toggle('go', go);
  // 코치가 켜져 있으면 하루 새 단어 수는 코치가 정함 (버튼은 흐리게)
  const ca = coachActive();
  $('#seg-new').classList.toggle('dim', ca);
  $('#coach-new-note').hidden = !ca;
  if (ca) $('#coach-new-note').textContent = `코치가 남은 날에 맞춰 정해요 · 오늘 ${todayNewTarget()}개`;
  $('#opt-coach-plan').checked = !!settings.coach;
  renderCoach(stage);
}

// 복습이 평소보다 많이 밀렸을 때 왜 쌓이는지와 맞는 페이스를 숫자로 (새 단어 하나는 하루 복습 5개쯤으로 돌아옴)
function paceNote() {
  const N = todayNewTarget();
  const p = reviewPace(reviewPool(), stats, { today: dateStr(), newPerDay: N });
  if (!p.heavy) return '';
  const head = `밀린 복습 ${p.backlog}개 · 까먹었을 가능성이 큰 것부터 나오니 할 수 있는 만큼만 해도 돼요.`;
  if (!N) return head;
  return `${head} 새 단어 1개는 하루 복습 5개쯤으로 돌아와서, 하루 ${N}개씩이면 복습은 하루 ${p.steady}개쯤까지 늘어요.`;
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
  const left = reviewState().left.length;
  const n = await askNumber({
    title: '오늘 복습할 단어', value: left, min: 0,
    hint: '오늘만 바뀌어요 · 복습일이 된 단어에서 까먹었을 가능성이 큰 것부터',
    extra: { label: '전부(제한 없음)', value: -1 },
  });
  if (n == null) return;
  // 오늘 이미 복습한 단어는 두고, 남은 단어를 n개(전부면 다)로 다시 고름
  const day = loadDay();
  const done = Array.isArray(day.review) ? day.review.filter(id => byId.has(id) && seenToday(id)) : [];
  const want = n < 0 ? 0 : n;
  const picked = reviewPick(want).words;
  const rest = picked.map(w => w.id).filter(id => !done.includes(id));
  day.review = [...done, ...(n < 0 ? rest : rest.slice(0, want))];
  save(KEY.day, day);
  viewStage = 'review';
  renderPlan();
}

// ---------- 설정 줄: 이름(왼쪽) ─ 값(오른쪽) ----------
// 설정의 고르기 버튼(.seg)은 그대로 두고(기능 코드는 그대로) 모양만 줄로 바꿈.
// 선택지가 둘셋이고 짧으면 줄 오른쪽에 작은 버튼으로, 많거나 길면 '값 ›' → 아래 시트에서 고름(시트에서 누르면 원래 버튼이 눌림).
// 다시 나오기 표·단축키처럼 복잡한 건 '값 ›' → 시트 안으로 잠깐 옮겨서 보여 줌
function openPickSheet(title, desc, fill) {
  const d = $('#pick-sheet'), body = $('#ps-body');
  $('#ps-title').textContent = title;
  $('#ps-desc').textContent = desc || '';
  $('#ps-desc').hidden = !desc;
  body.innerHTML = '';
  let restore = null;
  const key = e => { if (e.key === 'Escape' && !document.querySelector('.key-chip.listening')) { e.preventDefault(); e.stopPropagation(); done(); } };
  const close = () => {
    d.hidden = true; d.onclick = null;
    document.removeEventListener('keydown', key, true);
    stopKeyCapture();
    if (restore) { const r = restore; restore = null; r(); }
  };
  const done = () => { close(); modalDone(() => {}); };
  restore = fill(body, done) || null;
  d.hidden = false;
  modalOpen(close);
  d.onclick = e => { if (e.target === d) done(); };
  document.addEventListener('keydown', key, true);
}
function settingsRows() {
  const txt = n => n.textContent.replace(/\s+/g, ' ').trim();
  // 값 글자가 바뀌면(설정을 다시 그리거나 다른 기기에서 맞춰질 때) 따라 바꿈
  const watch = (node, upd) => { new MutationObserver(upd).observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] }); upd(); };
  const valBtn = () => { const v = el('button', 'set-val'); v.type = 'button'; return v; };
  // 이름표에서 이름과 설명(괄호 속 흐린 글자)을 나눔
  const split = lab => {
    const m = lab.querySelector('.muted, small');
    const name = [...lab.childNodes].filter(n => n !== m).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    return { name, desc: m ? txt(m).replace(/^\((.*)\)$/, '$1') : '' };
  };
  const nameBox = ({ name, desc }) => { const t = el('span', 't', name); if (desc) t.appendChild(el('small', 'd', desc)); return t; };
  // 1) 복잡한 덩어리 → 한 줄 + 시트
  const detail = (name, nodes, value) => {
    const row = el('div', 'set-row'), v = valBtn();
    row.append(nameBox({ name, desc: '' }), v);
    const home = nodes.map(n => [n, n.parentNode, n.nextSibling]);
    nodes[0].before(row);
    for (const n of nodes) n.classList.add('in-sheet');
    v.addEventListener('click', () => openPickSheet(name, '', body => {
      for (const n of nodes) body.appendChild(n);
      return () => { for (const [n, p, next] of home) p.insertBefore(n, next && next.parentNode === p ? next : null); };
    }));
    watch(nodes[0], () => { const x = value(); if (v.textContent !== x) v.textContent = x; });
  };
  detail('다시 나올 때', [$('#again-preset'), $('#again-rows')], () => { const on = $('#again-preset button.on'); return on ? txt(on) : '직접 고름'; });
  detail('단축키 바꾸기', [$('#key-rows'), $('#btn-keys-reset')], () => '');
  // 2) 이름표 + 고르기 버튼 → 한 줄
  for (const seg of document.querySelectorAll('#settings .card .seg')) {
    if (seg.closest('.in-sheet') || seg.id === 'again-preset') continue;
    const opt = seg.parentElement.classList.contains('opt-row') ? seg.parentElement : null;
    const lab = opt ? opt.firstElementChild : seg.previousElementSibling;
    if (!lab || (!opt && !lab.classList.contains('label'))) continue;
    if (!opt && lab === lab.parentElement.firstElementChild && lab.parentElement.classList.contains('card')) continue; // 카드 제목
    const info = split(lab);
    const row = el('div', 'set-row');
    const btns = [...seg.querySelectorAll('button')];
    const chars = btns.reduce((n, b) => n + txt(b).length, 0);
    if (btns.length >= 4 || chars > 11) {
      const v = valBtn();
      row.append(nameBox(info), v, seg);
      seg.classList.add('as-pick');
      watch(seg, () => { const on = seg.querySelector('button.on'), x = on ? txt(on) : '고르기'; if (v.textContent !== x) v.textContent = x; });
      v.addEventListener('click', () => openPickSheet(info.name, info.desc, (body, done) => {
        for (const b of seg.querySelectorAll('button')) {
          if (b.hidden) continue;
          const on = b.classList.contains('on');
          const o = el('button', 'ps-opt' + (on ? ' on' : ''), txt(b));
          o.type = 'button';
          o.setAttribute('aria-pressed', on);
          o.addEventListener('click', () => { b.click(); done(); });
          body.appendChild(o);
        }
      }));
    } else {
      row.append(nameBox(info), seg);
    }
    (opt || lab).replaceWith(row);
  }
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
async function startSession(mode, list, { mixed = false, label: givenLabel = '' } = {}) {
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
    ids = [...shuffle(plan.final), ...plan.mine, ...plan.fresh].map(w => w.id);
    if (!ids.length) { toast('오늘 새 단어는 다 했어요'); return; }
    label = '오늘의 학습';
  } else if (mode === 'review') {
    // 처음 시작할 때 오늘의 복습 목록을 고정 → 중간에 그만둬도 남은 단어만 이어서
    const day = loadDay();
    if (!Array.isArray(day.review)) { day.review = pickToday().map(w => w.id); save(KEY.day, day); }
    // 목록은 까먹었을 가능성이 큰 것부터라, 20개씩 묶어 그 안에서만 섞음 (밀린 게 많아 중간에 그만둬도 급한 것부터 한 셈)
    const left = day.review.filter(id => byId.has(id) && !seenToday(id));
    ids = [];
    // '복습은 외운 단어만 4지선다'면 묶음 안에서 4지선다를 먼저 (키보드가 한 번만 올라오게)
    for (let i = 0; i < left.length; i += 20) ids.push(...mixOrder(shuffle(left.slice(i, i + 20))));
    if (!ids.length) { toast('오늘 복습은 다 했어요'); return; }
    label = '오늘의 복습';
  } else if (mode === 'extraNew') {
    ids = extraNew(settings.extraN).map(w => w.id);
    if (!ids.length) { toast('배울 새 단어가 없어요'); return; }
    label = '추가 학습';
  } else if (mode === 'extraReview') {
    ids = mixOrder(shuffle(extraReview(settings.extraN)).map(w => w.id));
    if (!ids.length) { toast('복습할 단어가 없어요'); return; }
    label = '추가 복습';
  } else if (mode === 'day') {
    // 그 DAY만: 안 배운 단어는 교재 순서로 먼저, 배운 단어는 섞어서
    const dw = dayWords(soloDay);
    ids = [...dw.filter(w => !stats[w.id]), ...shuffle(dw.filter(w => stats[w.id]))].map(w => w.id);
    if (!ids.length) return;
    label = `DAY ${soloDay}`;
  } else if (mode === 'unknown') {
    ids = shuffle(bookWords().filter(w => isUnknown(w.id))).map(w => w.id);
    if (!ids.length) { toast('형광펜 친 단어가 없어요'); return; }
    label = '형광펜 단어 테스트';
  } else if (mode === 'mine' || mode === 'batch') {
    // 내 단어 전체 한 바퀴 · 그날 올린 단어 (졸업한 단어도. 연습이라 맞힌 건 일정에 영향 없고 틀리면 다시 복습으로)
    ids = shuffle(list).map(w => w.id);
    if (!ids.length) { toast('풀 단어가 없어요'); return; }
    label = givenLabel || '내 단어 한 바퀴';
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
  if (mixed) session.mixed = true; // 복습에서 틀린 단어 다시 풀기도 복습처럼 ('복습은 외운 단어만 4지선다')
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
  if (saved.date !== dateStr()) { dropSession(); renderHome(); toast('날짜가 바뀌어서 오늘의 학습을 새로 만들었어요'); return; }
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
  const pool = (list || dayWords(day)).filter(Boolean);
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
  $('#q-day').textContent = dayTag(w);
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
  setLabel($('#btn-hint'), '힌트'); $('#btn-hint').classList.remove('say');
  $('#btn-idk').hidden = false;
  const actions = $('#q-actions');
  unpinChoices();
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'phone-choices');
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

// 이번 학습에서 다시 나오게 큐에 넣음 (설정의 '다시 나오기'). 반환: 정답 화면 꼬리말
function againLater(id, kind) {
  const slots = cleanAgain(settings.again)[kind];
  session.queue = requeue(session.queue, session.pos, id, slots);
  if (slots.length) session.again[id] = (session.again[id] || 0) + 1;
  // 라벨이 길어지지 않게 가장 가까운 때 하나만 알려 줌 (뒤의 때에도 그대로 다시 나옴)
  return slots.length ? `${slots[0] === 'end' ? '맨 끝에' : AGAIN_NAME[slots[0]]} 다시` : '내일 다시';
}
// 맞혔는데 이번 학습 안에 그 단어가 아직 또 잡혀 있으면(전에 틀려서 '조금 뒤·맨 끝'처럼 여러 번 잡아 둔 것) 언제쯤 또 나오는지.
// 몇 문제 뒤인지 숫자로 말하지 않고 느낌으로만: 얼마나 뒤인지에 따라 고른 말 중 하나를 그때그때 섞어 씀. 없으면 ''
const AGAIN_WHEN = {
  next: ['바로 다음에', '곧바로', '바로 이어서'],
  soon: ['곧', '금방', '머지않아', '조금만 있으면'],
  mid: ['잠시 후', '조금 이따', '좀 있다가', '이따가'],
  late: ['한참 뒤에', '나중에', '좀 더 뒤에', '꽤 있다가'],
  end: ['마지막에', '끝날 때쯤', '맨 끝에', '끝나기 전에'],
};
function comingAgain(id) {
  const rest = session.queue.slice(session.pos + 1);
  const k = rest.filter(x => x === id).length;
  if (!k) return '';
  const gap = rest.indexOf(id); // 그 사이에 나오는 문제 수
  const last = k === 1 && rest.lastIndexOf(id) === rest.length - 1;
  const kind = gap === 0 ? 'next' : gap <= 2 ? 'soon' : last ? 'end' : gap <= 6 ? 'mid' : 'late';
  const words = AGAIN_WHEN[kind];
  return `${words[Math.floor(Math.random() * words.length)]} ${k === 1 ? '한 번 더' : '몇 번 더'}`;
}
// 유반의어 채점: 기록·동기화 없이 이번 테스트 안에서만 (다시 나오기는 설정의 '틀렸을 때'·'힌트 한 번'대로)
function synAnswer(correct, given, kind) {
  q.answered = true;
  const id = q.w.id;
  let label;
  if (!correct && kind !== 'hint') {
    if (!session.wrong.includes(id)) session.wrong.push(id);
    const when = againLater(id, 'wrong');
    label = `${kind === 'idk' ? '모름' : '오답'}${when === '내일 다시' ? '' : ` · ${when}`}`; // 유반의어 테스트는 기록이 없어서 '내일'은 안 씀
  } else {
    if (!session.done.includes(id)) session.done.push(id);
    if (kind === 'hint') {
      const when = againLater(id, 'hint1');
      label = `힌트 사용${when === '내일 다시' ? '' : ` · ${when}`}`;
      if (!session.hinted.includes(id)) session.hinted.push(id);
    } else { const more = comingAgain(id); label = more ? `정답! · ${more}` : '정답!'; }
  }
  session.pos++;
  showProgress();
  showSynFeedback(correct, given, kind, label);
}

function showSynFeedback(correct, given, kind, label) {
  const { w, syn: sq } = q;
  Object.assign(q, { fbGiven: given, fbLabel: label, fbCorrect: correct }); // 버그 신고·'AI에게 묻기'에 붙임
  const state = correct ? 'ok' : kind === 'hint' ? 'hint' : 'bad';
  answerFx(state);
  const head = $('#fb-head');
  head.hidden = false;
  head.className = 'tag fb-head ' + state;
  // 정답 보고 쓴 건 본인이 방금 한 일이라 화면엔 '조금 뒤 다시'만 (신고·AI에 붙는 fbLabel엔 그대로 남김)
  head.textContent = kind === 'copied' ? label.replace(/^정답 보고 씀 · /, '') : label;
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
      : o.w ? `${shortMeaning(o.w.meaning) || o.w.meaning} · ${dayTag(o.w)}` : '';
    row.appendChild(el('span', 'muted', why));
    card.appendChild(row);
  }
  setFbCoach(state);
  openSheet(w, [card]);
}

let q = null; // 현재 문제 상태
// 이 문제를 4지선다로 낼지 직접 입력으로 낼지. '복습은 외운 단어만 4지선다'를 켰으면 복습(오늘의 복습 · 추가 복습, 거기서 틀린 단어 다시 풀기)에서만
// 단어 단계로: 복습에서 두 번 넘게 맞힌 단어만 4지선다, 나머지와 이번 학습에서 틀렸거나 힌트 쓴 단어는 직접 입력
const reviewSession = s => !!s && (s.mode === 'review' || s.mode === 'extraReview' || !!s.mixed);
// 맞히면 졸업하는 복습인지 (그 문제는 직접 입력)
const finalFor = id => willGraduate(stats[id], { grad: gradDays(id), intervals: intervals(), today: dateStr() });
const kindFor = w => questionKind(settings.kind, stats[w.id], {
  mix: !!settings.reviewMix && reviewSession(session),
  again: session.wrong.includes(w.id) || session.hinted.includes(w.id),
  final: finalFor(w.id),
});
// 복습 묶음 순서: 4지선다로 나올 단어 먼저 ('복습은 외운 단어만 4지선다'를 켰을 때만)
const mixOrder = ids => (settings.reviewMix ? choicesFirst(ids, id => questionKind(settings.kind, stats[id], { mix: true, final: finalFor(id) })) : ids);

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
  q = { w, b1, b2, kind: kindFor(w), answered: false, letterHint: false, revealed: false, usedHint: hintedId() === id };

  $('#feedback').hidden = true;
  $('#fb-head').hidden = true;
  $('#q-sentences').className = '';
  document.querySelector('.q-prompt').classList.remove('my-answer');
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = dayTag(w);
  $('#q-again').hidden = !session.again[id];

  const box = $('#q-sentences');
  box.innerHTML = '';
  const noBlank = !(b1 && b1.ok) && !(b2 && b2.ok);
  [[b1, w.ex1ko], [b2, w.ex2ko]].forEach(([b, ko], i) => {
    if (!b || !b.segs.length) return;
    box.appendChild(sentenceCard(b, ko, i + 1, false, false, w, i ? w.ex2src : w.ex1src));
  });
  // 빈칸 문제는 위에 질문 줄을 안 씀 (빈칸만 봐도 앎). 빈칸을 못 만든 문제만 안내
  document.querySelector('.q-prompt').textContent = noBlank ? '뜻에 맞는 말을 고르세요' : '';
  if (noBlank) box.innerHTML = ''; // 빈칸을 못 만든 예문은 정답이 보이므로 숨김

  const mEl = $('#q-meaning');
  mEl.textContent = meaningText(w);
  mEl.hidden = !(settings.showMeaning || noBlank) || !mEl.textContent;
  $('#btn-hint').hidden = false;
  setLabel($('#btn-hint'), '힌트'); $('#btn-hint').classList.remove('say');

  const actions = $('#q-actions');
  unpinChoices();
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'phone-choices');
  $('.quiz-body').style.paddingBottom = '';
  if (q.kind === 'type') renderTyping(actions);
  else {
    renderChoices(actions);
    if (q.usedHint) { strikeChoices(); setHintButtons(null); }
    actions.dataset.layout = ui.choiceLayout;
    // 폰·태블릿: 선지를 2×2로. 예문 바로 아래에 두되, 한 화면에 다 안 들어가면 화면 아래에 고정 (placeChoices)
    if (!DESK) {
      $('#quiz').classList.add('phone-choices');
      const row = el('div', 'pin-row');
      const grid = ui.choiceLayout === 'grid';
      if (!grid) delete actions.dataset.lean;
      const more = iconBtn('more-btn', 'down', '더 보기');
      more.type = 'button';
      more.hidden = true;
      more.setAttribute('aria-label', '아래 예문 더 보기');
      more.addEventListener('click', () => window.scrollBy({ top: Math.round(window.innerHeight * 0.5), behavior: calmMotion() ? 'auto' : 'smooth' }));
      row.append(el('div', 'pin-slot'), grid ? leanBar(actions) : el('div'), more); // 쏠림은 격자에서만
      row.dataset.lean = grid ? '1' : '';
      actions.prepend(row);
      placeChoices();
      requestAnimationFrame(placeChoices); // 글꼴이 늦게 그려져 높이가 바뀌는 때를 위해 한 번 더
    }
    fitChoices();
  }
}

// 빈칸에 들어갈 말이 모든 문장에서 같은 꼴인지 (deteriorated / deteriorate처럼 다르면 '공통으로'라고 묻지 않음)
// 'same' 여러 번 나오는데 다 같은 꼴 · 'diff' 꼴이 다름 · 'single' 한 번만 나옴
function blankForms(b1, b2, n = 0) {
  const bs = [b1, b2].filter(b => b && b.ok && b.blanks.length);
  if (!bs.length) return 'single';
  const unit = blankUnit(bs[0].blanks, n).map(x => x.toLowerCase());
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
      el('span', 'muted', `${shortMeaning(c.meaning) || c.meaning} · ${dayTag(c)}`));
    card.appendChild(row);
  }
  return card;
}

// 폰 4지선다: 아래 고정된 보기 높이만큼 문장 아래 여백 (힌트 버튼은 고정된 칸 위쪽 줄 안에 있음)
// 쏠림을 바꾸거나 화면을 돌려 보기 높이가 바뀌어도 다시 맞춤
function pinSpace() {
  if (!$('#quiz').classList.contains('pin-choices')) return;
  const h = $('#q-actions').offsetHeight;
  $('#quiz').style.setProperty('--pin-h', `${h}px`);
  $('.quiz-body').style.paddingBottom = `${h + 12}px`;
  moreBelow();
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(pinSpace).observe($('#q-actions'));

// 폰·태블릿 4지선다 자리: 예문 바로 아래에 둬서 한 화면에 다 보이면 그대로(아이패드 세로처럼 큰 화면은 보통 이쪽),
// 넘치면 화면 아래에 고정. 고정할 땐 힌트 버튼도 고정된 칸 위쪽 줄로 옮겨서 예문 글자를 가리지 않게
const qTools = $('.q-tools'), qToolsHome = qTools.parentNode, qToolsNext = qTools.nextSibling;
function unpinChoices() {
  if (qTools.parentNode !== qToolsHome) qToolsHome.insertBefore(qTools, qToolsNext);
  $('#quiz').classList.remove('pin-choices');
  $('.quiz-body').style.paddingBottom = '';
}
function placeChoices() {
  const quiz = $('#quiz'), actions = $('#q-actions'), row = actions.querySelector('.pin-row');
  if (!quiz.classList.contains('phone-choices') || !row || !$('#feedback').hidden || (q && q.answered)) return;
  unpinChoices();
  row.hidden = !row.dataset.lean;
  const bottom = actions.getBoundingClientRect().bottom + window.scrollY;
  if (bottom > window.innerHeight - 4) {
    quiz.classList.add('pin-choices');
    row.hidden = false;
    row.firstChild.appendChild(qTools);
    pinSpace();
  }
  moreBelow();
}
// 고정된 선지 아래에 가려진 예문이 남았으면 '더 보기' (끝까지 내리면 숨김)
function moreBelow() {
  const btn = $('#q-actions .more-btn');
  if (!btn) return;
  // 마지막 예문의 글자가 고정된 선지 칸 뒤에 가려졌을 때만 (카드 아래 여백만 가린 건 괜찮음)
  const texts = $('#q-sentences').querySelectorAll('.en, .ko');
  const last = texts[texts.length - 1];
  const hidden = last && last.getBoundingClientRect().bottom > $('#q-actions').getBoundingClientRect().top + 4;
  btn.hidden = !$('#quiz').classList.contains('pin-choices') || !hidden;
}
window.addEventListener('scroll', () => { if (current === 'quiz') moreBelow(); }, { passive: true });
// 화면을 돌리거나 창 크기가 바뀌면 다시 정함 (폰 주소창이 들어가고 나오는 작은 높이 변화는 무시)
let placeSize = [window.innerWidth, window.innerHeight];
window.addEventListener('resize', () => {
  const [w, h] = placeSize;
  if (w === window.innerWidth && Math.abs(h - window.innerHeight) < 90) { moreBelow(); return; }
  placeSize = [window.innerWidth, window.innerHeight];
  if (current === 'quiz') placeChoices();
  if (!$('#feedback').hidden) fitFbWord();
});

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
  q = { w, kind: kindFor(w), answered: false, usedHint: hintedId() === w.id };
  $('#feedback').hidden = true;
  $('#fb-head').hidden = true;
  const prompt = document.querySelector('.q-prompt');
  prompt.classList.remove('my-answer');
  prompt.textContent = ''; // 단어만 봐도 뜻 묻는 문제인 걸 앎
  $('#quiz-bar').style.width = `${(session.done.length / session.total) * 100}%`;
  $('#quiz-count').textContent = `${session.done.length}/${session.total}`;
  $('#q-day').textContent = dayTag(w);
  $('#q-again').hidden = !session.again[w.id];
  const box = $('#q-sentences');
  box.className = '';
  box.innerHTML = '';
  box.appendChild(wordCard(w));
  const mEl = $('#q-meaning');
  mEl.textContent = wordHint(w);
  mEl.hidden = true;
  $('#btn-hint').hidden = !mEl.textContent;
  setLabel($('#btn-hint'), '힌트'); $('#btn-hint').classList.remove('say');
  $('#btn-idk').hidden = false;
  const actions = $('#q-actions');
  unpinChoices();
  actions.innerHTML = '';
  kb = null;
  $('#quiz').classList.remove('kb-mode', 'phone-choices');
  $('.quiz-body').style.paddingBottom = '';
  if (q.kind === 'type') renderMeaningTyping(actions);
  else { renderMeaningChoices(actions); fitChoices(); }
}

function renderMeaningChoices(actions) {
  const w = q.w;
  const pool = rangeWords().length >= 8 ? rangeWords() : words;
  const choices = keptChoices(w, () => {
    let opts = pickMeaningDistractors(w, pool, 3);
    if (opts.length < 3) opts = opts.concat(pickMeaningDistractors(w, words, 3).filter(o => !opts.some(x => x.meaning === o.meaning))).slice(0, 3);
    return shuffle([w, ...opts]);
  });
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
  actions.append(input, el('div', 'type-help', `채점: ${grader}`), ok);
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
    let aiMissed = false; // AI를 불렀는데 못 받음(한도 429·시간 초과 등) → 규칙 채점 결과라는 걸 알려 줌
    if (res.score < 2 && aiOnline()) {
      busy = true;
      input.disabled = ok.disabled = true;
      ok.textContent = `AI 확인 중…`;
      const ai = await aiGradeMeaning({ word: cur.w.word, meaning: cur.w.meaning, user: v, strict: settings.strict });
      busy = false;
      if (q !== cur || cur.answered) return; // 채점 중에 다른 화면으로 나갔으면 버림
      input.disabled = ok.disabled = false;
      ok.textContent = '확인';
      if (ai) res = ai; else aiMissed = true;
    }
    const { score, missing, note = '' } = res;
    const tail = (note ? ` · ${note}` : score === 1 ? ` · ${missing}개 뜻이 빠졌어요` : '') + (aiMissed ? ' · AI 확인 못 함(규칙으로만 채점)' : '');
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

// 그만뒀다 이어해도 보기가 그대로이게: 지금 문제의 보기를 진행 기록(session)에 남겨 둠. 답하면 지움 (answer)
function keptChoices(w, pick) {
  const kept = session && session.opts && session.opts.id === w.id ? session.opts.ids.map(id => byId.get(id)) : null;
  if (kept && kept.every(Boolean) && kept.includes(w) && new Set(kept).size === kept.length) return kept;
  const choices = pick();
  if (session && !session.noSave) { session.opts = { id: w.id, ids: choices.map(c => c.id) }; saveSession(); }
  return choices;
}

function renderChoices(actions) {
  const w = q.w;
  const pool = rangeWords().length >= 8 ? rangeWords() : words;
  const choices = keptChoices(w, () => {
    let opts = pickDistractors(w, pool, 3);
    if (opts.length < 3) opts = opts.concat(pickDistractors(w, words, 3).filter(o => !opts.includes(o))).slice(0, 3);
    return shuffle([w, ...opts]);
  });
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
  const parts = blankUnit((q.b1 && q.b1.blanks.length ? q.b1 : q.b2 || { blanks: [] }).blanks, answerWordCount(q.w.blank)).length || answerParts(q.w.blank).length;
  const placeholder = parts > 1 ? `빈칸 ${parts}곳을 순서대로 입력` : '빈칸에 들어갈 말';
  const helpText = parts > 1 ? '칸을 다 채우면 다음 칸으로 넘어가요 (띄어쓰기로도 넘어가요)' : '';
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
    const plain = () => { if (f) showCoach(actions, f); else if (!auto) toast('아직 정답이 아니에요. 모르면 힌트를 눌러보세요'); };
    if (!aiOnline() || n.length < 2 || q.revealed || (f && f.kind === 'spell')) return plain();
    const key = `${q.w.id}|${n}`;
    let r = coachCache.get(key);
    if (r === undefined) {
      if (coachBusy.has(key)) return; // 같은 답으로 이미 물어보는 중
      coachBusy.add(key);
      showCoach(actions, { kind: 'wait', text: 'AI가 살펴보는 중…' }, { stay: true });
      const blankText = b => (b && b.segs.length ? b.segs.map(x => (x.t === 'blank' ? '___' : x.v)).join('') : '');
      r = await aiHint({
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
      : parts > 1 ? `빈칸 ${parts}곳 · 다 채우면 다음 칸으로` : '';
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
  const unit = blankUnit(targets, q && q.w ? answerWordCount(q.w.blank) : 0);
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
// 컴퓨터 단축키 (설정 > 단축키, js/keys.js)
let keymap = cleanKeys(load(KEYS_KEY, {}));
let keyCapture = null; // 지금 키를 기다리는 { action, stop() }

function renderAppKeyboard(actions, helpText, check, autoCheck, notYet, fillsSlot = () => false) {
  $('#quiz').classList.add('kb-mode');
  const top = el('div', 'kb-top');
  const hintBtn = iconBtn('btn ghost small kb-hint', 'bulb', '힌트');
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
    if (LOOK.get().kbSound) tone([[1800, .012]], .025, 'square');
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
        setHintButtons('정답 보고 쓰기');
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
    if (label) setLabel(b, label);
    b.classList.toggle('say', !!label && label !== '힌트'); // '힌트'는 아이콘만, 다른 말(정답 보고 쓰기)은 글자도
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
  // 힌트를 썼던 단어가 다시 나와서 맞힌 것도 연습으로 (복습 단계는 첫 결과대로)
  const retry = session.wrong.includes(id) || session.hinted.includes(id);
  // 목표일부터 범위 전체를 훑는 오늘의 복습도 일정에 반영: 훑으며 맞힌 단어가 며칠 뒤 복습일에 또 나오지 않게
  const scheduled = !retry && (session.mode === 'today' || !before || isDue(before, today) || (session.mode === 'review' && inSweep(today)));
  delete tombs[id]; // 지운 DAY 단어를 다시 풀면 새 기록으로
  stats[id] = applyResult(before, outcome, { today, exam: settings.exam, scheduled, intervals: intervals(), load: dueLoad(), rest: restNow(), kind: q.kind || '', retry, grad: gradDays(id) });
  const graduated = !!stats[id].g && !(before && before.g);
  // 다시 볼 단어(또는 틀린 단어 다시 풀기)에서 힌트 없이 맞히면 오늘은 목록에서 뺌
  const cleared = outcome === 'ok' && !retry && !scheduled && isWrongRaw(before) && (session.mode === 'wrong' || session.mode === 'retry');
  if (cleared) stats[id].r = today; else delete stats[id].r;
  if (hintedId() === id) { const d = loadDay(); delete d.hint; save(KEY.day, d); }
  if (session.opts && session.opts.id === id) delete session.opts; // 다음에 또 나오면 보기를 새로 뽑음

  let label;
  if (outcome === 'wrong') {
    if (!session.wrong.includes(id)) session.wrong.push(id);
    const when = againLater(id, kind === 'copied' ? 'hint2' : 'wrong');
    label = `${kind === 'copied' ? '정답 보고 씀' : kind === 'idk' ? '모름' : '오답'} · ${when}`;
  } else {
    if (!session.done.includes(id)) session.done.push(id);
    const when = outcome === 'hint' ? againLater(id, 'hint1') : '';
    if (outcome === 'hint' && !session.hinted.includes(id)) session.hinted.push(id);
    const n = stats[id].due ? daysBetween(today, stats[id].due) : 0;
    label = kind === 'partial' ? `부분 정답 · ${when}`
      : outcome === 'hint' ? `힌트 사용 · ${when}`
      : retry ? `정답! · ${comingAgain(id) || '내일 다시'}`
        : graduated ? '정답! · 졸업했어요 🎓'
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
  Object.assign(q, { fbGiven: given, fbLabel: label }); // 버그 신고에 붙임
  const state = correct ? 'ok' : kind === 'partial' ? 'hint' : kind === 'idk' ? 'bad' : kind || 'bad';
  answerFx(state);
  if (settings.autoSpeak) speak(w.word); // 시트를 다 그리기 전에 먼저 (그리는 동안 기다리지 않게)
  // 카드 위 상태 표시
  const head = $('#fb-head');
  head.hidden = false;
  head.className = 'tag fb-head ' + state;
  head.textContent = label;
  const prompt = document.querySelector('.q-prompt');
  prompt.textContent = !correct && given ? `내 답: ${given}` : ''; // 비면 줄을 숨김 (style.css .q-prompt:empty)
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
  if (q.kind === 'type') {
    unpinChoices();
    $('#q-actions').innerHTML = '';
    $('#quiz').classList.remove('kb-mode', 'phone-choices');
  } else if ($('#quiz').classList.contains('pin-choices')) {
    unpinChoices(); // 정답 시트가 아래를 덮으니 고정은 풂 (선지는 2×2 그대로 예문 아래에)
    const more = $('#q-actions .more-btn');
    if (more) more.hidden = true;
  }

  setFbCoach(state);
  const more = [];
  if (q.choices && !correct) more.push(choiceNotes(q.choices, w, q.picked));
  Object.assign(q, { fbCorrect: correct, fbWhy: WORD && !correct && kind !== 'hint' && !!q.userAnswer }); // 'AI에게 묻기'에 씀
  openSheet(w, more);
}

// 아래 정답 시트: 단어, 발음, 뜻/예문 탭. more = 뜻 카드 바로 아래에 넣을 카드
function openSheet(w, more = []) {
  $('#fb-word').textContent = w.word;
  $('#fb-pron').textContent = w.pron || '';
  $('#fb-speak').onclick = () => speak(w.word);
  const fm = $('#fb-mark');
  fm.classList.toggle('on', isUnknown(w.id));
  fm.classList.remove('swipe', 'wipe');
  fm.onclick = () => {
    const on = fm.classList.toggle('on', toggleUnknown(w.id));
    // 칠하면 형광펜이 쓱 지나가고, 지우면 빠지듯 (다시 누르면 처음부터)
    fm.classList.remove('swipe', 'wipe'); void fm.offsetWidth;
    fm.classList.add(on ? 'swipe' : 'wipe');
  };
  $('#fb-report').onclick = () => openReport(reportCtx());

  const mean = $('#fb-mean');
  mean.innerHTML = '';
  const card = el('div', 'fb-card');
  const tags = el('div', 'fb-tags');
  if (w.pos) tags.appendChild(el('span', 'tag', w.pos));
  tags.appendChild(el('span', 'tag', dayTag(w)));
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
  // AI 탭: AI가 켜져 있고 인터넷이 될 때만
  const aiPane = $('#fb-ai');
  aiPane.innerHTML = '';
  $('#feedback').classList.remove('chatting');
  const canAsk = aiCoachOnline() && !!q && q.w === w;
  $('#fb-tab-ai').hidden = !canAsk;
  if (canAsk) aiPane.appendChild(askBox(q));
  setFbTab('mean');

  $('#feedback').hidden = false;
  fitFbWord();
  // 시트에 가리지 않게 문장 아래 여백
  // 넓은 컴퓨터 화면에선 정답 시트가 오른쪽 칸이라 여백 필요 없음
  requestAnimationFrame(sheetPad);
  $('#fb-mean').scrollTop = 0;
}

// ---------- 버그 신고 ----------
// 지금 정답 시트에 뜬 문제를 신고 내용으로 (해석은 앱이 굵게 강조한 데를 **로 표시)
function reportCtx() {
  if (!q || !q.w) return null;
  const w = q.w;
  const bold = ko => (ko ? highlightMeaning(ko, w.meaning, w.koMark).map(x => (x.t === 'mark' ? `**${x.v}**` : x.v)).join('') : '');
  const mode = q.syn ? 'syn' : WORD ? 'word' : 'ex';
  const how = q.syn ? 'choice' : q.kind;
  const opts = q.syn ? q.syn.options : q.choices;
  const text = o => (q.syn ? o.text : WORD ? o.meaning : displayAnswer(o));
  const ctx = {
    word: w.word, id: w.id, day: w.day, mode, how, label: q.fbLabel, given: q.fbGiven || q.userAnswer || '',
    strict: mode === 'word' && how === 'type' ? `채점 ${{ easy: '느슨', mid: '보통', hard: '엄격' }[settings.strict] || '보통'}` : '',
    meaning: w.meaning, ex1: w.ex1, ex1ko: bold(w.ex1ko), ex2: w.ex2, ex2ko: bold(w.ex2ko), marked: w.koMark || '',
  };
  if (opts && opts.length) {
    ctx.choices = opts.map(text);
    ctx.picked = opts.indexOf(q.picked);
    ctx.right = q.syn ? opts.findIndex(o => o.ok) : opts.indexOf(w);
  }
  if (q.syn && q.syn.sentence) ctx.ex1 = q.syn.sentence.en || ctx.ex1;
  return ctx;
}
function reportApp() {
  const ua = navigator.userAgent || '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return {
    version: APP_VERSION,
    ai: aiSwitch() && aiHasKey() ? aiName() : '',
    device: `${ua} · ${innerWidth}×${innerHeight}${standalone ? ' · 홈 화면 앱' : ''}${navigator.onLine === false ? ' · 오프라인' : ''}`,
  };
}
// 로그인 없이 보내는 신고: 먼저 이 기기에 쌓아 두고(voca.reports.v1) Google 설문지로 보냄. 인터넷이 안 되면 다음에 앱을 열 때·인터넷이 돌아올 때 다시
const REPORT_Q = 'voca.reports.v1';
let reportFlush = null;
function flushReports() {
  if (!formReady() || reportFlush) return reportFlush || Promise.resolve(load(REPORT_Q, []).length);
  // 비어 있으면 기다릴 게 없어 곧바로 끝나므로, '보내는 중' 표시는 꼭 끝난 뒤에(finally) 지움
  reportFlush = (async () => {
    let list = load(REPORT_Q, []);
    while (list.length && navigator.onLine !== false) {
      const item = list[0], r = formRequest(REPORT_FORM, item.text);
      try { await fetch(r.url, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(r.body) }); } catch { break; }
      list = load(REPORT_Q, []).filter(x => x.id !== item.id); // 보내는 사이에 새로 쌓인 것도 남김
      save(REPORT_Q, list);
    }
    return list.length;
  })().finally(() => { reportFlush = null; });
  return reportFlush;
}
// 신고 창: 이유(여러 개) + 메모 → 설문지로 보냄(로그인 없음). 설문지를 아직 안 정했으면 GitHub 새 이슈 화면을 채워서 엶. 복사도 됨. ctx가 없으면 앱 전체 신고(설정에서)
function openReport(ctx) {
  const d = $('#report'), box = $('#rp-reasons'), note = $('#rp-note'), pre = $('#rp-preview');
  const picked = new Set();
  const build = () => reportText({ reasons: [...picked], note: note.value, ctx, app: reportApp(), errors: load(ERR_KEY, []) });
  const refresh = () => { const r = build(); pre.textContent = `${r.title}\n\n${r.body}`; };
  $('#rp-title').textContent = ctx ? '이 문제 신고하기' : '이상한 점 알려 주기';
  $('#rp-sub').textContent = ctx ? `${ctx.word} · ${ctx.day ? `DAY ${ctx.day}` : '내 단어'} — 무엇이 이상했나요?` : '무엇이 이상했나요? 학습 기록과 키는 보내지 않아요.';
  box.innerHTML = '';
  for (const r of reportReasons(ctx)) {
    const b = el('button', 'chip', r);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (picked.has(r)) picked.delete(r); else picked.add(r);
      b.classList.toggle('on', picked.has(r));
      b.setAttribute('aria-pressed', picked.has(r));
      refresh();
    });
    box.appendChild(b);
  }
  note.value = '';
  note.oninput = refresh;
  $('#report .rp-peek').open = false;
  refresh();
  const prev = document.activeElement;
  d.hidden = false;
  // 창이 열린 동안엔 퀴즈 단축키(스페이스·Enter로 다음 등)가 먹지 않게. 글자는 그대로 써짐
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); done(); } e.stopPropagation(); };
  const close = () => { d.hidden = true; d.onclick = null; document.removeEventListener('keydown', key, true); if (prev && prev.focus) prev.focus(); };
  const done = () => { close(); modalDone(() => {}); };
  modalOpen(close);
  document.addEventListener('keydown', key, true);
  d.onclick = e => { if (e.target === d) done(); };
  $('#rp-cancel').onclick = done;
  $('#rp-copy').onclick = async () => {
    const r = build();
    try { await navigator.clipboard.writeText(`${r.title}\n\n${r.body}`); toast('복사했어요. 메신저나 메일에 붙여 넣어 보내 주세요', 3000); }
    catch { $('#report .rp-peek').open = true; toast('복사가 안 돼요. 같이 보내는 내용을 길게 눌러 복사해 주세요', 3500); }
  };
  $('#rp-send').textContent = formReady() ? '보내기' : 'GitHub에 올리기';
  $('#rp-send').onclick = async () => {
    if (!picked.size && !note.value.trim()) { toast('무엇이 이상했는지 하나 골라 주세요'); return; }
    const r = build();
    if (formReady()) {
      const t = Date.now();
      save(REPORT_Q, queueReport(load(REPORT_Q, []), { id: `${t}-${Math.random().toString(36).slice(2, 6)}`, t, text: `${r.title}\n\n${r.body}` }));
      done();
      const left = await flushReports();
      toast(left ? '지금은 못 보냈어요. 인터넷이 되면 알아서 보낼게요' : '보냈어요. 알려 줘서 고마워요!', 3000);
      return;
    }
    const url = issueUrl(reportRepo(location), r.title, r.body);
    done();
    window.open(url, '_blank', 'noopener');
    toast('GitHub에서 아래 초록 버튼(Create)을 누르면 접수돼요', 4000);
  };
}

// 정답 시트 'AI에게 묻기': 모든 문제에서 그 단어를 두고 물어봄. 누르고 보낼 때만 AI를 부름 (AI가 켜져 있고 인터넷이 될 때만 보임)
// 이야기는 그 문제(q.ask)에만 남고 다음 문제로 넘어가면 사라짐. 코치용 키가 있으면 그 키로
const ASK_QUICK = ['외우는 요령', '비슷한 단어와 차이', '어원 알려 줘', '다른 예문 보여 줘'];
function askProblemOf(cur) {
  const w = cur.w;
  const ex = [[w.ex1, w.ex1ko], [w.ex2, w.ex2ko]].filter(([en]) => en).map(([en, ko]) => ({ en, ko }));
  const pick = cur.kind !== 'type';
  const mode = cur.syn ? '유의어·반의어 고르기' : WORD ? `영단어 보고 한글 뜻 ${pick ? '고르기(4지선다)' : '쓰기'}` : `예문 빈칸에 들어갈 영단어 ${pick ? '고르기(4지선다)' : '쓰기'}`;
  return { word: w.word, pos: w.pos, meaning: w.meaning, mode, examples: ex, extras: w.extras, user: cur.fbGiven || '', result: cur.fbLabel || (cur.fbCorrect ? '정답' : '오답') };
}
function askBox(cur) {
  const box = el('div', 'ask');
  cur.ask = cur.ask || [];
  // 위에서부터: 빠른 질문 → 입력칸 → 주고받은 이야기 (보낸 뒤엔 새 답이 보이게 내려 줌)
  const chips = el('div', 'chips ask-chips');
  const form = el('form', 'ask-form');
  const inp = el('input');
  Object.assign(inp, { type: 'text', placeholder: `${cur.w.word}에 대해 물어보기`, maxLength: 300, enterKeyHint: 'send', autocomplete: 'off' });
  const send = el('button', 'chat-send');
  send.type = 'submit';
  send.innerHTML = ICON.send;
  send.setAttribute('aria-label', '보내기');
  send.title = '보내기';
  form.append(inp, send);
  const log = el('div', 'ask-log');
  box.append(chips, form, log);
  let busy = false;
  // 아직 아무것도 안 물었으면 낮게, 이야기가 생기면 대화창처럼 높게 (style.css .ask.chatting)
  const setChat = () => {
    const on = cur.ask.length > 0 || busy;
    if (on === box.classList.contains('chatting')) return;
    const flip = () => { box.classList.toggle('chatting', on); $('#feedback').classList.toggle('chatting', on); };
    if (box.isConnected && !$('#fb-ai').hidden) slideSheet(flip); else flip();
  };
  const draw = () => {
    setChat();
    log.innerHTML = '';
    for (const m of cur.ask) log.appendChild(el('div', 'ask-msg ' + m.who + (m.err ? ' err' : ''), m.text));
    if (busy) log.appendChild(el('div', 'ask-msg ai wait', 'AI가 답 쓰는 중…'));
    const asked = new Set(cur.ask.filter(m => m.who === 'me').map(m => m.text));
    chips.innerHTML = '';
    for (const t of [...(!cur.fbCorrect ? ['왜 틀렸어?'] : []), ...ASK_QUICK]) {
      if (asked.has(t)) continue; // 이미 물은 건 뺌
      const c = el('button', 'chip', t);
      c.type = 'button';
      c.disabled = busy;
      c.addEventListener('click', () => submit(t));
      chips.appendChild(c);
    }
    chips.hidden = !chips.children.length;
    inp.disabled = send.disabled = busy;
  };
  const toEnd = () => { log.scrollTop = log.scrollHeight; };
  async function submit(text) {
    text = String(text || '').trim();
    if (!text || busy || q !== cur) return;
    cur.ask = cur.ask.filter(m => !m.err); // 지난번 못 받은 알림은 지움
    const history = cur.ask.slice();
    cur.ask.push({ who: 'me', text });
    inp.value = '';
    busy = true; draw(); toEnd();
    let t = null;
    // 단어 모드 오답의 '왜 틀렸어?'는 예전처럼 설명용으로 (같은 답이면 지난번 설명을 기억해 둔 걸로)
    if (text === '왜 틀렸어?' && cur.fbWhy && !history.length) {
      t = await aiExplainWrong({ word: cur.w.word, meaning: cur.w.meaning, user: cur.userAnswer, how: cur.how, extra: synonymOf(cur.w) ? `유의어 ${synonymOf(cur.w)}` : '' });
    }
    if (!t) t = await aiAskWord({ problem: askProblemOf(cur), history, message: text });
    busy = false;
    if (q !== cur) return; // 그새 다음 문제로 넘어감
    cur.ask.push(t ? { who: 'ai', text: t } : { who: 'ai', text: coachErrorText(), err: true });
    if (!t) { inp.value = text; cur.ask.splice(-2, 1); } // 못 받았으면 물은 말을 칸에 돌려놓아 다시 보내게
    draw();
    // 새 답의 첫머리가 보이게 (긴 답이면 위부터 읽게)
    const ans = log.lastElementChild;
    if (ans) log.scrollTop = ans.offsetHeight > log.clientHeight ? ans.offsetTop - log.offsetTop : log.scrollHeight;
  }
  form.addEventListener('submit', e => { e.preventDefault(); submit(inp.value); });
  // 칸에 쓰는 동안 퀴즈 단축키(Enter 계속하기, Space 형광펜, Shift 등)가 눌리지 않게
  const keep = e => {
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Escape') inp.blur();
  };
  inp.addEventListener('keydown', keep);
  inp.addEventListener('keyup', keep);
  // 폰에서 칸을 누르면 키보드가 올라옴: 시트를 키보드 바로 위로 올리고 보이는 만큼 채움, 아래 버튼 줄은 잠깐 숨김
  const vv = window.visualViewport;
  const sheet = $('#feedback'), inner = sheet.querySelector('.sheet-inner');
  const lift = () => {
    if (!vv || !sheet.classList.contains('typing')) return;
    const under = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    sheet.style.bottom = `${under}px`;
    inner.style.height = inner.style.maxHeight = `${Math.max(240, vv.height - 8)}px`;
  };
  const drop = () => {
    sheet.classList.remove('typing');
    sheet.style.bottom = inner.style.height = inner.style.maxHeight = '';
    if (vv) { vv.removeEventListener('resize', lift); vv.removeEventListener('scroll', lift); }
    sheetPad();
  };
  if (!DESK) {
    inp.addEventListener('focus', () => {
      sheet.classList.add('typing');
      if (vv) { vv.addEventListener('resize', lift); vv.addEventListener('scroll', lift); }
      lift();
    });
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) drop(); }, 120));
  }
  draw();
  return box;
}

// 정답 시트 머리의 단어: 길면 한 줄에 들어갈 때까지 글자를 줄임(30px → 18px). 그래도 넘치면 머리의 코치 캐릭터를 빼고
// 다시 맞춤. 그래도 넘치면(아주 긴 숙어) 줄바꿈
function fitFbWord() {
  const w = $('#fb-word'), head = w.closest('.fb-word');
  head.classList.remove('tight');
  w.style.whiteSpace = 'nowrap';
  // 글자 폭은 소수점까지 재서 비교 (반올림한 scrollWidth로 재면 1px 모자란 것도 맞는 걸로 보고 줄이 바뀜)
  const range = document.createRange();
  range.selectNodeContents(w);
  const over = () => range.getBoundingClientRect().width > w.getBoundingClientRect().width - 1;
  const shrink = () => {
    let size = 30;
    w.style.removeProperty('--w-fit');
    while (over() && size > 18) { size -= 2; w.style.setProperty('--w-fit', `${size}px`); }
    return !over();
  };
  if (!shrink() && !$('#fb-coach').hidden) { head.classList.add('tight'); shrink(); }
  w.style.whiteSpace = '';
}
// 정답 시트 탭: 탭마다 시트 크기·모양이 다름 (style.css #feedback[data-tab]).
// 뜻 = 내용만큼 낮게, 예문 = 조금 더 높게, AI = 대화창처럼 높게(빠른 질문·입력칸은 위에 고정, 이야기만 스크롤)
// 바꿀 때 높이가 툭 바뀌지 않게 지금 높이에서 새 높이로 미끄러지듯
const calmMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function sheetPad() {
  if (wideDesk() || $('#feedback').hidden) return;
  $('.quiz-body').style.paddingBottom = `${$('#feedback .sheet-inner').offsetHeight + 16}px`;
}
// change()로 시트 안을 바꾸고, 높이가 바뀌었으면 전 높이에서 새 높이로 미끄러지듯
function slideSheet(change) {
  const fb = $('#feedback'), inner = fb.querySelector('.sheet-inner');
  const from = fb.hidden ? 0 : inner.offsetHeight;
  inner.style.transition = inner.style.height = '';
  change();
  const to = inner.offsetHeight;
  if (!from || Math.abs(to - from) < 3 || calmMotion() || fb.classList.contains('typing')) { sheetPad(); return; }
  inner.style.height = `${from}px`;
  void inner.offsetHeight;
  inner.style.transition = 'height .3s cubic-bezier(.22, 1, .36, 1)';
  inner.style.height = `${to}px`;
  const mark = inner.dataset.slide = String(Date.now() + Math.random());
  const end = () => {
    inner.removeEventListener('transitionend', end);
    if (inner.dataset.slide !== mark) return; // 그새 또 바뀜
    inner.style.transition = inner.style.height = '';
    sheetPad();
  };
  inner.addEventListener('transitionend', end);
  setTimeout(end, 400); // transitionend가 안 오는 때도 있어서
}
function setFbTab(t) {
  const fb = $('#feedback');
  if (fb.dataset.tab === t && !fb.hidden) return;
  slideSheet(() => {
    document.querySelectorAll('#fb-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#fb-mean').hidden = t !== 'mean';
    $('#fb-ex').hidden = t !== 'ex';
    $('#fb-ai').hidden = t !== 'ai';
    fb.dataset.tab = t;
  });
  if (t === 'ai') { const log = $('#fb-ai .ask-log'); if (log) log.scrollTop = log.scrollHeight; } // 마지막 이야기부터
  else $(t === 'ex' ? '#fb-ex' : '#fb-mean').scrollTop = 0;
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

// 학습을 끝내면 AI 코치가 결과를 보고 한마디 (틀린 단어가 있으면 하나 골라 외우는 요령). AI가 꺼져 있으면 안 보임
// 다 맞혔으면 짚어 줄 단어가 없어서 AI를 부르지 않고 캐릭터 말투의 칭찬을 앱이 씀 (토큰 아끼기)
const ALL_RIGHT = {
  cat: '하나도 안 틀렸네요. …뭐, 이 정도는 해야죠. 잘했어요.',
  hamster: '전부 맞혔어요! 오늘 씨앗 주머니가 꽉 찼어요!',
  owl: '모두 맞혔군요. 이렇게 떠오르는 단어는 복습 때도 잘 남아요.',
  slime: '다 맞혔어요~ 말랑말랑 기분 좋아요. 이대로 천천히 가요.',
};
let resultSeq = 0;
function resultComment(s, wrong) {
  const box = $('#res-say');
  box.hidden = true;
  box.classList.remove('wait');
  const seq = ++resultSeq;
  if (!settings.coach || !aiCoachOnline() || s.mode === 'syn') return;
  if (!wrong.length) {
    box.textContent = ALL_RIGHT[coachChar()] || ALL_RIGHT.cat;
    box.hidden = false;
    return;
  }
  const lines = [`방금 한 학습: ${s.label}, ${s.total}단어`];
  if (wrong.length) {
    lines.push(`틀렸거나 힌트를 본 단어 ${wrong.length}개:`);
    for (const id of wrong.slice(0, 6)) { const w = byId.get(id); lines.push(`- ${w.word}: ${w.meaning}`); }
  } else lines.push('하나도 안 틀리고 다 맞힘');
  const f = flowState();
  lines.push(f.stage === 'review' ? `다음 할 일: 오늘의 복습 ${f.rv.left.length}개` : f.stage === 'learn' ? `다음 할 일: 새 단어 ${f.plan.fresh.length}개` : '오늘 몫(새 단어·복습)을 다 끝냄');
  if (settings.exam > dateStr()) lines.push(`시험까지 ${daysBetween(dateStr(), settings.exam)}일`);
  box.textContent = '…';
  box.classList.add('wait');
  box.hidden = false;
  aiCoachResult({ char: coachChar(), facts: lines.join('\n') }).then(r => {
    if (seq !== resultSeq || current !== 'result') return;
    box.classList.remove('wait');
    if (!r) { box.hidden = true; return; }
    box.textContent = r.text;
    $('#res-buddy').innerHTML = coachSvg(r.mood);
  });
}

function finishSession() {
  sync.now();
  const s = session;
  session = null;
  if (!s.noSave) saveSession();
  $('#feedback').hidden = true;
  const wrong = [...new Set([...s.wrong, ...(s.hinted || [])])].filter(id => byId.has(id));
  $('#res-title').textContent = `${s.label} 끝`;
  $('#res-detail').textContent = '';
  $('#res-total').textContent = s.total;
  $('#res-ok').textContent = Math.max(0, s.total - wrong.length);
  $('#res-bad').textContent = wrong.length;
  const rk = $('#res-buddy');
  rk.hidden = !settings.coach;
  if (settings.coach) rk.innerHTML = coachSvg(wrong.length ? 'normal' : 'cheer');
  resultComment(s, wrong);
  $('#res-wrong-label').textContent = wrong.length ? '한 번씩만 더 보고 가요' : '';
  const list = $('#res-wrong');
  list.innerHTML = '';
  if (!wrong.length) list.appendChild(el('div', 'card center muted', '틀린 단어 없이 다 맞혔어요 👏'));
  const view = bookView();
  // 단어장처럼 카드 하나에 줄로 (누르면 예문이 펼쳐짐)
  const group = el('div', 'day-group');
  for (const id of wrong) group.appendChild(wordItem(byId.get(id), view));
  if (wrong.length) list.appendChild(group);
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
    again.onclick = () => startSession('retry', wrong.map(id => byId.get(id)), { mixed: reviewSession(s) });
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
      g: !!((a && a.g) || (b && b.g)), // 졸업 (어느 모드든)
    };
  };
}

function markBtn(id, onChange) {
  const b = el('button', 'mark-btn' + (isUnknown(id) ? ' on' : ''));
  b.innerHTML = ICON.mark;
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

// inMy: 단어장의 '내 단어' 묶음 안 (거기선 '내 단어' 표시를 따로 안 붙임)
function wordItem(w, view = bookView(), onMark, { inMy = false } = {}) {
  const s = view(w.id);
  const { syn, ant, rest } = synAnt(w.extras);
  const item = el('div', 'item' + (isUnknown(w.id) ? ' hl' : ''));
  const head = el('div', 'item-head');
  const main = el('div', 'item-main');
  const top = el('div');
  top.appendChild(el('span', 'w', w.word));
  // 작은 표시: 내 단어(목록 밖에서 볼 때) · 독해에서 막힌 횟수 · 단어책 단어의 파생어 · 지난 바퀴에 틀린 횟수
  const h = hitOf(w.id), n = w.my ? w.n : h ? h.n : 0, pw = !w.my && myStore.round && myStore.round.w && myStore.round.w[w.id];
  const of = w.of && byId.get(w.of);
  const tags = w.my
    ? [!inMy ? '내 단어' : '', n > 1 ? `독해 ×${n}` : '', of ? `${of.word}의 파생어` : '']
    : [n ? (n > 1 ? `독해 ×${n}` : '독해') : '', pw ? `지난 바퀴 ${pw}번 틀림` : ''];
  for (const t of tags.filter(Boolean)) top.appendChild(el('span', 'w-tag', t));
  main.append(top, el('div', 'm', [w.pos, w.meaning].filter(Boolean).join(' ')));
  // 유의어(초록) · 반의어(빨강)
  if (syn || ant) {
    const rel = el('div', 'rel');
    if (syn) { const x = el('span', 'syn'); x.append(el('b', null, '유'), syn); rel.appendChild(x); }
    if (ant) { const x = el('span', 'ant'); x.append(el('b', null, '반'), ant); rel.appendChild(x); }
    main.appendChild(rel);
  }
  // 상태: 새 단어 · 틀림 n(다시 볼 단어) · 암기 완료 · n단계 (예전의 점 네 개 대신 글자로)
  const [stTxt, stCls] = !s.seen ? ['새 단어', ''] : s.wrong ? [`틀림 ${s.w || 1}`, 'bad'] : s.g ? ['졸업', 'ok'] : s.st >= maxStage() ? ['암기 완료', 'ok'] : [`${s.st}단계`, ''];
  const stEl = el('span', 'w-state' + (stCls ? ' ' + stCls : ''), stTxt);
  if (s.seen) stEl.title = `복습 단계 ${s.st}/${maxStage()}` + (s.w ? ` · 틀린 횟수 ${s.w}` : '');
  head.append(main, stEl, markBtn(w.id, onMark), speakBtn(w.word));
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
      if (w.my) det.appendChild(myItemActs(w));
      item.appendChild(det);
    } else { const d = item.querySelector('.detail'); if (d) d.remove(); }
  });
  return item;
}

// 내 단어 펼친 곳: 뜻 고치기 · 지우기 (기기끼리 맞춰짐)
function myItemActs(w) {
  const box = el('div', 'row two my-acts');
  const edit = el('button', 'btn ghost small', '뜻 고치기'), del = el('button', 'btn ghost small danger-text', '지우기');
  edit.addEventListener('click', e => {
    e.stopPropagation();
    const v = window.prompt(`${w.word}의 뜻`, w.meaning);
    if (v == null || !v.trim() || v.trim() === w.meaning) return;
    saveMy(editMy(myStore, w.key, { m: v.trim() }));
    renderList();
  });
  del.addEventListener('click', async e => {
    e.stopPropagation();
    if (!(await ask({ title: `${w.word}을(를) 내 단어에서 지울까요?`, body: '예문·단어 모드의 이 단어 진도도 같이 지워져요.' + (sync.enabled ? ' 동기화된 다른 기기에서도 지워져요.' : ''), ok: '지우기', danger: true }))) return;
    const now = Date.now();
    delete stats[w.id]; tombs[w.id] = { del: 1, s: now }; saveStats();
    const os = load(OTHER_P + 'stats.v1', {});
    if (os[w.id]) { os[w.id] = { del: 1, s: now }; save(OTHER_P + 'stats.v1', os); }
    saveMy(deleteMy(myStore, w.key, now));
    renderList();
    toast(`${w.word}을(를) 지웠어요`);
  });
  box.append(edit, del);
  return box;
}

// 그 DAY 단어들의 학습 기록(이 모드)을 지움. 동기화돼도 되살아나지 않게 지운 표시를 남김. 형광펜은 그대로
// 그 DAY에 기록이 있는지 (예문·단어 모드 어느 쪽이든)
function dayHasRecords(d) {
  const o = otherProgress().stats;
  return dayWords(d).some(w => stats[w.id] || (o[w.id] && !o[w.id].del));
}
// 그 DAY 단어들의 학습 기록을 예문·단어 두 모드 모두 지움. 동기화돼도 되살아나지 않게 지운 표시를 남김. 형광펜은 그대로
async function deleteDayRecords(d) {
  const dw = dayWords(d);
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
// 단어장에서 '내 단어'를 볼지 (DAY 줄 맨 앞 칩. 처음엔 켜짐)
const bookMy = () => bookOnly == null && settings.bookMy !== false && myWords.length > 0;
const bookWords = () => { const sel = bookDays(); return [...(bookMy() ? myWords : []), ...words.filter(w => sel.has(w.day))]; };
function setBookDays(set) {
  bookOnly = null;
  settings.bookDays = days.filter(d => set.has(d));
  saveSettings();
  renderList();
}

// 'DAY ▾' 버튼 글자: 전체 · DAY 26 · DAY 26~37(이어진 범위) · DAY 3개
function bookDayLabel(sel) {
  const list = days.filter(d => sel.has(d));
  if (bookMy()) return list.length ? `내 단어 + ${bookDayLabel0(list)}` : '내 단어';
  return bookDayLabel0(list);
}
function bookDayLabel0(list) {
  if (!list.length) return 'DAY 고르기';
  if (list.length === days.length && days.length > 1) return '전체 DAY';
  if (list.length === 1) return `DAY ${list[0]}`;
  const i0 = days.indexOf(list[0]);
  return list.every((d, k) => days[i0 + k] === d) ? `DAY ${list[0]}~${list[list.length - 1]}` : `DAY ${list.length}개`;
}
function openBookDays() {
  const box = $('#book-days'), home = [box.parentNode, box.nextSibling];
  openPickSheet('볼 DAY', '여러 개 고를 수 있어요', body => {
    body.appendChild(box);
    return () => home[0].insertBefore(box, home[1]);
  });
}
function renderBookDays(scrollToSel) {
  const box = $('#book-days');
  const sel = bookDays();
  $('#book-day-btn').textContent = bookDayLabel(sel);
  const keep = box.scrollLeft;
  box.innerHTML = '';
  if (myWords.length) {
    const my = el('button', 'dp my' + (bookMy() ? ' on' : ''), '내 단어');
    my.addEventListener('click', () => { settings.bookMy = !bookMy(); bookOnly = null; saveSettings(); renderList(); });
    box.appendChild(my);
  }
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
  const hit = w => w.word.toLowerCase().includes(qy) || w.meaning.toLowerCase().includes(qy) || w.extras.some(([, v]) => String(v).toLowerCase().includes(qy))
    || (w.my && [w.ex1, w.ex2].some(x => String(x || '').toLowerCase().includes(qy)));
  $('#book-days').classList.toggle('dim', !!qy);
  $('#book-day-btn').classList.toggle('dim', !!qy);
  // 독해: 고른 DAY와 상관없이 내 단어 전부 + 독해에서 막힌 단어책 단어
  const base = qy ? [...myWords, ...words].filter(hit) : listFilter === 'read' ? [...myWords, ...words.filter(w => hitOf(w.id))] : bw;
  const filtered = base.filter(w => {
    const s = view(w.id);
    if (listFilter === 'wrong') return s.wrong;
    if (listFilter === 'new') return !s.seen;
    if (listFilter === 'done') return s.st >= maxStage() && !s.g;
    if (listFilter === 'unknown') return isUnknown(w.id);
    if (listFilter === 'grad') return s.g;
    return true;
  });
  if (qy && !filtered.length) box.appendChild(el('div', 'card center muted', `'${bookQuery.trim()}'에 맞는 단어가 없어요`));
  else if (qy) { /* 검색 결과 */ }
  else if (!bw.length) box.appendChild(el('div', 'card center muted', '위에서 볼 DAY를 골라 주세요'));
  else if (!filtered.length) box.appendChild(el('div', 'card center muted', listFilter === 'unknown' ? '단어 옆 형광펜을 누르면 여기 모여요'
    : listFilter === 'read' ? '독해에서 모르는 단어를 노트에 적고 위의 +로 올리면 여기 모여요'
      : listFilter === 'grad' ? '충분히 외운 단어는 졸업해서 여기 모여요 (복습에 더 안 나와요)' : '해당하는 단어가 없어요'));
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
  // 내 단어는 맨 위에 올린 날(마지막으로 적은 날)마다, 새것부터. 날마다 '풀기'(그날 올린 내 단어 + 그날 독해에서 막힌 단어책 단어)
  const gkey = w => (w.my ? 'my:' + (w.dates[w.dates.length - 1] || '') : w.day);
  const mine = filtered.filter(w => w.my).sort((a, b) => gkey(b).localeCompare(gkey(a)));
  if (mine.length) filtered.splice(0, filtered.length, ...mine, ...filtered.filter(w => !w.my));
  const count = {};
  for (const w of filtered) count[gkey(w)] = (count[gkey(w)] || 0) + 1;
  const hasRec = new Set(words.filter(w => view(w.id).seen).map(w => w.day));
  if (mine.length && !qy && new Set(mine.map(gkey)).size > 1) {
    const h = el('div', 'day-head');
    h.append(el('b', null, '내 단어'), el('span', null, `${mine.length}단어`));
    const go = el('button', 'day-del', '전체 한 바퀴');
    go.addEventListener('click', () => startSession('mine', mine));
    h.appendChild(go);
    box.appendChild(h);
  }
  let lastDay = null, group = null;
  const add = w => {
    const k = gkey(w);
    if (k !== lastDay) {
      const h = el('div', 'day-head');
      if (w.my) {
        const date = k.slice(3);
        h.append(el('b', null, `내 단어 · ${fmtDay(date) || '날짜 없음'}`), el('span', null, `${count[k]}단어`));
        const batch = [...mine.filter(x => gkey(x) === k), ...words.filter(x => { const hh = hitOf(x.id); return hh && hh.d === date; })];
        const go = el('button', 'day-del', '이 날 단어 풀기');
        go.addEventListener('click', () => startSession('batch', batch, { label: `${fmtDay(date)} 올린 단어` }));
        h.appendChild(go);
      } else {
        h.append(el('b', null, `DAY ${w.day}`), el('span', null, `${count[k]}단어`));
        const d = w.day;
        if (hasRec.has(d)) {
          const del = el('button', 'day-del', '기록 지우기');
          del.addEventListener('click', () => deleteDayRecords(d));
          h.appendChild(del);
        }
      }
      group = el('div', 'day-group');
      box.append(h, group);
      lastDay = k;
    }
    group.appendChild(wordItem(w, view, updateTest, { inMy: !!w.my && !qy && listFilter !== 'read' }));
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
  // 헤더에선 조용하게 점 하나 (글자는 누르거나 마우스를 올리면 · 화면 읽기)
  const said = { syncing: '동기화 중', ok: '동기화됨', error: '동기화 오류', wait: '잠시 뒤 동기화', idle: '동기화' }[sync.status] || '';
  badge.textContent = said;
  badge.title = said;
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', said);
  $('#sync-off').hidden = sync.enabled;
  $('#sync-on').hidden = !sync.enabled;
  if (sync.enabled) {
    const t = sync.last ? new Date(sync.last).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '아직 없음';
    $('#sync-info').textContent = `GitHub 계정 ${sync.login}에 연결됨\n마지막 동기화: ${t}` + (sync.status === 'error' || sync.status === 'wait' ? `\n⚠︎ ${sync.error}` : sync.status === 'syncing' ? '\n동기화 중…' : '');
  }
}

// 목표일 칸 (학습 계획 화면·설정 > 복습, 시험일 위): 새 단어를 보는 마지막 날을 고름. 저장은 그다음 날(전체 복습을 시작하는 날)로.
// 코치가 켜져 있으면 코치 일정의 목표일을 보여 주고, 바꾸면 그날에 맞춰 전체 복습 날 수를 정해 다시 짬(하루 개수 고정은 풀림). 비우면 코치가 다시 정함
const goalShown = () => { const g = goalDate(); return g ? addDays(g, -1) : ''; };
function fillGoalInput(input) {
  input.value = goalShown();
  input.min = dateStr();
  input.max = settings.exam && settings.exam > dateStr() ? addDays(settings.exam, -2) : '';
}
function goalNote() {
  if (coachActive()) return settings.coachFix ? `하루 ${settings.coachFix}개 고정으로` : settings.coachReview ? '직접 정함' : '코치가 정함 · 바꿔도 돼요';
  const g = settings.goal, ex = settings.exam;
  if (!g) return '새 단어를 다 배울 날';
  if (!ex || ex <= dateStr()) return '시험일도 정해야 전체 복습';
  if (g >= ex) return '시험일보다 앞이어야 해요';
  return '다음 날부터 전체 복습';
}
function setGoal(input) {
  const v = input.value, ex = settings.exam;
  const bad = v && v < dateStr() ? '지난 날짜는 목표일로 정할 수 없어요'
    : v && ex && ex > dateStr() && addDays(v, 1) >= ex ? '목표일은 시험 전전날까지예요 (시험 전에 전체 복습할 날이 하루는 있어야 해요)' : '';
  if (bad) { toast(bad); fillGoalInput(input); return; }
  if (coachActive()) {
    Object.assign(settings, { coachReview: v ? daysBetween(addDays(v, 1), ex) : 0, coachFix: 0, coachTail: '' });
    planCoach(true);
    coachMoved = false;
    toast(v ? `${fmtDay(lastLearnDay())}까지 새 단어를 다 보게 다시 짰어요` : '목표일은 다시 코치가 정해요');
  } else {
    settings.goal = v ? addDays(v, 1) : '';
    settings.prefsAt = Date.now();
    saveSettings();
    sync.soon();
  }
  if (current === 'settings') renderSrs();
  renderHome();
}

// 설정의 복습 카드: 단어 코치, 목표일·시험일, 기억 유지 그래프, 복습 주기
const PRESET_LABEL = { xs: '매우 짧게', s: '짧게', m: '보통', l: '길게', xl: '매우 길게' };
function renderSrs() {
  ensureCoachPlan();
  const g = settings.goal, ex = settings.exam;
  fillGoalInput($('#goal-date'));
  $('#srs-exam-date').value = ex || '';
  const coach = !!settings.coach;
  $('#opt-coach').checked = coach;
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
  // 쉬는 요일: 누를 때마다 켜고 끔. 그날은 새 단어·전체 복습 몫 없이 쉬고, 나머지 날에 나눔
  const rb = $('#coach-rest');
  $('#coach-rest-label').hidden = rb.hidden = !coach;
  rb.innerHTML = '';
  if (coach) {
    const rest = cleanRest(settings.coachRest);
    [1, 2, 3, 4, 5, 6, 0].forEach(i => {
      const b = el('button', 'chip rest-chip' + (rest.includes(i) ? ' on' : ''), WEEKDAY[i]);
      b.type = 'button';
      b.setAttribute('aria-pressed', rest.includes(i));
      b.addEventListener('click', () => {
        const next = rest.includes(i) ? rest.filter(x => x !== i) : [...rest, i];
        if (cleanRest(next).length !== next.length) { toast('일주일 내내 쉴 수는 없어요'); return; }
        setRest(next);
        if (coachActive()) planCoach(true); else { settings.prefsAt = Date.now(); saveSettings(); sync.soon(); }
        toast(settings.coachRest.length ? `${restLabel(settings.coachRest)}은 쉬어요` : '쉬는 요일 없이 매일 해요');
        renderSrs();
      });
      rb.appendChild(b);
    });
  }
  $('#btn-coach-talk').hidden = aiCoachOnline() ? !coach : !coachActive() || dateStr() >= settings.coachGoal || !leftNew();
  $('#btn-coach-talk').textContent = aiCoachOnline() ? '코치와 이야기하기' : '일정 상의하기';
  if (coach) {
    const today = dateStr();
    if (!ex) cp.textContent = '아래에 시험일을 정하면 코치가 목표일과 하루 새 단어 수를 정해 줘요.';
    else if (ex <= today) cp.textContent = '시험일이 지났어요. 다음 시험일을 정하면 일정을 다시 짜요. 그때까지는 기본 방식으로 해요.';
    else {
      const gd = settings.coachGoal, rd = daysBetween(gd, ex);
      cp.textContent = today >= gd ? `새 단어는 끝났어요. 시험 전날까지 ${daysBetween(today, ex)}일 동안 범위 전체를 나눠 복습해요.`
        : `시험까지 ${daysBetween(today, ex)}일 · 새 단어는 ${fmtDay(lastLearnDay())}까지(오늘 ${todayNewTarget()}개) · ` + (rd > 0 ? `마지막 ${rd === 1 ? '하루' : `${rd}일`}는 범위 전체 복습`.replace('일는', '일은') : '시험 전날까지 새 단어')
          + (settings.coachFix ? ` (하루 ${settings.coachFix}개로 고정)` : settings.coachReview ? ' (복습 날 수는 직접 정함)' : '') + (restNow().length ? ` · ${restLabel(restNow())}은 쉼` : '');
    }
  }
  const warn = $('#srs-warn');
  const msg = coach || !g ? ''
    : !ex || ex <= dateStr() ? '시험일도 정해야 목표일 다음 날부터 시험 전날까지 범위 전체를 복습해요.'
      : g >= ex ? '목표일은 시험 전전날까지여야 해요.' : '';
  warn.hidden = !msg;
  warn.textContent = msg;
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

// ---------- 꾸미기 (js/look.js가 <head>에서 먼저 불러 둠) ----------
const ACCENT_NAME = { navy: '인디고', forest: '숲', grape: '포도', coral: '코랄', ink: '먹색' };
const ACCENT_SW = { navy: '#4f5bd5', forest: '#1e9e6a', grape: '#7a5af8', coral: '#f0614f', ink: '#1a1a17' };
const HOME_PART = { plan: '학습 계획 · 암기 진도', practice: '다시 볼 단어 · 범위 연습' }; // 코치·단어장·DAY별 진도는 아래 탭으로 옮김
// 짧은 소리 (파일 없이 Web Audio로): tone([[주파수, 길이초], …], 크기, 파형)
// 소리 낼 때 처음 켜면 스피커·이어폰이 깨어나는 동안 늦게 들려서, 화면을 처음 누를 때 미리 켜 둠 (warmAudio)
let audioCtx = null;
function audio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const s = audioCtx.createBufferSource(); // 아이폰: 누를 때 소리 없는 소리를 한 번 내야 열림
      s.buffer = audioCtx.createBuffer(1, 1, 22050);
      s.connect(audioCtx.destination); s.start(0);
    }
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
  } catch { audioCtx = null; }
  return audioCtx;
}
function warmAudio() { const lk = LOOK.get(); if (lk.sound || lk.kbSound) audio(); }
function tone(notes, vol = .06, type = 'sine') {
  const ctx = audio();
  if (!ctx) return;
  const play = () => {
    try {
      let t = ctx.currentTime + .005;
      for (const [f, d] of notes) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + .02);
        t += d * .8;
      }
    } catch { /* 소리를 못 내는 브라우저 */ }
  };
  // 잠들어 있었으면 깨어난 다음에 (멈춘 시계에 맞춰 놓으면 깨어날 때 한꺼번에 밀려서 남)
  if (ctx.state === 'running') play(); else ctx.resume().then(play, () => {});
}
// 정답 반응: 맞히면 효과음, 틀리면 진동 (설정 > 소리). test = 스위치를 켤 때 한 번 들려 주기
function answerFx(state, test = false) {
  const lk = LOOK.get();
  if (state === 'ok' && (lk.sound || test)) tone([[880, .09], [1320, .16]], .07);
  if (state === 'bad' && (lk.buzz || test) && navigator.vibrate) navigator.vibrate([40, 50, 40]);
}
// 정답 반응을 고르면 설정 화면에서 바로 한 번 보여 줌 (정답 시트의 '정답!' 표시처럼)
function previewReact() {
  const t = $('#react-demo');
  t.hidden = true; void t.offsetWidth; t.hidden = false;
}
function renderLook() {
  const lk = LOOK.get(), m = WORD ? 'word' : 'ex';
  setSeg('#seg-theme', lk.theme); setSeg('#seg-size', lk.size); setSeg('#seg-font', lk.font); setSeg('#seg-radius', lk.radius);
  setSeg('#seg-edge', lk[m].edge); setSeg('#seg-glow', lk[m].glow); setSeg('#seg-react', lk.react); setSeg('#seg-kb', lk.kb);
  $('#opt-look-share').checked = lk.share;
  $('#opt-fx-sound').checked = lk.sound; $('#opt-fx-buzz').checked = lk.buzz; $('#opt-kb-sound').checked = lk.kbSound;
  $('#row-fx-buzz').hidden = !navigator.vibrate; // 아이폰 사파리는 웹 진동이 안 됨
  const sw = $('#sw-accent');
  sw.innerHTML = '';
  for (const a of LOOK.CHOICES.accent) {
    const b = el('button', 'swatch' + (lk[m].accent === a ? ' on' : ''));
    b.style.setProperty('--sw', ACCENT_SW[a]);
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', lk[m].accent === a); b.setAttribute('aria-label', ACCENT_NAME[a]); b.title = ACCENT_NAME[a];
    b.addEventListener('click', () => { LOOK.set({ accent: a }); renderLook(); });
    sw.appendChild(b);
  }
  const parts = $('#home-parts');
  parts.innerHTML = '';
  for (const k of LOOK.HIDE.filter(x => HOME_PART[x])) {
    const row = el('label', 'switch-row');
    const box = el('input', 'switch');
    Object.assign(box, { type: 'checkbox', checked: !lk.hide.includes(k) });
    box.setAttribute('role', 'switch');
    box.addEventListener('change', () => {
      const hide = LOOK.get().hide.filter(x => x !== k);
      if (!box.checked) hide.push(k);
      LOOK.set({ hide });
    });
    row.append(el('span', null, HOME_PART[k]), box);
    parts.appendChild(row);
  }
}

// 고급 기능 (홈 맨 아래 스위치 하나, 기기마다 ui.adv): 끄면 클래식. 단어 외우기만 하고 설정 버튼도 없음.
// 처음 쓰는 기기는 꺼진 채로, 전에 쓰던 기기는 켜진 채로 시작 (갑자기 설정이 사라지지 않게)
const advOn = () => {
  if (typeof ui.adv !== 'boolean') { ui.adv = uiWasSaved || !!settings.coach || !!settings.goal || aiSwitch() || sync.enabled; save(UI_KEY, ui); }
  return ui.adv;
};
function applyAdv() {
  const adv = advOn();
  $('#opt-adv').checked = adv;
  renderTabs();
}
// 고급 기능을 끄면 쓰던 코치·AI도 같이 끔 (설정에 못 들어가니까. 꾸미기·동기화 연결은 그대로)
function setAdv(on) {
  ui.adv = !!on;
  save(UI_KEY, ui);
  if (on) toast('설정 탭에서 필요한 기능을 켜세요');
  else {
    const off = [];
    if (settings.coach) { setCoach(false); off.push('단어 코치'); }
    if (aiSwitch()) { setAiSwitch(false); off.push('AI'); }
    if (off.length) toast(`${off.join('·')}도 껐어요`);
  }
  renderHome();
}
function renderSettings() {
  renderLook();
  renderKeys();
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
  renderAgain();
  renderMySettings();
  renderAiStatus();
  $('#data-info').textContent = `단어 ${words.length}개 · DAY ${days.length ? days[0] : '-'}~${days.length ? days[days.length - 1] : '-'}\n${dataInfo}`;
  $('#data-info').style.whiteSpace = 'pre-line';
}

// 다시 나오기 설정: 상황(줄) × 때(칸) 표에서 칸을 켜고 끔. 위의 가볍게·추천·꼼꼼하게는 한 번에 맞춤
const AGAIN_ROWS = [['wrong', '틀렸을 때', '모름 포함'], ['hint2', '힌트 두 번', '정답 보고 씀'], ['hint1', '힌트 한 번', '힌트로 맞힘']];
const AGAIN_NAME = { soon: '곧', mid: '조금 뒤', late: '나중에', end: '맨 끝' };
const AGAIN_SUB = { soon: '1~2문제', mid: '3~5문제', late: '8~12문제', end: '마지막' };
const AGAIN_PRESETS = { light: AGAIN_OLD, rec: AGAIN_REC, full: AGAIN_FULL };
function renderAgain() {
  const a = cleanAgain(settings.again), box = $('#again-rows');
  const preset = Object.keys(AGAIN_PRESETS).find(k => sameAgain(a, AGAIN_PRESETS[k])) || '';
  setSeg('#again-preset', preset);
  box.innerHTML = '';
  box.appendChild(el('span'));
  for (const s of AGAIN_SLOTS) { const h = el('div', 'ag-head', AGAIN_NAME[s]); h.appendChild(el('small', null, AGAIN_SUB[s])); box.appendChild(h); }
  for (const [k, name, sub] of AGAIN_ROWS) {
    const r = el('div', 'ag-row', name);
    r.appendChild(el('small', null, sub));
    box.appendChild(r);
    for (const s of AGAIN_SLOTS) {
      const on = a[k].includes(s), b = el('button', 'again-cell' + (on ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', `${name} · ${AGAIN_NAME[s]}`);
      b.addEventListener('click', () => { setAgain({ ...a, [k]: on ? a[k].filter(x => x !== s) : [...a[k], s] }); renderAgain(); });
      box.appendChild(b);
    }
  }
}

// AI 고급 설정(숨긴 메뉴)이 열렸는지. 이 기기에만 저장
const ADV_KEY = 'voca.ai.adv.v1';
const aiAdvOn = () => { try { return localStorage.getItem(ADV_KEY) === '1'; } catch { return false; } };
const setAiAdv = on => { try { localStorage.setItem(ADV_KEY, on ? '1' : '0'); } catch {} };

function renderAiStatus() {
  const sw = aiSwitch(), key = aiHasKey();
  $('#opt-ai').checked = sw;
  $('#ai-box').hidden = !sw;
  $('#ai-off').hidden = key;
  $('#ai-on').hidden = !key;
  if (key) $('#ai-info').textContent = navigator.onLine === false ? `${aiName()} 연결됨 · 지금은 오프라인이라 ${WORD ? '규칙대로 채점해요' : '기본 말풍선만 보여요'}`
    : `${aiName()} 연결됨 · ` + (WORD ? '규칙 채점에서 오답이 나오면 AI가 다시 확인해요' : '직접 입력에서 틀리면 AI가 왜 안 맞는지 말풍선으로 알려줘요');
  // 코치 AI: 따로 키를 넣으면 코치 말만 그 AI가 지음 (채점은 위의 AI 그대로). 숨겨 둔 'AI 고급 설정'에서만 보임
  const ck = aiHasKey('coach');
  $('#ai-adv').hidden = !aiAdvOn();
  if (key && ck) $('#ai-info').textContent += ` · 코치 말은 ${aiName('coach')}`;
  $('#ai-coach-off').hidden = ck;
  $('#btn-ai-coach-off').hidden = !ck;
  $('#ai-coach-info').textContent = ck ? `${aiName('coach')} 연결됨 · 단어 코치의 말은 이 AI가 지어요 (채점은 ${key ? aiName() : '규칙대로'})`
    : key ? `지금은 채점과 같은 AI(${aiName()})가 코치 말도 지어요. 다른 키를 넣으면 코치 말만 그 AI가 지어요.`
      : '키를 넣으면 단어 코치의 말을 AI가 지어요. 일정 계산은 언제나 앱이 해요.';
}

// 백업 파일 하나에 예문·단어 두 모드의 진도·학습 설정과 형광펜을 모두 담음 (예전 파일은 한 모드만 들어 있음)
function exportProgress() {
  const mine = { stats: allStats(), settings };
  const other = { stats: load(OTHER_P + 'stats.v1', {}), settings: load(OTHER_P + 'settings.v1', {}) };
  const lk = LOOK.get().share ? { look: LOOK.shared(LOOK.get()) } : {}; // 화면 꾸미기 ('꾸미기도 동기화·백업하기'를 껐으면 뺌)
  mine.bookResetAt = bookResetAt; other.bookResetAt = load(OTHER_P + 'bookResetAt.v1', 0);
  const data = JSON.stringify({ app: 'voca-all', v: 2, at: new Date().toISOString(), ex: WORD ? other : mine, word: WORD ? mine : other, marks, mywords: myStore, ...lk }, null, 0);
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
  for (const p of Object.values(parts)) if (!p.bookResetAt) p.bookResetAt = 0;
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
    const useLook = !!(data.look && typeof data.look === 'object' && LOOK.get().share);
    if (!(await ask({
      title: '백업으로 덮어쓸까요?',
      body: `${modes.map(m => `${name(m)} 모드 ${count(m)}단어`).join(' · ')}의 진도와 학습 설정이 백업 파일의 것으로 바뀌어요.`
        + (missing.length ? `\n이 파일에는 ${name(missing[0])} 모드 진도가 없어서 그쪽은 그대로 둬요.` : '')
        + (useLook ? '\n화면 꾸미기도 백업의 것으로 바뀌어요.' : '')
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
    const prefs = st => (st && typeof st === 'object' ? { ...st, prefsAt: now, examAt: now, restAt: now } : null);
    const mineKey = WORD ? 'word' : 'ex';
    for (const m of modes) {
      const p = parts[m];
      if (m === mineKey) {
        setAllStats(norm(p.stats));
        saveStats();
        if (stamp) { resetAt = now; save(KEY.resetAt, resetAt); }
        if (prefs(p.settings)) { Object.assign(settings, prefs(p.settings)); saveSettings(); }
        dropSession(); // 하던 학습은 예전 진도 기준이라 지움
      } else {
        save(OTHER_P + 'stats.v1', norm(p.stats));
        if (stamp) save(OTHER_P + 'resetAt.v1', now);
        if (prefs(p.settings)) save(OTHER_P + 'settings.v1', { ...load(OTHER_P + 'settings.v1', {}), ...prefs(p.settings) });
        localStorage.removeItem(OTHER_P + 'session.v1');
      }
    }
    if (data.marks && typeof data.marks === 'object') { marks = mergeMarks(marks, data.marks); save(KEY.marks, marks); }
    // 내 단어: 백업의 것으로 (동기화 중이면 고친 시각을 지금으로 해서 다른 기기에도 백업이 남게)
    if (data.mywords && typeof data.mywords === 'object' && data.mywords.my) {
      const stampAll = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, stamp ? { ...v, u: now } : v]));
      const gone = Object.fromEntries(Object.keys(myStore.my || {}).filter(k => !(k in data.mywords.my)).map(k => [k, { del: 1, u: now }]));
      saveMy({ ...data.mywords, my: { ...gone, ...stampAll(data.mywords.my) }, hit: stampAll(data.mywords.hit) }, { quiet: true });
    }
    for (const m of modes) {
      const b = parts[m].bookResetAt || 0;
      if (m === mineKey) { bookResetAt = b; save(KEY.bookResetAt, bookResetAt); } else save(OTHER_P + 'bookResetAt.v1', b);
    }
    if (useLook) LOOK.adopt(data.look, true);
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

// ---------- 내 단어 올리기 (Claude가 정리해 준 글 → 확인 → 저장) ----------
let myDraft = null; // { entries, bad }
const MY_ACT = { new: '새 단어', my: '내 단어 · 처음부터', book: '단어책', deriv: '파생어', skip: '이미 올림' };
const actLabel = en => (en.act === 'book' && en.book ? `단어책 DAY ${en.book.day} ${en.book.word}` : en.act === 'deriv' && en.book ? `${en.book.word}의 파생어` : MY_ACT[en.act]);
function openMyImport() {
  myDraft = null;
  $('#my-step-input').hidden = false;
  $('#my-preview').hidden = true;
  show('myimport');
}
async function copyPrompt() {
  try { await navigator.clipboard.writeText(CLAUDE_PROMPT); toast('부탁 문구를 복사했어요. 노트 사진과 같이 Claude 채팅에 보내요', 3200); }
  catch { const t = $('#my-text'); t.value = CLAUDE_PROMPT; t.select(); toast('복사가 안 돼서 입력칸에 넣었어요. 길게 눌러 복사해요', 3200); }
}
function checkMyText(text) {
  const { rows, bad } = parseMyText(text, { today: dateStr() });
  if (!rows.length) { toast(bad.length ? `읽을 수 있는 줄이 없어요 (${bad[0].why})` : '붙여넣은 글이 비어 있어요', 3200); return; }
  myDraft = { entries: matchRows(rows, words, myStore), bad };
  renderMyPreview();
}
function renderMyPreview() {
  const { entries, bad } = myDraft;
  $('#my-step-input').hidden = true;
  $('#my-preview').hidden = false;
  const n = a => entries.filter(e => e.act === a).length;
  const parts = [n('new') + n('deriv') ? `새 내 단어 ${n('new') + n('deriv')}` : '', n('book') ? `단어책에 있음 ${n('book')}` : '', n('my') ? `이미 내 단어 ${n('my')}` : '', n('skip') ? `이미 올림 ${n('skip')}` : ''].filter(Boolean);
  $('#my-sum').textContent = parts.join(' · ') + (bad.length ? ` · 못 읽은 줄 ${bad.length}` : '');
  const box = $('#my-rows');
  box.innerHTML = '';
  const group = el('div', 'day-group');
  entries.forEach(en => {
    const r = en.row, item = el('div', 'item my-row' + (en.act === 'skip' ? ' faded' : ''));
    const head = el('div', 'item-head'), main = el('div', 'item-main'), top = el('div');
    top.appendChild(el('span', 'w', r.word));
    if (r.form) top.appendChild(el('span', 'my-form', ` ← ${r.form}`));
    main.append(top, el('div', 'm', [r.pos, r.meaning].filter(Boolean).join(' ')));
    if (r.ex) main.appendChild(el('div', 'my-ex', r.ex));
    head.appendChild(main);
    if (en.opts.length > 1) {
      // 단어책 ↔ 새 단어, 파생어 ↔ 단어책 단어로 바꿀 수 있음
      const seg = el('div', 'seg my-act');
      for (const a of en.opts) {
        const b = el('button', a === en.act ? 'on' : '', a === 'new' ? '새 단어로' : a === 'book' && en.act === 'deriv' ? `${en.book.word}로` : actLabel({ ...en, act: a }));
        b.type = 'button';
        b.addEventListener('click', () => { en.act = a; renderMyPreview(); });
        seg.appendChild(b);
      }
      main.appendChild(seg);
    } else head.appendChild(el('span', 'w-state' + (en.act === 'skip' ? '' : en.act === 'my' ? ' bad' : ' ok'), actLabel(en)));
    if (en.act === 'book' || en.act === 'my') main.appendChild(el('div', 'my-note', '아직 덜 외운 단어라 처음부터 다시 복습해요 · 독해 표시가 붙어요'));
    item.appendChild(head);
    group.appendChild(item);
  });
  box.appendChild(group);
  if (bad.length) {
    const b = el('div', 'card muted my-bad');
    b.textContent = '못 읽은 줄 — ' + bad.map(x => `${x.line ? `${x.line}번째 줄` : ''} ${x.why}`.trim()).join(' · ');
    box.appendChild(b);
  }
  const todo = entries.filter(e => e.act !== 'skip').length;
  $('#btn-my-save').disabled = !todo;
  $('#btn-my-save').textContent = todo ? `${todo}개 저장` : '바뀌는 게 없어요';
}
// 독해에서 또 막힌 카드를 두 모드 모두 처음부터: 0단계, 내일 복습(직접 입력), 졸업·4지선다 표시는 지움. 아직 안 배운 쪽은 그대로(오늘의 학습에 먼저 나옴)
function restartCards(ids) {
  const now = Date.now(), due = addDays(dateStr(), 1);
  const reset = v => { if (!v || v.del) return null; const { k, iv, g, q, r, ...rest } = normalizeStat(v); return { ...rest, st: 0, due, s: now }; };
  const done = new Set();
  for (const id of ids) { const x = reset(stats[id]); if (x) { stats[id] = x; done.add(id); } }
  saveStats();
  const os = load(OTHER_P + 'stats.v1', {});
  let changed = false;
  for (const id of ids) { const x = reset(os[id]); if (x) { os[id] = x; changed = true; done.add(id); } }
  if (changed) save(OTHER_P + 'stats.v1', os);
  return done.size; // 실제로 처음으로 돌린 카드 수 (아직 안 배운 단어는 빼고)
}
function saveMyDraft() {
  if (!myDraft) return;
  const { store, newMy, hitMy, hitBook } = applyImport(myStore, myDraft.entries);
  saveMy(store);
  const again = restartCards([...hitMy, ...hitBook]), first = hitMy.length + hitBook.length - again;
  sync.now();
  myDraft = null;
  const parts = [newMy.length ? `새 내 단어 ${newMy.length}개` : '', again ? `처음부터 다시 ${again}개` : '', first ? `아직 안 배운 단어책 단어 ${first}개는 먼저 배워요` : ''].filter(Boolean);
  toast(`${parts.join(' · ') || '저장했어요'} · 오늘의 학습·복습에 섞여 나와요`, 3200);
  $('#my-text').value = '';
  goHome();
}
function exportMy() {
  const blob = new Blob(['\ufeff' + exportMyCSV(myStore)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voca-mywords-${dateStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// 설정 > 복습 > 내 단어 (두 모드 공용 설정, 기기끼리 맞춤)
function renderMySettings() {
  const c = cfg();
  setSeg('#seg-my-per', String(c.per));
  const live = myWords.length, hits = Object.values(myStore.hit || {}).filter(h => h && !h.del).length;
  const grad = myWords.filter(w => stats[w.id] && stats[w.id].g).length, wait = myQueue().length;
  $('#my-info').textContent = live || hits
    ? [`내 단어 ${live}개`, hits ? `독해에서 막힌 단어책 단어 ${hits}개` : '', wait ? `배울 차례를 기다리는 ${wait}개` : '', grad ? `졸업 ${grad}개` : ''].filter(Boolean).join(' · ')
    : '문제를 풀다 모르는 단어를 노트에 적고, 사진을 Claude 채팅에 주면 정리해 줘요. 그 글을 여기에 올려요.';
}
function setMyCfg(patch) {
  saveMy({ ...myStore, cfg: { ...cfg(), ...patch, at: Date.now() } });
  renderMySettings();
}

// 단어책 새로 시작 (겨울방학 같은 때): 단어책 단어의 진도만 두 모드 모두 처음으로. 내 단어 진도·독해 표시·형광펜은 그대로.
// 누르기 전에 백업 파일을 받아 두고, 지난 바퀴에 틀린 횟수는 단어마다 숫자 하나로 남김(단어장에 '지난 바퀴 n번 틀림')
async function restartBook() {
  const o = load(OTHER_P + 'stats.v1', {});
  const learned = words.filter(w => (stats[w.id] && !stats[w.id].del) || (o[w.id] && !o[w.id].del)).length;
  if (!learned) { toast('단어책에 지울 진도가 없어요'); return; }
  const round = (myStore.round && myStore.round.n) || 1;
  if (!(await ask({
    title: '단어책을 처음부터 다시 시작할까요?',
    body: `예문·단어 모드에서 단어책 단어 ${learned}개의 진도가 처음으로 돌아가요 (${round + 1}바퀴째).\n내 단어 진도, 독해에서 막힌 표시, 형광펜은 그대로예요.\n지난 바퀴에 틀린 횟수는 단어장에 남고, 누르면 지금 진도를 백업 파일로 먼저 받아요.` + (sync.enabled ? '\n동기화된 다른 기기에서도 처음부터예요.' : ''),
    ok: '새로 시작', danger: true,
  }))) return;
  exportProgress();
  const now = Date.now(), wrong = {};
  for (const w of words) {
    const n = ((stats[w.id] && !stats[w.id].del && stats[w.id].w) || 0) + ((o[w.id] && !o[w.id].del && o[w.id].w) || 0);
    if (n) wrong[w.id] = n;
  }
  saveMy({ ...myStore, round: { n: round + 1, at: now, w: wrong } }, { quiet: true });
  bookResetAt = now;
  save(KEY.bookResetAt, now);
  for (const id of Object.keys(stats)) if (!isMyId(id)) delete stats[id];
  for (const id of Object.keys(tombs)) if (!isMyId(id)) delete tombs[id];
  saveStats();
  save(OTHER_P + 'stats.v1', Object.fromEntries(Object.entries(o).filter(([id]) => isMyId(id))));
  save(OTHER_P + 'bookResetAt.v1', now);
  localStorage.removeItem(OTHER_P + 'session.v1');
  const day = loadDay();
  if (Array.isArray(day.review)) { day.review = day.review.filter(isMyId); save(KEY.day, day); }
  dropSession();
  sync.now();
  renderSettings();
  toast(`단어책 ${round + 1}바퀴째를 시작해요`, 2600);
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
  // 두 모드 모두 졸업한 내 단어는 가볍게 (Claude 예문·지난 지문 문장을 빼고 최근 지문 문장 하나만, 이 기기에서만)
  const os = load(OTHER_P + 'stats.v1', {});
  const slim = slimMy(myStore, id => !!(stats[id] && stats[id].g) && (!os[id] || !!os[id].del || !!os[id].g));
  if (slim !== myStore) saveMy(slim, { quiet: true });
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
  $('#opt-review-mix').addEventListener('change', e => { settings.reviewMix = e.target.checked; settings.prefsAt = Date.now(); saveSettings(); sync.soon(); }); // 기기끼리도 맞춤
  onSeg('#seg-layout', v => { ui.choiceLayout = v; save(UI_KEY, ui); });
  // 설정 탭: 누른 탭의 카드만 보임. 앱을 켜 둔 동안은 마지막 탭을 기억
  let setTab = 'quiz';
  const showSetTab = t => {
    setTab = t;
    setSeg('#set-tabs', t);
    document.querySelectorAll('#settings .card[data-tab]').forEach(c => c.classList.toggle('tab-off', c.dataset.tab !== t));
    $('#set-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === t));
  };
  onSeg('#set-tabs', v => { showSetTab(v); scrollTo(0, 0); });
  $('#opt-adv').addEventListener('change', e => setAdv(e.target.checked));
  showSetTab(setTab);
  $('#btn-set-plan').addEventListener('click', () => { if (ui.simpleHome) { renderHome(); planFrom = 'settings'; show('plan', false); } else goHome(); });
  onSeg('#seg-ko', v => { settings.showKo = v === 'show'; saveSettings(); renderHome(); });
  onSeg('#seg-new', v => { settings.newPerDay = +v; settings.prefsAt = Date.now(); saveSettings(); renderPlan(); sync.soon(); });
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
    dropSession();
    sync.soon();
    renderHome();
    toast('지웠어요');
  });
  $('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });
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
  // 내 단어 올리기
  $('#btn-list-my').addEventListener('click', openMyImport);
  $('#btn-my-open').addEventListener('click', openMyImport);
  $('#btn-my-back').addEventListener('click', () => { if (myDraft) { myDraft = null; $('#my-preview').hidden = true; $('#my-step-input').hidden = false; } else goHome(); });
  $('#btn-my-redo').addEventListener('click', () => { myDraft = null; $('#my-preview').hidden = true; $('#my-step-input').hidden = false; });
  $('#btn-my-prompt').addEventListener('click', copyPrompt);
  $('#btn-my-prompt2').addEventListener('click', copyPrompt);
  $('#btn-my-check').addEventListener('click', () => checkMyText($('#my-text').value));
  $('#btn-my-file').addEventListener('click', () => $('#my-file').click());
  $('#my-file').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) checkMyText(await f.text()); });
  $('#btn-my-save').addEventListener('click', saveMyDraft);
  $('#btn-my-export').addEventListener('click', () => { if (!myWords.length && !Object.keys(myStore.hit || {}).length) { toast('내보낼 내 단어가 없어요'); return; } exportMy(); });
  onSeg('#seg-my-per', v => setMyCfg({ per: +v }));
  $('#btn-book-restart').addEventListener('click', restartBook);
  $('#plan-sum-card').addEventListener('click', () => { planFrom = null; show('plan'); });
  $('#btn-plan-back').addEventListener('click', () => {
    if (planFrom === 'settings' && history.state && history.state.s === 'settings') { planFrom = null; renderSettings(); renderSyncStatus(); show('settings', false); }
    else goHome();
  });
  onSeg('#seg-filter', v => { listFilter = v; renderList(); });
  $('#book-day-btn').addEventListener('click', openBookDays);

  $('#btn-quit').addEventListener('click', quitQuiz);
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-idk').addEventListener('click', giveUp);
  $('#fb-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setFbTab(b.dataset.t); });
  $('#btn-next').addEventListener('click', next);
  $('#btn-res-home').addEventListener('click', () => goHome());

  $('#btn-settings-back').addEventListener('click', () => goHome());
  $('#btn-report').addEventListener('click', () => openReport(null));
  // 못 보낸 신고가 있으면 앱을 열 때·인터넷이 돌아올 때 다시 보냄
  flushReports();
  window.addEventListener('online', () => flushReports());
  onSeg('#seg-accent', v => { settings.accent = v; saveSettings(); });
  onSeg('#again-preset', v => { setAgain(AGAIN_PRESETS[v] || AGAIN_REC); renderAgain(); });
  onSeg('#seg-strict', v => { settings.strict = v; saveSettings(); $('#strict-desc').textContent = STRICT_DESC[v] || ''; });
  $('#rate').addEventListener('input', e => { settings.rate = +e.target.value; $('#rate-val').textContent = `${settings.rate}x`; saveSettings(); });
  $('#opt-autospeak').addEventListener('change', e => { settings.autoSpeak = e.target.checked; saveSettings(); });
  $('#opt-meaning').addEventListener('change', e => { settings.showMeaning = e.target.checked; saveSettings(); });
  $('#opt-appkb').addEventListener('change', e => { settings.appKeyboard = e.target.checked; saveSettings(); });
  $('#opt-simplehome').addEventListener('change', e => { ui.simpleHome = e.target.checked; save(UI_KEY, ui); applyHomeLayout(); });
  // 꾸미기 (js/look.js): 누르면 바로 앱 전체에 보임
  for (const [sel, k] of [['#seg-theme', 'theme'], ['#seg-size', 'size'], ['#seg-font', 'font'], ['#seg-radius', 'radius'], ['#seg-edge', 'edge'], ['#seg-glow', 'glow'], ['#seg-react', 'react'], ['#seg-kb', 'kb']]) {
    onSeg(sel, v => { LOOK.set({ [k]: v }); renderLook(); if (k === 'react') previewReact(); });
  }
  for (const [id, k] of [['#opt-fx-sound', 'sound'], ['#opt-fx-buzz', 'buzz'], ['#opt-kb-sound', 'kbSound']]) {
    $(id).addEventListener('change', e => {
      LOOK.set({ [k]: e.target.checked });
      if (!e.target.checked) return;
      if (k === 'sound') answerFx('ok', true); else if (k === 'buzz') answerFx('bad', true); else tone([[1800, .012]], .025, 'square');
    });
  }
  onSeg('#seg-days', v => { LOOK.set({ days: v }); renderHome(); });
  $('#opt-look-share').addEventListener('change', e => {
    LOOK.set({ share: e.target.checked });
    if (e.target.checked) { sync.now(); toast(sync.enabled ? '꾸미기를 다른 기기와 맞출게요' : '꾸미기도 백업에 들어가요. 동기화를 켜면 다른 기기와도 맞춰요'); }
    else toast('꾸미기는 이제 이 기기에만 저장돼요');
  });
  $('#btn-look-reset').addEventListener('click', async () => {
    if (!(await ask({ title: '꾸미기를 처음대로 돌릴까요?', body: '밝기·색·글자 크기·홈에 보일 것 등 화면 꾸미기만 처음 모습으로 돌아가요. 학습 기록과 설정은 그대로예요.', ok: '처음대로' }))) return;
    LOOK.reset(); renderLook(); toast('꾸미기를 처음대로 돌렸어요');
  });
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
  // 키 연결: 안 되면 까닭을 입력칸 아래에 남김 (토스트는 금방 사라져서)
  const keyError = e => {
    const d = e && e.detail ? `\n(${e.detail})` : '';
    if (!e || e.status == null || e instanceof TypeError) return '확인하지 못했어요. 인터넷을 확인해 주세요.';
    switch (e.reason) {
      case 'disabled': return `이 키를 만든 프로젝트에서 AI API가 꺼져 있어요. Gemini라면 aistudio.google.com/apikey 에서 새로 만든 키를 넣어 주세요.${d}`;
      case 'restricted': return `키에 사용 제한(웹사이트·API 제한)이 걸려 있어요. 제한 없는 키를 만들거나 제한을 풀어 주세요.${d}`;
      case 'region': return `이 지역에서는 쓸 수 없는 키래요.${d}`;
      case 'tokentype': return `Google이 이 키 종류를 받지 않았어요 (Gemini API·Vertex AI 둘 다 해 봤어요). aistudio.google.com/apikey 에서 'API 키 만들기'로 새로 만든 키를 넣어 주세요.${d}`;
      case 'unknown': return '어느 회사 키인지 알 수 없어요. 키를 처음부터 끝까지 다시 복사해 주세요. (Gemini AIza…·AQ.…, Groq gsk_…, OpenRouter sk-or-…, Claude sk-ant-…)';
      case 'busy': return `요청이 너무 많대요. 조금 뒤에 다시 해 주세요.${d}`;
      case 'nomodel': return '지금 쓸 수 있는 모델을 찾지 못했어요.';
      case 'invalid': return `키가 맞지 않대요. 앞뒤가 잘리지 않게 처음부터 끝까지 다시 복사해 주세요.${d}`;
      default: return `확인하지 못했어요 (${e.status}).${d}`;
    }
  };
  const connectKey = async (slot, input, btn, errBox, label, done) => {
    const key = input.value.trim();
    errBox.hidden = true;
    if (!key) { toast('API 키를 붙여넣어 주세요'); return; }
    btn.disabled = true;
    btn.textContent = '확인 중…';
    try {
      await aiConnect(key, slot);
      input.value = '';
      done();
    } catch (e) {
      errBox.textContent = keyError(e);
      errBox.hidden = false;
      toast('연결하지 못했어요. 아래에 까닭을 적어 뒀어요', 3000);
    }
    btn.disabled = false;
    btn.textContent = label;
    renderAiStatus();
  };
  $('#btn-ai-connect').addEventListener('click', () => connectKey('main', $('#ai-key'), $('#btn-ai-connect'), $('#ai-key-err'), '연결', () => toast(`${aiName()}에 연결했어요`)));
  // 코치용 키: 연결하면 홈 말을 새 AI로 다시 짓게 저장해 둔 말을 지움
  const forgetCoachSay = () => { localStorage.removeItem('voca.coachsay.v1'); localStorage.removeItem('voca.word.coachsay.v1'); };
  $('#btn-ai-coach-connect').addEventListener('click', () => connectKey('coach', $('#ai-coach-key'), $('#btn-ai-coach-connect'), $('#ai-coach-err'), '코치 AI 연결', () => { forgetCoachSay(); toast(`코치 말은 이제 ${aiName('coach')}가 지어요`); }));
  $('#btn-ai-coach-off').addEventListener('click', async () => {
    if (!(await ask({ title: '코치 AI 연결을 끊을까요?', body: '이 기기에서 코치용 키를 지워요. 코치 말은 채점과 같은 AI가 지어요.', ok: '연결 끊기' }))) return;
    aiDisconnect('coach');
    forgetCoachSay();
    renderAiStatus();
  });
  $('#btn-ai-adv-hide').addEventListener('click', () => {
    setAiAdv(false);
    renderAiStatus();
    toast(aiHasKey('coach') ? `숨겼어요. 코치 말은 계속 ${aiName('coach')}가 지어요` : '숨겼어요', 2500);
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
    // 내 단어 기록이 있으면 같이 지울지 따로 물어봄 (취소·바깥을 누르면 내 단어는 남김)
    const hasMine = Object.keys(stats).some(isMyId);
    const both = hasMine && await ask({ title: '내 단어 기록도 지울까요?', body: `내 단어 ${Object.keys(stats).filter(isMyId).length}개의 이 모드 진도예요. 내 단어 목록은 어느 쪽이든 그대로 남아요.`, ok: '같이 지우기', cancel: '내 단어는 남기기', danger: true });
    if (!hasMine || both) {
      stats = {}; tombs = {};
      resetAt = Date.now(); // 다른 기기의 예전 기록도 함께 지워지게
      save(KEY.resetAt, resetAt);
    } else {
      // 단어책 단어 기록만: '단어책 새로 시작'처럼 그 시각 전 단어책 기록을 버림 (이 모드만)
      for (const id of Object.keys(stats)) if (!isMyId(id)) delete stats[id];
      for (const id of Object.keys(tombs)) if (!isMyId(id)) delete tombs[id];
      bookResetAt = Date.now();
      save(KEY.bookResetAt, bookResetAt);
    }
    saveStats();
    dropSession();
    sync.now();
    toast(`${WORD ? '단어' : '예문'} 모드 진도를 초기화했어요`);
  });
  $('#btn-reload').addEventListener('click', async () => {
    await loadData();
    boot();
    renderSettings();
    toast(`단어 ${words.length}개 · DAY ${days[0]}~${days[days.length - 1]}`);
  });
  $('#btn-local-csv').addEventListener('click', () => $('#csv-file').click());
  // 복습: 목표일·시험일
  const srsChanged = () => { settings.prefsAt = Date.now(); saveSettings(); sync.soon(); renderSrs(); };
  $('#goal-date').addEventListener('change', e => setGoal(e.target));
  $('#plan-goal-date').addEventListener('change', e => setGoal(e.target));
  $('#btn-goal-clear').addEventListener('click', () => { const i = $('#plan-goal-date'); i.value = ''; setGoal(i); });
  $('#srs-exam-date').addEventListener('change', e => { if (!examOk(e.target)) return; settings.exam = e.target.value; settings.examAt = Date.now(); shareExam(settings.exam, settings.examAt); if (coachActive()) planCoach(true); coachMoved = false; srsChanged(); });
  // 단어 코치: 설정과 학습 계획 화면의 스위치, 일정 다시 짜기, 캐릭터를 누르면 폴짝
  $('#opt-coach').addEventListener('change', e => toggleCoach(e.target.checked));
  $('#opt-coach-plan').addEventListener('change', e => toggleCoach(e.target.checked));
  $('#btn-coach-talk').addEventListener('click', () => talkCoach());
  $('#btn-coach-replan').addEventListener('click', () => { if (planCoach(true)) { coachMoved = false; renderSrs(); toast('남은 날에 맞춰 일정을 다시 짰어요'); } });
  $('#cc-char').addEventListener('click', e => { const c = e.currentTarget; c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop'); });
  // '새 버전 확인'을 빠르게(1.5초 안에 이어서) 7번 누르면 AI 고급 설정이 열림. 4번째부터 몇 번 남았는지 알려 줌
  let advTaps = 0, advAt = 0;
  $('#btn-update').addEventListener('click', async () => {
    const now = Date.now();
    advTaps = now - advAt < 1500 ? advTaps + 1 : 1;
    advAt = now;
    if (advTaps >= 4) {
      if (aiAdvOn()) { toast('AI 고급 설정은 이미 열려 있어요'); advTaps = 0; return; }
      if (advTaps < 7) { toast(`${7 - advTaps}번 더 누르면 AI 고급 설정이 열려요`, 1200); return; }
      advTaps = 0;
      setAiAdv(true);
      renderAiStatus();
      if (aiSwitch()) { toast('AI 고급 설정이 열렸어요'); $('#ai-adv').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      else toast('AI 고급 설정이 열렸어요. AI 사용하기를 켜면 보여요', 3000);
      return;
    }
    if (advTaps > 1) return; // 이어서 누르는 중엔 다시 확인하지 않음
    try {
      const v = await latestVersion();
      if (v && v !== APP_VERSION) { location.reload(); return; }
      toast('최신 버전이에요');
      renderVersion();
    } catch { toast('인터넷 연결을 확인해 주세요'); }
  });
  $('#csv-file').addEventListener('change', e => { if (e.target.files.length) importLocalCSV([...e.target.files]); e.target.value = ''; });

  // 컴퓨터 키보드 단축키 (설정 > 단축키에서 바꿈, js/keys.js). Enter는 늘 채점·계속하기
  // Shift·Ctrl·Alt·⌘에 붙인 동작은 그 키만 눌렀다 뗄 때 (대문자 치려고 Shift+글자를 누른 건 아님)
  let modAlone = null;
  document.addEventListener('keydown', e => {
    const c = keyOf(e);
    const others = { Shift: e.shiftKey, Control: e.ctrlKey, Alt: e.altKey, Meta: e.metaKey };
    modAlone = isModKey(c) && !e.repeat && !Object.keys(others).some(m => m !== modBase(c) && others[m]) ? c : null;
  }, true);
  document.addEventListener('keyup', e => {
    const c = keyOf(e);
    // 떼는 키 이름이 비거나 쪽이 다르게 오는 키보드도 있어서, 같은 조합 키면 누를 때 이름으로
    if (!modAlone || (c !== modAlone && c && modBase(c) !== modBase(modAlone))) return;
    const k = modAlone;
    modAlone = null;
    const a = current === 'quiz' && !keyCapture ? actionFor(keymap, k) : null;
    if (a) quizKey(a);
  });
  document.addEventListener('pointerdown', () => { modAlone = null; }, true);
  // 맞히는 그 순간에 소리를 켜면 늦어서, 누르기 시작할 때 미리 깨워 둠
  document.addEventListener('pointerdown', warmAudio, true);
  document.addEventListener('keydown', warmAudio, true);

  document.addEventListener('keydown', e => {
    if (current !== 'quiz' || keyCapture) return;
    const fb = !$('#feedback').hidden;
    if (fb && e.key === 'Enter') { e.preventDefault(); next(); return; }
    // 4지선다: 숫자는 보기를 고르기만 하고 Enter로 채점 (마우스로 누르면 바로 채점)
    if (e.key === 'Enter' && !(q && q.answered) && !e.isComposing) {
      const p = $('#q-actions').querySelector('.choice.picked:not(:disabled)');
      if (p) { e.preventDefault(); p.click(); return; }
    }
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    const typing = !!(kb && q && !q.answered);
    const code = keyOf(e);
    if (plain && !e.isComposing && !isModKey(code)) {
      // 답하는 중엔 글자 키가 입력으로 먼저 감 (앱 키보드·글 칸)
      const answering = q && !q.answered && !fb;
      const editable = e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable="true"]');
      const blocked = answering && ((typing && kbTypes(code)) || (editable && isTypingKey(code)));
      const a = blocked ? null : actionFor(keymap, code);
      if (a && quizKey(a)) { e.preventDefault(); return; }
    }
    if (typing && plain) {
      // 한글 자판 상태(e.key가 'Process'나 한글)여도 누른 자리(e.code)의 영문자로 받음
      const byCode = /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : e.code === 'Space' ? ' ' : e.code === 'Quote' ? "'" : e.code === 'Minus' ? '-' : '';
      const ch = /^[a-zA-Z' -]$/.test(e.key) ? e.key.toLowerCase() : e.key.length !== 1 || e.key.charCodeAt(0) > 127 ? byCode : '';
      if (e.key === 'Enter') kb.submit();
      else if (e.key === 'Backspace') kb.type('back');
      else if (ch) kb.type(ch);
      else return;
      e.preventDefault();
    }
  });

  // 설정 > 단축키: 버튼을 누르고 쓸 키를 누름 (Backspace·Delete = 없음, 다른 곳을 누르면 그만)
  $('#btn-keys-reset').addEventListener('click', () => {
    stopKeyCapture();
    keymap = cleanKeys({}); save(KEYS_KEY, keymap);
    renderKeys(); toast('단축키를 처음대로 돌렸어요');
  });
  renderKeys(); // 퀴즈 버튼에 단축키 이름 달기
}

// ---------- 컴퓨터 단축키 (js/keys.js) ----------
const actionName = a => (KEY_ACTIONS.find(([k]) => k === a) || [a, a])[1];

// 퀴즈에서 단축키를 누름. 지금 할 수 없는 동작이면 false (그 키의 원래 동작을 막지 않게)
function quizKey(a) {
  const fb = !$('#feedback').hidden;
  const open = !!(q && !q.answered && !fb);
  if (a === 'quit') { quitQuiz(); return true; }
  if (a === 'next') { if (!fb) return false; next(); return true; }
  if (a === 'speak') { if (!fb) return false; $('#fb-speak').click(); return true; }
  if (a === 'mark') {
    if (!fb) return false;
    $('#fb-mark').click();
    return true;
  }
  if (a === 'hint') { if (!open) return false; useHint(); return true; }
  if (a === 'idk') { if (!open || $('#btn-idk').hidden) return false; giveUp(); return true; }
  const i = ['c1', 'c2', 'c3', 'c4'].indexOf(a);
  if (i < 0 || !open) return false;
  const c = $('#q-actions').querySelectorAll('.choice')[i];
  if (!c || c.disabled) return false;
  $('#q-actions').querySelectorAll('.choice.picked').forEach(x => x.classList.remove('picked'));
  c.classList.add('picked');
  c.scrollIntoView({ block: 'nearest' });
  return true;
}

function renderKeys() {
  const box = $('#key-rows');
  box.innerHTML = '';
  for (const [a, name] of KEY_ACTIONS) {
    const row = el('div', 'key-row');
    const b = el('button', 'key-chip' + (keymap[a] ? '' : ' none'), keyLabel(keymap[a]));
    b.type = 'button';
    b.setAttribute('aria-label', `${name} 단축키 ${keyLabel(keymap[a])}, 눌러서 바꾸기`);
    b.addEventListener('click', () => (keyCapture && keyCapture.action === a ? stopKeyCapture() : startKeyCapture(a, b)));
    row.append(el('span', null, name), b);
    box.appendChild(row);
  }
  const fixed = el('div', 'key-row');
  fixed.append(el('span', null, '채점 · 계속하기'), el('span', 'key-chip fixed', 'Enter'));
  box.appendChild(fixed);
  // 퀴즈 버튼에 마우스를 올리면 단축키가 보이게
  for (const [id, a, name] of [['#btn-hint', 'hint', '힌트'], ['#btn-idk', 'idk', '모르겠어요'], ['#fb-speak', 'speak', '발음 듣기'], ['#fb-mark', 'mark', '형광펜'], ['#btn-quit', 'quit', '그만하기']]) {
    $(id).title = keymap[a] ? `${name} (${keyLabel(keymap[a])})` : name;
  }
}

function stopKeyCapture() { if (keyCapture) keyCapture.stop(); }
function startKeyCapture(a, b) {
  stopKeyCapture();
  b.classList.add('listening');
  b.textContent = '키를 누르세요';
  let mod = null;
  const finish = code => {
    const r = assignKey(keymap, a, code);
    keymap = r.map;
    save(KEYS_KEY, keymap);
    stopKeyCapture();
    renderKeys();
    if (r.swapped) toast(`'${actionName(r.swapped)}' 키와 맞바꿨어요`);
    else if (r.narrowed) toast(`'${actionName(r.narrowed)}' 키는 ${keyLabel(keymap[r.narrowed])}로 바꿨어요`);
    else if (WHILE_ANSWERING.includes(a) && kbTypes(code)) toast('직접 입력 문제에선 이 키가 글자로 쳐져서 그때는 안 먹어요', 3500);
  };
  const down = e => {
    e.preventDefault(); e.stopPropagation();
    const c = keyOf(e);
    if (isModKey(c)) { if (!e.repeat) mod = c; return; }
    mod = null;
    if (e.ctrlKey || e.metaKey || e.altKey) { toast('Ctrl·Alt·⌘와 같이 누르는 키는 못 써요'); return; }
    if (c === 'Backspace' || c === 'Delete') { finish(''); return; }
    if (!c) { toast('이 키는 알아볼 수 없어요. 다른 키를 눌러 주세요'); return; }
    if (c === 'Enter' || c === 'Tab') { toast('Enter·Tab은 바꿀 수 없어요'); return; }
    finish(c);
  };
  const up = e => {
    e.preventDefault(); e.stopPropagation();
    const u = keyOf(e);
    if (mod && (u === mod || !u || modBase(u) === modBase(mod))) finish(mod);
  };
  const away = e => { if (e.target !== b) stopKeyCapture(); };
  // window에서 먼저 받아 다른 화면 단축키(Esc로 뒤로 등)가 먹지 않게
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  document.addEventListener('pointerdown', away, true);
  keyCapture = {
    action: a,
    stop() {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      document.removeEventListener('pointerdown', away, true);
      keyCapture = null;
      renderKeys();
    },
  };
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
