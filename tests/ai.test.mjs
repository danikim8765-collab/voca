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

beforeEach(() => { store.clear(); online = true; calls = []; reply = () => json({}); });

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
