/* 🔁 差分つなぎ。

   PSD の いちばん 上の グループ 1つ ＝ 差分 1まい。
   それを 決まった 間かくで 順ぐりに 出して、ループ させる。
   切りかわる たびに すこし「ポンッ」と はずませる。

   出す・消す は すけ具合（opacity）の hold キー。
   フォルダの すけ具合は 中身に かかるので、
   グループの 中が 何まい あっても そのまま 使える。 */

import { S } from '../state.js?v=304';
import { newFolder, setParent } from '../engine/layer.js?v=304';
import { setPin } from '../engine/anim.js?v=304';

export function newSabun(){
  return { step: 0.5, pop: 0.06 };
}

const byIdOf = (p) => { const m = {}; p.layers.forEach(l => m[l.id] = l); return m; };

/** 読みこんだ レイヤーから 差分（いちばん 外がわ）を 取り出す。上から 順 */
function unitsOf(project, layers){
  const byId = byIdOf(project);
  const top = (l) => { let c = l, g = 0; while(c.parent && byId[c.parent] && g++ < 200) c = byId[c.parent]; return c; };
  let units = [];
  layers.forEach(l => { const r = top(l); if(!units.includes(r)) units.push(r); });
  /* ぜんぶ 1つの グループに 入って いたら、1だん 中へ */
  if(units.length === 1 && units[0].kind === 'folder'){
    const kids = project.layers.filter(l => l.parent === units[0].id);
    if(kids.length > 1) units = kids;
  }
  return units.sort((a, b) => project.layers.indexOf(a) - project.layers.indexOf(b));
}

/** キーを 打ち直す（つまみを 変えた ときも これ） */
export function applySabun(project, root){
  const o = root.sabun = Object.assign(newSabun(), root.sabun);
  const units = project.layers.filter(l => l.parent === root.id);
  const n = units.length;
  const d = Math.max(0.05, +o.step || 0.5);
  const len = +(n * d).toFixed(3);
  units.forEach((u, i) => {
    u.tracks = u.tracks || {};
    delete u.tracks.opacity; delete u.tracks.scaleX; delete u.tracks.scaleY;
    u.loop = null;
    const t0 = +(i * d).toFixed(3), t1 = +((i + 1) * d).toFixed(3);
    if(n > 1){
      if(i > 0) setPin(u, 'opacity', 0, 0, 'hold');
      setPin(u, 'opacity', t0, 1, 'hold');
      if(i < n - 1) setPin(u, 'opacity', t1, 0, 'hold');
    }
    const s = u.scaleX || 1, sy = u.scaleY || 1;
    if(o.pop > 0){
      const up = 1 + o.pop, pt = Math.min(d * 0.4, 0.12);
      setPin(u, 'scaleX', t0, s * up, 'easeOut');
      setPin(u, 'scaleY', t0, sy * up, 'easeOut');
      setPin(u, 'scaleX', +(t0 + pt).toFixed(3), s, 'hold');
      setPin(u, 'scaleY', +(t0 + pt).toFixed(3), sy, 'hold');
    }
    u.loop = { from: 0, to: len, mode: 'loop' };
  });
  return { count: n, len };
}

/** 読みこんだ PSD を 差分つなぎに する */
export function makeSabun(project, layers, name){
  const units = unitsOf(project, layers);
  if(units.length < 2) return null;
  const f = newFolder(name || '差分');
  f.x = project.w / 2; f.y = project.h / 2;
  const at = Math.min(...units.map(u => project.layers.indexOf(u)));
  project.layers.splice(at, 0, f);
  units.forEach(u => setParent(project, u, f.id, 0));
  /* 並びを 上から 順に そろえて おく */
  f.sabun = newSabun();
  applySabun(project, f);
  S.sel = f.id;
  return f;
}

/** その レイヤーが 入って いる 差分つなぎの フォルダ */
export function sabunRootOf(project, l){
  const byId = byIdOf(project);
  let c = l, g = 0;
  while(c && g++ < 200){ if(c.sabun) return c; c = c.parent ? byId[c.parent] : null; }
  return null;
}
