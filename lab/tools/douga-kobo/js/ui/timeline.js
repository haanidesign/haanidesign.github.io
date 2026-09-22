/* 下の タイムライン。ふだを つかむ・はしを のばす・段を うつる。 */
import {
  S, $, $$, clamp, r2, tc, uid, toast, buzz, snap as pushUndo,
  allClips, findClip, trackOf, duration, newTrack, freeSlot
} from '../state.js';
import { MEDIA, paintPoster, paintPeaks } from '../media.js';
import { bus } from '../bus.js';
import { beatOn, stepSec, beatSec, nearestStep, beatAt } from '../beat.js';

const el = {};
export function init() {
  el.lanes = $('#lanes');
  el.heads = $('#headsBody');
  el.scroll = $('#scroll');
  el.ruler = $('#ruler');
  el.rcv = $('#rulerCv');
  el.play = $('#playhead');
  el.snapline = $('#snapline');
  el.beat = $('#beatCv');
  el.loop = $('#loopband');
  el.scroll.addEventListener('scroll', () => {
    el.heads.style.transform = `translateY(${-el.scroll.scrollTop}px)`;
  });
  el.ruler.addEventListener('pointerdown', scrub);
  el.lanes.addEventListener('pointerdown', grab);
  el.lanes.addEventListener('dragover', e => e.preventDefault());
  el.lanes.addEventListener('drop', onDrop);
}

export const x2t = x => x / S.pps;
export const t2x = t => t * S.pps;
const width = () => Math.max(el.scroll.clientWidth + 160, t2x(duration()) + 360);

/* ---------- えがく ---------- */
export function drawAll() { drawHeads(); drawLanes(); drawRuler(); movePlayhead(); drawLoopBand(); }

function drawHeads() {
  el.heads.innerHTML = '';
  S.tracks.forEach((tr, i) => {
    const d = document.createElement('div');
    d.className = 'thead' + (S.selTrack === tr.id ? ' sel' : '');
    const ic = { video: '🎞', audio: '🎵', text: '🅰' }[tr.kind];
    d.innerHTML =
      `<span class="ic">${ic}</span><span class="nm"></span>` +
      `<button class="tb ${tr.hidden ? 'off' : ''}" data-a="hide" title="出す／かくす">${tr.hidden ? '🚫' : '👁'}</button>` +
      `<button class="tb ${tr.mute ? 'off' : ''}" data-a="mute" title="音を 出す／けす">${tr.mute ? '🔇' : '🔊'}</button>` +
      `<button class="tb ${tr.lock ? 'off' : ''}" data-a="lock" title="かぎを かける">${tr.lock ? '🔒' : '🔓'}</button>`;
    d.querySelector('.nm').textContent = tr.name;
    d.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a;
      S.selTrack = tr.id;
      if (a === 'hide') tr.hidden = !tr.hidden;
      else if (a === 'mute') tr.mute = !tr.mute;
      else if (a === 'lock') tr.lock = !tr.lock;
      if (a) { pushUndo(); bus.all(); } else bus.all();
    });
    el.heads.appendChild(d);
  });
}

function drawBeatGrid(w, h) {
  const cv = el.beat;
  if (!beatOn() || !S.beat.grid || S.pps * stepSec() < 6) { cv.width = 0; return; }
  cv.width = w; cv.height = Math.max(1, h);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  const st = stepSec(), off = S.beat.offset || 0;
  const perBar = (S.beat.per || 4) * (S.beat.div || 1);
  let n = Math.ceil((0 - off) / st);
  for (let t = off + n * st; t2x(t) < w; t += st, n++) {
    if (t < 0) continue;
    const x = Math.round(t2x(t)) + .5;
    const bar = perBar > 0 && ((n % perBar) + perBar) % perBar === 0;
    g.strokeStyle = bar ? 'rgba(30,28,20,.34)' : 'rgba(30,28,20,.13)';
    g.lineWidth = bar ? 2 : 1;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke();
  }
}

function drawLanes() {
  const w = width();
  el.lanes.style.width = w + 'px';
  $$('.lane', el.lanes).forEach(n => n.remove());
  S.tracks.forEach(tr => {
    const L = document.createElement('div');
    L.className = 'lane ' + tr.kind + (tr.hidden ? ' off' : '');
    L.dataset.tid = tr.id;
    L.style.width = w + 'px';
    tr.clips.forEach(c => L.appendChild(clipEl(c)));
    el.lanes.appendChild(L);
  });
  drawBeatGrid(w, S.tracks.length * 64);
}

function clipEl(c) {
  const d = document.createElement('div');
  d.className = 'clip ' + c.kind + (S.sel === c.id ? ' sel' : '');
  d.style.left = t2x(c.start) + 'px';
  d.style.width = Math.max(26, t2x(c.dur)) + 'px';
  d.dataset.cid = c.id;
  const label = c.kind === 'text' ? (c.text.str.split('\n')[0] || 'もじ')
    : c.kind === 'color' ? (c.grad ? 'グラデ' : 'いろ') : (c.name || '素材');
  d.innerHTML = `<div class="nm"></div><div class="body"></div>
    <div class="grip l"></div><div class="grip r"></div>`;
  d.querySelector('.nm').textContent =
    (c.kind === 'audio' ? '🎵 ' : c.kind === 'text' ? '🅰 ' : c.kind === 'color' ? '🎨 ' : '🎞 ') + label;
  const body = d.querySelector('.body');
  const pw = Math.max(26, Math.round(t2x(c.dur)));
  if (c.kind === 'color') {
    const sw = document.createElement('div');
    sw.style.cssText = `position:absolute;inset:0;background:${c.grad
      ? `linear-gradient(${(c.gradDir || 0) + 90}deg, ${c.color}, ${c.color2 || c.color})` : c.color};`;
    body.appendChild(sw);
  }
  const m = c.mid ? MEDIA.get(c.mid) : null;
  if (m && m.kind === 'audio') {
    const cv = document.createElement('canvas');
    cv.width = Math.min(900, pw); cv.height = 30; body.appendChild(cv);
    paintPeaks(cv, m, c.inp, S.pps);
  } else if (m) {
    const cv = document.createElement('canvas');
    cv.width = Math.min(900, pw); cv.height = 30; body.appendChild(cv);
    paintPoster(cv, m, true);
  }
  if (c.fin > 0) body.appendChild(fadeMark('left', t2x(c.fin)));
  if (c.fout > 0) body.appendChild(fadeMark('right', t2x(c.fout)));
  return d;
}
function fadeMark(side, w) {
  const f = document.createElement('div');
  f.className = 'fade'; f.style[side] = '0'; f.style.width = w + 'px'; f.style.opacity = .5;
  return f;
}

function drawRuler() {
  const w = width();
  el.rcv.width = w; el.rcv.style.width = w + 'px';
  const g = el.rcv.getContext('2d');
  g.fillStyle = '#F2F0BE'; g.fillRect(0, 0, w, 30);
  g.strokeStyle = '#1E1C14'; g.fillStyle = '#1E1C14';
  g.font = "12px 'DotGothic16', monospace"; g.textBaseline = 'top';
  if (beatOn() && S.beat.grid) { drawBarRuler(g, w); return; }
  const steps = [1 / S.fps, .1, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find(s => s * S.pps > 74) || 900;
  for (let t = 0; t2x(t) < w; t += step) {
    const x = Math.round(t2x(t)) + .5;
    g.globalAlpha = .9; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, 17); g.lineTo(x, 30); g.stroke();
    const lab = t >= 60 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : r2(t) + 's';
    g.fillText(lab, x + 4, 2);
    const sub = step / (step * S.pps > 160 ? 4 : 2);
    for (let k = 1; k * sub < step - 1e-9; k++) {
      const sx = Math.round(t2x(t + k * sub)) + .5;
      g.globalAlpha = .35; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(sx, 23); g.lineTo(sx, 30); g.stroke();
    }
  }
  g.globalAlpha = 1;
  drawBeatTicks(g, w);
}

/* 拍が きまって いる ときは 秒ではなく 小節で かぞえる */
function drawBarRuler(g, w) {
  const b = beatSec(), per = S.beat.per || 4, barSec = b * per, off = S.beat.offset || 0;
  const every = Math.max(1, Math.ceil(74 / (barSec * S.pps)));
  let n = Math.ceil((0 - off) / b);
  for (let t = off + n * b; t2x(t) < w; t += b, n++) {
    if (t < 0) continue;
    const x = Math.round(t2x(t)) + .5;
    const inBar = ((n % per) + per) % per;
    const bar = inBar === 0;
    g.globalAlpha = bar ? .95 : .45;
    g.lineWidth = bar ? 2 : 1.4;
    g.beginPath(); g.moveTo(x, bar ? 14 : 22); g.lineTo(x, 30); g.stroke();
    if (bar && (n / per) % every === 0) {
      g.globalAlpha = 1;
      g.fillText(String(Math.round(n / per) + 1), x + 4, 1);
    }
  }
  g.globalAlpha = 1;
}

/* 定規の 上に 拍の つぶを ならべる。小節の あたまは 大きい つぶ */
function drawBeatTicks(g, w) {
  if (!beatOn() || S.pps * beatSec() < 10) return;
  const b = beatSec(), off = S.beat.offset || 0;
  const per = S.beat.per || 4;
  let n = Math.max(0, Math.ceil((0 - off) / b));
  for (let t = off + n * b; t2x(t) < w; t += b, n++) {
    if (t < 0) continue;
    const x = Math.round(t2x(t)) + .5;
    const bar = ((n % per) + per) % per === 0;
    g.fillStyle = bar ? '#1E1C14' : '#B8B43F';
    if (bar) { g.fillRect(x - 1.5, 16, 3, 6); g.beginPath(); g.arc(x, 13, 3.4, 0, 7); g.fill(); }
    else { g.beginPath(); g.arc(x, 14, 2.2, 0, 7); g.fill(); }
  }
}

function drawLoopBand() {
  const L = S.loop;
  const n = el.loop;
  if (!n) return;
  if (!L || !L.on || L.b <= L.a) { n.style.display = 'none'; return; }
  n.style.display = 'block';
  n.style.left = t2x(L.a) + 'px';
  n.style.width = Math.max(2, t2x(L.b - L.a)) + 'px';
  n.style.height = el.lanes.scrollHeight + 'px';
}

export function movePlayhead() {
  el.play.style.left = t2x(S.time) + 'px';
  el.play.style.height = el.lanes.scrollHeight + 'px';
}
export function follow() {
  const x = t2x(S.time), left = el.scroll.scrollLeft, w = el.scroll.clientWidth;
  if (x < left + 40 || x > left + w - 70) el.scroll.scrollLeft = x - w * 0.35;
}
export function setZoom(pps, keepT) {
  const at = keepT !== undefined ? keepT : x2t(el.scroll.scrollLeft + el.scroll.clientWidth / 2);
  S.pps = clamp(pps, 3, 1200);
  drawLanes(); drawRuler(); movePlayhead();
  el.scroll.scrollLeft = t2x(at) - el.scroll.clientWidth / 2;
}
export function fit() {
  S.pps = clamp((el.scroll.clientWidth - 30) / duration(), 3, 1200);
  drawLanes(); drawRuler(); movePlayhead();
  el.scroll.scrollLeft = 0;
}
export const zoomIn = () => setZoom(S.pps * 1.6, S.time);
export const zoomOut = () => setZoom(S.pps / 1.6, S.time);

/* ---------- 時間じくを なぞる ---------- */
function scrub(e) {
  if (e.pointerType === 'touch' && e.isPrimary === false) return;
  const at = ev => {
    const r = el.scroll.getBoundingClientRect();
    bus.seek(x2t(Math.max(0, ev.clientX - r.left + el.scroll.scrollLeft)));
  };
  at(e);
  const mv = ev => at(ev);
  const up = () => {
    document.removeEventListener('pointermove', mv);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
  };
  document.addEventListener('pointermove', mv);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

/* ---------- ふだを つかむ ---------- */
let drag = null;
export const dragging = () => !!drag;
export function cancelDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  Object.assign(d.f.c, d.before);            // つかむ 前に もどす
  hideSnap(); bus.all();
}

function grab(e) {
  const node = e.target.closest ? e.target.closest('.clip') : null;
  if (!node) {
    const lane = e.target.closest && e.target.closest('.lane');
    if (lane) { S.selTrack = lane.dataset.tid; S.sel = null; bus.all(); }
    return;
  }
  const f = findClip(node.dataset.cid);
  if (!f) return;
  S.sel = f.c.id; S.selTrack = f.t.id;
  if (f.t.lock) { bus.all(); toast('この段は かぎが かかって いる'); return; }

  if (S.tool === 'cut') {
    const r = el.scroll.getBoundingClientRect();
    splitAt(f, x2t(e.clientX - r.left + el.scroll.scrollLeft));
    return;
  }
  const g = e.target.closest('.grip');
  const mode = g ? (g.classList.contains('l') ? 'l' : 'r') : 'move';
  drag = {
    f, mode, x0: e.clientX, y0: e.clientY,
    start0: f.c.start, dur0: f.c.dur, inp0: f.c.inp,
    before: JSON.parse(JSON.stringify(f.c)),
    moved: false, id: e.pointerId
  };
  try { node.setPointerCapture(e.pointerId); } catch (_) { }
  bus.all();
}

document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const c = drag.f.c, dt = x2t(e.clientX - drag.x0);
  if (!drag.moved && (Math.abs(e.clientX - drag.x0) > 4 || Math.abs(e.clientY - drag.y0) > 4)) {
    drag.moved = true; buzz();
  }
  if (!drag.moved) return;
  const m = c.mid ? MEDIA.get(c.mid) : null;
  const srcDur = m && m.kind !== 'image' ? m.dur : Infinity;

  if (drag.mode === 'move') {
    c.start = Math.max(0, snapTo(drag.start0 + dt, c.id));
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const lane = under && under.closest && under.closest('.lane');
    if (lane && lane.dataset.tid !== drag.f.t.id) {
      const nt = trackOf(lane.dataset.tid);
      const kind = c.kind === 'image' ? 'video' : c.kind;
      if (nt && nt.kind === kind) {
        drag.f.t.clips = drag.f.t.clips.filter(x => x !== c);
        nt.clips.push(c); drag.f.t = nt; S.selTrack = nt.id;
        drawLanes(); drawHeads();
      }
    }
  } else if (drag.mode === 'l') {
    let ns = snapTo(drag.start0 + dt, c.id);
    let d = drag.dur0 - (ns - drag.start0);
    let ni = drag.inp0 + (ns - drag.start0) * (c.speed || 1);
    if (ni < 0) { ns -= ni / (c.speed || 1); d += ni / (c.speed || 1); ni = 0; }
    if (d < 1 / S.fps) return;
    c.start = Math.max(0, ns); c.dur = d; c.inp = ni;
  } else {
    let d = snapTo(drag.start0 + drag.dur0 + dt, c.id) - c.start;
    d = Math.max(1 / S.fps, d);
    if (isFinite(srcDur)) d = Math.min(d, (srcDur - c.inp) / (c.speed || 1));
    c.dur = d;
  }
  drawLanes(); drawRuler(); movePlayhead();
  bus.stage(); bus.panel();
});
const endDrag = e => {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const moved = drag.moved;
  drag = null; hideSnap();
  if (moved) pushUndo();
  bus.all();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

function snapTo(t, self) {
  if (!S.snap) return t;
  const cand = [0, S.time];
  if (beatOn()) cand.push(nearestStep(t));
  allClips().forEach(({ c }) => { if (c.id !== self) cand.push(c.start, c.start + c.dur); });
  const tol = 12 / S.pps;
  let best = null, bd = tol;
  cand.forEach(v => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } });
  if (best === null) { hideSnap(); return t; }
  el.snapline.style.display = 'block';
  el.snapline.style.left = t2x(best) + 'px';
  el.snapline.style.height = el.lanes.scrollHeight + 'px';
  return best;
}
const hideSnap = () => { el.snapline.style.display = 'none'; };

/* ---------- 外から おとす ---------- */
function onDrop(e) {
  e.preventDefault();
  const mid = e.dataTransfer.getData('text/mid');
  const r = el.scroll.getBoundingClientRect();
  const t = Math.max(0, x2t(e.clientX - r.left + el.scroll.scrollLeft));
  const lane = e.target.closest && e.target.closest('.lane');
  bus.drop(mid, t, lane ? lane.dataset.tid : null, e.dataTransfer.files);
}

/* ---------- 切る ---------- */
export function splitAt(f, t) {
  const c = f.c;
  if (t <= c.start + 1 / S.fps || t >= c.start + c.dur - 1 / S.fps) { toast('ふだの 中で 切って'); return false; }
  const b = JSON.parse(JSON.stringify(c));
  b.id = uid();
  const off = t - c.start;
  b.start = t; b.dur = c.dur - off; b.inp = c.inp + off * (c.speed || 1); b.fin = 0;
  c.dur = off; c.fout = 0;
  f.t.clips.push(b);
  S.sel = b.id;
  pushUndo(); bus.all(); buzz(18);
  return true;
}
export function splitHere() {
  const hits = S.tracks.flatMap(t =>
    t.clips.filter(c => S.time > c.start && S.time < c.start + c.dur).map(c => ({ c, t })));
  const target = S.sel && hits.some(h => h.c.id === S.sel) ? hits.filter(h => h.c.id === S.sel) : hits;
  if (!target.length) { toast('ここに 切れる ふだが ない'); return; }
  target.forEach(f => splitAt(f, S.time));
  toast(target.length + 'まい 切った');
}
