/* ✨ 動く背景（kind: 'ugoku'）。うごく背景（lab/tools/ugoku-haikei）の 描き方を そのまま もってきた。

   背景（グラデ・単色・なし）＋ 下地の 動き（サンバースト・しま・けむり・炎）
   ＋ 粒（キラッ・ハート・花びら・ゆき …）＋ 仕上げ（光もれ・ビネット・ざらざら …）。
   どれも「1周（loop 秒）で もとに もどる」ので、くり返しても つなぎ目が 出ない。
   作品と 同じ 大きさの 紙に 描いて、ふつうの レイヤーとして 出す。 */
import { newLayer as newBaseLayer } from './layer.js?v=359';

const TAU = Math.PI * 2;
const frac = v => v - Math.floor(v);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const SHAPE_NAMES = { sparkle: 'キラッ', star: 'ほし', heart: 'ハート', bokeh: '玉ボケ', ring: 'わっか', dot: 'つぶ', shard: 'かけら', petal: '花びら', snow: 'ゆき', text: '文字' };
export const MOTIONS = { up: '上へ', down: '下へ', right: '右へ', left: '左へ', diag: 'ななめ', float: 'ふわふわ', out: '広がる', still: 'とまる' };
export const BASES = { none: 'なし', sunburst: 'サンバースト', stripe: 'ななめ しま', smoke: 'けむり', fire: '炎' };

function newLayer(shape, o = {}) {
  return Object.assign({
    on: true, shape, text: '★', imgs: [],
    count: 30, size: 4, sizeVar: 60, motion: 'up', speed: 1, sway: 30, spin: 0, twinkle: 40,
    opacity: 90, glow: 30, blend: 'source-over', depth: 60,
    colors: ['#ffffff', '#ffd6ec', '#bfe3ff'], seed: Math.random() * 1e9 | 0,
  }, o);
}
export const newParticles = newLayer;

/* ---------- 形 ---------- */
function drawShape(c, L, pt, s, col) {
  c.fillStyle = col; c.strokeStyle = col;
  switch (L.shape) {
    case 'sparkle': {
      c.beginPath(); const a = s, b = s * .16;
      c.moveTo(0, -a); c.quadraticCurveTo(b, -b, a, 0); c.quadraticCurveTo(b, b, 0, a);
      c.quadraticCurveTo(-b, b, -a, 0); c.quadraticCurveTo(-b, -b, 0, -a); c.fill(); break;
    }
    case 'star': {
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? s * .42 : s, an = i / 10 * TAU - Math.PI / 2; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      c.closePath(); c.fill(); break;
    }
    case 'heart': {
      c.beginPath(); c.moveTo(0, s * .85);
      c.bezierCurveTo(-s * 1.1, s * .1, -s * .75, -s * .9, 0, -s * .35);
      c.bezierCurveTo(s * .75, -s * .9, s * 1.1, s * .1, 0, s * .85); c.fill(); break;
    }
    case 'bokeh': {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, col); g.addColorStop(.7, col); g.addColorStop(1, 'transparent');
      c.globalAlpha *= .55; c.fillStyle = g; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); break;
    }
    case 'ring': c.lineWidth = Math.max(1, s * .14); c.beginPath(); c.arc(0, 0, s * .85, 0, TAU); c.stroke(); break;
    case 'dot': c.beginPath(); c.arc(0, 0, s * .35, 0, TAU); c.fill(); break;
    case 'snow': {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, s * .5);
      g.addColorStop(0, col); g.addColorStop(.5, col); g.addColorStop(1, 'transparent');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, s * .5, 0, TAU); c.fill(); break;
    }
    case 'shard': {
      c.beginPath(); const v = pt.verts;
      c.moveTo(v[0] * s, v[1] * s); c.lineTo(v[2] * s, v[3] * s); c.lineTo(v[4] * s, v[5] * s); c.closePath();
      c.globalAlpha *= .8; c.fill(); c.globalAlpha *= .9; c.lineWidth = Math.max(1, s * .05); c.strokeStyle = '#fff'; c.stroke(); break;
    }
    case 'petal': {
      c.beginPath(); c.moveTo(0, -s);
      c.bezierCurveTo(s * .75, -s * .5, s * .55, s * .6, 0, s);
      c.bezierCurveTo(-s * .55, s * .6, -s * .75, -s * .5, 0, -s); c.fill(); break;
    }
    case 'text': {
      c.font = `${Math.round(s * 2)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const chars = [...(L.text || '★')].filter(ch => ch.trim());
      c.fillText(chars.length ? chars[pt.k % chars.length] : '★', 0, 0); break;
    }
    case 'image': {
      const im = L.imgs[pt.k % L.imgs.length]; if (!im) break;
      const r = im.width / im.height, w = r >= 1 ? s * 2 : s * 2 * r, h = r >= 1 ? s * 2 / r : s * 2;
      c.drawImage(im, -w / 2, -h / 2, w, h); break;
    }
  }
}

/* ---------- 粒の 準備（1周で もとに もどる よう 周回数は 整数） ---------- */
function points(L) {
  const key = [L.seed, L.count, L.shape, L.imgs.length, L.depth].join('|');
  if (L._uKey === key) return L._uPts;
  const r = rng(L.seed), pts = [];
  for (let i = 0; i < L.count; i++) {
    const z = 1 - r() * L.depth / 100; // 1=手前
    pts.push({
      x: r(), y: r(), z, k: (r() * 1000) | 0, rs: r(),
      off: r(), off2: r(), rot: r() * TAU, dir: r() < .5 ? -1 : 1, ci: (r() * 3) | 0, lapR: r(),
      verts: [r() * 2 - 1, -1, 1, r() * 2 - 1, r() * 2 - 1, 1].map((v, j) => v * (.5 + r() * .5)),
    });
  }
  pts.sort((a, b) => a.z - b.z); // 奥から描く
  L._uKey = key; L._uPts = pts; return pts;
}

function drawLayer(c, L, p, W, H) {
  if (!L.on || !L.count || (L.shape === 'image' && !L.imgs.length)) return;
  const U = Math.min(W, H) / 60, M = .12;
  c.save(); c.globalCompositeOperation = L.blend;
  for (const pt of points(L)) {
    const size = L.size * U * pt.z * (1 - pt.rs * L.sizeVar / 100 * .8);
    const laps = Math.max(0, Math.round(L.speed * (pt.z * .8 + .4) + (pt.lapR - .5) * .6 * L.speed));
    const sw = L.sway / 100 * .05 * Math.sin(TAU * (p * Math.max(1, laps) + pt.off));
    const sw2 = L.sway / 100 * .05 * Math.cos(TAU * (p * Math.max(1, laps) + pt.off2));
    let x = pt.x, y = pt.y, sc = 1, a = 1;
    const wrap = v => -M + frac(v) * (1 + 2 * M);
    switch (L.motion) {
      case 'up': y = wrap(pt.y - laps * p); x = pt.x + sw; break;
      case 'down': y = wrap(pt.y + laps * p); x = pt.x + sw; break;
      case 'right': x = wrap(pt.x + laps * p); y = pt.y + sw; break;
      case 'left': x = wrap(pt.x - laps * p); y = pt.y + sw; break;
      case 'diag': x = wrap(pt.x + laps * p); y = wrap(pt.y + laps * p) + sw * .5; break;
      case 'float': x = pt.x + sw * 1.5 + .01 * Math.sin(TAU * (p + pt.off)); y = pt.y + sw2 * 1.5; break;
      case 'out': {
        const t = frac(pt.off + Math.max(1, laps) * p), an = pt.x * TAU, R = .75 * Math.max(1, W / H);
        x = .5 + Math.cos(an) * t * R * H / W; y = .5 + Math.sin(an) * t * R; sc = .2 + t; a = Math.min(1, t * 5);
        break;
      }
      case 'still': break;
    }
    if (L.twinkle) {
      const n = Math.max(1, Math.round(1 + pt.lapR * 2));
      const tw = Math.pow(.5 + .5 * Math.sin(TAU * (p * n + pt.off2)), 2);
      const k = L.twinkle / 100; sc *= 1 - k + k * (.3 + .7 * tw); a *= 1 - k + k * tw;
    }
    const rot = pt.rot + TAU * Math.round(L.spin * (.5 + pt.z * .5)) * p * pt.dir;
    const col = L.colors[pt.ci % L.colors.length];
    c.globalAlpha = L.opacity / 100 * a * (.45 + .55 * pt.z);
    if (c.globalAlpha <= .005 || size * sc < .3) continue;
    c.setTransform(1, 0, 0, 1, x * W, y * H); c.rotate(rot); c.scale(sc, sc);
    if (L.glow && L.shape !== 'bokeh') { c.shadowColor = L.shape === 'image' ? 'rgba(255,255,255,.9)' : col; c.shadowBlur = size * L.glow / 40; }
    else c.shadowBlur = 0;
    drawShape(c, L, pt, size, col);
  }
  c.restore();
}

/* ---------- 背景・仕上げ ---------- */
const grainTiles = [];
for (let n = 0; n < 4; n++) {
  const g = document.createElement('canvas'); g.width = g.height = 256;
  const gc = g.getContext('2d'), id = gc.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  gc.putImageData(id, 0, 0); grainTiles.push(g);
}
let tmp = document.createElement('canvas');

function drawBg(c, p, W, H, U) {
  const B = U.bg;
  if (B.mode === 'img' && B.img) {
    const im = B.img, cover = Math.max(W / im.width, H / im.height);
    const z = 1 + B.zoom / 100 * (.5 - .5 * Math.cos(TAU * p)) + B.pan / 100 * .5;
    const dx = Math.sin(TAU * p) * B.pan / 100 * W * .2, dy = Math.sin(TAU * p * 2 + 1) * B.pan / 100 * H * .1;
    const w = im.width * cover * z, h = im.height * cover * z;
    c.save();
    c.filter = `blur(${B.blur * Math.min(W, H) / 1080}px) brightness(${B.bright}%)`;
    const bl = B.blur * 2;
    c.drawImage(im, (W - w) / 2 + dx - bl, (H - h) / 2 + dy - bl, w + bl * 2, h + bl * 2);
    c.restore();
  } else if (B.mode === 'none') {
    c.clearRect(0, 0, W, H);
  } else if (B.mode === 'solid') {
    c.fillStyle = B.c1; c.fillRect(0, 0, W, H);
  } else {
    const g = c.createLinearGradient(0, 0, W * .2, H);
    g.addColorStop(0, B.c1); g.addColorStop(.55, B.c3); g.addColorStop(1, B.c2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
}

/* ---------- 下地の動き（どれも 1周で もとに もどる） ---------- */
const BASE_COLORS = {
  sunburst: ['#ffe36b', '#ffb13b'], smoke: ['#2a1f3d', '#000000'], fire: ['#ff3d00', '#ffd23f'], stripe: ['#ffd6e7', '#ffffff'],
};
const low = document.createElement('canvas');
function lowCanvas(W, H, k) {
  const w = Math.max(16, Math.round(W / k)), h = Math.max(16, Math.round(H / k));
  if (low.width !== w || low.height !== h) { low.width = w; low.height = h; }
  const lc = low.getContext('2d'); lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1; lc.clearRect(0, 0, w, h);
  return lc;
}
function drawBase(c, p, W, H, U) {
  const B = U.base; if (B.type === 'none') return;
  const D = Math.hypot(W, H), pw = B.power / 100, am = B.amount / 100, L = B.laps;
  const r = rng(77);
  c.save();
  if (B.type === 'sunburst') {
    // 2本で 1組。1周で ちょうど L組 回る
    c.fillStyle = B.c2; c.globalAlpha = U.bg.mode === 'none' ? 0 : .5 * pw; c.fillRect(0, 0, W, H);
    const n = 2 * Math.round(6 + am * 14), step = TAU / n, rot = step * 2 * L * p;
    c.translate(W / 2, H / 2); c.rotate(rot);
    c.globalAlpha = .35 + .65 * pw; c.fillStyle = B.c1;
    for (let i = 0; i < n; i += 2) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, D, i * step, (i + 1) * step); c.closePath(); c.fill(); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * (.3 + .08 * Math.sin(TAU * p * L)));
    g.addColorStop(0, `rgba(255,255,255,${.5 * pw + .2})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  } else if (B.type === 'stripe') {
    c.fillStyle = B.c2; c.globalAlpha = U.bg.mode === 'none' ? 0 : .6 * pw; c.fillRect(0, 0, W, H);
    const sw = Math.min(W, H) * (.03 + am * .12), per = sw * 2, off = per * L * p;
    c.translate(W / 2, H / 2); c.rotate(-Math.PI / 4);
    c.globalAlpha = .3 + .7 * pw; c.fillStyle = B.c1;
    const n = Math.ceil(D / per) + 2;
    for (let k = -n; k <= n; k++) c.fillRect(k * per + off, -D, sw, D * 2);
  } else if (B.type === 'smoke') {
    const lc = lowCanvas(W, H, 10), w = lc.canvas.width, h = lc.canvas.height, n = Math.round(8 + am * 22);
    for (let i = 0; i < n; i++) {
      const edge = r() < .55, f1 = 1 + (r() * 2 | 0), o = r(), o2 = r();
      let x = r(), y = edge ? (r() < .5 ? r() * .25 : 1 - r() * .25) : .55 + r() * .5;
      x += .12 * Math.sin(TAU * (p * L * f1 + o)); y += .08 * Math.cos(TAU * (p * L + o2));
      const rad = Math.max(w, h) * (.12 + r() * .22) * (1 + .15 * Math.sin(TAU * (p * L + o)));
      const g = lc.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad);
      g.addColorStop(0, B.c1); g.addColorStop(1, B.c1 + '00');
      lc.globalAlpha = .35 + .5 * pw; lc.fillStyle = g; lc.fillRect(0, 0, w, h);
    }
    const g2 = lc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .75);
    g2.addColorStop(0, B.c2 + '00'); g2.addColorStop(1, B.c2);
    lc.globalAlpha = .5 + .5 * pw; lc.fillStyle = g2; lc.fillRect(0, 0, w, h);
    c.filter = `blur(${Math.min(W, H) * .02}px)`; c.drawImage(low, 0, 0, W, H);
  } else if (B.type === 'fire') {
    const lc = lowCanvas(W, H, 8), w = lc.canvas.width, h = lc.canvas.height, n = Math.round(60 + am * 140);
    const g0 = lc.createLinearGradient(0, h, 0, h * (1 - .35 * pw - .1));
    g0.addColorStop(0, B.c1); g0.addColorStop(1, B.c1 + '00'); lc.fillStyle = g0; lc.fillRect(0, 0, w, h);
    lc.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x0 = r(), o = r(), laps = L * (1 + (r() * 2 | 0)), t = frac(o + laps * p);
      const hgt = .25 + .55 * pw * (.5 + r() * .5);
      const x = (x0 + .03 * Math.sin(TAU * (t * 2 + o))) * w, y = h * (1.05 - t * hgt);
      const rad = Math.min(w, h) * (.03 + .06 * (1 - t)) * (.6 + am * .8);
      const g = lc.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, t < .35 ? B.c2 : B.c1); g.addColorStop(1, B.c1 + '00');
      lc.globalAlpha = (1 - t) * .55; lc.fillStyle = g; lc.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    c.globalCompositeOperation = U.bg.mode === 'none' ? 'source-over' : 'screen';
    c.filter = `blur(${Math.min(W, H) * .008}px)`; c.drawImage(low, 0, 0, W, H);
  }
  c.restore();
}

function drawFx(c, p, t, W, H, U) {
  const F = U.fx, D = Math.max(W, H), clear = U.bg.mode === 'none';
  if (!clear && F.leak) {
    c.save(); c.globalCompositeOperation = 'screen';
    const blobs = [['255,190,220', 0, .9], ['180,210,255', .33, .7], ['255,240,190', .66, .6]];
    for (const [rgb, o, rr] of blobs) {
      const an = TAU * (p + o), x = W * (.5 + .45 * Math.cos(an)), y = H * (.5 + .4 * Math.sin(an * 2 + o * 3));
      const g = c.createRadialGradient(x, y, 0, x, y, D * .45 * rr);
      g.addColorStop(0, `rgba(${rgb},${F.leak / 100 * .55})`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    c.restore();
  }
  if (F.sweep) {
    const q = frac(p * 1) * 1.6 - .3, x = q * (W + H);
    c.save(); c.globalCompositeOperation = 'screen'; c.translate(x - H, 0); c.transform(1, 0, .6, 1, 0, 0);
    const bw = D * .12, g = c.createLinearGradient(-bw, 0, bw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${F.sweep / 100 * .6})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-bw, 0, bw * 2, H); c.restore();
  }
  if (!clear && F.rgb) {
    if (tmp.width !== W || tmp.height !== H) { tmp.width = W; tmp.height = H; }
    const tc = tmp.getContext('2d'), o = F.rgb / 100 * D * .006 * (1 + .5 * Math.sin(TAU * p * 3));
    tc.globalCompositeOperation = 'copy'; tc.drawImage(c.canvas, 0, 0);
    tc.globalCompositeOperation = 'multiply'; tc.fillStyle = '#f00'; tc.fillRect(0, 0, W, H);
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = .5; c.drawImage(tmp, o, 0); c.drawImage(tmp, -o, 0); c.restore();
  }
  if (!clear && F.vig) {
    const g = c.createRadialGradient(W / 2, H / 2, D * .25, W / 2, H / 2, D * .75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${F.vig / 100 * .8})`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  if (!clear && F.grain) {
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = F.grain / 100 * .5;
    c.fillStyle = c.createPattern(grainTiles[Math.floor(t * 12) % 4], 'repeat'); c.fillRect(0, 0, W, H); c.restore();
  }
  if (F.frame) {
    const b = F.frame / 1000 * Math.min(W, H) * 1.0, r = b * 1.2;
    c.save(); c.fillStyle = F.frameCol; c.beginPath(); c.rect(0, 0, W, H);
    c.roundRect(b, b, W - b * 2, H - b * 2, r); c.fill('evenodd'); c.restore();
  }
}

export const PRESETS = {
  'キラキラ': () => ({ bg: { mode: 'grad', c1: '#c9d8ff', c2: '#ffe1f0', c3: '#ffffff' }, fx: { leak: 40, sweep: 0, vig: 10, grain: 6, rgb: 0 },
    layers: [newLayer('sparkle', { count: 26, size: 3.5, motion: 'float', twinkle: 70, glow: 60, colors: ['#ffffff', '#ffe066', '#8fc4ff'] }),
      newLayer('heart', { count: 14, size: 2.2, motion: 'up', speed: 1, twinkle: 30, colors: ['#ff8fc2', '#ffffff', '#86b8ff'], glow: 40 }),
      newLayer('bokeh', { count: 22, size: 7, motion: 'up', speed: 1, glow: 0, opacity: 60, blend: 'screen', twinkle: 20, colors: ['#ffffff', '#ffd1ea', '#bfe1ff'] }),
      newLayer('shard', { count: 18, size: 3, motion: 'up', spin: 1, twinkle: 30, glow: 10, opacity: 60, colors: ['#b9d4ff', '#ffc2e0', '#fff1a8'] })] }),
  '夜空': () => ({ bg: { mode: 'grad', c1: '#0b1030', c2: '#3a2a6b', c3: '#1a1f4f' }, fx: { leak: 20, sweep: 0, vig: 40, grain: 10, rgb: 0 },
    layers: [newLayer('sparkle', { count: 10, size: 3, motion: 'still', twinkle: 100, glow: 80, colors: ['#ffffff', '#fff2a8', '#bfe0ff'] }),
      newLayer('dot', { count: 160, size: 1.2, motion: 'left', speed: 1, sway: 0, twinkle: 70, glow: 40, depth: 90, colors: ['#ffffff', '#d7e6ff', '#fff4c9'] }),
      newLayer('star', { count: 8, size: 2, motion: 'diag', speed: 1, spin: 1, twinkle: 50, glow: 60, colors: ['#fff6b0', '#ffffff', '#ffd1f0'] })] }),
  'ハート': () => ({ bg: { mode: 'grad', c1: '#ffd3e6', c2: '#ff9fc6', c3: '#fff0f6' }, fx: { leak: 35, sweep: 30, vig: 10, grain: 5, rgb: 0 },
    layers: [newLayer('heart', { count: 30, size: 3.5, motion: 'up', speed: 1, spin: 0, sway: 50, twinkle: 20, glow: 30, colors: ['#ffffff', '#ff6fa8', '#ffb3d1'] }),
      newLayer('bokeh', { count: 18, size: 8, motion: 'float', blend: 'screen', opacity: 70, glow: 0, colors: ['#ffffff', '#ffd6e8', '#fff'] }),
      newLayer('sparkle', { count: 12, size: 2.5, motion: 'float', twinkle: 90, glow: 60, colors: ['#ffffff'] })] }),
  '桜': () => ({ bg: { mode: 'grad', c1: '#cfe8ff', c2: '#ffe6ef', c3: '#fff9fb' }, fx: { leak: 30, sweep: 0, vig: 8, grain: 5, rgb: 0 },
    layers: [newLayer('petal', { count: 45, size: 2.4, motion: 'diag', speed: 1, spin: 2, sway: 60, twinkle: 0, glow: 0, opacity: 95, depth: 80, colors: ['#ffc7da', '#ffe0ea', '#ffb0c8'] }),
      newLayer('bokeh', { count: 14, size: 9, motion: 'float', blend: 'screen', opacity: 50, glow: 0, colors: ['#ffffff', '#ffe3ee', '#fff'] })] }),
  '炎': () => ({ bg: { mode: 'grad', c1: '#2a0500', c2: '#ff7a1a', c3: '#a01d00' }, fx: { leak: 45, sweep: 0, vig: 45, grain: 12, rgb: 25 },
    layers: [newLayer('dot', { count: 140, size: 1.4, motion: 'up', speed: 2, sway: 70, twinkle: 70, glow: 80, blend: 'lighter', depth: 90, colors: ['#ffd36b', '#ff8a2a', '#fff1b5'] }),
      newLayer('shard', { count: 20, size: 2.5, motion: 'up', speed: 1, spin: 2, twinkle: 40, glow: 50, blend: 'lighter', opacity: 70, colors: ['#ff6a00', '#ffb400', '#ff3b1f'] })] }),
  'ゆき': () => ({ bg: { mode: 'grad', c1: '#9fb7d9', c2: '#e9f0fb', c3: '#cbd9ee' }, fx: { leak: 15, sweep: 0, vig: 20, grain: 8, rgb: 0 },
    layers: [newLayer('snow', { count: 160, size: 1.6, motion: 'down', speed: 1, sway: 60, twinkle: 0, glow: 0, depth: 90, colors: ['#ffffff'] })] }),
  '電脳': () => ({ bg: { mode: 'grad', c1: '#120a2a', c2: '#3b0a55', c3: '#0d2a4f' }, fx: { leak: 25, sweep: 40, vig: 35, grain: 15, rgb: 60 },
    layers: [newLayer('shard', { count: 26, size: 4, motion: 'up', speed: 1, spin: 1, twinkle: 50, glow: 70, blend: 'lighter', opacity: 70, colors: ['#ff3bd4', '#3bd9ff', '#a66bff'] }),
      newLayer('ring', { count: 12, size: 4, motion: 'out', speed: 1, twinkle: 0, glow: 60, blend: 'lighter', colors: ['#3bd9ff', '#ff3bd4'] }),
      newLayer('sparkle', { count: 16, size: 3, motion: 'float', twinkle: 100, glow: 80, colors: ['#ffffff', '#ffb8f2'] })] }),
};

export function newUgoku(name){
  const P = (PRESETS[name] || PRESETS['キラキラ'])();
  return {
    loop: 6,
    bg: Object.assign({ mode: 'grad', c1: '#c9d8ff', c2: '#ffe1f0', c3: '#ffffff', blur: 0, bright: 100 }, P.bg),
    base: { type: P.base || 'none', c1: '#ffe36b', c2: '#ffb13b', laps: 1, power: 70, amount: 50 },
    fx: Object.assign({ leak: 35, sweep: 0, vig: 15, grain: 8, rgb: 0, frame: 0, frameCol: '#ffffff' }, P.fx),
    layers: P.layers
  };
}

export function newUgokuLayer(project, name){
  const l = newBaseLayer('動く背景', []);
  l.kind = 'ugoku';
  l.ugoku = newUgoku(name);
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

/** その 時こくの 1まい */
export function ugokuCanvas(l, time, project){
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._ugC || l._ugC.width !== w || l._ugC.height !== h){
    l._ugC = document.createElement('canvas');
    l._ugC.width = w; l._ugC.height = h;
    l._ugC.complete = true; l._ugC.naturalWidth = w; l._ugC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const U = l.ugoku, c = l._ugC.getContext('2d');
  const s = l.span;
  const t = time - (s && s.from > 0 ? s.from : 0);
  const p = frac(t / Math.max(0.5, U.loop || 6));
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.filter = 'none';
  c.clearRect(0, 0, w, h);
  drawBg(c, p, w, h, U);
  drawBase(c, p, w, h, U);
  for (let i = U.layers.length - 1; i >= 0; i--) drawLayer(c, U.layers[i], p, w, h);
  c.setTransform(1, 0, 0, 1, 0, 0); c.shadowBlur = 0; c.filter = 'none';
  drawFx(c, p, t, w, h, U);
  return l._ugC;
}
