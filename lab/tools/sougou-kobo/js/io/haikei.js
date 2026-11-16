/* ✂ AI で 背景を 消す（透明に する）。
   アニメ絵の キャラを 見つける AI（anime-seg / ISNet）で、背景だけ 透明に する。
   ふちの かたさ・けずり・色の にじみ取り・手で なおす ブラシ つき。
   コマが いくつも ある ときは、ぜんぶの コマに 同じ ように かける（ブラシは 見て いる コマだけ）。

   AI は 端末の 中で 動く。絵は 外へ 送らない。初回だけ 約180MB を 読みこむ（ブラウザに のこる）。
   絵の 中身（assets）は 書きかえず、新しく 足す（もどす が 絵を 指して いる ため）。 */
import { S, edit, addAsset } from '../state.js?v=434';
import { loadImage } from './image.js?v=434';
import { guardSlide } from '../ui/sheet.js?v=434';

const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const MODEL = 'https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx';
const N = 1024;

const CSS = `
.hk{position:fixed;inset:0;z-index:9000;background:#FBFAEC;display:flex;flex-direction:column;font-family:'M PLUS Rounded 1c',sans-serif;color:#1E1C14}
.hk-top{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.5rem .7rem;background:#E1DD60;border-bottom:2.5px solid #1E1C14}
.hk-top b{font-size:1.05rem;font-weight:800;margin-right:auto}
.hk button{font:inherit;font-weight:700;font-size:.86rem;min-height:40px;padding:0 .8rem;border:2px solid #1E1C14;border-radius:12px;background:#FFFEF7;color:#1E1C14;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem}
.hk button:disabled{opacity:.45;cursor:default}
.hk button.g{background:#1E1C14;color:#E1DD60}
.hk-seg{display:inline-flex;border:2px solid #1E1C14;border-radius:12px;overflow:hidden}
.hk-seg button{border:0;border-radius:0;border-left:2px solid #1E1C14;min-height:36px;padding:0 .65rem}
.hk-seg button:first-child{border-left:0}
.hk-seg button.on{background:#1E1C14;color:#E1DD60}
.hk-body{flex:1;min-height:0;display:flex}
.hk-mid{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:.6rem}
.hk-mid canvas{max-width:100%;max-height:100%;border:2px solid #1E1C14;touch-action:none}
.hk-side{width:290px;flex:0 0 290px;border-left:2.5px solid #1E1C14;background:#FFFEF7;overflow-y:auto;padding:.8rem;display:flex;flex-direction:column;gap:.7rem;font-size:.84rem;font-weight:700}
.hk-f{display:flex;flex-direction:column;gap:.2rem}
.hk-f div{display:flex;justify-content:space-between}
.hk-f span{font-family:'DotGothic16',monospace;font-weight:500;color:#5C5843}
.hk-f input[type=range]{width:100%;accent-color:#1E1C14}
.hk-ck{display:flex;gap:.45rem;align-items:flex-start;line-height:1.5;cursor:pointer}
.hk-ck input{width:20px;height:20px;flex:0 0 20px;accent-color:#1E1C14;margin:0}
.hk-note{font-weight:500;font-size:.76rem;color:#5C5843;line-height:1.7;margin:0}
.hk-h{margin:.4rem 0 0;padding-top:.6rem;border-top:2px dotted #E8E5D0;font-size:.86rem}
.hk-msg{padding:.45rem .8rem;font-size:.82rem;line-height:1.6;background:#FFFEF7;border-top:2px solid #E8E5D0;min-height:2.4em;display:flex;gap:.6rem;align-items:center}
.hk-bar{height:8px;border:2px solid #1E1C14;border-radius:8px;overflow:hidden;background:#FBFAEC;width:160px}
.hk-bar i{display:block;height:100%;width:0;background:#E1DD60}
@media(max-width:760px){.hk-body{flex-direction:column}.hk-side{width:auto;flex:0 0 auto;border-left:0;border-top:2.5px solid #1E1C14;max-height:42vh}}
`;

let ort = null, sess = null;
async function loadModel(onP){
  if(sess) return sess;
  ort = ort || await import(ORT + 'ort.min.mjs');
  ort.env.wasm.wasmPaths = ORT;
  let buf = null;
  try {
    const c = await caches.open('sougou-ai');
    const hit = await c.match(MODEL);
    if(hit) buf = await hit.arrayBuffer();
    else {
      const res = await fetch(MODEL);
      if(!res.ok) throw new Error('model ' + res.status);
      const total = +res.headers.get('content-length') || 176e6;
      const rd = res.body.getReader(), parts = []; let got = 0;
      for(;;){ const { done, value } = await rd.read(); if(done) break; parts.push(value); got += value.length; onP(got / total); }
      const blob = new Blob(parts);
      try { await c.put(MODEL, new Response(blob)); } catch(_) {}
      buf = await blob.arrayBuffer();
    }
  } catch(e){
    if(!buf){ const res = await fetch(MODEL); if(!res.ok) throw e; buf = await res.arrayBuffer(); }
  }
  sess = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
  return sess;
}

/* 絵 → 0〜1 の こさ（絵と 同じ 大きさ） */
async function predict(img, W, H){
  const k = N / Math.max(W, H), w = Math.round(W * k), h = Math.round(H * k), ox = (N - w) >> 1, oy = (N - h) >> 1;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.drawImage(img, ox, oy, w, h);
  const px = g.getImageData(0, 0, N, N).data, a = new Float32Array(3 * N * N);
  for(let j = 0; j < N * N; j++) for(let q = 0; q < 3; q++) a[q * N * N + j] = px[j * 4 + q] / 255;
  const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', a, [1, 3, N, N]) });
  const o = r[sess.outputNames[0]].data;
  /* 1024 の ます目 → 絵の 大きさへ（なめらかに） */
  const out = new Float32Array(W * H);
  for(let y = 0; y < H; y++){
    const sy = Math.min(N - 1.001, Math.max(0, y * k + oy - 0.5 + k / 2)), y0 = Math.floor(sy), fy = sy - y0;
    for(let x = 0; x < W; x++){
      const sx = Math.min(N - 1.001, Math.max(0, x * k + ox - 0.5 + k / 2)), x0 = Math.floor(sx), fx = sx - x0;
      const i = y0 * N + x0;
      out[y * W + x] = (o[i] * (1 - fx) + o[i + 1] * fx) * (1 - fy) + (o[i + N] * (1 - fx) + o[i + N + 1] * fx) * fy;
    }
  }
  return out;
}

/* 押し引き: hole の ところへ まわりの 色を 流しこむ（ふちの 色の にじみ取り 用） */
function pushPull(rgb, known, W, H){
  const lv = [];
  let w = W, h = H, c = new Float32Array(W * H * 4);
  for(let i = 0; i < W * H; i++){ const k = known[i]; c[i * 4] = rgb[i * 4] * k; c[i * 4 + 1] = rgb[i * 4 + 1] * k; c[i * 4 + 2] = rgb[i * 4 + 2] * k; c[i * 4 + 3] = k; }
  lv.push({ c, w, h });
  while(w > 1 || h > 1){
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), n = new Float32Array(nw * nh * 4);
    for(let y = 0; y < nh; y++) for(let x = 0; x < nw; x++){
      const o = (y * nw + x) * 4;
      for(let dy = 0; dy < 2; dy++) for(let dx = 0; dx < 2; dx++){
        const s = (Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx)) * 4;
        for(let k = 0; k < 4; k++) n[o + k] += c[s + k];
      }
      if(n[o + 3] > 1) for(let k = 0; k < 4; k++) n[o + k] /= n[o + 3] > 0 ? n[o + 3] : 1;
    }
    c = n; w = nw; h = nh; lv.push({ c, w, h });
  }
  for(let L = lv.length - 2; L >= 0; L--){
    const f = lv[L].c, fw = lv[L].w, fh = lv[L].h, g = lv[L + 1].c, gw = lv[L + 1].w, gh = lv[L + 1].h;
    for(let y = 0; y < fh; y++) for(let x = 0; x < fw; x++){
      const o = (y * fw + x) * 4, wt = f[o + 3];
      if(wt >= 1) continue;
      const q = (Math.min(gh - 1, y >> 1) * gw + Math.min(gw - 1, x >> 1)) * 4, gw4 = g[q + 3] || 1;
      for(let k = 0; k < 3; k++) f[o + k] += (1 - wt) * g[q + k] / gw4;
      f[o + 3] = 1;
    }
  }
  const f = lv[0].c, out = new Float32Array(W * H * 3);
  for(let i = 0; i < W * H; i++){ const a = f[i * 4 + 3] || 1; out[i * 3] = f[i * 4] / a; out[i * 3 + 1] = f[i * 4 + 1] / a; out[i * 3 + 2] = f[i * 4 + 2] / a; }
  return out;
}

/* 1px ずつ けずる（まわりの いちばん うすい こさに する） */
function erode(a, W, H, r){
  let s = a;
  for(let k = 0; k < r; k++){
    const t = new Float32Array(W * H);
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const i = y * W + x;
      let m = s[i];
      if(x > 0 && s[i - 1] < m) m = s[i - 1];
      if(x < W - 1 && s[i + 1] < m) m = s[i + 1];
      if(y > 0 && s[i - W] < m) m = s[i - W];
      if(y < H - 1 && s[i + W] < m) m = s[i + W];
      t[i] = m;
    }
    s = t;
  }
  return s;
}

/* 設定から 仕上がりの 画素を つくる */
function finish(src, raw, brush, W, H, o){
  const width = 1 - o.hard / 100 * 0.94, lo = 0.5 - width / 2, hi = 0.5 + width / 2;
  let a = new Float32Array(W * H);
  for(let i = 0; i < W * H; i++){
    let v = (raw[i] - lo) / (hi - lo);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    if(brush){ if(brush[i] === 1) v = 1; else if(brush[i] === 2) v = 0; }
    a[i] = v;
  }
  if(o.erode > 0) a = erode(a, W, H, o.erode);
  const out = new Uint8ClampedArray(src);
  let F = null;
  if(o.clean){
    const known = new Float32Array(W * H);
    for(let i = 0; i < W * H; i++) known[i] = a[i] >= 0.97 ? 1 : 0;
    F = pushPull(src, known, W, H);
  }
  for(let i = 0; i < W * H; i++){
    const v = a[i];
    out[i * 4 + 3] = Math.round(src[i * 4 + 3] * v);
    if(F && v > 0 && v < 0.97){
      out[i * 4] = F[i * 3]; out[i * 4 + 1] = F[i * 3 + 1]; out[i * 4 + 2] = F[i * 3 + 2];
    }
  }
  return out;
}

/* ---------- 画面 ---------- */
export function openHaikei(layer, { toast, done }){
  const frames = (layer.frames || []).filter(id => S.proj.assets[id] && S.imgs[id]);
  if(!frames.length) return toast('絵の レイヤーを えらんでね');
  const curIdx = Math.max(0, Math.min(frames.length - 1, layer.frame || 0));
  const id0 = frames[curIdx], img = S.imgs[id0];
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;

  if(!document.getElementById('hk-css')){ const st = document.createElement('style'); st.id = 'hk-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.className = 'hk';
  root.innerHTML = `
    <div class="hk-top"><b>✂ 背景を 消す</b>
      <button data-k="cancel">やめる</button><button data-k="ok" class="g" disabled>✓ これで 消す</button></div>
    <div class="hk-body">
      <div class="hk-mid"><canvas></canvas></div>
      <div class="hk-side">
        <div>うしろの 見え方 <span class="hk-seg" data-g="bg"><button class="on">▦</button><button>白</button><button>黒</button><button>緑</button></span></div>
        <div class="hk-f"><div>ふちの かたさ <span data-v="hard"></span></div><input type="range" min="0" max="100" step="1" data-r="hard"></div>
        <div class="hk-f"><div>ふちを けずる <span data-v="erode"></span></div><input type="range" min="0" max="6" step="1" data-r="erode"></div>
        <label class="hk-ck"><input type="checkbox" data-c="clean" checked>ふちの 背景色の にじみを とる</label>
        <p class="hk-h">手で なおす</p>
        <div>ブラシ <span class="hk-seg" data-g="tool"><button class="on">✋ さわらない</button><button>のこす</button><button>けす</button></span></div>
        <div class="hk-f"><div>ブラシの 大きさ <span data-v="size"></span></div><input type="range" min="4" max="200" step="1" data-r="size"></div>
        <p class="hk-note">AI が まちがえた ところを なぞって なおす。${frames.length > 1 ? 'ブラシは いま 見て いる コマ だけに かかる。' : ''}</p>
        <p class="hk-note">${frames.length > 1 ? 'コマ ' + frames.length + 'まい ぜんぶの 背景を 消す。' : ''}AI は 初回だけ 約180MB を 読みこむ。絵は 外へ 送らない。</p>
      </div>
    </div>
    <div class="hk-msg"><span class="t"></span><span class="hk-bar" hidden><i></i></span></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const cv = $('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const msg = (t, r) => { $('.t').textContent = t; const b = $('.hk-bar'); b.hidden = r == null; if(r != null) b.firstElementChild.style.width = Math.round(r * 100) + '%'; };

  const o = { hard: 60, erode: 0, clean: true, size: 30 };
  let bg = 0, tool = 0, raw = null, brush = null, busy = false, pend = 0, result = null;
  const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
  const scg = sc.getContext('2d', { willReadFrequently: true });
  scg.drawImage(img, 0, 0, W, H);
  const src = scg.getImageData(0, 0, W, H).data;

  root.querySelectorAll('[data-r]').forEach(i => {
    const k = i.dataset.r; i.value = o[k];
    const show = () => { const sp = root.querySelector('[data-v=' + k + ']'); sp.textContent = k === 'erode' ? i.value + 'px' : i.value; };
    show();
    guardSlide(i, () => { o[k] = +i.value; show(); if(k !== 'size') later(); });
  });
  $('[data-c=clean]').onchange = e => { o.clean = e.target.checked; later(); };
  root.querySelectorAll('.hk-seg').forEach(sg => sg.querySelectorAll('button').forEach((b, k) => b.onclick = () => {
    sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if(sg.dataset.g === 'bg'){ bg = k; draw(); } else { tool = k; cv.style.cursor = k ? 'crosshair' : 'default'; }
  }));

  function later(){ clearTimeout(pend); pend = setTimeout(build, 60); }
  function build(){
    if(!raw) return;
    result = finish(src, raw, brush, W, H, o);
    draw();
  }
  function draw(){
    const col = ['', '#ffffff', '#000000', '#00c060'][bg];
    if(col){ g.fillStyle = col; g.fillRect(0, 0, W, H); }
    else {
      const s = Math.max(8, Math.round(Math.max(W, H) / 60));
      for(let y = 0; y < H; y += s) for(let x = 0; x < W; x += s){ g.fillStyle = ((x / s + y / s) & 1) ? '#E8E5D0' : '#FFFEF7'; g.fillRect(x, y, s, s); }
    }
    if(result){ scg.putImageData(new ImageData(result, W, H), 0, 0); g.drawImage(sc, 0, 0); }
    else g.drawImage(img, 0, 0, W, H);
  }

  /* ブラシ */
  let drag = false;
  const paintAt = e => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const rad = o.size * W / r.width / 2, v = tool;
    brush = brush || new Uint8Array(W * H);
    const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(W - 1, Math.ceil(x + rad));
    const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(H - 1, Math.ceil(y + rad));
    for(let yy = y0; yy <= y1; yy++) for(let xx = x0; xx <= x1; xx++) if((xx - x) ** 2 + (yy - y) ** 2 <= rad * rad) brush[yy * W + xx] = v;
    later();
  };
  cv.addEventListener('pointerdown', e => { if(!tool || !raw) return; drag = true; cv.setPointerCapture(e.pointerId); paintAt(e); });
  cv.addEventListener('pointermove', e => { if(drag) paintAt(e); });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { drag = false; }));

  $('[data-k=cancel]').onclick = () => root.remove();
  $('[data-k=ok]').onclick = async () => {
    if(busy || !raw) return;
    busy = true; $('[data-k=ok]').disabled = true;
    try {
      const made = [];
      for(let f = 0; f < frames.length; f++){
        const id = frames[f], im = S.imgs[id];
        let px;
        if(f === curIdx) px = result;
        else {
          msg('コマ ' + (f + 1) + ' / ' + frames.length + ' の 背景を 消して います…', f / frames.length);
          const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const cg = c.getContext('2d', { willReadFrequently: true }); cg.drawImage(im, 0, 0, w, h);
          const s2 = cg.getImageData(0, 0, w, h).data;
          px = finish(s2, await predict(im, w, h), null, w, h, o);
          made.push({ id, px, w, h });
          continue;
        }
        made.push({ id, px, w: W, h: H });
      }
      const out = [];
      for(const m of made){
        const c = document.createElement('canvas'); c.width = m.w; c.height = m.h;
        c.getContext('2d').putImageData(new ImageData(m.px, m.w, m.h), 0, 0);
        const url = c.toDataURL('image/png');
        out.push({ old: m.id, url, im: await loadImage(url), w: m.w, h: m.h });
      }
      edit('背景を 消す', () => {
        const map = {};
        out.forEach(x => { map[x.old] = addAsset((S.proj.assets[x.old].name || layer.name) + '（透明）', x.url, x.w, x.h, x.im); });
        layer.frames = layer.frames.map(id => map[id] || id);
      });
      done && done();
      toast('背景を 消しました');
      root.remove();
    } catch(e){
      console.error(e); msg('消せませんでした: ' + (e.message || e));
      busy = false; $('[data-k=ok]').disabled = false;
    }
  };

  draw();
  (async () => {
    try {
      msg('AI を 読みこみ中（はじめの 1回だけ 約180MB）', 0);
      await loadModel(r => msg('AI を 読みこみ中（はじめの 1回だけ 約180MB）', r));
      msg('背景を 見わけて います…（数秒〜数十秒）');
      raw = await predict(img, W, H);
      build();
      $('[data-k=ok]').disabled = false;
      msg('よければ「✓ これで 消す」。ふちが 気に なる ときは 右の つまみで');
    } catch(e){
      console.error(e); msg('AI を 読みこめませんでした。通信を たしかめて、ひらき直して ください');
    }
  })();
}
