/* haani-color.js — はぁにデザインの 色えらび（クリスタの カラーサークル ふう）
   ページの <input type="color"> を ぜんぶ 色ボタンに 置きかえる。押すと 色えらびが 開く。
   - 外の 輪で 色相、中で 彩度と 明るさ（四角 ⇔ 三角 を 右下の ボタンで 切りかえ）
   - HEX / RGB / HSV を 数字で 入れられる
   - お気に入り（＋で 登録、押すと その色、右クリック か 長押しで けす）と 最近 使った 色
   - もとの input は かくして のこし、value と input / change の できごとは そのまま
   - 触った だけでは 色は 変わらない。数 px 動かして はじめて 動く（タブレットで うっかり 変えない）
   お気に入り・四角/三角・最近の色 は localStorage に 残す（同じ サイトの ツールで 共通）。
   使い方: import { watchColors } from '../../haani-color.js'; watchColors(); */

const KEY = 'haani-color';
const TAU = Math.PI * 2;
const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

/* ---------- 色の 計算 ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export function hsvToRgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
}
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
const toHex = rgb => '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
function parseHex(t) {
  t = String(t).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.replace(/./g, c => c + c);
  if (!/^[0-9a-f]{6}$/i.test(t)) return null;
  return [0, 2, 4].map(i => parseInt(t.slice(i, i + 2), 16));
}

/* ---------- 残す もの ---------- */
function load() { try { return Object.assign({ fav: [], recent: [], shape: 'square' }, JSON.parse(localStorage.getItem(KEY))); } catch (_) { return { fav: [], recent: [], shape: 'square' }; } }
function store(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} }
let mem = load();

/* ---------- 見た目 ---------- */
const CSS = `
.hc-src{position:absolute!important;opacity:0!important;width:1px!important;height:1px!important;pointer-events:none!important}
.hc-btn{appearance:none;width:40px;height:32px;padding:3px;border:2px solid #1E1C14;border-radius:9px;background:#FFFEF7;cursor:pointer;flex:none;vertical-align:middle}
.hc-btn i{display:block;width:100%;height:100%;border-radius:5px;border:1.5px solid rgba(30,28,20,.35)}
.hc-btn:hover{background:#E1DD60}
.hc-pop{position:fixed;z-index:9999;width:292px;background:#FFFEF7;color:#1E1C14;border:2.5px solid #1E1C14;border-radius:12px;padding:10px;max-height:calc(100vh - 16px);overflow:auto;
  font:500 14px/1.4 'M PLUS Rounded 1c',system-ui,sans-serif;user-select:none;-webkit-user-select:none}
.hc-pop canvas{display:block;touch-action:none}
.hc-wheel{position:relative;width:268px;height:268px;margin:0 auto}
.hc-wheel canvas{position:absolute;inset:0}
.hc-row{display:flex;align-items:center;gap:6px;margin-top:8px}
.hc-now{display:flex;flex:none;border:2px solid #1E1C14;border-radius:8px;overflow:hidden;height:30px}
.hc-now span{width:30px}
.hc-now span+span{cursor:pointer}
.hc-pop input{font:inherit;min-width:0;width:100%;border:2px solid #1E1C14;border-radius:8px;background:#FFFEF7;padding:2px 6px;text-align:center;font-variant-numeric:tabular-nums}
.hc-pop input:focus{background:#F2F0BE;outline:none}
.hc-hex{flex:1}
.hc-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 6px;margin-top:6px}
.hc-nums label{display:flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:#4F4A3B}
.hc-tbtn{appearance:none;border:2px solid #1E1C14;background:#FFFEF7;border-radius:100px;padding:1px 9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.hc-tbtn:hover,.hc-tbtn.on{background:#E1DD60}
.hc-sw{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;min-height:22px}
.hc-sw button{width:22px;height:22px;border:2px solid #1E1C14;border-radius:6px;padding:0;cursor:pointer}
.hc-sw .add{background:#FFFEF7;font-weight:800;line-height:16px;font-size:15px}
.hc-sw .add:hover{background:#E1DD60}
.hc-h{font-size:12px;font-weight:800;margin-top:8px;display:flex;justify-content:space-between;color:#1E1C14}
.hc-h small{font-weight:500;color:#6E6857}
@media (max-width:520px){.hc-pop{left:8px!important;right:8px;width:auto;bottom:8px;top:auto!important}}
`;
function injectCss() {
  if (document.getElementById('hc-css')) return;
  const st = document.createElement('style'); st.id = 'hc-css'; st.textContent = CSS; document.head.append(st);
}

/* ---------- 色えらびの 窓（1つだけ 作って 使い回す） ---------- */
const SZ = 268, RO = 132, RI = 110; // 輪の 外と 内の 半径
let pop = null, cur = null; // cur = { inp, h, s, v, before }

function build() {
  injectCss();
  pop = document.createElement('div'); pop.className = 'hc-pop'; pop.hidden = true;
  pop.innerHTML = `
    <div class="hc-wheel"><canvas class="hc-ring"></canvas><canvas class="hc-in"></canvas><canvas class="hc-mark"></canvas></div>
    <div class="hc-row">
      <div class="hc-now" title="左: 今 / 右: 開く前（押すと もどす）"><span class="n"></span><span class="b"></span></div>
      <input class="hc-hex" maxlength="7" spellcheck="false" aria-label="カラーコード">
      <button class="hc-tbtn hc-shape" title="四角 ⇔ 三角">△</button>
    </div>
    <div class="hc-nums">
      <label>R<input data-k="r" inputmode="numeric"></label><label>G<input data-k="g" inputmode="numeric"></label><label>B<input data-k="b" inputmode="numeric"></label>
      <label>H<input data-k="h" inputmode="numeric"></label><label>S<input data-k="s" inputmode="numeric"></label><label>V<input data-k="v" inputmode="numeric"></label>
    </div>
    <div class="hc-h">お気に入り <small>右クリック・長押しで けす</small></div>
    <div class="hc-sw hc-fav"></div>
    <div class="hc-h">最近</div>
    <div class="hc-sw hc-rec"></div>`;
  document.body.append(pop);
  const dpr = Math.min(2, devicePixelRatio || 1);
  for (const cv of pop.querySelectorAll('canvas')) { cv.width = cv.height = SZ * dpr; cv.style.width = cv.style.height = SZ + 'px'; cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
  drawRing();

  // 輪と 中の 操作
  const mark = pop.querySelector('.hc-mark');
  let drag = null;
  mark.addEventListener('pointerdown', e => {
    const p = local(e), r = Math.hypot(p.x - SZ / 2, p.y - SZ / 2);
    const part = r >= RI - 6 && r <= RO + 6 ? 'ring' : inInner(p) ? 'in' : null;
    if (!part) return;
    e.preventDefault(); mark.setPointerCapture(e.pointerId);
    drag = { part, x0: e.clientX, y0: e.clientY, moved: false, a0: Math.atan2(p.y - SZ / 2, p.x - SZ / 2), h0: cur.h };
  });
  mark.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return; // ふれた だけ では 変えない
    drag.moved = true;
    const p = local(e);
    if (drag.part === 'ring') { // 輪は 回した 分だけ（置いた 場所へ とばない）
      const a = Math.atan2(p.y - SZ / 2, p.x - SZ / 2);
      cur.h = ((drag.h0 + (a - drag.a0) * 360 / TAU) % 360 + 360) % 360;
      drawInner();
    } else setFromInner(p);
    paint(true);
  });
  const up = () => { if (drag && drag.moved) commit(); drag = null; };
  mark.addEventListener('pointerup', up); mark.addEventListener('pointercancel', up);

  // 数字
  pop.querySelector('.hc-hex').addEventListener('change', e => {
    const rgb = parseHex(e.target.value); if (!rgb) { paint(); return; }
    [cur.h, cur.s, cur.v] = rgbToHsv(...rgb); drawInner(); paint(true); commit();
  });
  pop.querySelectorAll('.hc-nums input').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.k, n = parseFloat(el.value); if (isNaN(n)) { paint(); return; }
    if ('rgb'.includes(k)) {
      const rgb = hsvToRgb(cur.h, cur.s, cur.v); rgb['rgb'.indexOf(k)] = clamp(Math.round(n), 0, 255);
      [cur.h, cur.s, cur.v] = rgbToHsv(...rgb);
    } else if (k === 'h') cur.h = ((n % 360) + 360) % 360;
    else cur[k] = clamp(n / 100);
    drawInner(); paint(true); commit();
  }));
  pop.querySelector('.hc-shape').onclick = () => { mem.shape = mem.shape === 'square' ? 'triangle' : 'square'; store(mem); drawInner(); paint(); };
  pop.querySelector('.hc-now .b').onclick = () => { [cur.h, cur.s, cur.v] = cur.before; drawInner(); paint(true); commit(); };

  // とじる
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !(cur && cur.btn.contains(e.target))) close(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); });
  addEventListener('resize', () => { if (!pop.hidden) place(); });
}
function local(e) { const r = pop.querySelector('.hc-mark').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

/* 三角: 色相の 角が 右、白が 左上、黒が 左下 */
const TRI = (() => { const c = SZ / 2, r = RI - 8, pt = a => ({ x: c + r * Math.cos(a), y: c + r * Math.sin(a) }); return { H: pt(0), W: pt(-TAU / 3), K: pt(TAU / 3) }; })();
const SQ = (() => { const s = Math.floor((RI - 10) * Math.SQRT2); return { x: (SZ - s) / 2, y: (SZ - s) / 2, s }; })();
function bary(p) {
  const { H, W, K } = TRI, d = (W.y - K.y) * (H.x - K.x) + (K.x - W.x) * (H.y - K.y);
  const a = ((W.y - K.y) * (p.x - K.x) + (K.x - W.x) * (p.y - K.y)) / d;
  const b = ((K.y - H.y) * (p.x - K.x) + (H.x - K.x) * (p.y - K.y)) / d;
  return [a, b, 1 - a - b]; // 色, 白, 黒 の 重み
}
function inInner(p) {
  if (mem.shape === 'square') return p.x >= SQ.x - 6 && p.x <= SQ.x + SQ.s + 6 && p.y >= SQ.y - 6 && p.y <= SQ.y + SQ.s + 6;
  return bary(p).every(w => w > -.06);
}
function setFromInner(p) {
  if (mem.shape === 'square') { cur.s = clamp((p.x - SQ.x) / SQ.s); cur.v = clamp(1 - (p.y - SQ.y) / SQ.s); return; }
  let [a, b, c] = bary(p).map(w => Math.max(0, w)); const t = a + b + c; a /= t; b /= t;
  cur.v = clamp(a + b); cur.s = cur.v > 0 ? clamp(a / cur.v) : 0;
}
function innerPoint() {
  if (mem.shape === 'square') return { x: SQ.x + cur.s * SQ.s, y: SQ.y + (1 - cur.v) * SQ.s };
  const a = cur.s * cur.v, b = cur.v - a, c = 1 - cur.v, { H, W, K } = TRI;
  return { x: a * H.x + b * W.x + c * K.x, y: a * H.y + b * W.y + c * K.y };
}

function drawRing() {
  const c = pop.querySelector('.hc-ring').getContext('2d'), m = SZ / 2;
  const g = c.createConicGradient(0, m, m);
  for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
  c.beginPath(); c.arc(m, m, RO, 0, TAU); c.arc(m, m, RI, 0, TAU, true);
  c.fillStyle = g; c.fill('evenodd');
  c.lineWidth = 2; c.strokeStyle = '#1E1C14';
  c.beginPath(); c.arc(m, m, RO, 0, TAU); c.stroke(); c.beginPath(); c.arc(m, m, RI, 0, TAU); c.stroke();
}
function drawInner() {
  const cv = pop.querySelector('.hc-in'), c = cv.getContext('2d');
  c.clearRect(0, 0, SZ, SZ);
  const hue = `hsl(${cur.h},100%,50%)`;
  if (mem.shape === 'square') {
    const { x, y, s } = SQ;
    c.fillStyle = hue; c.fillRect(x, y, s, s);
    let g = c.createLinearGradient(x, 0, x + s, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x, y, s, s);
    g = c.createLinearGradient(0, y, 0, y + s); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(x, y, s, s);
    c.lineWidth = 2; c.strokeStyle = '#1E1C14'; c.strokeRect(x, y, s, s);
  } else {
    // 1点ずつ 塗る（重みで 色・白・黒を まぜる）
    const dpr = cv.width / SZ, n = cv.width, img = c.createImageData(n, n), d = img.data, hr = hsvToRgb(cur.h, 1, 1);
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const [a, b, k] = bary({ x: px / dpr, y: py / dpr });
      if (a < -.01 || b < -.01 || k < -.01) continue;
      const i = (py * n + px) * 4;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, a) * hr[ch] + Math.max(0, b) * 255;
      d[i + 3] = 255;
    }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.putImageData(img, 0, 0); c.restore();
    const { H, W, K } = TRI;
    c.lineWidth = 2; c.strokeStyle = '#1E1C14'; c.beginPath(); c.moveTo(H.x, H.y); c.lineTo(W.x, W.y); c.lineTo(K.x, K.y); c.closePath(); c.stroke();
  }
}
function drawMarks() {
  const c = pop.querySelector('.hc-mark').getContext('2d'), m = SZ / 2;
  c.clearRect(0, 0, SZ, SZ);
  // 輪の つまみ
  const a = cur.h / 360 * TAU, rm = (RO + RI) / 2;
  c.save(); c.translate(m + Math.cos(a) * rm, m + Math.sin(a) * rm); c.rotate(a);
  c.fillStyle = `hsl(${cur.h},100%,50%)`; c.strokeStyle = '#1E1C14'; c.lineWidth = 2.5;
  c.beginPath(); c.roundRect(-(RO - RI) / 2 - 2, -7, RO - RI + 4, 14, 4); c.fill(); c.stroke();
  c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(-(RO - RI) / 2 + .5, -4.5, RO - RI - 1, 9, 3); c.stroke();
  c.restore();
  // 中の 丸
  const p = innerPoint();
  c.lineWidth = 2.5; c.strokeStyle = '#1E1C14'; c.beginPath(); c.arc(p.x, p.y, 7, 0, TAU); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, 5, 0, TAU); c.stroke();
}

function hexNow() { return toHex(hsvToRgb(cur.h, cur.s, cur.v)); }
function paint(live) {
  drawMarks();
  const hex = hexNow(), rgb = hsvToRgb(cur.h, cur.s, cur.v), q = s => pop.querySelector(s);
  q('.hc-now .n').style.background = hex; q('.hc-now .b').style.background = toHex(hsvToRgb(...cur.before));
  if (document.activeElement !== q('.hc-hex')) q('.hc-hex').value = hex.toUpperCase();
  const vals = { r: rgb[0], g: rgb[1], b: rgb[2], h: Math.round(cur.h), s: Math.round(cur.s * 100), v: Math.round(cur.v * 100) };
  pop.querySelectorAll('.hc-nums input').forEach(el => { if (document.activeElement !== el) el.value = vals[el.dataset.k]; });
  q('.hc-shape').textContent = mem.shape === 'square' ? '△ 三角' : '□ 四角';
  if (live) send('input');
}
function send(type) {
  const hex = hexNow();
  if (desc.get.call(cur.inp) !== hex) { desc.set.call(cur.inp, hex); swatch(cur.inp); }
  cur.inp.dispatchEvent(new Event(type, { bubbles: true }));
}
function commit() {
  send('change');
  const hex = hexNow();
  mem.recent = [hex, ...mem.recent.filter(c => c !== hex)].slice(0, 12); store(mem); swatches();
}

function swatches() {
  const mk = (box, list, fav) => {
    box.innerHTML = '';
    for (const hex of list) {
      const b = document.createElement('button'); b.style.background = hex; b.title = hex.toUpperCase();
      b.onclick = () => { [cur.h, cur.s, cur.v] = rgbToHsv(...parseHex(hex)); drawInner(); paint(true); commit(); };
      if (fav) {
        const del = () => { mem.fav = mem.fav.filter(c => c !== hex); store(mem); swatches(); };
        b.oncontextmenu = e => { e.preventDefault(); del(); };
        let t; b.onpointerdown = () => { t = setTimeout(() => { t = 'done'; del(); }, 600); };
        b.onpointerup = b.onpointerleave = () => { if (t !== 'done') clearTimeout(t); };
      }
      box.append(b);
    }
    if (fav) {
      const add = document.createElement('button'); add.className = 'add'; add.textContent = '＋'; add.title = '今の 色を 登録';
      add.onclick = () => { const h = hexNow(); if (!mem.fav.includes(h)) { mem.fav.push(h); store(mem); swatches(); } };
      box.append(add);
    }
  };
  mk(pop.querySelector('.hc-fav'), mem.fav, true);
  mk(pop.querySelector('.hc-rec'), mem.recent, false);
}

function place() {
  const r = cur.btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  let x = r.left, y = r.bottom + 6;
  if (x + w > innerWidth - 8) x = innerWidth - 8 - w;
  if (y + h > innerHeight - 8) y = r.top - h - 6 >= 8 ? r.top - h - 6 : innerHeight - 8 - h;
  y = Math.max(8, Math.min(y, innerHeight - 8 - h));
  pop.style.left = Math.max(8, x) + 'px'; pop.style.top = y + 'px';
}
function open(inp, btn) {
  if (!pop) build();
  mem = load();
  const rgb = parseHex(desc.get.call(inp)) || [0, 0, 0], hsv = rgbToHsv(...rgb);
  cur = { inp, btn, h: hsv[0], s: hsv[1], v: hsv[2], before: hsv };
  pop.hidden = false; drawInner(); paint(); swatches(); place();
}
function close() { if (pop) pop.hidden = true; cur = null; }

/* ---------- 置きかえ ---------- */
function swatch(inp) { const b = inp._hcBtn; if (b) b.firstChild.style.background = desc.get.call(inp); }
function enhance(inp) {
  if (inp._hcBtn) return;
  injectCss();
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'hc-btn'; btn.innerHTML = '<i></i>';
  btn.title = inp.title || inp.getAttribute('aria-label') || '色を えらぶ';
  inp._hcBtn = btn; inp.after(btn); inp.classList.add('hc-src');
  Object.defineProperty(inp, 'value', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); swatch(this); }, configurable: true });
  btn.onclick = () => { if (cur && cur.inp === inp && !pop.hidden) close(); else open(inp, btn); };
  // もとの input を かくす／出す（style.display）に ボタンも あわせる
  const sync = () => { btn.style.display = inp.style.display === 'none' ? 'none' : ''; };
  new MutationObserver(sync).observe(inp, { attributes: true, attributeFilter: ['style'] }); sync();
  swatch(inp);
}
export function enhanceColors(root = document) { for (const inp of root.querySelectorAll('input[type=color]')) enhance(inp); }
export function watchColors() {
  enhanceColors();
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches('input[type=color]')) enhance(n); else enhanceColors(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
