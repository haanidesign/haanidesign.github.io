/* 作品を 端末の 中（IndexedDB）に しまう。手が 止まる たびに しまう。 */

const DB = 'name-kobo', ST = 'kv';

function open() {
  return new Promise((ok, ng) => {
    if (!self.indexedDB) return ng(new Error('この端末では しまえません'));
    const guard = setTimeout(() => ng(new Error('しまう場所が ひらけません')), 6000);
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
    r.onsuccess = () => { clearTimeout(guard); ok(r.result); };
    r.onerror = () => { clearTimeout(guard); ng(r.error); };
  });
}
function run(mode, fn) {
  return open().then(db => new Promise((ok, ng) => {
    const tx = db.transaction(ST, mode);
    const req = fn(tx.objectStore(ST));
    tx.oncomplete = () => { db.close(); ok(req && req.result); };
    tx.onerror = () => { db.close(); ng(tx.error); };
  }));
}
export const loadProj = () => run('readonly', st => st.get('proj')).catch(() => null);
export const saveProj = p => run('readwrite', st => st.put(JSON.parse(JSON.stringify(p)), 'proj')).catch(() => { });

let t = 0;
export function autoSave(getProj) {
  clearTimeout(t);
  t = setTimeout(() => saveProj(getProj()), 600);
}
