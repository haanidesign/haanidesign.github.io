/* プロジェクトの状態と、Undo。
   Undo はスナップショット方式（ミニSpineで動いている仕組みと同じ）。
   画像そのものは assets の外（imgs）に置いて、スナップショットに含めない。 */

import { uid } from './engine/math.js';

/** SNS でよく使う書き出しサイズ */
export const SIZE_PRESETS = [
  { key:'portrait', label:'たて',     w:1080, h:1920, note:'TikTok\nReels / Shorts' },
  { key:'square',   label:'ましかく', w:1080, h:1080, note:'Instagram\n投稿' },
  { key:'landscape',label:'よこ',     w:1920, h:1080, note:'YouTube\nふつうの動画' }
];

export function newProject(w, h, seconds){
  return {
    ver: 1,
    name: 'むだい',
    w: w || 1080,
    h: h || 1920,
    fps: 30,
    duration: seconds || 15,
    bg: '#FFFEF7',
    layers: [],      // [0] が一番手前
    assets: {}       // id -> { id, name, src, w, h }
  };
}

export const S = {
  proj: newProject(),
  imgs: {},                       // assetId -> HTMLImageElement（保存対象外）
  sel: null,                      // 選択中のレイヤーid
  selPins: { layer:null, times:[] },  // タイムラインで選んでいるピン
  time: 0,
  playing: false,
  ripple: false,                  // ピンをずらすとき、後ろも一緒に動かすか
  pinMode: false,                 // パペットピンをさわっているか
  pinKind: 'move',                // 'move' さす / 'fix' とめる / 'del' けす
  pinSel: -1,                     // 選んでいるパペットピン
  clip: null,                     // コピーしたピン { items:[{dt, chans}] }
  tlZoom: 1,                      // 時間じくのひろがり（1 = 全体が見える）
  view: { x:0, y:0, z:1 },        // ステージの表示位置
  ready: false                    // サイズ選びが終わったか
};

/* ================= Undo ================= */
const UNDO = { stack: [], idx: -1, limit: 40, pending: null };

/* あみ（mesh）と描画用の作業配列は記録しない。
   ピンの位置さえ残っていれば同じものを張り直せるし、
   Float32Array を JSON に入れると巨大になって壊れる。 */
const SKIP = new Set(['mesh', '_xy', 'weights', 'wIdx']);
const snap = () => JSON.stringify(S.proj, (k, v) => SKIP.has(k) ? undefined : v);

/** 変更の直前に呼ぶ。ドラッグ中は最初の1回だけ効く */
export function beginEdit(label){
  if(UNDO.pending) return;
  UNDO.pending = { label, before: snap() };
}

/** 変更の直後に呼ぶ。何も変わっていなければ積まない */
export function commitEdit(){
  const p = UNDO.pending;
  UNDO.pending = null;
  if(!p) return;
  const after = snap();
  if(after === p.before) return;
  UNDO.stack.length = UNDO.idx + 1;
  UNDO.stack.push({ label: p.label, before: p.before, after });
  if(UNDO.stack.length > UNDO.limit) UNDO.stack.shift();
  UNDO.idx = UNDO.stack.length - 1;
  onChange();
}

/** ドラッグを伴わない一発の変更 */
export function edit(label, fn){
  beginEdit(label);
  fn();
  commitEdit();
}

let restoreHook = null;
export function onRestore(fn){ restoreHook = fn; }

function restore(json){
  S.proj = JSON.parse(json);
  if(S.sel && !S.proj.layers.some(l => l.id === S.sel)) S.sel = null;
  if(S.selPins.layer && !S.proj.layers.some(l => l.id === S.selPins.layer)) S.selPins = { layer:null, times:[] };
  if(restoreHook) restoreHook();
}

export function undo(){
  if(UNDO.idx < 0) return null;
  const e = UNDO.stack[UNDO.idx--];
  restore(e.before);
  onChange();
  return e.label;
}

export function redo(){
  if(UNDO.idx >= UNDO.stack.length - 1) return null;
  const e = UNDO.stack[++UNDO.idx];
  restore(e.after);
  onChange();
  return e.label;
}

export const canUndo = () => UNDO.idx >= 0;
export const canRedo = () => UNDO.idx < UNDO.stack.length - 1;
export const undoLabel = () => canUndo() ? UNDO.stack[UNDO.idx].label : '';
/* 手元での確認用 */
export const undoDepth = () => ({ idx: UNDO.idx, size: UNDO.stack.length,
  labels: UNDO.stack.map(e => e.label) });

/* 変更の通知（UIの再描画用） */
const listeners = [];
export function onChange(fn){
  if(typeof fn === 'function'){ listeners.push(fn); return; }
  listeners.forEach(f => f());
}

/* ================= アセット ================= */
export function addAsset(name, src, w, h, img){
  const id = uid('A');
  S.proj.assets[id] = { id, name, src, w, h };
  S.imgs[id] = img;
  return id;
}

export const selected = () => S.proj.layers.find(l => l.id === S.sel) || null;

/** レイヤーの、いま出すべき画像 */
export function frameAsset(layer, frameIndex){
  const id = layer.frames[frameIndex || 0] || layer.frames[0];
  return id ? S.proj.assets[id] : null;
}
export function frameImage(layer, frameIndex){
  const id = layer.frames[frameIndex || 0] || layer.frames[0];
  return id ? S.imgs[id] : null;
}
