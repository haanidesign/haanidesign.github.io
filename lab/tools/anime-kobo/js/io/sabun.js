/* 🔁 差分つなぎ。

   PSD の いちばん 上の グループ 1つ ＝ 差分 1まい。
   それを 決まった 間かくで 順ぐりに 出して、ループ させる。
   切りかわる たびに すこし「ポンッ」と はずませる。

   出す・消す は すけ具合（opacity）の hold キー。
   フォルダの すけ具合は 中身に かかるので、
   グループの 中が 何まい あっても そのまま 使える。 */

import { S } from '../state.js?v=317';
import { newFolder, setParent } from '../engine/layer.js?v=317';
import { setPin } from '../engine/anim.js?v=317';

export function newSabun(){
  return { step: 0.5, pop: 0.1, tilt: 6, jump: 0.02, drift: 0.02, bg: 0.05 };
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

/** キーを 打ち直す（つまみを 変えた ときも これ）

   お手本の 動画を コマ送りで 見ると、切りかわった しゅんかん
     ・ひとまわり 大きく
     ・すこし かたむいて（左右 こうごに）
     ・すこし 上に はねて
   出て、4〜5コマ（0.15秒ほど）で もとに おさまる。
   そのあとも 止まらず、ゆっくり 寄って いく。
   うしろの まるも いっしょに ふくらむ。 */
export function applySabun(project, root){
  /* 入れものは 作り直さない。作り直すと シートの つまみが
     古い ほうを 書きかえて、2回目 から 効かなく なる。 */
  const o = root.sabun = root.sabun || {};
  const def = newSabun();
  Object.keys(def).forEach(k => { if(o[k] == null) o[k] = def[k]; });
  const units = project.layers.filter(l => l.parent === root.id);
  const n = units.length;
  const d = Math.max(0.05, +o.step || 0.5);
  const len = +(n * d).toFixed(3);
  const r3 = (v) => +v.toFixed(3);
  const settle = Math.min(d * 0.45, 0.15);
  units.forEach((u, i) => {
    u.tracks = u.tracks || {};
    ['opacity','scaleX','scaleY','rot','y'].forEach(c => delete u.tracks[c]);
    u.loop = null;
    const t0 = r3(i * d), t1 = r3((i + 1) * d), ts = r3(t0 + settle);
    if(n > 1){
      if(i > 0) setPin(u, 'opacity', 0, 0, 'hold');
      setPin(u, 'opacity', t0, 1, 'hold');
      if(i < n - 1) setPin(u, 'opacity', t1, 0, 'hold');
    }
    const sx = u.scaleX || 1, sy = u.scaleY || 1, rot = u.rot || 0, y = u.y || 0;
    const side = i % 2 ? 1 : -1;
    const hop = (o.jump || 0) * Math.min(project.w, project.h);
    if(o.pop > 0){
      setPin(u, 'scaleX', t0, sx * (1 + o.pop), 'out');
      setPin(u, 'scaleY', t0, sy * (1 + o.pop), 'out');
      setPin(u, 'scaleX', ts, sx, 'linear');
      setPin(u, 'scaleY', ts, sy, 'linear');
      /* おさまった あとも すこしずつ 寄る */
      if(o.drift > 0){
        setPin(u, 'scaleX', t1, sx * (1 + o.drift), 'hold');
        setPin(u, 'scaleY', t1, sy * (1 + o.drift), 'hold');
      }
    }
    if(o.tilt > 0){
      setPin(u, 'rot', t0, rot + side * o.tilt, 'out');
      setPin(u, 'rot', ts, rot, 'hold');
    }
    if(hop > 0){
      setPin(u, 'y', t0, y - hop, 'out');
      setPin(u, 'y', ts, y, 'hold');
    }
    u.loop = { from: 0, to: len, mode: 'loop' };
  });

  /* うしろの まる（⭕ まるの 背景）も いっしょに ふくらませる */
  const disc = project.layers.find(l => l.disc);
  if(disc){
    disc.tracks = disc.tracks || {};
    delete disc.tracks.scaleX; delete disc.tracks.scaleY;
    disc.loop = null;
    if(o.bg > 0 && n > 1){
      const bx = disc.scaleX || 1, by = disc.scaleY || 1;
      for(let i = 0; i < n; i++){
        const t0 = r3(i * d), ts = r3(t0 + settle);
        setPin(disc, 'scaleX', t0, bx * (1 + o.bg), 'out');
        setPin(disc, 'scaleY', t0, by * (1 + o.bg), 'out');
        setPin(disc, 'scaleX', ts, bx, 'hold');
        setPin(disc, 'scaleY', ts, by, 'hold');
      }
      disc.loop = { from: 0, to: len, mode: 'loop' };
    }
  }
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

/** もう ある フォルダの 中身（すぐ下の フォルダ・レイヤー）を 差分に する */
export function sabunFolder(project, f){
  if(project.layers.filter(l => l.parent === f.id).length < 2) return null;
  f.sabun = newSabun();
  applySabun(project, f);
  return f;
}

/** つなぎを はずす。全部 見える ように もどす */
export function unSabun(project, f){
  project.layers.filter(l => l.parent === f.id).forEach(u => {
    if(u.tracks) ['opacity','scaleX','scaleY','rot','y'].forEach(c => delete u.tracks[c]);
    u.loop = null;
  });
  const disc = project.layers.find(l => l.disc);
  if(disc && disc.tracks){ delete disc.tracks.scaleX; delete disc.tracks.scaleY; disc.loop = null; }
  delete f.sabun;
}

/** ☑ で えらんだ レイヤーを 新しい フォルダに 入れて つなぐ。上から 順 */
export function sabunPick(project, ids){
  const set = new Set(ids);
  const byId = byIdOf(project);
  /* 親も えらばれて いる ものは 親に まかせる */
  const up = (l) => { let c = l.parent && byId[l.parent], g = 0; while(c && g++ < 200){ if(set.has(c.id)) return true; c = c.parent && byId[c.parent]; } return false; };
  const units = project.layers.filter(l => set.has(l.id) && !up(l));
  if(units.length < 2) return null;
  const f = newFolder('差分');
  f.x = project.w / 2; f.y = project.h / 2;
  const first = units[0];
  f.parent = first.parent || null;
  project.layers.splice(project.layers.indexOf(first), 0, f);
  units.forEach(u => setParent(project, u, f.id, 0));
  f.sabun = newSabun();
  applySabun(project, f);
  S.sel = f.id;
  return f;
}
