/* ミニSpine — アニメ工房から もってきた しくみ
   ・よくある動き（下から出る 板で えらぶ）
   ・タップで骨組み（腰・首・頭・手先を 順に さわるだけ）
   ・書き出し（アニメ工房・動画工房へ 送る／動画で 保存）
   ・じどう保存（端末の中＝IndexedDB）
   ・2本指トン＝もどす、3本指トン＝やりなおし
   editor.js の あとに 読む。editor.js の 関数・S・UNDO を そのまま 使う。 */
'use strict';

/* ================= 下から出る 板（シート） ================= */
const sheet = (() => {
  const back = el('div'); back.id = 'sheetBack';
  const box = el('div'); box.id = 'sheet';
  const bar = el('div'); bar.id = 'sheetBar';
  const ttl = el('b');
  const close = mkBtn('とじる', () => hide(), 'btn btn-sm');
  bar.append(ttl, close);
  const body = el('div'); body.id = 'sheetBody';
  box.append(bar, body);
  document.body.append(back, box);
  back.addEventListener('pointerdown', () => hide());
  function show(title, build){
    ttl.textContent = title;
    body.innerHTML = '';
    build(body);
    document.body.classList.add('sheet-open');
  }
  function hide(){ document.body.classList.remove('sheet-open'); }
  addEventListener('keydown', e => { if(e.key === 'Escape') hide(); });
  return { show, hide };
})();

/* ================= ボーンさがし =================
   名前から「どれが頭か・体か・腕か」を あてる。
   見つからないときは 近い役の ボーンで かわりにする。 */
const RX = {
  head: /頭|head|face|顔|首|neck/i,
  body: /体|胴|body|torso|chest|spine|腰|hip|pelvis|からだ/i,
  arm:  /腕|arm|hand|手|袖|sleeve/i,
  hair: /髪|hair|もみあげ|アホ毛/i,
  tail: /尾|しっぽ|tail/i,
  left: /左|left|(^|[^a-z])l$|_l\b|\.l\b/i,
  right:/右|right|(^|[^a-z])r$|_r\b|\.r\b/i
};

function findBones(){
  const bones = S.proj.bones, root = bones[0];
  const by = rx => bones.filter(b => b !== root && rx.test(b.name));
  const firstOf = list => {
    // いちばん 根もとに 近いもの（腕1・腕2 なら 腕1）
    let best = null, bd = 1e9;
    list.forEach(b => { let d = 0, c = b; while(c && c.parent){ d++; c = boneById(c.parent); } if(d < bd){ bd = d; best = b; } });
    return best;
  };
  const body = firstOf(by(RX.body)) || root;
  const head = firstOf(by(RX.head).filter(b => !RX.hair.test(b.name))) || body;
  const arms = by(RX.arm).filter(b => !arms0(b));
  function arms0(b){ const p = boneById(b.parent); return p && RX.arm.test(p.name); } // 腕の子（ひじから先）は のぞく
  let armR = arms.find(b => RX.right.test(b.name)) || null;
  let armL = arms.find(b => RX.left.test(b.name)) || null;
  if(!armR && !armL && arms.length){ armR = arms[0]; armL = arms[1] || null; }
  else if(!armR) armR = arms.find(b => b !== armL) || null;
  else if(!armL) armL = arms.find(b => b !== armR) || null;
  const hair = by(RX.hair);
  const tail = by(RX.tail);
  return { root, body, head, armR, armL, hair, tail };
}

/* ================= キーを打つ 小道具 ================= */
const SP = () => setupPose();

/** そのボーンが 画面で たてを 向いているか（伸びる向き＝sx が たてになる） */
function vertical(b){
  const p = SP()[b.id]; if(!p) return true;
  const r = M.rotOf(p.world) * Math.PI / 180;
  return Math.abs(Math.sin(r)) > 0.7;
}
/** たて・よこ の のび縮みに 使う チャンネル */
const vCh = b => vertical(b) ? 'sx' : 'sy';
const hCh = b => vertical(b) ? 'sy' : 'sx';

/** 画面の向きで ずらしたい量（dx,dy）を、そのボーンの「親の中」の量に なおす */
function wdelta(b, dx, dy){
  const sp = SP();
  const pw = b.parent && sp[b.parent] ? sp[b.parent].world : M.ident();
  const iv = M.inv({ a:pw.a, b:pw.b, c:pw.c, d:pw.d, tx:0, ty:0 });
  return M.apply(iv, dx, dy);
}

/** 1本の チャンネルに まとめて キー。list は [[0〜1の 時刻, 値], ...] */
function keys(a, b, ch, list, curve){
  if(!b) return;
  if(a.tracks[b.id]) delete a.tracks[b.id][ch];
  list.forEach(([f, v]) => setKey(a, b.id, ch, +(f * a.dur).toFixed(4), v, curve || 'smooth'));
}
/** 画面の たて方向に ゆらす（上が マイナス） */
function bobY(a, b, list, curve){
  if(!b) return;
  const pts = list.map(([f, dy]) => [f, wdelta(b, 0, dy)]);
  keys(a, b, 'x', pts.map(([f, p]) => [f, p.x]), curve);
  keys(a, b, 'y', pts.map(([f, p]) => [f, p.y]), curve);
}
function bobX(a, b, list, curve){
  if(!b) return;
  const pts = list.map(([f, dx]) => [f, wdelta(b, dx, 0)]);
  keys(a, b, 'x', pts.map(([f, p]) => [f, p.x]), curve);
  keys(a, b, 'y', pts.map(([f, p]) => [f, p.y]), curve);
}
/** たて・よこ の 大きさ（1＝そのまま） */
function squash(a, b, list, curve){
  if(!b) return;
  keys(a, b, vCh(b), list.map(([f, v]) => [f, v]), curve);
  keys(a, b, hCh(b), list.map(([f, v]) => [f, 1 + (1 - v) * 0.6]), curve);
}
/** くり返しの 波を つくる。n 回 ゆれて もどる */
function wave(n, amp, phase){
  const out = [], steps = Math.max(8, n * 8);
  for(let i = 0; i <= steps; i++){
    const f = i / steps;
    out.push([f, +(Math.sin((f * n + (phase || 0)) * Math.PI * 2) * amp).toFixed(3)]);
  }
  return out;
}
/** 大きさ（キャラの せたけ）の めやす。はねる 高さなどに 使う */
function charSize(){
  const sp = SP(); let y0 = 1e9, y1 = -1e9;
  S.proj.bones.forEach(b => { const p = sp[b.id]; if(!p) return;
    const e = M.apply(p.world, b.len, 0);
    y0 = Math.min(y0, p.world.ty, e.y); y1 = Math.max(y1, p.world.ty, e.y); });
  const h = y1 - y0;
  return h > 40 ? h : S.proj.canvas.h * 0.5;
}

/* ================= よくある動き =================
   whole: キャラ まるごと。新しい アニメを 1つ 作って そこに 入れる。
   one  : えらんだ ボーン 1本。いまの アニメに 足す。 */
const WHOLE = [
  { name:'待機（ふつう）', icon:'🧍', dur:3, fn:(a,B) => {
      squash(a, B.body, [[0,1],[.5,1.025],[1,1]]);
      keys(a, B.head, 'rot', [[0,0],[.3,1.5],[.65,-1.5],[1,0]]);
      keys(a, B.armR, 'rot', [[0,0],[.5,2],[1,0]]);
      keys(a, B.armL, 'rot', [[0,0],[.5,-2],[1,0]]);
  }},
  { name:'うなずく', icon:'🙂', dur:1.2, fn:(a,B) => {
      keys(a, B.head, 'rot', [[0,0],[.18,-8],[.4,3],[.6,-6],[.8,1],[1,0]]);
      bobY(a, B.head, [[0,0],[.18,6],[.4,-1],[.6,4],[.8,0],[1,0]]);
  }},
  { name:'首を かしげる', icon:'🤔', dur:2.4, fn:(a,B) => {
      keys(a, B.head, 'rot', [[0,0],[.2,12],[.7,12],[.9,-1],[1,0]]);
      keys(a, B.body, 'rot', [[0,0],[.2,2],[.7,2],[1,0]]);
  }},
  { name:'手を ふる', icon:'👋', dur:1.6, fn:(a,B) => {
      // 画面の 左がわの 腕は ＋で 上がる、右がわは －で 上がる
      const arm = B.armR || B.armL, sg = arm === B.armR ? 1 : -1;
      if(arm) keys(a, arm, 'rot', [[0,0],[.15,70],[.3,50],[.45,75],[.6,50],[.75,70],[.9,20],[1,0]].map(([f,v]) => [f, v*sg]));
      else keys(a, B.head, 'rot', wave(2, 6));
      keys(a, B.head, 'rot', [[0,0],[.3,4],[.8,4],[1,0]]);
  }},
  { name:'ぴょんと はねる', icon:'🐇', dur:1.0, fn:(a,B) => {
      const h = charSize() * 0.18;
      bobY(a, B.root, [[0,0],[.18,0],[.45,-h],[.7,0],[.8,0],[1,0]]);
      squash(a, B.root, [[0,1],[.18,.9],[.3,1.08],[.45,1],[.7,1.04],[.8,.93],[.92,1.01],[1,1]]);
  }},
  { name:'よろこぶ', icon:'🙌', dur:1.2, fn:(a,B) => {
      const h = charSize() * 0.08;
      bobY(a, B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      keys(a, B.armR, 'rot', [[0,40],[.25,70],[.5,40],[.75,70],[1,40]]);
      keys(a, B.armL, 'rot', [[0,-40],[.25,-70],[.5,-40],[.75,-70],[1,-40]]);
      keys(a, B.head, 'rot', [[0,0],[.25,-4],[.5,0],[.75,4],[1,0]]);
  }},
  { name:'おじぎ', icon:'🙇', dur:2.4, fn:(a,B) => {
      keys(a, B.body, 'rot', [[0,0],[.3,-25],[.65,-25],[1,0]]);
      keys(a, B.head, 'rot', [[0,0],[.3,-10],[.65,-10],[1,0]]);
  }},
  { name:'歩く（その場）', icon:'🚶', dur:1.0, fn:(a,B) => {
      const h = charSize() * 0.025;
      bobY(a, B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      keys(a, B.body, 'rot', wave(1, 2.5));
      keys(a, B.armR, 'rot', wave(1, 14));
      keys(a, B.armL, 'rot', wave(1, -14));
      keys(a, B.head, 'rot', wave(1, -1.5));
  }},
  { name:'走る（その場）', icon:'🏃', dur:0.6, fn:(a,B) => {
      const h = charSize() * 0.05;
      bobY(a, B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      keys(a, B.body, 'rot', [[0,-6],[.5,-6],[1,-6]]);
      keys(a, B.armR, 'rot', wave(1, 32));
      keys(a, B.armL, 'rot', wave(1, -32));
  }},
  { name:'びっくり', icon:'😲', dur:1.4, fn:(a,B) => {
      const h = charSize() * 0.06;
      bobY(a, B.root, [[0,0],[.1,-h],[.22,0],[1,0]]);
      squash(a, B.root, [[0,1],[.1,1.1],[.22,.95],[.32,1.02],[.45,1],[1,1]]);
      keys(a, B.armR, 'rot', [[0,0],[.1,35],[.7,30],[1,0]]);
      keys(a, B.armL, 'rot', [[0,0],[.1,-35],[.7,-30],[1,0]]);
  }},
  { name:'しょんぼり', icon:'😞', dur:3, fn:(a,B) => {
      keys(a, B.head, 'rot', [[0,0],[.3,-10],[.8,-10],[1,0]]);
      squash(a, B.body, [[0,1],[.3,.97],[.8,.97],[1,1]]);
      bobY(a, B.head, [[0,0],[.3,5],[.8,5],[1,0]]);
  }},
  { name:'いやいや', icon:'🙅', dur:1.0, fn:(a,B) => {
      keys(a, B.head, 'rot', wave(3, 10));
      keys(a, B.body, 'rot', wave(3, 2));
  }},
  { name:'ノリノリ', icon:'🎵', dur:1.0, fn:(a,B) => {
      const h = charSize() * 0.02;
      bobY(a, B.root, [[0,0],[.25,h],[.5,0],[.75,h],[1,0]]);
      keys(a, B.body, 'rot', wave(1, 5));
      keys(a, B.head, 'rot', wave(1, -7, .1));
      keys(a, B.armR, 'rot', wave(2, 12));
      keys(a, B.armL, 'rot', wave(2, -12));
  }},
  { name:'ぷんぷん', icon:'💢', dur:0.8, fn:(a,B) => {
      bobX(a, B.root, wave(4, charSize() * 0.012));
      squash(a, B.body, [[0,1],[.5,1.03],[1,1]]);
      keys(a, B.armR, 'rot', [[0,20],[.5,26],[1,20]]);
      keys(a, B.armL, 'rot', [[0,-20],[.5,-26],[1,-20]]);
  }},
  { name:'ねむい', icon:'😪', dur:4, fn:(a,B) => {
      keys(a, B.head, 'rot', [[0,0],[.35,-14],[.42,-3],[.7,-12],[.78,-2],[1,0]]);
      squash(a, B.body, [[0,1],[.5,1.02],[1,1]]);
  }},
  { name:'ふわふわ 浮く', icon:'🎈', dur:3, fn:(a,B) => {
      bobY(a, B.root, wave(1, charSize() * 0.03));
      keys(a, B.root, 'rot', wave(1, 2, .25));
  }}
];

const ONE = [
  { name:'呼吸', icon:'🫁', fn:(a,b) => squash(a, b, [[0,1],[.5,1.03],[1,1]]) },
  { name:'ふわふわ', icon:'☁️', fn:(a,b) => bobY(a, b, wave(1, charSize() * 0.02)) },
  { name:'ゆらゆら', icon:'🌿', fn:(a,b) => keys(a, b, 'rot', wave(1, 8)) },
  { name:'首ふり', icon:'↔️', fn:(a,b) => keys(a, b, 'rot', [[0,0],[.25,6],[.75,-6],[1,0]]) },
  { name:'うなずき', icon:'⬇️', fn:(a,b) => keys(a, b, 'rot', [[0,0],[.15,-9],[.35,2],[.6,0],[1,0]]) },
  { name:'ぷよん', icon:'🍮', fn:(a,b) => squash(a, b, [[0,1],[.2,1.08],[.4,.95],[.6,1.03],[.8,.99],[1,1]]) },
  { name:'ぷるぷる', icon:'🥶', fn:(a,b) => keys(a, b, 'rot', wave(8, 1.6), 'linear') },
  { name:'ドキドキ', icon:'💓', fn:(a,b) => {
      const s = [[0,1],[.08,1.08],[.16,1],[.26,1.06],[.36,1],[1,1]];
      keys(a, b, 'sx', s); keys(a, b, 'sy', s);
  }},
  { name:'ぶらぶら', icon:'🕰', fn:(a,b) => keys(a, b, 'rot', wave(1, 20)) },
  { name:'しっぽふり', icon:'🐕', fn:(a,b) => keys(a, b, 'rot', wave(3, 18)) },
  { name:'手まねき', icon:'🫴', fn:(a,b) => keys(a, b, 'rot', [[0,0],[.2,-35],[.4,0],[.6,-35],[.8,0],[1,0]]) },
  { name:'ぴょこん', icon:'⤴️', fn:(a,b) => {
      bobY(a, b, [[0,0],[.15,-charSize()*.04],[.3,0],[1,0]]);
      squash(a, b, [[0,1],[.15,1.05],[.3,.97],[.4,1],[1,1]]);
  }},
  { name:'くるっと 1回転', icon:'🔄', fn:(a,b) => keys(a, b, 'rot', [[0,0],[1,360]], 'linear') },
  { name:'ちかちか（点滅）', icon:'✨', fn:(a,b) => {
      const s = [[0,1],[.45,1],[.5,.85],[.55,1],[1,1]];
      keys(a, b, 'sx', s); keys(a, b, 'sy', s);
  }}
];

function uniqueAnimName(base){
  let n = base, i = 2;
  while(S.proj.anims[n]) n = base + i++;
  return n;
}

function applyWhole(m){
  const name = uniqueAnimName(m.name.replace(/（.*）/, ''));
  edit(m.name, () => {
    S.proj.anims[name] = { dur: m.dur, loop: true, tracks: {} };
    S.proj.current = name;
    m.fn(S.proj.anims[name], findBones());
  });
  // 髪や しっぽが あれば、揺れ物理も つけて おく
  if(S.proj.bones.some(b => b.spring)) S.spring = true;
  S.springState = {};
  S.mode = 'anim'; S.time = 0; S.playing = true;
  $('#animSel').dataset.n = '';
  setStatus('「' + name + '」を 作りました（アニメの 一覧で 切りかえ）');
  refreshUI();
}

function applyOne(m){
  const b = boneById(S.sel.bone), a = anim();
  if(!b || !a) return;
  edit(m.name, () => m.fn(a, b));
  S.mode = 'anim'; S.playing = true; S.springState = {};
  setStatus(m.name + ' を ' + b.name + ' に つけました');
  refreshUI();
}

function openMotions(){
  sheet.show('よくある動き', body => {
    const B = findBones();
    const who = [B.body !== B.root ? '体' : null, B.head !== B.body ? '頭' : null,
                 B.armR || B.armL ? '腕' : null].filter(Boolean);
    body.appendChild(el('div', 'sh-h', 'キャラ まるごと'));
    body.appendChild(el('div', 'sh-note', S.proj.bones.length < 3
      ? 'ボーンが 少ないので、全体が いっしょに 動きます。「🦴 タップで骨組み」を 先に すると よく 動きます。'
      : '新しい アニメを 1つ 作って 入れます（いま 見つかった ボーン: ' + (who.join('・') || 'ルートだけ') + '）'));
    const g1 = el('div', 'sh-grid');
    WHOLE.forEach(m => {
      const bt = mkBtn('', () => { sheet.hide(); applyWhole(m); }, 'mv');
      bt.append(el('i', null, m.icon), el('span', null, m.name));
      g1.appendChild(bt);
    });
    body.appendChild(g1);

    const sb = boneById(S.sel.bone);
    body.appendChild(el('div', 'sh-h', 'えらんだ ボーンだけ（' + (sb ? sb.name : '—') + '）'));
    body.appendChild(el('div', 'sh-note', 'いまの アニメ「' + S.proj.current + '」に 足します。同じ 動きの キーは 上書き。'));
    const g2 = el('div', 'sh-grid');
    ONE.forEach(m => {
      const bt = mkBtn('', () => { sheet.hide(); applyOne(m); }, 'mv');
      bt.append(el('i', null, m.icon), el('span', null, m.name));
      g2.appendChild(bt);
    });
    body.appendChild(g2);
  });
}
$('#btnPreset').onclick = openMotions;

/* ================= タップで骨組み =================
   画面を 順に さわるだけで 骨が できる。
   腰 → 首 → 頭のてっぺん → 右手の先 → 左手の先（手は とばせる）
   できたら パーツを いちばん 近い 骨に つける。髪は 揺れる 骨を 自動で 足す。 */
const TAP_STEPS = [
  { key:'hip',  say:'腰（からだの 付け根）を さわって', skip:false },
  { key:'neck', say:'首の 付け根を さわって', skip:false },
  { key:'top',  say:'頭の てっぺんを さわって', skip:false },
  { key:'handR',say:'画面の 左がわの 手の先を さわって（なければ「とばす」）', skip:true },
  { key:'handL',say:'画面の 右がわの 手の先を さわって（なければ「とばす」）', skip:true }
];

const tapBar = (() => {
  const bar = el('div'); bar.id = 'tapBar';
  const msg = el('span', 'tb-msg');
  const skip = mkBtn('とばす', () => tapNext(null), 'btn btn-sm');
  const back = mkBtn('ひとつ もどる', () => tapBack(), 'btn btn-sm');
  const stop = mkBtn('やめる', () => tapEnd(false), 'btn btn-sm danger');
  bar.append(msg, back, skip, stop);
  $('#view').appendChild(bar);
  return { bar, msg, skip, back };
})();

const PART_STEPS = [
  { key:'base', say:'付け根（肩・首など）を さわって', skip:false },
  { key:'mid',  say:'曲がる ところ（ひじ・ひざ）を さわって（曲げないなら「とばす」）', skip:true },
  { key:'tip',  say:'先っぽ（手先・足先）を さわって', skip:false }
];

/** いま えらんでいる ところの 骨（パーツなら その 付け先）。ルートなら null */
function partBone(){
  const sl = slotById(S.sel.slot);
  const b = sl ? boneById(sl.bone) : boneById(S.sel.bone);
  return b && b.parent ? b : null;
}

function tapStart(){
  if(!S.proj.slots.length) return setStatus('先に 絵（PSD / PNG）を 入れてください');
  const pb = partBone();
  if(!pb || S.proj.bones.length < 2) return tapGo('all');
  // ほそい 部分だけ 直したい ときは、ぜんぶ 作り直さない
  sheet.show('タップで骨組み', body => {
    const g = el('div', 'sh-grid wide');
    const big = (icon, ttl, note, fn) => {
      const b = mkBtn('', fn, 'mv wide');
      b.append(el('i', null, icon), el('span', null, ttl), el('small', null, note));
      g.appendChild(b);
    };
    big('✋', '「' + pb.name + '」だけ 組み直す', '付け根 → 曲がる ところ → 先っぽ の 順に さわる。ほかの 骨と アニメは そのまま。', () => tapGo('part', pb.id));
    big('🧍', 'ぜんぶ 作り直す', '腰 → 首 → 頭 → 手先。いまの 骨と アニメの キーは 消えます。', () => tapGo('all'));
    body.appendChild(g);
  });
}
function tapGo(kind, target){
  sheet.hide();
  S.tapRig = { i:0, pts:{}, kind, target, steps: kind === 'part' ? PART_STEPS : TAP_STEPS };
  S.mode = 'setup'; S.playing = false;
  document.body.classList.add('taprig');
  tapShow(); refreshUI();
}
function tapShow(){
  const st = S.tapRig.steps[S.tapRig.i];
  tapBar.msg.textContent = (S.tapRig.i + 1) + '/' + S.tapRig.steps.length + '　' + st.say;
  tapBar.skip.style.display = st.skip ? '' : 'none';
  tapBar.back.disabled = S.tapRig.i === 0;
}
function tapNext(pt){
  const st = S.tapRig.steps[S.tapRig.i];
  S.tapRig.pts[st.key] = pt;
  S.tapRig.i++;
  if(S.tapRig.i >= S.tapRig.steps.length) return tapEnd(true);
  tapShow();
}
function tapBack(){
  if(S.tapRig.i <= 0) return;
  S.tapRig.i--;
  delete S.tapRig.pts[S.tapRig.steps[S.tapRig.i].key];
  tapShow();
}
function tapEnd(ok){
  const r = S.tapRig;
  S.tapRig = null;
  document.body.classList.remove('taprig');
  if(ok && r) r.kind === 'part' ? buildPartRig(r.target, r.pts) : buildTapRig(r.pts);
  refreshUI();
}

/* さわった 点を 画面に 出す */
function drawTapMarks(){
  if(!S.tapRig) return;
  const z = S.view.z, P = S.tapRig.pts;
  const names = { hip:'腰', neck:'首', top:'頭', handR:'手', handL:'手', base:'付け根', mid:'曲がる', tip:'先' };
  const line = (a, b) => { if(!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  ctx.lineWidth = 5 / z; ctx.strokeStyle = MAIN_DEEP;
  line(P.hip, P.neck); line(P.neck, P.top); line(P.neck, P.handR); line(P.neck, P.handL);
  line(P.base, P.mid || P.tip); line(P.mid, P.tip);
  for(const k in P){
    const p = P[k]; if(!p) continue;
    ctx.fillStyle = MAIN; ctx.strokeStyle = INK; ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.arc(p.x, p.y, 13 / z, 0, 7); ctx.fill(); ctx.stroke();
    label(names[k], p.x + 16 / z, p.y - 10 / z, z);
  }
}

/** 画面の 座標で ボーンを 作る（a＝根もと、e＝先） */
function boneAt(name, parentId, a, e, extra){
  const sp = setupPose();
  const pw = parentId && sp[parentId] ? sp[parentId].world : M.ident();
  const lo = M.apply(M.inv(pw), a.x, a.y);
  const ang = Math.atan2(e.y - a.y, e.x - a.x) * 180 / Math.PI;
  const b = Object.assign({
    id: uid('b'), name, parent: parentId,
    x: lo.x, y: lo.y, rot: ang - M.rotOf(pw), sx:1, sy:1, shear:0,
    len: Math.max(8, Math.hypot(e.x - a.x, e.y - a.y) / (M.scaleOf(pw) || 1)),
    spring:false, stiff:0.35, damp:0.72, grav:0, inertia:1
  }, extra || {});
  S.proj.bones.push(b);
  return b;
}

function slotBox(s){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  s.verts.forEach(v => { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); });
  return { x0, y0, x1, y1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2, w:x1 - x0, h:y1 - y0 };
}

function buildTapRig(P){
  if(!P || !P.hip || !P.neck || !P.top) return;
  if(S.proj.bones.length > 1 &&
     !confirm('いまの 骨を 作りなおします（アニメの キーも 消えます）。いいですか？')) return;
  const lerpP = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

  edit('タップで骨組み', () => {
    const root = S.proj.bones[0];
    S.proj.bones = [root];
    S.proj.iks = [];
    for(const nm in S.proj.anims) S.proj.anims[nm].tracks = {};
    // ルート＝腰。全体を 動かす 取っ手
    root.parent = null; root.x = P.hip.x; root.y = P.hip.y;
    root.rot = Math.atan2(P.neck.y - P.hip.y, P.neck.x - P.hip.x) * 180 / Math.PI;
    root.sx = root.sy = 1; root.shear = 0;
    root.len = Math.hypot(P.neck.x - P.hip.x, P.neck.y - P.hip.y) * 0.25;
    root.name = 'root';

    const body = boneAt('体', root.id, P.hip, P.neck);
    const head = boneAt('頭', body.id, P.neck, P.top);
    const shoulder = lerpP(P.hip, P.neck, 0.85);
    const arms = [];
    [['handR','右腕'], ['handL','左腕']].forEach(([k, nm]) => {
      const tip = P[k]; if(!tip) return;
      const mid = lerpP(shoulder, tip, 0.5);
      const up = boneAt(nm + '1', body.id, shoulder, mid);
      const lo = boneAt(nm + '2', up.id, mid, tip);
      arms.push(up, lo);
    });

    // 髪の パーツ ごとに、頭から 下へ 揺れる 2本の 骨
    const hairSlots = S.proj.slots.filter(s => RX.hair.test(s.name) && s.verts.length);
    const hairBones = {};
    hairSlots.forEach((s, i) => {
      const bx = slotBox(s);
      const a = { x: bx.cx, y: bx.y0 + bx.h * 0.1 }, e = { x: bx.cx, y: bx.y1 };
      hairBones[s.id] = hairChain('髪' + (i + 1), head.id, a, e, 4);
    });

    markDirty();
    const sp = setupPose();
    const segs = boneSegments(S.proj, sp).filter(g => g.id !== root.id && !S.proj.bones.find(b => b.id === g.id).spring);
    const tall = Math.hypot(P.top.x - P.hip.x, P.top.y - P.hip.y);

    S.proj.slots.forEach(s => {
      s.verts.forEach(v => { v.w = []; });
      if(hairBones[s.id]){
        s.bone = hairBones[s.id][0];
        autoWeights(S.proj, s, sp, { maxBones:2, falloff:2, only: hairBones[s.id] });
        return;
      }
      const bx = slotBox(s);
      // 1枚絵（からだ全部が 入っている）なら、骨ぜんぶで なめらかに まげる
      if(S.proj.slots.length === 1 || (bx.h > tall * 0.95 && S.proj.slots.length <= 3)){
        s.bone = body.id;
        autoWeights(S.proj, s, sp, { maxBones:2, falloff:3, only: segs.map(g => g.id) });
        return;
      }
      // 名前で わかるなら それ、だめなら 中心に いちばん 近い 骨
      let pick = null;
      if(RX.head.test(s.name) || /目|眉|口|鼻|耳|eye|brow|mouth|nose|ear|cheek|頬/i.test(s.name)) pick = head.id;
      else if(RX.arm.test(s.name) && arms.length){
        const near = arms.slice().sort((p, q) => segDist(sp, p, bx) - segDist(sp, q, bx))[0];
        // 腕は 上と 下の 2本で ひじから まがる ように
        const i = arms.indexOf(near) & ~1, pair = [arms[i].id, arms[i + 1].id];
        s.bone = pair[0];
        autoWeights(S.proj, s, sp, { maxBones:2, falloff:3, only: pair });
        return;
      }
      if(!pick){
        let bd = 1e9;
        segs.forEach(g => { const d = distToSeg(bx.cx, bx.cy, g.ax, g.ay, g.bx, g.by); if(d < bd){ bd = d; pick = g.id; } });
      }
      s.bone = pick || body.id;
    });

    markDirty();
    S.sel = { bone: head.id, slot: null, ik: null };
  });
  if(S.proj.bones.some(b => b.spring)) S.spring = true;
  setStatus('骨組み できました。「✨ よくある動き」で すぐ 動かせます');
  fitView();
}
/* 1か所だけ 組み直す。えらんだ 骨（と その 先の 骨）を、
   さわった 2〜3点の 骨に 入れかえる。ついていた パーツは 新しい 骨へ。 */
function buildPartRig(targetId, P){
  const tb = boneById(targetId);
  if(!tb || !P || !P.base || !P.tip) return;
  edit(tb.name + 'を 組み直す', () => {
    const kids = childMap(S.proj);
    const gone = new Set([tb.id]);
    const st = [...(kids[tb.id] || [])];
    // 先に つながる 骨のうち、同じ 部分（揺れない・IKの的でない）は いっしょに 入れかえ
    while(st.length){
      const id = st.pop(), b = boneById(id);
      if(!b || b.spring || (S.proj.iks || []).some(k => k.target === id)) continue;
      gone.add(id); (kids[id] || []).forEach(c => st.push(c));
    }
    const name = tb.name.replace(/[0-9]+$/, '');
    const chain = [];
    if(P.mid){
      const up = boneAt(name + '1', tb.parent, P.base, P.mid);
      chain.push(up, boneAt(name + '2', up.id, P.mid, P.tip));
    } else chain.push(boneAt(name, tb.parent, P.base, P.tip));
    const last = chain[chain.length - 1].id;

    // 入れかえる 骨に ついていた もの（のこす 骨・パーツ）を 新しい 骨へ
    S.proj.bones.forEach(b => { if(!gone.has(b.id) && gone.has(b.parent)) b.parent = last; });
    const moved = S.proj.slots.filter(sl => gone.has(sl.bone));
    // ほかの 骨にも またがる パーツ（1枚絵など）は、消える 骨の 分だけ 新しい 骨へ
    S.proj.slots.forEach(sl => { if(gone.has(sl.bone)) return;
      sl.verts.forEach(v => (v.w || []).forEach(w => { if(gone.has(w.b)) w.b = chain[0].id; })); });
    S.proj.bones = S.proj.bones.filter(b => !gone.has(b.id));
    S.proj.iks = (S.proj.iks || []).filter(k => !k.bones.some(id => gone.has(id)) && !gone.has(k.target));
    for(const nm in S.proj.anims) gone.forEach(id => delete S.proj.anims[nm].tracks[id]);

    markDirty();
    const sp = setupPose(), ids = chain.map(b => b.id);
    moved.forEach(sl => {
      sl.verts.forEach(v => { v.w = []; });
      sl.bone = chain[0].id;
      if(ids.length > 1) autoWeights(S.proj, sl, sp, { maxBones:2, falloff:3, only: ids });
    });
    markDirty();
    S.sel = { bone: chain[0].id, slot: null, ik: null };
  });
  setStatus('組み直しました。' + (P.mid ? '曲がる ところで まがります' : '1本の 骨です'));
}

/* ================= 揺れる 骨（髪・しっぽ） =================
   1本の 長い 骨より、短い 骨を いくつも つないだ ほうが しなやかに 曲がる。
   先へ 行くほど やわらかく する。 */
const SOFT = {
  'かため':     { s0:.35, s1:.20, damp:.80, grav:.03 },
  'ふつう':     { s0:.18, s1:.09, damp:.88, grav:.06 },
  'やわらかい': { s0:.10, s1:.045, damp:.92, grav:.08 },
  'ふわふわ':   { s0:.06, s1:.025, damp:.95, grav:.04 }
};
function softAt(kind, i, n){
  const k = SOFT[kind] || SOFT['やわらかい'], t = n > 1 ? i / (n - 1) : 0;
  return { spring:true, stiff: +(k.s0 + (k.s1 - k.s0) * t).toFixed(3), damp:k.damp, grav:k.grav, inertia:1 };
}
/** a→e を n本の 揺れる 骨で つなぐ。id の ならびを かえす */
function hairChain(name, parentId, a, e, n, kind){
  const ids = []; let par = parentId;
  for(let i = 0; i < n; i++){
    const p = { x: a.x + (e.x - a.x) * i / n, y: a.y + (e.y - a.y) * i / n };
    const q = { x: a.x + (e.x - a.x) * (i + 1) / n, y: a.y + (e.y - a.y) * (i + 1) / n };
    const b = boneAt(name + '_' + (i + 1), par, p, q, softAt(kind || 'やわらかい', i, n));
    ids.push(b.id); par = b.id;
  }
  return ids;
}

/** えらんだ 骨を ふくむ、揺れる 骨の 1本道（根もと→先） */
function springChain(b){
  if(!b || !b.spring) return [];
  let top = b;
  while(top.parent){ const p = boneById(top.parent); if(!p || !p.spring) break; top = p; }
  const kids = childMap(S.proj), out = [top];
  let cur = top;
  for(;;){
    const ks = (kids[cur.id] || []).map(boneById).filter(x => x && x.spring);
    if(ks.length !== 1) break;
    cur = ks[0]; out.push(cur);
  }
  return out;
}

function setSoftness(b, kind){
  const ch = springChain(b);
  edit('揺れ: ' + kind, () => ch.forEach((x, i) => Object.assign(x, softAt(kind, i, ch.length))));
  S.springState = {}; S.spring = true;
  setStatus('「' + kind + '」に しました（' + ch.length + '本）');
  refreshUI();
}

/** 揺れる 骨の 1本道を n本に 切り直す（形は そのまま、曲がる ところが ふえる） */
function splitChain(b, n){
  const ch = springChain(b); if(!ch.length) return;
  const sp = setupPose();
  const pts = [{ x: sp[ch[0].id].world.tx, y: sp[ch[0].id].world.ty }];
  ch.forEach(x => pts.push(M.apply(sp[x.id].world, x.len, 0)));
  // 折れ線の 上を 同じ 長さずつ 区切る
  const seg = []; let total = 0;
  for(let i = 1; i < pts.length; i++){ const d = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); seg.push(d); total += d; }
  const at = t => { let r = t * total;
    for(let i = 0; i < seg.length; i++){ if(r <= seg[i] || i === seg.length - 1){ const f = seg[i] ? Math.min(1, r / seg[i]) : 0;
      return { x: pts[i].x + (pts[i+1].x - pts[i].x) * f, y: pts[i].y + (pts[i+1].y - pts[i].y) * f }; } r -= seg[i]; } };
  const kind = ch[0].stiff >= .3 ? 'かため' : ch[0].stiff >= .15 ? 'ふつう' : ch[0].stiff >= .08 ? 'やわらかい' : 'ふわふわ';
  const name = ch[0].name.replace(/(_?\d+|[ab])$/, '') || '揺れ';
  edit('揺れる 骨を ' + n + '本に', () => {
    const gone = new Set(ch.map(x => x.id)), parent = ch[0].parent;
    const ids = []; let par = parent;
    for(let i = 0; i < n; i++){
      const nb = boneAt(name + '_' + (i + 1), par, at(i / n), at((i + 1) / n), softAt(kind, i, n));
      ids.push(nb.id); par = nb.id;
    }
    S.proj.bones.forEach(x => { if(!gone.has(x.id) && gone.has(x.parent)) x.parent = ids[ids.length - 1]; });
    const moved = S.proj.slots.filter(sl => gone.has(sl.bone));
    S.proj.slots.forEach(sl => { if(gone.has(sl.bone)) return;
      sl.verts.forEach(v => (v.w || []).forEach(w => { if(gone.has(w.b)) w.b = ids[0]; })); });
    S.proj.bones = S.proj.bones.filter(x => !gone.has(x.id));
    S.proj.iks = (S.proj.iks || []).filter(k => !k.bones.some(id => gone.has(id)) && !gone.has(k.target));
    for(const nm in S.proj.anims) gone.forEach(id => delete S.proj.anims[nm].tracks[id]);
    markDirty();
    const sp2 = setupPose();
    moved.forEach(sl => { sl.verts.forEach(v => { v.w = []; }); sl.bone = ids[0];
      autoWeights(S.proj, sl, sp2, { maxBones:2, falloff:2, only: ids }); });
    markDirty();
    S.sel = { bone: ids[0], slot: null, ik: null };
  });
  S.springState = {}; S.spring = true;
  setStatus('揺れる 骨を ' + n + '本に しました');
  refreshUI();
}

/* プロパティに「やわらかさ」を 足す（揺れる 骨を えらんだ とき） */
const _buildProps0 = buildProps;
buildProps = function(){
  _buildProps0();
  const b = boneById(S.sel.bone);
  if(!b || !b.spring || slotById(S.sel.slot)) return;
  const host = $('#props');
  const anchor = [...host.querySelectorAll('.title')].find(t => /揺れ/.test(t.textContent));
  const box = el('div', 'soft-box');
  const ch = springChain(b);
  box.appendChild(el('div', 'hint', 'やわらかさ（' + ch.length + '本 まとめて）'));
  const r1 = el('div', 'soft-row');
  Object.keys(SOFT).forEach(k => r1.appendChild(mkBtn(k, () => setSoftness(b, k), 'btn btn-sm')));
  box.appendChild(r1);
  box.appendChild(el('div', 'hint', '曲がる ところを ふやす（いまは ' + ch.length + '本）'));
  const r2 = el('div', 'soft-row');
  [3, 4, 6].forEach(n => r2.appendChild(mkBtn(n + '本に', () => splitChain(b, n), 'btn btn-sm' + (ch.length === n ? ' on' : ''))));
  box.appendChild(r2);
  if(anchor) anchor.after(box); else host.appendChild(box);
};

function segDist(sp, b, bx){
  const p = sp[b.id]; if(!p) return 1e9;
  const e = M.apply(p.world, b.len, 0);
  return distToSeg(bx.cx, bx.cy, p.world.tx, p.world.ty, e.x, e.y);
}

/* タップの 受け口。editor.js の pointerdown より 先に とる */
cv.addEventListener('pointerdown', e => {
  if(!S.tapRig || e.button !== 0) return;
  e.stopImmediatePropagation(); e.preventDefault();
  const { sx, sy } = evPos(e);
  tapNext(s2w(sx, sy));
}, true);

/* 描画に さわった 点を 重ねる（render の 最後に 足す） */
const _render0 = render;
render = function(){
  _render0();
  if(S.tapRig && !S.live){
    ctx.setTransform(S.view.z, 0, 0, S.view.z, S.view.x, S.view.y);
    drawTapMarks();
  }
};

/* ================= 書き出し ================= */
/** 1ループぶんを、こま 1まいずつ 絵に する（揺れ物理も のせる） */
function renderFrames(fps, maxSide, onStep){
  const a = anim(), c = S.proj.canvas;
  const sc = Math.min(1, maxSide / Math.max(c.w, c.h));
  const W = Math.round(c.w * sc), H = Math.round(c.h * sc);
  const n = Math.max(2, Math.round(a.dur * fps));
  const dt = a.dur / n;
  const st = {}, useSpring = S.spring || S.proj.bones.some(b => b.spring);
  const pose = t => { const p = computePose(S.proj, a, t); applyIKs(S.proj, p); applySprings(S.proj, p, dt, st, useSpring); return p; };
  // 揺れが おちつくまで 1ループ 空回し（つなぎ目が とばないように）
  if(useSpring) for(let i = 0; i < n; i++) pose(i * dt);
  const out = [];
  for(let i = 0; i < n; i++){
    const p = pose(i * dt);
    const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
    const g = cvs.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0);
    for(const slot of S.proj.slots){
      if(!slot.visible) continue;
      const img = S.imgs[slot.image]; if(!img) continue;
      const buf = new Float32Array(slot.verts.length * 2);
      deformSlot(slot, p, buf);
      drawSlot(g, slot, img, buf);
    }
    out.push(cvs);
    if(onStep) onStep(i + 1, n);
  }
  return { frames: out, W, H, fps: n / a.dur, dur: a.dur };
}

const HANDOFF_DB = 'haani-handoff';
function handoffPut(key, val){
  return new Promise((ok, ng) => {
    const r = indexedDB.open(HANDOFF_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('box');
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('box', 'readwrite');
      tx.objectStore('box').put(val, key);
      tx.oncomplete = () => { db.close(); ok(); };
      tx.onerror = () => { db.close(); ng(tx.error); };
    };
  });
}

function busy(msg){
  let b = $('#busy');
  if(!b){ b = el('div'); b.id = 'busy'; b.appendChild(el('span')); document.body.appendChild(b); }
  b.firstChild.textContent = msg || '';
  b.classList.toggle('on', !!msg);
}
const nextPaint = () => new Promise(r => setTimeout(r, 40));   // 字を 出してから 重い 作業に 入る

async function sendToKobo(){
  if(!S.proj.slots.length) return setStatus('絵が ありません');
  sheet.hide();
  busy('こまを つくっています…');
  await nextPaint();
  try{
    const r = renderFrames(12, 1080);
    busy('アニメ工房へ 送っています…');
    await nextPaint();
    await handoffPut('mini-spine', {
      at: Date.now(),
      name: (S.proj.name && S.proj.name !== 'untitled' ? S.proj.name : 'ミニSpine') + '・' + S.proj.current,
      w: r.W, h: r.H, fps: r.fps, dur: r.dur, bg: S.proj.canvas.bg,
      frames: r.frames.map(c => c.toDataURL('image/png'))
    });
    await saveNow();
    location.href = '../anime-kobo/?from=mini-spine';
  }catch(err){
    busy('');
    alert('送れませんでした: ' + (err && err.message || err));
  }
}

/** 動画を つくる。こまを 先に ぜんぶ 作ってから、きっちり 同じ 間かくで 流して 録る */
async function makeVideo(withBg){
  if(typeof MediaRecorder === 'undefined') throw new Error('この ブラウザでは 動画に できません');
  busy('こまを つくっています…');
  await nextPaint();
  const fps = 30;
  const r = renderFrames(fps, 1080);
  const loops = Math.max(1, Math.ceil(6 / r.dur));
  const out = document.createElement('canvas'); out.width = r.W & ~1; out.height = r.H & ~1;
  const g = out.getContext('2d');
  const mime = (withBg ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
                       : ['video/webm;codecs=vp9', 'video/webm'])
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
  const draw = c => { g.clearRect(0, 0, out.width, out.height); if(withBg){ g.fillStyle = S.proj.canvas.bg; g.fillRect(0, 0, out.width, out.height); } g.drawImage(c, 0, 0); };
  draw(r.frames[0]);
  const stream = out.captureStream(fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : { videoBitsPerSecond: 8e6 });
  rec.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  const done = new Promise(ok => rec.onstop = ok);
  rec.start();
  const total = r.frames.length * loops, t0 = performance.now();
  for(let i = 0; i < total; i++){
    draw(r.frames[i % r.frames.length]);
    busy('動画に しています… ' + Math.round(i / total * 100) + '%');
    const wait = t0 + (i + 1) * 1000 / fps - performance.now();
    await new Promise(ok => setTimeout(ok, Math.max(0, wait)));
  }
  rec.stop();
  await done;
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  const ext = /mp4/.test(type) ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type }), ext, loops, w: out.width, h: out.height };
}

const baseName = () => (S.proj.name && S.proj.name !== 'untitled' ? S.proj.name : 'minispine') + '_' + S.proj.current;

async function saveVideo(withBg){
  if(!S.proj.slots.length) return setStatus('絵が ありません');
  sheet.hide();
  try{
    const v = await makeVideo(withBg);
    download(baseName() + '.' + v.ext, v.blob);
    setStatus('動画を 保存しました（' + v.ext + '・' + v.loops + 'ループ）');
  }catch(err){ alert(err.message || err); }
  finally{ busy(''); }
}

async function sendToDouga(){
  if(!S.proj.slots.length) return setStatus('絵が ありません');
  sheet.hide();
  try{
    const v = await makeVideo(true);
    busy('動画工房へ 送っています…');
    await handoffPut('mini-spine-video', {
      at: Date.now(), name: 'ミニSpine・' + S.proj.current,
      w: v.w, h: v.h, blob: v.blob, fileName: baseName() + '.' + v.ext
    });
    await saveNow();
    location.href = '../douga-kobo/?from=mini-spine';
  }catch(err){
    busy('');
    alert('送れませんでした: ' + (err && err.message || err));
  }
}

function openExport(){
  sheet.show('書き出し', body => {
    body.appendChild(el('div', 'sh-note', 'いまの アニメ「' + S.proj.current + '」（' + anim().dur.toFixed(1) + '秒）を 書き出します。'));
    const g = el('div', 'sh-grid wide');
    const big = (icon, ttl, note, fn) => {
      const b = mkBtn('', fn, 'mv wide');
      b.append(el('i', null, icon), el('span', null, ttl), el('small', null, note));
      g.appendChild(b);
    };
    big('🎬', 'アニメ工房へ 送る', 'こま（12まい/秒）の レイヤーに なって ひらきます。文字や 背景を 足して 仕上げる 用。', sendToKobo);
    big('📼', '動画工房へ 送る', '動画（背景あり・6秒ほど）に して ひらきます。音楽や ほかの 動画と つなぐ 用。', sendToDouga);
    big('🎞', '動画で 保存（背景あり）', 'mp4 か webm。6秒ほど くり返します。', () => saveVideo(true));
    big('🫥', '動画で 保存（すける）', '背景なしの webm（Chrome）。重ねて 使う 用。', () => saveVideo(false));
    body.appendChild(g);
  });
}

/* ================= じどう保存 =================
   手が 止まるたびに 端末の中へ しまう。ひらいたら つづきから。 */
const SAVE_DB = 'mini-spine';
function saveDb(mode, fn){
  return new Promise((ok, ng) => {
    if(!self.indexedDB) return ng(new Error('no idb'));
    const r = indexedDB.open(SAVE_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('doc');
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('doc', mode);
      const q = fn(tx.objectStore('doc'));
      tx.oncomplete = () => { db.close(); ok(q && q.result); };
      tx.onerror = () => { db.close(); ng(tx.error); };
    };
  });
}
let saveTimer = 0;
function saveNow(){
  clearTimeout(saveTimer);
  if(!S.proj.slots.length) return Promise.resolve();
  return saveDb('readwrite', st => st.put({ at: Date.now(), json: snapshotWithImages() }, 'last')).catch(() => {});
}
function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1200); }

const _commit0 = commitEdit;
commitEdit = function(){ _commit0(); saveSoon(); };
addEventListener('pagehide', () => { saveNow(); });
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') saveNow(); });

/* ひらいたとき、しまって あれば つづきを 出す */
saveDb('readonly', st => st.get('last')).then(rec => {
  if(!rec || !rec.json || S.proj.slots.length) return;
  loadProject(rec.json);
  setTimeout(() => setStatus('前回の つづきを ひらきました（' + new Date(rec.at).toLocaleString() + '）'), 600);
}).catch(() => {});

function newDoc(){
  if(!confirm('いまの 作品を 消して、まっさらに します（ファイルに 保存して いない ぶんは もどせません）')) return;
  S.proj = newProject(); S.imgs = {};
  S.sel = { bone: 'root', slot: null, ik: null };
  S.time = 0; S.springState = {}; S.playing = false;
  UNDO.stack = []; UNDO.idx = -1; UNDO.pending = null;
  saveDb('readwrite', st => st.delete('last')).catch(() => {});
  $('#animSel').dataset.n = '';
  fitView(); refreshUI();
  setStatus('まっさらに しました');
}

/* ================= 指の 操作（アニメ工房と おなじ） =================
   2本指トン＝もどす、3本指トン＝やりなおし。
   2本目の 指が おりたら、1本目で 動かしかけた ぶんは なかった ことに する。 */
const tap = { ids: new Map(), max: 0, t0: 0, moved: false };
cv.addEventListener('pointerdown', e => {
  if(e.pointerType !== 'touch') return;
  if(tap.ids.size === 0){ tap.max = 0; tap.t0 = performance.now(); tap.moved = false; }
  tap.ids.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tap.max = Math.max(tap.max, tap.ids.size);
  if(tap.ids.size >= 2 && UNDO.pending){
    const before = UNDO.pending.before;
    UNDO.pending = null;
    restore(before);
  }
});
cv.addEventListener('pointermove', e => {
  const p = tap.ids.get(e.pointerId); if(!p) return;
  if(Math.hypot(e.clientX - p.x, e.clientY - p.y) > 14) tap.moved = true;
});
const tapUp = e => {
  if(!tap.ids.delete(e.pointerId) || tap.ids.size) return;
  if(tap.moved || performance.now() - tap.t0 > 350 || S.tapRig) return;
  if(tap.max === 2) undo();
  else if(tap.max === 3) redo();
};
cv.addEventListener('pointerup', tapUp);
cv.addEventListener('pointercancel', e => { tap.ids.delete(e.pointerId); tap.moved = true; });

/* 開いた 作品の あみを 市松に 切り直す（線が 出にくい 切り方） */
const _load0 = loadProject;
loadProject = function(text){
  _load0(text);
  if(S.proj && S.proj.slots) S.proj.slots.forEach(checkerTris);
};

/* ================= PSD の グループから 骨を 組む =================
   グループの 入れ子を そのまま 親子に して、名前で 役を 決める。
     体 … 腰 から 上へ        頭 … 首 から 上へ（体の 子）
     腕・脚 … 付け根から 下へ 2本（ひじ・ひざで 曲がる）
     髪 … 付け根から 下へ 揺れる 3本（頭の 子）
     そのほか（目・口など）… まんなかに 短い 骨（いる グループの 子） */
function roleOf(name){
  if(RX.hair.test(name)) return 'hair';
  if(/頭|head|face|顔/i.test(name)) return 'head';
  if(RX.arm.test(name)) return 'arm';
  if(/脚|足|leg|foot/i.test(name)) return 'leg';
  if(RX.tail.test(name)) return 'hair';
  if(RX.body.test(name)) return 'body';
  return 'part';
}

function rigByGroups(){
  const slots = S.proj.slots.filter(s => s.verts.length);
  if(!slots.some(s => s.gpath && s.gpath.length)) return false;
  // グループの 木を つくる
  const rootN = { name:'', kids:new Map(), slots:[] };
  slots.forEach(sl => {
    let n = rootN;
    (sl.gpath || []).forEach(g => {
      if(!n.kids.has(g)) n.kids.set(g, { name:g, kids:new Map(), slots:[] });
      n = n.kids.get(g);
    });
    n.slots.push(sl);
  });
  const boxOf = n => {
    const all = [...n.slots];
    const walk = m => m.kids.forEach(k => { all.push(...k.slots); walk(k); });
    walk(n);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    all.forEach(sl => { const b = slotBox(sl); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); });
    return { x0, y0, x1, y1, cx:(x0 + x1) / 2, w:x1 - x0, h:y1 - y0 };
  };

  const root = S.proj.bones[0];
  S.proj.bones = [root]; S.proj.iks = [];
  for(const nm in S.proj.anims) S.proj.anims[nm].tracks = {};
  const whole = boxOf(rootN);
  root.parent = null; root.x = whole.cx; root.y = whole.y1; root.rot = -90;
  root.sx = root.sy = 1; root.shear = 0; root.len = Math.max(40, whole.h * 0.08);

  const P = (x, y) => ({ x, y });
  const top = { body:null, head:null };
  const attach = [];   // [パーツ群, 骨id群]

  function make(n, parentId, inHead){
    const bx = boxOf(n), role = roleOf(n.name);
    let ids;
    if(role === 'body'){
      const hasLeg = [...n.kids.keys()].concat(n.slots.map(s => s.name)).some(x => /脚|足|leg/i.test(x));
      const hip = hasLeg ? bx.y0 + bx.h * 0.55 : bx.y1;
      ids = [boneAt(n.name, parentId, P(bx.cx, hip), P(bx.cx, bx.y0)).id];
      top.body = top.body || ids[0];
    } else if(role === 'head' && !inHead){
      ids = [boneAt(n.name, parentId, P(bx.cx, bx.y1), P(bx.cx, bx.y0)).id];
      top.head = top.head || ids[0];
    } else if(role === 'hair'){
      ids = hairChain(n.name, parentId, P(bx.cx, bx.y0 + bx.h * 0.05), P(bx.cx, bx.y1), 3);
    } else if(role === 'arm' || role === 'leg'){
      // 横に ひろがる 腕なら、体の まんなかに 近い がわが 付け根
      const wide = bx.w > bx.h * 1.2;
      let a, e;
      if(wide){
        const leftIn = Math.abs(bx.x0 - whole.cx) < Math.abs(bx.x1 - whole.cx);
        a = P(leftIn ? bx.x0 : bx.x1, bx.y0 + bx.h * 0.3);
        e = P(leftIn ? bx.x1 : bx.x0, bx.y0 + bx.h * 0.6);
      } else { a = P(bx.cx, bx.y0); e = P(bx.cx, bx.y1); }
      const m = P((a.x + e.x) / 2, (a.y + e.y) / 2);
      const up = boneAt(n.name + '1', parentId, a, m);
      ids = [up.id, boneAt(n.name + '2', up.id, m, e).id];
    } else {
      const c = P(bx.cx, (bx.y0 + bx.y1) / 2);
      ids = [boneAt(n.name, parentId, c, P(c.x, c.y - Math.max(10, bx.h * 0.3))).id];
    }
    if(n.slots.length) attach.push([n.slots, ids]);
    const kidsParent = (role === 'arm' || role === 'leg') ? ids[ids.length - 1] : ids[0];
    n.kids.forEach(k => make(k, kidsParent, inHead || role === 'head'));
  }

  // いちばん 上の グループは 役で 親を きめる（体 → 頭・腕 → 髪）
  const order = { body:0, head:1, arm:2, leg:2, part:3, hair:4 };
  [...rootN.kids.values()]
    .sort((a, b) => order[roleOf(a.name)] - order[roleOf(b.name)])
    .forEach(n => {
      const role = roleOf(n.name);
      const parent = role === 'body' || role === 'leg' ? root.id
        : role === 'hair' ? (top.head || top.body || root.id)
        : (top.body || root.id);
      make(n, parent, false);
    });
  if(rootN.slots.length) attach.push([rootN.slots, [top.body || root.id]]);

  markDirty();
  const sp = setupPose();
  attach.forEach(([list, ids]) => list.forEach(sl => {
    sl.verts.forEach(v => { v.w = []; });
    sl.bone = ids[0];
    if(ids.length > 1) autoWeights(S.proj, sl, sp, { maxBones:2, falloff: ids.length > 2 ? 2 : 3, only: ids });
  }));
  markDirty();
  S.spring = true; S.springState = {};
  S.sel = { bone: top.head || root.id, slot: null, ik: null };
  return true;
}

const _importPsd0 = importPsd;
importPsd = async function(file){
  S.psdReplace = false;
  await _importPsd0(file);
  if(!S.psdReplace) return;
  beginEdit('グループから 骨を 組む');
  const ok = rigByGroups();
  commitEdit();
  if(ok){
    refreshUI();
    setStatus('PSD読み込み: ' + S.proj.slots.length + 'パーツ / 骨' + S.proj.bones.length + '本（グループから）。「✨ よくある動き」で すぐ 動かせます');
  }
};

/* ================= ボタンを 足す ================= */
(() => {
  const exp = el('button', 'btn btn-sm btn-y', '📤 書き出し'); exp.id = 'btnExport';
  exp.onclick = openExport;
  const nw = el('button', 'btn btn-sm', '🆕 新しく'); nw.id = 'btnNew';
  nw.onclick = newDoc;
  const acts = $('.tb-actions');
  acts.insertBefore(exp, $('#btnRec'));
  acts.insertBefore(nw, $('#btnAddImg'));

  const rig = el('button', 'opt', '🦴 タップで骨組み'); rig.id = 'btnTapRig';
  rig.title = '腰・首・頭・手先を さわるだけで 骨を 組む';
  rig.onclick = tapStart;
  $('#btnSpring').parentNode.insertBefore(rig, $('#btnSpring'));

  const mv = el('button', 'btn btn-sm btn-y', '✨ よくある動き'); mv.id = 'btnPreset2';
  mv.onclick = openMotions;
  $('#modes').appendChild(mv);
})();

/* つかいかたの 先頭に 新しい 流れを 足す */
const HELP_KOBO = `
<h4>いちばん かんたんな 流れ</h4>
<ol>
  <li><b>🖼 PSD / 画像</b> で 絵を 入れる</li>
  <li><b>🦴 タップで骨組み</b> → 腰・首・頭・手先の 順に さわる</li>
  <li><b>✨ よくある動き</b> → 「待機」「手を ふる」などを えらぶ</li>
  <li><b>📤 書き出し</b> → アニメ工房・動画工房へ 送る／動画で 保存</li>
</ol>
<ul>
  <li><b>2本指で トン</b> … もどす　<b>3本指で トン</b> … やりなおし</li>
  <li>作りかけは 端末に じどうで しまわれます。次に ひらくと つづきから。</li>
</ul>
`;
const _openHelp0 = openHelp;
openHelp = function(){
  const q = $('#helpQuick');
  if(q && !q.dataset.filled){ q.innerHTML = HELP_KOBO + HELP_QUICK; q.dataset.filled = '1'; }
  _openHelp0();
};
$('#btnHelp').onclick = openHelp;
refreshUI();
