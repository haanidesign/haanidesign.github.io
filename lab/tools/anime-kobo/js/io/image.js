/* JPEG / PNG の読み込み。
   PNG を複数枚まとめて選んだときは、名前順に並べて1レイヤーのコマ列にする。 */

import { S, addAsset, edit, WORK_KEYS } from '../state.js?v=283';
import { newLayer } from '../engine/layer.js?v=283';
import { pinChX, pinChY, warpChX, warpChY, maskChX, maskChY, valuesAt } from '../engine/anim.js?v=283';
import { masksOf } from '../engine/mask.js?v=283';

/** File を dataURL にする */
export function readAsDataURL(file){
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => res(rd.result);
    rd.onerror = () => rej(new Error(file.name + ' を読めませんでした'));
    rd.readAsDataURL(file);
  });
}

/** dataURL から読み込み済みの Image を作る */
export function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('画像を開けませんでした'));
    im.src = src;
  });
}

/** 透明でない部分の外接矩形。全部透明なら null */
export function contentBox(cv){
  const g = cv.getContext('2d', { willReadFrequently:true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for(let y = 0; y < cv.height; y++){
    for(let x = 0; x < cv.width; x++){
      if(d[(y*cv.width + x)*4 + 3] > 8){
        if(x < x0) x0 = x;
        if(x > x1) x1 = x;
        if(y < y0) y0 = y;
        if(y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** ファイル名から数字を取り出して連番として並べる（img2 が img10 より前に来るように） */
function byNumberThenName(a, b){
  const na = (a.name.match(/(\d+)(?!.*\d)/) || [])[1];
  const nb = (b.name.match(/(\d+)(?!.*\d)/) || [])[1];
  if(na !== undefined && nb !== undefined && a.name.replace(/\d+(?!.*\d)/,'') === b.name.replace(/\d+(?!.*\d)/,'')){
    return (+na) - (+nb);
  }
  return a.name.localeCompare(b.name, 'ja', { numeric:true });
}

/**
 * 画像ファイルを読み込んでレイヤーにする。
 * asFrames が true なら全部を1レイヤーのコマ列に、false なら1枚ずつ別レイヤーに。
 */
export async function addImageFiles(files, asFrames){
  const list = [...files].filter(f => /^image\//.test(f.type)).sort(byNumberThenName);
  if(!list.length) return 0;

  const loaded = [];
  for(const f of list){
    const src = await readAsDataURL(f);
    const im = await loadImage(src);
    const name = f.name.replace(/\.[a-z0-9]+$/i, '');
    loaded.push({ name, src, im });
  }

  edit(list.length > 1 ? '画像をよみこみ' : (loaded[0].name + ' をよみこみ'), () => {
    const cx = S.proj.w / 2, cy = S.proj.h / 2;

    if(asFrames && loaded.length > 1){
      const ids = loaded.map(o => addAsset(o.name, o.src, o.im.naturalWidth, o.im.naturalHeight, o.im));
      const l = newLayer(loaded[0].name.replace(/\d+$/, '') || 'コマ', ids);
      fitIntoCanvas(l, loaded[0].im);
      l.x = cx; l.y = cy;
      S.proj.layers.unshift(l);
      S.sel = l.id;
    } else {
      // 後ろの絵から順に積むと、選んだ順が上から並ぶ
      for(let i = loaded.length - 1; i >= 0; i--){
        const o = loaded[i];
        const id = addAsset(o.name, o.src, o.im.naturalWidth, o.im.naturalHeight, o.im);
        const l = newLayer(o.name, [id]);
        fitIntoCanvas(l, o.im);
        l.x = cx; l.y = cy;
        S.proj.layers.unshift(l);
        S.sel = l.id;
      }
    }
  });

  return loaded.length;
}

/** いま選んでいるレイヤーに、コマとして絵を足す */
export async function addFramesToLayer(files, layer){
  const list = [...files].filter(f => /^image\//.test(f.type)).sort(byNumberThenName);
  if(!list.length) return 0;

  const loaded = [];
  for(const f of list){
    const src = await readAsDataURL(f);
    const im = await loadImage(src);
    loaded.push({ name: f.name.replace(/\.[a-z0-9]+$/i, ''), src, im });
  }

  edit(loaded.length + 'コマ ついか', () => {
    loaded.forEach(o => {
      const id = addAsset(o.name, o.src, o.im.naturalWidth, o.im.naturalHeight, o.im);
      layer.frames.push(id);
    });
  });
  return loaded.length;
}

/** 大きすぎる絵はキャンバスに収まるところまで縮める */
export function fitIntoCanvas(layer, img){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const k = Math.min(1, (S.proj.w * 0.9) / w, (S.proj.h * 0.9) / h);
  layer.scaleX = k; layer.scaleY = k;
}


/* ================= 絵だけ 入れかえる =================

   アフターエフェクトの「フッテージを 置き換え」と 同じ かんがえ方。
   動き（ピン・親子・タイミング・エフェクト）は そのままで、
   はっている 絵 だけを すげかえる。

   絵の 大きさが かわった ときは、
     ・ピン と ゆがみ と マスク … 絵の 中の ざひょう なので、
       同じ ところを さす ように 大きさの 比で なおす
     ・見た目の 大きさ … 前と 同じに なる ように 拡大率を 直す
   ここを やらないと、入れかえた とたん 骨が 絵の そとに 出て しまう。 */

/** 絵の 大きさが かわった ぶん、絵の中の ざひょうを なおす */
function rescaleInside(l, ow, oh, nw, nh, keepSize){
  const sx = ow ? nw / ow : 1, sy = oh ? nh / oh : 1;
  if(Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return;
  const tr = l.tracks || {};

  (l.pins || []).forEach(p => {
    p.u *= sx; p.v *= sy;
    p.dx = (p.dx || 0) * sx; p.dy = (p.dy || 0) * sy;
    const kx = tr[pinChX(p.id)], ky = tr[pinChY(p.id)];
    if(kx) kx.forEach(k => { k.v *= sx; });
    if(ky) ky.forEach(k => { k.v *= sy; });
  });

  if(l.cage && l.cage.pts){
    l.cage.w *= sx; l.cage.h *= sy;
    l.cage.pts.forEach((p, i) => {
      p.x *= sx; p.y *= sy;
      const kx = tr[warpChX(i)], ky = tr[warpChY(i)];
      if(kx) kx.forEach(k => { k.v *= sx; });
      if(ky) ky.forEach(k => { k.v *= sy; });
    });
  }

  masksOf(l).forEach((m, mi) => {
    (m.pts || []).forEach((p, pi) => {
      p.x *= sx; p.y *= sy;
      const kx = tr[maskChX(mi, pi)], ky = tr[maskChY(mi, pi)];
      if(kx) kx.forEach(k => { k.v *= sx; });
      if(ky) ky.forEach(k => { k.v *= sy; });
    });
  });

  if(keepSize){
    // 見た目の 大きさを 前と そろえる（絵の ドット数が かわった ぶんを 打ち消す）
    l.scaleX = (l.scaleX == null ? 1 : l.scaleX) / sx;
    l.scaleY = (l.scaleY == null ? 1 : l.scaleY) / sy;
    if(tr.scaleX) tr.scaleX.forEach(k => { k.v /= sx; });
    if(tr.scaleY) tr.scaleY.forEach(k => { k.v /= sy; });
  }
}

/** あみ など、絵から 作り直す ものを 捨てる（次に 描くとき 張り直す） */
function dropWork(l){
  WORK_KEYS.forEach(k => { if(k in l) delete l[k]; });
  l._maskKey = null;
  l._meshN = null;
}

/**
 * レイヤーの 絵だけ 入れかえる。
 *   files … えらんだ 画像
 *   layer … 入れかえる レイヤー
 *   opt.all    … true なら コマ ぜんぶ、false なら いまの コマ だけ
 *   opt.keepSize … 見た目の 大きさを そのままに する（はじめは する）
 * かえりは 入れかえた まい数。
 */
export async function replaceLayerImages(files, layer, opt = {}){
  const list = [...files].filter(f => /^image\//.test(f.type)).sort(byNumberThenName);
  if(!list.length) return 0;
  if(!layer || !layer.frames || !layer.frames.length) return 0;

  const loaded = [];
  for(const f of list){
    const src = await readAsDataURL(f);
    const im = await loadImage(src);
    loaded.push({ name: f.name.replace(/\.[a-z0-9]+$/i, ''), src, im });
  }

  const at = Math.max(0, Math.min(layer.frames.length - 1,
                                  opt.frame == null ? valuesAt(layer, S.time).frame : opt.frame));
  const before = S.proj.assets[layer.frames[at]];
  const ow = before ? before.w : loaded[0].im.naturalWidth;
  const oh = before ? before.h : loaded[0].im.naturalHeight;
  const nw = loaded[0].im.naturalWidth, nh = loaded[0].im.naturalHeight;

  edit('絵を 入れかえる', () => {
    const ids = loaded.map(o => addAsset(o.name, o.src,
                                         o.im.naturalWidth, o.im.naturalHeight, o.im));
    if(!opt.all){
      layer.frames[at] = ids[0];
    } else if(ids.length === 1){
      layer.frames = layer.frames.map(() => ids[0]);
    } else {
      /* えらんだ まい数が コマ数に なる（足りない ぶんは 消える・ふえる） */
      layer.frames = ids;
    }
    rescaleInside(layer, ow, oh, nw, nh, opt.keepSize !== false);
    dropWork(layer);

    /* どこからも つかわれなく なった 絵は 捨てる。
       のこすと ほぞんする ファイルが どんどん ふくらむ
       （入れかえる たびに 古い 絵が たまる）。 */
    const used = new Set();
    S.proj.layers.forEach(x => (x.frames || []).forEach(id => used.add(id)));
    Object.keys(S.proj.assets).forEach(id => {
      if(!used.has(id)) delete S.proj.assets[id];
    });
  });

  return loaded.length;
}
