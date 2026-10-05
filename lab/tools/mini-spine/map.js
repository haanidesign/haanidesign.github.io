/* ミニSpine — つながり図
   骨を 箱、親から 子へ 線。左が 親で 右へ 行くほど 子。
   箱の 中に、その骨に ついて いる レイヤーを ならべる。
   ・箱や レイヤーを たたく → えらぶ
   ・レイヤーを ほかの 箱へ ドラッグ → そこに くっつけ直す
   ・箱を ほかの 箱へ ドラッグ → 骨の 親を 付けかえる（ついて いる 絵ごと）
   kobo.js の あとに 読む。 */
'use strict';

const MAP = (() => {
  const back = el('div'); back.id = 'mapBack';
  const box = el('div'); box.id = 'map';
  const bar = el('div'); bar.id = 'mapBar';
  bar.append(el('b', null, '🗺 つながり図'),
    el('span', 'map-hint', 'レイヤーや 箱を ほかの 箱へ ドラッグで 付けかえ'),
    mkBtn('とじる', () => close(), 'btn btn-sm'));
  const scroll = el('div'); scroll.id = 'mapScroll';
  const stage = el('div'); stage.id = 'mapStage';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'mapLines';
  stage.appendChild(svg); scroll.appendChild(stage);
  box.append(bar, scroll);
  document.body.append(back, box);
  back.addEventListener('pointerdown', () => close());
  addEventListener('keydown', e => { if(e.key === 'Escape' && document.body.classList.contains('map-open')) close(); });
  function open(){ document.body.classList.add('map-open'); draw(); }
  function close(){ document.body.classList.remove('map-open'); }
  return { open, close, stage, svg, scroll, get isOpen(){ return document.body.classList.contains('map-open'); } };
})();

/** レイヤーを 骨ごとに わける（いちばん 根もとの 骨＝見せる 親） */
function slotsByBone(){
  const m = {};
  S.proj.slots.slice().reverse().forEach(sl => {   // 上が 手前
    const b = slotBones(sl).main || boneById(sl.bone) || S.proj.bones[0];
    (m[b.id] = m[b.id] || []).push(sl);
  });
  return m;
}

function draw(){
  const st = MAP.stage, svg = MAP.svg;
  st.querySelectorAll('.nd').forEach(n => n.remove());
  const kids = childMap(S.proj), bySlot = slotsByBone();
  const COLW = 250, GAP = 14, PAD = 16;
  // 木の 形に ならべる（葉から 順に 上から つむ）
  const pos = {}; let y = PAD;
  const nodes = [];
  const make = (id, depth) => {
    const b = boneById(id); if(!b) return;
    const n = el('div', 'nd' + (b.spring ? ' spring' : '') + (id === S.sel.bone && !S.sel.slot ? ' sel' : ''));
    n.dataset.bone = id;
    const head = el('div', 'nd-h');
    head.appendChild(el('span', 'nd-name', (b.parent ? '🦴 ' : '⭐ ') + (b.parent ? b.name : '全体（root）')));
    const acts = el('span', 'nd-acts');
    const act = (txt, a, title, cls) => { const x = el('span', 'nd-act' + (cls ? ' ' + cls : ''), txt); x.dataset.act = a; x.title = title; acts.appendChild(x); };
    if(b.parent) act('揺', 'spring', '揺れる／揺れない を 切りかえ', b.spring ? 'on' : '');
    act('＋', 'add', 'この 箱の 子に 新しい 箱を 足す');
    if(b.parent){ act('✎', 'rename', '名前を 変える'); act('×', 'del', 'この 箱を 消す（中身は 1つ上へ）'); }
    head.appendChild(acts);
    n.appendChild(head);
    (bySlot[id] || []).forEach(sl => {
      const c = el('div', 'nd-l' + (sl.id === S.sel.slot ? ' sel' : ''), '🖼 ' + sl.name);
      c.dataset.slot = sl.id;
      n.appendChild(c);
    });
    st.appendChild(n);
    nodes.push({ n, id, depth });
    (kids[id] || []).forEach(k => make(k, depth + 1));
  };
  make(S.proj.bones[0].id, 0);
  // 高さが わかって から 位置を きめる（子が いれば 子の まんなかに）
  const h = {}; nodes.forEach(o => { h[o.id] = o.n.offsetHeight; });
  const place = (id, depth) => {
    const ks = (kids[id] || []).filter(k => boneById(k));
    let top;
    const start = y;   // この 枝が 使って いい いちばん 上
    if(!ks.length){ top = y; y += h[id] + GAP; }
    else {
      ks.forEach(k => place(k, depth + 1));
      const first = pos[ks[0]].y, lastK = ks[ks.length - 1], last = pos[lastK].y + h[lastK];
      // 子の まんなかに 置くが、上の 枝に かぶらない ように
      top = Math.max((first + last) / 2 - h[id] / 2, start);
      if(top + h[id] + GAP > y) y = top + h[id] + GAP;
    }
    pos[id] = { x: PAD + depth * COLW, y: top };
    return top;
  };
  place(S.proj.bones[0].id, 0);
  let W = 0, H = 0;
  nodes.forEach(o => { const p = pos[o.id]; o.n.style.left = p.x + 'px'; o.n.style.top = p.y + 'px';
    W = Math.max(W, p.x + o.n.offsetWidth + PAD); H = Math.max(H, p.y + h[o.id] + PAD); });
  st.style.width = W + 'px'; st.style.height = H + 'px';
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  // 線（親の 右はし → 子の 左はし）
  let d = '';
  S.proj.bones.forEach(b => {
    if(!b.parent || !pos[b.id] || !pos[b.parent]) return;
    const pn = nodes.find(o => o.id === b.parent).n;
    const x1 = pos[b.parent].x + pn.offsetWidth, y1 = pos[b.parent].y + 16;
    const x2 = pos[b.id].x, y2 = pos[b.id].y + 16, mx = (x1 + x2) / 2;
    d += 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + ' ';
  });
  svg.innerHTML = '<path d="' + d + '" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>';
}

/* ---------- たたく・ドラッグ ---------- */
(() => {
  let drag = null;
  const st = MAP.stage;
  MAP.cancelDrag = () => {
    if(!drag) return;
    if(drag.ghost) drag.ghost.remove();
    st.querySelectorAll('.nd.drop').forEach(n => n.classList.remove('drop'));
    MAP.scroll.style.touchAction = '';
    drag = null;
  };
  st.addEventListener('pointerdown', e => {
    const actEl = e.target.closest('.nd-act'), node = e.target.closest('.nd');
    if(actEl && node){ e.preventDefault(); e.stopPropagation(); nodeAction(actEl.dataset.act, boneById(node.dataset.bone)); return; }
    const chip = e.target.closest('.nd-l');
    if(!node) return;
    drag = { chip, node, x: e.clientX, y: e.clientY, moved: false, ghost: null, id: e.pointerId };
  });
  addEventListener('pointermove', e => {
    if(!drag || e.pointerId !== drag.id) return;
    if(!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if(!drag.moved){
      drag.moved = true;
      const src = drag.chip || drag.node.querySelector('.nd-h');
      drag.ghost = el('div', 'map-ghost', src.textContent);
      document.body.appendChild(drag.ghost);
      MAP.scroll.style.touchAction = 'none';
    }
    e.preventDefault();
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    // はしに 近づいたら 図を 送る（見えて いない 箱へも 運べる）
    const r = MAP.scroll.getBoundingClientRect(), m = 48, sp = 18;
    if(e.clientY < r.top + m) MAP.scroll.scrollTop -= sp;
    else if(e.clientY > r.bottom - m) MAP.scroll.scrollTop += sp;
    if(e.clientX < r.left + m) MAP.scroll.scrollLeft -= sp;
    else if(e.clientX > r.right - m) MAP.scroll.scrollLeft += sp;
    st.querySelectorAll('.nd.drop').forEach(n => n.classList.remove('drop'));
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const tn = t && t.closest && t.closest('.nd');
    if(tn && tn !== drag.node) tn.classList.add('drop');
  }, { passive:false });
  const up = e => {
    if(!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    MAP.scroll.style.touchAction = '';
    st.querySelectorAll('.nd.drop').forEach(n => n.classList.remove('drop'));
    if(d.ghost) d.ghost.remove();
    if(!d.moved){
      // たたいた → えらぶ
      if(d.chip) S.sel = { bone: S.sel.bone, slot: d.chip.dataset.slot, ik: null };
      else S.sel = { bone: d.node.dataset.bone, slot: null, ik: null };
      refreshUI(); draw();
      return;
    }
    const t = e && document.elementFromPoint(e.clientX, e.clientY);
    const tn = t && t.closest && t.closest('.nd');
    if(!tn || tn === d.node) return;
    const to = boneById(tn.dataset.bone); if(!to) return;
    if(d.chip){
      const sl = slotById(d.chip.dataset.slot); if(!sl) return;
      edit(sl.name + ' を ' + to.name + ' へ', () => {
        // 図で 作った ばかりの 箱なら、骨の 位置を その 絵に あわせる
        if(to.mapNew){ fitBoneToSlot(to, sl); delete to.mapNew; }
        sl.bone = to.id; sl.verts.forEach(v => { v.w = []; }); markDirty();
      });
      setStatus(sl.name + ' を「' + (to.parent ? to.name : '全体') + '」に くっつけました');
    } else {
      const b = boneById(d.node.dataset.bone);
      if(!b || !b.parent) return setStatus('全体（root）は 動かせません');
      if(to.id === b.id || isDescendant(to.id, b.id)) return setStatus('じぶんの 子の 下には 入れられません');
      edit(b.name + ' の 親を ' + to.name + ' に', () => { setParentKeep(b, to.id); markDirty(); });
      setStatus('「' + b.name + '」を「' + (to.parent ? to.name : '全体') + '」の 下に 入れました（ついて いる 絵ごと）');
    }
    refreshUI(); draw();
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', () => { if(drag && drag.ghost) drag.ghost.remove(); drag = null; });
})();

/* ---------- 箱の ボタン ---------- */
function nodeAction(act, b){
  if(!b) return;
  if(act === 'add'){
    const sp = setupPose(), p = sp[b.id];
    const tip = p ? M.apply(p.world, b.len, 0) : { x: S.proj.canvas.w / 2, y: S.proj.canvas.h / 2 };
    let n = 1; while(S.proj.bones.some(x => x.name === '新しい箱' + n)) n++;
    let nb;
    edit('箱を 足す', () => { nb = boneAt('新しい箱' + n, b.id, tip, { x: tip.x, y: tip.y - 60 }); nb.mapNew = true; markDirty(); });
    S.sel = { bone: nb.id, slot: null, ik: null };
    setStatus('「' + nb.name + '」を 足しました。レイヤーを ドラッグで 入れると、骨が その 絵に あわせて 動きます');
  } else if(act === 'rename'){
    const nm = prompt('箱の 名前', b.name);
    if(nm && nm.trim()) edit('名前を 変える', () => { b.name = nm.trim(); });
  } else if(act === 'del'){
    deleteBone(b.id);
  } else if(act === 'spring'){
    edit(b.spring ? '揺れを 止める' : '揺らす', () => {
      if(b.spring) b.spring = false;
      else Object.assign(b, typeof softAt === 'function' ? softAt('やわらかい', 0, 1) : { spring:true });
    });
    S.spring = true; S.springState = {};
  }
  refreshUI(); draw();
}
/** 骨を 絵に あわせる：親に いちばん 近い ところを 付け根、いちばん 遠い ところを 先っぽ に */
function fitBoneToSlot(b, sl){
  const sp = setupPose(), pp = sp[b.parent];
  const par = boneById(b.parent);
  const a0 = pp ? { x: pp.world.tx, y: pp.world.ty } : { x: 0, y: 0 };
  const a1 = pp && par ? M.apply(pp.world, par.len, 0) : a0;
  let base = null, bd = 1e9;
  sl.verts.forEach(v => { const d = distToSeg(v.x, v.y, a0.x, a0.y, a1.x, a1.y); if(d < bd){ bd = d; base = { x:v.x, y:v.y }; } });
  if(!base) return;
  let tip = base, fd = -1;
  sl.verts.forEach(v => { const d = Math.hypot(v.x - base.x, v.y - base.y); if(d > fd){ fd = d; tip = { x:v.x, y:v.y }; } });
  moveBoneKeep(b, base, tip);
}

/* 図を ひらいて いる あいだに 中身が 変わったら 描き直す */
const _refreshUI2 = refreshUI;
refreshUI = function(){ _refreshUI2(); if(MAP.isOpen) draw(); };

/* ボタン（上の バー と ツリーの 見出し） */
(() => {
  const b = el('button', 'btn btn-sm btn-y', '🗺 つながり図'); b.id = 'btnMap';
  b.onclick = () => MAP.open();
  $('.tb-actions').insertBefore(b, $('.tb-actions').firstChild);
  const t = el('button', 'btn btn-sm map-open-tree', '🗺 図で 見る');
  t.onclick = () => MAP.open();
  const ttl = $('#tree .pgroup-ttl');
  if(ttl){ ttl.classList.add('with-btn'); ttl.appendChild(t); }
})();

/* ---------- つながり図でも 2本指トン＝もどす、3本指トン＝やりなおし ---------- */
(() => {
  const box = document.getElementById('map');
  const t = { ids: new Map(), max: 0, t0: 0, moved: false };
  box.addEventListener('pointerdown', e => {
    if(e.pointerType !== 'touch') return;
    if(t.ids.size === 0){ t.max = 0; t.t0 = performance.now(); t.moved = false; }
    t.ids.set(e.pointerId, { x: e.clientX, y: e.clientY });
    t.max = Math.max(t.max, t.ids.size);
    // 2本目の 指が おりたら、1本目で はじめかけた ドラッグは やめる
    if(t.ids.size >= 2) MAP.cancelDrag();
  }, true);
  box.addEventListener('pointermove', e => {
    const p = t.ids.get(e.pointerId); if(!p) return;
    if(Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) t.moved = true;
  }, true);
  const up = e => {
    if(!t.ids.delete(e.pointerId) || t.ids.size) return;
    if(t.moved || performance.now() - t.t0 > 350) return;
    if(t.max === 2){ undo(); draw(); }
    else if(t.max === 3){ redo(); draw(); }
  };
  box.addEventListener('pointerup', up, true);
  box.addEventListener('pointercancel', e => { t.ids.delete(e.pointerId); t.moved = true; }, true);
})();
