/* 🙋 キャラの しぐさ・🦴 パーツの うごき（ミニSpine から もってきた もの）。

   しぐさ … 「うごき追加」で 役どころ（頭・体・うで・髪・目）が ついた キャラに、
            まるごと 1つの 動き（うなずく・手を ふる・歩く …）を つける。
   パーツ … えらんだ 1まい（と その 先）だけに つける。しっぽ・うで・髪 など。

   ミニSpine では 骨に キーを うって いた。ここでは 骨の かわりに
   役どころの ついた レイヤーに うつ。値は どれも「いまの 姿から どれだけ」で、
   回転は 度、上下は 画面の 下が プラス。

   キーは いまの 時こくから 1回ぶん。くり返す ときは 回数ぶん ならべる。 */
import { setPin } from './anim.js?v=361';

/* ---------- キャラの 中から 役どころを さがす ---------- */
function under(project, root){
  const out = [];
  const walk = (id) => project.layers.forEach(x => { if(x.parent === id){ out.push(x); walk(x.id); } });
  walk(root.id);
  return out;
}
const cx = (l) => l.x;   // 親の 中の 位置。左右の めやすに つかう

/** しぐさを つける 先。うごき追加の フォルダ、なければ いちばん 外の 親 */
export function charRoot(project, l, rigRootOf){
  const r = rigRootOf(project, l);
  if(r) return r;
  let top = l, g = 0;
  while(top && top.parent && g++ < 200){
    const p = project.layers.find(x => x.id === top.parent);
    if(!p) break;
    top = p;
  }
  return top;
}

export function findParts(project, root){
  const all = [root, ...under(project, root)];
  const by = (r) => all.filter(l => l.rigRole === r);
  const body = by('body')[0] || by('chest')[0] || root;
  const head = by('head')[0] || body;
  const arms = by('arm').filter(a => !all.some(p => p.id === a.parent && p.rigRole === 'arm'));
  /* 画面の 左に ある うで ＝ armR（キャラの 右うで）。名前より 位置で きめる */
  arms.sort((a, b) => cx(a) - cx(b));
  const armR = arms[0] || null;
  const armL = arms.length > 1 ? arms[arms.length - 1] : null;
  const hair = [...by('frontHair'), ...by('backHair'), ...by('hair')];
  const eyes = by('eye');
  return { root, body, head, armR, armL, hair, eyes };
}

/* ---------- キーを うつ 小道具 ---------- */
const CH = { rot: 'rot', x: 'x', y: 'y', sx: 'scaleX', sy: 'scaleY' };

/** その 時間の あいだに ある キーを 消して から うつ（2回 つけても かさならない） */
function clearRange(l, ch, t0, t1){
  const keys = l.tracks && l.tracks[ch];
  if(!keys) return;
  l.tracks[ch] = keys.filter(k => k.t < t0 - 1e-3 || k.t > t1 + 1e-3);
  if(!l.tracks[ch].length) delete l.tracks[ch];
}

/** 動きを つける 先。base は つける まえの 姿（ここからの ずれで うつ） */
function rec(t0, dur, reps){
  const touched = new Map();      // layer → Set(ch)
  const baseOf = new Map();
  const base = (l) => {
    if(!baseOf.has(l)) baseOf.set(l, { rot: l.rot, x: l.x, y: l.y, sx: l.scaleX, sy: l.scaleY });
    return baseOf.get(l);
  };
  const key = (l, c, list, curve) => {
    if(!l) return;
    const ch = CH[c], b = base(l);
    const t1 = t0 + dur * reps;
    if(!touched.has(l)) touched.set(l, new Set());
    if(!touched.get(l).has(ch)){ clearRange(l, ch, t0, t1); touched.get(l).add(ch); }
    for(let r = 0; r < reps; r++){
      list.forEach(([f, v]) => {
        if(r > 0 && f === 0) return;                       // つなぎ目は 1つで いい
        const val = c === 'sx' || c === 'sy' ? b[c] * v : b[c] + v;
        setPin(l, ch, t0 + (r + f) * dur, val, curve || 'smooth');
      });
    }
  };
  return { key, base };
}

/** くり返しの 波。n 回 ゆれて もどる */
function wave(n, amp, phase){
  const out = [], steps = Math.max(8, n * 8);
  for(let i = 0; i <= steps; i++){
    const f = i / steps;
    out.push([f, +(Math.sin((f * n + (phase || 0)) * Math.PI * 2) * amp).toFixed(3)]);
  }
  return out;
}

/* ミニSpine と 同じ 書き方が できる ように、骨の かわりに レイヤーを わたす */
function kit(R, size){
  const keys = (l, ch, list, curve) => R.key(l, ch, list, curve);
  const bobY = (l, list, curve) => R.key(l, 'y', list, curve);
  const bobX = (l, list, curve) => R.key(l, 'x', list, curve);
  const squash = (l, list, curve) => {
    R.key(l, 'sy', list, curve);
    R.key(l, 'sx', list.map(([f, v]) => [f, 1 + (1 - v) * 0.6]), curve);
  };
  return { keys, bobY, bobX, squash, size };
}

/** キャラの せたけの めやす（はねる 高さ など）。わからない ときは 画面の 半分 */
function charSize(project, B){
  const h = (l) => (l && l.ph ? l.ph * Math.abs(l.scaleY || 1) : 0);
  return Math.max(h(B.body) + h(B.head), project.h * 0.35);
}

/* ================= キャラの しぐさ ================= */
export const SHIGUSA = [
  { name:'待機（ふつう）', icon:'🧍', dur:3, fn:(k, B) => {
      k.squash(B.body, [[0,1],[.5,1.025],[1,1]]);
      k.keys(B.head, 'rot', [[0,0],[.3,1.5],[.65,-1.5],[1,0]]);
      k.keys(B.armR, 'rot', [[0,0],[.5,2],[1,0]]);
      k.keys(B.armL, 'rot', [[0,0],[.5,-2],[1,0]]);
  }},
  { name:'うなずく', icon:'🙂', dur:1.2, fn:(k, B) => {
      k.keys(B.head, 'rot', [[0,0],[.18,-8],[.4,3],[.6,-6],[.8,1],[1,0]]);
      k.bobY(B.head, [[0,0],[.18,6],[.4,-1],[.6,4],[.8,0],[1,0]]);
  }},
  { name:'首を かしげる', icon:'🤔', dur:2.4, fn:(k, B) => {
      k.keys(B.head, 'rot', [[0,0],[.2,12],[.7,12],[.9,-1],[1,0]]);
      k.keys(B.body, 'rot', [[0,0],[.2,2],[.7,2],[1,0]]);
  }},
  { name:'手を ふる', icon:'👋', dur:1.6, fn:(k, B) => {
      const arm = B.armR || B.armL, sg = arm === B.armR ? 1 : -1;
      if(arm) k.keys(arm, 'rot', [[0,0],[.15,70],[.3,50],[.45,75],[.6,50],[.75,70],[.9,20],[1,0]].map(([f,v]) => [f, v*sg]));
      else k.keys(B.head, 'rot', wave(2, 6));
      k.keys(B.head, 'rot', [[0,0],[.3,4],[.8,4],[1,0]]);
  }},
  { name:'ぴょんと はねる', icon:'🐇', dur:1.0, fn:(k, B) => {
      const h = k.size * 0.18;
      k.bobY(B.root, [[0,0],[.18,0],[.45,-h],[.7,0],[.8,0],[1,0]]);
      k.squash(B.root, [[0,1],[.18,.9],[.3,1.08],[.45,1],[.7,1.04],[.8,.93],[.92,1.01],[1,1]]);
  }},
  { name:'よろこぶ', icon:'🙌', dur:1.2, fn:(k, B) => {
      const h = k.size * 0.08;
      k.bobY(B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      k.keys(B.armR, 'rot', [[0,40],[.25,70],[.5,40],[.75,70],[1,40]]);
      k.keys(B.armL, 'rot', [[0,-40],[.25,-70],[.5,-40],[.75,-70],[1,-40]]);
      k.keys(B.head, 'rot', [[0,0],[.25,-4],[.5,0],[.75,4],[1,0]]);
  }},
  { name:'おじぎ', icon:'🙇', dur:2.4, fn:(k, B) => {
      k.keys(B.body, 'rot', [[0,0],[.3,-25],[.65,-25],[1,0]]);
      k.keys(B.head, 'rot', [[0,0],[.3,-10],[.65,-10],[1,0]]);
  }},
  { name:'歩く（その場）', icon:'🚶', dur:1.0, fn:(k, B) => {
      const h = k.size * 0.025;
      k.bobY(B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      k.keys(B.body, 'rot', wave(1, 2.5));
      k.keys(B.armR, 'rot', wave(1, 14));
      k.keys(B.armL, 'rot', wave(1, -14));
      k.keys(B.head, 'rot', wave(1, -1.5));
  }},
  { name:'走る（その場）', icon:'🏃', dur:0.6, fn:(k, B) => {
      const h = k.size * 0.05;
      k.bobY(B.root, [[0,0],[.25,-h],[.5,0],[.75,-h],[1,0]]);
      k.keys(B.body, 'rot', [[0,-6],[.5,-6],[1,-6]]);
      k.keys(B.armR, 'rot', wave(1, 32));
      k.keys(B.armL, 'rot', wave(1, -32));
  }},
  { name:'びっくり', icon:'😲', dur:1.4, fn:(k, B) => {
      const h = k.size * 0.06;
      k.bobY(B.root, [[0,0],[.1,-h],[.22,0],[1,0]]);
      k.squash(B.root, [[0,1],[.1,1.1],[.22,.95],[.32,1.02],[.45,1],[1,1]]);
      k.keys(B.armR, 'rot', [[0,0],[.1,35],[.7,30],[1,0]]);
      k.keys(B.armL, 'rot', [[0,0],[.1,-35],[.7,-30],[1,0]]);
  }},
  { name:'しょんぼり', icon:'😞', dur:3, fn:(k, B) => {
      k.keys(B.head, 'rot', [[0,0],[.3,-10],[.8,-10],[1,0]]);
      k.squash(B.body, [[0,1],[.3,.97],[.8,.97],[1,1]]);
      k.bobY(B.head, [[0,0],[.3,5],[.8,5],[1,0]]);
  }},
  { name:'いやいや', icon:'🙅', dur:1.0, fn:(k, B) => {
      k.keys(B.head, 'rot', wave(3, 10));
      k.keys(B.body, 'rot', wave(3, 2));
  }},
  { name:'ノリノリ', icon:'🎵', dur:1.0, fn:(k, B) => {
      const h = k.size * 0.02;
      k.bobY(B.root, [[0,0],[.25,h],[.5,0],[.75,h],[1,0]]);
      k.keys(B.body, 'rot', wave(1, 5));
      k.keys(B.head, 'rot', wave(1, -7, .1));
      k.keys(B.armR, 'rot', wave(2, 12));
      k.keys(B.armL, 'rot', wave(2, -12));
  }},
  { name:'ぷんぷん', icon:'💢', dur:0.8, fn:(k, B) => {
      k.bobX(B.root, wave(4, k.size * 0.012));
      k.squash(B.body, [[0,1],[.5,1.03],[1,1]]);
      k.keys(B.armR, 'rot', [[0,20],[.5,26],[1,20]]);
      k.keys(B.armL, 'rot', [[0,-20],[.5,-26],[1,-20]]);
  }},
  { name:'ねむい', icon:'😪', dur:4, fn:(k, B) => {
      k.keys(B.head, 'rot', [[0,0],[.35,-14],[.42,-3],[.7,-12],[.78,-2],[1,0]]);
      k.squash(B.body, [[0,1],[.5,1.02],[1,1]]);
  }},
  { name:'ふわふわ 浮く', icon:'🎈', dur:3, fn:(k, B) => {
      k.bobY(B.root, wave(1, k.size * 0.03));
      k.keys(B.root, 'rot', wave(1, 2, .25));
  }},
  { name:'ビートで キメ', icon:'🥁', dur:2, fn:(k, B) => {
      k.keys(B.root, 'rot', [[0,0],[.08,-7],[.14,-5.5],[.5,-5.5],[.58,6],[.64,4.5],[.96,4.5],[1,0]]);
      k.keys(B.head, 'rot', [[0,0],[.08,4],[.2,1],[.5,1],[.58,-4],[.7,-1],[.96,-1],[1,0]]);
      k.squash(B.root, [[0,1],[.08,1.05],[.2,1],[.5,1],[.58,1.05],[.7,1],[1,1]]);
      k.bobY(B.root, [[0,0],[.08,-k.size*.012],[.2,0],[.5,0],[.58,-k.size*.012],[.7,0],[1,0]]);
  }},
  { name:'ゆらゆら ポートレート', icon:'🖼', dur:4, fn:(k, B) => {
      k.keys(B.root, 'rot', wave(1, 2.5));
      k.squash(B.root, [[0,1],[.5,1.02],[1,1]]);
      k.keys(B.head, 'rot', wave(1, -2, .25));
  }},
  { name:'にこっ', icon:'😊', dur:2.4, fn:(k, B) => {
      k.bobY(B.root, [[0,0],[.1,-k.size*.03],[.22,0],[1,0]]);
      k.squash(B.root, [[0,1],[.06,.95],[.12,1.05],[.24,1],[1,1]]);
      k.keys(B.head, 'rot', [[0,0],[.12,9],[.2,7],[.62,7],[.75,0],[1,0]]);
      /* 目を とじる（目の 絵を たてに つぶす） */
      B.eyes.forEach(e => k.keys(e, 'sy', [[0,1],[.1,1],[.14,.12],[.64,.12],[.7,1],[1,1]]));
  }},
  { name:'風に なびく', icon:'🌬', dur:1.6, fn:(k, B) => {
      k.keys(B.head, 'rot', wave(3, 1.6));
      k.keys(B.body, 'rot', wave(2, .8, .25));
      k.bobX(B.root, wave(2, k.size * .004));
      B.hair.forEach((h, i) => k.keys(h, 'rot', wave(2, 3, i * .12)));
  }}
];

/**
 * キャラに しぐさを つける。
 *   root … うごき追加で できた キャラの いちばん 外（rigRootOf で とれる）
 *   reps … くり返す 回数
 * 戻り値 … 動かした レイヤーの 数
 */
export function applyShigusa(project, root, item, t0, reps){
  const B = findParts(project, root);
  const R = rec(t0, item.dur, Math.max(1, reps | 0));
  item.fn(kit(R, charSize(project, B)), B);
  return B;
}

/* ================= パーツの うごき（えらんだ 1まい） =================
   dur は 1回ぶんの 長さ（秒）。 */
export const PARTS = [
  { name:'首ふり', icon:'↔️', dur:2, fn:(k, l) => k.keys(l, 'rot', [[0,0],[.25,6],[.75,-6],[1,0]]) },
  { name:'うなずき', icon:'⬇️', dur:1.2, fn:(k, l) => k.keys(l, 'rot', [[0,0],[.15,-9],[.35,2],[.6,0],[1,0]]) },
  { name:'ぷよん', icon:'🍮', dur:1, fn:(k, l) => k.squash(l, [[0,1],[.2,1.08],[.4,.95],[.6,1.03],[.8,.99],[1,1]]) },
  { name:'ぶらぶら', icon:'🕰', dur:2, fn:(k, l) => k.keys(l, 'rot', wave(1, 20)) },
  { name:'ぶらぶら（先まで）', icon:'🖐', dur:2, chain:true, fn:(k, l, project) => {
      /* えらんだ ものから 子・孫へ。先ほど すこし おくれて ふれる（ムチの ように しなる） */
      const walk = (x, d) => {
        k.keys(x, 'rot', wave(1, 14 * Math.pow(0.85, d), -0.09 * d));
        project.layers.filter(c => c.parent === x.id && c.kind !== 'folder').forEach(c => walk(c, d + 1));
      };
      walk(l, 0);
  }},
  { name:'しっぽふり', icon:'🐕', dur:1.2, fn:(k, l) => k.keys(l, 'rot', wave(3, 18)) },
  { name:'手まねき', icon:'🫴', dur:1.6, fn:(k, l) => k.keys(l, 'rot', [[0,0],[.2,-35],[.4,0],[.6,-35],[.8,0],[1,0]]) },
  { name:'ぴょこん', icon:'⤴️', dur:1, fn:(k, l) => {
      k.bobY(l, [[0,0],[.15,-k.size*.04],[.3,0],[1,0]]);
      k.squash(l, [[0,1],[.15,1.05],[.3,.97],[.4,1],[1,1]]);
  }},
  { name:'くるっと 1回転', icon:'🔄', dur:1, fn:(k, l) => k.keys(l, 'rot', [[0,0],[1,360]], 'linear') }
];

export function applyPart(project, l, item, t0, reps){
  const R = rec(t0, item.dur, Math.max(1, reps | 0));
  const size = Math.max((l.ph || 0) * Math.abs(l.scaleY || 1), project.h * 0.3);
  item.fn(kit(R, size), l, project);
}
