/* もじの 組み方（よこ書き・たて書き・ツメ）と、うごき（エフェクト）。
   1文字ずつ 置き場を 出して、1文字ずつ うごかす。 */
import { S, clamp } from './state.js?v=56';
import { beatOn, beatSec, beatAt } from './beat.js?v=56';
import { bus } from './bus.js?v=56';

/* ---------- フォント ---------- */
export const FONTS = [
  ['rounded', 'まるゴシック', "'M PLUS Rounded 1c', sans-serif"],
  ['dot', 'ドット', "'DotGothic16', monospace"],
  ['mincho', 'みんちょう', "'Hiragino Mincho ProN','Yu Mincho','MS PMincho', serif"],
  ['gothic', 'ゴシック', "'Hiragino Sans','Yu Gothic','Meiryo', sans-serif"],
  ['maru', 'まるゴ（端末）', "'Hiragino Maru Gothic ProN','Yu Gothic', sans-serif"]
];

/* 歌詞に よく 合う 書たい。えらんだ ときに だけ 取りに 行く ので、
   ふだんは 重く ならない。 */
export const GFONTS = [
  ['g-notosans', 'ノトサン', 'Noto Sans JP'],
  ['g-notoserif', 'ノトめいちょう', 'Noto Serif JP'],
  ['g-dela', 'デラ（ふとい）', 'Dela Gothic One'],
  ['g-reggae', 'レゲエ', 'Reggae One'],
  ['g-rocknroll', 'ロックンロール', 'RocknRoll One'],
  ['g-hachi', 'はちまるポップ', 'Hachi Maru Pop'],
  ['g-yusei', 'ゆうせいマジック', 'Yusei Magic'],
  ['g-zenmaru', 'ぜんまるゴ', 'Zen Maru Gothic'],
  ['g-zenkaku', 'ぜんかくゴ', 'Zen Kaku Gothic New'],
  ['g-zenantique', 'ぜんアンティーク', 'Zen Antique'],
  ['g-kaisei', 'かいせいデコル', 'Kaisei Decol'],
  ['g-potta', 'ポッタ', 'Potta One'],
  ['g-train', 'トレイン', 'Train One'],
  ['g-stick', 'スティック', 'Stick'],
  ['g-shippori', 'しっぽりめいちょう', 'Shippori Mincho'],
  ['g-klee', 'クレー（手書き風）', 'Klee One'],
  ['g-yomogi', 'よもぎ', 'Yomogi'],
  ['g-kiwi', 'キウイ丸', 'Kiwi Maru'],
  ['g-tegomin', 'てごみん', 'New Tegomin'],
  ['g-mplus1', 'M PLUS 1p', 'M PLUS 1p']
];
const gLoaded = new Set();
/** えらばれた 書たいを 取りに 行く（1回だけ） */
export function ensureFont(key) {
  const f = GFONTS.find(x => x[0] === key);
  if (!f || gLoaded.has(key)) return;
  gLoaded.add(key);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=' +
    f[2].replace(/ /g, '+') + ':wght@400;700;900&display=swap';
  document.head.appendChild(l);
  /* 取れたら 描き直す。取れなければ その ままの 書たいで 出る */
  if (document.fonts && document.fonts.load) {
    const fam = `"${f[2]}"`;
    Promise.all([400, 700, 900].map(w =>
      document.fonts.load(`${w} 100px ${fam}`).catch(() => { })
    )).then(() => { bus.stage(); bus.panel(); });
  }
}
export const userFonts = [];      // {key,label,family}
export function fontFamily(key) {
  const u = userFonts.find(f => f.key === key);
  if (u) return `'${u.family}', sans-serif`;
  const g = GFONTS.find(f => f[0] === key);
  if (g) { ensureFont(key); return `'${g[2]}', sans-serif`; }
  const f = FONTS.find(f => f[0] === key);
  return f ? f[2] : FONTS[0][2];
}
export function fontList() {
  return [
    ...FONTS.map(f => [f[0], f[1]]),
    ...GFONTS.map(f => [f[0], f[1]]),
    ...userFonts.map(f => [f.key, f.label])
  ];
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
  const track = (T.tracking || 0) * size;      // 字と 字の あいだ（em）
  let maxW = 0;
  const rows = lines.map(ln => {
    const chars = [...ln];
    const ws = chars.map(ch => advance(G, ch, size, tsume) + track);
    const w = ws.reduce((a, b) => a + b, 0);
    maxW = Math.max(maxW, w);
    return { chars, ws, w };
  });
  const y0 = -(lines.length - 1) * lh / 2;
  const curve = clamp(T.curve || 0, -100, 100) / 100;
  rows.forEach((r, li) => {
    const ax = T.align === 'left' ? -S.W / 2 + 70
      : T.align === 'right' ? S.W / 2 - 70 - r.w : -r.w / 2;
    let x = ax, wordN = 0;
    r.chars.forEach((ch, ci) => {
      if (ch === ' ') wordN++;
      const cx = x + r.ws[ci] / 2;
      let gy = y0 + li * lh, grot = 0;
      if (curve !== 0 && r.w > 1) {
        /* 円の ふちに ならべる。curve が 大きいほど よく 曲がる。
           半径は 行の はばから 出す ので、字が ふえても 形が くずれない。 */
        const rad = (r.w / Math.abs(curve)) * 0.8;
        const a = (cx - (ax + r.w / 2)) / rad;            // まん中からの 角
        const sgn = curve > 0 ? 1 : -1;
        gy += sgn * (rad - rad * Math.cos(a)) * -1 * 1;
        grot = sgn * a * 180 / Math.PI;
      }
      glyphs.push({ ch, x: cx, y: gy, rot: grot, line: li, idx: idx++, word: wordN });
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
export const EASES = [
  ['auto', 'おまかせ'], ['linear', 'まっすぐ'], ['out', 'すっと止まる'],
  ['in', 'じわっと出る'], ['inout', 'なめらか'], ['back', 'いきすぎ'], ['spring', 'ばね']
];
const EASE_FN = {
  linear: p => p,
  out: p => 1 - Math.pow(1 - p, 3),
  in: p => p * p * p,
  inout: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  back: p => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  spring: p => p >= 1 ? 1 : 1 - Math.pow(2, -9 * p) * Math.cos(p * 13)
};
export const ORDERS = [
  ['fwd', 'あたまから'], ['rev', 'おしりから'], ['center', 'まん中から'],
  ['edges', '外から'], ['random', 'ばらばら']
];
/** 何ばんめに 出るか */
function orderKey(key, total, mode) {
  const n = Math.max(1, total);
  switch (mode) {
    case 'rev': return n - 1 - key;
    case 'center': return Math.abs(key - (n - 1) / 2);
    case 'edges': return (n - 1) / 2 - Math.abs(key - (n - 1) / 2);
    case 'random': return Math.floor(rnd(key, 7) * n);
    default: return key;
  }
}
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
  ['spiral', 'うずまき'], ['wavein', 'なみで'], ['slide', '好きな むきから'],
  ['domino', 'ドミノ'], ['slicein', 'スライス'], ['iris', 'アイリス'], ['blind', 'ブラインド'],
  ['neon', 'ネオン 点灯'], ['stamp', 'スタンプ'], ['bound', 'バウンド'], ['fan', '扇ひらき'],
  ['cylinder', '円筒 回転'], ['koma', 'コマ撮り'], ['crt', 'CRT 電源'], ['loading', 'ローディング'],
  ['drum', 'ドラム 回転'], ['datafall', 'データ 降下'], ['brush', '筆ばらい'], ['inkdrop', 'インク滴'],
  ['countin', 'カウントイン'], ['stroke1', '一画ずつ'], ['shutter', 'シャッター'], ['pend', 'ふりこ'],
  ['zip', 'ジッパー'], ['pushin', 'おし出し'], ['tilt', 'かたむき おき'], ['squash', 'つぶれ もどり'],
  ['crack', 'ひび'], ['magnify', 'ルーペ'], ['sheet', 'シール はり'], ['unfold', '手紙ひらき'],
  ['gather', '分解→集合'], ['rise', 'せり上がり']
];
export const FX_LOOP = [
  ['none', 'なし'], ['bounce', 'はずむ'], ['pulse', 'どくどく'], ['shake', 'ゆれる'],
  ['swing', 'ふりこ'], ['wave', 'なみうち'], ['flash', 'ぴかっ'], ['jitter', 'がくがく'],
  ['spin', 'まわる'], ['rainbow', 'にじ色'], ['zoombeat', '拍でズーム'], ['updown', 'うきしずみ'],
  ['drift', 'ただよう'], ['breath', 'こきゅう'], ['jelly', 'ゼリー'], ['flame', 'ともしび'],
  ['gust', 'とっぷう'], ['hang', 'ぶらさがり'], ['stretchbeat', '拍で のびる'], ['flipbeat', '拍で 裏返る'],
  ['gloss', 'つやめき'], ['focusshift', 'ピント送り'], ['string', '弦の ふるえ'], ['typo', 'かたかた'],
  ['heartbeat', 'こどう'], ['sway', 'ゆらぎ'], ['tick', 'こま送り'], ['blink', 'またたき'],
  ['squeezeb', '拍で つぶれる'], ['roll', 'ころがる'], ['hueslow', 'ゆっくり 色かわり'], ['float', 'ふわふわ']
];
export const FX_OUT = [
  ['none', 'なし'], ['fade', 'じわっ'], ['up', '上へ'], ['down', '下へ'],
  ['zoomin', '大きく'], ['zoomout', '小さく'], ['blur', 'ぼける'], ['scatter', 'ちらばる'],
  ['type', 'タイプ'],
  ['explode', '爆散'], ['collapse', '崩落'], ['mist', '霧散'], ['sliceout', 'スライス'],
  ['wipeout', 'ワイプ'], ['shrink', '収縮'], ['stretchout', '伸縮'], ['fly', '飛散'],
  ['glitchout', 'グリッチ'], ['door', 'とびら'], ['tvoff', 'TV オフ'], ['suck', '吸いこみ'],
  ['melt', 'とける'], ['backspace', 'バックスペース'], ['peel', 'はがす'], ['roll', 'まるめて 捨てる'],
  ['tear', 'やぶり捨て'], ['burn', 'こげて 消える'], ['erase', '黒板ふき'], ['sand', 'すなに なる'],
  ['shred', 'シュレッダー'], ['balloon', 'ふうせん'], ['glass', 'ガラス われ'], ['tornado', 'たつまき'],
  ['flutter', 'ひらひら'], ['shock', 'しょうげき波'], ['sink', 'すいぼつ'], ['cut1', '一刀両断'],
  ['blow', 'ふき消す'], ['drain', 'したへ すいこむ']
];

/** 出かた。p は 0→1 */
function inAt(kind, p, g, size, opt = {}) {
  const t = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, hue: 0 };
  if (kind === 'none' || p >= 1) return t;
  const fn = opt.ease && EASE_FN[opt.ease];
  const e = fn ? fn(p) : easeOut(p);
  const D = opt.dist || 0;
  if (D > 0 && ['up', 'down', 'left', 'right', 'slide'].includes(kind)) {
    const a = (opt.angle === undefined ? 90 : opt.angle) * Math.PI / 180;
    t.dx = Math.cos(a) * D * (1 - e);
    t.dy = Math.sin(a) * D * (1 - e);
    t.a = p;
    return t;
  }
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

    /* ---- ここから 足した ぶん ---- */
    case 'domino':                 // 下の はしを 軸に 起きあがる
      t.rot = -(1 - e) * 88; t.dy = (1 - e) * size * .5; t.a = clamp(p * 2, 0, 1); break;
    case 'slicein': {              // 1文字おきに 左右から
      const d = g.idx % 2 ? 1 : -1;
      t.dx = d * (1 - e) * size * 2.2; t.a = p; break;
    }
    case 'iris': t.sx = t.sy = e; t.a = clamp(p * 2.5, 0, 1); break;
    case 'blind': t.sy = e; t.a = clamp(p * 2.5, 0, 1); break;
    case 'neon': {                 // ちかちか して から 点く
      const f = rnd(g.idx, Math.floor(p * 9));
      t.a = p > .62 ? 1 : (f > .42 ? 1 : .08);
      break;
    }
    case 'stamp': {                // 大きく きて、どんと 止まる
      const k = Math.min(1, p / .55);
      t.sx = t.sy = 2.6 - 1.6 * easeOut(k);
      const sh = p > .55 ? Math.pow(1 - (p - .55) / .45, 3) : 0;
      t.dy = (rnd(g.idx, 5) - .5) * size * .28 * sh;
      t.a = clamp(p * 3, 0, 1); break;
    }
    case 'bound': {                // 上から きて はずむ
      const b = 1 - Math.abs(Math.cos(p * Math.PI * 2.2)) * (1 - p);
      t.dy = -(1 - b) * size * 2.4;
      t.sy = 1 + (1 - b) * .35; t.sx = 1 - (1 - b) * .2;
      t.a = clamp(p * 4, 0, 1); break;
    }
    case 'fan': t.rot = -(1 - e) * 120; t.sx = t.sy = .3 + .7 * e; t.a = p; break;
    case 'cylinder': t.sx = Math.max(.05, Math.sin(e * Math.PI / 2)); t.a = clamp(p * 2, 0, 1); break;
    case 'koma': {                 // 3コマだけ 止めながら 出る
      const k = Math.floor(p * 3) / 3;
      t.sx = t.sy = .5 + .5 * k; t.a = k > 0 ? 1 : 0; break;
    }
    case 'crt': {                  // まん中の 線から ぱっと ひらく
      const k = Math.min(1, p / .5);
      t.sy = Math.max(.02, easeOut(k));
      t.sx = p < .5 ? 1.3 - .3 * k : 1;
      t.a = clamp(p * 6, 0, 1); break;
    }
    case 'loading': {              // 1文字ずつ かちかち と 現れる
      const k = Math.floor(p * 6) / 6;
      t.a = rnd(g.idx, Math.floor(p * 6)) < k + .15 ? 1 : 0; break;
    }
    case 'drum': {                 // たて に まわって くる
      const a2 = (1 - e) * Math.PI;
      t.sy = Math.max(.05, Math.abs(Math.cos(a2)));
      t.dy = Math.sin(a2) * size * .6; t.a = clamp(p * 2, 0, 1); break;
    }
    case 'datafall': {             // 上から 落ちて くる（文字ごとに ずれる）
      const d = rnd(g.idx, 6);
      t.dy = -(1 - e) * size * (2 + d * 5);
      t.a = p > d * .25 ? 1 : 0;
      t.blur = (1 - e) * size * .12; break;
    }
    case 'brush': {                // 筆で はらう
      t.sx = Math.max(.02, e);
      t.dx = -(1 - e) * size * .5;
      t.rot = (1 - e) * -8; t.a = clamp(p * 2.5, 0, 1); break;
    }
    case 'inkdrop': {              // ぽとりと 落ちて にじむ
      const b = back(p);
      t.sx = b * (1 + (1 - p) * .25); t.sy = b * (1 - (1 - p) * .18);
      t.blur = (1 - e) * size * .1; t.a = clamp(p * 3, 0, 1); break;
    }
    case 'countin': {              // 3回 脈打って から 決まる
      const k = Math.min(1, p / .7);
      const pulse = Math.abs(Math.sin(k * Math.PI * 3));
      t.sx = t.sy = p > .7 ? 1 : 1 + pulse * .3;
      t.a = clamp(p * 4, 0, 1); break;
    }
    case 'stroke1': {              // 一画ずつ 書いて いく ように 下から
      const k = clamp(p * 1.15, 0, 1);
      t.sy = k; t.dy = (1 - k) * size * .5; t.a = k > 0 ? 1 : 0; break;
    }
    case 'shutter': {
      const k = Math.min(1, p / .35);
      t.sy = easeOut(k); t.a = clamp(p * 5, 0, 1); break;
    }
    case 'pend': {                 // ふりこの ように ゆれて 止まる
      t.rot = Math.cos(p * Math.PI * 3.2) * (1 - p) * 34;
      t.dy = -(1 - e) * size * .3; t.a = clamp(p * 3, 0, 1); break;
    }
    case 'zip': {                  // 1文字おきに 上下から かみ合う
      const d = g.idx % 2 ? 1 : -1;
      t.dy = d * (1 - e) * size * 1.5; t.a = clamp(p * 2, 0, 1); break;
    }
    case 'pushin': {
      const b = back(p);
      t.dx = -(1 - b) * size * 2.6; t.a = clamp(p * 3, 0, 1); break;
    }
    case 'tilt': t.rot = (1 - e) * 84; t.dy = (1 - e) * size * .3; t.a = p; break;
    case 'squash': {
      const b = spring(p);
      t.sx = 1 + (1 - b) * .8; t.sy = Math.max(.05, 1 - (1 - b) * .9);
      t.a = clamp(p * 3, 0, 1); break;
    }
    case 'crack': {                // ひびが 入って 直る
      const j = (rnd(g.idx, Math.floor(p * 10)) - .5) * (1 - p);
      t.dx = j * size * .5; t.dy = j * size * .3;
      t.rot = j * 40; t.sx = t.sy = .82 + .18 * e;
      t.a = clamp(p * 4, 0, 1); break;
    }
    case 'magnify': {
      t.sx = t.sy = 3.4 - 2.4 * e;
      t.blur = (1 - e) * size * .2; t.a = clamp(p * 2, 0, 1); break;
    }
    case 'sheet': {                // シールを はる
      t.rot = (1 - e) * (rnd(g.idx, 7) - .5) * 40;
      t.sx = t.sy = 1.35 - .35 * e;
      t.a = clamp(p * 4, 0, 1); break;
    }
    case 'unfold': {               // 手紙を ひらく
      t.sy = e; t.dy = -(1 - e) * size * .4;
      t.rot = (1 - e) * -14; t.a = clamp(p * 2, 0, 1); break;
    }
    case 'gather': {               // ばらばらの かけらが 集まる
      const a2 = rnd(g.idx, 8) * Math.PI * 2, d = rnd(g.idx, 9);
      t.dx = Math.cos(a2) * size * (1 + d * 4) * (1 - e);
      t.dy = Math.sin(a2) * size * (1 + d * 4) * (1 - e);
      t.rot = (d - .5) * 180 * (1 - e);
      t.sx = t.sy = .4 + .6 * e; t.a = p; break;
    }
    case 'rise': {                 // 下から せり上がる（見きれながら）
      t.dy = (1 - e) * size * 1.4; t.sy = .6 + .4 * e;
      t.a = clamp(p * 2, 0, 1); break;
    }
  }
  return t;
}
/** 出て いく ところ。p は 1→0（のこり） */
function outAt(kind, p, g, size, opt = {}) {
  const t = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, hue: 0 };
  if (kind === 'none' || p >= 1) return t;
  const q = 1 - p;                 // 0→1 で 消えて いく
  const fn = opt.ease && EASE_FN[opt.ease];
  const e = fn ? fn(q) : easeIn(q);
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

    /* ---- ここから 足した ぶん（q が 0→1 で 消えて いく） ---- */
    case 'explode': {
      const a2 = rnd(g.idx, 11) * Math.PI * 2, d = .4 + rnd(g.idx, 12);
      t.dx = Math.cos(a2) * size * 6 * d * e;
      t.dy = Math.sin(a2) * size * 6 * d * e;
      t.rot = (d - .7) * 420 * e; t.sx = t.sy = 1 - e * .4; t.a = p; break;
    }
    case 'collapse': {
      t.dy = e * e * size * 5;
      t.rot = (rnd(g.idx, 13) - .5) * 120 * e; t.a = 1 - Math.pow(e, 3); break;
    }
    case 'mist': {
      t.dy = -e * size * .9; t.blur = e * size * .45;
      t.sx = t.sy = 1 + e * .3; t.a = p; break;
    }
    case 'sliceout': {
      const d = g.idx % 2 ? 1 : -1;
      t.dx = d * e * size * 3; t.a = p; break;
    }
    case 'wipeout': t.sx = Math.max(.02, 1 - e); t.a = clamp(p * 3, 0, 1); break;
    case 'shrink': t.sx = t.sy = Math.max(.02, 1 - e); t.a = clamp(p * 2, 0, 1); break;
    case 'stretchout': t.sy = 1 + e * 3; t.sx = Math.max(.04, 1 - e); t.a = p; break;
    case 'fly': {
      t.dy = -e * e * size * 6;
      t.rot = (rnd(g.idx, 14) - .5) * 260 * e; t.a = p; break;
    }
    case 'glitchout': {
      const j = rnd(g.idx, Math.floor(q * 14)) - .5;
      t.dx = j * size * 2 * e; t.hue = j * 220 * e;
      t.a = rnd(g.idx, Math.floor(q * 9)) > e * .9 ? 1 : 0; break;
    }
    case 'door': {
      const d = g.idx % 2 ? 1 : -1;
      t.dx = d * e * size * .9; t.sx = Math.max(.02, 1 - e);
      t.a = clamp(p * 2, 0, 1); break;
    }
    case 'tvoff': {
      const k = Math.min(1, q / .6);
      t.sy = Math.max(.01, 1 - k);
      t.sx = q < .6 ? 1 + k * .5 : Math.max(.01, 1 - (q - .6) / .4);
      t.a = clamp(p * 4, 0, 1); break;
    }
    case 'suck': {
      t.sx = t.sy = Math.max(.02, 1 - e);
      t.rot = e * 540; t.dx = -g.x * e * .5; t.a = clamp(p * 1.6, 0, 1); break;
    }
    case 'melt': {
      t.dy = e * e * size * 1.6; t.sy = 1 + e * 1.8;
      t.sx = Math.max(.1, 1 - e * .5); t.a = p; break;
    }
    case 'backspace': {            // うしろの 字から 消えて いく
      t.a = (1 - g.idx / Math.max(1, opt.total || 12)) > e ? 1 : 0; break;
    }
    case 'peel': {
      t.rot = e * 70; t.dx = e * size * 1.2; t.dy = -e * size * .4;
      t.sx = Math.max(.1, 1 - e * .5); t.a = p; break;
    }
    case 'roll': {
      t.sx = t.sy = Math.max(.05, 1 - e);
      t.rot = e * 720; t.dx = e * size * 3; t.dy = e * size * .8; t.a = p; break;
    }
    case 'tear': {
      const d = g.idx % 2 ? 1 : -1;
      t.dx = d * e * size * 1.6; t.dy = e * e * size * 2.4;
      t.rot = d * e * 90; t.a = p; break;
    }
    case 'burn': {
      t.hue = e * 60; t.blur = e * size * .2;
      t.dy = -e * size * .5; t.sy = 1 - e * .3; t.a = Math.pow(p, .5) * p; break;
    }
    case 'erase': {                // 左から ごしごし 消す
      const k = g.idx / Math.max(1, opt.total || 12);
      t.a = k > e ? 1 : 0;
      t.dx = k > e ? 0 : size * .3; break;
    }
    case 'sand': {
      const d = rnd(g.idx, 15);
      t.dx = e * size * (1 + d * 3); t.dy = e * size * (d - .3) * 2;
      t.blur = e * size * .35; t.a = p; break;
    }
    case 'shred': {
      const d = (g.idx % 3) - 1;
      t.dy = e * e * size * (3 + Math.abs(d));
      t.dx = d * e * size * .3; t.sy = 1 + e * .4; t.a = p; break;
    }
    case 'balloon': {
      t.dy = -e * e * size * 5;
      t.dx = Math.sin(e * 6 + g.idx) * size * .5 * e;
      t.rot = Math.sin(e * 5 + g.idx) * 22 * e; t.a = p; break;
    }
    case 'glass': {
      const a2 = rnd(g.idx, 16) * Math.PI * 2;
      t.dx = Math.cos(a2) * size * 4 * e * e;
      t.dy = Math.sin(a2) * size * 4 * e * e + e * e * size * 2;
      t.rot = (rnd(g.idx, 17) - .5) * 300 * e;
      t.a = e < .12 ? 1 : p; break;
    }
    case 'tornado': {
      const a2 = e * Math.PI * 3.5;
      t.dx = Math.cos(a2) * size * 3 * e;
      t.dy = -e * size * 3.4;
      t.rot = e * 640; t.sx = t.sy = Math.max(.06, 1 - e * .8); t.a = p; break;
    }
    case 'flutter': {
      t.dy = e * e * size * 4;
      t.dx = Math.sin(e * 7 + g.idx * .8) * size * .9;
      t.rot = Math.sin(e * 9 + g.idx) * 70; t.a = p; break;
    }
    case 'shock': {
      const k = Math.min(1, q / .3);
      t.sx = t.sy = q < .3 ? 1 + k * .7 : Math.max(.02, 1.7 - (q - .3) / .7 * 1.7);
      t.a = clamp(p * 2, 0, 1); break;
    }
    case 'sink': {
      t.dy = e * size * 1.8; t.blur = e * size * .3;
      t.sy = 1 - e * .25; t.a = p; break;
    }
    case 'cut1': {                 // まん中で 切れて 上下に ずれる
      const d = g.idx % 2 ? 1 : -1;
      t.dy = d * e * size * 1.1; t.dx = d * e * size * .4;
      t.a = e < .08 ? 1 : p; break;
    }
    case 'blow': {
      const d = rnd(g.idx, 18);
      t.dx = e * e * size * (3 + d * 5);
      t.dy = -e * size * (d - .2) * 1.6;
      t.rot = e * (120 + d * 220); t.blur = e * size * .12; t.a = p; break;
    }
    case 'drain': {
      t.dy = e * size * 2.2; t.sy = Math.max(.04, 1 - e);
      t.sx = 1 + e * .2; t.a = clamp(p * 1.5, 0, 1); break;
    }
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

    /* ---- ここから 足した ぶん ---- */
    case 'drift':
      t.dx = Math.sin(b * .9 + g.idx * .4) * size * .12 * k;
      t.dy = Math.cos(b * .7 + g.idx * .3) * size * .1 * k; break;
    case 'breath': t.sx = t.sy = 1 + Math.sin(b * Math.PI) * .05 * k; break;
    case 'jelly': {
      const w = Math.sin(b * Math.PI * 2) * .12 * k;
      t.sx = 1 + w; t.sy = 1 - w; break;
    }
    case 'flame': {
      const s2 = Math.floor(b * 8);
      t.sy = 1 + (rnd(g.idx, s2) - .3) * .12 * k;
      t.dx = (rnd(g.idx, s2 + 3) - .5) * size * .04 * k;
      t.a = 1 - rnd(g.idx, s2 + 5) * .12 * k; break;
    }
    case 'gust': {
      const w = Math.pow(Math.max(0, Math.sin(b * Math.PI * .5)), 6);
      t.dx = w * size * .5 * k; t.rot = w * 12 * k; break;
    }
    case 'hang': {
      t.rot = Math.sin(b * Math.PI * 1.3 + g.idx * .5) * 6 * k;
      t.dy = Math.abs(Math.sin(b * Math.PI * 1.3)) * size * .05 * k; break;
    }
    case 'stretchbeat': {
      const w = Math.pow(1 - ph, 4) * k;
      t.sy = 1 + w * .5; t.sx = 1 - w * .2; break;
    }
    case 'flipbeat': t.sx = Math.cos(Math.floor(b) * Math.PI) >= 0 ? 1 : -1; break;
    case 'gloss': {
      const w = (b * .6 + g.idx * -.14) % 1;
      t.a = 1 - Math.pow(Math.max(0, 1 - Math.abs(w - .5) * 6), 2) * .45 * k; break;
    }
    case 'focusshift': t.blur = (Math.sin(b * .8 + g.idx * .3) * .5 + .5) * size * .06 * k; break;
    case 'string': t.dy = Math.sin(b * Math.PI * 9 + g.idx) * size * .03 * k * Math.max(0, 1 - ph); break;
    case 'typo': {
      const s2 = Math.floor(b * 6);
      t.dy = (rnd(g.idx, s2 + 11) - .5) * size * .06 * k;
      t.rot = (rnd(g.idx, s2 + 13) - .5) * 5 * k; break;
    }
    case 'heartbeat': {
      const w = Math.pow(1 - ph, 8) + Math.pow(1 - Math.abs(ph - .22) * 6, 8) * .6;
      t.sx = t.sy = 1 + Math.max(0, w) * .16 * k; break;
    }
    case 'sway': t.rot = Math.sin(b * .8 + g.idx * .25) * 5 * k; break;
    case 'tick': {
      const s2 = Math.floor(b * 3) / 3;
      t.dy = (s2 % 1 < .5 ? -1 : 1) * size * .03 * k; break;
    }
    case 'blink': t.a = (Math.floor(b * 4) + g.idx) % 7 === 0 ? 1 - .7 * k : 1; break;
    case 'squeezeb': {
      const w = Math.pow(1 - ph, 5) * k;
      t.sy = 1 - w * .35; t.sx = 1 + w * .2; break;
    }
    case 'roll': t.rot = Math.sin(b * Math.PI * .7 + g.idx * .6) * 16 * k; break;
    case 'hueslow': t.hue = (b * 22 + g.idx * 6) % 360 * k; break;
    case 'float': {
      t.dy = Math.sin(b * 1.1 + g.idx * .7) * size * .09 * k;
      t.rot = Math.sin(b * .9 + g.idx * .5) * 4 * k; break;
    }
  }
  return t;
}

/** ふだの 中の 時こく local に おける 1文字の ありさま */
export function glyphState(T, g, local, dur, total, absT) {
  const size = T.size;
  const unit = T.unit || 'char';
  const raw = unit === 'line' ? g.line : unit === 'word' ? g.word : unit === 'all' ? 0 : g.idx;
  const key = orderKey(raw, total, T.order || 'fwd');
  const lag = (T.stagger || 0) * key;
  /* 尺は 秒でも 拍でも きめられる。拍なら 曲が はやいほど みじかくなる */
  const b = beatOn() ? beatSec() : .5;
  const inD = Math.max(.001, T.inBeat > 0 ? b * T.inBeat : (T.inDur || .4));
  const outD = Math.max(.001, T.outBeat > 0 ? b * T.outBeat : (T.outDur || .3));
  const opt = { ease: T.ease && T.ease !== 'auto' ? T.ease : null, dist: T.dist || 0, angle: T.angle, total };

  let pIn = clamp((local - lag) / inD, 0, 1);
  if ((T.fxIn || 'none') === 'type') pIn = (local - lag) >= 0 ? 1 : 0;
  const outStart = dur - outD - (T.outStagger ? lag : 0);
  let pOut = clamp((dur - local - (T.fxOut === 'type' ? lag : 0)) / outD, 0, 1);

  const a = inAt(T.fxIn || 'none', pIn, g, size, opt);
  const bb = outAt(T.fxOut || 'none', pOut, g, size, opt);
  const beat = beatOn() ? beatAt(absT) : absT / (T.loopSec || .5);
  const l = loopAt(T.fxLoop || 'none', beat + (T.loopLag ? key * .12 : 0), g, size, T.loopAmt === undefined ? 1 : T.loopAmt);

  return {
    dx: a.dx + bb.dx + l.dx,
    dy: a.dy + bb.dy + l.dy,
    sx: a.sx * bb.sx * l.sx,
    sy: a.sy * bb.sy * l.sy,
    rot: a.rot + bb.rot + l.rot,
    a: a.a * bb.a * l.a,
    blur: a.blur + bb.blur + l.blur,
    hue: a.hue + bb.hue + l.hue
  };
}

/** もじを えがく（G は すでに ふだの まん中に 移動・回転ずみ） */
export function drawText(G, c, local, absT) {
  const T = c.text;
  const lay = layout(G, T);
  const size = T.size;
  const fam = fontFamily(T.font || 'rounded');

  G.save();
  // かたむき（スキュー）と 反転
  const kh = Math.tan(clamp(T.skewH || 0, -60, 60) * Math.PI / 180);
  const kv = Math.tan(clamp(T.skewV || 0, -60, 60) * Math.PI / 180);
  if (kh || kv) G.transform(1, kv, kh, 1, 0, 0);
  if (T.flipH || T.flipV) G.scale(T.flipH ? -1 : 1, T.flipV ? -1 : 1);

  G.font = `${T.weight} ${size}px ${fam}`;
  G.textAlign = 'center'; G.textBaseline = 'middle';
  G.lineJoin = 'round'; G.miterLimit = 2;

  if (T.bgOn) drawPill(G, T, lay, size);

  /* いくつ ぶん で 出るか（順番の ものさし） */
  const unit = T.unit || 'char';
  const total = unit === 'line' ? Math.max(1, lay.glyphs.reduce((n, g) => Math.max(n, g.line + 1), 1))
    : unit === 'word' ? Math.max(1, lay.glyphs.reduce((n, g) => Math.max(n, g.word + 1), 1))
      : unit === 'all' ? 1 : lay.glyphs.length;

  const mb = T.mblur || 0;
  const steps = mb > 0 ? ((S.quality || 1) < 1 ? 2 : 4) : 1;

  for (const g of lay.glyphs) {
    if (g.ch === ' ' || g.ch === '　') continue;
    for (let k = steps - 1; k >= 0; k--) {
      const back = k * (mb * 0.06);
      const st = glyphState(T, g, local - back, c.dur, total, absT - back);
      if (st.a <= .004) continue;
      const fade = k === 0 ? 1 : (1 - k / steps) * .45;
      const o = offOf(T, g.idx);
      G.save();
      G.globalAlpha = clamp(st.a * fade, 0, 1);
      G.translate(g.x + st.dx + o.x * size, g.y + st.dy + o.y * size);
      if (g.rot) G.rotate(g.rot * Math.PI / 180);
      if (st.rot) G.rotate(st.rot * Math.PI / 180);
      if (o.r) G.rotate(o.r * Math.PI / 180);
      G.scale(st.sx * o.s, st.sy * o.s);
      if (st.blur > .05) G.filter = `blur(${st.blur.toFixed(2)}px)`;

      const col = st.hue ? shiftHue(T.color, st.hue) : T.color;
      const fill = T.grad ? gradFor(G, T, g, lay, size) : col;

      // ① ひかり（グロー）
      if (T.glowOn && k === 0) {
        G.save();
        G.shadowColor = T.glowColor || '#E1DD60';
        G.shadowBlur = Math.max(1, T.glowSize || 18);
        G.shadowOffsetX = 0; G.shadowOffsetY = 0;
        G.fillStyle = fill;
        G.fillText(g.ch, 0, 0);
        G.fillText(g.ch, 0, 0);          // 2回 かさねて しっかり 光らせる
        G.restore();
      }
      // ② かげ
      if (T.shadowOn && k === 0) {
        G.save();
        G.shadowColor = T.shadowColor || '#1E1C14';
        G.shadowBlur = Math.max(0, T.shadowBlur || 0);
        G.shadowOffsetX = T.shadowX === undefined ? 6 : T.shadowX;
        G.shadowOffsetY = T.shadowY === undefined ? 8 : T.shadowY;
        G.fillStyle = fill;
        G.fillText(g.ch, 0, 0);
        G.restore();
      }
      // ③ 本体
      if (T.sw > 0) { G.strokeStyle = T.stroke; G.lineWidth = T.sw; G.strokeText(g.ch, 0, 0); }
      G.fillStyle = fill;
      G.fillText(g.ch, 0, 0);

      G.filter = 'none';
      G.restore();
    }
  }
  G.restore();
}

/* ---------- 1文字ずつの ずらし ----------
   Lyrica の Character Offset と 同じ 考え。
   よこ・たては 文字の 大きさを 1 と した 目もり（em）で 持つ ので、
   あとで 大きさを 変えても くずれない。 */
export const OFF0 = { x: 0, y: 0, s: 1, r: 0 };
export function offOf(T, idx) {
  const o = T.off && T.off[idx];
  if (!o) return OFF0;
  return { x: o.x || 0, y: o.y || 0, s: o.s === undefined ? 1 : o.s, r: o.r || 0 };
}
export function setOff(T, idx, part) {
  if (!T.off) T.off = {};
  const cur = T.off[idx] || { x: 0, y: 0, s: 1, r: 0 };
  T.off[idx] = Object.assign(cur, part);
  const o = T.off[idx];
  if (!o.x && !o.y && !o.r && (o.s === 1 || o.s === undefined)) delete T.off[idx];
}
export const clearOff = (T, idx) => {
  if (!T.off) return;
  if (idx === undefined) T.off = {}; else delete T.off[idx];
};

/** 1文字ずつの 置き場（ずらしこみ）。えらぶ ため・わくを 出す ため */
export function glyphSpots(G, T) {
  const lay = layout(G, T);
  const size = T.size;
  G.font = `${T.weight} ${size}px ${fontFamily(T.font || 'rounded')}`;
  return lay.glyphs
    .filter(g => g.ch !== ' ' && g.ch !== '　')
    .map(g => {
      const o = offOf(T, g.idx);
      const m = G.measureText(g.ch);
      return {
        idx: g.idx, ch: g.ch,
        x: g.x + o.x * size, y: g.y + o.y * size,
        w: Math.max(size * .4, m.width) * o.s, h: size * 1.05 * o.s,
        rot: (g.rot || 0) + o.r
      };
    });
}

/** 文字ぜんたいに かかる グラデーション。
    1字ずつ 動かして いる ので、その字の ぶんだけ ずらして 作る */
function gradFor(G, T, g, lay, size) {
  const a = (T.gradDir === undefined ? 90 : T.gradDir) * Math.PI / 180;
  const ex = Math.cos(a), ey = Math.sin(a);
  // 文字ぜんたいを またぐ ように 長さを とる
  const R = Math.max(lay.w, lay.h, size) / 2;
  const gr = G.createLinearGradient(
    -ex * R - g.x, -ey * R - g.y,
    ex * R - g.x, ey * R - g.y
  );
  gr.addColorStop(0, T.color);
  gr.addColorStop(1, T.color2 || T.color);
  return gr;
}

function drawPill(G, T, lay, size) {
  const pad = size * .36;
  const bw = lay.w + pad * 2;
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
