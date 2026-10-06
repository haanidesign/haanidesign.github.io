/* ミニSpine — 見る ための 道具
   ↔ 反転 … 画面を 左右 反対に して バランスを 見る（絵や データは 変えない）
   🔒 レイヤー固定 … 左の 一覧で えらんだ レイヤーは、画面を さわっても ほかの レイヤーに 切りかわらない。
                     ゆがみ・メッシュ・移動 などで 上の 絵を さわって しまう のを ふせぐ。 */
'use strict';

S.flip = false;
function setFlip(on){
  S.flip = on;
  cv.style.transform = on ? 'scaleX(-1)' : '';
  const b = $('#btnFlip'); if(b) b.classList.toggle('btn-y', on);
  setStatus(on ? '左右 反転して 見ています（絵は 変わりません）' : '反転を もどしました');
}
(() => {
  const b = el('button', 'btn btn-sm', '↔ 反転'); b.id = 'btnFlip';
  b.title = '画面を 左右 反対に して バランスを 見る';
  b.onclick = () => setFlip(!S.flip);
  const p = $('#btnFaces') || $('#btnPreset'); if(p) p.after(b);
})();

/* ---------- レイヤー固定 ---------- */
S.lockSlot = false;
const _pickSlotL = pickSlot;
pickSlot = function(w){
  const hit = _pickSlotL(w);
  // 固定中は、どこを さわっても（絵の 上なら）えらんだ レイヤーの まま。
  // 「くっつける」など 絵を えらぶ 手順の ときは ふつうに えらぶ
  if(hit && S.lockSlot && !S.tapRig && slotById(S.sel.slot)) return slotById(S.sel.slot);
  return hit;
};
// 一覧から えらんだ ときだけ 固定。骨を えらんだら はずす
const lockFrom = ev => {
  const it = ev.target.closest('.item'); if(!it || ev.target.closest('.eye')) return;
  setTimeout(() => {
    S.lockSlot = !!S.sel.slot && (it.classList.contains('slot') || it.closest('#orderBody') !== null);
    lockChip();
  }, 0);
};
['#treeBody', '#orderBody'].forEach(q => { const h = $(q); if(h) h.addEventListener('click', lockFrom); });

const chip = el('div', 'lock-chip'); chip.style.display = 'none';
const chipTx = el('span'); const chipX = el('button', 'btn btn-sm', 'はずす');
chipX.onclick = () => { S.lockSlot = false; lockChip(); };
chip.append(chipTx, chipX);
(document.querySelector('#view') || document.body).appendChild(chip);
function lockChip(){
  const sl = slotById(S.sel.slot);
  if(!sl) S.lockSlot = false;
  chip.style.display = S.lockSlot ? '' : 'none';
  if(sl) chipTx.textContent = '🔒「' + sl.name + '」だけ さわる';
}
const _refreshUIL = refreshUI;
refreshUI = function(){ _refreshUIL(); lockChip(); };

/* 固定中に 骨を さわる（アニメートなど）ときは、その レイヤーに ついた 骨だけ */
const _pickBoneL = pickBone;
pickBone = function(w){
  const hit = _pickBoneL(w);
  const sl = S.lockSlot && !S.tapRig && slotById(S.sel.slot);
  if(!sl || !hit) return hit;
  return slotBones(sl).ids.includes(hit.id) ? hit : null;
};

/* ---------- 揺れ物理の ON/OFF を 作品に しまう ----------
   まえは 画面だけの 切りかえで、ひらき直すと OFF に もどって いた。
   S.spring を 作品（S.proj.spring）に つなぐ。まえの 作品は、揺れる 骨が あれば ON */
Object.defineProperty(S, 'spring', {
  configurable: true,
  get(){
    const p = S.proj; if(!p) return false;
    if(p.spring === undefined) return (p.bones || []).some(b => b.spring);
    return !!p.spring;
  },
  set(v){ if(S.proj){ S.proj.spring = !!v; if(typeof saveSoon === 'function') saveSoon(); } }
});

/* ================= 絵 そのものを 左右 反転 =================
   キャラ ぜんぶ … 絵・骨・動き・くっつけ を 画面の まんなかで 鏡に うつす
   えらんだ 絵   … その 絵の 形だけ、その 絵の まんなかで 左右 反対に
   骨の 計算: 鏡を R、骨の 中の 向きの 鏡を Q（y を 反対）と すると、
     新しい 世界 = R・いまの 世界・Q
     根もとの 骨: x → 2cx − x、角度 → 180 − 角度、シアー → −シアー
     子の 骨  : y → −y、角度 → −角度、シアー → −シアー
   動きの キーは 差分なので、角度・シアーは −、x は 根もとだけ −、y は 子だけ − */
function flipAll(){
  const cx = S.proj.canvas.w / 2;
  edit('キャラを 左右 反転', () => {
    S.proj.bones.forEach(b => {
      if(!b.parent){ b.x = 2 * cx - b.x; b.rot = 180 - b.rot; }
      else { b.y = -b.y; b.rot = -b.rot; }
      b.shear = -(b.shear || 0);
    });
    const isRoot = id => { const b = boneById(id); return !b || !b.parent; };
    for(const n in S.proj.anims){
      const a = S.proj.anims[n];
      const fix = tracks => { for(const id in tracks){ const t = tracks[id], root = isRoot(id);
        ['rot', 'shear'].forEach(ch => (t[ch] || []).forEach(k => { k.v = -k.v; }));
        if(root) (t.x || []).forEach(k => { k.v = -k.v; }); else (t.y || []).forEach(k => { k.v = -k.v; }); } };
      fix(a.tracks || {});
      if(a.base && a.base.tracks) fix(a.base.tracks);
      if(a.warps) for(const id in a.warps) a.warps[id].forEach(w => { for(let i = 0; i < w.d.length; i += 2) w.d[i] = -w.d[i]; });
    }
    S.proj.slots.forEach(s => s.verts.forEach(v => { v.x = 2 * cx - v.x; }));
    (S.proj.pins || []).forEach(p => { if(p.fl) p.fl.y = -p.fl.y; if(p.tl) p.tl.y = -p.tl.y; if(p.al) p.al.y = -p.al.y; });
    (S.proj.iks || []).forEach(k => { k.bendPositive = !k.bendPositive; });
    markDirty();
  });
  S.springState = {}; refreshUI();
  setStatus('キャラを 左右 反転しました（もどすときは もう いちど か ↶）');
}
function flipPart(sl){
  const b = slotBox(sl), cx = b.cx;
  edit('「' + sl.name + '」を 左右 反転', () => { sl.verts.forEach(v => { v.x = 2 * cx - v.x; }); markDirty(); });
  refreshUI();
  setStatus('「' + sl.name + '」を 左右 反転しました');
}
function openFlip(){
  sheet.show('↔ 反転', body => {
    const sl = slotById(S.sel.slot);
    const g = el('div', 'sh-grid wide');
    const big = (icon, ttl, note, fn) => { const b = mkBtn('', () => { sheet.hide(); fn(); }, 'mv wide'); b.append(el('i', null, icon), el('span', null, ttl), el('small', null, note)); g.appendChild(b); };
    big('👀', S.flip ? '画面の 反転を もどす' : '画面だけ 反転（見るだけ）', 'バランスを 見る ため。絵や 書き出しは 変わらない。', () => setFlip(!S.flip));
    big('🧍', 'キャラ ぜんぶを 反転', '絵・骨・つけた 動き まで まるごと 左右 反対に する。', flipAll);
    if(sl) big('🖼', '「' + sl.name + '」だけ 反転', 'えらんだ 絵の 形だけ 左右 反対に する（場所は そのまま）。', () => flipPart(sl));
    else g.appendChild(el('div', 'sh-note', '絵を 1まい えらぶと、その 絵だけ 反転も できます。'));
    body.appendChild(g);
  });
}
$('#btnFlip').onclick = openFlip;
