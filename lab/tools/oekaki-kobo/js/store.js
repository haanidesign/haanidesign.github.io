/* 作品と 設定を タブレットの 中（IndexedDB）に しまう。
   meta … 一覧に 出す もの（名前・大きさ・小さな絵・日時）
   data … 絵の 中み
   kv   … ブラシセット や 設定 */

const DB_NAME = 'oekaki-kobo';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('しまえませんでした'));
  }));
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export const store = {
  async list() {
    const all = await tx(['meta'], 'readonly', t => req(t.objectStore('meta').getAll()));
    return (all || []).sort((a, b) => b.updated - a.updated);
  },
  async getMeta(id) { return tx(['meta'], 'readonly', t => req(t.objectStore('meta').get(id))); },
  async load(id) { return tx(['data'], 'readonly', t => req(t.objectStore('data').get(id))); },
  async save(meta, bytes) {
    return tx(['meta', 'data'], 'readwrite', t => {
      t.objectStore('meta').put(meta);
      if (bytes) t.objectStore('data').put(bytes, meta.id);
    });
  },
  async putMeta(meta) { return tx(['meta'], 'readwrite', t => { t.objectStore('meta').put(meta); }); },
  async remove(id) {
    return tx(['meta', 'data'], 'readwrite', t => {
      t.objectStore('meta').delete(id);
      t.objectStore('data').delete(id);
    });
  },
  async get(key) { return tx(['kv'], 'readonly', t => req(t.objectStore('kv').get(key))); },
  async set(key, value) { return tx(['kv'], 'readwrite', t => { t.objectStore('kv').put(value, key); }); },
  async del(key) { return tx(['kv'], 'readwrite', t => { t.objectStore('kv').delete(key); }); },
};

export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (_) {}
  return false;
}
