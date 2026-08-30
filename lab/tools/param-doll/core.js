/* パラメータ人形 — 中身（データと絵）
   考えかたは Live2D と同じ。
     パーツ    … PSD のレイヤー1枚 = 動かせる 1枚の絵
     パラメータ … スライダー1本。-1〜1 のような 数の幅と、その中の「点」を持つ
     フォーム  … 「この点のとき、このパーツは こうなる」という ずれの記録
   絵を描くときは、パーツの もとの姿に、全パラメータの ずれを 足していく。 */

const D = {
  w: 720, h: 1280, fps: 24, frames: 72,
  bg: null,                 // 背景色。null なら すける
  parts: [],                // 奥から手前の順
  params: [],
  binds: {},                // binds[paramId][partId] = [ずれ, ずれ, …]（点の数だけ）
  tl: {}                    // tl[paramId] = [{f, v}, …]
};

let _seq = 1;
const uid = (p) => p + (_seq++).toString(36) + Date.now().toString(36).slice(-3);

/* ずれ の ゼロ。pd は ピンの ずらし かた（ピンの数だけ） */
const zero = (n) => ({ dx: 0, dy: 0, rot: 0, dsx: 0, dsy: 0, dop: 0,
                       pd: Array.from({ length: n || 0 }, () => ({ dx: 0, dy: 0 })) });

/* ---------- パーツ ---------- */

function addPart(name, img, w, h, x, y, opacity, group){
  const p = {
    id: uid('p'), name: name || 'パーツ', group: group || null,
    img, w, h,
    px: w / 2, py: h / 2,          // 基準点（回す・伸ばすときの 中心）
    x, y, rot: 0, sx: 1, sy: 1, op: opacity === undefined ? 1 : opacity,
    visible: true,
    pins: [],                       // ピン（絵の中の 座標）
    pd: [],                         // ピンの もとの ずらし かた
    grid: 8,                        // ゆがませる あみの こまかさ
    src: null                       // 保存用の dataURL（保存するときに 作る）
  };
  D.parts.push(p);
  return p;
}

const partById = (id) => D.parts.find(p => p.id === id);
const paramById = (id) => D.params.find(p => p.id === id);

function removePart(id){
  const i = D.parts.findIndex(p => p.id === id);
  if(i < 0) return;
  D.parts.splice(i, 1);
  for(const pid in D.binds) delete D.binds[pid][id];
}

/** 重なり順を 1つ ずらす。dir>0 で 手前へ */
function movePart(id, dir){
  const i = D.parts.findIndex(p => p.id === id);
  const j = i + (dir > 0 ? 1 : -1);
  if(i < 0 || j < 0 || j >= D.parts.length) return;
  const t = D.parts[i]; D.parts[i] = D.parts[j]; D.parts[j] = t;
}

/* ---------- パラメータ ---------- */

/**
 * パラメータを 1本 足す。
 * keys は 点の 位置（例 [-1,0,1]）。min/max は その 端。
 */
function addParam(name, min, max, def, keys){
  const pr = {
    id: uid('v'), name: name || 'パラメータ',
    min, max, def, val: def,
    keys: keys.slice().sort((a, b) => a - b),
    auto: { type: 'none', speed: 1, amp: 1 }   // none / wave / blink
  };
  D.params.push(pr);
  D.binds[pr.id] = {};
  return pr;
}

function removeParam(id){
  const i = D.params.findIndex(p => p.id === id);
  if(i < 0) return;
  D.params.splice(i, 1);
  delete D.binds[id];
  delete D.tl[id];
}

/** パーツを パラメータに 紐付ける（全部の点を ゼロで 用意する） */
function bindPart(paramId, partId){
  const pr = paramById(paramId); if(!pr) return;
  if(!D.binds[paramId]) D.binds[paramId] = {};
  if(D.binds[paramId][partId]) return;
  const part = partById(partId);
  D.binds[paramId][partId] = pr.keys.map(() => zero(part ? part.pins.length : 0));
}

function unbindPart(paramId, partId){
  if(D.binds[paramId]) delete D.binds[paramId][partId];
}

const isBound = (paramId, partId) => !!(D.binds[paramId] && D.binds[paramId][partId]);

/** 点を 増やしたり 減らしたりしたら、ずれの 数も 合わせる */
function setKeyCount(paramId, n){
  const pr = paramById(paramId); if(!pr) return;
  n = Math.max(2, Math.min(6, n | 0));
  const keys = [];
  for(let i = 0; i < n; i++) keys.push(pr.min + (pr.max - pr.min) * i / (n - 1));
  const old = pr.keys;
  pr.keys = keys;
  const b = D.binds[paramId] || {};
  for(const partId in b){
    const oldForms = b[partId];
    b[partId] = keys.map(k => cloneForm(sampleForms(old, oldForms, k)));
  }
}

const cloneForm = (f) => ({
  dx: f.dx, dy: f.dy, rot: f.rot, dsx: f.dsx, dsy: f.dsy, dop: f.dop,
  pd: (f.pd || []).map(d => ({ dx: d.dx, dy: d.dy }))
});

/** 点の 並び keys と ずれの 並び forms から、値 v の ずれを 作る */
function sampleForms(keys, forms, v){
  if(!keys.length) return zero(0);
  if(v <= keys[0]) return forms[0];
  if(v >= keys[keys.length - 1]) return forms[forms.length - 1];
  let i = 0;
  while(i < keys.length - 2 && v > keys[i + 1]) i++;
  const a = keys[i], b = keys[i + 1];
  const t = b === a ? 0 : (v - a) / (b - a);
  const fa = forms[i], fb = forms[i + 1];
  const na = fa.pd || [], nb = fb.pd || [];
  const pd = [];
  for(let k = 0; k < Math.max(na.length, nb.length); k++){
    const a2 = na[k] || { dx: 0, dy: 0 }, b2 = nb[k] || { dx: 0, dy: 0 };
    pd.push({ dx: a2.dx + (b2.dx - a2.dx) * t, dy: a2.dy + (b2.dy - a2.dy) * t });
  }
  return {
    dx:  fa.dx  + (fb.dx  - fa.dx)  * t,
    dy:  fa.dy  + (fb.dy  - fa.dy)  * t,
    rot: fa.rot + (fb.rot - fa.rot) * t,
    dsx: fa.dsx + (fb.dsx - fa.dsx) * t,
    dsy: fa.dsy + (fb.dsy - fa.dsy) * t,
    dop: fa.dop + (fb.dop - fa.dop) * t,
    pd
  };
}

/* ---------- ピン ---------- */

/** 絵の 中の (x,y) に ピンを 1本 さす。すべての フォームにも 席を つくる */
function addPin(part, x, y){
  part.pins.push({ x, y });
  part.pd.push({ dx: 0, dy: 0 });
  for(const pid in D.binds){
    const forms = D.binds[pid][part.id];
    if(!forms) continue;
    for(const f of forms){ if(!f.pd) f.pd = []; f.pd.push({ dx: 0, dy: 0 }); }
  }
  return part.pins.length - 1;
}

function removePin(part, i){
  if(i < 0 || i >= part.pins.length) return;
  part.pins.splice(i, 1);
  part.pd.splice(i, 1);
  for(const pid in D.binds){
    const forms = D.binds[pid][part.id];
    if(!forms) continue;
    for(const f of forms) if(f.pd) f.pd.splice(i, 1);
  }
}

function clearPins(part){
  part.pins.length = 0; part.pd.length = 0;
  for(const pid in D.binds){
    const forms = D.binds[pid][part.id];
    if(!forms) continue;
    for(const f of forms) f.pd = [];
  }
}

/** v に いちばん近い 点の 番号 */
function nearestKey(pr, v){
  let best = 0, bd = Infinity;
  pr.keys.forEach((k, i) => { const d = Math.abs(k - v); if(d < bd){ bd = d; best = i; } });
  return best;
}

/* ---------- 時間 ---------- */

/** そのコマでの パラメータの 値。タイムラインが 空なら スライダーの値＋自動の動き */
function paramValueAt(pr, frame, playing){
  const ks = D.tl[pr.id];
  if(ks && ks.length){
    if(ks.length === 1) return ks[0].v;
    if(frame <= ks[0].f) return ks[0].v;
    if(frame >= ks[ks.length - 1].f) return ks[ks.length - 1].v;
    let i = 0;
    while(i < ks.length - 2 && frame > ks[i + 1].f) i++;
    const a = ks[i], b = ks[i + 1];
    const t = b.f === a.f ? 0 : (frame - a.f) / (b.f - a.f);
    return a.v + (b.v - a.v) * t;
  }
  if(pr.auto.type !== 'none' && playing) return autoValue(pr, frame / D.fps);
  return pr.val;
}

/** 自動の動き。ゆれ＝サイン波、まばたき＝ときどき ぱちっ */
function autoValue(pr, t){
  const mid = (pr.min + pr.max) / 2, half = (pr.max - pr.min) / 2;
  if(pr.auto.type === 'wave'){
    return mid + half * pr.auto.amp * Math.sin(t * Math.PI * 2 * pr.auto.speed);
  }
  if(pr.auto.type === 'blink'){
    const cycle = Math.max(0.8, 4 / Math.max(.05, pr.auto.speed));
    const u = (t % cycle) / cycle;
    // 最後の 0.12 の あいだだけ 閉じる（開く→閉じる→開く）
    if(u < 1 - 0.12) return pr.max;
    const k = (u - (1 - 0.12)) / 0.12;          // 0→1
    const closed = 1 - Math.abs(k * 2 - 1);     // 0→1→0
    return pr.max + (pr.min - pr.max) * closed;
  }
  return pr.val;
}

/** タイムラインに キーを 置く／消す */
function setKeyframe(paramId, frame, v){
  const ks = D.tl[paramId] || (D.tl[paramId] = []);
  const hit = ks.find(k => k.f === frame);
  if(hit) hit.v = v; else ks.push({ f: frame, v });
  ks.sort((a, b) => a.f - b.f);
}
function delKeyframe(paramId, frame){
  const ks = D.tl[paramId]; if(!ks) return;
  const i = ks.findIndex(k => k.f === frame);
  if(i >= 0) ks.splice(i, 1);
  if(!ks.length) delete D.tl[paramId];
}

/* ---------- 姿を 計算する ---------- */

/**
 * そのコマでの パーツの 見た目。
 * override があれば その パラメータだけ 指定の値で 見る（フォーム編集中に使う）
 */
function poseOf(part, values){
  const o = { x: part.x, y: part.y, rot: part.rot, sx: part.sx, sy: part.sy, op: part.op };
  o.pd = part.pd.map(d => ({ dx: d.dx, dy: d.dy }));
  for(const pr of D.params){
    const b = D.binds[pr.id];
    if(!b || !b[part.id]) continue;
    const v = values[pr.id];
    if(!isFinite(v)) continue;              // 値が 来ていない ときは 何も 足さない
    const f = sampleForms(pr.keys, b[part.id], v);
    o.x += f.dx; o.y += f.dy; o.rot += f.rot;
    o.sx += f.dsx; o.sy += f.dsy; o.op += f.dop;
    const pd = f.pd || [];
    for(let i = 0; i < o.pd.length && i < pd.length; i++){
      o.pd[i].dx += pd[i].dx; o.pd[i].dy += pd[i].dy;
    }
  }
  o.op = Math.max(0, Math.min(1, o.op));
  return o;
}

/** そのコマの 全パラメータの 値をまとめて出す */
function valuesAt(frame, playing){
  const v = {};
  for(const pr of D.params) v[pr.id] = paramValueAt(pr, frame, playing);
  return v;
}

/* ---------- 描く ---------- */

/**
 * doc を キャンバスに 描く。
 * opt.values   … 値の 一覧（無ければ frame から 作る）
 * opt.noBg     … 背景を 塗らない（すける 書き出し用）
 */
function drawDoc(g, opt = {}){
  const values = opt.values || valuesAt(opt.frame || 0, !!opt.playing);
  if(!opt.noBg && D.bg){ g.fillStyle = D.bg; g.fillRect(0, 0, D.w, D.h); }
  for(const part of D.parts){
    if(!part.visible || !part.img) continue;
    const o = poseOf(part, values);
    if(o.op <= 0.002) continue;
    g.save();
    g.globalAlpha = o.op;
    g.translate(o.x, o.y);
    g.rotate(o.rot * Math.PI / 180);
    g.scale(o.sx, o.sy);
    g.translate(-part.px, -part.py);
    if(part.pins.length) drawWarped(g, part, o.pd);
    else g.drawImage(part.img, 0, 0, part.w, part.h);
    g.restore();
  }
}


/* ---------- ピンで ゆがませる ----------
   ピンを うごかすと、その まわりの あみ（三角形）が ついてくる。
   どれだけ ついてくるかは「ピンからの 遠さ」で きめる（近いほど よく ついてくる）。
   After Effects の パペットピンと 同じ かんがえかた。 */

/** あみの 点と、点ごとの「どのピンに どれだけ ついていくか」を 用意する（使いまわす） */
function meshOf(part){
  const n = Math.max(2, Math.min(16, part.grid || 8));
  const sig = n + '|' + part.pins.map(p => (p.x | 0) + ',' + (p.y | 0)).join(';');
  if(part._mesh && part._mesh.sig === sig) return part._mesh;

  const cols = n + 1, rows = n + 1;
  const vx = [], vy = [], wt = [];
  const eps = Math.pow(Math.max(part.w, part.h) * 0.06, 2);
  for(let j = 0; j < rows; j++){
    for(let i = 0; i < cols; i++){
      const x = part.w * i / n, y = part.h * j / n;
      vx.push(x); vy.push(y);
      const w = new Float32Array(part.pins.length);
      let sum = 0;
      for(let k = 0; k < part.pins.length; k++){
        const dx = x - part.pins[k].x, dy = y - part.pins[k].y;
        const v = 1 / (dx * dx + dy * dy + eps);
        w[k] = v; sum += v;
      }
      if(sum > 0) for(let k = 0; k < w.length; k++) w[k] /= sum;
      wt.push(w);
    }
  }
  part._mesh = { sig, n, cols, rows, vx, vy, wt };
  return part._mesh;
}

/** 三角形1枚ぶんの 絵を、行き先の 三角形に あわせて 貼る */
function _tri(g, img, iw, ih, sw, sh, s0, s1, s2, d0, d1, d2){
  const x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if(!det) return;
  const a = ((d1[0] - d0[0]) * (y2 - y0) - (d2[0] - d0[0]) * (y1 - y0)) / det;
  const b = ((d1[1] - d0[1]) * (y2 - y0) - (d2[1] - d0[1]) * (y1 - y0)) / det;
  const c = ((d2[0] - d0[0]) * (x1 - x0) - (d1[0] - d0[0]) * (x2 - x0)) / det;
  const d = ((d2[1] - d0[1]) * (x1 - x0) - (d1[1] - d0[1]) * (x2 - x0)) / det;
  const e = d0[0] - a * x0 - c * y0;
  const f = d0[1] - b * x0 - d * y0;

  // つなぎ目に すじが 出ないよう、行き先を ほんの少し ふくらませる
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const gr = Math.max(0.9, Math.hypot(d1[0] - d0[0], d1[1] - d0[1]) * 0.035);
  const ex = (p) => {
    const vx = p[0] - cx, vy = p[1] - cy, L = Math.hypot(vx, vy) || 1;
    return [p[0] + vx / L * gr, p[1] + vy / L * gr];
  };
  const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);

  g.save();
  g.beginPath();
  g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]); g.closePath();
  g.clip();
  g.transform(a, b, c, d, e, f);
  g.drawImage(img, 0, 0, iw, ih, 0, 0, sw, sh);
  g.restore();
}

/** pd … ピンごとの ずらし かた（絵の中の 座標で） */
function drawWarped(g, part, pd){
  const m = meshOf(part);
  const nPin = part.pins.length;
  const ox = new Float32Array(m.vx.length), oy = new Float32Array(m.vx.length);
  for(let v = 0; v < m.vx.length; v++){
    const w = m.wt[v];
    let ax = 0, ay = 0;
    for(let k = 0; k < nPin; k++){
      const d = pd[k]; if(!d) continue;
      ax += w[k] * d.dx; ay += w[k] * d.dy;
    }
    ox[v] = ax; oy[v] = ay;
  }
  const iw = part.img.width, ih = part.img.height;
  const at = (i, j) => {
    const v = j * m.cols + i;
    return [m.vx[v] + ox[v], m.vy[v] + oy[v]];
  };
  const src = (i, j) => [part.w * i / m.n, part.h * j / m.n];
  for(let j = 0; j < m.n; j++){
    for(let i = 0; i < m.n; i++){
      const s00 = src(i, j), s10 = src(i + 1, j), s01 = src(i, j + 1), s11 = src(i + 1, j + 1);
      const d00 = at(i, j), d10 = at(i + 1, j), d01 = at(i, j + 1), d11 = at(i + 1, j + 1);
      _tri(g, part.img, iw, ih, part.w, part.h, s00, s10, s11, d00, d10, d11);
      _tri(g, part.img, iw, ih, part.w, part.h, s00, s11, s01, d00, d11, d01);
    }
  }
}

/** 絵の中の (lx,ly) が、ピンの ずれで どこへ 行くか（ピンを 画面に 出すため） */
function warpPoint(part, pd, lx, ly){
  if(!part.pins.length) return { x: lx, y: ly };
  const eps = Math.pow(Math.max(part.w, part.h) * 0.06, 2);
  let sum = 0, ax = 0, ay = 0;
  for(let k = 0; k < part.pins.length; k++){
    const dx = lx - part.pins[k].x, dy = ly - part.pins[k].y;
    const w = 1 / (dx * dx + dy * dy + eps);
    const d = pd[k] || { dx: 0, dy: 0 };
    ax += w * d.dx; ay += w * d.dy; sum += w;
  }
  return sum > 0 ? { x: lx + ax / sum, y: ly + ay / sum } : { x: lx, y: ly };
}

/** 絵の中の 座標 → 紙の 座標 */
function localToWorld(part, o, lx, ly){
  const p = warpPoint(part, o.pd, lx, ly);
  const s = Math.sin(o.rot * Math.PI / 180), c = Math.cos(o.rot * Math.PI / 180);
  const x = (p.x - part.px) * o.sx, y = (p.y - part.py) * o.sy;
  return { x: o.x + x * c - y * s, y: o.y + x * s + y * c };
}

/** ゆがみを 逆に たどる。ゆがんだ 先が (tx,ty) になる もとの 点を さがす */
function unwarpPoint(part, pd, tx, ty){
  let x = tx, y = ty;
  for(let i = 0; i < 4; i++){
    const p = warpPoint(part, pd, x, y);
    x += tx - p.x; y += ty - p.y;
  }
  return { x, y };
}

/** 紙の 座標 → 絵の中の 座標（ゆがみは 見ない。だいたいで よい ところで 使う） */
function worldToLocal(part, o, wx, wy){
  const s = Math.sin(-o.rot * Math.PI / 180), c = Math.cos(-o.rot * Math.PI / 180);
  const dx = wx - o.x, dy = wy - o.y;
  return {
    x: (dx * c - dy * s) / (o.sx || .0001) + part.px,
    y: (dx * s + dy * c) / (o.sy || .0001) + part.py
  };
}

/** その座標に どのパーツが いるか（手前から 探す）。透明なところは 素通り */
const _hitCv = document.createElement('canvas');
const _hitG = _hitCv.getContext('2d', { willReadFrequently: true });
_hitCv.width = _hitCv.height = 1;

function hitTest(cx, cy, values){
  for(let i = D.parts.length - 1; i >= 0; i--){
    const part = D.parts[i];
    if(!part.visible || !part.img) continue;
    const o = poseOf(part, values);
    if(o.op <= 0.02) continue;
    // 画面の点を パーツの中の座標へ 戻す
    const s = Math.sin(-o.rot * Math.PI / 180), c = Math.cos(-o.rot * Math.PI / 180);
    let dx = cx - o.x, dy = cy - o.y;
    let lx = (dx * c - dy * s) / (o.sx || .0001) + part.px;
    let ly = (dx * s + dy * c) / (o.sy || .0001) + part.py;
    if(lx < 0 || ly < 0 || lx >= part.w || ly >= part.h) continue;
    _hitG.clearRect(0, 0, 1, 1);
    _hitG.drawImage(part.img, lx * (part.img.width / part.w), ly * (part.img.height / part.h),
                    1, 1, 0, 0, 1, 1);
    if(_hitG.getImageData(0, 0, 1, 1).data[3] > 24) return part;
  }
  return null;
}

/* ---------- 読み込み ---------- */

const MAX_SIDE = 1400;   // スマホの メモリを 守るための 上限

function loadImage(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('絵を開けませんでした'));
    im.src = src;
  });
}

/** 透明な まわりを 切り落とす */
function trimCanvas(cv){
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for(let y = 0; y < cv.height; y++){
    for(let x = 0; x < cv.width; x++){
      if(d[(y * cv.width + x) * 4 + 3] > 2){
        if(x < x0) x0 = x; if(x > x1) x1 = x;
        if(y < y0) y0 = y; if(y > y1) y1 = y;
      }
    }
  }
  if(x1 < 0) return null;
  if(x0 === 0 && y0 === 0 && x1 === cv.width - 1 && y1 === cv.height - 1) return { cv, x: 0, y: 0 };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c2 = document.createElement('canvas');
  c2.width = w; c2.height = h;
  c2.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  return { cv: c2, x: x0, y: y0 };
}

/** 大きすぎる絵は 小さくする。縮めた 倍率を 返す */
function shrinkCanvas(cv){
  const long = Math.max(cv.width, cv.height);
  if(long <= MAX_SIDE) return { cv, k: 1 };
  const k = MAX_SIDE / long;
  const c2 = document.createElement('canvas');
  c2.width = Math.max(1, Math.round(cv.width * k));
  c2.height = Math.max(1, Math.round(cv.height * k));
  const g = c2.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(cv, 0, 0, c2.width, c2.height);
  return { cv: c2, k };
}

/* ag-psd の children は 奥から手前の順（ミニSpineで実測済み） */
function flattenPsd(node, out, groupName){
  for(const ch of (node.children || [])){
    if(ch.hidden) continue;
    if(ch.children) flattenPsd(ch, out, ch.name || groupName);
    else if(ch.canvas) out.push({
      name: ch.name || 'レイヤー', canvas: ch.canvas,
      left: ch.left || 0, top: ch.top || 0,
      opacity: ch.opacity === undefined ? 1 : ch.opacity,
      group: groupName || null
    });
  }
}

/** PSD を 読み込んで、レイヤーを そのまま パーツにする */
async function importPsd(file, onNote){
  if(typeof agPsd === 'undefined') throw new Error('PSDの読み込み部品が見つかりません');
  let psd;
  try{
    const buf = await file.arrayBuffer();
    psd = agPsd.readPsd(buf, { skipCompositeImageData: true, skipThumbnail: true });
  }catch(err){
    const m = String(err && err.message || err);
    if(/memory|allocation/i.test(m))
      throw new Error('PSDが大きすぎて開けませんでした。レイヤーを減らして ためしてください');
    throw new Error('PSDを開けませんでした（' + m.slice(0, 60) + '）');
  }
  if(!psd || !psd.width) throw new Error('PSDとして 読めませんでした');

  const flat = [];
  flattenPsd(psd, flat, null);
  if(!flat.length) throw new Error('表示されている レイヤーが ありません');

  // 紙の大きさを PSD に あわせる
  D.w = psd.width; D.h = psd.height;

  for(const l of flat){
    const t = trimCanvas(l.canvas);
    if(!t) continue;
    const s = shrinkCanvas(t.cv);
    const img = await loadImage(s.cv.toDataURL('image/png'));
    const w = t.cv.width, h = t.cv.height;     // 見た目の 大きさは 縮める前のまま
    const p = addPart(l.name, img, w, h,
                      l.left + t.x + w / 2, l.top + t.y + h / 2,
                      Math.max(0, Math.min(1, l.opacity)), l.group);
    p.src = s.cv.toDataURL('image/png');
    if(onNote) onNote(p.name);
  }
  if(!D.parts.length) throw new Error('中身のある レイヤーが ありません');
}

/** PNG / JPEG を 1枚の パーツとして 足す */
async function importImage(file){
  const url = URL.createObjectURL(file);
  const im = await loadImage(url);
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  cv.getContext('2d').drawImage(im, 0, 0);
  URL.revokeObjectURL(url);
  const s = shrinkCanvas(cv);
  const img = await loadImage(s.cv.toDataURL('image/png'));
  if(!D.parts.length){ D.w = im.width; D.h = im.height; }
  const p = addPart(file.name.replace(/\.[^.]+$/, ''), img, im.width, im.height,
                    D.w / 2, D.h / 2, 1, null);
  p.src = s.cv.toDataURL('image/png');
  return p;
}

/* ---------- 保存と 読み出し ---------- */

function toJSON(){
  return JSON.stringify({
    v: 1, w: D.w, h: D.h, fps: D.fps, frames: D.frames, bg: D.bg,
    parts: D.parts.map(p => ({
      id: p.id, name: p.name, group: p.group, w: p.w, h: p.h,
      px: p.px, py: p.py, x: p.x, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy,
      op: p.op, visible: p.visible, src: p.src,
      pins: p.pins, pd: p.pd, grid: p.grid
    })),
    params: D.params, binds: D.binds, tl: D.tl
  });
}

async function fromJSON(text){
  const j = JSON.parse(text);
  D.w = j.w; D.h = j.h; D.fps = j.fps || 24; D.frames = j.frames || 72; D.bg = j.bg || null;
  D.params = j.params || []; D.binds = j.binds || {}; D.tl = j.tl || {};
  D.parts = [];
  for(const p of (j.parts || [])){
    if(!p.src) continue;
    const img = await loadImage(p.src);
    D.parts.push(Object.assign({ pins: [], pd: [], grid: 8 }, p, { img }));
  }
  for(const pr of D.params) if(!pr.auto) pr.auto = { type: 'none', speed: 1, amp: 1 };
}

/* ---------- よく使う パラメータの ひな型 ---------- */

const PRESETS = [
  { name: '目 の 開閉',   min: 0,  max: 1, def: 1, keys: [0, 1],     auto: 'blink' },
  { name: '口 の 開閉',   min: 0,  max: 1, def: 0, keys: [0, 1],     auto: 'none'  },
  { name: '顔 の 左右',   min: -1, max: 1, def: 0, keys: [-1, 0, 1], auto: 'wave'  },
  { name: '顔 の 上下',   min: -1, max: 1, def: 0, keys: [-1, 0, 1], auto: 'none'  },
  { name: 'からだ の ゆれ', min: -1, max: 1, def: 0, keys: [-1, 0, 1], auto: 'wave' },
  { name: '呼吸',         min: 0,  max: 1, def: 0, keys: [0, 1],     auto: 'wave'  },
  { name: '腕 を あげる', min: 0,  max: 1, def: 0, keys: [0, 1],     auto: 'none'  },
  { name: '髪 の ゆれ',   min: -1, max: 1, def: 0, keys: [-1, 0, 1], auto: 'wave'  }
];
