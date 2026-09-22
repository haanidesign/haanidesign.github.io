/* ステージ（プレビュー）に えがく。 */
import { S, clamp, findClip } from './state.js';
import { MEDIA } from './media.js';

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

export function renderStage(t = S.time, handles = true) {
  if (!G) return;
  G.setTransform(1, 0, 0, 1, 0, 0);
  G.globalAlpha = 1; G.filter = 'none';
  G.fillStyle = S.bg; G.fillRect(0, 0, S.W, S.H);

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

    if (c.kind === 'text') drawText(c);
    else {
      const m = MEDIA.get(c.mid);
      const el = m && m.el;
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
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1; G.filter = 'none';
  if (handles && !S.playing) drawHandles();
}

function fitSize(c, m) {
  const sw = m.w || S.W, sh = m.h || S.H;
  if (c.fit === 'fill') return { w: S.W, h: S.H };
  const s = c.fit === 'cover' ? Math.max(S.W / sw, S.H / sh) : Math.min(S.W / sw, S.H / sh);
  return { w: sw * s, h: sh * s };
}

function drawText(c) {
  const T = c.text;
  const lines = String(T.str).split('\n');
  const lh = T.size * 1.32;
  G.font = `${T.weight} ${T.size}px 'M PLUS Rounded 1c', sans-serif`;
  G.textAlign = T.align; G.textBaseline = 'middle';
  G.lineJoin = 'round'; G.miterLimit = 2;
  const ax = T.align === 'left' ? -S.W / 2 + 70 : T.align === 'right' ? S.W / 2 - 70 : 0;
  const y0 = -(lines.length - 1) * lh / 2;
  if (T.bgOn) {
    let wMax = 0;
    lines.forEach(l => wMax = Math.max(wMax, G.measureText(l).width));
    const pad = T.size * 0.36;
    const bx = T.align === 'left' ? ax - pad : T.align === 'right' ? ax - wMax - pad : -wMax / 2 - pad;
    const bw = wMax + pad * 2, bh = lines.length * lh + pad;
    G.fillStyle = T.bgColor;
    G.strokeStyle = '#1E1C14'; G.lineWidth = Math.max(3, T.size * 0.07);
    G.beginPath();
    if (G.roundRect) G.roundRect(bx, y0 - lh / 2 - pad / 2, bw, bh, T.size * 0.22);
    else G.rect(bx, y0 - lh / 2 - pad / 2, bw, bh);
    G.fill(); G.stroke();
  }
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    if (T.sw > 0) { G.strokeStyle = T.stroke; G.lineWidth = T.sw; G.strokeText(l, ax, y); }
    G.fillStyle = T.color; G.fillText(l, ax, y);
  });
}

/* えらんで いる ふだの わくと つまみ */
export function clipBox(c) {
  const m = c.mid ? MEDIA.get(c.mid) : null;
  let w = S.W, h = S.H;
  if (c.kind === 'text') {
    const T = c.text;
    G.font = `${T.weight} ${T.size}px 'M PLUS Rounded 1c', sans-serif`;
    const lines = String(T.str).split('\n');
    w = Math.max(40, ...lines.map(l => G.measureText(l).width)) + T.size * .5;
    h = lines.length * T.size * 1.32 + T.size * .3;
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
