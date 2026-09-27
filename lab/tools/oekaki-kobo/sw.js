/* ホーム画面から ひらく ための しくみ。
   つないで いる ときは 新しいのを 取りに 行き、取れたら 手もとにも しまう。
   つながらない ときだけ 手もとの ものを 出す。 */
const BOX = 'oekaki-kobo-v7';
const CORE = ['./', './index.html', './css/style.css', './css/soft.css', '../skin/soft.css', './js/app.js', './js/engine.js', './js/store.js',
  './js/icons.js', './js/rslider.js', './engine.wasm', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(BOX).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => n.startsWith('oekaki-kobo-') && n !== BOX ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !url.hostname.endsWith('gstatic.com') && !url.hostname.endsWith('googleapis.com')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, url.origin === location.origin ? { cache: 'no-cache' } : undefined);
      if (res && (res.ok || res.type === 'opaque')) (await caches.open(BOX)).put(req, res.clone());
      return res;
    } catch (_) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const top = await caches.match('./index.html', { ignoreSearch: true });
        if (top) return top;
      }
      return new Response('', { status: 504 });
    }
  })());
});
