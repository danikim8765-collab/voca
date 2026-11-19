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

// 그날 낮 12시 (applyResult의 now: 지난번에 본 날을 알려고)
const noon = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 12).getTime(); };
const at = (d, o = {}) => ({ today: d, now: noon(d), ...o });

test('간격 반복: 단계와 다음 복습일', () => {
  const T = '2026-11-02';
  let s = applyResult(undefined, 'ok', at(T));
  assert.deepEqual([s.st, s.due, s.f], [1, '2026-11-03', T]);           // 1단계 → 1일
  s = applyResult(s, 'ok', at('2026-11-03'));
  assert.deepEqual([s.st, s.due], [2, '2026-11-06']);                   // 2단계 → 3일
  s = applyResult(s, 'ok', at('2026-11-06'));
  assert.deepEqual([s.st, s.due], [3, '2026-11-13']);                   // 3단계 → 7일
  s = applyResult(s, 'ok', at('2026-11-13'));
  assert.deepEqual([s.st, s.due], [4, '2026-11-27']);                   // 4단계 → 14일
  s = applyResult(s, 'ok', at('2026-11-27'));
  assert.deepEqual([s.st, s.due], [4, '2026-12-11']);                   // 최대 4단계
  s = applyResult(s, 'hint', at('2026-12-11'));
  assert.deepEqual([s.st, s.due], [4, '2026-12-12']);                   // 힌트: 단계 그대로, 내일
  s = applyResult(s, 'wrong', at('2026-12-12'));
  assert.deepEqual([s.st, s.due, s.w, s.k], [0, '2026-12-13', 1, 2]);   // 틀림: 0단계(다시 볼 단어), 내일. 이어 갈 단계 2
  const before = { ...s };
  s = applyResult(s, 'ok', at('2026-12-12', { scheduled: false }));     // 복습일 아닌 연습: 일정 그대로
  assert.deepEqual([s.st, s.due, s.c, s.k], [before.st, before.due, before.c + 1, 2]);
  s = applyResult(s, 'ok', at('2026-12-13'));
  assert.deepEqual([s.st, s.due, s.k], [3, '2026-12-20', undefined]);   // 다시 맞히면 처음부터가 아니라 3단계(7일)부터
});

test('틀림: 단계를 처음부터가 아니라 둘씩 내리고, 거푸 틀리면 더 내려감', () => {
  let s = applyResult({ st: 3, due: '2026-11-10', c: 3, w: 0, s: noon('2026-11-03'), f: '2026-10-01' }, 'wrong', at('2026-11-10'));
  assert.deepEqual([s.st, s.k], [0, 1]);
  s = applyResult(s, 'wrong', at('2026-11-11'));
  assert.deepEqual([s.st, s.k], [0, undefined]);                        // 또 틀리면 처음부터
  s = applyResult(s, 'ok', at('2026-11-12'));
  assert.deepEqual([s.st, s.due], [1, '2026-11-13']);
  // 1단계에서 틀리면 처음부터
  assert.equal(applyResult({ st: 1, due: '2026-11-10', s: noon('2026-11-09') }, 'wrong', at('2026-11-10')).k, undefined);
});

test('밀려서 맞히면 버틴 날 수보다 짧은 간격은 건너뜀', () => {
  // 1단계(내일 볼 단어)를 열흘 만에 맞힘 → 3일·7일은 이미 버텼으니 14일 단계로
  let s = applyResult({ st: 1, due: '2026-11-02', c: 1, w: 0, s: noon('2026-11-01'), f: '2026-11-01' }, 'ok', at('2026-11-11'));
  assert.deepEqual([s.st, s.due], [4, '2026-11-25']);
  // 이틀 늦은 정도면 한 단계만
  s = applyResult({ st: 2, due: '2026-11-04', c: 2, w: 0, s: noon('2026-11-01'), f: '2026-10-30' }, 'ok', at('2026-11-06'));
  assert.deepEqual([s.st, s.due], [3, '2026-11-13']);
  // 다른 프리셋도 같게: 짧게(1·2·4·7·12) 2단계를 6일 만에 → 4일은 버텼으니 7일 단계로
  s = applyResult({ st: 2, due: '2026-11-03', s: noon('2026-11-01') }, 'ok', at('2026-11-07', { intervals: [1, 2, 4, 7, 12] }));
  assert.deepEqual([s.st, s.due], [4, '2026-11-14']);
});

test('다음 복습일: 덜 붐비는 날로, 쉬는 요일은 피해서', async () => {
  const { spreadDue } = await import('../js/core.js');
  const T = '2026-11-02'; // 월요일
  assert.equal(spreadDue(T, 7), '2026-11-09');                          // 정보 없으면 딱 7일 뒤
  assert.equal(spreadDue(T, 3, { load: () => 99 }), '2026-11-05');      // 3일 이하 간격은 그대로
  const busy = { '2026-11-09': 30, '2026-11-08': 10, '2026-11-10': 5 };
  assert.equal(spreadDue(T, 7, { load: d => busy[d] || 0 }), '2026-11-10'); // 7일 → ±1일 중 가장 한가한 날
  assert.equal(spreadDue(T, 7, { load: d => (d === '2026-11-09' ? 3 : 1) }), '2026-11-08'); // 같으면 앞날
  assert.equal(spreadDue(T, 14, { load: d => (d === '2026-11-16' ? 5 : d === '2026-11-14' ? 0 : 2) }), '2026-11-14'); // 14일 → ±2일
  assert.equal(spreadDue(T, 7, { rest: [1] }), '2026-11-08');           // 11-09는 월요일(쉬는 날) → 앞날
  // 같은 날 배운 단어들이 복습일을 나눠 가짐
  const load = new Map(), dues = [];
  for (let i = 0; i < 9; i++) {
    const s = applyResult({ st: 2, due: T, s: noon('2026-10-30') }, 'ok', at(T, { load: d => load.get(d) || 0 }));
    load.set(s.due, (load.get(s.due) || 0) + 1); dues.push(s.due);
  }
  assert.deepEqual([...load.values()], [3, 3, 3]);
  assert.deepEqual([...new Set(dues)].sort(), ['2026-11-08', '2026-11-09', '2026-11-10']);
});

test('시험 전: 시험날까지 간격의 절반이 넘게 남을 때만 한 번 더, 시험 전날에 몰지 않음', async () => {
  const { examDue } = await import('../js/core.js');
  const T = '2026-11-10';
  // 14일 간격인데 시험이 10일 뒤 → 시험 7일 전(11-13)에 한 번 더
  let s = applyResult({ st: 3, due: T, c: 3, w: 0, s: noon('2026-11-03') }, 'ok', at(T, { exam: '2026-11-20' }));
  assert.deepEqual([s.st, s.due], [4, '2026-11-13']);
  // 시험이 6일 뒤면 7일 안이라 그대로 (시험 뒤 복습일)
  assert.equal(applyResult({ st: 3, due: T, s: noon('2026-11-03') }, 'ok', at(T, { exam: '2026-11-16' })).due, '2026-11-24');
  // 다음 복습일이 시험 전이면 그대로
  assert.equal(examDue(T, 3, '2026-11-20'), '2026-11-13');
  // 7일 간격, 시험 5일 뒤 → 시험 3일 전. 그날이 붐비면 앞으로만 옮김(시험까지 덜 남지 않게)
  assert.equal(examDue(T, 7, '2026-11-15'), '2026-11-12');
  assert.equal(examDue(T, 14, '2026-11-24', { load: d => (d === '2026-11-17' ? 9 : 0) }), '2026-11-16');
  // 시험 날·지난 뒤엔 그냥 간격대로
  assert.equal(examDue('2026-11-20', 7, '2026-11-20'), '2026-11-27');
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
  assert.equal(hl('수천 달러에 달할 것이다. / 그것에 해당한다.', '~에 달하다', '달할|해당한다'), '수천 달러에 [달할] 것이다. / 그것에 [해당한다].'); // 여러 개면 모두
  assert.equal(hl('그것에 해당한다.', '~에 달하다', '달할|해당한다'), '그것에 [해당한다].');
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

test('코치 캐릭터: 동기화할 때 더 최근에 고른 쪽으로, 한쪽만 골랐으면 그쪽', async () => {
  const { mergeCoach, sameCoach } = await import('../js/core.js');
  assert.deepEqual(mergeCoach({ char: 'owl', at: 5 }, { char: 'cat', at: 3 }), { char: 'owl', at: 5 });
  assert.deepEqual(mergeCoach({ char: 'owl', at: 5 }, { char: 'cat', at: 9 }), { char: 'cat', at: 9 });
  assert.deepEqual(mergeCoach(null, { char: 'slime', at: 0 }), { char: 'slime', at: 0 });
  assert.deepEqual(mergeCoach({ char: 'hamster' }, null), { char: 'hamster', at: 0 });
  assert.equal(mergeCoach(null, null), null);
  // 둘 다 언제 골랐는지 모르면 Gist 쪽 (기기끼리 서로 덮어쓰지 않게)
  assert.deepEqual(mergeCoach({ char: 'owl', at: 0 }, { char: 'cat', at: 0 }), { char: 'cat', at: 0 });
  assert.ok(sameCoach({ char: 'owl', at: 1 }, { char: 'owl', at: 1 }));
  assert.ok(!sameCoach({ char: 'owl', at: 1 }, { char: 'owl', at: 2 }));
  assert.ok(sameCoach(null, undefined));
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
  // 짧은 단어도 이웃한 두 글자 순서를 바꿔 친 건 알려 줌
  const norm = { id: 'n', word: 'norm', blank: 'norm', meaning: '표준', extras: [] };
  assert.equal(coachFeedback('nrom', norm, { cands: ['norm'] }).text, '두 글자 순서가 바뀌었어요');
  assert.equal(coachFeedback('nrm', norm, { cands: ['norm'] }).kind, 'spell');
  assert.equal(coachFeedback('mron', norm, { cands: ['norm'] }), null); // 너무 다르면 없음
  assert.equal(coachFeedback('fatla', fatal, opt).text, '두 글자 순서가 바뀌었어요');
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
  let s = applyResult(null, 'ok', at('2026-11-01'));
  assert.deepEqual([s.st, s.due], [1, '2026-11-02']);
  s = applyResult(s, 'ok', at('2026-11-02'));
  assert.deepEqual([s.st, s.due], [2, '2026-11-05']);
  // 매우 짧게: 6단계, 1·1·2·3·5·8일
  let x = null; const days = [];
  let d = '2026-11-01';
  for (let i = 0; i < 7; i++) { x = applyResult(x, 'ok', at(d, { intervals: PRESETS.xs })); days.push(daysBetween(d, x.due)); d = x.due; }
  assert.deepEqual(days, [1, 1, 2, 3, 5, 8, 8]);
  assert.equal(x.st, 6);

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
  // 하루 몫 2개는 잘 아는 단어부터(2단계 w1·w2), 복습일 된 w0도 같이
  assert.deepEqual(f0.words.map(w => w.id), ['w1', 'w2', 'w0']);
  // 첫날 몫을 안 했으면 둘째 날에 같이 (안 배운 단어는 맨 뒤)
  assert.deepEqual(pickSrsReview(words, words, stats, { ...opt, today: '2026-11-11' }).words.map(w => w.id), ['w1', 'w2', 'w0', 'w3']);
  // 이번 바퀴에서 이미 본 단어(복습일이 돼서 본 것 포함)는 몫으로 셈: 첫날 w0·w5를 봤으면 둘째 날은 두 개만 더
  const seen = { ...stats, w0: { ...stats.w0, due: '2026-11-13', s: new Date(2026, 10, 10, 12).getTime() }, w5: { st: 1, due: '2026-11-20', c: 1, w: 0, s: new Date(2026, 10, 10, 12).getTime(), f: '2026-11-01' } };
  assert.deepEqual(pickSrsReview(words, words, seen, { ...opt, today: '2026-11-11' }).words.map(w => w.id), ['w1', 'w2']);
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

test('동기화: 시험일은 다른 설정과 따로 examAt이 최신인 쪽으로', async () => {
  const { mergeProgress } = await import('../js/core.js');
  // 폰: 이 모드를 안 쓰다가 다른 모드에서 정한 시험일만 받아 적음 (설정은 기본값, at 0)
  const phone = { stats: {}, prefs: { exam: '2026-12-01', examAt: 500, newPerDay: 20, srs: false, goal: '', at: 0 } };
  // 패드: 이 모드를 쓰던 기기 (하루 40개, 주기 복습)
  const ipad = { stats: {}, prefs: { exam: '', newPerDay: 40, srs: true, goal: '2026-11-20', at: 300 } };
  for (const m of [mergeProgress(phone, ipad), mergeProgress(ipad, phone)]) {
    assert.equal(m.prefs.exam, '2026-12-01'); // 시험일은 최신 쪽
    assert.equal(m.prefs.examAt, 500);
    assert.equal(m.prefs.newPerDay, 40); // 나머지 설정은 덮어써지지 않음
    assert.equal(m.prefs.srs, true);
    assert.equal(m.prefs.goal, '2026-11-20');
    assert.equal(m.prefs.at, 300);
  }
  // examAt이 없는 예전 기록끼리는 전처럼 at이 최신인 쪽의 시험일
  const old = mergeProgress({ stats: {}, prefs: { exam: 'A', at: 1 } }, { stats: {}, prefs: { exam: 'B', at: 2 } });
  assert.equal(old.prefs.exam, 'B');
  // 시험일을 지운 것도 최신이면 이김
  const cleared = mergeProgress({ stats: {}, prefs: { exam: '', examAt: 9, at: 1 } }, { stats: {}, prefs: { exam: 'B', examAt: 5, at: 2 } });
  assert.equal(cleared.prefs.exam, '');
});

test('뜻 채점: [ ] 안의 바꿔 쓸 수 있는 말도 정답', async () => {
  const { gradeMeaning, meaningSenses } = await import('../js/core.js');
  // 앞 낱말을 바꿈
  assert.equal(gradeMeaning('구별하다', '1. 차별하다 2. 식별[구별]하다', 'easy').score, 2);
  assert.equal(gradeMeaning('차별하다, 구별하다', '1. 차별하다 2. 식별[구별]하다', 'mid').score, 2);
  assert.equal(gradeMeaning('전문 기술', '전문 지식[기술]', 'mid').score, 2);
  assert.equal(gradeMeaning('전문기술', '전문 지식[기술]', 'mid').score, 2); // 붙여 써도
  assert.equal(gradeMeaning('전문지식', '전문 지식[기술]', 'mid').score, 2);
  assert.equal(gradeMeaning('화면', '관찰하다, 감시하다 / 모니터[화면], 감시 장치', 'easy').score, 2);
  // 앞말 전체를 바꿈 · 어미만 바꿈
  assert.equal(gradeMeaning('집착하다', '((주로 수동태로)) 사로잡다, 집착하게 하다[집착하다]', 'easy').score, 2);
  assert.equal(gradeMeaning('진정되다', '1. 정착하다 2. 진정하다[되다]', 'easy').score, 2);
  assert.equal(gradeMeaning('되다', '1. 정착하다 2. 진정하다[되다]', 'easy').score, 0); // 어미만 써서는 안 됨
  // 엄격: 바꿔 쓴 꼴은 하나만 써도 그 낱말을 쓴 것
  assert.equal(gradeMeaning('차별하다 구별하다', '1. 차별하다 2. 식별[구별]하다', 'hard').score, 2);
  assert.equal(gradeMeaning('구별하다', '1. 차별하다 2. 식별[구별]하다', 'hard').score, 1);
  // 분야 표시 [생물]은 뜻이 아님
  assert.equal(gradeMeaning('생물', '1. [생물] 조직 2. 화장지, 얇은 종이', 'easy').score, 0);
  assert.equal(gradeMeaning('조직', '1. [생물] 조직 2. 화장지, 얇은 종이', 'easy').score, 2);
  assert.deepEqual(meaningSenses('통합[통일]하다'), [['통합', '통일']]);
  // 오타는 자모 하나쯤만 봐줌: 한 글자가 통째로 다른 말은 다른 뜻
  assert.equal(gradeMeaning('수출하다', '수입하다', 'easy').score, 0);
  assert.equal(gradeMeaning('군대', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 0);
  assert.equal(gradeMeaning('결정젹인', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 2); // ㅓ → ㅕ 오타
  // 두 글자 말은 자모 하나만 달라도 다른 말이 되기 쉬워서 오타로 안 봄 · 첫소리가 다른 것도
  assert.equal(gradeMeaning('수익', '수입하다 / 1. 수입, 수입품 2. 중요성', 'easy').score, 0);
  assert.equal(gradeMeaning('최소의', '최고의, 최상의', 'easy').score, 0);
  assert.equal(gradeMeaning('열정적인', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 0);
  assert.equal(gradeMeaning('치명적잉', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 2);
  // 상관없는 말은 여전히 오답
  assert.equal(gradeMeaning('행복하다', '1. 차별하다 2. 식별[구별]하다', 'easy').score, 0);
});

test('4지선다 보기: 예문에서 쓰인 품사와 같은 단어부터 (문장 구조로 답이 드러나지 않게)', () => {
  const mk = (word, meaning, ex1ko = '') => ({ id: `1|${word}`, day: 1, word, blank: word, meaning, ex1ko });
  const pool = [
    mk('fatal', '1. 치명적인 2. 결정적인, 중대한', '그 치명적인 사고의 원인은 안개였다.'),
    mk('definite', '명확한, 확고한'), mk('intense', '극심한, 강렬한'), mk('abnormal', '비정상적인, 이상한'), mk('fierce', '사나운, 흉포한'),
    mk('outlaw', '불법화하다, 금지하다'), mk('import', '수입하다 / 1. 수입, 수입품'), mk('unify', '통합하다'), mk('convict', '유죄를 선고하다'),
    mk('organ', '장기, 기관'), mk('tissue', '조직'), mk('pollen', '꽃가루'), mk('heritage', '유산, 전통'),
    // 뜻이 품사 둘인 단어: 예문 해석으로 동사 쪽임을 앎
    mk('decay', '1. 부패, 부식 2. 쇠퇴 / 1. 부패하다, 썩다 2. 쇠퇴하다', '설탕은 이를 썩게 한다.'),
  ];
  const adj = new Set(['definite', 'intense', 'abnormal', 'fierce']);
  for (let i = 0; i < 30; i++) {
    const picked = pickDistractors(pool[0], pool, 3);
    assert.ok(picked.every(w => adj.has(w.word)), `fatal: ${picked.map(w => w.word)}`);
  }
  // 품사를 모르는 단어(뜻 없음)는 따지지 않고 그대로 뽑힘
  const bare = ['alpha', 'bravo', 'delta', 'gamma'].map(w => ({ id: `1|${w}`, day: 1, word: w, blank: w }));
  assert.equal(pickDistractors(bare[0], bare, 3).length, 3);
});

test('단어 코치 일정: 남은 날을 배우는 날과 훑는 날로 알맞게 나눔', async () => {
  const { coachPlan, addDays, daysBetween } = await import('../js/core.js');
  const today = '2026-11-11';
  const plan = (d, total, remaining) => coachPlan({ today, exam: addDays(today, d), total, remaining });
  // 시험이 2주 남았으면 목표일이 4일 뒤처럼 너무 이르지도, 시험 전날처럼 너무 늦지도 않게
  const p = plan(14, 200, 200);
  assert.equal(p.learnDays + p.reviewDays, 14);
  assert.ok(p.learnDays >= 9 && p.learnDays <= 12, `배우는 날 ${p.learnDays}`);
  assert.ok(p.reviewDays >= 2, `훑는 날 ${p.reviewDays}`);
  assert.equal(p.goal, addDays(today, p.learnDays));
  assert.equal(p.perDay, Math.ceil(200 / p.learnDays));
  assert.equal(p.load, 'ok');
  // 많이 배워 뒀으면 훑는 날이 늘어남
  assert.ok(plan(14, 200, 50).reviewDays > p.reviewDays);
  // 다 배웠으면 오늘부터 훑기
  assert.deepEqual([plan(14, 200, 0).goal, plan(14, 200, 0).perDay], [today, 0]);
  // 시험이 멀면 늘어지지 않게 하루 10개로 당겨 끝냄
  const far = plan(90, 200, 200);
  assert.equal(far.perDay, 10);
  assert.equal(far.learnDays, 20);
  // 날이 모자라면 벅차다고 알려 줌 (그래도 훑는 날은 남김)
  const tight = plan(14, 1000, 1000);
  assert.equal(tight.load, 'heavy');
  assert.ok(tight.reviewDays >= 2);
  // 시험 전날: 훑는 날 없이 오늘 하루
  assert.deepEqual([plan(1, 40, 40).learnDays, plan(1, 40, 40).reviewDays], [1, 0]);
  // 목표일은 언제나 오늘 뒤 ~ 시험일 사이
  for (const d of [1, 2, 3, 5, 7, 10, 14, 21, 30, 60]) for (const r of [1, 30, 200, 600]) {
    const x = plan(d, 600, r);
    assert.ok(x.goal > today && x.goal <= addDays(today, d), `${d}일, 남은 ${r}: ${x.goal}`);
    assert.equal(daysBetween(today, x.goal), x.learnDays);
    assert.ok(x.perDay * x.learnDays >= r);
  }
  // 코치와 정한 훑는 날 수는 그대로 따름 (배우는 날은 적어도 하루)
  const long = coachPlan({ today, exam: addDays(today, 14), total: 200, remaining: 200, review: 7 });
  assert.deepEqual([long.reviewDays, long.learnDays, long.perDay, long.goal, long.auto], [7, 7, 29, addDays(today, 7), p.reviewDays]);
  assert.equal(coachPlan({ today, exam: addDays(today, 14), total: 200, remaining: 200, review: 30 }).learnDays, 1);
  // 시험이 멀어도 정한 대로 (하루 10개로 당기지 않음)
  const slow = coachPlan({ today, exam: addDays(today, 90), total: 200, remaining: 200, review: 5 });
  assert.deepEqual([slow.reviewDays, slow.learnDays, slow.perDay], [5, 85, 3]);
  // 쉬는 요일: 하루 개수는 공부하는 날로 나눔 (2026-11-11은 수요일, 토요일 쉼)
  const { studyDays, weekdayOf } = await import('../js/core.js');
  assert.equal(weekdayOf('2026-11-14'), 6);
  assert.equal(studyDays(today, addDays(today, 14), [6]), 12);
  const sat = coachPlan({ today, exam: addDays(today, 14), total: 200, remaining: 200, review: 7, rest: [6] });
  assert.equal(sat.learnDays, 7);
  assert.equal(sat.perDay, Math.ceil(200 / studyDays(today, sat.goal, [6])));
  assert.ok(sat.perDay > long.perDay);
  assert.equal(sat.finalPerDay, Math.ceil(200 / studyDays(sat.goal, addDays(today, 14), [6])));
  // 일주일 내내 쉬면 쉬는 날이 없는 걸로
  assert.equal(coachPlan({ today, exam: addDays(today, 14), total: 200, remaining: 200, review: 7, rest: [0, 1, 2, 3, 4, 5, 6] }).perDay, long.perDay);
  // 배우는 기간이 쉬는 날뿐이면 늘림: 오늘(수)·내일(목) 쉬고 시험이 3일 뒤, 복습 2일 → 배우는 날을 늘림
  const tight2 = coachPlan({ today, exam: addDays(today, 3), total: 40, remaining: 40, review: 2, rest: [3, 4] });
  assert.ok(studyDays(today, tight2.goal, [3, 4]) >= 1);
  // 시험일이 없거나 지났으면 일정 없음
  assert.equal(coachPlan({ today, exam: '', total: 10, remaining: 10 }), null);
  assert.equal(coachPlan({ today, exam: today, total: 10, remaining: 10 }), null);
});

test('단어 코치 일정: 하루 개수를 고정하면 그 개수 그대로, 남는 단어는 마지막 날에 붙이거나 하루를 늘림', async () => {
  const { coachPlan, addDays } = await import('../js/core.js');
  const today = '2026-11-11', exam = addDays(today, 14); // 수요일, 시험은 2주 뒤. 토요일(14·21일) 쉼
  const plan = o => coachPlan({ today, exam, total: 200, remaining: 175, rest: [6], ...o });
  // 175 = 40 × 4 + 15 → 하루 늘리기(기본): 수·목·금·일·월 닷새, 마지막 날은 15개
  const extra = plan({ fix: 40 });
  assert.deepEqual([extra.perDay, extra.over, extra.tail, extra.studyN, extra.lastDay, extra.goal, extra.reviewDays, extra.fits], [40, 15, 'extra', 5, 15, '2026-11-17', 8, true]);
  assert.equal(extra.todayNew, 40);
  // 마지막 날에 붙이기: 나흘, 마지막 날 55개. 복습이 하루 늘어남
  const last = plan({ fix: 40, tail: 'last' });
  assert.deepEqual([last.perDay, last.tail, last.studyN, last.lastDay, last.goal, last.reviewDays, last.load], [40, 'last', 4, 55, '2026-11-16', 9, 'busy']);
  // 복습 날 수를 정해 둔 건 안 봄 (개수가 먼저)
  assert.equal(plan({ fix: 40, review: 3 }).reviewDays, 8);
  // 딱 나눠떨어지면 남는 단어 없음
  const even = plan({ fix: 35 });
  assert.deepEqual([even.over, even.tail, even.studyN, even.lastDay], [0, '', 5, 35]);
  // 하루치도 안 남았으면 그날 다 봄
  const small = coachPlan({ today, exam, total: 200, remaining: 25, fix: 40 });
  assert.deepEqual([small.over, small.studyN, small.lastDay, small.todayNew, small.goal], [0, 1, 25, 25, '2026-11-12']);
  // 진도가 나가도 개수는 그대로: 다음 날 135개 남으면 40·40·40·15
  const next = coachPlan({ today: addDays(today, 1), exam, total: 200, remaining: 135, rest: [6], fix: 40 });
  assert.deepEqual([next.perDay, next.studyN, next.lastDay, next.goal], [40, 4, 15, '2026-11-17']);
  // 그 개수로는 시험 전날까지 다 못 보면: fits false, 시험 전날까지 고르게
  const tight = coachPlan({ today, exam: addDays(today, 3), total: 200, remaining: 175, fix: 40 });
  assert.deepEqual([tight.fits, tight.minPerDay, tight.perDay, tight.todayNew, tight.reviewDays, tight.goal], [false, 59, 59, 59, 0, addDays(today, 3)]);
  // 고정하지 않으면 예전 그대로
  assert.equal(plan({}).fix, undefined);
});

test('전체 복습 기간: 쉬는 요일엔 몫이 없고, 공부하는 날로 나눔', async () => {
  const { pickSrsReview } = await import('../js/core.js');
  const words = Array.from({ length: 60 }, (_, i) => ({ id: `1|w${i}`, day: 1, word: `w${i}` }));
  // 목표일 11-16(월) ~ 시험 11-23(월): 7일 중 토(21)·일(22) 쉬면 공부하는 날 5일 → 하루 12개
  const opt = { goal: '2026-11-16', exam: '2026-11-23', rest: [0, 6] };
  const mon = pickSrsReview(words, words, {}, { ...opt, today: '2026-11-16' });
  assert.deepEqual([mon.days, mon.size, mon.words.length], [5, 12, 12]);
  const sat = pickSrsReview(words, words, {}, { ...opt, today: '2026-11-21' });
  assert.deepEqual([sat.rest, sat.words.length], [true, 0]);
  // 금요일(다섯 번째 공부하는 날)이면 다섯 몫까지 (앞에서 안 본 것 전부)
  assert.equal(pickSrsReview(words, words, {}, { ...opt, today: '2026-11-20' }).words.length, 60);
});

test('해석 강조: 명사는 통째로만, 한 글자는 동사 어간만 (엉뚱한 말에 붙지 않게)', async () => {
  const { highlightMeaning, senseOf } = await import('../js/core.js');
  const hl = (ko, m, mark) => highlightMeaning(ko, m, mark).map(s => (s.t === 'mark' ? `[${s.v}]` : s.v)).join('');
  const sovereign = '1. 주권을 가진, 자주적인 2. 최고 권력의 / 군주, 국왕';
  const ko = '그들은 외세의 영향으로부터 자유로운 주권 국가를 세우고자 했다.';
  assert.equal(hl(ko, sovereign), '그들은 외세의 영향으로부터 자유로운 [주권] 국가를 세우고자 했다.'); // 국왕 → 국가 ✗
  assert.equal(senseOf(ko, sovereign), 1); // 명사 '군주, 국왕'이 아니라 형용사 뜻
  assert.equal(hl('그는 한마디도 하지 않고 내 질문에 그저 한숨만 내쉬었다.', '(입 밖에) 내다, 말하다 / 완전한, 전적인').includes('[내 질문에]'), false);
  assert.equal(hl('아사 직전의 상황에서는 식량이 조금 증가했다.', '(가격·경기 등의) 상승, 호전'), '아사 직전의 상황에서는 식량이 조금 증가했다.');
  assert.equal(hl('많은 사람들이 유제품 우유에 대한 대용품으로 아몬드 우유를 사용한다.', '대용품, 대리인 / 대체[대신]하다'),
    '많은 사람들이 유제품 우유에 대한 [대용품으로] 아몬드 우유를 사용한다.');
  // 직접 지정한 강조어가 있으면 그 말로 뜻 갈래를 정함 (모르면 0)
  const resort = '((~ to)) (부득이하게) 의지하다 / 1. 휴양지, 리조트 2. 수단, 방편 3. 의지, 호소';
  assert.equal(senseOf('경찰은 폭력에 의존하지 않고 위험한 상황을 처리하는 다양한 방법을 배운다.', resort, '의존하지'), 0);
  assert.equal(senseOf('그들은 바닷가 휴양지에서 휴가를 보냈다.', resort), 2);
});

test('4지선다 보기: 정답의 유의어는 빈칸에도 맞으니 보기로 내지 않음 · 단어 모드 뜻 보기도 품사를 맞춤', async () => {
  const { pickDistractors, pickMeaningDistractors } = await import('../js/core.js');
  const mk = (word, meaning, syn = '') => ({ id: `1|${word}`, day: 1, word, blank: word, meaning, ex1ko: '', extras: syn ? [['유의어', syn]] : [] });
  const fierce = mk('fierce', '1. 사나운, 험악한 2. 격렬한, 맹렬한', '1. harsh / 2. intense, severe');
  const pool = [fierce, mk('intense', '1. 극심한, 강렬한 2. 치열한'), mk('severe', '심한, 혹독한'), mk('calm', '침착한'), mk('vivid', '생생한'), mk('bare', '벌거벗은'), mk('mild', '온화한')];
  for (let k = 0; k < 30; k++) {
    const out = pickDistractors(fierce, pool, 3).map(w => w.word);
    assert.ok(!out.includes('intense') && !out.includes('severe'), out.join());
  }
  const abide = mk('abide', '1. 준수하다 2. 참다, 견디다');
  const pool2 = [abide, mk('peasant', '소작농'), mk('harassment', '괴롭힘'), mk('obey', '복종하다'), mk('avoid', '피하다'), mk('quit', '그만두다'), mk('nation', '국가')];
  for (let k = 0; k < 30; k++) {
    const out = pickMeaningDistractors(abide, pool2, 3).map(w => w.word);
    assert.deepEqual(out.sort(), ['avoid', 'obey', 'quit']);
  }
});

test('뜻 채점: 정답 뜻의 일부 글자만 쓴 건 오답 (반대말·다른 말이 되기 쉬움)', async () => {
  const { gradeMeaning } = await import('../js/core.js');
  assert.equal(gradeMeaning('대칭, 균형', '1. 비대칭 2. 불균형', 'easy').score, 0); // 반대말
  assert.equal(gradeMeaning('나운, 격렬', '1. 사나운, 험악한 2. 격렬한, 맹렬한', 'mid').score, 1); // 격렬만 맞음
  assert.equal(gradeMeaning('나운', '1. 사나운, 험악한 2. 격렬한, 맹렬한', 'easy').score, 0);
  assert.equal(gradeMeaning('선고, 수감', '유죄를 선고하다 / 죄수, 수감자', 'easy').score, 0);
  assert.equal(gradeMeaning('적인', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 0);
  assert.equal(gradeMeaning('가루', '꽃가루', 'easy').score, 0);
  assert.equal(gradeMeaning('결정', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 0);
  // 어미·조사만 다르면 정답
  assert.equal(gradeMeaning('치명적', '1. 치명적인 2. 결정적인, 중대한', 'easy').score, 2);
  assert.equal(gradeMeaning('비대칭의', '1. 비대칭 2. 불균형', 'easy').score, 2);
  assert.equal(gradeMeaning('유죄를 선고하다', '유죄를 선고하다 / 죄수, 수감자', 'easy').score, 2);
  assert.equal(gradeMeaning('수감자', '유죄를 선고하다 / 죄수, 수감자', 'easy').score, 2);
});

test('코치 이야기 합치기: 두 모드 기록을 시각 순으로 하나, 같은 말·같은 기억은 한 번', async () => {
  const { mergeChats } = await import('../js/core.js');
  const a = { items: [{ who: 'me', text: '안녕', t: 1 }, { who: 'coach', text: '반가워요', t: 3 }], notes: [{ text: '수요일은 학원', t: 1 }] };
  const b = { items: [{ who: 'me', text: '단어 모드야', t: 2 }, { who: 'coach', text: '반가워요', t: 3 }], notes: [{ text: '수요일은 학원', t: 5 }, { text: '목표는 만점', t: 4 }] };
  const m = mergeChats(a, b);
  assert.deepEqual(m.items.map(x => x.text), ['안녕', '단어 모드야', '반가워요']);
  assert.deepEqual(m.notes.map(x => x.text), ['수요일은 학원', '목표는 만점']);
  assert.deepEqual(mergeChats(null, a).items.length, 2);
  assert.equal(mergeChats(a, b, { keep: 2 }).items[0].text, '단어 모드야');
});

test('쉬는 요일은 다른 설정과 따로, 더 최근에 바꾼 쪽으로 (두 모드가 같이 씀)', async () => {
  const { mergeProgress } = await import('../js/core.js');
  const a = { stats: {}, prefs: { at: 100, newPerDay: 30, coachRest: [6], restAt: 300, examAt: 100 } };
  const b = { stats: {}, prefs: { at: 200, newPerDay: 40, coachRest: [], restAt: 150, examAt: 200 } };
  const m = mergeProgress(a, b);
  assert.equal(m.prefs.newPerDay, 40);
  assert.deepEqual(m.prefs.coachRest, [6]);
  assert.equal(m.prefs.restAt, 300);
  // 예전 설정(restAt 없음)은 설정 전체를 바꾼 시각으로 봄
  const old = mergeProgress({ stats: {}, prefs: { at: 500, coachRest: [0] } }, b);
  assert.deepEqual(old.prefs.coachRest, [0]);
});

test('하던 학습(이어하기)도 기기끼리: 더 최근에 바꾼 쪽으로, 끝내거나 지운 것(data: null)도 퍼짐', async () => {
  const { mergeProgress } = await import('../js/core.js');
  const phone = { stats: {}, sess: { at: 200, data: { queue: ['a', 'b'], pos: 1 } } };
  const pc = { stats: {}, sess: { at: 100, data: null } };
  assert.deepEqual(mergeProgress(pc, phone).sess, phone.sess);
  assert.deepEqual(mergeProgress(phone, { stats: {}, sess: { at: 300, data: null } }).sess, { at: 300, data: null });
  assert.deepEqual(mergeProgress(phone, { stats: {} }).sess, phone.sess); // 예전 앱(sess 없음)과 합쳐도 그대로
  assert.equal(mergeProgress({ stats: {} }, { stats: {} }).sess, undefined);
});

test('다시 나오기: 고른 때마다 한 번씩, 남아 있던 같은 단어는 빼고 새로', async () => {
  const { requeue, cleanAgain, AGAIN_REC, AGAIN_OLD } = await import('../js/core.js');
  const q = ['x', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'];
  const lo = () => 0, hi = () => 0.999;
  // 조금 뒤(3~5) + 나중에(8~12): 가장 짧은 간격이면 3문제 뒤, 그다음 (조금 뒤 하나가 끼어서) 9문제 뒤
  const r = requeue(q, 0, 'x', ['mid', 'late'], lo);
  assert.equal(r.indexOf('x', 1), 4);
  assert.equal(r.lastIndexOf('x'), 10);
  assert.equal(r.filter(v => v === 'x').length, 3);
  // 곧(1~2) 가장 긴 간격 → 2문제 뒤, 맨 끝 → 마지막
  const s = requeue(q, 0, 'x', ['soon', 'end'], hi);
  assert.equal(s.indexOf('x', 1), 3);
  assert.equal(s.at(-1), 'x');
  // 다시 틀리면 남아 있던 것은 지우고 새로
  const t = requeue(s, 3, 'x', ['mid'], lo);
  assert.equal(t.filter((v, i) => v === 'x' && i > 3).length, 1);
  // 하나도 안 고르면 이번엔 다시 안 나옴
  assert.deepEqual(requeue(q, 0, 'x', [], lo), q);
  // 남은 문제가 모자라면 맨 끝 하나로 (연달아 같은 단어 안 나옴)
  assert.deepEqual(requeue(['x', 'a'], 0, 'x', ['mid', 'late', 'end'], lo), ['x', 'a', 'x']);
  // 설정 정리: 모르는 값은 버리고, 없으면 추천
  assert.deepEqual(cleanAgain(null), AGAIN_REC);
  assert.deepEqual(cleanAgain({ wrong: ['end', 'mid', 'zzz'], hint2: [], hint1: ['late'] }), { wrong: ['mid', 'end'], hint2: [], hint1: ['late'] });
  assert.deepEqual(AGAIN_OLD.hint1, []);
});

test('다시 나오기 설정도 두 모드·기기끼리 더 최근에 바꾼 쪽으로', async () => {
  const { mergeProgress } = await import('../js/core.js');
  const a = { stats: {}, prefs: { at: 300, again: { wrong: ['mid'], hint2: ['mid'], hint1: [] }, againAt: 100 } };
  const b = { stats: {}, prefs: { at: 100, again: { wrong: ['end'], hint2: [], hint1: ['late'] }, againAt: 200 } };
  const m = mergeProgress(a, b);
  assert.equal(m.prefs.at, 300);
  assert.deepEqual(m.prefs.again, b.prefs.again);
  assert.equal(m.prefs.againAt, 200);
});

test('하루는 새벽 4시에 바뀜', async () => {
  const { dateStr, addDays } = await import('../js/core.js');
  const at = (h, m = 0) => new Date(2026, 10, 19, h, m).getTime(); // 11월 19일 현지 시각
  assert.equal(dateStr(at(0, 30)), '2026-11-18'); // 자정 넘어도 아직 전날
  assert.equal(dateStr(at(3, 59)), '2026-11-18');
  assert.equal(dateStr(at(4, 0)), '2026-11-19'); // 4시부터 새 날
  assert.equal(dateStr(at(23, 59)), '2026-11-19');
  assert.equal(dateStr(new Date(2026, 0, 1, 2).getTime()), '2025-12-31'); // 해 넘김도
  // 날짜끼리 더하고 빼는 건 4시 경계와 상관없음
  assert.equal(addDays('2026-11-19', 1), '2026-11-20');
  assert.equal(addDays('2026-11-19', -1), '2026-11-18');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
