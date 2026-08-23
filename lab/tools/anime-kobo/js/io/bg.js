/* はいけい（背景）レイヤー。

   キャンバスと おなじ大きさの 1色の絵を作って、いちばん下に置く。
   ふつうのレイヤーなので、色を変える・写真に差しかえる・
   ゆっくり動かす・ぼかす が そのままできる。 */

import { S, addAsset } from '../state.js';
import { newLayer } from '../engine/layer.js';
import { loadImage } from './image.js';
import { makePattern } from './pattern.js';
import { setPin } from '../engine/anim.js';

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


/* ---------- もよう（ハート・ドット・ストライプ…） ---------- */

/** 動かし方 */
export const MOVES = {
  とめる:   [0, 0],
  よこ:     [-1, 0],
  ぎゃくよこ:[1, 0],
  たて:     [0, -1],
  ななめ:   [-1, -1]
};

/**
 * もようを 貼る。
 * うごかすときは ちょうど ひとマスぶん ずらして くり返すので、
 * つなぎ目が 見えないまま ずっと 流れる。
 *   opt = { kind, back, front, size, angle, move, speed }
 */
export async function paintPattern(layer, opt){
  const o = Object.assign({
    kind: 'ドット', back: '#FFFEF7', front: '#F2A0B8',
    size: Math.round(S.proj.w / 10), angle: 0,
    move: 'とめる', speed: 90
  }, opt || {});

  const r = makePattern(S.proj.w, S.proj.h, o);
  /* もようは すきまが無い（すけない）ので JPEG で よい。
     PNG だと スマホでは 重くなりすぎて 出ないことがある。 */
  const src = r.canvas.toDataURL('image/jpeg', 0.92);
  const img = await loadImage(src);
  const id = addAsset('もよう', src, r.canvas.width, r.canvas.height, img);

  layer.frames = [id];
  layer.visible = true;        // かくしたままだと 出てこないので
  layer.bgColor = null;
  layer.bgPattern = o;
  layer.tint = layer.tint || { color:'#F2A0B8', amount:0 };
  layer.tint.amount = 0;       // 塗りが かかっていると もようが 見えない
  layer.opacity = 1;

  // 縮めて作ったぶんを もどして、キャンバスの ドットに ぴったり合わせる
  layer.scaleX = 1 / r.k;
  layer.scaleY = 1 / r.k;
  layer.x = S.proj.w / 2;
  layer.y = S.proj.h / 2;

  // 前のうごきは 消してから 入れなおす
  layer.tracks = {};
  layer.loop = null;

  const dir = MOVES[o.move] || MOVES['とめる'];
  if(dir[0] || dir[1]){
    /* ずらす量は「絵の中のドット数で ちょうど整数」にする。
       中途はんぱだと ひとまわりしたときに 絵が わずかに ぼけて
       つなぎ目が うっすら 見えてしまう。 */
    const exact = (t) => Math.max(1, Math.round(t * r.k)) / r.k;
    const stepX = exact(r.tileW), stepY = exact(r.tileH);

    // はやさ ＝ 1秒に すすむ ドット数
    const per = Math.max(0.2, Math.min(30,
      (dir[0] ? stepX : stepY) / Math.max(1, o.speed)));
    if(dir[0]){
      setPin(layer, 'x', 0, layer.x, 'linear');
      setPin(layer, 'x', per, layer.x + dir[0] * stepX, 'linear');
    }
    if(dir[1]){
      setPin(layer, 'y', 0, layer.y, 'linear');
      setPin(layer, 'y', per, layer.y + dir[1] * stepY, 'linear');
    }
    layer.loop = { from: 0, to: per, mode: 'loop' };
  }
  return id;
}

/** もようの はいけいを 足す（無ければ 作る） */
export async function addPatternBg(opt){
  const l = S.proj.layers.find(isBg) || await addBgLayer('#FFFEF7');
  // いちばん下へ（あとから 足したときも かならず 奥に）
  const i = S.proj.layers.indexOf(l);
  if(i >= 0 && i !== S.proj.layers.length - 1){
    S.proj.layers.splice(i, 1);
    S.proj.layers.push(l);
  }
  await paintPattern(l, opt);
  return l;
}
