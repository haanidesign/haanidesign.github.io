/* ステージ。絵を見せて、指で直接さわれるようにするところ。 */

import { M, clamp } from '../engine/math.js?v=100';
import { cleanPath } from '../engine/path.js?v=100';
import { computeAll, pickLayer, hitsLayer, isFolder, membersOf,
         keepChildren, cornersOf } from '../engine/layer.js?v=100';
import { S, beginEdit, commitEdit, edit, onChange, selected, frameAsset, frameImage } from '../state.js?v=100';
import { hasPins, setPin, valuesAt, pinChX, pinChY, shiftTrack } from '../engine/anim.js?v=100';
import { buildMesh, buildMeshRect, meshSizeFor, newPin, precompute, needsPrecompute, deform, strokeMesh,
         bendChain } from '../engine/puppet.js?v=100';
import { createRenderer } from '../render/renderer.js?v=100';
import { attachInput } from './input.js?v=100';
import { newStroke, paintDirty } from '../engine/paint.js?v=100';
import { newCage, idxAt, restAt, movePoint, quadOf, setQuad,
         resetCage, cageFlat, cageHasKeys, cageKeys,
         cageToTime, paintLock, hasLock } from '../engine/warp.js?v=100';

export function createStage(canvas, host, toast, onTraced){
  const R = createRenderer(canvas);
  let poses = {};
  let handles = null;
  let drag = null;
  let viewStart = null;

  /* ---- 画面と座標 ---- */
  function resize(){
    const r = host.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
  }

  function fit(){
    const z = Math.min(canvas.width / S.proj.w, canvas.height / S.proj.h) * 0.88;
    S.view.z = z;
    S.view.x = (canvas.width  - S.proj.w * z) / 2;
    S.view.y = (canvas.height - S.proj.h * z) / 2;
  }

  const toCanvas = (p) => ({
    x: (p.x - S.view.x) / S.view.z,
    y: (p.y - S.view.y) / S.view.z
  });

  /* ---- 描画 ---- */
  function draw(){
    poses = R.draw(S.proj, S.imgs, S.time, S.view);
    const l = selected();
    if(S.pinMode && l){
      drawPuppet(l);
      handles = null;                 // ピンモード中は枠のハンドルを出さない
    } else if(S.traceMode || S.paintMode || S.warpMode){
      handles = null;                 // なぞり中・おえかき中も 枠は 出さない
    } else {
      handles = l && l.visible ? R.drawSelection(S.proj, l, poses, S.view) : null;
    }
    if(S.warpMode && l) drawCage(l);
    if(S.traceMode) drawTraceZone();
    if(S.tracePts) drawTrace();
  }

  /* ---------- ゆがみ・自由変形の かご ---------- */
  /** 筆の 太さ（絵の中の ドット） */
  function brushR(l){
    const cg = l.cage;
    if(!cg) return 40;
    return Math.max(6, Math.min(cg.w, cg.h) * S.lockBrush);
  }
  /** かごの あみの目 → キャンバスの ざひょう */
  function cageToCanvas(l, pose, p){
    // フォルダの かごは キャンバスの ざひょう そのもの
    if(isFolder(l)) return { x: p.x, y: p.y };
    const asset = frameAsset(l, pose.v.frame);
    if(!asset) return null;
    return M.apply(pose.m, p.x - asset.w * l.pivot.x, p.y - asset.h * l.pivot.y);
  }

  function drawCage(l){
    if(!l.cage) return;
    const pose = poses[l.id] || livePoses()[l.id];
    if(!pose) return;
    const ctx = R.ctx;
    /* ピンが うって あれば その 時こくの 形を 出す */
    const cg = (pose.v.cagePts && S.warpDrag !== l.id)
      ? { w:l.cage.w, h:l.cage.h, cols:l.cage.cols, rows:l.cage.rows, pts: pose.v.cagePts }
      : l.cage;
    const at = (i, j) => cageToCanvas(l, pose, cg.pts[idxAt(cg, i, j)]);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const z = S.view.z;
    const P = (p) => ({ x: p.x * z + S.view.x, y: p.y * z + S.view.y });

    // あみの すじ
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(30,28,20,.35)';
    for(let j = 0; j <= cg.rows; j++){
      ctx.beginPath();
      for(let i = 0; i <= cg.cols; i++){
        const q = P(at(i, j));
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }
    for(let i = 0; i <= cg.cols; i++){
      ctx.beginPath();
      for(let j = 0; j <= cg.rows; j++){
        const q = P(at(i, j));
        j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }

    // 四すみの わく（自由変形の めじるし）
    const corners = [[0,0],[cg.cols,0],[cg.cols,cg.rows],[0,cg.rows]];
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#E24A4A';
    ctx.beginPath();
    corners.forEach(([i, j], k) => {
      const q = P(at(i, j));
      k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.stroke();

    // つまむ ところ
    const dot = (q, r, fill) => {
      ctx.beginPath();
      ctx.rect(q.x - r, q.y - r, r * 2, r * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1E1C14';
      ctx.stroke();
    };
    if(S.warpMode === 'warp' || S.warpMode === 'lock'){
      const lock = l.cage.lock || [];
      for(let j = 0; j <= cg.rows; j++){
        for(let i = 0; i <= cg.cols; i++){
          const k = idxAt(cg, i, j);
          const on = S.warpSel === k;
          // かためた 目は 赤。引っぱっても 動かない
          const col = lock[k] ? '#E24A4A' : (on ? '#F2A0B8' : '#7B61E8');
          dot(P(at(i, j)), on ? 9 : 6, col);
        }
      }
      /* かためた ところを 赤く ぼんやり ぬる（どこを 止めたか 見える） */
      if(hasLock(l.cage)){
        ctx.fillStyle = 'rgba(226,74,74,.18)';
        for(let j = 0; j < cg.rows; j++){
          for(let i = 0; i < cg.cols; i++){
            const c4 = [[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
            if(!c4.every(([a, b]) => lock[idxAt(cg, a, b)])) continue;
            ctx.beginPath();
            c4.forEach(([a, b], n) => {
              const q = P(at(a, b));
              n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
            });
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      // 筆の わっか
      if(S.warpMode === 'lock' && S.brushAt){
        const q = P(cageToCanvas(l, pose, S.brushAt));
        const rr = brushR(l) * S.view.z * (pose.v.scaleX || 1);
        ctx.beginPath();
        ctx.arc(q.x, q.y, rr, 0, Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = S.lockErase ? 'rgba(30,28,20,.7)' : 'rgba(226,74,74,.9)';
        ctx.stroke();
      }
    } else {
      corners.forEach(([i, j]) => dot(P(at(i, j)), 10, '#E24A4A'));
    }
    ctx.restore();
  }

  /** さわった ところに いちばん 近い あみの目 */
  function pickCagePoint(l, cp, onlyCorners){
    if(!l.cage) return -1;
    const pose = poses[l.id] || livePoses()[l.id];
    if(!pose) return -1;
    const cg = (pose.v.cagePts && S.warpDrag !== l.id)
      ? { w:l.cage.w, h:l.cage.h, cols:l.cage.cols, rows:l.cage.rows, pts: pose.v.cagePts }
      : l.cage;
    const list = [];
    if(onlyCorners){
      [[0,0],[cg.cols,0],[cg.cols,cg.rows],[0,cg.rows]]
        .forEach(([i, j]) => list.push(idxAt(cg, i, j)));
    } else {
      for(let k = 0; k < cg.pts.length; k++) list.push(k);
    }
    let best = -1, bd = Infinity;
    const near = 26 / Math.max(0.05, S.view.z);      // 指の 太さ ぶん
    for(const k of list){
      const q = cageToCanvas(l, pose, cg.pts[k]);
      if(!q) continue;
      const d = Math.hypot(q.x - cp.x, q.y - cp.y);
      if(d < bd){ bd = d; best = k; }
    }
    return bd <= near ? best : -1;
  }

  /* スマホは 画面の はしから 指を すべらせると「もどる」に なる。
     ページからは 止められないので、
     「ここより 内がわから はじめてね」という わくを 出す。 */
  const EDGE = 26;                    // はしから これくらいは 危ない

  function drawTraceZone(){
    const ctx = R.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = canvas.width, h = canvas.height;
    const dpr = w / (canvas.clientWidth || w);
    const m = EDGE * dpr;
    ctx.setLineDash([12 * dpr, 9 * dpr]);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(242,160,184,.85)';
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** さわった ところが 画面の はしすぎないか */
  function nearEdge(p){
    const r = canvas.getBoundingClientRect();
    return (p.x - r.left) < EDGE || (r.right - p.x) < EDGE;
  }

  /** なぞった みちを 出す */
  function drawTrace(){
    const pts = S.tracePts;
    if(!pts || pts.length < 2) return;
    const ctx = R.ctx, z = S.view.z;
    ctx.save();
    ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 7 / z; ctx.strokeStyle = 'rgba(255,254,247,.9)'; ctx.stroke();
    ctx.lineWidth = 4 / z; ctx.strokeStyle = '#F2A0B8'; ctx.stroke();
    // はじめと おわり
    const mark = (p, fill) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 9 / z, 0, 7);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 3 / z; ctx.strokeStyle = '#FFFEF7'; ctx.stroke();
      ctx.lineWidth = 1.6 / z; ctx.strokeStyle = '#1E1C14'; ctx.stroke();
    };
    mark(pts[0], '#7AC4A0');
    mark(pts[pts.length - 1], '#E1DD60');
    ctx.restore();
  }

  /** ピンモード中の見た目：あみと、刺さっているピン */
  function drawPuppet(l){
    const pose = poses[l.id]; if(!pose) return;
    const folder = isFolder(l);
    const asset = folder ? null : frameAsset(l, pose.v.frame);
    if(!folder && !asset) return;
    const ctx = R.ctx, z = S.view.z;
    const v = valuesAt(l, S.time);

    /* ピンが 1本も 無いときは 何も 出ないので、どこを おせば よいか
       分からなかった。絵の わくを 点線で 出しておく。
       （フォルダは キャンバス ぜんたいが 絵） */
    ctx.save();
    ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
    let q = null;
    if(folder){
      q = [{x:0,y:0},{x:S.proj.w,y:0},{x:S.proj.w,y:S.proj.h},{x:0,y:S.proj.h}];
    } else {
      q = cornersOf(l, pose.m, asset);
    }
    if(q){
      ctx.beginPath();
      ctx.moveTo(q[0].x, q[0].y);
      for(let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath();
      ctx.setLineDash([10 / z, 7 / z]);
      ctx.lineWidth = 4 / z; ctx.strokeStyle = 'rgba(255,254,247,.9)'; ctx.stroke();
      ctx.lineWidth = 2 / z; ctx.strokeStyle = '#F2A0B8'; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    if(l.mesh && v.pins.length){
      ctx.save();
      ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
      if(!folder){
        // フォルダの あみは キャンバスの ざひょう そのままなので、
        // レイヤーの 置きかたを かけない
        const m = pose.m;
        ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
        ctx.translate(-asset.w * l.pivot.x, -asset.h * l.pivot.y);
      }
      if(needsPrecompute(l.mesh, v.pins, l.stiff)) precompute(l.mesh, v.pins, l.stiff);
      const n = l.mesh.verts.length;
      const xy = new Float32Array(n * 2);
      deform(l.mesh, v.pins, xy);
      // あみは 絵の じゃまに ならないよう うすく 細く
      strokeMesh(ctx, l.mesh, xy, 0.7 / (z * (folder ? 1 : (pose.v.scaleX || 1))), 'rgba(30,28,20,.10)');
      ctx.restore();
    }

    ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
    l.pins.forEach((p, i) => {
      const vp = v.pins[i] || p;
      const at = fromImage(l, pose, { x: p.u + vp.dx, y: p.v + vp.dy });
      if(!at) return;
      const sel = i === S.pinSel;
      const r = (sel ? 12 : 10) / z;
      ctx.beginPath();
      // かんせつは 四角。ひと目で 折れる所だと分かるように
      if(p.joint) ctx.rect(at.x - r, at.y - r, r * 2, r * 2);
      else ctx.arc(at.x, at.y, r, 0, 7);
      ctx.fillStyle = p.type === 'fix' ? '#7AC4A0' : p.joint ? '#E1DD60' : '#F2A0B8';
      ctx.fill();
      ctx.lineWidth = 4 / z; ctx.strokeStyle = '#FFFEF7'; ctx.stroke();
      ctx.lineWidth = 2.4 / z; ctx.strokeStyle = '#1E1C14'; ctx.stroke();
      if(p.type === 'fix'){
        ctx.beginPath();
        ctx.moveTo(at.x - 5/z, at.y); ctx.lineTo(at.x + 5/z, at.y);
        ctx.moveTo(at.x, at.y - 5/z); ctx.lineTo(at.x, at.y + 5/z);
        ctx.lineWidth = 2.4 / z; ctx.stroke();
      }
    });
  }

  /* さわられた時点の配置。描画を待たずにその場で出す。
     （タブが裏にいると requestAnimationFrame が止まるので、
       直前の描画結果に頼ると最初のタップが効かなくなる） */
  function livePoses(){
    poses = computeAll(S.proj, S.time);
    return poses;
  }

  /* さわった場所にあるレイヤー。
     いま選んでいるものが指の下にあれば、それを優先する。
     そうしないと、重なった手前のレイヤーに毎回さらわれて狙ったものを動かせない。 */
  function pickPreferSelected(cp, P){
    const cur = selected();
    if(hitsLayer(cur, P[cur && cur.id], S.proj.assets, cp.x, cp.y)) return cur;

    // フォルダは 絵を持たないので、中身のどれかに さわったら フォルダのままにする。
    // そうしないと フォルダを つかんで動かせない。
    if(isFolder(cur) && membersOf(S.proj, cur)
        .some(k => hitsLayer(k, P[k.id], S.proj.assets, cp.x, cp.y))) return cur;

    return pickLayer(S.proj, P, S.proj.assets, cp.x, cp.y);
  }

  /* ================= パペットピン ================= */

  /** キャンバス座標 → その絵の中の座標 */
  function toImage(l, pose, cp){
    // フォルダは キャンバス ぜんたいが 絵。さわった所が そのまま 絵の中の点
    if(isFolder(l)) return { x: cp.x, y: cp.y };
    const asset = frameAsset(l, pose.v.frame);
    if(!asset) return null;
    const inv = M.inv(pose.m);
    const p = M.apply(inv, cp.x, cp.y);
    /* あみで ゆがめても、レイヤーの 中の ものさしは 変わらない。
       ゆがんだ 絵は「同じ ものさしの ちがう 場所」に 出ているだけ なので、
       ここで 出る 数は そのまま ピンに つかえる
       （ピンは ゆがめた あとの 形に ささる）。 */
    return { x: p.x + asset.w * l.pivot.x, y: p.y + asset.h * l.pivot.y };
  }

  /** 絵の中の座標 → キャンバス座標 */
  function fromImage(l, pose, ip){
    // フォルダは キャンバスの ざひょう そのもの
    if(isFolder(l)) return { x: ip.x, y: ip.y };
    const asset = frameAsset(l, pose.v.frame);
    if(!asset) return null;
    return M.apply(pose.m, ip.x - asset.w * l.pivot.x, ip.y - asset.h * l.pivot.y);
  }

  /** ピンを刺すとき、まだあみが無ければ張る */
  function ensureMesh(l){
    if(l.mesh) return true;
    if(isFolder(l)){
      /* フォルダは 絵を 持たないので、キャンバス ぜんたいを
         1まいの 絵と みなして あみを 張る。
         ピンの ものさしは キャンバスの ドット。 */
      const long = Math.max(S.proj.w, S.proj.h);
      const n = 16;
      const cols = Math.max(2, Math.round(n * S.proj.w / long));
      const rows = Math.max(2, Math.round(n * S.proj.h / long));
      l.mesh = buildMeshRect(S.proj.w, S.proj.h, cols, rows);
      return true;
    }
    const img = frameImage(l, 0);
    if(!img || !img.complete) return false;
    const { cols, rows } = meshSizeFor(img);
    l.mesh = buildMesh(img, cols, rows);
    return true;
  }

  /** いま指の下にあるピン（画面上の距離で判定） */
  function pickPin(l, pose, cp){
    if(!l.pins || !l.pins.length) return -1;
    const v = valuesAt(l, S.time);
    const r = 22 / S.view.z;
    let best = -1, bd = r;
    l.pins.forEach((p, i) => {
      const vp = v.pins[i] || p;
      const at = fromImage(l, pose, { x: p.u + vp.dx, y: p.v + vp.dy });
      if(!at) return;
      const d = Math.hypot(at.x - cp.x, at.y - cp.y);
      if(d < bd){ bd = d; best = i; }
    });
    return best;
  }

  /** ピンモード中にタップしたとき：刺す か けす */
  function tapInPinMode(cp){
    const l = selected();
    if(!l) return toast('レイヤーをえらんでね');
    if(l.locked) return toast('🔒 カギが かかっています');
    const P = livePoses();
    const pose = P[l.id]; if(!pose) return;

    const i = pickPin(l, pose, cp);
    if(S.pinKind === 'del'){
      if(i < 0) return;
      edit('ピンをけす', () => {
        const pin = l.pins[i];
        delete (l.tracks || {})[pinChX(pin.id)];
        delete (l.tracks || {})[pinChY(pin.id)];
        l.pins.splice(i, 1);
        if(l.mesh) l.mesh.dirty = true;
        if(!l.pins.length){ l.mesh = null; l._xy = null; }
      });
      S.pinSel = -1;
      onChange();
      return;
    }
    // 「かんせつ」でピンをおすと、そこが カクッと折れるように なる／もどる
    if(i >= 0 && S.pinKind === 'joint'){
      const pin = l.pins[i];
      edit(pin.joint ? 'かんせつを やめる' : 'かんせつにする', () => {
        pin.joint = !pin.joint;
        if(l.mesh) l.mesh.dirty = true;
      });
      S.pinSel = i;
      toast(pin.joint ? 'ここで カクッと 折れます' : 'なめらかに もどしました');
      onChange();
      return;
    }
    if(i >= 0){ S.pinSel = i; onChange(); return; }   // すでにあるピンを選ぶだけ

    const ip = toImage(l, pose, cp);
    if(!ip) return;
    const box = isFolder(l)
      ? { w: S.proj.w, h: S.proj.h }
      : (() => { const a = frameAsset(l, pose.v.frame); return a ? { w: a.w, h: a.h } : null; })();
    if(!box) return;
    if(ip.x < 0 || ip.y < 0 || ip.x > box.w || ip.y > box.h){
      return toast(isFolder(l) ? 'キャンバスの中を おしてね' : '絵の上を おしてね');
    }
    if(!ensureMesh(l)) return toast('絵を よみこみ中です');

    edit('ピンをさす', () => {
      l.pins.push(newPin(ip.x, ip.y,
        S.pinKind === 'fix' ? 'fix' : 'move',
        S.pinKind === 'joint'));
      l.mesh.dirty = true;
    });
    S.pinSel = l.pins.length - 1;
    toast(S.pinKind === 'fix'   ? 'とめるピンを さしました'
        : S.pinKind === 'joint' ? 'かんせつピンを さしました（ここで折れる）'
        : 'うごかすピンを さしました');
    onChange();
  }

  /* ---- ハンドルの当たり判定 ---- */
  function hitHandle(cp){
    if(!handles) return null;
    const r = 18 / S.view.z;
    // じく（まん中）は他のハンドルより先に見る
    if(handles.anchor && Math.hypot(cp.x - handles.anchor.x, cp.y - handles.anchor.y) < r) return 'anchor';
    for(const [k, h] of Object.entries(handles)){
      if(k === 'anchor') continue;
      if(Math.hypot(cp.x - h.x, cp.y - h.y) < r) return k;
    }
    return null;
  }

  /**
   * 回転のじく（アンカー）を動かす。絵は動かさずに、じくだけずらす。
   * じくは絵の中の割合（0〜1）で持っているので、ずらしたぶんだけ
   * レイヤーの位置を反対に動かして、見た目を止める。
   */
  function moveAnchor(l, pose, ip){
    const asset = frameAsset(l, pose.v.frame);
    if(!asset) return;
    const nx = clamp(ip.x / asset.w, -1, 2);
    const ny = clamp(ip.y / asset.h, -1, 2);

    const dax = (nx - l.pivot.x) * asset.w;
    const day = (ny - l.pivot.y) * asset.h;
    const m = M.trs(0, 0, pose.v.rot, pose.v.scaleX, pose.v.scaleY);
    const dx = m.a * dax + m.c * day;
    const dy = m.b * dax + m.d * day;

    /* じくを ずらすと レイヤーの位置も ずらして 見た目を止める。
       ・うごきのピンが あるときは ピン ぜんぶを 同じだけ ずらす
         （いまの時間だけ 直すと、ほかの 時間で 場所が とぶ）
       ・子レイヤーは 親の場所を もとにしているので、
         いまの見た目を おぼえて あとで つじつまを合わせる */
    keepChildren(S.proj, l, S.time, () => {
      l.x += dx; l.y += dy;
      shiftTrack(l, 'x', dx);
      shiftTrack(l, 'y', dy);
      l.pivot.x = nx; l.pivot.y = ny;
    });
  }

  /** フォルダの じく。絵が 無いので 原点そのものを 動かす */
  function moveFolderAnchor(l, cp, poses){
    const pm = l.parent && poses[l.parent] ? poses[l.parent].m : null;
    const want = pm ? M.apply(M.inv(pm), cp.x, cp.y) : { x: cp.x, y: cp.y };
    const v = valuesAt(l, S.time);
    const dx = want.x - v.x, dy = want.y - v.y;
    if(!dx && !dy) return;

    keepChildren(S.proj, l, S.time, () => {
      l.x += dx; l.y += dy;
      shiftTrack(l, 'x', dx);
      shiftTrack(l, 'y', dy);
    });
  }

  /* 動かしている最中も見た目が追いつくように、ピンがあるレイヤーは
     そのチャンネルのピンをいまの時間に置きながら動かす */
  function liveKey(l, chs){
    if(!l || !hasPins(l)) return;
    chs.forEach(c => setPin(l, c, S.time, l[c], 'smooth'));
  }

  /* ---- 操作 ---- */
  const input = attachInput(canvas, {
    onDown(p){
      const cp = toCanvas(p);
      if(S.traceMode) return;             // なぞり中は 選択を 変えない
      if(S.pinMode) return;               // ピンモード中は選択を変えない
      if(S.paintMode) return;             // おえかき中も 変えない
      if(S.warpMode) return;              // ゆがみ中も 変えない
      if(hitHandle(cp)) return;           // ハンドルはドラッグ開始時に処理する
      const hit = pickPreferSelected(cp, livePoses());
      if(hit && hit.id !== S.sel){ S.sel = hit.id; onChange(); }
    },

    onTap(p){
      const cp = toCanvas(p);
      if(S.traceMode) return;
      if(S.paintMode) return;
      if(S.warpMode) return;
      if(S.pinMode){ tapInPinMode(cp); return; }
      if(hitHandle(cp)) return;
      const hit = pickPreferSelected(cp, livePoses());
      if(!hit && S.sel){ S.sel = null; onChange(); }   // なにもない所を押したら選択を外す
    },

    onDragStart(p, byLongPress){
      const cp = toCanvas(p);
      const l = selected();
      const P = livePoses();

      /* ゆがみ・自由変形。あみの目を つまんで 動かす。 */
      if(S.warpMode === 'lock'){
        if(!l || !l.cage){ drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p }; return; }
        const ip = toImage(l, P[l.id], cp);
        if(!ip){ drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p }; return; }
        beginEdit(S.lockErase ? 'かためたのを とかす' : 'かためる');
        S.brushAt = ip;
        paintLock(l.cage, ip.x, ip.y, brushR(l), !S.lockErase);
        drag = { kind:'lock', l };
        onChange();
        return;
      }

      if(S.warpMode){
        if(!l || !l.cage){
          drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p };
          return;
        }
        const k = pickCagePoint(l, cp, S.warpMode === 'free');
        if(k < 0){ drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p }; return; }
        S.warpSel = k;
        beginEdit(S.warpMode === 'free' ? '自由変形' : 'ゆがみ');
        /* ピンが うって あれば、いま 見えている 形から いじる
           （そうしないと 前の 形に もどって しまう） */
        if(cageHasKeys(l)) cageToTime(l, P[l.id] && P[l.id].v.cagePts);
        /* 引っぱって いる あいだは かごの 形を そのまま 見せる。
           （ピンから 読むと、まだ 書いて いない ぶんが もどって しまう） */
        S.warpDrag = l.id;
        drag = { kind:'cage', l, k, quad0: quadOf(l.cage) };
        onChange();
        return;
      }

      /* お絵かき。えらんでいる おえかきレイヤーの 紙に 線を ひく。
         レイヤーの 中の ざひょうで おぼえるので、
         あとから レイヤーを 動かしても 絵は ついてくる。 */
      if(S.paintMode){
        if(!l || l.kind !== 'paint'){
          toast('おえかきレイヤーを えらんでね');
          drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p };
          return;
        }
        const ip = toImage(l, P[l.id], cp);
        if(!ip){ drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p }; return; }
        beginEdit(S.penErase ? 'けしゴム' : 'ペン');
        const st = newStroke(S.penColor, S.penWidth, S.penErase);
        st.pts.push({ x: ip.x, y: ip.y });
        l.strokes = l.strokes || [];
        l.strokes.push(st);
        paintDirty(l);
        drag = { kind:'paint', l, st };
        onChange();
        return;
      }

      /* みちを なぞる。指の あとを ためるだけ。
         どう 動かすかは あとで きめる（何秒で 通るか など）。 */
      if(S.traceMode){
        if(nearEdge(p)){
          toast('画面の はしからは はじめないでね（もどるに なります）');
        }
        S.tracePts = [{ x: cp.x, y: cp.y }];
        drag = { kind: 'trace' };
        onChange();
        return;
      }

      /* カギが かかっている レイヤーは 絵の上では さわれない。
         うっかり ずらしてしまう 事故を ふせぐ。
         なおしたい ときは タイムラインの 🔒 を おして あける。 */
      if(l && l.locked){
        toast('🔒 カギが かかっています（タイムラインの 🔒 で あけられます）');
        drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p };
        return;
      }

      if(S.pinMode){
        if(!l){ drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p }; return; }
        const i = pickPin(l, P[l.id], cp);
        if(i >= 0 && S.pinKind !== 'del'){
          S.pinSel = i;
          beginEdit('ピンをうごかす');
          const pin = l.pins[i];
          const v = valuesAt(l, S.time).pins[i] || pin;
          const vv = valuesAt(l, S.time);
          drag = { kind:'puppet', l, i, ip0: toImage(l, P[l.id], cp),
                   dx0: v.dx, dy0: v.dy, u0: pin.u, v0: pin.v,
                   snap: l.pins.map((p, k) => {
                     const s = vv.pins[k] || p;
                     return { dx: s.dx, dy: s.dy };
                   }) };
          // 曲げの計算はピンの現在値を見るので、いまの時間の値に合わせておく
          l.pins.forEach((p, k) => { const s = vv.pins[k] || p; p.dx = s.dx; p.dy = s.dy; });
          onChange();
          return;
        }
        drag = { kind:'pan', vx:S.view.x, vy:S.view.y, p0:p };
        return;
      }

      const h = hitHandle(cp);

      if(l && h === 'anchor'){
        beginEdit('じくを うごかす');
        drag = { kind:'anchor', l };
        return;
      }

      if(l && h === 'scale'){
        beginEdit('大きさをかえる');
        const c = { x: P[l.id].m.tx, y: P[l.id].m.ty };
        // 回転していても正しく効くよう、レイヤーの向きに合わせた軸で測る
        const rad = (P[l.id].v.rot || 0) * Math.PI / 180;
        const ax = { x: Math.cos(rad), y: Math.sin(rad) };
        const ay = { x: -Math.sin(rad), y: Math.cos(rad) };
        const d0 = { x: cp.x - c.x, y: cp.y - c.y };
        drag = {
          kind:'scale', l, c, ax, ay,
          r0: Math.max(1, Math.hypot(d0.x, d0.y)),
          px0: Math.max(1, Math.abs(d0.x * ax.x + d0.y * ax.y)),
          py0: Math.max(1, Math.abs(d0.x * ay.x + d0.y * ay.y)),
          sx0: l.scaleX, sy0: l.scaleY
        };
        return;
      }
      if(l && h === 'rotate'){
        beginEdit('まわす');
        const c = { x: P[l.id].m.tx, y: P[l.id].m.ty };
        drag = { kind:'rotate', l, c, a0: Math.atan2(cp.y - c.y, cp.x - c.x), r0: l.rot };
        return;
      }

      const hit = pickPreferSelected(cp, P);
      if(hit){
        if(hit.id !== S.sel){ S.sel = hit.id; onChange(); }
        beginEdit('うごかす');
        drag = { kind:'move', l: hit, x0: hit.x, y0: hit.y, cp0: cp };
        if(byLongPress) toast('つかんだ');
        return;
      }

      // 絵がないところ＝画面を動かす
      drag = { kind:'pan', vx: S.view.x, vy: S.view.y, p0: p };
    },

    onDrag(p){
      if(!drag) return;
      const cp = toCanvas(p);

      if(drag.kind === 'puppet'){
        const l = drag.l;
        const pose = poses[l.id] || livePoses()[l.id];
        const ip = toImage(l, pose, cp);
        if(!ip) return;
        const pin = l.pins[drag.i];

        if(pin.type === 'fix'){
          // とめるピンは支点なので、刺す場所そのものを動かす
          const ddx = ip.x - drag.ip0.x, ddy = ip.y - drag.ip0.y;
          pin.u = drag.u0 + ddx;
          pin.v = drag.v0 + ddy;
          if(l.mesh) l.mesh.dirty = true;
        } else {
          // 骨を曲げる。支点より先のピンがぜんぶ付いてくる
          l.pins.forEach((p, k) => { p.dx = drag.snap[k].dx; p.dy = drag.snap[k].dy; });
          bendChain(l.pins, drag.i, ip.x, ip.y);
          if(hasPins(l)){
            l.pins.forEach(p => {
              if(p.type === 'fix') return;
              setPin(l, pinChX(p.id), S.time, p.dx, 'smooth');
              setPin(l, pinChY(p.id), S.time, p.dy, 'smooth');
            });
          }
        }
        onChange();
        return;
      }

      if(drag.kind === 'lock'){
        const l = drag.l;
        const ip = toImage(l, poses[l.id] || livePoses()[l.id], cp);
        if(!ip) return;
        S.brushAt = ip;
        paintLock(l.cage, ip.x, ip.y, brushR(l), !S.lockErase);
        onChange();
        return;
      }

      if(drag.kind === 'cage'){
        const l = drag.l;
        const ip = toImage(l, poses[l.id] || livePoses()[l.id], cp);
        if(!ip) return;
        if(S.warpMode === 'free'){
          /* 四すみ … つまんだ かどだけ 動かして、
             中の あみの目は そこから 出しなおす */
          const cg = l.cage;
          const cor = [[0,0],[cg.cols,0],[cg.cols,cg.rows],[0,cg.rows]]
            .map(([i, j]) => idxAt(cg, i, j));
          const w = cor.indexOf(drag.k);
          if(w < 0) return;
          const quad = drag.quad0.map(q => ({ x: q.x, y: q.y }));
          quad[w] = { x: ip.x, y: ip.y };
          setQuad(cg, quad);
        } else {
          movePoint(l.cage, drag.k, ip.x, ip.y, S.warpSoft);
        }
        /* ここでは ピンを 書かない。
           あみの目は 3×3 でも 32本、8×8だと 162本 ある。
           指を うごかす たびに ぜんぶ 書き直すと 重くて
           止まって しまう。書くのは 指を はなした とき 1回だけ。 */
        onChange();
        return;
      }

      if(drag.kind === 'paint'){
        const l = drag.l;
        const ip = toImage(l, poses[l.id] || livePoses()[l.id], cp);
        if(!ip) return;
        const pts = drag.st.pts;
        const last = pts[pts.length - 1];
        // 近すぎる 点は ためない（指の ふるえ よけ・かるくする）
        if(!last || Math.hypot(ip.x - last.x, ip.y - last.y) > 1.5){
          pts.push({ x: ip.x, y: ip.y });
          paintDirty(l);
          onChange();
        }
        return;
      }

      if(drag.kind === 'trace'){
        const pts = S.tracePts || (S.tracePts = []);
        const last = pts[pts.length - 1];
        if(!last || Math.hypot(cp.x - last.x, cp.y - last.y) > 3){
          pts.push({ x: cp.x, y: cp.y });
          onChange();
        }
        return;
      }

      if(drag.kind === 'anchor'){
        const l = drag.l;
        const pose = poses[l.id] || livePoses()[l.id];
        if(isFolder(l)){
          moveFolderAnchor(l, cp, poses);
        } else {
          const ip = toImage(l, pose, cp);
          if(ip) moveAnchor(l, pose, ip);
        }
        onChange();
        return;
      }

      if(drag.kind === 'move'){
        const l = drag.l;
        const dx = cp.x - drag.cp0.x, dy = cp.y - drag.cp0.y;
        const pm = l.parent && poses[l.parent] ? poses[l.parent].m : null;
        if(pm){
          const inv = M.inv(pm);
          const d = M.dir(inv, dx, dy);
          l.x = drag.x0 + d.x; l.y = drag.y0 + d.y;
        } else {
          l.x = drag.x0 + dx; l.y = drag.y0 + dy;
        }
        liveKey(l, ['x','y']);
      } else if(drag.kind === 'scale'){
        const l = drag.l;
        if(l.lockAspect !== false){
          const r = Math.hypot(cp.x - drag.c.x, cp.y - drag.c.y);
          const k = clamp(r / drag.r0, 0.02, 40);
          l.scaleX = clamp(drag.sx0 * k, 0.02, 40);
          l.scaleY = clamp(drag.sy0 * k, 0.02, 40);
        } else {
          // 比をそろえないときは、よことたてを別々に
          const d = { x: cp.x - drag.c.x, y: cp.y - drag.c.y };
          const px = Math.abs(d.x * drag.ax.x + d.y * drag.ax.y);
          const py = Math.abs(d.x * drag.ay.x + d.y * drag.ay.y);
          l.scaleX = clamp(drag.sx0 * (px / drag.px0), 0.02, 40);
          l.scaleY = clamp(drag.sy0 * (py / drag.py0), 0.02, 40);
        }
        liveKey(l, ['scaleX', 'scaleY']);
      } else if(drag.kind === 'rotate'){
        const a = Math.atan2(cp.y - drag.c.y, cp.x - drag.c.x);
        let deg = drag.r0 + (a - drag.a0) * 180 / Math.PI;
        drag.l.rot = Math.abs(deg % 15) < 2.2 ? Math.round(deg / 15) * 15 : deg;  // 15度に軽く吸い付く
        liveKey(drag.l, ['rot']);
      } else if(drag.kind === 'pan'){
        S.view.x = drag.vx + (p.x - drag.p0.x);
        S.view.y = drag.vy + (p.y - drag.p0.y);
      }
      onChange();
    },

    onDragEnd(){
      if(drag && drag.kind === 'trace'){
        drag = null;
        S.tracePts = cleanPath(S.tracePts || [], 3);
        if(S.tracePts.length < 2){
          S.tracePts = null;
          toast('もう少し 長く なぞってね');
        } else if(onTraced){
          onTraced();
        }
        onChange();
        return;
      }
      if(drag && drag.kind === 'lock'){
        drag = null;
        S.brushAt = null;
        commitEdit();
        onChange();
        return;
      }
      if(drag && drag.kind === 'cage'){
        const l = drag.l;
        drag = null;
        S.warpDrag = null;
        // ピンが うって あれば、いまの 時こくの ピンに する
        if(cageHasKeys(l)) cageKeys(l, S.time);
        commitEdit();
        onChange();
        return;
      }
      if(drag && drag.kind === 'paint'){
        const l = drag.l;
        // 何も ひけて いなければ その ひとふでは 取りけす
        if(!drag.st.pts.length) l.strokes.pop();
        paintDirty(l);
        drag = null;
        commitEdit();
        onChange();
        return;
      }
      if(drag && (drag.kind === 'puppet' || drag.kind === 'anchor')){ commitEdit(); drag = null; return; }
      if(drag && drag.kind !== 'pan'){
        /* すでにピンが打たれているレイヤーなら、動かした結果を
           いまの時間のピンとして残す（ピンが1つも無いうちは素の位置を変えるだけ）。 */
        const l = drag.l;
        if(l && hasPins(l)){
          const chs = drag.kind === 'move'  ? ['x','y']
                    : drag.kind === 'scale' ? ['scaleX','scaleY']
                    : drag.kind === 'rotate'? ['rot'] : [];
          chs.forEach(c => setPin(l, c, S.time, l[c], 'smooth'));
        }
        commitEdit();
      }
      drag = null;
    },

    onPinchStart(g){
      viewStart = { ...S.view, cx: g.cx, cy: g.cy, d: g.d };
    },

    onPinch(now, start){
      if(!viewStart) return;
      const k = clamp(now.d / Math.max(1, start.d), 0.15, 12);
      const z = clamp(viewStart.z * k, 0.05, 12);
      // つまんだ中心を動かさないように寄せる
      const wx = (viewStart.cx - viewStart.x) / viewStart.z;
      const wy = (viewStart.cy - viewStart.y) / viewStart.z;
      S.view.z = z;
      S.view.x = now.cx - wx * z;
      S.view.y = now.cy - wy * z;
      onChange();
    },

    onPinchEnd(){ viewStart = null; },

    onWheel(p, dy){
      const before = toCanvas(p);
      S.view.z = clamp(S.view.z * (dy > 0 ? 0.9 : 1.11), 0.05, 12);
      const after = toCanvas(p);
      S.view.x += (after.x - before.x) * S.view.z;
      S.view.y += (after.y - before.y) * S.view.z;
      onChange();
    }
  });

  return { resize, fit, draw, get poses(){ return poses; }, get drag(){ return drag; }, input };
}
