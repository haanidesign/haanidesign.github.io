/* ✂ AI で パーツに 切り分け。
   1まいの 絵を ひらいて、パーツを タップ → AI（SlimSAM）が 形を 見つける。
   「レイヤーにする」で その 形を 新しい レイヤーに 切り出し、
   もとの 絵の あいた 穴は うめる（なし／かんたん／AI＝LaMa）。
   2つの レイヤーは もとと 同じ 大きさ・同じ 動きなので、ずれない。

   AI は 端末の 中で 動く。絵は 外へ 送らない。
     形を 見つける … 初回だけ 約14MB
     AI で 穴うめ  … 初回だけ 約210MB（えらんだ ときだけ）
   絵の 中身（assets）は 書きかえず、新しく 足す（もどす が 絵を 指して いる ため）。 */
import { S, edit, addAsset, plain } from '../state.js?v=430';
import { uid } from '../engine/math.js?v=430';
import { loadImage } from './image.js?v=430';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const SAM = 'Xenova/slimsam-77-uniform';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const LAMA = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';

const CSS = `
.sg{position:fixed;inset:0;z-index:9000;background:#FBFAEC;display:flex;flex-direction:column;font-family:'M PLUS Rounded 1c',sans-serif;color:#1E1C14}
.sg-top{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.5rem .7rem;background:#E1DD60;border-bottom:2.5px solid #1E1C14}
.sg-top b{font-size:1.05rem;font-weight:800;margin-right:auto}
.sg button{font:inherit;font-weight:700;font-size:.86rem;min-height:40px;padding:0 .8rem;border:2px solid #1E1C14;border-radius:12px;background:#FFFEF7;color:#1E1C14;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem}
.sg button:disabled{opacity:.45;cursor:default}
.sg button.g{background:#1E1C14;color:#E1DD60}
.sg button.on{background:#1E1C14;color:#E1DD60}
.sg-seg{display:inline-flex;border:2px solid #1E1C14;border-radius:12px;overflow:hidden}
.sg-seg button{border:0;border-radius:0;border-left:2px solid #1E1C14;min-height:36px}
.sg-seg button:first-child{border-left:0}
.sg-row{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.45rem .7rem;border-bottom:2px solid #E8E5D0;background:#FFFEF7;font-size:.82rem;font-weight:700}
.sg-mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:.6rem;
  background-image:linear-gradient(45deg,#ECEAD8 25%,transparent 25%,transparent 75%,#ECEAD8 75%),linear-gradient(45deg,#ECEAD8 25%,transparent 25%,transparent 75%,#ECEAD8 75%);background-size:20px 20px;background-position:0 0,10px 10px}
.sg-mid canvas{max-width:100%;max-height:100%;border:2px solid #1E1C14;touch-action:none;cursor:crosshair;background:transparent}
.sg-msg{padding:.45rem .8rem;font-size:.82rem;line-height:1.6;background:#FFFEF7;border-top:2px solid #E8E5D0;min-height:2.4em}
.sg-bar{height:8px;border:2px solid #1E1C14;border-radius:8px;overflow:hidden;background:#FBFAEC;width:160px}
.sg-bar i{display:block;height:100%;width:0;background:#E1DD60}
`;

let T = null, model = null, proc = null, lama = null, ort = null;

function pct(cb){
  const files = {};
  return p => {
    if(p.status !== 'progress' || !p.total) return;
    files[p.file] = [p.loaded, p.total];
    let a = 0, b = 0; for(const k in files){ a += files[k][0]; b += files[k][1]; }
    cb(a / b);
  };
}
async function loadSam(onP){
  if(model) return;
  T = T || await import(LIB);
  T.env.allowLocalModels = false;
  const progress_callback = pct(onP);
  proc = await T.AutoProcessor.from_pretrained(SAM, { progress_callback });
  model = await T.SamModel.from_pretrained(SAM, { dtype: 'q8', device: 'wasm', progress_callback });
}
async function loadLama(onP){
  if(lama) return lama;
  ort = ort || await import(ORT + 'ort.min.mjs');
  ort.env.wasm.wasmPaths = ORT;
  /* 210MB を 進み具合 つきで 取る（ブラウザの ためこみに のこる） */
  let buf = null;
  try {
    const c = await caches.open('sougou-ai');
    let r = await c.match(LAMA);
    if(!r){
      const res = await fetch(LAMA);
      if(!res.ok) throw new Error('LaMa ' + res.status);
      const total = +res.headers.get('content-length') || 208e6;
      const rd = res.body.getReader(), parts = []; let got = 0;
      for(;;){ const { done, value } = await rd.read(); if(done) break; parts.push(value); got += value.length; onP(got / total); }
      const blob = new Blob(parts);
      try { await c.put(LAMA, new Response(blob)); } catch(_) {}
      buf = await blob.arrayBuffer();
    } else buf = await r.arrayBuffer();
  } catch(e){
    if(!buf){ const res = await fetch(LAMA); buf = await res.arrayBuffer(); }
  }
  lama = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
  return lama;
}

/* ---------- 形の 小道具 ---------- */
/* ふくらませる（r px） */
function dilate(m, W, H, r){
  let a = m;
  for(let k = 0; k < r; k++){
    const b = new Uint8Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const i = y * W + x;
      b[i] = a[i] || (x > 0 && a[i - 1]) || (x < W - 1 && a[i + 1]) || (y > 0 && a[i - W]) || (y < H - 1 && a[i + W]) ? 1 : 0;
    }
    a = b;
  }
  return a;
}
/* 形の 中の 小さな 穴（目の 中 など）を うめる: 外から 塗って、とどかない ところは 中 */
function fillHoles(m, W, H){
  const out = new Uint8Array(W * H), st = [];
  const push = i => { if(!m[i] && !out[i]){ out[i] = 1; st.push(i); } };
  for(let x = 0; x < W; x++){ push(x); push((H - 1) * W + x); }
  for(let y = 0; y < H; y++){ push(y * W); push(y * W + W - 1); }
  while(st.length){
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    if(x > 0) push(i - 1); if(x < W - 1) push(i + 1); if(y > 0) push(i - W); if(y < H - 1) push(i + W);
  }
  const r = new Uint8Array(W * H);
  for(let i = 0; i < W * H; i++) r[i] = out[i] ? 0 : 1;
  return r;
}

/* 小さな くずを のぞく: タップした 点を ふくむ かたまりと、大きい かたまり だけ のこす */
function clean(m, W, H, pts){
  const lab = new Int32Array(W * H), sizes = [0], st = [];
  let id = 0;
  for(let s = 0; s < W * H; s++){
    if(!m[s] || lab[s]) continue;
    id++; let n = 0; lab[s] = id; st.push(s);
    while(st.length){
      const i = st.pop(), x = i % W; n++;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for(const j of nb) if(j >= 0 && j < W * H && m[j] && !lab[j]){ lab[j] = id; st.push(j); }
    }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes.slice(1));
  const keep = new Uint8Array(id + 1);
  for(let k = 1; k <= id; k++) if(sizes[k] >= big * 0.04) keep[k] = 1;
  for(const p of pts){
    if(!p.l) continue;
    const i = Math.min(H - 1, Math.max(0, Math.round(p.y))) * W + Math.min(W - 1, Math.max(0, Math.round(p.x)));
    if(lab[i]) keep[lab[i]] = 1;
  }
  const o = new Uint8Array(W * H);
  for(let i = 0; i < W * H; i++) o[i] = lab[i] && keep[lab[i]] ? 1 : 0;
  return o;
}

/* かんたん 穴うめ（押し引き）: まわりの 色を だんだん 大きく ぼかして 流しこむ。透明も そのまま 流れる */
function pushPull(data, hole, W, H){
  const lv = [];
  let w = W, h = H;
  let c = new Float32Array(W * H * 5);
  for(let i = 0; i < W * H; i++){
    const k = hole[i] ? 0 : 1, a = data[i * 4 + 3] / 255;
    c[i * 5] = data[i * 4] * a * k; c[i * 5 + 1] = data[i * 4 + 1] * a * k; c[i * 5 + 2] = data[i * 4 + 2] * a * k;
    c[i * 5 + 3] = a * k; c[i * 5 + 4] = k;
  }
  lv.push({ c, w, h });
  while(w > 1 || h > 1){
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), n = new Float32Array(nw * nh * 5);
    for(let y = 0; y < nh; y++) for(let x = 0; x < nw; x++){
      const o = (y * nw + x) * 5;
      for(let dy = 0; dy < 2; dy++) for(let dx = 0; dx < 2; dx++){
        const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy), s = (sy * w + sx) * 5;
        for(let k = 0; k < 5; k++) n[o + k] += c[s + k];
      }
      const wt = n[o + 4];
      if(wt > 1){ for(let k = 0; k < 5; k++) n[o + k] /= wt; }
    }
    c = n; w = nw; h = nh; lv.push({ c, w, h });
  }
  for(let L = lv.length - 2; L >= 0; L--){
    const { c: f, w: fw, h: fh } = lv[L], { c: g, w: gw, h: gh } = lv[L + 1];
    for(let y = 0; y < fh; y++) for(let x = 0; x < fw; x++){
      const o = (y * fw + x) * 5, wt = f[o + 4];
      if(wt >= 1) continue;
      const gx = Math.min(gw - 1, (x - 0.5) / 2), gy = Math.min(gh - 1, (y - 0.5) / 2);
      const x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy)), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
      const fx = Math.max(0, gx - x0), fy = Math.max(0, gy - y0);
      for(let k = 0; k < 5; k++){
        const v = (g[(y0 * gw + x0) * 5 + k] * (1 - fx) + g[(y0 * gw + x1) * 5 + k] * fx) * (1 - fy)
                + (g[(y1 * gw + x0) * 5 + k] * (1 - fx) + g[(y1 * gw + x1) * 5 + k] * fx) * fy;
        const gw4 = (g[(y0 * gw + x0) * 5 + 4] * (1 - fx) + g[(y0 * gw + x1) * 5 + 4] * fx) * (1 - fy)
                  + (g[(y1 * gw + x0) * 5 + 4] * (1 - fx) + g[(y1 * gw + x1) * 5 + 4] * fx) * fy;
        f[o + k] = f[o + k] + (1 - wt) * (gw4 > 0 ? v / gw4 : 0) * (k === 4 ? 1 : 1);
      }
      f[o + 4] = 1;
    }
  }
  const f = lv[0].c;
  for(let i = 0; i < W * H; i++){
    if(!hole[i]) continue;
    const a = f[i * 5 + 3];
    data[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
    for(let k = 0; k < 3; k++) data[i * 4 + k] = a > 1e-4 ? Math.round(Math.min(255, f[i * 5 + k] / a)) : 0;
  }
}

/* AI 穴うめ: 穴の まわりを 切りとって 512 に して LaMa に わたし、穴の 中だけ もどす */
async function lamaFill(data, hole, W, H, onP){
  const sess = await loadLama(onP);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++) if(hole[y * W + x]){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
  if(x1 < 0) return;
  let s = Math.max(x1 - x0, y1 - y0) * 2 + 32;
  s = Math.min(Math.max(W, H), Math.max(256, s));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const bx = Math.round(Math.max(0, Math.min(W - s, cx - s / 2))), by = Math.round(Math.max(0, Math.min(H - s, cy - s / 2)));
  const bw = Math.min(W, Math.round(s)), bh = Math.min(H, Math.round(s));
  const N = 512;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  /* 透明な ところは 白に して 見せる */
  const tmp = new ImageData(new Uint8ClampedArray(data), W, H);
  src.getContext('2d').putImageData(tmp, 0, 0);
  const sq = document.createElement('canvas'); sq.width = N; sq.height = N;
  const sg = sq.getContext('2d', { willReadFrequently: true });
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, N, N);
  sg.drawImage(src, bx, by, bw, bh, 0, 0, N, N);
  const px = sg.getImageData(0, 0, N, N).data;
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const md = new ImageData(W, H);
  for(let i = 0; i < W * H; i++){ const v = hole[i] ? 255 : 0; md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = v; md.data[i * 4 + 3] = 255; }
  mc.getContext('2d').putImageData(md, 0, 0);
  const mq = document.createElement('canvas'); mq.width = N; mq.height = N;
  const mg = mq.getContext('2d', { willReadFrequently: true });
  mg.drawImage(mc, bx, by, bw, bh, 0, 0, N, N);
  const mp = mg.getImageData(0, 0, N, N).data;
  const a = new Float32Array(3 * N * N), m = new Float32Array(N * N);
  for(let i = 0; i < N * N; i++){ for(let k = 0; k < 3; k++) a[k * N * N + i] = px[i * 4 + k] / 255; m[i] = mp[i * 4] > 20 ? 1 : 0; }
  const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', a, [1, 3, N, N]), [sess.inputNames[1]]: new ort.Tensor('float32', m, [1, 1, N, N]) });
  const o = r[sess.outputNames[0]].data;
  const oc = document.createElement('canvas'); oc.width = N; oc.height = N;
  const od = new ImageData(N, N);
  for(let i = 0; i < N * N; i++){ for(let k = 0; k < 3; k++) od.data[i * 4 + k] = o[k * N * N + i]; od.data[i * 4 + 3] = 255; }
  oc.getContext('2d').putImageData(od, 0, 0);
  const back = document.createElement('canvas'); back.width = bw; back.height = bh;
  const bg = back.getContext('2d', { willReadFrequently: true }); bg.imageSmoothingQuality = 'high';
  bg.drawImage(oc, 0, 0, bw, bh);
  const bd = bg.getImageData(0, 0, bw, bh).data;
  /* 透明は かんたん うめ で きめた こさを つかう */
  const al = new Uint8ClampedArray(data); pushPull(al, hole, W, H);
  for(let y = 0; y < bh; y++) for(let x = 0; x < bw; x++){
    const i = (by + y) * W + bx + x;
    if(!hole[i]) continue;
    const j = (y * bw + x) * 4;
    data[i * 4] = bd[j]; data[i * 4 + 1] = bd[j + 1]; data[i * 4 + 2] = bd[j + 2]; data[i * 4 + 3] = al[i * 4 + 3];
  }
}

/* ---------- 画面 ---------- */
export function openSeg(layer, { toast, done }){
  const aid = layer.frames && layer.frames[0];
  const asset = aid && S.proj.assets[aid], img = aid && S.imgs[aid];
  if(!asset || !img) return toast('絵の レイヤーを えらんでね');
  if(layer.frames.length > 1) return toast('コマが 1まいの レイヤーで つかえます');

  if(!document.getElementById('sg-css')){ const st = document.createElement('style'); st.id = 'sg-css'; st.textContent = CSS; document.head.appendChild(st); }
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const root = document.createElement('div'); root.className = 'sg';
  root.innerHTML = `
    <div class="sg-top"><b>✂ AIで 切り分け</b>
      <button data-k="undo">↶ 点を ひとつ もどす</button><button data-k="clear">🧹 点を ぜんぶ けす</button>
      <button data-k="cut" class="g" disabled>✂ レイヤーにする</button><button data-k="close">完了</button></div>
    <div class="sg-row">
      <span>タップ:</span><span class="sg-seg" data-g="mode"><button class="on">➕ 足す</button><button>➖ のぞく</button></span>
      <span style="margin-left:.6rem">大きさ:</span><span class="sg-seg" data-g="size"><button>小</button><button>中</button><button>大</button></span>
      <span style="margin-left:.6rem">ぬいた あとの 穴:</span><span class="sg-seg" data-g="fill"><button>そのまま</button><button class="on">かんたん うめ</button><button>AI で うめ</button></span>
      <label style="display:flex;align-items:center;gap:.3rem;margin-left:.6rem"><input type="checkbox" data-k="holes" checked style="width:20px;height:20px">形の 中の 穴も ふくめる</label>
    </div>
    <div class="sg-mid"><canvas></canvas></div>
    <div class="sg-msg"><span class="t"></span> <span class="sg-bar" hidden><i></i></span></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const cv = $('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const msg = (t, r) => { $('.t').textContent = t; const b = $('.sg-bar'); b.hidden = r == null; if(r != null) b.firstElementChild.style.width = Math.round(r * 100) + '%'; };

  let base = img;              // いまの もとの 絵（切るたびに 新しく なる）
  let pts = [], mask = null, emb = null, inputs = null, busy = false, n = 1;
  let cands = [], sel = 0;
  const taken = new Uint8Array(W * H);     // もう 切りとった ところ
  const sizeBtns = () => root.querySelectorAll('[data-g=size] button').forEach((b, k) => {
    b.classList.toggle('on', !!mask && k === sel); b.disabled = !cands[k] || !cands[k].a;
  });
  let mode = 1, fill = 1;
  root.querySelectorAll('.sg-seg').forEach(sg => {
    sg.querySelectorAll('button').forEach((b, k) => b.onclick = () => {
      sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if(sg.dataset.g === 'mode') mode = k ? 0 : 1;
      else if(sg.dataset.g === 'size'){ if(cands[k]){ sel = k; mask = cands[k].m; paint(); } sizeBtns(); }
      else fill = k;
    });
  });

  function paint(){
    g.clearRect(0, 0, W, H);
    g.drawImage(base, 0, 0, W, H);
    if(mask){
      const o = document.createElement('canvas'); o.width = W; o.height = H;
      const og = o.getContext('2d'), d = og.createImageData(W, H);
      for(let i = 0; i < W * H; i++) if(mask[i]){ d.data[i * 4] = 225; d.data[i * 4 + 1] = 221; d.data[i * 4 + 2] = 96; d.data[i * 4 + 3] = 150; }
      og.putImageData(d, 0, 0);
      g.drawImage(o, 0, 0);
    }
    const r = Math.max(6, Math.max(W, H) / 90);
    for(const p of pts){
      g.beginPath(); g.arc(p.x, p.y, r, 0, 7);
      g.fillStyle = p.l ? '#E1DD60' : '#F2A0B8'; g.fill();
      g.lineWidth = r / 3; g.strokeStyle = '#1E1C14'; g.stroke();
    }
    $('[data-k=cut]').disabled = !mask || busy;
  }

  async function prepare(){
    busy = true;
    try {
      msg('AI を 読みこみ中（はじめの 1回だけ 約14MB）', 0);
      await loadSam(r => msg('AI を 読みこみ中（はじめの 1回だけ 約14MB）', r));
      msg('絵を 読みとって います…（数秒〜数十秒）');
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, W, H); cg.drawImage(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const raw = await T.RawImage.fromBlob(blob);
      inputs = await proc(raw);
      emb = await model.get_image_embeddings(inputs);
      msg('切りたい パーツを タップ。はみ出たら「➖ のぞく」で その ところを タップ');
    } catch(e){
      console.error(e); msg('AI を 読みこめませんでした。通信を たしかめて、ひらき直して ください');
    }
    busy = false; paint();
  }

  async function decode(){
    if(!emb || !pts.length){ mask = null; paint(); return; }
    busy = true;
    try {
      const rs = inputs.reshaped_input_sizes[0];
      const p = pts.map(q => [q.x / W * rs[1], q.y / H * rs[0]]);
      const input_points = new T.Tensor('float32', p.flat(), [1, 1, p.length, 2]);
      const input_labels = new T.Tensor('int64', pts.map(q => BigInt(q.l)), [1, 1, p.length]);
      const out = await model({ ...emb, input_points, input_labels });
      const ms = await proc.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
      /* 3つの 候補を 小さい 順に ならべ、もう 切った ところと 小さな くずを のぞく */
      const sc = Array.from(out.iou_scores.data), top = Math.max(...sc);
      const t = ms[0], [, nm] = t.dims;
      const list = [];
      for(let k = 0; k < nm; k++){
        const m = new Uint8Array(W * H), o = k * W * H;
        for(let i = 0; i < W * H; i++) m[i] = t.data[o + i] && !taken[i] ? 1 : 0;
        const c = clean(m, W, H, pts);
        let a = 0; for(let i = 0; i < W * H; i += 5) a += c[i];
        list.push({ m: c, a, s: sc[k] });
      }
      list.sort((x, y) => x.a - y.a);
      cands = list;
      /* はじめは、自信が 十分 ある うちで いちばん 大きい もの（パーツ まるごと） */
      sel = 0;
      list.forEach((c, k) => { if(c.s >= top - 0.06 && c.a > 0) sel = k; });
      mask = cands[sel].m;
      sizeBtns();
      msg('黄色が 切りとる ところ。よければ「✂ レイヤーにする」');
    } catch(e){ console.error(e); msg('形を 見つけられませんでした'); }
    busy = false; paint();
  }

  cv.addEventListener('pointerup', e => {
    if(busy || !emb) return;
    const r = cv.getBoundingClientRect();
    pts.push({ x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, l: mode });
    paint(); decode();
  });
  $('[data-k=undo]').onclick = () => { pts.pop(); decode(); };
  $('[data-k=clear]').onclick = () => { pts = []; mask = null; cands = []; sizeBtns(); paint(); msg('切りたい パーツを タップ'); };
  $('[data-k=close]').onclick = () => { root.remove(); };

  $('[data-k=cut]').onclick = async () => {
    if(!mask || busy) return;
    const name = prompt('新しい レイヤーの 名前', 'パーツ' + n);
    if(name == null) return;
    busy = true; paint();
    try {
      const m = $('[data-k=holes]').checked ? fillHoles(mask, W, H) : mask;
      const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
      const bg = bc.getContext('2d', { willReadFrequently: true }); bg.drawImage(base, 0, 0, W, H);
      const all = bg.getImageData(0, 0, W, H);
      /* パーツ: ふちを 1px だけ ぼかす */
      const part = new ImageData(new Uint8ClampedArray(all.data), W, H);
      const edge = dilate(m, W, H, 1);
      for(let i = 0; i < W * H; i++){
        const k = m[i] ? 1 : edge[i] ? 0.5 : 0;
        part.data[i * 4 + 3] = Math.round(part.data[i * 4 + 3] * k);
      }
      /* もと: 穴を うめる（パーツより 少し 大きめ） */
      const rest = all;
      if(fill === 0){
        for(let i = 0; i < W * H; i++) if(m[i]) rest.data[i * 4 + 3] = 0;
      } else {
        const hole = dilate(m, W, H, Math.max(2, Math.round(Math.max(W, H) / 300)));
        if(fill === 2){
          msg('AI で 穴を うめて います（はじめの 1回だけ 約210MB 読みこむ）', 0);
          await lamaFill(rest.data, hole, W, H, r => msg('AI を 読みこみ中（はじめの 1回だけ 約210MB）', r));
        } else pushPull(rest.data, hole, W, H);
      }
      const toURL = d => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(d, 0, 0); return c.toDataURL('image/png'); };
      const pSrc = toURL(part), rSrc = toURL(rest);
      const [pIm, rIm] = await Promise.all([loadImage(pSrc), loadImage(rSrc)]);
      edit('AIで 切り分け', () => {
        const pa = addAsset(name, pSrc, W, H, pIm);
        const ra = addAsset(asset.name || layer.name, rSrc, W, H, rIm);
        const nl = plain(layer);
        nl.id = uid('L'); nl.name = name; nl.frames = [pa];
        const at = S.proj.layers.indexOf(layer);
        S.proj.layers.splice(Math.max(0, at), 0, nl);   // もとの 1つ 上（前）
        layer.frames = [ra];
        S.sel = nl.id;
      });
      base = rIm; n++;
      for(let i = 0; i < W * H; i++) if(m[i]) taken[i] = 1;
      pts = []; mask = null; cands = []; sizeBtns();
      done && done();
      toast('「' + name + '」を レイヤーに しました');
      msg('つぎの パーツを タップ。おわったら「完了」');
    } catch(e){
      console.error(e); msg('切り分けられませんでした: ' + (e.message || e));
    }
    busy = false; paint();
  };

  paint();
  prepare();
}
