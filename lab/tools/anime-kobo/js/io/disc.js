/* ⭕ まるの 背景。1色の 地に まるを 1つ のせた 絵を 焼いて、いちばん 下に 置く。 */

import { S, addAsset } from '../state.js?v=304';
import { newLayer } from '../engine/layer.js?v=304';
import { loadImage } from './image.js?v=304';

export function newDisc(){
  return { bg: '#3FA7A0', color: '#F2D54B', size: 0.8, cx: 0.5, cy: 0.5 };
}

export async function addDiscLayer(opt, layer){
  const o = Object.assign(newDisc(), opt || {});
  const k = Math.min(1, 1200 / Math.max(S.proj.w, S.proj.h));
  const w = Math.max(2, Math.round(S.proj.w * k));
  const h = Math.max(2, Math.round(S.proj.h * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
  g.fillStyle = o.color;
  g.beginPath();
  g.arc(w * o.cx, h * o.cy, Math.min(w, h) * o.size / 2, 0, Math.PI * 2);
  g.fill();
  const src = c.toDataURL('image/png');
  const id = addAsset('まる背景', src, w, h, await loadImage(src));
  const l = layer || newLayer('まる背景', []);
  l.frames = [id];
  l.disc = o;
  l.scaleX = 1 / k; l.scaleY = 1 / k;
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  if(!layer){ S.proj.layers.push(l); S.sel = l.id; }
  return l;
}

export const isDisc = (l) => !!(l && l.disc);
