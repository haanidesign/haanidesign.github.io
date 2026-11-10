/* ミニSpine — ゆがみ（時間ごとに 絵を 手で 引っぱって 形を 変える）
   アニメートで、絵を 指で 押して 引っぱると その 時間に「ゆがみの キー」が 入る。
   キーと キーの あいだは なめらかに つなぐ（くり返す ときも さいごから さいしょへ）。
   覚えるのは 点ごとの ずれ だけ：a.warps[パーツid] = [{ t:秒, d:[dx,dy, …] }, …]
   骨の 動きとも いっしょに 効く（ずれは 骨の 向きに あわせて 回して 足す）。 */
'use strict';

const smooth01 = x => x * x * (3 - 2 * x);

/** いま 描いて いる アニメの、その 時こくの ずれ（なければ null） */
function warpAt(slot){
  const a = PAINT_AT.a, t = PAINT_AT.t;
  if(!a || t === null || !a.warps) return null;
  return warpOffsets(a, slot, t);
}
function warpOffsets(a, slot, t){
  const ks = a.warps && a.warps[slot.id];
  if(!ks || !ks.length) return null;
  const n = slot.verts.length * 2;
  if(ks.length === 1) return ks[0].d.length === n ? ks[0].d : null;
  // t を はさむ 2つの キー（くり返す アニメは さいごの キー → さいしょの キーへ つなぐ）
  let A = null, B = null, f = 0;
  for(let i = 0; i < ks.length; i++){
    if(ks[i].t <= t + 1e-6) A = ks[i]; else { B = ks[i]; break; }
  }
  const loop = a.loop !== false;
  if(!A){ A = loop ? ks[ks.length - 1] : ks[0]; B = ks[0]; const span = loop ? (a.dur - A.t) + B.t : 0; f = span > 1e-6 ? ((t + a.dur - A.t) % a.dur) / span : 1; }
  else if(!B){ if(!loop) return A.d; B = ks[0]; const span = (a.dur - A.t) + B.t; f = span > 1e-6 ? (t - A.t) / span : 0; }
  else f = (t - A.t) / Math.max(1e-6, B.t - A.t);
  f = smooth01(Math.max(0, Math.min(1, f)));
  if(A.d.length !== n || B.d.length !== n) return null;
  const out = new Array(n);
  for(let i = 0; i < n; i++) out[i] = A.d[i] + (B.d[i] - A.d[i]) * f;
  return out;
}
function setWarpKey(a, slot, t, d){
  a.warps = a.warps || {};
  const ks = a.warps[slot.id] = a.warps[slot.id] || [];
  const tt = +t.toFixed(3);
  // はじめての キーが 0秒 以外なら、0秒に「ふつうの 形」の キーを 足す（そこから ゆがんで もどる）
  if(!ks.length && tt > 1e-3) ks.push({ t: 0, d: new Array(d.length).fill(0) });
  const i = ks.findIndex(k => Math.abs(k.t - tt) < 1e-3);
  const rec = { t: tt, d: d.map(v => +v.toFixed(2)) };
  if(i >= 0) ks[i] = rec; else { ks.push(rec); ks.sort((x, y) => x.t - y.t); }
}

/* ---------- 画面の 上の バー ---------- */
const warpBar = (() => {
  const bar = el('div'); bar.id = 'warpBar';
  const msg = el('div', 'sb-msg');
  const row1 = el('div', 'sb-row');
  const r = el('input'); r.type = 'range'; r.min = 10; r.max = 400; r.step = 1;
  const lab = el('label', 'sb-l'); lab.append(el('span', null, '筆の 大きさ'), r);
  row1.appendChild(lab);
  const keys = el('div', 'warp-keys');
  const row2 = el('div', 'sb-row');
  row2.append(
    mkBtn('ピンを 細かく', () => warpFine(), 'btn btn-sm'),
    mkBtn('この 時間の ゆがみを 消す', () => warpClearHere(), 'btn btn-sm'),
    mkBtn('ぜんぶ 消す', () => warpClearAll(), 'btn btn-sm danger'),
    mkBtn('おわり', () => warpEnd(), 'btn btn-sm btn-y'));
  bar.append(msg, row1, keys, row2);
  $('#view').appendChild(bar);
  r.oninput = () => { if(S.warpEdit) S.warpEdit.r = +r.value; };
  return { bar, msg, r, keys };
})();

function warpSlot(){ return S.warpEdit && slotById(S.warpEdit.slot); }
function warpShow(){
  const sl = warpSlot(); if(!sl) return;
  const a = anim();
  warpBar.msg.textContent = '🫠 ゆがみ「' + sl.name + '」 ' + S.time.toFixed(2) + '秒 … 絵を 押して 引っぱる。時間を 進めて また 引っぱると 動きに なります';
  const ks = (a.warps && a.warps[sl.id]) || [];
  warpBar.keys.innerHTML = '';
  warpBar.keys.appendChild(el('span', 'wk-l', 'キー:'));
  if(!ks.length) warpBar.keys.appendChild(el('span', 'wk-none', 'まだ ありません'));
  ks.forEach(k => {
    const b = mkBtn(k.t.toFixed(2) + '秒', () => { S.time = k.t; S.playing = false; refreshUI(); warpShow(); }, 'btn mini' + (Math.abs(k.t - S.time) < 1e-3 ? ' on' : ''));
    warpBar.keys.appendChild(b);
  });
}
function warpStart(){
  const sl = slotById(S.sel.slot);
  if(!sl) return setStatus('ゆがませたい パーツ（レイヤー）を 先に えらんでね');
  S.mode = 'anim'; S.playing = false;
  const c = S.proj.canvas;
  S.warpEdit = { slot: sl.id, r: Math.round(Math.max(c.w, c.h) * 0.05), grab: null, at: null };
  warpBar.r.max = Math.round(Math.max(c.w, c.h) * 0.2);
  warpBar.r.value = S.warpEdit.r;
  document.body.classList.add('warping');
  warpShow(); refreshUI();
}
function warpEnd(){ S.warpEdit = null; document.body.classList.remove('warping'); refreshUI(); setStatus('ゆがみを おわりました'); }
function warpClearHere(){
  const sl = warpSlot(), a = anim(); if(!sl || !a.warps || !a.warps[sl.id]) return;
  edit('ゆがみの キーを 消す', () => {
    a.warps[sl.id] = a.warps[sl.id].filter(k => Math.abs(k.t - S.time) > 1e-3);
    if(!a.warps[sl.id].length) delete a.warps[sl.id];
  });
  warpShow();
}
function warpClearAll(){
  const sl = warpSlot(), a = anim(); if(!sl) return;
  if(!confirm('「' + sl.name + '」の この アニメの ゆがみを ぜんぶ 消します')) return;
  edit('ゆがみを ぜんぶ 消す', () => { if(a.warps) delete a.warps[sl.id]; });
  warpShow();
}
/** 点を ふやす（点の ならびが 変わる ので、その パーツの ゆがみは 消える） */
function warpFine(){
  const sl = warpSlot(); if(!sl) return;
  const had = Object.values(S.proj.anims).some(a => a.warps && a.warps[sl.id]);
  if(had && !confirm('点を ふやすと、この パーツの ゆがみは 消えます。いいですか？')) return;
  edit('ピンを 細かく', () => {
    const b = slotBox(sl);
    const step = Math.max(6, S.warpEdit.r * 0.35);
    remesh(sl, clamp(Math.round(b.w / step), 10, 36), clamp(Math.round(b.h / step), 10, 44));
    for(const nm in S.proj.anims){ const a = S.proj.anims[nm]; if(a.warps) delete a.warps[sl.id]; }
  });
  setStatus('点を ふやしました'); warpShow();
}

/* ---------- 筆（つかんで 引っぱる） ----------
   いまの ゆがみ（その 時間の 形）から 引っぱり、その 時間に キーを 入れる。
   引っぱる 量は 画面の 向き → 骨の 向きに もどして ずれに する */
cv.addEventListener('pointerdown', e => {
  const we = S.warpEdit;
  if(!we || e.button !== 0) return;
  if(e.pointerType === 'touch' && tap.ids.size >= 2){ we.grab = null; return; }   // 2本目の 指は 画面の 移動
  const sl = warpSlot(); if(!sl) return;
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  const a = anim(); S.playing = false;
  const pose = curPose || setupPose(), sp = setupPose();
  // いま 見えて いる 点の 場所（骨 ＋ ゆがみ）
  const n = sl.verts.length, buf = new Float32Array(n * 2);
  deformSlot(sl, pose, buf);
  const cur = warpOffsets(a, sl, S.time) || new Array(n * 2).fill(0);
  const id = rigidBone(sl) || sl.bone, p = pose[id], s0 = sp[id];
  const m = (p && s0) ? M.mul(p.world, M.inv(s0.world)) : M.ident();
  const im = M.inv({ a:m.a, b:m.b, c:m.c, d:m.d, tx:0, ty:0 });
  const hits = [];
  for(let i = 0; i < n; i++){
    const x = buf[i*2] + m.a * cur[i*2] + m.c * cur[i*2+1], y = buf[i*2+1] + m.b * cur[i*2] + m.d * cur[i*2+1];
    const d = Math.hypot(x - w.x, y - w.y);
    if(d < we.r){ hits.push({ i, wgt: smooth01(1 - d / we.r) }); }
  }
  if(!hits.length){ we.grab = null; return; }
  beginEdit('ゆがみ');
  we.grab = { w0: w, hits, base: cur.slice(), im, id: e.pointerId };
});
addEventListener('pointermove', e => {
  const we = S.warpEdit; if(!we) return;
  const { sx, sy } = evPos(e);
  we.at = s2w(sx, sy);
  const g = we.grab; if(!g || e.pointerId !== g.id) return;
  if(tap.ids.size >= 2){ we.grab = null; return; }
  const sl = warpSlot(), a = anim();
  const dx = we.at.x - g.w0.x, dy = we.at.y - g.w0.y;
  const lx = g.im.a * dx + g.im.c * dy, ly = g.im.b * dx + g.im.d * dy;   // 骨の 向きに もどす
  const d = g.base.slice();
  g.hits.forEach(h => { d[h.i*2] += lx * h.wgt; d[h.i*2+1] += ly * h.wgt; });
  setWarpKey(a, sl, S.time, d);
});
addEventListener('pointerup', e => {
  const we = S.warpEdit; if(!we || !we.grab || e.pointerId !== we.grab.id) return;
  we.grab = null; commitEdit(); warpShow();
});

/* 点と 筆の 輪 */
function drawWarpHints(){
  const we = S.warpEdit; if(!we || S.playing) return;
  const sl = warpSlot(); if(!sl) return;
  const z = S.view.z, pose = curPose || setupPose(), sp = setupPose(), a = anim();
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  const n = sl.verts.length, buf = new Float32Array(n * 2);
  deformSlot(sl, pose, buf);
  const off = warpOffsets(a, sl, S.time);
  if(off) addOffsets(sl, buf, pose, sp, off, 1);
  ctx.fillStyle = 'rgba(30,28,20,.5)';
  for(let i = 0; i < n; i++){ ctx.beginPath(); ctx.arc(buf[i*2], buf[i*2+1], 2.2 / z, 0, 7); ctx.fill(); }
  if(we.at){
    ctx.beginPath(); ctx.arc(we.at.x, we.at.y, we.r, 0, 7);
    ctx.lineWidth = 2 / z; ctx.strokeStyle = we.grab ? MAIN_DEEP : INK; ctx.setLineDash([5 / z, 4 / z]); ctx.stroke(); ctx.setLineDash([]);
  }
}
const _renderW = render;
render = function(){
  _renderW();
  if(S.warpEdit && !S.live && !S.rec) drawWarpHints();
};
// 時間や パーツが 変わったら バーを 更新
const _refreshUIW = refreshUI;
refreshUI = function(){ _refreshUIW(); if(S.warpEdit) warpShow(); };

/* 大きさ・はやさ（tune.js）で 長さが 変わっても、ゆがみの キーの 時間を あわせる */
if(typeof applyTune === 'function'){
  const _applyTune0 = applyTune;
  applyTune = function(a, amt, spd){
    const d0 = a.dur;
    _applyTune0(a, amt, spd);
    if(a.warps && d0 && a.dur !== d0){
      const k = a.dur / d0;
      for(const id in a.warps) a.warps[id].forEach(x => { x.t = +(x.t * k).toFixed(3); });
      a.tuneSig = TUNE_SIG(a);
    }
  };
}

/* ボタン: ツールの 枠と、パーツを えらんだ ときの 右パネル */
(() => {
  const b = el('button', 'opt', '🫠 ゆがみ'); b.id = 'btnWarp';
  b.title = 'アニメートで 絵を 指で 引っぱって 形を 変える（時間ごとに キー）';
  b.onclick = () => S.warpEdit ? warpEnd() : warpStart();
  const after = $('#btnShape') || $('#btnSpring');
  after.after(b);
})();
const _buildPropsW = buildProps;
buildProps = function(){
  _buildPropsW();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props');
  const box = el('div', 'warp-box');
  box.appendChild(btnRow(mkBtn(S.warpEdit ? '🫠 ゆがみを おわる' : '🫠 この 絵を ゆがませる（アニメート）', () => S.warpEdit ? warpEnd() : warpStart(), 'btn')));
  host.insertBefore(box, host.firstChild);
};
