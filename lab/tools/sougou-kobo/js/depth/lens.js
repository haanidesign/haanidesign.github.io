/* 🔭 深度レンズ（深度レンズ の 道具を レイヤーに かける もの）
   絵の 奥行きを AI で 読み（白が 手前・黒が 奥）、距離で 加工する。
     ぼかし … あとから ピントを 変える（ポートレート風）
     霧     … 奥ほど こく
     色調   … 奥だけ モノクロ・セピア など
     ライト … 写真の 中に 光を 置く
     切り抜き … 距離で 被写体を 抜き出す
     立体   … 視点を ゆらして「動く 写真」（作品の 時間で 動く ので 書き出しにも 入る）
   l.dlens に 数字を もつ（深度レンズ と 同じ 0〜100 の 目もり）。深度は 素材として のこす。 */
import { S, addAsset } from '../state.js?v=436';
import { makeGL } from './gl.js?v=436';

export function newLens(){
  return {
    on: true, dep: null, view: 0,
    blur: { on: true, focus: 63, range: 3, f: 45, front: true },
    fog: { on: false, col: '#e6ebf0', dens: 55, start: 25, low: 40, glow: 30 },
    tone: { on: false, mode: 0, split: 50, soft: 8, amt: 100, pop: 20, col: '#6f8fd8' },
    light: { on: false, list: [], sel: 0, amb: 43, bump: 30, shadow: true },
    cut: { on: false, near: 100, far: 45, soft: 3, bg: 0, col: '#ffffff' },
    tri: { on: false, amp: 70, sec: 4 }
  };
}
export const LIGHT_PRE = [['電球色', '#ffb46b'], ['白', '#ffffff'], ['夕日', '#ff7a3a'], ['月光', '#8fb4ff'], ['桜色', '#ff9ccf'], ['若葉', '#a6ec6e']];

/* ---------- 絵を つくる（WebGL を 1つ だけ もって 使い回す） ---------- */
let G = null, glCv = null, gImg = null, gDep = null, gW = 0, gH = 0;
function gl(){
  if(G) return G;
  glCv = document.createElement('canvas');
  try{ G = makeGL(glCv); }catch(e){ console.warn('深度レンズ: WebGL2 が つかえない', e); G = false; }
  return G;
}
const MAXPX = 1600;
let shrinkC = null;
function sized(img){
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, MAXPX / Math.max(w, h));
  if(k >= 1) return img;
  shrinkC = shrinkC || document.createElement('canvas');
  shrinkC.width = Math.round(w * k); shrinkC.height = Math.round(h * k);
  const g = shrinkC.getContext('2d'); g.clearRect(0, 0, shrinkC.width, shrinkC.height);
  g.drawImage(img, 0, 0, shrinkC.width, shrinkC.height);
  return shrinkC;
}

function params(L, t, W, H){
  const b = L.blur, f = L.fog, o = L.tone, l = L.light, c = L.cut, r = L.tri;
  const M = Math.max(W, H), fv = b.f / 100;
  let off = [0, 0];
  if(r && r.on){
    const a = r.amp / 100 * 0.035, w = (t || 0) * Math.PI * 2 / Math.max(0.5, r.sec || 4);
    off = [Math.sin(w) * a, Math.cos(w) * a * 0.5];
  }
  return {
    mode: L.view === 1 ? 1 : 0,
    chk: 0,
    off, pivot: b.on ? b.focus / 100 : 0.5,
    blur: { on: b.on, front: b.front, focus: b.focus / 100, range: b.range / 100, max: M * 0.032 * Math.pow(fv, 1.3) },
    fog: { on: f.on, col: f.col, dens: f.dens / 100, start: f.start / 100, low: f.low / 100, glow: f.glow / 100 },
    tone: { on: o.on, mode: o.mode, split: o.split / 100, soft: Math.max(0.005, o.soft / 100), amt: o.amt / 100, pop: o.pop / 100, col: o.col },
    light: {
      on: l.on, shadow: l.shadow, amb: l.amb / 100 * 0.85, bump: l.bump / 100,
      list: l.list.map(q => ({ x: q.x, y: q.y, z: q.z / 100, col: q.col, i: q.i / 100, r: 0.04 + Math.pow(q.r / 100, 1.5) * 1.2 }))
    },
    cut: { on: c.on, bg: c.bg, near: c.near / 100, far: c.far / 100, soft: Math.max(0.004, c.soft / 100), col: c.col }
  };
}

/** レイヤーの 絵に 深度レンズを かけた canvas。かけられない ときは null（もとの 絵の まま） */
export function lensCanvas(l, img, t){
  const L = l.dlens;
  if(!L || !L.on || !L.dep || !img) return null;
  const dimg = S.imgs[L.dep];
  if(!dimg || !(dimg.naturalWidth || dimg.width)) return null;
  const g = gl(); if(!g) return null;
  const moving = L.tri && L.tri.on;
  const key = JSON.stringify(L) + '|' + (img.src || img.width + 'x' + img.height) + (moving ? '|' + (+t).toFixed(3) : '');
  if(l._dlKey === key && l._dlC) return l._dlC;
  const src = sized(img);
  if(gImg !== img || gW !== src.width || gH !== src.height){ g.setImage(src); gImg = img; gW = src.width; gH = src.height; gDep = null; }
  if(gDep !== dimg){ g.setDepth(dimg); gDep = dimg; }
  g.draw(params(L, t, gW, gH));
  if(!l._dlC){ l._dlC = document.createElement('canvas'); }
  const o = l._dlC;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if(o.width !== w || o.height !== h){ o.width = w; o.height = h; }
  const og = o.getContext('2d');
  og.clearRect(0, 0, w, h);
  og.drawImage(glCv, 0, 0, w, h);
  o.complete = true; o.naturalWidth = w; o.naturalHeight = h;
  l._dlKey = key;
  return o;
}

/* ---------- AI で 奥行きを 読む ---------- */
/** 深度を 0〜255 に のばして（深度レンズ と 同じ やり方）、素材に して id を かえす */
function stretch(c, w, h){
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  const g = o.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  const n = p.length / 4, hist = new Float64Array(256);
  for(let i = 0; i < p.length; i += 4){ const v = Math.round((p[i] * 3 + p[i + 1] * 6 + p[i + 2]) / 10); p[i] = v; hist[v]++; }
  const cdf = new Float64Array(256); let acc = 0;
  for(let v = 0; v < 256; v++){ acc += hist[v]; cdf[v] = acc / n; }
  let lo = 0, hi = 255;
  while(lo < 255 && cdf[lo] < 0.01) lo++;
  while(hi > lo && cdf[hi - 1] > 0.99) hi--;
  const map = new Uint8Array(256);
  for(let v = 0; v < 256; v++){
    const lin = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : v / 255;
    map[v] = Math.round((0.5 * lin + 0.5 * cdf[v]) * 255);
  }
  for(let i = 0; i < p.length; i += 4){ const v = map[p[i]]; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return o;
}

/** 絵（img）の 深度を AI で 出して 素材に する。もどり: 素材の id */
export async function readDepth(img, name, onProg){
  const { estimate } = await import('./ai.js?v=436');
  const src = sized(img);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  const out = await estimate(c, onProg);
  const d = stretch(out, c.width, c.height);
  const url = d.toDataURL('image/png');
  const im = new Image(); im.src = url;
  await new Promise(r => { im.onload = r; im.onerror = r; });
  return addAsset((name || '絵') + 'の 深度', url, d.width, d.height, im);
}

/** 深度の 値（0〜1）。u,v は 絵の 中の わりあい（0〜1） */
export function depthAt(l, u, v){
  const L = l.dlens; if(!L || !L.dep) return 0.5;
  const im = S.imgs[L.dep]; if(!im) return 0.5;
  if(!l._dlPx || l._dlPxId !== L.dep){
    const w = Math.min(512, im.naturalWidth || im.width), h = Math.max(1, Math.round(w * (im.naturalHeight || im.height) / (im.naturalWidth || im.width)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, w, h);
    l._dlPx = { w, h, d: g.getImageData(0, 0, w, h).data }; l._dlPxId = L.dep;
  }
  const P = l._dlPx;
  const x = Math.min(P.w - 1, Math.max(0, Math.round(u * P.w))), y = Math.min(P.h - 1, Math.max(0, Math.round(v * P.h)));
  return P.d[(y * P.w + x) * 4] / 255;
}

/** 人に ピントを 合わせる（絵の まん中あたりの 深さの まん中） */
export function autoFocus(l){
  const L = l.dlens; if(!L) return;
  const v = [];
  for(let y = 0.2; y < 0.6; y += 0.02) for(let x = 0.3; x < 0.7; x += 0.02) v.push(depthAt(l, x, y));
  v.sort((a, b) => a - b);
  const f = Math.round(v[v.length >> 1] * 100);
  L.blur.focus = f; L.tone.split = Math.max(0, f - 15); L.cut.far = Math.max(0, f - 15);
}
