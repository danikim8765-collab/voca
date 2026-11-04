// 단어 모드 직접 입력의 AI 채점 (Claude). 인터넷이 되고 API 키가 있을 때만 쓰고,
// 안 되거나 실패하면 null을 돌려줘서 core.js의 gradeMeaning(규칙 채점)으로 채점한다.
// 서버 없이 브라우저에서 바로 Anthropic API를 부른다. 키는 이 기기의 localStorage에만 저장 (동기화 안 함)

const API = 'https://api.anthropic.com/v1';
const MODEL = 'claude-sonnet-5-5';
const KEY = 'voca.ai.v1'; // { key } 두 모드가 같이 씀
const TIMEOUT_MS = 12000;

const loadConf = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveConf = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} };

export const aiKey = () => loadConf().key || '';
export const aiEnabled = () => !!aiKey();
export const aiOnline = () => aiEnabled() && navigator.onLine !== false;

const headers = key => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': '2026-10-21',
  // 서버 없이 브라우저에서 바로 부를 때 필요한 헤더 (키는 사용자 본인 것)
  'anthropic-dangerous-direct-browser-access': 'true',
});

// 키가 맞는지 확인 (모델 정보 조회라 비용 없음). 맞으면 저장
export async function aiConnect(key) {
  const res = await fetch(`${API}/models/${MODEL}`, { headers: headers(key), cache: 'no-store' });
  if (!res.ok) {
    const err = new Error(String(res.status));
    err.status = res.status;
    throw err;
  }
  saveConf({ key });
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
- missing은 학생이 빠뜨린 단어장 뜻 갈래 수예요.
- note는 학생에게 보여 줄 한 줄 설명이에요 (20자 안팎, 해요체). 정답이면 빈 문자열.`;

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', enum: [0, 1, 2], description: '2 정답, 1 부분 정답, 0 오답' },
    missing: { type: 'integer', description: '빠뜨린 뜻 갈래 수' },
    note: { type: 'string', description: '학생에게 보여 줄 짧은 설명' },
  },
  required: ['score', 'missing', 'note'],
  additionalProperties: false,
};

/**
 * AI 채점. 반환 { score: 0|1|2, missing, note } 또는 null(오프라인·키 없음·실패 → 규칙 채점으로)
 */
export async function aiGradeMeaning({ word, meaning, user, strict = 'mid' }) {
  const key = aiKey();
  if (!key || navigator.onLine === false) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: headers(key),
      cache: 'no-store',
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{
          role: 'user',
          content: `영단어: ${word}\n단어장 뜻: ${meaning}\n채점 기준: ${STRICT_RULE[strict] || STRICT_RULE.mid}\n\n학생 답:\n<answer>${user}</answer>`,
        }],
      }),
    });
    if (!res.ok) return null;
    const msg = await res.json();
    if (msg.stop_reason !== 'end_turn') return null; // refusal·max_tokens 등은 규칙 채점으로
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const out = JSON.parse(text);
    if (![0, 1, 2].includes(out.score)) return null;
    return { score: out.score, missing: Math.max(0, out.missing | 0), note: String(out.note || '').trim() };
  } catch {
    return null; // 인터넷 끊김, 시간 초과, 잘못된 응답
  } finally {
    clearTimeout(timer);
  }
}
