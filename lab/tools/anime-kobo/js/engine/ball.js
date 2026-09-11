/* イラストを 球（ボール）に はる。

   絵の よこを ぐるり1しゅう、たてを 上から下 に わりあてて
   まるい 玉の おもてに はりつけ、まわして 見せる。
   地球ぎ・ビー玉・まるい アイコンが 作れる。

   やり方は「あみ」。玉の おもてに 緯度・経度の ます目を 張って、
   その かどを 3Dで まわして 画面に うつし、三角ずつ 絵を はる
   （ぐるり360と おなじ しくみ。ちがうのは 内がわから 見るか
     外がわから 見るか だけ）。

   むこうがわ（うら）に まわった 三角は 出さない。
   画面での 三角の むき（右まわりか 左まわりか）で より分ける ので、
   玉の ふちが きれいに 出る。 */

import { drawDeformed } from './puppet.js?v=251';
import { setPin } from '../engine/anim.js?v=251';
import { S, isDraft } from '../state.js?v=251';

/** 球に はって いるか */
export const ballOn = (l) => !!(l && l.ball && l.ball.on);

/** 球だけが 持つ うごかせる もの */
export const BALL_CHANNELS = ['ballY', 'ballP'];

/* あみの こまかさ。実測（1080x1920に 512x256の 絵を 1つ）で
   24こま＝3.4ms、32こま＝6ms、40こま＝8.8ms、60こま＝19ms。
   30コマ/秒に よゆうで 間に合う ところを はじめに する。 */
export function ballDefaults(){
  return { on: true, cols: 32, rows: 16, shade: 0.35, size: 1, art: 1 };
}

/* ---------- 貼る 絵の 大きさ ----------

   1.0 で「玉 1しゅうに ちょうど 1まい」。
   小さく すると、玉の まん前に 1まいだけ 小さく のる（シールと 同じ）。
   のこりは 何も 貼らない ので 玉の 地の 色（すけて うしろ）に なる。

   やり方
     「1しゅうぶんの 紙」を 作って、その まん中に 絵を 1まい 置く。
     あみは その 紙を ぐるり1しゅうに 貼るだけ なので、
     絵の ある ところ だけに 絵が のる。
     （前は 何まいも ならべて いた ので、もようの ように くりかえした） */
const SPREAD_MAX = 4096;

function spread(l, img, art, tag){
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const sw = Math.min(SPREAD_MAX, Math.round(iw / art));
  const sh = Math.min(SPREAD_MAX, Math.round(ih / art));
  const key = tag + '|' + sw + 'x' + sh;
  if(l._blSp && l._blSpKey === key) return { src: l._blSp, sw, sh, uOff: 0, vOff: 0 };

  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.drawImage(img, Math.round((sw - iw) / 2), Math.round((sh - ih) / 2), iw, ih);
  c.complete = true; c.naturalWidth = sw; c.naturalHeight = sh;
  l._blSp = c; l._blSpKey = key;
  return { src: c, sw, sh, uOff: 0, vOff: 0 };
}

/* ---------- あみ ----------
   玉の おもての ます目。かたち（つながり方）は ずっと 同じ なので、
   1回 作って 使いまわす。うら の 三角を のぞく ところだけ 毎コマ。 */
function ballMesh(cols, rows){
  const verts = [];
  for(let r = 0; r <= rows; r++) for(let c = 0; c <= cols; c++) verts.push({ u:0, v:0 });
  return { verts, tris: [], cols, rows };
}

/**
 * 球に はった 1まいを 作って かえす（絵の ふりを する canvas）。
 *   l   … レイヤー
 *   v   … いまの 時こくの 数字（ballY / ballP）
 *   img … もとの 絵
 *   tag … その 絵の 見わけ（コマが かわったら 作りなおす ため）
 * 見た目が 変わって いなければ 作りなおさない。
 */
/* ふちの はみ出し。さいごに 丸く 切りぬく ので 見えない */
const RIM_OVER = 1.03;

/* ---------- 小さくした 写し（ミップ）----------

   玉の ふち近くでは、絵が よこに ぎゅっと つぶれる。
   もとの 絵から そのまま 拾うと、細い 線（ハッチングや 雨の すじ）が
   ぬけたり 出たり して ちらつく（実測: となりとの 差が 最大 87）。

   写真の 世界と 同じで、つぶれる ところは
   「はじめから 小さくした 絵」から 拾えば なめらかに なる。
   半分・4分の1 の 2まいを 作って おき、
   ます目 1つ ずつ どれから 拾うかを 決める。 */
function mipsOf(l, img, tag){
  const key = tag + '|' + img.naturalWidth + 'x' + img.naturalHeight;
  if(l._blMip && l._blMipKey === key) return l._blMip;
  const out = [img];
  let prev = img, w = img.naturalWidth, h = img.naturalHeight;
  for(let i = 0; i < 2 && w > 16 && h > 16; i++){
    w = Math.max(8, Math.round(w / 2));
    h = Math.max(8, Math.round(h / 2));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(prev, 0, 0, w, h);
    c.complete = true; c.naturalWidth = w; c.naturalHeight = h;
    out.push(c);
    prev = c;
  }
  l._blMip = out; l._blMipKey = key;
  return out;
}

export function ballCanvas(l, v, img, tag){
  if(!img || !img.naturalWidth) return img;

  const b = l.ball || (l.ball = ballDefaults());
  /* さわって いる あいだは あらく する（画質の せってい） */
  const draft = isDraft();
  const cols = draft ? 14 : Math.max(8, Math.min(96, b.cols || 32));
  const rows = draft ?  7 : Math.max(6, Math.min(48, b.rows || 16));

  /* 出す 紙は もとの 絵と おなじ 大きさ。
     こう すると レイヤーの 場所・大きさの あつかいが
     ふつうの 絵の ときと まったく 同じに なる。
     玉は その 中に ぴったり 入る 円。 */
  const w = img.naturalWidth, h = img.naturalHeight;
  if(!l._blC || l._blC.width !== w || l._blC.height !== h){
    l._blC = document.createElement('canvas');
    l._blC.width = w; l._blC.height = h;
    l._blC.complete = true;
    l._blC.naturalWidth = w; l._blC.naturalHeight = h;
    l._blKey = null;
  }

  const yaw   = (v && v.ballY != null ? v.ballY : (l.ballY || 0));
  const pitch = Math.max(-89, Math.min(89,
                  v && v.ballP != null ? v.ballP : (l.ballP || 0)));
  const shade = b.shade == null ? 0.35 : b.shade;
  /* 玉の 大きさ。1 で 絵の みじかい ほうに ぴったり。
     1より 大きく すると 絵の わくから はみ出て「ぜんめん」に なる。 */
  const size = Math.max(0.15, Math.min(2, b.size == null ? 1 : b.size));
  /* 貼る 絵の 大きさ。1 で「玉 1しゅうに ちょうど 1まい」。
     小さく すると 何回も くりかえし、大きく すると 絵の 一部だけ 出る。 */
  const art = Math.max(0.15, Math.min(6, b.art == null ? 1 : b.art));

  const key = [tag || '', w, h, cols, rows, draft ? 'd' : 'f', size.toFixed(3), art.toFixed(3),
               yaw.toFixed(2), pitch.toFixed(2), shade.toFixed(2)].join('|');
  if(l._blKey === key) return l._blC;
  l._blKey = key;

  if(!l._blMesh || l._blMesh.cols !== cols || l._blMesh.rows !== rows){
    l._blMesh = ballMesh(cols, rows);
    l._blXY = null;
  }
  const m = l._blMesh;
  const n = m.verts.length;
  if(!l._blXY || l._blXY.length !== n * 2){
    l._blXY = new Float32Array(n * 2);
    l._blUV = new Float32Array(n * 2);
    l._blZ  = new Float32Array(n);
  }
  const xy = l._blXY, uv = l._blUV, zz = l._blZ;

  /* 1しゅうぶんの 紙。
       art が 1 より 小さい … もとの 絵より 大きい 紙を 作って まん中に 置く
       art が 1 いじょう   … もとの 絵の まん中の ぶんだけ つかう（大うつし） */
  let src, sw, sh, uOff = 0, vOff = 0;
  if(art < 0.999){
    const sp = spread(l, img, art, (tag || '') + '|' + art.toFixed(3));
    src = sp.src; sw = sp.sw; sh = sp.sh;
  } else {
    src = img;
    sw = img.naturalWidth / art; sh = img.naturalHeight / art;
    uOff = (img.naturalWidth  - sw) / 2;
    vOff = (img.naturalHeight - sh) / 2;
  }

  const R  = Math.min(w, h) / 2 * size;
  const cx = w / 2, cy = h / 2;
  const a = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cp = Math.cos(p), sp = Math.sin(p);

  for(let r = 0; r <= rows; r++){
    const tv = r / rows;                      // 0 が 北（絵の 上）
    const lat = (0.5 - tv) * Math.PI;         // +90°〜 -90°
    const cl = Math.cos(lat), sl = Math.sin(lat);

    /* この よこ線が「玉の ふち」を またぐ ところ の 経度。

       ふちは 目から 見て まっすぐ よこの 大きな 円。
       むこうがわ に 回った かどを ここへ 動かすと、
       ふちが ほんとうの 丸に なる（かくばらない・すきまも 出ない）。
       うつす 絵の 位置も その 経度に あわせるので、のびない。

         z2 = sin(lat)sin(p) + cos(p)cos(lat)cos(lon + a) = 0
         → cos(lon + a) = -sin(lat)sin(p) / (cos(p)cos(lat)) */
    let lonA = null, lonB = null;
    const den = cp * cl;
    if(Math.abs(den) > 1e-6){
      const arg = -sl * sp / den;
      if(arg >= -1 && arg <= 1){
        const t = Math.acos(arg);
        lonA = t - a; lonB = -t - a;
      }
    }
    /* -π〜π に そろえる（近い ほうを えらぶ ため） */
    const wrap = (v) => {
      while(v >  Math.PI) v -= Math.PI * 2;
      while(v < -Math.PI) v += Math.PI * 2;
      return v;
    };
    if(lonA !== null){ lonA = wrap(lonA); lonB = wrap(lonB); }

    for(let c = 0; c <= cols; c++){
      const tu = c / cols;
      let lon = (tu - 0.5) * Math.PI * 2;
      let tuUse = tu;

      // 玉の おもての 1点（まわす まえ）
      const pt = (lo) => {
        const x = cl * Math.sin(lo), y = sl, z = cl * Math.cos(lo);
        const x1 =  x * ca + z * sa;
        const z1 = -x * sa + z * ca;
        return { x: x1, y: y * cp - z1 * sp, z: y * sp + z1 * cp };
      };
      let q = pt(lon);

      if(q.z <= 0 && lonA !== null){
        /* むこうがわ。近い ほうの「ふち」へ 動かす。
           ぴったり ふちに 置くと、そこの 三角が ぺらぺらに なって
           となりとの あいだに 細い すきまが 出る（ふちに 白い すじ）。
           すこし 外へ はみ出させて おいて、さいごに 丸く 切りぬく。 */
        const dA = Math.abs(wrap(lon - lonA)), dB = Math.abs(wrap(lon - lonB));
        const lo = dA < dB ? lonA : lonB;
        q = pt(lo);
        q.x *= RIM_OVER; q.y *= RIM_OVER;
        tuUse = tu + wrap(lo - lon) / (Math.PI * 2);
      }

      const i = r * (cols + 1) + c;
      xy[i*2]   = cx + q.x * R;
      xy[i*2+1] = cy - q.y * R;               // 画面は 下むきが プラス
      uv[i*2]   = uOff + tuUse * sw;
      uv[i*2+1] = vOff + tv * sh;
      zz[i] = q.z;                            // プラスが こちらむき
    }
  }

  /* こちらを むいて いる 三角 だけ のこす。
     画面での 三角の まわり方（外せき）で 決める。
     こうすると 玉の ふち ちょうどで 切れる。 */
  const tris = m.tris;
  tris.length = 0;
  const id = (c, r) => r * (cols + 1) + c;
  const facing = (a0, b0, c0) => {
    const ax = xy[a0*2], ay = xy[a0*2+1];
    const cr = (xy[b0*2] - ax) * (xy[c0*2+1] - ay)
             - (xy[b0*2+1] - ay) * (xy[c0*2] - ax);
    /* 画面は 下むきが プラス。こちらむきの 三角は
       A→B→C が この まわり方に なる（実測で 合わせた）。 */
    return cr > 0;
  };
  /* ます目 1つの もとの 絵での ひろさ（つぶれぐあいを 出す ため） */
  const cellSrc = (sw / cols) * (sh / rows);
  const area = (a0, b0, c0) => Math.abs(
    (xy[b0*2] - xy[a0*2]) * (xy[c0*2+1] - xy[a0*2+1]) -
    (xy[b0*2+1] - xy[a0*2+1]) * (xy[c0*2] - xy[a0*2])) / 2;

  const lv = [tris, [], []];
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
    const A = id(c, r), B = id(c+1, r), C = id(c, r+1), D = id(c+1, r+1);
    /* ぜんぶ むこうがわ の ます目だけ 落とす。
       ふちを またぐ ます目は のこす（かどは ふちへ 逃がして ある）。 */
    if(zz[A] <= 0 && zz[B] <= 0 && zz[C] <= 0 && zz[D] <= 0) continue;

    /* どれくらい つぶれて いるか。もとの ひろさ ÷ 画面の ひろさ の 平方根。
       2ばい つぶれて いたら 半分の 絵、4ばいなら 4分の1 の 絵 から 拾う。 */
    const dst = area(A, B, C) + area(B, D, C);
    const comp = dst > 0.01 ? Math.sqrt(cellSrc / dst) : 99;
    const lvl = comp < 1.7 ? 0 : (comp < 3.4 ? 1 : 2);
    const t = lv[lvl];
    if(facing(A, B, C)) t.push(A, B, C);
    if(facing(B, D, C)) t.push(B, D, C);
  }

  const g = l._blC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  if(lv[0].length || lv[1].length || lv[2].length){
    /* 玉の 形（まん丸）で 切りぬく。はみ出させた ふちが ここで 落ちて、
       ふちが つるりと 丸く なる。 */
    /* あらい ときは 小さくした 写しを 作らない（そのぶん 軽い） */
    const mip = (!draft && (lv[1].length || lv[2].length))
      ? mipsOf(l, src, (tag || '') + '|' + sw) : [src];
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    /* 使いわけは するが、ぬるのは 1回に まとめる
       （べつべつに ぬると 境目が すじに なって 出る）。 */
    const parts = [];
    for(let i = 0; i < 3; i++){
      if(!lv[i].length) continue;
      const im = mip[Math.min(i, mip.length - 1)];
      parts.push({ img: im, tris: lv[i],
        k: (im.naturalWidth || im.width) / (src.naturalWidth || src.width) });
    }
    drawDeformed(g, parts, m, xy, 1, uv);
    g.restore();
  }

  /* まるみを 出す かげ。
     ひだり上から 光が あたって いる ように、右下へ 向けて 暗く する。
     0 に すると ぺったり した 玉に なる。 */
  if(shade > 0.01){
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1,
                                      cx, cy, R * 1.15);
    gr.addColorStop(0,   'rgba(255,255,255,' + (shade * 0.5).toFixed(3) + ')');
    gr.addColorStop(0.45,'rgba(0,0,0,0)');
    gr.addColorStop(1,   'rgba(0,0,0,' + shade.toFixed(3) + ')');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  return l._blC;
}

/** ぐるっと まわる ピンを うつ */
export function ballSpinKeys(l, seconds, turns, back){
  const t1 = Math.max(0.5, seconds || S.proj.duration);
  const a0 = l.ballY || 0;
  const n  = (turns || 1) * 360 * (back ? -1 : 1);
  setPin(l, 'ballY', 0,  a0, 'linear');
  setPin(l, 'ballY', t1, a0 + n, 'linear');
  return 2;
}
