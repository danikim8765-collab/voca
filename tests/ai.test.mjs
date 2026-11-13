import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 전역 흉내
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
let online = true;
Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online; } }, configurable: true });
let reply = null, calls = [];
globalThis.fetch = async (url, opts = {}) => { calls.push({ url, opts }); return reply(url, opts); };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const { aiGradeMeaning, aiExplainWrong, aiConnect, aiDisconnect, aiEnabled, aiOnline, aiCoachSay, aiCoachChat, chatTranscript, chatFrom, coachModels, numbersOk, aiCoachOnline, aiCoachName, aiName, aiCoachError } = await import('../js/ai.js');
const Q = { word: 'fatal', meaning: '1. 치명적인 2. 결정적인, 중대한', user: '죽음을 부르는', strict: 'mid' };

beforeEach(() => { store.clear(); store.set('voca.ai.on.v1', '1'); online = true; calls = []; reply = () => json({}); });

test('키가 없으면 AI를 안 부름', async () => {
  assert.equal(aiEnabled(), false);
  assert.equal(await aiGradeMeaning(Q), null);
  assert.equal(calls.length, 0);
});

test('키 연결: 맞으면 저장, 401이면 저장 안 함', async () => {
  reply = () => json({}, 401);
  await assert.rejects(aiConnect('bad'), e => e.status === 401);
  assert.equal(aiEnabled(), false);
  reply = () => json({ id: 'claude-haiku-5-5' });
  await aiConnect('sk-ant-x');
  assert.equal(aiEnabled(), true);
  assert.match(calls.at(-1).url, /models\/claude-haiku-5-5$/);
  aiDisconnect();
  assert.equal(aiEnabled(), false);
});

test('오프라인이면 null (규칙 채점으로)', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  online = false;
  assert.equal(aiOnline(), false);
  assert.equal(await aiGradeMeaning(Q), null);
  assert.equal(calls.length, 0);
});

test('AI 응답을 점수로', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  reply = () => json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"score":2,"missing":1,"note":""}' }] });
  assert.deepEqual(await aiGradeMeaning(Q), { score: 2, missing: 1, note: '' });
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(calls[0].opts.headers['x-api-key'], 'k');
  assert.match(body.messages[0].content, /죽음을 부르는/);
});

test('거절·오류·잘못된 응답·네트워크 실패는 null', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  reply = () => json({ stop_reason: 'refusal', content: [] });
  assert.equal(await aiGradeMeaning(Q), null);
  reply = () => json({ error: {} }, 529);
  assert.equal(await aiGradeMeaning(Q), null);
  reply = () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
  assert.equal(await aiGradeMeaning(Q), null);
  reply = () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"score":5,"missing":0,"note":""}' }] });
  assert.equal(await aiGradeMeaning(Q), null);
  reply = () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await aiGradeMeaning(Q), null);
});

test('Gemini 키: 연결, 채점 요청 모양, 응답 읽기', async () => {
  reply = url => json({ name: 'models/gemini-flash-lite-latest' });
  await aiConnect('AIzaTEST');
  assert.equal(JSON.parse(store.get('voca.ai.v1')).provider, 'gemini');
  assert.equal(calls[0].opts.headers['x-goog-api-key'], 'AIzaTEST');
  reply = () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"score":2,"missing":0,"note":""}' }] } }] });
  assert.deepEqual(await aiGradeMeaning(Q), { score: 2, missing: 0, note: '' });
  const last = calls.at(-1);
  assert.match(last.url, /models\/gemini-flash-lite-latest:generateContent$/);
  const body = JSON.parse(last.opts.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.match(body.contents[0].parts[0].text, /죽음을 부르는/);
});

test('Gemini: 모델 이름이 없으면 목록에서 flash-lite를 고름, 틀린 키(400)는 401로', async () => {
  reply = url => /models\?/.test(url)
    ? json({ models: [{ name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9-flash-lite', supportedGenerationMethods: ['generateContent'] }] })
    : json({}, 404);
  await aiConnect('AIzaX');
  assert.equal(JSON.parse(store.get('voca.ai.v1')).model, 'gemini-9-flash-lite');
  store.clear();
  reply = () => json({ error: { status: 'INVALID_ARGUMENT' } }, 400);
  await assert.rejects(aiConnect('AIzaBAD'), e => e.status === 401);
  assert.equal(aiEnabled(), false);
});

test('Gemini: 무료 한도 초과(429)·중간에 끊긴 응답은 null', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'AIza', provider: 'gemini', model: 'm' }));
  reply = () => json({ error: {} }, 429);
  assert.equal(await aiGradeMeaning(Q), null);
  reply = () => json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"sco' }] } }] });
  assert.equal(await aiGradeMeaning(Q), null);
});

test('Groq: 연결하면 모델 목록에서 gpt-oss-120b를 고르고, 채점 요청은 OpenAI 형식', async () => {
  reply = () => json({ data: [{ id: 'qwen/qwen3-32b', active: true }, { id: 'openai/gpt-oss-120b', active: true }] });
  await aiConnect('gsk_TEST');
  const c = JSON.parse(store.get('voca.ai.v1'));
  assert.deepEqual([c.provider, c.model], ['groq', 'openai/gpt-oss-120b']);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer gsk_TEST');
  reply = () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"score":1,"missing":1,"note":"결정적인 뜻도 있어요"}' } }] });
  assert.deepEqual(await aiGradeMeaning(Q), { score: 1, missing: 1, note: '결정적인 뜻도 있어요' });
  const last = calls.at(-1);
  assert.equal(last.url, 'https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(last.opts.body);
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.response_format.type, 'json_object');
});

test('Groq: 틀린 키(401), 한도 초과(429)', async () => {
  reply = () => json({ error: {} }, 401);
  await assert.rejects(aiConnect('gsk_BAD'), e => e.status === 401);
  assert.equal(aiEnabled(), false);
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_x', provider: 'groq', model: 'openai/gpt-oss-120b' }));
  reply = () => json({ error: {} }, 429);
  assert.equal(await aiGradeMeaning(Q), null);
});

test('OpenRouter: 키 확인 후 :free 모델을 고르고, 앞뒤 말이 붙은 JSON도 읽음', async () => {
  reply = url => /\/key$/.test(url) ? json({ data: {} }) : json({ data: [{ id: 'openai/gpt-4o' }, { id: 'meta-llama/llama-9:free' }, { id: 'openai/gpt-oss-120b:free' }] });
  await aiConnect('sk-or-v1-TEST');
  assert.equal(JSON.parse(store.get('voca.ai.v1')).model, 'openai/gpt-oss-120b:free');
  reply = () => json({ choices: [{ finish_reason: 'stop', message: { content: '채점 결과:\n```json\n{"score":2,"missing":0,"note":""}\n```' } }] });
  assert.deepEqual(await aiGradeMeaning(Q), { score: 2, missing: 0, note: '' });
  assert.equal(JSON.parse(calls.at(-1).opts.body).response_format, undefined);
});

test('모르는 키 모양은 회사마다 물어보고, 다 안 되면 unknown', async () => {
  reply = () => json({ error: { message: 'bad key' } }, 401);
  await assert.rejects(aiConnect('hello'), e => e.status === 401 && e.reason === 'unknown');
  assert.equal(calls.length, 4);
  // Gemini가 받아 주면 Gemini로 연결 (앞뒤 공백·줄바꿈은 지움)
  calls = [];
  reply = url => (url.includes('generativelanguage') ? json({ name: 'models/gemini-flash-lite-latest' }) : json({}, 401));
  await aiConnect('  newstyle-key-123\n');
  assert.equal(aiName(), 'Gemini');
  assert.equal(calls[0].opts.headers['x-goog-api-key'], 'newstyle-key-123');
});

test('Gemini 키 연결 실패 까닭: 틀린 키, 꺼진 API, 제한', async () => {
  const err = (status, reason, message) => () => json({ error: { code: status, message, status: 'X', details: [{ reason }] } }, status);
  reply = err(400, 'API_KEY_INVALID', 'API key not valid. Please pass a valid API key.');
  await assert.rejects(aiConnect('AIzaBAD', 'coach'), e => e.reason === 'invalid' && /not valid/.test(e.detail));
  reply = err(403, 'SERVICE_DISABLED', 'Generative Language API has not been used in project 123 before or it is disabled.');
  await assert.rejects(aiConnect('AIzaX', 'coach'), e => e.reason === 'disabled');
  reply = err(403, 'API_KEY_HTTP_REFERRER_BLOCKED', 'Requests from referer <empty> are blocked.');
  await assert.rejects(aiConnect('AIzaX', 'coach'), e => e.reason === 'restricted');
  // 코치용 Gemini 키는 flash부터
  calls = [];
  reply = () => json({ name: 'models/gemini-flash-latest' });
  await aiConnect('AIzaGOOD', 'coach');
  assert.match(calls[0].url, /models\/gemini-flash-latest$/);
  assert.equal(aiName('coach'), 'Gemini');
});

test('스위치를 끄면 키가 있어도 AI를 안 부름', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_x', provider: 'groq', model: 'm' }));
  store.set('voca.ai.on.v1', '0');
  assert.equal(aiEnabled(), false);
  assert.equal(await aiGradeMeaning(Q), null);
  assert.equal(calls.length, 0);
});

test('왜 틀렸어?: 글자로 받고 마크다운 기호는 뺌, 실패면 null', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_x', provider: 'groq', model: 'openai/gpt-oss-120b' }));
  reply = () => json({ choices: [{ finish_reason: 'stop', message: { content: '**치명적인**은 목숨을 잃게 하는 거예요.' } }] });
  assert.equal(await aiExplainWrong({ word: 'fatal', meaning: '치명적인', user: '명확한', how: 'choice' }), '치명적인은 목숨을 잃게 하는 거예요.');
  const body = JSON.parse(calls.at(-1).opts.body);
  assert.equal(body.response_format, undefined);
  assert.match(body.messages[1].content, /고른 보기/);
  reply = () => json({ error: {} }, 429);
  assert.equal(await aiExplainWrong({ word: 'fatal', meaning: '치명적인', user: 'x' }), null);
  store.set('voca.ai.on.v1', '0');
  assert.equal(await aiExplainWrong({ word: 'fatal', meaning: '치명적인', user: 'x' }), null);
});

const claudeText = t => () => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
// Claude 요청의 지시문·사용자 글 (조각으로 보내도 이어 붙여서)
const sysText = b => (Array.isArray(b.system) ? b.system.map(x => x.text).join('') : b.system);
const userText = b => { const c = b.messages[0].content; return Array.isArray(c) ? c.map(x => x.text).join('') : c; };

test('코치 말: 사실에 없는 숫자를 지어내면 버림', async () => {
  assert.equal(numbersOk('11월 20일까지 하루 25개예요', '11월 20일, 하루 25개'), true);
  assert.equal(numbersOk('하루 30개예요', '하루 25개'), false);
  assert.equal(numbersOk('오늘도 힘내요', ''), true);
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  const facts = '시험까지 14일\n오늘 남은 할 일: 새 단어 19개, 복습 3개';
  reply = claudeText('{"mood":"cheer","text":"시험까지 14일! 새 단어 19개부터 해요."}');
  assert.deepEqual(await aiCoachSay({ char: 'owl', facts }), { mood: 'cheer', text: '시험까지 14일! 새 단어 19개부터 해요.' });
  const body = JSON.parse(calls[0].opts.body);
  assert.match(sysText(body), /부엉이/);
  assert.match(userText(body), /새 단어 19개/);
  reply = claudeText('{"mood":"cheer","text":"오늘은 새 단어 20개예요."}');
  assert.equal(await aiCoachSay({ char: 'owl', facts }), null);
  reply = claudeText('{"mood":"angry","text":"좋아요."}');
  assert.equal((await aiCoachSay({ char: 'cat', facts })).mood, 'normal');
});

test('코치 말: 스위치를 끄거나 하루 한도를 넘으면 안 부름', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  store.set('voca.ai.on.v1', '0');
  assert.equal(await aiCoachSay({ char: 'cat', facts: '' }), null);
  assert.equal(calls.length, 0);
  store.set('voca.ai.on.v1', '1');
  reply = claudeText('{"mood":"normal","text":"좋아요."}');
  let ok = 0;
  for (let i = 0; i < 35; i++) if (await aiCoachSay({ char: 'cat', facts: '' })) ok++;
  assert.equal(ok, 30);
  assert.equal(calls.length, 30);
});

test('코치와 이야기: AI는 한 번만 부르고, 학생이 원하는 값(쉬는 요일·하루 개수·복습 날 수·오늘 개수)만 뽑음', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  const args = { char: 'slime', facts: '시험까지 23일', weak: '- fatal: 치명적인 (틀림 3번, 맞힘 1번)', notes: ['수요일은 학원'], message: '토요일날 빼고 40개씩 하면 복습 며칠' };
  reply = claudeText('{"mood":"normal","text":"토요일을 쉬고 40개씩으로 계산해 볼게요.","review":0,"perDay":40,"rest":"6","today":-1,"remember":""}');
  assert.deepEqual(await aiCoachChat(args), { mood: 'normal', text: '토요일을 쉬고 40개씩으로 계산해 볼게요.', plan: { perDay: 40, rest: [6] }, remember: '' });
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].opts.body);
  assert.match(sysText(body), /슬라임/);
  assert.match(sysText(body), /자기 생각이 있는 코치/);
  assert.match(userText(body), /<message>토요일날 빼고 40개씩 하면 복습 며칠<\/message>/);
  assert.match(userText(body), /fatal/);
  assert.match(userText(body), /- 수요일은 학원/);
  // 일정 얘기가 아니면 값 없음. 요일 글자, 쉬는 요일 없애기, 개수와 복습 날 수를 같이 주면 개수만
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":0,"perDay":0,"rest":"","today":-1,"remember":""}');
  assert.equal((await aiCoachChat(args)).plan, null);
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":7,"perDay":0,"rest":"토,일","today":50,"remember":""}');
  assert.deepEqual((await aiCoachChat(args)).plan, { review: 7, rest: [0, 6], today: 50 });
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":7,"perDay":30,"rest":"-","today":-1,"remember":""}');
  assert.deepEqual((await aiCoachChat(args)).plan, { perDay: 30, rest: [] });
});

test('코치와 이야기: 숫자·길이·형식으로 말을 버리지 않고, 하루 횟수도 세지 않음', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  const args = { char: 'owl', facts: '시험까지 23일', message: '요령 좀' };
  // 사실에 없는 숫자, 긴 답, 줄바꿈·목록도 그대로. 굵게 표시 같은 기호만 뺌
  const long = '하루에 3번, 5분씩 소리 내어 읽어 봐요.\n- **fatal**은 fate(운명)에서 왔어요.\n* 빈칸 문제: The wound was ___.\n' + '가'.repeat(600);
  reply = claudeText(JSON.stringify({ mood: 'cheer', text: long, rest: '', perDay: 0, review: 0, today: -1, remember: '소리 내어 외우는 걸 좋아함' }));
  const r = await aiCoachChat(args);
  assert.match(r.text, /^하루에 3번, 5분씩 소리 내어 읽어 봐요\.\n- fatal은 fate\(운명\)에서 왔어요\.\n- 빈칸 문제: The wound was ___\./);
  assert.ok(r.text.length > 600);
  assert.equal(r.remember, '소리 내어 외우는 걸 좋아함');
  // JSON이 깨져 와도 말은 살림: 글만 온 경우, 중간에 끊긴 JSON
  reply = claudeText('그냥 글로 답했어요.');
  assert.deepEqual(await aiCoachChat(args), { mood: 'normal', text: '그냥 글로 답했어요.', plan: null, remember: '' });
  reply = claudeText('{"mood":"happy","text":"여기까지는 왔는데');
  assert.equal((await aiCoachChat(args)).text, '여기까지는 왔는데');
  // 홈 말풍선의 하루 한도(30번)를 다 써도 대화는 됨
  store.set('voca.ai.coachuse.v1', JSON.stringify({ d: new Date().toLocaleDateString('sv'), n: 999 }));
  reply = claudeText('{"mood":"normal","text":"좋아요."}');
  assert.equal(await aiCoachSay({ char: 'cat', facts: '' }), null);
  assert.equal(aiCoachError(), 'limit');
  assert.equal((await aiCoachChat(args)).text, '좋아요.');
  // 실패 까닭
  reply = () => json({}, 429);
  assert.equal(await aiCoachChat(args), null);
  assert.equal(aiCoachError(), '429');
});

test('코치와 이야기: 앞선 이야기는 날짜를 적어 넘기고, 길면 오래된 것부터 뺌', () => {
  const h = [
    { who: 'me', text: '수요일은 학원이야', day: '11월 12일' }, { who: 'coach', text: '알겠어요.', day: '11월 12일' },
    { who: 'me', text: '하루 40개씩 하면?', day: '11월 13일' }, { who: 'app', text: '토요일 쉼 · 새 단어 하루 40개', day: '11월 13일' },
  ];
  assert.equal(chatTranscript(h), '(11월 12일)\n학생: 수요일은 학원이야\n코치: 알겠어요.\n(11월 13일)\n학생: 하루 40개씩 하면?\n[앱 계산]: 토요일 쉼 · 새 단어 하루 40개');
  assert.equal(chatTranscript(h, { max: 2 }), '(11월 13일)\n학생: 하루 40개씩 하면?\n[앱 계산]: 토요일 쉼 · 새 단어 하루 40개');
  const big = Array.from({ length: 30 }, (_, i) => ({ who: 'me', text: `${i}`.padEnd(500, '가') }));
  assert.equal(chatTranscript(big, { chars: 2000 }).split('\n').length, 4);
  assert.equal(chatTranscript(big, { chars: 10 }).split('\n').length, 2); // 아무리 길어도 마지막 둘은 남김
});

test('코치: 고른 모델이 막히면(503·429·시간 초과) 다른 모델로 넘어가고, 막힌 모델은 잠깐 건너뜀', async () => {
  assert.deepEqual(coachModels({ provider: 'gemini', model: 'gemini-flash-latest' }), ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  assert.deepEqual(coachModels({ provider: 'gemini', model: 'gemini-flash-lite-latest' }), ['gemini-flash-lite-latest']);
  assert.deepEqual(coachModels({ provider: 'groq', model: 'openai/gpt-oss-120b' }), ['openai/gpt-oss-120b']);
  // Claude: 말풍선은 Haiku만, 코치와 이야기하기는 Sonnet → 막히면 Haiku
  assert.deepEqual(coachModels({ provider: 'claude', model: 'claude-haiku-5-5' }), ['claude-haiku-5-5']);
  assert.deepEqual(coachModels({ provider: 'claude', model: 'claude-haiku-5-5' }, true), ['claude-sonnet-5-5', 'claude-haiku-5-5']);
  store.set('voca.ai.coach.v1', JSON.stringify({ key: 'AIzaCoach', provider: 'gemini', model: 'gemini-flash-latest' }));
  const good = t => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: t }] } }] });
  const say = '{"mood":"normal","text":"좋아요.","rest":"","perDay":0,"review":0,"today":-1,"remember":""}';
  reply = url => (/flash-latest/.test(url) ? json({ error: { code: 503 } }, 503) : good(say));
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '좋아요.');
  assert.deepEqual(calls.map(c => c.url.match(/models\/([^:]+)/)[1]), ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  // 요청 모양: 생각은 짧게, 답은 JSON 스키마로
  const body = JSON.parse(calls[1].opts.body);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 512 });
  assert.ok(body.generationConfig.responseSchema.properties.perDay);
  // 방금 막혔던 모델은 뒤로 미루고 바로 다른 모델부터
  calls = [];
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '좋아요.');
  assert.deepEqual(calls.map(c => c.url.match(/models\/([^:]+)/)[1]), ['gemini-flash-lite-latest']);
  // 그 모델마저 막히면 미뤄 둔 모델을 다시 해 봄
  calls = [];
  reply = url => (/flash-lite/.test(url) ? json({ error: { code: 503 } }, 503) : good(say));
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '좋아요.');
  assert.deepEqual(calls.map(c => c.url.match(/models\/([^:]+)/)[1]), ['gemini-flash-lite-latest', 'gemini-flash-latest']);
  // 모델이 하나뿐이면(Groq) 서버 오류일 때만 한 번 더, 한도 초과(429)는 다시 안 부름
  store.delete('voca.ai.coach.v1');
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_main', provider: 'groq', model: 'openai/gpt-oss-120b' }));
  calls = [];
  let n = 0;
  reply = () => (n++ ? json({ choices: [{ finish_reason: 'stop', message: { content: say } }] }) : json({}, 502));
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '좋아요.');
  assert.equal(calls.length, 2);
  calls = [];
  reply = () => json({}, 429);
  assert.equal(await aiCoachChat({ char: 'cat', facts: '', message: '안녕' }), null);
  assert.equal(calls.length, 1);
});

test('코치용 키를 따로 넣으면 코치는 그 AI, 채점은 원래 AI', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_main', provider: 'groq', model: 'openai/gpt-oss-120b' }));
  // 코치용 키가 없으면 코치도 채점용(Groq)을 씀
  assert.equal(aiCoachName(), 'Groq');
  reply = () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"mood":"happy","text":"좋아요."}' } }] });
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  assert.match(calls.at(-1).url, /groq\.com/);
  // 코치용 Claude 키 연결
  reply = () => json({ id: 'claude-sonnet-5-5' });
  await aiConnect('sk-ant-coach', 'coach');
  assert.deepEqual([aiName(), aiName('coach'), aiCoachName()], ['Groq', 'Claude', 'Claude']);
  reply = claudeText('{"mood":"happy","text":"좋아요."}');
  await aiCoachSay({ char: 'cat', facts: '' });
  assert.match(calls.at(-1).url, /anthropic\.com/);
  assert.equal(calls.at(-1).opts.headers['x-api-key'], 'sk-ant-coach');
  // 채점은 그대로 Groq
  reply = () => json({ choices: [{ finish_reason: 'stop', message: { content: '{"score":2,"missing":0,"note":""}' } }] });
  assert.equal((await aiGradeMeaning(Q)).score, 2);
  assert.match(calls.at(-1).url, /groq\.com/);
  // 채점용 키 없이 코치용만 있어도 코치는 동작
  aiDisconnect();
  assert.equal(aiEnabled(), false);
  assert.equal(aiCoachOnline(), true);
  aiDisconnect('coach');
  assert.equal(aiCoachOnline(), false);
});

test('AQ.로 시작하는 Google 키: Gemini API가 안 받으면 Vertex AI로 연결', async () => {
  const tokErr = () => json({ error: { code: 401, message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED' }] } }, 401);
  // Gemini API가 받으면 그대로 Gemini
  reply = () => json({ name: 'models/gemini-flash-latest' });
  await aiConnect('AQ.good', 'coach');
  assert.equal(aiName('coach'), 'Gemini');
  // Gemini API는 안 받고 Vertex는 받음 (없는 모델은 건너뜀)
  calls = [];
  reply = (url, o) => (url.includes('generativelanguage') ? tokErr() : url.includes('gemini-3-flash:') || url.includes('gemini-3-flash-preview') ? json({ error: { code: 404 } }, 404) : json({ candidates: [] }));
  await aiConnect('AQ.vertex', 'coach');
  assert.equal(aiName('coach'), 'Gemini(Vertex AI)');
  assert.match(calls.at(-1).url, /aiplatform\.googleapis\.com\/v1\/publishers\/google\/models\/gemini-2\.5-flash:generateContent$/);
  // 코치 말도 Vertex 주소로
  reply = () => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"mood":"happy","text":"좋아요."}' }] } }] });
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  assert.match(calls.at(-1).url, /aiplatform\.googleapis\.com.*gemini-2\.5-flash:generateContent$/);
  assert.equal(calls.at(-1).opts.headers['x-goog-api-key'], 'AQ.vertex');
  // 채점용 칸이면 flash-lite부터
  calls = [];
  reply = (url) => (url.includes('generativelanguage') ? tokErr() : /flash-lite(-preview)?:/.test(url) && url.includes('gemini-3') ? json({ error: { code: 404 } }, 404) : json({ candidates: [] }));
  await aiConnect('AQ.vertex');
  assert.match(calls.at(-1).url, /gemini-2\.5-flash-lite:generateContent$/);
  // 둘 다 안 받으면 tokentype
  reply = () => tokErr();
  await assert.rejects(aiConnect('AQ.bad', 'coach'), e => e.reason === 'tokentype');
});

test('Gemini 코치: 생각을 짧게 하라고 보내고, 생각 설정을 안 받는 모델(400)이면 빼고 다시', async () => {
  store.set('voca.ai.coach.v1', JSON.stringify({ key: 'AIza', provider: 'gemini', model: 'gemini-3-flash' }));
  const ok = json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"mood":"happy","text":"좋아요."}' }] } }] });
  reply = () => ok;
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  let g = JSON.parse(calls.at(-1).opts.body).generationConfig;
  assert.deepEqual(g.thinkingConfig, { thinkingLevel: 'low' });
  assert.ok(g.maxOutputTokens >= 8192);
  store.set('voca.ai.coach.v1', JSON.stringify({ key: 'AIza', provider: 'gemini', model: 'gemini-flash-latest' }));
  calls = [];
  reply = (url, o) => (JSON.parse(o.body).generationConfig.thinkingConfig ? json({ error: {} }, 400) : ok);
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].opts.body).generationConfig.thinkingConfig, { thinkingBudget: 512 });
});

test('코치와 이야기: 요령 속 작은 숫자(3가지, 5분)는 사실에 없어도 그대로 보여 줌', async () => {
  assert.equal(numbersOk('3가지 방법이 있어요. 5분 뒤에 다시 봐요', '', true), true);
  assert.equal(numbersOk('5분 뒤에 다시 봐요', ''), false);
  assert.equal(numbersOk('복습을 4번 돌아요', '', true), false);
  assert.equal(numbersOk('하루 30개예요', '하루 25개', true), false);
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  reply = claudeText('{"mood":"cheer","text":"소리 내어 읽고 5분 뒤에 다시 떠올려 봐요.","review":0,"perDay":0,"rest":"","today":-1}');
  const res = await aiCoachChat({ char: 'owl', facts: '시험까지 14일', table: '', maxReview: 5, message: '잘 외우는 법 알려줘' });
  assert.equal(res.text, '소리 내어 읽고 5분 뒤에 다시 떠올려 봐요.');
});

test('Claude: 채점·말풍선은 Haiku, 코치와 이야기하기는 Sonnet (예전에 Sonnet으로 저장된 키도)', async t => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'sk-ant-old', provider: 'claude', model: 'claude-sonnet-5-5' }));
  // 앞선 테스트에서 막혀 잠시 쉬는 모델이 있을 수 있어서 시각을 1시간 뒤로
  const realNow = Date.now;
  Date.now = () => realNow() + 3600000;
  t.after(() => { Date.now = realNow; });
  const model = () => JSON.parse(calls.at(-1).opts.body).model;
  reply = claudeText('{"score":2,"missing":0,"note":""}');
  assert.equal((await aiGradeMeaning(Q)).score, 2);
  assert.equal(model(), 'claude-haiku-5-5');
  reply = claudeText('{"mood":"happy","text":"좋아요."}');
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  assert.equal(model(), 'claude-haiku-5-5');
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":0,"perDay":0,"rest":"","today":-1,"remember":""}');
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '좋아요!');
  assert.equal(model(), 'claude-sonnet-5-5');
  // Sonnet이 붐비면(529) Haiku로 넘어감
  calls = [];
  reply = (url, opts) => (JSON.parse(opts.body).model === 'claude-sonnet-5-5' ? json({ error: {} }, 529) : claudeText('{"mood":"normal","text":"대신 답해요.","review":0,"perDay":0,"rest":"","today":-1,"remember":""}')());
  assert.equal((await aiCoachChat({ char: 'cat', facts: '', message: '안녕' })).text, '대신 답해요.');
  assert.deepEqual(calls.map(c => JSON.parse(c.opts.body).model), ['claude-sonnet-5-5', 'claude-haiku-5-5']);
});

test('토큰 아끼기: 같은 단어에 같은 답이면 채점·왜 틀렸어?를 다시 부르지 않음 (실패는 기억 안 함)', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'sk-ant-x', provider: 'claude' }));
  reply = () => json({}, 529);
  assert.equal(await aiGradeMeaning(Q), null);
  reply = claudeText('{"score":2,"missing":0,"note":"같은 뜻이에요"}');
  assert.equal((await aiGradeMeaning(Q)).score, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(await aiGradeMeaning({ ...Q, user: '  죽음을   부르는 ' }), { score: 2, missing: 0, note: '같은 뜻이에요' });
  assert.equal(calls.length, 2); // 띄어쓰기만 다른 같은 답
  await aiGradeMeaning({ ...Q, strict: 'hard' }); // 기준이 다르면 다시 물음
  await aiGradeMeaning({ ...Q, user: '치명적' }); // 답이 다르면 다시 물음
  assert.equal(calls.length, 4);
  // 오프라인이면 기억해 둔 것도 안 씀(규칙 채점 그대로, 예전과 같음)
  online = false;
  assert.equal(await aiGradeMeaning(Q), null);
  online = true;
  reply = claudeText('치명적인은 목숨과 관련돼요.');
  const ex = { word: 'fatal', meaning: '치명적인', user: '명확한', how: 'choice' };
  assert.equal(await aiExplainWrong(ex), '치명적인은 목숨과 관련돼요.');
  assert.equal(await aiExplainWrong(ex), '치명적인은 목숨과 관련돼요.');
  assert.equal(calls.length, 5);
});

test('토큰 아끼기: Claude는 지시문과 앞선 이야기를 캐시로, 대화 답 한도는 넉넉히', async t => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'sk-ant-x', provider: 'claude' }));
  const realNow = Date.now;
  Date.now = () => realNow() + 7200000;
  t.after(() => { Date.now = realNow; });
  reply = claudeText('{"score":1,"missing":1,"note":""}');
  await aiGradeMeaning(Q);
  let body = JSON.parse(calls.at(-1).opts.body);
  assert.deepEqual(body.system.at(-1).cache_control, { type: 'ephemeral' });
  assert.equal(typeof body.messages[0].content, 'string');
  assert.equal(body.max_tokens, 2048);
  const say = '{"mood":"normal","text":"좋아요.","review":0,"perDay":0,"rest":"","today":-1,"remember":""}';
  reply = claudeText(say);
  const history = [{ who: 'me', text: '안녕', day: '11월 13일', t: 1 }, { who: 'coach', text: '반가워요.', day: '11월 13일', t: 2 }];
  await aiCoachChat({ char: 'cat', facts: '시험까지 9일', history, message: '퀴즈 내 줘', day: '11월 13일' });
  body = JSON.parse(calls.at(-1).opts.body);
  assert.equal(body.max_tokens, 8192);
  const blocks = body.messages[0].content;
  // 상황 → 이야기 한 줄씩 → 방금 한 말. 방금 한 말 바로 앞 조각까지 캐시
  assert.deepEqual(blocks.map(b => !!b.cache_control), [false, false, true, false]);
  assert.match(blocks[0].text, /<facts>\n시험까지 9일/);
  assert.equal(blocks[1].text, '(11월 13일)\n학생: 안녕\n');
  assert.match(blocks.at(-1).text, /<message>퀴즈 내 줘<\/message>$/);
  // 조각을 이어 붙이면 다른 회사에 보내는 한 덩어리 글과 같음
  assert.equal(userText(body), `<facts>\n시험까지 9일\n</facts>\n<weak>\n(아직 틀린 단어 기록이 없음)\n</weak>\n<memory>\n(아직 없음)\n</memory>\n앞선 이야기:\n${chatTranscript(history)}\n(11월 13일, 지금)\n학생이 방금 한 말:\n<message>퀴즈 내 줘</message>`);
  // 다음 번: 지난번에 보낸 조각이 그대로 앞에 있음 (캐시에서 읽힘)
  const next = [...history, { who: 'me', text: '퀴즈 내 줘', day: '11월 13일', t: 3 }, { who: 'coach', text: 'fatal의 뜻은?', day: '11월 13일', t: 4 }];
  await aiCoachChat({ char: 'cat', facts: '시험까지 9일', history: next, message: '치명적인', day: '11월 13일' });
  const again = JSON.parse(calls.at(-1).opts.body).messages[0].content;
  assert.deepEqual(again.slice(0, 3).map(b => b.text), blocks.slice(0, 3).map(b => b.text));
  assert.deepEqual(again.map(b => !!b.cache_control), [false, false, false, false, true, false]);
});

test('토큰 아끼기: 앞선 이야기는 매번 한 줄씩 밀지 않고, 넘칠 때만 한 번에 줄임 (줄여도 예전 양 이상)', () => {
  const h = Array.from({ length: 100 }, (_, i) => ({ who: i % 2 ? 'coach' : 'me', text: 'x'.repeat(100) }));
  const win = { max: 60, chars: 10500, lo: { max: 40, chars: 7000 } };
  // 처음엔 한도까지
  assert.equal(chatFrom(h.slice(0, 80), win), 20);
  // 지난번 시작이 아직 한도 안이면 그대로
  assert.equal(chatFrom(h.slice(0, 80), { ...win, prev: 30 }), 30);
  assert.equal(chatFrom(h.slice(0, 90), { ...win, prev: 30 }), 30);
  // 넘치면 lo(40개)까지 줄임 → 다음 몇 번은 다시 그대로
  assert.equal(chatFrom(h.slice(0, 91), { ...win, prev: 30 }), 51);
  assert.equal(chatFrom(h.slice(0, 95), { ...win, prev: 51 }), 51);
  // 글자 수로도: 긴 말이 들어와 10500자를 넘으면 7000자 안쪽으로
  const long = [...h.slice(0, 60), { who: 'coach', text: 'y'.repeat(6000) }];
  assert.equal(chatFrom(long, { ...win, prev: 30 }), 30); // 9000자: 아직 그대로
  const f = chatFrom(long, { ...win, prev: 10 }); // 11000자: 넘침
  assert.ok(long.slice(f).reduce((n, x) => n + x.text.length, 0) <= 7000);
  assert.ok(long.slice(f).reduce((n, x) => n + x.text.length, 0) > 6800);
  // 예전 함수(chatTranscript)는 그대로
  assert.equal(chatTranscript(h, { max: 40 }).split('\n').length, 40);
});
