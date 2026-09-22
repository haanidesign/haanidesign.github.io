/* ホーム画面から ひらく ための しくみ。
   つないで いる ときは かならず 新しいのを 取りに 行き、
   取れたら 手もとにも しまう。つながらない ときだけ 手もとの ものを 出す。 */
const VER = 'v6';
const BOX = 'douga-kobo-' + VER;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n =>
      n.startsWith('douga-kobo-') && n !== BOX ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      /* 中の ファイルも ブラウザの ためこみを 通さずに 取る。
         古いのと 新しいのが 混ざると、読みこみ そのものが こける。 */
      const fresh = req.mode === 'navigate' || url.pathname.endsWith('/')
        || url.pathname.endsWith('.html') || url.pathname.endsWith('sw.js')
        || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
      const res = await fetch(req, fresh ? { cache: 'reload' } : undefined);
      if (res && res.ok) { (await caches.open(BOX)).put(req, res.clone()); }
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
