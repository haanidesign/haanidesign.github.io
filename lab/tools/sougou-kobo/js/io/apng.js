/* すける アニメPNG（APNG）を つくる。ミニSpine の apng.js と 同じ やり方。
   こまごとの PNG から 中身（IDAT）を とりだして、1つに ならべ直す。
   色が 落ちず、ふちの 半透明も そのまま 残る。動画工房は そのまま 読める。 */

const CRC_T = (() => { const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc32(b){ let c = 0xFFFFFFFF; for(let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function pngChunks(buf){
  const d = new DataView(buf), out = []; let p = 8;
  while(p < buf.byteLength){
    const len = d.getUint32(p);
    const type = String.fromCharCode(d.getUint8(p+4), d.getUint8(p+5), d.getUint8(p+6), d.getUint8(p+7));
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
const toPng = (cv) => new Promise((ok, ng) =>
  cv.toBlob(b => b ? b.arrayBuffer().then(ok, ng) : ng(new Error('PNG に できませんでした')), 'image/png'));

/**
 * n こまの APNG。drawFrame(i) が その こまの canvas を かえす。
 * 1こまずつ PNG に して すぐ 捨てる ので、長くても 手もとに こまを ためない。
 */
export async function makeApng(n, fps, drawFrame, onStep, shouldStop){
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  let seq = 0, ihdr = null, W = 0, H = 0;
  const actl = new Uint8Array(8), ad = new DataView(actl.buffer);
  ad.setUint32(0, n); ad.setUint32(4, 0);           // こま数・くり返し（0＝ずっと）
  for(let i = 0; i < n; i++){
    if(shouldStop && shouldStop()) throw new Error('やめました');
    const cv = drawFrame(i);
    W = cv.width; H = cv.height;
    const ch = pngChunks(await toPng(cv));
    if(!ihdr){ ihdr = ch.find(c => c.type === 'IHDR').data; parts.push(chunk('IHDR', ihdr), chunk('acTL', actl)); }
    const fc = new Uint8Array(26), fd = new DataView(fc.buffer);
    fd.setUint32(0, seq++); fd.setUint32(4, W); fd.setUint32(8, H); fd.setUint32(12, 0); fd.setUint32(16, 0);
    fd.setUint16(20, 1); fd.setUint16(22, Math.max(1, Math.round(fps)));
    fc[24] = 1;   // つぎの こまの 前に 透明に もどす
    fc[25] = 0;
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
    if(onStep) onStep((i + 1) / n);
  }
  parts.push(chunk('IEND', new Uint8Array(0)));
  return { blob: new Blob(parts, { type: 'image/png' }), w: W, h: H };
}
