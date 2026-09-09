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

import { M } from './math.js?v=145';

export const isCam = (l) => !!l && l.kind === 'cam';

/** きじゅんの おくゆき。これと おなじ ぶんだけ おくに 行くと 半分の 大きさ */
export const CAM_F = 1000;

/** おくゆきの めもり（画面に 出す 数）と、中で つかう 長さの 比 */
export const DEPTH_UNIT = 200;
export const DEPTH_MIN = -4;      // これより 手前に すると 画面から はみ出て しまう
export const DEPTH_MAX = 20;

/* カメラだけが 持つ うごかせる ところ。
   x/y（よこ・たてに ふる）・scaleX（画角ズーム）・rot（かたむき）は
   ふつうの レイヤーと 同じ しくみを つかう ので ここには 入れない。 */
export const CAM_CHANNELS = ['z', 'tx', 'ty', 'td', 'fd'];

/** ドリー（前後に 動く）の かぎり。めもり。 */
export const DOLLY_MIN = -14, DOLLY_MAX = 3.4;

/** そのレイヤーの おくゆき（めもり）。
    レイヤーを そのまま わたしても、その時こくの 姿（valuesAt の けっか）を
    わたしても いい ―― どちらも depth を 持って いる。
    ピンが うって あれば 姿の ほうを わたす こと。 */
export const depthOf = (l) => (l && typeof l.depth === 'number') ? l.depth : 0;

/** 中で つかう 長さに なおす */
export function depthLen(l){
  const d = depthOf(l);
  return Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, d)) * DEPTH_UNIT;
}

/** いま つかう カメラ（切って あれば なし） */
export function camOf(project, time){
  if(!project || !project.layers) return null;
  const live = project.layers.filter(l => isCam(l) && l.visible !== false);
  if(!live.length) return null;
  /* カメラが 何台か あって、それぞれに「ここから ここまで」を
     きめて あれば、その 時こくの カメラに 切りかわる（カット割り）。
     きめて いない カメラは いつでも つかえる ので、
     きめて ある ものを 先に さがす。 */
  if(time != null){
    const cut = live.find(l => l.span && inCamSpan(l, time));
    if(cut) return cut;
  }
  const any = live.find(l => !l.span);
  return any || live[0];
}

/** カメラの「ここから ここまで」。layer.js の inSpan と 同じ 見方。 */
function inCamSpan(l, time){
  const s = l.span;
  if(!s) return true;
  const a = s.from == null ? -Infinity : s.from;
  const b = s.to   == null ?  Infinity : s.to;
  return time >= a - 1e-6 && time <= b + 1e-6;
}

/** ドリーの 長さ（中で つかう ものさし）。
    プラスで 前へ 出る＝近づく。 */
export function camDolly(v){
  if(!v) return 0;
  const z = Math.max(DOLLY_MIN, Math.min(DOLLY_MAX, v.z || 0));
  return z * DEPTH_UNIT;
}

/**
 * まわりこみの じく（注視点）。
 *
 * 「注視点を つかう」を 切って いる ときは、カメラの まん前
 * （ふった さきの、おくゆき 0 の ところ）が じく。
 * ＝ いままでと おなじ 回り方。
 */
export function camTarget(v, cx, cy){
  if(v && v.aim){
    return {
      x: (v.tx == null ? cx : v.tx) - cx,
      y: (v.ty == null ? cy : v.ty) - cy,
      z: Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, v.td || 0)) * DEPTH_UNIT
    };
  }
  return { x: v ? (v.x || 0) - cx : 0, y: v ? (v.y || 0) - cy : 0, z: 0 };
}

/**
 * ピンぼけ（被写界深度）。
 * ピントの おくゆきから 離れた 紙ほど ぼける。
 * かえりは ぼかしの ドット（キャンバスの ものさし）。
 */
export function camDefocus(v, depth){
  if(!v || !(v.dof > 0.001)) return 0;
  const f = (v.fd || 0) * DEPTH_UNIT;
  const d = Math.abs((depth || 0) - f) / DEPTH_UNIT;   // めもり いくつ ずれて いるか
  return Math.min(60, v.dof * d);
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
  const d = Math.max(-0.8 * f, (depth || 0) - camDolly(v));
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
  l.rx = 0; l.ry = 0;
  l.z = 0;
  l.tx = project.w / 2; l.ty = project.h / 2; l.td = 0;
  l.fd = 0;
  ['x', 'y', 'scaleX', 'scaleY', 'rot', 'rx', 'ry', ...CAM_CHANNELS].forEach(ch => {
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

/** カメラが まわりこんで いるか。
    まわりこむと、まっすぐな 板でも「おくが せまい」形に なる ので、
    ふつうの 行列では 出せない。ぜんぶ 四すみで 描く ことに なる。 */
export function camOrbiting(cam){
  return !!cam && (Math.abs(cam.rx || 0) > 0.01 || Math.abs(cam.ry || 0) > 0.01);
}

/** まわりこみの かぎり。真横まで 行くと 板が 線に なって 見えなく なる */
export const ORBIT_MAX = 70;

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
 * 3Dの 点 1つを 画面に うつす。
 *
 * ① カメラの ところを 原点に する
 * ② カメラの まわりこみ を もどす（カメラを まわす＝世界を 逆に まわす）
 * ③ おくゆきで 小さく する
 * ④ カメラの かたむき（ロール）を かける
 *
 * カメラより うしろに 来た 点は うつせない ので null。
 */
export function project3(X, Y, Z, camV, cx, cy){
  let x = X, y = Y, z = Z;

  if(camV){
    /* ① 注視点の まわりを まわす（カメラを まわす＝世界を 逆に まわす） */
    const rx = -(camV.rx || 0), ry = -(camV.ry || 0);
    if(rx || ry){
      const T = camTarget(camV, cx, cy);
      const r = rot3({ x: x - T.x, y: y - T.y, z: z - T.z }, rx, ry, 0);
      x = r.x + T.x; y = r.y + T.y; z = r.z + T.z;
    }
    /* ② カメラの ところを 原点に する（よこ・たて・前後） */
    x -= (camV.x || 0) - cx;
    y -= (camV.y || 0) - cy;
    z -= camDolly(camV);
  }
  if(CAM_F + z < CAM_F * 0.2) return null;

  const zoom = camV ? ((camV.scaleX == null ? 1 : camV.scaleX) || 1) : 1;
  const k = zoom * CAM_F / (CAM_F + z);
  const sx = x * k, sy = y * k;

  const roll = camV ? (camV.rot || 0) : 0;
  const rc = Math.cos(roll * Math.PI / 180), rs = Math.sin(roll * Math.PI / 180);
  return { x: cx + sx * rc - sy * rs, y: cy + sx * rs + sy * rc, k };
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

  const zc = depthLen(v);                    // この レイヤーの おくゆき（その時こく）
  const ox = (v.x || 0) - cx, oy = (v.y || 0) - cy;

  const out = [];
  for(const c of corners){
    const r = rot3({ x: c.x, y: c.y, z: 0 }, v.rx || 0, v.ry || 0, v.rot || 0);
    /* カメラより うしろ（または 近すぎる）と、うつすと 裏返って しまう。
       その コマは 3Dを あきらめて ふつうに 描く。 */
    const q = project3(ox + r.x, oy + r.y, zc + r.z, camV, cx, cy);
    if(!q) return null;
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/**
 * 親ごしの 姿（行列）から 四すみを 出す。
 *
 * quad3D は「親の いない レイヤー」むけ で、レイヤーの
 * よこ・たて・大きさ から 四すみを 組み立てて いる。
 * バラで 動かす フォルダの 中身は 親の ぶんも かかって いる ので、
 * すでに できあがって いる 行列（カメラを かける まえの もの）を つかう。
 *
 *   l  … レイヤー   v … その時こくの 姿
 *   a  … 絵の 大きさ  m … カメラを かける まえの 姿（キャンバスざひょう）
 */
export function quadFromM(l, v, a, m, project, camV){
  const cx = project.w / 2, cy = project.h / 2;
  const pvx = (l.pivot && l.pivot.x != null) ? l.pivot.x : 0.5;
  const pvy = (l.pivot && l.pivot.y != null) ? l.pivot.y : 0.5;
  const x0 = -a.w * pvx, x1 = a.w * (1 - pvx);
  const y0 = -a.h * pvy, y1 = a.h * (1 - pvy);

  /* 行列の のび（おくへ たおした ぶんを 同じ ものさしに するため） */
  const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const zc = depthLen(v);

  const out = [];
  for(const c of [{x:x0,y:y0}, {x:x1,y:y0}, {x:x1,y:y1}, {x:x0,y:y1}]){
    // 立体の かたむき（rx/ry）は 行列に 入らない ので ここで かける
    const r = rot3({ x: c.x, y: c.y, z: 0 }, v.rx || 0, v.ry || 0, 0);
    const w = M.apply(m, r.x, r.y);
    const q = project3(w.x - cx, w.y - cy, zc + r.z * sc, camV, cx, cy);
    if(!q) return null;
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/**
 * まとめた 紙（フォルダ）の 四すみ。
 *
 * フォルダは 中身を キャンバスと 同じ 大きさの 紙 1まいに まとめて から
 * 出す。だから その 紙を、フォルダの おくゆきの ところに 立てて、
 * カメラから うつせば いい。
 *
 * 中身の 場所（フォルダの よこ・たて・大きさ・かたむき）は
 * すでに 紙の 中に 描かれて いる ので、ここでは かけない。
 */
export function sheetQuad3D(l, v, project, camV){
  const cx = project.w / 2, cy = project.h / 2;
  const zc = depthLen(v);
  const corners = [{x:-cx,y:-cy}, {x:cx,y:-cy}, {x:cx,y:cy}, {x:-cx,y:cy}];
  const out = [];
  for(const c of corners){
    const r = rot3({ x: c.x, y: c.y, z: 0 }, v.rx || 0, v.ry || 0, 0);
    const q = project3(r.x, r.y, zc + r.z, camV, cx, cy);
    if(!q) return null;
    out.push({ x: q.x, y: q.y });
  }
  return out;
}


/* ================= 手ぶれ =================

   AE では ヌル（からっぽの もの）に カメラを ぶら下げて、
   そっちを ゆらす。ここでは カメラに 直に 1つ つけた。

   ゆれは でたらめでは なく、時こくから いつも 同じ 形が 出る 波。
   ＝ 何回 見ても・書き出しても、同じ ゆれに なる。 */

/** なめらかな ゆれ（-1〜1 ぐらい）。ふしめを ずらして 2つ 足す */
function wob(t, seed){
  return Math.sin(t * 2.31 + seed) * 0.62
       + Math.sin(t * 5.77 + seed * 1.7) * 0.38;
}

/**
 * その時こくの カメラの 姿。
 * ピンから 出した 値に、手ぶれを のせて かえす。
 *   vals … valuesAt(cam, time) の けっか
 */
export function withShake(vals, cam, time, project){
  const amt = cam ? (cam.shake || 0) : 0;
  if(!(amt > 0.001)) return vals;
  const spd = cam.shakeSpd == null ? 1 : cam.shakeSpd;
  const t = time * spd;
  const px = Math.min(project.w, project.h) * 0.035 * amt;
  return {
    ...vals,
    x: (vals.x || 0) + wob(t, 0.0) * px,
    y: (vals.y || 0) + wob(t, 2.4) * px,
    rot: (vals.rot || 0) + wob(t, 5.1) * 1.6 * amt
  };
}
