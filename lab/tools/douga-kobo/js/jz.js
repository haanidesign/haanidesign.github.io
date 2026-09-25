/* JIZURA の エンジンを 動画工房から つかう ための つなぎ。

   ふだ（クリップ）に 歌詞と スタイルと たねを もたせて おいて、
   えがく ときに その場で 組み立てて 1コマ ぶんを 焼く。
   組み立てた もの（plan）は しまわない。たねが 同じなら いつも 同じ ものが 出る。 */
import { S, toast } from './state.js?v=69';

const JZ = () => (typeof window !== 'undefined' ? window.J : null);
export const ready = () => !!(JZ() && JZ().plan && JZ().Renderer);

/** スタイルの 一覧 [[key, 名まえ, 説明], …] */
export function styles() {
  const J = JZ();
  if (!J || !J.STYLES) return [];
  const order = J.STYLE_ORDER || Object.keys(J.STYLES);
  return order.map(k => [k, J.STYLES[k].name || k, J.STYLES[k].desc || '']);
}

/* 組み立てた ものを とっておく（同じ ふだを 何度も 組み直さない ため） */
const planCache = new Map();
let renderer = null;

/* off / noTrans は 組み立てには ひびかない（えがく ときだけ）ので たなの かぎに 入れない */
const keyOf = j => JSON.stringify([
  j.lyrics, j.style, j.seed, j.bpm, j.offset, j.W, j.H, j.fps,
  j.motion, j.glitch, j.chroma, j.decor, j.density, j.texture, j.koma, j.hud, j.bgSwitch,
  j.extra, j.wa, j.lineScale, j.snap, j.tail, j.lineTimes, j.beatOffset, j.ov
]);

/** ふだの 中身から 組み立てる */
export function planOf(j) {
  const J = JZ();
  if (!J) return null;
  const k = keyOf(j);
  const hit = planCache.get(k);
  if (hit) return hit;

  const pr = J.defaultProject();
  pr.lyrics = j.lyrics || '';
  pr.style = j.style || 'noir';
  pr.seed = j.seed | 0 || 1;
  pr.res = Math.max(360, Math.min(2160, j.H || 720));
  pr.fps = j.fps || 24;
  pr.aspect = aspectOf(j.W || 1280, j.H || 720);
  pr.extra = j.extra !== false;
  pr.overrides = j.ov || {};   // 行ごと・カットごとの さしかえ
  pr.wa = j.wa !== false;
  pr.fx = Object.assign({}, pr.fx, {
    motion: num(j.motion, .7), glitch: num(j.glitch, .55), chroma: num(j.chroma, .7),
    decor: num(j.decor, .5), density: num(j.density, .55), texture: num(j.texture, .6),
    koma: num(j.koma, 12), bgSwitch: num(j.bgSwitch, .35),
    hud: j.hud === undefined ? 'auto' : j.hud
  });
  pr.timing = Object.assign({}, pr.timing, {
    bpm: j.bpm || 0,
    offset: num(j.offset, .4),
    lineScale: num(j.lineScale, 1),
    snap: j.snap !== false,
    tail: num(j.tail, .9),
    lineTimes: j.lineTimes || {}
  });

  const audio = j.bpm > 0 ? { beats: J.beatGrid(j.bpm, j.beatOffset || 0, 900) } : null;
  let plan = null;
  try { plan = J.plan(pr, audio); } catch (e) { return null; }
  if (!plan) return null;
  planCache.set(k, plan);
  if (planCache.size > 8) planCache.delete(planCache.keys().next().value);
  // 書たいを 取りに 行く（あとから 効いて くる）
  try { J.ensureFonts(pr.lyrics, J.fontsOfPlan(plan)).then(() => { planCache.delete(k); }); } catch (e) { }
  return plan;
}
const num = (v, d) => (v === undefined || v === null || isNaN(+v) ? d : +v);

/* ---------- カット 1つだけ 中身を さしかえる ----------
   nocore-dtm/JIZURA の やり方に そろえた。
   組み立てた あとで 絵を すりかえるのでは なく、
   組み立てる ときに「この行の k番目の カットは これ」と わたす。
   えらばれ なかった ほうを 履歴に のこす 作りに なって いるので、
   1つ 変えても ほかの カットは 1ミリも 動かない。 */
export const EDIT_GROUPS = [
  ['layout', 'ならべ方'], ['enter', '登場'], ['hold', 'うごき'], ['exit', '退場'],
  ['treat', '文字の 加工'], ['bg', 'うしろの 絵'], ['cam', 'カメラ'], ['trans', 'つなぎ']
];

/** その グループで えらべる もの [[key, 名まえ], …] */
export function partList(group) {
  const J = JZ();
  if (!J || !J.registry) return [];
  const reg = J.registry(group) || {};
  return (J.order(group) || []).filter(k => reg[k]).map(k => [k, reg[k].name || k]);
}

/** この ふだが plan の 何番目の カットか（きざんだ ふだ だけ） */
export function cutIndexOf(plan, j) {
  if (!plan || !plan.cuts || !(j.cutDur > 0)) return -1;
  const want = j.off || 0;
  let best = -1, bd = .02;
  plan.cuts.forEach((c, i) => { const d = Math.abs(c.start - want); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** この ふだが 何行目の 何番目の カットか {line, k, cut} */
export function cutSlot(j) {
  const plan = planOf(j);
  const i = cutIndexOf(plan, j);
  if (i < 0) return null;
  const cut = plan.cuts[i];
  if (cut.line == null || cut.line < 0) return null;
  let k = 0;
  for (let n = 0; n < i; n++) if (plan.cuts[n].line === cut.line) k++;
  return { line: cut.line, k, cut, index: i };
}

/** さしかえの ふくろ（同じ たねの ふだで 1つを 分けあう） */
export const ovOf = j => (j.ov || (j.ov = {}));
export function techOf(j) {
  const sl = cutSlot(j);
  if (!sl) return {};
  const o = ovOf(j)[sl.line] || {};
  return (o.cutTech && (o.cutTech[sl.k] || o.cutTech[String(sl.k)])) || {};
}
/** その カットの 部品を 1つ さしかえる（'' で おまかせに もどす）*/
export function setTech(j, group, value) {
  const sl = cutSlot(j);
  if (!sl) return false;
  const ov = ovOf(j);
  const line = Object.assign({}, ov[sl.line] || {});
  const cutTech = Object.assign({}, line.cutTech || {});
  const slot = Object.assign({}, cutTech[sl.k] || cutTech[String(sl.k)] || {});
  delete cutTech[String(sl.k)];
  if (value === '' || value === null || value === undefined) delete slot[group];
  else slot[group] = value;
  if (Object.keys(slot).length) cutTech[sl.k] = slot; else delete cutTech[sl.k];
  if (Object.keys(cutTech).length) line.cutTech = cutTech; else delete line.cutTech;
  if (Object.keys(line).length) ov[sl.line] = line; else delete ov[sl.line];
  return true;
}
/** その 行を いくつの カットに 切るか（0 で おまかせ）*/
export function setCutCount(j, n) {
  const sl = cutSlot(j);
  if (!sl) return false;
  const ov = ovOf(j);
  const line = Object.assign({}, ov[sl.line] || {});
  if (n > 0) line.cuts = Math.min(12, n | 0); else delete line.cuts;
  if (Object.keys(line).length) ov[sl.line] = line; else delete ov[sl.line];
  return true;
}
export const cutCountOf = j => {
  const sl = cutSlot(j);
  return sl ? ((ovOf(j)[sl.line] || {}).cuts || 0) : 0;
};

export const planFor = j => planOf(j);

/** いま その カットが つかって いる 部品 {layout:'…', …} */
export function cutNow(j) {
  const sl = cutSlot(j);
  if (!sl) return null;
  const cut = sl.cut;
  const out = { text: cut.text || '', decor: (cut.decor || []).map(d => d.id).join('、') };
  EDIT_GROUPS.forEach(([g]) => { out[g] = cut[g] || null; });
  return out;
}

/** その スタイルが じっさいに つかって いる 部品だけ（雰囲気を こわさない ため）*/
export function partPool(j, group) {
  const base = planOf(j);
  if (!base || !base.cuts) return [];
  const seen = [];
  base.cuts.forEach(c => { const v = c[group]; if (v && !seen.includes(v)) seen.push(v); });
  return seen;
}


/** いちばん 近い 画面比を えらぶ */
function aspectOf(W, H) {
  const r = W / H;
  const list = [['21:9', 21 / 9], ['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1],
  ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16]];
  let best = '16:9', bd = Infinity;
  list.forEach(([k, v]) => { const d = Math.abs(v - r); if (d < bd) { bd = d; best = k; } });
  return best;
}

/** ふだの ながさ（組み立てて みないと わからない） */
export function durOf(j) {
  const p = planOf(j);
  return p ? (p.duration || 0) : 0;
}

/* JIZURA は「キャンバス ぜんたいが 自分の もの」と 思って
   読みかえしたり 合成モードを つかったり する。
   そのまま 本番の 画面に 描くと 下じきや ほかの 段を こわす ので、
   いったん 別の 紙に 描いて から 重ねる。 */
let off = null, offG = null;
function offCv(w, h) {
  if (!off) { off = document.createElement('canvas'); offG = off.getContext('2d'); }
  if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
  return off;
}

/** 1コマ えがく。g は すでに 画面の はしが 0,0 に なって いる こと */
export function draw(g, j, local, W, H, fast) {
  const J = JZ();
  const plan = planFor(j);
  if (!J || !plan) return false;
  if (!renderer) renderer = new J.Renderer();
  const cv = offCv(plan.W, plan.H);
  offG.setTransform(1, 0, 0, 1, 0, 0);
  offG.globalAlpha = 1; offG.filter = 'none';
  offG.globalCompositeOperation = 'source-over';
  offG.clearRect(0, 0, cv.width, cv.height);
  try {
    renderer.frame(offG, plan, Math.max(0, local + (j.off || 0)), {
      scale: 1, fast: !!fast, transparent: !!j.transparent, noTrans: !!j.noTrans,
      layer: j.layer || null
    });
  } catch (e) { return false; }
  g.save();
  try { g.drawImage(cv, 0, 0, W, H); } catch (e) { }
  g.restore();
  return true;
}

/** 新しい ふだの 中身 */
export function newJz(o = {}) {
  return Object.assign({
    lyrics: '', style: 'noir', seed: Math.floor(Math.random() * 99999) + 1,
    bpm: 0, offset: .4, beatOffset: 0,
    W: S.W, H: S.H, fps: S.fps,
    motion: .7, glitch: .55, chroma: .7, decor: .5, density: .55, texture: .6,
    koma: 12, hud: 'auto', bgSwitch: .35, extra: true, wa: true,
    lineScale: 1, snap: true, tail: .9, lineTimes: {}, transparent: false,
    off: 0, noTrans: false, layer: null, ov: {}
  }, o);
}
export const clearCache = () => planCache.clear();

/** 歌詞の 行（空行と メタ行を のぞいた もの）。タップで 合わせる とき に つかう */
export function linesOf(lyrics) {
  const J = JZ();
  if (!J || !J.parseLyrics) return [];
  try { return (J.parseLyrics(lyrics || '').lines || []).map(l => l.text); }
  catch (e) { return []; }
}
/** カットの きれめ [{start, end, text}] */
export function cutsOf(j) {
  const p = planOf(j);
  if (!p || !p.cuts) return [];
  return p.cuts.map(c => ({ start: c.start, end: c.end, text: c.text || '' }));
}

/** いま 何行目が 出て いるか（ふだの 中の 時こく から） */
export function lineAt(j, local) {
  const p = planOf(j);
  if (!p || !p.lines) return -1;
  let hit = -1;
  p.lines.forEach((l, i) => { if (local >= (l.start != null ? l.start : l.t)) hit = i; });
  return hit;
}
