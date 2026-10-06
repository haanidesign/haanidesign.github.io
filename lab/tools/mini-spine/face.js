/* ミニSpine — 表情（じぶんで えらぶ）
   😊 表情 → その 表情で 見せる レイヤーを えらぶ → さいごに 何の 表情か えらぶ。
     S.proj.faces    = [{ id, name, show:[slotId…] }]
     S.proj.faceDef  = ふだんの 表情の id（セットアップで おした もの）
     a.faces         = [[秒, 表情id], …]（アニメートで おした もの）
   どれかの 表情で えらんだ レイヤー（顔パーツ）だけを 出したり かくしたり する。
   どの 表情でも えらんで いない レイヤー（体・髪 など）は さわらない。
   diff.js の paintParts から faceVis() が よばれる。 */
'use strict';

const FACES = () => (S.proj.faces = S.proj.faces || []);
const FACE_NAMES = ['通常', '笑顔', '驚き', '怒り', '泣き', '困り', '照れ', 'ウインク', 'ジト目', '目とじ'];
const faceIcon = n => ({ 通常:'🙂', 笑顔:'😄', 驚き:'😲', 怒り:'😠', 泣き:'😢', 困り:'😥', 照れ:'😳', ウインク:'😉', ジト目:'😑', 目とじ:'😌' })[n] || '🎭';

/* まえの 版（差分の 組で おぼえて いた もの）を 引っこす */
function faceMigrate(){
  FACES().forEach(f => { if(!f.show){ f.show = Object.values(f.pick || {}); delete f.pick; } });
}
let faceParts = () => { const u = new Set(); FACES().forEach(f => (f.show || []).forEach(id => u.add(id))); return u; };

/** その 時こくの 表情 */
function faceAt(a, t){
  const ks = a && a.faces;
  if(ks && ks.length && t !== null && t !== undefined){
    let cur = null;
    for(const [kt, id] of ks){ if(kt <= t + 1e-4) cur = id; else break; }
    if(cur) return FACES().find(f => f.id === cur) || null;
  }
  return FACES().find(f => f.id === S.proj.faceDef) || null;
}
/** 描く まえに 見える・見えないを きめる（keep に もとの 値を とって おく） */
function faceVis(a, t, keep){
  faceMigrate();
  const f = FACE_PREVIEW || faceAt(a, t);
  if(!f) return;
  const show = new Set(f.show);
  faceParts().forEach(id => {
    const sl = slotById(id); if(!sl) return;
    if(!keep.has(sl)) keep.set(sl, sl.visible);
    sl.visible = show.has(id);
  });
}
let FACE_PREVIEW = null;

function applyFace(f){
  const anim0 = S.mode === 'anim';
  edit('表情: ' + f.name, () => {
    if(anim0){
      const a = anim(); a.faces = a.faces || [];
      const t = +S.time.toFixed(3), i = a.faces.findIndex(k => Math.abs(k[0] - t) < 1e-3);
      if(i >= 0) a.faces[i][1] = f.id; else { a.faces.push([t, f.id]); a.faces.sort((x, y) => x[0] - y[0]); }
    } else S.proj.faceDef = f.id;
  });
  refreshUI();
  setStatus(anim0 ? S.time.toFixed(2) + '秒 から「' + f.name + '」' : 'ふだんの 表情を「' + f.name + '」に しました');
}

/* ---------- 😊 表情 ---------- */
function openFaces(){
  faceMigrate();
  sheet.show('😊 表情', body => {
    const anim0 = S.mode === 'anim';
    if(FACES().length){
      body.appendChild(el('div', 'sh-note', anim0
        ? 'おすと いまの 時間（' + S.time.toFixed(2) + '秒）から その 表情に なります。'
        : 'おすと ふだんの 表情に なります（アニメートで おすと、その 時間から 切りかわる）。'));
    }
    const g = el('div', 'sh-grid');
    FACES().forEach(f => {
      const b = mkBtn('', () => { sheet.hide(); applyFace(f); }, 'mv');
      b.append(el('i', null, faceIcon(f.name)), el('span', null, f.name));
      g.appendChild(b);
    });
    const add = mkBtn('', () => makeFace(), 'mv');
    add.append(el('i', null, '＋'), el('span', null, '表情を つくる'));
    g.appendChild(add);
    body.appendChild(g);

    const a = anim();
    if(anim0 && a && a.faces && a.faces.length){
      body.appendChild(el('div', 'sh-h', 'この アニメの 切りかえ'));
      a.faces.forEach((k, i) => {
        const f = FACES().find(x => x.id === k[1]);
        const row = el('div', 'diff-key');
        row.append(el('span', null, k[0].toFixed(2) + '秒 → ' + (f ? f.name : '?')),
          mkBtn('×', () => { edit('表情の キーを けす', () => a.faces.splice(i, 1)); openFaces(); }, 'btn mini'));
        body.appendChild(row);
      });
    }
    if(FACES().length){
      body.appendChild(el('div', 'sh-h', 'なおす・けす'));
      FACES().forEach(f => body.appendChild(btnRow(
        mkBtn('✎ ' + faceIcon(f.name) + ' ' + f.name, () => makeFace(f), 'btn btn-sm'),
        mkBtn('けす', () => {
          edit('表情を けす', () => {
            FACES().splice(FACES().indexOf(f), 1);
            if(S.proj.faceDef === f.id) S.proj.faceDef = null;
            for(const n in S.proj.anims){ const x = S.proj.anims[n]; if(x.faces) x.faces = x.faces.filter(k => k[1] !== f.id); }
          });
          openFaces();
        }, 'btn btn-sm danger'))));
    }
  });
}

/* ---------- つくる・なおす ----------
   ① 見せる レイヤーに チェック（画面は すぐ その 見た目に なる）
   ② さいごに 何の 表情か えらぶ */
function makeFace(f){
  const C = S.proj.canvas, big = C.w * C.h * 0.4;
  const pick = new Set(f ? f.show : []);
  const wasMode = S.mode;
  S.mode = 'setup'; S.playing = false;
  const preview = () => {
    // えらんだ ものは 出す、ほかの 表情で つかう 顔パーツは かくす（体などは そのまま）
    FACE_PREVIEW = { show: [...pick] };
    const parts = faceParts(); pick.forEach(id => parts.add(id));
    FACE_PREVIEW_PARTS = parts;
    try{ render(); }catch(_){}
  };
  const done = () => { FACE_PREVIEW = null; FACE_PREVIEW_PARTS = null; S.mode = wasMode; try{ render(); }catch(_){} };
  const step2 = () => sheet.show('② 何の 表情？', body => {
    body.appendChild(el('div', 'sh-note', 'えらんだ レイヤー ' + pick.size + 'まい。名前を えらんでね。'));
    const g = el('div', 'sh-grid');
    const save = name => {
      name = (name || '').trim(); if(!name) return;
      edit('表情: ' + name, () => {
        if(f){ f.name = name; f.show = [...pick]; }
        else FACES().push({ id: uid('face'), name, show: [...pick] });
      });
      done(); sheet.hide(); refreshUI();
      setStatus('表情「' + name + '」を とっておきました。😊 表情 から おすだけで 切りかわります');
    };
    FACE_NAMES.forEach(n => {
      const b = mkBtn('', () => save(n), 'mv' + (f && f.name === n ? ' on' : ''));
      b.append(el('i', null, faceIcon(n)), el('span', null, n));
      g.appendChild(b);
    });
    body.appendChild(g);
    const nm = el('input'); nm.type = 'text'; nm.className = 'face-name'; nm.placeholder = 'じぶんで 名前を つける';
    if(f && !FACE_NAMES.includes(f.name)) nm.value = f.name;
    body.appendChild(nm);
    body.appendChild(btnRow(mkBtn('この 名前で とっておく', () => save(nm.value), 'btn btn-y'), mkBtn('◀ もどる', step1, 'btn')));
  });
  const step1 = () => sheet.show(f ? '✎ ' + f.name + '：レイヤーを えらぶ' : '① この 表情で 見せる レイヤー', body => {
    body.appendChild(el('div', 'sh-note', 'この 表情の ときに 見せる 目・口・眉 などに チェック。画面は すぐ その 見た目に なります。'));
    const list = el('div', 'att-list');
    const bigList = el('div', 'att-list'); bigList.style.display = 'none';
    S.proj.slots.slice().reverse().forEach(o => {
      if(!o.verts.length) return;
      const b = slotBox(o), isBig = b.w * b.h >= big;
      const r = el('label', 'att-row'); const c = el('input'); c.type = 'checkbox'; c.checked = pick.has(o.id);
      c.onchange = () => { c.checked ? pick.add(o.id) : pick.delete(o.id); preview(); };
      r.append(c, el('span', 'att-n', '🖼 ' + o.name), el('small', null, o.psdHidden ? 'かくれ' : ''));
      (isBig ? bigList : list).appendChild(r);
    });
    body.appendChild(list);
    if(bigList.children.length){
      body.appendChild(btnRow(mkBtn('大きい 絵（体・髪 など）も 出す', ev => { bigList.style.display = ''; ev.target.remove(); }, 'btn btn-sm')));
      body.appendChild(bigList);
    }
    body.appendChild(btnRow(
      mkBtn('つぎへ ▶', () => { if(!pick.size) return setStatus('1まい 以上 えらんでね'); step2(); }, 'btn btn-y'),
      mkBtn('やめる', () => { done(); sheet.hide(); }, 'btn')));
    preview();
  });
  step1();
}
let FACE_PREVIEW_PARTS = null;
// プレビュー中は「いま えらんで いる ものも 顔パーツ」と して あつかう
const _facePartsBase = faceParts;
faceParts = function(){ const u = _facePartsBase(); if(FACE_PREVIEW_PARTS) FACE_PREVIEW_PARTS.forEach(id => u.add(id)); return u; };

/* ボタン：よくある動き の となり */
(() => {
  const b = el('button', 'btn btn-sm', '😊 表情'); b.id = 'btnFaces';
  b.title = '表情（驚き・笑顔 など）を つくって、おすだけで 切りかえる';
  b.onclick = openFaces;
  const p = $('#btnPreset'); if(p) p.after(b);
})();
