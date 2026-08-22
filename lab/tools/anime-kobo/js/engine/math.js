/* 2Dアフィン行列。ミニSpine の core.js から必要な分だけ持ってきたもの。
   {a,b,c,d,tx,ty} = | a c tx |
                     | b d ty | */

export const M = {
  ident(){ return { a:1, b:0, c:0, d:1, tx:0, ty:0 }; },

  mul(p, q){
    return {
      a: p.a*q.a + p.c*q.b,
      b: p.b*q.a + p.d*q.b,
      c: p.a*q.c + p.c*q.d,
      d: p.b*q.c + p.d*q.d,
      tx: p.a*q.tx + p.c*q.ty + p.tx,
      ty: p.b*q.tx + p.d*q.ty + p.ty
    };
  },

  /** 平行移動 → 回転 → 拡大 の順 */
  trs(x, y, rotDeg, sx, sy){
    const r = rotDeg * Math.PI / 180;
    const cs = Math.cos(r), sn = Math.sin(r);
    return { a: cs*sx, b: sn*sx, c: -sn*sy, d: cs*sy, tx: x, ty: y };
  },

  apply(m, x, y){
    return { x: m.a*x + m.c*y + m.tx, y: m.b*x + m.d*y + m.ty };
  },

  /** 平行移動を無視してベクトルだけ変換する */
  dir(m, x, y){
    return { x: m.a*x + m.c*y, y: m.b*x + m.d*y };
  },

  inv(m){
    const det = m.a*m.d - m.b*m.c;
    const id = det ? 1/det : 0;
    return {
      a:  m.d*id, b: -m.b*id,
      c: -m.c*id, d:  m.a*id,
      tx: (m.c*m.ty - m.d*m.tx) * id,
      ty: (m.b*m.tx - m.a*m.ty) * id
    };
  },

  rotOf(m){ return Math.atan2(m.b, m.a) * 180 / Math.PI; },
  scaleOf(m){ return Math.hypot(m.a, m.b); }
};

export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp  = (a, b, t) => a + (b - a) * t;
export const uid   = (p) => p + '_' + Math.random().toString(36).slice(2, 9);

/** 点が四角形（4頂点、順番に並んでいること）の中にあるか */
export function ptInQuad(px, py, q){
  let inside = false;
  for(let i = 0, j = 3; i < 4; j = i++){
    const xi = q[i].x, yi = q[i].y, xj = q[j].x, yj = q[j].y;
    if(((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
