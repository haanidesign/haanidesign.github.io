/* ゆがみ と 自由変形。

   絵の上に「あみの目（かご）」を かぶせて、その 角を 動かす。
   絵は かごに ついてくるので、引っぱった とおりに ゆがむ。

     ゆがみ   … あみの目を 1つずつ つまんで 動かす
                （近くの 目も すこし ついてくる ように できる）
     自由変形 … 四すみだけ 動かす。中は 自動で ついてくる
                （まっすぐな 線は まっすぐの まま、
                  おくゆき が ある ように 見える）

   パペットピン（骨）が「うごかす」ための ものなのに対して、
   こちらは「形を ととのえる」ための もの。

   もっている 数は 絵の中の ドット（左上が 0,0）。
   だから レイヤーを 動かしても 大きさを 変えても そのまま つかえる。 */

import { setPin, warpChX, warpChY, isWarpCh } from './anim.js?v=103';

/** かごを 作る（たて・よこ に きった あみの目） */
export function newCage(w, h, cols, rows){
  const c = Math.max(1, Math.min(12, cols || 3));
  const r = Math.max(1, Math.min(12, rows || 3));
  const pts = [];
  for(let j = 0; j <= r; j++){
    for(let i = 0; i <= c; i++){
      pts.push({ x: w * i / c, y: h * j / r });
    }
  }
  return { w, h, cols: c, rows: r, pts, lock: [] };
}

/** さわって いないか（まだ まっさら か） */
export function cageFlat(cage){
  if(!cage) return true;
  const { w, h, cols, rows, pts } = cage;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const p = pts[j * (cols + 1) + i];
      if(Math.abs(p.x - w * i / cols) > 0.01) return false;
      if(Math.abs(p.y - h * j / rows) > 0.01) return false;
    }
  }
  return true;
}

/** もとの あみの目の 場所（絵の中の ドット） */
export const restAt = (cage, i, j) => ({
  x: cage.w * i / cage.cols,
  y: cage.h * j / cage.rows
});

/** あみの目の ばんごう */
export const idxAt = (cage, i, j) => j * (cage.cols + 1) + i;

/* ---------- 描くための あみ ---------- */
/**
 * かごから「絵を はる ための あみ」を 作る。
 *   verts … もとの 場所（＝絵の どこを はるか）
 *   tris  … 三角の つなぎ方
 * 動いた あとの 場所は cageXY で 出す。
 */
export function cageMesh(cage){
  const { cols, rows } = cage;
  const verts = [], tris = [];
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const p = restAt(cage, i, j);
      verts.push({ u: p.x, v: p.y });
    }
  }
  for(let j = 0; j < rows; j++){
    for(let i = 0; i < cols; i++){
      const a = idxAt(cage, i, j), b = idxAt(cage, i + 1, j);
      const c = idxAt(cage, i + 1, j + 1), d = idxAt(cage, i, j + 1);
      tris.push(a, b, c, a, c, d);
    }
  }
  return { verts, tris };
}

/** 動いた あとの 場所を ならべる */
export function cageXY(cage, out){
  const n = cage.pts.length;
  const a = (out && out.length >= n * 2) ? out : new Float32Array(n * 2);
  for(let i = 0; i < n; i++){
    a[i * 2] = cage.pts[i].x;
    a[i * 2 + 1] = cage.pts[i].y;
  }
  return a;
}

/* ---------- ゆがみ（1つ つまんで 動かす） ---------- */
/**
 * あみの目を 1つ 動かす。
 *   soft … 0 なら その目だけ。大きいほど 近くの目も ついてくる
 *          （やわらかい ねんど を 押した ような 感じ）
 */
export function movePoint(cage, index, x, y, soft){
  const { cols, rows, pts } = cage;
  const p = pts[index];
  if(!p) return;
  const lock = cage.lock || [];
  const dx = x - p.x, dy = y - p.y;
  const s = Math.max(0, soft || 0);

  /* ---------- なぞって かためた ところを つまんだ とき ----------
     かためた ところは「1つの かたまり」。
     中は 形を たもった まま、まるごと 持ち上がる。
     まわりの あみの目は、かたまりに 近いほど ついてくるので、
     ゴムのように のびて つながる。 */
  if(lock[index]){
    // ① かたまりは そっくり そのまま 動かす
    const inLock = [];
    for(let j = 0; j <= rows; j++){
      for(let i = 0; i <= cols; i++){
        const k = idxAt(cage, i, j);
        if(!lock[k]) continue;
        inLock.push({ i, j });
        pts[k].x += dx;
        pts[k].y += dy;
      }
    }
    // ② まわりは かたまりからの 近さで ついてくる
    if(s >= 0.01){
      for(let j = 0; j <= rows; j++){
        for(let i = 0; i <= cols; i++){
          const k = idxAt(cage, i, j);
          if(lock[k]) continue;
          let near = Infinity;
          for(const q of inLock){
            const d = Math.hypot(i - q.i, j - q.j);
            if(d < near) near = d;
          }
          const d = near / s;
          if(d >= 1) continue;
          const w = (1 - d * d) * (1 - d * d);
          pts[k].x += dx * w;
          pts[k].y += dy * w;
        }
      }
    }
    return;
  }

  /* ---------- ふつうの あみの目を つまんだ とき ----------
     かためた ところは 動かさない（そこは 形を まもりたい ところ）。 */
  if(s < 0.01){ p.x = x; p.y = y; return; }

  // つまんだ 目からの「あみの目 いくつぶん」で きめる
  const ci = index % (cols + 1), cj = (index / (cols + 1)) | 0;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const d = Math.hypot(i - ci, j - cj) / s;
      if(d >= 1) continue;
      const k = idxAt(cage, i, j);
      if(lock[k]) continue;                  // かためた ところは そのまま
      // なめらかに 小さく なる（まん中 1 → はし 0）
      const w = (1 - d * d) * (1 - d * d);
      const q = pts[k];
      q.x += dx * w;
      q.y += dy * w;
    }
  }
}

/**
 * かたまりを まるごと まわす・大きさを 変える・ずらす。
 * （2本指で くいっと やる ときに つかう）
 *
 *   rot  … まわす 角（ラジアン）
 *   k    … 大きさ の ばい
 *   dx dy… ずらす ぶん
 * まわりの あみの目は、かたまりに 近いほど ついてくる。
 */
export function transformLock(cage, rot, k, dx, dy, soft){
  const { cols, rows, pts } = cage;
  const lock = cage.lock || [];
  const inLock = [];
  let sx = 0, sy = 0;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const n = idxAt(cage, i, j);
      if(!lock[n]) continue;
      inLock.push({ i, j, n });
      sx += pts[n].x; sy += pts[n].y;
    }
  }
  if(!inLock.length) return false;

  // かたまりの まん中を 軸に する（そこで くるっと まわる）
  const cx = sx / inLock.length, cy = sy / inLock.length;
  const c = Math.cos(rot), si = Math.sin(rot);
  const kk = Math.max(0.05, Math.min(20, k || 1));
  /** その 点が 行く さき */
  const to = (p) => {
    const x = p.x - cx, y = p.y - cy;
    return { x: cx + (x * c - y * si) * kk + dx, y: cy + (x * si + y * c) * kk + dy };
  };

  const s = Math.max(0, soft || 0);
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const n = idxAt(cage, i, j);
      const p = pts[n];
      const q = to(p);
      if(lock[n]){ p.x = q.x; p.y = q.y; continue; }   // かたまりは そのまま
      if(s < 0.01) continue;
      // まわりは 近いほど ついてくる
      let near = Infinity;
      for(const g of inLock){
        const d = Math.hypot(i - g.i, j - g.j);
        if(d < near) near = d;
      }
      const d = near / s;
      if(d >= 1) continue;
      const w = (1 - d * d) * (1 - d * d);
      p.x += (q.x - p.x) * w;
      p.y += (q.y - p.y) * w;
    }
  }
  return true;
}

/** かごの 形を まるごと 写す（2本指の とちゅうで つかう） */
export const copyPts = (cage) => cage.pts.map(p => ({ x: p.x, y: p.y }));
export function setPts(cage, list){
  if(!list) return;
  cage.pts.forEach((p, i) => { if(list[i]){ p.x = list[i].x; p.y = list[i].y; } });
}

/* ---------- 自由変形（四すみ） ---------- */
/** いまの 四すみ（左上・右上・右下・左下） */
export function quadOf(cage){
  const { cols, rows, pts } = cage;
  return [
    pts[idxAt(cage, 0, 0)],
    pts[idxAt(cage, cols, 0)],
    pts[idxAt(cage, cols, rows)],
    pts[idxAt(cage, 0, rows)]
  ].map(p => ({ x: p.x, y: p.y }));
}

/**
 * 四すみの 場所から、中の あみの目を ぜんぶ 出しなおす。
 *
 * ただ まっすぐ 分ける（バイリニア）と、ななめから 見た ときに
 * ゆがみ方が おかしく なる。写真を かたむけた ときと 同じ
 * 「おくゆき つき」の 出し方（ホモグラフィ）を つかう。
 * こうすると まっすぐな 線は まっすぐの まま。
 */
export function setQuad(cage, quad){
  const H = homography(
    [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}],
    quad
  );
  if(!H) return false;
  const { cols, rows, pts } = cage;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const p = applyH(H, i / cols, j / rows);
      const q = pts[idxAt(cage, i, j)];
      q.x = p.x; q.y = p.y;
    }
  }
  return true;
}

/** 3x3 の 行列を あてはめる */
function applyH(H, u, v){
  const w = H[6] * u + H[7] * v + 1;
  return {
    x: (H[0] * u + H[1] * v + H[2]) / w,
    y: (H[3] * u + H[4] * v + H[5]) / w
  };
}

/**
 * 四すみ → 四すみ の 変換を 出す。
 * 8つの わからない数を、8本の 式から 解く（ガウスの 消去法）。
 */
export function homography(src, dst){
  const A = [], b = [];
  for(let i = 0; i < 4; i++){
    const { x: u, y: v } = src[i];
    const { x, y } = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  // 前から 順に 消していく
  for(let c = 0; c < 8; c++){
    let piv = c;
    for(let r = c + 1; r < 8; r++) if(Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if(Math.abs(A[piv][c]) < 1e-12) return null;      // つぶれて いて 解けない
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for(let r = 0; r < 8; r++){
      if(r === c) continue;
      const k = A[r][c] / A[c][c];
      if(!k) continue;
      for(let cc = c; cc < 8; cc++) A[r][cc] -= k * A[c][cc];
      b[r] -= k * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

/** ぜんぶ もとに もどす */
export function resetCage(cage){
  const { cols, rows, pts } = cage;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const p = restAt(cage, i, j);
      const q = pts[idxAt(cage, i, j)];
      q.x = p.x; q.y = p.y;
    }
  }
}


/* ---------- 絵の中の 1点が かごで どこへ 行くか ----------
   骨（パペットピン）と いっしょに つかう ために いる。

   あみの目の 1ますの 中は、四すみを たてよこに 混ぜて 出す
   （バイリニア）。ますの 中では まっすぐな ので、
   ますを こまかく すれば なめらかに なる。 */
export function cagePoint(cage, x, y){
  if(!cage) return { x, y };
  const { w, h, cols, rows, pts } = cage;
  const u = Math.max(0, Math.min(1, x / (w || 1))) * cols;
  const v = Math.max(0, Math.min(1, y / (h || 1))) * rows;
  const i = Math.max(0, Math.min(cols - 1, Math.floor(u)));
  const j = Math.max(0, Math.min(rows - 1, Math.floor(v)));
  const s = u - i, t = v - j;
  const a = pts[idxAt(cage, i, j)],     b = pts[idxAt(cage, i + 1, j)];
  const c = pts[idxAt(cage, i + 1, j + 1)], d = pts[idxAt(cage, i, j + 1)];
  return {
    x: (a.x * (1 - s) + b.x * s) * (1 - t) + (d.x * (1 - s) + c.x * s) * t,
    y: (a.y * (1 - s) + b.y * s) * (1 - t) + (d.y * (1 - s) + c.y * s) * t
  };
}

/** 点が 四角の 中に あるか */
function inQuad(px, py, q){
  let inside = false;
  for(let i = 0, j = 3; i < 4; j = i++){
    const xi = q[i].x, yi = q[i].y, xj = q[j].x, yj = q[j].y;
    if(((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/**
 * ゆがんだ ところの 点 → もとの 絵の中の 点（逆びき）。
 *
 * 絵の上を 指で さわった とき、その 下に ある もとの 絵の
 * どこ なのかを 知る ために つかう（ピンを さす ときなど）。
 *
 * ますを 1つずつ 見て、その 中に あるかを しらべ、
 * 中の 場所は くり返し 近づけて 出す（ニュートン法）。
 * 見つからない ときは いちばん 近い ますで 出す。
 */
export function cageInverse(cage, x, y){
  if(!cage) return { x, y };
  const { w, h, cols, rows, pts } = cage;

  const solve = (i, j) => {
    const a = pts[idxAt(cage, i, j)],         b = pts[idxAt(cage, i + 1, j)];
    const c = pts[idxAt(cage, i + 1, j + 1)], d = pts[idxAt(cage, i, j + 1)];
    let s = 0.5, t = 0.5;
    for(let k = 0; k < 12; k++){
      // いまの (s,t) が どこに なるか
      const px = (a.x * (1 - s) + b.x * s) * (1 - t) + (d.x * (1 - s) + c.x * s) * t;
      const py = (a.y * (1 - s) + b.y * s) * (1 - t) + (d.y * (1 - s) + c.y * s) * t;
      const ex = x - px, ey = y - py;
      if(Math.abs(ex) < 1e-4 && Math.abs(ey) < 1e-4) break;
      // s・t を 少し 動かすと どれだけ ずれるか
      const dsx = (b.x - a.x) * (1 - t) + (c.x - d.x) * t;
      const dsy = (b.y - a.y) * (1 - t) + (c.y - d.y) * t;
      const dtx = (d.x - a.x) * (1 - s) + (c.x - b.x) * s;
      const dty = (d.y - a.y) * (1 - s) + (c.y - b.y) * s;
      const det = dsx * dty - dsy * dtx;
      if(Math.abs(det) < 1e-9) break;
      s += ( dty * ex - dtx * ey) / det;
      t += (-dsy * ex + dsx * ey) / det;
      s = Math.max(-0.2, Math.min(1.2, s));
      t = Math.max(-0.2, Math.min(1.2, t));
    }
    return { s, t };
  };

  // ① 中に ある ますを さがす
  for(let j = 0; j < rows; j++){
    for(let i = 0; i < cols; i++){
      const q = [pts[idxAt(cage, i, j)], pts[idxAt(cage, i + 1, j)],
                 pts[idxAt(cage, i + 1, j + 1)], pts[idxAt(cage, i, j + 1)]];
      if(!inQuad(x, y, q)) continue;
      const { s, t } = solve(i, j);
      return { x: w * (i + s) / cols, y: h * (j + t) / rows };
    }
  }

  // ② はみ出して いたら、いちばん 近い ますで
  let bi = 0, bj = 0, bd = Infinity;
  for(let j = 0; j < rows; j++){
    for(let i = 0; i < cols; i++){
      const a = pts[idxAt(cage, i, j)], c = pts[idxAt(cage, i + 1, j + 1)];
      const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if(d < bd){ bd = d; bi = i; bj = j; }
    }
  }
  const { s, t } = solve(bi, bj);
  return { x: w * (bi + s) / cols, y: h * (bj + t) / rows };
}


/* ---------- 時間で ゆがみを 変える ----------
   あみの目 1つ1つに ピンを うつ。
   そうすると「1秒めは こう、3秒めは こう」と
   形が だんだん 変わって いく。 */

/** その レイヤーに ゆがみの ピンが うってあるか */
export function cageHasKeys(l){
  const tr = l.tracks || {};
  return Object.keys(tr).some(c => isWarpCh(c) && (tr[c] || []).length);
}

/**
 * いまの かごの 形を、その 時こくの ピンに する。
 *   only … 番号の ならびを わたすと、その あみの目 だけ
 * 戻り値 … うった ピンの 数
 */
export function cageKeys(l, time, only){
  if(!l.cage) return 0;
  const list = only || l.cage.pts.map((_, i) => i);
  let n = 0;
  for(const i of list){
    const p = l.cage.pts[i];
    if(!p) continue;
    setPin(l, warpChX(i), time, p.x, 'smooth');
    setPin(l, warpChY(i), time, p.y, 'smooth');
    n += 2;
  }
  return n;
}

/** ゆがみの ピンを ぜんぶ けす */
export function clearCageKeys(l){
  const tr = l.tracks || {};
  let n = 0;
  Object.keys(tr).forEach(c => { if(isWarpCh(c)){ delete tr[c]; n++; } });
  return n;
}

/** かごの 形を、その 時こくの 見た目に あわせる（ピンから 読む） */
export function cageToTime(l, pts){
  if(!l.cage || !pts) return;
  l.cage.pts.forEach((p, i) => {
    if(!pts[i]) return;
    p.x = pts[i].x; p.y = pts[i].y;
  });
}


/* ---------- 筆で なぞって かためる ----------
   ゆがめたく ない ところを 筆で ぬる。
   ぬった ところの あみの目は 動かなく なるので、
   そのまわりを 引っぱっても かたちが くずれない。
   （顔は そのままで かみだけ ゆらす、など） */

/** 筆の あたった あみの目を かためる／とかす。
 *   x, y   … 絵の中の ざひょう（筆の まん中）
 *   r      … 筆の 太さ（絵の中の ドット）
 *   on     … true かためる / false とかす
 * 戻り値 … 変わった 目の 数 */
export function paintLock(cage, x, y, r, on){
  if(!cage) return 0;
  cage.lock = cage.lock || [];
  const rr = r * r;
  let n = 0;
  cage.pts.forEach((p, i) => {
    const dx = p.x - x, dy = p.y - y;
    if(dx * dx + dy * dy > rr) return;
    if(!!cage.lock[i] === !!on) return;
    cage.lock[i] = !!on;
    n++;
  });
  return n;
}

/** かためた 目が 1つでも あるか */
export const hasLock = (cage) => !!(cage && (cage.lock || []).some(Boolean));

/** かためたのを ぜんぶ とかす */
export function clearLock(cage){
  if(cage) cage.lock = [];
}


/**
 * 絵の中の 1点が かごで どこへ 行くか＋そこの かたむきの 変わりぶん。
 *
 * 親レイヤーを ゆがめた とき、くっついて いる 子（手・小物）を
 * いっしょに 動かす ために つかう。
 * かたむきは、すぐ となりの 点が どこへ 行くかを 見て 出す。
 *
 * 戻り値 … { x, y, rot }（rot は 度）
 */
export function cageDeformPoint(cage, x, y){
  const a = cagePoint(cage, x, y);
  const e = Math.max(1, Math.min(cage.w, cage.h) * 0.02);   // となりを 見る きょり
  const b = cagePoint(cage, x + e, y);
  const rot = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return { x: a.x, y: a.y, rot };
}

/** かごが さわられて いるか（点が もとの ところに ある か） */
export function cageMoved(cage, pts){
  if(!cage) return false;
  const list = pts || cage.pts;
  const { w, h, cols, rows } = cage;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const p = list[idxAt(cage, i, j)];
      if(!p) continue;
      if(Math.abs(p.x - w * i / cols) > 0.01) return true;
      if(Math.abs(p.y - h * j / rows) > 0.01) return true;
    }
  }
  return false;
}
