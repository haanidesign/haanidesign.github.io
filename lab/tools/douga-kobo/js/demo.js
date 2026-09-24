/* 同梱の おためし さくひん。
   曲も その場で つくる ので、なにも 落とさずに 開いて すぐ 動く。
   さわって みる ところ：拍・もじの うごき・かざり・いろ・しあげ。 */
import { S, uid, newTrack, newClip, resetHist, toast } from './state.js?v=62';
import { MEDIA, importFiles, toWav } from './media.js?v=62';
import { bus } from './bus.js?v=62';

const BPM = 120;
const BEAT = 60 / BPM;          // 0.5秒
const BARS = 4;
const DUR = BEAT * 4 * BARS;    // 8秒

/* ---------- 曲を つくる ---------- */
function makeSong() {
  const sr = 44100;
  const n = Math.floor(sr * DUR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const put = (i, v) => { if (i >= 0 && i < n) { L[i] += v; R[i] += v; } };

  // ドン（キック）… 1拍ごと
  for (let b = 0; b < 4 * BARS; b++) {
    const s0 = Math.floor(b * BEAT * sr);
    for (let i = 0; i < sr * 0.18; i++) {
      const t = i / sr;
      const f = 120 * Math.exp(-t * 28) + 48;
      put(s0 + i, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) * 0.85);
    }
  }
  // パン（スネア）… 2・4拍
  for (let b = 1; b < 4 * BARS; b += 2) {
    const s0 = Math.floor(b * BEAT * sr);
    for (let i = 0; i < sr * 0.12; i++) {
      const t = i / sr;
      put(s0 + i, (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.35);
    }
  }
  // チッ（ハイハット）… 8分
  for (let b = 0; b < 8 * BARS; b++) {
    const s0 = Math.floor(b * BEAT / 2 * sr);
    for (let i = 0; i < sr * 0.04; i++) {
      const t = i / sr;
      put(s0 + i, (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.12);
    }
  }
  // ベースと うわもの（Am - F - C - G）
  const roots = [110, 87.31, 130.81, 98];
  const thirds = [1.2, 1.26, 1.26, 1.26];
  for (let bar = 0; bar < BARS; bar++) {
    const f = roots[bar % roots.length];
    const s0 = Math.floor(bar * 4 * BEAT * sr);
    const len = Math.floor(4 * BEAT * sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 6) * Math.exp(-t * 0.5);
      // ベース
      let v = Math.sin(2 * Math.PI * f * t) * 0.22 * env;
      // うわもの（3度・5度）
      v += Math.sin(2 * Math.PI * f * 2 * thirds[bar % 4] * t) * 0.07 * env;
      v += Math.sin(2 * Math.PI * f * 3 * t) * 0.05 * env;
      put(s0 + i, v);
    }
  }
  // つぶれない ように ならす
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]));
  const g = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < n; i++) { L[i] *= g; R[i] = L[i]; }

  const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctor(2, n, sr);
  const buf = ctx.createBuffer(2, n, sr);
  buf.copyToChannel(L, 0); buf.copyToChannel(R, 1);
  return new File([toWav(buf)], 'デモの 曲.wav', { type: 'audio/wav' });
}

/* ---------- ならべる ---------- */
const bar = n => n * 4 * BEAT;

function lyricClip(str, at, len, extra = {}) {
  const c = newClip('text', { name: 'うた', start: at, dur: len });
  Object.assign(c.text, {
    str, size: 108, color: '#FFFEF7', stroke: '#1E1C14', sw: 10,
    fxIn: 'up', fxOut: 'fade', unit: 'char', order: 'fwd',
    stagger: .04, inBeat: .5, outBeat: .5, ease: 'out'
  }, extra.text || {});
  delete extra.text;
  Object.assign(c, extra);
  return c;
}
function colorClip(col, col2, at, len) {
  const c = newClip('color', { name: 'いろ', start: at, dur: len });
  c.color = col; c.color2 = col2; c.grad = true; c.gradDir = 60;
  c.fin = .12; c.fout = .12;
  return c;
}

export async function openDemo() {
  S.W = 1280; S.H = 720; S.fps = 30; S.bg = '#101010';
  S.name = 'デモ';
  S.docId = 'demo' + uid();
  S.beat = { bpm: BPM, offset: 0, div: 1, per: 4, on: true, grid: true };
  S.master = { br: 102, ct: 108, sa: 106, vignette: .38, grain: .12, rgb: .06, flash: .22, shake: .1, zoom: .18 };
  S.loop = { on: false, a: 0, b: 0 };
  S.time = 0; S.sel = null; S.selTrack = null;
  MEDIA.clear();

  const tText = newTrack('text', '文字 1');
  const tOver = newTrack('video', '映像 2');
  const tBg = newTrack('video', '映像 1');
  const tSnd = newTrack('audio', '音 1');
  S.tracks = [tText, tOver, tBg, tSnd];

  // だいめい と 歌詞
  tText.clips.push(lyricClip('動画工房', 0, bar(1), {
    text: {
      size: 150, fxIn: 'zoomout', fxOut: 'zoomin', fxLoop: 'zoombeat',
      unit: 'all', inBeat: .25, ease: 'back', loopAmt: .8,
      grad: true, color: '#E1DD60', color2: '#F2A0B8', gradDir: 0
    }
  }));
  tText.clips.push(lyricClip('拍に のせて', bar(1), bar(1), {
    text: { fxIn: 'pop', fxLoop: 'bounce', order: 'fwd', stagger: .05, loopAmt: 1 }
  }));
  tText.clips.push(lyricClip('ひかる もじ', bar(2), bar(1), {
    text: {
      fxIn: 'slide', order: 'center', dist: 320, angle: 90, stagger: .035,
      glowOn: true, glowColor: '#00E5FF', glowSize: 26, sw: 0, color: '#FFFEF7'
    }
  }));
  tText.clips.push(lyricClip('さわって みて', bar(3), bar(1), {
    text: {
      fxIn: 'scatter', fxOut: 'scatter', order: 'random', stagger: .02,
      inBeat: 1, outBeat: .5, shadowOn: true, shadowColor: '#F2A0B8',
      shadowX: 10, shadowY: 10, curve: 24
    }
  }));

  // 下じきの いろ（1小節ごと）
  const cols = [['#1E1C14', '#3a3660'], ['#0047BB', '#00E5FF'],
  ['#B8B43F', '#E1DD60'], ['#F2A0B8', '#FF5C00']];
  cols.forEach((cc, i) => tBg.clips.push(colorClip(cc[0], cc[1], bar(i), bar(1))));

  // 曲
  const file = makeSong();
  await new Promise(res => importFiles([file], res));
  const m = [...MEDIA.values()].find(x => x.kind === 'audio');
  if (m) {
    const c = newClip('audio', { mid: m.id, name: m.name, start: 0, dur: DUR, inp: 0 });
    c.fout = .4;
    tSnd.clips.push(c);
  }

  resetHist();
  bus.size(); bus.all(); bus.fit();
  toast('デモを ひらきました。▶ で さいせい', 3200);
}
