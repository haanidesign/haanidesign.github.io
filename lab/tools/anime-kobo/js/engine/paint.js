/* お絵かき（ペン・けしゴム）と、書いた 順に 出てくる アニメ。

   絵は「ドットの かたまり」では なく「線の ならび」で おぼえる。
     ・あとから 太さや 色を 変えられる
     ・書いた 順が のこるので、その順に 出す ことが できる
     ・ほぞんが 軽い（写真のように 重くならない）

   書いた順に 出す（情熱大陸の 名前みたいなの）
     ぜんぶの 線の 長さを たして、その 何わりまで 描くかを
     時間で きめる。とちゅうの 線は そこまでで 切る。
     ＝ 見ている 人には「いま 書いている」ように 見える。 */

import { EASES, curveAt } from './anim.js?v=82';

/** ひとふで 分 */
export function newStroke(color, width, erase){
  return {
    color: color || '#1E1C14',
    width: Math.max(1, width || 12),
    erase: !!erase,
    pts: []                      // [{x,y}] レイヤーの 中の ざひょう
  };
}

/** ひとふでの 長さ */
export function strokeLen(s){
  let d = 0;
  const p = s.pts;
  for(let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i-1].x, p[i].y - p[i-1].y);
  // 点が 1つだけ（ちょん と おいた）ときも 長さを もたせる
  return p.length === 1 ? s.width : d;
}

/** ぜんぶの 長さ */
export function totalLen(strokes){
  let d = 0;
  for(const s of (strokes || [])) d += strokeLen(s);
  return d;
}

/* ---------- 描く ---------- */
function drawStroke(g, s, upTo){
  const p = s.pts;
  if(!p.length) return;

  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = s.width;
  if(s.erase){
    // けしゴム … 下の ドットを けずる
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = '#000';
  } else {
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = s.color;
  }

  if(p.length === 1){
    // ちょん と おいた ところは まる
    g.beginPath();
    g.arc(p[0].x, p[0].y, s.width / 2, 0, Math.PI * 2);
    g.fillStyle = s.erase ? '#000' : s.color;
    g.fill();
    g.restore();
    return;
  }

  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  let run = 0;
  for(let i = 1; i < p.length; i++){
    const seg = Math.hypot(p[i].x - p[i-1].x, p[i].y - p[i-1].y);
    if(upTo != null && run + seg > upTo){
      // とちゅうで 切る（いま 書いている ところ）
      const k = seg ? (upTo - run) / seg : 0;
      g.lineTo(p[i-1].x + (p[i].x - p[i-1].x) * k,
               p[i-1].y + (p[i].y - p[i-1].y) * k);
      run = upTo;
      break;
    }
    g.lineTo(p[i].x, p[i].y);
    run += seg;
  }
  g.stroke();
  g.restore();
}

/**
 * 線の ならびを 紙に 描く。
 *   upTo … ぜんたいで ここまでの 長さ だけ 描く（null なら ぜんぶ）
 */
export function rasterize(cv, strokes, upTo){
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  let left = upTo == null ? Infinity : upTo;
  for(const s of (strokes || [])){
    if(left <= 0) break;
    const len = strokeLen(s);
    drawStroke(g, s, left >= len ? null : left);
    left -= len;
  }
  return cv;
}

/* ---------- 書いた順に 出す ---------- */
/** はじめの ぐあい */
export function newReveal(){
  return { on: true, start: 0, dur: 2, ease: 'linear' };
}

/** その時こくで「何わりまで 書けているか」（0〜1） */
export function revealAt(rev, time){
  if(!rev || !rev.on) return 1;
  const dur = Math.max(0.05, rev.dur || 1);
  const u = (time - (rev.start || 0)) / dur;
  if(u <= 0) return 0;
  if(u >= 1) return 1;
  if(rev.ease === 'custom' && rev.shape && rev.shape.length > 1) return curveAt(rev.shape, u);
  const f = EASES[rev.ease] || EASES.linear;
  return Math.max(0, Math.min(1, f(u)));
}

/**
 * レイヤーの 紙を いまの 時こくに あわせて 描き直す。
 * 変わっていない ときは 何も しない（毎コマ 描き直すと 重い）。
 * 戻り値 … 紙（canvas）
 */
export function paintCanvas(l, time){
  const w = Math.max(1, l.pw || 1), h = Math.max(1, l.ph || 1);
  if(!l._pc || l._pc.width !== w || l._pc.height !== h){
    l._pc = document.createElement('canvas');
    l._pc.width = w; l._pc.height = h;
    /* 絵ではなく 紙だが、絵と 同じように あつかえるように しておく
       （c2d は img.complete / naturalWidth を 見る） */
    l._pc.complete = true;
    l._pc.naturalWidth = w;
    l._pc.naturalHeight = h;
    l._pkey = null;
  }

  if(l.kind === 'solid'){
    const key = 'S' + l.color;
    if(l._pkey !== key){
      const g = l._pc.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = l.color || '#F2A0B8';
      g.fillRect(0, 0, w, h);
      l._pkey = key;
    }
    return l._pc;
  }

  const total = totalLen(l.strokes);
  const p = revealAt(l.reveal, time);
  const upTo = (l.reveal && l.reveal.on) ? total * p : null;
  /* 描き直すかどうかの 目じるし。
     ふでの 数・ぜんたいの 長さ・どこまで 書けたか が 同じなら そのまま。
     長さは 0.5ドット きざみで 見る（こまかすぎると 毎コマ 描き直しに なる）。 */
  const key = (l.strokes || []).length + ':' + total.toFixed(1) + ':' +
    (upTo == null ? 'all' : Math.round(upTo * 2));
  if(l._pkey !== key){
    rasterize(l._pc, l.strokes, upTo);
    l._pkey = key;
  }
  return l._pc;
}

/** 描き直しを もう一度 させる（線を 足した あとなどに よぶ） */
export const paintDirty = (l) => { if(l) l._pkey = null; };
