/* パペットピン。
   絵の上にピンを刺すと、刺した順につながって「骨」になる。
   ボーン変形アニメと同じで、根元から先端へ順に曲がりが伝わる。

     うごかすピン … つまんで動かすと、そこから先の骨がぜんぶ付いてくる
     とめるピン   … 支点になる。そこより根元側は動かない

   角（あみの頂点）は近い骨2本にぶら下げる。骨のローカル座標で覚えておき、
   動いたあとの骨で戻すので、ゴムのように伸びずに関節として曲がる。

   座標はすべて絵の中の座標（画像ピクセル）で持つ。 */

const EPS = 1e-8;

/* ---------- メッシュを張る ---------- */
/** 透明なところを避けて、絵の上に格子のあみを張る */
export function buildMesh(img, cols, rows){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const SW = Math.min(w, 220);
  const SH = Math.max(1, Math.round(h * SW / w));
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img._src || img, 0, 0, SW, SH);
  const data = g.getImageData(0, 0, SW, SH).data;

  const opaque = (u, v) => {
    const px = Math.min(SW - 1, Math.max(0, Math.floor(u * SW)));
    const py = Math.min(SH - 1, Math.max(0, Math.floor(v * SH)));
    return data[(py * SW + px) * 4 + 3] > 8;
  };
  const cellHasInk = (cx, cy) => {
    for(let sy = 0; sy <= 4; sy++){
      for(let sx = 0; sx <= 4; sx++){
        if(opaque((cx + sx / 4) / cols, (cy + sy / 4) / rows)) return true;
      }
    }
    return false;
  };

  const map = new Map(), verts = [], tris = [];
  const vi = (gx, gy) => {
    const key = gx + ',' + gy;
    if(map.has(key)) return map.get(key);
    verts.push({ u: gx / cols * w, v: gy / rows * h });
    map.set(key, verts.length - 1);
    return verts.length - 1;
  };

  for(let gy = 0; gy < rows; gy++){
    for(let gx = 0; gx < cols; gx++){
      if(!cellHasInk(gx, gy)) continue;
      const a = vi(gx, gy), b = vi(gx + 1, gy), c = vi(gx + 1, gy + 1), d = vi(gx, gy + 1);
      tris.push(a, b, c, a, c, d);
    }
  }
  if(!tris.length){
    const a = vi(0, 0), b = vi(cols, 0), c = vi(cols, rows), d = vi(0, rows);
    tris.push(a, b, c, a, c, d);
  }

  return { w, h, verts, tris, pre: null, dirty: true, stiff: null, joints: null, nPins: 0 };
}

/** 絵の大きさに合わせて、ほどよい細かさを決める */
export function meshSizeFor(img){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const long = Math.max(w, h);
  const n = 16;
  return {
    cols: Math.max(2, Math.round(n * w / long)),
    rows: Math.max(2, Math.round(n * h / long))
  };
}

/* ---------- 骨 ----------
   ピンは刺した順につながって「骨」になる（ボーン変形アニメと同じ考え方）。
   骨 i は ピン i → ピン i+1 の線分。
   根元のピンを回すと、その先の骨がぜんぶ付いてくる。

   角（あみの頂点）は、近い骨2本にぶらさげる。
   骨のローカル座標で覚えておき、動いたあとの骨で戻すと、
   曲がりが根元から先へ連なって伝わる。 */

/** 骨の元の姿から、その骨のローカル座標系を作る */
function boneFrame(ax, ay, bx, by){
  let dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  return { ox: ax, oy: ay, ex: dx, ey: dy, len };   // e = 骨の向き
}

/** ワールド → 骨のローカル（骨に沿った距離 s と、骨からの横ずれ t） */
function toBone(f, x, y){
  const px = x - f.ox, py = y - f.oy;
  return { s: px * f.ex + py * f.ey, t: -px * f.ey + py * f.ex };
}
/** 骨のローカル → ワールド */
function fromBone(f, s, t){
  return { x: f.ox + f.ex * s - f.ey * t, y: f.oy + f.ey * s + f.ex * t };
}

/** ピンの列から骨の列を作る。now=false なら刺した位置、true なら動かしたあと */
function framesOf(pins, now){
  const out = [];
  for(let i = 0; i < pins.length - 1; i++){
    const a = pins[i], b = pins[i + 1];
    out.push(now
      ? boneFrame(a.u + a.dx, a.v + a.dy, b.u + b.dx, b.v + b.dy)
      : boneFrame(a.u, a.v, b.u, b.v));
  }
  return out;
}

/** 点から線分までの距離 */
function distToSeg(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/* ---------- 下ごしらえ ----------
   骨が動かないかぎり使い回せる部分（どの角がどの骨にどれだけ付くか）を先に計算する。 */
const MAXB = 2;   // 1つの角がぶら下がる骨の数

/* これ以上かたくすると、1つの角は いちばん近い骨だけに ぶら下がる。
   ひじ・ゆびのように 関節でカクッと折れる動きになる。
   それより下は 2本の骨に またがるので、布のように なめらかに曲がる。 */
export const RIGID = 7;

export function precompute(mesh, pins, stiff){
  const n = mesh.verts.length;
  const bones = framesOf(pins, false);
  const nb = bones.length;
  const a = Math.max(0.3, stiff == null ? 1.4 : stiff);
  const rigid = a >= RIGID;

  /* 骨 b と 骨 b+1 の あいだにあるピンが「関節」なら、
     その2本を またぐ角は 作らない。＝ そこで カクッと折れる。
     かたさ（なめらかさ）とは別に、ピン1本ずつで 決められる。 */
  const hardAt = (b0, b1) => {
    if(Math.abs(b0 - b1) !== 1) return false;
    const shared = pins[Math.max(b0, b1)];
    return !!(shared && shared.joint);
  };

  const idx = new Int16Array(n * MAXB).fill(-1);
  const w   = new Float32Array(n * MAXB);
  const ls  = new Float32Array(n * MAXB);   // 骨に沿った距離
  const lt  = new Float32Array(n * MAXB);   // 骨からの横ずれ

  if(nb > 0){
    const cand = [];
    for(let i = 0; i < n; i++){
      const vx = mesh.verts[i].u, vy = mesh.verts[i].v;
      cand.length = 0;
      for(let b = 0; b < nb; b++){
        const f = bones[b];
        const ex = f.ox + f.ex * f.len, ey = f.oy + f.ey * f.len;
        cand.push({ b, d: distToSeg(vx, vy, f.ox, f.oy, ex, ey) });
      }
      cand.sort((p, q) => p.d - q.d);
      const solo = rigid || (cand.length > 1 && hardAt(cand[0].b, cand[1].b));
      const use = solo ? cand.slice(0, 1) : cand.slice(0, MAXB);
      let sum = 0;
      const ws = solo
        ? (sum = 1, [1])
        : use.map(c => { const x = 1 / Math.pow(Math.max(c.d, 1), a); sum += x; return x; });
      for(let k = 0; k < use.length; k++){
        const b = use[k].b;
        const loc = toBone(bones[b], vx, vy);
        idx[i * MAXB + k] = b;
        w[i * MAXB + k] = ws[k] / sum;
        ls[i * MAXB + k] = loc.s;
        lt[i * MAXB + k] = loc.t;
      }
    }
  }

  mesh.pre = { nb, idx, w, ls, lt };
  mesh.nPins = pins.length;
  mesh.stiff = a;
  mesh.joints = jointKey(pins);
  mesh.dirty = false;
}

/** 下ごしらえが今のピン・かたさに合っているか */
const jointKey = (pins) => pins.map(p => p.joint ? 1 : 0).join('');

export function needsPrecompute(mesh, pins, stiff){
  const a = Math.max(0.3, stiff == null ? 1.4 : stiff);
  return mesh.dirty || !mesh.pre || mesh.nPins !== pins.length
      || mesh.stiff !== a || mesh.joints !== jointKey(pins);
}

/* ---------- 変形 ---------- */
/** 骨のいまの姿から、あみの角の位置を出す。out は絵の中の座標 */
export function deform(mesh, pins, out){
  const n = mesh.verts.length;
  const pre = mesh.pre;

  // 骨が無い（ピン0〜1本）ときは、平行移動だけ
  if(!pre || pre.nb === 0){
    const dx = pins.length ? pins[0].dx : 0;
    const dy = pins.length ? pins[0].dy : 0;
    for(let i = 0; i < n; i++){
      out[i * 2] = mesh.verts[i].u + dx;
      out[i * 2 + 1] = mesh.verts[i].v + dy;
    }
    return;
  }

  const now = framesOf(pins, true);
  const { idx, w, ls, lt } = pre;

  for(let i = 0; i < n; i++){
    let x = 0, y = 0, tw = 0;
    for(let k = 0; k < MAXB; k++){
      const b = idx[i * MAXB + k];
      if(b < 0) break;
      const f = now[b];
      if(!f) continue;
      const wk = w[i * MAXB + k];
      // 骨が伸び縮みしたぶんだけ、沿った距離も伸ばす
      const scale = f.len / Math.max(1e-6, framesLenOf(pre, b, pins));
      const p = fromBone(f, ls[i * MAXB + k] * scale, lt[i * MAXB + k]);
      x += p.x * wk; y += p.y * wk; tw += wk;
    }
    if(tw > 1e-6){ out[i * 2] = x / tw; out[i * 2 + 1] = y / tw; }
    else { out[i * 2] = mesh.verts[i].u; out[i * 2 + 1] = mesh.verts[i].v; }
  }
}

/* 元の骨の長さ（毎回作り直さないよう、必要なときだけ計算する） */
let _lenCache = null, _lenKey = null;
function framesLenOf(pre, b, pins){
  const key = pins.length + ':' + pins.map(p => (p.u | 0) + ',' + (p.v | 0)).join(';');
  if(_lenKey !== key){
    _lenCache = framesOf(pins, false).map(f => f.len);
    _lenKey = key;
  }
  return _lenCache[b] || 1;
}

/* ---------- 描く ---------- */
/* ---------- 三角を ほんの少し ふくらませる ----------
   三角と 三角の あいだに すきまが できると、下じきの 色が
   すじに なって 見える。ふせぐには 少しだけ 重ねて 描く。

   まえは「まん中から 外へ 角を おし出す」だった。
   これだと 三角が 大きい・ほそながい ときに、
   へりの まん中あたりが じゅうぶん 外へ 出ず、すじが のこる。

   いまは「3本の へりを それぞれ まっすぐ 外へ ずらして、
   その 交わる ところを 新しい 角に する」。
   どの へりも きっちり ex ドット 外へ 出るので、
   となりの 三角と かならず 重なる。 */
function drawTri(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2, ex){
  const EX = ex == null ? 0.4 : ex;

  // まわる 向き（時計 or 反時計）。外がわを まちがえない ように
  const area2 = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if(area2 !== 0){
    const sgn = area2 > 0 ? 1 : -1;
    const px = [x0, x1, x2], py = [y0, y1, y2];
    /** へり i→i+1 の 外を むく たんいベクトル */
    const nrm = (i) => {
      const j = (i + 1) % 3;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      const L = Math.hypot(dx, dy) || 1;
      return { x: sgn * dy / L, y: -sgn * dx / L };
    };
    const n = [nrm(0), nrm(1), nrm(2)];
    const out = [];
    for(let i = 0; i < 3; i++){
      // 角 i に くっついて いる 2本の へり
      const a = n[(i + 2) % 3], b = n[i];
      let bx = a.x + b.x, by = a.y + b.y;
      const L = Math.hypot(bx, by);
      if(L < 1e-6){ out.push({ x: px[i], y: py[i] }); continue; }
      bx /= L; by /= L;
      // とがった 角ほど 遠くへ 出る。出すぎない ように 3ばい までに する
      const k = Math.min(3, 1 / Math.max(0.34, bx * a.x + by * a.y));
      out.push({ x: px[i] + bx * EX * k, y: py[i] + by * EX * k });
    }
    x0 = out[0].x; y0 = out[0].y;
    x1 = out[1].x; y1 = out[1].y;
    x2 = out[2].x; y2 = out[2].y;
  }

  const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if(!det) return;
  const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
  const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
  const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
  const e = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath();

  ctx.clip();
  ctx.transform(a, b, c, e, x0 - a * u0 - c * v0, y0 - b * u0 - e * v0);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** 変形したあみに絵を貼る。ctx にはレイヤーの変換がかかっている前提 */
/**
 * あみの形に そって 絵を 描く。
 *   srcK … 絵の中の ドット数と あみの ものさしが ちがうときの 倍率
 *          （フォルダを まとめて 曲げるときに つかう。ふだんは 1）
 */
/**
 * @param uv … 絵の どこを はるか（なくても よい）。
 *   ふつうは あみの もとの 場所を そのまま つかうが、
 *   あみを ゆがめて から 骨で 曲げる ときは、
 *   「もとの 絵の 場所」を べつに わたす ひつようが ある。
 */
export function drawDeformed(ctx, img, mesh, xy, srcK, uv){
  const k = srcK || 1;

  /* ふくらませる 量は「画面の ドットで いくつぶん」で きめる。
     絵の中の ドットで きめると、ズームや レイヤーの 大きさで
     効いたり 効かなかったり して しまう。 */
  let scale = 1;
  try{
    const m = ctx.getTransform();
    scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  }catch(_){ scale = 1; }
  const ex = Math.min(6, Math.max(0.5, 0.6 / scale));

  /* ---------- かさなっても 濃く ならない ように ----------
     三角を ふくらませて 重ねると すきまは 消えるが、
     こんどは 重なった ところが 2回 塗られて 濃い すじに なる
     （うすい 色や やわらかい ふちの 絵で とくに 目立つ）。

     そこで いったん 別紙に「すけ具合 100%」で 組み立てて、
     さいごに 1回だけ 本番へ うつす。
     レイヤーの すけ具合は その 1回に かかる ので、
     重なった ところが 2回 うすめられる ことが なくなる。
     （すけた レイヤーを ゆがめた ときの こい すじが これで 消える） */
  const cv = ctx.canvas;
  const sc = sheet(cv.width, cv.height);
  const g = sc.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, sc.width, sc.height);
  const m0 = ctx.getTransform();
  g.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e, m0.f);

  const t = mesh.tris, v = mesh.verts;
  for(let i = 0; i < t.length; i += 3){
    const i0 = t[i], i1 = t[i + 1], i2 = t[i + 2];
    /* 絵の どこを はるか。uv が あれば そちらを つかう */
    const u0 = uv ? uv[i0 * 2] : v[i0].u, w0 = uv ? uv[i0 * 2 + 1] : v[i0].v;
    const u1 = uv ? uv[i1 * 2] : v[i1].u, w1 = uv ? uv[i1 * 2 + 1] : v[i1].v;
    const u2 = uv ? uv[i2 * 2] : v[i2].u, w2 = uv ? uv[i2 * 2 + 1] : v[i2].v;
    drawTri(g, img,
      xy[i0 * 2], xy[i0 * 2 + 1], xy[i1 * 2], xy[i1 * 2 + 1], xy[i2 * 2], xy[i2 * 2 + 1],
      u0 * k, w0 * k, u1 * k, w1 * k, u2 * k, w2 * k,
      ex);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sc, 0, 0);
  ctx.restore();
}

/* 別紙（使いまわす） */
let _sheet = null;
function sheet(w, h){
  if(!_sheet) _sheet = document.createElement('canvas');
  if(_sheet.width !== w || _sheet.height !== h){ _sheet.width = w; _sheet.height = h; }
  return _sheet;
}

/** 中身が つまった あみ（フォルダ用）。絵の あるなしを 見ない */
export function buildMeshRect(w, h, cols, rows){
  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.min(64, cols * 2));
  cv.height = Math.max(2, Math.min(64, rows * 2));
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, cv.width, cv.height);
  // 大きさだけ さしかえて わたす（buildMesh は 幅・高さを ここから 見る）
  return buildMesh({ width: w, height: h, _src: cv }, cols, rows);
}

/** あみの線を描く（ピンモード中の目印） */
export function strokeMesh(ctx, mesh, xy, lineWidth, color){
  const t = mesh.tris;
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for(let i = 0; i < t.length; i += 3){
    const a = t[i] * 2, b = t[i + 1] * 2, c = t[i + 2] * 2;
    ctx.moveTo(xy[a], xy[a + 1]);
    ctx.lineTo(xy[b], xy[b + 1]);
    ctx.lineTo(xy[c], xy[c + 1]);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * ピン i を newX,newY へ動かす。
 * 直前の「とめるピン」または1つ前のピンを支点にして回し、
 * そこから先のピンをぜんぶ同じだけ回す＝骨が連なって曲がる。
 * 動かした結果を pins の dx,dy に書き込む。
 */
export function bendChain(pins, i, newX, newY){
  if(!pins[i] || pins[i].type === 'fix') return;    // とめるピンは動かさない
  const cur = (k) => ({ x: pins[k].u + pins[k].dx, y: pins[k].v + pins[k].dy });

  // 根元（0番）を動かすときは、全体をそのまま平行移動
  if(i === 0){
    const c = cur(0);
    const dx = newX - c.x, dy = newY - c.y;
    pins.forEach(p => { p.dx += dx; p.dy += dy; });
    return;
  }

  /* 支点は1つ前のピン。ここが関節になるので、支点より根元は動かない。
     （手前の「とめるピン」まで遡ると、先端を触っただけで途中の関節まで
       回ってしまい、腕が1本の棒のように見える） */
  const anchor = i - 1;
  const a = cur(anchor);
  const from = cur(i);

  const a0 = Math.atan2(from.y - a.y, from.x - a.x);
  const a1 = Math.atan2(newY - a.y, newX - a.x);
  const d0 = Math.hypot(from.x - a.x, from.y - a.y);
  const d1 = Math.hypot(newX - a.x, newY - a.y);
  const rot = a1 - a0;
  const k = d0 > 1e-6 ? d1 / d0 : 1;
  const cs = Math.cos(rot), sn = Math.sin(rot);

  // 支点より先のピンを、支点を中心に回して伸ばす
  for(let j = anchor + 1; j < pins.length; j++){
    const c = cur(j);
    const px = (c.x - a.x) * k, py = (c.y - a.y) * k;
    const nx = a.x + px * cs - py * sn;
    const ny = a.y + px * sn + py * cs;
    pins[j].dx = nx - pins[j].u;
    pins[j].dy = ny - pins[j].v;
  }
}

/**
 * 骨をサイン波でしならせて、ピンの動きを自動で作る。
 * 各骨を 角度 = 曲がり角度 * sin(2π * 時間/周期 + 位相 + 番号*遅延) だけ回し、
 * 根元から順につないだ結果を、その時刻のピンの位置として返す。
 * 遅延を入れると 根元より先端が遅れて振られ、鞭のようにしなる。
 *
 * 戻り値: [{ t, pins:[{dx,dy}] }, ...]
 */
/* ---------- ゆれ（その場で 出す） ----------
   ボーン変形アニメ（psd-bone-anime）と 同じ 計算。

   骨を 根元から 先へ たどりながら、
   節ごとに ちょっとずつ 角度を たしていく。
   たす 角度は sin の なみ。先の 節ほど なみを おくらせるので、
   毛先へ 向かって しなりが 流れていく。

   だいじなのは「その 時こくで じかに 出す」こと。
   ピンを 何コマか 打って あいだを つなぐ やり方だと、
   なみの 山と 谷の あいだが まっすぐな 線に なって カクカクする。
   ここでは 何秒めでも 本物の sin を 出すので なめらか。

   はじめの ぐあい */
export function newSway(){
  return {
    on: true,
    angle: 8,       // 曲がり角度（度）
    period: 1.6,    // しゅうき（秒）
    phase: 0,       // いち（ずらし）0〜1
    delay: 0.25,    // おくれ（先の 節ほど おくれる）
    start: 0        // いつから
  };
}

/** ピンが 無い（1本以下）ときの ゆれ。じくを 中心に かたむける だけ。
    戻り値 … 足す かたむき（度） */
export function swayTilt(sw, time){
  const angle  = sw.angle  == null ? 8    : sw.angle;
  const period = Math.max(0.05, sw.period == null ? 1.6 : sw.period);
  const phase  = (sw.phase  == null ? 0   : sw.phase) * Math.PI * 2;
  const t = (time || 0) - (sw.start || 0);
  return angle * Math.sin(2 * Math.PI * (t / period) + phase);
}

/**
 * その 時こくの ゆれ ぐあいを 出す。
 *   pins … パペットピン（2本いじょう）
 * 戻り値 … [{dx,dy}, ...]（ピンと 同じ ならび）
 */
export function swayPose(pins, sw, time){
  const n = pins.length;
  if(n < 2) return null;

  const angle  = (sw.angle  == null ? 8    : sw.angle)  * Math.PI / 180;
  const period = Math.max(0.05, sw.period == null ? 1.6 : sw.period);
  const phase  = (sw.phase  == null ? 0    : sw.phase)  * Math.PI * 2;
  const delay  = (sw.delay  == null ? 0.25 : sw.delay)  * Math.PI * 2;
  const t = (time || 0) - (sw.start || 0);
  const w = 2 * Math.PI * (t / period) + phase;

  /* かえすのは「ピンと 同じ 形」の もの。
     絵を 曲げる ところは id・u・v・type も 見るので、
     ずれ（dx,dy）だけ かえすと 絵が 消えてしまう。 */
  const out = [ Object.assign({}, pins[0], { dx: 0, dy: 0 }) ];

  // 根元は 動かさない。先へ 向かって 角度を つみ上げる
  let x = pins[0].u, y = pins[0].v, acc = 0;
  for(let i = 0; i < n - 1; i++){
    const a = pins[i], b = pins[i + 1];
    const ang = Math.atan2(b.v - a.v, b.u - a.u);
    const len = Math.hypot(b.u - a.u, b.v - a.v);
    /* おくれは「引く」。そうすると なみが 根元から 毛先へ 流れて、
       毛先が おくれて しなる（足すと 逆に 流れて しまう）。
       ボーン変形アニメ と 同じ 向き。 */
    acc += angle * Math.sin(w - i * delay);
    const na = ang + acc;
    x += Math.cos(na) * len;
    y += Math.sin(na) * len;
    // とめるピンは 支点なので 動かさない
    out.push(Object.assign({}, b, b.type === 'fix'
      ? { dx: 0, dy: 0 }
      : { dx: x - b.u, dy: y - b.v }));
  }
  return out;
}

export function swayKeys(pins, opt){
  const angle  = (opt.angle  ?? 8)   * Math.PI / 180;
  const period = Math.max(0.05, opt.period ?? 1);
  const phase  = (opt.phase  ?? 0)   * Math.PI * 2;
  const delay  = (opt.delay  ?? 0.2) * Math.PI * 2;
  const dur    = Math.max(period, opt.duration ?? period);
  const start  = opt.start ?? 0;
  const per    = Math.max(6, Math.round(opt.samplesPerCycle ?? 8));

  // 骨の元の向きと長さ
  const base = [];
  for(let i = 0; i < pins.length - 1; i++){
    const a = pins[i], b = pins[i + 1];
    base.push({ ang: Math.atan2(b.v - a.v, b.u - a.u),
                len: Math.hypot(b.u - a.u, b.v - a.v) });
  }
  if(!base.length) return [];

  const steps = Math.max(per, Math.round(dur / period * per));
  const out = [];
  for(let s = 0; s <= steps; s++){
    const local = s / steps * dur;
    const t = +(start + local).toFixed(3);
    const w = 2 * Math.PI * (local / period) + phase;

    // 根元は動かさず、先へ回転を積んでいく
    const pos = [{ x: pins[0].u, y: pins[0].v }];
    let acc = 0;
    for(let i = 0; i < base.length; i++){
      acc += angle * Math.sin(w - i * delay);   // 向きは swayPose と そろえる
      const a = base[i].ang + acc;
      pos.push({ x: pos[i].x + Math.cos(a) * base[i].len,
                 y: pos[i].y + Math.sin(a) * base[i].len });
    }
    out.push({ t, pins: pins.map((p, i) => ({ dx: pos[i].x - p.u, dy: pos[i].y - p.v })) });
  }
  return out;
}

export function newPin(u, v, type, joint){
  return {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    u, v,
    type: type || 'move',
    joint: !!joint,     // ここで カクッと 折れる（ひじ・ゆびの関節）
    dx: 0, dy: 0
  };
}

/**
 * 絵の中の1点が、ピンで曲げたあと どこへ行くか。
 * あみ（mesh）を使わずに その場で出すので、
 * 親レイヤーにくっついた子（手・小物）を 曲がりについて行かせるのに使う。
 * 戻り値の rot は、その場所の 骨の 向きの変わりぶん（度）。
 */
export function deformPoint(pins, stiff, u, v){
  const rest = framesOf(pins, false);
  const now  = framesOf(pins, true);
  if(!rest.length){
    const dx = pins.length ? (pins[0].dx || 0) : 0;
    const dy = pins.length ? (pins[0].dy || 0) : 0;
    return { x: u + dx, y: v + dy, rot: 0 };
  }

  const a = Math.max(0.3, stiff == null ? 1.4 : stiff);
  const rigid = a >= RIGID;

  const cand = rest.map((f, b) => ({
    b, d: distToSeg(u, v, f.ox, f.oy, f.ox + f.ex * f.len, f.oy + f.ey * f.len)
  })).sort((p, q) => p.d - q.d);

  const shared = (b0, b1) => (Math.abs(b0 - b1) === 1) && !!pins[Math.max(b0, b1)].joint;
  const solo = rigid || (cand.length > 1 && shared(cand[0].b, cand[1].b));
  const use = solo ? cand.slice(0, 1) : cand.slice(0, MAXB);

  let sum = 0;
  const ws = solo ? (sum = 1, [1])
                  : use.map(c => { const x = 1 / Math.pow(Math.max(c.d, 1), a); sum += x; return x; });

  let x = 0, y = 0, rot = 0;
  for(let k = 0; k < use.length; k++){
    const b = use[k].b;
    const w = ws[k] / sum;
    const loc = toBone(rest[b], u, v);
    const scale = now[b].len / Math.max(1e-6, rest[b].len);
    const pt = fromBone(now[b], loc.s * scale, loc.t);
    x += pt.x * w; y += pt.y * w;

    let d = Math.atan2(now[b].ey, now[b].ex) - Math.atan2(rest[b].ey, rest[b].ex);
    while(d >  Math.PI) d -= Math.PI * 2;
    while(d < -Math.PI) d += Math.PI * 2;
    rot += d * w;
  }
  return { x, y, rot: rot * 180 / Math.PI };
}
