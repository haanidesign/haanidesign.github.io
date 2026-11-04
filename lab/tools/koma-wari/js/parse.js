/* 台本を 読む。

   読める 形
     ### 1ページ目（なにか）           … ページの はじまり（「P1」でも よい）
     ### 12〜13ページ目（見開き）      … 見開き 1まい
     | コマ | 大きさ | 絵 | セリフ・効果音 |   … 表（| で くぎる。タブで くぎっても よい）
     | ① | 横長 | 絵の 説明 | ヒナタ：「セリフ」<br>効果音：`ドン` |

   セリフの 書き方
     名前：「セリフ」              … ふつうの フキダシ
     名前（モノローグ）：「…」     … 四角い わく
     効果音：`ドン`                … 描き文字
     看板：「…」・ボード：「…」   … 字の 入った ふだ
     タイトル：『…』               … 大きな 字
     「（…）」                      … こころの 声 */

import { EXPR, POSE } from './figure.js?v=4';

export const uid = () => Math.random().toString(36).slice(2, 9);
const BR = /<br\s*\/?>/gi;
const clean = s => String(s || '').replace(/\*\*/g, '').replace(/`/g, '').replace(/&nbsp;/g, ' ').trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PAGE_RE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[PpＰ]\s*(\d+)(?:\s*[〜~～\-－]\s*[PpＰ]?\s*(\d+))?(?![\d])|(\d+)\s*(?:[〜~～\-－]\s*(\d+))?\s*ページ目)\s*(?:\*\*)?\s*(?:[（(](.*?)[）)])?/;

export function newPanel() {
  return { id: uid(), mark: '', size: 'mid', frac: 0, inset: '', hook: false, memo: '', lines: [], figs: [], shot: 'bust', obj: '' };
}
export function newPage(no) {
  return { id: uid(), no, no2: 0, spread: false, title: '', seed: 1 + Math.floor(Math.random() * 9999), panels: [] };
}

/* ---------- 大きさの ことば ---------- */
export function sizeOf(t) {
  t = clean(t);
  const r = { size: 'mid', frac: 0, inset: '', hook: /引き/.test(t) };
  if (/右上/.test(t)) r.inset = 'tr';
  else if (/左下/.test(t)) r.inset = 'bl';
  else if (/左上/.test(t)) r.inset = 'tl';
  else if (/右下/.test(t)) r.inset = 'br';
  if (r.inset) { r.size = 'small'; return r; }
  let m;
  if (/見開き|中央|2ページ|２ページ/.test(t)) r.size = 'full';
  else if ((m = t.match(/(\d)\s*[\/／]\s*(\d)/))) { r.size = 'frac'; r.frac = Math.min(1, +m[1] / +m[2]); }
  else if (/半分/.test(t)) { r.size = 'frac'; r.frac = .5; }
  else if (/ページ全体|1ページ|１ページ|全面|まるごと/.test(t)) r.size = 'page';
  else if (/横長/.test(t)) r.size = 'wide';
  else if (/大/.test(t)) r.size = 'big';
  else if (/小/.test(t)) r.size = 'small';
  else if (/中/.test(t)) r.size = 'mid';
  return r;
}
export const SIZES = [['big', '大'], ['mid', '中'], ['small', '小'], ['wide', '横長'], ['page', '1ページ'], ['full', '見開き']];
export const sizeName = p => p.size === 'frac' ? `${Math.round(p.frac * 100)}%` : (SIZES.find(s => s[0] === p.size) || ['', '中'])[1];

/* ---------- セリフ ---------- */
function kindOf(who, body) {
  const w = who || '';
  if (who === '') return 'talk';
  if (!who) return /`/.test(body) ? 'se' : 'sign';
  if (/効果音|^SE$|擬音|^音$/i.test(w)) return 'se';
  if (/タイトル/.test(w)) return 'title';
  if (/モノローグ|ナレーション|心の声/.test(w)) return 'mono';
  if (/看板|張り紙|貼り紙|ボード|テロップ|掲示|字幕|画面|手紙|メモ|ポスター|のぼり|チラシ|ビラ|スマホ|メール|LINE/.test(w)) return 'sign';
  if (/小さ|ひそひそ|手書き|小声|中から/.test(w)) return 'whisper';
  return 'talk';
}
const baseName = w => String(w || '').replace(/[（(].*?[）)]/g, '').trim();

export function parseLines(raw) {
  const segs = String(raw || '').split(/<br\s*\/?>|\n/i).map(s => s.trim()).filter(Boolean);
  const out = [];
  let last = null;
  for (let seg of segs) {
    seg = seg.replace(/\*\*/g, '').trim();
    if (!seg || /^※/.test(seg)) continue;
    let who = null, body = seg;
    const m = seg.match(/^([^「『（(：:`]{1,26}(?:[（(][^）)]*[）)])?)\s*[：:]\s*(.*)$/);
    if (m) { who = m[1].trim(); body = m[2]; last = who; }
    else if (/^[「『]/.test(seg) && last) who = last;
    else if (/^[「『]/.test(seg)) who = '';                  // 名前なしの 声（まわりの 人）
    else if (/^[（(].*[）)]$/.test(seg)) continue;           // （ちゅうい書き）は とばす
    const bare = body.replace(/[（）()\s]/g, '');
    if (bare === '無言' || bare === '…' || bare === '') {
      if (who) out.push({ who: baseName(who), raw: who, kind: 'none', text: '' });
      continue;
    }
    const kind = kindOf(who, body);
    let pieces;
    if (kind === 'se') {
      const bt = [...body.matchAll(/`([^`]+)`/g)].map(x => x[1]);
      pieces = bt.length ? bt : [body.replace(/[（(][^）)]*[）)]\s*$/, '')];
    } else {
      const q = [...body.matchAll(/[「『]([^」』]*)[」』]/g)].map(x => x[1]);
      pieces = q.length ? q : [body];
    }
    for (let t of pieces) {
      t = clean(t);
      if (!t) continue;
      let k = kind;
      if (/^[（(].*[）)]$/.test(t)) {
        t = t.replace(/^[（(]|[）)]$/g, '');
        if (k === 'talk') k = 'think';
      } else if (k === 'talk' && /[！!]{2}/.test(t)) k = 'shout';
      out.push({ who: who ? baseName(who) : '', raw: who || '', kind: k, text: t });
    }
  }
  return out;
}
const KIND_TAG = { mono: '（モノローグ）', whisper: '（小さく）', think: '', shout: '', talk: '' };
export function linesToText(lines) {
  return lines.map(l => {
    if (l.kind === 'none') return l.who ? `${l.who}：（無言）` : '';
    if (l.kind === 'se') return `効果音：\`${l.text}\``;
    if (l.kind === 'title') return `タイトル：『${l.text}』`;
    if (l.kind === 'sign') return `${l.who || '看板'}：「${l.text}」`;
    const t = l.kind === 'think' ? `（${l.text}）` : l.text;
    return `${l.who ? l.who + (KIND_TAG[l.kind] || '') : ''}：「${t}」`;
  }).filter(Boolean).join('\n');
}

/* ---------- 台本 ぜんぶ ---------- */
function cellsOf(line) {
  const t = line.trim();
  if (t.startsWith('|')) return t.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  return null;
}
function headerMap(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const t = clean(c);
    if (map.mark == null && /^(コマ|位置|番号|No|№|#)/i.test(t)) map.mark = i;
    else if (map.size == null && /大きさ|サイズ/.test(t)) map.size = i;
    else if (map.pic == null && /^(絵|内容|画|え)/.test(t)) map.pic = i;
    else if (map.lines == null && /セリフ|台詞|効果音|文字|ことば/.test(t)) map.lines = i;
  });
  return map.pic != null && map.mark != null ? map : null;
}

export function parseScript(text) {
  const pages = [];
  let pg = null, map = null, inTable = false, skip = false;
  const warn = [];
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\u00a0/g, ' ');
    const pm = !line.trim().startsWith('|') && line.match(PAGE_RE);
    if (pm && (pm[1] || pm[3])) {
      const a = +(pm[1] || pm[3]), b = +(pm[2] || pm[4] || 0);
      pg = newPage(a);
      if (b && b > a) { pg.no2 = b; pg.spread = true; }
      pg.title = clean(pm[5] || '');
      pages.push(pg);
      inTable = false;
      continue;
    }
    const cells = cellsOf(line);
    if (!cells) { if (line.trim()) inTable = false; continue; }
    if (cells.every(c => /^[\s:\-－]*$/.test(c))) continue;      // |---|---|
    if (!inTable) {
      // 表の 1行め。コマの 表か どうかを ここで 見る
      inTable = true; skip = false;
      const h = headerMap(cells);
      if (h) { map = h; continue; }
      if (!/^[①-⑳0-9０-９]/.test(clean(cells[0]))) { skip = true; continue; }
      map = cells.length >= 4 ? { mark: 0, size: 1, pic: 2, lines: 3 } : { mark: 0, pic: 1, lines: 2 };
    }
    if (skip || !map) continue;
    if (!pg) { pg = newPage(1); pages.push(pg); }
    const g = k => map[k] != null ? (cells[map[k]] || '') : '';
    const p = newPanel();
    p.mark = clean(g('mark'));
    Object.assign(p, sizeOf(map.size != null ? g('size') : g('mark')));
    p.memo = clean(g('pic').replace(BR, '\n'));
    p.lines = parseLines(g('lines'));
    pg.panels.push(p);
  }
  // 見開きで 大ゴマが ない ときは さいしょを 見開きに
  for (const p of pages) {
    if (p.spread && p.panels.length && !p.panels.some(x => x.size === 'full')) {
      const main = p.panels.find(x => !x.inset) || p.panels[0];
      main.size = 'full'; main.inset = '';
    }
    if (!p.panels.length) warn.push(`${p.no}ページ目に コマが ありません`);
  }
  const cast = makeCast(pages);
  for (const p of pages) for (const q of p.panels) autoPanel(q, cast);
  return { pages: pages.filter(p => p.panels.length), cast, warn };
}

/* ---------- 出てくる 人 ---------- */
const NOT_CAST = /^(中の人|効果音|看板|張り紙|貼り紙|ボード|チラシ|ビラ|タイトル|テロップ|ナレーション|全員|みんな|一同|声|音)$/;
const simple = n => n && n.length <= 8 && !/[、。]/.test(n) && !NOT_CAST.test(n);

export function makeCast(pages, old = []) {
  const count = new Map();
  for (const pg of pages) for (const p of pg.panels) for (const l of p.lines) {
    if (l.kind === 'se' || l.kind === 'sign' || l.kind === 'title') continue;
    if (simple(l.who)) count.set(l.who, (count.get(l.who) || 0) + 1);
  }
  const names = [...count.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const memos = pages.flatMap(pg => pg.panels.map(p => p.memo));
  const cast = names.map((name, i) => {
    const prev = old.find(c => c.name === name);
    if (prev) return prev;
    return guessLook({ id: uid(), name, kind: 'human', hair: '', tone: '', h: 1 }, i, memos, names);
  });
  // むずかしい 名前（「ぴよ吉の背中から、小さく…」）は 中に ある 名前に よせる
  for (const pg of pages) for (const p of pg.panels) for (const l of p.lines) {
    if (l.who && !cast.some(c => c.name === l.who)) {
      const hit = cast.find(c => l.who.includes(c.name));
      l.who = hit ? hit.name : '';
    }
  }
  return cast;
}

/* 文の 中で、ことばに いちばん 近い 名前を さがす */
function nearestName(sent, idx, names, klen = 0) {
  let best = null, bd = 1e9;
  for (const n of names) {
    let i = sent.indexOf(n);
    while (i >= 0) {
      if (sent.startsWith('より', i + n.length)) { i = sent.indexOf(n, i + 1); continue; }   // 「Aより 背が高い」は A では ない
      const d = i >= idx ? i - (idx + klen) : idx - (i + n.length);
      if (d < bd) { bd = d; best = n; }
      i = sent.indexOf(n, i + 1);
    }
  }
  return best;
}
function sentences(t) { return String(t || '').split(/[。\n]/).map(s => s.trim()).filter(Boolean); }

const LOOK = [
  [/金髪|白髪|銀髪|ブリーチ|茶髪/, c => { c.tone = 'white'; }],
  [/黒髪/, c => { c.tone = 'black'; }],
  [/ウルフ/, c => { c.hair = 'wolf'; }],
  [/天然パーマ|くせ毛|もじゃ/, c => { c.hair = 'curl'; }],
  [/おだんご/, c => { c.hair = 'odango'; }],
  [/ぱっつん/, c => { c.hair = 'bang'; }],
  [/ロング|長い髪|ポニーテール/, c => { c.hair = 'long'; }],
  [/ハチマキ/, c => { c.hair = 'band'; }],
  [/坊主|ボウズ|スキンヘッド/, c => { c.hair = 'none'; }],
  [/背が高|長身|見下ろ/, c => { c.h = Math.max(c.h, 1.06); }],
  [/背が低|小柄|背伸び/, c => { c.h = Math.min(c.h, .95); }],
];
function guessLook(c, i, memos, names) {
  // マスコット … 名前の すぐ あとに「着ぐるみ・羽・くちばし」が 2回 いじょう、
  //               または「名前（マスコット）」の ように はっきり 書いて ある とき
  const nm = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const near = new RegExp(nm + '[のがは（(]?(着ぐるみ|羽|くちばし|マスコット|ゆるキャラ)', 'g');
  const sure = new RegExp(nm + '[（(]?(マスコット|着ぐるみ|ゆるキャラ)');
  let hits = 0, isSure = false;
  for (const memo of memos) {
    hits += (memo.match(near) || []).length;
    if (sure.test(memo)) isSure = true;
    for (const s of sentences(memo)) {
      if (!s.includes(c.name)) continue;
      for (const [re, fn] of LOOK) {
        const m = s.match(re);
        if (m && nearestName(s, m.index, names, m[0].length) === c.name) fn(c);
      }
    }
  }
  if (isSure || hits >= 2) { c.kind = 'mascot'; c.hair = 'none'; c.tone = c.tone || 'white'; c.h = Math.max(c.h, 1); }
  if (/子ども|子供|女の子|男の子|幼|赤ちゃん|ちびっこ/.test(c.name)) c.h = .7;
  const HAIR_CYCLE = ['short', 'ahoge', 'bang', 'spike', 'long', 'odango'];
  if (!c.hair) c.hair = HAIR_CYCLE[i % HAIR_CYCLE.length];
  if (!c.tone) c.tone = ['black', 'gray', 'white'][i % 3];
  return c;
}

/* ---------- コマの 中みを 決める ---------- */
const EXPR_KEYS = [
  [/真っ赤|赤くな|赤い|照れ|頬を|耳まで/, 'まっか'],
  [/涙が|泣|うるうる|涙目|涙をため|目に涙/, 'なき'],
  [/青ざめ|ぞっと/, 'あおざめ'],
  [/慌て|あせ|焦|混乱|気まず|汗が飛/, 'あせり'],
  [/にらみ|にらま|にらむ|睨/, 'こわい'],
  [/三白眼|怖い顔|不機嫌/, 'こわい'],
  [/怒|ブチギレ|キレ/, 'おこり'],
  [/しょんぼり|落ち込|へこ|うつむ|膝を抱え|ため息/, 'しょんぼり'],
  [/固ま|ぽかん|きょとん|呆然/, 'ぽかん'],
  [/はっと|見開|驚|びっくり|目を丸/, 'びっくり'],
  [/決意|決めた顔|真剣|まっすぐな|まっすぐ|覚悟/, 'きりっ'],
  [/目を輝|きらきら|キラキラ/, 'キラキラ'],
  [/素の笑顔|八重歯|満面|大笑い/, 'えがお'],
  [/笑|にこ|にやけ|楽しそう|うれし|嬉し|微笑/, 'にっこり'],
  [/寝|眠/, 'ねむい'],
  [/ドヤ|得意/, 'ドヤ'],
  [/首をかしげ|首をひね|首を傾/, 'はてな'],
  [/叫|ギャン泣き|大声/, 'さけぶ'],
];
const POSE_KEYS = [
  [/撫でられ|なでられ|抱かれ/, '立ち'],
  [/倒れ(?!た[^。、]{0,4}[板机棚箱])|大の字|下敷き|寝転|横たわ/, 'たおれ'],
  [/撫で|なで|ぽんぽん/, 'なでる'],
  [/差し出|渡す|手渡|放る|放って/, 'さしだす'],
  [/頭を下げ|お辞儀|おじぎ|謝/, 'おじぎ'],
  [/走|駆け|飛び込|逃げ|突進|ダッシュ/, 'はしる'],
  [/膝を抱え|膝をつ|座|しゃが|腰かけ|腰掛|正座/, 'すわる'],
  [/指さ|指を差|指す/, '指さし'],
  [/手を振|手をふ/, '手をふる'],
  [/拳|ガッツ|握り/, 'ガッツ'],
  [/腕を組|腕組/, 'うでぐみ'],
  [/顔を[^。、]{0,3}隠|顔をうずめ|腕で顔|顔を覆/, 'かおをかくす'],
  [/考え|悩/, 'かんがえ'],
  [/ばんざい|万歳/, 'ばんざい'],
  [/後ろ姿|去って|背を向|振り向かず|去り際/, 'うしろ'],
  [/抱え|抱いて|抱き|持って|持った/, 'ばんそう'],
];
const FULL_RE = /全身|全景|走|倒れ|大の字|下敷き|立ち尽く|膝を抱え|座|しゃが|歩い|歩く|後ろ姿|立って|直立|並んで/;

export function autoPanel(p, cast) {
  const memo = p.memo || '';
  const names = cast.map(c => c.name);
  // 出てくる 人（絵の 説明に 出た 順 → しゃべる 人）
  const order = [];
  const pos = n => { const i = memo.indexOf(n); return i < 0 ? 1e9 : i; };
  names.filter(n => memo.includes(n)).sort((a, b) => pos(a) - pos(b)).forEach(n => order.push(n));
  for (const l of p.lines) {
    if (!l.who || order.includes(l.who) || !names.includes(l.who)) continue;
    if (l.kind === 'mono' && memo) continue;          // モノローグは 絵に 出て いる とき だけ
    if (l.kind === 'whisper' && memo) continue;
    order.push(l.who);
  }
  let shot = '';
  if (/文字だけ|字だけ|背景だけ|風景だけ|真っ暗/.test(memo) && !/顔だけ/.test(memo)) order.length = 0;
  // アップ
  p.obj = '';
  const up = memo.replace(/[ \t\u3000]+/g, '').match(/([^、。\n]{0,24}?)の?アップ/);
  if (up) {
    if (/顔|表情|目元|横顔|目$/.test(up[1])) shot = 'face';
    else {
      const parts = up[1].split(/[のを、]/).filter(Boolean);
      const thing = parts[parts.length - 1] || '';
      const owner = names.find(n => up[1].includes(n));
      if (/^(頭|顔)$/.test(thing) && owner) { shot = 'face'; order.splice(0, order.length, owner); }
      else if (!names.some(n => thing.includes(n))) { shot = 'obj'; p.obj = thing.slice(-8); }
      else shot = 'face';
    }
  }
  const ids = order.slice(0, 3).map(n => cast.find(c => c.name === n).id);
  if (!shot) {
    if (!ids.length) shot = 'none';
    else if (FULL_RE.test(memo)) shot = 'full';
    else if (/バスト|胸から上/.test(memo)) shot = 'bust';
    else if (/腰上|腰から上/.test(memo)) shot = 'waist';
    else if (p.size === 'small') shot = 'face';
    else if (p.size === 'mid') shot = 'bust';
    else shot = 'waist';
  }
  p.shot = shot;
  // 顔と ポーズ（ことばに いちばん 近い 名前の 人に つける）
  const figs = ids.map((id, i) => ({ id, expr: 'ふつう', pose: '立ち', flip: i % 2 === 1 }));
  const nameOf = id => cast.find(c => c.id === id).name;
  const fig = n => figs.find(f => nameOf(f.id) === n);
  const apply = (keys, field) => {
    const done = new Set();
    for (const s of sentences(memo)) {
      for (const [re, v] of keys) {
        const m = s.match(re);
        if (!m) continue;
        const who = nearestName(s, m.index, figs.map(f => nameOf(f.id)), m[0].length);
        const f = who ? fig(who) : figs[0];
        if (!f || done.has(f)) continue;
        f[field] = v; done.add(f);
      }
    }
  };
  apply(EXPR_KEYS, 'expr');
  apply(POSE_KEYS, 'pose');
  // しゃべり方からも 顔を
  for (const f of figs) {
    if (f.expr !== 'ふつう') continue;
    const said = p.lines.filter(l => l.who === nameOf(f.id));
    if (said.some(l => l.kind === 'shout')) f.expr = 'さけぶ';
    else if (said.some(l => /すみません|ごめん/.test(l.text))) f.expr = 'あせり';
    else if (said.some(l => /[？?]$/.test(l.text))) f.expr = 'はてな';
  }
  // マスコットは 表情なし
  for (const f of figs) if (cast.find(c => c.id === f.id).kind === 'mascot' && !/なでる|さしだす|はしる|たおれ|うしろ|ばんざい/.test(f.pose)) f.pose = '立ち';
  p.figs = figs;
  return p;
}

export const SHOTS = [['face', '顔'], ['bust', 'バスト'], ['waist', '腰上'], ['full', '全身'], ['obj', 'モノ'], ['none', 'なし']];
export const EXPR_NAMES = EXPR.map(e => e.n);
export const POSE_NAMES = POSE.map(p => p.n);
