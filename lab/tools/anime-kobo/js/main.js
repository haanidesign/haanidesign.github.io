/* 起動と組み立て。 */

import { S, newProject, onChange, onRestore, undo, redo, edit,
         canUndo, canRedo, undoLabel, undoDepth, selected } from './state.js';
import { createStage } from './ui/stage.js';
import { createTimeline } from './ui/timeline.js';
import { fmtTime } from './engine/anim.js';
import { createSheet, buildLayerSheet, setFrameAdder } from './ui/sheet.js';
import { showNewDoc } from './ui/newdoc.js';
import { addImageFiles, addFramesToLayer } from './io/image.js';
import { importPsd } from './io/psd.js';
import { exportVideo, saveVideo, canUseWebCodecs } from './io/export.js';

const $ = (s) => document.querySelector(s);

const stageHost = $('#stage');
const canvas = $('#stageCv');
const listHost = $('#list');
const fileInput = $('#file');

const stage = createStage(canvas, stageHost, toast);
const timeline = createTimeline(listHost, { toast });
const sheet = createSheet($('#sheet'), $('#sheetBack'));

/* ================= 画面の更新 ================= */
let dirty = true;
function refresh(){
  dirty = true;
  timeline.build();
  $('#undo').disabled = !canUndo();
  $('#redo').disabled = !canRedo();
  $('#undo').title = canUndo() ? 'もどす: ' + undoLabel() : 'もどす';
  $('#docSize').textContent = `${S.proj.w}×${S.proj.h} ／ ${S.proj.duration}秒`;
  sheet.refresh();
}
onChange(refresh);
onRestore(() => refresh());

let lastT = performance.now();
(function loop(){
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  if(S.playing){
    S.time += dt;
    if(S.time >= S.proj.duration){ S.time = 0; }   // 頭にもどってくり返す
    $('#tnow').textContent = S.time.toFixed(1);
    timeline.updatePlayhead();
    dirty = true;
  }
  if(dirty){ stage.draw(); dirty = false; }
  requestAnimationFrame(loop);
})();

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
$('#add').addEventListener('click', () => fileInput.click());

/* ---- パペットピン ---- */
function setPinMode(on){
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
[['pmMove','move'], ['pmFix','fix'], ['pmDel','del']].forEach(([id, kind]) => {
  $('#' + id).addEventListener('click', () => {
    S.pinKind = kind;
    ['pmMove','pmFix','pmDel'].forEach(x => $('#' + x).classList.toggle('on', '#' + x === '#' + id));
    toast(kind === 'move' ? 'おした所に うごかすピン'
        : kind === 'fix'  ? 'おした所に とめるピン'
        : 'ピンをおすと けせます');
  });
});

/* ---- タイムライン ---- */
$('#play').addEventListener('click', () => {
  S.playing = !S.playing;
  if(S.playing && S.time >= S.proj.duration - 0.01) S.time = 0;
  refresh();
});
$('#toStart').addEventListener('click', () => { S.time = 0; S.playing = false; refresh(); });
$('#ripple').addEventListener('click', () => {
  S.ripple = !S.ripple;
  toast(S.ripple ? 'ピンをずらすと 後ろも ついてきます' : '1つだけ ずらします');
  refresh();
});
$('#key').addEventListener('click', () => timeline.putPin());
$('#pinDel').addEventListener('click', () => timeline.delPins());
$('#pinCopy').addEventListener('click', () => timeline.copyPins());
$('#paste').addEventListener('click', () => timeline.pastePins());
$('#tlIn').addEventListener('click', () => timeline.zoomTime(1.8));
$('#tlOut').addEventListener('click', () => timeline.zoomTime(1 / 1.8));
$('#pinHold').addEventListener('click', () => timeline.toggleHold());
$('#pinLoop').addEventListener('click', () => timeline.setLoop('loop'));
$('#pinPing').addEventListener('click', () => timeline.setLoop('pingpong'));
$('#parent').addEventListener('click', () => {
  if(!selected()) return toast('レイヤーをえらんでね');
  sheet.open('レイヤーのせってい', (box) => buildLayerSheet(box, () => sheet.close()));
});
$('#clip').addEventListener('click', () => {
  const l = selected();
  if(!l) return toast('レイヤーをえらんでね');
  const i = S.proj.layers.indexOf(l);
  if(i === S.proj.layers.length - 1) return toast('いちばん下のレイヤーには使えません');
  edit(l.clip ? 'クリップをやめる' : 'クリップする', () => { l.clip = !l.clip; });
  toast(l.clip ? '下の「' + S.proj.layers[i+1].name + '」の形で ぬかれます' : 'クリップを やめました');
  refresh();
});
$('#setting').addEventListener('click', () => {
  if(!selected()) return toast('レイヤーをえらんでね');
  sheet.open('レイヤーのせってい', (box) => buildLayerSheet(box, () => sheet.close()));
});

$('#undo').addEventListener('click', () => {
  const l = undo();
  if(l) toast('もどした: ' + l);
});
$('#redo').addEventListener('click', () => {
  const l = redo();
  if(l) toast('やりなおし: ' + l);
});
$('#fit').addEventListener('click', () => { stage.fit(); refresh(); });

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
window.addEventListener('orientationchange', () => setTimeout(() => { onResize(); stage.fit(); }, 260));

/* ================= 書き出し ================= */
let exporting = false;
let cancelExport = false;

$('#exCancel').addEventListener('click', () => { cancelExport = true; });

$('#export').addEventListener('click', async () => {
  if(exporting) return;
  if(!S.proj.layers.length) return toast('さきに 絵をよみこもう');

  const box = $('#exporting');
  const fill = $('#exFill'), pct = $('#exPct'), title = $('#exTitle');
  exporting = true; cancelExport = false;
  S.playing = false;
  box.classList.add('on');
  title.textContent = canUseWebCodecs() ? '動画を つくっています' : '動画を つくっています（実時間）';
  fill.style.width = '0%'; pct.textContent = '0%';

  try{
    const { blob, ext } = await exportVideo(S.proj, {
      onProgress: (p) => {
        const v = Math.round(p * 100);
        fill.style.width = v + '%';
        pct.textContent = v + '%';
      },
      shouldStop: () => cancelExport
    });

    title.textContent = 'ほぞん しています';
    const name = (S.proj.name || 'anime') + '.' + ext;
    const how = await saveVideo(blob, name);
    const mb = (blob.size / 1048576).toFixed(1);
    toast(how === 'cancel' ? 'ほぞんを やめました'
        : how === 'share'  ? 'ほぞんしました（' + mb + 'MB）'
        : name + ' をダウンロードしました（' + mb + 'MB）');
  }catch(err){
    toast(err.message === 'やめました' ? '書き出しを やめました'
                                       : (err.message || '書き出せませんでした'));
  }finally{
    exporting = false;
    box.classList.remove('on');
    refresh();
  }
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

/* ================= 起動 ================= */
showNewDoc($('#newdoc'), (w, h, seconds) => {
  S.proj = newProject(w, h, seconds);
  S.ready = true;
  stage.resize();
  stage.fit();
  refresh();
  toast('「ついか」から絵をよみこもう');
});
