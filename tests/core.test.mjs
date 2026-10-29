import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, mapColumns, rowsToWords, answerParts, makeBlanks, isTypedCorrect, splitSentence, applyResult, buildPlan, normalizeStat, addDays, daysBetween } from '../js/core.js';

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
  assert.equal(show(makeBlanks('He was convinced of it.', 'be convinced of')), 'He [was convinced of] it.');
  assert.equal(show(makeBlanks('Convincing people is hard.', 'convince')), '[Convincing] people is hard.');
  assert.equal(show(makeBlanks('She made up her mind.', "make up one's mind")), 'She [made up] her [mind].');
});

test('빈칸: 단어 반복, 단어 일부와 혼동하지 않기', () => {
  assert.equal(show(makeBlanks('Give up? Never give up.', 'give up')), '[Give up]? Never [give up].');
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

test('오늘의 학습: 복습 먼저, 새 단어는 하루 개수만큼', () => {
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
  assert.equal(show(makeBlanks('They are cutting off projects.', 'cut off')), 'They are [cutting off] projects.');
  assert.equal(show(makeBlanks('He did not want to let his son down.', 'let down')), 'He did not want to [let] his son [down].');
  assert.equal(show(makeBlanks('Talent to carry this off. / He carried off the prize.', 'carry off')), 'Talent to [carry] this [off]. / He [carried off] the prize.');
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
