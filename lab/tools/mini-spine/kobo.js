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
  }},
  /* 拍に あわせて カクッと かたむいて 止まる（縦に ならんだ キャラの PV の ような） */
  { name:'ビートで キメ', icon:'🥁', dur:2, fn:(a,B) => {
      keys(a, B.root, 'rot', [[0,0],[.08,-7],[.14,-5.5],[.5,-5.5],[.58,6],[.64,4.5],[.96,4.5],[1,0]]);
      keys(a, B.head, 'rot', [[0,0],[.08,4],[.2,1],[.5,1],[.58,-4],[.7,-1],[.96,-1],[1,0]]);
      squash(a, B.root, [[0,1],[.08,1.05],[.2,1],[.5,1],[.58,1.05],[.7,1],[1,1]]);
      bobY(a, B.root, [[0,0],[.08,-charSize()*.012],[.2,0],[.5,0],[.58,-charSize()*.012],[.7,0],[1,0]]);
  }},
  /* ゆっくり かたむき ながら すこし ふくらむ（止め絵を 生きて 見せる） */
  { name:'ゆらゆら ポートレート', icon:'🖼', dur:4, fn:(a,B) => {
      keys(a, B.root, 'rot', wave(1, 2.5));
      squash(a, B.root, [[0,1],[.5,1.02],[1,1]]);
      keys(a, B.head, 'rot', wave(1, -2, .25));
  }},
  /* ぴょこっと はねて、首を かしげ ながら 目を 閉じて にこっ */
  { name:'にこっ', icon:'😊', dur:2.4, fn:(a,B) => {
      bobY(a, B.root, [[0,0],[.1,-charSize()*.03],[.22,0],[1,0]]);
      squash(a, B.root, [[0,1],[.06,.95],[.12,1.05],[.24,1],[1,1]]);
      keys(a, B.head, 'rot', [[0,0],[.12,9],[.2,7],[.62,7],[.75,0],[1,0]]);
      eyeHold(a, [[.12, .66]]);
  }},
  /* 頭と 体を こきざみに ゆらして、髪や 飾りを なびかせ つづける */
  { name:'風に なびく', icon:'🌬', dur:1.6, fn:(a,B) => {
      keys(a, B.head, 'rot', wave(3, 1.6));
      keys(a, B.body, 'rot', wave(2, .8, .25));
      bobX(a, B.root, wave(2, charSize() * .004));
  }}
];

/* ---------- 動きの 中で 目を 閉じる ----------
   a.eyes = [[はじめ, おわり], …]（秒）。この あいだ まばたきと おなじ しくみで 目を 閉じる */
function eyeHold(a, list){ a.eyes = list.map(([f0, f1]) => [+(f0 * a.dur).toFixed(3), +(f1 * a.dur).toFixed(3)]); }
function animEyes(a, t){
  if(!a || !a.eyes) return 0;
  const R = 0.06; let k = 0;
  a.eyes.forEach(([t0, t1]) => {
    if(t < t0 - R || t > t1 + R) return;
    const v = t < t0 ? (t - (t0 - R)) / R : t > t1 ? ((t1 + R) - t) / R : 1;
    k = Math.max(k, Math.max(0, Math.min(1, v)));
  });
  return k;
}

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
      ? 'ボーンが 少ないので、全体が いっしょに 動きます。「🪄 かんたん設定」を 先に すると よく 動きます。'
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

const JOINT_STEPS = [
  { key:'ja', say:'親の パーツ（上腕・体 など、動かない がわ）を さわって', skip:false },
  { key:'jb', say:'子の パーツ（前腕・頭 など、曲がる がわ）を さわって', skip:false },
  { key:'jp', say:'曲がる 中心（ひじ・ひざ・首の 付け根）を さわって', skip:false }
];
const HAIR_STEPS = [
  { key:'base', say:'髪の 生え際（揺れの 付け根）を さわって', skip:false },
  { key:'tip',  say:'毛先を さわって', skip:false }
];
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
    if(pb.spring){
      const top = springChain(pb)[0] || pb;
      big('💇', '「' + top.name.replace(/_?\d+$/, '') + '」の 揺れる 骨を 組み直す', '生え際 → 毛先 の 2か所を さわる。揺れる 骨 4本で つなぎ直します。ほかの 骨と アニメは そのまま。', () => tapGo('hair', top.id));
    } else {
      big('✋', '「' + pb.name + '」だけ 組み直す', '付け根 → 曲がる ところ → 先っぽ の 順に さわる。ほかの 骨と アニメは そのまま。', () => tapGo('part', pb.id));
    }
    big('🧍', 'ぜんぶ 作り直す', '腰 → 首 → 頭 → 手先。いまの 骨と アニメの キーは 消えます。', () => tapGo('all'));
    body.appendChild(g);
  });
}
function tapGo(kind, target){
  sheet.hide();
  S.tapRig = { i:0, pts:{}, kind, target, steps: kind === 'part' ? PART_STEPS : kind === 'hair' ? HAIR_STEPS : kind === 'joint' ? JOINT_STEPS : TAP_STEPS };
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
  if(ok && r) r.kind === 'part' ? buildPartRig(r.target, r.pts)
            : r.kind === 'hair' ? buildHairRig(r.target, r.pts)
            : r.kind === 'joint' ? buildJoint(r.pts)
            : buildTapRig(r.pts);
  refreshUI();
}

/* さわった 点を 画面に 出す */
function drawTapMarks(){
  if(!S.tapRig) return;
  const z = S.view.z, P = S.tapRig.pts;
  const names = { hip:'腰', neck:'首', top:'頭', handR:'手', handL:'手', base:'付け根', mid:'曲がる', tip:'先', ja:'親', jb:'子', jp:'関節' };
  const line = (a, b) => { if(!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  ctx.lineWidth = 5 / z; ctx.strokeStyle = MAIN_DEEP;
  line(P.hip, P.neck); line(P.neck, P.top); line(P.neck, P.handR); line(P.neck, P.handL);
  line(P.base, P.mid || P.tip); line(P.mid, P.tip);
  line(P.ja, P.jp); line(P.jb, P.jp);
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
  fixNeck(true);
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
  'かため':     { s0:.35, s1:.20, damp:.80, grav:.03, lim0:6,  lim1:15 },
  'ふつう':     { s0:.22, s1:.10, damp:.86, grav:.06, lim0:8,  lim1:22 },
  'やわらかい': { s0:.16, s1:.06, damp:.88, grav:.08, lim0:10, lim1:28 },
  'ふわふわ':   { s0:.10, s1:.035, damp:.92, grav:.04, lim0:12, lim1:35 }
};
function softAt(kind, i, n){
  const k = SOFT[kind] || SOFT['やわらかい'], t = n > 1 ? i / (n - 1) : 0;
  /* 根もとは 頭に ほぼ くっついて いる（少しだけ 振れる）。先へ 行くほど 大きく 振れて いい */
  return { spring:true, stiff: +(k.s0 + (k.s1 - k.s0) * t).toFixed(3), damp:k.damp, grav:k.grav, inertia:1,
           limit: Math.round(k.lim0 + (k.lim1 - k.lim0) * t) };
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
function buildHairRig(targetId, P){
  const b = boneById(targetId);
  if(!b || !P || !P.base || !P.tip) return;
  splitChain(b, 4, [P.base, P.tip]);
  setStatus('揺れる 骨を 組み直しました。「② アニメート」で 頭を 動かすと 揺れます');
}

function splitChain(b, n, line){
  const ch = springChain(b); if(!ch.length) return;
  const sp = setupPose();
  let pts = [{ x: sp[ch[0].id].world.tx, y: sp[ch[0].id].world.ty }];
  ch.forEach(x => pts.push(M.apply(sp[x.id].world, x.len, 0)));
  if(line) pts = line;   // さわった 生え際 → 毛先 で 引き直す
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
  const sl = slotById(S.sel.slot);
  const b = sl ? boneById(sl.bone) : boneById(S.sel.bone);
  if(!b || !b.spring) return;
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
  if(S.tool === 'create' && !S.live && !S.rec && !S.shapeEdit && !S.playing) drawCreateHints();
  if(S.shapeEdit && !S.live) drawShapeHints();
  // 再生中は 動きを 見る ときなので、わく・札・線は 出さない
  if(!S.live && !S.rec && !S.tapRig && !S.shapeEdit && !S.playing) drawParentLinks();
};

/* 作成ツール: 骨の 先っぽに 輪を 出す（ここから 引くと 関節で つながる）。
   引いて いる あいだは できる 骨を 先に 見せる */
function drawCreateHints(){
  const z = S.view.z, pose = setupPose();
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  const d = S.drag && S.drag.type === 'newbone' ? S.drag : null;
  const sl = slotById(S.sel.slot);
  const made = sl && S.createFor && S.createFor.slot === sl.id ? S.createFor.ids.map(boneById).filter(Boolean) : null;
  const list = sl ? (made || []) : S.proj.bones;
  if(sl && !d && !(made && made.length)){
    const bx = slotBox(sl);
    label('「' + sl.name + '」の 付け根から 引いて 骨を 作る', bx.x0, bx.y0 - 12 / z, z);
  }
  list.forEach(b => {
    const p = pose[b.id]; if(!p) return;
    const t = M.apply(p.world, b.len, 0), sel = b.id === S.sel.bone;
    ctx.beginPath(); ctx.arc(t.x, t.y, (sel ? 12 : 8) / z, 0, 7);
    ctx.lineWidth = (sel ? 3 : 2) / z; ctx.strokeStyle = sel ? INK : GRAY;
    ctx.setLineDash(sel ? [] : [3 / z, 3 / z]); ctx.stroke(); ctx.setLineDash([]);
    if(sel && !d) label('ここから 引くと つながる', t.x + 16 / z, t.y - 12 / z, z);
  });
  if(d){
    ctx.beginPath(); ctx.moveTo(d.ox, d.oy); ctx.lineTo(d.x, d.y);
    ctx.lineWidth = 6 / z; ctx.strokeStyle = MAIN_DEEP; ctx.stroke();
    ctx.beginPath(); ctx.arc(d.ox, d.oy, 7 / z, 0, 7); ctx.fillStyle = d.snapped ? MAIN : PAPER; ctx.fill();
    ctx.lineWidth = 2 / z; ctx.strokeStyle = INK; ctx.stroke();
  }
}

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
  const out = [], spFrames = setupPose();
  for(let i = 0; i < n; i++){
    const p = pose(i * dt);
    const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
    const g = cvs.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0);
    paintParts(g, p, spFrames, Math.max(blinkOn ? loopBlink(i * dt, a.dur) : 0, animEyes(a, i * dt)));
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
  const clips = autoClip();
  commitEdit();
  fixNeck(true);
  // 絵の 読みこみを 待ってから まぶたを しらべる
  setTimeout(() => {
    beginEdit('まぶたを しらべる'); const lids = autoLids(); commitEdit();
    const msg = [clips ? clips + 'まいの 瞳を 白目で 切りぬき' : '', lids ? lids + 'まいの まぶたを まばたき用に' : ''].filter(Boolean).join('、');
    if(msg) setStatus(msg + 'しました（パーツの 右パネルで 変えられます）');
  }, 300);
  if(ok){
    refreshUI();
    setStatus('PSD読み込み: ' + S.proj.slots.length + 'パーツ / 骨' + S.proj.bones.length + '本（グループから）。「✨ よくある動き」で すぐ 動かせます');
  }
};

/* ================= 作業中の 画質（アニメ工房と おなじ） =================
   小さく 描いて 画面で ひきのばす。パーツが 多くても 指に ついてくる。
   書き出し（動画・アニメ工房へ）は いつも きれいな まま。 */
const QUAL = [[1, 'きれい'], [0.75, 'ふつう'], [0.55, 'かるい'], [0.4, 'とても かるい']];
let qual = 1;
try{ const q = parseFloat(localStorage.getItem('miniSpine.quality')); if(q > 0.2 && q <= 1) qual = q; }catch(e){}
const qualName = () => (QUAL.find(x => Math.abs(x[0] - qual) < .02) || QUAL[0])[1];

let lastW = cv.width;   // editor.js の もとの resize も 走るので、自分が 決めた 幅を おぼえて おく
resize = function(){
  const r = $('#view').getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2) * qual;
  const ow = lastW;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  // 紙の こまかさが 変わっても、見えて いる 場所は そのまま
  if(ow > 1 && cv.width > 1 && ow !== cv.width){
    const k = cv.width / ow;
    S.view.x *= k; S.view.y *= k; S.view.z *= k;
  }
  lastW = cv.width;
};
addEventListener('resize', resize);
function showQual(){
  const b = $('#btnQual'); if(!b) return;
  b.textContent = '画質 ' + qualName();
  b.classList.toggle('on', qual < 1);
}
function nextQual(){
  const i = QUAL.findIndex(x => Math.abs(x[0] - qual) < .02);
  qual = QUAL[(i + 1) % QUAL.length][0];
  try{ localStorage.setItem('miniSpine.quality', String(qual)); }catch(e){}
  resize(); showQual();
  setStatus('画質を「' + qualName() + '」に しました（書き出しは いつも きれい）');
}

/* ================= 曲げない パーツは 1回で 描く =================
   目・口・顔のように 1本の 骨に まるごと ついている パーツは、
   三角に 切って 何十回も 描く ひつようが ない。骨の 動きで 1回 貼るだけ。
   パーツが 多い PSD では これが いちばん 効く（三角の 数が 1/10 以下に なる）。 */
function rigidBone(slot){
  let id = null;
  for(const v of slot.verts){
    const w = v.w && v.w.length ? v.w : null;
    let b;
    if(!w) b = slot.bone;
    else if(w.length === 1 || w.filter(x => x.w > 0.999).length === 1) b = (w.find(x => x.w > 0.999) || w[0]).b;
    else { id = null; break; }
    if(id === null) id = b; else if(id !== b){ id = null; break; }
  }
  return id;
}
function drawRigid(g, slot, img, pose, sp, squashY, squashCy){
  if(S.meshEdit) return false;
  const id = rigidBone(slot);
  const p = id && pose[id], s0 = id && sp[id];
  if(!p || !s0 || slot.verts.length < 3) return false;
  // 絵(u,v) → もとの 場所 → 骨に ついて 動いた 場所
  let m = M.mul(M.mul(p.world, M.inv(s0.world)), placeOf(slot));
  if(squashY && squashY < 1){
    // 絵の まんなかを 中心に たてに つぶす（まばたき）
    const im = S.proj.images[slot.image] || {};
    const cy = squashCy ?? M.apply(m, (im.w || img.width) / 2, (im.h || img.height) / 2).y;
    const Q = { a:1, b:0, c:0, d:squashY, tx:0, ty:cy * (1 - squashY) };
    m = M.mul(Q, m);
  }
  g.save();
  g.globalAlpha *= (slot.alpha ?? 1);
  g.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
  g.drawImage(img, 0, 0);
  g.restore();
  return true;
}

/* ================= まばたき =================
   ・「目 開」「目 閉」の 2まいが ある … 入れかえる
   ・目が 1まい だけ … 目の パーツを たてに つぶして 閉じる
   アニメート中・配信モード・書き出し で うごく。 */
const EYE_RX = /目|瞳|白目|まぶた|睫|eye|iris|pupil|lash/i, NOT_EYE = /眉|brow/i;
let blinkOn = true;
try{ blinkOn = localStorage.getItem('miniSpine.blink') !== '0'; }catch(e){}
const isEye = sl => EYE_RX.test(sl.name) && !NOT_EYE.test(sl.name);
const hasSwap = () => !!(S.proj.eyeOpen || S.proj.eyeClose);
/** まばたきを はじめて から u 秒の とじぐあい（0 あいてる 〜 1 とじてる） */
function blinkCurve(u){
  if(u < 0 || u > 0.18) return 0;
  return u < 0.06 ? u / 0.06 : u < 0.1 ? 1 : 1 - (u - 0.1) / 0.08;
}
const BL = { next: 2.5, t: -1 };
function tickBlink(dt){
  if(BL.t >= 0){ BL.t += dt; if(BL.t > 0.18) BL.t = -1; }
  else if((BL.next -= dt) <= 0){ BL.t = 0; BL.next = 2 + Math.random() * 3; }
  return BL.t >= 0 ? blinkCurve(BL.t) : 0;
}
/** 書き出し用。1ループに 1回、6わりの ところで（短すぎる ループは しない） */
function loopBlink(t, dur){
  if(dur < 1.2) return 0;
  return blinkCurve(t - dur * 0.6);
}

/* 目の パーツを 「右目」「左目」に わけて、それぞれ どの 高さへ 閉じるか を きめる。
   まぶた・白目・瞳を べつべつに つぶすと 上まぶたが 下りて こない ので、
   1つの 目は 同じ 線（目の 高さの 6わり）へ むかって つぶす。 */
function eyeLines(pose, sp){
  const eyes = S.proj.slots.filter(isEye), out = new Map();
  if(!eyes.length) return out;
  const side = sl => /右|right|_r\b|\.r\b|r$/i.test(sl.name) ? 'R' : /左|left|_l\b|\.l\b|l$/i.test(sl.name) ? 'L' : null;
  const boxes = eyes.map(sl => ({ sl, b: slotBox(sl) }));
  const mid = boxes.reduce((a, o) => a + o.b.cx, 0) / boxes.length;
  const groups = {};
  boxes.forEach(o => { const k = side(o.sl) || (o.b.cx < mid ? 'A' : 'B'); (groups[k] = groups[k] || []).push(o); });
  for(const k in groups){
    const list = groups[k];
    const y0 = Math.min(...list.map(o => o.b.y0)), y1 = Math.max(...list.map(o => o.b.y1));
    const cx = list.reduce((a, o) => a + o.b.cx, 0) / list.length;
    const line = { x: cx, y: y0 + (y1 - y0) * 0.6 };
    // 骨が 動いた ぶん だけ 線も うごかす
    const id = rigidBone(list[0].sl) || list[0].sl.bone;
    const p = pose[id], s0 = sp[id];
    const w = (p && s0) ? M.apply(M.mul(p.world, M.inv(s0.world)), line.x, line.y) : line;
    list.forEach(o => out.set(o.sl.id, w.y));
  }
  return out;
}

/* ================= クリップ（アニメ工房と おなじ） =================
   slot.clipTo に えらんだ パーツの 形で ぬく。瞳を 白目で、かげを はだで ぬく など。
   ① 下の 絵だけを 別紙に 描く  ② 上の 絵たちを 別の 紙に 描く
   ③ ②を ①の 形で ぬく（destination-in）④ ①→③ の 順に 本番へ */
const _clipSheets = [];
function clipSheet(i, w, h){
  let c = _clipSheets[i];
  if(!c){ c = _clipSheets[i] = document.createElement('canvas'); }
  if(c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  return c;
}

/** 目の パーツ名から、瞳を 同じ がわの 白目で ぬく 組み合わせを つくる */
function autoClip(){
  const W = /白目|white|sclera/i, P = /瞳|目玉|iris|pupil|ハイライト|highlight/i;
  const side = n => /右|right|_r\b|r$/i.test(n) ? 'R' : /左|left|_l\b|l$/i.test(n) ? 'L' : '';
  let n = 0;
  S.proj.slots.forEach(sl => {
    if(sl.clipTo || !P.test(sl.name) || W.test(sl.name)) return;
    const base = S.proj.slots.find(o => o !== sl && W.test(o.name) && side(o.name) === side(sl.name));
    if(base){ sl.clipTo = base.id; n++; }
  });
  return n;
}

/* Live2D 用の PSD では「まぶた」が 目を まるごと おおう はだ色の ふた に なって いる ことが ある。
   ふだんは かくして、まばたきの ときだけ 出す（出しっぱなしだと 目が 見えない）。
   見分け方: 名前が まぶた で、中が ほぼ ぬって あって、白目に 大きく かさなる もの */
function fillRatio(img){
  const c = document.createElement('canvas');
  const w = c.width = Math.max(1, Math.min(96, img.naturalWidth || img.width));
  const h = c.height = Math.max(1, Math.round(w * (img.naturalHeight || img.height) / (img.naturalWidth || img.width)));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let n = 0;
  for(let i = 3; i < d.length; i += 4) if(d[i] > 128) n++;
  return n / (w * h);
}
function autoLids(){
  const LID = /まぶた|瞼|eyelid|lid/i, W = /白目|white|sclera/i;
  const whites = S.proj.slots.filter(o => W.test(o.name)).map(o => slotBox(o));
  let n = 0;
  S.proj.slots.forEach(sl => {
    if(!LID.test(sl.name) || sl.lidCover !== undefined) return;
    const img = S.imgs[sl.image]; if(!img || !img.complete) return;
    const b = slotBox(sl);
    const over = whites.some(w => {
      const ix = Math.max(0, Math.min(b.x1, w.x1) - Math.max(b.x0, w.x0));
      const iy = Math.max(0, Math.min(b.y1, w.y1) - Math.max(b.y0, w.y0));
      return ix * iy > 0.3 * (w.x1 - w.x0) * (w.y1 - w.y0);
    });
    if(over && fillRatio(img) > 0.5){ sl.lidCover = true; n++; }
  });
  return n;
}

/** パーツを ぜんぶ 描く（画面・書き出し 共通）。k … とじぐあい */
function paintParts(g, pose, sp, k){
  const swap = hasSwap();
  const hasLids = S.proj.slots.some(x => x.lidCover);
  const useShapes = hasShapes();   // 閉じ目を 作って あれば、つぶさずに それで 閉じる
  const lines = (!swap && !hasLids && !useShapes && blinkOn && k > 0) ? eyeLines(pose, sp) : null;
  const eo = S.proj.eyeOpen, ec = S.proj.eyeClose;
  const shown = slot => {
    let vis = slot.visible;
    /* 「目(開)／目(閉)」「口(開)／口(閉)」は、どちらか 片方だけ 出す。
       配信モードでは editor.js（マイク・まばたき）が visible を 切りかえる ので そちらに まかせる */
    if(!S.live){
      if(swap && eo && ec){
        const closed = blinkOn && k >= 0.5;
        if(slot.id === eo) vis = vis && !closed;
        if(slot.id === ec) vis = !!S.imgs[slot.image] && closed;
      } else if(swap && ec && slot.id === ec){
        vis = blinkOn && k >= 0.5;     // 閉じ目だけ ある ときは、まばたきの 間だけ かぶせる
      }
      const mo = S.proj.mouthOpen, mc = S.proj.mouthClose;
      if(mo && mc && slot.id === mo) vis = false;   // ふだんは 閉じ口
      if(mo && mc && slot.id === mc) vis = !!S.imgs[slot.image];
    }
    // まぶたの ふたは まばたきの ときだけ
    if(slot.lidCover) vis = vis && blinkOn && k >= 0.35;
    return vis && !!S.imgs[slot.image];
  };
  const one = (gg, slot) => {
    const img = S.imgs[slot.image];
    const sq = (!swap && !hasLids && !useShapes && blinkOn && k > 0 && isEye(slot) && !slot.lidCover) ? Math.max(0.08, 1 - k * 0.92) : 1;
    const cy = lines && lines.get(slot.id);
    const shaped = k > 0 && slot.shapes && slot.shapes.close;
    if(!shaped && drawRigid(gg, slot, img, pose, sp, sq, cy)) return;
    const n = slot.verts.length;
    let buf = slot._xy;
    if(!buf || buf.length < n*2) buf = slot._xy = new Float32Array(n*2);
    deformSlot(slot, pose, buf);
    if(shaped) addShape(slot, buf, pose, sp, k);
    if(sq < 1){
      let y0 = 1e9, y1 = -1e9;
      for(let i = 0; i < n; i++){ const y = buf[i*2+1]; if(y < y0) y0 = y; if(y > y1) y1 = y; }
      const c = cy ?? (y0 + y1) / 2;
      for(let i = 0; i < n; i++) buf[i*2+1] = c + (buf[i*2+1] - c) * sq;
    }
    drawSlot(gg, slot, img, buf);
  };
  // ぬく 側（clipTo が いきている もの）は、ぬかれる 絵の すぐ 上で まとめて 描く
  const ids = new Set(S.proj.slots.map(x => x.id));
  const clippersOf = {};
  S.proj.slots.forEach(sl => { if(sl.clipTo && sl.clipTo !== sl.id && ids.has(sl.clipTo)) (clippersOf[sl.clipTo] = clippersOf[sl.clipTo] || []).push(sl); });
  const tf = g.getTransform(), W = g.canvas.width, H = g.canvas.height;
  for(const slot of S.proj.slots){
    if(slot.clipTo && clippersOf[slot.clipTo] && clippersOf[slot.clipTo].includes(slot)) continue;
    const clippers = (clippersOf[slot.id] || []).filter(shown);
    if(!clippers.length){ if(shown(slot)) one(g, slot); continue; }
    const cB = clipSheet(0, W, H), cC = clipSheet(1, W, H);
    const gB = cB.getContext('2d'), gC = cC.getContext('2d');
    gB.setTransform(tf); gC.setTransform(tf);
    gB.globalAlpha = gC.globalAlpha = g.globalAlpha;
    if(shown(slot)) one(gB, slot);
    clippers.forEach(c => one(gC, c));
    gC.setTransform(1,0,0,1,0,0);
    gC.globalAlpha = 1;
    gC.globalCompositeOperation = 'destination-in';
    gC.drawImage(cB, 0, 0);
    gC.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1,0,0,1,0,0); g.globalAlpha = 1;
    g.drawImage(cB, 0, 0); g.drawImage(cC, 0, 0);
    g.restore();
  }
}

let blinkK = 0, blinkLast = performance.now();
drawParts = function(pose){
  const now = performance.now(), dt = Math.min(0.1, (now - blinkLast) / 1000); blinkLast = now;
  // 配信モードの 入れかえは editor.js が やる ので、ここでは アニメート中だけ
  const run = blinkOn && (S.mode === 'anim' || S.live) && !(S.live && hasSwap());
  blinkK = run ? tickBlink(dt) : 0;
  if(S.mode === 'anim' || S.live) blinkK = Math.max(blinkK, animEyes(anim(), S.time));
  const se = S.shapeEdit;
  if(se){
    // 閉じ目づくり中は つまみの 値。「試す」を 押したら ゆっくり 1回 まばたき
    if(se.test){
      const t = (now - se.test) / 1000;
      blinkK = t < 0.9 ? blinkCurve(t / 5) : 0;
      if(t >= 0.9){ se.test = 0; }
    } else blinkK = se.k;
  }
  paintParts(ctx, pose, setupPose(), blinkK);
};

function setBlink(on){
  blinkOn = on;
  try{ localStorage.setItem('miniSpine.blink', on ? '1' : '0'); }catch(e){}
  const b = $('#btnBlink'); if(b) b.classList.toggle('on', on);
  const n = hasSwap() ? '「目 開／目 閉」を 入れかえ' : S.proj.slots.filter(isEye).length + 'まいの 目を つぶして';
  setStatus(on ? 'まばたき オン（' + n + '）。アニメート・配信・書き出しで 動きます' : 'まばたき オフ');
}

/* 首・頭 を えらんで いる ときは「首と 頭を つなぐ」 */
const _buildProps2 = buildProps;
buildProps = function(){
  _buildProps2();
  const sl = slotById(S.sel.slot), b = boneById(S.sel.bone);
  const hit = (sl && (NECK_RX.test(sl.name) || /顔|face|頭/i.test(sl.name))) || (!sl && b && b === headBone());
  if(!hit || !neckSlot()) return;
  const host = $('#props');
  const box = el('div', 'neck-box');
  box.appendChild(el('div', 'title', '首と 頭'));
  box.appendChild(el('div', 'hint', '頭を 回すと 首から とれて 見える ときに 押す。\n頭の 回る 中心を 首の 上へ うつして、\n首を 体と 頭に わけて つなぎます。'));
  box.appendChild(btnRow(mkBtn('🔗 首と 頭を つなぐ', () => fixNeck(false), 'btn btn-y')));
  host.insertBefore(box, host.firstChild);
};

/* パーツの 右パネルに「クリップ」を 足す */
const _buildProps1 = buildProps;
buildProps = function(){
  _buildProps1();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props');
  const box = el('div', 'clip-box');
  box.appendChild(el('div', 'title', 'クリップ（切りぬき）'));
  box.appendChild(el('div', 'hint', 'えらんだ パーツの 形の 中だけ 見せる。\n瞳を 白目で、かげを はだで ぬく など。'));
  const row = el('div', 'row');
  row.appendChild(el('label', null, 'ぬく形'));
  const sel = el('select');
  const none = el('option', null, '— しない —'); none.value = ''; sel.appendChild(none);
  S.proj.slots.forEach(o => {
    if(o === sl || o.clipTo === sl.id) return;
    const op = el('option', null, o.name); op.value = o.id;
    if(sl.clipTo === o.id) op.selected = true;
    sel.appendChild(op);
  });
  sel.onchange = () => {
    edit('クリップ', () => { if(sel.value) sl.clipTo = sel.value; else delete sl.clipTo; });
    setStatus(sel.value ? sl.name + ' を ' + slotById(sel.value).name + ' の 形で ぬきます' : 'クリップを 外しました');
    refreshUI();
  };
  row.appendChild(sel);
  box.appendChild(row);
  if(/まぶた|瞼|lid/i.test(sl.name) || sl.lidCover){
    box.appendChild(chk('まばたきの ときだけ 出す（目を おおう まぶた）', () => !!sl.lidCover, v => { sl.lidCover = v; }));
  }
  const anchorT = [...host.querySelectorAll('.title')].find(t => /パーツ/.test(t.textContent));
  if(anchorT){ let n = anchorT.nextSibling; while(n && !(n.classList && n.classList.contains('title'))) n = n.nextSibling; host.insertBefore(box, n || null); }
  else host.appendChild(box);
};

/* ================= 閉じ目を つくる（Live2D の キーフォーム の ような もの） =================
   目の パーツに 点（ピン）を たくさん 打って、筆で 押して「閉じた 形」を つくる。
   いまの 絵が「開いた 形」。まばたきの とき、開いた 形 → 閉じた 形 へ なめらかに うつる。
   覚えるのは 点ごとの ずれ だけ（slot.shapes.close = [dx,dy, dx,dy, ...]）。
   骨が 動いても ついていく よう、ずれは 骨の 向きに あわせて 回して 足す。 */
const hasShapes = () => S.proj.slots.some(sl => sl.shapes && sl.shapes.close);

/** 閉じ目の ずれを k だけ 足す（buf は 骨で 動かした あとの 点） */
function addShape(slot, buf, pose, sp, k){
  const off = slot.shapes && slot.shapes.close;
  if(!off || k <= 0) return;
  const id = rigidBone(slot) || slot.bone;
  const p = pose[id], s0 = sp[id];
  const m = (p && s0) ? M.mul(p.world, M.inv(s0.world)) : M.ident();
  const n = Math.min(slot.verts.length, off.length / 2);
  for(let i = 0; i < n; i++){
    const dx = off[i*2] * k, dy = off[i*2+1] * k;
    buf[i*2]   += m.a * dx + m.c * dy;
    buf[i*2+1] += m.b * dx + m.d * dy;
  }
}

const shapeBar = (() => {
  const bar = el('div'); bar.id = 'shapeBar';
  const msg = el('div', 'sb-msg');
  const row1 = el('div', 'sb-row');
  const r = el('input'); r.type = 'range'; r.min = 10; r.max = 300; r.step = 1;
  const kk = el('input'); kk.type = 'range'; kk.min = 0; kk.max = 1; kk.step = 0.01;
  const lab = (t, inp) => { const w = el('label', 'sb-l'); w.append(el('span', null, t), inp); return w; };
  row1.append(lab('筆の 大きさ', r), lab('開く ⇄ 閉じる', kk));
  const row2 = el('div', 'sb-row');
  const fine = mkBtn('ピンを 細かく', () => shapeFine(), 'btn btn-sm');
  const reset = mkBtn('閉じ形を 消す', () => shapeReset(), 'btn btn-sm danger');
  const play = mkBtn('▶ まばたき 試す', () => { S.shapeEdit.test = performance.now(); }, 'btn btn-sm');
  const done = mkBtn('おわり', () => shapeEnd(), 'btn btn-sm btn-y');
  row2.append(fine, reset, play, done);
  bar.append(msg, row1, row2);
  $('#view').appendChild(bar);
  r.oninput = () => { if(S.shapeEdit) S.shapeEdit.r = +r.value; };
  kk.oninput = () => { if(S.shapeEdit){ S.shapeEdit.k = +kk.value; S.shapeEdit.test = 0; } };
  return { bar, msg, r, kk };
})();

function shapeTargets(){
  const sel = slotById(S.sel.slot);
  const list = S.proj.slots.filter(sl => isEye(sl) && !sl.lidCover);
  if(sel && !list.includes(sel)) list.push(sel);
  return list;
}

function shapeStart(){
  const list = shapeTargets();
  if(!list.length) return setStatus('目の パーツが 見つかりません。目の パーツを えらんでから 押してね');
  sheet.hide();
  S.mode = 'setup'; S.playing = false; S.springState = {};
  const c = S.proj.canvas;
  S.shapeEdit = { ids: list.map(x => x.id), k: 1, r: Math.round(Math.max(c.w, c.h) * 0.02), test: 0, grab: null, at: null };
  shapeBar.r.max = Math.round(Math.max(c.w, c.h) * 0.12);
  shapeBar.r.value = S.shapeEdit.r; shapeBar.kk.value = 1;
  shapeBar.msg.textContent = '閉じた 目を つくる（' + list.length + 'まい: ' + list.map(x => x.name).slice(0, 4).join('・') + (list.length > 4 ? '…' : '') + '）。'
    + 'まつ毛や まぶたを 指で 押して 閉じた 形に。今の 絵が 開いた 形です';
  document.body.classList.add('shaping');
  refreshUI();
}
function shapeEnd(){
  S.shapeEdit = null;
  document.body.classList.remove('shaping');
  setStatus(hasShapes() ? '閉じ目を 覚えました。アニメート・配信・書き出しで まばたきします' : '閉じ目づくりを おわりました');
  refreshUI();
}
function shapeReset(){
  const ids = S.shapeEdit.ids;
  edit('閉じ形を 消す', () => ids.forEach(id => { const sl = slotById(id); if(sl && sl.shapes) delete sl.shapes.close; }));
}
/** 点を ふやす。切りなおすと 点の ならびが 変わる ので、閉じ形は 消える */
function shapeFine(){
  const ids = S.shapeEdit.ids;
  const had = ids.some(id => { const sl = slotById(id); return sl && sl.shapes && sl.shapes.close; });
  if(had && !confirm('点を ふやすと、いま 作った 閉じ形は 消えます。いいですか？')) return;
  edit('ピンを 細かく', () => ids.forEach(id => {
    const sl = slotById(id); if(!sl) return;
    const b = slotBox(sl);
    const cols = clamp(Math.round(b.w / Math.max(6, S.shapeEdit.r * 0.5)), 10, 28);
    const rows = clamp(Math.round(b.h / Math.max(6, S.shapeEdit.r * 0.5)), 8, 28);
    remesh(sl, cols, rows);
    if(sl.shapes) delete sl.shapes.close;
  }));
  setStatus('点を ふやしました');
}

/* 筆（つかんで 引っぱる）。押した ところの まわりの 点ほど よく 動く */
cv.addEventListener('pointerdown', e => {
  const se = S.shapeEdit;
  if(!se || e.button !== 0) return;
  if(tap.ids.size >= 2){ se.grab = null; return; }   // 2本目の 指は 画面の 移動
  const { sx, sy } = evPos(e);
  const w = s2w(sx, sy);
  se.k = 1; shapeBar.kk.value = 1; se.test = 0;
  const hits = [];
  se.ids.forEach(id => {
    const sl = slotById(id); if(!sl) return;
    const off = (sl.shapes && sl.shapes.close) || new Array(sl.verts.length * 2).fill(0);
    sl.verts.forEach((v, i) => {
      const x = v.x + (off[i*2] || 0), y = v.y + (off[i*2+1] || 0);
      const d = Math.hypot(x - w.x, y - w.y);
      if(d < se.r){ const f = 1 - d / se.r; hits.push({ sl, i, wgt: f * f * (3 - 2 * f), ox: off[i*2] || 0, oy: off[i*2+1] || 0 }); }
    });
  });
  if(!hits.length){ se.grab = null; return; }
  beginEdit('閉じ目を つくる');
  se.grab = { w0: w, hits };
});
window.addEventListener('pointermove', e => {
  const se = S.shapeEdit; if(!se) return;
  const { sx, sy } = evPos(e);
  se.at = s2w(sx, sy);
  const g = se.grab; if(!g) return;
  if(tap.ids.size >= 2){ se.grab = null; return; }
  const dx = se.at.x - g.w0.x, dy = se.at.y - g.w0.y;
  g.hits.forEach(h => {
    const sl = h.sl;
    if(!sl.shapes) sl.shapes = {};
    if(!sl.shapes.close || sl.shapes.close.length !== sl.verts.length * 2) sl.shapes.close = new Array(sl.verts.length * 2).fill(0);
    sl.shapes.close[h.i*2]   = +(h.ox + dx * h.wgt).toFixed(2);
    sl.shapes.close[h.i*2+1] = +(h.oy + dy * h.wgt).toFixed(2);
  });
});
window.addEventListener('pointerup', () => {
  const se = S.shapeEdit; if(!se || !se.grab) return;
  se.grab = null;
  commitEdit();
});

/* 閉じ目づくり中の 点と 筆の 輪 */
function drawShapeHints(){
  const se = S.shapeEdit; if(!se) return;
  const z = S.view.z;
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  ctx.fillStyle = 'rgba(30,28,20,.55)';
  se.ids.forEach(id => {
    const sl = slotById(id); if(!sl) return;
    const off = sl.shapes && sl.shapes.close;
    sl.verts.forEach((v, i) => {
      const x = v.x + (off ? off[i*2] * se.k : 0), y = v.y + (off ? off[i*2+1] * se.k : 0);
      ctx.beginPath(); ctx.arc(x, y, 2.2 / z, 0, 7); ctx.fill();
    });
  });
  if(se.at){
    ctx.beginPath(); ctx.arc(se.at.x, se.at.y, se.r, 0, 7);
    ctx.lineWidth = 2 / z; ctx.strokeStyle = se.grab ? MAIN_DEEP : INK; ctx.setLineDash([5 / z, 4 / z]); ctx.stroke(); ctx.setLineDash([]);
  }
}

/* ================= 親子の つながりを 画面に 出す（After Effects の 親の 線） =================
   ・パーツを えらぶ → そのパーツから 親の 骨まで 線を ひいて「親: 頭」
   ・骨を えらぶ   → その骨に ついて いる パーツを ぜんぶ ふちどり、線で むすぶ */
function slotBones(slot){
  const used = new Map();
  slot.verts.forEach(v => (v.w || []).forEach(w => used.set(w.b, (used.get(w.b) || 0) + w.w)));
  const ids = used.size ? [...used.keys()] : [slot.bone];
  const main = (ids.includes(slot.bone) && boneById(slot.bone)) || boneById(ids[0]) || boneById(slot.bone);
  return { main, ids };
}
function slotScreenBox(slot, pose){
  const n = slot.verts.length; if(!n) return null;
  const buf = new Float32Array(n * 2);
  deformSlot(slot, pose, buf);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(let i = 0; i < n; i++){ const x = buf[i*2], y = buf[i*2+1];
    if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
  return { x0, y0, x1, y1, cx:(x0 + x1) / 2, cy:(y0 + y1) / 2 };
}
function boneMid(b, pose){
  const p = pose[b.id]; if(!p) return null;
  return M.apply(p.world, b.len / 2, 0);
}
function linkLine(a, b, z, col){
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 2.5 / z; ctx.strokeStyle = col; ctx.setLineDash([7 / z, 5 / z]); ctx.stroke(); ctx.setLineDash([]);
  [a, b].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5 / z, 0, 7); ctx.fillStyle = col; ctx.fill(); });
}
function outline(bx, z, col){
  const pad = 6 / z;
  ctx.lineWidth = 2 / z; ctx.strokeStyle = col; ctx.setLineDash([4 / z, 3 / z]);
  ctx.strokeRect(bx.x0 - pad, bx.y0 - pad, bx.x1 - bx.x0 + pad * 2, bx.y1 - bx.y0 + pad * 2);
  ctx.setLineDash([]);
}
/** 画面の 大きさに かかわらず 読める 札（ふち つき） */
function tag(text, x, y, z, fill){
  const dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
  const fs = 13 * dpr / z, px = 6 * dpr / z, h = fs * 1.6;
  ctx.font = '800 ' + fs + 'px "M PLUS Rounded 1c", sans-serif';
  const w = ctx.measureText(text).width + px * 2;
  ctx.fillStyle = fill || PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2 * dpr / z;
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x, y - h / 2, w, h, h / 2); else ctx.rect(x, y - h / 2, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = fill === INK ? MAIN : INK; ctx.textBaseline = 'middle'; ctx.fillText(text, x + px, y);
  ctx.textBaseline = 'alphabetic';
}
function drawParentLinks(){
  const pose = curPose; if(!pose) return;
  const z = S.view.z;
  ctx.setTransform(z, 0, 0, z, S.view.x, S.view.y);
  const sl = slotById(S.sel.slot);
  if(sl){
    const { main, ids } = slotBones(sl);
    const bx = slotScreenBox(sl, pose); if(!bx || !main) return;
    const m = boneMid(main, pose); if(!m) return;
    // えらんで いる パーツは 太い 二重の わくと 名前で はっきり
    const dpr = cv.width / (cv.getBoundingClientRect().width || cv.width);
    const pad = 8 * dpr / z;
    const rx = bx.x0 - pad, ry = bx.y0 - pad, rw = bx.x1 - bx.x0 + pad * 2, rh = bx.y1 - bx.y0 + pad * 2;
    ctx.lineWidth = 6 * dpr / z; ctx.strokeStyle = INK; ctx.strokeRect(rx, ry, rw, rh);
    ctx.lineWidth = 3 * dpr / z; ctx.strokeStyle = MAIN; ctx.strokeRect(rx, ry, rw, rh);
    tag('▶ ' + sl.name, rx, ry - 14 * dpr / z, z, INK);
    linkLine({ x: bx.cx, y: bx.cy }, m, z, INK);
    tag('⛓ 親: ' + main.name + (ids.length > 1 ? '（ほか' + (ids.length - 1) + '本で まがる）' : ''), m.x + 12 / z, m.y, z, MAIN);
    return;
  }
  const b = boneById(S.sel.bone); if(!b) return;
  const m = boneMid(b, pose); if(!m) return;
  let n = 0;
  S.proj.slots.forEach(s => {
    if(!s.visible) return;
    const { ids } = slotBones(s);
    if(!ids.includes(b.id)) return;
    const bx = slotScreenBox(s, pose); if(!bx) return;
    outline(bx, z, MAIN_DEEP);
    linkLine({ x: bx.cx, y: bx.cy }, m, z, MAIN_DEEP);
    tag(s.name, bx.x0, bx.y0 - 14 / z, z);
    n++;
  });
  if(n) tag('⛓ ' + b.name + ' に ついている: ' + n + 'まい', m.x + 12 / z, m.y, z, MAIN);
}

/* えらんだ 行が 一覧の 外に かくれて いたら 見える ところへ */
const _refreshUI1 = refreshUI;
refreshUI = function(){
  _refreshUI1();
  requestAnimationFrame(() => document.querySelectorAll('#treeBody .item.sel, #orderBody .item.sel').forEach(e => {
    try{ e.scrollIntoView({ block:'nearest' }); }catch(_){}
  }));
};

/* ================= 首と 頭を つなぐ =================
   頭が 首から とれて 見える のは、たいてい
     ① 頭の 骨の 根もと（回る 中心）が 首の 付け根に ない
     ② 首の パーツが 体（や root）だけに ついて いて、頭に ついて いかない
   の どちらか。ボタン 1つで 両方 なおす。
     ・頭の 骨の 根もとを、首の 上の ほう（あごの 少し 上）へ うつす（絵は 動かさない）
     ・首は 下が 体、上が 頭に つく ように ウェイトを わける（回すと ゴムの ように のびる） */
const NECK_RX = /首|neck/i;
function neckSlot(){ return S.proj.slots.find(sl => NECK_RX.test(sl.name) && !/首輪|choker|襟|collar/i.test(sl.name)); }
function headBone(){
  return S.proj.bones.find(b => /^(頭|頭部|head)$/i.test(b.name)) || S.proj.bones.find(b => /頭|head/i.test(b.name) && !b.spring) || null;
}

/** 骨の 根もとと 向きを、絵も 子の 骨も 動かさずに 変える（コンペンセイト） */
function moveBoneKeep(b, P, E){
  const sp = setupPose();
  const pw = b.parent && sp[b.parent] ? sp[b.parent].world : M.ident();
  const kids = S.proj.bones.filter(x => x.parent === b.id);
  const kidWorld = kids.map(k => sp[k.id].world);
  const lo = M.apply(M.inv(pw), P.x, P.y);
  b.x = lo.x; b.y = lo.y;
  b.rot = Math.atan2(E.y - P.y, E.x - P.x) * 180 / Math.PI - M.rotOf(pw);
  b.sx = b.sy = 1; b.shear = 0;
  b.len = Math.max(10, Math.hypot(E.x - P.x, E.y - P.y) / (M.scaleOf(pw) || 1));
  const nw = computePose(S.proj, null, 0)[b.id].world;
  kids.forEach((k, i) => {
    const d = M.decompose(M.mul(M.inv(nw), kidWorld[i]));
    k.x = d.x; k.y = d.y; k.rot = d.rot; k.sx = d.sx; k.sy = d.sy; k.shear = d.shear;
  });
}

function fixNeck(quiet){
  const neck = neckSlot(), head = headBone();
  if(!neck || !head){
    if(!quiet) setStatus(!neck ? '「首」という 名前の パーツが 見つかりません' : '「頭」の 骨が 見つかりません');
    return false;
  }
  const body = boneById(head.parent) || S.proj.bones[0];
  const nb = slotBox(neck);
  const face = S.proj.slots.find(sl => /^(顔|face|輪郭)$/i.test(sl.name)) || S.proj.slots.find(sl => /顔|face|輪郭/i.test(sl.name));
  const fb = face ? slotBox(face) : null;
  // 回る 中心: 首の まんなかの 線の、あごより 少し 上（顔に かくれる ところ）
  const chin = fb ? Math.min(Math.max(fb.y1, nb.y0), nb.y1) : nb.y0 + nb.h * 0.3;
  const P = { x: nb.cx, y: chin - nb.h * 0.12 };
  const top = fb ? fb.y0 : P.y - nb.h * 3;
  edit('首と 頭を つなぐ', () => {
    moveBoneKeep(head, P, { x: P.x, y: Math.min(top, P.y - 20) });
    markDirty();
    // 首: 下の はしは 体、回る 中心より 上は 頭。あいだは なめらかに
    const yb = nb.y1, yt = P.y;
    neck.bone = body.id;
    neck.verts.forEach(v => {
      let t = (yb - v.y) / Math.max(1, yb - yt);
      t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t);
      v.w = t < 0.01 ? [{ b: body.id, w: 1 }] : t > 0.99 ? [{ b: head.id, w: 1 }]
          : [{ b: body.id, w: 1 - t }, { b: head.id, w: t }];
    });
    markDirty();
  });
  if(!quiet) setStatus('首と 頭を つなぎました（頭の 回る 中心を 首の 上へ・首は 体と 頭に わけて つけた）');
  refreshUI();
  return true;
}

/* ================= パーツを 指で えらぶ =================
   曲げない パーツは 1回で 描く ように したので、描いた ときの 点（_xy）が のこらない。
   その場で 骨の 動きから 点を 出して あたりを 見る */
pickSlot = function(w){
  const pose = curPose || setupPose();
  for(let i = S.proj.slots.length - 1; i >= 0; i--){
    const s = S.proj.slots[i];
    if(!s.visible || s.lidCover || !s.verts.length) continue;
    const xy = new Float32Array(s.verts.length * 2);
    deformSlot(s, pose, xy);
    const t = s.tris;
    for(let k = 0; k < t.length; k += 3){
      if(ptInTri(w.x, w.y, xy[t[k]*2], xy[t[k]*2+1], xy[t[k+1]*2], xy[t[k+1]*2+1], xy[t[k+2]*2], xy[t[k+2]*2+1])) return s;
    }
  }
  return null;
};

/* ================= 関節を つくる =================
   親の パーツ・子の パーツ・曲がる 中心 を さわると、
   ・子の 骨の 根もとを 関節へ（絵は 動かさない）、親の 骨の 子に する
   ・子の パーツの 関節まわりを 親と 子に わけて つける（曲げても 切れずに のびる）
   首と 頭・上腕と 前腕・体と 脚 など どこでも つかえる。 */
function setParentKeep(b, parentId){
  const sp = setupPose();
  const w = sp[b.id].world, pw = sp[parentId].world;
  const d = M.decompose(M.mul(M.inv(pw), w));
  b.parent = parentId;
  b.x = d.x; b.y = d.y; b.rot = d.rot; b.sx = d.sx; b.sy = d.sy; b.shear = d.shear;
}
function buildJoint(P){
  if(!P || !P.ja || !P.jb || !P.jp) return;
  const A = pickSlot(P.ja), B = pickSlot(P.jb);
  if(!A || !B) return setStatus('パーツが 見つかりませんでした。絵の 上を さわってね');
  if(A === B) return setStatus('親と 子に おなじ パーツを えらんで います');
  let bA = slotBones(A).main || S.proj.bones[0];
  let bB = slotBones(B).main;
  const J = P.jp;
  const farFrom = (sl, p) => { let f = p, d0 = -1; sl.verts.forEach(v => { const d = Math.hypot(v.x - p.x, v.y - p.y); if(d > d0){ d0 = d; f = { x:v.x, y:v.y }; } }); return f; };
  // 子の いちばん 遠い ところ（骨の 先）
  const far = farFrom(B, J);
  edit('関節を つくる', () => {
    // 親の パーツが root に じかに ついて いる だけ なら、親 にも 自分の 骨を 作る（上腕を 回せる ように）
    if(!bA.parent){
      const rootId = bA.id;
      bA = boneAt(A.name, rootId, farFrom(A, J), J);
      A.verts.forEach(v => { v.w = []; });
      A.bone = bA.id;
      if(bB && bB.id === rootId) bB = null;
      markDirty();
    }
    // 子の 骨が 親と おなじ／親の 上の 骨なら、子 専用の 骨を 新しく 作る
    if(!bB || bB === bA || isDescendant(bA.id, bB.id)){
      bB = boneAt(B.name, bA.id, J, far);
    } else {
      if(bB.parent !== bA.id) setParentKeep(bB, bA.id);
      moveBoneKeep(bB, J, far);
    }
    markDirty();
    // 関節の まわり（骨の 長さの 2わり）を なめらかに わける
    const dx = far.x - J.x, dy = far.y - J.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const zone = Math.max(8, L * 0.2);
    B.bone = bB.id;
    B.verts.forEach(v => {
      const pr = (v.x - J.x) * ux + (v.y - J.y) * uy;   // 関節から 先へ どれだけ
      let t = (pr + zone * 0.5) / (zone * 1.5);
      t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t);
      v.w = t > 0.99 ? [{ b: bB.id, w: 1 }] : t < 0.01 ? [{ b: bA.id, w: 1 }]
          : [{ b: bA.id, w: 1 - t }, { b: bB.id, w: t }];
    });
    markDirty();
    S.sel = { bone: bB.id, slot: null, ik: null };
  });
  setStatus('関節を つくりました: ' + A.name + ' → ' + B.name + '（「' + bB.name + '」を 回すと ' + B.name + ' が 曲がります）');
}

/* ================= かんたん設定（1まいの 絵に 関節を 打つ） =================
   イラストに よって「ひじから 先が 1まい」「顔と 首が 1まい」など ばらばら。
   なので「何を 動かしたいか」を えらんで、絵の 上に 関節の 順に 点を 打つ だけ に する。
   点と 点の あいだが 骨に なり、1まいの 絵でも 点の ところで 曲がる。 */
const FINGER_J = ['指の 付け根', '第2関節', '第1関節', '指先'];
const CHAIN_T = [
  { id:'face', icon:'🙂', name:'顔と 首が 1まい', note:'首の 付け根 → あご → 頭の てっぺん',
    labels:['首の 付け根（肩の あいだ）', 'あご（首と 顔の さかい）', '頭の てっぺん'], names:['首', '頭'] },
  { id:'arm', icon:'💪', name:'腕（肩から 手まで 1まい）', note:'肩 → ひじ → 手首 → 指先',
    labels:['肩', 'ひじ', '手首', '指先'], names:['上腕', '前腕', '手'] },
  { id:'arm2', icon:'🤚', name:'腕（ひじから 先だけ 1まい）', note:'ひじ → 手首 → 指先',
    labels:['ひじ', '手首', '指先'], names:['前腕', '手'] },
  { id:'leg', icon:'🦵', name:'脚（1まい）', note:'付け根 → ひざ → 足首 → つま先',
    labels:['脚の 付け根', 'ひざ', '足首', 'つま先'], names:['もも', 'すね', '足'] },
  { id:'finger', icon:'🖐', name:'手と 指', note:'手首 → 手のひら → 指ごとに 付け根・第2関節・第1関節・指先', fingers:true },
  { id:'swing', icon:'💇', name:'髪・しっぽ・リボン（揺れる）', note:'付け根から 先へ 好きな 数。多いほど しなやか', open:true, spring:true },
  { id:'free', icon:'✏', name:'自由（好きな 数）', note:'曲げたい ところに 順に 点を 打つ', open:true }
];

function chainLabel(r, i){
  const t = r.tmpl;
  if(t.fingers){
    if(i === 0) return '手首';
    if(i === 1) return '手のひらの まんなか';
    const k = Math.floor((i - 2) / 4), j = (i - 2) % 4;
    return '指' + (k + 1) + 'の ' + FINGER_J[j];
  }
  if(t.open) return i === 0 ? '付け根' : (i + 1) + 'つめの 点（先っぽ まで 打ったら「できた」）';
  return t.labels[i];
}
function chainCanFinish(r){
  const n = r.list.length, t = r.tmpl;
  if(t.fingers) return n >= 6 && (n - 2) % 4 === 0;
  if(t.open) return n >= 2;
  return n >= t.labels.length;
}
function chainTotal(r){ return r.tmpl.fingers || r.tmpl.open ? null : r.tmpl.labels.length; }

function openEasy(){
  sheet.show('🪄 かんたん設定', body => {
    const sl = slotById(S.sel.slot);
    body.appendChild(el('div', 'sh-note', sl
      ? 'えらんで いる レイヤー:「' + sl.name + '」。ちがう レイヤーなら、えらんだ あとで 最初に その絵を さわれば OK'
      : 'まず どこを 動かしたいか えらぶ → 動かしたい 絵を さわる → 関節の 順に 点を 打つ'));
    const g = el('div', 'sh-grid wide');
    const big = (icon, ttl, note, fn) => {
      const b = mkBtn('', fn, 'mv wide');
      b.append(el('i', null, icon), el('span', null, ttl), el('small', null, note));
      g.appendChild(b);
    };
    big('🧍', '全身（はじめての 骨組み）', '腰 → 首 → 頭 → 手先 を さわる。いまの 骨は 作り直し', () => { sheet.hide(); tapGo('all'); });
    const pb = partBone();
    if(pb && pb.spring){
      const top = springChain(pb)[0] || pb;
      big('💇', '「' + top.name.replace(/_?\d+$/, '') + '」の 揺れる 骨を 組み直す', '生え際 → 毛先 の 2か所', () => tapGo('hair', top.id));
    } else if(pb){
      big('✋', '「' + pb.name + '」だけ 組み直す', '付け根 → 曲がる ところ → 先っぽ', () => tapGo('part', pb.id));
    }
    CHAIN_T.forEach(t => big(t.icon, t.name, t.note, () => chainStart(t)));
    big('🔗', 'パーツが 分かれて いる 関節', '上腕と 前腕・顔と 首 など 2まいの 絵を つなぐ', () => { sheet.hide(); tapGo('joint'); });
    body.appendChild(g);
  });
}

function chainStart(t){
  sheet.hide();
  const sl = slotById(S.sel.slot);
  S.tapRig = { kind:'chain', tmpl:t, slot: sl ? sl.id : null, needSlot: !sl, list:[], i:0, pts:{} };
  S.mode = 'setup'; S.playing = false;
  document.body.classList.add('taprig');
  tapShow(); refreshUI();
}

/* tapBar に「できた」を 足す */
tapBar.done = mkBtn('できた', () => { if(S.tapRig && chainCanFinish(S.tapRig)) tapEnd(true); }, 'btn btn-sm btn-y');
tapBar.bar.insertBefore(tapBar.done, tapBar.bar.lastChild);
tapBar.done.style.display = 'none';

const _tapShow0 = tapShow, _tapNext0 = tapNext, _tapBack0 = tapBack, _tapEnd0 = tapEnd;
tapShow = function(){
  const r = S.tapRig;
  if(!r || r.kind !== 'chain'){ tapBar.done.style.display = 'none'; return _tapShow0(); }
  const sl = slotById(r.slot);
  const tot = chainTotal(r);
  tapBar.msg.textContent = r.needSlot
    ? '動かしたい レイヤー（' + r.tmpl.name + '）の 絵を さわって'
    : (tot ? (r.list.length + 1) + '/' + tot + '　' : (r.list.length + 1) + 'つめ　')
      + chainLabel(r, r.list.length) + ' を さわって' + (sl ? '（' + sl.name + '）' : '');
  tapBar.skip.style.display = 'none';
  tapBar.back.disabled = r.needSlot || (r.list.length === 0 && !r.slotPicked);
  const can = chainCanFinish(r);
  tapBar.done.style.display = (r.tmpl.fingers || r.tmpl.open) ? '' : 'none';
  tapBar.done.disabled = !can;
  tapBar.done.textContent = r.tmpl.fingers ? (can ? 'この 指で おわり' : '指の 先まで 打ってね') : 'できた';
};
tapNext = function(pt){
  const r = S.tapRig;
  if(!r || r.kind !== 'chain') return _tapNext0(pt);
  if(!pt) return;
  if(r.needSlot){
    const s = pickSlot(pt);
    if(!s) return setStatus('絵の 上を さわってね');
    r.slot = s.id; r.needSlot = false; r.slotPicked = true;
    S.sel.slot = s.id; refreshUI();
    return tapShow();
  }
  r.list.push(pt);
  const tot = chainTotal(r);
  if(tot && r.list.length >= tot) return tapEnd(true);
  tapShow();
};
tapBack = function(){
  const r = S.tapRig;
  if(!r || r.kind !== 'chain') return _tapBack0();
  if(r.list.length) r.list.pop();
  else if(r.slotPicked){ r.needSlot = true; r.slotPicked = false; }
  tapShow();
};
tapEnd = function(ok){
  const r = S.tapRig;
  if(!r || r.kind !== 'chain') return _tapEnd0(ok);
  S.tapRig = null;
  document.body.classList.remove('taprig');
  tapBar.done.style.display = 'none';
  if(ok) buildChain(r);
  refreshUI();
};

/* 打った 点を 番号つきで 見せる */
const _drawTapMarks0 = drawTapMarks;
drawTapMarks = function(){
  const r = S.tapRig;
  if(!r || r.kind !== 'chain') return _drawTapMarks0();
  const z = S.view.z, L = r.list;
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
  ctx.lineWidth = 6 / z; ctx.strokeStyle = MAIN_DEEP;
  if(r.tmpl.fingers){
    if(L[1]) seg(L[0], L[1]);
    for(let i = 2; i < L.length; i++) seg((i - 2) % 4 === 0 ? L[1] : L[i - 1], L[i]);
  } else for(let i = 1; i < L.length; i++) seg(L[i - 1], L[i]);
  L.forEach((p, i) => {
    ctx.fillStyle = MAIN; ctx.strokeStyle = INK; ctx.lineWidth = 3 / z;
    ctx.beginPath(); ctx.arc(p.x, p.y, 11 / z, 0, 7); ctx.fill(); ctx.stroke();
    tag(String(i + 1) + ' ' + chainLabel(r, i).replace(/（.*）/, ''), p.x + 14 / z, p.y, z);
  });
};

function buildChain(r){
  const sl = slotById(r.slot), L = r.list, t = r.tmpl;
  if(!sl || L.length < 2) return setStatus('点が 足りません');
  const anchor = slotBones(sl).main || S.proj.bones[0];
  const ids = [];
  edit(t.name + 'を 設定', () => {
    if(t.fingers){
      const palm = boneAt(sl.name + '_手のひら', anchor.id, L[0], L[1]);
      ids.push(palm.id);
      for(let k = 0; 2 + k * 4 + 3 < L.length; k++){
        const p = L.slice(2 + k * 4, 2 + k * 4 + 4);
        let par = palm.id;
        for(let j = 0; j < 3; j++){
          const b = boneAt('指' + (k + 1) + '_' + (j + 1), par, p[j], p[j + 1]);
          ids.push(b.id); par = b.id;
        }
      }
    } else {
      let par = anchor.id;
      for(let i = 0; i + 1 < L.length; i++){
        const nm = t.names ? (t.names[i] || t.names[t.names.length - 1]) : null;
        const base = t.spring ? sl.name + '_揺れ' : (nm || sl.name + '_骨');
        const extra = t.spring && typeof softAt === 'function' ? softAt('やわらかい', i, L.length - 1) : null;
        const b = boneAt(t.open || !nm ? base + (i + 1) : (nm === '手' || nm === '足' ? nm : nm), par, L[i], L[i + 1], extra);
        ids.push(b.id); par = b.id;
      }
    }
    markDirty();
    // 1まいの 絵を、つけ先（動かない がわ）と 作った 骨たちに なめらかに わける
    const sp = setupPose();
    sl.verts.forEach(v => { v.w = []; });
    sl.bone = ids[0];
    autoWeights(S.proj, sl, sp, { maxBones:2, falloff: t.fingers ? 4 : 3, only: (anchor.parent ? [anchor.id] : []).concat(ids) });
    markDirty();
    S.sel = { bone: ids[0], slot: sl.id, ik: null };
  });
  if(t.spring){ S.spring = true; S.springState = {}; }
  const fingers = t.fingers ? Math.floor((L.length - 2) / 4) : 0;
  setStatus(t.fingers
    ? '手のひらと 指' + fingers + '本（関節 3つずつ）を 作りました。骨を 回すと 指が 曲がります'
    : '「' + sl.name + '」に 骨を ' + ids.length + '本 入れました。点の ところで 曲がります');
}

/* ================= セットアップに 切りかえたら 再生を 止める =================
   止めないと 動きは 止まって 見えるのに、時間の バーだけ 進み つづける */
(() => {
  const b = $('#mSetup'), f0 = b.onclick;
  b.onclick = (e) => { S.playing = false; f0 && f0(e); refreshPlayBtn(); };
})();
const _render1 = render;
render = function(){
  if(S.playing && S.mode === 'setup' && !S.live && !S.rec){ S.playing = false; refreshPlayBtn(); }
  _render1();
};

/* ================= ツールの 枠を 動かせる ように =================
   左の つまみ（⋮⋮）を ドラッグ。2回 たたくと もとの 場所。場所は 次に ひらいた ときも のこる */
(() => {
  const box = $('#maintools'), view = $('#view');
  const grip = el('div', 'mt-grip', '⋮⋮');
  grip.title = 'ドラッグで 動かす（2回 たたくと もとの 場所）';
  box.insertBefore(grip, box.firstChild);
  const KEY = 'miniSpine.toolsPos';
  const place = (fx, fy) => {
    const vr = view.getBoundingClientRect(), br = box.getBoundingClientRect();
    const x = Math.max(4, Math.min(vr.width - br.width - 4, fx * vr.width));
    const y = Math.max(4, Math.min(vr.height - br.height - 4, fy * vr.height));
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.bottom = 'auto'; box.style.transform = 'none';
  };
  const reset = () => {
    box.style.left = box.style.top = box.style.bottom = box.style.transform = '';
    try{ localStorage.removeItem(KEY); }catch(_){}
  };
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(_){}
  if(saved) requestAnimationFrame(() => place(saved.x, saved.y));
  let drag = null, lastTap = 0;
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const now = performance.now();
    if(now - lastTap < 350){ reset(); lastTap = 0; return; }
    lastTap = now;
    try{ grip.setPointerCapture(e.pointerId); }catch(_){}
    const br = box.getBoundingClientRect(), vr = view.getBoundingClientRect();
    drag = { dx: e.clientX - br.left, dy: e.clientY - br.top, vr };
    box.classList.add('moving');
  });
  grip.addEventListener('pointermove', e => {
    if(!drag) return;
    const fx = (e.clientX - drag.dx - drag.vr.left) / drag.vr.width;
    const fy = (e.clientY - drag.dy - drag.vr.top) / drag.vr.height;
    place(fx, fy);
  });
  const up = () => {
    if(!drag) return;
    drag = null; box.classList.remove('moving');
    if(!box.style.left) return;
    const vr = view.getBoundingClientRect();
    const pos = { x: parseFloat(box.style.left) / vr.width, y: parseFloat(box.style.top) / vr.height };
    try{ localStorage.setItem(KEY, JSON.stringify(pos)); }catch(_){}
  };
  grip.addEventListener('pointerup', up);
  grip.addEventListener('pointercancel', up);
  addEventListener('resize', () => {
    if(!box.style.left) return;
    let p = null; try{ p = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(_){}
    if(p) place(p.x, p.y);
  });
})();

/* ================= 部品を ほかの 絵に くっつける（レイヤーを 親に する） =================
   ミニSpine では 絵は 骨に つく。なので「本体に くっつける」は
   本体の 骨（なければ 作る）に つける こと。骨を 持つ 部品（頭 など）は 骨ごと つける。 */
function boneForSlot(t){
  const main = slotBones(t).main;
  if(main && main.parent) return main;          // もう 自分の 骨が ある
  const bx = slotBox(t);
  const b = boneAt(t.name, S.proj.bones[0].id, { x: bx.cx, y: bx.y1 - bx.h * 0.1 }, { x: bx.cx, y: bx.y0 + bx.h * 0.1 });
  t.verts.forEach(v => { v.w = []; });
  t.bone = b.id;
  markDirty();
  return b;
}
function attachToSlot(slot, target){
  if(!slot || !target || slot === target) return;
  let bname = '';
  edit(slot.name + ' を ' + target.name + ' に くっつける', () => {
    const b = boneForSlot(target);
    slot.bone = b.id; slot.verts.forEach(v => { v.w = []; });
    bname = b.name; markDirty();
  });
  setStatus(slot.name + ' を ' + target.name + ' に くっつけました（' + target.name + ' を 動かすと ついて きます）');
}

function openAttach(target){
  sheet.show('📎 「' + target.name + '」に くっつける', body => {
    const tb = slotBones(target).main;
    const own = tb && tb.parent ? tb : null;
    body.appendChild(el('div', 'sh-note', 'チェックした ものが「' + target.name + '」に ついて いく ように なります。'
      + (own ? '' : '「' + target.name + '」には まだ 骨が ないので、くっつける ときに 作ります。')));
    const list = el('div', 'att-list');
    const rows = [];
    const row = (txt, sub, kind, id) => {
      const r = el('label', 'att-row');
      const c = el('input'); c.type = 'checkbox';
      r.append(c, el('span', 'att-n', txt), el('small', null, sub || ''));
      list.appendChild(r); rows.push({ c, kind, id });
    };
    // 骨ごと（root の すぐ下の 骨。頭・腕 など、ついて いる 絵ごと 動く）
    const kidsSlots = id => S.proj.slots.filter(sl => { let b = boneById(slotBones(sl).main ? slotBones(sl).main.id : sl.bone); while(b){ if(b.id === id) return true; b = boneById(b.parent); } return false; });
    list.appendChild(el('div', 'sh-h', '骨ごと（ついて いる 絵も いっしょ）'));
    S.proj.bones.forEach(b => {
      if(!b.parent || (own && (b === own || isDescendant(own.id, b.id) || b.parent === own.id))) return;
      if(boneById(b.parent).parent) return;          // root の すぐ下 だけ
      const names = kidsSlots(b.id).map(x => x.name);
      row('🦴 ' + b.name, names.length ? names.slice(0, 5).join('・') + (names.length > 5 ? ' ほか' + (names.length - 5) : '') : '絵なし', 'bone', b.id);
    });
    list.appendChild(el('div', 'sh-h', '絵だけ（root に じかに ついて いる もの）'));
    S.proj.slots.slice().reverse().forEach(sl => {
      if(sl === target) return;
      const m = slotBones(sl).main;
      if(m && m.parent) return;
      row('🖼 ' + sl.name, '', 'slot', sl.id);
    });
    body.appendChild(list);
    const go = mkBtn('くっつける', () => {
      const pick = rows.filter(x => x.c.checked);
      if(!pick.length) return setStatus('どれにも チェックが ありません');
      edit('「' + target.name + '」に くっつける', () => {
        const b = boneForSlot(target);
        pick.forEach(x => {
          if(x.kind === 'slot'){ const sl = slotById(x.id); if(sl && sl !== target){ sl.bone = b.id; sl.verts.forEach(v => { v.w = []; }); } }
          else { const bb = boneById(x.id); if(bb && bb !== b && !isDescendant(b.id, bb.id)) setParentKeep(bb, b.id); }
        });
        markDirty();
      });
      sheet.hide();
      setStatus(pick.length + 'こ を「' + target.name + '」に くっつけました');
      refreshUI();
    }, 'btn btn-y');
    const all = mkBtn('ぜんぶ えらぶ', () => rows.forEach(x => { x.c.checked = true; }), 'btn btn-sm');
    const r2 = el('div', 'soft-row'); r2.append(all, go);
    body.appendChild(r2);
  });
}

/* パーツを えらんで いる ときの 右パネルに ボタン */
const _buildProps3 = buildProps;
buildProps = function(){
  _buildProps3();
  const sl = slotById(S.sel.slot); if(!sl) return;
  const host = $('#props');
  const box = el('div', 'att-box');
  box.appendChild(btnRow(mkBtn('📎 部品を この絵に くっつける', () => openAttach(sl), 'btn btn-y')));
  host.insertBefore(box, host.firstChild);
};

/* 「録画」は 編集画面を そのまま 撮って いたので、キャンバスの 外（黒い ところ）や 骨まで 写って いた。
   書き出しと おなじ やり方（キャラだけ・キャンバスの 大きさ）で 動画に する */
$('#btnRec').onclick = () => saveVideo(true);
$('#btnRec').title = 'いまの アニメを 動画で 保存（キャンバスの 大きさ・6秒ほど）';

/* ================= ボタンを 足す ================= */
(() => {
  const exp = el('button', 'btn btn-sm btn-y', '📤 書き出し'); exp.id = 'btnExport';
  exp.onclick = openExport;
  const nw = el('button', 'btn btn-sm', '🆕 新しく'); nw.id = 'btnNew';
  nw.onclick = newDoc;
  const acts = $('.tb-actions');
  const q = el('button', 'btn btn-sm', '画質'); q.id = 'btnQual';
  q.title = '作業中の 画質。下げると かるく なります（書き出しは いつも きれい）';
  q.onclick = nextQual;
  acts.insertBefore(q, $('#btnUndo'));
  acts.insertBefore(exp, $('#btnRec'));
  acts.insertBefore(nw, $('#btnAddImg'));

  const bk = el('button', 'opt' + (blinkOn ? ' on' : ''), '👁 まばたき'); bk.id = 'btnBlink';
  bk.title = '目を 自動で とじる（アニメート・配信・書き出し）';
  bk.onclick = () => setBlink(!blinkOn);
  const jt = el('button', 'opt', '🔗 関節を つくる'); jt.id = 'btnJoint';
  jt.title = '親の パーツ → 子の パーツ → 曲がる 中心 を さわって つなぐ';
  jt.onclick = () => {
    if(S.proj.slots.length < 2) return setStatus('パーツが 2まい 以上 いります');
    tapGo('joint');
  };
  const rig = el('button', 'opt on', '🪄 かんたん設定'); rig.id = 'btnTapRig';
  rig.title = '何を 動かすか えらんで、関節の 順に 点を 打つ だけ（全身・顔と首・腕・脚・指・髪）';
  rig.onclick = openEasy;
  $('#btnSpring').parentNode.insertBefore(rig, $('#btnSpring'));
  rig.after(jt);
  $('#btnSpring').after(bk);
  const sh = el('button', 'opt', '✏ 閉じ目を つくる'); sh.id = 'btnShape';
  sh.title = '目に 点を 打って、筆で 押して 閉じた 形を 覚えさせる';
  sh.onclick = () => S.shapeEdit ? shapeEnd() : shapeStart();
  bk.after(sh);

  const mv = el('button', 'btn btn-sm btn-y', '✨ よくある動き'); mv.id = 'btnPreset2';
  mv.onclick = openMotions;
  $('#modes').appendChild(mv);
})();

/* つかいかたの 先頭に 新しい 流れを 足す */
const HELP_KOBO = `
<h4>いちばん かんたんな 流れ</h4>
<ol>
  <li><b>🖼 PSD / 画像</b> で 絵を 入れる</li>
  <li><b>🪄 かんたん設定</b> → 動かしたい ところを えらんで、関節の 順に 点を 打つ（全身・顔と首・腕・脚・指・髪）</li>
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
resize(); fitView(); showQual();
refreshUI();
