/* ふだを 足す・けす・段を いじる・作品を 保存する。 */
import {
  S, uid, r2, toast, snap as pushUndo, resetHist,
  newClip, newTrack, allClips, findClip, duration,
  freeSlot, laneFor, freeLane
} from './state.js?v=5';
import { MEDIA, hookAudio } from './media.js?v=5';
import { bus } from './bus.js?v=5';

export function addFromMedia(m, at = 0, track = null) {
  if (!m) return null;
  const t = track && track.kind === (m.kind === 'audio' ? 'audio' : 'video') ? track : laneFor(m.kind);
  const c = newClip(m.kind, {
    mid: m.id, name: m.name,
    dur: m.kind === 'image' ? 4 : Math.min(m.dur, 900), inp: 0
  });
  c.start = freeSlot(t, Math.max(0, at), c.dur);
  t.clips.push(c);
  S.sel = c.id; S.selTrack = t.id;
  hookAudio(m);
  pushUndo(); bus.all();
  return c;
}
export function addColor(at = S.time, col) {
  const c = newClip('color', { name: 'いろ', dur: 4 });
  if (col) c.color = col;
  const t = freeLane('video', [{ start: at, dur: c.dur }]);
  c.start = freeSlot(t, at, c.dur);
  t.clips.push(c);
  S.sel = c.id; S.selTrack = t.id;
  pushUndo(); bus.all();
  return c;
}
export function addText(at = S.time, str) {
  const c = newClip('text', { name: 'もじ', dur: 3 });
  if (str) c.text.str = str;
  const t = freeLane('text', [{ start: at, dur: c.dur }]);
  c.start = freeSlot(t, at, c.dur);
  t.clips.push(c);
  S.sel = c.id; S.selTrack = t.id;
  pushUndo(); bus.all();
  return c;
}
export function addLyrics(text, { from = 0, each = 2.5, gap = 0, size = 64, y = null } = {}) {
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) { toast('なにも 書いていない'); return 0; }
  let cur = from;
  const made = [];
  lines.forEach(line => {
    const m = line.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)\s+(.+)$/);
    let at = cur, str = line;
    if (m) { at = (+(m[1] || 0)) * 60 + (+m[2]); str = m[3]; }
    const c = newClip('text', { name: 'うた', start: at, dur: each });
    c.text.str = str; c.text.size = size;
    c.fin = .15; c.fout = .15; c.anim = 'fade';
    c.y = y === null ? S.H * 0.3 : y;
    made.push(c); cur = at + each + gap;
  });
  made.sort((a, b) => a.start - b.start).forEach((c, i, arr) => {
    const nx = arr[i + 1];
    if (nx && c.start + c.dur > nx.start) c.dur = Math.max(.2, nx.start - c.start - gap);
  });
  const t = freeLane('text', made);
  made.forEach(c => t.clips.push(c));
  S.sel = made[0].id; S.selTrack = t.id;
  pushUndo(); bus.all();
  return made.length;
}
export function delSel() {
  const f = S.sel && findClip(S.sel);
  if (!f) { toast('ふだを えらんでから'); return; }
  f.t.clips = f.t.clips.filter(c => c.id !== f.c.id);
  S.sel = null;
  pushUndo(); bus.all();
  toast('けした');
}
export function dupSel() {
  const f = S.sel && findClip(S.sel);
  if (!f) { toast('ふだを えらんでから'); return; }
  const b = JSON.parse(JSON.stringify(f.c));
  b.id = uid();
  b.start = freeSlot(f.t, f.c.start + f.c.dur, b.dur);
  f.t.clips.push(b);
  S.sel = b.id;
  pushUndo(); bus.all();
}
export function addTrack(kind) {
  const n = S.tracks.filter(t => t.kind === kind).length + 1;
  const t = newTrack(kind, ({ video: '映像', audio: '音', text: '文字' })[kind] + ' ' + n);
  S.tracks.unshift(t);
  S.selTrack = t.id;
  pushUndo(); bus.all();
}
export function moveTrack(id, dir) {
  const i = S.tracks.findIndex(t => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= S.tracks.length) return;
  const [t] = S.tracks.splice(i, 1);
  S.tracks.splice(j, 0, t);
  pushUndo(); bus.all();
}
export function delTrack(id) {
  if (S.tracks.length <= 1) { toast('さいごの 段は けせない'); return; }
  const t = S.tracks.find(x => x.id === id);
  if (!t) return;
  if (t.clips.length && !confirm('この段の ふだも いっしょに けします。いい？')) return;
  S.tracks = S.tracks.filter(x => x.id !== id);
  if (S.sel && !findClip(S.sel)) S.sel = null;
  pushUndo(); bus.all();
}
export function renameTrack(id, name) {
  const t = S.tracks.find(x => x.id === id);
  if (!t || !name) return;
  t.name = name;
  pushUndo(); bus.all();
}

/* ---- 作品の 出し入れ（組み立てだけ。素材は 入らない） ---- */
export function saveProject(name = 'douga') {
  const data = {
    app: 'douga-kobo', ver: 1,
    W: S.W, H: S.H, fps: S.fps, bg: S.bg,
    beat: S.beat, master: S.master,
    media: [...MEDIA.values()].map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: m.dur })),
    tracks: S.tracks
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = name + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('保存した（素材は 入っていない）', 2600);
}
export async function openProject(file) {
  try {
    const o = JSON.parse(await file.text());
    if (o.app !== 'douga-kobo' && o.app !== 'douga-hen') { toast('この台の ファイルじゃない'); return; }
    S.W = o.W; S.H = o.H; S.fps = o.fps; S.bg = o.bg || '#101010';
    if (o.beat) S.beat = Object.assign(S.beat, o.beat);
    if (o.master) S.master = Object.assign(S.master, o.master);
    S.tracks = o.tracks; S.sel = null; S.selTrack = null; S.time = 0;
    const byName = new Map([...MEDIA.values()].map(m => [m.name, m]));
    const remap = new Map();
    (o.media || []).forEach(sm => { const hit = byName.get(sm.name); if (hit) remap.set(sm.id, hit.id); });
    let miss = 0;
    allClips().forEach(({ c }) => {
      if (!c.mid) return;
      if (remap.has(c.mid)) c.mid = remap.get(c.mid);
      else if (!MEDIA.has(c.mid)) miss++;
    });
    resetHist();
    bus.size(); bus.all(); bus.fit();
    toast(miss ? `ひらいた（素材 ${miss}こ たりない → 同じ名前で とりこむ）` : 'ひらいた', 3000);
  } catch (e) { toast('ひらけなかった'); }
}
export function relink() {
  const byName = new Map([...MEDIA.values()].map(m => [m.name, m]));
  let n = 0;
  allClips().forEach(({ c }) => {
    if (c.mid && !MEDIA.has(c.mid) && byName.has(c.name)) { c.mid = byName.get(c.name).id; n++; }
  });
  if (n) { bus.all(); toast(n + 'こ つなぎ直した'); }
}
