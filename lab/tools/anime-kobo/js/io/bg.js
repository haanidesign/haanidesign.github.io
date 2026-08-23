/* はいけい（背景）レイヤー。

   キャンバスと おなじ大きさの 1色の絵を作って、いちばん下に置く。
   ふつうのレイヤーなので、色を変える・写真に差しかえる・
   ゆっくり動かす・ぼかす が そのままできる。 */

import { S, addAsset } from '../state.js';
import { newLayer } from '../engine/layer.js';
import { loadImage } from './image.js';
import { makePattern, fitShift, PATTERNS } from './pattern.js';
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

  /* ななめの もようや ななめの 流れは、ずらす量が ひとマスを こえる。
     はしが 見えないよう、そのときは まわりを ひろく 作る。 */
  const d0 = MOVES[o.move] || MOVES['とめる'];
  const needPad = Math.min(3, (o.angle ? 2 : 1) * ((d0[0] && d0[1]) ? 2 : 1));

  /* ずらす量を きめる。
     ・もようを かたむけていたら、流す向きも 同じだけ かたむける
     ・ひとマスだけでなく 2マスぶんも 試して、
       絵の中の ドットに ぴったり はまる ものを えらぶ
     こうしないと ひとまわりしたとき 柄が つながらない。 */
  const th0 = (o.angle || 0) * Math.PI / 180;
  const cosA = Math.cos(th0), sinA = Math.sin(th0);
  const P0 = PATTERNS[o.kind] || PATTERNS['むじ'];
  const raw = P0.tile(Math.max(8, o.size || 80));
  const tw0 = Math.max(2, Math.round(raw[0])), th1 = Math.max(2, Math.round(raw[1]));

  const probe = makePattern(S.proj.w, S.proj.h, Object.assign({}, o, { pad: needPad, k: 1 }));

  let fit = { k: probe.kMax, x: 0, y: 0 };
  if(d0[0] || d0[1]){
    const wantX = cosA * (d0[0] * tw0) - sinA * (d0[1] * th1);
    const wantY = sinA * (d0[0] * tw0) + cosA * (d0[1] * th1);
    const wantLen = Math.hypot(wantX, wantY) || 1;
    let best = null;
    for(let mx = -2; mx <= 2; mx++){
      for(let my = -2; my <= 2; my++){
        if(!mx && !my) continue;
        const f = fitShift(probe.kMax, tw0, th1, o.angle || 0, mx, my);
        if(!f || !f.len) continue;
        const dot = ((f.x / f.k) * wantX + (f.y / f.k) * wantY)
                  / ((f.len / f.k) * wantLen);
        if(dot < 0.9) continue;                                  // 向きが ちがう
        if(f.len / f.k > Math.max(tw0, th1) * needPad * 1.05) continue;  // はみ出す
        const score = f.err * 1000 + (1 - dot) * 10 + (f.len / f.k) / wantLen * 0.3;
        if(!best || score < best.score) best = { score, f };
      }
    }
    if(best) fit = best.f;
    else fit = fitShift(probe.kMax, tw0, th1, o.angle || 0, d0[0], d0[1]) || fit;
  }

  const r = makePattern(S.proj.w, S.proj.h,
    Object.assign({}, o, { pad: needPad, k: fit.k }));
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

  const dir = d0;
  if(dir[0] || dir[1]){
    /* ずらす量は もようの「ひとマス ぶん」にする。
       かたむけているときは、もようと 同じ向きに かたむけて ずらす。
       そうしないと ひとまわりしたときに 柄が つながらない。

       さらに 絵の中のドット数で 整数に そろえる。
       中途はんぱだと つなぎ目が うっすら 見えてしまう。 */
    // 絵の中で 整数ドットぶん ずらす（そのまま キャンバスの ドット数に なおす）
    const stepX = fit.x / r.k, stepY = fit.y / r.k;
    const len = Math.max(1, Math.hypot(stepX, stepY));

    // はやさ ＝ 1秒に すすむ ドット数
    const per = Math.max(0.2, Math.min(30, len / Math.max(1, o.speed)));

    if(Math.abs(stepX) > 0.01){
      setPin(layer, 'x', 0, layer.x, 'linear');
      setPin(layer, 'x', per, layer.x + stepX, 'linear');
    }
    if(Math.abs(stepY) > 0.01){
      setPin(layer, 'y', 0, layer.y, 'linear');
      setPin(layer, 'y', per, layer.y + stepY, 'linear');
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
