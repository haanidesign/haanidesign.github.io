/* レイヤーの形と、そこから世界の位置を出す計算。
   PHASE 1 ではトランスフォームは静的な値。PHASE 2 でここにピン（キーフレーム）が乗る。 */

import { M, uid, ptInQuad } from './math.js';
import { valuesAt as evalAt } from './anim.js';

/** レイヤーを1つ作る。frames はアセットIDの配列＝コマ列（PHASE 1 では1枚） */
export function newLayer(name, assetIds){
  return {
    id: uid('L'),
    name: name || 'レイヤー',
    frames: assetIds ? [...assetIds] : [],
    visible: true,
    parent: null,       // 親レイヤーのid（PHASE 2）
    clip: false,        // 下のレイヤーで抜く（PHASE 2）

    // トランスフォーム
    x: 0, y: 0,         // キャンバス座標。回転軸がここに来る
    rot: 0,
    scaleX: 1, scaleY: 1,
    lockAspect: true,   // たてよこの比をそろえたままにするか
    opacity: 1,

    // 絵の中のどこを中心に回すか（0.5,0.5 = まんなか）
    pivot: { x: 0.5, y: 0.5 },

    tracks: {},         // ch -> [{t,v,c}]  ピン
    loop: null,         // { from, to, mode:'loop'|'pingpong' }

    // エフェクト
    pins: [],           // パペットピン
    stiff: 1.4,         // ピンのかたさ。大きいほど骨っぽく、小さいほどやわらかい
    mesh: null,         // ピンを刺したときに張るあみ（保存はしない）

    tint: { color:'#F2A0B8', amount:0 },   // 塗り（色と強さ）
    blur: 0,                                // ぼかし（px）
    flipX: false, flipY: false              // 反転
  };
}

export { evalAt as valuesAt };

/**
 * 全レイヤーのワールド行列を出す。
 * 親を先に計算する必要があるので、親をたどりながら memo する。
 * 戻り値: { [layerId]: { m, v, asset } }
 */
export function computeAll(project, time){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);

  const out = {};
  const solving = {};

  const solve = (l) => {
    if(out[l.id]) return out[l.id];
    if(solving[l.id]) return null;      // 親子が輪になっていたら諦める
    solving[l.id] = true;

    const v = evalAt(l, time);
    const local = M.trs(v.x, v.y, v.rot, v.scaleX, v.scaleY);
    const p = (l.parent && byId[l.parent]) ? solve(byId[l.parent]) : null;
    const m = p ? M.mul(p.m, local) : local;

    solving[l.id] = false;
    return out[l.id] = { m, v, layer: l };
  };

  project.layers.forEach(solve);
  return out;
}

/** レイヤーの画像がキャンバス上で占める四隅を返す */
export function cornersOf(layer, m, asset){
  if(!asset) return null;
  const w = asset.w, h = asset.h;
  const ox = -w * layer.pivot.x;
  const oy = -h * layer.pivot.y;
  return [
    M.apply(m, ox,     oy),
    M.apply(m, ox + w, oy),
    M.apply(m, ox + w, oy + h),
    M.apply(m, ox,     oy + h)
  ];
}

/** そのレイヤーが (x,y) を含んでいるか */
export function hitsLayer(layer, pose, assets, x, y){
  if(!layer || !layer.visible || !pose) return false;
  const asset = assets[layer.frames[pose.v.frame] || layer.frames[0]];
  const q = cornersOf(layer, pose.m, asset);
  return !!(q && ptInQuad(x, y, q));
}

/** キャンバス座標 (x,y) にあるレイヤーを、手前から探す */
export function pickLayer(project, poses, assets, x, y){
  // layers[0] が一番手前なので、そのまま前から見る
  for(const l of project.layers){
    if(!l.visible) continue;
    const p = poses[l.id]; if(!p) continue;
    const asset = assets[l.frames[p.v.frame] || l.frames[0]];
    const q = cornersOf(l, p.m, asset);
    if(q && ptInQuad(x, y, q)) return l;
  }
  return null;
}

/** そのレイヤーの子孫かどうか（親子付けの輪を防ぐ） */
export function isDescendant(project, id, ofId){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);
  let cur = byId[id];
  let guard = 0;
  while(cur && cur.parent && guard++ < 200){
    if(cur.parent === ofId) return true;
    cur = byId[cur.parent];
  }
  return false;
}
