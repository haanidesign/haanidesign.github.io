/* さくひんを 素材ごと 1つの ファイルに まとめる（ZIP）。
   中身は そのまま 入れる（動画も 画像も もう 縮んで いる ので 縮めない）。
   だから 書くのも 読むのも みじかい コードで すむ。 */
import { S, allClips, toast, resetHist } from './state.js?v=58';
import { MEDIA, importFiles } from './media.js?v=58';
import { bus } from './bus.js?v=58';

/* ---------- CRC32 ---------- */
let TBL = null;
function table() {
  if (TBL) return TBL;
  TBL = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    TBL[n] = c >>> 0;
  }
  return TBL;
}
function crc32(u8) {
  const t = table();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = t[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------- 書く ---------- */
function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
}
export function zip(files) {          // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder();
  const now = new Date();
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length);
    const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); v.setUint16(6, 0, true); v.setUint16(8, 0, true);
    v.setUint16(10, dosTime(now), true); v.setUint16(12, dosDate(now), true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
    lh.set(name, 30);
    parts.push(lh, f.data);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime(now), true); cv.setUint16(14, dosDate(now), true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true);
    ch.set(name, 46);
    central.push(ch);
    off += lh.length + f.data.length;
  }
  let cSize = 0;
  central.forEach(c => cSize += c.length);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cSize, true); ev.setUint32(16, off, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* ---------- 読む ---------- */
export function unzip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eo = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  }
  if (eo < 0) throw new Error('ZIP では ない');
  const n = v.getUint16(eo + 10, true);
  let p = v.getUint32(eo + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extLen = v.getUint16(p + 30, true);
    const cmtLen = v.getUint16(p + 32, true);
    const lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = v.getUint16(lo + 26, true);
    const lExtLen = v.getUint16(lo + 28, true);
    const start = lo + 30 + lNameLen + lExtLen;
    if (method === 0) out.push({ name, data: u8.subarray(start, start + size) });
    p += 46 + nameLen + extLen + cmtLen;
  }
  return out;
}

/* ---------- さくひんの 出し入れ ---------- */
const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '_');

export async function makePack(name = 'douga') {
  const files = [];
  const used = new Set(allClips().map(({ c }) => c.mid).filter(Boolean));
  const list = [];
  for (const m of MEDIA.values()) {
    if (!used.has(m.id) || !m.file) continue;
    const fn = 'sozai/' + m.id + '_' + safe(m.name);
    files.push({ name: fn, data: new Uint8Array(await m.file.arrayBuffer()) });
    list.push({ id: m.id, name: m.name, kind: m.kind, dur: m.dur, file: fn, type: m.file.type });
  }
  const proj = {
    app: 'douga-kobo', ver: 2, pack: true,
    W: S.W, H: S.H, fps: S.fps, bg: S.bg, dur: S.dur, step: S.step, trans: S.trans, cams: S.cams,
    beat: S.beat, master: S.master,
    media: list, tracks: S.tracks
  };
  files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(proj)) });
  return zip(files);
}

export async function openPack(file) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  const entries = unzip(u8);
  const pj = entries.find(e => e.name === 'project.json');
  if (!pj) throw new Error('中に さくひんが 入って いない');
  const o = JSON.parse(new TextDecoder().decode(pj.data));

  // 素材を 先に もどす
  MEDIA.clear();
  const files = [];
  const rename = new Map();
  (o.media || []).forEach(sm => {
    const e = entries.find(x => x.name === sm.file);
    if (!e) return;
    const f = new File([e.data.slice()], sm.name, { type: sm.type || '' });
    files.push({ f, oldId: sm.id });
  });
  await new Promise(res => {
    if (!files.length) { res(); return; }
    importFiles(files.map(x => x.f), res);
  });
  // 名前で 新しい id に つなぎ直す
  const byName = new Map([...MEDIA.values()].map(m => [m.name, m]));
  files.forEach(({ f, oldId }) => {
    const hit = byName.get(f.name);
    if (hit) rename.set(oldId, hit.id);
  });

  S.W = o.W; S.H = o.H; S.fps = o.fps; S.bg = o.bg || '#101010';
    S.dur = +o.dur > 0 ? +o.dur : 0;
    S.step = +o.step > 0 ? +o.step : 0;
    S.trans = Array.isArray(o.trans) ? o.trans : [];
    S.cams = Array.isArray(o.cams) ? o.cams : [];
  if (o.beat) S.beat = Object.assign(S.beat, o.beat);
  if (o.master) S.master = Object.assign(S.master, o.master);
  S.tracks = o.tracks; S.sel = null; S.selTrack = null; S.time = 0;
  allClips().forEach(({ c }) => { if (c.mid && rename.has(c.mid)) c.mid = rename.get(c.mid); });

  resetHist();
  bus.size(); bus.all(); bus.fit();
  toast('ひとまとめを ひらいた', 2600);
}
