/* JIZURA の エンジンを 動画工房から つかう ための つなぎ。

   ふだ（クリップ）に 歌詞と スタイルと たねを もたせて おいて、
   えがく ときに その場で 組み立てて 1コマ ぶんを 焼く。
   組み立てた もの（plan）は しまわない。たねが 同じなら いつも 同じ ものが 出る。 */
import { S, toast } from './state.js?v=53';

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

const keyOf = j => JSON.stringify([
  j.lyrics, j.style, j.seed, j.bpm, j.offset, j.W, j.H, j.fps,
  j.motion, j.glitch, j.chroma, j.decor, j.density, j.texture, j.koma, j.hud, j.bgSwitch,
  j.extra, j.wa
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
  pr.wa = j.wa !== false;
  pr.fx = Object.assign({}, pr.fx, {
    motion: num(j.motion, .7), glitch: num(j.glitch, .55), chroma: num(j.chroma, .7),
    decor: num(j.decor, .5), density: num(j.density, .55), texture: num(j.texture, .6),
    koma: num(j.koma, 12), bgSwitch: num(j.bgSwitch, .35),
    hud: j.hud === undefined ? 'auto' : j.hud
  });
  pr.timing = Object.assign({}, pr.timing, { bpm: j.bpm || 0, offset: num(j.offset, .4) });

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

/** 1コマ えがく。g は すでに 画面の はしが 0,0 に なって いる こと */
export function draw(g, j, local, W, H, fast) {
  const J = JZ();
  const plan = planOf(j);
  if (!J || !plan) return false;
  if (!renderer) renderer = new J.Renderer();
  g.save();
  try {
    // 作品の 大きさと plan の 大きさが ちがう ときは のばす
    g.scale(W / plan.W, H / plan.H);
    renderer.frame(g, plan, Math.max(0, local), { scale: 1, fast: !!fast });
  } catch (e) { g.restore(); return false; }
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
    koma: 12, hud: 'auto', bgSwitch: .35, extra: true, wa: true
  }, o);
}
export const clearCache = () => planCache.clear();
