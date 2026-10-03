/* ほかの 道具から 受けとる。

   ミニSpine の「動画工房へ 送る」は、動画を
   端末の中（IndexedDB の haani-handoff）に 置いてから ここを ひらく。
   ?from=mini-spine が ついて いたら それを とりだす。受けとったら 置き場は 消す。 */

const DB = 'haani-handoff';

function shelf(key, del) {
  return new Promise((ok, ng) => {
    if (!self.indexedDB) return ok(null);
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('box');
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('box', 'readwrite');
      const st = tx.objectStore('box');
      const q = del ? st.delete(key) : st.get(key);
      tx.oncomplete = () => { db.close(); ok(del ? null : (q.result || null)); };
      tx.onerror = () => { db.close(); ng(tx.error); };
    };
  });
}

/** { name, w, h, file } か null */
export async function takeHandoff() {
  if (new URLSearchParams(location.search).get('from') !== 'mini-spine') return null;
    const box = await shelf('mini-spine-video');
  if (!box || !box.blob) return null;
  const file = new File([box.blob], box.fileName || 'minispine.mp4', { type: box.blob.type || 'video/mp4' });
  return { name: box.name || 'ミニSpine', w: box.w, h: box.h, file };
}

/** ひらき おわったら よぶ。置き場を 消して、読みなおしで 2回 入らない ように する */
export function doneHandoff(){
  history.replaceState(history.state, '', location.pathname);
  return shelf('mini-spine-video', true).catch(() => {});
}
