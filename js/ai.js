// 단어 모드 직접 입력의 AI 재확인. 규칙 채점(core.js의 gradeMeaning)이 정답이 아니라고 할 때만,
// 인터넷이 되고 API 키가 있으면 부른다. 안 되거나 실패하면 null → 규칙 채점 결과 그대로.
// 키 앞부분으로 회사를 고른다: AIza… = Google Gemini(무료 등급), sk-ant-… = Anthropic Claude(유료)
// 서버 없이 브라우저에서 바로 부른다. 키는 이 기기의 localStorage에만 저장 (동기화 안 함)

const KEY = 'voca.ai.v1'; // { key, provider, model } 두 모드가 같이 씀
const TIMEOUT_MS = 12000;

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-flash-lite-latest'; // 가장 빠르고 무료 한도가 넉넉한 쪽. 없으면 연결할 때 목록에서 고름
const CLAUDE_API = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-5-5';

const loadConf = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveConf = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };

export const providerOf = key => (/^sk-ant-/.test(key) ? 'claude' : /^AIza/.test(key) ? 'gemini' : '');
const conf = () => { const c = loadConf(); return c.key && !c.provider ? { ...c, provider: providerOf(c.key) || 'claude' } : c; };
export const aiProvider = () => conf().provider || '';
export const aiEnabled = () => !!conf().key;
export const aiOnline = () => aiEnabled() && navigator.onLine !== false;
export const aiName = () => ({ gemini: 'Gemini', claude: 'Claude' }[aiProvider()] || 'AI');

const claudeHeaders = key => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2026-10-21',
  // 서버 없이 브라우저에서 바로 부를 때 필요한 헤더 (키는 사용자 본인 것)
  'anthropic-dangerous-direct-browser-access': 'true',
});
const geminiHeaders = key => ({ 'content-type': 'application/json', 'x-goog-api-key': key });

const fail = status => Object.assign(new Error(String(status)), { status });

// 키가 맞는지 확인 (모델 정보 조회라 비용 없음). 맞으면 저장. 틀린 키는 status 401로 던짐
export async function aiConnect(key) {
  const provider = providerOf(key);
  if (!provider) throw fail(401);
  if (provider === 'claude') {
    const res = await fetch(`${CLAUDE_API}/models/${CLAUDE_MODEL}`, { headers: claudeHeaders(key), cache: 'no-store' });
    if (!res.ok) throw fail(res.status === 403 ? 401 : res.status);
    saveConf({ key, provider, model: CLAUDE_MODEL });
    return;
  }
  const get = path => fetch(`${GEMINI_API}/${path}`, { headers: geminiHeaders(key), cache: 'no-store' });
  let model = GEMINI_MODEL;
  let res = await get(`models/${model}`);
  if (res.status === 404) { // 이름이 바뀌었으면 쓸 수 있는 모델 중에서 flash-lite → flash 순으로
    res = await get('models?pageSize=1000');
    if (res.ok) {
      const names = ((await res.json()).models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
      model = names.find(n => /flash-lite/.test(n)) || names.find(n => /flash/.test(n)) || '';
      if (!model) throw fail(404);
    }
  }
  // Gemini는 틀린 키를 400(API_KEY_INVALID)으로 알려 줌
  if (!res.ok) throw fail([400, 401, 403].includes(res.status) ? 401 : res.status);
  saveConf({ key, provider, model });
}
export function aiDisconnect() { saveConf({}); }

const STRICT_RULE = {
  easy: '여러 뜻 중 하나라도 맞게 쓰면 정답(2)이에요.',
  mid: '비슷한 뜻(같은 갈래의 다른 표현)은 하나만 써도 돼요. 품사나 의미가 서로 다른 뜻이 여럿이면 그중 절반 이상을 써야 정답(2), 하나라도 맞았지만 모자라면 부분 정답(1)이에요.',
  hard: '서로 다른 뜻 갈래를 전부 써야 정답(2), 일부만 맞으면 부분 정답(1)이에요.',
};

const SYSTEM = `영단어 시험의 한글 뜻 주관식 답안을 채점해요.
- 단어장 뜻과 표현이 달라도 같은 의미면 맞은 거예요 (유의어, 다른 어미·품사 활용, 띄어쓰기·맞춤법 실수, 오타는 봐줘요).
- 단어장에 없는 뜻이라도 그 영단어의 실제 사전 뜻으로 맞고 흔히 쓰이면 맞은 걸로 봐요.
- 뜻이 다르거나 너무 막연하면(예: "좋은", "어떤 것") 틀린 거예요. 반대 뜻은 틀린 거예요.
- score는 2 정답, 1 부분 정답, 0 오답이에요.
- missing은 학생이 빠뜨린 단어장 뜻 갈래 수예요.
- note는 학생에게 보여 줄 한 줄 설명이에요 (20자 안팎, 해요체). 정답이면 빈 문자열.`;

const prompt = ({ word, meaning, user, strict }) =>
  `영단어: ${word}\n단어장 뜻: ${meaning}\n채점 기준: ${STRICT_RULE[strict] || STRICT_RULE.mid}\n\n학생 답:\n<answer>${user}</answer>`;

const CLAUDE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', enum: [0, 1, 2], description: '2 정답, 1 부분 정답, 0 오답' },
    missing: { type: 'integer', description: '빠뜨린 뜻 갈래 수' },
    note: { type: 'string', description: '학생에게 보여 줄 짧은 설명' },
  },
  required: ['score', 'missing', 'note'],
  additionalProperties: false,
};
// Gemini responseSchema (OpenAPI 형식)
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: { score: { type: 'INTEGER' }, missing: { type: 'INTEGER' }, note: { type: 'STRING' } },
  required: ['score', 'missing', 'note'],
};

// 회사별 요청 → 응답 JSON 글자. 실패면 null
async function askClaude(c, q, signal) {
  const res = await fetch(`${CLAUDE_API}/messages`, {
    method: 'POST', headers: claudeHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      model: c.model || CLAUDE_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CLAUDE_SCHEMA } },
      messages: [{ role: 'user', content: prompt(q) }],
    }),
  });
  if (!res.ok) return null;
  const msg = await res.json();
  if (msg.stop_reason !== 'end_turn') return null; // refusal·max_tokens 등은 규칙 채점으로
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function askGemini(c, q, signal) {
  const res = await fetch(`${GEMINI_API}/models/${c.model || GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: geminiHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt(q) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) return null; // 429(무료 한도 초과) 등
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  if (!cand || cand.finishReason !== 'STOP') return null;
  return ((cand.content && cand.content.parts) || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
}

/**
 * AI 채점. 반환 { score: 0|1|2, missing, note } 또는 null(오프라인·키 없음·실패 → 규칙 채점으로)
 */
export async function aiGradeMeaning({ word, meaning, user, strict = 'mid' }) {
  const c = conf();
  if (!c.key || navigator.onLine === false) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const q = { word, meaning, user, strict };
    const text = c.provider === 'gemini' ? await askGemini(c, q, ctrl.signal) : await askClaude(c, q, ctrl.signal);
    if (!text) return null;
    const out = JSON.parse(text);
    if (![0, 1, 2].includes(out.score)) return null;
    return { score: out.score, missing: Math.max(0, out.missing | 0), note: String(out.note || '').trim() };
  } catch {
    return null; // 인터넷 끊김, 시간 초과, 잘못된 응답
  } finally {
    clearTimeout(timer);
  }
}
