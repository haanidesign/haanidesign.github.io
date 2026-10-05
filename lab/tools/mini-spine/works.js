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

async function openWorks(){
  await saveNow();
  let list = [];
  try{ list = await listWorks(); }catch(_){}
  sheet.show('🗂 作品（' + list.length + '）', body => {
    body.appendChild(btnRow(mkBtn('＋ 新しい 作品', () => newDoc(), 'btn btn-y')));
    if(list.length >= WORKS_MAX) body.appendChild(el('div', 'sh-note', 'たくさん しまって あります。いらない ものは けして ください。'));
    const g = el('div', 'works');
    list.forEach(w => {
      const card = el('div', 'work' + (w.id === S.docId ? ' cur' : ''));
      const th = el('div', 'work-th');
      if(w.thumb){ const im = el('img'); im.src = w.thumb; im.alt = ''; th.appendChild(im); }
      const info = el('div', 'work-i');
      info.append(el('b', null, w.name || 'むだい'), el('small', null, whenText(w.at) + (w.id === S.docId ? '・いま ひらいて いる' : '')));
      const acts = el('div', 'work-a');
      if(w.id !== S.docId) acts.appendChild(mkBtn('ひらく', () => openWork(w.id), 'btn btn-sm btn-y'));
      acts.appendChild(mkBtn('名前', async () => {
        const nm = prompt('作品の 名前', w.name || '');
        if(!nm || !nm.trim()) return;
        if(w.id === S.docId){ S.proj.name = nm.trim(); await saveNow(); }
        else { const rec = await getWork(w.id); if(rec){ rec.name = nm.trim(); const p = JSON.parse(rec.json); p.name = rec.name; rec.json = JSON.stringify(p); await saveDb('readwrite', st => st.put(rec, 'w:' + w.id)); } }
        openWorks();
      }, 'btn btn-sm'));
      acts.appendChild(mkBtn('けす', async () => {
        if(!confirm('「' + (w.name || 'むだい') + '」を けします。もとに もどせません。いいですか？')) return;
        await saveDb('readwrite', st => st.delete('w:' + w.id));
        if(w.id === S.docId){ S.docId = null; newDoc(); }
        openWorks();
      }, 'btn btn-sm danger'));
      card.append(th, info, acts);
      g.appendChild(card);
    });
    if(!list.length) g.appendChild(el('div', 'sh-note', 'まだ しまった 作品は ありません。絵を 入れると じどうで しまわれます。'));
    body.appendChild(g);
  });
}

/* ひらいた とき: 前の 1つだけ ほぞん（'last'）を 作品に 引っこす／いまの 作品を ひらく */
(async () => {
  try{
    const last = await saveDb('readonly', st => st.get('last'));
    if(last && last.json){
      // kobo.js が もう 'last' を ひらいて いる。作品 1つと して しまい直す
      S.docId = newDocId();
      await new Promise(r => setTimeout(r, 800));
      await saveNow();
      await saveDb('readwrite', st => st.delete('last'));
      return;
    }
    const cur = await saveDb('readonly', st => st.get('cur'));
    if(cur && !S.proj.slots.length){
      const rec = await getWork(cur);
      if(rec && rec.json){
        S.docId = rec.id;
        loadProject(rec.json);
        setTimeout(() => setStatus('「' + rec.name + '」の つづきを ひらきました'), 600);
      }
    }
  }catch(_){}
})();

/* ボタン: 上の バーの「🆕 新しく」を「🗂 作品」に */
(() => {
  const nb = $('#btnNew');
  const b = el('button', 'btn btn-sm', '🗂 作品'); b.id = 'btnWorks';
  b.title = 'しまった 作品の 一覧（新しく・ひらく・名前・けす）';
  b.onclick = openWorks;
  if(nb){ nb.replaceWith(b); } else $('.tb-actions').insertBefore(b, $('#btnAddImg'));
})();
