/* 🦴 骨キャラの よくある動き（ミニSpine の kobo.js から そのまま もってきた）。

   ミニSpine では「アニメ」1つに キーを うって いた。ここでは いったん その 形で
   つくって から、骨キャラ レイヤーの タイムラインへ いまの 時こくから 写す。
   値の 意味（回転・場所は 組み立てからの ずれ、大きさは 倍）は ミニSpine と 同じ。 */
import { M, childMap } from './core.js?v=354';
import { setupPose, boneCh } from './hone.js?v=354';
import { setPin } from '../engine/anim.js?v=354';

const CTX = { h: null, sp: null, H: 1000 };
const boneById = id => CTX.h.bones.find(b => b.id === id);
function setKey(anim, boneId, ch, time, value, curve){
  const t = (anim.tracks[boneId] = anim.tracks[boneId] || {});
  const keys = (t[ch] = t[ch] || []);
  const i = keys.findIndex(k => Math.abs(k.t - time) < 1e-4);
  if(i >= 0){ keys[i].v = value; if(curve) keys[i].c = curve; }
  else { keys.push({ t: time, v: value, c: curve || 'smooth' }); keys.sort((a, b) => a.t - b.t); }
}

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
  const bones = CTX.h.bones, root = bones[0];
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
const SP = () => CTX.sp;

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
  CTX.h.bones.forEach(b => { const p = sp[b.id]; if(!p) return;
    const e = M.apply(p.world, b.len, 0);
    y0 = Math.min(y0, p.world.ty, e.y); y1 = Math.max(y1, p.world.ty, e.y); });
  const h = y1 - y0;
  return h > 40 ? h : CTX.H * 0.5;
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
  /* えらんだ 骨から 先（子・孫…）まで まとめて ゆらす。
     先へ 行くほど すこし おくれて ふれる ので、ムチの ように しなる。
     子が いくつも ある（手のひら → 指5本）ときは 全部の 指に つく */
  { name:'ぶらぶら（先まで）', icon:'🖐', fn:(a,b) => {
      const kids = childMap(CTX.h);
      const walk = (id, d) => {
        const x = boneById(id); if(!x) return;
        keys(a, x, 'rot', wave(1, 14 * Math.pow(0.85, d), -0.09 * d));
        (kids[id] || []).forEach(k => walk(k, d + 1));
      };
      walk(b.id, 0);
  }},
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

export { WHOLE, ONE };

/* つくった キーを レイヤーへ。いまの 時こくから reps 回 ならべる */
function put(l, a, t0, reps){
  for(const id of Object.keys(a.tracks)){
    for(const ch of Object.keys(a.tracks[id])){
      const keys = a.tracks[id][ch];
      const name = boneCh(id, ch), t1 = t0 + a.dur * reps;
      const old = (l.tracks && l.tracks[name]) || [];
      if(l.tracks && l.tracks[name]) l.tracks[name] = old.filter(k => k.t < t0 - 1e-3 || k.t > t1 + 1e-3);
      for(let r = 0; r < reps; r++){
        keys.forEach(k => {
          if(r > 0 && k.t < 1e-4) return;
          setPin(l, name, t0 + r * a.dur + k.t, k.v, k.c === 'linear' ? 'linear' : 'smooth');
        });
      }
    }
  }
}
/* 名前で 見つからない とき（ほね1・ほね2 …）は 骨の 形で あてる。
   根もとの 子 ＝ 体、体から いちばん 上へ のびる 先 ＝ 頭、
   体から よこへ 出る ものの 左右 ＝ うで。 */
function smartBones(){
  const B = findBones();
  if(B.body !== B.root || B.head !== B.body || B.armR || B.armL) return B;
  const bones = CTX.h.bones, sp = CTX.sp, root = bones[0];
  const kids = (id) => bones.filter(b => b.parent === id);
  const tip = (b) => M.apply(sp[b.id].world, b.len, 0);
  const body = kids(root.id)[0] || root;
  /* 体から 上へ いちばん 高い 先まで（首・頭） */
  let head = body, cur = body, g = 0;
  while(g++ < 20){
    const ks = kids(cur.id); if(!ks.length) break;
    const up = ks.reduce((a, b) => tip(a).y < tip(b).y ? a : b);
    if(tip(up).y > tip(cur).y) break;
    head = cur = up;
  }
  const chain = new Set(); let c = head; while(c){ chain.add(c.id); c = c.parent ? boneById(c.parent) : null; }
  const side = bones.filter(b => b.parent && chain.has(b.parent) && !chain.has(b.id));
  const cx = sp[body.id].world.tx;
  const left = side.filter(b => tip(b).x < cx).sort((a, b) => tip(a).x - tip(b).x)[0] || null;
  const right = side.filter(b => tip(b).x >= cx).sort((a, b) => tip(b).x - tip(a).x)[0] || null;
  return Object.assign({}, B, { body, head, armR: left, armL: right });
}

function ready(l, project){
  CTX.h = l.hone; CTX.sp = setupPose(l.hone); CTX.H = project.h;
}
/** キャラ まるごと */
export function applyWholeHone(l, project, m, t0, reps){
  ready(l, project);
  const a = { dur: m.dur, loop: true, tracks: {} };
  const B = smartBones();
  m.fn(a, B);
  put(l, a, t0, Math.max(1, reps | 0));
  return B;
}
/** えらんだ 骨 1本（と その 先） */
export function applyOneHone(l, project, m, boneId, t0, reps, dur){
  ready(l, project);
  const b = boneById(boneId); if(!b) return;
  const a = { dur: dur || 2, loop: true, tracks: {} };
  m.fn(a, b);
  put(l, a, t0, Math.max(1, reps | 0));
}
export function bonesFound(l, project){ ready(l, project); return smartBones(); }
