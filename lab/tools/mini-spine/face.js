/* ミニSpine — 表情（かんたん）
   「驚き」「笑顔」などを 1回 登録すると、ボタン 1つで 顔 まるごと 切りかわる。
   中身は 差分の 組（目・口・眉 …）ごとに「どの 絵を 見せるか」を おぼえた もの。
     S.proj.faces = [{ id, name, pick:{ 組id: slotId } }]
   セットアップで おす … ふだんの 顔に する
   アニメートで おす   … いまの 時間から その 顔に 切りかわる（組ごとに キーが 入る）
   組に 入って いない 絵（体・髪 など）は さわらないので、体が 消える ことは ない。
   diff.js の あとに 読む。 */
'use strict';

const FACES = () => (S.proj.faces = S.proj.faces || []);
const FACE_NAMES = ['通常', '笑顔', '驚き', '怒り', '泣き', '困り', '照れ', 'ウインク', 'ジト目', '目とじ'];

/* 差分を まとめる ときの 最初の チェック：
   まえは「小さい ほうが ほぼ 入って いれば おなじ 場所」と して いたので、
   顔の 中の 口を えらぶと 顔や 体まで チェックが 入り、まとめると 体が 消えた。
   おなじ 場所・おなじ くらいの 大きさ（sameSpot）だけに する */
const _openMakeSetF = openMakeSet;
openMakeSet = function(sl){
  _openMakeSetF(sl);
  document.querySelectorAll('.att-row').forEach(r => {
    const name = (r.querySelector('.att-n') || {}).textContent || '';
    const o = S.proj.slots.find(x => '🖼 ' + x.name === name);
    const c = r.querySelector('input'), sm = r.querySelector('small');
    if(!o || !c) return;
    const same = sameSpot(sl, o);
    c.checked = same; if(sm) sm.textContent = same ? 'おなじ 場所' : '';
  });
};

/** いま 見えて いる 顔（組ごと） */
function facePickNow(){
  const a = S.mode === 'anim' ? anim() : null, t = S.mode === 'anim' ? S.time : null;
  const pick = {};
  SETS().forEach(st => { pick[st.id] = activeOpt(st, a, t); });
  return pick;
}
function applyFace(f){
  const anim0 = S.mode === 'anim';
  edit('表情: ' + f.name, () => {
    SETS().forEach(st => {
      const sid = f.pick[st.id];
      if(!sid || !st.slots.includes(sid)) return;
      if(anim0) setKeyDiff(st, sid); else st.def = sid;
    });
  });
  refreshUI();
  setStatus(anim0 ? S.time.toFixed(2) + '秒 から「' + f.name + '」に しました' : 'ふだんの 顔を「' + f.name + '」に しました');
}

/* ---------- 表情の パネル ---------- */
function openFaces(){
  sheet.show('😊 表情', body => {
    const sets = SETS();
    if(!sets.length){
      body.appendChild(el('div', 'sh-note', 'まだ 差分（目・口 などの かきかえ）が ありません。'));
      body.appendChild(el('div', 'sh-note', 'PSD に 同じ 場所の 目や 口を 何まいか 入れて（かくした レイヤーでも OK）、下の ボタンを おしてね。'));
      body.appendChild(btnRow(mkBtn('🔍 差分を さがして まとめる', () => {
        beginEdit('差分を まとめる'); const n = autoSetsLoose(); commitEdit();
        refreshUI();
        if(n) openFaces(); else setStatus('同じ 場所に 重なった 絵が 見つかりませんでした');
      }, 'btn btn-y')));
      return;
    }
    const anim0 = S.mode === 'anim';
    body.appendChild(el('div', 'sh-note', anim0
      ? 'おすと いまの 時間（' + S.time.toFixed(2) + '秒）から その 顔に 切りかわります。'
      : 'おすと ふだんの 顔に なります。アニメートで おすと、その 時間から 切りかわります。'));
    const g = el('div', 'sh-grid');
    FACES().forEach(f => {
      const b = mkBtn('', () => { sheet.hide(); applyFace(f); }, 'mv');
      b.append(el('i', null, faceIcon(f.name)), el('span', null, f.name));
      g.appendChild(b);
    });
    const add = mkBtn('', () => makeFace(), 'mv');
    add.append(el('i', null, '＋'), el('span', null, '表情を つくる'));
    g.appendChild(add);
    body.appendChild(g);
    if(FACES().length){
      const del = el('div', 'face-del');
      del.appendChild(el('div', 'sh-h', 'なおす・けす'));
      FACES().forEach(f => del.appendChild(btnRow(
        mkBtn('✎ ' + f.name, () => makeFace(f), 'btn btn-sm'),
        mkBtn('けす', () => { edit('表情を けす', () => FACES().splice(FACES().indexOf(f), 1)); openFaces(); }, 'btn btn-sm danger'))));
      body.appendChild(del);
    }
  });
}
function faceIcon(n){
  return ({ 通常:'🙂', 笑顔:'😄', 驚き:'😲', 怒り:'😠', 泣き:'😢', 困り:'😥', 照れ:'😳', ウインク:'😉', ジト目:'😑', 目とじ:'😌' })[n] || '🎭';
}

/* つくる・なおす：組ごとに 絵を えらぶ（見た目は すぐ 変わる） */
function makeFace(f){
  const sets = SETS();
  const keepDef = new Map(sets.map(st => [st, st.def]));
  const pick = f ? Object.assign({}, f.pick) : facePickNow();
  const show = () => { sets.forEach(st => { if(pick[st.id]) st.def = pick[st.id]; }); requestRender(); };
  const back = () => { keepDef.forEach((d, st) => { st.def = d; }); requestRender(); };
  const wasMode = S.mode;
  S.mode = 'setup'; S.playing = false; show();
  sheet.show(f ? '✎ 表情を なおす' : '＋ 表情を つくる', body => {
    body.appendChild(el('div', 'sh-note', '① 名前を えらぶ'));
    const nm = el('input'); nm.type = 'text'; nm.value = f ? f.name : '';
    nm.placeholder = '名前（驚き など）'; nm.className = 'face-name';
    const chips = el('div', 'face-chips');
    FACE_NAMES.forEach(n => { const c = mkBtn(faceIcon(n) + ' ' + n, () => { nm.value = n; chips.querySelectorAll('.btn').forEach(x => x.classList.toggle('btn-y', x === c)); }, 'btn btn-sm'); chips.appendChild(c); });
    body.append(chips, nm);
    body.appendChild(el('div', 'sh-note', '② 目・口 などを えらぶ（さわると 絵が すぐ 変わります）'));
    sets.forEach(st => {
      const row = el('div', 'face-row');
      row.appendChild(el('b', null, st.name));
      const opts = el('div', 'face-opts');
      st.slots.forEach(id => {
        const o = slotById(id); if(!o) return;
        const b = mkBtn(o.name, () => { pick[st.id] = id; opts.querySelectorAll('.btn').forEach(x => x.classList.toggle('btn-y', x === b)); show(); }, 'btn btn-sm' + (pick[st.id] === id ? ' btn-y' : ''));
        opts.appendChild(b);
      });
      row.appendChild(opts);
      body.appendChild(row);
    });
    body.appendChild(btnRow(
      mkBtn('とっておく', () => {
        const name = (nm.value || '').trim();
        if(!name) return setStatus('名前を えらんでね');
        back();
        edit('表情: ' + name, () => {
          if(f){ f.name = name; f.pick = pick; }
          else FACES().push({ id: uid('face'), name, pick });
        });
        S.mode = wasMode; sheet.hide(); refreshUI();
        setStatus('表情「' + name + '」を とっておきました。😊 表情 から おすだけで 切りかわります');
      }, 'btn btn-y'),
      mkBtn('やめる', () => { back(); S.mode = wasMode; sheet.hide(); refreshUI(); }, 'btn')));
  });
}

/* 差分 さがし（ボタンから）：グループに かかわらず、同じ 場所・同じ 大きさで 重なった 絵を 組に する。
   体や 髪の ような 大きい 絵は 入れない（キャンバスの 4わり 以上は のぞく） */
function autoSetsLoose(){
  const n0 = autoSets();
  const C = S.proj.canvas, big = C.w * C.h * 0.4;
  let rest = S.proj.slots.filter(sl => sl.verts.length && !setOf(sl.id) && (() => { const b = slotBox(sl); return b.w * b.h < big; })());
  let n = 0;
  while(rest.length >= 2){
    const seed = rest[0];
    const grp = rest.filter(o => o === seed || sameSpot(seed, o));
    rest = rest.filter(o => !grp.includes(o));
    if(grp.length < 2) continue;
    const def = grp.find(sl => !sl.psdHidden && sl.visible) || grp[0];
    const nm = (def.gpath && def.gpath.length ? def.gpath[def.gpath.length - 1] : def.name.replace(/[_\-\s]?[^_\-\s]*$/, '')) || def.name;
    SETS().push({ id: uid('set'), name: nm, slots: grp.map(x => x.id), def: def.id });
    grp.forEach(sl => { sl.visible = true; });
    n++;
  }
  return n0 + n;
}

const requestRender = () => { try{ render(); }catch(_){} };

/* ボタン：よくある動き の となり */
(() => {
  const b = el('button', 'btn btn-sm', '😊 表情'); b.id = 'btnFaces';
  b.title = '驚き・笑顔 などの 顔を とっておいて、おすだけで 切りかえる';
  b.onclick = openFaces;
  const p = $('#btnPreset'); if(p) p.after(b);
})();
