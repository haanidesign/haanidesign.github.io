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
