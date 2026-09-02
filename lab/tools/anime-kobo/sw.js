/* ホーム画面から ひらく ための しくみ（サービスワーカー）。

   なにを して いるか
     ・つないで いる ときは かならず 新しいのを 取りに 行く
     ・取れたら 手もとにも しまっておく
     ・つながらない ときだけ 手もとの ものを 出す

   なぜ この 順番か
     さきに 手もとの ものを 出す やり方（キャッシュ優先）だと、
     直しても いつまでも 古い ままに なる。
     この 道具は しょっちゅう 直すので、新しいのを 先に する。
     そのかわり 電波が 無い ときも 前に 見た ぶんは ひらける。 */

const VER = 'v122';
const BOX = 'anime-kobo-' + VER;

self.addEventListener('install', (e) => {
  // すぐ 入れかわる（古いのを 待たない）
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 古い しまい場所を 片づける
    const names = await caches.keys();
    await Promise.all(names.map(n => n.startsWith('anime-kobo-') && n !== BOX
      ? caches.delete(n) : null));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;      // よその ものは さわらない

  e.respondWith((async () => {
    try{
      const res = await fetch(req);
      if(res && res.ok){
        const box = await caches.open(BOX);
        box.put(req, res.clone());
      }
      return res;
    }catch(_){
      const hit = await caches.match(req, { ignoreSearch: true });
      if(hit) return hit;
      // ページを 出せない ときは とりあえず 入口を 出す
      if(req.mode === 'navigate'){
        const top = await caches.match('./index.html', { ignoreSearch: true });
        if(top) return top;
      }
      throw _;
    }
  })());
});
