// 단어 모드 직접 입력의 AI 재확인. 규칙 채점(core.js의 gradeMeaning)이 정답이 아니라고 할 때만,
// 인터넷이 되고 API 키가 있으면 부른다. 안 되거나 실패하면 null → 규칙 채점 결과 그대로.
// 키 앞부분으로 회사를 고른다: gsk_… = Groq(무료), sk-or-… = OpenRouter(무료 모델),
// AIza… = Google Gemini(무료 등급), sk-ant-… = Anthropic Claude(유료)
// 서버 없이 브라우저에서 바로 부른다. 키는 이 기기의 localStorage에만 저장 (동기화 안 함)

const KEY = 'voca.ai.v1'; // { key, provider, model } 두 모드가 같이 씀
// 코치용 키 (따로 넣었을 때만). 없으면 코치도 위의 키를 씀. 채점은 빠른 AI, 코치 말은 한국어가 자연스러운 AI처럼 나눠 쓰려고
const COACH_KEY = 'voca.ai.coach.v1';
const SLOT = { main: KEY, coach: COACH_KEY };
const TIMEOUT_MS = 12000;

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-flash-lite-latest'; // 가장 빠르고 무료 한도가 넉넉한 쪽. 없으면 연결할 때 목록에서 고름
const GEMINI_COACH_MODEL = 'gemini-flash-latest'; // 코치용 키: 말이 더 자연스러운 flash (없으면 목록에서 flash → flash-lite)
const CLAUDE_API = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-5-5';
// OpenAI 형식(chat/completions)을 쓰는 곳. 모델은 연결할 때 목록에서 앞쪽 것부터 고름
const OPENAI_LIKE = {
  groq: { api: 'https://api.groq.com/openai/v1', prefer: [/^openai\/gpt-oss-120b$/, /^openai\/gpt-oss-20b$/, /gpt-oss/, /^qwen/, /llama/], json: true },
  openrouter: { api: 'https://openrouter.ai/api/v1', prefer: [/gpt-oss-120b:free$/, /gpt-oss.*:free$/, /deepseek.*:free$/, /qwen.*:free$/, /llama.*:free$/, /:free$/], json: false },
};

const loadConf = (slot = 'main') => { try { return JSON.parse(localStorage.getItem(SLOT[slot])) || {}; } catch { return {}; } };
const saveConf = (c, slot = 'main') => { try { localStorage.setItem(SLOT[slot], JSON.stringify(c)); } catch {} };

// Google 키: AIza… 또는 AQ.… (AQ.는 Gemini API 키일 수도, Vertex AI 키일 수도 있어서 연결할 때 둘 다 해 봄)
export const providerOf = key => (/^sk-ant-/.test(key) ? 'claude' : /^(AIza|AQ\.)/.test(key) ? 'gemini' : /^gsk_/.test(key) ? 'groq' : /^sk-or-/.test(key) ? 'openrouter' : '');
const conf = (slot = 'main') => { const c = loadConf(slot); return c.key && !c.provider ? { ...c, provider: providerOf(c.key) || 'claude' } : c; };
// 코치가 쓸 설정: 코치용 키가 있으면 그것, 없으면 채점용
const coachConf = () => (conf('coach').key ? conf('coach') : conf());
export const aiProvider = (slot = 'main') => conf(slot).provider || '';
// 설정의 '채점에 AI 사용하기' 스위치 (키와 따로 저장: 끄고 켜도 키는 남음)
const ON_KEY = 'voca.ai.on.v1';
export const aiSwitch = () => { try { return localStorage.getItem(ON_KEY) === '1'; } catch { return false; } };
export const setAiSwitch = on => { try { localStorage.setItem(ON_KEY, on ? '1' : '0'); } catch {} };
export const aiHasKey = (slot = 'main') => !!conf(slot).key;
export const aiEnabled = () => aiSwitch() && aiHasKey();
export const aiOnline = () => aiEnabled() && navigator.onLine !== false;
export const aiName = (slot = 'main') => ({ gemini: 'Gemini', vertex: 'Gemini(Vertex AI)', claude: 'Claude', groq: 'Groq', openrouter: 'OpenRouter' }[aiProvider(slot)] || 'AI');
// 코치가 AI를 쓸 수 있는지 (스위치 + 코치용이나 채점용 키 + 인터넷)
export const aiCoachOnline = () => aiSwitch() && !!coachConf().key && navigator.onLine !== false;
export const aiCoachName = () => (aiHasKey('coach') ? aiName('coach') : aiName());

const claudeHeaders = key => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2026-10-21',
  // 서버 없이 브라우저에서 바로 부를 때 필요한 헤더 (키는 사용자 본인 것)
  'anthropic-dangerous-direct-browser-access': 'true',
});
const geminiHeaders = key => ({ 'content-type': 'application/json', 'x-goog-api-key': key });
// Vertex AI(Google Cloud) express 모드: 같은 Gemini 모델을 다른 주소로. 요청·응답 모양은 Gemini API와 같음
const VERTEX_API = 'https://aiplatform.googleapis.com/v1/publishers/google/models';
// 코치용은 flash부터(말이 자연스럽게), 채점용은 flash-lite부터(빠르고 한도가 넉넉하게)
const VERTEX_MODELS = {
  coach: ['gemini-3-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  main: ['gemini-3-flash-lite', 'gemini-3-flash-lite-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'],
};
const bearer = key => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` });

const fail = status => Object.assign(new Error(String(status)), { status });
// 마지막으로 AI를 못 부른 까닭 (코치가 사용자에게 알려 주려고): '429' 같은 상태 코드, 'timeout', 'network', 'offline', 'cut'(답이 잘림), 'bad'(이상한 답), 'limit'(코치 하루 한도)
let lastErr = '', lastDetail = '';
export const aiCoachError = () => lastErr;
export const aiCoachErrorDetail = () => lastDetail; // 서버가 보낸 말이나 끊긴 까닭 (화면에 같이 보여 줌)
// 실패한 응답에서 서버가 보낸 말을 꺼내 둠
async function noteHttp(res) {
  lastErr = String(res.status);
  try { const j = await res.json(); const e = j.error || j; lastDetail = String((e && (e.message || e.code)) || '').slice(0, 200); } catch { lastDetail = ''; }
  return lastDetail;
}

// 연결 실패를 알려 줄 때 쓰는 까닭. e.status(HTTP 상태), e.reason, e.detail(서버가 보낸 말)
// reason: invalid(틀린 키) · disabled(그 프로젝트에서 API가 꺼짐) · restricted(키에 웹사이트·API 제한) · region(지역 제한) · unknown(어느 회사 키인지 모름) · nomodel · busy(429)
async function failFrom(res) {
  let msg = '', why = '';
  try {
    const j = await res.json();
    const e = j.error || j;
    msg = String(e.message || (typeof e === 'string' ? e : '') || '').slice(0, 240);
    why = String(((e.details || []).map(d => d.reason).find(Boolean)) || e.status || e.type || '');
  } catch {}
  const t = `${why} ${msg}`;
  const reason = res.status === 429 ? 'busy'
    : /ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(t) ? 'tokentype'
    : /SERVICE_DISABLED|has not been used|is disabled|not been enabled/i.test(t) ? 'disabled'
      : /REFERRER|referer|referrer|API_KEY_.*BLOCKED|blocked|restrict/i.test(t) ? 'restricted'
        : /location is not supported|region|country/i.test(t) ? 'region'
          : [400, 401, 403].includes(res.status) ? 'invalid' : '';
  return Object.assign(fail(reason === 'invalid' ? 401 : res.status), { reason, detail: msg });
}

async function connectClaude(key, slot) {
  const res = await fetch(`${CLAUDE_API}/models/${CLAUDE_MODEL}`, { headers: claudeHeaders(key), cache: 'no-store' });
  if (!res.ok) throw await failFrom(res);
  saveConf({ key, provider: 'claude', model: CLAUDE_MODEL }, slot);
}
async function connectOpenAILike(provider, key, slot) {
  const { api, prefer } = OPENAI_LIKE[provider];
  // 키 확인: Groq는 모델 목록, OpenRouter는 키 정보 (둘 다 비용 없음)
  const check = await fetch(`${api}/${provider === 'openrouter' ? 'key' : 'models'}`, { headers: bearer(key), cache: 'no-store' });
  if (!check.ok) throw await failFrom(check);
  const list = provider === 'openrouter' ? await fetch(`${api}/models`, { cache: 'no-store' }) : check;
  if (!list.ok) throw await failFrom(list);
  const ids = ((await list.json()).data || []).filter(m => m.active !== false).map(m => m.id);
  let model = '';
  for (const re of prefer) { model = ids.find(id => re.test(id)) || ''; if (model) break; }
  if (!model) throw Object.assign(fail(404), { reason: 'nomodel' });
  saveConf({ key, provider, model }, slot);
}
async function connectGemini(key, slot) {
  const get = path => fetch(`${GEMINI_API}/${path}`, { headers: geminiHeaders(key), cache: 'no-store' });
  let model = slot === 'coach' ? GEMINI_COACH_MODEL : GEMINI_MODEL;
  let res = await get(`models/${model}`);
  if (res.status === 404) { // 이름이 바뀌었으면 쓸 수 있는 모델 중에서 고름 (채점: flash-lite → flash, 코치: flash → flash-lite)
    res = await get('models?pageSize=1000');
    if (res.ok) {
      const names = ((await res.json()).models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
      const lite = names.find(n => /flash-lite/.test(n)), flash = names.find(n => /flash/.test(n) && !/lite/.test(n));
      model = (slot === 'coach' ? flash || lite : lite || flash) || '';
      if (!model) throw Object.assign(fail(404), { reason: 'nomodel' });
    }
  }
  // Gemini는 틀린 키를 400(API_KEY_INVALID)으로, 꺼진 API는 403(SERVICE_DISABLED)으로 알려 줌
  if (!res.ok) {
    const e = await failFrom(res);
    // AQ.로 시작하는 키는 Vertex AI 키일 수 있어서 그쪽으로도 해 봄
    if (/^AQ\./.test(key)) {
      try { await connectVertex(key, slot); return; } catch (v) { throw v.reason && v.reason !== 'invalid' && v.reason !== 'tokentype' ? v : e; }
    }
    throw e;
  }
  saveConf({ key, provider: 'gemini', model }, slot);
}
// Vertex AI express: 모델 정보 조회가 없어서 아주 짧게 한 번 불러 봄(토큰 몇 개). 없는 모델(404)이면 다음 모델로
async function connectVertex(key, slot) {
  let last = null;
  for (const model of VERTEX_MODELS[slot] || VERTEX_MODELS.main) {
    const res = await fetch(`${VERTEX_API}/${model}:generateContent`, {
      method: 'POST', headers: geminiHeaders(key), cache: 'no-store',
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 16 } }),
    });
    if (res.ok) { saveConf({ key, provider: 'vertex', model }, slot); return; }
    last = await failFrom(res);
    if (res.status !== 404) throw last;
  }
  throw last || Object.assign(fail(404), { reason: 'nomodel' });
}
const CONNECT = {
  claude: connectClaude, gemini: connectGemini,
  groq: (k, s) => connectOpenAILike('groq', k, s), openrouter: (k, s) => connectOpenAILike('openrouter', k, s),
};

// 키가 맞는지 확인 (모델 정보 조회라 비용 없음). 맞으면 저장. 안 되면 { status, reason, detail }을 던짐
// 앞부분으로 회사를 모르겠으면 Gemini → Groq → OpenRouter → Claude 순으로 다 물어봄
export async function aiConnect(key, slot = 'main') {
  key = String(key || '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
  const provider = providerOf(key);
  if (provider) return CONNECT[provider](key, slot);
  let why = null; // '틀린 키'보다 더 알려 줄 게 있는 까닭(API 꺼짐 등)은 남겨 둠
  for (const p of ['gemini', 'groq', 'openrouter', 'claude']) {
    try { await CONNECT[p](key, slot); return; } catch (e) { if (!why && e && e.reason && e.reason !== 'invalid') why = e; }
  }
  throw why || Object.assign(fail(401), { reason: 'unknown' });
}
export function aiDisconnect(slot = 'main') { saveConf({}, slot); }

const STRICT_RULE = {
  // 느슨: 뜻 하나만 통하면 정답. 1점은 거의 안 주고, 0점은 완전히 다른 단어의 뜻을 썼을 때만
  easy: '의미가 통하면 2점이에요. 뜻이 여러 갈래여도 하나만 제대로 쓰면 2점, 비슷한 느낌의 다른 표현도 전부 2점이에요. 1점은 거의 주지 마세요. 0점은 완전히 다른 단어의 뜻을 썼을 때만이에요.',
  mid: '뜻 갈래(번호나 / 로 나뉜 뜻)마다 하나씩은 써야 정답(2)이에요. 같은 갈래의 비슷한 표현은 하나만 써도 돼요. 일부 갈래만 맞으면 부분 정답(1)이에요.',
  hard: '단어장에 나온 뜻 낱말을 전부(같은 갈래의 비슷한 표현까지) 써야 정답(2), 일부만 맞으면 부분 정답(1)이에요.',
};

const SYSTEM = `영단어 시험의 한글 뜻 주관식 답안을 채점해요.
- 세 난이도 모두 다음 차이는 무시해요(틀린 걸로 보지 않아요):
  오타·자모 깨짐(예: ㅊㅣ명적), 띄어쓰기, 조사, 어미 차이(준수하다 / 준수 / 지킨다는 같아요),
  축약형, 명사형, 반말체, 뜻을 쓴 순서, 번호, 품사 표시,
  동의어로 바꿔 쓴 것(부유한 → 돈 많은, 결점 → 흠).
- 단어장 뜻과 표현이 달라도 같은 의미면 맞은 거예요.
- 단어장에 없는 뜻이라도 그 영단어의 실제 사전 뜻으로 맞고 흔히 쓰이면 맞은 걸로 봐요.
- 뜻이 다르거나 너무 막연하면(예: "좋은", "어떤 것") 틀린 거예요. 반대 뜻은 틀린 거예요.
- score는 2 정답, 1 부분 정답, 0 오답이에요.
- missing은 학생이 빠뜨린 단어장 뜻 갈래 수예요.
- note는 학생에게 보여 줄 한 줄 설명이에요 (20자 안팎, 해요체). 정답이면 빈 문자열.
- 답은 JSON 하나로만: {"score": 0|1|2, "missing": 숫자, "note": "…"}`;

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

// 회사별 요청 → 응답 글자. 실패면 null. r = { system, user, json(채점처럼 JSON으로 받을 때) }
async function askClaude(c, r, signal) {
  const res = await fetch(`${CLAUDE_API}/messages`, {
    method: 'POST', headers: claudeHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      model: c.model || CLAUDE_MODEL,
      max_tokens: r.maxTokens || 2048,
      system: r.system,
      output_config: r.json ? { effort: 'low', format: { type: 'json_schema', schema: r.schema || CLAUDE_SCHEMA } } : { effort: 'low' },
      messages: [{ role: 'user', content: r.user }],
    }),
  });
  if (!res.ok) { await noteHttp(res); return null; }
  const msg = await res.json();
  if (msg.stop_reason !== 'end_turn') { lastErr = 'cut'; lastDetail = String(msg.stop_reason || ''); return null; } // refusal·max_tokens 등
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function askGemini(c, r, signal) {
  const url = c.provider === 'vertex' ? `${VERTEX_API}/${c.model}:generateContent` : `${GEMINI_API}/models/${c.model || GEMINI_MODEL}:generateContent`;
  const max = r.maxTokens || 4096; // 생각하는 모델은 생각에도 토큰을 써서 넉넉히
  const call = schema => fetch(url, {
    method: 'POST', headers: geminiHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: 'user', parts: [{ text: r.user }] }],
      generationConfig: r.json
        ? { responseMimeType: 'application/json', ...(schema ? { responseSchema: r.gschema || GEMINI_SCHEMA } : {}), maxOutputTokens: max }
        : { maxOutputTokens: max },
    }),
  });
  let res = await call(true);
  if (res.status === 400 && r.json) { await noteHttp(res); res = await call(false); } // 스키마를 안 받으면 스키마 없이 한 번 더
  if (!res.ok) { await noteHttp(res); return null; } // 429(무료 한도 초과) 등
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  if (!cand || cand.finishReason !== 'STOP') { lastErr = 'cut'; lastDetail = String((cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'no answer'); return null; }
  return ((cand.content && cand.content.parts) || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
}

async function askOpenAILike(c, r, signal) {
  const { api, json } = OPENAI_LIKE[c.provider];
  const body = {
    model: c.model,
    messages: [{ role: 'system', content: r.system }, { role: 'user', content: r.user }],
    max_tokens: r.maxTokens || 2048,
  };
  if (r.json && json) body.response_format = { type: 'json_object' };
  if (/gpt-oss/.test(c.model)) body.reasoning_effort = 'low'; // 생각을 짧게 → 빠르게
  const call = () => fetch(`${api}/chat/completions`, { method: 'POST', headers: bearer(c.key), cache: 'no-store', signal, body: JSON.stringify(body) });
  let res = await call();
  // Groq는 JSON 모드에서 모델이 JSON을 못 만들면 400(json_validate_failed)을 줌 → JSON 모드 없이 한 번 더 (pickJSON이 글에서 꺼냄)
  if (res.status === 400 && body.response_format) { await noteHttp(res); delete body.response_format; res = await call(); }
  if (!res.ok) { await noteHttp(res); return null; } // 429(무료 한도 초과) 등
  const data = await res.json();
  const ch = (data.choices || [])[0];
  if (!ch || ch.finish_reason !== 'stop') { lastErr = 'cut'; lastDetail = String((ch && ch.finish_reason) || 'no answer'); return null; }
  return (ch.message && ch.message.content) || '';
}

// 스위치·키·인터넷을 확인하고, 시간 제한을 걸어 부름. 실패면 null
async function ask(r, c = conf()) {
  lastErr = ''; lastDetail = '';
  if (!aiSwitch() || !c.key || navigator.onLine === false) { lastErr = 'offline'; return null; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), r.timeout || TIMEOUT_MS);
  try {
    const fn = c.provider === 'gemini' || c.provider === 'vertex' ? askGemini : OPENAI_LIKE[c.provider] ? askOpenAILike : askClaude;
    return await fn(c, r, ctrl.signal);
  } catch {
    lastErr = ctrl.signal.aborted ? 'timeout' : 'network';
    return null; // 인터넷 끊김, 시간 초과
  } finally {
    clearTimeout(timer);
  }
}

// 응답 글자에서 JSON 하나 꺼내기 (```json … ``` 이나 앞뒤 말이 붙어 와도)
export function pickJSON(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : JSON.parse(t);
}

/**
 * AI 채점. 반환 { score: 0|1|2, missing, note } 또는 null(오프라인·키 없음·실패 → 규칙 채점으로)
 */
export async function aiGradeMeaning({ word, meaning, user, strict = 'mid' }) {
  const text = await ask({ system: SYSTEM, user: prompt({ word, meaning, user, strict }), json: true });
  if (!text) return null;
  try {
    const out = pickJSON(text);
    if (![0, 1, 2].includes(out.score)) return null;
    return { score: out.score, missing: Math.max(0, out.missing | 0), note: String(out.note || '').trim() };
  } catch {
    return null; // 잘못된 응답
  }
}

const EXPLAIN = `영단어 공부를 돕는 선생님이에요. 학생이 영단어의 한글 뜻을 틀리게 썼거나 골랐어요. 왜 틀렸는지 짧게 설명해요.
- 학생 답이 실제로 어떤 뜻인지(보기를 골랐다면 어떤 다른 영단어의 뜻인지), 정답 뜻과 무엇이 다른지 말해요.
- 헷갈리지 않게 외우는 요령을 하나 알려 줘요 (어원, 비슷한 단어와 구별, 짧은 예 등).
- 학생 답도 맞는 뜻이라고 생각되면 솔직하게 그렇다고 말해요.
- 3~4문장, 해요체. 마크다운·목록·제목 없이 문장으로만 써요.`;

/**
 * '왜 틀렸어?' 설명. how: 'type'(직접 입력) | 'choice'(보기 선택). extra: 유의어 등 참고. 반환 글자 또는 null
 */
export async function aiExplainWrong({ word, meaning, user, how = 'type', extra = '' }) {
  const text = await ask({
    system: EXPLAIN,
    user: `영단어: ${word}\n단어장 뜻: ${meaning}${extra ? `\n참고: ${extra}` : ''}\n학생이 ${how === 'choice' ? '고른 보기' : '쓴 답'}:\n<answer>${user}</answer>`,
  });
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*#`]/g, '').trim();
  return t || null;
}

// ---------- 예문 모드: 틀린 답 풀이 말풍선 ----------
const HINT = `영어 예문 빈칸 문제의 코치예요. 학생이 빈칸에 쓴 답이 정답이 아니에요.
- 정답 단어는 절대 말하지 마세요. 정답의 철자 일부, 첫 글자도 말하지 마세요. 학생이 스스로 떠올리게 생각할 방향만 줘요.
- 예문 속 빈칸 자리(품사, 앞뒤 말, 같이 쓰는 전치사)와 학생 답의 뜻·쓰임을 비교해서 왜 안 맞는지 짚어요.
- kind는 하나:
  "near" = 학생 답도 뜻은 통하거나 가깝지만, 이 문장에 더 딱 맞는 단어가 있어요(뉘앙스·강도·쓰임 차이).
  "spell" = 사실상 같은 단어인데 형태·품사·철자만 달라요.
  "off" = 뜻이 다르거나, 문법상 그 자리에 올 수 없어요.
- text는 학생에게 보여 줄 1~2문장(60자 안팎), 해요체. 학생 답은 '작은따옴표'로 감싸요. 마크다운 없이.
- 답은 JSON 하나로만: {"kind": "near"|"spell"|"off", "text": "…"}`;
const HINT_SCHEMA = {
  type: 'object',
  properties: { kind: { type: 'string', enum: ['near', 'spell', 'off'] }, text: { type: 'string' } },
  required: ['kind', 'text'],
  additionalProperties: false,
};
const HINT_GSCHEMA = { type: 'OBJECT', properties: { kind: { type: 'STRING', enum: ['near', 'spell', 'off'] }, text: { type: 'STRING' } }, required: ['kind', 'text'] };

// 설명에 정답이 새어 나오면 가림
export function maskAnswer(text, answers) {
  let t = String(text || '');
  for (const a of answers.filter(Boolean).sort((x, y) => y.length - x.length)) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '○○');
  }
  return t;
}

/**
 * 틀린 답 풀이. sentences: 빈칸을 ___로 바꾼 예문들, answers: 정답으로 인정하는 말들(원형·예문 형태), user: 학생 답
 * 반환 { kind: 'near'|'spell'|'off', text } 또는 null(오프라인·키 없음·실패)
 */
export async function aiHint({ word, meaning, sentences, answers, user }) {
  const text = await ask({
    system: HINT, json: true, schema: HINT_SCHEMA, gschema: HINT_GSCHEMA,
    user: `정답(학생에게 말하지 말 것): ${answers.join(' / ')}\n단어장 뜻: ${meaning}\n예문:\n${sentences.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n학생 답:\n<answer>${user}</answer>`,
  });
  if (!text) return null;
  try {
    const out = pickJSON(text);
    if (!['near', 'spell', 'off'].includes(out.kind) || !out.text) return null;
    const t = maskAnswer(String(out.text).replace(/[*#`]/g, '').trim(), [word, ...answers]);
    return t ? { kind: out.kind, text: t } : null;
  } catch {
    return null;
  }
}

// ---------- 단어 코치: AI가 코치 캐릭터의 말투로 말함 ----------
// 일정·개수 계산은 앱(core.js coachPlan)이 하고, AI는 그 사실만 보고 말을 지음. 사실에 없는 숫자를 말하면 버리고 기본 말로.
// 무료 한도를 채점에 남겨 두려고 코치가 부르는 횟수는 하루 COACH_DAILY번까지

// 코치용 키를 따로 넣었으면 채점과 한도를 나눠 쓰지 않으니 더 넉넉하게
const coachDaily = () => (aiHasKey('coach') ? 100 : 30);
const USE_KEY = 'voca.ai.coachuse.v1'; // { d: 날짜, n: 오늘 부른 횟수 }
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function takeCoachTurn() {
  let u = {};
  try { u = JSON.parse(localStorage.getItem(USE_KEY)) || {}; } catch {}
  const n = u.d === today() ? u.n || 0 : 0;
  if (n >= coachDaily()) return false;
  try { localStorage.setItem(USE_KEY, JSON.stringify({ d: today(), n: n + 1 })); } catch {}
  return true;
}

export const COACH_PERSONA = {
  cat: '고양이 코치. 살짝 시크하고 말이 짧지만 은근히 잘 챙겨 줘요. 칭찬은 담백하게, 가끔 "냥" 같은 말버릇은 아주 가끔만.',
  hamster: '햄스터 코치. 부지런하고 늘 들떠 있어요. 작은 진도도 크게 기뻐하고, 씨앗을 모으듯 조금씩 쌓자고 말해요.',
  owl: '부엉이 코치. 차분하고 지혜로운 선생님 같아요. 상황을 짚어 주고, 외우는 요령이나 공부 습관 팁을 하나씩 알려 줘요.',
  slime: '슬라임 코치. 말랑하고 느긋해요. 부담을 덜어 주고, 밀려도 괜찮다며 다시 시작하게 다독여요.',
};
const MOODS = ['normal', 'happy', 'worry', 'sleep', 'cheer'];

const SAY_FORMAT = '{"mood": "normal"|"happy"|"worry"|"sleep"|"cheer", "text": "…"}';
const coachSystem = (char, format = SAY_FORMAT) => `영단어 시험을 준비하는 학생의 단어 앱 속 코치예요. ${COACH_PERSONA[char] || COACH_PERSONA.cat}
- 학생에게 직접 말하듯 해요체로 써요. 마크다운·이모지·목록 없이 문장으로만.
- 아래 <facts>에 있는 사실만 말해요. 숫자(개수·날짜·날 수)는 <facts>에 그대로 있는 것만 쓰고, 계산해서 새 숫자를 만들지 마요.
- 일정을 바꾸거나 개수를 정하는 건 앱이 해요. 코치는 지금 상황을 짚고, 오늘 무엇부터 하면 좋은지, 응원이나 요령을 말해요.
- 같은 말을 되풀이하지 말고, 그날 상황(밀렸는지, 앞서가는지, 다 했는지, 시험이 가까운지)에 맞게 구체적으로 말해요.
- mood는 말에 어울리는 표정 하나: normal(보통), happy(기쁨), worry(걱정), sleep(졸림·끝남), cheer(응원).
- 답은 JSON 하나로만: ${format}`;

const SAY_SCHEMA = {
  type: 'object',
  properties: { mood: { type: 'string', enum: MOODS }, text: { type: 'string' } },
  required: ['mood', 'text'],
  additionalProperties: false,
};
const SAY_GSCHEMA = { type: 'OBJECT', properties: { mood: { type: 'STRING', enum: MOODS }, text: { type: 'STRING' } }, required: ['mood', 'text'] };

// AI 말에 나온 숫자가 전부 사실(facts)에 있는지. 없는 숫자를 지어냈으면 false
export function numbersOk(text, facts) {
  const have = new Set(String(facts).match(/\d+/g) || []);
  return (String(text).match(/\d+/g) || []).every(n => have.has(n));
}
const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*#`]/g, '').trim();

// keep: 숫자를 지어낸 말이라도 나머지(선택지 번호 등)는 쓰고 text만 비움
async function coachAsk(char, user, facts, { schema = SAY_SCHEMA, gschema = SAY_GSCHEMA, format = SAY_FORMAT, keep = false } = {}) {
  if (!aiCoachOnline()) { lastErr = 'offline'; return null; }
  if (!takeCoachTurn()) { lastErr = 'limit'; return null; }
  const text = await ask({ system: coachSystem(char, format), json: true, schema, gschema, user, timeout: 25000, maxTokens: 8192 }, coachConf());
  if (!text) return null;
  try {
    const out = pickJSON(text);
    out.text = clean(out.text);
    if (!MOODS.includes(out.mood)) out.mood = 'normal';
    if (!out.text || out.text.length > 400 || !numbersOk(out.text, facts)) {
      lastErr = out.text && !numbersOk(out.text, facts) ? 'numbers' : 'bad';
      if (!keep) return null;
      out.text = '';
    }
    return out;
  } catch {
    lastErr = 'bad';
    lastDetail = String(text).replace(/\s+/g, ' ').slice(0, 120);
    return null;
  }
}

/**
 * 홈 코치 카드의 말. facts: 앱이 정리한 오늘 상황(글자), fallback: 앱의 기본 말(참고용)
 * 반환 { mood, text } 또는 null(오프라인·키 없음·한도·실패·숫자 지어냄 → 기본 말 그대로)
 */
export function aiCoachSay({ char, facts, fallback = '' }) {
  return coachAsk(char, `<facts>\n${facts}\n</facts>\n앱의 기본 말(참고, 그대로 베끼지 말 것): ${fallback}\n\n홈 화면 말풍선에 보여 줄 말을 1~3문장(90자 안팎)으로 써요.`, facts);
}

/**
 * 학습 한 번을 끝냈을 때 코치의 한마디. facts: 이번 학습 결과와 틀린 단어(뜻 포함)
 * 틀린 단어가 있으면 그중 하나를 골라 외우는 요령을 짧게
 */
export function aiCoachResult({ char, facts }) {
  return coachAsk(char, `<facts>\n${facts}\n</facts>\n\n방금 학습을 끝냈어요. 결과 화면에 보여 줄 말을 2~3문장(110자 안팎)으로 써요. 틀린 단어가 있으면 그중 하나를 골라 뜻을 떠올리기 쉬운 요령(어원, 비슷한 단어와 구별, 짧은 장면)을 알려 줘요. 단어 철자는 <facts>에 있는 그대로 써요.`, facts);
}

// ---------- 코치와 이야기하기 ----------
// 학생이 무엇이든 말하면 AI가 답하고, 일정을 바꾸자는 말이면 바꿀 값(복습 날 수·쉬는 요일·오늘 새 단어 수)을 골라 줌.
// 그 값으로 앱이 일정을 계산해 보여 주고, AI가 그 결과를 다시 설명함(aiCoachExplain). 바꾸는 건 학생이 '이렇게 할게요'를 눌러야
const CHAT_FORMAT = '{"mood": "…", "text": "…", "review": 숫자, "perDay": 숫자, "rest": "…", "today": 숫자}';
const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    mood: { type: 'string', enum: MOODS },
    text: { type: 'string' },
    review: { type: 'integer', description: '시험 전 전체 복습 날 수. 안 바꾸면 0' },
    perDay: { type: 'integer', description: '학생이 원하는 하루 새 단어 수. 개수로 말하지 않았으면 0' },
    rest: { type: 'string', description: '쉬는 요일 번호를 쉼표로(0 일 … 6 토). 안 바꾸면 빈 글자, 쉬는 요일을 없애면 -' },
    today: { type: 'integer', description: '오늘 배울 새 단어 총수(이미 배운 것 포함). 안 바꾸면 -1' },
  },
  required: ['mood', 'text', 'review', 'perDay', 'rest', 'today'],
  additionalProperties: false,
};
const CHAT_GSCHEMA = {
  type: 'OBJECT',
  properties: { mood: { type: 'STRING', enum: MOODS }, text: { type: 'STRING' }, review: { type: 'INTEGER' }, perDay: { type: 'INTEGER' }, rest: { type: 'STRING' }, today: { type: 'INTEGER' } },
  required: ['mood', 'text', 'review', 'perDay', 'rest', 'today'],
};
const WEEK = '일월화수목금토';
const histText = history => history.slice(-8).map(h => `${h.who === 'me' ? '학생' : '코치'}: ${h.text}`).join('\n');

/**
 * 코치와 이야기하기. facts: 오늘 상황, table: 지금 쉬는 요일로 복습 날 수마다 계산한 일정표(글자), maxReview: 복습 날 수 최대,
 * history: [{ who: 'me'|'coach', text }] 앞선 이야기, message: 학생이 방금 한 말
 * 반환 { mood, text, change: { review?, rest?, today? } | null } 또는 null(실패, aiCoachError()로 까닭)
 */
export async function aiCoachChat({ char, facts, table, maxReview, history = [], message }) {
  const hist = histText(history);
  const all = `${facts}\n${table}\n${hist}\n${message}`; // 학생이 말한 숫자·표의 숫자는 써도 됨
  const out = await coachAsk(char, `<facts>
${facts}
지금 쉬는 요일로 계산한 일정표 (앱이 계산, 숫자는 이 표에 있는 것만 써요):
${table}
</facts>
${hist ? `앞선 이야기:\n${hist}\n` : ''}학생이 방금 한 말:
<message>${message}</message>

학생 말에 코치로서 답해요. 공부 방법, 단어 외우는 요령, 일정 질문, 기분 이야기 등 무엇이든 돼요. 영어 공부와 상관없는 말이면 짧게 받아 주고 공부 이야기로 돌아와요.
앱이 바꿀 수 있는 건 아래 값들이에요. 학생이 바꾸고 싶어 하거나 "~하면 어때?"처럼 물어보면 그 값을 넣어요 (앱이 계산해서 보여 주고, 학생이 확인해야 바뀌어요):
- review: 시험 전 전체 복습 날 수 (1~${maxReview}). "복습 일주일"처럼 날 수로 말했을 때. 안 바꾸면 0
- perDay: "하루 30개씩"처럼 하루 새 단어 수로 말했을 때 그 개수 (앱이 그 개수에 가장 가깝게 복습 날 수를 맞춰요). 아니면 0
- rest: 쉬는 요일 (0 일, 1 월, 2 화, 3 수, 4 목, 5 금, 6 토를 쉼표로, 예 "6" 또는 "0,6"). 쉬는 요일을 없애면 "-". 안 바꾸면 ""
- today: 오늘 배울 새 단어 총수 (오늘 이미 배운 것 포함). 안 바꾸면 -1
쉬는 요일을 바꾸면 표의 숫자가 달라지니, 그때 text에는 숫자를 쓰지 말고 무엇을 바꿔 보는지만 말해요 (앱이 계산한 뒤 다시 설명해요).
학습 범위나 시험일은 여기서 못 바꾸니 학습 계획 화면에서 바꾸라고 알려 줘요. text는 1~3문장(120자 안팎).`, all, { schema: CHAT_SCHEMA, gschema: CHAT_GSCHEMA, format: CHAT_FORMAT, keep: true });
  if (!out) return null;
  const change = {};
  const r = Math.round(Number(out.review));
  if (r >= 1 && r <= maxReview) change.review = r;
  const pd = Math.round(Number(out.perDay));
  if (pd >= 1 && pd <= 500 && !change.review) change.perDay = pd;
  const rs = String(out.rest == null ? '' : out.rest).trim();
  if (rs === '-' || rs === '없음') change.rest = [];
  else if (rs) {
    const nums = rs.split(/[ ,/]+/).map(x => (/^[0-6]$/.test(x) ? +x : WEEK.indexOf(x.replace(/요일$/, '')))).filter(n => n >= 0 && n <= 6);
    if (nums.length) change.rest = [...new Set(nums)].sort();
  }
  const t = Math.round(Number(out.today));
  if (Number.isFinite(t) && t >= 0 && t <= 500) change.today = t;
  return { mood: out.mood, text: out.text, change: Object.keys(change).length ? change : null };
}

/**
 * 앱이 계산한 새 일정을 코치 말로 설명. result: 앱이 계산한 결과(글자)
 * 반환 { mood, text } 또는 null(→ 앱이 만든 설명)
 */
export function aiCoachExplain({ char, facts, history = [], message, result }) {
  const hist = histText(history);
  const all = `${facts}\n${result}\n${hist}\n${message}`;
  return coachAsk(char, `<facts>
${facts}
학생 말에 맞춰 앱이 새로 계산한 일정 (아직 안 바뀜, 학생이 '이렇게 할게요'를 누르면 바뀜):
${result}
</facts>
${hist ? `앞선 이야기:\n${hist}\n` : ''}학생이 방금 한 말:
<message>${message}</message>

새로 계산한 일정이 어떤지 학생에게 설명해요: 하루에 얼마나 하게 되는지, 지금 일정과 무엇이 달라지는지, 괜찮은지(빡빡하면 솔직하게). 숫자는 위에 있는 것만. 마지막에 마음에 들면 '이렇게 할게요'를 누르라고 해요. 2~3문장(130자 안팎).`, all);
}
