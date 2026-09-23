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

  ['tartan', 'タータン', (g, W, H, o) => {
    const s = W / 9;
    g.globalAlpha *= .7;
    g.fillStyle = o.a;
    for (let x = 0; x < W + s; x += s) g.fillRect(x, 0, s * .45, H);
    for (let y = 0; y < H + s; y += s) g.fillRect(0, y, W, s * .45);
    g.fillStyle = o.b;
    for (let x = s * .55; x < W + s; x += s) g.fillRect(x, 0, s * .16, H);
    for (let y = s * .55; y < H + s; y += s) g.fillRect(0, y, W, s * .16);
  }],
  ['houndstooth', '千鳥格子', (g, W, H, o) => {
    const s = W / 14;
    g.fillStyle = o.a;
    for (let y = 0; y < H + s; y += s)
      for (let x = 0; x < W + s; x += s) {
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x + s * .5, y); g.lineTo(x + s * .75, y + s * .25);
        g.lineTo(x + s * .5, y + s * .5); g.lineTo(x, y + s * .5); g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(x + s * .5, y + s * .5); g.lineTo(x + s, y + s * .5);
        g.lineTo(x + s, y + s); g.lineTo(x + s * .5, y + s); g.closePath(); g.fill();
      }
  }],
  ['bricks', 'れんが', (g, W, H, o) => {
    const bw = W / 8, bh = bw * .42;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .002);
    for (let j = 0, y = 0; y < H + bh; y += bh, j++)
      for (let x = (j % 2 ? -bw / 2 : 0); x < W + bw; x += bw)
        g.strokeRect(x, y, bw, bh);
  }],
  ['cityscape', '街なみ', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    let x = 0;
    while (x < W) {
      const w = W * (.04 + r2() * .07), h = H * (.15 + r2() * .42);
      g.fillStyle = o.a;
      g.fillRect(x, H - h, w, h);
      g.fillStyle = o.b;
      for (let wy = H - h + 10; wy < H - 14; wy += 22)
        for (let wx = x + 6; wx < x + w - 8; wx += 16)
          if (r2() > .45) g.fillRect(wx, wy, 6, 10);
      x += w + W * .004;
    }
  }],
  ['mountains', '山なみ', (g, W, H, o) => {
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.moveTo(0, H);
      const base = H * (.52 + k * .12), amp = H * (.16 - k * .04);
      for (let x = 0; x <= W; x += 14) {
        const y = base + Math.sin(x / W * (3 + k * 2) + k) * amp
          + Math.sin(x / W * (9 + k * 3)) * amp * .3;
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath();
      g.globalAlpha = .35 + k * .2;
      g.fillStyle = k % 2 ? o.a : o.b; g.fill();
    }
    g.globalAlpha = 1;
  }],
  ['sunset', '夕日', (g, W, H, o) => {
    const cy = H * .62, R = Math.min(W, H) * .3;
    const gr = g.createRadialGradient(W / 2, cy, 0, W / 2, cy, R * 2);
    gr.addColorStop(0, o.a); gr.addColorStop(.45, o.b); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let y = cy; y < cy + R; y += R / 7) g.fillRect(0, y, W, R / 18);
    g.restore();
  }],
  ['rainwindow', '雨の まど', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.strokeStyle = o.a; g.lineWidth = Math.max(1, W * .0015);
    for (let i = 0; i < 90; i++) {
      const x = r2() * W;
      const y = ((r2() * H) + o.t * H * (.5 + r2())) % (H + 60) - 30;
      const L = H * (.03 + r2() * .06);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * .18, y + L); g.stroke();
    }
  }],
  ['fireworks', '花火', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    for (let f = 0; f < 3; f++) {
      const cx = W * (.2 + r2() * .6), cy = H * (.15 + r2() * .4);
      const ph2 = ((o.t * .5 + f * .37) % 1);
      const R = Math.min(W, H) * .3 * ph2;
      g.globalAlpha = Math.max(0, 1 - ph2) * .9;
      g.strokeStyle = f % 2 ? o.a : o.b;
      g.lineWidth = Math.max(1, W * .0018);
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * .7, cy + Math.sin(a) * R * .7);
        g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }],
  ['marble', '大理石', (g, W, H, o) => {
    g.strokeStyle = o.a; g.lineWidth = Math.max(1, W * .0014);
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      let y = H * (k / 14) + Math.sin(k) * H * .04;
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 16) {
        y += (Math.sin(x * .013 + k * 2.1) + Math.sin(x * .031 + k)) * H * .004;
        g.lineTo(x, y);
      }
      g.globalAlpha = .25 + (k % 3) * .2;
      g.stroke();
    }
    g.globalAlpha = 1;
  }],
  ['kiriye', '切り絵', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.fillStyle = o.a;
    for (let i = 0; i < 9; i++) {
      const cx = r2() * W, cy = r2() * H, R = Math.min(W, H) * (.05 + r2() * .16);
      g.beginPath();
      for (let k = 0; k <= 18; k++) {
        const a = k / 18 * TAU;
        const rr = R * (.6 + .4 * Math.sin(a * 5 + i));
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.globalAlpha = .3 + r2() * .4; g.fill();
    }
    g.globalAlpha = 1;
  }],
  ['moon', '月よ', (g, W, H, o) => {
    const cx = W * .74, cy = H * .28, R = Math.min(W, H) * .16;
    g.fillStyle = o.a;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx - R * .42, cy - R * .12, R * .92, 0, TAU); g.fill();
    g.restore();
  }],
  ['spotgrid', 'スポット格子', (g, W, H, o) => {
    const s = W / 20;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1, W * .0009);
    for (let x = 0; x < W + s; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H + s; y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const cx = W / 2 + Math.sin(o.t * .6) * W * .2, cy = H / 2;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * .5);
    gr.addColorStop(0, o.b); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
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

  ['film', 'フィルム ふち', (g, W, H, o) => {
    const h = H * .085, n = 14;
    g.fillStyle = o.a;
    for (let i = 0; i < n; i++) {
      const x = (i + ((o.t * 1.2) % 1)) * (W / n);
      g.fillRect(x, h * .18, W / n * .5, h * .5);
      g.fillRect(x, H - h * .68, W / n * .5, h * .5);
    }
  }],
  ['bokeh', 'ボケ玉', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    for (let i = 0; i < 16; i++) {
      const x = (r2() * W + Math.sin(o.t * .3 + i) * W * .02);
      const y = (r2() * H + Math.cos(o.t * .25 + i) * H * .02);
      const R = W * .012 * (1 + r2() * 4);
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, i % 2 ? o.a : o.b);
      gr.addColorStop(.7, i % 2 ? o.a : o.b);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = .18 + r2() * .3;
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }],
  ['lightleak', '光もれ', (g, W, H, o) => {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, o.a);
    gr.addColorStop(.35, 'rgba(0,0,0,0)');
    gr.addColorStop(.7, 'rgba(0,0,0,0)');
    gr.addColorStop(1, o.b);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }],
  ['firefly', 'ほたる', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    for (let i = 0; i < 26; i++) {
      const sp = .3 + r2();
      const x = (r2() * W + Math.sin(o.t * sp + i * 2) * W * .05);
      const y = (r2() * H + Math.cos(o.t * sp * .8 + i) * H * .06);
      const tw = (Math.sin(o.t * 3 + i * 1.7) * .5 + .5);
      const R = W * .004 * (1 + tw);
      const gr = g.createRadialGradient(x, y, 0, x, y, R * 4);
      gr.addColorStop(0, o.a); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = .3 + tw * .6;
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R * 4, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }],
  ['arrow', 'やじるし', (g, W, H, o) => {
    const x = W * .08, y = H * .5, L = W * .07;
    g.strokeStyle = o.a; g.lineWidth = Math.max(2, W * .004);
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + L, y);
    g.moveTo(x + L, y); g.lineTo(x + L * .6, y - L * .3);
    g.moveTo(x + L, y); g.lineTo(x + L * .6, y + L * .3);
    g.stroke();
  }],
  ['play', '再生ボタン', (g, W, H, o) => {
    const cx = W * .9, cy = H * .12, R = Math.min(W, H) * .045;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.5, W * .002);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.fillStyle = o.a;
    g.beginPath();
    g.moveTo(cx - R * .28, cy - R * .42); g.lineTo(cx + R * .45, cy);
    g.lineTo(cx - R * .28, cy + R * .42); g.closePath(); g.fill();
  }],
  ['notemark', '音ぷ', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.fillStyle = o.a;
    for (let i = 0; i < 9; i++) {
      const x = r2() * W;
      const y = ((r2() * H) + o.t * H * .18) % (H + 60) - 30;
      const s2 = W * .012 * (.7 + r2());
      g.save(); g.translate(x, y); g.rotate(Math.sin(o.t + i) * .3);
      g.beginPath(); g.ellipse(0, 0, s2, s2 * .72, -.4, 0, TAU); g.fill();
      g.fillRect(s2 * .75, -s2 * 2.6, s2 * .22, s2 * 2.7);
      g.restore();
    }
  }],
  ['starmark', '星', (g, W, H, o) => {
    const r2 = rnd(o.seed);
    g.fillStyle = o.a;
    for (let i = 0; i < 8; i++) {
      const cx = r2() * W, cy = r2() * H, R = W * .008 * (1 + r2() * 2.4);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU - Math.PI / 2;
        const rr = k % 2 ? R * .42 : R;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.globalAlpha = .4 + r2() * .5; g.fill();
    }
    g.globalAlpha = 1;
  }],
  ['register', '見当合わせ', (g, W, H, o) => {
    const cx = W * .1, cy = H * .12, R = Math.min(W, H) * .035;
    g.strokeStyle = o.a; g.lineWidth = Math.max(1.2, W * .0014);
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.beginPath();
    g.moveTo(cx - R * 1.5, cy); g.lineTo(cx + R * 1.5, cy);
    g.moveTo(cx, cy - R * 1.5); g.lineTo(cx, cy + R * 1.5);
    g.stroke();
  }],
  ['clip', 'クリップ', (g, W, H, o) => {
    const x = W * .86, y = H * .06, w = W * .012, h = H * .12;
    g.strokeStyle = o.a; g.lineWidth = Math.max(2, W * .003);
    g.beginPath();
    g.moveTo(x, y + h); g.lineTo(x, y + w); g.arc(x + w, y + w, w, Math.PI, 0);
    g.lineTo(x + w * 2, y + h - w);
    g.stroke();
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
