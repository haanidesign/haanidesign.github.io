/* キャラの 素体を 描く。
   もとは コマ割り表（koma-wari）の ミニキャラ・頭身あり。
   ここでは 髪がた・髪の 色・マスコット（まるい 着ぐるみ）・たおれ を 足した。

   座標
     ミニキャラ … 頭の てっぺん y=0、足もと y=1、体の 中心 x=0
     頭身あり   … 同じ。頭は 小さく のる
     マスコット … 同じ。まるい 体が 1つ */

export const N = v => Math.round(v * 1000) / 1000;

/* ---------- 顔の 部品 ---------- */
function eye(kind, s, x, y, ink) {
  const X = x * s;
  switch (kind) {
    case 'round': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".072" ry=".090" fill="${ink}"/><ellipse cx="${N(X + .022 * s)}" cy="${N(y - .030)}" rx=".026" ry=".030" fill="#fff"/>`;
    case 'big': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".090" ry=".110" fill="#fff" stroke="${ink}" stroke-width=".022"/><ellipse cx="${N(X)}" cy="${N(y + .008)}" rx=".055" ry=".070" fill="${ink}"/><circle cx="${N(X + .024 * s)}" cy="${N(y - .034)}" r=".024" fill="#fff"/>`;
    case 'happy': return `<path d="M${N(X - .072)} ${N(y + .020)} Q${N(X)} ${N(y - .070)} ${N(X + .072)} ${N(y + .020)}" fill="none" stroke="${ink}" stroke-width=".030" stroke-linecap="round"/>`;
    case 'gt': return `<path d="M${N(X - .060 * s)} ${N(y - .055)} L${N(X + .055 * s)} ${N(y)} L${N(X - .060 * s)} ${N(y + .055)}" fill="none" stroke="${ink}" stroke-width=".030" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'jito': return `<path d="M${N(X - .080)} ${N(y - .030)} H${N(X + .080)}" stroke="${ink}" stroke-width=".034" stroke-linecap="round"/><ellipse cx="${N(X)}" cy="${N(y + .030)}" rx=".046" ry=".046" fill="${ink}"/>`;
    case 'sanpaku': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".085" ry=".070" fill="#fff" stroke="${ink}" stroke-width=".024"/><circle cx="${N(X)}" cy="${N(y - .012)}" r=".030" fill="${ink}"/><path d="M${N(X - .095 * s)} ${N(y - .075)} L${N(X + .085 * s)} ${N(y - .045)}" stroke="${ink}" stroke-width=".030" stroke-linecap="round"/>`;
    case 'flatline': return `<path d="M${N(X - .075)} ${N(y)} H${N(X + .075)}" stroke="${ink}" stroke-width=".034" stroke-linecap="round"/>`;
    case 'star': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".085" ry=".100" fill="${ink}"/><path d="M${N(X)} ${N(y - .080)} L${N(X + .026)} ${N(y - .020)} L${N(X + .082)} ${N(y)} L${N(X + .026)} ${N(y + .022)} L${N(X)} ${N(y + .080)} L${N(X - .026)} ${N(y + .022)} L${N(X - .082)} ${N(y)} L${N(X - .026)} ${N(y - .020)} Z" fill="#fff"/>`;
    case 'cry': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".082" ry=".100" fill="${ink}"/><ellipse cx="${N(X)}" cy="${N(y - .020)}" rx=".040" ry=".046" fill="#fff"/><path d="M${N(X)} ${N(y + .10)} q${N(-.02 * s)} .10 .01 .17" stroke="#7FB6E0" stroke-width=".030" fill="none" stroke-linecap="round"/>`;
    case 'angry': return `<path d="M${N(X - .085 * s)} ${N(y - .055)} L${N(X + .070 * s)} ${N(y - .005)}" stroke="${ink}" stroke-width=".036" stroke-linecap="round"/><ellipse cx="${N(X + .005 * s)}" cy="${N(y + .035)}" rx=".050" ry=".052" fill="${ink}"/>`;
    case 'dead': return `<path d="M${N(X - .055)} ${N(y - .055)} L${N(X + .055)} ${N(y + .055)} M${N(X + .055)} ${N(y - .055)} L${N(X - .055)} ${N(y + .055)}" stroke="${ink}" stroke-width=".032" stroke-linecap="round"/>`;
    case 'heart': return `<path d="M${N(X)} ${N(y + .075)} C${N(X - .11)} ${N(y - .010)} ${N(X - .048)} ${N(y - .095)} ${N(X)} ${N(y - .030)} C${N(X + .048)} ${N(y - .095)} ${N(X + .11)} ${N(y - .010)} ${N(X)} ${N(y + .075)} Z" fill="#E4586A"/>`;
    case 'wide': return `<ellipse cx="${N(X)}" cy="${N(y)}" rx=".095" ry=".115" fill="#fff" stroke="${ink}" stroke-width=".024"/><circle cx="${N(X)}" cy="${N(y)}" r=".030" fill="${ink}"/>`;
    case 'shut': return `<path d="M${N(X - .072)} ${N(y - .010)} Q${N(X)} ${N(y + .060)} ${N(X + .072)} ${N(y - .010)}" fill="none" stroke="${ink}" stroke-width=".030" stroke-linecap="round"/>`;
    case 'wink': return s > 0 ? eye('happy', 1, x, y, ink) : eye('round', -1, x, y, ink);
    default: return eye('round', s, x, y, ink);
  }
}
function mouth(kind, y, ink) {
  switch (kind) {
    case 'smile': return `<path d="M-.055 ${N(y)} Q0 ${N(y + .060)} .055 ${N(y)}" fill="none" stroke="${ink}" stroke-width=".026" stroke-linecap="round"/>`;
    case 'open': return `<ellipse cx="0" cy="${N(y + .020)}" rx=".060" ry=".070" fill="${ink}"/><ellipse cx="0" cy="${N(y + .045)}" rx=".030" ry=".026" fill="#E4586A"/>`;
    case 'yell': return `<path d="M-.085 ${N(y - .020)} Q0 ${N(y + .150)} .085 ${N(y - .020)} Q0 ${N(y + .030)} -.085 ${N(y - .020)} Z" fill="${ink}"/>`;
    case 'tri': return `<path d="M-.045 ${N(y + .040)} L0 ${N(y - .020)} L.045 ${N(y + .040)} Z" fill="none" stroke="${ink}" stroke-width=".024" stroke-linejoin="round"/>`;
    case 'flat': return `<path d="M-.048 ${N(y + .010)} H.048" stroke="${ink}" stroke-width=".026" stroke-linecap="round"/>`;
    case 'hecchi': return `<path d="M-.055 ${N(y + .030)} L0 ${N(y - .005)} L.055 ${N(y + .030)}" fill="none" stroke="${ink}" stroke-width=".026" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'wave': return `<path d="M-.070 ${N(y + .010)} q.035 -.045 .070 0 q.035 .045 .070 0" fill="none" stroke="${ink}" stroke-width=".024" stroke-linecap="round"/>`;
    case 'fang': return `<path d="M-.065 ${N(y - .010)} Q0 ${N(y + .075)} .065 ${N(y - .010)} Z" fill="${ink}"/><path d="M-.020 ${N(y + .008)} L-.002 ${N(y + .048)} L.018 ${N(y + .008)} Z" fill="#fff"/>`;
    case 'sad': return `<path d="M-.055 ${N(y + .045)} Q0 ${N(y - .020)} .055 ${N(y + .045)}" fill="none" stroke="${ink}" stroke-width=".026" stroke-linecap="round"/>`;
    case 'kiss': return `<ellipse cx="0" cy="${N(y + .015)}" rx=".030" ry=".038" fill="none" stroke="${ink}" stroke-width=".024"/>`;
    default: return '';
  }
}
function brow(kind, y, ink) {
  if (kind === 'none') return '';
  const one = s => {
    const x = .155 * s;
    switch (kind) {
      case 'up': return `<path d="M${N(x - .070 * s)} ${N(y + .020)} L${N(x + .060 * s)} ${N(y - .020)}" stroke="${ink}" stroke-width=".030" stroke-linecap="round"/>`;
      case 'down': return `<path d="M${N(x - .070 * s)} ${N(y - .020)} L${N(x + .060 * s)} ${N(y + .030)}" stroke="${ink}" stroke-width=".030" stroke-linecap="round"/>`;
      case 'flat': return `<path d="M${N(x - .065 * s)} ${N(y)} H${N(x + .060 * s)}" stroke="${ink}" stroke-width=".028" stroke-linecap="round"/>`;
      case 'sad': return `<path d="M${N(x - .070 * s)} ${N(y + .030)} Q${N(x)} ${N(y - .020)} ${N(x + .060 * s)} ${N(y + .005)}" fill="none" stroke="${ink}" stroke-width=".028" stroke-linecap="round"/>`;
    }
    return '';
  };
  return one(-1) + one(1);
}
function fxMark(kind, ink) {
  switch (kind) {
    case 'sweat': return `<path d="M.335 -.02 q-.060 .085 -.014 .128 q.052 .042 .082 -.022 q.022 -.050 -.068 -.106 Z" fill="#8FC7E8" stroke="${ink}" stroke-width=".016"/>`;
    case 'anger': return `<g stroke="#E4586A" stroke-width=".032" fill="none" stroke-linecap="round"><path d="M.29 -.31 l.095 .085 M.385 -.31 l-.095 .085 M.338 -.335 v.135"/></g>`;
    case 'heart': return `<path d="M.345 -.20 c-.055 -.075 -.140 -.020 -.098 .052 l.098 .112 .098 -.112 c.042 -.072 -.043 -.127 -.098 -.052 Z" fill="#E4586A"/>`;
    case 'spark': return `<g fill="#E1DD60" stroke="${ink}" stroke-width=".014"><path d="M.345 -.28 l.032 .080 .084 .030 -.084 .030 -.032 .080 -.032 -.080 -.084 -.030 .084 -.030 Z"/><path d="M-.345 -.16 l.024 .056 .060 .022 -.060 .022 -.024 .056 -.024 -.056 -.060 -.022 .060 -.022 Z"/></g>`;
    case 'note': return `<g fill="${ink}"><ellipse cx=".330" cy="-.155" rx=".042" ry=".032" transform="rotate(-20 .33 -.155)"/><path d="M.367 -.162 V-.30 L.445 -.275 V-.25 L.380 -.272 V-.16 Z"/></g>`;
    case 'quest': return `<text x=".30" y="-.17" font-family="sans-serif" font-size=".26" font-weight="800" fill="${ink}">?</text>`;
    case 'excl': return `<text x=".31" y="-.17" font-family="sans-serif" font-size=".28" font-weight="800" fill="#E4586A">!</text>`;
    case 'lines': return `<g stroke="${ink}" stroke-width=".018" opacity=".65"><path d="M.30 -.30 v.11 M.365 -.33 v.14 M.43 -.30 v.11"/></g>`;
    case 'blush': return `<g stroke="#E4586A" stroke-width=".016" stroke-linecap="round"><path d="M-.24 .07 l.03 -.04 M-.20 .07 l.03 -.04 M-.16 .07 l.03 -.04 M.13 .07 l.03 -.04 M.17 .07 l.03 -.04 M.21 .07 l.03 -.04"/></g>`;
    case 'gloom': return `<g stroke="${ink}" stroke-width=".016" opacity=".5"><path d="M-.20 -.32 v.16 M-.10 -.34 v.14 M0 -.35 v.13 M.10 -.34 v.14 M.20 -.32 v.16"/></g>`;
    default: return '';
  }
}

/* 顔の くみあわせ。名前で もつ（ならびが かわっても こわれない） */
export const EXPR = [
  { n: 'ふつう', e: 'round', m: 'smile', b: 'flat', f: '' },
  { n: 'にっこり', e: 'happy', m: 'smile', b: 'up', f: '' },
  { n: 'えがお', e: 'shut', m: 'fang', b: 'up', f: 'spark' },
  { n: 'キラキラ', e: 'star', m: 'open', b: 'up', f: 'spark' },
  { n: 'びっくり', e: 'wide', m: 'open', b: 'up', f: 'excl' },
  { n: 'ぽかん', e: 'wide', m: 'tri', b: 'flat', f: '' },
  { n: 'あせり', e: 'gt', m: 'wave', b: 'sad', f: 'sweat' },
  { n: 'あおざめ', e: 'wide', m: 'wave', b: 'sad', f: 'gloom' },
  { n: 'おこり', e: 'angry', m: 'yell', b: 'down', f: 'anger' },
  { n: 'こわい', e: 'sanpaku', m: 'hecchi', b: 'down', f: '' },
  { n: 'ジト目', e: 'jito', m: 'flat', b: 'flat', f: 'lines' },
  { n: 'なき', e: 'cry', m: 'sad', b: 'sad', f: '' },
  { n: 'うるうる', e: 'big', m: 'sad', b: 'sad', f: '' },
  { n: 'しょんぼり', e: 'flatline', m: 'sad', b: 'sad', f: 'gloom' },
  { n: 'てれ', e: 'happy', m: 'wave', b: 'sad', f: 'blush' },
  { n: 'まっか', e: 'wide', m: 'wave', b: 'sad', f: 'blush' },
  { n: 'すき', e: 'heart', m: 'fang', b: 'up', f: 'heart' },
  { n: 'きりっ', e: 'round', m: 'flat', b: 'down', f: '' },
  { n: 'ドヤ', e: 'jito', m: 'fang', b: 'up', f: 'spark' },
  { n: 'はてな', e: 'big', m: 'tri', b: 'up', f: 'quest' },
  { n: 'さけぶ', e: 'gt', m: 'yell', b: 'down', f: 'excl' },
  { n: 'ねむい', e: 'flatline', m: 'wave', b: 'sad', f: 'note' },
  { n: 'しんだ目', e: 'dead', m: 'flat', b: 'none', f: '' },
  { n: 'ウインク', e: 'wink', m: 'smile', b: 'up', f: 'spark' },
];
const exprOf = n => EXPR.find(e => e.n === n) || EXPR[0];

/* ポーズ。a はミニキャラの うで（ひじx,ひじy,手x,手y）。
   ra・rl は 頭身ありの うで・あし。rot は たおす 角度 */
const STAND_L = [[-.062, .75, -.062, 1.0], [.062, .75, .062, 1.0]];
export const POSE = [
  { n: '立ち', a: [[-.30, .70, -.30, .86], [.30, .70, .30, .86]], ra: [[-.115, .33, -.100, .47], [.115, .33, .100, .47]] },
  { n: '手をふる', a: [[-.34, .66, -.40, .44], [.30, .72, .30, .88]], ra: [[-.145, .28, -.165, .12], [.115, .33, .105, .47]] },
  { n: 'ばんざい', a: [[-.36, .58, -.42, .34], [.36, .58, .42, .34]], ra: [[-.150, .26, -.190, .06], [.150, .26, .190, .06]] },
  { n: '指さし', a: [[-.38, .62, -.52, .52], [.28, .74, .28, .88]], ra: [[-.155, .28, -.245, .20], [.110, .34, .100, .48]] },
  { n: 'なでる', a: [[-.30, .70, -.30, .86], [.40, .56, .50, .34]], ra: [[-.115, .33, -.100, .47], [.170, .24, .250, .10]] },
  { n: 'さしだす', a: [[-.30, .70, -.30, .86], [.40, .66, .54, .62]], ra: [[-.115, .33, -.100, .47], [.170, .28, .280, .27]] },
  { n: 'ほおづえ', a: [[-.30, .66, -.20, .46], [.28, .74, .26, .86]], ra: [[-.140, .30, -.055, .13], [.115, .34, .105, .47]] },
  { n: 'かおをかくす', a: [[-.34, .62, -.08, .40], [.34, .62, .08, .40]], ra: [[-.140, .28, -.030, .10], [.140, .28, .030, .10]] },
  { n: 'うでぐみ', a: [[-.34, .66, .10, .70], [.34, .66, -.10, .74]], ra: [[-.145, .30, .055, .335], [.145, .30, -.055, .345]] },
  { n: 'はしる', a: [[-.36, .60, -.28, .46], [.34, .76, .44, .90]], ra: [[-.170, .27, -.110, .15], [.145, .36, .190, .50]], rl: [[-.140, .70, -.200, .86], [.100, .76, .160, .99]], lean: .05 },
  { n: 'ばんそう', a: [[-.28, .72, -.10, .80], [.28, .72, .10, .80]], ra: [[-.120, .33, -.040, .40], [.120, .33, .040, .40]] },
  { n: 'かんがえ', a: [[-.30, .70, -.30, .86], [.26, .66, .12, .50]], ra: [[-.115, .33, -.100, .47], [.130, .30, .030, .15]] },
  { n: 'おじぎ', a: [[-.26, .74, -.20, .88], [.26, .74, .20, .88]], ra: [[-.110, .34, -.090, .47], [.110, .34, .090, .47]], lean: .10 },
  { n: 'ガッツ', a: [[-.34, .62, -.26, .44], [.34, .62, .26, .44]], ra: [[-.150, .28, -.100, .14], [.150, .28, .100, .14]] },
  { n: 'すわる', a: [[-.28, .72, -.12, .84], [.28, .72, .12, .84]], ra: [[-.120, .33, -.020, .52], [.120, .33, .020, .52]], rl: [[-.070, .52, -.120, .74], [.070, .52, .120, .74]], sit: true },
  { n: 'うしろ', a: [[-.30, .70, -.32, .86], [.30, .70, .32, .86]], ra: [[-.115, .33, -.100, .47], [.115, .33, .100, .47]], back: true },
  { n: 'たおれ', a: [[-.34, .62, -.44, .50], [.34, .62, .44, .50]], ra: [[-.150, .26, -.190, .10], [.150, .26, .190, .10]], rot: -90 },
];
const poseOf = n => POSE.find(p => p.n === n) || POSE[0];

/* ---------- 髪 ----------
   頭の まん中を 0,0 と して、頭の はば rx=.30、たかさ R で かく */
export const HAIRS = [
  ['short', 'みじかい'], ['curl', 'くせ毛'], ['wolf', 'ウルフ'], ['long', 'ロング'],
  ['bang', 'ぱっつん'], ['ahoge', 'アホ毛'], ['spike', 'つんつん'], ['odango', 'おだんご'],
  ['band', 'ハチマキ'], ['none', 'なし'],
];
export const TONES = [['black', 'くろ'], ['gray', 'はいいろ'], ['white', 'しろ・金']];
const toneFill = (t, ink) => t === 'white' ? '#FFFEF7' : t === 'gray' ? '#A9A595' : ink;

function cap(R) {
  // 頭の 上を おおう 髪。前髪の すそは 少し ぎざぎざ
  return `M-.315 ${N(R * .10)} C-.34 ${N(-R * 1.25)} .34 ${N(-R * 1.25)} .315 ${N(R * .10)} ` +
    `L.25 ${N(-R * .28)} L.17 ${N(-R * .12)} L.09 ${N(-R * .34)} L0 ${N(-R * .16)} L-.09 ${N(-R * .36)} L-.17 ${N(-R * .14)} L-.25 ${N(-R * .30)} Z`;
}
function hairBack(style, tone, ink, R) {
  const f = toneFill(tone, ink), sw = '.03';
  if (style === 'long') return `<path d="M-.33 ${N(-R * .3)} C-.40 ${N(R * .9)} -.36 ${N(R * 1.9)} -.24 ${N(R * 2.1)} L.24 ${N(R * 2.1)} C.36 ${N(R * 1.9)} .40 ${N(R * .9)} .33 ${N(-R * .3)} Z" fill="${f}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  if (style === 'wolf') return `<path d="M-.33 ${N(-R * .4)} L-.40 ${N(R * .55)} L-.31 ${N(R * .35)} L-.34 ${N(R * 1.05)} L-.22 ${N(R * .70)} L.22 ${N(R * .70)} L.34 ${N(R * 1.05)} L.31 ${N(R * .35)} L.40 ${N(R * .55)} L.33 ${N(-R * .4)} Z" fill="${f}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  return '';
}
function hairFront(style, tone, ink, R) {
  const f = toneFill(tone, ink), sw = '.03';
  const capPath = `<path d="${cap(R)}" fill="${f}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  switch (style) {
    case 'none': return '';
    case 'short': case 'long': return capPath;
    case 'wolf': return capPath + `<path d="M-.20 ${N(-R * 1.0)} l-.06 -.08 M.06 ${N(-R * 1.05)} l.02 -.09 M.22 ${N(-R * .95)} l.08 -.06" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
    case 'curl': {
      let g = `<path d="${cap(R)}" fill="${f}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.05 + i * .9 / 6), x = Math.cos(a) * .30, y = Math.sin(a) * R * 1.0;
        g += `<circle cx="${N(x)}" cy="${N(y)}" r=".065" fill="${f}" stroke="${ink}" stroke-width="${sw}"/>`;
      }
      return g + `<path d="M.05 ${N(-R * 1.05)} q.06 -.08 .02 -.13" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }
    case 'bang': return `<path d="M-.29 ${N(-R * .40)} q.10 ${N(-R * .66)} .29 ${N(-R * .68)} q.19 .005 .29 ${N(R * .68)} q-.12 ${N(-R * .16)} -.29 ${N(-R * .16)} q-.17 0 -.29 ${N(R * .16)} Z" fill="${f}" stroke="${ink}" stroke-width="${sw}"/>`;
    case 'ahoge': return capPath + `<path d="M.02 ${N(-R * 1.0)} q.03 -.12 .12 -.10 q-.07 .03 -.05 .11" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
    case 'spike': return `<path d="M-.30 ${N(-R * .2)} L-.26 ${N(-R * 1.2)} L-.14 ${N(-R * .95)} L-.05 ${N(-R * 1.4)} L.05 ${N(-R * 1.0)} L.16 ${N(-R * 1.35)} L.22 ${N(-R * .9)} L.32 ${N(-R * 1.05)} L.30 ${N(-R * .2)} L.17 ${N(-R * .40)} L0 ${N(-R * .22)} L-.17 ${N(-R * .40)} Z" fill="${f}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    case 'odango': return capPath + `<circle cx="-.27" cy="${N(-R * .85)}" r=".085" fill="${f}" stroke="${ink}" stroke-width="${sw}"/><circle cx=".27" cy="${N(-R * .85)}" r=".085" fill="${f}" stroke="${ink}" stroke-width="${sw}"/>`;
    case 'band': return `<path d="M-.315 ${N(-R * .25)} C-.33 ${N(-R * 1.1)} .33 ${N(-R * 1.1)} .315 ${N(-R * .25)} Z" fill="${f}" stroke="${ink}" stroke-width="${sw}"/><path d="M-.31 ${N(-R * .35)} Q0 ${N(-R * .55)} .31 ${N(-R * .35)}" fill="none" stroke="${ink}" stroke-width=".06"/><path d="M.30 ${N(-R * .40)} l.10 -.03 l-.02 .08 Z" fill="#fff" stroke="${ink}" stroke-width=".02"/>`;
    default: return capPath;
  }
}
function face(E, P, ink, R, hy) {
  if (P.back) return `<path d="M-.14 ${N(hy + .02)} q.14 .10 .28 0" fill="none" stroke="${ink}" stroke-width=".026" opacity=".45"/>`;
  let g = `<g transform="translate(0 ${N(hy)})">`;
  g += brow(E.b, -.150 * R / .288, ink);
  g += eye(E.e, -1, -.150, -.010, ink) + eye(E.e, 1, .150, -.010, ink);
  g += mouth(E.m, .130 * R / .288, ink);
  if (E.f) g += fxMark(E.f, ink);
  return g + `</g>`;
}

/* ---------- ミニキャラ ---------- */
function drawChibi(c, expr, pose, ink) {
  const E = exprOf(expr), P = poseOf(pose), R = .288, hy = .325, lean = P.lean || 0;
  let g = `<g fill="none" stroke="${ink}" stroke-width=".062" stroke-linecap="round" stroke-linejoin="round">`;
  for (const a of P.a) g += `<path d="M${N(a[0] * .55)} .66 L${N(a[0])} ${N(a[1])} L${N(a[2])} ${N(a[3])}"/>`;
  g += `</g>`;
  g += P.sit
    ? `<path d="M-.175 .60 C-.27 .74 -.26 .90 -.12 .90 L.12 .90 C.26 .90 .27 .74 .175 .60 Z" fill="#fff" stroke="${ink}" stroke-width=".040" stroke-linejoin="round"/>`
    : `<path d="M-.175 .60 C-.255 .76 -.235 1.00 -.100 1.005 L.100 1.005 C.235 1.00 .255 .76 .175 .60 Z" fill="#fff" stroke="${ink}" stroke-width=".040" stroke-linejoin="round"/>`;
  g += `<g transform="translate(${N(lean * 1.6)} 0)">`;
  g += `<g transform="translate(0 ${hy})">${hairBack(c.hair, c.tone, ink, R)}</g>`;
  g += `<ellipse cx="0" cy="${hy}" rx=".30" ry="${R}" fill="#fff" stroke="${ink}" stroke-width=".040"/>`;
  if (!P.back) g += `<g transform="translate(0 ${hy})">${hairFront(c.hair, c.tone, ink, R)}</g>`;
  else g += `<g transform="translate(0 ${hy})"><path d="M-.30 ${N(R * .3)} C-.36 ${N(-R * 1.2)} .36 ${N(-R * 1.2)} .30 ${N(R * .3)} Z" fill="${toneFill(c.tone, ink)}" stroke="${ink}" stroke-width=".03"/></g>`;
  g += face(E, P, ink, R, hy);
  return g + `</g>`;
}

/* ---------- 頭身あり ---------- */
const RB = { sh: .19, shX: .085, hipY: .515, hipX: .058 };
function drawReal(c, expr, pose, ink) {
  const P = poseOf(pose), E = exprOf(expr);
  const lean = (P.lean || 0) * .5, sw = .048, L = N;
  let g = `<g fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`;
  P.ra.forEach((a, i) => {
    const sx = (i ? RB.shX : -RB.shX) + lean;
    g += `<path d="M${L(sx)} ${L(RB.sh)} L${L(a[0])} ${L(a[1])} L${L(a[2])} ${L(a[3])}"/>`;
  });
  (P.rl || STAND_L).forEach((l, i) => {
    const hx = i ? RB.hipX : -RB.hipX;
    g += `<path d="M${L(hx)} ${L(RB.hipY)} L${L(l[0])} ${L(l[1])} L${L(l[2])} ${L(l[3])}"/>`;
  });
  g += `</g>`;
  g += `<path d="M${L(-RB.shX + lean)} ${L(RB.sh)} L${L(RB.shX + lean)} ${L(RB.sh)} L${L(RB.hipX)} ${L(RB.hipY)} L${L(-RB.hipX)} ${L(RB.hipY)} Z" fill="#fff" stroke="${ink}" stroke-width="${sw * .75}" stroke-linejoin="round"/>`;
  g += `<path d="M${L(lean)} .150 L${L(lean)} ${L(RB.sh)}" stroke="${ink}" stroke-width="${sw * .8}" stroke-linecap="round"/>`;
  const R = .355;
  g += `<g transform="translate(${L(lean * 1.3)} .078) scale(.205)">`;
  g += hairBack(c.hair, c.tone, ink, R);
  g += `<ellipse rx=".30" ry="${R}" fill="#fff" stroke="${ink}" stroke-width=".052"/>`;
  if (!P.back) g += hairFront(c.hair, c.tone, ink, R);
  else g += `<path d="M-.30 ${N(R * .3)} C-.36 ${N(-R * 1.2)} .36 ${N(-R * 1.2)} .30 ${N(R * .3)} Z" fill="${toneFill(c.tone, ink)}" stroke="${ink}" stroke-width=".05"/>`;
  if (P.back) g += '';
  else g += brow(E.b, -.175, ink) + eye(E.e, -1, -.150, -.015, ink) + eye(E.e, 1, .150, -.015, ink) + mouth(E.m, .150, ink) + (E.f === 'blush' || E.f === 'sweat' || E.f === 'gloom' ? fxMark(E.f, ink) : '');
  g += `</g>`;
  return g;
}

/* ---------- マスコット（まるい 着ぐるみ） ---------- */
function drawMascot(c, expr, pose, ink) {
  const P = poseOf(pose), E = exprOf(expr), sw = '.035';
  const fill = c.tone === 'black' ? '#6E6A5A' : c.tone === 'gray' ? '#D8D4BE' : '#FFF6B8';
  let g = '';
  // あし
  g += `<path d="M-.16 .92 h.11 v.08 h-.15 Z M.05 .92 h.11 v.08 h-.15 Z" fill="#F6B35A" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  // 体
  g += `<ellipse cx="0" cy=".55" rx=".40" ry=".42" fill="${fill}" stroke="${ink}" stroke-width="${sw}"/>`;
  // 羽（手）
  const up = /なでる|手をふる|ばんざい|さしだす|指さし|ガッツ/.test(P.n), both = /ばんざい|ガッツ/.test(P.n);
  const wing = (s, raise) => raise
    ? `<path d="M${N(.36 * s)} .52 q${N(.16 * s)} -.12 ${N(.16 * s)} -.26 q${N(-.10 * s)} .04 ${N(-.18 * s)} .16 Z" fill="${fill}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`
    : `<path d="M${N(.37 * s)} .52 q${N(.12 * s)} .10 ${N(.06 * s)} .22 q${N(-.08 * s)} -.04 ${N(-.10 * s)} -.14 Z" fill="${fill}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  g += wing(-1, both) + wing(1, up);
  if (!P.back) {
    // 目・くちばし・ほっぺ
    g += `<circle cx="-.12" cy=".44" r=".035" fill="${ink}"/><circle cx=".12" cy=".44" r=".035" fill="${ink}"/>`;
    g += `<path d="M-.05 .50 L.05 .50 L0 .57 Z" fill="#F6B35A" stroke="${ink}" stroke-width=".02" stroke-linejoin="round"/>`;
    g += `<ellipse cx="-.22" cy=".52" rx=".05" ry=".03" fill="#F2A0B8"/><ellipse cx=".22" cy=".52" rx=".05" ry=".03" fill="#F2A0B8"/>`;
    if (E.f) g += `<g transform="translate(0 .40)">${fxMark(E.f, ink)}</g>`;
  }
  // 頭の 羽 3本
  g += `<path d="M0 .14 q-.02 -.10 -.08 -.12 M0 .14 q0 -.11 .01 -.14 M0 .14 q.03 -.09 .09 -.10" fill="none" stroke="${ink}" stroke-width=".03" stroke-linecap="round"/>`;
  return g;
}

/* ---------- コマに はめる ----------
   figs: [{c:キャラ, expr, pose, flip}]   bb: コマの はこ
   もどり値: { svg, spots:[{id, x, top}] }（フキダシの しっぽ用） */
const CROP = {
  chibi: { face: [.03, .66], bust: [0, .82], waist: [0, .94], full: [-.05, 1.08] },
  real: { face: [0, .21], bust: [0, .40], waist: [0, .62], full: [-.03, 1.05] },
  mascot: { face: [.10, .80], bust: [.06, .90], waist: [.05, 1.02], full: [.02, 1.06] },
};
const WIDTH = { chibi: .78, real: .58, mascot: .95 };
const XS = [[.5], [.70, .30], [.80, .50, .20]];

export function figuresSVG(figs, bb, shot, style, ink) {
  if (!figs.length || shot === 'none' || shot === 'obj') return { svg: '', spots: [] };
  const n = Math.min(3, figs.length);
  const kinds = figs.slice(0, n).map(f => f.c.kind === 'mascot' ? 'mascot' : style);
  const crops = kinds.map(k => CROP[k][shot] || CROP[k].full);
  const ch = Math.max(...crops.map(c => c[1] - c[0]));
  const cw = Math.max(...kinds.map((k, i) => (crops[i][1] - crops[i][0]) * WIDTH[k]));
  const share = n === 1 ? .9 : n === 2 ? .50 : .34;
  const s0 = Math.min(bb.w * share / cw, bb.h * .9 / ch);
  const low = shot === 'full' || shot === 'waist';
  const spots = [];
  let g = '';
  figs.slice(0, n).forEach((f, i) => {
    const k = kinds[i], P = poseOf(f.pose), [y0, y1] = crops[i];
    const hs = low ? (f.c.h || 1) : 1;
    const s = s0 * hs;
    const draw = k === 'mascot' ? drawMascot : k === 'real' ? drawReal : drawChibi;
    const cx = bb.x + bb.w * (n === 1 ? .5 + (shot === 'full' ? 0 : .06) : XS[n - 1][i]);
    // 足もとを そろえる（頭身の ちがいが 見える）
    const bottom = bb.y + bb.h - (bb.h - ch * s0) * (low ? .10 : .45);
    const ty = bottom - (y1 - y0) * s - y0 * s;
    let inner = draw(f.c, f.expr, f.pose, ink);
    let tf;
    if (P.rot) {
      // たおれ … 全身を 横に ねかせて コマの 下に
      const sR = Math.min(bb.w * .8 / 1.05, bb.h * .5 / (WIDTH[k] * 1.0)) * (n > 1 ? .7 : 1);
      const fy = bb.y + bb.h * .80, fx = cx;
      tf = `translate(${N(fx)} ${N(fy)}) rotate(${P.rot}) scale(${N(sR * (f.flip ? -1 : 1))} ${N(sR)}) translate(0 -.5)`;
      spots.push({ id: f.c.id, x: fx, top: fy - sR * .4 });
    } else {
      tf = `translate(${N(cx)} ${N(ty)}) scale(${N(s * (f.flip ? -1 : 1))} ${N(s)})`;
      spots.push({ id: f.c.id, x: cx, top: ty + y0 * s });
    }
    g += `<g class="fig" transform="${tf}">${fixLine(inner)}</g>`;
  });
  return { svg: g, spots };
}
/* 線の 太さは 大きさに かかわらず 同じに（vector-effect と くみあわせる） */
function fixLine(t) {
  return t.replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${N(Math.min(3.2, Math.max(.8, parseFloat(w) * 44)))}"`);
}

/* キャラえらびの 見本（小さい 顔） */
export function faceChip(c, expr, style) {
  const k = c.kind === 'mascot' ? 'mascot' : style;
  const draw = k === 'mascot' ? drawMascot : k === 'real' ? drawReal : drawChibi;
  const vb = k === 'mascot' ? '-.5 0 1 1.05' : k === 'real' ? '-.14 -.02 .28 .24' : '-.42 -.08 .84 .80';
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><style>*{vector-effect:non-scaling-stroke}</style>${fixLine(draw(c, expr || 'ふつう', '立ち', '#1E1C14'))}</svg>`;
}
