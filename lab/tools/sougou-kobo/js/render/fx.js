/* 🎞 画面の 仕上げ（動画工房の「ぜんたいの しかけ」を もってきた もの）。

   できあがった 1コマを 読みかえして、ずらす・かさねる・ぬる。
   作品の 中の 座標（project.w × project.h）で 考えて、
   紙（キャンバス）の 上では その 枠の ところだけ に かける。

   project.fx に 0〜1（明るさ・コントラスト・あざやかさ は 100 が ふつう）で 持つ。
   拍で 動く もの（フラッシュ・ズーム・シャッター など）は project.beat.bpm を 見る。
   BPM が なければ 1秒に 2拍 と みなす。 */

export const FX_KEYS = [
  /* [キー, 名前, なかま] */
  ['br', '明るさ', 'color'], ['ct', 'コントラスト', 'color'], ['sa', 'あざやかさ', 'color'], ['rgb', '色ずれ', 'color'],
  ['grain', 'ざらざら', 'film'], ['vignette', 'まわり暗く', 'film'], ['scratch', 'フィルムの 傷', 'film'],
  ['burn', 'フィルム焼け', 'film'], ['halo', '光の ふち', 'film'], ['bloom', 'ふんわり 発光', 'film'],
  ['slice', 'よこ ずれ', 'glitch'], ['block', 'ブロック ずれ', 'glitch'], ['vhs', 'VHS', 'glitch'],
  ['mosaic', 'モザイク', 'glitch'], ['snow', '砂あらし', 'glitch'], ['bars', 'カラーバー', 'glitch'],
  ['scan', '走査線', 'glitch'], ['invert', '拍で 反転', 'glitch'],
  ['flash', '拍で フラッシュ', 'beat'], ['shake', '拍で ゆれ', 'beat'], ['zoom', '拍で ズーム', 'beat'],
  ['shutter', '拍で シャッター', 'beat'], ['lines', '拍で 集中線', 'beat'], ['flare', '拍で フレア', 'beat'],
  ['strobe', 'ストロボ', 'beat'], ['sparkle', 'キラキラ', 'beat']
];
export const FX_GROUPS = [['color', '色'], ['film', 'フィルム'], ['glitch', 'こわす'], ['beat', '拍で うごく']];
export const isPct = (k) => k === 'br' || k === 'ct' || k === 'sa';

/* ひと押しの 組み合わせ */
export const FX_LOOKS = [
  ['なし', {}],
  ['フィルム', { grain: .35, vignette: .4, scratch: .4, burn: .2, ct: 108, sa: 92 }],
  ['VHS', { vhs: .5, rgb: .35, scan: .4, snow: .12, sa: 115, grain: .2 }],
  ['グリッチ', { slice: .6, block: .5, rgb: .5, invert: .4 }],
  ['PV（拍）', { flash: .3, zoom: .4, shake: .2, shutter: .3, ct: 110 }],
  ['エモい', { bloom: .4, halo: .35, grain: .15, vignette: .3, sa: 90, br: 104 }]
];

export function anyFx(m){
  if(!m) return false;
  for(const [k] of FX_KEYS){
    const v = m[k];
    if(v == null) continue;
    if(isPct(k) ? v !== 100 : v > 0) return true;
  }
  return false;
}

function rnd2(seed){
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let x = Math.imul(a ^ a >>> 15, 1 | a);
    x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  };
}
const tick = (t) => Math.floor(t * 24);

let grainTile = null;
function makeGrain(){
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), im = g.createImageData(n, n);
  for(let i = 0; i < im.data.length; i += 4){
    const v = 120 + Math.random() * 135;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/* 作業用の 紙 */
const sheets = {};
function sheet(name, w, h){
  let c = sheets[name];
  if(!c){ c = sheets[name] = document.createElement('canvas'); }
  if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  return c;
}

/**
 * 仕上げを かける。
 *   ctx … 描き おわった 紙
 *   tf  … 作品の 座標 → 紙の 座標（[a,0,0,d,e,f]）
 *   opt.light … 再生中の かるい 見せ方（おもい ものは 休む）
 */
export function applyFx(ctx, project, tf, time, opt = {}){
  const m = project.fx;
  if(!anyFx(m)) return;
  const W = project.w, H = project.h;
  const z = Math.abs(tf[0]);
  /* 枠が 紙の どこに あるか（ドット） */
  const x0 = Math.round(tf[4]), y0 = Math.round(tf[5]);
  const pw = Math.max(2, Math.round(W * z)), ph = Math.max(2, Math.round(H * z));
  const cv = ctx.canvas;
  const sx = Math.max(0, x0), sy = Math.max(0, y0);
  const ex = Math.min(cv.width, x0 + pw), ey = Math.min(cv.height, y0 + ph);
  if(ex - sx < 2 || ey - sy < 2) return;

  /* 枠の ぶんを 写しとる */
  const src = sheet('src', pw, ph), sg = src.getContext('2d');
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1; sg.filter = 'none';
  sg.clearRect(0, 0, pw, ph);
  sg.drawImage(cv, sx, sy, ex - sx, ey - sy, sx - x0, sy - y0, ex - sx, ey - sy);

  const bpm = project.beat && project.beat.bpm > 0 ? project.beat.bpm : 120;
  const off = (project.beat && project.beat.offset) || 0;
  const beat = Math.max(0, (time - off)) * bpm / 60;
  const ph0 = beat - Math.floor(beat);       // 拍の 中の 位置 0→1
  const light = !!opt.light;

  /* できあがりの 紙に 色・色ずれ・ゆれ・ズームを かけて 写す */
  const out = sheet('out', pw, ph), g = out.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, pw, ph);
  const br = m.br == null ? 100 : m.br, ct = m.ct == null ? 100 : m.ct, sa = m.sa == null ? 100 : m.sa;
  const filt = (br !== 100 || ct !== 100 || sa !== 100) ? `brightness(${br}%) contrast(${ct}%) saturate(${sa}%)` : 'none';

  /* ゆれ・ズーム（拍の あたまで 大きく）。はしが 見えない ように すこし 大きく する */
  const kb = Math.pow(1 - ph0, 4);
  const shake = m.shake || 0, zoomA = m.zoom || 0;
  const zz = 1 + kb * zoomA * 0.12 + shake * 0.03;
  const r = rnd2(tick(time) * 9176 + 3);
  const dx = shake ? (r() - .5) * shake * W * .02 * (0.4 + kb) * z : 0;
  const dy = shake ? (r() - .5) * shake * H * .02 * (0.4 + kb) * z : 0;
  g.save();
  g.translate(pw / 2 + dx, ph / 2 + dy); g.scale(zz, zz); g.translate(-pw / 2, -ph / 2);
  g.filter = filt;
  const rgb = light ? 0 : (m.rgb || 0);
  if(rgb > 0){
    const d = rgb * W * .01 * z;
    const ch = sheet('ch', pw, ph), cg = ch.getContext('2d');
    const split = (col) => {
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.globalCompositeOperation = 'source-over'; cg.clearRect(0, 0, pw, ph);
      cg.drawImage(src, 0, 0);
      cg.globalCompositeOperation = 'multiply'; cg.fillStyle = col; cg.fillRect(0, 0, pw, ph);
      cg.globalCompositeOperation = 'destination-in'; cg.drawImage(src, 0, 0);
      cg.globalCompositeOperation = 'source-over';
      return ch;
    };
    g.drawImage(split('#ff0000'), -d, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(split('#00ffff'), d, 0);
    g.globalCompositeOperation = 'source-over';
  } else {
    g.drawImage(src, 0, 0);
  }
  g.restore();
  g.filter = 'none';

  /* ここから 先は 作品の 座標で 描く */
  g.setTransform(z, 0, 0, z, 0, 0);
  const q = z;
  const P = { g, W, H, q, t: time, ph: ph0 };
  if(!light){
    if(m.slice > 0) sliceGlitch(P, m.slice);
    if(m.block > 0) blockGlitch(P, m.block);
    if(m.vhs > 0) vhsRoll(P, m.vhs);
    if(m.mosaic > 0) mosaicPass(P, m.mosaic);
    if(m.bloom > 0) bloomPass(P, m.bloom);
    if(m.invert > 0) invertPass(P, m.invert);
    if(m.burn > 0) filmBurn(P, m.burn);
    if(m.snow > 0) noiseSnow(P, m.snow);
    if(m.bars > 0) colorBar(P, m.bars);
  }
  if(m.scratch > 0) filmScratch(P, m.scratch);
  if(m.strobe > 0) strobe(P, m.strobe);
  if(m.sparkle > 0) sparkle(P, m.sparkle);
  if(m.flare > 0) flare(P, m.flare);
  if(m.shutter > 0) shutterPass(P, m.shutter);
  if(m.halo > 0) vignetteColor(P, m.halo, 'rgba(255,170,90,.55)');
  if(m.scan > 0) scanLines(P, m.scan);
  if(m.lines > 0) speedLines(P, m.lines);
  if(m.flash > 0){
    const a = Math.pow(1 - ph0, 6) * m.flash;
    if(a > .004){ g.globalAlpha = Math.min(1, a); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  }
  if(m.vignette > 0){
    const rr = Math.hypot(W, H) / 2;
    const gr = g.createRadialGradient(W / 2, H / 2, rr * .45, W / 2, H / 2, rr);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${Math.min(.92, m.vignette)})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if(!light && m.grain > 0){
    if(!grainTile) grainTile = makeGrain();
    g.save();
    g.globalAlpha = Math.min(.5, m.grain * .5);
    g.globalCompositeOperation = 'overlay';
    const p = g.createPattern(grainTile, 'repeat');
    g.translate((Math.random() * 40) | 0, (Math.random() * 40) | 0);
    g.fillStyle = p; g.fillRect(-40, -40, W + 80, H + 80);
    g.restore();
  }

  /* 枠の ところへ もどす */
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.beginPath(); ctx.rect(sx, sy, ex - sx, ey - sy); ctx.clip();
  ctx.clearRect(sx, sy, ex - sx, ey - sy);
  ctx.drawImage(out, x0, y0);
  ctx.restore();
}

/* ---------- ひとつずつ（動画工房と 同じ 中身。S.W/S.H を W/H に） ---------- */
function burst(t, salt, amt){
  const r = rnd2(tick(t) * 374761393 + salt);
  return r() < .18 + amt * .3;
}
function sliceGlitch({ g, W, H, q, t }, amt){
  if(!burst(t, 11, amt)) return;
  const cv = g.canvas;
  const r = rnd2(tick(t) * 2654435761);
  const n = 3 + Math.floor(r() * 8 * amt);
  for(let i = 0; i < n; i++){
    const y = r() * H, h = H * (.01 + r() * .08);
    const dx = (r() - .5) * W * .12 * amt;
    try{ g.drawImage(cv, 0, y * q, cv.width, h * q, dx, y, W, h); }catch(e){}
  }
}
function blockGlitch({ g, W, H, q, t }, amt){
  if(!burst(t, 29, amt)) return;
  const cv = g.canvas;
  const r = rnd2(tick(t) * 40503 + 7);
  const n = 2 + Math.floor(r() * 7 * amt);
  for(let i = 0; i < n; i++){
    const w = W * (.05 + r() * .22), h = H * (.03 + r() * .14);
    const x = r() * (W - w), y = r() * (H - h);
    const dx = (r() - .5) * W * .1 * amt, dy = (r() - .5) * H * .04 * amt;
    try{ g.drawImage(cv, x * q, y * q, w * q, h * q, x + dx, y + dy, w, h); }catch(e){}
  }
}
function scanLines({ g, W, H }, amt){
  const gap = Math.max(2, Math.round(H / 220));
  g.save(); g.globalAlpha = Math.min(.5, amt * .35); g.fillStyle = '#000';
  for(let y = 0; y < H; y += gap * 2) g.fillRect(0, y, W, gap);
  g.restore();
}
function bloomPass({ g, W, H }, amt){
  const cv = g.canvas;
  const bw = Math.max(32, Math.round(cv.width / 4)), bh = Math.max(18, Math.round(cv.height / 4));
  const b = sheet('bloom', bw, bh), bg = b.getContext('2d');
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, bw, bh);
  bg.filter = 'brightness(170%) contrast(150%)';
  try{ bg.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bw, bh); }catch(e){}
  bg.filter = 'none';
  g.save(); g.globalAlpha = Math.min(.6, amt * .5); g.globalCompositeOperation = 'lighter';
  g.filter = `blur(${Math.max(1, W * .0025 * amt)}px)`;
  try{ g.drawImage(b, 0, 0, W, H); }catch(e){}
  g.filter = 'none'; g.restore();
}
function speedLines({ g, W, H, t, ph }, amt){
  const k = Math.pow(1 - ph, 3) * amt;
  if(k < .02) return;
  const r = rnd2(tick(t) * 99991);
  const cx = W / 2, cy = H / 2, R = Math.hypot(W, H);
  g.save(); g.globalAlpha = Math.min(.8, k); g.strokeStyle = '#fff';
  for(let i = 0; i < 60; i++){
    const a = r() * Math.PI * 2, inn = R * (.3 + r() * .16);
    g.lineWidth = W * .001 * (.5 + r() * 3);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }
  g.restore();
}
function invertPass({ g, W, H, ph }, amt){
  if(Math.pow(1 - ph, 10) * amt < .35) return;
  g.save(); g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.restore();
}
function vhsRoll({ g, W, H, q, t }, amt){
  const cv = g.canvas;
  const y = ((t * 40 * amt) % (H + 200)) - 100, h = H * .09;
  try{ g.drawImage(cv, 0, y * q, cv.width, h * q, W * .02 * amt, y, W, h); }catch(e){}
  g.save(); g.globalAlpha = .22 * amt; g.fillStyle = '#fff'; g.fillRect(0, y, W, h * .3); g.restore();
}
function strobe({ g, W, H, t }, amt){
  if(tick(t) % 2) return;
  g.save(); g.globalAlpha = Math.min(.85, amt * .7); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.restore();
}
function filmBurn({ g, W, H, t }, amt){
  const r = rnd2(tick(t) * 7717);
  if(r() > .1 + amt * .12) return;
  const cx = W * r(), cy = H * r();
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * (.2 + r() * .4));
  gr.addColorStop(0, `rgba(255,190,90,${.75 * amt})`);
  gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}
function filmScratch({ g, W, H, t }, amt){
  const r = rnd2(tick(t) * 20011);
  g.save(); g.globalAlpha = .35 * amt; g.strokeStyle = '#fff';
  const n = 1 + Math.floor(r() * 3 * amt);
  for(let i = 0; i < n; i++){
    const x = r() * W;
    g.lineWidth = Math.max(1, W * .0008 * (.5 + r()));
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - .5) * 12, H); g.stroke();
  }
  g.restore();
}
function noiseSnow({ g, W, H }, amt){
  if(!grainTile) grainTile = makeGrain();
  g.save(); g.globalAlpha = Math.min(.8, amt * .55);
  const pat = g.createPattern(grainTile, 'repeat');
  g.translate((Math.random() * 60) | 0, (Math.random() * 60) | 0);
  g.fillStyle = pat; g.fillRect(-60, -60, W + 120, H + 120);
  g.restore();
}
function colorBar({ g, W, H, t }, amt){
  if(rnd2(tick(t) * 33377)() > .06 + amt * .08) return;
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  g.save(); g.globalAlpha = Math.min(.9, amt);
  const bw = W / cols.length;
  cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw, 0, bw + 1, H); });
  g.restore();
}
function sparkle({ g, W, H, t }, amt){
  const r = rnd2(Math.floor(t * 12) * 60013);
  const n = Math.floor(2 + r() * 5 * amt);
  g.save(); g.globalCompositeOperation = 'lighter';
  for(let i = 0; i < n; i++){
    const x = r() * W, y = r() * H, L = W * .012 * (.6 + r() * 2.4);
    g.globalAlpha = (.4 + r() * .6) * amt;
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, W * .0016);
    g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke();
  }
  g.restore();
}
function flare({ g, W, H, ph }, amt){
  const a = Math.pow(1 - ph, 3) * amt;
  if(a < .03) return;
  const y = H * .42;
  const gr = g.createLinearGradient(0, y, W, y);
  gr.addColorStop(0, 'rgba(120,190,255,0)');
  gr.addColorStop(.5, `rgba(150,210,255,${Math.min(.8, a)})`);
  gr.addColorStop(1, 'rgba(120,190,255,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, y - H * .02, W, H * .04); g.restore();
}
function mosaicPass({ g, W, H }, amt){
  const cv = g.canvas;
  const n = Math.max(8, Math.round(120 - amt * 100));
  const bw = n, bh = Math.max(4, Math.round(n * H / W));
  const b = sheet('mosaic', bw, bh), bg = b.getContext('2d');
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.imageSmoothingEnabled = true;
  try{ bg.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bw, bh); }catch(e){ return; }
  g.save(); g.imageSmoothingEnabled = false; g.globalAlpha = Math.min(1, amt * 1.2);
  try{ g.drawImage(b, 0, 0, bw, bh, 0, 0, W, H); }catch(e){}
  g.restore(); g.imageSmoothingEnabled = true;
}
function shutterPass({ g, W, H, ph }, amt){
  const k = Math.pow(1 - ph, 5) * amt;
  if(k < .04) return;
  const h = H * .5 * k;
  g.save(); g.globalAlpha = Math.min(1, k * 1.6); g.fillStyle = '#000';
  g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h); g.restore();
}
function vignetteColor({ g, W, H }, amt, col){
  const r = Math.hypot(W, H) / 2;
  const gr = g.createRadialGradient(W / 2, H / 2, r * .3, W / 2, H / 2, r);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, col);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = amt;
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}
