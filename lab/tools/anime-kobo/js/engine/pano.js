/* ぐるり360（ぜんてんきゅう）の 絵を、動画の はいけいに する。

   「ぐるり 360°」で 作った 絵は 正距円筒（せいきょえんとう）という
   世界地図と おなじ ならべ方で、よこが ぐるり1しゅう、たてが 上から下。
   そのまま 出すと はしが びよーんと のびて 見えるので、
   「その場に 立って どっちを 見ているか」を 計算して 切り出す。

   やり方は「あみ」を つかう。
   画面に こまかい ます目を かぶせて、その かどが 絵の どこに あたるかを
   1つずつ 計算し、あとは 三角ずつ 絵を はる（ゆがみ機能と おなじ しくみ）。
   1ドットずつ 計算すると スマホでは 重すぎるが、これなら 軽い。

   よこ回転・たて回転・ズーム は ふつうの チャンネルなので、
   タイミングピンで うごかせるし、そのまま 動画に 書き出せる。 */

import { S, addAsset } from '../state.js?v=179';
import { drawDeformed } from './puppet.js?v=179';
import { newLayer } from './layer.js?v=179';
import { setPin } from './anim.js?v=179';

export const isPano = (l) => !!l && l.kind === 'pano';

/** ぐるり だけが 持つ うごかせる もの */
export const PANO_CHANNELS = ['panY', 'panP', 'panZ'];
export const PANO_LABEL = { panY:'よこ回転', panP:'たて回転', panZ:'ズーム' };

/** たてを むきすぎると 天じょうが つぶれるので、ここまでに する */
export const PITCH_MAX = 78;

/** はじめの むき */
export function panoDefaults(){
  return { panY: 0, panP: 0, panZ: 75 };   // panZ は 画角（度）。小さいほど 寄り
}

/* ---------- もとの 絵（よこに 2つ ならべた もの） ----------

   見ている むきが ぐるっと 一周の つなぎ目を またぐと、
   あみの 左と右で 絵の はしと はしを つかむ ことに なって
   まん中に 絵ぜんぶが 逆さに つまった すじが 出る。
   はじめから よこに 2まい ならべた 紙を 作って おけば、
   つなぎ目を またいでも ずっと つづきの ところを つかめる。 */
const MAXW = 2048;      // これ以上 大きいと スマホの メモリが きつい

function panoSrc(layer){
  const id = layer.frames && layer.frames[0];
  const img = id ? S.imgs[id] : null;
  if(!img || !img.naturalWidth) return null;
  const key = id + ':' + img.naturalWidth;
  if(layer._pnSrc && layer._pnKey === key) return layer._pnSrc;

  const W = Math.min(MAXW, img.naturalWidth);
  const H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  g.drawImage(img, W, 0, W, H);      // 2まいめ（つなぎ目を またぐ ため）
  layer._pnSrc = c; layer._pnKey = key; layer._pnW = W; layer._pnH = H;
  /* c2d は 絵として あつかうので、絵の ふりを させる */
  c.complete = true; c.naturalWidth = c.width; c.naturalHeight = c.height;
  return c;
}

/* ---------- あみ ---------- */
function grid(cols, rows){
  const verts = [], tris = [];
  for(let r = 0; r <= rows; r++) for(let c = 0; c <= cols; c++) verts.push({ u:0, v:0 });
  const id = (c, r) => r * (cols + 1) + c;
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++){
    tris.push(id(c, r), id(c+1, r), id(c, r+1));
    tris.push(id(c+1, r), id(c+1, r+1), id(c, r+1));
  }
  return { verts, tris, cols, rows };
}

/** ます目の こまかさ。こまかいほど きれいだが 重い。

    上や 下を むくと、絵が てっぺんの 1点に ぎゅっと あつまる。
    ます目が あらいと そこが すじに なって しまうので、
    ななめに なるほど こまかく する（まっすぐの ときは 軽いまま）。 */
function meshSize(w, h, pitch){
  const long = Math.max(w, h);
  const base = long > 1400 ? 24 : 20;
  const steep = Math.min(1, Math.abs(pitch || 0) / PITCH_MAX);
  /* こまかく しすぎると スマホで 1コマ 作るのに 時間が かかりすぎる。
     実測（1920x1080）で 24x14 ＝ 2ms、40x22 ＝ 7ms、77x43 ＝ 32ms。
     30コマ/秒に 間に合う ところで 止める。 */
  const n = Math.round(base * (1 + steep * steep * 0.8));
  return { cols: n, rows: Math.max(8, Math.round(n * h / w)) };
}

/* ---------- 見ている むき → 絵の どこか ----------
   画面の (sx, sy)（-1〜1）を 3Dの むきに して、
   たて回転・よこ回転を かけてから、緯度・経度に もどす。 */
function look(sx, sy, cy, sy_, cp, sp, W, H){
  // カメラの 前を +Z、上を +Y に する
  let x = sx, y = sy, z = 1;
  // たて（X じくまわり）
  let y1 = y * cp + z * sp;
  let z1 = -y * sp + z * cp;
  // よこ（Y じくまわり）
  let x2 = x * cy + z1 * sy_;
  let z2 = -x * sy_ + z1 * cy;

  const len = Math.hypot(x2, y1, z2) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, y1 / len)));
  const lon = Math.atan2(x2, z2);
  return {
    u: (lon / (Math.PI * 2) + 0.5) * W,
    v: (0.5 - lat / Math.PI) * H
  };
}

/**
 * いまの むきで 切り出した 1まいを 作って かえす。
 * 見た目が 変わって いなければ 作りなおさない（止まって いる間は ただ）。
 */
export function panoCanvas(l, v){
  const w = Math.max(1, l.pw || S.proj.w), h = Math.max(1, l.ph || S.proj.h);
  if(!l._pc || l._pc.width !== w || l._pc.height !== h){
    l._pc = document.createElement('canvas');
    l._pc.width = w; l._pc.height = h;
    l._pc.complete = true;
    l._pc.naturalWidth = w; l._pc.naturalHeight = h;
    l._pkey = null;
  }
  const src = panoSrc(l);
  if(!src) return l._pc;

  const yaw   = (v && v.panY != null ? v.panY : (l.panY || 0));
  let   pitch = (v && v.panP != null ? v.panP : (l.panP || 0));
  const fov   = Math.max(20, Math.min(140, v && v.panZ != null ? v.panZ : (l.panZ || 75)));
  pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));

  const key = [l._pnKey, w, h, yaw.toFixed(2), pitch.toFixed(2), fov.toFixed(2)].join('|');
  if(l._pkey === key) return l._pc;
  l._pkey = key;

  const W = l._pnW, H = l._pnH;
  const sz = meshSize(w, h, pitch);
  if(!l._pnMesh || l._pnMesh.cols !== sz.cols || l._pnMesh.rows !== sz.rows){
    l._pnMesh = grid(sz.cols, sz.rows);
  }
  const m = l._pnMesh, cols = m.cols, rows = m.rows;
  const n = m.verts.length;
  if(!l._pnXY || l._pnXY.length !== n * 2){
    l._pnXY = new Float32Array(n * 2);
    l._pnUV = new Float32Array(n * 2);
  }
  const xy = l._pnXY, uv = l._pnUV;

  const ax = Math.tan(fov * Math.PI / 360);      // よこ はんぶんの ひろがり
  const ay = ax * h / w;
  const a = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const cy = Math.cos(a), sy_ = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);

  for(let r = 0; r <= rows; r++){
    const ty = r / rows;
    const sy = -(ty * 2 - 1) * ay;               // 画面は 下むきが プラス
    for(let c = 0; c <= cols; c++){
      const tx = c / cols;
      const i = r * (cols + 1) + c;
      xy[i*2] = tx * w; xy[i*2+1] = ty * h;
      const q = look((tx * 2 - 1) * ax, sy, cy, sy_, cp, sp, W, H);
      uv[i*2] = q.u; uv[i*2+1] = q.v;
    }
  }

  /* つなぎ目を またいだ ところを つづきに する。
     となりと 半周いじょう はなれて いたら、一周ぶん 足し引きする。 */
  const half = W / 2;
  for(let r = 0; r <= rows; r++){
    const row = r * (cols + 1);
    if(r > 0){                                   // 上の 行と そろえる
      const up = (r - 1) * (cols + 1);
      while(uv[row*2] - uv[up*2] >  half) uv[row*2] -= W;
      while(uv[row*2] - uv[up*2] < -half) uv[row*2] += W;
    }
    for(let c = 1; c <= cols; c++){
      const i = row + c, j = i - 1;
      while(uv[i*2] - uv[j*2] >  half) uv[i*2] -= W;
      while(uv[i*2] - uv[j*2] < -half) uv[i*2] += W;
    }
  }
  // ぜんぶを 2まいの 紙の 中に おさめる
  let lo = Infinity;
  for(let i = 0; i < n; i++) if(uv[i*2] < lo) lo = uv[i*2];
  const shift = Math.ceil((-lo) / W) * W;
  if(shift) for(let i = 0; i < n; i++) uv[i*2] += shift;
  let hi = -Infinity;
  for(let i = 0; i < n; i++) if(uv[i*2] > hi) hi = uv[i*2];
  if(hi >= W * 2) for(let i = 0; i < n; i++) uv[i*2] -= W;

  const g = l._pc.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  drawDeformed(g, src, m, xy, 1, uv);
  return l._pc;
}


/* ---------- ついか ---------- */

/**
 * ぐるり360の 絵を 1まい いれる。
 * いちばん 下（うしろ）に 置いて、キャンバスに ぴったり 合わせる。
 */
export function addPanoLayer(name, src, img){
  const id = addAsset(name || 'ぐるり360', src, img.naturalWidth, img.naturalHeight, img);
  const l = newLayer(name || 'ぐるり360', [id]);
  l.kind = 'pano';
  l.pw = S.proj.w; l.ph = S.proj.h;
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  l.scaleX = 1; l.scaleY = 1;
  Object.assign(l, panoDefaults());
  S.proj.layers.push(l);          // はいけいと おなじで いちばん うしろ
  S.sel = l.id;
  return l;
}

/**
 * ぐるっと 1しゅう する ピンを うつ。
 * はじめの むきから 右に 360度 まわって、ぴったり もとに もどる。
 * turns を 2 に すると 2しゅう。
 */
export function spinKeys(l, seconds, turns, back){
  const t0 = 0;
  const t1 = Math.max(0.5, seconds || S.proj.duration);
  const a0 = l.panY || 0;
  const n  = (turns || 1) * 360 * (back ? -1 : 1);
  /* まわる 速さを 一定に したいので、つなぎ方は まっすぐ に する */
  setPin(l, 'panY', t0, a0, 'linear');
  setPin(l, 'panY', t1, a0 + n, 'linear');
  return 2;
}

/** 見わたす（左右に ゆっくり ふる）。1しゅうは しない */
export function sweepKeys(l, seconds, deg){
  const t1 = Math.max(0.5, seconds || S.proj.duration);
  const a0 = l.panY || 0;
  const d  = (deg == null ? 60 : deg) / 2;
  setPin(l, 'panY', 0,      a0 - d, 'smooth');
  setPin(l, 'panY', t1 / 2, a0 + d, 'smooth');
  setPin(l, 'panY', t1,     a0 - d, 'smooth');
  return 3;
}
