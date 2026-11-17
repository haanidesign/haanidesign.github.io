/* 深度レンズ（lab/tools/shindo-lens）から そのまま もってきた もの */
/* AI で 深度を 出す（Depth Anything V2 small）。
   モデルは 初回だけ 取りに 行き、あとは ブラウザが ためて おく。
   写真は 端末の 中で 処理して、外へは 送らない。

   CPU（wasm・q8）で 動かす。
   GPU（WebGPU）は 端末に よって 計算が こわれて、深度が まっ平ら（ぜんぶ 青）や
   ノイズの 模様に なる（Android の タブレットで 起きた）ので 使わない。
   出てきた 深度が まっ平らなら、こわれた と みて やり直す。 */

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'onnx-community/depth-anything-v2-small';
const BAD = 'sougou-kobo:bad-depth';
let T = null, pipe = null, cur = null;

const badList = () => { try { return JSON.parse(localStorage.getItem(BAD)) || []; } catch (_) { return []; } };
const markBad = k => { try { const b = badList(); if (!b.includes(k)) b.push(k); localStorage.setItem(BAD, JSON.stringify(b)); } catch (_) {} };

async function plans() {
  const list = [{ device: 'wasm', dtype: 'q8' }, { device: 'wasm', dtype: 'fp32' }];
  const bad = badList();
  const ok = list.filter(t => !bad.includes(t.device + '/' + t.dtype));
  return ok.length ? ok : [{ device: 'wasm', dtype: 'q8' }];
}

function progress(onProg) {
  const files = {};
  return p => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for (const k in files) { a += files[k][0]; b += files[k][1]; }
      onProg && onProg(a / b, b);
    }
  };
}

/* 深度が こわれて いないか: 数で ない 値が ない・ちゃんと 濃い うすいが ある */
function sane(out) {
  const pd = out.predicted_depth && out.predicted_depth.data;
  if (pd) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < pd.length; i += 3) { const v = pd[i]; if (!Number.isFinite(v)) return false; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!(mx - mn > 1e-4)) return false;
  }
  const d = out.depth.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 7) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
  return hi - lo >= 16;
}

/* src: canvas。もどり: 同じ 大きさの canvas（白が 手前） */
export async function estimate(src, onProg) {
  T = T || await import(LIB);
  T.env.allowLocalModels = false;
  // 長い辺 1024 まで に してから わたす（それ以上は 時間ばかり かかる）
  const k = Math.min(1, 1024 / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, c.width, c.height);
  cg.drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const image = await T.RawImage.fromBlob(blob);

  let err = null;
  for (const t of await plans()) {
    const key = t.device + '/' + t.dtype;
    try {
      if (!pipe || cur !== key) {
        pipe = null;
        pipe = await T.pipeline('depth-estimation', MODEL, { ...t, progress_callback: progress(onProg) });
        cur = key;
      }
      const out = await pipe(image);
      if (!sane(out)) { console.warn('depth: こわれた 結果', key); markBad(key); pipe = null; err = new Error('深度が こわれて いた'); continue; }
      const dc = out.depth.toCanvas();
      const o = document.createElement('canvas'); o.width = src.width; o.height = src.height;
      const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(dc, 0, 0, o.width, o.height);
      console.info('depth:', key);
      return o;
    } catch (e) {
      console.warn('depth', key, e); err = e; pipe = null;
      if (!/fetch|network|429|Failed to load/i.test(String(e && e.message))) markBad(key);
    }
  }
  throw err || new Error('AI が 使えなかった');
}
