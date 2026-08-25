/* ステージ。絵を見せて、指で直接さわれるようにするところ。 */

import { M, clamp } from '../engine/math.js';
import { computeAll, pickLayer, hitsLayer, isFolder, membersOf,
         keepChildren, cornersOf } from '../engine/layer.js';
import { S, beginEdit, commitEdit, edit, onChange, selected, frameAsset, frameImage } from '../state.js';
import { hasPins, setPin, valuesAt, pinChX, pinChY } from '../engine/anim.js';
import { buildMesh, buildMeshRect, meshSizeFor, newPin, precompute, needsPrecompute, deform, strokeMesh,
         bendChain } from '../engine/puppet.js';
import { createRenderer } from '../render/renderer.js';
import { attachInput } from './input.js';

export function createStage(canvas, host, toast){
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
    } else {
      handles = l && l.visible ? R.drawSelection(S.proj, l, poses, S.view) : null;
    }
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
      strokeMesh(ctx, l.mesh, xy, 1.2 / (z * (folder ? 1 : (pose.v.scaleX || 1))), 'rgba(30,28,20,.28)');
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

    /* じくを ずらすと レイヤーの位置も ずらして 見た目を止める。
       このとき 子レイヤーは 親の位置を もとにしているので、
       なにもしないと 子だけ ずれてしまう。
       だから 子の いまの見た目を おぼえて、あとで つじつまを合わせる。 */
    keepChildren(S.proj, l, S.time, () => {
      const dax = (nx - l.pivot.x) * asset.w;
      const day = (ny - l.pivot.y) * asset.h;
      const m = M.trs(0, 0, pose.v.rot, pose.v.scaleX, pose.v.scaleY);
      l.x += m.a * dax + m.c * day;
      l.y += m.b * dax + m.d * day;
      l.pivot.x = nx; l.pivot.y = ny;
    });
    if(hasPins(l)){ setPin(l, 'x', S.time, l.x, 'smooth'); setPin(l, 'y', S.time, l.y, 'smooth'); }
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
      if(S.pinMode) return;               // ピンモード中は選択を変えない
      if(hitHandle(cp)) return;           // ハンドルはドラッグ開始時に処理する
      const hit = pickPreferSelected(cp, livePoses());
      if(hit && hit.id !== S.sel){ S.sel = hit.id; onChange(); }
    },

    onTap(p){
      const cp = toCanvas(p);
      if(S.pinMode){ tapInPinMode(cp); return; }
      if(hitHandle(cp)) return;
      const hit = pickPreferSelected(cp, livePoses());
      if(!hit && S.sel){ S.sel = null; onChange(); }   // なにもない所を押したら選択を外す
    },

    onDragStart(p, byLongPress){
      const cp = toCanvas(p);
      const l = selected();
      const P = livePoses();

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

      if(drag.kind === 'anchor'){
        const l = drag.l;
        const pose = poses[l.id] || livePoses()[l.id];
        if(isFolder(l)){
          /* フォルダは 絵を持たないので、原点そのものを さわった所へ 動かす。
             中身は もとの見た目の ままに しておく（keepChildren）。 */
          const pm = l.parent && poses[l.parent] ? poses[l.parent].m : null;
          const want = pm ? M.apply(M.inv(pm), cp.x, cp.y) : { x: cp.x, y: cp.y };
          keepChildren(S.proj, l, S.time, () => { l.x = want.x; l.y = want.y; });
          if(hasPins(l)){ setPin(l, 'x', S.time, l.x, 'smooth'); setPin(l, 'y', S.time, l.y, 'smooth'); }
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
