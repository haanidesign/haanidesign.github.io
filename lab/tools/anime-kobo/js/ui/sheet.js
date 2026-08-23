/* 下から出てくる設定シート。細かい数字はここに隠す。 */

import { S, onChange, beginEdit, commitEdit, edit, selected } from '../state.js';
import { isDescendant, setParent } from '../engine/layer.js';
import { hasPins, setPin, channelValue, valuesAt, spreadFrames,
         framePinTimes, removePin } from '../engine/anim.js';

export function createSheet(sheetEl, backEl){
  let builder = null;

  function open(title, build){
    builder = build;
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
    if(!builder) return;
    sheetEl.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'handle';
    sheetEl.appendChild(h);
    if(title){
      const t = document.createElement('h2');
      t.textContent = title;
      sheetEl.appendChild(t);
    }
    builder(sheetEl);
  }

  backEl.addEventListener('click', close);

  // 下に振り切ったら閉じる
  let sy = null;
  sheetEl.addEventListener('pointerdown', (e) => {
    if(e.target.closest('input,select,button')) return;
    sy = e.clientY;
  });
  sheetEl.addEventListener('pointerup', (e) => {
    if(sy !== null && e.clientY - sy > 70) close();
    sy = null;
  });

  return { open, close, isOpen, refresh: () => { if(isOpen()) render(sheetEl.querySelector('h2')?.textContent); } };
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
  i.addEventListener('pointerdown', () => beginEdit(label + 'をかえる'));
  i.addEventListener('input', () => { set(+i.value); show(); onChange(); });
  i.addEventListener('change', () => commitEdit());
  return field(label, i, v);
}

/** ピンが打たれているレイヤーなら、値を変えたときに いまの時間のピンも更新する。
    ピンが無いうちは素の値を変えるだけ（勝手にピンが増えない）。 */
export function animSlider(label, layer, ch, min, max, step, fmt){
  const get = () => channelValue(layer, ch, S.time);
  const set = (v) => {
    if(ch === 'tint') layer.tint.amount = v;
    else layer[ch] = v;
    if(hasPins(layer)) setPin(layer, ch, S.time, v, 'smooth');
  };
  const i = document.createElement('input');
  i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
  const val = document.createElement('span');
  val.className = 'val';
  const show = () => val.textContent = (fmt ? fmt(+i.value) : (+i.value).toFixed(2));
  show();
  i.addEventListener('pointerdown', () => beginEdit(label + 'をかえる'));
  i.addEventListener('input', () => { set(+i.value); show(); onChange(); });
  i.addEventListener('change', () => commitEdit());
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
    box.appendChild(slider('かたさ',
      () => l.stiff == null ? 1.4 : l.stiff,
      v => { l.stiff = v; if(l.mesh) l.mesh.dirty = true; },
      0.4, 3, 0.1,
      v => v < 0.8 ? 'やわ' : v > 2.2 ? 'かたい' : 'ふつう'));
    const h = document.createElement('div');
    h.className = 'empty';
    h.style.textAlign = 'left';
    h.textContent = 'かたくすると 骨で曲げたように、\nやわらかくすると 布のようになります';
    box.appendChild(h);
  }

  /* ---------- 見た目 ---------- */
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
