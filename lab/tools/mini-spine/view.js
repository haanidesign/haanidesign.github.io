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
