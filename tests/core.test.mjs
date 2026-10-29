import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, mapColumns, rowsToWords, answerParts, makeBlanks, isTypedCorrect, splitSentence, applyResult, pickWords } from '../js/core.js';

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

test('틀린 단어 우선 출제', () => {
  const now = 1e12;
  const words = Array.from({ length: 20 }, (_, i) => ({ id: 'w' + i, day: 1, blank: 'x' + i }));
  const stats = {};
  for (const w of words) stats[w.id] = applyResult(undefined, true, now - 1000);
  stats.w7 = applyResult(applyResult(stats.w7, false, now - 10), false, now - 5);
  const picked = pickWords(words, stats, 3, 'smart', now, () => 0.5);
  assert.equal(picked[0].id, 'w7');
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
