/* カット間の つなぎ。
   前の カットの「さいごの 1枚」を、いまの カットの 上に かぶせて おいて、
   それを だんだん けずって いく。けずり方の ちがいが つなぎの ちがい。

   p は 0→1。0 で 前の カットが まるごと 見えて いて、1 で ぜんぶ 消える。 */

const TAU = Math.PI * 2;
function rnd(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* すこし ためて から 一気に（つなぎは これが 気もちいい） */
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** ぜんぶ 同じ かたち：
    f(g, W, H, p, o) の 中で、前の 絵 o.img を どう 出すかを きめる。 */
export const TRANS = [
  ['none', 'なし', null],

  ['fade', 'かさねて 消える', (g, W, H, p, o) => {
    g.globalAlpha = 1 - p;
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['wipeL', 'ワイプ ←', (g, W, H, p, o) => {
    const e = ease(p);
    g.beginPath(); g.rect(W * e, 0, W, H); g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],
  ['wipeR', 'ワイプ →', (g, W, H, p, o) => {
    const e = ease(p);
    g.beginPath(); g.rect(0, 0, W * (1 - e), H); g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],
  ['wipeU', 'ワイプ ↑', (g, W, H, p, o) => {
    const e = ease(p);
    g.beginPath(); g.rect(0, 0, W, H * (1 - e)); g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],
  ['wipeD', 'ワイプ ↓', (g, W, H, p, o) => {
    const e = ease(p);
    g.beginPath(); g.rect(0, H * e, W, H); g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['slant', 'ななめ帯 ワイプ', (g, W, H, p, o) => {
    const e = ease(p), R = W + H;
    g.save();
    g.beginPath();
    g.translate(W / 2, H / 2); g.rotate(-.42); g.translate(-W / 2, -H / 2);
    g.rect(-H + R * e, -H, R * 2, H * 3);
    g.restore();
    g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['clock', 'クロック ワイプ', (g, W, H, p, o) => {
    const e = ease(p), R = Math.hypot(W, H);
    g.beginPath();
    g.moveTo(W / 2, H / 2);
    g.arc(W / 2, H / 2, R, -Math.PI / 2 + TAU * e, -Math.PI / 2 + TAU, false);
    g.closePath(); g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['iris', 'アイリス', (g, W, H, p, o) => {
    const e = ease(p), R = Math.hypot(W, H) / 2;
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(W / 2, H / 2, R * e, 0, TAU, true);
    g.clip('evenodd');
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['doors', '観音びらき', (g, W, H, p, o) => {
    const e = ease(p), h = W / 2 * (1 - e);
    g.beginPath();
    g.rect(0, 0, h, H);
    g.rect(W - h, 0, h, H);
    g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['blinds', 'ブラインド', (g, W, H, p, o) => {
    const e = ease(p), n = 12, bh = H / n;
    g.beginPath();
    for (let i = 0; i < n; i++) g.rect(0, i * bh, W, bh * (1 - e));
    g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['check', '市松', (g, W, H, p, o) => {
    const n = 8, cw = W / n, ch = H / Math.max(1, Math.round(n * H / W));
    const rows = Math.max(1, Math.round(n * H / W));
    g.beginPath();
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        const d = ((i + j) % 2) * .35;                 // 白と 黒で 半拍 ずらす
        const q = Math.max(0, Math.min(1, (p - d) / (1 - d || 1)));
        const s = 1 - ease(q);
        if (s <= 0) continue;
        g.rect(i * cw + cw * (1 - s) / 2, j * ch + ch * (1 - s) / 2, cw * s, ch * s);
      }
    g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['blocks', 'ブロック 崩し', (g, W, H, p, o) => {
    const r = rnd(o.seed);
    const n = 10, rows = Math.max(1, Math.round(n * H / W));
    const cw = W / n, ch = H / rows;
    g.beginPath();
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        if (r() > p) g.rect(i * cw, j * ch, cw + 1, ch + 1);
      }
    g.clip();
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['tiles', 'タイル 落ち', (g, W, H, p, o) => {
    const r = rnd(o.seed);
    const n = 8, rows = Math.max(1, Math.round(n * H / W));
    const cw = W / n, ch = H / rows;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        const d = r() * .45;
        const q = Math.max(0, Math.min(1, (p - d) / (1 - d || 1)));
        if (q >= 1) continue;
        const dy = ease(q) * H * 1.3;
        g.save();
        g.globalAlpha = 1 - q * .6;
        g.beginPath(); g.rect(i * cw, j * ch + dy, cw + 1, ch + 1); g.clip();
        g.drawImage(o.img, 0, dy, W, H);
        g.restore();
      }
  }],

  ['zoom', 'ズーム スルー', (g, W, H, p, o) => {
    const e = ease(p), s = 1 + e * 1.6;
    g.globalAlpha = 1 - e;
    g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2);
    g.drawImage(o.img, 0, 0, W, H);
  }],

  ['whip', 'ホイップ パン', (g, W, H, p, o) => {
    const e = ease(p);
    g.globalAlpha = 1 - e * e;
    g.filter = `blur(${Math.round(W * .012 * Math.sin(p * Math.PI))}px)`;
    g.drawImage(o.img, -W * e * 1.15, 0, W, H);
    g.filter = 'none';
  }],

  ['flash', 'フラッシュ 転換', (g, W, H, p, o) => {
    g.globalAlpha = 1 - Math.min(1, p * 2);
    g.drawImage(o.img, 0, 0, W, H);
    g.globalAlpha = Math.sin(p * Math.PI) * .95;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  }],

  ['glitchcut', 'グリッチ 転換', (g, W, H, p, o) => {
    const r = rnd(o.seed + Math.floor(p * 12) * 7919);
    g.globalAlpha = 1 - p;
    for (let i = 0; i < 12; i++) {
      const y = r() * H, h = H * (.02 + r() * .1);
      const dx = (r() - .5) * W * .3 * (1 - p);
      g.save();
      g.beginPath(); g.rect(0, y, W, h); g.clip();
      g.drawImage(o.img, dx, 0, W, H);
      g.restore();
    }
  }],

  ['ink', 'インク', (g, W, H, p, o) => {
    const r = rnd(o.seed);
    const R = Math.hypot(W, H) * .75;
    g.beginPath();
    g.rect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const cx = W * (.15 + r() * .7), cy = H * (.15 + r() * .7);
      const d = r() * .3;
      const q = Math.max(0, (p - d) / (1 - d || 1));
      g.moveTo(cx + R * q, cy);
      g.arc(cx, cy, R * q * (.45 + r() * .5), 0, TAU, true);
    }
    g.clip('evenodd');
    g.drawImage(o.img, 0, 0, W, H);
  }]
];

const MAP = new Map(TRANS.map(x => [x[0], x[2]]));
export const TRANS_LIST = TRANS.map(x => [x[0], x[1]]);

/** 前の 絵を いまの 絵の 上に かぶせて、つなぎの かたちで けずる */
export function drawTrans(g, kind, W, H, p, opt) {
  const f = MAP.get(kind);
  if (!f || !opt || !opt.img) return false;
  g.save();
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  try { f(g, W, H, Math.max(0, Math.min(1, p)), Object.assign({ seed: 1 }, opt)); } catch (e) { }
  g.restore();
  return true;
}
