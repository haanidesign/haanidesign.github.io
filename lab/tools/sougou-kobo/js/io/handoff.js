/* ほかの 道具から 受けとる。

   ミニSpine の「アニメ工房へ 送る」は、こまの 絵を
   端末の中（IndexedDB の haani-handoff）に 置いてから ここを ひらく。
   ?from=mini-spine が ついて いたら、それを 1つの コマレイヤーに して 新しい さくひんに する。
   ひらき おわったら doneHandoff() で 置き場と ?from= を 消す
   （とちゅうで 読みなおしに なっても、もう いちど 受けとれる ように）。 */

import { newProject } from '../state.js?v=358';
import { newLayer } from '../engine/layer.js?v=358';
import { spreadFrames } from '../engine/anim.js?v=358';
import { uid } from '../engine/math.js?v=358';

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

/** 置き場の 中身（なければ null） */
export async function readHandoff(){
  const from = new URLSearchParams(location.search).get('from');
  if(from !== 'mini-spine') return null;
  return await shelf('mini-spine');
}

/** pj の start 秒から 動きを ならべる。ふえた 秒数を かえす */
export function appendHandoff(pj, box, start){
  const items = box.items && box.items.length ? box.items
    : (box.frames && box.frames.length ? [{ name: box.name, frames: box.frames, fps: box.fps, dur: box.dur, reps: 0 }] : null);
  if(!items) return 0;
  const single = items.length === 1 && !start;
  const plan = items.map(it => {
    const dur = Math.max(0.1, it.dur || it.frames.length / (it.fps || 12));
    const reps = single ? Math.max(1, Math.ceil(6 / dur)) : Math.max(1, it.reps || Math.ceil(2 / dur - 1e-6));
    return { it, dur, len: dur * reps };
  });
  const cx = (pj.w || box.w) / 2, cy = (pj.h || box.h) / 2;
  const t = start || 0; let end = t;
  plan.forEach(({ it, dur, len }, n) => {
    const ids = it.frames.map((src, i) => {
      const id = uid('A');
      pj.assets[id] = { id, name: (it.name || 'コマ') + (i + 1), src, w: it.w || box.w, h: it.h || box.h };
      return id;
    });
    const l = newLayer(single ? 'ミニSpine' : (it.name || 'ミニSpine' + (n + 1)), ids);
    l.x = cx; l.y = cy;
    spreadFrames(l, dur / it.frames.length, t);
    l.loop = { from: +t.toFixed(3), to: +(t + dur).toFixed(3), mode: 'loop' };
    if(!single) l.span = { from: +t.toFixed(3), to: +(t + len).toFixed(3) };
    pj.layers.unshift(l);
    end = Math.max(end, t + len);   // どれも 同じ ところから はじまる（つぎも t の まま）
  });
  return end - (start || 0);
}

/** 新しい さくひんに する */
export function handoffProject(box){
  const pj = newProject(box.w, box.h, 1);
  pj.name = box.name || 'ミニSpine';
  if(box.bg) pj.bg = box.bg;
  const len = appendHandoff(pj, box, 0);
  if(!len) return null;
  pj.duration = +len.toFixed(3);
  return pj;
}

export async function takeHandoff(){
  const box = await readHandoff();
  return box ? handoffProject(box) : null;
}

/** ひらき おわったら よぶ。置き場を 消して、読みなおしで 2回 入らない ように する */
export function doneHandoff(){
  history.replaceState(history.state, '', location.pathname);
  return shelf('mini-spine', true).catch(() => {});
}

/** 動画工房へ わたす。置いてから 動画工房を ひらく */
export async function sendToDouga(box){
  await new Promise((ok, ng) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('box');
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('box', 'readwrite');
      tx.objectStore('box').put(Object.assign({ at: Date.now() }, box), 'anime-kobo-video');
      tx.oncomplete = () => { db.close(); ok(); };
      tx.onerror = () => { db.close(); ng(tx.error); };
    };
  });
  location.href = '../douga-kobo/?from=anime-kobo';
}
