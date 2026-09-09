/* カメラ。

   アフターエフェクトの カメラと 同じ かんじで、
   「レイヤーを 動かす」のでは なく「見ている ほうを 動かす」。

   なにが うれしいか
     レイヤーごとに「おくゆき」を きめて おくと、
     カメラを よこに ふった とき、
       ・手前の もの … 大きく ずれる
       ・おくの もの … すこししか ずれない
     ようになる。これだけで 絵が ぐっと 立体に 見える。
     ズームでも おなじで、手前の ものほど はやく 近づく。

   しくみ
     ほんとうの 3D では ない。
     絵は 1まいの 板の まま で、おくゆきに 応じて
     「どれだけ 大きく／どれだけ ずれるか」だけを 変える。
     さかさまに まわりこむ ような 3D の 動きは できないが、
     2Dアニメで カメラに させたい ことの ほとんどは これで 足りる。

     ある おくゆき d の ばいりつ は
       k = ズーム × f / (f + d)
     で、絵は キャンバスの まん中を 中心に
       まわす → k倍 → カメラの ぶん ずらす
     の 順で うつす。

   カメラは ふつうの レイヤー（kind:'cam'）に して ある ので、
   よこ・たて・ズーム・かたむき に そのまま タイミングピンが うてる。 */

import { M } from './math.js?v=131';

export const isCam = (l) => !!l && l.kind === 'cam';

/** きじゅんの おくゆき。これと おなじ ぶんだけ おくに 行くと 半分の 大きさ */
export const CAM_F = 1000;

/** おくゆきの めもり（画面に 出す 数）と、中で つかう 長さの 比 */
export const DEPTH_UNIT = 200;
export const DEPTH_MIN = -4;      // これより 手前に すると 画面から はみ出て しまう
export const DEPTH_MAX = 20;

/** そのレイヤーの おくゆき（めもり） */
export const depthOf = (l) => (l && typeof l.depth === 'number') ? l.depth : 0;

/** 中で つかう 長さに なおす */
export function depthLen(l){
  const d = depthOf(l);
  return Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, d)) * DEPTH_UNIT;
}

/** いま つかう カメラ（切って あれば なし） */
export function camOf(project){
  if(!project || !project.layers) return null;
  const c = project.layers.find(l => isCam(l) && l.visible !== false);
  return c || null;
}

/**
 * カメラの うつし方。
 * v は カメラレイヤーの その時こくの 姿、cx/cy は キャンバスの まん中。
 * depth は 中で つかう 長さ（depthLen）。
 */
export function camMatrix(v, cx, cy, depth){
  const f = CAM_F;
  /* おくゆきが -f より 手前に なると 裏返って しまう。
     手前がわは そこまで 行かない ところで 止める。 */
  const d = Math.max(-0.8 * f, depth || 0);
  const zoom = (v.scaleX == null ? 1 : v.scaleX) || 1;
  const k = zoom * f / (f + d);

  // カメラは まん中に いる のが ふつう。そこからの ずれだけ を つかう
  const px = (v.x || 0) - cx;
  const py = (v.y || 0) - cy;

  // まん中へ寄せる → まわす・k倍 → カメラの ぶん もどす
  return M.mul(M.trs(cx, cy, v.rot || 0, k, k),
               M.trs(-(cx + px), -(cy + py), 0, 1, 1));
}

/** カメラを もとの ところへ もどす */
export function resetCam(l, project){
  l.x = project.w / 2;
  l.y = project.h / 2;
  l.scaleX = 1; l.scaleY = 1;
  l.rot = 0;
  ['x', 'y', 'scaleX', 'scaleY', 'rot'].forEach(ch => {
    if(l.tracks) delete l.tracks[ch];
  });
}

/** おくゆきの めやす（ボタンで えらべる ように） */
export const DEPTH_PRESETS = [
  ['てまえ',   -2],
  ['ふつう',    0],
  ['すこし おく', 3],
  ['とおく',    8],
  ['はるか おく', 16]
];

/** そのおくゆきだと 何ばいに 見えるか（めやすを 出す用） */
export function depthScale(l){
  const d = Math.max(-0.8 * CAM_F, depthLen(l));
  return CAM_F / (CAM_F + d);
}


/* ================= 立体（3D） =================

   レイヤーを おくへ たおす・よこに まわす。

   絵は 1まいの 板。その 板を 3Dで まわして、
   四すみが 画面の どこに 来るかを 出す。
   あとは その 四すみに 絵を はめれば いい
   （「自由変形」で つかって いる ホモグラフィと 同じ しくみ）。

   ほんとうの 3D エンジンでは ない ので、
     ・板どうしの 前後の 重なりは レイヤーの 順番の まま
     ・かげ・ライト・ピントぼけ は ない
   けれど、たおす・まわす・まわりこむ は ちゃんと 出る。 */

/** そのレイヤーが 立体に なって いるか */
export function is3D(l){
  return !!l && (Math.abs(l.rx || 0) > 0.01 || Math.abs(l.ry || 0) > 0.01);
}

/** 3Dで まわす。z は おく が プラス */
function rot3(p, rx, ry, rz){
  const d = Math.PI / 180;
  let { x, y, z } = p;
  // ① 画面の中で まわす（いままでの かたむき と 同じ むき）
  if(rz){
    const c = Math.cos(rz * d), s = Math.sin(rz * d);
    const nx = x * c - y * s, ny = x * s + y * c;
    x = nx; y = ny;
  }
  // ② よこじくで たおす（上下）
  if(rx){
    const c = Math.cos(rx * d), s = Math.sin(rx * d);
    const ny = y * c - z * s, nz = y * s + z * c;
    y = ny; z = nz;
  }
  // ③ たてじくで まわす（左右）
  if(ry){
    const c = Math.cos(ry * d), s = Math.sin(ry * d);
    const nx = x * c + z * s, nz = -x * s + z * c;
    x = nx; z = nz;
  }
  return { x, y, z };
}

/**
 * 立体に した レイヤーの 四すみが 画面の どこに 来るか。
 *   l      … レイヤー
 *   v      … その時こくの 姿
 *   asset  … 絵の 大きさ（w, h）
 *   camV   … カメラの 姿（なければ カメラ なし）
 * かえりは キャンバスざひょうの [左上, 右上, 右下, 左下]。
 * うしろを むいて しまって うつせない ときは null。
 */
export function quad3D(l, v, asset, project, camV){
  const cx = project.w / 2, cy = project.h / 2;
  const w = asset.w * (v.scaleX || 1);
  const h = asset.h * (v.scaleY || 1);
  const pvx = (l.pivot && l.pivot.x != null) ? l.pivot.x : 0.5;
  const pvy = (l.pivot && l.pivot.y != null) ? l.pivot.y : 0.5;

  // じく（回転の中心）から 見た 四すみ
  const x0 = -w * pvx, x1 = w * (1 - pvx);
  const y0 = -h * pvy, y1 = h * (1 - pvy);
  const corners = [{x:x0,y:y0}, {x:x1,y:y0}, {x:x1,y:y1}, {x:x0,y:y1}];

  const zc = depthLen(l);                    // この レイヤーの おくゆき
  const ox = (v.x || 0) - cx, oy = (v.y || 0) - cy;

  const camX = camV ? (camV.x || 0) - cx : 0;
  const camY = camV ? (camV.y || 0) - cy : 0;
  const zoom = camV ? ((camV.scaleX == null ? 1 : camV.scaleX) || 1) : 1;
  const roll = camV ? (camV.rot || 0) : 0;
  const rc = Math.cos(roll * Math.PI / 180), rs = Math.sin(roll * Math.PI / 180);

  const out = [];
  for(const c of corners){
    const r = rot3({ x: c.x, y: c.y, z: 0 }, l.rx || 0, l.ry || 0, v.rot || 0);
    const X = ox + r.x, Y = oy + r.y, Z = zc + r.z;
    /* カメラより うしろ（または 近すぎる）と、うつすと 裏返って しまう。
       その コマは 3Dを あきらめて ふつうに 描く。 */
    if(CAM_F + Z < CAM_F * 0.2) return null;
    const k = zoom * CAM_F / (CAM_F + Z);
    const sx = (X - camX) * k, sy = (Y - camY) * k;
    out.push({ x: cx + sx * rc - sy * rs, y: cy + sx * rs + sy * rc });
  }
  return out;
}
