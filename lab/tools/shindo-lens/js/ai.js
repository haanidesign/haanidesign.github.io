/* AI で 深度を 出す（Depth Anything V2 small）。
   モデルは 初回だけ 取りに 行き、あとは ブラウザが ためて おく。
   写真は 端末の 中で 処理して、外へは 送らない。 */

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'onnx-community/depth-anything-v2-small';
let pipe = null, loading = null;

async function load(onProg) {
  const T = await import(LIB);
  T.env.allowLocalModels = false;
  const files = {};
  const progress_callback = p => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for (const k in files) { a += files[k][0]; b += files[k][1]; }
      onProg && onProg(a / b, b);
    }
  };
  const tries = [];
  /* WebGPU は fp16 が 使える 機械 だけ fp16、ほかは fp32。だめなら CPU（wasm）で 軽い q8 */
  let ad = null;
  try { ad = navigator.gpu && await navigator.gpu.requestAdapter(); } catch (_) {}
  if (ad) tries.push({ device: 'webgpu', dtype: ad.features.has('shader-f16') ? 'fp16' : 'fp32' });
  tries.push({ device: 'wasm', dtype: 'q8' });
  let err;
  for (const t of tries) {
    try { return { T, p: await T.pipeline('depth-estimation', MODEL, { ...t, progress_callback }) }; }
    catch (e) { err = e; console.warn('depth', t, e); }
  }
  throw err;
}

/* src: canvas。もどり: 同じ 大きさの canvas（白が 手前） */
export async function estimate(src, onProg) {
  if (!pipe) {
    loading = loading || load(onProg);
    try { pipe = await loading; } finally { loading = null; }
  }
  // 長い辺 1024 まで に してから わたす（それ以上は 時間ばかり かかる）
  const k = Math.min(1, 1024 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  {
    const out = await pipe.p(await pipe.T.RawImage.fromBlob(blob));
    const dc = out.depth.toCanvas();
    const o = document.createElement('canvas'); o.width = src.width; o.height = src.height;
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(dc, 0, 0, o.width, o.height);
    return o;
  }
}
