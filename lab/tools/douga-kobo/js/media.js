/* 素材（動画・画像・音）の とりこみと 音の つなぎ。 */
import { S, uid, r2, toast, clamp } from './state.js';
import { bus } from './bus.js';
import { analyse } from './beat.js';

export const MEDIA = new Map();

/* ---- 音の みち。書き出しの ときに ここから まとめて 取る ---- */
let AC = null, recDest = null;
const srcNodes = new Map();

export function audioCtx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    recDest = AC.createMediaStreamDestination();
    /* 音の みちに、聞こえない 音を 流しっぱなしに して おく。
       これが ないと、音の ない 作品で 書き出した とき
       録画係が 音を 待ちつづけて 中身が からの ファイルに なる。 */
    try {
      const src = AC.createConstantSource();
      const g = AC.createGain();
      g.gain.value = 0;
      src.connect(g); g.connect(recDest);
      src.start();
    } catch (e) { }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
export const recStream = () => recDest ? recDest.stream : null;

export function hookAudio(m) {
  if (!m || m.kind === 'image' || srcNodes.has(m.id)) return;
  try {
    const ac = audioCtx();
    const node = ac.createMediaElementSource(m.el);
    node.connect(ac.destination);
    node.connect(recDest);
    srcNodes.set(m.id, node);
  } catch (e) { /* つなげない ブラウザでは 素の音の まま */ }
}
export const hookAll = () => MEDIA.forEach(hookAudio);

/* ---- とりこみ ---- */
function kindOf(file) {
  if (file.type.startsWith('video')) return 'video';
  if (file.type.startsWith('audio')) return 'audio';
  if (file.type.startsWith('image')) return 'image';
  const e = (file.name.split('.').pop() || '').toLowerCase();
  if (['mp4', 'webm', 'mov', 'mkv', 'm4v', '3gp'].includes(e)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'opus'].includes(e)) return 'audio';
  return 'image';
}

export function importFiles(files, after) {
  const list = [...files].filter(f => f && f.size !== undefined);
  if (!list.length) return;
  let left = list.length;
  const done = () => { if (--left <= 0) { bus.all(); after && after(); } };
  list.forEach(file => {
    const kind = kindOf(file);
    const url = URL.createObjectURL(file);
    const m = { id: uid(), name: file.name, kind, url, dur: 5, w: S.W, h: S.H, poster: null, file };
    if (kind === 'image') {
      const el = new Image();
      el.addEventListener('load', () => {
        m.w = el.naturalWidth; m.h = el.naturalHeight; makePoster(m); done();
      }, { once: true });
      el.addEventListener('error', done, { once: true });
      el.src = url; m.el = el;
    } else {
      const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
      el.src = url; el.preload = 'auto'; el.playsInline = true;
      el.addEventListener('loadedmetadata', () => {
        m.dur = isFinite(el.duration) && el.duration > 0 ? el.duration : 10;
        if (kind === 'video') { m.w = el.videoWidth || S.W; m.h = el.videoHeight || S.H; makePoster(m); }
        done();
      }, { once: true });
      el.addEventListener('error', done, { once: true });
      el.addEventListener('seeked', () => { if (!S.playing) bus.stage(); });
      m.el = el;
      makePeaks(m, file);      // 動画の 中の 音も 見る（はやさ さがし の ため）
    }
    MEDIA.set(m.id, m);
  });
  toast(list.length + ' こ とりこんだ');
  bus.all();
}

/* 見本の絵を 1枚 とっておく。だなの 札にも 帯にも つかう */
function makePoster(m) {
  const grab = () => {
    const sw = m.w || 16, sh = m.h || 9;
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = Math.max(1, Math.round(192 * sh / sw));
    try { cv.getContext('2d').drawImage(m.el, 0, 0, cv.width, cv.height); m.poster = cv; }
    catch (e) { return; }
    bus.all();
  };
  if (m.kind === 'image') { m.el.complete ? grab() : m.el.addEventListener('load', grab, { once: true }); return; }
  if (m.kind !== 'video') return;
  const el = m.el;
  const onSeek = () => { grab(); el.removeEventListener('seeked', onSeek); };
  const go = () => { el.addEventListener('seeked', onSeek); el.currentTime = Math.min(0.2, m.dur / 2); };
  el.readyState >= 2 ? go() : el.addEventListener('loadeddata', go, { once: true });
}

/* 音の 波と、曲の はやさ。帯に えがく ため／拍に あわせる ため */
async function makePeaks(m, file) {
  try {
    const buf = await file.arrayBuffer();
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const ab = await oc.decodeAudioData(buf);
    if (m.kind === 'audio') {
      const ch = ab.getChannelData(0);
      const N = 1600, step = Math.max(1, Math.floor(ch.length / N));
      const peaks = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let mx = 0;
        for (let j = 0; j < step; j += 4) { const v = Math.abs(ch[i * step + j] || 0); if (v > mx) mx = v; }
        peaks[i] = mx;
      }
      m.peaks = peaks;
      m.dur = ab.duration;
    }
    const a = analyse(ab);
    m.bpm = a.bpm; m.offset = a.offset;
    bus.beat(m);
    bus.all();
  } catch (e) { /* 読めない ときは 波も はやさも あきらめる */ }
}

/* だなの 札や 帯に はる 小さい絵 */
export function paintPoster(cv, m, tile) {
  const g = cv.getContext('2d');
  g.fillStyle = '#FFFEF7'; g.fillRect(0, 0, cv.width, cv.height);
  if (!m || !m.poster) return;
  if (tile) {
    const tw = Math.max(10, Math.round(cv.height * m.poster.width / m.poster.height));
    for (let x = 0; x < cv.width; x += tw) g.drawImage(m.poster, x, 0, tw, cv.height);
    g.globalAlpha = .25; g.fillStyle = '#1E1C14';
    for (let x = tw; x < cv.width; x += tw) g.fillRect(x, 0, 1, cv.height);
    g.globalAlpha = 1;
  } else {
    const s = Math.max(cv.width / m.poster.width, cv.height / m.poster.height);
    const w = m.poster.width * s, h = m.poster.height * s;
    g.drawImage(m.poster, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }
}
export function paintPeaks(cv, m, inp, pps) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!m || !m.peaks) return;
  g.strokeStyle = 'rgba(30,28,20,.55)'; g.lineWidth = 1;
  const h = cv.height;
  for (let x = 0; x < cv.width; x++) {
    const tt = (inp + x / pps) / m.dur;
    const p = m.peaks[clamp(Math.floor(tt * m.peaks.length), 0, m.peaks.length - 1)] || 0;
    g.beginPath(); g.moveTo(x + .5, h / 2 - p * h / 2); g.lineTo(x + .5, h / 2 + p * h / 2); g.stroke();
  }
}
export const mediaLabel = m =>
  m.kind === 'image' ? `${m.w}×${m.h}` : r2(m.dur) + 's';
