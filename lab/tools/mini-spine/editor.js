/* MiniSpine editor : UI, tools, timeline, live mode */
'use strict';

const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if(cls) e.className = cls; if(txt!=null) e.textContent = txt; return e; };

const S = {
  proj: newProject(),
  imgs: {},                 // imageId -> HTMLImageElement
  view: { x:0, y:0, z:1 },
  mode: 'setup',            // setup | anim
  tool: 'select',
  selBone: 'root',
  selSlot: null,
  time: 0,
  playing: false,
  spring: false,
  springState: {},
  live: false,
  brush: { r: 60, amount: 0.35 },
  meshRes: { cols: 8, rows: 10 },
  drag: null,
  lastT: performance.now(),
  mic: null, micLevel: 0,
  blink: { next: 2, closing: 0 },
  rec: null
};

const cv = $('#cv'), ctx = cv.getContext('2d');
const dcv = $('#dopecv'), dctx = dcv.getContext('2d');

/* ================= helpers ================= */
const anim = () => S.proj.anims[S.proj.current];
const boneById = id => S.proj.bones.find(b => b.id === id);
const slotById = id => S.proj.slots.find(s => s.id === id);

function s2w(sx, sy){ return { x:(sx - S.view.x)/S.view.z, y:(sy - S.view.y)/S.view.z }; }
function setStatus(t){ $('#status').textContent = t; }

/* setup(bind) pose is always derived live from proj.bones */
function setupPose(){ return computePose(S.proj, null, 0); }

function rebindAll(){
  const sp = setupPose(), invs = invCache(sp);
  S.proj.slots.forEach(s => bindSlot(s, sp, invs));
}

function markDirty(){ rebindAll(); }

/* ================= image loading ================= */
function addImageFiles(files){
  const list = Array.from(files).filter(f => /^image\//.test(f.type));
  let pending = list.length;
  if(!pending) return;
  list.forEach(f => {
    const rd = new FileReader();
    rd.onload = () => addImageSrc(f.name, rd.result, () => { if(--pending === 0) afterImport(); });
    rd.readAsDataURL(f);
  });
}

function addImageSrc(name, src, done){
  const img = new Image();
  img.onload = () => {
    const id = uid('img');
    S.proj.images[id] = { id, name, src, w:img.naturalWidth, h:img.naturalHeight };
    S.imgs[id] = img;
    const slot = newSlot(id, { name });
    // place centred on canvas, fit to 70% height
    const c = S.proj.canvas;
    const sc = Math.min(1, (c.h * 0.7) / img.naturalHeight);
    const place = M.fromTRS(c.w/2 - img.naturalWidth*sc/2, c.h/2 - img.naturalHeight*sc/2, 0, sc, sc);
    const m = buildGridMesh(img, S.meshRes.cols, S.meshRes.rows, place);
    slot.verts = m.verts; slot.tris = m.tris;
    S.proj.slots.push(slot);
    S.selSlot = slot.id;
    if(done) done();
  };
  img.onerror = () => { if(done) done(); };
  img.src = src;
}

function afterImport(){ markDirty(); refreshUI(); }

/* ================= mesh ops ================= */
function remesh(slot, cols, rows){
  const img = S.imgs[slot.image]; if(!img) return;
  // keep current placement: derive from existing verts' uv->xy affine (first triangle)
  let place = M.ident();
  if(slot.verts.length >= 3){
    const v = slot.verts, t = slot.tris;
    const a = v[t[0]], b = v[t[1]], c = v[t[2]];
    const det = (b.u-a.u)*(c.v-a.v) - (c.u-a.u)*(b.v-a.v);
    if(det){
      place = {
        a: ((b.x-a.x)*(c.v-a.v) - (c.x-a.x)*(b.v-a.v))/det,
        b: ((b.y-a.y)*(c.v-a.v) - (c.y-a.y)*(b.v-a.v))/det,
        c: ((c.x-a.x)*(b.u-a.u) - (b.x-a.x)*(c.u-a.u))/det,
        d: ((c.y-a.y)*(b.u-a.u) - (b.y-a.y)*(c.u-a.u))/det,
        tx:0, ty:0
      };
      place.tx = a.x - (place.a*a.u + place.c*a.v);
      place.ty = a.y - (place.b*a.u + place.d*a.v);
    }
  }
  const m = buildGridMesh(img, cols, rows, place);
  slot.verts = m.verts; slot.tris = m.tris;
  markDirty();
}

function transformSlot(slot, m){
  for(const v of slot.verts){ const p = M.apply(m, v.x, v.y); v.x = p.x; v.y = p.y; }
}

/* ================= rendering ================= */
function fitView(){
  const c = S.proj.canvas;
  const z = Math.min(cv.width / c.w, cv.height / c.h) * 0.9;
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

/* はぁにデザイン工房パレット */
const INK = '#1E1C14', MAIN = '#E1DD60', MAIN_DEEP = '#B8B43F',
      MAIN_SOFT = '#F2F0BE', CREAM = '#FBFAEC', PAPER = '#FFFEF7',
      GRAY = '#8A8470', PINK = '#F2A0B8';

let _dotPat = null;
function dotPattern(){
  if(_dotPat === null){
    const t = document.createElement('canvas');
    t.width = t.height = 14;
    const g = t.getContext('2d');
    g.fillStyle = 'rgba(30,28,20,.09)';
    g.beginPath(); g.arc(7, 7, 1.7, 0, 7); g.fill();
    _dotPat = ctx.createPattern(t, 'repeat') || false;
  }
  return _dotPat;
}

let curPose = null;

function render(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - S.lastT)/1000);
  S.lastT = now;

  const a = anim();
  if(S.playing && a){
    S.time += dt;
    if(S.time > a.dur){
      if(a.loop) S.time = S.time % a.dur;
      else { S.time = a.dur; S.playing = false; }
    }
    if(!S.live) $('#curTime').value = S.time.toFixed(2);
  }

  const useAnim = (S.mode === 'anim' || S.live) ? a : null;
  const pose = computePose(S.proj, useAnim, S.time);
  applySprings(S.proj, pose, dt, S.springState, S.spring || S.live);
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

  // parts
  const xy = [];
  for(const slot of S.proj.slots){
    if(!slot.visible) continue;
    const img = S.imgs[slot.image]; if(!img) continue;
    const n = slot.verts.length;
    let buf = slot._xy; if(!buf || buf.length < n*2) buf = slot._xy = new Float32Array(n*2);
    deformSlot(slot, pose, buf);
    drawSlot(ctx, slot, img, buf);
  }

  if(S.live) return;

  // overlays
  if(S.tool === 'mesh' && S.selSlot) drawMesh(slotById(S.selSlot));
  if(S.tool === 'weight' && S.selSlot) drawWeights(slotById(S.selSlot));
  drawBones(pose);

  drawDope();
}

function drawBones(pose){
  const z = S.view.z;
  for(const b of S.proj.bones){
    const p = pose[b.id]; if(!p) continue;
    const o = { x:p.world.tx, y:p.world.ty };
    const e = M.apply(p.world, b.len, 0);
    const sel = b.id === S.selBone;
    const fill = sel ? MAIN : (b.spring ? 'rgba(242,160,184,.75)' : 'rgba(225,221,96,.5)');
    ctx.lineWidth = (sel ? 3.2 : 2.2)/z;
    ctx.strokeStyle = INK;
    // tapered bone shape
    const dx = e.x-o.x, dy = e.y-o.y, L = Math.hypot(dx,dy) || 1;
    // 根元は太く、先端はすこし細く。画面サイズ基準なので拡大率に関わらず掴みやすい
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
    if(sel){
      ctx.font = '700 ' + (13/z) + 'px "M PLUS Rounded 1c", sans-serif';
      ctx.lineWidth = 4/z; ctx.strokeStyle = PAPER;
      ctx.strokeText(b.name, o.x + 9/z, o.y - 9/z);
      ctx.fillStyle = INK;
      ctx.fillText(b.name, o.x + 9/z, o.y - 9/z);
    }
  }
}

function drawMesh(slot){
  if(!slot) return;
  const z = S.view.z, t = slot.tris, v = slot.verts;
  ctx.lineWidth = 1.2/z; ctx.strokeStyle = 'rgba(30,28,20,.38)';
  ctx.beginPath();
  for(let i=0;i<t.length;i+=3){
    const a=v[t[i]], b=v[t[i+1]], c=v[t[i+2]];
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.closePath();
  }
  ctx.stroke();
  ctx.fillStyle = MAIN; ctx.strokeStyle = INK; ctx.lineWidth = 1/z;
  for(const p of v){ ctx.beginPath(); ctx.arc(p.x,p.y,2.8/z,0,7); ctx.fill(); ctx.stroke(); }
}

function drawWeights(slot){
  if(!slot) return;
  const z = S.view.z;
  for(const v of slot.verts){
    const e = (v.w||[]).find(x => x.b === S.selBone);
    const w = e ? e.w : 0;
    const r = 3.2/z;
    ctx.fillStyle = w <= 0 ? 'rgba(30,28,20,.16)' : `hsla(${52 - w*52},85%,${62 - w*10}%,.95)`;
    ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, 7); ctx.fill();
  }
  if(S.mouseW){
    ctx.strokeStyle = PAPER; ctx.lineWidth = 4/z;
    ctx.beginPath(); ctx.arc(S.mouseW.x, S.mouseW.y, S.brush.r, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2/z; ctx.stroke();
  }
}

/* ================= mouse ================= */
function evPos(e){
  const r = cv.getBoundingClientRect();
  const dpr = cv.width / r.width;
  return { sx:(e.clientX - r.left)*dpr, sy:(e.clientY - r.top)*dpr };
}

cv.addEventListener('contextmenu', e => e.preventDefault());

cv.addEventListener('mousedown', e => {
  const {sx, sy} = evPos(e);
  const w = s2w(sx, sy);
  if(e.button === 1 || (e.button === 2) || e.altKey && e.button === 2){
    S.drag = { type:'pan', sx, sy, vx:S.view.x, vy:S.view.y }; return;
  }
  if(e.button !== 0) return;

  if(S.tool === 'weight'){
    const slot = slotById(S.selSlot);
    if(slot){ S.drag = { type:'paint', sub: e.altKey || e.shiftKey }; paintAt(w, S.drag.sub); }
    return;
  }
  if(S.tool === 'bone'){
    S.drag = { type:'newbone', ox:w.x, oy:w.y, x:w.x, y:w.y };
    return;
  }
  if(S.tool === 'mesh'){
    const slot = slotById(S.selSlot); if(!slot) return;
    let best = -1, bd = 12/S.view.z;
    slot.verts.forEach((v,i)=>{ const d = Math.hypot(v.x-w.x, v.y-w.y); if(d < bd){ bd = d; best = i; } });
    if(best >= 0) S.drag = { type:'vert', slot, i:best };
    return;
  }

  // select tool
  const hb = pickBone(w);
  if(hb){
    S.selBone = hb.id;
    const p = curPose[hb.id];
    const near = Math.hypot(p.world.tx - w.x, p.world.ty - w.y) < 10/S.view.z;
    S.drag = { type: near && S.mode === 'setup' ? 'bonemove' : 'bonerot',
               id: hb.id, sw: w, start: snapshotBone(hb) };
    refreshUI(); return;
  }
  const hs = pickSlot(w);
  if(hs){
    S.selSlot = hs.id;
    if(S.mode === 'setup') S.drag = { type: e.ctrlKey ? 'slotrot' : (e.altKey ? 'slotscale' : 'slotmove'),
                                      slot: hs, sw: w, verts: hs.verts.map(v=>({x:v.x,y:v.y})) };
    refreshUI(); return;
  }
  S.drag = { type:'pan', sx, sy, vx:S.view.x, vy:S.view.y };
});

window.addEventListener('mousemove', e => {
  const {sx, sy} = evPos(e);
  const w = s2w(sx, sy);
  S.mouseW = w;
  const d = S.drag;
  if(!d) return;
  if(d.type === 'pan'){ S.view.x = d.vx + (sx-d.sx); S.view.y = d.vy + (sy-d.sy); return; }
  if(d.type === 'paint'){ paintAt(w, d.sub); return; }
  if(d.type === 'newbone'){ d.x = w.x; d.y = w.y; return; }
  if(d.type === 'vert'){ const v = d.slot.verts[d.i]; v.x = w.x; v.y = w.y; markDirty(); return; }
  if(d.type === 'bonerot' || d.type === 'bonemove'){ dragBone(d, w, e); return; }
  if(d.type === 'slotmove'){
    const dx = w.x - d.sw.x, dy = w.y - d.sw.y;
    d.slot.verts.forEach((v,i)=>{ v.x = d.verts[i].x + dx; v.y = d.verts[i].y + dy; });
    markDirty(); return;
  }
  if(d.type === 'slotscale' || d.type === 'slotrot'){
    const cx = d.verts.reduce((a,v)=>a+v.x,0)/d.verts.length;
    const cy = d.verts.reduce((a,v)=>a+v.y,0)/d.verts.length;
    let m;
    if(d.type === 'slotscale'){
      const r0 = Math.hypot(d.sw.x-cx, d.sw.y-cy) || 1;
      const r1 = Math.hypot(w.x-cx, w.y-cy);
      const s = clamp(r1/r0, 0.05, 20);
      m = M.mul(M.fromTRS(cx,cy,0,s,s), M.fromTRS(-cx,-cy,0,1,1));
    } else {
      const a0 = Math.atan2(d.sw.y-cy, d.sw.x-cx), a1 = Math.atan2(w.y-cy, w.x-cx);
      const deg = (a1-a0)*180/Math.PI;
      m = M.mul(M.fromTRS(cx,cy,deg,1,1), M.fromTRS(-cx,-cy,0,1,1));
    }
    d.slot.verts.forEach((v,i)=>{ const p = M.apply(m, d.verts[i].x, d.verts[i].y); v.x = p.x; v.y = p.y; });
    markDirty(); return;
  }
});

window.addEventListener('mouseup', e => {
  const d = S.drag; S.drag = null;
  if(!d) return;
  if(d.type === 'newbone'){
    const L = Math.hypot(d.x-d.ox, d.y-d.oy);
    if(L > 6) createBone(d.ox, d.oy, d.x, d.y);
  }
  if(d.type === 'vert' || d.type === 'slotmove' || d.type === 'slotscale' || d.type === 'slotrot') markDirty();
  refreshUI();
});

cv.addEventListener('wheel', e => {
  e.preventDefault();
  if(S.tool === 'weight' && !e.ctrlKey){
    S.brush.r = clamp(S.brush.r * (e.deltaY > 0 ? 1.12 : 0.9), 5, 2000);
    setStatus('ブラシ半径 ' + Math.round(S.brush.r));
    return;
  }
  const {sx, sy} = evPos(e);
  const before = s2w(sx, sy);
  S.view.z = clamp(S.view.z * (e.deltaY > 0 ? 0.9 : 1.11), 0.03, 20);
  const after = s2w(sx, sy);
  S.view.x += (after.x - before.x) * S.view.z;
  S.view.y += (after.y - before.y) * S.view.z;
}, { passive:false });

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
    const xy = s._xy; if(!xy) continue;
    const t = s.tris;
    for(let k=0;k<t.length;k+=3){
      if(ptInTri(w.x,w.y, xy[t[k]*2],xy[t[k]*2+1], xy[t[k+1]*2],xy[t[k+1]*2+1], xy[t[k+2]*2],xy[t[k+2]*2+1])) return s;
    }
  }
  return null;
}

function ptInTri(px,py, ax,ay, bx,by, cx,cy){
  const d1 = (px-bx)*(ay-by) - (ax-bx)*(py-by);
  const d2 = (px-cx)*(by-cy) - (bx-cx)*(py-cy);
  const d3 = (px-ax)*(cy-ay) - (cx-ax)*(py-ay);
  const neg = (d1<0)||(d2<0)||(d3<0), pos = (d1>0)||(d2>0)||(d3>0);
  return !(neg && pos);
}

function snapshotBone(b){ return { rot:b.rot, x:b.x, y:b.y, sx:b.sx, sy:b.sy }; }

function dragBone(d, w, e){
  const b = boneById(d.id); if(!b) return;
  const p = curPose[b.id]; if(!p) return;
  const parentW = b.parent && curPose[b.parent] ? curPose[b.parent].world : M.ident();

  if(d.type === 'bonemove'){
    const pi = M.inv(parentW);
    const loc = M.apply(pi, w.x, w.y);
    if(S.mode === 'setup'){ b.x = loc.x; b.y = loc.y; markDirty(); }
    else { keyAbs(b, 'x', loc.x); keyAbs(b, 'y', loc.y); }
    return;
  }
  // rotate: aim bone at cursor
  const ox = p.world.tx, oy = p.world.ty;
  const want = Math.atan2(w.y-oy, w.x-ox)*180/Math.PI;
  const cur  = M.rotOf(p.world);
  let delta = want - cur;
  while(delta > 180) delta -= 360; while(delta < -180) delta += 360;
  if(S.mode === 'setup'){ b.rot += delta; markDirty(); }
  else keyAbs(b, 'rot', p.v.rot + delta);
}

/* set an absolute local value at current time (auto-key) */
function keyAbs(b, ch, absVal){
  const a = anim(); if(!a) return;
  const base = (ch === 'sx' || ch === 'sy') ? 0 : b[ch];
  const v = (ch === 'sx' || ch === 'sy') ? absVal : absVal - base;
  setKey(a, b.id, ch, S.time, v, $('#curveSel').value);
}

function paintAt(w, sub){
  const slot = slotById(S.selSlot); if(!slot) return;
  const amt = (sub ? -1 : 1) * S.brush.amount;
  paintWeight(slot, S.selBone, w.x, w.y, S.brush.r, amt);
  markDirty();
}

/* ================= bones ================= */
function createBone(ox, oy, ex, ey){
  const parent = boneById(S.selBone) || S.proj.bones[0];
  const pw = curPose[parent.id] ? curPose[parent.id].world : M.ident();
  const pi = M.inv(pw);
  const lo = M.apply(pi, ox, oy);
  const le = M.apply(pi, ex, ey);
  const b = {
    id: uid('b'), name: 'bone' + S.proj.bones.length, parent: parent.id,
    x: lo.x, y: lo.y,
    rot: Math.atan2(le.y-lo.y, le.x-lo.x)*180/Math.PI,
    sx:1, sy:1, len: Math.hypot(le.x-lo.x, le.y-lo.y),
    spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1
  };
  S.proj.bones.push(b);
  S.selBone = b.id;
  markDirty(); refreshUI();
}

function deleteBone(id){
  const b = boneById(id);
  if(!b || !b.parent) return alert('ルートボーンは削除できません');
  const kids = childMap(S.proj)[id] || [];
  kids.forEach(k => { const c = boneById(k); if(c) c.parent = b.parent; });
  S.proj.bones = S.proj.bones.filter(x => x.id !== id);
  S.proj.slots.forEach(s => {
    if(s.bone === id) s.bone = b.parent || 'root';
    s.verts.forEach(v => { if(v.w) v.w = v.w.filter(x => x.b !== id); });
  });
  for(const nm in S.proj.anims) delete S.proj.anims[nm].tracks[id];
  S.selBone = b.parent || 'root';
  markDirty(); refreshUI();
}

/* ================= UI ================= */
function refreshUI(){
  buildBoneTree(); buildSlotTree(); buildRight(); buildAnimBar();
  $('#boneCount').textContent = S.proj.bones.length + '本';
  $('#modeLabel').textContent = S.mode === 'setup' ? 'セットアップ' : 'アニメ';
  $('#btnMode').classList.toggle('on', S.mode === 'anim');
  $('#playLabel').textContent = S.playing ? '停止' : '再生';
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  $('#btnSpring').classList.toggle('on', S.spring);
  $('#btnPlay').classList.toggle('on', S.playing);
}

function buildBoneTree(){
  const host = $('#boneTree'); host.innerHTML = '';
  const kids = childMap(S.proj);
  const walk = (id, depth) => {
    const b = boneById(id); if(!b) return;
    const it = el('div', 'item' + (id === S.selBone ? ' sel' : ''));
    it.style.paddingLeft = (8 + depth*12) + 'px';
    it.appendChild(el('span','nm', b.name));
    if(b.spring) it.appendChild(el('span','spring','～'));
    it.onclick = () => { S.selBone = id; refreshUI(); };
    it.ondblclick = () => { const n = prompt('ボーン名', b.name); if(n){ b.name = n; refreshUI(); } };
    host.appendChild(it);
    (kids[id]||[]).forEach(k => walk(k, depth+1));
  };
  S.proj.bones.filter(b => !b.parent).forEach(b => walk(b.id, 0));
}

function buildSlotTree(){
  const host = $('#slotTree'); host.innerHTML = '';
  S.proj.slots.forEach((s, i) => {
    const it = el('div', 'item' + (s.id === S.selSlot ? ' sel' : ''));
    const eye = el('span', 'eye' + (s.visible ? ' on' : ''), s.visible ? '●' : '○');
    eye.onclick = ev => { ev.stopPropagation(); s.visible = !s.visible; refreshUI(); };
    it.appendChild(eye);
    it.appendChild(el('span','nm', s.name));
    it.appendChild(el('span','tag', s.verts.length + 'v'));
    it.onclick = () => { S.selSlot = s.id; refreshUI(); };
    it.ondblclick = () => { const n = prompt('パーツ名', s.name); if(n){ s.name = n; refreshUI(); } };
    host.appendChild(it);
  });
  if(!S.proj.slots.length) host.appendChild(el('div','hint','PNGをここにドロップ、\nまたは「画像追加」。\nパーツごとに分けた透過PNGを推奨。'));
}

function num(label, get, set, step){
  const r = el('div','row');
  r.appendChild(el('label', null, label));
  const i = el('input'); i.type = 'number'; i.step = step ?? 1; i.value = (+get()).toFixed(2);
  i.onchange = () => { set(parseFloat(i.value)||0); markDirty(); refreshUI(); };
  r.appendChild(i); return r;
}

function chk(label, get, set){
  const r = el('div','row');
  const i = el('input'); i.type = 'checkbox'; i.checked = !!get();
  i.onchange = () => { set(i.checked); refreshUI(); };
  const l = el('label'); l.style.flex = '1'; l.textContent = label;
  r.appendChild(i); r.appendChild(l); return r;
}

function rng(label, get, set, min, max, step){
  const r = el('div','row');
  r.appendChild(el('label', null, label));
  const i = el('input'); i.type='range'; i.min=min; i.max=max; i.step=step; i.value=get();
  const t = el('span', null, (+get()).toFixed(2)); t.style.width='34px'; t.style.color='var(--dim)';
  i.oninput = () => { set(parseFloat(i.value)); t.textContent = parseFloat(i.value).toFixed(2); };
  r.appendChild(i); r.appendChild(t); return r;
}

function btnRow(...bs){ const r = el('div','row'); bs.forEach(b=>{ b.style.flex='1'; r.appendChild(b); }); return r; }
function mkBtn(txt, fn, cls){ const b = el('button', cls, txt); b.onclick = fn; return b; }

function buildRight(){
  const host = $('#right'); host.innerHTML = '';
  const b = boneById(S.selBone);
  const slot = slotById(S.selSlot);

  if(b){
    host.appendChild(Object.assign(el('div','title','ボーン: ' + b.name), {}));
    if(S.mode === 'setup'){
      host.appendChild(num('X', ()=>b.x, v=>b.x=v));
      host.appendChild(num('Y', ()=>b.y, v=>b.y=v));
      host.appendChild(num('回転', ()=>b.rot, v=>b.rot=v));
      host.appendChild(num('長さ', ()=>b.len, v=>b.len=Math.max(4,v)));
      host.appendChild(num('スケールX', ()=>b.sx, v=>b.sx=v, 0.05));
      host.appendChild(num('スケールY', ()=>b.sy, v=>b.sy=v, 0.05));
      const pr = el('div','row'); pr.appendChild(el('label',null,'親'));
      const sel = el('select');
      S.proj.bones.forEach(o=>{
        if(o.id === b.id) return;
        if(isDescendant(o.id, b.id)) return;
        const op = el('option', null, o.name); op.value = o.id; if(o.id === b.parent) op.selected = true;
        sel.appendChild(op);
      });
      sel.onchange = () => { b.parent = sel.value; markDirty(); refreshUI(); };
      if(b.parent) pr.appendChild(sel); else pr.appendChild(el('span',null,'—'));
      host.appendChild(pr);
      host.appendChild(btnRow(mkBtn('ボーン削除', ()=>deleteBone(b.id), 'danger')));
    } else {
      const p = curPose && curPose[b.id];
      host.appendChild(el('div','hint','ドラッグで動かすと\n現在時間にキーが入ります'));
      if(p){
        host.appendChild(num('回転', ()=>p.v.rot, v=>keyAbs(b,'rot',v)));
        host.appendChild(num('X', ()=>p.v.x, v=>keyAbs(b,'x',v)));
        host.appendChild(num('Y', ()=>p.v.y, v=>keyAbs(b,'y',v)));
        host.appendChild(num('スケールX', ()=>p.v.sx, v=>keyAbs(b,'sx',v), 0.05));
        host.appendChild(num('スケールY', ()=>p.v.sy, v=>keyAbs(b,'sy',v), 0.05));
      }
    }

    host.appendChild(el('div','title','揺れ（バネ物理）'));
    host.appendChild(chk('このボーンを揺らす', ()=>b.spring, v=>{ b.spring=v; S.springState={}; }));
    if(b.spring){
      host.appendChild(rng('硬さ', ()=>b.stiff, v=>b.stiff=v, 0.02, 1, 0.01));
      host.appendChild(rng('減衰', ()=>b.damp, v=>b.damp=v, 0.3, 0.99, 0.01));
      host.appendChild(rng('重力', ()=>b.grav, v=>b.grav=v, -1, 1, 0.02));
      host.appendChild(rng('慣性', ()=>b.inertia, v=>b.inertia=v, 0.2, 1.6, 0.05));
      host.appendChild(btnRow(mkBtn('子ボーンにも同設定', ()=>{
        const kids = childMap(S.proj);
        const stack = [...(kids[b.id]||[])];
        while(stack.length){
          const id = stack.pop(); const c = boneById(id); if(!c) continue;
          c.spring = true; c.stiff = b.stiff; c.damp = b.damp; c.grav = b.grav; c.inertia = b.inertia;
          (kids[id]||[]).forEach(k=>stack.push(k));
        }
        S.springState = {}; refreshUI();
      })));
    }
  }

  if(slot){
    host.appendChild(el('div','title','パーツ: ' + slot.name));
    host.appendChild(rng('不透明度', ()=>slot.alpha, v=>slot.alpha=v, 0, 1, 0.05));
    const mr = el('div','row'); mr.appendChild(el('label',null,'メッシュ'));
    const ci = el('input'); ci.type='number'; ci.value=S.meshRes.cols; ci.min=1; ci.max=40;
    const ri = el('input'); ri.type='number'; ri.value=S.meshRes.rows; ri.min=1; ri.max=40;
    ci.onchange = ri.onchange = ()=>{ S.meshRes.cols = clamp(+ci.value|0,1,40); S.meshRes.rows = clamp(+ri.value|0,1,40); };
    mr.appendChild(ci); mr.appendChild(ri); host.appendChild(mr);
    host.appendChild(btnRow(mkBtn('メッシュ再生成', ()=>{ remesh(slot, S.meshRes.cols, S.meshRes.rows); refreshUI(); })));
    host.appendChild(btnRow(
      mkBtn('自動ウェイト', ()=>{ autoWeights(S.proj, slot, setupPose(), {maxBones:4, falloff:2.5}); markDirty(); setStatus('自動ウェイトを適用: '+slot.name); }),
      mkBtn('全パーツに', ()=>{ const sp = setupPose(); S.proj.slots.forEach(s=>autoWeights(S.proj,s,sp,{maxBones:4,falloff:2.5})); markDirty(); setStatus('全パーツに自動ウェイト'); })
    ));
    host.appendChild(btnRow(
      mkBtn('選択ボーンに100%', ()=>{ slot.verts.forEach(v=> v.w=[{b:S.selBone,w:1}]); markDirty(); }),
      mkBtn('前へ', ()=>{ moveSlot(slot, 1); })
    ));
    host.appendChild(btnRow(mkBtn('後ろへ', ()=>moveSlot(slot,-1)), mkBtn('パーツ削除', ()=>{
      if(!confirm(slot.name + ' を削除?')) return;
      S.proj.slots = S.proj.slots.filter(s=>s!==slot); S.selSlot=null; refreshUI();
    }, 'danger')));

    host.appendChild(el('div','title','PNGTuber割り当て'));
    host.appendChild(assignRow('口(開)', 'mouthOpen', slot));
    host.appendChild(assignRow('口(閉)', 'mouthClose', slot));
    host.appendChild(assignRow('目(開)', 'eyeOpen', slot));
    host.appendChild(assignRow('目(閉)', 'eyeClose', slot));
  }

  if(S.tool === 'weight'){
    host.appendChild(el('div','title','ウェイトブラシ'));
    host.appendChild(rng('半径', ()=>S.brush.r, v=>S.brush.r=v, 5, 600, 1));
    host.appendChild(rng('強さ', ()=>S.brush.amount, v=>S.brush.amount=v, 0.02, 1, 0.02));
    host.appendChild(el('div','hint','ドラッグ=塗る / Alt+ドラッグ=消す\nホイール=半径\n色: 赤=1.0 青=0'));
  }

  host.appendChild(el('div','title','キャンバス'));
  host.appendChild(num('幅', ()=>S.proj.canvas.w, v=>S.proj.canvas.w=v));
  host.appendChild(num('高さ', ()=>S.proj.canvas.h, v=>S.proj.canvas.h=v));
  host.appendChild(btnRow(mkBtn('画面にフィット', ()=>fitView())));
}

function assignRow(label, key, slot){
  const r = el('div','row');
  const on = S.proj[key] === slot.id;
  const b = el('button', on ? 'on' : '', label + (on ? ' ✓' : ''));
  b.style.flex = '1';
  b.onclick = () => { S.proj[key] = on ? null : slot.id; refreshUI(); };
  r.appendChild(b); return r;
}

function moveSlot(slot, dir){
  const i = S.proj.slots.indexOf(slot), j = i + dir;
  if(j < 0 || j >= S.proj.slots.length) return;
  S.proj.slots.splice(i,1); S.proj.slots.splice(j,0,slot); refreshUI();
}

function isDescendant(id, ofId){
  let cur = boneById(id);
  while(cur && cur.parent){ if(cur.parent === ofId) return true; cur = boneById(cur.parent); }
  return false;
}

/* ================= timeline ================= */
function buildAnimBar(){
  const sel = $('#animSel');
  if(sel.dataset.n !== Object.keys(S.proj.anims).join(',')){
    sel.innerHTML = '';
    for(const n in S.proj.anims){ const o = el('option', null, n); o.value = n; sel.appendChild(o); }
    sel.dataset.n = Object.keys(S.proj.anims).join(',');
  }
  sel.value = S.proj.current;
  const a = anim(); if(!a) return;
  if(document.activeElement !== $('#animDur')) $('#animDur').value = a.dur;
  $('#animLoop').checked = a.loop;
  if(document.activeElement !== $('#curTime')) $('#curTime').value = S.time.toFixed(2);
}

function dopeRows(){
  const a = anim(); if(!a) return [];
  return Object.keys(a.tracks).map(id => ({ id, bone: boneById(id) })).filter(r => r.bone);
}

function drawDope(){
  const host = $('#dope');
  const w = host.clientWidth, rows = dopeRows();
  const H = Math.max(host.clientHeight, 22 + rows.length*18);
  const dpr = Math.min(devicePixelRatio||1, 2);
  if(dcv.width !== w*dpr || dcv.height !== H*dpr){
    dcv.width = w*dpr; dcv.height = H*dpr;
    dcv.style.width = w+'px'; dcv.style.height = H+'px';
  }
  const g = dctx;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,w,H);
  const a = anim(); if(!a) return;
  const LX = 110, RW = w - LX - 10;
  const t2x = t => LX + (t / a.dur) * RW;

  g.fillStyle = PAPER; g.fillRect(0,0,w,H);
  g.fillStyle = MAIN_SOFT; g.fillRect(0,0,LX,H);
  g.fillStyle = MAIN; g.fillRect(0,0,w,17);
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0,17); g.lineTo(w,17); g.moveTo(LX,0); g.lineTo(LX,H); g.stroke();

  // ruler
  g.font = '400 10px "DotGothic16", monospace';
  const step = a.dur <= 2 ? 0.1 : (a.dur <= 6 ? 0.5 : 1);
  for(let t = 0; t <= a.dur + 1e-6; t += step){
    const x = t2x(t), major = Math.abs(t % (step*5)) < 1e-6;
    g.beginPath(); g.moveTo(x, 17); g.lineTo(x, H);
    g.lineWidth = 1;
    g.strokeStyle = major ? 'rgba(30,28,20,.28)' : 'rgba(30,28,20,.11)';
    g.stroke();
    if(major){ g.fillStyle = INK; g.fillText(t.toFixed(1), x+3, 12); }
  }

  rows.forEach((r, i) => {
    const y = 22 + i*18;
    if(r.id === S.selBone){
      g.fillStyle = MAIN; g.fillRect(2, y+1, LX-6, 16);
      g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(2, y+1, LX-6, 16);
    }
    g.fillStyle = INK;
    g.font = '700 11px "M PLUS Rounded 1c", sans-serif';
    g.fillText(r.bone.name.slice(0,12), 8, y + 13);
    g.strokeStyle = 'rgba(30,28,20,.13)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LX, y+17.5); g.lineTo(w, y+17.5); g.stroke();
    const times = new Set();
    for(const ch of CH){ const k = a.tracks[r.id][ch]; if(k) k.forEach(x => times.add(+x.t.toFixed(4))); }
    times.forEach(t => {
      const x = t2x(t), cy = y + 9;
      g.fillStyle = Math.abs(t - S.time) < 0.001 ? PINK : MAIN;
      g.strokeStyle = INK; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, cy-5.5); g.lineTo(x+5.5, cy); g.lineTo(x, cy+5.5); g.lineTo(x-5.5, cy); g.closePath();
      g.fill(); g.stroke();
    });
  });

  // playhead
  const px = t2x(clamp(S.time, 0, a.dur));
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(px, 14); g.lineTo(px, H); g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  if(g.roundRect) g.roundRect(px-19, 1, 38, 15, 7); else g.rect(px-19, 1, 38, 15);
  g.fill();
  g.fillStyle = MAIN; g.font = '700 10px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
  g.fillText(S.time.toFixed(2), px, 12); g.textAlign = 'left';
  dcv._t2x = t2x; dcv._LX = LX; dcv._RW = RW; dcv._rows = rows;
}

dcv.addEventListener('mousedown', e => {
  const a = anim(); if(!a) return;
  const r = dcv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if(x < dcv._LX){
    const i = Math.floor((y - 22)/18);
    if(dcv._rows[i]){ S.selBone = dcv._rows[i].id; refreshUI(); }
    return;
  }
  const t = clamp((x - dcv._LX)/dcv._RW * a.dur, 0, a.dur);
  S.time = Math.round(t*100)/100;
  S.playing = false;
  $('#curTime').value = S.time.toFixed(2);
  const move = ev => {
    const xx = ev.clientX - r.left;
    S.time = clamp(Math.round((xx - dcv._LX)/dcv._RW * a.dur * 100)/100, 0, a.dur);
    $('#curTime').value = S.time.toFixed(2);
  };
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); refreshUI(); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  refreshUI();
});

/* ================= presets ================= */
const PRESETS = {
  '呼吸（上下にゆっくり）': (b, a) => {
    const d = a.dur;
    setKey(a, b.id, 'y', 0, 0, 'smooth');
    setKey(a, b.id, 'y', d/2, -6, 'smooth');
    setKey(a, b.id, 'y', d, 0, 'smooth');
  },
  '首を振る（左右）': (b, a) => {
    const d = a.dur;
    setKey(a, b.id, 'rot', 0, 0, 'smooth');
    setKey(a, b.id, 'rot', d*0.25, 5, 'smooth');
    setKey(a, b.id, 'rot', d*0.75, -5, 'smooth');
    setKey(a, b.id, 'rot', d, 0, 'smooth');
  },
  'ゆらゆら回転': (b, a) => {
    const d = a.dur;
    for(let i=0;i<=4;i++) setKey(a, b.id, 'rot', d*i/4, [0,8,0,-8,0][i], 'smooth');
  },
  'うなずき（縦揺れ）': (b, a) => {
    const d = a.dur;
    setKey(a, b.id, 'rot', 0, 0, 'smooth');
    setKey(a, b.id, 'rot', d*0.15, -9, 'smooth');
    setKey(a, b.id, 'rot', d*0.35, 2, 'smooth');
    setKey(a, b.id, 'rot', d*0.6, 0, 'smooth');
  },
  '跳ねる（拡大縮小）': (b, a) => {
    const d = a.dur;
    setKey(a, b.id, 'sy', 0, 1, 'smooth');
    setKey(a, b.id, 'sy', d*0.3, 1.08, 'smooth');
    setKey(a, b.id, 'sy', d*0.6, 0.96, 'smooth');
    setKey(a, b.id, 'sy', d, 1, 'smooth');
    setKey(a, b.id, 'sx', 0, 1, 'smooth');
    setKey(a, b.id, 'sx', d*0.3, 0.95, 'smooth');
    setKey(a, b.id, 'sx', d*0.6, 1.04, 'smooth');
    setKey(a, b.id, 'sx', d, 1, 'smooth');
  }
};

/* ================= live mode ================= */
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
  if(S.mic) return true;
  try{
    const st = await navigator.mediaDevices.getUserMedia({audio:true});
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(st);
    const an = ac.createAnalyser(); an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    S.mic = { ac, an, buf };
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for(let i=0;i<buf.length;i++){ const v = (buf[i]-128)/128; sum += v*v; }
      const rms = Math.sqrt(sum/buf.length);
      S.micLevel = lerp(S.micLevel, rms, 0.4);
      requestAnimationFrame(loop);
    };
    loop();
    return true;
  }catch(e){ setStatus('マイク不可: ' + e.message); return false; }
}

function enterLive(){
  S.live = true; S.playing = true; S.time = 0;
  document.body.classList.add('live');
  if(S.proj.mouthOpen || S.proj.mouthClose) startMic();
  setTimeout(()=>{ resize(); fitView(); }, 30);
}
function exitLive(){
  S.live = false;
  document.body.classList.remove('live');
  setTimeout(()=>{ resize(); fitView(); refreshUI(); }, 30);
}

/* ================= save / load / record ================= */
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

function saveProject(){
  const copy = JSON.parse(JSON.stringify(S.proj, (k,v)=> k === 'bind' || k === '_xy' ? undefined : v));
  download((S.proj.name||'rig') + '.minispine.json', new Blob([JSON.stringify(copy)], {type:'application/json'}));
  setStatus('保存しました');
}

function loadProject(text){
  let p;
  try{ p = JSON.parse(text); }catch(e){ return alert('読めませんでした: ' + e.message); }
  S.proj = p; S.imgs = {}; S.selBone = p.bones[0].id; S.selSlot = null; S.time = 0; S.springState = {};
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
  const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  r.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    S.rec = null; $('#btnRec').classList.remove('on'); $('#btnRec').textContent = '⏺ 録画';
    download((S.proj.name||'rig') + '.webm', new Blob(chunks, {type:'video/webm'}));
    setStatus('録画を保存しました');
  };
  r.start(); S.rec = r;
  $('#btnRec').classList.add('on'); $('#btnRec').textContent = '■ 停止して保存';
  S.playing = true; S.time = 0;
  setStatus('録画中… もう一度押すと保存');
}

/* ================= wiring ================= */
$('#btnMode').onclick = () => { S.mode = S.mode === 'setup' ? 'anim' : 'setup'; S.springState = {}; refreshUI(); };
document.querySelectorAll('.tool[data-tool]').forEach(b => b.onclick = () => { S.tool = b.dataset.tool; refreshUI(); });
$('#btnAddImg').onclick = () => $('#fileImg').click();
$('#fileImg').onchange = e => { addImageFiles(e.target.files); e.target.value = ''; };
$('#btnPlay').onclick = () => { S.playing = !S.playing; if(S.playing && S.mode==='setup'){ S.mode='anim'; } refreshUI(); };
$('#btnSpring').onclick = () => { S.spring = !S.spring; S.springState = {}; refreshUI(); };
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
$('#btnHelp').onclick = () => alert(HELP);

$('#animSel').onchange = e => { S.proj.current = e.target.value; S.time = 0; refreshUI(); };
$('#btnAnimNew').onclick = () => {
  const n = prompt('新しいアニメーション名', 'anim' + (Object.keys(S.proj.anims).length+1));
  if(!n) return;
  S.proj.anims[n] = { dur:2, loop:true, tracks:{} };
  S.proj.current = n; S.time = 0; $('#animSel').dataset.n = ''; refreshUI();
};
$('#btnAnimDel').onclick = () => {
  const names = Object.keys(S.proj.anims);
  if(names.length <= 1) return alert('最後の1つは削除できません');
  if(!confirm(S.proj.current + ' を削除?')) return;
  delete S.proj.anims[S.proj.current];
  S.proj.current = Object.keys(S.proj.anims)[0];
  $('#animSel').dataset.n = ''; refreshUI();
};
$('#animDur').onchange = e => { anim().dur = Math.max(0.1, parseFloat(e.target.value)||2); refreshUI(); };
$('#animLoop').onchange = e => { anim().loop = e.target.checked; };
$('#curTime').onchange = e => { S.time = clamp(parseFloat(e.target.value)||0, 0, anim().dur); refreshUI(); };
$('#btnKey').onclick = () => {
  const b = boneById(S.selBone); const a = anim(); if(!b || !a) return;
  const p = computePose(S.proj, a, S.time)[b.id];
  const c = $('#curveSel').value;
  setKey(a, b.id, 'rot', S.time, p.v.rot - b.rot, c);
  setKey(a, b.id, 'x', S.time, p.v.x - b.x, c);
  setKey(a, b.id, 'y', S.time, p.v.y - b.y, c);
  setKey(a, b.id, 'sx', S.time, p.v.sx, c);
  setKey(a, b.id, 'sy', S.time, p.v.sy, c);
  setStatus('キーを打ちました: ' + b.name + ' @ ' + S.time.toFixed(2) + 's');
  refreshUI();
};
$('#btnKeyDel').onclick = () => {
  const a = anim(); if(!a) return;
  CH.forEach(ch => removeKey(a, S.selBone, ch, S.time));
  refreshUI();
};
$('#btnPreset').onclick = () => {
  const names = Object.keys(PRESETS);
  const pick = prompt('番号を入力:\n' + names.map((n,i)=>(i+1)+'. '+n).join('\n'), '1');
  const i = parseInt(pick,10) - 1;
  if(!(i >= 0 && i < names.length)) return;
  const b = boneById(S.selBone), a = anim();
  if(!b || !a) return;
  PRESETS[names[i]](b, a);
  S.mode = 'anim'; S.playing = true;
  setStatus(names[i] + ' を ' + b.name + ' に適用');
  refreshUI();
};

/* drag & drop */
const view = $('#view');
['dragenter','dragover'].forEach(ev => view.addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.add('on'); }));
['dragleave','drop'].forEach(ev => view.addEventListener(ev, e => { e.preventDefault(); $('#drop').classList.remove('on'); }));
view.addEventListener('drop', e => {
  const files = e.dataTransfer.files;
  if(files.length && /\.json$/i.test(files[0].name)){
    const rd = new FileReader(); rd.onload = () => loadProject(rd.result); rd.readAsText(files[0]);
  } else addImageFiles(files);
});

/* keyboard */
window.addEventListener('keydown', e => {
  if(/input|select|textarea/i.test(e.target.tagName)) return;
  const k = e.key;
  if(k === 'Escape' && S.live){ exitLive(); return; }
  if(k === 'Tab'){ e.preventDefault(); $('#btnMode').click(); return; }
  if(k === ' '){ e.preventDefault(); $('#btnPlay').click(); return; }
  if(k === '1') S.tool = 'select';
  else if(k === '2') S.tool = 'bone';
  else if(k === '3') S.tool = 'weight';
  else if(k === '4') S.tool = 'mesh';
  else if(k === 'k' || k === 'K') $('#btnKey').click();
  else if(k === 'f' || k === 'F') fitView();
  else if(k === 'Delete' && S.mode === 'setup') deleteBone(S.selBone);
  else return;
  refreshUI();
});

const HELP = `【ミニSpine 使い方】

1. パーツ用意
   髪・顔・腕・体…をレイヤー別の透過PNGで書き出して
   ドラッグ＆ドロップ（複数可）。奥のものから順に読み込むと楽。

2. セットアップ（ボーンを入れる）
   ・ツール[2 ボーン作成] で、親にしたいボーンを選んでから
     ドラッグ＝根元→先端 で新しいボーンを作る
   ・[1 選択] でボーンをドラッグ＝回転、根元の丸をドラッグ＝移動
   ・パーツをドラッグ＝移動 / Ctrl+ドラッグ＝回転 / Alt+ドラッグ＝拡大縮小

3. メッシュ＆ウェイト
   ・右パネル「メッシュ再生成」で分割数を上げると滑らかに曲がる
   ・「自動ウェイト」で一括バインド。細かい調整は[3 ウェイト]で
     選択ボーンの影響を塗る（Alt+ドラッグで消す、ホイールで半径）
     色は 赤=1.0 → 黄 → 薄いグレー=0
   ・[4 メッシュ]で頂点を個別に動かせる

4. アニメ
   ・Tab でアニメモードへ。ボーンを動かすと自動でキーが入る
   ・K でキー打ち / 下のタイムラインをクリックで時間移動
   ・「よくある動き…」で呼吸・首振りなどを一発で入れられる

5. 揺れ物理
   髪や服のボーンで「このボーンを揺らす」をON。
   [揺れ物理]ボタンで有効化。親が動くと勝手にしなる。
   「子ボーンにも同設定」で毛束の先まで一括。

6. 出力
   ・[保存] で画像込みのJSON（そのまま[開く]で復帰）
   ・[WebM録画] で動画書き出し
   ・[配信モード] でUIを消して透過表示 → OBSのブラウザソースに
     このindex.htmlを指定すればPNGTuberとして使える
     （口(開)/(閉)を割り当てるとマイク音量で口パク、
       目(開)/(閉)で自動まばたき）

ショートカット: 1/2/3/4=ツール Tab=モード Space=再生 K=キー F=フィット
ホイール=ズーム 中ボタン/右ボタン=画面移動`;

/* boot */
window.addEventListener('resize', () => { resize(); });
resize(); fitView(); refreshUI();
setStatus('PNGをドロップして開始。 ? ボタンに使い方があります');
(function loop(){ render(); requestAnimationFrame(loop); })();
