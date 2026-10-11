/* 動画工房の 文字の しくみを ここで うごかす ための つなぎ。
   動画工房の S（作品の はば・画質）と 拍の 関数・bus の かわり。 */
import { S as AS } from '../state.js?v=363';

export const S = {
  get W(){ return (AS.proj && AS.proj.w) || 1080; },
  get H(){ return (AS.proj && AS.proj.h) || 1920; },
  quality: 1
};
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const beat = () => (AS.proj && AS.proj.beat) || null;
export const beatOn = () => { const b = beat(); return !!(b && b.bpm > 0); };
export const beatSec = () => 60 / Math.max(20, Math.min(400, (beat() && beat().bpm) || 120));
export const beatAt = (t) => { const b = beat(); return (t - ((b && b.offset) || 0)) / beatSec(); };

/* 書たいを 読み おわったら 描きなおす */
let redraw = () => {};
export const setMojiRedraw = (fn) => { redraw = fn; };
export const bus = { stage: () => redraw(), panel: () => redraw() };
