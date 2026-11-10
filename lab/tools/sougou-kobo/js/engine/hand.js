/* 手がき風（ハンドドロウン）。

   紙に 何まいも 描いた アニメは、同じ絵を 描いても
   線が びみょうに ずれる。その ずれが「カタカタ」した
   あの 感じを 作っている。

   ここでは それを 3つに 分けて まねる。
     ① 線の ゆれ  … あみの 角を 少しずつ ずらす（線が ふるえる）
     ② 紙の ずれ  … 絵ぜんたいを 少しだけ 動かす・かたむける
     ③ コマ数     … 8コマ／秒 などに 落とす
                     ずっと なめらかに ゆれると 手がきに 見えない。
                     ぱっ ぱっ と 切りかわるから 手がきに 見える。

   ①②は「コマの ばんごう」から その場で 計算する。
   おぼえて おかないので、何秒めを 出しても 同じ絵に なる
   （書き出しと 画面で ずれない）。 */

/** はじめの ぐあい */
export function newHand(){
  return {
    on: true,
    amount: 0.45,   // 線の ゆれ（0〜1）
    detail: 0.5,    // こまかさ（あみの こまかさ）
    wobble: 0.3,    // 紙の ずれ（0〜1）
    fps: 8,         // 1秒 なんコマに するか
    still: false    // うごきも コマ落としに するか
  };
}

export const handOn = (l) => !!(l && l.hand && l.hand.on
  && ((l.hand.amount || 0) > 0.01 || (l.hand.wobble || 0) > 0.01 || l.hand.still));

/** そのレイヤーの「いま 何コマめか」 */
export function handFrame(hand, time){
  const fps = Math.max(1, Math.min(30, (hand && hand.fps) || 8));
  return Math.floor(time * fps + 1e-6);
}

/** コマ落とし した 時こく。うごきそのものを カクカクさせる */
export function handTime(l, time){
  if(!l.hand || !l.hand.on || !l.hand.still) return time;
  const fps = Math.max(1, Math.min(30, l.hand.fps || 8));
  return Math.floor(time * fps + 1e-6) / fps;
}

/* ---------- ばらばらの 数 ----------
   同じ ばんごうを 入れれば いつでも 同じ 数が 出る。
   （らんすうを おぼえずに すませる ための やりかた） */
function hash(a, b, c){
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967296) * 2 - 1;      // -1〜1
}

/** あみの こまかさ（ゆれを どれくらい 細かく するか） */
export function handMeshSize(hand){
  const d = Math.max(0, Math.min(1, (hand && hand.detail) == null ? 0.5 : hand.detail));
  const n = Math.round(4 + d * 14);
  return { cols: n, rows: n };
}

/**
 * あみの 角を ずらす。
 *   xy    … もとの 角（絵の中の ドット）
 *   out   … 出し先（同じ 長さ）
 *   px    … ずらす 大きさ（ドット）
 *   frame … コマの ばんごう
 *   seed  … レイヤーごとに 変える ばんごう
 */
export function boil(xy, out, px, frame, seed){
  const n = xy.length >> 1;
  for(let i = 0; i < n; i++){
    out[i * 2]     = xy[i * 2]     + hash(i, frame, seed) * px;
    out[i * 2 + 1] = xy[i * 2 + 1] + hash(i, frame, seed + 9871) * px;
  }
  return out;
}

/**
 * 紙ぜんたいの ずれ。
 * 戻り値 … { dx, dy, rot }（rot は ラジアン）
 */
export function handShift(hand, frame, seed, size){
  const w = Math.max(0, Math.min(1, (hand && hand.wobble) || 0));
  if(w < 0.01) return { dx: 0, dy: 0, rot: 0 };
  const k = w * Math.max(2, (size || 200) * 0.012);
  return {
    dx: hash(frame, seed, 11) * k,
    dy: hash(frame, seed, 22) * k,
    rot: hash(frame, seed, 33) * w * 0.012      // 0.012rad ≒ 0.7°
  };
}

/** 線を ゆらす 大きさ（絵の中の ドット） */
export function boilPx(hand, size){
  const a = Math.max(0, Math.min(1, (hand && hand.amount) || 0));
  return a * Math.max(3, (size || 200) * 0.02);
}
