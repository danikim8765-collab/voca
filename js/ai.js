// 단어 모드 직접 입력의 AI 재확인. 규칙 채점(core.js의 gradeMeaning)이 정답이 아니라고 할 때만,
// 인터넷이 되고 API 키가 있으면 부른다. 안 되거나 실패하면 null → 규칙 채점 결과 그대로.
// 키 앞부분으로 회사를 고른다: gsk_… = Groq(무료), sk-or-… = OpenRouter(무료 모델),
// AIza… = Google Gemini(무료 등급), sk-ant-… = Anthropic Claude(유료: 가벼운 일은 Haiku, 코치와 이야기하기만 Sonnet)
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
// Claude는 일마다 모델을 나눔: 채점·풀이·홈 말풍선·학습 끝 한마디는 싸고 빠른 Haiku, 코치와 이야기하기만 Sonnet
// (Sonnet이 막히면 Haiku로). 예전에 저장된 모델 이름과 상관없이 이 둘을 씀
const CLAUDE_MODEL = 'claude-haiku-5-5';
const CLAUDE_CHAT_MODEL = 'claude-sonnet-5-5';
// OpenAI 형식(chat/completions)을 쓰는 곳. 모델은 연결할 때 목록에서 앞쪽 것부터 고름
const OPENAI_LIKE = {
  groq: { api: 'https://api.groq.com/openai/v1', prefer: [/^openai\/gpt-oss-120b$/, /^openai\/gpt-oss-20b$/, /gpt-oss/, /^qwen/, /llama/], json: true },
  openrouter: { api: 'https://openrouter.ai/api/v1', prefer: [/gpt-oss-120b:free$/, /gpt-oss.*:free$/, /deepseek.*:free$/, /qwen.*:free$/, /llama.*:free$/, /:free$/], json: false },
};

const loadConf = (slot = 'main') => { try { return JSON.parse(localStorage.getItem(SLOT[slot])) || {}; } catch { return {}; } };
const saveConf = (c, slot = 'main') => { try { localStorage.setItem(SLOT[slot], JSON.stringify(c)); } catch {} };

// Google 키: AIza… 또는 AQ.… (AQ.는 Gemini API 키일 수도, Vertex AI 키일 수도 있어서 연결할 때 둘 다 해 봄)
export const providerOf = key => (/^sk-ant-/.test(key) ? 'claude' : /^(AIza|AQ\.)/.test(key) ? 'gemini' : /^gsk_/.test(key) ? 'groq' : /^sk-or-/.test(key) ? 'openrouter' : '');
const conf = (slot = 'main') => {
  let c = loadConf(slot);
  if (c.key && !c.provider) c = { ...c, provider: providerOf(c.key) || 'claude' };
  return c.provider === 'claude' ? { ...c, model: CLAUDE_MODEL } : c;
};
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
let lastErr = '';
export const aiCoachError = () => lastErr;

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
// 토큰 아끼기: 지시문(system)은 늘 같아서 캐시해 둠(다시 읽을 땐 입력 값의 1/10~1/20).
// r.parts가 있으면(코치와 이야기하기) 사용자 글을 여러 조각으로 보내고, cache 표시한 조각까지 캐시함.
// 앞선 이야기는 다음 번에도 앞부분이 그대로라 캐시에서 읽음 → 대화가 길어져도 매번 전부 값을 내지 않음
const cacheMark = { type: 'ephemeral' };
export const claudeContent = r => (r.parts
  ? r.parts.filter(p => p.text).map(p => (p.cache ? { type: 'text', text: p.text, cache_control: cacheMark } : { type: 'text', text: p.text }))
  : r.user);
async function askClaude(c, r, signal) {
  const res = await fetch(`${CLAUDE_API}/messages`, {
    method: 'POST', headers: claudeHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      model: c.model || CLAUDE_MODEL,
      max_tokens: r.maxTokens || 2048,
      system: [{ type: 'text', text: r.system, cache_control: cacheMark }],
      output_config: r.json ? { effort: 'low', format: { type: 'json_schema', schema: r.schema || CLAUDE_SCHEMA } } : { effort: 'low' },
      messages: [{ role: 'user', content: claudeContent(r) }],
    }),
  });
  if (!res.ok) { lastErr = String(res.status); return null; }
  const msg = await res.json();
  if (msg.stop_reason !== 'end_turn') { lastErr = 'cut'; return null; } // refusal·max_tokens 등
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

// 생각하는 모델(Gemini 2.5·3 flash)은 따로 정하지 않으면 오래 생각해서 시간이 넘거나 토큰이 모자라 답이 잘림.
// 그래서 생각을 짧게: Gemini 3은 thinkingLevel, 그 밖(2.5·-latest 별칭)은 thinkingBudget (Gemini 3도 받음)
export const geminiThinking = model => (/gemini-3/.test(model || '') ? { thinkingLevel: 'low' } : { thinkingBudget: 512 });
async function askGemini(c, r, signal) {
  const model = c.model || GEMINI_MODEL;
  const url = c.provider === 'vertex' ? `${VERTEX_API}/${model}:generateContent` : `${GEMINI_API}/models/${model}:generateContent`;
  const call = thinking => fetch(url, {
    method: 'POST', headers: geminiHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: 'user', parts: [{ text: r.user }] }],
      generationConfig: {
        ...(r.json ? { responseMimeType: 'application/json', responseSchema: r.gschema || GEMINI_SCHEMA } : {}),
        maxOutputTokens: 8192, // 생각에도 토큰을 써서 넉넉히
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
    }),
  });
  let res = await call(geminiThinking(model));
  if (res.status === 400) res = await call(null); // 생각 설정을 안 받는 모델(2.0 등)이면 빼고 다시
  if (!res.ok) { lastErr = String(res.status); return null; } // 429(무료 한도 초과) 등
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  if (!cand || cand.finishReason !== 'STOP') { lastErr = 'cut'; return null; }
  return ((cand.content && cand.content.parts) || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
}

async function askOpenAILike(c, r, signal) {
  const { api, json } = OPENAI_LIKE[c.provider];
  const body = {
    model: c.model,
    messages: [{ role: 'system', content: r.system }, { role: 'user', content: r.user }],
    max_tokens: 2048,
  };
  if (r.json && json) body.response_format = { type: 'json_object' };
  if (/gpt-oss/.test(c.model)) body.reasoning_effort = 'low'; // 생각을 짧게 → 빠르게
  const res = await fetch(`${api}/chat/completions`, { method: 'POST', headers: bearer(c.key), cache: 'no-store', signal, body: JSON.stringify(body) });
  if (!res.ok) { lastErr = String(res.status); return null; } // 429(무료 한도 초과) 등
  const data = await res.json();
  const ch = (data.choices || [])[0];
  if (!ch || ch.finish_reason !== 'stop') { lastErr = 'cut'; return null; }
  return (ch.message && ch.message.content) || '';
}

// 스위치·키·인터넷을 확인하고, 시간 제한을 걸어 부름. 실패면 null
async function ask(r, c = conf()) {
  lastErr = '';
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

// 코치가 부를 때: 고른 모델이 막히면(사람이 몰림 503, 한도 429, 너무 늦음, 없어진 모델 404) 다른 모델로 넘어감.
// 무료 등급은 모델마다 한도가 따로라 flash가 막혀도 flash-lite는 되는 일이 많음. 막힌 모델은 5분 동안 뒤로 미룸
const GEMINI_SPARE = 'gemini-flash-lite-latest';
// chat = 코치와 이야기하기 (Claude면 이때만 Sonnet)
export const coachModels = (c, chat = false) => [...new Set((c.provider === 'gemini' ? [c.model || GEMINI_COACH_MODEL, GEMINI_SPARE]
  : c.provider === 'vertex' ? [c.model, ...VERTEX_MODELS.main]
    : c.provider === 'claude' ? (chat ? [CLAUDE_CHAT_MODEL, CLAUDE_MODEL] : [CLAUDE_MODEL]) : [c.model]).filter(Boolean))];
const resting = new Map(); // 모델 → 이 시각까지 건너뜀
const SWITCH = /^(429|404|5\d\d|timeout|cut|network)$/;
async function askCoach(r) {
  const c = coachConf();
  // 방금 막혔던 모델은 맨 뒤로 (다른 모델도 안 되면 그때 다시 해 봄)
  const all = coachModels(c, !!r.chat), asleep = m => resting.get(m) > Date.now();
  const models = [...all.filter(m => !asleep(m)), ...all.filter(asleep)].slice(0, 3);
  if (models.length < 3) models.push(models[0]); // 다 안 됐는데 서버 오류(5xx)였으면 잠깐 쉬고 처음 모델로 한 번 더
  for (let i = 0; i < models.length; i++) {
    const tried = models.slice(0, i);
    if (tried.includes(models[i])) {
      if (!/^5\d\d$/.test(lastErr)) break;
      await new Promise(done => setTimeout(done, 800));
    }
    // 넘어갈 다른 모델이 있으면 오래 기다리지 않음. 다만 코치와 이야기하기는 긴 설명을 쓰는 중일 수 있어서 30초까지 기다림
    // (중간에 끊어도 그때까지 쓴 토큰 값은 나가고, 다른 모델에 처음부터 다시 물어야 해서 두 번 값을 냄)
    const spare = models.slice(i + 1).some(m => m !== models[i] && !tried.includes(m));
    const out = await ask({ ...r, timeout: spare ? Math.min(r.timeout || TIMEOUT_MS, r.chat ? 30000 : 15000) : r.timeout }, { ...c, model: models[i] });
    if (out) return out;
    if (out === '') lastErr = 'bad';
    if (!SWITCH.test(lastErr) || navigator.onLine === false) break;
    if (spare && /^(429|5\d\d|timeout)$/.test(lastErr)) resting.set(models[i], Date.now() + 300000);
  }
  return null;
}

// 응답 글자에서 JSON 하나 꺼내기 (```json … ``` 이나 앞뒤 말이 붙어 와도)
export function pickJSON(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : JSON.parse(t);
}

// 같은 물음에 받은 답을 기억해 둠 (채점·'왜 틀렸어?'). 학생은 같은 단어에 같은 답을 또 쓰는 일이 많아서
// (단어장과 다르게 외운 표현 등) 그때마다 AI를 부르지 않고 지난번 답을 그대로 씀. 실패(null)는 기억하지 않음
const MEMO = { grade: ['voca.ai.memo.grade.v1', 400], explain: ['voca.ai.memo.explain.v1', 150] };
const memoKey = (...a) => a.map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim()).join('\n');
function memoGet(kind, key) {
  try { const m = JSON.parse(localStorage.getItem(MEMO[kind][0])) || {}; return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined; } catch { return undefined; }
}
function memoSet(kind, key, val) {
  try {
    const [k, cap] = MEMO[kind];
    const m = JSON.parse(localStorage.getItem(k)) || {};
    delete m[key];
    m[key] = val; // 넣은 순서대로 쌓이니 넘치면 앞(오래된 것)부터 뺌
    const keys = Object.keys(m);
    for (const old of keys.slice(0, Math.max(0, keys.length - cap))) delete m[old];
    localStorage.setItem(k, JSON.stringify(m));
  } catch {}
}

/**
 * AI 채점. 반환 { score: 0|1|2, missing, note } 또는 null(오프라인·키 없음·실패 → 규칙 채점으로)
 * 같은 단어·같은 기준에 같은 답이면 지난번 채점을 그대로 씀 (AI를 다시 안 부름)
 */
export async function aiGradeMeaning({ word, meaning, user, strict = 'mid' }) {
  const key = memoKey(word, meaning, strict, user);
  const seen = aiOnline() ? memoGet('grade', key) : undefined;
  if (seen) return { ...seen };
  const text = await ask({ system: SYSTEM, user: prompt({ word, meaning, user, strict }), json: true });
  if (!text) return null;
  try {
    const out = pickJSON(text);
    if (![0, 1, 2].includes(out.score)) return null;
    const res = { score: out.score, missing: Math.max(0, out.missing | 0), note: String(out.note || '').trim() };
    memoSet('grade', key, res);
    return res;
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
  const key = memoKey(word, meaning, how, user);
  const seen = aiOnline() ? memoGet('explain', key) : undefined;
  if (seen) return seen;
  const text = await ask({
    system: EXPLAIN,
    user: `영단어: ${word}\n단어장 뜻: ${meaning}${extra ? `\n참고: ${extra}` : ''}\n학생이 ${how === 'choice' ? '고른 보기' : '쓴 답'}:\n<answer>${user}</answer>`,
  });
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*#`]/g, '').trim();
  if (t) memoSet('explain', key, t);
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
// 홈 말풍선·학습 끝 한마디: 앱이 정리한 사실(facts)만 보고 짧게 말함. 사실에 없는 숫자를 말하면 버리고 기본 말로.
// 이 둘은 앱이 알아서 부르는 거라, 무료 한도를 남겨 두려고 하루 횟수를 둠. 코치와 이야기하기(사람이 보낸 말)는 세지 않음

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
  cat: '고양이 코치. 살짝 시크하고 말수가 적지만(그래도 반말은 안 쓰고 해요체) 은근히 잘 챙겨 줘요. 칭찬은 담백하게, 가끔 "냥" 같은 말버릇은 아주 가끔만.',
  hamster: '햄스터 코치. 부지런하고 늘 들떠 있어요. 작은 진도도 크게 기뻐하고, 씨앗을 모으듯 조금씩 쌓자고 말해요.',
  owl: '부엉이 코치. 차분하고 지혜로운 선생님 같아요. 상황을 짚어 주고, 외우는 요령이나 공부 습관 팁을 하나씩 알려 줘요.',
  slime: '슬라임 코치. 말랑하고 느긋해요. 부담을 덜어 주고, 밀려도 괜찮다며 다시 시작하게 다독여요.',
};
const MOODS = ['normal', 'happy', 'worry', 'sleep', 'cheer'];

const SAY_FORMAT = '{"mood": "normal"|"happy"|"worry"|"sleep"|"cheer", "text": "…"}';
const coachSystem = (char, format = SAY_FORMAT) => `영단어 시험을 준비하는 학생의 단어 앱 속 코치예요. ${COACH_PERSONA[char] || COACH_PERSONA.cat}
- 학생에게 직접 말하듯 해요체로 써요. 마크다운·이모지·목록 없이 문장으로만.
- 아래 <facts>에 있는 사실만 말해요. 숫자(개수·날짜·날 수)는 <facts>에 그대로 있는 것만 쓰고, 계산해서 새 숫자를 만들지 마요. 숫자는 한글로 풀어 쓰지 말고 <facts>에 적힌 모양(13개, 18일)대로 써요.
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
// small: 요령을 말할 때 쓰는 작은 숫자("5분 뒤", "3가지", "2초")는 사실에 없어도 됨. 개수·날짜·횟수(개·일·번)는 그대로 막음
const TIP_NUM = /(\d+)\s*(?:분|초|가지|단계|글자|음절|문장)/g;
export function numbersOk(text, facts, small = false) {
  const have = new Set(String(facts).match(/\d+/g) || []);
  const t = small ? String(text).replace(TIP_NUM, (m, n) => (+n <= 10 ? '' : m)) : String(text);
  return (t.match(/\d+/g) || []).every(n => have.has(n));
}
const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*#`]/g, '').trim();

async function coachAsk(char, user, facts, small = false) {
  if (!aiCoachOnline()) { lastErr = 'offline'; return null; }
  if (!takeCoachTurn()) { lastErr = 'limit'; return null; }
  const text = await askCoach({ system: coachSystem(char), json: true, schema: SAY_SCHEMA, gschema: SAY_GSCHEMA, user, timeout: 20000 });
  if (!text) return null;
  try {
    const out = pickJSON(text);
    out.text = clean(out.text);
    if (!MOODS.includes(out.mood)) out.mood = 'normal';
    const numOk = numbersOk(out.text, facts, small);
    if (!out.text || out.text.length > 400 || !numOk) { lastErr = out.text && !numOk ? 'numbers' : 'bad'; return null; }
    return out;
  } catch {
    lastErr = 'bad';
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
  return coachAsk(char, `<facts>\n${facts}\n</facts>\n\n방금 학습을 끝냈어요. 결과 화면에 보여 줄 말을 2~3문장(110자 안팎)으로 써요. 틀린 단어가 있으면 그중 하나를 골라 뜻을 떠올리기 쉬운 요령(어원, 비슷한 단어와 구별, 짧은 장면)을 알려 줘요. 단어 철자는 <facts>에 있는 그대로 써요.`, facts, true);
}

// ---------- 코치와 이야기하기 ----------
// 학생이 무엇이든 말하면 AI가 코치로서 답함. AI는 한 번만 부름.
// 일정 얘기면 AI는 학생이 원하는 것(쉬는 요일·하루 개수·복습 날 수·오늘 개수)만 뽑고, 계산과 숫자가 든 설명은 앱이 카드로 보여 줌
// (그래서 AI 말의 숫자를 검사하지 않음). 바꾸는 건 학생이 카드의 '이렇게 할게요'를 눌러야
const chatSystem = char => `영단어 시험을 준비하는 학생의 단어 앱 속 코치예요. ${COACH_PERSONA[char] || COACH_PERSONA.cat}
말풍선만 읽어 주는 도우미가 아니라, 자기 생각이 있는 코치예요.
- 자기 의견을 말해요. 학생 계획이 무리이거나 너무 느슨하면 솔직하게 그렇다고 하고 까닭을 대요. 맞장구만 치지 않아요. 그래도 정하는 건 학생이라, 학생이 하겠다고 하면 따르고 응원해요.
- 좋아하는 공부법과 싫어하는 것(예: 벼락치기), 말버릇, 그날의 기분이 있어요. 캐릭터다운 자기 이야기도 가끔 살짝 해요. 과하지 않게.
- 앞에서 한 이야기와 <memory>에 이어지게 말해요. 전에 한 약속이나 학생 사정을 먼저 꺼내도 좋아요.
- 주제는 무엇이든 돼요: 단어 뜻·어원·예문·비슷한 단어 구별, 공부 방법, 일정, 고민, 잡담. 길이는 내용에 맞게 써요(잡담은 짧게, 설명은 필요한 만큼 길게).
- 해요체. 줄바꿈과 '- '로 시작하는 목록은 써도 되지만, 굵게·제목·표 같은 마크다운 기호와 이모지는 쓰지 마요.
- <facts>는 앱이 계산한 지금 상황이에요. 진도·개수·날짜를 말할 땐 <facts>에 있는 것을 그대로 써요.
- <weak>는 학생이 약한 단어예요. 학생이 묻거나 흐름에 맞으면 몇 개를 짚어서 외우는 요령(어원, 비슷한 단어와 구별, 짧은 장면)을 알려 줘요. 퀴즈를 내 달라고 하면 여기서 한 문제씩 내고, 학생이 답하면 맞았는지 봐 준 다음 다음 문제로 가요.

일정:
- 일정 계산은 앱이 해요. 학생이 일정을 바꾸고 싶어 하거나 "~하면 어떻게 돼?", "~하면 복습이 며칠이야?"처럼 물으면 아래 값에 학생이 말한 것을 그대로 넣어요. 앱이 정확히 계산해서 말풍선 바로 아래에 카드로 보여 주고, 학생이 카드의 버튼을 눌러야 바뀌어요.
  rest: 쉬는 요일. 0 일, 1 월, 2 화, 3 수, 4 목, 5 금, 6 토를 쉼표로(예 "6", "0,6"). 쉬는 요일을 없애면 "-". 말 안 했으면 ""
  perDay: 앞으로 매일 볼 하루 새 단어 수(예 "하루 40개씩", "매일 40개" → 40). 앱이 그 개수를 그대로 두고 계산해요. 말 안 했으면 0
  review: 학생이 말한 시험 전 전체 복습 날 수(예 "복습은 일주일" → 7). 말 안 했으면 0. perDay와 같이 넣지 마요(개수를 말했으면 perDay만)
  today: 오늘 하루만 다르게 할 때 오늘 배울 새 단어 총수(예 "오늘은 60개 할래", "오늘만 10개" → 60, 10. 이때 perDay는 0). 말 안 했으면 -1
- 값을 넣었을 땐 text에 계산 결과(끝나는 날, 복습 날 수, 하루 개수)를 짐작해서 쓰지 마요. 무엇을 계산해 보는지와 코치로서의 생각만 짧게 말해요. 계산 결과는 다음부터 앞선 이야기의 [앱 계산]에서 볼 수 있으니 그때 의견을 말해요.
- 일정 얘기가 아니면 값은 비워 둬요(rest "", perDay 0, review 0, today -1). 학생이 뭘 원하는지 모호하면 값을 넣지 말고 되물어요.
- 학습 범위와 시험일은 여기서 못 바꿔요. 학습 계획 화면에서 바꾸라고 알려 줘요.

기억:
- 앞으로도 알아 두면 좋은 학생 사정이나 취향(예: 수요일은 학원이라 늦게 옴, 소리 내어 외우는 걸 좋아함, 목표는 만점)을 새로 알게 되면 remember에 짧은 한 문장으로 적어요. 이미 <memory>에 있거나 오늘만의 일이면 "". 일정(쉬는 요일, 하루 개수, 복습 날 수)은 앱이 따로 기억하니 적지 마요.

mood는 말에 어울리는 표정 하나: normal(보통), happy(기쁨), worry(걱정), sleep(졸림), cheer(응원).
답은 JSON 하나로만: {"mood": "…", "text": "…", "rest": "…", "perDay": 숫자, "review": 숫자, "today": 숫자, "remember": "…"}`;
const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    mood: { type: 'string', enum: MOODS },
    text: { type: 'string' },
    rest: { type: 'string', description: '쉬는 요일 번호를 쉼표로(0 일 … 6 토). 말 안 했으면 빈 글자, 쉬는 요일을 없애면 -' },
    perDay: { type: 'integer', description: '학생이 말한 하루 새 단어 수. 말 안 했으면 0' },
    review: { type: 'integer', description: '학생이 말한 시험 전 전체 복습 날 수. 말 안 했으면 0' },
    today: { type: 'integer', description: '오늘만 배울 새 단어 총수. 말 안 했으면 -1' },
    remember: { type: 'string', description: '오래 기억해 둘 학생 사정 한 문장. 없으면 빈 글자' },
  },
  required: ['mood', 'text', 'rest', 'perDay', 'review', 'today', 'remember'],
  additionalProperties: false,
};
const CHAT_GSCHEMA = {
  type: 'OBJECT',
  properties: { mood: { type: 'STRING', enum: MOODS }, text: { type: 'STRING' }, rest: { type: 'STRING' }, perDay: { type: 'INTEGER' }, review: { type: 'INTEGER' }, today: { type: 'INTEGER' }, remember: { type: 'STRING' } },
  required: ['mood', 'text', 'rest', 'perDay', 'review', 'today', 'remember'],
};
const WEEK = '일월화수목금토';
const CHAT_MAX = 4000; // 코치 말 한 번의 길이 (넘으면 자름)

// 앞선 이야기에서 어디부터 넘길지. history: [{ who: 'me'|'coach'|'app', text, day?: 'YYYY-MM-DD', t? }] (app = 앱이 계산해 보여 준 카드)
// 너무 길면 오래된 것부터 뺌(마지막 둘은 늘 남김). prev = 지난번에 넘긴 첫 이야기의 자리(없으면 -1)
// 토큰 아끼기: 매번 한 줄씩 밀어 자르면 앞부분이 매번 달라져서 AI 회사의 캐시(같은 앞부분은 싸게 읽음)를 못 씀.
// 그래서 지난번 시작이 아직 한도(max·chars) 안이면 그대로 두고, 넘칠 때만 lo(한도의 2/3쯤)까지 한 번에 줄임.
// 넘기는 양은 늘 lo 이상이라, 코치가 기억하는 앞선 이야기가 예전(40개·7000자)보다 짧아지지 않음
const fromLen = (h, from) => h.slice(from).reduce((n, x) => n + x.text.length, 0);
export function chatFrom(history, { max = 40, chars = 7000, lo = null, prev = -1 } = {}) {
  const n = history.length;
  if (prev >= 0 && prev <= n - 2 && n - prev <= max && fromLen(history, prev) <= chars) return prev;
  const m = prev >= 0 && lo ? lo.max : max, c = prev >= 0 && lo ? lo.chars : chars;
  let from = n, size = 0;
  while (from > 0 && (n - from < 2 || (n - from < m && size + history[from - 1].text.length <= c))) size += history[--from].text.length;
  return from;
}
// 이야기 한 줄씩. 날짜가 바뀌면 사이에 날짜를 적어 줌
function chatLines(items) {
  const lines = [];
  let day = null;
  for (const h of items) {
    const head = h.day && h.day !== day ? `(${h.day})\n` : '';
    if (h.day) day = h.day;
    lines.push(`${head}${h.who === 'me' ? '학생' : h.who === 'app' ? '[앱 계산]' : '코치'}: ${h.text}`);
  }
  return lines;
}
export function chatTranscript(history, { max = 40, chars = 7000 } = {}) {
  return chatLines(history.slice(chatFrom(history, { max, chars }))).join('\n');
}
// 지난번에 넘긴 첫 이야기 (다음 번에도 같은 데서 시작하려고)
const CHAT_WIN = { max: 60, chars: 10500, lo: { max: 40, chars: 7000 } };
const itemKey = h => (h.t ? `t${h.t}` : `${h.who}|${h.day || ''}|${h.text}`);
let chatFirst = null;

// JSON이 깨져 왔을 때: "text" 값만이라도 건지고, 그것도 없으면 온 글 그대로를 코치 말로
function looseChat(raw) {
  const t = clean(raw).replace(/^json\s*/i, '');
  const m = t.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (m) { try { return { mood: 'normal', text: JSON.parse(`"${m[1].replace(/\\$/, '')}"`) }; } catch {} }
  return /^\s*[{[]/.test(t) ? null : { mood: 'normal', text: t };
}

/**
 * 코치와 이야기하기. facts: 오늘 상황, weak: 약한 단어 목록(글자), notes: 기억해 둔 것 [글자],
 * history: 앞선 이야기(chatTranscript 참고), message: 학생이 방금 한 말, day: 오늘 날짜
 * 반환 { mood, text, plan: { rest?, perDay?, review?, today? } | null, remember: 글자 } 또는 null(실패, aiCoachError()로 까닭)
 */
export async function aiCoachChat({ char, facts, weak = '', notes = [], history = [], message, day = '' }) {
  if (!aiCoachOnline()) { lastErr = 'offline'; return null; }
  const prev = chatFirst ? history.findIndex(h => itemKey(h) === chatFirst) : -1;
  const from = chatFrom(history, { ...CHAT_WIN, prev });
  chatFirst = from < history.length ? itemKey(history[from]) : null;
  const lines = chatLines(history.slice(from));
  // 조각으로 나눠 둠: 상황·기억 → 앞선 이야기 한 줄씩 → 방금 한 말. 이어 붙이면 한 덩어리 글과 같음.
  // Claude는 방금 한 말 앞까지 캐시해 두고, 다음 번엔 거기까지를 캐시에서 읽음 (Gemini·Groq는 같은 앞부분을 알아서 캐시)
  const parts = [
    { text: `<facts>
${facts}
</facts>
<weak>
${weak || '(아직 틀린 단어 기록이 없음)'}
</weak>
<memory>
${notes.length ? notes.map(n => `- ${n}`).join('\n') : '(아직 없음)'}
</memory>
${lines.length ? '앞선 이야기:\n' : ''}` },
    ...lines.map(l => ({ text: `${l}\n` })),
  ];
  parts[parts.length - 1].cache = true;
  parts.push({ text: `${day ? `(${day}, 지금)\n` : ''}학생이 방금 한 말:
<message>${message}</message>` });
  const raw = await askCoach({
    system: chatSystem(char), json: true, schema: CHAT_SCHEMA, gschema: CHAT_GSCHEMA, timeout: 40000, chat: true,
    // 긴 설명이 잘리면(cut) 다른 모델로 처음부터 다시 물어 두 번 값을 내니, 답 길이 한도는 넉넉히
    maxTokens: 8192, parts, user: parts.map(p => p.text).join(''),
  });
  if (!raw) return null;
  let out = null;
  try { out = pickJSON(raw); } catch { out = looseChat(raw); }
  if (!out || typeof out !== 'object') { lastErr = 'bad'; return null; }
  const text = String(out.text == null ? '' : out.text).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*|`|^#+\s*/gm, '').replace(/^\s*\*\s+/gm, '- ').trim().slice(0, CHAT_MAX);
  const plan = {};
  const pd = Math.round(Number(out.perDay));
  if (pd >= 1 && pd <= 500) plan.perDay = pd;
  const r = Math.round(Number(out.review));
  if (r >= 1 && r <= 365 && !plan.perDay) plan.review = r;
  const rs = String(out.rest == null ? '' : out.rest).trim();
  if (rs === '-' || rs === '없음') plan.rest = [];
  else if (rs) {
    const nums = rs.split(/[ ,/·]+/).map(x => (/^[0-6]$/.test(x) ? +x : WEEK.indexOf(x.replace(/요일$/, '')))).filter(n => n >= 0 && n <= 6);
    if (nums.length) plan.rest = [...new Set(nums)].sort();
  }
  const t = Math.round(Number(out.today));
  if (out.today != null && out.today !== '' && Number.isFinite(t) && t >= 0 && t <= 500) plan.today = t;
  const has = Object.keys(plan).length > 0;
  if (!text && !has) { lastErr = 'bad'; return null; }
  return { mood: MOODS.includes(out.mood) ? out.mood : 'normal', text, plan: has ? plan : null, remember: clean(out.remember).slice(0, 120) };
}
