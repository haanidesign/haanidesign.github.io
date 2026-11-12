import { makeGL } from './gl.js?v=1';
import { enhanceAll } from '../../oekaki-kobo/js/rslider.js';

const $ = s => document.querySelector(s);
const MAXPX = 1600;

/* ---------- 状態（もどす・しまう の 対象） ---------- */
const DEF = () => ({
  tab: 'blur', view: 0,
  blur: { on: true, focus: 63, range: 3, f: 45, front: true },
  fog: { on: false, col: '#e6ebf0', dens: 55, start: 25, low: 40, glow: 30 },
  tone: { on: false, mode: 0, split: 50, soft: 8, amt: 100, pop: 20, col: '#6f8fd8' },
  light: { on: false, list: [], sel: 0, auto: false, amb: 43, bump: 30, shadow: true },
  cut: { on: false, near: 100, far: 45, soft: 3, bg: 0, col: '#ffffff' },
  tri: { amp: 70, auto: true },
});
let S = DEF();

const PRE = [
  ['電球色', '#ffb46b'], ['白', '#ffffff'], ['夕日', '#ff7a3a'], ['月光', '#8fb4ff'], ['桜色', '#ff9ccf'], ['若葉', '#a6ec6e'],
];
const TABS = [
  ['blur', '🌀', 'ぼかし'], ['fog', '💨', '霧'], ['tone', '🎨', '色調'],
  ['light', '☀', 'ライト'], ['cut', '✂', '切り抜き'], ['tri', '🧊', '立体'],
];
const HINT = {
  blur: '写真を タップすると、その 距離に ピントが 合う',
  fog: '奥ほど 霧が こくなる',
  tone: '写真を タップすると、そこより 手前を 残す',
  light: '写真を タップで ライトを 置く。丸い 印は ドラッグで 動かせる',
  cut: '写真を タップすると、そこを 残す ように 合わせる',
  tri: '保存すると 4秒の 動画に なる',
};

/* ---------- 絵 ---------- */
const cv = $('#cv');
let G = null;
try { G = makeGL(cv); } catch (e) { toast('この ブラウザでは 動きません（WebGL2）'); console.error(e); }
let img = null;          // 元の 絵（canvas）
let depC = null;         // 深度（canvas）
let depPx = null;        // 深度の 中身（タップ用）
let depSrc = '';         // 'ai' | 'file' | 'kari'
let hold = false, off = [0, 0], recT = -1, aiBusy = false, aiErr = '';

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200);
}

function fitCanvas(src) {
  const k = Math.min(1, MAXPX / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
const loadImg = blob => new Promise((ok, ng) => {
  const u = URL.createObjectURL(blob), i = new Image();
  i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); ng(new Error('読めない 画像')); };
  i.src = u;
});

function kariDepth(w, h) {          // 深度が まだ ない ときの 仮: 下ほど 手前
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#222'); gr.addColorStop(1, '#ddd'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return c;
}

/* 深度を 0〜255 に のばして、灰色に そろえる */
function setDepth(c, src, invert) {
  const o = document.createElement('canvas'); o.width = img.width; o.height = img.height;
  const g = o.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, o.width, o.height);
  const d = g.getImageData(0, 0, o.width, o.height), p = d.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < p.length; i += 4) { const v = (p[i] * 3 + p[i + 1] * 6 + p[i + 2]) / 10; p[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = hi > lo ? 255 / (hi - lo) : 1;
  depPx = new Uint8Array(o.width * o.height);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    let v = (p[i] - lo) * k; if (invert) v = 255 - v;
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; depPx[j] = v;
  }
  g.putImageData(d, 0, 0);
  depC = o; depSrc = src;
  G && G.setDepth(o);
  status(); req();
}
function depthAt(x, y) {
  if (!depPx || !img) return 0.5;
  const X = Math.min(img.width - 1, Math.max(0, Math.round(x * img.width)));
  const Y = Math.min(img.height - 1, Math.max(0, Math.round(y * img.height)));
  return depPx[Y * img.width + X] / 255;
}

async function openPhoto(blob, keepDepth) {
  try {
    const i = await loadImg(blob);
    img = fitCanvas(i);
    G && G.setImage(img);
    $('#drop').hidden = true; $('#stage').hidden = false;
    if (keepDepth) setDepth(keepDepth, 'file');
    else setDepth(kariDepth(img.width, img.height), 'kari');
    window.Oboeru && Oboeru.cut();
    if (!keepDepth) { save(); runAI(); }
  } catch (e) { toast('画像を 読めなかった'); console.error(e); }
}

async function runAI() {
  if (!img || aiBusy) return;
  aiBusy = true; status();
  aiErr = '';
  const bar = $('#prog'); bar.hidden = false; bar.firstElementChild.style.width = '0%';
  const ov = (t, r) => { $('#busyT').textContent = t; if (r != null) $('#busyBar').style.width = (r * 100).toFixed(0) + '%'; };
  ov('AI が 奥行きを 読みとる 準備中…', 0);
  try {
    const { estimate } = await import('./ai.js?v=2');
    const out = await estimate(img, (r, total) => {
      bar.firstElementChild.style.width = (r * 100).toFixed(0) + '%';
      $('#stat').textContent = `AIモデルを 読みこみ中 ${(r * total / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)}MB`;
      ov(r < 1 ? `AI を 読みこみ中（はじめの 1回だけ）${(r * 100).toFixed(0)}%` : 'AI が 奥行きを 読みとって います…', r);
    });
    $('#stat').textContent = '深度を 推定中…';
    setDepth(out, 'ai'); save();
    toast('深度を 出した');
  } catch (e) {
    console.error(e); aiErr = String(e && e.message || e).slice(0, 120);
    toast('AI が 使えなかった');
  }
  aiBusy = false; bar.hidden = true; status();
}

function status() {
  const t = aiBusy ? 'AI で 深度を 出して います…'
    : depSrc === 'ai' ? 'AI が 推定した 深度を 使って います。うまく 分かれない ところは 境目や ピント幅で 合わせて ください。'
    : depSrc === 'file' ? '読みこんだ 深度マップを 使って います（白が 手前）。'
    : img ? '仮の 深度（下ほど 手前）です。「AIで 深度を 推定」を 押して ください。'
    : '写真を えらぶと、AI が 奥行きを 読みとります。';
  if (!aiBusy || !$('#stat').textContent.includes('MB')) $('#stat').textContent = t;
  $('#lamp').className = 'lamp ' + (aiBusy ? 'busy' : depSrc === 'ai' || depSrc === 'file' ? 'ok' : '');
  $('#bAI').disabled = !img || aiBusy;
  /* 写真の 上の 案内: 読みとり中・まだ・失敗 */
  const need = img && (aiBusy || depSrc === 'kari');
  $('#busy').hidden = !need;
  if (need && !aiBusy) {
    $('#busyT').textContent = aiErr ? 'AI を 読みこめませんでした。通信を たしかめて、もう一度 おして ください。' : 'まだ 奥行きを 読みとって いません';
    $('#busyE').textContent = aiErr; $('#busyBar').style.width = '0%';
  }
  $('#busyGo').hidden = aiBusy; $('#busyBox').hidden = !aiBusy; if (aiBusy) $('#busyE').textContent = '';
  for (const id of ['#bDepIn', '#bInv', '#bDepOut', '#bSave']) $(id).disabled = !img;
}

/* ---------- 描く ---------- */
function params(o = {}) {
  const [W, H] = G.size(), L = Math.max(W, H);
  const b = S.blur, f = S.fog, t = S.tone, l = S.light, c = S.cut;
  const fv = b.f / 100;
  return {
    mode: o.mode ?? (hold ? 2 : S.view),
    chk: o.chk ?? (c.on && c.bg === 0 ? 1 : 0),
    off: o.off ?? off, pivot: b.on ? b.focus / 100 : 0.5,
    blur: { on: b.on, front: b.front, focus: b.focus / 100, range: b.range / 100, max: L * 0.032 * Math.pow(fv, 1.3) },
    fog: { on: f.on, col: f.col, dens: f.dens / 100, start: f.start / 100, low: f.low / 100, glow: f.glow / 100 },
    tone: { on: t.on, mode: t.mode, split: t.split / 100, soft: Math.max(0.005, t.soft / 100), amt: t.amt / 100, pop: t.pop / 100, col: t.col },
    light: {
      on: l.on, shadow: l.shadow, amb: l.amb / 100 * 0.85, bump: l.bump / 100,
      list: l.list.map(q => ({ x: q.x, y: q.y, z: q.z / 100, col: q.col, i: q.i / 100, r: 0.04 + Math.pow(q.r / 100, 1.5) * 1.2 })),
    },
    cut: { on: c.on, bg: c.bg, near: c.near / 100, far: c.far / 100, soft: Math.max(0.004, c.soft / 100), col: c.col },
  };
}
let pend = false;
function req() { if (!pend) { pend = true; requestAnimationFrame(frame); } }
function frame(now) {
  pend = false;
  if (!G || !img) return;
  const live = S.tab === 'tri' && (S.tri.auto || recT >= 0);
  if (S.tab !== 'tri') off = [0, 0];
  else if (live) {
    const a = S.tri.amp / 100 * 0.035, t = (recT >= 0 ? now - recT : now) / 1000 * Math.PI * 2 / 4;
    off = [Math.sin(t) * a, Math.cos(t) * a * 0.5];
  }
  G.draw(params());
  marks();
  if (live) req();
}

/* ---------- ライトの 印 ---------- */
function marks() {
  const box = $('#marks');
  const show = S.tab === 'light' && S.light.on && S.view === 0 && !hold;
  const L = show ? S.light.list : [];
  while (box.children.length > L.length) box.lastChild.remove();
  while (box.children.length < L.length) {
    const m = document.createElement('div'); m.className = 'mk'; box.appendChild(m);
    m.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const k = [...box.children].indexOf(m);
      S.light.sel = k; sheet();
      m.setPointerCapture(e.pointerId);
      const mv = ev => { placeLight(...rel(ev), k); };
      const up = () => { m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); m.removeEventListener('pointercancel', up); sheet(); };
      m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    });
  }
  L.forEach((q, k) => {
    const m = box.children[k];
    m.style.left = q.x * 100 + '%'; m.style.top = q.y * 100 + '%';
    m.style.setProperty('--c', q.col);
    m.classList.toggle('on', k === S.light.sel);
  });
}
function rel(e) {
  const r = cv.getBoundingClientRect();
  return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
}
function newLight(x, y) {
  const p = PRE[2];
  return { x, y, z: Math.min(100, Math.round(depthAt(x, y) * 100) + 8), pre: 2, col: p[1], i: 130, r: 60 };
}
function placeLight(x, y, k) {
  const l = S.light.list[k]; if (!l) return;
  l.x = x; l.y = y;
  if (S.light.auto) l.z = Math.min(100, Math.round(depthAt(x, y) * 100) + 8);
  req();
}

/* 写真を タップ */
let tap = null;
$('#cvbox').addEventListener('pointerdown', e => { if (e.isPrimary) tap = { x: e.clientX, y: e.clientY, t: performance.now() }; });
$('#cvbox').addEventListener('pointermove', e => {
  if (S.tab === 'tri' && !S.tri.auto && img) {
    const [x, y] = rel(e), a = S.tri.amp / 100 * 0.035;
    off = [(x - 0.5) * 2 * a, -(y - 0.5) * a]; req();
  }
});
$('#cvbox').addEventListener('pointerup', e => {
  if (!tap || !img) return;
  const far = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10; tap = null;
  if (far || e.target.closest('.mk')) return;
  const [x, y] = rel(e), d = Math.round(depthAt(x, y) * 100);
  if (S.tab === 'blur') { S.blur.on = true; S.blur.focus = d; }
  else if (S.tab === 'tone') { S.tone.on = true; S.tone.split = Math.max(0, d - 12); }
  else if (S.tab === 'cut') { S.cut.on = true; S.cut.far = Math.max(0, d - 15); S.cut.near = 100; }
  else if (S.tab === 'light') {
    S.light.on = true;
    if (!S.light.list.length) { S.light.list.push(newLight(x, y)); S.light.sel = 0; }
    else placeLight(x, y, S.light.sel);
  } else return;
  sheet(); req();
});

/* ---------- 設定シート ---------- */
const sh = $('#sheet');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function head(txt, obj) {
  const r = el('label', 'hd');
  r.append(el('span', '', txt));
  if (obj) {
    const c = el('input'); c.type = 'checkbox'; c.checked = obj.on;
    c.onchange = () => { obj.on = c.checked; tabs(); req(); };
    r.append(c);
  }
  sh.append(r);
}
function note(t) { sh.append(el('p', 'empty', t)); }
function sub(t) { sh.append(el('h3', 'sub', t)); }
function rng(label, obj, key, min, max, fmt, ends) {
  const w = el('div', 'rg');
  const top = el('div', 'rgt'); const out = el('output');
  top.append(el('span', '', label), out); w.append(top);
  const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = 1; i.value = obj[key];
  const show = () => { out.textContent = fmt ? fmt(+i.value) : i.value; };
  i.addEventListener('input', () => { obj[key] = +i.value; show(); req(); });
  show(); w.append(i);
  if (ends) { const e = el('div', 'ends'); ends.forEach(x => e.append(el('span', '', x))); w.append(e); }
  sh.append(w);
  return i;
}
function chk(label, obj, key, after) {
  const r = el('label', 'ck'); const c = el('input'); c.type = 'checkbox'; c.checked = !!obj[key];
  c.onchange = () => { obj[key] = c.checked; after && after(); req(); };
  r.append(c, el('span', '', label)); sh.append(r);
}
function chips(list, cur, pick, cls = '') {
  const r = el('div', 'chips ' + cls);
  list.forEach(([name, col], k) => {
    const b = el('button', 'chip' + (k === cur ? ' on' : ''));
    b.type = 'button';
    if (col) { const d = el('i', 'dot'); d.style.background = col; b.append(d); }
    b.append(document.createTextNode(name));
    b.onclick = () => { pick(k); sheet(); req(); };
    r.append(b);
  });
  sh.append(r); return r;
}
function color(label, obj, key) {
  const r = el('label', 'cl'); const c = el('input'); c.type = 'color'; c.value = obj[key];
  c.oninput = () => { obj[key] = c.value; req(); };
  c.onchange = () => sheet();
  r.append(el('span', '', label), c); sh.append(r);
}
function act(txt, fn, dark) {
  const b = el('button', 'btn wide' + (dark ? ' btn-g' : ''), txt); b.type = 'button'; b.onclick = fn; sh.append(b); return b;
}

const fnum = v => 'f/' + (16 * Math.pow(1.4 / 16, v / 100)).toFixed(1).replace(/\.0$/, '');
const pct = v => v + '%';
const oku = v => '奥行き ' + v;

function sheet() {
  sh.textContent = '';
  const t = S.tab;
  if (t === 'blur') {
    const b = S.blur;
    head('背景ぼかし（ポートレート風）', b);
    rng('ピント位置', b, 'focus', 0, 100, oku, ['← 奥', '手前 →']);
    rng('ピントの 合う 奥行き幅', b, 'range', 0, 40, v => '±' + v);
    rng('ぼけの 強さ（しぼり）', b, 'f', 0, 100, fnum, ['f/16', 'f/1.4']);
    chk('手前の ものも ぼかす（前ボケ）', b, 'front');
    note('スマホの ポートレートの ように、あとから ピントを 変えられる。');
  } else if (t === 'fog') {
    const f = S.fog;
    head('霧を かける', f);
    chips([['朝もや', '#e6ebf0'], ['夕もや', '#f4c9a8'], ['夜霧', '#2b3550'], ['桜霞', '#f6d3e2']],
      -1, k => { f.on = true; f.col = ['#e6ebf0', '#f4c9a8', '#2b3550', '#f6d3e2'][k]; });
    color('霧の 色', f, 'col');
    rng('こさ', f, 'dens', 0, 100, pct);
    rng('はれて いる 手前の 幅', f, 'start', 0, 90, pct);
    rng('下に たまる', f, 'low', 0, 100, pct);
    rng('光の にじみ', f, 'glow', 0, 100, pct);
    note('遠くの 景色に 遠近感や 朝もやの 空気を 足す。');
  } else if (t === 'tone') {
    const o = S.tone;
    head('奥だけ 色を 変える', o);
    chips([['モノクロ'], ['セピア'], ['色を のせる'], ['暗く する']], o.mode, k => { o.on = true; o.mode = k; });
    if (o.mode === 2) color('のせる 色', o, 'col');
    rng('境目の 奥行き', o, 'split', 0, 100, oku, ['← 奥', '手前 →']);
    rng('境目の ぼかし', o, 'soft', 0, 30, v => v);
    rng('かかり具合', o, 'amt', 0, 100, pct);
    rng('手前の 色を あざやかに', o, 'pop', 0, 100, pct);
    note('背景だけ モノクロに して 被写体を 目立たせる。');
  } else if (t === 'light') {
    const l = S.light;
    head('ライトで 照らす', l);
    note('写真の 中に 光源を 置き、奥行きと 面の 向きに 合わせて 照らす。写真を タップで 配置、丸い 印を ドラッグで 移動。');
    const r = el('div', 'chips');
    l.list.forEach((q, k) => {
      const b = el('button', 'chip' + (k === l.sel ? ' on' : ''));
      b.type = 'button'; const d = el('i', 'dot'); d.style.background = q.col; b.append(d, document.createTextNode('ライト' + (k + 1)));
      b.onclick = () => { l.sel = k; sheet(); req(); }; r.append(b);
    });
    if (l.list.length < 4) {
      const a = el('button', 'chip add', '＋ 追加'); a.type = 'button';
      a.onclick = () => { l.on = true; l.list.push(newLight(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.3)); l.sel = l.list.length - 1; sheet(); tabs(); req(); };
      r.append(a);
    }
    if (l.list.length) {
      const x = el('button', 'chip', '✕ 消す'); x.type = 'button';
      x.onclick = () => { l.list.splice(l.sel, 1); l.sel = Math.max(0, l.sel - 1); sheet(); req(); }; r.append(x);
    }
    sh.append(r);
    const q = l.list[l.sel];
    if (q) {
      chips(PRE, q.pre ?? -1, k => { q.pre = k; q.col = PRE[k][1]; });
      const c = el('label', 'cl'); const ci = el('input'); ci.type = 'color'; ci.value = q.col;
      ci.oninput = () => { q.col = ci.value; q.pre = -1; req(); }; ci.onchange = () => sheet();
      c.append(el('span', '', '好きな 色を えらぶ'), ci); sh.append(c);
      rng('明るさ', q, 'i', 0, 300, pct);
      rng('光の 届く 範囲', q, 'r', 0, 100, pct, ['せまい', 'ひろい']);
      rng('ライトの 奥行き', q, 'z', 0, 100, oku, ['奥', '手前']);
    }
    chk('置いた 場所の 少し 手前に 自動で 合わせる', l, 'auto');
    sub('全体の 設定');
    rng('周りを 暗く する', l, 'amb', 0, 100, pct);
    rng('凹凸の 強さ', l, 'bump', 0, 100, pct);
    chk('物の 影を 落とす', l, 'shadow');
  } else if (t === 'cut') {
    const c = S.cut;
    head('距離で 切り抜く', c);
    rng('奥の 境目', c, 'far', 0, 100, oku, ['← 奥', '手前 →']);
    rng('手前の 境目', c, 'near', 0, 100, oku);
    rng('ふちの ぼかし', c, 'soft', 0, 20, v => v);
    sub('うしろ');
    chips([['透明'], ['色で ぬる']], c.bg, k => { c.bg = k; });
    if (c.bg === 1) color('うしろの 色', c, 'col');
    note('透明の まま PNG で 保存すると、別の 画像に 合成する 素材に できる。');
  } else if (t === 'tri') {
    const r = S.tri;
    note('深度を もとに 視点を 少し ずらして、写真を 立体的に 動かす。ほかの タブの 加工も そのまま 反映される。');
    rng('揺れの 大きさ', r, 'amp', 0, 100, pct);
    chk('自動で ゆらす（オフに すると 写真の 上で カーソルを 動かして 操作）', r, 'auto', () => { off = [0, 0]; });
    const b = act('🎬 動画で 保存（4秒）', record, true); b.id = 'bRec';
    if (!img || recT >= 0) b.disabled = true;
    note('録画中の 4秒間は そのまま お待ち ください。');
  }
  enhanceAll(sh);
  $('#hint').textContent = img ? HINT[t] : '';
}

function tabs() {
  document.querySelectorAll('#rail button').forEach(b => {
    const k = b.dataset.k, o = S[k];
    b.classList.toggle('on', k === S.tab);
    b.classList.toggle('dot', !!(o && o.on));
  });
  document.querySelectorAll('#views button').forEach((b, k) => b.classList.toggle('on', k === S.view));
}

/* ---------- はしら・ボタン ---------- */
const rail = $('#rail');
TABS.forEach(([k, ic, name]) => {
  const b = el('button', 'tool'); b.type = 'button'; b.dataset.k = k;
  b.innerHTML = `<i>${ic}</i><span>${name}</span>`;
  b.onclick = () => { S.tab = k; off = [0, 0]; tabs(); sheet(); req(); };
  rail.append(b);
});
document.querySelectorAll('#views button').forEach((b, k) => b.onclick = () => { S.view = k; tabs(); req(); });
const ho = $('#bHold');
ho.addEventListener('pointerdown', e => { e.preventDefault(); hold = true; req(); });
for (const t of ['pointerup', 'pointerleave', 'pointercancel']) ho.addEventListener(t, () => { if (hold) { hold = false; req(); } });

/* #file は 棚（tana.js）からも 入って くる。ふだんは 写真として 読む */
let want = null;
$('#file').onchange = () => {
  const f = $('#file'), x = f.files[0], fn = want || (b => openPhoto(b)); want = null; f.value = '';
  if (x) fn(x);
};
const pick = (accept, fn) => { want = fn; const f = $('#file'); f.accept = accept; f.click(); };
$('#bOpen').onclick = () => pick('image/*', b => openPhoto(b));
$('#drop').onclick = $('#bOpen').onclick;
$('#bAI').onclick = runAI;
$('#busyGo').onclick = e => { e.stopPropagation(); runAI(); };
$('#bDepIn').onclick = () => pick('image/*', async b => {
  try { setDepth(await loadImg(b), 'file'); save(); toast('深度マップを 読みこんだ'); } catch (_) { toast('読めなかった'); }
});
$('#bInv').onclick = () => { if (depC) { setDepth(depC, depSrc, true); save(); } };
$('#bDepOut').onclick = () => { if (depC) depC.toBlob(b => dl(b, 'shindo.png'), 'image/png'); };
$('#bSave').onclick = () => {
  if (!img) return;
  G.draw(params({ mode: 0, chk: 0, off: [0, 0] }));
  cv.toBlob(b => { dl(b, 'shindo-lens.png'); req(); }, 'image/png');
};
function dl(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ドロップ・貼りつけ */
const view = $('#view');
view.addEventListener('dragover', e => { e.preventDefault(); view.classList.add('over'); });
view.addEventListener('dragleave', () => view.classList.remove('over'));
view.addEventListener('drop', e => {
  e.preventDefault(); view.classList.remove('over');
  const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) openPhoto(f);
});
addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) openPhoto(f);
});

/* ---------- 動画 ---------- */
function record() {
  if (!img || recT >= 0) return;
  if (!window.MediaRecorder || !cv.captureStream) { toast('この ブラウザでは 動画に できない'); return; }
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const st = cv.captureStream(30);
  const mr = new MediaRecorder(st, mime ? { mimeType: mime, videoBitsPerSecond: 10e6 } : undefined);
  const parts = [];
  mr.ondataavailable = e => e.data.size && parts.push(e.data);
  mr.onstop = () => {
    recT = -1; st.getTracks().forEach(t => t.stop());
    const ty = mr.mimeType || mime || 'video/webm';
    dl(new Blob(parts, { type: ty }), 'shindo-lens.' + (ty.includes('mp4') ? 'mp4' : 'webm'));
    sheet(); req(); toast('動画を 保存した');
  };
  recT = performance.now(); mr.start(); sheet(); req(); toast('録画中…');
  setTimeout(() => mr.stop(), 4000);
}

/* ---------- しまう（IndexedDB に 写真と 深度） ---------- */
const DB = 'shindo-lens';
const idb = () => new Promise((ok, ng) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('k');
  r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
});
async function save() {
  if (!img || !depC) return;
  try {
    const [a, b] = await Promise.all([img, depC].map(c => new Promise(r => c.toBlob(r, c === img ? 'image/jpeg' : 'image/png', 0.95))));
    const db = await idb(); const tx = db.transaction('k', 'readwrite');
    tx.objectStore('k').put({ img: a, dep: b, src: depSrc }, 'last');
  } catch (e) { console.warn(e); }
}
async function restore() {
  try {
    const db = await idb();
    const v = await new Promise(r => { const q = db.transaction('k').objectStore('k').get('last'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
    if (!v) return;
    const i = await loadImg(v.img); img = fitCanvas(i); G && G.setImage(img);
    $('#drop').hidden = true; $('#stage').hidden = false;
    setDepth(await loadImg(v.dep), v.src || 'file');
  } catch (e) { console.warn(e); }
}

/* ---------- はじめ ---------- */
tabs(); sheet(); status();
restore().then(() => {
  if (window.Oboeru) Oboeru.start({
    key: 'shindo-lens',
    get: () => S,
    set: d => { const n = DEF(); for (const k in n) S[k] = typeof n[k] === 'object' ? Object.assign(n[k], d[k]) : (d[k] ?? n[k]); tabs(); sheet(); req(); },
  });
  sheet(); req();
});
