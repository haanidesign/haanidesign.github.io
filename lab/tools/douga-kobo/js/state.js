/* 作品の 中身と、もどす／やりなおし。 */
import { bus } from './bus.js?v=73';

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const uid = () => Math.random().toString(36).slice(2, 9);
export const r2 = v => Math.round(v * 100) / 100;

export const S = {
  fps: 30, W: 1280, H: 720, bg: '#101010',
  dur: 0,                // 作品の ながさ（0 なら ふだに 合わせる）
  tracks: [],
  time: 0, pps: 60,
  sel: null, selTrack: null, selChar: null,
  selMany: [],           // いくつか まとめて えらんだ ふだの id
  tool: 'select',          // select | cut | hand
  snap: true,
  loop: { on: false, a: 0, b: 0 },
  timeMode: 'sec',
  quality: 1,            // 作業中の 画質（1=きれい、小さいほど かるい）
  docId: null, name: 'むだい',
  beat: { bpm: 0, offset: 0, div: 1, per: 4, on: false, grid: true },
  step: 0,               // コマ打ち（0=フル / 12=2コマ / 8=3コマ）
  trans: [],             // カット間の つなぎ [{at,dur,kind,seed}]
  cams: [],              // カットごとの カメラ [{at,dur,kind,seed}]
  noBg: false,           // 下じきを ぬらない（透過PNG の あいだだけ true）
  master: {
    vignette: 0, grain: 0, rgb: 0, flash: 0, shake: 0, zoom: 0,
    slice: 0, block: 0, scan: 0, invert: 0, bloom: 0, lines: 0,
    vhs: 0, strobe: 0, burn: 0, scratch: 0, snow: 0, bars: 0,
    sparkle: 0, flare: 0, mosaic: 0, shutter: 0, halo: 0,
    br: 100, ct: 100, sa: 100
  },
  playing: false
};

export const newTrack = (kind, name) =>
  ({ id: uid(), kind, name, mute: false, hidden: false, lock: false, clips: [] });

export function newClip(kind, o = {}) {
  return Object.assign({
    id: uid(), kind, mid: null, name: '',
    start: 0, dur: 4, inp: 0, speed: 1,
    x: 0, y: 0, scale: 1, rot: 0, opacity: 1, fit: 'contain',
    vol: 1, fin: 0, fout: 0,
    color: '#E1DD60', color2: '#F2A0B8', grad: false, gradDir: 0,
    fx: { br: 100, ct: 100, sa: 100, bl: 0, hue: 0, sepia: 0 },
    anim: 'none', mblur: 0,
    text: {
      str: 'ここに もじ', size: 80, color: '#FFFEF7', stroke: '#1E1C14',
      sw: 9, weight: 800, align: 'center', bgOn: false, bgColor: '#E1DD60',
      font: 'rounded', vertical: false, tsume: 0, lineGap: 1.32,
      tracking: 0, kerning: 0, curve: 0,
      skewH: 0, skewV: 0, flipH: false, flipV: false,
      grad: false, color2: '#E1DD60', gradDir: 90,
      shadowOn: false, shadowColor: '#1E1C14', shadowX: 6, shadowY: 8, shadowBlur: 0,
      glowOn: false, glowColor: '#E1DD60', glowSize: 18,
      charOn: false, off: {},
      fxIn: 'pop', fxOut: 'fade', fxLoop: 'none',
      unit: 'char', inDur: .45, outDur: .3, stagger: .04,
      inBeat: 0, outBeat: 0, order: 'fwd', ease: 'out', dist: 0, angle: 90,
      loopAmt: 1, loopSec: .5, loopLag: true, mblur: 0
    }
  }, o);
}

/** 音の段は「目」を つかわない。前の さくひんは 音けしに ふり替える */
export function tidyTracks() {
  S.tracks.forEach(t => {
    if (t.kind === 'audio' && t.hidden) { t.mute = true; t.hidden = false; }
  });
}
export const allClips = () => S.tracks.flatMap(t => t.clips.map(c => ({ c, t })));
export const findClip = id => {
  for (const t of S.tracks) { const c = t.clips.find(c => c.id === id); if (c) return { c, t }; }
  return null;
};
export const trackOf = id => S.tracks.find(t => t.id === id);
export const selected = () => S.sel ? findClip(S.sel) : null;
/** えらんで いる ふだ ぜんぶ（1まいの ときも ここに 入る） */
export function selectedAll() {
  const ids = new Set([...(S.selMany || []), ...(S.sel ? [S.sel] : [])]);
  const out = [];
  ids.forEach(id => { const f = findClip(id); if (f) out.push(f); });
  return out.sort((a, b) => a.c.start - b.c.start);
}
/* この ふだを その 段に 置けるか。
   音の 段には 音だけ。そのほかの 段は 絵・文字PV・いろ・文字 どれでも 置ける */
export const fitsTrack = (c, t) => (t.kind === 'audio') === (c.kind === 'audio');

export const manyOn = () => (S.selMany || []).length > 1;

/* --- つないだ ふだ（前後に ばらした 文字PV など） ---
   link が 同じ ふだは、いち・ながさ・出どころを そろえる。
   かたっぽだけ のばすと ずれて 合わなく なる ため。 */
export const linkedOf = c =>
  (c && c.link) ? allClips().map(x => x.c).filter(x => x !== c && x.link === c.link) : [];
export function syncLinked(c) {
  const ms = linkedOf(c);
  if (!ms.length) return 0;
  ms.forEach(o => {
    o.start = c.start; o.dur = c.dur; o.inp = c.inp || 0;
    o.speed = c.speed; o.inF = c.inF; o.outF = c.outF;
    if (o.jz && c.jz) { o.jz.fit = c.jz.fit; o.jz.cutDur = c.jz.cutDur; o.jz.off = c.jz.off; }
  });
  return ms.length;
}
export const unlink = c => { const ms = linkedOf(c); ms.forEach(o => { o.link = null; }); c.link = null; return ms.length; };
/** えらびを まとめて 入れかえる */
export function setMany(ids) {
  S.selMany = [...new Set(ids)];
  if (!S.selMany.includes(S.sel)) S.sel = S.selMany[0] || null;
}
/** ふだが おわる ところ */
export const clipEnd = () => Math.max(0.5, ...allClips().map(({ c }) => c.start + c.dur));
/** 作品の ながさ。きめて あれば その ながさ、なければ ふだに 合わせる */
export const duration = () => (S.dur > 0 ? S.dur : clipEnd());

export function bootProject() {
  S.tracks = [
    newTrack('text', '文字 1'),
    newTrack('video', '映像 2'),
    newTrack('video', '映像 1'),
    newTrack('audio', '音 1')
  ];
  S.time = 0; S.sel = null; S.selTrack = null;
}

/* ---- ふだの 置き場さがし ---- */
export function freeSlot(track, from, dur) {
  let s = Math.max(0, from);
  [...track.clips].sort((a, b) => a.start - b.start).forEach(c => {
    if (s + dur > c.start + 1e-6 && c.start + c.dur > s + 1e-6) s = c.start + c.dur;
  });
  return s;
}
export function laneFor(kind) {
  const want = kind === 'audio' ? 'audio' : kind === 'text' ? 'text' : 'video';
  let t = S.tracks.find(t => t.kind === want);
  if (!t) { t = newTrack(want, want === 'audio' ? '音' : want === 'text' ? '文字' : '映像'); S.tracks.push(t); }
  return t;
}
export function freeLane(kind, items) {
  const hit = t => t.clips.some(c => items.some(n =>
    n.start < c.start + c.dur - 1e-6 && c.start < n.start + n.dur - 1e-6));
  let t = S.tracks.find(t => t.kind === kind && !hit(t));
  if (!t) {
    const n = S.tracks.filter(x => x.kind === kind).length + 1;
    t = newTrack(kind, ({ video: '映像', audio: '音', text: '文字' })[kind] + ' ' + n);
    S.tracks.unshift(t);
  }
  return t;
}

/* ---- もどす／やりなおし ---- */
let HIST = [], HPOS = -1;
export function snap() {
  const s = JSON.stringify({ tracks: S.tracks, sel: S.sel, beat: S.beat, master: S.master, loop: S.loop });
  if (HIST[HPOS] === s) return;
  HIST = HIST.slice(0, HPOS + 1);
  HIST.push(s); HPOS = HIST.length - 1;
  if (HIST.length > 80) { HIST.shift(); HPOS--; }
}
export function resetHist() { HIST = []; HPOS = -1; snap(); }
function goto(i) {
  if (i < 0 || i >= HIST.length) return false;
  HPOS = i;
  const o = JSON.parse(HIST[i]);
  S.tracks = o.tracks; S.sel = o.sel;
  if (o.beat) S.beat = o.beat;
  if (o.master) S.master = o.master;
  if (o.loop) S.loop = o.loop;
  bus.all();
  return true;
}
export const canUndo = () => HPOS > 0;
export const canRedo = () => HPOS < HIST.length - 1;
export const undo = () => goto(HPOS - 1) && toast('もどした');
export const redo = () => goto(HPOS + 1) && toast('やりなおした');

/* ---- 小道具 ---- */
let toastT = 0;
export function toast(msg, ms = 1800) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}
export function tc(sec, fps = S.fps) {
  sec = Math.max(0, sec);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 60))}:${p(Math.floor(sec) % 60)}.${p(Math.floor((sec % 1) * fps))}`;
}
export const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };
