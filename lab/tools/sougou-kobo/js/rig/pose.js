/* 🦴 AI で 関節を 見つける（ViTPose）。
   絵の 中の 人の 肩・ひじ・手首・腰・ひざ・足首・目・鼻 を さがす。
   AI は 初回だけ 約90MB を 取りに 行き、あとは ブラウザに しまって おく。
   絵は 端末の 中で 処理して、外へは 送らない。

   もどり: { pts: [[x,y],...17], sc: [0〜1,...17] }  （わたした canvas の ざひょう）
   ならびは COCO の 17点:
     0 鼻 1 左目 2 右目 3 左耳 4 右耳 5 左肩 6 右肩 7 左ひじ 8 右ひじ
     9 左手首 10 右手首 11 左腰 12 右腰 13 左ひざ 14 右ひざ 15 左足首 16 右足首
   （左右は 絵の 人に とっての 左右。見ている 人から 見ると 逆） */

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'onnx-community/vitpose-base-simple';
let ready = null;

async function load(onProg){
  const T = await import(LIB);
  T.env.allowLocalModels = false;
  const files = {};
  const progress_callback = p => {
    if(p.status === 'progress' && p.total){
      files[p.file] = [p.loaded, p.total];
      let a = 0, b = 0; for(const k in files){ a += files[k][0]; b += files[k][1]; }
      onProg && onProg(a / b, b);
    }
  };
  const proc = await T.AutoImageProcessor.from_pretrained(MODEL, { progress_callback });
  let model = null, err = null;
  for(const o of [{ device: 'wasm', dtype: 'q8' }, { device: 'wasm', dtype: 'fp32' }]){
    try { model = await T.AutoModel.from_pretrained(MODEL, { ...o, progress_callback }); break; }
    catch(e){ err = e; console.warn('pose', o, e); }
  }
  if(!model) throw err;
  return { T, proc, model };
}

export async function findJoints(canvas, onProg){
  if(!ready) ready = load(onProg).catch(e => { ready = null; throw e; });
  const { T, proc, model } = await ready;
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const img = await T.RawImage.fromBlob(blob);
  const inputs = await proc(img);
  const { heatmaps } = await model(inputs);
  const r = proc.post_process_pose_estimation(heatmaps, [[[0, 0, img.width, img.height]]])[0][0];
  return { pts: r.keypoints.map(p => [p[0], p[1]]), sc: Array.from(r.scores, v => Math.max(0, Math.min(1, v))) };
}
