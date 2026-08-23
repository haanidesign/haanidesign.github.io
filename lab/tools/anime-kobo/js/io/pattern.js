/* はいけいの もよう。

   考え方
     ① くり返しの「ひとマス」を 描く
     ② そのマスを ならべて キャンバスより ひとマスぶん 大きい絵にする
     ③ 動かすときは ちょうど ひとマスぶん ずらして くり返す
        → つなぎ目が 見えないまま ずっと 流れる

   ひとマスを 描くときは、はみ出したぶんが 反対がわに 出るように
   9か所へ 同じものを 描く（すぐ下の stamp）。 */

const TAU = Math.PI * 2;

/** ひとマスに 描く。はみ出しても 反対がわに つながるように 9回 描く */
function stamp(g, w, h, paint){
  for(let dx = -1; dx <= 1; dx++){
    for(let dy = -1; dy <= 1; dy++){
      g.save();
      g.translate(dx * w, dy * h);
      paint(g);
      g.restore();
    }
  }
}

function heartPath(g, x, y, r){
  g.beginPath();
  g.moveTo(x, y + r * 0.75);
  g.bezierCurveTo(x - r * 1.5, y - r * 0.35, x - r * 0.5, y - r * 1.15, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.5, y - r * 1.15, x + r * 1.5, y - r * 0.35, x, y + r * 0.75);
  g.closePath();
}

function starPath(g, x, y, r){
  g.beginPath();
  for(let i = 0; i < 10; i++){
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

function hexPath(g, x, y, r){
  g.beginPath();
  for(let i = 0; i < 6; i++){
    const a = -Math.PI / 2 + i * TAU / 6;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

/* もよう ひとつずつ。
   size は「もようの大きさ」。tile が くり返しの ひとマス。 */
export const PATTERNS = {
  むじ: {
    tile: (s) => [s, s],
    paint: () => {}
  },

  ドット: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.fillStyle = c;
      // ずらして 置くと ならびが やわらかく見える
      stamp(g, s, s, (h) => {
        h.beginPath(); h.arc(s * 0.25, s * 0.25, s * 0.14, 0, TAU); h.fill();
        h.beginPath(); h.arc(s * 0.75, s * 0.75, s * 0.14, 0, TAU); h.fill();
      });
    }
  },

  ハート: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.fillStyle = c;
      stamp(g, s, s, (h) => {
        heartPath(h, s * 0.25, s * 0.28, s * 0.16); h.fill();
        heartPath(h, s * 0.75, s * 0.78, s * 0.16); h.fill();
      });
    }
  },

  ほし: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.fillStyle = c;
      stamp(g, s, s, (h) => {
        starPath(h, s * 0.25, s * 0.27, s * 0.16); h.fill();
        starPath(h, s * 0.75, s * 0.77, s * 0.16); h.fill();
      });
    }
  },

  ストライプ: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.fillStyle = c;
      g.fillRect(0, 0, s * 0.5, s);
    }
  },

  こうし: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.strokeStyle = c;
      g.lineWidth = Math.max(1, s * 0.07);
      stamp(g, s, s, (h) => {
        h.beginPath();
        h.moveTo(s * 0.5, -1); h.lineTo(s * 0.5, s + 1);
        h.moveTo(-1, s * 0.5); h.lineTo(s + 1, s * 0.5);
        h.stroke();
      });
    }
  },

  チェック: {
    tile: (s) => [s, s],
    paint: (g, s, c) => {
      g.fillStyle = c;
      g.fillRect(0, 0, s * 0.5, s * 0.5);
      g.fillRect(s * 0.5, s * 0.5, s * 0.5, s * 0.5);
    }
  },

  ろっかく: {
    /* 六角形の くり返しは よこ √3r、たて 3r で ぴったり合う */
    tile: (s) => {
      const r = s * 0.5;
      return [Math.sqrt(3) * r, 3 * r];
    },
    paint: (g, s, c, w, h) => {
      const r = s * 0.5;
      g.strokeStyle = c;
      g.lineWidth = Math.max(1, s * 0.06);
      stamp(g, w, h, (k) => {
        hexPath(k, 0, 0, r);            k.stroke();
        hexPath(k, w / 2, h / 2, r);    k.stroke();
      });
    }
  }
};

export const PATTERN_NAMES = Object.keys(PATTERNS);

/**
 * もようの絵を つくる。
 *   w,h    … キャンバスの大きさ
 *   opt    … { kind, back, front, size, angle }
 * 戻り値 … { canvas, tileW, tileH, k }
 *   k は 縮めた ばい率。絵は キャンバスより ひとマスぶん 大きい。
 */
export function makePattern(w, h, opt){
  const kind = PATTERNS[opt.kind] ? opt.kind : 'むじ';
  const P = PATTERNS[kind];
  const size = Math.max(8, opt.size || 80);
  /* ひとマスは 整数ドットに そろえる。
     半端だと ひとまわりしたとき 絵が わずかに ずれて、
     つなぎ目が うっすら 見えてしまう。 */
  const raw = P.tile(size);
  const tw = Math.max(2, Math.round(raw[0]));
  const th = Math.max(2, Math.round(raw[1]));

  /* 動かしたときに はしが 見えないよう、まわりを ひとマスぶん 大きく作る。
     ななめに 流すときは もっと ずらすので、pad で ふやす。 */
  const pad = Math.max(1, Math.min(3, opt.pad || 1));
  const fullW = w + tw * 2 * pad;
  const fullH = h + th * 2 * pad;

  // 大きすぎると 重いので、長いほうを これくらいに おさえる
  const MAX = 2400;
  const kMax = Math.min(1, MAX / Math.max(fullW, fullH));
  const k = opt.k ? Math.min(kMax, opt.k) : kMax;

  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(fullW * k));
  cv.height = Math.max(2, Math.round(fullH * k));
  const g = cv.getContext('2d');

  g.fillStyle = opt.back || '#FFFEF7';
  g.fillRect(0, 0, cv.width, cv.height);

  if(kind !== 'むじ'){
    // ひとマスを 作ってから、それを ならべて うめる
    const t = document.createElement('canvas');
    t.width = Math.max(2, Math.round(tw * k));
    t.height = Math.max(2, Math.round(th * k));
    const tg = t.getContext('2d');
    tg.scale(k, k);
    P.paint(tg, size, opt.front || '#F2A0B8', tw, th);

    const pat = g.createPattern(t, 'repeat');
    if(opt.angle && pat.setTransform){
      // ななめの もよう。まわしても つなぎ目は 出ない
      pat.setTransform(new DOMMatrix().rotate(opt.angle));
    }
    g.fillStyle = pat;
    g.fillRect(0, 0, cv.width, cv.height);
  }

  return { canvas: cv, tileW: tw, tileH: th, k, kMax };
}


/**
 * その がらを その向きに 動かして、見た目が 変わるか。
 *
 * たとえば たてじまを たてに 流しても、同じ しまが 重なるだけで
 * 止まって見える。えらぶ前に ここで 確かめて、
 * 効かない向きは えらべないようにする。
 *
 * ひとマスを 4分の1 ずらして 見くらべるだけなので すぐ終わる。
 */
export function movesVisibly(opt, dx, dy){
  if(!dx && !dy) return false;
  const kind = PATTERNS[opt.kind] ? opt.kind : 'むじ';
  if(kind === 'むじ') return false;

  const size = Math.max(8, opt.size || 80);
  const raw = PATTERNS[kind].tile(size);
  const tw = Math.max(2, Math.round(raw[0]));
  const th = Math.max(2, Math.round(raw[1]));

  // 小さめに 作って くらべる（見た目の判定には じゅうぶん）
  const k = Math.min(1, 160 / Math.max(tw, th));
  const W = Math.max(8, Math.round(tw * 3 * k));
  const H = Math.max(8, Math.round(th * 3 * k));

  const shot = (ox, oy) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    const t = document.createElement('canvas');
    t.width = Math.max(2, Math.round(tw * k));
    t.height = Math.max(2, Math.round(th * k));
    const tg = t.getContext('2d');
    tg.scale(k, k);
    PATTERNS[kind].paint(tg, size, '#000000', tw, th);
    const pat = g.createPattern(t, 'repeat');
    const m = new DOMMatrix();
    if(opt.angle) m.rotateSelf(opt.angle);
    m.translateSelf(ox, oy);
    if(pat.setTransform) pat.setTransform(m);
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    return g.getImageData(0, 0, W, H).data;
  };

  // 4分の1 ずらして くらべる
  const a = shot(0, 0);
  const b = shot(dx * tw * k / 4, dy * th * k / 4);
  let n = 0;
  for(let i = 0; i < a.length; i += 4) if(Math.abs(a[i] - b[i]) > 40) n++;
  return n > (a.length / 4) * 0.02;      // 2%より 多く 変われば 動いて見える
}


/**
 * ずらす量を きめる。
 *
 * ならべている ひとマスは、絵の中では 整数ドットに 丸められている。
 * だから「くり返しの ひと区切り」も その 丸めた 大きさで 決まる。
 * そこを 見落とすと、ひとまわりしたとき 柄が 1ドットぶん ずれて、
 * つなぎ目で ちらっと ぶれて 見える。
 *
 * ばい率を ほんの少し 変えながら、
 * ずらす量が 縦横とも 整数ドットに なる ところを さがす。
 *   tw,th … ひとマス（キャンバスのドット）
 *   mx,my … 何マスぶん ずらすか
 * 戻り値 … { k, x, y, err }   x,y は 絵の中の 整数ドット
 */
export function fitShift(kMax, tw, th, angle, mx, my){
  const a = (angle || 0) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  let best = null;
  const steps = 300;
  for(let i = 0; i <= steps; i++){
    const k = kMax * (1 - 0.12 * i / steps);
    const TW = Math.max(2, Math.round(tw * k));
    const TH = Math.max(2, Math.round(th * k));
    const x = cos * (mx * TW) - sin * (my * TH);
    const y = sin * (mx * TW) + cos * (my * TH);
    const err = Math.abs(x - Math.round(x)) + Math.abs(y - Math.round(y));
    if(!best || err < best.err){
      best = { k, x: Math.round(x), y: Math.round(y), err, len: Math.hypot(x, y) };
    }
    if(err < 0.002) break;
  }
  return best;
}
