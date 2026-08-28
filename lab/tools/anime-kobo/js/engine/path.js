/* なぞった みちに そって 動かす。

   考え方
     ① 指の あとは 点の ならび。そのままだと 点の あいだが
        ばらばら（はやく なぞった ところは すかすか）。
     ② 道のりで 等分に とり直す（リサンプル）。
        こうすると「同じ はやさで 進む」ように なる。
     ③ 何秒で 通るかを きめて、つなぎ方（イージング）で
        時間の 割りふりを 変える。
        ゆっくり出る に すれば、はじめは のろのろ 進む。 */

import { setPin, EASES, curveAt } from './anim.js?v=86';

/** 点の ならびの 長さ（道のり） */
export function pathLength(pts){
  let d = 0;
  for(let i = 1; i < pts.length; i++){
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

/** 近すぎる 点を まびく（指の ふるえ よけ） */
export function cleanPath(pts, least){
  const min = least == null ? 2 : least;
  const out = [];
  for(const p of pts){
    const last = out[out.length - 1];
    if(!last || Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push({ x: p.x, y: p.y });
  }
  if(out.length < 2 && pts.length) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}

/**
 * 道のりで 等分に とり直す。
 * n こに 分けた 点を かえす（はしと はしを ふくむ）。
 */
export function resample(pts, n){
  const src = cleanPath(pts, 1.5);
  if(src.length < 2) return src.slice();

  // ここまでの 道のりを ためておく
  const acc = [0];
  for(let i = 1; i < src.length; i++){
    acc.push(acc[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y));
  }
  const total = acc[acc.length - 1] || 1;

  const out = [];
  let j = 0;
  for(let i = 0; i < n; i++){
    const want = (i / (n - 1)) * total;
    while(j < acc.length - 2 && acc[j + 1] < want) j++;
    const seg = acc[j + 1] - acc[j] || 1;
    const k = Math.max(0, Math.min(1, (want - acc[j]) / seg));
    out.push({
      x: src[j].x + (src[j + 1].x - src[j].x) * k,
      y: src[j].y + (src[j + 1].y - src[j].y) * k
    });
  }
  return out;
}

/**
 * なぞった みちを ピンに する。
 *   pts   … レイヤーの 親から 見た 点の ならび
 *   opt   … { start, dur, ease, count }
 * 戻り値 … 打った ピンの 数
 */
export function pathKeys(layer, pts, opt = {}){
  const start = opt.start || 0;
  const dur = Math.max(0.1, opt.dur || 1);
  const count = Math.max(2, Math.min(120, opt.count || 24));
  const ease = opt.ease || 'linear';
  const shape = opt.shape;              // 自分で かいた 線

  const road = resample(pts, count);
  if(road.length < 2) return 0;

  /* 時間の 割りふり。
     まっすぐ（linear）なら 同じ はやさ。
     ほかの つなぎ方だと、道のりの 進み方が 変わる。 */
  const prog = (u) => {
    if(ease === 'custom' && shape && shape.length > 1) return curveAt(shape, u);
    const f = EASES[ease] || EASES.linear;
    return f(u);
  };

  /* 道のりを 等分に 見て、その 場所に なる 時こくを さがす。
     （時間で 等分 ではなく 道のりで 等分に 打つと、
       まがり角でも 形が くずれない） */
  let n = 0;
  for(let i = 0; i < road.length; i++){
    const s = i / (road.length - 1);         // 道のりの 進みぐあい 0〜1
    // prog(u) = s に なる u を さがす（かんたんな 二分さがし）
    let lo = 0, hi = 1;
    for(let k = 0; k < 24; k++){
      const mid = (lo + hi) / 2;
      if(prog(mid) < s) lo = mid; else hi = mid;
    }
    const u = (lo + hi) / 2;
    const t = +(start + u * dur).toFixed(3);
    setPin(layer, 'x', t, road[i].x, 'linear');
    setPin(layer, 'y', t, road[i].y, 'linear');
    n += 2;
  }
  return n;
}
