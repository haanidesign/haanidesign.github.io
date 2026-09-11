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
         camMatrix, withShake } from '../engine/camera.js?v=259';
import { valuesAt } from '../engine/anim.js?v=259';
import { M } from '../engine/math.js?v=259';

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
  /* ---- レイヤーを 板として 出す。おくの ものから 描く ----

     まえは 親の いない レイヤーだけ を 見て いた。
     だから フォルダに 入れた 絵は ぜんぶ「キャンバス大の 紙 1まい」に
     なって しまい、手を 手前に 出して も のぞき窓は 何も 変わらず、
     どの 板が どれか も わからなかった。
     いまは 中みを 1まい ずつ たどって、そのままの 大きさ・場所で 立てる。

     おくゆきは、まとめて 1まいの 紙に する フォルダが あれば
     その フォルダの おくゆきに そろえる（じっさい そう うつる ため）。
     「バラで 動かす」フォルダなら 中みは 自分の おくゆきの まま。 */
  const byId = {};
  project.layers.forEach(l => { byId[l.id] = l; });
  const items = [];
  for(const l of project.layers){
    if(l.kind === 'cam' || l.kind === 'folder' || l.visible === false) continue;
    /* 画面に はりつけた もの（セリフ枠・ロゴ）は 立体の 中に 無い ので 出さない */
    if(l.noCam) continue;
    const chain = [];
    let cur = l, guard = 0, skip = false;
    while(cur.parent && byId[cur.parent] && guard++ < 64){
      cur = byId[cur.parent];
      if(cur.visible === false || cur.noCam){ skip = true; break; }
      chain.push(cur);
    }
    if(skip) continue;
    const v = valuesAt(l, time);
    /* 場所の 足し方。
       えがく ほう（layer.js）は m = 親の m × 自分の trs(x,y) なので、
       レイヤーの x は「キャンバスの どこ」では なく
       「親から どれだけ」の 足し算 に なる。
       フォルダの x は はじめ 0（newLayer の きめ）。
       ここで 0 を「キャンバスの 左はし」と 見て cx を ひいて いた ので、
       フォルダに 入れた 絵が まるごと 画面 はんぶん 左へ ずれ、
       カメラより うしろに 立って 見えて いた。
       ＝「板の 位置が ちがう」の 正体。
       ひくのは いちばん さいご、1回だけ。 */
    let z = depthLen(v), wx = 0, wy = 0, sx = 1, sy = 1;
    let rx = 0, ry = 0, rz = 0, sheeted = false;
    for(let i = chain.length - 1; i >= 0; i--){    // そとがわ から 中へ
      const f = chain[i];
      const fv = valuesAt(f, time);
      wx += sx * (fv.x || 0); wy += sy * (fv.y || 0);
      sx *= (fv.scaleX == null ? 1 : fv.scaleX);
      sy *= (fv.scaleY == null ? 1 : fv.scaleY);
      /* まとめて 1まいの 紙に する フォルダに 入って いたら、
         中みは その 紙の うえに たいらに 焼かれて から、
         紙ごと たおされる（layer.js: 自分の 立体は 親の いない ものだけ）。
         だから たおれ ぐあいは その フォルダの ものが ぜんぶ。
         おくゆきも 同じ。

         まえは フォルダの たおれ と 中みの たおれ を 足して いた。
         45°の フォルダに 45°の 絵で 90° ＝ 板が まっ平らに 寝て、
         「カメラに 向いて いる はずなのに のぞき窓では 水平」に なって いた。 */
      rz += fv.rot || 0;
      if(!f.collapse && !sheeted){
        z = depthLen(fv);
        rx = fv.rx || 0; ry = fv.ry || 0;
        sheeted = true;
      }
      /* 「バラで 動かす」フォルダの たおれ（rx/ry）は 何も しない。
         えがく ほうは、たたんで いない フォルダ だけ を 紙ごと たおす
         （layer.js の sheet3D）。バラの ほうは その みちを 通らず、
         場所を あわせる かけ算（M.trs）には rx/ry が そもそも 無い。
         ＝ フォルダに 「ゆか」70° を 入れても 絵は 1ドットも 動かない。

         のぞき窓は それを 中みに 足して いた ので、
         まっすぐ 立って いる はずの 絵が 70° 寝て 見えて いた。
         ＝「平べったい」の 正体。 */
    }
    /* 紙に 焼かれて いない（＝「バラで 動かす」だけ を 通って きた）なら、
       自分の たおれも きく。 */
    if(!sheeted){ rx += v.rx || 0; ry += v.ry || 0; }
    rz += v.rot || 0;
    wx += sx * (v.x || 0); wy += sy * (v.y || 0);
    const ox = wx - cx, oy = wy - cy;
    items.push({ l, v, z, ox, oy, sx, sy, rx, ry, rz,
                 ids: chain.map(f => f.id) });   // フォルダを えらんだ ときも 光らせる
  }
  items.sort((a, b) => b.z - a.z);
  const shown = {};       // おなじ おくゆきの わくは 1回だけ
  const cX = (camV.x || 0) - cx, cY = (camV.y || 0) - cy;
  /* カメラは おくゆき -CAM_F の ところに 立って いる と 考えると、
     0 の ところで ちょうど キャンバスぜんぶが 見える。
     ドリー（前後）は その 立ち位置を そのまま 動かす。 */
  const cZ = -CAM_F / (camV.scaleX || 1) + camDolly(camV);
  const camP = P(cX, cY, cZ);

  /* 見えている はんい は おくゆきで 広さが かわる。
     0 の ところ だけ 出して いた ころは、おくに 立てた 板を
     「入って いる」と 思って 書き出したら 切れて いた
     ―― これが「プレビューと 画角が ちがう」の 正体。
     えらんで いる 板の おくゆき でも 1つ 出す。 */
  const corners = [[0,0],[project.w,0],[project.w,project.h],[0,project.h]];
  const sectionAt = (d) => {
    const inv = M.inv(camMatrix(camV, cx, cy, d));
    return corners.map(([sx, sy]) => {
      const c0 = M.apply(inv, sx, sy);          // キャンバスの ものさし
      const px = c0.x - cx, py = c0.y - cy;
      /* まわりこんで いる ときは、見て いる ほうも まわる */
      const q = rot3({ x: px - cX, y: py - cY, z: d - cZ }, camV.rx || 0, camV.ry || 0, 0);
      return P(cX + q.x, cY + q.y, cZ + q.z);
    });
  };
  const quad = (pts) => {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.stroke();
  };
  const far = sectionAt(0);

  /* その 板が ほんとうに 写るか。camMatrix で 画面の ものさしに うつして、
     四すみが 画面の 中に あるかを 見る。ここは 書き出しと 同じ しきだから、
     「入って いる ように 見えたのに 切れて いた」が 起きない。 */
  const onScreen = (z, px, py) => {
    const m = camMatrix(camV, cx, cy, z);
    const q = M.apply(m, cx + px, cy + py);
    return q.x >= 0 && q.x <= project.w && q.y >= 0 && q.y <= project.h;
  };


  for(const it of items){
    const a = assetOf(it.l, it.v.frame);
    if(!a) continue;
    const w = a.w * (it.v.scaleX == null ? 1 : it.v.scaleX) * it.sx;
    const h = a.h * (it.v.scaleY == null ? 1 : it.v.scaleY) * it.sy;
    const pvx = (it.l.pivot && it.l.pivot.x != null) ? it.l.pivot.x : 0.5;
    const pvy = (it.l.pivot && it.l.pivot.y != null) ? it.l.pivot.y : 0.5;
    const x0 = -w * pvx, x1 = w * (1 - pvx);
    const y0 = -h * pvy, y1 = h * (1 - pvy);
    const ox2 = it.ox, oy2 = it.oy;

    const pts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([px, py]) => {
      const q = rot3({ x: px, y: py, z: 0 }, it.rx, it.ry, it.rz);
      return P(ox2 + q.x, oy2 + q.y, it.z + q.z);
    });

    /* この 板の おくゆき の ところにも 写る はんいの わくを 出す。
       わくを 0 の ところ だけ に して いた ころは、
       おくに ある 板ほど 横に ずれて 見えて、
       中に 入って いるのか 外なのか まったく わからなかった。 */
    if(Math.abs(it.z) > 1 && !shown[Math.round(it.z)]){
      shown[Math.round(it.z)] = 1;
      g.strokeStyle = 'rgba(242,160,184,.4)';
      g.lineWidth = 1 * r.dpr;
      quad(sectionAt(it.z));
    }

    /* 四すみが ぜんぶ 画面の 中 なら まるごと 写る。
       1つも 入って いなければ まったく 写らない。 */
    let inN = 0;
    for(const [px, py] of [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]){
      const q = rot3({ x: px, y: py, z: 0 }, it.rx, it.ry, it.rz);
      if(onScreen(it.z, ox2 + q.x, oy2 + q.y)) inN++;
    }
    const out = inN === 0;

    const on = it.l.id === selId || it.ids.indexOf(selId) >= 0;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillStyle = on ? 'rgba(226,221,96,.55)'
                     : (out ? 'rgba(138,132,112,.14)' : 'rgba(122,196,160,.28)');
    g.fill();
    g.strokeStyle = on ? '#1E1C14'
                       : (out ? 'rgba(30,28,20,.2)' : 'rgba(30,28,20,.45)');
    g.lineWidth = (on ? 2 : 1.2) * r.dpr;
    if(out) g.setLineDash([3 * r.dpr, 3 * r.dpr]);
    g.stroke();
    g.setLineDash([]);
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

  /* 見えている はんい（0 の ところの 四すみへ 4本）

     ここは「ほんとうに 書き出される はんい」と 同じ 出し方に する。
     前は ズームだけ 見て いて、よせ（ドリー）の ぶんが 入って
     いなかった ので、のぞき窓の わくと 書き出した 絵の 画角が
     ずれて 見えて いた。

     絵を うつす とき（camMatrix）の ぎゃくを とれば、
     画面の 四すみが キャンバスの どこに あたるかが そのまま 出る。 */

  g.strokeStyle = '#F2A0B8';
  g.lineWidth = 1.4 * r.dpr;
  /* ズームを うんと 下げる（引く）と、カメラは のぞき窓の ずっと
     そとに 立つ。そこから 4本 ひくと、窓を よこぎる 大きな ✕ に
     なって じゃま なだけ なので、そのときは ひかない。 */
  const camIn = camP.x > r.x - r.w && camP.x < r.x + r.w * 2
             && camP.y > r.y - r.h && camP.y < r.y + r.h * 2;

  /* いちばん おくの 板まで 線を のばす。そこまでが 写る はんい。 */
  const deep = items.length ? Math.max(0, items[0].z) : 0;
  if(deep > 1){
    const dq = sectionAt(deep);
    g.strokeStyle = 'rgba(242,160,184,.45)';
    quad(dq);
    if(camIn) dq.forEach(p => line(g, camP, p));
  }

  /* えらんで いる 板の おくゆき の はんい（点線） */
  const selIt = items.find(it => it.l.id === selId || it.ids.indexOf(selId) >= 0);
  if(selIt && Math.abs(selIt.z) > 1 && Math.abs(selIt.z - deep) > 1){
    g.strokeStyle = 'rgba(242,160,184,.8)';
    g.setLineDash([4 * r.dpr, 3 * r.dpr]);
    quad(sectionAt(selIt.z));
    g.setLineDash([]);
  }

  g.strokeStyle = '#F2A0B8';
  g.lineWidth = 1.4 * r.dpr;
  if(camIn && deep <= 1) far.forEach(p => line(g, camP, p));
  quad(far);

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
