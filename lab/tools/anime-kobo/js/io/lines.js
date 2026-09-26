/* 💥 集中線・流線。

   マンガの「ぐっと 寄る」線。まん中へ 集まる のが 集中線、
   よこに ながれる のが 流線。

   どう つくるか
     絵を 何まいか 焼いて、順ぐりに 出す（パラパラと 同じ）。
     そうすると
       ・ふつうの レイヤーに なる（動かす・重ねる・書き出す が そのまま）
       ・1コマごとに 線を 引き直す ので、手がきの あの ちらつきが 出る
     本もの の マンガ動画も、毎コマ 線を 引き直して いる。

   線だけの 絵なので、ほとんどが すきま（透明）。
   PNGに すると とても 小さく なる ので、何まい 焼いても 軽い。 */

import { S, addAsset } from '../state.js?v=297';
import { newLayer } from '../engine/layer.js?v=297';
import { loadImage } from './image.js?v=297';
import { setPin } from '../engine/anim.js?v=297';

/** はじめの 数字 */
export function newLines(){
  return {
    kind: 'しゅうちゅう',  // しゅうちゅう / ながれ
    color: '#1E1C14',
    count: 120,          // 本数
    thick: 1.0,          // 太さ（ばい）
    hole: 0.34,          // まん中の あき（みじかいほう の 何わり）
    jitter: 0.5,         // ちらつき（0〜1）
    frames: 6,           // 何まい 焼くか
    fps: 12,             // 1秒に 何コマ
    cx: 0.5, cy: 0.5,    // まん中（わりあい）
    angle: 0             // 流線の むき（度）
  };
}

/* 線を 1本 引く。
   まん中から そとへ 向かって、ねもとが 細く さきが 太い くさび形。
   （まっすぐな 線だと 印刷っぽく なりすぎる） */
function wedge(g, x0, y0, x1, y1, w0, w1){
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a), ny = Math.cos(a);
  g.beginPath();
  g.moveTo(x0 + nx * w0, y0 + ny * w0);
  g.lineTo(x1 + nx * w1, y1 + ny * w1);
  g.lineTo(x1 - nx * w1, y1 - ny * w1);
  g.lineTo(x0 - nx * w0, y0 - ny * w0);
  g.closePath();
  g.fill();
}

/* 同じ 見た目を もう一度 出せる ように、じぶんで 作る でたらめ。
   （毎回 ちがう と、書き出す たびに 絵が 変わって しまう） */
function rng(seed){
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** 1コマ ぶんを 焼く */
export function paintLines(w, h, o, frame){
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = o.color || '#1E1C14';

  const R = rng(frame * 7919 + 13);
  const n = Math.max(4, Math.round(o.count || 120));
  const jit = Math.max(0, Math.min(1, o.jitter == null ? 0.5 : o.jitter));
  const thick = Math.max(0.1, o.thick || 1);
  const short = Math.min(w, h);
  const far = Math.hypot(w, h);            // すみまで とどく 長さ

  if(o.kind === 'ながれ'){
    /* 流線。よこ（えらんだ むき）に ながれる 線。 */
    const a = (o.angle || 0) * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);       // ながれる むき
    const vx = -uy, vy = ux;                        // ならぶ むき
    const cx = w / 2, cy = h / 2;
    for(let i = 0; i < n; i++){
      const t = (i + 0.5) / n - 0.5;                // -0.5 〜 0.5
      const off = t * far + (R() - 0.5) * (far / n) * jit * 2;
      const len = far * (0.18 + R() * 0.5);
      const mid = (R() - 0.5) * far * 0.5;
      const x0 = cx + vx * off + ux * (mid - len / 2);
      const y0 = cy + vy * off + uy * (mid - len / 2);
      const x1 = cx + vx * off + ux * (mid + len / 2);
      const y1 = cy + vy * off + uy * (mid + len / 2);
      const wd = (0.4 + R() * 1.6) * thick;
      wedge(g, x0, y0, x1, y1, wd * 0.2, wd);
    }
    return cv;
  }

  /* 集中線。まん中の あきを よけて、そとへ 向かって 引く。 */
  const cx = w * (o.cx == null ? 0.5 : o.cx);
  const cy = h * (o.cy == null ? 0.5 : o.cy);
  const hole = Math.max(0, Math.min(0.95, o.hole == null ? 0.34 : o.hole)) * short / 2;

  for(let i = 0; i < n; i++){
    /* 角度は ならべて から すこし ずらす。
       まったく でたらめだと 濃い ところと すきまが できる。 */
    const a = (i + (R() - 0.5) * jit) / n * Math.PI * 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    const r0 = hole * (0.85 + R() * 0.4);          // ねもと
    const r1 = far * (0.55 + R() * 0.5);           // さき
    const wd = (0.5 + R() * 2.2) * thick;
    wedge(g, cx + ux * r0, cy + uy * r0,
             cx + ux * r1, cy + uy * r1,
             wd * 0.15, wd);
  }
  return cv;
}

/**
 * 集中線の レイヤーを 足す。
 * すでに ある ものを 作り直す ときは layer を わたす。
 */
export async function addLinesLayer(opt, layer){
  const o = Object.assign(newLines(), opt || {});

  /* 大きすぎると 重い ので、長いほうを これくらいに おさえる。
     線は 細い ので、引きのばしても 目立たない。 */
  const MAX = 1600;
  const k = Math.min(1, MAX / Math.max(S.proj.w, S.proj.h));
  const w = Math.max(8, Math.round(S.proj.w * k));
  const h = Math.max(8, Math.round(S.proj.h * k));

  const n = Math.max(1, Math.min(24, Math.round(o.frames || 6)));
  const ids = [];
  for(let i = 0; i < n; i++){
    const cv = paintLines(w, h, o, i);
    const src = cv.toDataURL('image/png');
    ids.push(addAsset('集中線' + (i + 1), src, w, h, await loadImage(src)));
  }

  const l = layer || newLayer(o.kind === 'ながれ' ? '流線' : '集中線', []);
  l.frames = ids;
  l.lines = o;                       // あとから 作り直す ため
  l.scaleX = 1 / k; l.scaleY = 1 / k;
  l.x = S.proj.w / 2;
  l.y = S.proj.h / 2;
  l.tracks = {};
  l.loop = null;

  /* 1コマずつ 順ぐりに 出す。つぎの コマまで そのまま（hold）。 */
  const fps = Math.max(1, Math.min(30, o.fps || 12));
  for(let i = 0; i < n; i++) setPin(l, 'frame', i / fps, i, 'hold');
  l.loop = { from: 0, to: n / fps, mode: 'loop' };

  if(!layer){
    S.proj.layers.unshift(l);
    S.sel = l.id;
  }
  return l;
}

export const isLines = (l) => !!(l && l.lines);
