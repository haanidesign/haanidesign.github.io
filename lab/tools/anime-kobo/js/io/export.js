/* 動画の書き出し。
   本命 … WebCodecs で H.264 に焼いて、mp4-muxer で MP4 の箱に詰める。
          端末のハードウェアが使えるので、スマホでも実時間に近い速さで出る。
   保険 … WebCodecs が無い端末は MediaRecorder。
          Safari は MP4、Chrome は WebM になる。画質と精度は落ちるが必ず何か出せる。

   保存は、共有シートが使えるならそこへ渡す（iPhoneはここから「ビデオを保存」で
   カメラロールに入る）。使えなければ ふつうのダウンロード。 */

import { createRenderer } from '../render/renderer.js';

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
    return await encodeWithWebCodecs({ cv, R, project, view, fps, width, height,
                                       total, cfg, onProgress, shouldStop });
  }
  return await recordWithMediaRecorder({ cv, R, project, view, fps, duration,
                                         onProgress, shouldStop });
}

/* ---------- 本命：WebCodecs ---------- */
async function encodeWithWebCodecs({ cv, R, project, view, fps, width, height,
                                     total, cfg, onProgress, shouldStop }){
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
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
export async function saveVideo(blob, filename){
  const file = new File([blob], filename, { type: blob.type });

  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{
      await navigator.share({ files: [file], title: filename });
      return 'share';
    }catch(err){
      if(err && err.name === 'AbortError') return 'cancel';
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
