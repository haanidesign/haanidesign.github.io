/* イラストを 球（ボール）に はる。

   絵の よこを ぐるり1しゅう、たてを 上から下 に わりあてて
   まるい 玉の おもてに はりつけ、まわして 見せる。
   地球ぎ・ビー玉・まるい アイコンが 作れる。

   やり方は「あみ」。玉の おもてに 緯度・経度の ます目を 張って、
   その かどを 3Dで まわして 画面に うつし、三角ずつ 絵を はる
   （ぐるり360と おなじ しくみ。ちがうのは 内がわから 見るか
     外がわから 見るか だけ）。

   むこうがわ（うら）に まわった 三角は 出さない。
   画面での 三角の むき（右まわりか 左まわりか）で より分ける ので、
   玉の ふちが きれいに 出る。 */

import { drawDeformed } from './puppet.js?v=176';
import { setPin } from '../engine/anim.js?v=176';
import { S } from '../state.js?v=176';

/** 球に はって いるか */
export const ballOn = (l) => !!(l && l.ball && l.ball.on);

/** 球だけが 持つ うごかせる もの */
export const BALL_CHANNELS = ['ballY', 'ballP'];

/* あみの こまかさ。実測（1080x1920に 512x256の 絵を 1つ）で
   24こま＝3.4ms、32こま＝6ms、40こま＝8.8ms、60こま＝19ms。
   30コマ/秒に よゆうで 間に合う ところを はじめに する。 */
export function ballDefaults(){
  return { on: true, cols: 32, rows: 16, shade: 0.35 };
}

/* ---------- あみ ----------
   玉の おもての ます目。かたち（つながり方）は ずっと 同じ なので、
   1回 作って 使いまわす。うら の 三角を のぞく ところだけ 毎コマ。 */
function ballMesh(cols, rows){
  const verts = [];
  for(let r = 0; r <= rows; r++) for(let c = 0; c <= cols; c++) verts.push({ u:0, v:0 });
  return { verts, tris: [], cols, rows };
}

/**
 * 球に はった 1まいを 作って かえす（絵の ふりを する canvas）。
 *   l   … レイヤー
 *   v   … いまの 時こくの 数字（ballY / ballP）
 *   img … もとの 絵
 *   tag … その 絵の 見わけ（コマが かわったら 作りなおす ため）
 * 見た目が 変わって いなければ 作りなおさない。
 */
export function ballCanvas(l, v, img, tag){
  if(!img || !img.naturalWidth) return img;

  const b = l.ball || (l.ball = ballDefaults());
  const cols = Math.max(8, Math.min(96, b.cols || 32));
  const rows = Math.max(6, Math.min(48, b.rows || 16));

  /* 出す 紙は もとの 絵と おなじ 大きさ。
     こう すると レイヤーの 場所・大きさの あつかいが
     ふつうの 絵の ときと まったく 同じに なる。
     玉は その 中に ぴったり 入る 円。 */
  const w = img.naturalWidth, h = img.naturalHeight;
  if(!l._blC || l._blC.width !== w || l._blC.height !== h){
    l._blC = document.createElement('canvas');
    l._blC.width = w; l._blC.height = h;
    l._blC.complete = true;
    l._blC.naturalWidth = w; l._blC.naturalHeight = h;
    l._blKey = null;
  }

  const yaw   = (v && v.ballY != null ? v.ballY : (l.ballY || 0));
  const pitch = Math.max(-89, Math.min(89,
                  v && v.ballP != null ? v.ballP : (l.ballP || 0)));
  const shade = b.shade == null ? 0.35 : b.shade;

  const key = [tag || '', w, h, cols, rows,
               yaw.toFixed(2), pitch.toFixed(2), shade.toFixed(2)].join('|');
  if(l._blKey === key) return l._blC;
  l._blKey = key;

  if(!l._blMesh || l._blMesh.cols !== cols || l._blMesh.rows !== rows){
    l._blMesh = ballMesh(cols, rows);
    l._blXY = null;
  }
  const m = l._blMesh;
  const n = m.verts.length;
  if(!l._blXY || l._blXY.length !== n * 2){
    l._blXY = new Float32Array(n * 2);
    l._blUV = new Float32Array(n * 2);
    l._blZ  = new Float32Array(n);
  }
  const xy = l._blXY, uv = l._blUV, zz = l._blZ;

  const R  = Math.min(w, h) / 2;
  const cx = w / 2, cy = h / 2;
  const a = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cp = Math.cos(p), sp = Math.sin(p);

  for(let r = 0; r <= rows; r++){
    const tv = r / rows;                      // 0 が 北（絵の 上）
    const lat = (0.5 - tv) * Math.PI;         // +90°〜 -90°
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for(let c = 0; c <= cols; c++){
      const tu = c / cols;
      const lon = (tu - 0.5) * Math.PI * 2;
      // 玉の おもての 1点（まわす まえ）
      let x = cl * Math.sin(lon);
      let y = sl;
      let z = cl * Math.cos(lon);
      // よこに まわす（Y じくまわり）
      const x1 =  x * ca + z * sa;
      const z1 = -x * sa + z * ca;
      // たてに たおす（X じくまわり）
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;

      const i = r * (cols + 1) + c;
      xy[i*2]   = cx + x1 * R;
      xy[i*2+1] = cy - y2 * R;                // 画面は 下むきが プラス
      uv[i*2]   = tu * w;
      uv[i*2+1] = tv * h;
      zz[i] = z2;                             // プラスが こちらむき
    }
  }

  /* こちらを むいて いる 三角 だけ のこす。
     画面での 三角の まわり方（外せき）で 決める。
     こうすると 玉の ふち ちょうどで 切れる。 */
  const tris = m.tris;
  tris.length = 0;
  const id = (c, r) => r * (cols + 1) + c;
  const facing = (a0, b0, c0) => {
    const ax = xy[a0*2], ay = xy[a0*2+1];
    const cr = (xy[b0*2] - ax) * (xy[c0*2+1] - ay)
             - (xy[b0*2+1] - ay) * (xy[c0*2] - ax);
    /* 画面は 下むきが プラス。こちらむきの 三角は
       A→B→C が この まわり方に なる（実測で 合わせた）。 */
    return cr > 0;
  };
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
    const A = id(c, r), B = id(c+1, r), C = id(c, r+1), D = id(c+1, r+1);
    if(zz[A] <= 0 && zz[B] <= 0 && zz[C] <= 0 && zz[D] <= 0) continue;
    if(facing(A, B, C)) tris.push(A, B, C);
    if(facing(B, D, C)) tris.push(B, D, C);
  }

  const g = l._blC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  if(tris.length) drawDeformed(g, img, m, xy, 1, uv);

  /* まるみを 出す かげ。
     ひだり上から 光が あたって いる ように、右下へ 向けて 暗く する。
     0 に すると ぺったり した 玉に なる。 */
  if(shade > 0.01){
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1,
                                      cx, cy, R * 1.15);
    gr.addColorStop(0,   'rgba(255,255,255,' + (shade * 0.5).toFixed(3) + ')');
    gr.addColorStop(0.45,'rgba(0,0,0,0)');
    gr.addColorStop(1,   'rgba(0,0,0,' + shade.toFixed(3) + ')');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  return l._blC;
}

/** ぐるっと まわる ピンを うつ */
export function ballSpinKeys(l, seconds, turns, back){
  const t1 = Math.max(0.5, seconds || S.proj.duration);
  const a0 = l.ballY || 0;
  const n  = (turns || 1) * 360 * (back ? -1 : 1);
  setPin(l, 'ballY', 0,  a0, 'linear');
  setPin(l, 'ballY', t1, a0 + n, 'linear');
  return 2;
}
