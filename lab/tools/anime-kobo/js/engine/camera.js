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

import { M } from './math.js?v=130';

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
