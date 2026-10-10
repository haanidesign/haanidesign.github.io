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
         autoWeights, uid, topoBones } from './core.js?v=354';
import { sample, mapTime, remapTime } from '../engine/anim.js?v=354';
import { newLayer } from '../engine/layer.js?v=354';
import { S } from '../state.js?v=354';

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
  const pose = (S.honeMode && S.honeSetup && S.sel === l.id) ? setupPose(H) : honePose(l, time);
  l._hnPose = pose;
  for(const s of H.slots){
    if(s.visible === false) continue;
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

export { topoBones };
