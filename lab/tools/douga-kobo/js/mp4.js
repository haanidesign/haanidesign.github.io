/* MP4（H.264）で 書き出す。
   本命 … WebCodecs で 1コマずつ 焼いて、mp4-muxer で MP4 の 箱に 詰める。
   音は タイムラインの とおりに まぜてから AAC に する。
   WebCodecs が ない 端末は、これまでどおり 通しで 録る やり方に まわす。 */
import { S, clamp, duration, allClips, r2 } from './state.js?v=70';
import { MEDIA, animFrameAt } from './media.js?v=70';
import { renderOut, outCanvas, activeClips, setQuality, quality } from './render.js?v=70';
import { fadeAlpha } from './render.js?v=70';

const even = n => Math.max(2, Math.round(n / 2) * 2);

export const hasCodecs = () =>
  typeof VideoEncoder !== 'undefined' && typeof window.Mp4Muxer !== 'undefined';

/* H.264 が いちばん よく 見られる。だめな ブラウザだけ VP9／AV1 に 落とす。
   どれでも 箱は MP4 の まま（mp4-muxer が 受けつける） */
async function pickCodec(width, height, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  const list = [
    ['avc1.640034', 'avc'], ['avc1.640033', 'avc'], ['avc1.640032', 'avc'], ['avc1.640028', 'avc'],
    ['avc1.4d0034', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42003e', 'avc'],
    ['avc1.42002a', 'avc'], ['avc1.42001f', 'avc'],
    ['vp09.00.10.08', 'vp9'], ['av01.0.08M.08', 'av1'], ['av01.0.04M.08', 'av1']
  ];
  for (const [codec, box] of list) {
    try {
      const cfg = { codec, width, height, bitrate, framerate: fps };
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r && r.supported) return { cfg, box };
    } catch (_) { }
  }
  return null;
}

/* ---------- 1コマぶん、動画を その時こくに あわせる ---------- */
function seekTo(el, want, fps) {
  return new Promise(res => {
    if (Math.abs(el.currentTime - want) < 1 / (fps * 2)) { res(); return; }
    let done = false;
    const ok = () => { if (done) return; done = true; el.removeEventListener('seeked', ok); res(); };
    el.addEventListener('seeked', ok);
    try { el.currentTime = want; } catch (e) { ok(); }
    setTimeout(ok, 400);                 // うごかない ときも 止まらない ように
  });
}
async function prepareFrame(t, fps) {
  const jobs = [];
  for (const { c } of activeClips(t)) {
    if (!c.mid) continue;
    const m = MEDIA.get(c.mid);
    if (m && m.anim) { jobs.push(animFrameAt(m, (t - c.start) * (c.speed || 1))); continue; }
    if (!m || m.kind !== 'video') continue;
    if (!m.el.paused) m.el.pause();
    const want = clamp(c.inp + (t - c.start) * (c.speed || 1), 0, Math.max(0, m.dur - 0.03));
    jobs.push(seekTo(m.el, want, fps));
  }
  if (jobs.length) await Promise.all(jobs);
}

/* ---------- 音を タイムラインの とおりに まぜる ---------- */
const decCache = new Map();
async function decode(m) {
  if (m.abuf) return m.abuf;               // 音は もう 読んで ある
  if (decCache.has(m.id)) return decCache.get(m.id);
  if (!m.file) return null;
  try {
    const bytes = await m.file.arrayBuffer();
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const ab = await oc.decodeAudioData(bytes);
    decCache.set(m.id, ab);
    return ab;
  } catch (e) { decCache.set(m.id, null); return null; }
}
export function clearAudioCache() { decCache.clear(); }

export async function mixAudio(dur, onProgress) {
  const rate = 48000;
  const jobs = [];
  for (const { c, t: tr } of allClips()) {
    if (tr.mute || tr.hidden) continue;        // 🔇 でも 🚫 でも 音は 入らない
    if (!c.mid) continue;
    const m = MEDIA.get(c.mid);
    if (!m || m.kind === 'image') continue;
    jobs.push({ c, m });
  }
  if (!jobs.length) return null;
  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor(2, Math.max(1, Math.ceil(dur * rate)), rate);
  let used = 0;
  for (const { c, m } of jobs) {
    const ab = await decode(m);
    onProgress && onProgress();
    if (!ab) continue;
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.playbackRate.value = c.speed || 1;
    const g = ctx.createGain();
    const v = clamp(c.vol === undefined ? 1 : c.vol, 0, 2);
    const s = Math.max(0, c.start), e = s + c.dur;
    g.gain.setValueAtTime(c.fin > 0 ? 0 : v, s);
    if (c.fin > 0) g.gain.linearRampToValueAtTime(v, Math.min(e, s + c.fin));
    if (c.fout > 0) {
      g.gain.setValueAtTime(v, Math.max(s, e - c.fout));
      g.gain.linearRampToValueAtTime(0, e);
    }
    src.connect(g); g.connect(ctx.destination);
    try {
      src.start(s, clamp(c.inp, 0, ab.duration), Math.min(c.dur * (c.speed || 1), Math.max(0, ab.duration - c.inp)));
      used++;
    } catch (err) { }
  }
  if (!used) return null;
  return await ctx.startRendering();
}

async function pickAudioCodec(buf) {
  if (!buf || typeof AudioEncoder === 'undefined') return null;
  for (const [codec, box] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = {
      codec, sampleRate: buf.sampleRate,
      numberOfChannels: Math.min(2, buf.numberOfChannels), bitrate: 160000
    };
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r && r.supported) return { cfg, box };
    } catch (_) { }
  }
  return null;
}
async function encodeAudio(muxer, cfg, buf, dur) {
  let failed = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { failed = e; }
  });
  enc.configure(cfg);
  const rate = cfg.sampleRate, ch = cfg.numberOfChannels;
  const total = Math.min(buf.length, Math.floor(dur * rate));
  const block = 4096;
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  for (let i = 0; i < total; i += block) {
    const n = Math.min(block, total - i);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) {
      const src = chans[c];
      for (let j = 0; j < n; j++) data[c * n + j] = src[i + j] || 0;
    }
    const ad = new AudioData({
      format: 'f32-planar', sampleRate: rate,
      numberOfFrames: n, numberOfChannels: ch,
      timestamp: Math.round((i / rate) * 1e6), data
    });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 4));
    if (failed) break;
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;
}

/* ---------- 本体 ---------- */
export async function exportMp4({ fps = S.fps, bitrate = 12000000, onProgress = () => { }, shouldStop = () => false } = {}) {
  if (!hasCodecs()) return null;
  const width = even(S.W), height = even(S.H);
  const v = await pickCodec(width, height, fps, bitrate);
  if (!v) return null;
  const cfg = v.cfg;

  const dur = duration();
  const total = Math.max(1, Math.ceil(dur * fps));
  const keepQ = quality();
  setQuality(1);                       // 書き出しは いつも 原寸

  onProgress(0, '音を まぜています');
  let abuf = null, a = null;
  try {
    abuf = await mixAudio(dur);
    a = await pickAudioCodec(abuf);
  } catch (e) { abuf = null; a = null; }
  const acfg = a ? a.cfg : null;

  const Mux = window.Mp4Muxer;
  const muxer = new Mux.Muxer({
    target: new Mux.ArrayBufferTarget(),
    video: { codec: v.box, width, height, frameRate: fps },
    ...(acfg ? { audio: { codec: a.box, numberOfChannels: acfg.numberOfChannels, sampleRate: acfg.sampleRate } } : {}),
    fastStart: 'in-memory'
  });

  let failed = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failed = e; }
  });
  enc.configure(cfg);

  const cv = outCanvas();
  const usPer = 1e6 / fps;
  for (let i = 0; i < total; i++) {
    if (shouldStop()) { setQuality(keepQ); try { enc.close(); } catch (e) { } throw new Error('やめました'); }
    if (failed) throw failed;
    const t = i / fps;
    await prepareFrame(t, fps);
    renderOut(t);
    const frame = new VideoFrame(cv, {
      timestamp: Math.round(i * usPer), duration: Math.round(usPer)
    });
    enc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (enc.encodeQueueSize > 8) {
      await new Promise(r => setTimeout(r, 0));
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 4));
    }
    if (i % 3 === 0) onProgress(i / total, '絵を 焼いています');
  }
  await enc.flush(); enc.close();
  if (failed) throw failed;

  if (acfg && abuf) {
    onProgress(.97, '音を 詰めています');
    await encodeAudio(muxer, acfg, abuf, dur);
  }
  muxer.finalize();
  setQuality(keepQ);
  onProgress(1, 'できました');
  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    codec: v.box,
    noAudio: !acfg && allClips().some(({ c }) => c.kind === 'audio' || c.kind === 'video')
  };
}
