/* ミニSpine — いくつかの 動きを まとめて アニメ工房・動画工房へ 送る
   それぞれ 2秒 以上に なるまで くり返して、順番に つなぐ。 */
'use strict';

const animNames = () => Object.keys(S.proj.anims).filter(n => !n.startsWith('__'));
const repsOf = dur => Math.max(1, Math.ceil(2 / Math.max(0.1, dur) - 1e-6));

/** 動きを 1つずつ 切りかえて こまを つくる */
async function renderEach(names, fn){
  const keep = S.proj.current, out = [];
  try{
    for(let i = 0; i < names.length; i++){
      busy('こまを つくっています… ' + (i + 1) + '/' + names.length + '「' + names[i] + '」');
      await nextPaint();
      S.proj.current = names[i]; S.springState = {};
      out.push(await fn(names[i]));
    }
  }finally{ S.proj.current = keep; S.springState = {}; }
  return out;
}

async function sendMany(names, to){
  if(!names.length) return setStatus('動きを えらんでね');
  sheet.hide();
  const title = (S.proj.name && S.proj.name !== 'untitled') ? S.proj.name : 'ミニSpine';
  try{
    if(to === 'kobo'){
      let W = 0, H = 0;
      const items = await renderEach(names, name => {
        const r = renderFrames(12, 1080); W = r.W; H = r.H;
        return { name, fps: r.fps, dur: r.dur, reps: repsOf(r.dur), frames: r.frames.map(c => c.toDataURL('image/png')) };
      });
      busy('アニメ工房へ 送っています…'); await nextPaint();
      await handoffPut('mini-spine', { at: Date.now(), name: title, w: W, h: H, bg: S.proj.canvas.bg, items });
      await saveNow();
      location.href = '../anime-kobo/?from=mini-spine';
    }else{
      let W = 0, H = 0;
      const items = await renderEach(names, async name => {
        const r = renderFrames(15, 1080); W = r.W; H = r.H;
        const blob = await makeApng(r.frames, r.fps);
        return { blob, fileName: baseName() + '_' + name + '.png', len: +(r.dur * repsOf(r.dur)).toFixed(3) };
      });
      busy('動画工房へ 送っています…'); await nextPaint();
      await handoffPut('mini-spine-video', { at: Date.now(), name: title, w: W, h: H, items });
      await saveNow();
      location.href = '../douga-kobo/?from=mini-spine';
    }
  }catch(err){
    busy('');
    alert('送れませんでした: ' + (err && err.message || err));
  }
}

function openSendMany(){
  sheet.show('まとめて 送る', body => {
    body.appendChild(el('div', 'sh-note', '送る 動きを えらんでね。上から 順に つながります（短い 動きは 2秒 以上に なるまで くり返し）。'));
    const pick = new Set([S.proj.current]);
    const list = el('div', 'many-list');
    animNames().forEach(n => {
      const lb = el('label', 'many-item');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = pick.has(n);
      cb.onchange = () => { cb.checked ? pick.add(n) : pick.delete(n); };
      lb.append(cb, el('span', null, n + '（' + S.proj.anims[n].dur.toFixed(1) + '秒）'));
      list.appendChild(lb);
    });
    body.appendChild(list);
    const go = to => sendMany(animNames().filter(n => pick.has(n)), to);
    body.appendChild(btnRow(mkBtn('🎬 アニメ工房へ', () => go('kobo'), 'btn btn-y'), mkBtn('📼 動画工房へ', () => go('douga'), 'btn btn-y')));
  });
}

const _openExportB = openExport;
openExport = function(){
  _openExportB();
  if(animNames().length < 2) return;
  const g = document.querySelector('.sh-grid.wide'); if(!g) return;
  const b = mkBtn('', openSendMany, 'mv wide');
  b.append(el('i', null, '📦'), el('span', null, 'まとめて 送る'), el('small', null, 'いくつかの 動きを えらんで、順番に つないで アニメ工房・動画工房へ。'));
  g.insertBefore(b, g.children[2] || null);
};

/* ---------- 送り先: 新しい 作品 か、工房に ある 作品の うしろ ----------
   べつの 作品で つくった 動きも、おなじ 工房の 作品に つぎつぎ 足せる。 */
const SEND_TO = { kobo: '', douga: '' };

/** 工房の 作品の ならび（読むだけ。なければ 空） */
async function koboDocs(dbName){
  try{
    if(indexedDB.databases){
      const all = await indexedDB.databases();
      if(!all.some(d => d.name === dbName)) return [];
    }
    const db = await new Promise((ok, ng) => {
      const r = indexedDB.open(dbName);
      r.onupgradeneeded = () => r.transaction.abort();   // ないのに 作らない
      r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
    });
    if(!db.objectStoreNames.contains('docs')){ db.close(); return []; }
    const all = await new Promise((ok, ng) => {
      const q = db.transaction('docs', 'readonly').objectStore('docs').getAll();
      q.onsuccess = () => ok(q.result || []); q.onerror = () => ng(q.error);
    });
    db.close();
    return all.map(r => ({ id: r.id, at: r.at || 0, name: (r.proj && r.proj.name) || (r.doc && r.doc.name) || r.name || 'むだい' }))
      .sort((a, b) => b.at - a.at);
  }catch(_){ return []; }
}

const _handoffPutB = handoffPut;
handoffPut = function(key, val){
  const to = key === 'mini-spine' ? SEND_TO.kobo : SEND_TO.douga;
  if(to) val = Object.assign({}, val, { appendTo: to });
  return _handoffPutB(key, val);
};

async function sendToRow(){
  const [ak, dk] = await Promise.all([koboDocs('anime-kobo'), koboDocs('douga-kobo')]);
  const box = el('div', 'send-to');
  box.appendChild(el('div', 'title', '送り先'));
  const sel = (label, list, k) => {
    if(list.length && SEND_TO[k] && !list.some(d => d.id === SEND_TO[k])) SEND_TO[k] = '';
    /* まえに「うしろに 足す」に して いたら、つぎも 足す ほうに して おく。
       先は いちばん 新しく いじった 作品（さっき 送った もの） */
    let mode = ''; try{ mode = localStorage.getItem('ms-send-' + k) || ''; }catch(_){}
    if(!SEND_TO[k] && mode === 'add' && list.length) SEND_TO[k] = list[0].id;
    const row = el('label', 'send-row'); row.appendChild(el('span', null, label));
    const s = el('select');
    const o0 = el('option', null, '新しい 作品に する（べつの 画面）'); o0.value = ''; s.appendChild(o0);
    list.forEach(d => { const o = el('option', null, '「' + d.name + '」の うしろに 足す'); o.value = d.id; s.appendChild(o); });
    s.value = SEND_TO[k];
    s.onchange = () => { SEND_TO[k] = s.value; try{ localStorage.setItem('ms-send-' + k, s.value ? 'add' : 'new'); }catch(_){} };
    if(SEND_TO[k]) s.classList.add('on');
    row.appendChild(s); box.appendChild(row);
  };
  sel('🎬 アニメ工房', ak, 'kobo');
  sel('📼 動画工房', dk, 'douga');
  return box;
}

const _openExportT = openExport;
openExport = function(){
  _openExportT();
  const g = document.querySelector('.sh-grid.wide'); if(!g) return;
  sendToRow().then(b => { if(g.isConnected) g.before(b); });
};
const _openSendManyT = openSendMany;
openSendMany = function(){
  _openSendManyT();
  const l = document.querySelector('.many-list'); if(!l) return;
  sendToRow().then(b => { if(l.isConnected) l.after(b); });
};

/* ---------- 動画の くり返し: 1ループだけ ／ 6秒ぶん ---------- */
function videoOneLoop(){ try{ return localStorage.getItem('ms-video-loops') !== 'many'; }catch(_){ return true; } }
const _openExportL = openExport;
openExport = function(){
  _openExportL();
  const g = document.querySelector('.sh-grid.wide'); if(!g) return;
  const row = el('div', 'send-to');
  row.appendChild(el('div', 'title', '動画の くり返し'));
  const one = mkBtn('1ループだけ', () => set(true), 'btn btn-sm'), many = mkBtn('6秒ぶん くり返す', () => set(false), 'btn btn-sm');
  const set = v => { try{ localStorage.setItem('ms-video-loops', v ? 'one' : 'many'); }catch(_){}
    one.classList.toggle('btn-y', v); many.classList.toggle('btn-y', !v); };
  set(videoOneLoop());
  row.appendChild(btnRow(one, many));
  g.after(row);
};

/* ---------- GIF で 保存（すける） ----------
   アニメPNG は Android の ギャラリーでは 止まって 見える ことが 多い。
   GIF なら どこでも 動く。つくり方は アニメ工房と おなじ（gif.js を かりる）。 */
async function saveGif(){
  if(!S.proj.slots.length) return setStatus('絵が ありません');
  sheet.hide();
  try{
    busy('こまを つくっています…'); await nextPaint();
    const { encodeGif } = await import('../anime-kobo/js/io/gif.js?v=326');
    const r = renderFrames(15, 720);
    const frames = r.frames.map(c => c.getContext('2d').getImageData(0, 0, c.width, c.height));
    busy('GIF に しています…'); await nextPaint();
    const out = encodeGif(frames, { delay: 1 / r.fps, alphaCut: 100 });
    const blob = out instanceof Blob ? out : new Blob([out], { type: 'image/gif' });
    download(baseName() + '.gif', blob);
    setStatus('すける GIF を 保存しました（' + Math.round(blob.size / 1024) + 'KB）');
  }catch(err){ alert('GIF に できませんでした: ' + (err && err.message || err)); }
  finally{ busy(''); }
}
const _openExportG = openExport;
openExport = function(){
  _openExportG();
  const g = document.querySelector('.sh-grid.wide'); if(!g) return;
  const b = mkBtn('', saveGif, 'mv wide');
  b.append(el('i', null, '🖼'), el('span', null, 'GIF で 保存（すける）'), el('small', null, 'どこでも 動く。色は 255色まで。'));
  g.appendChild(b);
};

/* ---------- 最初の 画面から：作品を えらんで まとめて 送る ----------
   作品ごとに 1つずつ ひらいて、いまの アニメを こまに して、順番に つなぐ。 */
async function waitImgs(){
  const t0 = performance.now();
  while(Object.values(S.imgs).some(im => !im.complete) && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 80));
  markDirty(); await nextPaint();
}
async function sendWorks(ids, to){
  if(!ids.length) return;
  hideStart();
  const keep = S.docId;
  if(S.proj.slots.length) await saveNow();
  const items = [];
  let W = 0, H = 0;
  try{
    for(let i = 0; i < ids.length; i++){
      const rec = await getWork(ids[i]); if(!rec || !rec.json) continue;
      busy('作品を ひらいています… ' + (i + 1) + '/' + ids.length + '「' + (rec.name || 'むだい') + '」');
      S.docId = rec.id; loadProject(rec.json); await waitImgs();
      S.springState = {};
      const name = (rec.name || 'むだい') + '・' + S.proj.current;
      busy('こまを つくっています… ' + (i + 1) + '/' + ids.length); await nextPaint();
      if(to === 'kobo'){
        const r = renderFrames(12, 1080); if(!W){ W = r.W; H = r.H; }
        items.push({ name, w: r.W, h: r.H, fps: r.fps, dur: r.dur, reps: repsOf(r.dur), frames: r.frames.map(c => c.toDataURL('image/png')) });
      }else{
        const r = renderFrames(15, 1080); if(!W){ W = r.W; H = r.H; }
        const blob = await makeApng(r.frames, r.fps);
        items.push({ blob, fileName: name.replace(/[\/:*?"<>|\s]/g, '_') + '.png', len: +(r.dur * repsOf(r.dur)).toFixed(3) });
      }
    }
    if(!items.length) throw new Error('送れる 作品が ありませんでした');
    busy((to === 'kobo' ? 'アニメ工房' : '動画工房') + 'へ 送っています…'); await nextPaint();
    if(to === 'kobo') await handoffPut('mini-spine', { at: Date.now(), name: 'ミニSpine まとめ', w: W, h: H, bg: S.proj.canvas.bg, items });
    else await handoffPut('mini-spine-video', { at: Date.now(), name: 'ミニSpine まとめ', w: W, h: H, items });
    try{ await saveDb('readwrite', st => st.put(keep || ids[0], 'cur')); }catch(_){}
    location.href = to === 'kobo' ? '../anime-kobo/?from=mini-spine' : '../douga-kobo/?from=mini-spine';
  }catch(err){
    busy('');
    alert('送れませんでした: ' + (err && err.message || err));
    if(keep){ const r0 = await getWork(keep); if(r0){ S.docId = keep; loadProject(r0.json); } }
  }
}

async function openSendWorks(){
  let list = [];
  try{ list = await listWorks(); }catch(_){}
  const card = el('div', 'card');
  card.appendChild(el('h1', null, 'まとめて 工房へ'));
  card.appendChild(el('p', 'sub', '送る 作品に チェック。上から 順に つながります（それぞれ いま えらんで いる アニメ。短い ものは 2秒 以上に なるまで くり返し）。'));
  const pick = [];
  const docs = el('div', 'docs');
  list.forEach(w => {
    const lb = el('label', 'docitem pickitem');
    const cb = el('input'); cb.type = 'checkbox';
    const no = el('b', 'pickno');
    const im = el('img'); im.alt = ''; if(w.thumb) im.src = w.thumb;
    const tx = el('span', 'doctext'); tx.append(el('b', null, w.name || 'むだい'), el('i', null, whenText(w.at)));
    const redo = () => docs.querySelectorAll('.pickno').forEach(n => { const i = pick.indexOf(n.dataset.id); n.textContent = i >= 0 ? (i + 1) : ''; });
    no.dataset.id = w.id;
    cb.onchange = () => { const i = pick.indexOf(w.id); if(cb.checked && i < 0) pick.push(w.id); if(!cb.checked && i >= 0) pick.splice(i, 1); redo(); };
    lb.append(cb, no, im, tx);
    docs.appendChild(lb);
  });
  card.appendChild(docs);
  card.appendChild(el('p', 'sub', 'チェックした 順が つながる 順です。'));
  const to = await sendToRow();
  card.appendChild(to);
  card.append(
    mkBtn('🎬 アニメ工房へ 送る', () => sendWorks(pick.slice(), 'kobo'), 'go btn-y'),
    mkBtn('📼 動画工房へ 送る', () => sendWorks(pick.slice(), 'douga'), 'go btn-y'),
    mkBtn('◀ もどる', () => openWorks(), 'btn btn-sm'));
  startEl.innerHTML = ''; startEl.appendChild(card); startEl.style.display = 'flex';
}

const _openWorksB = openWorks;
openWorks = async function(){
  await _openWorksB();
  const docs = startEl.querySelector('.docs'); if(!docs || docs.children.length < 2) return;
  const b = mkBtn('📦 えらんで まとめて 工房へ 送る', openSendWorks, 'btn');
  b.style.marginTop = '8px';
  docs.after(b);
};
{ const wb = $('#btnWorks'); if(wb) wb.onclick = () => openWorks(); }
