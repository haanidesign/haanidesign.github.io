/* リズム（BPM）で ピンを うつ。

   BPM ＝ 1分間に なんど 拍が くるか。
   120 なら 0.5秒ごとに 1拍。

   拍の うらがわ（拍と拍の まんなか）が「うら拍」。
   表だけ・うらだけ・その両方 を えらべる。

   うごきは どれも「拍の しゅんかんに ぐっと 変えて、すぐ もどす」形。
   もどりを 少し 行きすぎさせると、ぽにょんと はねて見える。 */

import { setPin } from './anim.js?v=51';

/** 1拍の 長さ（秒） */
export const beatSec = (bpm) => 60 / Math.max(20, Math.min(400, bpm || 120));

/**
 * 拍の 時こくを ならべる。
 *   bpm    … はやさ
 *   every  … 何拍ごとに うつか（1=毎拍、2=2拍に1回、0.5=8分）
 *   kind   … 'omote' 表だけ / 'ura' うらだけ / 'both' 両方
 *   start  … いつから
 *   end    … いつまで
 *   offset … ぜんたいを 少し ずらす（秒）
 */
export function beatTimes(opt = {}){
  const b = beatSec(opt.bpm);
  const every = Math.max(0.25, opt.every || 1);
  const kind = opt.kind || 'omote';
  const start = opt.start || 0;
  const end = opt.end == null ? start + 4 : opt.end;
  const off = opt.offset || 0;

  const step = b * every;
  const out = [];
  let t = start + off, guard = 0;
  while(t <= end + 1e-6 && guard++ < 4000){
    if(kind !== 'ura') out.push({ t: +t.toFixed(3), ura: false });
    if(kind !== 'omote'){
      const u = t + step / 2;
      if(u <= end + 1e-6) out.push({ t: +u.toFixed(3), ura: true });
    }
    t += step;
  }
  return out.sort((a, b2) => a.t - b2.t);
}

/* うごきの 種類。
   どれも「基準の姿」からの 変化なので、置いたあとに
   大きさや 場所を 変えても 破綻しない。 */
export const RHYTHM_KINDS = ['ぽにょん', 'ジャンプ', 'くるっ', 'チカッ', 'ズーム'];

/**
 * リズムの ピンを うつ。
 *   l      … レイヤー
 *   opt    … { bpm, every, kind, motion, power, start, end, offset, uraPower }
 * 戻り値 … 打った ピンの 数
 */
export function rhythmKeys(l, opt = {}){
  const times = beatTimes(opt);
  if(!times.length) return 0;

  const b = beatSec(opt.bpm);
  const power = Math.max(0.02, Math.min(1, opt.power == null ? 0.35 : opt.power));
  const uraK = opt.uraPower == null ? 0.6 : opt.uraPower;   // うら拍は 少し ひかえめに
  const motion = opt.motion || 'ぽにょん';

  // 基準の姿（いまの見た目）
  const base = {
    x: l.x, y: l.y, sx: l.scaleX, sy: l.scaleY,
    rot: l.rot, op: l.opacity
  };

  // 1拍の中の どこで どうなるか。0〜1 の割合で 置く
  const hit = Math.min(0.14, b * 0.28);        // ぐっと 変わる ところ
  const back = Math.min(0.34, b * 0.62);       // もどりきる ところ

  let n = 0;
  const put = (ch, t, v, c) => { setPin(l, ch, +t.toFixed(3), v, c || 'smooth'); n++; };

  for(const bt of times){
    const p = power * (bt.ura ? uraK : 1);
    const t0 = bt.t;

    if(motion === 'ぽにょん'){
      // つぶれて → のびて → もどる
      put('scaleX', t0, base.sx);
      put('scaleY', t0, base.sy);
      put('scaleX', t0 + hit, base.sx * (1 + p * 0.5));
      put('scaleY', t0 + hit, base.sy * (1 - p * 0.45));
      put('scaleX', t0 + back * 0.6, base.sx * (1 - p * 0.2));
      put('scaleY', t0 + back * 0.6, base.sy * (1 + p * 0.18));
      put('scaleX', t0 + back, base.sx);
      put('scaleY', t0 + back, base.sy);

    } else if(motion === 'ジャンプ'){
      const h = 60 * p * 2;
      put('y', t0, base.y);
      put('y', t0 + hit, base.y - h);
      put('y', t0 + back, base.y);
      put('scaleY', t0, base.sy);
      put('scaleY', t0 + back * 0.85, base.sy * (1 - p * 0.25));
      put('scaleY', t0 + back, base.sy);

    } else if(motion === 'くるっ'){
      const a = 18 * p * 2;
      put('rot', t0, base.rot);
      put('rot', t0 + hit, base.rot + (bt.ura ? -a : a));
      put('rot', t0 + back, base.rot);

    } else if(motion === 'チカッ'){
      put('opacity', t0, base.op, 'hold');
      put('opacity', t0 + hit * 0.6, Math.max(0, base.op * (1 - p)), 'hold');
      put('opacity', t0 + hit * 1.2, base.op, 'hold');

    } else if(motion === 'ズーム'){
      const k = 1 + p * 0.6;
      put('scaleX', t0, base.sx);
      put('scaleY', t0, base.sy);
      put('scaleX', t0 + hit, base.sx * k);
      put('scaleY', t0 + hit, base.sy * k);
      put('scaleX', t0 + back, base.sx);
      put('scaleY', t0 + back, base.sy);
    }
  }
  return n;
}

/** そのうごきが つかう チャンネル。消すときに つかう */
export function rhythmChannels(motion){
  if(motion === 'ジャンプ') return ['y', 'scaleY'];
  if(motion === 'くるっ')   return ['rot'];
  if(motion === 'チカッ')   return ['opacity'];
  return ['scaleX', 'scaleY'];
}


/**
 * 拍の ところに「印としてのピン」だけ うつ。
 *
 * うごきは つけない。いまの姿を そのまま 拍の 時こくに おいていく。
 * あとは その ピンを 1つずつ ずらせば、
 * 自分の 好きな うごきを リズムに ぴったり 合わせられる。
 *
 * 戻り値 … { times, n }
 */
export function markKeys(l, opt = {}){
  const times = beatTimes(opt);
  if(!times.length) return { times: [], n: 0 };

  const at = opt.pose || {};
  const base = {
    x: at.x == null ? l.x : at.x,
    y: at.y == null ? l.y : at.y,
    scaleX: at.scaleX == null ? l.scaleX : at.scaleX,
    scaleY: at.scaleY == null ? l.scaleY : at.scaleY,
    rot: at.rot == null ? l.rot : at.rot,
    opacity: at.opacity == null ? l.opacity : at.opacity
  };

  let n = 0;
  for(const bt of times){
    for(const ch of Object.keys(base)){
      setPin(l, ch, bt.t, base[ch], 'smooth');
      n++;
    }
  }
  return { times, n };
}
