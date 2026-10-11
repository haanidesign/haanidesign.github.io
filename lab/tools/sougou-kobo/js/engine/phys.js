/* 🌀 ばね（物理）。ミニSpine の 骨の ばねを レイヤーに した もの。

   レイヤーは じく（回る 中心）から ぶらさがって いる ふりこ と みなす。
   親が 動いた・まわった いきおいで ふられて、ばねで もとの 角度へ もどる。
     かたさ   … 1秒に 何回 ゆれるか（大きいほど かたい・はやい）
     おさまり … どれくらいで 止まるか（大きいほど すぐ 止まる）
     重さ     … 親の 動きに どれだけ ふられるか
     ねじれ   … 親が まわった とき、どれだけ その場に のこるか
     重力     … 下（マイナスなら 上）へ たれる

   止めて 見ても・書き出しても 同じ 絵に なる ように、
   いつも 0秒から 1/60秒ずつ 順に 計算して ためて おく。
   作品を 直したら（もどす の 番号が かわったら）計算しなおす。

   計算の あいだは ばねを 切った 姿を 見る（物理の 入力は 親の 動き だけ）。 */
import { S, undoDepth } from '../state.js?v=361';

export const DT = 1 / 60;
const SUB = 4;                      // 1コマを さらに 細かく（かたい ばねでも くずれない）
const MAX_DEG = 80;

export function newPhys(){
  return { on: true, stiff: 1.8, damp: 0.22, inertia: 1, twist: 0.7, grav: 0 };
}
/* ひと押しの 組み合わせ */
export const PHYS_LOOKS = [
  ['髪', { stiff: 1.6, damp: 0.25, inertia: 1, twist: 0.6, grav: 0 }],
  ['イヤリング', { stiff: 1.1, damp: 0.12, inertia: 1.4, twist: 0.9, grav: 0.2 }],
  ['しっぽ', { stiff: 1.2, damp: 0.18, inertia: 1.2, twist: 0.8, grav: 0 }],
  ['リボン・布', { stiff: 0.9, damp: 0.3, inertia: 1.6, twist: 0.8, grav: 0.3 }],
  ['ぷるん', { stiff: 3.2, damp: 0.12, inertia: 0.8, twist: 0.3, grav: 0 }]
];

let cache = null;
let busy = false;
export const physBusy = () => busy;

const physLayers = (project) => project.layers.filter(l => l.phys && l.phys.on && l.kind !== 'cam' && l.kind !== 'audio');

function keyOf(project, list){
  const u = undoDepth();
  return [S.docId, u.idx, u.size, project.layers.length, project.w, project.h,
          JSON.stringify(list.map(l => [l.id, l.phys]))].join('|');
}

/* 絵の まん中が じくから 見て どこに あるか（作品の 中の 向き） */
function hang(project, l, m){
  const a = (l.frames && project.assets[l.frames[0]]) || { w: l.pw || 100, h: l.ph || 100 };
  const pv = l.pivot || { x: 0.5, y: 0.5 };
  let ox = (0.5 - pv.x) * a.w, oy = (0.5 - pv.y) * a.h;
  if(Math.hypot(ox, oy) < Math.max(a.w, a.h) * 0.08){ ox = 0; oy = a.h * 0.5; }  // じくが まん中なら 下に ぶらさがる
  return { x: m.a * ox + m.c * oy, y: m.b * ox + m.d * oy };
}

function simulate(project, list, until, computeAll){
  const n = Math.ceil(until / DT) + 1;
  if(!cache.st) cache.st = new Map();
  busy = true;
  try{
    for(let k = cache.n; k < n; k++){
      const t = k * DT;
      const all = computeAll(project, t);
      for(const l of list){
        const e = all[l.id];
        let s = cache.st.get(l.id);
        if(!s){ s = { th: 0, om: 0, P: [], A: [], hist: [] }; cache.st.set(l.id, s); }
        if(!e){ s.hist[k] = s.th; continue; }
        const m = e.mNoCam || e.m;
        const P = { x: m.tx, y: m.ty };
        /* まわる いきおいは 親の ぶん だけ（自分で 打った 回転は そのまま 出す） */
        const pe = l.parent ? all[l.parent] : null;
        const pm = pe ? (pe.mNoCam || pe.m) : null;
        const A = pm ? Math.atan2(pm.b, pm.a) : 0;
        const d0 = hang(project, l, m);
        const ph = l.phys;
        if(s.P.length >= 2){
          const p1 = s.P[1], p0 = s.P[0];
          const ax = (P.x - 2 * p1.x + p0.x) / (DT * DT);
          const ay = (P.y - 2 * p1.y + p0.y) / (DT * DT);
          let dA1 = A - s.A[1], dA0 = s.A[1] - s.A[0];
          dA1 = Math.atan2(Math.sin(dA1), Math.cos(dA1));
          dA0 = Math.atan2(Math.sin(dA0), Math.cos(dA0));
          const beta = (dA1 - dA0) / (DT * DT);
          const w0 = 2 * Math.PI * Math.max(0.2, ph.stiff == null ? 1.8 : ph.stiff);
          const z = Math.max(0.01, ph.damp == null ? 0.22 : ph.damp);
          const inertia = ph.inertia == null ? 1 : ph.inertia;
          const twist = ph.twist == null ? 0.7 : ph.twist;
          const G = (ph.grav || 0) * 2400;
          const h = DT / SUB;
          for(let i = 0; i < SUB; i++){
            /* いまの かたむきの ぶん まわした ぶらさがりの 向き */
            const c = Math.cos(s.th), sn = Math.sin(s.th);
            const dx = d0.x * c - d0.y * sn, dy = d0.x * sn + d0.y * c;
            const L2 = Math.max(1, dx * dx + dy * dy);
            /* ふられる 力 ＝ 親の 動きの 逆。重力は 下むき */
            const fx = -ax * inertia, fy = -ay * inertia + G;
            const torque = (dx * fy - dy * fx) / L2;
            const alpha = -w0 * w0 * s.th - 2 * z * w0 * s.om + torque - twist * beta;
            s.om += alpha * h;
            s.th += s.om * h;
            const lim = MAX_DEG * Math.PI / 180;
            if(s.th > lim){ s.th = lim; s.om = Math.min(0, s.om); }
            if(s.th < -lim){ s.th = -lim; s.om = Math.max(0, s.om); }
          }
        }
        if(!s.P.length){ s.P = [P, P]; s.A = [A, A]; }
        else { s.P = [s.P[1], P]; s.A = [s.A[1], A]; }
        s.hist[k] = s.th;
      }
    }
    cache.n = Math.max(cache.n, n);
  }finally{
    busy = false;
  }
}

/**
 * その 時こくの ばねの かたむき（度）。computeAll の 中から よぶ。
 * 計算中（busy）は 0 を かえす。
 */
export function physAngle(project, l, time, computeAll){
  if(busy || !(l.phys && l.phys.on)) return 0;
  const list = physLayers(project);
  const key = keyOf(project, list);
  if(!cache || cache.key !== key || cache.proj !== project){
    cache = { key, proj: project, n: 0, st: new Map() };
  }
  const t = Math.max(0, time);
  if(t / DT + 1 >= cache.n){
    /* 先まで まとめて 計算して おく（少しずつ 何度も やると おそい） */
    const until = Math.min(Math.max(t + 1, Math.min(project.duration || t, t + 4)), (project.duration || t) + 1);
    simulate(project, list, Math.max(t, until), computeAll);
  }
  const s = cache.st.get(l.id);
  if(!s || !s.hist.length) return 0;
  const f = t / DT, i = Math.floor(f), u = f - i;
  const a = s.hist[i] ?? s.th, b = s.hist[i + 1] ?? a;
  return (a + (b - a) * u) * 180 / Math.PI;
}
