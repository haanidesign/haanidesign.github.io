/* 🎬 JIZURA（kind: 'jz'）。歌詞から 文字PV を まるごと 組み立てる（動画工房の JIZURA ふだ と 同じ）。

   エンジン（lib/jizura-engine.js・2MB）は はじめて つかう ときに だけ 読みこむ。
   作品と 同じ 大きさの 紙に 描いて、ふつうの レイヤーとして 出す。
   時間は レイヤーの「出す ところ」の はじまりが 0。 */
import { newLayer } from '../engine/layer.js?v=363';
import { draw, newJz, durOf, ready, styles } from './jz.js?v=363';

let loading = null;
let redraw = () => {};
export const setJzRedraw = (fn) => { redraw = fn; };
export function loadEngine(){
  if(ready()) return Promise.resolve(true);
  if(loading) return loading;
  loading = new Promise((ok) => {
    const s = document.createElement('script');
    s.src = 'lib/jizura-engine.js?v=363';
    s.onload = () => { ok(true); redraw(); };
    s.onerror = () => { loading = null; ok(false); };
    document.head.appendChild(s);
  });
  return loading;
}
export { styles, durOf, ready };

export function newJzLayer(project, lyrics){
  const l = newLayer('JIZURA', []);
  l.kind = 'jz';
  l.jz = newJz({ lyrics: lyrics || '', W: project.w, H: project.h, fps: project.fps || 30 });
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

export function jzCanvas(l, time, project){
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._jzC || l._jzC.width !== w || l._jzC.height !== h){
    l._jzC = document.createElement('canvas');
    l._jzC.width = w; l._jzC.height = h;
    l._jzC.complete = true; l._jzC.naturalWidth = w; l._jzC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const g = l._jzC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  if(!ready()){ loadEngine(); return l._jzC; }
  const j = l.jz;
  j.W = w; j.H = h; j.fps = project.fps || 30;
  const B = project.beat;
  j.bpm = B && B.bpm > 0 ? B.bpm : 0;
  j.beatOffset = B && B.offset || 0;
  const s = l.span;
  draw(g, j, time - (s && s.from > 0 ? s.from : 0), w, h, false);
  return l._jzC;
}
