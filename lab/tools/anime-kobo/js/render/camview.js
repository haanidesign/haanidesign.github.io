/* カメラの ちいさな のぞき窓（そとから 見た 図）。

   なにを して いるか
     いま 作って いる 絵を「よこから ななめに」見た 図を、
     画面の すみに 小さく 出す。
       ・レイヤー … おくゆきの ところに 立って いる 板
       ・カメラ   … 小さな しかくと、そこから 出る 4本の 線（見えている はんい）
     ここを 指で なぞると、カメラが ぐるっと まわりこむ。

   なぜ いるか
     おくゆきや かたむきは 数だけ 見ても わからない。
     「いま どこに 何が 立って いて、カメラが どこから 見て いるか」を
     絵で 見せると、はじめてでも あたりが つく。

   ここは 見せるだけ。じっさいの 絵は c2d が 描く。 */

import { CAM_F, DEPTH_UNIT, depthLen, camOf, camDolly, camTarget,
         withShake } from '../engine/camera.js?v=172';
import { valuesAt } from '../engine/anim.js?v=172';

/** のぞき窓の 大きさ（画面の ドット）と すみからの あき */
export const VIEW_W = 168;
export const VIEW_H = 126;
const PAD = 10;

/** のぞき窓の 場所。canvas の 生の ドットで かえす */
export function camViewRect(canvas){
  const dpr = Math.max(1, canvas.width / Math.max(1, canvas.clientWidth || canvas.width));
  const w = VIEW_W * dpr, h = VIEW_H * dpr, p = PAD * dpr;
  return { x: canvas.width - w - p, y: p, w, h, dpr };
}

/** そこを さわって いるか */
export function inCamView(canvas, x, y){
  const r = camViewRect(canvas);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/* ---------- そとから 見る ための うつし方 ----------
   きまった むきから の 平行とうえい（遠近を つけない）。
   遠近を つけると のぞき窓の 中まで すぼまって、
   かえって どこに 何が あるか わからなく なる。 */
const VIEW_YAW = 32 * Math.PI / 180;     // 右うしろに まわりこんだ ところから
const VIEW_PIT = 24 * Math.PI / 180;     // すこし 上から

function flat(X, Y, Z, s, ox, oy){
  const cy = Math.cos(VIEW_YAW), sy = Math.sin(VIEW_YAW);
  const cp = Math.cos(VIEW_PIT), sp = Math.sin(VIEW_PIT);
  const x1 = X * cy + Z * sy;
  const z1 = -X * sy + Z * cy;
  return { x: ox + x1 * s, y: oy + (Y * cp - z1 * sp) * s };
}

/** 3Dで まわす（camera.js と 同じ 順） */
function rot3(p, rx, ry, rz){
  const d = Math.PI / 180;
  let { x, y, z } = p;
  if(rz){
    const c = Math.cos(rz * d), s = Math.sin(rz * d);
    const nx = x * c - y * s, ny = x * s + y * c;
    x = nx; y = ny;
  }
  if(rx){
    const c = Math.cos(rx * d), s = Math.sin(rx * d);
    const ny = y * c - z * s, nz = y * s + z * c;
    y = ny; z = nz;
  }
  if(ry){
    const c = Math.cos(ry * d), s = Math.sin(ry * d);
    const nx = x * c + z * s, nz = -x * s + z * c;
    x = nx; z = nz;
  }
  return { x, y, z };
}

const line = (g, a, b) => { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };

/**
 * のぞき窓を 描く。
 *   g       … canvas の ふで（へんかん なしに して から わたす）
 *   project … さくひん
 *   time    … いまの 時こく
 *   selId   … えらんで いる レイヤーの id（あれば 色を つける）
 *   assetOf … レイヤー → 絵の 大きさ を かえす 関数
 */
export function drawCamView(g, canvas, project, time, selId, assetOf){
  const cam = camOf(project, time);
  if(!cam) return null;
  const r = camViewRect(canvas);
  const camV = withShake(valuesAt(cam, time), cam, time, project);

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);

  // わく
  g.fillStyle = 'rgba(255,254,247,.94)';
  g.strokeStyle = '#1E1C14';
  g.lineWidth = 2 * r.dpr;
  g.beginPath();
  g.roundRect ? g.roundRect(r.x, r.y, r.w, r.h, 10 * r.dpr)
              : g.rect(r.x, r.y, r.w, r.h);
  g.fill(); g.stroke();

  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();

  /* 中の 見え方。よこは キャンバス2つぶん、おくは 4000 ぐらいが
     ちょうど おさまる。 */
  const span = Math.max(project.w, project.h) * 2.2;
  const s = Math.min(r.w, r.h) / span;
  const ox = r.x + r.w * 0.42, oy = r.y + r.h * 0.58;
  const P = (X, Y, Z) => flat(X, Y, Z, s, ox, oy);

  // おくゆきの めやす線（0 の ところ）
  g.strokeStyle = 'rgba(138,132,112,.55)';
  g.lineWidth = 1 * r.dpr;
  const half = project.w / 2;
  line(g, P(-half, project.h / 2, 0), P(half, project.h / 2, 0));

  const cx = project.w / 2, cy = project.h / 2;

  /* ---- レイヤーを 板として 出す。おくの ものから 描く ---- */
  /* バラで 動かす フォルダ（コラップス）は、中身を そのまま 板に する。
     1まいの 紙 では なく、それぞれの おくゆきに 立って いる ため。 */
  const loose = {};
  project.layers.forEach(l => {
    if(l.kind === 'folder' && l.collapse) loose[l.id] = true;
  });
  const items = project.layers
    .filter(l => l.kind !== 'cam' && l.visible !== false
                 && (!l.parent || loose[l.parent]))
    .filter(l => !(l.kind === 'folder' && l.collapse))
    .map(l => { const v = valuesAt(l, time); return { l, v, z: depthLen(v) }; })
    .sort((a, b) => b.z - a.z);

  for(const it of items){
    /* フォルダは 中身を キャンバスと 同じ 大きさの 紙 1まいに まとめて
       出す ので、ここでも キャンバスぜんたいの 紙 として 立てる。
       （絵を 持たない ので、そのままだと 何も 出なかった） */
    const folder = it.l.kind === 'folder' && !it.l.collapse;
    const a = folder ? { w: project.w, h: project.h } : assetOf(it.l, it.v.frame);
    if(!a) continue;
    const w = a.w * (folder ? 1 : (it.v.scaleX || 1));
    const h = a.h * (folder ? 1 : (it.v.scaleY || 1));
    const pvx = folder ? 0.5 : ((it.l.pivot && it.l.pivot.x != null) ? it.l.pivot.x : 0.5);
    const pvy = folder ? 0.5 : ((it.l.pivot && it.l.pivot.y != null) ? it.l.pivot.y : 0.5);
    const x0 = -w * pvx, x1 = w * (1 - pvx);
    const y0 = -h * pvy, y1 = h * (1 - pvy);
    const ox2 = folder ? 0 : (it.v.x || 0) - cx;
    const oy2 = folder ? 0 : (it.v.y || 0) - cy;

    const pts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([px, py]) => {
      const q = rot3({ x: px, y: py, z: 0 }, it.v.rx || 0, it.v.ry || 0,
                     folder ? 0 : (it.v.rot || 0));
      return P(ox2 + q.x, oy2 + q.y, it.z + q.z);
    });

    const on = it.l.id === selId;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillStyle = on ? 'rgba(226,221,96,.55)' : 'rgba(122,196,160,.28)';
    g.fill();
    g.strokeStyle = on ? '#1E1C14' : 'rgba(30,28,20,.45)';
    g.lineWidth = (on ? 2 : 1.2) * r.dpr;
    g.stroke();
  }

  /* ---- カメラの 通り道（前後の 動きも 見える）----
     絵の 上に 出る 道は よこ・たてだけ。ここでは ドリー（前後）も
     入れた 道が 見える ので、寄りながら 流す ような 動きが つかめる。 */
  (function(){
    const tr = cam.tracks || {};
    const set = new Set();
    ['x', 'y', 'z'].forEach(ch => (tr[ch] || []).forEach(k => set.add(+k.t.toFixed(3))));
    const ts = [...set].sort((a, b) => a - b);
    if(ts.length < 2) return;
    const t0 = ts[0], t1 = ts[ts.length - 1];
    const at = (t) => {
      const w = withShake(valuesAt(cam, t), cam, t, project);
      const zoom = w.scaleX || 1;
      return P((w.x || 0) - cx, (w.y || 0) - cy, -CAM_F / zoom + camDolly(w));
    };
    const n = 40;
    g.beginPath();
    for(let i = 0; i <= n; i++){
      const q = at(t0 + (t1 - t0) * (i / n));
      i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y);
    }
    g.strokeStyle = 'rgba(30,28,20,.35)';
    g.lineWidth = 3 * r.dpr;
    g.stroke();
    g.setLineDash([4 * r.dpr, 3 * r.dpr]);
    g.strokeStyle = '#E1DD60';
    g.lineWidth = 1.6 * r.dpr;
    g.stroke();
    g.setLineDash([]);
    ts.forEach(t => {
      const q = at(t);
      g.beginPath();
      g.arc(q.x, q.y, (Math.abs(t - time) < 0.05 ? 3.4 : 2.4) * r.dpr, 0, Math.PI * 2);
      g.fillStyle = Math.abs(t - time) < 0.05 ? '#F2A0B8' : '#E1DD60';
      g.fill();
      g.strokeStyle = '#1E1C14';
      g.lineWidth = 1 * r.dpr;
      g.stroke();
    });
  })();

  /* ---- カメラ本体と、見えている はんい ---- */
  const cX = (camV.x || 0) - cx, cY = (camV.y || 0) - cy;
  /* カメラは おくゆき -CAM_F の ところに 立って いる と 考えると、
     0 の ところで ちょうど キャンバスぜんぶが 見える。
     ドリー（前後）は その 立ち位置を そのまま 動かす。 */
  const cZ = -CAM_F / (camV.scaleX || 1) + camDolly(camV);
  const camP = P(cX, cY, cZ);

  /* ピントの めん（ぼかしを 入れて いる ときだけ） */
  if(camV.dof > 0.001){
    const fz = (camV.fd || 0) * DEPTH_UNIT;
    const fw = project.w / 2, fh = project.h / 2;
    const fq = [[-fw,-fh],[fw,-fh],[fw,fh],[-fw,fh]].map(([px, py]) => P(px, py, fz));
    g.strokeStyle = 'rgba(91,127,212,.85)';
    g.setLineDash([4 * r.dpr, 3 * r.dpr]);
    g.lineWidth = 1.4 * r.dpr;
    g.beginPath();
    g.moveTo(fq[0].x, fq[0].y);
    for(let i = 1; i < 4; i++) g.lineTo(fq[i].x, fq[i].y);
    g.closePath();
    g.stroke();
    g.setLineDash([]);
  }

  /* 注視点（まわりこみの じく） */
  if(camV.aim){
    const T = camTarget(camV, cx, cy);
    const tp = P(T.x, T.y, T.z);
    g.strokeStyle = '#F2A0B8';
    g.lineWidth = 2 * r.dpr;
    g.beginPath(); g.arc(tp.x, tp.y, 5 * r.dpr, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(tp.x, tp.y, 1.6 * r.dpr, 0, Math.PI * 2);
    g.fillStyle = '#F2A0B8'; g.fill();
  }

  // 見えている はんい（0 の ところの 四すみへ 4本）
  const zoom = camV.scaleX || 1;
  const fw = project.w / 2 / zoom, fh = project.h / 2 / zoom;
  const far = [[-fw,-fh],[fw,-fh],[fw,fh],[-fw,fh]].map(([px, py]) => {
    /* カメラの まわりこみ ぶんだけ、見て いる ほうも まわる */
    const q = rot3({ x: px, y: py, z: CAM_F / zoom }, camV.rx || 0, camV.ry || 0, 0);
    return P(cX + q.x, cY + q.y, cZ + q.z);
  });

  g.strokeStyle = '#F2A0B8';
  g.lineWidth = 1.4 * r.dpr;
  /* ズームを うんと 下げる（引く）と、カメラは のぞき窓の ずっと
     そとに 立つ。そこから 4本 ひくと、窓を よこぎる 大きな ✕ に
     なって じゃま なだけ なので、そのときは ひかない。 */
  const camIn = camP.x > r.x - r.w && camP.x < r.x + r.w * 2
             && camP.y > r.y - r.h && camP.y < r.y + r.h * 2;
  if(camIn) far.forEach(p => line(g, camP, p));
  g.beginPath();
  g.moveTo(far[0].x, far[0].y);
  for(let i = 1; i < 4; i++) g.lineTo(far[i].x, far[i].y);
  g.closePath();
  g.stroke();

  // カメラ本体
  if(camIn){
    g.fillStyle = '#1E1C14';
    g.beginPath();
    g.arc(camP.x, camP.y, 4 * r.dpr, 0, Math.PI * 2);
    g.fill();
  }

  g.restore();

  // 見出しと、いまの 引き・アップ
  g.fillStyle = 'rgba(30,28,20,.62)';
  g.font = (9 * r.dpr) + 'px system-ui, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillText('なぞる＝まわる', r.x + 7 * r.dpr, r.y + 5 * r.dpr);
  g.fillText('つまむ＝引き・アップ', r.x + 7 * r.dpr, r.y + 16 * r.dpr);

  const zpc = Math.round(((camV.scaleX == null ? 1 : camV.scaleX) || 1) * 100);
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.font = '700 ' + (11 * r.dpr) + 'px system-ui, sans-serif';
  g.fillStyle = zpc === 100 ? 'rgba(30,28,20,.55)' : '#1E1C14';
  g.fillText(zpc + '%', r.x + r.w - 7 * r.dpr, r.y + r.h - 5 * r.dpr);

  g.restore();
  return r;
}
