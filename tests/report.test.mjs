import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportRepo, reportReasons, reportText, issueUrl, pushError } from '../js/report.js';

test('신고 저장소: github.io에서 열면 그 저장소, 아니면 원래 저장소', () => {
  assert.equal(reportRepo({ hostname: 'someone.github.io', pathname: '/voca/' }), 'someone/voca');
  assert.equal(reportRepo({ hostname: 'someone.github.io', pathname: '/index.html' }), 'danikim8765-collab/voca');
  assert.equal(reportRepo({ hostname: 'localhost', pathname: '/' }), 'danikim8765-collab/voca');
});

test('신고 이유: 모드·문제 방식에 맞게', () => {
  assert.ok(reportReasons({ mode: 'ex', how: 'choice' }).includes('해석 강조가 이상해요'));
  assert.ok(reportReasons({ mode: 'ex', how: 'choice' }).includes('보기가 이상해요'));
  assert.ok(!reportReasons({ mode: 'word', how: 'type' }).includes('보기가 이상해요'));
  assert.ok(reportReasons({ mode: 'word', how: 'type' }).includes('채점이 이상해요'));
  assert.ok(reportReasons(null).includes('진도·동기화'));
});

test('신고 내용: 문제·보기·버전이 들어가고 최근 오류만', () => {
  const now = Date.UTC(2026, 10, 16);
  const { title, body } = reportText({
    reasons: ['채점이 이상해요'], note: '꽃가루라고 썼는데\n정답이래요',
    ctx: { word: 'pollen', id: 7, day: 31, mode: 'word', how: 'choice', label: '오답', given: '가루', choices: ['꽃가루', '가루', '씨', '잎'], picked: 1, right: 0, meaning: '꽃가루', ex1ko: '**꽃가루** 알레르기' },
    app: { version: '202611131548', ai: 'Groq', device: 'iPhone' },
    errors: [{ t: now - 5 * 864e5, m: '오래된 오류' }, { t: now - 1000, m: 'TypeError: x' }], now,
  });
  assert.equal(title, '[신고] pollen — 채점이 이상해요');
  assert.match(body, /DAY 31/);
  assert.match(body, /2\) 가루 ←고름/);
  assert.match(body, /1\) 꽃가루 ✓/);
  assert.match(body, /> 꽃가루라고 썼는데\n> 정답이래요/);
  assert.match(body, /202611131548 · AI: Groq/);
  assert.match(body, /TypeError: x/);
  assert.doesNotMatch(body, /오래된 오류/);
});

test('이슈 링크: 너무 길면 본문을 잘라 주소 길이를 지킴', () => {
  const url = issueUrl('a/b', '제목', '가'.repeat(5000), 7000);
  assert.ok(url.length <= 7000);
  assert.ok(url.startsWith('https://github.com/a/b/issues/new?labels=bug&title='));
  assert.match(decodeURIComponent(url), /길어서 잘림/);
});

test('오류 기록: 같은 건 한 번, 최근 것만', () => {
  let l = [];
  for (let i = 0; i < 10; i++) l = pushError(l, `e${i}`, i);
  l = pushError(l, 'e9', 99);
  assert.equal(l.length, 8);
  assert.deepEqual(l.at(-1), { t: 99, m: 'e9' });
  assert.equal(pushError(l, '  ', 1), l);
});

test('설문지로 보내기: 미리 채워진 링크에서 설문지와 칸을 찾고, 응답 주소로 보냄', async () => {
  const { parseFormLink, formRequest, formReady, queueReport } = await import('../js/report.js');
  const f = parseFormLink('https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGhIjKlMnOpQrStUvWx/viewform?usp=pp_url&entry.123456789=%EC%95%88%EB%85%95');
  assert.deepEqual(f, { id: '1FAIpQLSdAbCdEfGhIjKlMnOpQrStUvWx', entry: 'entry.123456789' });
  assert.equal(parseFormLink('https://forms.gle/abc'), null);
  assert.ok(formReady(f));
  assert.ok(!formReady({ id: '', entry: '' }));
  const r = formRequest(f, '[신고] fatal — 채점\n\n내용');
  assert.equal(r.url, 'https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGhIjKlMnOpQrStUvWx/formResponse');
  assert.equal(new URLSearchParams(r.body).get('entry.123456789'), '[신고] fatal — 채점\n\n내용');
  let q = [];
  for (let i = 0; i < 35; i++) q = queueReport(q, { id: `r${i}`, text: 'x' });
  assert.equal(q.length, 30);
  assert.equal(q[0].id, 'r5');
  assert.equal(queueReport(q, { id: 'r34', text: 'y' }).filter(x => x.id === 'r34').length, 1);
});
