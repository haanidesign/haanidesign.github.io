/* LINE スタンプ工房の 書き出し部品: 減色・APNG・zip・白いふち・切りぬき
   (PSD アバタースタジオの stamp.js と 同じ 作り) */
"use strict";
const LS = (()=>{
/* ---- CRC32 ---- */
const CRC = (()=>{ const t = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c = n; for(let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc(bytes){ let c = 0xFFFFFFFF; for(let i=0;i<bytes.length;i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const be32 = v => [(v>>>24)&255, (v>>>16)&255, (v>>>8)&255, v&255];
const be16 = v => [(v>>>8)&255, v&255];

/* ---- 減色(RGBA の 中央値分割) ---- */
function cut4(px, n){
  const span = b=>{ const mn=[255,255,255,255], mx=[0,0,0,0];
    for(const p of b) for(let i=0;i<4;i++){ if(p[i]<mn[i])mn[i]=p[i]; if(p[i]>mx[i])mx[i]=p[i]; }
    return [mx[0]-mn[0], (mx[1]-mn[1])*1.1, mx[2]-mn[2], (mx[3]-mn[3])*1.3]; };
  let boxes = [px];
  while(boxes.length < n){
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i)=>{ if(b.length < 2) return; const s = span(b), m = Math.max(...s); if(m > best){ best = m; bi = i; ch = s.indexOf(m); } });
    if(bi < 0 || best <= 0) break;
    const b = boxes.splice(bi, 1)[0];
    b.sort((x,y)=> x[ch]-y[ch]);
    const m = b.length >> 1;
    boxes.push(b.slice(0,m), b.slice(m));
  }
  return boxes.map(b=>{ const s=[0,0,0,0]; for(const p of b) for(let i=0;i<4;i++) s[i]+=p[i]; return s.map(v=> Math.round(v/b.length)); });
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
function chunk(type, data){
  const td = new Uint8Array(4 + data.length);
  for(let i=0;i<4;i++) td[i] = type.charCodeAt(i);
  td.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(be32(data.length), 0); out.set(td, 4); out.set(be32(crc(td)), 8 + data.length);
  return out;
}
async function zlib(raw){
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
  return new Uint8Array(buf);
}
async function apng(idxFrames, pal, w, h, delayMs, loops){
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10])];
  parts.push(chunk("IHDR", new Uint8Array([...be32(w), ...be32(h), 8, 3, 0, 0, 0])));
  parts.push(chunk("acTL", new Uint8Array([...be32(idxFrames.length), ...be32(loops)])));
  parts.push(chunk("PLTE", new Uint8Array(pal.flatMap(p=> [p[0], p[1], p[2]]))));
  parts.push(chunk("tRNS", new Uint8Array(pal.map(p=> p[3]))));
  let seq = 0;
  for(let f=0; f<idxFrames.length; f++){
    parts.push(chunk("fcTL", new Uint8Array([...be32(seq++), ...be32(w), ...be32(h), ...be32(0), ...be32(0), ...be16(delayMs), ...be16(1000), 0, 0])));
    const raw = new Uint8Array((w + 1) * h), src = idxFrames[f];
    for(let y=0;y<h;y++){ raw[y*(w+1)] = 0; raw.set(src.subarray(y*w, y*w + w), y*(w+1) + 1); }
    const z = await zlib(raw);
    if(f === 0) parts.push(chunk("IDAT", z));
    else { const d = new Uint8Array(4 + z.length); d.set(be32(seq++), 0); d.set(z, 4); parts.push(chunk("fdAT", d)); }
  }
  parts.push(chunk("IEND", new Uint8Array(0)));
  return new Blob(parts, {type:"image/png"});
}
/* 1MB を こえたら 色を へらして 作り直す */
async function encodeApng(canvases, delayMs, loops){
  const w = canvases[0].width, h = canvases[0].height;
  const ims = canvases.map(c=> c.getContext("2d").getImageData(0,0,w,h));
  let blob = null;
  for(let colors = 256; colors >= 32; colors >>= 1){
    const {pal, idx} = quantize(ims, colors);
    blob = await apng(idx, pal, w, h, delayMs, loops);
    if(blob.size < 1000*1024) break;
  }
  return blob;
}

/* ---- zip(圧縮なし。PNG は もう 縮んで いる) ---- */
async function makeZip(files){
  const enc = new TextEncoder(), parts = [], cen = [];
  let off = 0;
  const le16 = v=> [v & 255, (v >> 8) & 255], le32 = v=> [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for(const f of files){
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), c = crc(data);
    const head = [...le32(0x04034b50), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(time), ...le16(date),
      ...le32(c), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0)];
    parts.push(new Uint8Array(head), name, data);
    cen.push(new Uint8Array([...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(time), ...le16(date),
      ...le32(c), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
      ...le32(0), ...le32(off)]), name);
    off += head.length + name.length + data.length;
  }
  const cenSize = cen.reduce((a, b)=> a + b.length, 0);
  const end = new Uint8Array([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(cenSize), ...le32(off), ...le16(0)]);
  return new Blob([...parts, ...cen, end], {type:"application/zip"});
}

/* ---- 白いふち: 絵を 白で 塗った 影を まわり 16 方向に ずらして 重ねる ---- */
function outline(src, r, color){
  if(r <= 0) return src;
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  const sil = document.createElement("canvas"); sil.width = src.width; sil.height = src.height;
  const sg = sil.getContext("2d");
  sg.drawImage(src, 0, 0); sg.globalCompositeOperation = "source-in"; sg.fillStyle = color || "#fff"; sg.fillRect(0,0,sil.width,sil.height);
  const steps = Math.max(16, Math.round(r * 3));
  for(let a=0; a<steps; a++){ const th = a/steps*Math.PI*2; g.drawImage(sil, Math.cos(th)*r, Math.sin(th)*r); }
  for(let a=0; a<8; a++){ const th = a/8*Math.PI*2; g.drawImage(sil, Math.cos(th)*r*0.5, Math.sin(th)*r*0.5); }
  g.drawImage(src, 0, 0);
  return c;
}

/* ---- 絵の ある ところの 四角(1 まい でも 何まい でも) ---- */
function bbox(canvases){
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for(const f of canvases){
    const w = f.width, h = f.height, d = f.getContext("2d", {willReadFrequently:true}).getImageData(0,0,w,h).data;
    for(let y=0;y<h;y++){ const row = y*w*4;
      for(let x=0;x<w;x++){ if(d[row + x*4 + 3] > 10){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } }
  }
  return x1 < 0 ? null : {x:x0, y:y0, w:x1-x0+1, h:y1-y0+1};
}

/* ---- まわりの 色を 消す: ふちから つながって いる 似た 色を 透明に ---- */
function removeBg(img, tol){
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", {willReadFrequently:true}); g.drawImage(img, 0, 0);
  const W = c.width, H = c.height, im = g.getImageData(0,0,W,H), d = im.data;
  // 四すみの 色の まんなかを 背景の 色と みなす
  const corners = [0, W-1, (H-1)*W, (H-1)*W + W-1].map(i=> [d[i*4], d[i*4+1], d[i*4+2]]);
  const bg = [0,1,2].map(k=> corners.map(c=> c[k]).sort((a,b)=> a-b)[1]);
  const T = tol * tol * 3;
  const dist = i=> (d[i*4]-bg[0])**2 + (d[i*4+1]-bg[1])**2 + (d[i*4+2]-bg[2])**2;
  const seen = new Uint8Array(W*H), st = [];
  for(let x=0;x<W;x++){ st.push(x, (H-1)*W + x); }
  for(let y=0;y<H;y++){ st.push(y*W, y*W + W-1); }
  while(st.length){
    const i = st.pop();
    if(seen[i]) continue; seen[i] = 1;
    if(d[i*4+3] < 10 || dist(i) <= T){
      d[i*4+3] = 0;
      const x = i % W, y = (i - x) / W;
      if(x > 0) st.push(i-1); if(x < W-1) st.push(i+1); if(y > 0) st.push(i-W); if(y < H-1) st.push(i+W);
    }
  }
  // 消した ところの となりは 少しだけ 透かして ギザギザを やわらげる
  for(let i=0;i<W*H;i++){
    if(d[i*4+3] === 0) continue;
    const x = i % W, y = (i - x) / W;
    let n = 0;
    if(x > 0 && d[(i-1)*4+3] === 0) n++; if(x < W-1 && d[(i+1)*4+3] === 0) n++;
    if(y > 0 && d[(i-W)*4+3] === 0) n++; if(y < H-1 && d[(i+W)*4+3] === 0) n++;
    if(n && dist(i) <= T*4) d[i*4+3] = Math.round(d[i*4+3] * 0.45);
  }
  g.putImageData(im, 0, 0);
  return c;
}

return {crc, quantize, apng, encodeApng, makeZip, outline, bbox, removeBg};
})();
