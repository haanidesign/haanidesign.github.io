/* 🎞 動く 画像（GIF・アニメ WebP・APNG）を 読みこむ。

   ふつうの 画像として 読むと 1まいめ だけに なって 止まって しまう。
   1コマずつ ほどいて、パラパラ（コマ）の レイヤーに する。
     ・コマの 長さは ファイルの とおり
     ・すける ところは すけた まま（WebP で しまう）
     ・作品の 長さいっぱい くり返す
   ほどき方 … ブラウザの ImageDecoder が あれば それ。なければ GIF だけ 自前で ほどく。 */
import { S, addAsset } from '../state.js?v=406';
import { newLayer } from '../engine/layer.js?v=406';
import { loadImage } from './image.js?v=406';
import { setPin } from '../engine/anim.js?v=406';

const MAX_FRAMES = 300;
const MAX_SIDE = 1080;

export const mayAnimate = (f) =>
  /^image\/(gif|webp|apng|png)$/.test(f.type || '') || /\.(gif|webp|apng|png)$/i.test(f.name || '');

/** ほどいた コマ [{ canvas, dur(秒) }]。1コマ しか なければ null */
async function decode(file){
  const buf = await file.arrayBuffer();
  const type = file.type || (/\.gif$/i.test(file.name) ? 'image/gif' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/png');
  if(typeof ImageDecoder !== 'undefined'){
    try{
      const ok = await ImageDecoder.isTypeSupported(type);
      if(ok){
        const dec = new ImageDecoder({ data: buf, type });
        await dec.tracks.ready;
        const tr = dec.tracks.selectedTrack;
        const n = tr ? tr.frameCount : 1;
        if(!tr || !tr.animated || n < 2){ dec.close(); return null; }
        const out = [];
        for(let i = 0; i < Math.min(n, MAX_FRAMES); i++){
          const r = await dec.decode({ frameIndex: i });
          const vf = r.image;
          const c = document.createElement('canvas');
          c.width = vf.displayWidth; c.height = vf.displayHeight;
          c.getContext('2d').drawImage(vf, 0, 0);
          out.push({ canvas: c, dur: Math.max(0.02, (vf.duration || 100000) / 1e6) });
          vf.close();
        }
        dec.close();
        return out;
      }
    }catch(_){ /* 下の 自前に まかせる */ }
  }
  if(/gif/.test(type)) return decodeGif(new Uint8Array(buf));
  return null;
}

/** 読みこんで レイヤーに する。動かない 画像なら null（ふつうの 画像として 読む） */
export async function addAnimImageFile(file, opt = {}){
  const frames = await decode(file);
  if(!frames || frames.length < 2) return null;
  const w0 = frames[0].canvas.width, h0 = frames[0].canvas.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const base = (file.name || 'アニメ').replace(/\.[^.]+$/, '');
  const ids = [];
  for(let i = 0; i < frames.length; i++){
    g.clearRect(0, 0, w, h);
    g.drawImage(frames[i].canvas, 0, 0, w, h);
    const src = cv.toDataURL('image/webp', 0.92);
    ids.push(addAsset(base + '_' + (i + 1), src, w, h, await loadImage(src)));
    if(opt.onProgress) opt.onProgress(i + 1, frames.length);
  }
  const l = newLayer(base, ids);
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  const fit = Math.min(1, S.proj.w / w, S.proj.h / h);
  l.scaleX = l.scaleY = fit;
  l.tracks = {};
  let t = 0;
  frames.forEach((f, i) => { setPin(l, 'frame', +t.toFixed(3), i, 'hold'); t += f.dur; });
  /* 1周の 長さで くり返す */
  l.loop = { from: 0, to: +t.toFixed(3), mode: 'loop' };
  l.animImage = { name: file.name, frames: frames.length, sec: t };
  S.proj.layers.unshift(l);
  S.sel = l.id;
  return { layer: l, frames: frames.length, sec: t };
}

/* ================= GIF を 自前で ほどく（ImageDecoder が ない ブラウザ むけ） ================= */
function decodeGif(b){
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
  if(String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') return null;
  p = 6;
  const W = u16(), H = u16();
  const pk = u8(); u8(); u8();
  let gct = null;
  if(pk & 0x80){ const n = 2 << (pk & 7); gct = b.subarray(p, p + n * 3); p += n * 3; }
  const screen = document.createElement('canvas');
  screen.width = W; screen.height = H;
  const sg = screen.getContext('2d');
  let canvasData = sg.createImageData(W, H);
  let delay = 0.1, trans = -1, disposal = 0;
  const out = [];
  while(p < b.length && out.length < MAX_FRAMES){
    const id = u8();
    if(id === 0x21){
      const label = u8();
      if(label === 0xF9){
        u8(); const f = u8(); const d = u16(); const ti = u8(); u8();
        disposal = (f >> 2) & 7;
        trans = (f & 1) ? ti : -1;
        delay = Math.max(0.02, (d || 10) / 100);
      } else {
        let sz; while((sz = u8())) p += sz;
      }
    } else if(id === 0x2C){
      const x = u16(), y = u16(), w = u16(), h = u16();
      const ipk = u8();
      let ct = gct;
      if(ipk & 0x80){ const n = 2 << (ipk & 7); ct = b.subarray(p, p + n * 3); p += n * 3; }
      const interlace = !!(ipk & 0x40);
      const minCode = u8();
      const chunks = [];
      let sz; while((sz = u8())){ chunks.push(b.subarray(p, p + sz)); p += sz; }
      const data = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0; chunks.forEach(c => { data.set(c, o); o += c.length; });
      const idx = lzw(minCode, data, w * h);
      const before = disposal === 3 ? new Uint8ClampedArray(canvasData.data) : null;
      const rows = interlace ? interlaceRows(h) : null;
      const D = canvasData.data;
      for(let i = 0; i < w * h; i++){
        const ci = idx[i];
        if(ci === trans || ci == null || !ct) continue;
        const row = rows ? rows[Math.floor(i / w)] : Math.floor(i / w);
        const px = x + (i % w), py = y + row;
        if(px >= W || py >= H) continue;
        const q = (py * W + px) * 4;
        D[q] = ct[ci * 3]; D[q + 1] = ct[ci * 3 + 1]; D[q + 2] = ct[ci * 3 + 2]; D[q + 3] = 255;
      }
      sg.putImageData(canvasData, 0, 0);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(screen, 0, 0);
      out.push({ canvas: c, dur: delay });
      /* つぎの コマの まえに どう 片づけるか */
      if(disposal === 2){
        for(let yy = y; yy < Math.min(H, y + h); yy++) for(let xx = x; xx < Math.min(W, x + w); xx++){
          const q = (yy * W + xx) * 4; D[q] = D[q + 1] = D[q + 2] = D[q + 3] = 0;
        }
      } else if(disposal === 3 && before){
        canvasData.data.set(before);
      }
      trans = -1; disposal = 0; delay = 0.1;
    } else if(id === 0x3B){
      break;
    } else {
      break;
    }
  }
  return out.length >= 2 ? out : null;
}
function interlaceRows(h){
  const rows = [];
  [[0, 8], [4, 8], [2, 4], [1, 2]].forEach(([s, st]) => { for(let y = s; y < h; y += st) rows.push(y); });
  return rows;
}
function lzw(minCode, data, n){
  const clear = 1 << minCode, eoi = clear + 1;
  const out = new Uint8Array(n);
  let size = minCode + 1, mask = (1 << size) - 1, next = eoi + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  for(let i = 0; i < clear; i++){ prefix[i] = -1; suffix[i] = i; }
  let bits = 0, acc = 0, dp = 0, op = 0, old = -1, first = 0;
  while(op < n){
    while(bits < size){ if(dp >= data.length) return out; acc |= data[dp++] << bits; bits += 8; }
    const code = acc & mask; acc >>>= size; bits -= size;
    if(code === clear){ size = minCode + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
    if(code === eoi) break;
    let c = code, sp = 0;
    if(old === -1){ out[op++] = suffix[code]; old = code; first = code; continue; }
    if(code >= next){ stack[sp++] = first; c = old; }
    while(c >= clear){ stack[sp++] = suffix[c]; c = prefix[c]; }
    first = suffix[c];
    stack[sp++] = first;
    while(sp && op < n) out[op++] = stack[--sp];
    if(next < 4096){ prefix[next] = old; suffix[next] = first; next++;
      if(next === mask + 1 && size < 12){ size++; mask = (1 << size) - 1; } }
    old = code;
  }
  return out;
}
