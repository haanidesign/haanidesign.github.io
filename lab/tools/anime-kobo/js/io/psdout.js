/* PSD で 書き出す。

   ねらい
     いまの コマの 見た目を、クリスタや フォトショップで
     そのまま つづきが 描ける かたちで 出す。

   やっていること
     ① レイヤー 1まいずつを 別べつに 焼く
        （親フォルダの うごきは 焼きこむ。すけ具合と かさね方は 焼かない）
     ② フォルダは PSD の グループに する（入れ子の まま）
     ③ すけ具合・かさね方（乗算 など）は PSD の 記録として わたす
        → 向こうで もう一度 かかるので、見た目が 合う

   できない こと
     フォルダで ない「親つけ」は PSD に そういう しくみが 無い。
     うごきを 焼きこんで、見た目だけ 合わせる（位置は そのまま）。 */

import { S } from '../state.js?v=176';
import { createRenderer } from '../render/renderer.js?v=176';
import { isFolder, isAudioLayer } from '../engine/layer.js?v=176';
import { contentBox } from './image.js?v=176';
import { BLEND_PSD } from './psd.js?v=176';

/** 効果は のこして、すけ具合と かさね方だけ 1 に する */
function plain(l){
  return Object.assign({}, l, {
    opacity: 1, blend: 'normal',
    tracks: (() => {
      const out = {};
      Object.keys(l.tracks || {}).forEach(ch => {
        if(ch === 'opacity') return;
        out[ch] = l.tracks[ch];
      });
      return out;
    })()
  });
}

/** 親フォルダの うごきだけ のこした 写し */
function carrier(l){
  return Object.assign({}, l, {
    tint: { color: (l.tint && l.tint.color) || '#F2A0B8', amount: 0 },
    stroke: { color: (l.stroke && l.stroke.color) || '#FFFEF7', width: 0 },
    blur: 0, opacity: 1, blend: 'normal', mblur: 0
  });
}

/** そのレイヤー 1まいだけを 画面ぜんぶの 紙に 焼く */
function bake(P, layer, cv){
  const byId = {};
  P.layers.forEach(l => byId[l.id] = l);

  const keep = new Set([layer.id]);
  let p = layer.parent, guard = 0;
  while(p && guard++ < 64){ keep.add(p); p = (byId[p] || {}).parent; }

  const sub = Object.assign({}, P, {
    layers: P.layers.filter(l => keep.has(l.id)).map(l => {
      if(l.id === layer.id) return plain(l);
      const q = carrier(l);
      if(!isFolder(l)) q.visible = false;
      return q;
    })
  });

  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const R = createRenderer(cv);
  R.draw(sub, S.imgs, S.time, { x: 0, y: 0, z: 1 },
    { forExport: true, noBg: true, noMotionBlur: true });
}

/** 絵の ある ところだけ 切り出す。なければ null */
function cut(cv){
  const box = contentBox(cv);
  if(!box) return null;
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  return { canvas: c, left: x0, top: y0, right: x0 + w, bottom: y0 + h };
}

/**
 * いまの コマを PSD にする。Blob を 返す。
 */
export async function exportPsd(project, opts = {}){
  if(typeof agPsd === 'undefined') throw new Error('PSDの部品が見つかりません');
  const P = project || S.proj;

  const cv = document.createElement('canvas');
  cv.width = P.w; cv.height = P.h;

  /* 子を 先に つくって、フォルダに 入れていく。
     P.layers は 手前が 先頭。PSD の children は 奥が 先頭なので、
     さかさに たどれば その まま つみあがる。 */
  const kidsOf = new Map();          // parentId(または null) → [PSDノード]
  const push = (pid, node) => {
    const key = pid || '_root';
    if(!kidsOf.has(key)) kidsOf.set(key, []);
    kidsOf.get(key).push(node);
  };

  const order = P.layers.slice().reverse();     // 奥 → 手前
  const madeFolder = new Map();

  for(const l of order){
    if(isAudioLayer(l) || l.kind === 'camera') continue;
    if(l.visible === false) continue;

    if(isFolder(l)){
      const node = {
        name: l.name || 'フォルダ',
        opened: true,
        children: [],
        opacity: Math.max(0, Math.min(1, l.opacity == null ? 1 : l.opacity)),
        blendMode: BLEND_PSD[l.blend || 'normal'] || 'normal'
      };
      madeFolder.set(l.id, node);
      push(l.parent, node);
      continue;
    }

    bake(P, l, cv);
    const c = cut(cv);
    if(!c) continue;
    push(l.parent, {
      name: l.name || 'レイヤー',
      canvas: c.canvas,
      left: c.left, top: c.top, right: c.right, bottom: c.bottom,
      opacity: Math.max(0, Math.min(1, l.opacity == null ? 1 : l.opacity)),
      blendMode: BLEND_PSD[l.blend || 'normal'] || 'normal'
    });
    if(opts.onStep) opts.onStep(l.name);
  }

  /* フォルダに 中身を 入れる。
     「親つけ」の 相手が フォルダで ない ときは、
     PSD に 入れ物が 無いので そのまま 上の 段に 出す。 */
  const stray = [];
  for(const [key, arr] of kidsOf){
    if(key === '_root') continue;
    const f = madeFolder.get(key);
    if(f) f.children = arr;
    else stray.push(...arr);
  }
  const root = (kidsOf.get('_root') || []).concat(stray);

  const psd = {
    width: P.w,
    height: P.h,
    children: root
  };

  const buf = agPsd.writePsdBuffer
    ? agPsd.writePsdBuffer(psd)
    : agPsd.writePsdUint8Array(psd);
  return new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
}
