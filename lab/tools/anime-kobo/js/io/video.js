/* 🎬 動画を 読みこむ。

   動画を そのまま 持つと、書き出し・コマ送り・止めて 見る で
   ずれやすい。なので 決まった 間かくで 絵に して、
   パラパラと 同じ「コマ」の レイヤーに する。
     ・ふつうの レイヤー なので 動かす・重ねる・グリッチ が そのまま
     ・どの 時こくでも 同じ 絵が 出る（書き出しで ずれない）
   その かわり 長い 動画は 重く なる ので、長さと 大きさに 上限を つける。 */

import { S, addAsset } from '../state.js?v=332';
import { newLayer } from '../engine/layer.js?v=332';
import { loadImage } from './image.js?v=332';
import { setPin } from '../engine/anim.js?v=332';

export const VIDEO_MAX_SEC = 20;   // これより 長い ぶんは 切る
const MAX_SIDE = 720;              // 絵の 長いほう
const MAX_SIDE_SHORT = 1080;       // 6秒までの 短い 動画は 大きい まま（すける 動きの 素材 など。小さく すると ぼける）

export const isVideoFile = (f) =>
  /^video\//.test(f.type || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.name || '');

function waitEv(el, ev, ms){
  return new Promise((ok, ng) => {
    const t = setTimeout(() => { el.removeEventListener(ev, h); ng(new Error('timeout')); }, ms || 8000);
    const h = () => { clearTimeout(t); el.removeEventListener(ev, h); ok(); };
    el.addEventListener(ev, h);
  });
}

/**
 * 動画を コマの レイヤーに する。
 * opt … { fps, onProgress(i, n) }
 * 戻り値 … { layer, frames, sec, cut }
 */
export async function addVideoFile(file, opt = {}){
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try{
    await waitEv(v, 'loadeddata', 15000);
  }catch(_){
    URL.revokeObjectURL(url);
    throw new Error('この動画は 読めませんでした（mp4 を ためしてね）');
  }
  const full = isFinite(v.duration) ? v.duration : 0;
  const sec = Math.min(full || 0, VIDEO_MAX_SEC);
  if(!(sec > 0)){ URL.revokeObjectURL(url); throw new Error('動画の 長さが わかりませんでした'); }

  const fps = Math.max(4, Math.min(30, opt.fps || 12));
  const k = Math.min(1, (sec <= 6 ? MAX_SIDE_SHORT : MAX_SIDE) / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.max(2, Math.round(v.videoWidth * k));
  const h = Math.max(2, Math.round(v.videoHeight * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');

  const n = Math.max(1, Math.floor(sec * fps));
  let clear = null;
  const ids = [];
  const base = (file.name || '動画').replace(/\.[^.]+$/, '');
  for(let i = 0; i < n; i++){
    const t = Math.min(full - 0.001, i / fps);
    if(Math.abs(v.currentTime - t) > 0.0005){
      v.currentTime = t;
      try{ await waitEv(v, 'seeked', 8000); }catch(_){}
    }
    // すける 動画（webm）は 前の コマが 残らない ように 毎回 消す
    g.clearRect(0, 0, w, h);
    g.drawImage(v, 0, 0, w, h);
    if(clear === null) clear = hasAlpha(g, w, h);
    // すける ところが あれば すけた まま しまう（JPEG だと 黒く なる）
    const src = clear ? cv.toDataURL('image/webp', 0.9) : cv.toDataURL('image/jpeg', 0.82);
    ids.push(addAsset(base + '_' + (i + 1), src, w, h, await loadImage(src)));
    if(opt.onProgress) opt.onProgress(i + 1, n);
  }
  URL.revokeObjectURL(url);

  const l = newLayer(base, ids);
  l.video = { name: file.name, fps, sec };
  /* キャンバスに 入る 大きさに（はみ出さない） */
  const fit = Math.min(S.proj.w / v.videoWidth, S.proj.h / v.videoHeight);
  l.scaleX = l.scaleY = fit / k;
  l.x = S.proj.w / 2;
  l.y = S.proj.h / 2;
  l.tracks = {};
  for(let i = 0; i < n; i++) setPin(l, 'frame', i / fps, i, 'hold');
  S.proj.layers.unshift(l);
  S.sel = l.id;
  return { layer: l, frames: n, sec, cut: full > VIDEO_MAX_SEC + 0.01 };
}

/** すける ところが あるか（まばらに しらべる） */
function hasAlpha(g, w, h){
  try{
    const d = g.getImageData(0, 0, w, h).data;
    for(let i = 3; i < d.length; i += 4 * 97) if(d[i] < 250) return true;
  }catch(_){}
  return false;
}
