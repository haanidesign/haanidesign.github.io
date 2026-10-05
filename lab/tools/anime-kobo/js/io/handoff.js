/* ほかの 道具から 受けとる。

   ミニSpine の「アニメ工房へ 送る」は、こまの 絵を
   端末の中（IndexedDB の haani-handoff）に 置いてから ここを ひらく。
   ?from=mini-spine が ついて いたら、それを 1つの コマレイヤーに して 新しい さくひんに する。
   ひらき おわったら doneHandoff() で 置き場と ?from= を 消す
   （とちゅうで 読みなおしに なっても、もう いちど 受けとれる ように）。 */

import { newProject } from '../state.js?v=322';
import { newLayer } from '../engine/layer.js?v=322';
import { spreadFrames } from '../engine/anim.js?v=322';
import { uid } from '../engine/math.js?v=322';

const DB = 'haani-handoff';

function shelf(key, del){
  return new Promise((ok, ng) => {
    if(!self.indexedDB) return ok(null);
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

/** 受けとる ものが あれば プロジェクトに して かえす。なければ null */
export async function takeHandoff(){
  const from = new URLSearchParams(location.search).get('from');
  if(from !== 'mini-spine') return null;
    const box = await shelf('mini-spine');
  if(!box || !box.frames || !box.frames.length) return null;

  const dur = Math.max(0.1, box.dur || box.frames.length / (box.fps || 12));
  const loops = Math.max(1, Math.ceil(6 / dur));
  const pj = newProject(box.w, box.h, +(dur * loops).toFixed(3));
  pj.name = box.name || 'ミニSpine';
  if(box.bg) pj.bg = box.bg;

  const ids = box.frames.map((src, i) => {
    const id = uid('A');
    pj.assets[id] = { id, name: 'コマ' + (i + 1), src, w: box.w, h: box.h };
    return id;
  });
  const l = newLayer('ミニSpine', ids);
  l.x = box.w / 2; l.y = box.h / 2;
  spreadFrames(l, dur / box.frames.length, 0);
  l.loop = { from: 0, to: +dur.toFixed(3), mode: 'loop' };
  pj.layers.unshift(l);
  return pj;
}

/** ひらき おわったら よぶ。置き場を 消して、読みなおしで 2回 入らない ように する */
export function doneHandoff(){
  history.replaceState(history.state, '', location.pathname);
  return shelf('mini-spine', true).catch(() => {});
}
