/* ミニSpine — 表情の 差分
   おなじ 場所に 描いた 絵（口の 通常・笑顔・あ など）を 1つの 組（差分セット）に まとめて、
   いつも 1まい だけ 見せる。
     セットアップ … ふだん 見せる 絵（def）を えらぶ
     アニメート   … いまの 時間から 切りかわる キーを 入れる（a.sets[組id] = [[秒, slotId], …]）
   kobo.js・map.js の あとに 読む。 */
'use strict';

const SETS = () => (S.proj.sets = S.proj.sets || []);
const setOf = id => SETS().find(st => st.slots.includes(id)) || null;

/** その 時こくに 見せる 絵 */
function activeOpt(st, a, t){
  const ks = a && a.sets && a.sets[st.id];
  if(ks && ks.length && t !== null && t !== undefined){
    let cur = null;
    for(const [kt, sid] of ks){ if(kt <= t + 1e-4) cur = sid; else break; }
    if(cur && st.slots.includes(cur)) return cur;
  }
  return st.slots.includes(st.def) ? st.def : st.slots[0];
}

/* ---------- 描画に くみこむ：組の 中は 1まい だけ ---------- */
const _paintParts0 = paintParts;
paintParts = function(g, pose, sp, k, a, t){
  const sets = SETS();
  if(!sets.length) return _paintParts0(g, pose, sp, k);
  const keepVis = new Map();
  sets.forEach(st => {
    const on = activeOpt(st, a, t);
    st.slots.forEach(id => { const sl = slotById(id); if(!sl) return; keepVis.set(sl, sl.visible); sl.visible = id === on; });
  });
  try{ _paintParts0(g, pose, sp, k); }
  finally{ keepVis.forEach((v, sl) => { sl.visible = v; }); }
};
// 画面と 書き出しから、いまの アニメと 時間を わたす
const _drawParts1 = drawParts;
drawParts = function(pose){
  const useA = (S.mode === 'anim' || S.live);
  _diffCtx = useA ? { a: anim(), t: S.time } : { a: null, t: null };
  _drawParts1(pose);
};
let _diffCtx = { a: null, t: null };
const _paintParts1 = paintParts;
paintParts = function(g, pose, sp, k, a, t){
  if(a === undefined){ a = _diffCtx.a; t = _diffCtx.t; }
  return _paintParts1(g, pose, sp, k, a, t);
};
// 書き出し（renderFrames）では こまの 時刻を わたす
const _renderFrames0 = renderFrames;
renderFrames = function(fps, maxSide, onStep){
  const a = anim(), keep = _diffCtx;
  let i = 0;
  const n = Math.max(2, Math.round(a.dur * fps)), dt = a.dur / n;
  // renderFrames は 1ループ 空回し してから 描く。描く ときの 番号に あわせて 時刻を おく
  const prev = paintParts;
  paintParts = function(g, pose, sp, k){ const t = (i++ % n) * dt; return _paintParts1(g, pose, sp, k, a, t); };
  try{ return _renderFrames0(fps, maxSide, onStep); }
  finally{ paintParts = prev; _diffCtx = keep; }
};

/* ---------- PSD を 入れたら 自動で まとめる ----------
   おなじ グループの 中で、かくして あった 絵が ある か、グループ名が 表情・差分 なら 組に する */
/* 2まいの 絵が「おなじ 場所に、おなじ くらいの 大きさで 重ねて 描いて ある」か。
   大きい ほうの 5わり 以上 かさなる ＝ 大きさも 場所も 近い（顔の 中の 目や 口は ちがう 扱い） */
function sameSpot(a, b){
  const A = slotBox(a), B = slotBox(b);
  const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
  const iy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
  return ix * iy >= 0.5 * Math.max(1, Math.max(A.w * A.h, B.w * B.h));
}
/* おなじ グループの 中で、おなじ 場所に 重なって いて、
   そのうち 1まいでも PSD で かくして あった ものだけを 組に する。
   （まえは グループ まるごと 組に して いたので、頭の 目・眉・口が 1まいしか 出なく なった） */
function autoSets(){
  const by = {};
  S.proj.slots.forEach(sl => {
    const g = sl.gpath && sl.gpath.length ? sl.gpath.join('/') : null;
    if(g) (by[g] = by[g] || []).push(sl);
  });
  let n = 0;
  for(const g in by){
    let rest = by[g].filter(sl => sl.verts.length && !setOf(sl.id));
    while(rest.length >= 2){
      const seed = rest[0];
      const grp = rest.filter(o => o === seed || sameSpot(seed, o));
      rest = rest.filter(o => !grp.includes(o));
      if(grp.length < 2) continue;
      const named = /表情|差分|expression|diff/i.test(g);
      if(!named && !grp.some(sl => sl.psdHidden)) continue;
      const def = grp.find(sl => !sl.psdHidden) || grp[0];
      SETS().push({ id: uid('set'), name: g.split('/').pop(), slots: grp.map(x => x.id), def: def.id });
      grp.forEach(sl => { sl.visible = true; });
      n++;
    }
  }
  return n;
}
/* まえの 版で まとめすぎた 組を ほどく（重なって いない 絵が 入って いる 組） */
function fixSets(){
  const sets = SETS(); let n = 0;
  for(let i = sets.length - 1; i >= 0; i--){
    const st = sets[i], def = slotById(st.def) || slotById(st.slots[0]);
    if(!def) continue;
    const ok = st.slots.every(id => { const o = slotById(id); return !o || o === def || sameSpot(def, o); });
    if(ok) continue;
    st.slots.forEach(id => { const o = slotById(id); if(o) o.visible = true; });
    sets.splice(i, 1);
    for(const nm in S.proj.anims){ const a = S.proj.anims[nm]; if(a.sets) delete a.sets[st.id]; }
    n++;
  }
  return n;
}
const _loadProject3 = loadProject;
loadProject = function(text){
  _loadProject3(text);
  const n = fixSets();
  if(n) setTimeout(() => setStatus('まとめすぎて いた 差分を ' + n + 'つ ほどきました（ぜんぶ 見える ように しました）'), 700);
};
const _importPsd2 = importPsd;
importPsd = async function(file){
  await _importPsd2(file);
  if(!S.psdReplace) return;
  S.proj.sets = [];
  beginEdit('差分を まとめる'); const n = autoSets(); commitEdit();
  if(n) setTimeout(() => setStatus(n + 'つの 差分（表情）を まとめました。パーツを えらぶと 右の パネルで 切りかえられます'), 400);
  refreshUI();
};

/* ---------- 「にこっ」などで 笑顔の 差分に する ---------- */
const SMILE_RX = /笑|にこ|smile|happy|joy|喜/i;
function diffSmile(a, ranges){
  SETS().forEach(st => {
    const smile = st.slots.find(id => { const sl = slotById(id); return sl && SMILE_RX.test(sl.name); });
    if(!smile) return;
    a.sets = a.sets || {};
    const ks = [];
    ranges.forEach(([f0, f1]) => { ks.push([+(f0 * a.dur).toFixed(3), smile], [+(f1 * a.dur).toFixed(3), st.def]); });
    a.sets[st.id] = ks.sort((x, y) => x[0] - y[0]);
  });
}
// にこっ に 笑顔の 差分を 足す
(() => {
  const m = WHOLE.find(x => x.name === 'にこっ'); if(!m) return;
  const f0 = m.fn;
  m.fn = (a, B) => { f0(a, B); diffSmile(a, [[.12, .66]]); };
})();

/* ---------- 右パネル ---------- */
function setKeyDiff(st, sid){
  const a = anim(); if(!a) return;
  a.sets = a.sets || {};
  const ks = (a.sets[st.id] = a.sets[st.id] || []);
  const t = +S.time.toFixed(3);
  const i = ks.findIndex(k => Math.abs(k[0] - t) < 1e-3);
  if(i >= 0) ks[i][1] = sid; else { ks.push([t, sid]); ks.sort((x, y) => x[0] - y[0]); }
}
function openMakeSet(sl){
  sheet.show('＋ 差分を まとめる', body => {
    body.appendChild(el('div', 'sh-note', '「' + sl.name + '」と おなじ 場所に 描いた 絵（口の 通常・笑顔・あ など）に チェック。まとめると いつも 1まい だけ 見えます。'));
    const nrow = el('div', 'row'); nrow.appendChild(el('label', null, '名前'));
    const nm = el('input'); nm.type = 'text'; nm.value = (sl.gpath && sl.gpath.length ? sl.gpath[sl.gpath.length - 1] : sl.name.replace(/[_\-\s]?[^_\-\s]*$/, '')) || sl.name;
    nrow.appendChild(nm); body.appendChild(nrow);
    const b0 = slotBox(sl);
    const ov = o => { const b = slotBox(o); const ix = Math.max(0, Math.min(b0.x1, b.x1) - Math.max(b0.x0, b.x0)), iy = Math.max(0, Math.min(b0.y1, b.y1) - Math.max(b0.y0, b.y0));
      return ix * iy / Math.max(1, Math.min(b0.w * b0.h, b.w * b.h)); };
    const list = el('div', 'att-list'); const rows = [];
    S.proj.slots.slice().reverse().forEach(o => {
      if(o === sl || setOf(o.id) || !o.verts.length) return;
      const r = el('label', 'att-row'); const c = el('input'); c.type = 'checkbox';
      const near = ov(o) > 0.35; c.checked = near;
      r.append(c, el('span', 'att-n', '🖼 ' + o.name), el('small', null, near ? 'おなじ 場所' : ''));
      list.appendChild(r); rows.push({ c, o, near });
    });
    rows.sort((x, y) => y.near - x.near).forEach(x => list.appendChild(x.c.parentNode));
    body.appendChild(list);
    body.appendChild(btnRow(mkBtn('まとめる', () => {
      const pick = rows.filter(x => x.c.checked).map(x => x.o);
      if(!pick.length) return setStatus('1つ 以上 チェックしてね');
      edit('差分を まとめる', () => {
        const ids = [sl.id].concat(pick.map(o => o.id));
        SETS().push({ id: uid('set'), name: nm.value || sl.name, slots: ids, def: sl.id });
        ids.forEach(id => { const o = slotById(id); if(o) o.visible = true; });
      });
      sheet.hide(); refreshUI();
      setStatus('「' + (nm.value || sl.name) + '」に ' + (pick.length + 1) + 'まいの 差分を まとめました');
    }, 'btn btn-y')));
  });
}
const _buildProps4 = buildProps;
buildProps = function(){
  _buildProps4();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props');
  const box = el('div', 'diff-box');
  const st = setOf(sl.id);
  if(!st){
    box.appendChild(btnRow(mkBtn('＋ 差分を まとめる（表情）', () => openMakeSet(sl), 'btn')));
    host.insertBefore(box, host.firstChild.nextSibling);
    return;
  }
  const anim0 = S.mode === 'anim';
  const a = anim();
  const cur = anim0 ? activeOpt(st, a, S.time) : st.def;
  box.appendChild(el('div', 'title', '差分: ' + st.name));
  box.appendChild(el('div', 'hint', anim0
    ? 'おすと いまの 時間（' + S.time.toFixed(2) + '秒）から その 絵に 切りかわる'
    : 'おすと ふだん 見せる 絵を 変える（アニメートでは 時間ごとに 切りかえ）'));
  const g = el('div', 'diff-opts');
  st.slots.forEach(id => {
    const o = slotById(id); if(!o) return;
    const b = mkBtn(o.name, () => {
      edit('差分: ' + o.name, () => { if(anim0) setKeyDiff(st, id); else st.def = id; });
      S.sel.slot = id; refreshUI();
    }, 'btn btn-sm' + (id === cur ? ' on' : ''));
    g.appendChild(b);
  });
  box.appendChild(g);
  const ks = a && a.sets && a.sets[st.id];
  if(anim0 && ks && ks.length){
    const kl = el('div', 'diff-keys');
    ks.forEach((k, i) => {
      const o = slotById(k[1]);
      const row = el('div', 'diff-key');
      row.append(el('span', null, k[0].toFixed(2) + '秒 → ' + (o ? o.name : '?')),
        mkBtn('×', () => { edit('差分の キーを 消す', () => ks.splice(i, 1)); refreshUI(); }, 'btn mini'));
      kl.appendChild(row);
    });
    box.appendChild(kl);
  }
  box.appendChild(btnRow(mkBtn('まとめを とく', () => {
    edit('差分の まとめを とく', () => {
      SETS().splice(SETS().indexOf(st), 1);
      for(const nm in S.proj.anims){ const x = S.proj.anims[nm]; if(x.sets) delete x.sets[st.id]; }
    });
    refreshUI();
  }, 'btn btn-sm danger')));
  host.insertBefore(box, host.firstChild.nextSibling);
};
