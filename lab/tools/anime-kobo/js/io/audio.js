/* 音の読みこみと、口パクのもとになる「声の大きさ」の取り出し。

   やっていること
     ① 音のファイルを 数字の波（AudioBuffer）にする
     ② 短い区間ごとに 平均の大きさ（RMS）を出す ＝ おおきさの地図
     ③ しきい値をこえた所を「しゃべっている」とみなす
     ④ その区間だけ 口のコマを ならべる

   音そのものは 重いので プロジェクトには 入れず、ここで持つ。
   じどう保存のときだけ 別に しまう。 */

const KEY_SLOT = 0.02;      // おおきさを測る きざみ（秒）

let ctx = null;
function audioCtx(){
  if(!ctx){
    const C = window.AudioContext || window.webkitAudioContext;
    if(!C) throw new Error('この端末では 音を あつかえません');
    ctx = new C();
  }
  return ctx;
}

/** 読みこんだ音（1つだけ持つ） */
export const A = {
  name: null,
  bytes: null,     // ArrayBuffer（保存用）
  buf: null,       // AudioBuffer（解析・再生用）
  env: null,       // Float32Array  おおきさの地図
  slot: KEY_SLOT,
  peak: 0
};

export const hasAudio = () => !!A.buf;

/** ファイル（または ArrayBuffer）から 読みこむ */
export async function loadAudio(fileOrBytes, name){
  const bytes = fileOrBytes instanceof ArrayBuffer
    ? fileOrBytes
    : await fileOrBytes.arrayBuffer();

  // decodeAudioData は もらった箱を からにすることがあるので、写しを渡す
  let buf;
  try{
    buf = await audioCtx().decodeAudioData(bytes.slice(0));
  }catch(err){
    throw new Error('この音は 読めませんでした（m4a・mp3・wav を ためしてね）');
  }

  A.name = name || (fileOrBytes.name || 'おと');
  A.bytes = bytes;
  A.buf = buf;
  A.env = envelope(buf, KEY_SLOT);
  A.slot = KEY_SLOT;
  A.peak = A.env.length ? Math.max(...A.env) : 0;
  return A;
}

export function clearAudio(){
  A.name = null; A.bytes = null; A.buf = null; A.env = null; A.peak = 0;
}

/** 区間ごとの 音の大きさ（RMS）。ぜんチャンネルを まぜて見る */
export function envelope(buf, slot){
  const n = Math.max(1, Math.floor(buf.duration / slot));
  const out = new Float32Array(n);
  const per = Math.floor(buf.sampleRate * slot);
  const chans = [];
  for(let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));

  for(let i = 0; i < n; i++){
    const from = i * per;
    const to = Math.min(chans[0].length, from + per);
    let sum = 0, count = 0;
    for(const d of chans){
      for(let k = from; k < to; k += 2){ sum += d[k] * d[k]; count++; }
    }
    out[i] = count ? Math.sqrt(sum / count) : 0;
  }
  return out;
}

/**
 * しゃべっている区間。
 * ・いちばん大きい所を 1 として しきい値を決める（録音の音量に左右されない）
 * ・ちょっとの すきま は つないで、口が バタつくのを ふせぐ
 */
export function speechSpans(opt = {}){
  if(!A.env) return [];
  const env = A.env, slot = A.slot;
  const peak = A.peak || 1;
  const th = peak * (opt.sense == null ? 0.12 : opt.sense);
  const bridge = Math.max(0, opt.bridge == null ? 0.12 : opt.bridge);   // つなぐ すきま（秒）
  const least  = Math.max(0, opt.least == null ? 0.06 : opt.least);     // これより短い声は 無視

  const spans = [];
  let from = -1;
  for(let i = 0; i < env.length; i++){
    const on = env[i] >= th;
    if(on && from < 0) from = i;
    if(!on && from >= 0){ spans.push([from, i]); from = -1; }
  }
  if(from >= 0) spans.push([from, env.length]);

  // すきまを つなぐ
  const joined = [];
  for(const sp of spans){
    const last = joined[joined.length - 1];
    if(last && (sp[0] - last[1]) * slot <= bridge) last[1] = sp[1];
    else joined.push(sp);
  }

  return joined
    .filter(sp => (sp[1] - sp[0]) * slot >= least)
    .map(sp => ({ from: sp[0] * slot, to: sp[1] * slot }));
}

/** その時刻の 声の大きさ（0〜1）。いちばん大きい所を 1 にそろえる */
export function loudnessAt(t){
  if(!A.env || !A.peak) return 0;
  const i = Math.floor(t / A.slot);
  if(i < 0 || i >= A.env.length) return 0;
  return Math.min(1, A.env[i] / A.peak);
}

/**
 * 声に合わせた 口のコマ を出す。
 *   frames  … つかえるコマの番号（0から）
 *   closed  … 口をとじたコマ
 * 声が大きいほど 後ろのコマ（大きくあけた口）を えらぶ。
 * しゃべっていない所には 何も置かず、区間の終わりで 口をとじる。
 */
export function voiceMouthKeys(opt = {}){
  const frames = (opt.frames && opt.frames.length) ? opt.frames : [0, 1];
  const closed = opt.closedFrame == null ? frames[0] : opt.closedFrame;
  const rate = Math.max(3, opt.rate || 10);          // 1秒に なんど 口を変えるか
  const start = opt.start || 0;                       // 音を どこから ならべるか
  const end = opt.end == null ? 1e9 : opt.end;
  const spans = speechSpans(opt);
  if(!spans.length) return { keys: [], spans: [] };

  // あいた口のコマ（とじたコマ 以外）。小さい順に つかう
  const opens = frames.filter(f => f !== closed);
  if(!opens.length) opens.push(closed);

  const step = 1 / rate;
  const keys = [];
  let prev = null;

  const put = (t, v) => {
    if(t < 0 || t > end) return;
    if(prev !== null && prev === v) return;    // 同じコマが つづくなら 置かなくてよい
    keys.push({ t: +t.toFixed(3), v });
    prev = v;
  };

  put(start, closed);
  for(const sp of spans){
    for(let t = sp.from; t < sp.to; t += step){
      const lv = loudnessAt(t);
      // 0〜1 を コマに ふりわける。小さい声＝小さい口
      let i = Math.round(lv * (opens.length - 1) * 1.25);
      i = Math.max(0, Math.min(opens.length - 1, i));
      put(start + t, opens[i]);
    }
    put(start + sp.to, closed);      // 声が切れたら 口をとじる
  }
  return { keys, spans };
}

/* ---------- 再生 ---------- */
let node = null, startedAt = 0, startedFrom = 0, gain = null;

/** いまの時刻から 鳴らす */
export function play(from, volume){
  stop();
  if(!A.buf) return;
  const c = audioCtx();
  if(c.state === 'suspended') c.resume();
  node = c.createBufferSource();
  node.buffer = A.buf;
  gain = c.createGain();
  gain.gain.value = volume == null ? 1 : volume;
  node.connect(gain).connect(c.destination);
  const at = Math.max(0, Math.min(A.buf.duration, from || 0));
  node.start(0, at);
  startedAt = c.currentTime;
  startedFrom = at;
}

export function stop(){
  if(node){ try{ node.stop(); }catch(_){} node.disconnect(); node = null; }
}

export const isPlaying = () => !!node;

/** 鳴っている音の いまの時刻。絵を 音に合わせるのに つかう */
export function currentTime(){
  if(!node) return null;
  return startedFrom + (audioCtx().currentTime - startedAt);
}


/**
 * 読みこんだ 音から BPM を さがす。
 *
 * ①「音が 急に 大きくなった ところ」（＝ たたいた ところ）の 強さを 出す
 * ② その ならびを ずらしながら 自分と くらべて（自己相関）、
 *    いちばん よく 重なる ずらし幅を さがす
 * ③ その幅が 1拍の 長さ。60 ÷ それ が BPM
 *
 * 60〜200 の あいだで さがす。だいたいの 曲は ここに 入る。
 */
export function guessBpm(){
  if(!A.env || A.env.length < 50) return null;
  const slot = A.slot;

  // ① たたいた ところの 強さ（大きくなった ぶんだけ 見る）
  const on = new Float32Array(A.env.length);
  for(let i = 1; i < A.env.length; i++){
    const d = A.env[i] - A.env[i - 1];
    on[i] = d > 0 ? d : 0;
  }
  // ならして、平均を 引く（しずかな 曲でも 山が 出るように）
  let mean = 0;
  for(let i = 0; i < on.length; i++) mean += on[i];
  mean /= on.length;
  for(let i = 0; i < on.length; i++) on[i] = on[i] - mean;

  // ② ずらしながら くらべる
  const minLag = Math.round((60 / 200) / slot);   // 200 BPM
  const maxLag = Math.round((60 / 60) / slot);    // 60 BPM
  let best = { lag: 0, score: -Infinity };
  for(let lag = minLag; lag <= maxLag && lag < on.length / 2; lag++){
    let sum = 0;
    for(let i = 0; i + lag < on.length; i++) sum += on[i] * on[i + lag];
    // 長い ずらしほど かける回数が へるので、そろえる
    const score = sum / (on.length - lag);
    if(score > best.score) best = { lag, score };
  }
  if(!best.lag) return null;

  let bpm = 60 / (best.lag * slot);
  // はやすぎ・おそすぎは 倍・半分に して 90〜180 に よせる
  while(bpm < 70) bpm *= 2;
  while(bpm > 190) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

/** 音の いちばん はじめの 音（拍の あたま）の 時こく */
export function firstOnset(){
  if(!A.env || !A.peak) return 0;
  const th = A.peak * 0.15;
  for(let i = 0; i < A.env.length; i++) if(A.env[i] >= th) return +(i * A.slot).toFixed(3);
  return 0;
}
