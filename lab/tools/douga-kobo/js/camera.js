/* カメラ。カットの あいだ、画面ぜんたいを どう 動かすか。
   ふだの 中身では なく、えがき おわる 手まえの 座標を ずらす。

   f(p, ph, o) → { x, y, s, r }
     p  … カットの 中の 位置（0→1）
     ph … 拍の 中の 位置（0→1）。BPM が 無い ときは 1秒2拍
     o  … { W, H, r:くじ }
   s は 1 が 等倍。r は 度。 */

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
const beatK = ph => Math.pow(1 - ph, 4);          // 拍の あたまで 1、すぐ 0
const ease = p => 1 - Math.pow(1 - p, 3);

export const CAMS = [
  ['none', 'なし', null],

  ['slowin', 'ゆっくり 寄る', (p, ph, o) => ({ s: 1 + p * .12 })],
  ['slowout', 'ゆっくり 引く', (p, ph, o) => ({ s: 1.12 - p * .12 })],
  ['push', '寄る（はやめ）', (p, ph, o) => ({ s: 1 + ease(p) * .26 })],
  ['pull', '引く（はやめ）', (p, ph, o) => ({ s: 1.26 - ease(p) * .26 })],
  ['panL', 'パン ←', (p, ph, o) => ({ x: (p - .5) * o.W * .14, s: 1.1 })],
  ['panR', 'パン →', (p, ph, o) => ({ x: (.5 - p) * o.W * .14, s: 1.1 })],
  ['panU', 'パン ↑', (p, ph, o) => ({ y: (p - .5) * o.H * .14, s: 1.1 })],
  ['panD', 'パン ↓', (p, ph, o) => ({ y: (.5 - p) * o.H * .14, s: 1.1 })],
  ['kenburns', 'ケンバーンズ', (p, ph, o) => ({
    s: 1.08 + p * .1, x: (p - .5) * o.W * .06, y: (.5 - p) * o.H * .04
  })],
  ['dutch', 'ダッチ（かたむき）', (p, ph, o) => ({ r: -5 + p * 10, s: 1.14 })],
  ['dutchfix', 'ダッチ（止め）', (p, ph, o) => ({ r: 6, s: 1.14 })],
  ['handheld', '手もち', (p, ph, o) => {
    const t = p * 40;
    return {
      x: (Math.sin(t * .9) + Math.sin(t * 2.3) * .5) * o.W * .006,
      y: (Math.cos(t * 1.1) + Math.sin(t * 3.1) * .4) * o.H * .008,
      r: Math.sin(t * .7) * .7, s: 1.04
    };
  }],
  ['beatzoom', '拍で ズーム', (p, ph, o) => ({ s: 1 + beatK(ph) * .1 })],
  ['beatpunch', '拍で ぱんち', (p, ph, o) => ({ s: 1 + beatK(ph) * .22 })],
  ['beatshake', '拍で ゆれ', (p, ph, o) => {
    const k = beatK(ph);
    return { x: (o.r() - .5) * o.W * .02 * k, y: (o.r() - .5) * o.H * .02 * k, s: 1.02 };
  }],
  ['crash', 'クラッシュ ズーム', (p, ph, o) => {
    const k = Math.min(1, p / .18);
    return { s: 2.2 - 1.2 * ease(k) };
  }],
  ['orbit', '周回', (p, ph, o) => ({
    x: Math.cos(p * TAU) * o.W * .04,
    y: Math.sin(p * TAU) * o.H * .04, s: 1.12
  })],
  ['barrel', 'バレルロール', (p, ph, o) => ({ r: p * 360, s: 1.45 })],
  ['halfroll', '半かいてん', (p, ph, o) => ({ r: ease(p) * 180, s: 1.42 })],
  ['pendulum', 'ふりこ', (p, ph, o) => ({
    r: Math.sin(p * Math.PI * 2) * 7, s: 1.12
  })],
  ['focus', 'ピント合わせ', (p, ph, o) => ({ s: 1.2 - Math.pow(1 - Math.min(1, p / .3), 2) * .18 })],
  ['quake', '地しん', (p, ph, o) => ({
    x: (o.r() - .5) * o.W * .016, y: (o.r() - .5) * o.H * .016,
    r: (o.r() - .5) * 1.2, s: 1.05
  })],
  ['dizzy', 'めまい', (p, ph, o) => ({
    r: Math.sin(p * 7) * 4, s: 1.1 + Math.sin(p * 5) * .06
  })],
  ['swirl', 'うず ズーム', (p, ph, o) => ({ r: p * 70, s: 1 + p * .35 })],
  ['snap', 'スナップ パン', (p, ph, o) => {
    const k = Math.floor(p * 4) / 4;
    return { x: (k - .5) * o.W * .18, s: 1.16 };
  }],
  ['step', 'カク送り', (p, ph, o) => {
    const k = Math.floor(p * 6) / 6;
    return { s: 1 + k * .2 };
  }],
  ['tilt', 'あおり', (p, ph, o) => ({ y: (.5 - p) * o.H * .1, r: -3 + p * 6, s: 1.14 })],
  ['driftL', 'ながし ←', (p, ph, o) => ({ x: p * o.W * .1 - o.W * .05, s: 1.1, r: -1.5 })],
  ['driftR', 'ながし →', (p, ph, o) => ({ x: o.W * .05 - p * o.W * .1, s: 1.1, r: 1.5 })],
  ['breathe', 'こきゅう', (p, ph, o) => ({ s: 1.06 + Math.sin(p * Math.PI * 2) * .04 })]
];

const MAP = new Map(CAMS.map(x => [x[0], x[2]]));
export const CAM_LIST = CAMS.map(x => [x[0], x[1]]);

/** カメラの いまの すがた */
export function camAt(kind, p, ph, W, H, seed) {
  const f = MAP.get(kind);
  if (!f) return null;
  const o = { W, H, r: rnd((seed || 1) + Math.floor(p * 1000)) };
  let v;
  try { v = f(Math.max(0, Math.min(1, p)), ph, o) || {}; } catch (e) { return null; }
  return {
    x: v.x || 0, y: v.y || 0,
    s: v.s === undefined ? 1 : v.s,
    r: v.r || 0
  };
}
