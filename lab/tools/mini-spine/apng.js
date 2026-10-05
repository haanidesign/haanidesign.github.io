/* ミニSpine — アニメPNG（すける 動く 画像）を つくる
   こまごとの PNG（canvas.toBlob）から 中身（IDAT）を 取り出して、
   1つの APNG に ならべ直す。色が 落ちず、ふちの 半透明も そのまま 残る。
   動画工房は すける 動く 画像（GIF・WebP・APNG）を そのまま 読めるので、
   背景を あとから 下に しける。 */
'use strict';

const CRC_T = (() => { const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc32(bytes){ let c = 0xFFFFFFFF; for(let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** PNG を チャンクに わける */
function pngChunks(buf){
  const d = new DataView(buf), out = []; let p = 8;
  while(p < buf.byteLength){
    const len = d.getUint32(p), type = String.fromCharCode(d.getUint8(p+4), d.getUint8(p+5), d.getUint8(p+6), d.getUint8(p+7));
    out.push({ type, data: new Uint8Array(buf, p + 8, len) });
    p += 12 + len;
  }
  return out;
}
function chunk(type, data){
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for(let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const u32 = (dv, o, v) => dv.setUint32(o, v);

/**
 * frames … おなじ 大きさの canvas の ならび
 * fps    … 1秒に 何こま
 * 戻り値 … image/png の Blob（ずっと くり返す）
 */
async function makeApng(frames, fps, onStep){
  const W = frames[0].width, H = frames[0].height;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  let seq = 0, ihdr = null;
  const actl = new Uint8Array(8); const ad = new DataView(actl.buffer);
  u32(ad, 0, frames.length); u32(ad, 4, 0);              // こま数・くり返し（0＝ずっと）
  // 1秒 fps こま → delay = 1/fps 秒（分子と分母で もつ）
  const num = 1, den = Math.max(1, Math.round(fps));
  for(let i = 0; i < frames.length; i++){
    const buf = await new Promise((ok, ng) => frames[i].toBlob(b => b ? b.arrayBuffer().then(ok, ng) : ng(new Error('PNG に できませんでした')), 'image/png'));
    const ch = pngChunks(buf);
    if(!ihdr){ ihdr = ch.find(c => c.type === 'IHDR').data; parts.push(chunk('IHDR', ihdr), chunk('acTL', actl)); }
    const fc = new Uint8Array(26), fd = new DataView(fc.buffer);
    u32(fd, 0, seq++); u32(fd, 4, W); u32(fd, 8, H); u32(fd, 12, 0); u32(fd, 16, 0);
    fd.setUint16(20, num); fd.setUint16(22, den);
    fc[24] = 1;   // 次の こまの まえに 透明に もどす（前の こまが 残らない）
    fc[25] = 0;   // 上書き
    parts.push(chunk('fcTL', fc));
    ch.filter(c => c.type === 'IDAT').forEach(c => {
      if(i === 0) parts.push(chunk('IDAT', c.data));
      else {
        const fdat = new Uint8Array(4 + c.data.length);
        new DataView(fdat.buffer).setUint32(0, seq++);
        fdat.set(c.data, 4);
        parts.push(chunk('fdAT', fdat));
      }
    });
    if(onStep) onStep(i + 1, frames.length);
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  return new Blob(parts, { type: 'image/png' });
}
