/* 🎲 おまかせ組み立て（動画工房の おまかせを この 道具の 部品で）。

   歌詞と 曲の はやさから、1行ずつ くじを 引いて 組み立てる。
     1行ごと … 出かた・ずっと・消えかた・書たい・色・置き場所
     行の かわりめ … つなぎ
     ぜんたい … 動く背景・画面の 仕上げ
   同じ たね（seed）なら いつも 同じ ものが 出る。🎲 で 引きなおす。
   まえに おまかせで 作った ものは けしてから 作りなおす（ほかの レイヤーは さわらない）。 */
import { newMojiLayer } from './moji.js?v=368';
import { FX_IN, FX_LOOP, FX_OUT, fontList } from './text.js?v=368';
import { TRANS_LIST } from '../render/trans.js?v=368';
import { FX_LOOKS } from '../render/fx.js?v=368';
import { PRESETS as UG, newUgokuLayer } from '../engine/ugoku.js?v=368';

function rng(seed){
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const PALETTES = [
  ['#FFFEF7', '#1E1C14'], ['#E1DD60', '#1E1C14'], ['#1E1C14', '#FFFEF7'], ['#F2A0B8', '#1E1C14'],
  ['#9FD3C7', '#1E1C14'], ['#FFFFFF', '#3a2a6b'], ['#ff3bd4', '#ffffff'], ['#3bd9ff', '#120a2a']
];

export function omakase(project, lyrics, seed, opt = {}){
  const r = rng(seed);
  const lines = String(lyrics || '').split('\n').map(x => x.trim()).filter(Boolean);
  if(!lines.length) return 0;
  /* まえの おまかせを けす */
  project.layers = project.layers.filter(l => !l.omakase);
  project.trans = (project.trans || []).filter(x => !x.omakase);

  const bpm = project.beat && project.beat.bpm > 0 ? project.beat.bpm : 120;
  const beat = 60 / bpm;
  const t0 = opt.from || 0;
  const ins = FX_IN.filter(x => x[0] !== 'none').map(x => x[0]);
  const loops = FX_LOOP.map(x => x[0]);
  const outs = FX_OUT.filter(x => x[0] !== 'none').map(x => x[0]);
  const fonts = fontList().map(x => x[0]);
  const font = pick(r, fonts);                 // 書たいは 作品 ぜんたいで そろえる（ばらばらだと 読みにくい）
  const pal = pick(r, PALETTES);
  const ys = [0.5, 0.72, 0.3];
  let t = t0;
  const made = [];
  lines.forEach((str, i) => {
    const beats = [...str].length > 10 ? 8 : 4;
    const dur = beats * beat;
    const l = newMojiLayer(project, str);
    l.name = str.slice(0, 12);
    l.omakase = seed;
    const T = l.moji;
    T.font = font;
    T.color = pal[0]; T.stroke = pal[1];
    T.size = Math.round(Math.min(project.w, project.h) * ([...str].length > 10 ? 0.075 : 0.11));
    T.fxIn = pick(r, ins); T.fxLoop = r() < 0.5 ? 'none' : pick(r, loops); T.fxOut = pick(r, outs);
    T.order = pick(r, ['fwd', 'fwd', 'center', 'random', 'rev']);
    T.stagger = +(0.02 + r() * 0.06).toFixed(3);
    T.inDur = +(beat * (r() < 0.5 ? 1 : 2)).toFixed(3);
    T.outDur = +(beat * 0.75).toFixed(3);
    T.glowOn = r() < 0.3; T.glowColor = pal[0];
    T.vertical = project.h > project.w && r() < 0.2;
    l.y = project.h * pick(r, ys);
    l.span = { from: +t.toFixed(3), to: +(t + dur).toFixed(3) };
    project.layers.unshift(l);
    made.push(l);
    if(i > 0 && r() < 0.6){
      const k = pick(r, TRANS_LIST.filter(x => x[0] !== 'none' && x[0] !== 'fade'))[0];
      (project.trans = project.trans || []).push({ at: +t.toFixed(3), kind: k, dur: +(beat * 0.5).toFixed(3), seed: 1 + Math.floor(r() * 9999), omakase: seed });
    }
    t += dur;
  });
  project.trans && project.trans.sort((a, b) => a.at - b.at);
  if(opt.bg !== false){
    const name = pick(r, Object.keys(UG));
    const bg = newUgokuLayer(project, name);
    bg.name = 'おまかせ背景 ' + name;
    bg.omakase = seed;
    bg.ugoku.loop = +(beat * 8).toFixed(3);
    project.layers.push(bg);
  }
  if(opt.fx !== false){
    const looks = FX_LOOKS.filter(x => x[0] !== 'なし');
    project.fx = r() < 0.7 ? Object.assign({}, pick(r, looks)[1]) : {};
  }
  if(t > project.duration) project.duration = +t.toFixed(2);
  return made.length;
}
