/* ミニSpine — くっつける（接合部を 指定する）
   2つの 部品が 触れて いる 点を 1つ 決めると、どんな 動きを つけても その 点どうしが 離れない。
   メガネの 軸と 指先、帽子と 手、など。
     ついて いく 側（follower）… その 部品 専用の 骨を つくって、ずれる 分だけ 位置を 動かす（向きは そのまま）
     くっつく 先（target）     … 触れる 点に いちばん 近い 骨
   S.proj.pins = [{ id, name, follower:骨id, target:骨id, fl:{x,y}, tl:{x,y}, mix }]
   fl・tl は それぞれの 骨の 中での 点（動かす まえの 形で 計算） */
'use strict';

const PINS = () => (S.proj.pins = S.proj.pins || []);

/* ---------- 毎コマ：IK の あとで 点を あわせる ---------- */
let PIN_POSE = null, PIN_KIDS = null;
/** 中心 c で ang 回して、(ux,uy) の 向きに sc 倍 のばし、c を to へ。fid と その子に かける */
function solveAround(fid, c, ang, sc, ux, uy, to){
  const co = Math.cos(ang), sn = Math.sin(ang);
  const S2 = { a: 1 + (sc - 1) * ux * ux, b: (sc - 1) * ux * uy, c: (sc - 1) * ux * uy, d: 1 + (sc - 1) * uy * uy };
  const R = { a: co, b: sn, c: -sn, d: co };
  const L = { a: S2.a * R.a + S2.c * R.b, b: S2.b * R.a + S2.d * R.b, c: S2.a * R.c + S2.c * R.d, d: S2.b * R.c + S2.d * R.d };
  const A = { a: L.a, b: L.b, c: L.c, d: L.d, tx: to.x - (L.a * c.x + L.c * c.y), ty: to.y - (L.b * c.x + L.d * c.y) };
  const st = [fid];
  while(st.length){
    const id = st.pop(); const q = PIN_POSE[id];
    if(q) q.world = M.mul(A, q.world);
    (PIN_KIDS[id] || []).forEach(k => st.push(k));
  }
}
/* くっつく 先は 骨では なく「絵の その 点」を おう。
   指の 絵は いくつもの 骨に まざって 動く ことが あり、
   いちばん 近い 骨だけ 見て いると 絵と ずれて しまう。
   p.tri = { s:部品id, i,j,k:頂点, a,b,c:まぜ方 }（はじめて つかう ときに 決めて おぼえる） */
function vtx(sl, i, pose){
  const v = sl.verts[i], bl = v.bind;
  let x = 0, y = 0, t = 0;
  if(bl) for(const b of bl){ const q = pose[b.b]; if(!q) continue; const m = q.world;
    x += (m.a * b.lx + m.c * b.ly + m.tx) * b.w; y += (m.b * b.lx + m.d * b.ly + m.ty) * b.w; t += b.w; }
  return t > 1e-4 ? { x: x / t, y: y / t } : { x: v.x, y: v.y };
}
function findTri(sl, J){
  const V = sl.verts, T = sl.tris; let best = null, bd = 1e18;
  for(let n = 0; n < T.length; n += 3){
    const A = V[T[n]], B = V[T[n + 1]], C = V[T[n + 2]];
    const det = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y); if(Math.abs(det) < 1e-9) continue;
    const a = ((B.y - C.y) * (J.x - C.x) + (C.x - B.x) * (J.y - C.y)) / det;
    const b = ((C.y - A.y) * (J.x - C.x) + (A.x - C.x) * (J.y - C.y)) / det;
    const c = 1 - a - b;
    const out = Math.max(0, -a) + Math.max(0, -b) + Math.max(0, -c);   // 0 ＝ 中
    if(out < bd){ bd = out; best = { s: sl.id, i: T[n], j: T[n + 1], k: T[n + 2], a, b, c }; if(out === 0) break; }
  }
  return best ? { tri: best, out: bd } : null;
}
function meshPoint(p, pose){
  if(p.tri){ const o = S.proj.slots.find(q => q.id === p.tri.s); if(!o || o.verts.length !== p.tri.n) p.tri = null; }   // 網を 作り直したら 決め直す
  if(p.tri === false) return null;
  if(!p.tri){
    try{
      const J = M.apply(setupPose()[p.target].world, p.tl.x, p.tl.y);
      const cand = p.tslot ? S.proj.slots.filter(o => o.id === p.tslot)
        : S.proj.slots.filter(o => o.visible && !o.lidCover && o.verts.length && slotBones(o).ids.includes(p.target));
      let pick = null;
      cand.forEach(o => { const r = findTri(o, J); if(r && (!pick || r.out < pick.out)) pick = r; });
      p.tri = pick && pick.out < 0.5 ? pick.tri : false;
      if(p.tri) p.tri.n = S.proj.slots.find(o => o.id === p.tri.s).verts.length;
    }catch(_){ p.tri = false; }
    if(!p.tri) return null;
  }
  const sl = S.proj.slots.find(o => o.id === p.tri.s); if(!sl || !sl.verts[p.tri.k]) return null;
  const A = vtx(sl, p.tri.i, pose), B = vtx(sl, p.tri.j, pose), C = vtx(sl, p.tri.k, pose);
  return { x: A.x * p.tri.a + B.x * p.tri.b + C.x * p.tri.c, y: A.y * p.tri.a + B.y * p.tri.b + C.y * p.tri.c };
}

/** 付け根（ついて いく 骨の 中での 点）。はじめて つかう ときに 部品の 形から 決めて おぼえる */
function pinAnchor(p){
  if(p.al) return p.al;
  try{
    const sp = setupPose(), F0 = sp[p.follower]; if(!F0) return null;
    const J = M.apply(F0.world, p.fl.x, p.fl.y);
    const sl = S.proj.slots.find(o => o.id === p.slot) || S.proj.slots.find(o => slotBones(o).ids.includes(p.follower));
    if(!sl) return null;
    const bx = slotBox(sl);
    let best = null, bd = -1;
    [[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x0, bx.y1], [bx.x1, bx.y1], [bx.cx, bx.y0], [bx.cx, bx.y1], [bx.x0, bx.cy], [bx.x1, bx.cy]].forEach(([x, y]) => {
      const d = Math.hypot(x - J.x, y - J.y); if(d > bd){ bd = d; best = { x, y }; }
    });
    // 角まで いくと 長すぎる ので、くっつく 点と 遠い 点の あいだ 8割
    const w = { x: J.x + (best.x - J.x) * 0.8, y: J.y + (best.y - J.y) * 0.8 };
    p.al = M.apply(M.inv(F0.world), w.x, w.y);
    return p.al;
  }catch(_){ return null; }
}
function applyPins(proj, pose){
  const pins = proj.pins; if(!pins || !pins.length) return;
  const kids = childMap(proj);
  PIN_POSE = pose; PIN_KIDS = kids;
  const shift = (root, dx, dy) => {
    const st = [root];
    while(st.length){
      const id = st.pop(); const q = pose[id];
      if(q) q.world = { a:q.world.a, b:q.world.b, c:q.world.c, d:q.world.d, tx:q.world.tx + dx, ty:q.world.ty + dy };
      (kids[id] || []).forEach(k => st.push(k));
    }
  };
  // ついて いく 骨ごとに まとめる（1つの 部品に 2か所 くっつける ことが ある）
  const by = {};
  pins.forEach(p => { if(pose[p.follower] && pose[p.target] && p.mix > 0) (by[p.follower] = by[p.follower] || []).push(p); });
  for(const fid in by){
    const list = by[fid];
    const F = () => pose[fid].world;
    const fw = p => M.apply(F(), p.fl.x, p.fl.y), tw = p => meshPoint(p, pose) || M.apply(pose[p.target].world, p.tl.x, p.tl.y);
    if(list.length === 1){
      const p = list[0], a = fw(p), b = tw(p);
      const al = p.stretch !== false ? pinAnchor(p) : null;
      if(!al){ shift(fid, (b.x - a.x) * p.mix, (b.y - a.y) * p.mix); continue; }
      /* のばして くっつける: 部品の 付け根（くっつく 点から いちばん 遠い ところ）は
         そのまま、くっつく 点が 先へ とどく ように 回して 軸の 向きに のばす */
      const o = M.apply(F(), al.x, al.y);
      const lf = Math.hypot(a.x - o.x, a.y - o.y);
      if(lf < 1){ shift(fid, (b.x - a.x) * p.mix, (b.y - a.y) * p.mix); continue; }
      const tx = a.x + (b.x - a.x) * p.mix, ty = a.y + (b.y - a.y) * p.mix;
      let ang = Math.atan2(ty - o.y, tx - o.x) - Math.atan2(a.y - o.y, a.x - o.x);
      while(ang > Math.PI) ang -= Math.PI * 2; while(ang < -Math.PI) ang += Math.PI * 2;
      const sc = Math.max(0.4, Math.min(2.5, Math.hypot(tx - o.x, ty - o.y) / lf));
      const base = Math.atan2(a.y - o.y, a.x - o.x) + ang;
      solveAround(fid, o, ang, sc, Math.cos(base), Math.sin(base), o);
      continue;
    }
    /* 2か所: 片方を 支点（顔・頭がわ）に して ぴったり とめ、
       もう片方へ むけて 回し、長さの ちがいは 軸の 向きに のばして あわせる（0.4〜2.5倍）。
       支点は くっつく 先が ついて いく 骨の 親すじ（頭 など）に ある ほう */
    const isAnc = p => { let b = boneById(fid); while(b){ if(b.id === p.target) return true; b = boneById(b.parent); } return false; };
    let p1 = list.find(isAnc) || list[0];
    const p2 = list.find(p => p !== p1);
    const f1 = fw(p1), f2 = fw(p2), t1 = tw(p1), t2 = tw(p2);
    const m2 = p2.mix;
    // A ＝ t1 へ うつして、t1 を 中心に 回して、軸の 向きに のばす
    let ang = Math.atan2(t2.y - t1.y, t2.x - t1.x) - Math.atan2(f2.y - f1.y, f2.x - f1.x);
    while(ang > Math.PI) ang -= Math.PI * 2; while(ang < -Math.PI) ang += Math.PI * 2;
    ang *= m2;
    const lf = Math.hypot(f2.x - f1.x, f2.y - f1.y) || 1, lt = Math.hypot(t2.x - t1.x, t2.y - t1.y);
    const sc = 1 + (Math.max(0.4, Math.min(2.5, lt / lf)) - 1) * m2;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const ux = Math.cos(Math.atan2(f2.y - f1.y, f2.x - f1.x) + ang), uy = Math.sin(Math.atan2(f2.y - f1.y, f2.x - f1.x) + ang);
    // のばし: I + (sc-1) u uᵀ
    const S2 = { a: 1 + (sc - 1) * ux * ux, b: (sc - 1) * ux * uy, c: (sc - 1) * ux * uy, d: 1 + (sc - 1) * uy * uy };
    const R = { a: c, b: sn, c: -sn, d: c };
    const L = { a: S2.a * R.a + S2.c * R.b, b: S2.b * R.a + S2.d * R.b, c: S2.a * R.c + S2.c * R.d, d: S2.b * R.c + S2.d * R.d };
    const m1 = p1.mix;
    const ax = f1.x + (t1.x - f1.x) * m1, ay = f1.y + (t1.y - f1.y) * m1;   // 支点を どこへ
    const A = { a: L.a, b: L.b, c: L.c, d: L.d, tx: ax - (L.a * f1.x + L.c * f1.y), ty: ay - (L.b * f1.x + L.d * f1.y) };
    const st = [fid];
    while(st.length){
      const id = st.pop(); const q = pose[id];
      if(q) q.world = M.mul(A, q.world);
      (kids[id] || []).forEach(k => st.push(k));
    }
  }
}
const _applySpringsP = applySprings;
applySprings = function(proj, pose, dt, st, on){ _applySpringsP(proj, pose, dt, st, on); applyPins(proj, pose); };
const _applyIKs0 = applyIKs;
applyIKs = function(proj, pose){ _applyIKs0(proj, pose); applyPins(proj, pose); };

/* ---------- つくる：ついて いく 絵 → くっつく 先の 絵 → 点 ---------- */
const PIN_STEPS = [
  { key:'pf', say:'ついて いく 側（メガネ など）の 絵を さわって', skip:false },
  { key:'pt', say:'くっつく 先（指 など）の 絵を さわって', skip:false },
  { key:'pp', say:'くっつける 点（ふれて いる ところ）を さわって', skip:false }
];
function pinStart(){
  if(S.proj.slots.length < 2) return setStatus('部品が 2つ 以上 いります');
  S.tapRig = { i:0, pts:{}, kind:'pin2', steps: PIN_STEPS };
  S.mode = 'setup'; S.playing = false;
  document.body.classList.add('taprig');
  tapShow(); refreshUI();
}
const _tapEndP = tapEnd;
tapEnd = function(ok){
  const r = S.tapRig;
  if(!r || r.kind !== 'pin2') return _tapEndP(ok);
  S.tapRig = null; document.body.classList.remove('taprig');
  if(ok) buildPin(r.pts);
  refreshUI();
};

/** その 点の 下に ある 絵 ぜんぶ（手前から） */
function slotsAt(w){
  const pose = curPose || setupPose(), out = [];
  for(let i = S.proj.slots.length - 1; i >= 0; i--){
    const s = S.proj.slots[i];
    if(!s.visible || s.lidCover || !s.verts.length) continue;
    const xy = new Float32Array(s.verts.length * 2); deformSlot(s, pose, xy);
    const t = s.tris;
    for(let k = 0; k < t.length; k += 3){
      if(ptInTri(w.x, w.y, xy[t[k]*2], xy[t[k]*2+1], xy[t[k+1]*2], xy[t[k+1]*2+1], xy[t[k+2]*2], xy[t[k+2]*2+1])){ out.push(s); break; }
    }
  }
  return out;
}
/** 重なって いたら どれか えらんで もらう */
function choosePart(list, title, done){
  if(list.length <= 1) return done(list[0] || null);
  sheet.show(title, body => {
    body.appendChild(el('div', 'sh-note', 'ここには 絵が 重なって います。どれですか？'));
    list.forEach(s => body.appendChild(btnRow(mkBtn(s.name, () => { sheet.hide(); done(s); }, 'btn'))));
  });
}
function buildPin(P){
  if(!P || !P.pf || !P.pt || !P.pp) return;
  choosePart(slotsAt(P.pf), 'ついて いく 側は？', A => {
    if(!A) return setStatus('部品が 見つかりませんでした。絵の 上を さわってね');
    // くっつく 先は ついて いく 部品を よけて えらぶ。上に 髪や 顔が 重なって いても えらべる
    choosePart(slotsAt(P.pt).filter(s => s !== A), 'くっつく 先は？', B => buildPin2(P, A, B));
  });
}
function buildPin2(P, A, B){
  if(!A || !B) return setStatus('部品が 見つかりませんでした。絵の 上を さわってね');
  const J = P.pp;
  let made = null;
  edit('くっつける: ' + A.name + ' → ' + B.name, () => {
    const sp0 = setupPose();
    // くっつく 先: B の 骨の うち 点に いちばん 近い もの
    const tIds = slotBones(B).ids;
    let tgt = boneById(tIds[0]) || S.proj.bones[0], bd = 1e9;
    tIds.forEach(id => { const b = boneById(id), p = sp0[id]; if(!b || !p) return;
      const e = M.apply(p.world, b.len, 0); const d = distToSeg(J.x, J.y, p.world.tx, p.world.ty, e.x, e.y);
      if(d < bd){ bd = d; tgt = b; } });
    // ついて いく 側: A 専用の 骨（いまの 付け先の 子）。ほかの 絵を まきこまない
    const base = slotBones(A).main || S.proj.bones[0];
    let fol = base;
    const shared = S.proj.slots.some(o => o !== A && slotBones(o).ids.includes(base.id));
    if(shared || !base.parent){
      const bx = slotBox(A);
      fol = boneAt(A.name + '_くっつき', base.id, J, { x: bx.cx, y: bx.cy === J.y ? J.y - 20 : bx.cy });
      A.verts.forEach(v => { v.w = []; }); A.bone = fol.id;
    }
    markDirty();
    const sp = setupPose();
    const fl = M.apply(M.inv(sp[fol.id].world), J.x, J.y), tl = M.apply(M.inv(sp[tgt.id].world), J.x, J.y);
    made = { id: uid('pin'), slot: A.id, tslot: B.id, name: A.name + ' → ' + B.name, follower: fol.id, target: tgt.id, fl, tl, mix: 1 };
    PINS().push(made);
    markDirty();
    S.sel = { bone: fol.id, slot: null, ik: null };
  });
  if(made) setStatus('「' + A.name + '」を「' + B.name + '」の 点に くっつけました。動かしても ここは 離れません');
}

/* ---------- 画面に 印 ---------- */
function drawPins(){
  const pins = PINS(); if(!pins.length || !curPose) return;
  const z = S.view.z, dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  pins.forEach(p => {
    const T = curPose[p.target]; if(!T) return;
    const w = meshPoint(p, curPose) || M.apply(T.world, p.tl.x, p.tl.y), r = 7 * dpr / z;
    ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, 7); ctx.fillStyle = '#7AC4A0'; ctx.fill();
    ctx.lineWidth = 2.5 * dpr / z; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w.x - r * .5, w.y); ctx.lineTo(w.x + r * .5, w.y); ctx.moveTo(w.x, w.y - r * .5); ctx.lineTo(w.x, w.y + r * .5); ctx.stroke();
  });
}
const _renderP = render;
render = function(){ _renderP(); if(!S.live && !S.rec && !S.playing && S.show.bones) drawPins(); };

/* ---------- 右パネル：くっつけの 一覧（強さ・はずす） ---------- */
const _buildPropsP = buildProps;
buildProps = function(){
  _buildPropsP();
  const pins = PINS(); if(!pins.length) return;
  const sl = slotById(S.sel.slot), bid = S.sel.bone;
  const mine = pins.filter(p => p.follower === bid || p.target === bid || (sl && slotBones(sl).ids.some(id => id === p.follower || id === p.target)));
  if(!mine.length) return;
  const host = $('#props');
  const box = el('div', 'pin-box');
  box.appendChild(el('div', 'title', '📌 くっつけ'));
  mine.forEach(p => {
    box.appendChild(el('div', 'hint', p.name));
    box.appendChild(rng('強さ', () => p.mix, v => { p.mix = v; }, 0, 1, 0.05));
    const on = p.stretch !== false;
    box.appendChild(btnRow(
      mkBtn('のばして くっつける', () => { edit('くっつけ: のばす', () => { p.stretch = true; }); refreshUI(); }, 'btn btn-sm' + (on ? ' btn-y' : '')),
      mkBtn('そのまま うごかす', () => { edit('くっつけ: うごかす', () => { p.stretch = false; }); refreshUI(); }, 'btn btn-sm' + (on ? '' : ' btn-y'))));
    box.appendChild(btnRow(mkBtn('はずす', () => {
      edit('くっつけを はずす', () => { const i = PINS().indexOf(p); if(i >= 0) PINS().splice(i, 1); });
      refreshUI();
    }, 'btn btn-sm danger')));
  });
  host.insertBefore(box, host.firstChild);
};

/* ボタン（ツールの 枠） */
(() => {
  const b = el('button', 'opt', '📌 くっつける'); b.id = 'btnPin';
  b.title = '2つの 部品の 触れて いる 点を 決めて、動いても 離れない ように する';
  b.onclick = pinStart;
  const after = $('#btnJoint') || $('#btnTapRig');
  after.after(b);
})();
