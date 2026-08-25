/* 動きのプリセット。
   選ぶと、いまのレイヤーの姿を基準にしてピンを並べる。
   文字だけでなく、絵のレイヤーにもそのまま使える。

   どれも「いまの見た目」を終わりの姿とみなして、そこへ向かう動きを作る。
   だから並べ終わったあとに位置や大きさを変えても、破綻しない。 */

import { setPin } from './anim.js?v=60';

/* 出だしを速く／終わりをゆっくり見せたいときは、
   途中に1つピンを足して寄せるだけで足りる。 */

function base(l){
  return { x: l.x, y: l.y, sx: l.scaleX, sy: l.scaleY, rot: l.rot,
           op: l.opacity, blur: l.blur || 0 };
}

/** 入り（出てくる動き）。t0 から dur かけて、いまの姿になる */
export const IN_PRESETS = {
  'ふわっと出る': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur, b.op, 'smooth');
  },

  '下からあがる': (l, t0, dur) => {
    const b = base(l);
    const d = Math.max(40, l.y * 0.12);
    setPin(l, 'y', t0, b.y + d, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  },

  '上からおちる': (l, t0, dur) => {
    const b = base(l);
    const d = Math.max(40, l.y * 0.12);
    setPin(l, 'y', t0, b.y - d, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.7, b.op, 'smooth');
  },

  '左からすべる': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x - 400, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.6, b.op, 'smooth');
  },

  '右からすべる': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x + 400, 'smooth');
    setPin(l, 'x', t0 + dur, b.x, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.6, b.op, 'smooth');
  },

  'ぽんと はねる': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx * 0.2, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 0.2, 'smooth');
    setPin(l, 'scaleX', t0 + dur * 0.65, b.sx * 1.14, 'smooth');
    setPin(l, 'scaleY', t0 + dur * 0.65, b.sy * 1.14, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
  },

  'おちて バウンド': (l, t0, dur) => {
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
  },

  'ぼけから くっきり': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'blur', t0, 26, 'smooth');
    setPin(l, 'blur', t0 + dur, b.blur, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.8, b.op, 'smooth');
    setPin(l, 'scaleX', t0, b.sx * 1.12, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 1.12, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
  },

  'くるっと まわる': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'rot', t0, b.rot - 180, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot, 'smooth');
    setPin(l, 'scaleX', t0, b.sx * 0.3, 'smooth');
    setPin(l, 'scaleY', t0, b.sy * 0.3, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
    setPin(l, 'opacity', t0, 0, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.5, b.op, 'smooth');
  }
};

/** 出（消える動き）。t0 から dur かけて 消える */
export const OUT_PRESETS = {
  'ふわっと消える': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  },

  '上へぬける': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur, b.y - Math.max(40, l.y * 0.12), 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.3, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  },

  '右へぬける': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'x', t0, b.x, 'smooth');
    setPin(l, 'x', t0 + dur, b.x + 400, 'smooth');
    setPin(l, 'opacity', t0 + dur * 0.4, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  },

  'ちぢんで消える': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx * 0.2, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy * 0.2, 'smooth');
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  },

  'ぼけて消える': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'blur', t0, b.blur, 'smooth');
    setPin(l, 'blur', t0 + dur, 26, 'smooth');
    setPin(l, 'opacity', t0, b.op, 'smooth');
    setPin(l, 'opacity', t0 + dur, 0, 'smooth');
  }
};

/** ずっと続く動き（ループ向き） */
export const LOOP_PRESETS = {
  'ゆっくり呼吸': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'scaleX', t0, b.sx, 'smooth');
    setPin(l, 'scaleY', t0, b.sy, 'smooth');
    setPin(l, 'scaleX', t0 + dur / 2, b.sx * 1.04, 'smooth');
    setPin(l, 'scaleY', t0 + dur / 2, b.sy * 1.04, 'smooth');
    setPin(l, 'scaleX', t0 + dur, b.sx, 'smooth');
    setPin(l, 'scaleY', t0 + dur, b.sy, 'smooth');
  },

  'ふわふわ うかぶ': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'y', t0, b.y, 'smooth');
    setPin(l, 'y', t0 + dur / 2, b.y - 18, 'smooth');
    setPin(l, 'y', t0 + dur, b.y, 'smooth');
  },

  'ゆらゆら かたむく': (l, t0, dur) => {
    const b = base(l);
    setPin(l, 'rot', t0, b.rot, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.25, b.rot + 4, 'smooth');
    setPin(l, 'rot', t0 + dur * 0.75, b.rot - 4, 'smooth');
    setPin(l, 'rot', t0 + dur, b.rot, 'smooth');
  }
};

export const PRESET_GROUPS = [
  { key:'in',   label:'出てくる', map: IN_PRESETS },
  { key:'out',  label:'消える',   map: OUT_PRESETS },
  { key:'loop', label:'ずっと',   map: LOOP_PRESETS }
];
