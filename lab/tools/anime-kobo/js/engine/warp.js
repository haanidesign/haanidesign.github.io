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
  return { w, h, cols: c, rows: r, pts };
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
  const dx = x - p.x, dy = y - p.y;
  const s = Math.max(0, soft || 0);

  if(s < 0.01){ p.x = x; p.y = y; return; }

  // つまんだ 目からの「あみの目 いくつぶん」で きめる
  const ci = index % (cols + 1), cj = (index / (cols + 1)) | 0;
  for(let j = 0; j <= rows; j++){
    for(let i = 0; i <= cols; i++){
      const d = Math.hypot(i - ci, j - cj) / s;
      if(d >= 1) continue;
      // なめらかに 小さく なる（まん中 1 → はし 0）
      const w = (1 - d * d) * (1 - d * d);
      const q = pts[idxAt(cage, i, j)];
      q.x += dx * w;
      q.y += dy * w;
    }
  }
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
