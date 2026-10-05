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
function applyPins(proj, pose){
  const pins = proj.pins; if(!pins || !pins.length) return;
  const kids = childMap(proj);
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
    const fw = p => M.apply(F(), p.fl.x, p.fl.y), tw = p => M.apply(pose[p.target].world, p.tl.x, p.tl.y);
    if(list.length === 1){
      const p = list[0], a = fw(p), b = tw(p);
      shift(fid, (b.x - a.x) * p.mix, (b.y - a.y) * p.mix);
      continue;
    }
    /* 2か所: 片方を 支点（顔・頭がわ）に して ぴったり とめ、
       もう片方へ むけて 回し、長さの ちがいは 軸の 向きに すこし のばして あわせる（±30%まで）。
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
    const sc = 1 + (Math.max(0.7, Math.min(1.3, lt / lf)) - 1) * m2;
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

function buildPin(P){
  if(!P || !P.pf || !P.pt || !P.pp) return;
  const A = pickSlot(P.pf), B = pickSlot(P.pt);
  if(!A || !B) return setStatus('部品が 見つかりませんでした。絵の 上を さわってね');
  if(A === B) return setStatus('ついて いく 側と くっつく 先に おなじ 部品を えらんで います');
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
    made = { id: uid('pin'), name: A.name + ' → ' + B.name, follower: fol.id, target: tgt.id, fl, tl, mix: 1 };
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
    const w = M.apply(T.world, p.tl.x, p.tl.y), r = 7 * dpr / z;
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
