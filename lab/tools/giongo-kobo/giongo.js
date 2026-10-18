// 擬音工房。打った 字を 通り道に そって 並べ、フチ・塗り・影を つけて 書き出す。
import { watchRanges } from '../oekaki-kobo/js/rslider.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const W = 1000; // 作業場の 大きさ（世界の 単位）

/* ---------- 書体 ---------- */
const FONTS = [
  { id: 'dela', row: 'ゴシック', fam: 'Dela Gothic One', w: 400 },
  { id: 'zenkaku', row: 'ゴシック', fam: 'Zen Kaku Gothic New', w: 900 },
  { id: 'rocknroll', row: 'ゴシック', fam: 'RocknRoll One', w: 400 },
  { id: 'train', row: 'ゴシック', fam: 'Train One', w: 400 },
  { id: 'zenmaru', row: '丸ゴシック', fam: 'Zen Maru Gothic', w: 900 },
  { id: 'mplus', row: '丸ゴシック', fam: 'M PLUS Rounded 1c', w: 800 },
  { id: 'reggae', row: 'ポップ', fam: 'Reggae One', w: 400 },
  { id: 'mochiy', row: 'ポップ', fam: 'Mochiy Pop One', w: 400 },
  { id: 'potta', row: 'ポップ', fam: 'Potta One', w: 400 },
  { id: 'rampart', row: 'ポップ', fam: 'Rampart One', w: 400 },
  { id: 'hachimaru', row: 'ポップ', fam: 'Hachi Maru Pop', w: 400 },
  { id: 'klee', row: '手書き', fam: 'Klee One', w: 600 },
  { id: 'yusei', row: '手書き', fam: 'Yusei Magic', w: 400 },
  { id: 'stick', row: '手書き', fam: 'Stick', w: 400 },
  { id: 'syuku', row: '筆', fam: 'Yuji Syuku', w: 400 },
  { id: 'boku', row: '筆', fam: 'Yuji Boku', w: 400 },
  { id: 'shippori', row: '明朝', fam: 'Shippori Mincho B1', w: 800 },
  { id: 'kaisei', row: '明朝', fam: 'Kaisei Decol', w: 700 },
  { id: 'dot', row: 'そのほか', fam: 'DotGothic16', w: 400 },
];
const fontOf = id => FONTS.find(f => f.id === id) || FONTS[0];
const fontStr = (f, px) => `${f.w} ${px}px "${f.fam}"`;

/* ---------- 設定の 初め と 種類 ---------- */
const DEF = {
  text: 'ドン!!', vert: true, soe: '', font: 'dela', kind: 'shock',
  size: 170, sizeA: 100, sizeB: 100, upright: 0, skew: 0, rise: 4, squash: 100,
  jRot: 0, jSize: 0, jPos: 0, warp: 'none', warpAmt: 30, seed: 2026,
  fill: 'beta', fillColor: '#1e1c14', nega: false,
  strokes: [{ c: '#ffffff', w: 6 }], strokeMode: 'each', sharp: false,
  shX: 0, shY: 0, shColor: '#1e1c14', trail: 0,
  exBg: 'clear', exScale: 2, paths: [], over: {},
};
const KINDS = [
  { id: 'shock', name: '衝撃', p: { font: 'dela', sizeA: 95, sizeB: 125, skew: 8, rise: 6, strokes: [{ c: '#ffffff', w: 6 }] } },
  { id: 'rumble', name: '地響き', p: { font: 'dela', sizeA: 80, sizeB: 130, jPos: 18, jRot: 6, rise: 0, strokes: [{ c: '#ffffff', w: 4 }, { c: '#1e1c14', w: 3 }] } },
  { id: 'slash', name: '斬撃', p: { font: 'boku', skew: 22, rise: 14, sizeA: 120, sizeB: 85, trail: 3, strokes: [{ c: '#ffffff', w: 5 }] } },
  { id: 'boom', name: '爆発', p: { font: 'reggae', jRot: 16, jSize: 25, jPos: 12, fill: 'dotsGrad', strokes: [{ c: '#1e1c14', w: 3 }, { c: '#ffffff', w: 5 }] } },
  { id: 'waterL', name: '水(大)', p: { font: 'yusei', fill: 'lines', sizeA: 110, sizeB: 90, jRot: 8, strokes: [{ c: '#1e1c14', w: 3 }, { c: '#ffffff', w: 4 }] } },
  { id: 'soft', name: 'やわらか', p: { font: 'zenmaru', fill: 'white', jRot: 6, rise: 0, strokes: [{ c: '#1e1c14', w: 3.5 }] } },
  { id: 'waterS', name: '水(小)', p: { font: 'hachimaru', fill: 'beta', size: 120, jRot: 10, jPos: 10, strokes: [{ c: '#ffffff', w: 4 }] } },
  { id: 'small', name: '小さな音', p: { font: 'klee', size: 90, rise: 0, strokes: [{ c: '#ffffff', w: 5 }] } },
  { id: 'glare', name: 'にらむ', p: { font: 'shippori', rise: 0, squash: 85, strokes: [{ c: '#ffffff', w: 3 }] } },
  { id: 'pop', name: 'ポップ', p: { font: 'mochiy', fill: 'gray', jRot: 10, jSize: 12, strokes: [{ c: '#1e1c14', w: 3 }, { c: '#ffffff', w: 4 }] } },
  { id: 'quiet', name: '静けさ', p: { font: 'klee', fill: 'none', size: 110, rise: 0, upright: 100, strokes: [{ c: '#1e1c14', w: 1.2 }] } },
  { id: 'gogo', name: 'ショック', p: { font: 'dela', fill: 'dots', sizeA: 70, sizeB: 140, jRot: 8, skew: -6, strokes: [{ c: '#1e1c14', w: 2.5 }, { c: '#ffffff', w: 4 }], shX: 8, shY: 8 } },
];
const KIND_KEYS = ['font', 'size', 'sizeA', 'sizeB', 'upright', 'skew', 'rise', 'squash', 'jRot', 'jSize', 'jPos', 'warp', 'warpAmt',
  'fill', 'fillColor', 'nega', 'strokes', 'strokeMode', 'sharp', 'shX', 'shY', 'shColor', 'trail'];

const DICT = {
  '衝撃': 'ドン!! ドカッ バキッ ガッ ドゴォ ゴッ',
  '爆発': 'ドカーン バーン ボン ドォン ズドン',
  '地響き': 'ゴゴゴ ズズズ ドドド ゴゴゴゴ',
  '斬撃': 'ズバッ シュッ ザシュ スパッ ヒュン',
  '水': 'ザバァ ピチャ ポタ ザァァ チャプ',
  '心': 'ドキッ ドキドキ キュン ズキッ',
  '静か': 'シーン しん… …',
  '驚き': 'ガーン ギクッ ビクッ えっ',
  '動き': 'ササッ ピョン ダダッ バッ',
};

/* ---------- 状態・もどす ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
let S = clone(DEF);
let hist = [], fut = [], pending = null;
function beginEdit() { if (pending === null) pending = JSON.stringify(S); }
function commitEdit() {
  if (pending === null) return;
  const now = JSON.stringify(S);
  if (now !== pending) { hist.push(pending); if (hist.length > 100) hist.shift(); fut = []; }
  pending = null;
  save();
}
function edit(fn) { beginEdit(); fn(); commitEdit(); onChange(); }
function undo() { commitEdit(); if (!hist.length) return; fut.push(JSON.stringify(S)); S = JSON.parse(hist.pop()); afterLoad(); toast('もどした'); }
function redo() { commitEdit(); if (!fut.length) return; hist.push(JSON.stringify(S)); S = JSON.parse(fut.pop()); afterLoad(); toast('やり直した'); }

function save() { try { localStorage.setItem('giongo-state', JSON.stringify(S)); } catch {} }

/* ---------- 乱数 ---------- */
function rnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- 通り道 ---------- */
const lines = st => st.text.split('\n').filter(l => l.length).slice(0, 6);
function defPath(st, li, n) {
  const gap = st.size * 1.25;
  const cs = [...(lines(st)[li] || '')];
  const h = Math.max(330, (cs.length - 1) * st.size * 0.5 * Math.max(st.sizeA, st.sizeB) / 100); // 字数に 合わせて のばす
  if (st.vert) {
    const x = W / 2 + (n - 1) / 2 * gap - li * gap;
    return { a: [x, 500 - h], b: [x, 500 + h], m: [x, 500] };
  }
  const y = W / 2 - (n - 1) / 2 * gap + li * gap;
  return { a: [500 - h, y], b: [500 + h, y], m: [500, y] };
}
function pathsOf(st) {
  const ls = lines(st);
  return ls.map((_, i) => st.paths[i] || defPath(st, i, ls.length));
}
function sampler(p) {
  const c = [2 * p.m[0] - (p.a[0] + p.b[0]) / 2, 2 * p.m[1] - (p.a[1] + p.b[1]) / 2];
  const pt = t => {
    const u = 1 - t;
    return [u * u * p.a[0] + 2 * u * t * c[0] + t * t * p.b[0], u * u * p.a[1] + 2 * u * t * c[1] + t * t * p.b[1]];
  };
  const N = 80, pts = [], len = [0];
  for (let i = 0; i <= N; i++) pts.push(pt(i / N));
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = len[N];
  return {
    L, ctrl: c, pt,
    at(f) { // 長さの 割合 → 点と 向き
      const s = Math.max(0, Math.min(1, f)) * L;
      let i = 1;
      while (i < N && len[i] < s) i++;
      const k = len[i] - len[i - 1] ? (s - len[i - 1]) / (len[i] - len[i - 1]) : 0;
      const p0 = pts[i - 1], p1 = pts[i];
      const ang = L > 1 ? Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) : (0);
      return { x: p0[0] + (p1[0] - p0[0]) * k, y: p0[1] + (p1[1] - p0[1]) * k, ang };
    },
  };
}

/* ---------- 字の 置き場所 ---------- */
const SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ';
const TURN = 'ー―～〜…‥－-';
function layout(st) {
  const out = [];
  const ls = lines(st), ps = pathsOf(st);
  const base = st.vert ? Math.PI / 2 : 0;
  ls.forEach((line, li) => {
    const chars = [...line], n = chars.length;
    const sp = sampler(ps[li]);
    const ws = chars.map(ch => SMALL.includes(ch) ? 0.7 : (/[!！?？]/.test(ch) ? 0.75 : 1));
    const tot = ws.reduce((a, b) => a + b, 0);
    let acc = 0;
    chars.forEach((ch, i) => {
      const r = rnd(st.seed * 131 + li * 977 + i * 31);
      const f = n > 1 ? i / (n - 1) : 0.5;
      const along = n > 1 ? (acc + ws[i] / 2) / tot : 0.5;
      acc += ws[i];
      const pa = sp.at(along);
      let size = st.size * (st.sizeA + (st.sizeB - st.sizeA) * f) / 100 * ws[i];
      size *= 1 + (r() * 2 - 1) * st.jSize / 100;
      let d = pa.ang - base;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      let rot = d * (1 - st.upright / 100) - st.rise * Math.PI / 180 + (r() * 2 - 1) * st.jRot * Math.PI / 180;
      if (st.vert && TURN.includes(ch)) rot += Math.PI / 2;
      const off = (r() * 2 - 1) * st.jPos / 100 * size;
      let x = pa.x - Math.sin(pa.ang) * off, y = pa.y + Math.cos(pa.ang) * off;
      let sx = st.squash / 100;
      if (st.warp === 'trap') sx *= Math.max(0.2, 1 + st.warpAmt / 100 * (f - 0.5) * 1.4);
      if (st.warp === 'bulge') size *= Math.max(0.2, 1 + st.warpAmt / 100 * 0.6 * (1 - (2 * f - 1) ** 2));
      const key = li + ':' + i, o = st.over[key];
      if (o) { x += o.dx; y += o.dy; rot += o.rot; size *= o.sc; }
      out.push({ ch, x, y, rot, size, sx, skew: st.skew, key, font: fontOf(st.font) });
    });
  });
  if (st.soe && ls.length) { // 添え字は 最後の 通り道の 終わりの 横
    const p = ps[ps.length - 1];
    const size = st.size * 0.24;
    out.push({ ch: st.soe, x: p.b[0] + (st.vert ? -st.size * 0.75 : 0), y: p.b[1] + (st.vert ? 0 : st.size * 0.75),
      rot: 0, size, sx: 1, skew: 0, key: 'soe', font: { fam: 'M PLUS Rounded 1c', w: 800 }, soe: true });
  }
  return out;
}

/* ---------- 色 ---------- */
function colors(st) {
  let fill = st.fill === 'white' ? '#ffffff' : st.fill === 'gray' ? '#a9a69a' : st.fillColor;
  const strokes = st.strokes.map(s => ({ ...s }));
  if (st.nega && strokes.length) { const t = fill; fill = strokes[0].c; strokes[0].c = t; }
  return { fill, strokes };
}
const strokeW = (st, g, k) => {
  let s = 0;
  for (let i = 0; i <= k; i++) s += st.strokes[i].w;
  return 2 * s * g.size / 100;
};

/* ---------- 描く ---------- */
function place(ctx, g) {
  ctx.translate(g.x, g.y);
  ctx.rotate(g.rot);
  ctx.transform(1, 0, -Math.tan(g.skew * Math.PI / 180), 1, 0, 0);
  ctx.scale(g.sx, 1);
  ctx.font = fontStr(g.font, g.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}
function strokeG(ctx, st, g, k, color) {
  ctx.save(); place(ctx, g);
  ctx.lineJoin = st.sharp ? 'miter' : 'round';
  ctx.miterLimit = 3;
  ctx.lineWidth = strokeW(st, g, k);
  ctx.strokeStyle = color;
  ctx.strokeText(g.ch, 0, 0);
  ctx.restore();
}
function fillG(ctx, g, color) {
  ctx.save(); place(ctx, g);
  ctx.fillStyle = color;
  ctx.fillText(g.ch, 0, 0);
  ctx.restore();
}
function bounds(st, gs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const sw = st.strokes.reduce((a, s) => a + s.w, 0);
  for (const g of gs) {
    const r = g.size * (0.62 * Math.max(1, g.sx) + Math.abs(Math.tan(g.skew * Math.PI / 180)) * 0.5 + sw / 100) * (g.soe ? Math.max(1, g.ch.length * 0.6) : 1);
    x0 = Math.min(x0, g.x - r); x1 = Math.max(x1, g.x + r);
    y0 = Math.min(y0, g.y - r); y1 = Math.max(y1, g.y + r);
  }
  if (!gs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const t = trailVec(st);
  const sx0 = Math.min(0, st.shX, t[0] * st.trail), sx1 = Math.max(0, st.shX, t[0] * st.trail);
  const sy0 = Math.min(0, st.shY, t[1] * st.trail), sy1 = Math.max(0, st.shY, t[1] * st.trail);
  return { x: x0 + sx0, y: y0 + sy0, w: x1 - x0 + sx1 - sx0, h: y1 - y0 + sy1 - sy0 };
}
function trailVec(st) {
  const p = pathsOf(st)[0];
  if (!p) return [0, 0];
  const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], l = Math.hypot(dx, dy) || 1;
  return [-dx / l * st.size * 0.14, -dy / l * st.size * 0.14];
}

// 塗りの 模様（網点・線）を 字の 形で 切りぬいて のせる
function patternFill(ctx, st, gs, color, box) {
  const cv = ctx.canvas;
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const o = off.getContext('2d');
  o.setTransform(ctx.getTransform());
  for (const g of gs) fillG(o, g, '#000');
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = color;
  const step = st.size * 0.09;
  if (st.fill === 'lines') {
    o.strokeStyle = color; o.lineWidth = step * 0.35;
    o.beginPath();
    for (let x = box.x - box.h; x < box.x + box.w + box.h; x += step) { o.moveTo(x, box.y); o.lineTo(x + box.h, box.y + box.h); }
    o.stroke();
  } else {
    for (let y = box.y; y < box.y + box.h + step; y += step) {
      const f = st.fill === 'dotsGrad' ? Math.max(0, Math.min(1, (y - box.y) / box.h)) : 0.6;
      const rr = step * 0.5 * (st.fill === 'dotsGrad' ? 0.15 + f * 0.85 : 0.62);
      for (let x = box.x + ((Math.round((y - box.y) / step) % 2) * step / 2); x < box.x + box.w + step; x += step) {
        o.moveTo(x + rr, y); o.arc(x, y, rr, 0, Math.PI * 2);
      }
    }
    o.fill();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

function drawFill(ctx, st, gs, fill, box) {
  if (st.fill === 'none') return;
  const main = gs.filter(g => !g.soe);
  if (['dots', 'dotsGrad', 'lines'].includes(st.fill)) patternFill(ctx, st, main, fill, box);
  else for (const g of main) fillG(ctx, g, fill);
}

function drawArt(ctx, st, gs, box) {
  const { fill, strokes } = colors(st);
  const main = gs.filter(g => !g.soe), soe = gs.filter(g => g.soe);
  const last = strokes.length - 1;
  if (st.strokeMode === 'merge') {
    for (let k = last; k >= 0; k--) for (const g of main) strokeG(ctx, st, g, k, strokes[k].c);
    drawFill(ctx, st, main, fill, box);
  } else {
    for (const g of main) {
      for (let k = last; k >= 0; k--) strokeG(ctx, st, g, k, strokes[k].c);
      drawFill(ctx, st, [g], fill, box);
    }
  }
  for (const g of soe) {
    ctx.save(); place(ctx, g);
    ctx.lineJoin = 'round'; ctx.lineWidth = g.size * 0.3; ctx.strokeStyle = '#fff';
    ctx.strokeText(g.ch, 0, 0); ctx.fillStyle = st.fillColor; ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
}

// 影・残像も ふくめて 描く。ctx は もう 世界の 座標に なって いる
function render(ctx, st, gs) {
  const box = bounds(st, gs);
  const { strokes } = colors(st);
  const sil = (c, dx, dy) => {
    const shifted = gs.filter(g => !g.soe).map(g => ({ ...g, x: g.x + dx, y: g.y + dy }));
    const k = strokes.length - 1;
    for (const g of shifted) { if (k >= 0) strokeG(ctx, st, g, k, c); fillG(ctx, g, c); }
  };
  if (st.shX || st.shY) sil(st.shColor, st.shX, st.shY);
  if (st.trail > 0) {
    const t = trailVec(st);
    const off = document.createElement('canvas');
    off.width = ctx.canvas.width; off.height = ctx.canvas.height;
    const o = off.getContext('2d');
    o.setTransform(ctx.getTransform());
    drawArt(o, st, gs, box);
    const k = ctx.getTransform().a;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = st.trail; i >= 1; i--) {
      ctx.globalAlpha = 0.5 * (1 - i / (st.trail + 1));
      ctx.drawImage(off, t[0] * i * k, t[1] * i * k);
    }
    ctx.restore();
  }
  drawArt(ctx, st, gs, box);
  return box;
}

/* ---------- 書き出し用の 絵 ---------- */
function artCanvas(st, scale, bg) {
  const gs = layout(st);
  const b = bounds(st, gs);
  const pad = 8;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(b.w * scale + pad * 2));
  cv.height = Math.max(1, Math.ceil(b.h * scale + pad * 2));
  const ctx = cv.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.setTransform(scale, 0, 0, scale, pad - b.x * scale, pad - b.y * scale);
  render(ctx, st, gs);
  return cv;
}
function thumb(cv, st) {
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const gs = layout(st);
  const b = bounds(st, gs);
  const s = Math.min((cv.width - 10) / b.w, (cv.height - 10) / b.h);
  ctx.setTransform(s, 0, 0, s, cv.width / 2 - (b.x + b.w / 2) * s, cv.height / 2 - (b.y + b.h / 2) * s);
  render(ctx, st, gs);
}

/* ---------- プレビュー ---------- */
const cv = $('#cv'), stage = $('#stage');
let mode = 'path', sel = null, lastGs = [], drag = null;
let V = { s: 1, ox: 0, oy: 0 }; // 世界 → 画面（CSS px）
function view() { return { r: stage.getBoundingClientRect() }; }
// 字と 通り道が ぜんぶ 入る ように 映す。ドラッグ中は 動かさない
function fitView(r) {
  const b = bounds(S, lastGs);
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  for (const p of pathsOf(S)) for (const q of [p.a, p.b, p.m]) {
    x0 = Math.min(x0, q[0] - 30); y0 = Math.min(y0, q[1] - 30); x1 = Math.max(x1, q[0] + 30); y1 = Math.max(y1, q[1] + 30);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(250, (x1 - x0) / 2), hh = Math.max(250, (y1 - y0) / 2);
  x0 = cx - hw; x1 = cx + hw; y0 = cy - hh; y1 = cy + hh;
  const pad = 16, s = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0));
  V = { s, ox: r.width / 2 - (x0 + x1) / 2 * s, oy: r.height / 2 - (y0 + y1) / 2 * s };
}
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const { r } = view();
  const pw = Math.round(r.width * dpr), ph = Math.round(r.height * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  lastGs = layout(S);
  if (!drag) fitView(r);
  ctx.setTransform(V.s * dpr, 0, 0, V.s * dpr, V.ox * dpr, V.oy * dpr);
  render(ctx, S, lastGs);
  const u = 1 / V.s; // 画面の 1px
  if (mode === 'path') {
    pathsOf(S).forEach(p => {
      const sp = sampler(p);
      ctx.save();
      ctx.setLineDash([6 * u, 5 * u]); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = '#4a90d9';
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const q = sp.pt(i / 40); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      const dot = (q, c) => { ctx.beginPath(); ctx.arc(q[0], q[1], 9 * u, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = '#fff'; ctx.stroke(); };
      dot(p.a, '#4a90d9'); dot(p.b, '#ee8a3a');
      ctx.translate(p.m[0], p.m[1]); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4a90d9'; ctx.lineWidth = 2 * u;
      ctx.fillRect(-6 * u, -6 * u, 12 * u, 12 * u); ctx.strokeRect(-6 * u, -6 * u, 12 * u, 12 * u);
      ctx.restore();
    });
  } else {
    for (const g of lastGs) {
      if (g.soe) continue;
      const on = g.key === sel;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot);
      ctx.strokeStyle = on ? '#4a90d9' : 'rgba(74,144,217,.35)'; ctx.lineWidth = (on ? 2 : 1) * u;
      const h = g.size * 0.55;
      ctx.strokeRect(-h, -h, h * 2, h * 2);
      if (on) {
        const hd = handles(g);
        ctx.restore(); ctx.save();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4a90d9'; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.arc(hd.rot[0], hd.rot[1], 9 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillRect(hd.sc[0] - 8 * u, hd.sc[1] - 8 * u, 16 * u, 16 * u); ctx.strokeRect(hd.sc[0] - 8 * u, hd.sc[1] - 8 * u, 16 * u, 16 * u);
      }
      ctx.restore();
    }
  }
  const b = bounds(S, lastGs);
  $('#sizeinfo').textContent = `保存 ${Math.ceil(b.w * S.exScale + 16)}×${Math.ceil(b.h * S.exScale + 16)}px`;
}
function handles(g) {
  const h = g.size * 0.55, c = Math.cos(g.rot), s = Math.sin(g.rot);
  const tr = (x, y) => [g.x + x * c - y * s, g.y + x * s + y * c];
  return { rot: tr(0, -h - g.size * 0.25), sc: tr(h, h) };
}

/* ---------- 指・ペン ---------- */
const touches = new Map();
let  multi = null, lastMulti = 0;
const world = e => { const { r } = view(); return [(e.clientX - r.left - V.ox) / V.s, (e.clientY - r.top - V.oy) / V.s]; };
const near = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) < px / V.s;

cv.addEventListener('pointerdown', e => {
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size >= 2) {
    if (drag) { drag = null; if (pending !== null) { S = JSON.parse(pending); pending = null; onChange(); } }
    multi = multi || { t: performance.now(), n: 0, moved: false, start: new Map() };
    multi.n = Math.max(multi.n, touches.size);
    for (const [id, p] of touches) if (!multi.start.has(id)) multi.start.set(id, p);
    return;
  }
  cv.setPointerCapture(e.pointerId);
  const w = world(e);
  if (mode === 'path') {
    const ps = pathsOf(S);
    for (let i = ps.length - 1; i >= 0; i--) {
      for (const h of ['m', 'a', 'b']) if (near(w, ps[i][h], 22)) { drag = { kind: 'path', i, h, w }; break; }
      if (drag) break;
    }
  } else {
    const g = lastGs.find(x => x.key === sel);
    if (g) {
      const hd = handles(g);
      if (near(w, hd.rot, 22)) drag = { kind: 'rot', g, w };
      else if (near(w, hd.sc, 22)) drag = { kind: 'sc', g, w };
    }
    if (!drag) {
      const hit = [...lastGs].reverse().find(x => !x.soe && Math.hypot(w[0] - x.x, w[1] - x.y) < x.size * 0.55);
      sel = hit ? hit.key : null;
      if (hit) drag = { kind: 'move', g: hit, w };
      draw();
    }
  }
  if (drag) {
    beginEdit();
    if (drag.kind === 'path') S.paths = clone(pathsOf(S));
    else { const o = S.over[drag.g.key] || { dx: 0, dy: 0, rot: 0, sc: 1 }; drag.o0 = { ...o }; S.over[drag.g.key] = o; }
  }
});
cv.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) {
    if (multi) { const s = multi.start.get(e.pointerId); if (s && Math.hypot(e.clientX - s[0], e.clientY - s[1]) > 15) multi.moved = true; }
    touches.set(e.pointerId, [e.clientX, e.clientY]);
  }
  if (!drag) return;
  const w = world(e), dx = w[0] - drag.w[0], dy = w[1] - drag.w[1];
  if (drag.kind === 'path') {
    const p = S.paths[drag.i];
    if (!drag.p0) drag.p0 = clone(p);
    p[drag.h] = [drag.p0[drag.h][0] + dx, drag.p0[drag.h][1] + dy];
    if (drag.h !== 'm') { // はしを 動かしたら 曲げも 半分 ついてくる
      p.m = [drag.p0.m[0] + dx / 2, drag.p0.m[1] + dy / 2];
    }
  } else {
    const o = S.over[drag.g.key], g = drag.g;
    if (drag.kind === 'move') { o.dx = drag.o0.dx + dx; o.dy = drag.o0.dy + dy; }
    if (drag.kind === 'rot') {
      const a0 = Math.atan2(drag.w[1] - g.y, drag.w[0] - g.x), a1 = Math.atan2(w[1] - g.y, w[0] - g.x);
      o.rot = drag.o0.rot + a1 - a0;
    }
    if (drag.kind === 'sc') {
      const d0 = Math.hypot(drag.w[0] - g.x, drag.w[1] - g.y), d1 = Math.hypot(w[0] - g.x, w[1] - g.y);
      o.sc = Math.max(0.2, Math.min(5, drag.o0.sc * d1 / (d0 || 1)));
    }
  }
  draw();
});
function up(e) {
  touches.delete(e.pointerId);
  if (multi && touches.size === 0) {
    const m = multi; multi = null;
    const now = performance.now();
    if (!m.moved && now - m.t < 400 && now - lastMulti > 500) { lastMulti = now; m.n >= 3 ? redo() : undo(); }
    return;
  }
  if (drag) { drag = null; commitEdit(); onChange(); }
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('dblclick', e => {
  const w = world(e);
  if (mode === 'path') {
    const ps = pathsOf(S);
    const i = ps.findIndex(p => ['a', 'b', 'm'].some(h => near(w, p[h], 22)));
    if (i >= 0) edit(() => { S.paths = clone(ps); S.paths[i] = defPath(S, i, ps.length); });
  } else {
    const hit = lastGs.find(x => !x.soe && Math.hypot(w[0] - x.x, w[1] - x.y) < x.size * 0.55);
    if (hit && S.over[hit.key]) edit(() => { delete S.over[hit.key]; });
  }
});

/* ---------- 画面の 部品 ---------- */
function toast(t) {
  const el = $('#toast');
  el.textContent = t; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1600);
}

const UNITS = { size: 'px', sizeA: '%', sizeB: '%', upright: '%', skew: '°', rise: '°', squash: '%', jRot: '°', jSize: '%', jPos: '%', warpAmt: '', shX: '', shY: '', trail: '' };
function syncUI() {
  for (const inp of $$('[data-k]')) {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!S[k];
    else if (document.activeElement !== inp) inp.value = S[k];
    const out = inp.closest('.param')?.querySelector('output');
    if (out) out.textContent = S[k] + (UNITS[k] ?? '');
  }
  for (const sg of $$('[data-seg]')) for (const b of sg.children) b.classList.toggle('on', String(S[sg.dataset.seg]) === b.dataset.v);
  for (const c of $$('[data-chips] .chip')) c.classList.toggle('on', S[c.parentNode.dataset.chips] === c.dataset.v);
  for (const c of $$('#vertChips .chip[data-v]')) c.classList.toggle('on', String(+S.vert) === c.dataset.v);
  for (const b of $$('.fbtn')) b.classList.toggle('on', b.dataset.f === S.font);
  for (const b of $$('.kind')) b.classList.toggle('on', b.dataset.id === S.kind);
  $('#warpAmt').hidden = S.warp === 'none';
  if (document.activeElement !== $('#text')) $('#text').value = S.text;
  $('#modehint').textContent = mode === 'path'
    ? '● 始め・● 終わり を ドラッグで 通り道、◆ で 曲げ。ダブルクリックで 戻す'
    : '字を 押して ドラッグで 移動。○ で 回す、□ で 大きさ。ダブルクリックで 戻す';
}
function buildStrokes() {
  const box = $('#strokes');
  box.innerHTML = '';
  S.strokes.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'st';
    row.innerHTML = `<input type="color" value="${s.c}"><div class="param"><div class="lab"><span>${i ? '外の フチ ' + i : 'フチ'}</span><output>${s.w}</output></div><input type="range" min="0" max="25" step="0.5" value="${s.w}"></div><button class="mini" title="消す">−</button>`;
    const [col, rng] = row.querySelectorAll('input');
    col.addEventListener('input', () => { beginEdit(); S.strokes[i].c = col.value; onChange(false); });
    col.addEventListener('change', () => { commitEdit(); });
    rng.addEventListener('pointerdown', beginEdit);
    rng.addEventListener('input', () => { S.strokes[i].w = +rng.value; row.querySelector('output').textContent = rng.value; onChange(false); });
    rng.addEventListener('change', commitEdit);
    row.querySelector('.mini').addEventListener('click', () => edit(() => S.strokes.splice(i, 1)));
    box.append(row);
  });
}
let lastStrokeSig = '';

let thumbT = 0;
function onChange(full = true) {
  syncUI();
  const sig = S.strokes.length + ':' + S.strokes.map(s => s.c + s.w).join();
  if (full && sig !== lastStrokeSig) { buildStrokes(); lastStrokeSig = sig; }
  draw();
  clearTimeout(thumbT);
  thumbT = setTimeout(drawKinds, 250);
  save();
}
function afterLoad() { lastStrokeSig = ''; sel = null; onChange(); loadFonts(); }

function kindState(k) {
  const st = clone(S);
  for (const key of KIND_KEYS) st[key] = clone(DEF[key]);
  Object.assign(st, clone(k.p));
  st.kind = k.id; st.over = {};
  return st;
}
function drawKinds() {
  for (const b of $$('.kind')) thumb(b.querySelector('canvas'), kindState(KINDS.find(k => k.id === b.dataset.id)));
}
function buildKinds() {
  const box = $('#kinds');
  for (const k of KINDS) {
    const b = document.createElement('button');
    b.className = 'kind'; b.dataset.id = k.id;
    b.innerHTML = `<canvas width="180" height="180"></canvas><span>${k.name}</span>`;
    b.addEventListener('click', () => edit(() => { S = kindState(k); }));
    box.append(b);
  }
}
function buildFonts() {
  const box = $('#fonts');
  const rows = [...new Set(FONTS.map(f => f.row))];
  for (const r of rows) {
    const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = r;
    const row = document.createElement('div'); row.className = 'row';
    for (const f of FONTS.filter(f => f.row === r)) {
      const b = document.createElement('button');
      b.className = 'fbtn'; b.dataset.f = f.id; b.textContent = 'ドカン'; b.title = f.fam;
      b.style.fontFamily = `"${f.fam}"`; b.style.fontWeight = f.w;
      b.addEventListener('click', () => edit(() => { S.font = f.id; }));
      row.append(b);
    }
    box.append(lab, row);
  }
}
function buildDict() {
  const box = $('#dict');
  for (const [k, v] of Object.entries(DICT)) {
    const b = document.createElement('b'); b.textContent = k;
    const row = document.createElement('div'); row.className = 'chips'; row.style.margin = 0;
    for (const w of v.split(' ')) {
      const c = document.createElement('button'); c.className = 'chip'; c.textContent = w;
      c.addEventListener('click', () => edit(() => { S.text = w; S.paths = []; S.over = {}; }));
      row.append(c);
    }
    box.append(b, row);
  }
}

/* ---------- おまかせ（決めた 表で 選ぶ） ---------- */
function guessKind(t) {
  const d = t.normalize('NFD');
  const dak = /[゙゚]/.test(d);
  const has = re => re.test(t);
  if (has(/シーン|しーん|しん|…/)) return 'quiet';
  if (has(/ズバ|シュ|ザシュ|スパ|ヒュ/)) return 'slash';
  if (has(/ピチャ|ポタ|ザバ|チャプ|ザァ|ぴちゃ|ぽた/)) return has(/ザ/) ? 'waterL' : 'waterS';
  if (has(/ガーン|ギク|ビク/)) return 'gogo';
  if (has(/ギロ|キッ|ジロ/)) return 'glare';
  if (has(/(.)\1\1/) && dak) return 'rumble';
  if (has(/ドカーン|バーン|ボン|ドォン|ズドン|ドーン/)) return 'boom';
  if (has(/キュン|ドキ|ふわ|ぽ|ぷ|ぴょ|ピョ/)) return has(/ドキ/) ? 'pop' : 'soft';
  if (dak && has(/[!！]/)) return 'shock';
  if (dak) return 'rumble';
  if (/^[぀-ゟ…ー]+$/.test(t)) return 'small';
  return 'pop';
}

/* ---------- ガチャ ---------- */
const MUT = { size: [60, 30, 400], sizeA: [40, 30, 200], sizeB: [40, 30, 200], skew: [25, -40, 40], rise: [15, -30, 30], squash: [25, 50, 150],
  jRot: [15, 0, 40], jSize: [20, 0, 60], jPos: [20, 0, 60] };
const FILLS = ['beta', 'white', 'gray', 'dots', 'dotsGrad', 'lines'];
function gacha() {
  const v = +$('[data-g=var]').value / 100;
  const box = $('#gacha');
  box.innerHTML = '';
  const r = rnd(Date.now() & 0xffffff);
  for (let i = 0; i < 24; i++) {
    let st = $('#gMix').checked ? kindState(KINDS[Math.floor(r() * KINDS.length)]) : clone(S);
    st.over = {};
    for (const [k, [range, lo, hi]] of Object.entries(MUT)) st[k] = Math.round(Math.max(lo, Math.min(hi, st[k] + (r() * 2 - 1) * range * v)));
    if (r() < v * 0.5) st.font = FONTS[Math.floor(r() * FONTS.length)].id;
    if (r() < v * 0.3) st.fill = FILLS[Math.floor(r() * FILLS.length)];
    st.seed = Math.floor(r() * 99999);
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    thumb(c, st);
    c.addEventListener('click', () => edit(() => { S = clone(st); }));
    box.append(c);
  }
}

/* ---------- お気に入り ---------- */
const FAV_KEY = 'giongo-favs';
const getFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } };
const setFavs = f => { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch {} };
function buildFavs() {
  const box = $('#favs');
  box.innerHTML = '';
  getFavs().forEach((f, i) => {
    const c = document.createElement('button');
    c.className = 'chip'; c.textContent = f.name;
    let t = 0, long = false;
    c.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; if (confirm(`「${f.name}」を 消す？`)) { const a = getFavs(); a.splice(i, 1); setFavs(a); buildFavs(); } }, 600); });
    c.addEventListener('pointerup', () => clearTimeout(t));
    c.addEventListener('pointerleave', () => clearTimeout(t));
    c.addEventListener('click', () => { if (long) return; edit(() => { for (const k of KIND_KEYS) if (k in f.st) S[k] = clone(f.st[k]); S.kind = f.st.kind; }); });
    box.append(c);
  });
}

/* ---------- 書体を 読みこむ ---------- */
async function loadFonts() {
  const sample = 'ドカンゴバキ' + S.text.replace(/\s/g, '');
  await Promise.all(FONTS.map(f => document.fonts.load(fontStr(f, 40), sample).catch(() => {})));
  draw(); drawKinds();
}

/* ---------- SVG ---------- */
function svgOf(st) {
  const gs = layout(st), b = bounds(st, gs);
  const { fill, strokes } = colors(st);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tf = g => `translate(${g.x.toFixed(2)} ${g.y.toFixed(2)}) rotate(${(g.rot * 180 / Math.PI).toFixed(2)}) skewX(${(-g.skew).toFixed(2)}) scale(${g.sx.toFixed(3)} 1)`;
  const txt = (g, attrs) => `<text transform="${tf(g)}" font-family="${esc(g.font.fam)}" font-weight="${g.font.w}" font-size="${g.size.toFixed(2)}" text-anchor="middle" dominant-baseline="central" ${attrs}>${esc(g.ch)}</text>`;
  const join = st.sharp ? 'miter' : 'round';
  const step = st.size * 0.09;
  let fillRef = fill;
  let defs = '';
  if (['dots', 'dotsGrad'].includes(st.fill)) { defs = `<pattern id="pt" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><circle cx="${step / 2}" cy="${step / 2}" r="${step * 0.31}" fill="${fill}"/></pattern>`; fillRef = 'url(#pt)'; }
  if (st.fill === 'lines') { defs = `<pattern id="pt" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${step * 0.35}" height="${step}" fill="${fill}"/></pattern>`; fillRef = 'url(#pt)'; }
  const main = gs.filter(g => !g.soe);
  const one = (g, k, c) => txt(g, `fill="none" stroke="${c}" stroke-width="${strokeW(st, g, k).toFixed(2)}" stroke-linejoin="${join}"`);
  const art = () => {
    let s = '';
    const fl = g => st.fill === 'none' ? '' : txt(g, `fill="${fillRef}"`);
    if (st.strokeMode === 'merge') {
      for (let k = strokes.length - 1; k >= 0; k--) for (const g of main) s += one(g, k, strokes[k].c);
      for (const g of main) s += fl(g);
    } else for (const g of main) { for (let k = strokes.length - 1; k >= 0; k--) s += one(g, k, strokes[k].c); s += fl(g); }
    for (const g of gs.filter(g => g.soe)) s += txt(g, `fill="${st.fillColor}" stroke="#fff" stroke-width="${(g.size * 0.3).toFixed(2)}" stroke-linejoin="round" paint-order="stroke"`);
    return s;
  };
  let body = '';
  if (st.shX || st.shY) {
    const k = strokes.length - 1;
    body += `<g transform="translate(${st.shX} ${st.shY})">` + main.map(g => (k >= 0 ? one(g, k, st.shColor) : '') + txt(g, `fill="${st.shColor}"`)).join('') + '</g>';
  }
  const t = trailVec(st);
  for (let i = st.trail; i >= 1; i--) body += `<g opacity="${(0.5 * (1 - i / (st.trail + 1))).toFixed(2)}" transform="translate(${(t[0] * i).toFixed(2)} ${(t[1] * i).toFixed(2)})">${art()}</g>`;
  body += art();
  const fams = [...new Set(gs.map(g => g.font.fam))].map(f => 'family=' + f.replace(/ /g, '+')).join('&');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}" width="${Math.ceil(b.w * st.exScale)}" height="${Math.ceil(b.h * st.exScale)}">
<style>@import url('https://fonts.googleapis.com/css2?${fams}&amp;display=swap');</style>
<defs>${defs}</defs>${st.exBg === 'white' ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fff"/>` : ''}${body}</svg>`;
}

/* ---------- 保存 ---------- */
const fname = ext => `giongo-${(S.text.replace(/[\n\\/:*?"<>|]/g, '') || 'oto').slice(0, 12)}.${ext}`;
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const pngCanvas = () => artCanvas(S, S.exScale, S.exBg === 'white' ? '#fff' : null);
function savePng() { pngCanvas().toBlob(b => { download(b, fname('png')); toast('PNG を 保存した'); }); }

/* ---------- つなぐ ---------- */
function bind() {
  for (const inp of $$('input[data-k]')) {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') { inp.addEventListener('change', () => edit(() => { S[k] = inp.checked; })); continue; }
    if (inp.type === 'range') {
      inp.addEventListener('pointerdown', beginEdit);
      inp.addEventListener('input', () => { beginEdit(); S[k] = +inp.value; onChange(false); });
      inp.addEventListener('change', () => { commitEdit(); onChange(false); });
      continue;
    }
    inp.addEventListener('input', () => { beginEdit(); S[k] = inp.value; onChange(false); });
    inp.addEventListener('change', commitEdit);
  }
  const ta = $('#text');
  let tt = 0;
  ta.addEventListener('input', () => {
    beginEdit();
    const before = lines(S).length;
    S.text = ta.value;
    if (lines(S).length !== before) S.paths = [];
    S.over = {};
    onChange(false);
    clearTimeout(tt); tt = setTimeout(() => { commitEdit(); loadFonts(); }, 600);
  });
  for (const sg of $$('[data-seg]')) for (const b of sg.children) b.addEventListener('click', () => edit(() => {
    const k = sg.dataset.seg; S[k] = typeof DEF[k] === 'number' ? +b.dataset.v : b.dataset.v;
  }));
  for (const c of $$('[data-chips] .chip')) c.addEventListener('click', () => edit(() => { S[c.parentNode.dataset.chips] = c.dataset.v; }));
  const vc = $('#text').nextElementSibling; vc.id = 'vertChips';
  for (const c of vc.querySelectorAll('.chip[data-v]')) c.addEventListener('click', () => edit(() => { S.vert = c.dataset.v === '1'; S.paths = []; S.over = {}; }));
  $('#dictBtn').addEventListener('click', () => { $('#dict').hidden = !$('#dict').hidden; });
  $('#addStroke').addEventListener('click', () => { if (S.strokes.length >= 4) return toast('フチは 4つ まで'); edit(() => S.strokes.push({ c: S.strokes.length % 2 ? '#1e1c14' : '#ffffff', w: 3 })); });

  for (const b of $$('#modeseg button')) b.addEventListener('click', () => {
    mode = b.dataset.m; sel = null;
    for (const x of $$('#modeseg button')) x.classList.toggle('on', x === b);
    syncUI(); draw();
  });
  for (const b of $$('#bgseg button')) b.addEventListener('click', () => {
    stage.className = 'stage bg-' + b.dataset.bg;
    for (const x of $$('#bgseg button')) x.classList.toggle('on', x === b);
  });

  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#omakase').addEventListener('click', () => { const k = KINDS.find(k => k.id === guessKind(S.text)); edit(() => { S = kindState(k); }); toast(k.name + ' に した'); });
  $('#reseed').addEventListener('click', () => edit(() => { S.seed = Math.floor(Math.random() * 99999); if (!S.jRot && !S.jSize && !S.jPos) { S.jRot = 8; S.jSize = 10; S.jPos = 8; } }));
  $('#resetChars').addEventListener('click', () => edit(() => { S.over = {}; }));
  $('#resetPath').addEventListener('click', () => edit(() => { S.paths = []; }));
  $('#savePng').addEventListener('click', savePng);
  $('#exPng').addEventListener('click', savePng);
  $('#exSvg').addEventListener('click', () => { download(new Blob([svgOf(S)], { type: 'image/svg+xml' }), fname('svg')); toast('SVG を 保存した'); });
  $('#exCopy').addEventListener('click', () => pngCanvas().toBlob(async b => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('コピーした'); } catch { toast('コピー できなかった'); }
  }));
  $('#exLink').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#s=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(S)))));
    try { await navigator.clipboard.writeText(url); toast('リンクを コピーした'); } catch { prompt('リンク', url); }
  });
  $('#exJson').addEventListener('click', () => download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), fname('json')));
  $('#imJson').addEventListener('click', () => $('#jsonFile').click());
  $('#jsonFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const o = JSON.parse(await f.text()); edit(() => { S = { ...clone(DEF), ...o }; }); afterLoad(); toast('読みこんだ'); } catch { toast('読めなかった'); }
    e.target.value = '';
  });
  $('#gachaBtn').addEventListener('click', gacha);
  const gv = $('[data-g=var]');
  gv.addEventListener('input', () => { gv.closest('.param').querySelector('output').textContent = gv.value; });
  gv.closest('.param').querySelector('output').textContent = gv.value;
  $('#favAdd').addEventListener('click', () => {
    const name = prompt('名前', KINDS.find(k => k.id === S.kind)?.name || 'お気に入り');
    if (!name) return;
    const st = {}; for (const k of KIND_KEYS) st[k] = clone(S[k]); st.kind = S.kind;
    setFavs([...getFavs(), { name, st }]); buildFavs(); toast('しまった');
  });
  $('#resetAll').addEventListener('click', () => { if (confirm('初めに 戻す？')) { edit(() => { S = clone(DEF); }); afterLoad(); } });

  window.addEventListener('keydown', e => {
    if (e.target.matches('textarea,input[type=text]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  });
  new ResizeObserver(draw).observe(stage);
}

/* ---------- はじめ ---------- */
(function start() {
  try {
    const m = location.hash.match(/#s=(.+)/);
    if (m) S = { ...clone(DEF), ...JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))) };
    else { const s = localStorage.getItem('giongo-state'); if (s) S = { ...clone(DEF), ...JSON.parse(s) }; }
  } catch {}
  buildKinds(); buildFonts(); buildDict(); buildFavs();
  bind();
  watchRanges();
  onChange();
  loadFonts();
  document.fonts.ready.then(() => { draw(); drawKinds(); });
})();
