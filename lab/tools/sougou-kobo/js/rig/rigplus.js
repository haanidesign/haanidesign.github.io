/* 🦴 骨の おまけ（Spine の 自動リグ の ような こと）
     ・形に そった あみ … パーツの ふちに そって 点を ならべ、中にも 点を まいて 三角に わける
                          （四角い ます目より、曲げた ときに ふちが きれい）
     ・髪の 骨の 列     … 髪 1房に、根もとから 毛先まで 骨を いくつも つなげる（ゆれる 骨） */
import { setupPose, rebind, addBoneAt, SOFT } from './hone.js?v=434';
import { M, autoWeights } from './core.js?v=434';
import { S } from '../state.js?v=434';

/* ---------- パーツの 絵 → 組み立ての 場所 の 行列（あみの 3点から 出す） ---------- */
export function placeOf(s){
  const v = s.verts;
  if(!v || v.length < 3) return null;
  const a = v[0];
  let b = null, c = null;
  for(const q of v){ if(!b && (q.u !== a.u || q.v !== a.v)) b = q; }
  if(!b) return null;
  for(const q of v){
    const cr = (b.u - a.u) * (q.v - a.v) - (b.v - a.v) * (q.u - a.u);
    if(Math.abs(cr) > 1e-6){ c = q; break; }
  }
  if(!c) return null;
  const du1 = b.u - a.u, dv1 = b.v - a.v, du2 = c.u - a.u, dv2 = c.v - a.v;
  const det = du1 * dv2 - du2 * dv1;
  const ma = ((b.x - a.x) * dv2 - (c.x - a.x) * dv1) / det, mc = ((c.x - a.x) * du1 - (b.x - a.x) * du2) / det;
  const mb = ((b.y - a.y) * dv2 - (c.y - a.y) * dv1) / det, md = ((c.y - a.y) * du1 - (b.y - a.y) * du2) / det;
  return { a: ma, b: mb, c: mc, d: md, tx: a.x - ma * a.u - mc * a.v, ty: a.y - mb * a.u - md * a.v };
}

/* ---------- 三角に わける（Bowyer–Watson） ---------- */
function delaunay(pts){
  const n = pts.length;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  const d = Math.max(x1 - x0, y1 - y0) * 20 + 10, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = pts.concat([[cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]]);
  const circ = (a, b, c) => {
    const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], cx2 = P[c][0], cy2 = P[c][1];
    const D = 2 * (ax * (by - cy2) + bx * (cy2 - ay) + cx2 * (ay - by));
    if(Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
    const ux = ((ax * ax + ay * ay) * (by - cy2) + (bx * bx + by * by) * (cy2 - ay) + (cx2 * cx2 + cy2 * cy2) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx2 - bx) + (bx * bx + by * by) * (ax - cx2) + (cx2 * cx2 + cy2 * cy2) * (bx - ax)) / D;
    return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [{ a: n, b: n + 1, c: n + 2, ...circ(n, n + 1, n + 2) }];
  for(let i = 0; i < n; i++){
    const px = P[i][0], py = P[i][1];
    const bad = [], keep = [];
    for(const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 ? bad : keep).push(t);
    const edges = new Map();
    for(const t of bad) for(const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]){
      const k = u < v ? u + ',' + v : v + ',' + u;
      edges.set(k, edges.has(k) ? null : [u, v]);
    }
    tris = keep;
    for(const e of edges.values()) if(e) tris.push({ a: e[0], b: e[1], c: i, ...circ(e[0], e[1], i) });
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
}

/**
 * 形に そった あみ。img … パーツの 絵、place … 絵 → 組み立ての 場所、cell … 点の 間かく（組み立ての 大きさ）
 * 戻り値 { verts:[{x,y,u,v,w}], tris:[...] }（buildGridMesh と 同じ 形）。絵が 読めなければ null
 */
export function contourMesh(img, place, cell){
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if(!W || !H) return null;
  const sc = Math.hypot(place.a, place.b) || 1;            // 絵の 1px が 組み立てで いくつ
  const step = Math.max(4, cell / sc);                        // 絵の px での 間かく
  /* 小さく して 中か 外か を 見る（ふちが 欠けない よう 少し ふくらませる） */
  const k = Math.min(1, 160 / Math.max(W, H)), w = Math.max(2, Math.round(W * k)), h = Math.max(2, Math.round(H * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const raw = new Uint8Array(w * h);
  for(let i = 0; i < w * h; i++) raw[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  const m = new Uint8Array(w * h);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    let o = 0;
    for(let dy = -1; dy <= 1 && !o; dy++) for(let dx = -1; dx <= 1 && !o; dx++){
      const X = x + dx, Y = y + dy;
      if(X >= 0 && Y >= 0 && X < w && Y < h && raw[Y * w + X]) o = 1;
    }
    m[y * w + x] = o;
  }
  const inside = (u, v) => { const x = Math.floor(u * k), y = Math.floor(v * k); return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1; };
  /* ふちの 点（中の 点で、となりに 外が ある もの）を 間かくを あけて ひろう */
  const pts = [];
  const far = (u, v, r) => pts.every(p => (p[0] - u) ** 2 + (p[1] - v) ** 2 >= r * r);
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    if(!m[y * w + x]) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[y * w + x - 1] || !m[y * w + x + 1] || !m[(y - 1) * w + x] || !m[(y + 1) * w + x];
    if(!edge) continue;
    /* 外がわの かどに よせる（絵の px に もどす） */
    const u = Math.min(W, Math.max(0, (x + (x === w - 1 || !m[y * w + x + 1] ? 1 : 0)) / k));
    const v = Math.min(H, Math.max(0, (y + (y === h - 1 || !m[(y + 1) * w + x] ? 1 : 0)) / k));
    if(far(u, v, step * 0.55)) pts.push([u, v]);
  }
  const nEdge = pts.length;
  if(nEdge < 3) return null;
  /* 中の 点（ます目に まく。ふちの 点に 近すぎる ものは のぞく） */
  for(let v = step / 2; v < H; v += step) for(let u = step / 2; u < W; u += step){
    if(inside(u, v) && far(u, v, step * 0.5)) pts.push([u, v]);
  }
  if(pts.length > 900) pts.length = 900;
  /* 三角に わけて、まん中が 絵の 外の ものを すてる */
  const tri = delaunay(pts).filter(([a, b, c]) => {
    const A = pts[a], B = pts[b], C = pts[c];
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]));
    if(area < 1e-3) return false;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ok = (p) => inside(p[0], p[1]) || inside(p[0] - 1 / k, p[1]) || inside(p[0], p[1] - 1 / k);
    return ok([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3]) && ok(mid(A, B)) && ok(mid(B, C)) && ok(mid(C, A));
  });
  if(!tri.length) return null;
  /* つかわれて いる 点だけ のこす */
  const used = new Map(), verts = [], tris = [];
  const idx = (i) => {
    if(used.has(i)) return used.get(i);
    const [u, v] = pts[i], p = M.apply(place, u, v);
    verts.push({ x: p.x, y: p.y, u, v, w: [] });
    used.set(i, verts.length - 1);
    return verts.length - 1;
  };
  tri.forEach(([a, b, c]) => tris.push(idx(a), idx(b), idx(c)));
  return { verts, tris };
}

/** パーツの あみを 形に そった ものに する。つき方（ウェイト）は 近くの 骨で 計算しなおす */
export function fitMesh(l, s, cell){
  const img = S.imgs[s.asset];
  const place = placeOf(s);
  if(!img || !place) return false;
  const sp = Math.hypot(place.a, place.b);
  const W = (img.naturalWidth || img.width) * sp, H = (img.naturalHeight || img.height) * sp;
  const mesh = contourMesh(img, place, cell || Math.max(10, Math.min(60, Math.max(W, H) / 14)));
  if(!mesh) return false;
  const keep = s.verts.length ? (s.verts[0].w || []) : [];
  mesh.verts.forEach(v => { v.w = keep.length ? keep.map(x => ({ ...x })) : [{ b: s.bone, w: 1 }]; });
  s.verts = mesh.verts; s.tris = mesh.tris;
  return true;
}

/* ---------- 💇 髪の 骨の 列 ---------- */
export const HAIR_RX = /髪|かみ|hair|ヘア|もみあげ|アホ毛|あほ毛|おさげ|ツイン|ポニー|前髪|後ろ髪|横髪/i;

/**
 * 髪 1房（パーツ s）に 骨の 列を 作る。
 * 根もと … 親の 骨に いちばん 近い はし。毛先 … いちばん 遠い はし。
 * 房の 形に そって（まん中を 通る ように）n 本の 骨を つなげ、ゆれる 骨に する。
 * 戻り値 … 作った 骨の 数
 */
export function hairChain(l, s, parentId){
  const h = l.hone;
  const sp = setupPose(h);
  const par = h.bones.find(b => b.id === parentId) || h.bones[0];
  const pw = sp[par.id] ? sp[par.id].world : M.ident();
  const ptip = M.apply(pw, par.len || 0, 0);
  const V = s.verts;
  if(!V || V.length < 3) return 0;
  /* 房の 向き（いちばん 長い 方向） */
  let mx = 0, my = 0; V.forEach(v => { mx += v.x; my += v.y; }); mx /= V.length; my /= V.length;
  let sxx = 0, syy = 0, sxy = 0;
  V.forEach(v => { const dx = v.x - mx, dy = v.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ax = Math.cos(ang), ay = Math.sin(ang);
  let lo = 1e9, hi = -1e9;
  V.forEach(v => { const t = (v.x - mx) * ax + (v.y - my) * ay; lo = Math.min(lo, t); hi = Math.max(hi, t); });
  /* 根もとは 親の 骨（頭）に 近い ほう */
  const eA = { x: mx + ax * lo, y: my + ay * lo }, eB = { x: mx + ax * hi, y: my + ay * hi };
  const near = (p) => Math.min(Math.hypot(p.x - pw.tx, p.y - pw.ty), Math.hypot(p.x - ptip.x, p.y - ptip.y));
  if(near(eB) < near(eA)){ ax = -ax; ay = -ay; const t = -lo; lo = -hi; hi = t; }
  const len = hi - lo;
  if(len < 4) return 0;
  const n = Math.max(2, Math.min(6, Math.round(len / 45)));
  /* 輪切りに して、それぞれの まん中を とおる 点を ならべる（曲がった 房に そう） */
  const pts = [];
  for(let i = 0; i <= n; i++){
    const t = lo + len * (i === 0 ? 0.03 : i === n ? 0.97 : i / n);
    const band = len / n * 0.6;
    let cx = 0, cy = 0, c = 0;
    V.forEach(v => {
      const tv = (v.x - mx) * ax + (v.y - my) * ay;
      if(Math.abs(tv - t) <= band){ cx += v.x; cy += v.y; c++; }
    });
    const base = { x: mx + ax * t, y: my + ay * t };
    if(c){
      /* よこの ずれ だけ まん中に よせる（長さの 向きは そのまま） */
      const ox = cx / c - base.x, oy = cy / c - base.y, along = ox * ax + oy * ay;
      pts.push({ x: base.x + ox - ax * along, y: base.y + oy - ay * along });
    } else pts.push(base);
  }
  /* 骨を つなげる。先へ いくほど やわらかく */
  const ids = [];
  let parent = par.id;
  for(let i = 0; i < n; i++){
    const b = addBoneAt(l, parent, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    b.name = s.name + (n > 1 ? (i + 1) : '');
    b.spring = true;
    Object.assign(b, SOFT.hair, {
      stiff: +(SOFT.hair.stiff * (1 - 0.12 * i)).toFixed(3),
      limit: Math.round(SOFT.hair.limit + 6 * i)
    });
    ids.push(b.id);
    parent = b.id;
  }
  /* 房は 列の 骨（と 根もとの 親）に だけ つける */
  s.bone = ids[0];
  autoWeights(h, s, setupPose(h), { only: [par.id, ...ids], maxBones: 2, falloff: 2.5 });
  /* 根もとの すぐ そばは 親に しっかり つける（頭から はがれない） */
  const root0 = pts[0];
  s.verts.forEach(v => {
    const t = ((v.x - root0.x) * ax + (v.y - root0.y) * ay) / len;
    if(t < 0.04) v.w = [{ b: par.id, w: 1 }];
  });
  rebind(l);
  return n;
}
