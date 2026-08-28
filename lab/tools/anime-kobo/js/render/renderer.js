/* 描画の入口。ここだけを見ておけば、あとで WebGL2 に差し替えられる。
   PHASE 5 で gl.js を足したら decide() の中身を変えるだけで済む。 */

import { createC2D } from './c2d.js?v=93';

export function createRenderer(canvas){
  // PHASE 1 は Canvas 2D 固定。実機で重かったら WebGL2 を足してここで選ぶ。
  return createC2D(canvas);
}
