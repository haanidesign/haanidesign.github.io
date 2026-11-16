/* LINE の動くスタンプを書き出す。
   決まり(LINE Creators Market): 320×270 以内でどちらかが 270 以上・5〜20 コマ・4 秒まで・
   ループ 1〜4 回・透過の APNG・1 個 1MB 以下・メイン画像 240×240・タブ画像 96×74。
   1 コマめは売り場で止まった絵として出るので、動きは少し待ってから始める。 */
"use strict";
(()=>{
const ACT_T0 = 0.15;   // 動きを始めるまで
const STAMP_ACTS = [
  {id:"nod",   label:"うなずく"},
  {id:"hop",   label:"はねる"},
  {id:"shake", label:"首をふる"},
  {id:"tilt",  label:"かしげる"},
  {id:"shy",   label:"てれる"},
  {id:"talk",  label:"しゃべる"},
  {id:"blink", label:"まばたき"},
  {id:"motion",label:"いまのモーション"},
];
const sel = $("stAct");
STAMP_ACTS.forEach(a=>{ const o = document.createElement("option"); o.value = a.id; o.textContent = a.label; sel.appendChild(o); });

/* ---- 決まった動き(毎回同じになる) ---- */
function autoDur(id){
  if(ACT_DUR[id]) return Math.min(4, Math.max(1, Math.ceil(ACT_T0 + ACT_DUR[id] + 0.15)));
  if(id === "motion"){ const MO = MOTIONS[motion.name]; return MO ? Math.min(4, Math.max(1, Math.round(MO.len))) : 2; }
  return 2;
}
function makeHook(id, D){
  const blinks = id === "blink" ? [D*0.35, D*0.35 + 0.36] : (D >= 2 && id !== "shy") ? [D*0.62] : [];
  const h = (t)=>{
    const o = {hx:0, hy:0, hz:0, tilt:0, gx:0, gy:0, eye:1, brow:0, bob:0, gazeBack:0};
    if(ACT_DUR[id]){
      const c = actCurve(id, Math.min(Math.max(0, t - ACT_T0), ACT_DUR[id]));
      for(const k in c) addLv(o, k, c[k]);
      if(id === "shy") o.smile = 0.35 * sstep(ACT_T0, ACT_T0 + 0.3, t) * (1 - sstep(ACT_T0 + ACT_DUR.shy - 0.3, ACT_T0 + ACT_DUR.shy, t));
    }
    if(id === "talk"){
      const K = Math.max(2, Math.round(D * 4));
      o.mouth = (0.5 - 0.5*Math.cos(2*Math.PI*K*t/D)) * (0.7 + 0.3*Math.sin(2*Math.PI*Math.round(D*1.3)*t/D)) * 0.85;
      o.hy += Math.sin(2*Math.PI*Math.round(D)*t/D) * 0.04;
    }
    return o;
  };
  h.blinkAt = t=>{
    for(const s of blinks){ const q = t - s; if(q >= 0 && q < 0.28) return blinkShape(q/0.28); }
    return 0;
  };
  return h;
}

/* ---- 減色(RGBA の中央値分割) ---- */
function cut4(px, n){
  const span = b=>{ const mn=[255,255,255,255], mx=[0,0,0,0];
    for(const p of b) for(let i=0;i<4;i++){ if(p[i]<mn[i])mn[i]=p[i]; if(p[i]>mx[i])mx[i]=p[i]; }
    return [mx[0]-mn[0], mx[1]-mn[1]*1.1, mx[2]-mn[2], (mx[3]-mn[3])*1.3]; };
  let boxes = [px];
  while(boxes.length < n){
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i)=>{ if(b.length < 2) return; const s = span(b), m = Math.max(...s);
      if(m > best){ best = m; bi = i; ch = s.indexOf(m); } });
    if(bi < 0 || best <= 0) break;
    const b = boxes.splice(bi, 1)[0];
    b.sort((x,y)=> x[ch]-y[ch]);
    const m = b.length >> 1;
    boxes.push(b.slice(0,m), b.slice(m));
  }
  return boxes.map(b=>{ const s=[0,0,0,0]; for(const p of b) for(let i=0;i<4;i++) s[i]+=p[i];
    return s.map(v=> Math.round(v/b.length)); });
}
function quantize(frames, nColors){
  const sample = [];
  const total = frames.reduce((a,f)=> a + f.data.length/4, 0);
  const every = Math.max(1, Math.floor(total / 60000));
  let k = 0;
  for(const f of frames){ const d = f.data;
    for(let i=0;i<d.length;i+=4){ if(d[i+3] < 8) continue; if((k++ % every) === 0) sample.push([d[i],d[i+1],d[i+2],d[i+3]]); } }
  const pal = [[0,0,0,0], ...(sample.length ? cut4(sample, nColors - 1) : [])];
  const cache = new Int16Array(1 << 19).fill(-1);
  const near = (r,g,b,a)=>{
    if(a < 8) return 0;
    const key = (r>>3)<<14 | (g>>3)<<9 | (b>>3)<<4 | (a>>4);
    let v = cache[key]; if(v >= 0) return v;
    let bd = 1e12;
    for(let i=1;i<pal.length;i++){ const p = pal[i];
      const dd = (r-p[0])**2*0.9 + (g-p[1])**2*1.2 + (b-p[2])**2*0.7 + (a-p[3])**2*1.5;
      if(dd < bd){ bd = dd; v = i; } }
    cache[key] = v; return v;
  };
  const idx = frames.map(f=>{ const d = f.data, o = new Uint8Array(d.length/4);
    for(let i=0, j=0; j<o.length; i+=4, j++) o[j] = near(d[i],d[i+1],d[i+2],d[i+3]);
    return o; });
  return {pal, idx};
}

/* ---- APNG ---- */
const CRC = (()=>{ const t = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c = n; for(let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc(bytes){ let c = 0xFFFFFFFF; for(const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const u32 = v => [(v>>>24)&255, (v>>>16)&255, (v>>>8)&255, v&255];
const u16 = v => [(v>>>8)&255, v&255];
function chunk(type, data){
  const td = new Uint8Array(4 + data.length);
  for(let i=0;i<4;i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0); out.set(td, 4); out.set(u32(crc(td)), 8 + data.length);
  return out;
}
async function zlib(raw){
  const cs = new CompressionStream("deflate");
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}
async function apng(idxFrames, pal, w, h, delayMs, loops){
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10])];
  parts.push(chunk("IHDR", new Uint8Array([...u32(w), ...u32(h), 8, 3, 0, 0, 0])));
  parts.push(chunk("acTL", new Uint8Array([...u32(idxFrames.length), ...u32(loops)])));
  parts.push(chunk("PLTE", new Uint8Array(pal.flatMap(p=> [p[0], p[1], p[2]]))));
  parts.push(chunk("tRNS", new Uint8Array(pal.map(p=> p[3]))));
  let seq = 0;
  for(let f=0; f<idxFrames.length; f++){
    parts.push(chunk("fcTL", new Uint8Array([...u32(seq++), ...u32(w), ...u32(h), ...u32(0), ...u32(0),
      ...u16(delayMs), ...u16(1000), 0, 0])));
    const raw = new Uint8Array((w + 1) * h), src = idxFrames[f];
    for(let y=0;y<h;y++){ raw[y*(w+1)] = 0; raw.set(src.subarray(y*w, y*w + w), y*(w+1) + 1); }
    const z = await zlib(raw);
    if(f === 0) parts.push(chunk("IDAT", z));
    else { const d = new Uint8Array(4 + z.length); d.set(u32(seq++), 0); d.set(z, 4); parts.push(chunk("fdAT", d)); }
  }
  parts.push(chunk("IEND", new Uint8Array(0)));
  return new Blob(parts, {type:"image/png"});
}

/* ---- コマを作る ---- */
const FONT = '"M PLUS Rounded 1c","Hiragino Sans",sans-serif';
function outline(src, r){
  // 白いふち: 絵を白で塗った影を、まわり 16 方向にずらして重ねる
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  const sil = document.createElement("canvas"); sil.width = src.width; sil.height = src.height;
  const sg = sil.getContext("2d");
  sg.drawImage(src, 0, 0); sg.globalCompositeOperation = "source-in"; sg.fillStyle = "#fff"; sg.fillRect(0,0,sil.width,sil.height);
  for(let a=0; a<16; a++){ const th = a/16*Math.PI*2; g.drawImage(sil, Math.cos(th)*r, Math.sin(th)*r); }
  g.drawImage(sil, 0, 0);
  g.drawImage(src, 0, 0);
  return c;
}

async function renderFrames(id, D, N){
  if(!layers.length) throw new Error("先に PSD か PNG を読み込んでください。");
  const text = $("stText").value.trim();
  const [fill, stroke] = $("stCol").value.split("|");
  const top = $("stPos").value === "top";
  const edge = $("stEdge").checked;
  if(text) await document.fonts.load(`800 40px ${FONT}`, text).catch(()=>{});

  const ow = outW(), oh = outH();
  const s0 = Math.min(1, 640 / Math.max(ow, oh));
  const cw = Math.round(ow*s0), ch = Math.round(oh*s0);
  const tb = text ? Math.round(Math.max(cw, ch) * 0.2) : 0;
  const Hc = ch + Math.round(tb * 0.75), Wc = cw;
  const charY = top ? Hc - ch : 0;
  const r = Math.max(2, Math.round(Math.max(Wc, Hc) / 110));

  const savedT = {...T}, savedMotion = motion.name;
  TOGGLES.filter(t=>t.live).forEach(t=> T[t.id] = false);
  if(id !== "motion") motion.name = "なし";
  const prevHook = poseHook;
  exporting = true; durOverride = D; poseHook = makeHook(id, D);
  const frames = [];
  try{
    const sim = 60, S = Math.round(D * sim), dt = 1/sim;
    resetSprings();
    for(let i=0;i<S*3;i++) step(i*dt, dt, true);
    const at = new Set(Array.from({length:N}, (_, i)=> Math.round(i*S/N)));
    const chc = document.createElement("canvas"); chc.width = cw; chc.height = ch;
    const cg = chc.getContext("2d");
    for(let j=0;j<S;j++){
      const st = step(j*dt, dt, true);
      if(!at.has(j)) continue;
      draw(st);
      cg.clearRect(0,0,cw,ch);
      cg.imageSmoothingQuality = "high";
      blit(cg, cw, ch);
      const fc = document.createElement("canvas"); fc.width = Wc; fc.height = Hc;
      const fg = fc.getContext("2d");
      fg.drawImage(edge ? outline(chc, r) : chc, 0, charY);
      if(text){
        let fs = tb * 0.82;
        fg.font = `800 ${fs}px ${FONT}`;
        const mw = fg.measureText(text).width;
        if(mw > Wc * 0.94){ fs *= Wc * 0.94 / mw; fg.font = `800 ${fs}px ${FONT}`; }
        fg.textAlign = "center"; fg.textBaseline = "middle"; fg.lineJoin = "round";
        const ty = top ? tb * 0.55 : Hc - tb * 0.55;
        fg.lineWidth = Math.max(4, fs * 0.22); fg.strokeStyle = stroke; fg.strokeText(text, Wc/2, ty);
        if(edge && stroke !== "#FFFFFF"){ fg.lineWidth = fs*0.22 + r*2; fg.strokeStyle = "#fff"; fg.globalCompositeOperation = "destination-over"; fg.strokeText(text, Wc/2, ty); fg.globalCompositeOperation = "source-over"; }
        fg.fillStyle = fill; fg.fillText(text, Wc/2, ty);
      }
      frames.push(fc);
      $("stInfo").textContent = `コマを作っています ${frames.length} / ${N}`;
      await new Promise(r=> setTimeout(r, 0));
    }
  } finally {
    exporting = false; durOverride = 0; poseHook = prevHook;
    Object.assign(T, savedT); syncChips();
    motion.name = savedMotion;
    resetSprings(); last = performance.now(); loopT0 = performance.now();
  }
  return frames;
}

/* 動かないすき間を切って、箱(maxW×maxH)におさめる。exact なら箱ぴったりの大きさにする */
function fitFrames(frames, maxW, maxH, exact){
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for(const f of frames){
    const d = f.getContext("2d").getImageData(0,0,f.width,f.height).data;
    for(let y=0;y<f.height;y++) for(let x=0;x<f.width;x++){
      if(d[(y*f.width+x)*4+3] > 8){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    }
  }
  if(x1 < 0) throw new Error("絵が見つかりません。枠の位置を確かめてください。");
  const pad = 2; x0 = Math.max(0, x0-pad); y0 = Math.max(0, y0-pad);
  x1 = Math.min(frames[0].width-1, x1+pad); y1 = Math.min(frames[0].height-1, y1+pad);
  const bw = x1-x0+1, bh = y1-y0+1;
  const s = Math.min(maxW/bw, maxH/bh);
  const w = exact ? maxW : Math.min(maxW, Math.round(bw*s)), h = exact ? maxH : Math.min(maxH, Math.round(bh*s));
  const dw = bw*s, dh = bh*s;
  return frames.map(f=>{
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", {willReadFrequently:true});
    g.imageSmoothingQuality = "high";
    g.drawImage(f, x0, y0, bw, bh, (w-dw)/2, (h-dh)/2, dw, dh);
    return c;
  });
}

async function build(maxW, maxH, exact){
  const id = sel.value;
  if(id === "motion" && !MOTIONS[motion.name]) throw new Error("「モーション」で動きを選んでから使ってください。");
  const D = +$("stDur").value || autoDur(id);
  const N = Math.max(5, Math.min(20, Math.round(D * 10)));
  const loops = Math.max(1, Math.min(4, Math.floor(4 / D)));
  const big = await renderFrames(id, D, N);
  const fr = fitFrames(big, maxW, maxH, exact);
  const w = fr[0].width, h = fr[0].height;
  let blob = null, colors = 256;
  for(; colors >= 32; colors >>= 1){
    $("stInfo").textContent = `色をまとめています(${colors}色)…`;
    await new Promise(r=> setTimeout(r, 0));
    const {pal, idx} = quantize(fr.map(c=> c.getContext("2d").getImageData(0,0,w,h)), colors);
    blob = await apng(idx, pal, w, h, Math.round(D*1000/N), loops);
    if(blob.size < 1000*1024) break;
  }
  return {blob, w, h, N, D, loops, first: fr[0]};
}

function show(r, name){
  const info = $("stInfo");
  info.innerHTML = "";
  const img = new Image();
  img.src = URL.createObjectURL(r.blob);
  img.style.cssText = "display:block;max-width:100%;margin:6px 0;border:2px solid #1E1C14;border-radius:8px;" +
    "background:conic-gradient(#E8E5D0 0 25%,#FFFEF7 0 50%,#E8E5D0 0 75%,#FFFEF7 0) 0 0/16px 16px";
  const kb = Math.ceil(r.blob.size/1024);
  const t = document.createElement("div");
  t.textContent = `${name ? name + " を保存しました。" : ""}${r.w}×${r.h}・${r.N}コマ・${r.D}秒×${r.loops}回・${kb}KB`;
  info.append(img, t);
}

let busy = false;
async function run(btn, fn){
  if(busy) return;
  busy = true; btn.disabled = true;
  try{ await fn(); }
  catch(e){ $("stInfo").textContent = e.message || String(e); }
  finally{ busy = false; btn.disabled = false; }
}
let count = 1;
const pad2 = n => String(n).padStart(2, "0");
$("stPrev").onclick = ()=> run($("stPrev"), async ()=>{ show(await build(320, 270, false)); });
$("stGo").onclick = ()=> run($("stGo"), async ()=>{
  const r = await build(320, 270, false);
  const name = pad2(count++) + ".png";
  save(r.blob, name); show(r, name);
});
$("stMain").onclick = ()=> run($("stMain"), async ()=>{
  const r = await build(240, 240, true);
  save(r.blob, "main.png"); show(r, "main.png");
});
$("stTab").onclick = ()=> run($("stTab"), async ()=>{
  const r = await build(96, 74, true);
  const blob = await new Promise(res=> r.first.toBlob(res, "image/png"));
  save(blob, "tab.png");
  $("stInfo").textContent = "tab.png を保存しました(96×74・止まった絵)。";
});
})();
