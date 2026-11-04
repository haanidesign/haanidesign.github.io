/* 書き出し。ページごとに PNG に して、ZIP に まとめる。
   フォルダ名は 半角英数字、ファイル名は「作品名＋ページ数」。 */
import { pageSVGs, PW, PH } from './render.js?v=4';

export async function svgToPng(svg, w, h) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise((ok, ng) => { img.onload = ok; img.onerror = () => ng(new Error('絵に できませんでした')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.drawImage(img, 0, 0, w, h);
    return await new Promise(ok => cv.toBlob(ok, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function safeName(s) { return String(s || 'name').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 40) || 'name'; }
export function asciiName(s) { const a = String(s || '').replace(/[^A-Za-z0-9_-]/g, ''); return a || 'name'; }

export async function exportZip(proj, onStep) {
  const pages = pageSVGs(proj);
  const W = 1200, H = Math.round(W * PH / PW);
  const folder = asciiName(proj.folder || proj.title);
  const files = [];
  for (let i = 0; i < pages.length; i++) {
    onStep && onStep(i, pages.length);
    const png = await svgToPng(pages[i].svg, W, H);
    files.push({ name: `${folder}/${safeName(proj.title)}${String(pages[i].no).padStart(2, '0')}.png`, data: new Uint8Array(await png.arrayBuffer()) });
  }
  return { blob: zip(files), name: folder + '.zip' };
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- ZIP（ちぢめない） ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function dosTime(d) { return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; }
function dosDate(d) { return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF; }
export function zip(files) {
  const enc = new TextEncoder(), now = new Date();
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);                 // 名前は UTF-8
    v.setUint16(8, 0, true); v.setUint16(10, dosTime(now), true); v.setUint16(12, dosDate(now), true);
    v.setUint32(14, crc, true); v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, f.data);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime(now), true); cv.setUint16(14, dosDate(now), true);
    cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, off, true);
    ch.set(name, 46);
    central.push(ch);
    off += lh.length + f.data.length;
  }
  let cSize = 0; central.forEach(c => cSize += c.length);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cSize, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
