/* 文字のレイヤー。
   文字はいったん別紙（canvas）に描いてから、ふつうの絵として扱う。
   こうすると、動かす・回す・塗る・ぼかす・ピンで曲げる が
   絵とまったく同じしくみで効く。文字を変えたら描き直すだけ。 */

import { S, addAsset } from '../state.js?v=103';
import { newLayer } from '../engine/layer.js?v=103';
import { loadImage } from './image.js?v=103';

export const FONTS = [
  { key:'rounded', label:'まるゴシック', css:"'M PLUS Rounded 1c', sans-serif" },
  { key:'dot',     label:'ドット',       css:"'DotGothic16', monospace" },
  { key:'gothic',  label:'ゴシック',     css:"'Yu Gothic UI', 'Meiryo', sans-serif" },
  { key:'mincho',  label:'明朝',         css:"'Yu Mincho', 'MS Mincho', serif" }
];

export function newTextStyle(){
  return {
    str: 'ここに文字',
    size: 120,
    font: 'rounded',
    weight: 800,
    color: '#1E1C14',
    stroke: '#FFFEF7',
    strokeWidth: 10,
    lineHeight: 1.35,
    align: 'center'
  };
}

const fontCss = (t) => {
  const f = FONTS.find(x => x.key === t.font) || FONTS[0];
  return t.weight + ' ' + t.size + 'px ' + f.css;
};

/** 文字を描いた canvas を作る。まわりに ふちどりのぶんの余白をとる */
export function textToCanvas(t){
  const lines = String(t.str || ' ').split('\n');
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = fontCss(t);

  let w = 1;
  for(const ln of lines) w = Math.max(w, meas.measureText(ln || ' ').width);
  const lh = t.size * t.lineHeight;
  const h = lh * lines.length;

  const pad = Math.ceil(t.size * 0.35 + (t.strokeWidth || 0));
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w) + pad * 2;
  cv.height = Math.ceil(h) + pad * 2;

  const g = cv.getContext('2d');
  g.font = fontCss(t);
  g.textBaseline = 'middle';
  g.textAlign = t.align || 'center';
  g.lineJoin = 'round';
  g.miterLimit = 2;

  const x = t.align === 'left' ? pad : t.align === 'right' ? cv.width - pad : cv.width / 2;

  lines.forEach((ln, i) => {
    const y = pad + lh * (i + 0.5);
    if(t.strokeWidth > 0){
      g.strokeStyle = t.stroke;
      g.lineWidth = t.strokeWidth * 2;      // 外側だけ残したいので太めに引いてから塗る
      g.strokeText(ln, x, y);
    }
    g.fillStyle = t.color;
    g.fillText(ln, x, y);
  });

  return cv;
}

/** 文字レイヤーを作る／描き直す。戻り値は アセットのid */
export async function renderTextLayer(layer){
  const cv = textToCanvas(layer.text);
  const src = cv.toDataURL('image/png');
  const img = await loadImage(src);
  const id = addAsset(layer.name || '文字', src, cv.width, cv.height, img);
  // 古いコマは置きかえる（文字レイヤーはコマを1枚しか持たない）
  layer.frames = [id];
  return id;
}

/** 新しい文字レイヤーを足す */
export async function addTextLayer(str, style){
  const l = newLayer('文字', []);
  l.kind = 'text';
  l.text = Object.assign(newTextStyle(), style || {});
  if(str) l.text.str = str;

  if(!style){
    // キャンバスの幅に収まる大きさから始める
    l.text.size = Math.max(24, Math.round(S.proj.w / 9));
    l.text.strokeWidth = Math.round(l.text.size * 0.09);
  }

  await renderTextLayer(l);
  l.name = shortName(l.text.str);
  l.x = S.proj.w / 2;
  l.y = S.proj.h / 2;

  const a = S.proj.assets[l.frames[0]];
  const k = Math.min(1, (S.proj.w * 0.86) / a.w);
  l.scaleX = k; l.scaleY = k;

  S.proj.layers.unshift(l);
  S.sel = l.id;
  return l;
}

export function shortName(str){
  const s = String(str || '文字').replace(/\n/g, ' ').trim();
  return s.length > 8 ? s.slice(0, 8) + '…' : (s || '文字');
}
