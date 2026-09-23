/* うしろの がら と、上に のせる かざり。
   ぜんぶ その場で えがく（絵の ファイルは つかわない）ので、
   どの 大きさで 書き出しても きれいに 出る。

   つかい方は ふたつ。
     ・色の ふだに  c.pat   … うしろの がら
     ・色の ふだに  c.deco  … 上に のせる かざり（地は ぬらない）
   どちらも 名まえで ひく。 */

const TAU = Math.PI * 2;
/** ふだ ごとに 同じ みだれ方に する ための たね */
function rnd(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hashStr = s => {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* ---------- うしろの がら ----------
   f(g, W, H, o) … o = { a:さし色, b:さし色2, amt:こさ0-1, t:秒, r:くじ } */
export const PATS = [
  ['none', 'なし', null],

  ['rays', '放射', (g, W, H, o) => {
    const n = 24, cx = W / 2, cy = H / 2, R = Math.hypot(W, H);
    g.fillStyle = o.a;
    for (let i = 0; i < n; i += 2) {
      const a0 = i / n * TAU + o.t * .04, a1 = (i + 1) / n * TAU + o.t * .04;
      g.beginPath(); g.moveTo(cx, cy);
      g.arc(cx, cy, R, a0, a1); g.closePath(); g.fill();
    }
  }],

  ['rings', '同心円', (g, W, H, o) => {
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
    g.strokeStyle = o.a; g.lineWidth = Math.max(2, W * .004);
    const gap = R / 9;
    for (let r = gap * (1 + (o.t * .1 % 1)); r < R; r += gap) {
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    }
  }],

  ['spot', 'スポットライト', (g, W, H, o) => {
    const cx = W * (.3 + .4 * o.r()), cy = H * .42;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * .55);
    gr.addColorStop(0, o.a); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }],

  ['grid', 'レトロ格子', (g, W, H, o) => {
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .002);
    const hz = H * .55, n = 14;
    for (let i = 0; i <= n; i++) {
      const x = (i / n - .5) * W * 3 + W / 2;
      g.beginPath(); g.moveTo(W / 2, hz); g.lineTo(x, H + 10); g.stroke();
    }
    for (let k = 1; k < 12; k++) {
      const p = ((k / 12) + (o.t * .08 % (1 / 12))) ** 2.2;
      const y = hz + p * (H - hz);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
  }],

  ['dots', '水玉', (g, W, H, o) => {
    const s = W / 14, r = s * .18;
    g.fillStyle = o.a;
    for (let y = 0; y < H + s; y += s)
      for (let x = 0; x < W + s; x += s) {
        const ox = (Math.round(y / s) % 2) * s / 2;
        g.beginPath(); g.arc(x + ox, y, r, 0, TAU); g.fill();
      }
  }],

  ['halftone', '網点', (g, W, H, o) => {
    const s = W / 44, cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
    g.fillStyle = o.a;
    for (let y = 0; y < H + s; y += s)
      for (let x = 0; x < W + s; x += s) {
        const d = Math.hypot(x - cx, y - cy) / R;
        const r = s * .52 * (1 - d);
        if (r > .3) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      }
  }],

  ['stripe', 'ストライプ', (g, W, H, o) => {
    const s = W / 18;
    g.fillStyle = o.a;
    for (let x = -s; x < W + s; x += s * 2) g.fillRect(x + (o.t * 18 % (s * 2)), 0, s, H);
  }],

  ['slant', 'ななめ ストライプ', (g, W, H, o) => {
    const s = W / 16;
    g.save(); g.translate(W / 2, H / 2); g.rotate(-.5); g.translate(-W, -H);
    g.fillStyle = o.a;
    for (let x = 0; x < W * 3; x += s * 2) g.fillRect(x + (o.t * 26 % (s * 2)), 0, s, H * 3);
    g.restore();
  }],

  ['check', '市松', (g, W, H, o) => {
    const s = W / 12;
    g.fillStyle = o.a;
    for (let y = 0, j = 0; y < H + s; y += s, j++)
      for (let x = 0, i = 0; x < W + s; x += s, i++)
        if ((i + j) % 2 === 0) g.fillRect(x, y, s, s);
  }],

  ['seigaiha', '青海波', (g, W, H, o) => {
    const s = W / 10;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .0022);
    for (let y = 0; y < H + s; y += s * .5)
      for (let x = 0; x < W + s; x += s) {
        const ox = (Math.round(y / (s * .5)) % 2) * s / 2;
        for (let k = 1; k <= 4; k++) {
          g.beginPath(); g.arc(x + ox, y, s * .5 * k / 4, Math.PI, 0); g.stroke();
        }
      }
  }],

  ['asanoha', '麻の葉', (g, W, H, o) => {
    const s = W / 11;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.2, W * .0018);
    for (let y = 0; y < H + s; y += s)
      for (let x = 0; x < W + s; x += s) {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU;
          g.moveTo(x, y); g.lineTo(x + Math.cos(a) * s * .5, y + Math.sin(a) * s * .5);
        }
        g.stroke();
      }
  }],

  ['contour', '等高線', (g, W, H, o) => {
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .0022);
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = H * .5
          + Math.sin(x / W * 5 + k * .55 + o.t * .5) * H * .1
          + Math.sin(x / W * 11 + k * 1.3) * H * .04
          + (k - 4) * H * .1;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }],

  ['aurora', 'オーロラ', (g, W, H, o) => {
    for (let k = 0; k < 3; k++) {
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, k % 2 ? o.a : o.b);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.globalAlpha = .5;
      g.translate(W / 2, H / 2); g.rotate(-.5 + k * .4 + Math.sin(o.t * .3 + k) * .1);
      g.fillStyle = gr;
      g.fillRect(-W, -H * (.16 + k * .05), W * 2, H * (.3 + k * .1));
      g.restore();
    }
  }],

  ['mesh', 'メッシュグラデ', (g, W, H, o) => {
    [[.25, .3, o.a], [.8, .2, o.b], [.6, .85, o.a], [.1, .8, o.b]].forEach(([px, py, c], i) => {
      const cx = W * px + Math.sin(o.t * .4 + i) * W * .04;
      const cy = H * py + Math.cos(o.t * .35 + i) * H * .05;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * .7);
      gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    });
  }],

  ['stars', '星空', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.fillStyle = o.a;
    for (let i = 0; i < 140; i++) {
      const x = r2() * W, y = r2() * H;
      const tw = .4 + .6 * Math.abs(Math.sin(o.t * 2 + i));
      const s = W * .0016 * (.6 + r2() * 2.4);
      g.globalAlpha = tw; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }],

  ['speed', '集中線', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H);
    g.strokeStyle = o.a;
    for (let i = 0; i < 70; i++) {
      const a = r2() * TAU, inn = R * (.26 + r2() * .16);
      g.lineWidth = W * .001 * (.5 + r2() * 3);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke();
    }
  }],

  ['vhs', 'VHSノイズ', (g, W, H, o) => {
    const r2 = rnd(o.seed + Math.floor(o.t * 12));
    g.fillStyle = o.a;
    for (let i = 0; i < 26; i++) {
      const y = r2() * H, h = H * .004 * (1 + r2() * 5);
      g.globalAlpha = .15 + r2() * .5;
      g.fillRect(0, y, W, h);
    }
    g.globalAlpha = 1;
  }],

  ['bigchar', '巨大文字', (g, W, H, o) => {
    const ch = o.big || '音';
    g.save();
    g.globalAlpha = .5;
    g.fillStyle = o.a;
    g.font = `900 ${H * 1.15}px 'M PLUS Rounded 1c', sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, W * .5, H * .52);
    g.restore();
  }],

  ['window', '円窓', (g, W, H, o) => {
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(W / 2, H / 2, Math.min(W, H) * .33, 0, TAU, true);
    g.fillStyle = o.a; g.fill('evenodd');
    g.restore();
  }],

  ['wave', '海の波', (g, W, H, o) => {
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 10) {
        const y = H * (.55 + k * .11)
          + Math.sin(x / W * (4 + k) + o.t * (.8 + k * .3)) * H * .035;
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      g.globalAlpha = .3 + k * .12;
      g.fillStyle = k % 2 ? o.a : o.b; g.fill();
    }
    g.globalAlpha = 1;
  }]
];

/* ---------- 上に のせる かざり ---------- */
export const DECOS = [
  ['none', 'なし', null],

  ['cross', '照準線', (g, W, H, o) => {
    const m = W * .06;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .0018);
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    g.beginPath();
    g.moveTo(W / 2, m); g.lineTo(W / 2, m + H * .05);
    g.moveTo(W / 2, H - m); g.lineTo(W / 2, H - m - H * .05);
    g.moveTo(m, H / 2); g.lineTo(m + W * .03, H / 2);
    g.moveTo(W - m, H / 2); g.lineTo(W - m - W * .03, H / 2);
    g.stroke();
  }],

  ['tombo', 'トンボ', (g, W, H, o) => {
    const m = W * .035, L = W * .03;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .0016);
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + L * sx, y);
        g.moveTo(x, y); g.lineTo(x, y + L * sy);
        g.stroke();
      });
  }],

  ['corner', 'すみの かぎ', (g, W, H, o) => {
    const m = W * .05, L = W * .06;
    g.strokeStyle = o.a; g.lineWidth = Math.max(2.5, W * .004);
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        g.beginPath();
        g.moveTo(x + L * sx, y); g.lineTo(x, y); g.lineTo(x, y + L * sy);
        g.stroke();
      });
  }],

  ['radar', 'レーダー', (g, W, H, o) => {
    const cx = W * .84, cy = H * .8, R = Math.min(W, H) * .1;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.2, W * .0014);
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, cy, R * k / 3, 0, TAU); g.stroke(); }
    const a = o.t * 2.2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  }],

  ['dim', '寸法線', (g, W, H, o) => {
    const y = H * .9, m = W * .1;
    g.strokeStyle = o.a; g.fillStyle = o.a;
    g.lineWidth = Math.max(1.2, W * .0014);
    g.beginPath();
    g.moveTo(m, y); g.lineTo(W - m, y);
    g.moveTo(m, y - 8); g.lineTo(m, y + 8);
    g.moveTo(W - m, y - 8); g.lineTo(W - m, y + 8);
    g.stroke();
    g.font = `500 ${Math.round(H * .026)}px 'M PLUS Rounded 1c', sans-serif`;
    g.textAlign = 'center';
    g.fillText(`${W} x ${H}`, W / 2, y - H * .018);
  }],

  ['bars', 'グリッド', (g, W, H, o) => {
    g.strokeStyle = o.a; g.lineWidth = Math.max(1, W * .0009);
    for (let i = 1; i < 12; i++) {
      const x = W * i / 12;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const y = H * i / 7;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
  }],

  ['barcode', 'バーコード', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    const x0 = W * .06, y0 = H * .84, w = W * .18, h = H * .07;
    g.fillStyle = o.a;
    let x = x0;
    while (x < x0 + w) {
      const bw = W * .001 * (1 + r2() * 4);
      if (r2() > .35) g.fillRect(x, y0, bw, h);
      x += bw + W * .0016;
    }
  }],

  ['wavebar', '波形', (g, W, H, o) => {
    const n = 46, x0 = W * .06, w = W * .28, y = H * .89;
    g.fillStyle = o.a;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(Math.sin(i * .7 + o.t * 5)) * .6 + Math.abs(Math.sin(i * .21 + o.t * 2)) * .4;
      const h = H * .06 * v;
      g.fillRect(x0 + i * (w / n), y - h / 2, w / n * .6, h);
    }
  }],

  ['bignum', '大きな数字', (g, W, H, o) => {
    g.save();
    g.globalAlpha = .38;
    g.fillStyle = o.a;
    g.font = `800 ${Math.round(H * .34)}px 'DotGothic16', monospace`;
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText(String(o.idx === undefined ? 1 : o.idx + 1).padStart(2, '0'), W * .96, H * .98);
    g.restore();
  }],

  ['tc', 'タイムコード', (g, W, H, o) => {
    const f = Math.floor(o.t * 24) % 24;
    const s = Math.floor(o.t) % 60;
    const mn = Math.floor(o.t / 60);
    g.fillStyle = o.a;
    g.font = `400 ${Math.round(H * .032)}px 'DotGothic16', monospace`;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(`${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`,
      W * .06, H * .07);
  }],

  ['confetti', '紙ふぶき', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    for (let i = 0; i < 46; i++) {
      const x = r2() * W;
      const sp = .3 + r2() * .8;
      const y = ((r2() * H) + o.t * H * sp * .25) % (H + 40) - 20;
      const s = W * .004 * (.6 + r2() * 1.6);
      g.save();
      g.translate(x, y); g.rotate(o.t * (1 + r2() * 3) + i);
      g.fillStyle = i % 2 ? o.a : o.b;
      g.fillRect(-s, -s * .5, s * 2, s);
      g.restore();
    }
  }],

  ['petal', '花びら', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.fillStyle = o.a;
    for (let i = 0; i < 30; i++) {
      const sp = .25 + r2() * .55;
      const x = (r2() * W + Math.sin(o.t * sp * 2 + i) * W * .04);
      const y = ((r2() * H) + o.t * H * sp * .2) % (H + 40) - 20;
      const s = W * .007 * (.6 + r2());
      g.save(); g.translate(x, y); g.rotate(o.t * sp + i);
      g.beginPath(); g.ellipse(0, 0, s, s * .55, 0, 0, TAU); g.fill();
      g.restore();
    }
  }],

  ['leader', '引き出し線', (g, W, H, o) => {
    const x = W * .12, y = H * .24;
    g.strokeStyle = o.a; g.fillStyle = o.a;
    g.lineWidth = Math.max(1.2, W * .0014);
    g.beginPath();
    g.arc(x, y, W * .006, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + W * .09, y - H * .07); g.lineTo(x + W * .2, y - H * .07);
    g.stroke();
  }],

  ['slash', 'スラッシュ', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.strokeStyle = o.a;
    for (let i = 0; i < 7; i++) {
      const x = r2() * W, y = r2() * H, L = W * .02 * (1 + r2() * 3);
      g.lineWidth = W * .002 * (.6 + r2() * 1.6);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + L, y - L); g.stroke();
    }
  }],

  ['scanbar', '荒い帯', (g, W, H, o) => {
    const y = (o.t * H * .35) % (H + 60) - 30;
    const gr = g.createLinearGradient(0, y, 0, y + H * .1);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(.5, o.a);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.globalAlpha = .35;
    g.fillStyle = gr; g.fillRect(0, y, W, H * .1);
    g.restore();
  }]
];

const byName = list => { const m = new Map(); list.forEach(x => m.set(x[0], x[2])); return m; };
const PAT_MAP = byName(PATS);
const DECO_MAP = byName(DECOS);

/** うしろの がら を えがく */
export function drawPat(g, name, W, H, opt) {
  const f = PAT_MAP.get(name);
  if (!f) return false;
  paint(g, f, W, H, opt);
  return true;
}
/** 上に のせる かざり を えがく */
export function drawDeco(g, name, W, H, opt) {
  const f = DECO_MAP.get(name);
  if (!f) return false;
  paint(g, f, W, H, opt);
  return true;
}
function paint(g, f, W, H, opt) {
  const o = Object.assign({ a: '#FFFEF7', b: '#E1DD60', amt: 1, t: 0, idx: 0 }, opt);
  o.seed = o.seed === undefined ? hashStr(o.key || 'x') : o.seed;
  o.r = rnd(o.seed);
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, o.amt));
  try { f(g, W, H, o); } catch (e) { }
  g.restore();
}
