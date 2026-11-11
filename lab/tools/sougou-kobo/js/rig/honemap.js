/* 🗺 骨の つながり図（ミニSpine の つながり図 と 同じ）。
   骨を 箱、親から 子へ 線。左が 親で 右へ 行くほど 子。
   箱の 中に、その 骨に ついて いる パーツを ならべる。
   ・箱や パーツを たたく → えらぶ
   ・パーツを ほかの 箱へ ドラッグ → その 骨に つけなおす
   ・箱を ほかの 箱へ ドラッグ → 骨の 親を つけかえる（見た目は そのまま）
   ・揺 … ゆれる 骨に する／もどす　✎ … 名前　× … けす */
import { edit } from '../state.js?v=426';
import { M } from './core.js?v=426';
import { setupPose, rebind, removeBone, SOFT } from './hone.js?v=426';

let ui = null;

function mk(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text != null) e.textContent = text;
  return e;
}

/**
 * @param l     骨キャラの レイヤー
 * @param o.onSelect(boneId, slotId) えらんだ とき
 * @param o.onChange()               直した とき
 * @param o.toast(text)
 * @param o.selBone / o.selSlot      いま えらんで いる もの
 */
export function openHoneMap(l, o){
  closeHoneMap();
  const back = mk('div', 'hmap-back');
  const box = mk('div', 'hmap');
  const bar = mk('div', 'hmap-bar');
  const close = mk('button', '', '✕ とじる');
  close.addEventListener('click', closeHoneMap);
  bar.append(mk('b', '', '🗺 つながり図'), mk('span', 'hmap-hint', 'パーツや 箱を ほかの 箱へ ドラッグで 付けかえ'), close);
  const scroll = mk('div', 'hmap-scroll');
  const stage = mk('div', 'hmap-stage');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('hmap-lines');
  stage.appendChild(svg);
  scroll.appendChild(stage);
  box.append(bar, scroll);
  document.body.append(back, box);
  back.addEventListener('pointerdown', closeHoneMap);
  const onKey = (e) => { if(e.key === 'Escape') closeHoneMap(); };
  addEventListener('keydown', onKey);
  ui = { back, box, onKey, l, o, stage, svg, scroll, selBone: o.selBone || 'root', selSlot: o.selSlot || null };
  draw();
  bindDrag();
}

export function closeHoneMap(){
  if(!ui) return;
  ui.back.remove(); ui.box.remove();
  removeEventListener('keydown', ui.onKey);
  ui = null;
}

const boneOf = (l, id) => l.hone.bones.find(b => b.id === id);
const isUnder = (l, id, anc) => { let b = boneOf(l, id), g = 0; while(b && b.parent && g++ < 200){ if(b.parent === anc) return true; b = boneOf(l, b.parent); } return false; };

function draw(){
  const { l, stage, svg } = ui;
  stage.querySelectorAll('.hnd').forEach(n => n.remove());
  const h = l.hone;
  const kids = {};
  h.bones.forEach(b => { if(b.parent) (kids[b.parent] = kids[b.parent] || []).push(b.id); });
  const bySlot = {};
  h.slots.slice().reverse().forEach(s => { const id = boneOf(l, s.bone) ? s.bone : h.bones[0].id; (bySlot[id] = bySlot[id] || []).push(s); });
  const COLW = 240, GAP = 14, PAD = 16;
  const nodes = [];
  const make = (id, depth) => {
    const b = boneOf(l, id); if(!b) return;
    const n = mk('div', 'hnd' + (b.spring ? ' spring' : '') + (id === ui.selBone && !ui.selSlot ? ' sel' : ''));
    n.dataset.bone = id;
    const head = mk('div', 'hnd-h');
    head.appendChild(mk('span', 'hnd-name', (b.parent ? '🦴 ' : '⭐ ') + (b.parent ? b.name : '全体（根もと）')));
    const acts = mk('span', 'hnd-acts');
    const act = (txt, a, title, on) => { const x = mk('span', 'hnd-act' + (on ? ' on' : ''), txt); x.dataset.act = a; x.title = title; acts.appendChild(x); };
    if(b.parent){
      act('揺', 'spring', 'ゆれる／ゆれない を 切りかえ', b.spring);
      act('✎', 'rename', '名前を 変える');
      act('×', 'del', 'この 骨を けす（子と パーツは 1つ上へ）');
    }
    head.appendChild(acts);
    n.appendChild(head);
    (bySlot[id] || []).forEach(s => {
      const c = mk('div', 'hnd-l' + (s.id === ui.selSlot ? ' sel' : ''), '🖼 ' + s.name);
      c.dataset.slot = s.id;
      n.appendChild(c);
    });
    stage.appendChild(n);
    nodes.push({ n, id });
    (kids[id] || []).forEach(k => make(k, depth + 1));
  };
  const root = h.bones.find(b => !b.parent) || h.bones[0];
  make(root.id, 0);
  /* 高さが わかって から 位置を きめる（子が いれば 子の まんなかに） */
  const ht = {}; nodes.forEach(x => { ht[x.id] = x.n.offsetHeight; });
  const pos = {}; let y = PAD;
  const place = (id, depth) => {
    const ks = (kids[id] || []).filter(k => ht[k] != null);
    const start = y;
    let top;
    if(!ks.length){ top = y; y += ht[id] + GAP; }
    else {
      ks.forEach(k => place(k, depth + 1));
      const first = pos[ks[0]].y, lk = ks[ks.length - 1], last = pos[lk].y + ht[lk];
      top = Math.max((first + last) / 2 - ht[id] / 2, start);
      if(top + ht[id] + GAP > y) y = top + ht[id] + GAP;
    }
    pos[id] = { x: PAD + depth * COLW, y: top };
  };
  place(root.id, 0);
  let W = 0, H = 0;
  nodes.forEach(x => {
    const p = pos[x.id]; if(!p) return;
    x.n.style.left = p.x + 'px'; x.n.style.top = p.y + 'px';
    W = Math.max(W, p.x + x.n.offsetWidth + PAD); H = Math.max(H, p.y + ht[x.id] + PAD);
  });
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  let d = '';
  h.bones.forEach(b => {
    if(!b.parent || !pos[b.id] || !pos[b.parent]) return;
    const pn = nodes.find(x => x.id === b.parent).n;
    const x1 = pos[b.parent].x + pn.offsetWidth, y1 = pos[b.parent].y + 18;
    const x2 = pos[b.id].x, y2 = pos[b.id].y + 18, mx = (x1 + x2) / 2;
    d += 'M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + ' ';
  });
  svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#1E1C14" stroke-width="3" stroke-linecap="round"/>';
}

/* 見た目を たもった まま 骨の 親を かえる */
function setParentKeep(l, b, pid){
  const sp = setupPose(l.hone);
  const pw = sp[pid] ? sp[pid].world : M.ident(), cw = sp[b.id].world;
  const dd = M.decompose(M.mul(M.inv(pw), cw));
  Object.assign(b, { parent: pid, x: dd.x, y: dd.y, rot: dd.rot, sx: dd.sx, sy: dd.sy, shear: dd.shear });
}

function changed(){ if(ui){ ui.o.onChange && ui.o.onChange(); draw(); } }
function say(t){ if(ui && ui.o.toast) ui.o.toast(t); }

function bindDrag(){
  const { stage, scroll } = ui;
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const l = ui.l;
    const actEl = e.target.closest('.hnd-act'), node = e.target.closest('.hnd');
    if(actEl && node){ e.preventDefault(); e.stopPropagation(); nodeAction(actEl.dataset.act, boneOf(l, node.dataset.bone)); return; }
    if(!node) return;
    drag = { chip: e.target.closest('.hnd-l'), node, x: e.clientX, y: e.clientY, moved: false, ghost: null, id: e.pointerId };
  });
  const move = (e) => {
    if(!drag || e.pointerId !== drag.id) return;
    if(!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if(!drag.moved){
      drag.moved = true;
      const src = drag.chip || drag.node.querySelector('.hnd-h');
      drag.ghost = mk('div', 'hmap-ghost', src.textContent);
      document.body.appendChild(drag.ghost);
      scroll.style.touchAction = 'none';
    }
    e.preventDefault();
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    /* はしに 近づいたら 図を 送る */
    const r = scroll.getBoundingClientRect(), m = 48, sp = 18;
    if(e.clientY < r.top + m) scroll.scrollTop -= sp; else if(e.clientY > r.bottom - m) scroll.scrollTop += sp;
    if(e.clientX < r.left + m) scroll.scrollLeft -= sp; else if(e.clientX > r.right - m) scroll.scrollLeft += sp;
    stage.querySelectorAll('.hnd.drop').forEach(n => n.classList.remove('drop'));
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const tn = t && t.closest && t.closest('.hnd');
    if(tn && tn !== drag.node) tn.classList.add('drop');
  };
  const up = (e) => {
    if(!drag || (e && e.pointerId !== drag.id) || !ui) { if(drag && drag.ghost) drag.ghost.remove(); drag = null; return; }
    const d = drag; drag = null;
    const l = ui.l;
    scroll.style.touchAction = '';
    stage.querySelectorAll('.hnd.drop').forEach(n => n.classList.remove('drop'));
    if(d.ghost) d.ghost.remove();
    if(!d.moved){
      if(d.chip){ ui.selSlot = d.chip.dataset.slot; }
      else { ui.selBone = d.node.dataset.bone; ui.selSlot = null; }
      ui.o.onSelect && ui.o.onSelect(ui.selBone, ui.selSlot);
      draw();
      return;
    }
    const t = e && document.elementFromPoint(e.clientX, e.clientY);
    const tn = t && t.closest && t.closest('.hnd');
    if(!tn || tn === d.node) return;
    const to = boneOf(l, tn.dataset.bone); if(!to) return;
    const toName = to.parent ? to.name : '全体';
    if(d.chip){
      const s = l.hone.slots.find(x => x.id === d.chip.dataset.slot); if(!s) return;
      edit(s.name + ' を ' + toName + ' へ', () => { s.bone = to.id; s.verts.forEach(v => { v.w = []; }); rebind(l); });
      say('「' + s.name + '」を「' + toName + '」に つけました');
    } else {
      const b = boneOf(l, d.node.dataset.bone);
      if(!b || !b.parent) return say('根もとは 動かせません');
      if(to.id === b.id || isUnder(l, to.id, b.id)) return say('じぶんの 子の 下には 入れられません');
      edit(b.name + ' の 親を ' + toName + ' に', () => { setParentKeep(l, b, to.id); rebind(l); });
      say('「' + b.name + '」を「' + toName + '」の 下に 入れました（ついて いる 絵ごと）');
    }
    changed();
  };
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  const off = closeHoneMap;
  /* とじたら 聞くのを やめる */
  const obs = new MutationObserver(() => {
    if(!document.body.contains(stage)){
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });
  void off;
}

function nodeAction(act, b){
  const l = ui && ui.l;
  if(!l || !b) return;
  if(act === 'rename'){
    const nm = prompt('骨の 名前（頭・体・首・右腕・左腕・髪・しっぽ など）', b.name);
    if(nm && nm.trim()) edit('骨の 名前', () => { b.name = nm.trim(); });
  } else if(act === 'del'){
    edit('骨を けす', () => { removeBone(l, b.id); });
    if(ui.selBone === b.id){ ui.selBone = 'root'; ui.o.onSelect && ui.o.onSelect('root', null); }
    say('「' + b.name + '」を けしました');
  } else if(act === 'spring'){
    edit(b.spring ? 'ゆれを 止める' : 'ゆらす', () => {
      b.spring = !b.spring;
      if(b.spring && (b.stiff == null || b.stiff >= 0.3)) Object.assign(b, SOFT.hair);
    });
    say(b.spring ? '「' + b.name + '」が ゆれる ように なりました' : '「' + b.name + '」の ゆれを 止めました');
  }
  changed();
}
