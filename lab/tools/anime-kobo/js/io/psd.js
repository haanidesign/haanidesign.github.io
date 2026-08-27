/* PSD の読み込み。レイヤーをそのままレイヤーにする。
   位置・重なり順・不透明度をPSDのまま引き継ぐので、並べ直す作業が要らない。
   ミニSpine で実測済みの ag-psd をそのまま使う。 */

import { S, addAsset, edit } from '../state.js?v=75';
import { newLayer, newFolder, setParent } from '../engine/layer.js?v=75';
import { contentBox, loadImage } from './image.js?v=75';

/** 透明な余白を切り落として left/top を詰め直す */
function trim(l){
  const box = contentBox(l.canvas);
  if(!box) return null;
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if(x0 === 0 && y0 === 0 && w === l.canvas.width && h === l.canvas.height){
    l.width = w; l.height = h;
    return l;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(l.canvas, x0, y0, w, h, 0, 0, w, h);
  l.canvas = c;
  l.left += x0; l.top += y0;
  l.width = w; l.height = h;
  return l;
}

/* ag-psd の children は PSD ファイルの記録順＝奥から手前。（ミニSpineで実測済み） */
function flatten(node, out, groupName){
  for(const ch of (node.children || [])){
    if(ch.hidden) continue;
    if(ch.children) flatten(ch, out, ch.name || groupName);
    else if(ch.canvas) out.push({
      name: ch.name || 'レイヤー',
      canvas: ch.canvas,
      left: ch.left || 0,
      top: ch.top || 0,
      opacity: ch.opacity === undefined ? 1 : ch.opacity,
      group: groupName || null
    });
  }
}

/**
 * PSD を読み込む。
 * replaceSize が true なら、キャンバスの大きさも PSD に合わせる。
 */
/** 大きすぎる絵はスマホのメモリを食うので、長辺をこのくらいまで落とす */
const MAX_SIDE = 1600;

/** 必要なら縮小して、そのぶんの倍率を返す */
function shrink(l){
  const long = Math.max(l.width, l.height);
  if(long <= MAX_SIDE) return 1;
  const k = MAX_SIDE / long;
  const w = Math.max(1, Math.round(l.width * k));
  const h = Math.max(1, Math.round(l.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(l.canvas, 0, 0, w, h);
  l.canvas = c;
  l.width = w; l.height = h;
  return k;
}

export async function importPsd(file, opts = {}){
  if(typeof agPsd === 'undefined') throw new Error('PSDの読み込み部品が見つかりません');

  let psd;
  try{
    const buf = await file.arrayBuffer();
    psd = agPsd.readPsd(buf, { skipCompositeImageData:true, skipThumbnail:true });
  }catch(err){
    // 何が起きたか分かる形で返す（スマホだと容量不足のことが多い）
    const m = String(err && err.message || err);
    if(/memory|allocation|Array buffer allocation/i.test(m)){
      throw new Error('PSDが大きすぎて開けませんでした。レイヤーを減らすか、小さくして試してください');
    }
    throw new Error('PSDを開けませんでした（' + m.slice(0, 60) + '）');
  }
  if(!psd || !psd.width) throw new Error('PSDとして読めませんでした');

  const flat = [];
  flatten(psd, flat, null);
  if(!flat.length) throw new Error('表示されているレイヤーが見つかりませんでした');

  const layers = flat.map(trim).filter(Boolean);
  if(!layers.length) throw new Error('中身のあるレイヤーが見つかりませんでした');

  // PSDをキャンバスのどこに置くか。中央に、はみ出すなら縮めて収める
  const k = opts.fit === false ? 1
          : Math.min(1, S.proj.w / psd.width, S.proj.h / psd.height);
  const offX = (S.proj.w - psd.width  * k) / 2;
  const offY = (S.proj.h - psd.height * k) / 2;

  // canvas から Image を先に作っておく（描画時に未ロードだと出ない）
  const prepared = [];
  for(const l of layers){
    const shrunk = shrink(l);          // 大きすぎる絵はここで小さくする
    const src = l.canvas.toDataURL('image/png');
    prepared.push({ l, src, shrunk, img: await loadImage(src) });
  }

  edit(file.name + ' をよみこみ', () => {
    const made = [];    // { lay, group }
    // 奥から手前の順で来るので、unshift で積むと手前が先頭になる
    for(const { l, src, shrunk, img } of prepared){
      const id = addAsset(l.name, src, l.width, l.height, img);
      const lay = newLayer(l.name, [id]);
      lay.opacity = Math.max(0, Math.min(1, l.opacity));
      // 縮小したぶんは拡大しなおして、見た目の大きさを元どおりにする
      lay.scaleX = k / shrunk;
      lay.scaleY = k / shrunk;
      // l.width/height は縮小後なので、PSD での大きさに戻してから中心を出す
      const wOrig = l.width  / shrunk;
      const hOrig = l.height / shrunk;
      lay.x = offX + (l.left + wOrig / 2) * k;
      lay.y = offY + (l.top  + hOrig / 2) * k;
      S.proj.layers.unshift(lay);
      made.push({ lay, group: l.group || null });
    }

    /* PSD のグループは そのままフォルダにする。
       グループ名ごとに1つ作り、中身を入れる。
       この時点では フォルダの回転じくは まん中に置きたいので、
       中身の位置から出しておく（setParent が 見た目を保つ）。 */
    const names = [...new Set(made.map(m => m.group).filter(Boolean))];
    for(const gname of names){
      const kids = made.filter(m => m.group === gname).map(m => m.lay);
      if(kids.length < 1) continue;
      const f = newFolder(gname);
      f.x = kids.reduce((a, k) => a + k.x, 0) / kids.length;
      f.y = kids.reduce((a, k) => a + k.y, 0) / kids.length;
      // 中身のいちばん手前の位置に フォルダを置く
      const at = Math.min(...kids.map(k => S.proj.layers.indexOf(k)));
      S.proj.layers.splice(at, 0, f);
      kids.forEach(k => setParent(S.proj, k, f.id, 0));
    }

    S.sel = S.proj.layers[0] ? S.proj.layers[0].id : null;
  });

  return { count: layers.length, w: psd.width, h: psd.height };
}
