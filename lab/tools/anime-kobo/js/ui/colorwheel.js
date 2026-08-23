/* カラーサークル。

   まわりの わっか＝色あい（赤→黄→緑→青→紫）
   まん中の 四角＝こさ（よこ）と 明るさ（たて）

   ブラウザの 色えらびは 端末ごとに 見た目が ちがって、
   スマホだと 小さくて えらびにくい。ここで 自前で 出す。 */

const TAU = Math.PI * 2;

/* ---------- 色の 変換 ---------- */
export function hsv2rgb(h, s, v){
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if(h < 60)       { r = c; g = x; }
  else if(h < 120) { r = x; g = c; }
  else if(h < 180) { g = c; b = x; }
  else if(h < 240) { g = x; b = c; }
  else if(h < 300) { r = x; b = c; }
  else             { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgb2hsv(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if(d){
    if(mx === r)      h = 60 * (((g - b) / d) % 6);
    else if(mx === g) h = 60 * ((b - r) / d + 2);
    else              h = 60 * ((r - g) / d + 4);
  }
  return [((h % 360) + 360) % 360, mx ? d / mx : 0, mx];
}

export const hex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0')).join('').toUpperCase();

export function parseHex(s){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
  if(!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- 絵をかく ---------- */
const SIZE = 240;
const R_OUT = SIZE / 2 - 6;
const R_IN = R_OUT * 0.76;
const SQ = R_IN * 1.414;          // わっかの内がわに ぴったり入る 四角

function drawRing(g){
  const c = SIZE / 2;
  // こまかい あつまりで にじの わっかを 作る
  for(let i = 0; i < 360; i++){
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R_OUT, (i - 0.7) * Math.PI / 180, (i + 0.7) * Math.PI / 180);
    g.closePath();
    const [r, gg, b] = hsv2rgb(i, 1, 1);
    g.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
    g.fill();
  }
  // まん中を くりぬく
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(c, c, R_IN, 0, TAU); g.fill();
  g.restore();
}

function drawSquare(g, h){
  const c = SIZE / 2, x0 = c - SQ / 2, y0 = c - SQ / 2;
  const [r, gg, b] = hsv2rgb(h, 1, 1);
  g.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
  g.fillRect(x0, y0, SQ, SQ);
  // よこ … 白へ
  let lin = g.createLinearGradient(x0, 0, x0 + SQ, 0);
  lin.addColorStop(0, 'rgba(255,255,255,1)');
  lin.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lin; g.fillRect(x0, y0, SQ, SQ);
  // たて … 黒へ
  lin = g.createLinearGradient(0, y0, 0, y0 + SQ);
  lin.addColorStop(0, 'rgba(0,0,0,0)');
  lin.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = lin; g.fillRect(x0, y0, SQ, SQ);
  // わく
  g.strokeStyle = '#1E1C14'; g.lineWidth = 2;
  g.strokeRect(x0 + 1, y0 + 1, SQ - 2, SQ - 2);
}

function drawMarks(g, h, s, v){
  const c = SIZE / 2;
  // 色あいの しるし（ひし形）
  const a = h * Math.PI / 180;
  const rr = (R_OUT + R_IN) / 2;
  const mx = c + Math.cos(a) * rr, my = c + Math.sin(a) * rr;
  g.save();
  g.translate(mx, my); g.rotate(Math.PI / 4);
  g.fillStyle = '#FFFEF7'; g.strokeStyle = '#1E1C14'; g.lineWidth = 2.5;
  g.fillRect(-8, -8, 16, 16); g.strokeRect(-8, -8, 16, 16);
  g.restore();

  // こさ・明るさの しるし（まる）
  const x0 = c - SQ / 2, y0 = c - SQ / 2;
  const px = x0 + s * SQ, py = y0 + (1 - v) * SQ;
  g.beginPath(); g.arc(px, py, 9, 0, TAU);
  g.lineWidth = 3.5; g.strokeStyle = '#FFFEF7'; g.stroke();
  g.lineWidth = 2;   g.strokeStyle = '#1E1C14'; g.stroke();
}

/**
 * 色をえらぶ わっかを 作る。
 *   value  … いまの色（#RRGGBB）
 *   onPick(hex, done)  … 動かすたびに よばれる。done は 指を はなしたとき
 */
export function createWheel(value, onPick){
  const wrap = document.createElement('div');
  wrap.className = 'wheel';

  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  cv.className = 'wheelcv';
  /* 見た目の大きさは ここで きめる。
     まわりの わくの 都合で つぶれないように 直に 指定する。 */
  const side = Math.max(180, Math.min(SIZE, Math.round(window.innerWidth * 0.62)));
  cv.style.width = side + 'px';
  cv.style.height = side + 'px';
  cv.style.flex = '0 0 auto';
  wrap.appendChild(cv);
  const g = cv.getContext('2d');

  let [r0, g0, b0] = parseHex(value);
  let [h, s, v] = rgb2hsv(r0, g0, b0);

  const ring = document.createElement('canvas');
  ring.width = SIZE; ring.height = SIZE;
  drawRing(ring.getContext('2d'));

  const swatch = document.createElement('div');
  swatch.className = 'wheelnow';
  const label = document.createElement('span');
  label.className = 'wheelhex dot';
  wrap.appendChild(swatch);
  wrap.appendChild(label);

  function nowHex(){
    const [r, gg, b] = hsv2rgb(h, s, v);
    return hex(r, gg, b);
  }

  function render(){
    g.clearRect(0, 0, SIZE, SIZE);
    drawSquare(g, h);
    g.drawImage(ring, 0, 0);
    drawMarks(g, h, s, v);
    const c = nowHex();
    swatch.style.background = c;
    label.textContent = c;
  }
  render();

  /* ---- さわった ところで きめる ---- */
  let mode = null;
  const at = (e) => {
    const b = cv.getBoundingClientRect();
    return {
      x: (e.clientX - b.left) * (SIZE / b.width),
      y: (e.clientY - b.top) * (SIZE / b.height)
    };
  };
  const apply = (p, done) => {
    const c = SIZE / 2;
    const dx = p.x - c, dy = p.y - c;
    const d = Math.hypot(dx, dy);
    if(mode === 'ring' || (mode === null && d > R_IN)){
      mode = 'ring';
      h = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    } else {
      mode = 'sq';
      const x0 = c - SQ / 2, y0 = c - SQ / 2;
      s = Math.max(0, Math.min(1, (p.x - x0) / SQ));
      v = Math.max(0, Math.min(1, 1 - (p.y - y0) / SQ));
    }
    render();
    onPick(nowHex(), !!done);
  };

  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    mode = null;
    apply(at(e), false);
  });
  cv.addEventListener('pointermove', (e) => {
    if(mode === null) return;
    if(e.buttons === 0 && e.pointerType === 'mouse') return;
    apply(at(e), false);
  });
  const end = (e) => { if(mode !== null){ apply(at(e), true); mode = null; } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', () => { mode = null; });

  return {
    el: wrap,
    set(c){
      const [r, gg, b] = parseHex(c);
      [h, s, v] = rgb2hsv(r, gg, b);
      render();
    }
  };
}


/* ---------- おきにいりの色 ----------
   端末に おぼえておく。ほかの さくひんでも 出てくる。 */
const FAV_KEY = 'anime-kobo-favs';
const FAV_MAX = 18;

export function favs(){
  try{
    const a = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(a) ? a.filter(c => /^#[0-9A-F]{6}$/i.test(c)) : [];
  }catch(_){ return []; }
}

function saveFavs(list){
  try{ localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, FAV_MAX))); }catch(_){}
}

export function addFav(c){
  const up = String(c).toUpperCase();
  const list = favs().filter(x => x !== up);
  list.unshift(up);
  saveFavs(list);
  return list;
}

export function delFav(c){
  const up = String(c).toUpperCase();
  const list = favs().filter(x => x !== up);
  saveFavs(list);
  return list;
}

export const hasFav = (c) => favs().includes(String(c).toUpperCase());
