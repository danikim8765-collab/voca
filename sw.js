// 네트워크 우선, 실패하면 캐시 (오프라인에서도 열리게)
// 브라우저 HTTP 캐시를 거치지 않고 항상 서버에 확인 → 앱을 고치면 바로 반영
const CACHE = 'voca-v2';

// 처음 연 직후에 인터넷이 끊겨도 열리게, 설치할 때 앱 파일을 미리 받아 둠 (하나가 실패해도 설치는 됨)
const SHELL = ['./', 'index.html', 'style.css', 'js/app.js', 'js/core.js', 'js/sync.js', 'js/ai.js', 'js/files.js', 'manifest.webmanifest', 'highlights.json', 'version.txt', 'icon-192.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u =>
    fetch(u, { cache: 'no-cache' }).then(res => (res.ok ? c.put(new URL(u, location.href).href.split('?')[0], res) : null)).catch(() => null)))));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.url.split('?')[0];
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then(r => r || Response.error())),
  );
});
