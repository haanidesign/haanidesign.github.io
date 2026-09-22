/* せってい。ひろい よこ画面では 右に つけっぱなし、
   せまい ときは 下から 出る 幕に 入る。中身は 同じ もの。 */
import {
  S, $, $$, clamp, r2, tc, toast, duration, allClips, findClip, selected,
  snap as pushUndo
} from '../state.js';
import { MEDIA, paintPoster, mediaLabel, importFiles } from '../media.js';
import { bus } from '../bus.js';
import {
  addFromMedia, addText, addLyrics, delSel, dupSel,
  addTrack, moveTrack, delTrack, renameTrack, saveProject, relink
} from '../edit.js';

const DOCK_Q = '(min-width:980px) and (orientation:landscape)';
export const docked = () => window.matchMedia(DOCK_Q).matches;

let kind = 'auto';
let sheetOn = false;

export function open(k) {
  kind = k || 'auto';
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
export function init() {
  $('#sheetBack').addEventListener('click', close);
  window.matchMedia(DOCK_Q).addEventListener('change', () => { close(); draw(); });
}

/* ---------- 書きだし ---------- */
export function draw() {
  const f = selected();
  if (kind === 'auto' && f) kind = 'form';
  if (!docked() && !sheetOn) return;          // 幕が 閉じて いる ときは なにも しない
  const box = docked() ? $('#propBody') : $('#sheet');
  box.innerHTML = '';
  if (!docked()) {
    const h = el('div', 'sheet-ttl');
    h.append(chipTtl(titleOf()), el('span', 'spacer'), btn('とじる', 'btn-sm btn-g', close));
    box.appendChild(h);
  } else {
    $('#propTtl').textContent = titleOf();
  }
  box.appendChild(body());
}
function titleOf() {
  return ({
    bin: '素材だな', form: 'ふだ', color: 'ふだ', sound: 'ふだ', text: 'もじ',
    lyric: 'うた', track: 'だん', file: 'さくひん', setting: 'せってい', help: 'つかいかた'
  })[kind] || 'せってい';
}

/* ---------- 小さい 部品 ---------- */
function el(tag, cls, txt) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (txt !== undefined) d.textContent = txt;
  return d;
}
function chipTtl(t) { const s = el('span', 'title'); s.textContent = t; return s; }
function btn(label, cls, fn) {
  const b = el('button', cls || 'btn-sm');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}
function group(title, nodes) {
  const g = el('div', 'pgroup');
  g.appendChild(chipTtl(title));
  nodes.filter(Boolean).forEach(n => g.appendChild(n));
  return g;
}
function row(label, node, valNode) {
  const r = el('div', 'row');
  if (label !== null) r.appendChild(el('label', null, label));
  r.appendChild(node);
  if (valNode) r.appendChild(valNode);
  return r;
}
function range(label, val, min, max, step, unit, fn) {
  const i = el('input'); i.type = 'range';
  i.min = min; i.max = max; i.step = step; i.value = val;
  const v = el('span', 'val dot', r2(val) + (unit || ''));
  i.addEventListener('input', () => { v.textContent = r2(+i.value) + (unit || ''); fn(+i.value, false); });
  i.addEventListener('change', () => { fn(+i.value, true); pushUndo(); });
  return row(label, i, v);
}
function pick(label, opts, val, fn) {
  const s = el('select');
  opts.forEach(([v, l]) => { const o = el('option', null, l); o.value = v; s.appendChild(o); });
  s.value = String(val);
  s.addEventListener('change', () => { fn(s.value); pushUndo(); });
  return row(label, s);
}
function color(label, val, fn) {
  const i = el('input'); i.type = 'color'; i.value = val;
  i.addEventListener('input', () => fn(i.value));
  i.addEventListener('change', pushUndo);
  return row(label, i);
}
function num(label, val, step, fn) {
  const i = el('input'); i.type = 'number'; i.step = step; i.value = r2(val);
  i.addEventListener('change', () => { fn(+i.value); pushUndo(); });
  return row(label, i);
}
function grid(label, items) {
  const r = el('div', 'row');
  if (label !== null) r.appendChild(el('label', null, label));
  const g = el('div', 'grid');
  items.forEach(n => g.appendChild(n));
  r.appendChild(g);
  return r;
}
const live = () => { bus.stage(); bus.tl(); };

/* ---------- 中身 ---------- */
function body() {
  const f = selected();
  switch (kind) {
    case 'bin': return binBody();
    case 'track': return trackBody();
    case 'file': return fileBody();
    case 'setting': return settingBody();
    case 'help': return helpBody();
    case 'lyric': return lyricBody();
    default: return f ? clipBody(f.c) : noSel();
  }
}
function noSel() {
  const w = el('div');
  w.appendChild(el('div', 'empty', 'タイムラインの ふだを さわると\nここに 設定が 出ます'));
  w.appendChild(settingBody());
  return w;
}

/* --- 素材だな --- */
function binBody() {
  const w = el('div');
  w.appendChild(group('とりこむ', [
    grid(null, [
      btn('📥 ファイルを えらぶ', 'btn-y', () => $('#file').click()),
      btn('🔗 つなぎ直す', 'btn-sm', relink)
    ]),
    hint('動画・画像・音を そのまま この画面に おとしても 入る。')
  ]));
  const list = el('div', 'binlist');
  if (!MEDIA.size) list.appendChild(el('div', 'empty', 'まだ なにも ない'));
  MEDIA.forEach(m => {
    const d = el('div', 'mitem');
    d.draggable = true;
    d.addEventListener('dragstart', e => e.dataTransfer.setData('text/mid', m.id));
    if (m.kind === 'audio' || !m.poster) {
      const ic = el('div', 'ic', { video: '🎞', image: '🖼', audio: '🎵' }[m.kind]);
      d.appendChild(ic);
    } else {
      const cv = el('canvas'); cv.width = 168; cv.height = 96;
      d.appendChild(cv); paintPoster(cv, m, false);
    }
    const nm = el('div', 'nm', m.name); nm.title = m.name;
    d.appendChild(nm);
    d.appendChild(el('div', 'sub dot', mediaLabel(m)));
    d.appendChild(btn('＋ おく', 'btn-sm btn-y', () => { addFromMedia(m, S.time); if (!docked()) close(); }));
    list.appendChild(d);
  });
  w.appendChild(group('素材', [list]));
  return w;
}
function hint(t) { const h = el('div', 'hint'); h.innerHTML = t; return h; }

/* --- ふだ --- */
function clipBody(c) {
  const w = el('div');
  const m = c.mid ? MEDIA.get(c.mid) : null;

  w.appendChild(group('いつ', [
    num('はじまり', c.start, .05, v => { c.start = Math.max(0, v); bus.all(); }),
    num('ながさ', c.dur, .05, v => { c.dur = Math.max(1 / S.fps, v); bus.all(); }),
    range('入り', c.fin, 0, 3, .05, 's', v => { c.fin = v; live(); }),
    range('出', c.fout, 0, 3, .05, 's', v => { c.fout = v; live(); }),
    (c.kind === 'video' || c.kind === 'audio')
      ? range('はやさ', c.speed, .25, 4, .05, 'x', v => {
        c.speed = v;
        if (m) c.dur = Math.min(c.dur, (m.dur - c.inp) / v);
        live();
      }) : null,
    grid(null, [
      btn('✂ ここで 切る', 'btn-sm btn-y', () => bus.split()),
      btn('⧉ ふやす', 'btn-sm', dupSel),
      btn('⇤ 頭出し', 'btn-sm', () => { c.start = S.time; pushUndo(); bus.all(); }),
      btn('🗑 けす', 'btn-sm btn-p', () => { delSel(); if (!docked()) close(); })
    ])
  ]));

  if (c.kind !== 'audio') {
    {
      w.appendChild(group('かたち', [
        range('よこ', c.x, -S.W, S.W, 1, '', v => { c.x = v; live(); }),
        range('たて', c.y, -S.H, S.H, 1, '', v => { c.y = v; live(); }),
        range('大きさ', c.scale, .05, 4, .01, 'x', v => { c.scale = v; live(); }),
        range('かたむき', c.rot, -180, 180, 1, '°', v => { c.rot = v; live(); }),
        range('すけ', c.opacity, 0, 1, .01, '', v => { c.opacity = v; live(); }),
        c.kind !== 'text'
          ? pick('おさめ方', [['contain', 'ぜんぶ 入れる'], ['cover', '画面を うめる'], ['fill', 'ひきのばす']],
            c.fit, v => { c.fit = v; live(); }) : null,
        pick('出かた', [['none', 'そのまま'], ['fade', 'じわっ'], ['up', '下から'],
        ['zoom', 'ズーム'], ['kenburns', 'ゆっくり寄る']], c.anim, v => { c.anim = v; live(); }),
        grid('まん中へ', [
          btn('↔ よこ', 'btn-sm', () => { c.x = 0; pushUndo(); live(); }),
          btn('↕ たて', 'btn-sm', () => { c.y = 0; pushUndo(); live(); }),
          btn('⤢ 画面いっぱい', 'btn-sm', () => { c.x = c.y = 0; c.scale = 1; c.fit = 'cover'; pushUndo(); live(); })
        ])
      ]));
    }
  }

  if (c.kind === 'text') {
    const T = c.text;
    const ta = el('textarea'); ta.rows = 3; ta.value = T.str;
    ta.addEventListener('input', () => { T.str = ta.value; live(); });
    ta.addEventListener('change', pushUndo);
    w.appendChild(group('もじ', [
      row(null, ta),
      range('大きさ', T.size, 12, 320, 1, 'px', v => { T.size = v; live(); }),
      color('色', T.color, v => { T.color = v; live(); }),
      color('ふち色', T.stroke, v => { T.stroke = v; live(); }),
      range('ふち', T.sw, 0, 36, 1, 'px', v => { T.sw = v; live(); }),
      pick('よせ', [['center', 'まんなか'], ['left', 'ひだり'], ['right', 'みぎ']], T.align, v => { T.align = v; live(); }),
      pick('ふとさ', [['400', 'ほそい'], ['700', 'ふつう'], ['800', 'ふとい']], T.weight, v => { T.weight = +v; live(); }),
      grid('ふだ地', [
        btn(T.bgOn ? 'あり' : 'なし', 'btn-sm' + (T.bgOn ? ' on' : ''), () => { T.bgOn = !T.bgOn; pushUndo(); live(); draw(); })
      ]),
      T.bgOn ? color('ふだ地の色', T.bgColor, v => { T.bgColor = v; live(); }) : null
    ]));
  }

  if (c.kind === 'video' || c.kind === 'image') {
    const F = c.fx;
    w.appendChild(group('いろ', [
      range('あかるさ', F.br, 0, 300, 1, '%', v => { F.br = v; live(); }),
      range('こさ', F.ct, 0, 300, 1, '%', v => { F.ct = v; live(); }),
      range('あざやか', F.sa, 0, 300, 1, '%', v => { F.sa = v; live(); }),
      range('ぼかし', F.bl, 0, 40, .5, 'px', v => { F.bl = v; live(); }),
      range('色まわし', F.hue, -180, 180, 1, '°', v => { F.hue = v; live(); }),
      range('セピア', F.sepia, 0, 100, 1, '%', v => { F.sepia = v; live(); }),
      grid('きまり', [
        ['もどす', { br: 100, ct: 100, sa: 100, bl: 0, hue: 0, sepia: 0 }],
        ['しろくろ', { br: 105, ct: 110, sa: 0, bl: 0, hue: 0, sepia: 0 }],
        ['ふるい', { br: 105, ct: 95, sa: 70, bl: 0, hue: 0, sepia: 55 }],
        ['つよい', { br: 105, ct: 130, sa: 130, bl: 0, hue: 0, sepia: 0 }],
        ['ゆめ', { br: 112, ct: 92, sa: 120, bl: 1.5, hue: 0, sepia: 0 }]
      ].map(([n, p]) => btn(n, 'btn-sm', () => { Object.assign(c.fx, p); pushUndo(); live(); draw(); })))
    ]));
  }

  if (c.kind === 'video' || c.kind === 'audio') {
    w.appendChild(group('おと', [
      range('おおきさ', c.vol, 0, 2, .01, 'x', v => { c.vol = v; live(); })
    ]));
  }
  if (m && m.kind !== 'image') {
    w.appendChild(hint(`もとの 素材: ${m.name}<br>${r2(m.dur)}s の うち ${r2(c.inp)}s から つかって いる`));
  }
  return w;
}

/* --- だん --- */
function trackBody() {
  const w = el('div');
  w.appendChild(group('だんを 足す', [
    grid(null, [
      btn('🎞 映像', 'btn-sm', () => { addTrack('video'); draw(); }),
      btn('🎵 音', 'btn-sm', () => { addTrack('audio'); draw(); }),
      btn('🅰 文字', 'btn-sm', () => { addTrack('text'); draw(); })
    ])
  ]));
  const rows = S.tracks.map((t, i) => {
    const r = el('div', 'row');
    const nm = el('input'); nm.type = 'text'; nm.value = t.name;
    nm.addEventListener('change', () => { renameTrack(t.id, nm.value.trim()); draw(); });
    r.appendChild(el('label', null, { video: '🎞', audio: '🎵', text: '🅰' }[t.kind]));
    r.appendChild(nm);
    const g = el('div', 'grid');
    g.appendChild(btn('▲', 'btn-sm', () => { moveTrack(t.id, -1); draw(); }));
    g.appendChild(btn('▼', 'btn-sm', () => { moveTrack(t.id, 1); draw(); }));
    g.appendChild(btn('🗑', 'btn-sm btn-p', () => { delTrack(t.id); draw(); }));
    r.appendChild(g);
    return r;
  });
  w.appendChild(group('ならび（上が 手前）', rows));
  return w;
}

/* --- うた --- */
function lyricBody() {
  const w = el('div');
  const ta = el('textarea'); ta.rows = 8;
  ta.placeholder = '0:00 さいしょの 行\nつぎの 行\nそのつぎの 行';
  const from = el('input'); from.type = 'number'; from.step = .1; from.value = r2(S.time);
  const each = el('input'); each.type = 'number'; each.step = .1; each.value = 2.5;
  const gap = el('input'); gap.type = 'number'; gap.step = .1; gap.value = 0;
  const size = el('input'); size.type = 'number'; size.step = 2; size.value = 64;
  w.appendChild(group('うたを 流しこむ', [
    hint('1行 ＝ 1まいの もじふだ。<br>行の あたまに <b>0:12</b> と 書くと そこに 置く。'),
    row('はじめ', from), row('1行ぶん', each), row('すきま', gap), row('大きさ', size),
    row(null, ta),
    grid(null, [btn('ならべる', 'btn-y', () => {
      const n = addLyrics(ta.value, {
        from: +from.value || 0, each: Math.max(.2, +each.value || 2.5),
        gap: +gap.value || 0, size: +size.value || 64
      });
      if (n) { toast(n + '行 ならべた'); if (!docked()) close(); else { kind = 'form'; draw(); } }
    })])
  ]));
  return w;
}

/* --- さくひん --- */
function fileBody() {
  const w = el('div');
  const nm = el('input'); nm.type = 'text'; nm.value = 'douga';
  w.appendChild(group('組み立てを しまう', [
    row('名前', nm),
    grid(null, [
      btn('💾 保存', 'btn-y', () => saveProject(nm.value.trim() || 'douga')),
      btn('📂 ひらく', 'btn-sm', () => $('#fileProj').click())
    ]),
    hint('入るのは 組み立てだけ。動画そのものは 入らない。<br>ひらいた あと、同じ名前の 素材を もう一度 とりこめば つながる。')
  ]));
  w.appendChild(group('書き出す', [
    grid(null, [btn('▶ 動画に する', 'btn-g', () => bus.export())]),
    hint('さいしょから おわりまで 通しで 録る。<br>その あいだ この画面を ほかの ものに かえない。')
  ]));
  return w;
}

/* --- せってい --- */
function settingBody() {
  const w = el('div');
  w.appendChild(group('作品の かたち', [
    pick('大きさ', [
      ['1280x720', '1280×720 よこ'], ['1920x1080', '1920×1080 よこ'],
      ['1080x1080', '1080×1080 しかく'], ['1080x1920', '1080×1920 たて'],
      ['854x480', '854×480 かるい']
    ], `${S.W}x${S.H}`, v => {
      const [w2, h2] = v.split('x').map(Number);
      S.W = w2; S.H = h2; bus.size(); bus.all();
    }),
    pick('コマ数', [['24', '24 fps'], ['30', '30 fps'], ['60', '60 fps']], S.fps, v => { S.fps = +v; bus.all(); }),
    color('下じき', S.bg, v => { S.bg = v; bus.stage(); })
  ]));
  w.appendChild(group('タイムライン', [
    grid('くっつき', [
      btn(S.snap ? '🧲 あり' : '🧲 なし', 'btn-sm' + (S.snap ? ' on' : ''), () => { S.snap = !S.snap; bus.all(); draw(); })
    ]),
    grid('見わたす', [btn('⤢ 全体を 出す', 'btn-sm', () => bus.fit())])
  ]));
  return w;
}

/* --- つかいかた --- */
function helpBody() {
  const w = el('div', 'doc');
  w.innerHTML = `
  <p>ブラウザの 中だけで 動く。素材は どこにも 送られない。</p>
  <h3>1. 入れる</h3>
  <ul><li>左の <b>＋ついか</b>、または 画面に そのまま おとす</li>
  <li><b>🗂素材</b> の 札を タイムラインへ 引っぱる（<b>＋おく</b>でも いい）</li></ul>
  <h3>2. ならべる</h3>
  <ul><li>ふだの まん中を つかむと うごく。<b>左右の つまみ</b>で ながさ</li>
  <li>上下の 段へ 引っぱると 段を うつれる（音は 音の段だけ）</li>
  <li><b>✂きる</b>を えらぶと、さわった ところで 切れる</li>
  <li>下の <b>✂きる</b>は いまの 再生位置で 切る</li></ul>
  <h3>3. かたちを きめる</h3>
  <ul><li>絵を じかに 指で うごかせる。<b>2本指</b>で 大きさと かたむき</li>
  <li>右（せまい ときは 下から 出る 幕）で こまかい 数字</li></ul>
  <h3>4. 指の わざ</h3>
  <ul><li><b>2本指で トン</b> … もどす</li>
  <li><b>3本指で トン</b> … やりなおし</li>
  <li>タイムラインを <b>2本指で つまむ</b> … 時間じくを のばす／ちぢめる</li></ul>
  <h3>5. 書き出す</h3>
  <ul><li>右上の <b>▶書き出す</b>。通しで 録って WebM に する</li>
  <li>録って いる あいだは ほかの ことを しない</li></ul>
  <h3>ホーム画面に 置く</h3>
  <p>ブラウザの めにゅうから「ホーム画面に 追加」すると、
  ふつうの アプリと 同じ 顔で ひらく。</p>`;
  return w;
}
