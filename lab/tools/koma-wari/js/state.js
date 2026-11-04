/* 作品の 入れもの と もどす／やりなおし。
   もどすは スナップショット方式（作品を まるごと 文字に して とっておく）。 */

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const S = {
  proj: null,
  sel: null,        // { pg, i }  えらんで いる コマ
  sheet: 0,         // いま 見て いる シート
  kind: 'panel',    // せっていの なかみ
};

export function blankProj() {
  return {
    v: 1, title: 'むだい', view: 'spread', firstLeft: true, style: 'real', tilt: 25,
    show: { memo: true, no: true, fig: true, bub: true, se: true },
    cast: [], pages: [], script: '',
  };
}

let toastT = 0;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 1800);
}
export function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } }

/* ---------- もどす ---------- */
const UNDO = [], REDO = [];
let pending = null, changed = () => { };
export function setOnChange(f) { changed = f; }
export function onChange() { changed(); }
const snap = () => JSON.stringify(S.proj);

export function edit(name, fn) {
  const before = snap();
  fn();
  after(name, before);
}
export function beginEdit() { if (pending == null) pending = snap(); }
export function commitEdit(name) {
  if (pending == null) return;
  const b = pending; pending = null;
  after(name, b);
}
function after(name, before) {
  if (snap() !== before) {
    UNDO.push({ name, s: before });
    if (UNDO.length > 80) UNDO.shift();
    REDO.length = 0;
  }
  changed();
}
export function undo() {
  const u = UNDO.pop();
  if (!u) return;
  REDO.push({ name: u.name, s: snap() });
  S.proj = JSON.parse(u.s);
  fixSel(); changed(); toast('もどした：' + u.name);
}
export function redo() {
  const r = REDO.pop();
  if (!r) return;
  UNDO.push({ name: r.name, s: snap() });
  S.proj = JSON.parse(r.s);
  fixSel(); changed(); toast('やりなおし：' + r.name);
}
export const canUndo = () => UNDO.length > 0;
export const canRedo = () => REDO.length > 0;
export function resetHist() { UNDO.length = 0; REDO.length = 0; }
function fixSel() {
  if (!S.sel) return;
  const pg = S.proj.pages[S.sel.pg];
  if (!pg || !pg.panels[S.sel.i]) S.sel = null;
}
export const selPanel = () => S.sel ? (S.proj.pages[S.sel.pg] || {}).panels?.[S.sel.i] || null : null;
