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

  // 動かしたときに はしが 見えないよう、ひとマスぶん 大きく作る
  const fullW = w + tw * 2;
  const fullH = h + th * 2;

  // 大きすぎると 重いので、長いほうを これくらいに おさえる
  const MAX = 2400;
  const k = Math.min(1, MAX / Math.max(fullW, fullH));

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

  return { canvas: cv, tileW: tw, tileH: th, k };
}
