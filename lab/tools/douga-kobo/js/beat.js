/* 曲の はやさ（BPM）を さがして、拍の ものさしを つくる。
   やりかたは アニメ工房の 口パク解析と 同じ すじみち。
     ① みじかい きざみ ごとに 音の 大きさを 出す
     ② 大きく なった ところ（たたいた ところ）だけ のこす
     ③ ずらしながら くらべて、いちばん よく かさなる ずれを さがす */
import { S, clamp, r2 } from './state.js?v=51';

const SLOT = 0.02;

export function envelope(buf, slot = SLOT) {
  const n = Math.max(1, Math.floor(buf.duration / slot));
  const out = new Float32Array(n);
  const per = Math.floor(buf.sampleRate * slot);
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    const from = i * per, to = Math.min(chans[0].length, from + per);
    let sum = 0, count = 0;
    for (const d of chans) {
      for (let k = from; k < to; k += 2) { sum += d[k] * d[k]; count++; }
    }
    out[i] = count ? Math.sqrt(sum / count) : 0;
  }
  return out;
}

/** 強くなった ぶんだけ のこした もの（たたいた ところ） */
function onsets(env) {
  const on = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) { const d = env[i] - env[i - 1]; on[i] = d > 0 ? d : 0; }
  let mean = 0;
  for (let i = 0; i < on.length; i++) mean += on[i];
  mean /= on.length || 1;
  for (let i = 0; i < on.length; i++) on[i] -= mean;
  return on;
}

export function guessBpm(env, slot = SLOT) {
  if (!env || env.length < 50) return null;
  const on = onsets(env);
  const minLag = Math.round((60 / 200) / slot);
  const maxLag = Math.round((60 / 60) / slot);
  let best = { lag: 0, score: -Infinity };
  for (let lag = minLag; lag <= maxLag && lag < on.length / 2; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < on.length; i++) sum += on[i] * on[i + lag];
    const score = sum / (on.length - lag);
    if (score > best.score) best = { lag, score };
  }
  if (!best.lag) return null;
  let bpm = 60 / (best.lag * slot);
  while (bpm < 70) bpm *= 2;
  while (bpm > 190) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

/** 拍の あたま。BPM の きざみに いちばん よく のる ずらしを さがす */
export function guessOffset(env, bpm, slot = SLOT) {
  if (!env || !bpm) return 0;
  const on = onsets(env);
  const step = (60 / bpm) / slot;
  let best = { off: 0, score: -Infinity };
  for (let off = 0; off < step; off += 0.25) {
    let sum = 0, n = 0;
    for (let x = off; x < on.length; x += step) {
      const i = Math.round(x);
      if (i >= 0 && i < on.length) { sum += on[i]; n++; }
    }
    if (n && sum / n > best.score) best = { off, score: sum / n };
  }
  return +(best.off * slot).toFixed(3);
}

export function analyse(audioBuffer) {
  const env = envelope(audioBuffer);
  const bpm = guessBpm(env);
  return { env, bpm, offset: bpm ? guessOffset(env, bpm) : 0 };
}

/* ---------- 拍の ものさし ---------- */
export const beatOn = () => !!(S.beat && S.beat.on && S.beat.bpm > 0);
export const beatSec = () => S.beat && S.beat.bpm ? 60 / S.beat.bpm : 0.5;
/** きざみ（div=1 は 1拍、2 は 8分、.25 は 1小節ぶん） */
export const stepSec = () => beatSec() / (S.beat ? S.beat.div : 1);

/** t に いちばん 近い きざみの 時こく */
export function nearestStep(t) {
  const st = stepSec(), off = S.beat.offset || 0;
  return off + Math.round((t - off) / st) * st;
}
/** n 番目の きざみ */
export const stepTime = n => (S.beat.offset || 0) + n * stepSec();
/** その 時こくが 小節の あたまか（4拍で 1小節） */
export const isBar = n => (S.beat.per || 4) > 0 && n % ((S.beat.per || 4) * (S.beat.div || 1)) === 0;

/** いまの 時こくが 拍の どこに いるか（0〜1）。文字の うごきを 拍に のせる ため */
export function beatPhase(t) {
  if (!beatOn()) return 0;
  const b = beatSec(), off = S.beat.offset || 0;
  const x = (t - off) / b;
  return x - Math.floor(x);
}
/** いまが 何拍目か（小数・マイナスも あり） */
export function beatAt(t) {
  if (!beatOn()) return 0;
  return (t - (S.beat.offset || 0)) / beatSec();
}

export function tapTempo(store) {
  const now = performance.now() / 1000;
  store.taps = (store.taps || []).filter(x => now - x < 3).concat(now);
  if (store.taps.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < store.taps.length; i++) gaps.push(store.taps[i] - store.taps[i - 1]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (!avg) return null;
  let bpm = 60 / avg;
  while (bpm < 70) bpm *= 2;
  while (bpm > 190) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
