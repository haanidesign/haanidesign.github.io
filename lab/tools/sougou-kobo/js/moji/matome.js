/* 🎬 まとめて 出る テロップ。文字を 1まいの 絵として まるごと 動かす 出かた。
   （ふるえる・クリッピング・発光・衝撃・ポヨン・ジャンプ・ブラー・EZ スライド など）

   いったん ふつうに 描いた 文字（src）を、時こく t に あわせて
   ずらす・のばす・ぼかす・光らせて 出す。
   d … 出る 長さ（秒）。b … 文字の 箱（中心と 下の はしに つかう）。 */

export const MATOME = [
  ['none', 'なし（1文字ずつの 出かたを つかう）'],
  ['shake', '震える'],
  ['clip', 'クリッピング登場'],
  ['glowIn', '発光登場'],
  ['tsukkomi', 'つっこみ'],
  ['glowWipe', '発光ワイプ'],
  ['glowBlur', '発光ブラー'],
  ['impact1', '衝撃1'],
  ['impact2', '衝撃2'],
  ['wave', '波打ち'],
  ['pika', 'ぴかっと'],
  ['poyon', 'ポヨン'],
  ['yuraFade', 'ゆらフェード'],
  ['tsukkomiSlide', '突っ込み'],
  ['tatePoyo', '縦ポヨ'],
  ['yokoPoyo', '横ポヨ'],
  ['jump2', '2回ジャンプ'],
  ['blackUp', '黒ブラー拡大'],
  ['blackDown', '黒ブラー縮小'],
  ['ezR', '右からEZ'],
  ['ezL', '左からEZ']
];

/* 動画の テロップと 同じ 見た目（白文字・むらさきの 太ふち・こい かげ） */
export const MATOME_LOOK = {
  font: 'M PLUS Rounded 1c', size: 120, spacing: 2, grad: false,
  fill: '#FFFFFF', stroke: '#4B1FA0', strokeW: 18, stroke2: '#22104A', stroke2W: 6,
  shadow: '#22104A', shadowD: 7, glowR: 0, inFx: 'none', inDur: 0.6, stagger: 0,
  hold: 1.6, outFx: 'fade', outDur: 0.3, useOut: true, kazari: 'none', band: 'none', idleFx: 'none',
  posX: 50, posY: 50, sub: ''
};

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const eo = (p) => 1 - Math.pow(1 - p, 3);
const expo = (p) => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
const back = (p) => { const c = 2.2; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
/* ばねの ゆれ（1 → 0 に おさまる） */
const spring = (t, f, z) => Math.exp(-z * t) * Math.cos(f * t);
const rnd = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

/** src を g に、出かた fx で 描く */
export function drawMatome(g, src, fx, t, d, b, W, H){
  d = Math.max(0.05, d || 0.6);
  const p = cl(t / d);
  const cx = b ? b.x + b.w / 2 : W / 2, cy = b ? b.y + b.h / 2 : H / 2;
  const bot = b ? b.y + b.h : H / 2, bw = b ? b.w : W * 0.5, bh = b ? b.h : H * 0.2;
  const one = (o = {}) => {
    g.save();
    g.globalAlpha = o.a == null ? 1 : cl(o.a);
    const ax = o.ax == null ? cx : o.ax, ay = o.ay == null ? cy : o.ay;
    g.translate(ax + (o.dx || 0), ay + (o.dy || 0));
    if(o.rot) g.rotate(o.rot);
    g.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
    g.translate(-ax, -ay);
    if(o.filter) g.filter = o.filter;
    if(o.clip){ g.beginPath(); g.rect(o.clip[0], o.clip[1], o.clip[2], o.clip[3]); g.clip(); }
    g.drawImage(src, 0, 0);
    g.restore();
  };
  /* 文字の かたちだけ 白く（光の かたまり） */
  const white = (o = {}) => one(Object.assign({}, o, { filter: (o.filter ? o.filter + ' ' : '') + 'brightness(0) invert(1)' }));
  const L = b ? b.x - bw * 0.05 : 0, R = b ? b.x + b.w + bw * 0.05 : W;

  switch(fx){
    case 'shake': {
      const f = Math.floor(t * 24), k = bh * 0.035;
      one({ dx: rnd(f, 1) * k, dy: rnd(f, 2) * k, rot: rnd(f, 3) * 0.015 });
      return;
    }
    case 'clip': {
      const x = L + (R - L) * eo(p);
      one({ clip: [0, 0, x, H] });
      return;
    }
    case 'glowIn': {
      const bl = 18 * (1 - p);
      if(p < 1) white({ a: 1 - eo(p), filter: 'blur(' + (6 + bl) + 'px)', sx: 1 + 0.08 * (1 - p), sy: 1 + 0.08 * (1 - p) });
      one({ a: eo(cl(p * 1.4 - 0.2)) });
      return;
    }
    case 'tsukkomi': {
      const s = 1 + 0.6 * (1 - back(p));   // 1.6 → 1（すこし 行きすぎる）
      one({ sx: s, sy: s, rot: (1 - eo(p)) * -0.14, a: cl(p * 4) });
      return;
    }
    case 'glowWipe': {
      const x = L + (R - L) * eo(p);
      one({ clip: [0, 0, x, H] });
      if(p < 1){
        const band = Math.max(20, bw * 0.12);
        white({ clip: [x - band, 0, band, H], filter: 'blur(4px)', a: 0.9 });
        white({ clip: [x - band * 0.3, 0, band * 0.6, H], filter: 'blur(14px)', a: 0.8 });
      }
      return;
    }
    case 'glowBlur': {
      const bl = 22 * (1 - eo(p));
      if(p < 1) white({ a: 1 - p, filter: 'blur(' + (bl + 4) + 'px)' });
      one({ a: cl(p * 1.6), filter: bl > 0.3 ? 'blur(' + bl * 0.5 + 'px)' : '' });
      return;
    }
    case 'impact1': {
      /* うしろに 白い 箱が ばんっと 出て すぐ 消える */
      if(p < 1){
        const s = 1 + 0.25 * eo(p);
        g.save();
        g.globalAlpha = 0.55 * (1 - p);
        g.fillStyle = '#FFFFFF';
        const pw = bw * 1.15 * s, ph = bh * 1.5 * s;
        g.filter = 'blur(6px)';
        g.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
        g.restore();
      }
      const s = p < 0.25 ? 1.35 - 0.35 * eo(p / 0.25) : 1;
      const f = Math.floor(t * 30), k = bh * 0.05 * (1 - p);
      one({ sx: s, sy: s, dx: rnd(f, 4) * k, dy: rnd(f, 5) * k });
      return;
    }
    case 'impact2': {
      /* 大きな 残像が 2まい 文字に すいこまれる */
      for(const [k, a] of [[0.7, 0.25], [0.35, 0.4]]){
        const s = 1 + k * (1 - eo(p));
        if(p < 1) one({ sx: s, sy: s, a: a * (1 - p) });
      }
      one({ a: cl(p * 3) });
      return;
    }
    case 'wave': {
      /* たての 細い 帯ごとに 上下へ ずらす。だんだん おさまる */
      const n = 40, sw = (R - L) / n, A = bh * 0.22 * (1 - eo(p));
      for(let i = 0; i < n; i++){
        const x = L + i * sw;
        const dy = Math.sin(i * 0.45 - t * 14) * A;
        one({ clip: [x, 0, sw + 1, H], dy, a: cl(p * 3) });
      }
      return;
    }
    case 'pika': {
      const s = p < 0.3 ? 0.85 + 0.15 * eo(p / 0.3) : 1;
      one({ sx: s, sy: s, a: cl(p * 4) });
      /* 光の すじが ななめに 走る（文字の 上だけ） */
      const q = cl((t - d * 0.4) / 0.45);
      if(q > 0 && q < 1){
        if(!drawMatome._tmp) drawMatome._tmp = document.createElement('canvas');
        const c = drawMatome._tmp;
        if(c.width !== W || c.height !== H){ c.width = W; c.height = H; }
        const k = c.getContext('2d');
        k.setTransform(1, 0, 0, 1, 0, 0);
        k.clearRect(0, 0, W, H);
        k.drawImage(src, 0, 0);
        k.globalCompositeOperation = 'source-atop';
        const x = L - bw * 0.3 + (R - L + bw * 0.6) * q;
        const gr = k.createLinearGradient(x - bh * 0.6, 0, x + bh * 0.6, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        k.fillStyle = gr;
        k.save(); k.translate(x, cy); k.transform(1, 0, -0.5, 1, 0, 0); k.translate(-x, -cy);
        k.fillRect(x - bh * 0.6, cy - bh, bh * 1.2, bh * 2);
        k.restore();
        k.globalCompositeOperation = 'source-over';
        g.drawImage(c, 0, 0);
        /* きらっ */
        const sx = x + bh * 0.2, sy = cy - bh * 0.35, r = bh * 0.35 * Math.sin(q * Math.PI);
        g.save(); g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.95;
        g.beginPath();
        for(let i = 0; i < 8; i++){ const a = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
        g.closePath(); g.fill(); g.restore();
      }
      return;
    }
    case 'poyon': {
      /* 下を 地面に して、つぶれて のびて おさまる */
      const tt = t * 1.0;
      const k = p < 0.2 ? 0 : spring(tt - d * 0.2, 22, 6);
      const s0 = p < 0.2 ? eo(p / 0.2) : 1;
      one({ ax: cx, ay: bot, sx: s0 * (1 + 0.22 * k), sy: s0 * (1 - 0.22 * k) });
      return;
    }
    case 'yuraFade': {
      const k = spring(t, 9, 3.5);
      one({ a: eo(p), rot: k * 0.12, ax: cx, ay: bot, dy: (1 - eo(p)) * bh * 0.2 });
      return;
    }
    case 'tsukkomiSlide': {
      const e = back(p);
      one({ dx: (1 - e) * W * 0.6, rot: (1 - eo(p)) * 0.18, sx: 1 + 0.2 * (1 - eo(p)), sy: 1 + 0.2 * (1 - eo(p)) });
      return;
    }
    case 'tatePoyo': {
      const k = spring(t, 20, 5);
      const s0 = eo(cl(p * 3));
      one({ ax: cx, ay: bot, sx: s0 * (1 - 0.1 * k), sy: s0 * (1 + 0.3 * k) });
      return;
    }
    case 'yokoPoyo': {
      const k = spring(t, 20, 5);
      const s0 = eo(cl(p * 3));
      one({ sx: s0 * (1 + 0.3 * k), sy: s0 * (1 - 0.1 * k) });
      return;
    }
    case 'jump2': {
      /* ぽん ぽん と 2回 はねる */
      const hop = d / 2;
      let dy = 0;
      if(t < d){ const k = (t % hop) / hop, hgt = t < hop ? 1 : 0.5; dy = -Math.sin(k * Math.PI) * bh * 0.6 * hgt; }
      const sq = t < d ? 0 : spring(t - d, 25, 8) * 0.12;
      one({ ax: cx, ay: bot, dy, sx: 1 + sq, sy: 1 - sq, a: cl(t * 8) });
      return;
    }
    case 'blackUp': {
      const s = 0.6 + 0.4 * eo(p), bl = 16 * (1 - eo(p)), br = eo(p);
      one({ sx: s, sy: s, a: cl(p * 3), filter: 'blur(' + bl + 'px) brightness(' + br.toFixed(3) + ')' });
      return;
    }
    case 'blackDown': {
      const s = 1.6 - 0.6 * eo(p), bl = 16 * (1 - eo(p)), br = eo(p);
      one({ sx: s, sy: s, a: cl(p * 3), filter: 'blur(' + bl + 'px) brightness(' + br.toFixed(3) + ')' });
      return;
    }
    case 'ezR':
    case 'ezL': {
      /* はやく すべりこんで ぴたっと 止まる。動いて いる あいだは ぶれる */
      const dir = fx === 'ezR' ? 1 : -1, dist = W * 0.7;
      const pos = (q) => dir * dist * (1 - expo(cl(q)));
      const x = pos(p), x2 = pos(p - 0.06);
      const sp = Math.abs(x2 - x);
      if(sp > 2){
        const n = 6;
        for(let i = n; i >= 1; i--){
          one({ dx: x + dir * sp * (i / n), a: 0.18, filter: 'blur(' + Math.min(12, sp * 0.05) + 'px)' });
        }
      }
      one({ dx: x, filter: sp > 2 ? 'blur(' + Math.min(6, sp * 0.02) + 'px)' : '' });
      return;
    }
    default:
      one();
  }
}
