/* コマ割り。
   コマの 大きさ（大・中・小・横長…）から、段（よこの 列）に 分けて 線を 引く。
   日本の マンガと 同じく、段の 中は 右から 左へ ならぶ。

   ・大・横長・1ページ・〇% … その コマだけで 1段
   ・中 … 1段に 2つまで
   ・小 … 1段に 3つまで
   たね（seed）で 幅や 傾きが 少しずつ ゆれる。 */

export const PW = 364, PH = 515;
export const M = { top: 34, bottom: 40, outer: 30, inner: 24 };
const ROW_GAP = 12, COL_GAP = 7;

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function bbox(poly) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* ページの 基本枠。side は 'R'（右ページ）か 'L'（左ページ） */
export function frameOf(side, x0 = 0) {
  const left = side === 'R' ? M.inner : M.outer, right = side === 'R' ? M.outer : M.inner;
  return { x: x0 + left, y: M.top, w: PW - left - right, h: PH - M.top - M.bottom };
}
export function spreadFrame() {
  return { x: M.outer, y: M.top, w: PW * 2 - M.outer * 2, h: PH - M.top - M.bottom };
}

const UNIT = { mid: .5, small: 1 / 3 };
const solo = p => !(p.size in UNIT);

function rowsOf(panels) {
  const rows = [];
  let cur = null, used = 0;
  panels.forEach((p, i) => {
    if (solo(p)) { rows.push({ items: [i] }); cur = null; return; }
    const u = UNIT[p.size];
    if (!cur || used + u > 1.001) { cur = { items: [] }; rows.push(cur); used = 0; }
    cur.items.push(i); used += u;
  });
  return rows;
}
function rowWeight(row, panels) {
  let w = 0;
  for (const i of row.items) {
    const p = panels[i];
    w = Math.max(w, { big: 2.1, wide: 1.0, page: 5, full: 5, mid: 1.35, small: 1.0 }[p.size] || 1.2);
  }
  return w;
}

/* ふつうの ページ。もどり値は panels と 同じ ならびの [{poly,bb}] */
export function layoutPanels(panels, F, seed, tilt) {
  const rnd = mulberry(seed || 1);
  const jit = (a) => (rnd() * 2 - 1) * a;
  const rows = rowsOf(panels);
  if (!rows.length) return [];
  const avail = F.h - ROW_GAP * (rows.length - 1);
  // 段の 高さ
  let fixed = 0, wsum = 0;
  rows.forEach(r => {
    const p = panels[r.items[0]];
    if (r.items.length === 1 && p.size === 'frac') { r.h = avail * p.frac; fixed += r.h; }
    else { r.w = rowWeight(r, panels) * (1 + jit(.12)); wsum += r.w; }
  });
  const rest = Math.max(avail * .12, avail - fixed);
  rows.forEach(r => { if (r.h == null) r.h = rest * r.w / wsum; });
  // 合わなければ 全体を ちぢめる
  const tot = rows.reduce((a, r) => a + r.h, 0);
  if (tot > avail) rows.forEach(r => { r.h *= avail / tot; });
  // 段の さかいめ（左はしと 右はしの y）
  const T = (tilt || 0) / 100;
  const lines = [];        // lines[k] = 段k の 上の 線 {yl, yr}
  let y = F.y;
  rows.forEach((r, k) => {
    if (k === 0) lines.push({ yl: F.y, yr: F.y });
    y += r.h + (k < rows.length - 1 ? ROW_GAP : 0);
    const d = k < rows.length - 1 && rnd() < .55 ? jit(26 * T) : 0;
    const mid = y - ROW_GAP / 2;
    lines.push({ yl: mid - d, yr: mid + d });
  });
  lines[lines.length - 1] = { yl: F.y + F.h + ROW_GAP / 2, yr: F.y + F.h + ROW_GAP / 2 };
  lines[0] = { yl: F.y - ROW_GAP / 2, yr: F.y - ROW_GAP / 2 };
  const yAt = (ln, x) => ln.yl + (ln.yr - ln.yl) * (x - F.x) / F.w;

  const out = new Array(panels.length);
  rows.forEach((r, k) => {
    const top = lines[k], bot = lines[k + 1];
    const n = r.items.length;
    // 幅（右から 左）
    let ws = r.items.map(i => (UNIT[panels[i].size] || 1) * (1 + jit(.14)));
    const s = ws.reduce((a, b) => a + b, 0);
    ws = ws.map(w => w / s);
    // たての さかいめ（上と 下の x）
    const cuts = [];
    let acc = 0;
    for (let j = 0; j < n - 1; j++) {
      acc += ws[j];
      const x = F.x + F.w * (1 - acc);
      const d = rnd() < .5 ? jit(18 * T) : 0;
      cuts.push({ xt: x + d, xb: x - d });
    }
    const edges = [{ xt: F.x + F.w + COL_GAP / 2, xb: F.x + F.w + COL_GAP / 2 }, ...cuts, { xt: F.x - COL_GAP / 2, xb: F.x - COL_GAP / 2 }];
    r.items.forEach((pi, j) => {
      const R = edges[j], L = edges[j + 1];
      const xr_t = R.xt - COL_GAP / 2, xr_b = R.xb - COL_GAP / 2;
      const xl_t = L.xt + COL_GAP / 2, xl_b = L.xb + COL_GAP / 2;
      const poly = [
        [xl_t, yAt(top, xl_t) + ROW_GAP / 2],
        [xr_t, yAt(top, xr_t) + ROW_GAP / 2],
        [xr_b, yAt(bot, xr_b) - ROW_GAP / 2],
        [xl_b, yAt(bot, xl_b) - ROW_GAP / 2],
      ];
      out[pi] = { poly, bb: bbox(poly) };
    });
  });
  return out;
}

/* 見開き。大ゴマが 2ページ ぶち ぬき、のこりは すみの 小ゴマ。
   すみの 指定が ない ときは 右上→左下→左上→右下 の 順に おく */
export function layoutSpread(panels, seed, tilt) {
  const F = spreadFrame();
  const out = new Array(panels.length);
  const mains = [], rest = [];
  panels.forEach((p, i) => (p.size === 'full' && !p.inset ? mains : rest).push(i));
  if (!mains.length && rest.length) mains.push(rest.shift());
  // 大ゴマが 2つ 以上 なら 上下に 分ける
  const sub = layoutPanels(mains.map(() => ({ size: 'wide' })), F, seed, tilt);
  mains.forEach((pi, k) => { out[pi] = sub[k]; });
  const order = ['tr', 'bl', 'tl', 'br'];
  const taken = new Set(rest.map(i => panels[i].inset).filter(Boolean));
  const w = PW * .36, h = PH * .23, pad = 10;
  rest.forEach(i => {
    let c = panels[i].inset;
    if (!c) { c = order.find(o => !taken.has(o)) || 'tr'; taken.add(c); }
    const x = c[1] === 'r' ? F.x + F.w - pad - w : F.x + pad;
    const y = c[0] === 't' ? F.y + pad : F.y + F.h - pad - h;
    const poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    out[i] = { poly, bb: bbox(poly), inset: true };
  });
  return out;
}
