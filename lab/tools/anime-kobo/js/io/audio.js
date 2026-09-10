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
  peak: 0,
  raw: null,       // 高さを かえる まえの 音（いつも ここから 作り直す）
  rawBytes: null,
  semi: 0,         // いまの 高さ（半音）
  keepLen: true    // 長さを そのままに するか
};

export const hasAudio = () => !!A.buf;

/** 音を 鳴らして いいか。
    🔊 の 行の 目を 切って いたら 鳴らさない（書き出しにも 入れない）。 */
export function audioEnabled(project){
  if(!A.buf) return false;
  const row = project && project.layers
    ? project.layers.find(l => l.kind === 'audio') : null;
  return !row || row.visible !== false;
}

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
  /* あたらしい 音を 読んだら、高さは まっさらに もどす */
  A.raw = buf; A.rawBytes = bytes; A.semi = 0; A.keepLen = true;
  return A;
}

export function clearAudio(){
  A.name = null; A.bytes = null; A.buf = null; A.env = null; A.peak = 0;
  A.raw = null; A.rawBytes = null; A.semi = 0; A.keepLen = true;
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

  /* おとの はじまりを ずらして いる ぶん、口も うしろへ ずらす */
  const shift = opt.shift || 0;
  const put = (t0, v) => {
    const t = t0 + shift;
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
/**
 * from … さくひんの 時こく。
 * off  … おとの はじまりを どれだけ うしろへ ずらすか（秒）。
 *        さくひんの 時こく off の ところで、おとの あたまが 鳴る。
 */
export function play(from, volume, off){
  stop();
  if(!A.buf) return;
  const c = audioCtx();
  if(c.state === 'suspended') c.resume();
  const shift = off || 0;
  const t = (from || 0) - shift;                 // おとの 中の どこか
  if(t > A.buf.duration) return;                 // もう 鳴り終わって いる

  node = c.createBufferSource();
  node.buffer = A.buf;
  gain = c.createGain();
  gain.gain.value = volume == null ? 1 : volume;
  node.connect(gain).connect(c.destination);

  if(t < 0){
    // まだ はじまって いない。その ぶん 待ってから 鳴らす
    node.start(c.currentTime + (-t), 0);
    startedAt = c.currentTime + t;               // 時こくの ものさしは そろえて おく
    startedFrom = 0;
  } else {
    node.start(0, t);
    startedAt = c.currentTime;
    startedFrom = t;
  }
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


/* ================= 🎙 その場で 録音する =================

   マイクの 音を そのまま 読みこむ。
   ファイルから 読んだ ときと まったく 同じ 入れもの（A）に 入る ので、
   このあとの 口パク・波形・書き出しは ぜんぶ そのまま つかえる。

   ・https（または localhost）で ないと マイクは つかえない
   ・はじめに 1回、ブラウザが「マイクを つかって いい?」と きく */

let rec = null, recChunks = null, recStream = null;

export const isRecording = () => !!rec;

export async function startRec(){
  if(rec) return;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    throw new Error('この端末では 録音できません');
  }
  if(typeof MediaRecorder === 'undefined'){
    throw new Error('この ブラウザでは 録音できません（Chrome を ためしてね）');
  }
  recStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  recChunks = [];
  /* 入れものは ブラウザに まかせる。読み直すのは decodeAudioData なので
     webm でも mp4 でも かまわない。 */
  rec = new MediaRecorder(recStream);
  rec.ondataavailable = (e) => { if(e.data && e.data.size) recChunks.push(e.data); };
  rec.start();
}

/** とめて、そのまま 読みこむ。かえりは A */
export async function stopRec(name){
  if(!rec) return null;
  const done = new Promise(res => { rec.onstop = res; });
  rec.stop();
  await done;
  const blob = new Blob(recChunks, { type: rec.mimeType || 'audio/webm' });
  recChunks = null;
  rec = null;
  if(recStream){ recStream.getTracks().forEach(t => t.stop()); recStream = null; }
  if(!blob.size) throw new Error('音が とれませんでした');
  const bytes = await blob.arrayBuffer();
  await loadAudio(bytes, name || 'ろくおん');
  return A;
}

export function cancelRec(){
  if(rec){ try{ rec.stop(); }catch(_){} }
  rec = null; recChunks = null;
  if(recStream){ recStream.getTracks().forEach(t => t.stop()); recStream = null; }
}


/* ================= こえの 高さを かえる =================

   2とおり ある。
     ① はやさごと … テープの 早回し。ただ 読む はやさを かえるだけ。
        きれいだけれど 長さも かわる（口パクの タイミングも ずれる）。
     ② 長さは そのまま … 短い つぶ（グレイン）に 切って、
        かさねながら 貼り直して 長さを 変えてから、
        その ぶんだけ 早く 読む。
        高さだけ かわって 長さは かわらない ので、
        口パクや 字幕の タイミングを そのまま つかえる。

   もとの 音は とっておいて、いつも そこから 作り直す。
   だから 何回 いじっても 音が やせない し、0 に もどせば もとどおり。 */

/** つぶを かさねて 長さを のばす／ちぢめる（alpha ばい）

   ただ ならべて 貼るだけ だと、つぶの つぎ目で 波の 山と 谷が
   ぶつかって 打ち消し合い、高さが 変わらない（実測: +3半音を
   かけても 200Hz の まま だった）。

   なので 貼る まえに「いま 書いてある しっぽと いちばん よく 合う
   ところ」を すこし ずらして さがす（WSOLA）。
   こうすると 波が つながって、ねらった 高さに なる。 */
function stretch(x, alpha, N){
  if(Math.abs(alpha - 1) < 1e-4) return x;
  const Ho = Math.max(1, Math.round(N / 4));     // 書く きざみ（ずっと 同じ）
  const Hi = Ho / alpha;                         // 読む きざみ
  const SEEK = Math.max(8, Math.round(N / 2));   // どれだけ ずらして さがすか
  const CORR = Math.max(16, Math.round(N / 4));  // どれだけ の 長さで 合わせるか

  const w = new Float32Array(N);
  for(let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);

  const outLen = Math.ceil(x.length / Math.max(1e-6, Hi)) * Ho + N + SEEK + 8;
  const out = new Float32Array(outLen);
  const win = new Float32Array(outLen);

  let q = 0, last = 0;
  for(let k = 0; ; k++){
    const p0 = Math.round(k * Hi);
    if(p0 + N + SEEK >= x.length) break;

    let d = 0;
    if(k > 0){
      let best = -Infinity;
      for(let dd = -SEEK; dd <= SEEK; dd += 4){
        const pp = p0 + dd;
        if(pp < 0) continue;
        let acc = 0;
        for(let i = 0; i < CORR; i += 2) acc += out[q + i] * x[pp + i];
        if(acc > best){ best = acc; d = dd; }
      }
    }
    const p = Math.max(0, p0 + d);
    for(let i = 0; i < N; i++){
      out[q + i] += x[p + i] * w[i];
      win[q + i] += w[i];
    }
    q += Ho;
    last = q + N;
  }
  for(let i = 0; i < last; i++) if(win[i] > 1e-6) out[i] /= win[i];
  return out.subarray(0, Math.max(1, last));
}

/** ratio ばいの はやさで 読み直す（線でつなぐ） */
function resample(x, ratio, outLen){
  const n = outLen != null ? outLen : Math.max(1, Math.round(x.length / ratio));
  const out = new Float32Array(n);
  for(let i = 0; i < n; i++){
    const t = i * ratio;
    const j = Math.floor(t);
    const f = t - j;
    const a = x[j] || 0, b = x[j + 1] || 0;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/**
 * 高さを かえた AudioBuffer を 作る。
 *   semi     … 半音。プラスで 高く、マイナスで ひくく
 *   keepLen  … true なら 長さを かえない
 */
export function pitchBuffer(src, semi, keepLen){
  const ratio = Math.pow(2, semi / 12);
  if(Math.abs(semi) < 0.01) return src;
  const N = 2048;
  const chans = [];
  let outLen = 0;
  for(let ch = 0; ch < src.numberOfChannels; ch++){
    const x = src.getChannelData(ch);
    let y;
    if(keepLen){
      // ①のばして ②その ぶん 早く 読む ＝ 長さは そのまま、高さだけ かわる
      y = resample(stretch(x, ratio, N), ratio, x.length);
    } else {
      y = resample(x, ratio);            // テープの 早回し
    }
    chans.push(y);
    outLen = Math.max(outLen, y.length);
  }
  const out = audioCtx().createBuffer(src.numberOfChannels, outLen, src.sampleRate);
  chans.forEach((y, i) => out.copyToChannel(y, i));
  return out;
}

/** AudioBuffer を wav の バイトに する（ほぞん用） */
export function bufToWav(buf){
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, t) => { for(let i = 0; i < t.length; i++) data.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, n * ch * 2, true);

  const cd = [];
  for(let c = 0; c < ch; c++) cd.push(buf.getChannelData(c));
  let o = 44;
  for(let i = 0; i < n; i++){
    for(let c = 0; c < ch; c++){
      let v = cd[c][i];
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      o += 2;
    }
  }
  return data.buffer;
}

/**
 * いまの 音の 高さを かえる（もとの 音からは いつも 作り直す）。
 * semi が 0 なら もとどおりに もどす。
 */
export function setPitch(semi, keepLen){
  if(!A.buf) return null;
  if(!A.raw){ A.raw = A.buf; A.rawBytes = A.bytes; }   // もとの 音を とっておく
  A.semi = semi; A.keepLen = !!keepLen;

  if(Math.abs(semi) < 0.01){
    A.buf = A.raw;
    A.bytes = A.rawBytes;
  } else {
    A.buf = pitchBuffer(A.raw, semi, keepLen);
    A.bytes = bufToWav(A.buf);
  }
  A.env = envelope(A.buf, KEY_SLOT);
  A.slot = KEY_SLOT;
  A.peak = A.env.length ? Math.max(...A.env) : 0;
  return A;
}
