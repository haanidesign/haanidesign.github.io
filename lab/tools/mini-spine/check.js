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

/* ---------- 右パネル ---------- */
const _buildProps5 = buildProps;
buildProps = function(){
  _buildProps5();
  const b = checkBone(); if(!b) return;
  const host = $('#props');
  const box = el('div', 'chk-box');
  box.appendChild(el('div', 'hint', '「' + b.name + '」は ピンクの 印を 中心に 回ります。' + (/頭|head/i.test(b.name) ? '\n首の 付け根（あごの 少し 下）に あれば OK。' : '')));
  box.appendChild(btnRow(mkBtn('🔄 ためしに 回す（' + b.name + '）', tryRotate, 'btn btn-y')));
  host.insertBefore(box, host.firstChild);
};
