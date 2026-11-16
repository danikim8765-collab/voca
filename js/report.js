// 버그 신고: 정답 시트의 깃발 아이콘(그 문제) · 설정 맨 아래(앱 전체). GitHub 이슈 쓰는 화면을 내용을 채워서 열거나, 복사만.
// 서버 없이 링크만 만듦. 학습 기록·API 키·토큰은 넣지 않음.

const FALLBACK_REPO = 'danikim8765-collab/voca';

// <계정>.github.io/<저장소>/ 에서 열었으면 그 저장소, 아니면(로컬 등) 원래 저장소
export function reportRepo(loc = {}) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname || '');
  const seg = String(loc.pathname || '').split('/').filter(Boolean)[0];
  return m && seg && !/\.html?$/i.test(seg) ? `${m[1]}/${seg}` : FALLBACK_REPO;
}

// 상황마다 고를 수 있는 이유 (여러 개 고를 수 있음)
export function reportReasons(ctx) {
  if (!ctx) return ['화면·버튼이 이상해요', '진도·동기화', '코치·AI', '느리거나 멈춰요', '기타'];
  const r = [];
  if (ctx.mode === 'syn') r.push('정답이 이상해요');
  else if (ctx.mode === 'word') r.push('채점이 이상해요');
  else r.push('정답·빈칸이 이상해요', '해석 강조가 이상해요');
  if (ctx.how === 'choice') r.push('보기가 이상해요');
  else if (ctx.mode === 'ex') r.push('채점·말풍선이 이상해요');
  r.push('뜻·예문이 틀렸어요', '기타');
  return r;
}

// 앱이 잡은 오류를 최근 것만 남김
export function pushError(list, msg, now = Date.now(), max = 8) {
  const m = String(msg || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!m) return list || [];
  const out = (list || []).filter(e => e && e.m !== m);
  out.push({ t: now, m });
  return out.slice(-max);
}

const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// { reasons, note, ctx, app: { version, ai, device }, errors } → { title, body }
export function reportText({ reasons = [], note = '', ctx = null, app = {}, errors = [], now = Date.now() }) {
  const why = reasons.length ? reasons.join(', ') : '기타';
  const title = ctx ? `[신고] ${one(ctx.word)} — ${why}` : `[신고] ${why}`;
  const L = [];
  L.push(`**무엇이 이상한가요**: ${why}`);
  if (one(note)) L.push('', '> ' + String(note).trim().split('\n').map(x => x.trim()).join('\n> '));
  if (ctx) {
    const MODE = { ex: '예문', word: '단어', syn: '유반의어 테스트' };
    const HOW = { choice: '4지선다', type: '직접 입력' };
    L.push('', '#### 문제');
    const row = (k, v) => { v = one(v); if (v) L.push(`- **${k}**: ${cut(v, 400)}`); };
    row('단어', `${ctx.word}${ctx.day ? ` (DAY ${ctx.day})` : ''}${ctx.id != null ? ` · id ${ctx.id}` : ''}`);
    row('모드', [MODE[ctx.mode] || ctx.mode, HOW[ctx.how], ctx.strict].filter(Boolean).join(' · '));
    row('결과', ctx.label);
    row('내 답', ctx.given);
    if (ctx.choices && ctx.choices.length) row('보기', ctx.choices.map((c, i) => `${i + 1}) ${one(c)}${i === ctx.picked ? ' ←고름' : ''}${i === ctx.right ? ' ✓' : ''}`).join('  '));
    row('뜻', ctx.meaning);
    row('예문 1', ctx.ex1);
    row('해석 1', ctx.ex1ko);
    row('예문 2', ctx.ex2);
    row('해석 2', ctx.ex2ko);
    row('강조어 설정', ctx.marked);
  }
  L.push('', '#### 앱');
  L.push(`- **버전**: ${one(app.version) || '?'}${app.ai ? ` · AI: ${one(app.ai)}` : ''}`);
  if (app.device) L.push(`- **기기**: ${cut(one(app.device), 300)}`);
  const recent = (errors || []).filter(e => e && now - e.t < 3 * 864e5).slice(-3);
  if (recent.length) {
    L.push('', '<details><summary>최근 오류</summary>', '', '```');
    for (const e of recent) L.push(`${new Date(e.t).toISOString().slice(5, 16)} ${e.m}`);
    L.push('```', '</details>');
  }
  return { title: cut(title, 120), body: L.join('\n') };
}

// GitHub 새 이슈 화면 링크. 주소가 너무 길면 본문 뒤쪽을 자름
export function issueUrl(repo, title, body, max = 7000) {
  const make = b => `https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(b)}`;
  let url = make(body);
  if (url.length <= max) return url;
  let b = body;
  while (b.length > 200 && url.length > max) {
    b = b.slice(0, Math.floor(b.length * 0.85));
    url = make(b + '\n\n…(길어서 잘림)');
  }
  return url;
}

// ---------- 로그인 없이 보내기: Google 설문지 ----------
// 신고는 Google 설문지로 보내고, 응답은 그 설문지에 연결한 Google 시트에 쌓임 (Claude가 Google Sheets로 읽음).
// id·entry는 설문지의 '미리 채워진 링크'에서 (parseFormLink). 비어 있으면 예전처럼 GitHub 이슈 화면을 엶
export const REPORT_FORM = { id: '1FAIpQLSe5HE323TbUv7rPrew5GsvK11MC_TjJf5255DH0QjzYyIh2vA', entry: 'entry.565931740' }; // 'VOCA 신고' 설문지 (질문 '내용', 장문형)
export const formReady = (f = REPORT_FORM) => !!(f && f.id && f.entry);

// 미리 채워진 링크 https://docs.google.com/forms/d/e/<id>/viewform?usp=pp_url&entry.123456=… → { id, entry: 'entry.123456' }
export function parseFormLink(url) {
  const s = String(url || '');
  const id = (s.match(/\/forms\/d\/e\/([\w-]{20,})\//) || [])[1];
  const entry = (s.match(/[?&](entry\.\d+)=/) || [])[1];
  return id && entry ? { id, entry } : null;
}

// 설문지 응답 보내기 요청. 브라우저에선 no-cors로 보내서 답은 못 읽음(보내졌는지는 네트워크가 됐는지로만 앎)
export function formRequest(f, text) {
  const body = new URLSearchParams({ [f.entry]: String(text).slice(0, 30000) }).toString();
  return { url: `https://docs.google.com/forms/d/e/${f.id}/formResponse`, body };
}

// 아직 못 보낸 신고 줄: 새 것을 뒤에, 너무 많으면 오래된 것부터 버림
export function queueReport(list, item, max = 30) {
  return [...(Array.isArray(list) ? list : []).filter(x => x && x.id !== item.id), item].slice(-max);
}
