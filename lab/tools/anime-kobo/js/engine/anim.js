/* ピン（キーフレーム）のしくみ。
   ピンの値は「その時の姿そのもの」。差分ではないので、子どもに説明しやすい。

   つなぎ方（curve）
     smooth … なめらか（既定）
     linear … まっすぐ
     hold   … とめる。次のピンまで動かない

   くりかえし（layer.loop）
     { from, to, mode:'loop' }     … from〜to をずっと繰り返す
     { from, to, mode:'pingpong' } … 行って戻ってを繰り返す
   ピンを複製せず、時間を折り返して読むだけ。あとから元の動きを直せば全部に効く。 */

/* なめらかにつながるもの */
export const CHANNELS = ['x', 'y', 'scaleX', 'scaleY', 'rot', 'opacity', 'tint', 'blur', 'stroke'];
/* ぱっと切り替わるもの（つなぎ方に関係なく段々）。
   frame ＝ どのコマの絵を見せるか。ここがコマアニメの本体。 */
export const STEP_CHANNELS = ['frame', 'flipX', 'flipY'];
export const ALL_CHANNELS = [...CHANNELS, ...STEP_CHANNELS];

/* パペットピンのずれは、ピンごとにチャンネルが増える。
   名前は Pxxxxx:x / Pxxxxx:y。決め打ちの一覧では足りないので、
   ピンを数える処理は「いま実際にあるチャンネル」を見る。 */
export const pinChX = (id) => 'P' + id + ':x';
export const pinChY = (id) => 'P' + id + ':y';

/** そのレイヤーが実際に持っているチャンネル名 */
export function channelsOf(layer){
  return Object.keys(layer.tracks || {});
}

export const CH_LABEL = {
  x:'よこ', y:'たて', scaleX:'よこ幅', scaleY:'たて幅', rot:'かたむき', opacity:'すけ具合',
  tint:'塗り', blur:'ぼかし', stroke:'ふちどり', flipX:'左右反転', flipY:'上下反転', frame:'コマ'
};

/** そのレイヤーにピンが1つでもあるか */
export function hasPins(layer){
  const t = layer.tracks || {};
  return Object.keys(t).some(c => t[c] && t[c].length);
}

/** ピンが打たれている時刻を全部（重複なし・昇順） */
export function pinTimes(layer){
  const t = layer.tracks || {};
  const set = new Set();
  for(const c of Object.keys(t)){
    if(t[c]) t[c].forEach(k => set.add(+k.t.toFixed(3)));
  }
  return [...set].sort((a, b) => a - b);
}

function track(layer, ch, create){
  if(!layer.tracks) layer.tracks = {};
  let k = layer.tracks[ch];
  if(!k){
    if(!create) return null;
    k = layer.tracks[ch] = [];
  }
  return k;
}

/** ピンを打つ／上書きする */
export function setPin(layer, ch, time, value, curve){
  const keys = track(layer, ch, true);
  const t = +time.toFixed(3);
  const i = keys.findIndex(k => Math.abs(k.t - t) < 1e-3);
  if(i >= 0){
    keys[i].v = value;
    if(curve) keys[i].c = curve;
  } else {
    keys.push({ t, v: value, c: curve || 'smooth' });
    keys.sort((a, b) => a.t - b.t);
  }
}

/** その時刻のピンを消す。ch を省くと全チャンネル */
export function removePin(layer, time, ch){
  const t = +time.toFixed(3);
  const list = ch ? [ch] : channelsOf(layer);
  for(const c of list){
    const keys = track(layer, c, false);
    if(!keys) continue;
    const i = keys.findIndex(k => Math.abs(k.t - t) < 1e-3);
    if(i >= 0) keys.splice(i, 1);
    if(!keys.length) delete layer.tracks[c];
  }
}

/** その時刻のピンを別の時刻へずらす */
export function movePin(layer, from, to){
  const f = +from.toFixed(3), t = +to.toFixed(3);
  if(Math.abs(f - t) < 1e-4) return;
  for(const c of channelsOf(layer)){
    const keys = track(layer, c, false);
    if(!keys) continue;
    const k = keys.find(k => Math.abs(k.t - f) < 1e-3);
    if(!k) continue;
    // 移動先にすでにピンがあれば上書きする
    const j = keys.findIndex(x => x !== k && Math.abs(x.t - t) < 1e-3);
    if(j >= 0) keys.splice(j, 1);
    k.t = t;
    keys.sort((a, b) => a.t - b.t);
  }
}

/**
 * ピンをずらす。ripple なら、それより後ろのピンも同じだけ一緒にずらす。
 * 「3コマめを長く見せたい」ときに、後ろを1つずつ動かさなくて済む。
 * 動画の長さからはみ出さないように、ずらす量を抑える。
 * 戻り値＝実際に動いた先の時刻。
 */
export function movePinRipple(layer, from, to, duration){
  const after = pinTimes(layer).filter(t => t > from + 1e-6);
  let delta = to - from;

  if(after.length && duration != null){
    const maxT = Math.max(...after);
    if(maxT + delta > duration) delta = duration - maxT;
  }
  if(from + delta < 0) delta = -from;
  if(Math.abs(delta) < 1e-6) return from;

  const target = +(from + delta).toFixed(3);
  // 右へずらすときは遠いものから動かす（近いものから動かすと重なって消える）
  const order = delta > 0 ? [...after].sort((a, b) => b - a) : [...after].sort((a, b) => a - b);
  order.forEach(t => movePin(layer, t, +(t + delta).toFixed(3)));
  movePin(layer, from, target);

  if(layer.loop){
    if(layer.loop.from >= from - 1e-6) layer.loop.from = +(layer.loop.from + delta).toFixed(3);
    if(layer.loop.to   >= from - 1e-6) layer.loop.to   = +(layer.loop.to + delta).toFixed(3);
  }
  return target;
}

/** その時刻のピンのつなぎ方をまとめて変える */
export function setCurveAt(layer, time, curve){
  const t = +time.toFixed(3);
  for(const c of channelsOf(layer)){
    const keys = track(layer, c, false);
    if(!keys) continue;
    const k = keys.find(k => Math.abs(k.t - t) < 1e-3);
    if(k) k.c = curve;
  }
}

/** その時刻の ピンの つなぎ方（いちばん はじめに 見つかったもの） */
export function easeAt(layer, time){
  const t = +time.toFixed(3);
  for(const c of channelsOf(layer)){
    const keys = track(layer, c, false);
    if(!keys) continue;
    const k = keys.find(k => Math.abs(k.t - t) < 1e-3);
    if(k) return k.c || 'smooth';
  }
  return null;
}

/** その時刻のピンが「とめる」になっているか */
export function isHoldAt(layer, time){
  const t = +time.toFixed(3);
  for(const c of channelsOf(layer)){
    const keys = track(layer, c, false);
    if(!keys) continue;
    const k = keys.find(k => Math.abs(k.t - t) < 1e-3);
    if(k) return k.c === 'hold';
  }
  return false;
}

/** くりかえしを考えて、読むべき時刻に直す */
export function mapTime(time, loop){
  if(!loop || time <= loop.to) return time;
  const len = loop.to - loop.from;
  if(len <= 1e-4) return loop.to;
  if(loop.mode === 'pingpong'){
    const k = (time - loop.from) % (len * 2);
    return loop.from + (k <= len ? k : len * 2 - k);
  }
  return loop.from + ((time - loop.from) % len);
}

/** 1チャンネルぶんの値を読む */
/* ---------- つなぎ方（イージング） ----------
   ピンと ピンの あいだの「進み方」。
   0〜1 の 時間を もらって、0〜1 の 進みぐあいを かえす。

   linear   … まっすぐ（同じ はやさ）
   smooth   … なめらか（出だしと 終わりが ゆっくり）＝ 前からの きほん
   in       … ゆっくり 出る（だんだん はやく）
   out      … ゆっくり 止まる（だんだん おそく）
   strong   … ぐいっと（まん中だけ とても はやい）
   back     … ばね（いきすぎて もどる）
   bounce   … はずむ（地面で 何回か はねる）
   hold     … とめる（つぎのピンまで 変わらない） */
export const EASES = {
  linear: (u) => u,
  smooth: (u) => u * u * (3 - 2 * u),
  in:     (u) => u * u,
  out:    (u) => 1 - (1 - u) * (1 - u),
  strong: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  back:   (u) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  },
  bounce: (u) => {
    const n1 = 7.5625, d1 = 2.75;
    if(u < 1 / d1) return n1 * u * u;
    if(u < 2 / d1){ u -= 1.5 / d1; return n1 * u * u + 0.75; }
    if(u < 2.5 / d1){ u -= 2.25 / d1; return n1 * u * u + 0.9375; }
    u -= 2.625 / d1; return n1 * u * u + 0.984375;
  }
};

/** えらべる つなぎ方（画面に 出す 順・名前） */
export const EASE_LIST = [
  ['smooth', 'なめらか',     'ふつう。出だしと 終わりが ゆっくり'],
  ['linear', 'まっすぐ',     'ずっと 同じ はやさ'],
  ['in',     'ゆっくり出る', 'だんだん はやくなる'],
  ['out',    'ゆっくり止まる','だんだん おそくなる'],
  ['strong', 'ぐいっと',     'まん中だけ とても はやい'],
  ['back',   'ばね',         'いきすぎて もどる'],
  ['bounce', 'はずむ',       '地面で 何回か はねる'],
  ['hold',   'とめる',       'つぎのピンまで 変わらない']
];

export function sample(keys, time, fallback){
  if(!keys || !keys.length) return fallback;
  if(time <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if(time >= last.t) return last.v;

  let i = 0;
  while(i < keys.length - 1 && keys[i + 1].t <= time) i++;
  const a = keys[i], b = keys[i + 1];
  if(a.c === 'hold') return a.v;

  const u = (time - a.t) / (b.t - a.t);
  const f = EASES[a.c] || EASES.smooth;
  return a.v + (b.v - a.v) * f(u);
}

/** ぱっと切り替わるチャンネル。手前のピンの値をそのまま返す */
export function sampleStep(keys, time, fallback){
  if(!keys || !keys.length) return fallback;
  if(time < keys[0].t) return keys[0].v;
  let v = keys[0].v;
  for(const k of keys){
    if(k.t > time) break;
    v = k.v;
  }
  return v;
}

/** そのレイヤーの、その時刻の姿 */
export function valuesAt(layer, time){
  const t = mapTime(time, layer.loop);
  const tr = layer.tracks || {};
  const tint = layer.tint || { color:'#F2A0B8', amount:0 };
  const st   = layer.stroke || { color:'#FFFEF7', width:0 };
  return {
    x:       sample(tr.x,       t, layer.x),
    y:       sample(tr.y,       t, layer.y),
    scaleX:  sample(tr.scaleX,  t, layer.scaleX),
    scaleY:  sample(tr.scaleY,  t, layer.scaleY),
    rot:     sample(tr.rot,     t, layer.rot),
    opacity: sample(tr.opacity, t, layer.opacity),

    tintColor:  tint.color,
    tintAmount: sample(tr.tint, t, tint.amount),
    blur:       sample(tr.blur, t, layer.blur || 0),

    strokeColor: st.color,
    strokeW:     sample(tr.stroke, t, st.width || 0),

    flipX: !!sampleStep(tr.flipX, t, layer.flipX),
    flipY: !!sampleStep(tr.flipY, t, layer.flipY),

    frame: Math.max(0, Math.round(sampleStep(tr.frame, t, 0))),

    // パペットピンの、その時のずれ
    pins: (layer.pins || []).map(p => ({
      id: p.id, u: p.u, v: p.v, type: p.type,
      dx: p.type === 'fix' ? 0 : sample(tr[pinChX(p.id)], t, p.dx || 0),
      dy: p.type === 'fix' ? 0 : sample(tr[pinChY(p.id)], t, p.dy || 0)
    }))
  };
}

/** そのレイヤーに「コマの切り替え」ピンが打たれている時刻 */
export function framePinTimes(layer){
  const k = (layer.tracks || {}).frame;
  return k ? k.map(x => +x.t.toFixed(3)) : [];
}

/** コマを等間隔に並べる。ここから1つずつ横にずらして緩急をつける */
export function spreadFrames(layer, secPerFrame, startTime){
  const t0 = startTime || 0;
  layer.frames.forEach((_, i) => {
    setPin(layer, 'frame', t0 + i * secPerFrame, i, 'hold');
  });
}

/** そのチャンネルの、いまの値（ピンがあればピン優先） */
export function channelValue(layer, ch, time){
  const v = valuesAt(layer, time);
  if(ch === 'tint')   return v.tintAmount;
  if(ch === 'stroke') return v.strokeW;
  return v[ch];
}

/**
 * まばたき。あいだ をあけて、とじコマを ちょっとだけ見せる。
 * ぴったり等間隔だと機械っぽいので、少しばらつかせる。
 */
export function blinkKeys(opt){
  const openF  = opt.openFrame  ?? 0;
  const closeF = opt.closeFrame ?? 1;
  const every  = Math.max(0.4, opt.every ?? 3);
  const hold   = Math.max(0.03, opt.hold ?? 0.09);
  const start  = opt.start ?? 0;
  const end    = opt.end ?? 15;
  const jitter = Math.min(0.9, Math.max(0, opt.jitter ?? 0.5));

  const keys = [{ t: +start.toFixed(3), v: openF }];
  let t = start + every * 0.5;
  let guard = 0;
  while(t + hold < end && guard++ < 2000){
    keys.push({ t: +t.toFixed(3), v: closeF });
    keys.push({ t: +(t + hold).toFixed(3), v: openF });
    t += every * (1 - jitter / 2 + Math.random() * jitter);
  }
  return keys;
}

/**
 * 口パク。はやさ のぶんだけコマを入れ替える。
 * 同じコマが続くと止まって見えるので、前と違うコマを選ぶ。
 */
export function talkKeys(opt){
  const frames = (opt.frames && opt.frames.length) ? opt.frames : [0, 1];
  const rate   = Math.max(1, opt.rate ?? 8);
  const start  = opt.start ?? 0;
  const end    = opt.end ?? (start + 2);
  const closed = opt.closedFrame ?? frames[0];
  const step = 1 / rate;

  const keys = [];
  let prev = -1, guard = 0;
  for(let t = start; t < end && guard++ < 4000; t += step){
    let v = frames[Math.floor(Math.random() * frames.length)];
    if(frames.length > 1 && v === prev) v = frames[(frames.indexOf(v) + 1) % frames.length];
    prev = v;
    keys.push({ t: +t.toFixed(3), v });
  }
  keys.push({ t: +end.toFixed(3), v: closed });   // さいごは口を閉じる
  return keys;
}

/** 秒を 00:04.2 の形にする */
export function fmtTime(sec){
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return String(m).padStart(2, '0') + ':' + r.toFixed(1).padStart(4, '0');
}
