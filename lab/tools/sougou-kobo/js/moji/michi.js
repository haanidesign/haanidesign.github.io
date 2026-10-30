/* 〰 文字のみち（kind: 'michi'）。文字のみち工房の「道に のせた 文字」を レイヤーに した もの。

   道 … 円・弧・波・うず・直線。文字を 道に そって ならべて、道の 向きに まわす。
   うごき … とめる・まわす（ぜんたいが 回る）・ながす（道の 上を 流れる）。
   600×600 の 場で 組んで、作品の 紙に おさまる 大きさで 描く。
   時間は レイヤーの「出す ところ」の はじまりが 0。 */
import { newLayer } from '../engine/layer.js?v=400';

export const MICHI_KINDS = [['circle', '円'], ['arc', '弧'], ['wave', '波'], ['spiral', 'うず'], ['line', '直線']];
export const MICHI_FONTS = [
  ['round', '丸ゴ', "'M PLUS Rounded 1c',sans-serif"],
  ['sans', 'ゴシック', "'Noto Sans JP',sans-serif"],
  ['serif', '明朝', "'Shippori Mincho',serif"],
  ['mono', '等幅', "monospace"]
];

export function newMichi(){
  return { kind: 'circle', text: 'DESIGN IN MOTION', radius: 174, bend: 142, amplitude: 60, waves: 2,
    size: 30, spacing: 2, copies: 3, font: 'round', weight: '800', align: 'middle', offset: 50,
    color: '#1E1C14', accent: '#E1DD60', scene: false, guide: false,
    motion: 'rotate', duration: 16, direction: 'forward' };
}

export function newMichiLayer(project){
  const l = newLayer('文字のみち', []);
  l.kind = 'michi';
  l.michi = newMichi();
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

const CX = 300, CY = 300, W = 600;

/* 道を 点の ならびに する（とじた 道なら closed） */
function polyline(M){
  const r = M.radius, pts = [];
  const quad = (x0, y0, cx, cy, x1, y1) => {
    for(let i = pts.length ? 1 : 0; i <= 40; i++){
      const t = i / 40, u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
  };
  switch(M.kind){
    case 'circle':
      for(let i = 0; i <= 180; i++){ const a = -Math.PI / 2 + i / 180 * Math.PI * 2; pts.push([CX + Math.cos(a) * r, CY + Math.sin(a) * r]); }
      return { pts, closed: true };
    case 'arc': {
      const x0 = CX - r * 1.4, x1 = CX + r * 1.4, y = CY + M.bend / 2;
      quad(x0, y, CX, y - M.bend * 2, x1, y);
      return { pts, closed: false };
    }
    case 'wave': {
      const x0 = 20, x1 = W - 20, n = Math.max(1, M.waves) * 2, step = (x1 - x0) / n;
      for(let i = 0; i < n; i++){
        const xa = x0 + step * i, cy = CY + (i % 2 ? M.amplitude : -M.amplitude) * 1.3;
        quad(xa, CY, xa + step / 2, cy, xa + step, CY);
      }
      return { pts, closed: false };
    }
    case 'spiral': {
      const turns = Math.max(1, M.waves) + 1, N = turns * 60;
      for(let i = 0; i <= N; i++){
        const t = i / N, a = t * turns * Math.PI * 2 - Math.PI / 2, rr = 20 + (r - 20) * t;
        pts.push([CX + Math.cos(a) * rr, CY + Math.sin(a) * rr]);
      }
      return { pts, closed: false };
    }
    default:
      return { pts: [[30, CY], [W - 30, CY]], closed: false };
  }
}

/* 長さで 引ける ように する */
function measure(pl){
  const acc = [0];
  for(let i = 1; i < pl.pts.length; i++){
    const a = pl.pts[i - 1], b = pl.pts[i];
    acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const len = acc[acc.length - 1] || 1;
  const at = (s) => {
    let lo = 0, hi = acc.length - 1;
    while(hi - lo > 1){ const m = (lo + hi) >> 1; if(acc[m] <= s) lo = m; else hi = m; }
    const a = pl.pts[lo], b = pl.pts[hi], seg = (acc[hi] - acc[lo]) || 1, u = (s - acc[lo]) / seg;
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  return { len, at };
}

let fontsIn = false;
function loadFonts(){
  if(fontsIn) return; fontsIn = true;
  const k = document.createElement('link'); k.rel = 'stylesheet';
  k.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;800&family=Noto+Sans+JP:wght@400;800&family=Shippori+Mincho:wght@400;800&display=swap';
  document.head.appendChild(k);
}

export function michiCanvas(l, time, project){
  loadFonts();
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._miC || l._miC.width !== w || l._miC.height !== h){
    l._miC = document.createElement('canvas');
    l._miC.width = w; l._miC.height = h;
    l._miC.complete = true; l._miC.naturalWidth = w; l._miC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const M = l.michi;
  const g = l._miC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  const s = l.span;
  const t = Math.max(0, time - (s && s.from > 0 ? s.from : 0));
  const k = Math.min(w, h) / W;
  g.translate(w / 2, h / 2);
  g.scale(k, k);
  g.translate(-CX, -CY);

  const pl = polyline(M), mm = measure(pl);
  const fw = M.direction !== 'reverse' ? 1 : -1;
  const q = M.motion !== 'off' ? (t / Math.max(0.5, M.duration || 16)) % 1 : 0;

  /* 飾り（差し色の 丸・点線の 輪） */
  if(M.scene){
    g.save();
    if(pl.closed || M.kind === 'spiral'){
      g.fillStyle = M.accent;
      g.beginPath(); g.arc(CX, CY, Math.max(10, M.radius * 0.42), 0, Math.PI * 2); g.fill();
      g.strokeStyle = M.color; g.lineWidth = 2; g.setLineDash([2, 8]); g.lineCap = 'round';
      g.beginPath(); g.arc(CX, CY, M.radius + M.size * 0.9, 0, Math.PI * 2); g.stroke();
    } else {
      g.fillStyle = M.accent;
      g.beginPath(); g.arc(CX, CY + (M.kind === 'arc' ? M.bend * 0.2 + 80 : 150), 46, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  if(M.motion === 'rotate'){
    g.translate(CX, CY); g.rotate(fw * q * Math.PI * 2); g.translate(-CX, -CY);
  }
  if(M.guide){
    g.save();
    g.strokeStyle = M.accent; g.lineWidth = 2; g.setLineDash([6, 6]);
    g.beginPath(); pl.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    if(pl.closed) g.closePath();
    g.stroke(); g.restore();
  }

  const fam = (MICHI_FONTS.find(f => f[0] === M.font) || MICHI_FONTS[0])[2];
  g.font = (M.weight || '800') + ' ' + M.size + 'px ' + fam;
  g.fillStyle = M.color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...String(M.text || '').replace(/\n/g, ' ')];
  const ws = chars.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + M.spacing * Math.max(0, chars.length - 1);
  const n = Math.max(1, M.copies | 0);
  const flow = M.motion === 'flow' ? fw * q * mm.len : 0;
  for(let i = 0; i < n; i++){
    const base = pl.closed ? ((M.offset + i * 100 / n) % 100) : (n === 1 ? M.offset : i * 100 / (n - 1));
    const a = pl.closed ? 'start' : (n === 1 ? M.align : (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'));
    let p = base / 100 * mm.len + flow - (a === 'middle' ? total / 2 : a === 'end' ? total : 0);
    chars.forEach((c, j) => {
      let at = p + ws[j] / 2;
      p += ws[j] + M.spacing;
      if(pl.closed || M.motion === 'flow') at = ((at % mm.len) + mm.len) % mm.len;
      else if(at < 0 || at > mm.len) return;
      const pt = mm.at(at);
      g.save();
      g.translate(pt.x, pt.y); g.rotate(pt.ang);
      g.fillText(c, 0, 0);
      g.restore();
    });
  }
  return l._miC;
}
