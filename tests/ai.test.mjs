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

const { aiCoachErrorDetail, aiGradeMeaning, aiExplainWrong, aiConnect, aiDisconnect, aiEnabled, aiOnline, aiCoachSay, aiCoachChat, aiCoachExplain, numbersOk, aiCoachOnline, aiCoachName, aiName, aiCoachError } = await import('../js/ai.js');
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
  reply = () => json({ id: 'claude-sonnet-5-5' });
  await aiConnect('sk-ant-x');
  assert.equal(aiEnabled(), true);
  assert.match(calls.at(-1).url, /models\/claude-sonnet-5-5$/);
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
  assert.equal(body.model, 'claude-sonnet-5-5');
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

test('코치 말: 사실에 없는 숫자를 지어내면 버림', async () => {
  assert.equal(numbersOk('11월 20일까지 하루 25개예요', '11월 20일, 하루 25개'), true);
  assert.equal(numbersOk('하루 30개예요', '하루 25개'), false);
  assert.equal(numbersOk('오늘도 힘내요', ''), true);
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  const facts = '시험까지 14일\n오늘 남은 할 일: 새 단어 19개, 복습 3개';
  reply = claudeText('{"mood":"cheer","text":"시험까지 14일! 새 단어 19개부터 해요."}');
  assert.deepEqual(await aiCoachSay({ char: 'owl', facts }), { mood: 'cheer', text: '시험까지 14일! 새 단어 19개부터 해요.' });
  const body = JSON.parse(calls[0].opts.body);
  assert.match(body.system, /부엉이/);
  assert.match(body.messages[0].content, /새 단어 19개/);
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

test('코치와 이야기: 바꿀 값(복습 날 수·쉬는 요일·오늘 개수)을 받아 옴, 학생이 말한 숫자는 써도 됨', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'k' }));
  const args = { char: 'slime', facts: '시험까지 23일', table: '전체 복습 6일: 하루 24개\n전체 복습 10일: 하루 31개', maxReview: 22, message: '토요일날 빼고 30개씩 하면 복습 몇번' };
  reply = claudeText('{"mood":"normal","text":"토요일을 쉬는 걸로 계산해 볼게요.","review":0,"perDay":30,"rest":"6","today":-1}');
  const r1 = await aiCoachChat(args);
  assert.deepEqual(r1, { mood: 'normal', text: '토요일을 쉬는 걸로 계산해 볼게요.', change: { perDay: 30, rest: [6] } });
  const body = JSON.parse(calls.at(-1).opts.body);
  assert.match(body.system, /JSON/);
  assert.match(body.messages[0].content, /<message>토요일날 빼고 30개씩 하면 복습 몇번<\/message>/);
  // 바꿀 게 없는 이야기, 요일 글자, 쉬는 요일 없애기, 범위 밖 값
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":0,"rest":"","today":-1}');
  assert.deepEqual((await aiCoachChat(args)).change, null);
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":40,"rest":"토,일","today":50}');
  assert.deepEqual((await aiCoachChat(args)).change, { rest: [0, 6], today: 50 });
  reply = claudeText('{"mood":"cheer","text":"좋아요!","review":0,"rest":"-","today":-1}');
  assert.deepEqual((await aiCoachChat(args)).change, { rest: [] });
  // 학생이 말한 30, 표의 31은 써도 되고, 지어낸 숫자면 말만 비움
  reply = claudeText('{"mood":"normal","text":"30개쯤이면 하루 31개예요.","review":10,"rest":"","today":-1}');
  assert.equal((await aiCoachChat(args)).text, '30개쯤이면 하루 31개예요.');
  reply = claudeText('{"mood":"normal","text":"복습을 4번 돌아요.","review":10,"rest":"","today":-1}');
  assert.deepEqual(await aiCoachChat(args), { mood: 'normal', text: '', change: { review: 10 } });
  // 앱이 계산한 결과 설명
  reply = claudeText('{"mood":"cheer","text":"토요일 쉬면 하루 33개예요."}');
  assert.equal((await aiCoachExplain({ char: 'slime', facts: '', message: '토요일 쉴래', result: '새 단어: 하루 33개' })).text, '토요일 쉬면 하루 33개예요.');
  // 실패 까닭
  reply = () => json({}, 429);
  assert.equal(await aiCoachChat(args), null);
  assert.equal(aiCoachError(), '429');
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

test('코치 AI 실패 처리: Groq JSON 모드 400이면 JSON 모드 없이 다시, 끊기면 까닭을 남김', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_x', provider: 'groq', model: 'openai/gpt-oss-120b' }));
  const args = { char: 'cat', facts: '', table: '', maxReview: 10, message: '하루 40개씩 하면?' };
  let n = 0;
  reply = (url, o) => {
    const b = JSON.parse(o.body);
    n++;
    if (b.response_format) return json({ error: { message: 'Failed to generate JSON. Please adjust your prompt.', code: 'json_validate_failed' } }, 400);
    return json({ choices: [{ finish_reason: 'stop', message: { content: '좋아요 {"mood":"normal","text":"계산해 볼게요.","review":0,"perDay":40,"rest":"","today":-1}' } }] });
  };
  const r = await aiCoachChat(args);
  assert.equal(n, 2);
  assert.deepEqual(r.change, { perDay: 40 });
  assert.equal(JSON.parse(calls.at(-1).opts.body).max_tokens, 8192);
  // 길이 초과로 끊김
  reply = () => json({ choices: [{ finish_reason: 'length', message: { content: '{"mood"' } }] });
  assert.equal(await aiCoachChat(args), null);
  assert.deepEqual([aiCoachError(), aiCoachErrorDetail()], ['cut', 'length']);
  // 다른 오류는 서버 말을 남김
  reply = () => json({ error: { message: 'model overloaded' } }, 503);
  assert.equal(await aiCoachChat(args), null);
  assert.deepEqual([aiCoachError(), aiCoachErrorDetail()], ['503', 'model overloaded']);
});

test('Gemini가 스키마를 안 받으면(400) 스키마 없이 한 번 더', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'AIzaX', provider: 'gemini', model: 'gemini-flash-lite-latest' }));
  reply = (url, o) => (JSON.parse(o.body).generationConfig.responseSchema
    ? json({ error: { message: 'Invalid JSON payload' } }, 400)
    : json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"mood":"happy","text":"좋아요."}' }] } }] }));
  assert.equal((await aiCoachSay({ char: 'cat', facts: '' })).text, '좋아요.');
  assert.equal(calls.length, 2);
});
