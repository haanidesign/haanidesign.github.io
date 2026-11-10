/* ✂ マスク。

   1まいの レイヤーに 何まいでも かけられる。
     たす（add） … その 形の 中を 出す
     ぬく（sub） … その 形の 中を 消す
   うら返す（invert）は、その マスク 1つだけを さかさまに する。

   形は ピンで 動かせる（AEの マスクパスの キーフレームと 同じ）。
   点 1つに つき よこ・たての チャンネルを 持つ。
     K<マスクの ばんごう>:<点の ばんごう>:x / :y

   形の ざひょう
     ふつうの レイヤー … 絵の 中の ざひょう（動かすと ついてくる）
     フォルダ         … 画面の ざひょう（画面に すわった まま） */

export const maskChX = (mi, pi) => 'K' + mi + ':' + pi + ':x';
export const maskChY = (mi, pi) => 'K' + mi + ':' + pi + ':y';
export const isMaskCh = (c) => /^K\d+:\d+:(x|y)$/.test(c);

/** きまった かたちに そろえた マスクの ならび（古い 1まいだけの ものも 読める） */
export function masksOf(l){
  if(!l) return [];
  if(Array.isArray(l.masks) && l.masks.length) return l.masks;
  if(l.mask && l.mask.pts && l.mask.pts.length >= 3){
    return [{
      pts: l.mask.pts,
      on: l.mask.on !== false,
      invert: !!l.mask.invert,
      feather: l.mask.feather || 0,
      mode: 'add'
    }];
  }
  return [];
}

/** 古い かたち（mask 1まい）を ならびに 直す。これから 足す ときに つかう */
export function toMasks(l){
  if(!Array.isArray(l.masks) || !l.masks.length){
    l.masks = masksOf(l).map(m => ({ ...m, pts: m.pts.map(p => ({ x: p.x, y: p.y })) }));
    l.mask = null;
  }
  return l.masks;
}

export function newMask(pts, mode){
  return { pts, on: true, invert: false, feather: 0, mode: mode || 'add' };
}

/** 出す ぶんだけ（目を 切って いない・点が 3つ いじょう） */
export function liveMasks(l){
  return masksOf(l).filter(m => m && m.on !== false && m.pts && m.pts.length >= 3);
}

/** その レイヤーの マスクに ピンが うって あるか */
export function maskAnimated(l){
  const tr = (l && l.tracks) || {};
  for(const c of Object.keys(tr)) if(isMaskCh(c) && tr[c] && tr[c].length) return true;
  return false;
}

/**
 * 線の 長さで 点を うち直す（点の 数を そろえる）。
 * ピンを うった あとに かこみ直しても、点の 数が 合うように するため。
 */
export function resamplePoly(pts, n){
  if(!pts || pts.length < 2 || n < 3) return pts;
  const seg = [];
  let total = 0;
  for(let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    seg.push(d); total += d;
  }
  if(total < 1e-6) return pts;

  const out = [];
  const step = total / n;
  let i = 0, left = seg[0], t = 0;
  for(let k = 0; k < n; k++){
    let want = 0;
    if(k > 0){
      want = step;
      while(want > left){
        want -= left;
        t = 0;
        i = (i + 1) % pts.length;
        left = seg[i];
      }
      left -= want;
      t += want;
    }
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const u = seg[i] > 1e-6 ? t / seg[i] : 0;
    out.push({ x: Math.round(a.x + (b.x - a.x) * u), y: Math.round(a.y + (b.y - a.y) * u) });
  }
  return out;
}

/** マスクの 形を いまの 時こくの ピンに する */
export function setMaskKeys(l, mi, time, pts, setPin){
  pts.forEach((p, pi) => {
    setPin(l, maskChX(mi, pi), time, p.x, 'smooth');
    setPin(l, maskChY(mi, pi), time, p.y, 'smooth');
  });
}

/** その マスクの ピンを ぜんぶ けす */
export function clearMaskKeys(l, mi){
  const tr = l.tracks || {};
  const head = 'K' + mi + ':';
  Object.keys(tr).forEach(c => { if(c.indexOf(head) === 0) delete tr[c]; });
}
