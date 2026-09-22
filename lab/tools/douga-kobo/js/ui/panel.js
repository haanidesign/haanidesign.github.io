/* せってい。ひろい よこ画面では 右に つけっぱなし、
   せまい ときは 下から 出る 幕に 入る。中身は 同じ もの。 */
import {
  S, $, $$, clamp, r2, tc, toast, duration, allClips, findClip, selected,
  snap as pushUndo
} from '../state.js';
import { MEDIA, paintPoster, mediaLabel, importFiles } from '../media.js';
import { bus } from '../bus.js';
import { beatOn, beatSec, stepSec, guessBpm, tapTempo, analyse } from '../beat.js';
import { FX_IN, FX_OUT, FX_LOOP, fontList, addFontFile } from '../text.js';
import {
  addFromMedia, addText, addColor, addLyrics, delSel, dupSel,
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
    case 'beat': return beatBody();
    case 'master': return masterBody();
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
    const sub = el('div', 'sub dot', mediaLabel(m) + (m.bpm ? ' / ' + m.bpm + 'BPM' : ''));
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
      range('文字づめ', T.tsume || 0, 0, 1, .05, '', v => { T.tsume = v; live(); }),
      range('行あき', T.lineGap || 1.32, .9, 2.4, .02, '', v => { T.lineGap = v; live(); }),
      color('色', T.color, v => { T.color = v; live(); }),
      color('ふち色', T.stroke, v => { T.stroke = v; live(); }),
      range('ふち', T.sw, 0, 36, 1, 'px', v => { T.sw = v; live(); }),
      T.vertical ? null : pick('よせ', [['center', 'まんなか'], ['left', 'ひだり'], ['right', 'みぎ']], T.align, v => { T.align = v; live(); }),
      pick('ふとさ', [['400', 'ほそい'], ['700', 'ふつう'], ['800', 'ふとい']], T.weight, v => { T.weight = +v; live(); }),
      grid('ふだ地', [
        btn(T.bgOn ? 'あり' : 'なし', 'btn-sm' + (T.bgOn ? ' on' : ''), () => { T.bgOn = !T.bgOn; pushUndo(); live(); draw(); })
      ]),
      T.bgOn ? color('ふだ地の色', T.bgColor, v => { T.bgColor = v; live(); }) : null
    ]));

    w.appendChild(group('もじの うごき', [
      pick('出かた', FX_IN, T.fxIn || 'none', v => { T.fxIn = v; live(); }),
      range('出る ま', T.inDur === undefined ? .45 : T.inDur, .05, 2, .05, 's', v => { T.inDur = v; live(); }),
      pick('消えかた', FX_OUT, T.fxOut || 'none', v => { T.fxOut = v; live(); }),
      range('消える ま', T.outDur === undefined ? .3 : T.outDur, .05, 2, .05, 's', v => { T.outDur = v; live(); }),
      pick('ずっと', FX_LOOP, T.fxLoop || 'none', v => { T.fxLoop = v; live(); }),
      range('つよさ', T.loopAmt === undefined ? 1 : T.loopAmt, 0, 3, .05, 'x', v => { T.loopAmt = v; live(); }),
      pick('どの まとまりで', [['char', '1文字ずつ'], ['word', 'ことばごと'], ['line', '行ごと'], ['all', 'まとめて']],
        T.unit || 'char', v => { T.unit = v; live(); }),
      range('ずらし', T.stagger === undefined ? .04 : T.stagger, 0, .4, .01, 's', v => { T.stagger = v; live(); }),
      range('うごきの あと', T.mblur || 0, 0, 1, .05, '', v => { T.mblur = v; live(); }),
      beatOn()
        ? hint(`「ずっと」の うごきは 拍（BPM ${r2(S.beat.bpm)}）に のって います。`)
        : hint('BPM を きめると「ずっと」の うごきが 拍に のります。<br>ひだりの 🥁 はやさ から。'),
      grid('きまり', [
        ['うたの 字幕', { fxIn: 'up', fxOut: 'fade', fxLoop: 'none', unit: 'char', stagger: .03, inDur: .35, outDur: .25 }],
        ['拍で はずむ', { fxIn: 'pop', fxOut: 'fade', fxLoop: 'bounce', unit: 'char', stagger: .04, loopAmt: 1 }],
        ['どんと 出す', { fxIn: 'zoomout', fxOut: 'zoomin', fxLoop: 'zoombeat', unit: 'all', stagger: 0, inDur: .25 }],
        ['タイプ', { fxIn: 'type', fxOut: 'fade', fxLoop: 'none', unit: 'char', stagger: .07 }],
        ['ちらばる', { fxIn: 'scatter', fxOut: 'scatter', fxLoop: 'none', unit: 'char', stagger: .02, inDur: .6 }],
        ['ゆらゆら', { fxIn: 'fade', fxOut: 'fade', fxLoop: 'wave', unit: 'char', stagger: .03, loopAmt: 1 }]
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
let lyUnit = 'beat';
function lyricBody() {
  const w = el('div');
  const useBeat = beatOn() && lyUnit === 'beat';
  const ta = el('textarea'); ta.rows = 8;
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
        // 拍の ちょうどから はじめる
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
  const nm = el('input'); nm.type = 'text'; nm.value = 'douga';
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
  <li><b>🗂素材</b> の 札を タイムラインへ 引っぱる（<b>＋おく</b>でも いい）</li>
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
  <li>段の 🔓 を おすと かぎが かかって うごかなく なる</li></ul>
  <h3>4. もじ と うた</h3>
  <ul><li>🅰もじ で 1まい。<b>🎵うた</b> は 1行ずつ まとめて 流しこむ
  （拍で ならべられる。行の あたまに <b>0:12</b> と 書くと そこに 置く）</li>
  <li>出かた 22種・ずっと つづく うごき 12種・消えかた 9種。
  「ずっと」は <b>拍に のる</b></li>
  <li><b>たて書き</b>・文字づめ・行あき・うごきの あと（ぶれ）も ある</li>
  <li>手もちの 書たい（ttf・otf）を 入れて つかえる</li></ul>
  <h3>5. しあげ</h3>
  <ul><li>🎛しあげ は 画ぜんたいに かける。まわり暗く・ざらざら・色ずれ</li>
  <li>ぴかっ・ゆれ・ズームは <b>拍ごと</b>に 出る</li>
  <li>🎨 いろの ふだ で 下じきの 色を 時間で かえられる</li></ul>
  <h3>6. 指の わざ</h3>
  <ul><li>絵を じかに ドラッグ。<b>2本指</b>で 大きさと かたむき</li>
  <li><b>2本指で トン</b> … もどす　<b>3本指で トン</b> … やりなおし</li>
  <li>タイムラインを <b>2本指で つまむ</b> … 時間じくの のびちぢみ</li></ul>
  <h3>7. 出す</h3>
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
