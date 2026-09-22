/* 全部を つなぐ ところ。 */
import {
  S, $, $$, clamp, r2, tc, toast, duration, allClips, findClip, selected,
  bootProject, resetHist, snap as pushUndo, undo, redo, canUndo, canRedo
} from './state.js';
import { wire, bus } from './bus.js';
import { MEDIA, importFiles, hookAll } from './media.js';
import { useCanvas, renderStage } from './render.js';
import { seek, play, pause, toggle, exportMovie, cancelExport, canExport } from './play.js';
import { exportMp4, hasCodecs, clearAudioCache } from './mp4.js';
import { beatOn, beatSec, beatAt } from './beat.js';
import * as TL from './ui/timeline.js';
import * as P from './ui/panel.js';
import { attachTaps, attachStage, attachPinchZoom } from './ui/gesture.js';
import {
  addFromMedia, addText, addColor, delSel, dupSel, openProject, relink
} from './edit.js';
import { addFontFile } from './text.js';
import { makePack, openPack } from './pack.js';
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
  if (S.timeMode === 'bar' && beatOn()) {
    const per = S.beat.per || 4;
    const bt = Math.max(0, beatAt(S.time));
    const bar = Math.floor(bt / per) + 1, be = Math.floor(bt % per) + 1;
    $('#tnow').textContent = bar + ':' + be;
    $('#tdur').textContent = Math.round(S.time * S.fps) + 'f';
  } else {
    $('#tnow').textContent = tc(S.time);
    $('#tdur').textContent = r2(duration()) + 's';
  }
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
  canMp4: () => hasCodecs(),
  replaceMedia: id => { swapId = id; $('#fileSwap').click(); },
  wip: startWip,
  pack: async name => {
    if (!allClips().length) { toast('まだ なにも 置いていない'); return; }
    busy(true, 'ひとまとめに しています'); prog(.1);
    try {
      const blob = await makePack(name);
      prog(1);
      save(blob, (name || 'douga') + '.zip');
      toast('ひとまとめに した（' + r2(blob.size / 1048576) + 'MB）', 3000);
    } catch (e) { toast('まとめられなかった'); }
    finally { busy(false); }
  },
  cancelDrag: () => TL.cancelDrag(),
  progress: p => {
    $('#busyFill').style.width = Math.round(p * 100) + '%';
    $('#busyPct').textContent = Math.round(p * 100) + '%';
  },
  beat: m => {
    // はじめての 音から、曲の はやさを もらって おく
    if (m && m.bpm && !S.beat.bpm) {
      S.beat.bpm = m.bpm; S.beat.offset = m.offset || 0; S.beat.on = true;
      toast('はやさ BPM ' + m.bpm + ' が 見つかった', 2600);
    }
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
$('#export').onclick = () => P.open('file');

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
$('#tnum').onclick = () => {
  S.timeMode = S.timeMode === 'bar' ? 'sec' : 'bar';
  if (S.timeMode === 'bar' && !beatOn()) { toast('さきに BPM を きめて'); S.timeMode = 'sec'; }
  tick();
};
$('#loop').onclick = e => {
  const L = S.loop;
  const f = selected();
  if (!L.on) {
    if (f) { L.a = f.c.start; L.b = f.c.start + f.c.dur; }
    else if (L.b <= L.a) { L.a = 0; L.b = duration(); }
    L.on = true;
    toast(`${r2(L.a)}s 〜 ${r2(L.b)}s を くりかえす`);
  } else L.on = false;
  e.currentTarget.classList.toggle('on', L.on);
  drawAll();
};
$('#shot').onclick = () => {
  renderStage(S.time, false);
  const cvs = cv;
  cvs.toBlob(bl => {
    if (!bl) { toast('出せなかった'); return; }
    save(bl, 'koma_' + Math.round(S.time * S.fps) + 'f.png');
    toast('いまの 絵を 出した');
    renderStage(S.time);
  }, 'image/png');
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
$('#tBeat').onclick = () => P.open('beat');
$('#tForm').onclick = () => P.open('form');
$('#tMaster').onclick = () => P.open('master');
$('#tTrack').onclick = () => P.open('track');
$('#tFile').onclick = () => P.open('file');
$('#help').onclick = () => P.open('help');

/* ---------- ファイル ---------- */
$('#file').onchange = e => { importFiles(e.target.files, relink); e.target.value = ''; };
$('#fileProj').onchange = e => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; };
/* 素材の 差し替え。ふだは そのままで 中身だけ 入れかえる */
let swapId = null;
$('#fileSwap').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  const old = swapId && MEDIA.get(swapId); swapId = null;
  if (!f || !old) return;
  importFiles([f], () => {
    const fresh = [...MEDIA.values()].find(m => m.file === f);
    if (!fresh) return;
    let n = 0;
    allClips().forEach(({ c }) => {
      if (c.mid === old.id) {
        c.mid = fresh.id; c.name = fresh.name;
        if (fresh.kind !== 'image') c.dur = Math.min(c.dur, Math.max(.1, fresh.dur - c.inp));
        n++;
      }
    });
    MEDIA.delete(old.id);
    pushUndo(); drawAll();
    toast(n + 'まいの ふだを 差し替えた');
  });
};

/* WIP の 収録（パソコンの ブラウザだけ） */
let wipRec = null;
async function startWip() {
  if (wipRec) { wipRec.stop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast('この 端末では 画面を 録れない'); return;
  }
  try {
    const st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported(t));
    const ch = [];
    wipRec = new MediaRecorder(st, { mimeType: type, videoBitsPerSecond: 6000000 });
    wipRec.ondataavailable = ev => { if (ev.data.size) ch.push(ev.data); };
    wipRec.onstop = () => {
      st.getTracks().forEach(t => t.stop());
      wipRec = null;
      $('#tFile').classList.remove('on');
      if (ch.length) save(new Blob(ch, { type }), 'wip.' + (type.includes('mp4') ? 'mp4' : 'webm'));
      toast('WIP を 出した');
    };
    st.getVideoTracks()[0].addEventListener('ended', () => { if (wipRec) wipRec.stop(); });
    wipRec.start(500);
    $('#tFile').classList.add('on');
    toast('収録を はじめた（もう一度 おすと おわり）', 2600);
  } catch (e) { toast('収録を はじめられなかった'); }
}

$('#filePack').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  busy(true, 'ひとまとめを ひらいて います'); prog(.2);
  try { await openPack(f); } catch (err) { toast('ひらけなかった'); }
  finally { busy(false); drawAll(); }
};
$('#fileFont').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const key = await addFontFile(f);
    const sel = selected();
    if (sel && sel.c.kind === 'text') { sel.c.text.font = key; pushUndo(); }
    drawAll();
    toast('書たいを 入れた');
  } catch (err) { toast('この 書たいは 読めなかった'); }
};

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
let exStop = false;

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 6000);
}
function busy(on, msg) {
  $('#busy').classList.toggle('on', !!on);
  if (msg) $('#busyMsg').textContent = msg;
}
function prog(p, msg) {
  $('#busyFill').style.width = Math.round(p * 100) + '%';
  $('#busyPct').textContent = Math.round(p * 100) + '%';
  if (msg) $('#busyMsg').textContent = msg;
}

async function doExport(opt = {}) {
  if (!allClips().length) { toast('まだ なにも 置いていない'); return; }
  const name = (opt.name || 'douga').replace(/[\\/:*?"<>|]/g, '_');
  const bps = opt.bps || 12000000;
  const wantMp4 = opt.kind !== 'webm';
  exStop = false;
  pause();
  busy(true, 'したくを して います');
  prog(0);

  if (wantMp4 && hasCodecs()) {
    try {
      const r = await exportMp4({
        fps: S.fps, bitrate: bps,
        onProgress: (p, m) => prog(p, m),
        shouldStop: () => exStop
      });
      if (r) {
        save(r.blob, name + '.' + r.ext);
        busy(false);
        clearAudioCache();
        drawAll();
        toast(r.noAudio
          ? 'MP4 に した（音は 入らなかった）'
          : 'MP4 に した（' + r2(r.blob.size / 1048576) + 'MB）', 3200);
        return;
      }
    } catch (e) {
      clearAudioCache();
      busy(false); drawAll();
      if (exStop || /やめました/.test(e && e.message)) { toast('やめた'); return; }
      toast('MP4 に できなかったので 通しで 録ります', 2600);
      await new Promise(r => setTimeout(r, 900));
    }
  }

  // 保険：画面を 通しで 録る
  if (!canExport()) { busy(false); toast('この ブラウザでは 書き出せない'); return; }
  busy(true, '通しで 録って います');
  try {
    const blob = await exportMovie({ name, bps: Math.min(bps, 16000000) });
    if (!blob) busy(false);
  } finally { busy(false); drawAll(); }
}
$('#busyCancel').onclick = () => { exStop = true; cancelExport(); };

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
