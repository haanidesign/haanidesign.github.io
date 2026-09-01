/* 起動と組み立て。 */

import { M } from './engine/math.js?v=120';
import { S, newProject, onChange, onRestore, undo, redo, edit,
         canUndo, canRedo, undoLabel, undoDepth, selected, frameAsset } from './state.js?v=120';
import { groupInto, ungroup, isFolder, membersOf,
         copyLayers, pasteLayers, removeLayers, computeAll } from './engine/layer.js?v=120';
import { createStage } from './ui/stage.js?v=120';
import { createRenderer } from './render/renderer.js?v=120';
import { createTimeline } from './ui/timeline.js?v=120';
import { fmtTime } from './engine/anim.js?v=120';
import { createSheet, buildLayerSheet, buildMotionSheet, buildTextSheet,
         buildEnterSheet, buildLoopSheet, buildTraceSheet, buildBeatSheet,
         buildFinishSheet,
         buildParentSheet, buildDocSheet, buildBgSheet, buildFaceSheet, clipRow,
         buildExportSheet, buildEaseSheet, buildDoneSheet,
         setParentOpener, setBgPicker,
         setAudioPicker, setBusy, setPlayer, setTracer, setFrameAdder,
         setNotifier, buildPathSheet, buildPaintSheet, setPainter,
         setEaseAsker, colorPick, buildFlipSheet, setSpanner,
         setWarper } from './ui/sheet.js?v=120';

import { showNewDoc } from './ui/newdoc.js?v=120';
import { addImageFiles, addFramesToLayer, loadImage } from './io/image.js?v=120';
import { fitToCanvas, isBg } from './io/bg.js?v=120';
import * as Audio from './io/audio.js?v=120';
import { autoSaver, listDocs, loadDoc, deleteDoc, migrateOld,
         newId, whenText, MAX_DOCS } from './io/store.js?v=120';
import { importPsd } from './io/psd.js?v=120';
import { exportVideo, exportGif, saveVideo, canShareFile,
         canUseWebCodecs } from './io/export.js?v=120';
import { pathKeys } from './engine/path.js?v=120';
import { paintDirty } from './engine/paint.js?v=120';
import { newCage, resetCage, cageFlat, cageKeys, cageHasKeys,
         clearCageKeys, clearLock, hasLock } from './engine/warp.js?v=120';

const $ = (s) => document.querySelector(s);

const stageHost = $('#stage');
const canvas = $('#stageCv');
const listHost = $('#list');
const fileInput = $('#file');

const stage = createStage(canvas, stageHost, toast, () => onTraced());
const timeline = createTimeline(listHost, { toast });
const sheet = createSheet($('#sheet'), $('#sheetBack'));

/* ================= 画面の更新 ================= */
let dirty = true;
function refresh(){
  dirty = true;
  timeline.build();
  if(S.spanEdit) spanInfo();
  if(S.warpMode) warpUI();
  $('#undo').disabled = !canUndo();
  $('#redo').disabled = !canRedo();
  $('#undo').title = canUndo() ? 'もどす: ' + undoLabel() : 'もどす';
  $('#docSize').textContent = `${S.proj.w}×${S.proj.h} ／ ${S.proj.duration}秒`;
  sheet.refresh();
}
onChange(refresh);
onRestore(() => refresh());

/* ---- じどう保存 ----
   ブラウザで もどってしまっても 作りかけが 残るように、
   手が止まったら 端末の中へ しまう。 */
const saver = autoSaver(() => S.proj, {
  wait: 1200,
  getId: () => S.docId,
  getAudio: () => (Audio.A.bytes ? { name: Audio.A.name, bytes: Audio.A.bytes } : null),
  getThumb: () => makeThumb(),
  onDone: (ok, err) => {
    if(ok) return;
    if(!saveWarned){ saveWarned = true; toast('じどう保存が できません（' + (err && err.message || '') + '）'); }
  }
});
let saveWarned = false;
onChange(() => { if(S.ready) saver.touch(); });
window.addEventListener('pagehide', () => { if(S.ready) saver.now(); });
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden' && S.ready) saver.now();
});

let lastT = performance.now();
let lastStageW = 0, lastStageH = 0;
(function loop(){
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  if(S.playing){
    /* 音が 鳴っているときは 音の時計に 合わせる。
       絵のほうが 重くて遅れても、口の形が 声から ずれない。 */
    const at = Audio.currentTime();
    S.time = (at == null) ? S.time + dt : at;
    if(S.time >= S.proj.duration){
      S.time = 0;
      if(Audio.hasAudio()){                        // くり返すときは 音も 頭から
        const v = (S.proj.audio && S.proj.audio.volume != null) ? S.proj.audio.volume : 1;
        Audio.play(0, v);
      }
    }
    $('#tnow').textContent = S.time.toFixed(1);
    timeline.updatePlayhead();
    dirty = true;
  }
  // 目もりを さわるなど、ほかの所で 止まったときも 音を そろえる
  if(!S.playing && Audio.isPlaying()) Audio.stop();

  /* 絵の 欄の 大きさが 変わって いないか、毎コマ たしかめる。

     ウィンドウを 変えなくても 欄の 大きさは 変わる
     （シートの 出し入れ、タイムラインの たたみ、
       アドレスバーの 出入り、道具の ならびなおし など）。
     気づかないと 紙が 古いままに なって、下の ほうが 切れて 見える。
     はかるだけ なので 軽い。 */
  const sr = stageHost.getBoundingClientRect();
  if(Math.abs(sr.width - lastStageW) > 0.5 || Math.abs(sr.height - lastStageH) > 0.5){
    lastStageW = sr.width; lastStageH = sr.height;
    stage.resize();
    dirty = true;
  }

  if(dirty){ stage.draw(); dirty = false; }
  requestAnimationFrame(loop);
})();

/* さくひんの 見本の絵。さいしょの画面の ならびに つかう。
   小さく描くだけなので 重くない。 */
let thumbCv = null;
function makeThumb(){
  try{
    if(!S.proj.layers.length) return null;
    const long = Math.max(S.proj.w, S.proj.h);
    const k = 220 / long;
    if(!thumbCv) thumbCv = document.createElement('canvas');
    thumbCv.width = Math.max(2, Math.round(S.proj.w * k));
    thumbCv.height = Math.max(2, Math.round(S.proj.h * k));
    const R = createRenderer(thumbCv);
    R.draw(S.proj, S.imgs, 0, { x:0, y:0, z:1 }, { forExport: true, scale: k });
    return thumbCv.toDataURL('image/jpeg', 0.7);
  }catch(_){ return null; }
}

/* ================= 通知 ================= */
let toastTimer = null;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}
function busy(on, msg){
  $('#busy').classList.toggle('on', !!on);
  if(msg) $('#busyMsg').textContent = msg;
}

/* ================= 読み込み ================= */
/** PSD かどうかを、名前・種類・中身の順に見て決める。
    Android では名前も種類もあてにならないことがあるので、
    最後は先頭4バイトの「8BPS」で確かめる。 */
async function looksLikePsd(f){
  if(/\.psd$/i.test(f.name)) return true;
  if(/photoshop/i.test(f.type || '')) return true;
  if(/^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(f.type || '')) return false;
  try{
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    return head[0] === 0x38 && head[1] === 0x42 && head[2] === 0x50 && head[3] === 0x53;
  }catch(_){ return false; }
}

async function handleFiles(files){
  const all = [...files];
  const psd = [], imgs = [], other = [];
  for(const f of all){
    if(await looksLikePsd(f)) psd.push(f);
    else if(/^image\//.test(f.type || '')) imgs.push(f);
    else other.push(f);
  }
  if(!psd.length && !imgs.length){
    toast(other.length
      ? 'これは読めません（PSD・PNG・JPEG をえらんでね）'
      : 'PSD・PNG・JPEG を選んでね');
    return;
  }

  try{
    if(psd.length){
      busy(true, 'PSDをよみこみ中…');
      const r = await importPsd(psd[0]);
      toast(`${r.count}まいのレイヤーをよみこみました`);
    }
    if(imgs.length){
      busy(true, '画像をよみこみ中…');
      // PNGを2枚以上まとめて選んだら、コマ列にするか聞く
      let asFrames = false;
      if(imgs.length > 1){
        busy(false);
        asFrames = confirm(
          `${imgs.length}まい えらびました。\n\n` +
          `OK … 1つのレイヤーの「コマ」にする（パラパラアニメ用）\n` +
          `キャンセル … べつべつのレイヤーにする`
        );
        busy(true, '画像をよみこみ中…');
      }
      const n = await addImageFiles(imgs, asFrames);
      toast(asFrames ? `${n}コマのレイヤーを作りました` : `${n}まいよみこみました`);
    }
  }catch(err){
    toast(err.message || 'よみこめませんでした');
  }finally{
    busy(false);
    refresh();
  }
}

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  e.target.value = '';
});

/* ドラッグ＆ドロップ（PC） */
['dragenter','dragover'].forEach(ev =>
  stageHost.addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.add('on'); }));
['dragleave','drop'].forEach(ev =>
  stageHost.addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.remove('on'); }));
stageHost.addEventListener('drop', (e) => {
  if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ================= ボタン ================= */
/* ついか ＝ 絵をよみこむ。文字は となりの「もじ」ボタン。 */
$('#add').addEventListener('click', () => fileInput.click());

/* もじ ＝ 文字を つくる／なおす。ここは 文字のことだけ。
   「決定」を おすまで 画面には 出ない。 */
$('#text').addEventListener('click', () => {
  sheet.open('もじ', (box) => buildTextSheet(box, () => sheet.close()));
});

/* ---- クリップ ＝ えらんだレイヤーの形で ぬく ---- */
$('#clip').addEventListener('click', () => {
  const l = selected();
  if(!l) return toast('レイヤーをえらんでね');
  sheet.open('クリップ（' + l.name + '）', (box) => {
    const nl = String.fromCharCode(10);
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = '「' + l.name + '」を、えらんだ レイヤーの形で ぬきます。' + nl
      + 'かみのけを かおの形で ぬく、もようを からだの形で ぬく、' + nl
      + 'といった 使いかたが できます。';
    box.appendChild(e);
    box.appendChild(clipRow(l));
  });
});

/* ---- なぞって うごかす ----
   ① みちを なぞる（絵の上）
   ② 何秒で 通るかを きめる
   ③ 道のりで 等分に ピンを うつ */
function setTraceMode(on){
  if(on && S.paintMode) setPaintMode(false);
  S.traceMode = !!on;
  if(!on) S.tracePts = null;
  $('#tracemode').hidden = !on;
  if(on){
    S.playing = false;
    stopSound();
    toast('ピンクの わくの 内がわから なぞってね');
  }
  refresh();
}

function onTraced(){
  const l = selected();
  if(!l || !S.tracePts || S.tracePts.length < 2) return;
  sheet.open('なぞった みち', (box) => buildPathSheet(box, () => sheet.close(), S.tracePts,
    (opt) => {
      /* なぞった あとは キャンバスの ざひょう。
         レイヤーは 親から 見た 場所で 持っているので、直しておく。 */
      const poses = computeAll(S.proj, S.time);
      const pm = l.parent && poses[l.parent] ? poses[l.parent].m : null;
      const local = S.tracePts.map(p => {
        if(!pm) return { x: p.x, y: p.y };
        const q = M.apply(M.inv(pm), p.x, p.y);
        return { x: q.x, y: q.y };
      });
      const n = { v: 0 };
      edit('なぞった みちで うごかす', () => {
        n.v = pathKeys(l, local, {
          start: S.time, dur: opt.dur, ease: opt.ease, count: opt.count
        });
      });
      toast(n.v ? Math.round(n.v / 2) + 'コの ピンで うごきます' : 'うてませんでした');
      setTraceMode(false);
    }));
}
setTracer(() => {
  if(!selected()) return toast('レイヤーを えらんでね');
  sheet.close();
  setTraceMode(true);
});
$('#trClose').addEventListener('click', () => setTraceMode(false));

/* ---- お絵かき ----
   ペンで 書いている あいだは、絵の上の さわりを ぜんぶ ペンに する。
   （うっかり レイヤーを 動かして しまわない ように） */
function setPaintMode(on){
  S.paintMode = on;
  $('#paintmode').hidden = !on;
  $('#paint').classList.toggle('on', on);
  if(on){
    if(S.pinMode) setPinMode(false);
    if(S.traceMode) setTraceMode(false);
    toast(S.penErase ? 'けしゴムです' : '絵の上を なぞって かこう');
  }
  paintUI();
  refresh();
}
function paintUI(){
  $('#pnPen').classList.toggle('on', !S.penErase);
  $('#pnEraser').classList.toggle('on', S.penErase);
  $('#pnSize').textContent = Math.round(S.penWidth);
  $('#pnColor').style.color = S.penColor;
}
setPainter(() => {
  const l = selected();
  if(!l || l.kind !== 'paint'){
    return toast('おえかきの かみを えらんでね');
  }
  sheet.close();
  setPaintMode(true);
});
$('#paint').addEventListener('click', () => {
  if(S.paintMode) return setPaintMode(false);
  sheet.open('お絵かき', (box) => buildPaintSheet(box, () => sheet.close()));
});
$('#pnClose').addEventListener('click', () => setPaintMode(false));

/* ---- ゆがみ・自由変形 ----
   絵の上に あみの目（かご）を かぶせて 引っぱる。
   ・自由変形 … 赤い 四すみだけ。中は 自動で ついてくる
   ・ゆがみ   … むらさきの あみの目を 1つずつ */
const SOFTS = [['かたい', 0], ['やわ 小', 0.8], ['やわ 中', 1.2], ['やわ 大', 2]];
const BRUSHES = [['筆 細', 0.10], ['筆 中', 0.18], ['筆 太', 0.30]];
let brushI = 1;
const GRIDS = [2, 3, 4, 6, 8];
let softI = 2, gridI = 1;

function warpUI(){
  const lw = selected();
  $('#wpKey').classList.toggle('on', !!(lw && cageHasKeys(lw)));
  $('#wpFree').classList.toggle('on', S.warpMode === 'free');
  $('#wpWarp').classList.toggle('on', S.warpMode === 'warp');
  $('#wpLock').classList.toggle('on', S.warpMode === 'lock');
  $('#wpLock').textContent = S.warpMode === 'lock' && S.lockErase ? '🧽 とかす' : '🖌 かためる';
  $('#wpBrush').textContent = BRUSHES[brushI][0];
  $('#wpBrush').hidden = S.warpMode !== 'lock';
  $('#wpSoft').textContent = SOFTS[softI][0];
  $('#wpSoft').disabled = S.warpMode !== 'warp';
  const l = selected();
  $('#wpGrid').textContent = 'あみ ' + (l && l.cage ? l.cage.cols + '×' + l.cage.rows
                                                    : GRIDS[gridI] + '×' + GRIDS[gridI]);
}

function setWarpMode(mode){
  if(mode && S.pinMode) setPinMode(false);
  if(mode && S.paintMode) setPaintMode(false);
  S.warpMode = mode || null;
  S.warpSel = -1;
  $('#warpmode').hidden = !S.warpMode;
  warpUI();
  refresh();
}
setWarper((l) => {
  /* フォルダは 中身を 1まいに まとめてから ゆがめるので、
     かごは キャンバスの 大きさで 作る（ピンのときと 同じ）。 */
  const a = isFolder(l) ? { w: S.proj.w, h: S.proj.h } : frameAsset(l, 0);
  if(!a) return toast('絵の ない レイヤーには つかえません');
  if(!l.cage){
    edit('ゆがみを はじめる', () => {
      l.cage = newCage(a.w, a.h, GRIDS[gridI], GRIDS[gridI]);
    });
  }
  sheet.close();
  setWarpMode('free');
  toast('赤い 四すみを ひっぱって 形を 変えよう');
});
$('#wpClose').addEventListener('click', () => setWarpMode(null));
$('#wpFree').addEventListener('click', () => setWarpMode('free'));
$('#wpWarp').addEventListener('click', () => {
  setWarpMode('warp');
  toast('むらさきの あみの目を つまんで ひっぱろう');
});

/* 筆で なぞって かためる。
   ぬった ところは 動かなく なるので、
   そのまわりを 引っぱっても 形が くずれない
   （顔は そのままで かみだけ ゆらす、など）。
   もう一度 おすと「とかす」がわに 切りかわる。 */
/* 筆で なぞって「かたまり」に する。
   なぞった ところは 中の 形を たもった まま まるごと 動く。
   まわりは 近いほど ついてくるので、ゴムのように のびる。
   （うでを まるごと 持ち上げる、顔を そのまま 動かす など） */
$('#wpLock').addEventListener('click', () => {
  if(S.warpMode === 'lock'){
    S.lockErase = !S.lockErase;
    warpUI();
    return toast(S.lockErase ? 'なぞると とけます' : 'なぞると かたまります');
  }
  setWarpMode('lock');
  S.lockErase = false;
  warpUI();
  toast('まとめて 動かしたい ところを 筆で なぞってね' + String.fromCharCode(10)
    + 'そのあと「🫳 ゆがみ」で つまむと まるごと 持ち上がります');
});
$('#wpBrush').addEventListener('click', () => {
  brushI = (brushI + 1) % BRUSHES.length;
  S.lockBrush = BRUSHES[brushI][1];
  warpUI();
  refresh();
});
$('#wpSoft').addEventListener('click', () => {
  softI = (softI + 1) % SOFTS.length;
  S.warpSoft = SOFTS[softI][1];
  warpUI();
  toast('やわらかさ … ' + SOFTS[softI][0]);
});
$('#wpGrid').addEventListener('click', () => {
  const l = selected();
  if(!l || !l.cage) return;
  if(!cageFlat(l.cage) && !confirm('あみの こまかさを 変えると、いまの ゆがみは 消えます。いいですか？')) return;
  gridI = (gridI + 1) % GRIDS.length;
  const a = isFolder(l) ? { w: S.proj.w, h: S.proj.h } : frameAsset(l, 0);
  edit('あみの こまかさ', () => { l.cage = newCage(a.w, a.h, GRIDS[gridI], GRIDS[gridI]); });
  warpUI();
  refresh();
});
/* いまの 形を、その 時こくの ピンに する。
   1回 うつと、あとは 引っぱるたび に その時間の ピンが
   書きかわるので、そのまま ゆがみの アニメに なる。 */
$('#wpKey').addEventListener('click', () => {
  const l = selected();
  if(!l || !l.cage) return;
  /* おすたび に、いまの 形を その 時こくの ピンに する。
     （とじる ボタンでは ない。けす ときは タイムラインで
       その ピンを えらんで 🗑 けす） */
  edit('ゆがみに ピンをうつ', () => { cageKeys(l, S.time); });
  toast(S.time.toFixed(2) + '秒に ピンを うちました' + String.fromCharCode(10)
    + '時間を うごかして 形を 変えると アニメに なります');
  warpUI();
  refresh();
});

$('#wpReset').addEventListener('click', () => {
  const l = selected();
  if(!l || !l.cage) return;
  if(S.warpMode === 'lock'){
    if(!hasLock(l.cage)) return toast('かためた ところは ありません');
    edit('かためたのを ぜんぶ とかす', () => { clearLock(l.cage); });
    toast('ぜんぶ とかしました');
    return refresh();
  }
  edit('ゆがみを もどす', () => { resetCage(l.cage); });
  toast('もとの 形に もどしました');
  refresh();
});

/* ---- 長さを 調節（ここから ここまで 出す）----
   ふだんは タイムラインに 出さない。ここを おした ときだけ 出す。
   スマホの せまい タイムラインでは、いつも 出ていると 見にくいので。 */
function spanLayer(){ return S.proj.layers.find(x => x.id === S.spanEdit) || null; }

function spanInfo(){
  const l = spanLayer();
  if(!l) return;
  $('#spanInfo').textContent = l.span
    ? l.span.from.toFixed(2) + '〜' + l.span.to.toFixed(2) + '秒'
    : 'ずっと 出す';
}

function setSpanMode(id){
  S.spanEdit = id || null;
  $('#spanmode').hidden = !S.spanEdit;
  spanInfo();
  refresh();
}
setSpanner((l) => { setSpanMode(l.id); });
$('#spClose').addEventListener('click', () => setSpanMode(null));

/* 再生バーの ところを「ここから」「ここまで」に する。

   つまみを ひっぱるのは、画面の はしに 近いと スマホの
   「もどる」に とられて しまう ことが ある。
   こちらは 画面の まん中あたりの ボタンを おすだけなので、
   はしを さわらずに きめられる。
   （再生バーは タイムラインの どこを おしても 動かせる） */
function setSpanEnd(which){
  const l = spanLayer();
  if(!l) return;
  const t = +S.time.toFixed(2);
  edit('出す ところ', () => {
    const sp = l.span || (l.span = { from: 0, to: S.proj.duration });
    if(which === 'from') sp.from = Math.min(t, sp.to - 0.05);
    else                 sp.to   = Math.max(t, sp.from + 0.05);
    sp.from = Math.max(0, +sp.from.toFixed(3));
    sp.to   = Math.min(S.proj.duration, +sp.to.toFixed(3));
    // ぜんぶの 長さに もどったら「きめて いない」ことに する
    if(sp.from <= 1e-6 && sp.to >= S.proj.duration - 1e-6) l.span = null;
  });
  toast(l.span ? l.span.from.toFixed(2) + '秒 〜 ' + l.span.to.toFixed(2) + '秒 だけ 出します'
               : 'ずっと 出します');
  spanInfo();
  refresh();
}
$('#spFrom').addEventListener('click', () => setSpanEnd('from'));
$('#spTo').addEventListener('click', () => setSpanEnd('to'));
$('#spAll').addEventListener('click', () => {
  const l = spanLayer();
  if(!l) return;
  edit('ずっと 出す', () => { l.span = null; });
  toast('ずっと 出すように しました');
  spanInfo();
  refresh();
});
$('#pnPen').addEventListener('click', () => { S.penErase = false; paintUI(); toast('ペン'); });
$('#pnEraser').addEventListener('click', () => { S.penErase = true; paintUI(); toast('けしゴム'); });
$('#pnThin').addEventListener('click', () => {
  S.penWidth = Math.max(1, Math.round(S.penWidth * 0.75)); paintUI();
});
$('#pnThick').addEventListener('click', () => {
  S.penWidth = Math.min(80, Math.round(S.penWidth * 1.35) + 1); paintUI();
});
$('#pnColor').addEventListener('click', () => {
  sheet.open('ペンの色', (box) => {
    box.appendChild(colorPick('ペンの色', () => S.penColor, v => { S.penColor = v; paintUI(); }));
  });
});
$('#pnUndo').addEventListener('click', () => {
  const l = selected();
  if(!l || l.kind !== 'paint' || !(l.strokes || []).length) return toast('けす ものが ありません');
  edit('ひとふで もどす', () => { l.strokes.pop(); paintDirty(l); });
  refresh();
});
$('#trUndo').addEventListener('click', () => { S.tracePts = null; refresh(); });

/* ---- パペットピン ---- *//* ---- パペットピン ---- */
function setPinMode(on){
  if(on && S.paintMode) setPaintMode(false);
  S.pinMode = on;
  S.pinSel = -1;
  $('#pinmode').hidden = !on;
  $('#pivot').classList.toggle('on', on);
  if(on) toast('絵の上をおして ピンをさそう');
  refresh();
}
$('#pivot').addEventListener('click', () => {
  if(!selected()) return toast('レイヤーをえらんでね');
  setPinMode(!S.pinMode);
});
$('#pmClose').addEventListener('click', () => setPinMode(false));
const PIN_KINDS = [['pmMove','move'], ['pmFix','fix'], ['pmJoint','joint'], ['pmDel','del']];
PIN_KINDS.forEach(([id, kind]) => {
  $('#' + id).addEventListener('click', () => {
    S.pinKind = kind;
    PIN_KINDS.forEach(([x]) => $('#' + x).classList.toggle('on', x === id));
    toast(kind === 'move'  ? 'おした所に うごかすピン'
        : kind === 'fix'   ? 'おした所に とめるピン'
        : kind === 'joint' ? 'ひじ・ゆびの ように カクッと 折れるピン（ピンをおすと 切りかえ）'
        : 'ピンをおすと けせます');
  });
});

/* ---- タイムライン ---- */
/* 音は 再生ボタンと いっしょに 鳴らす。
   ブラウザは「人が おした」ときしか 音を出せないので、ここで はじめる。 */
function startSound(){
  if(!Audio.hasAudio()) return;
  const v = (S.proj.audio && S.proj.audio.volume != null) ? S.proj.audio.volume : 1;
  Audio.play(S.time, v);
}
function stopSound(){ Audio.stop(); }

$('#play').addEventListener('click', () => {
  S.playing = !S.playing;
  if(S.playing && S.time >= S.proj.duration - 0.01) S.time = 0;
  if(S.playing) startSound(); else stopSound();
  refresh();
});
$('#toStart').addEventListener('click', () => {
  S.time = 0; S.playing = false; stopSound(); refresh();
});
$('#ripple').addEventListener('click', () => {
  S.ripple = !S.ripple;
  toast(S.ripple ? 'ピンをずらすと 後ろも ついてきます' : '1つだけ ずらします');
  refresh();
});
$('#key').addEventListener('click', () => timeline.putPin());
$('#prevPin').addEventListener('click', () => timeline.toPin(-1));
$('#nextPin').addEventListener('click', () => timeline.toPin(1));
$('#pinDel').addEventListener('click', () => timeline.delPins());
$('#pininfo').addEventListener('click', () => timeline.askPinTime());
$('#pinCopy').addEventListener('click', () => timeline.copyPins());
$('#paste').addEventListener('click', () => timeline.pastePins());
$('#tlIn').addEventListener('click', () => timeline.zoomTime(1.8));
$('#tlOut').addEventListener('click', () => timeline.zoomTime(1 / 1.8));
$('#pinHold').addEventListener('click', () => timeline.toggleHold());
$('#pinEase').addEventListener('click', () => {
  if(!S.selPins.times.length) return toast('ピンを えらんでね');
  sheet.open('つなぎ方', (box) => buildEaseSheet(box, () => sheet.close(),
    timeline.currentEase(),
    (mode, ease) => timeline.setEase(mode, ease),
    timeline.currentShape()));
});
setEaseAsker((now, shape, onPick) => {
  sheet.open('つなぎ方', (box) => buildEaseSheet(box, () => sheet.close(), now, onPick, shape));
});

$('#pinLoop').addEventListener('click', () => timeline.setLoop('loop'));
$('#pinPing').addEventListener('click', () => timeline.setLoop('pingpong'));
/** 設定シートを、横にスライドできるページで開く */
/* うごきは 中身が 多いので、まず えらぶ画面を 出して、
   えらんだ ものだけを 別の画面で ひらく。 */
const MOVE_PAGES = {
  form:   ['✨ 出る・消える',  buildEnterSheet],
  loop:   ['🔁 ずっと うごく', buildLoopSheet],
  path:   ['👆 みちを なぞる', buildTraceSheet],
  beat:   ['🥁 リズム（BPM）', buildBeatSheet],
  flip:   ['🎞 パラパラ',      buildFlipSheet],
  finish: ['💨 しあげ',        buildFinishSheet]
};

function openMove(key){
  const l = selected();
  if(!l) return toast('レイヤーをえらんでね');

  if(!key){
    return sheet.open('うごき（' + l.name + '）',
      (box) => buildMotionSheet(box, (k) => openMove(k)));
  }
  const page = MOVE_PAGES[key];
  if(!page) return openMove();
  sheet.open(page[0] + '（' + l.name + '）',
    (box) => page[1](box, () => openMove()));
}

/* かたち・うごき・かお は それぞれ 別の画面。
   1つの画面に まとめると、なにを いじっているのか 分からなくなる。 */
function openSheet(key){
  const l = selected();
  if(!l) return toast('レイヤーをえらんでね');

  if(key === 'move') return openMove();
  if(key === 'face'){
    if(l.kind === 'text')   return toast('文字には つかえません');
    if(l.kind === 'folder') return toast('フォルダには つかえません');
    return sheet.open('かお（' + l.name + '）', (box) => buildFaceSheet(box));
  }
  sheet.open('かたち（' + l.name + '）', (box) => buildLayerSheet(box, () => sheet.close()));
}

/* おやこ ＝ 親をえらぶ画面。ほかの設定は まざらない。
   ☑ をつけていれば まとめて、つけていなければ いま選んでいる1まいを つける。 */
function openParentSheet(){
  if(!S.pick.length && !selected()) return toast('レイヤーを えらんでね');
  sheet.open('おやこ', (box) => buildParentSheet(box, () => sheet.close()));
}
$('#parent').addEventListener('click', openParentSheet);
setParentOpener(openParentSheet);

/* 作品ぜんたいの せってい（なまえ・長さ・音）。
   上の「1080×1920／15秒」の札からも、下の ⚙せってい からも ひらける。 */
function openDocSheet(){
  sheet.open('どうがの せってい', (box) => buildDocSheet(box, () => sheet.close()));
}
$('#docSize').addEventListener('click', openDocSheet);

/* 版のばんごうを おすと、ブラウザに のこっている 古いものを 捨てて
   さいしんを 取りに行く（スマホは 古いままに なりやすい）。 */
$('#ver').addEventListener('click', async () => {
  if(S.ready){
    busy(true, 'ほぞん しています…');
    try{ await saver.now(); }catch(_){}
    busy(false);
  }
  location.href = location.pathname + '?fresh=' + Date.now();
});

/* 「アニメ工房」を おすと さくひん えらびへ もどる。
   じどう保存ずみなので、そのまま つづきから ひらける。 */
$('#home').addEventListener('click', async () => {
  if(exporting) return;
  S.playing = false;
  stopSound();
  if(S.ready){
    busy(true, 'ほぞん しています…');
    try{ await saver.now(); }catch(_){}
    busy(false);
  }
  sheet.close();
  S.ready = false;
  boot();
});
$('#setting').addEventListener('click', openDocSheet);

/* 音を えらんだとき */
setAudioPicker(async (files) => {
  const f = files && files[0];
  if(!f) return 0;
  try{
    busy(true, '音を よみこみ中…');
    await Audio.loadAudio(f, f.name);
    S.proj.audio = { name: f.name, volume: 1, duration: Audio.A.buf.duration };
    // 音より 動画が みじかいと 切れてしまうので、足りなければ のばす
    if(Audio.A.buf.duration > S.proj.duration){
      S.proj.duration = Math.ceil(Audio.A.buf.duration);
      toast('音に合わせて 長さを ' + S.proj.duration + '秒に しました');
    } else {
      toast('音を よみこみました');
    }
    return 1;
  }catch(err){
    toast(err.message || '音を よみこめませんでした');
    return 0;
  }finally{
    busy(false);
    refresh();
  }
});

/* はいけいに 写真を えらんだとき */
setBgPicker(async (files, layer) => {
  const f = files && files[0];
  if(!f || !/^image\//.test(f.type || '')) { toast('PNG・JPEG を えらんでね'); return 0; }
  try{
    busy(true, '写真を よみこみ中…');
    const n = await addFramesToLayer([f], layer);
    if(n){
      edit('はいけいの写真', () => {
        layer.frames = [layer.frames[layer.frames.length - 1]];
        layer.bgColor = null;
        fitToCanvas(layer);
      });
      toast('はいけいを 写真に しました');
    }
    return n;
  }catch(err){
    toast(err.message || 'よみこめませんでした');
    return 0;
  }finally{
    busy(false);
    refresh();
  }
});

/* ---- まとめる（フォルダ） ----
   ☑ でえらんだものを ひとつのフォルダに入れる。
   えらんでいなければ、いま選んでいる1まいだけ入れる。
   フォルダを選んでいるときは ほどく。 */
$('#group').addEventListener('click', () => {
  const cur = selected();

  if(cur && isFolder(cur) && !S.pick.length){
    const n = membersOf(S.proj, cur).length;
    edit('フォルダをほどく', () => { ungroup(S.proj, cur, S.time); });
    S.sel = null;
    toast(n + 'まいを 外に出しました');
    return refresh();
  }

  const ids = S.pick.length ? [...S.pick] : (cur ? [cur.id] : []);
  if(!ids.length) return toast('レイヤーの ☐ を おして えらんでね');

  const made = { f: null };
  edit('フォルダにまとめる', () => {
    made.f = groupInto(S.proj, ids, S.time, 'フォルダ');
  });
  if(!made.f) return toast('まとめられませんでした');

  S.pick = [];
  S.sel = made.f.id;
  toast(ids.length + 'まいを フォルダに入れました');
  refresh();
});
/* かたち・うごき・かお は それぞれ 直に ひらく */
$('#form').addEventListener('click', () => openSheet('form'));
$('#move').addEventListener('click', () => openSheet('move'));
$('#face').addEventListener('click', () => openSheet('face'));

$('#undo').addEventListener('click', () => {
  const l = undo();
  if(l) toast('もどした: ' + l);
});
$('#redo').addEventListener('click', () => {
  const l = redo();
  if(l) toast('やりなおし: ' + l);
});
$('#fit').addEventListener('click', () => { stage.fit(); refresh(); });

/* レイヤーの欄を たたむ。絵を 大きく見たいとき用 */
$('#fold').addEventListener('click', () => {
  const on = $('#list').classList.toggle('folded');
  $('#fold').textContent = on ? '▴' : '▾';
  $('#fold').classList.toggle('on', on);
  $('#fold').title = on ? 'レイヤーの欄を ひろげる' : 'レイヤーの欄を たたむ';
  setTimeout(() => { stage.resize(); stage.fit(); refresh(); }, 40);
});

/* はいけい。まだ無ければ すぐ足して、あれば その設定をひらく */
$('#bg').addEventListener('click', () => {
  sheet.open('はいけい', (box) => buildBgSheet(box, () => sheet.close()));
});

window.addEventListener('keydown', (e) => {
  if(/input|select|textarea/i.test(e.target.tagName)) return;
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    const l = e.shiftKey ? redo() : undo();
    if(l) toast(l);
  }
  if(e.key === 'Escape'){ sheet.close(); timeline.clearPins(); }
  if(e.key.toLowerCase() === 'f'){ stage.fit(); refresh(); }
  if(e.key === ' '){ e.preventDefault(); $('#play').click(); }
  if(e.key.toLowerCase() === 'k'){ timeline.putPin(); }
  if(e.key === 'Delete' || e.key === 'Backspace'){ timeline.delPins(); }
});

/* ================= 画面サイズの変化 ================= */
let resizeTimer = null;
function onResize(){
  stage.resize();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { dirty = true; }, 30);
  dirty = true;
}
window.addEventListener('resize', onResize);

/* 絵の 欄の 大きさは、ウィンドウを 変えなくても 変わる
   （シートの 出し入れ、タイムラインの たたみ、道具の ならびなおし など）。
   そのとき「resize」は 来ない ので、紙の 大きさが 古いままに なり、
   下の ほうが 切れて 見える。
   欄そのものを 見はって、変わったら すぐ 作り直す。 */
if(window.ResizeObserver){
  new ResizeObserver(() => onResize()).observe(stageHost);
}

/* いま ほんとうに 見えて いる たかさを CSS に わたす。

   スマホの アドレスバーが 出入りすると 見える ぶんが 変わる。
   visualViewport は その「いま 見えて いる」大きさを 教えて くれる。
   これを たかさに つかうと、バーが 出て いる あいだも
   絵の 下が かくれない。 */
function syncViewport(){
  const vv = window.visualViewport;
  const h = Math.round(vv ? vv.height : window.innerHeight);
  /* おかしな 数（0 など）が 来る ことが ある。
     そのまま つかうと 画面が つぶれて しまうので、
     ちいさすぎる ときは CSS の 100dvh に まかせる。 */
  if(h >= 200) document.documentElement.style.setProperty('--appH', h + 'px');
  else document.documentElement.style.removeProperty('--appH');
  onResize();
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', syncViewport);
  window.visualViewport.addEventListener('scroll', syncViewport);
}
syncViewport();
window.addEventListener('orientationchange', () => setTimeout(() => { onResize(); stage.fit(); }, 260));

/* ================= 書き出し ================= */
let exporting = false;
let cancelExport = false;

$('#exCancel').addEventListener('click', () => { cancelExport = true; });

/* 書き出しの 中身。kind は 'mp4' か 'gif' */
async function runExport(kind){
  if(exporting) return;
  if(!S.proj.layers.length) return toast('さきに 絵をよみこもう');

  const box = $('#exporting');
  const fill = $('#exFill'), pct = $('#exPct'), title = $('#exTitle');
  exporting = true; cancelExport = false;
  S.playing = false;
  box.classList.add('on');
  title.textContent = kind === 'gif'
    ? 'すける GIFを つくっています'
    : (canUseWebCodecs() ? '動画を つくっています' : '動画を つくっています（実時間）');
  fill.style.width = '0%'; pct.textContent = '0%';

  const onProgress = (p) => {
    const v = Math.round(p * 100);
    fill.style.width = v + '%';
    pct.textContent = v + '%';
  };

  try{
    const g = S.proj.gif || {};
    const r = kind === 'gif'
      ? await exportGif(S.proj, {
          fps: g.fps || 12,
          maxSide: g.maxSide || 480,
          seconds: g.seconds || Math.min(6, S.proj.duration),
          onProgress, shouldStop: () => cancelExport
        })
      : await exportVideo(S.proj, { onProgress, shouldStop: () => cancelExport });

    const name = (S.proj.name || 'anime') + '.' + r.ext;
    const mb = (r.blob.size / 1048576).toFixed(1);
    box.classList.remove('on');

    /* ここで 自動で 共有すると、スマホでは
      「人が おした その場」ではないので ひらけない。
       ボタンに して、おした その場で 共有する。 */
    sheet.open('できあがり', (b) => buildDoneSheet(b, () => sheet.close(),
      { name, mb, canShare: canShareFile(r.blob, name) },
      (how) => saveVideo(r.blob, name, how)));
  }catch(err){
    toast(err.message === 'やめました' ? '書き出しを やめました'
                                       : (err.message || '書き出せませんでした'));
  }finally{
    exporting = false;
    box.classList.remove('on');
    refresh();
  }
}

/* 書き出す ＝ どの形で 出すか えらぶ */
$('#export').addEventListener('click', () => {
  if(exporting) return;
  if(!S.proj.layers.length) return toast('さきに 絵をよみこもう');
  S.proj.gif = S.proj.gif || { fps: 12, maxSide: 480, seconds: Math.min(6, S.proj.duration) };
  sheet.open('書き出す', (b) => buildExportSheet(b, () => sheet.close(), runExport));
});

setNotifier(toast);
setBusy(busy);
setPlayer((on) => {
  if(on === S.playing) return;
  S.playing = !!on;
  if(S.playing){ if(S.time >= S.proj.duration - 0.01) S.time = 0; startSound(); }
  else stopSound();
  refresh();
});

/* 設定シートの「＋コマを足す」から呼ばれる */
setFrameAdder(async (files, layer) => {
  try{
    busy(true, 'コマをよみこみ中…');
    const n = await addFramesToLayer(files, layer);
    if(n) toast(n + 'コマ ふえました');
    return n;
  }catch(err){
    toast(err.message || 'よみこめませんでした');
    return 0;
  }finally{
    busy(false);
    refresh();
  }
});

/* 手元での動作確認用。localhost のときだけ中身をのぞけるようにする */
if(location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
  window.__dbg = { S, stage, timeline, refresh, undoDepth, selected };
}

/* ================= まちがって「もどる」を おしたとき =================
   スワイプの もどる じたいは 止められないので、
   1回めは ここで受けとめて、2回めで ほんとうに出る。
   （出るときも じどう保存ずみ） */
let backAt = 0;
function guardBack(){
  if(!history.state || history.state.kobo !== 1){
    history.pushState({ kobo: 1 }, '');
  }
  window.addEventListener('popstate', () => {
    if(!S.ready){ history.back(); return; }

    /* なぞっている あいだは ぜったいに 出ない。
       スマホは 画面の はしから すべらせると「もどる」に なるので、
       みちを かいている 途中で 出ると せっかくの あとが 消える。 */
    if(S.traceMode || S.pinMode || S.paintMode || S.spanEdit){
      history.pushState({ kobo: 1 }, '');
      backAt = 0;
      toast(S.traceMode  ? 'なぞり中です（「おわり」で とじられます）'
          : S.paintMode  ? 'おえかき中です（「おわり」で とじられます）'
          : S.spanEdit   ? '長さを 調節中です（「おわり」で とじられます）'
                         : 'ピン中です（「おわり」で とじられます）');
      return;
    }

    const now = Date.now();
    if(now - backAt < 2500){ history.back(); return; }   // 2回めは そのまま出る
    backAt = now;
    history.pushState({ kobo: 1 }, '');
    saver.now();
    toast('もう一度 もどると とじます（ほぞんずみ）');
  });
}

/* ================= 起動 ================= */
function startNew(resume){
  showNewDoc($('#newdoc'), (w, h, seconds) => {
    S.proj = newProject(w, h, seconds);
    S.docId = newId();                  // あたらしい さくひんの ばんごう
    S.ready = true;
    stage.resize();
    stage.fit();
    refresh();
    guardBack();
    saver.now();                        // ばんごうを すぐ おさえておく
    toast('「ついか」から絵をよみこもう');
  }, resume);
}

/** しまってあった さくひんを ひらく。絵は src から 作りなおす */
async function openDoc(id){
  busy(true, 'さくひんを ひらいています…');
  try{
    const rec = await loadDoc(id);
    if(!rec || !rec.proj) throw new Error('ひらけませんでした');
    S.proj = rec.proj;
    S.docId = rec.id;
    if(rec.audio && rec.audio.bytes){
      try{ await Audio.loadAudio(rec.audio.bytes, rec.audio.name); }catch(_){}
    } else {
      Audio.clearAudio();
    }
    S.imgs = {};
    for(const a of Object.values(rec.proj.assets || {})){
      try{ S.imgs[a.id] = await loadImage(a.src); }catch(_){}
    }
    S.sel = null;
    S.time = 0;
    S.ready = true;
    $('#newdoc').style.display = 'none';
    stage.resize();
    stage.fit();
    refresh();
    guardBack();
    toast('「' + (S.proj.name || 'むだい') + '」を ひらきました');
  }catch(err){
    toast(err.message || 'ひらけませんでした');
    boot();
  }finally{
    busy(false);
  }
}

async function boot(){
  let docs = [];
  try{
    await migrateOld();               // むかしの ひとつだけの ほぞんを 引っこす
    docs = await listDocs();
  }catch(_){}

  startNew({
    docs: docs.map(d => Object.assign({}, d, { when: whenText(d.at) })),
    max: MAX_DOCS,
    full: docs.length >= MAX_DOCS,
    onOpen: (id) => openDoc(id),
    onDelete: async (id) => {
      try{ await deleteDoc(id); }catch(_){}
      boot();
    }
  });
}
boot();
