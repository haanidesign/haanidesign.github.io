/* レイヤーを 合体して 1まいの 絵に する。

   やっていること
     ① えらんだ レイヤーだけの「にせプロジェクト」を つくる
     ② それを ふつうに 描く（＝いま 見えている とおりに 焼く）
     ③ 絵の ある ところだけ 切り出して、新しい 1まいに する
     ④ もとの レイヤーは 消して、その 場所に 新しいのを 置く

   焼くと 中の うごき・ピン・ふちどりは もどせなくなる。
   （「もどす」では 戻せる） */

import { S, addAsset } from '../state.js?v=59';
import { createRenderer } from '../render/renderer.js?v=59';
import { newLayer, withKinAndFolders, removeLayers, nearestFolder } from '../engine/layer.js?v=59';
import { contentBox, loadImage } from './image.js?v=59';

/**
 * えらんだ レイヤーを いまの 時間の 見た目で 焼いて 1まいに する。
 *   ids  … 合体する レイヤーの id
 *   name … 新しい レイヤーの 名前
 * 戻り値 … { layer, at, gone }（呼ぶ側で edit() の中に 入れる）
 */
export async function bakeLayers(ids, name){
  const P = S.proj;
  const list = P.layers.filter(l => ids.includes(l.id));
  if(list.length < 2) throw new Error('2まい いじょう えらんでね');

  const keep = withKinAndFolders(P, ids);

  /* えらんだ ぶんだけの プロジェクト。
     入れものの フォルダは のこすので、フォルダの ふちどりなども
     かかった ままの 見た目で 焼ける。 */
  const sub = Object.assign({}, P, {
    layers: P.layers.filter(l => keep.has(l.id))
      .map(l => (l.parent && !keep.has(l.parent)) ? Object.assign({}, l, { parent: null }) : l)
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

  /* アセットを 足すのは「もどす」の 記録に 入れたいので、
     ここでは 用意だけ して applyBake で 入れる。 */
  const top = list[0];
  return {
    name: name || (list[0].name + ' 合体'),
    src, im, w, h,
    x: x0 + w / 2,
    y: y0 + h / 2,
    at: P.layers.indexOf(top),
    parent: (nearestFolder(P, top) || {}).id || null
  };
}

/** bakeLayers の あとしまつ。edit() の 中で よぶ */
export function applyBake(ids, made){
  const P = S.proj;
  const asset = addAsset(made.name, made.src, made.w, made.h, made.im);
  const l = newLayer(made.name, [asset]);
  /* 大きさ 1ばい・まんなか じくで、切り出した ところに ぴったり 置く */
  l.x = made.x; l.y = made.y;
  l.parent = made.parent;

  const at = Math.max(0, Math.min(P.layers.length, made.at));
  P.layers.splice(at, 0, l);          // もとの いちばん上の ところへ
  removeLayers(P, ids);
  return l;
}
