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
  pins.forEach(p => {
    const F = pose[p.follower], T = pose[p.target];
    if(!F || !T || !(p.mix > 0)) return;
    const fw = M.apply(F.world, p.fl.x, p.fl.y), tw = M.apply(T.world, p.tl.x, p.tl.y);
    const dx = (tw.x - fw.x) * p.mix, dy = (tw.y - fw.y) * p.mix;
    if(Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    // ついて いく 骨と その 先を まとめて ずらす
    const st = [p.follower];
    while(st.length){
      const id = st.pop(); const q = pose[id];
      if(q){ q.world = { a:q.world.a, b:q.world.b, c:q.world.c, d:q.world.d, tx:q.world.tx + dx, ty:q.world.ty + dy }; }
      (kids[id] || []).forEach(k => st.push(k));
    }
  });
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
