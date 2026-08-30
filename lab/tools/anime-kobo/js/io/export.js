/* 動画の書き出し。
   本命 … WebCodecs で H.264 に焼いて、mp4-muxer で MP4 の箱に詰める。
          端末のハードウェアが使えるので、スマホでも実時間に近い速さで出る。
   保険 … WebCodecs が無い端末は MediaRecorder。
          Safari は MP4、Chrome は WebM になる。画質と精度は落ちるが必ず何か出せる。

   保存は、共有シートが使えるならそこへ渡す（iPhoneはここから「ビデオを保存」で
   カメラロールに入る）。使えなければ ふつうのダウンロード。 */

import { createRenderer } from '../render/renderer.js?v=98';
import { A as AUD } from './audio.js?v=98';
import { encodeGif } from './gif.js?v=98';

/** H.264 は縦横が偶数でないと通らない */
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/** その端末で通る H.264 の設定を探す。大きい絵ほど高いレベルが要る */
async function pickCodec(width, height, fps, bitrate){
  if(typeof VideoEncoder === 'undefined') return null;
  const candidates = [
    'avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.640028',
    'avc1.4d0034', 'avc1.4d0028', 'avc1.42003e', 'avc1.42002a', 'avc1.42001f'
  ];
  for(const codec of candidates){
    try{
      const cfg = { codec, width, height, bitrate, framerate: fps };
      const r = await VideoEncoder.isConfigSupported(cfg);
      if(r && r.supported) return cfg;
    }catch(_){ /* 次を試す */ }
  }
  return null;
}

export function canUseWebCodecs(){
  return typeof VideoEncoder !== 'undefined' && typeof Mp4Muxer !== 'undefined';
}

/**
 * 書き出し本体。
 * onProgress(0〜1) が呼ばれる。shouldStop() が true を返すと途中でやめる。
 */
export async function exportVideo(project, opts = {}){
  const fps = opts.fps || project.fps || 30;
  const width = even(project.w);
  const height = even(project.h);
  const duration = project.duration;
  const total = Math.max(1, Math.round(duration * fps));
  const onProgress = opts.onProgress || (() => {});
  const shouldStop = opts.shouldStop || (() => false);

  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  const R = createRenderer(cv);
  const view = { x: 0, y: 0, z: 1 };

  const bitrate = opts.bitrate || Math.min(16_000_000, Math.round(width * height * fps * 0.12));
  const cfg = await pickCodec(width, height, fps, bitrate);

  if(cfg && typeof Mp4Muxer !== 'undefined'){
    // 音を いっしょに 詰められるか 先に みておく（箱を作る前に 決めないといけない）
    const acfg = await pickAudioCodec(AUD.buf);
    return await encodeWithWebCodecs({ cv, R, project, view, fps, width, height,
                                       total, cfg, acfg, onProgress, shouldStop });
  }
  return await recordWithMediaRecorder({ cv, R, project, view, fps, duration,
                                         onProgress, shouldStop });
}

/** 音を AAC で 詰められるか。だめなら null（絵だけ 書き出す） */
async function pickAudioCodec(buf){
  if(!buf || typeof AudioEncoder === 'undefined') return null;
  const numberOfChannels = Math.min(2, buf.numberOfChannels);
  const cfg = {
    codec: 'mp4a.40.2',              // AAC-LC。MP4 で いちばん ふつうに 再生できる
    sampleRate: buf.sampleRate,
    numberOfChannels,
    bitrate: 128_000
  };
  try{
    const r = await AudioEncoder.isConfigSupported(cfg);
    return (r && r.supported) ? cfg : null;
  }catch(_){ return null; }
}

/** 音を 詰める。動画の長さで 切る */
async function encodeAudio(muxer, cfg, buf, duration){
  let failed = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failed = e; }
  });
  enc.configure(cfg);

  const rate = cfg.sampleRate, ch = cfg.numberOfChannels;
  const total = Math.min(buf.length, Math.floor(duration * rate));
  const block = 4096;
  const chans = [];
  for(let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));

  for(let i = 0; i < total; i += block){
    const n = Math.min(block, total - i);
    const data = new Float32Array(n * ch);
    for(let c = 0; c < ch; c++) data.set(chans[c].subarray(i, i + n), c * n);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: rate,
      numberOfFrames: n,
      numberOfChannels: ch,
      timestamp: Math.round((i / rate) * 1e6),
      data
    });
    enc.encode(ad);
    ad.close();
    if(enc.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 4));
    if(failed) break;
  }
  await enc.flush();
  enc.close();
  if(failed) throw failed;
}

/* ---------- 本命：WebCodecs ---------- */
async function encodeWithWebCodecs({ cv, R, project, view, fps, width, height,
                                     total, cfg, acfg, onProgress, shouldStop }){
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(acfg ? { audio: { codec: 'aac',
                          numberOfChannels: acfg.numberOfChannels,
                          sampleRate: acfg.sampleRate } } : {}),
    fastStart: 'in-memory'          // SNS に上げる前提なので、先頭に索引を置く
  });

  let failed = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failed = e; }
  });
  encoder.configure(cfg);

  const usPerFrame = 1e6 / fps;
  for(let i = 0; i < total; i++){
    if(shouldStop()) { encoder.close(); throw new Error('やめました'); }
    if(failed) throw failed;

    R.draw(project, null, i / fps, view, { forExport: true });

    const frame = new VideoFrame(cv, {
      timestamp: Math.round(i * usPerFrame),
      duration: Math.round(usPerFrame)
    });
    // 2秒ごとに丸ごとのコマを入れておくと、シークと再生が安定する
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // 詰め込みすぎるとメモリを食うので、追いつくまで待つ
    if(encoder.encodeQueueSize > 8){
      await new Promise(r => setTimeout(r, 0));
      while(encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 4));
    }
    if(i % 3 === 0) onProgress(i / total);
  }

  await encoder.flush();
  encoder.close();
  if(failed) throw failed;

  if(acfg && AUD.buf) await encodeAudio(muxer, acfg, AUD.buf, total / fps);

  muxer.finalize();
  onProgress(1);

  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    how: 'WebCodecs'
  };
}

/* ---------- 保険：MediaRecorder ---------- */
async function recordWithMediaRecorder({ cv, R, project, view, fps, duration,
                                         onProgress, shouldStop }){
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if(!mime) throw new Error('この端末では書き出せませんでした');

  const stream = cv.captureStream(fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  rec.ondataavailable = (e) => { if(e.data.size) chunks.push(e.data); };

  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();

  // 実時間で流しながら録る
  const t0 = performance.now();
  await new Promise((res, rej) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if(shouldStop()){ rej(new Error('やめました')); return; }
      if(t >= duration){ res(); return; }
      R.draw(project, null, t, view, { forExport: true });
      onProgress(t / duration);
      requestAnimationFrame(step);
    };
    step();
  }).catch(err => { try{ rec.stop(); }catch(_){} throw err; });

  rec.stop();
  await done;
  onProgress(1);

  const type = mime.split(';')[0];
  return {
    blob: new Blob(chunks, { type }),
    ext: type.includes('mp4') ? 'mp4' : 'webm',
    how: 'MediaRecorder'
  };
}

/* ---------- 保存 ---------- */
/** 共有シートが使えるならそこへ。だめならダウンロード。 */
/**
 * できた 動画を ほぞんする。
 *
 * カメラロール（ギャラリー）に 入れるには、スマホの「きょうゆう」に
 * わたすのが かくじつ。ただし きょうゆうは
 *「人が ボタンを おした その場」でしか ひらけない きまりなので、
 * 書き出しが 終わってから 自動で よぶと 失敗する。
 * だから 書き出しの あとに ボタンを 出して、そこから よぶ。
 *
 *   how … 'share'（きょうゆう）／'download'（ダウンロード）
 */
export function canShareFile(blob, filename){
  try{
    const file = new File([blob], filename, { type: blob.type });
    return !!(navigator.canShare && navigator.canShare({ files: [file] }));
  }catch(_){ return false; }
}

export async function saveVideo(blob, filename, how){
  if(how !== 'download' && canShareFile(blob, filename)){
    const file = new File([blob], filename, { type: blob.type });
    try{
      await navigator.share({ files: [file], title: filename });
      return 'share';
    }catch(err){
      if(err && err.name === 'AbortError') return 'cancel';
      if(how === 'share') throw new Error('きょうゆうを ひらけませんでした');
      // 共有がだめならダウンロードに落とす
    }
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return 'download';
}


/* ---------- すける GIF ----------
   はいけいを 描かずに 中身だけ 描いて、そのまま GIF に する。
   動画の上に かさねる 素材や、スタンプに つかえる。 */
export async function exportGif(project, opt = {}){
  const fps = Math.max(4, Math.min(24, opt.fps || 12));
  const long = Math.max(project.w, project.h);
  const scale = Math.min(1, (opt.maxSide || 480) / long);
  const width = Math.max(2, Math.round(project.w * scale));
  const height = Math.max(2, Math.round(project.h * scale));
  const seconds = Math.min(project.duration, opt.seconds || project.duration);
  const total = Math.max(1, Math.round(seconds * fps));
  const onProgress = opt.onProgress || (() => {});
  const shouldStop = opt.shouldStop || (() => false);

  /* 大きいまま 描いてから 小さくする。
     はじめから 小さく 描くと、ピンで曲げた あみの つなぎ目が
     すじに なって 出てしまう（すける ぶんだけ 線に 見える）。 */
  const big = document.createElement('canvas');
  big.width = Math.max(2, project.w);
  big.height = Math.max(2, project.h);
  const R = createRenderer(big);

  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const view = { x: 0, y: 0, z: 1 };

  const frames = [];
  for(let i = 0; i < total; i++){
    if(shouldStop()) throw new Error('やめました');
    // はいけいの色を ぬらずに 描く ＝ すけたまま
    R.draw(project, null, i / fps, view, { forExport: true, noBg: true });
    g.clearRect(0, 0, width, height);
    g.drawImage(big, 0, 0, width, height);

    const im = g.getImageData(0, 0, width, height);
    firmUp(im);
    frames.push(im);
    onProgress((i / total) * 0.6);
  }

  const blob = encodeGif(frames, {
    delay: 1 / fps,
    colors: opt.colors || 255,
    alphaCut: 110,
    onProgress: (p) => onProgress(0.6 + p * 0.4)
  });
  onProgress(1);
  return { blob, ext: 'gif', how: 'GIF' };
}

/**
 * GIF は「すける／すけない」の2つしか 持てない。
 * なかば すけた ドットが 中に のこると すじに 見えるので、
 * まわりが しっかり 描かれている ところは しっかり 描かれた ことに する。
 */
function firmUp(im){
  const { width: w, height: h, data: d } = im;
  const a = new Uint8Array(w * h);
  for(let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  for(let y = 1; y < h - 1; y++){
    for(let x = 1; x < w - 1; x++){
      const i = y * w + x;
      const v = a[i];
      if(v >= 250 || v < 40) continue;
      // 上下左右が こければ、ここも こくする
      let solid = 0;
      if(a[i - 1] >= 250) solid++;
      if(a[i + 1] >= 250) solid++;
      if(a[i - w] >= 250) solid++;
      if(a[i + w] >= 250) solid++;
      if(solid >= 2) d[i * 4 + 3] = 255;
    }
  }
}
