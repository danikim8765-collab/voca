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

const { aiGradeMeaning, aiConnect, aiDisconnect, aiEnabled, aiOnline } = await import('../js/ai.js');
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

test('모르는 키 모양은 연결 안 함', async () => {
  await assert.rejects(aiConnect('hello'), e => e.status === 401);
  assert.equal(calls.length, 0);
});

test('스위치를 끄면 키가 있어도 AI를 안 부름', async () => {
  store.set('voca.ai.v1', JSON.stringify({ key: 'gsk_x', provider: 'groq', model: 'm' }));
  store.set('voca.ai.on.v1', '0');
  assert.equal(aiEnabled(), false);
  assert.equal(await aiGradeMeaning(Q), null);
  assert.equal(calls.length, 0);
});
