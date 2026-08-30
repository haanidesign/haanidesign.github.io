/* パラメータ人形 — 画面と 操作
   スマホ縦持ちが 基本。ステージは 1本指で パーツを つかむ、
   何もない ところを なぞると 紙が うごく、2本指で 大きさ。 */

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const V = {
  view: { x: 0, y: 0, z: 1 },
  sel: null,            // 選んでいる パーツ id
  editParam: null,      // フォーム編集中の パラメータ id
  editKey: 0,           // その 点の 番号
  pivot: false,         // 中心を うごかす モード
  frame: 0,
  playing: false,
  tab: 'parts',
  dirty: true
};

const cv = $('#stageCv');
const g = cv.getContext('2d');

/* ---------- ちいさな 道具 ---------- */

let toastT = 0;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 1800);
}

function modal(html, onReady){
  $('#modalBox').innerHTML = html;
  $('#modal').hidden = false;
  if(onReady) onReady($('#modalBox'));
}
const closeModal = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('click', (e) => { if(e.target.id === 'modal') closeModal(); });

const fmt = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '') || '0';

/* ---------- ステージ ---------- */

function resize(){
  const r = $('#stage').getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  V.dirty = true;
}
new ResizeObserver(resize).observe($('#stage'));

function fitView(){
  const r = $('#stage').getBoundingClientRect();
  const z = Math.min(r.width / D.w, r.height / D.h) * 0.88;
  V.view.z = z;
  V.view.x = (r.width - D.w * z) / 2;
  V.view.y = (r.height - D.h * z) / 2;
  V.dirty = true;
}

/** 画面の 座標 → 紙の 座標 */
function toWorld(cx, cy){
  const r = $('#stage').getBoundingClientRect();
  return { x: (cx - r.left - V.view.x) / V.view.z, y: (cy - r.top - V.view.y) / V.view.z };
}

/** いま 見せる パラメータの 値 */
function currentValues(){
  if(V.playing || V.tab === 'tl') return valuesAt(V.frame, V.playing);
  const v = {};
  for(const pr of D.params) v[pr.id] = pr.val;
  return v;
}

function draw(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.scale(dpr, dpr);
  g.translate(V.view.x, V.view.y);
  g.scale(V.view.z, V.view.z);

  // 紙
  g.fillStyle = D.bg || '#FFFEF7';
  g.fillRect(0, 0, D.w, D.h);
  g.lineWidth = 2.5 / V.view.z;
  g.strokeStyle = '#1E1C14';
  g.strokeRect(0, 0, D.w, D.h);

  const values = currentValues();
  drawDoc(g, { values, noBg: true });

  // 選んでいる パーツの 枠と 中心
  const part = V.sel && partById(V.sel);
  if(part && !V.playing){
    const o = poseOf(part, values);
    g.save();
    g.translate(o.x, o.y);
    g.rotate(o.rot * Math.PI / 180);
    g.scale(o.sx, o.sy);
    g.lineWidth = 2 / (V.view.z * Math.abs(o.sx || 1));
    g.strokeStyle = V.editParam ? '#F2A0B8' : '#1E1C14';
    g.setLineDash([8 / V.view.z, 6 / V.view.z]);
    g.strokeRect(-part.px, -part.py, part.w, part.h);
    g.restore();

    // 中心の しるし
    const rr = (V.pivot ? 11 : 7) / V.view.z;
    g.setLineDash([]);
    g.beginPath(); g.arc(o.x, o.y, rr, 0, 7);
    g.fillStyle = V.pivot ? '#F2A0B8' : '#E1DD60';
    g.fill();
    g.lineWidth = 2.5 / V.view.z; g.strokeStyle = '#1E1C14'; g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

let last = 0;
function loop(t){
  if(V.playing){
    if(!last) last = t;
    const adv = Math.floor((t - last) / (1000 / D.fps));
    if(adv > 0){
      V.frame = (V.frame + adv) % Math.max(1, D.frames);
      last += adv * (1000 / D.fps);
      V.dirty = true;
      syncFrameUI();
    }
  }else last = 0;
  if(V.dirty || V.playing){ draw(); V.dirty = false; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- 指の 操作 ---------- */

const pts = new Map();
let drag = null;      // { part, sx, sy, base }
let pan = null;
let pinch = null;

$('#stage').addEventListener('pointerdown', (e) => {
  $('#stage').setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if(pts.size === 2){
    drag = null; pan = null;
    const [a, b] = Array.from(pts.values());
    pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
      z: V.view.z, vx: V.view.x, vy: V.view.y
    };
    return;
  }
  if(pts.size > 2) return;

  const w = toWorld(e.clientX, e.clientY);
  const values = currentValues();
  const hit = hitTest(w.x, w.y, values);

  if(hit){
    selectPart(hit.id);
    const o = poseOf(hit, values);
    drag = {
      part: hit, wx: w.x, wy: w.y,
      // 元の 姿と、パラメータぶんの ずれ（中心を うつすときに 使う）
      ox: hit.x, oy: hit.y, offX: o.x - hit.x, offY: o.y - hit.y,
      form: formForEdit(hit.id),
      fx: 0, fy: 0, moved: false
    };
    if(drag.form){ drag.fx = drag.form.dx; drag.fy = drag.form.dy; }
    if(V.pivot){
      const s = Math.sin(-o.rot * Math.PI / 180), c = Math.cos(-o.rot * Math.PI / 180);
      const dx = w.x - o.x, dy = w.y - o.y;
      drag.pivotL = {
        x: (dx * c - dy * s) / (o.sx || .001) + hit.px,
        y: (dx * s + dy * c) / (o.sy || .001) + hit.py
      };
    }
  }else{
    pan = { x: e.clientX, y: e.clientY, vx: V.view.x, vy: V.view.y };
    if(!V.editParam) selectPart(null);
  }
});

$('#stage').addEventListener('pointermove', (e) => {
  if(!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if(pinch && pts.size >= 2){
    const [a, b] = Array.from(pts.values());
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const k = Math.max(.06, Math.min(8, pinch.z * (d / (pinch.d || 1)))) / pinch.z;
    const r = $('#stage').getBoundingClientRect();
    const cx = pinch.cx - r.left, cy = pinch.cy - r.top;
    V.view.z = pinch.z * k;
    V.view.x = cx - (cx - pinch.vx) * k + ((a.x + b.x) / 2 - pinch.cx);
    V.view.y = cy - (cy - pinch.vy) * k + ((a.y + b.y) / 2 - pinch.cy);
    V.dirty = true;
    return;
  }

  if(pan){
    V.view.x = pan.vx + (e.clientX - pan.x);
    V.view.y = pan.vy + (e.clientY - pan.y);
    V.dirty = true;
    return;
  }

  if(drag){
    const w = toWorld(e.clientX, e.clientY);
    const dx = w.x - drag.wx, dy = w.y - drag.wy;
    if(Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;

    if(V.pivot){
      // 中心を 指の 下に うつす。絵は 動かさない
      drag.part.px = drag.pivotL.x; drag.part.py = drag.pivotL.y;
      drag.part.x = w.x - drag.offX;
      drag.part.y = w.y - drag.offY;
    }else if(drag.form){
      drag.form.dx = drag.fx + dx;
      drag.form.dy = drag.fy + dy;
    }else{
      drag.part.x = drag.ox + dx;
      drag.part.y = drag.oy + dy;
    }
    V.dirty = true;
    if(V.tab === 'parts') refreshProps();
  }
});

function endPointer(e){
  pts.delete(e.pointerId);
  if(pts.size < 2) pinch = null;
  if(pts.size === 0){
    if(drag && drag.moved) save();
    drag = null; pan = null;
  }
}
$('#stage').addEventListener('pointerup', endPointer);
$('#stage').addEventListener('pointercancel', endPointer);

/* いま さわると どこに 書きこむか。
   フォーム編集中 → その 点の ずれ。ふだん → パーツ そのもの（null） */
function formForEdit(partId){
  if(!V.editParam) return null;
  bindPart(V.editParam, partId);
  return D.binds[V.editParam][partId][V.editKey];
}

/* ---------- パーツの 一覧 ---------- */

function selectPart(id){
  V.sel = id;
  V.dirty = true;
  renderParts();
  if(V.editParam) renderEditbar();
}

function renderParts(){
  const box = $('#partList');
  box.innerHTML = '';
  // 手前が 上に 来るように 逆から
  for(let i = D.parts.length - 1; i >= 0; i--){
    const p = D.parts[i];
    const el = document.createElement('div');
    el.className = 'item' + (p.id === V.sel ? ' sel' : '');
    el.innerHTML = `<span class="eye${p.visible ? '' : ' off'}">${p.visible ? '◉' : '○'}</span>
      <span class="nm"></span>${p.group ? '<span class="tag"></span>' : ''}`;
    el.querySelector('.nm').textContent = p.name;
    if(p.group) el.querySelector('.tag').textContent = p.group;
    el.querySelector('.eye').onclick = (ev) => {
      ev.stopPropagation();
      p.visible = !p.visible; V.dirty = true; renderParts(); save();
    };
    el.onclick = () => selectPart(p.id);
    box.appendChild(el);
  }
  refreshProps();
}

/** パーツの 数値。フォーム編集中は「見た目の 値」を いじって ずれに 記録する */
function refreshProps(){
  const box = $('#partProps');
  const p = V.sel && partById(V.sel);
  if(!p){ box.innerHTML = ''; return; }
  const f = V.editParam && isBound(V.editParam, p.id)
          ? D.binds[V.editParam][p.id][V.editKey] : null;

  const rows = [
    ['よこ',   'x',   p.x   + (f ? f.dx  : 0), -D.w, D.w * 2, 1],
    ['たて',   'y',   p.y   + (f ? f.dy  : 0), -D.h, D.h * 2, 1],
    ['かたむき','rot', p.rot + (f ? f.rot : 0), -180, 180, .5],
    ['よこ幅', 'sx',  p.sx  + (f ? f.dsx : 0), -2, 3, .01],
    ['たて幅', 'sy',  p.sy  + (f ? f.dsy : 0), -2, 3, .01],
    ['こさ',   'op',  p.op  + (f ? f.dop : 0), 0, 1, .01]
  ];
  box.innerHTML = `<div class="grp">${f ? '◆ この点での 形' : 'パーツの もとの 形'}</div>` +
    rows.map(([lb, k, v, mn, mx, st]) => `
      <div class="prop" data-k="${k}">
        <label>${lb}</label>
        <div class="slwrap"><input type="range" min="${mn}" max="${mx}" step="${st}" value="${v}"></div>
        <span class="num dot">${fmt(v)}</span>
      </div>`).join('') +
    `<div class="row" style="margin-top:.4rem">
       <button class="btn btn-sm" id="ppReset">この 形を もどす</button>
       <button class="btn btn-sm" id="ppPivot">◎ 中心を うつす</button>
       <button class="btn btn-sm" id="ppName">なまえ</button>
     </div>`;

  box.querySelectorAll('.prop').forEach(row => {
    const k = row.dataset.k;
    const sl = row.querySelector('input');
    sl.oninput = () => {
      const v = parseFloat(sl.value);
      row.querySelector('.num').textContent = fmt(v);
      if(f){
        const d = { x: 'dx', y: 'dy', rot: 'rot', sx: 'dsx', sy: 'dsy', op: 'dop' }[k];
        f[d] = v - p[k];
      }else p[k] = v;
      V.dirty = true;
    };
    sl.onchange = save;
  });
  $('#ppReset').onclick = () => {
    if(f){ Object.assign(f, { dx: 0, dy: 0, rot: 0, dsx: 0, dsy: 0, dop: 0 }); }
    else Object.assign(p, { rot: 0, sx: 1, sy: 1, op: 1 });
    V.dirty = true; refreshProps(); save();
  };
  $('#ppPivot').onclick = () => togglePivot();
  $('#ppName').onclick = () => {
    modal(`<h3>なまえを かえる</h3>
      <input type="text" id="nmIn" style="width:100%" value="">
      <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
        <button class="btn btn-sm" id="nmC">やめる</button>
        <button class="btn btn-sm btn-y" id="nmO">かえる</button></div>`, (b) => {
      b.querySelector('#nmIn').value = p.name;
      b.querySelector('#nmC').onclick = closeModal;
      b.querySelector('#nmO').onclick = () => {
        p.name = b.querySelector('#nmIn').value || p.name;
        closeModal(); renderParts(); save();
      };
    });
  };
}

$('#pUp').onclick   = () => { if(V.sel){ movePart(V.sel, -1); V.dirty = true; renderParts(); save(); } };
$('#pDown').onclick = () => { if(V.sel){ movePart(V.sel,  1); V.dirty = true; renderParts(); save(); } };
$('#pDel').onclick  = () => {
  if(!V.sel) return;
  removePart(V.sel); V.sel = null; V.dirty = true; renderParts(); renderParams(); save();
};

function togglePivot(){
  V.pivot = !V.pivot;
  $('#ebPivot').classList.toggle('on', V.pivot);
  toast(V.pivot ? '回すときの 中心を、指で うつせます' : '中心を うつすのを やめました');
  V.dirty = true;
}

/* ---------- パラメータ ---------- */

function renderParams(){
  const box = $('#paramList');
  box.innerHTML = '';
  if(!D.params.length){
    box.innerHTML = `<div class="hint">まだ パラメータが ありません。
      「＋ ふやす」から、目の開閉や 顔の左右などを 足してください。</div>`;
    return;
  }
  for(const pr of D.params){
    const el = document.createElement('div');
    el.className = 'prow' + (pr.id === V.editParam ? ' sel' : '');
    const boundN = Object.keys(D.binds[pr.id] || {}).length;
    el.innerHTML = `
      <div class="head">
        <span class="nm"></span>
        <span class="tag" style="font-size:.54rem;color:var(--gray)">${boundN}こ</span>
        <button class="btn btn-sm ${pr.id === V.editParam ? 'on' : ''}" data-a="edit" title="フォーム編集">✎</button>
        <button class="btn btn-sm" data-a="more" title="設定">⋯</button>
        <span class="num dot" data-num>${fmt(pr.val)}</span>
      </div>
      <div class="slwrap">
        <input type="range" min="${pr.min}" max="${pr.max}" step="0.01" value="${pr.val}">
        <div class="ticks"></div>
      </div>`;
    el.querySelector('.nm').textContent = pr.name;

    const ticks = el.querySelector('.ticks');
    for(const k of pr.keys){
      const i = document.createElement('i');
      i.style.left = ((k - pr.min) / (pr.max - pr.min) * 100) + '%';
      ticks.appendChild(i);
    }

    const sl = el.querySelector('input');
    sl.oninput = () => {
      pr.val = parseFloat(sl.value);
      el.querySelector('[data-num]').textContent = fmt(pr.val);
      if(pr.id === V.editParam){
        V.editKey = nearestKey(pr, pr.val);
        renderEditbar(); refreshProps();
      }
      V.dirty = true;
    };
    sl.onchange = save;

    el.querySelector('[data-a="edit"]').onclick = () => startEdit(pr.id === V.editParam ? null : pr.id);
    el.querySelector('[data-a="more"]').onclick = () => paramMenu(pr);
    box.appendChild(el);
  }
}

function startEdit(id){
  V.editParam = id;
  V.editKey = 0;
  if(id){
    const pr = paramById(id);
    pr.val = pr.keys[0];
    toast('点を えらんで、ステージで パーツを うごかしてください');
  }else{
    V.pivot = false;
  }
  renderParams(); renderEditbar(); refreshProps();
  V.dirty = true;
}

function renderEditbar(){
  const bar = $('#editbar');
  if(!V.editParam){ bar.hidden = true; return; }
  const pr = paramById(V.editParam);
  if(!pr){ bar.hidden = true; return; }
  bar.hidden = false;
  const part = V.sel && partById(V.sel);
  $('#ebName').textContent = pr.name + (part ? ' → ' + part.name : ' → パーツを タップ');
  const ks = $('#ebKeys');
  ks.innerHTML = '';
  pr.keys.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm' + (i === V.editKey ? ' on' : '');
    b.textContent = '◆' + fmt(k);
    b.onclick = () => {
      V.editKey = i; pr.val = k;
      renderEditbar(); renderParams(); refreshProps(); V.dirty = true;
    };
    ks.appendChild(b);
  });
  $('#ebPivot').classList.toggle('on', V.pivot);
}
$('#ebDone').onclick = () => startEdit(null);
$('#ebPivot').onclick = () => togglePivot();

function paramMenu(pr){
  modal(`<h3>パラメータの せってい</h3>
    <div class="prop"><label>なまえ</label><input type="text" id="mNm" style="flex:1"></div>
    <div class="prop"><label>ひくい</label><input type="number" id="mMin" step="0.1" style="width:70px">
      <label style="width:auto;margin-left:.4rem">たかい</label><input type="number" id="mMax" step="0.1" style="width:70px"></div>
    <div class="prop"><label>点の数</label><input type="number" id="mKeys" min="2" max="6" step="1" style="width:70px">
      <span class="hint" style="flex:1;margin-left:.4rem">2＝ひらく／とじる　3＝ひだり・まんなか・みぎ</span></div>
    <div class="prop"><label>自動</label>
      <select id="mAuto" style="flex:1">
        <option value="none">うごかさない</option>
        <option value="wave">ゆれる（ゆっくり 行ったり来たり）</option>
        <option value="blink">まばたき（ときどき ぱちっ）</option>
      </select></div>
    <div class="prop"><label>はやさ</label>
      <div class="slwrap" style="flex:1"><input type="range" id="mSpd" min="0.1" max="3" step="0.05"></div></div>
    <div class="row" style="margin-top:.6rem">
      <button class="btn btn-sm btn-p" id="mDel">けす</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm" id="mC">やめる</button>
      <button class="btn btn-sm btn-y" id="mO">きめる</button>
    </div>`, (b) => {
    b.querySelector('#mNm').value = pr.name;
    b.querySelector('#mMin').value = pr.min;
    b.querySelector('#mMax').value = pr.max;
    b.querySelector('#mKeys').value = pr.keys.length;
    b.querySelector('#mAuto').value = pr.auto.type;
    b.querySelector('#mSpd').value = pr.auto.speed;
    b.querySelector('#mC').onclick = closeModal;
    b.querySelector('#mDel').onclick = () => {
      if(V.editParam === pr.id) startEdit(null);
      removeParam(pr.id); closeModal(); renderParams(); renderTl(); V.dirty = true; save();
    };
    b.querySelector('#mO').onclick = () => {
      pr.name = b.querySelector('#mNm').value || pr.name;
      const mn = parseFloat(b.querySelector('#mMin').value);
      const mx = parseFloat(b.querySelector('#mMax').value);
      if(isFinite(mn) && isFinite(mx) && mx > mn){ pr.min = mn; pr.max = mx; }
      pr.auto.type = b.querySelector('#mAuto').value;
      pr.auto.speed = parseFloat(b.querySelector('#mSpd').value) || 1;
      setKeyCount(pr.id, parseInt(b.querySelector('#mKeys').value, 10));
      pr.val = Math.max(pr.min, Math.min(pr.max, pr.val));
      closeModal(); renderParams(); renderEditbar(); renderTl(); V.dirty = true; save();
    };
  });
}

$('#vAdd').onclick = () => {
  modal(`<h3>パラメータを ふやす</h3>
    <div class="hint" style="margin-bottom:.5rem">よく つかうものを えらぶか、いちばん下で 自分で つくれます。</div>
    <div id="pset"></div>
    <div class="row" style="margin-top:.5rem">
      <input type="text" id="freeNm" placeholder="じぶんで つくる" style="flex:1">
      <button class="btn btn-sm btn-y" id="freeGo">つくる</button>
    </div>
    <div class="row" style="margin-top:.5rem"><span style="flex:1"></span>
      <button class="btn btn-sm" id="pC">とじる</button></div>`, (b) => {
    const list = b.querySelector('#pset');
    PRESETS.forEach(ps => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<span class="nm"></span><span class="tag">${ps.keys.length}点</span>`;
      el.querySelector('.nm').textContent = ps.name;
      el.onclick = () => {
        const pr = addParam(ps.name, ps.min, ps.max, ps.def, ps.keys);
        pr.auto.type = ps.auto;
        closeModal(); renderParams(); renderTl(); startEdit(pr.id); save();
      };
      list.appendChild(el);
    });
    b.querySelector('#freeGo').onclick = () => {
      const nm = b.querySelector('#freeNm').value.trim() || 'パラメータ';
      const pr = addParam(nm, -1, 1, 0, [-1, 0, 1]);
      closeModal(); renderParams(); renderTl(); startEdit(pr.id); save();
    };
    b.querySelector('#pC').onclick = closeModal;
  });
};

$('#vReset').onclick = () => {
  for(const pr of D.params) pr.val = pr.def;
  renderParams(); refreshProps(); V.dirty = true;
};

/* ---------- タイムライン ---------- */

function renderTl(){
  $('#tScrub').max = Math.max(0, D.frames - 1);
  const ruler = $('#tRuler');
  ruler.innerHTML = '';
  const step = D.frames <= 48 ? 6 : D.frames <= 120 ? 12 : 24;
  for(let f = 0; f < D.frames; f += step){
    const i = document.createElement('i');
    i.style.left = (f / Math.max(1, D.frames - 1) * 100) + '%';
    i.textContent = f;
    ruler.appendChild(i);
  }

  const rows = $('#tlRows');
  rows.innerHTML = '';
  if(!D.params.length){
    rows.innerHTML = `<div class="trow"><div class="lb">—</div>
      <div class="track" style="font-size:.6rem;padding:.4rem;font-weight:400">
      パラメータを つくると ここに ならびます</div></div>`;
    return;
  }
  for(const pr of D.params){
    const el = document.createElement('div');
    el.className = 'trow';
    el.innerHTML = `<div class="lb"></div><div class="track"></div>`;
    el.querySelector('.lb').textContent = pr.name;
    const tr = el.querySelector('.track');
    for(const k of (D.tl[pr.id] || [])){
      const d = document.createElement('span');
      d.className = 'k' + (k.f === V.frame ? ' on' : '');
      d.style.left = (k.f / Math.max(1, D.frames - 1) * 100) + '%';
      tr.appendChild(d);
    }
    tr.onclick = (e) => {
      const r = tr.getBoundingClientRect();
      V.frame = Math.round((e.clientX - r.left) / r.width * (D.frames - 1));
      V.frame = Math.max(0, Math.min(D.frames - 1, V.frame));
      syncFrameUI(); V.dirty = true;
    };
    rows.appendChild(el);
  }
  syncFrameUI();
}

function syncFrameUI(){
  $('#tFrame').textContent = V.frame + ' / ' + D.frames;
  $('#tScrub').value = V.frame;
  const ph = $('#playhead');
  const grid = $('#tlgrid');
  if(grid && D.params.length){
    ph.hidden = false;
    const lb = 84;
    const w = grid.clientWidth - lb;
    ph.style.left = (lb + w * (V.frame / Math.max(1, D.frames - 1))) + 'px';
    ph.style.top = '22px';
    ph.style.height = (grid.clientHeight - 22) + 'px';
  }else ph.hidden = true;
  // 再生中は パラメータの スライダーも 追いかける
  if(V.playing && V.tab === 'params'){
    const vals = valuesAt(V.frame, true);
    $$('#paramList .prow').forEach((el, i) => {
      const pr = D.params[i]; if(!pr) return;
      el.querySelector('input').value = vals[pr.id];
      el.querySelector('[data-num]').textContent = fmt(vals[pr.id]);
    });
  }
}

$('#tScrub').oninput = () => { V.frame = parseInt($('#tScrub').value, 10); syncFrameUI(); V.dirty = true; };
$('#tPlay').onclick = () => {
  V.playing = !V.playing;
  $('#tPlay').textContent = V.playing ? '■ とめる' : '▶ さいせい';
  $('#tPlay').classList.toggle('on', V.playing);
  V.dirty = true;
};
$('#tKey').onclick = () => {
  if(!D.params.length) return toast('先に パラメータを つくってください');
  for(const pr of D.params) setKeyframe(pr.id, V.frame, pr.val);
  renderTl(); toast('いまの すがたを ' + V.frame + ' コマ目に おきました'); save();
};
$('#tDel').onclick = () => {
  for(const pr of D.params) delKeyframe(pr.id, V.frame);
  renderTl(); save();
};
$('#tLen').onclick = () => {
  modal(`<h3>うごきの ながさ</h3>
    <div class="prop"><label>コマ数</label><input type="number" id="lF" min="2" max="600" step="1" style="width:80px"></div>
    <div class="prop"><label>1秒 何コマ</label><input type="number" id="lFps" min="6" max="60" step="1" style="width:80px"></div>
    <div class="hint" id="lNote"></div>
    <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
      <button class="btn btn-sm" id="lC">やめる</button>
      <button class="btn btn-sm btn-y" id="lO">きめる</button></div>`, (b) => {
    const f = b.querySelector('#lF'), fp = b.querySelector('#lFps'), note = b.querySelector('#lNote');
    f.value = D.frames; fp.value = D.fps;
    const upd = () => note.textContent = 'およそ ' + fmt((f.value / fp.value), 1) + ' びょう';
    f.oninput = fp.oninput = upd; upd();
    b.querySelector('#lC').onclick = closeModal;
    b.querySelector('#lO').onclick = () => {
      D.frames = Math.max(2, Math.min(600, parseInt(f.value, 10) || 72));
      D.fps = Math.max(6, Math.min(60, parseInt(fp.value, 10) || 24));
      V.frame = Math.min(V.frame, D.frames - 1);
      closeModal(); renderTl(); save();
    };
  });
};

/* ---------- タブ ---------- */

$$('#tabs .btn').forEach(b => {
  b.onclick = () => {
    $$('#tabs .btn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    V.tab = b.dataset.pane;
    $('#paneParts').hidden  = V.tab !== 'parts';
    $('#paneParams').hidden = V.tab !== 'params';
    $('#paneTl').hidden     = V.tab !== 'tl';
    if(V.tab === 'tl') renderTl();
    V.dirty = true;
  };
});

/* ---------- 読み込み ---------- */

$('#btnOpen').onclick = () => $('#file').click();
$('#file').onchange = (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; };

['dragover', 'drop'].forEach(t => $('#stage').addEventListener(t, (e) => {
  e.preventDefault();
  if(t === 'drop') handleFiles(Array.from(e.dataTransfer.files));
}));

async function handleFiles(files){
  if(!files.length) return;
  for(const f of files){
    try{
      if(/\.psd$/i.test(f.name)){
        toast('PSD を ひらいています…');
        await new Promise(r => setTimeout(r, 30));
        await importPsd(f);
        toast(D.parts.length + 'まいの パーツに なりました');
      }else if(/\.json$/i.test(f.name)){
        await fromJSON(await f.text());
        toast('よみこみました');
      }else if(/^image\//.test(f.type)){
        await importImage(f);
      }
    }catch(err){
      toast(String(err.message || err));
    }
  }
  $('#drop').classList.toggle('hide', D.parts.length > 0);
  fitView(); renderParts(); renderParams(); renderTl(); save();
}

/* ---------- そのほかの メニュー ---------- */

$('#btnFit').onclick = fitView;
$('#home').onclick = () => { location.href = '../../index.html'; };

$('#btnMenu').onclick = () => {
  modal(`<h3>そのほか</h3>
    <div class="prop"><label>はいけい</label>
      <input type="color" id="mBg" style="width:52px;height:30px;padding:0">
      <button class="btn btn-sm" id="mBgNone">すける</button></div>
    <div class="prop"><label>紙の大きさ</label>
      <input type="number" id="mW" step="1" style="width:74px"> ×
      <input type="number" id="mH" step="1" style="width:74px"></div>
    <div class="row" style="margin-top:.5rem">
      <button class="btn btn-sm" id="mSave">ファイルに ほぞん</button>
      <button class="btn btn-sm" id="mLoad">ひらく</button>
    </div>
    <div class="row" style="margin-top:.4rem">
      <button class="btn btn-sm" id="mHelp">つかいかた</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm btn-p" id="mClear">ぜんぶ けす</button>
    </div>
    <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
      <button class="btn btn-sm btn-y" id="mC">とじる</button></div>`, (b) => {
    b.querySelector('#mBg').value = D.bg || '#fffef7';
    b.querySelector('#mW').value = D.w;
    b.querySelector('#mH').value = D.h;
    b.querySelector('#mBg').oninput = (e) => { D.bg = e.target.value; V.dirty = true; save(); };
    b.querySelector('#mBgNone').onclick = () => { D.bg = null; V.dirty = true; save(); toast('はいけいを すけさせました'); };
    const apply = () => {
      D.w = Math.max(16, parseInt(b.querySelector('#mW').value, 10) || D.w);
      D.h = Math.max(16, parseInt(b.querySelector('#mH').value, 10) || D.h);
      fitView(); save();
    };
    b.querySelector('#mW').onchange = apply;
    b.querySelector('#mH').onchange = apply;
    b.querySelector('#mSave').onclick = () => {
      const blob = new Blob([toJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ningyou.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      closeModal();
    };
    b.querySelector('#mLoad').onclick = () => { closeModal(); $('#file').click(); };
    b.querySelector('#mHelp').onclick = help;
    b.querySelector('#mClear').onclick = () => {
      D.parts.length = 0; D.params.length = 0;
      for(const k in D.binds) delete D.binds[k];
      for(const k in D.tl) delete D.tl[k];
      V.sel = null; startEdit(null);
      $('#drop').classList.remove('hide');
      closeModal(); renderParts(); renderParams(); renderTl(); V.dirty = true; save();
    };
    b.querySelector('#mC').onclick = closeModal;
  });
};

function help(){
  modal(`<h3>つかいかた</h3>
    <div class="hint" style="font-size:.68rem">
      <b>1.</b> 「＋ よみこむ」で PSD を えらぶ。レイヤーが そのまま パーツに なります。
      PNG や JPEG も 1まいずつ 足せます。<br><br>
      <b>2.</b>「パラメータ」タブで ＋ふやす。目の開閉、顔の左右 などを えらびます。<br><br>
      <b>3.</b> ✎ を おすと フォーム編集。うえの 帯で <b>◆点</b> を えらび、
      ステージで パーツを 指で うごかす／数値を いじる。
      これで「その点の とき この形」が おぼえられます。<br><br>
      <b>4.</b> ✎ を もういちど おして おわり。スライダーを 動かすと、
      おぼえた 形の あいだを なめらかに 行き来します。<br><br>
      <b>5.</b>「うごき」タブで コマを えらんで ◆キーを おく。
      いくつか おくと アニメに なります。キーを 打たない パラメータは
      「自動（ゆれ・まばたき）」で かってに うごきます。<br><br>
      <b>6.</b> 右上の「▶ 書き出す」で 動画に なります。<br><br>
      ステージ：パーツを なぞる＝うごかす／何もない ところ＝紙を うごかす／
      2本指＝大きさ。「◎ 中心」を おすと 回るときの 中心を うつせます。
    </div>
    <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
      <button class="btn btn-sm btn-y" id="hC">わかった</button></div>`, (b) => {
    b.querySelector('#hC').onclick = closeModal;
  });
}

/* ---------- 書き出し ---------- */

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

async function pickCodec(width, height, fps, bitrate){
  if(typeof VideoEncoder === 'undefined') return null;
  for(const codec of ['avc1.640034','avc1.640033','avc1.640032','avc1.640028',
                      'avc1.4d0034','avc1.4d0028','avc1.42003e','avc1.42002a','avc1.42001f']){
    try{
      const cfg = { codec, width, height, bitrate, framerate: fps };
      const r = await VideoEncoder.isConfigSupported(cfg);
      if(r && r.supported) return cfg;
    }catch(_){}
  }
  return null;
}

$('#btnExport').onclick = () => {
  if(!D.parts.length) return toast('先に 絵を よみこんでください');
  modal(`<h3>動画に する</h3>
    <div class="prop"><label>大きさ</label><span class="dot" id="xSize"></span></div>
    <div class="prop"><label>ながさ</label><span class="dot" id="xLen"></span></div>
    <div class="prop"><label>ちぢめる</label>
      <select id="xScale" style="flex:1">
        <option value="1">そのまま</option>
        <option value="0.75">75%</option>
        <option value="0.5" selected>50%（スマホ向き）</option>
      </select></div>
    <div class="hint" id="xNote">「はじめる」を おすと つくります。</div>
    <div class="row" style="margin-top:.6rem">
      <span style="flex:1"></span>
      <button class="btn btn-sm" id="xC">やめる</button>
      <button class="btn btn-sm btn-y" id="xGo">はじめる</button>
    </div>`, (b) => {
    const upd = () => {
      const k = parseFloat(b.querySelector('#xScale').value);
      b.querySelector('#xSize').textContent = even(D.w * k) + ' × ' + even(D.h * k);
    };
    b.querySelector('#xLen').textContent = D.frames + 'コマ / ' + fmt(D.frames / D.fps, 1) + 'びょう';
    b.querySelector('#xScale').onchange = upd; upd();
    b.querySelector('#xC').onclick = closeModal;
    b.querySelector('#xGo').onclick = () => runExport(parseFloat(b.querySelector('#xScale').value), b);
  });
};

async function runExport(scale, box){
  const width = even(D.w * scale), height = even(D.h * scale);
  const fps = D.fps, total = D.frames;
  let stop = false;
  box.innerHTML = `<h3>つくっています…</h3>
    <div class="slwrap"><input type="range" id="xP" min="0" max="100" value="0" disabled></div>
    <div class="hint" id="xM">0%</div>
    <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
      <button class="btn btn-sm btn-p" id="xStop">やめる</button></div>`;
  box.querySelector('#xStop').onclick = () => { stop = true; };
  const prog = (p) => {
    box.querySelector('#xP').value = Math.round(p * 100);
    box.querySelector('#xM').textContent = Math.round(p * 100) + '%';
  };

  const out = document.createElement('canvas');
  out.width = width; out.height = height;
  const og = out.getContext('2d');
  const drawFrame = (f) => {
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.clearRect(0, 0, width, height);
    og.fillStyle = D.bg || '#FFFEF7';
    og.fillRect(0, 0, width, height);
    og.scale(scale, scale);
    drawDoc(og, { values: valuesAt(f, true), noBg: true });
  };

  try{
    const wasPlaying = V.playing; V.playing = false;
    const bitrate = Math.min(16e6, Math.round(width * height * fps * 0.12));
    const cfg = await pickCodec(width, height, fps, bitrate);
    let blob, ext;

    if(cfg && typeof Mp4Muxer !== 'undefined'){
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width, height, frameRate: fps },
        fastStart: 'in-memory'
      });
      let failed = null;
      const enc = new VideoEncoder({
        output: (c, m) => muxer.addVideoChunk(c, m),
        error: (e) => { failed = e; }
      });
      enc.configure(cfg);
      const us = 1e6 / fps;
      for(let i = 0; i < total; i++){
        if(stop){ enc.close(); throw new Error('やめました'); }
        if(failed) throw failed;
        drawFrame(i);
        const fr = new VideoFrame(out, { timestamp: Math.round(i * us), duration: Math.round(us) });
        enc.encode(fr, { keyFrame: i % (fps * 2) === 0 });
        fr.close();
        if(enc.encodeQueueSize > 8){
          await new Promise(r => setTimeout(r, 0));
          while(enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 4));
        }
        if(i % 3 === 0) prog(i / total);
      }
      await enc.flush(); enc.close();
      if(failed) throw failed;
      muxer.finalize();
      blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      ext = 'mp4';
    }else{
      const mime = ['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm']
        .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if(!mime) throw new Error('この端末では 書き出せませんでした');
      const stream = out.captureStream(fps);
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
      rec.ondataavailable = (e) => { if(e.data.size) chunks.push(e.data); };
      const done = new Promise(r => { rec.onstop = r; });
      rec.start();
      const t0 = performance.now(), dur = total / fps;
      await new Promise((res, rej) => {
        const step = () => {
          if(stop){ rej(new Error('やめました')); return; }
          const t = (performance.now() - t0) / 1000;
          if(t >= dur){ res(); return; }
          drawFrame(Math.floor(t * fps) % total);
          prog(t / dur);
          requestAnimationFrame(step);
        };
        step();
      }).catch(err => { try{ rec.stop(); }catch(_){} throw err; });
      rec.stop(); await done;
      const type = mime.split(';')[0];
      blob = new Blob(chunks, { type });
      ext = type.includes('mp4') ? 'mp4' : 'webm';
    }
    prog(1);
    V.playing = wasPlaying;

    const name = 'ningyou.' + ext;
    const url = URL.createObjectURL(blob);
    box.innerHTML = `<h3>できました</h3>
      <video src="${url}" controls loop playsinline muted autoplay
             style="width:100%;border:2.5px solid var(--ink);border-radius:10px;background:#000"></video>
      <div class="hint" style="margin-top:.4rem">
        スマホは「きょうゆう」から カメラロールに ほぞんできます。</div>
      <div class="row" style="margin-top:.5rem">
        <button class="btn btn-sm btn-y" id="xShare">きょうゆう</button>
        <button class="btn btn-sm" id="xDl">ほぞん</button>
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="xC2">とじる</button>
      </div>`;
    box.querySelector('#xC2').onclick = () => { URL.revokeObjectURL(url); closeModal(); };
    box.querySelector('#xDl').onclick = () => {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
    };
    box.querySelector('#xShare').onclick = async () => {
      try{
        const file = new File([blob], name, { type: blob.type });
        if(navigator.canShare && navigator.canShare({ files: [file] })){
          await navigator.share({ files: [file], title: name });
        }else toast('この端末では きょうゆうが つかえません。「ほぞん」を おしてください');
      }catch(err){ if(err.name !== 'AbortError') toast('きょうゆうを ひらけませんでした'); }
    };
  }catch(err){
    box.innerHTML = `<h3>できませんでした</h3><div class="hint"></div>
      <div class="row" style="margin-top:.6rem"><span style="flex:1"></span>
        <button class="btn btn-sm btn-y" id="xC3">とじる</button></div>`;
    box.querySelector('.hint').textContent = String(err.message || err);
    box.querySelector('#xC3').onclick = closeModal;
  }
}

/* ---------- 自動ほぞん（この端末の 中だけ） ---------- */

let db = null;
function openDb(){
  return new Promise((res) => {
    try{
      const r = indexedDB.open('param-doll', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    }catch(_){ res(null); }
  });
}
let saveT = 0;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if(!db) db = await openDb();
    if(!db || !D.parts.length) return;
    try{
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(toJSON(), 'doc');
    }catch(_){}
  }, 900);
}
async function restore(){
  db = await openDb();
  if(!db) return false;
  const text = await new Promise((res) => {
    try{
      const r = db.transaction('kv', 'readonly').objectStore('kv').get('doc');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    }catch(_){ res(null); }
  });
  if(!text) return false;
  try{ await fromJSON(text); return D.parts.length > 0; }catch(_){ return false; }
}

/* ---------- はじめ ---------- */

(async function init(){
  resize();
  const ok = await restore();
  $('#drop').classList.toggle('hide', ok);
  fitView();
  renderParts(); renderParams(); renderTl();
  if(!ok) setTimeout(help, 400);
})();
