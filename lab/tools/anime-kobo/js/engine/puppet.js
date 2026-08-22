/* パペットピン。
   After Effects のパペットツールと同じ考え方。骨は組まず、絵にピンを刺すだけ。

     位置ピン … つまんで動かすと、まわりの絵がついてきて やわらかく曲がる
     固定ピン … そこは動かない。肩や腰に刺すと、根元が固定されて先だけしなる

   中では絵に三角のあみ（メッシュ）を張り、あみの角がどのピンにどれだけ
   引っぱられるかを「距離」で決めている。ピンは長さゼロの骨、と思えばいい。
   座標はすべて絵の中の座標（画像ピクセル）で持つ。 */

const MAXP = 4;        // 1つの角が影響を受けるピンの数
const FALLOFF = 2;     // 距離の効き方。大きいほど近いピンだけが効く

/* ---------- メッシュを張る ---------- */
/** 透明なところを避けて、絵の上に格子のあみを張る */
export function buildMesh(img, cols, rows){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  // アルファを調べるための小さい写し
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
  // 全部透明だったときは、とりあえず全体を1枚の四角に
  if(!tris.length){
    const a = vi(0, 0), b = vi(cols, 0), c = vi(cols, rows), d = vi(0, rows);
    tris.push(a, b, c, a, c, d);
  }

  return { w, h, verts, tris, weights: null, wIdx: null, dirty: true };
}

/** 絵の大きさに合わせて、ほどよい細かさを決める */
export function meshSizeFor(img){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const long = Math.max(w, h);
  const n = 14;                       // 長い辺をこのくらいに割る
  return {
    cols: Math.max(2, Math.round(n * w / long)),
    rows: Math.max(2, Math.round(n * h / long))
  };
}

/* ---------- 重みを決める ---------- */
/** どの角がどのピンにどれだけ引っぱられるかを、刺した位置からの距離で決める */
export function computeWeights(mesh, pins){
  const n = mesh.verts.length;
  const wIdx = new Int16Array(n * MAXP).fill(-1);
  const weights = new Float32Array(n * MAXP);

  if(pins.length){
    const cand = [];
    for(let i = 0; i < n; i++){
      const vx = mesh.verts[i].u, vy = mesh.verts[i].v;
      cand.length = 0;
      for(let p = 0; p < pins.length; p++){
        const dx = vx - pins[p].u, dy = vy - pins[p].v;
        cand.push({ p, d: Math.sqrt(dx * dx + dy * dy) });
      }
      cand.sort((a, b) => a.d - b.d);
      const use = cand.slice(0, MAXP);
      let sum = 0;
      const ws = use.map(c => {
        const w = 1 / (Math.pow(Math.max(c.d, 1), FALLOFF));
        sum += w;
        return w;
      });
      for(let k = 0; k < use.length; k++){
        wIdx[i * MAXP + k] = use[k].p;
        weights[i * MAXP + k] = ws[k] / sum;
      }
    }
  }
  mesh.wIdx = wIdx;
  mesh.weights = weights;
  mesh.dirty = false;
}

/* ---------- 変形 ---------- */
/** ピンのずれを混ぜて、あみの角の位置を出す。out は絵の中の座標 */
export function deform(mesh, pins, out){
  const n = mesh.verts.length;
  const { wIdx, weights } = mesh;
  for(let i = 0; i < n; i++){
    const v = mesh.verts[i];
    let x = v.u, y = v.v;
    for(let k = 0; k < MAXP; k++){
      const p = wIdx[i * MAXP + k];
      if(p < 0) break;
      const w = weights[i * MAXP + k];
      x += pins[p].dx * w;
      y += pins[p].dy * w;
    }
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
}

/* ---------- 描く ---------- */
/** 三角形1枚にテクスチャを貼る。継ぎ目が出ないよう気持ち膨らませる */
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

export function newPin(u, v, type){
  return {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    u, v,
    type: type || 'move',   // 'move' = 位置ピン / 'fix' = 固定ピン
    dx: 0, dy: 0
  };
}
