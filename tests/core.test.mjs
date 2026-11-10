import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, mapColumns, rowsToWords, answerParts, makeBlanks, isTypedCorrect, splitSentence, applyResult, buildPlan, pickReview, normalizeStat, addDays, daysBetween, pickDistractors, displayAnswer } from '../js/core.js';

const show = r => r.segs.map(s => (s.t === 'blank' ? `[${s.v}]` : s.v)).join('');

test('CSV: BOM, 따옴표, 줄바꿈', () => {
  const rows = parseCSV('﻿DAY,단어,예문\r\n26,"a, b","He said ""hi""\nok"\r\n');
  assert.deepEqual(rows, [['DAY', '단어', '예문'], ['26', 'a, b', 'He said "hi"\nok']]);
});

test('컬럼 매핑', () => {
  const { map } = mapColumns(['DAY', '단어', '뜻', '예문', '예문 해석', '예문2', '예문2 해석', '빈칸형태']);
  assert.deepEqual(map, { day: 0, word: 1, meaning: 2, ex1: 3, ex1ko: 4, ex2: 5, ex2ko: 6, blank: 7 });
});

test('갈라지는 숙어 분리', () => {
  assert.deepEqual(answerParts('convince A of B'), ['convince', 'of']);
  assert.deepEqual(answerParts('convinced ~ of'), ['convinced', 'of']);
  assert.deepEqual(answerParts('convinced … of'), ['convinced', 'of']);
  assert.deepEqual(answerParts('make up one’s mind'), ['make up', 'mind']);
  assert.deepEqual(answerParts('put off'), ['put off']);
  assert.deepEqual(answerParts('a lot of'), ['a lot of']);
  assert.deepEqual(answerParts('prevent A from -ing'.replace('-ing', 'V-ing')), ['prevent', 'from']);
});

test('빈칸: 갈라진 숙어', () => {
  const r = makeBlanks('She convinced the jury of his innocence.', 'convinced ~ of');
  assert.equal(show(r), 'She [convinced] the jury [of] his innocence.');
  const r2 = makeBlanks('I tried to convince him of the danger.', 'convince A of B');
  assert.equal(show(r2), 'I tried to [convince] him [of] the danger.');
  // of가 앞에 먼저 나와도 convince 뒤의 of를 가린다
  const r3 = makeBlanks('Most of us convinced her of it.', 'convinced A of B');
  assert.equal(show(r3), 'Most of us [convinced] her [of] it.');
});

test('빈칸: 어형 변화 / be동사 / 대소문자', () => {
  assert.equal(show(makeBlanks('He was convinced of it.', 'be convinced of')), 'He [was] [convinced] [of] it.');
  assert.equal(show(makeBlanks('Convincing people is hard.', 'convince')), '[Convincing] people is hard.');
  assert.equal(show(makeBlanks('She made up her mind.', "make up one's mind")), 'She [made] [up] her [mind].');
});

test('빈칸: 단어 반복, 단어 일부와 혼동하지 않기', () => {
  assert.equal(show(makeBlanks('Give up? Never give up.', 'give up')), '[Give] [up]? Never [give] [up].');
  assert.equal(show(makeBlanks('The other mother.', 'other')), 'The [other] mother.');
});

test('빈칸: 이미 뚫린 빈칸', () => {
  const r = makeBlanks('She ____ the jury ____ his innocence.', 'convinced ~ of');
  assert.equal(show(r), 'She [convinced] the jury [of] his innocence.');
});

test('정답 입력 비교', () => {
  const w = { blank: 'convinced ~ of' };
  const b = makeBlanks('She convinced the jury of it.', w.blank).blanks;
  assert.ok(isTypedCorrect('Convinced of', w, b, []));
  assert.ok(isTypedCorrect('convinced ... of', w, b, []));
  assert.ok(!isTypedCorrect('convince of', w, b, []));
});

test('예문+해석 한 칸 분리', () => {
  assert.deepEqual(splitSentence('I love it. 나는 그게 좋다.'), { en: 'I love it.', ko: '나는 그게 좋다.' });
  assert.deepEqual(splitSentence('I love it.\n나는 그게 좋다.'), { en: 'I love it.', ko: '나는 그게 좋다.' });
});

test('rowsToWords: 빈 DAY 이어받기, 중복 제거', () => {
  const csv = 'Day,단어,뜻,예문,예문2,빈칸형태\nDAY 26,convince,설득하다,"She convinced him of it.",We convinced them of it.,convinced ~ of\n,give up,포기하다,Never give up.,Don\'t give up.,give up\n';
  const ws = rowsToWords([{ name: 'a', text: csv }]);
  assert.equal(ws.length, 2);
  assert.equal(ws[1].day, 26);
});

test('간격 반복: 단계와 다음 복습일', () => {
  const T = '2026-11-02';
  let s = applyResult(undefined, 'ok', { today: T });
  assert.deepEqual([s.st, s.due, s.f], [1, '2026-11-03', T]);           // 1단계 → 1일
  s = applyResult(s, 'ok', { today: '2026-11-03' });
  assert.deepEqual([s.st, s.due], [2, '2026-11-06']);                   // 2단계 → 3일
  s = applyResult(s, 'ok', { today: '2026-11-06' });
  assert.deepEqual([s.st, s.due], [3, '2026-11-13']);                   // 3단계 → 7일
  s = applyResult(s, 'ok', { today: '2026-11-13' });
  assert.deepEqual([s.st, s.due], [4, '2026-11-27']);                   // 4단계 → 14일
  s = applyResult(s, 'ok', { today: '2026-11-27' });
  assert.deepEqual([s.st, s.due], [4, '2026-12-11']);                   // 최대 4단계
  s = applyResult(s, 'hint', { today: '2026-12-11' });
  assert.deepEqual([s.st, s.due], [4, '2026-12-12']);                   // 힌트: 단계 그대로, 내일
  s = applyResult(s, 'wrong', { today: '2026-12-12' });
  assert.deepEqual([s.st, s.due, s.w], [0, '2026-12-13', 1]);           // 틀림: 0단계, 내일
  const before = { ...s };
  s = applyResult(s, 'ok', { today: '2026-12-12', scheduled: false });  // 복습일 아닌 연습: 일정 그대로
  assert.deepEqual([s.st, s.due, s.c], [before.st, before.due, before.c + 1]);
});

test('시험일: 다음 복습일이 시험 전날을 넘지 않음', () => {
  const s = applyResult({ st: 3, due: '2026-11-10', c: 3, w: 0 }, 'ok', { today: '2026-11-10', exam: '2026-11-15' });
  assert.deepEqual([s.st, s.due], [4, '2026-11-14']);
});

test('예전 기록 변환: 진도 유지', () => {
  const old = { b: 6, c: 9, w: 2, d: new Date(2026, 10, 20, 15).getTime(), s: 123 };
  const n = normalizeStat(old);
  assert.deepEqual([n.c, n.w, n.s, n.st, n.due], [9, 2, 123, 4, '2026-11-20']);
  assert.notEqual(applyResult(n, 'ok', { today: '2026-11-20' }).f, '2026-11-20'); // 예전 단어는 오늘의 새 단어로 안 셈
  assert.equal(normalizeStat({ b: 0, c: 0, w: 1, d: new Date(2026, 10, 1).getTime(), s: 1 }).st, 0);
});

test('오늘의 학습: 새 단어는 하루 개수만큼 (복습일 된 단어는 따로 돌려줌)', () => {
  const T = '2026-11-02';
  const words = Array.from({ length: 30 }, (_, i) => ({ id: 'w' + i, day: 1 + Math.floor(i / 10) }));
  const stats = {
    w0: { st: 2, due: '2026-11-01', c: 2, w: 0, s: 1, f: '2026-10-20' },
    w1: { st: 0, due: T, c: 0, w: 1, s: 2, f: '2026-10-20' },
    w2: { st: 3, due: '2026-11-09', c: 3, w: 0, s: 3, f: '2026-10-20' },
    w3: { st: 1, due: '2026-11-03', c: 1, w: 0, s: 4, f: T }, // 오늘 배운 새 단어 1개
  };
  const plan = buildPlan(words, words.slice(0, 20), stats, { today: T, newPerDay: 5 });
  assert.deepEqual(plan.review.map(w => w.id), ['w0', 'w1']);
  assert.deepEqual(plan.fresh.map(w => w.id), ['w4', 'w5', 'w6', 'w7']); // 5 - 오늘 이미 1개
  assert.deepEqual(plan.final, []);
});

test('시험 3일 전부터 범위 전체를 3일에 나눠 한 번씩', () => {
  const exam = '2026-11-20';
  const words = Array.from({ length: 9 }, (_, i) => ({ id: 'w' + i, day: 1 }));
  const old = new Date(2026, 9, 1).getTime();
  const stats = Object.fromEntries(words.map(w => [w.id, { st: 4, due: '2026-12-31', c: 4, w: 0, s: old, f: '2026-10-01' }]));
  const d3 = buildPlan(words, words, stats, { today: addDays(exam, -3), exam, newPerDay: 0 });
  assert.deepEqual(d3.final.map(w => w.id), ['w0', 'w1', 'w2']);
  assert.equal(d3.examInfo.finalDay, 1);
  // 첫날 몫을 안 했으면 둘째 날에 같이
  const d2 = buildPlan(words, words, stats, { today: addDays(exam, -2), exam, newPerDay: 0 });
  assert.deepEqual(d2.final.map(w => w.id), ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']);
  // 시험 기간에 이미 본 단어는 빼고
  const seen = { ...stats, w0: { ...stats.w0, s: new Date(2026, 10, 17, 9).getTime() } };
  const d2b = buildPlan(words, words, seen, { today: addDays(exam, -2), exam, newPerDay: 0 });
  assert.ok(!d2b.final.some(w => w.id === 'w0'));
  assert.equal(daysBetween('2026-11-17', exam), 3);
});

test('해석에서 뜻 부분 강조', async () => {
  const { highlightMeaning } = await import('../js/core.js');
  const hl = (ko, m) => highlightMeaning(ko, m).map(s => (s.t === 'mark' ? `[${s.v}]` : s.v)).join('');
  assert.equal(hl('그녀는 배심원단에게 그의 결백을 확신시켰다.', 'A에게 B를 확신시키다'), '그녀는 배심원단에게 그의 결백을 [확신시켰다].');
  assert.equal(hl('절대 꿈을 포기하지 마.', '포기하다'), '절대 꿈을 [포기하지] 마.');
  assert.equal(hl('그들은 차를 버려야 했다.', '버리다'), '그들은 차를 [버려야] 했다.');
  assert.equal(hl('부모님을 당연하게 여기지 마.', 'A를 당연하게 여기다'), '부모님을 [당연하게 여기지] 마.');
  assert.equal(hl('비 때문에 나가는 것을 막았다.', 'A가 B하는 것을 막다'), '비 때문에 나가는 것을 [막았다].');
  assert.equal(hl('나한테 의지해도 돼.', '~에 의존하다'), '나한테 의지해도 돼.');
  assert.equal(hl('그들은 지연을 악천후 탓으로 돌렸다.', 'A를 B의 탓으로 돌리다'), '그들은 지연을 악천후 [탓으로 돌렸다].');
});

test('실제 데이터에서 놓쳤던 형태', () => {
  assert.equal(show(makeBlanks('He got upset and flung his papers.', 'fling')), 'He got upset and [flung] his papers.');
  assert.equal(show(makeBlanks('He strode confidently into the room.', 'stride')), 'He [strode] confidently into the room.');
  assert.equal(show(makeBlanks('Nonverbal cues are better than verbal cues.', 'cue')), 'Nonverbal [cues] are better than verbal [cues].');
  assert.equal(show(makeBlanks('They are cutting off projects.', 'cut off')), 'They are [cutting] [off] projects.');
  assert.equal(show(makeBlanks('He did not want to let his son down.', 'let down')), 'He did not want to [let] his son [down].');
  assert.equal(show(makeBlanks('Talent to carry this off. / He carried off the prize.', 'carry off')), 'Talent to [carry] this [off]. / He [carried] [off] the prize.');
  assert.equal(show(makeBlanks('Convince me of it. / We convinced them of it.', 'convince A of B')), '[Convince] me [of] it. / We [convinced] them [of] it.');
  assert.equal(show(makeBlanks('She altered the alternative plan.', 'alter')), 'She [altered] the alternative plan.');
  assert.equal(show(makeBlanks('The sign was swaying. He preoccupied himself.', 'sway')), 'The sign was [swaying]. He preoccupied himself.');
  assert.equal(show(makeBlanks('He studied hard.', 'study')), 'He [studied] hard.');
  assert.equal(show(makeBlanks('They stopped it.', 'stop')), 'They [stopped] it.');
});

test('출처 태그 분리', async () => {
  const { splitSource } = await import('../js/core.js');
  assert.deepEqual(splitSource('He is right. [수능응용]'), ['He is right.', '수능응용']);
  assert.deepEqual(splitSource('He is right.'), ['He is right.', '']);
});

test('진도 합치기: 단어별 최신 기록, 초기화 반영', async () => {
  const { mergeProgress, sameStats } = await import('../js/core.js');
  const phone = { resetAt: 0, stats: { a: { b: 2, c: 2, w: 0, d: 9, s: 100 }, b: { b: 0, c: 0, w: 1, d: 5, s: 300 } } };
  const ipad = { resetAt: 0, stats: { a: { b: 3, c: 3, w: 0, d: 20, s: 200 }, c: { b: 1, c: 1, w: 0, d: 7, s: 50 } } };
  const m = mergeProgress(phone, ipad);
  assert.equal(m.stats.a.s, 200);
  assert.equal(m.stats.b.s, 300);
  assert.equal(m.stats.c.s, 50);
  assert.ok(sameStats(m.stats, mergeProgress(ipad, phone).stats));
  const reset = mergeProgress({ resetAt: 250, stats: {} }, m);
  assert.deepEqual(Object.keys(reset.stats), ['b']);
  assert.ok(!sameStats(m.stats, reset.stats));
});

test('직접 입력 글자 힌트', async () => {
  const { nextLetterHint: h, typingHintTarget } = await import('../js/core.js');
  const t = 'convinced of';
  assert.equal(h('', t), 'co');                 // 비어 있으면 처음 두 글자
  assert.equal(h('co', t), 'conv');             // 맞게 쓴 데서 두 글자 더
  assert.equal(h('Conv', t), 'convin');         // 대소문자 무시
  assert.equal(h('convxyz', t), 'convin');      // 틀린 부분은 버리고 맞는 데서부터
  assert.equal(h('abc', t), 'co');              // 처음부터 틀리면 처음 두 글자
  assert.equal(h('convinc', t), 'convinced ');  // 단어 끝나면 띄어쓰기까지
  assert.equal(h('convinced ', t), 'convinced o'); // 두 글자 남으면 한 글자만
  assert.equal(h('convinced o', t), null);      // 마지막 글자는 직접
  assert.equal(h('convinced ox', t), 'convinced o'); // 그래도 틀린 부분은 지워줌
  assert.equal(h('', 'of'), 'o');
  assert.equal(typingHintTarget({ blank: 'cue' }, ['cues', 'cues'], []), 'cues');
  assert.equal(typingHintTarget({ blank: 'convince A of B' }, ['Convince', 'of'], []), 'convince of');
});

test('version.txt와 앱 버전이 같아야 함 (다르면 앱이 계속 새로고침)', async () => {
  const fs = await import('node:fs');
  const ver = fs.readFileSync(new URL('../version.txt', import.meta.url), 'utf8').trim();
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.equal(app.match(/const APP_VERSION = '([^']+)'/)[1], ver);
});

test('직접 지정한 해석 강조어', async () => {
  const { highlightMeaning } = await import('../js/core.js');
  const hl = (ko, m, mark) => highlightMeaning(ko, m, mark).map(s => (s.t === 'mark' ? `[${s.v}]` : s.v)).join('');
  assert.equal(hl('모닥불에서 열기가 발산되어 주위에', '내뿜다, 방출하다', '발산되어'), '모닥불에서 열기가 [발산되어] 주위에');
  assert.equal(hl('절대 꿈을 포기하지 마.', '포기하다', '없는말'), '절대 꿈을 [포기하지] 마.'); // 없으면 자동 찾기
});

test('불규칙 동사: 겹치는 형태, 접두사 붙은 동사', () => {
  assert.equal(show(makeBlanks("He'd laid by enough money.", 'lay by')), "He'd [laid] [by] enough money.");
  assert.equal(show(makeBlanks('The rain lay on the ground.', 'lie')), 'The rain [lay] on the ground.');
  assert.equal(show(makeBlanks('The project overran its budget.', 'overrun')), 'The project [overran] its budget.');
  assert.equal(show(makeBlanks('She was misled by the ad.', 'mislead')), 'She was [misled] by the ad.');
});

test('단어 모드: 뜻 채점 (느슨 하나 · 보통 갈래마다 · 엄격 전부)', async () => {
  const { gradeMeaning } = await import('../js/core.js');
  const fatal = '1. 치명적인 2. 결정적인, 중대한';
  assert.equal(gradeMeaning('치명적인', fatal, 'easy').score, 2);    // 느슨: 하나만 맞아도
  assert.equal(gradeMeaning('중대한', fatal, 'easy').score, 2);
  assert.equal(gradeMeaning('치명적', fatal, 'mid').score, 1);       // 보통: 갈래마다 하나씩
  assert.equal(gradeMeaning('치명적, 중대한', fatal, 'mid').score, 2);
  assert.equal(gradeMeaning('치명적인, 결정적인', fatal, 'hard').score, 1); // 엄격: 낱말 전부
  assert.equal(gradeMeaning('치명적인 결정적인 중대한', fatal, 'hard').score, 2);
  assert.equal(gradeMeaning('치명적인, 결정적인', fatal, 'hard').missing, 1);
  assert.equal(gradeMeaning('행복한', fatal, 'mid').score, 0);
  const premium = '보험료 / 고급의 / 할증금';
  assert.equal(gradeMeaning('보험료', premium, 'easy').score, 2);
  assert.equal(gradeMeaning('보험료 고급', premium, 'mid').score, 1);
  assert.equal(gradeMeaning('보험료 고급 할증금', premium, 'mid').score, 2);
  assert.equal(gradeMeaning('', fatal, 'easy').score, 0);
});

test('단어 모드: 뜻 보기는 정답·서로와 겹치지 않게', async () => {
  const { pickMeaningDistractors, meaningsClash } = await import('../js/core.js');
  const t = { word: 'fatal', meaning: '1. 치명적인 2. 결정적인' };
  const all = [t, { word: 'lethal', meaning: '치명적인' }, { word: 'a', meaning: '행복한' }, { word: 'b', meaning: '슬픈' },
    { word: 'c', meaning: '빠른' }, { word: 'd', meaning: '빠른, 신속한' }];
  const out = pickMeaningDistractors(t, all, 3, () => 0.5);
  assert.equal(out.length, 3);
  assert.ok(!out.some(w => w.word === 'lethal' || w.word === 'fatal'));
  assert.ok(!out.some((x, i) => out.some((y, j) => i !== j && meaningsClash(x.meaning, y.meaning))));
});

test('오늘의 복습: 복습일 된 단어 먼저, 나머지는 약한 단어부터, 오늘 배우거나 본 단어는 빼고', () => {
  const T = '2026-11-02';
  const now = new Date(2026, 10, 2, 9).getTime();
  const old = new Date(2026, 9, 20).getTime();
  const words = Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, day: 1 }));
  const stats = {
    w0: { st: 3, due: '2026-11-09', c: 3, w: 0, s: old, f: '2026-10-01' },       // 안 밀림, 튼튼
    w1: { st: 1, due: T, c: 1, w: 0, s: old, f: '2026-10-01' },                  // 오늘 복습일
    w2: { st: 2, due: '2026-10-30', c: 2, w: 0, s: old, f: '2026-10-01' },       // 더 오래 밀림
    w3: { st: 1, due: '2026-11-04', c: 1, w: 3, s: old, f: '2026-10-01' },       // 안 밀림, 많이 틀림
    w4: { st: 1, due: '2026-11-04', c: 3, w: 0, s: old, f: '2026-10-01' },       // 안 밀림, 안 틀림
    w5: { st: 1, due: '2026-11-03', c: 1, w: 0, s: now, f: T },                  // 오늘 배운 새 단어
    w6: { st: 2, due: '2026-11-05', c: 2, w: 0, s: now, f: '2026-10-01' },       // 오늘 이미 봄
  };
  const ids = n => pickReview(words, stats, { today: T, n }).map(w => w.id);
  assert.deepEqual(ids(20), ['w2', 'w1', 'w3', 'w4', 'w0']);
  assert.deepEqual(ids(3), ['w2', 'w1', 'w3']);
  assert.deepEqual(ids(0), []);
});

test('시험 대비 몫에는 복습일이 된 단어도 들어감', () => {
  const exam = '2026-11-20';
  const today = addDays(exam, -3);
  const words = Array.from({ length: 3 }, (_, i) => ({ id: 'w' + i, day: 1 }));
  const old = new Date(2026, 9, 1).getTime();
  const stats = Object.fromEntries(words.map(w => [w.id, { st: 1, due: today, c: 1, w: 0, s: old, f: '2026-10-01' }]));
  const p = buildPlan(words, words, stats, { today, exam, newPerDay: 0 });
  assert.deepEqual(p.final.map(w => w.id), ['w0']);
  assert.equal(p.review.length, 3);
});

test('모름 표시: 기기끼리 더 최근에 바꾼 쪽으로', async () => {
  const { mergeMarks, sameMarks } = await import('../js/core.js');
  const a = { x: { on: 1, t: 5 }, y: { on: 1, t: 1 } };
  const b = { y: { on: 0, t: 3 }, z: { on: 1, t: 2 } };
  const m = mergeMarks(a, b);
  assert.deepEqual(m, { x: { on: 1, t: 5 }, y: { on: 0, t: 3 }, z: { on: 1, t: 2 } });
  assert.ok(sameMarks(m, mergeMarks(b, a)));
  assert.ok(!sameMarks(m, a));
});

test('유의어·반의어 골라내기', async () => {
  const { synAnt } = await import('../js/core.js');
  const r = synAnt([['유의어', 'preoccupy'], ['반의어', 'ignore'], ['파생어', 'obsession']]);
  assert.equal(r.syn, 'preoccupy');
  assert.equal(r.ant, 'ignore');
  assert.deepEqual(r.rest, [['파생어', 'obsession']]);
  assert.deepEqual(synAnt([]), { syn: '', ant: '', rest: [] });
});

test('직접 입력: 원형, 예문 형태, 단어장에 적힌 그대로 모두 정답', () => {
  const w = { word: 'outlaw', blank: 'outlaw' };
  assert.ok(isTypedCorrect('outlaw', w, ['outlawed'], ['outlawed']));
  assert.ok(isTypedCorrect('Outlawed', w, ['outlawed'], ['outlawed']));
  const p = { word: 'convince A of B', blank: 'convince A of B' };
  assert.ok(isTypedCorrect('convince of', p, ['convinced', 'of'], null));
  assert.ok(isTypedCorrect('convinced of', p, ['convinced', 'of'], null));
  assert.ok(isTypedCorrect('convince A of B', p, ['convinced', 'of'], null));
  assert.ok(!isTypedCorrect('outlawing', w, ['outlawed'], null));
});

test('숙어는 단어마다 칸, 반복된 숙어는 한 번만 써도 정답', async () => {
  const { blankUnit, typingHintTarget } = await import('../js/core.js');
  const b = makeBlanks('He took over the firm. They took over the city.', 'take over');
  assert.deepEqual(b.blanks, ['took', 'over', 'took', 'over']);
  assert.deepEqual(blankUnit(b.blanks), ['took', 'over']);
  assert.deepEqual(blankUnit(['cues', 'cues']), ['cues']);
  assert.deepEqual(blankUnit(['face', 'to', 'face']), ['face', 'to', 'face']);
  const w = { word: 'take over', blank: 'take over' };
  assert.equal(typingHintTarget(w, b.blanks, null), 'took over');
  assert.ok(isTypedCorrect('take over', w, b.blanks, null));
  assert.ok(isTypedCorrect('took over', w, b.blanks, null));
});

test('직접 입력 오답 풀이: 철자·형태(노랑) · 뜻이 통하는 말(초록) · 상관없는 말은 없음', async () => {
  const { coachFeedback, spellDiff, shortMeaning, sameSense } = await import('../js/core.js');
  const fatal = { id: 'f', word: 'fatal', blank: 'fatal', meaning: '1. 치명적인 2. 결정적인, 중대한',
    extras: [['유의어', 'deadly, lethal, mortal'], ['반의어', 'harmless'], ['파생어', 'fatality 명 1. 사망자(수) / fatally 부 치명적으로']] };
  const decisive = { id: 'd', word: 'decisive', meaning: '1. 결정적인 2. 결단력 있는' };
  const abide = { id: 'a', word: 'abide', meaning: '1. ((~ by)) (규칙 등을) 준수하다' };
  const opt = { cands: ['fatal'], find: t => (t === 'decisive' ? decisive : /^abid(e|es|ed|ing)$/.test(t) ? abide : null) };
  const k = s => { const f = coachFeedback(s, fatal, opt); return f && f.kind; };
  assert.equal(coachFeedback('fatal', fatal, opt), null);
  assert.equal(k('fatel'), 'spell');
  assert.equal(spellDiff('fatel', 'fatal').segs.map(x => x.t === 'ok' ? x.v : `[${x.v}]`).join(''), 'fat[e]l');
  assert.equal(spellDiff('fata', 'fatal').segs.map(x => x.v).join(''), 'fata_');
  assert.equal(k('fatals'), 'spell');
  assert.match(coachFeedback('fatality', fatal, opt).text, /명사/);
  assert.match(coachFeedback('deadly', fatal, opt).text, /뉘앙스/);
  assert.equal(k('deadly'), 'near');
  assert.match(coachFeedback('decisive', fatal, opt).text, /다른 단어는 없을까요\? 첫 글자는 'f'예요/);
  assert.equal(k('harmless'), null); // 반대말
  assert.equal(k('abide'), null);    // 상관없는 단어
  assert.equal(k('zzzz'), null);     // 모르는 말
  assert.ok(sameSense(fatal.meaning, decisive.meaning));
  assert.ok(!sameSense(fatal.meaning, abide.meaning));
  assert.equal(shortMeaning('((주로 수동태로)) 사로잡다, 집착하게 하다[집착하다]'), '사로잡다');
  assert.match(coachFeedback('deprive', { word: 'deprive A of B', blank: 'deprive A of B', meaning: '빼앗다', extras: [] }, { cands: ['deprive a of b', 'deprive of'] }).text, /빈칸이 2곳/);
});

test('앱 키보드: 키 사이 틈을 눌러도 가장 가까운 키', async () => {
  const { nearestKey } = await import('../js/core.js');
  const keys = [
    { ch: 'a', r: { left: 0, top: 0, right: 33, bottom: 46 } },
    { ch: 's', r: { left: 38, top: 0, right: 71, bottom: 46 } },
    { ch: 'z', r: { left: 19, top: 53, right: 52, bottom: 99 } },
  ];
  const at = (x, y) => nearestKey(keys, x, y)?.ch;
  assert.equal(at(10, 20), 'a'); // 키 안
  assert.equal(at(34, 20), 'a'); // 틈에서 a 쪽
  assert.equal(at(37, 20), 's'); // 틈에서 s 쪽
  assert.equal(at(30, 48), 'a'); // 줄 사이 틈에서 위쪽
  assert.equal(at(30, 52), 'z'); // 줄 사이 틈에서 아래쪽
  assert.equal(at(-10, 20), 'a'); // 가장자리 여백
  assert.equal(at(-100, 20), undefined); // 키보드 밖 멀리
});

test('주기 복습: 간격 프리셋, 목표일까지 맞춤, 목표일부터 범위 전부를 나눠서', async () => {
  const { PRESETS, pickSrsReview, retentionCurve } = await import('../js/core.js');
  // 보통은 기본 방식과 같은 간격
  let s = applyResult(null, 'ok', { today: '2026-11-01' });
  assert.deepEqual([s.st, s.due], [1, '2026-11-02']);
  s = applyResult(s, 'ok', { today: '2026-11-02' });
  assert.deepEqual([s.st, s.due], [2, '2026-11-05']);
  // 매우 짧게: 6단계, 1·1·2·3·5·8일
  let x = null; const days = [];
  let d = '2026-11-01';
  for (let i = 0; i < 7; i++) { x = applyResult(x, 'ok', { today: d, intervals: PRESETS.xs }); days.push(daysBetween(d, x.due)); d = x.due; }
  assert.deepEqual(days, [1, 1, 2, 3, 5, 8, 8]);
  assert.equal(x.st, 6);
  // 목표일 전날을 넘지 않게
  const capped = applyResult({ st: 3, due: '2026-11-01', c: 3, w: 0, s: 1, f: '2026-10-01' }, 'ok', { today: '2026-11-01', exam: '2026-11-05', intervals: PRESETS.m });
  assert.equal(capped.due, '2026-11-04');

  const words = Array.from({ length: 10 }, (_, i) => ({ id: 'w' + i, day: 1 }));
  const old = new Date(2026, 9, 1).getTime();
  const stats = { w0: { st: 1, due: '2026-11-02', c: 1, w: 0, s: old, f: '2026-10-01' }, w1: { st: 2, due: '2026-11-03', c: 1, w: 0, s: old, f: '2026-10-01' }, w2: { st: 2, due: '2026-11-20', c: 1, w: 0, s: old, f: '2026-10-01' } };
  const opt = { goal: '2026-11-10', exam: '2026-11-15' };
  // 목표일 전: 복습일 된 단어만, 제한
  assert.deepEqual(pickSrsReview(words, words, stats, { ...opt, today: '2026-11-03' }).words.map(w => w.id), ['w0', 'w1']);
  assert.deepEqual(pickSrsReview(words, words, stats, { ...opt, today: '2026-11-03', limit: 1 }).words.map(w => w.id), ['w0']);
  // 목표일부터: 10단어를 5일에 나눠 하루 2개 (+ 복습일 된 단어)
  const f0 = pickSrsReview(words, words, stats, { ...opt, today: '2026-11-10' });
  assert.equal(f0.phase, 'final');
  assert.deepEqual(f0.words.map(w => w.id), ['w0', 'w1']);
  // 첫날 몫을 안 했으면 둘째 날에 같이
  assert.deepEqual(pickSrsReview(words, words, stats, { ...opt, today: '2026-11-11' }).words.map(w => w.id), ['w0', 'w1', 'w2', 'w3']);
  // 시험일부터는 복습일 된 단어만
  assert.equal(pickSrsReview(words, words, stats, { ...opt, today: '2026-11-15' }).phase, 'after');
  // 목표일부터 시험 전날까진 새 단어 없음
  assert.deepEqual(buildPlan(words, words, {}, { today: '2026-11-12', newPerDay: 5, srs: opt }).fresh, []);
  assert.equal(buildPlan(words, words, {}, { today: '2026-11-03', newPerDay: 5, srs: opt }).fresh.length, 5);
  // 그래프: 복습할수록 덜 떨어짐, 안 하면 거의 0
  const c = retentionCurve(PRESETS.m);
  assert.deepEqual(c.reviews, [1, 4, 11, 25]);
  assert.ok(c.none[c.none.length - 1][1] < 0.01);
  assert.ok(c.before[3][1] > c.before[0][1]);
});

test('지운 기록은 동기화해도 되살아나지 않고, 다시 풀면 새 기록이 이김', async () => {
  const { mergeProgress } = await import('../js/core.js');
  const old = { st: 2, due: '2026-11-05', c: 2, w: 1, s: 100, f: '2026-11-01' };
  const m1 = mergeProgress({ stats: { a: { del: 1, s: 200 } } }, { stats: { a: old } });
  assert.deepEqual(m1.stats.a, { del: 1, s: 200 });
  const again = { st: 1, due: '2026-11-06', c: 1, w: 0, s: 300, f: '2026-11-05' };
  assert.equal(mergeProgress({ stats: { a: again } }, m1).stats.a.s, 300);
});

test('추가 복습: 안 본 단어 먼저, 다 봤으면 오늘 본·배운 단어도 다시', () => {
  const T = '2026-11-04';
  const now = new Date(2026, 10, 4, 9).getTime(), old = new Date(2026, 9, 1).getTime();
  const words = ['a', 'b', 'c', 'd'].map(id => ({ id, day: 1 }));
  const stats = {
    a: { st: 2, due: '2026-11-04', c: 2, w: 0, s: now, f: '2026-10-01' },   // 오늘 이미 복습
    b: { st: 1, due: '2026-11-05', c: 1, w: 0, s: now, f: T },              // 오늘 처음 배움
    c: { st: 0, due: '2026-11-05', c: 0, w: 2, s: now, f: T },              // 오늘 배웠는데 틀림
  };
  assert.deepEqual(pickReview(words, stats, { today: T, n: 5 }).map(w => w.id), []); // 기본: 없음
  assert.deepEqual(pickReview(words, stats, { today: T, n: 5, again: true }).map(w => w.id), ['c', 'b', 'a']); // 약한 것부터
  const more = { ...stats, d: { st: 3, due: '2026-11-20', c: 3, w: 0, s: old, f: '2026-10-01' } };
  assert.deepEqual(pickReview(words, more, { today: T, n: 2, again: true }).map(w => w.id), ['d', 'c']); // 안 본 단어 먼저
});

// ---------- 유반의어 테스트 ----------
import { meaningBlocks, relBlocks, relForSense, senseOf, makeSynQuestion, hasSynAnt, koPos } from '../js/core.js';

test('유반의어: 뜻·유의어 묶음 나누기', () => {
  assert.deepEqual(meaningBlocks('1. 부패, 부식 2. 쇠퇴 / 1. 부패하다, 썩다 2. 쇠퇴하다'), [['부패, 부식', '쇠퇴'], ['부패하다, 썩다', '쇠퇴하다']]);
  assert.deepEqual(meaningBlocks('명확한, 확고한'), [['명확한, 확고한']]);
  assert.deepEqual(relBlocks('1. ease, abate, diminish / 2. sink'), [{ 1: ['ease', 'abate', 'diminish'], 2: ['sink'] }]);
  assert.deepEqual(relBlocks('1. rot, decomposition / 2. decline / 1. rot, decompose / 2. decline'), [{ 1: ['rot', 'decomposition'], 2: ['decline'] }, { 1: ['rot', 'decompose'], 2: ['decline'] }]);
  assert.deepEqual(relBlocks('epidemic, pandemic / torment, afflict'), [{ 0: ['epidemic', 'pandemic'] }, { 0: ['torment', 'afflict'] }]);
});

test('유반의어: 예문의 뜻 갈래에 맞는 유의어만', () => {
  const abide = '1. ((~ by)) (규칙 등을) 준수하다 2. ((주로 부정문)) 참다, 견디다';
  const syn = '1. obey, follow, comply with / 2. tolerate';
  assert.equal(senseOf('우리는 모든 당사자가 상호 합의를 준수할 것이라고 믿는다.', abide), 1);
  assert.deepEqual(relForSense(abide, syn, 1), ['obey', 'follow', 'comply with']);
  assert.deepEqual(relForSense(abide, syn, 2), ['tolerate']);
  assert.deepEqual(relForSense(abide, syn, 0), []); // 뜻을 모르면 내지 않음
  // 번호 없는 유의어는 모든 뜻에
  assert.deepEqual(relForSense('1. 치명적인 2. 결정적인, 중대한', 'deadly, lethal', 0), ['deadly', 'lethal']);
  // 품사 묶음 수가 안 맞으면(어느 품사의 유의어인지 모름) 내지 않음
  assert.deepEqual(relForSense('유죄를 선고하다 / 죄수, 수감자', 'prisoner', 1), []);
  assert.deepEqual(relForSense('전염병, 역병 / 괴롭히다, 시달리게 하다', 'epidemic, pandemic / torment, afflict', 2), ['torment', 'afflict']);
  assert.equal(koPos('치명적인'), 'a');
  assert.equal(koPos('준수하다'), 'v');
  assert.equal(koPos('사망자'), 'n');
});

const mk = (word, meaning, syn, ant, ex1 = '', ex1ko = '', day = 41) => ({
  id: `${day}|${word}`, day, word, blank: word, meaning, ex1, ex1ko, ex2: '', ex2ko: '',
  extras: [['유의어', syn], ['반의어', ant]].filter(([, v]) => v && v !== '-'),
});
const book = [
  mk('evade', '피하다, 모면하다', 'avoid, dodge, sidestep', 'confront', 'The boy tried to evade his responsibilities.', '그 소년은 책임을 피하려고 했다.'),
  mk('invade', '침입하다, 침략하다', 'attack', ''),
  mk('condense', '압축하다, 응축하다', 'compress', ''),
  mk('preach', '설교하다, 전도하다', '', ''),
  mk('dodge', '(재빨리) 피하다', 'avoid', ''),
  mk('permit', '허락하다, 허용하다', 'allow', 'forbid'),
  mk('abolish', '폐지하다', 'eliminate', ''),
  mk('testify', '증언하다', '', ''),
];

test('유반의어: 예문 모드 문제 — 정답 하나, 비슷한 말은 보기에서 빠짐', () => {
  for (let i = 0; i < 30; i++) {
    const q = makeSynQuestion(book[0], book, { byExample: true });
    assert.ok(q && q.sentence, '예문 문제');
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter(o => o.ok).length, 1);
    const texts = q.options.map(o => o.text.toLowerCase());
    assert.equal(new Set(texts).size, 4);
    assert.ok(!texts.includes('evade'));
    // dodge(유의어가 겹치는 단어장 단어)는 정답이 아니면 보기에 없어야 함
    if (q.kind === 'syn') assert.ok(texts.filter(t => ['avoid', 'dodge', 'sidestep'].includes(t)).length === 1);
    if (q.kind === 'ant') assert.equal(q.answer, 'confront');
  }
});

test('유반의어: 단어 모드 문제 — 유의어를 보고 그 단어 고르기', () => {
  for (let i = 0; i < 30; i++) {
    const q = makeSynQuestion(book[0], book, { byExample: false });
    assert.ok(q && !q.sentence && q.shown.length);
    assert.equal(q.answer, 'evade');
    const texts = q.options.map(o => o.text);
    assert.equal(texts.length, 4);
    assert.ok(!texts.includes('dodge')); // 보여 준 유의어와 겹치는 단어는 빠짐
  }
  assert.equal(hasSynAnt(book[3]), false);
  assert.equal(makeSynQuestion(book[3], book), null);
});

test('떨어진 숙어: 수량 표현의 of(thousands of)는 건너뜀', () => {
  assert.equal(show(makeBlanks('The new law will deprive thousands of workers of their overtime pay.', 'deprive A of B')),
    'The new law will [deprive] thousands of workers [of] their overtime pay.');
  // of가 하나뿐이면 그대로
  assert.equal(show(makeBlanks('It robbed many of sleep.', 'rob A of B')), 'It [robbed] many [of] sleep.');
  assert.equal(show(makeBlanks('It took hours to convince my parents of the value of my plan.', 'convince A of B')),
    'It took hours to [convince] my parents [of] the value of my plan.');
});

test('4지선다 보기: 정답과 낱말 수가 같은 것부터 (빈칸 수로 답이 드러나지 않게)', () => {
  const mk = (word, day = 1) => ({ id: `${day}|${word}`, day, word, blank: word });
  const pool = ['fatal', 'abide', 'decay', 'norm', 'tissue', 'flaw', 'let down', 'take over', 'back off', 'give in', 'put up with', 'come away with', 'get back to', 'put in for'].map(w => mk(w));
  const count = w => displayAnswer(w).split(' ').length;
  for (let i = 0; i < 30; i++) {
    for (const t of ['let down', 'put up with', 'fatal']) {
      const target = pool.find(w => w.word === t);
      const picked = pickDistractors(target, pool, 3);
      assert.equal(picked.length, 3);
      assert.ok(picked.every(w => count(w) === count(target)), `${t}: ${picked.map(w => w.word)}`);
    }
  }
});
