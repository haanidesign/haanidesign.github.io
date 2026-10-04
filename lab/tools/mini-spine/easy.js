/* ミニSpine — かんたんモード
   はじめての 人でも 迷わない ように、4つの 手順 だけを 大きく 出す。
     1 絵を 入れる → 2 つながり → 3 動き → 4 書き出し
   「つながり」では パーツごとに「何と いっしょに 動くか」を 色で 見せて、
   さわって 変える だけ。骨は その えらび方から ぜんぶ 自動で 組み直す。
   kobo.js の あとに 読む。 */
'use strict';

/* パーツの 組（何と いっしょに 動くか） */
const GRP = {
  body:  { name:'体と いっしょ', short:'体',   col:'#7AC4A0', icon:'🧍' },
  head:  { name:'頭と いっしょ', short:'頭',   col:'#F2A0B8', icon:'🙂' },
  swing: { name:'揺れる',       short:'揺れ', col:'#8FB7E8', icon:'💇' },
  armR:  { name:'右腕（画面の 左）', short:'右腕', col:'#E1DD60', icon:'💪' },
  armL:  { name:'左腕（画面の 右）', short:'左腕', col:'#E8B860', icon:'💪' }
};
const GRP_KEYS = Object.keys(GRP);

const E = { on:false, step:1, pick:null, neckMode:false };

/* ---------- いまの 骨から 組を おしはかる ---------- */
function guessGroup(sl){
  const n = sl.name;
  if(/髪|hair|リボン|ribbon|イヤリング|ピアス|earring|尾|しっぽ|tail|紐|ひも|房|タッセル|飾り|もみあげ|アホ毛/i.test(n)) return 'swing';
  if(/顔|face|目|眉|口|鼻|耳|頬|eye|brow|mouth|nose|ear|cheek|角|horn|瞳|白目|まぶた|睫|輪郭/i.test(n)) return 'head';
  if(/腕|arm|手|hand|袖|sleeve|指|finger/i.test(n)){
    const side = /右|right|_r\b|\.r\b|r$/i.test(n) ? 'armR' : /左|left|_l\b|\.l\b|l$/i.test(n) ? 'armL' : null;
    if(side) return side;
    // 名前で 左右が わからない ときは、絵の まんなかより どちらか
    const all = allBox(), b = slotBox(sl);
    return b.cx < all.cx ? 'armR' : 'armL';
  }
  // いまの 骨の 先祖に 頭が あれば 頭
  let b = boneById(slotBones(sl).main ? slotBones(sl).main.id : sl.bone);
  while(b){ if(b.spring) return 'swing'; if(/頭|head/i.test(b.name)) return 'head'; b = boneById(b.parent); }
  return 'body';
}
function allBox(){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  S.proj.slots.forEach(sl => { if(!sl.verts.length) return; const b = slotBox(sl);
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); });
  if(x0 > x1) return { x0:0, y0:0, x1:S.proj.canvas.w, y1:S.proj.canvas.h, cx:S.proj.canvas.w/2, w:S.proj.canvas.w, h:S.proj.canvas.h };
  return { x0, y0, x1, y1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, w:x1 - x0, h:y1 - y0 };
}
function groupBox(g){
  const list = S.proj.slots.filter(sl => sl.grp === g && sl.verts.length);
  if(!list.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  list.forEach(sl => { const b = slotBox(sl); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); });
  return { x0, y0, x1, y1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, w:x1 - x0, h:y1 - y0 };
}
function ensureGroups(){
  S.proj.slots.forEach(sl => { if(!GRP[sl.grp]) sl.grp = guessGroup(sl); });
}
/** 首の 位置（頭が 回る 中心）。きめて いなければ 頭の 組の 下はし */
function neckPoint(){
  if(S.proj.easyNeck) return S.proj.easyNeck;
  const hb = groupBox('head'), ab = allBox();
  if(hb) return { x: hb.cx, y: hb.y1 - hb.h * 0.08 };
  return { x: ab.cx, y: ab.y0 + ab.h * 0.35 };
}

/* ---------- 組の えらび方から 骨を ぜんぶ 組み直す ----------
   root → 体 → 頭（首で 回る）／右腕1→2／左腕1→2、揺れる パーツは 揺れる 骨 3本。
   アニメの キーは 骨の 名前で 引きつぐ（体・頭・右腕1 … は 毎回 同じ 名前） */
function rebuildFromGroups(){
  ensureGroups();
  const root = S.proj.bones[0];
  // キーを 名前で とっておく
  const keep = {};
  for(const nm in S.proj.anims){
    const tr = S.proj.anims[nm].tracks; keep[nm] = {};
    for(const id in tr){ const b = boneById(id); if(b) keep[nm][b.name] = tr[id]; }
  }
  const ab = allBox(), N = neckPoint();
  S.proj.bones = [root]; S.proj.iks = [];
  root.parent = null; root.x = ab.cx; root.y = ab.y1; root.rot = -90; root.sx = root.sy = 1; root.shear = 0;
  root.len = Math.max(40, ab.h * 0.08);

  const hip = { x: N.x, y: Math.min(ab.y1, N.y + (ab.y1 - N.y) * 0.75) };
  const body = boneAt('体', root.id, hip, N);
  const hb = groupBox('head');
  const head = boneAt('頭', body.id, N, { x: N.x, y: hb ? Math.min(hb.y0, N.y - 20) : N.y - ab.h * 0.25 });
  const arms = {};
  ['armR', 'armL'].forEach(g => {
    const b = groupBox(g); if(!b) return;
    // 肩 ＝ 腕の 組で 首に いちばん 近い 点、手先 ＝ いちばん 遠い 点
    let near = null, far = null, dn = 1e9, df = -1;
    S.proj.slots.filter(sl => sl.grp === g).forEach(sl => sl.verts.forEach(v => {
      const d = Math.hypot(v.x - N.x, v.y - N.y);
      if(d < dn){ dn = d; near = { x:v.x, y:v.y }; }
      if(d > df){ df = d; far = { x:v.x, y:v.y }; }
    }));
    const mid = { x:(near.x + far.x) / 2, y:(near.y + far.y) / 2 };
    const nm = g === 'armR' ? '右腕' : '左腕';
    const u = boneAt(nm + '1', body.id, near, mid);
    const l = boneAt(nm + '2', u.id, mid, far);
    arms[g] = [u.id, l.id];
  });
  markDirty();
  const swingIds = {};
  S.proj.slots.filter(sl => sl.grp === 'swing' && sl.verts.length).forEach(sl => {
    const b = slotBox(sl);
    const par = b.cy < N.y + (ab.y1 - N.y) * 0.1 ? head.id : body.id;
    swingIds[sl.id] = hairChain(sl.name, par, { x: b.cx, y: b.y0 + b.h * 0.05 }, { x: b.cx, y: b.y1 }, 3);
  });
  markDirty();
  const sp = setupPose();
  S.proj.slots.forEach(sl => {
    sl.verts.forEach(v => { v.w = []; });
    if(sl.grp === 'head') sl.bone = head.id;
    else if(sl.grp === 'swing' && swingIds[sl.id]){
      sl.bone = swingIds[sl.id][0];
      autoWeights(S.proj, sl, sp, { maxBones:2, falloff:2, only: swingIds[sl.id] });
    }
    else if(arms[sl.grp]){
      sl.bone = arms[sl.grp][0];
      autoWeights(S.proj, sl, sp, { maxBones:2, falloff:3, only: arms[sl.grp] });
    }
    else sl.bone = body.id;
  });
  markDirty();
  // 首の パーツが あれば 体と 頭に わけて つなぐ（首から とれない ように）
  fixNeck(true);
  // キーを もどす
  for(const nm in keep){
    const a = S.proj.anims[nm]; if(!a) continue; a.tracks = {};
    S.proj.bones.forEach(b => { if(keep[nm][b.name]) a.tracks[b.id] = keep[nm][b.name]; });
  }
  S.spring = true; S.springState = {};
  S.sel = { bone: root.id, slot: null, ik: null };
}

/* ---------- 画面 ---------- */
const easyUI = (() => {
  const wrap = el('div'); wrap.id = 'easy';
  const steps = el('div', 'ez-steps');
  const STEP = [[1,'① 絵を 入れる'],[2,'② つながり'],[3,'③ 動き'],[4,'④ 書き出し']];
  // いまの 手順を もう一度 たたくと、板を たたんで 絵を 広く 見せる
  const btns = STEP.map(([n, t]) => { const b = mkBtn(t, () => {
    if(E.step === n && E.on){ wrap.classList.toggle('min'); easyFit(); return; }
    wrap.classList.remove('min'); setStep(n);
  }, 'ez-step'); steps.appendChild(b); return b; });
  const body = el('div', 'ez-body');
  wrap.append(steps, body);
  $('#view').appendChild(wrap);
  // 上の バーに 切りかえ ボタン
  const tg = el('button', 'btn btn-sm btn-g', 'くわしく'); tg.id = 'btnEasy';
  tg.onclick = () => setEasy(!E.on);
  $('.tb-actions').insertBefore(tg, $('.tb-actions').firstChild);
  return { wrap, btns, body, tg };
})();

function setEasy(on){
  E.on = on;
  document.body.classList.toggle('easy', on);
  easyUI.tg.textContent = on ? 'くわしく ▸' : '◂ かんたん';
  easyUI.tg.title = on ? 'すべての 機能を 出す' : '4つの 手順だけの かんたん画面に もどる';
  S.easyBlock = on;
  if(on){ S.show.bones = false; S.tool = 'pose'; setStep(S.proj.slots.length ? (E.step > 1 ? E.step : 2) : 1); }
  else { S.show.bones = true; E.pick = null; E.neckMode = false; }
  try{ localStorage.setItem('miniSpine.easy', on ? '1' : '0'); }catch(_){}
  setTimeout(() => { resize(); fitView(); refreshUI(); easyFit(); }, 30);
}

function setStep(n){
  E.step = n; E.pick = null; E.neckMode = false;
  easyUI.btns.forEach((b, i) => b.classList.toggle('on', i + 1 === n));
  const B = easyUI.body; B.innerHTML = '';
  if(n === 1){
    S.mode = 'setup'; S.playing = false;
    B.appendChild(el('div', 'ez-say', 'PSD（パーツごとに レイヤーが 分かれた もの）か、PNG を 入れてね。'));
    const r = el('div', 'ez-row');
    r.append(mkBtn('🖼 PSD / 画像を えらぶ', () => $('#fileImg').click(), 'btn btn-y ez-big'),
             mkBtn('📂 保存した 作品を ひらく', () => $('#fileProj').click(), 'btn ez-big'));
    B.appendChild(r);
    if(S.proj.slots.length) B.appendChild(mkBtn('つぎへ ▶ つながり', () => setStep(2), 'btn btn-g ez-next'));
  }
  if(n === 2){
    S.mode = 'setup'; S.playing = false;
    ensureGroups();
    B.appendChild(el('div', 'ez-say', 'パーツの 色が「何と いっしょに 動くか」。ちがう パーツを さわって 直してね。'));
    const lg = el('div', 'ez-legend');
    GRP_KEYS.forEach(k => { const c = el('span', 'ez-chip'); c.style.background = GRP[k].col; c.textContent = GRP[k].short; lg.appendChild(c); });
    B.appendChild(lg);
    const pickBox = el('div', 'ez-pick'); pickBox.id = 'ezPick'; B.appendChild(pickBox);
    const r = el('div', 'ez-row');
    r.append(mkBtn('📍 首の 位置を さわって 決める', () => { E.neckMode = true; E.pick = null; showPick(); }, 'btn ez-big'),
             mkBtn('つぎへ ▶ 動き', () => { applyGroupsNow(); setStep(3); }, 'btn btn-g ez-big'));
    B.appendChild(r);
    showPick();
  }
  if(n === 3){
    if(!S.proj.slots.length) return setStep(1);
    if(!S.proj.easyBuilt) applyGroupsNow();
    S.mode = 'anim';
    B.appendChild(el('div', 'ez-say', 'さわると その 動きで 再生します。気に入ったら ④ 書き出し へ。'));
    const g = el('div', 'ez-grid');
    WHOLE.forEach(m => {
      const b = mkBtn('', () => { applyWhole(m); g.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }, 'mv');
      b.append(el('i', null, m.icon), el('span', null, m.name));
      if(S.proj.current && S.proj.current.startsWith(m.name.replace(/（.*）/, ''))) b.classList.add('on');
      g.appendChild(b);
    });
    B.appendChild(g);
    const r = el('div', 'ez-row');
    r.append(mkBtn('⏯ 再生 ／ 止める', () => { S.playing = !S.playing; S.mode = 'anim'; refreshUI(); }, 'btn ez-big'),
             mkBtn('つぎへ ▶ 書き出し', () => setStep(4), 'btn btn-g ez-big'));
    B.appendChild(r);
    S.playing = true;
  }
  if(n === 4){
    S.mode = 'anim'; S.playing = true;
    B.appendChild(el('div', 'ez-say', 'いまの 動き「' + S.proj.current + '」を 書き出します。'));
    const r = el('div', 'ez-row');
    r.append(mkBtn('🎬 アニメ工房へ 送る', sendToKobo, 'btn btn-y ez-big'),
             mkBtn('📼 動画工房へ 送る', sendToDouga, 'btn ez-big'),
             mkBtn('🎞 動画で 保存', () => saveVideo(true), 'btn ez-big'));
    B.appendChild(r);
  }
  refreshUI();
  requestAnimationFrame(easyFit);
}

/** 絵を、下の 板に かくれない ところへ 合わせる */
function easyFit(){
  if(!E.on) return;
  const c = S.proj.canvas, vr = $('#view').getBoundingClientRect(), pr = easyUI.wrap.getBoundingClientRect();
  const dpr = cv.width / (vr.width || 1);
  const freeH = Math.max(120, (pr.top - vr.top) - 16) * dpr, W = cv.width;
  const z = Math.min(W / c.w, freeH / c.h) * 0.94;
  S.view.z = z; S.view.x = (W - c.w * z) / 2; S.view.y = 8 * dpr + (freeH - c.h * z) / 2;
}
addEventListener('resize', () => setTimeout(easyFit, 60));

/** さわった パーツの カード（何と いっしょに 動くか を えらぶ） */
function showPick(){
  const box = $('#ezPick'); if(!box) return;
  box.innerHTML = '';
  if(E.neckMode){ box.appendChild(el('div', 'ez-say strong', '首の 付け根（頭が 回る 中心）を さわって')); return; }
  const sl = slotById(E.pick);
  if(!sl){ box.appendChild(el('div', 'ez-hint', '↑ 絵の パーツを さわると ここで 変えられます')); return; }
  box.appendChild(el('div', 'ez-say strong', '「' + sl.name + '」は …'));
  const r = el('div', 'ez-row wrap');
  GRP_KEYS.forEach(k => {
    const b = mkBtn(GRP[k].icon + ' ' + GRP[k].name, () => {
      edit(sl.name + ' → ' + GRP[k].short, () => { sl.grp = k; S.proj.easyBuilt = false; });
      showPick();
    }, 'btn ez-g' + (sl.grp === k ? ' on' : ''));
    b.style.setProperty('--gc', GRP[k].col);
    r.appendChild(b);
  });
  box.appendChild(r);
}

function applyGroupsNow(){
  edit('つながりを 組み直す', () => { rebuildFromGroups(); S.proj.easyBuilt = true; });
}

/* 絵を さわった とき（かんたんモード） */
cv.addEventListener('pointerdown', e => {
  if(!E.on || e.button !== 0 || S.tapRig || S.shapeEdit) return;
  if(tap.ids.size >= 2) return;
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  if(E.step !== 2) return;
  if(E.neckMode){
    edit('首の 位置', () => { S.proj.easyNeck = { x:w.x, y:w.y }; S.proj.easyBuilt = false; });
    E.neckMode = false;
    applyGroupsNow();
    setStatus('首の 位置を 決めました。頭は ここを 中心に 回ります');
    return showPick();
  }
  const sl = pickSlot(w);
  E.pick = sl ? sl.id : null;
  showPick();
});

/* つながりの 色を 絵に かさねる（手順 2 の とき） */
const _tintC = [];
function tintSheet(i, w, h){
  let c = _tintC[i]; if(!c){ c = _tintC[i] = document.createElement('canvas'); }
  if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  return c;
}
function drawGroupTint(){
  const z = S.view.z, pose = curPose || setupPose(), sp = setupPose();
  const W = cv.width, H = cv.height;
  const c = tintSheet(0, W, H), g = c.getContext('2d');
  GRP_KEYS.forEach(k => {
    const list = S.proj.slots.filter(sl => sl.grp === k && sl.visible && !sl.lidCover && S.imgs[sl.image]);
    if(!list.length) return;
    const t = tintSheet(1, W, H), tg = t.getContext('2d');
    tg.setTransform(z, 0, 0, z, S.view.x, S.view.y);
    list.forEach(sl => { if(!drawRigid(tg, sl, S.imgs[sl.image], pose, sp)){ const b = new Float32Array(sl.verts.length * 2); deformSlot(sl, pose, b); drawSlot(tg, sl, S.imgs[sl.image], b); } });
    tg.setTransform(1,0,0,1,0,0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = GRP[k].col; tg.fillRect(0, 0, W, H);
    g.drawImage(t, 0, 0);
  });
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 0.5; ctx.drawImage(c, 0, 0); ctx.restore();
  // えらんだ パーツの わくと 首の 印
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  const sel = slotById(E.pick);
  if(sel){
    const bx = slotScreenBox(sel, pose);
    if(bx){ const dpr = cv.width / (cv.getBoundingClientRect().width || cv.width), pad = 6 * dpr / z;
      ctx.lineWidth = 6 * dpr / z; ctx.strokeStyle = INK; ctx.strokeRect(bx.x0 - pad, bx.y0 - pad, bx.x1 - bx.x0 + pad * 2, bx.y1 - bx.y0 + pad * 2);
      ctx.lineWidth = 3 * dpr / z; ctx.strokeStyle = MAIN; ctx.strokeRect(bx.x0 - pad, bx.y0 - pad, bx.x1 - bx.x0 + pad * 2, bx.y1 - bx.y0 + pad * 2);
      tag('▶ ' + sel.name + '：' + GRP[sel.grp].short, bx.x0 - pad, bx.y0 - pad - 16 * dpr / z, z, INK); }
  }
  const N = neckPoint(), dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
  ctx.beginPath(); ctx.arc(N.x, N.y, 9 * dpr / z, 0, 7); ctx.fillStyle = MAIN; ctx.fill();
  ctx.lineWidth = 3 * dpr / z; ctx.strokeStyle = INK; ctx.stroke();
  tag('首', N.x + 12 * dpr / z, N.y, z, MAIN);
}
const _render2 = render;
render = function(){
  _render2();
  if(E.on && E.step === 2 && !S.live && !S.rec && S.proj.slots.length) drawGroupTint();
};

/* PSD を 入れたら つながりへ */
const _importPsd1 = importPsd;
importPsd = async function(f){
  await _importPsd1(f);
  if(E.on){ S.proj.slots.forEach(sl => { delete sl.grp; }); S.proj.easyNeck = null; S.proj.easyBuilt = false; setStep(2); }
};
const _addImageFiles1 = addImageFiles;
addImageFiles = function(list){
  _addImageFiles1(list);
  if(E.on) setTimeout(() => setStep(2), 300);
};

/* はじめは かんたんモード（前に「くわしく」に した 人は そのまま） */
(() => {
  let v = null; try{ v = localStorage.getItem('miniSpine.easy'); }catch(_){}
  setEasy(v !== '0');
})();
