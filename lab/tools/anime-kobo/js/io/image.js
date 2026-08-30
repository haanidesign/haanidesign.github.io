/* JPEG / PNG の読み込み。
   PNG を複数枚まとめて選んだときは、名前順に並べて1レイヤーのコマ列にする。 */

import { S, addAsset, edit } from '../state.js?v=99';
import { newLayer } from '../engine/layer.js?v=99';

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
