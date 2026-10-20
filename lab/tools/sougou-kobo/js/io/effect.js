/* エフェクト（光・衝撃・漫符 …）を コマの レイヤーに して 足す。

   描きかたは エフェクトメーカー（../effect-maker/fx.js）と 同じ ものを 読む。
   コマを ぜんぶ 絵に して から 1つの レイヤーに ならべるので、
   足した あとは ふつうの レイヤーと 同じく 動かす・大きさ・ふだ が 使える。
   どの 設定で 作ったかは layer.effect に のこし、あとから 作り直せる。 */

import { S, edit, addAsset, selected } from '../state.js?v=380';
import { newLayer } from '../engine/layer.js?v=380';
import { spreadFrames } from '../engine/anim.js?v=380';
import { loadImage } from './image.js?v=380';
import { field, btnRow, button, guardSlide } from '../ui/sheet.js?v=380';
import { PALS, PAL, CATS, FX, FXI, fxDefaults, totalFrames, renderTo } from '../../../effect-maker/fx.js?v=380';

/* シートを 閉じても のこる 下書き */
let draft = null;
let cat = 'すべて';
let draftFrom = null;   // どの レイヤーから 読んだ 下書きか
const thumbs = {};

function startDraft(id){
  draft = fxDefaults(id, { seed: 1 + Math.floor(Math.random() * 500) });
}

function thumbOf(fx){
  if(thumbs[fx.id]) return thumbs[fx.id];
  const d = fxDefaults(fx.id, { seed: 3 });
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 96;
  const tot = totalFrames(d);
  renderTo(tmp, Math.min(tot - 1, Math.round(fx.peak * (fx.loop ? tot : tot - 1))), d);
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const dark = !['ink', 'gloom'].includes(d.pal) && fx.id !== 'beta' && fx.id !== 'iris';
  g.fillStyle = dark ? '#2b2920' : '#FBFAEC'; g.fillRect(0, 0, 96, 96);
  g.drawImage(tmp, 0, 0);
  return thumbs[fx.id] = c;
}

/* 絵の 大きさ。画面全体の ものは 作品と 同じ 形、その場の ものは 正方形 */
function frameSize(fx){
  const pw = S.proj.w, ph = S.proj.h;
  if(fx.full){ const k = Math.min(1, 1280 / Math.max(pw, ph)); return [Math.round(pw * k), Math.round(ph * k)]; }
  const s = Math.min(1024, Math.max(pw, ph));
  return [s, s];
}

/** 下書きを コマの 絵に する */
async function makeFrames(Q, onStep){
  const fx = FXI[Q.fx], [w, h] = frameSize(fx), tot = totalFrames(Q);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ids = [];
  for(let i = 0; i < tot; i++){
    renderTo(c, i, Q);
    const src = c.toDataURL('image/png');
    ids.push(addAsset(fx.name + (i + 1), src, w, h, await loadImage(src)));
    if(onStep) onStep(i + 1, tot);
    await new Promise(r => setTimeout(r, 0));
  }
  return { ids, w, h, tot };
}

/** コマを ならべて ループ・出す ところ を つける */
function arrange(l, Q, t0){
  const fx = FXI[Q.fx], tot = totalFrames(Q), dur = tot / Q.fps;
  l.tracks = Object.assign({}, l.tracks); delete l.tracks.frame;
  spreadFrames(l, 1 / Q.fps, t0);
  if(fx.loop){
    l.loop = { from: +t0.toFixed(3), to: +(t0 + dur).toFixed(3), mode: 'loop' };
    l.span = { from: +t0.toFixed(3), to: null };
  } else {
    l.loop = null;
    l.span = { from: +t0.toFixed(3), to: +(t0 + dur).toFixed(3) };
  }
}

function place(l, fx, w, h){
  const pw = S.proj.w, ph = S.proj.h;
  const k = fx.full ? pw / w : Math.min(pw, ph) / w;
  l.scaleX = l.scaleY = k;
  l.x = pw / 2; l.y = ph / 2;
}

/**
 * opt = { toast, refresh, busy(msg|'') }
 */
export function buildEffectSheet(box, opt){
  const sel = selected();
  const editing = sel && sel.effect && FXI[sel.effect.fx] ? sel : null;
  if(!draft) startDraft('juji');
  if(editing && draftFrom !== editing.id){ draft = Object.assign({}, editing.effect); draftFrom = editing.id; }
  if(!editing) draftFrom = null;

  const n = document.createElement('div');
  n.className = 'empty'; n.style.textAlign = 'left';
  n.textContent = 'えらんで「足す」と、いまの 時こくから コマの レイヤーに なります。こまかい 調整は エフェクトメーカーで。';
  box.appendChild(n);

  const redraw = () => { box.innerHTML = ''; buildEffectSheet(box, opt); };

  /* なかま */
  const cats = document.createElement('div'); cats.className = 'rowbtns wrap';
  ['すべて', ...CATS].forEach(c => {
    const b = button(c, () => { cat = c; redraw(); });
    if(c === cat) b.className = 'on';
    cats.appendChild(b);
  });
  box.appendChild(cats);

  /* 一覧 */
  const wrap = document.createElement('div'); wrap.className = 'sozai';
  FX.filter(f => cat === 'すべて' || f.cat === cat).forEach(fx => {
    const b = document.createElement('button');
    b.className = 'sozaiitem' + (fx.id === draft.fx ? ' on' : '');
    b.title = fx.desc;
    const c = document.createElement('canvas'); c.width = 96; c.height = 72;
    c.getContext('2d').drawImage(thumbOf(fx), 0, 12, 96, 72, 0, 0, 96, 72);
    const t = document.createElement('span'); t.textContent = fx.name;
    b.append(c, t);
    b.addEventListener('click', () => {
      const keep = { seed: draft.seed };
      draft = fxDefaults(fx.id, keep);
      redraw();
    });
    wrap.appendChild(b);
  });
  box.appendChild(wrap);

  const fx = FXI[draft.fx];
  const info = document.createElement('div');
  info.className = 'empty'; info.style.textAlign = 'left';
  info.textContent = '▶ ' + fx.name + '：' + fx.desc;
  box.appendChild(info);

  /* 色 */
  const pals = document.createElement('div'); pals.className = 'rowbtns wrap';
  PALS.forEach(([id, name, a, b2, c]) => {
    const b = button('', () => { draft.pal = id; draft.c0 = a; draft.c1 = b2; draft.c2 = c; redraw(); });
    b.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:.3rem">${[a, b2, c].map(x => `<i style="width:.75rem;height:.75rem;border-radius:50%;border:1.5px solid #1E1C14;background:${x};margin-right:-.2rem;display:block"></i>`).join('')}</span>${name}`;
    if(draft.pal === id && draft.c0 === a && draft.c1 === b2 && draft.c2 === c) b.className = 'on';
    pals.appendChild(b);
  });
  box.appendChild(field('色', pals));

  /* つまみ */
  const rng = (label, key, min, max, step, fmt) => {
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = draft[key];
    const v = document.createElement('span'); v.className = 'val';
    const show = () => v.textContent = fmt(+i.value);
    show();
    guardSlide(i, () => { draft[key] = +i.value; show(); });
    return field(label, i, v);
  };
  const pct = x => Math.round(x) + '%';
  if(fx.uses.includes('size'))   box.appendChild(rng('大きさ', 'size', 10, 160, 1, pct));
  if(fx.uses.includes('amount')) box.appendChild(rng('量', 'amount', 5, 150, 1, pct));
  if(fx.uses.includes('width'))  box.appendChild(rng('太さ', 'width', 10, 150, 1, pct));
  if(fx.uses.includes('rot'))    box.appendChild(rng('向き', 'rot', -180, 180, 1, x => x + '°'));
  box.appendChild(rng('線の ゆれ', 'boil', 0, 12, 1, x => x ? String(x) : 'なし'));
  box.appendChild(rng('縁取り', 'outline', 0, 20, 1, x => x ? String(x) : 'なし'));
  box.appendChild(rng('光らせる', 'glow', 0, 40, 1, x => x ? String(x) : 'なし'));

  if(fx.uses.includes('text')){
    const i = document.createElement('input');
    i.type = 'text'; i.maxLength = 8; i.value = draft.text || '';
    i.addEventListener('input', () => { draft.text = i.value; });
    box.appendChild(field('文字', i));
  }

  const fpsSel = document.createElement('select');
  [[8, '8（3コマ打ち）'], [12, '12（2コマ打ち）'], [24, '24（1コマ打ち）'], [30, '30']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; fpsSel.appendChild(o);
  });
  fpsSel.value = draft.fps;
  fpsSel.addEventListener('change', () => { draft.fps = +fpsSel.value; });
  box.appendChild(field('コマ打ち', fpsSel));

  const durSel = document.createElement('select');
  [.3, .4, .45, .5, .6, .7, .75, .8, .9, 1, 1.2, 1.4, 1.6, 2, 2.5, 3, 4, 5].forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = v + ' 秒'; durSel.appendChild(o);
  });
  durSel.value = draft.dur;
  durSel.addEventListener('change', () => { draft.dur = +durSel.value; });
  box.appendChild(field(fx.loop ? '1回ぶんの 長さ（くり返す）' : '長さ', durSel));

  /* 足す・作り直す */
  const add = async () => {
    const Q = Object.assign({}, draft);
    const fx2 = FXI[Q.fx];
    opt.busy && opt.busy('エフェクトを 作っています…');
    try{
      const r = await makeFrames(Q, (i, t) => opt.busy && opt.busy(`エフェクトを 作っています… ${i}/${t}`));
      const t0 = +S.time.toFixed(3);
      let l = null;
      edit('エフェクトを 足す', () => {
        l = newLayer(fx2.name, r.ids);
        l.effect = Q;
        place(l, fx2, r.w, r.h);
        arrange(l, Q, t0);
        S.proj.layers.unshift(l);
        S.sel = l.id;
        const end = t0 + r.tot / Q.fps;
        if(!fx2.loop && end > (S.proj.duration || 0)) S.proj.duration = +end.toFixed(3);
      });
      opt.toast && opt.toast('「' + fx2.name + '」を 足しました');
    }catch(err){
      opt.toast && opt.toast('作れませんでした: ' + (err && err.message || err));
    }
    opt.busy && opt.busy('');
    opt.refresh && opt.refresh();
  };
  const remake = async () => {
    const l = editing; if(!l) return;
    const Q = Object.assign({}, draft), fx2 = FXI[Q.fx];
    opt.busy && opt.busy('作り直しています…');
    try{
      const r = await makeFrames(Q, (i, t) => opt.busy && opt.busy(`作り直しています… ${i}/${t}`));
      const t0 = l.span && l.span.from != null ? l.span.from : +S.time.toFixed(3);
      edit('エフェクトを 作り直す', () => {
        const sameShape = l.effect && !!FXI[l.effect.fx].full === !!fx2.full;
        l.frames = r.ids;
        if(l.name === (FXI[l.effect.fx] || {}).name) l.name = fx2.name;
        l.effect = Q;
        if(!sameShape) place(l, fx2, r.w, r.h);
        arrange(l, Q, t0);
      });
      opt.toast && opt.toast('作り直しました');
    }catch(err){
      opt.toast && opt.toast('作れませんでした: ' + (err && err.message || err));
    }
    opt.busy && opt.busy('');
    opt.refresh && opt.refresh();
  };

  const row = [button('＋ いまの 時こくに 足す', add, 'primary')];
  if(editing) row.push(button('↻ えらんだ「' + editing.name + '」を 作り直す', remake));
  box.appendChild(btnRow(...row));

  const link = document.createElement('a');
  link.href = '../effect-maker/'; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = 'エフェクトメーカーを ひらく（連番PNGの 書き出し・こまかい 色）';
  link.style.cssText = 'display:block;margin-top:.6rem;font-weight:700';
  box.appendChild(link);
}

export const isEffect = (l) => !!(l && l.effect && FXI[l.effect.fx]);
export { PAL };
