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
      const e1 = splitSentence(get('ex1'));
      const e2 = splitSentence(get('ex2'));
      const id = `${day}|${word}`;
      if (seen.has(id)) continue;
      seen.add(id);
      words.push({
        id, day, word,
        meaning: get('meaning'),
        blank: get('blank') || word,
        ex1: e1.en, ex1ko: get('ex1ko') || e1.ko,
        ex2: e2.en, ex2ko: get('ex2ko') || e2.ko,
        pos: get('pos'), pron: get('pron'),
        extras: extras.map(i => [headers[i], (row[i] || '').trim()]).filter(([, v]) => v),
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

// 자주 쓰는 불규칙 동사 (빈칸형태가 원형이고 예문은 과거형일 때 대비)
const IRREGULAR = Object.fromEntries(`
be:was:were:been:being:am:is:are make:made take:took:taken give:gave:given come:came go:went:gone:goes
get:got:gotten have:had:has do:did:done:does keep:kept bring:brought think:thought hold:held run:ran
break:broke:broken find:found stand:stood lead:led fall:fell:fallen feel:felt leave:left lay:laid lie:lay:lain
see:saw:seen say:said tell:told know:knew:known grow:grew:grown throw:threw:thrown speak:spoke:spoken
write:wrote:written drive:drove:driven rise:rose:risen choose:chose:chosen catch:caught teach:taught
buy:bought seek:sought fight:fought sell:sold send:sent spend:spent build:built lose:lost meet:met
pay:paid win:won begin:began:begun bear:bore:borne:born wear:wore:worn tear:tore:torn draw:drew:drawn
show:showed:shown fly:flew:flown forget:forgot:forgotten stick:stuck strike:struck hang:hung swear:swore:sworn
deal:dealt mean:meant sit:sat shake:shook:shaken wake:woke:woken hide:hid:hidden bite:bit:bitten
`.trim().split(/\s+/).flatMap(e => { const f = e.split(':'); return f.map(x => [x, f]); }));

function wordPattern(w, fuzzy) {
  const lw = w.toLowerCase();
  if (lw === 'be') return BE_FORMS;
  if (fuzzy && IRREGULAR[lw]) {
    const forms = new Set(IRREGULAR[lw]);
    for (const f of IRREGULAR[lw]) forms.add(f + 's').add(f.endsWith('e') ? f.slice(0, -1) + 'ing' : f + 'ing');
    return `(?:${[...forms].map(escapeRe).join('|')})`;
  }
  if (!fuzzy || w.length < 4 || !/^[A-Za-z]+$/.test(w)) return escapeRe(w);
  // 어형 변화 허용: convince → convinc[a-z]*  (convinced, convincing ...)
  let stem = lw;
  if (/(ies|ied)$/.test(stem)) stem = stem.slice(0, -3);
  else if (/(ing)$/.test(stem) && stem.length > 5) stem = stem.slice(0, -3);
  else if (/(ed|es)$/.test(stem) && stem.length > 4) stem = stem.slice(0, -2);
  else if (/[eys]$/.test(stem)) stem = stem.slice(0, -1);
  if (stem.length < 3) stem = lw.slice(0, 3);
  return escapeRe(stem) + '[a-z]*';
}

function partRegex(part, fuzzy) {
  const ws = part.split(/\s+/).filter(Boolean);
  const body = ws.map(w => wordPattern(w, fuzzy)).join('\\s+');
  // 구형 iOS Safari는 lookbehind 미지원 → 앞 글자를 그룹으로 잡고 위치를 보정
  return new RegExp(`(^|[^A-Za-z])(${body})(?![A-Za-z])`, 'gi');
}

function execAt(re, sent, pos) {
  re.lastIndex = pos;
  const m = re.exec(sent);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length };
}

// 순서대로 각 덩어리를 찾는다. 전부 찾으면 [{start,end}] 반환, 아니면 null
function findSequential(sent, parts, fuzzy) {
  const found = [];
  let pos = 0;
  for (const p of parts) {
    const r = execAt(partRegex(p, fuzzy), sent, pos);
    if (!r) return null;
    found.push(r);
    pos = r.end;
  }
  return found;
}

function findAll(sent, part, fuzzy) {
  const re = partRegex(part, fuzzy);
  const out = [];
  let r, pos = 0;
  while ((r = execAt(re, sent, pos))) { out.push(r); pos = r.end; }
  return out;
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

  const tryForms = [blankForm, fallbackWord].filter(Boolean);
  for (const form of tryForms) {
    const parts = answerParts(form);
    if (!parts.length) continue;
    for (const fuzzy of [false, true]) {
      if (parts.length === 1) {
        const all = findAll(sent, parts[0], fuzzy);
        if (all.length) return build(sent, all);
      } else {
        const seq = findSequential(sent, parts, fuzzy);
        if (seq) return build(sent, seq);
      }
    }
    // 일부만 찾은 경우라도 찾은 덩어리는 가린다
    if (parts.length > 1) {
      const partial = [];
      let pos = 0;
      for (const p of parts) {
        for (const fuzzy of [false, true]) {
          const r = execAt(partRegex(p, fuzzy), sent, pos);
          if (r) { partial.push(r); pos = r.end; break; }
        }
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

// ---------- 복습 간격 (Leitner) ----------
const DAY_MS = 24 * 3600 * 1000;
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;

export function applyResult(stat, correctFirstTry, now = Date.now()) {
  const s = { b: 0, c: 0, w: 0, d: 0, s: 0, ...(stat || {}) };
  s.s = now;
  if (correctFirstTry) {
    s.c++;
    s.b = Math.min(s.b + 1, MAX_BOX);
    s.d = now + BOX_INTERVAL_DAYS[s.b] * DAY_MS;
  } else {
    s.w++;
    s.b = 0;
    s.d = now; // 다음 학습 때 바로 다시 나옴
  }
  return s;
}

// 학습할 단어 고르기: 복습 시점이 된 단어 > 많이 틀린 단어 > 낮은 단계 순으로 가중치
export function pickWords(words, stats, size, mode, now = Date.now(), rand = Math.random) {
  let pool = words;
  if (mode === 'wrong') pool = words.filter(w => stats[w.id] && stats[w.id].w > 0 && stats[w.id].b < 3);
  if (mode === 'order') return pool.slice(0, size);
  const scored = pool.map(w => {
    const s = stats[w.id];
    let score;
    if (!s) score = 600 + rand() * 200; // 새 단어
    else {
      const due = s.d <= now;
      const wrongRate = s.w / Math.max(1, s.c + s.w);
      score = (due ? 1000 : 0) + s.w * 40 + wrongRate * 200 + (MAX_BOX - s.b) * 25 + rand() * 120;
      if (!due) score -= Math.min(500, (s.d - now) / DAY_MS * 20);
    }
    return { w, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, size).map(x => x.w);
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
