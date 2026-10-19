/* シーン（ふだを まとめた 部品）と、くりかえしの うごき・エフェクトの 写し。 */
import { S, uid, toast, newClip, newTrack, selectedAll, snap as pushUndo } from './state.js?v=80';
import { beatSec } from './beat.js?v=80';
import { bus } from './bus.js?v=80';

/* ---------- まとめる ---------- */
export function groupScene() {
  const list = selectedAll().filter(({ c }) => c.kind !== 'audio');
  if (!list.length) { toast('まとめる ふだを えらんで'); return; }
  const t0 = Math.min(...list.map(x => x.c.start));
  const t1 = Math.max(...list.map(x => x.c.start + x.c.dur));
  const sid = uid();
  const n = Object.keys(S.scenes).length + 1;
  const tracks = [];
  S.tracks.forEach(tr => {
    const mine = list.filter(x => x.t === tr).map(x => x.c);
    if (!mine.length) return;
    const nt = newTrack(tr.kind, tr.name);
    mine.forEach(c => { c.start -= t0; nt.clips.push(c); });
    tr.clips = tr.clips.filter(c => !mine.includes(c));
    tracks.push(nt);
  });
  S.scenes[sid] = { id: sid, name: 'シーン ' + n, dur: t1 - t0, sp: -1, tracks, args: [] };
  const host = S.tracks.find(tr => list.some(x => x.t === tr));
  const c = newClip('scene', { sid, name: 'シーン ' + n, start: t0, dur: t1 - t0, args: {} });
  host.clips.push(c);
  S.sel = c.id; S.selMany = []; S.selTrack = host.id;
  pushUndo(); bus.all();
  toast('シーンに まとめた');
}

/* ---------- 中を ひらく／もどる ---------- */
export function openScene(c) {
  const sc = S.scenes[c.sid];
  if (!sc) return;
  if (S.edit.some(e => e.sid === c.sid)) { toast('この シーンは もう ひらいて いる'); return; }
  S.edit.push({ sid: c.sid, tracks: S.tracks, time: S.time, start: c.start });
  S.tracks = sc.tracks;
  S.time = Math.max(0, S.time - c.start);
  S.sel = null; S.selMany = [];
  pushUndo(); bus.all();
}
export function closeScene() {
  const e = S.edit.pop();
  if (!e) return;
  const sc = S.scenes[e.sid];
  if (sc) {
    sc.tracks = S.tracks;
    const end = Math.max(0, ...sc.tracks.flatMap(t => t.clips.map(c => c.start + c.dur)));
    if (end > 0) sc.dur = end;
    if (sc.sp > sc.dur) sc.sp = -1;
  }
  S.tracks = e.tracks;
  S.time = e.time;
  S.sel = null; S.selMany = [];
  pushUndo(); bus.all();
}
export const editing = () => S.edit.length ? S.scenes[S.edit[S.edit.length - 1].sid] : null;

/* ---------- のびる ところ ----------
   ふだを のばすと、のびる ところ（sp）で 時間を 止めて その ぶん 長く する。
   入りと 出の うごきは そのまま。ちぢめる ときと sp が ない ときは ぜんたいを ちぢめる。 */
export function sceneTime(c, sc, local) {
  const D = sc.dur, L = c.dur;
  if (!(D > 0) || !(L > 0)) return local;
  const ex = L - D;
  if (sc.sp == null || sc.sp < 0 || ex < 0) return local * D / L;
  if (local < sc.sp) return local;
  if (local < sc.sp + ex) return sc.sp;
  return local - ex;
}

/* ---------- 引数 ----------
   シーンの 中の ふだの 値を、置いた ふだ ごとに 変えられる ように する。 */
export const ARG_KEYS = [
  ['text.str', 'もじ', 'text'], ['text.color', 'もじの 色', 'color'], ['text.stroke', 'ふちの 色', 'color'],
  ['text.size', 'もじの 大きさ', 'number'], ['color', 'いろ', 'color'], ['color2', 'もう ひとつの 色', 'color'],
  ['opacity', 'すけ', 'number'], ['scale', '大きさ', 'number'], ['x', 'よこ', 'number'], ['y', 'たて', 'number'],
  ['rot', 'かたむき', 'number']
];
export const keysFor = c => ARG_KEYS.filter(([k]) =>
  k.startsWith('text.') ? c.kind === 'text' : (k === 'color' || k === 'color2') ? c.kind === 'color' : true);
export function getPath(o, k) { return k.split('.').reduce((a, p) => a == null ? a : a[p], o); }
export function setPath(o, k, v) {
  const ps = k.split('.'); const last = ps.pop();
  const t = ps.reduce((a, p) => a == null ? a : a[p], o);
  if (t != null) t[last] = v;
}
export function sceneClips(sc) { return sc.tracks.flatMap(t => t.clips); }
export function addArg(sc, cid, key) {
  const c = sceneClips(sc).find(x => x.id === cid);
  if (!c) return null;
  const def = ARG_KEYS.find(x => x[0] === key);
  const a = { id: uid(), name: (def ? def[1] : key), type: def ? def[2] : 'number', cid, key, def: getPath(c, key) };
  if (a.type === 'number') { a.min = -1e4; a.max = 1e4; }
  sc.args.push(a);
  return a;
}
/** 引数を 当てて えがき、えがいたら もとに もどす */
export function withArgs(c, sc, fn) {
  const saved = [];
  const cl = sceneClips(sc);
  (sc.args || []).forEach(a => {
    const v = c.args && c.args[a.id] !== undefined ? c.args[a.id] : a.def;
    const tgt = cl.find(x => x.id === a.cid);
    if (!tgt || v === undefined) return;
    let val = v;
    if (a.type === 'number') val = Math.min(a.max ?? 1e9, Math.max(a.min ?? -1e9, +v));
    saved.push([tgt, a.key, getPath(tgt, a.key)]);
    setPath(tgt, a.key, val);
  });
  try { fn(); } finally {
    for (let i = saved.length - 1; i >= 0; i--) setPath(saved[i][0], saved[i][1], saved[i][2]);
  }
}

/* ---------- くりかえしの うごき ----------
   rep = {id,on,prop,amt,per,unit:'s'|'beat',ph,mode}
   mode: sine なみ / ping 往復 / loop ループ / step 点めつ / hop はねる */
export const REP_PROPS = [['y', 'たて'], ['x', 'よこ'], ['scale', '大きさ'], ['rot', 'かたむき'], ['opacity', 'すけ']];
export const REP_MODES = [['sine', 'なみ'], ['ping', '往復'], ['loop', 'ループ'], ['step', '点めつ'], ['hop', 'はねる']];
export const newRep = () => ({ id: uid(), on: true, prop: 'y', amt: 20, per: 1, unit: 's', ph: 0, mode: 'sine' });
function wave(mode, u) {
  switch (mode) {
    case 'ping': return 1 - 4 * Math.abs(u - .5);
    case 'loop': return 2 * u - 1;
    case 'step': return u < .5 ? 1 : -1;
    case 'hop': return Math.abs(Math.sin(Math.PI * u));
    default: return Math.sin(2 * Math.PI * u);
  }
}
/** その 時こくの ずれ。{dx,dy,sc,rot,alpha} */
export function repPose(c, local) {
  const o = { dx: 0, dy: 0, sc: 1, rot: 0, alpha: 1 };
  if (!c.reps || !c.reps.length) return o;
  for (const r of c.reps) {
    if (!r.on) continue;
    const per = Math.max(.02, (+r.per || 1) * (r.unit === 'beat' ? beatSec() : 1));
    const x = local / per + (+r.ph || 0);
    const u = x - Math.floor(x);
    const w = wave(r.mode, u);
    const a = +r.amt || 0;
    if (r.prop === 'x') o.dx += a * w;
    else if (r.prop === 'y') o.dy += r.mode === 'hop' ? -a * w : a * w;
    else if (r.prop === 'scale') o.sc *= Math.max(0, 1 + a * w / 100);
    else if (r.prop === 'rot') o.rot += a * w;
    else if (r.prop === 'opacity') {
      const k = Math.min(1, Math.max(0, a / 100));
      o.alpha *= 1 - k * (r.mode === 'hop' ? 1 - w : (1 - w) / 2);
    }
  }
  return o;
}

/* ---------- 写し（コピー・はりつけ） ---------- */
let FXC = null, REPC = null;
export function copyFx(c) {
  FXC = JSON.parse(JSON.stringify({ fx: c.fx, fxOff: !!c.fxOff, blend: c.blend || 'source-over', mblur: c.mblur || 0 }));
  toast('エフェクトを 写した');
}
export function pasteFx(list) {
  if (!FXC) { toast('まだ 写して いない'); return; }
  list.forEach(c => { Object.assign(c, JSON.parse(JSON.stringify(FXC))); });
  pushUndo(); bus.all(); toast('はりつけた');
}
export function copyReps(c, from = 0) {
  REPC = JSON.parse(JSON.stringify((c.reps || []).slice(from)));
  toast(from ? 'ここから 下を 写した' : 'うごきを 写した');
}
export function pasteReps(list) {
  if (!REPC || !REPC.length) { toast('まだ 写して いない'); return; }
  list.forEach(c => {
    c.reps = (c.reps || []).concat(REPC.map(r => Object.assign({}, r, { id: uid() })));
  });
  pushUndo(); bus.all(); toast('はりつけた');
}
export const hasFx = () => !!FXC;
export const hasReps = () => !!(REPC && REPC.length);

export const BLENDS = [
  ['source-over', 'ふつう'], ['darken', '比較（暗）'], ['multiply', '乗算'], ['lighten', '比較（明）'],
  ['screen', 'スクリーン'], ['lighter', '加算'], ['overlay', 'オーバーレイ'], ['soft-light', 'ソフトライト'],
  ['hard-light', 'ハードライト'], ['difference', '差の絶対値'], ['exclusion', '除外']
];

