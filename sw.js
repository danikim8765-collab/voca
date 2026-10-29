// 네트워크 우선, 실패하면 캐시 (오프라인에서도 열리게)
// 브라우저 HTTP 캐시를 거치지 않고 항상 서버에 확인 → 앱을 고치면 바로 반영
const CACHE = 'voca-v2';

self.addEventListener('install', () => self.skipWaiting());
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
