/* さいせいと 書き出し。 */
import { S, clamp, r2, toast, duration, $ } from './state.js';
import { MEDIA, audioCtx, recStream, recNode, hookAudio, hookAll } from './media.js';
import { allClips } from './state.js';
import { activeClips, fadeAlpha, renderStage, canvas } from './render.js';
import { bus } from './bus.js';

let raf = 0, t0 = 0, base = 0;

/* ---------- 音（音だけの ふだ）は Web Audio で 鳴らす ----------
   <audio> を そのまま 鳴らす やり方だと、端末に よっては
   鳴らない・音の 大きさが 変えられない ことが ある。
   読みこむ ときに もう 中身を 数字に して ある ので、それを 直に 鳴らす。 */
let voices = [];
export function stopVoices() {
  voices.forEach(v => { try { v.src.stop(); } catch (e) { } });
  voices = [];
}
export function startVoices(from) {
  stopVoices();
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime + 0.06;       // 少し 先から ならべる
  for (const { c, t: tr } of allClips()) {
    if (c.kind !== 'audio' || !c.mid) continue;
    if (tr.mute) continue;
    const m = MEDIA.get(c.mid);
    if (!m || !m.abuf) continue;
    const end = c.start + c.dur;
    if (end <= from) continue;
    const src = ac.createBufferSource();
    src.buffer = m.abuf;
    src.playbackRate.value = c.speed || 1;
    const g = ac.createGain();
    const v = clamp(c.vol === undefined ? 1 : c.vol, 0, 2);
    const startAt = Math.max(c.start, from);
    const when = t0 + (startAt - from);
    const offset = clamp(c.inp + (startAt - c.start) * (c.speed || 1), 0, Math.max(0, m.abuf.duration - .01));
    const len = Math.max(0, (end - startAt) * (c.speed || 1));
    // 入り・出の ぼかし
    const fin = c.fin > 0 ? Math.max(0, c.start + c.fin - startAt) : 0;
    const fout = c.fout > 0 ? c.fout : 0;
    g.gain.setValueAtTime(fin > 0 ? 0.0001 : v, when);
    if (fin > 0) g.gain.linearRampToValueAtTime(v, when + fin);
    if (fout > 0) {
      const outAt = when + Math.max(0, (end - fout - startAt));
      g.gain.setValueAtTime(v, outAt);
      g.gain.linearRampToValueAtTime(0.0001, when + (end - startAt));
    }
    src.connect(g);
    g.connect(ac.destination);
    const rd = recNode();                      // 通しで 録る ときにも 入る ように
    if (rd) { try { g.connect(rd); } catch (e) { } }
    try { src.start(when, offset, len); } catch (e) { continue; }
    voices.push({ src, g });
  }
}
export function syncMedia(t) {
  const on = new Set();
  for (const { c, tr } of activeClips(t)) {
    if (!c.mid) continue;
    const m = MEDIA.get(c.mid);
    if (!m || m.kind === 'image') continue;
    if (m.kind === 'audio' && m.abuf) continue;   // これは Web Audio で 鳴らす
    on.add(m.id);
    const want = clamp(c.inp + (t - c.start) * (c.speed || 1), 0, Math.max(0, m.dur - 0.02));
    m.el.volume = tr.mute ? 0 : clamp(c.vol * fadeAlpha(c, t - c.start), 0, 1);
    m.el.playbackRate = c.speed || 1;
    if (S.playing) {
      if (Math.abs(m.el.currentTime - want) > 0.25) m.el.currentTime = want;
      if (m.el.paused) { hookAudio(m); m.el.play().catch(() => { }); }
    } else {
      if (!m.el.paused) m.el.pause();
      if (Math.abs(m.el.currentTime - want) > 0.03) m.el.currentTime = want;
    }
  }
  MEDIA.forEach(m => {
    if (m.kind !== 'image' && !on.has(m.id) && !m.el.paused) m.el.pause();
  });
}
const stopAll = () => MEDIA.forEach(m => { if (m.kind !== 'image' && !m.el.paused) m.el.pause(); });

export function seek(t) {
  stopVoices();
  S.time = clamp(t, 0, duration());
  syncMedia(S.time);
  renderStage(S.time);
  bus.tick();
}
function loop(ts) {
  if (!S.playing) return;
  if (!t0) t0 = ts;
  S.time = base + (ts - t0) / 1000;
  const L = S.loop;
  if (L && L.on && L.b > L.a && S.time >= L.b) {
    S.time = L.a; base = L.a; t0 = ts;          // くりかえし
    startVoices(S.time);
  }
  if (S.time >= duration()) { S.time = duration(); pause(); bus.tick(); return; }
  syncMedia(S.time);
  renderStage(S.time, false);
  bus.tick();
  raf = requestAnimationFrame(loop);
}
export function play() {
  if (S.playing) return;
  const L = S.loop;
  if (L && L.on && L.b > L.a && (S.time < L.a || S.time >= L.b)) S.time = L.a;
  else if (S.time >= duration() - 0.02) S.time = 0;
  audioCtx();
  S.playing = true; base = S.time; t0 = 0;
  startVoices(S.time);
  bus.play();
  raf = requestAnimationFrame(loop);
}
export function pause() {
  if (!S.playing) { stopAll(); return; }
  S.playing = false;
  cancelAnimationFrame(raf);
  stopVoices();
  stopAll();
  bus.play();
  renderStage(S.time);
}
export const toggle = () => S.playing ? pause() : play();

/* ---- 書き出し（通しで 録る） ---- */
let REC = null, cancelled = false;

export function canExport() {
  return typeof MediaRecorder !== 'undefined' && !!canvas().captureStream;
}
export function cancelExport() {
  cancelled = true;
  if (REC && REC.state !== 'inactive') REC.stop();
  pause();
}
export async function exportMovie({ name = 'douga', bps = 8000000 } = {}) {
  if (!canExport()) { toast('この ブラウザでは 書き出せない'); return; }
  const dur = duration();
  pause(); cancelled = false;
  audioCtx(); hookAll();

  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    .filter(t => MediaRecorder.isTypeSupported(t));
  if (!types.length) { toast('この ブラウザでは 書き出せない'); return; }
  const type = types[0];

  const vs = canvas().captureStream(S.fps);
  const tracks = [...vs.getVideoTracks()];
  const as = recStream();
  if (as) tracks.push(...as.getAudioTracks());
  const chunks = [];
  REC = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: bps });
  REC.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  const finished = new Promise(res => {
    REC.onstop = () => {
      REC = null;
      if (cancelled || !chunks.length) { res(null); return; }
      const blob = new Blob(chunks, { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + (type.includes('mp4') ? '.mp4' : '.webm');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      res(blob);
    };
  });

  seek(0);
  await new Promise(r => setTimeout(r, 400));
  REC.start(200);
  play();
  await new Promise(res => {
    const iv = setInterval(() => {
      bus.progress(clamp(S.time / dur, 0, 1));
      if (cancelled || !S.playing || S.time >= dur - 0.01) {
        clearInterval(iv);
        setTimeout(() => { if (REC && REC.state !== 'inactive') REC.stop(); pause(); res(); }, 320);
      }
    }, 100);
  });
  const blob = await finished;
  if (cancelled) toast('やめた');
  else if (blob) toast('書き出した（' + r2(blob.size / 1048576) + 'MB）', 3000);
  return blob;
}
