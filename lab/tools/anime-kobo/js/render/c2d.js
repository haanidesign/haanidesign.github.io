/* Canvas 2D で描く。まずはこちら。
   重かったら render/gl.js（WebGL2）に差し替えられるよう、
   renderer.js の中身だけを変えれば済むようにしてある。 */

import { computeAll, cornersOf, drawOrder, isFolder, membersOf,
         nearestFolder } from '../engine/layer.js';
import { frameAsset, frameImage } from '../state.js';
import { deform, drawDeformed, precompute, needsPrecompute, buildMesh, meshSizeFor } from '../engine/puppet.js';

const INK = '#1E1C14', MAIN = '#E1DD60', PAPER = '#FFFEF7', PINK = '#F2A0B8';

export function createC2D(canvas){
  const ctx = canvas.getContext('2d');
  let dotPat = null;
  // クリッピング・エフェクト用の作業キャンバス（使い回す）
  const tmp = [];

  function scratch(i){
    if(!tmp[i]) tmp[i] = document.createElement('canvas');
    const c = tmp[i];
    if(c.width !== canvas.width || c.height !== canvas.height){
      c.width = canvas.width; c.height = canvas.height;
    }
    return c;
  }

  /* フォルダは 中身をいったん別紙にまとめてから 効果をかける（プリコンポ）。
     入れ子になると 何枚も要るので、貸し出し式にする。
     90番と91番は ふちどり専用（描いたらすぐ使うので 取り合いにならない）。 */
  let lent = 0;
  function alloc(){
    const c = scratch(lent++);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, c.width, c.height);
    return c;
  }
  const back = (n) => { lent -= n; };

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

  /* ---------- ふちどり ----------
     絵の形を まわりへ ふくらませて 色でぬる。

     ふくらませ方
       ・小さく 縮めた 紙の上で 作る（そのぶん 何回も 重ねられる）
       ・まわり ぐるりと たくさんの 向きへ ずらして 重ねる
         → 角ばらず、まるい ふちに なる
       ・内がわの 輪も 重ねて、細い すきまを うめる
       ・さいごに 元の大きさへ ひろげる（ここで すこし なめらかになる）

     太さは キャンバスの見た目に対して一定。 */
  const OUT_K = 3;                  // いくつ ぶんの1で 作るか
  let smA = null, smB = null;
  function small(which, w, h){
    let c = which ? smB : smA;
    if(!c){ c = document.createElement('canvas'); which ? (smB = c) : (smA = c); }
    if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, w, h);
    return c;
  }

  function outline(src, px, color){
    const w = Math.max(2, Math.ceil(canvas.width / OUT_K));
    const h = Math.max(2, Math.ceil(canvas.height / OUT_K));

    /* 何回に わけて 太らせるか。
       重ねるたびに ふちが ほんの少し 外へ にじむので、
       そのぶんを 先に 引いておく（そうしないと 指定より 太くなる）。 */
    const passes = Math.max(1, Math.min(5, Math.ceil((px / OUT_K) / 5)));
    const r = Math.max(0.5, (px - (passes - 1) * 5) / OUT_K);

    let a = small(0, w, h);
    const ga = a.getContext('2d');
    ga.imageSmoothingQuality = 'high';
    /* 先に ほんの少し ぼかしてから ふくらませる。
       かみの毛のような 細い とがりを そのまま ふくらませると、
       とげとげが 目立ってしまう（とくに 中身が 動いているとき）。 */
    /* ぼかしは 太さに 比例させない。比例させると 太いときに
       ふちが 予定より ずっと 太く なってしまう。 */
    ga.filter = 'blur(' + Math.max(0.6, Math.min(2, r * 0.22)) + 'px)';
    ga.drawImage(src, 0, 0, w, h);
    ga.filter = 'none';

    /* ふくらませ方
         いちどに 大きく ずらすと、まん中が うまらず
         へこみの ところが とげとげに 見える。
         小さく ずらすのを 何回か くり返すと、
         まるい ふでで なぞったように きれいに 太る。 */
    const stepR = r / passes;
    const n = Math.max(12, Math.min(28, Math.round(stepR * 4) + 10));

    let b = small(1, w, h);
    for(let p = 0; p < passes; p++){
      const from = p % 2 === 0 ? a : b;
      const to   = p % 2 === 0 ? b : a;
      const gt = to.getContext('2d');
      gt.setTransform(1, 0, 0, 1, 0, 0);
      gt.globalAlpha = 1;
      gt.globalCompositeOperation = 'source-over';
      gt.clearRect(0, 0, w, h);
      gt.drawImage(from, 0, 0);                       // まん中も うめる
      for(let i = 0; i < n; i++){
        const t = ((i + (p % 2) * 0.5) / n) * Math.PI * 2;
        gt.drawImage(from, Math.cos(t) * stepR, Math.sin(t) * stepR);
      }
    }
    const done = passes % 2 === 1 ? b : a;

    const dg = done.getContext('2d');
    dg.globalCompositeOperation = 'source-in';
    dg.fillStyle = color;
    dg.fillRect(0, 0, w, h);
    dg.globalCompositeOperation = 'source-over';

    const c = scratch(91), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(done, 0, 0, canvas.width, canvas.height);
    return c;
  }

  /** 1枚ぶん描く。塗り・ふちどり があるときだけ別紙を経由する */
  function paint(g, l, pose, tf){
    const asset = frameAsset(l, pose.v.frame);
    const img = frameImage(l, pose.v.frame);
    if(!asset || !img || !img.complete || !img.naturalWidth) return;
    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity));
    if(alpha <= 0) return;

    const tinted  = v.tintAmount > 0.001;
    const strokeW = (v.strokeW || 0) * Math.abs(tf[0]);   // 画面の大きさに合わせる
    const edged   = strokeW > 0.4;

    if(!tinted && !edged){
      g.save();
      g.globalAlpha = alpha;
      place(g, l, pose, asset, img);
      g.restore();
      return;
    }

    /* 別紙にこの1枚だけを描く。塗りは「絵のある所だけ」染めたいので
       source-atop で色をかぶせる。 */
    const c = alloc(), gx = c.getContext('2d');
    gx.setTransform(...tf);
    place(gx, l, pose, asset, img);

    if(tinted){
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.globalCompositeOperation = 'source-atop';
      gx.globalAlpha = Math.min(1, v.tintAmount);
      gx.fillStyle = v.tintColor || '#F2A0B8';
      gx.fillRect(0, 0, canvas.width, canvas.height);
      gx.globalCompositeOperation = 'source-over';
      gx.globalAlpha = 1;
    }

    // ふちは 絵の「下」に敷いてから、まとめて うすくする。
    // 先に本番へ別々に置くと、うすいときに ふちの色が 中まで透けてしまう。
    if(edged) under(c, outline(c, strokeW, v.strokeColor || '#FFFEF7'));

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    g.drawImage(c, 0, 0);
    g.restore();
    back(1);
  }

  /** b を a の下に敷く */
  function under(a, b){
    const g = a.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(b, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * フォルダ1つぶん。中身を別紙にまとめてから、
   * 塗り・ふちどり・ぼかし・すけ具合 を まとめて かける。
   * ＝ 中身ぜんぶを 1まいの絵として あつかう（プリコンポ）。
   */
  function paintFolder(g, project, f, pose, poses, tf){
    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity));
    if(alpha <= 0) return;

    const kids = membersOf(project, f);
    if(!kids.length) return;

    const c = alloc(), gx = c.getContext('2d');
    gx.setTransform(...tf);

    if(v.pins && v.pins.length && f.mesh){
      /* フォルダ ぜんたいを ピンで 曲げる。
         中身を いったん まとめて 描いてから、その1まいを あみで ゆがめる。
         あみの ものさしは キャンバスの ドット（もようや ズームに よらない）。 */
      /* まとめた絵は「ずらしなし」で 描く。
         そうすると 絵の中の ドットが キャンバスの ドット×ズーム に
         そろうので、あみとの ものさし合わせが かけ算だけで すむ。 */
      const tf0 = [tf[0], 0, 0, tf[3], 0, 0];
      const tmpC = alloc(), tg = tmpC.getContext('2d');
      tg.setTransform(...tf0);
      drawNodes(tg, project, kids, poses, tf0);

      if(needsPrecompute(f.mesh, v.pins, f.stiff)) precompute(f.mesh, v.pins, f.stiff);
      const n = f.mesh.verts.length;
      if(!f._xy || f._xy.length < n * 2) f._xy = new Float32Array(n * 2);
      deform(f.mesh, v.pins, f._xy);
      // まとめた絵は 画面の ドットなので、あみの ものさしを 合わせる
      drawDeformed(gx, tmpC, f.mesh, f._xy, Math.abs(tf[0]));
      back(1);
    } else {
      drawNodes(gx, project, kids, poses, tf);
    }

    if(v.tintAmount > 0.001){
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.globalCompositeOperation = 'source-atop';
      gx.globalAlpha = Math.min(1, v.tintAmount);
      gx.fillStyle = v.tintColor || '#F2A0B8';
      gx.fillRect(0, 0, canvas.width, canvas.height);
      gx.globalCompositeOperation = 'source-over';
      gx.globalAlpha = 1;
    }

    const k = Math.abs(tf[0]);
    const strokeW = (v.strokeW || 0) * k;

    if(strokeW > 0.4) under(c, outline(c, strokeW, v.strokeColor || '#FFFEF7'));

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    if(v.blur > 0.01) g.filter = 'blur(' + (v.blur * k) + 'px)';
    g.drawImage(c, 0, 0);
    g.filter = 'none';
    g.restore();
    back(1);
  }

  /** 1まい ぶん（ふつうのレイヤーでも フォルダでも） */
  function paintNode(g, project, l, poses, tf, subPoses){
    const pose = poses[l.id];
    if(!pose) return;

    /* うごきブラー … 少し前の 姿を うすく 重ねる。
       重なるほど こく なるので、うごきが はやいほど 尾を ひく。 */
    const mb = l.mblur || 0;
    if(mb > 0.01 && subPoses && subPoses.length){
      const n = subPoses.length + 1;
      const a = 1 / n;
      g.save();
      for(let k = subPoses.length - 1; k >= 0; k--){
        const ps = subPoses[k];
        const p2 = ps[l.id];
        if(!p2) continue;
        // 古い姿ほど うすく（mb が 大きいほど 尾が のこる）
        const fade = a * (0.35 + 0.65 * mb);
        g.globalAlpha = fade;
        if(isFolder(l)) paintFolder(g, project, l, p2, ps, tf);
        else paint(g, l, p2, tf);
      }
      g.globalAlpha = 1 - a * (0.35 + 0.65 * mb) * subPoses.length;
      if(g.globalAlpha < 0.15) g.globalAlpha = 0.15;
      if(isFolder(l)) paintFolder(g, project, l, pose, poses, tf);
      else paint(g, l, pose, tf);
      g.restore();
      return;
    }

    if(isFolder(l)) paintFolder(g, project, l, pose, poses, tf);
    else paint(g, l, pose, tf);
  }

  /**
   * 奥から手前へ ならべる。
   * クリップするレイヤーは、ぬかれる相手（base）に くっつけて まとめる。
   *   ・clipTo に レイヤーを えらんでいれば その形で ぬく
   *   ・えらんでいなければ すぐ下の1枚（むかしの やり方）
   */
  function groupLayers(layers){
    const groups = [];
    const byBase = {};                       // レイヤーid → その まとまり
    const waiting = {};                      // まだ base が 出てきていない ぶん

    for(let i = layers.length - 1; i >= 0; i--){   // [0]が手前なので 後ろから
      const l = layers[i];

      if(l.clip){
        const to = l.clipTo && layers.some(x => x.id === l.clipTo) ? l.clipTo : null;
        if(to){
          if(byBase[to]) byBase[to].clippers.push(l);
          else (waiting[to] = waiting[to] || []).push(l);
          continue;
        }
        if(groups.length){ groups[groups.length - 1].clippers.push(l); continue; }
      }

      const g = { base: l, clippers: [] };
      byBase[l.id] = g;
      if(waiting[l.id]){ g.clippers.push(...waiting[l.id]); delete waiting[l.id]; }
      groups.push(g);
    }

    // 相手が 見つからなかったぶんは、ふつうに 描く
    for(const id of Object.keys(waiting)){
      waiting[id].forEach(l => groups.push({ base: l, clippers: [] }));
    }
    return groups;
  }

  /** いちばん外側にあるもの（どのフォルダにも入っていないもの） */
  function topNodes(project){
    return project.layers.filter(l => !nearestFolder(project, l));
  }

  /**
   * ならんだものを 奥から手前へ描く。
   * クリップは 同じ入れ物の中だけで はたらく。
   */
  const MB_STEPS = 6;                 // 何回 重ねるか

  function drawNodes(g, project, nodes, poses, tf, subPoses){
    const W = canvas.width, H = canvas.height;
    const shown = (l) => l.visible && poses[l.id] && poses[l.id].vis !== false;

    for(const grp of groupLayers(nodes)){
      const base = grp.base;
      const drawBase = shown(base);
      const clippers = grp.clippers.filter(shown);

      if(!clippers.length){
        if(drawBase) paintNode(g, project, base, poses, tf, subPoses);
        continue;
      }

      /* 下の絵の形で上を抜く。
         ① 下の絵だけを別紙に描く
         ② 上の絵たちを別の紙に描く
         ③ ②を①の形で抜く（destination-in）
         ④ ①→③ の順に 本番へ重ねる */
      const cBase = alloc(), cClip = alloc();
      const gB = cBase.getContext('2d'), gC = cClip.getContext('2d');
      gB.setTransform(...tf);
      gC.setTransform(...tf);

      if(drawBase) paintNode(gB, project, base, poses, tf, subPoses);
      for(const c of clippers) paintNode(gC, project, c, poses, tf, subPoses);

      gC.setTransform(1, 0, 0, 1, 0, 0);
      gC.globalCompositeOperation = 'destination-in';
      gC.drawImage(cBase, 0, 0);
      gC.globalCompositeOperation = 'source-over';

      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      if(drawBase) g.drawImage(cBase, 0, 0);
      g.drawImage(cClip, 0, 0);
      g.restore();
      back(2);
    }
  }

  function draw(project, imgs, time, view, opts = {}){
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const z = opts.scale || 1;          // 見本（サムネイル）は 小さく描く
    const tf = opts.forExport
      ? [z, 0, 0, z, 0, 0]
      : [view.z, 0, 0, view.z, view.x, view.y];
    ctx.setTransform(...tf);

    // すける GIF のときは 下じきを ぬらない（そのまま すける）
    if(!opts.noBg){
      ctx.fillStyle = project.bg;
      ctx.fillRect(0, 0, project.w, project.h);
    }
    if(!opts.forExport){
      const p = dots();
      if(p){ ctx.save(); ctx.fillStyle = p; ctx.fillRect(0, 0, project.w, project.h); ctx.restore(); }
    }

    const poses = computeAll(project, time);

    /* うごきブラー（ざんぞう）。
       シャッターが 開いている あいだの 姿を 何回か 重ねる。
       ＝ うごいている ものだけ 自然に ぶれる。
       置く・回す・大きさ・パペットの 曲げ、ぜんぶに 効く。 */
    const blurLayers = project.layers.filter(l => (l.mblur || 0) > 0.01);
    let subPoses = null;
    if(blurLayers.length && !opts.noMotionBlur){
      /* シャッターが 開いている 長さ。
         きっちり 1コマぶん だと ほんの少ししか ぶれないので、
         つよさに 合わせて 長めに とる（見て わかる ように）。 */
      const mb = Math.max(...blurLayers.map(l => l.mblur || 0));
      const shutter = (1 / (project.fps || 30)) * (0.6 + 3 * mb);
      subPoses = [];
      for(let k = 1; k < MB_STEPS; k++){
        const t = Math.max(0, time - (k / MB_STEPS) * shutter);
        subPoses.push(computeAll(project, t));
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, project.w, project.h);
    ctx.clip();

    lent = 0;
    drawNodes(ctx, project, topNodes(project), poses, tf, subPoses);
    ctx.restore();

    if(!opts.forExport){
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 / view.z;
      ctx.strokeRect(0, 0, project.w, project.h);
    }

    return poses;
  }

  /** 選んでいるレイヤーの枠とハンドル */
  /** フォルダは絵を持たないので、中身ぜんぶを囲む四角を枠にする */
  function folderQuad(project, folder, poses){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const k of membersOf(project, folder)){
      const p = poses[k.id]; if(!p) continue;
      const a = frameAsset(k, p.v.frame); if(!a) continue;
      const c = cornersOf(k, p.m, a); if(!c) continue;
      for(const pt of c){
        x0 = Math.min(x0, pt.x); y0 = Math.min(y0, pt.y);
        x1 = Math.max(x1, pt.x); y1 = Math.max(y1, pt.y);
      }
    }
    if(!isFinite(x0)) return null;
    return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  }

  function drawSelection(project, layer, poses, view){
    const pose = poses[layer.id]; if(!pose) return null;
    let q;
    if(isFolder(layer)){
      q = folderQuad(project, layer, poses);
    } else {
      const asset = frameAsset(layer, pose.v.frame); if(!asset) return null;
      q = cornersOf(layer, pose.m, asset);
    }
    if(!q) return null;

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
