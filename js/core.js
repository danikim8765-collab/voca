// 순수 로직(브라우저/Node 공용): CSV 파싱, 컬럼 매핑, 빈칸 만들기, 정답 비교, 복습 간격 계산

// ---------- CSV ----------
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ---------- 컬럼 매핑 ----------
const normHeader = h => h.toLowerCase().replace(/[\s_()\[\].·:-]/g, '');

// 정확히 일치하는 이름을 먼저 찾고, 없으면 test 함수로 찾는다.
const COLUMN_RULES = {
  day: { names: ['day', '일차', '데이', 'days'], test: h => h.includes('day') || h.includes('일차') },
  blank: { names: ['빈칸형태', '빈칸', '빈칸정답', '정답', 'answer', 'blank'], test: h => h.includes('빈칸') },
  ex1ko: { names: ['예문해석', '예문1해석', '해석', '해석1', '예문뜻', '예문1뜻', '예문번역', '예문1번역'] },
  ex2ko: { names: ['예문2해석', '해석2', '예문2뜻', '예문2번역'] },
  ex1: { names: ['예문', '예문1', 'example', 'example1', '문장', '문장1', 'sentence', 'sentence1'] },
  ex2: { names: ['예문2', 'example2', '문장2', 'sentence2'] },
  word: { names: ['단어', '영단어', 'word', '표제어', '어휘', '표현', 'voca', 'vocabulary', 'english', '영어', '숙어'] },
  meaning: { names: ['뜻', '의미', 'meaning', '한글뜻', '한국어', '우리말', 'korean', '한글', '단어뜻'] },
  pos: { names: ['품사', 'pos'] },
  pron: { names: ['발음기호', '발음', 'pronunciation', 'ipa'] },
  star: { names: ['형광', '중요', '별표', 'star', '중요표시'] },
  koMark: { names: ['해석강조', '강조', '해석강조어', '뜻강조'] },
};

export function mapColumns(headers) {
  const norm = headers.map(normHeader);
  const map = {};
  const used = new Set();
  for (const [key, rule] of Object.entries(COLUMN_RULES)) {
    let idx = norm.findIndex((h, i) => !used.has(i) && rule.names.includes(h));
    if (idx < 0 && rule.test) idx = norm.findIndex((h, i) => !used.has(i) && rule.test(h));
    if (idx >= 0) { map[key] = idx; used.add(idx); }
  }
  const extras = headers.map((h, i) => i).filter(i => !used.has(i) && headers[i].trim());
  return { map, extras };
}

const HANGUL = /[ㄱ-ㆎ가-힣]/;

// 예문 칸에 "영어문장 + 한글해석"이 같이 들어있는 경우 분리
export function splitSentence(cell) {
  const s = (cell || '').trim();
  if (!s) return { en: '', ko: '' };
  const lines = s.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const en = lines.filter(l => !HANGUL.test(l)).join(' ');
    const ko = lines.filter(l => HANGUL.test(l)).join(' ');
    if (en) return { en, ko };
  }
  const m = s.match(HANGUL);
  if (m && m.index > 0 && /[A-Za-z]/.test(s.slice(0, m.index))) {
    let cut = m.index;
    const before = s.slice(0, cut);
    const lastEnd = Math.max(before.lastIndexOf('.'), before.lastIndexOf('?'), before.lastIndexOf('!'));
    if (lastEnd > 0) cut = lastEnd + 1;
    return { en: s.slice(0, cut).trim(), ko: s.slice(cut).trim().replace(/^[(\[/|-]\s*|[)\]]\s*$/g, '') };
  }
  return { en: s, ko: '' };
}

// 예문 끝의 출처 표시 "[수능응용]" 분리
export function splitSource(cell) {
  const m = String(cell || '').match(/^([\s\S]*?)\s*\[([^\]]{1,12})\]\s*$/);
  return m && m[1].trim() ? [m[1].trim(), m[2]] : [String(cell || '').trim(), ''];
}

export function dayNumber(v) {
  const m = String(v || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// CSV 텍스트 여러 개 → 단어 배열
export function rowsToWords(csvTexts) {
  const words = [];
  const seen = new Set();
  for (const { name, text } of csvTexts) {
    const rows = parseCSV(text);
    if (rows.length < 2) continue;
    const headers = rows[0].map(h => h.trim());
    const { map, extras } = mapColumns(headers);
    let lastDay = null;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = k => (map[k] != null ? (row[map[k]] || '').trim() : '');
      let day = dayNumber(get('day'));
      if (day == null) day = lastDay; // 병합 셀처럼 비어 있으면 위 DAY를 이어받음
      lastDay = day;
      const word = get('word') || get('blank');
      if (!word || day == null) continue;
      const [x1, src1] = splitSource(get('ex1'));
      const [x2, src2] = splitSource(get('ex2'));
      const e1 = splitSentence(x1);
      const e2 = splitSentence(x2);
      const id = `${day}|${word}`;
      if (seen.has(id)) continue;
      seen.add(id);
      words.push({
        id, day, word,
        meaning: get('meaning'),
        blank: get('blank') || word,
        ex1: e1.en, ex1ko: get('ex1ko') || e1.ko,
        ex2: e2.en, ex2ko: get('ex2ko') || e2.ko,
        ex1src: src1, ex2src: src2,
        star: /^(o|y|yes|1|true|★|v|✓|○)$/i.test(get('star')),
        koMark: get('koMark'),
        pos: get('pos'), pron: get('pron'),
        extras: extras.map(i => [headers[i], (row[i] || '').trim()]).filter(([, v]) => v && !/^[-–—x]$/i.test(v)),
        source: name,
      });
    }
  }
  words.sort((a, b) => a.day - b.day);
  return words;
}

// ---------- 빈칸 ----------
// "convince A of B", "convinced ~ of", "be convinced … of", "make up one's mind" → 연속된 덩어리(parts)로 분리
const PLACEHOLDER_EXACT = new Set(['A', 'B', 'C', 'D', 'N', 'V', 'O']);
const PLACEHOLDER_CI = new Set([
  'sb', 'sth', "sb's", "sth's", 'sb.', 'sth.', 'someone', 'somebody', 'something', "someone's", "somebody's",
  "one's", 'oneself', 'n', 'v', 'v-ing', 'ving', 'to-v', 'doing', 'to-do', 'etc', 'etc.',
  "a's", "b's",
]);

export function answerParts(blankForm) {
  let s = String(blankForm || '').replace(/[’‘`´]/g, "'").trim();
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' | ');
  s = s.replace(/…+|\.{2,}|[~〜∼～]+|_+|\/|\||\+|,|·|=|—|–/g, ' | ');
  const parts = [];
  let cur = [];
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    const isPh = tok === '|' || PLACEHOLDER_EXACT.has(tok) || PLACEHOLDER_CI.has(tok.toLowerCase());
    if (isPh) { if (cur.length) parts.push(cur.join(' ')); cur = []; }
    else cur.push(tok);
  }
  if (cur.length) parts.push(cur.join(' '));
  if (!parts.length && s.replace(/\|/g, '').trim()) return [s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()];
  return parts;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BE_FORMS = '(?:be|am|is|are|was|were|been|being|\'m|\'s|\'re)';

// 자주 쓰는 불규칙 동사 (단어는 원형, 예문은 과거형일 때 대비)
const IRREGULAR = Object.fromEntries(`
make:made take:took:taken give:gave:given come:came go:went:gone:goes get:got:gotten have:had:has
do:did:done:does keep:kept bring:brought think:thought hold:held run:ran break:broke:broken find:found
stand:stood lead:led fall:fell:fallen feel:felt leave:left lay:laid lie:lay:lain see:saw:seen say:said
tell:told know:knew:known grow:grew:grown throw:threw:thrown speak:spoke:spoken write:wrote:written
drive:drove:driven rise:rose:risen choose:chose:chosen catch:caught teach:taught buy:bought seek:sought
fight:fought sell:sold send:sent spend:spent build:built lose:lost meet:met pay:paid win:won begin:began:begun
bear:bore:borne:born wear:wore:worn tear:tore:torn draw:drew:drawn show:showed:shown fly:flew:flown
forget:forgot:forgotten stick:stuck strike:struck:stricken hang:hung swear:swore:sworn deal:dealt mean:meant
sit:sat shake:shook:shaken wake:woke:woken hide:hid:hidden bite:bit:bitten fling:flung stride:strode:stridden
cling:clung swing:swung sting:stung slide:slid sweep:swept weep:wept creep:crept leap:leapt:leaped dig:dug
spin:spun sink:sank:sunk shrink:shrank:shrunk sow:sown tread:trod:trodden forbid:forbade:forbidden
forgive:forgave:forgiven withdraw:withdrew:withdrawn undergo:underwent:undergone overcome:overcame
foresee:foresaw:foreseen overtake:overtook:overtaken mislead:misled undertake:undertook:undertaken
withstand:withstood uphold:upheld arise:arose:arisen awake:awoke:awoken feed:fed flee:fled ride:rode:ridden
steal:stole:stolen freeze:froze:frozen shine:shone shoot:shot light:lit spit:spat string:strung wring:wrung
wind:wound dwell:dwelt lend:lent bend:bent sling:slung stink:stank:stunk bind:bound grind:ground
breed:bred bleed:bled flee:fled forsake:forsook:forsaken overhear:overheard override:overrode:overridden
`.trim().split(/\s+/).flatMap(e => { const f = e.split(':'); return f.map(x => [x, f]); }));

// 숙어 안의 전치사·부사는 형태가 변하지 않음
const PARTICLES = new Set(`of to in on at for with from into onto up down out off over away back through about
across by as along around against among upon under after before behind beyond without within toward towards
apart aside ahead the a an and or`.split(/\s+/));

// 규칙 변화: convince → convince|convinces|convinced|convincing, stop → stopped, carry → carried, cut → cutting
function inflect(lw) {
  let base = lw, tail = '';
  if (/[^aeiou]y$/.test(lw)) { base = lw.slice(0, -1); tail = '(?:y|ies|ied|ying)'; }
  else if (/ie$/.test(lw)) { base = lw.slice(0, -2); tail = '(?:ie|ies|ied|ying)'; }
  else if (/e$/.test(lw)) { base = lw.slice(0, -1); tail = '(?:e|es|ed|ing)'; }
  else {
    const last = lw[lw.length - 1];
    const dbl = /[bdgklmnprtvz]/.test(last) ? `|${last}ed|${last}ing` : '';
    tail = `(?:|s|es|ed|ing${dbl})`;
  }
  return escapeRe(base) + tail;
}

function wordPattern(w, head) {
  const lw = w.toLowerCase();
  if (lw === 'be') return BE_FORMS;
  if (!/^[a-z]+$/.test(lw) || (PARTICLES.has(lw) && !head)) return escapeRe(w);
  const alts = [inflect(lw)];
  if (IRREGULAR[lw]) for (const f of IRREGULAR[lw]) if (f !== lw) alts.push(inflect(f));
  return alts.length > 1 ? `(?:${alts.join('|')})` : alts[0];
}

// 구형 iOS Safari는 lookbehind 미지원 → 앞 글자를 그룹으로 잡고 위치를 보정
const PRE = '(^|[^A-Za-z])';
const POST = '(?![A-Za-z])';

function partRegex(part) {
  const body = part.split(/\s+/).filter(Boolean).map((w, i) => wordPattern(w, i === 0)).join('\\s+');
  return new RegExp(`${PRE}(${body})${POST}`, 'gi');
}

function execAt(re, sent, pos) {
  re.lastIndex = pos;
  const m = re.exec(sent);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length };
}

// 여러 단어 덩어리: 붙어 있거나(carried off) 첫 단어 뒤가 갈라진 경우(carry this off, let his son down)
function findPhrase(sent, part) {
  const ws = part.split(/\s+/).filter(Boolean);
  if (ws.length === 1) {
    const re = partRegex(part);
    const out = [];
    let r, pos = 0;
    while ((r = execAt(re, sent, pos))) { out.push(r); pos = r.end; }
    return out;
  }
  const head = wordPattern(ws[0], true);
  const rest = ws.slice(1).map(w => wordPattern(w)).join('\\s+');
  // 사이에는 구두점 없이 최대 3단어까지
  const re = new RegExp(`${PRE}(${head})((?:\\s+[A-Za-z'-]+){0,3}?\\s+)(${rest})${POST}`, 'gi');
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(sent))) {
    const s1 = m.index + m[1].length;
    const e1 = s1 + m[2].length;
    const s2 = e1 + m[3].length;
    const e2 = s2 + m[4].length;
    if (/^\s+$/.test(m[3])) out.push({ start: s1, end: e2 });
    else out.push({ start: s1, end: e1 }, { start: s2, end: e2 });
    re.lastIndex = e2;
  }
  return out;
}

// 갈라진 덩어리(convince A of B)를 순서대로 찾는다. 문장 안에 여러 번 나오면 모두 찾음
function findSequences(sent, parts) {
  const all = [];
  let pos = 0;
  for (;;) {
    const seq = [];
    let p = pos;
    for (const part of parts) {
      const r = execAt(partRegex(part), sent, p);
      if (!r) break;
      seq.push(r);
      p = r.end;
    }
    if (seq.length < parts.length) break;
    all.push(...seq);
    pos = p;
  }
  return all;
}

const PRE_BLANK = /_{2,}|\(\s*\)|\[\s*\]|＿{2,}/g;

/**
 * 문장을 [{t:'text', v}, {t:'blank', v, i}] 조각으로 나눈다.
 * 반환: { segs, blanks: [원문 조각...], ok: 빈칸을 만들었는지 }
 */
export function makeBlanks(sentence, blankForm, fallbackWord) {
  const sent = String(sentence || '').replace(/[’‘]/g, "'");
  if (!sent) return { segs: [], blanks: [], ok: false };

  // 이미 빈칸이 뚫려 있는 예문
  if (PRE_BLANK.test(sent)) {
    PRE_BLANK.lastIndex = 0;
    const ranges = [];
    let m;
    while ((m = PRE_BLANK.exec(sent))) ranges.push({ start: m.index, end: m.index + m[0].length, pre: true });
    const parts = answerParts(blankForm);
    return build(sent, ranges, parts);
  }

  const tryForms = [...new Set([blankForm, fallbackWord].filter(Boolean))];
  for (const form of tryForms) {
    const parts = answerParts(form);
    if (!parts.length) continue;
    const found = parts.length === 1 ? findPhrase(sent, parts[0]) : findSequences(sent, parts);
    if (found.length) return build(sent, found);
    // 일부만 찾은 경우라도 찾은 덩어리는 가린다
    if (parts.length > 1) {
      const partial = [];
      let pos = 0;
      for (const p of parts) {
        const r = execAt(partRegex(p), sent, pos);
        if (r) { partial.push(r); pos = r.end; }
      }
      if (partial.length) return build(sent, partial);
    }
  }
  return { segs: [{ t: 'text', v: sent }], blanks: [], ok: false };
}

function build(sent, ranges, preParts) {
  ranges.sort((a, b) => a.start - b.start);
  const segs = [];
  const blanks = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start < pos) return;
    if (r.start > pos) segs.push({ t: 'text', v: sent.slice(pos, r.start) });
    const v = r.pre ? (preParts && preParts[i]) || '' : sent.slice(r.start, r.end);
    segs.push({ t: 'blank', v, i: blanks.length });
    blanks.push(v);
    pos = r.end;
  });
  if (pos < sent.length) segs.push({ t: 'text', v: sent.slice(pos) });
  return { segs, blanks, ok: blanks.length > 0 };
}

// ---------- 정답 비교 ----------
export function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/…+|\.{2,}|[~〜∼～]+|_+/g, ' ')
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTypedCorrect(input, word, blanks1, blanks2) {
  const got = normalizeAnswer(input);
  if (!got) return false;
  const candidates = [
    answerParts(word.blank).join(' '),
    (blanks1 || []).join(' '),
    (blanks2 || []).join(' '),
  ].map(normalizeAnswer).filter(Boolean);
  // 한 번만 쓰인 단어가 문장에 여러 번 가려진 경우(같은 단어 반복) 한 번만 입력해도 정답
  for (const b of [blanks1, blanks2]) {
    if (b && b.length > 1 && b.every(x => normalizeAnswer(x) === normalizeAnswer(b[0]))) candidates.push(normalizeAnswer(b[0]));
  }
  return candidates.includes(got);
}

export function displayAnswer(word) {
  const parts = answerParts(word.blank);
  return parts.length ? parts.join(' … ') : word.blank;
}

// ---------- 간격 반복 (단계 0~4) ----------
// 힌트 없이 맞히면 단계 +1 → 올라간 단계에 따라 1·3·7·14일 뒤 복습.
// 힌트 쓰고 맞히면 단계 그대로 내일, 틀리면 단계 0으로 내일. 날짜는 기기 현지 날짜 'YYYY-MM-DD'.
export const STAGE_DAYS = [1, 1, 3, 7, 14]; // 단계 st가 된 뒤 다음 복습까지 일수
export const MAX_STAGE = 4;

const pad2 = n => String(n).padStart(2, '0');
export function dateStr(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return dateStr(new Date(y, m - 1, d + n).getTime());
}
export function daysBetween(from, to) {
  const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(to) - u(from)) / 86400000);
}

// 예전 기록({b: 0~6단계, d: 복습 시각})을 새 형식({st, due})으로. 맞힌/틀린 횟수 등은 그대로
export function normalizeStat(s) {
  if (!s || s.st != null) return s;
  const { b = 0, d = 0, ...rest } = s;
  // f(처음 배운 날)가 없으면 마지막 학습일로: 오늘 복습해도 '오늘의 새 단어'로 세지 않게
  return { ...rest, st: Math.min(b, MAX_STAGE), due: d ? dateStr(d) : '', f: rest.f || dateStr(rest.s || 0) };
}

// 시험일이 있으면 다음 복습일이 시험 전날을 넘지 않게
function capDue(due, today, exam) {
  if (!exam) return due;
  const eve = addDays(exam, -1);
  return eve > today && due > eve ? eve : due;
}

/**
 * outcome: 'ok'(힌트 없이 맞힘) | 'hint'(힌트 쓰고 맞힘) | 'wrong'
 * scheduled: 오늘 복습할 단어(새 단어·복습일·시험 대비)인지. 아닌 단어를 연습으로 맞힌 건 일정에 반영하지 않음
 */
export function applyResult(stat, outcome, { today = dateStr(), exam = '', scheduled = true, now = Date.now() } = {}) {
  const s = { st: 0, due: '', c: 0, w: 0, ...(normalizeStat(stat) || {}) };
  s.s = now;
  if (!s.f) s.f = today; // 처음 배운 날 (하루 새 단어 수 계산용)
  if (outcome === 'wrong') {
    s.w++;
    s.st = 0;
    s.due = capDue(addDays(today, 1), today, exam);
    return s;
  }
  s.c++;
  if (outcome === 'hint') s.h = (s.h || 0) + 1;
  if (!scheduled) return s;
  if (outcome === 'ok') {
    s.st = Math.min(s.st + 1, MAX_STAGE);
    s.due = addDays(today, STAGE_DAYS[s.st]);
  } else s.due = addDays(today, 1);
  s.due = capDue(s.due, today, exam);
  return s;
}

export const isDue = (s, today) => !!(s && s.due && s.due <= today);

/**
 * 오늘의 학습: 복습일이 된 단어 → (시험 3일 전부터) 범위 단어 3등분 중 오늘 몫 → 새 단어(하루 개수만큼)
 * allWords: 전체 단어(복습은 범위와 상관없이), rangeWords: 학습 범위(새 단어·시험 범위)
 */
export function buildPlan(allWords, rangeWords, stats, { today = dateStr(), newPerDay = 20, exam = '' } = {}) {
  const st = id => normalizeStat(stats[id]);
  const review = allWords.filter(w => isDue(st(w.id), today))
    .sort((a, b) => st(a.id).due.localeCompare(st(b.id).due) || st(a.id).st - st(b.id).st);
  const taken = new Set(review.map(w => w.id));

  let final = [];
  let examInfo = null;
  if (exam) {
    const left = daysBetween(today, exam);
    examInfo = { left };
    if (left >= 1 && left <= 3) {
      // 시험 3일 전·2일 전·전날에 범위 단어를 3등분해서 한 번씩. 빠진 날 몫은 다음 날 같이
      const start = addDays(exam, -3);
      const k = 3 - left;
      const size = Math.ceil(rangeWords.length / 3);
      final = rangeWords.slice(0, size * (k + 1)).filter(w => {
        const s = st(w.id);
        return !taken.has(w.id) && !(s && s.s && dateStr(s.s) >= start);
      });
      final.forEach(w => taken.add(w.id));
      examInfo.finalDay = k + 1;
    }
  }

  const newToday = Object.values(stats).filter(s => s && s.f === today).length;
  const quota = Math.max(0, newPerDay - newToday);
  const fresh = rangeWords.filter(w => !stats[w.id] && !taken.has(w.id)).slice(0, quota);
  return { review, final, fresh, examInfo };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 오답 보기 고르기: 덩어리 수가 같고 길이가 비슷한 단어 우선
export function pickDistractors(target, all, n = 3, rand = Math.random) {
  const tKey = normalizeAnswer(answerParts(target.blank).join(' '));
  const tParts = answerParts(target.blank).length;
  const tLen = target.blank.length;
  const seen = new Set([tKey]);
  const cands = [];
  for (const w of all) {
    const key = normalizeAnswer(answerParts(w.blank).join(' '));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const p = answerParts(w.blank).length;
    const score = (p === tParts ? 0 : 50) + Math.abs(w.blank.length - tLen) * 2 + (w.day === target.day ? -8 : 0) + rand() * 30;
    cands.push({ w, score });
  }
  cands.sort((a, b) => a.score - b.score);
  return cands.slice(0, n).map(c => c.w);
}

// ---------- 해석에서 뜻 부분 강조 ----------
// 뜻 "A에게 B를 확신시키다" + 해석 "…결백을 확신시켰다." → "확신시켰다"를 표시
const KO_SKIP = new Set([
  '하', '되', '것', '수', '등', '및', '또는', '의', '을', '를', '이', '가', '은', '는', '에', '에게', '에서', '으로', '로',
  '와', '과', '도', '하게', '하는', '하다', '되다', '것을', '것이', '것에', '것으로', '한테', '께',
]);
const KO_WORD_END = /[\s.,!?;:"'“”‘’()\[\]…·~]/;

export function highlightMeaning(ko, meaning, mark) {
  const text = String(ko || '');
  // 직접 지정한 강조어(CSV '해석강조' 컬럼 또는 highlights.json)가 해석에 있으면 그걸 씀
  for (const m of String(mark || '').split('|').map(x => x.trim()).filter(Boolean)) {
    const i = text.indexOf(m);
    if (i >= 0) return [{ t: 'text', v: text.slice(0, i) }, { t: 'mark', v: m }, { t: 'text', v: text.slice(i + m.length) }].filter(x => x.v);
  }
  if (!text || !meaning) return [{ t: 'text', v: text }];
  const cleaned = String(meaning)
    .replace(/\([^)]*\)+/g, ' ') // ((주로 수동태로)), (농작물을) 같은 보충 설명은 제외
    .replace(/[A-Za-z0-9~〜…·.,;:/|+=_'"!?()\[\]-]/g, ' ');
  const tokens = [...new Set(cleaned.split(/\s+/).map(t => t.replace(/[^가-힣]/g, '')).filter(Boolean))];
  const ranges = [];
  const covered = i => ranges.some(r => i >= r.start && i < r.end);
  const wordStart = i => i === 0 || KO_WORD_END.test(text[i - 1]);
  for (const tok of tokens) {
    if (KO_SKIP.has(tok)) continue;
    const stem = tok.length > 1 && tok.endsWith('다') ? tok.slice(0, -1) : tok;
    if (KO_SKIP.has(stem)) continue;
    const minLen = stem.length >= 3 ? 2 : 1;
    let hit = null;
    for (let len = stem.length; len >= minLen && !hit; len--) {
      const pre = stem.slice(0, len);
      if (len === 1 && KO_SKIP.has(pre)) break;
      for (let i = text.indexOf(pre); i >= 0; i = text.indexOf(pre, i + 1)) {
        if (covered(i)) continue;
        if (len === 1 && !wordStart(i)) continue; // 한 글자는 어절 맨 앞에서만
        hit = i;
        break;
      }
    }
    if (hit == null) continue;
    let end = hit;
    while (end < text.length && !KO_WORD_END.test(text[end])) end++;
    ranges.push({ start: hit, end });
  }
  if (!ranges.length) return [{ t: 'text', v: text }];
  ranges.sort((a, b) => a.start - b.start);
  // 공백만 사이에 둔 강조는 하나로 합침 ("당연하게 여기지")
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && (r.start <= last.end || /^\s+$/.test(text.slice(last.end, r.start)))) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const segs = [];
  let pos = 0;
  for (const r of merged) {
    if (r.start > pos) segs.push({ t: 'text', v: text.slice(pos, r.start) });
    segs.push({ t: 'mark', v: text.slice(r.start, r.end) });
    pos = r.end;
  }
  if (pos < text.length) segs.push({ t: 'text', v: text.slice(pos) });
  return segs;
}

// ---------- 기기 간 진도 합치기 ----------
// 단어별로 마지막 학습 시각(s)이 더 최근인 기록을 남긴다. resetAt 이전 기록은 버린다(진도 초기화).
export function mergeProgress(a, b) {
  const resetAt = Math.max((a && a.resetAt) || 0, (b && b.resetAt) || 0);
  const out = {};
  for (const src of [(a && a.stats) || {}, (b && b.stats) || {}]) {
    for (const [id, s] of Object.entries(src)) {
      if (!s || (s.s || 0) < resetAt) continue;
      if (!out[id] || (s.s || 0) > (out[id].s || 0)) out[id] = normalizeStat(s);
    }
  }
  // 시험일·하루 새 단어 수 같은 설정도 더 최근에 바꾼 쪽으로
  const pa = (a && a.prefs) || null, pb = (b && b.prefs) || null;
  const prefs = !pa ? pb : !pb ? pa : (pa.at || 0) >= (pb.at || 0) ? pa : pb;
  return { v: 2, resetAt, stats: out, ...(prefs ? { prefs } : {}) };
}

export const samePrefs = (x, y) => JSON.stringify(x || null) === JSON.stringify(y || null);

export function sameStats(x, y) {
  const kx = Object.keys(x || {}), ky = Object.keys(y || {});
  if (kx.length !== ky.length) return false;
  return kx.every(k => {
    const a = x[k], b = y[k];
    return b && a.s === b.s && a.st === b.st && a.due === b.due && a.c === b.c && a.w === b.w && a.f === b.f && a.h === b.h;
  });
}

// ---------- 직접 입력 글자 힌트 ----------
// 입력이 정답 앞부분과 맞는 데까지는 살리고, 거기서부터 2글자(남은 게 2글자 이하면 1글자)를 더 채운다.
// 마지막 글자는 알려주지 않는다. 더 줄 힌트가 없으면 null.
export function typingHintTarget(word, blanks1, blanks2) {
  const pick = [blanks1, blanks2].find(b => b && b.length) || answerParts(word.blank);
  const uniq = pick.every(x => x.toLowerCase() === pick[0].toLowerCase()) ? [pick[0]] : pick;
  return uniq.join(' ').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

export function nextLetterHint(input, target) {
  const cur = String(input || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/^ /, '');
  let k = 0;
  while (k < cur.length && k < target.length && cur[k] === target[k]) k++;
  const restLetters = target.slice(k).replace(/ /g, '').length;
  const give = Math.min(2, restLetters - 1);
  if (give <= 0) return cur.length > k ? target.slice(0, k) : null; // 틀린 부분만 지워줌
  let i = k, got = 0;
  while (i < target.length && got < give) { if (target[i] !== ' ') got++; i++; }
  if (target[i] === ' ') i++; // 다음 단어로 넘어가는 띄어쓰기는 같이 채움
  return target.slice(0, i);
}
