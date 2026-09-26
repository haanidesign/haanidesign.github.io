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

import { newSway } from '../engine/puppet.js?v=295';
import { setPin } from '../engine/anim.js?v=295';
import { setParent, moveAnchorKeepAll, newFolder } from '../engine/layer.js?v=295';

/* 名前から あたりを つける。日本語も 英語も 見る。
   ならびは 大事 ―― 上に ある ものから 先に あてはめる
   （「前髪」は「髪」より 先に 見ないと まとめて 髪に なる）。 */
const RULES = [
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
const ON_HEAD = ['frontHair', 'backHair', 'hair', 'brow', 'eye', 'mouth'];
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
function breath(layer, depth, period){
  const d = depth == null ? 0.012 : depth;
  const p = Math.max(0.4, period == null ? 3.6 : period);
  const sy = layer.scaleY || 1;
  setPin(layer, 'scaleY', 0,     sy,           'smooth');
  setPin(layer, 'scaleY', p / 2, sy * (1 + d), 'smooth');
  setPin(layer, 'scaleY', p,     sy,           'smooth');
  layer.loop = { from: 0, to: p, mode: 'loop' };
}

/* ---------- あとから 直す ----------

   「うごき追加」で 入れた キャラは、まとめ役の フォルダに
   どう つけたか（rig）を 持って いる。
   その 数字を 変えて ここを 通せば、中身ぜんぶに かけ直せる。
   1まいずつ さわらなくて いい。 */

/** はじめの 数字 */
export function newRigSet(){
  return {
    loop: 4,        // 何秒で ひとまわり するか
    gain: 1,        // ゆれの 強さ（ぜんたい）
    hair: 1,        // 髪だけ 強さ
    face: 1,        // 頭・うで・胸だけ 強さ
    breath: 1       // いきの 深さ
  };
}

const HAIR_ROLES = ['frontHair', 'backHair', 'hair'];

/** その レイヤーの 役に あわせた ゆれを かけ直す */
function swayFor(l, set){
  const base = SWAY[l.rigRole];
  if(!base) return false;
  const k = (HAIR_ROLES.includes(l.rigRole) ? set.hair : set.face) * set.gain;
  l.sway = Object.assign(newSway(), base, {
    on: true,
    angle: Math.max(0, base.angle * k),
    period: fitPeriod(base.period, set.loop)
  });
  return true;
}

/**
 * まとめ役の フォルダの 下 ぜんぶに、いまの 数字を かけ直す。
 *   root … 「うごき追加」で できた フォルダ（rig を 持って いる）
 */
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

  let swayed = 0, breathOn = null;
  kids.forEach(l => {
    if(!l.rigRole) return;
    if(swayFor(l, set)) swayed++;
    if(l.rigRole === 'body') breathOn = l;
  });
  if(!breathOn) breathOn = kids.find(l => l.rigRole === 'head') || null;

  if(breathOn){
    /* いきは キーフレーム。かけ直す ときは 前のを 消してから */
    if(breathOn.tracks) delete breathOn.tracks.scaleY;
    breathOn.loop = null;
    const depth = 0.012 * set.breath;
    if(depth > 0.0005) breath(breathOn, depth, fitPeriod(3.6, set.loop));
  }
  return { swayed, breath: breathOn ? breathOn.name : null };
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

  /* いき。体（なければ 頭）に だけ。 */
  const breathOn = body || head;
  if(breathOn) breath(breathOn, body ? 0.012 : 0.008, loop ? fitPeriod(3.6, loop) : 3.6);

  /* ぜんぶ ひとまとめの フォルダに 入れる。
     入れるのは「親の いない もの」だけ ―― 子は 親に ついて 入る。
     こう しないと おやこ（頭は 体の 子）が こわれる。 */
  let folder = null;
  if(o.folder){
    folder = newFolder(o.folderName || 'キャラ');
    const roots = layers.filter(l => !l.parent);
    if(roots.length){
      const at = Math.min(...roots.map(l => project.layers.indexOf(l)));
      project.layers.splice(Math.max(0, at), 0, folder);
      /* じくは 中身の まん中。setParent が 見た目を 保つ。 */
      folder.x = roots.reduce((a, k) => a + k.x, 0) / roots.length;
      folder.y = roots.reduce((a, k) => a + k.y, 0) / roots.length;
      roots.forEach(l => setParent(project, l, folder.id, 0));
      /* どう つけたか を フォルダに おぼえさせる。
         あとで「キャラのうごき」から まとめて 直せる。 */
      folder.rig = Object.assign(newRigSet(), { loop: loop || 4 });
    }
  }

  return {
    ok: true,
    n: roles.reduce((a, r) => a + found[r].length, 0),
    roles, linked, swayed, loop,
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
  const nm = { frontHair:'前髪', backHair:'後ろ髪', hair:'髪', head:'頭',
               brow:'眉', eye:'目', mouth:'口', arm:'うで', chest:'胸', body:'体' };
  return r.n + 'まいに うごきを つけました（'
    + r.roles.map(x => nm[x] || x).join('・') + '）' + NL
    + 'おやこ ' + r.linked + 'か所、ゆれ ' + r.swayed + 'まい'
    + (r.breath ? '、いき は「' + r.breath + '」' : '') + NL
    + (r.folder ? 'フォルダ「' + r.folder + '」に まとめました。' + NL : '')
    + (r.loop ? r.loop + '秒 で ひとまわり する ように そろえました。' : '');
}
