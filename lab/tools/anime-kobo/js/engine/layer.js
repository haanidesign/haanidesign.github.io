/* レイヤーの形と、そこから世界の位置を出す計算。
   PHASE 1 ではトランスフォームは静的な値。PHASE 2 でここにピン（キーフレーム）が乗る。 */

import { M, uid, ptInQuad } from './math.js?v=97';
import { valuesAt as evalAt, setPin, shiftTrack } from './anim.js?v=97';
import { deformPoint, swayPose, swayTilt } from './puppet.js?v=97';
import { handTime } from './hand.js?v=97';
import { WORK_KEYS } from '../state.js?v=97';

/** レイヤーを1つ作る。frames はアセットIDの配列＝コマ列（PHASE 1 では1枚） */
export function newLayer(name, assetIds){
  return {
    id: uid('L'),
    kind: 'image',      // 'image' | 'text' | 'folder'
    name: name || 'レイヤー',
    frames: assetIds ? [...assetIds] : [],
    visible: true,
    locked: false,     // カギ。かけると 絵の上では さわれない
    parent: null,       // 親レイヤーのid（PHASE 2）
    clip: false,        // ほかのレイヤーの形で ぬく
    clipTo: null,       // どのレイヤーの形で ぬくか（null なら すぐ下）

    // トランスフォーム
    x: 0, y: 0,         // キャンバス座標。回転軸がここに来る
    rot: 0,
    scaleX: 1, scaleY: 1,
    lockAspect: true,   // たてよこの比をそろえたままにするか
    opacity: 1,

    // 絵の中のどこを中心に回すか（0.5,0.5 = まんなか）
    pivot: { x: 0.5, y: 0.5 },

    tracks: {},         // ch -> [{t,v,c}]  ピン
    loop: null,         // { from, to, mode:'loop'|'pingpong' }

    // エフェクト
    pins: [],           // パペットピン
    stiff: 1.4,         // ピンのかたさ。大きいほど骨っぽく、小さいほどやわらかい
    mesh: null,         // ピンを刺したときに張るあみ（保存はしない）

    tint: { color:'#F2A0B8', amount:0 },   // 塗り（色と強さ）
    stroke: { color:'#FFFEF7', width:0 },   // ふちどり（色と太さ）
    blur: 0,                                // ぼかし（px）
    mblur: 0,                               // うごきブラー（ざんぞう）0〜1
    hand: null,                             // 手がき風（null なら なし）
    span: null,                             // 出す ところ（null なら ずっと 出す）
    cage: null,                             // ゆがみ・自由変形の かご（null なら まっすぐ）
    flipX: false, flipY: false              // 反転
  };
}

export { evalAt as valuesAt };

/**
 * 全レイヤーのワールド行列を出す。
 * 親を先に計算する必要があるので、親をたどりながら memo する。
 * 戻り値: { [layerId]: { m, v, asset } }
 */
/** その姿が パペットピンで 曲がっているか（1本でも動いていれば） */
function bent(pose){
  const pins = pose.v.pins;
  if(!pins || pins.length < 2) return false;
  return pins.some(p => Math.abs(p.dx) > 0.01 || Math.abs(p.dy) > 0.01);
}

function assetOf(project, layer, frame){
  if(isPaint(layer)) return { id: '#' + layer.id, name: layer.name, w: layer.pw, h: layer.ph };
  const id = layer.frames[frame || 0] || layer.frames[0];
  return id ? project.assets[id] : null;
}

/* ================= パラパラフォルダ =================
   フォルダの 中身を「1まいずつ 順ぐりに」見せる。
   ＝ 中の レイヤーが そのまま コマに なる。

   1まいずつ 別の レイヤーの ままなので、
   コマごとに 場所や 大きさを 変えられる。
   （1つの レイヤーに コマを つめる やり方だと そこが できない）

   たたんで おけば タイムラインは フォルダの 1行だけ。 */
export function newFlip(){
  return {
    on: true,
    spf: 1 / 8,        // 1コマ 何秒か（8コマ／秒）
    start: 0,          // いつから はじめるか
    mode: 'loop'       // 'loop' ずっと / 'once' 1回だけ / 'ping' 往復
  };
}

export const isFlip = (l) => !!(l && isFolder(l) && l.flip && l.flip.on);

/**
 * その時こくで「何コマめ」を 見せるか。
 *   n … コマの 数
 * 戻り値 … 0〜n-1
 */
export function flipIndex(flip, n, time){
  if(n <= 0) return 0;
  const spf = Math.max(1 / 60, flip.spf || 1 / 8);
  const k = Math.floor((time - (flip.start || 0)) / spf);
  if(k <= 0) return 0;                       // はじまる 前は 1コマめ
  if(flip.mode === 'once') return Math.min(k, n - 1);
  if(flip.mode === 'ping'){
    if(n === 1) return 0;
    const m = k % (2 * n - 2);               // …0,1,2,1,0,1,2…
    return m < n ? m : (2 * n - 2 - m);
  }
  return k % n;                              // ずっと くり返す
}

/** そのレイヤーが「出す ところ」の 中に いるか */
export function inSpan(l, time){
  const s = l.span;
  if(!s) return true;                       // きめて いなければ ずっと 出す
  const a = s.from == null ? -Infinity : s.from;
  const b = s.to   == null ?  Infinity : s.to;
  return time >= a - 1e-6 && time <= b + 1e-6;
}

export function computeAll(project, time){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);

  const out = {};
  const solving = {};

  /* パラパラフォルダは「いま どの コマを 見せるか」を
     フォルダ 1つにつき 1回だけ 出す（毎まい 数え直すと 重い） */
  const flipShow = {};
  const showing = (f) => {
    if(flipShow[f.id] === undefined){
      const mem = membersOf(project, f);
      const i = flipIndex(f.flip, mem.length, time);
      flipShow[f.id] = mem.length ? mem[i].id : null;
    }
    return flipShow[f.id];
  };

  const solve = (l) => {
    if(out[l.id]) return out[l.id];
    if(solving[l.id]) return null;      // 親子が輪になっていたら諦める
    solving[l.id] = true;

    /* 手がき風で「うごきも コマ落とし」に していたら、
       このレイヤーだけ 時こくを コマの きざみに そろえる。 */
    const v = evalAt(l, handTime(l, time));

    /* ゆれ（かみのゆれ など）。
       ピンを 打たずに その場で 出すので、なめらかで、
       あとから 数字を 変えても すぐ 効く。 */
    if(l.sway && l.sway.on){
      if((l.pins || []).length > 1){
        // 骨が あるとき … 根元から 毛先へ しなる
        const sp = swayPose(l.pins, l.sway, time);
        if(sp) v.pins = sp;
      } else {
        // 骨が ないとき … じくを 中心に かたむける
        v.rot += swayTilt(l.sway, time);
      }
    }
    const p = (l.parent && byId[l.parent]) ? solve(byId[l.parent]) : null;

    /* 親が パペットピンで 曲がっているときは、
       くっついている場所も いっしょに 曲がってほしい。
       （うでを曲げたら 手も ついていく）
       つく場所を 親の絵の中の点になおして、その点が どこへ動いたかを見る。 */
    let lx = v.x, ly = v.y, lrot = v.rot;
    if(p && bent(p)){
      const pl = p.layer, pa = assetOf(project, pl, p.v.frame);
      if(pa){
        const ox = pa.w * pl.pivot.x, oy = pa.h * pl.pivot.y;
        const d = deformPoint(p.v.pins, pl.stiff, lx + ox, ly + oy);
        lx = d.x - ox; ly = d.y - oy; lrot = v.rot + d.rot;
      }
    }

    const local = M.trs(lx, ly, lrot, v.scaleX, v.scaleY);
    let m = p ? M.mul(p.m, local) : local;

    /* コマごとの ずれ。
       べつの ところに あった 絵を コマに した ときに、
       もとの 場所の まま 出す ための もの。
       ここで 姿に 入れておくと、描くのも・さわるのも・
       ぶら下がっている 子も ぜんぶ そろう。 */
    if(l.frameOff){
      const aid = l.frames[v.frame] || l.frames[0];
      const off = l.frameOff[aid];
      if(off){
        m = M.mul(m, M.trs(off.dx || 0, off.dy || 0, off.rot || 0,
                           off.sx == null ? 1 : off.sx,
                           off.sy == null ? 1 : off.sy));
      }
    }

    /* フォルダに入れたものは、フォルダの すけ具合 と 目印 を受けつぐ。
       ふつうの親子（AEと同じ）では受けつがない。 */
    /* フォルダの すけ具合 は、中身を1まいにまとめてから かける（c2d）。
       ここで かけると 二重になるので さわらない。 */
    const inFolder = !!(p && isFolder(p.layer));
    /* 「ここから ここまで 出す」。
       フォルダに かけると 中身も いっしょに 出たり 消えたり する
       （中身は フォルダの 見え方を うけつぐ ので）。 */
    let vis = l.visible !== false && inSpan(l, time) && (inFolder ? p.vis : true);

    /* パラパラフォルダの 中は、いまの コマ だけを 見せる */
    if(vis && inFolder && isFlip(p.layer) && showing(p.layer) !== l.id) vis = false;

    solving[l.id] = false;
    return out[l.id] = { m, v, vis, layer: l };
  };

  project.layers.forEach(solve);
  return out;
}

/** レイヤーの画像がキャンバス上で占める四隅を返す */
export function cornersOf(layer, m, asset){
  if(!asset) return null;
  const w = asset.w, h = asset.h;
  const ox = -w * layer.pivot.x;
  const oy = -h * layer.pivot.y;
  return [
    M.apply(m, ox,     oy),
    M.apply(m, ox + w, oy),
    M.apply(m, ox + w, oy + h),
    M.apply(m, ox,     oy + h)
  ];
}

/**
 * 親を付け替える。見た目が動かないように、子の値を計算しなおす。
 * （PSDから読むと各レイヤーが「キャンバスに収める倍率」を持っているので、
 *   そのまま繋ぐと親の倍率が二重にかかって子が小さくなってしまう）
 */
export function setParent(project, layer, newParentId, time, onKey){
  if(newParentId === layer.id || isDescendant(project, newParentId, layer.id)) return false;

  const tr = layer.tracks || {};
  /* うごきのピンが 打ってあるときは、その時こく ぜんぶで つじつまを合わせる。
     いまの時間だけ 直すと、ほかの時間で 場所が とんでしまう。 */
  const times = new Set();
  ['x','y','rot','scaleX','scaleY'].forEach(ch => {
    (tr[ch] || []).forEach(k => times.add(+k.t.toFixed(3)));
  });
  times.add(+(time || 0).toFixed(3));
  const list = [...times].sort((a, b) => a - b);

  // 付けかえる前の 見た目（ワールド）を、時こくごとに おぼえる
  const worlds = {};
  for(const t of list){
    const p = computeAll(project, t)[layer.id];
    if(p) worlds[t] = p.m;
  }
  if(!worlds[list[0]] && !computeAll(project, time)[layer.id]){
    layer.parent = newParentId || null;
    return true;
  }

  layer.parent = newParentId || null;

  let now = null;
  for(const t of list){
    const w = worlds[t];
    if(!w) continue;
    const after = computeAll(project, t);
    const pw = (layer.parent && after[layer.parent]) ? after[layer.parent].m : M.ident();
    const d = M.decompose(M.mul(M.inv(pw), w));

    if(Math.abs(t - (time || 0)) < 1e-3){
      // いまの時間ぶんは 素の値も 直す
      layer.x = d.x; layer.y = d.y;
      layer.rot = d.rot;
      layer.scaleX = d.scaleX; layer.scaleY = d.scaleY;
      now = d;
    }
    // 打ってある ピンだけ 書きかえる（勝手に ピンは ふやさない）
    if(tr.x && tr.x.some(k => Math.abs(k.t - t) < 1e-3)) setPin(layer, 'x', t, d.x);
    if(tr.y && tr.y.some(k => Math.abs(k.t - t) < 1e-3)) setPin(layer, 'y', t, d.y);
    if(tr.rot && tr.rot.some(k => Math.abs(k.t - t) < 1e-3)) setPin(layer, 'rot', t, d.rot);
    if(tr.scaleX && tr.scaleX.some(k => Math.abs(k.t - t) < 1e-3)) setPin(layer, 'scaleX', t, d.scaleX);
    if(tr.scaleY && tr.scaleY.some(k => Math.abs(k.t - t) < 1e-3)) setPin(layer, 'scaleY', t, d.scaleY);
  }

  if(!now){
    const after = computeAll(project, time);
    const pw = (layer.parent && after[layer.parent]) ? after[layer.parent].m : M.ident();
    const w = worlds[+(time || 0).toFixed(3)];
    if(w){
      const d = M.decompose(M.mul(M.inv(pw), w));
      layer.x = d.x; layer.y = d.y;
      layer.rot = d.rot;
      layer.scaleX = d.scaleX; layer.scaleY = d.scaleY;
      now = d;
    }
  }
  if(onKey && now) onKey(now);
  return true;
}

/** そのレイヤーが (x,y) を含んでいるか */
export function hitsLayer(layer, pose, assets, x, y){
  if(!layer || !pose || pose.vis === false || !layer.visible) return false;
  if(layer.locked) return false;        // カギが かかっていたら つかめない
  if(isFolder(layer)) return false;
  const asset = assets[layer.frames[pose.v.frame] || layer.frames[0]];
  const q = cornersOf(layer, pose.m, asset);
  return !!(q && ptInQuad(x, y, q));
}

/** キャンバス座標 (x,y) にあるレイヤーを、手前から探す */
export function pickLayer(project, poses, assets, x, y){
  // layers[0] が一番手前なので、そのまま前から見る
  for(const l of drawOrder(project)){
    if(!l.visible || l.locked) continue;
    const p = poses[l.id]; if(!p || p.vis === false) continue;
    const asset = assets[l.frames[p.v.frame] || l.frames[0]];
    const q = cornersOf(l, p.m, asset);
    if(q && ptInQuad(x, y, q)) return l;
  }
  return null;
}

/** そのレイヤーの子孫かどうか（親子付けの輪を防ぐ） */
export function isDescendant(project, id, ofId){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);
  let cur = byId[id];
  let guard = 0;
  while(cur && cur.parent && guard++ < 200){
    if(cur.parent === ofId) return true;
    cur = byId[cur.parent];
  }
  return false;
}


/* ================= フォルダ（まとめる） =================
   フォルダは「絵を持たないレイヤー」。中身は親子でくっつくので、
   フォルダを動かす・回す・うすくする だけで まとめて効く。

   ふつうの親子と違うところは3つ。
     ・重なり順が フォルダの場所に まとまる（PSDのグループと同じ）
     ・すけ具合 と 目のマーク が 中身に伝わる
     ・タイムラインで たためる
*/

export const isFolder = (l) => !!l && l.kind === 'folder';

/** 自分で 紙に 描く レイヤー（おえかき・いろ）。絵の ファイルを 持たない */
export const isPaint = (l) => !!l && (l.kind === 'paint' || l.kind === 'solid');

/**
 * まっさらな おえかきレイヤー。
 * 紙の 大きさは キャンバスと 同じ。すけたまま なので、
 * 上に かさねて 書きこみに つかえる。
 */
export function newPaintLayer(name, w, h){
  const l = newLayer(name || 'おえかき', []);
  l.kind = 'paint';
  l.pw = w; l.ph = h;
  l.strokes = [];
  l.reveal = null;          // 書いた順に 出す（つかうときだけ 作る）
  l.x = w / 2; l.y = h / 2;
  return l;
}

/** ひとつの 色で ぬりつぶした レイヤー */
export function newSolidLayer(name, w, h, color){
  const l = newLayer(name || 'いろ', []);
  l.kind = 'solid';
  l.pw = w; l.ph = h;
  l.color = color || '#F2A0B8';
  l.x = w / 2; l.y = h / 2;
  return l;
}

export function newFolder(name){
  const f = newLayer(name || 'フォルダ', []);
  f.kind = 'folder';
  f.open = true;
  return f;
}

/** そのレイヤーが 直接入っているフォルダ（いちばん近い先祖のフォルダ） */
export function nearestFolder(project, layer){
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);
  let cur = layer, guard = 0;
  while(cur && cur.parent && guard++ < 200){
    const p = byId[cur.parent];
    if(!p) return null;
    if(isFolder(p)) return p;
    cur = p;
  }
  return null;
}

/** フォルダの中身（そのフォルダが いちばん近いフォルダ になるもの） */
export function membersOf(project, folder){
  return project.layers.filter(l => nearestFolder(project, l) === folder);
}

/**
 * 描く順番。手前から並べる。
 * フォルダは 自分の場所で 中身にすりかわる。
 */
export function drawOrder(project){
  const out = [];
  const emit = (l) => {
    if(isFolder(l)) membersOf(project, l).forEach(emit);
    else out.push(l);
  };
  project.layers.forEach(l => { if(!nearestFolder(project, l)) emit(l); });
  return out;
}

/** タイムラインに出す行。たたんでいるフォルダの中身は出さない */
export function treeRows(project){
  const rows = [];
  const walk = (l, depth) => {
    rows.push({ layer: l, depth });
    if(isFolder(l) && l.open !== false){
      membersOf(project, l).forEach(c => walk(c, depth + 1));
    }
  };
  project.layers.forEach(l => { if(!nearestFolder(project, l)) walk(l, 0); });
  return rows;
}

/**
 * えらんだレイヤーを 新しいフォルダに入れる。
 * フォルダの回転じくは みんなの まん中に置くので、回すと自然にまわる。
 * 見た目は変わらない（setParent が 中身の値を計算しなおす）。
 */
export function groupInto(project, ids, time, name){
  const want = new Set(ids);
  const targets = project.layers.filter(l => want.has(l.id));
  if(!targets.length) return null;

  // 親ごと選んでいるときは、親だけ動かせば子もついてくる
  const top = targets.filter(l => !targets.some(t => t.id !== l.id && isDescendant(project, l.id, t.id)));
  if(!top.length) return null;

  const poses = computeAll(project, time);
  let sx = 0, sy = 0, n = 0;
  top.forEach(l => { const p = poses[l.id]; if(p){ sx += p.m.tx; sy += p.m.ty; n++; } });

  const f = newFolder(name);
  if(n){ f.x = sx / n; f.y = sy / n; }

  /* フォルダの中へ 移すのは、えらんだものと その子・孫 ぜんぶ。
     子を おいていくと、その子は 遠くに のこったまま
     フォルダの中身として 数えられるので、重なり順が 入れかわってしまう。 */
  const inside = project.layers.filter(l =>
    top.includes(l) || top.some(t => isDescendant(project, l.id, t.id)));

  const at = Math.min(...inside.map(l => project.layers.indexOf(l)));
  project.layers.splice(at, 0, f);

  // 並び順は そのままに、フォルダのすぐ下へ かたまりで 寄せる
  const moved = project.layers.filter(l => inside.includes(l));
  moved.forEach(l => project.layers.splice(project.layers.indexOf(l), 1));
  project.layers.splice(project.layers.indexOf(f) + 1, 0, ...moved);

  // 親を つけかえるのは いちばん上の ものだけ（子は そのまま ついてくる）
  top.forEach(l => setParent(project, l, f.id, time));
  return f;
}

/** フォルダを ほどく。中身は その場に残る */
export function ungroup(project, folder, time){
  const kids = project.layers.filter(l => l.parent === folder.id);
  kids.forEach(k => setParent(project, k, folder.parent || null, time));
  const i = project.layers.indexOf(folder);
  if(i >= 0) project.layers.splice(i, 1);
  return kids.length;
}

/**
 * ☑ でえらんだものを、まとめて 1つの親につける。
 * 見た目は変わらない。輪になるもの（自分の子を親にする等）は とばす。
 * 戻り値は くっついた枚数。
 */
export function attachMany(project, ids, parentId, time){
  let n = 0;
  for(const id of ids){
    const l = project.layers.find(x => x.id === id);
    if(!l || l.id === parentId) continue;
    if(setParent(project, l, parentId, time)) n++;
  }
  return n;
}

/**
 * ほかのレイヤーの絵を、このレイヤーの「コマ」として取りこむ。
 * PSDだと 目のあいた絵・とじた絵が べつのレイヤーになっていることが多いので、
 * それを1枚にまとめないと まばたきが作れない。
 * 取りこんだレイヤーは 消える。
 */
export function mergeAsFrames(project, target, ids, time){
  /* コマに する 絵は、もともと べつべつの ところに 置いてある。
     （PSD の 目あき・目とじ は 大きさも 場所も ちがう）
     ただ ならべると、コマが 変わるたびに 絵が 飛んでしまう。
     そこで「取りこむ前は どこに 居たか」を コマごとに おぼえて、
     出す ときに その ぶん ずらす。 */
  const before = computeAll(project, time || 0);
  const tm = before[target.id] && before[target.id].m;

  let n = 0;
  for(const id of ids){
    if(id === target.id) continue;
    const l = project.layers.find(x => x.id === id);
    if(!l || isFolder(l) || !l.frames.length) continue;

    let off = null;
    if(tm && before[l.id]){
      const d = M.decompose(M.mul(M.inv(tm), before[l.id].m));
      // ほとんど 同じ ところなら おぼえない（データを ふやさない）
      if(Math.abs(d.x) > 0.01 || Math.abs(d.y) > 0.01 ||
         Math.abs(d.rot) > 0.01 ||
         Math.abs(d.scaleX - 1) > 0.001 || Math.abs(d.scaleY - 1) > 0.001){
        off = { dx: d.x, dy: d.y, rot: d.rot, sx: d.scaleX, sy: d.scaleY };
      }
    }

    l.frames.forEach(a => {
      if(target.frames.includes(a)) return;
      target.frames.push(a);
      if(off){
        target.frameOff = target.frameOff || {};
        target.frameOff[a] = off;
      }
    });
    // この子についていたものは、取りこみ先へ ひきつぐ
    project.layers.forEach(x => { if(x.parent === l.id) x.parent = target.id; });
    project.layers.splice(project.layers.indexOf(l), 1);
    n++;
  }
  return n;
}

/**
 * コマを バラして、また 1まいずつの レイヤーに もどす。
 *
 * まとめた ときに「もとは どこに 居たか」を おぼえてあるので、
 * それを つかって もとの 場所に もどす。
 * 1コマめは いまの レイヤーに のこす。
 *
 * 戻り値 … 出した レイヤーの ならび
 */
export function splitFrames(project, layer, time){
  const frames = layer.frames || [];
  if(frames.length < 2) return [];

  const at = project.layers.indexOf(layer);
  const off = layer.frameOff || {};
  const made = [];

  // 2コマめ から うしろを 外へ 出す（ならびは 上から 順）
  for(let i = frames.length - 1; i >= 1; i--){
    const aid = frames[i];
    const a = project.assets[aid];
    const l = newLayer((a && a.name) || (layer.name + ' ' + (i + 1)), [aid]);

    // 大きさ・かたむき・じく・親 は もとの レイヤーに そろえる
    l.x = layer.x; l.y = layer.y;
    l.rot = layer.rot;
    l.scaleX = layer.scaleX; l.scaleY = layer.scaleY;
    l.pivot = { x: layer.pivot.x, y: layer.pivot.y };
    l.parent = layer.parent;
    l.opacity = layer.opacity;

    // まとめた ときの ずれを もどす
    const o = off[aid];
    if(o){
      const m = M.mul(M.trs(l.x, l.y, l.rot, l.scaleX, l.scaleY),
                      M.trs(o.dx || 0, o.dy || 0, o.rot || 0,
                            o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy));
      const d = M.decompose(m);
      l.x = d.x; l.y = d.y; l.rot = d.rot;
      l.scaleX = d.scaleX; l.scaleY = d.scaleY;
    }

    project.layers.splice(at + 1, 0, l);
    made.unshift(l);
  }

  // のこすのは 1コマめだけ
  layer.frames = [frames[0]];
  delete layer.frameOff;
  // コマの 切りかえピンは もう いらない
  if(layer.tracks) delete layer.tracks.frame;

  return made;
}

/**
 * 親の じく（アンカー）を 動かしても 子が ずれないように、
 * 子の いまの見た目を おぼえてから 直す。
 * fn の中で 親の x/y/pivot を いじる。
 */
export function keepChildren(project, layer, time, fn){
  const kids = project.layers.filter(l => l.parent === layer.id);
  if(!kids.length){ fn(); return 0; }

  const before = computeAll(project, time);
  const world = {};
  const wasAt = {};
  kids.forEach(k => {
    if(!before[k.id]) return;
    world[k.id] = before[k.id].m;
    // いまの時間の 見え方（ピンが あれば ピンの値）
    wasAt[k.id] = { x: before[k.id].v.x, y: before[k.id].v.y };
  });

  fn();

  const after = computeAll(project, time);
  let n = 0;
  for(const k of kids){
    const w = world[k.id];
    if(!w || !after[layer.id]) continue;
    const d = M.decompose(M.mul(M.inv(after[layer.id].m), w));

    /* 場所は「どれだけ ずらすか」で 直す。
       うごきのピンが 打ってあると 素の値は 見られないので、
       ピンも 同じだけ ずらさないと その子だけ 動いてしまう。 */
    const dx = d.x - wasAt[k.id].x;
    const dy = d.y - wasAt[k.id].y;
    k.x += dx; k.y += dy;
    shiftTrack(k, 'x', dx);
    shiftTrack(k, 'y', dy);

    // まわり方・大きさは ピンが 無いときだけ 直す（じくの 移動では 変わらない）
    const tr = k.tracks || {};
    if(!(tr.rot && tr.rot.length)) k.rot = d.rot;
    if(!(tr.scaleX && tr.scaleX.length)) k.scaleX = d.scaleX;
    if(!(tr.scaleY && tr.scaleY.length)) k.scaleY = d.scaleY;
    n++;
  }
  return n;
}

/**
 * ☑ でえらんだ レイヤーを まとめて けす。
 * フォルダを けすときは 中身も いっしょに。
 * ぶら下がっていた ほかのレイヤーは 親を はずして その場に のこす。
 */
export function removeLayers(project, ids){
  const kill = new Set();
  const add = (id) => {
    if(kill.has(id)) return;
    kill.add(id);
    const l = project.layers.find(x => x.id === id);
    if(l && isFolder(l)) project.layers.forEach(x => { if(x.parent === id) add(x.id); });
  };
  ids.forEach(add);

  project.layers = project.layers.filter(l => !kill.has(l.id));
  project.layers.forEach(l => { if(l.parent && kill.has(l.parent)) l.parent = null; });
  return kill.size;
}

/**
 * レイヤーを 写す（コピー）。
 * 絵そのもの（アセット）は 使いまわすので 重くならない。
 * 親子は、いっしょに写したものの中で つなぎ直す。
 */
/* 作業だけの ものは state.js に まとめてある（ふえたら そちらに 足す） */
const SKIPKEY = WORK_KEYS;

export function copyLayers(project, ids){
  const set = new Set(ids);
  const src = project.layers.filter(l => set.has(l.id));
  // あみ（mesh）と 描画用の配列は 持っていかない（張り直せる）
  return JSON.parse(JSON.stringify(src, (k, v) =>
    (SKIPKEY.has(k)) ? undefined : v));
}

/** 写したものを はりつける。すこし ずらして 手前に 置く */
export function pasteLayers(project, copied, opt = {}){
  if(!copied || !copied.length) return [];
  const shift = opt.shift == null ? 24 : opt.shift;
  const map = {};
  const made = copied.map(o => {
    const l = JSON.parse(JSON.stringify(o));
    map[o.id] = l.id = uid('L');
    l.pins = (l.pins || []).map(p => Object.assign({}, p));
    l.mesh = null; l._xy = null; l._hmesh = null; l._hbase = null; l._bxy = null;
    l.x += shift; l.y += shift;
    if(!/ のコピー$/.test(l.name)) l.name = l.name + ' のコピー';
    return l;
  });
  // 親子は 写した中だけで つなぎ直す。外の親は そのまま
  made.forEach(l => { if(l.parent && map[l.parent]) l.parent = map[l.parent]; });
  project.layers.unshift(...made);
  return made;
}

/**
 * レイヤーを ふくせい（1タップで コピー＆はりつけ）。
 *
 * 「はりつけ」と ちがって
 *   ・ずらさない（同じ 場所に かさなる）
 *   ・いちばん上ではなく、もとの すぐ上に 置く
 *   ・フォルダの中に いたら 同じ フォルダの中に 入る
 * ので、目の 左右を つくる ときなどに そのまま つかえる。
 *
 * 絵そのもの（アセット）は 使いまわすので、ふやしても 重くならない。
 */
export function duplicateLayers(project, ids){
  // フォルダを ふくせいするなら 中身も いっしょに
  const set = new Set();
  const add = (id) => {
    if(set.has(id)) return;
    set.add(id);
    const l = project.layers.find(x => x.id === id);
    if(l && isFolder(l)) project.layers.forEach(x => { if(x.parent === id) add(x.id); });
  };
  ids.forEach(add);
  if(!set.size) return [];

  // ならびを くずさないよう、もとの ならび順で 写す
  const order = project.layers.filter(l => set.has(l.id));
  const at = project.layers.indexOf(order[0]);

  const map = {};
  const made = order.map(o => {
    const l = JSON.parse(JSON.stringify(o, (k, v) =>
      (SKIPKEY.has(k)) ? undefined : v));
    map[o.id] = l.id = uid('L');
    l.pins = (l.pins || []).map(q => Object.assign({}, q));
    l.mesh = null; l._xy = null; l._hmesh = null; l._hbase = null; l._bxy = null;
    l.name = o.name + ' 2';
    return l;
  });
  // 写した 中どうしの おやこは つなぎ直す。外の親は そのまま ひきつぐ
  made.forEach(l => { if(l.parent && map[l.parent]) l.parent = map[l.parent]; });

  project.layers.splice(at, 0, ...made);
  return made;
}

/** そのレイヤーたち＋中身＋入っている フォルダ を ぜんぶ あつめる */
export function withKinAndFolders(project, ids){
  const set = new Set();
  const down = (id) => {
    if(set.has(id)) return;
    set.add(id);
    const l = project.layers.find(x => x.id === id);
    if(l && isFolder(l)) project.layers.forEach(x => { if(x.parent === id) down(x.id); });
  };
  ids.forEach(down);
  // 入れものの フォルダも 入れる（フォルダの 効果を かけたまま 焼くため）
  const byId = {};
  project.layers.forEach(l => byId[l.id] = l);
  [...set].forEach(id => {
    let l = byId[id], guard = 0;
    while(l && l.parent && guard++ < 64){ set.add(l.parent); l = byId[l.parent]; }
  });
  return set;
}
