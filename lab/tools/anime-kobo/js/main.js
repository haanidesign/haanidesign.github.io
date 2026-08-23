/* 起動と組み立て。 */

import { S, newProject, onChange, onRestore, undo, redo, edit,
         canUndo, canRedo, undoLabel, undoDepth, selected } from './state.js';
import { groupInto, ungroup, isFolder, membersOf,
         copyLayers, pasteLayers, removeLayers } from './engine/layer.js';
import { createStage } from './ui/stage.js';
import { createRenderer } from './render/renderer.js';
import { createTimeline } from './ui/timeline.js';
import { fmtTime } from './engine/anim.js';
import { createSheet, buildLayerSheet, buildMotionSheet, buildTextSheet,
         buildParentSheet, buildDocSheet, buildBgSheet, buildFaceSheet, clipRow,
         buildExportSheet,
         setParentOpener, setBgPicker,
         setAudioPicker, setBusy, setPlayer, setFrameAdder, setNotifier } from './ui/sheet.js';

import { showNewDoc } from './ui/newdoc.js';
import { addImageFiles, addFramesToLayer, loadImage } from './io/image.js';
import { fitToCanvas, isBg } from './io/bg.js';
import * as Audio from './io/audio.js';
import { autoSaver, listDocs, loadDoc, deleteDoc, migrateOld,
         newId, whenText, MAX_DOCS } from './io/store.js';
import { importPsd } from './io/psd.js';
import { exportVideo, exportGif, saveVideo, canUseWebCodecs } from './io/export.js';

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

/* ---- パペットピン ---- *//* ---- パペットピン ---- */
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
$('#pinDel').addEventListener('click', () => timeline.delPins());
$('#pinCopy').addEventListener('click', () => timeline.copyPins());
$('#paste').addEventListener('click', () => timeline.pastePins());
$('#tlIn').addEventListener('click', () => timeline.zoomTime(1.8));
$('#tlOut').addEventListener('click', () => timeline.zoomTime(1 / 1.8));
$('#pinHold').addEventListener('click', () => timeline.toggleHold());
$('#pinLoop').addEventListener('click', () => timeline.setLoop('loop'));
$('#pinPing').addEventListener('click', () => timeline.setLoop('pingpong'));
/** 設定シートを、横にスライドできるページで開く */
/* かたち・うごき・かお は それぞれ 別の画面。
   1つの画面に まとめると、なにを いじっているのか 分からなくなる。 */
function openSheet(key){
  const l = selected();
  if(!l) return toast('レイヤーをえらんでね');

  if(key === 'move'){
    return sheet.open('うごき（' + l.name + '）', (box) => buildMotionSheet(box));
  }
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

    title.textContent = 'ほぞん しています';
    const name = (S.proj.name || 'anime') + '.' + r.ext;
    const how = await saveVideo(r.blob, name);
    const mb = (r.blob.size / 1048576).toFixed(1);
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
