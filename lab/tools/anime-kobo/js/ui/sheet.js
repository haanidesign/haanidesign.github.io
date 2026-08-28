/* 下から出てくる設定シート。細かい数字はここに隠す。 */

import { S, onChange, beginEdit, commitEdit, edit, selected } from '../state.js?v=86';
import { isDescendant, setParent, isFolder, membersOf, ungroup, mergeAsFrames,
         attachMany, copyLayers, pasteLayers, removeLayers,
         duplicateLayers, newPaintLayer, newSolidLayer,
         newFlip, isFlip, flipIndex, groupInto,
         splitFrames } from '../engine/layer.js?v=86';
import { hasPins, setPin, channelValue, valuesAt, spreadFrames,
         framePinTimes, removePin, pinChX, pinChY, EASES, EASE_LIST,
         curveAt, MY_EASE_MAX } from '../engine/anim.js?v=86';
import { swayKeys, swayPose, newSway, RIGID } from '../engine/puppet.js?v=86';
import { pathKeys, pathLength, resample } from '../engine/path.js?v=86';
import { blinkKeys, talkKeys } from '../engine/anim.js?v=86';
import { PRESET_GROUPS } from '../engine/presets.js?v=86';
import { FONTS, renderTextLayer, shortName, newTextStyle, textToCanvas,
         addTextLayer } from '../io/text.js?v=86';
import { addBgLayer, paintBg, fitToCanvas, isBg,
         paintPattern, addPatternBg, DIR_PRESETS } from '../io/bg.js?v=86';
import { PATTERN_NAMES } from '../io/pattern.js?v=86';
import { bakeLayers, applyBake } from '../io/flatten.js?v=86';
import { newHand } from '../engine/hand.js?v=86';
import { newReveal, totalLen, paintDirty } from '../engine/paint.js?v=86';
import { createWheel, favs, addFav, delFav, hasFav, parseHex, hex as toHex }
  from './colorwheel.js?v=86';
import { A as AUD, hasAudio, clearAudio, voiceMouthKeys, speechSpans,
         guessBpm, firstOnset } from '../io/audio.js?v=86';
import { rhythmKeys, rhythmChannels, beatTimes, beatSec, markKeys,
         RHYTHM_KINDS, putHit } from '../engine/rhythm.js?v=86';

/* スライダーを つまんでいる間は 中身を作り直さない。
   作り直すと つまんでいた部品が 消えてしまい、
   指を離すまで 動かなくなる（＝タップした所に飛ぶだけになる）。 */
let holding = false;
export const holdSheet = (on) => { holding = !!on; };

export function createSheet(sheetEl, backEl){
  let builder = null;

  let pages = null;      // [{key,label,build}]
  let page = 0;
  let lastPage = -1;

  /* シートは 画面の 下から 出るので、絵の 下のほうが かくれる。
     いじりながら 変わりぐあいを 見たいので、
     かくれた ぶんの 半分だけ 絵を 上へ よける。
     とじたら もとに もどす（ズームや 位置は そのまま）。 */
  let lifted = 0;
  function liftStage(on){
    const stage = document.querySelector('#stage');
    if(!stage) return;

    let want = 0;
    if(on){
      /* 出しきる のを 待って はからない。
         シートは 画面の 下に くっついて いるので、
         「画面の たかさ − シートの たかさ」が 上ばしに なる。
         これなら 出てくる とちゅうでも 正しく 出せる。 */
      const full = sheetEl.offsetWidth >= window.innerWidth - 2;   // 下から 出る ときだけ
      if(full){
        const top = window.innerHeight - sheetEl.offsetHeight;
        const sr = stage.getBoundingClientRect();
        want = Math.round(Math.max(0, sr.bottom - top) / 2);
      }
    }
    if(want === lifted) return;
    S.view.y += lifted - want;
    lifted = want;
    onChange();
  }

  function open(title, build){
    builder = build; pages = null; page = 0;
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
    liftStage(true);
  }

  /** 横にスライドして切り替えるページで開く */
  function openPages(title, list, startKey){
    builder = null;
    pages = list;
    page = Math.max(0, list.findIndex(x => x.key === startKey));
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
    liftStage(true);
  }
  function close(){
    liftStage(false);
    sheetEl.classList.remove('on');
    backEl.classList.remove('on');
    builder = null;
  }
  const isOpen = () => sheetEl.classList.contains('on');

  function render(title){
    if(!builder && !pages) return;
    /* 中身を 作り直すと 上まで もどってしまうので、
       見ていた場所を おぼえておく（ページを かえたときは 上から） */
    const keep = sheetEl.scrollTop;
    const body0 = sheetEl.querySelector('.sheetbody');
    const keepBody = body0 ? body0.scrollTop : 0;
    const samePage = lastPage === page;
    lastPage = page;

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
      if(samePage) restoreScroll(sheetEl, body, keep, keepBody);
      return;
    }

    if(title){
      const t = document.createElement('h2');
      t.textContent = title;
      sheetEl.appendChild(t);
    }
    builder(sheetEl);
    restoreScroll(sheetEl, null, keep, 0);
  }

  /* 中身を入れ直した直後は 高さが まだ決まっていないことがあるので、
     いちど描いてもらってから 位置をもどす。 */
  function restoreScroll(host, body, keep, keepBody){
    const put = () => {
      if(body && body.scrollHeight > body.clientHeight) body.scrollTop = keepBody;
      if(keep) host.scrollTop = keep;
    };
    put();
    requestAnimationFrame(put);
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
  /* よこ画面では 右から 出るので、閉じ方も 右へ ふり切る */
  const sideMode = () => window.matchMedia
    && window.matchMedia('(orientation:landscape) and (max-height:560px)').matches;

  sheetEl.addEventListener('pointerup', (e) => {
    if(sy !== null){
      const dy = e.clientY - sy, dx = e.clientX - sx;
      if(sideMode()){
        if(dx > 70 && Math.abs(dx) > Math.abs(dy)) close();
      } else if(Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5){
        swipe(dx);
      } else if(dy > 70){
        close();
      }
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

/**
 * 色えらび。おすと カラーサークルが 下に ひらく。
 * まわりの わっか＝色あい、まん中の 四角＝こさ と 明るさ。
 */
export function colorPick(label, get, set){
  const NL = String.fromCharCode(10);
  const wrap = document.createElement('div');
  wrap.className = 'colorpick';

  const row = document.createElement('div');
  row.className = 'field';
  const lb = document.createElement('label');
  lb.textContent = label;
  row.appendChild(lb);

  // 色だけの まる。番号は となりに 出す（色の上に のせると 読みにくい）
  const btn = document.createElement('button');
  btn.className = 'swatch';
  btn.setAttribute('aria-label', label + 'をえらぶ');
  const code = document.createElement('span');
  code.className = 'val dot';

  const paint = (c) => { btn.style.background = c; code.textContent = c; };
  paint(get());
  row.appendChild(btn);
  row.appendChild(code);
  wrap.appendChild(row);

  const box = document.createElement('div');
  box.className = 'wheelbox';
  box.hidden = true;
  wrap.appendChild(box);

  let wheel = null, hexIn = null, favRow = null, favBtn = null;

  const use = (c, done) => {
    beginEdit(label + 'をかえる');
    set(c);
    paint(c);
    if(hexIn && document.activeElement !== hexIn) hexIn.value = c;
    if(wheel) wheel.set(c);
    if(favBtn) favBtn.textContent = hasFav(c) ? '★ おきにいり ずみ' : '☆ おきにいりに 入れる';
    onChange();
    if(done) commitEdit();
  };

  const buildFavs = () => {
    favRow.innerHTML = '';
    const list = favs();
    if(!list.length){
      const e = document.createElement('span');
      e.className = 'val';
      e.textContent = 'まだ ありません';
      favRow.appendChild(e);
      return;
    }
    list.forEach(c => {
      const b = document.createElement('button');
      b.className = 'favchip';
      b.style.background = c;
      b.title = c;
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => use(c, true));
      favRow.appendChild(b);
    });
  };

  btn.addEventListener('click', () => {
    const open = box.hidden;
    box.hidden = !open;
    holdSheet(open);                   // ひらいている間は 中身を 作り直さない
    if(!open) return;
    if(wheel) return;

    wheel = createWheel(get(), (c, done) => use(c, done));
    box.appendChild(wheel.el);

    /* 色の ばんごうを 直に 打てるように */
    hexIn = document.createElement('input');
    hexIn.type = 'text';
    hexIn.value = get();
    hexIn.maxLength = 7;
    hexIn.spellcheck = false;
    hexIn.className = 'hexin dot';
    hexIn.setAttribute('aria-label', 'カラーコード');
    const applyHex = () => {
      let v = String(hexIn.value || '').trim();
      if(v[0] !== '#') v = '#' + v;
      if(!/^#[0-9a-f]{6}$/i.test(v)){
        hexIn.value = get();
        return notify('#ff88cc のように 6けたで 入れてね');
      }
      const rgb = parseHex(v);
      use(toHex(rgb[0], rgb[1], rgb[2]), true);
    };
    hexIn.addEventListener('change', applyHex);
    hexIn.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); applyHex(); } });
    box.appendChild(field('カラーコード', hexIn));

    /* おきにいり */
    favRow = document.createElement('div');
    favRow.className = 'favs';
    buildFavs();
    box.appendChild(field('おきにいり', favRow));

    favBtn = button(hasFav(get()) ? '★ おきにいり ずみ' : '☆ おきにいりに 入れる', () => {
      const c = get();
      if(hasFav(c)){ delFav(c); notify('おきにいりから 外しました'); }
      else { addFav(c); notify('おきにいりに 入れました'); }
      favBtn.textContent = hasFav(c) ? '★ おきにいり ずみ' : '☆ おきにいりに 入れる';
      buildFavs();
    });
    box.appendChild(btnRow(favBtn));

    const ok = button('とじる', () => {
      box.hidden = true;
      holdSheet(false);
      onChange();
    });
    ok.className = 'btn-y';
    box.appendChild(ok);
  });
  return wrap;
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

  /* カギ。かけると 絵の上では さわれない。
     行に ボタンを 置くと ごちゃつくので ここに 入れた。
     かかっている ときは 名前の 先頭に 🔒 が つく。 */
  box.appendChild(field('カギ', (() => {
    const b = document.createElement('button');
    const show = () => {
      b.textContent = l.locked ? '🔒 かかっている' : '🔓 かかっていない';
      b.classList.toggle('on', !!l.locked);
    };
    show();
    b.style.flex = '1';
    b.addEventListener('click', () => {
      edit(l.locked ? 'カギをあける' : 'カギをかける', () => { l.locked = !l.locked; });
      show();
      notify(l.locked ? '絵の上では さわれなくなりました' : 'さわれるように しました');
      onChange();
    });
    return b;
  })()));

  const pct = v => Math.round(v * 100) + '%';
  box.appendChild(animSlider('すけ具合', l, 'opacity', 0, 1, 0.01, pct));

  /* フォルダは 絵を持たないので、まとめて動かすところだけ出す */
  if(isFolder(l)){
    const n = membersOf(S.proj, l).length;
    box.appendChild(animSlider('よこ幅', l, 'scaleX', 0.05, 4, 0.01, pct));
    box.appendChild(animSlider('たて幅', l, 'scaleY', 0.05, 4, 0.01, pct));
    box.appendChild(aspectRow(l));
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
  box.appendChild(aspectRow(l));
  box.appendChild(animSlider('かたむき', l, 'rot',   -180, 180, 1, v => Math.round(v) + '°'));

  /* ---------- コマ ---------- */
  /* 文字レイヤーは 絵が1まいしか無いので、コマの欄は 出さない。
     テキストのページに 用があるものだけ 残す。 */
  if(l.kind === 'text'){
    const n = document.createElement('div');
    n.className = 'empty';
    n.style.textAlign = 'left';
    n.textContent = '文字そのものを かえるときは 下の「🅰もじ」から。';
    box.appendChild(n);
    box.appendChild(clipRow(l));
    buildLook(box, l, { flip: true });
    parentLink(box, l, closeFn);
    otherRow(box, l, closeFn);
    return;
  }

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

  box.appendChild(clipRow(l));
  buildLook(box, l, { flip: true });

  parentLink(box, l, closeFn);
  otherRow(box, l, closeFn);

}

/* ================= うごき ================= */
/* ================= うごき =================
   ぜんぶ 1まいに ならべると 長すぎて さがせないので、
   「何を したいか」で 5つに 分けた。
   えらぶと それぞれ 別の画面に なる（タブでは ない）。 */

/** どのレイヤーにも つかう 小さな 道具 */
function motionHelp(box, l){
  const isPuppet = (ch) => /^P.+:(x|y)$/.test(ch);
  const chans = () => Object.keys(l.tracks || {}).filter(ch => !isPuppet(ch));
  const count = () => chans().reduce((n, ch) => n + ((l.tracks[ch] || []).length), 0);
  return { chans, count };
}

/** 上に「◀ もどる」を 出す */
function backRow(box, back){
  if(!back) return;
  const b = button('◀ うごき に もどる', back);
  b.style.flex = '1';
  box.appendChild(btnRow(b));
}

export function buildMotionSheet(box, open){
  const l = selected();
  if(!l){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'レイヤーをえらんでね';
    box.appendChild(e);
    return;
  }
  const NL = String.fromCharCode(10);
  const { count } = motionHelp(box, l);

  const now = count();
  const head = document.createElement('div');
  head.className = 'empty';
  head.style.textAlign = 'left';
  head.textContent = now
    ? '「' + l.name + '」に うごきのピンが ' + now + 'コ あります。'
    : '「' + l.name + '」に まだ うごきのピンは ありません。';
  box.appendChild(head);

  const MENU = [
    ['form',   '✨ 出る・消える',  'ふわっと出る、下からあがる、消える など'],
    ['loop',   '🔁 ずっと うごく', '呼吸・ふわふわ・かみのゆれ'],
    ['path',   '👆 みちを なぞる', 'なぞった みちを 何秒で 通るか'],
    ['beat',   '🥁 リズム（BPM）', '拍に あわせて ピンを うつ'],
    ['flip',   '🎞 パラパラ',      '☑ でえらんだ 絵を コマにして 順ぐりに 出す'],
    ['finish', '💨 しあげ',        'うごきブラー／ピンの おそうじ']
  ];

  MENU.forEach(([key, label, note]) => {
    const b = document.createElement('button');
    b.className = 'menuitem';
    const t = document.createElement('span');
    t.className = 'menutext';
    const bb = document.createElement('b');
    bb.textContent = label;
    const ii = document.createElement('i');
    ii.textContent = note;
    t.appendChild(bb); t.appendChild(ii);
    b.appendChild(t);
    const ar = document.createElement('span');
    ar.className = 'menuarrow';
    ar.textContent = '▸';
    b.appendChild(ar);
    b.addEventListener('click', () => open(key));
    box.appendChild(b);
  });
}

/* ---------- ① 出る・消える ---------- */
export function buildEnterSheet(box, back){
  const l = selected();
  if(!l) return;
  backRow(box, back);

  const dur = { v: 0.6 };
  box.appendChild(slider('かかる時間', () => dur.v, v => dur.v = v, 0.2, 3, 0.1,
    v => v.toFixed(1) + '秒'));

  PRESET_GROUPS.filter(gr => gr.key !== 'loop').forEach(gr => {
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
}

/* ---------- ② ずっと うごく ---------- */
export function buildLoopSheet(box, back){
  const l = selected();
  if(!l) return;
  backRow(box, back);

  const dur = { v: 2 };
  box.appendChild(slider('ひとまわりの 時間', () => dur.v, v => dur.v = v, 0.4, 6, 0.1,
    v => v.toFixed(1) + '秒'));

  const gr = PRESET_GROUPS.find(g => g.key === 'loop');
  if(gr){
    box.appendChild(heading('ずっと くりかえす'));
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
  }

  buildSway(box, l);
}

/* ---------- ③ みちを なぞる ---------- */
export function buildTraceSheet(box, back){
  const l = selected();
  if(!l) return;
  backRow(box, back);
  const NL = String.fromCharCode(10);

  box.appendChild(heading('👆 なぞって うごかす'));
  const tnote = document.createElement('div');
  tnote.className = 'empty';
  tnote.style.textAlign = 'left';
  tnote.textContent = '絵の上を 指で なぞると、その みちを 通ります。' + NL
    + 'なぞった あとで「何秒で 通るか」を きめます。' + NL
    + '道のりで 等分に ピンを 打つので、まがり角でも 形が くずれません。';
  box.appendChild(tnote);
  box.appendChild(btnRow(
    button('👆 みちを なぞる', () => { onTrace(); })
  ));
}

/* ---------- ④ リズム ---------- */
export function buildBeatSheet(box, back){
  const l = selected();
  if(!l) return;
  backRow(box, back);
  buildRhythm(box, l);
}

/* ---------- ⑤ しあげ ---------- */
export function buildFinishSheet(box, back){
  const l = selected();
  if(!l) return;
  backRow(box, back);
  const NL = String.fromCharCode(10);
  const { chans, count } = motionHelp(box, l);

  box.appendChild(heading('💨 うごきブラー'));
  const bnote = document.createElement('div');
  bnote.className = 'empty';
  bnote.style.textAlign = 'left';
  bnote.textContent = 'はやく 動いている ときだけ ぶれます。' + NL
    + '止まっている ときは 何も 変わりません。' + NL
    + '（置く・回す・大きさ・ピンの曲げ ぜんぶに 効きます）';
  box.appendChild(bnote);
  box.appendChild(slider('ブラーの つよさ',
    () => l.mblur || 0, v => l.mblur = v, 0, 1, 0.05,
    v => v < 0.03 ? 'なし' : Math.round(v * 100) + '%'));

  box.appendChild(heading('🗑 ピンの おそうじ'));
  const c = document.createElement('div');
  c.className = 'empty';
  c.style.textAlign = 'left';
  c.textContent = 'いま うごきのピンは ' + count() + 'コ。' + NL
    + '（パペットピンの ゆれは のこります）';
  box.appendChild(c);
  box.appendChild(btnRow(
    button('🗑 うごきのピンを ぜんぶ けす', () => {
      const n = count();
      if(!n) return notify('けす ピンが ありません');
      if(!confirm('「' + l.name + '」の うごきのピン ' + n + 'コを ぜんぶ けしますか？' + NL + NL
        + '（パペットピンの ゆれは のこります）')) return;
      edit('うごきのピンを ぜんぶけす', () => {
        chans().forEach(ch => delete l.tracks[ch]);
        l.loop = null;
      });
      notify(n + 'コ けしました（もどす で 戻せます）');
      onChange();
    })
  ));
}

/* ---------- リズム（BPM）でピンをうつ ----------
   拍の しゅんかんに ぐっと 変えて、すぐ もどす。
   もどりを 少し 行きすぎさせると ぽにょんと はねて見える。 */
function buildRhythm(box, l){
  const NL = String.fromCharCode(10);
  box.appendChild(heading('🥁 リズム（BPM）'));

  l.beat = l.beat || {
    bpm: 120, every: 1, kind: 'omote', motion: 'ぽにょん',
    power: 0.35, offset: 0, bars: 8
  };
  const B = l.beat;

  const info = document.createElement('div');
  info.className = 'empty';
  info.style.textAlign = 'left';
  const showInfo = () => {
    info.textContent = '1拍 ' + beatSec(B.bpm).toFixed(2) + '秒。'
      + NL + '拍の しゅんかんに うごいて、すぐ もどります。';
  };
  showInfo();
  box.appendChild(info);

  /* 数字で ずばり 入れられるように（120 など）。
     スライダーだけだと ぴったりの 数に しづらい。 */
  const bpmIn = document.createElement('input');
  bpmIn.type = 'number';
  bpmIn.min = 20; bpmIn.max = 400; bpmIn.step = 1;
  bpmIn.value = Math.round(B.bpm);
  bpmIn.inputMode = 'numeric';
  bpmIn.style.cssText = 'flex:0 0 84px;text-align:center;font-weight:800';
  const unit = document.createElement('span');
  unit.className = 'val';
  unit.textContent = 'BPM';
  bpmIn.addEventListener('change', () => {
    const v = Math.max(20, Math.min(400, Math.round(+bpmIn.value || 120)));
    B.bpm = v; bpmIn.value = v;
    showInfo();
    onChange();
  });
  box.appendChild(field('はやさ', bpmIn, unit));

  box.appendChild(slider('スライダーでも', () => B.bpm,
    v => { B.bpm = v; bpmIn.value = Math.round(v); showInfo(); },
    40, 220, 1, v => Math.round(v) + ' BPM'));

  const quick = document.createElement('div');
  quick.className = 'rowbtns';
  quick.style.flexWrap = 'wrap';
  [60, 90, 100, 120, 140, 160, 174, 180].forEach(v => {
    const b = button(String(v), () => {
      B.bpm = v; bpmIn.value = v; showInfo(); onChange();
    });
    b.style.flex = '0 0 22%';
    b.classList.toggle('on', Math.round(B.bpm) === v);
    quick.appendChild(b);
  });
  box.appendChild(field('よくある はやさ', quick));

  /* 音から さがす／トントンして きめる */
  const find = document.createElement('div');
  find.className = 'rowbtns';
  find.appendChild(button('🎵 音から さがす', () => {
    if(!hasAudio()) return notify('さきに 音を 読みこんでね（せってい → おと）');
    const bpm = guessBpm();
    if(!bpm) return notify('見つかりませんでした。トントンで きめてね');
    B.bpm = Math.max(60, Math.min(200, bpm));
    B.offset = firstOnset();
    notify('だいたい ' + B.bpm + ' BPM。はじまり ' + B.offset.toFixed(2) + '秒');
    onChange();
  }));

  let taps = [];
  const tapB = button('👆 トントン して きめる', () => {
    const now = performance.now() / 1000;
    if(taps.length && now - taps[taps.length - 1] > 2.5) taps = [];   // あいだが あいたら やりなおし
    taps.push(now);
    if(taps.length < 2){ tapB.textContent = '👆 もっと トントン'; return; }
    let sum = 0;
    for(let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    const avg = sum / (taps.length - 1);
    const bpm = Math.max(60, Math.min(200, 60 / avg));
    B.bpm = Math.round(bpm);
    tapB.textContent = '👆 ' + B.bpm + ' BPM（' + taps.length + '回）';
    showInfo();
  });
  find.appendChild(tapB);
  box.appendChild(field('BPMを きめる', find));

  /* 表 / うら */
  const kinds = document.createElement('div');
  kinds.className = 'rowbtns';
  [['おもて拍','omote'], ['うら拍','ura'], ['りょうほう','both']].forEach(([lb, v]) => {
    const b = button(lb, () => { B.kind = v; onChange(); });
    b.style.flex = '1';
    b.classList.toggle('on', B.kind === v);
    kinds.appendChild(b);
  });
  box.appendChild(field('どの拍で', kinds));

  const evs = document.createElement('div');
  evs.className = 'rowbtns';
  [['8分（こまかく）', 0.5], ['1拍ごと', 1], ['2拍ごと', 2], ['4拍ごと', 4]].forEach(([lb, v]) => {
    const b = button(lb, () => { B.every = v; onChange(); });
    b.style.flex = '0 0 45%';
    b.classList.toggle('on', B.every === v);
    evs.appendChild(b);
  });
  evs.style.flexWrap = 'wrap';
  box.appendChild(field('かんかく', evs));

  box.appendChild(slider('はじまり', () => B.offset, v => B.offset = v,
    0, 2, 0.01, v => v.toFixed(2) + '秒'));
  box.appendChild(slider('なん拍ぶん', () => B.bars, v => B.bars = v, 2, 64, 1,
    v => Math.round(v) + '拍'));

  box.appendChild(heading('◆ ピンだけ うつ（うごきは 自分で）'));

  /* うごきは つけず、拍の ところに 印だけ うつ。
     あとで 自分で 動かせば、ぴったり リズムに 合う。 */

  /** 印のピンを うつ。beats を わたすと その拍ぶんだけ */
  const putMarks = (beats, label) => {
    const start = S.time;
    const b = beatSec(B.bpm);
    const end = Math.min(S.proj.duration, start + b * beats);
    if(end - start < b * 0.99){
      return notify('のこり時間が みじかいです（' + b.toFixed(2) + '秒 いります）');
    }
    const pose = valuesAt(l, S.time);
    const r = { n: 0, times: [] };
    edit(label, () => {
      const got = markKeys(l, {
        bpm: B.bpm, every: B.every, kind: 'both',
        offset: 0, start, end, pose
      });
      r.n = got.n; r.times = got.times;
      if(B.loopIt !== false && got.times.length > 1){
        l.loop = { from: got.times[0].t, to: got.times[got.times.length - 1].t, mode: 'loop' };
      }
    });
    if(!r.n) return notify('うてませんでした');
    notify(r.times.length + 'コの 拍に ピンを うちました'
      + (B.loopIt !== false ? '（くり返しに しました）' : ''));
    onChange();
  };

  box.appendChild(btnRow(
    button('◆ 1拍ぶん（表2・裏1）', () => putMarks(1, '1拍ぶんのピン'))
  ));

  const onenote = document.createElement('div');
  onenote.className = 'empty';
  onenote.style.textAlign = 'left';
  onenote.textContent = 'はじめの拍・まん中の うら拍・つぎの拍 の 3つに ピンが つきます。'
    + NL + 'まん中を 動かせば、それだけで リズムに 合った くり返しに なります。';
  box.appendChild(onenote);

  box.appendChild(btnRow(
    button('◆ 拍のところに ピンだけ うつ', () => {
      const start = S.time;
      const end = Math.min(S.proj.duration, start + beatSec(B.bpm) * B.bars);
      const r = { n: 0, times: [] };
      const pose = valuesAt(l, S.time);
      edit('拍のピンをうつ', () => {
        const got = markKeys(l, {
          bpm: B.bpm, every: B.every, kind: B.kind,
          offset: B.offset, start, end, pose
        });
        r.n = got.n; r.times = got.times;
        // さいごの拍まで を くり返しに する（自分で うごきを つければ ループになる）
        if(B.loopIt !== false && got.times.length > 1){
          l.loop = {
            from: got.times[0].t,
            to: got.times[got.times.length - 1].t,
            mode: 'loop'
          };
        }
      });
      if(!r.n) return notify('うてませんでした（時間を のばしてね）');
      notify(r.times.length + 'コの 拍に ピンを うちました'
        + (B.loopIt !== false ? '（くり返しに しました）' : ''));
      onChange();
    })
  ));

  const loopRow = document.createElement('div');
  loopRow.className = 'rowbtns';
  [['くり返す', true], ['くり返さない', false]].forEach(([lb, v]) => {
    const b = button(lb, () => { B.loopIt = v; onChange(); });
    b.style.flex = '1';
    b.classList.toggle('on', (B.loopIt !== false) === v);
    loopRow.appendChild(b);
  });
  box.appendChild(field('拍のピンは', loopRow));

  const mnote = document.createElement('div');
  mnote.className = 'empty';
  mnote.style.textAlign = 'left';
  mnote.textContent = '「ピンだけ」は うごきを つけません。' + NL
    + 'いまの姿の まま 拍の ところに ならぶので、' + NL
    + 'その ピンを 1つずつ 動かせば 自分の うごきが リズムに 合います。';
  box.appendChild(mnote);

  /* ---- ここから下は うごきも つける ---- */
  box.appendChild(heading('🎬 うごきも つける'));
  const mm = document.createElement('div');
  mm.className = 'empty';
  mm.style.textAlign = 'left';
  mm.textContent = 'こちらは 拍に 合わせて うごきまで つけます。'
    + NL + '自分で うごかしたいときは 上の「ピンだけ」を つかってね。';
  box.appendChild(mm);

  /* うごきの 種類 */
  const ms = document.createElement('div');
  ms.className = 'rowbtns';
  ms.style.flexWrap = 'wrap';
  RHYTHM_KINDS.forEach(name => {
    const b = button(name, () => { B.motion = name; onChange(); });
    b.style.flex = '0 0 30%';
    b.classList.toggle('on', B.motion === name);
    ms.appendChild(b);
  });
  box.appendChild(field('うごき', ms));

  box.appendChild(slider('つよさ', () => B.power, v => B.power = v, 0.05, 1, 0.05,
    v => Math.round(v * 100) + '%'));

  /* ---- 1回だけ 入れる ----
     ぜんぶの 拍に 打つと、あとから 1つだけ 変えるのが 大へん。
     1回ぶんだけ 入れて おけば、あとは
     タイムラインの ⧉コピー → 📋はりつけ で
     好きな ところに 好きなだけ ならべられる。 */
  box.appendChild(btnRow(
    button('◆ ここに 1回だけ 入れる', () => {
      const t0 = S.time;
      const b = beatSec(B.bpm);
      if(t0 + b > S.proj.duration + 1e-6){
        return notify('のこり時間が みじかいです（' + b.toFixed(2) + '秒 いります）');
      }
      const pose = valuesAt(l, t0);
      const r = { n: 0 };
      edit(B.motion + ' を 1回', () => {
        r.n = putHit(l, t0, {
          motion: B.motion, beat: b, power: B.power,
          base: {
            x: pose.x, y: pose.y, sx: pose.scaleX, sy: pose.scaleY,
            rot: pose.rot, op: pose.opacity
          }
        });
      });
      if(!r.n) return notify('入れられませんでした');

      /* 入れた ぶんを そのまま えらんだ ことに して、
         すぐ ⧉コピー を おせるように する。
         （拍の おわりまでを ひとまとまりに して えらぶ） */
      const back = Math.min(0.34, b * 0.62);
      S.selPins = { layer: l.id, times: [+t0.toFixed(3), +(t0 + back).toFixed(3)] };

      notify(B.motion + ' を 1回 入れました（ピン ' + r.n + 'コ）' + NL
        + 'えらんだ ままなので ⧉コピー → 📋はりつけ で ならべられます');
      onChange();
    })
  ));

  const oneNote = document.createElement('div');
  oneNote.className = 'empty';
  oneNote.style.textAlign = 'left';
  oneNote.textContent = '1回ぶん（' + beatSec(B.bpm).toFixed(2) + '秒）だけ 入ります。' + NL
    + 'あとは タイムラインで その ピンを えらんで' + NL
    + '⧉コピー → 再生バーを うごかして → 📋はりつけ。' + NL
    + '「◆ ピンだけ うつ」で 拍の 印を 先に 打っておくと' + NL
    + 'はりつける ところが ぴったり わかります。';
  box.appendChild(oneNote);

  box.appendChild(heading('◆ ぜんぶの 拍に うつ'));
  box.appendChild(btnRow(
    button('◆ リズムで ピンをうつ', () => {
      const start = S.time;
      const end = Math.min(S.proj.duration, start + beatSec(B.bpm) * B.bars);
      const n = { v: 0 };
      edit('リズムで ピンをうつ', () => {
        n.v = rhythmKeys(l, {
          bpm: B.bpm, every: B.every, kind: B.kind, motion: B.motion,
          power: B.power, offset: B.offset, start, end
        });
      });
      if(!n.v) return notify('うてませんでした（時間を のばしてね）');
      const beats = beatTimes({ bpm:B.bpm, every:B.every, kind:B.kind, start, end, offset:B.offset });
      notify(beats.length + '回 きざみます（ピン ' + n.v + 'コ）');
      onChange();
    }),
    button('リズムを けす', () => {
      edit('リズムをけす', () => {
        rhythmChannels(B.motion).forEach(ch => delete (l.tracks || {})[ch]);
      });
      notify('リズムを けしました');
      onChange();
    })
  ));


  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'いまの時間から はじまります。' + NL
    + 'うら拍は 少し ひかえめに うごきます。' + NL
    + '音を 読みこんでいれば「音から さがす」で BPMが わかります。';
  box.appendChild(note);
}

/* ---------- かみのゆれ ----------
   ピンが 2本いじょう ささっていれば、骨を しならせて ゆらす
   （つけねは 止まったまま、毛先ほど おくれて 動く）。
   ささっていなければ、じくを 中心に かたむけて ゆらす。 */
function buildSway(box, l){
  const NL = String.fromCharCode(10);
  const boned = (l.pins || []).length > 1;

  box.appendChild(heading('🌬 かみのゆれ'));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = boned
    ? 'ピンが ' + l.pins.length + '本 あるので、骨を しならせて ゆらします。'
      + NL + 'つけねは 止まったまま、毛先ほど おくれて 動きます。'
    : 'じく（回転の中心）を 中心に かたむけて ゆらします。'
      + NL + 'かみのけの つけねに じくを 置くと それらしくなります。'
      + NL + '「ピン」を 2本いじょう さすと、しなって もっと自然に。';
  box.appendChild(note);

  l.sway = Object.assign(newSway(), l.sway || {}, { on: !!(l.sway && l.sway.on) });
  const sw = l.sway;

  /* ---- ずっと ゆらす（ピンを 打たない）----
     ピンを 何コマか 打って あいだを つなぐ やり方だと、
     なみの 山と 谷の あいだが まっすぐな 線に なって カクカクする。
     ここを オンに すると、何秒めでも 本物の なみを その場で 出すので
     なめらかに ゆれる。数字を 変えれば すぐ 効く。 */
  {
    const swt = document.createElement('button');
    swt.style.flex = '1';
    const paintSwt = () => {
      swt.textContent = sw.on ? '🌬 ずっと ゆらす … オン' : '🌬 ずっと ゆらす … オフ';
      swt.classList.toggle('on', !!sw.on);
    };
    paintSwt();
    swt.addEventListener('click', () => {
      edit('ずっと ゆらす', () => { sw.on = !sw.on; });
      paintSwt();
      onChange();
    });
    box.appendChild(btnRow(swt));

    const liveNote = document.createElement('div');
    liveNote.className = 'empty';
    liveNote.style.textAlign = 'left';
    liveNote.textContent = 'オンの あいだは ピンを 打たずに ずっと ゆれます。'
      + NL + 'カクカクせず、数字を 変えると すぐ 効きます。'
      + NL + 'レイヤー 1まいずつ 別べつに つけられます。'
      + NL + (boned
        ? '（オンの あいだ、そのレイヤーの パペットピンの'
          + NL + '　うごきのピンは お休みします）'
        : 'ピンが ないので じくを 中心に かたむけて ゆらします。'
          + NL + '「ピン」を 2本いじょう さすと、しなって もっと自然に。');
    box.appendChild(liveNote);
  }

  /* ---- こまかい ちょうせつ ---- */
  box.appendChild(slider('曲がり角度', () => sw.angle, v => sw.angle = v,
    0, 30, 1, v => Math.round(v) + '°'));
  box.appendChild(slider('しゅうき', () => sw.period, v => sw.period = v,
    0.2, 4, 0.1, v => v.toFixed(1) + '秒'));
  box.appendChild(slider('いち（ずらし）', () => sw.phase, v => sw.phase = v,
    0, 1, 0.05, v => v.toFixed(2)));
  const dl = slider('おくれ', () => sw.delay, v => sw.delay = v,
    0, 1, 0.05, v => v.toFixed(2));
  box.appendChild(dl);
  if(!boned){
    const inp = dl.querySelector('input');
    if(inp) inp.disabled = true;
    const v = dl.querySelector('.val');
    if(v) v.textContent = '—';
    dl.title = 'ピンを 2本いじょう さすと つかえます（毛先が おくれて しなる）';
    const dn = dl.querySelector('label');
    if(dn) dn.textContent = 'おくれ（ピン2本〜）';
  }

  const desc = document.createElement('div');
  desc.className = 'empty';
  desc.style.textAlign = 'left';
  desc.textContent = '曲がり角度 … どれくらい 大きく ゆれるか' + NL
    + 'しゅうき … 1往復に かかる 時間' + NL
    + 'いち … ゆれ始める ところ（ほかの かみと ずらすと 自然）' + NL
    + 'おくれ … 毛先ほど おくれて しなる 度合い';
  box.appendChild(desc);

  /* ---- めやす（おすと 上の 数字が 入れかわる） ---- */
  /* 上の 3つは 風の つよさ。
     下の 3つは ボーン変形アニメ（psd-bone-anime）と 同じ 数字。
     あちらは「1ループに 何回 ゆれるか」で 持っていたので、
     2秒 ひとまわりに して 秒に なおしてある。 */
  const KAZE = [
    ['そよ風',  { angle: 4,  period: 2.4, delay: 0.30 }],
    ['ふつう',  { angle: 9,  period: 1.6, delay: 0.25 }],
    ['つよい風',{ angle: 17, period: 1.0, delay: 0.20 }],
    ['プルプル',{ angle: 5,  period: 0.5, delay: 0.12 }],
    ['くねくね',{ angle: 14, period: 2.0, delay: 0.30 }],
    ['ゆらゆら',{ angle: 7,  period: 2.0, delay: 0.18 }]
  ];
  const kaze = document.createElement('div');
  kaze.className = 'presets';
  KAZE.forEach(([label, opt]) => {
    const b = button(label, () => {
      edit('めやす（' + label + '）', () => {
        sw.angle = opt.angle; sw.period = opt.period; sw.delay = opt.delay;
      });
      // ずっと ゆらす が オンなら すぐ 効く。オフなら ピンを 打つ
      if(sw.on){ notify(label + ' に しました'); onChange(); }
      else put(label);
    });
    kaze.appendChild(b);
  });
  box.appendChild(heading('めやす'));
  box.appendChild(kaze);

  function put(label){
    const start = S.time;
    const end = S.proj.duration;
    if(end - start < sw.period){
      return notify('のこり時間が みじかいです（' + sw.period.toFixed(1) + '秒 いります）');
    }

    if(boned){
      const keys = swayKeys(l.pins, {
        angle: sw.angle, period: sw.period, phase: sw.phase, delay: sw.delay,
        duration: end - start, start
      });
      if(!keys.length) return notify('ピンを 2本いじょう さしてね');
      edit('かみのゆれ', () => {
        keys.forEach(k => {
          k.pins.forEach((v, i) => {
            const pin = l.pins[i];
            if(pin.type === 'fix') return;
            setPin(l, pinChX(pin.id), k.t, v.dx, 'smooth');
            setPin(l, pinChY(pin.id), k.t, v.dy, 'smooth');
          });
        });
      });
      notify((label || 'ゆれ') + ' を いれました（ピン ' + keys.length + 'コ）');
    } else {
      /* かたむきの ゆれ。行って もどるを くり返す。 */
      const base = valuesAt(l, start).rot;
      const p = sw.period;
      edit('かみのゆれ', () => {
        let t = start, i = 0;
        const off = Math.round(sw.phase * 4) % 4;      // いち（ずらし）
        while(t <= end + 1e-6 && i < 400){
          const ph = (i + off) % 4;
          const v = ph === 1 ? base + sw.angle
                  : ph === 3 ? base - sw.angle
                  : base;
          setPin(l, 'rot', +t.toFixed(3), v, 'smooth');
          t += p / 4;
          i++;
        }
        l.loop = { from: start, to: Math.min(end, start + p), mode: 'loop' };
      });
      notify((label || 'ゆれ') + ' を いれました（' + p.toFixed(1) + '秒で ひとゆれ）');
    }
    onChange();
  }

  box.appendChild(btnRow(
    button('◆ ピンを 打って ゆらす', () => put(null)),
    button('ゆれを けす', () => {
      edit('ゆれをけす', () => {
        if(l.sway) l.sway.on = false;
        if(boned){
          (l.pins || []).forEach(pn => {
            delete (l.tracks || {})[pinChX(pn.id)];
            delete (l.tracks || {})[pinChY(pn.id)];
            pn.dx = 0; pn.dy = 0;
          });
        } else {
          delete (l.tracks || {}).rot;
        }
        l.loop = null;
      });
      notify('ゆれを けしました');
      onChange();
    })
  ));

  const hint2 = document.createElement('div');
  hint2.className = 'empty';
  hint2.style.textAlign = 'left';
  hint2.textContent = SWAY_HINT;
  box.appendChild(hint2);
}

/* ================= かお（まばたき・口パク） =================
   さがしにくかったので、「うごき」から 独立させた。 */
export function buildFaceSheet(box){
  const l = selected();
  if(!l || l.kind === 'folder'){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'レイヤーをえらんでね';
    box.appendChild(e);
    return;
  }
  /* まばたき・口パク は「1つのレイヤーが 絵を2まい以上もっている」のが前提。
     PSDだと 目あき・目とじ が べつのレイヤーになっていることが多いので、
     ここで まとめられるようにしておく。 */
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
      edit('コマにまとめる', () => { r.n = mergeAsFrames(S.proj, l, ids, S.time); });
      S.pick = [];
      notify(r.n ? r.n + 'まいを コマにしました（ぜんぶで ' + l.frames.length + 'コマ）'
                 : 'まとめられませんでした');
      onChange();
    }),
    /* まとめた あと、また 1まいずつに もどす。
       まとめた ときに「もとは どこに 居たか」を おぼえて あるので、
       もとの 場所に そのまま もどる。 */
    button('✂ コマを バラす', () => {
      if((l.frames || []).length < 2) return notify('コマが 1つしか ありません');
      const NL2 = String.fromCharCode(10);
      const n = l.frames.length;
      if(!confirm(n + 'コマを ' + n + 'まいの レイヤーに もどしますか？' + NL2 + NL2
        + '（目パチ・口パクの コマの ピンは 消えます）')) return;
      const r = { made: [] };
      edit('コマを バラす', () => { r.made = splitFrames(S.proj, l, S.time); });
      notify(r.made.length + 'まいを 外に 出しました（もどす で 戻せます）');
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

  /* ---------- 音に合わせた 口パク ---------- */
  box.appendChild(heading('🎤 音に合わせて 口パク'));
  if(!hasAudio()){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'まだ 音が ありません。' + NL
      + '上の「1080×1920／◯秒」を おして、' + NL
      + 'おと → 🎤音を 読みこむ で 声を えらんでね。';
    box.appendChild(e);
  } else {
    l.voice = l.voice || { sense: 0.12, rate: 10 };
    box.appendChild(sub('声が 出ている所だけ 口を動かします。'
      + NL + '大きい声ほど 口を 大きくあけます（コマが3まい以上のとき）。'));
    box.appendChild(slider('ひろいやすさ', () => l.voice.sense, v => l.voice.sense = v,
      0.03, 0.4, 0.01,
      v => v < 0.08 ? 'ちいさい声も' : v > 0.25 ? '大きい声だけ' : 'ふつう'));
    box.appendChild(slider('口のはやさ', () => l.voice.rate, v => l.voice.rate = v, 4, 16, 1,
      v => Math.round(v) + '/秒'));
    box.appendChild(frameSel('とじた口の絵', () => l.talk.closed, v => l.talk.closed = v));
    box.appendChild(btnRow(
      button('🎤 音から 口パクを つくる', () => {
        const r = voiceMouthKeys({
          frames: l.frames.map((_, i) => i),
          closedFrame: l.talk.closed,
          rate: l.voice.rate, sense: l.voice.sense,
          start: 0, end: S.proj.duration
        });
        if(!r.keys.length) return notify('声が 見つかりませんでした（ひろいやすさを 下げてみてね）');
        edit('音から 口パク', () => {
          framePinTimes(l).forEach(t => removePin(l, t, 'frame'));
          r.keys.forEach(k => setPin(l, 'frame', k.t, k.v, 'hold'));
        });
        notify(r.spans.length + 'か所 しゃべります（ピン ' + r.keys.length + 'コ）');
        onChange();
      })
    ));
  }

  box.appendChild(heading('👄 口パク（音なしで つくる）'));
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
/* ================= もじ =================
   「もじ」ボタンから ひらく。ここには 文字のことだけ 置く。
   かたち（大きさ・かたむき）や うごきは せってい に あるので まぜない。

   まだ レイヤーが 無いときは 下書きを いじって、
   「✓ 決定」を おしたときに はじめて レイヤーを作る。
   （おしただけで 勝手に 文字が 出てしまうのを やめた） */
export function buildTextSheet(box, closeFn){
  const NL = String.fromCharCode(10);
  const cur = selected();
  const editing = !!(cur && cur.kind === 'text');
  const l = editing ? cur : null;
  const t = editing ? l.text : (draftText = draftText || newTextStyle());

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.textAlign = 'left';
  head.textContent = editing
    ? '「' + shortName(t.str) + '」を なおしています。'
    : '文字を つくります。「✓ 決定」で 画面に 出ます。';
  box.appendChild(head);

  /* 下書きのときは 見本を出す。作る前でも どんな字か 分かるように */
  let prev = null;
  if(!editing){
    prev = document.createElement('img');
    prev.className = 'textprev';
    prev.alt = '';
    box.appendChild(prev);
  }

  const redraw = async () => {
    if(editing){
      await renderTextLayer(l);
      l.name = shortName(t.str);
      onChange();
    } else if(prev){
      prev.src = textToCanvas(t).toDataURL('image/png');
    }
  };

  const ta = document.createElement('textarea');
  ta.value = t.str;
  ta.rows = 2;
  ta.className = 'textin';
  const readText = () => {
    if(editing){ edit('文字をかえる', () => { t.str = ta.value; }); }
    else t.str = ta.value;
    redraw();
  };
  ta.addEventListener('change', readText);
  ta.addEventListener('input', () => { if(!editing){ t.str = ta.value; redraw(); } });
  box.appendChild(field('もじ', ta));

  const fsel = document.createElement('select');
  FONTS.forEach(f => {
    const o = document.createElement('option');
    o.value = f.key; o.textContent = f.label;
    if(f.key === t.font) o.selected = true;
    fsel.appendChild(o);
  });
  fsel.addEventListener('change', () => {
    if(editing) edit('書体をかえる', () => { t.font = fsel.value; });
    else t.font = fsel.value;
    redraw();
  });
  box.appendChild(field('しょたい', fsel));

  const colorRow = (label, get, set) => colorPick(label, get, (v) => { set(v); redraw(); });
  box.appendChild(colorRow('もじの色', () => t.color,  v => t.color = v));
  box.appendChild(colorRow('ふちの色', () => t.stroke, v => t.stroke = v));

  const num = (label, get, set, min, max, step, fmt) => {
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
    const v = document.createElement('span');
    v.className = 'val';
    const show = () => v.textContent = fmt ? fmt(+i.value) : String(Math.round(+i.value));
    show();
    i.addEventListener('pointerdown', () => { holdSheet(true); if(editing) beginEdit(label); });
    i.addEventListener('input', () => { set(+i.value); show(); if(!editing) redraw(); });
    i.addEventListener('change', () => { holdSheet(false); if(editing) commitEdit(); redraw(); });
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
  asel.addEventListener('change', () => {
    if(editing) edit('よせ方', () => { t.align = asel.value; });
    else t.align = asel.value;
    redraw();
  });
  box.appendChild(field('よせ方', asel));

  redraw();

  box.appendChild(btnRow(
    button(editing ? '✓ できた' : '✓ 決定（画面に 出す）', async () => {
      if(!editing){
        if(!String(t.str || '').trim()) return notify('文字を 入れてね');
        await addTextLayer(null, t);
        draftText = null;
        notify('文字を いれました');
        onChange();
      }
      if(closeFn) closeFn();
    })
  ));

  if(!editing){
    const note = document.createElement('div');
    note.className = 'empty';
    note.style.textAlign = 'left';
    note.textContent = '大きさや かたむき、うごきは' + NL
      + '出したあとに「せってい」で かえられます。';
    box.appendChild(note);
  }
}

/** 「決定」を おすまでの 下書き */
let draftText = null;
export function clearDraftText(){ draftText = null; }


/* ---------- 見た目（塗り・ぼかし・ふちどり） ----------
   ふつうのレイヤーでも フォルダでも 同じものが使える。
   フォルダは 中身を1まいにまとめてから かかるので、
   中に何まい入っていても ふちは 外側にだけ出る。 */
export function buildLook(box, l, opts){
  const pct = v => Math.round(v * 100) + '%';
  box.appendChild(heading('見た目'));

  // 塗り（色と強さ）
  box.appendChild(colorPick('塗りの色',
    () => (l.tint && l.tint.color) || '#F2A0B8',
    v => { l.tint = l.tint || { color:'#F2A0B8', amount:0 }; l.tint.color = v; }));
  box.appendChild(animSlider('塗りの強さ', l, 'tint', 0, 1, 0.01, pct));

  box.appendChild(animSlider('ぼかし', l, 'blur', 0, 40, 0.5,
    v => v < 0.05 ? 'なし' : v.toFixed(1)));

  /* ふちどり。太さは キャンバスの大きさに対して一定なので、
     レイヤーを 大きくしても 細くならない。 */
  box.appendChild(colorPick('ふちの色',
    () => (l.stroke && l.stroke.color) || '#FFFEF7',
    v => { l.stroke = l.stroke || { color:'#FFFEF7', width:0 }; l.stroke.color = v; }));
  box.appendChild(animSlider('ふちどり', l, 'stroke', 0, 40, 0.5,
    v => v < 0.4 ? 'なし' : Math.round(v) + 'px'));

  buildHand(box, l);

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


/* ---------- おやこ（親につける）専用のページ ----------
   したいことが 1つしか無い画面にする。
   ☑ をつけていれば まとめて、つけていなければ いま選んでいる1まいを つける。 */
let openParent = () => {};
export function setParentOpener(fn){ openParent = fn; }

export function buildParentSheet(box, closeFn){
  const NL = String.fromCharCode(10);
  const picked = S.pick
    .map(id => S.proj.layers.find(l => l.id === id))
    .filter(Boolean);
  const cur = selected();
  const kids = picked.length ? picked : (cur ? [cur] : []);

  if(!kids.length){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'まず 子にしたいレイヤーを えらんでね。' + NL
      + '・1まいだけなら レイヤーの名前を おす' + NL
      + '・いくつも まとめてなら ☐ を おして ☑ にする';
    box.appendChild(e);
    return;
  }

  /* だれを 子にするか */
  const who = document.createElement('div');
  who.className = 'empty';
  who.style.textAlign = 'left';
  who.textContent = (picked.length ? '☑ でえらんだ ' + kids.length + 'まい' : 'えらんでいる 1まい')
    + '：' + kids.map(k => k.name).join('、');
  box.appendChild(who);

  const hint = document.createElement('div');
  hint.className = 'empty';
  hint.style.textAlign = 'left';
  hint.textContent = '親を動かすと 子も ついていきます。' + NL
    + '親をパペットピンで曲げても ついていきます。';
  box.appendChild(hint);

  /* だれに つけるか */
  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = ''; none.textContent = '（どこにも つけない）';
  sel.appendChild(none);

  const now = kids[0].parent || '';
  S.proj.layers.forEach(o => {
    if(kids.some(k => k.id === o.id)) return;
    if(kids.some(k => isDescendant(S.proj, o.id, k.id))) return;
    const op = document.createElement('option');
    op.value = o.id;
    op.textContent = (isFolder(o) ? '📁 ' : '') + o.name;
    if(o.id === now && kids.every(k => k.parent === now)) op.selected = true;
    sel.appendChild(op);
  });
  box.appendChild(field('親にする', sel));

  box.appendChild(btnRow(
    button('🔗 くっつける', () => {
      if(!sel.value) return notify('親にする レイヤーを えらんでね');
      const oya = S.proj.layers.find(x => x.id === sel.value);
      const r = { n: 0 };
      edit('おやこに する', () => {
        r.n = attachMany(S.proj, kids.map(k => k.id), oya.id, S.time);
      });
      S.pick = [];
      notify(r.n ? r.n + 'まいを「' + oya.name + '」に つけました'
                 : 'つけられませんでした（親子が わになります）');
      onChange();
      if(closeFn) closeFn();
    }),
    button('はなす', () => {
      const r = { n: 0 };
      edit('おやこを はなす', () => {
        r.n = attachMany(S.proj, kids.map(k => k.id), null, S.time);
      });
      S.pick = [];
      notify(r.n + 'まいを はなしました');
      onChange();
      if(closeFn) closeFn();
    })
  ));

  /* いま ぶら下がっているもの */
  if(cur){
    const mine = S.proj.layers.filter(x => x.parent === cur.id);
    if(mine.length){
      box.appendChild(heading('「' + cur.name + '」についているもの'));
      const list = document.createElement('div');
      list.className = 'empty';
      list.style.textAlign = 'left';
      list.textContent = mine.map(x => '・' + x.name).join(NL);
      box.appendChild(list);
    }
  }
}


/* ---------- どうが ぜんたいの せってい ----------
   1まいごとではなく 作品ぜんたいのこと（長さ・はいけい）を ここにまとめる。 */
let onBgFile = async () => 0;
export function setBgPicker(fn){ onBgFile = fn; }

let onAudioFile = async () => 0;
export function setAudioPicker(fn){ onAudioFile = fn; }

let onBusy = () => {};
export function setBusy(fn){ onBusy = fn; }

let onPlay = () => {};
export function setPlayer(fn){ onPlay = fn; }

let onTrace = () => {};
export function setTracer(fn){ onTrace = fn; }

export function buildDocSheet(box, closeFn){
  const NL = String.fromCharCode(10);

  box.appendChild(heading('さくひんの なまえ'));
  const nameIn = document.createElement('input');
  nameIn.value = S.proj.name || 'むだい';
  nameIn.addEventListener('change', () => {
    edit('なまえをかえる', () => { S.proj.name = nameIn.value.trim() || 'むだい'; });
    onChange();
  });
  box.appendChild(field('なまえ', nameIn));
  const nnote = document.createElement('div');
  nnote.className = 'empty';
  nnote.style.textAlign = 'left';
  nnote.textContent = 'さいしょの画面の ならびに この名前で 出ます。'
    + NL + 'じどうで ほぞんされるので 「ほぞん」ボタンは いりません。';
  box.appendChild(nnote);

  box.appendChild(heading('動画の長さ'));
  box.appendChild(slider('長さ',
    () => S.proj.duration,
    v => { S.proj.duration = v; if(S.time > v) S.time = v; },
    3, 120, 1, v => v < 60 ? Math.round(v) + '秒' : (v / 60).toFixed(1) + '分'));

  /* ---------- おと ---------- */
  box.appendChild(heading('おと'));
  if(!hasAudio()){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = '声や音楽を 読みこむと、' + NL
      + '・さいせい中に いっしょに 鳴る' + NL
      + '・しゃべっている所だけ 口を動かせる' + NL
      + '・書き出す MP4 にも 入る';
    box.appendChild(e);
  } else {
    const info = document.createElement('div');
    info.className = 'empty';
    info.style.textAlign = 'left';
    info.textContent = '「' + AUD.name + '」' + NL
      + '長さ ' + AUD.buf.duration.toFixed(1) + '秒／'
      + 'しゃべっている所 ' + speechSpans().length + 'か所';
    box.appendChild(info);

    S.proj.audio = S.proj.audio || { volume: 1, offset: 0 };
    box.appendChild(slider('おとの大きさ',
      () => S.proj.audio.volume == null ? 1 : S.proj.audio.volume,
      v => S.proj.audio.volume = v, 0, 1.5, 0.05,
      v => Math.round(v * 100) + '%'));
  }

  const apick = document.createElement('input');
  apick.type = 'file';
  apick.accept = 'audio/*';
  apick.hidden = true;
  apick.addEventListener('change', async (e) => {
    await onAudioFile(e.target.files);
    e.target.value = '';
    onChange();
  });
  box.appendChild(apick);

  box.appendChild(btnRow(
    button(hasAudio() ? '🎤 音を えらびなおす' : '🎤 音を 読みこむ', () => apick.click()),
    button('音を けす', () => {
      if(!hasAudio()) return notify('まだ 音は ありません');
      clearAudio();
      S.proj.audio = null;
      notify('音を けしました');
      onChange();
    })
  ));

}

/* ================= はいけい =================
   はいけいのことだけ。動画の長さや 音は 「どうがの せってい」に ある。 */
export function buildBgSheet(box, closeFn){
  const NL = String.fromCharCode(10);
  box.appendChild(heading('はいけい'));
  const bg = S.proj.layers.find(isBg);

  if(!bg){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'はいけいを 足すと、いちばん下に 1まい入ります。' + NL
      + 'ふつうのレイヤーなので、色をかえる・写真にする・' + NL
      + 'ゆっくり動かす も できます。';
    box.appendChild(e);
    box.appendChild(btnRow(
      button('＋ はいけいを 足す', async () => {
        beginEdit('はいけいを足す');
        await addBgLayer('#BFE3F5');
        commitEdit();
        notify('はいけいを 足しました');
        onChange();
      }),
      button('🎨 もようで 足す', async () => {
        try{
          onBusy(true, 'もようを つくっています…');
          beginEdit('もようの はいけい');
          await addPatternBg({ kind:'ドット' });
          commitEdit();
          notify('もようの はいけいを 足しました');
          onChange();
        }catch(err){
          notify('つくれませんでした（' + (err && err.message || '') + '）');
        }finally{
          onBusy(false);
        }
      })
    ));
    return;
  }

  box.appendChild(colorPick('はいけいの色',
    () => bg.bgColor || '#BFE3F5',
    (v) => { paintBg(bg, v); }));

  const swatch = document.createElement('div');
  swatch.className = 'rowbtns';
  swatch.style.flexWrap = 'wrap';
  [['そら','#BFE3F5'], ['ゆうやけ','#FFCBA4'], ['よる','#2E3358'],
   ['くさ','#BFE8B0'], ['しろ','#FFFEF7'], ['ピンク','#F7D3E0']].forEach(([n, c]) => {
    const b = button(n, async () => {
      beginEdit('はいけいの色');
      await paintBg(bg, c);
      commitEdit();
      onChange();
    });
    b.style.cssText = 'flex:0 0 30%;border-left:14px solid ' + c;
    swatch.appendChild(b);
  });
  box.appendChild(field('よくつかう色', swatch));

  const pick = document.createElement('input');
  pick.type = 'file';
  pick.hidden = true;
  pick.addEventListener('change', async (e) => {
    await onBgFile(e.target.files, bg);
    e.target.value = '';
    onChange();
  });
  box.appendChild(pick);

  box.appendChild(btnRow(
    button('🖼 写真を はいけいにする', () => pick.click()),
    button('キャンバスに 合わせる', () => {
      edit('はいけいを 合わせる', () => fitToCanvas(bg));
      onChange();
    })
  ));

  /* ---------- もよう ---------- */
  box.appendChild(heading('もよう'));
  const pt = bg.bgPattern || {
    kind: 'ドット', back: bg.bgColor || '#FFFEF7', front: '#F2A0B8',
    size: Math.round(S.proj.w / 10), angle: 0, move: 'とめる', speed: 90
  };
  const apply = async (label) => {
    try{
      onBusy(true, 'もようを つくっています…');
      beginEdit(label);
      await paintPattern(bg, pt);
      commitEdit();
      onChange();
      notify(pt.kind + (pt.move !== 'とめる' ? '（' + pt.move + '）' : '') + ' に しました');
    }catch(err){
      notify('もようを つくれませんでした（' + (err && err.message || '') + '）');
    }finally{
      onBusy(false);
    }
  };

  const kinds = document.createElement('div');
  kinds.className = 'rowbtns';
  kinds.style.flexWrap = 'wrap';
  PATTERN_NAMES.forEach(name => {
    const b = button(name, () => { pt.kind = name; apply('もようを かえる'); });
    b.style.flex = '0 0 30%';
    b.classList.toggle('on', pt.kind === name);
    kinds.appendChild(b);
  });
  box.appendChild(field('がら', kinds));

  /* 色は カラーサークルで えらぶ。動かしている間は 貼り直さず、
     指を はなしたときに 1回だけ 作る（そうしないと 重い） */
  const colorRow = (label, key, def) => colorPick(label,
    () => pt[key] || def,
    (v) => { pt[key] = v; });
  box.appendChild(colorRow('じの色', 'back', '#FFFEF7'));
  box.appendChild(colorRow('がらの色', 'front', '#F2A0B8'));
  box.appendChild(btnRow(
    button('🎨 この色で ぬりなおす', () => apply('もようの色'))
  ));

  box.appendChild(slider('がらの大きさ', () => pt.size, v => pt.size = v,
    20, Math.round(S.proj.w / 3), 2, v => Math.round(v) + 'px'));
  /* ---- ながれる むき ---- */
  const flowRow = document.createElement('div');
  flowRow.className = 'rowbtns';
  [['とめる', false], ['ながす', true]].forEach(([lb, on]) => {
    const b = button(lb, () => {
      pt.move = on ? 'ながす' : 'とめる';
      apply(on ? 'もようを ながす' : 'もようを とめる').then(() => { if(on) onPlay(true); });
    });
    b.style.flex = '1';
    b.classList.toggle('on', (pt.move === 'ながす') === on);
    flowRow.appendChild(b);
  });
  box.appendChild(field('うごき', flowRow));

  if(pt.move === 'ながす'){
    /* むきは 角度で。もようは マスで くり返しているので、
       いちばん近い マスの ならびに 合わせる（そうしないと つながらない）。 */
    const dirs = document.createElement('div');
    dirs.className = 'rowbtns';
    dirs.style.flexWrap = 'wrap';
    DIR_PRESETS.forEach(([lb, deg]) => {
      const b = button(lb, () => {
        pt.dir = deg;
        apply('むきを かえる').then(() => onPlay(true));
      });
      b.style.flex = '0 0 22%';
      b.style.fontSize = '1.1rem';
      b.classList.toggle('on', Math.round(pt.dir || 0) === deg);
      dirs.appendChild(b);
    });
    box.appendChild(field('むき', dirs));

    box.appendChild(slider('むき（こまかく）', () => pt.dir || 0, v => pt.dir = v,
      0, 355, 5, v => Math.round(v) + '°'));
    box.appendChild(btnRow(
      button('➤ この むきで ながす', () => apply('むきを かえる').then(() => onPlay(true)))
    ));

    box.appendChild(slider('はやさ', () => pt.speed, v => pt.speed = v,
      10, 400, 5, v => v < 60 ? 'ゆっくり' : v > 200 ? 'はやい' : 'ふつう'));

    if(pt.realDir != null && Math.abs(((pt.realDir - (pt.dir || 0)) % 360)) > 3){
      const rd = document.createElement('div');
      rd.className = 'empty';
      rd.style.textAlign = 'left';
      rd.textContent = 'もようの ますめに 合わせて ' + pt.realDir + '° で ながしています。'
        + NL + '（ぴったりの 向きでないと 柄が つながらないため）';
      box.appendChild(rd);
    }
  }

  if(bg.loop){
    const lp = document.createElement('div');
    lp.className = 'empty';
    lp.style.textAlign = 'left';
    lp.textContent = '▶ をおすと 流れます（ひとまわり '
      + bg.loop.to.toFixed(1) + '秒）。'
      + NL + 'とまって見えるときは はやさを あげてね。';
    box.appendChild(lp);
  }

  box.appendChild(btnRow(
    button('🎨 このもように する', () => apply('もようを はる'))
  ));

  const pnote = document.createElement('div');
  pnote.className = 'empty';
  pnote.style.textAlign = 'left';
  pnote.textContent = 'いろ・大きさ・かたむきを かえると すぐ はりなおします。'
    + NL + 'うごくもようは、つなぎ目が 見えないように'
    + NL + 'ちょうど ひとマスぶん ずらして くり返します。';
  box.appendChild(pnote);

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'はいけいも ふつうのレイヤーです。' + NL
    + 'タイムラインで えらべば、ぼかしたり ゆっくり動かしたり できます。';
  box.appendChild(note);
}


/* ---------- 使いまわす部品 ---------- */
/** たてよこを そろえるか、べつべつに するか。
    フォルダでも 同じように つかえる（中身ごと たてに つぶす など）。 */
export function aspectRow(l){
  const b = document.createElement('button');
  const on = () => l.lockAspect !== false;
  const show = () => { b.textContent = on() ? '🔗 そろえる' : '🔓 べつべつ'; };
  show();
  b.style.flex = '1';
  b.addEventListener('click', () => {
    edit('たてよこの そろえ方', () => {
      l.lockAspect = !on();
      if(l.lockAspect) l.scaleY = l.scaleX;   // そろえた瞬間に よこ幅へ合わせる
    });
    show();
    onChange();
  });
  return field('たてよこ', b);
}

/** どのレイヤーの形で ぬくか えらぶ */
export function clipRow(l){
  const i = S.proj.layers.indexOf(l);
  const below = S.proj.layers[i + 1] || null;

  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = ''; none.textContent = '（ぬかない）';
  sel.appendChild(none);

  if(below){
    const o = document.createElement('option');
    o.value = 'below';
    o.textContent = 'すぐ下の「' + below.name + '」';
    if(l.clip && !l.clipTo) o.selected = true;
    sel.appendChild(o);
  }

  S.proj.layers.forEach(o2 => {
    if(o2.id === l.id) return;
    if(isFolder(o2)) return;                 // フォルダには 形が ない
    const op = document.createElement('option');
    op.value = o2.id;
    op.textContent = o2.name + 'の かたち';
    if(l.clip && l.clipTo === o2.id) op.selected = true;
    sel.appendChild(op);
  });

  sel.addEventListener('change', () => {
    const v = sel.value;
    edit('クリップ', () => {
      if(!v){ l.clip = false; l.clipTo = null; }
      else if(v === 'below'){ l.clip = true; l.clipTo = null; }
      else { l.clip = true; l.clipTo = v; }
    });
    const t = !v ? 'ぬくのを やめました'
      : v === 'below' ? '下の「' + below.name + '」の形で ぬきます'
      : '「' + (S.proj.layers.find(x => x.id === v) || {}).name + '」の形で ぬきます';
    notify(t);
    onChange();
  });

  const row = field('かたちで ぬく', sel);
  return row;
}

export function parentLink(box, l, closeFn){
  box.appendChild(heading('おやこ'));
  const pnote = document.createElement('div');
  pnote.className = 'empty';
  pnote.style.textAlign = 'left';
  const oyaNow0 = l.parent ? S.proj.layers.find(x => x.id === l.parent) : null;
  pnote.textContent = oyaNow0
    ? 'いま「' + oyaNow0.name + '」に ついています。'
    : 'いまは どこにも ついていません。';
  box.appendChild(pnote);
  box.appendChild(btnRow(
    button('🔗 おやこを きめる', () => { if(closeFn) closeFn(); openParent(); })
  ));
}

export function otherRow(box, l, closeFn){
  box.appendChild(heading('そのほか'));

  /* コピーは ☑ を つけていれば まとめて、なければ この1まい。
     絵そのものは 使いまわすので、ふやしても 重くならない。 */
  const ids = () => (S.pick.length ? [...S.pick] : [l.id]);

  /* ふくせい … 同じ場所・もとの すぐ上に もう1まい。
     目や 手のように 左右で 同じものを つくるとき に べんり。 */
  box.appendChild(btnRow(
    button('👯 ふくせい', () => {
      const made = { v: [] };
      edit('ふくせい', () => { made.v = duplicateLayers(S.proj, ids()); });
      if(made.v[0]) S.sel = made.v[0].id;
      S.pick = [];
      notify(made.v.length + 'まい ふくせいしました');
      onChange();
    }),
    button('🧊 合体して1まいに', async () => {
      const list = ids().map(id => S.proj.layers.find(x => x.id === id)).filter(Boolean);
      const nl = String.fromCharCode(10);
      if(list.length < 2) return notify('☑ で 2まい いじょう えらんでね');
      if(!confirm(list.length + 'まいを 1まいの 絵に しますか？' + nl + nl
        + list.map(x => x.name).join('、') + nl + nl
        + '（いまの 見た目で 焼きます。中の うごきや ピンは なくなります。'
        + nl + 'まちがえたら「もどす」で 戻せます）')) return;
      let made;
      try{
        made = await bakeLayers(ids(), list[0].name + ' 合体');
      }catch(err){
        return notify(err.message || '合体できませんでした');
      }
      const r = {};
      edit('合体', () => { r.l = applyBake(ids(), made); });
      S.sel = r.l ? r.l.id : null;
      S.pick = [];
      notify(list.length + 'まいを 1まいに しました');
      onChange();
      if(closeFn) closeFn();
    })
  ));

  box.appendChild(btnRow(
    button('⧉ コピー', () => {
      S.layerClip = copyLayers(S.proj, ids());
      notify(S.layerClip.length + 'まい コピーしました');
      onChange();
    }),
    button('📋 はりつけ', () => {
      if(!S.layerClip || !S.layerClip.length) return notify('さきに コピーしてね');
      const made = { v: [] };
      edit('はりつけ', () => { made.v = pasteLayers(S.proj, S.layerClip); });
      if(made.v[0]) S.sel = made.v[0].id;
      S.pick = [];
      notify(made.v.length + 'まい はりつけました');
      onChange();
      if(closeFn) closeFn();
    })
  ));

  box.appendChild(btnRow(
    button('まんなかへ', () => {
      edit('まんなかへ', () => { l.x = S.proj.w / 2; l.y = S.proj.h / 2; });
      onChange();
    }),
    button('🗑 けす', () => {
      const list = ids().map(id => S.proj.layers.find(x => x.id === id)).filter(Boolean);
      const nl = String.fromCharCode(10);
      if(!confirm(list.length + 'まい けしますか？' + nl + nl + list.map(x => x.name).join('、'))) return;
      const r = { n: 0 };
      edit('レイヤーをけす', () => { r.n = removeLayers(S.proj, ids()); });
      S.pick = [];
      if(S.sel && !S.proj.layers.some(x => x.id === S.sel)) S.sel = null;
      notify(r.n + 'まい けしました（もどす で 戻せます）');
      onChange();
      if(closeFn) closeFn();
    })
  ));
}


/* ================= 書き出す =================
   MP4 … 音つき。SNSに あげる ふつうの 動画。
   すける GIF … はいけいが すけたまま。動画の上に かさねる 素材に なる。 */
export function buildExportSheet(box, closeFn, run){
  const NL = String.fromCharCode(10);
  const g = S.proj.gif = S.proj.gif || { fps: 12, maxSide: 480, seconds: Math.min(6, S.proj.duration) };

  box.appendChild(heading('▶ 動画（MP4）'));
  const m = document.createElement('div');
  m.className = 'empty';
  m.style.textAlign = 'left';
  m.textContent = S.proj.w + '×' + S.proj.h + '／' + S.proj.duration + '秒。' + NL
    + '音も いっしょに 入ります。SNSに あげるなら こっち。';
  box.appendChild(m);
  box.appendChild(btnRow(
    button('▶ MP4で 書き出す', () => { if(closeFn) closeFn(); run('mp4'); })
  ));

  box.appendChild(heading('🫧 すける GIF'));
  const t = document.createElement('div');
  t.className = 'empty';
  t.style.textAlign = 'left';
  t.textContent = 'はいけいを ぬらずに 出すので、うしろが すけます。' + NL
    + '動画の上に かさねる 素材や、うごくスタンプに つかえます。' + NL
    + '（GIFは 色が 256いろまで。音は 入りません）';
  box.appendChild(t);

  box.appendChild(slider('大きさ', () => g.maxSide, v => g.maxSide = v,
    160, 720, 20, v => Math.round(v) + 'px'));
  box.appendChild(slider('なめらかさ', () => g.fps, v => g.fps = v,
    6, 24, 1, v => Math.round(v) + 'コマ/秒'));
  box.appendChild(slider('長さ', () => g.seconds,
    v => g.seconds = v, 0.5, Math.max(1, S.proj.duration), 0.5,
    v => v.toFixed(1) + '秒'));

  const size = document.createElement('div');
  size.className = 'empty';
  size.style.textAlign = 'left';
  const guess = () => {
    const k = Math.min(1, g.maxSide / Math.max(S.proj.w, S.proj.h));
    const w = Math.round(S.proj.w * k), h = Math.round(S.proj.h * k);
    const n = Math.round(g.seconds * g.fps);
    // だいたいの めやす（1ドットあたり 0.35バイトくらい）
    const mb = (w * h * n * 0.35) / 1048576;
    size.textContent = w + '×' + h + '／' + n + 'コマ・だいたい ' + mb.toFixed(1) + 'MB';
  };
  guess();
  box.appendChild(size);

  box.appendChild(btnRow(
    button('🫧 すけるGIFで 書き出す', () => { if(closeFn) closeFn(); run('gif'); }),
    button('めやすを 見なおす', () => { guess(); })
  ));

  const w = document.createElement('div');
  w.className = 'empty';
  w.style.textAlign = 'left';
  w.textContent = '大きく・長く・なめらかに するほど 重くなります。' + NL
    + 'スマホなら 480px・12コマ・6秒 くらいが めやす。';
  box.appendChild(w);
}


/* ================= つなぎ方（イージング） =================
   ピンと ピンの あいだの 進み方。
   えらぶと すぐ 効く。形も 小さい絵で 見せる。 */
export function buildEaseSheet(box, closeFn, now, onPick, shape){
  const NL = String.fromCharCode(10);

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.textAlign = 'left';
  head.textContent = 'えらんだ ピンから つぎの ピンまでの 進み方。'
    + NL + '「ゆっくり止まる」に すると、止まる ときが やわらかくなります。';
  box.appendChild(head);

  /** 進み方の 形を 小さい絵に する */
  const shapeCanvas = (fn, w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w || 56; cv.height = h || 40;
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFEF7';
    g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(30,28,20,.25)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    g.strokeStyle = '#1E1C14';
    g.lineWidth = 2.5;
    g.beginPath();
    const pad = 4, WW = cv.width - pad * 2, HH = cv.height - pad * 2;
    for(let i = 0; i <= 40; i++){
      const u = i / 40;
      const f = fn(u);
      const x = pad + u * WW;
      const y = cv.height - pad - Math.max(-0.25, Math.min(1.25, f)) * HH;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    return cv;
  };

  EASE_LIST.forEach(([key, label, note]) => {
    const row = document.createElement('button');
    row.className = 'easeitem' + (now === key ? ' on' : '');
    row.appendChild(shapeCanvas(
      (u) => key === 'hold' ? 0 : (EASES[key] || EASES.smooth)(u)));

    const txt = document.createElement('span');
    txt.className = 'easetext';
    const b = document.createElement('b');
    b.textContent = label;
    const i2 = document.createElement('i');
    i2.textContent = note;
    txt.appendChild(b); txt.appendChild(i2);
    row.appendChild(txt);

    row.addEventListener('click', () => {
      onPick(key);
      notify(label + ' に しました');
      if(closeFn) closeFn();
    });
    box.appendChild(row);
  });

  /* ---------- ハンドルで つくる（ベジェ） ----------
     まる を つまんで 引っぱると 形が 変わる。
     アプリの つなぎ方 設定で よく 見る やつ。

     4つの 数（x1,y1,x2,y2）で 形が きまる。
     手で なぞるより きれいな 形に なるし、
     あとで 少しだけ 直す のも かんたん。

     エンジンには「33こに 分けた 高さ」で わたすので、
     なぞって かいた ものと まったく 同じ あつかいに なる。 */
  {
    box.appendChild(heading('🔵 ハンドルで つくる'));
    const bn = document.createElement('div');
    bn.className = 'empty';
    bn.style.textAlign = 'left';
    bn.textContent = '青い まるを つまんで 引っぱると 形が 変わります。'
      + NL + '左の まるを 右へ … はじめが ゆっくり'
      + NL + '右の まるを 左へ … おわりが ゆっくり';
    box.appendChild(bn);

    const BW = 260, BH = 220, BP = 26;
    const bc = document.createElement('canvas');
    bc.width = BW; bc.height = BH;
    bc.className = 'drawease';
    box.appendChild(bc);
    const bg = bc.getContext('2d');

    // はじめは「ゆっくり出て ゆっくり止まる」
    let P = [0.42, 0, 0.58, 1];
    const bx = (u) => BP + (BW - BP * 2) * u;
    const by = (v) => BH - BP - (BH - BP * 2) * v;
    const ux = (x) => (x - BP) / (BW - BP * 2);
    const uy = (y) => (BH - BP - y) / (BH - BP * 2);

    /** ベジェの 高さ（0〜1）。よこ が u に なる ところを さがす */
    const bezAt = (u) => {
      const cx = (t) => 3*(1-t)*(1-t)*t*P[0] + 3*(1-t)*t*t*P[2] + t*t*t;
      const cy = (t) => 3*(1-t)*(1-t)*t*P[1] + 3*(1-t)*t*t*P[3] + t*t*t;
      let lo = 0, hi = 1;
      for(let i = 0; i < 24; i++){
        const m = (lo + hi) / 2;
        if(cx(m) < u) lo = m; else hi = m;
      }
      return cy((lo + hi) / 2);
    };

    function bezRender(){
      bg.fillStyle = '#FFFEF7';
      bg.fillRect(0, 0, BW, BH);
      // ます目
      bg.strokeStyle = 'rgba(30,28,20,.12)';
      bg.lineWidth = 1;
      for(let i = 0; i <= 4; i++){
        bg.beginPath(); bg.moveTo(bx(i/4), by(0)); bg.lineTo(bx(i/4), by(1)); bg.stroke();
        bg.beginPath(); bg.moveTo(bx(0), by(i/4)); bg.lineTo(bx(1), by(i/4)); bg.stroke();
      }
      // まっすぐの めやす
      bg.strokeStyle = 'rgba(30,28,20,.22)';
      bg.setLineDash([5, 5]);
      bg.beginPath(); bg.moveTo(bx(0), by(0)); bg.lineTo(bx(1), by(1)); bg.stroke();
      bg.setLineDash([]);
      // ハンドルの ぼう
      bg.strokeStyle = 'rgba(30,28,20,.45)';
      bg.lineWidth = 2;
      bg.beginPath(); bg.moveTo(bx(0), by(0)); bg.lineTo(bx(P[0]), by(P[1])); bg.stroke();
      bg.beginPath(); bg.moveTo(bx(1), by(1)); bg.lineTo(bx(P[2]), by(P[3])); bg.stroke();
      // カーブ
      bg.strokeStyle = '#F2A0B8';
      bg.lineWidth = 4;
      bg.beginPath();
      for(let i = 0; i <= 60; i++){
        const u = i / 60, x = bx(u), y = by(bezAt(u));
        i ? bg.lineTo(x, y) : bg.moveTo(x, y);
      }
      bg.stroke();
      bg.strokeStyle = '#1E1C14'; bg.lineWidth = 1.5; bg.stroke();
      // はしの まる
      [[0,0],[1,1]].forEach(([u,v]) => {
        bg.beginPath(); bg.arc(bx(u), by(v), 6, 0, 7);
        bg.fillStyle = '#FFFEF7'; bg.fill();
        bg.lineWidth = 2.5; bg.strokeStyle = '#1E1C14'; bg.stroke();
      });
      // つまむ まる
      [[P[0],P[1]],[P[2],P[3]]].forEach(([u,v]) => {
        bg.beginPath(); bg.arc(bx(u), by(v), 11, 0, 7);
        bg.fillStyle = '#5B8DEF'; bg.fill();
        bg.lineWidth = 2.5; bg.strokeStyle = '#1E1C14'; bg.stroke();
      });
      bg.strokeStyle = '#1E1C14'; bg.lineWidth = 2.5;
      bg.strokeRect(1.5, 1.5, BW - 3, BH - 3);
    }
    bezRender();

    let grab = -1;
    const bat = (e) => {
      const r = bc.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (BW / r.width),
               y: (e.clientY - r.top) * (BH / r.height) };
    };
    bc.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try{ bc.setPointerCapture(e.pointerId); }catch(_){}
      const p = bat(e);
      const d0 = Math.hypot(p.x - bx(P[0]), p.y - by(P[1]));
      const d1 = Math.hypot(p.x - bx(P[2]), p.y - by(P[3]));
      grab = (d0 <= d1 ? 0 : 1);
      bmove(e);
    });
    const bmove = (e) => {
      if(grab < 0) return;
      const p = bat(e);
      // よこ は わくの 中だけ。たて は 少し はみ出して よい（はねる 形）
      const u = Math.max(0, Math.min(1, ux(p.x)));
      const v = Math.max(-0.5, Math.min(1.5, uy(p.y)));
      if(grab === 0){ P[0] = u; P[1] = v; } else { P[2] = u; P[3] = v; }
      bezRender();
    };
    bc.addEventListener('pointermove', (e) => { if(grab >= 0) bmove(e); });
    const bend = () => { grab = -1; };
    bc.addEventListener('pointerup', bend);
    bc.addEventListener('pointercancel', bend);

    // よく つかう 形
    const BEZ = [
      ['ゆっくり出る',   [0.42, 0, 1, 1]],
      ['ゆっくり止まる', [0, 0, 0.58, 1]],
      ['りょうほう',     [0.42, 0, 0.58, 1]],
      ['ぐいっと',       [0.68, -0.55, 0.27, 1.55]],
      ['するどく',       [0.9, 0, 0.1, 1]]
    ];
    const bp = document.createElement('div');
    bp.className = 'presets';
    BEZ.forEach(([label, v]) => {
      bp.appendChild(button(label, () => { P = v.slice(); bezRender(); }));
    });
    box.appendChild(bp);

    box.appendChild(btnRow(
      button('✓ この かたちで うごかす', () => {
        const arr = [];
        for(let i = 0; i < 33; i++) arr.push(Math.round(bezAt(i / 32) * 1000) / 1000);
        onPick('custom', arr);
        S.proj.eases = S.proj.eases || [];
        S.proj.eases.unshift(arr.slice());
        S.proj.eases = S.proj.eases.slice(0, MY_EASE_MAX);
        notify('この かたちで 動きます');
        if(closeFn) closeFn();
      })
    ));
  }

  /* ---------- 自分で かく ---------- */
  box.appendChild(heading('✏ じぶんで かく'));

  const note2 = document.createElement('div');
  note2.className = 'empty';
  note2.style.textAlign = 'left';
  note2.textContent = 'わくの中を 左から 右へ なぞると、その形の とおりに 動きます。'
    + NL + 'よこ ＝ 時間、たて ＝ どれだけ 進んだか。'
    + NL + 'まっすぐ 右上がりなら 同じ はやさ、'
    + NL + 'とちゅうで 平らに すれば そこで 止まります。';
  box.appendChild(note2);

  const N = 33;                       // 何こに 分けて おぼえるか
  const W = 260, H = 190, PAD = 10;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'drawease';
  box.appendChild(cv);
  const g = cv.getContext('2d');

  let pts = (shape && shape.length === N) ? shape.slice() : null;

  const toY = (v) => H - PAD - Math.max(-0.3, Math.min(1.3, v)) * (H - PAD * 2);
  const toV = (y) => (H - PAD - y) / (H - PAD * 2);

  function render(){
    g.fillStyle = '#FFFEF7';
    g.fillRect(0, 0, W, H);

    g.strokeStyle = 'rgba(30,28,20,.12)';
    g.lineWidth = 1;
    for(let i = 0; i <= 4; i++){
      const x = PAD + (W - PAD * 2) * i / 4;
      const y = PAD + (H - PAD * 2) * i / 4;
      g.beginPath(); g.moveTo(x, PAD); g.lineTo(x, H - PAD); g.stroke();
      g.beginPath(); g.moveTo(PAD, y); g.lineTo(W - PAD, y); g.stroke();
    }
    g.strokeStyle = 'rgba(30,28,20,.22)';
    g.setLineDash([5, 5]);
    g.beginPath(); g.moveTo(PAD, H - PAD); g.lineTo(W - PAD, PAD); g.stroke();
    g.setLineDash([]);

    g.strokeStyle = '#1E1C14';
    g.lineWidth = 2.5;
    g.strokeRect(1.5, 1.5, W - 3, H - 3);

    if(pts){
      g.strokeStyle = '#F2A0B8';
      g.lineWidth = 4;
      g.beginPath();
      for(let i = 0; i < N; i++){
        const x = PAD + (W - PAD * 2) * (i / (N - 1));
        const y = toY(pts[i]);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.strokeStyle = '#1E1C14';
      g.lineWidth = 1.5;
      g.stroke();
    } else {
      g.fillStyle = 'rgba(30,28,20,.45)';
      g.font = '600 13px "M PLUS Rounded 1c", sans-serif';
      g.textAlign = 'center';
      g.fillText('ここを 左から 右へ なぞる', W / 2, H / 2);
    }
  }
  render();

  let drawing = false, raw = null;
  const at = (e) => {
    const b = cv.getBoundingClientRect();
    return { x: (e.clientX - b.left) * (W / b.width),
             y: (e.clientY - b.top) * (H / b.height) };
  };
  const put = (p) => {
    const u = (p.x - PAD) / (W - PAD * 2);
    const i = Math.round(Math.max(0, Math.min(1, u)) * (N - 1));
    raw[i] = toV(p.y);
    let last = -1;
    for(let k = 0; k < N; k++){
      if(raw[k] == null) continue;
      if(last >= 0 && k - last > 1){
        for(let m = last + 1; m < k; m++){
          raw[m] = raw[last] + (raw[k] - raw[last]) * ((m - last) / (k - last));
        }
      }
      last = k;
    }
  };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try{ cv.setPointerCapture(e.pointerId); }catch(_){}
    drawing = true;
    raw = new Array(N).fill(null);
    put(at(e));
  });
  cv.addEventListener('pointermove', (e) => {
    if(!drawing) return;
    put(at(e));
    const tmp = raw.slice();
    for(let i = 0; i < N; i++) if(tmp[i] == null) tmp[i] = i === 0 ? 0 : tmp[i - 1];
    pts = tmp;
    render();
  });
  const endDraw = () => {
    if(!drawing) return;
    drawing = false;
    const out = raw.slice();
    const first = out.findIndex(v => v != null);
    if(first < 0){ pts = null; render(); return; }
    for(let i = 0; i < first; i++) out[i] = out[first];
    let lastI = N - 1;
    while(out[lastI] == null) lastI--;
    for(let i = lastI + 1; i < N; i++) out[i] = out[lastI];
    for(let i = 0; i < N; i++) if(out[i] == null) out[i] = out[i - 1];

    /* 指の あとは こまかく ふるえている。
       そのままだと、進み方が 一歩ごとに 速く／おそく なって
       うごきが ガタガタして 見える。

       りょうどなりと 3つで ならす（まん中を 重めに）。
       これを 何回か くり返すと、かいた 形は のこったまま
       ふるえだけが 消える。はしの 2つは 動かさない
       （はじまりと おわりの 高さは かいた とおりに する）。 */
    const smooth = (arr, times) => {
      let a = arr.slice();
      for(let k = 0; k < times; k++){
        const b = a.slice();
        for(let i = 1; i < N - 1; i++) b[i] = (a[i - 1] + a[i] * 2 + a[i + 1]) / 4;
        a = b;
      }
      return a;
    };
    pts = smooth(out, 4).map(v => Math.round(v * 1000) / 1000);
    render();
  };
  cv.addEventListener('pointerup', endDraw);
  cv.addEventListener('pointercancel', endDraw);

  box.appendChild(btnRow(
    button('✓ この かたちで うごかす', () => {
      if(!pts) return notify('わくの中を なぞってね');
      onPick('custom', pts);
      S.proj.eases = S.proj.eases || [];
      S.proj.eases.unshift(pts.slice());
      S.proj.eases = S.proj.eases.slice(0, MY_EASE_MAX);
      notify('かいた かたちで 動きます');
      if(closeFn) closeFn();
    }),
    button('かきなおす', () => { pts = null; render(); })
  ));

  if(S.proj.eases && S.proj.eases.length){
    box.appendChild(heading('まえに かいた かたち'));
    const row = document.createElement('div');
    row.className = 'rowbtns';
    row.style.flexWrap = 'wrap';
    S.proj.eases.forEach((e2) => {
      const b = document.createElement('button');
      b.className = 'myease';
      b.appendChild(shapeCanvas((u) => curveAt(e2, u), 48, 34));
      b.addEventListener('click', () => {
        onPick('custom', e2);
        notify('この かたちで 動きます');
        if(closeFn) closeFn();
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  }
}


/* ================= なぞった みちで うごかす =================
   道のりで 等分に ピンを 打つので、まがり角でも 形が くずれない。
   何秒で 通るか と、進み方（つなぎ方）を きめる。 */
export function buildPathSheet(box, closeFn, pts, apply){
  const NL = String.fromCharCode(10);
  const l = selected();
  if(!l || !pts || pts.length < 2){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'みちが ありません';
    box.appendChild(e);
    return;
  }

  S.proj.path = S.proj.path || { dur: 2, ease: 'linear', count: 24 };
  const P = S.proj.path;

  const len = Math.round(pathLength(pts));
  const info = document.createElement('div');
  info.className = 'empty';
  info.style.textAlign = 'left';
  const showInfo = () => {
    info.textContent = '「' + l.name + '」が この みちを 通ります。' + NL
      + 'みちの 長さ ' + len + 'ドット／' + P.dur.toFixed(1) + '秒'
      + '（1秒に ' + Math.round(len / Math.max(0.1, P.dur)) + 'ドット）';
  };
  showInfo();
  box.appendChild(info);

  /* みちの 見本 */
  const cv = document.createElement('canvas');
  cv.width = 260; cv.height = 150;
  cv.className = 'pathprev';
  box.appendChild(cv);
  (function(){
    const g = cv.getContext('2d');
    g.fillStyle = '#FFFEF7'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#1E1C14'; g.lineWidth = 2.5;
    g.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    });
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const k = Math.min((cv.width - 26) / w, (cv.height - 26) / h);
    const ox = (cv.width - w * k) / 2 - x0 * k;
    const oy = (cv.height - h * k) / 2 - y0 * k;
    g.beginPath();
    pts.forEach((p, i) => {
      const x = p.x * k + ox, y = p.y * k + oy;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 5; g.strokeStyle = '#F2A0B8'; g.stroke();
    // 打つ ところ
    const road = resample(pts, Math.max(2, Math.min(120, P.count)));
    road.forEach((p) => {
      g.beginPath(); g.arc(p.x * k + ox, p.y * k + oy, 3, 0, 7);
      g.fillStyle = '#1E1C14'; g.fill();
    });
  })();

  box.appendChild(slider('何秒で 通る', () => P.dur, v => { P.dur = v; showInfo(); },
    0.2, 20, 0.1, v => v.toFixed(1) + '秒'));
  box.appendChild(slider('ピンの こまかさ', () => P.count, v => P.count = v,
    4, 80, 2, v => Math.round(v) + 'コ'));

  const es = document.createElement('div');
  es.className = 'rowbtns';
  es.style.flexWrap = 'wrap';
  [['まっすぐ', 'linear'], ['なめらか', 'smooth'],
   ['ゆっくり出る', 'in'], ['ゆっくり止まる', 'out']].forEach(([lb, key]) => {
    const b = button(lb, () => { P.ease = key; onChange(); });
    b.style.flex = '0 0 45%';
    b.classList.toggle('on', P.ease === key);
    es.appendChild(b);
  });
  box.appendChild(field('進み方', es));

  box.appendChild(btnRow(
    button('◆ この みちで うごかす', () => {
      apply(P);
      if(closeFn) closeFn();
    }),
    button('やめる', () => { if(closeFn) closeFn(); })
  ));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'いまの時間から はじまります。' + NL
    + '道のりで 等分に ピンを 打つので、まがり角でも 形が くずれません。';
  box.appendChild(note);
}


/* ================= できあがり =================
   書き出しが 終わったら、ここから ほぞんする。
   「きょうゆう」は 人が おした その場でしか ひらけないので、
   自動では よばずに ボタンに している。 */
export function buildDoneSheet(box, closeFn, info, save){
  const NL = String.fromCharCode(10);

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.textAlign = 'left';
  head.textContent = 'できました！' + NL
    + info.name + '（' + info.mb + 'MB）';
  box.appendChild(head);

  if(info.canShare){
    box.appendChild(btnRow(
      button('📤 きょうゆう（カメラロールに ほぞん）', async () => {
        try{
          const r = await save('share');
          notify(r === 'cancel' ? 'やめました' : 'ほぞんしました');
          if(r !== 'cancel' && closeFn) closeFn();
        }catch(err){
          notify(err.message || 'ほぞんできませんでした');
        }
      })
    ));
    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = '出てきた 中から「ほぞん」や「フォトに ついか」を えらぶと'
      + NL + 'カメラロールに 入ります。';
    box.appendChild(t);
  } else {
    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = 'この 端末では「きょうゆう」が つかえません。' + NL
      + 'ダウンロードすると「ダウンロード」の中に 入ります。';
    box.appendChild(t);
  }

  box.appendChild(btnRow(
    button('⬇ ダウンロード', async () => {
      await save('download');
      notify('ダウンロードしました');
      if(closeFn) closeFn();
    }),
    button('とじる', () => { if(closeFn) closeFn(); })
  ));
}


/* ---------- 手がき風（ハンドドロウン） ----------
   紙に 何まいも 描いた アニメは、同じ絵でも 線が びみょうに ずれる。
   その ずれを まねる。

   だいじなのは「コマ数」。
   ずっと なめらかに ゆれると 手がきに 見えない。
   ぱっ ぱっ と 切りかわるから 手がきに 見える。 */
export function buildHand(box, l){
  const NL = String.fromCharCode(10);
  box.appendChild(heading('✏ 手がき風'));

  const on = () => !!(l.hand && l.hand.on);
  const sw = document.createElement('button');
  sw.style.flex = '1';
  const paint = () => {
    sw.textContent = on() ? '✏ 手がき風 … オン' : '✏ 手がき風 … オフ';
    sw.classList.toggle('on', on());
  };
  paint();
  sw.addEventListener('click', () => {
    edit('手がき風', () => {
      if(on()) l.hand.on = false;
      else l.hand = Object.assign(newHand(), l.hand || {}, { on: true });
    });
    paint();
    onChange();
    rebuild();
  });
  box.appendChild(btnRow(sw));

  const body = document.createElement('div');
  box.appendChild(body);

  function rebuild(){
    body.textContent = '';
    if(!on()){
      const t = document.createElement('div');
      t.className = 'empty';
      t.style.textAlign = 'left';
      t.textContent = '線が ふるえて、紙に 描き直した ような 見た目に なります。'
        + NL + 'フォルダに かけると、中身ぜんぶが 1まいの絵として ゆれます。';
      body.appendChild(t);
      return;
    }
    const h = l.hand;

    body.appendChild(slider('線の ゆれ', () => h.amount, v => h.amount = v, 0, 1, 0.01,
      v => v < 0.01 ? 'なし' : Math.round(v * 100) + '%'));
    body.appendChild(slider('ゆれの こまかさ', () => h.detail, v => h.detail = v, 0, 1, 0.05,
      v => v < 0.2 ? 'ざっくり' : v > 0.8 ? 'こまかい' : 'ふつう'));
    body.appendChild(slider('紙の ずれ', () => h.wobble, v => h.wobble = v, 0, 1, 0.01,
      v => v < 0.01 ? 'なし' : Math.round(v * 100) + '%'));

    /* コマ数。ここが 手がきらしさの もと。
       8コマ／秒 は テレビアニメの「3コマ うち」に ちかい。 */
    const fpsRow = document.createElement('div');
    fpsRow.className = 'rowbtns';
    [[4, '4'], [6, '6'], [8, '8'], [12, '12'], [24, '24']].forEach(([n, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.flex = '1';
      b.classList.toggle('on', (h.fps || 8) === n);
      b.addEventListener('click', () => {
        edit('コマ数', () => h.fps = n);
        onChange();
        rebuild();
      });
      fpsRow.appendChild(b);
    });
    body.appendChild(field('コマ数（1秒に）', fpsRow));

    const st = document.createElement('button');
    st.style.flex = '1';
    const paintSt = () => {
      st.textContent = h.still ? '🎞 うごきも コマ落とし … オン' : '🎞 うごきも コマ落とし … オフ';
      st.classList.toggle('on', !!h.still);
    };
    paintSt();
    st.addEventListener('click', () => {
      edit('コマ落とし', () => h.still = !h.still);
      paintSt();
      onChange();
    });
    body.appendChild(btnRow(st));

    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = '「うごきも コマ落とし」を オンに すると、'
      + NL + 'このレイヤーの うごき ぜんぶが コマ数の きざみに なります。'
      + NL + '（ぬるっと 動かず、パラパラ まんがに 近づく）';
    body.appendChild(t);
  }
  rebuild();
}


/* ================= お絵かき =================
   ペンで 書いた ものは「点の ならび」で おぼえる。
   書いた 順が のこるので、その順に 出す ことが できる。
   （情熱大陸の 名前みたいに、書いている ように 見せられる） */
let onPaint = () => {};
export function setPainter(fn){ onPaint = fn; }

/* つなぎ方の 画面は main が ひらく（シートの 出しかたを 知っているのは main） */
let askEase = () => {};
export function setEaseAsker(fn){ askEase = fn; }

export function buildPaintSheet(box, closeFn){
  const NL = String.fromCharCode(10);
  const l = selected();

  box.appendChild(heading('あたらしい かみ'));
  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'おえかきの かみ … すけたまま。上に かさねて 書きこめます。' + NL
    + 'いろの かみ … ぜんたいを 1つの 色で ぬります。';
  box.appendChild(note);

  box.appendChild(btnRow(
    button('✏ おえかきの かみ', () => {
      const made = {};
      edit('おえかきの かみ', () => {
        made.l = newPaintLayer('おえかき', S.proj.w, S.proj.h);
        S.proj.layers.unshift(made.l);
        S.sel = made.l.id;
      });
      notify('おえかきの かみを つくりました');
      onChange();
      if(closeFn) closeFn();
      onPaint();
    }),
    button('🟪 いろの かみ', () => {
      const made = {};
      edit('いろの かみ', () => {
        made.l = newSolidLayer('いろ', S.proj.w, S.proj.h, S.penColor);
        S.proj.layers.unshift(made.l);
        S.sel = made.l.id;
      });
      notify('いろの かみを つくりました');
      onChange();
      if(closeFn) closeFn();
    })
  ));

  if(!l){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'レイヤーを えらぶと つづきが 出ます';
    box.appendChild(e);
    return;
  }

  if(l.kind === 'solid'){
    box.appendChild(heading('いろ'));
    box.appendChild(colorPick('かみの色', () => l.color || '#F2A0B8',
      v => { l.color = v; paintDirty(l); }));
    return;
  }

  if(l.kind !== 'paint'){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = '「' + l.name + '」は おえかきの かみでは ありません。' + NL
      + '上の ボタンで かみを つくるか、' + NL
      + 'おえかきの かみを えらんでね。';
    box.appendChild(e);
    return;
  }

  /* ---- ペンの せってい ---- */
  box.appendChild(heading('ペン'));
  box.appendChild(colorPick('ペンの色', () => S.penColor, v => { S.penColor = v; }));
  box.appendChild(slider('ふとさ', () => S.penWidth, v => S.penWidth = v, 1, 80, 1,
    v => Math.round(v) + 'px'));
  box.appendChild(btnRow(
    button('✏ かきはじめる', () => { if(closeFn) closeFn(); onPaint(); })
  ));

  /* ---- 書いた 順に 出す ---- */
  box.appendChild(heading('✍ 書いた順に 出す'));
  const n = (l.strokes || []).length;
  const len = Math.round(totalLen(l.strokes));
  const info = document.createElement('div');
  info.className = 'empty';
  info.style.textAlign = 'left';
  info.textContent = 'いま ' + n + 'ふで（長さ ' + len + 'ドット）あります。' + NL
    + '書いた 順に、書いている ように 出てきます。';
  box.appendChild(info);

  const on = () => !!(l.reveal && l.reveal.on);
  const sw = document.createElement('button');
  sw.style.flex = '1';
  const paintSw = () => {
    sw.textContent = on() ? '✍ 書いた順に 出す … オン' : '✍ 書いた順に 出す … オフ';
    sw.classList.toggle('on', on());
  };
  paintSw();
  sw.addEventListener('click', () => {
    edit('書いた順に 出す', () => {
      if(on()) l.reveal.on = false;
      else l.reveal = Object.assign(newReveal(), l.reveal || {}, { on: true });
      paintDirty(l);
    });
    paintSw();
    onChange();
    rebuild();
  });
  box.appendChild(btnRow(sw));

  const body = document.createElement('div');
  box.appendChild(body);

  function rebuild(){
    body.textContent = '';
    if(!on() || !n) return;
    const r = l.reveal;

    body.appendChild(slider('はじまり', () => r.start, v => { r.start = v; paintDirty(l); },
      0, Math.max(1, S.proj.duration), 0.1, v => v.toFixed(1) + '秒'));
    body.appendChild(slider('かかる時間', () => r.dur, v => { r.dur = v; paintDirty(l); },
      0.2, 20, 0.1, v => v.toFixed(1) + '秒'));

    body.appendChild(btnRow(
      button('⏱ いまの時間から', () => {
        edit('はじまりを あわせる', () => { r.start = +S.time.toFixed(2); paintDirty(l); });
        notify(r.start.toFixed(1) + '秒から 書きはじめます');
        onChange();
        rebuild();
      }),
      button('〰 つなぎ方', () => { openEase(r); })
    ));

    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = 'いまの つなぎ方 … ' + (EASES[r.ease] ? easeName(r.ease) : '自分で かいた線') + NL
      + 'まっすぐ に すると 同じ はやさで 書きます。' + NL
      + '（ゆっくり出る に すると はじめが のろのろ）';
    body.appendChild(t);
  }
  rebuild();

  function easeName(k){
    const f = EASE_LIST.find(e => e[0] === k);
    return f ? f[1] : k;
  }
  function openEase(r){
    askEase(r.ease, r.shape, (key, shape) => {
      edit('つなぎ方', () => { r.ease = key; if(shape) r.shape = shape; paintDirty(l); });
      onChange();
    });
  }
}


/* ---------- 🎞 パラパラ ----------
   フォルダの 中身を 1まいずつ 順ぐりに 見せる。
   ＝ 中の レイヤーが そのまま コマに なる。

   1つの レイヤーに コマを つめる やり方と ちがって、
   コマは 1まいずつ 別の レイヤーの まま。
   だから コマごとに 場所や 大きさを 変えられる。
   （たたんで おけば タイムラインは フォルダの 1行だけ） */
export function buildFlipSheet(box, back){
  const NL = String.fromCharCode(10);
  const l = selected();
  if(!l) return;
  backRow(box, back);

  /* まだ フォルダに なっていない … ☑ で えらんだ ものを まとめる */
  if(!isFolder(l)){
    const ids = S.pick.length ? [...S.pick] : [l.id];
    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = 'コマに したい 絵を ☑ で えらんでから おしてね。' + NL
      + 'えらんだ 絵が 上から 順に コマに なります。' + NL + NL
      + 'いま えらんでいる … ' + ids.length + 'まい';
    box.appendChild(t);
    box.appendChild(btnRow(
      button('🎞 えらんだ ' + ids.length + 'まいを パラパラにする', () => {
        if(ids.length < 2) return notify('☑ で 2まい いじょう えらんでね');
        const made = {};
        edit('パラパラにする', () => {
          made.f = groupInto(S.proj, ids, S.time, 'パラパラ');
          if(made.f) made.f.flip = newFlip();
        });
        if(!made.f) return notify('まとめられませんでした');
        S.pick = [];
        S.sel = made.f.id;
        notify(ids.length + 'まいの パラパラに しました');
        onChange();
      })
    ));
    return;
  }

  const mem = membersOf(S.proj, l);
  const n = mem.length;

  const on = () => isFlip(l);
  const sw = document.createElement('button');
  sw.style.flex = '1';
  const paintSw = () => {
    sw.textContent = on() ? '🎞 パラパラ … オン' : '🎞 パラパラ … オフ';
    sw.classList.toggle('on', on());
  };
  paintSw();
  sw.addEventListener('click', () => {
    edit('パラパラ', () => {
      if(on()) l.flip.on = false;
      else l.flip = Object.assign(newFlip(), l.flip || {}, { on: true });
    });
    paintSw();
    onChange();
    rebuild();
  });
  box.appendChild(btnRow(sw));

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.textAlign = 'left';
  head.textContent = '「' + l.name + '」の 中身 ' + n + 'まいが コマに なります。' + NL
    + '上に あるものが 1コマめ。' + NL
    + 'コマの 入れかえは タイムラインで レイヤーを 上下に 動かして。';
  box.appendChild(head);

  const body = document.createElement('div');
  box.appendChild(body);

  function rebuild(){
    body.textContent = '';
    if(!on()) return;
    if(n < 2){
      const e = document.createElement('div');
      e.className = 'empty';
      e.style.textAlign = 'left';
      e.textContent = 'コマが たりません。フォルダに 絵を 入れてね。';
      body.appendChild(e);
      return;
    }
    const f = l.flip;

    /* 「1コマ 何秒」より「1秒に 何コマ」の ほうが 分かりやすい。
       8コマ／秒 は テレビアニメの「3コマ うち」に ちかい。 */
    body.appendChild(slider('1秒に 何コマ',
      () => Math.round(1 / f.spf),
      v => { f.spf = 1 / Math.max(1, v); },
      1, 24, 1, v => Math.round(v) + 'コマ'));

    const one = document.createElement('div');
    one.className = 'empty';
    one.style.textAlign = 'left';
    one.textContent = '1コマ ' + f.spf.toFixed(3) + '秒　'
      + '' + n + 'コマで ひとまわり ' + (f.spf * n).toFixed(2) + '秒';
    body.appendChild(one);

    body.appendChild(slider('はじまり', () => f.start, v => f.start = v,
      0, Math.max(1, S.proj.duration), 0.05, v => v.toFixed(2) + '秒'));

    const modeRow = document.createElement('div');
    modeRow.className = 'rowbtns';
    [['loop', '🔁 ずっと'], ['once', '➡ 1回だけ'], ['ping', '🔄 往復']].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.flex = '1';
      b.classList.toggle('on', (f.mode || 'loop') === k);
      b.addEventListener('click', () => {
        edit('パラパラの 出しかた', () => f.mode = k);
        onChange();
        rebuild();
      });
      modeRow.appendChild(b);
    });
    body.appendChild(field('出しかた', modeRow));

    body.appendChild(btnRow(
      button('⏱ いまの時間から', () => {
        edit('はじまりを あわせる', () => { f.start = +S.time.toFixed(2); });
        notify(f.start.toFixed(2) + '秒から はじめます');
        onChange();
        rebuild();
      })
    ));

    const now = flipIndex(f, n, S.time);
    const t = document.createElement('div');
    t.className = 'empty';
    t.style.textAlign = 'left';
    t.textContent = 'いまの 時間（' + S.time.toFixed(2) + '秒）は '
      + (now + 1) + 'コマめ … ' + (mem[now] ? mem[now].name : '') + NL
      + '1回だけ に すると、さいごの コマで 止まります。';
    body.appendChild(t);
  }
  rebuild();
}
