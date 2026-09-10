/* Canvas 2D で描く。まずはこちら。
   重かったら render/gl.js（WebGL2）に差し替えられるよう、
   renderer.js の中身だけを変えれば済むようにしてある。 */

import { computeAll, cornersOf, drawOrder, isFolder, membersOf,
         nearestFolder } from '../engine/layer.js?v=185';
import { camOf, fishK, fishMap } from '../engine/camera.js?v=185';
import { valuesAt } from '../engine/anim.js?v=185';
import { S, frameAsset, frameImage } from '../state.js?v=185';
import { deform, drawDeformed, precompute, needsPrecompute, buildMesh, buildMeshRect,
         meshSizeFor } from '../engine/puppet.js?v=185';
import { handOn, handFrame, handMeshSize, boil, boilPx, handShift } from '../engine/hand.js?v=185';
import { paintCanvas } from '../engine/paint.js?v=185';
import { panoCanvas } from '../engine/pano.js?v=185';
import { ballOn, ballCanvas } from '../engine/ball.js?v=185';
import { roomCanvas } from '../engine/room.js?v=185';
import { homography, applyH } from '../engine/warp.js?v=185';
import { drawCamView } from './camview.js?v=185';
import { cageMesh, cageXY, cageFlat, cagePoint } from '../engine/warp.js?v=185';

const INK = '#1E1C14', MAIN = '#E1DD60', PAPER = '#FFFEF7', PINK = '#F2A0B8';

export function createC2D(canvas){
  const ctx = canvas.getContext('2d');
  let dotPat = null;
  let curT = 0;                 // いま 何秒めを 描いているか（手がき風の コマ用）
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

  /* ---------- はみ出しも 入る 大きい 別紙 ----------
     フォルダを ゆがめる とき、中身を いったん 別紙に まとめる。
     その 別紙が キャンバスと 同じ 大きさ だと、画面の 外に ある ぶんが
     そこで 切れて しまい、ゆがめて 中へ 持ってきても
     切れた まま に なる。
     まわりに ゆとりを つけた 別紙に まとめる。 */
  /* フォルダを まとめる 別紙。

     ゆがみ・ピンの あみは キャンバスの 四角 ぶんしか ない ので、
     画面の 外に ある ぶんは そもそも あみに のらない。
     大きい 紙に まとめても つかわれない ので、
     キャンバスと 同じ 大きさ ＋ ほんの 少しの ゆとり だけに する
     （ゆとりは ふちの ぎざぎざ よけ）。 */
  const MARGIN = 8;
  let bigC = null;
  function bigSheet(){
    if(!bigC) bigC = document.createElement('canvas');
    const w = canvas.width + MARGIN * 2, h = canvas.height + MARGIN * 2;
    if(bigC.width !== w || bigC.height !== h){ bigC.width = w; bigC.height = h; }
    const g = bigC.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, w, h);
    return bigC;
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
  /* ---------- 手がき風 ----------
     コマの ばんごうから その場で 出すので、
     何秒めを 描いても 同じ絵に なる（書き出しと 画面が そろう）。 */
  function handSeed(l){
    let h = 0;
    const id = l.id || '';
    for(let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return h;
  }

  /** 線を ゆらす ための あみ（ピンが 無いとき用）。こまかさが 変われば 張り直す */
  function boilMesh(l, img){
    const sz = handMeshSize(l.hand);
    if(!l._hmesh || l._hkey !== sz.cols) {
      l._hmesh = buildMesh(img, sz.cols, sz.rows);
      l._hkey = sz.cols;
      // もとの 角の 場所。毎コマ 作り直さないよう ここで 1回だけ
      const n = l._hmesh.verts.length;
      const b = new Float32Array(n * 2);
      for(let i = 0; i < n; i++){ b[i*2] = l._hmesh.verts[i].u; b[i*2+1] = l._hmesh.verts[i].v; }
      l._hbase = b;
    }
    return l._hmesh;
  }


/* ---------- 立体（3D）で 描く ための 道具 ----------

   立体に した レイヤーは、四すみが 画面の どこに 来るかが
   さきに 出て いる（camera.js の quad3D）。
   絵ぜんたいを その 四すみに はめれば いい。

   はめ方は「自由変形」と 同じ ホモグラフィ。
   ふつうの 行列（アフィン）では おくゆきの ある ゆがみは 作れないが、
   ホモグラフィなら「おくに 行くほど せまく」が 出せる。

   あみの 目を 1つずつ 通す ので、
   ゆがみ・骨・手がき風で ずらした あとの 形にも そのまま かかる。 */

/** 絵の 四すみ → 画面の 四すみ。左右・上下の 反転も ここで まぜる */
function h3For(asset, quad, flipX, flipY){
  const w = asset.w, h = asset.h;
  const ax = flipX ? w : 0, bx = flipX ? 0 : w;
  const ay = flipY ? h : 0, by = flipY ? 0 : h;
  return homography(
    [{x:ax,y:ay}, {x:bx,y:ay}, {x:bx,y:by}, {x:ax,y:by}],
    quad
  );
}

/** あみの 目を ぜんぶ 通す。もとの 配列は こわさない */
function mapXY(xy, n, H, out){
  const o = (out && out.length >= n * 2) ? out : new Float32Array(n * 2);
  for(let i = 0; i < n; i++){
    const p = applyH(H, xy[i*2], xy[i*2+1]);
    o[i*2] = p.x; o[i*2+1] = p.y;
  }
  return o;
}

/** 絵ぜんたいを おおう ます目（立体で ふつうに 描く ときに つかう） */
const _flatMesh = {};
function flatMesh(w, h){
  const cols = 10, rows = Math.max(4, Math.round(10 * h / w));
  const key = cols + 'x' + rows + ':' + w + 'x' + h;
  if(_flatMesh.key === key) return _flatMesh.m;
  const verts = [], tris = [];
  for(let r = 0; r <= rows; r++) for(let c = 0; c <= cols; c++){
    verts.push({ u: c / cols * w, v: r / rows * h });
  }
  const id = (c, r) => r * (cols + 1) + c;
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
    tris.push(id(c, r), id(c+1, r), id(c, r+1));
    tris.push(id(c+1, r), id(c+1, r+1), id(c, r+1));
  }
  const m = { verts, tris };
  _flatMesh.key = key; _flatMesh.m = m;
  return m;
}

  function place(g, l, pose, asset, img){
    const m = pose.m, v = pose.v;

    /* 立体（3D）に して あるか。
       して あれば 場所は 四すみで きまって いる ので、
       ふつうの 行列は かけない（かけると 二重に なる）。 */
    const H3 = pose.quad ? h3For(asset, pose.quad, v.flipX, v.flipY) : null;

    g.save();
    if(!H3) g.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);

    /* 紙の ずれ。絵ぜんたいを ほんの少し 動かす・かたむける。
       じく（回転の中心）の ところで かけるので、形は くずれない。 */
    const hand = handOn(l) ? l.hand : null;
    if(hand && !H3){
      const fr = handFrame(hand, curT);
      const sh = handShift(hand, fr, handSeed(l), Math.min(asset.w, asset.h));
      g.translate(sh.dx, sh.dy);
      g.rotate(sh.rot);
    }

    // 反転は回転軸を中心にひっくり返す（立体のときは 四すみの ほうで まぜてある）
    if(!H3 && (v.flipX || v.flipY)) g.scale(v.flipX ? -1 : 1, v.flipY ? -1 : 1);
    if(v.blur > 0.01) g.filter = 'blur(' + v.blur + 'px)';

    /* 絵の中の ざひょうに そろえる。
       立体の ときは 四すみが すでに 画面の ざひょうなので なにも しない。 */
    const toImageOrigin = () => {
      if(!H3) g.translate(-asset.w * l.pivot.x, -asset.h * l.pivot.y);
    };
    /* あみを 描く 直前に 通す。立体の ときだけ 四すみへ はめる */
    const via3D = (mesh, xy) => {
      if(!H3) return xy;
      l._q3xy = mapXY(xy, mesh.verts.length, H3, l._q3xy);
      return l._q3xy;
    };

    // もどす・やりなおしの後はあみが消えているので、必要なら張り直す
    if(v.pins && v.pins.length && img.complete && img.naturalWidth
       && (!l.mesh || l._meshN !== (l.frames ? l.frames.length : 0))){
      const size = meshSizeFor(img);
      l.mesh = buildMesh(allFrameImages(l) || img, size.cols, size.rows);
      l._meshN = l.frames ? l.frames.length : 0;
      l.mesh.dirty = true;
    }

    const px = hand ? boilPx(hand, Math.min(asset.w, asset.h)) : 0;

    /* ゆがみに ピンが うって あれば、その 時こくの 形を つかう。
       うって いなければ いまの 形の まま。 */
    const cage = l.cage
      ? ((v.cagePts && S.warpDrag !== l.id)
          ? { w: l.cage.w, h: l.cage.h, cols: l.cage.cols, rows: l.cage.rows, pts: v.cagePts }
          : l.cage)
      : null;
    const warped = cage && !cageFlat(cage);
    const boned = !!(v.pins && v.pins.length);

    /* ---------- あみで ゆがめた 形に、さらに 骨で 動きを つける ----------
       ① あみ（かご）で 絵の 形を ととのえる
       ② その ゆがんだ 形の 上で 骨を 曲げる
       の 順に かける。

       骨は「ゆがめた あとの 形」に ついて いるので、
       形を 直しても 動きは そのまま。
       絵の どこを はるかは もとの まま なので、
       絵が のびたり ちぢんだり しない。 */
    if(warped && boned){
      toImageOrigin();

      if(img.complete && img.naturalWidth
         && (!l.mesh || l._meshN !== (l.frames ? l.frames.length : 0))){
        const size = meshSizeFor(img);
        l.mesh = buildMesh(allFrameImages(l) || img, size.cols, size.rows);
        l._meshN = l.frames ? l.frames.length : 0;
        l.mesh.dirty = true;
      }
      if(l.mesh){
        const n = l.mesh.verts.length;

        /* あみで ゆがめた あとの 場所を「骨の もとの 形」に する。
           かごを いじった ときだけ 作り直す。 */
        const key = JSON.stringify(cage.pts);
        if(!l._wmesh || l._wkey !== key || l._wmesh.verts.length !== n){
          const verts = l.mesh.verts.map(p => {
            const q = cagePoint(cage, p.u, p.v);
            return { u: q.x, v: q.y };
          });
          l._wmesh = { verts, tris: l.mesh.tris };
          l._wkey = key;
          // 絵の どこを はるかは もとの まま
          const uv = new Float32Array(n * 2);
          for(let i = 0; i < n; i++){ uv[i*2] = l.mesh.verts[i].u; uv[i*2+1] = l.mesh.verts[i].v; }
          l._wuv = uv;
          l._wmesh.dirty = true;
        }

        if(needsPrecompute(l._wmesh, v.pins, l.stiff)) precompute(l._wmesh, v.pins, l.stiff);
        if(!l._xy || l._xy.length < n * 2) l._xy = new Float32Array(n * 2);
        deform(l._wmesh, v.pins, l._xy);
        let xy = l._xy;
        if(px > 0.01){
          if(!l._bxy || l._bxy.length < n * 2) l._bxy = new Float32Array(n * 2);
          xy = boil(l._xy, l._bxy, px, handFrame(hand, curT), handSeed(l));
        }
        drawDeformed(g, img, l._wmesh, via3D(l._wmesh, xy), 1, l._wuv);
        g.filter = 'none';
        g.restore();
        return;
      }
    }

    /* ゆがみ・自由変形だけ（骨は なし）。
       絵の上に かぶせた「かご」の 形に そって 絵を はる。 */
    if(warped){
      toImageOrigin();
      if(!l._cmesh || l._ckey !== cage.cols + 'x' + cage.rows){
        l._cmesh = cageMesh(cage);
        l._ckey = cage.cols + 'x' + cage.rows;
        l._cxy = null;
      }
      l._cxy = cageXY(cage, l._cxy);
      let xy = l._cxy;
      if(px > 0.01){
        const n = l._cmesh.verts.length;
        if(!l._bxy || l._bxy.length < n * 2) l._bxy = new Float32Array(n * 2);
        xy = boil(l._cxy, l._bxy, px, handFrame(hand, curT), handSeed(l));
      }
      drawDeformed(g, img, l._cmesh, via3D(l._cmesh, xy));
      g.filter = 'none';
      g.restore();
      return;
    }

    if(l.mesh && v.pins && v.pins.length){
      // パペットピンで曲げて描く。絵の中の座標なので、左上を原点にそろえる
      toImageOrigin();
      if(needsPrecompute(l.mesh, v.pins, l.stiff)) precompute(l.mesh, v.pins, l.stiff);
      const n = l.mesh.verts.length;
      if(!l._xy || l._xy.length < n * 2) l._xy = new Float32Array(n * 2);
      deform(l.mesh, v.pins, l._xy);
      let xy = l._xy;
      if(px > 0.01){
        // ピンで 曲げた あとから ゆらす（ピンの きき方は 変わらない）
        if(!l._bxy || l._bxy.length < n * 2) l._bxy = new Float32Array(n * 2);
        xy = boil(l._xy, l._bxy, px, handFrame(hand, curT), handSeed(l));
      }
      drawDeformed(g, img, l.mesh, via3D(l.mesh, xy));

    } else if(px > 0.01){
      // ピンは 無いけれど 線を ゆらす。ゆれ用の あみを 張って ずらす
      toImageOrigin();
      const me = boilMesh(l, img);
      const n = me.verts.length;
      if(!l._bxy || l._bxy.length < n * 2) l._bxy = new Float32Array(n * 2);
      boil(l._hbase, l._bxy, px, handFrame(hand, curT), handSeed(l));
      drawDeformed(g, img, me, via3D(me, l._bxy));

    } else if(H3){
      /* 立体。絵ぜんたいを ます目に 分けて 四すみに はめる。
         1まいの まま はると、まっすぐな はずの 線が ゆがむ。 */
      const me = flatMesh(asset.w, asset.h);
      const n = me.verts.length;
      if(!l._q3flat || l._q3flat.length !== n * 2) l._q3flat = new Float32Array(n * 2);
      for(let i = 0; i < n; i++){
        l._q3flat[i*2] = me.verts[i].u; l._q3flat[i*2+1] = me.verts[i].v;
      }
      l._q3xy = mapXY(l._q3flat, n, H3, l._q3xy);
      drawDeformed(g, img, me, l._q3xy);

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
  /* ふちを 作る 紙の こまかさ。
     小さく 作るほど はやいが、もどす ときに ぼやける。 */
  const OUT_K = 2;                  // いくつ ぶんの1で 作るか
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

  function outline(src, px, color, outW, outH){
    /* 出す 紙の 大きさ。ふつうは 画面と 同じ。
       立体に した フォルダは 中身の 大きさの 紙に 焼く ので、
       その 大きさを もらう。 */
    const ow = outW || canvas.width, oh = outH || canvas.height;
    const w = Math.max(2, Math.ceil(ow / OUT_K));
    const h = Math.max(2, Math.ceil(oh / OUT_K));

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
    /* ぼかしは とげとげ よけの ぶんだけ。
       ここを 大きくすると ふちが ぼやける（あとで しめるが、
       もとが ぼけていると もどらない）。 */
    ga.filter = 'blur(' + Math.max(0.25, Math.min(0.8, r * 0.12)) + 'px)';
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

    const c = (outW ? outCanvas(ow, oh) : scratch(91)), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, ow, oh);
    g.imageSmoothingQuality = 'high';
    g.drawImage(done, 0, 0, ow, oh);
    firmEdge(c);
    return c;
  }

  /* ふちどりを 出す ための、大きさ じゆうの 紙 */
  let outC = null;
  function outCanvas(w, h){
    if(!outC) outC = document.createElement('canvas');
    if(outC.width !== w || outC.height !== h){ outC.width = w; outC.height = h; }
    return outC;
  }

  /* ふちを くっきり させる。

     小さく 作って もどすと、ふちの ところが
     うすい → こい の なだらかな さかに なって「ぼやっ」と 見える。
     そこで
       ① 自分を かさねて かける（うすさ a → a×a）
          … うすい ところが ぐっと 消える
       ② 自分を ふつうに かさねる（a → 2a-a×a）を 2回
          … のこった こい ところが しっかり つまる
     で、なだらかな さかを 切り立った がけに する。
     ぜんぶ 絵の かさね算 だけなので はやい。 */
  function firmEdge(cv){
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.filter = 'none';

    g.globalCompositeOperation = 'destination-in';   // ① うすい ところを 落とす
    g.drawImage(cv, 0, 0);

    g.globalCompositeOperation = 'source-over';      // ② こい ところを つめる
    g.drawImage(cv, 0, 0);
    g.drawImage(cv, 0, 0);
  }

  /** 1枚ぶん描く。塗り・ふちどり があるときだけ別紙を経由する */
  function paint(g, l, pose, tf, mul){
    /* おえかき・いろ の レイヤーは 絵の ファイルを 持たない。
       線の ならびから いまの 時こく ぶんの 紙を 作ってから 描く。 */
    if(l.kind === 'paint' || l.kind === 'solid') paintCanvas(l, curT);
    /* ぐるり360は「いま どっちを 見ているか」で 毎回 切り出す */
    else if(l.kind === 'pano') panoCanvas(l, pose.v);
    /* 🏠 部屋は「いま どこから どっちを 見て いるか」で 毎回 描き直す */
    else if(l.kind === 'room') roomCanvas(l, pose.v);

    const asset = frameAsset(l, pose.v.frame);
    let   img0 = frameImage(l, pose.v.frame);
    if(!asset || !img0 || !img0.complete || !img0.naturalWidth) return;
    /* 🔮 球に はって いる ときは、まるめた 1まいに 入れかえる。
       大きさは もとの 絵の まま なので、場所も 大きさも そのまま きく。 */
    if(ballOn(l)) img0 = ballCanvas(l, pose.v, img0, asset.id || asset.name);
    /* ✂ マスクは 絵そのものを 先に ぬく。
       こうすると ゆがみ・ピン・立体の あとにも ついて まわる。 */
    const img = maskedImage(l, asset, img0);
    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity)) * (mul == null ? 1 : mul);
    if(alpha <= 0) return;

    const tinted  = v.tintAmount > 0.001;
    const strokeW = (v.strokeW || 0) * Math.abs(tf[0]);   // 画面の大きさに合わせる
    const edged   = strokeW > 0.4;
    const fx      = hasFX(v);

    if(!tinted && !edged && !fx){
      g.save();
      g.globalAlpha = alpha;
      g.globalCompositeOperation = blendOf(v);
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

    /* 色の 調整は 絵だけに かける（かげ・ひかりには かけない）。
       ここで 別紙ごと 塗りかえて しまう。 */
    const cf = colorFilter(v);
    if(cf){
      const t2 = alloc(), g2 = t2.getContext('2d');
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.filter = cf.trim();
      g2.drawImage(c, 0, 0);
      g2.filter = 'none';
      const gc = c.getContext('2d');
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.globalCompositeOperation = 'copy';
      gc.drawImage(t2, 0, 0);
      gc.globalCompositeOperation = 'source-over';
      back(1);
    }

    // ふちは 絵の「下」に敷いてから、まとめて うすくする。
    // 先に本番へ別々に置くと、うすいときに ふちの色が 中まで透けてしまう。
    if(edged) under(c, outline(c, strokeW, v.strokeColor || '#FFFEF7'));

    // かげ・ひかりは いちばん 下（ふちどりの さらに 外がわ）
    underFX(c, v, Math.abs(tf[0]));

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    g.globalCompositeOperation = blendOf(v);
    g.drawImage(c, 0, 0);
    g.restore();
    back(1);
  }

  /* ---------- ひかり（グロー）と かげ ----------

     どちらも「絵の 形を ぼかして、色を ぬって、下に 敷く」だけ。
       かげ  … ずらして、くらい 色で
       ひかり… ずらさず、あかるい 色で、大きめに ぼかす

     ふちどりと ちがって ふくらませ ないで ぼかしで ひろげる ので、
     やわらかい 見た目に なる（AEの グロー・ドロップシャドウと 同じ）。 */
  let fxA = null, fxB = null, fxC = null;
  function fxCanvas(which, w, h){
    let c = which === 2 ? fxC : which ? fxB : fxA;
    if(!c){ c = document.createElement('canvas');
            which === 2 ? (fxC = c) : which ? (fxB = c) : (fxA = c); }
    if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, w, h);
    return c;
  }

  /* かげ・ひかりの もとに する 形を「しっかり」させる。

     立体・手がき風・ゆがみ を かけた 絵は、あみの 三角の つぎ目で
     こさが ほんの少し うすく なる（1〜2ぐらい）。
     絵の ままなら 目に つかない が、その 形を そのまま 使って
     かげを 作ると、かげは ベタ色 なので うすい すじが
     はっきり 出て しまう（かげの 中に ます目が 見えた のが これ）。

     ① まず ほんの少し ぼかす。
        あみの つぎ目は 1〜2ドットの 細い すじ なので これで 消える。
        筆の ガサガサした ふちも ここで なだらかに なる。
     ② そのあと「自分の 上に」かさねて いく。
        自分を 足す ので、のこりの すけ ぶんが 毎回 2じょうに 小さく なる。
          0.5 → 0.75 → 0.94 → 0.996
        中みだけ ベタに なり、ふちは ①の おかげで なだらかな まま。

     ①を せずに かさねると、筆の ガサガサが そのまま かたく なって、
     かげの ふちが ギザギザに 見える（v169 が これ）。 */
  function fxSolid(src, k, soften){
    const c = fxCanvas(2, src.width, src.height);
    const g = c.getContext('2d');
    const soft = Math.max(1.2, (soften == null ? 6 : soften) * (k || 1));
    g.filter = 'blur(' + soft.toFixed(2) + 'px)';
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    for(let i = 0; i < 3; i++) g.drawImage(c, 0, 0);
    return c;
  }

  /** 形を ぼかして 色で ぬった 1まいを 作る */
  function fxShape(which, src, blurPx, dx, dy, color){
    const w = src.width, h = src.height;
    const c = fxCanvas(which, w, h);
    const g = c.getContext('2d');
    if(blurPx > 0.1) g.filter = 'blur(' + blurPx + 'px)';
    g.drawImage(src, dx, dy);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /**
   * かげ と ひかり を 絵の 下に 敷く。
   *   c … 絵を 描いた 紙（ここに 直に 足す）
   *   v … その時こくの 姿   k … 画面の 大きさ（ものさし合わせ）
   */
  function underFX(c, v, k){
    const g = c.getContext('2d');
    const put = (sheet, alpha) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = Math.max(0, Math.min(1, alpha));
      g.globalCompositeOperation = 'destination-over';
      g.drawImage(sheet, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    };
    if(!(v.glowAmount > 0.004) && !(v.shadowAmount > 0.004)) return;

    /* あみの つぎ目を うめた 形から 作る */
    /* かげの もとの 形を どれだけ なめらかに するか。
       筆の ガサガサが 強い 絵ほど 大きく する。 */
    const soften = v.shadowSoft == null ? 6 : v.shadowSoft;
    const base = fxSolid(c, k, soften);

    /* ひかりを 先に 敷いて、その 下に かげ。
       ＝ 出る 順は かげ → ひかり → 絵。 */
    if(v.glowAmount > 0.004){
      put(fxShape(0, base, (v.glowSize || 24) * k, 0, 0, v.glowColor || '#FFF2A8'),
          v.glowAmount);
    }
    if(v.shadowAmount > 0.004){
      put(fxShape(1, base, (v.shadowBlur || 0) * k,
                  (v.shadowX || 0) * k, (v.shadowY || 0) * k,
                  v.shadowColor || '#1E1C14'),
          v.shadowAmount);
    }
  }

  /** 色の 調整。canvas の filter で かける */
  function colorFilter(v){
    let f = '';
    if(v.bright   != null && Math.abs(v.bright   - 1) > 0.004) f += ' brightness(' + v.bright.toFixed(3) + ')';
    if(v.contrast != null && Math.abs(v.contrast - 1) > 0.004) f += ' contrast('   + v.contrast.toFixed(3) + ')';
    if(v.sat      != null && Math.abs(v.sat      - 1) > 0.004) f += ' saturate('   + v.sat.toFixed(3) + ')';
    if(v.hue) f += ' hue-rotate(' + Math.round(v.hue) + 'deg)';
    return f;
  }
  /** その レイヤーに 色の 調整・かげ・ひかり が 入って いるか */
  function hasFX(v){
    return !!colorFilter(v) || v.glowAmount > 0.004 || v.shadowAmount > 0.004;
  }

  /* その レイヤーの コマ ぜんぶの 絵。
     骨（ピン）の あみは これ ぜんぶを かさねた 形に 張る
     ―― でないと、口を あけた コマが あみの 外に なって 出ない。 */
  function allFrameImages(l){
    const out = [];
    const n = (l.frames && l.frames.length) || 0;
    for(let i = 0; i < n; i++){
      const im = frameImage(l, i);
      if(im && im.complete !== false) out.push(im);
    }
    return out.length ? out : null;
  }

  /* ---------- ✂ マスク ----------

     その レイヤー じしんに 形を かいて 切りぬく。
     （クリップは べつの レイヤーの 形で ぬく。マスクは 自分の 形）

     形は 絵の 中の ざひょうで もつ ので、レイヤーを 動かしても
     まわしても 大きく しても、マスクは 絵に くっついて いく。
     しかも 絵そのものを 先に ぬいて しまう ので、
     ゆがみ・ピン・立体の あとにも ちゃんと ついて まわる。 */
  let mkA = null, mkB = null;
  function maskCanvas(which, w, h){
    let c = which ? mkB : mkA;
    if(!c){ c = document.createElement('canvas'); which ? (mkB = c) : (mkA = c); }
    if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, w, h);
    return c;
  }

  const maskOn = (l) => !!(l && l.mask && l.mask.on !== false
                           && l.mask.pts && l.mask.pts.length >= 3);

  /** かこった 形を ぬった 1まい（ぼかしも ここで） */
  function maskShape(which, w, h, pts, feather){
    const c = maskCanvas(which, w, h);
    const g = c.getContext('2d');
    if(feather > 0.2) g.filter = 'blur(' + feather + 'px)';
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillStyle = '#000';
    g.fill();
    g.filter = 'none';
    return c;
  }

  /** 絵を マスクで ぬいた 1まいを かえす（マスクが なければ そのまま） */
  function maskedImage(l, asset, img){
    if(!maskOn(l)) return img;
    const w = Math.max(1, Math.round(asset.w)), h = Math.max(1, Math.round(asset.h));
    const m = l.mask;
    const key = w + 'x' + h + ':' + (m.invert ? 1 : 0) + ':' + (m.feather || 0)
              + ':' + m.pts.length + ':' + Math.round(m.pts[0].x) + ',' + Math.round(m.pts[0].y)
              + ':' + (l._maskSrc === img ? 1 : 0);
    if(l._maskC && l._maskKey === key && l._maskSrc === img) return l._maskC;

    const sh = maskShape(1, w, h, m.pts, (m.feather || 0));
    const c = maskCanvas(0, w, h);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = m.invert ? 'destination-out' : 'destination-in';
    g.drawImage(sh, 0, 0);
    g.globalCompositeOperation = 'source-over';

    /* つかい回しの 紙を そのまま かえすと、つぎの レイヤーで
       うわ書きされて しまう。1まいだけ 自分の 紙に うつして おく。 */
    if(!l._maskC){ l._maskC = document.createElement('canvas'); }
    if(l._maskC.width !== w || l._maskC.height !== h){ l._maskC.width = w; l._maskC.height = h; }
    const gk = l._maskC.getContext('2d');
    gk.setTransform(1, 0, 0, 1, 0, 0);
    gk.globalCompositeOperation = 'copy';
    gk.drawImage(c, 0, 0);
    gk.globalCompositeOperation = 'source-over';
    l._maskKey = key;
    l._maskSrc = img;
    return l._maskC;
  }

  /* ---------- 魚眼の 紙と 貼り直し ---------- */
  let lensCanvas = null;
  function lensSheet(){
    if(!lensCanvas) lensCanvas = document.createElement('canvas');
    if(lensCanvas.width !== canvas.width || lensCanvas.height !== canvas.height){
      lensCanvas.width = canvas.width; lensCanvas.height = canvas.height;
    }
    const g = lensCanvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, lensCanvas.width, lensCanvas.height);
    return g;
  }

  /* できあがった 1まいを、まん中が ふくらむ ように 貼り直す。
     画面に ます目を かぶせて、その 点だけ 計算して 三角ずつ 貼る
     （ぐるり360と 同じ 道具。1ドットずつ だと 重すぎる）。 */
  const _lensMesh = {};
  function lensMesh(w, h){
    const cols = 28, rows = Math.max(8, Math.round(28 * h / w));
    const key = cols + 'x' + rows + ':' + w + 'x' + h;
    if(_lensMesh.key === key) return _lensMesh.m;
    const verts = [], tris = [];
    for(let r = 0; r <= rows; r++) for(let c = 0; c <= cols; c++){
      verts.push({ u: c / cols * w, v: r / rows * h });
    }
    const id = (c, r) => r * (cols + 1) + c;
    for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
      tris.push(id(c, r), id(c+1, r), id(c, r+1));
      tris.push(id(c+1, r), id(c+1, r+1), id(c, r+1));
    }
    const m = { verts, tris };
    _lensMesh.key = key; _lensMesh.m = m;
    return m;
  }

  function drawLens(g, sheet, project, tf, k){
    const W = project.w, H = project.h;
    const me = lensMesh(W, H);
    const n = me.verts.length;
    const cx = W / 2, cy = H / 2;
    const half = Math.hypot(cx, cy);              // すみまでの きょり ＝ 1
    const uv = new Float32Array(n * 2);
    const xy = new Float32Array(n * 2);
    for(let i = 0; i < n; i++){
      const x = me.verts[i].u, y = me.verts[i].v;
      // 貼る さき（画面）
      xy[i*2]   = x * tf[0] + tf[4];
      xy[i*2+1] = y * tf[3] + tf[5];
      // どこを 見るか（もとの 絵）
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy) / half;
      const s = r > 1e-6 ? fishMap(r, k) / r : 1;
      uv[i*2]   = (cx + dx * s) * tf[0] + tf[4];
      uv[i*2+1] = (cy + dy * s) * tf[3] + tf[5];
    }
    /* レンズの 紙は 下じきごと 焼いて ある＝すけて いない ので、
       ほんの少し ふくらませて まるめの すきまを 消して よい。 */
    /* フォルダの 紙は「きっちり となり合う あみ」＝ 足し算で つなげる。
       中みが すけて いても（かげ・ひかり・うすい ふち）つぎ目が 出ない。
       あみは 毎コマ 同じ 形なので、ちらつきの 心配も ない。 */
    drawDeformed(g, sheet, me, xy, 1, uv, 'add');
  }

  /* ---------- かさね方（乗算 など）----------
     フォトショップの レイヤーの かさね方と 同じ。
     canvas が そのまま 持って いる ので、名前を 合わせるだけ。 */
  const BLEND = {
    normal: 'source-over',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    add: 'lighter',
    softlight: 'soft-light',
    hardlight: 'hard-light',
    colordodge: 'color-dodge',
    colorburn: 'color-burn',
    difference: 'difference'
  };
  const blendOf = (v) => BLEND[(v && v.blend) || 'normal'] || 'source-over';

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
  /* 立体に した フォルダ 1つぶん。

     ふつうの フォルダは、中身を「画面と 同じ 大きさの 紙」に まとめて
     から 出す。でも 立体に する ときは、中身に カメラを かけずに
     まとめる ので、中で 大きく した 絵は 画面の そとへ はみ出す。
     画面の 大きさの 紙に まとめると、その はみ出た ぶんが
     まとめる 時点で 切れて しまい、あとで カメラを 引いても
     もう 出て こない。

     そこで、中身が おさまる 大きさの 紙を 用意して そこに まとめる。
     どんなに 大きく しても 切れない。
     （あまり 大きいと 重い ので、4096ドットで 頭うちに して
       そのぶん あらく 焼く。貼る ときに ひきのばすので 見た目は 同じ） */
  let sheetC = null;
  function sheetCanvas(w, h){
    if(!sheetC) sheetC = document.createElement('canvas');
    if(sheetC.width !== w || sheetC.height !== h){ sheetC.width = w; sheetC.height = h; }
    const g = sheetC.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.clearRect(0, 0, w, h);
    return sheetC;
  }

  function paintFolder3D(g, project, f, pose, poses, tf, mul){
    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity)) * (mul == null ? 1 : mul);
    if(alpha <= 0) return;
    const kids = membersOf(project, f);
    if(!kids.length) return;

    const r = pose.sheetRect || { x0: 0, y0: 0, x1: project.w, y1: project.h };
    const rw = Math.max(1, r.x1 - r.x0), rh = Math.max(1, r.y1 - r.y0);
    const k0 = Math.abs(tf[0]);
    const CAP = 4096;
    const k = Math.min(k0, CAP / Math.max(rw, rh));      // 焼く こまかさ
    const bw = Math.max(1, Math.round(rw * k));
    const bh = Math.max(1, Math.round(rh * k));

    const c = sheetCanvas(bw, bh);
    const gx = c.getContext('2d');
    const tf2 = [k, 0, 0, k, -r.x0 * k, -r.y0 * k];
    gx.setTransform(...tf2);
    drawNodes(gx, project, kids, poses, tf2);

    if(v.tintAmount > 0.001){
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.globalCompositeOperation = 'source-atop';
      gx.globalAlpha = Math.min(1, v.tintAmount);
      gx.fillStyle = v.tintColor || '#F2A0B8';
      gx.fillRect(0, 0, bw, bh);
      gx.globalCompositeOperation = 'source-over';
      gx.globalAlpha = 1;
    }

    /* 色の 調整（中身ぜんぶに まとめて） */
    const cf = colorFilter(v);
    if(cf){
      const t2 = document.createElement('canvas');
      t2.width = bw; t2.height = bh;
      const g2 = t2.getContext('2d');
      g2.filter = cf.trim();
      g2.drawImage(c, 0, 0);
      g2.filter = 'none';
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.globalCompositeOperation = 'copy';
      gx.drawImage(t2, 0, 0);
      gx.globalCompositeOperation = 'source-over';
    }

    // ふちどりは 絵の「下」に 敷く（うすい ときに 中まで 透けない ため）
    const strokeW = (v.strokeW || 0) * k;
    if(strokeW > 0.4){
      const ol = outline(c, strokeW, v.strokeColor || '#FFFEF7', bw, bh);
      const gu = c.getContext('2d');
      gu.setTransform(1, 0, 0, 1, 0, 0);
      gu.globalAlpha = 1;
      gu.globalCompositeOperation = 'destination-over';
      gu.drawImage(ol, 0, 0);
      gu.globalCompositeOperation = 'source-over';
    }

    /* かげ・ひかりは「立体に 貼った あと」に かける。

       さきに かけて しまうと、すけた かげが あみの 目を 通る ことに なる。
       三角の つぎ目では ふちの ドットが 半分ずつに なる ので、
       すけた ところだけ こさが ちがって 三角の 線が 見えて しまう
       （かげの 中に ます目が 出て いたのが これ）。

       貼って から かければ、あみを 通るのは 絵だけ。
       絵は すけて いない ので つぎ目は 出ない。 */
    const out = alloc(), go = out.getContext('2d');
    go.setTransform(1, 0, 0, 1, 0, 0);
    sheet3D(go, c, project, pose.quad, tf, r, bw, bh);
    underFX(out, v, k0);

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    g.globalCompositeOperation = blendOf(v);
    if(v.blur > 0.01) g.filter = 'blur(' + (v.blur * k0) + 'px)';
    g.drawImage(out, 0, 0);
    g.filter = 'none';
    g.restore();
    back(1);
  }

  /* まとめた 紙（画面ぜんたい）の うち、中身の ある しかくを
     切り出して 玉に まき、また 同じ ところに 戻す。 */
  function ballFolder(c, f, project, poses, tf, v, pad){
    const q = folderQuad(project, f, poses);
    if(!q) return;
    const k = Math.abs(tf[0]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const p of q){
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    /* 画面の ドットに 直す */
    /* ふちどりは しかくの 外に ひろがる ので、その ぶんも 切り出す。
       切らないと ふちが 玉に のらずに 消える。 */
    const ex = Math.max(0, pad || 0);
    const sx = Math.floor(x0 * tf[0] + tf[4] - ex);
    const sy = Math.floor(y0 * tf[3] + tf[5] - ex);
    const w  = Math.max(2, Math.round((x1 - x0) * k + ex * 2));
    const h  = Math.max(2, Math.round((y1 - y0) * k + ex * 2));
    if(w < 2 || h < 2 || w > 4096 || h > 4096) return;

    const cut = document.createElement('canvas');
    cut.width = w; cut.height = h;
    cut.getContext('2d').drawImage(c, sx, sy, w, h, 0, 0, w, h);
    /* ballCanvas は 絵として あつかう ので、絵の ふりを させる */
    cut.complete = true; cut.naturalWidth = w; cut.naturalHeight = h;

    /* 中身は 毎コマ かわる ので、しまって おいた ものは つかわない */
    const out = ballCanvas(f, v, cut, f.id + ':' + curT.toFixed(3));

    const gc = c.getContext('2d');
    gc.save();
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.clearRect(sx, sy, w, h);
    gc.drawImage(out, sx, sy);
    gc.restore();
  }

  function paintFolder(g, project, f, pose, poses, tf, mul){
    /* 立体に なって いる フォルダは、紙の 作り方から ちがう。
       ただし 🔮 球に して いる ときは、板では なく 玉に する
       （玉じたいが 立体なので、板に 貼る 必要が ない）。 */
    if(pose.quad && !ballOn(f)) return paintFolder3D(g, project, f, pose, poses, tf, mul);

    const v = pose.v;
    const alpha = Math.max(0, Math.min(1, v.opacity)) * (mul == null ? 1 : mul);
    if(alpha <= 0) return;

    const kids = membersOf(project, f);
    if(!kids.length) return;

    /* ---- そのまま 通す（フォトショップの「通過」）----
       フォルダ じたいに 何も かかって いない ときは、
       中身を 別紙に まとめずに そのまま 出す。
       こう すると 中の「乗算」が、フォルダの 下に ある 絵にも とどく。
       まとめて しまうと、まざる 相手が 空っぽの 別紙に なって しまう。
       別紙を 1まい 使わない ぶん、はやくも なる。 */
    if(alpha > 0.999
       && !ballOn(f)                 /* 玉は 1まいに まとめて から まく */
       && !(v.tintAmount > 0.001)
       && !((v.strokeW || 0) * Math.abs(tf[0]) > 0.4)
       && !(v.blur > 0.01)
       && !hasFX(v)
       && !colorFilter(v)
       && !maskOn(f)
       && !(f.blend && f.blend !== 'normal')
       && !(handOn(f) && f.hand)
       && !(f.cage && !cageFlat(f.cage))
       && !(v.pins && v.pins.length && f.mesh)){
      g.save();
      g.setTransform(...tf);
      drawNodes(g, project, kids, poses, tf);
      g.restore();
      return;
    }

    const c = alloc(), gx = c.getContext('2d');
    gx.setTransform(...tf);

    /* フォルダの 手がき風。
       中身を まとめた 1まいに かけるので、
       中の レイヤーどうしの ずれ方は そろう（＝1枚の絵として ゆれる）。 */
    const fhand = handOn(f) ? f.hand : null;
    if(fhand && !(v.pins && v.pins.length)){
      const sz = handMeshSize(fhand);
      if(!f._hmesh || f._hkey !== sz.cols){
        // フォルダの あみは キャンバスの ドットで 張る（ピンのときと 同じ）
        f._hmesh = buildMeshRect(project.w, project.h, sz.cols, sz.rows);
        f._hkey = sz.cols;
        const n0 = f._hmesh.verts.length;
        const b = new Float32Array(n0 * 2);
        for(let i = 0; i < n0; i++){ b[i*2] = f._hmesh.verts[i].u; b[i*2+1] = f._hmesh.verts[i].v; }
        f._hbase = b;
      }
      const px = boilPx(fhand, Math.min(project.w, project.h));
      const tf0 = [tf[0], 0, 0, tf[3], 0, 0];
      const tmpC = alloc(), tg = tmpC.getContext('2d');
      tg.setTransform(...tf0);
      drawNodes(tg, project, kids, poses, tf0);

      const n = f._hmesh.verts.length;
      if(!f._bxy || f._bxy.length < n * 2) f._bxy = new Float32Array(n * 2);
      const fr = handFrame(fhand, curT), sd = handSeed(f);
      boil(f._hbase, f._bxy, px, fr, sd);

      // 紙の ずれ は まとめた 1まいごと 動かす
      const sh = handShift(fhand, fr, sd, Math.min(project.w, project.h));
      gx.save();
      gx.setTransform(...tf);
      gx.translate(project.w / 2 + sh.dx, project.h / 2 + sh.dy);
      gx.rotate(sh.rot);
      gx.translate(-project.w / 2, -project.h / 2);
      drawDeformed(gx, tmpC, f._hmesh, f._bxy, Math.abs(tf[0]));
      gx.restore();
      back(1);

    } else if(f.cage && !cageFlat((v.cagePts && S.warpDrag !== f.id)
        ? { w:f.cage.w, h:f.cage.h, cols:f.cage.cols, rows:f.cage.rows, pts:v.cagePts }
        : f.cage)){
      /* フォルダ ぜんたいを ゆがめる。
         中身を いったん まとめて 描いてから、その1まいを かごで ゆがめる。
         かごの ものさしは キャンバスの ドット。 */
      const cage = (v.cagePts && S.warpDrag !== f.id)
        ? { w:f.cage.w, h:f.cage.h, cols:f.cage.cols, rows:f.cage.rows, pts:v.cagePts }
        : f.cage;
      /* 中身は まわりに ゆとりの ある 別紙に まとめる。
         画面の 外に ある ぶんも 切らずに とっておく ので、
         ゆがめて 中へ 持ってきても 切れない。 */
      const k0 = Math.abs(tf[0]);
      const mx = MARGIN, my = MARGIN;
      const tf0 = [tf[0], 0, 0, tf[3], mx, my];
      const tmpC = bigSheet(), tg = tmpC.getContext('2d');
      tg.setTransform(...tf0);
      drawNodes(tg, project, kids, poses, tf0);

      if(!f._cmesh || f._ckey !== cage.cols + 'x' + cage.rows){
        f._cmesh = cageMesh(cage);
        f._ckey = cage.cols + 'x' + cage.rows;
        f._cxy = null;
        f._cuv = null;
      }
      f._cxy = cageXY(cage, f._cxy);

      /* 別紙の どこを はるか。まとめる ときに ずらした ぶんを たす。 */
      const n0 = f._cmesh.verts.length;
      if(!f._cuv || f._cuv.length < n0 * 2) f._cuv = new Float32Array(n0 * 2);
      for(let i = 0; i < n0; i++){
        f._cuv[i * 2]     = f._cmesh.verts[i].u * k0 + mx;
        f._cuv[i * 2 + 1] = f._cmesh.verts[i].v * k0 + my;
      }
      drawDeformed(gx, tmpC, f._cmesh, f._cxy, 1, f._cuv);

    } else if(v.pins && v.pins.length && f.mesh){
      /* フォルダ ぜんたいを ピンで 曲げる。
         中身を いったん まとめて 描いてから、その1まいを あみで ゆがめる。
         あみの ものさしは キャンバスの ドット（もようや ズームに よらない）。 */
      /* まとめた絵は「ずらしなし」で 描く。
         そうすると 絵の中の ドットが キャンバスの ドット×ズーム に
         そろうので、あみとの ものさし合わせが かけ算だけで すむ。 */
      /* こちらも まわりに ゆとりの ある 別紙に まとめる
         （画面の 外の ぶんが 切れない ように） */
      const k0 = Math.abs(tf[0]);
      const mx = MARGIN, my = MARGIN;
      const tf0 = [tf[0], 0, 0, tf[3], mx, my];
      const tmpC = bigSheet(), tg = tmpC.getContext('2d');
      tg.setTransform(...tf0);
      drawNodes(tg, project, kids, poses, tf0);

      if(needsPrecompute(f.mesh, v.pins, f.stiff)) precompute(f.mesh, v.pins, f.stiff);
      const n = f.mesh.verts.length;
      if(!f._xy || f._xy.length < n * 2) f._xy = new Float32Array(n * 2);
      deform(f.mesh, v.pins, f._xy);

      if(!f._puv || f._puv.length < n * 2) f._puv = new Float32Array(n * 2);
      for(let i = 0; i < n; i++){
        f._puv[i * 2]     = f.mesh.verts[i].u * k0 + mx;
        f._puv[i * 2 + 1] = f.mesh.verts[i].v * k0 + my;
      }
      drawDeformed(gx, tmpC, f.mesh, f._xy, 1, f._puv);
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

    /* フォルダの ✂ マスクは 画面の ざひょう（アフターエフェクトの
       プリコンポに かける マスクと 同じ）。中身は もう まとめて
       ある ので、その紙を ぬくだけ。 */
    if(maskOn(f)){
      const gm = c.getContext('2d');
      const sh = maskCanvas(1, c.width, c.height);
      const gs = sh.getContext('2d');
      gs.setTransform(...tf);
      if((f.mask.feather || 0) > 0.2) gs.filter = 'blur(' + (f.mask.feather * k) + 'px)';
      gs.beginPath();
      gs.moveTo(f.mask.pts[0].x, f.mask.pts[0].y);
      for(let i = 1; i < f.mask.pts.length; i++) gs.lineTo(f.mask.pts[i].x, f.mask.pts[i].y);
      gs.closePath();
      gs.fillStyle = '#000';
      gs.fill();
      gs.filter = 'none';
      gm.setTransform(1, 0, 0, 1, 0, 0);
      gm.globalCompositeOperation = f.mask.invert ? 'destination-out' : 'destination-in';
      gm.drawImage(sh, 0, 0);
      gm.globalCompositeOperation = 'source-over';
    }

    /* 色の 調整は 中身ぜんぶに まとめて かかる */
    const cf = colorFilter(v);
    if(cf){
      const t2 = alloc(), g2 = t2.getContext('2d');
      g2.setTransform(1, 0, 0, 1, 0, 0);
      g2.filter = cf.trim();
      g2.drawImage(c, 0, 0);
      g2.filter = 'none';
      const gc = c.getContext('2d');
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.globalCompositeOperation = 'copy';
      gc.drawImage(t2, 0, 0);
      gc.globalCompositeOperation = 'source-over';
      back(1);
    }

    if(strokeW > 0.4) under(c, outline(c, strokeW, v.strokeColor || '#FFFEF7'));

    /* 🔮 フォルダを 球に はる。
       中身は もう 1まいに まとまって いる ので、
       中身の ある ところ だけ 切り出して 玉に まき、
       おなじ ところへ 戻す。
       かげ・ひかり（underFX）は 玉に した あとに かける。
       先に かけると、まわりに ひろがった かげまで 玉に まきこんで
       しまい、玉の 外に 出るべき かげが 消える。 */
    if(ballOn(f)) ballFolder(c, f, project, poses, tf, pose.v, strokeW);

    underFX(c, v, k);

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha;
    g.globalCompositeOperation = blendOf(v);
    if(v.blur > 0.01) g.filter = 'blur(' + (v.blur * k) + 'px)';
    g.drawImage(c, 0, 0);
    g.filter = 'none';
    g.restore();
    back(1);
  }

  /* まとめた 紙を、立体の 四すみに はめて 出す。
     まとめた 紙は「キャンバスぜんたい」が うつって いる ので、
     キャンバスの しかく → 四すみ の ホモグラフィで はり直せば いい。
     g は へんかん なし（画面の 生の ドット）で わたす。 */
  function sheet3D(g, sheet, project, quad, tf, rect, bw, bh){
    /* 板に する ところ（キャンバスの ものさし）と、
       それを 焼いた 紙の 大きさ（ドット）。 */
    const r = rect || { x0: 0, y0: 0, x1: project.w, y1: project.h };
    const W = r.x1 - r.x0, H = r.y1 - r.y0;
    const me = flatMesh(W, H);
    const n = me.verts.length;
    const H3 = homography(
      [{x:0,y:0}, {x:W,y:0}, {x:W,y:H}, {x:0,y:H}], quad);

    const uv = new Float32Array(n * 2);   // 紙の どこを はるか（紙の ドット）
    const xy = new Float32Array(n * 2);   // どこへ はるか（画面の 生の ドット）
    for(let i = 0; i < n; i++){
      const u = me.verts[i].u, vv = me.verts[i].v;
      uv[i*2]   = u  / W * bw;
      uv[i*2+1] = vv / H * bh;
      const q = applyH(H3, u, vv);
      xy[i*2]   = q.x * tf[0] + tf[4];
      xy[i*2+1] = q.y * tf[3] + tf[5];
    }
    drawDeformed(g, sheet, me, xy, 1, uv);
  }

  /* この レイヤーは シャッターの あいだに 動いて いるか。
     動いて いない ものまで ならすと、ただ 何回も 描き直すだけで
     絵は 1ドットも 変わらない（＝ むだに 重く なる）。 */
  function moves(l, subPoses){
    const a = subPoses[0][l.id], b = subPoses[subPoses.length - 1][l.id];
    if(!a || !b) return false;
    const m1 = a.m, m2 = b.m;
    if(Math.hypot(m2.tx - m1.tx, m2.ty - m1.ty) > 0.3) return true;
    if(Math.abs(m2.a - m1.a) + Math.abs(m2.b - m1.b)
     + Math.abs(m2.c - m1.c) + Math.abs(m2.d - m1.d) > 0.002) return true;
    // 四すみ（立体）や コマの 切りかわりも「動いた」うち
    if(!!a.quad !== !!b.quad) return true;
    if(a.quad && b.quad){
      for(let i = 0; i < 4; i++){
        if(Math.hypot(b.quad[i].x - a.quad[i].x, b.quad[i].y - a.quad[i].y) > 0.3) return true;
      }
    }
    return a.v.frame !== b.v.frame;
  }

  /** 1まい ぶん（ふつうのレイヤーでも フォルダでも） */
  function paintNode(g, project, l, poses, tf, subPoses){
    const pose = poses[l.id];
    if(!pose) return;

    /* ---------- うごきブラー ----------

       まえは「すこし前の 姿を うすく 何枚か 重ねる」だった。
       それだと 1枚 1枚が 見えて しまって、ぶれでは なく
       「ずれた 分身」に 見える。

       ほんとうの カメラは、シャッターが 開いて いる あいだの
       すがたを ぜんぶ 足して 1枚に する。
       ここでも そうする ―― シャッターの あいだの 姿を
       N回 とって、ぜんぶ 同じ 重さで ならす。

       ならし方
         i 枚めを 1/(i+1) の こさで 上に 重ねると、
         そのつど「ここまでの 平均」に なる（走る平均）。
         最後まで 行くと、ぜんぶを 同じ 重さで ならした 1枚。
         こさも かたちも 平均されるので、すじが 出ない。

       いまの 姿（止まった 絵）は 足さない。
       足すと そこだけ くっきり のこって、また 分身に 見える。 */
    const mb = l.noMB ? 0 : Math.max(l.mblur || 0, l._camMB || 0);
    if(mb > 0.01 && subPoses && subPoses.length > 1 && moves(l, subPoses)){
      const c = alloc(), gx = c.getContext('2d');
      let n = 0;
      for(const ps of subPoses){
        const p2 = ps[l.id];
        if(!p2 || p2.vis === false) continue;
        n++;
        gx.save();
        gx.setTransform(...tf);
        if(isFolder(l)) paintFolder(gx, project, l, p2, ps, tf, 1 / n);
        else paint(gx, l, p2, tf, 1 / n);
        gx.restore();
      }
      if(n){
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(c, 0, 0);
        g.restore();
      }
      back(1);
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
    curT = time;
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
    /* 紙の 方眼（うすい 点）。編集中の 目やす だけ で、
       書き出す 動画には 入らない。
       絵を じっくり 見たい ときは 切れる ように して ある。 */
    if(!opts.forExport && S.paperDots !== false){
      const p = dots();
      if(p){
        /* 方眼は「画面の ドット」で 出す。
           絵と いっしょに 大きく したり 小さく したり すると、
           点の ならびと 画面の ドットが けんかして
           ななめの ます目（モアレ）に 見える ―― それを
           あみの つぎ目と 見まちがえる。
           画面の ものさしで 出せば、どこまで 寄っても 点は 点の まま。 */
        const x0 = tf[4], y0 = tf[5];
        const x1 = project.w * tf[0] + tf[4], y1 = project.h * tf[3] + tf[5];
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = p;
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1),
                     Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.restore();
      }
    }

    const poses = computeAll(project, time);

    /* うごきブラー（ざんぞう）。
       シャッターが 開いている あいだの 姿を 何回か 重ねる。
       ＝ うごいている ものだけ 自然に ぶれる。
       置く・回す・大きさ・パペットの 曲げ、ぜんぶに 効く。 */
    /* カメラに ざんぞうを 入れて あれば、絵ぜんぶが ぶれる。
       カメラが 動けば 画面ぜんたいが 動く ので、
       レイヤーを 1つずつ 入れて まわらなくて すむ。 */
    const camMB = (() => {
      const c = camOf(project, time);
      return c ? (c.mblur || 0) : 0;
    })();
    if(camMB > 0.01){
      project.layers.forEach(l => { if(l.kind !== 'cam') l._camMB = camMB; });
    } else {
      project.layers.forEach(l => { if(l._camMB) delete l._camMB; });
    }
    /* 「ざんぞうを かけない」を 入れた レイヤーは、
       カメラの ざんぞうも うけない（AEの レイヤーの スイッチと 同じ）。
       文字など、読めなく なると こまる ものに つかう。 */
    const blurLayers = project.layers.filter(
      l => !l.noMB && Math.max(l.mblur || 0, l._camMB || 0) > 0.01);
    let subPoses = null;
    if(blurLayers.length && !opts.noMotionBlur){
      /* シャッターが 開いている 長さ。
         ほんとうの カメラは 1コマの 半分ぐらい（180°）。
         ここは 絵の 見え方 なので、つよさで 長さを かえられる ように した。 */
      const mb = Math.max(...blurLayers.map(l => Math.max(l.mblur || 0, l._camMB || 0)));
      const shutter = (1 / (project.fps || 30)) * (0.5 + 2.5 * mb);

      /* シャッターは いまの コマを まん中に して 開く。
         うしろ だけ から 取ると、絵が いつも 半コマ おくれて
         「引きずって いる」ように 見える。 */
      const t0 = Math.max(0, time - shutter / 2);
      const t1 = time + shutter / 2;

      /* 何回 取るか。
         ここが 少ないと「ずれた 分身」に 見える ―― すじの 正体は
         コマ数不足。だから 画面で 何ドット 動いたかで きめる。
         1.2ドットに 1枚 あれば 目には つながって 見える。 */
      const A = computeAll(project, t0), B = computeAll(project, t1);
      const k = Math.abs(tf[0]);
      let move = 0;
      for(const l of blurLayers){
        const a = A[l.id], b = B[l.id];
        if(!a || !b) continue;
        // 場所の ずれ
        let d = Math.hypot(b.m.tx - a.m.tx, b.m.ty - a.m.ty);
        // まわった・大きさが 変わった ぶんは、絵の はしの 動きで みる
        const asset = frameAsset(l, a.v.frame);
        if(asset){
          const ca = cornersOf(l, a.m, asset), cb = cornersOf(l, b.m, asset);
          if(ca && cb) for(let i = 0; i < 4; i++){
            d = Math.max(d, Math.hypot(cb[i].x - ca[i].x, cb[i].y - ca[i].y));
          }
        }
        move = Math.max(move, d * k);
      }

      /* ほとんど 動いて いない ものは ぶらさない。
         止まって いる 絵まで うすく なると、ただ ぼけただけに 見える。 */
      if(move > 0.8){
        const cap = opts.forExport ? 48 : 24;
        const n = Math.max(4, Math.min(cap, Math.ceil(move / 1.2)));
        subPoses = [];
        for(let i = 0; i < n; i++){
          // ます目の まん中で 取る（はしで 取ると 片がわに かたよる）
          const u = (i + 0.5) / n;
          subPoses.push(computeAll(project, t0 + (t1 - t0) * u));
        }
      }
    }

    /* 枠の そとを 見せるか。

       書き出す 動画は もちろん 枠の 中だけ。
       でも 作って いる あいだは、枠の そとに 何が いるかが
       見えないと こまる ――
       「画面の そとから 走って くる」「そとへ 出て いく」を
       作る とき、そとに いる あいだ 何も 見えないと
       どこに いるのか わからない。

       そこで 編集中は 枠の そとも 描いて、そのうえに
       うすい 紙を かぶせて 枠を わかる ように する
       （アフターエフェクトの コンポの そとと 同じ 見え方）。 */
    const showOut = !opts.forExport && S.outside !== false;

    /* ---- 魚眼（レンズ）----
       レンズは できあがった 絵ぜんたいに かかる ので、
       いったん べつの 紙に ぜんぶ 描いてから、
       まん中が ふくらむ ように 貼り直す。 */
    const camF = camOf(project, time);
    const fishV = camF ? (valuesAt(camF, time).fish || 0) : 0;
    const kFish = fishK(fishV);
    const target = Math.abs(kFish) > 0.004 ? lensSheet() : ctx;

    ctx.save();
    if(target !== ctx){
      const gl = target;
      gl.save();
      gl.setTransform(...tf);
      /* レンズを かける 紙にも 下じきを ぬる。
         ここが すけた ままだと、貼り直す ときに
         すけた ところが 三角の へりで 2回 のって すじに なる。
         （ほんものの レンズも はいけいごと ゆがむ ので、こちらが 正しい） */
      if(!opts.noBg){
        gl.fillStyle = project.bg;
        gl.fillRect(0, 0, project.w, project.h);
      }
      if(!opts.forExport && S.paperDots !== false){
        const pt = dots();
        if(pt){
          gl.save();
          gl.setTransform(1, 0, 0, 1, 0, 0);
          gl.fillStyle = pt;
          gl.fillRect(0, 0, canvas.width, canvas.height);
          gl.restore();
        }
      }
    }
    if(!showOut){
      target.beginPath();
      target.rect(0, 0, project.w, project.h);
      target.clip();
    }

    lent = 0;
    drawNodes(target, project, topNodes(project), poses, tf, subPoses);
    if(target !== ctx){
      target.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawLens(ctx, lensCanvas, project, tf, kFish);
      ctx.setTransform(...tf);
    }
    ctx.restore();

    if(showOut){
      /* 見えて いる ところ ぜんぶ（キャンバスざひょう）を 出して、
         枠の そとを うすく ぬる。ぬるのは 4まいの 帯。 */
      const x0 = (0 - view.x) / view.z, y0 = (0 - view.y) / view.z;
      const x1 = (W - view.x) / view.z, y1 = (H - view.y) / view.z;
      ctx.save();
      ctx.fillStyle = 'rgba(255,254,247,.72)';
      const band = (a, b, c, d) => {
        if(c > a && d > b) ctx.fillRect(a, b, c - a, d - b);
      };
      band(x0, y0, x1, 0);                       // 上
      band(x0, project.h, x1, y1);               // 下
      band(x0, 0, 0, project.h);                 // 左
      band(project.w, 0, x1, project.h);         // 右
      ctx.restore();
    }

    if(!opts.forExport){
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 / view.z;
      ctx.strokeRect(0, 0, project.w, project.h);
    }

    return poses;
  }

  /** 選んでいるレイヤーの枠とハンドル */
  /** フォルダは絵を持たないので、中身ぜんぶを囲む四角を枠にする */
  /* フォルダの わく（えらんだ ときに 出る 四角）。
     中身ぜんぶを かこむ 大きさに する。

     フォルダの 中に フォルダが ある ときは、その 中まで 見る。
     見ないと 中の 絵が わくに 入らず、
     中が フォルダだけの ときは わくが まったく 出なく なる
     （つまみが 出ない ので かたむけも 大きさも かえられない）。 */
  function folderQuad(project, folder, poses){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const eat = (f, depth) => {
      if(depth > 16) return;                       // ぐるぐる よけ
      for(const k of membersOf(project, f)){
        if(isFolder(k)){ eat(k, depth + 1); continue; }
        const p = poses[k.id]; if(!p) continue;
        const a = frameAsset(k, p.v.frame); if(!a) continue;
        const c = cornersOf(k, p.m, a); if(!c) continue;
        for(const pt of c){
          x0 = Math.min(x0, pt.x); y0 = Math.min(y0, pt.y);
          x1 = Math.max(x1, pt.x); y1 = Math.max(y1, pt.y);
        }
      }
    };
    eat(folder, 0);
    if(!isFinite(x0)) return null;
    return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  }

  function drawSelection(project, layer, poses, view){
    const pose = poses[layer.id]; if(!pose) return null;
    let q;
    if(isFolder(layer)){
      // 立体に なって いる フォルダは、その 四すみが そのまま わく
      q = pose.quad || folderQuad(project, layer, poses);
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
      /* 下がわの まん中＝立体の つまみ。
         なぞると 板が おくへ たおれる・よこに まわる。 */
      tilt:   { x: (q[2].x + q[3].x)/2 + (q[2].x - q[1].x)*0.28,
                y: (q[2].y + q[3].y)/2 + (q[2].y - q[1].y)*0.28 },
      anchor: piv          // まん中の印＝回転のじく。つまんで動かせる
    };
    ctx.beginPath();
    ctx.moveTo((q[0].x + q[1].x)/2, (q[0].y + q[1].y)/2);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.moveTo((q[2].x + q[3].x)/2, (q[2].y + q[3].y)/2);
    ctx.lineTo(handles.tilt.x, handles.tilt.y);
    ctx.stroke();

    for(const [k, h] of Object.entries(handles)){
      if(k === 'anchor') continue;              // じくは上で十字を描いてある
      ctx.beginPath(); ctx.arc(h.x, h.y, 9 / z, 0, 7);
      ctx.fillStyle = k === 'rotate' ? PINK : (k === 'tilt' ? '#5B7FD4' : MAIN);
      ctx.fill();
      ctx.lineWidth = 4 / z; ctx.strokeStyle = PAPER; ctx.stroke();
      ctx.lineWidth = 2 / z; ctx.strokeStyle = INK;  ctx.stroke();
    }
    return handles;
  }

  /** カメラの のぞき窓。えらんで いる のが カメラの ときだけ 出す */
  function camView(project, time, selId){
    return drawCamView(ctx, canvas, project, time, selId,
                       (l, frame) => frameAsset(l, frame));
  }

  return { ctx, draw, drawSelection, camView };
}
