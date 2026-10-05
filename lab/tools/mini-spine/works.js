/* ミニSpine — 作品を いくつも しまう（アニメ工房と おなじ）
   端末の中（IndexedDB）に 作品ごとに 1件ずつ しまう。
     'w:作品id' … { id, at, name, thumb, json }
     'cur'      … いま ひらいて いる 作品の id
   まえの 1つだけの ほぞん（'last'）は、はじめて 開いた ときに 作品 1つに 引っこす。
   kobo.js の あとに 読む（saveNow・newDoc を 置きかえる）。 */
'use strict';

const WORKS_MAX = 30;
S.docId = null;
const newDocId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const workName = () => (S.proj.name && S.proj.name !== 'untitled') ? S.proj.name : 'むだい';

/** 小さな 見本（動かす まえの 形） */
function makeThumb(){
  try{
    const c = S.proj.canvas, s = 160 / Math.max(c.w, c.h);
    const t = document.createElement('canvas'); t.width = Math.round(c.w * s); t.height = Math.round(c.h * s);
    const g = t.getContext('2d');
    g.fillStyle = c.bg || '#fff'; g.fillRect(0, 0, t.width, t.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    const sp = setupPose();
    paintParts(g, sp, sp, 0, null, null);
    return t.toDataURL('image/jpeg', 0.7);
  }catch(_){ return null; }
}

saveNow = function(){
  clearTimeout(saveTimer);
  if(!S.proj.slots.length) return Promise.resolve();
  if(!S.docId) S.docId = newDocId();
  const rec = { id: S.docId, at: Date.now(), name: workName(), thumb: makeThumb(), json: snapshotWithImages() };
  return saveDb('readwrite', st => { st.put(rec, 'w:' + rec.id); st.put(rec.id, 'cur'); }).catch(() => {});
};

function listWorks(){
  return new Promise((ok, ng) => {
    const r = indexedDB.open(SAVE_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('doc');
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result, out = [];
      const q = db.transaction('doc', 'readonly').objectStore('doc').openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if(!c){ db.close(); out.sort((a, b) => b.at - a.at); return ok(out); }
        if(typeof c.key === 'string' && c.key.startsWith('w:')){ const v = c.value; out.push({ id:v.id, at:v.at, name:v.name, thumb:v.thumb }); }
        c.continue();
      };
      q.onerror = () => { db.close(); ng(q.error); };
    };
  });
}
const getWork = id => saveDb('readonly', st => st.get('w:' + id));

async function openWork(id){
  if(id === S.docId){ sheet.hide(); return; }
  await saveNow();
  const rec = await getWork(id);
  if(!rec || !rec.json) return setStatus('ひらけませんでした');
  S.docId = rec.id;
  loadProject(rec.json);
  saveDb('readwrite', st => st.put(rec.id, 'cur')).catch(() => {});
  sheet.hide();
  setTimeout(() => setStatus('「' + rec.name + '」を ひらきました'), 400);
}

/* 新しく ＝ いまの 作品を しまって から、まっさらな 作品を 1つ 足す（消さない） */
newDoc = async function(){
  await saveNow();
  S.proj = newProject(); S.imgs = {};
  S.docId = newDocId();
  S.sel = { bone: 'root', slot: null, ik: null };
  S.time = 0; S.springState = {}; S.playing = false;
  UNDO.stack = []; UNDO.idx = -1; UNDO.pending = null;
  $('#animSel').dataset.n = '';
  fitView(); refreshUI(); sheet.hide();
  setStatus('新しい 作品を はじめました（まえの 作品は 🗂 作品 に しまって あります）');
};

function whenText(at){
  const d = new Date(at), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? '今日 ' + d.toTimeString().slice(0, 5) : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toTimeString().slice(0, 5);
}

/* ================= 最初の 画面（アニメ工房と おなじ） =================
   ・つづきから … しまって ある 作品（見本・名前・いつ）。おすと ひらく。🗑 で けす
   ・あたらしく つくる … PSD / 画像から ／ からっぽで
   上の バーの「🗂 作品」でも この 画面に もどる。 */
const startEl = (() => { const d = el('div'); d.id = 'msStart'; document.body.appendChild(d); return d; })();
function hideStart(){ startEl.style.display = 'none'; }

async function openWorks(){
  if(S.proj.slots.length) await saveNow();
  let list = [];
  try{ list = await listWorks(); }catch(_){}
  const card = el('div', 'card');
  if(list.length){
    card.appendChild(el('h1', null, 'つづきから'));
    card.appendChild(el('p', 'sub', 'じどうで ほぞんされています。おすと つづきから はじまります。'));
    const docs = el('div', 'docs');
    list.forEach(w => {
      const item = el('div', 'docitem' + (w.id === S.docId ? ' cur' : ''));
      const ob = el('button', 'docopen');
      const im = el('img'); im.alt = ''; if(w.thumb) im.src = w.thumb; ob.appendChild(im);
      const tx = el('span', 'doctext');
      tx.append(el('b', null, w.name || 'むだい'), el('i', null, whenText(w.at) + (w.id === S.docId ? '・いま ひらいて いる' : '')));
      ob.appendChild(tx);
      ob.onclick = async () => { hideStart(); if(w.id !== S.docId) await openWork(w.id); };
      const db = el('button', 'docdel', '🗑'); db.title = 'この 作品を けす';
      db.onclick = async () => {
        if(!confirm('「' + (w.name || 'むだい') + '」を けしますか？')) return;
        await saveDb('readwrite', st => st.delete('w:' + w.id));
        if(w.id === S.docId){ S.docId = null; S.proj = newProject(); S.imgs = {}; refreshUI(); }
        openWorks();
      };
      item.append(ob, db);
      docs.appendChild(item);
    });
    card.appendChild(docs);
    if(list.length >= WORKS_MAX) card.appendChild(el('p', 'sub', '作品が たくさん あります。いらない ものは 🗑 で けしてね。'));
  }
  card.appendChild(el('h1', null, list.length ? 'あたらしく つくる' : 'ミニSpine'));
  card.appendChild(el('p', 'sub', 'パーツごとに レイヤーが 分かれた PSD か、PNG を 入れて はじめます。'));
  const go = mkBtn('🖼 PSD / 画像を えらんで はじめる', async () => { hideStart(); await newDoc(); $('#fileImg').click(); }, 'go btn-y');
  const empty = mkBtn('からっぽで はじめる', async () => { hideStart(); await newDoc(); }, 'btn');
  card.append(go, empty);
  if(S.proj.slots.length){
    const back = mkBtn('◀ いまの 作品に もどる', () => hideStart(), 'btn btn-sm');
    card.appendChild(back);
  }
  startEl.innerHTML = '';
  startEl.appendChild(card);
  startEl.style.display = 'flex';
}

/* ひらいた とき: まえの 1つだけ ほぞん（'last'）を 作品に 引っこしてから、最初の 画面 */
(async () => {
  try{
    const last = await saveDb('readonly', st => st.get('last'));
    if(last && last.json){
      // kobo.js が もう 'last' を ひらいて いる。作品 1つと して しまい直す
      S.docId = newDocId();
      await new Promise(r => setTimeout(r, 800));
      await saveNow();
      await saveDb('readwrite', st => st.delete('last'));
    }
    const list = await listWorks();
    if(list.length) openWorks();
  }catch(_){}
})();

/* ボタン: 上の バーの「🆕 新しく」を「🗂 作品」に */
(() => {
  const nb = $('#btnNew');
  const b = el('button', 'btn btn-sm', '🗂 作品'); b.id = 'btnWorks';
  b.title = '最初の 画面（作品の 一覧・新しく つくる）';
  b.onclick = openWorks;
  if(nb){ nb.replaceWith(b); } else $('.tb-actions').insertBefore(b, $('#btnAddImg'));
})();
