/* もじの 組み方（よこ書き・たて書き・ツメ）と、うごき（エフェクト）。
   1文字ずつ 置き場を 出して、1文字ずつ うごかす。 */
import { S, clamp } from './state.js?v=8';
import { beatOn, beatSec, beatAt } from './beat.js?v=8';

/* ---------- フォント ---------- */
export const FONTS = [
  ['rounded', 'まるゴシック', "'M PLUS Rounded 1c', sans-serif"],
  ['dot', 'ドット', "'DotGothic16', monospace"],
  ['mincho', 'みんちょう', "'Hiragino Mincho ProN','Yu Mincho','MS PMincho', serif"],
  ['gothic', 'ゴシック', "'Hiragino Sans','Yu Gothic','Meiryo', sans-serif"],
  ['maru', 'まるゴ（端末）', "'Hiragino Maru Gothic ProN','Yu Gothic', sans-serif"]
];
export const userFonts = [];      // {key,label,family}
export function fontFamily(key) {
  const u = userFonts.find(f => f.key === key);
  if (u) return `'${u.family}', sans-serif`;
  const f = FONTS.find(f => f[0] === key);
  return f ? f[2] : FONTS[0][2];
}
export function fontList() {
  return [...FONTS.map(f => [f[0], f[1]]), ...userFonts.map(f => [f.key, f.label])];
}
export async function addFontFile(file) {
  const buf = await file.arrayBuffer();
  const family = 'uf' + Math.random().toString(36).slice(2, 7);
  const face = new FontFace(family, buf);
  await face.load();
  document.fonts.add(face);
  const key = 'user:' + family;
  userFonts.push({ key, label: file.name.replace(/\.[^.]+$/, ''), family });
  return key;
}

/* ---------- たて書きで まわす／ずらす 文字 ---------- */
const ROT = new Set('ー-—―‐~〜ｰ（）()「」『』【】〔〕［］｛｝〈〉《》＜＞<>['+']…‥'.split(''));
const SMALL = new Set('ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ'.split(''));
const PUNCT = new Set('、。，．,.'.split(''));

/* ---------- 組み方 ---------- */
/** もじの 置き場を 出す。返すのは 1文字ずつの {ch,x,y,rot,line,idx,word} */
export function layout(G, T) {
  const size = T.size;
  const fam = fontFamily(T.font || 'rounded');
  G.font = `${T.weight} ${size}px ${fam}`;
  const lines = String(T.str).split('\n');
  const lh = size * (T.lineGap || 1.32);
  const tsume = clamp(T.tsume || 0, 0, 1);
  const glyphs = [];
  let idx = 0;

  if (T.vertical) {
    // たて書き。右の 行から 左へ
    const colW = lh;
    const totalW = (lines.length - 1) * colW;
    const step = size * (1 - tsume * 0.18);
    lines.forEach((ln, li) => {
      const chars = [...ln];
      const x = totalW / 2 - li * colW;
      const y = -((chars.length - 1) * step) / 2;
      chars.forEach((ch, ci) => {
        let dx = 0, dy = 0, rot = 0;
        if (ROT.has(ch)) rot = 90;
        if (SMALL.has(ch)) { dx += size * .08; dy -= size * .08; }
        if (PUNCT.has(ch)) { dx += size * .32; dy -= size * .32; }
        glyphs.push({ ch, x: x + dx, y: y + ci * step + dy, rot, line: li, idx: idx++, word: ci });
      });
    });
    return {
      glyphs,
      w: totalW + size,
      h: Math.max(1, ...lines.map(l => [...l].length)) * step,
      vertical: true
    };
  }

  // よこ書き
  let maxW = 0;
  const rows = lines.map(ln => {
    const chars = [...ln];
    const ws = chars.map(ch => advance(G, ch, size, tsume));
    const w = ws.reduce((a, b) => a + b, 0);
    maxW = Math.max(maxW, w);
    return { chars, ws, w };
  });
  const y0 = -(lines.length - 1) * lh / 2;
  rows.forEach((r, li) => {
    const ax = T.align === 'left' ? -S.W / 2 + 70
      : T.align === 'right' ? S.W / 2 - 70 - r.w : -r.w / 2;
    let x = ax, wordN = 0;
    r.chars.forEach((ch, ci) => {
      if (ch === ' ') wordN++;
      glyphs.push({ ch, x: x + r.ws[ci] / 2, y: y0 + li * lh, rot: 0, line: li, idx: idx++, word: wordN });
      x += r.ws[ci];
    });
  });
  return { glyphs, w: maxW, h: lines.length * lh, vertical: false };
}

/** 1文字の 送り。ツメを かけると 実際の 墨の はばに よせる */
function advance(G, ch, size, tsume) {
  const m = G.measureText(ch);
  const w = m.width;
  if (!tsume) return w;
  let ink = w;
  if (m.actualBoundingBoxLeft !== undefined) {
    ink = Math.abs(m.actualBoundingBoxLeft) + Math.abs(m.actualBoundingBoxRight);
    if (!isFinite(ink) || ink <= 0) ink = w;
  }
  // 白い ところを すこし けずる。けずりすぎると くっつくので 下げ幅に かぎりを つける
  const tight = Math.max(w * 0.62, ink + size * 0.02);
  return w + (tight - w) * tsume;
}

/* ---------- うごき ---------- */
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeIn = p => p * p * p;
const back = p => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const spring = p => p >= 1 ? 1 : 1 - Math.pow(2, -9 * p) * Math.cos(p * 13);
const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

export const FX_IN = [
  ['none', 'なし'], ['fade', 'じわっ'], ['up', '下から'], ['down', '上から'],
  ['left', '左から'], ['right', '右から'], ['zoomin', '大きく'], ['zoomout', '小さく'],
  ['pop', 'ぽん'], ['spring', 'ばね'], ['rotate', 'くるっ'], ['flipx', 'よこ回転'],
  ['flipy', 'たて回転'], ['blur', 'ぼけから'], ['type', 'タイプ'], ['wipe', 'ワイプ'],
  ['scatter', 'ちらばり'], ['drop', 'おちる'], ['stretch', 'のびる'], ['glitch', 'がたつき'],
  ['spiral', 'うずまき'], ['wavein', 'なみで']
];
export const FX_LOOP = [
  ['none', 'なし'], ['bounce', 'はずむ'], ['pulse', 'どくどく'], ['shake', 'ゆれる'],
  ['swing', 'ふりこ'], ['wave', 'なみうち'], ['flash', 'ぴかっ'], ['jitter', 'がくがく'],
  ['spin', 'まわる'], ['rainbow', 'にじ色'], ['zoombeat', '拍でズーム'], ['updown', 'うきしずみ']
];
export const FX_OUT = [
  ['none', 'なし'], ['fade', 'じわっ'], ['up', '上へ'], ['down', '下へ'],
  ['zoomin', '大きく'], ['zoomout', '小さく'], ['blur', 'ぼける'], ['scatter', 'ちらばる'],
  ['type', 'タイプ']
];

/** 出かた。p は 0→1 */
function inAt(kind, p, g, size) {
  const t = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, hue: 0 };
  if (kind === 'none' || p >= 1) return t;
  const e = easeOut(p);
  switch (kind) {
    case 'fade': t.a = p; break;
    case 'up': t.dy = (1 - e) * size * 1.1; t.a = p; break;
    case 'down': t.dy = -(1 - e) * size * 1.1; t.a = p; break;
    case 'left': t.dx = -(1 - e) * size * 1.6; t.a = p; break;
    case 'right': t.dx = (1 - e) * size * 1.6; t.a = p; break;
    case 'zoomin': t.sx = t.sy = 0.2 + 0.8 * e; t.a = p; break;
    case 'zoomout': t.sx = t.sy = 2.2 - 1.2 * e; t.a = p; break;
    case 'pop': { const b = back(p); t.sx = t.sy = b; t.a = clamp(p * 2, 0, 1); break; }
    case 'spring': { const s = spring(p); t.sx = t.sy = s; t.dy = (1 - s) * size * .5; t.a = clamp(p * 3, 0, 1); break; }
    case 'rotate': t.rot = (1 - e) * -180; t.sx = t.sy = e; t.a = p; break;
    case 'flipx': t.sx = Math.max(.04, Math.abs(Math.cos((1 - e) * Math.PI))); t.a = clamp(p * 2, 0, 1); break;
    case 'flipy': t.sy = Math.max(.04, Math.abs(Math.cos((1 - e) * Math.PI))); t.a = clamp(p * 2, 0, 1); break;
    case 'blur': t.blur = (1 - e) * size * .28; t.a = p; break;
    case 'type': t.a = p > 0 ? 1 : 0; break;
    case 'wipe': t.sx = e; t.a = clamp(p * 3, 0, 1); break;
    case 'scatter': {
      const r1 = rnd(g.idx, 1) - .5, r2 = rnd(g.idx, 2) - .5;
      t.dx = r1 * size * 5 * (1 - e); t.dy = r2 * size * 5 * (1 - e);
      t.rot = (r1 * 220) * (1 - e); t.a = p; break;
    }
    case 'drop': { const s = spring(p); t.dy = -(1 - s) * size * 3; t.a = clamp(p * 4, 0, 1); break; }
    case 'stretch': t.sy = 0.1 + 0.9 * e; t.sx = 1.6 - 0.6 * e; t.a = p; break;
    case 'glitch': {
      const j = p < 1 ? (rnd(g.idx, Math.floor(p * 14)) - .5) : 0;
      t.dx = j * size * 1.2 * (1 - p); t.a = p > .12 ? 1 : 0;
      t.hue = j * 160 * (1 - p); break;
    }
    case 'spiral': {
      const a = (1 - e) * Math.PI * 2.4;
      t.dx = Math.cos(a) * size * 2 * (1 - e);
      t.dy = Math.sin(a) * size * 2 * (1 - e);
      t.rot = (1 - e) * 320; t.sx = t.sy = e; t.a = p; break;
    }
    case 'wavein': t.dy = Math.sin((1 - p) * 8 + g.idx * .6) * size * .5 * (1 - e); t.a = p; break;
  }
  return t;
}
/** 出て いく ところ。p は 1→0（のこり） */
function outAt(kind, p, g, size) {
  const t = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, hue: 0 };
  if (kind === 'none' || p >= 1) return t;
  const q = 1 - p;                 // 0→1 で 消えて いく
  const e = easeIn(q);
  switch (kind) {
    case 'fade': t.a = p; break;
    case 'up': t.dy = -e * size * 1.4; t.a = p; break;
    case 'down': t.dy = e * size * 1.4; t.a = p; break;
    case 'zoomin': t.sx = t.sy = 1 + e * 1.2; t.a = p; break;
    case 'zoomout': t.sx = t.sy = 1 - e * .9; t.a = p; break;
    case 'blur': t.blur = e * size * .3; t.a = p; break;
    case 'scatter': {
      const r1 = rnd(g.idx, 3) - .5, r2 = rnd(g.idx, 4) - .5;
      t.dx = r1 * size * 5 * e; t.dy = r2 * size * 5 * e;
      t.rot = r1 * 220 * e; t.a = p; break;
    }
    case 'type': t.a = p > 0 ? 1 : 0; break;
  }
  return t;
}
/** ずっと つづく うごき。b は 拍の 位置（小数） */
function loopAt(kind, b, g, size, amt) {
  const t = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, hue: 0 };
  if (kind === 'none') return t;
  const ph = b - Math.floor(b);            // 拍の 中の 0→1
  const k = amt;
  switch (kind) {
    case 'bounce': t.dy = -Math.abs(Math.sin(Math.PI * ph)) * size * .32 * k; break;
    case 'pulse': t.sx = t.sy = 1 + Math.pow(1 - ph, 3) * .28 * k; break;
    case 'shake': t.dx = Math.sin(b * Math.PI * 4 + g.idx) * size * .07 * k; break;
    case 'swing': t.rot = Math.sin(b * Math.PI) * 11 * k; break;
    case 'wave': t.dy = Math.sin(b * Math.PI * 2 - g.idx * .55) * size * .18 * k; break;
    case 'flash': t.a = 1 - Math.pow(ph, .5) * .75 * k; break;
    case 'jitter': {
      const s = Math.floor(b * 4);
      t.dx = (rnd(g.idx, s) - .5) * size * .18 * k;
      t.dy = (rnd(g.idx, s + 9) - .5) * size * .18 * k; break;
    }
    case 'spin': t.rot = (b * 90 * k) % 360; break;
    case 'rainbow': t.hue = (b * 90 + g.idx * 18) % 360 * k; break;
    case 'zoombeat': t.sx = t.sy = 1 + Math.pow(1 - ph, 5) * .5 * k; break;
    case 'updown': t.dy = Math.sin(b * Math.PI) * size * .16 * k; break;
  }
  return t;
}

/** ふだの 中の 時こく local に おける 1文字の ありさま */
export function glyphState(T, g, local, dur, total, absT) {
  const size = T.size;
  const unit = T.unit || 'char';
  const key = unit === 'line' ? g.line : unit === 'word' ? g.word : unit === 'all' ? 0 : g.idx;
  const lag = (T.stagger || 0) * key;
  const inD = Math.max(.001, T.inDur || .4);
  const outD = Math.max(.001, T.outDur || .3);

  let pIn = clamp((local - lag) / inD, 0, 1);
  if ((T.fxIn || 'none') === 'type') pIn = (local - lag) >= 0 ? 1 : 0;
  const outStart = dur - outD - (T.outStagger ? lag : 0);
  let pOut = clamp((dur - local - (T.fxOut === 'type' ? lag : 0)) / outD, 0, 1);

  const a = inAt(T.fxIn || 'none', pIn, g, size);
  const b = outAt(T.fxOut || 'none', pOut, g, size);
  const beat = beatOn() ? beatAt(absT) : absT / (T.loopSec || .5);
  const l = loopAt(T.fxLoop || 'none', beat + (T.loopLag ? key * .12 : 0), g, size, T.loopAmt === undefined ? 1 : T.loopAmt);

  return {
    dx: a.dx + b.dx + l.dx,
    dy: a.dy + b.dy + l.dy,
    sx: a.sx * b.sx * l.sx,
    sy: a.sy * b.sy * l.sy,
    rot: a.rot + b.rot + l.rot,
    a: a.a * b.a * l.a,
    blur: a.blur + b.blur + l.blur,
    hue: a.hue + b.hue + l.hue
  };
}

/** もじを えがく（G は すでに ふだの まん中に 移動・回転ずみ） */
export function drawText(G, c, local, absT) {
  const T = c.text;
  const lay = layout(G, T);
  const size = T.size;
  const fam = fontFamily(T.font || 'rounded');
  G.font = `${T.weight} ${size}px ${fam}`;
  G.textAlign = 'center'; G.textBaseline = 'middle';
  G.lineJoin = 'round'; G.miterLimit = 2;

  if (T.bgOn) {
    const pad = size * .36;
    const bw = (lay.vertical ? lay.w : lay.w) + pad * 2;
    const bh = lay.h + pad;
    G.fillStyle = T.bgColor;
    G.strokeStyle = '#1E1C14'; G.lineWidth = Math.max(3, size * .07);
    let bx = -bw / 2;
    if (!lay.vertical) {
      if (T.align === 'left') bx = -S.W / 2 + 70 - pad;
      else if (T.align === 'right') bx = S.W / 2 - 70 - lay.w - pad;
    }
    const by = -bh / 2 - (lay.vertical ? 0 : size * .06);
    G.beginPath();
    if (G.roundRect) G.roundRect(bx, by, bw, bh, size * .22); else G.rect(bx, by, bw, bh);
    G.fill(); G.stroke();
  }

  const mb = T.mblur || 0;            // 0〜1 うごきの あと
  const steps = mb > 0 ? 4 : 1;

  for (const g of lay.glyphs) {
    if (g.ch === ' ' || g.ch === '　') continue;
    for (let k = steps - 1; k >= 0; k--) {
      const back = k * (mb * 0.06);   // 何秒 まえの すがたか
      const st = glyphState(T, g, local - back, c.dur, lay.glyphs.length, absT - back);
      if (st.a <= .004) continue;
      const fade = k === 0 ? 1 : (1 - k / steps) * .45;
      G.save();
      G.globalAlpha = clamp(st.a * fade, 0, 1);
      G.translate(g.x + st.dx, g.y + st.dy);
      if (g.rot) G.rotate(g.rot * Math.PI / 180);
      if (st.rot) G.rotate(st.rot * Math.PI / 180);
      G.scale(st.sx, st.sy);
      if (st.blur > .05) G.filter = `blur(${st.blur.toFixed(2)}px)`;
      const col = st.hue ? shiftHue(T.color, st.hue) : T.color;
      if (T.sw > 0) { G.strokeStyle = T.stroke; G.lineWidth = T.sw; G.strokeText(g.ch, 0, 0); }
      G.fillStyle = col;
      G.fillText(g.ch, 0, 0);
      G.filter = 'none';
      G.restore();
    }
  }
}

/** 文字の 色を 少し まわす（にじ色 用） */
function shiftHue(hex, deg) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg) % 360; if (h < 0) h += 360;
  const c2 = (1 - Math.abs(2 * l - 1)) * (s || .85);
  const x = c2 * (1 - Math.abs((h / 60) % 2 - 1));
  const mm = l - c2 / 2;
  let rr, gg, bb;
  if (h < 60) [rr, gg, bb] = [c2, x, 0]; else if (h < 120) [rr, gg, bb] = [x, c2, 0];
  else if (h < 180) [rr, gg, bb] = [0, c2, x]; else if (h < 240) [rr, gg, bb] = [0, x, c2];
  else if (h < 300) [rr, gg, bb] = [x, 0, c2]; else [rr, gg, bb] = [c2, 0, x];
  const to = v => Math.round(clamp(v + mm, 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + to(rr) + to(gg) + to(bb);
}

/** えらんだ ときの わく（あたりの 大きさ） */
export function textBox(G, T) {
  const lay = layout(G, T);
  return { w: lay.w + T.size * .5, h: lay.h + T.size * .3 };
}
