/* おまかせ組み立て。
   歌詞と 曲の はやさから、カットを じどうで 組み立てる。

   やり方は「部品を くじ引きして 組み合わせる」だけ。
   1カットに つき、下の 7つの たなから 1つずつ ひく。
     ならべ方 / 出かた / ずっと / 消えかた / かざり / 文字づくり / うしろ
   おなじ たねの ばんごう（シード）なら いつも おなじ ものが 出る ので、
   気に入った 組み合わせを あとから 呼びもどせる。 */
import {
  S, uid, clamp, newTrack, newClip, snap as pushUndo, toast
} from './state.js?v=18';
import { beatOn, beatSec } from './beat.js?v=18';
import { GFONTS, setOff } from './text.js?v=18';
import { bus } from './bus.js?v=18';

/* ---------- たねから 同じ くじを ひく ---------- */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const chance = (r, p) => r() < p;

/* ---------- 雰囲気 ----------
   えらんだ 雰囲気に 合う 部品を 中心に つかう。 */
export const MOODS = [
  ['all', '全部入り'], ['glitch', 'グリッチ'], ['calm', 'しっとり'], ['pop', 'ポップ'],
  ['graphic', 'グラフィック'], ['editorial', 'エディトリアル'], ['emo', 'エモーショナル']
];
/* 部品ごとの 雰囲気の ふだ。書いて ない ものは どの 雰囲気でも つかう。 */
const TAGS = {
  // 出かた
  glitch: ['glitch', 'flipx', 'flipy', 'stretch', 'scatter', 'jitter', 'shake', 'flash'],
  calm: ['fade', 'blur', 'up', 'down', 'wavein', 'swing', 'wave', 'none', 'kenburns'],
  pop: ['pop', 'spring', 'zoomin', 'drop', 'bounce', 'pulse', 'zoombeat', 'zoom'],
  graphic: ['wipe', 'slide', 'left', 'right', 'rotate', 'none', 'updown', 'zoom'],
  editorial: ['type', 'fade', 'wipe', 'none', 'up', 'blur'],
  emo: ['blur', 'fade', 'zoomout', 'spiral', 'wavein', 'pulse', 'swing', 'kenburns']
};
/** 雰囲気で しぼる。合う ものが 無ければ ぜんぶから */
function byMood(list, mood) {
  const t = TAGS[mood];
  if (!t) return list;
  const key = x => (Array.isArray(x) ? x[0] : x);
  const hit = list.filter(x => t.includes(key(x)));
  return hit.length ? hit : list;
}
/** 雰囲気を 見て くじを ひく（7割は 合う もの、3割は 自由に） */
const pickM = (r, list, mood) => pick(r, chance(r, .7) ? byMood(list, mood) : list);

/* ---------- 部品の たな ---------- */

/** ① ならべ方（どこに どう 置くか） */
export const LAYOUTS = [
  ['mid-big', 'まん中 おおきく', (c, S2) => { c.text.size = 190; c.text.align = 'center'; }],
  ['mid', 'まん中', (c) => { c.text.size = 130; c.text.align = 'center'; }],
  ['mid-small', 'まん中 ちいさく', (c) => { c.text.size = 86; c.text.align = 'center'; }],
  ['low-left', '左下', (c, W, H) => { c.text.size = 120; c.text.align = 'left'; c.y = H * .28; }],
  ['up-right', '右上', (c, W, H) => { c.text.size = 120; c.text.align = 'right'; c.y = -H * .28; }],
  ['band-low', '下の 帯', (c, W, H) => { c.text.size = 96; c.text.align = 'center'; c.y = H * .33; c.text.bgOn = true; }],
  ['band-up', '上の 帯', (c, W, H) => { c.text.size = 96; c.text.align = 'center'; c.y = -H * .33; c.text.bgOn = true; }],
  ['tate-right', 'たて書き 右', (c, W, H) => { c.text.vertical = true; c.text.size = 116; c.x = W * .3; }],
  ['tate-left', 'たて書き 左', (c, W, H) => { c.text.vertical = true; c.text.size = 116; c.x = -W * .3; }],
  ['slant', 'ななめ', (c) => { c.text.size = 140; c.text.skewH = 12; c.rot = -6; }],
  ['wide', 'よこに のばす', (c) => { c.text.size = 104; c.text.tracking = .38; }],
  ['tight', 'つめて おおきく', (c) => { c.text.size = 176; c.text.tsume = .8; c.text.tracking = -.04; }],
  ['arc', 'カーブ', (c) => { c.text.size = 128; c.text.curve = 34; }],
  ['arc-down', 'カーブ 下', (c) => { c.text.size = 128; c.text.curve = -34; }],
  ['corner', 'すみに よせる', (c, W, H) => { c.text.size = 108; c.text.align = 'left'; c.x = -W * .06; c.y = -H * .3; }],
  ['off-mid', 'ずらして おおきく', (c, W, H) => { c.text.size = 168; c.x = W * .12; c.y = H * .06; }]
];

/** ② 出かた（登場） */
const INS = ['up', 'down', 'left', 'right', 'zoomin', 'zoomout', 'pop', 'spring',
  'rotate', 'flipx', 'flipy', 'blur', 'type', 'wipe', 'scatter', 'drop',
  'stretch', 'glitch', 'spiral', 'wavein', 'slide', 'fade'];
/** ③ ずっと（保持） */
const LOOPS = ['none', 'none', 'bounce', 'pulse', 'shake', 'swing', 'wave',
  'flash', 'jitter', 'updown', 'zoombeat'];
/** ④ 消えかた（退場） */
const OUTS = ['fade', 'fade', 'up', 'down', 'zoomin', 'zoomout', 'blur', 'scatter', 'type'];
/** ⑤ 出る じゅんばん */
const ORDER = ['fwd', 'fwd', 'rev', 'center', 'edges', 'random'];
/** ⑥ うごきかた */
const EASE = ['auto', 'out', 'out', 'back', 'spring', 'inout'];
/** ⑦ どの まとまりで */
const UNITS = ['char', 'char', 'char', 'word', 'line', 'all'];

/** ⑧ かざり（ふち・かげ・ひかり・グラデ） */
export const DECOR = [
  ['plain', 'すっぴん', (c, P) => { c.text.sw = 0; }],
  ['edge', 'ふとい ふち', (c, P) => { c.text.sw = 14; c.text.stroke = P.ink; }],
  ['edge-thin', 'ほそい ふち', (c, P) => { c.text.sw = 5; c.text.stroke = P.ink; }],
  ['shadow', 'かげ', (c, P) => {
    c.text.sw = 0; c.text.shadowOn = true; c.text.shadowColor = P.ink;
    c.text.shadowX = 14; c.text.shadowY = 14; c.text.shadowBlur = 0;
  }],
  ['shadow-soft', 'やわらかい かげ', (c, P) => {
    c.text.shadowOn = true; c.text.shadowColor = P.ink;
    c.text.shadowX = 0; c.text.shadowY = 10; c.text.shadowBlur = 26;
  }],
  ['glow', 'ひかり', (c, P) => {
    c.text.sw = 0; c.text.glowOn = true; c.text.glowColor = P.accent; c.text.glowSize = 34;
  }],
  ['glow-edge', 'ふち＋ひかり', (c, P) => {
    c.text.sw = 8; c.text.stroke = P.ink;
    c.text.glowOn = true; c.text.glowColor = P.accent; c.text.glowSize = 24;
  }],
  ['grad', 'グラデ', (c, P) => {
    c.text.grad = true; c.text.color2 = P.accent; c.text.gradDir = 90; c.text.sw = 6;
  }],
  ['grad-edge', 'グラデ＋ふち', (c, P) => {
    c.text.grad = true; c.text.color2 = P.accent2; c.text.gradDir = 0;
    c.text.sw = 12; c.text.stroke = P.ink;
  }],
  ['pill', 'ふだ地', (c, P) => {
    c.text.bgOn = true; c.text.bgColor = P.accent; c.text.color = P.ink; c.text.sw = 0;
  }]
];

/** ⑨ うしろ（背景の 色ふだ） */
export const BGS = [
  ['ink', 'くろ', P => [P.ink, P.ink, 0]],
  ['paper', 'しろ', P => [P.paper, P.paper, 0]],
  ['accent', 'さし色', P => [P.accent, P.accent, 0]],
  ['grad1', 'グラデ たて', P => [P.bg1, P.bg2, 90]],
  ['grad2', 'グラデ よこ', P => [P.bg2, P.accent, 0]],
  ['grad3', 'グラデ ななめ', P => [P.ink, P.accent2, 45]],
  ['grad4', 'グラデ ふかい', P => [P.bg1, P.ink, 120]],
  ['accent2', 'さし色 2', P => [P.accent2, P.accent2, 0]]
];

/** ⑩ カメラ（うしろの うごき） */
const CAMS = ['none', 'none', 'kenburns', 'zoom', 'up', 'fade'];
/** 画面で えらぶ ときの ならび */
export const CAM_OPTS = [
  ['none', 'なし'], ['kenburns', 'ゆっくり 寄る'], ['zoom', '寄る'],
  ['up', '上へ'], ['fade', 'じわっ']
];
/** 出る じゅんばん・まとまり・うごきかた を 画面で えらぶ ため */
export const UNIT_OPTS = [
  ['char', '1文字ずつ'], ['word', 'ことばごと'], ['line', '行ごと'], ['all', 'まとめて']
];

/* 配色（たねで えらぶ） */
export const PALETTES = [
  ['よる', { ink: '#0B0B10', paper: '#FFFEF7', accent: '#00E5FF', accent2: '#FF5C00', bg1: '#141428', bg2: '#2a2a55', text: '#FFFEF7' }],
  ['きなり', { ink: '#1E1C14', paper: '#FBFAEC', accent: '#E1DD60', accent2: '#F2A0B8', bg1: '#FBFAEC', bg2: '#F2F0BE', text: '#1E1C14' }],
  ['ネオン', { ink: '#07070C', paper: '#FFFFFF', accent: '#C8FF00', accent2: '#FF2E88', bg1: '#0d0d16', bg2: '#241a3d', text: '#FFFFFF' }],
  ['さくら', { ink: '#2b1a22', paper: '#FFF6F8', accent: '#F2A0B8', accent2: '#FFD8A8', bg1: '#3a2430', bg2: '#7a4a5e', text: '#FFF6F8' }],
  ['うみ', { ink: '#06121c', paper: '#F2FBFF', accent: '#00E5FF', accent2: '#7AC4A0', bg1: '#08243a', bg2: '#0f4c6b', text: '#F2FBFF' }],
  ['ひざし', { ink: '#231703', paper: '#FFF8E8', accent: '#FFB300', accent2: '#FF5C00', bg1: '#3a2a08', bg2: '#8a5a10', text: '#FFF8E8' }]
];

/* ---------- 読める 色を えらぶ ----------
   うしろが 明るければ 黒っぽい 字、暗ければ 白っぽい 字。
   さし色は うしろと はっきり 差が ある ときだけ つかう。 */
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return .5;
  const n = parseInt(m[1], 16);
  const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
}
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
/** うしろに 対して いちばん 読める 色 */
function readable(P, bgHex) {
  const cands = [P.paper, P.text, P.ink, P.accent, P.accent2];
  let best = P.paper, bestR = 0;
  cands.forEach(c => { const r = ratio(c, bgHex); if (r > bestR) { bestR = r; best = c; } });
  return best;
}
/** はっきり 差が ある さし色（なければ 読める色） */
function accentOn(P, bgHex, fallback) {
  for (const c of [P.accent, P.accent2]) if (ratio(c, bgHex) >= 3) return c;
  return fallback;
}

/* ---------- 歌詞を カットに わける ---------- */
export function cutsOf(text) {
  const out = [];
  String(text).split('\n').forEach(line => {
    let t = line.trim();
    if (!t) return;
    // [01:23.45] … その 時こくに 置く（LRC）
    let at = null;
    const lrc = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*/.exec(t);
    if (lrc) { at = (+lrc[1]) * 60 + (+lrc[2]); t = t.slice(lrc[0].length); }
    // 「/」で カットを 分ける
    t.split('/').map(x => x.trim()).filter(Boolean).forEach((part, k) => {
      let s2 = part, bang = false, note = '';
      if (/!$/.test(s2)) { bang = true; s2 = s2.replace(/!+$/, '').trim(); }
      const bar = s2.indexOf('|');
      if (bar >= 0) { note = s2.slice(bar + 1).trim(); s2 = s2.slice(0, bar).trim(); }
      if (!s2 && !note) return;
      out.push({ str: s2, bang, note, at: k === 0 ? at : null });
    });
  });
  return out;
}
/** *つよく* を 取り出す */
function emphasis(str) {
  const marks = [];
  let out = '', i = 0, open = -1;
  for (const ch of String(str)) {
    if (ch === '*') {
      if (open < 0) open = i; else { marks.push([open, i]); open = -1; }
      continue;
    }
    out += ch; i++;
  }
  return { str: out, marks };
}

/* ---------- 組み立て ---------- */
export function autoCompose(opt = {}) {
  const cuts = cutsOf(opt.text || '');
  if (!cuts.length) { toast('歌詞を 入れて'); return 0; }

  const seed = opt.seed === undefined ? 1 : (opt.seed | 0);
  const mood = opt.mood || 'all';
  /* きめうち（指定）。空っぽ／'auto' の ところだけ くじを ひく */
  const fx = opt.fix || {};
  const has = k => { const v = fx[k]; return v !== undefined && v !== '' && v !== 'auto'; };
  /** 指定が あれば それ、なければ くじ */
  const F = (k, fallback) => has(k) ? fx[k] : fallback();
  /** たなの 中から 名まえで 引く（無ければ くじ） */
  const FT = (k, list, fallback) => {
    if (!has(k)) return fallback();
    const hit = list.find(x => x[0] === fx[k]);
    return hit || fallback();
  };
  const r = rng(seed * 2654435761 + 12345);
  const b = beatOn() ? beatSec() : .5;
  const beats = Math.max(1, opt.beats || 4);
  const step = b * beats;
  const from = Math.max(0, opt.from || 0);
  const W = S.W, H = S.H;

  // 時こく（[01:23.45] が あれば そこ、無ければ 拍で ならべる）
  const starts = [];
  let t = from;
  cuts.forEach(cu => {
    if (cu.at !== null && cu.at !== undefined) t = Math.max(0, cu.at);
    starts.push(t);
    t += step;
  });
  const durOf = i => Math.max(.12, (i + 1 < starts.length ? starts[i + 1] : starts[i] + step) - starts[i]);

  const [palName, P] = FT('palette', PALETTES, () => pick(r, PALETTES));
  const fonts = GFONTS.map(f => f[0]);
  const baseFont = has('font') ? fx.font : pick(r, fonts);

  // まえに つくった ぶんを どける
  S.tracks = S.tracks.filter(t2 => !/^おまかせ/.test(t2.name));
  const tText = newTrack('text', 'おまかせ 文字');
  const tBg = newTrack('video', 'おまかせ 背景');
  S.tracks.unshift(tText);
  const aIdx = S.tracks.findIndex(t2 => t2.kind === 'audio');
  S.tracks.splice(aIdx < 0 ? S.tracks.length : aIdx, 0, tBg);

  cuts.forEach((cut, i) => {
    const at = starts[i], dur = durOf(i);

    /* --- うしろの いろを さきに きめる（文字の 色を そこから 決める） --- */
    const [, , bgf] = FT('bg', BGS, () => pickM(r, BGS, mood));
    const [c1, c2, dir] = bgf(P);
    const bg = newClip('color', { name: 'いろ', start: at, dur });
    bg.color = c1; bg.color2 = c2; bg.grad = c1 !== c2; bg.gradDir = dir;
    bg.anim = F('cam', () => pickM(r, CAMS, mood));
    if (bg.anim === 'kenburns' || bg.anim === 'zoom') bg.scale = 1.04;
    bg.fin = .05; bg.fout = .05;
    tBg.clips.push(bg);

    // うしろの 明るさを 見て、読める 色を つくる
    const back = lum(c1) < lum(c2) ? c1 : c2;   // 暗い ほうに 合わせて おく
    const txt = has('color') ? fx.color : readable(P, back);
    const ink2 = ratio(P.ink, txt) >= ratio(P.paper, txt) ? P.ink : P.paper;
    const P2 = Object.assign({}, P, {
      text: txt, ink: ink2,
      accent: accentOn(P, back, ink2),
      accent2: accentOn(P, txt, ink2)
    });

    const { str, marks } = emphasis(cut.str);

    /* --- 文字の ふだ --- */
    const c = newClip('text', { name: 'うた', start: at, dur });
    const T = c.text;
    T.str = str;
    T.color = txt;
    T.stroke = ink2;
    T.bgColor = P2.accent;
    T.weight = has('weight') ? (+fx.weight || 700) : (chance(r, .75) ? 800 : 700);
    T.font = has('font') ? fx.font : (chance(r, .7) ? baseFont : pick(r, fonts));
    T.fxIn = F('fxIn', () => pickM(r, INS, mood));
    T.fxOut = F('fxOut', () => pickM(r, OUTS, mood));
    T.fxLoop = F('fxLoop', () => pickM(r, LOOPS, mood));
    T.order = F('order', () => pick(r, ORDER));
    T.ease = F('ease', () => pick(r, EASE));
    T.unit = F('unit', () => pick(r, UNITS));
    T.stagger = has('stagger') ? +fx.stagger : [0, .02, .03, .04, .06][Math.floor(r() * 5)];
    T.inBeat = has('inBeat') ? +fx.inBeat : pick(r, [.25, .5, .5, 1]);
    T.outBeat = has('outBeat') ? +fx.outBeat : pick(r, [.25, .5, .5]);
    if (T.fxIn === 'slide') { T.dist = 200 + Math.floor(r() * 700); T.angle = pick(r, [0, 45, 90, 135, 180, -90]); }
    if (chance(r, .25)) T.mblur = .4 + r() * .5;

    const [, , layout] = FT('layout', LAYOUTS, () => pickM(r, LAYOUTS, mood));
    layout(c, W, H);
    const [, , decor] = FT('decor', DECOR, () => pickM(r, DECOR, mood));
    decor(c, P2);
    if (has('size')) T.size = +fx.size;
    // 地じきを 敷いた ときは その 上で 読める 色に しなおす
    if (T.bgOn) { T.color = readable(P, T.bgColor); T.stroke = T.color === P.ink ? P.paper : P.ink; }
    if (has('vertical')) T.vertical = fx.vertical === 'yes';
    else if (chance(r, .18)) T.vertical = !T.vertical;
    if (chance(r, .2)) T.tsume = .5 + r() * .5;

    // *つよく* の ところを 1文字ずつ 大きく
    marks.forEach(([a2, b2]) => {
      for (let k = a2; k < b2; k++) setOff(T, k, { s: 1.35 + r() * .35, y: -.04 });
    });
    // たまに 1文字だけ はねる
    if (chance(r, .22) && str.length > 2) {
      const k = Math.floor(r() * str.length);
      setOff(T, k, { y: (r() - .5) * .4, r: (r() - .5) * 26, s: 1 + r() * .5 });
    }
    tText.clips.push(c);

    /* --- 行の おわりの ! は ひと めくり --- */
    if (cut.bang) {
      const fl = newClip('color', { name: 'フラッシュ', start: at, dur: Math.min(.14, dur) });
      fl.color = fl.color2 = txt; fl.grad = false;
      fl.fin = 0; fl.fout = .9; fl.opacity = .85;
      tBg.clips.push(fl);
      T.mblur = Math.max(T.mblur || 0, .6);
    }

    /* --- 「|」の あとは 小さい そえ書き --- */
    if (cut.note) {
      const n = newClip('text', { name: 'そえ書き', start: at + Math.min(.12, dur * .1), dur: Math.max(.2, dur - .12) });
      const NT = n.text;
      NT.str = cut.note;
      NT.size = 40;
      NT.color = txt; NT.sw = 0;
      NT.weight = 500;
      NT.font = T.font;
      NT.align = T.align || 'center';
      NT.tracking = .16;
      NT.fxIn = 'fade'; NT.fxOut = 'fade'; NT.unit = 'all';
      NT.inBeat = .5; NT.outBeat = .5;
      n.x = c.x || 0;
      n.y = (c.y || 0) + (T.vertical ? 0 : (T.size || 120) * .72);
      tText.clips.push(n);
    }
  });

  /* --- 画面ぜんたいの しあげ --- */
  const LOOKS = {
    glitch: { vignette: .25, grain: .08, rgb: .3, flash: .35, shake: .2, zoom: .25, br: 104, ct: 114, sa: 120 },
    calm: { vignette: .4, grain: .12, rgb: 0, flash: 0, shake: 0, zoom: .08, br: 102, ct: 98, sa: 92 },
    pop: { vignette: .18, grain: .05, rgb: .06, flash: .3, shake: .14, zoom: .22, br: 104, ct: 110, sa: 122 },
    graphic: { vignette: .12, grain: .04, rgb: 0, flash: .15, shake: .06, zoom: .1, br: 100, ct: 106, sa: 104 },
    editorial: { vignette: .3, grain: .3, rgb: 0, flash: 0, shake: 0, zoom: .06, br: 103, ct: 96, sa: 78 },
    emo: { vignette: .5, grain: .2, rgb: .04, flash: .1, shake: .04, zoom: .16, br: 101, ct: 100, sa: 88 }
  };
  const look = LOOKS[has('look') ? fx.look : mood] || pick(r, Object.values(LOOKS));
  S.master = Object.assign({}, S.master, look);

  S.sel = tText.clips[0] ? tText.clips[0].id : null;
  S.selTrack = tText.id;
  S.selChar = null;
  pushUndo();
  bus.all(); bus.fit();
  return {
    cuts: cuts.length, palette: palName, seed, mood,
    end: starts[starts.length - 1] + durOf(starts.length - 1)
  };
}
