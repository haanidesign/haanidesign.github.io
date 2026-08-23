/* Canvas 2D で描く。まずはこちら。
   重かったら render/gl.js（WebGL2）に差し替えられるよう、
   renderer.js の中身だけを変えれば済むようにしてある。 */

import { computeAll, cornersOf } from '../engine/layer.js';
import { frameAsset, frameImage } from '../state.js';
import { deform, drawDeformed, precompute, needsPrecompute, buildMesh, meshSizeFor } from '../engine/puppet.js';

const INK = '#1E1C14', MAIN = '#E1DD60', PAPER = '#FFFEF7', PINK = '#F2A0B8';

export function createC2D(canvas){
  const ctx = canvas.getContext('2d');
  let dotPat = null;
  // クリッピング・エフェクト用の作業キャンバス（使い回す）
  const tmp = [null, null, null];

  function scratch(i){
    if(!tmp[i]) tmp[i] = document.createElement('canvas');
    const c = tmp[i];
    if(c.width !== canvas.width || c.height !== canvas.height){
      c.width = canvas.width; c.height = canvas.height;
    }
    return c;
  }

  function dots(){
    if(dotPat === null){
      const t = document.createElement('canvas');
      t.width = t.height = 14;
      const g = t.getContext('2d');
      g.fillStyle = 'rgba(30,28,20,.07)';
      g.beginPath(); g.arc(7, 7, 1.6, 0, 7); g.fill();
      dotPat = ctx.createPattern(t, 'repeat') || false;
    }
    return dotPat;
  }

  /** 絵そのものを1枚置く（反転とぼかしはここで効かせる） */
  function place(g, l, pose, asset, img){
    const m = pose.m, v = pose.v;
    g.save();
    g.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    // 反転は回転軸を中心にひっくり返す
    if(v.flipX || v.flipY) g.scale(v.flipX ? -1 : 1, v.flipY ? -1 : 1);
    if(v.blur > 0.01) g.filter = 'blur(' + v.blur + 'px)';

    // もどす・やりなおしの後はあみが消えているので、必要なら張り直す
    if(!l.mesh && v.pins && v.pins.length && img.complete && img.naturalWidth){
      const size = meshSizeFor(img);
      l.mesh = buildMesh(img, size.cols, size.rows);
    }

    if(l.mesh && v.pins && v.pins.length){
      // パペットピンで曲げて描く。絵の中の座標なので、左上を原点にそろえる
      g.translate(-asset.w * l.pivot.x, -asset.h * l.pivot.y);
      if(needsPrecompute(l.mesh, v.pins, l.stiff)) precompute(l.mesh, v.pins, l.stiff);
      const n = l.mesh.verts.length;
      if(!l._xy || l._xy.length < n * 2) l._xy = new Float32Array(n * 2);
      deform(l.mesh, v.pins, l._xy);
      drawDeformed(g, img, l.mesh, l._xy);
    } else {
      g.drawImage(img, -asset.w * l.pivot.x, -asset.h * l.pivot.y, asset.w, asset.h);
    }

    g.filter = 'none';
    g.restore();
  }

  /** 1枚ぶん描く。塗りがあるときだけ別紙を経由する */
  function paint(g, l, pose, tf){
    const asset = frameAsset(l, pose.v.frame);
    const img = frameImage(l, pose.v.frame);
    if(!asset || !img || !img.complete || !img.naturalWidth) return;
    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity));
    if(alpha <= 0) return;

    if(!(v.tintAmount > 0.001)){
      g.save();
      g.globalAlpha = alpha;
      place(g, l, pose, asset, img);
      g.restore();
      return;
    }

    /* 塗り＝絵の形の中だけを色で染める。
       ① 別紙に絵を描く
       ② source-atop で色をかぶせる（絵のある所だけ染まる）
       ③ 本番へ重ねる */
    const c = scratch(2), gx = c.getContext('2d');
    gx.setTransform(1, 0, 0, 1, 0, 0);
    gx.clearRect(0, 0, canvas.width, canvas.height);
    gx.globalAlpha = 1;
    gx.setTransform(...tf);
    place(gx, l, pose, asset, img);

    gx.setTransform(1, 0, 0, 1, 0, 0);
    gx.globalCompositeOperation = 'source-atop';
    gx.globalAlpha = Math.min(1, v.tintAmount);
    gx.fillStyle = v.tintColor || '#F2A0B8';
    gx.fillRect(0, 0, canvas.width, canvas.height);
    gx.globalCompositeOperation = 'source-over';
    gx.globalAlpha = 1;

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    g.drawImage(c, 0, 0);
    g.restore();
  }

  /** 奥から手前へ。クリップするレイヤーは、すぐ下の1枚にくっつけてまとめる */
  function groupLayers(layers){
    const groups = [];
    for(let i = layers.length - 1; i >= 0; i--){   // [0]が手前なので後ろから
      const l = layers[i];
      if(l.clip && groups.length) groups[groups.length - 1].clippers.push(l);
      else groups.push({ base: l, clippers: [] });
    }
    return groups;
  }

  function draw(project, imgs, time, view, opts = {}){
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const tf = opts.forExport
      ? [1, 0, 0, 1, 0, 0]
      : [view.z, 0, 0, view.z, view.x, view.y];
    ctx.setTransform(...tf);

    ctx.fillStyle = project.bg;
    ctx.fillRect(0, 0, project.w, project.h);
    if(!opts.forExport){
      const p = dots();
      if(p){ ctx.save(); ctx.fillStyle = p; ctx.fillRect(0, 0, project.w, project.h); ctx.restore(); }
    }

    const poses = computeAll(project, time);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, project.w, project.h);
    ctx.clip();

    for(const grp of groupLayers(project.layers)){
      const base = grp.base;
      const basePose = poses[base.id];
      const drawBase = base.visible && basePose;
      const clippers = grp.clippers.filter(c => c.visible && poses[c.id]);

      if(!clippers.length){
        if(drawBase) paint(ctx, base, basePose, tf);
        continue;
      }

      /* 下の絵の形で上を抜く。
         ① 下の絵だけを別紙に描く
         ② 上の絵たちを別の紙に描く
         ③ ②を①の形で抜く（destination-in）
         ④ ①→③ の順に本番へ重ねる */
      const cBase = scratch(0), cClip = scratch(1);
      const gB = cBase.getContext('2d'), gC = cClip.getContext('2d');
      gB.setTransform(1, 0, 0, 1, 0, 0); gB.clearRect(0, 0, W, H);
      gC.setTransform(1, 0, 0, 1, 0, 0); gC.clearRect(0, 0, W, H);
      gB.setTransform(...tf);
      gC.setTransform(...tf);

      if(drawBase) paint(gB, base, basePose, tf);
      for(const c of clippers) paint(gC, c, poses[c.id], tf);

      gC.setTransform(1, 0, 0, 1, 0, 0);
      gC.globalCompositeOperation = 'destination-in';
      gC.drawImage(cBase, 0, 0);
      gC.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if(drawBase) ctx.drawImage(cBase, 0, 0);
      ctx.drawImage(cClip, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    if(!opts.forExport){
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 / view.z;
      ctx.strokeRect(0, 0, project.w, project.h);
    }

    return poses;
  }

  /** 選んでいるレイヤーの枠とハンドル */
  function drawSelection(project, layer, poses, view){
    const pose = poses[layer.id]; if(!pose) return null;
    const asset = frameAsset(layer, pose.v.frame); if(!asset) return null;
    const q = cornersOf(layer, pose.m, asset); if(!q) return null;

    const z = view.z;
    ctx.setTransform(z, 0, 0, z, view.x, view.y);

    ctx.lineWidth = 4 / z;
    ctx.strokeStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for(let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2 / z;
    ctx.strokeStyle = INK;
    ctx.stroke();

    const piv = { x: pose.m.tx, y: pose.m.ty };
    ctx.lineWidth = 2 / z;
    ctx.beginPath(); ctx.arc(piv.x, piv.y, 7 / z, 0, 7);
    ctx.fillStyle = MAIN; ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(piv.x - 11/z, piv.y); ctx.lineTo(piv.x + 11/z, piv.y);
    ctx.moveTo(piv.x, piv.y - 11/z); ctx.lineTo(piv.x, piv.y + 11/z);
    ctx.stroke();

    const handles = {
      scale:  q[2],
      rotate: { x: (q[0].x + q[1].x)/2 + (q[1].x - q[2].x)*0.28,
                y: (q[0].y + q[1].y)/2 + (q[1].y - q[2].y)*0.28 },
      anchor: piv          // まん中の印＝回転のじく。つまんで動かせる
    };
    ctx.beginPath();
    ctx.moveTo((q[0].x + q[1].x)/2, (q[0].y + q[1].y)/2);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();

    for(const [k, h] of Object.entries(handles)){
      if(k === 'anchor') continue;              // じくは上で十字を描いてある
      ctx.beginPath(); ctx.arc(h.x, h.y, 9 / z, 0, 7);
      ctx.fillStyle = k === 'rotate' ? PINK : MAIN;
      ctx.fill();
      ctx.lineWidth = 4 / z; ctx.strokeStyle = PAPER; ctx.stroke();
      ctx.lineWidth = 2 / z; ctx.strokeStyle = INK;  ctx.stroke();
    }
    return handles;
  }

  return { ctx, draw, drawSelection };
}
