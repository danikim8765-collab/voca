import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToWords, applyResult, questionKind, willGraduate, choicesFirst, myNewQuota, mergeProgress, pickReview, isDue, buildPlan, GRAD_BOOK, GRAD_MY, addDays } from '../js/core.js';
import { parseMyText, matchRows, applyImport, myWordObjects, overlayHit, mergeMy, sameMy, slimMy, exportMyCSV, deleteMy, emptyMy, MY_HEADER, MY_COLS, CLAUDE_PROMPT, myId } from '../js/mywords.js';

const BOOK = rowsToWords([{ name: 'b.csv', text: `DAY,단어,뜻,파생어,예문,예문해석,예문2
26,fatal,"치명적인, 결정적인","fatality 명 1. 사망자(수) / fatally 부 치명적으로",The fatal accident was caused by fog.,그 치명적인 사고는 안개 때문이었다.,It was a fatal mistake.
31,study,"공부하다, 연구하다",-,I study every day.,나는 매일 공부한다.,She studied hard.
32,give up,포기하다,-,Never give up your dream.,꿈을 절대 포기하지 마.,He gave up smoking.
` }]);

const FILE = `\`\`\`csv
${MY_HEADER}
${MY_COLS.join(',')}
2026-12-28,study,studied,연구하다,동,"Scientists have studied the effects of sleep, they say.",과학자들은 수면의 영향을 연구해 왔다.,She studies art.,그녀는 미술을 연구한다.,고2 11월 모의 31번
2026.12.28,ubiquitous,,어디에나 있는,형,Smartphones are ubiquitous today.,스마트폰은 오늘날 어디에나 있다.,Coffee shops are ubiquitous.,커피숍은 어디에나 있다.,
2026-12-28,fatality,fatalities,사망자,명,Road fatalities fell last year.,작년에 도로 사망자가 줄었다.,,,
2026-12-28,gave up,,포기하다,동,He gave up the plan.,그는 그 계획을 포기했다.,,,
,,,,,,,,,
2026-12-28,멋진,,멋진,,,,,,
\`\`\`
`;

test('부탁 문구에 형식이 다 들어 있음', () => {
  assert.ok(CLAUDE_PROMPT.includes(MY_HEADER));
  assert.ok(CLAUDE_PROMPT.includes(MY_COLS.join(',')));
});

test('내 단어 글 읽기: 코드 블록째, 날짜 모양, 빈 줄·한글 단어는 걸러 냄', () => {
  const { rows, bad } = parseMyText(FILE, { today: '2026-12-30' });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.word), ['study', 'ubiquitous', 'fatality', 'gave up']);
  assert.equal(rows[0].form, 'studied');
  assert.equal(rows[0].ex, 'Scientists have studied the effects of sleep, they say.');
  assert.equal(rows[0].src, '고2 11월 모의 31번');
  assert.equal(rows[0].ex2, 'She studies art.');
  assert.equal(rows[1].date, '2026-12-28');
  assert.equal(bad.length, 1);
  assert.match(bad[0].why, /영어/);
});

test('머리글 없이 · 탭으로 나눈 글도 읽음', () => {
  const t = parseMyText('2026-12-01\tabundant\t\t풍부한\t형\tFood was abundant.\t음식이 풍부했다.\t\t\t', { today: 'x' });
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].word, 'abundant');
  assert.equal(t.rows[0].ex, 'Food was abundant.');
  const c = parseMyText('2026-12-01,abundant,,풍부한,형,Food was abundant.,음식이 풍부했다.,,,', { today: 'x' });
  assert.equal(c.rows[0].meaning, '풍부한');
});

test('단어책과 맞춰 보기: 원형·변화형은 단어책, 파생어는 표시만, 나머지는 새 단어', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const m = matchRows(rows, BOOK);
  assert.deepEqual(m.map(x => x.act), ['book', 'new', 'deriv', 'book']);
  assert.equal(m[0].target, '31|study');
  assert.equal(m[2].of, '26|fatal');
  assert.equal(m[3].target, '32|give up'); // gave up → give up
  assert.deepEqual(m[0].opts, ['book', 'new']);
});

test('저장: 새 단어·독해 표시, 같은 파일을 또 올리면 바뀌는 것 없음', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const r1 = applyImport(emptyMy(), matchRows(rows, BOOK), { now: 1000 });
  assert.deepEqual(r1.newMy.sort(), ['my|fatality', 'my|ubiquitous']);
  assert.deepEqual(r1.hitBook.sort(), ['31|study', '32|give up']);
  assert.equal(r1.store.hit['31|study'].n, 1);
  assert.equal(r1.store.my.fatality.of, '26|fatal');
  const again = matchRows(rows, BOOK, r1.store);
  assert.ok(again.every(x => x.act === 'skip'));
  const r2 = applyImport(r1.store, again, { now: 2000 });
  assert.deepEqual([r2.newMy, r2.hitMy, r2.hitBook], [[], [], []]);
});

test('같은 단어를 다른 문장에서 또 적으면 처음부터 다시 (내 단어 · 단어책)', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const s1 = applyImport(emptyMy(), matchRows(rows, BOOK), { now: 1000 }).store;
  const more = parseMyText(`${MY_COLS.join(',')}\n2027-01-03,ubiquitous,,흔한,형,Plastic is ubiquitous in the ocean.,플라스틱은 바다 어디에나 있다.,,,\n2027-01-03,studies,,연구,명,His studies were long.,그의 연구는 길었다.,,,`, { today: '2027-01-03' }).rows;
  const m = matchRows(more, BOOK, s1);
  assert.deepEqual(m.map(x => x.act), ['my', 'book']);
  const r = applyImport(s1, m, { now: 3000 });
  assert.deepEqual(r.hitMy, ['my|ubiquitous']);
  assert.equal(r.store.my.ubiquitous.n, 2);
  assert.equal(r.store.my.ubiquitous.x[0].e, 'Plastic is ubiquitous in the ocean.');
  assert.equal(r.store.my.ubiquitous.m, '어디에나 있는'); // 뜻은 처음 것 그대로
  assert.equal(r.store.hit['31|study'].n, 2);
});

test('확인 화면에서 "새 단어로" 바꾸면 단어책과 따로 내 단어', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const m = matchRows(rows, BOOK);
  m[0].act = 'new';
  const r = applyImport(emptyMy(), m, { now: 1 });
  assert.ok(r.newMy.includes('my|study'));
  // 다음엔 단어책보다 내 단어로 먼저 맞춰짐
  const next = matchRows([{ ...rows[0], ex: 'They study ants.' }], BOOK, r.store);
  assert.equal(next[0].act, 'my');
});

test('내 단어 → 퀴즈 단어: 지문 문장이 예문 1, Claude 예문이 예문 2, 빈칸이 만들어짐', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const st = applyImport(emptyMy(), matchRows(rows, BOOK), { now: 1000 }).store;
  const ws = myWordObjects(st);
  const u = ws.find(w => w.word === 'ubiquitous');
  assert.equal(u.id, 'my|ubiquitous');
  assert.equal(u.day, 0);
  assert.equal(u.ex1, 'Smartphones are ubiquitous today.');
  assert.equal(u.ex1src, '독해');
  assert.equal(u.ex2, 'Coffee shops are ubiquitous.');
  const f = ws.find(w => w.word === 'fatality');
  assert.equal(f.blank, 'fatality'); // fatalities는 원형으로도 찾음
});

test('단어책 단어에 지문 문장을 붙이고, 다시 붙이면 원래 예문에서 새로', () => {
  const w = { ...BOOK.find(x => x.word === 'study') };
  overlayHit(w, { x: [{ e: 'Scientists have studied sleep.', ko: '과학자들은 잠을 연구해 왔다.', src: '모의 31' }] });
  assert.equal(w.ex2, 'Scientists have studied sleep.');
  assert.equal(w.ex2src, '독해 · 모의 31');
  overlayHit(w, null);
  assert.equal(w.ex2, 'She studied hard.');
});

test('동기화 합치기: 단어마다 더 최근 것, 지운 표시, 오래된 지운 표시는 버림', () => {
  const a = { v: 1, my: { x: { w: 'x', u: 5 }, y: { w: 'y', u: 1 } }, hit: {}, round: null };
  const b = { v: 1, my: { x: { w: 'x2', u: 3 }, y: { del: 1, u: 2 }, z: { del: 1, u: 1 } }, hit: { '1|a': { n: 1, u: 1 } }, round: { n: 2, at: 9 } };
  const m = mergeMy(a, b, { pruneBefore: 1.5 });
  assert.equal(m.my.x.w, 'x');
  assert.ok(m.my.y.del);
  assert.ok(!m.my.z);
  assert.equal(m.hit['1|a'].n, 1);
  assert.equal(m.round.n, 2);
  assert.ok(sameMy(m, mergeMy(m, a)));
  assert.ok(!sameMy(m, a));
  const d = deleteMy(m, 'x', 10);
  assert.ok(d.my.x.del && !myWordObjects(d).some(w => w.word === 'x'));
});

test('졸업한 내 단어는 가볍게, 내보내기는 다시 올릴 수 있는 형식', () => {
  const { rows } = parseMyText(FILE, { today: '2026-12-30' });
  const st = applyImport(emptyMy(), matchRows(rows, BOOK), { now: 1000 }).store;
  const slim = slimMy(st, id => id === 'my|ubiquitous');
  assert.ok(!slim.my.ubiquitous.e2);
  assert.ok(slim.my.fatality === st.my.fatality);
  const csv = exportMyCSV(st);
  assert.ok(csv.startsWith(MY_HEADER));
  const back = parseMyText(csv, { today: 'x' }).rows;
  assert.equal(back.length, 4);
  assert.ok(matchRows(back, BOOK, st).every(x => x.act === 'skip'));
});

// ---------- 졸업 · 문제 방식 · 상한 (core.js) ----------
const OK = (s, today, o = {}) => applyResult(s, 'ok', { today, now: Date.parse(today + 'T12:00:00'), ...o });

test('졸업: 암기 완료 뒤 졸업 간격 이상인 복습을 맞히면 졸업, 복습에 안 나옴', () => {
  let s = { st: 4, due: '2027-01-15', s: Date.parse('2027-01-01T12:00:00'), c: 4, w: 0, f: '2026-12-01' };
  // 14일 간격 → 맞히면 28일 간격 (단어책 졸업은 28일 간격을 맞혔을 때)
  assert.equal(willGraduate(s, { grad: GRAD_BOOK, today: '2027-01-15' }), false);
  s = OK(s, '2027-01-15', { grad: GRAD_BOOK });
  assert.equal(s.iv, 28);
  assert.equal(willGraduate(s, { grad: GRAD_BOOK, today: s.due }), true);
  assert.equal(willGraduate(s, { grad: GRAD_MY, today: s.due }), false);
  const g = OK(s, s.due, { grad: GRAD_BOOK });
  assert.ok(g.g);
  assert.equal(g.due, '');
  assert.equal(isDue(g, '2030-01-01'), false);
  assert.deepEqual(pickReview([{ id: 'a' }], { a: g }, { today: '2030-01-01', n: 5, again: true }), []);
  // 내 단어는 56일까지 가야 졸업
  const m = OK(s, s.due, { grad: GRAD_MY });
  assert.ok(!m.g);
  assert.equal(m.iv, 56);
});

test('졸업한 단어: 맞히면 그대로, 틀리면 졸업이 풀리고 처음부터', () => {
  const g = { st: 4, g: '2027-03-01', due: '', s: 1, c: 6, w: 0, f: '2026-12-01' };
  assert.ok(applyResult(g, 'ok', { today: '2027-04-01', scheduled: true }).g);
  const w = applyResult(g, 'wrong', { today: '2027-04-01' });
  assert.ok(!w.g);
  assert.equal(w.st, 0);
  assert.equal(w.due, '2027-04-02');
});

test('문제 방식: 직접 입력을 한 번에 맞히면 다음부터 4지선다, 틀리면 맞힐 때까지 직접 입력', () => {
  const mix = { mix: true };
  let s = applyResult(null, 'ok', { today: '2027-01-01', kind: 'type' });
  assert.equal(s.q, 1);
  assert.equal(questionKind('type', s, mix), 'choice');
  s = applyResult(s, 'wrong', { today: '2027-01-02', kind: 'choice' });
  assert.equal(questionKind('type', s, mix), 'type');
  s = applyResult(s, 'hint', { today: '2027-01-03', kind: 'type' });
  assert.equal(questionKind('type', s, mix), 'type');
  // 다시 나와서 맞힌 건 '한 번에'가 아님
  assert.equal(applyResult(s, 'ok', { today: '2027-01-03', kind: 'type', retry: true }).q, 0);
  s = applyResult(s, 'ok', { today: '2027-01-04', kind: 'type' });
  assert.equal(questionKind('type', s, mix), 'choice');
  // 4지선다로 처음 배운 단어는 첫 복습이 직접 입력
  assert.equal(questionKind('choice', applyResult(null, 'ok', { today: '2027-01-01', kind: 'choice' }), mix), 'type');
  // 졸업이 걸린 문제는 직접 입력
  assert.equal(questionKind('type', { st: 4, q: 1 }, { mix: true, final: true }), 'type');
  // 예전 기록(q 없음)은 예전 규칙
  assert.equal(questionKind('type', { st: 3 }, mix), 'choice');
  assert.equal(questionKind('type', { st: 2 }, mix), 'type');
});

test('복습 묶음은 4지선다 먼저', () => {
  const k = { a: 'type', b: 'choice', c: 'type', d: 'choice' };
  assert.deepEqual(choicesFirst(['a', 'b', 'c', 'd'], id => k[id]), ['b', 'd', 'a', 'c']);
});

test('복습 100 지키기: 복습이 많으면 새 내 단어를 줄이되 하루 5개는 넣음', () => {
  assert.equal(myNewQuota({ perDay: 20, cap: 100, peak: 30 }), 20);
  assert.equal(myNewQuota({ perDay: 20, cap: 100, peak: 70 }), 10);
  assert.equal(myNewQuota({ perDay: 20, cap: 100, peak: 120 }), 5);
  assert.equal(myNewQuota({ perDay: 3, cap: 100, peak: 120 }), 3);
});

test('단어책 새로 시작: 단어책 기록만 버리고 내 단어는 그대로 (기기끼리도)', () => {
  const a = { resetAt: 0, bookResetAt: 500, stats: { '31|study': { st: 1, s: 900, due: 'x' } } };
  const b = { resetAt: 0, stats: { '26|fatal': { st: 4, s: 100 }, 'my|ubiquitous': { st: 2, s: 100 } } };
  const m = mergeProgress(a, b);
  assert.equal(m.bookResetAt, 500);
  assert.deepEqual(Object.keys(m.stats).sort(), ['31|study', 'my|ubiquitous']);
  // 오래된 지운 표시는 동기화할 때 버림
  assert.deepEqual(Object.keys(mergeProgress({ stats: { a: { del: 1, s: 5 } } }, {}, { pruneBefore: 10 }).stats), []);
});

test('오늘의 학습: 오늘 배운 수를 따로 주면(내 단어 빼고) 단어책 몫은 그대로', () => {
  const ws = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const today = '2027-01-01';
  const stats = { 'my|x': { f: today, st: 1 }, 'my|y': { f: today, st: 1 } };
  assert.equal(buildPlan(ws, ws, stats, { today, newPerDay: 2 }).fresh.length, 0);
  assert.equal(buildPlan(ws, ws, stats, { today, newPerDay: 2, newToday: 0 }).fresh.length, 2);
  assert.equal(addDays(today, 1), '2027-01-02');
});
