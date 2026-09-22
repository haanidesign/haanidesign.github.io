/* 素材（動画・画像・音）の とりこみと 音の つなぎ。 */
import { S, uid, r2, toast, clamp } from './state.js?v=4';
import { bus } from './bus.js?v=4';
import { analyse } from './beat.js?v=4';

export const MEDIA = new Map();

/* 音や 動画の もとは 画面の 外に 置いて おく。
   ぶら下げずに 持って いるだけだと、端末に よっては 鳴らない。 */
let yard = null;
function stash(el) {
  if (!yard) {
    yard = document.createElement('div');
    yard.id = 'mediayard';
    yard.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(yard);
  }
  yard.appendChild(el);
}

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
/** 書き出しの ときに まとめて 取る ための つなぎ口 */
export const recNode = () => recDest;

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
      el.setAttribute('playsinline', '');
      m.el = el;
      stash(el);
      let settled = false;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        m.elOk = ok;
        if (ok) {
          const d = el.duration;
          if (isFinite(d) && d > 0) m.dur = d;
          if (kind === 'video') { m.w = el.videoWidth || S.W; m.h = el.videoHeight || S.H; makePoster(m); }
        }
        bus.all();
        done();
      };
      el.addEventListener('loadedmetadata', () => settle(true), { once: true });
      el.addEventListener('error', () => settle(false), { once: true });
      /* 端末に よっては どちらも 上がって こない ことが ある。
         そのままだと とりこみが 終わらないので、待ちきれたら 先へ 進む。 */
      setTimeout(() => settle(el.readyState >= 1), 6000);
      el.addEventListener('seeked', () => { if (!S.playing) bus.stage(); });
      /* 音の 中身を 見るのは 音の ファイルと、小さめの 動画だけ。
         大きい 動画を まるごと 読むと 端末の メモリが 足りなく なる。 */
      if (kind === 'audio' || file.size < 80 * 1024 * 1024) analyse2(m, file);
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

/* 音の 中身を 見る。
     ・帯に えがく 波
     ・曲の はやさ（BPM）
     ・<audio> が 鳴らせない 音は、ここで 読んだ ものから 作り直して 差し替える
   ここが 動くと、端末が そのままでは 鳴らせない WAV でも 鳴る ように なる。 */
async function analyse2(m, file) {
  let ab = null;
  try {
    const bytes = await file.arrayBuffer();
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    // decodeAudioData は もらった 箱を からに する ことが あるので 写しを わたす
    ab = await oc.decodeAudioData(bytes.slice(0));
  } catch (e) {
    m.decOk = false;
    if (m.elOk === false) brokenMsg(m);
    bus.all();
    return;
  }
  m.decOk = true;

  if (m.kind === 'audio') {
    m.abuf = ab;                       // ← これを 鳴らす
    if (isFinite(ab.duration) && ab.duration > 0) m.dur = ab.duration;
    const ch = ab.getChannelData(0);
    const N = 1600, step = Math.max(1, Math.floor(ch.length / N));
    const peaks = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let mx = 0;
      for (let j = 0; j < step; j += 4) { const v = Math.abs(ch[i * step + j] || 0); if (v > mx) mx = v; }
      peaks[i] = mx;
    }
    m.peaks = peaks;
  }

  try {
    const a = analyse(ab);
    m.bpm = a.bpm; m.offset = a.offset;
    bus.beat(m);
  } catch (e) { }

  /* 鳴らせない ときの 立て直し。
     読めた 音を 16ビットの WAV に し直して、そちらを 鳴らす。 */
  if (m.elOk === false && m.kind === 'audio') {
    try {
      const blob = toWav(ab);
      URL.revokeObjectURL(m.url);
      m.url = URL.createObjectURL(blob);
      m.file = new File([blob], m.name, { type: 'audio/wav' });
      m.el.src = m.url;
      m.el.load();
      m.elOk = null;
      m.el.addEventListener('loadedmetadata', () => {
        m.elOk = true;
        if (isFinite(m.el.duration) && m.el.duration > 0) m.dur = m.el.duration;
        bus.all();
      }, { once: true });
      m.el.addEventListener('error', () => { brokenMsg(m); }, { once: true });
      toast(m.name + ' を 読みなおしました', 2600);
    } catch (e) { brokenMsg(m); }
  }
  bus.all();
}

function brokenMsg(m) {
  m.broken = true;
  toast(m.name + ' は この 端末で 鳴らせません', 3400);
}

/** AudioBuffer を 16ビットの WAV に する（どの 端末でも 鳴る かたち） */
export function toWav(ab) {
  const ch = Math.min(2, ab.numberOfChannels), rate = ab.sampleRate, n = ab.length;
  const data = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(data);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(ab.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let x = chans[c][i];
      x = x < -1 ? -1 : x > 1 ? 1 : x;
      v.setInt16(o, x * 32767, true); o += 2;
    }
  }
  return new Blob([data], { type: 'audio/wav' });
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
