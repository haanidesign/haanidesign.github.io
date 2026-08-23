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
  g.drawImage(img, 0, 0, SW, SH);
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

  return { w, h, verts, tris, pre: null, dirty: true, stiff: null, nPins: 0 };
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

export function precompute(mesh, pins, stiff){
  const n = mesh.verts.length;
  const bones = framesOf(pins, false);
  const nb = bones.length;
  const a = Math.max(0.3, stiff == null ? 1.4 : stiff);

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
      const use = cand.slice(0, MAXB);
      let sum = 0;
      const ws = use.map(c => { const x = 1 / Math.pow(Math.max(c.d, 1), a); sum += x; return x; });
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
  mesh.dirty = false;
}

/** 下ごしらえが今のピン・かたさに合っているか */
export function needsPrecompute(mesh, pins, stiff){
  const a = Math.max(0.3, stiff == null ? 1.4 : stiff);
  return mesh.dirty || !mesh.pre || mesh.nPins !== pins.length || mesh.stiff !== a;
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
function drawTri(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2){
  const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, EX = 0.4;
  let d;
  d = Math.hypot(x0 - cx, y0 - cy) || 1; x0 += (x0 - cx) / d * EX; y0 += (y0 - cy) / d * EX;
  d = Math.hypot(x1 - cx, y1 - cy) || 1; x1 += (x1 - cx) / d * EX; y1 += (y1 - cy) / d * EX;
  d = Math.hypot(x2 - cx, y2 - cy) || 1; x2 += (x2 - cx) / d * EX; y2 += (y2 - cy) / d * EX;

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
export function drawDeformed(ctx, img, mesh, xy){
  const t = mesh.tris, v = mesh.verts;
  for(let i = 0; i < t.length; i += 3){
    const i0 = t[i], i1 = t[i + 1], i2 = t[i + 2];
    drawTri(ctx, img,
      xy[i0 * 2], xy[i0 * 2 + 1], xy[i1 * 2], xy[i1 * 2 + 1], xy[i2 * 2], xy[i2 * 2 + 1],
      v[i0].u, v[i0].v, v[i1].u, v[i1].v, v[i2].u, v[i2].v);
  }
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
      acc += angle * Math.sin(w + i * delay);
      const a = base[i].ang + acc;
      pos.push({ x: pos[i].x + Math.cos(a) * base[i].len,
                 y: pos[i].y + Math.sin(a) * base[i].len });
    }
    out.push({ t, pins: pins.map((p, i) => ({ dx: pos[i].x - p.u, dy: pos[i].y - p.v })) });
  }
  return out;
}

export function newPin(u, v, type){
  return {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    u, v,
    type: type || 'move',
    dx: 0, dy: 0
  };
}
