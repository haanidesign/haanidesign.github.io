/* せってい。ひろい よこ画面では 右に つけっぱなし、
   せまい ときは 下から 出る 幕に 入る。中身は 同じ もの。

   シートは 変える たびに 作り直す。つまみの 値は 作品の 中に 持つ
   （シートの 中に 写しを 持つと 作り直した とたん 効かなく なる）。 */
import { S, $, edit, beginEdit, commitEdit, toast, selPanel } from './state.js?v=5';
import { SIZES, SHOTS, EXPR_NAMES, POSE_NAMES, parseLines, linesToText, autoPanel, newPanel, newPage, uid } from './parse.js?v=5';
import { HAIRS, TONES, faceChip } from './figure.js?v=5';
import { sheetsOf } from './render.js?v=5';
import { aiConf, saveConf, blocked } from './ai.js?v=5';

const DOCK_Q = '(min-width:980px) and (orientation:landscape)';
export const docked = () => window.matchMedia(DOCK_Q).matches;
let sheetOn = false, api = {};

export function init(cb) {
  api = cb;
  $('#sheetBack').addEventListener('click', close);
  window.matchMedia(DOCK_Q).addEventListener('change', () => { close(); draw(); });
}
export function open(k) {
  S.kind = k || S.kind;
  if (docked()) { draw(); return; }
  sheetOn = true;
  $('#sheet').classList.add('on');
  $('#sheetBack').classList.add('on');
  draw();
}
export function close() {
  sheetOn = false;
  $('#sheet').classList.remove('on');
  $('#sheetBack').classList.remove('on');
}
export const isOpen = () => docked() || sheetOn;

const TITLES = { ai: 'AI', script: '台本', cast: 'キャラ', panel: 'コマ', page: 'ページ', view: '表示', file: 'さくひん', help: 'つかいかた' };

export function draw() {
  document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('on', b.dataset.k === S.kind && isOpen()));
  if (!isOpen()) return;
  const box = docked() ? $('#propBody') : $('#sheet');
  const keep = box.scrollTop;
  box.innerHTML = '';
  if (!docked()) {
    const h = el('div', 'sheet-ttl');
    h.append(el('span', 'title', TITLES[S.kind] || 'せってい'), el('span', 'spacer'), btn('とじる', 'btn-sm btn-g', close));
    box.appendChild(h);
  } else $('#propTtl').textContent = TITLES[S.kind] || 'せってい';
  const f = { script, cast, panel, page, view, file, help, ai }[S.kind] || panel;
  box.appendChild(f());
  box.scrollTop = keep;
}

/* ---------- 小さい 部品 ---------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(label, cls, fn, title) {
  const b = el('button', cls || 'btn-sm', label);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', fn);
  return b;
}
const h2 = t => el('h2', '', t);
const note = t => el('div', 'empty', t);
function row(label, ...kids) {
  const r = el('div', 'row');
  if (label != null) r.appendChild(el('label', '', label));
  kids.forEach(k => r.appendChild(k));
  return r;
}
function choice(list, cur, fn) {
  const g = el('div', 'grid');
  list.forEach(([v, name]) => {
    const b = btn(name, 'btn-sm' + (v === cur ? ' on' : ''), () => fn(v));
    g.appendChild(b);
  });
  return g;
}
function select(list, cur, fn) {
  const s = el('select');
  list.forEach(v => { const o = el('option', '', v); o.value = v; if (v === cur) o.selected = true; s.appendChild(o); });
  s.addEventListener('change', () => fn(s.value));
  return s;
}
/* つまみ（rslider が 置きかえる）。ドラッグ中は 絵だけ 変えて、はなしたら 1回ぶん もどせる ように */
function slider(min, max, step, val, live, name) {
  const r = el('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
  const out = el('span', 'val', String(val));
  r.addEventListener('input', () => { beginEdit(); live(+r.value); out.textContent = r.value; api.stage(); });
  r.addEventListener('change', () => commitEdit(name));
  const w = el('div', 'slide');
  w.append(r, out);
  return w;
}
function textarea(val, rows, ph) {
  const t = el('textarea', 'textin');
  t.value = val || ''; t.rows = rows; if (ph) t.placeholder = ph;
  return t;
}

/* ---------- 台本 ---------- */
function script() {
  const w = el('div');
  w.appendChild(h2('台本を はりつける'));
  const t = textarea(S.proj.script, 12, '### 1ページ目\n| コマ | 大きさ | 絵 | セリフ・効果音 |\n|---|---|---|---|\n| ① | 大 | ヒナタが 走る | ヒナタ：「まって！」 |');
  t.id = 'scriptIn';
  w.appendChild(t);
  const rb = el('div', 'rowbtns');
  rb.append(
    btn('📥 読みこむ', 'btn-y', () => api.importScript(t.value), 'いまの ページを ぜんぶ 入れかえます'),
    btn('📂 ファイル', '', () => api.pickScript(), '.md や .txt を 読みこむ'),
  );
  w.appendChild(rb);
  const rb2 = el('div', 'rowbtns');
  rb2.append(
    btn('🪄 AIで 表に する', '', async () => { const out = await api.aiTable(t.value); if (out) { t.value = out; toast('できた 表を 見てから「読みこむ」を おして ください'); } }, 'あらすじや ふつうの 台本を、読める 表に 書きなおします'),
    btn('見本を 入れる', '', () => { t.value = api.sample(); }));
  w.appendChild(rb2);
  w.appendChild(note(
    '読める 形\n' +
    '「1ページ目」「12〜13ページ目」で ページが かわります\n' +
    '表は | か タブで くぎる（コマ・大きさ・絵・セリフ）\n' +
    '大きさ … 大・中・小・横長・ページの約3/4・見開き\n' +
    'セリフ … 名前：「…」／名前（モノローグ）：「…」\n' +
    '効果音：`ドン`／看板：「…」／タイトル：『…』\n' +
    '（引き）と 書くと ページを めくる しるしが つきます'));
  return w;
}

/* ---------- キャラ ---------- */
function cast() {
  const w = el('div');
  const P = S.proj;
  if (!P.cast.length) w.appendChild(note('台本の セリフから 名前を 見つけて ここに ならべます'));
  P.cast.forEach(c => {
    const card = el('div', 'castcard');
    const head = el('div', 'casthead');
    const chip = el('span', 'facechip');
    chip.innerHTML = faceChip(c, 'ふつう', P.style);
    const name = el('input'); name.value = c.name;
    name.addEventListener('change', () => edit('名前', () => {
      const old = c.name, nw = name.value.trim() || old;
      c.name = nw;
      for (const pg of P.pages) for (const p of pg.panels) for (const l of p.lines) if (l.who === old) l.who = nw;
    }));
    head.append(chip, name, btn('🗑', 'btn-sm btn-p', () => edit('キャラを けす', () => {
      P.cast = P.cast.filter(x => x !== c);
      for (const pg of P.pages) for (const p of pg.panels) p.figs = p.figs.filter(f => f.id !== c.id);
    }), 'けす'));
    card.appendChild(head);
    card.appendChild(row('しゅるい', choice([['human', 'ひと'], ['mascot', 'マスコット']], c.kind, v => edit('しゅるい', () => { c.kind = v; }))));
    if (c.kind !== 'mascot') card.appendChild(row('髪がた', select(HAIRS.map(h => h[1]), (HAIRS.find(h => h[0] === c.hair) || HAIRS[0])[1], v => edit('髪がた', () => { c.hair = HAIRS.find(h => h[1] === v)[0]; }))));
    card.appendChild(row(c.kind === 'mascot' ? '色' : '髪の色', choice(TONES, c.tone, v => edit('色', () => { c.tone = v; }))));
    card.appendChild(row('背', slider(60, 120, 1, Math.round((c.h || 1) * 100), v => { c.h = v / 100; }, '背')));
    w.appendChild(card);
  });
  const rb = el('div', 'rowbtns');
  rb.append(btn('＋ ひとを 足す', '', () => edit('キャラを 足す', () => {
    P.cast.push({ id: uid(), name: 'だれか' + (P.cast.length + 1), kind: 'human', hair: 'short', tone: 'black', h: 1 });
  })));
  w.appendChild(rb);
  return w;
}

/* ---------- コマ ---------- */
function panel() {
  const w = el('div');
  const p = selPanel();
  if (!p) { w.appendChild(note('絵の コマを タップすると\nここで なおせます')); return w; }
  const P = S.proj, pg = P.pages[S.sel.pg];
  const head = el('div', 'row');
  head.append(
    el('span', 'title', `${pg.no}${pg.spread ? '〜' + (pg.no2 || pg.no + 1) : ''}ページ　コマ${S.sel.i + 1}`),
    el('span', 'spacer'),
    btn('◂', 'btn-sm', () => api.step(-1), 'まえの コマ'),
    btn('▸', 'btn-sm', () => api.step(1), 'つぎの コマ'));
  w.appendChild(head);

  w.appendChild(h2('大きさ'));
  const sz = SIZES.filter(s => s[0] !== 'full' || pg.spread);
  w.appendChild(choice(sz, p.size, v => edit('大きさ', () => { p.size = v; p.frac = 0; p.inset = ''; })));
  if (pg.spread && p.size !== 'full') {
    w.appendChild(row('すみ', choice([['tr', '右上'], ['tl', '左上'], ['br', '右下'], ['bl', '左下']], p.inset, v => edit('すみ', () => { p.inset = v; }))));
  }
  w.appendChild(row(null, btn('引き（めくる しるし）', 'btn-sm' + (p.hook ? ' on' : ''), () => edit('引き', () => { p.hook = !p.hook; }))));

  w.appendChild(h2('出る人'));
  const who = el('div', 'grid');
  P.cast.forEach(c => {
    const on = p.figs.some(f => f.id === c.id);
    who.appendChild(btn(c.name, 'btn-sm' + (on ? ' on' : ''), () => edit('出る人', () => {
      if (on) p.figs = p.figs.filter(f => f.id !== c.id);
      else if (p.figs.length < 3) { p.figs.push({ id: c.id, expr: 'ふつう', pose: '立ち', flip: p.figs.length % 2 === 1 }); if (p.shot === 'none') p.shot = 'bust'; }
      else toast('1コマに 3人まで です');
    })));
  });
  w.appendChild(who);
  w.appendChild(row('うつり', choice(SHOTS, p.shot, v => edit('うつり', () => { p.shot = v; }))));
  if (p.shot === 'obj') {
    const o = el('input'); o.value = p.obj || ''; o.placeholder = 'モノの 名前';
    o.addEventListener('change', () => edit('モノ', () => { p.obj = o.value.trim(); }));
    w.appendChild(row('モノ', o));
  }
  p.figs.forEach(f => {
    const c = P.cast.find(x => x.id === f.id);
    if (!c) return;
    const card = el('div', 'castcard');
    card.appendChild(el('div', 'figname', c.name));
    card.appendChild(row('顔', select(EXPR_NAMES, f.expr, v => edit('顔', () => { f.expr = v; }))));
    card.appendChild(row('ポーズ', select(POSE_NAMES, f.pose, v => edit('ポーズ', () => { f.pose = v; })),
      btn('⇆', 'btn-sm' + (f.flip ? ' on' : ''), () => edit('左右', () => { f.flip = !f.flip; }), '左右を 入れかえる')));
    w.appendChild(card);
  });

  w.appendChild(h2('絵の メモ'));
  const memo = textarea(p.memo, 3);
  memo.addEventListener('change', () => edit('メモ', () => { p.memo = memo.value; }));
  w.appendChild(memo);
  w.appendChild(row(null,
    btn('メモから 決めなおす', 'btn-sm', () => edit('決めなおす', () => { autoPanel(p, P.cast); }), '出る人・顔・ポーズを メモから もう一度 決めます'),
    btn('🪄 AIで このコマ', 'btn-sm', () => api.aiDirect('panel'), 'AI に 出る人・顔・ポーズ・うつりを 考えて もらいます')));

  w.appendChild(h2('セリフ（1行に 1つ）'));
  const ln = textarea(linesToText(p.lines), 4, 'ヒナタ：「セリフ」\n効果音：`ドン`');
  ln.addEventListener('change', () => edit('セリフ', () => {
    p.lines = parseLines(ln.value);
    for (const l of p.lines) {
      if (!l.who || P.cast.some(c => c.name === l.who)) continue;
      const hit = P.cast.find(c => l.who.includes(c.name));
      if (hit) l.who = hit.name;
      else if (l.who.length <= 8 && (l.kind === 'talk' || l.kind === 'shout' || l.kind === 'think' || l.kind === 'mono'))
        P.cast.push({ id: uid(), name: l.who, kind: 'human', hair: 'short', tone: 'gray', h: 1 });
    }
  }));
  w.appendChild(ln);

  w.appendChild(h2('コマ'));
  const rb = el('div', 'rowbtns');
  rb.append(
    btn('＋ 足す', '', () => { edit('コマを 足す', () => { const q = newPanel(); q.shot = 'none'; pg.panels.splice(S.sel.i + 1, 0, q); }); api.select(S.sel.pg, S.sel.i + 1); }),
    btn('◂ まえへ', '', () => move(pg, -1)),
    btn('うしろへ ▸', '', () => move(pg, 1)),
    btn('🗑', 'btn-p', () => {
      if (pg.panels.length <= 1) { toast('さいごの 1コマは けせません'); return; }
      const i = S.sel.i;
      edit('コマを けす', () => { pg.panels.splice(i, 1); });
      api.select(S.sel.pg, Math.min(i, pg.panels.length - 1));
    }));
  w.appendChild(rb);
  return w;
}
function move(pg, d) {
  const i = S.sel.i, j = i + d;
  if (j < 0 || j >= pg.panels.length) return;
  edit('ならびかえ', () => { const [x] = pg.panels.splice(i, 1); pg.panels.splice(j, 0, x); });
  api.select(S.sel.pg, j);
}

/* ---------- ページ ---------- */
function page() {
  const w = el('div');
  const P = S.proj;
  const sh = sheetsOf(P)[S.sheet];
  w.appendChild(h2('コマ割り'));
  w.appendChild(row('傾き', slider(0, 100, 1, P.tilt || 0, v => { P.tilt = v; }, '傾き')));
  w.appendChild(row(null, btn('🎲 ここを 割りなおす', 'btn-sm btn-y', () => api.reroll(), 'いま 見て いる ページの 幅や 傾きを かえます'),
    btn('🎲 ぜんぶ', 'btn-sm', () => edit('ぜんぶ 割りなおす', () => { P.pages.forEach(pg => { pg.seed = 1 + Math.floor(Math.random() * 9999); }); }))));
  if (sh) sh.items.forEach(it => {
    const pg = P.pages[it.pg];
    if (!pg) return;
    const card = el('div', 'castcard');
    const ttl = el('input'); ttl.value = pg.title || ''; ttl.placeholder = 'ページの メモ';
    ttl.addEventListener('change', () => edit('ページの メモ', () => { pg.title = ttl.value; }));
    card.appendChild(row(`${pg.no}${pg.spread ? '〜' + (pg.no2 || pg.no + 1) : ''}P`, ttl));
    card.appendChild(row(null,
      btn('見開き', 'btn-sm' + (pg.spread ? ' on' : ''), () => edit('見開き', () => {
        pg.spread = !pg.spread;
        if (pg.spread) { pg.no2 = pg.no + 1; if (!pg.panels.some(p => p.size === 'full')) pg.panels[0].size = 'full'; }
        else { pg.no2 = 0; pg.panels.forEach(p => { if (p.size === 'full') p.size = 'big'; p.inset = ''; }); }
        renumber(P);
      })),
      btn('＋ うしろに ページ', 'btn-sm', () => edit('ページを 足す', () => {
        const np = newPage(pg.no + 1); const q = newPanel(); q.shot = 'none'; np.panels.push(q);
        P.pages.splice(it.pg + 1, 0, np); renumber(P);
      })),
      btn('🗑', 'btn-sm btn-p', () => {
        if (P.pages.length <= 1) { toast('さいごの 1ページは けせません'); return; }
        edit('ページを けす', () => { P.pages.splice(it.pg, 1); renumber(P); });
        S.sel = null;
      }, 'この ページを けす')));
    w.appendChild(card);
  });
  w.appendChild(note('ページ番号は 上から じゅんに つけなおします\n見開きは 2ページぶん'));
  return w;
}
export function renumber(P) {
  let n = P.pages.length ? P.pages[0].no || 1 : 1;
  for (const pg of P.pages) { pg.no = n; if (pg.spread) { pg.no2 = n + 1; n += 2; } else { pg.no2 = 0; n += 1; } }
}

/* ---------- 表示 ---------- */
function view() {
  const w = el('div');
  const P = S.proj, v = P.show;
  w.appendChild(h2('見かた'));
  w.appendChild(row('ならび', choice([['spread', '見開き'], ['single', '1ページ']], P.view, x => edit('見かた', () => { P.view = x; S.sheet = 0; }))));
  w.appendChild(row('1ページ目', choice([[true, '左'], [false, '右']], P.firstLeft !== false, x => edit('1ページ目', () => { P.firstLeft = x; }))));
  w.appendChild(row('素体', choice([['real', '頭身あり'], ['chibi', 'ミニキャラ']], P.style, x => edit('素体', () => { P.style = x; }))));
  w.appendChild(h2('出す もの'));
  const g = el('div', 'grid');
  [['memo', '絵の メモ'], ['no', '番号'], ['fig', '素体'], ['bub', 'フキダシ'], ['se', '効果音']].forEach(([k, n]) => {
    g.appendChild(btn(n, 'btn-sm' + (v[k] !== false ? ' on' : ''), () => edit(n, () => { v[k] = v[k] === false; })));
  });
  w.appendChild(g);
  return w;
}

/* ---------- さくひん ---------- */
function file() {
  const w = el('div');
  const P = S.proj;
  w.appendChild(h2('名前'));
  const t = el('input'); t.value = P.title;
  t.addEventListener('change', () => edit('名前', () => { P.title = t.value.trim() || 'むだい'; }));
  w.appendChild(row('作品名', t));
  const f = el('input'); f.value = P.folder || ''; f.placeholder = 'piyokichi など';
  f.addEventListener('change', () => edit('フォルダ名', () => { P.folder = f.value.replace(/[^A-Za-z0-9_-]/g, ''); }));
  w.appendChild(row('フォルダ名', f));
  w.appendChild(note('書き出しの ファイル名は「作品名＋ページ数」\nフォルダ名は 半角英数字'));
  w.appendChild(h2('書き出す'));
  const r1 = el('div', 'rowbtns');
  r1.append(btn('⬇ ぜんぶ PNG（ZIP）', 'btn-y', () => api.exportAll()), btn('🖼 いまの ページ', '', () => api.exportNow()));
  w.appendChild(r1);
  w.appendChild(h2('作品ファイル'));
  const r2 = el('div', 'rowbtns');
  r2.append(btn('💾 保存', '', () => api.saveFile()), btn('📂 ひらく', '', () => api.loadFile()));
  w.appendChild(r2);
  const r3 = el('div', 'rowbtns');
  r3.append(btn('🗑 まっさらに する', 'btn-p', () => api.clearAll()));
  w.appendChild(r3);
  return w;
}

function help() {
  const w = el('div', 'doc');
  w.innerHTML = `
  <h3>1. 台本を はる</h3>
  <p>「台本」に ネームの 表を はりつけて「読みこむ」。ページ・コマ割り・キャラ・フキダシを いっぺんに 作ります。</p>
  <h3>2. コマを なおす</h3>
  <p>絵の コマを タップ。大きさ・出る人・顔・ポーズ・セリフを なおせます。「メモから 決めなおす」で もう一度 自動で 決めます。</p>
  <h3>3. キャラ</h3>
  <p>髪がた・髪の 色・背の 高さ。着ぐるみなどは「マスコット」に。</p>
  <h3>4. 書き出す</h3>
  <p>ページごとの PNG を ZIP に まとめます。見開きは 2まいに 分けます。</p>
  <h3>ゆび</h3>
  <ul><li>2本指で トン … もどす</li><li>3本指で トン … やりなおし</li><li>2本指で つまむ … 大きく／小さく</li></ul>`;
  return w;
}

/* ---------- AI ---------- */
let MODELS = [];
function ai() {
  const w = el('div');
  const c = aiConf();
  w.appendChild(h2('つなぐ AI'));
  const url = el('input'); url.value = c.url; url.placeholder = 'http://192.168.0.10:11434/v1';
  url.addEventListener('change', () => { saveConf({ ...aiConf(), url: url.value.trim() }); MODELS = []; draw(); });
  w.appendChild(row('入口', url));
  const list = MODELS.length ? MODELS : (c.model ? [c.model] : []);
  const ms = select(['（さいしょの もの）', ...list], c.model || '（さいしょの もの）', v => saveConf({ ...aiConf(), model: v.startsWith('（') ? '' : v }));
  w.appendChild(row('モデル', ms, btn('🔄', 'btn-sm', async () => { const m = await api.aiModels(); if (m) { MODELS = m; draw(); toast(m.length + 'こ 見つかりました'); } }, 'モデルの 一覧を 読む')));
  const key = el('input'); key.type = 'password'; key.value = c.key; key.placeholder = 'いらない ときは 空で';
  key.addEventListener('change', () => saveConf({ ...aiConf(), key: key.value.trim() }));
  w.appendChild(row('キー', key));
  w.appendChild(row(null, btn('つながるか ためす', 'btn-sm', () => api.aiTest())));
  if (blocked(c)) w.appendChild(note('いまの ページは https なので http の AI に つながりません\nランチャー（http）から ひらいて ください'));

  w.appendChild(h2('AI に まかせる'));
  const r1 = el('div', 'rowbtns');
  r1.append(btn('🪄 ぜんぶの コマ', 'btn-y', () => api.aiDirect('all'), '出る人・顔・ポーズ・うつりを ぜんぶの コマで 考えます'),
    btn('🪄 この ページ', '', () => api.aiDirect('sheet')));
  w.appendChild(r1);
  const r2 = el('div', 'rowbtns');
  r2.append(btn('🪄 キャラの 見た目', '', () => api.aiCast(), '髪がた・髪の 色・背を 絵の 説明から 決めます'));
  w.appendChild(r2);
  w.appendChild(note('「台本」の「AIで 表に する」で、あらすじを 表に できます\nAI の 結果は「もどす」で 1回で もどせます\n\nつながらない とき\nOllama … OLLAMA_ORIGINS=* を つけて 起動\nLM Studio … サーバーの CORS を オン'));
  return w;
}
