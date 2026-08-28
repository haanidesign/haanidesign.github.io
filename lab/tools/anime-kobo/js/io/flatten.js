/* レイヤーを 合体して 1まいの 絵に する。

   やっていること
     ① えらんだ レイヤーだけの「にせプロジェクト」を つくる
     ② それを ふつうに 描く（＝いま 見えている とおりに 焼く）
     ③ 絵の ある ところだけ 切り出して、新しい 1まいに する
     ④ もとの レイヤーは 消して、その 場所に 新しいのを 置く

   ここが むずかしい ところ
     フォルダや 親レイヤーの 中の ものを 焼くと、
     焼いた 絵には すでに 親の うごき（場所・かたむき・大きさ）が
     入っている。そのまま 親に つけ直すと 親のぶんが
     2回 かかって、絵が 別の ところへ 飛んでいく。

     なので
       ・親の うごきは 焼きこむ（見た目を そのままに するため）
       ・親の 見た目の 効果（塗り・ふち・ぼかし・すけ・フォルダのピン）は
         焼きこまない（あとで 親が もう一度 かけるから）
       ・つけ直すときは 親の うごきの ぶんを 打ち消した 場所に 置く
     この 3つで、焼く前と 1ドットも ずれない。

   焼くと 中の うごき・ピンは もどせなくなる（「もどす」では 戻せる）。 */

import { S, addAsset } from '../state.js?v=82';
import { M } from '../engine/math.js?v=82';
import { createRenderer } from '../render/renderer.js?v=82';
import { newLayer, isFolder, computeAll,
         removeLayers } from '../engine/layer.js?v=82';
import { contentBox, loadImage } from './image.js?v=82';

/** そのレイヤーたち＋中身 */
function coreOf(project, ids){
  const set = new Set();
  const down = (id) => {
    if(set.has(id)) return;
    set.add(id);
    const l = project.layers.find(x => x.id === id);
    if(l && isFolder(l)) project.layers.forEach(x => { if(x.parent === id) down(x.id); });
  };
  ids.forEach(down);
  return set;
}

/** 上に つながっている 親を ぜんぶ */
function upOf(project, core){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);
  const up = new Set();
  core.forEach(id => {
    let l = byId[id], guard = 0;
    while(l && l.parent && guard++ < 64){
      if(!core.has(l.parent)) up.add(l.parent);
      l = byId[l.parent];
    }
  });
  return up;
}

/** 見た目の 効果を なくした 写し（うごきは そのまま） */
function noEffects(l){
  return Object.assign({}, l, {
    tint: { color: (l.tint && l.tint.color) || '#F2A0B8', amount: 0 },
    stroke: { color: (l.stroke && l.stroke.color) || '#FFFEF7', width: 0 },
    blur: 0, opacity: 1, mblur: 0, hand: null,
    pins: [], mesh: null,
    // ピンの ぶんの うごきは 焼きこまない（あとで 親が かけ直す）
    tracks: dropEffectTracks(l.tracks)
  });
}

/** 効果の ピンだけ とりのぞく（場所・かたむき・大きさの ピンは のこす） */
function dropEffectTracks(tracks){
  const out = {};
  Object.keys(tracks || {}).forEach(ch => {
    if(ch === 'tint' || ch === 'stroke' || ch === 'blur' || ch === 'opacity') return;
    if(/^P.+:(x|y)$/.test(ch)) return;          // パペットピン
    out[ch] = tracks[ch];
  });
  return out;
}

/**
 * えらんだ レイヤーを いまの 時間の 見た目で 焼いて 1まいに する。
 *   ids  … 合体する レイヤーの id
 *   name … 新しい レイヤーの 名前
 * 戻り値 … applyBake に わたす もの
 */
export async function bakeLayers(ids, name){
  const P = S.proj;
  const list = P.layers.filter(l => ids.includes(l.id));
  if(list.length < 2) throw new Error('2まい いじょう えらんでね');

  const core = coreOf(P, ids);
  const up = upOf(P, core);

  /* にせプロジェクト。
       えらんだ ぶん … そのまま
       上の 親     … うごきだけ のこして 効果は なくす。
                     フォルダで ないものは 自分は 描かない */
  const sub = Object.assign({}, P, {
    layers: P.layers.filter(l => core.has(l.id) || up.has(l.id)).map(l => {
      if(core.has(l.id)) return l;
      const q = noEffects(l);
      if(!isFolder(l)) q.visible = false;       // 親の絵まで 焼かない
      return q;
    })
  });

  const cv = document.createElement('canvas');
  cv.width = P.w; cv.height = P.h;
  const R = createRenderer(cv);
  R.draw(sub, S.imgs, S.time, { x: 0, y: 0, z: 1 },
    { forExport: true, noBg: true, noMotionBlur: true });

  const box = contentBox(cv);
  if(!box) throw new Error('絵が ありませんでした');
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;

  const cut = document.createElement('canvas');
  cut.width = w; cut.height = h;
  cut.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);

  const src = cut.toDataURL('image/png');
  const im = await loadImage(src);

  /* 親の うごきの ぶんを 打ち消した 場所を 出す。
     焼いた 絵は キャンバスの まま（かたむきなし・1ばい）なので、
     それを 親から 見た 形に なおす。 */
  const top = list[0];

  /* つけ直す 先は「消えずに のこる 親」。
     えらんだ 中の レイヤーを 親に すると、その親も 消えるので
     行き先が なくなって しまう。のこる ところまで さかのぼる。 */
  const byId = {};
  P.layers.forEach(l => byId[l.id] = l);
  let parent = top.parent || null, guard = 0;
  while(parent && core.has(parent) && guard++ < 64){
    parent = (byId[parent] || {}).parent || null;
  }
  let place = { x: x0 + w / 2, y: y0 + h / 2, rot: 0, scaleX: 1, scaleY: 1 };
  if(parent){
    const poses = computeAll(P, S.time);
    const pm = poses[parent] && poses[parent].m;
    if(pm){
      const world = M.trs(place.x, place.y, 0, 1, 1);
      place = M.decompose(M.mul(M.inv(pm), world));
    }
  }

  return {
    name: name || (list[0].name + ' 合体'),
    src, im, w, h, place, parent,
    at: P.layers.indexOf(top)
  };
}

/** bakeLayers の あとしまつ。edit() の 中で よぶ */
export function applyBake(ids, made){
  const P = S.proj;
  const asset = addAsset(made.name, made.src, made.w, made.h, made.im);
  const l = newLayer(made.name, [asset]);
  /* まんなか じくの まま、切り出した ところに ぴったり 置く */
  l.x = made.place.x;
  l.y = made.place.y;
  l.rot = made.place.rot;
  l.scaleX = made.place.scaleX;
  l.scaleY = made.place.scaleY;
  l.parent = made.parent;

  const at = Math.max(0, Math.min(P.layers.length, made.at));
  P.layers.splice(at, 0, l);          // もとの いちばん上の ところへ
  removeLayers(P, ids);
  return l;
}
