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

/* キーの あいだを つなぐ。
   まえは キーごとに「ゆっくり 止まって ゆっくり 動き出す」で つないで いたので、
   揺れの とちゅうの キーで いちいち 止まって カクカクした。
   いまは 曲線（単調 3次）で つなぐ：
     ・山や 谷、おなじ 値が つづく ところ … 止まる（ためが 残る）
     ・とちゅうの キー                   … 止まらずに すっと 通る
   行きすぎ（キーの 値を こえる）は 出ない。 */
function sample(keys, time, loopDur){
  if(!keys || !keys.length) return null;
  if(time <= keys[0].t) return keys[0].v;
  const last = keys[keys.length-1];
  if(time >= last.t) return last.v;
  let i = 0; while(i < keys.length-1 && keys[i+1].t <= time) i++;
  const a = keys[i], b = keys[i+1];
  if(a.c === 'stepped') return a.v;
  const h = b.t - a.t;
  const t = (time - a.t) / h;
  if(a.c === 'linear') return lerp(a.v, b.v, t);
  const m0 = keyTangent(keys, i, loopDur), m1 = keyTangent(keys, i + 1, loopDur);
  const t2 = t*t, t3 = t2*t;
  return (2*t3 - 3*t2 + 1) * a.v + (t3 - 2*t2 + t) * h * m0
       + (-2*t3 + 3*t2) * b.v + (t3 - t2) * h * m1;
}
/** そのキーでの 傾き（Fritsch–Carlson）。はしや 山・谷では 0 */
function keyTangent(keys, i, loopDur){
  const k = keys[i];
  let p = keys[i-1], n = keys[i+1];
  /* くり返す アニメで 最初と 最後が おなじ 値なら、つなぎ目も 止まらずに 通す
     （最初の キーの 前 ＝ 最後の 1つ前、最後の キーの 次 ＝ 最初の 次） */
  const L = keys.length, first = keys[0], last = keys[L-1];
  if(loopDur && L > 2 && Math.abs(first.t) < 1e-4 && Math.abs(last.t - loopDur) < 1e-4 && Math.abs(first.v - last.v) < 1e-6){
    if(i === 0) p = { t: keys[L-2].t - loopDur, v: keys[L-2].v, c: keys[L-2].c };
    if(i === L-1) n = { t: keys[1].t + loopDur, v: keys[1].v, c: keys[1].c };
  }
  if(!p || !n) return 0;
  if(k.c === 'stepped' || p.c === 'stepped') return 0;
  const h0 = (k.t - p.t) || 1e-6, h1 = (n.t - k.t) || 1e-6;
  const d0 = (k.v - p.v) / h0, d1 = (n.v - k.v) / h1;
  if(d0 === 0 || d1 === 0 || (d0 > 0) !== (d1 > 0)) return 0;
  // 間かくの ちがいを 考えた 重みつき 調和平均（PCHIP）
  const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
  return (w1 + w2) / (w1 / d0 + w2 / d1);
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
        const s = sample(trackOf(anim, b.id, ch, false), time, anim.loop ? anim.dur : 0);
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
    /* 1コマの 長さで 効き方が 変わらない ように、60コマ/秒 を 基準に なおす
       （120Hz の タブレットだと 倍 かたく・倍 止まりにくく なっていた） */
    const f = dt * 60;
    const damp  = Math.pow(clamp(b.damp  ?? 0.72, 0, 0.995), f);
    const stiff = 1 - Math.pow(1 - clamp(b.stiff ?? 0.35, 0.001, 1), f);
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
    let delta = Math.atan2(s.y-oy, s.x-ox)*180/Math.PI - M.rotOf(p.world);
    while(delta > 180) delta -= 360; while(delta < -180) delta += 360;
    /* 振れすぎ ない ように、やわらかく 頭打ち に する（limit 度 まで）。
       これが ないと 速く 動かした とき 髪が 根もとから 扉の ように 開く */
    const lim = b.limit ?? 30;
    if(lim > 0 && lim < 180){
      const c = lim * Math.tanh(delta / lim);
      if(Math.abs(c - delta) > 1e-3){
        delta = c;
        const a = (M.rotOf(p.world) + delta) * Math.PI / 180;
        const nx = ox + Math.cos(a)*L, ny = oy + Math.sin(a)*L;
        // 前の 位置も 同じだけ ずらす（ずらした ぶんを 速さに しない。しないと 120Hz で あばれる）
        s.px += nx - s.x; s.py += ny - s.y;
        s.x = nx; s.y = ny;
      }
    }
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
    /* 切る 向きを ます目ごとに 入れかえる（市松）。同じ 向きだと
       ななめが 1本の 長い すじに つながって 見える */
    if((gx+gy) & 1) tris.push(a,b,cc, a,cc,d);
    else tris.push(a,b,d, b,cc,d);
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

/* ---------------- textured triangle ----------------
   三角の つぎ目を 出さない（アニメ工房の puppet.js と 同じ やり方）。
   ・へりを 外へ 平行に ずらして ふくらませる。量は「画面の ドット」で きめる
     （絵の ドットで きめると ズームで 効いたり 効かなかったり する）
   ・いったん 別紙に こさ100%で 組んで、さいごに 1回だけ こさを かけて 写す
     （ふくらんで 重なった ところが 2回 ぬられて こい すじに ならない） */
function drawTri(ctx, img, x0,y0,x1,y1,x2,y2, u0,v0,u1,v1,u2,v2, EX){
  const area2 = (x1-x0)*(y2-y0) - (x2-x0)*(y1-y0);
  if(area2 !== 0 && EX > 0){
    const sgn = area2 > 0 ? 1 : -1;
    const px = [x0,x1,x2], py = [y0,y1,y2];
    const nrm = i => { const j = (i+1)%3, dx = px[j]-px[i], dy = py[j]-py[i], L = Math.hypot(dx,dy)||1;
                       return { x: sgn*dy/L, y: -sgn*dx/L }; };
    const n = [nrm(0), nrm(1), nrm(2)], out = [];
    for(let i=0;i<3;i++){
      const a = n[(i+2)%3], b = n[i];
      let bx = a.x+b.x, by = a.y+b.y; const L = Math.hypot(bx,by);
      if(L < 1e-6){ out.push(px[i], py[i]); continue; }
      bx /= L; by /= L;
      const k = Math.min(3, 1/Math.max(0.34, bx*a.x + by*a.y));   // とがった 角は 遠くへ（3ばい まで）
      out.push(px[i] + bx*EX*k, py[i] + by*EX*k);
    }
    [x0,y0,x1,y1,x2,y2] = out;
  }
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

/* 別紙（大きさごとに 使いまわす） */
const _sheets = [];
function meshSheet(w, h){
  for(const c of _sheets) if(c.width === w && c.height === h) return c;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  _sheets.unshift(c); if(_sheets.length > 2) _sheets.length = 2;
  return c;
}

const _sheets2 = [];
function meshSheet2(w, h){
  for(const c of _sheets2) if(c.width === w && c.height === h) return c;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  _sheets2.unshift(c); if(_sheets2.length > 2) _sheets2.length = 2;
  return c;
}

function drawSlot(ctx, slot, imgEl, xy){
  const t = slot.tris, v = slot.verts, cv0 = ctx.canvas;
  const m0 = ctx.getTransform();
  const scale = Math.sqrt(Math.abs(m0.a*m0.d - m0.b*m0.c)) || 1;
  // 画面が ひきのばして 出す ぶん（紙が 実際より あらい とき）は 多めに
  let up = 1;
  const cw = cv0.clientWidth;
  if(cw > 0) up = Math.max(1, Math.min(3, cw*(devicePixelRatio||1)/cv0.width));
  const ex = Math.min(6, Math.max(0.5, 0.6*up)) / scale;

  /* 別紙は 画面と 同じ 大きさ だが、ぬるのも 写すのも そのパーツが いる 四角だけ。
     ぜんぶ 写すと パーツの 数だけ 画面まるごとの コピーに なって おもい */
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(let i = 0; i < v.length; i++){
    const X = xy[i*2], Y = xy[i*2+1];
    const sx = m0.a*X + m0.c*Y + m0.e, sy = m0.b*X + m0.d*Y + m0.f;
    if(sx < x0) x0 = sx; if(sx > x1) x1 = sx; if(sy < y0) y0 = sy; if(sy > y1) y1 = sy;
  }
  const pad = 8;
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
  x1 = Math.min(cv0.width, Math.ceil(x1 + pad)); y1 = Math.min(cv0.height, Math.ceil(y1 + pad));
  const bw = x1 - x0, bh = y1 - y0;
  if(bw <= 0 || bh <= 0) return;

  /* つなぎ方（アニメ工房の puppet.js 'add' と おなじ）
     ふくらませて 上から ぬると、すけた 絵（ほお・かげ）では 重なった ところが
     2回 ぬられて 格子の すじに なる。
     ① ふくらませずに 足し算（lighter）で つなぐ … すけ具合が ぴったり つながる
     ② ふくらませて ふつうに ぬった 色を「すけ具合は そのまま」で かぶせる（source-atop）
        … 足し算で 角に 出る 明るい 点を 消す */
  const paint = (gg, e) => {
    for(let i=0;i<t.length;i+=3){
      const i0=t[i], i1=t[i+1], i2=t[i+2];
      drawTri(gg, imgEl,
        xy[i0*2],xy[i0*2+1], xy[i1*2],xy[i1*2+1], xy[i2*2],xy[i2*2+1],
        v[i0].u,v[i0].v, v[i1].u,v[i1].v, v[i2].u,v[i2].v, e);
    }
  };
  const sc = meshSheet(cv0.width, cv0.height), g = sc.getContext('2d');
  g.setTransform(1,0,0,1,0,0); g.clearRect(x0, y0, bw, bh);
  g.setTransform(m0.a,m0.b,m0.c,m0.d,m0.e,m0.f);
  g.globalCompositeOperation = 'lighter';
  paint(g, 0);
  const sc2 = meshSheet2(cv0.width, cv0.height), g2 = sc2.getContext('2d');
  g2.setTransform(1,0,0,1,0,0); g2.clearRect(x0, y0, bw, bh);
  g2.setTransform(m0.a,m0.b,m0.c,m0.d,m0.e,m0.f);
  paint(g2, ex);
  g.setTransform(1,0,0,1,0,0);
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(sc2, x0, y0, bw, bh, x0, y0, bw, bh);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha *= (slot.alpha ?? 1);
  ctx.drawImage(sc, x0, y0, bw, bh, x0, y0, bw, bh);
  ctx.restore();
}

/* むかしの あみ（ぜんぶ 同じ 向きに 切った もの）を 市松に 切り直す。
   点は そのまま なので ウェイトは こわれない */
function checkerTris(slot){
  const t = slot.tris, v = slot.verts;
  if(!t || t.length % 6) return false;
  const out = []; let changed = false;
  for(let i=0;i<t.length;i+=6){
    const [a,b,c, a2,c2,d] = t.slice(i, i+6);
    const A=v[a], B=v[b], D=v[d];
    const ok = a === a2 && c === c2 && A && B && D && B.u !== A.u && D.v !== A.v;
    if(!ok){ out.push(...t.slice(i, i+6)); continue; }
    const gx = Math.round(A.u/(B.u-A.u)), gy = Math.round(A.v/(D.v-A.v));
    if((gx+gy) & 1) out.push(a,b,c, a,c,d);
    else { out.push(a,b,d, b,c,d); changed = true; }
  }
  if(changed) slot.tris = out;
  return changed;
}
