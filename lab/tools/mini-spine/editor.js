/* ミニSpine editor — Spine 準拠の操作系
   ツール: ポーズ/ウェイト/作成 + 回転/トランスレート/スケール/シアー
   座標系: ローカル/親/ワールド   コンペンセイト / Undo / IK / ドープシート編集 */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e; };

/* はぁにデザイン工房パレット */
const INK='#1E1C14', MAIN='#E1DD60', MAIN_DEEP='#B8B43F', MAIN_SOFT='#F2F0BE',
      CREAM='#FBFAEC', PAPER='#FFFEF7', GRAY='#8A8470', PINK='#F2A0B8';

const S = {
  proj: newProject(),
  imgs: {},
  view: { x:0, y:0, z:1 },
  mode: 'setup',          // setup | anim
  tool: 'pose',           // pose weight create rotate translate scale shear
  axis: 'local',          // local parent world
  compensate: false,
  meshEdit: false,
  show: { bones:true, images:true, mesh:false, ghost:false },
  sel: { bone:'root', slot:null, ik:null },
  time: 0,
  playing: false,
  spring: false,
  springState: {},
  live: false,
  brush: { r:60, amount:0.35 },
  meshRes: { cols:8, rows:10 },
  drag: null,
  selKeys: [],            // ドープシートで選択中のキー [{bone,ch,t}]
  expanded: {},           // ドープシートで展開中のボーン
  lastT: performance.now(),
  mic:null, micLevel:0,
  blink:{ next:2, closing:0 },
  rec:null
};

const cv = $('#cv'), ctx = cv.getContext('2d');
const dcv = $('#dopecv'), dctx = dcv.getContext('2d');

/* ================= 基本ヘルパ ================= */
const anim = () => S.proj.anims[S.proj.current];
const boneById = id => S.proj.bones.find(b => b.id === id);
const slotById = id => S.proj.slots.find(s => s.id === id);
const isTransformTool = t => t === 'rotate' || t === 'translate' || t === 'scale' || t === 'shear' || t === 'pose';

function s2w(sx, sy){ return { x:(sx - S.view.x)/S.view.z, y:(sy - S.view.y)/S.view.z }; }
function setStatus(t){ $('#status').textContent = t; }
function setupPose(){ return computePose(S.proj, null, 0); }
function rebindAll(){
  const sp = setupPose(), invs = invCache(sp);
  S.proj.slots.forEach(s => bindSlot(s, sp, invs));
}
const markDirty = rebindAll;

/* ================= Undo / Redo ================= */
const UNDO = { stack: [], idx: -1, limit: 40, pending: null };

function snapshot(){
  // 画像とバインド結果は除外（重い／再計算できる）
  return JSON.stringify(S.proj, (k, v) => (k === 'bind' || k === '_xy') ? undefined : v);
}

/** 操作の前に呼ぶ。label は履歴の説明 */
function beginEdit(label){
  if(UNDO.pending) return;                 // ドラッグ中の重複を防ぐ
  UNDO.pending = { label, before: snapshot() };
}

/** 操作の後に呼ぶ。変化が無ければ積まない */
function commitEdit(){
  const p = UNDO.pending; UNDO.pending = null;
  if(!p) return;
  const after = snapshot();
  if(after === p.before) return;
  UNDO.stack.length = UNDO.idx + 1;
  UNDO.stack.push({ label:p.label, before:p.before, after });
  if(UNDO.stack.length > UNDO.limit) UNDO.stack.shift();
  UNDO.idx = UNDO.stack.length - 1;
  refreshUndoUI();
}

/** 単発の操作（ドラッグを伴わないもの） */
function edit(label, fn){ beginEdit(label); fn(); commitEdit(); }

function restore(json){
  const keepImages = S.proj.images;
  S.proj = JSON.parse(json);
  S.proj.images = keepImages;
  if(!boneById(S.sel.bone)) S.sel.bone = S.proj.bones[0].id;
  if(S.sel.slot && !slotById(S.sel.slot)) S.sel.slot = null;
  S.springState = {};
  markDirty(); refreshUI();
}

function undo(){
  if(UNDO.idx < 0) return setStatus('これ以上戻せません');
  const e = UNDO.stack[UNDO.idx--];
  restore(e.before); refreshUndoUI();
  setStatus('元に戻した: ' + e.label);
}
function redo(){
  if(UNDO.idx >= UNDO.stack.length - 1) return setStatus('これ以上やり直せません');
  const e = UNDO.stack[++UNDO.idx];
  restore(e.after); refreshUndoUI();
  setStatus('やり直し: ' + e.label);
}
function refreshUndoUI(){
  $('#btnUndo').disabled = UNDO.idx < 0;
  $('#btnRedo').disabled = UNDO.idx >= UNDO.stack.length - 1;
  $('#btnUndo').title = UNDO.idx >= 0 ? '元に戻す: ' + UNDO.stack[UNDO.idx].label + ' (Ctrl+Z)' : '元に戻す (Ctrl+Z)';
}

/* ================= 画像読み込み ================= */
function addFiles(files){
  const all = [...files];
  const psd = all.filter(f => /\.psd$/i.test(f.name));
  const imgs = all.filter(f => /^image\//.test(f.type) && !/\.psd$/i.test(f.name));
  if(psd.length) importPsd(psd[0]);
  if(imgs.length) addImageFiles(imgs);
}

function addImageFiles(list){
  if(!list.length) return;
  beginEdit('画像を追加');
  let pending = list.length;
  list.forEach(f => {
    const rd = new FileReader();
    rd.onload = () => addImageSrc(f.name, rd.result, () => { if(--pending === 0){ markDirty(); refreshUI(); commitEdit(); } });
    rd.readAsDataURL(f);
  });
}

/* ================= PSD 読み込み =================
   レイヤーをそのままパーツにする。PSD内の位置をそのまま保つので、
   PNGを1枚ずつ並べ直す作業がまるごと要らない。
   グループはボーンになり、その中のレイヤーがぶら下がる。 */

/** 不透明部分の外接矩形。完全に透明なら null */
function contentBox(c){
  const g = c.getContext('2d', { willReadFrequently:true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for(let y=0; y<c.height; y++) for(let x=0; x<c.width; x++){
    if(d[(y*c.width+x)*4+3] > 8){
      if(x<x0) x0=x; if(x>x1) x1=x; if(y<y0) y0=y; if(y>y1) y1=y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** 透明な余白を切り落として left/top を詰め直す */
function trimLayer(l){
  const box = contentBox(l.canvas);
  if(!box) return null;
  const [x0,y0,x1,y1] = box, w = x1-x0+1, h = y1-y0+1;
  if(x0 === 0 && y0 === 0 && w === l.canvas.width && h === l.canvas.height){
    l.width = w; l.height = h; return l;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(l.canvas, x0, y0, w, h, 0, 0, w, h);
  l.canvas = c; l.left += x0; l.top += y0; l.width = w; l.height = h;
  return l;
}

/** ツリーを下→上（＝奥→手前）の順に平らにする。グループ名も持たせる */
function flattenPsd(node, out, groupPath){
  const kids = node.children || [];
  for(const ch of kids){
    if(ch.hidden) continue;
    if(ch.children) flattenPsd(ch, out, groupPath.concat(ch.name || 'group'));
    else if(ch.canvas) out.push({
      name: ch.name || 'layer',
      canvas: ch.canvas,
      left: ch.left || 0, top: ch.top || 0,
      opacity: ch.opacity === undefined ? 1 : ch.opacity,
      group: groupPath.length ? groupPath[groupPath.length-1] : null
    });
  }
}

/* グループが無いPSD向け。レイヤー名から仮の骨格を組む。
   上から順に判定するので、前髪・後ろ髪を「頭」より先に置いてある。 */
const RIG_RULES = [
  { bone:'後ろ髪', parent:'頭', spring:true,  test:/back.?hair|後ろ?髪|うしろ髪/i },
  { bone:'前髪',   parent:'頭', spring:true,  test:/front.?hair|前髪/i },
  { bone:'腕',     parent:null, spring:false, test:/\barms?\b|sleeve|hand|glove|腕|袖|手/i },
  /* ear は topwear に、iris は irides に引っかからないよう単語境界と綴り違いを見る */
  { bone:'頭',     parent:null, spring:false,
    test:/face|nose|\bears?\b|earwear|eye|brow|lash|irid|iris|pupil|mouth|cheek|hair|顔|鼻|耳|目|眉|口|睫|瞳|髪|頬/i }
];

function ruleFor(name){ return RIG_RULES.find(r => r.test.test(name || '')) || null; }

/** レイヤー群からボーンを起こして、各パーツをそのボーンに剛体で付ける */
function autoRig(layers, slotOf){
  const root = S.proj.bones[0];
  const groups = {};
  layers.forEach(l => {
    const r = ruleFor(l.name);
    if(r) (groups[r.bone] = groups[r.bone] || { rule:r, list:[] }).list.push(l);
  });
  if(!Object.keys(groups).length) return 0;

  const made = {};
  // 親になりうるものを先に作る
  const order = Object.keys(groups).sort((a,b) => {
    const pa = groups[a].rule.parent ? 1 : 0, pb = groups[b].rule.parent ? 1 : 0;
    return pa - pb;
  });

  for(const name of order){
    const { rule, list } = groups[name];
    const x0 = Math.min(...list.map(l => l.left));
    const x1 = Math.max(...list.map(l => l.left + l.width));
    const y0 = Math.min(...list.map(l => l.top));
    const y1 = Math.max(...list.map(l => l.top + l.height));
    const cx = (x0+x1)/2;
    // 頭と腕は下端から上へ、髪は上端から下へ伸ばす
    const downward = rule.spring;
    const oy = downward ? y0 : y1;
    const span = Math.max(30, (y1-y0) * 0.9);
    const parentId = (rule.parent && made[rule.parent]) || root.id;
    const pw = computePose(S.proj, null, 0)[parentId].world;
    const lo = M.apply(M.inv(pw), cx, oy);
    const worldRot = downward ? 90 : -90;

    /* 髪は2本のチェーンにする。1本だと付け根が頭と一緒に動くだけで、
       毛先が遅れて振られる動きが物理的に出ない。 */
    const links = rule.spring ? 2 : 1;
    const chain = [];
    let parent = parentId, first = true;
    for(let i = 0; i < links; i++){
      const b = {
        id: uid('b'), name: links > 1 ? name + (i+1) : name, parent,
        x: first ? lo.x : span/links, y: first ? lo.y : 0,
        rot: first ? worldRot - M.rotOf(pw) : 0,
        sx:1, sy:1, shear:0, len: span/links,
        spring: rule.spring,
        // 毛先ほどやわらかく
        stiff: rule.spring ? (i === 0 ? 0.16 : 0.09) : 0.35,
        damp:  rule.spring ? 0.88 : 0.72,
        grav:  rule.spring ? 0.06 : 0,
        inertia: 1
      };
      S.proj.bones.push(b);
      chain.push(b.id);
      parent = b.id; first = false;
    }
    made[name] = chain[0];

    if(links > 1){
      // チェーンに沿ってウェイトを配る（根元は動かず毛先がしなる）
      markDirty();
      const sp = setupPose();
      list.forEach(l => {
        const sl = slotOf.get(l); if(!sl) return;
        sl.bone = chain[0];
        autoWeights(S.proj, sl, sp, { maxBones:2, falloff:2, only: chain });
      });
      markDirty();
    } else {
      list.forEach(l => { const sl = slotOf.get(l); if(sl) sl.bone = chain[0]; });
    }
  }
  return S.proj.bones.length - 1;
}

/** レイヤー名からPNGTuber用の役割を推測 */
function guessRole(name){
  const n = (name || '').toLowerCase();
  if(/mouth.*open|open.*mouth|口.*開|開.*口|あ$/.test(n)) return 'mouthOpen';
  if(/mouth.*close|close.*mouth|口.*閉|閉.*口/.test(n)) return 'mouthClose';
  if(/eye.*close|close.*eye|目.*閉|閉.*目|まばたき|瞬き/.test(n)) return 'eyeClose';
  if(/eye.*open|open.*eye|目.*開|開.*目/.test(n)) return 'eyeOpen';
  return null;
}

async function importPsd(file){
  if(typeof agPsd === 'undefined') return alert('PSDの読み込みライブラリが見つかりません（lib/ag-psd.js）');
  setStatus('PSDを読み込み中… ' + file.name);
  let psd;
  try{
    psd = agPsd.readPsd(await file.arrayBuffer(), { skipCompositeImageData:true, skipThumbnail:true });
  }catch(err){
    setStatus('');
    return alert('PSDを読めませんでした: ' + err.message);
  }

  const flat = [];
  flattenPsd(psd, flat, []);
  const layers = flat.map(trimLayer).filter(Boolean);
  if(!layers.length){ setStatus(''); return alert('表示状態のレイヤーが見つかりませんでした'); }

  // ag-psd の children は PSD ファイルの記録順＝奥→手前。実測で確認済みなので並べ替え不要

  const replace = S.proj.slots.length === 0 ||
    confirm('PSDを読み込みます。\n\nOK = 今のリグを捨てて新しく作る\nキャンセル = 今のリグに追加する');

  beginEdit('PSDを読み込み');
  if(replace){
    S.proj.slots = [];
    S.proj.images = {}; S.imgs = {};
    S.proj.iks = [];
    S.proj.bones = S.proj.bones.slice(0, 1);
    for(const nm in S.proj.anims) S.proj.anims[nm].tracks = {};
    S.proj.canvas.w = psd.width; S.proj.canvas.h = psd.height;
    const root = S.proj.bones[0];
    root.x = psd.width/2; root.y = psd.height*0.92; root.rot = -90;
    root.len = Math.max(60, psd.height*0.1);
    S.proj.mouthOpen = S.proj.mouthClose = S.proj.eyeOpen = S.proj.eyeClose = null;
  }

  // グループごとにボーンを作る（そのグループの中身の中心に置く）
  const groupBone = {};
  if(replace){
    const groups = [...new Set(layers.map(l => l.group).filter(Boolean))];
    const root = S.proj.bones[0];
    groups.forEach(gname => {
      const gl = layers.filter(l => l.group === gname);
      const cx = gl.reduce((a,l) => a + l.left + l.width/2, 0) / gl.length;
      const cy = gl.reduce((a,l) => a + l.top + l.height/2, 0) / gl.length;
      const ri = M.inv(computePose(S.proj, null, 0)[root.id].world);
      const lo = M.apply(ri, cx, cy);
      const b = {
        id: uid('b'), name: gname, parent: root.id,
        x: lo.x, y: lo.y, rot: 0, sx:1, sy:1, shear:0,
        len: Math.max(40, psd.height*0.06),
        spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1
      };
      S.proj.bones.push(b);
      groupBone[gname] = b.id;
    });
  }

  const rootId = S.proj.bones[0].id;
  const slotOf = new Map();
  let roles = 0;
  layers.forEach(l => {
    const id = uid('img');
    const src = l.canvas.toDataURL('image/png');
    S.proj.images[id] = { id, name:l.name, src, w:l.width, h:l.height };
    const im = new Image(); im.src = src; S.imgs[id] = im;

    const slot = newSlot(id, { name:l.name });
    slot.name = l.name;
    slot.alpha = clamp(l.opacity, 0, 1);
    slot.bone = groupBone[l.group] || rootId;
    // PSD 内の位置をそのまま採用（等倍・平行移動だけ）
    const place = M.fromTRS(l.left, l.top, 0, 1, 1, 0);
    const m = buildGridMesh(l.canvas, S.meshRes.cols, S.meshRes.rows, place);
    slot.verts = m.verts; slot.tris = m.tris;
    S.proj.slots.push(slot);
    slotOf.set(l, slot);

    const role = guessRole(l.name);
    if(role && !S.proj[role]){ S.proj[role] = slot.id; roles++; }
  });

  // グループが無いPSDは、レイヤー名から仮の骨格を組む
  let rigged = Object.keys(groupBone).length;
  if(replace && !rigged) rigged = autoRig(layers, slotOf);

  /* パーツは既定で「そのボーンに丸ごと付く」剛体アタッチ。切り抜き素材ではこれが自然で、
     曲げたいところだけ後から自動ウェイト／ブラシで滑らかにすればいい */
  markDirty();

  S.sel = { bone:rootId, slot:S.proj.slots[0] ? S.proj.slots[0].id : null, ik:null };
  commitEdit();
  fitView(); refreshUI();
  setStatus(`PSD読み込み: ${layers.length}パーツ / ボーン${rigged}本`
    + (roles ? ` / 口・目を${roles}件 割り当て` : ''));
}


function addImageSrc(name, src, done){
  const img = new Image();
  img.onload = () => {
    const id = uid('img');
    S.proj.images[id] = { id, name, src, w:img.naturalWidth, h:img.naturalHeight };
    S.imgs[id] = img;
    const slot = newSlot(id, { name });
    slot.bone = S.sel.bone || S.proj.bones[0].id;
    const c = S.proj.canvas;
    const sc = Math.min(1, (c.h * 0.7) / img.naturalHeight);
    const place = M.fromTRS(c.w/2 - img.naturalWidth*sc/2, c.h/2 - img.naturalHeight*sc/2, 0, sc, sc, 0);
    const m = buildGridMesh(img, S.meshRes.cols, S.meshRes.rows, place);
    slot.verts = m.verts; slot.tris = m.tris;
    S.proj.slots.push(slot);
    S.sel.slot = slot.id;
    if(done) done();
  };
  img.onerror = () => done && done();
  img.src = src;
}

/* ================= メッシュ ================= */
function placeOf(slot){
  if(slot.verts.length < 3) return M.ident();
  const v = slot.verts, t = slot.tris, a = v[t[0]], b = v[t[1]], c = v[t[2]];
  const det = (b.u-a.u)*(c.v-a.v) - (c.u-a.u)*(b.v-a.v);
  if(!det) return M.ident();
  const m = {
    a: ((b.x-a.x)*(c.v-a.v) - (c.x-a.x)*(b.v-a.v))/det,
    b: ((b.y-a.y)*(c.v-a.v) - (c.y-a.y)*(b.v-a.v))/det,
    c: ((c.x-a.x)*(b.u-a.u) - (b.x-a.x)*(c.u-a.u))/det,
    d: ((c.y-a.y)*(b.u-a.u) - (b.y-a.y)*(c.u-a.u))/det,
    tx:0, ty:0
  };
  m.tx = a.x - (m.a*a.u + m.c*a.v);
  m.ty = a.y - (m.b*a.u + m.d*a.v);
  return m;
}

function remesh(slot, cols, rows){
  const img = S.imgs[slot.image]; if(!img) return;
  const keep = slot.verts.map(v => ({ u:v.u, v:v.v, w:v.w }));
  const m = buildGridMesh(img, cols, rows, placeOf(slot));
  // 近い旧頂点のウェイトを引き継ぐ
  for(const nv of m.verts){
    let best = null, bd = Infinity;
    for(const o of keep){ const d = (o.u-nv.u)**2 + (o.v-nv.v)**2; if(d < bd){ bd = d; best = o; } }
    if(best && best.w && best.w.length) nv.w = best.w.map(x => ({ b:x.b, w:x.w }));
  }
  slot.verts = m.verts; slot.tris = m.tris;
  markDirty();
}

/* ================= 描画 ================= */
function fitView(){
  const c = S.proj.canvas;
  const z = Math.min(cv.width / c.w, cv.height / c.h) * 0.88;
  S.view.z = z;
  S.view.x = (cv.width - c.w*z)/2;
  S.view.y = (cv.height - c.h*z)/2;
}

function resize(){
  const r = $('#view').getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width*dpr));
  cv.height = Math.max(1, Math.round(r.height*dpr));
  cv.style.width = r.width+'px'; cv.style.height = r.height+'px';
}

let _dotPat = null;
function dotPattern(){
  if(_dotPat === null){
    const t = document.createElement('canvas'); t.width = t.height = 14;
    const g = t.getContext('2d');
    g.fillStyle = 'rgba(30,28,20,.09)';
    g.beginPath(); g.arc(7,7,1.7,0,7); g.fill();
    _dotPat = ctx.createPattern(t, 'repeat') || false;
  }
  return _dotPat;
}

let curPose = null;

/** アニメ・IK・バネをすべて適用した最終ポーズ */
function evalPose(dt){
  const a = anim();
  const useAnim = (S.mode === 'anim' || S.live) ? a : null;
  const pose = computePose(S.proj, useAnim, S.time);
  applyIKs(S.proj, pose);
  applySprings(S.proj, pose, dt, S.springState, (S.spring && S.mode === 'anim') || S.live);
  return pose;
}

function render(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - S.lastT)/1000);
  S.lastT = now;

  const a = anim();
  if(S.playing && a){
    S.time += dt;
    if(S.time > a.dur){
      if(a.loop) S.time = S.time % a.dur;
      else { S.time = a.dur; S.playing = false; refreshPlayBtn(); }
    }
    if(!S.live) $('#curTime').value = S.time.toFixed(2);
  }

  const pose = evalPose(dt);
  curPose = pose;
  if(S.live) tickLive(dt);

  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.setTransform(S.view.z,0,0,S.view.z, S.view.x, S.view.y);

  const c = S.proj.canvas;
  if(!S.live){
    ctx.fillStyle = c.bg; ctx.fillRect(0,0,c.w,c.h);
    const pat = dotPattern();
    if(pat){ ctx.save(); ctx.fillStyle = pat; ctx.fillRect(0,0,c.w,c.h); ctx.restore(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3/S.view.z; ctx.strokeRect(0,0,c.w,c.h);
  }

  // セットアップポーズのゴースト
  if(!S.live && S.show.ghost && S.mode === 'anim'){
    const sp = setupPose();
    ctx.globalAlpha = 0.22;
    drawParts(sp);
    ctx.globalAlpha = 1;
  }

  if(S.show.images || S.live) drawParts(pose);

  if(S.live) return;

  const slot = slotById(S.sel.slot);
  if(S.tool === 'weight' && slot) drawWeights(slot);
  else if((S.show.mesh || S.meshEdit) && slot) drawMesh(slot);
  if(S.show.bones) drawBones(pose);
  drawGizmo(pose);

  drawDope();
}

function drawParts(pose){
  for(const slot of S.proj.slots){
    if(!slot.visible) continue;
    const img = S.imgs[slot.image]; if(!img) continue;
    const n = slot.verts.length;
    let buf = slot._xy;
    if(!buf || buf.length < n*2) buf = slot._xy = new Float32Array(n*2);
    deformSlot(slot, pose, buf);
    drawSlot(ctx, slot, img, buf);
  }
}

function drawBones(pose){
  const z = S.view.z;
  for(const b of S.proj.bones){
    const p = pose[b.id]; if(!p) continue;
    const o = { x:p.world.tx, y:p.world.ty };
    const e = M.apply(p.world, b.len, 0);
    const sel = b.id === S.sel.bone;
    const isIK = (S.proj.iks||[]).some(k => k.target === b.id);
    const fill = sel ? MAIN : isIK ? 'rgba(122,196,160,.8)' : b.spring ? 'rgba(242,160,184,.75)' : 'rgba(225,221,96,.5)';
    ctx.lineWidth = (sel ? 3.2 : 2.2)/z;
    ctx.strokeStyle = INK;
    const dx = e.x-o.x, dy = e.y-o.y, L = Math.hypot(dx,dy) || 1;
    const nx = -dy/L, ny = dx/L;
    const wRoot = Math.max(11/z, L*0.16), wTip = Math.max(4/z, L*0.05);
    ctx.beginPath();
    ctx.moveTo(o.x + nx*wRoot*0.5, o.y + ny*wRoot*0.5);
    ctx.lineTo(e.x + nx*wTip*0.5, e.y + ny*wTip*0.5);
    ctx.lineTo(e.x - nx*wTip*0.5, e.y - ny*wTip*0.5);
    ctx.lineTo(o.x - nx*wRoot*0.5, o.y - ny*wRoot*0.5);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x, o.y, 5/z, 0, 7);
    ctx.fillStyle = sel ? PAPER : MAIN_SOFT; ctx.fill(); ctx.stroke();
    if(sel) label(b.name, o.x + 9/z, o.y - 9/z, z);
  }
  // IKの結び
  ctx.setLineDash([6/z, 5/z]); ctx.lineWidth = 2/z; ctx.strokeStyle = 'rgba(30,28,20,.5)';
  for(const ik of (S.proj.iks||[])){
    const t = pose[ik.target], last = pose[ik.bones[ik.bones.length-1]];
    if(!t || !last) continue;
    const tip = M.apply(last.world, last.bone.len, 0);
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(t.world.tx, t.world.ty); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function label(text, x, y, z){
  ctx.font = '700 ' + (13/z) + 'px "M PLUS Rounded 1c", sans-serif';
  ctx.lineWidth = 4/z; ctx.strokeStyle = PAPER; ctx.strokeText(text, x, y);
  ctx.fillStyle = INK; ctx.fillText(text, x, y);
}

/** 選択ツールに応じたギズモ（本物のように、いま何ができるかを見せる） */
function drawGizmo(pose){
  if(!isTransformTool(S.tool) || S.tool === 'pose') return;
  const p = pose[S.sel.bone]; if(!p) return;
  const z = S.view.z, ox = p.world.tx, oy = p.world.ty;
  const R = 46/z;
  const ax = axisBasis(p);
  ctx.lineWidth = 2.4/z;

  if(S.tool === 'rotate'){
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(ox, oy, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = MAIN; ctx.lineWidth = 5/z;
    ctx.beginPath(); ctx.arc(ox, oy, R, -0.5, 0.5); ctx.stroke();
  } else if(S.tool === 'translate'){
    arrow(ox, oy, ax.x.x, ax.x.y, R, MAIN, z);
    arrow(ox, oy, ax.y.x, ax.y.y, R, PINK, z);
  } else if(S.tool === 'scale'){
    handle(ox + ax.x.x*R, oy + ax.x.y*R, MAIN, z);
    handle(ox + ax.y.x*R, oy + ax.y.y*R, PINK, z);
    ctx.strokeStyle = INK; ctx.beginPath();
    ctx.moveTo(ox + ax.x.x*R, oy + ax.x.y*R); ctx.lineTo(ox, oy);
    ctx.lineTo(ox + ax.y.x*R, oy + ax.y.y*R); ctx.stroke();
  } else if(S.tool === 'shear'){
    ctx.strokeStyle = MAIN_DEEP; ctx.setLineDash([5/z,4/z]);
    ctx.beginPath();
    ctx.moveTo(ox - ax.x.x*R, oy - ax.x.y*R); ctx.lineTo(ox + ax.x.x*R, oy + ax.x.y*R);
    ctx.stroke(); ctx.setLineDash([]);
    handle(ox + ax.x.x*R, oy + ax.x.y*R, MAIN, z);
  }
}

function arrow(ox, oy, dx, dy, R, col, z){
  ctx.strokeStyle = INK; ctx.lineWidth = 4.5/z;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx*R, oy + dy*R); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 2.4/z;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx*R, oy + dy*R); ctx.stroke();
  handle(ox + dx*R, oy + dy*R, col, z);
}
function handle(x, y, col, z){
  ctx.beginPath(); ctx.arc(x, y, 5.5/z, 0, 7);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.2/z; ctx.stroke();
}

function drawMesh(slot){
  const z = S.view.z, t = slot.tris, v = slot.verts;
  ctx.lineWidth = 1.2/z; ctx.strokeStyle = 'rgba(30,28,20,.38)';
  ctx.beginPath();
  for(let i=0;i<t.length;i+=3){
    const a=v[t[i]], b=v[t[i+1]], c=v[t[i+2]];
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.closePath();
  }
  ctx.stroke();
  if(!S.meshEdit) return;
  ctx.fillStyle = MAIN; ctx.strokeStyle = INK; ctx.lineWidth = 1/z;
  for(const p of v){ ctx.beginPath(); ctx.arc(p.x,p.y,2.8/z,0,7); ctx.fill(); ctx.stroke(); }
}

function drawWeights(slot){
  const z = S.view.z;
  drawMesh(slot);
  for(const v of slot.verts){
    const e = (v.w||[]).find(x => x.b === S.sel.bone);
    const w = e ? e.w : 0;
    ctx.fillStyle = w <= 0 ? 'rgba(30,28,20,.16)' : `hsla(${52 - w*52},85%,${62 - w*10}%,.95)`;
    ctx.beginPath(); ctx.arc(v.x, v.y, 3.4/z, 0, 7); ctx.fill();
  }
  if(S.mouseW){
    ctx.strokeStyle = PAPER; ctx.lineWidth = 4/z;
    ctx.beginPath(); ctx.arc(S.mouseW.x, S.mouseW.y, S.brush.r, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2/z; ctx.stroke();
  }
}

/* ================= 座標系 ================= */
/** 選択中の軸モードでの X/Y 基底（ワールド方向の単位ベクトル） */
function axisBasis(p){
  if(S.axis === 'world') return { x:{x:1,y:0}, y:{x:0,y:1} };
  const b = p.bone;
  const m = (S.axis === 'parent' && b.parent && curPose && curPose[b.parent])
    ? curPose[b.parent].world : p.world;
  const lx = Math.hypot(m.a, m.b) || 1, ly = Math.hypot(m.c, m.d) || 1;
  return { x:{ x:m.a/lx, y:m.b/lx }, y:{ x:m.c/ly, y:m.d/ly } };
}

/** ワールドの移動量を、そのボーンの「親ローカル」量へ変換 */
function worldDeltaToLocal(bone, wdx, wdy){
  const pw = (bone.parent && curPose[bone.parent]) ? curPose[bone.parent].world : M.ident();
  const i = M.inv(pw);
  return { x: i.a*wdx + i.c*wdy, y: i.b*wdx + i.d*wdy };
}

/* ================= 値の書き込み（セットアップ / アニメ 共通） ================= */
/** ボーンのチャンネルに絶対値を入れる。セットアップなら本体、アニメならキー */
function setBoneCh(bone, ch, absVal){
  if(S.mode === 'setup'){
    bone[ch] = absVal;
    markDirty();
  } else {
    const a = anim(); if(!a) return;
    const v = isScaleCh(ch) ? absVal : absVal - (bone[ch] || 0);
    setKey(a, bone.id, ch, S.time, v, $('#curveSel').value);
  }
}

/** コンペンセイト: 子ボーンとアタッチメント頂点のワールド位置を保って親だけ動かす */
function withCompensate(bone, fn){
  if(!S.compensate) return fn();
  const kids = childMap(S.proj)[bone.id] || [];
  const before = {};
  kids.forEach(id => { if(curPose[id]) before[id] = curPose[id].world; });
  // アタッチメント（このボーンだけに100%ぶら下がっている頂点）
  const attached = S.proj.slots.filter(s => s.bone === bone.id && !s.verts.some(v => v.w && v.w.length > 1));
  const vBefore = attached.map(s => s.verts.map(v => ({ x:v.x, y:v.y })));

  fn();

  const after = evalPose(0);
  kids.forEach(id => {
    const kb = boneById(id); if(!kb || !before[id]) return;
    const pw = after[kb.parent] ? after[kb.parent].world : M.ident();
    const want = M.mul(M.inv(pw), before[id]);
    const d = M.decompose(want);
    if(S.mode === 'setup'){
      kb.x = d.x; kb.y = d.y; kb.rot = d.rot; kb.sx = d.sx; kb.sy = d.sy; kb.shear = d.shear;
    } else {
      ['x','y','rot','sx','sy','shear'].forEach(ch => setBoneCh(kb, ch, d[ch]));
    }
  });
  if(S.mode === 'setup'){
    attached.forEach((s, i) => { s.verts.forEach((v, j) => { v.x = vBefore[i][j].x; v.y = vBefore[i][j].y; }); });
    markDirty();
  }
}

/* ================= マウス ================= */
function evPos(e){
  const r = cv.getBoundingClientRect();
  const dpr = cv.width / r.width;
  return { sx:(e.clientX - r.left)*dpr, sy:(e.clientY - r.top)*dpr };
}
cv.addEventListener('contextmenu', e => e.preventDefault());

cv.addEventListener('pointerdown', e => {
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);

  // 右／中ドラッグ = パン（本物と同じ）
  if(e.button === 1 || e.button === 2){
    S.drag = { type:'pan', sx, sy, vx:S.view.x, vy:S.view.y };
    return;
  }
  if(e.button !== 0) return;

  // ウェイトブラシ
  if(S.tool === 'weight'){
    const slot = slotById(S.sel.slot);
    if(!slot) return setStatus('先にツリーでパーツを選んでください');
    beginEdit('ウェイトを塗る');
    S.drag = { type:'paint', sub: e.altKey || e.shiftKey };
    paintAt(w, S.drag.sub);
    return;
  }

  // ボーン作成
  if(S.tool === 'create'){
    S.drag = { type:'newbone', ox:w.x, oy:w.y, x:w.x, y:w.y };
    return;
  }

  // メッシュ頂点編集
  if(S.meshEdit){
    const slot = slotById(S.sel.slot);
    if(slot){
      let best = -1, bd = 12/S.view.z;
      slot.verts.forEach((v,i) => { const d = Math.hypot(v.x-w.x, v.y-w.y); if(d < bd){ bd = d; best = i; } });
      if(best >= 0){ beginEdit('メッシュ頂点を移動'); S.drag = { type:'vert', slot, i:best }; return; }
    }
  }

  // クリックで選択（どのツールでも。本物どおり選択専用ツールは無い）
  const hb = pickBone(w);
  if(hb){
    if(hb.id !== S.sel.bone){ S.sel.bone = hb.id; refreshUI(); }
    if(isTransformTool(S.tool)){
      const p = curPose[hb.id];
      const nearRoot = Math.hypot(p.world.tx - w.x, p.world.ty - w.y) < 11/S.view.z;
      const type = S.tool === 'pose' ? (nearRoot ? 'translate' : 'rotate') : S.tool;
      beginEdit(({rotate:'ボーンを回転', translate:'ボーンを移動', scale:'ボーンをスケール', shear:'ボーンをシアー'})[type]);
      S.drag = { type:'xform', op:type, id:hb.id, w0:w, snap:snapBone(hb), pose0:curPose[hb.id] };
    }
    return;
  }

  const hs = pickSlot(w);
  if(hs){
    if(hs.id !== S.sel.slot){ S.sel.slot = hs.id; refreshUI(); }
    if(S.mode === 'setup' && isTransformTool(S.tool)){
      const op = S.tool === 'pose' ? 'translate' : S.tool;
      beginEdit('パーツを' + ({translate:'移動',rotate:'回転',scale:'スケール',shear:'シアー'})[op]);
      S.drag = { type:'slot', op, slot:hs, w0:w, verts:hs.verts.map(v => ({x:v.x, y:v.y})) };
    }
    return;
  }

  S.drag = { type:'pan', sx, sy, vx:S.view.x, vy:S.view.y };
});

window.addEventListener('pointermove', e => {
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  S.mouseW = w;
  const d = S.drag; if(!d) return;

  if(d.type === 'pan'){ S.view.x = d.vx + (sx-d.sx); S.view.y = d.vy + (sy-d.sy); return; }
  if(d.type === 'paint'){ paintAt(w, d.sub); return; }
  if(d.type === 'newbone'){ d.x = w.x; d.y = w.y; return; }
  if(d.type === 'vert'){ const v = d.slot.verts[d.i]; v.x = w.x; v.y = w.y; markDirty(); return; }
  if(d.type === 'xform'){ dragBone(d, w, e); return; }
  if(d.type === 'slot'){ dragSlot(d, w, e); return; }
});

window.addEventListener('pointerup', () => {
  const d = S.drag; S.drag = null;
  if(!d) return;
  if(d.type === 'newbone'){
    if(Math.hypot(d.x-d.ox, d.y-d.oy) > 6) createBone(d.ox, d.oy, d.x, d.y);
  } else {
    commitEdit();
  }
  if(d.type === 'vert' || d.type === 'slot') markDirty();
  refreshUI();
});

cv.addEventListener('wheel', e => {
  e.preventDefault();
  if(S.tool === 'weight' && !e.ctrlKey){
    S.brush.r = clamp(S.brush.r * (e.deltaY > 0 ? 1.12 : 0.9), 5, 2000);
    setStatus('ブラシ半径 ' + Math.round(S.brush.r));
    return;
  }
  const { sx, sy } = evPos(e);
  const before = s2w(sx, sy);
  S.view.z = clamp(S.view.z * (e.deltaY > 0 ? 0.9 : 1.11), 0.03, 20);
  const after = s2w(sx, sy);
  S.view.x += (after.x - before.x) * S.view.z;
  S.view.y += (after.y - before.y) * S.view.z;
}, { passive:false });

/* ---- タブレット: 2本指でパン＋ピンチズーム ----
   指1本は編集（骨を掴む・塗る）に使うので、視点移動は2本指に割り当てる。
   マウスの右／中ドラッグでのパンは今までどおり。 */
const _pts = new Map();
let _pinch = null;
const _mid  = () => { const a = [..._pts.values()]; return { x:(a[0].x+a[1].x)/2, y:(a[0].y+a[1].y)/2 }; };
const _dist = () => { const a = [..._pts.values()]; return Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y); };

cv.addEventListener('pointerdown', e => {
  if(e.pointerType === 'mouse') return;
  _pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(_pts.size === 2){
    S.drag = null;          // 1本目で始まりかけた編集は捨てる（誤爆防止）
    _pinch = null;          // 次の move で基準を取る
  }
});

cv.addEventListener('pointermove', e => {
  if(!_pts.has(e.pointerId)) return;
  _pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if(_pts.size < 2) return;
  e.preventDefault();

  const m = _mid(), d = _dist();
  if(_pinch){
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    // パン
    S.view.x += (m.x - _pinch.m.x) * dpr;
    S.view.y += (m.y - _pinch.m.y) * dpr;
    // 2本指の中点を固定したまま拡縮
    const sx = (m.x - r.left) * dpr, sy = (m.y - r.top) * dpr;
    const before = s2w(sx, sy);
    S.view.z = clamp(S.view.z * (d / (_pinch.d || d)), 0.03, 20);
    const after = s2w(sx, sy);
    S.view.x += (after.x - before.x) * S.view.z;
    S.view.y += (after.y - before.y) * S.view.z;
  }
  _pinch = { m, d };
}, { passive:false });

const _dropPt = e => {
  if(!_pts.delete(e.pointerId)) return;
  if(_pts.size < 2) _pinch = null;
};
cv.addEventListener('pointerup', _dropPt);
cv.addEventListener('pointercancel', _dropPt);
/* 指を画面から離す前にブラウザ側が追跡をやめた場合の取りこぼしを拾う */
window.addEventListener('pointercancel', () => { S.drag = null; });

function snapBone(b){ return { rot:b.rot, x:b.x, y:b.y, sx:b.sx, sy:b.sy, shear:b.shear||0 }; }

function dragBone(d, w, e){
  const b = boneById(d.id); if(!b) return;
  const p = curPose[b.id]; if(!p) return;
  const ox = p.world.tx, oy = p.world.ty;

  withCompensate(b, () => {
    if(d.op === 'rotate'){
      const want = Math.atan2(w.y-oy, w.x-ox)*180/Math.PI;
      let delta = want - M.rotOf(p.world);
      while(delta > 180) delta -= 360; while(delta < -180) delta += 360;
      let val = p.v.rot + delta;
      if(e.ctrlKey) val = Math.round(val/15)*15;      // Ctrlで15度スナップ
      setBoneCh(b, 'rot', val);

    } else if(d.op === 'translate'){
      let wdx = w.x - d.w0.x, wdy = w.y - d.w0.y;
      if(S.axis !== 'world' && e.shiftKey){            // Shiftで軸拘束
        const ax = axisBasis(p);
        const px = wdx*ax.x.x + wdy*ax.x.y, py = wdx*ax.y.x + wdy*ax.y.y;
        if(Math.abs(px) > Math.abs(py)){ wdx = ax.x.x*px; wdy = ax.x.y*px; }
        else { wdx = ax.y.x*py; wdy = ax.y.y*py; }
      }
      const loc = worldDeltaToLocal(b, wdx, wdy);
      setBoneCh(b, 'x', d.snap.x + loc.x);
      setBoneCh(b, 'y', d.snap.y + loc.y);

    } else if(d.op === 'scale'){
      const r0 = Math.hypot(d.w0.x-ox, d.w0.y-oy) || 1;
      const r1 = Math.hypot(w.x-ox, w.y-oy);
      const k = clamp(r1/r0, 0.05, 20);
      const ax = axisBasis(p);
      const wdx = w.x-ox, wdy = w.y-oy;
      const onX = Math.abs(wdx*ax.x.x + wdy*ax.x.y) >= Math.abs(wdx*ax.y.x + wdy*ax.y.y);
      if(e.shiftKey || S.tool === 'pose'){ setBoneCh(b,'sx',d.snap.sx*k); setBoneCh(b,'sy',d.snap.sy*k); }
      else if(onX) setBoneCh(b, 'sx', d.snap.sx*k);
      else setBoneCh(b, 'sy', d.snap.sy*k);

    } else if(d.op === 'shear'){
      const a0 = Math.atan2(d.w0.y-oy, d.w0.x-ox), a1 = Math.atan2(w.y-oy, w.x-ox);
      let deg = (a1-a0)*180/Math.PI;
      while(deg > 180) deg -= 360; while(deg < -180) deg += 360;
      setBoneCh(b, 'shear', clamp(d.snap.shear + deg, -80, 80));
    }
  });
}

function dragSlot(d, w, e){
  const vs = d.verts;
  const cx = vs.reduce((a,v) => a+v.x, 0)/vs.length;
  const cy = vs.reduce((a,v) => a+v.y, 0)/vs.length;
  let m;
  if(d.op === 'translate'){
    m = M.fromTRS(w.x-d.w0.x, w.y-d.w0.y, 0, 1, 1, 0);
  } else if(d.op === 'rotate'){
    const a0 = Math.atan2(d.w0.y-cy, d.w0.x-cx), a1 = Math.atan2(w.y-cy, w.x-cx);
    let deg = (a1-a0)*180/Math.PI;
    if(e.ctrlKey) deg = Math.round(deg/15)*15;
    m = M.mul(M.fromTRS(cx,cy,deg,1,1,0), M.fromTRS(-cx,-cy,0,1,1,0));
  } else if(d.op === 'scale'){
    const r0 = Math.hypot(d.w0.x-cx, d.w0.y-cy) || 1;
    const k = clamp(Math.hypot(w.x-cx, w.y-cy)/r0, 0.05, 20);
    m = M.mul(M.fromTRS(cx,cy,0,k,k,0), M.fromTRS(-cx,-cy,0,1,1,0));
  } else {
    const deg = clamp((w.x-d.w0.x)*0.15, -80, 80);
    m = M.mul(M.fromTRS(cx,cy,0,1,1,deg), M.fromTRS(-cx,-cy,0,1,1,0));
  }
  d.slot.verts.forEach((v,i) => { const p = M.apply(m, vs[i].x, vs[i].y); v.x = p.x; v.y = p.y; });
  markDirty();
}

function pickBone(w){
  let best = null, bd = 14/S.view.z;
  for(const b of S.proj.bones){
    const p = curPose && curPose[b.id]; if(!p) continue;
    const e = M.apply(p.world, b.len, 0);
    const d = distToSeg(w.x, w.y, p.world.tx, p.world.ty, e.x, e.y);
    if(d < bd){ bd = d; best = b; }
  }
  return best;
}

function pickSlot(w){
  for(let i = S.proj.slots.length-1; i >= 0; i--){
    const s = S.proj.slots[i];
    if(!s.visible) continue;
    const xy = s._xy, t = s.tris; if(!xy) continue;
    for(let k=0;k<t.length;k+=3){
      if(ptInTri(w.x,w.y, xy[t[k]*2],xy[t[k]*2+1], xy[t[k+1]*2],xy[t[k+1]*2+1], xy[t[k+2]*2],xy[t[k+2]*2+1])) return s;
    }
  }
  return null;
}

function ptInTri(px,py, ax,ay, bx,by, cx,cy){
  const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);
  const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);
  const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);
  return !(((d1<0)||(d2<0)||(d3<0)) && ((d1>0)||(d2>0)||(d3>0)));
}

function paintAt(w, sub){
  const slot = slotById(S.sel.slot); if(!slot) return;
  paintWeight(slot, S.sel.bone, w.x, w.y, S.brush.r, (sub ? -1 : 1) * S.brush.amount);
  markDirty();
}

/* ================= ボーン操作 ================= */
function createBone(ox, oy, ex, ey){
  edit('ボーンを作成', () => {
    const parent = boneById(S.sel.bone) || S.proj.bones[0];
    const pi = M.inv(curPose[parent.id] ? curPose[parent.id].world : M.ident());
    const lo = M.apply(pi, ox, oy), le = M.apply(pi, ex, ey);
    const b = {
      id: uid('b'), name: 'bone' + S.proj.bones.length, parent: parent.id,
      x: lo.x, y: lo.y,
      rot: Math.atan2(le.y-lo.y, le.x-lo.x)*180/Math.PI,
      sx:1, sy:1, shear:0, len: Math.hypot(le.x-lo.x, le.y-lo.y),
      spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1
    };
    S.proj.bones.push(b);
    S.sel.bone = b.id;
    markDirty();
  });
  setStatus('ボーンを作成しました。続けてドラッグすると子ボーンが作れます');
  refreshUI();
}

function deleteBone(id){
  const b = boneById(id);
  if(!b || !b.parent) return alert('ルートボーンは削除できません');
  if(!confirm(b.name + ' を削除します。子ボーンは親に付け替えます。')) return;
  edit('ボーンを削除', () => {
    (childMap(S.proj)[id] || []).forEach(k => { const c = boneById(k); if(c) c.parent = b.parent; });
    S.proj.bones = S.proj.bones.filter(x => x.id !== id);
    S.proj.slots.forEach(s => {
      if(s.bone === id) s.bone = b.parent;
      s.verts.forEach(v => { if(v.w) v.w = v.w.filter(x => x.b !== id); });
    });
    S.proj.iks = (S.proj.iks||[]).filter(k => k.target !== id && !k.bones.includes(id));
    for(const nm in S.proj.anims) delete S.proj.anims[nm].tracks[id];
    S.sel.bone = b.parent;
    markDirty();
  });
  refreshUI();
}

function isDescendant(id, ofId){
  let cur = boneById(id);
  while(cur && cur.parent){ if(cur.parent === ofId) return true; cur = boneById(cur.parent); }
  return false;
}

/* ================= UI ================= */
function refreshUI(){
  buildTree(); buildOrder(); buildProps(); buildAnimBar();
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  $$('.axis').forEach(b => b.classList.toggle('on', b.dataset.axis === S.axis));
  $$('.vt').forEach(b => b.classList.toggle('on', !!S.show[b.dataset.show]));
  $('#mSetup').classList.toggle('on', S.mode === 'setup');
  $('#mAnim').classList.toggle('on', S.mode === 'anim');
  $('#btnComp').classList.toggle('on', S.compensate);
  $('#btnSpring').classList.toggle('on', S.spring);
  $('#btnMesh').classList.toggle('on', S.meshEdit);
  refreshPlayBtn(); refreshUndoUI();
}
function refreshPlayBtn(){ $('#btnPlay').textContent = S.playing ? '⏸' : '▶'; }

/* ---- 単一ツリー: ボーン階層の下にアタッチされたパーツを並べる ---- */
function buildTree(){
  const host = $('#treeBody'); host.innerHTML = '';
  const kids = childMap(S.proj);
  const slotsOf = {};
  S.proj.slots.forEach(s => (slotsOf[s.bone] = slotsOf[s.bone] || []).push(s));

  const walk = (id, depth) => {
    const b = boneById(id); if(!b) return;
    const it = el('div', 'item' + (id === S.sel.bone && !S.sel.slot ? ' sel' : ''));
    it.style.paddingLeft = (6 + depth*11) + 'px';
    it.appendChild(el('span', 'ic', '🦴'));
    it.appendChild(el('span', 'nm', b.name));
    if(b.spring) it.appendChild(el('span', 'badge', '揺'));
    if((S.proj.iks||[]).some(k => k.bones.includes(id))) it.appendChild(el('span', 'badge ik', 'IK'));
    it.onclick = () => { S.sel.bone = id; S.sel.slot = null; refreshUI(); };
    it.ondblclick = () => { const n = prompt('ボーン名', b.name); if(n) edit('名前を変更', () => b.name = n), refreshUI(); };
    // パーツをここへドロップして付け替え
    it.ondragover = ev => { ev.preventDefault(); it.classList.add('drop'); };
    it.ondragleave = () => it.classList.remove('drop');
    it.ondrop = ev => {
      ev.preventDefault(); it.classList.remove('drop');
      const sid = ev.dataTransfer.getData('slot');
      const s = slotById(sid);
      if(s) edit('アタッチ先を変更', () => { s.bone = id; markDirty(); }), refreshUI();
    };
    host.appendChild(it);

    (slotsOf[id] || []).forEach(s => {
      const si = el('div', 'item slot' + (s.id === S.sel.slot ? ' sel' : ''));
      si.style.paddingLeft = (6 + (depth+1)*11) + 'px';
      si.draggable = true;
      si.ondragstart = ev => ev.dataTransfer.setData('slot', s.id);
      const eye = el('span', 'eye' + (s.visible ? ' on' : ''), s.visible ? '●' : '○');
      eye.onclick = ev => { ev.stopPropagation(); s.visible = !s.visible; refreshUI(); };
      si.appendChild(eye);
      si.appendChild(el('span', 'nm', s.name));
      si.appendChild(el('span', 'tag', s.verts.length + 'v'));
      si.onclick = () => { S.sel.slot = s.id; refreshUI(); };
      si.ondblclick = () => { const n = prompt('パーツ名', s.name); if(n) edit('名前を変更', () => s.name = n), refreshUI(); };
      host.appendChild(si);
    });

    (kids[id] || []).forEach(k => walk(k, depth+1));
  };
  S.proj.bones.filter(b => !b.parent).forEach(b => walk(b.id, 0));

  (S.proj.iks || []).forEach(ik => {
    const it = el('div', 'item' + (ik.id === S.sel.ik ? ' sel' : ''));
    it.appendChild(el('span', 'ic', '🎯'));
    it.appendChild(el('span', 'nm', ik.name));
    it.appendChild(el('span', 'badge ik', 'IK'));
    it.onclick = () => { S.sel.ik = ik.id; S.sel.slot = null; refreshUI(); };
    host.appendChild(it);
  });

  if(!S.proj.slots.length) host.appendChild(el('div', 'hint', 'PNGをビューポートにドロップ。\nパーツごとに分けた透過PNGを推奨。'));
}

/* ---- 描画順（本物のスロット順） ---- */
function buildOrder(){
  const host = $('#orderBody'); host.innerHTML = '';
  S.proj.slots.forEach((s, i) => {
    const it = el('div', 'item tiny' + (s.id === S.sel.slot ? ' sel' : ''));
    it.appendChild(el('span', 'nm', s.name));
    const up = el('button', 'mini', '▲'), dn = el('button', 'mini', '▼');
    up.onclick = ev => { ev.stopPropagation(); moveSlot(s, 1); };
    dn.onclick = ev => { ev.stopPropagation(); moveSlot(s, -1); };
    it.appendChild(dn); it.appendChild(up);
    it.onclick = () => { S.sel.slot = s.id; refreshUI(); };
    host.appendChild(it);
  });
}
function moveSlot(slot, dir){
  const i = S.proj.slots.indexOf(slot), j = i + dir;
  if(j < 0 || j >= S.proj.slots.length) return;
  edit('描画順を変更', () => { S.proj.slots.splice(i,1); S.proj.slots.splice(j,0,slot); });
  refreshUI();
}

/* ---- プロパティ部品 ---- */
function num(label, get, set, step){
  const r = el('div','row');
  r.appendChild(el('label', null, label));
  const i = el('input'); i.type='number'; i.step = step ?? 1; i.value = (+get()).toFixed(2);
  i.onchange = () => { edit(label + 'を変更', () => set(parseFloat(i.value)||0)); refreshUI(); };
  r.appendChild(i); return r;
}
function chk(label, get, set){
  const r = el('div','row');
  const i = el('input'); i.type='checkbox'; i.checked = !!get();
  i.onchange = () => { edit(label, () => set(i.checked)); refreshUI(); };
  const l = el('label'); l.style.flex='1'; l.textContent = label;
  r.appendChild(i); r.appendChild(l); return r;
}
function rng(label, get, set, min, max, step){
  const r = el('div','row');
  r.appendChild(el('label', null, label));
  const i = el('input'); i.type='range'; i.min=min; i.max=max; i.step=step; i.value=get();
  const t = el('span', 'val', (+get()).toFixed(2));
  i.onpointerdown = () => beginEdit(label + 'を変更');
  i.oninput = () => { set(parseFloat(i.value)); t.textContent = parseFloat(i.value).toFixed(2); };
  i.onchange = () => commitEdit();
  r.appendChild(i); r.appendChild(t); return r;
}
function mkBtn(txt, fn, cls){ const b = el('button', cls, txt); b.onclick = fn; return b; }
function btnRow(...bs){ const r = el('div','row'); bs.forEach(b => { b.style.flex='1'; r.appendChild(b); }); return r; }

function buildProps(){
  const host = $('#props'); host.innerHTML = '';
  const b = boneById(S.sel.bone);
  const slot = slotById(S.sel.slot);

  if(b){
    host.appendChild(el('div','title','ボーン: ' + b.name));
    const p = curPose && curPose[b.id];
    const cur = ch => S.mode === 'setup' ? (b[ch] ?? CH_DEFAULT[ch]) : (p ? p.v[ch] : CH_DEFAULT[ch]);
    if(S.mode === 'anim') host.appendChild(el('div','hint','数値を変えると現在時間に\nキーが入ります'));
    CH.forEach(ch => host.appendChild(
      num(CH_LABEL[ch], () => cur(ch), v => setBoneCh(b, ch, v), isScaleCh(ch) ? 0.05 : 1)));
    if(S.mode === 'setup'){
      host.appendChild(num('長さ', () => b.len, v => b.len = Math.max(4, v)));
      const pr = el('div','row'); pr.appendChild(el('label', null, '親'));
      if(b.parent){
        const sel = el('select');
        S.proj.bones.forEach(o => {
          if(o.id === b.id || isDescendant(o.id, b.id)) return;
          const op = el('option', null, o.name); op.value = o.id;
          if(o.id === b.parent) op.selected = true;
          sel.appendChild(op);
        });
        sel.onchange = () => { edit('親を変更', () => { b.parent = sel.value; markDirty(); }); refreshUI(); };
        pr.appendChild(sel);
      } else pr.appendChild(el('span', 'val', '—'));
      host.appendChild(pr);
      host.appendChild(btnRow(mkBtn('ボーン削除', () => deleteBone(b.id), 'danger')));
    } else {
      host.appendChild(btnRow(
        mkBtn('このボーンをリセット', () => {
          edit('ポーズをリセット', () => { const a = anim(); if(a) delete a.tracks[b.id]; });
          refreshUI();
        })));
    }

    host.appendChild(el('div','title','揺れ（バネ物理）'));
    host.appendChild(chk('このボーンを揺らす', () => b.spring, v => { b.spring = v; S.springState = {}; }));
    if(b.spring){
      host.appendChild(rng('硬さ', () => b.stiff, v => b.stiff = v, 0.02, 1, 0.01));
      host.appendChild(rng('減衰', () => b.damp, v => b.damp = v, 0.3, 0.99, 0.01));
      host.appendChild(rng('重力', () => b.grav, v => b.grav = v, -1, 1, 0.02));
      host.appendChild(rng('慣性', () => b.inertia, v => b.inertia = v, 0.2, 1.6, 0.05));
      host.appendChild(btnRow(mkBtn('子ボーンにも同設定', () => {
        edit('揺れ設定を子へ', () => {
          const kids = childMap(S.proj), stack = [...(kids[b.id]||[])];
          while(stack.length){
            const id = stack.pop(), c = boneById(id); if(!c) continue;
            c.spring = true; c.stiff = b.stiff; c.damp = b.damp; c.grav = b.grav; c.inertia = b.inertia;
            (kids[id]||[]).forEach(k => stack.push(k));
          }
          S.springState = {};
        });
        refreshUI();
      })));
    }

    host.appendChild(el('div','title','IK制約'));
    host.appendChild(el('div','hint','ターゲットを動かすと、指定した\n1〜2本のボーンが自動で曲がる。\n腕・脚・指先の操作が一気に楽になる。'));
    host.appendChild(btnRow(mkBtn('このボーンからIKを作る', () => makeIK(b))));
    (S.proj.iks||[]).filter(k => k.bones.includes(b.id) || k.target === b.id).forEach(ik => {
      host.appendChild(el('div','sub', ik.name));
      host.appendChild(rng('効き具合', () => ik.mix, v => ik.mix = v, 0, 1, 0.05));
      host.appendChild(chk('曲がる向きを反転', () => !ik.bendPositive, v => ik.bendPositive = !v));
      host.appendChild(btnRow(mkBtn('IKを削除', () => {
        edit('IKを削除', () => S.proj.iks = S.proj.iks.filter(x => x !== ik)); refreshUI();
      }, 'danger')));
    });
  }

  if(slot){
    host.appendChild(el('div','title','パーツ: ' + slot.name));
    const ar = el('div','row'); ar.appendChild(el('label', null, 'アタッチ先'));
    const asel = el('select');
    S.proj.bones.forEach(o => {
      const op = el('option', null, o.name); op.value = o.id;
      if(o.id === slot.bone) op.selected = true;
      asel.appendChild(op);
    });
    asel.onchange = () => { edit('アタッチ先を変更', () => { slot.bone = asel.value; markDirty(); }); refreshUI(); };
    ar.appendChild(asel); host.appendChild(ar);

    host.appendChild(rng('不透明度', () => slot.alpha, v => slot.alpha = v, 0, 1, 0.05));

    const mr = el('div','row'); mr.appendChild(el('label', null, 'メッシュ分割'));
    const ci = el('input'); ci.type='number'; ci.value = S.meshRes.cols; ci.min=1; ci.max=40;
    const ri = el('input'); ri.type='number'; ri.value = S.meshRes.rows; ri.min=1; ri.max=40;
    ci.onchange = ri.onchange = () => {
      S.meshRes.cols = clamp(+ci.value|0,1,40); S.meshRes.rows = clamp(+ri.value|0,1,40);
    };
    mr.appendChild(ci); mr.appendChild(ri); host.appendChild(mr);
    host.appendChild(btnRow(mkBtn('メッシュ再生成', () => {
      edit('メッシュを再生成', () => remesh(slot, S.meshRes.cols, S.meshRes.rows)); refreshUI();
    })));
    host.appendChild(btnRow(
      mkBtn('自動ウェイト', () => {
        edit('自動ウェイト', () => { autoWeights(S.proj, slot, setupPose(), {maxBones:4, falloff:2.5}); markDirty(); });
        setStatus('自動ウェイトを適用: ' + slot.name);
      }),
      mkBtn('全パーツに', () => {
        edit('全パーツに自動ウェイト', () => {
          const sp = setupPose();
          S.proj.slots.forEach(s => autoWeights(S.proj, s, sp, {maxBones:4, falloff:2.5}));
          markDirty();
        });
        setStatus('全パーツに自動ウェイトを適用');
      })));
    host.appendChild(btnRow(mkBtn('選択ボーンに100%', () => {
      edit('ウェイトを固定', () => { slot.verts.forEach(v => v.w = [{b:S.sel.bone, w:1}]); markDirty(); });
    }), mkBtn('パーツ削除', () => {
      if(!confirm(slot.name + ' を削除?')) return;
      edit('パーツを削除', () => { S.proj.slots = S.proj.slots.filter(s => s !== slot); S.sel.slot = null; });
      refreshUI();
    }, 'danger')));

    host.appendChild(el('div','title','PNGTuber割り当て'));
    ['mouthOpen:口(開)','mouthClose:口(閉)','eyeOpen:目(開)','eyeClose:目(閉)'].forEach(spec => {
      const [key, lb] = spec.split(':');
      const on = S.proj[key] === slot.id;
      host.appendChild(btnRow(mkBtn(lb + (on ? ' ✓' : ''), () => {
        edit('PNGTuber割り当て', () => S.proj[key] = on ? null : slot.id); refreshUI();
      }, on ? 'on' : '')));
    });
  }

  if(S.tool === 'weight'){
    host.appendChild(el('div','title','ウェイトブラシ'));
    host.appendChild(rng('半径', () => S.brush.r, v => S.brush.r = v, 5, 600, 1));
    host.appendChild(rng('強さ', () => S.brush.amount, v => S.brush.amount = v, 0.02, 1, 0.02));
    host.appendChild(el('div','hint','ドラッグ=塗る / Alt+ドラッグ=消す\nホイール=半径\n色は 赤=1.0 → 黄 → 薄いグレー=0'));
  }

  host.appendChild(el('div','title','キャンバス'));
  host.appendChild(num('幅', () => S.proj.canvas.w, v => S.proj.canvas.w = v));
  host.appendChild(num('高さ', () => S.proj.canvas.h, v => S.proj.canvas.h = v));
  host.appendChild(btnRow(mkBtn('画面にフィット (F)', fitView)));
}

function makeIK(b){
  if(!b.parent) return alert('ルートボーンにはIKを付けられません');
  const chain = confirm('2ボーンIKにしますか？\n\nOK = ' + (boneById(b.parent)?.name || '親') + ' と ' + b.name + ' の2本を曲げる（腕・脚向き）\nキャンセル = ' + b.name + ' 1本がターゲットを向くだけ');
  edit('IKを作成', () => {
    const p = curPose[b.id];
    const tip = M.apply(p.world, b.len, 0);
    const root = S.proj.bones[0];
    const ri = M.inv(curPose[root.id] ? curPose[root.id].world : M.ident());
    const lt = M.apply(ri, tip.x, tip.y);
    const target = {
      id: uid('b'), name: b.name + '_target', parent: root.id,
      x: lt.x, y: lt.y, rot:0, sx:1, sy:1, shear:0, len: Math.max(30, b.len*0.5),
      spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1
    };
    S.proj.bones.push(target);
    const bones = chain && b.parent ? [b.parent, b.id] : [b.id];
    S.proj.iks = S.proj.iks || [];
    S.proj.iks.push(newIK(b.name + '_ik', bones, target.id));
    S.sel.bone = target.id;
    markDirty();
  });
  setStatus('IKを作りました。ターゲット（🎯の先）を動かしてみてください');
  refreshUI();
}

/* ================= ドープシート ================= */
function buildAnimBar(){
  const sel = $('#animSel');
  const names = Object.keys(S.proj.anims).join(',');
  if(sel.dataset.n !== names){
    sel.innerHTML = '';
    for(const n in S.proj.anims){ const o = el('option', null, n); o.value = n; sel.appendChild(o); }
    sel.dataset.n = names;
  }
  sel.value = S.proj.current;
  const a = anim(); if(!a) return;
  if(document.activeElement !== $('#animDur')) $('#animDur').value = a.dur;
  $('#animLoop').checked = a.loop;
  if(document.activeElement !== $('#curTime')) $('#curTime').value = S.time.toFixed(2);
}

const ROW_H = 17, HEAD_H = 18, LX = 132;

function dopeRows(){
  const a = anim(); if(!a) return [];
  const rows = [];
  for(const id in a.tracks){
    const b = boneById(id); if(!b) continue;
    rows.push({ kind:'bone', id, name:b.name });
    if(S.expanded[id]){
      CH.forEach(ch => { if(a.tracks[id][ch] && a.tracks[id][ch].length) rows.push({ kind:'ch', id, ch, name:CH_LABEL[ch] }); });
    }
  }
  return rows;
}

function keyTimes(a, id, ch){
  if(ch) return (a.tracks[id][ch] || []).map(k => k.t);
  const set = new Set();
  for(const c of CH){ const k = a.tracks[id][c]; if(k) k.forEach(x => set.add(+x.t.toFixed(4))); }
  return [...set];
}

/* ドープシートの実寸。毎フレーム測ると、縦スクロールバーの出入りで幅が
   1px 単位で揺れ、キャンバスを作り直し続けて画面が震える。
   実寸は ResizeObserver で拾ってここに覚えておき、描画では測らない。 */
const dopeBox = { w:0, h:0 };
function syncDopeBox(){
  const host = $('#dope');
  if(!host) return;
  const w = host.clientWidth;
  if(w > 0 && Math.abs(w - dopeBox.w) > 1) dopeBox.w = w;
  const ch = host.clientHeight;
  if(ch > 0 && Math.abs(ch - dopeBox.h) > 1) dopeBox.h = ch;
}
if(window.ResizeObserver){
  const ro = new ResizeObserver(syncDopeBox);
  const host = $('#dope');
  if(host) ro.observe(host);
}
addEventListener('resize', syncDopeBox);
syncDopeBox();

function drawDope(){
  const host = $('#dope');
  if(!dopeBox.w) syncDopeBox();
  const w = dopeBox.w || host.clientWidth;
  const rows = dopeRows();
  const H = Math.max(dopeBox.h || host.clientHeight, HEAD_H + rows.length*ROW_H + 6);
  const dpr = Math.min(devicePixelRatio||1, 2);
  if(Math.abs(dcv.width - w*dpr) > 1 || Math.abs(dcv.height - H*dpr) > 1){
    dcv.width = w*dpr; dcv.height = H*dpr;
    dcv.style.width = w+'px'; dcv.style.height = H+'px';
  }
  const g = dctx;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,w,H);
  const a = anim(); if(!a) return;
  const RW = w - LX - 12;
  const t2x = t => LX + (t/a.dur)*RW;
  const x2t = x => clamp((x - LX)/RW * a.dur, 0, a.dur);

  g.fillStyle = PAPER; g.fillRect(0,0,w,H);
  g.fillStyle = MAIN_SOFT; g.fillRect(0,0,LX,H);
  g.fillStyle = MAIN; g.fillRect(0,0,w,HEAD_H);
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0,HEAD_H); g.lineTo(w,HEAD_H); g.moveTo(LX,0); g.lineTo(LX,H); g.stroke();

  g.font = '400 10px "DotGothic16", monospace';
  const step = a.dur <= 2 ? 0.1 : a.dur <= 6 ? 0.5 : 1;
  for(let t = 0; t <= a.dur + 1e-6; t += step){
    const x = t2x(t), major = Math.abs(t % (step*5)) < 1e-6;
    g.lineWidth = 1;
    g.strokeStyle = major ? 'rgba(30,28,20,.28)' : 'rgba(30,28,20,.11)';
    g.beginPath(); g.moveTo(x, HEAD_H); g.lineTo(x, H); g.stroke();
    if(major){ g.fillStyle = INK; g.fillText(t.toFixed(1), x+3, 13); }
  }

  rows.forEach((r, i) => {
    const y = HEAD_H + i*ROW_H;
    const isSelRow = r.id === S.sel.bone;
    if(isSelRow){ g.fillStyle = 'rgba(225,221,96,.35)'; g.fillRect(LX, y, w-LX, ROW_H); }
    if(r.kind === 'bone'){
      if(isSelRow){
        g.fillStyle = MAIN; g.fillRect(2, y+1, LX-6, ROW_H-2);
        g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(2, y+1, LX-6, ROW_H-2);
      }
      g.fillStyle = INK; g.font = '700 11px "M PLUS Rounded 1c", sans-serif';
      g.fillText((S.expanded[r.id] ? '▾ ' : '▸ ') + r.name.slice(0,12), 7, y+12);
    } else {
      g.fillStyle = GRAY; g.font = '400 10px "M PLUS Rounded 1c", sans-serif';
      g.fillText('　└ ' + r.name, 10, y+12);
    }
    g.strokeStyle = 'rgba(30,28,20,.13)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LX, y+ROW_H-.5); g.lineTo(w, y+ROW_H-.5); g.stroke();

    keyTimes(a, r.id, r.ch).forEach(t => {
      const x = t2x(t), cy = y + ROW_H/2;
      const picked = S.selKeys.some(k => k.bone === r.id && (r.ch ? k.ch === r.ch : true) && Math.abs(k.t - t) < 1e-3);
      g.fillStyle = picked ? PINK : Math.abs(t - S.time) < 0.005 ? PAPER : MAIN;
      g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, cy-5); g.lineTo(x+5, cy); g.lineTo(x, cy+5); g.lineTo(x-5, cy);
      g.closePath(); g.fill(); g.stroke();
    });
  });

  const px = t2x(clamp(S.time, 0, a.dur));
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(px, 15); g.lineTo(px, H); g.stroke();
  g.fillStyle = INK; g.beginPath();
  if(g.roundRect) g.roundRect(px-19, 1, 38, 15, 7); else g.rect(px-19, 1, 38, 15);
  g.fill();
  g.fillStyle = MAIN; g.font = '700 10px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
  g.fillText(S.time.toFixed(2), px, 12); g.textAlign = 'left';

  dcv._t2x = t2x; dcv._x2t = x2t; dcv._rows = rows;
}

dcv.addEventListener('pointerdown', e => {
  const a = anim(); if(!a) return;
  const r = dcv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const rows = dcv._rows || [];
  const ri = Math.floor((y - HEAD_H)/ROW_H);
  const row = rows[ri];

  // 左の名前欄: 選択 / 展開
  if(x < LX){
    if(row){
      S.sel.bone = row.id;
      if(row.kind === 'bone') S.expanded[row.id] = !S.expanded[row.id];
      refreshUI();
    }
    return;
  }

  // キーを掴む
  if(row){
    const hit = keyTimes(a, row.id, row.ch).find(t => Math.abs(dcv._t2x(t) - x) < 7);
    if(hit !== undefined){
      const chs = row.ch ? [row.ch] : CH.filter(c => (a.tracks[row.id][c]||[]).some(k => Math.abs(k.t-hit) < 1e-3));
      S.selKeys = chs.map(c => ({ bone:row.id, ch:c, t:hit }));
      S.sel.bone = row.id;
      beginEdit('キーを移動');
      S.drag = { type:'keydrag', from:hit };
      const move = ev => {
        const nx = ev.clientX - r.left;
        const nt = Math.round(dcv._x2t(nx)*100)/100;
        if(nt === S.drag.from) return;
        S.selKeys.forEach(k => {
          const arr = a.tracks[k.bone][k.ch]; if(!arr) return;
          const kk = arr.find(o => Math.abs(o.t - k.t) < 1e-3);
          if(kk){ kk.v = kk.v; kk.t = nt; }
          k.t = nt;
        });
        for(const c of CH){ const arr = a.tracks[row.id][c]; if(arr) arr.sort((p,q) => p.t-q.t); }
        S.drag.from = nt;
        S.time = nt; $('#curTime').value = nt.toFixed(2);
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        S.drag = null; commitEdit(); refreshUI();
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      refreshUI();
      return;
    }
  }

  // 何もないところ = 再生ヘッドを動かす
  S.selKeys = [];
  S.playing = false;
  const scrub = ev => {
    S.time = Math.round(dcv._x2t(ev.clientX - r.left)*100)/100;
    $('#curTime').value = S.time.toFixed(2);
  };
  scrub(e);
  const up = () => { window.removeEventListener('pointermove', scrub); window.removeEventListener('pointerup', up); refreshUI(); };
  window.addEventListener('pointermove', scrub); window.addEventListener('pointerup', up);
  refreshUI();
});

function allKeyTimes(){
  const a = anim(); if(!a) return [];
  const set = new Set();
  for(const id in a.tracks) keyTimes(a, id).forEach(t => set.add(+t.toFixed(3)));
  return [...set].sort((p,q) => p-q);
}
function gotoKey(dir){
  const ts = allKeyTimes();
  const next = dir > 0 ? ts.find(t => t > S.time + 1e-3) : [...ts].reverse().find(t => t < S.time - 1e-3);
  if(next !== undefined){ S.time = next; $('#curTime').value = S.time.toFixed(2); refreshUI(); }
}

function keyAllChannels(){
  const b = boneById(S.sel.bone), a = anim();
  if(!b || !a) return;
  edit('キーを打つ', () => {
    const p = evalPose(0)[b.id];
    const c = $('#curveSel').value;
    CH.forEach(ch => setKey(a, b.id, ch, S.time, isScaleCh(ch) ? p.v[ch] : p.v[ch] - (b[ch]||0), c));
  });
  setStatus('キーを打ちました: ' + b.name + ' @ ' + S.time.toFixed(2) + 's');
  refreshUI();
}

function deleteKeys(){
  const a = anim(); if(!a) return;
  edit('キーを消す', () => {
    if(S.selKeys.length){
      S.selKeys.forEach(k => removeKey(a, k.bone, k.ch, k.t));
      S.selKeys = [];
    } else {
      CH.forEach(ch => removeKey(a, S.sel.bone, ch, S.time));
    }
  });
  refreshUI();
}

/* ================= プリセット ================= */
const PRESETS = {
  '呼吸（上下にゆっくり）': (b,a) => {
    setKey(a,b.id,'y',0,0,'smooth'); setKey(a,b.id,'y',a.dur/2,-6,'smooth'); setKey(a,b.id,'y',a.dur,0,'smooth');
  },
  '首を振る（左右）': (b,a) => {
    const d=a.dur;
    setKey(a,b.id,'rot',0,0,'smooth'); setKey(a,b.id,'rot',d*0.25,5,'smooth');
    setKey(a,b.id,'rot',d*0.75,-5,'smooth'); setKey(a,b.id,'rot',d,0,'smooth');
  },
  'ゆらゆら回転': (b,a) => {
    for(let i=0;i<=4;i++) setKey(a,b.id,'rot',a.dur*i/4,[0,8,0,-8,0][i],'smooth');
  },
  'うなずき': (b,a) => {
    const d=a.dur;
    setKey(a,b.id,'rot',0,0,'smooth'); setKey(a,b.id,'rot',d*0.15,-9,'smooth');
    setKey(a,b.id,'rot',d*0.35,2,'smooth'); setKey(a,b.id,'rot',d*0.6,0,'smooth');
  },
  '跳ねる（拡大縮小）': (b,a) => {
    const d=a.dur;
    [[0,1],[d*0.3,1.08],[d*0.6,0.96],[d,1]].forEach(([t,v]) => setKey(a,b.id,'sy',t,v,'smooth'));
    [[0,1],[d*0.3,0.95],[d*0.6,1.04],[d,1]].forEach(([t,v]) => setKey(a,b.id,'sx',t,v,'smooth'));
  }
};

/* ================= 配信モード ================= */
function tickLive(dt){
  const p = S.proj;
  if(p.mouthOpen || p.mouthClose){
    const open = S.micLevel > 0.06;
    const so = slotById(p.mouthOpen), sc = slotById(p.mouthClose);
    if(so) so.visible = open;
    if(sc) sc.visible = !open;
  }
  if(p.eyeOpen || p.eyeClose){
    S.blink.next -= dt;
    if(S.blink.next <= 0){ S.blink.closing = 0.12; S.blink.next = 2 + Math.random()*4; }
    const closed = S.blink.closing > 0;
    if(closed) S.blink.closing -= dt;
    const eo = slotById(p.eyeOpen), ec = slotById(p.eyeClose);
    if(eo) eo.visible = !closed;
    if(ec) ec.visible = closed;
  }
}

async function startMic(){
  if(S.mic) return;
  try{
    const st = await navigator.mediaDevices.getUserMedia({ audio:true });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const an = ac.createAnalyser(); an.fftSize = 512;
    ac.createMediaStreamSource(st).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    S.mic = { ac, an, buf };
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for(let i=0;i<buf.length;i++){ const v = (buf[i]-128)/128; sum += v*v; }
      S.micLevel = lerp(S.micLevel, Math.sqrt(sum/buf.length), 0.4);
      requestAnimationFrame(loop);
    };
    loop();
  }catch(e){ setStatus('マイク不可: ' + e.message); }
}

function enterLive(){
  S.live = true; S.playing = true; S.time = 0;
  document.body.classList.add('live');
  if(S.proj.mouthOpen || S.proj.mouthClose) startMic();
  setTimeout(() => { resize(); fitView(); }, 30);
}
function exitLive(){
  S.live = false;
  document.body.classList.remove('live');
  setTimeout(() => { resize(); fitView(); refreshUI(); }, 30);
}

/* ================= 保存 / 読込 / 録画 ================= */
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function saveProject(){
  download((S.proj.name || 'rig') + '.minispine.json',
    new Blob([snapshotWithImages()], { type:'application/json' }));
  setStatus('保存しました');
}
function snapshotWithImages(){
  return JSON.stringify(S.proj, (k,v) => (k === 'bind' || k === '_xy') ? undefined : v);
}
function loadProject(text){
  let p;
  try{ p = JSON.parse(text); }catch(e){ return alert('読めませんでした: ' + e.message); }
  S.proj = p; S.imgs = {};
  S.proj.iks = S.proj.iks || [];
  S.sel = { bone:p.bones[0].id, slot:null, ik:null };
  S.time = 0; S.springState = {};
  UNDO.stack = []; UNDO.idx = -1;
  let pending = Object.keys(p.images).length;
  const done = () => { if(--pending <= 0){ markDirty(); refreshUI(); fitView(); setStatus('読み込み完了'); } };
  if(!pending){ markDirty(); refreshUI(); return; }
  for(const id in p.images){
    const im = new Image();
    im.onload = im.onerror = done;
    im.src = p.images[id].src;
    S.imgs[id] = im;
  }
}
function toggleRec(){
  if(S.rec){ S.rec.stop(); return; }
  const stream = cv.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const chunks = [];
  const r = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond: 8000000 });
  r.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    S.rec = null;
    $('#btnRec').classList.remove('on'); $('#btnRec').textContent = '⏺ 録画';
    download((S.proj.name || 'rig') + '.webm', new Blob(chunks, { type:'video/webm' }));
    setStatus('録画を保存しました');
  };
  r.start(); S.rec = r;
  $('#btnRec').classList.add('on'); $('#btnRec').textContent = '■ 停止して保存';
  S.playing = true; S.time = 0; refreshPlayBtn();
  setStatus('録画中… もう一度押すと保存');
}

/* ================= 配線 ================= */
$$('.tool').forEach(b => b.onclick = () => { S.tool = b.dataset.tool; refreshUI(); });
$$('.axis').forEach(b => b.onclick = () => { S.axis = b.dataset.axis; refreshUI(); });
$$('.vt').forEach(b => b.onclick = () => { S.show[b.dataset.show] = !S.show[b.dataset.show]; refreshUI(); });
$('#mSetup').onclick = () => { S.mode = 'setup'; S.springState = {}; refreshUI(); };
$('#mAnim').onclick  = () => { S.mode = 'anim';  S.springState = {}; refreshUI(); };
$('#btnComp').onclick = () => { S.compensate = !S.compensate; refreshUI(); };
$('#btnSpring').onclick = () => {
  S.spring = !S.spring; S.springState = {};
  if(S.spring && S.mode !== 'anim') setStatus('揺れ物理はアニメートモードと配信モードで効きます');
  refreshUI();
};
$('#btnMesh').onclick = () => { S.meshEdit = !S.meshEdit; refreshUI(); };

/* ---- くわしい設定の開閉 ----
   既定では ポーズ / 作成 / ウェイト だけを出す。回転・移動・座標系などは
   ここを開いたときだけ現れる。選んだ状態は次に開いたときも残す。 */
const ADV_TOOLS = ['rotate', 'translate', 'scale', 'shear'];
function setAdvanced(on){
  document.body.classList.toggle('adv', on);
  const b = $('#btnAdv');
  if(b) b.classList.toggle('on', on);
  // 畳むときに隠れるツールを選んでいたら、ポーズに戻しておく
  if(!on && ADV_TOOLS.includes(S.tool)){
    S.tool = 'pose';
    setStatus('ポーズに戻しました');
  }
  try{ localStorage.setItem('miniSpineAdv', on ? '1' : '0'); }catch(e){}
  refreshUI();
}
$('#btnAdv').onclick = () => setAdvanced(!document.body.classList.contains('adv'));
try{ setAdvanced(localStorage.getItem('miniSpineAdv') === '1'); }catch(e){ setAdvanced(false); }
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#btnAddImg').onclick = () => $('#fileImg').click();
$('#fileImg').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('#btnSave').onclick = saveProject;
$('#btnLoad').onclick = () => $('#fileProj').click();
$('#fileProj').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader(); rd.onload = () => loadProject(rd.result); rd.readAsText(f);
  e.target.value = '';
};
$('#btnRec').onclick = toggleRec;
$('#btnLive').onclick = enterLive;
$('#btnLiveExit').onclick = exitLive;
/* つかいかた: alert だと長すぎて読めないので、画面内のパネルに出す。
   最初に開いたときは自動で表示する。 */
const HELP_QUICK = `
<h4>3ステップで動かす</h4>
<ol>
  <li><b>PSDを放り込む</b>。レイヤーがそのままパーツになり、仮の骨格まで組まれます。</li>
  <li>上の<b>「セットアップ」</b>で形を整え、<b>「アニメート」</b>に切り替えます。</li>
  <li>骨を動かして<b>「◆キー」</b>を押す。時間を進めてもう一度動かせば、その間が繋がります。</li>
</ol>

<h4>タブレットの操作</h4>
<ul>
  <li><b>指1本</b> … 骨をつかむ・塗る（編集）</li>
  <li><b>指2本</b> … 画面の移動と拡大縮小</li>
  <li>左上の <b>🗂 / ⚙</b> … ツリーとプロパティの出し入れ</li>
</ul>

<h4>迷ったら</h4>
<ul>
  <li>ツールは<b>「ポーズ」</b>だけで大体足ります。回転と移動を兼ねています。</li>
  <li>戻したいときは <b>↶</b>。何度でも戻せます。</li>
  <li>下の<b>「よくある動き」</b>から、揺れや呼吸を選ぶだけでも形になります。</li>
</ul>
`;

function openHelp(){
  const q = $('#helpQuick'), f = $('#helpFull');
  if(q && !q.dataset.filled){ q.innerHTML = HELP_QUICK; q.dataset.filled = '1'; }
  if(f && !f.textContent) f.textContent = HELP;
  document.body.classList.add('help-open');
}
function closeHelp(){ document.body.classList.remove('help-open'); }
$('#btnHelp').onclick = openHelp;
$('#helpClose').onclick = closeHelp;
$('#helpBack').onclick = closeHelp;
addEventListener('keydown', e => { if(e.key === 'Escape') closeHelp(); });

/* 初回だけ自動で開く */
try{
  if(!localStorage.getItem('miniSpineSeenHelp')){
    localStorage.setItem('miniSpineSeenHelp', '1');
    addEventListener('load', () => setTimeout(openHelp, 400));
  }
}catch(e){ /* localStorage が使えない環境では出さないだけ */ }

$('#animSel').onchange = e => { S.proj.current = e.target.value; S.time = 0; S.selKeys = []; refreshUI(); };
$('#btnAnimNew').onclick = () => {
  const n = prompt('新しいアニメーション名', 'anim' + (Object.keys(S.proj.anims).length+1));
  if(!n) return;
  edit('アニメを追加', () => { S.proj.anims[n] = { dur:2, loop:true, tracks:{} }; S.proj.current = n; });
  S.time = 0; $('#animSel').dataset.n = ''; refreshUI();
};
$('#btnAnimDel').onclick = () => {
  if(Object.keys(S.proj.anims).length <= 1) return alert('最後の1つは削除できません');
  if(!confirm(S.proj.current + ' を削除?')) return;
  edit('アニメを削除', () => {
    delete S.proj.anims[S.proj.current];
    S.proj.current = Object.keys(S.proj.anims)[0];
  });
  $('#animSel').dataset.n = ''; refreshUI();
};
$('#animDur').onchange = e => { edit('長さを変更', () => anim().dur = Math.max(0.1, parseFloat(e.target.value)||2)); refreshUI(); };
$('#animLoop').onchange = e => { anim().loop = e.target.checked; };
$('#curTime').onchange = e => { S.time = clamp(parseFloat(e.target.value)||0, 0, anim().dur); refreshUI(); };
$('#btnFirst').onclick = () => { S.time = 0; refreshUI(); };
$('#btnPrevKey').onclick = () => gotoKey(-1);
$('#btnNextKey').onclick = () => gotoKey(1);
$('#btnPlay').onclick = () => { S.playing = !S.playing; if(S.playing) S.mode = 'anim'; refreshUI(); };
$('#btnKey').onclick = keyAllChannels;
$('#btnKeyDel').onclick = deleteKeys;
$('#btnPreset').onclick = () => {
  const names = Object.keys(PRESETS);
  const pick = prompt('番号を入力:\n' + names.map((n,i) => (i+1)+'. '+n).join('\n'), '1');
  const i = parseInt(pick,10) - 1;
  if(!(i >= 0 && i < names.length)) return;
  const b = boneById(S.sel.bone), a = anim(); if(!b || !a) return;
  edit(names[i], () => PRESETS[names[i]](b, a));
  S.mode = 'anim'; S.playing = true;
  setStatus(names[i] + ' を ' + b.name + ' に適用');
  refreshUI();
};

/* ドラッグ&ドロップ */
const view = $('#view');
['dragenter','dragover'].forEach(ev => view.addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.add('on'); }));
['dragleave','drop'].forEach(ev => view.addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.remove('on'); }));
view.addEventListener('drop', e => {
  const files = e.dataTransfer.files;
  if(!files.length) return;
  if(/\.json$/i.test(files[0].name)){
    const rd = new FileReader(); rd.onload = () => loadProject(rd.result); rd.readAsText(files[0]);
  } else addFiles(files);
});

/* キーボード（本物に合わせた割り当て） */
window.addEventListener('keydown', e => {
  if(/input|select|textarea/i.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if(e.ctrlKey || e.metaKey){
    if(k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if(k === 'y'){ e.preventDefault(); redo(); return; }
    if(k === 's'){ e.preventDefault(); saveProject(); return; }
    return;
  }
  if(e.key === 'Escape' && S.live){ exitLive(); return; }
  if(e.key === ' '){ e.preventDefault(); $('#btnPlay').click(); return; }
  if(e.key === 'Tab'){ e.preventDefault(); (S.mode === 'setup' ? $('#mAnim') : $('#mSetup')).click(); return; }
  if(e.key === 'Delete' || e.key === 'Backspace'){
    if(S.mode === 'anim') deleteKeys(); else if(S.sel.bone) deleteBone(S.sel.bone);
    return;
  }
  const TOOLKEYS = { q:'pose', w:'translate', e:'rotate', r:'scale', t:'shear', a:'weight', c:'create' };
  if(TOOLKEYS[k]){
    S.tool = TOOLKEYS[k];
    // ショートカットで隠れているツールを選んだら、くわしい設定を開いて見せる
    if(ADV_TOOLS.includes(S.tool) && !document.body.classList.contains('adv')) setAdvanced(true);
    refreshUI(); return;
  }
  if(k === 'k'){ keyAllChannels(); return; }
  if(k === 'f'){ fitView(); return; }
  if(k === 'x'){ S.axis = S.axis === 'local' ? 'parent' : S.axis === 'parent' ? 'world' : 'local'; refreshUI(); return; }
  if(k === 'g'){ S.compensate = !S.compensate; refreshUI(); return; }
});

const HELP = `【ミニSpine つかいかた】本家Spineの操作に寄せてあります

■ 読み込み（PSD推奨）
  PSD をドロップすると、レイヤーがそのままパーツになる。
  ・位置はPSDのまま。PNGを1枚ずつ並べ直す作業が要らない
  ・グループがあればグループごとにボーンを作る
  ・グループが無ければ、レイヤー名から 頭 / 腕 / 前髪 / 後ろ髪 を
    推測して仮の骨格を組む（髪は2本チェーン＋揺れ物理つき）
  ・「口 開」「目 閉」などの名前は配信モード用に自動割り当て
  PNGを複数枚ドロップしてもよい。

■ 画面
  左＝ツリー（ボーンの下にパーツがぶら下がる）
  中央＝ビューポート。左上でモード切替、下にメインツールバー
  右＝プロパティ　下＝ドープシート

■ ツール（キー）
  Q ポーズ  … 回転と移動を同時に。根元の丸をつかむと移動
  W トランスレート … 移動だけ
  E 回転 … 回転だけ（Ctrlで15度ずつ）
  R スケール … 拡大縮小（Shiftで縦横いっしょ）
  T シアー … 斜めにゆがめる
  A ウェイト … 選択ボーンの影響を塗る（Alt+ドラッグで消す）
  C 作成 … ドラッグで根元→先端に新しいボーン

■ 座標系（X キーで巡回）
  ローカル＝そのボーンの向き基準 / 親＝親の向き基準 / ワールド＝画面基準
  トランスレート中に Shift で軸に沿って拘束

■ コンペンセイト（G キー）
  ONにすると、子ボーンとアタッチメントを動かさずに
  そのボーンだけを調整できる。あとから骨の位置を直すとき用。

■ セットアップ / アニメート
  セットアップ＝静止した絵の上に骨格を組む。絵は変形しない
  アニメート＝動かすと自動でキーが入る（Tab で切替）

■ IK
  ボーンを選んで右パネルの「このボーンからIKを作る」。
  2ボーンIKなら腕や脚が、ターゲットを動かすだけで曲がる。

■ ドープシート
  キーをドラッグして時間を移動、Delete で削除
  ボーン名をクリックすると回転/X/Y… のチャンネル行が開く
  ◀ ▶| で前後のキーへジャンプ

■ その他
  Ctrl+Z / Ctrl+Y  元に戻す・やり直し
  右ドラッグ＝画面移動　ホイール＝ズーム　F＝フィット
  配信モード＝UIを消して透過表示。OBSのブラウザソースに入れると
  マイクで口パク・自動まばたきするPNGTuberになる`;

/* ================= 起動 ================= */
window.addEventListener('resize', resize);
resize(); fitView(); refreshUI();
setStatus('PNGをドロップして開始。右上の「? つかいかた」に操作一覧があります');
(function loop(){ render(); requestAnimationFrame(loop); })();

/* ---- タブレット: 左右パネルの引き出し ----
   狭い画面では #tree と #props を画面外に逃がしてある。つまみで出し入れする。 */
(() => {
  const body = document.body;
  const veil = document.getElementById('paneVeil');
  const close = () => body.classList.remove('tree-open', 'props-open');
  const toggle = cls => {
    const on = body.classList.contains(cls);
    close();
    if(!on) body.classList.add(cls);
  };
  const t = document.getElementById('btnPaneTree');
  const p = document.getElementById('btnPaneProps');
  if(t) t.addEventListener('click', () => toggle('tree-open'));
  if(p) p.addEventListener('click', () => toggle('props-open'));
  if(veil) veil.addEventListener('pointerdown', close);
  // 画面が広くなったら開きっぱなしを解除する
  addEventListener('resize', () => { if(innerWidth > 900) close(); });
})();
