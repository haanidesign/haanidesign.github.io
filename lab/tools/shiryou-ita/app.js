/* 資料いた。1まいの いたに 画像を ならべて 見る。 */
import { watchRanges } from '../oekaki-kobo/js/rslider.js';

const app = document.getElementById('app');
const $ = id => app.querySelector('#' + id);
const stage = $('stage'), board = $('board');
const body = () => app.ownerDocument.body;
const cls = (c, on) => body().classList.toggle(c, on);
// Android の アプリの 中で 動く とき（ほかの アプリの 上に うく 窓）
const N = window.Native || null;

/* ---------- 入れもの ---------- */
const S = {
  items: [],             // {id,key,w,h,x,y,s,r,cl,ct,cr,cb}
  view: { x: 0, y: 0, z: 1, rot: 0, f: 1 },
  locked: false, bg: '#5a5a60', ghost: 25, glass: 55,
};
const assets = new Map(); // key -> {blob, url}
let sel = null, cropping = false, seq = 1;

/* ---------- しまう（IndexedDB） ---------- */
let dbp = null;
function db() {
  return dbp ||= new Promise((ok, ng) => {
    const r = indexedDB.open('shiryou-ita', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('a'); r.result.createObjectStore('b'); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
}
async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((ok, ng) => {
    const t = d.transaction(store, mode), q = fn(t.objectStore(store));
    t.oncomplete = () => ok(q && q.result); t.onerror = () => ng(t.error);
  });
}
let saveT = 0;
function autosave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const { items, view, locked, bg, ghost, glass } = S;
    idb('b', 'readwrite', s => s.put({ items, view, locked, bg, ghost, glass, seq }, 'board')).catch(() => {});
  }, 400);
}

/* ---------- 画像 ---------- */
// 表示用は 小さく した 写しを 使う（もとの 画像は しまって おくだけ）。画像が 増えても 軽い
const SHOW_MAX = 1400;
async function showUrl(blob) {
  try {
    const bm = await createImageBitmap(blob);
    const k = Math.min(1, SHOW_MAX / Math.max(bm.width, bm.height));
    const w = bm.width, h = bm.height;
    if (k >= 1) { bm.close(); return { url: URL.createObjectURL(blob), w, h }; }
    const c = new OffscreenCanvas(Math.round(w * k), Math.round(h * k));
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    bm.close();
    const small = await c.convertToBlob({ type: 'image/webp', quality: .9 });
    return { url: URL.createObjectURL(small), w, h };
  } catch {
    const url = URL.createObjectURL(blob);
    const im = new Image(); im.src = url; await im.decode();
    return { url, w: im.naturalWidth, h: im.naturalHeight };
  }
}
async function loadAsset(key, blob) {
  const r = await showUrl(blob);
  assets.set(key, { blob, url: r.url });
  return r;
}
async function addBlobs(blobs, at) {
  // Android の ファイル選びでは 種類が 空の ことが ある ので、空でも 読んで みる
  blobs = blobs.filter(b => b && (!b.type || b.type.startsWith('image/')));
  if (!blobs.length) return;
  const before = snap();
  const c = at || toBoard(app.clientWidth / 2, app.clientHeight / 2);
  let i = 0, bad = 0;
  for (const blob of blobs) {
    const key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    let r;
    try { r = await loadAsset(key, blob); } catch { bad++; continue; }
    await idb('a', 'readwrite', s => s.put(blob, key)).catch(() => {});
    const fit = Math.min(1, (app.clientWidth * .45) / S.view.z / r.w, (app.clientHeight * .45) / S.view.z / r.h);
    const it = { id: seq++, key, w: r.w, h: r.h, x: c.x + i * 30, y: c.y + i * 30, s: fit, r: -S.view.rot * S.view.f, cl: 0, ct: 0, cr: 0, cb: 0 };
    S.items.push(it); i++;
    sel = it.id;
  }
  if (bad) { toast(`${bad}まい よめません でした`); await new Promise(r => setTimeout(r, 1500)); }
  pushUndo(before);
  render(); autosave();
}

/* ---------- 座標 ---------- */
const rad = d => d * Math.PI / 180;
function toBoard(sx, sy) {
  const v = S.view, a = -rad(v.rot);
  let dx = sx - v.x, dy = sy - v.y;
  let x = (dx * Math.cos(a) - dy * Math.sin(a)) / v.z, y = (dx * Math.sin(a) + dy * Math.cos(a)) / v.z;
  return { x: x * v.f, y };
}
function fromBoard(bx, by) {
  const v = S.view, a = rad(v.rot);
  const x = bx * v.f * v.z, y = by * v.z;
  return { x: v.x + x * Math.cos(a) - y * Math.sin(a), y: v.y + x * Math.sin(a) + y * Math.cos(a) };
}
// 画面の ずれ → 画像の 中の ずれ
function toLocal(it, dx, dy) {
  const o = toBoard(0, 0), p = toBoard(dx, dy);
  let bx = p.x - o.x, by = p.y - o.y;
  const a = -rad(it.r);
  return { x: (bx * Math.cos(a) - by * Math.sin(a)) / it.s, y: (bx * Math.sin(a) + by * Math.cos(a)) / it.s };
}
const cw = it => it.w * (1 - it.cl - it.cr), ch = it => it.h * (1 - it.ct - it.cb);

/* ---------- 描く ---------- */
const els = new Map();
function render() {
  const v = S.view;
  board.style.transform = `translate(${v.x}px,${v.y}px) rotate(${v.rot}deg) scale(${v.z * v.f},${v.z})`;
  app.style.setProperty('--bg', S.bg); document.documentElement.style.setProperty('--bg', S.bg);
  const alive = new Set();
  S.items.forEach((it, i) => {
    alive.add(it.id);
    let e = els.get(it.id);
    if (!e) {
      e = document.createElement('div');
      e.className = 'it';
      e.dataset.id = it.id;
      e.innerHTML = '<div class="clip"><img decoding="async" draggable="false"></div>' +
        '<i class="h k rz" data-h="rz"></i><i class="h k rt" data-h="rt"></i>' +
        '<i class="h c l" data-h="l"></i><i class="h c r" data-h="r"></i><i class="h c t" data-h="t"></i><i class="h c b" data-h="b"></i>';
      els.set(it.id, e);
    }
    const im = e.querySelector('img'), a = assets.get(it.key);
    if (a && im.getAttribute('src') !== a.url) im.src = a.url;
    const W = cw(it), H = ch(it);
    e.style.width = W + 'px'; e.style.height = H + 'px';
    e.style.transform = `translate(${it.x}px,${it.y}px) rotate(${it.r}deg) scale(${it.s}) translate(${-W / 2}px,${-H / 2}px)`;
    im.style.width = it.w + 'px'; im.style.height = it.h + 'px';
    im.style.left = -it.cl * it.w + 'px'; im.style.top = -it.ct * it.h + 'px';
    e.style.setProperty('--inv', 1 / (v.z * it.s));
    e.classList.toggle('sel', sel === it.id);
    e.classList.toggle('crop', sel === it.id && cropping);
    if (board.children[i] !== e) board.insertBefore(e, board.children[i] || null);
  });
  for (const [id, e] of els) if (!alive.has(id)) { e.remove(); els.delete(id); }
  if (!S.items.some(i => i.id === sel)) { sel = null; cropping = false; }
  cls('has-sel', sel != null && !S.locked);
  cls('cropping', cropping);
  $('hint').style.display = S.items.length ? 'none' : '';
  const lk = app.querySelector('[data-a=lock]');
  lk.classList.toggle('on', S.locked);
}

/* ---------- もどす ---------- */
const undo = [], redo = [];
const snap = () => JSON.stringify(S.items);
function pushUndo(before) {
  if (before === snap()) return;
  undo.push(before); if (undo.length > 60) undo.shift();
  redo.length = 0;
}
function doUndo(back) {
  const from = back ? undo : redo, to = back ? redo : undo;
  if (!from.length) { toast(back ? 'もどせません' : 'やり直せません'); return; }
  to.push(snap());
  S.items = JSON.parse(from.pop());
  render(); autosave();
}

/* ---------- さわる ---------- */
const P = new Map();      // pointerId -> {x,y}
let g = null;             // いまの うごき
let tap = null;           // 何本指タップか
let lastTap = 0;
const item = id => S.items.find(i => i.id === id);

function startGesture() {
  const pts = [...P.values()];
  const v = { ...S.view };
  if (pts.length >= 2) {
    const [a, b] = pts;
    const d = Math.hypot(b.x - a.x, b.y - a.y), an = Math.atan2(b.y - a.y, b.x - a.x);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const it = item(sel);
    if (it && !S.locked && g && g.type === 'move' && g.id === it.id) {
      g = { type: 'pinchItem', it, d, an, mid, o: { ...it }, before: g.before };
    } else {
      g = { type: 'pinchView', d, an, mid, v, b: toBoard(mid.x, mid.y), before: g && g.before };
    }
  }
}

stage.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  cls('sheet', false);
  stage.setPointerCapture(e.pointerId);
  P.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // タップの 本数を かぞえる
  if (!tap || P.size === 1) tap = { n: 0, t: performance.now(), moved: false };
  tap.n = Math.max(tap.n, P.size);
  if (P.size === 1) {
    const before = snap();
    const h = e.target.closest('.h'), ie = e.target.closest('.it');
    if (h && ie) {
      const it = item(+ie.dataset.id);
      const r = ie.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      g = { type: 'h', h: h.dataset.h, it, o: { ...it }, sx: e.clientX, sy: e.clientY, c,
        d0: Math.hypot(e.clientX - c.x, e.clientY - c.y), a0: Math.atan2(e.clientY - c.y, e.clientX - c.x), before };
    } else if (ie && !S.locked) {
      const it = item(+ie.dataset.id);
      if (sel !== it.id) cropping = false;
      sel = it.id;
      g = { type: 'move', id: it.id, it, o: { ...it }, sx: e.clientX, sy: e.clientY, before };
      render();
    } else {
      g = { type: 'pan', sx: e.clientX, sy: e.clientY, v: { ...S.view }, empty: !ie, before };
    }
  } else startGesture();
});

stage.addEventListener('pointermove', e => {
  if (!P.has(e.pointerId)) return;
  P.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!g) return;
  if (g.sx != null && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) tap && (tap.moved = true);
  const v = S.view;
  if (g.type === 'pan') {
    v.x = g.v.x + e.clientX - g.sx; v.y = g.v.y + e.clientY - g.sy;
  } else if (g.type === 'move') {
    const a = toBoard(g.sx, g.sy), b = toBoard(e.clientX, e.clientY);
    g.it.x = g.o.x + b.x - a.x; g.it.y = g.o.y + b.y - a.y;
  } else if (g.type === 'h') {
    const it = g.it, o = g.o;
    if (g.h === 'rz') {
      it.s = Math.max(.02, o.s * Math.hypot(e.clientX - g.c.x, e.clientY - g.c.y) / Math.max(1, g.d0));
    } else if (g.h === 'rt') {
      let da = (Math.atan2(e.clientY - g.c.y, e.clientX - g.c.x) - g.a0) * 180 / Math.PI;
      it.r = o.r + da * v.f;
      if (!e.shiftKey) { const s = Math.round(it.r / 90) * 90; if (Math.abs(it.r - s) < 4) it.r = s; }
    } else {
      // きりとり。見えて いる ぶんが ずれない よう 中心も うごかす
      const l = toLocal(it, e.clientX - g.sx, e.clientY - g.sy);
      const k = { ...o };
      const lim = (x) => Math.max(0, Math.min(.98, x));
      if (g.h === 'l') k.cl = lim(Math.min(o.cl + l.x / o.w, 1 - o.cr - .02));
      if (g.h === 'r') k.cr = lim(Math.min(o.cr - l.x / o.w, 1 - o.cl - .02));
      if (g.h === 't') k.ct = lim(Math.min(o.ct + l.y / o.h, 1 - o.cb - .02));
      if (g.h === 'b') k.cb = lim(Math.min(o.cb - l.y / o.h, 1 - o.ct - .02));
      const mx = ((k.cl - o.cl) - (k.cr - o.cr)) * o.w / 2 * o.s, my = ((k.ct - o.ct) - (k.cb - o.cb)) * o.h / 2 * o.s;
      const a = rad(o.r);
      Object.assign(it, { cl: k.cl, cr: k.cr, ct: k.ct, cb: k.cb,
        x: o.x + mx * Math.cos(a) - my * Math.sin(a), y: o.y + mx * Math.sin(a) + my * Math.cos(a) });
    }
  } else if (g.type === 'pinchView' || g.type === 'pinchItem') {
    const [a, b] = [...P.values()];
    const d = Math.hypot(b.x - a.x, b.y - a.y), an = Math.atan2(b.y - a.y, b.x - a.x);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (Math.abs(d - g.d) > 8 || Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) > 8) tap && (tap.moved = true);
    const da = (an - g.an) * 180 / Math.PI;
    if (g.type === 'pinchView') {
      v.z = Math.max(.03, Math.min(30, g.v.z * d / g.d));
      v.rot = S.locked ? g.v.rot + da : g.v.rot;
      v.f = g.v.f;
      const p = fromBoardWith(g.b, v);
      v.x += mid.x - p.x; v.y += mid.y - p.y;
    } else {
      const it = g.it, o = g.o;
      it.s = Math.max(.02, o.s * d / g.d);
      it.r = o.r + da * v.f;
      const m0 = toBoard(g.mid.x, g.mid.y), m1 = toBoard(mid.x, mid.y);
      it.x = o.x + m1.x - m0.x; it.y = o.y + m1.y - m0.y;
    }
  }
  render();
});
function fromBoardWith(b, v) {
  const a = rad(v.rot), x = b.x * v.f * v.z, y = b.y * v.z;
  return { x: v.x + x * Math.cos(a) - y * Math.sin(a), y: v.y + x * Math.sin(a) + y * Math.cos(a) };
}

function up(e) {
  if (!P.has(e.pointerId)) return;
  P.delete(e.pointerId);
  if (P.size) {
    // 2本 → 1本: いったん 止めて 残った 指で つづけない（はねるのを ふせぐ）
    if (g && g.type !== 'pan') g = { type: 'none', before: g.before };
    else if (P.size >= 2) startGesture();
    return;
  }
  // 指が ぜんぶ はなれた
  if (tap && !tap.moved && performance.now() - tap.t < 350) {
    const now = performance.now();
    if (tap.n >= 2 && now - lastTap > 500) { lastTap = now; doUndo(tap.n === 2); tap = null; g = null; return; }
    if (tap.n === 1 && g && g.type === 'pan' && g.empty) { sel = null; cropping = false; }
  }
  if (g && g.before != null) pushUndo(g.before);
  g = null; tap = null;
  render(); autosave();
}
stage.addEventListener('pointerup', up);
stage.addEventListener('pointercancel', up);

stage.addEventListener('wheel', e => {
  e.preventDefault();
  const v = S.view;
  if (e.ctrlKey || !e.shiftKey) {
    const b = toBoard(e.clientX, e.clientY);
    v.z = Math.max(.03, Math.min(30, v.z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))));
    const p = fromBoard(b.x, b.y);
    v.x += e.clientX - p.x; v.y += e.clientY - p.y;
  } else { v.x -= e.deltaX; v.y -= e.deltaY; }
  render(); autosave();
}, { passive: false });

/* ---------- ボタン ---------- */
const act = {
  menu: () => cls('sheet', !body().classList.contains('sheet')),
  lock: () => { S.locked = !S.locked; if (S.locked) { cropping = false; } toast(S.locked ? 'ロック 中（2本指で 回せる）' : 'ロック とき'); render(); autosave(); },
  fit, flip, rot0,
  mini: () => { if (N) return N.minimize(); cls('mini', true); pipSize(80, 80); },
  unmini: () => { cls('mini', false); pipSize(); },
  ghost: () => { if (N) return N.ghost(S.ghost); cls('ghost', !body().classList.contains('ghost')); },
  pip: openPip,
  desel: () => { if (N) return N.close(); sel = null; cropping = false; cls('sheet', false); render(); },
  add: () => { cls('sheet', false); $('fImg').click(); },
  paste: pasteBtn,
  undo: () => doUndo(true), redo: () => doUndo(false),
  crop: () => { cropping = !cropping; render(); },
  uncrop: () => editSel(it => {
    const a = rad(it.r), mx = (it.cl - it.cr) * it.w / 2 * it.s, my = (it.ct - it.cb) * it.h / 2 * it.s;
    it.x -= mx * Math.cos(a) - my * Math.sin(a); it.y -= mx * Math.sin(a) + my * Math.cos(a);
    it.cl = it.ct = it.cr = it.cb = 0;
  }),
  front: () => editSel(it => { S.items.splice(S.items.indexOf(it), 1); S.items.push(it); }),
  back: () => editSel(it => { S.items.splice(S.items.indexOf(it), 1); S.items.unshift(it); }),
  del: () => editSel(it => { S.items.splice(S.items.indexOf(it), 1); sel = null; }),
  png: exportPng, save: saveJson,
  open: () => $('fJson').click(),
  clear: () => { if (!confirm('ぜんぶ 消しますか？')) return; const b = snap(); S.items = []; pushUndo(b); render(); autosave(); cls('sheet', false); },
};
function editSel(fn) {
  const it = item(sel); if (!it) return;
  const b = snap(); fn(it); pushUndo(b); render(); autosave();
}
app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (b && act[b.dataset.a]) act[b.dataset.a]();
});
// ゴースト中でも ゴーストの ボタンは きく（#app ごと すけて いるため 別に 受ける）
$('ghostBtn').addEventListener('pointerdown', e => e.stopPropagation());

function center() { return toBoard(app.clientWidth / 2, app.clientHeight / 2); }
function keepAt(b, sx, sy) { const p = fromBoard(b.x, b.y); S.view.x += sx - p.x; S.view.y += sy - p.y; }
function flip() {
  const b = center(); S.view.f *= -1; keepAt(b, app.clientWidth / 2, app.clientHeight / 2); render(); autosave();
  toast(S.view.f < 0 ? '左右 はんてん 中' : '左右 もどした');
}
function rot0() { const b = center(); S.view.rot = 0; keepAt(b, app.clientWidth / 2, app.clientHeight / 2); render(); autosave(); }
function bbox(list = S.items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of list) {
    const a = rad(it.r), W = cw(it) * it.s / 2, H = ch(it) * it.s / 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = it.x + sx * W * Math.cos(a) - sy * H * Math.sin(a), y = it.y + sx * W * Math.sin(a) + sy * H * Math.cos(a);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}
function fit() {
  if (!S.items.length) return;
  const b = bbox(), W = app.clientWidth, H = app.clientHeight, pad = 70;
  S.view.rot = 0;
  S.view.z = Math.min((W - 40) / (b.x1 - b.x0), (H - pad * 2) / (b.y1 - b.y0));
  keepAt({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, W / 2, H / 2 + 10);
  render(); autosave();
}

/* ---------- 入れる ---------- */
$('fImg').addEventListener('change', e => { addBlobs([...e.target.files]); e.target.value = ''; });
// Android: えらんだ 画像を アプリ側から 受けとる
window.__picked = async ids => {
  const out = [];
  for (const id of ids) {
    try { const r = await fetch('/pick/' + id); if (r.ok) out.push(await r.blob()); } catch {}
  }
  if (out.length < ids.length) toast(`${ids.length}まい の うち ${ids.length - out.length}まい よめません でした`);
  await addBlobs(out);
  toast(`${ids.length}まい えらんで ${out.length}まい 入れました`);
};
function onPaste(e) {
  const fs = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile());
  if (fs.length) { e.preventDefault(); addBlobs(fs); }
}
async function pasteBtn() {
  cls('sheet', false);
  if (N) {
    const d = await new Promise(ok => { window.__clip = ok; N.clipImage(); });
    if (d) addBlobs([await (await fetch(d)).blob()]); else toast('クリップボードに 画像が ありません');
    return;
  }
  try {
    const out = [];
    for (const c of await navigator.clipboard.read())
      for (const t of c.types) if (t.startsWith('image/')) out.push(await c.getType(t));
    if (out.length) addBlobs(out); else toast('クリップボードに 画像が ありません');
  } catch { toast('はりつけ できません（Ctrl+V を ためして ください）'); }
}
async function urlToBlob(url) {
  try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) { const b = await r.blob(); if (b.type.startsWith('image/')) return b; } } catch {}
  return new Promise(ok => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0); c.toBlob(ok, 'image/png');
      } catch { ok(null); }
    };
    im.onerror = () => ok(null); im.src = url;
  });
}
function bindDoc(doc) {
  doc.addEventListener('paste', onPaste);
  doc.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); doUndo(!e.shiftKey); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doUndo(false); }
    else if (k === 'delete' || k === 'backspace') act.del();
    else if (k === 'h') flip();
    else if (k === 'g') act.ghost();
    else if (k === 'f') fit();
  });
  let dn = 0;
  doc.addEventListener('dragenter', e => { e.preventDefault(); dn++; app.classList.add('drop'); });
  doc.addEventListener('dragleave', () => { if (--dn <= 0) { dn = 0; app.classList.remove('drop'); } });
  doc.addEventListener('dragover', e => e.preventDefault());
  doc.addEventListener('drop', async e => {
    e.preventDefault(); dn = 0; app.classList.remove('drop');
    const at = toBoard(e.clientX, e.clientY);
    const fs = [...e.dataTransfer.files];
    const js = fs.find(f => f.name.endsWith('.json'));
    if (js) return openJson(js);
    if (fs.length) return addBlobs(fs, at);
    // ブラウザから 画像を 持って きた とき
    let url = '';
    const html = e.dataTransfer.getData('text/html');
    if (html) { const m = html.match(/<img[^>]+src=["']([^"']+)/i); if (m) url = m[1].replace(/&amp;/g, '&'); }
    url ||= (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0].trim();
    if (!/^(https?:|data:|blob:)/.test(url)) return;
    toast('よみこみ 中…');
    const b = await urlToBlob(url);
    if (b) addBlobs([b], at); else toast('この 画像は 持って これません（保存してから 入れてね）');
  });
}
bindDoc(document);

/* ---------- 保存 ---------- */
function blobToData(b) { return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); }
async function download(blob, name) {
  if (N) {
    const d = await blobToData(blob);
    toast(N.saveFile(name, blob.type, d.slice(d.indexOf(',') + 1)) ? 'ダウンロード に 保存しました' : '保存 できません でした');
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
const stampName = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
async function saveJson() {
  cls('sheet', false); toast('まとめ 中…');
  const keys = [...new Set(S.items.map(i => i.key))], data = {};
  for (const k of keys) { const a = assets.get(k); if (a) data[k] = await blobToData(a.blob); }
  const { items, view, locked, bg } = S;
  download(new Blob([JSON.stringify({ app: 'shiryou-ita', v: 1, items, view, locked, bg, assets: data })], { type: 'application/json' }), `shiryou-${stampName()}.json`);
}
$('fJson').addEventListener('change', e => { const f = e.target.files[0]; if (f) openJson(f); e.target.value = ''; });
async function openJson(f) {
  cls('sheet', false);
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.items)) throw 0;
    toast('ひらいて います…');
    for (const [k, d] of Object.entries(j.assets || {})) {
      const b = await (await fetch(d)).blob();
      await loadAsset(k, b); await idb('a', 'readwrite', s => s.put(b, k)).catch(() => {});
    }
    const before = snap();
    S.items = j.items; if (j.view) S.view = j.view; S.locked = !!j.locked; if (j.bg) S.bg = j.bg;
    seq = Math.max(seq, ...S.items.map(i => i.id + 1));
    pushUndo(before); sel = null; render(); autosave(); cleanAssets();
  } catch { toast('ひらけません でした'); }
}
async function exportPng() {
  cls('sheet', false);
  if (!S.items.length) return toast('画像が ありません');
  toast('かきだし 中…');
  const b = bbox();
  let k = Math.min(1, 8000 / (b.x1 - b.x0), 8000 / (b.y1 - b.y0));
  const c = document.createElement('canvas');
  c.width = Math.ceil((b.x1 - b.x0) * k); c.height = Math.ceil((b.y1 - b.y0) * k);
  const x = c.getContext('2d');
  x.fillStyle = S.bg; x.fillRect(0, 0, c.width, c.height);
  if (S.view.f < 0) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.scale(k, k); x.translate(-b.x0, -b.y0);
  for (const it of S.items) {
    const a = assets.get(it.key); if (!a) continue;
    const bm = await createImageBitmap(a.blob);
    const sx = bm.width / it.w;
    x.save(); x.translate(it.x, it.y); x.rotate(rad(it.r)); x.scale(it.s, it.s);
    const W = cw(it), H = ch(it);
    x.drawImage(bm, it.cl * bm.width, it.ct * bm.height, W * sx, H * sx, -W / 2, -H / 2, W, H);
    x.restore(); bm.close();
  }
  c.toBlob(bl => download(bl, `shiryou-${stampName()}.png`), 'image/png');
}
// もう 使って いない 画像を すてる
async function cleanAssets() {
  const used = new Set(S.items.map(i => i.key));
  for (const u of undo.concat(redo)) for (const i of JSON.parse(u)) used.add(i.key);
  const keys = await idb('a', 'readonly', s => s.getAllKeys()).catch(() => []);
  for (const k of keys || []) if (!used.has(k)) {
    await idb('a', 'readwrite', s => s.delete(k)).catch(() => {});
    const a = assets.get(k); if (a) { URL.revokeObjectURL(a.url); assets.delete(k); }
  }
}

/* ---------- うかせる（Document Picture-in-Picture。PC の Chrome・Edge） ---------- */
let pip = null;
async function openPip() {
  if (pip) { pip.close(); return; }
  if (!('documentPictureInPicture' in window)) {
    toast('この ブラウザでは うかせられません（PC の Chrome・Edge なら できます）');
    return;
  }
  pip = await documentPictureInPicture.requestWindow({ width: 420, height: 640 });
  for (const n of document.head.querySelectorAll('link[rel=stylesheet],style')) {
    const c = n.cloneNode(true); if (c.href) c.href = n.href; pip.document.head.appendChild(c);
  }
  pip.document.body.className = document.body.className;
  pip.document.body.appendChild(app);
  bindDoc(pip.document);
  new ResizeObserver(() => render()).observe(app);
  app.querySelector('[data-a=pip]').classList.add('on');
  pip.addEventListener('pagehide', () => {
    document.body.className = pip.document.body.className;
    document.body.prepend(app);
    pip = null;
    app.querySelector('[data-a=pip]').classList.remove('on');
    render();
  });
}
let pipWH = null;
function pipSize(w, h) {
  if (!pip) return;
  try {
    if (w) { pipWH = [pip.outerWidth, pip.outerHeight]; pip.resizeTo(w, h); }
    else if (pipWH) pip.resizeTo(...pipWH);
  } catch {}
}

/* ---------- 設定 ---------- */
const BGS = ['#5a5a60', '#2b2b2f', '#8a8a90', '#e9e7dc', '#ffffff', '#3d4a5c', '#4f5b4a'];
$('bgs').innerHTML = BGS.map(c => `<i style="background:${c}" data-c="${c}"></i>`).join('');
$('bgs').addEventListener('click', e => { const c = e.target.dataset.c; if (c) { S.bg = c; paintSet(); render(); autosave(); } });
$('ghostA').addEventListener('input', e => { S.ghost = +e.target.value; paintSet(); autosave(); });
$('glassA').addEventListener('input', e => { S.glass = +e.target.value; paintSet(); autosave(); });
function paintSet() {
  for (const el of [document.documentElement, app]) {
    el.style.setProperty('--ghost', S.ghost / 100);
    el.style.setProperty('--g', S.glass / 100);
  }
  if (pip) pip.document.documentElement.style.setProperty('--ghost', S.ghost / 100);
  [...$('bgs').children].forEach(i => i.classList.toggle('on', i.dataset.c === S.bg));
}

/* ---------- 知らせ ---------- */
let toastT = 0;
function toast(s) {
  const t = $('toast'); t.textContent = s; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

/* ---------- はじめ ---------- */
(async () => {
  watchRanges();
  try {
    const b = await idb('b', 'readonly', s => s.get('board'));
    if (b) {
      Object.assign(S, b); seq = b.seq || 1;
      for (const it of S.items) {
        if (assets.has(it.key)) continue;
        const blob = await idb('a', 'readonly', s => s.get(it.key));
        if (blob) await loadAsset(it.key, blob);
      }
      S.items = S.items.filter(i => assets.has(i.key));
    } else {
      S.view.x = app.clientWidth / 2; S.view.y = app.clientHeight / 2;
    }
  } catch {}
  $('ghostA').value = S.ghost; $('glassA').value = S.glass;
  paintSet(); render(); cleanAssets();
})();
addEventListener('resize', render);
if (N) {
  body().classList.add('native');
  // 上の 帯の すきまを つまむと 窓が 動く。右下の つまみで 大きさ。動かすのは Android 側
  for (const [el, k] of [[$('bar'), 1], [$('grip'), 2]]) {
    el.addEventListener('pointerdown', e => {
      if (k === 1 && e.target.closest('button')) return;
      e.preventDefault();
      N.drag(k);
    });
  }
} else if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
