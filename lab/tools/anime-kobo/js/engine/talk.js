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

import { S } from '../state.js?v=305';
import { newLayer, newFolder } from './layer.js?v=305';

export const isTalk = (l) => !!l && l.kind === 'talk';

/* セリフ どうしの すきま。
   ・大きく あけると その あいだ 帯が 消えて、1コマ 白く 光る
   ・ぴったり 同じに すると 1コマ 帯が 2まい かさなって 暗く 光る
   どちらも ちらつきに 見える ので、
   「前の おわり ＝ その 時こく まで 出す」
   「つぎの はじまり ＝ ほんの わずか あと」に して、
   どの コマにも かならず 1まいだけ 出る ように する。 */
const EPS = 0.0005;

/**
 * 時間が かさなって いる ほかの セリフ枠を さがす。
 * かさなると 帯が 2まい 重なって、そこだけ 暗く ちらつく。
 */
export function overlapping(project, l){
  const a0 = talkStart(l), a1 = talkOut(l);
  return (project.layers || []).filter(x => {
    if(x === l || !isTalk(x) || x.visible === false) return false;
    const b0 = talkStart(x), b1 = talkOut(x);
    return a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
  });
}

/** かさなりを なおす。うしろの ものを ずらして すき間を あける */
export function fixOverlaps(project){
  const ts = (project.layers || []).filter(isTalk)
    .sort((a, b) => talkStart(a) - talkStart(b));
  let moved = 0, prevOut = -1;
  for(const l of ts){
    const from = talkStart(l);
    if(prevOut >= 0 && from < prevOut + EPS){
      l.span = { from: prevOut + EPS, to: null };
      l._tkKey = null;
      moved++;
    }
    /* 自分の おわりは「よいんの おわり」ちょうど */
    const out = talkOut(l);
    if(l.span) l.span.to = out;
    else l.span = { from: talkStart(l), to: out };
    prevOut = out;
  }
  return moved;
}

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
    /* 読みおわる までの 間（よいん）。
       出おわった とたん 切りかわると 読めない。 */
    hold: 1.2,
    blip: true,
    blipEvery: 2,
    blipHz: 880,             // 音の 高さ（大きいほど 高い）
    mouth: null,             // 口を 動かす レイヤーの ばんごう

    /* ---- 吹き出し ----
       shape が 'bubble' の ときだけ つかう。場所は 画面の わりあい。 */
    shape: 'band',           // band … 下の 帯 ／ bubble … 吹き出し
    bKind: 'round',          // round … ふつう ／ shout … さけび ／ think … こころ
    bx: 0.5, by: 0.28,       // 吹き出しの まん中
    bw: 0.62,                // いちばん 広い はば（画面の なんわり）
    tx: 0.5, ty: 0.52,       // しっぽの さき（しゃべって いる 人の 口もと）
    bFill: '#FFFFFF',        // 吹き出しの 中
    bInk: '#1E1C14'          // 線と 字
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

/** 出おわってから しばらく 置いた、消える 時こく */
export function talkOut(l){
  const t = l.talk || talkDefaults();
  const hold = t.hold == null ? 1.2 : t.hold;
  return talkEnd(l) + Math.max(0, hold);
}

/** 文の 長さに 合った よいん（めやす） */
export function niceHold(l){
  const t = l.talk || talkDefaults();
  const n = String(t.text || '').length;
  return Math.round(Math.min(3.5, Math.max(0.8, 0.6 + n * 0.06)) * 10) / 10;
}

/** 「ぽ」を 鳴らす 時こくの ならび */
export function blipTimes(l){
  const t = l.talk || talkDefaults();
  if(!t.blip) return [];
  const n = letters(t.text).length;
  const cps = Math.max(1, t.cps || 20);
  const every = Math.max(1, Math.round(t.blipEvery || 2));
  const hz = t.blipHz || 880;
  const out = [];
  for(let i = 0; i < n; i += every) out.push({ t: talkStart(l) + i / cps, hz });
  return out;
}

/* ---------- 吹き出し ----------
   セリフの ぜんぶを 先に はかって 大きさを きめる。
   出て いる 字だけで はかると、1文字 出る たびに
   吹き出しが ふくらんで ガタガタ する。 */
function wrapLines(g, text, maxW){
  const lines = [];
  for(const para of String(text || '').split('\n')){
    let cur = '';
    for(const ch of para){
      if(cur && g.measureText(cur + ch).width > maxW){ lines.push(cur); cur = ch; }
      else cur += ch;
    }
    lines.push(cur);
  }
  return lines;
}

/** 楕円の ふちの うち、(px,py) の むきに ある 点 */
function rimPoint(cx, cy, rx, ry, px, py){
  const a = Math.atan2((py - cy) / ry, (px - cx) / rx);
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, a };
}

/* 吹き出しの 大きさと 場所。描く ときも、絵の 上で つかむ ときも これを つかう。 */
let _measure = null;
export function bubbleGeom(t, w, h, gIn){
  const g = gIn || (_measure || (_measure = document.createElement('canvas').getContext('2d')));
  const size = Math.round(t.size);
  g.font = size + 'px system-ui, sans-serif';
  /* 字の かたまりの 大きさ（ぜんぶの 字で はかる） */
  const maxW = Math.max(size * 3, w * (t.bw || 0.62) * 0.72);
  const lines = wrapLines(g, t.text, maxW);
  const lineH = size * (t.line || 1.45);
  let tw = 0;
  lines.forEach(s => { tw = Math.max(tw, g.measureText(s).width); });
  tw = Math.max(tw, size * 2);
  const th = Math.max(lineH, lines.length * lineH);
  /* 楕円は 四角を ぴったり つつむ 大きさ（√2 ばい）＋ すこし よゆう */
  const cx = w * (t.bx == null ? 0.5 : t.bx);
  const cy = h * (t.by == null ? 0.28 : t.by);
  const rx = tw / 2 * 1.42 + size * 0.7;
  const ry = th / 2 * 1.42 + size * 0.6;
  const tipX = w * (t.tx == null ? 0.5 : t.tx);
  const tipY = h * (t.ty == null ? 0.52 : t.ty);
  return { size, lines, lineH, th, cx, cy, rx, ry, tipX, tipY };
}

function drawBubble(g, l, t, n, w, h){
  const ink = t.bInk || '#1E1C14';
  const fill = t.bFill || '#FFFFFF';
  const { size, lines, lineH, th, cx, cy, rx, ry, tipX, tipY } = bubbleGeom(t, w, h, g);
  g.font = size + 'px system-ui, sans-serif';
  const lw = Math.max(2, h / 360);
  const tail = Math.hypot(tipX - cx, tipY - cy) > Math.min(rx, ry) * 1.05;

  g.lineJoin = 'round';
  g.lineCap = 'round';
  const kind = t.bKind || 'round';

  /* からだの 形を 道に する（ぬる・ふちどる の どちらでも つかう） */
  const bodyPath = () => {
    if(kind === 'shout'){
      /* さけび。とげとげ。とげの 数は 大きさで きめる */
      const spikes = Math.max(14, Math.round((rx + ry) / (size * 0.9)));
      for(let i = 0; i <= spikes * 2; i++){
        const a = i / (spikes * 2) * Math.PI * 2;
        const k = i % 2 === 0 ? 1.18 : 0.94;
        const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    } else if(kind === 'think'){
      /* こころの 声。もこもこ の くも */
      const bumps = Math.max(9, Math.round((rx + ry) / (size * 1.3)));
      for(let i = 0; i < bumps; i++){
        const a0 = i / bumps * Math.PI * 2, a1 = (i + 1) / bumps * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * rx, y0 = cy + Math.sin(a0) * ry;
        const x1 = cx + Math.cos(a1) * rx, y1 = cy + Math.sin(a1) * ry;
        const am = (a0 + a1) / 2;
        if(i === 0) g.moveTo(x0, y0);
        g.quadraticCurveTo(cx + Math.cos(am) * rx * 1.22, cy + Math.sin(am) * ry * 1.22, x1, y1);
      }
      g.closePath();
    } else {
      g.moveTo(cx + rx, cy);
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
  };

  /* しっぽ。ねもとは からだの 内がわに うめて おく
     （あとで からだを ぬると、ねもとが きれいに かくれる） */
  const tailPath = () => {
    const rim = rimPoint(cx, cy, rx * 0.72, ry * 0.72, tipX, tipY);
    const len = Math.hypot(tipX - rim.x, tipY - rim.y) || 1;
    const half = Math.min(rx, ry) * 0.26;
    const nx = -(tipY - rim.y) / len, ny = (tipX - rim.x) / len;
    const mx = (rim.x + tipX) / 2, my = (rim.y + tipY) / 2;
    g.moveTo(rim.x + nx * half, rim.y + ny * half);
    /* すこし そらせる と マンガらしい */
    g.quadraticCurveTo(mx + nx * half * 0.35, my + ny * half * 0.35, tipX, tipY);
    g.quadraticCurveTo(mx - nx * half * 0.15, my - ny * half * 0.15,
                       rim.x - nx * half, rim.y - ny * half);
    g.closePath();
  };
  const withTail = tail && kind !== 'think';

  /* ① ふちを 2ばいの 太さで 引く
     ② その 上から 中の 色で ぬる
     ―― こう すると、からだと しっぽが かさなる ところの 線は ぬりで かくれ、
        そとがわの ふちだけが ちょうど 1ばいの 太さで のこる。 */
  g.strokeStyle = ink;
  g.lineWidth = lw * 2;
  g.beginPath(); bodyPath(); g.stroke();
  if(withTail){ g.beginPath(); tailPath(); g.stroke(); }

  g.fillStyle = fill;
  g.beginPath(); bodyPath(); g.fill();
  if(withTail){ g.beginPath(); tailPath(); g.fill(); }

  /* こころの 声の しっぽは ちいさな まる 3つ。
     ふちの すぐ そとから、口もとに むかって だんだん 小さく */
  if(tail && kind === 'think'){
    const rim = rimPoint(cx, cy, rx * 1.12, ry * 1.12, tipX, tipY);
    g.lineWidth = lw;
    for(let i = 0; i < 3; i++){
      const u = (i + 0.6) / 3.4;
      const x = rim.x + (tipX - rim.x) * u, y = rim.y + (tipY - rim.y) * u;
      const r = Math.max(4, size * (0.5 - i * 0.13));
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      g.strokeStyle = ink; g.stroke();
    }
  }

  /* --- 字（出て いる ぶんだけ）。まん中 そろえ --- */
  g.fillStyle = ink;
  g.textBaseline = 'top';
  let left = n;
  let y = cy - th / 2 + (lineH - size) / 2;
  for(const s of lines){
    if(left <= 0) break;
    const part = [...s].slice(0, left).join('');
    const full = g.measureText(s).width;
    g.fillText(part, cx - full / 2, y);
    left -= [...s].length;
    y += lineH;
  }
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
               t.bg, t.bgAlpha, t.fg, t.box ? 1 : 0, w, h,
               t.shape, t.bKind, t.bx, t.by, t.bw, t.tx, t.ty, t.bFill, t.bInk].join('|');
  if(l._tkKey === key) return l._tkC;
  l._tkKey = key;

  const g = l._tkC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);

  if(t.shape === 'bubble'){
    drawBubble(g, l, t, n, w, h);
    return l._tkC;
  }

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

/* ---------- セリフは 1つの フォルダに まとめる ----------
   セリフ枠は 何十 まいにも なる。そのまま 出すと レイヤーの ならびが
   セリフ だらけに なって、絵の レイヤーが 見つからなく なる。
   なので 足す たびに「セリフ」フォルダの 中に 入れる。
   フォルダは たためる ので、ふだんは 1行に おさまる。

   フォルダ ごと はりつけ（noCam）に して ある ので、
   カメラが ゆれても セリフは 画面に とまった まま。 */
function talkFolder(near){
  /* もとに する セリフが すでに フォルダの 中なら、そこに そろえる */
  if(near && near.parent){
    const p = S.proj.layers.find(x => x.id === near.parent);
    if(p && p.kind === 'folder') return p;
  }
  const has = S.proj.layers.find(x => x.kind === 'folder' && x.talkBox);
  if(has) return has;
  /* まだ 無い。作って、そとに 出て いる セリフを まとめて 入れる */
  const f = newFolder('セリフ');
  f.talkBox = true;
  f.noCam = true;
  const loose = S.proj.layers.filter(x => x.kind === 'talk' && !x.parent);
  const at = loose.length ? S.proj.layers.indexOf(loose[0]) : 0;
  S.proj.layers.splice(at, 0, f);
  loose.forEach(x => { x.parent = f.id; });
  return f;
}

/** フォルダの いちばん うしろ（＝ならびの 下）に 入れる */
function putInFolder(f, l){
  l.parent = f.id;
  const mem = S.proj.layers.filter(x => x.parent === f.id && x !== l);
  const at = mem.length ? S.proj.layers.indexOf(mem[mem.length - 1]) + 1
                        : S.proj.layers.indexOf(f) + 1;
  S.proj.layers.splice(at, 0, l);
}

/**
 * つぎの セリフを 足す。
 * いまの セリフの すぐ あとから はじまる ように して、
 * 見た目（帯の 色・大きさ・はやさ・音）は そっくり 引きつぐ。
 */
export function addNextTalk(l){
  const t = l.talk || talkDefaults();
  const nx = newLayer('セリフ', []);
  nx.kind = 'talk';
  nx.talk = Object.assign({}, t, { text: '' });
  nx.noCam = true;
  // 「セリフ」フォルダの 中に そろえて 入れる（下で putInFolder）
  nx.pw = l.pw; nx.ph = l.ph;
  nx.x = l.x; nx.y = l.y;
  nx.scaleX = l.scaleX; nx.scaleY = l.scaleY; nx.rot = l.rot;
  /* いまの セリフは「言いおわる まで」、つぎは その あとから。
     こう して おくと、2つが かさなって 2まい 出る ことが ない。 */
  /* 読みおわる 間（よいん）を おいてから 次に する。
     出おわった とたん 切りかわると 読めない。

     ここで 1コマ ぶん すき間を あける のが だいじ。
     ぴったり くっつけると、その 時こくに 当たった 1コマ だけ
     2まいの 帯が かさなって 出て、そこだけ 暗く 光る
     （実測: 帯の 明るさ 75 → 43 の 1コマ ちらつき）。 */
  const out = talkOut(l);
  l.span = { from: talkStart(l), to: out };
  nx.span = { from: out + EPS, to: null };
  putInFolder(talkFolder(l), nx);
  S.sel = nx.id;
  return nx;
}

/** セリフ枠を 1つ つくる。いちばん 手前に 置く */
export function addTalkLayer(name){
  const l = newLayer(name || 'セリフ', []);
  l.kind = 'talk';
  l.talk = talkDefaults(S.proj);
  /* セリフ枠は 画面に はりつけ。カメラが ゆれても いっしょに
     ゆれると 読みにくい（はじめから この ほうが よい）。 */
  l.noCam = true;
  l.pw = S.proj.w; l.ph = S.proj.h;
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  /* セリフは ならびが すぐ 長く なる ので、いつも
     「セリフ」フォルダの 中に 入れる（無ければ 作る）。 */
  const cur = S.proj.layers.find(x => x.id === S.sel);
  const near = (cur && cur.kind === 'talk') ? cur : null;
  if(near){
    l.x = near.x; l.y = near.y;
    l.scaleX = near.scaleX; l.scaleY = near.scaleY; l.rot = near.rot;
    l.talk = Object.assign({}, near.talk || l.talk, { text: '' });
  }
  putInFolder(talkFolder(near), l);
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

  /* どの コマが とじた口／あけた口 かは、口の レイヤーが おぼえて いる
     （「表情」の 口パクと 同じ ところを 見る）。
       あけた口を きめて ある … その 2まいだけで パクパク する
       きめて いない       … とじた口 いがいを 順ぐりに つかう */
  const mt = target.talk || {};
  const closed = Math.max(0, Math.min(nf - 1, mt.closed == null ? 0 : mt.closed));
  const open = (mt.open == null || mt.open === closed) ? null
             : Math.max(0, Math.min(nf - 1, mt.open));

  let ladder;
  if(open !== null){
    ladder = [closed, open];
  } else {
    const opens = [];
    for(let i = 0; i < nf; i++) if(i !== closed) opens.push(i);
    /* 行って 帰って（0,1,2,1,0…）。口が 2まいの ときは そのまま 交ごに なる */
    ladder = [closed, ...opens, ...opens.slice(0, -1).reverse()];
  }

  let k = 0, put = 0;
  for(let i = 0; i < n; i += every){
    setPin(target, 'frame', s + i / cps, ladder[k % ladder.length], 'hold');
    k++; put++;
  }
  setPin(target, 'frame', s + n / cps, closed, 'hold');   // さいごは 口を とじる
  return put + 1;
}
