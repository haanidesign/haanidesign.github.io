/* さくひんの ほぞん。
   手が 止まる たびに 端末の 中（IndexedDB）へ しまう。
   組み立てと いっしょに 素材そのものも しまうので、
   ひらけば その まま つづきが できる。

   素材は 大きい ので、doc とは 別の たなに 1つずつ 入れる。
   同じ 素材を 何度も 書きなおさない ように、入って いない ものだけ 足す。 */

const DB = 'douga-kobo';
const DOCS = 'docs';
const BLOBS = 'blobs';

/** しまって いい 素材の 合計。これを こえたら 組み立てだけ しまう */
export const MAX_BYTES = 700 * 1024 * 1024;
export const MAX_DOCS = 8;

let dbOk = null;
export const storeOk = () => dbOk;

function open() {
  return new Promise((ok, ng) => {
    if (!self.indexedDB) { dbOk = false; return ng(new Error('この端末では ほぞんできません')); }
    /* ひらくのを ずっと 待たされる ことが ある（ほかの タブが つかんで いる など）。
       待ちきれたら あきらめる。ここで 止まると さいしょの 画面が 出なく なる。 */
    const guard = setTimeout(() => { dbOk = false; ng(new Error('ほぞんが ひらけません')); }, 8000);
    const fin = (f) => (...a) => { clearTimeout(guard); f(...a); };
    ok = fin(ok); ng = fin(ng);
    const r = indexedDB.open(DB, 1);
    r.onblocked = () => { dbOk = false; ng(new Error('ほぞんが つかわれて います')); };
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
    };
    r.onsuccess = () => { dbOk = true; ok(r.result); };
    r.onerror = () => ng(r.error || new Error('ひらけませんでした'));
  });
}
function run(store, mode, fn) {
  return open().then(db => new Promise((ok, ng) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); ng(tx.error); };
    tx.onabort = () => { db.close(); ng(tx.error || new Error('いっぱいです')); };
  }));
}

export const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const bkey = (docId, mid) => docId + ':' + mid;

export const hasBlob = k => run(BLOBS, 'readonly', st => st.getKey(k)).then(v => v !== undefined);
export const putBlob = (k, blob) => run(BLOBS, 'readwrite', st => st.put(blob, k));
export const getBlob = k => run(BLOBS, 'readonly', st => st.get(k));

/** さくひんを しまう。media は [{id,name,kind,type,dur,file}] */
export async function saveDoc(id, doc, media, thumb) {
  let bytes = 0;
  media.forEach(m => { if (m.file) bytes += m.file.size; });
  const keep = bytes <= MAX_BYTES;
  const list = [];
  for (const m of media) {
    const rec = { id: m.id, name: m.name, kind: m.kind, type: m.file ? m.file.type : '', dur: m.dur };
    if (keep && m.file) {
      const k = bkey(id, m.id);
      try {
        if (!(await hasBlob(k))) await putBlob(k, m.file);
        rec.blob = k;
      } catch (e) { /* 入らなかった ものは あきらめる */ }
    }
    list.push(rec);
  }
  const clips = (doc.tracks || []).reduce((n, t) => n + t.clips.length, 0);
  const secs = (doc.tracks || []).reduce((n, t) =>
    Math.max(n, ...t.clips.map(c => c.start + c.dur), 0), 0);
  await run(DOCS, 'readwrite', st => st.put({
    id, at: Date.now(), name: doc.name || 'むだい',
    doc, media: list, thumb: thumb || null,
    clips, secs, full: keep
  }));
}

export const loadDoc = id => run(DOCS, 'readonly', st => st.get(id)).then(r => r || null);

export async function deleteDoc(id) {
  const rec = await loadDoc(id);
  if (rec) {
    for (const m of rec.media || []) {
      if (m.blob) { try { await run(BLOBS, 'readwrite', st => st.delete(m.blob)); } catch (e) { } }
    }
  }
  return run(DOCS, 'readwrite', st => st.delete(id));
}

/** 見出しだけ（新しい順）。中身は 入って いない ＝ かるい */
export async function listDocs() {
  let all = [];
  try { all = await run(DOCS, 'readonly', st => st.getAll()); } catch (e) { return []; }
  return (all || []).map(r => ({
    id: r.id, at: r.at, name: r.name || 'むだい',
    thumb: r.thumb || null, clips: r.clips || 0, secs: r.secs || 0, full: r.full !== false
  })).sort((a, b) => b.at - a.at);
}

export function whenText(at) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 90) return 'さっき';
  if (s < 3600) return Math.round(s / 60) + '分まえ';
  if (s < 86400) return Math.round(s / 3600) + '時間まえ';
  return Math.round(s / 86400) + '日まえ';
}

/** 手が 止まってから しまう */
export function autoSaver(getAll, opts = {}) {
  const wait = opts.wait || 1500;
  let timer = null, busy = false, again = false;
  async function flush() {
    const p = getAll();
    if (!p || !p.id) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      await saveDoc(p.id, p.doc, p.media, p.thumb);
      opts.onDone && opts.onDone(true);
    } catch (e) {
      opts.onDone && opts.onDone(false, e);
    } finally {
      busy = false;
      if (again) { again = false; flush(); }
    }
  }
  return {
    touch() { clearTimeout(timer); timer = setTimeout(flush, wait); },
    now: flush
  };
}
