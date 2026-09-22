/* ステージ（プレビュー）に えがく。 */
import { S, clamp, findClip } from './state.js?v=6';
import { MEDIA, animFrame } from './media.js?v=6';
import { drawText as paintText, textBox } from './text.js?v=6';
import { beatOn, beatAt } from './beat.js?v=6';

let cv = null, G = null;
export function useCanvas(el) { cv = el; G = el.getContext('2d'); }
export const canvas = () => cv;

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
  if (buf.width !== S.W || buf.height !== S.H) { buf.width = S.W; buf.height = S.H; }
  return bufG;
}
/** 色の ひとつの すじ だけ 取り出す（色ずれ 用） */
function channel(src, color) {
  if (!buf2) { buf2 = document.createElement('canvas'); buf2G = buf2.getContext('2d'); }
  if (buf2.width !== S.W || buf2.height !== S.H) { buf2.width = S.W; buf2.height = S.H; }
  const g = buf2G;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, S.W, S.H);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color; g.fillRect(0, 0, S.W, S.H);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return buf2;
}
const M = () => S.master || {};
const needsBuf = () => {
  const m = M();
  return (m.br !== undefined && m.br !== 100) || (m.ct !== undefined && m.ct !== 100)
    || (m.sa !== undefined && m.sa !== 100) || m.rgb > 0;
};
const anyMaster = () => {
  const m = M();
  return needsBuf() || m.vignette > 0 || m.grain > 0 || m.flash > 0 || m.shake > 0 || m.zoom > 0;
};
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
function masterOver(g, t) {
  const m = M();
  const ph = phase(t);
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
  if (m.grain > 0) {
    if (!grainTile) grainTile = makeGrain();
    g.save();
    g.globalAlpha = Math.min(.5, m.grain * .5);
    g.globalCompositeOperation = 'overlay';
    const p = g.createPattern(grainTile, 'repeat');
    g.translate((Math.random() * 40) | 0, (Math.random() * 40) | 0);
    g.fillStyle = p; g.fillRect(-40, -40, S.W + 80, S.H + 80);
    g.restore();
  }
}

export function renderStage(t = S.time, handles = true) {
  if (!G) return;
  const m = M();
  const useBuf = needsBuf();
  const g = useBuf ? buffer() : G;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.filter = 'none';
  g.fillStyle = S.bg; g.fillRect(0, 0, S.W, S.H);

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
    G.fillStyle = '#000'; G.fillRect(0, 0, S.W, S.H);
    G.filter = `brightness(${m.br === undefined ? 100 : m.br}%) contrast(${m.ct === undefined ? 100 : m.ct}%) saturate(${m.sa === undefined ? 100 : m.sa}%)`;
    if (m.rgb > 0) {
      // 赤と 水いろに 分けて、左右に ずらして かさねる＝色ずれ
      const d = m.rgb * S.W * .01;
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
  masterOver(G, t);
  G.setTransform(1, 0, 0, 1, 0, 0);
  G.globalAlpha = 1; G.filter = 'none';
  if (handles && !S.playing) drawHandles();
}

function paintScene(G, t) {

  for (const { c } of activeClips(t)) {
    if (c.kind === 'audio') continue;
    const local = t - c.start;
    let alpha = c.opacity * fadeAlpha(c, local);
    let sc = 1, dy = 0;
    const p = clamp(local / Math.min(0.5, c.dur), 0, 1);
    if (c.anim === 'fade') alpha *= p;
    if (c.anim === 'zoom') sc = 0.86 + 0.14 * p;
    if (c.anim === 'up') dy = (1 - p) * S.H * 0.06;
    if (c.anim === 'kenburns') sc = 1.06 + 0.10 * (local / c.dur);
    if (alpha <= 0.002) continue;

    G.save();
    G.globalAlpha = clamp(alpha, 0, 1);
    G.translate(S.W / 2 + c.x, S.H / 2 + c.y + dy);
    G.rotate(c.rot * Math.PI / 180);
    G.scale(c.scale * sc, c.scale * sc);

    if (c.kind === 'text') paintText(G, c, local, t);
    else if (c.kind === 'color') {
      if (c.grad) {
        const a = (c.gradDir || 0) * Math.PI / 180;
        const dx = Math.cos(a) * S.W / 2, dy = Math.sin(a) * S.H / 2;
        const gr = G.createLinearGradient(-dx, -dy, dx, dy);
        gr.addColorStop(0, c.color); gr.addColorStop(1, c.color2 || c.color);
        G.fillStyle = gr;
      } else G.fillStyle = c.color;
      G.fillRect(-S.W / 2 - 2, -S.H / 2 - 2, S.W + 4, S.H + 4);
    }
    else {
      const m = MEDIA.get(c.mid);
      const el = m && m.el;
      const bmp = m && m.anim ? animFrame(m, local * (c.speed || 1)) : null;
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
      } else if (m) {
        // まだ 絵が 出ない あいだは 見本の絵を 置いておく
        if (m.poster) {
          const { w, h } = fitSize(c, m);
          try { G.drawImage(m.poster, -w / 2, -h / 2, w, h); } catch (e) { }
        }
      }
    }
    G.restore();
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
  const m = c.mid ? MEDIA.get(c.mid) : null;
  let w = S.W, h = S.H;
  if (c.kind === 'text') {
    const bx = textBox(G, c.text);
    w = Math.max(40, bx.w); h = bx.h;
  } else if (c.kind === 'color') {
    w = S.W; h = S.H;
  } else if (m) { const f = fitSize(c, m); w = f.w; h = f.h; }
  return { w: w * c.scale, h: h * c.scale };
}
function drawHandles() {
  const f = findClip(S.sel); if (!f || f.c.kind === 'audio') return;
  const c = f.c;
  const t = S.time;
  if (t < c.start || t >= c.start + c.dur) return;
  const { w, h } = clipBox(c);
  G.save();
  G.translate(S.W / 2 + c.x, S.H / 2 + c.y);
  G.rotate(c.rot * Math.PI / 180);
  G.strokeStyle = '#E1DD60'; G.lineWidth = 5; G.setLineDash([16, 11]);
  G.strokeRect(-w / 2, -h / 2, w, h);
  G.setLineDash([]);
  G.strokeStyle = '#1E1C14'; G.lineWidth = 2.5; G.strokeRect(-w / 2, -h / 2, w, h);
  for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    G.fillStyle = '#E1DD60';
    G.beginPath(); G.arc(hx * w / 2, hy * h / 2, 16, 0, 7); G.fill(); G.stroke();
  }
  G.restore();
}
