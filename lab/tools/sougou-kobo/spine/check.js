/* ミニSpine — つなぎ目を 確かめる
   ・えらんだ 骨の 根もとに「回る 中心」の 印を 出す（頭なら ここが 首の 付け根に あれば OK）
   ・「ためしに 回す」… その骨を 左右に 15°ずつ ゆらして 見せる。キーは 入らない（作った アニメは そのまま） */
'use strict';

const CHK = { run: null };

function checkBone(){
  const sl = slotById(S.sel.slot);
  const b = sl ? (slotBones(sl).main || boneById(sl.bone)) : boneById(S.sel.bone);
  return b && b.parent ? b : null;
}

/* ---------- ためしに 回す（2.4秒） ---------- */
function tryRotate(){
  const b = checkBone();
  if(!b) return setStatus('骨か パーツを えらんでね');
  if(CHK.run) return;
  const keepCur = S.proj.current, keepMode = S.mode, keepTime = S.time, keepPlay = S.playing;
  const KEY = '__ためし';
  const a = { dur: 2.4, loop: true, tracks: {} };
  a.tracks[b.id] = { rot: [0, .25, .5, .75, 1].map((f, i) => ({ t: f * 2.4, v: [0, 15, 0, -15, 0][i], c: 'smooth' })) };
  S.proj.anims[KEY] = a;
  S.proj.current = KEY; S.mode = 'anim'; S.time = 0; S.playing = true; S.springState = {};
  CHK.run = { b, end: () => {
    delete S.proj.anims[KEY];
    S.proj.current = keepCur; S.mode = keepMode; S.time = keepTime; S.playing = keepPlay; S.springState = {};
    CHK.run = null; refreshUI();
  } };
  setStatus('「' + b.name + '」を ためしに 回して います（キーは 入りません）');
  setTimeout(() => CHK.run && CHK.run.end(), 2400);
}
// ためし中に 保存や 戻すが 走らない ように、アニメ一覧から かくす
const _snapshotWithImages0 = snapshotWithImages;
snapshotWithImages = function(){
  if(!CHK.run) return _snapshotWithImages0();
  const a = S.proj.anims['__ためし'], cur = S.proj.current;
  delete S.proj.anims['__ためし']; S.proj.current = Object.keys(S.proj.anims)[0];
  try{ return _snapshotWithImages0(); } finally { S.proj.anims['__ためし'] = a; S.proj.current = cur; }
};

/* ---------- 回る 中心の 印 ---------- */
function drawPivot(){
  const b = CHK.run ? CHK.run.b : checkBone(); if(!b) return;
  const pose = curPose; if(!pose || !pose[b.id]) return;
  const z = S.view.z, dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
  const p = pose[b.id].world, x = p.tx, y = p.ty;
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  const R = 16 * dpr / z, L = 26 * dpr / z;
  ctx.lineWidth = 6 * dpr / z; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
  ctx.lineWidth = 3 * dpr / z; ctx.strokeStyle = PINK;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
  tag('回る 中心（' + b.name + '）', x + L + 6 * dpr / z, y, z, PINK);
}
const _render3 = render;
render = function(){
  _render3();
  if(!S.live && !S.rec && !S.tapRig && !S.shapeEdit && (!S.playing || CHK.run)) drawPivot();
};


/* ---------- 体が 1まいの 絵の とき、首を 曲げる ----------
   首の 付け根（肩の あいだ）を 1回 さわる と、
   ・体の 絵の 首の ところを、付け根から あごへ むかって だんだん 頭に つける
   ・頭の 回る 中心を 首の とちゅうへ
   ・首が なめらかに 曲がる ように 体の 絵の 点を 細かく する */
const NECK1_STEPS = [{ key:'jp', say:'首の 付け根（肩の あいだ）を さわって', skip:false }];
function neckOneStart(){
  if(!headBone()) return setStatus('「頭」の 骨が 見つかりません（かんたん設定で 全身を 先に）');
  S.tapRig = { i:0, pts:{}, kind:'neck1', steps: NECK1_STEPS };
  S.mode = 'setup'; S.playing = false;
  document.body.classList.add('taprig');
  tapShow(); refreshUI();
}
const _tapEnd1 = tapEnd;
tapEnd = function(ok){
  const r = S.tapRig;
  if(!r || r.kind !== 'neck1') return _tapEnd1(ok);
  S.tapRig = null; document.body.classList.remove('taprig');
  if(ok && r.pts.jp) buildNeckOne(r.pts.jp);
  refreshUI();
};
function buildNeckOne(J){
  const head = headBone(); if(!head) return;
  const face = S.proj.slots.find(sl => /^(顔|face|輪郭)$/i.test(sl.name)) || S.proj.slots.find(sl => /顔|face|輪郭/i.test(sl.name) && !/差分/.test(sl.name));
  const fb = face ? slotBox(face) : null;
  // あご ＝ 顔の 下はし（なければ 付け根の 少し 上）
  const chinY = fb ? Math.min(fb.y1, J.y - 10) : J.y - 120;
  const neckLen = Math.max(20, J.y - chinY);
  const halfW = fb ? fb.w * 0.32 : neckLen * 0.6;
  // 頭の 子孫は 対象外。首の 付け根の 上に かかって いる 体の 絵 だけ
  const inHead = sl => { let b = boneById(slotBones(sl).main ? slotBones(sl).main.id : sl.bone); while(b){ if(b.id === head.id) return true; b = boneById(b.parent); } return false; };
  const targets = S.proj.slots.filter(sl => sl.verts.length && !inHead(sl) && (() => { const b = slotBox(sl); return b.x0 < J.x && b.x1 > J.x && b.y0 < J.y - neckLen * 0.2 && b.y1 > J.y; })());
  if(!targets.length) return setStatus('首の ところに かかって いる 体の 絵が 見つかりませんでした');
  let names = [];
  edit('首を 曲げる', () => {
    // 回る 中心: 付け根と あごの まんなか
    const P = { x: J.x, y: J.y - neckLen * 0.5 };
    moveBoneKeep(head, P, { x: P.x, y: fb ? Math.min(fb.y0, P.y - 20) : P.y - neckLen * 3 });
    markDirty();
    targets.forEach(sl => {
      if(sl.verts.length < 300){
        const b = slotBox(sl);
        remesh(sl, clamp(Math.round(b.w / (neckLen * 0.18)), 10, 32), clamp(Math.round(b.h / (neckLen * 0.18)), 10, 40));
      }
      const base = boneById(slotBones(sl).main ? slotBones(sl).main.id : sl.bone) || S.proj.bones[0];
      sl.bone = base.id;
      sl.verts.forEach(v => {
        const up = (J.y - v.y) / neckLen;                 // 付け根 0 → あご 1
        const side = Math.abs(v.x - J.x) / halfW;          // 首の はばの 外は 動かさない
        let t = Math.max(0, Math.min(1, up)); t = t * t * (3 - 2 * t);
        let s2 = Math.max(0, Math.min(1, 1.6 - side)); s2 = s2 * s2 * (3 - 2 * s2);
        const w = Math.min(0.95, t * s2);
        v.w = w < 0.01 ? [{ b: base.id, w: 1 }] : [{ b: base.id, w: 1 - w }, { b: head.id, w }];
      });
      names.push(sl.name);
    });
    markDirty();
    S.sel = { bone: head.id, slot: null, ik: null };
  });
  setStatus('首を 曲がる ように しました（' + names.join('・') + '）。「🔄 ためしに 回す」で 確かめてね');
}

/* ---------- 右パネル ---------- */
const _buildProps5 = buildProps;
buildProps = function(){
  _buildProps5();
  const b = checkBone(); if(!b) return;
  const host = $('#props');
  const box = el('div', 'chk-box');
  box.appendChild(el('div', 'hint', '「' + b.name + '」は ピンクの 印を 中心に 回ります。' + (/頭|head/i.test(b.name) ? '\n首の 付け根（あごの 少し 下）に あれば OK。' : '')));
  box.appendChild(btnRow(mkBtn('🔄 ためしに 回す（' + b.name + '）', tryRotate, 'btn btn-y')));
  // 子が いる 骨なら、先まで まとめて ゆらす
  if(childMap(S.proj)[b.id]) box.appendChild(btnRow(mkBtn('🖐 ぶらぶら（' + b.name + ' から 先まで）', () => {
    S.sel = { bone: b.id, slot: null, ik: null };
    applyOne(ONE.find(m => m.name === 'ぶらぶら（先まで）'));
  }, 'btn')));
  if(/頭|head/i.test(b.name)) box.appendChild(btnRow(mkBtn('🧣 首を 曲げる（体が 1まいの 絵）', neckOneStart, 'btn')));
  host.insertBefore(box, host.firstChild);
};

/* ---------- 骨と 絵の ずれ を 起こさない ----------
   曲がる パーツは「動かす まえの 形で どの 点が どの 骨に つくか」を おぼえて 描く（bind）。
   これが 編集の あとで 古い まま 残ると、骨と 絵が ずれる（曲げない パーツは 毎回 計算 なので ずれない）。
   なので 毎コマ おぼえ直す。セットアップの 形が 変わった とき だけ 計算する ので かるい。 */
let _bindSig = '';
const _render4 = render;
render = function(){
  const sig = JSON.stringify(S.proj.bones.map(b => [b.id, b.parent, b.x, b.y, b.rot, b.sx, b.sy, b.shear])) + '|' +
    S.proj.slots.map(sl => sl.id + ':' + sl.bone + ':' + sl.verts.length + ':' + (sl.verts[0] && sl.verts[0].bind ? 1 : 0)).join(',');
  if(sig !== _bindSig || (S.proj.slots.some(sl => !sl.bound))){ rebindAll(); _bindSig = sig; }
  _render4();
};
/* ウェイトを 変える 操作の あとも おぼえ直す（重さが 変わっても 上の しるしは 変わらない ため） */
const _commitEdit2 = commitEdit;
commitEdit = function(){ _commitEdit2(); rebindAll(); };

/* ---------- セットアップで 骨の 先っぽを つまむ ----------
   先の 四角を 引っぱると、長さと 向きが 変わる（絵も 子の 骨も 動かない）。
   長すぎる 骨を ひじや 手首まで 引き戻す、など。 */
const TIP = { drag: null };
function tipAt(w){
  if(S.mode !== 'setup' || !['pose', 'rotate', 'translate', 'scale'].includes(S.tool) || S.tapRig || S.shapeEdit) return null;
  const sp = setupPose(), R = 18 * (cv.width / (cv.getBoundingClientRect().width || cv.width)) / S.view.z;
  let best = null, bd = R;
  // えらんで いる 骨を 優先
  const order = S.proj.bones.slice().sort((a, b) => (b.id === S.sel.bone) - (a.id === S.sel.bone));
  for(const b of order){
    if(!b.parent) continue;
    const p = sp[b.id]; if(!p) continue;
    const t = M.apply(p.world, b.len, 0);
    const d = Math.hypot(t.x - w.x, t.y - w.y) - (b.id === S.sel.bone ? R * 0.5 : 0);
    if(d < bd){ bd = d; best = b; }
  }
  return best;
}
cv.addEventListener('pointerdown', e => {
  // 2本目の 指（画面の 移動）の ときは つままない
  if(e.button !== 0 || (e.pointerType === 'touch' && tap.ids.size >= 1)) return;
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  const b = tipAt(w); if(!b) return;
  e.stopImmediatePropagation(); e.preventDefault();
  S.sel = { bone: b.id, slot: null, ik: null };
  const p = setupPose()[b.id].world;
  beginEdit(b.name + ' の 長さ・向き');
  TIP.drag = { b, root: { x: p.tx, y: p.ty }, id: e.pointerId };
  refreshUI();
}, true);
addEventListener('pointermove', e => {
  const d = TIP.drag; if(!d || e.pointerId !== d.id) return;
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  if(Math.hypot(w.x - d.root.x, w.y - d.root.y) < 4) return;
  moveBoneKeep(d.b, d.root, w);
  markDirty();
  setStatus(d.b.name + ': 長さ ' + Math.round(d.b.len));
});
const tipUp = e => { if(!TIP.drag || (e && e.pointerId !== TIP.drag.id)) return; TIP.drag = null; commitEdit(); refreshUI(); };
addEventListener('pointerup', tipUp);
addEventListener('pointercancel', tipUp);

/* 先っぽの つまみを 描く（セットアップの とき） */
function drawTips(){
  if(S.mode !== 'setup' || !S.show.bones || S.live || S.rec || S.tapRig || S.shapeEdit || S.tool === 'create' || S.tool === 'weight') return;
  const sp = setupPose(), z = S.view.z, dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  S.proj.bones.forEach(b => {
    if(!b.parent) return;
    const p = sp[b.id]; if(!p) return;
    const t = M.apply(p.world, b.len, 0), sel = b.id === S.sel.bone, r = (sel ? 7 : 5) * dpr / z;
    ctx.fillStyle = sel ? MAIN : PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2 * dpr / z;
    ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2); ctx.strokeRect(t.x - r, t.y - r, r * 2, r * 2);
  });
}
const _render5 = render;
render = function(){ _render5(); drawTips(); };

/* 親の 先に つなげる */
function snapToParent(b){
  const par = boneById(b.parent); if(!par || !par.parent){ setStatus('親が 全体（root）なので つなげる 先が ありません'); return; }
  const sp = setupPose(), pp = sp[par.id].world, bp = sp[b.id].world;
  const ptip = M.apply(pp, par.len, 0), btip = M.apply(bp, b.len, 0);
  edit(b.name + ' を 親の 先に つなげる', () => { moveBoneKeep(b, ptip, btip); markDirty(); });
  setStatus('「' + b.name + '」の 根もとを「' + par.name + '」の 先に つなげました');
  refreshUI();
}
const _buildProps7 = buildProps;
buildProps = function(){
  _buildProps7();
  if(S.mode !== 'setup') return;
  const b = boneById(S.sel.bone); if(!b || !b.parent || slotById(S.sel.slot)) return;
  const host = $('#props');
  const box = el('div', 'chk-box');
  box.appendChild(el('div', 'hint', '骨の 先の 四角を 引っぱると 長さと 向きが 変わります（絵は 動きません）'));
  const par = boneById(b.parent);
  if(par && par.parent) box.appendChild(btnRow(mkBtn('🔗 「' + par.name + '」の 先に つなげる', () => snapToParent(b), 'btn')));
  host.insertBefore(box, host.firstChild);
};
