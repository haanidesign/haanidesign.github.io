/* 🧍 PSD から うごく キャラを つくる。

   PSD の レイヤーの 名前を 見て、体・頭・前髪・うで … と あたりを つけ、
     ・おやこ（頭は 体に ついて くる）
     ・じく（頭は 首もと、前髪は はえぎわ、うでは かた）
     ・ゆれ（前髪は はやく 大きく、体は ゆっくり 小さく）
     ・いき（体が ゆっくり ふくらむ）
   を まとめて つける。

   何も 見つからない ときは 何も しない。
   つけた あとは ふつうの レイヤーなので、いつもの 道具で 直せる。

   もとの かんがえ … PSDアバター工房（lab/tools/psd-avatar-studio）。
   あちらは その場で 動かして 見せる もの。ここは 動画に する ための
   道具なので、ゆれは この 道具が もともと 持って いる しくみに のせる。 */

import { newSway, newPin } from '../engine/puppet.js?v=418';
import { newPhys, PHYS_LOOKS } from '../engine/phys.js?v=418';
import { setPin } from '../engine/anim.js?v=418';
import { setParent, moveAnchorKeepAll, newFolder } from '../engine/layer.js?v=418';

/* 名前から あたりを つける。日本語も 英語も 見る。
   ならびは 大事 ―― 上に ある ものから 先に あてはめる
   （「前髪」は「髪」より 先に 見ないと まとめて 髪に なる）。 */
const RULES = [
  /* ゆれもの（イヤリング など）は いちばん さきに 見る。
     「耳」まで 入れると 耳の 絵じたいが ゆれて しまう ので 入れない。 */
  ['earring',   /イヤリング|いやりんぐ|ピアス|ぴあす|耳飾|みみかざり|イヤーカフ|earring|pierc/i],
  /* ぶらさがる・ゆれる 小物や 背景の 物。上の はしを じくに ゆれる */
  ['swing',     /ゆれ|揺れ|ゆらす|ぶら|吊|つり|のれん|暖簾|風鈴|すず|鈴|葉っぱ|葉|草|花|旗|はた|カーテン|ひも|紐|リボン|鎖|くさり|ランプ|ランタン|ちょうちん|提灯|しっぽ|尻尾|swing|hang|leaf|leaves|flag|curtain|ribbon|lamp|tail/i],
  ['frontHair', /前髪|まえがみ|front\s*hair|bang|fringe/i],
  ['backHair',  /後ろ髪|うしろ髪|うしろがみ|back\s*hair|hair\s*back/i],
  ['hair',      /髪|かみ|hair/i],
  ['brow',      /眉|まゆ|brow|eyebrow/i],
  ['eye',       /目|瞳|眼|まつ毛|まぶた|eye|iris|pupil|lash/i],
  ['mouth',     /口|くち|唇|mouth|lip/i],
  ['head',      /頭|あたま|顔|かお|head|face/i],
  ['arm',       /腕|うで|手|て$|hand|arm/i],
  ['chest',     /胸|むね|chest|breast|bust/i],
  ['body',      /体|からだ|胴|どう|服|ふく|body|torso|cloth/i]
];

export function roleOf(name){
  const s = String(name || '');
  for(const [role, re] of RULES) if(re.test(s)) return role;
  return null;
}

/* 役どころ ごとの うごき かた。
     angle  … かたむく 大きさ（度）
     period … ひとゆれ の 長さ（秒）
     phase  … はじまりの ずらし（0〜1）。ぜんぶ そろうと 不自然 */
const SWAY = {
  /* ぶらさがって いる もの。かるい ので はやく、大きく ふれる */
  earring:   { angle: 9.0, period: 1.4, phase: 0.30 },
  swing:     { angle: 3.0, period: 2.6, phase: 0.20 },
  frontHair: { angle: 2.6, period: 2.8, phase: 0.00 },
  backHair:  { angle: 3.4, period: 3.4, phase: 0.18 },
  hair:      { angle: 2.8, period: 3.0, phase: 0.10 },
  head:      { angle: 1.2, period: 4.6, phase: 0.35 },
  arm:       { angle: 1.6, period: 3.8, phase: 0.55 },
  chest:     { angle: 0.8, period: 2.4, phase: 0.70 },
  body:      { angle: 0.7, period: 5.2, phase: 0.45 }
};

/* じく（回る 中心）。絵の 中の わりあい。
   髪は はえぎわ、頭は 首もと、うでは かた ―― そこを 中心に すると
   ゆれが それらしく なる。 */
const PIVOT = {
  earring:   { x: 0.5, y: 0.05 },   // 耳に ついて いる ところ（上の はし）
  swing:     { x: 0.5, y: 0.04 },   // ぶらさがって いる ところ（上の はし）
  frontHair: { x: 0.5, y: 0.12 },
  backHair:  { x: 0.5, y: 0.10 },
  hair:      { x: 0.5, y: 0.12 },
  head:      { x: 0.5, y: 0.92 },
  brow:      { x: 0.5, y: 0.5 },
  eye:       { x: 0.5, y: 0.5 },
  mouth:     { x: 0.5, y: 0.5 },
  arm:       { x: 0.5, y: 0.08 },
  chest:     { x: 0.5, y: 0.2 },
  body:      { x: 0.5, y: 1.0 }
};

/* 頭に ついて いく もの ／ 体に ついて いく もの */
const ON_HEAD = ['frontHair', 'backHair', 'hair', 'brow', 'eye', 'mouth', 'earring'];
const ON_BODY = ['head', 'arm', 'chest'];

/* ループの 長さに きれいに 入る しゅうきに そろえる。

   たとえば ループ 6秒 で もとの しゅうきが 2.8秒 なら、
   6 ÷ 2.8 ≒ 2.1 → 2回 に して 3.0秒 に する。
   こう すると ループの おわりと はじめが ぴたりと つながる
   （はんぱだと つなぎ目で 絵が とぶ）。 */
function fitPeriod(period, loop){
  if(!loop || loop <= 0) return period;
  const n = Math.max(1, Math.round(loop / period));
  return loop / n;
}

/**
 * いき（呼吸）を つける。
 * ゆっくり ふくらんで しぼむ だけ。ループの 帯で くりかえす ので
 * キーフレームは 3つで すむ（何十秒 あっても おもく ならない）。
 */
function breath(layer, depth, period, band){
  const d = depth == null ? 0.012 : depth;
  const p = Math.max(0.4, period == null ? 3.6 : period);
  const full = Math.max(p, band || p);
  const n = Math.max(1, Math.round(full / p));
  const sy = layer.scaleY || 1;
  for(let i = 0; i < n; i++){
    setPin(layer, 'scaleY', i * p,           sy,           'smooth');
    setPin(layer, 'scaleY', i * p + p / 2,   sy * (1 + d), 'smooth');
  }
  setPin(layer, 'scaleY', n * p, sy, 'smooth');
  layer.loop = { from: 0, to: n * p, mode: 'loop' };
}

/* ---------- あとから 直す ----------

   「うごき追加」で 入れた キャラは、まとめ役の フォルダに
   どう つけたか（rig）を 持って いる。
   その 数字を 変えて ここを 通せば、中身ぜんぶに かけ直せる。
   1まいずつ さわらなくて いい。 */

/* ---------- うごきの えらび ----------

   ゆれの 強さだけ では「ただ ゆれて いる」だけ に なる。
   首を かたむける・うなずく・体が はねる ―― そういう 味つけを
   ひとまとめに して えらべる ように する。

     tilt … 頭を 左右に かたむける（度）
     nod  … 頭が うなずく（たての ずれ・ドット）
     bob  … 体が はねる（たての ずれ・ドット）
     beat … ひとまわりの 中で 何回 くりかえすか */
export const MOTIONS = {
  'しぜん':      { gain:1.0, hair:1.0, face:1.0, breath:1.0 },
  'にこにこ':    { gain:0.8, hair:0.9, face:0.8, breath:1.2, head:{ tilt:2.5, beat:1 } },
  'きょろきょろ':{ gain:0.9, hair:1.1, face:0.7, breath:1.0, head:{ tilt:7,   beat:2 } },
  'うなずき':    { gain:0.8, hair:1.0, face:0.7, breath:1.0, head:{ nod:9,    beat:2 } },
  '元気':        { gain:1.6, hair:1.4, face:1.5, breath:1.5, body:{ bob:10,   beat:2 } },
  'ノリノリ':    { gain:1.4, hair:1.7, face:1.2, breath:1.2,
                   body:{ bob:18, beat:4 }, head:{ tilt:4, beat:4 } },
  'なし':        { gain:0, hair:0, face:0, breath:0 }
};
export const MOTION_NAMES = Object.keys(MOTIONS);

/** はじめの 数字 */
export function newRigSet(){
  return {
    motion: 'しぜん', // うごきの えらび
    loop: 4,        // 何秒で ひとまわり するか
    gain: 1,        // ゆれの 強さ（ぜんたい）
    hair: 1,        // 髪だけ 強さ
    face: 1,        // 頭・うで・胸だけ 強さ
    breath: 1,      // いきの 深さ
    soft: 0,        // 髪の やわらかさ（0〜1）
    lag: 0,         // パーツの おくれ（0〜1。体から はなれる ほど おくれる）
    flip: false     // 左右 反対
  };
}

/* 「髪の ゆれ」の つまみで いっしょに 強さが 変わる もの */
const HAIR_ROLES = ['frontHair', 'backHair', 'hair', 'earring'];

/** その レイヤーの 役に あわせた ゆれを かけ直す */
function swayFor(l, set){
  const base = SWAY[l.rigRole];
  if(!base) return false;
  /* パーツごとの 直し（set.per[id]）。なければ ぜんたいの 数字 */
  const po = (set.per && set.per[l.id]) || {};
  const k = (HAIR_ROLES.includes(l.rigRole) ? set.hair : set.face) * set.gain * (po.gain == null ? 1 : po.gain);
  /* 左右の イヤリングが そろって ふれると 機械っぽい。
     名前から 左右を 見て、はじまりを すこし ずらす */
  let phase = base.phase;
  if(l.rigRole === 'earring' && /右|みぎ|right|_r\b|R$/i.test(l.name || '')) phase += 0.18;
  const isHair = HAIR_ROLES.includes(l.rigRole);
  /* パーツの おくれ … 頭 < うで < 髪 の じゅんに おくれて ついて くる */
  const lagK = { head: 0.5, armR: 0.8, armL: 0.8, arm: 0.8 }[l.rigRole] || (isHair ? 1.2 : 0.3);
  phase += (po.lag == null ? (set.lag || 0) : po.lag) * 0.35 * lagK;
  /* 左右 反対 … ゆれの はじまりを 半分 ずらすと 逆むきに なる（パーツの 反対は ぜんたいの 逆） */
  if(!!set.flip !== !!po.flip) phase += 0.5;
  const soft = po.soft != null ? po.soft : isHair ? (set.soft || 0) : 0;
  l.sway = Object.assign(newSway(), base, {
    on: true,
    phase: phase % 1,
    angle: Math.max(0, base.angle * k * (1 + 0.5 * soft)),
    /* やわらかい 髪は ゆっくり、先ほど 大きく おくれて しなる */
    period: fitPeriod(base.period * (1 + 0.8 * soft), set.loop),
    delay: Math.min(0.9, (base.delay == null ? 0.25 : base.delay) + 0.45 * soft)
  });
  return true;
}

/**
 * まとめ役の フォルダの 下 ぜんぶに、いまの 数字を かけ直す。
 *   root … 「うごき追加」で できた フォルダ（rig を 持って いる）
 */
/* 🦴 骨キャラを キャラの うごきに 連動させる。
   骨の 名前から 役（頭・髪・うで・体 …）を あてて、パペットと 同じ ゆれを 回転の キーで 入れる。
   伸び縮みは しない（回転 だけ）。ひとまわりで ぴったり つながる。 */
function driveHone(l, mix){
  const h = l.hone; if(!h || !h.bones) return false;
  const loop = Math.max(0.5, mix.loop || 4);
  const byId = {}; h.bones.forEach(b => byId[b.id] = b);
  let n = 0;
  h.bones.forEach(b => {
    if(!b.parent) return;
    const role = roleOf(b.name); if(!role || !SWAY[role]) return;
    const fake = { rigRole: role, name: b.name, id: 'b:' + l.id + ':' + b.id };
    if(!swayFor(fake, mix)) return;
    const sw = fake.sway;
    /* 同じ 役の 骨が つづく（髪の 先 など）ほど おくれる */
    let d = 0, p = byId[b.parent], g = 0;
    while(p && roleOf(p.name) === role && g++ < 20){ d++; p = byId[p.parent]; }
    const ph = sw.phase + d * (sw.delay || 0.25) * 0.4;
    const key = 'H:' + b.id + ':rot';
    l.tracks = l.tracks || {};
    delete l.tracks[key];
    if(!(sw.angle > 0.01)) return;
    const steps = Math.max(8, Math.round(loop / sw.period) * 12);
    for(let i = 0; i <= steps; i++){
      const t = loop * i / steps;
      setPin(l, key, +t.toFixed(4), +(sw.angle * Math.sin((t / sw.period + ph) * Math.PI * 2)).toFixed(3), 'smooth');
    }
    n++;
  });
  if(n) l.loop = { from: 0, to: +loop.toFixed(3), mode: 'loop' };
  return n > 0;
}

export function applyRig(project, root){
  /* いれものは 作り直さない。
     作り直すと、つまみの 画面が 持って いる ものと 別ものに なり、
     つまみを 動かしても 何も 変わらなく なる。
     足りない ところだけ うめる。 */
  if(!root.rig) root.rig = newRigSet();
  const set = root.rig;
  const def = newRigSet();
  Object.keys(def).forEach(k => { if(set[k] == null) set[k] = def[k]; });

  /* 下に ぶら下がって いる ものを ぜんぶ あつめる */
  const kids = [];
  const walk = (id) => {
    project.layers.forEach(l => {
      if(l.parent !== id) return;
      kids.push(l);
      walk(l.id);
    });
  };
  walk(root.id);

  const M = MOTIONS[set.motion] || MOTIONS['しぜん'];
  /* えらびの ぶんを かけた 強さ。つまみは その うえから かける。 */
  const mix = {
    loop: set.loop,
    gain: set.gain * (M.gain == null ? 1 : M.gain),
    hair: set.hair * (M.hair == null ? 1 : M.hair),
    face: set.face * (M.face == null ? 1 : M.face),
    breath: set.breath * (M.breath == null ? 1 : M.breath),
    soft: set.soft || 0, lag: set.lag || 0, flip: !!set.flip, per: set.per || {}
  };

  /* 骨キャラ 1まい だけで うごきを もって いる とき */
  if(root.kind === 'hone'){ driveHone(root, mix); return; }
  let swayed = 0, breathOn = null, headOn = null;
  kids.forEach(l => {
    /* 🦴 骨キャラも いっしょに 動かす */
    if(l.kind === 'hone'){ if(driveHone(l, mix)) swayed++; return; }
    /* あとから 入れた パペットなど、役が まだ ない ものは 名前から あてる */
    if(!l.rigRole && l.kind !== 'folder' && l.pins && l.pins.length >= 2){ const r = roleOf(l.name); if(r) l.rigRole = r; }
    if(!l.rigRole) return;
    /* 前に つけた 味つけの キーフレームは 消してから */
    if(l.tracks){ delete l.tracks.rot; delete l.tracks.y; }
    if(l.rigRole !== 'body') l.loop = null;
    if(swayFor(l, mix)) swayed++;
    if(l.rigRole === 'body') breathOn = l;
    if(l.rigRole === 'head') headOn = l;
  });
  if(!breathOn) breathOn = headOn;

  if(breathOn){
    /* いきは キーフレーム。かけ直す ときは 前のを 消してから */
    if(breathOn.tracks) delete breathOn.tracks.scaleY;
    breathOn.loop = null;
    const depth = 0.012 * mix.breath;
    if(depth > 0.0005) breath(breathOn, depth, fitPeriod(3.6, mix.loop), mix.loop);
  }

  /* ---- 味つけ（首ふり・うなずき・はね）----
     ひとまわりの 中で ちょうど 何回か くりかえす 形に する ので、
     はじめと おわりが ぴたりと つながる。 */
  /* くりかえしの 帯は レイヤーに 1本だけ。
     だから 味つけも いきも、ひとまわり ぜんぶを うめる ように 書く。
     （帯を みじかく すると、そこで 切れて いきが 止まる） */
  const wave = (l, ch, base, amp, beat, kind) => {
    if(!l || !(amp > 0.01)) return;
    const n = Math.max(1, Math.round(beat || 1));
    const per = Math.max(0.2, mix.loop / n);
    const a = amp * mix.gain * (mix.flip && kind !== 'bob' && ch === 'rot' ? -1 : 1);
    for(let i = 0; i < n; i++){
      const t0 = i * per;
      if(kind === 'bob'){
        /* はねる ―― 上で ためて、下で はずむ */
        setPin(l, ch, t0,            base,     'smooth');
        setPin(l, ch, t0 + per * 0.5, base - a, 'smooth');
      } else {
        setPin(l, ch, t0,             base,     'smooth');
        setPin(l, ch, t0 + per * 0.25, base + a, 'smooth');
        setPin(l, ch, t0 + per * 0.75, base - a, 'smooth');
      }
    }
    setPin(l, ch, mix.loop, base, 'smooth');
    l.loop = { from: 0, to: mix.loop, mode: 'loop' };
  };

  if(M.head && headOn){
    if(M.head.tilt) wave(headOn, 'rot', headOn.rot || 0, M.head.tilt, M.head.beat, 'tilt');
    if(M.head.turn) wave(headOn, 'rot', headOn.rot || 0, M.head.turn, M.head.beat, 'tilt');
    if(M.head.nod)  wave(headOn, 'y',   headOn.y   || 0, M.head.nod,  M.head.beat, 'bob');
  }
  if(M.body && breathOn && breathOn.rigRole === 'body'){
    if(M.body.bob) wave(breathOn, 'y', breathOn.y || 0, M.body.bob, M.body.beat, 'bob');
  }

  return { swayed, breath: breathOn ? breathOn.name : null, motion: set.motion };
}

/** えらんで いる ところから、まとめ役の フォルダを さがす */
export function rigRootOf(project, layer){
  let cur = layer, guard = 0;
  while(cur && guard++ < 64){
    if(cur.rig) return cur;
    cur = cur.parent ? project.layers.find(x => x.id === cur.parent) : null;
  }
  return null;
}

/**
 * まとめて つける。
 *   layers … いま 入れた ぶんの レイヤー（手前が さき）
 * 戻り値 … 何を つけたか の おしらせ
 */
export function autoRig(project, layers, assetOf, opt){
  const o = opt || {};
  const loop = o.loop > 0 ? o.loop : 0;      // 0 … そろえない
  const found = {};
  layers.forEach(l => {
    const r = roleOf(l.name);
    if(!r) return;
    l.rigRole = r;
    (found[r] = found[r] || []).push(l);
  });

  const roles = Object.keys(found);
  if(!roles.length) return { ok: false, n: 0, roles: [] };

  /* じく。絵の 中の わりあいで 持って いる ので、
     絵の 大きさが ちがっても そのまま 合う。
     じくを 動かすと 絵も 動いて しまう ので、
     いつもの 「じくだけ 動かす」しくみ を 通して 打ち消す。 */
  layers.forEach(l => {
    const p = PIVOT[l.rigRole];
    if(!p) return;
    const a = assetOf(l);
    if(!a){ l.pivot = { x: p.x, y: p.y }; return; }
    const dax = (p.x - l.pivot.x) * a.w;
    const day = (p.y - l.pivot.y) * a.h;
    moveAnchorKeepAll(project, l, dax, day, 0, () => { l.pivot = { x: p.x, y: p.y }; });
  });

  /* おやこ。頭が あれば 顔まわりは 頭に、頭・うで・胸は 体に つける。
     じくを 先に きめて から つなぐ（つなぎ方は 見た目を 変えない）。 */
  const head = (found.head || [])[0] || null;
  const body = (found.body || [])[0] || null;
  let linked = 0;

  /* すでに 親（PSDの グループ）が ある ものは さわらない。
     二重に つなぐと 場所が とぶ。 */
  const byId = {};
  layers.forEach(l => { byId[l.id] = l; });
  const wouldLoop = (l, parent) => {
    let p = parent, guard = 0;
    while(p && guard++ < 64){
      if(p === l) return true;
      p = p.parent ? byId[p.parent] : null;
    }
    return false;
  };

  layers.forEach(l => {
    const r = l.rigRole;
    if(!r || l.parent) return;
    let parent = null;
    if(ON_HEAD.includes(r)) parent = head || body;
    else if(ON_BODY.includes(r)) parent = body;
    /* setParent を 通すと、見た目を 動かさない ように
       子の 値を 計算し直して くれる。 */
    if(parent && parent !== l && !wouldLoop(l, parent)){
      if(setParent(project, l, parent.id, 0)) linked++;
    }
  });

  /* ゆれ。この 道具が もともと 持って いる しくみ（l.sway）に のせる。
     キーフレームを 打たない ので、あとから 手で 直しても ぶつからない。 */
  let swayed = 0;
  layers.forEach(l => {
    const s = SWAY[l.rigRole];
    if(!s) return;
    l.sway = Object.assign(newSway(), s, {
      on: true,
      period: fitPeriod(s.period, loop)
    });
    swayed++;
  });

  /* 🌀 ぶらさがる もの（髪・イヤリング）には ばねも つける。
     頭が 動くと おくれて ふられる（ゆれ と いっしょに きく） */
  const PHYS_ROLE = { earring: 'イヤリング', frontHair: '髪', backHair: '髪', hair: '髪', swing: 'リボン・布' };
  layers.forEach(l => {
    const k = PHYS_ROLE[l.rigRole];
    if(!k || (l.phys && l.phys.on)) return;
    const look = PHYS_LOOKS.find(x => x[0] === k);
    l.phys = Object.assign(newPhys(), look ? look[1] : {}, { on: true });
  });

  /* いき。体（なければ 頭）に だけ。 */
  const breathOn = body || head;
  if(breathOn) breath(breathOn, body ? 0.012 : 0.008, loop ? fitPeriod(3.6, loop) : 3.6);

  /* ぜんぶ ひとまとめの フォルダに 入れる。
     入れるのは「親の いない もの」だけ ―― 子は 親に ついて 入る。
     こう しないと おやこ（頭は 体の 子）が こわれる。 */
  let folder = null;
  if(o.folder){
    folder = newFolder(o.folderName || 'キャラ');
    /* PSD の グループは フォルダに なって いる ので、
       読みこんだ ものの「いちばん 外がわ」を 入れる（グループごと）。 */
    const byId = {};
    project.layers.forEach(l => byId[l.id] = l);
    const roots = [];
    layers.forEach(l => {
      let c = l, g = 0;
      while(c.parent && byId[c.parent] && g++ < 200) c = byId[c.parent];
      if(!roots.includes(c)) roots.push(c);
    });
    if(roots.length){
      const at = Math.min(...roots.map(l => project.layers.indexOf(l)));
      project.layers.splice(Math.max(0, at), 0, folder);
      /* じくは 中身の まん中。setParent が 見た目を 保つ。 */
      folder.x = roots.reduce((a, k) => a + k.x, 0) / roots.length;
      folder.y = roots.reduce((a, k) => a + k.y, 0) / roots.length;
      roots.forEach(l => setParent(project, l, folder.id, 0));
      /* どう つけたか を フォルダに おぼえさせる。
         あとで「キャラのうごき」から まとめて 直せる。 */
      folder.rig = Object.assign(newRigSet(), {
        loop: loop || 4,
        motion: MOTIONS[o.motion] ? o.motion : 'しぜん'
      });
      /* えらんだ うごきを そのまま かける（首ふり・はね も ここで つく） */
      applyRig(project, folder);
    }
  }

  return {
    ok: true,
    n: roles.reduce((a, r) => a + found[r].length, 0),
    roles, linked, swayed, loop,
    motion: folder && folder.rig ? folder.rig.motion : null,
    folder: folder ? folder.name : null,
    breath: breathOn ? breathOn.name : null
  };
}

/** おしらせの 文 */
export function rigReport(r){
  if(!r.ok) return 'レイヤーの 名前から 体や 髪が 見つかりませんでした。'
    + String.fromCharCode(10)
    + '「体」「頭」「前髪」「うで」などの 名前を つけて ためしてね。';
  const NL = String.fromCharCode(10);
  const nm = { earring:'イヤリング', frontHair:'前髪', backHair:'後ろ髪', hair:'髪', head:'頭',
               brow:'眉', eye:'目', mouth:'口', arm:'うで', chest:'胸', body:'体' };
  return r.n + 'まいに うごきを つけました（'
    + r.roles.map(x => nm[x] || x).join('・') + '）' + NL
    + 'おやこ ' + r.linked + 'か所、ゆれ ' + r.swayed + 'まい'
    + (r.breath ? '、いき は「' + r.breath + '」' : '') + NL
    + (r.folder ? 'フォルダ「' + r.folder + '」に まとめました。' + NL : '')
    + (r.motion ? 'うごきは「' + r.motion + '」。' : '')
    + (r.loop ? r.loop + '秒 で ひとまわり する ように そろえました。' : '');
}

/** パーツごとに 直せる もの の 一覧 [{ id, name, role }]（レイヤーと 骨） */
export function rigParts(project, root){
  const out = [];
  const addHone = (h) => (h.hone && h.hone.bones || []).forEach(b => {
    if(!b.parent) return;
    const r = roleOf(b.name); if(r && SWAY[r]) out.push({ id: 'b:' + h.id + ':' + b.id, name: '🦴 ' + b.name, role: r });
  });
  if(root.kind === 'hone'){ addHone(root); return out; }
  const walk = (id) => project.layers.forEach(l => {
    if(l.parent !== id) return;
    if(l.kind === 'hone') addHone(l);
    else if(l.rigRole && SWAY[l.rigRole]) out.push({ id: l.id, name: l.name, role: l.rigRole });
    walk(l.id);
  });
  walk(root.id);
  return out;
}

/** 🧷 パペットを 自動で 組む。じく（つけね）から 反対がわの はしへ ピンを ならべる。
    髪・イヤリング・リボン・うで など、しなって ほしい ものに。 */
export function autoPins(project, l, n){
  const a = l.frames && project.assets[l.frames[0]];
  if(!a || !a.w || !a.h) return false;
  /* じくが まん中の まま（決めて いない）なら、役の つけねを つかう */
  const mid = !l.pivot || (Math.abs(l.pivot.x - 0.5) < 0.01 && Math.abs(l.pivot.y - 0.5) < 0.01);
  const pv = (!mid && l.pivot) || PIVOT[l.rigRole] || { x: 0.5, y: 0.05 };
  const x0 = pv.x * a.w, y0 = pv.y * a.h;
  /* いちばん とおい はしへ（たて長なら たて、よこ長なら よこ） */
  let x1 = (1 - pv.x) * a.w, y1 = (1 - pv.y) * a.h;
  if(Math.abs(pv.x - 0.5) < 0.2) x1 = x0;
  if(Math.abs(pv.y - 0.5) < 0.2) y1 = y0;
  if(Math.hypot(x1 - x0, y1 - y0) < Math.max(a.w, a.h) * 0.2){ x1 = x0; y1 = a.h * 0.95; }
  const k = Math.max(3, n || 4);
  l.pins = [];
  for(let i = 0; i < k; i++){
    const t = i / (k - 1) * 0.92;
    l.pins.push(newPin(+(x0 + (x1 - x0) * t).toFixed(1), +(y0 + (y1 - y0) * t).toFixed(1), i === 0 ? 'fix' : 'move', false));
  }
  if(l.mesh) l.mesh.dirty = true;
  return true;
}
