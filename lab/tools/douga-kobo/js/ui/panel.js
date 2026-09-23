/* せってい。ひろい よこ画面では 右に つけっぱなし、
   せまい ときは 下から 出る 幕に 入る。中身は 同じ もの。 */
import {
  S, $, $$, clamp, r2, tc, toast, duration, clipEnd, allClips, findClip, selected,
  snap as pushUndo
} from '../state.js?v=25';
import { MEDIA, paintPoster, mediaLabel, importFiles, LOG } from '../media.js?v=25';
import { storeOk } from '../store.js?v=25';
import { bus } from '../bus.js?v=25';
import { autoCompose, autoApply, cutsOf, LAYOUTS, DECOR, BGS, PALETTES, MOODS, CAM_OPTS, UNIT_OPTS } from '../auto.js?v=25';
import { beatOn, beatSec, stepSec, guessBpm, tapTempo, analyse } from '../beat.js?v=25';
import { FX_IN, FX_OUT, FX_LOOP, EASES, ORDERS, fontList, addFontFile,
  offOf, setOff, clearOff } from '../text.js?v=25';
import {
  addFromMedia, addText, addColor, addLyrics, delSel, dupSel,
  addTrack, moveTrack, delTrack, renameTrack, saveProject, relink
} from '../edit.js?v=25';

const DOCK_Q = '(min-width:980px) and (orientation:landscape)';
export const docked = () => window.matchMedia(DOCK_Q).matches;

let kind = 'auto';
let sheetOn = false;

export function open(k) {
  kind = k || 'auto';
  // 「ふだ」を ひらいた のに 何も えらんで いない ときは、いまの ところの ふだを えらぶ
  if (kind === 'form' && !selected()) {
    const hit = allClips()
      .filter(({ c }) => S.time >= c.start && S.time < c.start + c.dur)
      .pop();
    if (hit) { S.sel = hit.c.id; S.selTrack = hit.t.id; S.selChar = null; bus.tl(); }
  }
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
    lyric: 'うた', beat: 'はやさ', master: 'しあげ', track: 'だん', file: 'さくひん', setting: 'せってい', help: 'つかいかた'
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
/* つまみの まちがい防止（アニメ工房と 同じ 考えかた）

   ・指で さわった だけでは 動かない。よこに 8px 動かして はじめて 効く
   ・はし と 0 には 吸いつく
   ・400ms 長おしすると「きりの いい 数字」だけを 通る
   ・数字の ところを おすと 打ちこめる（もとに もどすのも ここから） */
const NICE = [.01, .02, .05, .1, .2, .25, .5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
function niceStep(span) {
  const want = span / 10;
  return NICE.find(v => v >= want) || span;
}
function stopsFor(min, max) {
  const span = max - min;
  if (!(span > 0)) return [];
  const st = niceStep(span);
  const out = [];
  for (let v = Math.ceil(min / st) * st; v <= max + 1e-9; v += st) out.push(+v.toFixed(6));
  [min, max].forEach(q => { if (!out.some(v => Math.abs(v - q) < 1e-9)) out.push(q); });
  if (min < 0 && max > 0 && !out.some(v => Math.abs(v) < 1e-9)) out.push(0);
  if (span >= 180) [-180, -90, 90, 180].forEach(q => {
    if (q >= min && q <= max && !out.some(v => Math.abs(v - q) < 1e-9)) out.push(q);
  });
  return out.sort((a, b) => a - b);
}
let coarseTold = false;
function guardSlide(i, apply) {
  let x0 = 0, y0 = 0, v0 = null, armed = false, coarse = false, holdT = null;
  const PULL_PX = 7;
  const snapNear = () => {
    const min = +i.min, max = +i.max, step = +i.step || .001;
    const stops = coarse ? stopsFor(min, max)
      : [min, max].concat(min < 0 && max > 0 ? [0] : []);
    if (!stops.length) return;
    const w = i.getBoundingClientRect().width || 200;
    const tol = coarse ? Infinity : PULL_PX * ((max - min) / Math.max(1, w));
    const val = +i.value;
    let best = null, bd = Infinity;
    stops.forEach(st => { const d = Math.abs(val - st); if (d < bd) { bd = d; best = st; } });
    if (best === null || bd > tol) return;
    const fixed = +(Math.round(best / step) * step).toFixed(6);
    if (+i.value !== fixed) i.value = fixed;
  };
  i.addEventListener('pointerdown', e => {
    x0 = e.clientX; y0 = e.clientY; v0 = i.value;
    coarse = false; clearTimeout(holdT);
    holdT = setTimeout(() => {
      coarse = true; i.classList.add('coarse');
      if (!coarseTold) { coarseTold = true; toast('きりの いい 数字だけに なります'); }
    }, 400);
    armed = e.pointerType === 'mouse';
    if (armed) apply();
  });
  i.addEventListener('pointermove', e => {
    const dx = Math.abs(e.clientX - x0), dy = Math.abs(e.clientY - y0);
    if (!coarse && (dx > 10 || dy > 10)) clearTimeout(holdT);
    if (armed || v0 === null) return;
    if (dx >= 8 && dx > dy) { armed = true; apply(); }
  });
  i.addEventListener('input', () => {
    if (armed) { snapNear(); return apply(); }
    i.value = v0;                     // まだ その気が ないので もどす
  });
  const end = () => {
    armed = false; v0 = null; coarse = false;
    clearTimeout(holdT); i.classList.remove('coarse');
  };
  ['pointerup', 'pointercancel', 'blur'].forEach(ev => i.addEventListener(ev, end));
}

function range(label, val, min, max, step, unit, fn) {
  const i = el('input'); i.type = 'range';
  i.min = min; i.max = max; i.step = step; i.value = val;
  const start = val;                   // さわる まえの 数（もどす とき に つかう）
  const v = el('button', 'val dot', r2(val) + (unit || ''));
  v.type = 'button';
  v.title = 'おすと 数を 打ちこめる';
  const show = () => { v.textContent = r2(+i.value) + (unit || ''); };
  guardSlide(i, () => { show(); fn(+i.value, false); });
  i.addEventListener('change', () => { show(); fn(+i.value, true); pushUndo(); });
  // 数字を おす → 打ちこむ。から のまま OK すると さわる まえに もどる
  v.addEventListener('click', () => {
    const a = prompt(`${label}（${min}〜${max}）\nからのまま OK で さわる まえの ${r2(start)} に もどります`, r2(+i.value));
    if (a === null) return;
    const n = a.trim() === '' ? start : +a;
    if (!isFinite(n)) { toast('数字を 入れて'); return; }
    i.value = clamp(n, +min, +max);
    show(); fn(+i.value, true); pushUndo();
  });
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
    case 'beat': return beatBody();
    case 'master': return masterBody();
    default: return f ? clipBody(f.c) : noSel();
  }
}
function noSel() {
  const w = el('div');
  w.appendChild(el('div', 'empty', 'タイムラインの ふだを さわると\nここに 設定が 出ます'));
  const list = clipPicker();
  if (list) w.appendChild(list);
  w.appendChild(settingBody());
  return w;
}

/** ふだが さわれない ときの ための 一覧。ここから えらんでも 設定が 出る */
function clipPicker() {
  const all = allClips();
  if (!all.length) return null;
  const items = [];
  S.tracks.forEach(t => {
    if (!t.clips.length) return;
    const cs = t.clips.slice().sort((a, b) => a.start - b.start);
    const ttl = el('div', 'hint');
    const tb = el('b'); tb.textContent = t.name;   // 名前は そのまま 出す（タグに しない）
    ttl.appendChild(tb);
    items.push(ttl);
    const g = el('div', 'grid');
    cs.slice(0, 60).forEach(c => {
      const label = c.kind === 'text' ? (String(c.text && c.text.str || '').split('\n')[0] || 'もじ')
        : c.kind === 'color' ? 'いろ' : (c.name || '素材');
      g.appendChild(btn(r2(c.start) + 's ' + label, 'btn-sm' + (S.sel === c.id ? ' on' : ''), () => {
        S.sel = c.id; S.selTrack = t.id; S.selChar = null;
        kind = 'form';
        bus.all();
      }));
    });
    if (cs.length > 60) items.push(el('div', 'hint', `…ほかに ${cs.length - 60}まい`));
    items.push(g);
  });
  return group('ふだを えらぶ', [
    hint('ここから えらんでも おなじ 設定が 出ます。<br>タイムラインで さわれない ときに どうぞ。'),
    ...items
  ]);
}

/* --- 素材だな --- */
let binTab = 'all';
function binBody() {
  const w = el('div');
  w.appendChild(group('とりこむ', [
    grid(null, [
      btn('📥 ファイルを えらぶ', 'btn-y', () => $('#file').click()),
      btn('🎨 いろの ふだ', 'btn-sm', () => { addColor(S.time); if (!docked()) close(); else { kind = 'form'; draw(); } }),
      btn('🔗 つなぎ直す', 'btn-sm', relink)
    ]),
    grid('見るもの', [
      ['all', 'ぜんぶ'], ['visual', '絵'], ['audio', '音']
    ].map(([k, l]) => btn(l, 'btn-sm' + (binTab === k ? ' on' : ''), () => { binTab = k; draw(); }))),
    hint('動画・画像・音を そのまま この画面に おとしても 入る。')
  ]));

  const list = el('div', 'binlist');
  const items = [...MEDIA.values()].filter(m =>
    binTab === 'all' ? true : binTab === 'audio' ? m.kind === 'audio' : m.kind !== 'audio');
  if (!items.length) list.appendChild(el('div', 'empty', 'まだ なにも ない'));
  items.forEach(m => {
    const d = el('div', 'mitem');
    d.draggable = true;
    d.addEventListener('dragstart', e => e.dataTransfer.setData('text/mid', m.id));
    if (m.kind === 'audio' || !m.poster) {
      d.appendChild(el('div', 'ic', { video: '🎞', image: '🖼', audio: '🎵' }[m.kind]));
    } else {
      const cv = el('canvas'); cv.width = 168; cv.height = 96;
      d.appendChild(cv); paintPoster(cv, m, false);
    }
    const nm = el('div', 'nm', m.name); nm.title = m.name;
    d.appendChild(nm);
    let state = '';
    if (m.broken) state = ' ⚠ 鳴らせない';
    else if (m.kind !== 'image' && m.elOk === false) state = ' … 読みなおし中';
    const sub = el('div', 'sub dot', mediaLabel(m) + (m.bpm ? ' / ' + m.bpm + 'BPM' : '') + state);
    if (m.broken) sub.style.color = '#b0446a';
    d.appendChild(sub);
    d.appendChild(btn('＋ おく', 'btn-sm btn-y', () => { addFromMedia(m, S.time); if (!docked()) close(); }));
    const ops = el('div', 'grid');
    ops.style.marginTop = '.15rem';
    ops.appendChild(btn('✏', 'btn-sm', () => {
      const v = prompt('名前を かえる', m.name);
      if (v && v.trim()) { m.name = v.trim(); bus.all(); draw(); }
    }));
    ops.appendChild(btn('⇄', 'btn-sm', () => { bus.replaceMedia(m.id); }));
    ops.appendChild(btn('⤓', 'btn-sm', () => {
      if (!m.file) { toast('元の ファイルが ない'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(m.file); a.download = m.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }));
    ops.appendChild(btn('🗑', 'btn-sm btn-p', () => {
      const used = allClips().some(({ c }) => c.mid === m.id);
      if (used && !confirm('タイムラインでも つかって います。けしますか？')) return;
      MEDIA.delete(m.id); bus.all(); draw();
    }));
    d.appendChild(ops);
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
      c.kind !== 'text'
        ? range('うごきの あと', c.mblur || 0, 0, 1, .05, '', v => { c.mblur = v; live(); })
        : null,
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
      pick('書たい', fontList(), T.font || 'rounded', v => { T.font = v; live(); }),
      grid('しくみ', [
        btn(T.vertical ? 'たて書き' : 'よこ書き', 'btn-sm' + (T.vertical ? ' on' : ''),
          () => { T.vertical = !T.vertical; pushUndo(); live(); draw(); }),
        btn('＋ 書たいを 入れる', 'btn-sm', () => $('#fileFont').click())
      ]),
      T.vertical ? null : pick('よせ', [['center', 'まんなか'], ['left', 'ひだり'], ['right', 'みぎ']], T.align, v => { T.align = v; live(); }),
      pick('ふとさ', [['400', 'ほそい'], ['700', 'ふつう'], ['800', 'ふとい']], T.weight, v => { T.weight = +v; live(); })
    ]));

    w.appendChild(group('字くばり', [
      range('文字づめ', T.tsume || 0, 0, 1, .05, '', v => { T.tsume = v; live(); }),
      range('字あき', T.tracking || 0, -.3, 1, .01, 'em', v => { T.tracking = v; live(); }),
      range('行あき', T.lineGap || 1.32, .9, 2.4, .02, '', v => { T.lineGap = v; live(); }),
      T.vertical ? null : range('カーブ', T.curve || 0, -100, 100, 1, '', v => { T.curve = v; live(); }),
      range('かたむき よこ', T.skewH || 0, -45, 45, 1, '°', v => { T.skewH = v; live(); }),
      range('かたむき たて', T.skewV || 0, -45, 45, 1, '°', v => { T.skewV = v; live(); }),
      grid('反転', [
        btn('よこ', 'btn-sm' + (T.flipH ? ' on' : ''), () => { T.flipH = !T.flipH; pushUndo(); live(); draw(); }),
        btn('たて', 'btn-sm' + (T.flipV ? ' on' : ''), () => { T.flipV = !T.flipV; pushUndo(); live(); draw(); })
      ])
    ]));

    w.appendChild(group('いろ と かざり', [
      color('いろ', T.color, v => { T.color = v; live(); }),
      grid('グラデ', [
        btn(T.grad ? 'あり' : 'なし', 'btn-sm' + (T.grad ? ' on' : ''),
          () => { T.grad = !T.grad; pushUndo(); live(); draw(); })
      ]),
      T.grad ? color('もう ひとつ', T.color2 || '#E1DD60', v => { T.color2 = v; live(); }) : null,
      T.grad ? range('むき', T.gradDir === undefined ? 90 : T.gradDir, -180, 180, 5, '°', v => { T.gradDir = v; live(); }) : null,
      color('ふち色', T.stroke, v => { T.stroke = v; live(); }),
      range('ふち', T.sw, 0, 36, 1, 'px', v => { T.sw = v; live(); }),
      grid('かげ', [
        btn(T.shadowOn ? 'あり' : 'なし', 'btn-sm' + (T.shadowOn ? ' on' : ''),
          () => { T.shadowOn = !T.shadowOn; pushUndo(); live(); draw(); })
      ]),
      T.shadowOn ? color('かげの 色', T.shadowColor || '#1E1C14', v => { T.shadowColor = v; live(); }) : null,
      T.shadowOn ? range('かげ よこ', T.shadowX === undefined ? 6 : T.shadowX, -60, 60, 1, 'px', v => { T.shadowX = v; live(); }) : null,
      T.shadowOn ? range('かげ たて', T.shadowY === undefined ? 8 : T.shadowY, -60, 60, 1, 'px', v => { T.shadowY = v; live(); }) : null,
      T.shadowOn ? range('かげ ぼかし', T.shadowBlur || 0, 0, 60, 1, 'px', v => { T.shadowBlur = v; live(); }) : null,
      grid('ひかり', [
        btn(T.glowOn ? 'あり' : 'なし', 'btn-sm' + (T.glowOn ? ' on' : ''),
          () => { T.glowOn = !T.glowOn; pushUndo(); live(); draw(); })
      ]),
      T.glowOn ? color('ひかりの 色', T.glowColor || '#E1DD60', v => { T.glowColor = v; live(); }) : null,
      T.glowOn ? range('ひかりの 強さ', T.glowSize || 18, 0, 80, 1, 'px', v => { T.glowSize = v; live(); }) : null,
      grid('ふだ地', [
        btn(T.bgOn ? 'あり' : 'なし', 'btn-sm' + (T.bgOn ? ' on' : ''), () => { T.bgOn = !T.bgOn; pushUndo(); live(); draw(); })
      ]),
      T.bgOn ? color('ふだ地の色', T.bgColor, v => { T.bgColor = v; live(); }) : null
    ]));

    w.appendChild(charGroup(T));

    const beatUnits = [['0', '秒で きめる'], ['0.25', '16ぶん'], ['0.5', '8ぶん'],
    ['1', '1拍'], ['2', '2拍'], ['4', '1小節']];
    w.appendChild(group('もじの うごき', [
      pick('出かた', FX_IN, T.fxIn || 'none', v => { T.fxIn = v; live(); }),
      pick('出る 尺', beatUnits, String(T.inBeat || 0), v => { T.inBeat = +v; live(); draw(); }),
      +(T.inBeat || 0) === 0
        ? range('出る ま', T.inDur === undefined ? .45 : T.inDur, .05, 2, .05, 's', v => { T.inDur = v; live(); })
        : null,
      pick('消えかた', FX_OUT, T.fxOut || 'none', v => { T.fxOut = v; live(); }),
      pick('消える 尺', beatUnits, String(T.outBeat || 0), v => { T.outBeat = +v; live(); draw(); }),
      +(T.outBeat || 0) === 0
        ? range('消える ま', T.outDur === undefined ? .3 : T.outDur, .05, 2, .05, 's', v => { T.outDur = v; live(); })
        : null,
      pick('ずっと', FX_LOOP, T.fxLoop || 'none', v => { T.fxLoop = v; live(); }),
      range('つよさ', T.loopAmt === undefined ? 1 : T.loopAmt, 0, 3, .05, 'x', v => { T.loopAmt = v; live(); })
    ]));

    w.appendChild(group('出る 順番', [
      pick('どの まとまりで', [['char', '1文字ずつ'], ['word', 'ことばごと'], ['line', '行ごと'], ['all', 'まとめて']],
        T.unit || 'char', v => { T.unit = v; live(); }),
      pick('じゅんばん', ORDERS, T.order || 'fwd', v => { T.order = v; live(); }),
      range('ずらし', T.stagger === undefined ? .04 : T.stagger, 0, .4, .01, 's', v => { T.stagger = v; live(); }),
      pick('うごきかた', EASES, T.ease || 'auto', v => { T.ease = v; live(); }),
      range('きょり', T.dist || 0, 0, 1200, 10, 'px', v => { T.dist = v; live(); }),
      (T.dist || 0) > 0 ? range('むき', T.angle === undefined ? 90 : T.angle, -180, 180, 5, '°', v => { T.angle = v; live(); }) : null,
      range('うごきの あと', T.mblur || 0, 0, 1, .05, '', v => { T.mblur = v; live(); }),
      beatOn()
        ? hint(`「ずっと」の うごきと 拍の 尺は BPM ${r2(S.beat.bpm)} に のって います。`)
        : hint('BPM を きめると、尺を 拍で きめられます。<br>ひだりの 🥁 はやさ から。'),
      grid('きまり', [
        ['うたの 字幕', { fxIn: 'up', fxOut: 'fade', fxLoop: 'none', unit: 'char', order: 'fwd', stagger: .03, inBeat: 0, inDur: .35, outDur: .25, ease: 'out', dist: 0 }],
        ['拍で はずむ', { fxIn: 'pop', fxOut: 'fade', fxLoop: 'bounce', unit: 'char', order: 'fwd', stagger: .04, loopAmt: 1, inBeat: .5, ease: 'auto' }],
        ['どんと 出す', { fxIn: 'zoomout', fxOut: 'zoomin', fxLoop: 'zoombeat', unit: 'all', stagger: 0, inBeat: .25, ease: 'back' }],
        ['タイプ', { fxIn: 'type', fxOut: 'fade', fxLoop: 'none', unit: 'char', order: 'fwd', stagger: .07 }],
        ['ちらばる', { fxIn: 'scatter', fxOut: 'scatter', fxLoop: 'none', unit: 'char', order: 'random', stagger: .02, inBeat: 1 }],
        ['ゆらゆら', { fxIn: 'fade', fxOut: 'fade', fxLoop: 'wave', unit: 'char', order: 'fwd', stagger: .03, loopAmt: 1 }],
        ['まん中から', { fxIn: 'slide', fxOut: 'fade', fxLoop: 'none', unit: 'char', order: 'center', stagger: .03, dist: 300, angle: 90, ease: 'out' }],
        ['よこに ながれる', { fxIn: 'slide', fxOut: 'fade', fxLoop: 'none', unit: 'char', order: 'fwd', stagger: .025, dist: 500, angle: 0, ease: 'out' }]
      ].map(([n, pr]) => btn(n, 'btn-sm', () => { Object.assign(T, pr); pushUndo(); live(); draw(); })))
    ]));
  }

  if (c.kind === 'color') {
    w.appendChild(group('いろ', [
      color('いろ', c.color, v => { c.color = v; live(); }),
      grid('グラデ', [
        btn(c.grad ? 'あり' : 'なし', 'btn-sm' + (c.grad ? ' on' : ''),
          () => { c.grad = !c.grad; pushUndo(); live(); draw(); })
      ]),
      c.grad ? color('もう ひとつ', c.color2 || '#F2A0B8', v => { c.color2 = v; live(); }) : null,
      c.grad ? range('むき', c.gradDir || 0, -180, 180, 5, '°', v => { c.gradDir = v; live(); }) : null
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
      range('おおきさ', c.vol, 0, 2, .01, 'x', v => { c.vol = v; bus.audio(); live(); })
    ]));
  }
  if (m && m.kind !== 'image') {
    w.appendChild(hint(`もとの 素材: ${m.name}<br>${r2(m.dur)}s の うち ${r2(c.inp)}s から つかって いる`));
  }
  return w;
}

/* --- 1文字ずつ --- */
function charGroup(T) {
  const nodes = [];
  nodes.push(grid('つかう', [
    btn(T.charOn ? 'いじる' : 'いじらない', 'btn-sm' + (T.charOn ? ' on' : ''),
      () => { T.charOn = !T.charOn; if (!T.charOn) S.selChar = null; pushUndo(); bus.all(); draw(); })
  ]));

  if (T.charOn) {
    const chars = [...String(T.str)].filter(ch => ch !== '\n');
    const chipRow = el('div', 'row');
    chipRow.appendChild(el('label', null, 'どの字'));
    const box = el('div', 'grid chips');
    chars.forEach((ch, i) => {
      const o = offOf(T, i);
      const moved = o.x || o.y || o.r || o.s !== 1;
      const b = btn(ch === ' ' ? '␣' : ch, 'btn-sm chip1' + (S.selChar === i ? ' on' : '') + (moved ? ' moved' : ''),
        () => { S.selChar = i; bus.all(); draw(); });
      box.appendChild(b);
    });
    chipRow.appendChild(box);
    nodes.push(chipRow);

    const i = S.selChar;
    if (i === null || i === undefined || i >= chars.length) {
      nodes.push(hint('うごかしたい 字を えらぶか、<br>画面の 中で その字を じかに ドラッグ。'));
    } else {
      const o = offOf(T, i);
      const put = part => { setOff(T, i, part); bus.stage(); bus.tl(); };
      nodes.push(range('よこ', o.x, -3, 3, .01, 'em', v => put({ x: v })));
      nodes.push(range('たて', o.y, -3, 3, .01, 'em', v => put({ y: v })));
      nodes.push(range('大きさ', o.s, .1, 4, .01, 'x', v => put({ s: v })));
      nodes.push(range('かたむき', o.r, -180, 180, 1, '°', v => put({ r: v })));
      nodes.push(grid('もどす', [
        btn('この字', 'btn-sm', () => { clearOff(T, i); pushUndo(); bus.all(); draw(); }),
        btn('ぜんぶ', 'btn-sm btn-p', () => { clearOff(T); S.selChar = null; pushUndo(); bus.all(); draw(); })
      ]));
      nodes.push(hint('画面の 中の その字を じかに ドラッグしても うごきます。<br>ピンクの わくが いま えらんで いる 字。'));
    }
  } else {
    nodes.push(hint('「いじる」に すると、1文字ずつ 位置・大きさ・かたむきを<br>手で 直せます。'));
  }
  return group('1文字ずつ', nodes);
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
let lyUnit = 'beat';
let lyMode = 'auto';
let lySeed = Math.floor(Math.random() * 9999) + 1;
let lyMood = 'all';
let lyFix = {};           // きめうち（指定）した ところ
let lyTarget = 'all';     // いま ある 文字に かける とき、どれに
let lyKeepPos = true;     // いちは そのまま
let lyKeepColor = false;  // 色は そのまま
let lyOpen = false;       // 「ここは きめる」を ひらいて いるか
let lyHist = [];          // ためした たねの ならび
let lyAt = -1;            // いま どこを 見て いるか
let lyText = '';
let lyBeats = 4;

function lyricBody() {
  const w = el('div');
  w.appendChild(grid('やりかた', [
    btn('おまかせ 組み立て', 'btn-sm' + (lyMode === 'auto' ? ' on' : ''), () => { lyMode = 'auto'; draw(); }),
    btn('ならべるだけ', 'btn-sm' + (lyMode === 'plain' ? ' on' : ''), () => { lyMode = 'plain'; draw(); })
  ]));
  return lyMode === 'auto' ? autoBody(w) : plainBody(w);
}

/* おまかせ：歌詞と 拍から カットを じどうで 組み立てる */
function autoBody(w) {
  const ta = el('textarea'); ta.rows = 7; ta.value = lyText;
  ta.placeholder = 'ゆめの つづきを\nうたって いた / いまも\n*きみ* に とどけ';
  ta.addEventListener('input', () => { lyText = ta.value; });

  const from = el('input'); from.type = 'number'; from.step = .1; from.value = r2(S.time);
  const beats = el('input'); beats.type = 'number'; beats.step = 1; beats.min = 1; beats.value = lyBeats;
  beats.addEventListener('change', () => { lyBeats = Math.max(1, +beats.value || 4); });
  const seed = el('input'); seed.type = 'number'; seed.step = 1; seed.value = lySeed;
  seed.addEventListener('change', () => { lySeed = (+seed.value | 0) || 1; });

  const run = () => {
    lyText = ta.value;
    const res = autoCompose({
      text: lyText, from: +from.value || 0,
      beats: Math.max(1, +beats.value || 4), seed: lySeed, mood: lyMood,
      fix: lyFix
    });
    if (res) {
      toast(`${res.cuts}カット つくった（たね ${lySeed}・${res.palette}）`, 3000);
      if (!docked()) close(); else draw();
    }
    return res;
  };
  const build = (newSeed) => {
    if (newSeed) {
      lySeed = Math.floor(Math.random() * 9999) + 1;
      seed.value = lySeed;
      lyHist = lyHist.slice(0, lyAt + 1);
      lyHist.push(lySeed); lyAt = lyHist.length - 1;
      if (lyHist.length > 30) { lyHist.shift(); lyAt--; }
    }
    return run();
  };
  const applyNow = (newSeed) => {
    if (newSeed) { lySeed = Math.floor(Math.random() * 9999) + 1; seed.value = lySeed; }
    const res = autoApply({
      target: lyTarget, seed: lySeed, mood: lyMood, fix: lyFix,
      keepPos: lyKeepPos, keepColor: lyKeepColor
    });
    if (res) {
      toast(`${res.cuts}まいに かけた（たね ${lySeed}・${res.palette}）`, 3000);
      if (!docked()) close(); else draw();
    }
  };
  const step2 = (d) => {
    const n = lyAt + d;
    if (n < 0 || n >= lyHist.length) { toast(d < 0 ? 'これ以上 もどれない' : 'これ以上 すすめない'); return; }
    lyAt = n; lySeed = lyHist[n]; seed.value = lySeed;
    run();
  };

  w.appendChild(group('歌詞', [
    hint('1行 ＝ 1カット。<b>/</b> で 1行を 2つに 割る。<br>' +
      '<b>*つよく*</b> と はさむと そこだけ 大きく なる。<br>' +
      '行の おわりに <b>!</b> で ぱっと ひかる。<b>|</b> の あとは 小さい そえ書き。<br>' +
      '<b>[01:23.45]</b> を 行あたまに 書くと その 時こくに 置く。'),
    row(null, ta)
  ]));
  w.appendChild(group('ならべ方', [
    row('はじめ', from),
    row('1行ぶん（拍）', beats),
    row('たね', seed),
    grid(null, [
      btn('🎲 ひきなおす', 'btn-sm', () => build(true)),
      btn('▶ 組み立てる', 'btn-y', () => build(false))
    ]),
    grid(null, [
      btn('← 前の 案', 'btn-sm', () => step2(-1)),
      btn('次の 案 →', 'btn-sm', () => step2(1))
    ]),
    beatOn()
      ? hint(`BPM ${r2(S.beat.bpm)} の 拍に のせます。`)
      : hint('BPM が きまって いないと 1拍＝0.5秒 で 組みます。<br>ひだりの 🥁 はやさ で さきに きめると きれいに 合います。')
  ]));
  /* --- ここは きめる（指定）--- */
  let fixBtn = null;
  const reCount = () => {
    const n = Object.keys(lyFix).length;
    if (!fixBtn) return;
    fixBtn.textContent = (lyOpen ? '▼' : '▶') + ' ここは きめる' + (n ? `（${n}）` : '');
    fixBtn.classList.toggle('on', !!n);
  };
  const fsel = (label, opts, key, autoLabel) => {
    const s2 = el('select');
    const o0 = el('option', null, autoLabel || '🎲 おまかせ'); o0.value = 'auto';
    s2.appendChild(o0);
    opts.forEach(([v, l]) => { const o = el('option', null, l); o.value = v; s2.appendChild(o); });
    s2.value = lyFix[key] === undefined ? 'auto' : String(lyFix[key]);
    s2.addEventListener('change', () => {
      if (s2.value === 'auto') delete lyFix[key]; else lyFix[key] = s2.value;
      reCount();
    });
    return row(label, s2);
  };
  const fnum = (label, key, ph) => {
    const i = el('input'); i.type = 'number'; i.placeholder = ph || 'おまかせ';
    i.value = lyFix[key] === undefined ? '' : lyFix[key];
    i.addEventListener('change', () => {
      if (i.value === '') delete lyFix[key]; else lyFix[key] = +i.value;
      reCount();
    });
    return row(label, i);
  };
  const names = list => list.map(x => [x[0], x[1]]);
  const fixed = Object.keys(lyFix).length;

  const fixWrap = el('div');
  fixBtn = btn((lyOpen ? '▼' : '▶') + ' ここは きめる' + (fixed ? `（${fixed}）` : ''),
    'btn-sm' + (fixed ? ' on' : ''), () => { lyOpen = !lyOpen; draw(); });
  fixWrap.appendChild(grid(null, [
    fixBtn,
    btn('ぜんぶ おまかせに もどす', 'btn-sm', () => { lyFix = {}; draw(); })
  ]));
  if (lyOpen) {
    fixWrap.appendChild(hint('えらんだ ところは ぜんぶの カットで その とおりに なります。<br>' +
      '「🎲 おまかせ」の ままの ところだけ くじを ひきます。'));
    fixWrap.appendChild(group('いろ・字', [
      fsel('配色', PALETTES.map(x => [x[0], x[0]]), 'palette'),
      fsel('フォント', fontList(), 'font'),
      fnum('字の 大きさ', 'size', 'おまかせ'),
      fsel('ふとさ', [['400', 'ほそい'], ['700', 'ふつう'], ['800', 'ふとい'], ['900', 'いちばん ふとい']], 'weight'),
      fsel('たて書き', [['no', 'よこ書き'], ['yes', 'たて書き']], 'vertical')
    ]));
    fixWrap.appendChild(group('ならべ方・かざり', [
      fsel('ならべ方', names(LAYOUTS), 'layout'),
      fsel('かざり', names(DECOR), 'decor'),
      fsel('うしろ', names(BGS), 'bg'),
      fsel('カメラ', CAM_OPTS, 'cam')
    ]));
    fixWrap.appendChild(group('うごき', [
      fsel('出かた', FX_IN, 'fxIn'),
      fsel('ずっと', FX_LOOP, 'fxLoop'),
      fsel('消えかた', FX_OUT, 'fxOut'),
      fsel('まとまり', UNIT_OPTS, 'unit'),
      fsel('じゅんばん', ORDERS, 'order'),
      fsel('うごきかた', EASES, 'ease'),
      fnum('ずらし（秒）', 'stagger', 'おまかせ'),
      fsel('出る 尺（拍）', [['.25', '1/4'], ['.5', '1/2'], ['1', '1'], ['2', '2']], 'inBeat'),
      fsel('消える 尺（拍）', [['.25', '1/4'], ['.5', '1/2'], ['1', '1']], 'outBeat')
    ]));
    fixWrap.appendChild(group('しあげ', [
      fsel('画面ぜんたい', MOODS.filter(m => m[0] !== 'all'), 'look')
    ]));
  }
  w.appendChild(group('きめうち', [fixWrap]));

  /* --- いま ある 文字に かける --- */
  const nText = S.tracks.filter(t => t.kind === 'text')
    .reduce((n, t) => n + t.clips.filter(c => c.kind === 'text').length, 0);
  const selT = S.tracks.find(t => t.id === S.selTrack);
  w.appendChild(group('いま ある 文字に かける', [
    hint('じぶんで 置いた 文字にも、おなじ うごきと かざりを かけられます。<br>' +
      '<b>字・いつ出る・ながさ は そのまま</b>。うごきと 見た目だけ かけ直します。'),
    grid('どれに', [
      btn('えらんだ ふだ', 'btn-sm' + (lyTarget === 'sel' ? ' on' : ''), () => { lyTarget = 'sel'; draw(); }),
      btn(selT ? `${selT.name} ぜんぶ` : 'この 段ぜんぶ', 'btn-sm' + (lyTarget === 'track' ? ' on' : ''), () => { lyTarget = 'track'; draw(); }),
      btn(`文字 ぜんぶ（${nText}まい）`, 'btn-sm' + (lyTarget === 'all' ? ' on' : ''), () => { lyTarget = 'all'; draw(); })
    ]),
    grid('のこす もの', [
      btn('いちは そのまま', 'btn-sm' + (lyKeepPos ? ' on' : ''), () => { lyKeepPos = !lyKeepPos; draw(); }),
      btn('色は そのまま', 'btn-sm' + (lyKeepColor ? ' on' : ''), () => { lyKeepColor = !lyKeepColor; draw(); })
    ]),
    grid(null, [
      btn('🎲 ひきなおして かける', 'btn-sm', () => applyNow(true)),
      btn('▶ かける', 'btn-y', () => applyNow(false))
    ]),
    hint('「いちは そのまま」を きると、ならべ方（まん中・たて書き・ななめ…）も かかります。<br>' +
      'かけた あとに <b>↩</b> で もとに もどせます。')
  ]));

  w.appendChild(group('ふんいき', [
    grid(null, MOODS.map(([k, label]) =>
      btn(label, 'btn-sm' + (lyMood === k ? ' on' : ''), () => { lyMood = k; draw(); }))),
    hint('えらんだ ふんいきに 合う 部品を 中心に ひきます。<br>「全部入り」は なんでも ひきます。')
  ]));
  w.appendChild(group('なかみ', [
    hint(`1カット ごとに、下の たなから 1つずつ くじを ひきます。<br>` +
      `ならべ方 ${LAYOUTS.length}・出かた 22・ずっと 11・消えかた 9・かざり ${DECOR.length}・` +
      `うしろ ${BGS.length}・配色 ${PALETTES.length}。<br>` +
      `<b>たね</b>が 同じなら いつも 同じ ものが 出ます。気に入ったら ばんごうを ひかえて。`),
    hint('「おまかせ 文字」「おまかせ 背景」の 2段に 入ります。<br>' +
      'ひきなおすと その 2段だけ 作り直します（音や ほかの 段は そのまま）。')
  ]));
  return w;
}

/* ならべるだけ：前からの やり方 */
function plainBody(w) {
  const useBeat = beatOn() && lyUnit === 'beat';
  const ta = el('textarea'); ta.rows = 7;
  ta.placeholder = '0:00 さいしょの 行\nつぎの 行\nそのつぎの 行';
  const from = el('input'); from.type = 'number'; from.step = .1; from.value = r2(S.time);
  const each = el('input'); each.type = 'number'; each.step = useBeat ? 1 : .1; each.value = useBeat ? 4 : 2.5;
  const gap = el('input'); gap.type = 'number'; gap.step = useBeat ? 1 : .1; gap.value = 0;
  const size = el('input'); size.type = 'number'; size.step = 2; size.value = 64;

  w.appendChild(group('うたを 流しこむ', [
    hint('1行 ＝ 1まいの もじふだ。<br>行の あたまに <b>0:12</b> と 書くと そこに 置く。'),
    beatOn() ? grid('ものさし', [
      btn('拍で', 'btn-sm' + (lyUnit === 'beat' ? ' on' : ''), () => { lyUnit = 'beat'; draw(); }),
      btn('秒で', 'btn-sm' + (lyUnit === 'sec' ? ' on' : ''), () => { lyUnit = 'sec'; draw(); })
    ]) : null,
    row('はじめ', from),
    row(useBeat ? '1行ぶん（拍）' : '1行ぶん（秒）', each),
    row(useBeat ? 'すきま（拍）' : 'すきま（秒）', gap),
    row('大きさ', size),
    row(null, ta),
    grid(null, [btn('ならべる', 'btn-y', () => {
      const b = beatSec();
      const e0 = Math.max(useBeat ? .25 : .2, +each.value || (useBeat ? 4 : 2.5));
      const g0 = +gap.value || 0;
      let start = +from.value || 0;
      if (useBeat) {
        const st = b, o = S.beat.offset || 0;
        start = Math.max(0, o + Math.round((start - o) / st) * st);
      }
      const n = addLyrics(ta.value, {
        from: start,
        each: useBeat ? e0 * b : e0,
        gap: useBeat ? g0 * b : g0,
        size: +size.value || 64
      });
      if (n) {
        toast(n + '行 ならべた');
        if (!docked()) close(); else { kind = 'form'; draw(); }
      }
    })])
  ]));
  return w;
}

/* --- はやさ（BPM） --- */
const tapStore = {};
function beatBody() {
  const B = S.beat;
  const w = el('div');
  const found = [...MEDIA.values()].filter(m => m.bpm);

  const bpm = el('input'); bpm.type = 'number'; bpm.step = .1; bpm.value = B.bpm || '';
  bpm.addEventListener('change', () => { B.bpm = +bpm.value || 0; B.on = B.bpm > 0; pushUndo(); bus.all(); draw(); });
  const off = el('input'); off.type = 'number'; off.step = .01; off.value = r2(B.offset || 0);
  off.addEventListener('change', () => { B.offset = +off.value || 0; bus.all(); });

  w.appendChild(group('曲の はやさ', [
    row('BPM', bpm),
    row('あたま', off),
    grid(null, [
      btn('👆 たたいて きめる', 'btn-sm', e => {
        const v = tapTempo(tapStore);
        if (v) { B.bpm = v; B.on = true; bus.all(); draw(); toast('BPM ' + v); }
        else toast('もう一回 たたいて');
      }),
      btn('🎧 曲から さがす', 'btn-sm btn-y', () => {
        const m = found[0];
        if (!m) { toast('音の 素材を 先に とりこんで'); return; }
        B.bpm = m.bpm; B.offset = m.offset || 0; B.on = true;
        pushUndo(); bus.all(); draw();
        toast(m.name + ' から BPM ' + m.bpm);
      })
    ]),
    found.length ? hint('見つけた はやさ: ' + found.map(m => `${m.name} → ${m.bpm}`).join('<br>')) : null
  ]));

  w.appendChild(group('拍の きざみ', [
    pick('くぎり', [['0.5', '2拍ぶん'], ['1', '1拍'], ['2', '8ぶん'], ['4', '16ぶん'], ['3', '3れん']],
      B.div, v => { B.div = +v; bus.all(); }),
    pick('小節', [['2', '2拍子'], ['3', '3拍子'], ['4', '4拍子'], ['6', '6拍子'], ['8', '8拍子']],
      B.per, v => { B.per = +v; bus.all(); }),
    grid('つかう', [
      btn(B.on ? '拍に あわせる' : 'あわせない', 'btn-sm' + (B.on ? ' on' : ''),
        () => { B.on = !B.on; bus.all(); draw(); }),
      btn(B.grid ? 'すじを 出す' : 'すじは なし', 'btn-sm' + (B.grid ? ' on' : ''),
        () => { B.grid = !B.grid; bus.all(); draw(); })
    ]),
    B.bpm ? hint(`1拍 ＝ ${r2(60 / B.bpm)} 秒 ／ いまの きざみ ＝ ${r2(stepSec())} 秒`) : null
  ]));

  w.appendChild(group('拍に そろえる', [
    grid(null, [
      btn('▎いまの ふだを 拍へ', 'btn-sm', () => {
        const f = selected();
        if (!f) { toast('ふだを えらんでから'); return; }
        if (!beatOn()) { toast('さきに BPM を きめて'); return; }
        const st = stepSec(), o = S.beat.offset || 0;
        f.c.start = Math.max(0, o + Math.round((f.c.start - o) / st) * st);
        f.c.dur = Math.max(st, Math.round(f.c.dur / st) * st);
        pushUndo(); bus.all();
      }),
      btn('▤ ぜんぶ 拍へ', 'btn-sm', () => {
        if (!beatOn()) { toast('さきに BPM を きめて'); return; }
        const st = stepSec(), o = S.beat.offset || 0;
        allClips().forEach(({ c }) => {
          c.start = Math.max(0, o + Math.round((c.start - o) / st) * st);
          c.dur = Math.max(st, Math.round(c.dur / st) * st);
        });
        pushUndo(); bus.all(); toast('拍に そろえた');
      })
    ]),
    hint('そろえると、ふだの はじまりと ながさが<br>きざみの ちょうどに なる。')
  ]));
  return w;
}

/* --- しあげ（ぜんたいに かける） --- */
function masterBody() {
  const M = S.master;
  const w = el('div');
  const mr = (label, key, min, max, step, unit) =>
    range(label, M[key] === undefined ? 0 : M[key], min, max, step, unit, v => { M[key] = v; bus.stage(); });

  w.appendChild(group('下じき（うしろの 色）', [
    color('いろ', S.bg, v => { S.bg = v; bus.stage(); }),
    grid('えらぶ', [
      ['くろ', '#101010'], ['しろ', '#FFFEF7'], ['きなり', '#FBFAEC'],
      ['はいいろ', '#5c5843'], ['みどり', '#00B140'], ['あお', '#0047BB']
    ].map(([n, c]) => {
      const b = btn(n, 'btn-sm', () => { S.bg = c; pushUndo(); bus.stage(); draw(); });
      b.style.borderLeft = '10px solid ' + c;
      return b;
    })),
    hint('みどり・あおは、あとで 人を くりぬく ときの 色。<br>' +
      '時間で 色を かえたい ときは 🗂素材 の「いろの ふだ」を つかう。')
  ]));
  w.appendChild(group('画づくり', [
    mr('あかるさ', 'br', 0, 200, 1, '%'),
    mr('こさ', 'ct', 0, 200, 1, '%'),
    mr('あざやか', 'sa', 0, 200, 1, '%'),
    mr('まわり暗く', 'vignette', 0, 1, .02, ''),
    mr('ざらざら', 'grain', 0, 1, .02, ''),
    mr('色ずれ', 'rgb', 0, 1, .02, '')
  ]));
  w.appendChild(group('拍に のせる', [
    mr('ぴかっ', 'flash', 0, 1, .02, ''),
    mr('ゆれ', 'shake', 0, 1, .02, ''),
    mr('ズーム', 'zoom', 0, 1, .02, ''),
    beatOn() ? hint(`BPM ${r2(S.beat.bpm)} の 拍ごとに 出ます。`)
      : hint('BPM を きめると 拍ごとに 出ます。<br>いまは 1秒に 2回。')
  ]));
  w.appendChild(group('きまり', [
    grid(null, [
      ['もどす', { br: 100, ct: 100, sa: 100, vignette: 0, grain: 0, rgb: 0, flash: 0, shake: 0, zoom: 0 }],
      ['フィルム', { br: 102, ct: 108, sa: 92, vignette: .45, grain: .45, rgb: 0, flash: 0, shake: 0, zoom: 0 }],
      ['ライブ', { br: 104, ct: 112, sa: 118, vignette: .3, grain: .1, rgb: .12, flash: .35, shake: .18, zoom: .25 }],
      ['ビデオ', { br: 100, ct: 104, sa: 88, vignette: .25, grain: .6, rgb: .3, flash: 0, shake: .06, zoom: 0 }],
      ['しずか', { br: 100, ct: 98, sa: 96, vignette: .2, grain: .06, rgb: 0, flash: 0, shake: 0, zoom: 0 }]
    ].map(([n, pr]) => btn(n, 'btn-sm', () => { Object.assign(S.master, pr); pushUndo(); bus.stage(); draw(); })))
  ]));
  return w;
}

/* --- さくひん --- */
function fileBody() {
  const w = el('div');
  const nm = el('input'); nm.type = 'text'; nm.value = (S.name && S.name !== 'むだい') ? S.name : 'douga';
  w.appendChild(group('この さくひん', [
    hint('さわる たびに じどうで ほぞんされます。<br>つぎに ひらいた とき「つづきから」で 出てきます。'),
    grid(null, [
      btn('🏠 さくひん えらびへ', 'btn-sm', () => { close(); bus.home(); }),
      btn('▶ デモを ひらく', 'btn-sm', () => { close(); bus.demo(); })
    ])
  ]));
  w.appendChild(group('ひとまとめ（素材ごと）', [
    row('名前', nm),
    grid(null, [
      btn('📦 ひとまとめに する', 'btn-y', () => bus.pack(nm.value.trim() || 'douga')),
      btn('📦 ひらく', 'btn-sm', () => $('#filePack').click())
    ]),
    hint('素材も いっしょに 1つの ファイルに 入る。<br>これ1つ 持って いけば、どの 端末でも 続きが できる。<br>そのぶん 大きい。')
  ]));
  w.appendChild(group('組み立てだけ', [
    grid(null, [
      btn('💾 保存', 'btn-sm', () => saveProject(nm.value.trim() || 'douga')),
      btn('📂 ひらく', 'btn-sm', () => $('#fileProj').click())
    ]),
    hint('かるいが、動画そのものは 入らない。<br>ひらいた あと、同じ名前の 素材を とりこめば つながる。')
  ]));
  const exq = el('select');
  [['12000000', 'きれい'], ['20000000', 'とても きれい'], ['7000000', 'ふつう'], ['3500000', 'かるい']]
    .forEach(([v, l]) => { const o = el('option', null, l); o.value = v; exq.appendChild(o); });
  const exk = el('select');
  [['mp4', 'MP4（ふつうは こっち）'], ['webm', 'WebM（通しで 録る）']]
    .forEach(([v, l]) => { const o = el('option', null, l); o.value = v; exk.appendChild(o); });
  w.appendChild(group('ようす（うまく いかない とき）', [
    stateBody(),
    grid(null, [btn('📋 うつす', 'btn-sm', () => {
      const t = stateText();
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(
        () => toast('うつしました'), () => prompt('これを おくって ください', t));
      else prompt('これを おくって ください', t);
    })])
  ]));
  w.appendChild(group('そのほか', [
    grid(null, [
      btn('📷 いまの 絵', 'btn-sm', () => { close(); $('#shot').click(); }),
      btn('🎥 WIP を 収録', 'btn-sm', () => bus.wip())
    ]),
    hint('WIP は 作って いる 画面 そのものを 録る もの。<br>パソコンの ブラウザだけ。タブレットでは つかえない。')
  ]));
  w.appendChild(group('書き出す', [
    row('きれいさ', exq),
    row('かたち', exk),
    grid(null, [btn('▶ 動画に する', 'btn-g', () => {
      if (!docked()) close();
      bus.export({ name: nm.value.trim() || 'douga', bps: +exq.value, kind: exk.value });
    })]),
    hint(bus.canMp4 && bus.canMp4()
      ? 'MP4 は 1コマずつ 焼く やり方。<br>長いと 時間は かかるが、コマ落ちしない。'
      : 'この ブラウザは MP4 に できないので、<br>通しで 録って WebM に します。')
  ]));
  return w;
}

/* --- ようす --- */
function stateText() {
  const sw = navigator.serviceWorker && navigator.serviceWorker.controller ? 'あり' : 'なし';
  const lines = [
    '版: v' + (bus.version ? bus.version() : '?'),
    'サービスワーカー: ' + sw,
    'ほぞん: ' + (storeOk() === false ? 'つかえない' : storeOk() === true ? 'つかえる' : 'まだ'),
    '素材: ' + MEDIA.size + ' こ',
    'ふだ: ' + allClips().length + ' まい',
    'MP4: ' + (bus.canMp4 && bus.canMp4() ? 'つくれる' : 'つくれない'),
    '画面: ' + window.innerWidth + '×' + window.innerHeight
  ];
  if (LOG.at) {
    lines.push('さいごの とりこみ: ' + LOG.at + ' / ' + LOG.count + ' こ');
    if (LOG.note) lines.push('　' + LOG.note);
    LOG.items.forEach(i => lines.push(
      `　${i.name} / ${Math.round(i.size / 1024)}KB / ${i.type} / ${i.kind} → ${i.state}`));
  } else {
    lines.push('さいごの とりこみ: まだ');
  }
  return lines.join('\n');
}
function stateBody() {
  const pre = el('div', 'hint');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontFamily = "'DotGothic16', monospace";
  pre.textContent = stateText();
  return pre;
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
  w.appendChild(durGroup());
  w.appendChild(group('作業中の 画質', [
    grid('えらぶ', (bus.qualList ? bus.qualList() : [[1, 'きれい']]).map(([v, n]) =>
      btn(n, 'btn-sm' + (Math.abs((S.quality || 1) - v) < .02 ? ' on' : ''), () => { bus.qual(v); draw(); }))),
    hint('動画を のせると カクつく ときは かるく する。<br>' +
      '画面の 出かたが あらく なるだけで、<b>書き出す ときは いつも きれい</b>。<br>' +
      'かるく して いる あいだは、<b>さいせい中だけ</b> ざらざらと 色ずれを 休みます' +
      '（止めれば ちゃんと 見えます）。<br>' +
      '上の バーの「画質」を おしても かえられます。')
  ]));
  w.appendChild(group('タイムライン', [
    grid('くっつき', [
      btn(S.snap ? '🧲 あり' : '🧲 なし', 'btn-sm' + (S.snap ? ' on' : ''), () => { S.snap = !S.snap; bus.all(); draw(); })
    ]),
    grid('見わたす', [btn('⤢ 全体を 出す', 'btn-sm', () => bus.fit())])
  ]));
  return w;
}

/* --- 作品の ながさ --- */
function durGroup() {
  const fixed = S.dur > 0;
  const end = r2(clipEnd());
  const items = [
    grid('きめかた', [
      btn('ふだに 合わせる', 'btn-sm' + (fixed ? '' : ' on'), () => {
        S.dur = 0; pushUndo(); bus.all(); draw();
      }),
      btn('秒数を きめる', 'btn-sm' + (fixed ? ' on' : ''), () => {
        S.dur = S.dur > 0 ? S.dur : end; pushUndo(); bus.all(); draw();
      })
    ])
  ];
  if (fixed) {
    items.push(num('ながさ（秒）', r2(S.dur), .1, v => {
      S.dur = Math.max(.1, +v || .1); bus.all(); draw();
    }));
    items.push(grid(null, [
      btn('ふだの おわりに 合わせる', 'btn-sm', () => { S.dur = end; pushUndo(); bus.all(); draw(); }),
      btn('いまの ところまで', 'btn-sm', () => {
        S.dur = Math.max(.1, r2(S.time)); pushUndo(); bus.all(); draw();
      })
    ]));
    items.push(hint(`いまの きまり： <b>${r2(S.dur)}秒</b>。` +
      (end > S.dur + .01
        ? `<br>ふだは ${end}秒まで あるので、<b>${r2(end - S.dur)}秒ぶんは 書き出されません</b>。`
        : '')));
  } else {
    items.push(hint(`ふだの おわり（いま <b>${end}秒</b>）が そのまま ながさに なります。`));
  }
  items.push(hint('ここで きめた ながさで <b>書き出し・さいせい</b>が おわります。<br>' +
    'みじかく きめても ふだは 消えません。もどせば また 出ます。'));
  return group('作品の ながさ', items);
}

/* --- つかいかた --- */
function helpBody() {
  const w = el('div', 'doc');
  w.innerHTML = `
  <p>ブラウザの 中だけで 動く。素材は どこにも 送られない。</p>
  <p><b>はじめての ときは デモから。</b> 上の「動画工房」を おして
  「▶ デモを ひらく」。曲も 歌詞も 入って いるので、▶ を おすだけで 見られます。</p>
  <h3>1. 入れる</h3>
  <ul><li>左の <b>＋ついか</b>、または 画面に そのまま おとす。
  えらんだ ものは <b>そのまま タイムラインに ならびます</b>
  （音は 音の段、絵と 動画は 映像の段）</li>
  <li>PSD も 入ります。重ねた 絵を 1枚に して とりこみます</li>
  <li><b>すける もの</b>（アニメ工房の「すける GIF」、すける WebM、すける PNG）は
  すけた まま 重なります。うごく GIF は コマの まま うごきます</li>
  <li>もう一度 おなじ ものを 置きたい ときは <b>🗂素材</b> から <b>＋おく</b>。
  引っぱって 好きな ところに 置いても いい</li>
  <li>札の 下の ✏ ⇄ ⤓ 🗑 で 名前がえ・差し替え・取り出し・けす</li></ul>
  <h3>2. 曲の はやさに のせる</h3>
  <ul><li>音を 入れると <b>BPM を じどうで さがす</b>。🥁はやさ で 直せる</li>
  <li>きまると タイムラインに <b>小節の すじ</b>が 出て、ふだが 拍に くっつく</li>
  <li>時間の 数字を おすと <b>小節:拍</b> と コマ数に かわる</li>
  <li>🥁はやさ の「ぜんぶ 拍へ」で ならんだ ふだを そろえられる</li></ul>
  <h3>3. ならべる</h3>
  <ul><li>ふだの まん中を つかむと うごく。<b>左右の つまみ</b>で ながさ</li>
  <li>上下の 段へ 引っぱると 段を うつれる（音は 音の段だけ）</li>
  <li><b>✂きる</b>を えらぶと、さわった ところで 切れる</li>
  <li>🔁 で えらんだ ふだの ところだけ くりかえし 見られる</li>
  <li>段の 🔓 を おすと かぎが かかって うごかなく なる</li>
  <li>音を 止めたい ときは その段の <b>🔊</b>。映像の段は <b>👁</b> でも 音ごと 止まります</li></ul>
  <h3>4. もじ と うた</h3>
  <ul><li>🅰もじ で 1まい。<b>🎵うた</b> は 1行ずつ まとめて 流しこむ
  （拍で ならべられる。行の あたまに <b>0:12</b> と 書くと そこに 置く）</li>
  <li>出かた 23種・ずっと つづく うごき 12種・消えかた 9種。
  「ずっと」も 出る 尺も <b>拍に のる</b></li>
  <li>出る <b>じゅんばん</b>（あたまから・おしりから・まん中から・外から・ばらばら）と
  <b>うごきかた</b>（すっと止まる・いきすぎ・ばね など）を えらべる</li>
  <li><b>たて書き</b>・カーブ・文字づめ・字あき・行あき・かたむき・反転</li>
  <li><b>グラデーション</b>・ふち・<b>かげ</b>・<b>ひかり</b>（グロー）</li>
  <li><b>1文字ずつ</b> 位置・大きさ・かたむきを 手で 直せます。
  「いじる」に すると 字ごとに わくが 出るので、画面の 中で じかに ドラッグ</li>
  <li>歌詞に 合う 書たいが 20種。手もちの 書たい（ttf・otf）も 入れられる</li></ul>
  <h3>5. うごきの あと</h3>
  <ul><li>動画・画像・色の ふだにも <b>うごきの あと</b>（モーションブラー）が つけられます。
  ズームや 下から 出す ときに かけると、はやい うごきが なめらかに 見えます</li></ul>
  <h3>6. しあげ</h3>
  <ul><li>🎛しあげ は 画ぜんたいに かける。まわり暗く・ざらざら・色ずれ</li>
  <li>ぴかっ・ゆれ・ズームは <b>拍ごと</b>に 出る</li>
  <li>🎨 いろの ふだ で 下じきの 色を 時間で かえられる</li></ul>
  <h3>7. 指の わざ</h3>
  <ul><li>絵を じかに ドラッグ。四すみの <b>まる</b>で 大きさと かたむき</li>
  <li><b>2本指</b>で 画面を ずらす・つまんで 大きく／小さく。
  なにも 無い ところを 1本指で なぞっても ずらせます</li>
  <li>わくの <b>外</b>も うっすら 見えます。はみ出した ところも つかめます</li>
  <li>上の <b>⤢</b> で もとの 大きさに もどります</li>
  <li><b>2本指で トン</b> … もどす　<b>3本指で トン</b> … やりなおし</li>
  <li>タイムラインを <b>2本指で つまむ</b> … 時間じくの のびちぢみ</li></ul>
  <h3>8. カクカク する とき</h3>
  <ul><li>上の バーの <b>画質</b> を おして かるく する。
  きれい → ふつう → かるい → とても かるい の じゅんに 切りかわります</li>
  <li>画面が あらく なるだけで、<b>書き出す ものは いつも きれい</b></li>
  <li>かるく して いる あいだは、さいせい中だけ ざらざらと 色ずれを 休みます</li></ul>
  <h3>9. 出す</h3>
  <ul><li>右上の <b>▶書き出す</b> → <b>MP4</b>（1コマずつ 焼く。コマ落ちしない）</li>
  <li>できない ブラウザでは 通しで 録って WebM に なる</li>
  <li>📷 で いまの 絵を PNG に</li>
  <li><b>📦 ひとまとめ</b> は 素材ごと 1ファイル。これを 持って いけば 続きが できる</li>
  <li>組み立てだけの 保存（JSON）は かるいが 素材が 入らない</li></ul>
  <h3>ホーム画面に 置く</h3>
  <p>ブラウザの めにゅうから「ホーム画面に 追加」すると、
  ふつうの アプリと 同じ 顔で ひらく。</p>`;
  return w;
}
