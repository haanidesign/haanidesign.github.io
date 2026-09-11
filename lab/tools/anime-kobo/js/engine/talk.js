/* 💬 セリフ枠（恋愛ゲームの あの 画面）。

   下に 黒い 帯を 出して、名前と セリフを 1文字ずつ 出す。
   出る たびに「ぽ」と 鳴らし、しゃべって いる あいだ だけ
   キャラの 口を 動かす。

   なぜ レイヤーに するか
     文字レイヤーは「絵」に して しまう ので、1文字ずつ 出せない。
     セリフは 時こくで 見た目が 変わる ので、
     おえかき・ぐるり360・部屋 と 同じで
     「毎コマ その場で 紙に 描く」やり方に する。

   しゃべり はじめは その レイヤーの「出す ところ」の あたま。
   きめて いなければ 0秒から。 */

import { S } from '../state.js?v=213';
import { newLayer } from './layer.js?v=213';

export const isTalk = (l) => !!l && l.kind === 'talk';

export function talkDefaults(project){
  const P = project || S.proj;
  return {
    /* はじめは 空。見本の 文が 入って いると、
       かならず いちど 消してから でないと 書けない。 */
    text: '',
    who: '',
    cps: 20,                 // 1秒に 何文字
    box: true,
    bg: '#1E1C14',
    bgAlpha: 0.82,
    fg: '#FFFEF7',
    size: Math.round(P.h / 26),
    pad: Math.round(P.w / 26),
    line: 1.55,
    hRatio: 0.3,             // 帯の たかさ（画面の なんわり）
    blip: true,
    blipEvery: 2,
    mouth: null              // 口を 動かす レイヤーの ばんごう
  };
}

/** しゃべり はじめの 時こく */
export function talkStart(l){
  return (l.span && l.span.from != null) ? l.span.from : 0;
}

/** 出す 文字の かず（改行は 数えない） */
export function shownCount(l, time){
  const t = l.talk || (l.talk = talkDefaults());
  const cps = Math.max(1, t.cps || 20);
  const n = Math.floor(Math.max(0, (time - talkStart(l))) * cps);
  return Math.min(letters(t.text).length, n);
}

/** 改行を のぞいた 文字の ならび（数を かぞえる ため） */
function letters(text){
  return String(text || '').replace(/\n/g, '');
}

/** ぜんぶ 出おわる 時こく */
export function talkEnd(l){
  const t = l.talk || talkDefaults();
  return talkStart(l) + letters(t.text).length / Math.max(1, t.cps || 20);
}

/** 「ぽ」を 鳴らす 時こくの ならび */
export function blipTimes(l){
  const t = l.talk || talkDefaults();
  if(!t.blip) return [];
  const n = letters(t.text).length;
  const cps = Math.max(1, t.cps || 20);
  const every = Math.max(1, Math.round(t.blipEvery || 2));
  const out = [];
  for(let i = 0; i < n; i += every) out.push(talkStart(l) + i / cps);
  return out;
}

/**
 * いまの 時こくの セリフ枠を 1まいに 描いて かえす。
 */
export function talkCanvas(l, time, project){
  const P = project || S.proj;
  const w = Math.max(1, P.w), h = Math.max(1, P.h);
  if(!l._tkC || l._tkC.width !== w || l._tkC.height !== h){
    l._tkC = document.createElement('canvas');
    l._tkC.width = w; l._tkC.height = h;
    l._tkC.complete = true;
    l._tkC.naturalWidth = w; l._tkC.naturalHeight = h;
    l._tkKey = null;
  }
  const t = l.talk || (l.talk = talkDefaults(P));
  const n = shownCount(l, time);
  const key = [n, t.text, t.who, t.size, t.pad, t.line, t.hRatio,
               t.bg, t.bgAlpha, t.fg, t.box ? 1 : 0, w, h].join('|');
  if(l._tkKey === key) return l._tkC;
  l._tkKey = key;

  const g = l._tkC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);

  const bh = Math.max(60, Math.round(h * (t.hRatio || 0.3)));
  const by = h - bh;
  const pad = t.pad;

  if(t.box){
    /* 帯。かどを まるく して、うすい ふちを つける。 */
    const r = Math.min(40, bh * 0.16);
    const x0 = pad * 0.6, x1 = w - pad * 0.6, y0 = by, y1 = h - pad * 0.5;
    g.beginPath();
    g.moveTo(x0 + r, y0);
    g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r);
    g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1);
    g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r);
    g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0);
    g.closePath();
    g.globalAlpha = Math.max(0, Math.min(1, t.bgAlpha == null ? 0.82 : t.bgAlpha));
    g.fillStyle = t.bg || '#1E1C14';
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = Math.max(2, h / 400);
    g.strokeStyle = t.fg || '#FFFEF7';
    g.stroke();

    /* 名前の ふだ。帯の 左上に すこし はみ出して 置く。 */
    if(t.who){
      g.font = '600 ' + Math.round(t.size * 0.92) + 'px system-ui, sans-serif';
      const tw = g.measureText(t.who).width;
      const nh = Math.round(t.size * 1.6);
      const nx = x0 + pad * 0.5, ny = y0 - nh * 0.62;
      const nr = nh * 0.34;
      g.beginPath();
      g.moveTo(nx + nr, ny);
      g.lineTo(nx + tw + pad - nr, ny);
      g.quadraticCurveTo(nx + tw + pad, ny, nx + tw + pad, ny + nr);
      g.lineTo(nx + tw + pad, ny + nh - nr);
      g.quadraticCurveTo(nx + tw + pad, ny + nh, nx + tw + pad - nr, ny + nh);
      g.lineTo(nx + nr, ny + nh);
      g.quadraticCurveTo(nx, ny + nh, nx, ny + nh - nr);
      g.lineTo(nx, ny + nr);
      g.quadraticCurveTo(nx, ny, nx + nr, ny);
      g.closePath();
      g.fillStyle = t.fg || '#FFFEF7';
      g.fill();
      g.fillStyle = t.bg || '#1E1C14';
      g.textBaseline = 'middle';
      g.fillText(t.who, nx + pad / 2, ny + nh / 2);
    }
  }

  /* セリフ。出す ぶんだけ。改行は そのまま 改行。 */
  g.font = Math.round(t.size) + 'px system-ui, sans-serif';
  g.textBaseline = 'top';
  g.fillStyle = t.box ? (t.fg || '#FFFEF7') : (t.bg || '#1E1C14');
  const lineH = t.size * (t.line || 1.55);
  let left = n;
  /* 名前の ふだは 帯の 上に すこし かかる ので、
     その ぶん セリフの はじまりを 下げる（かぶらない ように）。 */
  let x = pad, y = by + pad * 0.8 + (t.who ? t.size * 0.55 : 0);
  const maxX = w - pad;
  for(const ch of String(t.text || '')){
    if(ch === '\n'){ x = pad; y += lineH; continue; }
    if(left <= 0) break;
    const cw = g.measureText(ch).width;
    if(x + cw > maxX){ x = pad; y += lineH; }
    g.fillText(ch, x, y);
    x += cw;
    left--;
  }

  return l._tkC;
}

/** セリフ枠を 1つ つくる。いちばん 手前に 置く */
export function addTalkLayer(name){
  const l = newLayer(name || 'セリフ', []);
  l.kind = 'talk';
  l.talk = talkDefaults(S.proj);
  l.pw = S.proj.w; l.ph = S.proj.h;
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  S.proj.layers.unshift(l);
  S.sel = l.id;
  return l;
}

/**
 * しゃべって いる あいだ 口を 動かす ピンを うつ。
 *   target … 口の コマを 持つ レイヤー（2コマ いじょう）
 * 口が 2コマなら 閉→開→閉…、3コマ いじょうなら 0→1→2→1… と 回す。
 */
export function talkMouthKeys(l, target, setPin){
  const t = l.talk || talkDefaults();
  const n = String(t.text || '').replace(/\n/g, '').length;
  if(!n || !target || !target.frames || target.frames.length < 2) return 0;
  const cps = Math.max(1, t.cps || 20);
  const s = talkStart(l);
  const nf = target.frames.length;
  const every = Math.max(1, Math.round(t.blipEvery || 2));
  let k = 0, put = 0;
  for(let i = 0; i < n; i += every){
    const frame = nf === 2 ? (k % 2) : (k % (nf * 2 - 2) < nf ? k % nf : nf - 2 - (k % (nf * 2 - 2) - nf));
    setPin(target, 'frame', s + i / cps, Math.max(0, Math.min(nf - 1, frame)), 'hold');
    k++; put++;
  }
  setPin(target, 'frame', s + n / cps, 0, 'hold');       // さいごは 口を とじる
  return put + 1;
}
