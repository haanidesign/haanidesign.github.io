/* ほかの 道具から 受けとる。

   ミニSpine の「アニメ工房へ 送る」は、こまの 絵を
   端末の中（IndexedDB の haani-handoff）に 置いてから ここを ひらく。
   ?from=mini-spine が ついて いたら、それを 1つの コマレイヤーに して 新しい さくひんに する。
   ひらき おわったら doneHandoff() で 置き場と ?from= を 消す
   （とちゅうで 読みなおしに なっても、もう いちど 受けとれる ように）。 */

import { newProject } from '../state.js?v=324';
import { newLayer } from '../engine/layer.js?v=324';
import { spreadFrames } from '../engine/anim.js?v=324';
import { uid } from '../engine/math.js?v=324';

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
  if(!box) return null;
  /* いくつも まとめて 送られた ときは box.items。1つの ときは むかしの 形 */
  const items = box.items && box.items.length ? box.items
    : (box.frames && box.frames.length ? [{ name: box.name, frames: box.frames, fps: box.fps, dur: box.dur, reps: 0 }] : null);
  if(!items) return null;

  const single = items.length === 1;
  // 1つ … 6秒ほど くり返す。いくつも … 順番に つなぐ（それぞれ reps 回）
  const plan = items.map(it => {
    const dur = Math.max(0.1, it.dur || it.frames.length / (it.fps || 12));
    const reps = single ? Math.max(1, Math.ceil(6 / dur)) : Math.max(1, it.reps || 1);
    return { it, dur, len: dur * reps };
  });
  const total = plan.reduce((a, p) => a + p.len, 0);
  const pj = newProject(box.w, box.h, +total.toFixed(3));
  pj.name = box.name || 'ミニSpine';
  if(box.bg) pj.bg = box.bg;

  let start = 0;
  plan.forEach(({ it, dur, len }, n) => {
    const ids = it.frames.map((src, i) => {
      const id = uid('A');
      pj.assets[id] = { id, name: (it.name || 'コマ') + (i + 1), src, w: box.w, h: box.h };
      return id;
    });
    const l = newLayer(single ? 'ミニSpine' : (it.name || 'ミニSpine' + (n + 1)), ids);
    l.x = box.w / 2; l.y = box.h / 2;
    spreadFrames(l, dur / it.frames.length, start);
    l.loop = { from: +start.toFixed(3), to: +(start + dur).toFixed(3), mode: 'loop' };
    if(!single) l.span = { from: +start.toFixed(3), to: +(start + len).toFixed(3) };
    pj.layers.unshift(l);
    start += len;
  });
  return pj;
}

/** ひらき おわったら よぶ。置き場を 消して、読みなおしで 2回 入らない ように する */
export function doneHandoff(){
  history.replaceState(history.state, '', location.pathname);
  return shelf('mini-spine', true).catch(() => {});
}
