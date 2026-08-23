/* はいけい（背景）レイヤー。

   キャンバスと おなじ大きさの 1色の絵を作って、いちばん下に置く。
   ふつうのレイヤーなので、色を変える・写真に差しかえる・
   ゆっくり動かす・ぼかす が そのままできる。 */

import { S, addAsset } from '../state.js';
import { newLayer } from '../engine/layer.js';
import { loadImage } from './image.js';

export const isBg = (l) => !!l && l.kind === 'bg';

/** 1色ぬりつぶしの絵を作る。大きすぎると重いので すこし小さめに作って引きのばす */
const MAX = 1200;

export async function paintBg(layer, color){
  const k = Math.min(1, MAX / Math.max(S.proj.w, S.proj.h));
  const w = Math.max(2, Math.round(S.proj.w * k));
  const h = Math.max(2, Math.round(S.proj.h * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const src = c.toDataURL('image/png');
  const id = addAsset('はいけい', src, w, h, await loadImage(src));
  layer.frames = [id];
  layer.bgColor = color;
  fitToCanvas(layer);
  return id;
}

/** キャンバスに ぴったり合わせる（写真に差しかえたときにも使う） */
export function fitToCanvas(layer){
  const a = S.proj.assets[layer.frames[0]];
  if(!a) return;
  const k = Math.max(S.proj.w / a.w, S.proj.h / a.h);   // すきまが出ないように
  layer.scaleX = k; layer.scaleY = k;
  layer.x = S.proj.w / 2;
  layer.y = S.proj.h / 2;
}

/** はいけいを 足す。すでにあれば それを返す */
export async function addBgLayer(color){
  const has = S.proj.layers.find(isBg);
  if(has) return has;
  const l = newLayer('はいけい', []);
  l.kind = 'bg';
  l.lockAspect = true;
  await paintBg(l, color || '#BFE3F5');
  S.proj.layers.push(l);      // いちばん下（配列の さいご が いちばん奥）
  S.sel = l.id;
  return l;
}
