/* じどう保存。
   ブラウザの「もどる」やタブを閉じたときに 作りかけが消えないよう、
   ちょっと手が止まるたびに 端末の中（IndexedDB）へ しまっておく。

   localStorage ではなく IndexedDB を使うのは、
   絵をそのまま持つと 5MB では すぐ足りなくなるため。

   しまうのは プロジェクトの中身（絵のデータも入っている）だけ。
   画像オブジェクトは 読み直すときに 作りなおす。 */

const DB = 'anime-kobo';
const STORE = 'doc';
const KEY = 'last';

function open(){
  return new Promise((ok, ng) => {
    if(!self.indexedDB) return ng(new Error('この端末では ほぞんできません'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      if(!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error || new Error('ひらけませんでした'));
  });
}

function run(mode, fn){
  return open().then(db => new Promise((ok, ng) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); ng(tx.error); };
  }));
}

/** しまう。中身は そのままの形（構造化複製）で入るので JSON にしなくてよい */
export function save(project){
  const rec = { at: Date.now(), proj: project };
  return run('readwrite', st => st.put(rec, KEY));
}

/** 前回のぶんを 取り出す。無ければ null */
export function load(){
  return run('readonly', st => st.get(KEY)).then(r => r || null);
}

export function clear(){
  return run('readwrite', st => st.delete(KEY));
}

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
  let timer = null, busy = false, again = false, onDone = opts.onDone || (() => {});

  async function flush(){
    if(busy){ again = true; return; }
    busy = true;
    try{
      await save(getProject());
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
