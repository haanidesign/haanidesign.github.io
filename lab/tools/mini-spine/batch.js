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
