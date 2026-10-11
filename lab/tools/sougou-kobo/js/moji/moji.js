/* 🔤 動く文字（kind: 'moji'）。動画工房の「1文字ずつ 動く 文字」を レイヤーに した もの。

   作品と 同じ 大きさの 紙に、まん中を 0 に して 文字を 描く。
   レイヤーの 動かす・大きさ・回転・効果は ほかと 同じに きく。
   時間は レイヤーの「出す ところ」の はじまりが 0。おわりで 消えかたが 出る。 */
import { newLayer } from '../engine/layer.js?v=363';
import { drawText, ensureFont } from './text.js?v=363';

export function newMojiText(){
  return {
    str: 'ここに もじ', size: 110, color: '#FFFEF7', stroke: '#1E1C14',
    sw: 10, weight: 800, align: 'center', bgOn: false, bgColor: '#E1DD60',
    font: 'rounded', vertical: false, tsume: 0, lineGap: 1.32,
    tracking: 0, kerning: 0, curve: 0,
    skewH: 0, skewV: 0, flipH: false, flipV: false,
    grad: false, color2: '#E1DD60', gradDir: 90,
    shadowOn: false, shadowColor: '#1E1C14', shadowX: 6, shadowY: 8, shadowBlur: 0,
    glowOn: false, glowColor: '#E1DD60', glowSize: 18,
    charOn: false, off: {},
    fxIn: 'pop', fxOut: 'fade', fxLoop: 'none',
    unit: 'char', inDur: .45, outDur: .3, stagger: .05,
    inBeat: 0, outBeat: 0, order: 'fwd', ease: 'out', dist: 0, angle: 90,
    loopAmt: 1, loopSec: .5, loopLag: true, mblur: 0
  };
}

export function newMojiLayer(project, str){
  const l = newLayer('動く文字', []);
  l.kind = 'moji';
  l.moji = newMojiText();
  if(str) l.moji.str = str;
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

export function mojiCanvas(l, time, project){
  const w = Math.max(1, project.w), h = Math.max(1, project.h);
  if(!l._mjC || l._mjC.width !== w || l._mjC.height !== h){
    l._mjC = document.createElement('canvas');
    l._mjC.width = w; l._mjC.height = h;
    l._mjC.complete = true;
    l._mjC.naturalWidth = w; l._mjC.naturalHeight = h;
  }
  l.pw = w; l.ph = h;
  const T = l.moji;
  if(T.font && T.font.startsWith('g-')) ensureFont(T.font);
  const s = l.span;
  const from = s && s.from > 0 ? s.from : 0;
  const to = s && s.to != null ? s.to : project.duration;
  const local = time - from, dur = Math.max(0.05, to - from);
  const g = l._mjC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  drawText(g, { text: T, dur }, local, time);
  return l._mjC;
}
