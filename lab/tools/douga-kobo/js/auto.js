/* おまかせ組み立て。
   歌詞と 曲の はやさから、カットを じどうで 組み立てる。

   やり方は「部品を くじ引きして 組み合わせる」だけ。
   1カットに つき、下の 7つの たなから 1つずつ ひく。
     ならべ方 / 出かた / ずっと / 消えかた / かざり / 文字づくり / うしろ
   おなじ たねの ばんごう（シード）なら いつも おなじ ものが 出る ので、
   気に入った 組み合わせを あとから 呼びもどせる。 */
import {
  S, uid, clamp, newTrack, newClip, findClip, snap as pushUndo, toast
} from './state.js?v=67';
import { beatOn, beatSec } from './beat.js?v=67';
import { GFONTS, setOff } from './text.js?v=67';
import { bus } from './bus.js?v=67';
import { PATS, DECOS } from './pattern.js?v=67';
import { TRANS, TRANS_LIST } from './trans.js?v=67';
import { CAMS as CAMLIST, CAM_LIST } from './camera.js?v=67';

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
  glitch: ['glitch', 'flipx', 'flipy', 'stretch', 'scatter', 'jitter', 'shake', 'flash',
    'crt', 'loading', 'crack', 'slicein', 'datafall', 'koma', 'typo', 'tick', 'blink', 'flipbeat',
    'glitchout', 'tvoff', 'sliceout', 'shred', 'explode', 'cut1', 'shock'],
  calm: ['fade', 'blur', 'up', 'down', 'wavein', 'swing', 'wave', 'none', 'kenburns',
    'iris', 'unfold', 'rise', 'inkdrop', 'brush', 'pend', 'breath', 'drift', 'float', 'sway', 'focusshift',
    'mist', 'sink', 'melt', 'flutter', 'drain', 'shrink'],
  pop: ['pop', 'spring', 'zoomin', 'drop', 'bounce', 'pulse', 'zoombeat', 'zoom',
    'bound', 'stamp', 'squash', 'pushin', 'sheet', 'countin', 'magnify', 'jelly', 'heartbeat', 'squeezeb', 'stretchbeat',
    'balloon', 'fly', 'roll', 'shock', 'explode'],
  graphic: ['wipe', 'slide', 'left', 'right', 'rotate', 'none', 'updown', 'zoom',
    'blind', 'shutter', 'zip', 'domino', 'fan', 'cylinder', 'drum', 'tilt', 'gloss', 'tick', 'roll',
    'wipeout', 'door', 'sliceout', 'suck', 'shrink'],
  editorial: ['type', 'fade', 'wipe', 'none', 'up', 'blur',
    'stroke1', 'loading', 'rise', 'iris', 'breath', 'gloss',
    'backspace', 'erase', 'wipeout', 'mist'],
  emo: ['blur', 'fade', 'zoomout', 'spiral', 'wavein', 'pulse', 'swing', 'kenburns',
    'gather', 'neon', 'datafall', 'magnify', 'unfold', 'flame', 'hang', 'string', 'hueslow', 'float',
    'mist', 'sand', 'tornado', 'balloon', 'flutter', 'burn', 'sink']
};
/* がら と かざり の 雰囲気ふだ */
const PAT_TAGS = {
  glitch: ['vhs', 'grid', 'speed', 'check', 'stripe', 'halftone'],
  calm: ['mesh', 'aurora', 'contour', 'wave', 'stars', 'none', 'spot'],
  pop: ['dots', 'check', 'rays', 'stripe', 'halftone', 'rings'],
  graphic: ['grid', 'stripe', 'slant', 'check', 'rings', 'bigchar', 'window'],
  editorial: ['none', 'halftone', 'contour', 'window', 'bigchar', 'stripe'],
  emo: ['mesh', 'aurora', 'stars', 'spot', 'wave', 'rays', 'seigaiha']
};
const TRANS_TAGS = {
  glitch: ['glitchcut', 'blocks', 'flash', 'whip', 'check'],
  calm: ['fade', 'iris', 'ink', 'wipeU', 'clock'],
  pop: ['zoom', 'flash', 'whip', 'doors', 'check', 'tiles'],
  graphic: ['wipeL', 'wipeR', 'slant', 'blinds', 'doors', 'check'],
  editorial: ['fade', 'wipeL', 'wipeU', 'iris', 'clock'],
  emo: ['fade', 'iris', 'ink', 'zoom', 'blinds']
};
const DECO_TAGS = {
  glitch: ['barcode', 'tc', 'bars', 'slash', 'scanbar', 'bignum'],
  calm: ['none', 'petal', 'leader', 'dim', 'corner'],
  pop: ['confetti', 'bignum', 'slash', 'wavebar', 'corner'],
  graphic: ['cross', 'tombo', 'bars', 'dim', 'corner', 'bignum'],
  editorial: ['tombo', 'dim', 'leader', 'bignum', 'none'],
  emo: ['petal', 'scanbar', 'none', 'corner', 'leader']
};
/** 雰囲気で しぼる。合う ものが 無ければ ぜんぶから */
function byMood(list, mood) {
  const t = TAGS[mood];
  if (!t) return list;
  const key = x => (Array.isArray(x) ? x[0] : x);
  const hit = list.filter(x => t.includes(key(x)));
  return hit.length ? hit : list;
}
/** 雰囲気の ふだ から 名まえの ならびを 作る（無ければ ぜんぶ） */
function moodList(tags, mood, all) {
  const t = tags[mood];
  const names = all.map(x => x[0]).filter(n => n !== 'none');
  if (!t) return names;
  const hit = t.filter(n => names.includes(n));
  return hit.length ? hit : names;
}
/** 雰囲気を 見て くじを ひく（7割は 合う もの、3割は 自由に） */
const pickM = (r, list, mood) => pick(r, chance(r, .7) ? byMood(list, mood) : list);

/* ---------- 部品の たな ---------- */

/** ① ならべ方（どこに どう 置くか） */
export const LAYOUTS = [
  ['mid-big', 'まん中 おおきく', (c, W, H) => { c.text.size = 190; c.text.align = 'center'; }],
  ['mid', 'まん中', (c) => { c.text.size = 130; c.text.align = 'center'; }],
  ['mid-small', 'まん中 ちいさく', (c) => { c.text.size = 86; c.text.align = 'center'; }],
  ['low-left', '左下', (c, W, H) => { c.text.size = 120; c.text.align = 'left'; c.y = H * .28; }],
  ['up-right', '右上', (c, W, H) => { c.text.size = 120; c.text.align = 'right'; c.y = -H * .28; }],
  ['band-low', '下の 帯', (c, W, H) => { c.text.size = 96; c.text.align = 'center'; c.y = H * .33; c.text.bgOn = true; }],
  ['band-up', '上の 帯', (c, W, H) => { c.text.size = 96; c.text.align = 'center'; c.y = -H * .33; c.text.bgOn = true; }],
  ['tate-right', 'たて書き 右', (c, W, H) => { c.text.vertical = true; c.text.size = 100; c.x = W * .3; }],
  ['tate-left', 'たて書き 左', (c, W, H) => { c.text.vertical = true; c.text.size = 100; c.x = -W * .3; }],
  ['slant', 'ななめ', (c) => { c.text.size = 140; c.text.skewH = 12; c.rot = -6; }],
  ['wide', 'よこに のばす', (c) => { c.text.size = 104; c.text.tracking = .38; }],
  ['tight', 'つめて おおきく', (c) => { c.text.size = 176; c.text.tsume = .8; c.text.tracking = -.04; }],
  ['arc', 'カーブ', (c) => { c.text.size = 128; c.text.curve = 34; }],
  ['arc-down', 'カーブ 下', (c) => { c.text.size = 128; c.text.curve = -34; }],
  ['corner', 'すみに よせる', (c, W, H) => { c.text.size = 108; c.text.align = 'left'; c.y = -H * .3; }],
  ['off-mid', 'ずらして おおきく', (c, W, H) => { c.text.size = 168; c.x = W * .12; c.y = H * .06; }],

  /* ---- ここから 足した ぶん ---- */
  ['huge', '画面 いっぱい', (c, W, H) => { c.text.size = 215; c.text.tsume = .9; c.text.tracking = -.06; }],
  ['break', 'はみ出す', (c, W, H) => { c.text.size = 270; c.text.tsume = .95; c.text.tracking = -.08; c.x = -W * .06; }],
  ['telop', '下部テロップ', (c, W, H) => {
    c.text.size = 68; c.text.align = 'center'; c.y = H * .38;
    c.text.bgOn = true; c.text.tracking = .06;
  }],
  ['telop-left', '下部テロップ 左', (c, W, H) => {
    c.text.size = 64; c.text.align = 'left'; c.y = H * .38;
    c.text.bgOn = true;
  }],
  ['subtitle', '字幕', (c, W, H) => { c.text.size = 58; c.text.align = 'center'; c.y = H * .4; c.text.sw = 8; }],
  ['title-up', '大見出し 上', (c, W, H) => { c.text.size = 150; c.y = -H * .18; c.text.tracking = .02; }],
  ['title-low', '大見出し 下', (c, W, H) => { c.text.size = 150; c.y = H * .18; }],
  ['label', 'ラベル はり', (c, W, H) => {
    c.text.size = 74; c.text.bgOn = true; c.rot = -4;
    c.x = -W * .16; c.y = -H * .14;
  }],
  ['stamp-r', 'はんこ 右下', (c, W, H) => {
    c.text.size = 88; c.rot = -12; c.x = W * .24; c.y = H * .28; c.text.bgOn = true;
  }],
  ['tall', 'たて長 つぶし', (c, W, H) => {
    c.text.size = 210; c.text.tsume = 1; c.text.tracking = -.12;
    for (let i = 0; i < 40; i++) setOff(c.text, i, { s: 1 });
    c.text.skewV = 0; c.text.lineGap = 1;
  }],
  ['ring', '円環', (c, W, H) => { c.text.size = 96; c.text.curve = 120; }],
  ['ring-in', '円環 うち', (c, W, H) => { c.text.size = 96; c.text.curve = -120; }],
  ['wavepath', 'なみの 道', (c, W, H) => { c.text.size = 110; c.text.curve = 18; c.text.tracking = .12; }],
  ['note', '注釈', (c, W, H) => {
    c.text.size = 46; c.text.align = 'left'; c.y = H * .3;
    c.text.tracking = .2; c.text.weight = 500;
  }],
  ['typing', 'タイプ 左上', (c, W, H) => {
    c.text.size = 72; c.text.align = 'left'; c.y = -H * .26;
    c.text.font = 'dot'; c.text.tracking = .1;
  }],
  ['slantband', 'ななめ帯', (c, W, H) => {
    c.text.size = 112; c.rot = -14; c.text.bgOn = true; c.text.tracking = .08;
  }],
  ['slantband-r', 'ななめ帯 右上がり', (c, W, H) => {
    c.text.size = 112; c.rot = 14; c.text.bgOn = true; c.text.tracking = .08;
  }],
  ['capsule', 'カプセル', (c, W, H) => { c.text.size = 92; c.text.bgOn = true; c.text.tracking = .14; }],
  ['stack', '残像スタック', (c, W, H) => { c.text.size = 150; c.text.mblur = 1.2; c.y = -H * .04; }],
  ['scatterfit', '散らし', (c, W, H) => {
    c.text.size = 110; c.text.tracking = .26; c.text.unit = 'char'; c.text.stagger = .07;
    for (let i = 0; i < 40; i++) {
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const r1 = a - Math.floor(a);
      const b2 = Math.sin(i * 78.233) * 43758.5453;
      const r2 = b2 - Math.floor(b2);
      setOff(c.text, i, { x: (r1 - .5) * .5, y: (r2 - .5) * .9, r: (r1 - .5) * 34 });
    }
  }],
  ['mixsize', '大小ミックス', (c, W, H) => {
    c.text.size = 130; c.text.tracking = .06;
    for (let i = 0; i < 40; i++) {
      const a = Math.sin(i * 33.77) * 43758.5453;
      const r1 = a - Math.floor(a);
      setOff(c.text, i, { s: r1 < .35 ? 1.7 : (r1 < .7 ? .62 : 1) });
    }
  }],
  ['genkou', '原稿用紙', (c, W, H) => {
    c.text.vertical = true; c.text.size = 78; c.text.tracking = .2; c.x = W * .18;
  }],
  ['tanzaku', '短冊', (c, W, H) => {
    c.text.vertical = true; c.text.size = 86; c.text.bgOn = true; c.x = W * .22;
  }],
  ['kakejiku', '掛け軸', (c, W, H) => {
    c.text.vertical = true; c.text.size = 96; c.text.tracking = .06; c.x = 0;
  }],
  ['norendown', 'のれん', (c, W, H) => {
    c.text.vertical = true; c.text.size = 90; c.y = -H * .04; c.text.bgOn = true;
  }],
  ['ekimei', '駅名標', (c, W, H) => {
    c.text.size = 100; c.text.bgOn = true; c.text.tracking = .22; c.y = 0;
  }],
  ['sign', '看板', (c, W, H) => { c.text.size = 128; c.text.bgOn = true; c.text.sw = 10; }],
  ['neonsign', 'ネオン看板', (c, W, H) => {
    c.text.size = 138; c.text.glowOn = true; c.text.glowSize = 40; c.text.sw = 3;
  }],
  ['board', '電光けいじ板', (c, W, H) => {
    c.text.size = 92; c.text.font = 'dot'; c.text.tracking = .18; c.text.glowOn = true; c.text.glowSize = 22;
  }],
  ['endroll', 'エンドロール', (c, W, H) => {
    c.text.size = 62; c.text.align = 'center'; c.text.tracking = .3; c.text.weight = 500;
  }],
  ['index', '目次', (c, W, H) => {
    c.text.size = 58; c.text.align = 'left'; c.text.tracking = .16; c.text.weight = 500;
  }],
  ['news', '新聞', (c, W, H) => {
    c.text.size = 84; c.text.align = 'left'; c.y = -H * .2;
    c.text.font = 'g-shippori'; c.text.tracking = .04;
  }],
  ['magazine', '雑誌の 見ひらき', (c, W, H) => {
    c.text.size = 150; c.text.align = 'left'; c.y = -H * .12;
    c.text.tsume = .85; c.text.tracking = -.05;
  }],
  ['polaroid', 'ポラロイド', (c, W, H) => {
    c.text.size = 70; c.text.bgOn = true; c.rot = -3; c.y = H * .04;
  }],
  ['ticket', '切手シート', (c, W, H) => { c.text.size = 82; c.text.bgOn = true; c.text.tracking = .1; c.rot = 2; }],
  ['balloon', '吹き出し', (c, W, H) => {
    c.text.size = 88; c.text.bgOn = true; c.x = -W * .12; c.y = -H * .16;
  }],
  ['tunnel', 'トンネル', (c, W, H) => { c.text.size = 190; c.text.tsume = .9; c.text.mblur = 1.4; }],
  ['rain', '文字の 雨', (c, W, H) => {
    c.text.vertical = true; c.text.size = 68; c.text.tracking = .28; c.x = W * .1; c.y = 0;
  }],
  ['flag', 'はためく はた', (c, W, H) => { c.text.size = 124; c.text.curve = 26; c.text.skewV = 6; }],
  ['mirror', '鏡文字', (c, W, H) => { c.text.size = 140; c.text.flipH = true; }],
  ['upside', 'さかさま', (c, W, H) => { c.text.size = 130; c.rot = 180; }],
  ['tiny-corner', 'すみに 小さく', (c, W, H) => {
    c.text.size = 44; c.text.align = 'right'; c.y = H * .38; c.text.tracking = .24;
  }]
];

/** ② 出かた（登場） */
const INS = ['up', 'down', 'left', 'right', 'zoomin', 'zoomout', 'pop', 'spring',
  'rotate', 'flipx', 'flipy', 'blur', 'type', 'wipe', 'scatter', 'drop',
  'stretch', 'glitch', 'spiral', 'wavein', 'slide', 'fade',
  'domino', 'slicein', 'iris', 'blind', 'neon', 'stamp', 'bound', 'fan',
  'cylinder', 'koma', 'crt', 'loading', 'drum', 'datafall', 'brush', 'inkdrop',
  'countin', 'stroke1', 'shutter', 'pend', 'zip', 'pushin', 'tilt', 'squash',
  'crack', 'magnify', 'sheet', 'unfold', 'gather', 'rise'];
/** ③ ずっと（保持） */
const LOOPS = ['none', 'none', 'bounce', 'pulse', 'shake', 'swing', 'wave',
  'flash', 'jitter', 'updown', 'zoombeat',
  'drift', 'breath', 'jelly', 'flame', 'gust', 'hang', 'stretchbeat', 'flipbeat',
  'gloss', 'focusshift', 'string', 'typo', 'heartbeat', 'sway', 'tick', 'blink',
  'squeezeb', 'roll', 'hueslow', 'float'];
/** ④ 消えかた（退場） */
const OUTS = ['fade', 'fade', 'up', 'down', 'zoomin', 'zoomout', 'blur', 'scatter', 'type',
  'explode', 'collapse', 'mist', 'sliceout', 'wipeout', 'shrink', 'stretchout', 'fly',
  'glitchout', 'door', 'tvoff', 'suck', 'melt', 'backspace', 'peel', 'roll',
  'tear', 'burn', 'erase', 'sand', 'shred', 'balloon', 'glass', 'tornado',
  'flutter', 'shock', 'sink', 'cut1', 'blow', 'drain'];
/** ⑤ 出る じゅんばん */
const ORDER = ['fwd', 'fwd', 'rev', 'center', 'edges', 'random'];
/** ⑥ うごきかた */
const EASE = ['auto', 'out', 'out', 'back', 'spring', 'inout'];
/** ⑦ どの まとまりで */
const UNITS = ['char', 'char', 'char', 'word', 'line', 'all'];

/** ⑧ 文字の 加工（ふち・かげ・ひかり・グラデ・地じき） */
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
  }],

  /* ---- ここから 足した ぶん ---- */
  ['fukuro', '袋文字', (c, P) => {
    c.text.sw = 26; c.text.stroke = P.ink; c.text.shadowOn = false;
  }],
  ['fukuro-paper', '白い 袋文字', (c, P) => {
    c.text.sw = 22; c.text.stroke = P.paper; c.text.color = P.ink;
  }],
  ['nuki', '白ぬき', (c, P) => {
    c.text.color = P.paper; c.text.sw = 16; c.text.stroke = P.ink;
  }],
  ['longshadow', '長い かげ', (c, P) => {
    c.text.sw = 0; c.text.shadowOn = true; c.text.shadowColor = P.ink;
    c.text.shadowX = 34; c.text.shadowY = 34; c.text.shadowBlur = 0;
  }],
  ['longshadow-acc', '長い かげ（さし色）', (c, P) => {
    c.text.sw = 6; c.text.stroke = P.ink;
    c.text.shadowOn = true; c.text.shadowColor = P.accent;
    c.text.shadowX = 26; c.text.shadowY = 26; c.text.shadowBlur = 0;
  }],
  ['solid3d', '立体', (c, P) => {
    c.text.sw = 4; c.text.stroke = P.ink;
    c.text.shadowOn = true; c.text.shadowColor = P.accent2;
    c.text.shadowX = 10; c.text.shadowY = 10; c.text.shadowBlur = 0;
  }],
  ['dropfar', 'うきあがり', (c, P) => {
    c.text.sw = 0; c.text.shadowOn = true; c.text.shadowColor = 'rgba(0,0,0,.55)';
    c.text.shadowX = 0; c.text.shadowY = 26; c.text.shadowBlur = 40;
  }],
  ['marker', 'マーカー', (c, P) => {
    c.text.bgOn = true; c.text.bgColor = P.accent; c.text.color = P.ink;
    c.text.sw = 0; c.text.tracking = Math.max(c.text.tracking || 0, .04);
  }],
  ['marker2', 'マーカー（さし色2）', (c, P) => {
    c.text.bgOn = true; c.text.bgColor = P.accent2; c.text.color = P.ink; c.text.sw = 0;
  }],
  ['neontube', 'ネオン管', (c, P) => {
    c.text.color = P.paper; c.text.sw = 3; c.text.stroke = P.accent;
    c.text.glowOn = true; c.text.glowColor = P.accent; c.text.glowSize = 52;
  }],
  ['neontube2', 'ネオン管（2色）', (c, P) => {
    c.text.color = P.accent; c.text.sw = 2; c.text.stroke = P.paper;
    c.text.glowOn = true; c.text.glowColor = P.accent2; c.text.glowSize = 44;
  }],
  ['chrome', 'クローム', (c, P) => {
    c.text.grad = true; c.text.color = '#FFFFFF'; c.text.color2 = '#7a8496';
    c.text.gradDir = 90; c.text.sw = 8; c.text.stroke = P.ink;
  }],
  ['gold', '金', (c, P) => {
    c.text.grad = true; c.text.color = '#FFE9A8'; c.text.color2 = '#B8860B';
    c.text.gradDir = 90; c.text.sw = 6; c.text.stroke = P.ink;
    c.text.glowOn = true; c.text.glowColor = '#FFD76A'; c.text.glowSize = 20;
  }],
  ['rainbow', 'にじ色', (c, P) => {
    c.text.grad = true; c.text.color = '#FF5C6C'; c.text.color2 = '#00E5FF';
    c.text.gradDir = 30; c.text.sw = 8; c.text.stroke = P.ink;
  }],
  ['grad-tate', 'グラデ たて', (c, P) => {
    c.text.grad = true; c.text.color2 = P.accent; c.text.gradDir = 90; c.text.sw = 0;
  }],
  ['grad-naname', 'グラデ ななめ', (c, P) => {
    c.text.grad = true; c.text.color2 = P.accent2; c.text.gradDir = 45; c.text.sw = 10; c.text.stroke = P.ink;
  }],
  ['glow-soft', 'ぼんやり 発光', (c, P) => {
    c.text.sw = 0; c.text.glowOn = true; c.text.glowColor = P.paper; c.text.glowSize = 64;
  }],
  ['glow-hard', 'つよい 発光', (c, P) => {
    c.text.sw = 0; c.text.glowOn = true; c.text.glowColor = P.accent; c.text.glowSize = 90;
  }],
  ['edge-acc', 'さし色の ふち', (c, P) => {
    c.text.sw = 14; c.text.stroke = P.accent;
  }],
  ['edge-double', '二重ふち ふう', (c, P) => {
    c.text.sw = 18; c.text.stroke = P.accent;
    c.text.shadowOn = true; c.text.shadowColor = P.ink;
    c.text.shadowX = 0; c.text.shadowY = 0; c.text.shadowBlur = 0;
  }],
  ['sticker', 'シールぶち', (c, P) => {
    c.text.sw = 20; c.text.stroke = P.paper;
    c.text.shadowOn = true; c.text.shadowColor = 'rgba(0,0,0,.35)';
    c.text.shadowX = 6; c.text.shadowY = 8; c.text.shadowBlur = 10;
  }],
  ['pill-ink', 'くろ地', (c, P) => {
    c.text.bgOn = true; c.text.bgColor = P.ink; c.text.color = P.paper; c.text.sw = 0;
  }],
  ['pill-paper', 'しろ地', (c, P) => {
    c.text.bgOn = true; c.text.bgColor = P.paper; c.text.color = P.ink; c.text.sw = 0;
  }],
  ['skew', 'かたむけ', (c, P) => {
    c.text.skewH = 14; c.text.sw = 10; c.text.stroke = P.ink;
  }],
  ['skew-back', 'ぎゃくかたむけ', (c, P) => {
    c.text.skewH = -12; c.text.sw = 10; c.text.stroke = P.ink;
  }],
  ['spaced', 'すかし', (c, P) => {
    c.text.sw = 0; c.text.tracking = .42; c.text.weight = 400;
  }],
  ['squeeze', 'ぎゅうづめ', (c, P) => {
    c.text.tsume = .92; c.text.tracking = -.08; c.text.sw = 12; c.text.stroke = P.ink;
  }],
  ['glow-edge-ink', 'くろふち＋発光', (c, P) => {
    c.text.sw = 16; c.text.stroke = P.ink;
    c.text.glowOn = true; c.text.glowColor = P.accent2; c.text.glowSize = 34;
  }],
  ['shadow-acc', 'さし色の かげ', (c, P) => {
    c.text.sw = 0; c.text.shadowOn = true; c.text.shadowColor = P.accent;
    c.text.shadowX = 8; c.text.shadowY = 8; c.text.shadowBlur = 0;
  }],
  ['shadow-split', 'ずらし かげ', (c, P) => {
    c.text.sw = 4; c.text.stroke = P.ink;
    c.text.shadowOn = true; c.text.shadowColor = P.accent;
    c.text.shadowX = -12; c.text.shadowY = 12; c.text.shadowBlur = 0;
  }],
  ['thin', 'ほそ字', (c, P) => {
    c.text.weight = 400; c.text.sw = 0; c.text.tracking = .12;
  }],
  ['fat', 'ふと字', (c, P) => {
    c.text.weight = 900; c.text.sw = 6; c.text.stroke = P.ink;
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

/** ⑪ がら（うしろの もよう）と ⑫ かざり（上に のせる 絵） */
export const PAT_LIST = PATS.map(x => [x[0], x[1]]);
export const DECO_LIST = DECOS.map(x => [x[0], x[1]]);
/** ⑬ カット間の つなぎ */
export const TRANS_OPTS = TRANS_LIST;
/** コマ打ち */
export const STEPS = [['0', 'フル（なめらか）'], ['12', '2コマ打ち'], ['8', '3コマ打ち']];

/** ⑩ カメラ（うしろの うごき） */
const CAMS = ['none', 'none', 'kenburns', 'zoom', 'up', 'fade'];
/** カメラの 雰囲気ふだ */
const CAM_TAGS = {
  glitch: ['snap', 'step', 'quake', 'beatshake', 'crash', 'barrel'],
  calm: ['slowin', 'slowout', 'kenburns', 'breathe', 'focus', 'driftL', 'driftR'],
  pop: ['beatpunch', 'beatzoom', 'push', 'crash', 'snap', 'orbit'],
  graphic: ['panL', 'panR', 'panU', 'panD', 'dutchfix', 'step', 'push'],
  editorial: ['slowin', 'slowout', 'none', 'panU', 'breathe'],
  emo: ['kenburns', 'orbit', 'dizzy', 'pendulum', 'breathe', 'swirl', 'tilt']
};
/** 画面で えらぶ ときの ならび */
export const CAM_OPTS = CAM_LIST;
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
  ['ひざし', { ink: '#231703', paper: '#FFF8E8', accent: '#FFB300', accent2: '#FF5C00', bg1: '#3a2a08', bg2: '#8a5a10', text: '#FFF8E8' }],

  /* ---- ここから 足した ぶん ---- */
  ['しんかい', { ink: '#02080f', paper: '#E8F6FF', accent: '#2FE0C8', accent2: '#5B8CFF', bg1: '#04121f', bg2: '#0b2b47', text: '#E8F6FF' }],
  ['ゆうやけ', { ink: '#2a1020', paper: '#FFF3E6', accent: '#FF7A45', accent2: '#FFC93C', bg1: '#4a1b35', bg2: '#9c3b3b', text: '#FFF3E6' }],
  ['もりの てちょう', { ink: '#16240f', paper: '#F6F3E2', accent: '#8FB43A', accent2: '#D8A23A', bg1: '#1e3316', bg2: '#3f5c2a', text: '#F6F3E2' }],
  ['ヴェイパー', { ink: '#160d2b', paper: '#FFF0FB', accent: '#FF6FD8', accent2: '#5BE7FF', bg1: '#241443', bg2: '#4a2a7a', text: '#FFF0FB' }],
  ['しんぶん', { ink: '#1a1a18', paper: '#F3F0E6', accent: '#8a8878', accent2: '#B33A2B', bg1: '#EDE9DC', bg2: '#D8D3C2', text: '#1a1a18' }],
  ['シンセ80s', { ink: '#0a041c', paper: '#FFFFFF', accent: '#FF2D95', accent2: '#00F0FF', bg1: '#140a33', bg2: '#3a1466', text: '#FFFFFF' }],
  ['クラフト紙', { ink: '#2e2115', paper: '#F7ECD8', accent: '#C98A3C', accent2: '#6B8E5A', bg1: '#C9B08A', bg2: '#E3D2B4', text: '#2e2115' }],
  ['キャンディ', { ink: '#33203a', paper: '#FFF8FC', accent: '#FF8FC7', accent2: '#8FD8FF', bg1: '#FFE3F1', bg2: '#E3F1FF', text: '#33203a' }],
  ['アシッド', { ink: '#0d0d0d', paper: '#FBFF00', accent: '#00FF85', accent2: '#FF00C8', bg1: '#111111', bg2: '#2b2b00', text: '#FBFF00' }],
  ['すみと しゅ', { ink: '#16110d', paper: '#F4EFE3', accent: '#C0392B', accent2: '#8a7a5a', bg1: '#F4EFE3', bg2: '#DED6C4', text: '#16110d' }],
  ['きんや', { ink: '#0f0c06', paper: '#FFF6DC', accent: '#E8C25A', accent2: '#B8862B', bg1: '#161108', bg2: '#3a2c12', text: '#FFF6DC' }],
  ['モノクロ', { ink: '#0a0a0a', paper: '#FFFFFF', accent: '#B0B0B0', accent2: '#606060', bg1: '#161616', bg2: '#3a3a3a', text: '#FFFFFF' }],
  ['はいいろ 昼', { ink: '#23262b', paper: '#FAFBFC', accent: '#4A6FA5', accent2: '#A5794A', bg1: '#E8EBEF', bg2: '#C9D0D9', text: '#23262b' }],
  ['みどり あめ', { ink: '#07140f', paper: '#EAF7F0', accent: '#3DDC84', accent2: '#B8E986', bg1: '#0c2119', bg2: '#17402f', text: '#EAF7F0' }],
  ['むらさき やみ', { ink: '#0b0616', paper: '#F3ECFF', accent: '#A66BFF', accent2: '#FF6BB5', bg1: '#150b2b', bg2: '#2e1a52', text: '#F3ECFF' }],
  ['あかつき', { ink: '#1c0d14', paper: '#FFF0F0', accent: '#FF4D6D', accent2: '#FFB86B', bg1: '#2e1220', bg2: '#6b2438', text: '#FFF0F0' }],
  ['こおり', { ink: '#0a1620', paper: '#F0FAFF', accent: '#8FE3FF', accent2: '#C8D8FF', bg1: '#dceaf5', bg2: '#b8d4e8', text: '#0a1620' }],
  ['つちいろ', { ink: '#231a12', paper: '#F5EDE0', accent: '#B5743A', accent2: '#7A8C5A', bg1: '#3a2c1e', bg2: '#6b5238', text: '#F5EDE0' }]
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
/** ふち・かげの 色。
    字とも うしろとも 差が ある ものを えらぶ。
    字だけ 見て きめると、くろい うしろに くろい ふち を 引いて しまう。 */
function edgeOn(P, txtHex, bgHex) {
  const cands = [P.ink, P.paper, P.accent, P.accent2];
  let best = P.ink, bestScore = -1;
  cands.forEach(c => {
    const sc = Math.min(ratio(c, txtHex), ratio(c, bgHex));
    if (sc > bestScore) { bestScore = sc; best = c; }
  });
  return best;
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

/* ---------- くじ引きの 道具ひとそろい ---------- */
function makeCtx(opt) {
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
  const [palName, P] = FT('palette', PALETTES, () => pick(r, PALETTES));
  const fonts = GFONTS.map(f => f[0]);
  const baseFont = has('font') ? fx.font : pick(r, fonts);
  return { seed, mood, fx, has, F, FT, r, P, palName, fonts, baseFont, W: S.W, H: S.H };
}

/* ---------- 1まいの 文字ふだに 着せる ----------
   c.text.str は もう 入って いる もの を つかう。
   back は うしろの いろ（読める 文字色を きめる ため）。 */
function dressText(c, ctx, back, opt = {}) {
  const { r, mood, has, fx, F, FT, P, fonts, baseFont, W, H } = ctx;
  const T = c.text;
  const { str, marks } = emphasis(T.str);
  T.str = str;
  /* 前に かけた ぶんの 1文字ずつの ずらしを 消してから かけ直す。
     のこすと ひきなおす たびに どんどん ずれて いく。 */
  T.off = {};

  const keepColor = !!opt.keepColor;
  const txt = has('color') ? fx.color : readable(P, back);
  const ink2 = edgeOn(P, txt, back);
  const P2 = Object.assign({}, P, {
    text: txt, ink: ink2,
    accent: accentOn(P, back, ink2),
    accent2: accentOn(P, txt, ink2)
  });
  const col0 = { color: T.color, stroke: T.stroke, bgColor: T.bgColor };
  T.color = txt; T.stroke = ink2; T.bgColor = P2.accent;

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

  // いちを そのままに する ときは、ならべ方の ぶんを あとで もどす
  const pos0 = { x: c.x, y: c.y, rot: c.rot, size: T.size, align: T.align, vertical: T.vertical };
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

  if (opt.keepPos) {
    c.x = pos0.x; c.y = pos0.y; c.rot = pos0.rot;
    T.size = pos0.size; T.align = pos0.align; T.vertical = pos0.vertical;
  }
  if (keepColor) Object.assign(T, col0);

  // *つよく* の ところを 1文字ずつ 大きく
  marks.forEach(([a2, b2]) => {
    for (let k = a2; k < b2; k++) setOff(T, k, { s: 1.35 + r() * .35, y: -.04 });
  });
  // たまに 1文字だけ はねる
  if (chance(r, .22) && str.length > 2) {
    const k = Math.floor(r() * str.length);
    setOff(T, k, { y: (r() - .5) * .4, r: (r() - .5) * 26, s: 1 + r() * .5 });
  }
  return { txt: T.color, ink2, P2 };
}

/* ---------- いま ある 文字に かける ----------
   ふだの 字・いつ・ながさ は さわらず、うごきと かざりだけ かけ直す。
   target: 'sel'（えらんだ ふだ）/ 'track'（その 段ぜんぶ）/ 'all'（文字 ぜんぶ） */
export function autoApply(opt = {}) {
  const target = opt.target || 'all';
  let list = [];
  if (target === 'sel') {
    const f = S.sel ? findClip(S.sel) : null;
    if (f && f.c.kind === 'text') list = [f.c];
  } else if (target === 'track') {
    const t = S.tracks.find(t2 => t2.id === S.selTrack);
    if (t) list = t.clips.filter(c => c.kind === 'text');
  } else {
    list = S.tracks.filter(t => t.kind === 'text')
      .flatMap(t => t.clips.filter(c => c.kind === 'text'));
  }
  if (!list.length) { toast('かける 文字が ない'); return 0; }

  const ctx = makeCtx(opt);
  list.sort((a, b) => a.start - b.start);
  list.forEach(c => {
    dressText(c, ctx, backAt(c.start), { keepPos: !!opt.keepPos, keepColor: !!opt.keepColor });
  });

  const LOOKS2 = looksFor();
  if (opt.look !== false) {
    const look = LOOKS2[ctx.has('look') ? ctx.fx.look : ctx.mood];
    if (look) S.master = Object.assign({}, S.master, look);
  }
  pushUndo(); bus.all();
  return { cuts: list.length, palette: ctx.palName, seed: ctx.seed, mood: ctx.mood };
}

/** その 時こくの うしろの いろ。色ふだが あれば その 色、なければ 下じき */
function backAt(t) {
  let hit = null;
  S.tracks.forEach(tr => {
    if (tr.kind === 'text' || tr.hidden) return;
    tr.clips.forEach(c => {
      if (c.kind === 'color' && t >= c.start && t < c.start + c.dur) hit = c;
    });
  });
  if (!hit) return S.bg || '#101010';
  const a = hit.color, b = hit.color2 || hit.color;
  return lum(a) < lum(b) ? a : b;
}

/* ---------- 画面ぜんたいの しあげ ---------- */
function looksFor() {
  return {
    glitch: { vignette: .25, grain: .08, rgb: .3, flash: .35, shake: .2, zoom: .25,
      slice: .45, block: .3, scan: .2, invert: .25, bloom: 0, lines: 0, br: 104, ct: 114, sa: 120 },
    calm: { vignette: .4, grain: .12, rgb: 0, flash: 0, shake: 0, zoom: .08,
      slice: 0, block: 0, scan: 0, invert: 0, bloom: .3, lines: 0, br: 102, ct: 98, sa: 92 },
    pop: { vignette: .18, grain: .05, rgb: .06, flash: .3, shake: .14, zoom: .22,
      slice: 0, block: .2, scan: 0, invert: 0, bloom: .25, lines: .5, br: 104, ct: 110, sa: 122 },
    graphic: { vignette: .12, grain: .04, rgb: 0, flash: .15, shake: .06, zoom: .1,
      slice: 0, block: 0, scan: .15, invert: 0, bloom: 0, lines: .25, br: 100, ct: 106, sa: 104 },
    editorial: { vignette: .3, grain: .3, rgb: 0, flash: 0, shake: 0, zoom: .06,
      slice: 0, block: 0, scan: .1, invert: 0, bloom: 0, lines: 0, br: 103, ct: 96, sa: 78 },
    emo: { vignette: .5, grain: .2, rgb: .04, flash: .1, shake: .04, zoom: .16,
      slice: 0, block: 0, scan: 0, invert: 0, bloom: .45, lines: 0, br: 101, ct: 100, sa: 88 }
  };
}

/* ---------- 組み立て ---------- */
export function autoCompose(opt = {}) {
  const cuts = cutsOf(opt.text || '');
  if (!cuts.length) { toast('歌詞を 入れて'); return 0; }

  const ctx = makeCtx(opt);
  const { r, mood, P, palName, has, fx, F, FT } = ctx;
  const seed = ctx.seed;
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

  // まえに つくった ぶんを どける
  S.tracks = S.tracks.filter(t2 => !/^おまかせ/.test(t2.name));
  const tText = newTrack('text', 'おまかせ 文字');
  const tBg = newTrack('video', 'おまかせ 背景');
  const tDeco = newTrack('video', 'おまかせ かざり');
  S.tracks.unshift(tDeco);
  S.tracks.unshift(tText);
  const aIdx = S.tracks.findIndex(t2 => t2.kind === 'audio');
  S.tracks.splice(aIdx < 0 ? S.tracks.length : aIdx, 0, tBg);

  /* --- カメラ（カットごと）と つなぎ --- */
  S.cams = [];
  const camAmt = has('camAmt') ? +fx.camAmt : .72;
  starts.forEach((at, i) => {
    const kind = has('cam') ? fx.cam
      : (chance(r, camAmt) ? pick(r, moodList(CAM_TAGS, mood, CAM_LIST)) : 'none');
    if (!kind || kind === 'none') return;
    S.cams.push({ at, dur: durOf(i), kind, seed: Math.floor(r() * 99999) + 1 });
  });

  S.trans = [];
  const trAmt = has('transAmt') ? +fx.transAmt : .5;
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap < .2) continue;                          // みじかすぎる ところは 入れない
    const kind = has('trans') ? fx.trans
      : (chance(r, trAmt) ? pick(r, moodList(TRANS_TAGS, mood, TRANS_OPTS)) : 'none');
    if (!kind || kind === 'none') continue;
    S.trans.push({
      at: starts[i],
      dur: Math.min(.5, Math.max(.1, gap * .22)),
      kind,
      seed: Math.floor(r() * 99999) + 1
    });
  }

  cuts.forEach((cut, i) => {
    const at = starts[i], dur = durOf(i);

    /* --- うしろの いろを さきに きめる（文字の 色を そこから 決める） --- */
    const [, , bgf] = FT('bg', BGS, () => pickM(r, BGS, mood));
    const [c1, c2, dir] = bgf(P);
    const bg = newClip('color', { name: 'いろ', start: at, dur });
    bg.color = c1; bg.color2 = c2; bg.grad = c1 !== c2; bg.gradDir = dir;
    bg.anim = pickM(r, CAMS, mood);
    if (bg.anim === 'kenburns' || bg.anim === 'zoom') bg.scale = 1.04;
    bg.fin = .05; bg.fout = .05;
    // うしろの もよう
    const pat = has('pat') ? fx.pat
      : (chance(r, .78) ? pick(r, moodList(PAT_TAGS, mood, PAT_LIST)) : 'none');
    if (pat && pat !== 'none') {
      bg.pat = pat;
      bg.patColor = chance(r, .5) ? P.accent : P.paper;
      bg.patColor2 = P.accent2;
      bg.patAmt = has('patAmt') ? +fx.patAmt : .26 + r() * .34;
      bg.patIdx = i;
      bg.patBig = (cut.str || '音').slice(0, 1);
    }
    tBg.clips.push(bg);

    // 上に のせる かざり（別の 段に）
    const deco = has('deco') ? fx.deco
      : (chance(r, .6) ? pick(r, moodList(DECO_TAGS, mood, DECO_LIST)) : 'none');
    if (deco && deco !== 'none') {
      const d = newClip('color', { name: 'かざり', start: at, dur });
      d.fillOn = false; d.color = '#000'; d.grad = false;
      d.deco = deco;
      d.decoAmt = has('decoAmt') ? +fx.decoAmt : .5 + r() * .4;
      d.patIdx = i;
      d.fin = .06; d.fout = .06;
      tDeco.clips.push(d);
    }

    // うしろの 明るさを 見て、読める 色を つくる
    const back = lum(c1) < lum(c2) ? c1 : c2;   // 暗い ほうに 合わせて おく

    /* --- 文字の ふだ --- */
    const c = newClip('text', { name: 'うた', start: at, dur });
    c.text.str = cut.str;
    const { txt } = dressText(c, ctx, back);
    const T = c.text;
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
  const LOOKS = looksFor();
  const look = LOOKS[has('look') ? fx.look : mood] || pick(r, Object.values(LOOKS));
  S.master = Object.assign({}, S.master, look);
  // 文字PV らしい カクッと した 動きを 既定に（フルに したい ときは しあげで）
  S.step = has('step') ? (+fx.step || 0) : 12;

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
