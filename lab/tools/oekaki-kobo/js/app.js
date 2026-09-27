/* おえかき工房 — 画面の 動き。
   絵を かく 中みは engine.wasm（Efude の エンジン）。ここは 画面・ペン・パネル・保存。 */
import { loadEngine } from './engine.js';
import { store, askPersist } from './store.js';
import { icon } from './icons.js';
import { watchRanges } from './rslider.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let E = null; // engine

/* ================================================================ 状態 */
const DEFAULT_SETTINGS = {
  fingerDraw: false, gamma: 1, lefty: false, tapUndo: true, penButtonErase: true,
  fillAll: true, fillTol: 24, fillGrow: 1, lassoErase: false, pickLayer: false, panel: true,
  folds: {}, pmini: false, smini: false,
  shapeKind: 'line', shapeFill: false, shapePressure: 0.8,
  textSize: 60, textVertical: true, textBold: false, textFont: 0, textOutline: 0, textLast: '',
  timelapse: true, timelapseSec: 20, sym: null,
  selMode: 'lasso', selOp: 0, selTol: 24, selAll: true,
  vectorWhole: false, vwThick: true, vwPower: 5, vwRange: 40, veMode: 1, veRange: 14, curve: [0.25, 0.25, 0.75, 0.75], minPressure: 0, sizeBar: true,
};
const S = {
  tool: 'draw',
  drawBrush: 0,
  eraseBrush: 7,
  color: [30, 28, 20, 255],
  sub: [255, 254, 247, 255],
  recent: [],
  view: { x: 0, y: 0, s: 1, r: 0, flip: false },
  work: null, // {id, name, created}
  info: null,
  brushes: [],
  settings: { ...DEFAULT_SETTINGS },
  unsaved: false,
  tab: 'brush',
};

const stage = $('#stage');
const sheet = $('#sheet');
const docCv = $('#doc');
let docCtx = docCv.getContext('2d');
const over = $('#over');
const octx = over.getContext('2d');

/* ================================================================ 小物 */
let toastT = 0;
function toast(msg, ms = 1600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function setIcon(el, name, size) { el.innerHTML = icon(name, size); }
function iconText(el, name, text, size = 18) { el.innerHTML = icon(name, size) + '<span>' + text + '</span>'; }
const rgbCss = c => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;
const hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function debounce(fn, ms) { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.now = () => { clearTimeout(t); fn(); }; return d; }
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function safeName(s) { return (s || '無題').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60); }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ================================================================ 起動 */
async function boot() {
  buildStaticIcons();
  const msg = $('#bootMsg');
  try {
    E = await loadEngine('engine.wasm?v=6');
  } catch (err) {
    msg.textContent = err.message;
    return;
  }
  const saved = await store.get('settings').catch(() => null);
  if (saved) Object.assign(S.settings, saved);
  const prefs = await store.get('prefs').catch(() => null);
  if (prefs) {
    for (const k of ['drawBrush', 'eraseBrush', 'color', 'sub', 'recent']) if (prefs[k] != null) S[k] = prefs[k];
  }
  // 先に 紙を 1枚 つくって おく（ブラシの 読みこみに 必要）
  E.newDoc(2480, 3508, 350, true);
  const brushBytes = await store.get('brushes').catch(() => null);
  if (brushBytes) {
    try { E.brushesLoadSet(new Uint8Array(brushBytes), true); } catch (_) { /* こわれて いたら 標準 */ }
  }
  refreshBrushList();
  if (S.drawBrush >= S.brushes.length) S.drawBrush = 0;
  if (S.eraseBrush >= S.brushes.length || S.brushes[S.eraseBrush].kind !== 'eraser') {
    S.eraseBrush = Math.max(0, S.brushes.findIndex(b => b.kind === 'eraser'));
  }
  applySettings();
  setColor(S.color, false);
  msg.textContent = '作品を ひらいています…';
  const last = await store.get('last').catch(() => null);
  let opened = false;
  if (last) opened = await openWork(last, true);
  if (!opened) newWork({ w: 2480, h: 3508, dpi: 350, paper: true, name: '無題' });
  selectTool('draw');
  $('#boot').classList.add('gone');
  askPersist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function buildStaticIcons() {
  buildSizeRow();
  setupFolds();
  watchRanges();
  setIcon($('#bMenu'), 'menu');
  setIcon($('#bUndo'), 'undo');
  setIcon($('#bRedo'), 'redo');
  iconText($('#bExport'), 'download', '書き出す');
  setIcon($('#bSettings'), 'settings');
  setIcon($('#bPanel'), 'layers');
  setupCommands();
  const toolIcons = { draw: 'brush', erase: 'eraser', fill: 'fill', select: 'lassosel', shape: 'shapes', text: 'text', lasso: 'lasso', move: 'move', verase: 'veraser', vwidth: 'sliders', pick: 'picker' };
  for (const b of $$('.tool')) setIcon(b, toolIcons[b.dataset.tool], 26);
  setIcon($('#vFlip'), 'flip', 18);
  setIcon($('#vRot'), 'rotl', 18);
  setIcon($('#vFit'), 'fit', 18);
  setupLayerPanel();
  iconText($('#rAdd'), 'image', '資料を 読む', 16);
  setIcon($('#rPick'), 'picker', 18);
  setIcon($('#rDel'), 'trash', 18);
}

/* ================================================================ 作品 */
function workName() { return S.work ? S.work.name : '無題'; }

function afterDocLoaded() {
  S.info = E.info();
  if (docCv.width !== S.info.width || docCv.height !== S.info.height) {
    docCv.width = S.info.width;
    docCv.height = S.info.height;
    docCtx = docCv.getContext('2d');
  } else {
    docCtx.clearRect(0, 0, docCv.width, docCv.height);
  }
  $('#docName').textContent = workName();
  fitView();
  refreshLayers(true);
  refreshUndo();
  E.setColor(...S.color);
  selectBrushForTool();
  bulkRender();
  refreshSel();
  symState().cx = null;
  applySym();
}

function newWork({ w, h, dpi, paper, name }) {
  if (!E.newDoc(w, h, dpi, paper)) { toast('その 大きさは つくれません'); return false; }
  S.work = { id: uid(), name: name || '無題', created: Date.now() };
  afterDocLoaded();
  S.unsaved = true;
  saveSoon();
  store.set('last', S.work.id);
  return true;
}

async function openWork(id, quiet) {
  const meta = await store.getMeta(id).catch(() => null);
  const bytes = await store.load(id).catch(() => null);
  if (!meta || !bytes) { if (!quiet) toast('ひらけませんでした'); return false; }
  if (!E.loadQuick(new Uint8Array(bytes))) { if (!quiet) toast('ひらけませんでした'); return false; }
  S.work = { id: meta.id, name: meta.name, created: meta.created, frames: meta.frames || 0 };
  S.unsaved = false;
  afterDocLoaded();
  setSaveState('しまってあります');
  store.set('last', id);
  return true;
}

let saving = false;
async function saveNow() {
  if (!S.work || !E) return;
  if (E.stroking() || S.float) { saveSoon(); return; }
  if (saving) { saveSoon(); return; }
  if (!S.unsaved) return;
  saving = true;
  setSaveState('しまっています…');
  try {
    const bytes = E.saveQuick();
    const thumb = await makeThumb(256);
    const meta = {
      id: S.work.id, name: S.work.name, created: S.work.created, updated: Date.now(),
      w: S.info.width, h: S.info.height, thumb, frames: S.work.frames || 0,
    };
    S.unsaved = false;
    await store.save(meta, bytes.buffer);
    setSaveState('しまいました');
  } catch (err) {
    S.unsaved = true;
    setSaveState('しまえません');
    toast('しまえませんでした: ' + (err && err.message || err), 3000);
  }
  saving = false;
}
const saveSoon = debounce(saveNow, 2500);
function setSaveState(t) { $('#saveState').textContent = t; }

function makeThumb(max) {
  const k = Math.min(1, max / Math.max(docCv.width, docCv.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(docCv.width * k));
  c.height = Math.max(1, Math.round(docCv.height * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(docCv, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b), 'image/png'));
}

/* 何かが かわった あとに よぶ */
function changed(opts = {}) {
  S.unsaved = true;
  setSaveState('…');
  saveSoon();
  refreshUndo();
  if (opts.layers) refreshLayers(true);
  else thumbSoon();
  kick();
  recordFrame();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { commitFloat(); saveSettings.now(); saveNow(); } });
window.addEventListener('pagehide', () => { commitFloat(); saveNow(); });

/* ================================================================ 表示 */
function applyView() {
  const v = S.view;
  const c = Math.cos(v.r), s = Math.sin(v.r), f = v.flip ? -1 : 1;
  const a = v.s * c * f, b = v.s * s * f, cc = -v.s * s, d = v.s * c;
  sheet.style.transform = `matrix(${a},${b},${cc},${d},${v.x},${v.y})`;
  sheet.classList.toggle('px', v.s >= 2.5);
  docCv.style.setProperty('--frame', (3 / v.s) + 'px');
  $('#vZoom').textContent = Math.round(v.s * 100) + '%';
  $('#vFlip').classList.toggle('on', v.flip);
  const deg = Math.round(v.r * 180 / Math.PI);
  $('#vRot').classList.toggle('on', deg % 360 !== 0);
  if (E) E.setViewScale(v.s);
  drawOverlay();
  navSync();
}
/* 紙の 点 → 画面の 点 */
function toScreen(px, py) {
  const v = S.view;
  const c = Math.cos(v.r), s = Math.sin(v.r), f = v.flip ? -1 : 1;
  const X = px * f * v.s, Y = py * v.s;
  return [v.x + c * X - s * Y, v.y + s * X + c * Y];
}
/* 画面の 点（stage の 中）→ 紙の 点 */
function toDoc(sx, sy) {
  const v = S.view;
  const c = Math.cos(v.r), s = Math.sin(v.r), f = v.flip ? -1 : 1;
  const dx = sx - v.x, dy = sy - v.y;
  const X = (c * dx + s * dy) / v.s, Y = (-s * dx + c * dy) / v.s;
  return [X * f, Y];
}
function stageXY(e) {
  const r = stage.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
/* 紙の 点 (px,py) が 画面の (sx,sy) に くるように 位置を あわせる */
function pinDoc(px, py, sx, sy) {
  const [cx, cy] = toScreen(px, py);
  S.view.x += sx - cx;
  S.view.y += sy - cy;
}
function fitView() {
  if (!S.info) return;
  const r = stage.getBoundingClientRect();
  const pad = 36;
  const W = S.info.width, H = S.info.height;
  const s = Math.min((r.width - pad * 2) / W, (r.height - pad * 2 - 40) / H);
  S.view.s = clamp(s, 0.02, 32);
  S.view.r = 0;
  S.view.x = 0; S.view.y = 0;
  pinDoc(W / 2, H / 2, r.width / 2, (r.height - 40) / 2);
  applyView();
}
function resetRotation() {
  const r = stage.getBoundingClientRect();
  const [px, py] = toDoc(r.width / 2, r.height / 2);
  S.view.r = 0;
  pinDoc(px, py, r.width / 2, r.height / 2);
  applyView();
}
function toggleFlip() {
  const r = stage.getBoundingClientRect();
  const [px, py] = toDoc(r.width / 2, r.height / 2);
  S.view.flip = !S.view.flip;
  pinDoc(px, py, r.width / 2, r.height / 2);
  applyView();
  toast(S.view.flip ? '左右反転で 見ています' : '反転を もどしました');
}
function zoomAt(k, sx, sy) {
  const [px, py] = toDoc(sx, sy);
  S.view.s = clamp(S.view.s * k, 0.02, 32);
  pinDoc(px, py, sx, sy);
  applyView();
}
function resizeOverlay() {
  const r = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  over.width = Math.round(r.width * dpr);
  over.height = Math.round(r.height * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
}
new ResizeObserver(resizeOverlay).observe(stage);

/* ================================================================ 描きなおし */
let rafOn = false;
let bulk = false;
function kick() { if (!rafOn) { rafOn = true; requestAnimationFrame(frame); } }
function bulkRender() { bulk = true; kick(); }
function frame() {
  rafOn = false;
  if (!E) return;
  if (input.drawing) E.strokeFlush();
  const t0 = performance.now();
  // 描いている 間は ペンを 待たせない。手が はなれて いる ときは まとめて 描く。
  const budget = input.drawing ? 8 : (bulk ? 45 : 28);
  while (performance.now() - t0 < budget) {
    if (!drawDirty(input.drawing ? 32 : 96)) break;
  }
  if (E.dirtyCount() > 0) kick();
  else { bulk = false; navSoon(); }
  drawOverlay();
}
function drawDirty(max) {
  const buf = E.renderDirty(max);
  const base = buf.byteOffset;
  const dv = new DataView(buf.buffer, base, buf.byteLength);
  const n = dv.getUint32(0, true);
  let off = 4;
  for (let i = 0; i < n; i++) {
    const x = dv.getUint32(off, true), y = dv.getUint32(off + 4, true);
    const w = dv.getUint32(off + 8, true), h = dv.getUint32(off + 12, true);
    off += 16;
    const len = w * h * 4;
    const data = new Uint8ClampedArray(buf.buffer.slice(base + off, base + off + len));
    off += len;
    docCtx.putImageData(new ImageData(data, w, h), x, y);
  }
  return n;
}

/* 画面の 上の 印（ブラシの 円・囲いの 線） */
function drawOverlay() {
  const r = stage.getBoundingClientRect();
  octx.clearRect(0, 0, r.width, r.height);
  if (input.lasso && input.lasso.length > 1) {
    octx.save();
    octx.beginPath();
    input.lasso.forEach(([px, py], i) => { const [x, y] = toScreen(px, py); i ? octx.lineTo(x, y) : octx.moveTo(x, y); });
    octx.closePath();
    octx.fillStyle = input.lassoSel ? 'rgba(242,160,184,.18)' : S.settings.lassoErase ? 'rgba(242,160,184,.25)' : 'rgba(225,221,96,.3)';
    octx.fill();
    octx.lineWidth = 2;
    octx.strokeStyle = '#1E1C14';
    octx.setLineDash([6, 5]);
    octx.stroke();
    octx.restore();
  }
  if (S.float) {
    const q = floatQuad();
    octx.save();
    octx.beginPath();
    q.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y));
    octx.closePath();
    octx.lineWidth = 2; octx.strokeStyle = '#1E1C14'; octx.setLineDash([7, 5]); octx.stroke();
    octx.setLineDash([]);
    const [rx, ry] = floatRotHandle();
    const top = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2];
    octx.beginPath(); octx.moveTo(top[0], top[1]); octx.lineTo(rx, ry); octx.stroke();
    const knob = (x, y, round) => {
      octx.beginPath();
      if (round) octx.arc(x, y, 10, 0, Math.PI * 2); else octx.rect(x - 9, y - 9, 18, 18);
      octx.fillStyle = round ? '#F2A0B8' : '#E1DD60'; octx.fill();
      octx.lineWidth = 2.5; octx.strokeStyle = '#1E1C14'; octx.stroke();
    };
    q.forEach(([x, y]) => knob(x, y, false));
    knob(rx, ry, true);
    octx.restore();
  }
  if (input.cursor && (S.tool === 'vwidth' || S.tool === 'verase')) {
    const [x, y] = input.cursor;
    octx.beginPath(); octx.arc(x, y, S.tool === 'verase' ? S.settings.veRange : S.settings.vwRange, 0, Math.PI * 2);
    octx.setLineDash([5, 4]); octx.lineWidth = 2; octx.strokeStyle = '#1E1C14'; octx.stroke(); octx.setLineDash([]);
  }
  drawSymGuide();
  drawShapePreview();
  if (input.cursor && (S.tool === 'draw' || S.tool === 'erase')) {
    const b = S.brushes[currentBrushIndex()];
    const size = b ? b.size : 10;
    const rad = Math.max(2, size * S.view.s / 2);
    const [x, y] = input.cursor;
    octx.beginPath();
    octx.arc(x, y, rad, 0, Math.PI * 2);
    octx.lineWidth = 3;
    octx.strokeStyle = 'rgba(255,254,247,.9)';
    octx.stroke();
    octx.lineWidth = 1.2;
    octx.strokeStyle = '#1E1C14';
    octx.stroke();
  }
}

/* ================================================================ ペン・指 */
const input = {
  pointers: new Map(), // id -> {x,y,type}
  drawing: false, drawId: null, drawType: null, drawStart: 0, drawPoints: 0, tStart: 0,
  gesture: null,
  lasso: null, lassoId: null,
  pickId: null,
  pan: null,
  cursor: null,
  longT: 0,
  space: false,
  tempErase: false,
  prevTool: null,
  penUp: 0,
  floatDrag: null,
  lassoMove: false,
};

function touchCount() { let n = 0; for (const p of input.pointers.values()) if (p.type === 'touch') n++; return n; }

stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('pointerdown', onDown);
stage.addEventListener('pointermove', onMove);
stage.addEventListener('pointerup', onUp);
stage.addEventListener('pointercancel', onUp);
stage.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && !input.drawing) { input.cursor = null; drawOverlay(); } });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  const [sx, sy] = stageXY(e);
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), sx, sy);
  else if (e.altKey) { rotateAt(e.deltaY * 0.002, sx, sy); }
  else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); }
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

function rotateAt(da, sx, sy) {
  const [px, py] = toDoc(sx, sy);
  S.view.r += da;
  pinDoc(px, py, sx, sy);
  applyView();
}

function onDown(e) {
  if (e.target.closest('.float')) return;
  e.preventDefault();
  if (e.pointerType === 'touch') {
    // 手のひら: 大きな 面で ふれた もの、ペンで 描いている 間と 直後の もの は 見ない
    if (Math.max(e.width || 0, e.height || 0) > 64) return;
    if (input.drawing && input.drawType === 'pen') return;
    if (performance.now() - input.penUp < 250 && !input.gesture) return;
  }
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  const [x, y] = stageXY(e);
  input.pointers.set(e.pointerId, { x, y, type: e.pointerType, sx: x, sy: y });

  if (e.pointerType === 'pen') {
    if (input.gesture) endGesture(false);
    if (input.drawing && input.drawType !== 'pen') cancelDraw();
    if (input.drawing || input.lasso || input.pickId != null || input.floatDrag) return;
    startAction(e, x, y);
    return;
  }
  if (e.pointerType === 'mouse') {
    if (e.button === 1 || input.space) { input.pan = { id: e.pointerId, x, y }; return; }
    if (e.button === 2) { pickAt(x, y, true); return; }
    if (e.button !== 0) return;
    startAction(e, x, y);
    return;
  }
  // 指
  if (input.drawing && input.drawType === 'pen') return; // 手のひら
  if (input.lasso && input.lassoType === 'pen') return;
  if (input.floatDrag && input.floatDrag.type === 'pen') return;
  if (input.floatDrag) { input.floatDrag = null; renderToolOpts(); }
  const n = touchCount();
  if (input.drawing && input.drawType === 'touch') {
    // 2本目の 指: はじめたばかりの 線なら やめて 画面操作へ
    if (performance.now() - input.drawStart < 260) { cancelDraw(); startGesture(); }
    return;
  }
  if (input.lasso && input.lassoType === 'touch') {
    if (performance.now() - input.drawStart < 260) { input.lasso = null; drawOverlay(); startGesture(); }
    return;
  }
  if (input.gesture) { addToGesture(); return; }
  if (n === 1 && (S.settings.fingerDraw || (S.tool === 'move' && S.float))) {
    startAction(e, x, y);
    return;
  }
  startGesture();
  // 1本指の 長押しで スポイト
  clearTimeout(input.longT);
  if (n === 1) {
    input.longT = setTimeout(() => {
      const g = input.gesture;
      if (g && g.max === 1 && !g.moved) {
        const p = input.pointers.get(e.pointerId);
        if (p) { pickAt(p.x, p.y, true); g.picked = true; }
      }
    }, 480);
  }
}

function onMove(e) {
  const [x, y] = stageXY(e);
  const p = input.pointers.get(e.pointerId);
  if (p) { p.x = x; p.y = y; }
  if (e.pointerType !== 'touch' && (S.tool === 'draw' || S.tool === 'erase' || S.tool === 'vwidth' || S.tool === 'verase')) {
    input.cursor = [x, y];
    if (!input.drawing) drawOverlay();
  }
  if (input.pan && input.pan.id === e.pointerId) {
    S.view.x += x - input.pan.x; S.view.y += y - input.pan.y;
    input.pan.x = x; input.pan.y = y;
    applyView();
    return;
  }
  if (input.drawing && e.pointerId === input.drawId) {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (evs.length ? evs : [e])) pushPoint(ev);
    kick();
    return;
  }
  if (input.lasso && e.pointerId === input.lassoId) {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (evs.length ? evs : [e])) {
      const [sx, sy] = stageXY(ev);
      input.lasso.push(toDoc(sx, sy));
    }
    drawOverlay();
    return;
  }
  if (input.pickId === e.pointerId) { pickAt(x, y, false); return; }
  if (input.floatDrag && input.floatDrag.id === e.pointerId) { dragFloat(x, y); return; }
  if (input.vw && input.vw.id === e.pointerId) { widthAt(x, y); return; }
  if (input.symDrag && input.symDrag.id === e.pointerId) {
    const [dx, dy] = toDoc(x, y); const y2 = symState(); y2.cx = dx; y2.cy = dy; applySym(); return;
  }
  if (input.shape && input.shape.id === e.pointerId) {
    input.shape.b = toDoc(x, y); input.shape.square = e.shiftKey; drawOverlay(); return;
  }
  if (input.ve && input.ve.id === e.pointerId) {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (evs.length ? evs : [e])) { const [sx, sy] = stageXY(ev); eraseVecAt(sx, sy); }
    return;
  }
  if (input.gesture && p && p.type === 'touch') moveGesture();
}

function onUp(e) {
  const p = input.pointers.get(e.pointerId);
  input.pointers.delete(e.pointerId);
  if (input.pan && input.pan.id === e.pointerId) { input.pan = null; return; }
  if (input.drawing && e.pointerId === input.drawId) {
    if (e.pointerType === 'pen') input.penUp = performance.now();
    if (e.type === 'pointercancel' && e.pointerType === 'touch') cancelDraw();
    else endDraw();
    return;
  }
  if (e.pointerType === 'pen') input.penUp = performance.now();
  if (input.lasso && e.pointerId === input.lassoId) { endLasso(); return; }
  if (input.pickId === e.pointerId) { input.pickId = null; addRecent(S.color); return; }
  if (input.floatDrag && input.floatDrag.id === e.pointerId) { input.floatDrag = null; renderToolOpts(); return; }
  if (input.symDrag && input.symDrag.id === e.pointerId) { input.symDrag = null; saveSettings(); return; }
  if (input.shape && input.shape.id === e.pointerId) { const sh = input.shape; input.shape = null; drawOverlay(); shapeEnd(sh); return; }
  if (input.ve && input.ve.id === e.pointerId) {
    const any = input.ve.any; input.ve = null;
    if (any) changed(); else { E.undo(); refreshUndo(); }
    return;
  }
  if (input.vw && input.vw.id === e.pointerId) {
    const any = input.vw.any; input.vw = null;
    if (any) changed(); else { E.undo(); refreshUndo(); }
    return;
  }
  if (input.gesture && p && p.type === 'touch') {
    if (touchCount() === 0) endGesture(true);
    else rebaseGesture();
  }
}

/* ---------- 描く ---------- */
function currentBrushIndex() {
  if (S.tool === 'erase' || input.tempErase) return S.eraseBrush;
  return S.drawBrush;
}

function startAction(e, x, y) {
  const tool = S.tool;
  const eraserEnd = e.pointerType === 'pen' && S.settings.penButtonErase && ((e.buttons & 32) || (e.buttons & 2) || e.button === 5 || e.button === 2);
  if (tool === 'pick') { input.pickId = e.pointerId; pickAt(x, y, false); return; }
  const [dx, dy] = toDoc(x, y);
  if (symHandleHit(x, y) && !eraserEnd) { input.symDrag = { id: e.pointerId }; return; }
  if (tool === 'shape') {
    input.shape = { id: e.pointerId, kind: S.settings.shapeKind, a: [dx, dy], b: [dx, dy], square: false };
    return;
  }
  if (tool === 'text') { openTextDialog(dx, dy); return; }
  if ((tool === 'draw' || tool === 'erase') || eraserEnd) {
    input.tempErase = !!eraserEnd && tool !== 'erase';
    E.brushSelect(input.tempErase ? S.eraseBrush : currentBrushIndex());
    if (!E.strokeBegin(dx, dy)) { layerBlockedToast(); input.tempErase = false; return; }
    input.drawing = true;
    input.drawId = e.pointerId;
    input.drawType = e.pointerType;
    input.drawStart = performance.now();
    input.tStart = e.timeStamp;
    input.drawPoints = 0;
    if (tool === 'draw' && !input.tempErase) addRecent(S.color);
    pushPoint(e);
    kick();
    return;
  }
  if (tool === 'fill') {
    if (!layerPaintable()) { layerBlockedToast(); return; }
    const st = S.settings;
    const ok = E.fill(dx, dy, Math.round(st.fillTol * 2.55), st.fillAll, st.fillGrow);
    if (ok) { addRecent(S.color); changed(); }
    return;
  }
  if (tool === 'verase') {
    const l = S.info && S.info.layers[S.info.selected];
    if (!l || !l.vector) { toast('ベクターレイヤーを えらんで ください'); return; }
    if (l.locked) { layerBlockedToast(); return; }
    E.checkpoint();
    input.ve = { id: e.pointerId, any: false, last: null };
    eraseVecAt(x, y);
    return;
  }
  if (tool === 'vwidth') {
    const l = S.info && S.info.layers[S.info.selected];
    if (!l || !l.vector) { toast('ベクターレイヤーを えらんで ください'); return; }
    if (l.locked) { layerBlockedToast(); return; }
    E.checkpoint();
    input.vw = { id: e.pointerId, t: 0, any: false };
    widthAt(x, y);
    return;
  }
  if (tool === 'move') {
    if (S.float) { startFloatDrag(e, x, y); return; }
    if (!layerPaintable()) { layerBlockedToast(); return; }
    input.lassoMove = true;
    input.lasso = [[dx, dy]];
    input.lassoId = e.pointerId;
    input.lassoType = e.pointerType;
    input.drawStart = performance.now();
    drawOverlay();
    return;
  }
  if (tool === 'select') {
    const st = S.settings;
    if (st.selMode === 'wand') { E.selWand(dx, dy, Math.round(st.selTol * 2.55), st.selAll, st.selOp); refreshSel(); return; }
    input.lassoMove = false;
    input.lassoSel = true;
    input.lasso = [[dx, dy]];
    input.lassoId = e.pointerId;
    input.lassoType = e.pointerType;
    input.drawStart = performance.now();
    drawOverlay();
    return;
  }
  if (tool === 'lasso') {
    if (!layerPaintable()) { layerBlockedToast(); return; }
    input.lassoSel = false;
    input.lassoMove = false;
    input.lasso = [[dx, dy]];
    input.lassoId = e.pointerId;
    input.lassoType = e.pointerType;
    input.drawStart = performance.now();
    drawOverlay();
  }
}

function pushPoint(ev) {
  const [sx, sy] = stageXY(ev);
  const [dx, dy] = toDoc(sx, sy);
  let pr;
  if (ev.pointerType === 'pen') pr = penPressure(ev.pressure > 0 ? ev.pressure : (input.drawPoints ? 0.01 : 0.2));
  else pr = 1;
  const tx = (ev.tiltX || 0) / 90, ty = (ev.tiltY || 0) / 90;
  const tw = (ev.twist || 0) * Math.PI / 180;
  const t = Math.max(0, ev.timeStamp - input.tStart);
  E.strokePush(dx, dy, pr, tx, ty, tw, t);
  input.drawPoints++;
  if (ev.pointerType !== 'touch') input.cursor = [sx, sy];
}

/* 筆圧カーブ（アプリ全体）。Efude と 同じ 3次ベジェで 入力 → 出力。 */
function curveAt(c, x) {
  const [x1, y1, x2, y2] = c;
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) {
    const t = (lo + hi) / 2, u = 1 - t;
    const bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2, u = 1 - t;
  return clamp(3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t, 0, 1);
}
function penPressure(p) {
  const st = S.settings;
  const v = curveAt(st.curve, clamp(p, 0, 1));
  return st.minPressure + (1 - st.minPressure) * v;
}
/* ベクター消しゴム: 触れた ところ／交点まで／線ごと */
function eraseVecAt(x, y) {
  const st = S.settings;
  const [dx, dy] = toDoc(x, y);
  const r = st.veRange / S.view.s;
  const last = input.ve.last;
  // 速く 動かしても すきまが できない ように 間を うめる
  const steps = last ? Math.max(1, Math.ceil(Math.hypot(dx - last[0], dy - last[1]) / Math.max(1, r * 0.6))) : 1;
  for (let i = 1; i <= steps; i++) {
    const px = last ? last[0] + (dx - last[0]) * i / steps : dx, py = last ? last[1] + (dy - last[1]) * i / steps : dy;
    if (E.vectorErase(px, py, r, st.veMode)) input.ve.any = true;
  }
  input.ve.last = [dx, dy];
  input.cursor = [x, y];
  kick();
}
/* ベクターの 線幅: なぞった ところの 線を 少しずつ 太く／細く */
function widthAt(x, y) {
  const st = S.settings, now = performance.now();
  if (now - input.vw.t < 16) return;
  input.vw.t = now;
  const [dx, dy] = toDoc(x, y);
  const k = 1 + st.vwPower / 100;
  const r = st.vwRange / S.view.s;
  if (E.vectorWidth(dx, dy, r, st.vwThick ? k : 1 / k)) { input.vw.any = true; kick(); }
  input.cursor = [x, y];
}
function endDraw() {
  E.strokeEnd();
  input.drawing = false;
  input.drawId = null;
  if (input.tempErase) { input.tempErase = false; E.brushSelect(currentBrushIndex()); }
  changed();
}
function cancelDraw() {
  E.strokeCancel();
  input.drawing = false;
  input.drawId = null;
  input.tempErase = false;
  E.brushSelect(currentBrushIndex());
  kick();
}
function endLasso() {
  const pts = input.lasso;
  input.lasso = null;
  input.lassoId = null;
  drawOverlay();
  if (input.lassoSel) {
    input.lassoSel = false;
    if (pts && pts.length >= 3) E.selLasso(pts, S.settings.selOp);
    else if (S.settings.selOp === 0) E.selOp(1);
    refreshSel();
    return;
  }
  if (input.lassoMove) {
    input.lassoMove = false;
    // ほとんど 動かさなかったら レイヤー全体
    let len = 0;
    for (let i = 1; i < (pts || []).length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    beginFloat(len * S.view.s < 24 ? [] : pts);
    return;
  }
  if (pts && pts.length >= 3 && E.lasso(pts, S.settings.lassoErase)) { if (!S.settings.lassoErase) addRecent(S.color); changed(); }
}
function pickAt(x, y, fromGesture) {
  const [dx, dy] = toDoc(x, y);
  if (dx < 0 || dy < 0 || !S.info || dx >= S.info.width || dy >= S.info.height) return;
  const c = E.pick(dx, dy, S.settings.pickLayer);
  if (c[3] === 0) return;
  setColor([c[0], c[1], c[2], 255]);
  if (fromGesture) { toast('色を とりました'); addRecent(S.color); }
}
function layerPaintable() {
  const l = S.info && S.info.layers[S.info.selected];
  return l && !l.folder && !l.locked && !l.vector;
}
function layerBlockedToast() {
  const l = S.info && S.info.layers[S.info.selected];
  if (l && l.locked) toast('ロック中の レイヤーです');
  else if (l && l.folder) toast('フォルダには かけません');
  else if (l && l.vector) toast('ベクターレイヤーでは 描く・消す だけ です（ラスターに すると 使えます）');
  else toast('この レイヤーには かけません');
}

/* ---------- 指の 操作（動かす・拡大・回す・タップで 取り消し） ---------- */
function touchPts() { return [...input.pointers.values()].filter(p => p.type === 'touch'); }
function startGesture() {
  const pts = touchPts();
  input.gesture = {
    t0: performance.now(), max: pts.length, moved: false, travel: 0,
    base: pts.map(p => [p.x, p.y]), view0: { ...S.view },
  };
}
function addToGesture() {
  const g = input.gesture;
  g.max = Math.max(g.max, touchCount());
  clearTimeout(input.longT);
  rebaseGesture();
}
function rebaseGesture() {
  const g = input.gesture;
  if (!g) return;
  g.base = touchPts().map(p => [p.x, p.y]);
  g.view0 = { ...S.view };
}
function moveGesture() {
  const g = input.gesture;
  const pts = touchPts();
  if (!pts.length || !g.base.length) return;
  const q = pts.map(p => [p.x, p.y]);
  const moveLen = Math.hypot(q[0][0] - g.base[0][0], q[0][1] - g.base[0][1]);
  if (moveLen > 10) { g.moved = true; clearTimeout(input.longT); }
  if (g.picked) return;
  const v0 = g.view0;
  if (q.length >= 2 && g.base.length >= 2) {
    const [p1, p2] = g.base, [q1, q2] = q;
    const pd = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const qd = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1;
    let k = qd / pd;
    let th = Math.atan2(q2[1] - q1[1], q2[0] - q1[0]) - Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const newS = clamp(v0.s * k, 0.02, 32);
    k = newS / v0.s;
    // 回転は 0・90・180度の 近くで すいつく
    let r = v0.r + th;
    const step = Math.PI / 2;
    const near = Math.round(r / step) * step;
    if (Math.abs(r - near) < 0.07) { r = near; th = r - v0.r; }
    const c = Math.cos(th), s = Math.sin(th);
    const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
    const nx = (q1[0] + q2[0]) / 2, ny = (q1[1] + q2[1]) / 2;
    const tx = v0.x - mx, ty = v0.y - my;
    S.view.x = nx + k * (c * tx - s * ty);
    S.view.y = ny + k * (s * tx + c * ty);
    S.view.s = newS;
    S.view.r = r;
    if (Math.abs(k - 1) > 0.04 || Math.abs(th) > 0.05) g.moved = true;
    const mv = Math.hypot(nx - mx, ny - my);
    if (mv > 12) g.moved = true;
  } else {
    S.view.x = v0.x + q[0][0] - g.base[0][0];
    S.view.y = v0.y + q[0][1] - g.base[0][1];
  }
  applyView();
}
function endGesture(tapCheck) {
  const g = input.gesture;
  input.gesture = null;
  clearTimeout(input.longT);
  if (!g || !tapCheck || !S.settings.tapUndo || g.picked) return;
  const dt = performance.now() - g.t0;
  if (!g.moved && dt < 320) {
    if (g.max === 2) doUndo();
    else if (g.max === 3) doRedo();
  }
}

/* ================================================================ 囲って 動かす */
const floatCv = $('#floatCv');
function beginFloat(pts) {
  const r = E.floatBegin(pts);
  if (!r) { toast(pts.length ? '囲んだ ところに 絵が ありません' : 'この レイヤーは からっぽです'); return; }
  const px = E.floatRgba();
  floatCv.width = r.w; floatCv.height = r.h;
  floatCv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), r.w, r.h), 0, 0);
  floatCv.hidden = false;
  S.float = { x: r.x, y: r.y, w: r.w, h: r.h, tx: 0, ty: 0, s: 1, r: 0, fx: 1 };
  placeFloat();
  kick();
}
function floatMatrix() {
  const f = S.float;
  const c = Math.cos(f.r), s = Math.sin(f.r);
  const a = f.s * f.fx * c, b = f.s * f.fx * s, cc = -f.s * s, d = f.s * c;
  const Cx = f.x + f.w / 2 + f.tx, Cy = f.y + f.h / 2 + f.ty;
  return [a, b, cc, d, Cx - (a * f.w / 2 + cc * f.h / 2), Cy - (b * f.w / 2 + d * f.h / 2)];
}
function floatPoint(u, v) {
  const m = floatMatrix();
  return toScreen(m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]);
}
function floatQuad() { const f = S.float; return [floatPoint(0, 0), floatPoint(f.w, 0), floatPoint(f.w, f.h), floatPoint(0, f.h)]; }
function floatCenter() { const f = S.float; return floatPoint(f.w / 2, f.h / 2); }
function floatRotHandle() {
  const q = floatQuad();
  const top = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2];
  const c = floatCenter();
  const dx = top[0] - c[0], dy = top[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  return [top[0] + dx / len * 34, top[1] + dy / len * 34];
}
function placeFloat() {
  if (!S.float) return;
  const m = floatMatrix();
  floatCv.style.transform = `matrix(${m.join(',')})`;
  drawOverlay();
  if (S.tool === 'move' && !input.floatDrag) renderToolOpts();
}
function startFloatDrag(e, x, y) {
  const f = S.float;
  const c = floatCenter();
  const hit = (p) => Math.hypot(p[0] - x, p[1] - y) < 24;
  let mode = 'move';
  if (hit(floatRotHandle())) mode = 'rot';
  else if (floatQuad().some(hit)) mode = 'scale';
  input.floatDrag = {
    id: e.pointerId, type: e.pointerType, mode, x0: x, y0: y,
    f0: { ...f }, c, d0: Math.hypot(x - c[0], y - c[1]) || 1, a0: Math.atan2(y - c[1], x - c[0]),
    doc0: toDoc(x, y),
  };
}
function dragFloat(x, y) {
  const g = input.floatDrag, f = S.float;
  if (!f) return;
  if (g.mode === 'move') {
    const [dx, dy] = toDoc(x, y);
    f.tx = g.f0.tx + dx - g.doc0[0];
    f.ty = g.f0.ty + dy - g.doc0[1];
  } else if (g.mode === 'scale') {
    f.s = clamp(g.f0.s * Math.hypot(x - g.c[0], y - g.c[1]) / g.d0, 0.02, 20);
  } else {
    let r = g.f0.r + (Math.atan2(y - g.c[1], x - g.c[0]) - g.a0) * (S.view.flip ? -1 : 1);
    const step = Math.PI / 12;
    const near = Math.round(r / step) * step;
    if (Math.abs(r - near) < 0.03) r = near;
    f.r = r;
  }
  placeFloat();
  const el = $('#toolOpts .dot');
  if (el) el.textContent = `${Math.round(f.s * 100)}%　${Math.round(f.r * 180 / Math.PI)}°`;
}
function commitFloat() {
  if (!S.float) return;
  const m = floatMatrix();
  E.floatCommit(m);
  S.float = null;
  floatCv.hidden = true;
  floatCv.width = 1; floatCv.height = 1;
  input.floatDrag = null;
  if (E.selActive()) { E.selOp(1); refreshSel(); }
  changed();
  if (S.tool === 'move') renderToolOpts();
}
function cancelFloat() {
  if (!S.float) return;
  E.floatCancel();
  S.float = null;
  floatCv.hidden = true;
  input.floatDrag = null;
  kick();
  drawOverlay();
  refreshUndo();
  if (S.tool === 'move') renderToolOpts();
}

/* ================================================================ 取り消し */
function doUndo() {
  if (input.drawing) return;
  if (S.float) { cancelFloat(); toast('動かすのを やめました'); return; }
  if (E.undo()) { toast('取り消し'); changed({ layers: true }); }
}
function doRedo() {
  if (input.drawing || S.float) return;
  if (E.redo()) { toast('やり直し'); changed({ layers: true }); }
}
function refreshUndo() {
  S.info = E.info();
  $('#bUndo').disabled = S.info.undo === 0;
  $('#bRedo').disabled = S.info.redo === 0;
}
$('#bUndo').onclick = doUndo;
$('#bRedo').onclick = doRedo;

/* ================================================================ 道具 */
function selectTool(t) {
  if (input.drawing) return;
  if (t !== 'move') commitFloat();
  S.tool = t;
  for (const b of $$('.tool')) b.classList.toggle('on', b.dataset.tool === t);
  selectBrushForTool();
  renderToolOpts();
  if (S.tab === 'brush') renderBrushPanel();
  drawOverlay();
}
function selectBrushForTool() {
  E.brushSelect(currentBrushIndex());
  syncSliders();
}
for (const b of $$('.tool')) b.onclick = () => selectTool(b.dataset.tool);

function renderToolOpts() {
  const el = $('#toolOpts');
  const st = S.settings;
  el.innerHTML = '';
  if (S.tool === 'fill') {
    el.innerHTML = `
      <label><input type="checkbox" id="oAll" ${st.fillAll ? 'checked' : ''}>見えている 絵を 見る</label>
      <label>色の はば <input type="range" id="oTol" min="0" max="100" value="${st.fillTol}"><span class="dot" id="oTolV">${st.fillTol}</span></label>
      <label>はみ出し <input type="range" id="oGrow" min="0" max="8" value="${st.fillGrow}"><span class="dot" id="oGrowV">${st.fillGrow}</span></label>`;
    $('#oAll', el).onchange = e => { st.fillAll = e.target.checked; saveSettings(); };
    $('#oTol', el).oninput = e => { st.fillTol = +e.target.value; $('#oTolV').textContent = st.fillTol; saveSettings(); };
    $('#oGrow', el).oninput = e => { st.fillGrow = +e.target.value; $('#oGrowV').textContent = st.fillGrow; saveSettings(); };
  } else if (S.tool === 'lasso') {
    el.innerHTML = `<button class="btn-sm ${!st.lassoErase ? 'on' : ''}" id="oLF">囲って 塗る</button>
      <button class="btn-sm ${st.lassoErase ? 'on' : ''}" id="oLE">囲って 消す</button>`;
    $('#oLF', el).onclick = () => { st.lassoErase = false; saveSettings(); renderToolOpts(); };
    $('#oLE', el).onclick = () => { st.lassoErase = true; saveSettings(); renderToolOpts(); };
  } else if (S.tool === 'move') {
    if (S.float) {
      const f = S.float;
      el.innerHTML = `<button class="btn-sm btn-y" id="oFOk">${icon('ok', 16)}決める</button>
        <button class="btn-sm" id="oFNo">${icon('close', 16)}やめる</button>
        <button class="btn-sm" id="oFFlip">${icon('flip', 16)}左右反転</button>
        <button class="btn-sm" id="oFReset">元の 大きさ</button>
        <span class="dot">${Math.round(f.s * 100)}%　${Math.round(f.r * 180 / Math.PI)}°</span>`;
      $('#oFOk', el).onclick = () => commitFloat();
      $('#oFNo', el).onclick = () => cancelFloat();
      $('#oFFlip', el).onclick = () => { f.fx *= -1; placeFloat(); };
      $('#oFReset', el).onclick = () => { f.s = 1; f.r = 0; placeFloat(); };
    } else {
      el.innerHTML = `<span>動かしたい ところを 囲む（タップだけで レイヤー全体）</span>`;
    }
  } else if (S.tool === 'shape') {
    const k = st.shapeKind;
    el.innerHTML = `<button class="btn-sm ${k === 'line' ? 'on' : ''}" data-sk="line">直線</button>
      <button class="btn-sm ${k === 'rect' ? 'on' : ''}" data-sk="rect">四角</button>
      <button class="btn-sm ${k === 'ellipse' ? 'on' : ''}" data-sk="ellipse">円</button>
      <button class="btn-sm ${st.shapeFill ? 'on' : ''}" id="oSF">塗りつぶす</button>
      <label>線の 強さ <input type="range" id="oSP" min="0.1" max="1" step="0.05" value="${st.shapePressure}"></label>`;
    for (const b of $$('[data-sk]', el)) b.onclick = () => { st.shapeKind = b.dataset.sk; saveSettings(); renderToolOpts(); };
    $('#oSF', el).onclick = () => { st.shapeFill = !st.shapeFill; saveSettings(); renderToolOpts(); };
    $('#oSP', el).oninput = e => { st.shapePressure = +e.target.value; saveSettings(); };
  } else if (S.tool === 'text') {
    el.innerHTML = `<span>文字を 入れたい ところを タップ（たて書きは そこが 右上）</span>`;
  } else if (S.tool === 'select') {
    const m = st.selMode, o = st.selOp;
    el.innerHTML = `<button class="btn-sm ${m === 'lasso' ? 'on' : ''}" data-sm="lasso">囲う</button>
      <button class="btn-sm ${m === 'wand' ? 'on' : ''}" data-sm="wand">${icon('wand', 14)}自動選択</button>
      <button class="btn-sm ${o === 0 ? 'on' : ''}" data-so="0">新しく</button>
      <button class="btn-sm ${o === 1 ? 'on' : ''}" data-so="1">足す</button>
      <button class="btn-sm ${o === 2 ? 'on' : ''}" data-so="2">引く</button>
      ${m === 'wand' ? `<label>色の はば <input type="range" id="oST" min="0" max="100" value="${st.selTol}"></label>
      <label><input type="checkbox" id="oSA" ${st.selAll ? 'checked' : ''}>見えている 絵</label>` : ''}`;
    for (const b of $$('[data-sm]', el)) b.onclick = () => { st.selMode = b.dataset.sm; saveSettings(); renderToolOpts(); };
    for (const b of $$('[data-so]', el)) b.onclick = () => { st.selOp = +b.dataset.so; saveSettings(); renderToolOpts(); };
    if ($('#oST', el)) $('#oST', el).oninput = e => { st.selTol = +e.target.value; saveSettings(); };
    if ($('#oSA', el)) $('#oSA', el).onchange = e => { st.selAll = e.target.checked; saveSettings(); };
  } else if (S.tool === 'verase') {
    const m = st.veMode;
    el.innerHTML = `<button class="btn-sm ${m === 0 ? 'on' : ''}" data-vm="0">触れた ところ</button>
      <button class="btn-sm ${m === 1 ? 'on' : ''}" data-vm="1">交点まで</button>
      <button class="btn-sm ${m === 2 ? 'on' : ''}" data-vm="2">線ごと</button>
      <label>大きさ <input type="range" id="oVR" min="4" max="80" step="1" value="${st.veRange}"></label>`;
    for (const b of $$('[data-vm]', el)) b.onclick = () => { st.veMode = +b.dataset.vm; saveSettings(); renderToolOpts(); };
    $('#oVR', el).oninput = e => { st.veRange = +e.target.value; saveSettings(); drawOverlay(); };
  } else if (S.tool === 'vwidth') {
    el.innerHTML = `<button class="btn-sm ${st.vwThick ? 'on' : ''}" id="oWT">太く</button>
      <button class="btn-sm ${!st.vwThick ? 'on' : ''}" id="oWN">細く</button>
      <label>強さ <input type="range" id="oWP" min="1" max="20" step="1" value="${st.vwPower}"></label>
      <label>はんい <input type="range" id="oWR" min="10" max="150" step="1" value="${st.vwRange}"></label>
      <button class="btn-sm" id="oWAllT">線 ぜんぶ 太く</button><button class="btn-sm" id="oWAllN">線 ぜんぶ 細く</button>`;
    $('#oWT', el).onclick = () => { st.vwThick = true; saveSettings(); renderToolOpts(); };
    $('#oWN', el).onclick = () => { st.vwThick = false; saveSettings(); renderToolOpts(); };
    $('#oWP', el).oninput = e => { st.vwPower = +e.target.value; saveSettings(); };
    $('#oWR', el).oninput = e => { st.vwRange = +e.target.value; saveSettings(); drawOverlay(); };
    const all = f => { const l = S.info.layers[S.info.selected]; if (!l || !l.vector) { toast('ベクターレイヤーを えらんで ください'); return; } E.checkpoint(); if (E.vectorWidth(0, 0, 0, f)) changed(); else E.undo(); };
    $('#oWAllT', el).onclick = () => all(1.15);
    $('#oWAllN', el).onclick = () => all(1 / 1.15);
  } else if (S.tool === 'pick') {
    el.innerHTML = `<button class="btn-sm ${!st.pickLayer ? 'on' : ''}" id="oPA">見えている 色</button>
      <button class="btn-sm ${st.pickLayer ? 'on' : ''}" id="oPL">この レイヤーの 色</button>`;
    $('#oPA', el).onclick = () => { st.pickLayer = false; saveSettings(); renderToolOpts(); };
    $('#oPL', el).onclick = () => { st.pickLayer = true; saveSettings(); renderToolOpts(); };
  }
  el.classList.toggle('on', !!el.innerHTML);
}

/* ---------- 縦の つまみ（太さ・濃さ） ---------- */
const SIZE_MIN = 0.5, SIZE_MAX = 1000;
const sizeToT = s => Math.log(s / SIZE_MIN) / Math.log(SIZE_MAX / SIZE_MIN);
const tToSize = t => SIZE_MIN * Math.pow(SIZE_MAX / SIZE_MIN, t);
function vslider(el, onChange, onEnd) {
  let cur = 0;
  const set = (t) => {
    t = clamp(t, 0, 1);
    cur = t;
    const h = el.clientHeight - 6;
    el.querySelector('.vs-fill').style.height = (t * h) + 'px';
    el.querySelector('.vs-knob').style.top = (3 + (1 - t) * h) + 'px';
  };
  // 触った だけでは 動かさない。ドラッグした ぶん だけ 動く。
  let drag = null;
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, t: cur, moved: false };
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (!drag.moved && Math.abs(dy) < 4) return;
    drag.moved = true;
    const t = clamp(drag.t + dy / Math.max(60, el.clientHeight - 6), 0, 1);
    set(t); onChange(t);
  });
  const up = () => { if (drag) { const m = drag.moved; drag = null; if (m && onEnd) onEnd(); } };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return { set, label: txt => { el.querySelector('.vs-val').textContent = txt; } };
}
const sizeSl = vslider($('#sizeSl'), t => {
  const i = currentBrushIndex();
  const v = Math.round(tToSize(t) * 10) / 10;
  E.brushSet(i, 'size', v);
  S.brushes[i].size = v;
  sizeSl.label(fmtSize(v));
  showSizePreview();
}, () => { brushesChanged(i => i === currentBrushIndex()); hideSizePreview(); });
const opSl = vslider($('#opSl'), t => {
  const i = currentBrushIndex();
  const v = Math.round(clamp(t, 0.01, 1) * 100) / 100;
  E.brushSet(i, 'opacity', v);
  S.brushes[i].opacity = v;
  opSl.label(Math.round(v * 100) + '%');
}, () => brushesChanged(i => i === currentBrushIndex()));
function fmtSize(v) { return v < 10 ? v.toFixed(1) : String(Math.round(v)); }
function syncSliders() {
  const b = S.brushes[currentBrushIndex()];
  if (!b) return;
  sizeSl.set(sizeToT(b.size)); sizeSl.label(fmtSize(b.size));
  opSl.set(b.opacity); opSl.label(Math.round(b.opacity * 100) + '%');
  syncSizeRow();
}
function showSizePreview() {
  const r = stage.getBoundingClientRect();
  input.cursor = [r.width / 2, r.height / 2];
  input.sizePreview = true;
  drawOverlay();
}
function hideSizePreview() { if (input.sizePreview) { input.sizePreview = false; input.cursor = null; drawOverlay(); } }
new ResizeObserver(() => syncSliders()).observe($('#sizeSl'));

/* ================================================================ 色 */
const hsv = { h: 0, s: 0, v: 0 };
function rgb2hsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function setColor(c, fromPicker) {
  S.color = [c[0], c[1], c[2], c[3] ?? S.color[3] ?? 255];
  E.setColor(...S.color);
  $('#swMain').style.setProperty('--c', rgbCss(S.color));
  $('#swSub').style.setProperty('--c', rgbCss(S.sub));
  if (!fromPicker) Object.assign(hsv, rgb2hsv(S.color));
  if (S.tab === 'color') drawPicker();
  prefsSoon();
}
function addRecent(c) {
  const key = hex(c);
  S.recent = [c.slice(0, 3), ...S.recent.filter(x => hex(x) !== key)].slice(0, 16);
  if (S.tab === 'color') renderSwatches();
  prefsSoon();
}
$('#swMain').onclick = () => openTab('color');
$('#swSub').onclick = () => { const t = S.sub; S.sub = S.color; setColor(t); };

const svBox = $('#svBox'), hueBar = $('#hueBar');
function drawPicker() {
  const sx = svBox.getContext('2d'), W = svBox.width, H = svBox.height;
  sx.fillStyle = `hsl(${hsv.h},100%,50%)`;
  sx.fillRect(0, 0, W, H);
  let g = sx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  g = sx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
  sx.fillStyle = g; sx.fillRect(0, 0, W, H);
  const mx = hsv.s * W, my = (1 - hsv.v) * H;
  sx.beginPath(); sx.arc(mx, my, 9, 0, Math.PI * 2);
  sx.lineWidth = 4; sx.strokeStyle = '#fff'; sx.stroke();
  sx.lineWidth = 2; sx.strokeStyle = '#1E1C14'; sx.stroke();
  const hx = hueBar.getContext('2d'), HW = hueBar.width, HH = hueBar.height;
  const hg = hx.createLinearGradient(0, 0, HW, 0);
  for (let i = 0; i <= 6; i++) hg.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
  hx.fillStyle = hg; hx.fillRect(0, 0, HW, HH);
  const px = hsv.h / 360 * HW;
  hx.fillStyle = '#fff'; hx.fillRect(px - 4, 0, 8, HH);
  hx.strokeStyle = '#1E1C14'; hx.lineWidth = 2; hx.strokeRect(px - 4, 1, 8, HH - 2);
  $('#hexIn').value = hex(S.color);
  $('#alphaR').value = S.color[3];
}
function pickerDrag(el, fn) {
  let on = false;
  const f = e => { const r = el.getBoundingClientRect(); fn(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)); };
  el.addEventListener('pointerdown', e => { on = true; el.setPointerCapture(e.pointerId); f(e); });
  el.addEventListener('pointermove', e => on && f(e));
  el.addEventListener('pointerup', () => { if (on) { on = false; addRecent(S.color); } });
  el.addEventListener('pointercancel', () => { on = false; });
}
pickerDrag(svBox, (x, y) => { hsv.s = x; hsv.v = 1 - y; setColor([...hsv2rgb(hsv.h, hsv.s, hsv.v), S.color[3]], true); });
{
  // 色相の バーも 触った だけでは 動かさない
  let d = null;
  hueBar.addEventListener('pointerdown', e => { hueBar.setPointerCapture(e.pointerId); d = { x: e.clientX, h: hsv.h, moved: false }; });
  hueBar.addEventListener('pointermove', e => {
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    hsv.h = clamp(d.h + dx / hueBar.getBoundingClientRect().width * 360, 0, 359.9);
    setColor([...hsv2rgb(hsv.h, hsv.s, hsv.v), S.color[3]], true);
  });
  const end = () => { if (d && d.moved) addRecent(S.color); d = null; };
  hueBar.addEventListener('pointerup', end);
  hueBar.addEventListener('pointercancel', end);
}
$('#alphaR').oninput = e => setColor([S.color[0], S.color[1], S.color[2], +e.target.value], true);
$('#hexIn').onchange = e => { const c = parseHex(e.target.value); if (c) { setColor([...c, S.color[3]]); addRecent(S.color); } else drawPicker(); };
const PALETTE = ['#1E1C14', '#4A463A', '#8A8470', '#C9C4AE', '#FFFFFF', '#FFFEF7', '#E1DD60', '#F2A0B8',
  '#D9453A', '#F08A3C', '#F5D04A', '#7AC4A0', '#3F8F6B', '#5B8FD9', '#2D4B8C', '#8D62C4',
  '#FBD9C5', '#E8B08E', '#B97A57', '#7A4A33', '#F7E8D0', '#C6E3F2', '#E9D7F2', '#D4ECD9'];
function renderSwatches() {
  const mk = (list, el) => {
    el.innerHTML = '';
    for (const c of list) {
      const rgb = typeof c === 'string' ? parseHex(c) : c;
      const b = document.createElement('button');
      b.style.setProperty('--c', hex(rgb));
      b.title = hex(rgb);
      b.onclick = () => { setColor([...rgb, 255]); addRecent(rgb); };
      el.appendChild(b);
    }
  };
  mk(PALETTE, $('#palette'));
  mk(S.recent, $('#recent'));
}

/* ================================================================ パネル */
function openTab(t) {
  if (t === 'layer') t = narrow ? 'side' : 'brush';
  if (t === 'side') commitFloat();
  S.tab = t;
  if (!S.settings.panel) { S.settings.panel = true; applySettings(); }
  for (const b of $$('.tab')) b.classList.toggle('on', b.dataset.tab === t);
  for (const p of $$('.pane')) p.classList.toggle('on', p.id === 'pane-' + t);
  if (t === 'brush') renderBrushPanel();
  if (t === 'color') { drawPicker(); renderSwatches(); }
  if (t === 'side') { refreshLayers(true); drawNav(true); }
  if (t === 'ref') showRef();
}
for (const b of $$('.tab')) b.onclick = () => openTab(b.dataset.tab);
$('#bPanel').onclick = () => { S.settings.panel = !S.settings.panel; applySettings(); saveSettings(); };

/* ---------- ブラシ ---------- */
function refreshBrushList() {
  const list = E.brushList();
  S.brushes = list.brushes.map((b, i) => ({ ...b, ...E.brushGet(i) }));
  E.brushSelect(currentBrushIndex());
}
function brushFits(b) { return (S.tool === 'erase') === (b.kind === 'eraser'); }
const previewCache = new Map();
let previewQueue = [];
function renderBrushPanel() {
  const list = $('#brushList');
  list.innerHTML = '';
  const cur = currentBrushIndex();
  previewQueue = [];
  S.brushes.forEach((b, i) => {
    if (!brushFits(b)) return;
    const row = document.createElement('div');
    row.className = 'bitem' + (i === cur ? ' sel' : '');
    row.innerHTML = `<span class="bname">${escapeHtml(b.name)}</span><canvas width="240" height="40"></canvas>`;
    row.onclick = () => selectBrush(i);
    list.appendChild(row);
    previewQueue.push([i, row.querySelector('canvas')]);
  });
  runPreviews();
  renderBrushProps();
  const sel = list.querySelector('.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function runPreviews() {
  const job = previewQueue.shift();
  if (!job) return;
  const [i, cv] = job;
  const b = S.brushes[i];
  const key = i + ':' + JSON.stringify(b);
  let img = previewCache.get(key);
  if (!img) {
    const px = E.brushPreview(i, 240, 40, [30, 28, 20]);
    if (px) { img = new ImageData(new Uint8ClampedArray(px.buffer), 240, 40); previewCache.set(key, img); }
  }
  if (img) cv.getContext('2d').putImageData(img, 0, 0);
  setTimeout(runPreviews, 0);
}
function selectBrush(i) {
  if (S.tool === 'erase') S.eraseBrush = i; else S.drawBrush = i;
  if (S.tool !== 'draw' && S.tool !== 'erase') selectTool('draw');
  E.brushSelect(i);
  syncSliders();
  renderBrushPanel();
  prefsSoon();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const BRUSH_PROPS = [
  ['size', '太さ', 0.5, 1000, v => fmtSize(v), 'log'],
  ['opacity', '濃さ', 0.01, 1, v => Math.round(v * 100) + '%'],
  ['stabilization', '手ブレ補正', 0, 15, v => String(Math.round(v)), 'int'],
  ['hardness', '硬さ', 0, 1, v => Math.round(v * 100) + '%'],
  ['size_min', '細いときの 太さ', 0, 1, v => Math.round(v * 100) + '%'],
  ['taper_start', '入り', 0, 0.5, v => Math.round(v * 200) + '%'],
  ['taper_end', '抜き', 0, 0.5, v => Math.round(v * 200) + '%'],
  ['spacing', '間隔', 0.01, 1, v => Math.round(v * 100) + '%'],
  ['pressure_curve', '筆圧の かかり', 0.2, 3, v => v.toFixed(2)],
  ['grain', '紙の目', 0, 1, v => Math.round(v * 100) + '%'],
  ['blend', '混色', 0, 1, v => Math.round(v * 100) + '%', null, b => b.kind === 'watercolor' || b.kind === 'brush' || b.blend > 0],
  ['dilution', '水っぽさ', 0, 1, v => Math.round(v * 100) + '%', null, b => b.kind === 'watercolor' || b.blend > 0],
  ['persistence', '色の のび', 0, 1, v => Math.round(v * 100) + '%', null, b => b.kind === 'watercolor' || b.kind === 'smudge' || b.blend > 0],
];
function renderBrushProps() {
  const el = $('#brushProps');
  const i = currentBrushIndex();
  const b = S.brushes[i];
  if (!b) { el.innerHTML = ''; return; }
  let html = `<div class="title">${escapeHtml(b.name)}</div>`;
  for (const [key, label, min, max, fmt, mode, show] of BRUSH_PROPS) {
    if (show && !show(b)) continue;
    if ((key === 'taper_start' || key === 'taper_end') && b.taper_in_pixels) {
      html += propRow(key, label, 0, 512, b[key], v => Math.round(v) + 'px', 'int');
      continue;
    }
    html += propRow(key, label, min, max, b[key], fmt, mode);
  }
  html += `<div class="prow chk"><span>筆圧で 太さ</span><input type="checkbox" data-k="size_pressure" ${b.size_pressure ? 'checked' : ''}></div>`;
  html += `<div class="prow chk"><span>筆圧で 濃さ</span><input type="checkbox" data-k="opacity_pressure" ${b.opacity_pressure ? 'checked' : ''}></div>`;
  html += `<div class="btnrow">
    <button class="btn-sm" data-a="dup">${icon('copy', 16)}複製</button>
    <button class="btn-sm" data-a="ren">${icon('edit', 16)}名前</button>
    <button class="btn-sm" data-a="up">${icon('up', 16)}</button>
    <button class="btn-sm" data-a="down">${icon('down', 16)}</button>
    <button class="btn-sm danger" data-a="del">${icon('trash', 16)}</button></div>`;
  el.innerHTML = html;
  for (const r of $$('input[type=range]', el)) {
    const key = r.dataset.k, mode = r.dataset.m;
    const spec = BRUSH_PROPS.find(p => p[0] === key);
    const fmt = (key === 'taper_start' || key === 'taper_end') && b.taper_in_pixels ? (v => Math.round(v) + 'px') : spec[4];
    r.oninput = () => {
      let v = mode === 'log' ? tToSize(+r.value) : +r.value;
      if (mode === 'int') v = Math.round(v);
      if (key === 'size') v = Math.round(v * 10) / 10;
      E.brushSet(i, key, v);
      b[key] = v;
      r.parentElement.querySelector('.v').textContent = fmt(v);
      if (key === 'size' || key === 'opacity') syncSliders();
    };
    r.onchange = () => brushesChanged(j => j === i);
  }
  for (const c of $$('input[type=checkbox]', el)) {
    c.onchange = () => { E.brushSet(i, c.dataset.k, c.checked ? 1 : 0); b[c.dataset.k] = c.checked; brushesChanged(j => j === i); };
  }
  for (const btn of $$('button[data-a]', el)) btn.onclick = () => brushAction(btn.dataset.a, i);
}
function propRow(key, label, min, max, val, fmt, mode) {
  const log = mode === 'log';
  const v = log ? sizeToT(val) : val;
  const step = mode === 'int' ? 1 : (log ? 0.001 : (max - min) / 200);
  return `<div class="prow"><span>${label}</span><input type="range" data-k="${key}" data-m="${mode || ''}" min="${log ? 0 : min}" max="${log ? 1 : max}" step="${step}" value="${v}"><span class="v dot">${fmt(val)}</span></div>`;
}
async function brushAction(a, i) {
  if (a === 'dup') { E.brushDuplicate(i); refreshBrushList(); adjustBrushIndex(i + 1, 'insert'); }
  if (a === 'ren') {
    const name = await promptText('ブラシの 名前', S.brushes[i].name);
    if (!name) return;
    E.brushRename(i, name); refreshBrushList();
  }
  if (a === 'up' || a === 'down') {
    // 同じ 種類（描く／消す）の となりと 入れかえる
    const dir = a === 'up' ? -1 : 1;
    let j = i + dir;
    while (j >= 0 && j < S.brushes.length && !brushFits(S.brushes[j])) j += dir;
    if (j < 0 || j >= S.brushes.length) return;
    E.brushMove(i, j); refreshBrushList();
    if (S.tool === 'erase') S.eraseBrush = j; else S.drawBrush = j;
    fixOtherIndexAfterMove(i, j);
  }
  if (a === 'del') {
    const same = S.brushes.filter(brushFits).length;
    if (same <= 1) { toast('さいごの 1本は 消せません'); return; }
    if (!await confirmBox(`「${S.brushes[i].name}」を 消しますか？`)) return;
    E.brushRemove(i); refreshBrushList(); adjustBrushIndex(i, 'remove');
  }
  E.brushSelect(currentBrushIndex());
  syncSliders();
  previewCache.clear();
  renderBrushPanel();
  brushesChanged();
}
function adjustBrushIndex(at, how) {
  for (const k of ['drawBrush', 'eraseBrush']) {
    if (how === 'insert') { if (S[k] >= at) S[k]++; }
    else if (how === 'remove') { if (S[k] > at) S[k]--; else if (S[k] === at) S[k] = -1; }
  }
  if (how === 'insert') { if (S.tool === 'erase') S.eraseBrush = at; else S.drawBrush = at; }
  if (S.drawBrush < 0 || S.drawBrush >= S.brushes.length || S.brushes[S.drawBrush].kind === 'eraser') S.drawBrush = Math.max(0, S.brushes.findIndex(b => b.kind !== 'eraser'));
  if (S.eraseBrush < 0 || S.eraseBrush >= S.brushes.length || S.brushes[S.eraseBrush].kind !== 'eraser') S.eraseBrush = Math.max(0, S.brushes.findIndex(b => b.kind === 'eraser'));
}
function fixOtherIndexAfterMove(from, to) {
  const k = S.tool === 'erase' ? 'drawBrush' : 'eraseBrush';
  let v = S[k];
  if (v === to) v = from;
  S[k] = v;
}
const saveBrushes = debounce(async () => {
  try { const bytes = E.brushesSaveSet(); await store.set('brushes', bytes.buffer); } catch (_) {}
}, 1500);
function brushesChanged() {
  refreshBrushListValues();
  saveBrushes();
  prefsSoon();
  if (S.tab === 'brush') {
    // 見本だけ かきなおす
    const cur = currentBrushIndex();
    const rows = $$('.bitem');
    let k = 0;
    S.brushes.forEach((b, i) => {
      if (!brushFits(b)) return;
      const row = rows[k++];
      if (i === cur && row) { previewQueue.push([i, row.querySelector('canvas')]); runPreviews(); }
    });
  }
}
function refreshBrushListValues() { S.brushes = S.brushes.map((b, i) => ({ ...b, ...E.brushGet(i) })); }

/* ---------- レイヤー ---------- */
const BLEND_NAMES = ['通常', '乗算', 'スクリーン', 'オーバーレイ', '比較（暗）', '比較（明）', '覆い焼き', '焼き込み', 'ハードライト', 'ソフトライト', '差の絶対値', '除外', '加算', '減算'];
const TONE_SHAPES = ['丸', '四角', 'ひし形', '線', '十字', '砂目'];
function layerHidden(L, l) {
  // たたまれた フォルダーの 中は 出さない
  let p = l.parent;
  let guard = 0;
  while (p != null && guard++ < 64) {
    if (!L[p] || !L[p].expanded) return true;
    p = L[p].parent;
  }
  return false;
}
function refreshLayers() {
  S.info = E.info();
  const list = $('#layerList');
  const keepScroll = list.scrollTop;
  list.innerHTML = '';
  const L = S.info.layers;
  for (let i = L.length - 1; i >= 0; i--) {
    const l = L[i];
    if (layerHidden(L, l)) continue;
    const row = document.createElement('div');
    row.className = 'lrow' + (i === S.info.selected ? ' sel' : '') + (l.visible ? '' : ' hid') + (l.clipping ? ' clip' : '') + (l.folder ? ' folder' : '') + (l.expanded ? ' open' : '');
    row.dataset.i = i;
    const marks = [];
    if (l.locked) marks.push(icon('lock', 13));
    if (l.tone) marks.push(icon('tone', 13));
    if (l.sketch) marks.push(icon('pencil', 13));
    if (l.alpha_lock) marks.push(icon('alpha', 13));
    row.innerHTML = `<button class="leye" title="表示">${icon(l.visible ? 'eye' : 'eyeoff', 17)}</button>
      <span class="ledit">${i === S.info.selected ? icon('pencil', 13) : ''}</span>
      <span class="lind" style="width:${l.depth * 14 + (l.clipping ? 8 : 0)}px"></span>
      ${l.folder ? `<button class="lchev" title="ひらく／たたむ">${icon('aright', 15)}</button><span class="lfoldic">${icon('folder', 24)}</span>`
        : `<canvas class="lthumb" width="36" height="36"></canvas>`}
      ${l.vector ? `<span class="ltype" title="ベクター">${icon('pen', 15)}</span>` : ''}
      <div class="ltext"><div class="lmeta dot">${Math.round(l.opacity * 100)}% ${BLEND_NAMES[l.blend]}</div><div class="lname">${escapeHtml(l.name)}</div></div>
      <span class="lmarks">${marks.join('')}</span>
      <span class="lgrip" title="ドラッグで 並べかえ">${icon('menu', 16)}</span>`;
    row.querySelector('.leye').onclick = ev => {
      ev.stopPropagation();
      E.checkpoint();
      E.layerSet(i, 'visible', l.visible ? 0 : 1);
      changed({ layers: true });
    };
    const chev = row.querySelector('.lchev');
    if (chev) chev.onclick = ev => { ev.stopPropagation(); E.layerSet(i, 'expanded', l.expanded ? 0 : 1); refreshLayers(); };
    let lastTap = 0;
    row.onclick = async ev => {
      if (ev.target.closest('.lgrip')) return;
      const now = performance.now();
      if (now - lastTap < 350 && i === S.info.selected) {
        const n = await promptText('レイヤーの 名前', l.name);
        if (n) { E.layerRename(i, n); changed({ layers: true }); }
        return;
      }
      lastTap = now;
      if (i !== S.info.selected) { commitFloat(); E.layerSelect(i); refreshLayers(); }
    };
    setupGrip(row.querySelector('.lgrip'), i, row);
    list.appendChild(row);
    const cv = row.querySelector('canvas');
    if (cv) drawLayerThumb(i, cv);
  }
  list.scrollTop = keepScroll;
  syncLayerHead();
}
function syncLayerHead() {
  const l = S.info.layers[S.info.selected];
  if (!l) return;
  const bl = $('#lBlend');
  if (!bl.options.length) bl.innerHTML = BLEND_NAMES.map((n, k) => `<option value="${k}">${n}</option>`).join('');
  bl.value = l.blend;
  if (!layerOpDrag) { $('#lOp').value = Math.round(l.opacity * 100); $('#lOpV').textContent = Math.round(l.opacity * 100); }
  $('#lClip').classList.toggle('on', l.clipping);
  $('#lLock').classList.toggle('on', l.locked);
  $('#lTone').classList.toggle('on', !!l.tone);
  $('#lSketch').classList.toggle('on', !!l.sketch);
  $('#lAlpha').classList.toggle('on', !!l.alpha_lock);
  $('#lTone').disabled = l.folder;
}
/* ドラッグで 並べかえ（≡ を つかむ）。上の 3分の1 … 上に、下 … 下に、フォルダーの まん中 … 中へ */
function setupGrip(grip, index, row) {
  let drag = null;
  const clear = () => { for (const r of $$('.lrow')) r.classList.remove('drop-above', 'drop-below', 'drop-into'); };
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, moved: false, target: null, place: 0 };
  });
  grip.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.y) < 6) return;
    drag.moved = true;
    row.classList.add('dragging');
    clear();
    const list = $('#layerList');
    const lr = list.getBoundingClientRect();
    if (e.clientY < lr.top + 20) list.scrollTop -= 8;
    if (e.clientY > lr.bottom - 20) list.scrollTop += 8;
    const over = $$('.lrow').find(r => { const b = r.getBoundingClientRect(); return e.clientY >= b.top && e.clientY < b.bottom; });
    if (!over || over === row) { drag.target = null; return; }
    const b = over.getBoundingClientRect();
    const t = (e.clientY - b.top) / b.height;
    const isFolder = over.classList.contains('folder');
    drag.place = isFolder && t > 0.3 && t < 0.7 ? 2 : (t < 0.5 ? 0 : 1);
    drag.target = +over.dataset.i;
    over.classList.add(['drop-above', 'drop-below', 'drop-into'][drag.place]);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    row.classList.remove('dragging');
    clear();
    if (d.moved && d.target != null) {
      commitFloat();
      if (E.layerPlace(index, d.target, d.place)) changed({ layers: true });
    }
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}
let layerOpDrag = false;
function drawLayerThumb(i, cv) {
  if (!S.info) return;
  const W = S.info.width, H = S.info.height;
  const Z = cv.width;
  const k = Z / Math.max(W, H);
  const tw = Math.max(1, Math.round(W * k)), th = Math.max(1, Math.round(H * k));
  const px = E.layerThumb(i, tw, th);
  if (!px) return;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, Z, Z);
  x.putImageData(new ImageData(new Uint8ClampedArray(px.buffer), tw, th), Math.round((Z - tw) / 2), Math.round((Z - th) / 2));
}
const thumbSoon = debounce(() => {
  if (!S.info) return;
  const i = S.info.selected;
  const cv = $(`.lrow[data-i="${i}"] canvas`);
  if (cv) drawLayerThumb(i, cv);
}, 350);
function openLayerSettings() {
  const i = S.info.selected;
  const l = S.info.layers[i];
  if (!l) return;
  const t = l.tone;
  openModal(`<h2>${icon('settings')}レイヤーの 設定<span class="grow"></span><button class="ib sm" id="lsClose">${icon('close', 18)}</button></h2>
    <div class="prow"><span>名前</span><input id="lpName" value="${escapeHtml(l.name)}" style="grid-column:span 2"></div>
    ${l.vector ? `<div class="prow chk"><span>ベクター消しゴムで 線ごと 消す</span><input type="checkbox" id="lpWhole" ${S.settings.vectorWhole ? 'checked' : ''}></div>
      <div class="btnrow"><button class="btn-sm" id="lpThick">線を 太く</button><button class="btn-sm" id="lpThin">線を 細く</button><button class="btn-sm" id="lpRaster">ラスターに する</button></div>` : ''}
    ${t ? `<div class="title">トーン</div>
    <div class="prow"><span>線数</span><input type="range" id="lpLpi" min="10" max="150" step="1" value="${t.lpi}"><span class="v dot" id="lpLpiV">${Math.round(t.lpi)}線</span></div>
    <div class="prow"><span>角度</span><input type="range" id="lpAng" min="0" max="90" step="1" value="${t.angle}"><span class="v dot" id="lpAngV">${Math.round(t.angle)}°</span></div>
    <div class="prow"><span>形</span><select id="lpShape" style="grid-column:span 2">${TONE_SHAPES.map((n, k) => `<option value="${k}" ${k === t.shape ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
    <div class="btnrow"><button class="btn-sm" id="lpClear">${icon('clean', 16)}中を 消す</button></div>`);
  $('#lsClose').onclick = closeModal;
  $('#lpName').onchange = e => { E.layerRename(i, e.target.value); changed({ layers: true }); };
  if (t) {
    const live = (id, key, fmt) => {
      const r = $(id);
      r.onpointerdown = () => E.checkpoint();
      r.oninput = () => { E.layerSet(i, key, +r.value); $(id + 'V').textContent = fmt(+r.value); kick(); };
      r.onchange = () => changed({ layers: true });
    };
    live('#lpLpi', 'tone_lpi', v => v + '線');
    live('#lpAng', 'tone_angle', v => v + '°');
    $('#lpShape').onchange = e => { E.checkpoint(); E.layerSet(i, 'tone_shape', +e.target.value); changed({ layers: true }); };
  }
  if ($('#lpWhole')) $('#lpWhole').onchange = e => { S.settings.vectorWhole = e.target.checked; E.setVectorWhole(S.settings.vectorWhole); saveSettings(); };
  const vwAll = f => { E.checkpoint(); if (E.vectorWidth(0, 0, 0, f)) changed(); else E.undo(); };
  if ($('#lpThick')) $('#lpThick').onclick = () => vwAll(1.15);
  if ($('#lpThin')) $('#lpThin').onclick = () => vwAll(1 / 1.15);
  if ($('#lpRaster')) $('#lpRaster').onclick = () => { E.layerRasterize(i); changed({ layers: true }); closeModal(); };
  $('#lpClear').onclick = () => { if (l.locked || l.folder) { layerBlockedToast(); return; } E.layerClear(i); changed({ layers: true }); };
}
function setupLayerPanel() {
  const ic = (id, name) => setIcon($(id), name, 17);
  ic('#lClip', 'clip'); ic('#lLock', 'lock'); ic('#lTone', 'tone'); ic('#lSketch', 'pencil'); ic('#lAlpha', 'alpha');
  ic('#lAdd', 'layeradd'); ic('#lVec', 'pen'); ic('#lFolder', 'folder'); ic('#lImage', 'image');
  ic('#lDup', 'copy'); ic('#lMerge', 'merge'); ic('#lSet', 'settings'); ic('#lDel', 'trash');
  const cur = () => [S.info.selected, S.info.layers[S.info.selected]];
  const toggle = key => () => { const [i, l] = cur(); commitFloat(); E.checkpoint(); E.layerSet(i, key, (key === 'tone' ? !!l.tone : l[key]) ? 0 : 1); changed({ layers: true }); };
  $('#lClip').onclick = toggle('clipping');
  $('#lLock').onclick = toggle('locked');
  $('#lTone').onclick = toggle('tone');
  $('#lSketch').onclick = toggle('sketch');
  $('#lAlpha').onclick = () => { const [i, l] = cur(); E.layerSet(i, 'alpha_lock', l.alpha_lock ? 0 : 1); changed({ layers: true }); toast(l.alpha_lock ? '透明度保護を はずしました' : '透明度保護: 色の ある ところ だけ 塗れます'); };
  $('#lBlend').onchange = e => { const [i] = cur(); E.checkpoint(); E.layerSet(i, 'blend', +e.target.value); changed({ layers: true }); };
  const op = $('#lOp');
  op.addEventListener('pointerdown', () => { layerOpDrag = true; E.checkpoint(); });
  op.oninput = () => { const [i] = cur(); E.layerSet(i, 'opacity', op.value / 100); $('#lOpV').textContent = op.value; kick(); };
  op.onchange = () => { layerOpDrag = false; changed({ layers: true }); };
  $('#lAdd').onclick = () => { commitFloat(); E.layerAdd(); changed({ layers: true }); };
  $('#lVec').onclick = () => { commitFloat(); E.layerAddVector(); changed({ layers: true }); toast('ベクターレイヤーを 足しました'); };
  $('#lFolder').onclick = () => { commitFloat(); E.layerAddFolder(); changed({ layers: true }); };
  $('#lImage').onclick = () => pickFile('image/*', async f => { await importImageAsLayer(f); });
  $('#lDup').onclick = () => { commitFloat(); E.layerDuplicate(S.info.selected); changed({ layers: true }); };
  $('#lMerge').onclick = () => { commitFloat(); if (E.layerMergeDown(S.info.selected)) changed({ layers: true }); else toast('結合できません'); };
  $('#lSet').onclick = openLayerSettings;
  $('#lDel').onclick = async () => {
    const [i, l] = cur();
    if (!await confirmBox(`「${l.name}」を 削除しますか？`)) return;
    commitFloat(); E.layerDelete(i); changed({ layers: true });
  };
}

/* ================================================================ ファイル */
function pickFile(accept, fn) {
  const inp = $('#fileIn');
  inp.value = '';
  inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (f) fn(f); };
  inp.click();
}
async function decodeImage(file) {
  const bmp = await createImageBitmap(file);
  return bmp;
}
async function importImageAsLayer(file) {
  try {
    const bmp = await decodeImage(file);
    const W = S.info.width, H = S.info.height;
    const k = Math.min(1, W / bmp.width, H / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, w, h);
    const rgba = x.getImageData(0, 0, w, h).data;
    E.layerFromRgba(new Uint8Array(rgba.buffer), w, h, Math.round((W - w) / 2), Math.round((H - h) / 2), file.name.replace(/\.[^.]+$/, ''));
    changed({ layers: true });
    toast('画像を 入れました');
  } catch (err) { toast('画像を 読めませんでした'); }
}
async function openFile(file) {
  await saveNow();
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    toast('ひらいています…', 5000);
    await wait(30);
    if (ext === 'efude') {
      E.loadEfude(new Uint8Array(await file.arrayBuffer()));
    } else if (ext === 'psd') {
      E.loadPsd(new Uint8Array(await file.arrayBuffer()));
    } else if (ext === 'efudebrushes') {
      const n = E.brushesLoadSet(new Uint8Array(await file.arrayBuffer()), false);
      refreshBrushList(); previewCache.clear(); brushesChanged(); renderBrushPanel();
      toast(`ブラシを 足しました（ぜんぶで ${n}本）`);
      return;
    } else {
      const bmp = await decodeImage(file);
      if (!E.newDoc(bmp.width, bmp.height, 350, false)) throw new Error('大きすぎます');
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      E.layerFromRgba(new Uint8Array(x.getImageData(0, 0, c.width, c.height).data.buffer), c.width, c.height, 0, 0, name);
      E.layerDelete(0);
      E.historyClear();
    }
    S.work = { id: uid(), name, created: Date.now() };
    afterDocLoaded();
    S.unsaved = true; saveSoon();
    store.set('last', S.work.id);
    toast('ひらきました');
  } catch (err) {
    toast('ひらけませんでした: ' + (err.message || err), 3500);
  }
}

async function exportAs(kind) {
  commitFloat();
  const name = safeName(workName());
  try {
    toast('書き出しています…', 8000);
    await wait(30);
    let blob, file;
    if (kind === 'efude') { blob = new Blob([E.saveEfude()], { type: 'application/x-efude' }); file = name + '.efude'; }
    else if (kind === 'psd') { blob = new Blob([E.exportPsd()], { type: 'image/vnd.adobe.photoshop' }); file = name + '.psd'; }
    else {
      const transparent = kind === 'png-t';
      const px = E.exportRgba(transparent);
      const c = document.createElement('canvas'); c.width = S.info.width; c.height = S.info.height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), c.width, c.height), 0, 0);
      const type = kind === 'jpg' ? 'image/jpeg' : 'image/png';
      blob = await new Promise(r => c.toBlob(r, type, 0.92));
      file = name + (kind === 'jpg' ? '.jpg' : '.png');
    }
    closeModal();
    const f = new File([blob], file, { type: blob.type });
    if (S.shareNext && navigator.canShare && navigator.canShare({ files: [f] })) {
      S.shareNext = false;
      await navigator.share({ files: [f], title: workName() }).catch(() => {});
    } else {
      download(blob, file);
    }
    toast('書き出しました');
  } catch (err) {
    toast('書き出せませんでした: ' + (err.message || err), 3500);
  }
}

/* ================================================================ ダイアログ */
const modal = $('#modal'), card = $('#modalCard');
function openModal(html) { card.innerHTML = html; modal.hidden = false; return card; }
function closeModal() { modal.hidden = true; card.innerHTML = ''; }
modal.addEventListener('pointerdown', e => { if (e.target === modal) closeModal(); });
function confirmBox(text) {
  return new Promise(res => {
    openModal(`<h2>${escapeHtml(text)}</h2><div class="btnrow"><button class="btn-y" id="cOk">はい</button><button id="cNo">やめる</button></div>`);
    $('#cOk').onclick = () => { closeModal(); res(true); };
    $('#cNo').onclick = () => { closeModal(); res(false); };
  });
}
function promptText(title, value) {
  return new Promise(res => {
    openModal(`<h2>${escapeHtml(title)}</h2><input id="pIn" style="width:100%" value="${escapeHtml(value || '')}"><div class="btnrow"><button class="btn-y" id="pOk">きめる</button><button id="pNo">やめる</button></div>`);
    const inp = $('#pIn'); inp.focus(); inp.select();
    const ok = () => { const v = inp.value.trim(); closeModal(); res(v || null); };
    $('#pOk').onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    $('#pNo').onclick = () => { closeModal(); res(null); };
  });
}

/* ---------- 作品・メニュー ---------- */
async function openMenu() {
  commitFloat();
  await saveNow();
  const works = await store.list().catch(() => []);
  const urls = [];
  const html = `<h2>${icon('menu')}作品<span class="grow"></span><button class="ib sm" id="mClose">${icon('close', 18)}</button></h2>
    <div class="menu-grid">
      <button class="btn-y" id="mNew">${icon('newfile')}新しい 紙</button>
      <button id="mOpen">${icon('open')}ファイルを ひらく</button>
      <button id="mRot">${icon('rotr')}紙の 向き</button>
    </div>
    <div class="title">この タブレットに ある 作品</div>
    <div class="gallery" id="gal">${works.length ? '' : '<div class="small">まだ ありません</div>'}</div>
    <div class="title">ブラシ</div>
    <div class="menu-grid">
      <button id="mBrIn">${icon('open')}Efude の ブラシを 読む</button>
      <button id="mBrOut">${icon('download')}ブラシを 書き出す</button>
      <button id="mBrReset" class="danger">${icon('refresh', 18)}ブラシを 最初に もどす</button>
    </div>
    <p class="small" style="margin-top:.6rem">.efude / .psd / .png / .jpg を ひらけます。.efudebrushes は ブラシに 足します。</p>`;
  openModal(html);
  const gal = $('#gal');
  for (const w of works) {
    const url = w.thumb ? URL.createObjectURL(w.thumb) : '';
    if (url) urls.push(url);
    const d = document.createElement('div');
    d.className = 'work' + (S.work && w.id === S.work.id ? ' cur' : '');
    d.innerHTML = `<img src="${url}" alt=""><div class="wname">${escapeHtml(w.name)}</div>
      <div class="wsub dot">${w.w}×${w.h}　${new Date(w.updated).toLocaleDateString()}</div>
      <div class="wbtns"><button data-a="ren">名前</button><button data-a="dup">複製</button><button data-a="del" class="danger">消す</button></div>`;
    d.onclick = async ev => {
      const a = ev.target.closest('button') && ev.target.closest('button').dataset.a;
      if (a === 'ren') {
        const n = await promptText('作品の 名前', w.name);
        if (n) { w.name = n; await store.putMeta(w); if (S.work && S.work.id === w.id) { S.work.name = n; $('#docName').textContent = n; } }
        openMenu(); return;
      }
      if (a === 'dup') {
        const bytes = await store.load(w.id);
        const copy = { ...w, id: uid(), name: w.name + ' のコピー', created: Date.now(), updated: Date.now() };
        await store.save(copy, bytes); openMenu(); return;
      }
      if (a === 'del') {
        if (!await confirmBox(`「${w.name}」を 消しますか？ もとに もどせません`)) { openMenu(); return; }
        await store.remove(w.id);
        if (S.work && S.work.id === w.id) { S.unsaved = false; newWork({ w: 2480, h: 3508, dpi: 350, paper: true, name: '無題' }); }
        openMenu(); return;
      }
      closeModal();
      if (!S.work || w.id !== S.work.id) { toast('ひらいています…'); await wait(20); await openWork(w.id); }
    };
    gal.appendChild(d);
  }
  const cleanup = () => urls.forEach(u => URL.revokeObjectURL(u));
  $('#mClose').onclick = () => { cleanup(); closeModal(); };
  $('#mNew').onclick = () => { cleanup(); openNewDialog(); };
  $('#mOpen').onclick = () => { cleanup(); closeModal(); pickFile('.efude,.psd,.efudebrushes,image/*', openFile); };
  $('#mRot').onclick = () => { cleanup(); openRotateDialog(); };
  $('#mBrIn').onclick = () => { cleanup(); closeModal(); pickFile('.efudebrushes', openFile); };
  $('#mBrOut').onclick = () => {
    try { download(new Blob([E.brushesSaveSet()]), 'おえかき工房のブラシ.efudebrushes'); } catch (err) { toast('書き出せませんでした'); }
  };
  $('#mBrReset').onclick = async () => {
    cleanup();
    if (!await confirmBox('ブラシを 最初の 30本に もどしますか？ かえた 設定は きえます')) return;
    E.brushesReset(); await store.del('brushes'); refreshBrushList(); previewCache.clear();
    S.drawBrush = 0; S.eraseBrush = Math.max(0, S.brushes.findIndex(b => b.kind === 'eraser'));
    selectBrushForTool(); renderBrushPanel(); toast('もどしました');
  };
}
$('#bMenu').onclick = openMenu;
$('#docName').onclick = async () => {
  const n = await promptText('作品の 名前', workName());
  if (n && S.work) { S.work.name = n; $('#docName').textContent = n; S.unsaved = true; saveSoon(); }
};

const PRESETS = [
  ['イラスト A4', 2480, 3508, 350, 'A4 たて・350dpi'],
  ['イラスト 横', 3508, 2480, 350, 'A4 よこ・350dpi'],
  ['マンガ B5', 2508, 3541, 350, 'B5 原稿・350dpi'],
  ['マンガ B5 600dpi', 4299, 6071, 600, '印刷用・重め'],
  ['正方形', 2048, 2048, 350, 'SNS・アイコン'],
  ['横長 16:9', 1920, 1080, 144, '動画・サムネ'],
  ['縦長 9:16', 1080, 1920, 144, 'ショート・スマホ'],
];
function openNewDialog() {
  openModal(`<h2>${icon('newfile')}新しい 紙<span class="grow"></span><button class="ib sm" id="nClose">${icon('close', 18)}</button></h2>
    <div class="presets">${PRESETS.map((p, i) => `<button data-i="${i}"><span>${p[0]}</span><span class="psub dot">${p[1]}×${p[2]}　${p[4]}</span></button>`).join('')}</div>
    <div class="title">自分で きめる</div>
    <div class="frow">はば <input type="number" id="nW" value="2480" min="16" max="10000"> たかさ <input type="number" id="nH" value="3508" min="16" max="10000"> dpi <input type="number" id="nD" value="350" min="72" max="1200">
      <button class="btn-y" id="nMake">つくる</button></div>
    <div class="frow"><label><input type="checkbox" id="nPaper" checked> 白い 用紙を しく</label></div>
    <div class="frow">名前 <input id="nName" value="無題" style="flex:1"></div>`);
  const make = (w, h, dpi) => {
    closeModal();
    saveNow().then(() => newWork({ w, h, dpi, paper: $('#nPaper') ? $('#nPaper').checked : true, name: nameVal }));
  };
  let nameVal = '無題';
  $('#nName').oninput = e => { nameVal = e.target.value.trim() || '無題'; };
  for (const b of $$('.presets button')) b.onclick = () => { const p = PRESETS[+b.dataset.i]; const paper = $('#nPaper').checked; closeModal(); saveNow().then(() => newWork({ w: p[1], h: p[2], dpi: p[3], paper, name: nameVal })); };
  $('#nMake').onclick = () => {
    const w = clamp(+$('#nW').value | 0, 16, 10000), h = clamp(+$('#nH').value | 0, 16, 10000), d = clamp(+$('#nD').value | 0, 72, 1200);
    if (w * h > 40e6) { toast('大きすぎます（4000万画素まで）'); return; }
    make(w, h, d);
  };
  $('#nClose').onclick = closeModal;
}
function openRotateDialog() {
  openModal(`<h2>${icon('rotr')}紙の 向きを かえる<span class="grow"></span><button class="ib sm" id="rClose">${icon('close', 18)}</button></h2>
    <div class="menu-grid">
      <button data-m="0">${icon('rotr')}右に 90°</button>
      <button data-m="1">${icon('rotl')}左に 90°</button>
      <button data-m="2">${icon('flip')}左右 反転</button>
      <button data-m="3">${icon('flip')}上下 反転</button>
    </div>
    <p class="hint" style="margin-top:.7rem">絵そのものを 回します。90° 回すと、それまでの 取り消しは できなくなります。見た目だけ 回すなら 二本指で。</p>`);
  for (const b of $$('button[data-m]', card)) b.onclick = () => {
    if (E.transform(+b.dataset.m)) { closeModal(); afterDocLoaded(); changed({ layers: true }); }
  };
  $('#rClose').onclick = closeModal;
}
function openExport() {
  const canShare = !!(navigator.canShare && window.File);
  openModal(`<h2>${icon('download')}書き出す<span class="grow"></span><button class="ib sm" id="xClose">${icon('close', 18)}</button></h2>
    <div class="presets">
      <button data-k="efude"><span>.efude</span><span class="psub">PC の Efude で つづきを かく</span></button>
      <button data-k="psd"><span>.psd</span><span class="psub">レイヤーつき。クリスタ などで ひらける</span></button>
      <button data-k="png"><span>.png（白地）</span><span class="psub">重ねた 1枚の 絵</span></button>
      <button data-k="png-t"><span>.png（透明）</span><span class="psub">用紙を のぞいた 絵</span></button>
      <button data-k="jpg"><span>.jpg</span><span class="psub">かるい 1枚の 絵</span></button>
    </div>
    ${canShare ? `<div class="frow"><label><input type="checkbox" id="xShare"> ほかの アプリに 送る（共有）</label></div>` : ''}
    <p class="small">書き出した ファイルは「ダウンロード」に 入ります。</p>`);
  for (const b of $$('button[data-k]', card)) b.onclick = () => { S.shareNext = !!($('#xShare') && $('#xShare').checked); exportAs(b.dataset.k); };
  $('#xClose').onclick = closeModal;
}
$('#bExport').onclick = openExport;

async function openSettings() {
  const st = S.settings;
  let est = '';
  try { const e = await navigator.storage.estimate(); est = `${(e.usage / 1e6).toFixed(0)}MB 使用 ／ のこり 約${((e.quota - e.usage) / 1e9).toFixed(1)}GB`; } catch (_) {}
  openModal(`<h2>${icon('settings')}設定<span class="grow"></span><button class="ib sm" id="sClose">${icon('close', 18)}</button></h2>
    <div class="title">ペンの 筆圧</div>
    <div class="penset">
      <div><canvas id="curveCv" width="220" height="220"></canvas>
        <div class="btnrow"><button class="btn-sm" data-cp="soft">やわらかい</button><button class="btn-sm" data-cp="mid">ふつう</button><button class="btn-sm" data-cp="hard">かたい</button></div></div>
      <div style="flex:1;min-width:0">
        <p class="small">黄色い つまみを ドラッグして 筆圧の かかりかたを きめます（触った だけでは 動きません）。左上に 寄せると 軽い 力で 太く、右下に 寄せると しっかり 押した ときだけ 太く なります。</p>
        <div class="prow"><span>いちばん 弱い とき</span><input type="range" id="sMinP" min="0" max="0.6" step="0.01" value="${st.minPressure}"><span class="v dot" id="sMinPV">${Math.round(st.minPressure * 100)}%</span></div>
        <div class="small">ためし 書き（ペンで なぞる）</div>
        <canvas id="testCv" width="360" height="110"></canvas>
      </div>
    </div>
    <div class="prow chk"><span>指でも 描く（ふだんは ペンだけ）</span><input type="checkbox" id="sFinger" ${st.fingerDraw ? 'checked' : ''}></div>
    <div class="prow chk"><span>二本指タップで 取り消し・三本指で やり直し</span><input type="checkbox" id="sTap" ${st.tapUndo ? 'checked' : ''}></div>
    <div class="prow chk"><span>ペンの ボタン・おしりで 消しゴム</span><input type="checkbox" id="sPenBtn" ${st.penButtonErase ? 'checked' : ''}></div>
    <div class="prow chk"><span>左手モード（道具を 右に）</span><input type="checkbox" id="sLefty" ${st.lefty ? 'checked' : ''}></div>
    <div class="title">つかいかた</div>
    <div class="hint">ペン … 描く ／ 指1本 … 動かす（長押しで 色を とる）／ 指2本 … 拡大・回転、タップで 取り消し ／ 指3本タップ … やり直し<br>
      キーボード: Ctrl+Z 取り消し ／ Ctrl+Y やり直し ／ B 描く ／ E 消す ／ G 塗る ／ L 囲う ／ I スポイト ／ [ ] 太さ ／ スペース+ドラッグ 動かす</div>
    <div class="title">しまう 場所</div>
    <p class="small">作品は この タブレットの ブラウザの 中に 自動で しまいます（${est || '容量は 不明'}）。
      アプリや サイトの データを 消すと 作品も 消えるので、大事な 絵は ときどき .efude か .psd で 書き出して ください。</p>
    <div class="title">この アプリに ついて</div>
    <p class="small">絵を かく しくみ（ブラシ・手ブレ補正・水彩・トーン・.efude と PSD の 読み書き）は、
      オープンソースの お絵かきアプリ <a href="https://github.com/852wa/Efude" target="_blank" rel="noopener">Efude</a> の エンジンを
      WebAssembly に して そのまま 使っています（MIT / Apache-2.0）。標準の ブラシセットは Efude に 入っている もの（MPL-2.0）です。
      Efude の 作者とは 関係の ない、個人の ための 画面です。<a href="NOTICE.txt" target="_blank">ライセンス</a> ／ アイコン: Hugeicons（MIT）</p>`);
  setupCurveEditor();
  $('#sMinP').oninput = e => { st.minPressure = +e.target.value; $('#sMinPV').textContent = Math.round(st.minPressure * 100) + '%'; drawCurve(); saveSettings(); };
  $('#sFinger').onchange = e => { st.fingerDraw = e.target.checked; saveSettings(); };
  $('#sTap').onchange = e => { st.tapUndo = e.target.checked; saveSettings(); };
  $('#sPenBtn').onchange = e => { st.penButtonErase = e.target.checked; saveSettings(); };
  $('#sLefty').onchange = e => { st.lefty = e.target.checked; applySettings(); saveSettings(); };
  $('#sClose').onclick = closeModal;
}
$('#bSettings').onclick = openSettings;

function applySettings() {
  const st = S.settings;
  $('#app').classList.toggle('lefty', !!st.lefty);
  $('#app').classList.toggle('nopanel', !st.panel);
  $('#bPanel').classList.toggle('on', !!st.panel);
  if (E) { E.setPressureGamma(1); E.setVectorWhole(!!st.vectorWhole); }
  checkNarrow();
  applyFolds();
}
const saveSettings = debounce(() => store.set('settings', S.settings).catch(() => {}), 500);
const prefsSoon = debounce(() => store.set('prefs', {
  drawBrush: S.drawBrush, eraseBrush: S.eraseBrush, color: S.color, sub: S.sub, recent: S.recent,
}).catch(() => {}), 800);

/* ---------- 表示の ボタン ---------- */
$('#vFlip').onclick = toggleFlip;
$('#vRot').onclick = resetRotation;
$('#vFit').onclick = fitView;

/* ================================================================ 筆圧カーブの 画面 */
function drawCurve() {
  const cv = $('#curveCv');
  if (!cv) return;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, P = 14;
  const st = S.settings, c = st.curve;
  const X = v => P + v * (W - P * 2), Y = v => H - P - v * (H - P * 2);
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#FFFEF7'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(30,28,20,.15)'; x.lineWidth = 1;
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(X(i / 4), Y(0)); x.lineTo(X(i / 4), Y(1)); x.moveTo(X(0), Y(i / 4)); x.lineTo(X(1), Y(i / 4)); x.stroke(); }
  x.strokeStyle = '#1E1C14'; x.lineWidth = 2; x.strokeRect(X(0), Y(1), W - P * 2, H - P * 2);
  x.beginPath();
  for (let i = 0; i <= 60; i++) { const p = i / 60; const v = st.minPressure + (1 - st.minPressure) * curveAt(c, p); i ? x.lineTo(X(p), Y(v)) : x.moveTo(X(p), Y(v)); }
  x.lineWidth = 3; x.stroke();
  x.setLineDash([4, 4]); x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(X(0), Y(0)); x.lineTo(X(c[0]), Y(c[1])); x.moveTo(X(1), Y(1)); x.lineTo(X(c[2]), Y(c[3])); x.stroke();
  x.setLineDash([]);
  for (const [hx, hy] of [[c[0], c[1]], [c[2], c[3]]]) {
    x.beginPath(); x.arc(X(hx), Y(hy), 9, 0, Math.PI * 2);
    x.fillStyle = '#E1DD60'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#1E1C14'; x.stroke();
  }
}
function setupCurveEditor() {
  const cv = $('#curveCv'), st = S.settings;
  drawCurve();
  const P = 14;
  let drag = null;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    const W = cv.width - P * 2;
    const hs = [[st.curve[0], st.curve[1]], [st.curve[2], st.curve[3]]].map(([a, b]) => Math.hypot(P + a * W - px, cv.height - P - b * W - py));
    const idx = hs[0] <= hs[1] ? 0 : 1;
    if (hs[idx] > 30) return;
    cv.setPointerCapture(e.pointerId);
    drag = { idx, x: e.clientX, y: e.clientY, c: st.curve.slice(), k: k / W };
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) * drag.k, dy = -(e.clientY - drag.y) * drag.k;
    const i = drag.idx * 2;
    st.curve[i] = clamp(drag.c[i] + dx, 0, 1);
    st.curve[i + 1] = clamp(drag.c[i + 1] + dy, 0, 1);
    drawCurve();
  });
  const up = () => { if (drag) { drag = null; saveSettings(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const presets = { soft: [0.1, 0.45, 0.45, 0.95], mid: [0.25, 0.25, 0.75, 0.75], hard: [0.55, 0.05, 0.9, 0.55] };
  for (const b of $$('[data-cp]')) b.onclick = () => { st.curve = presets[b.dataset.cp].slice(); drawCurve(); saveSettings(); };
  // ためし 書き
  const t = $('#testCv'), tx = t.getContext('2d');
  t.style.touchAction = 'none';
  const clear = () => { tx.fillStyle = '#FFFEF7'; tx.fillRect(0, 0, t.width, t.height); };
  clear();
  let last = null;
  t.addEventListener('pointerdown', e => { t.setPointerCapture(e.pointerId); last = null; if (e.pointerType !== 'pen') { clear(); } });
  t.addEventListener('pointermove', e => {
    if (!(e.buttons & 1)) return;
    const r = t.getBoundingClientRect(), k = t.width / r.width;
    for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
      const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
      const p = ev.pointerType === 'pen' ? penPressure(ev.pressure) : 1;
      const w = 1 + p * 14;
      if (last) { tx.beginPath(); tx.moveTo(last[0], last[1]); tx.lineTo(x, y); tx.lineWidth = w; tx.lineCap = 'round'; tx.strokeStyle = '#1E1C14'; tx.stroke(); }
      last = [x, y];
    }
  });
  t.addEventListener('pointerup', () => { last = null; });
  t.addEventListener('dblclick', clear);
}

/* ================================================================ 太さの 列 ・ 補正 */
const SIZE_PRESETS = [0.7, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 70, 100, 150, 200, 300, 500, 1000];
function buildSizeRow() {
  const row = $('#sizeRow');
  row.innerHTML = '';
  for (const v of SIZE_PRESETS) {
    const b = document.createElement('button');
    b.className = 'sz';
    b.dataset.v = v;
    const d = clamp(Math.sqrt(v) * 2.6, 2, 30);
    b.innerHTML = `<i style="width:${d}px;height:${d}px"></i><span>${v}</span>`;
    b.onclick = () => setBrushSize(v);
    row.appendChild(b);
  }
  $('#stMinus').onclick = () => stepStab(-1);
  $('#stPlus').onclick = () => stepStab(1);
}
function setBrushSize(v) {
  const i = currentBrushIndex();
  E.brushSet(i, 'size', v);
  S.brushes[i].size = v;
  syncSliders();
  brushesChanged();
  if (S.tab === 'brush') renderBrushProps();
}
function stepStab(d) {
  const i = currentBrushIndex();
  const v = clamp((S.brushes[i].stabilization | 0) + d, 0, 15);
  E.brushSet(i, 'stabilization', v);
  S.brushes[i].stabilization = v;
  syncSizeRow();
  brushesChanged();
  if (S.tab === 'brush') renderBrushProps();
}
function syncSizeRow() {
  const b = S.brushes[currentBrushIndex()];
  if (!b) return;
  let best = null, bd = 1e9;
  for (const el of $$('.sz')) { const d = Math.abs(Math.log(+el.dataset.v / b.size)); if (d < bd) { bd = d; best = el; } }
  for (const el of $$('.sz')) el.classList.toggle('on', el === best && bd < 0.06);
  $('#stVal').textContent = b.stabilization | 0;
}

/* ================================================================ 細い 画面（レイヤーを タブに まとめる） */
let narrow = false;
function checkNarrow() {
  const want = window.innerWidth < 1100;
  if (want === narrow && document.querySelector('#pane-side')) return;
  narrow = want;
  $('#app').classList.toggle('narrow', narrow);
  let pane = $('#pane-side');
  if (!pane) { pane = document.createElement('section'); pane.className = 'pane'; pane.id = 'pane-side'; $('#panel').appendChild(pane); }
  const nav = $('.navbox'), lay = $('.layerbox');
  if (narrow) { pane.append(nav, lay); }
  else { $('#side').append(nav, lay); if (S.tab === 'side') openTab('brush'); }
  drawNav(true);
}
window.addEventListener('resize', () => checkNarrow());

/* ================================================================ ナビゲーター */
const navCv = $('#navCv'), navView = $('#navView');
let navImg = null, navT = 0;
const navSoon = () => { clearTimeout(navT); navT = setTimeout(() => drawNav(true), 250); };
function navLayout() {
  const r = navView.getBoundingClientRect();
  if (!S.info || !r.width) return null;
  const k = Math.min((r.width - 12) / S.info.width, (r.height - 12) / S.info.height);
  return { k, ox: (r.width - S.info.width * k) / 2, oy: (r.height - S.info.height * k) / 2, w: r.width, h: r.height };
}
function drawNav(refresh) {
  const L = navLayout();
  if (!L) return;
  const dpr = window.devicePixelRatio || 1;
  if (navCv.width !== Math.round(L.w * dpr)) { navCv.width = Math.round(L.w * dpr); navCv.height = Math.round(L.h * dpr); refresh = true; }
  if (refresh || !navImg) {
    navImg = navImg || document.createElement('canvas');
    navImg.width = Math.max(1, Math.round(S.info.width * L.k * dpr));
    navImg.height = Math.max(1, Math.round(S.info.height * L.k * dpr));
    const x = navImg.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, navImg.width, navImg.height);
    x.imageSmoothingQuality = 'high';
    x.drawImage(docCv, 0, 0, navImg.width, navImg.height);
  }
  const x = navCv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, L.w, L.h);
  x.drawImage(navImg, L.ox, L.oy, S.info.width * L.k, S.info.height * L.k);
  x.lineWidth = 2; x.strokeStyle = '#1E1C14';
  x.strokeRect(L.ox, L.oy, S.info.width * L.k, S.info.height * L.k);
  // いま 見えて いる はんい
  const r = stage.getBoundingClientRect();
  const pts = [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]].map(([sx, sy]) => toDoc(sx, sy));
  x.beginPath();
  pts.forEach(([px, py], i) => { const X = L.ox + px * L.k, Y = L.oy + py * L.k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
  x.closePath();
  x.fillStyle = 'rgba(225,221,96,.22)'; x.fill();
  x.lineWidth = 2; x.strokeStyle = '#101114'; x.stroke();
}
function navSync() {
  drawNav(false);
  const z = $('#nZoom'), rr = $('#nRot');
  if (z && !navDragging) {
    z.value = Math.log2(S.view.s);
    $('#nZoomV').textContent = Math.round(S.view.s * 100) + '%';
    let deg = Math.round(S.view.r * 180 / Math.PI) % 360;
    if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
    rr.value = deg;
    $('#nRotV').textContent = deg + '°';
  }
}
let navDragging = false;
{
  // ナビゲーターの 中を ドラッグ すると 見る 場所が 動く（触った だけでは とばない）
  let d = null;
  navView.addEventListener('pointerdown', e => {
    e.preventDefault();
    navView.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    d = { x: e.clientX, y: e.clientY, c: toDoc(r.width / 2, r.height / 2), moved: false };
  });
  navView.addEventListener('pointermove', e => {
    if (!d) return;
    const L = navLayout(); if (!L) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const r = stage.getBoundingClientRect();
    pinDoc(d.c[0] + dx / L.k, d.c[1] + dy / L.k, r.width / 2, r.height / 2);
    applyView();
  });
  const up = () => { d = null; };
  navView.addEventListener('pointerup', up);
  navView.addEventListener('pointercancel', up);
  const centerKeep = fn => { const r = stage.getBoundingClientRect(); const [px, py] = toDoc(r.width / 2, r.height / 2); fn(); pinDoc(px, py, r.width / 2, r.height / 2); applyView(); };
  const z = $('#nZoom'), rr = $('#nRot');
  z.addEventListener('pointerdown', () => { navDragging = true; });
  z.oninput = () => { navDragging = true; centerKeep(() => { S.view.s = clamp(Math.pow(2, +z.value), 0.02, 32); }); $('#nZoomV').textContent = Math.round(S.view.s * 100) + '%'; };
  z.onchange = () => { navDragging = false; navSync(); };
  rr.oninput = () => { navDragging = true; centerKeep(() => { S.view.r = +rr.value * Math.PI / 180; }); $('#nRotV').textContent = rr.value + '°'; };
  rr.onchange = () => { navDragging = false; navSync(); };
}
new ResizeObserver(() => drawNav(true)).observe(navView);

/* ================================================================ 資料（いろんな 画像を 見る） */
const refCv = $('#refCv'), refView = $('#refView');
const REF = { list: [], cur: -1, img: null, v: { x: 0, y: 0, s: 1 }, pick: false, urls: [] };
async function loadRefs() {
  REF.list = (await store.get('refs').catch(() => null)) || [];
  renderRefList();
  if (REF.list.length) await selectRef(Math.min(REF.list.length - 1, Math.max(0, REF.cur)));
}
function renderRefList() {
  REF.urls.forEach(u => URL.revokeObjectURL(u));
  REF.urls = [];
  const el = $('#refList');
  el.innerHTML = '';
  REF.list.forEach((r, i) => {
    const u = URL.createObjectURL(r.blob);
    REF.urls.push(u);
    const b = document.createElement('button');
    b.className = i === REF.cur ? 'on' : '';
    b.innerHTML = `<img src="${u}" alt="">`;
    b.onclick = () => selectRef(i);
    el.appendChild(b);
  });
  $('#refEmpty').hidden = REF.list.length > 0;
}
async function selectRef(i) {
  REF.cur = i;
  const r = REF.list[i];
  REF.img = r ? await createImageBitmap(r.blob).catch(() => null) : null;
  renderRefList();
  refFit();
}
function refFit() {
  const r = refView.getBoundingClientRect();
  if (!REF.img || !r.width) { drawRef(); return; }
  const s = Math.min(r.width / REF.img.width, r.height / REF.img.height);
  REF.v = { s, x: (r.width - REF.img.width * s) / 2, y: (r.height - REF.img.height * s) / 2 };
  drawRef();
}
function drawRef() {
  const r = refView.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  refCv.width = Math.round(r.width * dpr); refCv.height = Math.round(r.height * dpr);
  const x = refCv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, r.width, r.height);
  if (REF.img) {
    x.imageSmoothingQuality = 'high';
    x.drawImage(REF.img, REF.v.x, REF.v.y, REF.img.width * REF.v.s, REF.img.height * REF.v.s);
  }
  const z = $('#rZoom');
  if (z && REF.img) { z.value = Math.log2(REF.v.s); $('#rZoomV').textContent = Math.round(REF.v.s * 100) + '%'; }
}
function showRef() { if (!REF.loaded) { REF.loaded = true; loadRefs(); } else refFit(); }
function refZoomAt(k, sx, sy) {
  const v = REF.v;
  const ns = clamp(v.s * k, 0.02, 20);
  v.x = sx - (sx - v.x) * ns / v.s; v.y = sy - (sy - v.y) * ns / v.s; v.s = ns;
  drawRef();
}
{
  const pts = new Map();
  let base = null;
  refView.addEventListener('pointerdown', e => {
    e.preventDefault();
    refView.setPointerCapture(e.pointerId);
    const r = refView.getBoundingClientRect();
    pts.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    base = { v: { ...REF.v }, p: [...pts.values()].map(p => p.slice()), moved: false };
  });
  refView.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !base) return;
    const r = refView.getBoundingClientRect();
    pts.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
    const q = [...pts.values()];
    if (q.length >= 2 && base.p.length >= 2) {
      const [a, b] = base.p, [c, d] = q;
      const k = (Math.hypot(d[0] - c[0], d[1] - c[1]) || 1) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      const m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m1 = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
      const s = clamp(base.v.s * k, 0.02, 20);
      REF.v = { s, x: m1[0] - (m0[0] - base.v.x) * s / base.v.s, y: m1[1] - (m0[1] - base.v.y) * s / base.v.s };
      base.moved = true;
    } else {
      const dx = q[0][0] - base.p[0][0], dy = q[0][1] - base.p[0][1];
      if (!base.moved && Math.hypot(dx, dy) < 5) return;
      base.moved = true;
      REF.v = { ...base.v, x: base.v.x + dx, y: base.v.y + dy };
    }
    drawRef();
  });
  const up = e => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (base && !base.moved && REF.pick && REF.img && p) {
      // 資料から 色を とる
      const u = (p[0] - REF.v.x) / REF.v.s, v = (p[1] - REF.v.y) / REF.v.s;
      if (u >= 0 && v >= 0 && u < REF.img.width && v < REF.img.height) {
        const c = document.createElement('canvas'); c.width = 1; c.height = 1;
        const x = c.getContext('2d'); x.drawImage(REF.img, -Math.floor(u), -Math.floor(v));
        const d = x.getImageData(0, 0, 1, 1).data;
        setColor([d[0], d[1], d[2], 255]); addRecent(S.color); toast('資料から 色を とりました');
      }
    }
    const q = [...pts.values()].map(p => p.slice());
    base = q.length ? { v: { ...REF.v }, p: q, moved: true } : null;
  };
  refView.addEventListener('pointerup', up);
  refView.addEventListener('pointercancel', up);
  refView.addEventListener('wheel', e => { e.preventDefault(); const r = refView.getBoundingClientRect(); refZoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const z = $('#rZoom');
  z.oninput = () => { const r = refView.getBoundingClientRect(); refZoomAt(Math.pow(2, +z.value) / REF.v.s, r.width / 2, r.height / 2); };
  $('#rFit').onclick = refFit;
  $('#rPick').onclick = () => { REF.pick = !REF.pick; $('#rPick').classList.toggle('on', REF.pick); toast(REF.pick ? '資料を タップすると 色を とります' : '色とりを やめました'); };
  $('#rAdd').onclick = () => {
    const inp = $('#fileIn');
    inp.value = ''; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => {
      const files = [...inp.files];
      inp.multiple = false;
      for (const f of files) REF.list.push({ id: uid(), name: f.name, blob: f });
      await store.set('refs', REF.list).catch(() => toast('資料を しまえませんでした'));
      await selectRef(REF.list.length - 1);
    };
    inp.click();
  };
  $('#rDel').onclick = async () => {
    if (REF.cur < 0 || !REF.list[REF.cur]) return;
    if (!await confirmBox('この 資料を はずしますか？')) return;
    REF.list.splice(REF.cur, 1);
    await store.set('refs', REF.list).catch(() => {});
    REF.cur = Math.min(REF.cur, REF.list.length - 1);
    if (REF.cur >= 0) await selectRef(REF.cur); else { REF.img = null; renderRefList(); drawRef(); }
  };
  new ResizeObserver(() => { if (S.tab === 'ref') drawRef(); }).observe(refView);
}

/* ================================================================ たたむ（クリスタの パレットの ように） */
function setupFolds() {
  for (const f of $$('.fold[data-fold]')) {
    const h = document.createElement('button');
    h.className = 'fhead';
    h.innerHTML = icon('down', 14) + '<span>' + f.dataset.ft + '</span>';
    h.title = 'たたむ／ひらく';
    h.onclick = () => {
      const key = f.dataset.fold;
      S.settings.folds[key] = !f.classList.contains('folded');
      applyFolds();
      saveSettings();
      if (!S.settings.folds[key]) { if (key === 'nav') drawNav(true); if (key === 'blist') renderBrushPanel(); }
    };
    f.prepend(h);
  }
  const strip = (el, items, expand) => {
    el.innerHTML = '';
    const b = document.createElement('button');
    b.innerHTML = icon('aleft', 20); b.title = 'ひらく';
    b.onclick = () => expand(null);
    el.appendChild(b);
    for (const [ic, title, what] of items) {
      const x = document.createElement('button');
      x.innerHTML = icon(ic, 20); x.title = title;
      x.onclick = () => expand(what);
      el.appendChild(x);
    }
  };
  strip($('#panelStrip'), [['brush', 'ブラシ', 'brush'], ['palette', '色', 'color'], ['image', '資料', 'ref']], what => {
    S.settings.pmini = false; applyFolds(); saveSettings();
    if (what) openTab(what); else openTab(S.tab);
  });
  strip($('#sideStrip'), [['fit', 'ナビゲーター', 'nav'], ['layers', 'レイヤー', 'layers']], what => {
    S.settings.smini = false;
    if (what) S.settings.folds[what] = false;
    applyFolds(); saveSettings(); drawNav(true); refreshLayers(true);
  });
  $('#panelFold').innerHTML = icon('aright', 18);
  $('#panelFold').onclick = () => { S.settings.pmini = true; applyFolds(); saveSettings(); };
  $('#sideFold').innerHTML = icon('aright', 18);
  $('#sideFold').onclick = () => { S.settings.smini = true; applyFolds(); saveSettings(); };
}
function applyFolds() {
  const st = S.settings;
  for (const f of $$('.fold[data-fold]')) f.classList.toggle('folded', !!st.folds[f.dataset.fold]);
  const app = $('#app');
  const lefty = !!st.lefty;
  app.classList.toggle('pmini', !!st.pmini);
  app.classList.toggle('smini', !!st.smini);
  // 左手モードでは 矢印を 逆に
  for (const id of ['#panelFold', '#sideFold']) $(id).innerHTML = icon(lefty ? 'aleft' : 'aright', 18);
  for (const el of $$('.ministrip>button:first-child')) el.innerHTML = icon(lefty ? 'aright' : 'aleft', 20);
  resizeOverlay();
  drawNav(true);
}

/* ================================================================ 選択範囲の 表示 */
const selCv = $('#selCv');
function refreshSel() {
  const px = E && E.selPreview(1400);
  const on = !!px;
  selCv.hidden = !on;
  for (const id of ['#cSelNone', '#cSelInv', '#cSelFill', '#cClearOut']) { const b = $(id); if (b) b.disabled = !on; }
  if (!on) return;
  const dv = new DataView(px.buffer);
  const w = dv.getUint32(0, true), h = dv.getUint32(4, true);
  const m = px.subarray(8);
  selCv.width = w; selCv.height = h;
  selCv.style.width = S.info.width + 'px';
  selCv.style.height = S.info.height + 'px';
  const img = new ImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const inside = m[i] > 127;
    const edge = inside && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || m[i - 1] <= 127 || m[i + 1] <= 127 || m[i - w] <= 127 || m[i + w] <= 127);
    const o = i * 4;
    if (edge) { const k = ((x + y) >> 2) & 1; d[o] = k ? 30 : 255; d[o + 1] = k ? 28 : 254; d[o + 2] = k ? 20 : 247; d[o + 3] = 255; }
    else if (!inside) { d[o] = 30; d[o + 1] = 28; d[o + 2] = 20; d[o + 3] = 40; } // 外を 少し 暗く
  }
  selCv.getContext('2d').putImageData(img, 0, 0);
}

/* ================================================================ 上の 列（コマンド と メニュー） */
function cmdClear() {
  const l = S.info.layers[S.info.selected];
  if (!l || l.locked || l.folder) { layerBlockedToast(); return; }
  if (E.selActive()) { if (E.selApply(0)) changed(); else layerBlockedToast(); }
  else { E.layerClear(S.info.selected); changed({ layers: true }); }
}
function cmdTransform() {
  if (!layerPaintable()) { layerBlockedToast(); return; }
  selectTool('move');
  if (!S.float) beginFloat([]);
}
function selNeed(fn) { return () => { if (!E.selActive()) { toast('選択範囲が ありません'); return; } fn(); }; }
const selCmd = {
  fill: selNeed(() => { if (E.selApply(2)) { addRecent(S.color); changed(); } else layerBlockedToast(); }),
  clearOut: selNeed(() => { if (E.selApply(1)) changed(); else layerBlockedToast(); }),
};
async function askNumber(title, value) {
  const v = await promptText(title, String(value));
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}
function setupCommands() {
  const ic = (id, name) => setIcon($(id), name, 20);
  ic('#cNew', 'newfile'); ic('#cOpen', 'open'); ic('#cSave', 'save');
  ic('#cJpg', 'jpg'); ic('#cPng', 'png'); ic('#cPsd', 'filetype');
  ic('#cSelNone', 'selnone'); ic('#cSelInv', 'seldash'); ic('#cSelFill', 'fill');
  ic('#cClear', 'clean'); ic('#cClearOut', 'scissor'); ic('#cTransform', 'transform');
  ic('#cHelp', 'help'); ic('#cFull', 'full'); ic('#cRuler', 'mirror'); ic('#cFilm', 'film');
  $('#cRuler').onclick = e => { e.stopPropagation(); openRulerMenu($('#cRuler')); };
  $('#cFilm').onclick = openTimelapse;
  $('#cNew').onclick = () => { commitFloat(); openNewDialog(); };
  $('#cOpen').onclick = () => pickFile('.efude,.psd,.efudebrushes,image/*', openFile);
  $('#cSave').onclick = async () => { commitFloat(); S.unsaved = true; await saveNow(); toast('しまいました'); };
  $('#cJpg').onclick = () => exportAs('jpg');
  $('#cPng').onclick = () => exportAs('png');
  $('#cPsd').onclick = () => exportAs('psd');
  $('#cSelNone').onclick = () => { E.selOp(1); refreshSel(); };
  $('#cSelInv').onclick = () => { E.selOp(2); refreshSel(); };
  $('#cSelFill').onclick = selCmd.fill;
  $('#cClear').onclick = cmdClear;
  $('#cClearOut').onclick = selCmd.clearOut;
  $('#cTransform').onclick = cmdTransform;
  $('#cHelp').onclick = openHelp;
  $('#cFull').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => toast('全画面に できませんでした'));
  };
  buildMenus();
}
function layerCmd(fn) { return () => { commitFloat(); fn(S.info.selected, S.info.layers[S.info.selected]); }; }
function toggleFold(key) {
  S.settings.folds[key] = !S.settings.folds[key];
  if (!S.settings.folds[key]) { S.settings.pmini = false; S.settings.smini = false; }
  applyFolds(); saveSettings();
}
const MENUS = () => [
  ['ファイル', [
    ['新しい 紙', '', () => $('#cNew').click()],
    ['作品の 一覧', '', openMenu],
    ['ファイルを ひらく', '', () => $('#cOpen').click()],
    ['今すぐ しまう', 'Ctrl+S', () => $('#cSave').click()],
    '-',
    ['書き出す…', '', openExport],
    ['JPG で 書き出す', '', () => exportAs('jpg')],
    ['PNG で 書き出す', '', () => exportAs('png')],
    ['透明 PNG で 書き出す', '', () => exportAs('png-t')],
    ['PSD で 書き出す', '', () => exportAs('psd')],
    ['.efude で 書き出す', '', () => exportAs('efude')],
    ['タイムラプス 動画…', '', openTimelapse],
    '-',
    ['Efude の ブラシを 読む', '', () => pickFile('.efudebrushes', openFile)],
  ]],
  ['編集', [
    ['取り消し', 'Ctrl+Z', doUndo],
    ['やり直し', 'Ctrl+Y', doRedo],
    '-',
    ['消去', 'Del', cmdClear],
    ['選択範囲の 外を 消す', '', selCmd.clearOut],
    ['選択範囲を 塗る', '', selCmd.fill],
    ['拡大・縮小・回転', 'Ctrl+T', cmdTransform],
    '-',
    ['紙の 向きを かえる…', '', openRotateDialog],
  ]],
  ['レイヤー', [
    ['新しい ラスターレイヤー', '', () => $('#lAdd').click()],
    ['新しい ベクターレイヤー', '', () => $('#lVec').click()],
    ['新しい フォルダー', '', () => $('#lFolder').click()],
    ['レイヤーの 設定…', '', openLayerSettings],
    ['画像を レイヤーに', '', () => $('#lImage').click()],
    '-',
    ['複製', '', layerCmd(i => { E.layerDuplicate(i); changed({ layers: true }); })],
    ['下と 結合', '', layerCmd(i => { if (E.layerMergeDown(i)) changed({ layers: true }); else toast('結合できません'); })],
    ['ラスターに する', '', layerCmd((i, l) => { if (!l.vector) { toast('ベクターレイヤーでは ありません'); return; } E.layerRasterize(i); changed({ layers: true }); })],
    ['削除', '', layerCmd(async (i, l) => { if (await confirmBox(`「${l.name}」を 削除しますか？`)) { E.layerDelete(i); changed({ layers: true }); } })],
    '-',
    ['表示・非表示', '', layerCmd((i, l) => { E.checkpoint(); E.layerSet(i, 'visible', l.visible ? 0 : 1); changed({ layers: true }); })],
    ['ロック', '', layerCmd((i, l) => { E.checkpoint(); E.layerSet(i, 'locked', l.locked ? 0 : 1); changed({ layers: true }); })],
    ['下の レイヤーで クリップ', '', layerCmd((i, l) => { E.checkpoint(); E.layerSet(i, 'clipping', l.clipping ? 0 : 1); changed({ layers: true }); })],
    ['トーンに する', '', layerCmd((i, l) => { E.checkpoint(); E.layerSet(i, 'tone', l.tone ? 0 : 1); changed({ layers: true }); })],
  ]],
  ['選択範囲', [
    ['すべて 選択', 'Ctrl+A', () => { E.selOp(0); refreshSel(); }],
    ['選択を 解除', 'Ctrl+D', () => { E.selOp(1); refreshSel(); }],
    ['選択範囲を 反転', 'Ctrl+Shift+I', () => { E.selOp(2); refreshSel(); }],
    ['レイヤーの 絵から 選択', '', () => { E.selOp(6); refreshSel(); }],
    '-',
    ['選択範囲を 広げる…', '', selNeed(async () => { const n = await askNumber('広げる 画素数', 4); if (n) { E.selOp(3, n); refreshSel(); } })],
    ['選択範囲を せばめる…', '', selNeed(async () => { const n = await askNumber('せばめる 画素数', 4); if (n) { E.selOp(4, n); refreshSel(); } })],
    ['選択範囲を ぼかす…', '', selNeed(async () => { const n = await askNumber('ぼかす 画素数', 4); if (n) { E.selOp(5, n); refreshSel(); } })],
    '-',
    ['選択の 道具に する', 'S', () => selectTool('select')],
  ]],
  ['フィルター', [
    ['ぼかし…', '', () => openFilter(0)],
    ['シャープ…', '', () => openFilter(1)],
    ['色相・彩度…', '', () => openFilter(2)],
    ['明るさ・コントラスト…', '', () => openFilter(3)],
    '-',
    ['自動レベル補正', '', () => runFilter(4)],
    ['色の 反転', '', () => runFilter(5)],
    ['モノクロ', '', () => runFilter(6)],
  ]],
  ['表示', [
    ['全体を 見る', '0', fitView],
    ['100%', '', () => { const r = stage.getBoundingClientRect(); zoomAt(1 / S.view.s, r.width / 2, r.height / 2); }],
    ['拡大', '', () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); }],
    ['縮小', '', () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); }],
    ['左右反転（見た目だけ）', 'H', toggleFlip],
    ['回転を もどす', '', resetRotation],
    '-',
    ...SYM_NAMES.map((n, m) => ['定規: ' + n, '', () => { symState().mode = m; applySym(); saveSettings(); }, () => symState().mode === m]),
  ]],
  ['ウィンドウ', [
    ...[['blist', 'ブラシ'], ['bprops', 'ブラシの 設定'], ['nav', 'ナビゲーター'], ['layers', 'レイヤー'], ['sizes', '太さの 列']]
      .map(([k, n]) => [n, '', () => toggleFold(k), () => !S.settings.folds[k]]),
    '-',
    ['ブラシの 列を 細く', '', () => { S.settings.pmini = !S.settings.pmini; applyFolds(); saveSettings(); }, () => S.settings.pmini],
    ['レイヤーの 列を 細く', '', () => { S.settings.smini = !S.settings.smini; applyFolds(); saveSettings(); }, () => S.settings.smini],
    ['パネルを しまう', 'Tab', () => $('#bPanel').click(), () => !S.settings.panel],
    ['左手モード', '', () => { S.settings.lefty = !S.settings.lefty; applySettings(); saveSettings(); }, () => S.settings.lefty],
  ]],
  ['ヘルプ', [
    ['使いかた', '', openHelp],
    ['設定・この アプリに ついて', '', openSettings],
  ]],
];
let menuPop = null, menuOpen = null;
function closeMenus() { if (menuPop) { menuPop.remove(); menuPop = null; } menuOpen = null; for (const b of $$('.mbtn')) b.classList.remove('on'); }
document.addEventListener('keydown', e => { if (e.key === 'Shift' && input.shape) { input.shape.square = true; drawOverlay(); } });
function buildMenus() {
  const bar = $('#menus');
  bar.innerHTML = '';
  for (const [name] of MENUS()) {
    const b = document.createElement('button');
    b.className = 'mbtn';
    b.textContent = name;
    b.onclick = e => { e.stopPropagation(); if (menuOpen === name) { closeMenus(); return; } showMenu(name, b); };
    bar.appendChild(b);
  }
  document.addEventListener('pointerdown', e => { if (menuPop && !menuPop.contains(e.target) && !e.target.closest('.mbtn')) closeMenus(); });
}
function showMenu(name, btn) {
  closeMenus();
  const items = MENUS().find(m => m[0] === name)[1];
  menuOpen = name;
  btn.classList.add('on');
  const pop = document.createElement('div');
  pop.className = 'mpop';
  for (const it of items) {
    if (it === '-') { pop.appendChild(document.createElement('hr')); continue; }
    const [label, key, fn, check] = it;
    const b = document.createElement('button');
    b.innerHTML = `<span class="ck">${check ? (check() ? '✓' : '') : ''}</span><span>${label}</span><span class="k">${key || ''}</span>`;
    b.onclick = () => { closeMenus(); fn(); };
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  menuPop = pop;
}

/* ---------- フィルター ---------- */
const FILTERS = [
  ['ぼかし', [['a', 'はんい', 1, 40, 4, 1]]],
  ['シャープ', [['a', '強さ', 0.1, 3, 0.8, 0.05]]],
  ['色相・彩度', [['a', '色相', -180, 180, 0, 1], ['b', '彩度', 0, 3, 1, 0.01]]],
  ['明るさ・コントラスト', [['a', '明るさ', -1, 1, 0, 0.01], ['b', 'コントラスト', -1, 1, 0, 0.01]]],
];
function runFilter(kind, a = 0, b = 0) {
  commitFloat();
  if (!layerPaintable()) { layerBlockedToast(); return; }
  toast('かけています…', 4000);
  setTimeout(() => { if (E.filterApply(kind, a, b)) { changed({ layers: true }); toast('かけました'); } }, 30);
}
function openFilter(kind) {
  const [name, params] = FILTERS[kind];
  const vals = {};
  openModal(`<div class="fdlg"><h2>${icon('filter')}${name}<span class="grow"></span><button class="ib sm" id="fClose">${icon('close', 18)}</button></h2>
    ${params.map(([k, label, min, max, def, step]) => { vals[k] = def; return `<div class="prow"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${def}"><span class="v dot" id="fv${k}">${def}</span></div>`; }).join('')}
    <p class="small">${E.selActive() ? '選択範囲の 中だけに かけます。' : '今の レイヤー ぜんたいに かけます。'}かけた あとでも 取り消せます。</p>
    <div class="btnrow"><button class="btn-y" id="fOk">かける</button><button id="fNo">やめる</button></div></div>`);
  for (const r of $$('input[type=range]', card)) r.oninput = () => { vals[r.dataset.k] = +r.value; $('#fv' + r.dataset.k).textContent = (+r.value).toFixed(+r.step < 1 ? 2 : 0); };
  $('#fOk').onclick = () => { closeModal(); runFilter(kind, vals.a || 0, vals.b ?? 0); };
  $('#fNo').onclick = closeModal;
  $('#fClose').onclick = closeModal;
}

/* ---------- 使いかた ---------- */
function openHelp() {
  openModal(`<h2>${icon('help')}使いかた<span class="grow"></span><button class="ib sm" id="hClose">${icon('close', 18)}</button></h2>
    <div class="hint">ペン … 描く ／ 指1本 … 動かす（長押しで 色を とる）／ 指2本 … 拡大・回転、タップで 取り消し ／ 指3本タップ … やり直し</div>
    <div class="title">選択範囲</div>
    <p class="small">左の「選択範囲」の 道具で 囲うか、自動選択で 色の つながった ところを 選びます。選んで いる 間は、描く・塗る・消す・フィルター・拡大縮小回転 が その 中だけに かかります。上の 列の ボタンで 解除・反転・塗る・消す が できます。</p>
    <div class="title">キーボード</div>
    <p class="small">Ctrl+Z 取り消し ／ Ctrl+Y やり直し ／ Ctrl+A すべて選択 ／ Ctrl+D 選択解除 ／ Ctrl+Shift+I 反転 ／ Ctrl+T 拡大縮小回転 ／ Del 消去 ／ B 描く ／ E 消す ／ G 塗る ／ S 選択 ／ L 囲って塗る ／ M 動かす ／ V ベクター消しゴム ／ W 線幅 ／ I スポイト ／ [ ] 太さ ／ H 左右反転 ／ 0 全体 ／ Tab パネル</p>`);
  $('#hClose').onclick = closeModal;
}

/* ================================================================ 対称定規 */
const SYM_NAMES = ['なし', '左右 対称', '上下 対称', '上下左右 対称', '放射', '万華鏡'];
function symState() {
  const st = S.settings;
  if (!st.sym) st.sym = { mode: 0, n: 6, cx: null, cy: null };
  return st.sym;
}
function applySym() {
  const y = symState();
  if (!S.info) return;
  if (y.cx == null || y.cx > S.info.width || y.cy > S.info.height) { y.cx = S.info.width / 2; y.cy = S.info.height / 2; }
  E.setSymmetry(y.mode, y.n, y.cx, y.cy);
  $('#cRuler').classList.toggle('on', y.mode > 0);
  drawOverlay();
}
function openRulerMenu(btn) {
  closeMenus();
  const y = symState();
  const pop = document.createElement('div');
  pop.className = 'mpop';
  const add = (label, fn, on) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ck">${on ? '✓' : ''}</span><span>${label}</span>`;
    b.onclick = () => { fn(); closeMenus(); applySym(); saveSettings(); };
    pop.appendChild(b);
  };
  SYM_NAMES.forEach((n, m) => add(n, () => { y.mode = m; }, y.mode === m));
  pop.appendChild(document.createElement('hr'));
  for (const n of [3, 4, 6, 8, 12, 16]) add(`放射の 数 ${n}`, () => { y.n = n; if (y.mode < 4) y.mode = 4; }, y.mode >= 4 && y.n === n);
  pop.appendChild(document.createElement('hr'));
  add('中心を 紙の まん中に', () => { y.cx = S.info.width / 2; y.cy = S.info.height / 2; });
  const hint = document.createElement('div');
  hint.className = 'small';
  hint.style.padding = '.3rem .6rem';
  hint.textContent = '中心の 丸を ドラッグすると 動かせます';
  pop.appendChild(hint);
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  menuPop = pop;
}
function drawSymGuide() {
  const y = symState();
  if (!y.mode || !S.info) return;
  const [cx, cy] = toScreen(y.cx, y.cy);
  const R = 4000;
  octx.save();
  octx.setLineDash([8, 6]);
  octx.lineWidth = 1.5;
  octx.strokeStyle = 'rgba(16,17,20,.45)';
  const line = (ax, ay, bx, by) => { const [x1, y1] = toScreen(ax, ay), [x2, y2] = toScreen(bx, by); octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x2, y2); octx.stroke(); };
  if (y.mode === 1 || y.mode === 3) line(y.cx, -R, y.cx, R + S.info.height);
  if (y.mode === 2 || y.mode === 3) line(-R, y.cy, R + S.info.width, y.cy);
  if (y.mode >= 4) {
    for (let k = 0; k < y.n; k++) {
      const a = -Math.PI / 2 + Math.PI * 2 * k / y.n;
      line(y.cx, y.cy, y.cx + Math.cos(a) * R, y.cy + Math.sin(a) * R);
    }
  }
  octx.setLineDash([]);
  octx.beginPath(); octx.arc(cx, cy, 11, 0, Math.PI * 2);
  octx.fillStyle = '#E1DD60'; octx.fill();
  octx.lineWidth = 2; octx.strokeStyle = '#101114'; octx.stroke();
  octx.restore();
}
function symHandleHit(x, y) {
  const s = symState();
  if (!s.mode || !S.info) return false;
  const [cx, cy] = toScreen(s.cx, s.cy);
  return Math.hypot(x - cx, y - cy) < 22;
}

/* ================================================================ 図形（直線・四角・円） */
function shapePoints(kind, a, b) {
  const pts = [];
  const seg = (p, q) => {
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3));
    for (let i = 0; i < n; i++) pts.push([p[0] + (q[0] - p[0]) * i / n, p[1] + (q[1] - p[1]) * i / n]);
  };
  if (kind === 'line') { seg(a, b); pts.push(b); }
  else if (kind === 'rect') {
    const c = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    for (let i = 0; i < 4; i++) seg(c[i], c[(i + 1) % 4]);
    pts.push(c[0]);
  } else {
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
    const n = Math.max(24, Math.ceil(Math.PI * 2 * Math.max(rx, ry) / 3));
    for (let i = 0; i <= n; i++) { const t = Math.PI * 2 * i / n; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  }
  return pts;
}
function shapeEnd(sh) {
  if (!sh || Math.hypot(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]) < 2) return;
  const st = S.settings;
  let [a, b] = [sh.a, sh.b];
  if (sh.kind !== 'line' && sh.square) {
    const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    b = [a[0] + Math.sign(b[0] - a[0] || 1) * d, a[1] + Math.sign(b[1] - a[1] || 1) * d];
  }
  const pts = shapePoints(sh.kind, a, b);
  if (st.shapeFill && sh.kind !== 'line') {
    if (!layerPaintable()) { layerBlockedToast(); return; }
    if (E.lasso(pts, false)) { addRecent(S.color); changed(); }
    return;
  }
  // いまの ブラシで なぞる（手ブレ補正で 角が まるく ならない よう 時間を あける）
  E.brushSelect(S.drawBrush);
  if (!E.strokeBegin(pts[0][0], pts[0][1])) { layerBlockedToast(); return; }
  let t = 0;
  for (const [x, y] of pts) { E.strokePush(x, y, st.shapePressure, 0, 0, 0, t); t += 260; }
  E.strokeEnd();
  addRecent(S.color);
  changed();
}
function drawShapePreview() {
  const sh = input.shape;
  if (!sh) return;
  let b = sh.b;
  if (sh.kind !== 'line' && sh.square) {
    const d = Math.max(Math.abs(b[0] - sh.a[0]), Math.abs(b[1] - sh.a[1]));
    b = [sh.a[0] + Math.sign(b[0] - sh.a[0] || 1) * d, sh.a[1] + Math.sign(b[1] - sh.a[1] || 1) * d];
  }
  const pts = shapePoints(sh.kind, sh.a, b);
  octx.save();
  octx.beginPath();
  pts.forEach(([px, py], i) => { const [x, y] = toScreen(px, py); i ? octx.lineTo(x, y) : octx.moveTo(x, y); });
  const bw = S.brushes[S.drawBrush] ? S.brushes[S.drawBrush].size * S.view.s : 2;
  octx.lineWidth = Math.max(1.5, bw);
  octx.lineCap = 'round'; octx.lineJoin = 'round';
  octx.strokeStyle = rgbCss([S.color[0], S.color[1], S.color[2], 150]);
  if (S.settings.shapeFill && sh.kind !== 'line') { octx.fillStyle = rgbCss([S.color[0], S.color[1], S.color[2], 120]); octx.fill(); }
  else octx.stroke();
  octx.restore();
}

/* ================================================================ テキスト */
const TEXT_FONTS = [
  ['ゴシック', "'Noto Sans JP','Hiragino Sans',sans-serif"],
  ['明朝', "'Noto Serif JP','Hiragino Mincho ProN',serif"],
  ['まるゴシック', "'M PLUS Rounded 1c',sans-serif"],
];
const ROTATE_CHARS = 'ー－―〜～…‥（）「」『』【】〈〉《》()[]<>=';
const SMALL_TOP = '、。，．';
async function renderText(o) {
  const font = TEXT_FONTS[o.font] ? TEXT_FONTS[o.font][1] : TEXT_FONTS[0][1];
  const weight = o.bold ? 900 : 500;
  try { await document.fonts.load(`${weight} ${o.size}px ${font.split(',')[0]}`, o.text); } catch (_) {}
  const size = o.size, lh = size * (o.vertical ? 1.05 : 1.35), gap = size * 1.5;
  const lines = o.text.split('\n');
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  x.font = `${weight} ${size}px ${font}`;
  const pad = Math.ceil(size * 0.3 + o.outline);
  let W, H;
  if (o.vertical) {
    const maxLen = Math.max(1, ...lines.map(l => [...l].length));
    W = Math.ceil(lines.length * gap + pad * 2); H = Math.ceil(maxLen * lh + pad * 2);
  } else {
    W = Math.ceil(Math.max(1, ...lines.map(l => x.measureText(l).width)) + pad * 2); H = Math.ceil(lines.length * lh + pad * 2);
  }
  c.width = W; c.height = H;
  x.font = `${weight} ${size}px ${font}`;
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  const col = rgbCss(S.color);
  const draw = (ch, px, py, rot) => {
    x.save(); x.translate(px, py); if (rot) x.rotate(Math.PI / 2);
    if (o.outline > 0) { x.lineWidth = o.outline * 2; x.strokeStyle = '#fff'; x.strokeText(ch, 0, 0); }
    x.fillStyle = col; x.fillText(ch, 0, 0);
    x.restore();
  };
  if (o.vertical) {
    x.textAlign = 'center';
    lines.forEach((line, li) => {
      const cx = W - pad - gap * li - gap / 2;
      [...line].forEach((ch, k) => {
        let cy = pad + lh * k + lh / 2;
        let px = cx;
        if (SMALL_TOP.includes(ch)) { px += size * 0.55; cy -= size * 0.55; }
        draw(ch, px, cy, ROTATE_CHARS.includes(ch));
      });
    });
  } else {
    x.textAlign = 'left';
    lines.forEach((line, li) => draw(line, pad, pad + lh * li + lh / 2, false));
  }
  return c;
}
async function openTextDialog(dx, dy) {
  const st = S.settings;
  openModal(`<h2>${icon('text')}テキスト<span class="grow"></span><button class="ib sm" id="tClose">${icon('close', 18)}</button></h2>
    <textarea id="tText" rows="3" style="width:100%;font-size:1rem" placeholder="セリフ・文字">${escapeHtml(st.textLast || '')}</textarea>
    <div class="prow"><span>大きさ</span><input type="range" id="tSize" min="12" max="400" step="1" value="${st.textSize}"><span class="v dot" id="tSizeV">${st.textSize}</span></div>
    <div class="prow"><span>ふちどり</span><input type="range" id="tOut" min="0" max="20" step="1" value="${st.textOutline}"><span class="v dot" id="tOutV">${st.textOutline}</span></div>
    <div class="btnrow">
      <button class="btn-sm ${st.textVertical ? 'on' : ''}" id="tV">たて書き</button>
      <button class="btn-sm ${!st.textVertical ? 'on' : ''}" id="tH">よこ書き</button>
      <button class="btn-sm ${st.textBold ? 'on' : ''}" id="tB">太字</button>
      ${TEXT_FONTS.map((f, i) => `<button class="btn-sm ${st.textFont === i ? 'on' : ''}" data-tf="${i}">${f[0]}</button>`).join('')}
    </div>
    <p class="small">いまの 色で 新しい レイヤーに 入ります。あとから「囲って動かす」で 動かせます。</p>
    <div class="btnrow"><button class="btn-y" id="tOk">入れる</button><button id="tNo">やめる</button></div>`);
  const re = () => {
    $('#tV').classList.toggle('on', st.textVertical); $('#tH').classList.toggle('on', !st.textVertical);
    $('#tB').classList.toggle('on', st.textBold);
    for (const b of $$('[data-tf]')) b.classList.toggle('on', +b.dataset.tf === st.textFont);
  };
  $('#tSize').oninput = e => { st.textSize = +e.target.value; $('#tSizeV').textContent = st.textSize; };
  $('#tOut').oninput = e => { st.textOutline = +e.target.value; $('#tOutV').textContent = st.textOutline; };
  $('#tV').onclick = () => { st.textVertical = true; re(); };
  $('#tH').onclick = () => { st.textVertical = false; re(); };
  $('#tB').onclick = () => { st.textBold = !st.textBold; re(); };
  for (const b of $$('[data-tf]')) b.onclick = () => { st.textFont = +b.dataset.tf; re(); };
  $('#tClose').onclick = closeModal; $('#tNo').onclick = closeModal;
  setTimeout(() => $('#tText').focus(), 50);
  $('#tOk').onclick = async () => {
    const text = $('#tText').value.replace(/\s+$/, '');
    if (!text) { closeModal(); return; }
    st.textLast = text; saveSettings();
    closeModal();
    const c = await renderText({ text, size: st.textSize, vertical: st.textVertical, bold: st.textBold, font: st.textFont, outline: st.textOutline });
    const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // たて書きは タップした ところが 右上、よこ書きは 左上
    const ox = Math.round(st.textVertical ? dx - c.width : dx), oy = Math.round(dy);
    commitFloat();
    E.layerFromRgba(new Uint8Array(rgba.buffer), c.width, c.height, ox, oy, text.split('\n')[0].slice(0, 12));
    changed({ layers: true });
    addRecent(S.color);
  };
}

/* ================================================================ タイムラプス（制作の 動画） */
let tlBusy = false, tlPending = false, tlLast = 0, tlTimer = 0;
/* 何か かわる たびに 1コマ。描いて いる 間・描きなおし 中は まつ。 */
function recordFrame() {
  if (!S.work || !S.settings.timelapse) return;
  tlPending = true;
  if (!tlTimer) tlTimer = setTimeout(tlTick, 250);
}
async function tlTick() {
  tlTimer = 0;
  if (!tlPending) return;
  if (tlBusy || input.drawing || E.dirtyCount() > 0 || performance.now() - tlLast < 300) { tlTimer = setTimeout(tlTick, 120); return; }
  tlPending = false;
  tlBusy = true;
  tlLast = performance.now();
  try {
    const k = Math.min(1, 960 / Math.max(docCv.width, docCv.height));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(docCv.width * k / 2) * 2); c.height = Math.max(2, Math.round(docCv.height * k / 2) * 2);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(docCv, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    S.work.frames = (S.work.frames || 0) + 1;
    await store.addFrame(S.work.id, S.work.frames, blob);
  } catch (_) {}
  tlBusy = false;
  if (tlPending && !tlTimer) tlTimer = setTimeout(tlTick, 120);
}
function pickRecorderType() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}
async function exportTimelapse(seconds) {
  const keys = await store.frameKeys(S.work.id).catch(() => []);
  if (keys.length < 2) { toast('まだ コマが ありません（描くと たまります）'); return; }
  const type = pickRecorderType();
  if (!type) { toast('この ブラウザでは 動画に できません'); return; }
  const fps = 30;
  const total = Math.max(2, Math.min(keys.length, Math.round(seconds * fps)));
  const pick = Array.from({ length: total }, (_, i) => keys[Math.round(i * (keys.length - 1) / (total - 1))]);
  const first = await createImageBitmap(await store.frame(pick[0]));
  const c = document.createElement('canvas');
  const k = Math.min(1, 1280 / Math.max(first.width, first.height));
  c.width = Math.round(first.width * k / 2) * 2; c.height = Math.round(first.height * k / 2) * 2;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  rec.start(500);
  toast('動画に しています… 0%', 60000);
  const frameMs = 1000 / fps;
  let t0 = performance.now();
  for (let i = 0; i < pick.length; i++) {
    const bmp = await createImageBitmap(await store.frame(pick[i]));
    x.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const wait = t0 + frameMs * (i + 1) - performance.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (i % 15 === 0) $('#toast').textContent = `動画に しています… ${Math.round(i / pick.length * 100)}%`;
  }
  await new Promise(r => setTimeout(r, 1500)); // さいごの 絵を 少し 止める
  rec.stop();
  await done;
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: type.split(';')[0] }), safeName(workName()) + '_タイムラプス.' + ext);
  toast('タイムラプスを 書き出しました');
}
async function openTimelapse() {
  const keys = await store.frameKeys(S.work.id).catch(() => []);
  const st = S.settings;
  openModal(`<h2>${icon('film')}タイムラプス<span class="grow"></span><button class="ib sm" id="flClose">${icon('close', 18)}</button></h2>
    <p class="small">描く たびに 絵を 1コマ ずつ しまって おき、制作の ようすを 動画に します。この 作品の コマ: <b>${keys.length}</b></p>
    <div class="prow chk"><span>コマを ためる</span><input type="checkbox" id="flOn" ${st.timelapse ? 'checked' : ''}></div>
    <div class="prow"><span>動画の 長さ</span><input type="range" id="flSec" min="5" max="60" step="1" value="${st.timelapseSec}"><span class="v dot" id="flSecV">${st.timelapseSec}秒</span></div>
    <div class="btnrow"><button class="btn-y" id="flGo">${icon('download', 16)}動画を 書き出す</button><button class="danger" id="flClear">${icon('trash', 16)}コマを 消す</button></div>`);
  $('#flClose').onclick = closeModal;
  $('#flOn').onchange = e => { st.timelapse = e.target.checked; saveSettings(); };
  $('#flSec').oninput = e => { st.timelapseSec = +e.target.value; $('#flSecV').textContent = st.timelapseSec + '秒'; saveSettings(); };
  $('#flGo').onclick = () => { closeModal(); exportTimelapse(st.timelapseSec).catch(err => toast('動画に できませんでした: ' + (err.message || err), 3000)); };
  $('#flClear').onclick = async () => {
    if (!await confirmBox('この 作品の タイムラプスの コマを 消しますか？')) return;
    await store.clearFrames(S.work.id); S.work.frames = 0; toast('消しました');
  };
}

/* ================================================================ キーボード */
window.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); E.selOp(0); refreshSel(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); E.selOp(1); refreshSel(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'i') { e.preventDefault(); E.selOp(2); refreshSel(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 't') { e.preventDefault(); cmdTransform(); return; }
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); cmdClear(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); S.unsaved = true; saveNow(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { input.space = true; e.preventDefault(); return; }
  if (k === 'enter' && S.float) { commitFloat(); return; }
  if (k === 'escape' && S.float) { cancelFloat(); return; }
  const tools = { b: 'draw', p: 'draw', e: 'erase', g: 'fill', s: 'select', l: 'lasso', m: 'move', u: 'shape', t: 'text', v: 'verase', w: 'vwidth', i: 'pick' };
  if (tools[k]) { selectTool(tools[k]); return; }
  if (k === '[' || k === ']') {
    const i = currentBrushIndex();
    const v = Math.round(clamp(S.brushes[i].size * (k === ']' ? 1.15 : 1 / 1.15), SIZE_MIN, SIZE_MAX) * 10) / 10;
    E.brushSet(i, 'size', v); S.brushes[i].size = v; syncSliders(); brushesChanged();
    return;
  }
  if (k === 'x') { const t = S.sub; S.sub = S.color; setColor(t); return; }
  if (k === 'h') { toggleFlip(); return; }
  if (k === '0') { fitView(); return; }
  if (k === 'tab') { e.preventDefault(); S.settings.panel = !S.settings.panel; applySettings(); saveSettings(); }
});
window.addEventListener('keyup', e => { if (e.key === ' ') input.space = false; });

window.oekaki = { get engine() { return E; }, state: S };
boot();
