// 단어 CSV 파일 (저장소 루트). 새 파일이 생기면 여기에 이름만 추가하면 됨.
// 예문(빈칸 암기, index.html)과 단어(뜻 퀴즈, meaning.html)가 같이 씀.
export const DATA_FILES = ['VOCA_26-37.csv', 'VOCA_38-50.csv'];

// 마지막으로 받은 CSV를 저장해 두는 곳 (오프라인일 때 이걸로 동작)
export const CSV_CACHE_KEY = 'voca.csvcache.v1';

async function fetchCSV(name) {
  const res = await fetch(encodeURI(name) + '?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const buf = await res.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf); // utf-8-sig의 BOM은 parseCSV에서 제거
}

const loadCache = () => {
  try { const v = localStorage.getItem(CSV_CACHE_KEY); return v ? JSON.parse(v) : {}; } catch { return {}; }
};

// 저장해 둔 CSV를 바로 돌려줌 (네트워크 안 기다림). 처음 여는 기기면 빈 배열.
export function cachedCSVTexts() {
  const cached = loadCache();
  return Object.keys(cached)
    .filter(name => (DATA_FILES.includes(name) || name.startsWith('local:')) && cached[name])
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, text: cached[name] }));
}

// 두 CSV 묶음이 같은지 (서버에서 받은 게 저장해 둔 것과 같으면 화면을 다시 안 그림)
export const sameTexts = (a, b) =>
  a.length === b.length && a.every((t, i) => t.name === b[i].name && t.text === b[i].text);

// 서버에서 CSV를 받고, 실패한 파일은 저장해 둔 것으로 대신함. 폰에서 직접 연 CSV(local:)도 포함.
export async function loadCSVTexts() {
  const cached = loadCache();
  const texts = [];
  let fromCache = 0;
  const missing = [];
  await Promise.all(DATA_FILES.map(async name => {
    try {
      const text = await fetchCSV(name);
      cached[name] = text;
      texts.push({ name, text });
    } catch {
      if (cached[name]) { texts.push({ name, text: cached[name] }); fromCache++; } else missing.push(name);
    }
  }));
  for (const name of Object.keys(cached)) {
    if (name.startsWith('local:') && !texts.some(t => t.name === name)) texts.push({ name, text: cached[name] });
  }
  try { localStorage.setItem(CSV_CACHE_KEY, JSON.stringify(cached)); } catch {}
  texts.sort((a, b) => a.name.localeCompare(b.name));
  return { texts, fromCache, missing };
}
