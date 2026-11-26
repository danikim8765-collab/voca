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
    blankUnit(blanks1, answerWordCount(word.blank)).join(' '),
    blankUnit(blanks2, answerWordCount(word.blank)).join(' '),
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
// 하루는 새벽 4시에 바뀜: 0시~3시 59분은 아직 전날이라 그 시간에 공부해도 전날 몫으로 침
export const STAGE_DAYS = [1, 1, 3, 7, 14]; // 단계 st가 된 뒤 다음 복습까지 일수
export const MAX_STAGE = 4;

export const DAY_START_HOUR = 4;
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export function dateStr(t = Date.now()) {
  const d = new Date(t);
  d.setHours(d.getHours() - DAY_START_HOUR); // 서머타임이 있어도 현지 시각 기준으로 4시간 당김
  return ymd(d);
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n, 12)); // 날짜 계산이라 4시 경계와 상관없게 한낮으로
}
export function daysBetween(from, to) {
  const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(to) - u(from)) / 86400000);
}
// 요일 (0 일요일 … 6 토요일)
export const weekdayOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
// 쉬는 요일 목록 정리: 0~6만, 겹치지 않게. 일주일 내내 쉬면 쉬는 날이 없는 걸로
export const cleanRest = rest => { const r = [...new Set((rest || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort(); return r.length >= 7 ? [] : r; };
export const isRestDay = (day, rest) => !!(rest && rest.length) && rest.includes(weekdayOf(day));
// from부터 to 전날까지 공부하는 날 수 (쉬는 요일 빼고)
export function studyDays(from, to, rest = []) {
  const n = daysBetween(from, to);
  if (!rest || !rest.length) return Math.max(0, n);
  let c = 0;
  for (let i = 0; i < n; i++) if (!isRestDay(addDays(from, i), rest)) c++;
  return c;
}
// from에서 공부하는 날을 k일 채우려면 달력으로 며칠 걸리는지
function calendarFor(from, k, rest) {
  let n = 0, c = 0;
  while (c < k && n < 3660) { if (!isRestDay(addDays(from, n), rest)) c++; n++; }
  return n;
}
// from부터 센 idx번째(0부터) 공부하는 날
function nthStudyDay(from, idx, rest) {
  let d = from, c = -1;
  for (let i = 0; i < 3660; i++) { if (!isRestDay(d, rest) && ++c === idx) return d; d = addDays(d, 1); }
  return d;
}

// 예전 기록({b: 0~6단계, d: 복습 시각})을 새 형식({st, due})으로. 맞힌/틀린 횟수 등은 그대로
export function normalizeStat(s) {
  if (!s || s.st != null) return s;
  const { b = 0, d = 0, ...rest } = s;
  // f(처음 배운 날)가 없으면 마지막 학습일로: 오늘 복습해도 '오늘의 새 단어'로 세지 않게
  return { ...rest, st: Math.min(b, MAX_STAGE), due: d ? dateStr(d) : '', f: rest.f || dateStr(rest.s || 0) };
}

/**
 * outcome: 'ok'(힌트 없이 맞힘) | 'hint'(힌트 쓰고 맞힘) | 'wrong'
 * scheduled: 오늘 복습할 단어(새 단어·복습일·시험 대비)인지. 아닌 단어를 연습으로 맞힌 건 일정에 반영하지 않음
 */
// 주기 복습(설정에서 켤 때)의 복습 간격 다섯 가지. 단계 k(1부터)가 되면 intervals[k-1]일 뒤 복습.
// 보통(m)은 기본 방식과 같은 1·3·7·14일. 마지막 단계에 닿으면 암기 완료, 그 뒤로는 맞힐 때마다 간격이 두 배씩(MAX_INTERVAL까지)
export const PRESETS = {
  xs: [1, 1, 2, 3, 5, 8],
  s: [1, 2, 4, 7, 12],
  m: [1, 3, 7, 14],
  l: [2, 5, 12, 25],
  xl: [3, 8, 18, 40],
};

// 틀리면 몇 단계를 잃는지. 0단계(다시 볼 단어)로 두되, 다시 맞히면 (틀리기 전 단계 - 이만큼)에서 이어 감
export const LAPSE_DROP = 2;
export const MASTER_GROW = 2;
export const MAX_INTERVAL = 120; // 일

/**
 * 다음 복습일 고르기: 간격 i일 뒤를 기준으로 앞뒤 15%쯤(4일 이상 간격만, 7일 → ±1, 14일 → ±2) 안에서
 * 쉬는 요일이 아니고 복습이 덜 잡힌 날로. 같으면 i일에 가까운 날, 그것도 같으면 앞날
 * load(날짜) = 그날 이미 잡힌 복습 수 (없으면 0으로 봄 → 언제나 i일 뒤)
 */
export function spreadDue(today, i, { load = null, rest = [] } = {}) {
  const f = i >= 4 ? Math.max(1, Math.round(i * 0.15)) : 0;
  let best = addDays(today, i), cost = Infinity;
  for (let k = 0; k <= 2 * f; k++) {
    const d = i + (k % 2 ? -(k + 1) / 2 : k / 2); // i, i-1, i+1, i-2, i+2 …
    const day = addDays(today, d);
    const c = (isRestDay(day, rest) ? 1e9 : 0) + ((load && load(day)) || 0);
    if (c < cost) { cost = c; best = day; }
  }
  return best;
}

/**
 * intervals: 단계별 복습 간격(기본 1·3·7·14일)
 *  - 틀리면 0단계로 내일 다시. 다시 맞히면 처음부터가 아니라 틀리기 전 단계보다 LAPSE_DROP 아래에서 이어 감(k에 적어 둠)
 *  - 복습일이 지나서(밀려서) 맞히면 그만큼 오래 기억한 것이라, 버틴 날 수보다 짧은 간격의 단계는 건너뜀
 *  - 시험일·목표일로 복습일을 당기지 않음: 간격 안에서는 기억이 남는다고 보므로 시험이 그 안에 있으면 시험 전에 또 볼 까닭이 없고,
 *    목표일부터는 범위 전체를 한 번씩 훑으니 그 앞날에 몰아 둘 까닭도 없음 (예전엔 목표일·시험 전날에 한꺼번에 몰렸음)
 * load, rest: 날짜 고르기(spreadDue)에 씀
 */
// 졸업: 암기 완료 뒤 간격이 이만큼(일) 이상인 복습을 힌트 없이 맞히면 더는 복습에 안 나옴 (g = 졸업한 날).
// 단어책은 학교 시험·시험 전 전체 훑기·방학마다 새로 시작하기로 또 보게 돼서 짧게, 내 단어(독해에서 막힌 단어)는 한 번 더
export const GRAD_BOOK = 28;
export const GRAD_MY = 56;
// 다음에 맞히면 졸업하는 복습인지 (그 문제는 4지선다 차례여도 직접 입력으로 냄. 찍어서 졸업하지 않게)
export function willGraduate(stat, { grad = 0, intervals = PRESETS.m, today = dateStr() } = {}) {
  const s = normalizeStat(stat);
  const n = intervals.length;
  if (!grad || !s || s.g || (s.st || 0) < n || !s.due || s.due > today) return false;
  const last = s.s ? dateStr(s.s) : '';
  const gap = last && last < today && s.due < today ? daysBetween(last, today) : 0;
  return Math.max(s.iv || intervals[n - 1], gap) >= grad;
}

/**
 * kind: 이번에 낸 문제 방식('type' 직접 입력 · 'choice' 4지선다), retry: 이번 학습에서 이미 틀렸거나 힌트를 쓰고 다시 나온 것
 *  → q(다음 복습에 4지선다로 내도 되는지): 직접 입력을 한 번에(힌트 없이, 처음 나왔을 때) 맞히면 1, 직접 입력에서 틀리거나 힌트를 쓰면 0,
 *    4지선다에서 틀리거나 힌트를 쓰면 0, 4지선다로 처음 배우면 0(첫 복습은 직접 입력). 다시 나온 문제는 바꾸지 않음
 * grad: 졸업 간격(일, 0 = 졸업 없음). 졸업한 단어(g)는 맞히면 그대로, 틀리거나 힌트를 쓰면 졸업이 풀림
 */
export function applyResult(stat, outcome, { today = dateStr(), exam = '', scheduled = true, now = Date.now(), intervals = PRESETS.m, load = null, rest = [], kind = '', retry = false, grad = 0 } = {}) {
  const prev = normalizeStat(stat) || {};
  const s = { st: 0, due: '', c: 0, w: 0, ...prev };
  const last = prev.s ? dateStr(prev.s) : ''; // 지난번에 본 날
  s.s = now;
  if (!s.f) s.f = today; // 처음 배운 날 (하루 새 단어 수 계산용)
  if (kind && !retry) {
    if (outcome !== 'ok') s.q = 0;
    else if (kind === 'type') s.q = 1;
    else if (s.q == null) s.q = 0;
  }
  if (outcome === 'wrong') {
    s.w++;
    const k = Math.max(0, (s.st || s.k || 0) - LAPSE_DROP); // 0단계에서 또 틀리면 더 내려감
    if (k) s.k = k; else delete s.k;
    s.st = 0;
    delete s.iv;
    delete s.g;
    s.due = addDays(today, 1);
    return s;
  }
  s.c++;
  if (outcome === 'hint') s.h = (s.h || 0) + 1;
  if (prev.g) {
    // 졸업한 단어를 (시험 전 훑기·연습에서) 다시 봄: 맞히면 그대로 졸업, 힌트를 썼으면 졸업을 풀고 내일 다시
    if (outcome === 'ok') return s;
    delete s.g;
    s.due = addDays(today, 1);
    return s;
  }
  if (!scheduled) return s;
  if (outcome === 'ok') {
    const n = intervals.length;
    let st = Math.min((s.st || s.k || 0) + 1, n);
    // 복습일이 지나서 맞혔을 때만: 지난번에 본 날부터 버틴 날 수만큼은 이미 기억이 감
    const gap = last && last < today && prev.due && prev.due < today ? daysBetween(last, today) : 0;
    if (grad && (prev.st || 0) === n && Math.max(prev.iv || intervals[n - 1], gap) >= grad) {
      s.st = n;
      s.g = today;
      s.due = '';
      delete s.iv; delete s.k;
      return s;
    }
    while (st < n && intervals[st - 1] <= gap) st++;
    // 암기 완료(마지막 단계)한 단어를 또 맞히면 간격을 MASTER_GROW배씩 늘림(14 → 28 → 56일 …, MAX_INTERVAL까지).
    // 마지막 간격으로 끝없이 돌면 배운 단어가 늘수록 복습이 계속 쌓여서
    let iv = intervals[st - 1];
    if (st === n && (s.st || 0) === n) iv = Math.min(MAX_INTERVAL, Math.max(iv, Math.round(Math.max(s.iv || iv, gap) * MASTER_GROW)));
    if (iv > intervals[n - 1]) s.iv = iv; else delete s.iv;
    s.st = st;
    delete s.k;
    s.due = examDue(today, iv, exam, { load, rest });
  } else s.due = addDays(today, 1);
  return s;
}

// 시험날 기억: 간격 i일은 기억이 '복습할 때'까지 떨어지는 날이라, 시험날엔 그보다 또렷해야 함.
// 다음 복습일이 시험 뒤인데 시험날까지 간격의 EXAM_FRAC보다 많이 남으면 시험 전에 한 번 더 — 시험까지 그만큼 남는 날로
// (그때 맞히면 다음 간격은 더 길어서 시험까지 또 잡히지 않음). 간격마다 날이 달라서 한날에 몰리지 않고, 약한 단어일수록 시험에 가깝게 봄
export const EXAM_FRAC = 0.5;
export function examDue(today, i, exam, opt = {}) {
  const due = spreadDue(today, i, opt);
  if (!exam || today >= exam || due < exam) return due;
  const left = daysBetween(today, exam);
  const keep = Math.floor(i * EXAM_FRAC); // 시험까지 남겨도 되는 날 수
  if (left <= keep) return due;
  const at = left - keep;                  // 오늘부터 며칠 뒤 (1 이상, 시험 전날까지)
  const f = Math.min(at - 1, Math.max(0, Math.round(keep * 0.3)));  // 앞으로만 조금 옮길 수 있음 (뒤로 가면 시험까지 덜 남음)
  let best = addDays(today, at), cost = Infinity;
  for (let d = at; d >= at - f; d--) {
    const day = addDays(today, d);
    const c = (isRestDay(day, opt.rest) ? 1e9 : 0) + ((opt.load && opt.load(day)) || 0);
    if (c < cost) { cost = c; best = day; }
  }
  return best;
}

export const isDue = (s, today) => !!(s && s.due && !s.g && s.due <= today);

// 문제 방식: kind = 설정의 4지선다('choice') · 직접 입력('type').
// mix = '복습은 외운 단어만 4지선다'를 켜고 복습 중일 때: 직접 입력을 한 번에 맞힌 단어(q = 1, applyResult)는 4지선다로 뜻만 떠올리고,
// 직접 입력에서 틀렸거나 힌트를 쓴 단어 · 4지선다에서 틀린 단어(q = 0)는 한 번에 맞힐 때까지 직접 입력.
// q가 없는 예전 기록은 예전 규칙대로(복습에서 두 번 넘게 맞힌 MIX_CHOICE_STAGE단계 이상이면 4지선다)
// again = 이번 학습에서 틀렸거나 힌트를 쓰고 다시 나온 단어, final = 맞히면 졸업하는 문제 → 직접 입력
export const MIX_CHOICE_STAGE = 3;
export function questionKind(kind, stat, { mix = false, again = false, final = false } = {}) {
  if (!mix) return kind === 'type' ? 'type' : 'choice';
  if (again || final) return 'type';
  const s = normalizeStat(stat);
  if (s && s.q != null) return s.q ? 'choice' : 'type';
  return s && (s.st || 0) >= MIX_CHOICE_STAGE ? 'choice' : 'type';
}
// 복습 묶음 안에서 4지선다를 먼저, 직접 입력을 나중에 (키보드가 한 번만 올라오게). 같은 방식끼리는 순서 그대로
export function choicesFirst(ids, kindOf) {
  const c = [], t = [];
  for (const id of ids) (kindOf(id) === 'choice' ? c : t).push(id);
  return [...c, ...t];
}

/**
 * 밀린 복습의 위험도: 지난번에 본 뒤 지난 날 ÷ 원래 잡혀 있던 간격. 클수록 까먹었을 가능성이 큼
 * (간격 1일짜리가 사흘 밀린 것(3) > 14일짜리가 사흘 밀린 것(17/14)). 밀린 게 많아 다 못 할 때 이 순서로 먼저
 */
export function dueRisk(s, today) {
  if (!s || !s.due) return 0;
  const last = s.s ? dateStr(s.s) : '';
  if (!last || last >= s.due) return daysBetween(s.due, today) + 1; // 지난번에 본 날을 모르면 밀린 날 수로
  return daysBetween(last, today) / Math.max(1, daysBetween(last, s.due));
}
// 복습일 된 단어 순서: 위험한 것부터, 같으면 오래 밀린 것·단계 낮은 것부터
export const byRisk = (today, st) => (a, b) => {
  const x = st(a.id), y = st(b.id);
  return dueRisk(y, today) - dueRisk(x, today) || x.due.localeCompare(y.due) || x.st - y.st;
};

// 새 단어 하나가 하루 복습 몇 개쯤으로 돌아오는지 (1·3·7·14일 + 틀린 것 다시 + 암기 완료 뒤 늘어나는 간격으로 모의 실험해 보면 4.8쯤)
export const REVIEW_PER_NEW = 5;

/**
 * 복습 페이스: 밀린 복습(backlog), 앞으로 7일 동안 하루 평균 돌아올 복습(inflow), 새 단어를 하루 newPerDay개씩 이어 가면 닿을 하루 복습(steady)
 * capacity(하루에 하는 복습 수, 모르면 0)를 주면 맞는 하루 새 단어 수(fitNew)와 밀린 것을 털기까지 걸리는 날(clearDays, 못 털면 Infinity)
 * heavy: 밀린 게 평소보다 많이 쌓였는지 (안내를 띄울지)
 */
export function reviewPace(words, stats, { today = dateStr(), newPerDay = 0, capacity = 0 } = {}) {
  const st = id => normalizeStat(stats[id]);
  let backlog = 0, ahead = 0;
  const end = addDays(today, 7);
  for (const w of words) {
    const s = st(w.id);
    if (!s || !s.due || s.f === today) continue;
    if (s.due <= today) backlog++;
    else if (s.due <= end) ahead++;
  }
  const inflow = Math.round(ahead / 7);
  const steady = Math.round(REVIEW_PER_NEW * newPerDay);
  const out = { backlog, inflow, steady, heavy: backlog >= 30 && backlog > 2 * Math.max(10, inflow) };
  if (capacity > 0) {
    out.fitNew = Math.max(0, Math.floor(capacity / REVIEW_PER_NEW));
    const spare = capacity - Math.max(inflow, steady);
    out.clearDays = !backlog ? 0 : spare > 0 ? Math.ceil(backlog / spare) : Infinity;
  }
  return out;
}

/**
 * 오늘의 학습: (시험 3일 전부터) 범위 단어 3등분 중 오늘 몫 → 새 단어(하루 개수만큼)
 * review(복습일이 된 단어)는 개수 표시용으로만 같이 돌려줌. 복습은 pickReview로 따로 '오늘의 복습'에서
 * allWords: 전체 단어(복습은 범위와 상관없이), rangeWords: 학습 범위(새 단어·시험 범위)
 */
// newToday: 오늘 이미 배운 새 단어 수(주지 않으면 stats에서 셈. 앱은 내 단어를 빼고 셈 — 내 단어는 단어책 하루 몫과 따로)
export function buildPlan(allWords, rangeWords, stats, { today = dateStr(), newPerDay = 20, exam = '', srs = null, newToday: given = null } = {}) {
  const st = id => normalizeStat(stats[id]);
  const review = allWords.filter(w => isDue(st(w.id), today)).sort(byRisk(today, st));
  const taken = new Set();

  let final = [];
  let examInfo = null;
  // 주기 복습(srs = { goal, exam })이면 시험 3일 전 몫은 없고, 목표일부터 시험 전날까진 새 단어 없이 복습만
  if (srs) {
    const finalPhase = srs.goal && srs.exam && today >= srs.goal && today < srs.exam;
    const newToday = given != null ? given : Object.values(stats).filter(s => s && s.f === today).length;
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

  const newToday = given != null ? given : Object.values(stats).filter(s => s && s.f === today).length;
  const quota = Math.max(0, newPerDay - newToday);
  const fresh = rangeWords.filter(w => !stats[w.id] && !taken.has(w.id)).slice(0, quota);
  return { review, final, fresh, examInfo };
}

/**
 * 단어 코치의 일정: 시험일까지 남은 날을 '새 단어를 배우는 날'과 '범위 전체를 다시 훑는 날'로 나눔.
 *  total: 학습 범위 단어 수, remaining: 아직 안 배운 단어 수 (오늘 배울 것 포함)
 *  - 배우는 날의 하루 부담(새 단어 + 그 단어들의 주기 복습)과 훑는 날의 하루 부담(전체 ÷ 남은 날)이 비슷해지게 나눔:
 *    새 단어 하나는 문제 네 번쯤의 품(NEW_COST), 총정리는 단어마다 두 모드 문제 두 개(SWEEP_COST)라
 *    훑는 날 : 배우는 날 = 2 × total : 4 × remaining
 *    (처음부터면 남은 날의 1/3쯤이 훑는 날 — 2주 남았으면 9일 배우고 5일 총정리. 많이 배워 뒀으면 훑는 날이 늘어남)
 *  - 훑는 날은 적어도 하루(엿새 넘게 남았으면 이틀)는 남김. 그래서 목표일이 시험 바로 전날이 되지 않음
 *  - 하루 새 단어가 10개도 안 되게 늘어지면 하루 10개로 당겨 끝내고 남는 날은 훑는 데 씀
 *  review: 사람이 코치와 정한 훑는 날 수(0 = 코치가 정함). 정했으면 그대로 따름(배우는 날은 적어도 하루 남김, 10개 당기기 없음)
 *  rest: 쉬는 요일(0 일 … 6 토). 날 나누기는 달력으로 하고, 하루 개수는 쉬는 날을 빼고 공부하는 날로 나눔
 *  fix: 하루 새 단어 수를 이 개수로 고정(0 = 고정 안 함). 고정하면 review는 안 보고, 배우는 날 수가 개수에서 정해지고 남는 날이 훑는 날
 *    딱 나눠떨어지지 않아 남는 단어는 tail로: 'last' = 마지막 날에 붙임(날 수 그대로), 그 밖 = 하루를 더 씀(마지막 날은 남는 단어만)
 *    그 개수로는 시험 전날까지 다 못 보면 fits: false, 그때의 일정은 시험 전날까지 고르게 나눈 것(minPerDay개씩)
 * 반환 { goal: 새 단어를 끝낼 날(이날부터 훑기), perDay, learnDays, reviewDays, days, finalPerDay, load: 'ok'|'busy'|'heavy', auto: 코치가 정했을 훑는 날 수 }
 *  고정이면 더해서 { fix, fits, over: 남는 단어 수, tail, studyN: 배우는 공부일 수, lastDay: 마지막 날 개수, todayNew: 오늘 개수(쉬는 날은 따로 봄), minPerDay }
 * 시험일이 없거나 오늘·지난 날이면 null
 */
export const NEW_COST = 4;   // 새 단어 하나를 배우는 품 (문제 몇 개쯤)
export const SWEEP_COST = 2; // 총정리에서 단어 하나를 훑는 품 (단어 문제 + 예문 문제)
export function coachPlan({ today = dateStr(), exam, total = 0, remaining = 0, review = 0, rest = [], fix = 0, tail = '' } = {}) {
  if (!exam || exam <= today) return null;
  rest = cleanRest(rest);
  const days = daysBetween(today, exam); // 오늘부터 시험 전날까지
  const study = (a, b) => studyDays(a, b, rest);
  const left = Math.max(0, Math.min(total, remaining));
  if (!left) return { goal: today, perDay: 0, learnDays: 0, reviewDays: days, days, finalPerDay: Math.ceil(total / Math.max(1, study(today, exam))), load: 'ok', auto: days };
  const minReview = days >= 6 ? 2 : days >= 2 ? 1 : 0;
  let reviewDays = Math.min(days - 1, Math.max(minReview, Math.round(days * SWEEP_COST * total / (SWEEP_COST * total + NEW_COST * left))));
  let learnDays = days - reviewDays;
  let perDay = Math.ceil(left / Math.max(1, study(today, addDays(today, learnDays))));
  if (perDay < 10) {
    perDay = Math.min(10, left);
    learnDays = Math.min(days, calendarFor(today, Math.ceil(left / perDay), rest));
    reviewDays = days - learnDays;
  }
  const auto = reviewDays;
  const loadOf = n => (n <= 40 ? 'ok' : n <= 80 ? 'busy' : 'heavy');
  fix = Math.round(Number(fix)) || 0;
  if (fix > 0) {
    const all = study(today, exam);                   // 시험 전날까지 공부하는 날
    const full = Math.floor(left / fix);
    const over = full ? left % fix : 0;               // 하루 몫을 다 채우고 남는 단어 (하루치도 안 되면 그날 다 봄)
    const last = over > 0 && tail === 'last';
    const studyN = !full ? 1 : over && !last ? full + 1 : full;
    const minPerDay = Math.ceil(left / Math.max(1, all));
    const extra = { fix, over, tail: over ? (last ? 'last' : 'extra') : '', studyN, minPerDay };
    if (studyN > all) { // 그 개수로는 모자람: 시험 전날까지 고르게
      return { goal: exam, perDay: minPerDay, learnDays: days, reviewDays: 0, days, finalPerDay: 0, load: loadOf(minPerDay), auto, ...extra, fits: false, lastDay: minPerDay, todayNew: minPerDay };
    }
    learnDays = calendarFor(today, studyN, rest);
    reviewDays = days - learnDays;
    const goal = addDays(today, learnDays);
    const lastDay = studyN === 1 ? left : last ? fix + over : over || fix;
    return {
      goal, perDay: fix, learnDays, reviewDays, days,
      finalPerDay: reviewDays ? Math.ceil(total / Math.max(1, study(goal, exam))) : 0,
      load: loadOf(Math.max(fix, last ? lastDay : 0)), auto, ...extra, fits: true, lastDay, todayNew: studyN === 1 ? left : fix,
    };
  }
  if (review > 0) {
    reviewDays = Math.min(days - 1, Math.round(review));
    learnDays = days - reviewDays;
  }
  // 배우는 기간에 공부하는 날이 하루도 없으면(쉬는 날만 남음) 공부하는 날이 생길 때까지 늘림
  while (learnDays < days && !study(today, addDays(today, learnDays))) { learnDays++; reviewDays--; }
  const goal = addDays(today, learnDays);
  perDay = Math.ceil(left / Math.max(1, study(today, goal)));
  return {
    goal, perDay, learnDays, reviewDays, days,
    finalPerDay: reviewDays ? Math.ceil(total / Math.max(1, study(goal, exam))) : 0,
    load: loadOf(perDay), auto,
  };
}

export const REVIEW_SIZE = 20; // 오늘의 복습 단어 수

/**
 * 주기 복습의 오늘의 복습 (설정에서 켰을 때). goal: 목표일, exam: 시험일 (goal < exam)
 *  목표일 전: 복습일이 된 단어(까먹었을 가능성이 큰 것부터, dueRisk). limit > 0이면 그 개수까지 (0 = 제한 없음)
 *  목표일 ~ 시험 전날: 학습 범위 전부를 남은 날에 나눠 하루 몫씩(빠진 날 몫은 다음 날 같이, 날이 남으면 두 바퀴째) + 복습일이 된 단어
 *  시험일부터: 복습일이 된 단어
 * 반환 { words, phase: 'before'|'final'|'after', days?, size? }
 */
export function pickSrsReview(allWords, rangeWords, stats, { today = dateStr(), goal, exam, limit = 0, rest = [] } = {}) {
  rest = cleanRest(rest);
  const st = id => normalizeStat(stats[id]);
  const seenToday = s => s && s.s && dateStr(s.s) === today;
  const due = allWords.filter(w => { const s = st(w.id); return isDue(s, today) && s.f !== today && !seenToday(s); })
    .sort(byRisk(today, st)); // 다 못 할 만큼 밀렸으면 까먹었을 가능성이 큰 것부터
  if (!goal || !exam || today < goal || goal >= exam) {
    return { words: limit > 0 ? due.slice(0, limit) : due, phase: 'before' };
  }
  if (today >= exam) return { words: due, phase: 'after' };
  const days = Math.max(1, studyDays(goal, exam, rest)); // 목표일부터 시험 전날까지 공부하는 날 수 (쉬는 요일 빼고)
  const n = rangeWords.length;
  const size = Math.max(1, Math.ceil(n / days));     // 하루 몫
  if (isRestDay(today, rest)) return { words: due, phase: 'final', days, size, rest: true }; // 쉬는 날은 몫 없이 복습일 된 단어만
  const round = Math.max(1, Math.ceil(n / size));    // 한 바퀴에 걸리는 날
  const k = studyDays(goal, today, rest);            // 오늘 전까지 공부한 날 수
  const start = nthStudyDay(goal, Math.floor(k / round) * round, rest); // 이번 바퀴 시작일
  const idx = k % round;
  // 이번 바퀴에서 아직 안 본 단어를, 잘 아는 것부터(단계 높은, 덜 틀린 순 · 안 배운 단어는 맨 뒤) 오늘 몫만큼.
  // 약한 단어일수록 시험에 가까운 날 보게 되고, 복습일이 돼서 이미 본 단어도 이번 바퀴 몫으로 셈
  const seen = s => !!(s && s.s && dateStr(s.s) >= start && dateStr(s.s) < today);
  const left = [], miss = s => (s.w || 0) / Math.max(1, (s.c || 0) + (s.w || 0));
  rangeWords.forEach((w, i) => { const s = st(w.id); if (!seen(s)) left.push({ w, s, i }); });
  const rank = x => (x.s ? x.s.st || 0 : -1);
  left.sort((a, b) => rank(b) - rank(a) || (a.s && b.s ? miss(a.s) - miss(b.s) : 0) || a.i - b.i);
  const quota = Math.max(0, Math.min(n, size * (idx + 1)) - (n - left.length));
  const chunk = left.slice(0, quota).map(x => x.w);
  const ids = new Set(chunk.map(w => w.id));
  return { words: [...chunk, ...due.filter(w => !ids.has(w.id))], phase: 'final', days, size };
}

/**
 * 총정리(목표일 ~ 시험 전날): 예문·단어 두 모드를 한 학습에서 같이 봄.
 * 학습 범위 전부를 남은 공부하는 날에 나눠 하루 몫씩(pickSrsReview와 같은 셈) — 몫의 단어는 두 모드 문제를 다(이번 바퀴에서 그 모드로 이미 본 건 빼고),
 * 그리고 두 모드 각각 복습일이 된 단어는 그 모드 문제로.
 *  stats: { e: 예문 모드 기록, w: 단어 모드 기록 }
 *  - 이번 바퀴에서 두 모드 다 본 단어는 몫에서 빠짐(이미 한 셈). 한쪽만 봤으면 남은 쪽만 나옴
 *  - 훑는 순서: 두 모드 중 약한 쪽 단계가 높은(둘 다 잘 아는) 단어부터, 두 모드 합쳐 덜 틀린 순, 어느 모드든 안 배운 단어는 뒤
 *  - 오늘 이미 그 모드로 본 문제는 뺌(목록을 고정해 둔 쪽에서 셈하도록 앱이 따로 거르지만, 미리 보기에서도 맞게)
 * 반환 { items: [{ id, m: 'w'|'e' }], words: [단어(몫 → 복습일 된 것)], phase: 'final', days, size, round, idx, start: 이번 바퀴 시작일, left: 이번 바퀴에 남은 단어 수, n, rest? }
 * 쉬는 날은 몫 없이 복습일 된 문제만. goal·exam이 맞지 않으면 null
 */
export const SWEEP_MODES = ['w', 'e']; // 몫 안에서 단어마다 두 문제 (푸는 순서는 sweepOrder의 first)
export function pickBothSweep(allWords, rangeWords, stats, { today = dateStr(), goal, exam, rest = [] } = {}) {
  if (!goal || !exam || today < goal || goal >= exam || today >= exam) return null;
  rest = cleanRest(rest);
  const st = (m, id) => normalizeStat((stats[m] || {})[id]);
  const day = s => (s && s.s ? dateStr(s.s) : '');
  const days = Math.max(1, studyDays(goal, exam, rest));
  const n = rangeWords.length;
  const size = Math.max(1, Math.ceil(n / days));
  const round = Math.max(1, Math.ceil(n / size));
  const k = studyDays(goal, today, rest);
  const start = nthStudyDay(goal, Math.floor(k / round) * round, rest);
  const idx = k % round;
  const seenRound = s => { const d = day(s); return !!d && d >= start && d < today; };
  // 복습일이 된 문제 (두 모드 각각, 까먹었을 가능성이 큰 것부터)
  const dueOf = m => allWords.filter(w => { const s = st(m, w.id); return isDue(s, today) && s.f !== today && day(s) !== today; })
    .sort(byRisk(today, id => st(m, id)));
  const due = { w: dueOf('w'), e: dueOf('e') };
  const base = { phase: 'final', days, size, round, idx, n, start };
  const out = (chunk, left) => {
    const items = [], seen = new Set(), list = [], inList = new Set();
    const add = (w, m) => {
      const key = m + w.id;
      if (seen.has(key) || day(st(m, w.id)) === today) return;
      seen.add(key);
      items.push({ id: w.id, m });
      if (!inList.has(w.id)) { inList.add(w.id); list.push(w); }
    };
    for (const { w, need } of chunk) for (const m of need) add(w, m);
    for (const m of SWEEP_MODES) for (const w of due[m]) add(w, m);
    return { ...base, items, words: list, left };
  };
  if (isRestDay(today, rest)) return { ...out([], 0), rest: true };
  const left = [], miss = (a, b) => ((a ? a.w || 0 : 0) + (b ? b.w || 0 : 0)) / Math.max(1, (a ? (a.c || 0) + (a.w || 0) : 0) + (b ? (b.c || 0) + (b.w || 0) : 0));
  rangeWords.forEach((w, i) => {
    const sw = st('w', w.id), se = st('e', w.id);
    const need = SWEEP_MODES.filter(m => !seenRound(m === 'w' ? sw : se));
    if (need.length) left.push({ w, need, rank: Math.min(sw ? sw.st || 0 : -1, se ? se.st || 0 : -1), miss: miss(sw, se), i });
  });
  left.sort((a, b) => b.rank - a.rank || a.miss - b.miss || a.i - b.i);
  const quota = Math.max(0, Math.min(n, size * (idx + 1)) - (n - left.length));
  return out(left.slice(0, quota), left.length);
}

// 총정리 문제 순서: 단어 20개씩 묶어서 먼저 풀 모드(first, 처음 값은 예문)의 묶음을 먼저, 그 묶음의 다른 모드 문제는 다음 묶음 뒤에
// (예문 먼저면 E1 E2 W1 E3 W2 … Wn). 같은 단어의 두 문제가 붙어 나오지 않고(앞 문제가 뒤 문제의 답을 보여 줘서),
// 중간에 그만둬도 두 모드를 고르게 한 셈. 묶음 안에서는 섞음. items의 단어 순서(급한 것부터)대로 묶음
export function sweepOrder(items, { size = 20, rand = Math.random, first = 'e' } = {}) {
  const ids = [], by = new Map();
  for (const it of items) { if (!by.has(it.id)) { by.set(it.id, []); ids.push(it.id); } by.get(it.id).push(it); }
  const blocks = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size).flatMap(id => by.get(id));
    const isFirst = x => (first === 'w' ? x.m === 'w' : x.m !== 'w');
    blocks.push({ a: shuffle(part.filter(isFirst), rand), b: shuffle(part.filter(x => !isFirst(x)), rand) });
  }
  const outList = [];
  blocks.forEach((b, i) => { outList.push(...b.a); if (i) outList.push(...blocks[i - 1].b); });
  if (blocks.length) outList.push(...blocks[blocks.length - 1].b);
  return outList;
}

// 총정리 학습의 문제 하나: 'w:<id>' 단어 문제 · 'e:<id>' 예문 문제 (단어 id는 숫자나 'my|'로 시작해서 겹치지 않음)
export const sweepKey = (m, id) => `${m === 'w' ? 'w' : 'e'}:${id}`;
export function parseSweepKey(key) {
  const k = String(key);
  return /^[we]:/.test(k) ? { m: k[0], id: k.slice(2) } : { m: '', id: k };
}

// 기억 유지 그래프용: 간격대로 복습했을 때 / 안 했을 때의 기억률(0~1)을 day 0..span에서 step 간격으로
// 단순 모형: 기억률 = e^(-t/S), 처음 S=2일, 복습할 때마다 S가 3배
export function retentionCurve(intervals, span = 30, step = 0.25) {
  const reviews = [];
  let t = 0, i = 0;
  const n = intervals.length;
  // 암기 완료 뒤엔 applyResult처럼 간격이 두 배씩 (MAX_INTERVAL까지)
  while (true) { t += i < n ? intervals[i] : Math.min(MAX_INTERVAL, intervals[n - 1] * MASTER_GROW ** (i - n + 1)); if (t > span) break; reviews.push(t); i++; }
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
 * 복습일이 된 단어(까먹었을 가능성이 큰 것부터) → 나머지는 약한 단어부터(단계 낮은, 많이 틀린, 오래 안 본 순)
 */
export function pickReview(allWords, stats, { today = dateStr(), n = REVIEW_SIZE, again = false } = {}) {
  // again(추가 복습): 오늘 배우거나 이미 본 단어도 뒤에 붙여서 다시 (복습할 게 다 떨어져도 더 할 수 있게)
  const pool = [];
  for (const w of allWords) {
    const s = normalizeStat(stats[w.id]);
    if (!s || s.g) continue; // 졸업한 단어는 복습에 안 나옴
    const todays = s.f === today || !!(s.s && dateStr(s.s) === today);
    if (todays && !again) continue;
    pool.push({ w, s, todays, due: !todays && isDue(s, today) });
  }
  const miss = s => (s.w || 0) / Math.max(1, (s.c || 0) + (s.w || 0));
  pool.sort((a, b) => (a.todays - b.todays)
    || (b.due - a.due)
    || (a.due ? dueRisk(b.s, today) - dueRisk(a.s, today) || a.s.due.localeCompare(b.s.due) : 0)
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

// 단어의 품사 묶음 (보기를 정답과 같은 품사로 맞추려고). CSV에 품사가 있으면 그걸, 없으면 한국어 뜻으로 짐작
const POS_KEY = { 동: 'v', 명: 'n', 형: 'a', 부: 'r', v: 'v', n: 'n', a: 'a', r: 'r' };
const posCache = new WeakMap();
function posSet(w) {
  if (!w || typeof w !== 'object') return new Set();
  let set = posCache.get(w);
  if (set) return set;
  set = new Set();
  for (const m of String(w.pos || '').toLowerCase().matchAll(/동사|명사|형용사|부사|verb|noun|adj|adv|[동명형부]|\b[vnar]\b/g)) {
    const k = m[0].startsWith('adj') ? 'a' : m[0].startsWith('adv') ? 'r' : POS_KEY[m[0][0]];
    if (k) set.add(k);
  }
  if (!set.size) for (const sense of senseList(w.meaning)) { const k = koPos(sense); if (k) set.add(k); }
  posCache.set(w, set);
  return set;
}
// 예문에서 쓰인 뜻의 품사 (해석으로 몇 번째 뜻인지 찾음). 모르면 그 단어의 품사 전부
function targetPos(w) {
  if (!w.pos && w.meaning && w.ex1ko) {
    const i = senseOf(w.ex1ko, w.meaning, w.koMark);
    const k = i ? koPos(senseList(w.meaning)[i - 1]) : '';
    if (k) return new Set([k]);
  }
  return posSet(w);
}

// 오답 보기 고르기: 덩어리 수가 같고, 품사가 같고, 길이가 비슷한 단어 우선
export function pickDistractors(target, all, n = 3, rand = Math.random) {
  const tKey = normalizeAnswer(answerParts(target.blank).join(' '));
  const tParts = answerParts(target.blank).length;
  const tLen = target.blank.length;
  const wordCount = k => k.split(' ').length;
  const tWords = wordCount(tKey);
  const tPos = targetPos(target);
  // 정답의 유의어(서로 유의어로 적힌 단어, 같은 뜻을 가진 단어)는 빈칸에 들어가도 말이 되니 보기로 내지 않음 (fierce ↔ intense)
  const tw = String(target.word || '').toLowerCase();
  const tSyn = new Set(synList(target)), tKo = relLists(target).ko; // relLists는 단어마다 한 번만 풀어 둠 (단어장 전체를 훑어서)
  const fitsToo = w => {
    const k = String(w.word || '').toLowerCase();
    if (tSyn.has(k) || synList(w).includes(tw)) return true;
    for (const x of relLists(w).ko) if (tKo.has(x)) return true; // 같은 뜻을 가진 단어 (sameSense와 같은 기준)
    return false;
  };
  const seen = new Set([tKey]);
  const cands = [], spare = [];
  for (const w of all) {
    const key = normalizeAnswer(answerParts(w.blank).join(' '));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (fitsToo(w)) { spare.push(w); continue; }
    const p = answerParts(w.blank).length;
    // 품사가 다르면 문장 구조만 봐도 답이 보이므로(the ___ accident ↔ 동사 보기) 같은 품사의 보기를 먼저. 품사를 모르면 따지지 않음
    const wPos = posSet(w);
    const posOff = tPos.size && wPos.size && ![...tPos].some(k => wPos.has(k));
    // 낱말 수가 다르면 빈칸 수만 세도 답이 보이므로(put up with ↔ fatal) 같은 낱말 수의 보기를 먼저
    const score = (p === tParts ? 0 : 50) + Math.abs(wordCount(key) - tWords) * 60 + (posOff ? 40 : 0)
      + Math.abs(w.blank.length - tLen) * 2 + (w.day === target.day ? -8 : 0) + rand() * 30;
    cands.push({ w, score });
  }
  cands.sort((a, b) => a.score - b.score);
  return [...cands.map(c => c.w), ...spare].slice(0, n); // 보기가 모자랄 때만 유의어도
}

// ---------- 해석에서 뜻 부분 강조 ----------
// 뜻 "A에게 B를 확신시키다" + 해석 "…결백을 확신시켰다." → "확신시켰다"를 표시
const KO_SKIP = new Set([
  '하', '되', '것', '수', '등', '및', '또는', '의', '을', '를', '이', '가', '은', '는', '에', '에게', '에서', '으로', '로',
  '와', '과', '도', '하게', '하는', '하다', '되다', '것을', '것이', '것에', '것으로', '한테', '께',
]);
const KO_WORD_END = /[\s.,!?;:"'“”‘’()\[\]…·~]/;
// 뜻 낱말에서 떼면 어근이 남는 꼬리 (질식시키다 → 질식, 윤리적인 → 윤리, 전염성의 → 전염, 어수선함 → 어수선)
// 한 글자 명사 뒤에 붙는 조사만 (그 뒤는 어절 끝)
const KO_PARTICLE = /^(이|가|을|를|은|는|의|에|에서|로|으로|과|와|도|만|이다|이며|이고|들|들이|들을|들과)(?=[\s.,!?;:"'“”‘’()\[\]…·~]|$)/;
const KO_ROOT_TAIL = /(시키다|당하다|받다|하다|되다|스럽다|롭다|해지다|하게|하는|적인|적으로|적|스러운|로운|스런|한|할|된|되는|될|함|성|히|의)$/;

export function highlightMeaning(ko, meaning, mark) {
  const text = String(ko || '');
  // 직접 지정한 강조어(CSV '해석강조' 컬럼 또는 highlights.json)가 해석에 있으면 그걸 씀.
  // 'A|B'처럼 여러 개면 해석에 있는 것 모두 (뜻 갈래마다 문장이 따로 있는 단어: "달할|해당한다")
  const picks = [];
  for (const m of String(mark || '').split('|').map(x => x.trim()).filter(Boolean)) {
    const i = text.indexOf(m);
    if (i >= 0 && !picks.some(p => i < p.end && i + m.length > p.start)) picks.push({ start: i, end: i + m.length });
  }
  if (picks.length) {
    picks.sort((x, y) => x.start - y.start);
    const segs = [];
    let pos = 0;
    for (const p of picks) {
      if (p.start > pos) segs.push({ t: 'text', v: text.slice(pos, p.start) });
      segs.push({ t: 'mark', v: text.slice(p.start, p.end) });
      pos = p.end;
    }
    if (pos < text.length) segs.push({ t: 'text', v: text.slice(pos) });
    return segs;
  }
  if (!text || !meaning) return [{ t: 'text', v: text }];
  const cleaned = String(meaning)
    .replace(/\([^)]*\)+/g, ' ') // ((주로 수동태로)), (농작물을) 같은 보충 설명은 제외
    .replace(/[A-Za-z0-9~〜…·.,;:/|+=_'"!?()\[\]-]/g, ' ');
  const tokens = [...new Set(cleaned.split(/\s+/).map(t => t.replace(/[^가-힣]/g, '')).filter(Boolean))];
  const ranges = [];
  const covered = i => ranges.some(r => i >= r.start && i < r.end);
  const wordStart = i => i === 0 || KO_WORD_END.test(text[i - 1]);
  const isHangul = ch => !!ch && ch >= '가' && ch <= '힣';
  for (const tok0 of tokens) {
    if (KO_SKIP.has(tok0)) continue;
    // 뜻 끝의 조사는 뗌: 주권을 (가진) → 주권, (최고) 권력의 → 권력
    const bare = tok0.endsWith('다') ? tok0 : tok0.replace(/(으로|을|를|의|에|로)$/, '');
    const tok = bare.length >= 2 ? bare : tok0;
    const pred = tok.length > 1 && tok.endsWith('다');   // 동사·형용사: 끝이 활용으로 바뀜 (확신시키다 → 확신시켰다)
    const mod = !pred && tok.length >= 2 && /[인한은운는된진난른던친린]$/.test(tok); // 꾸미는 말: 치명적인 → 치명적이었다
    const stem = pred ? tok.slice(0, -1) : tok;
    if (KO_SKIP.has(stem)) continue;
    // 명사는 통째로만 찾음. 앞 글자만 맞춰 찾으면 엉뚱한 말에 붙음(상승 → 상황, 전송 → 전화기, 국왕 → 국가)
    // 찾는 순서: 통째 → (동사·꾸미는 말) 끝 한 글자를 뗀 것 → 하다·되다·적인 같은 꼬리를 뗀 두 글자 이상 어근(차별하다 → 차별받아서는)
    const tries = [{ pre: stem }];
    if ((pred || mod) && stem.length >= 2) tries.push({ pre: stem.slice(0, -1), cut: stem.at(-1) });
    let root = tok;
    for (let k = 0; k < 2; k++) { const r = root.replace(KO_ROOT_TAIL, ''); if (r.length >= 2 && r !== root) root = r; }
    if (root !== tok && !tries.some(t => t.pre === root)) tries.push({ pre: root });
    let hit = null;
    for (const { pre, cut } of tries) {
      const len = pre.length;
      if (len === 1 && KO_SKIP.has(pre)) continue;
      // 한 글자: 동사·꾸미는 말의 어간(막다 → 막았다, 졸린 → 졸리기)은 어절 맨 앞에서 뒤에 어미가 붙은 것만(내 질문에 ✗),
      // 한 글자 명사(떼, 꽃, 약)는 그 글자 하나로 된 어절(뒤에 조사만)일 때만 (주권 ✗, 소 떼로 ✓)
      const verbish = pred || mod || cut;
      for (let i = text.indexOf(pre); i >= 0 && hit == null; i = text.indexOf(pre, i + 1)) {
        if (covered(i)) continue;
        const next = text[i + len];
        if (len === 1 && !wordStart(i)) continue;
        if (len === 1 && verbish && !isHangul(next)) continue;
        if (len === 1 && !verbish && next && !KO_WORD_END.test(next) && !(KO_PARTICLE.test(text.slice(i + 1)))) continue;
        // 한 글자 어간이 활용으로 바뀌면 바뀐 글자도 첫소리는 같음 (버리 → 버려, 돌리 → 돌렸)
        if (len === 1 && cut && next !== cut && toJamo(next)[0] !== toJamo(cut)[0]) continue;
        hit = i;
      }
      if (hit != null) break;
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
// bookResetAt('단어책 새로 시작') 이전 기록은 단어책 단어만 버린다(내 단어 my|…는 그대로).
// 지운 표시({ del })는 pruneBefore(시각)보다 오래되면 버린다. 동기화는 TOMB_KEEP(90일) 전으로 줌 (그동안 다른 기기도 다 맞춰졌을 테니, 쌓이지 않게)
export const TOMB_KEEP = 90 * 864e5;
export const isMyId = id => String(id).startsWith('my|');
export function mergeProgress(a, b, { pruneBefore = 0 } = {}) {
  const resetAt = Math.max((a && a.resetAt) || 0, (b && b.resetAt) || 0);
  const bookResetAt = Math.max((a && a.bookResetAt) || 0, (b && b.bookResetAt) || 0);
  const out = {};
  for (const src of [(a && a.stats) || {}, (b && b.stats) || {}]) {
    for (const [id, s] of Object.entries(src)) {
      if (!s || (s.s || 0) < resetAt) continue;
      if (!isMyId(id) && (s.s || 0) < bookResetAt) continue;
      if (s.del && (s.s || 0) < pruneBefore) continue;
      // 지운 기록은 { del: 1, s: 지운 시각 }로 남겨서 다른 기기의 예전 기록이 되살아나지 않게
      if (!out[id] || (s.s || 0) > (out[id].s || 0)) out[id] = s.del ? { del: 1, s: s.s } : normalizeStat(s);
    }
  }
  // 시험일·하루 새 단어 수 같은 설정도 더 최근에 바꾼 쪽으로
  const pa = (a && a.prefs) || null, pb = (b && b.prefs) || null;
  let prefs = !pa ? pb : !pb ? pa : (pa.at || 0) >= (pb.at || 0) ? pa : pb;
  // 시험일만은 다른 설정과 따로, 시험일을 더 최근에 바꾼 쪽(examAt)으로.
  // (시험일은 예문·단어 모드가 같이 써서, 한 모드에서 정한 시험일이 다른 모드의 나머지 설정까지 끌고 가면 안 됨)
  if (pa && pb) {
    const e = examAt(pa) >= examAt(pb) ? pa : pb;
    prefs = { ...prefs, exam: e.exam || '', examAt: examAt(e) };
    // 쉬는 요일도 두 모드가 같이 써서(코치가 하나) 같은 까닭으로 따로, 더 최근에 바꾼 쪽(restAt)으로
    const r = restAt(pa) >= restAt(pb) ? pa : pb;
    prefs = { ...prefs, coachRest: Array.isArray(r.coachRest) ? r.coachRest : [], restAt: restAt(r) };
    // 다시 나오기 설정도 두 모드가 같이 써서 따로, 더 최근에 바꾼 쪽(againAt)으로
    const g = (pa.againAt || 0) >= (pb.againAt || 0) ? pa : pb;
    if (g.again) prefs = { ...prefs, again: g.again, againAt: g.againAt || 0 };
    // 총정리 문제 방식도 두 모드가 같이 써서 따로 (sweepKindAt)
    const k = (pa.sweepKindAt || 0) >= (pb.sweepKindAt || 0) ? pa : pb;
    if (k.sweepKind) prefs = { ...prefs, sweepKind: k.sweepKind, sweepKindAt: k.sweepKindAt || 0 };
  }
  // 하던 학습(이어하기)도 기기끼리: 더 최근에 바꾼 쪽(at). data가 null이면 끝냈거나 지운 것
  const sa = a && a.sess, sb = b && b.sess;
  const sess = !sa ? sb : !sb ? sa : (sa.at || 0) >= (sb.at || 0) ? sa : sb;
  return { v: 2, resetAt, ...(bookResetAt ? { bookResetAt } : {}), stats: out, ...(prefs ? { prefs } : {}), ...(sess ? { sess } : {}) };
}

// 시험일을 바꾼 시각. examAt이 없던 예전 기록은 설정 전체를 바꾼 시각(at)으로 봄
export const examAt = p => (p && p.examAt != null ? p.examAt : (p && p.at) || 0);
// 쉬는 요일을 바꾼 시각 (예전 설정엔 없어서 설정 전체를 바꾼 시각으로 봄)
export const restAt = p => (p && p.restAt != null ? p.restAt : (p && p.at) || 0);

// 코치와 이야기하기 기록 합치기: 예전엔 예문·단어 모드가 따로 저장해서, 하나로 합칠 때 씀.
// { items: [{ who, text, t }], notes: [{ text, t }] } 둘 → 시각 순으로 하나 (같은 말은 한 번), 기억은 같은 글을 한 번
export function mergeChats(a, b, { keep = 200, notes = 30 } = {}) {
  const items = [], seen = new Set();
  const all = [...((a && a.items) || []), ...((b && b.items) || [])].filter(m => m && m.text);
  all.map((m, i) => ({ m, i })).sort((x, y) => (x.m.t || 0) - (y.m.t || 0) || x.i - y.i).forEach(({ m }) => {
    const k = `${m.t || 0}|${m.who}|${m.text}`;
    if (seen.has(k)) return;
    seen.add(k);
    items.push(m);
  });
  const ns = [], nseen = new Set();
  [...((a && a.notes) || []), ...((b && b.notes) || [])].filter(n => n && n.text).sort((x, y) => (x.t || 0) - (y.t || 0)).forEach(n => {
    if (nseen.has(n.text)) return;
    nseen.add(n.text);
    ns.push(n);
  });
  return { items: items.slice(-keep), notes: ns.slice(-notes) };
}

// ---------- 코치가 아는 학습 기록 · 기기끼리 맞추는 코치 이야기 ----------
// 학습 기록(log): 문제를 풀 때마다, 학습을 시작·끝낼 때, 정답 화면에서 AI에게 물을 때 한 줄씩. 두 모드가 같이 씀.
// { t: 시각, m: 'e'(예문)|'w'(단어), sid: 학습 하나의 번호, id?: 단어, o?: 'ok'|'hint'|'wrong', k?: 어떻게(idk·copied·partial·hint), g?: 학생이 고르거나 쓴 답,
//   ev?: 'start'|'end'|'quit'|'ask', label?, total?, q?: AI에게 물은 말 }
export const LOG_KEEP = 800, LOG_DAYS = 14;
const logKey = e => `${e.t}|${e.m || ''}|${e.ev || ''}|${e.id || ''}`;
export function cleanLog(log, { now = Date.now(), keep = LOG_KEEP, days = LOG_DAYS } = {}) {
  const from = now - days * 86400000, seen = new Set(), out = [];
  for (const e of (Array.isArray(log) ? log : []).filter(e => e && e.t >= from && e.t <= now + 86400000).sort((a, b) => a.t - b.t)) {
    const k = logKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.slice(-keep);
}
export const mergeLog = (a, b, o = {}) => cleanLog([...(a || []), ...(b || [])], o);

// 코치 이야기를 기기끼리 합치기. mergeChats에 더해
// wiped: '이야기와 기억 모두 지우기'를 누른 시각 (그 앞의 이야기·기억은 어느 기기에서 왔든 버림)
// gone: { 기억 글: 지운 시각 } 지운 기억이 다른 기기에서 되살아나지 않게 (지운 뒤에 다시 적은 건 남김)
// sum: 앞선 이야기 요약 — 더 최근에 고친(at) 쪽. 그날 첫 인사(g: 날짜)는 기기마다 하나씩 생기니 하루에 하나만
export function mergeCoachChat(a, b, { keep = 200, notes = 30 } = {}) {
  a = a || {}; b = b || {};
  const wiped = Math.max(a.wiped || 0, b.wiped || 0);
  const gone = { ...(a.gone || {}) };
  for (const [k, t] of Object.entries(b.gone || {})) gone[k] = Math.max(gone[k] || 0, t);
  const m = mergeChats(a, b, { keep: Infinity, notes: Infinity });
  const greet = new Set();
  const items = m.items.filter(x => {
    if ((x.t || 0) < wiped) return false;
    if (!x.g) return true;
    if (greet.has(x.g)) return false;
    greet.add(x.g);
    return true;
  }).slice(-keep);
  const ns = m.notes.filter(n => (n.t || 0) >= wiped && !(gone[n.text] >= (n.t || 0))).slice(-notes);
  const at = s => (s ? s.at || s.upTo || 0 : -1);
  const sum = at(a.sum) >= at(b.sum) ? a.sum || null : b.sum;
  return { items, notes: ns, ...(sum ? { sum } : {}), ...(wiped ? { wiped } : {}), ...(Object.keys(gone).length ? { gone } : {}) };
}
// 동기화 파일(voca-coach.json) 하나: { chat, log }
export function mergeCoachData(a, b, { now = Date.now() } = {}) {
  return { v: 1, chat: mergeCoachChat(a && a.chat, b && b.chat), log: mergeLog(a && a.log, b && b.log, { now }) };
}
export function sameCoachData(x, y) {
  const n = d => JSON.stringify([(d && d.chat) || {}, (d && d.log) || []]);
  return n(x) === n(y);
}

/**
 * 코치에게 넘기는 최근 학습 기록 (글자). 학습 하나씩 시각순으로, 틀린 단어와 고른 답까지.
 * word(id) → { word, meaning } | null, mode('e'|'w') → '예문 모드', since: 코치와 마지막으로 이야기한 시각,
 * live: { sid, pos, total } 지금 이 기기에서 풀고 있는 학습
 */
export function activityDigest(log, { now = Date.now(), word = () => null, mode = m => m, since = 0, live = null, max = 2400 } = {}) {
  const hm = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const md = t => { const [, mm, dd] = dateStr(t).split('-'); return `${+mm}/${+dd}`; };
  const today = dateStr(now);
  const name = id => { const w = word(id); return w ? w.word : null; };
  const mean = id => { const w = word(id); return w ? shortMeaning(String(w.meaning || '')).replace(/\s*\/\s*$/, '').slice(0, 20) : ''; };
  // 학습 하나씩 묶기
  const ses = new Map(), asks = [];
  for (const e of log || []) {
    if (e.ev === 'ask') { asks.push(e); continue; }
    const key = `${e.m}|${e.sid || 0}`;
    let s = ses.get(key);
    if (!s) ses.set(key, s = { m: e.m, sid: e.sid, from: e.t, to: e.t, label: '', total: 0, ans: [], end: '', pos: 0 });
    s.to = Math.max(s.to, e.t);
    if (e.ev === 'start') { s.label = e.label || s.label; s.total = e.total || s.total; s.from = Math.min(s.from, e.t); }
    else if (e.ev === 'end' || e.ev === 'quit') { s.end = e.ev; if (e.label) s.label = e.label; if (e.total) s.total = e.total; if (e.pos != null) s.pos = e.pos; }
    else if (e.id) s.ans.push(e);
  }
  const list = [...ses.values()].filter(s => s.ans.length || s.end).sort((a, b) => a.from - b.from);
  if (!list.length && !asks.length) return '';
  const line = s => {
    const fin = new Map(); // 단어마다: 한 번이라도 틀리면 틀림, 아니면 힌트, 아니면 맞힘
    for (const a of s.ans) { const p = fin.get(a.id); fin.set(a.id, p === 'wrong' || a.o === 'wrong' ? 'wrong' : p === 'hint' || a.o === 'hint' ? 'hint' : 'ok'); }
    const ids = [...fin.keys()], bad = ids.filter(i => fin.get(i) === 'wrong'), hint = ids.filter(i => fin.get(i) === 'hint');
    const isLive = live && s.sid === live.sid && s.m === live.m;
    const state = isLive ? `지금 푸는 중 (${live.pos}/${live.total || s.total}문제)`
      : s.end === 'end' ? '끝냄' : s.end === 'quit' ? `중간에 그만둠${s.total ? ` (${s.pos || ids.length}/${s.total}문제)` : ''}`
        : now - s.to < 15 * 60000 ? '푸는 중이거나 잠깐 멈춤' : '끝내지 않고 멈춤';
    const head = `- ${md(s.from)} ${hm(s.from)}~${hm(s.to)} ${mode(s.m)} '${s.label || '학습'}'${s.total ? ` ${s.total}문제` : ''}: ${state}. 단어 ${ids.length}개 중 맞힘 ${ids.length - bad.length - hint.length}, 힌트 ${hint.length}, 틀림 ${bad.length}${s.from > since && since ? ' [코치와 마지막으로 이야기한 뒤]' : ''}`;
    const out = [head];
    const gave = id => { const a = [...s.ans].reverse().find(x => x.id === id && x.o === 'wrong'); return a && a.g ? ` → '${String(a.g).slice(0, 24)}'(이)라고 함` : a && a.k === 'idk' ? ' → 모르겠어요' : a && a.k === 'copied' ? ' → 정답 보고 씀' : ''; };
    if (bad.length) out.push(`  틀린 단어: ${bad.filter(name).slice(0, 12).map(i => `${name(i)}(${mean(i)})${gave(i)}`).join(', ')}${bad.length > 12 ? ' …' : ''}`);
    if (hint.length) out.push(`  힌트 쓴 단어: ${hint.filter(name).slice(0, 10).map(name).join(', ')}${hint.length > 10 ? ' …' : ''}`);
    return out;
  };
  // 최근 사흘(오늘 포함)은 학습마다 자세히, 그 앞은 날마다 한 줄
  const near = list.filter(s => dateStr(s.from) > addDays(today, -3));
  const far = list.filter(s => dateStr(s.from) <= addDays(today, -3));
  const days = new Map();
  for (const s of far) {
    const d = dateStr(s.from), x = days.get(d) || { n: 0, q: 0, bad: new Set() };
    x.n++; x.q += new Set(s.ans.map(a => a.id)).size;
    for (const a of s.ans) if (a.o === 'wrong') x.bad.add(a.id);
    days.set(d, x);
  }
  const out = [];
  for (const [d, x] of days) out.push(`- ${md(new Date(`${d}T12:00:00`).getTime())}: 학습 ${x.n}번, 단어 ${x.q}개, 틀림 ${x.bad.size}${x.bad.size ? ` (${[...x.bad].filter(name).slice(0, 5).map(name).join(', ')}${x.bad.size > 5 ? ' …' : ''})` : ''}`);
  for (const s of near.slice(-10)) out.push(...line(s));
  // 가장 최근 학습은 푼 순서대로 (방금 그 단어가 뭐였는지 물을 때)
  const lastS = near[near.length - 1];
  if (lastS && lastS.ans.length) {
    const seq = lastS.ans.slice(-15).map(a => `${name(a.id) || '?'} ${a.o === 'ok' ? 'O' : a.o === 'hint' ? '힌트' : 'X'}`);
    out.push(`  가장 최근 학습에서 푼 순서(마지막 ${seq.length}개, 맨 끝이 방금): ${seq.join(', ')}`);
  }
  const ask = asks.filter(e => e.t > now - 3 * 86400000).slice(-5);
  if (ask.length) out.push(`- 정답 화면에서 AI에게 물어본 것: ${ask.map(e => `${md(e.t)} ${hm(e.t)} [${name(e.id) || '?'}] "${String(e.q || '').slice(0, 50)}"`).join(' / ')}`);
  // 길면 오래된 줄부터 뺌
  let text = out.join('\n');
  while (text.length > max && out.length > 2) { out.shift(); text = out.join('\n'); }
  return text;
}

export const samePrefs = (x, y) => JSON.stringify(x || null) === JSON.stringify(y || null);

export function sameStats(x, y) {
  const kx = Object.keys(x || {}), ky = Object.keys(y || {});
  if (kx.length !== ky.length) return false;
  return kx.every(k => {
    const a = x[k], b = y[k];
    return b && a.s === b.s && a.st === b.st && a.due === b.due && a.c === b.c && a.w === b.w && a.f === b.f && a.h === b.h && a.q === b.q && a.g === b.g && !!a.del === !!b.del;
  });
}

// ---------- 직접 입력 글자 힌트 ----------
// 입력이 정답 앞부분과 맞는 데까지는 살리고, 거기서부터 2글자(남은 게 2글자 이하면 1글자)를 더 채운다.
// 마지막 글자는 알려주지 않는다. 더 줄 힌트가 없으면 null.
export function typingHintTarget(word, blanks1, blanks2) {
  const pick = [blanks1, blanks2].find(b => b && b.length) || answerParts(word.blank);
  return blankUnit(pick, answerWordCount(word.blank)).join(' ').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

// 같은 말이 문장에 여러 번 가려졌으면(cues … cues, give up … give up) 한 번 분량만: 정답은 그 한 번
// n = 정답 낱말 수(answerWordCount). 예문 한 칸에 문장이 여럿이라 꼴이 다르게 여러 번 가려졌으면
// (Breaking off … broke off) 같은 말이 아니어도 낱말 수의 배수면 첫 번 분량만 (빈칸을 두 번 쓰게 하지 않게)
export function blankUnit(blanks, n = 0) {
  const b = blanks || [];
  const low = b.map(x => String(x).toLowerCase());
  for (let p = 1; p < b.length; p++) {
    if (b.length % p === 0 && low.every((x, i) => x === low[i % p])) return b.slice(0, p);
  }
  if (n > 0 && b.length > n && b.length % n === 0) return b.slice(0, n);
  return b;
}
// 정답 낱말 수 (break off → 2, convince A of B → 2, fatal → 1)
export const answerWordCount = blankForm => answerParts(blankForm).join(' ').split(/\s+/).filter(Boolean).length;

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
// 한글 음절을 자모로 풀기 (오타를 글자 단위가 아니라 자모 단위로 셈)
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function toJamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xAC00;
    out += c < 0 || c > 11171 ? ch : CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return out;
}
// 같은 말로 보는 경우: 똑같음 · 한쪽이 다른 쪽 + 어미/조사만 더 붙음(치명적 ↔ 치명적인) · 자모 단위로 오타 조금.
// 한쪽이 다른 쪽에 들어 있기만 한 건 다른 말: 대칭 ↔ 비대칭, 나운 ↔ 사나운, 가루 ↔ 꽃가루, 선고 ↔ 유죄를선고, 수감 ↔ 수감자
// 오타는 자모 단위로: 한 글자가 통째로 다른 말(수입 ↔ 수출, 중대 ↔ 군대)은 오타가 아니라 다른 뜻이라 안 봐줌
const KO_TAIL = /^(인|의|이|히|게|하게|스러운|스런|스럽게|로운|롭게|한|하는|하게|된|되는|되게|하|되|시키|시킨|시켜|함|됨|을|를|은|는|이다|였다|했다|된다|한다|하기|되기|해|돼)$/;
function nearKo(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.startsWith(s)) return KO_TAIL.test(l.slice(s.length));
  // 오타: 세 글자 이상이고 글자 수가 같고, 첫 글자가 아닌 한 글자에서 모음·받침이 자모 하나만 다를 때 (명확한 → 명학한, 치명적인 → 치명적잉).
  // 두 글자 말이나 첫소리가 다른 건 자모 하나만 달라도 거의 다른 말이라(수입 ↔ 수익, 방해 ↔ 방패, 최고 ↔ 최소, 열정 ↔ 결정) 오타로 안 봄
  if (s.length < 3 || a.length !== b.length || a[0] !== b[0]) return false;
  const diff = [...a].map((ch, i) => i).filter(i => a[i] !== b[i]);
  if (diff.length !== 1) return false;
  const x = toJamo(a[diff[0]]), y = toJamo(b[diff[0]]);
  return x.length > 1 && y.length > 1 && x[0] === y[0] && lev(x, y) <= 1;
}
// 오답 보기를 고를 때는 느슨하게: 한쪽이 다른 쪽에 들어 있기만 해도 비슷한 뜻으로 봄 (비슷한 뜻의 보기를 피하려고)
function looseKo(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  if (b.includes(a) || a.includes(b)) return true;
  const ja = toJamo(a), jb = toJamo(b);
  return lev(ja, jb) <= Math.max(1, Math.floor(Math.max(ja.length, jb.length) * 0.25));
}
// 뜻의 [ ]는 바로 앞말을 바꿔 쓸 수 있다는 표시: "식별[구별]하다" → 식별하다 · 구별하다, "전문 지식[기술]" → 전문 지식 · 전문 기술.
// 앞말 없이 쓰인 [생물] 같은 분야 표시는 그대로 둠(normKo가 지움)
const KO_ENDING = /(하다|되다|시키다|받다|당하다)$/;
const KO_ENDING_ONLY = /^(하다|되다|시키다|받다|당하다|하게 하다|되게 하다)$/;
function bracketVariants(text, depth = 0) {
  const m = depth < 3 && /(\S)\[([^\[\]]+)\]/.exec(text);
  if (!m) return [text];
  const pre = text.slice(0, m.index + 1), inner = m[2].trim(), post = text.slice(m.index + m[0].length);
  const out = [pre + post];
  if (KO_ENDING_ONLY.test(inner)) {
    // 어미만 바꾸는 경우: 진정하다[되다] → 진정되다
    const e = KO_ENDING.exec(pre);
    if (e) out.push(pre.slice(0, -e[0].length) + inner + post);
  } else if (inner) {
    const at = pre.lastIndexOf(' ') + 1;
    out.push(pre.slice(0, at) + inner + post);  // 바로 앞 낱말을 바꿈
    if (at > 0) out.push(inner + post);         // 앞말 전체를 바꿈: 집착하게 하다[집착하다]
  }
  return out.flatMap(v => bracketVariants(v, depth + 1));
}
// 쉼표로 나누되 괄호 안의 쉼표는 그대로
function splitAlts(p) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of p) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '、') && !depth) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
// 뜻 갈래마다 [표현마다 [바꿔 쓸 수 있는 꼴들]]
function senseExprs(ans) {
  const out = [];
  String(ans || '').split(/[\/;]/).forEach(block => {
    block.split(/\s*\d+\.\s*/).map(s => s.trim()).filter(Boolean).forEach(p => {
      const exprs = splitAlts(p).map(a => [...new Set(bracketVariants(a.trim()).map(normKo).filter(Boolean))]).filter(v => v.length);
      if (exprs.length) out.push(exprs);
    });
  });
  return out;
}
// "1. 치명적인 2. 결정적인, 중대한 / 명사 뜻" → 뜻 갈래마다 [같은 뜻 표현들] ([ ]로 바꿔 쓴 꼴도 포함)
export function meaningSenses(ans) {
  return senseExprs(ans).map(exprs => [...new Set(exprs.flat())]);
}
/**
 * 직접 쓴 뜻 채점. strict: 'easy'(하나만 맞아도) | 'mid'(갈래가 여럿인 품사/뜻이면 절반 이상) | 'hard'(전부)
 * 반환 { score: 2 맞음 | 1 부분 | 0 틀림, missing: 빠진 갈래 수 }
 */
export function gradeMeaning(user, answer, strict = 'mid') {
  const raw = String(user || '');
  const chunks = raw.split(/[\s,;\/、]+/).map(normKo).filter(Boolean);
  // 띄어쓰기 없이 붙여 쓴 답도 한 덩어리로 봄: "전문기술" ↔ 전문 기술
  for (const part of raw.split(/[,;\/、]+/)) { const c = normKo(part); if (c && !chunks.includes(c)) chunks.push(c); }
  const gs = senseExprs(answer);
  if (!chunks.length || !gs.length) return { score: 0, missing: gs.length };
  const said = variants => variants.some(a => chunks.some(c => nearKo(c, a)));
  const hit = gs.filter(exprs => exprs.some(said)).length;
  if (!hit) return { score: 0, missing: gs.length };
  // 느슨: 뜻 하나만 맞아도 · 보통: 뜻 갈래(1. 2. …)마다 하나씩 · 엄격: 나와 있는 뜻 낱말 전부 ([ ]로 바꿔 쓴 꼴은 하나만 써도 됨)
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
  return A.some(x => B.some(y => x.some(p => y.some(q => looseKo(p, q)))));
}
// 오답 뜻 보기 n개: 같은 범위에서, 정답·서로와 뜻이 겹치지 않게
export function pickMeaningDistractors(target, all, n = 3, rand = Math.random) {
  // 품사가 같은 뜻부터 (동사 문제에 명사 뜻 보기가 섞이면 품사만 봐도 답이 보임). 품사를 모르면 중간
  const tPos = posSet(target);
  const posRank = w => {
    const p = posSet(w);
    if (!tPos.size || !p.size) return 1;
    if (p.size === tPos.size && [...p].every(k => tPos.has(k))) return 0;
    return [...p].some(k => tPos.has(k)) ? 1 : 2;
  };
  const cands = shuffle(all.filter(w => w.word !== target.word && w.meaning && w.meaning !== target.meaning), rand)
    .map((w, i) => ({ w, r: posRank(w), i })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.w);
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

// 고른 코치 캐릭터 { char, at }: 동기화할 때 더 최근에 고른 쪽으로. 한쪽만 골랐으면 그쪽.
// 둘 다 언제 골랐는지 모르면(at 0, 이 기능 전에 고름) Gist 쪽을 따름 — 기기마다 제 것을 고집하면 서로 덮어쓰기만 해서
export function mergeCoach(local, remote) {
  const ok = x => !!(x && typeof x.char === 'string' && x.char);
  if (!ok(remote)) return ok(local) ? { char: local.char, at: local.at || 0 } : null;
  if (!ok(local)) return { char: remote.char, at: remote.at || 0 };
  return (local.at || 0) > (remote.at || 0) ? { char: local.char, at: local.at } : { char: remote.char, at: remote.at || 0 };
}
export const sameCoach = (x, y) => ((x && x.char) || '') === ((y && y.char) || '') && ((x && x.at) || 0) === ((y && y.at) || 0);

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
export function formRegex(text) {
  const parts = answerParts(text);
  if (!parts.length) return null;
  const body = parts.join(' ').split(/\s+/).filter(Boolean).map((w, i) => wordPattern(w, i === 0)).join('\\s+');
  return new RegExp(`^(?:${body})$`, 'i');
}
export const isFormOf = (typed, text) => { const re = formRegex(text); return !!(re && re.test(String(typed || '').trim())); };

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
    return { kind: 'near', text: `'${other.word}'도 좋아요. 그런데 다른 단어는 없을까요?` }; // 앞 글자는 앱이 붙임 (nearLetters)
  }
  // 철자 비교는 정답 중 가장 가까운 것과
  // 이웃한 두 글자의 순서를 바꿔 친 건 한 번 틀린 걸로 셈 (nrom → norm). 짧은 단어는 한 번까지만 봐줘서
  let best = null;
  for (const c of cands) {
    const r = spellDiff(typed, c);
    const swaps = r.dist - typoDist(typed, c); // 순서 바뀜 횟수만큼 줄어듦
    const cost = r.dist - swaps;
    if (!best || cost < best.cost) best = { ...r, c, cost, swaps };
  }
  if (best && best.cost <= (best.c.length <= 4 ? 1 : best.c.length <= 8 ? 2 : 3)) {
    const n = k => (k === 1 ? '한' : k === 2 ? '두' : '세');
    const text = best.swaps && best.cost === best.swaps ? '두 글자 순서가 바뀌었어요'
      : best.swaps ? `글자 순서가 바뀐 데가 있고, 정답과 ${n(best.cost - best.swaps)} 글자 달라요` : `정답과 ${n(best.dist)} 글자 달라요`;
    return { kind: 'spell', diff: best.segs, text };
  }
  return null;
}

// 초록 말풍선(뜻은 통하는 다른 말을 씀)에 붙이는 앞 글자 힌트. 뜻은 안다는 거라 힌트로 치지 않음.
// 짧은 단어는 1글자, 긴 단어(NEAR_LONG 글자 이상)는 2글자부터. 다른 비슷한 말을 또 쓸 때마다 한 글자씩 더
// (끝 두 글자는 남김). target = 예문 속 정답 꼴(typingHintTarget), nth = 이 문제에서 몇 번째로 쓴 비슷한 말인지
export const NEAR_LONG = 7;
export function nearLetters(target, nth = 1) {
  const t = String(target || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const letters = t.replace(/ /g, '').length;
  if (!letters) return null;
  const want = (letters >= NEAR_LONG ? 2 : 1) + Math.max(0, nth - 1);
  const n = Math.max(1, Math.min(want, letters - 2));
  let prefix = '', k = 0;
  for (const ch of t) { if (k >= n) break; prefix += ch; if (ch !== ' ') k++; }
  return { n, prefix, text: n === 1 ? `첫 글자는 '${prefix}'예요.` : `'${prefix}'로 시작해요.` };
}

// 오타 횟수: 넣기·빼기·바꾸기 한 번씩, 이웃한 두 글자 순서 바꿈도 한 번 (Damerau)
function typoDist(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[n][m];
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
// mark: 직접 지정한 강조어(해석강조 · highlights.json). 이 해석에 있으면 그 말이 어느 뜻과 맞는지로만 판정
export function senseOf(ko, meaning, mark) {
  const senses = senseList(meaning);
  if (senses.length <= 1) return senses.length;
  const marks = String(mark || '').split('|').map(x => x.trim()).filter(m => m && String(ko || '').includes(m));
  const text = marks.length ? marks.join(' ') : ko;
  let best = 0, bestLen = 0, tie = false;
  senses.forEach((s, i) => {
    const len = highlightMeaning(text, s).filter(x => x.t === 'mark').reduce((a, x) => a + x.v.length, 0);
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
      const sense = senseOf(ko, target.meaning, target.koMark);
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

// ---------- 이번 학습에서 다시 나오기 ----------
// 틀림(wrong) · 힌트 두 번(hint2: 직접 입력에서 정답 보고 따라 씀) · 힌트 한 번(hint1: 힌트 쓰고 맞힘, 부분 정답)마다
// 다시 나올 때를 여러 개 고름: 곧(1~2문제 뒤) · 조금 뒤(3~5) · 나중에(8~12) · 맨 끝(이번 학습 마지막). 하나도 없으면 이번엔 다시 안 나옴
export const AGAIN_SLOTS = ['soon', 'mid', 'late', 'end'];
export const AGAIN_GAPS = { soon: [1, 2], mid: [3, 5], late: [8, 12] };
export const AGAIN_REC = { wrong: ['mid', 'end'], hint2: ['mid', 'late'], hint1: ['late'] }; // 추천
export const AGAIN_OLD = { wrong: ['mid'], hint2: ['mid'], hint1: [] }; // 가볍게 (이 설정이 생기기 전과 같음)
export const AGAIN_FULL = { wrong: ['soon', 'late', 'end'], hint2: ['mid', 'late', 'end'], hint1: ['mid', 'end'] }; // 꼼꼼하게
export function cleanAgain(a) {
  const out = {};
  for (const k of Object.keys(AGAIN_REC)) {
    const v = a && Array.isArray(a[k]) ? a[k] : AGAIN_REC[k];
    out[k] = AGAIN_SLOTS.filter(s => v.includes(s));
  }
  return out;
}
export const sameAgain = (a, b) => JSON.stringify(cleanAgain(a)) === JSON.stringify(cleanAgain(b));

// queue[pos]가 방금 푼 단어(id). 뒤에 남아 있던 그 단어는 빼고(다시 틀리면 새로 잡음) 고른 때마다 한 번씩 넣음.
// 뒤쪽(나중에)부터 넣어서 앞쪽 간격이 흐트러지지 않게. 남은 문제가 모자라면 맨 끝으로, 같은 단어가 연달아 오면 하나만
export function requeue(queue, pos, id, slots, rand = Math.random) {
  const head = queue.slice(0, pos + 1);
  const tail = queue.slice(pos + 1).filter(x => x !== id);
  for (const s of ['late', 'mid', 'soon']) {
    if (!slots.includes(s)) continue;
    const [lo, hi] = AGAIN_GAPS[s];
    tail.splice(Math.min(tail.length, lo + Math.floor(rand() * (hi - lo + 1))), 0, id);
  }
  if (slots.includes('end')) tail.push(id);
  return [...head, ...tail.filter((x, i) => !(x === id && tail[i - 1] === id))];
}

// ---------- 코치와 이야기하기: 학생 말에 나온 단어 찾기 ----------
// 영단어(변화형 포함: fatally·took도)나 뜻(세 글자 이상, '치명적인이'처럼 조사가 붙어도), 'DAY 30'을 찾아 코치에게 그 단어 자료를 넘기려고.
// 반환 { words: [단어], days: [DAY 번호] }. 앞에 나온 글(texts[0])에서 찾은 것부터, max개까지
const mentionRe = new Map();
function mentionRegex(w) {
  if (mentionRe.has(w.id)) return mentionRe.get(w.id);
  const head = answerParts(w.word)[0];
  let re = null;
  try { re = head && /[A-Za-z]/.test(head) ? partRegex(head) : null; } catch { re = null; }
  mentionRe.set(w.id, re);
  return re;
}
const mentionSenses = m => String(m || '').replace(/\(\([^)]*\)\)|\([^)]*\)|\[[^\]]*\]/g, ' ').split(/\s*\d+\.\s*|[,;/]/)
  .map(x => x.replace(/[~∼〜]/g, '').trim()).filter(x => /^[가-힣 ]{3,}$/.test(x) && x.replace(/\s/g, '').length >= 3);
// 파생어 칸의 영단어 ('fatality 명 … / fatally 부 …' → fatality, fatally)
const derivedMemo = new Map();
function derivedWords(w) {
  if (derivedMemo.has(w.id)) return derivedMemo.get(w.id);
  const src = (w.extras || []).filter(([k]) => /파생/.test(k)).map(([, v]) => v).join(' / ');
  const out = [...src.matchAll(/(?:^|\/)\s*([A-Za-z][A-Za-z-]{2,})\s+(?:명|형|부|동|전|접)/g)].map(m => m[1].toLowerCase());
  derivedMemo.set(w.id, out);
  return out;
}
export function findMentioned(words, texts, { max = 6, maxDays = 2 } = {}) {
  const out = [], seen = new Set(), dayList = [];
  const all = new Set(words.map(w => w.day));
  for (const raw of [].concat(texts || [])) {
    const t = String(raw || '');
    if (!t) continue;
    for (const m of t.matchAll(/day\s*(\d{1,3})/gi)) { const d = +m[1]; if (all.has(d) && !dayList.includes(d) && dayList.length < maxDays) dayList.push(d); }
    for (const w of words) {
      if (out.length >= max) break;
      if (seen.has(w.word.toLowerCase())) continue;
      const re = mentionRegex(w);
      let hit = false;
      if (re) { re.lastIndex = 0; hit = re.test(t); }
      if (!hit && /[A-Za-z]/.test(t)) hit = derivedWords(w).some(d => new RegExp(`(^|[^A-Za-z])${d}(?![A-Za-z])`, 'i').test(t));
      if (!hit && /[가-힣]/.test(t)) hit = mentionSenses(w.meaning).some(s => t.includes(s));
      if (hit) { out.push(w); seen.add(w.word.toLowerCase()); }
    }
  }
  return { words: out, days: dayList };
}
