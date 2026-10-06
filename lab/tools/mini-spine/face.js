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

/* ================= 動きと 表情を いっしょに =================
   よくある動き（キャラ まるごと）を つけた とき、合う 表情が とって あれば キーも 入れる。
   [表情の 名前の こうほ…], 動きの 中の いつ（0〜1） */
const MOTION_FACE = {
  'びっくり':        [[['驚き'], .1], [['通常'], .8]],
  'よろこぶ':        [[['笑顔'], 0]],
  'にこっ':          [[['笑顔', '目とじ'], .1], [['通常'], .75]],
  'ぷんぷん':        [[['怒り'], 0]],
  'しょんぼり':      [[['泣き', '困り'], 0]],
  'いやいや':        [[['困り', '怒り'], 0]],
  'ねむい':          [[['ジト目', '目とじ'], 0]],
  'ノリノリ':        [[['笑顔'], 0]],
  'ぴょんと はねる': [[['笑顔'], 0]],
  '手を ふる':       [[['笑顔'], 0]],
  'ビートで キメ':   [[['通常'], 0], [['ウインク', '笑顔'], .5]],
  'うなずく':        [[['笑顔', '通常'], 0]],
  '首を かしげる':   [[['困り', '通常'], 0]]
};
const faceLinkOn = () => { try{ return localStorage.getItem('ms-face-link') !== 'off'; }catch(_){ return true; } };
const faceByName = list => { for(const n of list){ const f = FACES().find(x => x.name === n); if(f) return f; } return null; };

const _applyWholeF = applyWhole;
applyWhole = function(m){
  _applyWholeF(m);
  if(!faceLinkOn() || !FACES().length) return;
  const plan = MOTION_FACE[m.name]; if(!plan) return;
  const a = anim(); if(!a) return;
  const keys = [];
  plan.forEach(([names, at]) => { const f = faceByName(names); if(f) keys.push([+(at * a.dur).toFixed(3), f.id]); });
  if(!keys.length) return;
  // はじめが 0秒で ない ときは、通常（なければ 今の ふだん）から はじめる
  const base = faceByName(['通常']);
  if(keys[0][0] > 0 && base) keys.unshift([0, base.id]);
  a.faces = keys;
  const used = keys.map(k => FACES().find(f => f.id === k[1]).name);
  setStatus('「' + S.proj.current + '」を 作りました。表情も つけました（' + [...new Set(used)].join(' → ') + '）');
  refreshUI();
};
const _openMotionsF = openMotions;
openMotions = function(){
  _openMotionsF();
  if(!FACES().length) return;
  const g = document.querySelector('.sh-grid'); if(!g) return;
  const on = faceLinkOn();
  const row = btnRow(
    mkBtn('😊 表情も いっしょに つける', () => { try{ localStorage.setItem('ms-face-link', 'on'); }catch(_){} openMotions(); }, 'btn btn-sm' + (on ? ' btn-y' : '')),
    mkBtn('動きだけ', () => { try{ localStorage.setItem('ms-face-link', 'off'); }catch(_){} openMotions(); }, 'btn btn-sm' + (on ? '' : ' btn-y')));
  g.before(row);
};
$('#btnPreset').onclick = () => openMotions();

/* はやさを 変えたら（🎚）表情の キーも おなじ だけ のばす・ちぢめる */
if(typeof applyTune === 'function'){
  const _applyTuneF = applyTune;
  applyTune = function(a, amt, spd){
    const d0 = a.dur;
    _applyTuneF(a, amt, spd);
    if(a.faces && d0 && a.dur !== d0){ const k = a.dur / d0; a.faces.forEach(x => { x[0] = +(x[0] * k).toFixed(3); }); }
  };
}

/* ================= 時間で 切りかえ =================
   えらんだ 表情を、決めた 秒ごとに じゅんばんに くりかえす */
function openFaceTimer(){
  const seq = [];
  let iv = 1;
  sheet.show('⏱ 時間で 表情を 切りかえ', body => {
    const a = anim();
    body.appendChild(el('div', 'sh-note', '① 表情を じゅんばんに おす（同じ ものを 何回 おしても OK）'));
    const g = el('div', 'sh-grid');
    const line = el('div', 'face-seq');
    const info = el('div', 'sh-note');
    const redraw = () => {
      line.innerHTML = '';
      if(!seq.length) line.appendChild(el('span', 'face-seq-empty', 'まだ ありません'));
      seq.forEach((f, i) => { const c = mkBtn(faceIcon(f.name) + ' ' + f.name + ' ×', () => { seq.splice(i, 1); redraw(); }, 'btn btn-sm'); line.appendChild(c); });
      const round = seq.length * iv;
      info.textContent = seq.length ? '1まわり ' + round.toFixed(1) + '秒。アニメ「' + S.proj.current + '」（' + a.dur.toFixed(1) + '秒）の あいだ くりかえします。' : '';
    };
    FACES().forEach(f => { const b = mkBtn('', () => { seq.push(f); redraw(); }, 'mv'); b.append(el('i', null, faceIcon(f.name)), el('span', null, f.name)); g.appendChild(b); });
    body.append(g, line);
    body.appendChild(el('div', 'sh-note', '② 何秒ごとに 変える？'));
    const ivRow = el('div', 'face-chips');
    const ivIn = el('input'); ivIn.type = 'number'; ivIn.min = '0.1'; ivIn.step = '0.1'; ivIn.value = iv; ivIn.className = 'face-iv';
    ivIn.oninput = () => { const v = parseFloat(ivIn.value); if(v > 0){ iv = v; ivRow.querySelectorAll('.btn').forEach(x => x.classList.remove('btn-y')); redraw(); } };
    [0.5, 1, 1.5, 2, 3].forEach(v => { const b = mkBtn(v + '秒', () => { iv = v; ivIn.value = v; ivRow.querySelectorAll('.btn').forEach(x => x.classList.toggle('btn-y', x === b)); redraw(); }, 'btn btn-sm' + (v === iv ? ' btn-y' : '')); ivRow.appendChild(b); });
    ivRow.appendChild(ivIn); ivRow.appendChild(el('span', null, '秒'));
    body.append(ivRow, info);
    const fit = el('label', 'att-row'); const fc = el('input'); fc.type = 'checkbox';
    fit.append(fc, el('span', 'att-n', 'アニメの 長さを 1まわりに あわせる（ループが ぴったり つながる）'));
    body.appendChild(fit);
    body.appendChild(btnRow(mkBtn('この アニメに 入れる', () => {
      if(!seq.length) return setStatus('表情を 1つ 以上 おしてね');
      edit('表情を 時間で 切りかえ', () => {
        if(fc.checked) a.dur = +(seq.length * iv).toFixed(3);
        const ks = [];
        for(let t = 0, i = 0; t < a.dur - 1e-4; t += iv, i++) ks.push([+t.toFixed(3), seq[i % seq.length].id]);
        a.faces = ks;
      });
      sheet.hide(); S.mode = 'anim'; S.time = 0; S.playing = true; refreshUI();
      setStatus(iv + '秒ごとに ' + seq.map(f => f.name).join(' → ') + ' と 切りかわります');
    }, 'btn btn-y'), mkBtn('◀ もどる', openFaces, 'btn')));
    redraw();
  });
}
const _openFacesT = openFaces;
openFaces = function(){
  _openFacesT();
  if(FACES().length < 1) return;
  const g = document.querySelector('.sh-grid'); if(!g) return;
  g.after(btnRow(mkBtn('⏱ 時間で 切りかえ（何秒ごと）', openFaceTimer, 'btn')));
};
$('#btnFaces').onclick = () => openFaces();
