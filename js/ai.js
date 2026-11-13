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
const CLAUDE_API = 'https://api.anthropic.com/v1';
const CLAUDE_MODEL = 'claude-sonnet-5-5';
// OpenAI 형식(chat/completions)을 쓰는 곳. 모델은 연결할 때 목록에서 앞쪽 것부터 고름
const OPENAI_LIKE = {
  groq: { api: 'https://api.groq.com/openai/v1', prefer: [/^openai\/gpt-oss-120b$/, /^openai\/gpt-oss-20b$/, /gpt-oss/, /^qwen/, /llama/], json: true },
  openrouter: { api: 'https://openrouter.ai/api/v1', prefer: [/gpt-oss-120b:free$/, /gpt-oss.*:free$/, /deepseek.*:free$/, /qwen.*:free$/, /llama.*:free$/, /:free$/], json: false },
};

const loadConf = (slot = 'main') => { try { return JSON.parse(localStorage.getItem(SLOT[slot])) || {}; } catch { return {}; } };
const saveConf = (c, slot = 'main') => { try { localStorage.setItem(SLOT[slot], JSON.stringify(c)); } catch {} };

export const providerOf = key => (/^sk-ant-/.test(key) ? 'claude' : /^AIza/.test(key) ? 'gemini' : /^gsk_/.test(key) ? 'groq' : /^sk-or-/.test(key) ? 'openrouter' : '');
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
export const aiName = (slot = 'main') => ({ gemini: 'Gemini', claude: 'Claude', groq: 'Groq', openrouter: 'OpenRouter' }[aiProvider(slot)] || 'AI');
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
const bearer = key => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` });

const fail = status => Object.assign(new Error(String(status)), { status });

// 키가 맞는지 확인 (모델 정보 조회라 비용 없음). 맞으면 저장. 틀린 키는 status 401로 던짐
export async function aiConnect(key, slot = 'main') {
  const provider = providerOf(key);
  if (!provider) throw fail(401);
  if (provider === 'claude') {
    const res = await fetch(`${CLAUDE_API}/models/${CLAUDE_MODEL}`, { headers: claudeHeaders(key), cache: 'no-store' });
    if (!res.ok) throw fail(res.status === 403 ? 401 : res.status);
    saveConf({ key, provider, model: CLAUDE_MODEL }, slot);
    return;
  }
  if (OPENAI_LIKE[provider]) {
    const { api, prefer } = OPENAI_LIKE[provider];
    // 키 확인: Groq는 모델 목록, OpenRouter는 키 정보 (둘 다 비용 없음)
    const check = await fetch(`${api}/${provider === 'openrouter' ? 'key' : 'models'}`, { headers: bearer(key), cache: 'no-store' });
    if (!check.ok) throw fail([400, 401, 403].includes(check.status) ? 401 : check.status);
    const list = provider === 'openrouter' ? await fetch(`${api}/models`, { cache: 'no-store' }) : check;
    if (!list.ok) throw fail(list.status);
    const ids = ((await list.json()).data || []).filter(m => m.active !== false).map(m => m.id);
    let model = '';
    for (const re of prefer) { model = ids.find(id => re.test(id)) || ''; if (model) break; }
    if (!model) throw fail(404);
    saveConf({ key, provider, model }, slot);
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
  saveConf({ key, provider, model }, slot);
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
      max_tokens: 2048,
      system: r.system,
      output_config: r.json ? { effort: 'low', format: { type: 'json_schema', schema: r.schema || CLAUDE_SCHEMA } } : { effort: 'low' },
      messages: [{ role: 'user', content: r.user }],
    }),
  });
  if (!res.ok) return null;
  const msg = await res.json();
  if (msg.stop_reason !== 'end_turn') return null; // refusal·max_tokens 등
  return (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function askGemini(c, r, signal) {
  const res = await fetch(`${GEMINI_API}/models/${c.model || GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: geminiHeaders(c.key), cache: 'no-store', signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: r.system }] },
      contents: [{ role: 'user', parts: [{ text: r.user }] }],
      generationConfig: r.json
        ? { responseMimeType: 'application/json', responseSchema: r.gschema || GEMINI_SCHEMA, maxOutputTokens: 2048 }
        : { maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) return null; // 429(무료 한도 초과) 등
  const data = await res.json();
  const cand = (data.candidates || [])[0];
  if (!cand || cand.finishReason !== 'STOP') return null;
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
  if (!res.ok) return null; // 429(무료 한도 초과) 등
  const data = await res.json();
  const ch = (data.choices || [])[0];
  if (!ch || ch.finish_reason !== 'stop') return null;
  return (ch.message && ch.message.content) || '';
}

// 스위치·키·인터넷을 확인하고, 시간 제한을 걸어 부름. 실패면 null
async function ask(r, c = conf()) {
  if (!aiSwitch() || !c.key || navigator.onLine === false) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const fn = c.provider === 'gemini' ? askGemini : OPENAI_LIKE[c.provider] ? askOpenAILike : askClaude;
    return await fn(c, r, ctrl.signal);
  } catch {
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

const COACH_DAILY = 30;
const USE_KEY = 'voca.ai.coachuse.v1'; // { d: 날짜, n: 오늘 부른 횟수 }
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function takeCoachTurn() {
  let u = {};
  try { u = JSON.parse(localStorage.getItem(USE_KEY)) || {}; } catch {}
  const n = u.d === today() ? u.n || 0 : 0;
  if (n >= COACH_DAILY) return false;
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

const coachSystem = char => `영단어 시험을 준비하는 학생의 단어 앱 속 코치예요. ${COACH_PERSONA[char] || COACH_PERSONA.cat}
- 학생에게 직접 말하듯 해요체로 써요. 마크다운·이모지·목록 없이 문장으로만.
- 아래 <facts>에 있는 사실만 말해요. 숫자(개수·날짜·날 수)는 <facts>에 그대로 있는 것만 쓰고, 계산해서 새 숫자를 만들지 마요.
- 일정을 바꾸거나 개수를 정하는 건 앱이 해요. 코치는 지금 상황을 짚고, 오늘 무엇부터 하면 좋은지, 응원이나 요령을 말해요.
- 같은 말을 되풀이하지 말고, 그날 상황(밀렸는지, 앞서가는지, 다 했는지, 시험이 가까운지)에 맞게 구체적으로 말해요.
- mood는 말에 어울리는 표정 하나: normal(보통), happy(기쁨), worry(걱정), sleep(졸림·끝남), cheer(응원).`;

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

async function coachAsk(char, user, facts, { schema = SAY_SCHEMA, gschema = SAY_GSCHEMA } = {}) {
  if (!aiCoachOnline() || !takeCoachTurn()) return null;
  const text = await ask({ system: coachSystem(char), json: true, schema, gschema, user }, coachConf());
  if (!text) return null;
  try {
    const out = pickJSON(text);
    out.text = clean(out.text);
    if (!out.text || out.text.length > 400 || !numbersOk(out.text, facts)) return null;
    if (!MOODS.includes(out.mood)) out.mood = 'normal';
    return out;
  } catch {
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

const PICK_SCHEMA = {
  type: 'object',
  properties: { pick: { type: 'integer', description: '고른 선택지 번호, 맞는 게 없으면 0' }, mood: { type: 'string', enum: MOODS }, text: { type: 'string' } },
  required: ['pick', 'mood', 'text'],
  additionalProperties: false,
};
const PICK_GSCHEMA = { type: 'OBJECT', properties: { pick: { type: 'INTEGER' }, mood: { type: 'STRING', enum: MOODS }, text: { type: 'STRING' } }, required: ['pick', 'mood', 'text'] };

/**
 * 일정 상의하기: 학생이 한 말을 듣고 앱이 계산한 선택지 가운데 하나를 골라 줌 (코치가 새 일정을 만들지는 않음)
 * options: 선택지 설명 글자 목록(1번부터), message: 학생이 쓴 말
 * 반환 { pick: 1..n 또는 0(맞는 게 없음), mood, text } 또는 null
 */
export async function aiCoachPick({ char, facts, options, message }) {
  const list = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
  const all = `${facts}\n${list}`;
  const out = await coachAsk(char, `<facts>\n${facts}\n선택지:\n${list}\n</facts>\n학생이 일정에 대해 한 말:\n<message>${message}</message>\n\n학생 말에 가장 맞는 선택지 번호를 pick에 넣어요. 바꿀 수 있는 건 '시험 전 전체 복습을 며칠 할지'뿐이에요. 학생이 그 밖의 걸(예: 쉬는 요일, 범위) 원하면 pick은 지금 일정 번호로 두고, 이 창에선 복습 날 수만 정할 수 있다고 솔직히 말해요. 질문이면 선택지를 비교해서 답해요. text는 고른 이유를 1~3문장(110자 안팎)으로.`, all, { schema: PICK_SCHEMA, gschema: PICK_GSCHEMA });
  if (!out) return null;
  const pick = Number.isInteger(out.pick) && out.pick >= 1 && out.pick <= options.length ? out.pick : 0;
  return { pick, mood: out.mood, text: out.text };
}
