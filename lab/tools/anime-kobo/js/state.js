/* プロジェクトの状態と、Undo。
   Undo はスナップショット方式（ミニSpineで動いている仕組みと同じ）。
   画像そのものは assets の外（imgs）に置いて、スナップショットに含めない。 */

import { uid } from './engine/math.js?v=247';

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
  pick: [],                       // ☑ でえらんだレイヤーid（まとめる用）
  selPins: { layer:null, times:[] },  // タイムラインで選んでいるピン
  time: 0,
  playing: false,
  ripple: false,                  // ピンをずらすとき、後ろも一緒に動かすか
  pinMode: false,                 // パペットピンをさわっているか
  traceMode: false,               // みちを なぞっているか
  paintMode: false,               // おえかき中か
  warpMode: null,                 // 'free' 自由変形 / 'warp' ゆがみ / null
  warpSoft: 1.2,                  // ゆがみの やわらかさ（まわりが どれだけ ついてくるか）
  warpSel: -1,                    // つまんでいる あみの目
  warpDrag: null,                 // いま 引っぱって いる レイヤーの id
  lockBrush: 0.18,                // 筆の 太さ（絵の みじかいほうの 何わり か）
  lockErase: false,               // 筆で とかす がわに なっているか
  brushAt: null,                  // 筆の いま いる ところ（絵の中）
  warpHint: null,                 // 2本指の いま（まわす 30° など）
  spanEdit: null,                 // 長さを 調節している レイヤーの id
  penColor: '#1E1C14',            // ペンの色
  penWidth: 12,                   // ペンの ふとさ
  penErase: false,                // けしゴムに なっているか
  tracePts: null,                 // なぞった あと（キャンバスざひょう）
  train: null,                    // 🚂 一文字ずつ 走らせる とちゅう { chars, from }
  maskFor: null,                  // ✂ マスクを かこんで いる さいちゅうの レイヤーid
  outside: true,                  // 編集中、枠の そとも 見せるか
  paperDots: true,                // 編集中、紙の 方眼（うすい点）を 出すか
  pinKind: 'move',                // 'move' さす / 'fix' とめる / 'del' けす
  pinSel: -1,                     // 選んでいるパペットピン
  clip: null,                     // コピーしたピン { items:[{dt, chans}] }
  layerClip: null,                // コピーしたレイヤー
  tlZoom: 1,                      // 時間じくのひろがり（1 = 全体が見える）
  view: { x:0, y:0, z:1 },        // ステージの表示位置
  ready: false,                   // サイズ選びが終わったか
  docId: null                     // いま ひらいている さくひんの ばんごう
};

/* ================= Undo ================= */
const UNDO = { stack: [], idx: -1, limit: 40, pending: null };

/* あみ（mesh）と描画用の作業配列は記録しない。
   ピンの位置さえ残っていれば同じものを張り直せるし、
   Float32Array を JSON に入れると巨大になって壊れる。 */
/* ここに 入れた ものは「ほぞんしない・もどす にも のこさない」。
   ・あみ や 紙（canvas）は もとの データから 作り直せる
   ・canvas は そのままでは ほぞん できない
     （IndexedDB に 入れようとすると エラーに なる）
   ふえたら かならず ここに 足す こと。 */
export const WORK_KEYS = new Set([
  'mesh', '_xy', 'weights', 'wIdx',     // パペットピンの あみ
  '_hmesh', '_hbase', '_bxy',           // 手がき風の あみ
  '_pc', '_pkey',                       // おえかきの 紙
  '_cmesh', '_cxy', '_ckey',            // ゆがみの あみ
  '_wmesh', '_wuv', '_wkey',            // ゆがみ＋骨の あみ
  '_cuv', '_puv',                       // フォルダを まとめた 別紙の はりどころ
  '_pnSrc', '_pnKey', '_pnW', '_pnH',   // ぐるり360の もとの 絵（よこ2まい）
  '_pnMesh', '_pnXY', '_pnUV',          // ぐるり360の あみ
  '_rmC', '_rmKey', '_rmMesh',          // 🏠 部屋の 紙と あみ
  '_rmXY', '_rmUV', '_rmOK',
  '_tkC', '_tkKey',                     // 💬 セリフ枠の 紙
  '_mip', '_mipKey',                    // 小さくした 写し（ちらつき よけ）
  '_q3xy', '_q3flat',                   // 立体（3D）で 四すみに はめた あと
  '_blC', '_blKey', '_blMesh',          // 🔮 球に はった あとの 紙と あみ
  '_blXY', '_blUV', '_blZ', '_blSp', '_blSpKey', '_blMip', '_blMipKey'
]);

/** 作業だけの ものを のぞいた 写しを 作る（ほぞん・もどす で つかう） */
export function plain(obj){
  return JSON.parse(JSON.stringify(obj, (k, v) => WORK_KEYS.has(k) ? undefined : v));
}

const SKIP = WORK_KEYS;
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
  /* どの さくひんの ぶんか を おぼえて おく（念のための おさえ）。
     切りかえの ときに 捨てて いる が、万一 のこって いても
     よその さくひんへ もどって しまわない ように する。 */
  UNDO.stack.push({ label: p.label, before: p.before, after, doc: S.docId });
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
  S.pick = S.pick.filter(id => S.proj.layers.some(l => l.id === id));
  if(S.selPins.layer && !S.proj.layers.some(l => l.id === S.selPins.layer)) S.selPins = { layer:null, times:[] };
  if(restoreHook) restoreHook();
}

export function undo(){
  if(UNDO.idx < 0) return null;
  const e = UNDO.stack[UNDO.idx--];
  if(e.doc && S.docId && e.doc !== S.docId){ resetUndo(); return null; }
  restore(e.before);
  onChange();
  return e.label;
}

export function redo(){
  if(UNDO.idx >= UNDO.stack.length - 1) return null;
  const e = UNDO.stack[++UNDO.idx];
  if(e.doc && S.docId && e.doc !== S.docId){ resetUndo(); return null; }
  restore(e.after);
  onChange();
  return e.label;
}

/* さくひんを 切りかえたら、もどす 履歴は 捨てる。

   のこして おくと、2本指で もどしつづけた とき
   「前に ひらいて いた べつの さくひん」の 姿まで もどって しまう。
   しかも その まま じどう保存が かかる ので、
   いまの さくひんが 前の さくひんの 中みに 入れかわって しまう。
   （じっさいに 起きた） */
export function resetUndo(){
  UNDO.stack.length = 0;
  UNDO.idx = -1;
  UNDO.pending = null;
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

/* ---------- 画質 ----------
   玉や 部屋は 三角を たくさん 貼る ので、つまみを 動かして いる あいだ
   だけ あらく すると 手ざわりが 軽く なる。
     fine  … いつも きれい
     auto  … さわって いる あいだ だけ あらく（はじめは これ）
     light … いつも あらく（古い 端末むけ）
   S.dragging は つまみを つまんで いる あいだ true。 */
export const isDraft = () => {
  const q = (S.proj && S.proj.quality) || 'auto';
  if(q === 'light') return true;
  if(q === 'fine') return false;
  return !!(S.dragging || S.playing);
};

export const selected = () => S.proj.layers.find(l => l.id === S.sel) || null;

/** 自分で 紙に 描く レイヤー（おえかき・いろ） */
const paintKind = (l) => !!l && (l.kind === 'paint' || l.kind === 'solid' || l.kind === 'pano' || l.kind === 'room' || l.kind === 'talk');

/** レイヤーの、いま出すべき画像。
    おえかき・いろ の レイヤーは ファイルを 持たないので、
    その場で 作った 紙を「絵」として かえす。 */
export function frameAsset(layer, frameIndex){
  if(paintKind(layer)) return { id: '#' + layer.id, name: layer.name, w: layer.pw, h: layer.ph };
  const id = layer.frames[frameIndex || 0] || layer.frames[0];
  return id ? S.proj.assets[id] : null;
}
export function frameImage(layer, frameIndex){
  if(layer && layer.kind === 'room') return layer._rmC || null;
  if(layer && layer.kind === 'talk') return layer._tkC || null;
  if(paintKind(layer)) return layer._pc || null;
  const id = layer.frames[frameIndex || 0] || layer.frames[0];
  return id ? S.imgs[id] : null;
}
