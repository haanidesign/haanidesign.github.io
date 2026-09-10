/* 文字のレイヤー。
   文字はいったん別紙（canvas）に描いてから、ふつうの絵として扱う。
   こうすると、動かす・回す・塗る・ぼかす・ピンで曲げる が
   絵とまったく同じしくみで効く。文字を変えたら描き直すだけ。 */

import { S, addAsset } from '../state.js?v=178';
import { newLayer, groupInto } from '../engine/layer.js?v=178';
import { M } from '../engine/math.js?v=178';
import { loadImage } from './image.js?v=178';

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


/* ================= 一文字ずつ に わける =================

   「列車」ごっこの もと。
   1まいの 文字レイヤーを、1文字 1まいの レイヤーに ばらす。

   だいじな ところ
     ばらした あと、見た目が 1ドットも 変わらない こと。
     だから 元の 紙の 中で その 字が どこに いたかを 測って、
     おなじ ところに 置き直す。

   測り方は textToCanvas と 同じ 手順に そろえて ある
   （行ごとの はば → よせ方 → 1字ずつの 送り）。 */

/** 元の 紙の 中での、1字ずつの まん中 */
export function charBoxes(t){
  const lines = String(t.str || '').split(String.fromCharCode(10));
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = fontCss(t);

  let w = 1;
  for(const ln of lines) w = Math.max(w, meas.measureText(ln || ' ').width);
  const lh = t.size * t.lineHeight;
  const pad = Math.ceil(t.size * 0.35 + (t.strokeWidth || 0));
  const cw = Math.ceil(w) + pad * 2;
  const ch = Math.ceil(lh * lines.length) + pad * 2;

  const out = [];
  lines.forEach((ln, li) => {
    const lw = meas.measureText(ln || ' ').width;
    let x = (t.align === 'left')  ? pad
          : (t.align === 'right') ? cw - pad - lw
          : (cw - lw) / 2;
    const y = pad + lh * (li + 0.5);
    for(const chr of [...ln]){
      const adv = meas.measureText(chr).width;
      // 空白は 場所を あけるだけ。レイヤーには しない
      if(chr.trim()) out.push({ chr, x: x + adv / 2, y });
      x += adv;
    }
  });
  return { boxes: out, w: cw, h: ch };
}

/**
 * 文字レイヤーを 1字ずつの レイヤーに ばらす。
 * 元の レイヤーは 消さずに 見えなくして 残す
 * （文を 直したく なったら もどせる ように）。
 * かえりは できた レイヤーの ならび（左から 右、上から 下）。
 */
export async function splitTextChars(layer){
  if(!layer || layer.kind !== 'text') return [];
  const t = layer.text;
  const { boxes, w, h } = charBoxes(t);
  if(boxes.length < 2) return [];

  const pvx = (layer.pivot && layer.pivot.x != null) ? layer.pivot.x : 0.5;
  const pvy = (layer.pivot && layer.pivot.y != null) ? layer.pivot.y : 0.5;
  /* 元レイヤーの 姿（親から 見た ところ）。
     ピンが うって あっても、ばらすのは いまの 素の 姿 でよい。 */
  const m = M.trs(layer.x, layer.y, layer.rot || 0,
                  layer.scaleX == null ? 1 : layer.scaleX,
                  layer.scaleY == null ? 1 : layer.scaleY);

  const made = [];
  for(const b of boxes){
    const c = newLayer(b.chr, []);
    c.kind = 'text';
    c.text = Object.assign({}, t, { str: b.chr, align: 'center' });
    await renderTextLayer(c);
    c.name = b.chr;

    // 元の 紙の 中の 場所 → 親から 見た 場所
    const q = M.apply(m, b.x - w * pvx, b.y - h * pvy);
    c.x = q.x; c.y = q.y;
    c.rot = layer.rot || 0;
    c.scaleX = layer.scaleX; c.scaleY = layer.scaleY;
    c.lockAspect = layer.lockAspect;
    c.parent = layer.parent || null;
    c.depth = layer.depth || 0;
    made.push(c);
  }

  const at = S.proj.layers.indexOf(layer);
  S.proj.layers.splice(at < 0 ? 0 : at, 0, ...made);
  layer.visible = false;
  if(!/もと$/.test(layer.name)) layer.name = layer.name + '（もと）';

  /* ばらした 字は 1つの フォルダに まとめる。
     タイムラインが 1字 1行に なって しまうと ながすぎる ので、
     たたんで おける ように する。
     元の 文（見えなく した もの）も いっしょに 入れて、
     その 文に かんする ものを 1つの ふくろに まとめる。 */
  const folder = groupInto(S.proj, [...made.map(m => m.id), layer.id],
                           S.time, shortName(t.str));
  if(folder) folder.open = false;          // はじめは たたんで おく

  return { chars: made, folder };
}
