/* 動きのプリセット。
   選ぶと、いまのレイヤーの姿を基準にしてピンを並べる。
   文字だけでなく、絵のレイヤーにもそのまま使える。

   どれも「いまの見た目」を終わりの姿とみなして、そこへ向かう動きを作る。
   だから並べ終わったあとに位置や大きさを変えても、破綻しない。

   ひとつの動きは
     { name, cat, icon, fn }
   の かたまりで もつ。
     name … ボタンに 出す 名まえ
     cat  … 'show'(表示) / 'move'(移動) / 'zoom'(拡大・縮小)
     icon … ボタンに 出す 小さな 絵（SVG）
     fn   … ピンを ならべる 中身
   名まえ・絵・中身を べつべつの ところに 置くと ずれて いく ので、
   かならず ここで ひとまとめに する。 */

import { setPin } from './anim.js?v=242';

/* ================= 小さな絵（アイコン） =================

   「四角い ふだが どう 動くか」を 図で 見せる。
   字が まだ すらすら 読めなくても えらべる ように する のが ねらい。
   色は トークンを そのまま つかう ので、ほかの ところと ずれない。 */

const SVG = (inner) =>
  '<svg viewBox="0 0 48 34" width="48" height="34" aria-hidden="true" focusable="false">'
  + inner + '</svg>';

/** ふだ（動く もの の みたて）。o は すけ具合、t は かたむき */
function card(x, y, w, h, o, t){
  const rot = t ? ' transform="rotate(' + t + ' ' + (x + w / 2) + ' ' + (y + h / 2) + ')"' : '';
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"'
    + ' fill="var(--main)" stroke="var(--ink)" stroke-width="2"'
    + ' opacity="' + (o == null ? 1 : o) + '"' + rot + '/>';
}

/** うっすい ふだ（まだ 来ていない／もう 行った ところ） */
function ghost(x, y, w, h, t){
  const rot = t ? ' transform="rotate(' + t + ' ' + (x + w / 2) + ' ' + (y + h / 2) + ')"' : '';
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"'
    + ' fill="none" stroke="var(--gray)" stroke-width="1.6" stroke-dasharray="3 2.5"'
    + rot + '/>';
}

/** やじるし */
function arrow(x1, y1, x2, y2){
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 4.2;
  const p = (d) => (x2 - h * Math.cos(a - d)).toFixed(1) + ','
                 + (y2 - h * Math.sin(a - d)).toFixed(1);
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"'
    + ' stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>'
    + '<polygon points="' + x2 + ',' + y2 + ' ' + p(0.5) + ' ' + p(-0.5) + '" fill="var(--ink)"/>';
}

/** まわる やじるし */
function turn(cw){
  return cw
    ? '<path d="M38 13 A15 15 0 1 1 31 5" fill="none" stroke="var(--ink)" stroke-width="2"'
      + ' stroke-linecap="round"/><polygon points="31,1 35.5,6.5 29,9" fill="var(--ink)"/>'
    : '<path d="M10 13 A15 15 0 1 0 17 5" fill="none" stroke="var(--ink)" stroke-width="2"'
      + ' stroke-linecap="round"/><polygon points="17,1 12.5,6.5 19,9" fill="var(--ink)"/>';
}

/** はやさの線。dir が 1 なら 右へ のびる */
function lines(x, y, n, len, dir){
  let s = '';
  for(let i = 0; i < n; i++){
    const yy = y + i * 5;
    const x2 = dir > 0 ? x + len - i * 2 : x - len + i * 2;
    s += '<line x1="' + x + '" y1="' + yy + '" x2="' + x2 + '" y2="' + yy + '"'
      + ' stroke="var(--gray)" stroke-width="2" stroke-linecap="round"/>';
  }
  return s;
}

/** ぱっと はじける 線 */
function burst(cx, cy, r, col){
  let s = '';
  for(let i = 0; i < 8; i++){
    const a = i * Math.PI / 4;
    s += '<line x1="' + (cx + Math.cos(a) * r).toFixed(1) + '" y1="' + (cy + Math.sin(a) * r).toFixed(1) + '"'
      + ' x2="' + (cx + Math.cos(a) * (r + 4)).toFixed(1) + '" y2="' + (cy + Math.sin(a) * (r + 4)).toFixed(1) + '"'
      + ' stroke="' + (col || 'var(--pink)') + '" stroke-width="2" stroke-linecap="round"/>';
  }
  return s;
}

/** ゆか（そこに ぶつかる） */
const floorLine = '<line x1="2" y1="31" x2="46" y2="31" stroke="var(--gray)"'
  + ' stroke-width="2" stroke-linecap="round"/>';

/** ばねの線（びよーん） */
const spring = '<path d="M24 1 q5 3 -4 5 q-9 2 4 5" fill="none" stroke="var(--gray)"'
  + ' stroke-width="2" stroke-linecap="round"/>';

/** よこの 両むき やじるし（ふくらむ・ちぢむ） */
const bothSides =
  '<line x1="4" y1="17.5" x2="11" y2="17.5" stroke="var(--gray)" stroke-width="2" stroke-linecap="round"/>'
  + '<line x1="37" y1="17.5" x2="44" y2="17.5" stroke="var(--gray)" stroke-width="2" stroke-linecap="round"/>';

const MID = card(15, 11, 18, 13);          // まん中に ぴたっと おさまった ふだ

const ICON = {
  fade:     SVG(card(15, 11, 18, 13, 0.28) + card(15, 11, 18, 13, 1)),
  flicker:  SVG(burst(24, 17.5, 12) + card(15, 11, 18, 13, 0.5)),
  blur:     SVG(lines(3, 12, 3, 8, 1) + lines(45, 12, 3, 8, -1) + card(16, 11, 16, 13)),

  rise:     SVG(ghost(15, 22, 18, 11) + arrow(24, 30, 24, 21) + card(15, 2, 18, 13)),
  drop:     SVG(ghost(15, 1, 18, 11) + arrow(24, 3, 24, 12) + card(15, 18, 18, 13)),
  slideL:   SVG(ghost(1, 11, 18, 13) + arrow(10, 17.5, 21, 17.5) + card(24, 11, 18, 13)),
  slideR:   SVG(ghost(29, 11, 18, 13) + arrow(38, 17.5, 27, 17.5) + card(6, 11, 18, 13)),
  drift:    SVG(lines(3, 12, 3, 10, 1) + card(20, 11, 18, 13)),
  spin:     SVG(turn(true) + MID),
  tumble:   SVG(ghost(2, 14, 13, 10, -30)
              + '<path d="M9 9 q12 -8 24 1" fill="none" stroke="var(--gray)"'
              + ' stroke-width="1.6" stroke-dasharray="3 2.5"/>'
              + card(26, 11, 18, 13, 1, 12)),
  bungee:   SVG(spring + arrow(24, 9, 24, 15) + card(15, 17, 18, 14)),
  bounce:   SVG(floorLine
              + '<path d="M4 3 Q10 31 17 13 Q22 31 26 20" fill="none" stroke="var(--gray)"'
              + ' stroke-width="1.6" stroke-dasharray="3 2.5"/>'
              + card(28, 17, 16, 13)),

  pop:      SVG(burst(24, 17.5, 12) + card(17, 13, 14, 10)),
  grow:     SVG(ghost(3, 4, 13, 10) + arrow(18, 14, 24, 20) + card(25, 12, 19, 16)),
  shrink:   SVG(ghost(3, 3, 24, 19) + arrow(29, 14, 35, 20) + card(33, 19, 11, 10)),

  outFade:  SVG(card(15, 11, 18, 13, 1) + card(15, 11, 18, 13, 0.28)),
  outFlick: SVG(burst(24, 17.5, 12, 'var(--gray)') + card(15, 11, 18, 13, 0.22)),
  outUp:    SVG(ghost(15, 1, 18, 9) + card(15, 19, 18, 13, 0.4) + arrow(24, 18, 24, 5)),
  outDown:  SVG(ghost(15, 24, 18, 9) + card(15, 2, 18, 13, 0.4) + arrow(24, 16, 24, 29)),
  outRight: SVG(card(4, 11, 18, 13, 0.4) + arrow(24, 17.5, 43, 17.5)),
  outLeft:  SVG(card(26, 11, 18, 13, 0.4) + arrow(24, 17.5, 5, 17.5)),
  outSpin:  SVG(turn(false) + card(15, 11, 18, 13, 0.5)),
  outSmall: SVG(ghost(9, 5, 30, 23) + arrow(15, 10, 20, 14) + card(20, 14, 10, 8)),
  outBig:   SVG(ghost(3, 1, 42, 32) + arrow(21, 14, 13, 7) + card(18, 13, 14, 10, 0.45)),
  outBlur:  SVG(lines(3, 12, 3, 8, 1) + lines(45, 12, 3, 8, -1) + card(16, 11, 16, 13, 0.45)),

  breathe:  SVG(ghost(9, 5, 30, 24) + bothSides + MID),
  float:    SVG(arrow(24, 13, 24, 3) + arrow(24, 22, 24, 32) + card(15, 12, 18, 11)),
  tilt:     SVG(ghost(15, 11, 18, 13, -13) + ghost(15, 11, 18, 13, 13) + MID),
  swim:     SVG('<path d="M2 25 q6 -8 12 0 t12 0 t12 0" fill="none" stroke="var(--gray)"'
              + ' stroke-width="2" stroke-linecap="round"/>' + card(16, 4, 16, 12))
};

/** 図の ならべ方（Adobe Express の アニメーション一覧と 同じ 分け方） */
export const CATS = [
  { key:'show', label:'表示' },
  { key:'move', label:'移動' },
  { key:'zoom', label:'拡大・縮小' }
];

function base(l){
  return { x: l.x, y: l.y, sx: l.scaleX, sy: l.scaleY, rot: l.rot,
           op: l.opacity, blur: l.blur || 0 };
}

/* ================= 出てくる 動き =================
   t0 から dur かけて、いまの姿に なる。 */

export const IN_LIST = [
  { name:'ふわっと出る', cat:'show', icon:ICON.fade, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur, b.op, 'smooth');
  }},

  /* ちかちか … つく／消えるを くり返してから ちゃんと つく。
     とちゅうを 作らない ので 'hold'（段々）で 切りかえる。 */
  { name:'ちかちか つく', cat:'show', icon:ICON.flicker, fn:(l, t0, dur) => {
    const b = base(l);
    const step = dur / 7;
    for(let i = 0; i < 6; i++){
      setPin(l, 'opacity', t0 + step * i, i % 2 ? b.op : 0, 'hold');
    }
    setPin(l, 'opacity', t0 + dur, b.op, 'hold');
  }},

  { name:'ぼけから くっきり', cat:'show', icon:ICON.blur, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'blur', t0, 26, 'smooth');
    setPin(l, 'blur', t0 + dur, b.blur, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.8, b.op, 'smooth');
    setPin(l, 'scaleX', t0, b.sx * 1.12, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 1.12, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
  }},

  { name:'下からあがる', cat:'move', icon:ICON.rise, fn:(l, t0, dur) => {
    const b = base(l);
    const d = Math.max(40, l.y * 0.12);
    setPin(l, 'y', t0, b.y + d, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  }},

  { name:'上からおちる', cat:'move', icon:ICON.drop, fn:(l, t0, dur) => {
    const b = base(l);
    const d = Math.max(40, l.y * 0.12);
    setPin(l, 'y', t0, b.y - d, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  }},

  { name:'左からすべる', cat:'move', icon:ICON.slideL, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x - 400, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.6, b.op, 'smooth');
  }},

  { name:'右からすべる', cat:'move', icon:ICON.slideR, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x + 400, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.6, b.op, 'smooth');
  }},

  /* すーっと … すべるの ひかえめ版。
     大きく 動かさない ので、たくさん ならべても うるさく ならない。 */
  { name:'すーっと ながれる', cat:'move', icon:ICON.drift, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x - 70, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur, b.op, 'smooth');
  }},

  { name:'くるっと まわる', cat:'move', icon:ICON.spin, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'rot', t0, b.rot - 180, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot, 'smooth');
    setPin(l, 'scaleX', t0, b.sx * 0.3, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 0.3, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.5, b.op, 'smooth');
  }},

  /* ころがる … 横から すべりながら 1回転。
     まわりながら 近づく ので、まわるだけ より いきおいが 出る。 */
  { name:'くるくる ころがる', cat:'move', icon:ICON.tumble, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x - 320, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'rot', t0, b.rot - 360, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
  }},

  { name:'おちて バウンド', cat:'move', icon:ICON.bounce, fn:(l, t0, dur) => {
    const b = base(l);
    const d = Math.max(60, l.y * 0.2);
    setPin(l, 'y', t0, b.y - d, 'smooth');
    setPin(l, 'y', t0 + dur * 0.55, b.y, 'smooth');
    setPin(l, 'y', t0 + dur * 0.72, b.y - d * 0.28, 'smooth');
    setPin(l, 'y', t0 + dur * 0.87, b.y, 'smooth');
    setPin(l, 'y', t0 + dur * 0.95, b.y - d * 0.08, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.3, b.op, 'smooth');
  }},

  /* びよーん … 行きすぎて から もどる。
     上下に つぶれ／のびる を つけると、ゴムらしく なる。 */
  { name:'びよーんと 出る', cat:'move', icon:ICON.bungee, fn:(l, t0, dur) => {
    const b = base(l);
    const d = Math.max(80, l.y * 0.22);
    setPin(l, 'y', t0, b.y - d, 'smooth');
    setPin(l, 'y', t0 + dur * 0.6, b.y + d * 0.22, 'smooth');
    setPin(l, 'y', t0 + dur * 0.82, b.y - d * 0.07, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 1.2, 'smooth');
    setPin(l, 'scaleY', t0 + dur * 0.6, b.sy * 0.86, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'scaleX', t0, b.sx * 0.85, 'smooth');
    setPin(l, 'scaleX', t0 + dur * 0.6, b.sx * 1.1, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.3, b.op, 'smooth');
  }},

  { name:'ぽんと はねる', cat:'zoom', icon:ICON.pop, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx * 0.2, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 0.2, 'smooth');
    setPin(l, 'scaleX', t0 + dur * 0.65, b.sx * 1.14, 'smooth');
    setPin(l, 'scaleY', t0 + dur * 0.65, b.sy * 1.14, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
  }},

  /* 大きくなって … はねない ので、まじめな 見出しに 合う */
  { name:'大きくなって 出る', cat:'zoom', icon:ICON.grow, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx * 0.55, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 0.55, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  }},

  { name:'小さくなって 出る', cat:'zoom', icon:ICON.shrink, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx * 1.7, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 1.7, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  }}
];

/* ================= 消える 動き ================= */

export const OUT_LIST = [
  { name:'ふわっと消える', cat:'show', icon:ICON.outFade, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'ちかちか 消える', cat:'show', icon:ICON.outFlick, fn:(l, t0, dur) => {
    const b = base(l);
    const step = dur / 7;
    for(let i = 0; i < 6; i++){
      setPin(l, 'opacity', t0 + step * i, i % 2 ? 0 : b.op, 'hold');
    }
    setPin(l, 'opacity', t0 + dur, 0, 'hold');
  }},

  { name:'ぼけて消える', cat:'show', icon:ICON.outBlur, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'blur', t0, b.blur, 'smooth');
    setPin(l, 'blur', t0 + dur, 26, 'smooth');
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'上へぬける', cat:'move', icon:ICON.outUp, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur, b.y - Math.max(40, l.y * 0.12), 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.3, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'下へぬける', cat:'move', icon:ICON.outDown, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur, b.y + Math.max(40, l.y * 0.12), 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.3, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'右へぬける', cat:'move', icon:ICON.outRight, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x, 'smooth');
    setPin(l, 'x', t0 + dur, b.x + 400, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'左へぬける', cat:'move', icon:ICON.outLeft, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x, 'smooth');
    setPin(l, 'x', t0 + dur, b.x - 400, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'くるっと 消える', cat:'move', icon:ICON.outSpin, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'rot', t0, b.rot, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot + 180, 'smooth');
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx * 0.3, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy * 0.3, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.5, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'ちぢんで消える', cat:'zoom', icon:ICON.outSmall, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx * 0.2, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy * 0.2, 'smooth');
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }},

  { name:'大きくなって消える', cat:'zoom', icon:ICON.outBig, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx * 1.6, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy * 1.6, 'smooth');
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }}
];

/* ================= ずっと 続く 動き（ループ向き） ================= */

export const LOOP_LIST = [
  { name:'ゆっくり呼吸', cat:'zoom', icon:ICON.breathe, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur / 2, b.sx * 1.04, 'smooth');
    setPin(l, 'scaleY', t0 + dur / 2, b.sy * 1.04, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
  }},

  { name:'ふわふわ うかぶ', cat:'move', icon:ICON.float, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur / 2, b.y - 18, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
  }},

  { name:'ゆらゆら かたむく', cat:'move', icon:ICON.tilt, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'rot', t0, b.rot, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.25, b.rot + 4, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.75, b.rot - 4, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot, 'smooth');
  }},

  /* およぐ … 上下と かたむきを ずらして かけると、
     ただの 往復より 生きもの っぽく 見える。 */
  { name:'ゆらゆら およぐ', cat:'move', icon:ICON.swim, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur * 0.5, b.y - 14, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'rot', t0, b.rot - 3, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.25, b.rot + 3, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.75, b.rot - 3, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot - 3, 'smooth');
  }},

  { name:'ちかちか する', cat:'show', icon:ICON.flicker, fn:(l, t0, dur) => {
    const b = base(l);
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.5, b.op * 0.35, 'smooth');
    setPin(l, 'opacity', t0 + dur, b.op, 'smooth');
  }}
];

/* 名まえから 中身を 引く（むかしの 呼び出し方に そろえる用） */
const toMap = (list) => {
  const m = {};
  list.forEach(p => { m[p.name] = p.fn; });
  return m;
};

export const IN_PRESETS   = toMap(IN_LIST);
export const OUT_PRESETS  = toMap(OUT_LIST);
export const LOOP_PRESETS = toMap(LOOP_LIST);

export const PRESET_GROUPS = [
  { key:'in',   label:'出てくる', list: IN_LIST,   map: IN_PRESETS },
  { key:'out',  label:'消える',   list: OUT_LIST,  map: OUT_PRESETS },
  { key:'loop', label:'ずっと',   list: LOOP_LIST, map: LOOP_PRESETS }
];
