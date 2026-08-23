/* 下から出てくる設定シート。細かい数字はここに隠す。 */

import { S, onChange, beginEdit, commitEdit, edit, selected } from '../state.js';
import { isDescendant, setParent, isFolder, membersOf, ungroup, mergeAsFrames } from '../engine/layer.js';
import { hasPins, setPin, channelValue, valuesAt, spreadFrames,
         framePinTimes, removePin, pinChX, pinChY } from '../engine/anim.js';
import { swayKeys } from '../engine/puppet.js';
import { blinkKeys, talkKeys } from '../engine/anim.js';
import { PRESET_GROUPS } from '../engine/presets.js';
import { FONTS, renderTextLayer, shortName } from '../io/text.js';

/* スライダーを つまんでいる間は 中身を作り直さない。
   作り直すと つまんでいた部品が 消えてしまい、
   指を離すまで 動かなくなる（＝タップした所に飛ぶだけになる）。 */
let holding = false;
export const holdSheet = (on) => { holding = !!on; };

export function createSheet(sheetEl, backEl){
  let builder = null;

  let pages = null;      // [{key,label,build}]
  let page = 0;

  function open(title, build){
    builder = build; pages = null; page = 0;
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
  }

  /** 横にスライドして切り替えるページで開く */
  function openPages(title, list, startKey){
    builder = null;
    pages = list;
    page = Math.max(0, list.findIndex(x => x.key === startKey));
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
  }
  function close(){
    sheetEl.classList.remove('on');
    backEl.classList.remove('on');
    builder = null;
  }
  const isOpen = () => sheetEl.classList.contains('on');

  function render(title){
    if(!builder && !pages) return;
    sheetEl.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'handle';
    sheetEl.appendChild(h);

    if(pages){
      const tabs = document.createElement('div');
      tabs.className = 'sheettabs';
      pages.forEach((pg, i) => {
        const b = document.createElement('button');
        b.textContent = pg.label;
        b.className = i === page ? 'on' : '';
        b.addEventListener('click', () => { page = i; render(title); });
        tabs.appendChild(b);
      });
      sheetEl.appendChild(tabs);

      const body = document.createElement('div');
      body.className = 'sheetbody';
      sheetEl.appendChild(body);
      pages[page].build(body);
      return;
    }

    if(title){
      const t = document.createElement('h2');
      t.textContent = title;
      sheetEl.appendChild(t);
    }
    builder(sheetEl);
  }

  /** 横に振ったらページを送る */
  function swipe(dx){
    if(!pages) return false;
    const n = page + (dx < 0 ? 1 : -1);
    if(n < 0 || n >= pages.length) return false;
    page = n; render(currentTitle());
    return true;
  }
  const currentTitle = () => sheetEl.querySelector('.sheettabs') ? '' : (sheetEl.querySelector('h2')?.textContent || '');

  backEl.addEventListener('click', close);

  // 下に振り切ったら閉じる。横に振ったらページ送り
  let sy = null, sx = null;
  sheetEl.addEventListener('pointerdown', (e) => {
    if(e.target.closest('input,select,button')) return;
    sy = e.clientY; sx = e.clientX;
  });
  sheetEl.addEventListener('pointerup', (e) => {
    if(sy !== null){
      const dy = e.clientY - sy, dx = e.clientX - sx;
      if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) swipe(dx);
      else if(dy > 70) close();
    }
    sy = null; sx = null;
  });

  return { open, openPages, close, isOpen,
           refresh: () => { if(isOpen() && !holding) render(currentTitle()); } };
}

/* ---------- 部品 ---------- */
export function field(label, node, valueNode){
  const r = document.createElement('div');
  r.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  r.appendChild(l);
  r.appendChild(node);
  if(valueNode) r.appendChild(valueNode);
  return r;
}

export function slider(label, get, set, min, max, step, fmt){
  const i = document.createElement('input');
  i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
  const v = document.createElement('span');
  v.className = 'val';
  const show = () => v.textContent = (fmt ? fmt(+i.value) : (+i.value).toFixed(2));
  show();
  i.addEventListener('pointerdown', () => { holdSheet(true); beginEdit(label + 'をかえる'); });
  i.addEventListener('input', () => { set(+i.value); show(); onChange(); });
  i.addEventListener('change', () => { holdSheet(false); commitEdit(); });
  ['pointerup','pointercancel','blur'].forEach(ev => i.addEventListener(ev, () => holdSheet(false)));
  return field(label, i, v);
}

/** ピンが打たれているレイヤーなら、値を変えたときに いまの時間のピンも更新する。
    ピンが無いうちは素の値を変えるだけ（勝手にピンが増えない）。 */
export function animSlider(label, layer, ch, min, max, step, fmt){
  const get = () => channelValue(layer, ch, S.time);
  const set = (v) => {
    if(ch === 'tint'){
      layer.tint = layer.tint || { color:'#F2A0B8', amount:0 };
      layer.tint.amount = v;
    } else if(ch === 'stroke'){
      layer.stroke = layer.stroke || { color:'#FFFEF7', width:0 };
      layer.stroke.width = v;
    } else layer[ch] = v;
    if(hasPins(layer)) setPin(layer, ch, S.time, v, 'smooth');
  };
  const i = document.createElement('input');
  i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
  const val = document.createElement('span');
  val.className = 'val';
  const show = () => val.textContent = (fmt ? fmt(+i.value) : (+i.value).toFixed(2));
  show();
  i.addEventListener('pointerdown', () => { holdSheet(true); beginEdit(label + 'をかえる'); });
  i.addEventListener('input', () => { set(+i.value); show(); onChange(); });
  i.addEventListener('change', () => { holdSheet(false); commitEdit(); });
  ['pointerup','pointercancel','blur'].forEach(ev => i.addEventListener(ev, () => holdSheet(false)));
  return field(label, i, val);
}

export function btnRow(...buttons){
  const r = document.createElement('div');
  r.className = 'rowbtns';
  buttons.forEach(b => r.appendChild(b));
  return r;
}

export function button(text, fn, cls){
  const b = document.createElement('button');
  b.textContent = text;
  if(cls) b.className = cls;
  b.addEventListener('click', fn);
  return b;
}

export function heading(text){
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

const SWAY_HINT = 'いまの時間から さいごまで、ゆれるピンを ならべます。'
  + String.fromCharCode(10)
  + '「おくれ」を大きくすると、毛先ほど おくれて しなります。';

/* ---------- レイヤーの設定 ---------- */
let onAddFrames = async () => 0;
export function setFrameAdder(fn){ onAddFrames = fn; }

let notify = () => {};
export function setNotifier(fn){ notify = fn; }

export function buildLayerSheet(box, closeFn){
  const l = selected();
  if(!l){
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = 'レイヤーをえらんでね';
    box.appendChild(p);
    return;
  }

  const nameIn = document.createElement('input');
  nameIn.value = l.name;
  nameIn.addEventListener('change', () => {
    edit('なまえをかえる', () => { l.name = nameIn.value || l.name; });
    onChange();
  });
  box.appendChild(field('なまえ', nameIn));

  const pct = v => Math.round(v * 100) + '%';
  box.appendChild(animSlider('すけ具合', l, 'opacity', 0, 1, 0.01, pct));

  /* フォルダは 絵を持たないので、まとめて動かすところだけ出す */
  if(isFolder(l)){
    const n = membersOf(S.proj, l).length;
    box.appendChild(animSlider('よこ幅', l, 'scaleX', 0.05, 4, 0.01, pct));
    box.appendChild(animSlider('たて幅', l, 'scaleY', 0.05, 4, 0.01, pct));
    box.appendChild(animSlider('かたむき', l, 'rot', -180, 180, 1, v => Math.round(v) + '°'));

    const note = document.createElement('div');
    note.className = 'empty';
    note.style.textAlign = 'left';
    note.textContent = '中身は ' + n + 'まい。'
      + String.fromCharCode(10)
      + 'ここを動かすと 中身ぜんぶが いっしょに動きます。'
      + String.fromCharCode(10)
      + '塗り・ぼかし・ふちどりは、中身を1まいにまとめてから'
      + String.fromCharCode(10)
      + 'かかります。だから ふちは 外がわにだけ 出ます。';
    box.appendChild(note);

    buildLook(box, l, { flip: false });

    box.appendChild(btnRow(
      button('📂 フォルダを ほどく', () => {
        edit('フォルダをほどく', () => { ungroup(S.proj, l, S.time); });
        S.sel = null;
        notify(n + 'まいを 外に出しました');
        onChange();
        if(closeFn) closeFn();
      })
    ));
    return;
  }

  box.appendChild(animSlider('よこ幅', l, 'scaleX', 0.05, 4, 0.01, pct));
  box.appendChild(animSlider('たて幅', l, 'scaleY', 0.05, 4, 0.01, pct));
  box.appendChild(field('たてよこ', (() => {
    const b = document.createElement('button');
    const on = () => l.lockAspect !== false;
    b.textContent = on() ? '🔗 そろえる' : '🔓 べつべつ';
    b.style.flex = '1';
    b.addEventListener('click', () => {
      edit('たてよこの そろえ方', () => {
        l.lockAspect = !on();
        if(l.lockAspect) l.scaleY = l.scaleX;   // そろえた瞬間に よこ幅へ合わせる
      });
      onChange();
    });
    return b;
  })()));
  box.appendChild(animSlider('かたむき', l, 'rot',   -180, 180, 1, v => Math.round(v) + '°'));

  /* ---------- コマ ---------- */
  box.appendChild(heading('コマ（' + l.frames.length + 'まい）'));
  if(l.frames.length <= 1){
    const h = document.createElement('div');
    h.className = 'empty';
    h.textContent = '絵を足すと、コマを切りかえる\nアニメが作れます';
    box.appendChild(h);
  }

  const strip = document.createElement('div');
  strip.className = 'framestrip';
  const now = valuesAt(l, S.time).frame;
  l.frames.forEach((aid, i) => {
    const a = S.proj.assets[aid];
    const b = document.createElement('button');
    b.className = 'frameitem' + (i === now ? ' on' : '');
    b.title = (i + 1) + 'コマめ';
    const im = document.createElement('img');
    if(a) im.src = a.src;
    im.alt = '';
    b.appendChild(im);
    const n = document.createElement('span');
    n.textContent = i + 1;
    b.appendChild(n);
    b.addEventListener('click', () => {
      // いまの時間から このコマ にする
      edit((i + 1) + 'コマめにする', () => setPin(l, 'frame', S.time, i, 'hold'));
      onChange();
    });
    strip.appendChild(b);
  });
  box.appendChild(strip);

  const addFrames = document.createElement('input');
  addFrames.type = 'file';
  addFrames.accept = 'image/png,image/jpeg';
  addFrames.multiple = true;
  addFrames.hidden = true;
  addFrames.addEventListener('change', async (e) => {
    const n = await onAddFrames(e.target.files, l);
    e.target.value = '';
    onChange();
  });
  box.appendChild(addFrames);

  box.appendChild(btnRow(
    button('＋ コマを足す', () => addFrames.click()),
    button('コマのピンを消す', () => {
      edit('コマのピンを消す', () => {
        framePinTimes(l).forEach(t => removePin(l, t, 'frame'));
      });
      onChange();
    })
  ));

  if(l.frames.length > 1){
    const sp = document.createElement('div');
    sp.className = 'rowbtns';
    [['0.1秒', 0.1], ['0.2秒', 0.2], ['0.5秒', 0.5]].forEach(([label, sec]) => {
      const b = button('1コマ ' + label, () => {
        edit('コマを等間隔にならべる', () => spreadFrames(l, sec, S.time));
        onChange();
      });
      b.style.flex = '1';
      sp.appendChild(b);
    });
    box.appendChild(field('ならべる', sp));
    const note = document.createElement('div');
    note.className = 'empty';
    note.style.textAlign = 'left';
    note.textContent = 'ならべたあと、タイムラインの◆を\n横にずらすと ためが作れます';
    box.appendChild(note);
  }

  /* ---------- パペットピン ---------- */
  if(l.pins && l.pins.length){
    box.appendChild(heading('ピンのかたさ（' + l.pins.length + '本）'));
    const setStiff = (v) => { l.stiff = v; if(l.mesh) l.mesh.dirty = true; };
    box.appendChild(slider('かたさ',
      () => l.stiff == null ? 1.4 : l.stiff,
      setStiff,
      0.4, 10, 0.1,
      v => v >= RIGID ? '関節' : v < 0.8 ? 'ふにゃ' : v < 2.2 ? 'ふつう' : 'しっかり'));

    const preset = document.createElement('div');
    preset.className = 'rowbtns';
    [['かみ・しっぽ', 0.8], ['ふく・耳', 2.0], ['うで・ゆび', 9]].forEach(([label, v]) => {
      const b = button(label, () => {
        edit('かたさをかえる', () => setStiff(v));
        notify(v >= RIGID ? '関節で カクッと 曲がります' : 'なめらかに 曲がります');
        onChange();
      });
      b.style.flex = '1';
      b.classList.toggle('on', Math.abs((l.stiff == null ? 1.4 : l.stiff) - v) < 0.3);
      preset.appendChild(b);
    });
    box.appendChild(field('めやす', preset));

    const h = document.createElement('div');
    h.className = 'empty';
    h.style.textAlign = 'left';
    h.textContent = 'かたさは ぜんたいの しなり具合です。'
      + String.fromCharCode(10)
      + 'ひじ・ゆびのように 1か所だけ カクッと 折りたいときは、'
      + String.fromCharCode(10)
      + '「ピン」→ 🦴かんせつ で そのピンを おしてください。'
      + String.fromCharCode(10)
      + '（うでは つけね→ひじ→手首→指先 の順に ピンをさす）';

    const jn = (l.pins || []).filter(p => p.joint).length;
    if(jn){
      const jd = document.createElement('div');
      jd.className = 'empty';
      jd.style.textAlign = 'left';
      jd.textContent = 'いま かんせつは ' + jn + 'か所（四角いピン）';
      box.appendChild(jd);
    }
    box.appendChild(h);
  }

    /* ---------- ゆらす（ピンを自動でうつ） ---------- */
    if(l.pins.length > 1){
      box.appendChild(heading('ゆらす'));
      l.sway = l.sway || { angle:8, period:1, phase:0, delay:0.2 };
      const sw = l.sway;
      box.appendChild(slider('曲がり角度', () => sw.angle,  v => sw.angle = v,  0, 30, 1, v => Math.round(v) + '°'));
      box.appendChild(slider('しゅうき',   () => sw.period, v => sw.period = v, 0.2, 4, 0.1, v => v.toFixed(1) + '秒'));
      box.appendChild(slider('いち',       () => sw.phase,  v => sw.phase = v,  0, 1, 0.05, v => v.toFixed(2)));
      box.appendChild(slider('おくれ',     () => sw.delay,  v => sw.delay = v,  0, 1, 0.05, v => v.toFixed(2)));

      box.appendChild(btnRow(
        button('◆ ゆれるピンをうつ', () => {
          const keys = swayKeys(l.pins, {
            angle: sw.angle, period: sw.period, phase: sw.phase, delay: sw.delay,
            duration: Math.max(sw.period, S.proj.duration - S.time), start: S.time
          });
          if(!keys.length) return notify('ピンを2本いじょう さしてね');
          edit('ゆれるピンをうつ', () => {
            keys.forEach(k => {
              k.pins.forEach((v, i) => {
                const pin = l.pins[i];
                if(pin.type === 'fix') return;
                setPin(l, pinChX(pin.id), k.t, v.dx, 'smooth');
                setPin(l, pinChY(pin.id), k.t, v.dy, 'smooth');
              });
            });
          });
          notify(keys.length + 'コの ピンを うちました');
          onChange();
        }),
        button('ゆれを けす', () => {
          edit('ゆれをけす', () => {
            l.pins.forEach(pn => {
              delete (l.tracks || {})[pinChX(pn.id)];
              delete (l.tracks || {})[pinChY(pn.id)];
              pn.dx = 0; pn.dy = 0;
            });
          });
          onChange();
        })
      ));

      const sh = document.createElement('div');
      sh.className = 'empty';
      sh.style.textAlign = 'left';
      sh.textContent = SWAY_HINT;
      box.appendChild(sh);
    }

  buildLook(box, l, { flip: true });

  box.appendChild(heading('親につける'));
  const pnote = document.createElement('div');
  pnote.className = 'empty';
  pnote.style.textAlign = 'left';
  pnote.textContent = '「' + l.name + '」を どのレイヤーに くっつけるか。\n'
    + 'えらんだレイヤーを動かすと、「' + l.name + '」も ついていきます。';
  box.appendChild(pnote);

  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = ''; none.textContent = '（どこにも つけない）';
  sel.appendChild(none);
  S.proj.layers.forEach(o => {
    if(o.id === l.id || isDescendant(S.proj, o.id, l.id)) return;
    const op = document.createElement('option');
    op.value = o.id; op.textContent = o.name;
    if(o.id === l.parent) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', () => {
    const ok = { v: false };
    edit('親をかえる', () => {
      ok.v = setParent(S.proj, l, sel.value || null, S.time, (d) => {
        // ピンが打たれているレイヤーは、いまの時間のピンも合わせて直す
        if(!hasPins(l)) return;
        ['x','y','rot','scaleX','scaleY'].forEach(ch => setPin(l, ch, S.time, d[ch], 'smooth'));
      });
    });
    const oyaNow = l.parent ? S.proj.layers.find(x => x.id === l.parent) : null;
    notify(!ok.v ? 'それには つけられません（じぶんの子だから）'
         : oyaNow ? '「' + oyaNow.name + '」に つきました'
                  : 'どこにも つけないように しました');
    onChange();
  });
  box.appendChild(field('親', sel));

  box.appendChild(heading('そのほか'));
  box.appendChild(btnRow(
    button('まんなかへ', () => {
      edit('まんなかへ', () => { l.x = S.proj.w / 2; l.y = S.proj.h / 2; });
      onChange();
    }),
    button('けす', () => {
      if(!confirm(l.name + ' をけしますか？')) return;
      edit('レイヤーをけす', () => {
        S.proj.layers = S.proj.layers.filter(x => x.id !== l.id);
        S.proj.layers.forEach(x => { if(x.parent === l.id) x.parent = null; });
        S.sel = null;
      });
      onChange();
      if(closeFn) closeFn();
    })
  ));
}

/* ================= うごき ================= */
export function buildMotionSheet(box){
  const l = selected();
  if(!l){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'レイヤーをえらんでね';
    box.appendChild(e);
    return;
  }

  const dur = { v: 0.6 };
  box.appendChild(slider('かかる時間', () => dur.v, v => dur.v = v, 0.2, 3, 0.1,
    v => v.toFixed(1) + '秒'));

  PRESET_GROUPS.forEach(gr => {
    box.appendChild(heading(gr.label));
    const wrap = document.createElement('div');
    wrap.className = 'presets';
    Object.keys(gr.map).forEach(name => {
      const b = document.createElement('button');
      b.textContent = name;
      b.addEventListener('click', () => {
        edit(name, () => gr.map[name](l, S.time, dur.v));
        notify(name + ' を いれました');
        onChange();
      });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  });

  const hint = document.createElement('div');
  hint.className = 'empty';
  hint.style.textAlign = 'left';
  hint.textContent = 'いまの時間から はじまります。'
    + String.fromCharCode(10)
    + 'いまの見た目が「おわりの姿」になります。';
  box.appendChild(hint);

  /* ---------- まばたき・口パク ---------- */
  /* まばたき・口パク は「1つのレイヤーが 絵を2まい以上もっている」のが前提。
     PSDだと 目あき・目とじ が べつのレイヤーになっていることが多いので、
     ここで まとめられるようにしておく。 */
  box.appendChild(heading('まばたき と 口パク'));

  const steps = document.createElement('div');
  steps.className = 'empty';
  steps.style.textAlign = 'left';
  const NL = String.fromCharCode(10);
  steps.textContent =
    '① このレイヤーに 目あき・目とじ の絵を そろえる' + NL +
    '② どれが「あいた絵」「とじた絵」か えらぶ' + NL +
    '③ ボタンを おすと、じどうで ピンが ならぶ';
  box.appendChild(steps);

  if(l.frames.length < 2){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'いま この レイヤーの 絵は 1まいです。' + NL
      + '目とじの絵が べつのレイヤーなら、' + NL
      + 'タイムラインで その行に ☑ を つけてから 下のボタン。' + NL
      + '（絵のファイルから 足すときは「かたち」の ＋コマを足す）';
    box.appendChild(e);
  }

  box.appendChild(btnRow(
    button('☑ えらんだレイヤーを コマにする', () => {
      const ids = S.pick.filter(id => id !== l.id);
      if(!ids.length) return notify('タイムラインで ☑ を つけてね');
      const r = { n: 0 };
      edit('コマにまとめる', () => { r.n = mergeAsFrames(S.proj, l, ids); });
      S.pick = [];
      notify(r.n ? r.n + 'まいを コマにしました（ぜんぶで ' + l.frames.length + 'コマ）'
                 : 'まとめられませんでした');
      onChange();
    })
  ));

  if(l.frames.length < 2) return;

  l.blink = l.blink || { open:0, close:1, every:3, hold:0.09 };
  l.talk  = l.talk  || { rate:8, len:2, closed:0 };

  const frameSel = (label, get, set) => {
    const sel = document.createElement('select');
    l.frames.forEach((_, i) => {
      const o = document.createElement('option');
      const a = S.proj.assets[l.frames[i]];
      o.value = i;
      o.textContent = (i + 1) + 'コマめ' + (a && a.name ? '（' + a.name + '）' : '');
      if(i === get()) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { set(+sel.value); onChange(); });
    return field(label, sel);
  };

  const sub = (t) => {
    const d = document.createElement('div');
    d.className = 'empty';
    d.style.textAlign = 'left';
    d.textContent = t;
    return d;
  };

  box.appendChild(heading('👁 まばたき'));
  box.appendChild(sub('ときどき 目をとじます。'
    + NL + '「あいだ」が みじかいほど よく またたきます。'));
  box.appendChild(frameSel('目があいた絵', () => l.blink.open,  v => l.blink.open = v));
  box.appendChild(frameSel('目をとじた絵', () => l.blink.close, v => l.blink.close = v));
  box.appendChild(slider('あいだ', () => l.blink.every, v => l.blink.every = v, 0.8, 8, 0.2,
    v => v.toFixed(1) + '秒'));
  box.appendChild(slider('とじる長さ', () => l.blink.hold, v => l.blink.hold = v, 0.04, 0.3, 0.01,
    v => v.toFixed(2) + '秒'));
  box.appendChild(btnRow(
    button('👁 まばたきを いれる', () => {
      const keys = blinkKeys({
        openFrame: l.blink.open, closeFrame: l.blink.close,
        every: l.blink.every, hold: l.blink.hold,
        start: S.time, end: S.proj.duration
      });
      edit('まばたきを いれる', () => {
        keys.forEach(k => setPin(l, 'frame', k.t, k.v, 'hold'));
      });
      notify(Math.floor((keys.length - 1) / 2) + 'かい まばたきします');
      onChange();
    })
  ));

  box.appendChild(heading('👄 口パク'));
  box.appendChild(sub('いまの時間から「しゃべる長さ」のあいだ、'
    + NL + '口の絵を パタパタ 入れかえます。さいごは 口をとじます。'));
  box.appendChild(slider('口のはやさ', () => l.talk.rate, v => l.talk.rate = v, 3, 16, 1,
    v => Math.round(v) + '/秒'));
  box.appendChild(slider('しゃべる長さ', () => l.talk.len, v => l.talk.len = v, 0.3, 8, 0.1,
    v => v.toFixed(1) + '秒'));
  box.appendChild(frameSel('とじた口の絵', () => l.talk.closed, v => l.talk.closed = v));
  box.appendChild(btnRow(
    button('👄 口パクを いれる', () => {
      const keys = talkKeys({
        frames: l.frames.map((_, i) => i),
        rate: l.talk.rate, closedFrame: l.talk.closed,
        start: S.time, end: Math.min(S.proj.duration, S.time + l.talk.len)
      });
      edit('口パクを いれる', () => {
        keys.forEach(k => setPin(l, 'frame', k.t, k.v, 'hold'));
      });
      notify(keys.length + 'コの ピンを うちました');
      onChange();
    }),
    button('コマのピンを消す', () => {
      edit('コマのピンを消す', () => {
        framePinTimes(l).forEach(t => removePin(l, t, 'frame'));
      });
      onChange();
    })
  ));
}

/* ================= テキスト ================= */
export function buildTextSheet(box){
  const l = selected();
  if(!l || l.kind !== 'text'){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'これは 文字のレイヤーでは ありません。'
      + String.fromCharCode(10)
      + '下の「ついか」から 文字を たせます。';
    box.appendChild(e);
    return;
  }

  const t = l.text;
  const redraw = async () => {
    await renderTextLayer(l);
    l.name = shortName(t.str);
    onChange();
  };

  const ta = document.createElement('textarea');
  ta.value = t.str;
  ta.rows = 2;
  ta.className = 'textin';
  ta.addEventListener('change', () => {
    edit('文字をかえる', () => { t.str = ta.value; });
    redraw();
  });
  box.appendChild(field('もじ', ta));

  const fsel = document.createElement('select');
  FONTS.forEach(f => {
    const o = document.createElement('option');
    o.value = f.key; o.textContent = f.label;
    if(f.key === t.font) o.selected = true;
    fsel.appendChild(o);
  });
  fsel.addEventListener('change', () => {
    edit('書体をかえる', () => { t.font = fsel.value; });
    redraw();
  });
  box.appendChild(field('しょたい', fsel));

  const colorRow = (label, get, set) => {
    const i = document.createElement('input');
    i.type = 'color'; i.value = get();
    i.style.cssText = 'min-height:38px;padding:2px';
    i.addEventListener('change', () => { edit(label, () => set(i.value)); redraw(); });
    return field(label, i);
  };
  box.appendChild(colorRow('もじの色', () => t.color,  v => t.color = v));
  box.appendChild(colorRow('ふちの色', () => t.stroke, v => t.stroke = v));

  const num = (label, get, set, min, max, step, fmt) => {
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
    const v = document.createElement('span');
    v.className = 'val';
    const show = () => v.textContent = fmt ? fmt(+i.value) : String(Math.round(+i.value));
    show();
    i.addEventListener('pointerdown', () => { holdSheet(true); beginEdit(label); });
    i.addEventListener('input', () => { set(+i.value); show(); });
    i.addEventListener('change', () => { holdSheet(false); commitEdit(); redraw(); });
    ['pointerup','pointercancel'].forEach(ev => i.addEventListener(ev, () => holdSheet(false)));
    return field(label, i, v);
  };
  box.appendChild(num('大きさ',   () => t.size,        v => t.size = v,        24, 400, 2));
  box.appendChild(num('ふちの太さ',() => t.strokeWidth, v => t.strokeWidth = v,  0, 40, 1));
  box.appendChild(num('ふとさ',   () => t.weight,      v => t.weight = v,     400, 800, 100));
  box.appendChild(num('行の間',   () => t.lineHeight,  v => t.lineHeight = v, 0.9, 2.2, 0.05,
    v => v.toFixed(2)));

  const asel = document.createElement('select');
  [['center','まんなか'],['left','ひだり'],['right','みぎ']].forEach(([v, lb]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = lb;
    if(v === t.align) o.selected = true;
    asel.appendChild(o);
  });
  asel.addEventListener('change', () => { edit('よせ方', () => { t.align = asel.value; }); redraw(); });
  box.appendChild(field('よせ方', asel));
}

/* ---------- 見た目（塗り・ぼかし・ふちどり） ----------
   ふつうのレイヤーでも フォルダでも 同じものが使える。
   フォルダは 中身を1まいにまとめてから かかるので、
   中に何まい入っていても ふちは 外側にだけ出る。 */
export function buildLook(box, l, opts){
  const pct = v => Math.round(v * 100) + '%';
  box.appendChild(heading('見た目'));

  // 塗り（色と強さ）
  const cwrap = document.createElement('div');
  cwrap.style.cssText = 'display:flex;gap:.4rem;align-items:center;flex:1';
  const col = document.createElement('input');
  col.type = 'color';
  col.value = (l.tint && l.tint.color) || '#F2A0B8';
  col.style.cssText = 'width:52px;min-height:38px;padding:2px;flex:0 0 52px';
  col.addEventListener('change', () => {
    edit('塗りの色をかえる', () => { l.tint = l.tint || {color:'#F2A0B8',amount:0}; l.tint.color = col.value; });
    onChange();
  });
  cwrap.appendChild(col);
  box.appendChild(field('塗りの色', cwrap));
  box.appendChild(animSlider('塗りの強さ', l, 'tint', 0, 1, 0.01, pct));

  box.appendChild(animSlider('ぼかし', l, 'blur', 0, 40, 0.5,
    v => v < 0.05 ? 'なし' : v.toFixed(1)));

  /* ふちどり。太さは キャンバスの大きさに対して一定なので、
     レイヤーを 大きくしても 細くならない。 */
  const swrap = document.createElement('div');
  swrap.style.cssText = 'display:flex;gap:.4rem;align-items:center;flex:1';
  const scol = document.createElement('input');
  scol.type = 'color';
  scol.value = (l.stroke && l.stroke.color) || '#FFFEF7';
  scol.style.cssText = 'width:52px;min-height:38px;padding:2px;flex:0 0 52px';
  scol.addEventListener('change', () => {
    edit('ふちの色をかえる', () => {
      l.stroke = l.stroke || { color:'#FFFEF7', width:0 };
      l.stroke.color = scol.value;
    });
    onChange();
  });
  swrap.appendChild(scol);
  box.appendChild(field('ふちの色', swrap));
  box.appendChild(animSlider('ふちどり', l, 'stroke', 0, 40, 0.5,
    v => v < 0.4 ? 'なし' : Math.round(v) + 'px'));

  if(opts && opts.flip){
    // 反転
    const flipRow = document.createElement('div');
    flipRow.className = 'rowbtns';
    [['flipX','⇄ 左右'], ['flipY','⇅ 上下']].forEach(([ch, label]) => {
      const b = document.createElement('button');
      const on = () => !!channelValue(l, ch, S.time);
      b.textContent = label;
      b.classList.toggle('on', on());
      b.addEventListener('click', () => {
        const next = !on();
        edit(label + 'に反転', () => {
          l[ch] = next;
          if(hasPins(l)) setPin(l, ch, S.time, next, 'hold');
        });
        onChange();
      });
      b.style.flex = '1';
      flipRow.appendChild(b);
    });
    box.appendChild(field('反転', flipRow));
  }
}
