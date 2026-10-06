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

/* ---------- 絵を 消す（右パネルの 上に 🗑） ----------
   消した 絵を、差分・表情・くっつけ・クリップ からも はずす */
function deletePart(sl){
  if(!confirm('「' + sl.name + '」を 消しますか？（↶ で もどせます）')) return;
  edit('絵を 消す', () => {
    const id = sl.id;
    S.proj.slots = S.proj.slots.filter(s => s !== sl);
    (S.proj.sets || []).forEach(st => { st.slots = st.slots.filter(x => x !== id); if(st.def === id) st.def = st.slots[0]; });
    S.proj.sets = (S.proj.sets || []).filter(st => st.slots.length >= 2);
    (S.proj.faces || []).forEach(f => { if(f.show) f.show = f.show.filter(x => x !== id); });
    S.proj.pins = (S.proj.pins || []).filter(p => p.slot !== id && p.tslot !== id && !(p.tri && p.tri.s === id));
    S.proj.slots.forEach(s => { if(s.clipTo === id) s.clipTo = null; });
    for(const n in S.proj.anims){ const a = S.proj.anims[n]; if(a.warps) delete a.warps[id]; }
    S.sel.slot = null; S.lockSlot = false;
  });
  refreshUI();
  setStatus('「' + sl.name + '」を 消しました');
}
const _buildPropsD = buildProps;
buildProps = function(){
  _buildPropsD();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props');
  const row = btnRow(mkBtn('🗑 この 絵を 消す', () => deletePart(sl), 'btn btn-sm danger'));
  host.insertBefore(row, host.firstChild);
};

/* ---------- 絵を さしかえる ----------
   おなじ 場所・おなじ 大きさに 新しい 画像を はめる。骨・動き・重み は そのまま。
   いまの 絵の「画像の 点 → 画面の 点」を 頂点から もとめて、新しい 画像を その 四角に のせる。
   網は 新しい 画像の 形で 作り直し、重みは いちばん 近い もとの 頂点から もらう。 */
function fitPlace(verts){
  // x = a·u + c·v + tx,  y = b·u + d·v + ty を 最小二乗で
  let S00=0,S01=0,S02=0,S11=0,S12=0,S22=0, X0=0,X1=0,X2=0, Y0=0,Y1=0,Y2=0;
  verts.forEach(p => { const u = p.u, v = p.v;
    S00+=u*u; S01+=u*v; S02+=u; S11+=v*v; S12+=v; S22+=1;
    X0+=u*p.x; X1+=v*p.x; X2+=p.x; Y0+=u*p.y; Y1+=v*p.y; Y2+=p.y; });
  const A = [[S00,S01,S02],[S01,S11,S12],[S02,S12,S22]];
  const solve = r => { const m = A.map((row, i) => row.concat([r[i]]));
    for(let i = 0; i < 3; i++){ let p = i; for(let j = i + 1; j < 3; j++) if(Math.abs(m[j][i]) > Math.abs(m[p][i])) p = j;
      [m[i], m[p]] = [m[p], m[i]]; const d = m[i][i] || 1e-9;
      for(let j = 0; j < 3; j++) if(j !== i){ const f = m[j][i] / d; for(let k = i; k < 4; k++) m[j][k] -= f * m[i][k]; } }
    return [m[0][3] / (m[0][0] || 1e-9), m[1][3] / (m[1][1] || 1e-9), m[2][3] / (m[2][2] || 1e-9)]; };
  const [a, c, tx] = solve([X0, X1, X2]), [b, d, ty] = solve([Y0, Y1, Y2]);
  return { a, b, c, d, tx, ty };
}
function replaceImage(sl, file){
  const rd = new FileReader();
  rd.onload = () => {
    const src = rd.result, img = new Image();
    img.onload = () => {
      const old = S.proj.images[sl.image] || {};
      const W1 = old.w || img.naturalWidth, H1 = old.h || img.naturalHeight;
      const P = fitPlace(sl.verts);
      // 新しい 画像を もとの 画像の 四角に ひきのばして のせる
      const k = { a: W1 / img.naturalWidth, b: 0, c: 0, d: H1 / img.naturalHeight, tx: 0, ty: 0 };
      const place = M.mul(P, k);
      edit('「' + sl.name + '」を さしかえ', () => {
        const id = uid('img');
        S.proj.images[id] = { id, name: file.name, src, w: img.naturalWidth, h: img.naturalHeight };
        S.imgs[id] = img;
        const m = buildGridMesh(img, S.meshRes.cols, S.meshRes.rows, place);
        const ov = sl.verts;
        m.verts.forEach(v => {
          let best = null, bd = 1e18;
          ov.forEach(o => { const d = (o.x - v.x) ** 2 + (o.y - v.y) ** 2; if(d < bd){ bd = d; best = o; } });
          v.w = best && best.w ? best.w.map(x => ({ b: x.b, w: x.w })) : [];
        });
        sl.image = id; sl.verts = m.verts; sl.tris = m.tris; sl.bound = false;
        if(sl.shapes) delete sl.shapes;          // 閉じ目の 形は 網が かわるので 作り直し
        if(typeof checkerTris === 'function') checkerTris(sl);
        for(const n in S.proj.anims){ const a = S.proj.anims[n]; if(a.warps) delete a.warps[sl.id]; }
        markDirty();
      });
      refreshUI();
      setStatus('「' + sl.name + '」を さしかえました（骨・動きは そのまま）');
    };
    img.src = src;
  };
  rd.readAsDataURL(file);
}
const repIn = el('input'); repIn.type = 'file'; repIn.hidden = true; document.body.appendChild(repIn);
repIn.onchange = () => { const f = repIn.files[0], sl = slotById(S.sel.slot); repIn.value = ''; if(f && sl) replaceImage(sl, f); };
const _buildPropsR = buildProps;
buildProps = function(){
  _buildPropsR();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props'), first = host.firstChild;
  if(first) first.prepend(mkBtn('🔁 絵を さしかえ', () => repIn.click(), 'btn btn-sm'));
};
