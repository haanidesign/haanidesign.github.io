/* さくひんの ほぞん。

   ブラウザの「もどる」やタブを閉じたときに 作りかけが消えないよう、
   ちょっと手が止まるたびに 端末の中（IndexedDB）へ しまっておく。
   さくひんは いくつも 持てて、さいしょの画面から えらべる。

   localStorage ではなく IndexedDB を使うのは、
   絵をそのまま持つと 5MB では すぐ足りなくなるため。

   しまうのは プロジェクトの中身（絵のデータも入っている）と 音。
   画像オブジェクトは 読み直すときに 作りなおす。 */

const DB = 'anime-kobo';
const STORE = 'doc';      // むかしの ひとつだけの ほぞん（読みこむだけ）
import { plain } from '../state.js?v=99';

const DOCS = 'docs';      // いまの ほぞん。さくひんごとに 1件
const KEY = 'last';

/** 持てる さくひんの数。これ以上は 消してから */
export const MAX_DOCS = 8;

function open(){
  return new Promise((ok, ng) => {
    if(!self.indexedDB) return ng(new Error('この端末では ほぞんできません'));
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if(!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error || new Error('ひらけませんでした'));
  });
}

function run(store, mode, fn){
  return open().then(db => new Promise((ok, ng) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); ng(tx.error); };
  }));
}

export const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * さくひんを しまう。
 *   id     … さくひんの ばんごう
 *   extra  … { audio:{name,bytes}, thumb:'data:image…' }
 */
export function saveDoc(id, project, extra = {}){
  /* 紙（canvas）や あみは そのままでは ほぞん できない。
     線や ピンから 作り直せる ものなので、のぞいてから しまう。 */
  const rec = { id, at: Date.now(), name: project.name || 'むだい', proj: plain(project) };
  if(extra.audio && extra.audio.bytes) rec.audio = { name: extra.audio.name, bytes: extra.audio.bytes };
  if(extra.thumb) rec.thumb = extra.thumb;
  return run(DOCS, 'readwrite', st => st.put(rec));
}

export function loadDoc(id){
  return run(DOCS, 'readonly', st => st.get(id)).then(r => r || null);
}

export function deleteDoc(id){
  return run(DOCS, 'readwrite', st => st.delete(id));
}

/** 見出しだけの ならび（新しい順）。中身は 入っていない ＝ 軽い */
export async function listDocs(){
  const all = await run(DOCS, 'readonly', st => st.getAll());
  const list = (all || []).map(r => ({
    id: r.id, at: r.at,
    name: (r.proj && r.proj.name) || r.name || 'むだい',
    thumb: r.thumb || null,
    layers: (r.proj && r.proj.layers) ? r.proj.layers.length : 0,
    seconds: (r.proj && r.proj.duration) || 0
  }));
  list.sort((a, b) => b.at - a.at);
  return list;
}

/** むかしの「ひとつだけの ほぞん」を さくひんに 引っこす（1回だけ） */
export async function migrateOld(){
  let old = null;
  try{ old = await run(STORE, 'readonly', st => st.get(KEY)); }catch(_){ return null; }
  if(!old || !old.proj || !(old.proj.layers || []).length) return null;
  const id = newId();
  await saveDoc(id, old.proj, { audio: old.audio });
  try{ await run(STORE, 'readwrite', st => st.delete(KEY)); }catch(_){}
  return id;
}

/** 何秒か前のものか、人の言葉で */
/** 何秒か前のものか、人の言葉で */
export function whenText(at){
  const s = Math.max(0, (Date.now() - at) / 1000);
  if(s < 90) return 'さっき';
  if(s < 3600) return Math.round(s / 60) + '分まえ';
  if(s < 86400) return Math.round(s / 3600) + '時間まえ';
  return Math.round(s / 86400) + '日まえ';
}

/**
 * 手が止まってから しまう。
 * 描いている最中に毎回しまうと 重くなるので、少し待つ。
 */
export function autoSaver(getProject, opts = {}){
  const wait = opts.wait || 1200;
  const getId = opts.getId || (() => null);
  const getAudio = opts.getAudio || (() => null);
  const getThumb = opts.getThumb || (() => null);
  const onDone = opts.onDone || (() => {});
  let timer = null, busy = false, again = false;

  async function flush(){
    const id = getId();
    if(!id) return;
    if(busy){ again = true; return; }
    busy = true;
    try{
      await saveDoc(id, getProject(), { audio: getAudio(), thumb: getThumb() });
      onDone(true);
    }catch(err){
      onDone(false, err);
    }finally{
      busy = false;
      if(again){ again = false; flush(); }
    }
  }

  return {
    touch(){
      clearTimeout(timer);
      timer = setTimeout(flush, wait);
    },
    now: flush
  };
}
