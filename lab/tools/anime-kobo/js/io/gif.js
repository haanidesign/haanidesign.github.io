/* すける GIF（透過GIF）を つくる。

   GIF は 1まいにつき 色を 256いろまでしか 持てない。
   そのうち 1つを「すける色」に つかうので、絵に つかえるのは 255いろ。

   ながれ
     ① ぜんぶのコマから 色を すこしずつ 集める
     ② よく にた色を まとめて 255いろの 見本帳（パレット）を作る（メディアンカット）
     ③ 1ドットずつ いちばん近い色の ばんごうに おきかえる
        （うすい ところは すける色に する）
     ④ LZW で ちぢめて、GIF の 形に ならべる

   すけたまま 出せるので、動画の上に かさねる 素材に つかえる。 */

/* ---------- 書き出し用の 小さな 箱 ---------- */
class Bytes {
  constructor(){ this.a = new Uint8Array(1 << 16); this.n = 0; }
  need(k){
    if(this.n + k <= this.a.length) return;
    let len = this.a.length;
    while(len < this.n + k) len *= 2;
    const b = new Uint8Array(len);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  u8(v){ this.need(1); this.a[this.n++] = v & 255; }
  u16(v){ this.u8(v); this.u8(v >> 8); }
  str(s){ for(let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  bytes(arr){ this.need(arr.length); this.a.set(arr, this.n); this.n += arr.length; }
  out(){ return this.a.subarray(0, this.n); }
}

/* ---------- ② 見本帳を つくる（メディアンカット） ---------- */
function medianCut(samples, want){
  // samples … [r,g,b, r,g,b, ...]
  let boxes = [{ from: 0, to: samples.length / 3 }];
  const idx = new Uint32Array(samples.length / 3);
  for(let i = 0; i < idx.length; i++) idx[i] = i;

  const chan = (b) => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for(let i = b.from; i < b.to; i++){
      const p = idx[i] * 3;
      const r = samples[p], g = samples[p + 1], bl = samples[p + 2];
      if(r < rmin) rmin = r; if(r > rmax) rmax = r;
      if(g < gmin) gmin = g; if(g > gmax) gmax = g;
      if(bl < bmin) bmin = bl; if(bl > bmax) bmax = bl;
    }
    const dr = rmax - rmin, dg = gmax - gmin, db = bmax - bmin;
    return { c: dr >= dg && dr >= db ? 0 : (dg >= db ? 1 : 2), span: Math.max(dr, dg, db) };
  };

  while(boxes.length < want){
    // いちばん 色の ひろい 箱を わける
    let pick = -1, best = -1, pc = 0;
    for(let i = 0; i < boxes.length; i++){
      if(boxes[i].to - boxes[i].from < 2) continue;
      const k = chan(boxes[i]);
      if(k.span > best){ best = k.span; pick = i; pc = k.c; }
    }
    if(pick < 0 || best <= 0) break;

    const b = boxes[pick];
    const part = Array.from(idx.subarray(b.from, b.to));
    part.sort((x, y) => samples[x * 3 + pc] - samples[y * 3 + pc]);
    idx.set(part, b.from);
    const mid = (b.from + b.to) >> 1;
    boxes.splice(pick, 1, { from: b.from, to: mid }, { from: mid, to: b.to });
  }

  // 箱ごとの 平均を 代表の色に する
  const pal = [];
  for(const b of boxes){
    let r = 0, g = 0, bl = 0, n = 0;
    for(let i = b.from; i < b.to; i++){
      const p = idx[i] * 3;
      r += samples[p]; g += samples[p + 1]; bl += samples[p + 2]; n++;
    }
    if(!n) continue;
    pal.push([Math.round(r / n), Math.round(g / n), Math.round(bl / n)]);
  }
  if(!pal.length) pal.push([0, 0, 0]);
  return pal;
}

/* ---------- ③ いちばん近い色を さがす ---------- */
function nearest(pal, r, g, b){
  let best = 0, bd = Infinity;
  for(let i = 0; i < pal.length; i++){
    const p = pal[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    // 目は みどりに びんかんなので すこし おもくする
    const d = dr * dr * 3 + dg * dg * 6 + db * db * 1;
    if(d < bd){ bd = d; best = i; }
  }
  return best;
}

/* ---------- ④ LZW ---------- */
function lzw(indices, minCode){
  const out = new Bytes();
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let dict = new Map();
  let next = eoi + 1;

  let cur = 0, bits = 0;
  const chunk = [];
  const flushChunk = () => {
    if(!chunk.length) return;
    out.u8(chunk.length);
    out.bytes(Uint8Array.from(chunk));
    chunk.length = 0;
  };
  const push = (code) => {
    cur |= code << bits;
    bits += size;
    while(bits >= 8){
      chunk.push(cur & 255);
      cur >>= 8; bits -= 8;
      if(chunk.length === 255) flushChunk();
    }
  };
  const reset = () => { dict = new Map(); next = eoi + 1; size = minCode + 1; };

  push(clear);
  reset();

  let prev = indices[0];
  for(let i = 1; i < indices.length; i++){
    const k = indices[i];
    const key = prev * 4096 + k;
    const found = dict.get(key);
    if(found !== undefined){ prev = found; continue; }
    push(prev);
    dict.set(key, next++);
    if(next > (1 << size)){
      if(size < 12) size++;
      else { push(clear); reset(); }
    }
    prev = k;
  }
  push(prev);
  push(eoi);
  // のこりを 出す
  if(bits > 0){ chunk.push(cur & 255); if(chunk.length === 255) flushChunk(); }
  flushChunk();
  out.u8(0);            // ブロックの おわり
  return out.out();
}

/**
 * すける GIF を つくる。
 *   frames … [ImageData, ...]（ぜんぶ 同じ 大きさ）
 *   opt    … { delay:1コマの秒, colors:いろ数(2〜255), loop:くり返すか,
 *              onProgress(0〜1), alphaCut:すけると みなす こさ }
 */
export function encodeGif(frames, opt = {}){
  if(!frames.length) throw new Error('コマが ありません');
  const w = frames[0].width, h = frames[0].height;
  const delay = Math.max(2, Math.round((opt.delay || 1 / 12) * 100));   // 100分の1秒
  const want = Math.max(2, Math.min(255, opt.colors || 200));
  const cut = opt.alphaCut == null ? 128 : opt.alphaCut;
  const onProgress = opt.onProgress || (() => {});

  /* ① 色を 集める（ぜんぶ 見ると 重いので とばしながら） */
  const step = Math.max(1, Math.floor((w * h * frames.length) / 20000));
  const samp = [];
  for(const f of frames){
    const d = f.data;
    for(let i = 0; i < w * h; i += step){
      const p = i * 4;
      if(d[p + 3] < cut) continue;
      samp.push(d[p], d[p + 1], d[p + 2]);
    }
  }
  if(!samp.length) samp.push(0, 0, 0);

  /* ② 見本帳 */
  const pal = medianCut(Float64Array.from(samp), want);
  const transIdx = pal.length;                 // さいごを すける色に する
  let bits = 1;
  while((1 << bits) < pal.length + 1) bits++;
  bits = Math.max(2, Math.min(8, bits));
  const palSize = 1 << bits;

  /* ③ ばんごうに おきかえる（にた色は おぼえておいて はやくする） */
  const cache = new Map();
  const out = new Bytes();

  out.str('GIF89a');
  out.u16(w); out.u16(h);
  out.u8(0xF0 | (bits - 1));   // 見本帳あり、色の こまかさ
  out.u8(transIdx);            // せなかの色（つかわないが すける色に そろえる）
  out.u8(0);
  for(let i = 0; i < palSize; i++){
    const p = pal[i] || [0, 0, 0];
    out.u8(p[0]); out.u8(p[1]); out.u8(p[2]);
  }

  if(opt.loop !== false){      // ずっと くり返す
    out.u8(0x21); out.u8(0xFF); out.u8(11);
    out.str('NETSCAPE2.0');
    out.u8(3); out.u8(1); out.u16(0); out.u8(0);
  }

  const idxBuf = new Uint8Array(w * h);
  frames.forEach((f, fi) => {
    const d = f.data;
    for(let i = 0; i < w * h; i++){
      const p = i * 4;
      if(d[p + 3] < cut){ idxBuf[i] = transIdx; continue; }
      const key = (d[p] >> 2 << 12) | (d[p + 1] >> 2 << 6) | (d[p + 2] >> 2);
      let v = cache.get(key);
      if(v === undefined){ v = nearest(pal, d[p], d[p + 1], d[p + 2]); cache.set(key, v); }
      idxBuf[i] = v;
    }

    // コマの まえおき（すける色・まちじかん・つぎは 消してから 描く）
    out.u8(0x21); out.u8(0xF9); out.u8(4);
    out.u8(0x08 | 0x01);       // 2＝消してから／すける色 あり
    out.u16(delay);
    out.u8(transIdx);
    out.u8(0);

    out.u8(0x2C);
    out.u16(0); out.u16(0); out.u16(w); out.u16(h);
    out.u8(0);                 // このコマ用の 見本帳は なし
    const min = Math.max(2, bits);
    out.u8(min);
    out.bytes(lzw(idxBuf, min));

    onProgress((fi + 1) / frames.length);
  });

  out.u8(0x3B);                // おわり
  return new Blob([out.out()], { type: 'image/gif' });
}
