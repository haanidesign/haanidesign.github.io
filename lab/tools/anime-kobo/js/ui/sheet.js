/* 下から出てくる設定シート。細かい数字はここに隠す。 */

import { S, onChange, beginEdit, commitEdit, edit, selected, addAsset } from '../state.js?v=242';
import { isDescendant, setParent, isFolder, membersOf, ungroup, mergeAsFrames,
         attachMany, copyLayers, pasteLayers, removeLayers,
         duplicateLayers, newPaintLayer, newSolidLayer,
         newFlip, isFlip, flipIndex, groupInto,
         splitFrames, newCamLayer, nearestFolder } from '../engine/layer.js?v=242';
import { hasPins, setPin, channelValue, valuesAt, spreadFrames,
         framePinTimes, removePin, pinChX, pinChY, EASES, EASE_LIST,
         curveAt, MY_EASE_MAX } from '../engine/anim.js?v=242';
import { swayKeys, swayPose, newSway, RIGID,
         afterKeys, afterAngle, afterLen, stopTimes } from '../engine/puppet.js?v=242';
import { pathKeys, pathLength, resample } from '../engine/path.js?v=242';
import { blinkKeys, talkKeys } from '../engine/anim.js?v=242';
import { PRESET_GROUPS, CATS } from '../engine/presets.js?v=242';
import { FONTS, renderTextLayer, shortName, newTextStyle, textToCanvas,
         addTextLayer } from '../io/text.js?v=242';
import { addBgLayer, paintBg, fitToCanvas, isBg,
         paintPattern, addPatternBg, DIR_PRESETS } from '../io/bg.js?v=242';
import { PATTERN_NAMES } from '../io/pattern.js?v=242';
import { isPano, addPanoLayer, spinKeys, sweepKeys, panoDefaults,
         PITCH_MAX } from '../engine/pano.js?v=242';
import { ballOn, ballDefaults, ballSpinKeys } from '../engine/ball.js?v=242';
import { isRoom, addRoomLayer, FACES as ROOM_FACES } from '../engine/room.js?v=242';
import { isTalk, addTalkLayer, addNextTalk, talkDefaults, talkMouthKeys,
         talkEnd, talkStart, talkOut, niceHold,
         overlapping, fixOverlaps } from '../engine/talk.js?v=242';
import { readAsDataURL, loadImage } from '../io/image.js?v=242';
import { isCam, camOf, resetCam, depthScale, is3D, ORBIT_MAX,
         DOLLY_MIN, DOLLY_MAX, depthOf, CAM_CHANNELS,
         DEPTH_MIN, DEPTH_MAX, DEPTH_PRESETS } from '../engine/camera.js?v=242';
import { bakeLayers, applyBake } from '../io/flatten.js?v=242';
import { newHand } from '../engine/hand.js?v=242';
import { newReveal, totalLen, paintDirty } from '../engine/paint.js?v=242';
import { createWheel, favs, addFav, delFav, hasFav, parseHex, hex as toHex }
  from './colorwheel.js?v=242';
import { A as AUD, hasAudio, clearAudio, voiceMouthKeys, speechSpans, levels,
         startRec, stopRec, cancelRec, isRecording, setPitch,
         guessBpm, firstOnset, playBlip } from '../io/audio.js?v=242';
import { rhythmKeys, rhythmChannels, beatTimes, beatSec, markKeys,
         RHYTHM_KINDS, putHit } from '../engine/rhythm.js?v=242';

/* スライダーを つまんでいる間は 中身を作り直さない。
   作り直すと つまんでいた部品が 消えてしまい、
   指を離すまで 動かなくなる（＝タップした所に飛ぶだけになる）。 */
let holding = false;
export const holdSheet = (on) => { holding = !!on; };

/* しるしが 立ちっぱなしに ならない ように、自分で もどす。
   指を はなした ときに、色えらびが ひらいて いなければ 外す。
   つまみを なぞって いる あいだは pointerup が 来ない ので
   じゃまに ならない。 */
document.addEventListener('pointerup', () => {
  if(!holding) return;
  if(document.querySelector('.wheelbox:not([hidden])')) return;
  /* 字を 打って いる あいだも そのまま。
     作り直すと 打って いる わくが 消えて、字が 入らなく なる。 */
  const a = document.activeElement;
  if(a && /^(input|textarea)$/i.test(a.tagName) && a.closest('#sheet')) return;
  holding = false;
}, true);

/* よこ画面の タブレットでは、せってい を 右に つけっぱなしに する。
   絵・タイムライン・せってい を 同時に さわれる ように する ため。
   （下から せり上がる 幕だと、時間を ずらす たびに 出し入れに なる） */
const DOCK_Q = '(min-width:900px) and (orientation:landscape)';
export const canDock = () => window.matchMedia(DOCK_Q).matches;
let dockHook = null;
/** 横づけに なった／やめた ときに 絵の 大きさを 直す ための 呼び出し口 */
export function setDockHook(fn){ dockHook = fn; }

function setDock(on){
  const want = !!on && canDock();
  const now = document.body.classList.contains('docked');
  if(want === now) return;
  document.body.classList.toggle('docked', want);
  if(dockHook) dockHook(want);
}

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

  /* シートを 出し入れする ときは「つまんでいる」を かならず 外す。
     色えらびを ひらいた まま シートを とじると、この しるしが
     立った ままに なって、その あと 何を しても シートの 中身が
     作り直されなく なる（＝もどす を おしても 見た目が 変わらない）。 */
  function open(title, build){
    holdSheet(false);
    builder = build; pages = null; page = 0;
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
    setDock(true);
    liftStage(true);
  }

  /** 横にスライドして切り替えるページで開く */
  function openPages(title, list, startKey){
    holdSheet(false);
    builder = null;
    pages = list;
    page = Math.max(0, list.findIndex(x => x.key === startKey));
    render(title);
    sheetEl.classList.add('on');
    backEl.classList.add('on');
    setDock(true);
    liftStage(true);
  }
  function close(){
    holdSheet(false);
    setDock(false);
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

    /* 横づけの ときは うしろの 幕が 無い ので、とじる ボタンを 出す */
    if(canDock()){
      const bar = document.createElement('div');
      bar.className = 'dockclose';
      const x = document.createElement('button');
      x.className = 'btn-sm';
      x.textContent = '✕ とじる';
      x.title = 'せっていを とじる';
      x.addEventListener('click', () => close());
      bar.appendChild(x);
      sheetEl.appendChild(bar);
    }

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

  /* ---------- めくって いる とちゅうの ごタッチを ふせぐ ----------
     ボタンの 上に 指を おいた まま 上下に めくると、
     指を はなした ときに その ボタンが おされて しまう。

     さわった ところから 10ドット より 多く 動いて いたら、
     それは「めくった」ので あって「おした」のでは ない。
     おす のを なかった ことに する。
     （つかまえるのは 中に とどく 前。だから どの ボタンにも 効く） */
  let tapX = 0, tapY = 0, tapMoved = false;
  sheetEl.addEventListener('pointerdown', (e) => {
    tapX = e.clientX; tapY = e.clientY; tapMoved = false;
  }, true);
  sheetEl.addEventListener('pointermove', (e) => {
    if(tapMoved) return;
    if(Math.hypot(e.clientX - tapX, e.clientY - tapY) > 10) tapMoved = true;
  }, true);
  sheetEl.addEventListener('click', (e) => {
    if(!tapMoved) return;
    tapMoved = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

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

/* ---------- すべりを「よこに 動かした ときだけ」効かせる ----------
   シートを 上下に めくって いる とちゅう、指が すべりの 上を
   通る だけで 数字が 変わって しまって いた。

   ・さわった しゅんかんの 数字を おぼえておく
   ・たてに 動いた ぶんが よこより 大きい あいだは、
     数字を もどして なかった ことに する
   ・よこに 8ドット 動いたら「これは いじる 気だ」と きめて 効かせる

   さらに touch-action:pan-y で、たての めくりは ブラウザに まかせる。 */
/* ---------- つまみの「きりの いい 数字」----------

   0 に ぴたりと 合わせるのが むずかしい、という ところから。

     ふだん … 0・いちばん 小さい・いちばん 大きい の 3つ だけ
              吸いつく（7ドット ぶん）。ここが 手で 合わせにくい ところ。
              とちゅうの 数字は じゃま しない（47 が 50 に ならない）。
     長おし … 0.4秒 おしたままに してから 動かすと、
              きりの いい 数字だけを 通る（間の 数字に ならない）。

   きりの いい 数字は はばから 出す。
   0〜1 なら 0.1 きざみ、0〜100 なら 10 きざみ、
   -180〜180 なら 45 きざみ、という ぐあい。 */
function niceStep(span){
  const raw = span / 8;
  const base = Math.pow(10, Math.floor(Math.log10(raw)));
  /* いちばん 近い ものを えらぶ。「はじめに こえた もの」に すると
     0〜100 が 20きざみ に なって しまう（10 の ほうが しっくり くる）。 */
  let best = base, bd = Infinity;
  for(const m of [1, 2, 2.5, 5, 10]){
    const v = base * m, d = Math.abs(v - raw);
    if(d < bd){ bd = d; best = v; }
  }
  return best;
}

function stopsFor(min, max){
  const span = max - min;
  if(!(span > 0)) return [];
  const st = niceStep(span);
  const out = [];
  const first = Math.ceil(min / st) * st;
  for(let v = first; v <= max + 1e-9; v += st) out.push(+v.toFixed(6));
  if(min < 0 && max > 0 && !out.some(v => Math.abs(v) < 1e-9)) out.push(0);
  if(!out.some(v => Math.abs(v - min) < 1e-9)) out.push(min);
  if(!out.some(v => Math.abs(v - max) < 1e-9)) out.push(max);
  /* 90°/180° は よく つかう ので、角度の はばの ときは 足しておく */
  if(span >= 180){
    for(const q of [-180, -90, 90, 180])
      if(q >= min && q <= max && !out.some(v => Math.abs(v - q) < 1e-9)) out.push(q);
  }
  return out.sort((a, b) => a - b);
}

/* 長おしの 知らせは はじめの 1回だけ（毎回 出ると うるさい） */
let coarseTold = false;

function guardSlide(i, apply){
  let x0 = 0, y0 = 0, v0 = null, armed = false;
  let coarse = false, holdT = null;

  const PULL_PX = 7;          // ふだんの 吸いつき（ドット）

  const snap = () => {
    const min = +i.min, max = +i.max, step = +i.step || 0.001;
    /* ふだんは はしと 0 だけ。長おし中は きりの いい 数字ぜんぶ。 */
    const stops = coarse ? stopsFor(min, max)
      : [min, max].concat(min < 0 && max > 0 ? [0] : []);
    if(!stops.length) return;
    const w = i.getBoundingClientRect().width || 200;
    const per = (max - min) / Math.max(1, w);         // 1ドット ぶんの 数
    const tol = coarse ? Infinity : PULL_PX * per;
    const val = +i.value;
    let best = null, bd = Infinity;
    for(const st of stops){
      const d = Math.abs(val - st);
      if(d < bd){ bd = d; best = st; }
    }
    if(best === null || bd > tol) return;
    const q = Math.round(best / step) * step;
    const fixed = +q.toFixed(6);
    if(+i.value !== fixed) i.value = fixed;
  };

  i.addEventListener('pointerdown', (e) => {
    x0 = e.clientX; y0 = e.clientY; v0 = i.value;
    S.dragging = true;            // 画質を「あらく」に する あいだ
    coarse = false;
    clearTimeout(holdT);
    /* 長おし＝ きりの いい 数字だけ を 通る モード */
    holdT = setTimeout(() => {
      coarse = true;
      i.classList.add('coarse');
      if(!coarseTold){ coarseTold = true; notify('きりの いい 数字だけに なります'); }
    }, 400);
    // マウスは まちがえようが ないので すぐ 効かせる
    armed = e.pointerType === 'mouse';
    if(armed) apply();
  });

  i.addEventListener('pointermove', (e) => {
    const dx = Math.abs(e.clientX - x0), dy = Math.abs(e.clientY - y0);
    if(!coarse && (dx > 10 || dy > 10)) clearTimeout(holdT);   // 動いたら 長おしでは ない
    if(armed || v0 === null) return;
    if(dx >= 8 && dx > dy){ armed = true; apply(); }
  });

  i.addEventListener('input', () => {
    if(armed){ snap(); return apply(); }
    i.value = v0;                 // まだ その気が ないので もどす
  });

  const end = () => {
    armed = false; v0 = null; coarse = false;
    clearTimeout(holdT);
    i.classList.remove('coarse');
    if(S.dragging){ S.dragging = false; onChange(); }   // きれいに 描き直す
  };
  ['pointerup', 'pointercancel', 'blur'].forEach(ev => i.addEventListener(ev, end));
}

export function slider(label, get, set, min, max, step, fmt){
  const i = document.createElement('input');
  i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
  const v = document.createElement('span');
  v.className = 'val';
  const show = () => v.textContent = (fmt ? fmt(+i.value) : (+i.value).toFixed(2));
  show();
  i.addEventListener('pointerdown', () => { holdSheet(true); beginEdit(label + 'をかえる'); });
  guardSlide(i, () => { set(+i.value); show(); onChange(); });
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
    } else if(ch === 'glowAmt'){
      layer.glow = layer.glow || { color:'#FFF2A8', amount:0, size:24 };
      layer.glow.amount = v;
    } else if(ch === 'shadowAmt'){
      layer.shadow = layer.shadow || { color:'#1E1C14', amount:0, x:14, y:18, blur:12 };
      layer.shadow.amount = v;
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
  guardSlide(i, () => { set(+i.value); show(); onChange(); });
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
  const NL = String.fromCharCode(10);
  const l = selected();
  /* 🔊 の 行は 絵では ない ので、おとの せっていを そのまま 出す */
  if(l && l.kind === 'audio'){
    const h = document.createElement('div');
    h.className = 'empty';
    h.style.textAlign = 'left';
    h.textContent = 'この 行は おとです。絵には 出ません。' + NL
      + 'タイムラインの この 行に 波形が 出て いる ので、' + NL
      + 'どこで しゃべって いるかが 見えます。';
    box.appendChild(h);
    audioRows(box, closeFn);
    return;
  }
  if(!l){
    const p = document.createElement('div');
    p.className = 'empty';
    p.textContent = 'レイヤーをえらんでね';
    box.appendChild(p);
    return;
  }

  /* 💬 セリフ枠は「文を 書く」のが 目あて なので いちばん 上に 出す。
     なまえや すけ具合の 下に あると 見つからない。 */
  talkRow(box, l, closeFn);

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

  /* ---- カメラに 合わせない（画面に はりつけ）----
     まえは「おくゆき（カメラ用）」の 中に しまって いて、
     しかも カメラが 無い ときは まるごと 出て いなかった ので
     見つけられない と 言われた。
     なまえ・カギ の すぐ 下、いつも 出す ところに 移した。
     フォルダでも 同じ ように 出る。 */
  box.appendChild(field('カメラ', (() => {
    const b = document.createElement('button');
    const show = () => {
      b.textContent = l.noCam ? '📌 画面に はりつけ（合わせない）'
                              : '🎥 カメラに 合わせる';
      b.classList.toggle('on', !!l.noCam);
    };
    show();
    b.style.flex = '1';
    b.addEventListener('click', () => {
      edit('カメラとの つながり', () => { l.noCam = !l.noCam; });
      show();
      notify(l.noCam ? 'カメラが ゆれても そのままに なります'
                     : 'カメラに 合わせて 動きます');
      onChange();
    });
    return b;
  })()));
  {
    const n = document.createElement('div');
    n.className = 'empty';
    n.style.textAlign = 'left';
    n.textContent = 'はりつけに すると、カメラの ふれ・よせ・まわりこみを'
      + String.fromCharCode(10)
      + 'ぜんぶ うけません。セリフ枠・ロゴ・字まく むけ。';
    box.appendChild(n);
  }

  const pct = v => Math.round(v * 100) + '%';
  box.appendChild(animSlider('すけ具合', l, 'opacity', 0, 1, 0.01, pct));

  /* ---- かさね方（フォトショップの 乗算 など）----
     下に ある 絵と どう まぜるか。「乗算」は かけ算 ＝ かげ用。
     PSD の レイヤーモードと 同じ 名前なので、
     読みこみ・書き出しで そのまま 行き来できる。 */
  box.appendChild(field('かさね方', (() => {
    const sel = document.createElement('select');
    const opts = [
      ['normal', 'ふつう'],
      ['multiply', '乗算（かげ）'],
      ['screen', 'スクリーン（ひかり）'],
      ['overlay', 'オーバーレイ'],
      ['add', '加算（あかるく）'],
      ['darken', '比較（暗）'],
      ['lighten', '比較（明）'],
      ['softlight', 'ソフトライト'],
      ['hardlight', 'ハードライト'],
      ['colordodge', '覆い焼き'],
      ['colorburn', '焼きこみ'],
      ['difference', '差の絶対値']
    ];
    for(const [v, t] of opts){
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      sel.appendChild(o);
    }
    sel.value = l.blend || 'normal';
    sel.style.flex = '1';
    sel.addEventListener('change', () => {
      edit('かさね方をかえる', () => { l.blend = sel.value; });
      onChange();
    });
    return sel;
  })()));

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

    spanRow(box, l, closeFn);
    warpRow(box, l, closeFn);
    ballRow(box, l);
    buildLook(box, l, { flip: false, close: closeFn });

    /* ---- バラで 動かす（AEの コラップス）----
       ふだん フォルダは 中身を 1まいの 紙に まとめて 出す。
       それを やめて、中身 1まい 1まいを カメラに 直に 見せる。 */
    /* 立体・おくゆきは フォルダにも きく。
       まとめた 1まいの 紙を、おくゆきの ところに 立てて うつす
       （camera.js の sheetQuad3D）ので、
       ふつうの レイヤーと 同じ 手ざわりで たおせる。 */
    tiltRow(box, l);
    depthRow(box, l);

    box.appendChild(heading('🎥 カメラと おくゆき'));
    const col = !!l.collapse;
    box.appendChild(btnRow(
      button(col ? '✅ 中身を バラで 動かす' : '⬜ 中身を バラで 動かす', () => {
        edit('バラで 動かす', () => { l.collapse = !col; });
        notify(col ? 'フォルダを 1まいの 紙に もどしました'
                   : '中身が それぞれの おくゆきで 動くように なりました');
        onChange();
      })
    ));
    const cnote = document.createElement('div');
    cnote.className = 'empty';
    cnote.style.textAlign = 'left';
    cnote.textContent = col
      ? ('中身の 1まい 1まいが、自分の おくゆきで 動きます。' + NL
         + 'フォルダの 中でも 手前と おくの ずれが 出ます。' + NL
         + 'そのかわり、フォルダに かける すけ具合・ふちどり・' + NL
         + 'ゆがみ は 中身 それぞれに かかる かたちに なります。')
      : ('いまは 中身ぜんぶで 1まいの 紙 です。' + NL
         + 'まとめて うすく したり ゆがめたり できる かわりに、' + NL
         + '中の おくゆきの ちがいは 出ません。' + NL
         + 'PSDの グループを 立体に したい ときは オンに。');
    box.appendChild(cnote);

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
    spanRow(box, l, closeFn);
  warpRow(box, l, closeFn);
    buildLook(box, l, { flip: true, close: closeFn });
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

  panoRow(box, l);
  ballRow(box, l);
  tiltRow(box, l);
  depthRow(box, l);
  box.appendChild(clipRow(l));
  spanRow(box, l, closeFn);
  warpRow(box, l, closeFn);
  buildLook(box, l, { flip: true, close: closeFn });

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
    ['anim',   '✨ うごきを つける', 'イン・ループ・アウト。出る／ゆれる／消える'],
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


/* うごきの ボタンを 図つきで ならべる。

   字だけの ならびだと、どれが どんな 動きか さわるまで わからない。
   小さな 図（presets.js が 持っている SVG）を 上に のせて、
   「表示 / 移動 / 拡大・縮小」で 分けて 出す。 */
function presetGrid(box, list, run){
  CATS.forEach(cat => {
    const items = list.filter(p => p.cat === cat.key);
    if(!items.length) return;

    const sub = document.createElement('div');
    sub.className = 'subhead';
    sub.textContent = cat.label;
    box.appendChild(sub);

    const wrap = document.createElement('div');
    wrap.className = 'presets';
    items.forEach(p => {
      const b = document.createElement('button');
      b.className = 'preset';
      b.title = p.name;

      const fig = document.createElement('span');
      fig.className = 'pfig';
      fig.innerHTML = p.icon;          // 自分で 書いた 図だけ
      b.appendChild(fig);

      const t = document.createElement('span');
      t.className = 'pname';
      t.textContent = p.name;
      b.appendChild(t);

      b.addEventListener('click', () => run(p));
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  });
}


/* ================= おくゆき =================
   カメラが ある ときだけ 出す。
   カメラを ふった とき、手前の ものほど 大きく ずれる。 */
function depthRow(box, l){
  if(isCam(l)) return;
  if(!camOf(S.proj, S.time)) return;   /* カメラが 無ければ おくゆきの 話は 出さない */
  const NL = String.fromCharCode(10);

  box.appendChild(heading('おくゆき（カメラ用）'));


  box.appendChild(btnRow(
    button('🎥 カメラの 画面へ', () => { onCam(); })
  ));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'カメラを 動かした とき、' + NL
    + '手前の ものは 大きく、おくの ものは すこしだけ ずれます。';
  box.appendChild(note);

  /* ---- トーンの ちらつき（モアレ）よけ ----
     アミ点や 細い しま が ある 絵を ななめから 見ると、
     絵の 点と 画面の ドットが けんかして
     「もよう」や「すじ」が 出て、カメラを 動かすと それが 流れる。
     すこし 小さくした 写しから 拾うと おさまる。 */
  if(!isFolder(l) && l.frames && l.frames.length){
    box.appendChild(btnRow(
      button(l.tone ? '✅ トーンの ちらつきを おさえる'
                    : '⬜ トーンの ちらつきを おさえる', () => {
        edit('トーンよけ', () => { l.tone = !l.tone; });
        notify(l.tone ? 'すこし やわらかく 拾います'
                      : 'もとの 絵から そのまま 拾います');
        onChange();
        if(closeFn) closeFn();
      })
    ));
    const tnn = document.createElement('div');
    tnn.className = 'empty';
    tnn.style.textAlign = 'left';
    tnn.textContent = 'アミ点・細い しま の 絵を ななめに した ときに' + NL
      + '出る「もよう」「すじ」を おさえます。' + NL
      + 'そのぶん ほんの すこし やわらかく なります。' + NL
      + '（実測: すじの 見えかた 27.6 → 10.7）';
    box.appendChild(tnn);
  }

  /* ---- フォルダの 中の 1まいは、そのままでは おくゆきが きかない ----
     フォルダは 中身を 1まいの 紙に まとめて から カメラに 見せる ので、
     中身 1つ1つの おくゆきは 出番が ない（フォルダの おくゆきに なる）。
     「バラで 動かす」に すると 中身が 1まいずつ カメラに 出るので きく。
     ここで すぐ 切りかえられる ように して おく。 */
  const host = nearestFolder(S.proj, l);
  if(host && !host.collapse){
    const w = document.createElement('div');
    w.className = 'empty';
    w.style.textAlign = 'left';
    w.textContent = 'いまは フォルダ「' + (host.name || 'フォルダ') + '」の'
      + ' おくゆきに なります。' + NL
      + '中身を 1まいずつ 置きたい ときは、下を おしてね。';
    box.appendChild(w);
    box.appendChild(btnRow(
      button('📂 「' + (host.name || 'フォルダ') + '」の 中身を バラで 動かす', () => {
        edit('バラで 動かす', () => { host.collapse = true; });
        notify('中身が それぞれの おくゆきで 動くように なりました');
        onChange();
      })
    ));
  }

  const show = () => (depthScale(l) * 100).toFixed(0) + '%の 大きさ';
  const sizeNote = document.createElement('div');
  sizeNote.className = 'empty';
  sizeNote.style.textAlign = 'left';
  const refresh = () => sizeNote.textContent = 'いまの おくゆきだと ' + show();
  refresh();

  box.appendChild(animSlider('おくゆき', l, 'depth', DEPTH_MIN, DEPTH_MAX, 0.5,
    v => v === 0 ? 'ふつう' : (v < 0 ? 'てまえ ' + (-v) : 'おく ' + v)));
  box.appendChild(sizeNote);

  const dpin = document.createElement('div');
  dpin.className = 'empty';
  dpin.style.textAlign = 'left';
  dpin.textContent = 'おくゆきにも ピンが うてます。' + NL
    + '「おくへ とんで いく」「手前に せまって くる」が 作れます。';
  box.appendChild(dpin);

  const row = document.createElement('div');
  row.className = 'rowbtns';
  row.style.flexWrap = 'wrap';
  DEPTH_PRESETS.forEach(([label, v]) => {
    const b = button(label, () => {
      edit('おくゆきを かえる', () => {
        l.depth = v;
        if(hasPins(l)) setPin(l, 'depth', S.time, v, 'smooth');
      });
      refresh();
      onChange();
    });
    b.style.flex = '0 0 30%';
    b.classList.toggle('on', (l.depth || 0) === v);
    row.appendChild(b);
  });
  box.appendChild(field('めやす', row));
}


/* ================= 立体（3D） =================
   絵を おくへ たおす・よこに まわす。
   カメラが なくても きくが、カメラと いっしょに つかうと いちばん 生きる。 */
function tiltRow(box, l){
  if(isCam(l)) return;
  const NL = String.fromCharCode(10);
  box.appendChild(heading('立体（3D）'));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = '絵を 板だと 思って、おくへ たおしたり' + NL
    + 'よこに まわしたり できます。' + NL
    + 'おくに 行く ほうが せまく なる ので、ゆかや かべに 見えます。';
  box.appendChild(note);

  const deg = v => v === 0 ? 'まっすぐ' : (Math.round(v) + '°');
  /* ピンが うって あれば、その 時こくの ピンも いっしょに 直す
     ＝ 立体の かたむきにも うごきが つけられる。 */
  box.appendChild(animSlider('おくへ たおす', l, 'rx', -80, 80, 1, deg));
  box.appendChild(animSlider('よこに まわす', l, 'ry', -80, 80, 1, deg));

  const hnote = document.createElement('div');
  hnote.className = 'empty';
  hnote.style.textAlign = 'left';
  hnote.textContent = '絵の 下に 出る 青い つまみを なぞっても、' + NL
    + '同じ ことが できます（よこ＝まわす／たて＝たおす）。';
  box.appendChild(hnote);

  const row = document.createElement('div');
  row.className = 'rowbtns';
  row.style.flexWrap = 'wrap';
  [['ゆか', 70, 0], ['てんじょう', -70, 0], ['ひだりの かべ', 0, 55],
   ['みぎの かべ', 0, -55], ['まっすぐ', 0, 0]].forEach(([label, rx, ry]) => {
    const b = button(label, () => {
      edit('立体に する', () => {
        l.rx = rx; l.ry = ry;
        if(hasPins(l)) ['rx', 'ry'].forEach(
          c => setPin(l, c, S.time, l[c], 'smooth'));
      });
      onChange();
    });
    b.style.flex = '0 0 30%';
    b.classList.toggle('on', (l.rx || 0) === rx && (l.ry || 0) === ry);
    row.appendChild(b);
  });
  box.appendChild(field('めやす', row));

  /* いつも 正面（ビルボード）。
     カメラが 回りこんでも、この 絵だけは こっちを 向いた まま。
     キャラや ふきだしを 立体の 中に 置く ときに つかう。 */
  if(camOf(S.proj, S.time)){
    const bb = !!l.billboard;
    box.appendChild(btnRow(
      button(bb ? '✅ いつも 正面を むく' : '⬜ いつも 正面を むく', () => {
        edit('いつも 正面', () => { l.billboard = !bb; });
        notify(bb ? 'まわりこみに ついて まわるように しました'
                  : 'カメラが まわっても こっちを 向いた ままに しました');
        onChange();
      })
    ));
    const bn = document.createElement('div');
    bn.className = 'empty';
    bn.style.textAlign = 'left';
    bn.textContent = 'カメラが まわりこんでも、この 絵だけ' + NL
      + 'いつも こっちを 向いた ままに なります。' + NL
      + '立体の せかいに キャラや ふきだしを 置く ときに。' + NL
      + 'おくゆきの ずれは そのまま 出る ので、' + NL
      + '「その 場所に 立って いる」感じは のこります。';
    box.appendChild(bn);
  }

  if(is3D(l)){
    const w = document.createElement('div');
    w.className = 'empty';
    w.style.textAlign = 'left';
    w.textContent = 'たおして いる あいだは、この レイヤーの' + NL
      + '「おやこ」の 子は ついてきません。' + NL
      + 'いっしょに たおしたい ときは フォルダに 入れて、' + NL
      + 'フォルダごと たおして ください。';
    box.appendChild(w);
  }
}

/* ================= カメラ =================
   絵を 動かすのでは なく、見ている ほうを 動かす。
   カメラは ふつうの レイヤーなので、
   よこ・たて・ズーム・かたむき に そのまま ピンが うてる。 */
export function buildCamSheet(box, back){
  backRow(box, back);
  const NL = String.fromCharCode(10);
  const cam = camOf(S.proj, S.time) || S.proj.layers.find(isCam);

  /* まえの ばんの カメラは いちばん 下の 行に できて いた。
     さがしにくい ので 上へ 上げる。
     カメラは 絵に 出ない ので、ならび順を かえても 見た目は 1ドットも 変わらない。 */
  if(cam && S.proj.layers[0] !== cam){
    const i = S.proj.layers.indexOf(cam);
    if(i > 0){
      S.proj.layers.splice(i, 1);
      S.proj.layers.unshift(cam);
      /* いま この シートを 組み立てて いる さいちゅう なので、
         ここで すぐ 知らせると シートが 二重に 出る
         （知らせる → 組み立て直し → もどってきて つづきを 足す）。
         組み立てが 終わってから 知らせる。 */
      setTimeout(onChange, 0);
    }
  }

  if(!cam){
    box.appendChild(heading('🎥 カメラ'));
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = 'カメラを 足すと、絵を 動かさずに' + NL
      + '「見ている ほう」を 動かせます。' + NL + NL
      + 'レイヤーごとに「おくゆき」を きめて おくと、' + NL
      + 'カメラを ふった とき 手前の ものほど 大きく ずれて、' + NL
      + '絵が 立体に 見えます（アフターエフェクトと おなじ かんじ）。';
    box.appendChild(e);
    box.appendChild(btnRow(
      button('＋ カメラを つくる', () => {
        edit('カメラを つくる', () => {
          const c = newCamLayer(S.proj);
          /* いちばん 上の 行に 出す。絵には なにも 出ない ので
             ならび順は 見た目に ひびかない。さがしやすさが だいじ。 */
          S.proj.layers.unshift(c);
          S.sel = c.id;
        });
        notify('カメラを つくりました。タイムラインの 🎥 の 行です');
        onChange();
      })
    ));
    return;
  }

  box.appendChild(heading('🎥 カメラ'));

  const on = cam.visible !== false;
  box.appendChild(btnRow(
    button(on ? '✅ カメラ … オン' : '⬜ カメラ … オフ', () => {
      edit('カメラの 入り切り', () => { cam.visible = !on; });
      notify(on ? 'カメラを 切りました' : 'カメラを つけました');
      onChange();
    })
  ));

  if(!on){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = '切って いる あいだは、おくゆきも きかず、' + NL
      + 'ふつうに ならんだ 絵に なります。';
    box.appendChild(e);
    return;
  }

  const cx = S.proj.w / 2, cy = S.proj.h / 2;
  const px = v => Math.round(v) + 'px';
  box.appendChild(animSlider('よこに ふる', cam, 'x', cx - S.proj.w, cx + S.proj.w, 1,
    v => v === cx ? 'まん中' : px(v - cx)));
  box.appendChild(animSlider('たてに ふる', cam, 'y', cy - S.proj.h, cy + S.proj.h, 1,
    v => v === cy ? 'まん中' : px(v - cy)));
  box.appendChild(animSlider('ズーム（画角）', cam, 'scaleX', 0.2, 4, 0.01,
    v => (v * 100).toFixed(0) + '%'));
  box.appendChild(animSlider('かたむき', cam, 'rot', -180, 180, 1,
    v => Math.round(v) + '°'));

  /* ---- まわりこみ ----
     ここを 動かすと、まっすぐな 板でも「おくが せまい」形に なる。
     絵の すみの のぞき窓を なぞっても おなじ ことが できる。 */
  const orb = v => v === 0 ? 'まっすぐ' : (Math.round(v) + '°');
  box.appendChild(animSlider('よこに まわりこむ', cam, 'ry', -ORBIT_MAX, ORBIT_MAX, 1, orb));
  box.appendChild(animSlider('たてに まわりこむ', cam, 'rx', -ORBIT_MAX, ORBIT_MAX, 1, orb));

  const peek = document.createElement('div');
  peek.className = 'empty';
  peek.style.textAlign = 'left';
  peek.textContent = 'カメラが ある あいだ、絵の 右上に' + NL
    + '「そとから 見た 図」が 出ます。' + NL
    + 'そこを 指で なぞると、どの 行を えらんで いても' + NL
    + 'カメラが ぐるっと まわりこみます。' + NL
    + '2本指で つまんで ひろげると アップ（寄る）、' + NL
    + 'すぼめると 引き（下がる）。マウスの ホイールでも 同じ。' + NL
    + NL
    + 'まわりこむと、レイヤーは おくゆきの ところに 立てた' + NL
    + '「紙」に なります。おくゆきを ちがえた ものほど 大きく ずれます。' + NL
    + 'フォルダは 中身ぜんぶで 1まいの 紙 です。' + NL
    + 'べつべつに 動かしたい ものは フォルダから 出して ください。';
  box.appendChild(peek);

  /* ---- ドリー（前後に 動く）----
     ズーム（画角）との ちがいが 大事な ところ。
     ズームは 絵ぜんたいが 同じだけ 大きく なるだけ だが、
     前後に 動くと 手前と おくで ずれ方が 変わる＝立体に なる。 */
  box.appendChild(heading('前後に 動く（ドリー）'));
  box.appendChild(animSlider('前後に 動く', cam, 'z', DOLLY_MIN, DOLLY_MAX, 0.1,
    v => v === 0 ? 'もとの ところ' : (v > 0 ? '前へ ' : 'うしろへ ') + Math.abs(v).toFixed(1)));
  const dn = document.createElement('div');
  dn.className = 'empty';
  dn.style.textAlign = 'left';
  dn.textContent = 'ズームは レンズだけ 望遠に する ので、' + NL
    + '手前も おくも 同じだけ 大きく なります。' + NL
    + 'ドリーは カメラごと 近づく ので、手前の ものほど' + NL
    + 'はやく 大きく なります（これが 立体に 見える もと）。' + NL
    + NL
    + 'ズームを しぼりながら 前へ 出すと、まわりだけ' + NL
    + 'ぐにゃっと 動く「めまい」の 画に なります。';
  box.appendChild(dn);

  /* ---- 魚眼 ---- */
  box.appendChild(heading('魚眼（ひろがる レンズ）'));
  box.appendChild(animSlider('レンズの ゆがみ', cam, 'fish', -1, 1, 0.05,
    v => Math.abs(v) < 0.03 ? 'ふつうの レンズ'
       : v > 0 ? 'ひろがる ' + Math.round(v * 100) + '%'
               : 'すぼまる ' + Math.round(-v * 100) + '%'));
  const fn3 = document.createElement('div');
  fn3.className = 'empty';
  fn3.style.textAlign = 'left';
  fn3.textContent = 'まん中が ふくらんで、はしが すぼまります。' + NL
    + 'ドアの のぞき穴から 見た かんじ。' + NL
    + 'マイナスに すると 逆に そります。' + NL
    + 'できあがった 絵ぜんたいに かかる ので、' + NL
    + '手前の ものも おくの ものも いっしょに ゆがみます。' + NL
    + 'ピンが うてる ので、寄る ときだけ ぐいっと ひろげる、も できます。';
  box.appendChild(fn3);

  /* ---- 注視点 ---- */
  box.appendChild(heading('注視点（まわる じく）'));
  const aim = !!cam.aim;
  box.appendChild(btnRow(
    button(aim ? '✅ 注視点を つかう' : '⬜ 注視点を つかう', () => {
      edit('注視点', () => {
        cam.aim = !aim;
        if(cam.aim && cam.tx == null){ cam.tx = cx; cam.ty = cy; cam.td = 0; }
      });
      notify(aim ? 'カメラの まん前を じくに もどしました'
                 : '注視点の まわりを まわるように しました');
      onChange();
    })
  ));
  const an = document.createElement('div');
  an.className = 'empty';
  an.style.textAlign = 'left';
  an.textContent = aim
    ? ('この 点の まわりを まわりこみます。' + NL
       + '画面の はしに いる キャラの まわりを ぐるっと 回れます。')
    : ('いまは カメラの まん前が じくです。' + NL
       + '画面の はしの ものを じくに したい ときは オンに。');
  box.appendChild(an);

  if(aim){
    box.appendChild(animSlider('よこ', cam, 'tx', 0, S.proj.w, 1, px));
    box.appendChild(animSlider('たて', cam, 'ty', 0, S.proj.h, 1, px));
    box.appendChild(animSlider('おくゆき', cam, 'td', DEPTH_MIN, DEPTH_MAX, 0.5,
      v => v === 0 ? 'ふつう' : v.toFixed(1)));
    box.appendChild(btnRow(
      button('えらんだ レイヤーに 合わせる', () => {
        const t = selected();
        if(!t || isCam(t)) return notify('先に レイヤーを えらんでね');
        const tv = valuesAt(t, S.time);
        edit('注視点を 合わせる', () => {
          cam.tx = tv.x; cam.ty = tv.y; cam.td = depthOf(t);
          if(hasPins(cam)) ['tx','ty','td'].forEach(
            c => setPin(cam, c, S.time, cam[c], 'smooth'));
        });
        notify('「' + t.name + '」を じくに しました');
        onChange();
      })
    ));
  }

  /* ---- ピンぼけ ---- */
  box.appendChild(heading('ピンぼけ（ピントの ぼかし）'));
  box.appendChild(slider('ぼかしの つよさ', () => cam.dof || 0,
    v => cam.dof = v, 0, 12, 0.5,
    v => v < 0.01 ? 'なし' : v.toFixed(1)));
  box.appendChild(animSlider('ピントの おくゆき', cam, 'fd', DEPTH_MIN, DEPTH_MAX, 0.5,
    v => v === 0 ? 'ふつう' : v.toFixed(1)));
  const fn2 = document.createElement('div');
  fn2.className = 'empty';
  fn2.style.textAlign = 'left';
  fn2.textContent = 'ピントの おくゆきから 離れた 紙ほど ぼけます。' + NL
    + '手前を ぼかして おくを 見せる、の 切りかえも' + NL
    + 'ピントに ピンを うてば できます。' + NL
    + 'のぞき窓に 青い 点線で ピントの めんが 出ます。';
  box.appendChild(fn2);

  /* ---- 手ぶれ ---- */
  box.appendChild(heading('手ぶれ'));
  box.appendChild(slider('ゆれの 大きさ', () => cam.shake || 0,
    v => cam.shake = v, 0, 1, 0.05, v => v < 0.01 ? 'なし' : Math.round(v * 100) + '%'));
  box.appendChild(slider('ゆれの はやさ', () => cam.shakeSpd == null ? 1 : cam.shakeSpd,
    v => cam.shakeSpd = v, 0.2, 4, 0.1, v => v.toFixed(1) + 'ばい'));
  const sn = document.createElement('div');
  sn.className = 'empty';
  sn.style.textAlign = 'left';
  sn.textContent = '手持ちカメラの ゆれです。ピンは いりません。' + NL
    + '時こくから きまる 波なので、何回 書き出しても 同じ ゆれです。';
  box.appendChild(sn);

  /* ---- ざんぞう ---- */
  box.appendChild(heading('ざんぞう（うごきブラー）'));
  box.appendChild(slider('カメラの ざんぞう', () => cam.mblur || 0,
    v => cam.mblur = v, 0, 1, 0.05,
    v => v < 0.01 ? 'なし'
       : (Math.round(v * 100) + '%（' + (0.5 + 2.5 * v).toFixed(1) + 'コマ）')));
  const mn = document.createElement('div');
  mn.className = 'empty';
  mn.style.textAlign = 'left';
  mn.textContent = 'カメラが 動くと 画面ぜんぶが 動く ので、' + NL
    + 'ここを 入れると 絵ぜんぶが まとめて ぶれます。' + NL
    + 'レイヤー 1つずつ 入れて まわらなくて すみます。';
  box.appendChild(mn);


  /* ---- うごかす ----
     スライダーは「ピンが 1本でも あれば」自動で ピンに なる しくみ。
     さいしょの 1本だけは 自分で うつ ひつようが ある ので、
     ここに ボタンを 出す（タイムラインを さがさなくて すむ）。
     ここが 無かった ので、スライダーを 動かしても
     うごきに ならなかった。 */
  const camPins = () => Object.values(cam.tracks || {}).reduce((n, k) => n + k.length, 0);

  const status = document.createElement('div');
  status.className = 'empty';
  status.style.textAlign = 'left';
  const showStatus = () => {
    const n = camPins();
    status.textContent = n
      ? ('いま ピンが ' + n + 'コ。' + NL
         + 'この あとは 時こくを うつして スライダーを 動かすだけで、' + NL
         + 'その 時こくに ピンが つきます。')
      : ('まだ ピンが ありません。' + NL
         + 'まず「◆ ここに ピンを うつ」を おしてください。' + NL
         + 'そのあとは 時こくを うつして スライダーを 動かすだけです。');
  };
  showStatus();

  box.appendChild(field('うごかす', btnRow(
    button('◆ ここに ピンを うつ', () => {
      edit('カメラの ピン', () => {
        ['x', 'y', 'scaleX', 'rot', 'rx', 'ry', ...CAM_CHANNELS].forEach(ch => {
          setPin(cam, ch, S.time, channelValue(cam, ch, S.time), 'smooth');
        });
      });
      showStatus();
      notify('いまの ところに カメラの ピンを うちました');
      onChange();
    }),
    button('🎥 の 行を えらぶ', () => {
      S.sel = cam.id;
      notify('タイムラインの 🎥 の 行を えらびました');
      onChange();
    })
  )));
  box.appendChild(status);

  box.appendChild(btnRow(
    button('まん中に もどす', () => {
      edit('カメラを もどす', () => resetCam(cam, S.proj));
      showStatus();
      notify('カメラを まん中に もどしました');
      onChange();
    })
  ));

  /* ---- みんなの おくゆき ----
     おくゆきは レイヤー 1まいずつの もの だけれど、
     「どれを 手前に、どれを おくに」は ぜんぶ ならべて
     見ないと きめられない。ここに あつめる。 */
  box.appendChild(heading('みんなの おくゆき'));
  const dpn = document.createElement('div');
  dpn.className = 'empty';
  dpn.style.textAlign = 'left';
  dpn.textContent = 'マイナスが 手前、プラスが おく。' + NL
    + 'おくに 置くほど 小さく なって、カメラを ふっても' + NL
    + 'あまり 動かなく なります（これが 立体に 見える もと）。' + NL
    + NL
    + '⚠ おくゆきでは 前後の かさなりは 変わりません。' + NL
    + 'かさなりは タイムラインの ならび順で きまります。' + NL
    + 'キャラを はいけいの うしろに したい ときは、' + NL
    + 'ならびも 下に うつして ください。';
  box.appendChild(dpn);

  /* 出す のは「カメラを 自分で 受けとる」レイヤー。
     ふつうの フォルダは フォルダごと 1つ、
     「バラで 動かす」フォルダは 中身を 1まいずつ。 */
  const depthTargets = [];
  const walk = (parent) => {
    S.proj.layers.forEach(x => {
      if((x.parent || null) !== parent) return;
      if(isCam(x)) return;
      if(isFolder(x) && x.collapse) walk(x.id);
      else depthTargets.push(x);
    });
  };
  walk(null);

  if(!depthTargets.length){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'まだ 絵が ありません';
    box.appendChild(e);
  } else {
    depthTargets.forEach(x => {
      const name = (isFolder(x) ? '📁 ' : '') + (x.name || 'レイヤー');
      box.appendChild(animSlider(name, x, 'depth', DEPTH_MIN, DEPTH_MAX, 0.5,
        v => (v === 0 ? 'ふつう' : (v < 0 ? 'てまえ ' + (-v) : 'おく ' + v))
             + '（' + Math.round(depthScale({ depth: v }) * 100) + '%）'));

      /* ---- カメラに 合わせない（画面に はりつけ）----
         「カメラの せってい」に 無いと 見つけられない と 言われた。
         レイヤーの「かたち」にも あるが、カメラの 話を して いる
         ここにも 出す。どちらを さわっても 同じ もの。 */
      {
        const pb = document.createElement('button');
        const show = () => {
          pb.textContent = x.noCam ? '　📌 画面に はりつけ（カメラに 合わせない）'
                                   : '　🎥 カメラに 合わせる';
          pb.classList.toggle('on', !!x.noCam);
        };
        show();
        pb.style.fontSize = '.7rem';
        pb.style.flex = '1';
        pb.addEventListener('click', () => {
          edit('カメラとの つながり', () => { x.noCam = !x.noCam; });
          show();
          notify(x.noCam ? (x.name || 'これ') + ' は カメラで 動かなく なりました'
                         : (x.name || 'これ') + ' は カメラに 合わせて 動きます');
          onChange();
        });
        box.appendChild(btnRow(pb));
      }

      /* まとめた ままの フォルダは 1つ ぶんしか 出せない。
         中身も 1まいずつ 置きたい 人が 多い ので、ここで 切りかえられる。 */
      if(isFolder(x) && !x.collapse && membersOf(S.proj, x).length){
        const b = button('　└ 中身を バラで 置く（' + membersOf(S.proj, x).length + 'まい）', () => {
          edit('バラで 動かす', () => { x.collapse = true; });
          notify('中身が それぞれの おくゆきで 動くように なりました');
          onChange();
        });
        b.style.fontSize = '.7rem';
        box.appendChild(btnRow(b));
      }
    });
  }

  /* ---- カット割り（カメラを 何台か） ---- */
  const cams = S.proj.layers.filter(isCam);
  box.appendChild(heading('カット割り（カメラ ' + cams.length + '台）'));
  const cn = document.createElement('div');
  cn.className = 'empty';
  cn.style.textAlign = 'left';
  cn.textContent = 'カメラを 何台か おいて、それぞれに' + NL
    + '「出す ところ」を きめると、その 時こくで' + NL
    + 'カメラが 切りかわります ＝ カット割り。' + NL
    + '「出す ところ」を きめて いない カメラは、' + NL
    + 'どこも 当たらない ときの ひかえです。';
  box.appendChild(cn);

  box.appendChild(btnRow(
    button('＋ カメラを もう1台', () => {
      edit('カメラを ふやす', () => {
        const c = newCamLayer(S.proj);
        c.name = 'カメラ' + (cams.length + 1);
        S.proj.layers.unshift(c);
        S.sel = c.id;
      });
      notify(cams.length + 1 + '台めの カメラを つくりました');
      onChange();
      if(back) back();
    })
  ));
  if(cams.length > 1){
    cams.forEach((c, i) => {
      const nowOn = c === cam;
      box.appendChild(btnRow(
        button((nowOn ? '▶ ' : '　') + (c.name || ('カメラ' + (i + 1)))
               + (c.span ? '（' + c.span.from.toFixed(1) + '〜' + c.span.to.toFixed(1) + '秒）'
                         : '（ずっと）'), () => {
          S.sel = c.id;
          notify(c.name + ' を えらびました');
          onChange();
          if(back) back();
        })
      ));
    });
  }
  spanRow(box, cam, back);

  const hint = document.createElement('div');
  hint.className = 'empty';
  hint.style.textAlign = 'left';
  hint.textContent = 'カメラも レイヤーの ひとつです。' + NL
    + 'タイムラインの 🎥 の 行に ピンが ならびます。' + NL
    + 'そこで ピンを 左右に ずらせば、はやさを かえられます。' + NL
    + 'おくゆきは、それぞれの レイヤーの「かたち」で きめます。';
  box.appendChild(hint);
}

/* ---------- ① 出る・消える ---------- */
export function buildEnterSheet(box, back, which){
  const l = selected();
  if(!l) return;
  backRow(box, back);

  const gr = PRESET_GROUPS.find(g => g.key === (which || 'in'));
  if(!gr) return;
  const isLoop = gr.key === 'loop';

  /* 時間の めやすは タブごとに ちがう。
     出る・消える は ぱっと（0.6秒）、ループは ゆっくり（2秒）が ふつう。 */
  const dur = { v: isLoop ? 2 : 0.6 };
  box.appendChild(slider(isLoop ? 'ひとまわりの 時間' : 'かかる時間',
    () => dur.v, v => dur.v = v,
    isLoop ? 0.4 : 0.2, isLoop ? 6 : 3, 0.1,
    v => v.toFixed(1) + '秒'));

  presetGrid(box, gr.list, (p) => {
    edit(p.name, () => p.fn(l, S.time, dur.v));
    notify(p.name + ' を いれました');
    onChange();
  });

  const hint = document.createElement('div');
  hint.className = 'empty';
  hint.style.textAlign = 'left';
  hint.textContent = isLoop
    ? ('いまの時間から くりかえします。' + String.fromCharCode(10) + 'ピンの バーで「🔁ループ」に すると ずっと つづきます。')
    : ('いまの時間から はじまります。' + String.fromCharCode(10) + 'いまの見た目が「おわりの姿」になります。');
  box.appendChild(hint);

  /* かみのゆれ は「ずっと つづく うごき」なので ループの タブに 置く */
  if(isLoop) buildSway(box, l);
}

/* ずっと うごく だけを ひらく 入口（むかしの 呼び出し方に そろえる用） */
export function buildLoopSheet(box, back){
  return buildEnterSheet(box, back, 'loop');
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
  tnote.textContent += NL + NL
    + '🎥 の 行を えらんで から なぞると、カメラが その みちを 通ります' + NL
    + '（アフターエフェクトの「カメラを パスに 沿わせる」）。';
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
    + '（置く・回す・大きさ・ピンの曲げ ぜんぶに 効きます）' + NL
    + NL
    + 'つよさ＝シャッターの 開いて いる 長さ です。' + NL
    + '100%で 3コマぶん。長いほど 尾が のびます。' + NL
    + '何枚 ならすかは、画面で 何ドット 動いたかを 見て' + NL
    + 'じどうで きめます（すじが 出ない ように）。';
  box.appendChild(bnote);
  box.appendChild(slider('ブラーの つよさ',
    () => l.mblur || 0, v => l.mblur = v, 0, 1, 0.05,
    v => v < 0.03 ? 'なし'
       : (Math.round(v * 100) + '%（' + (0.5 + 2.5 * v).toFixed(1) + 'コマ）')));

  /* カメラの ざんぞうは 絵ぜんぶに かかる。
     文字だけは くっきり させたい、が よく ある ので 逃げ道を つける。 */
  const nb = !!l.noMB;
  box.appendChild(btnRow(
    button(nb ? '✅ この レイヤーには かけない' : '⬜ この レイヤーには かけない', () => {
      edit('ざんぞうを かけない', () => { l.noMB = !nb; });
      notify(nb ? 'ざんぞうが かかるように しました'
                : 'この レイヤーは くっきりの ままに しました');
      onChange();
    })
  ));
  const nbn = document.createElement('div');
  nbn.className = 'empty';
  nbn.style.textAlign = 'left';
  nbn.textContent = 'カメラの ざんぞうは 絵ぜんぶに かかります。' + NL
    + 'ここを 入れると、この レイヤーだけ かからなく なります。' + NL
    + '文字が ぶれて 読めない ときに どうぞ。';
  box.appendChild(nbn);

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

  /* ---- あと引き（止まった あとの ゆれ）----
     しゅっと 来て ピタッと 止まる ときに いる もの。
     風の ゆれ（ずっと 同じ はば）とは べつ。 */
  box.appendChild(heading('💨 止まった ときに ゆらす'));
  const an = document.createElement('div');
  an.className = 'empty';
  an.style.textAlign = 'left';
  an.textContent = 'しゅっと 入って きて 止まる ―― そのとき 髪は' + NL
    + 'すぐ 止まらず、いきおいで 先へ 流れて から' + NL
    + 'ゆれながら もどって きます。' + NL
    + '「うごき」の ピンを 見て、止まる ところを さがして' + NL
    + 'そこに 入れます。';
  box.appendChild(an);

  l.after = Object.assign({ amp: 14, period: 0.45, decay: 0.5 }, l.after || {});
  const af = l.after;
  box.appendChild(slider('ゆれの はば', () => af.amp, v => af.amp = v, 2, 40, 1,
    v => Math.round(v) + '°'));
  box.appendChild(slider('ゆれの はやさ', () => af.period, v => af.period = v, 0.15, 1.2, 0.05,
    v => v.toFixed(2) + '秒で 1おうふく'));
  box.appendChild(slider('おさまるまで', () => af.decay, v => af.decay = v, 0.15, 2, 0.05,
    v => afterLen({ decay: v }).toFixed(1) + '秒で 止まる'));

  /* 止まる ところは、自分の うごき か、親（フォルダ）の うごきから さがす。
     カットインは たいてい フォルダごと 動かす ので。 */
  const motionOwner = () => {
    const own = stopTimes(l, valuesAt);
    if(own.length) return { l, stops: own };
    let p = l.parent ? S.proj.layers.find(x => x.id === l.parent) : null;
    let guard = 0;
    while(p && guard++ < 8){
      const st = stopTimes(p, valuesAt);
      if(st.length) return { l: p, stops: st };
      p = p.parent ? S.proj.layers.find(x => x.id === p.parent) : null;
    }
    return null;
  };

  const putAfter = (stops, from) => {
    const dur = afterLen(af);
    edit('あと引き', () => {
      stops.forEach(st => {
        /* いきおいが 強い ほど 大きく ゆれる。250ドット/秒 で ちょうど 1ばい */
        const k = Math.max(0.35, Math.min(2.2, st.speed / 250));
        const opt = { amp: af.amp * k, period: af.period, decay: af.decay,
                      dir: -st.dir, delay: sw.delay, start: st.t };
        if(boned){
          afterKeys(l.pins, opt).forEach(kf => {
            kf.pins.forEach((v, i) => {
              const pin = l.pins[i];
              if(pin.type === 'fix') return;
              setPin(l, pinChX(pin.id), kf.t, v.dx, 'smooth');
              setPin(l, pinChY(pin.id), kf.t, v.dy, 'smooth');
            });
          });
        } else {
          const base = valuesAt(l, st.t).rot;
          const steps = Math.max(8, Math.round(dur / af.period * 10));
          for(let i = 0; i <= steps; i++){
            const local = i / steps * dur;
            const t = +(st.t + local).toFixed(3);
            setPin(l, 'rot', t, base + afterAngle(local, opt), 'smooth');
          }
        }
      });
    });
    notify(stops.length + 'か所（' + from + 'の うごき）に あと引きを 入れました');
    onChange();
  };

  box.appendChild(btnRow(
    button('💨 止まる ところを さがして 入れる', () => {
      const m = motionOwner();
      if(!m) return notify('うごきの ピンが 見つかりません（先に 動かしてね）');
      putAfter(m.stops, m.l === l ? 'じぶん' : '「' + m.l.name + '」');
    }),
    button('◆ いまの ところに 入れる', () => {
      putAfter([{ t: S.time, speed: 250, dir: 1 }], 'いまの 時こく');
    })
  ));

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
    const lv = levels();
    box.appendChild(sub('声が 出ている所だけ 口を動かします。'
      + NL + '大きい声ほど 口を 大きくあけます（コマが3まい以上のとき）。'));

    /* いまの 録音の「しずけさ」と「声」の ひらきを 見せる。
       ここが せまい（10デシベル いか）と、どんな つまみでも
       うまく いかない ―― まわりが うるさすぎる、が 見て 分かる。 */
    const gapDb = Math.round(lv.loud - lv.floor);
    box.appendChild(sub('この 録音は、しずけさと 声の ひらきが '
      + gapDb + 'デシベル。'
      + NL + (gapDb >= 18 ? 'たっぷり あるので うまく いきます。'
            : gapDb >= 10 ? 'まあまあ です。'
            : 'せまい です（まわりの 音が 大きい）。' + NL
              + 'マイクを 近づけて 録り直すと よく なります。')));

    box.appendChild(slider('ひろいやすさ', () => l.voice.sense, v => l.voice.sense = v,
      0.03, 0.4, 0.01,
      v => {
        const t = v <= 0.4 ? v / 0.4 : 1;
        const g = Math.round(3 + t * 15);
        return (v < 0.1 ? 'ささやきも' : v > 0.28 ? '大きい声だけ' : 'ふつう')
             + '（しずけさ +' + g + 'dB）';
      }));
    box.appendChild(slider('口のはやさ', () => l.voice.rate, v => l.voice.rate = v, 4, 16, 1,
      v => Math.round(v) + '/秒'));
    box.appendChild(frameSel('とじた口の絵', () => l.talk.closed, v => l.talk.closed = v));
    box.appendChild(btnRow(
      button('🎤 音から 口パクを つくる', () => {
        const r = voiceMouthKeys({
          frames: l.frames.map((_, i) => i),
          closedFrame: l.talk.closed,
          rate: l.voice.rate, sense: l.voice.sense,
          shift: (S.proj.audio && S.proj.audio.offset) || 0,
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

  /* ---- 💬 セリフ枠 ----
     恋愛ゲームの あの 帯。文字レイヤーと ちがって
     1文字ずつ 出す ので、べつの しくみに して ある。 */
  box.appendChild(heading('💬 セリフ枠（1文字ずつ 出る）'));
  const tnote = document.createElement('div');
  tnote.className = 'empty';
  tnote.style.textAlign = 'left';
  tnote.textContent = '下に 帯を 出して、名前と セリフを 1文字ずつ 出します。' + NL
    + '「ぽぽぽ」と 鳴らしたり、その あいだ キャラの 口を' + NL
    + '動かしたり できます（作った あと せっていで）。';
  box.appendChild(tnote);
  box.appendChild(btnRow(
    button('💬 セリフ枠を つくる', () => {
      beginEdit('セリフ枠を つくる');
      addTalkLayer('セリフ');
      commitEdit();
      onChange();
      /* すぐ 文を 書ける ように、その まま せっていを ひらく */
      openLayer();
    })
  ));

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
    guardSlide(i, () => { set(+i.value); show(); if(!editing) redraw(); });
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

  /* ---- 一文字ずつ（列車） ----
     1まいの 文字を 1字ずつの レイヤーに ばらして、
     なぞった みちを 順ぐりに 通らせる。 */
  if(editing && [...String(t.str || '')].filter(c => c.trim()).length > 1){
    box.appendChild(heading('🚂 一文字ずつ 走らせる'));
    const tn = document.createElement('div');
    tn.className = 'empty';
    tn.style.textAlign = 'left';
    tn.textContent = '文字を 1字ずつの レイヤーに ばらして、' + NL
      + '指で なぞった みちを 列車の ように' + NL
      + '1字ずつ おくれて 通らせます。' + NL
      + 'ばらしても 見た目は 変わりません。' + NL
      + 'もとの 文は 見えなく して のこす ので、' + NL
      + 'あとから 文を 直したく なったら もどせます。';
    box.appendChild(tn);
    box.appendChild(btnRow(
      button('🚂 一文字ずつ みちを なぞる', () => {
        if(closeFn) closeFn();
        onTrain();
      })
    ));
  }

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



/* ================= ぐるり360 =================
   正距円筒（ぐるり1しゅうの 絵）を、その場に 立って 見まわす ように 出す。
   よこ回転・たて回転・ズーム は ふつうの チャンネルなので、
   タイミングピンが うてる＝そのまま 動画に なる。 */
/* ---------- 🔮 球に はる ----------
   絵の よこを ぐるり1しゅう、たてを 上から下 に して 玉に まく。
   ふつうの レイヤーの まま なので、場所・大きさ・親つけ・
   カメラは その まま きく。 */
/* ---------- 💬 セリフ枠 ---------- */
function talkRow(box, l, closeFn){
  if(!isTalk(l)) return;
  const NL = String.fromCharCode(10);
  const t = l.talk || (l.talk = talkDefaults(S.proj));
  const dirty = () => { l._tkKey = null; };

  box.appendChild(heading('💬 セリフ（ここに 書く）'));

  const lead = document.createElement('div');
  lead.className = 'empty';
  lead.style.textAlign = 'left';
  lead.textContent = '下の わくに 書いた 文が、画面の 帯に 1文字ずつ 出ます。' + NL
    + '打つ そばから 画面に 出ます（決定は いりません）。' + NL
    + NL
    + 'あとから 直す ときは' + NL
    + '　タイムラインで この 行（💬 ' + (l.name || 'セリフ') + '）を おして えらび、' + NL
    + '　左の「かたち」を おすと この 画面が 出ます。';
  box.appendChild(lead);

  const who = document.createElement('input');
  who.value = t.who || '';
  who.placeholder = '（なまえ なし）';
  who.addEventListener('focus', () => holdSheet(true));
  who.addEventListener('blur', () => {
    holdSheet(false);
    edit('なまえをかえる', () => { t.who = who.value; dirty(); });
    onChange();
  });
  who.addEventListener('input', () => { t.who = who.value; dirty(); onChange(); });
  box.appendChild(field('だれが', who));

  const ta = document.createElement('textarea');
  ta.value = t.text || '';
  ta.rows = 5;
  ta.placeholder = 'ここに セリフを 書く';
  ta.style.cssText = 'flex:1;min-width:0;font-size:.85rem;line-height:1.6;padding:.4rem';
  /* 打って いる あいだは せっていを 作り直さない。
     作り直すと この わく じたいが 作りなおされて、
     字を 打つ ところが 飛んだり 1文字ずつ 消えたり する。 */
  ta.addEventListener('focus', () => holdSheet(true));
  ta.addEventListener('blur', () => {
    holdSheet(false);
    edit('セリフをかえる', () => { t.text = ta.value; dirty(); });
    onChange();
  });
  /* 打つ たびに 画面へ うつす（作り直しは 上で 止めて ある） */
  ta.addEventListener('input', () => { t.text = ta.value; dirty(); onChange(); });
  box.appendChild(field('セリフ', ta));

  box.appendChild(slider('出る はやさ', () => t.cps || 20,
    v => { t.cps = v; dirty(); }, 4, 60, 1,
    v => Math.round(v) + '文字/秒'));

  /* 読みおわる ための 間。ここが 短いと、出おわった とたん
     つぎに 切りかわって しまって 読めない。 */
  box.appendChild(slider('よいん（読む 間）', () => (t.hold == null ? 1.2 : t.hold),
    v => { t.hold = v; }, 0, 5, 0.1,
    v => v < 0.05 ? 'なし' : v.toFixed(1) + '秒'));
  box.appendChild(btnRow(
    button('📏 文の 長さに 合わせる', () => {
      const v = niceHold(l);
      edit('よいん', () => { t.hold = v; });
      notify('よいんを ' + v.toFixed(1) + '秒に しました');
      onChange();
      if(closeFn) closeFn();
    })
  ));

  const tn = document.createElement('div');
  tn.className = 'empty';
  tn.style.textAlign = 'left';
  const dur = () => (talkEnd(l) - talkStart(l)).toFixed(1);
  tn.textContent = 'はじまりは この レイヤーの「出す ところ」の あたま。' + NL
    + '出おわるまで およそ ' + dur() + '秒、'
    + 'そのあと よいんが ' + (t.hold == null ? 1.2 : t.hold).toFixed(1) + '秒。' + NL
    + '（' + talkStart(l).toFixed(1) + '秒 〜 ' + talkOut(l).toFixed(1) + '秒）';
  box.appendChild(tn);

  box.appendChild(slider('文字の 大きさ', () => t.size,
    v => { t.size = Math.round(v); dirty(); }, 16, Math.round(S.proj.h / 10), 1,
    v => Math.round(v) + 'px'));
  box.appendChild(slider('帯の たかさ', () => t.hRatio,
    v => { t.hRatio = v; dirty(); }, 0.12, 0.6, 0.01,
    v => Math.round(v * 100) + '%'));
  box.appendChild(colorPick('帯の 色', () => t.bg || '#1E1C14',
    v => { t.bg = v; dirty(); }));
  box.appendChild(colorPick('文字の 色', () => t.fg || '#FFFEF7',
    v => { t.fg = v; dirty(); }));
  box.appendChild(slider('帯の すけ具合', () => t.bgAlpha == null ? 0.82 : t.bgAlpha,
    v => { t.bgAlpha = v; dirty(); }, 0, 1, 0.01,
    v => Math.round(v * 100) + '%'));
  box.appendChild(btnRow(
    button(t.box ? '✅ 帯を 出す' : '⬜ 帯を 出す', () => {
      edit('帯', () => { t.box = !t.box; dirty(); });
      onChange(); if(closeFn) closeFn();
    })
  ));

  /* ---- ぽぽぽ ---- */
  box.appendChild(heading('🔈 ぽぽぽ'));
  box.appendChild(btnRow(
    button(t.blip ? '✅ 文字が 出る たびに 鳴らす' : '⬜ 文字が 出る たびに 鳴らす', () => {
      edit('ぽぽぽ', () => { t.blip = !t.blip; });
      onChange(); if(closeFn) closeFn();
    })
  ));
  box.appendChild(slider('何文字ごとに', () => t.blipEvery || 2,
    v => { t.blipEvery = Math.round(v); }, 1, 6, 1,
    v => Math.round(v) + '文字ごと'));
  /* 音の 高さ。低いと おじさん、高いと 子ども っぽく なる。 */
  box.appendChild(slider('音の 高さ', () => t.blipHz || 880,
    v => { t.blipHz = Math.round(v); }, 240, 1800, 20,
    v => Math.round(v) + 'Hz'
       + (v < 450 ? '（ひくい）' : v > 1200 ? '（たかい）' : '')));
  box.appendChild(btnRow(
    button('🔈 ためしに 鳴らす', () => playBlip(0.3, t.blipHz || 880))
  ));
  const bn = document.createElement('div');
  bn.className = 'empty';
  bn.style.textAlign = 'left';
  bn.textContent = 'さいせい中に 鳴ります。書き出す 動画にも 入ります' + NL
    + '（こえが あれば こえに まぜます）。';
  box.appendChild(bn);

  /* ---- かさなりの 見はり ----
     セリフ枠が 時間で かさなると、帯が 2まい 重なって
     そこだけ 暗く なる（1コマ だけ 光って 見える ＝ ちらつき）。 */
  const ov = overlapping(S.proj, l);
  if(ov.length){
    const w = document.createElement('div');
    w.className = 'empty';
    w.style.textAlign = 'left';
    w.textContent = '⚠ ほかの セリフと 時間が かさなって います（'
      + ov.length + 'つ）。' + NL
      + 'かさなると 帯が 2まい 重なって、そこだけ 暗く' + NL
      + 'ちらついて 見えます。';
    box.appendChild(w);
    box.appendChild(btnRow(
      button('🔧 かさなりを なおす', () => {
        const r = { n: 0 };
        edit('かさなりを なおす', () => { r.n = fixOverlaps(S.proj); });
        notify(r.n ? r.n + 'つ ずらしました' : 'ならべ直しました');
        onChange();
        if(closeFn) closeFn();
      })
    ));
  }

  /* ---- つぎの セリフ ---- */
  box.appendChild(heading('➡ つぎの セリフ'));
  box.appendChild(btnRow(
    button('➡ つぎの セリフを 足す', () => {
      beginEdit('つぎの セリフ');
      addNextTalk(l);
      commitEdit();
      onChange();
      openLayer();          // そのまま 文を 書ける ように
    })
  ));
  const nn = document.createElement('div');
  nn.className = 'empty';
  nn.style.textAlign = 'left';
  nn.textContent = 'いまの セリフが 読みおわった（よいんの あと）から はじまる' + NL
    + 'セリフ枠を もう1つ つくります（見た目は そのまま 引きつぎ）。' + NL
    + 'いまの セリフは その ところで おわる ように なるので、' + NL
    + '2つが かさなって 出る ことは ありません。' + NL
    + 'タイミングは タイムラインの「出す ところ」で ずらせます。';
  box.appendChild(nn);

  /* ---- 口パク ---- */
  box.appendChild(heading('👄 口パク'));
  const cands = S.proj.layers.filter(x => x.frames && x.frames.length >= 2);
  if(!cands.length){
    const e = document.createElement('div');
    e.className = 'empty';
    e.style.textAlign = 'left';
    e.textContent = '口の コマ（とじ・あけ）を 2まい いじょう 持った' + NL
      + 'レイヤーが いります。「まとめる」で パラパラに してね。';
    box.appendChild(e);
  } else {
    const sel = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '（えらぶ）';
    sel.appendChild(none);
    cands.forEach(x => {
      const o = document.createElement('option');
      o.value = x.id; o.textContent = x.name + '（' + x.frames.length + 'コマ）';
      if(t.mouth === x.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { t.mouth = sel.value || null; });
    box.appendChild(field('だれの 口', sel));
    box.appendChild(btnRow(
      button('👄 セリフに 合わせて 口を 動かす', () => {
        const target = S.proj.layers.find(x => x.id === t.mouth);
        if(!target) return notify('口の レイヤーを えらんでね');
        const r = { n: 0 };
        edit('口パクを つける', () => { r.n = talkMouthKeys(l, target, setPin); });
        notify(r.n ? r.n + 'か所に ピンを うちました' : 'つけられませんでした');
        onChange();
      })
    ));
    const mn = document.createElement('div');
    mn.className = 'empty';
    mn.style.textAlign = 'left';
    mn.textContent = '「ぽ」と 同じ ところで 口が 開きます。' + NL
      + 'さいごは かならず 口を とじます。' + NL
      + 'やり直す ときは、その レイヤーの コマの ピンを 消してね。';
    box.appendChild(mn);
  }
}

function ballRow(box, l){
  /* box は 中で いれかえる ので let あつかいに する */
  if(isPano(l)) return;
  /* フォルダは 中身を 1まいに まとめて から まく（中身が 材料）。
     ふつうの レイヤーは その 絵が 材料。 */
  if(!isFolder(l) && !(l.frames && l.frames.length)) return;
  const NL = String.fromCharCode(10);
  box.appendChild(heading('🔮 球に はる'));

  const help = document.createElement('div');
  help.className = 'empty';
  help.style.textAlign = 'left';
  help.textContent = (isFolder(l) ? '中身を 1まいに まとめて から 玉に まきます。'
                                  : '絵を まるい 玉に まきます。') + NL
    + 'よこが ぐるり1しゅう、たてが 上から下 です。' + NL
    + '世界地図を まくと 地球ぎ に なります。';
  box.appendChild(help);

  box.appendChild(field('球に はる', (() => {
    const b = document.createElement('button');
    const show = () => {
      b.textContent = ballOn(l) ? '🔮 はって いる' : '□ はって いない';
      b.classList.toggle('on', ballOn(l));
    };
    show();
    b.style.flex = '1';
    b.addEventListener('click', () => {
      edit(ballOn(l) ? '球を やめる' : '球に はる', () => {
        if(ballOn(l)) l.ball.on = false;
        else l.ball = Object.assign(ballDefaults(), l.ball || {}, { on: true });
        l._blKey = null;
      });
      show();
      detail.hidden = !ballOn(l);
      onChange();
    });
    return b;
  })()));

  /* 中みの つまみは 出しっぱなしに して、はって いない ときだけ かくす。
     シートを 開きなおさずに すむ ので、さわり心地が とぎれない。 */
  const detail = document.createElement('div');
  detail.hidden = !ballOn(l);
  box.appendChild(detail);
  const box0 = box;
  box = detail;

  const deg = v => Math.round(v) + '°';
  box.appendChild(animSlider('玉を まわす', l, 'ballY', -720, 720, 1, deg));
  box.appendChild(animSlider('玉を たおす', l, 'ballP', -89, 89, 1, deg));

  /* はって いない ときも つまみは 作る ので、入れ物が 無い ことが ある */
  const B = () => (l.ball = l.ball || Object.assign(ballDefaults(), { on: false }));
  /* 大きさ。1.0 で「絵の みじかい ほうに ぴったり」。
     1.0 より 上に すると わくから はみ出て、画面ぜんたいが 玉に なる。 */
  box.appendChild(slider('玉の 大きさ', () => B().size == null ? 1 : B().size,
    v => { B().size = v; l._blKey = null; }, 0.2, 1.8, 0.05,
    v => v < 0.45 ? 'ちいさめ（' + Math.round(v * 100) + '%）'
       : v > 1.25 ? 'ぜんめん（' + Math.round(v * 100) + '%）'
       : Math.round(v * 100) + '%'));

  /* 貼る 絵の 大きさ。1.0 で 玉 1しゅうに ちょうど 1まい。
     小さく すると まん前に 1まいだけ 小さく のる（シール）。
     大きく すると 絵の 一部だけが 大うつしに なる。 */
  box.appendChild(slider('貼る 絵の 大きさ', () => B().art == null ? 1 : B().art,
    v => { B().art = v; l._blKey = null; l._blSpKey = null; }, 0.2, 4, 0.05,
    v => Math.abs(v - 1) < 0.03 ? 'ちょうど 1しゅう'
       : v < 1 ? 'シール（' + Math.round(v * 100) + '%）'
       : '大うつし（' + Math.round(v * 100) + '%）'));

  box.appendChild(slider('まるみの かげ', () => B().shade == null ? 0.35 : B().shade,
    v => { B().shade = v; l._blKey = null; }, 0, 0.8, 0.01,
    v => v < 0.02 ? 'なし' : Math.round(v * 100) + '%'));
  box.appendChild(slider('あみの こまかさ', () => B().cols || 32,
    v => { B().cols = Math.round(v); B().rows = Math.round(v / 2); l._blKey = null; },
    16, 72, 4, v => Math.round(v) + 'こま'));

  box.appendChild(field('うごきを つける', btnRow(
    button('🔄 ぐるっと1しゅう', () => {
      edit('玉を まわす', () => ballSpinKeys(l, S.proj.duration, 1, false));
      notify('さいしょから おわりまでで 1しゅう します');
      onChange();
    }),
    button('↩ ぎゃくまわり', () => {
      edit('玉を まわす', () => ballSpinKeys(l, S.proj.duration, 1, true));
      notify('ぎゃく に まわります');
      onChange();
    })
  )));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = (isFolder(l)
      ? '玉は 中身が おさまる しかくの 中に ぴったり 入る 円に なります。'
      : '玉は 絵の 中に ぴったり 入る 円に なります。') + NL
    + '「貼る 絵の 大きさ」を 小さく すると、まん前に 1まいだけ' + NL
    + 'シールの ように のります（のこりは 貼りません）。' + NL
    + '大きく すると 絵の 一部だけが 大うつしに なります。' + NL
    + 'つなぎ目を きれいに するには、絵の 左はしと 右はしを' + NL
    + 'つながる ように 描いて ください。' + NL
    + 'あみを こまかく するほど なめらかですが 重くなります。' + NL
    + '（1コマ 作るのに 24こま＝3ms、40こま＝9ms、60こま＝19ms）';
  box.appendChild(note);
  box = box0;
}


function panoRow(box, l){
  if(!isPano(l)) return;
  const NL = String.fromCharCode(10);
  box.appendChild(heading('ぐるり360'));

  const help = document.createElement('div');
  help.className = 'empty';
  help.style.textAlign = 'left';
  help.textContent = '「ぐるり 360°」で 作った 絵です。' + NL
    + 'むきを かえると、その場で 見まわした 絵に なります。' + NL
    + '下の ボタンを おすと ピンが うたれて、動画に なります。';
  box.appendChild(help);

  const deg = v => Math.round(v) + '°';
  box.appendChild(animSlider('よこ回転', l, 'panY', -720, 720, 1, deg));
  box.appendChild(animSlider('たて回転', l, 'panP', -PITCH_MAX, PITCH_MAX, 1, deg));
  box.appendChild(animSlider('ズーム',   l, 'panZ', 25, 130, 1,
    v => v <= 40 ? 'よる（' + Math.round(v) + '°）'
       : v >= 110 ? 'ひろい（' + Math.round(v) + '°）'
       : Math.round(v) + '°'));

  const spin = (label, fn, msg) => button(label, () => {
    edit(label, fn);
    notify(msg);
    onChange();
  });

  box.appendChild(field('うごきを つける', btnRow(
    spin('🔄 ぐるっと1しゅう', () => spinKeys(l, S.proj.duration, 1, false),
      'さいしょから おわりまでで 1しゅう します'),
    spin('👀 見わたす', () => sweepKeys(l, S.proj.duration, 60),
      'ゆっくり 左右に 見わたします')
  )));
  box.appendChild(btnRow(
    spin('🔄 ゆっくり 2しゅう', () => spinKeys(l, S.proj.duration, 2, false),
      '2しゅう します'),
    spin('↩ ぎゃくまわり', () => spinKeys(l, S.proj.duration, 1, true),
      'ぎゃく に まわります'),
    button('むきを もどす', () => {
      edit('ぐるりを もどす', () => {
        const d = panoDefaults();
        Object.assign(l, d);
        ['panY','panP','panZ'].forEach(ch => { if(l.tracks) delete l.tracks[ch]; });
      });
      notify('まっすぐ 前を 見ます');
      onChange();
    })
  ));

  const note = document.createElement('div');
  note.className = 'empty';
  note.style.textAlign = 'left';
  note.textContent = 'ピンを うった あとは、タイムラインで 速さを 直せます。' + NL
    + 'ほかの レイヤーは この 上に かさなるので、' + NL
    + 'キャラクターを おいて いっしょに 動かせます。';
  box.appendChild(note);
}

/* ---------- 見た目（塗り・ぼかし・ふちどり） ----------
   ふつうのレイヤーでも フォルダでも 同じものが使える。
   フォルダは 中身を1まいにまとめてから かかるので、
   中に何まい入っていても ふちは 外側にだけ出る。 */
export function buildLook(box, l, opts){
  const NL = String.fromCharCode(10);
  const closeLook = opts && opts.close;
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

  /* ---- ✂ マスク ----
     クリップは「べつの レイヤーの 形」で ぬく。
     マスクは「自分に かいた 形」で ぬく。抜き型の 絵を
     用意しなくて いい ぶん、その場で さっと できる。 */
  box.appendChild(heading('✂ マスク（形で 切りぬく）'));
  const hasMask = !!(l.mask && l.mask.pts && l.mask.pts.length >= 3);
  const mnote = document.createElement('div');
  mnote.className = 'empty';
  mnote.style.textAlign = 'left';
  mnote.textContent = hasMask
    ? ('かこんだ 形で 切りぬいて います。' + NL
       + (isFolder(l)
          ? 'フォルダの マスクは 画面に すわった まま です。'
          : 'マスクは 絵に くっついて いる ので、動かしても' + NL
            + 'まわしても ついて まわります。'))
    : ('絵の 上を 指で ぐるっと かこむと、その 中だけ 出ます。' + NL
       + 'かこんだ 形は ' + (isFolder(l) ? '画面に すわります。' : '絵に くっつきます。'));
  box.appendChild(mnote);

  box.appendChild(btnRow(
    button(hasMask ? '✂ かこみ直す' : '✂ 形を かこむ', () => {
      if(closeLook) closeLook();
      onMask(l);
    })
  ));

  if(hasMask){
    box.appendChild(btnRow(
      button(l.mask.invert ? '✅ うら返す（中を かくす）' : '⬜ うら返す（中を かくす）', () => {
        edit('マスクを うら返す', () => { l.mask.invert = !l.mask.invert; });
        onChange();
      }),
      button('🗑 マスクを けす', () => {
        edit('マスクを けす', () => { l.mask = null; });
        notify('マスクを けしました');
        onChange();
      })
    ));
    box.appendChild(slider('ふちを ぼかす',
      () => (l.mask.feather || 0), v => { l.mask.feather = v; l._maskKey = null; },
      0, 80, 1, v => v < 0.5 ? 'くっきり' : Math.round(v) + 'px'));
  }

  /* ---- ✨ ひかり（グロー）と 🌑 かげ ----
     どちらも 絵の 形を ぼかして 色を ぬって 下に 敷く だけ。
     ふちどりの やわらかい ばん。 */
  box.appendChild(heading('✨ ひかり'));
  box.appendChild(colorPick('ひかりの色',
    () => (l.glow && l.glow.color) || '#FFF2A8',
    v => { l.glow = l.glow || { color:'#FFF2A8', amount:0, size:24 }; l.glow.color = v; }));
  box.appendChild(animSlider('ひかりの つよさ', l, 'glowAmt', 0, 1, 0.02,
    v => v < 0.02 ? 'なし' : pct(v)));
  box.appendChild(slider('ひかりの 大きさ',
    () => (l.glow && l.glow.size != null) ? l.glow.size : 24,
    v => { l.glow = l.glow || { color:'#FFF2A8', amount:0, size:24 }; l.glow.size = v; },
    2, 120, 1, v => Math.round(v) + 'px'));

  box.appendChild(heading('🌑 かげ'));
  box.appendChild(colorPick('かげの色',
    () => (l.shadow && l.shadow.color) || '#1E1C14',
    v => { l.shadow = l.shadow || { color:'#1E1C14', amount:0, x:14, y:18, blur:12 }; l.shadow.color = v; }));
  box.appendChild(animSlider('かげの こさ', l, 'shadowAmt', 0, 1, 0.02,
    v => v < 0.02 ? 'なし' : pct(v)));
  const shd = (key, label, min, max) => slider(label,
    () => (l.shadow && l.shadow[key] != null) ? l.shadow[key]
        : (key === 'x' ? 14 : key === 'y' ? 18 : 12),
    v => { l.shadow = l.shadow || { color:'#1E1C14', amount:0, x:14, y:18, blur:12 }; l.shadow[key] = v; },
    min, max, 1, v => Math.round(v) + 'px');
  box.appendChild(shd('x', 'よこに ずらす', -120, 120));
  box.appendChild(shd('y', 'たてに ずらす', -120, 120));
  box.appendChild(shd('blur', 'かげの ぼかし', 0, 80));
  box.appendChild(slider('かげを なめらかに',
    () => (l.shadow && l.shadow.soft != null) ? l.shadow.soft : 6,
    v => { l.shadow = l.shadow || { color:'#1E1C14', amount:0, x:14, y:18, blur:12 };
           l.shadow.soft = v; },
    0, 30, 1, v => v < 0.5 ? '絵の まま' : Math.round(v) + 'px'));
  const sfn = document.createElement('div');
  sfn.className = 'empty';
  sfn.style.textAlign = 'left';
  sfn.textContent = 'かげは 絵の 形を そのまま つかう ので、' + NL
    + '筆の ガサガサした ふちが そのまま 出ます。' + NL
    + 'ここを 上げると、かげに する 形だけ なだらかに して' + NL
    + 'すっきりした かげに なります（絵は そのまま）。';
  box.appendChild(sfn);

  /* ---- 🎨 色の 調整 ---- */
  box.appendChild(heading('🎨 色の 調整'));
  const adj = (ch, label, min, max, step, fmt, def) => animSlider(label, l, ch, min, max, step, fmt);
  box.appendChild(adj('bright',   'あかるさ',   0.2, 2, 0.01, pct));
  box.appendChild(adj('contrast', 'くっきり',   0.2, 2, 0.01, pct));
  box.appendChild(adj('sat',      'あざやかさ', 0,   2, 0.01, pct));
  box.appendChild(adj('hue',      '色あい',  -180, 180, 1, v => v === 0 ? 'そのまま' : Math.round(v) + '°'));

  const adjRow = document.createElement('div');
  adjRow.className = 'rowbtns';
  adjRow.style.flexWrap = 'wrap';
  [['もとに もどす', { bright:1, contrast:1, sat:1, hue:0 }],
   ['ゆうがた',      { bright:1.02, contrast:1.05, sat:1.15, hue:-14 }],
   ['よる',          { bright:0.62, contrast:1.12, sat:0.7,  hue:18 }],
   ['セピア',        { bright:1.05, contrast:0.95, sat:0.35, hue:-24 }],
   ['あせた 色',     { bright:1.08, contrast:0.85, sat:0.55, hue:0 }]
  ].forEach(([label, set]) => {
    const b = button(label, () => {
      edit('色の 調整', () => {
        Object.keys(set).forEach(k2 => {
          l[k2] = set[k2];
          if(hasPins(l)) setPin(l, k2, S.time, set[k2], 'smooth');
        });
      });
      onChange();
    });
    b.style.flex = '0 0 30%';
    adjRow.appendChild(b);
  });
  box.appendChild(field('めやす', adjRow));

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

let onTrain = () => {};
export function setTrainer(fn){ onTrain = fn; }

let onCam = () => {};
export function setCamOpener(fn){ onCam = fn; }

/* えらんで いる レイヤーの せっていを ひらく（作った 直後に つかう） */
let openLayer = () => {};
export function setLayerOpener(fn){ openLayer = fn; }

let onMask = () => {};
export function setMasker(fn){ onMask = fn; }

let onAudioSync = () => {};
export function setAudioSync(fn){ onAudioSync = fn; }

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

  /* ---- 画質 ----
     玉や 部屋は 三角を たくさん 貼る ので、つまみを 動かして いる
     あいだ だけ あらく すると 手ざわりが 軽く なる。
     書き出す ときは いつも きれい（ここは 作って いる あいだの 話）。 */
  box.appendChild(heading('画質（作って いる あいだ）'));
  const qrow = document.createElement('div');
  qrow.className = 'rowbtns';
  const QS = [
    ['fine',  '✨ いつも きれい'],
    ['auto',  '🪄 さわる 間だけ かるく'],
    ['light', '🍃 いつも かるく']
  ];
  QS.forEach(([k, lb]) => {
    const b = button(lb, () => {
      edit('画質をかえる', () => { S.proj.quality = k; });
      onChange();
      if(closeFn) closeFn();
    });
    b.style.flex = '1';
    b.classList.toggle('on', (S.proj.quality || 'auto') === k);
    qrow.appendChild(b);
  });
  box.appendChild(qrow);
  const qn = document.createElement('div');
  qn.className = 'empty';
  qn.style.textAlign = 'left';
  qn.textContent = '玉・部屋の あみを あらく します。' + NL
    + 'つまみを はなすと すぐ きれいに 描き直します。' + NL
    + '書き出す 動画は いつも きれいです。' + NL
    + '（実測: 玉 1コマ 6.1ms → あらいと 1.6ms）';
  box.appendChild(qn);

  /* ---- 枠の そと ----
     書き出す 動画は 枠の 中だけ。作って いる あいだだけの 話。 */
  /* ---------- 📌 カメラに 合わせない ----------
     レイヤーの「かたち」にも 🎥カメラ の 中にも 置いたが、
     さがす とき まず ⚙せってい を 見る と 言われた。
     ここにも ぜんぶ ならべて、1つの 画面で 切りかえられる ように する。
     さわって いる ものは どこも 同じ（l.noCam）。 */
  box.appendChild(heading('📌 カメラに 合わせない もの'));
  {
    const pn = document.createElement('div');
    pn.className = 'empty';
    pn.style.textAlign = 'left';
    pn.textContent = '📌 に した ものは、カメラの ふれ・よせ・まわりこみを' + NL
      + 'ぜんぶ うけません（いつも 同じ ところに 出ます）。' + NL
      + 'セリフ枠・ロゴ・字まく むけ。';
    box.appendChild(pn);

    const rows = [];
    const walk = (parent, depth) => {
      S.proj.layers.forEach(x => {
        if((x.parent || null) !== parent) return;
        if(isCam(x)) return;
        rows.push({ x, depth });
        if(isFolder(x)) walk(x.id, depth + 1);
      });
    };
    walk(null, 0);

    if(!rows.length){
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'まだ 絵が ありません';
      box.appendChild(e);
    } else {
      rows.forEach(({ x, depth }) => {
        const b = document.createElement('button');
        const pad = depth ? '　'.repeat(depth) + '└ ' : '';
        const show = () => {
          b.textContent = pad + (x.noCam ? '📌 ' : '🎥 ')
            + (isFolder(x) ? '📁 ' : '') + (x.name || 'レイヤー');
          b.classList.toggle('on', !!x.noCam);
        };
        show();
        b.style.flex = '1';
        b.style.textAlign = 'left';
        b.addEventListener('click', () => {
          edit('カメラとの つながり', () => { x.noCam = !x.noCam; });
          show();
          notify(x.noCam ? (x.name || 'これ') + ' は カメラで 動かなく なりました'
                         : (x.name || 'これ') + ' は カメラに 合わせて 動きます');
          onChange();
        });
        box.appendChild(btnRow(b));
      });
    }
  }

  box.appendChild(heading('枠の そと'));
  const outOn = S.outside !== false;
  box.appendChild(btnRow(
    button(outOn ? '✅ 枠の そとも 見せる' : '⬜ 枠の そとも 見せる', () => {
      S.outside = !outOn;
      notify(outOn ? '枠の 中だけ 見せます' : '枠の そとも 見せます');
      onChange();
      if(closeFn) closeFn();
    })
  ));
  const onote = document.createElement('div');
  onote.className = 'empty';
  onote.style.textAlign = 'left';
  onote.textContent = '枠の そとに いる ものを、うすく 出します。' + NL
    + '「画面の そとから 走って くる」「そとへ 出て いく」を' + NL
    + '作る とき、そとで どこに いるかが 見えます。' + NL
    + '書き出す 動画は いままでどおり 枠の 中だけ です。' + NL
    + '画面を つまんで 小さく すれば、そとが 広く 見えます。';
  box.appendChild(onote);

  /* ---- 紙の 方眼 ---- */
  box.appendChild(heading('紙の 方眼'));
  const dotOn = S.paperDots !== false;
  box.appendChild(btnRow(
    button(dotOn ? '✅ うすい 点を 出す' : '⬜ うすい 点を 出す', () => {
      S.paperDots = !dotOn;
      notify(dotOn ? '点を 消しました' : '点を 出しました');
      onChange();
      if(closeFn) closeFn();
    })
  ));
  const dnote = document.createElement('div');
  dnote.className = 'empty';
  dnote.style.textAlign = 'left';
  dnote.textContent = '紙の 上に 出て いる うすい 点は 目やす です。' + NL
    + '書き出す 動画には 入りません（まっさらな 紙に なります）。' + NL
    + '大きく して 見て いると 目に つく ので、' + NL
    + 'じゃまな ときは ここで 消せます。';
  box.appendChild(dnote);

  /* ---- 動画の長さ ----
     3〜120秒を つまみ 1本に すると、1秒が 1ドットも 無くて
     ショート（10秒いか）を 作る ときに まったく 合わせられない。
     ボタンで 1秒ずつ・0.5秒ずつ 動かせる ように して、
     つまみは よく つかう 3〜60秒 に しぼる。 */
  box.appendChild(heading('動画の長さ'));

  const durVal = document.createElement('div');
  durVal.className = 'empty';
  durVal.style.textAlign = 'left';
  const setDur = (v) => {
    const n = Math.max(1, Math.min(300, Math.round(v * 2) / 2));
    edit('長さをかえる', () => {
      S.proj.duration = n;
      if(S.time > n) S.time = n;
    });
    showDur();
    onChange();
  };
  function showDur(){
    const d = S.proj.duration;
    durVal.textContent = 'いまの 長さ … ' + (Number.isInteger(d) ? d : d.toFixed(1)) + '秒'
      + (d >= 60 ? '（' + (d / 60).toFixed(1) + '分）' : '');
  }
  showDur();
  box.appendChild(durVal);

  box.appendChild(btnRow(
    button('− 1秒',   () => setDur(S.proj.duration - 1)),
    button('− 0.5秒', () => setDur(S.proj.duration - 0.5)),
    button('+ 0.5秒', () => setDur(S.proj.duration + 0.5)),
    button('+ 1秒',   () => setDur(S.proj.duration + 1))
  ));

  const durRow = document.createElement('div');
  durRow.className = 'rowbtns';
  durRow.style.flexWrap = 'wrap';
  [3, 5, 6, 8, 10, 15, 20, 30, 60].forEach(sec => {
    const b = button(sec + '秒', () => setDur(sec));
    b.style.flex = '0 0 30%';
    b.classList.toggle('on', Math.abs(S.proj.duration - sec) < 0.01);
    durRow.appendChild(b);
  });
  box.appendChild(field('よく つかう', durRow));

  box.appendChild(slider('つまみで',
    () => Math.min(60, S.proj.duration),
    v => { S.proj.duration = v; if(S.time > v) S.time = v; showDur(); },
    1, 60, 0.5, v => (Number.isInteger(v) ? v : v.toFixed(1)) + '秒'));

  const dlong = document.createElement('div');
  dlong.className = 'empty';
  dlong.style.textAlign = 'left';
  dlong.textContent = 'つまみは 60秒まで。それより 長く したい ときは' + NL
    + '「＋1秒」を おしてね（300秒まで）。';
  box.appendChild(dlong);

  audioRows(box, closeFn);
}

/* ================= おと =================
   「どうがの せってい」と、タイムラインの 🔊 の 行、どちらからも 出す。 */
export function audioRows(box, closeFn){
  const NL = String.fromCharCode(10);
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
    box.appendChild(slider('はじまりを ずらす',
      () => S.proj.audio.offset || 0,
      v => { S.proj.audio.offset = v; onChange(); },
      0, Math.max(1, S.proj.duration), 0.05,
      v => v < 0.01 ? '0秒（あたま から）' : v.toFixed(2) + '秒'));
  }

  const apick = document.createElement('input');
  apick.type = 'file';
  apick.accept = 'audio/*';
  apick.hidden = true;
  apick.addEventListener('change', async (e) => {
    await onAudioFile(e.target.files);
    e.target.value = '';
    onAudioSync();
    onChange();
  });
  box.appendChild(apick);

  box.appendChild(btnRow(
    button(hasAudio() ? '🎤 音を えらびなおす' : '🎤 音を 読みこむ', () => apick.click()),
    button('音を けす', () => {
      if(!hasAudio()) return notify('まだ 音は ありません');
      clearAudio();
      S.proj.audio = null;
      onAudioSync();
      notify('音を けしました');
      onChange();
    })
  ));

  /* ---------- 🎙 その場で 録音 ---------- */
  box.appendChild(heading('🎙 じぶんの こえで しゃべらせる'));
  const rn = document.createElement('div');
  rn.className = 'empty';
  rn.style.textAlign = 'left';
  rn.textContent = 'マイクで 録って、こえの 高さを かえて、' + NL
    + 'その まま キャラに しゃべらせられます。' + NL
    + '録ったあと「かお」で 口パクを 作ると、' + NL
    + '声に あわせて 口が 動きます。';
  box.appendChild(rn);

  const recBtn = button(isRecording() ? '■ とめる' : '🎙 録音する', async () => {
    try{
      if(isRecording()){
        recBtn.textContent = '…よみこみ中';
        await stopRec('じぶんの こえ');
        S.proj.audio = S.proj.audio || { volume: 1, offset: 0 };
        S.proj.audio.name = AUD.name;
        onAudioSync();
        notify('録れました。こえの 高さも かえられます');
        onChange();
        if(closeFn) closeFn();
      } else {
        await startRec();
        recBtn.textContent = '■ とめる';
        recBtn.classList.add('on');
        notify('録音中… もう一度 おすと とまります');
      }
    }catch(err){
      cancelRec();
      recBtn.textContent = '🎙 録音する';
      recBtn.classList.remove('on');
      notify(err.message || '録音できませんでした');
    }
  });
  box.appendChild(btnRow(recBtn));

  /* ---------- こえの 高さ ---------- */
  if(hasAudio()){
    box.appendChild(heading('こえの 高さ'));
    const ph = document.createElement('div');
    ph.className = 'empty';
    ph.style.textAlign = 'left';
    const showPh = () => {
      const n = AUD.semi || 0;
      ph.textContent = (n === 0 ? 'もとの こえの まま。'
                       : (n > 0 ? '+' : '') + n + '半音 ' + (n > 0 ? '高く' : 'ひくく') + ' して います。')
        + NL + (AUD.keepLen === false
            ? 'はやさごと かえて います（テープの 早回し）。長さも かわります。'
            : '長さは そのまま なので、口パクの タイミングは ずれません。');
    };
    showPh();
    box.appendChild(ph);

    const applyPitch = (n, keep) => {
      onBusy(true, 'こえを かえて います…');
      setTimeout(() => {
        try{ setPitch(n, keep); showPh(); onChange(); }
        catch(err){ notify('うまく いきませんでした'); }
        onBusy(false);
      }, 30);
    };

    box.appendChild(slider('高さ（半音）',
      () => AUD.semi || 0,
      v => applyPitch(Math.round(v), AUD.keepLen !== false),
      -12, 12, 1,
      v => v === 0 ? 'そのまま' : ((v > 0 ? '+' : '') + Math.round(v))));

    const prow = document.createElement('div');
    prow.className = 'rowbtns';
    prow.style.flexWrap = 'wrap';
    [['もとの こえ', 0], ['ちょい高め', 3], ['子ども', 7], ['ちょい低め', -3], ['おじさん', -7]]
      .forEach(([lb, n]) => {
        const b = button(lb, () => applyPitch(n, AUD.keepLen !== false));
        b.style.flex = '0 0 30%';
        b.classList.toggle('on', (AUD.semi || 0) === n);
        prow.appendChild(b);
      });
    box.appendChild(field('めやす', prow));

    box.appendChild(btnRow(
      button(AUD.keepLen === false ? '✅ はやさごと かえる' : '⬜ はやさごと かえる', () => {
        applyPitch(AUD.semi || 0, AUD.keepLen === false);
        if(closeFn) closeFn();
      })
    ));
    const kn = document.createElement('div');
    kn.className = 'empty';
    kn.style.textAlign = 'left';
    kn.textContent = 'はやさごと ＝ テープの 早回し。いちばん きれいに' + NL
      + 'かわるけれど、長さも かわります。' + NL
      + '切って あると、長さは そのまま で 高さだけ かわります' + NL
      + '（つぶに 切って 貼り直す やり方）。';
    box.appendChild(kn);
  }

}

/* ================= はいけい =================
   はいけいのことだけ。動画の長さや 音は 「どうがの せってい」に ある。 */
/* かべ 6面。1面ずつ 絵を えらぶ */
function roomFaces(box, room){
  ROOM_FACES.forEach(fc => {
    const has = room.faces && room.faces[fc.key];
    const pick = document.createElement('input');
    pick.type = 'file';
    pick.accept = 'image/*';
    pick.hidden = true;
    pick.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if(!f) return;
      try{
        onBusy(true, fc.name + ' を よみこんでいます…');
        const src = await readAsDataURL(f);
        const im = await loadImage(src);
        beginEdit(fc.name + ' を はる');
        const id = addAsset(fc.name, src, im.naturalWidth, im.naturalHeight, im);
        room.faces = room.faces || {};
        room.faces[fc.key] = id;
        room._rmKey = null;
        commitEdit();
        notify(fc.name + ' に はりました');
        onChange();
      }catch(err){
        notify('よみこめませんでした');
      }finally{
        onBusy(false);
      }
    });
    box.appendChild(pick);

    const row = document.createElement('div');
    row.className = 'rowbtns';
    const b = button((has ? '✅ ' : '⬜ ') + fc.name, () => pick.click());
    b.style.flex = '1';
    row.appendChild(b);
    if(has){
      const x = button('はずす', () => {
        edit(fc.name + ' を はずす', () => {
          delete room.faces[fc.key];
          room._rmKey = null;
        });
        onChange();
      });
      x.style.flex = '0 0 5rem';
      row.appendChild(x);
    }
    box.appendChild(row);
  });
}

export function buildBgSheet(box, closeFn){
  const NL = String.fromCharCode(10);

  /* ---------- 🏠 部屋 ----------
     6まいの 絵を はこの 内がわに はって、その まん中から 見まわす。
     天じょう・かべを レイヤーで 1まいずつ たおして 作ると
     つなぎ目が 合わないので、はこ 1つ として まとめて 出す。 */
  box.appendChild(heading('🏠 部屋（はこの 中）'));
  const room = S.proj.layers.find(isRoom);
  const rn = document.createElement('div');
  rn.className = 'empty';
  rn.style.textAlign = 'left';
  rn.textContent = room
    ? ('いま「' + room.name + '」が 入っています。' + NL
       + 'かべの 絵を えらぶと、その 面に はられます。' + NL
       + 'むきや ひろさは、下の つまみで かえられます。')
    : ('おく・ひだり・みぎ・天じょう・ゆか・うしろ の 6まいを' + NL
       + 'はこの 内がわに はって、まん中から 見まわします。' + NL
       + '入れたい 面だけで だいじょうぶ（入れない 面は 出ません）。' + NL
       + 'カメラの「まわりこみ」で 首を ふり、「よせ」で おくへ 進みます。');
  box.appendChild(rn);

  if(!room){
    box.appendChild(btnRow(
      button('🏠 部屋を つくる', () => {
        beginEdit('部屋を つくる');
        addRoomLayer('部屋');
        commitEdit();
        notify('部屋を つくりました。かべの 絵を えらんでね');
        onChange();
      })
    ));
  } else {
    roomFaces(box, room);
    const deg = v => Math.round(v) + '°';
    box.appendChild(animSlider('よこ回転', room, 'roomY', -720, 720, 1, deg));
    box.appendChild(animSlider('たて回転', room, 'roomP', -85, 85, 1, deg));
    box.appendChild(animSlider('ズーム',   room, 'roomZ', 25, 130, 1, deg));
    box.appendChild(slider('はこの よこ幅', () => room.rw || S.proj.w,
      v => { room.rw = Math.round(v); room._rmKey = null; },
      200, 4000, 20, v => Math.round(v) + 'px'));
    box.appendChild(slider('はこの たかさ', () => room.rh || S.proj.h,
      v => { room.rh = Math.round(v); room._rmKey = null; },
      200, 4000, 20, v => Math.round(v) + 'px'));
    box.appendChild(slider('はこの おくゆき', () => room.rd || S.proj.w,
      v => { room.rd = Math.round(v); room._rmKey = null; },
      200, 6000, 20, v => Math.round(v) + 'px'));
    box.appendChild(slider('あみの こまかさ', () => room.mesh1 || 10,
      v => { room.mesh1 = Math.round(v); room._rmKey = null; },
      4, 24, 1, v => Math.round(v) + 'こま'));

    const rnote = document.createElement('div');
    rnote.className = 'empty';
    rnote.style.textAlign = 'left';
    rnote.textContent = 'はこを 大きく するほど、かべが 遠くなります。' + NL
      + 'おくゆきを ながく すると、ろうか みたいに なります。' + NL
      + 'カメラを 足すと、まわりこみ で 首ふり・よせ で 前進 に なります。';
    box.appendChild(rnote);
  }

  /* ---------- ぐるり360 ----------
     「ぐるり 360°」で かいた 絵を いれると、
     その場に 立って 見まわす はいけいに なる。 */
  box.appendChild(heading('ぐるり360の 絵'));
  const pano = S.proj.layers.find(isPano);
  const pn = document.createElement('div');
  pn.className = 'empty';
  pn.style.textAlign = 'left';
  pn.textContent = pano
    ? ('いま「' + pano.name + '」が 入っています。' + NL
       + 'むきや うごきは、そのレイヤーの「かたち」で かえられます。')
    : ('「ぐるり 360°」で 作った 絵（よこが たての 2ばいの 絵）を いれると、' + NL
       + 'その場で 見まわす はいけいに なります。' + NL
       + 'ぐるっと まわす ボタンを おすだけで 動画に できます。');
  box.appendChild(pn);

  const ppick = document.createElement('input');
  ppick.type = 'file';
  ppick.accept = 'image/*';
  ppick.hidden = true;
  ppick.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!f) return;
    try{
      onBusy(true, 'ぐるりの 絵を よみこんでいます…');
      const src = await readAsDataURL(f);
      const im = await loadImage(src);
      const ratio = im.naturalWidth / Math.max(1, im.naturalHeight);
      beginEdit('ぐるり360を いれる');
      const l = addPanoLayer(f.name.replace(/\.[a-z0-9]+$/i, '') || 'ぐるり360', src, im);
      commitEdit();
      notify(ratio < 1.6 || ratio > 2.4
        ? 'いれました（よこが たての 2ばいの 絵だと きれいです）'
        : 'ぐるり360を いれました');
      onChange();
      if(closeFn) closeFn();
    }catch(err){
      notify('よみこめませんでした（' + (err && err.message || '') + '）');
    }finally{
      onBusy(false);
    }
  });
  box.appendChild(ppick);
  box.appendChild(btnRow(
    button(pano ? '🌐 べつの 絵に する' : '🌐 ぐるり360の 絵を いれる', () => ppick.click())
  ));

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
  const train = S.train;                 // 列車ごっこ 中なら 文字の ならび
  const l = train ? train.chars[0] : selected();
  if(!l || !pts || pts.length < 2){
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'みちが ありません';
    box.appendChild(e);
    return;
  }

  S.proj.path = S.proj.path || { dur: 2, ease: 'linear', count: 24 };
  const P = S.proj.path;
  if(P.gap == null) P.gap = 0.12;
  if(P.orient == null) P.orient = false;
  if(P.orientOff == null) P.orientOff = 0;
  if(P.only == null) P.only = true;
  if(P.mb == null) P.mb = 0;
  /* 車間は なぞった みちの 長さで 意味が 変わる ので、
     なぞる たびに 見つもり直す（前の みちの 値を ひきずらない） */
  if(P.gapFor !== (pts && pts.length) + ':' + Math.round(pathLength(pts))){
    P.gapPx = null;
    P.gapFor = (pts && pts.length) + ':' + Math.round(pathLength(pts));
  }
  /* 車間は「みちの 上で 何ドット あける か」。
     秒で きめると、ゆっくり 走らせた とき 車間も つまって
     文字が 団子に なって しまう。
     はじめの 値は 字の 大きさ ＝ ちょうど つながって 見える あき。 */
  if(train && P.gapPx == null){
    const c0 = train.chars[0];
    const sz = (c0.text && c0.text.size) || 100;
    P.gapPx = Math.round(sz * (c0.scaleX == null ? 1 : c0.scaleX));
  }

  const len = Math.round(pathLength(pts));
  const info = document.createElement('div');
  info.className = 'empty';
  info.style.textAlign = 'left';
  const showInfo = () => {
    info.textContent = (train
        ? ('🚂 ' + train.chars.length + '文字が この みちを 通ります。')
        : ('「' + l.name + '」が この みちを 通ります。')) + NL
      + 'みちの 長さ ' + len + 'ドット／' + P.dur.toFixed(1) + '秒'
      + '（1秒に ' + Math.round(len / Math.max(0.1, P.dur)) + 'ドット）'
      + (train
        ? (NL + '車間 ' + Math.round(P.gapPx || 0) + 'ドット'
             + '（' + ((P.gapPx || 0) / Math.max(1, len) * P.dur).toFixed(2) + '秒 おくれ）'
             + NL + '最後の 字が 着くのは '
             + (P.dur + (P.gapPx || 0) / Math.max(1, len) * P.dur * (train.chars.length - 1)).toFixed(1) + '秒後'
             + ((P.gapPx || 0) * (train.chars.length - 1) > len
                ? (NL + '⚠ 車間が みちより 長いです。みちを 長く するか 車間を せまく。')
                : ''))
        : '');
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

  /* ---- 頭の むき ----
     ふたつ ある。
       ・そのまま  … ずっと 同じ むきの まま すべって いく
       ・むきを かえる … 進む ほうへ 頭を むけて 進む（車・魚・矢）
     どちらが ほしいかは 絵しだい なので、えらべる ように して ある。 */
  const reopen = () => { if(closeFn) closeFn(); onChange(); setTimeout(() => reopenPath(), 0); };

  box.appendChild(heading('頭の むき'));
  const ors = document.createElement('div');
  ors.className = 'rowbtns';
  [['そのまま', false], ['進む むきに むける', true]].forEach(([lb, on]) => {
    const b = button(lb, () => { P.orient = on; reopen(); });
    b.style.flex = '1';
    b.classList.toggle('on', !!P.orient === on);
    ors.appendChild(b);
  });
  box.appendChild(ors);

  if(P.orient){
    /* 絵の どっちが「前」か。
       右むきに かいた 絵なら 右、上むきに かいた 絵（ロケットなど）なら 上。 */
    const fr = document.createElement('div');
    fr.className = 'rowbtns';
    fr.style.flexWrap = 'wrap';
    [['▶ 右', 0], ['▲ 上', -90], ['◀ 左', 180], ['▼ 下', 90]].forEach(([lb, off]) => {
      const b = button(lb, () => { P.orientOff = off; reopen(); });
      b.style.flex = '0 0 22%';
      b.classList.toggle('on', (P.orientOff || 0) === off);
      fr.appendChild(b);
    });
    box.appendChild(field('絵の 前は どっち', fr));
  }

  const on2 = document.createElement('div');
  on2.className = 'empty';
  on2.style.textAlign = 'left';
  on2.textContent = P.orient
    ? ('進む ほうへ 頭を むけて 進みます。' + NL
       + 'まがり角でも 頭が ついて まわります。' + NL
       + '「前は どっち」は、絵が もともと むいて いる ほうを えらんで ください。')
    : ('ずっと 同じ むきの まま 進みます。' + NL
       + '足が 下、頭が 上の まま すべって いきます。');
  box.appendChild(on2);

  /* ---- 列車の ときだけ 出す ---- */
  if(train){
    box.appendChild(heading('🚂 列車の きまり'));
    box.appendChild(slider('車間（字と 字の あき）', () => P.gapPx,
      v => { P.gapPx = v; showInfo(); }, 0, Math.max(200, Math.round(len)), 5,
      v => v < 2 ? 'かさねる（いっせいに）' : Math.round(v) + 'ドット'));

    box.appendChild(btnRow(
      button(P.only ? '✅ 走って いる あいだだけ 出す' : '⬜ 走って いる あいだだけ 出す', () => {
        P.only = !P.only;
        reopen();
      })
    ));
    box.appendChild(slider('文字の ざんぞう', () => P.mb || 0, v => P.mb = v, 0, 1, 0.05,
      v => v < 0.03 ? 'なし（くっきり）'
         : (Math.round(v * 100) + '%（' + (0.5 + 2.5 * v).toFixed(1) + 'コマ）')));
    const bn = document.createElement('div');
    bn.className = 'empty';
    bn.style.textAlign = 'left';
    bn.textContent = '車間は「みちの 上の あき」なので、' + NL
      + '何秒で 通るかを かえても ならびは くずれません。' + NL
      + NL
      + 'はやく 走らせる ほど 文字は ぶれます。' + NL
      + 'ぶれの 長さは「はやさ × ざんぞうの 長さ」。' + NL
      + '読ませたい ときは ざんぞうを 0 に するか、' + NL
      + '「何秒で 通る」を のばして ください。' + NL
      + '秒を 2ばいに すると ぶれは 半分に なります。';
    box.appendChild(bn);
    const tn = document.createElement('div');
    tn.className = 'empty';
    tn.style.textAlign = 'left';
    tn.textContent = '走って いる あいだだけ 出す ＝ 出るまえ・着いたあとは' + NL
      + '消えます。切ると、はしっこに 文字が たまります。';
    box.appendChild(tn);
  }

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

/* 列車の きまりを 切りかえた あと、同じ シートを 開き直す */
let reopenPath = () => {};
export function setPathReopener(fn){ reopenPath = fn; }


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


/* ---------- ここから ここまで 出す ----------
   タイムラインの ⟨ ⟩ を 引っぱるのが 本すじ。
   ここでは いまの ぐあいを 見せて、けせる ように するだけ。 */
let onSpan = () => {};
export function setSpanner(fn){ onSpan = fn; }

let onWarp = () => {};
export function setWarper(fn){ onWarp = fn; }

/* ---------- ゆがみ・自由変形 ----------
   絵の上に「あみの目（かご）」を かぶせて 引っぱる。
   骨（パペットピン）が「うごかす」ための ものなのに対して、
   こちらは「形を ととのえる」ための もの。 */
export function warpRow(box, l, closeFn){
  const NL = String.fromCharCode(10);
  box.appendChild(heading('🫳 ゆがみ・自由変形'));

  const t = document.createElement('div');
  t.className = 'empty';
  t.style.textAlign = 'left';
  t.textContent = '自由変形 … 赤い 四すみを 引っぱって 形を 変える' + NL
    + 'ゆがみ … むらさきの あみの目を つまんで 引っぱる' + NL
    + 'かためる … 筆で なぞった ところは かたまりに なって、' + NL
    + '　　　　　 つまむと まるごと 持ち上がります' + NL
    + (l.cage ? 'いま ゆがめて います。' : 'まだ さわって いません。')
    + (isFolder(l)
        ? NL + 'フォルダは 中身を 1まいに まとめてから ゆがめます。'
        : NL + 'ゆがめた 形の 上に、そのまま パペットピン（骨）で')
    + NL + '動きを つけられます。形を あとから 直しても'
    + NL + '動きは そのまま のこります。';
  box.appendChild(t);

  box.appendChild(btnRow(
    button('🫳 ゆがみ・自由変形', () => { if(closeFn) closeFn(); onWarp(l); })
  ));
}

export function spanRow(box, l, closeFn){
  const NL = String.fromCharCode(10);
  box.appendChild(heading('⏱ 出す ところ'));

  const t = document.createElement('div');
  t.className = 'empty';
  t.style.textAlign = 'left';
  t.textContent = (l.span
    ? l.span.from.toFixed(2) + '秒 〜 ' + l.span.to.toFixed(2) + '秒 だけ 出します。'
    : 'ずっと 出しています。')
    + NL + '「長さを 調節」を おすと、タイムラインに ⟨ ⟩ が 出ます。'
    + NL + 'フォルダに かけると 中身ごと 出たり 消えたり します。';
  box.appendChild(t);

  box.appendChild(btnRow(
    button('⟨⟩ 長さを 調節', () => { if(closeFn) closeFn(); onSpan(l); })
  ));

  if(l.span){
    box.appendChild(btnRow(
      button('⏱ いまの時間から', () => {
        edit('出す ところ', () => { l.span.from = Math.min(+S.time.toFixed(2), l.span.to - 0.05); });
        notify('ここから 出します');
        onChange();
      }),
      button('⏱ いまの時間まで', () => {
        edit('出す ところ', () => { l.span.to = Math.max(+S.time.toFixed(2), l.span.from + 0.05); });
        notify('ここまで 出します');
        onChange();
      }),
      button('ずっと 出す', () => {
        edit('ずっと 出す', () => { l.span = null; });
        notify('ずっと 出すように しました');
        onChange();
      })
    ));
  }
}
