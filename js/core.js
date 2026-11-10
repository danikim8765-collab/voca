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
const IRREGULAR_LIST = `
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
`;
// 형태별로 묶음을 합침 (lay는 lay:laid와 lie:lay:lain 둘 다에 속함)
const IRREGULAR = {};
for (const e of IRREGULAR_LIST.trim().split(/\s+/)) {
  const f = e.split(':');
  for (const x of f) IRREGULAR[x] = [...new Set([...(IRREGULAR[x] || []), ...f])];
}
// over·under·out 등이 붙은 불규칙 동사: overrun → overran, mislead → misled
const IRREG_PREFIX = ['over', 'under', 'out', 'with', 'fore', 'mis', 'up', 'be', 're'];
function irregularForms(lw) {
  if (IRREGULAR[lw]) return IRREGULAR[lw];
  for (const p of IRREG_PREFIX) {
    const rest = lw.slice(p.length);
    if (lw.startsWith(p) && rest.length >= 2 && IRREGULAR[rest]) return IRREGULAR[rest].map(f => p + f);
  }
  return null;
}

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
  const irr = irregularForms(lw);
  if (irr) for (const f of irr) if (f !== lw) alts.push(inflect(f));
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
const QUANT_BEFORE_OF = /\b(?:thousands|hundreds|millions|billions|dozens|lots|lot|plenty|number|couple|majority|most|some|many|all|each|both|none|any|few|several|much|part|kinds?|sorts?|types?|one|two|three)\s+$/i;
function findSequences(sent, parts) {
  const all = [];
  let pos = 0;
  for (;;) {
    const seq = [];
    let p = pos;
    for (const part of parts) {
      let r = execAt(partRegex(part), sent, p);
      if (!r) break;
      // deprive thousands of workers [of] …: 수량 표현의 of(thousands of, a lot of)는 숙어의 of가 아니므로 그 뒤의 of를 씀
      if (seq.length && /^of$/i.test(part) && QUANT_BEFORE_OF.test(sent.slice(0, r.start))) {
        const later = execAt(partRegex(part), sent, r.end);
        if (later) r = later;
      }
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
    if (r.pre) {
      const v = (preParts && preParts[i]) || '';
      segs.push({ t: 'blank', v, i: blanks.length });
      blanks.push(v);
    } else {
      // 숙어는 단어마다 칸 하나씩 (cutting off → [cutting] [off])
      for (const piece of sent.slice(r.start, r.end).split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) { segs.push({ t: 'text', v: piece }); continue; }
        segs.push({ t: 'blank', v: piece, i: blanks.length });
        blanks.push(piece);
      }
    }
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
  // 같은 말이 여러 번 가려진 경우(give up … give up) 한 번만 입력해도 정답
  const candidates = [
    word.word,
    answerParts(word.blank).join(' '),
    blankUnit(blanks1).join(' '),
    blankUnit(blanks2).join(' '),
  ].map(normalizeAnswer).filter(Boolean);
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
// 주기 복습(설정에서 켤 때)의 복습 간격 다섯 가지. 단계 k(1부터)가 되면 intervals[k-1]일 뒤 복습.
// 보통(m)은 기본 방식과 같은 1·3·7·14일. 마지막 단계에 닿으면 암기 완료, 그 뒤로는 마지막 간격으로 계속
export const PRESETS = {
  xs: [1, 1, 2, 3, 5, 8],
  s: [1, 2, 4, 7, 12],
  m: [1, 3, 7, 14],
  l: [2, 5, 12, 25],
  xl: [3, 8, 18, 40],
};

/**
 * intervals: 단계별 복습 간격(기본 1·3·7·14일). exam: 이 날짜의 전날을 넘지 않게 맞춤(시험일, 주기 복습에선 목표일 전까진 목표일)
 */
export function applyResult(stat, outcome, { today = dateStr(), exam = '', scheduled = true, now = Date.now(), intervals = PRESETS.m } = {}) {
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
    s.st = Math.min(s.st + 1, intervals.length);
    s.due = addDays(today, intervals[s.st - 1]);
  } else s.due = addDays(today, 1);
  s.due = capDue(s.due, today, exam);
  return s;
}

export const isDue = (s, today) => !!(s && s.due && s.due <= today);

/**
 * 오늘의 학습: (시험 3일 전부터) 범위 단어 3등분 중 오늘 몫 → 새 단어(하루 개수만큼)
 * review(복습일이 된 단어)는 개수 표시용으로만 같이 돌려줌. 복습은 pickReview로 따로 '오늘의 복습'에서
 * allWords: 전체 단어(복습은 범위와 상관없이), rangeWords: 학습 범위(새 단어·시험 범위)
 */
export function buildPlan(allWords, rangeWords, stats, { today = dateStr(), newPerDay = 20, exam = '', srs = null } = {}) {
  const st = id => normalizeStat(stats[id]);
  const review = allWords.filter(w => isDue(st(w.id), today))
    .sort((a, b) => st(a.id).due.localeCompare(st(b.id).due) || st(a.id).st - st(b.id).st);
  const taken = new Set();

  let final = [];
  let examInfo = null;
  // 주기 복습(srs = { goal, exam })이면 시험 3일 전 몫은 없고, 목표일부터 시험 전날까진 새 단어 없이 복습만
  if (srs) {
    const finalPhase = srs.goal && srs.exam && today >= srs.goal && today < srs.exam;
    const newToday = Object.values(stats).filter(s => s && s.f === today).length;
    const fresh = finalPhase ? [] : rangeWords.filter(w => !stats[w.id]).slice(0, Math.max(0, newPerDay - newToday));
    return { review, final: [], fresh, examInfo: null };
  }
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
        return !(s && s.s && dateStr(s.s) >= start);
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

export const REVIEW_SIZE = 20; // 오늘의 복습 단어 수

/**
 * 주기 복습의 오늘의 복습 (설정에서 켰을 때). goal: 목표일, exam: 시험일 (goal < exam)
 *  목표일 전: 복습일이 된 단어(오래 밀린 것부터). limit > 0이면 그 개수까지 (0 = 제한 없음)
 *  목표일 ~ 시험 전날: 학습 범위 전부를 남은 날에 나눠 하루 몫씩(빠진 날 몫은 다음 날 같이, 날이 남으면 두 바퀴째) + 복습일이 된 단어
 *  시험일부터: 복습일이 된 단어
 * 반환 { words, phase: 'before'|'final'|'after', days?, size? }
 */
export function pickSrsReview(allWords, rangeWords, stats, { today = dateStr(), goal, exam, limit = 0 } = {}) {
  const st = id => normalizeStat(stats[id]);
  const seenToday = s => s && s.s && dateStr(s.s) === today;
  const due = allWords.filter(w => { const s = st(w.id); return isDue(s, today) && s.f !== today && !seenToday(s); })
    .sort((a, b) => st(a.id).due.localeCompare(st(b.id).due) || st(a.id).st - st(b.id).st);
  if (!goal || !exam || today < goal || goal >= exam) {
    return { words: limit > 0 ? due.slice(0, limit) : due, phase: 'before' };
  }
  if (today >= exam) return { words: due, phase: 'after' };
  const days = daysBetween(goal, exam);              // 목표일부터 시험 전날까지 날 수
  const n = rangeWords.length;
  const size = Math.max(1, Math.ceil(n / days));     // 하루 몫
  const round = Math.max(1, Math.ceil(n / size));    // 한 바퀴에 걸리는 날
  const k = daysBetween(goal, today);
  const start = addDays(goal, Math.floor(k / round) * round); // 이번 바퀴 시작일
  const idx = k % round;
  const chunk = rangeWords.slice(0, size * (idx + 1)).filter(w => { const s = st(w.id); return !(s && s.s && dateStr(s.s) >= start); });
  const ids = new Set(chunk.map(w => w.id));
  return { words: [...chunk, ...due.filter(w => !ids.has(w.id))], phase: 'final', days, size };
}

// 기억 유지 그래프용: 간격대로 복습했을 때 / 안 했을 때의 기억률(0~1)을 day 0..span에서 step 간격으로
// 단순 모형: 기억률 = e^(-t/S), 처음 S=2일, 복습할 때마다 S가 3배
export function retentionCurve(intervals, span = 30, step = 0.25) {
  const reviews = [];
  let t = 0, i = 0;
  while (true) { t += intervals[Math.min(i, intervals.length - 1)]; if (t > span) break; reviews.push(t); i++; }
  const pts = [], none = [];
  for (let x = 0; x <= span + 1e-9; x += step) {
    const done = reviews.filter(r => r <= x + 1e-9);
    const last = done.length ? done[done.length - 1] : 0;
    const S = 2 * 3 ** done.length;
    pts.push([x, Math.exp(-(x - last) / S)]);
    none.push([x, Math.exp(-x / 2)]);
  }
  // 복습 직전(떨어진 값)도 찍어서 톱니 모양으로
  const before = reviews.map((r, j) => [r, Math.exp(-(r - (j ? reviews[j - 1] : 0)) / (2 * 3 ** j))]);
  return { pts, none, reviews, before };
}

/**
 * 복습할 단어 n개: 전에 배운 단어 중 오늘 배우거나 오늘 이미 본 단어는 빼고
 * 복습일이 된 단어(오래 밀린 것부터) → 나머지는 약한 단어부터(단계 낮은, 많이 틀린, 오래 안 본 순)
 */
export function pickReview(allWords, stats, { today = dateStr(), n = REVIEW_SIZE, again = false } = {}) {
  // again(추가 복습): 오늘 배우거나 이미 본 단어도 뒤에 붙여서 다시 (복습할 게 다 떨어져도 더 할 수 있게)
  const pool = [];
  for (const w of allWords) {
    const s = normalizeStat(stats[w.id]);
    if (!s) continue;
    const todays = s.f === today || !!(s.s && dateStr(s.s) === today);
    if (todays && !again) continue;
    pool.push({ w, s, todays, due: !todays && isDue(s, today) });
  }
  const miss = s => (s.w || 0) / Math.max(1, (s.c || 0) + (s.w || 0));
  pool.sort((a, b) => (a.todays - b.todays)
    || (b.due - a.due)
    || (a.due ? a.s.due.localeCompare(b.s.due) : 0)
    || a.s.st - b.s.st
    || miss(b.s) - miss(a.s)
    || (a.s.s || 0) - (b.s.s || 0));
  return pool.slice(0, Math.max(0, n)).map(p => p.w);
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
  const wordCount = k => k.split(' ').length;
  const tWords = wordCount(tKey);
  const seen = new Set([tKey]);
  const cands = [];
  for (const w of all) {
    const key = normalizeAnswer(answerParts(w.blank).join(' '));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const p = answerParts(w.blank).length;
    // 낱말 수가 다르면 빈칸 수만 세도 답이 보이므로(put up with ↔ fatal) 같은 낱말 수의 보기를 먼저
    const score = (p === tParts ? 0 : 50) + Math.abs(wordCount(key) - tWords) * 60
      + Math.abs(w.blank.length - tLen) * 2 + (w.day === target.day ? -8 : 0) + rand() * 30;
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
      // 지운 기록은 { del: 1, s: 지운 시각 }로 남겨서 다른 기기의 예전 기록이 되살아나지 않게
      if (!out[id] || (s.s || 0) > (out[id].s || 0)) out[id] = s.del ? { del: 1, s: s.s } : normalizeStat(s);
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
  return blankUnit(pick).join(' ').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

// 같은 말이 문장에 여러 번 가려졌으면(cues … cues, give up … give up) 한 번 분량만: 정답은 그 한 번
export function blankUnit(blanks) {
  const b = blanks || [];
  const low = b.map(x => String(x).toLowerCase());
  for (let p = 1; p < b.length; p++) {
    if (b.length % p === 0 && low.every((x, i) => x === low[i % p])) return b.slice(0, p);
  }
  return b;
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

// ---------- 단어 모드: 뜻 채점과 뜻 보기 고르기 ----------
// 한글 뜻 정리: 괄호·번호·문장부호·띄어쓰기를 빼고 흔한 어미(하다/되다/한/…)를 뗌
export function normKo(s) {
  let t = String(s).toLowerCase();
  for (let k = 0; k < 4; k++) t = t.replace(/\([^()]*\)/g, '').replace(/\[[^\[\]]*\]/g, '');
  t = t.replace(/[()\[\]{}]/g, '')
    .replace(/~\s*[을를이가에의로와과]?/g, '')
    .replace(/\d+\./g, '')
    .replace(/[\s·:;,.\-—_'"“”‘’!?]/g, '');
  const cut = t.replace(/(하다|되다|시키다|스럽다|롭다|하는|되는|한|함|된|임|이다|다)$/, '');
  return cut.length >= 2 ? cut : t;
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
// 오타 조금, 한쪽이 다른 쪽을 포함하면 같은 뜻으로 봄
function nearKo(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  if (b.includes(a) || a.includes(b)) return true;
  return lev(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.34));
}
// "1. 치명적인 2. 결정적인, 중대한 / 명사 뜻" → 뜻 갈래마다 [같은 뜻 표현들]
export function meaningSenses(ans) {
  const out = [];
  String(ans || '').split(/[\/;]/).forEach(block => {
    block.split(/\s*\d+\.\s*/).map(s => s.trim()).filter(Boolean).forEach(p => {
      const alts = p.split(/[,、]/).map(normKo).filter(Boolean);
      if (alts.length) out.push(alts);
    });
  });
  return out;
}
/**
 * 직접 쓴 뜻 채점. strict: 'easy'(하나만 맞아도) | 'mid'(갈래가 여럿인 품사/뜻이면 절반 이상) | 'hard'(전부)
 * 반환 { score: 2 맞음 | 1 부분 | 0 틀림, missing: 빠진 갈래 수 }
 */
export function gradeMeaning(user, answer, strict = 'mid') {
  const chunks = String(user || '').split(/[\s,;\/、]+/).map(normKo).filter(Boolean);
  const gs = meaningSenses(answer);
  if (!chunks.length || !gs.length) return { score: 0, missing: gs.length };
  const said = a => chunks.some(c => nearKo(c, a));
  const hit = gs.filter(alts => alts.some(said)).length;
  if (!hit) return { score: 0, missing: gs.length };
  // 느슨: 뜻 하나만 맞아도 · 보통: 뜻 갈래(1. 2. …)마다 하나씩 · 엄격: 나와 있는 뜻 낱말 전부
  if (strict === 'hard') {
    const all = gs.flat(), got = all.filter(said).length;
    return { score: got >= all.length ? 2 : 1, missing: all.length - got };
  }
  const need = strict === 'easy' ? 1 : gs.length;
  return { score: hit >= need ? 2 : 1, missing: gs.length - hit };
}
// 두 뜻이 겹치는지 (오답 보기로 비슷한 뜻을 내지 않게)
export function meaningsClash(a, b) {
  const A = meaningSenses(a), B = meaningSenses(b);
  return A.some(x => B.some(y => x.some(p => y.some(q => nearKo(p, q)))));
}
// 오답 뜻 보기 n개: 같은 범위에서, 정답·서로와 뜻이 겹치지 않게
export function pickMeaningDistractors(target, all, n = 3, rand = Math.random) {
  const cands = shuffle(all.filter(w => w.word !== target.word && w.meaning && w.meaning !== target.meaning), rand);
  const out = [];
  for (const w of cands) {
    if (out.length >= n) break;
    if (out.some(o => o.meaning === w.meaning || meaningsClash(o.meaning, w.meaning))) continue;
    if (meaningsClash(target.meaning, w.meaning)) continue;
    out.push(w);
  }
  for (const w of cands) { // 모자라면 서로 겹침만 허용
    if (out.length >= n) break;
    if (out.includes(w) || out.some(o => o.meaning === w.meaning) || meaningsClash(target.meaning, w.meaning)) continue;
    out.push(w);
  }
  return out;
}

// ---------- 모름 표시 (예문·단어 모드가 같이 씀) ----------
// marks: { id: { on: 1|0, t: 바꾼 시각 } } — 끈 것도 남겨서 기기끼리 합칠 때 더 최근에 바꾼 쪽으로
export function mergeMarks(a, b) {
  const out = { ...(a || {}) };
  for (const [id, m] of Object.entries(b || {})) {
    if (m && (!out[id] || (m.t || 0) > (out[id].t || 0))) out[id] = m;
  }
  return out;
}
export function sameMarks(x, y) {
  const kx = Object.keys(x || {}), ky = Object.keys(y || {});
  return kx.length === ky.length && kx.every(k => y[k] && !!x[k].on === !!y[k].on && x[k].t === y[k].t);
}

// 단어장 옆에 보여줄 유의어·반의어. 나머지 추가 컬럼은 rest로
export function synAnt(extras) {
  const pick = re => (extras || []).filter(([k]) => re.test(k)).map(([, v]) => v).join(', ');
  const SYN = /유의어|동의어|synonym/i, ANT = /반의어|반대말|antonym/i;
  return { syn: pick(SYN), ant: pick(ANT), rest: (extras || []).filter(([k]) => !SYN.test(k) && !ANT.test(k)) };
}

// ---------- 직접 입력 오답 풀이 (말풍선) ----------
// 틀린 답이 왜 틀렸는지 단어 데이터(뜻·유의어·반의어·파생어)만으로 짐작해서 알려줌. 서버 없이 동작
const POS_KO = { 명: '명사', 형: '형용사', 부: '부사', 동: '동사', 전: '전치사', 접: '접속사' };

// 단어(숙어)의 모든 변화형과 통째로 맞는지: outlaws ↔ outlaw, took ↔ take, convinced of ↔ convince A of B
function formRegex(text) {
  const parts = answerParts(text);
  if (!parts.length) return null;
  const body = parts.join(' ').split(/\s+/).filter(Boolean).map((w, i) => wordPattern(w, i === 0)).join('\\s+');
  return new RegExp(`^(?:${body})$`, 'i');
}
const isFormOf = (typed, text) => { const re = formRegex(text); return !!(re && re.test(typed)); };

// "1. obey, follow, comply with / 2. tolerate" → ['obey', 'follow', 'comply with', 'tolerate']
function listWords(s) {
  return String(s || '').split(/[,/;]/).map(x => x.replace(/^\s*\d+\.\s*/, '').replace(/\([^)]*\)/g, '').trim()).filter(x => /^[A-Za-z][A-Za-z' -]*$/.test(x));
}
// "fatality 명 1. 사망자(수) / fatally 부 치명적으로" → [{ word, pos, meaning }]
function derivatives(s) {
  return String(s || '').split(/\s\/\s/).map(x => x.trim().match(/^([A-Za-z][A-Za-z' -]*?)\s+(명|형|부|동|전|접)\s*(.*)$/))
    .filter(Boolean).map(m => ({ word: m[1], pos: POS_KO[m[2]], meaning: shortMeaning(m[3]) }));
}
// 뜻의 첫 번째 의미만 짧게: "((주로 수동태로)) 사로잡다, 집착하게 하다" → "사로잡다"
export function shortMeaning(m) {
  const first = String(m || '').replace(/\(\([^)]*\)\)/g, '').split(/\s*\d+\.\s*/).map(x => x.trim()).find(Boolean) || '';
  return first.split(/[,;]/)[0].replace(/\[[^\]]*\]/g, '').trim();
}

// 철자 차이: 맞는 글자 / 틀린 글자 / 빠진 글자(_) 조각과 다른 글자 수
export function spellDiff(typed, answer) {
  const a = typed, b = answer, n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  const segs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i && j && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { segs.push({ t: 'ok', v: a[--i] }); j--; }
    else if (i && j && d[i][j] === d[i - 1][j - 1] + 1) { segs.push({ t: 'bad', v: a[--i] }); j--; }
    else if (j && d[i][j] === d[i][j - 1] + 1) { segs.push({ t: 'miss', v: '_' }); j--; }
    else { segs.push({ t: 'bad', v: a[--i] }); }
  }
  return { segs: segs.reverse(), dist: d[n][m] };
}

/**
 * 오답 풀이: { kind: 'spell'|'near', text, diff? } — 해당이 없으면 null (말풍선 안 띄움)
 *  spell(노랑) 철자가 조금 다름 · 빈칸을 덜 채움 · 같은 단어의 다른 형태 · 같은 뿌리의 다른 품사
 *  near(초록)  유의어: 뜻은 통하지만 문장에 더 맞는 말이 있음(뉘앙스)
 *              뜻이 겹치는 단어장의 다른 단어: 그것도 좋은데 다른 단어는? + 첫 글자
 * 반대말·상관없는 말·모르는 말은 말풍선 없음
 * cands: 정답으로 인정하는 말(정규화된 것), find(text): 그 말이 단어장의 다른 단어면 그 단어
 */
export function coachFeedback(input, w, { cands = [], find = () => null } = {}) {
  const typed = normalizeAnswer(input);
  if (!typed || cands.includes(typed)) return null;
  const words = typed.split(' ');

  // 빈칸을 덜 채움: deprive → deprive of
  const short = cands.filter(c => { const cw = c.split(' '); return cw.length > words.length && cw.slice(0, words.length).join(' ') === typed; })
    .sort((a, b) => a.split(' ').length - b.split(' ').length)[0];
  if (short) {
    const n = short.split(' ').length;
    return { kind: 'spell', text: `빈칸이 ${n}곳이에요. 나머지 ${n - words.length}곳도 채워 주세요.` };
  }
  // 같은 단어의 다른 형태: outlaws
  if (isFormOf(typed, w.word) || isFormOf(typed, w.blank)) {
    return { kind: 'spell', text: `'${typed}'는 형태만 달라요. 원형이나 예문 속 형태로 써 보세요.` };
  }
  const { syn } = synAnt(w.extras);
  const der = derivatives((w.extras.find(([k]) => /파생어/.test(k)) || [])[1]);
  const d = der.find(x => isFormOf(typed, x.word));
  if (d) {
    return { kind: 'spell', text: `'${d.word}'는 같은 뿌리의 ${d.pos || '다른 품사'}예요. 예문 자리에 맞는 품사로 바꿔 보세요.` };
  }
  // 유의어: 뜻은 통하지만 이 문장에 더 맞는 말이 있음
  const sy = listWords(syn).find(x => isFormOf(typed, x));
  if (sy) {
    return { kind: 'near', text: `'${typed}'도 뜻은 통해요. 그런데 이 문장에 더 딱 맞는 단어가 있어요. 뉘앙스를 생각해 보세요.` };
  }
  // 뜻이 겹치는 단어장의 다른 단어: 그것도 좋은데 다른 단어는? (첫 글자)
  const other = find(typed);
  if (other && sameSense(other.meaning, w.meaning)) {
    const first = (answerParts(w.blank)[0] || w.word).trim()[0] || '';
    return { kind: 'near', text: `'${other.word}'도 좋아요. 그런데 다른 단어는 없을까요? 첫 글자는 '${first.toLowerCase()}'예요.` };
  }
  // 철자 비교는 정답 중 가장 가까운 것과
  let best = null;
  for (const c of cands) {
    const r = spellDiff(typed, c);
    if (!best || r.dist < best.dist) best = { ...r, c };
  }
  if (best && best.dist <= (best.c.length <= 4 ? 1 : best.c.length <= 8 ? 2 : 3)) {
    return { kind: 'spell', diff: best.segs, text: `정답과 ${best.dist === 1 ? '한' : best.dist === 2 ? '두' : '세'} 글자 달라요` };
  }
  return null;
}

// 두 단어가 같은 뜻 하나를 공유하는지 (방해하다 ↔ 방해하다, 결정적인 ↔ 결정적인). 오답 보기용 meaningsClash보다 엄격하게
export function sameSense(a, b) {
  const flat = m => new Set(meaningSenses(m).flat().filter(x => x.length >= 2));
  const A = flat(a), B = flat(b);
  return [...A].some(x => B.has(x));
}

// 단어장 전체에서 그 말(변화형 포함)인 단어 찾기
export function makeWordFinder(words) {
  const cache = new Map();
  return (typed, exceptId) => {
    for (const w of words) {
      if (w.id === exceptId) continue;
      let re = cache.get(w.id);
      if (re === undefined) { re = formRegex(w.word); cache.set(w.id, re); }
      if (re && re.test(typed)) return w;
    }
    return null;
  };
}

// 앱 키보드: 키 사이 틈이나 가장자리를 누르면 가장 가까운 키 (키 테두리까지 거리, maxDist px 안에서만)
// keys: [{ r: { left, top, right, bottom }, ... }]
export function nearestKey(keys, x, y, maxDist = 24) {
  let best = null, bestD = Infinity;
  for (const k of keys) {
    const { left, top, right, bottom } = k.r;
    const d = Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
    if (d < bestD) { bestD = d; best = k; }
  }
  return bestD <= maxDist ? best : null;
}

// ---------- 유반의어 테스트 (DAY 박스를 왼쪽으로 밀면) ----------
// 기록에는 영향 없음. 예문 모드: 예문 속 밑줄 친 단어와 뜻이 비슷한(반대인) 말 고르기 / 단어 모드: 유의어(반의어)를 보고 그 단어 고르기

// 뜻 묶음과 갈래: "1. 부패 2. 쇠퇴 / 1. 부패하다 2. 쇠퇴하다" → [['부패', '쇠퇴'], ['부패하다', '쇠퇴하다']]
// ('/'는 품사가 바뀌는 곳, 번호는 그 품사 안의 뜻 갈래. 번호가 없으면 통째로 갈래 하나)
const splitNumbered = t => (/(^|\s)1\.\s*/.test(t) ? t.split(/(?:^|\s)\d+\.\s*/) : [t]).map(x => x.trim()).filter(Boolean);
export function meaningBlocks(meaning) {
  return String(meaning || '').split(/\s+\/\s+/).map(b => splitNumbered(b.trim())).filter(b => b.length);
}
export const senseList = meaning => meaningBlocks(meaning).flat();

// 유의어·반의어 묶음: "1. rot / 2. decline / 1. decompose" → [{ 1: ['rot'], 2: ['decline'] }, { 1: ['decompose'] }]
// 번호가 다시 작아지거나 번호 없는 조각이 나오면 다음 품사 묶음. 번호 없는 말은 0번(그 묶음의 모든 뜻)
export function relBlocks(s) {
  const blocks = [];
  let cur = null, last = Infinity;
  for (const piece of String(s || '').split(/\s*\/\s*|\s*[,;]?\s*(?=(?:^|\s)\d+\.\s)/)) {
    const m = piece.match(/^\s*(\d+)\.\s*/);
    const items = listWords(m ? piece.slice(m[0].length) : piece);
    if (!items.length) continue;
    const n = m ? +m[1] : 0;
    if (!cur || !n || n <= last) { cur = {}; blocks.push(cur); }
    last = n || Infinity;
    const g = cur[n] || (cur[n] = []);
    for (const x of items) if (!g.some(y => y.toLowerCase() === x.toLowerCase())) g.push(x);
  }
  return blocks;
}
const relText = (w, re) => (w.extras || []).filter(([k]) => re.test(k)).map(([, v]) => v).join(' / ');
const SYN_COL = /유의어|동의어|synonym/i, ANT_COL = /반의어|반대말|antonym/i;
const relCache = new WeakMap(); // 단어마다 한 번만 풀어 둠 (보기 고를 때 단어장 전체를 여러 번 훑음)
function relLists(w) {
  let c = relCache.get(w);
  if (!c) {
    const flat = str => [...new Set(relBlocks(str).flatMap(b => Object.values(b).flat()).map(x => x.toLowerCase()))];
    const flatKo = new Set(meaningSenses(w.meaning).flat().filter(x => x.length >= 2));
    c = { syn: flat(relText(w, SYN_COL)), ant: flat(relText(w, ANT_COL)), ko: flatKo, pos: koPos(senseList(w.meaning)[0]) };
    relCache.set(w, c);
  }
  return c;
}
export const synList = w => relLists(w).syn;
export const antList = w => relLists(w).ant;

// 예문 해석에서 그 예문이 몇 번째 뜻(뜻 묶음 전체를 펼친 순서, 1부터)으로 쓰였는지 (뜻 강조가 가장 길게 잡히는 갈래). 모르면 0
export function senseOf(ko, meaning) {
  const senses = senseList(meaning);
  if (senses.length <= 1) return senses.length;
  let best = 0, bestLen = 0, tie = false;
  senses.forEach((s, i) => {
    const len = highlightMeaning(ko, s).filter(x => x.t === 'mark').reduce((a, x) => a + x.v.length, 0);
    if (len > bestLen) { best = i + 1; bestLen = len; tie = false; } else if (len && len === bestLen) tie = true;
  });
  return tie ? 0 : best;
}

// 한국어 뜻으로 품사 짐작 (보기를 같은 품사로 맞추려고. 틀려도 보기 고르는 순서만 바뀜)
export function koPos(sense) {
  const t = String(sense || '').replace(/\(\([^)]*\)\)|\([^)]*\)|\[[^\]]*\]/g, ' ').split(/[,;]/)[0].trim();
  if (!t) return '';
  if (/다$/.test(t)) return 'v';
  if (/(적으로|하게|히|게)$/.test(t)) return 'r';
  if (/(인|한|은|운|된|는|난|른|진|던|친|없는|있는|많은|적인)$/.test(t)) return 'a';
  return 'n';
}

/**
 * 뜻 갈래 sense(펼친 순서, 0 = 모름)에 맞는 유의어(반의어). 확실하지 않으면 [] (엉뚱한 뜻의 말을 정답으로 내지 않게)
 * - 뜻 묶음이 하나: 유의어를 한 묶음으로 보고 번호로 찾음. 번호 없는 말은 모든 뜻에 해당
 * - 뜻 묶음이 여럿(품사가 여럿): 유의어 묶음 수가 같을 때만 순서대로 맞춤
 */
export function relForSense(meaning, relStr, sense) {
  const mb = meaningBlocks(meaning);
  let rb = relBlocks(relStr);
  if (!rb.length || !mb.length) return [];
  if (mb.length === 1 && rb.length > 1) { // 한 묶음으로 합침
    const one = {};
    for (const b of rb) for (const [k, v] of Object.entries(b)) one[k] = [...new Set([...(one[k] || []), ...v])];
    rb = [one];
  }
  if (rb.length !== mb.length) return [];
  // 펼친 순서 → (묶음, 묶음 안 번호)
  let bi = -1, ni = 0;
  if (sense) {
    let k = sense;
    for (let i = 0; i < mb.length; i++) { if (k <= mb[i].length) { bi = i; ni = k; break; } k -= mb[i].length; }
  } else if (mb.length === 1) bi = 0;
  if (bi < 0) return [];
  const b = rb[bi], nums = Object.keys(b).filter(k => k !== '0');
  if (ni && b[ni]) return b[ni];
  if (b[0]) return b[0];
  if (mb[bi].length === 1 && nums.length === 1) return b[nums[0]]; // 뜻이 하나인데 번호가 붙은 경우("1. vice")
  return [];
}

const oneWord = s => !/\s/.test(String(s).trim());
const rnd = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const isTemplate = s => /[~…]|\b(A|B|sb|sth|one's)\b/.test(s);

/**
 * 유반의어 문제 하나. all = 보기를 뽑을 단어장 단어들(같은 DAY·같은 품사가 먼저)
 * byExample: 예문 모드(예문 속 밑줄 친 말과 뜻이 비슷한/반대인 말) / 아니면 단어 모드(유의어·반의어를 보고 그 단어 고르기)
 * 반환 { kind: 'syn'|'ant', sentence: { en, ko, n, b } | null, shown, answer, options: [{ text, ok, role: answer|trap|other, w }] } 또는 null
 */
export function makeSynQuestion(target, all, { byExample = true, rand = Math.random } = {}) {
  const synStr = relText(target, SYN_COL), antStr = relText(target, ANT_COL);
  const senses = senseList(target.meaning);
  const combos = [];
  if (byExample) {
    [[target.ex1, target.ex1ko], [target.ex2, target.ex2ko]].forEach(([en, ko], i) => {
      if (!en) return;
      const b = makeBlanks(en, target.blank, target.word);
      if (!b.ok) return;
      const sense = senseOf(ko, target.meaning);
      for (const [kind, str] of [['syn', synStr], ['ant', antStr]]) {
        const cands = relForSense(target.meaning, str, sense);
        if (cands.length) combos.push({ kind, cands, sense, s: { en, ko, n: i + 1, b } });
      }
    });
  }
  // 예문 모드인데 예문의 뜻을 확실히 못 정하면: 단어만 보여 주고 유의어(반의어) 고르기
  const head = byExample && !combos.length;
  if (!byExample || head) {
    for (const [kind, str] of [['syn', synStr], ['ant', antStr]]) {
      for (const blk of relBlocks(str)) for (const [k, v] of Object.entries(blk)) if (v.length) combos.push({ kind, cands: v, sense: 0, num: +k });
    }
  }
  if (!combos.length) return null;
  // 반의어가 있으면 반반 (유의어만 있으면 유의어)
  const kind = rnd([...new Set(combos.map(c => c.kind))], rand);
  const pick = rnd(combos.filter(c => c.kind === kind), rand);
  const senseText = (pick.sense && senses[pick.sense - 1]) || senses[0] || '';
  const pos = koPos(senseText);

  // 정답과 뜻이 비슷하거나 반대인 단어(유의어·반의어가 겹치거나 서로의 유의어·반의어)는 '그 밖의 보기'에서 뺌
  const tw = target.word.toLowerCase();
  const tSyn = new Set([...synList(target), tw]);
  const tAnt = new Set(antList(target));
  const related = w => {
    const k = w.word.toLowerCase();
    if (w === target || k === tw || tSyn.has(k) || tAnt.has(k)) return true;
    const ws = synList(w), wa = antList(w);
    if (ws.includes(tw) || wa.includes(tw) || ws.some(x => tSyn.has(x)) || ws.some(x => tAnt.has(x))) return true;
    const tk = relLists(target).ko;
    return [...relLists(w).ko].some(x => tk.has(x));
  };
  const ref = byExample ? null : target.word;
  const fill = (options, taken, answer, extraSkip = () => false) => {
    const cands = [];
    for (const w of all) {
      const k = w.word.toLowerCase();
      if (taken.has(k) || related(w) || isTemplate(w.word) || extraSkip(w)) continue;
      const score = (oneWord(w.word) === oneWord(answer) ? 0 : 40)
        + (pos && relLists(w).pos === pos ? 0 : 35)
        + (w.day === target.day ? 0 : 10) + Math.min(10, Math.abs(w.word.length - answer.length)) + rand() * 25;
      cands.push({ w, score });
    }
    cands.sort((a, b) => a.score - b.score);
    for (const { w } of cands) {
      if (options.length >= 4) break;
      const k = w.word.toLowerCase();
      if (taken.has(k)) continue;
      taken.add(k);
      options.push({ text: w.word, ok: false, role: 'other', w });
    }
    return options.length >= 4;
  };

  if (byExample) {
    // 정답 = 그 뜻의 유의어(반의어). 함정 = 반대 관계의 말(유의어 문제엔 반의어, 반의어 문제엔 유의어). 나머지 = 단어장의 다른 단어
    const singles = pick.cands.filter(oneWord);
    const answer = rnd(singles.length ? singles : pick.cands, rand);
    const taken = new Set([answer.toLowerCase(), tw]);
    const options = [{ text: answer, ok: true, role: 'answer' }];
    const trapPool = head ? (kind === 'syn' ? antList(target) : synList(target)) : relForSense(target.meaning, kind === 'syn' ? antStr : synStr, pick.sense);
    const trap = trapPool.find(x => !taken.has(x.toLowerCase()) && oneWord(x) === oneWord(answer)) || trapPool.find(x => !taken.has(x.toLowerCase()));
    if (trap) { options.push({ text: trap, ok: false, role: 'trap' }); taken.add(trap.toLowerCase()); }
    if (!fill(options, taken, answer)) return null;
    return { kind, sense: pick.sense, senseText, sentence: pick.s || null, shown: [], answer, options: shuffle(options, rand) };
  }

  // 단어 모드: 보여 준 말과 유의어(반의어)가 겹치는 단어도 정답처럼 보이니 뺌
  const shown = pick.cands.slice(0, 4);
  const shownSet = new Set(shown.map(x => x.toLowerCase()));
  const options = [{ text: target.word, ok: true, role: 'answer', w: target }];
  const skip = w => shownSet.has(w.word.toLowerCase()) || (kind === 'syn' ? synList(w) : antList(w)).some(x => shownSet.has(x));
  if (!fill(options, new Set([tw]), ref, skip)) return null;
  return { kind, sense: 0, senseText: '', sentence: null, shown, answer: target.word, options: shuffle(options, rand) };
}

// 유반의어 문제를 낼 수 있는 단어
export const hasSynAnt = w => !!(synList(w).length || antList(w).length);
