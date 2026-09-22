/* 全部を つなぐ ところ。 */
import {
  S, $, $$, clamp, r2, tc, toast, duration, allClips, findClip, selected,
  bootProject, resetHist, snap as pushUndo, undo, redo, canUndo, canRedo
} from './state.js';
import { wire, bus } from './bus.js';
import { MEDIA, importFiles, hookAll } from './media.js';
import { useCanvas, renderStage } from './render.js';
import { seek, play, pause, toggle, exportMovie, cancelExport, canExport } from './play.js';
import * as TL from './ui/timeline.js';
import * as P from './ui/panel.js';
import { attachTaps, attachStage, attachPinchZoom } from './ui/gesture.js';
import {
  addFromMedia, addText, delSel, dupSel, openProject, relink
} from './edit.js';
import { trackOf } from './state.js';

const cv = $('#stageCv');
useCanvas(cv);

/* ---------- 画面の たかさ（アドレスバーの 出入りに あわせる） ---------- */
function appH() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--appH', h + 'px');
  fitStage();
}
function fitStage() {
  const box = $('#stage');
  const pad = 16;
  const bw = box.clientWidth - pad * 2, bh = box.clientHeight - pad * 2;
  if (bw <= 0 || bh <= 0) return;
  const s = Math.min(bw / S.W, bh / S.H);
  cv.style.width = Math.max(40, Math.floor(S.W * s)) + 'px';
  cv.style.height = Math.max(24, Math.floor(S.H * s)) + 'px';
}
function applySize() {
  cv.width = S.W; cv.height = S.H;
  $('#docSize').textContent = `${S.W}×${S.H} / ${S.fps}fps`;
  fitStage();
}

/* ---------- 画面の 描き直し ---------- */
function drawAll() {
  TL.drawAll();
  renderStage(S.time);
  P.draw();
  tick();
  $('#undo').disabled = !canUndo();
  $('#redo').disabled = !canRedo();
}
function tick() {
  $('#tnow').textContent = tc(S.time);
  $('#tdur').textContent = r2(duration()) + 's';
  TL.movePlayhead();
  if (S.playing) TL.follow();
}
function playUI() {
  const b = $('#play');
  b.textContent = S.playing ? '⏸' : '▶';
  b.classList.toggle('btn-p', S.playing);
  b.classList.toggle('btn-y', !S.playing);
}

wire({
  all: drawAll,
  tl: () => TL.drawAll(),
  stage: () => renderStage(S.time),
  panel: () => P.draw(),
  tick,
  play: playUI,
  seek,
  size: applySize,
  fit: () => TL.fit(),
  split: () => TL.splitHere(),
  export: doExport,
  cancelDrag: () => TL.cancelDrag(),
  progress: p => {
    $('#busyFill').style.width = Math.round(p * 100) + '%';
    $('#busyPct').textContent = Math.round(p * 100) + '%';
  },
  drop: (mid, t, tid, files) => {
    if (mid && MEDIA.get(mid)) addFromMedia(MEDIA.get(mid), t, tid ? trackOf(tid) : null);
    else if (files && files.length) importFiles(files, relink);
  }
});

/* ---------- 上バー ---------- */
$('#home').onclick = () => P.open('help');
$('#docSize').onclick = () => P.open('setting');
$('#undo').onclick = undo;
$('#redo').onclick = redo;
$('#fit').onclick = () => TL.fit();
$('#export').onclick = doExport;

/* ---------- さいせいバー ---------- */
$('#play').onclick = toggle;
$('#toStart').onclick = () => { pause(); seek(0); TL.follow(); };
$('#toEnd').onclick = () => { pause(); seek(duration()); TL.follow(); };
$('#prevF').onclick = () => { pause(); seek(S.time - 1 / S.fps); TL.follow(); };
$('#nextF').onclick = () => { pause(); seek(S.time + 1 / S.fps); TL.follow(); };
$('#cut').onclick = () => TL.splitHere();
$('#dup').onclick = dupSel;
$('#del').onclick = delSel;
$('#snap').onclick = e => { S.snap = !S.snap; e.currentTarget.classList.toggle('on', S.snap); };
$('#fold').onclick = e => {
  const f = $('#list').classList.toggle('folded');
  e.currentTarget.textContent = f ? '▴' : '▾';
  setTimeout(() => { fitStage(); TL.drawAll(); }, 60);
};
$('#tlIn').onclick = () => TL.zoomIn();
$('#tlOut').onclick = () => TL.zoomOut();

/* ---------- 道具 ---------- */
const setTool = (t) => {
  S.tool = t;
  $('#tCut').classList.toggle('on', t === 'cut');
  $('#modebar').hidden = t !== 'cut';
  $('#modeInfo').textContent = t === 'cut' ? 'ふだを さわると そこで 切れます' : '';
};
$('#tAdd').onclick = () => $('#file').click();
$('#tBin').onclick = () => P.open('bin');
$('#tCut').onclick = () => setTool(S.tool === 'cut' ? 'select' : 'cut');
$('#modeClose').onclick = () => setTool('select');
$('#tText').onclick = () => { addText(S.time); P.open('text'); };
$('#tLyric').onclick = () => P.open('lyric');
$('#tForm').onclick = () => P.open('form');
$('#tTrack').onclick = () => P.open('track');
$('#tFile').onclick = () => P.open('file');
$('#tSetting').onclick = () => P.open('setting');
$('#tHelp').onclick = () => P.open('help');

/* ---------- ファイル ---------- */
$('#file').onchange = e => { importFiles(e.target.files, relink); e.target.value = ''; };
$('#fileProj').onchange = e => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; };

/* 画面ぜんたいに おとせる */
let dragDepth = 0;
['dragenter', 'dragover'].forEach(k => document.addEventListener(k, e => {
  e.preventDefault();
  if (k === 'dragenter') dragDepth++;
  $('#drop').classList.add('on');
}));
['dragleave'].forEach(k => document.addEventListener(k, e => {
  e.preventDefault();
  if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); }
}));
document.addEventListener('drop', e => {
  dragDepth = 0; $('#drop').classList.remove('on');
  if (e.target.closest && e.target.closest('#lanes')) return;   // タイムラインは 自分で うけとる
  e.preventDefault();
  if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files, relink);
});

/* ---------- 書き出し ---------- */
async function doExport() {
  if (!allClips().length) { toast('まだ なにも 置いていない'); return; }
  if (!canExport()) { toast('この ブラウザでは 書き出せない'); return; }
  $('#busy').classList.add('on');
  $('#busyFill').style.width = '0%';
  $('#busyPct').textContent = '0%';
  $('#busyMsg').textContent = '動画を つくって います';
  try { await exportMovie({ name: 'douga', bps: 8000000 }); }
  finally { $('#busy').classList.remove('on'); drawAll(); }
}
$('#busyCancel').onclick = cancelExport;

/* ---------- キー（PCで つかう とき） ---------- */
document.addEventListener('keydown', e => {
  const t = (e.target.tagName || '').toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select' || e.target.isContentEditable) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); dupSel(); return; }
  if (ctrl) return;
  const step = e.shiftKey ? 1 : 1 / S.fps;
  switch (e.key) {
    case ' ': e.preventDefault(); toggle(); break;
    case 'ArrowLeft': e.preventDefault(); pause(); seek(S.time - step); TL.follow(); break;
    case 'ArrowRight': e.preventDefault(); pause(); seek(S.time + step); TL.follow(); break;
    case 'Home': seek(0); break;
    case 'End': seek(duration()); break;
    case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
    case 's': case 'S': TL.splitHere(); break;
    case 'Escape': S.sel = null; setTool('select'); drawAll(); break;
    case '+': case ';': TL.zoomIn(); break;
    case '-': TL.zoomOut(); break;
  }
});

/* ---------- 指の わざ ---------- */
attachTaps(undo, redo);
attachStage(cv);
attachPinchZoom($('#scroll'), (pps, at) => TL.setZoom(pps, at), TL.x2t);

/* ---------- 画面の 大きさ ---------- */
window.addEventListener('resize', () => { appH(); TL.drawAll(); });
window.addEventListener('orientationchange', () => setTimeout(() => { appH(); TL.drawAll(); }, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', appH);
window.addEventListener('beforeunload', e => {
  if (allClips().length) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- はじまり ---------- */
TL.init();
P.init();
bootProject();
applySize();
resetHist();
appH();
drawAll();
TL.setZoom(60, 0);
playUI();
setTool('select');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { });
}
