/* MiniSpine core : math / skeleton / mesh skinning / spring physics / renderer
   classic script (no modules) so file:// works. */

/* ---------------- matrix ---------------- */
const M = {
  ident(){ return {a:1,b:0,c:0,d:1,tx:0,ty:0}; },
  mul(p,q){
    return {
      a: p.a*q.a + p.c*q.b,
      b: p.b*q.a + p.d*q.b,
      c: p.a*q.c + p.c*q.d,
      d: p.b*q.c + p.d*q.d,
      tx: p.a*q.tx + p.c*q.ty + p.tx,
      ty: p.b*q.tx + p.d*q.ty + p.ty
    };
  },
  /* Spine と同じ順で 平行移動→回転→シアー→スケール */
  fromTRS(x,y,rotDeg,sx,sy,shearDeg){
    const r = rotDeg*Math.PI/180, cs = Math.cos(r), sn = Math.sin(r);
    const sh = ((shearDeg||0) + rotDeg)*Math.PI/180;
    return { a:cs*sx, b:sn*sx, c:-Math.sin(sh)*sy, d:Math.cos(sh)*sy, tx:x, ty:y };
  },
  apply(m,x,y){ return { x:m.a*x + m.c*y + m.tx, y:m.b*x + m.d*y + m.ty }; },
  inv(m){
    const det = m.a*m.d - m.b*m.c, id = det ? 1/det : 0;
    return {
      a: m.d*id, b:-m.b*id, c:-m.c*id, d: m.a*id,
      tx: (m.c*m.ty - m.d*m.tx)*id,
      ty: (m.b*m.tx - m.a*m.ty)*id
    };
  },
  rotOf(m){ return Math.atan2(m.b, m.a)*180/Math.PI; },
  /* ワールド行列を x/y/rot/sx/sy/shear に分解（コンペンセイト用） */
  decompose(m){
    const rot = Math.atan2(m.b, m.a)*180/Math.PI;
    const sx = Math.hypot(m.a, m.b);
    const sy = Math.hypot(m.c, m.d);
    let shear = Math.atan2(-m.c, m.d)*180/Math.PI - rot;
    while(shear > 180) shear -= 360; while(shear < -180) shear += 360;
    const det = m.a*m.d - m.b*m.c;
    return { x:m.tx, y:m.ty, rot, sx, sy:(det < 0 ? -sy : sy), shear };
  },
  scaleOf(m){ return Math.hypot(m.a, m.b); }
};

const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
const lerp  = (a,b,t)=> a+(b-a)*t;
const uid   = (p)=> p + '_' + Math.random().toString(36).slice(2,9);

/* ---------------- project model ---------------- */
function newProject(){
  return {
    ver: 1,
    name: 'untitled',
    canvas: { w: 1080, h: 1350, bg: '#FBFAEC' },
    images: {},
    bones: [ { id:'root', name:'root', parent:null, x:540, y:1200, rot:-90, sx:1, sy:1, shear:0, len:120,
               spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1 } ],
    slots: [],
    iks: [],
    anims: { 'idle': { dur: 2.0, loop:true, tracks:{} } },
    current: 'idle',
    mouthOpen:null, mouthClose:null, eyeOpen:null, eyeClose:null
  };
}

function newSlot(imgId, img){
  return {
    id: uid('slot'),
    name: (img.name||'part').replace(/\.[a-z0-9]+$/i,''),
    image: imgId, visible:true, alpha:1, bone:'root',
    verts: [], tris: [], bound:false
  };
}

/* ---------------- animation ---------------- */
const CH = ['rot','x','y','sx','sy','shear'];
const CH_LABEL = { rot:'回転', x:'X', y:'Y', sx:'スケールX', sy:'スケールY', shear:'シアー' };
const CH_DEFAULT = { rot:0, x:0, y:0, sx:1, sy:1, shear:0 };
const isScaleCh = ch => ch === 'sx' || ch === 'sy';

function trackOf(anim, boneId, ch, create){
  let t = anim.tracks[boneId];
  if(!t){ if(!create) return null; t = anim.tracks[boneId] = {}; }
  let k = t[ch];
  if(!k){ if(!create) return null; k = t[ch] = []; }
  return k;
}

function setKey(anim, boneId, ch, time, value, curve){
  const keys = trackOf(anim, boneId, ch, true);
  const i = keys.findIndex(k=> Math.abs(k.t-time) < 1e-4);
  if(i>=0){ keys[i].v = value; if(curve) keys[i].c = curve; }
  else { keys.push({t:time, v:value, c:curve||'smooth'}); keys.sort((a,b)=>a.t-b.t); }
}

function removeKey(anim, boneId, ch, time){
  const keys = trackOf(anim, boneId, ch, false); if(!keys) return;
  const i = keys.findIndex(k=> Math.abs(k.t-time) < 1e-4);
  if(i>=0) keys.splice(i,1);
}

function sample(keys, time){
  if(!keys || !keys.length) return null;
  if(time <= keys[0].t) return keys[0].v;
  const last = keys[keys.length-1];
  if(time >= last.t) return last.v;
  let i = 0; while(i < keys.length-1 && keys[i+1].t <= time) i++;
  const a = keys[i], b = keys[i+1];
  if(a.c === 'stepped') return a.v;
  let t = (time - a.t) / (b.t - a.t);
  if(a.c !== 'linear') t = t*t*(3-2*t);
  return lerp(a.v, b.v, t);
}

function topoBones(proj){
  const byId = {}; proj.bones.forEach(b=> byId[b.id]=b);
  const seen = {}, out = [];
  const visit = (b)=>{
    if(!b || seen[b.id]) return; seen[b.id]=1;
    if(b.parent && byId[b.parent]) visit(byId[b.parent]);
    out.push(b);
  };
  proj.bones.forEach(visit);
  return out;
}

function childMap(proj){
  const kids = {};
  proj.bones.forEach(b=>{ if(b.parent){ (kids[b.parent]=kids[b.parent]||[]).push(b.id); } });
  return kids;
}

/* pose: {boneId:{world, v, len, bone}}  override = {boneId:{rot,x,y,sx,sy}} */
function computePose(proj, anim, time, override){
  const out = {};
  for(const b of topoBones(proj)){
    const o = override && override[b.id];
    const v = { rot:b.rot, x:b.x, y:b.y, sx:b.sx, sy:b.sy, shear:b.shear||0 };
    if(anim){
      for(const ch of CH){
        const s = sample(trackOf(anim, b.id, ch, false), time);
        if(s !== null && s !== undefined){
          v[ch] = isScaleCh(ch) ? s : ((b[ch]||0) + s);
        }
      }
    }
    if(o) for(const ch of CH) if(o[ch] !== undefined) v[ch] = o[ch];
    const local = M.fromTRS(v.x, v.y, v.rot, v.sx, v.sy, v.shear);
    const pw = (b.parent && out[b.parent]) ? out[b.parent].world : M.ident();
    out[b.id] = { world: M.mul(pw, local), v, len:b.len, bone:b };
  }
  return out;
}

/* ---------------- IK制約 ----------------
   1ボーン: ターゲットの方を向く / 2ボーン: ひじ・ひざを曲げて届かせる  */
function newIK(name, boneIds, targetId){
  return { id: uid('ik'), name: name || 'ik', bones: boneIds, target: targetId,
           mix: 1, bendPositive: true };
}

function applyIKs(proj, pose){
  if(!proj.iks || !proj.iks.length) return;
  const kids = childMap(proj);
  for(const ik of proj.iks){
    const tp = pose[ik.target]; if(!tp) continue;
    const mix = clamp(ik.mix ?? 1, 0, 1);
    if(mix <= 0) continue;
    const tx = tp.world.tx, ty = tp.world.ty;
    if(ik.bones.length === 1){
      const p = pose[ik.bones[0]]; if(!p) continue;
      const ox = p.world.tx, oy = p.world.ty;
      let d = Math.atan2(ty-oy, tx-ox)*180/Math.PI - M.rotOf(p.world);
      while(d > 180) d -= 360; while(d < -180) d += 360;
      rotateSubtree(pose, kids, ik.bones[0], d*mix, ox, oy);
    } else if(ik.bones.length >= 2){
      solve2Bone(pose, kids, ik.bones[0], ik.bones[1], tx, ty, ik.bendPositive, mix);
    }
  }
}

function solve2Bone(pose, kids, pId, cId, tx, ty, bendPositive, mix){
  const P = pose[pId], C = pose[cId];
  if(!P || !C) return;
  const ox = P.world.tx, oy = P.world.ty;
  const l1 = Math.hypot(C.world.tx - ox, C.world.ty - oy);
  const tip = M.apply(C.world, C.bone.len, 0);
  const l2 = Math.hypot(tip.x - C.world.tx, tip.y - C.world.ty);
  if(l1 < 1e-4 || l2 < 1e-4) return;

  let dx = tx - ox, dy = ty - oy;
  let dist = Math.hypot(dx, dy);
  dist = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const base = Math.atan2(dy, dx);
  // 余弦定理で親の開き角
  const cosA = clamp((l1*l1 + dist*dist - l2*l2) / (2*l1*dist), -1, 1);
  const a = Math.acos(cosA) * (bendPositive ? 1 : -1);
  const wantP = (base + a) * 180/Math.PI;

  let dP = wantP - M.rotOf(P.world);
  while(dP > 180) dP -= 360; while(dP < -180) dP += 360;
  rotateSubtree(pose, kids, pId, dP*mix, ox, oy);

  // 親を回した後の子から、ターゲットへ向ける
  const cx = C.world.tx, cy = C.world.ty;
  let dC = Math.atan2(ty - cy, tx - cx)*180/Math.PI - M.rotOf(C.world);
  while(dC > 180) dC -= 360; while(dC < -180) dC += 360;
  rotateSubtree(pose, kids, cId, dC*mix, cx, cy);
}

/* ---------------- spring physics ---------------- */
function applySprings(proj, pose, dt, state, enabled){
  if(!enabled){ for(const k in state) delete state[k]; return; }
  dt = clamp(dt, 1/240, 1/20);
  const kids = childMap(proj);
  for(const b of topoBones(proj)){
    if(!b.spring) continue;
    const p = pose[b.id]; if(!p) continue;
    const ox = p.world.tx, oy = p.world.ty;
    const tip = M.apply(p.world, b.len, 0);
    let s = state[b.id];
    if(!s){ state[b.id] = { x:tip.x, y:tip.y, px:tip.x, py:tip.y }; continue; }
    const damp  = clamp(b.damp  ?? 0.72, 0, 0.995);
    const stiff = clamp(b.stiff ?? 0.35, 0.001, 1);
    const grav  = (b.grav ?? 0) * 1200;
    const inert = b.inertia ?? 1;
    const vx = (s.x - s.px) * damp * inert;
    const vy = (s.y - s.py) * damp * inert;
    s.px = s.x; s.py = s.y;
    s.x += vx;
    s.y += vy + grav*dt*dt;
    s.x += (tip.x - s.x) * stiff;
    s.y += (tip.y - s.y) * stiff;
    let dx = s.x-ox, dy = s.y-oy, d = Math.hypot(dx,dy) || 1;
    const L = b.len * (M.scaleOf(p.world) || 1);
    s.x = ox + dx/d*L; s.y = oy + dy/d*L;
    const delta = Math.atan2(s.y-oy, s.x-ox)*180/Math.PI - M.rotOf(p.world);
    if(Math.abs(delta) > 1e-4) rotateSubtree(pose, kids, b.id, delta, ox, oy);
  }
}

function rotateSubtree(pose, kids, boneId, deltaDeg, ox, oy){
  const r = deltaDeg*Math.PI/180, cs = Math.cos(r), sn = Math.sin(r);
  const R = { a:cs, b:sn, c:-sn, d:cs,
              tx: ox - (cs*ox - sn*oy),
              ty: oy - (sn*ox + cs*oy) };
  const stack = [boneId];
  while(stack.length){
    const id = stack.pop();
    if(pose[id]) pose[id].world = M.mul(R, pose[id].world);
    (kids[id]||[]).forEach(c=> stack.push(c));
  }
}

/* ---------------- skinning ---------------- */
function invCache(setupPose){
  const c = {};
  for(const id in setupPose) c[id] = M.inv(setupPose[id].world);
  return c;
}

function bindSlot(slot, setupPose, invs){
  invs = invs || invCache(setupPose);
  for(const v of slot.verts){
    const src = (v.w && v.w.length) ? v.w : [{b:slot.bone, w:1}];
    v.bind = src.map(w=>{
      const li = invs[w.b]; if(!li) return null;
      return { b:w.b, w:w.w, lx: li.a*v.x + li.c*v.y + li.tx, ly: li.b*v.x + li.d*v.y + li.ty };
    }).filter(Boolean);
  }
  slot.bound = true;
}

function deformSlot(slot, pose, out){
  const n = slot.verts.length;
  for(let i=0;i<n;i++){
    const v = slot.verts[i];
    const bl = v.bind;
    let x=0, y=0, tw=0;
    if(bl) for(let j=0;j<bl.length;j++){
      const b = bl[j], p = pose[b.b];
      if(!p) continue;
      const m = p.world;
      x += (m.a*b.lx + m.c*b.ly + m.tx) * b.w;
      y += (m.b*b.lx + m.d*b.ly + m.ty) * b.w;
      tw += b.w;
    }
    if(tw > 1e-4){ out[i*2] = x/tw; out[i*2+1] = y/tw; }
    else { out[i*2] = v.x; out[i*2+1] = v.y; }
  }
}

/* ---------------- mesh generation ---------------- */
function buildGridMesh(imgEl, cols, rows, placeM){
  // HTMLImageElement でも canvas でも受け取れる（PSDレイヤーは canvas で来る）
  const w = imgEl.naturalWidth || imgEl.width, h = imgEl.naturalHeight || imgEl.height;
  const SW = Math.min(w, 220), SH = Math.max(1, Math.round(h * SW / w));
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const c = cv.getContext('2d', {willReadFrequently:true});
  c.drawImage(imgEl, 0, 0, SW, SH);
  const data = c.getImageData(0,0,SW,SH).data;
  const opaque = (u,v)=>{
    const px = clamp(Math.floor(u*SW),0,SW-1), py = clamp(Math.floor(v*SH),0,SH-1);
    return data[(py*SW+px)*4+3] > 8;
  };
  const cellInk = (cx,cy)=>{
    for(let sy=0; sy<=4; sy++) for(let sx=0; sx<=4; sx++)
      if(opaque((cx+sx/4)/cols, (cy+sy/4)/rows)) return true;
    return false;
  };
  const map = new Map(), verts = [], tris = [];
  const vi = (gx,gy)=>{
    const key = gx+','+gy;
    if(map.has(key)) return map.get(key);
    const u = gx/cols*w, v = gy/rows*h;
    const p = placeM ? M.apply(placeM, u, v) : {x:u,y:v};
    verts.push({ x:p.x, y:p.y, u, v, w:[] });
    map.set(key, verts.length-1);
    return verts.length-1;
  };
  for(let gy=0; gy<rows; gy++) for(let gx=0; gx<cols; gx++){
    if(!cellInk(gx,gy)) continue;
    const a=vi(gx,gy), b=vi(gx+1,gy), cc=vi(gx+1,gy+1), d=vi(gx,gy+1);
    tris.push(a,b,cc, a,cc,d);
  }
  if(!tris.length){
    const a=vi(0,0), b=vi(cols,0), cc=vi(cols,rows), d=vi(0,rows);
    tris.push(a,b,cc, a,cc,d);
  }
  return { verts, tris };
}

/* ---------------- auto weights ---------------- */
function distToSeg(px,py, ax,ay, bx,by){
  const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
  let t = L ? ((px-ax)*dx + (py-ay)*dy)/L : 0;
  t = clamp(t,0,1);
  return Math.hypot(px-(ax+dx*t), py-(ay+dy*t));
}

function boneSegments(proj, setupPose, only){
  const segs = [];
  for(const b of proj.bones){
    if(only && only.indexOf(b.id) < 0) continue;
    const p = setupPose[b.id]; if(!p) continue;
    const e = M.apply(p.world, b.len, 0);
    segs.push({ id:b.id, ax:p.world.tx, ay:p.world.ty, bx:e.x, by:e.y });
  }
  return segs;
}

function autoWeights(proj, slot, setupPose, opts){
  opts = opts || {};
  const maxB = opts.maxBones || 4;
  const falloff = opts.falloff || 2.5;
  const segs = boneSegments(proj, setupPose, opts.only);
  if(!segs.length) return;
  for(const v of slot.verts){
    const list = segs.map(s=>({ id:s.id, d: distToSeg(v.x,v.y, s.ax,s.ay,s.bx,s.by) }));
    list.sort((p,q)=> p.d-q.d);
    const use = list.slice(0, maxB);
    let tw = 0;
    const ws = use.map(u=>{ const w = 1/Math.pow(Math.max(u.d,1), falloff); tw += w; return {b:u.id, w}; });
    let arr = ws.map(x=>({ b:x.b, w:x.w/tw })).filter(x=> x.w > 0.02);
    const s = arr.reduce((a,x)=>a+x.w,0) || 1;
    arr.forEach(x=> x.w /= s);
    v.w = arr;
  }
}

/* paint a single bone's weight onto verts near (wx,wy) */
function paintWeight(slot, boneId, wx, wy, radius, amount){
  const r2 = radius*radius;
  let touched = 0;
  for(const v of slot.verts){
    const dx = v.x-wx, dy = v.y-wy, d2 = dx*dx+dy*dy;
    if(d2 > r2) continue;
    const fall = 1 - Math.sqrt(d2)/radius;
    const delta = amount * fall;
    let e = (v.w||[]).find(x=> x.b === boneId);
    if(!e){ if(delta <= 0) continue; e = {b:boneId, w:0}; (v.w = v.w||[]).push(e); }
    e.w = clamp(e.w + delta, 0, 1);
    // renormalize the rest
    const others = v.w.filter(x=> x !== e);
    const rest = 1 - e.w;
    const os = others.reduce((a,x)=>a+x.w,0);
    if(os > 1e-6) others.forEach(x=> x.w = x.w/os*rest);
    else if(others.length) others.forEach(x=> x.w = rest/others.length);
    v.w = v.w.filter(x=> x.w > 0.005);
    const s = v.w.reduce((a,x)=>a+x.w,0) || 1;
    v.w.forEach(x=> x.w /= s);
    touched++;
  }
  return touched;
}

/* ---------------- textured triangle ---------------- */
function drawTri(ctx, img, x0,y0,x1,y1,x2,y2, u0,v0,u1,v1,u2,v2){
  const cx=(x0+x1+x2)/3, cy=(y0+y1+y2)/3, EX=0.4;
  let d;
  d = Math.hypot(x0-cx,y0-cy)||1; x0 += (x0-cx)/d*EX; y0 += (y0-cy)/d*EX;
  d = Math.hypot(x1-cx,y1-cy)||1; x1 += (x1-cx)/d*EX; y1 += (y1-cy)/d*EX;
  d = Math.hypot(x2-cx,y2-cy)||1; x2 += (x2-cx)/d*EX; y2 += (y2-cy)/d*EX;
  const det = (u1-u0)*(v2-v0) - (u2-u0)*(v1-v0);
  if(!det) return;
  const a = ((x1-x0)*(v2-v0) - (x2-x0)*(v1-v0))/det;
  const b = ((y1-y0)*(v2-v0) - (y2-y0)*(v1-v0))/det;
  const c = ((x2-x0)*(u1-u0) - (x1-x0)*(u2-u0))/det;
  const e = ((y2-y0)*(u1-u0) - (y1-y0)*(u2-u0))/det;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2); ctx.closePath(); ctx.clip();
  ctx.transform(a,b,c,e, x0 - a*u0 - c*v0, y0 - b*u0 - e*v0);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawSlot(ctx, slot, imgEl, xy){
  const t = slot.tris, v = slot.verts;
  ctx.globalAlpha = slot.alpha ?? 1;
  for(let i=0;i<t.length;i+=3){
    const i0=t[i], i1=t[i+1], i2=t[i+2];
    drawTri(ctx, imgEl,
      xy[i0*2],xy[i0*2+1], xy[i1*2],xy[i1*2+1], xy[i2*2],xy[i2*2+1],
      v[i0].u,v[i0].v, v[i1].u,v[i1].v, v[i2].u,v[i2].v);
  }
  ctx.globalAlpha = 1;
}
