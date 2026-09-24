/* ステージ（プレビュー）に えがく。 */
import { S, clamp, findClip } from './state.js?v=61';
import { MEDIA, animFrame } from './media.js?v=61';
import { drawText as paintText, textBox, glyphSpots } from './text.js?v=61';
import { beatOn, beatAt } from './beat.js?v=61';
import { drawPat, drawDeco } from './pattern.js?v=61';
import { drawTrans } from './trans.js?v=61';
import { camAt } from './camera.js?v=61';
import { draw as jzDraw } from './jz.js?v=61';

/* えがく 先は 2つ。
     out  … 作品の 大きさ そのまま。書き出し・録画・見本の 絵に つかう
     view … 画面に 出す ぶん。指で 動かした 分だけ ずらして えがく。
             わくの 外も うっすら 見える ように する（アニメ工房と 同じ） */
let out = null, O = null;
let vcv = null, V = null;

/* ---- 作業中の 画質 ----
   動画を のせると、毎コマ 原寸で 描き直すのが おもい。
   作って いる あいだだけ 小さく 描いて、画面で ひきのばす。
   書き出す ときは かならず 原寸に もどす。 */
export const quality = () => clamp(S.quality || 1, .2, 1);
export function setQuality(v) {
  S.quality = clamp(+v || 1, .2, 1);
}
const ow = () => Math.max(2, Math.round(S.W * quality()));
const oh = () => Math.max(2, Math.round(S.H * quality()));

export function useCanvas(el) {
  vcv = el;
  V = el.getContext('2d');
  outCanvas();
}
export function outCanvas() {
  if (!out) { out = document.createElement('canvas'); O = out.getContext('2d'); }
  if (out.width !== ow() || out.height !== oh()) { out.width = ow(); out.height = oh(); }
  return out;
}
export const canvas = () => outCanvas();
export const viewCanvas = () => vcv;

/* ---- 見え方（指で 動かす ぶん） ---- */
export const view = { x: 0, y: 0, z: 1 };
/** 作品の 中の ところ → 画面の ところ */
export function toScreen(px, py) {
  const r = vcv.getBoundingClientRect();
  return {
    x: r.width / 2 + (px - S.W / 2) * view.z + view.x,
    y: r.height / 2 + (py - S.H / 2) * view.z + view.y
  };
}
/** 画面の ところ → 作品の 中の ところ */
export function toProject(sx, sy) {
  const r = vcv.getBoundingClientRect();
  return {
    x: (sx - r.left - r.width / 2 - view.x) / view.z + S.W / 2,
    y: (sy - r.top - r.height / 2 - view.y) / view.z + S.H / 2
  };
}
/** 画面に ちょうど おさまる 大きさに もどす */
export function fitView(margin = 0.92) {
  if (!vcv) return;
  const r = vcv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  view.z = Math.min(r.width / S.W, r.height / S.H) * margin;
  view.x = 0; view.y = 0;
}
export function zoomAt(sx, sy, k) {
  const before = toProject(sx, sy);
  view.z = clamp(view.z * k, 0.03, 8);
  const after = toProject(sx, sy);
  view.x += (after.x - before.x) * view.z;
  view.y += (after.y - before.y) * view.z;
}
export function panView(dx, dy) { view.x += dx; view.y += dy; }

export function activeClips(t) {
  const out = [];
  for (let i = S.tracks.length - 1; i >= 0; i--) {   // 下の段から さきに えがく
    const tr = S.tracks[i];
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      if (t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6) out.push({ c, tr });
    }
  }
  return out;
}
export function fadeAlpha(c, local) {
  let a = 1;
  if (c.fin > 0) a *= clamp(local / c.fin, 0, 1);
  if (c.fout > 0) a *= clamp((c.dur - local) / c.fout, 0, 1);
  return a;
}
const filterStr = f =>
  `brightness(${f.br}%) contrast(${f.ct}%) saturate(${f.sa}%)` +
  (f.bl ? ` blur(${f.bl}px)` : '') + (f.hue ? ` hue-rotate(${f.hue}deg)` : '') +
  (f.sepia ? ` sepia(${f.sepia}%)` : '');

/* ---------- 仕上げ（マスターFX） ---------- */
let buf = null, bufG = null, grainTile = null, buf2 = null, buf2G = null;
function buffer() {
  if (!buf) { buf = document.createElement('canvas'); bufG = buf.getContext('2d'); }
  if (buf.width !== ow() || buf.height !== oh()) { buf.width = ow(); buf.height = oh(); }
  return bufG;
}
/** 色の ひとつの すじ だけ 取り出す（色ずれ 用） */
function channel(src, color) {
  if (!buf2) { buf2 = document.createElement('canvas'); buf2G = buf2.getContext('2d'); }
  if (buf2.width !== ow() || buf2.height !== oh()) { buf2.width = ow(); buf2.height = oh(); }
  const g = buf2G;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, buf2.width, buf2.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color; g.fillRect(0, 0, buf2.width, buf2.height);
  /* もとの 絵は かならず 下じきで ぬりつぶして あるので すきまが ない。
     すけ ぐあいを もどす ための もう 1まいは いらない（ここが いちばん おもかった）。 */
  g.globalCompositeOperation = 'source-over';
  return buf2;
}
const M = () => S.master || {};
/* かるく して いる あいだ、さいせい中だけ おもい しあげを 休む。
   ざらざら（グレイン）と 色ずれは 1コマに 何回も 全面を ぬる ので いちばん おもい。
   止めて いる あいだは ちゃんと 見える。書き出しは もちろん そのまま。 */
const cheapFx = () => S.playing && quality() < 1;
const rgbNow = () => (cheapFx() || S.noBg) ? 0 : (M().rgb || 0);
const grainNow = () => cheapFx() ? 0 : (M().grain || 0);
const needsBuf = () => {
  const m = M();
  return (m.br !== undefined && m.br !== 100) || (m.ct !== undefined && m.ct !== 100)
    || (m.sa !== undefined && m.sa !== 100) || rgbNow() > 0;
};
const anyMaster = () => {
  const m = M();
  return needsBuf() || m.vignette > 0 || m.grain > 0 || m.flash > 0 || m.shake > 0 || m.zoom > 0
    || m.slice > 0 || m.block > 0 || m.scan > 0 || m.invert > 0 || m.bloom > 0 || m.lines > 0
    || m.vhs > 0 || m.strobe > 0 || m.burn > 0 || m.scratch > 0 || m.snow > 0
    || m.bars > 0 || m.sparkle > 0 || m.flare > 0 || m.mosaic > 0 || m.shutter > 0 || m.halo > 0;
};
/* ---------- コマ打ち ----------
   S.step が 12 なら 1秒に 12枚ぶんしか 動かない（2コマ打ち）。
   文字PV の、すこし カクッと した 動きに なる。音は きざまない。 */
export const stepTime = t => (S.step > 0 ? Math.floor(t * S.step + 1e-6) / S.step : t);

/** 拍の 中の 位置（0→1）。BPM が なければ 1秒を 1拍と みなす */
function phase(t) {
  const b = beatOn() ? beatAt(t) : t * 2;
  return b - Math.floor(b);
}
function makeGrain() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const im = g.createImageData(n, n);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}
/* ---------- 画面ぜんたいの しかけ（あとのせ）----------
   えがき おわった 絵を 自分で 読みかえして ずらす／かさねる。
   グリッチの はやさは 24コマ を 基準に して、fps を 上げても 倍速に ならない。 */
function glitchTick(t) { return Math.floor(t * 24); }

/** ときどき だけ こわす（毎コマだと 字が 読めなく なる） */
function burst(t, salt, amt) {
  const r = rnd2(glitchTick(t) * 374761393 + salt);
  return r() < .18 + amt * .3;
}
function sliceGlitch(g, t, amt) {
  if (!burst(t, 11, amt)) return;
  const cv = g.canvas, q = quality();
  const r = rnd2(glitchTick(t) * 2654435761);
  const n = 3 + Math.floor(r() * 8 * amt);
  for (let i = 0; i < n; i++) {
    const y = r() * S.H, h = S.H * (.01 + r() * .08);
    const dx = (r() - .5) * S.W * .12 * amt;
    try {
      g.drawImage(cv, 0, y * q, cv.width, h * q, dx, y, S.W, h);
    } catch (e) { }
  }
}
function blockGlitch(g, t, amt) {
  if (!burst(t, 29, amt)) return;
  const cv = g.canvas, q = quality();
  const r = rnd2(glitchTick(t) * 40503 + 7);
  const n = 2 + Math.floor(r() * 7 * amt);
  for (let i = 0; i < n; i++) {
    const w = S.W * (.05 + r() * .22), h = S.H * (.03 + r() * .14);
    const x = r() * (S.W - w), y = r() * (S.H - h);
    const dx = (r() - .5) * S.W * .1 * amt, dy = (r() - .5) * S.H * .04 * amt;
    try {
      g.drawImage(cv, x * q, y * q, w * q, h * q, x + dx, y + dy, w, h);
    } catch (e) { }
  }
}
function scanLines(g, amt) {
  const gap = Math.max(2, Math.round(S.H / 220));
  g.save();
  g.globalAlpha = Math.min(.5, amt * .35);
  g.fillStyle = '#000';
  for (let y = 0; y < S.H; y += gap * 2) g.fillRect(0, y, S.W, gap);
  g.restore();
}
let bloomCv = null, bloomG = null;
function bloomPass(g, amt) {
  const cv = g.canvas;
  const bw = Math.max(32, Math.round(S.W / 4)), bh = Math.max(18, Math.round(S.H / 4));
  if (!bloomCv) { bloomCv = document.createElement('canvas'); bloomG = bloomCv.getContext('2d'); }
  if (bloomCv.width !== bw || bloomCv.height !== bh) { bloomCv.width = bw; bloomCv.height = bh; }
  // 1/4 に 小さく してから ぼかす。全面を ぼかすより ずっと かるい
  bloomG.setTransform(1, 0, 0, 1, 0, 0);
  bloomG.globalCompositeOperation = 'source-over';
  bloomG.clearRect(0, 0, bw, bh);
  bloomG.filter = 'brightness(170%) contrast(150%)';
  try { bloomG.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bw, bh); } catch (e) { }
  bloomG.filter = 'none';
  g.save();
  g.globalAlpha = Math.min(.6, amt * .5);
  g.globalCompositeOperation = 'lighter';
  g.filter = `blur(${Math.max(1, S.W * .0025 * amt)}px)`;
  try { g.drawImage(bloomCv, 0, 0, S.W, S.H); } catch (e) { }
  g.filter = 'none';
  g.restore();
}
function speedLines(g, t, amt) {
  const ph = phase(t);
  const k = Math.pow(1 - ph, 3) * amt;
  if (k < .02) return;
  const r = rnd2(Math.floor(t * 24) * 99991);
  const cx = S.W / 2, cy = S.H / 2, R = Math.hypot(S.W, S.H);
  g.save();
  g.globalAlpha = Math.min(.8, k);
  g.strokeStyle = '#fff';
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2, inn = R * (.3 + r() * .16);
    g.lineWidth = S.W * .001 * (.5 + r() * 3);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }
  g.restore();
}
function invertPass(g, t, amt) {
  const ph = phase(t);
  if (Math.pow(1 - ph, 10) * amt < .35) return;
  g.save();
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#fff'; g.fillRect(0, 0, S.W, S.H);
  g.restore();
}
function rnd2(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let x = Math.imul(a ^ a >>> 15, 1 | a);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}

/* ---- ここから 足した 画面効果 ---- */
function vhsRoll(g, t, amt) {
  const cv = g.canvas, q = quality();
  const y = ((t * 40 * amt) % (S.H + 200)) - 100;
  const h = S.H * .09;
  try {
    g.drawImage(cv, 0, y * q, cv.width, h * q, S.W * .02 * amt, y, S.W, h);
  } catch (e) { }
  g.save();
  g.globalAlpha = .22 * amt; g.fillStyle = '#fff';
  g.fillRect(0, y, S.W, h * .3);
  g.restore();
}
function strobe(g, t, amt) {
  if (Math.floor(t * 24) % 2) return;
  g.save(); g.globalAlpha = Math.min(.85, amt * .7);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S.W, S.H); g.restore();
}
function filmBurn(g, t, amt) {
  const r = rnd2(Math.floor(t * 24) * 7717);
  if (r() > .1 + amt * .12) return;
  const cx = S.W * r(), cy = S.H * r();
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(S.W, S.H) * (.2 + r() * .4));
  gr.addColorStop(0, `rgba(255,190,90,${.75 * amt})`);
  gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr; g.fillRect(0, 0, S.W, S.H); g.restore();
}
function filmScratch(g, t, amt) {
  const r = rnd2(Math.floor(t * 24) * 20011);
  g.save(); g.globalAlpha = .35 * amt; g.strokeStyle = '#fff';
  const n = 1 + Math.floor(r() * 3 * amt);
  for (let i = 0; i < n; i++) {
    const x = r() * S.W;
    g.lineWidth = Math.max(1, S.W * .0008 * (.5 + r()));
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - .5) * 12, S.H); g.stroke();
  }
  g.restore();
}
function noiseSnow(g, t, amt) {
  if (!grainTile) grainTile = makeGrain();
  g.save();
  g.globalAlpha = Math.min(.8, amt * .55);
  const pat = g.createPattern(grainTile, 'repeat');
  g.translate((Math.random() * 60) | 0, (Math.random() * 60) | 0);
  g.fillStyle = pat; g.fillRect(-60, -60, S.W + 120, S.H + 120);
  g.restore();
}
function colorBar(g, t, amt) {
  if (rnd2(Math.floor(t * 24) * 33377)() > .06 + amt * .08) return;
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  g.save(); g.globalAlpha = Math.min(.9, amt);
  const bw = S.W / cols.length;
  cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw, 0, bw + 1, S.H); });
  g.restore();
}
function sparkle(g, t, amt) {
  const r = rnd2(Math.floor(t * 12) * 60013);
  const n = Math.floor(2 + r() * 5 * amt);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = r() * S.W, y = r() * S.H, L = S.W * .012 * (.6 + r() * 2.4);
    g.globalAlpha = (.4 + r() * .6) * amt;
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, S.W * .0016);
    g.beginPath();
    g.moveTo(x - L, y); g.lineTo(x + L, y);
    g.moveTo(x, y - L); g.lineTo(x, y + L);
    g.stroke();
  }
  g.restore();
}
function flare(g, t, amt) {
  const ph2 = phase(t);
  const a = Math.pow(1 - ph2, 3) * amt;
  if (a < .03) return;
  const y = S.H * .42;
  const gr = g.createLinearGradient(0, y, S.W, y);
  gr.addColorStop(0, 'rgba(120,190,255,0)');
  gr.addColorStop(.5, `rgba(150,210,255,${Math.min(.8, a)})`);
  gr.addColorStop(1, 'rgba(120,190,255,0)');
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr; g.fillRect(0, y - S.H * .02, S.W, S.H * .04); g.restore();
}
function mosaicPass(g, t, amt) {
  const cv = g.canvas, q = quality();
  const n = Math.max(8, Math.round(120 - amt * 100));
  if (!buf2) { buf2 = document.createElement('canvas'); buf2G = buf2.getContext('2d'); }
  const bw = n, bh = Math.max(4, Math.round(n * S.H / S.W));
  if (buf2.width !== bw || buf2.height !== bh) { buf2.width = bw; buf2.height = bh; }
  buf2G.setTransform(1, 0, 0, 1, 0, 0);
  buf2G.globalCompositeOperation = 'source-over';
  buf2G.imageSmoothingEnabled = true;
  try { buf2G.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bw, bh); } catch (e) { return; }
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha = Math.min(1, amt * 1.2);
  try { g.drawImage(buf2, 0, 0, bw, bh, 0, 0, S.W, S.H); } catch (e) { }
  g.restore();
  g.imageSmoothingEnabled = true;
}
function shutterPass(g, t, amt) {
  const ph2 = phase(t);
  const k = Math.pow(1 - ph2, 5) * amt;
  if (k < .04) return;
  const h = S.H * .5 * k;
  g.save(); g.globalAlpha = Math.min(1, k * 1.6); g.fillStyle = '#000';
  g.fillRect(0, 0, S.W, h); g.fillRect(0, S.H - h, S.W, h);
  g.restore();
}
function vignetteColor(g, amt, col) {
  const r = Math.hypot(S.W, S.H) / 2;
  const gr = g.createRadialGradient(S.W / 2, S.H / 2, r * .3, S.W / 2, S.H / 2, r);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, col);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = amt;
  g.fillStyle = gr; g.fillRect(0, 0, S.W, S.H); g.restore();
}

function masterOver(g, t) {
  const m = M();
  const ph = phase(t);
  /* さきに「絵を こわす」たぐい。かるく して いる あいだは 休む */
  if (!cheapFx()) {
    if (m.slice > 0) sliceGlitch(g, t, m.slice);
    if (m.block > 0) blockGlitch(g, t, m.block);
    if (m.vhs > 0) vhsRoll(g, t, m.vhs);
    if (m.mosaic > 0) mosaicPass(g, t, m.mosaic);
    if (m.bloom > 0) bloomPass(g, m.bloom);
    if (m.invert > 0) invertPass(g, t, m.invert);
    if (m.burn > 0) filmBurn(g, t, m.burn);
    if (m.snow > 0) noiseSnow(g, t, m.snow);
    if (m.bars > 0) colorBar(g, t, m.bars);
  }
  if (m.scratch > 0) filmScratch(g, t, m.scratch);
  if (m.strobe > 0) strobe(g, t, m.strobe);
  if (m.sparkle > 0) sparkle(g, t, m.sparkle);
  if (m.flare > 0) flare(g, t, m.flare);
  if (m.shutter > 0) shutterPass(g, t, m.shutter);
  if (m.halo > 0) vignetteColor(g, m.halo, 'rgba(255,170,90,.55)');
  if (m.scan > 0) scanLines(g, m.scan);
  if (m.lines > 0) speedLines(g, t, m.lines);
  if (m.flash > 0) {
    const a = Math.pow(1 - ph, 6) * m.flash;
    if (a > .004) { g.globalAlpha = Math.min(1, a); g.fillStyle = '#fff'; g.fillRect(0, 0, S.W, S.H); g.globalAlpha = 1; }
  }
  if (m.vignette > 0) {
    const r = Math.hypot(S.W, S.H) / 2;
    const gr = g.createRadialGradient(S.W / 2, S.H / 2, r * .45, S.W / 2, S.H / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${Math.min(.92, m.vignette)})`);
    g.fillStyle = gr; g.fillRect(0, 0, S.W, S.H);
  }
  if (grainNow() > 0) {
    if (!grainTile) grainTile = makeGrain();
    g.save();
    g.globalAlpha = Math.min(.5, grainNow() * .5);
    g.globalCompositeOperation = 'overlay';
    const p = g.createPattern(grainTile, 'repeat');
    g.translate((Math.random() * 40) | 0, (Math.random() * 40) | 0);
    g.fillStyle = p; g.fillRect(-40, -40, S.W + 80, S.H + 80);
    g.restore();
  }
}

/** 作品そのもの（書き出し・録画・見本の絵） */
export function renderOut(t = S.time) {
  outCanvas();
  if (!O) return;
  paintFull(O, t);
  return out;
}
/** 原寸で 1枚 焼く（書き出し・写真 用）。画質は そのあと もとに もどす */
export function renderFull(t = S.time) {
  const keep = quality();
  setQuality(1);
  const c = renderOut(t);
  setQuality(keep);
  outCanvas();
  return c;
}

/** 画面に 出す ぶん。わくの 外も うっすら 見せる */
export function renderStage(t = S.time, handles = true) {
  if (!V || !vcv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = vcv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (vcv.width !== w || vcv.height !== h) { vcv.width = w; vcv.height = h; }

  renderOut(t);                       // わくの 中は いつも これ

  V.setTransform(1, 0, 0, 1, 0, 0);
  V.globalAlpha = 1; V.filter = 'none';
  V.clearRect(0, 0, w, h);

  const z = view.z * dpr;
  const cx = w / 2 + view.x * dpr, cy = h / 2 + view.y * dpr;
  const bw = S.W * z, bh = S.H * z;
  const bx = cx - bw / 2, by = cy - bh / 2;

  // わくの 外が 見えて いる ときだけ、外の ぶんも えがく
  const covers = bx <= 0 && by <= 0 && bx + bw >= w && by + bh >= h;
  const cheap = S.playing && quality() < 1;    // さいせい中は 外まで 描かない
  if (!covers && !cheap) {
    V.save();
    V.translate(cx, cy);
    V.scale(z, z);
    V.translate(-S.W / 2, -S.H / 2);
    paintScene(V, stepTime(t));       // はいけいを ぬらずに 中身だけ
    V.restore();
    // 外は うっすら。中に 目が いく ように
    V.save();
    V.fillStyle = 'rgba(251,250,236,.72)';
    V.beginPath();
    V.rect(0, 0, w, h);
    V.rect(bx, by, bw, bh);
    V.fill('evenodd');
    V.restore();
  }

  V.drawImage(out, bx, by, bw, bh);

  // わくの ふち
  V.save();
  V.strokeStyle = '#1E1C14';
  V.lineWidth = Math.max(1.5, 2.5 * dpr);
  V.strokeRect(bx - V.lineWidth / 2, by - V.lineWidth / 2, bw + V.lineWidth, bh + V.lineWidth);
  V.restore();

  if (handles && !S.playing) drawHandles(V, dpr);
}

/* ---------- カット間の つなぎ ----------
   前の カットの「さいごの 1枚」を 1まいだけ 焼いて とっておき、
   つなぎの あいだ ずっと それを つかう（毎コマ 2度 えがかない ため）。 */
let trCv = null, trG = null, trKey = '';
export function clearTrans() { trKey = ''; }
/** いまの カメラ。S.cams = [{at,dur,kind,seed}] */
function camNow(t) {
  const list = S.cams;
  if (!Array.isArray(list) || !list.length) return null;
  for (const x of list) {
    if (!x || !x.kind || x.kind === 'none') continue;
    const d = Math.max(.05, x.dur || 1);
    if (t >= x.at && t < x.at + d) {
      return camAt(x.kind, (t - x.at) / d, phase(t), S.W, S.H, x.seed);
    }
  }
  return null;
}

function transAt(t) {
  const list = S.trans;
  if (!Array.isArray(list)) return null;
  for (const x of list) {
    if (!x || !x.kind || x.kind === 'none') continue;
    const d = Math.max(.02, x.dur || .25);
    if (t >= x.at && t < x.at + d) return { x, p: (t - x.at) / d };
  }
  return null;
}
/** 前の カットの さいごの 1枚（とっておき） */
function outgoing(at) {
  const key = `${at}|${ow()}x${oh()}|${quality()}|${S.W}x${S.H}`;
  if (trKey === key && trCv) return trCv;
  if (!trCv) { trCv = document.createElement('canvas'); trG = trCv.getContext('2d'); }
  if (trCv.width !== ow() || trCv.height !== oh()) { trCv.width = ow(); trCv.height = oh(); }
  trG.setTransform(1, 0, 0, 1, 0, 0);
  trG.globalAlpha = 1; trG.filter = 'none';
  trG.globalCompositeOperation = 'source-over';
  trG.clearRect(0, 0, trCv.width, trCv.height);
  paintFull(trG, Math.max(0, at - 1 / Math.max(1, S.fps)), true);
  trKey = key;
  return trCv;
}

function paintFull(G, t, noTrans) {
  t = stepTime(t);
  const m = M();
  const useBuf = needsBuf();
  const g = useBuf ? buffer() : G;
  const W = S.W, H = S.H;

  const q = quality();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(q, 0, 0, q, 0, 0);
  g.globalAlpha = 1; g.filter = 'none';
  /* 下じきを ぬらない ぶん（透過PNG）では、すきまを のこす */
  if (!S.noBg) { g.fillStyle = S.bg; g.fillRect(0, 0, S.W, S.H); }

  // カメラ（カットごとの 画ぜんたいの うごき）
  const cam = camNow(t);
  if (cam) {
    g.translate(S.W / 2 + cam.x, S.H / 2 + cam.y);
    g.rotate(cam.r * Math.PI / 180);
    g.scale(cam.s, cam.s);
    g.translate(-S.W / 2, -S.H / 2);
  }

  // ゆれ・ズームは ぜんたいに かける
  if (m.shake > 0 || m.zoom > 0) {
    const ph = phase(t);
    const k = Math.pow(1 - ph, 4);
    const z = 1 + k * (m.zoom || 0) * .12;
    const sx = (Math.random() - .5) * (m.shake || 0) * S.W * .02 * (0.4 + k);
    const sy = (Math.random() - .5) * (m.shake || 0) * S.H * .02 * (0.4 + k);
    g.translate(S.W / 2 + sx, S.H / 2 + sy);
    g.scale(z, z);
    g.translate(-S.W / 2, -S.H / 2);
  }
  paintScene(g, t);
  g.setTransform(1, 0, 0, 1, 0, 0);

  if (useBuf) {
    G.setTransform(1, 0, 0, 1, 0, 0);
    G.globalAlpha = 1;
    G.globalCompositeOperation = 'source-over';
    G.clearRect(0, 0, ow(), oh());
    if (!S.noBg) { G.fillStyle = '#000'; G.fillRect(0, 0, ow(), oh()); }
    G.filter = `brightness(${m.br === undefined ? 100 : m.br}%) contrast(${m.ct === undefined ? 100 : m.ct}%) saturate(${m.sa === undefined ? 100 : m.sa}%)`;
    if (rgbNow() > 0) {
      // 赤と 水いろに 分けて、左右に ずらして かさねる＝色ずれ
      const d = rgbNow() * S.W * .01 * quality();
      const red = channel(buf, '#ff0000');
      G.drawImage(red, -d, 0);
      const cyan = channel(buf, '#00ffff');
      G.globalCompositeOperation = 'lighter';
      G.drawImage(cyan, d, 0);
      G.globalCompositeOperation = 'source-over';
    } else {
      G.drawImage(buf, 0, 0);
    }
    G.filter = 'none';
  }
  G.setTransform(q, 0, 0, q, 0, 0);
  if (!S.noBg) masterOver(G, t);

  if (!noTrans) {
    const tr = transAt(t);
    if (tr) {
      const img = outgoing(tr.x.at);
      G.setTransform(q, 0, 0, q, 0, 0);
      drawTrans(G, tr.x.kind, S.W, S.H, tr.p, { img, seed: tr.x.seed || 1 });
    }
  }
  G.setTransform(1, 0, 0, 1, 0, 0);
  G.globalAlpha = 1; G.filter = 'none';
}

/** その 時こくの ふだの すがた（うごきの ぶんだけ ずれる） */
function poseOf(c, local) {
  let alpha = c.opacity * fadeAlpha(c, local);
  let sc = 1, dy = 0;
  const p = clamp(local / Math.min(0.5, c.dur), 0, 1);
  if (c.anim === 'fade') alpha *= p;
  if (c.anim === 'zoom') sc = 0.86 + 0.14 * p;
  if (c.anim === 'up') dy = (1 - p) * S.H * 0.06;
  if (c.anim === 'kenburns') sc = 1.06 + 0.10 * (local / c.dur);
  return { alpha, sc, dy };
}

function paintScene(G, t) {
  for (const { c } of activeClips(t)) {
    if (c.kind === 'audio') continue;
    const local = t - c.start;

    /* うごきの あと（モーションブラー）。
       すこし まえの すがたを うすく かさねて、ぶれて 見せる。 */
    const mb = c.kind === 'text' ? 0 : clamp(c.mblur || 0, 0, 1);
    const steps = mb > 0 ? (quality() < 1 ? 2 : 5) : 1;

    for (let k = steps - 1; k >= 0; k--) {
      const back = k * mb * 0.05;
      const lt = local - back;
      if (lt < 0) continue;
      const pose = poseOf(c, lt);
      const fade = k === 0 ? 1 : (1 - k / steps) * .5;
      const alpha = pose.alpha * fade;
      if (alpha <= 0.002) continue;

      G.save();
      G.globalAlpha = clamp(alpha, 0, 1);
      G.translate(S.W / 2 + c.x, S.H / 2 + c.y + pose.dy);
      G.rotate(c.rot * Math.PI / 180);
      G.scale(c.scale * pose.sc, c.scale * pose.sc);

      if (c.kind === 'jz') {
        G.translate(-S.W / 2, -S.H / 2);
        /* inp は「素材の どこから えがくか」。
           ✂きる や はしを つまんだ ときに ここが 立つ ので、
           文字PV でも ちゃんと その ぶん 先から えがく。 */
        jzDraw(G, c.jz, lt + (c.inp || 0) * (c.speed || 1), S.W, S.H, S.playing && quality() < 1);
      }
      else if (c.kind === 'text') paintText(G, c, local, t);
      else if (c.kind === 'color') {
        if (c.fillOn !== false) {
          if (c.grad) {
            const a = (c.gradDir || 0) * Math.PI / 180;
            const dx = Math.cos(a) * S.W / 2, dyy = Math.sin(a) * S.H / 2;
            const gr = G.createLinearGradient(-dx, -dyy, dx, dyy);
            gr.addColorStop(0, c.color); gr.addColorStop(1, c.color2 || c.color);
            G.fillStyle = gr;
          } else G.fillStyle = c.color;
          G.fillRect(-S.W / 2 - 2, -S.H / 2 - 2, S.W + 4, S.H + 4);
        }
        // がら・かざりは 画面の はしを 0,0 に して えがく
        if ((c.pat && c.pat !== 'none') || (c.deco && c.deco !== 'none')) {
          G.save();
          G.translate(-S.W / 2, -S.H / 2);
          const o = {
            a: c.patColor || '#FFFEF7', b: c.patColor2 || '#E1DD60',
            amt: c.patAmt === undefined ? .5 : c.patAmt,
            t: lt, key: c.id, idx: c.patIdx || 0, big: c.patBig
          };
          if (c.pat && c.pat !== 'none') drawPat(G, c.pat, S.W, S.H, o);
          if (c.deco && c.deco !== 'none')
            drawDeco(G, c.deco, S.W, S.H,
              Object.assign({}, o, { a: c.decoColor || o.a, amt: c.decoAmt === undefined ? .8 : c.decoAmt }));
          G.restore();
        }
      }
      else {
        const m = MEDIA.get(c.mid);
        const el = m && m.el;
        const bmp = m && m.anim ? animFrame(m, lt * (c.speed || 1)) : null;
        if (bmp) {
          const { w, h } = fitSize(c, m);
          G.filter = filterStr(c.fx);
          try { G.drawImage(bmp, -w / 2, -h / 2, w, h); } catch (e) { }
          G.filter = 'none';
          G.restore();
          continue;
        }
        const ok = el && (c.kind === 'image' ? el.complete && el.naturalWidth : el.readyState >= 2);
        if (ok) {
          const { w, h } = fitSize(c, m);
          G.filter = filterStr(c.fx);
          try { G.drawImage(el, -w / 2, -h / 2, w, h); } catch (e) { }
          G.filter = 'none';
        } else if (m && m.poster) {
          const { w, h } = fitSize(c, m);
          try { G.drawImage(m.poster, -w / 2, -h / 2, w, h); } catch (e) { }
        }
      }
      G.restore();
    }
  }
  G.globalAlpha = 1; G.filter = 'none';
}

function fitSize(c, m) {
  const sw = m.w || S.W, sh = m.h || S.H;
  if (c.fit === 'fill') return { w: S.W, h: S.H };
  const s = c.fit === 'cover' ? Math.max(S.W / sw, S.H / sh) : Math.min(S.W / sw, S.H / sh);
  return { w: sw * s, h: sh * s };
}

/* えらんで いる ふだの わくと つまみ */
export function clipBox(c) {
  const g = O || (outCanvas(), O);
  const m = c.mid ? MEDIA.get(c.mid) : null;
  let w = S.W, h = S.H;
  if (c.kind === 'text') {
    const bx = textBox(g, c.text);
    w = Math.max(40, bx.w); h = bx.h;
  } else if (c.kind === 'color' || c.kind === 'jz') {
    w = S.W; h = S.H;
  } else if (m) { const f = fitSize(c, m); w = f.w; h = f.h; }
  return { w: w * c.scale, h: h * c.scale };
}

/** 1文字ずつの わくを 画面の ところに なおす（えらぶ・つかむ ため） */
export function charSpots(c) {
  if (!c || c.kind !== 'text' || !vcv) return [];
  const g = O || (outCanvas(), O);
  const spots = glyphSpots(g, c.text);
  const a = c.rot * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  return spots.map(sp => {
    const lx = sp.x * c.scale, ly = sp.y * c.scale;
    const px = S.W / 2 + c.x + lx * co - ly * si;
    const py = S.H / 2 + c.y + lx * si + ly * co;
    const p = toScreen(px, py);
    return {
      idx: sp.idx, ch: sp.ch,
      sx: p.x, sy: p.y,
      sw: sp.w * c.scale * view.z, sh: sp.h * c.scale * view.z,
      srot: (sp.rot || 0) + c.rot
    };
  });
}

/** つまみ（四すみ）の 画面での ところ。指で つかむ ため */
export function handlePoints(c) {
  const { w, h } = clipBox(c);
  const a = c.rot * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([hx, hy], i) => {
    const lx = hx * w / 2, ly = hy * h / 2;
    const px = S.W / 2 + c.x + lx * co - ly * si;
    const py = S.H / 2 + c.y + lx * si + ly * co;
    const p = toScreen(px, py);
    return { i, x: p.x, y: p.y, hx, hy };
  });
}

function drawHandles(g, dpr) {
  const f = findClip(S.sel);
  if (!f || f.c.kind === 'audio') return;
  const c = f.c;
  if (S.time < c.start || S.time >= c.start + c.dur) return;

  // 1文字ずつ いじる ときは、字ごとの わくを 出す
  if (c.kind === 'text' && c.text.charOn) {
    charSpots(c).forEach(sp => {
      const on = S.selChar === sp.idx;
      g.save();
      g.translate(sp.sx * dpr, sp.sy * dpr);
      if (sp.srot) g.rotate(sp.srot * Math.PI / 180);
      const w = Math.max(14, sp.sw) * dpr, h = Math.max(14, sp.sh) * dpr;
      g.lineWidth = (on ? 3 : 1.6) * dpr;
      g.strokeStyle = on ? '#F2A0B8' : 'rgba(255,254,247,.85)';
      g.setLineDash(on ? [] : [6 * dpr, 5 * dpr]);
      g.strokeRect(-w / 2, -h / 2, w, h);
      if (on) {
        g.setLineDash([]);
        g.strokeStyle = '#1E1C14'; g.lineWidth = 1.5 * dpr;
        g.strokeRect(-w / 2, -h / 2, w, h);
      }
      g.restore();
    });
    g.setLineDash([]);
  }
  const { w, h } = clipBox(c);
  const z = view.z * dpr;
  const r = vcv.getBoundingClientRect();
  g.save();
  g.translate(r.width / 2 * dpr + view.x * dpr + c.x * z, r.height / 2 * dpr + view.y * dpr + c.y * z);
  g.rotate(c.rot * Math.PI / 180);
  const W = w * z, H = h * z;
  g.strokeStyle = '#E1DD60'; g.lineWidth = 4 * dpr; g.setLineDash([14 * dpr, 10 * dpr]);
  g.strokeRect(-W / 2, -H / 2, W, H);
  g.setLineDash([]);
  g.strokeStyle = '#1E1C14'; g.lineWidth = 2 * dpr;
  g.strokeRect(-W / 2, -H / 2, W, H);
  for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.fillStyle = '#E1DD60';
    g.beginPath(); g.arc(hx * W / 2, hy * H / 2, 13 * dpr, 0, 7); g.fill(); g.stroke();
  }
  g.restore();
}
