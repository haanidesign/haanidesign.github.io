/* 🦴 骨キャラ（kind: 'hone'）。ミニSpine の 骨・メッシュ・ウェイト・IK を この 道具の レイヤーに した もの。

   l.hone = {
     bones: [{ id, name, parent, x, y, rot, sx, sy, shear, len, spring… }]  … ミニSpine と 同じ。組み立ての 姿
     slots: [{ id, name, asset, bone, verts, tris, alpha, visible }]       … 骨に ついた 絵（あみ）
     iks:   [{ id, name, bones:[親, 子], target, mix, bendPositive }]
   }
   ざひょうは 作品と 同じ（0,0 が 左上）。作品と 同じ 大きさの 紙に 描くので、
   レイヤーの 動かす・大きさ・カメラ・効果は ほかと 同じに きく。

   動きは この レイヤーの タイムラインに うつ。
     'H:<骨のid>:rot' … 組み立ての 角度からの ずれ（度）
     'H:<骨のid>:x/y' … 組み立ての 場所からの ずれ
     'H:<骨のid>:sx/sy' … 大きさ（1 が そのまま）
   キーの ならびは ほかの キーと 同じ なので、ずらす・けす・イージングも そのまま きく。 */
import { M, CH, computePose, applyIKs, invCache, bindSlot, deformSlot, buildGridMesh, drawSlot,
         autoWeights, uid, topoBones, applySprings } from './core.js?v=359';
import { sample, mapTime, remapTime } from '../engine/anim.js?v=359';
import { newLayer } from '../engine/layer.js?v=359';
import { S, undoDepth } from '../state.js?v=359';

export const boneCh = (id, ch) => 'H:' + id + ':' + ch;
export const isBoneCh = (c) => /^H:.+:(rot|x|y|sx|sy|shear)$/.test(c);
export const isHone = (l) => !!l && l.kind === 'hone';
const isScale = (ch) => ch === 'sx' || ch === 'sy';

export function newBone(o){
  return Object.assign({ id: uid('b'), name: 'ほね', parent: null, x: 0, y: 0, rot: 0, sx: 1, sy: 1, shear: 0, len: 100,
    spring: false, stiff: 0.35, damp: 0.72, grav: 0, inertia: 1, limit: 30 }, o);
}

/**
 * 絵（パーツ）から 骨キャラを つくる。
 *   parts … [{ name, asset, place }]  place は 絵の 左上→作品の 行列（{a,b,c,d,tx,ty}）
 * 骨は 1本（根もと）だけ。パーツは ぜんぶ 根もとに つく。
 */
export function newHoneLayer(project, parts){
  const l = newLayer('骨キャラ', []);
  l.kind = 'hone';
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  /* 根もとは パーツ ぜんたいの 下の まん中 */
  let x0 = 1e9, x1 = -1e9, y1 = -1e9, y0 = 1e9;
  parts.forEach(p => {
    const a = project.assets[p.asset];
    [[0, 0], [a.w, 0], [0, a.h], [a.w, a.h]].forEach(([u, v]) => {
      const q = M.apply(p.place, u, v);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    });
  });
  if(!parts.length){ x0 = project.w * .4; x1 = project.w * .6; y0 = project.h * .3; y1 = project.h * .8; }
  const root = newBone({ id: 'root', name: '根もと', x: (x0 + x1) / 2, y: y1 - (y1 - y0) * 0.05, rot: -90,
                         len: Math.max(40, (y1 - y0) * 0.25) });
  l.hone = { bones: [root], slots: [], iks: [] };
  parts.forEach(p => addSlot(l, project, p.asset, p.place, p.name));
  return l;
}

/** 絵を 1まい 足す（いま えらんで いる 骨に つく） */
export function addSlot(l, project, assetId, place, name, bone){
  const a = project.assets[assetId], img = S.imgs[assetId];
  if(!a || !img) return null;
  const n = Math.max(2, Math.min(12, Math.round(Math.max(a.w, a.h) / 90)));
  const mesh = buildGridMesh(img, n, n, place);
  const b = bone || 'root';
  mesh.verts.forEach(v => { v.w = [{ b, w: 1 }]; });
  const slot = { id: uid('slot'), name: name || a.name || 'パーツ', asset: assetId, bone: b,
                 verts: mesh.verts, tris: mesh.tris, alpha: 1, visible: true };
  l.hone.slots.push(slot);
  rebind(l);
  return slot;
}

export const setupPose = (h) => computePose(h, null, 0);

/** 組み立てを 変えた あとに よぶ。あみは いまの 場所の まま、骨への つき方を 計算しなおす */
export function rebind(l){
  const h = l.hone, sp = setupPose(h), inv = invCache(sp);
  for(const s of h.slots){
    for(const v of s.verts) if(!v.w || !v.w.length) v.w = [{ b: s.bone, w: 1 }];
    bindSlot(s, sp, inv);
  }
}

/** その 時こくの 骨の ずれ（キー）を 読む */
function keyTime(l, time){ return mapTime(remapTime(l, time), l.loop); }

export function keyedValue(l, boneId, ch, time){
  const k = l.tracks && l.tracks[boneCh(boneId, ch)];
  return sample(k, keyTime(l, time), isScale(ch) ? 1 : 0);
}

/** その 時こくの 骨の 姿（IK まで） */
export function honePose(l, time){
  const h = l.hone, t = keyTime(l, time), tr = l.tracks || {};
  const over = {};
  for(const b of h.bones){
    let o = null;
    for(const ch of CH){
      const k = tr[boneCh(b.id, ch)];
      if(!k || !k.length) continue;
      const s = sample(k, t, null);
      if(s == null) continue;
      (o = o || {})[ch] = isScale(ch) ? s : (b[ch] || 0) + s;
    }
    if(o) over[b.id] = o;
  }
  const pose = computePose(h, null, 0, over);
  applyIKs(h, pose);
  return pose;
}

/* 描く ための 点の 置き場（スロットごと） */
const XY = new WeakMap();

export function honeCanvas(l, time, project){
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._hnC || l._hnC.width !== w || l._hnC.height !== h){
    l._hnC = document.createElement('canvas');
    l._hnC.width = w; l._hnC.height = h;
    l._hnC.complete = true; l._hnC.naturalWidth = w; l._hnC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const g = l._hnC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  const H = l.hone;
  if(!H) return l._hnC;
  /* セットアップ中は 組み立ての 姿で 見せる（ミニSpine と 同じ） */
  const pose = (S.honeMode && S.honeSetup && S.sel === l.id) ? setupPose(H) : honePoseLive(l, time);
  l._hnPose = pose;
  for(const s of H.slots){
    if(!slotShown(l, s, time)) continue;
    const img = S.imgs[s.asset];
    if(!img || !(img.naturalWidth || img.width)) continue;
    if(!s.verts.length || !s.verts[0].bind) rebind(l);
    let xy = XY.get(s);
    if(!xy || xy.length !== s.verts.length * 2){ xy = new Float32Array(s.verts.length * 2); XY.set(s, xy); }
    deformSlot(s, pose, xy);
    drawSlot(g, s, img, xy);
  }
  return l._hnC;
}

/** 自動ウェイト。slot を わたさなければ ぜんぶ */
export function autoWeigh(l, slot){
  const h = l.hone, sp = setupPose(h);
  (slot ? [slot] : h.slots).forEach(s => autoWeights(h, s, sp, { maxBones: 3, falloff: 2.5 }));
  rebind(l);
}

/** 骨を けす。子は 親に つけかえ、その 骨の ウェイトは 親へ */
export function removeBone(l, id){
  const h = l.hone, b = h.bones.find(x => x.id === id);
  if(!b || !b.parent) return false;
  const sp = setupPose(h);
  h.bones.forEach(c => {
    if(c.parent !== id) return;
    /* 見た目を たもった まま 親を かえる */
    const pw = sp[b.parent].world, cw = sp[c.id].world;
    const d = M.decompose(M.mul(M.inv(pw), cw));
    Object.assign(c, { parent: b.parent, x: d.x, y: d.y, rot: d.rot, sx: d.sx, sy: d.sy, shear: d.shear });
  });
  h.bones = h.bones.filter(x => x !== b);
  h.slots.forEach(s => {
    if(s.bone === id) s.bone = b.parent;
    s.verts.forEach(v => {
      (v.w || []).forEach(w => { if(w.b === id) w.b = b.parent; });
      const m = new Map(); (v.w || []).forEach(w => m.set(w.b, (m.get(w.b) || 0) + w.w));
      v.w = [...m].map(([k, w]) => ({ b: k, w }));
    });
  });
  h.iks = (h.iks || []).filter(k => k.target !== id && !k.bones.includes(id));
  Object.keys(l.tracks || {}).forEach(c => { if(c.startsWith('H:' + id + ':')) delete l.tracks[c]; });
  rebind(l);
  return true;
}

/** 新しい 骨（組み立ての 姿の 作品ざひょうで はじまり・おわり を わたす） */
export function addBoneAt(l, parentId, ax, ay, bx, by){
  const h = l.hone, sp = setupPose(h);
  const pw = parentId && sp[parentId] ? sp[parentId].world : M.ident();
  const rot = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  const len = Math.hypot(bx - ax, by - ay);
  const local = M.decompose(M.mul(M.inv(pw), M.fromTRS(ax, ay, rot, 1, 1, 0)));
  const n = h.bones.length;
  const b = newBone({ name: 'ほね' + n, parent: parentId || null, x: local.x, y: local.y, rot: local.rot,
                      sx: local.sx, sy: local.sy, shear: local.shear, len });
  h.bones.push(b);
  rebind(l);
  return b;
}


/* ================= 🌀 骨の ばね =================
   ミニSpine の applySprings を そのまま つかう。
   止めて 見ても 書き出しても 同じに なる ように、0秒から 1/60秒ずつ 順に 回して
   ばねの ようす（先の 場所）を ためて おく。直したら（もどすの 番号が かわったら）やりなおし。 */
const SDT = 1 / 60;
const SIM = new Map();
const hasSpring = (h) => h.bones.some(b => b.spring);
function cloneSt(st){
  const o = {};
  for(const k in st){ const s = st[k]; o[k] = { x: s.x, y: s.y, px: s.px, py: s.py }; }
  return o;
}
export function honePoseLive(l, time){
  const h = l.hone;
  if(!hasSpring(h)) return honePose(l, time);
  const u = undoDepth();
  const key = [u.idx, u.size, JSON.stringify(h.bones.map(b => [b.id, b.spring, b.stiff, b.damp, b.grav, b.inertia, b.limit]))].join('|');
  let c = SIM.get(l.id);
  if(!c || c.key !== key){ c = { key, st: [] }; SIM.set(l.id, c); }
  const k = Math.max(0, Math.floor(Math.max(0, time) / SDT));
  for(let i = c.st.length; i <= k; i++){
    const pose = honePose(l, i * SDT);
    const st = i ? cloneSt(c.st[i - 1]) : {};
    applySprings(h, pose, SDT, st, true);
    c.st[i] = st;
  }
  const pose = honePose(l, time);
  const st = k ? cloneSt(c.st[k - 1]) : {};
  applySprings(h, pose, Math.max(1 / 240, time - (k - 1) * SDT), st, true);
  return pose;
}

/* ================= 🎯 IK =================
   えらんだ 骨（ひじから 先 など）と その 親で 2本の IK。
   先に「IKの まと」の 骨を 置いて、それを 動かすと 2本が 曲がって とどく。 */
export function addIK(l, childId){
  const h = l.hone, c = h.bones.find(b => b.id === childId);
  if(!c || !c.parent) return null;
  const p = h.bones.find(b => b.id === c.parent);
  if(!p) return null;
  const sp = setupPose(h);
  const tip = M.apply(sp[c.id].world, c.len, 0);
  const o1 = sp[p.id].world, o2 = sp[c.id].world;
  const cross = (o2.tx - o1.tx) * (tip.y - o2.ty) - (o2.ty - o1.ty) * (tip.x - o2.tx);
  const t = addBoneAt(l, 'root', tip.x, tip.y, tip.x + 24, tip.y);
  t.name = 'まと（' + c.name + '）'; t.ikTarget = true; t.len = 24;
  h.iks = h.iks || [];
  /* 親が 体の ように 子を いくつも もつ ときは、親は 曲げずに この 骨だけ 向ける。
     ひじ・ひざの ように 1本で つながって いる ときは 2本で 曲げる */
  const sibs = h.bones.filter(b => b.parent === p.id && !b.ikTarget).length;
  const two = !!p.parent && sibs === 1;
  h.iks.push({ id: uid('ik'), name: c.name, bones: two ? [p.id, c.id] : [c.id], target: t.id, mix: 1, bendPositive: cross >= 0 });
  rebind(l);
  return t;
}

/* ================= 🤖 名前から 骨を 組む =================
   パーツの 名前（PSD の レイヤー名）で あたりを つけて 骨を 立てる。
     体 … 下から 上へ   頭 … 首（体の 上）から 頭の てっぺんへ
     うで・あし … 付け根（上）から 先（下）へ   髪・しっぽ・イヤリング … 付け根から 先へ、ばね つき
   目・口・まゆ は 頭に、それ以外は 体に つける。 */
const RX = {
  body: /体|胴|からだ|body|torso|chest|むね|胸|服/i,
  head: /頭|あたま|顔|かお|head|face/i,
  arm: /腕|うで|手|hand|arm|袖/i,
  leg: /脚|足|あし|leg|foot/i,
  hair: /髪|かみ|hair|前髪|後ろ髪|もみあげ|アホ毛/i,
  tail: /尾|しっぽ|tail|リボン|ribbon/i,
  ear: /イヤリング|ピアス|earring/i,
  eye: /目|瞳|眼|まぶた|eye|iris/i,
  mouth: /口|くち|mouth|lip/i,
  brow: /眉|まゆ|brow/i
};
function roleOfName(n){
  for(const r of ['ear', 'hair', 'tail', 'brow', 'eye', 'mouth', 'head', 'arm', 'leg', 'body']) if(RX[r].test(n)) return r;
  return null;
}
function boxOf(s){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  s.verts.forEach(v => { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); });
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
/* ゆれる 骨の やわらかさ（髪は ふわっと、イヤリングは よく ゆれる） */
export const SOFT = {
  hair: { stiff: 0.07, damp: 0.9, inertia: 1.3, limit: 40 },
  ear:  { stiff: 0.05, damp: 0.93, inertia: 1.6, limit: 55 },
  tail: { stiff: 0.06, damp: 0.92, inertia: 1.4, limit: 50 }
};
export function autoBonesFromNames(l){
  const h = l.hone;
  const roles = h.slots.map(s => ({ s, r: roleOfName(s.name), b: boxOf(s) }));
  if(!roles.some(x => x.r)) return 0;
  /* いまの 骨は 根もと だけに する */
  h.bones = h.bones.filter(b => !b.parent);
  h.iks = [];
  Object.keys(l.tracks || {}).forEach(c => { if(/^H:/.test(c) && !c.startsWith('H:root:')) delete l.tracks[c]; });
  const root = h.bones[0];
  const all = roles.map(x => x.b);
  const bottom = Math.max(...all.map(b => b.y1));
  const bodyP = roles.find(x => x.r === 'body'), headP = roles.find(x => x.r === 'head');
  const B = bodyP ? bodyP.b : { cx: (Math.min(...all.map(b => b.x0)) + Math.max(...all.map(b => b.x1))) / 2, y0: Math.min(...all.map(b => b.y0)), y1: bottom, h: bottom - Math.min(...all.map(b => b.y0)) };
  root.x = B.cx; root.y = Math.min(bottom, B.y1); root.rot = -90; root.len = Math.max(30, B.h * 0.15);
  const body = addBoneAt(l, 'root', B.cx, B.y1 - B.h * 0.1, B.cx, B.y0 + B.h * 0.05);
  body.name = '体';
  let head = null;
  if(headP){
    const H = headP.b;
    head = addBoneAt(l, body.id, H.cx, Math.min(H.y1, B.y0 + B.h * 0.05), H.cx, H.y0);
    head.name = '頭';
  }
  const set = (s, id) => { s.bone = id; s.verts.forEach(v => { v.w = [{ b: id, w: 1 }]; }); };
  let n = 0;
  roles.forEach(({ s, r, b }) => {
    if(r === 'body'){ set(s, body.id); return; }
    if(r === 'head'){ set(s, head ? head.id : body.id); return; }
    if(r === 'eye' || r === 'mouth' || r === 'brow'){ set(s, head ? head.id : body.id); return; }
    if(r === 'arm' || r === 'leg'){
      const nb = addBoneAt(l, r === 'leg' ? 'root' : body.id, b.cx, b.y0 + b.h * 0.05, b.cx, b.y1 - b.h * 0.05);
      nb.name = s.name; set(s, nb.id); n++; return;
    }
    if(r === 'hair' || r === 'ear' || r === 'tail'){
      const par = (r === 'tail' ? body : head || body).id;
      const nb = addBoneAt(l, par, b.cx, b.y0 + b.h * 0.05, b.cx, b.y1 - b.h * 0.1);
      nb.name = s.name; nb.spring = true;
      Object.assign(nb, SOFT[r]);
      set(s, nb.id); n++; return;
    }
    set(s, body.id);
  });
  /* 目・口の あけ／とじ を 名前で */
  const pick = (re, sub) => (h.slots.find(s => re.test(s.name) && sub.test(s.name)) || {}).id || null;
  h.eyeClose = pick(RX.eye, /閉|とじ|close|ー/i) || h.eyeClose || null;
  h.eyeOpen = pick(RX.eye, /開|あけ|open/i) || h.eyeOpen || null;
  h.mouthOpen = pick(RX.mouth, /開|あ|open/i) || h.mouthOpen || null;
  h.mouthClose = pick(RX.mouth, /閉|ん|close/i) || h.mouthClose || null;
  rebind(l);
  return h.bones.length - 1;
}

/* ================= 👁 目・口の 切りかえ =================
   目(開)・目(閉) … まばたき（3〜4秒に 1回。いつも 同じ 時こくに なる）
   口(開)・口(閉) … 曲・声が あれば しゃべって いる あいだ ぱくぱく */
function blinkAt(l, t){
  const h = l.hone;
  if(h.blink === false) return false;
  const per = 3.6;
  const i = Math.floor(t / per);
  const r = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
  const at = i * per + 0.4 + r * 2.4;
  return t >= at && t < at + 0.13;
}
/* 口の あけ しめ は main が 声の 大きさから きめて わたす（t → true/false） */
let mouthSrc = null;
export function setMouthSource(fn){ mouthSrc = fn; }
const mouthAt = (t) => mouthSrc ? !!mouthSrc(t) : false;
export function slotShown(l, s, t){
  const h = l.hone;
  if(s.visible === false) return false;
  if(h.eyeOpen || h.eyeClose){
    const shut = blinkAt(l, t);
    if(s.id === h.eyeOpen) return !shut;
    if(s.id === h.eyeClose) return shut;
  }
  if(h.mouthOpen && h.mouthClose){
    const open = mouthAt(t);
    if(s.id === h.mouthOpen) return open;
    if(s.id === h.mouthClose) return !open;
  }
  return true;
}

export { topoBones };
