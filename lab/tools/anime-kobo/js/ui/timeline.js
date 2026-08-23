/* タイムライン。レイヤーが上から並び、右にピンが置かれる。
   時間軸は全体（0〜長さ）を横幅にぴったり収める。指1本でどこでも触れる。 */

import { S, onChange, edit, beginEdit, commitEdit, frameAsset } from '../state.js';
import { isFolder, treeRows, membersOf } from '../engine/layer.js';
import { CHANNELS, STEP_CHANNELS, ALL_CHANNELS, pinTimes, hasPins, setPin, removePin, movePin, movePinRipple,
         setCurveAt, isHoldAt, channelValue, framePinTimes, valuesAt,
         pinChX, pinChY, channelsOf, fmtTime } from '../engine/anim.js';

const HIT = 14;   // ピンをつかめる範囲（px）

export function createTimeline(root, opts = {}){
  const toast = opts.toast || (() => {});
  const rows = root.querySelector('#tracks');
  const pinbar = root.querySelector('#pinbar');
  let dragPin = null;

  /* ---------- 時間 ⇄ 位置 ----------
     ズーム1のときは動画ぜんぶがトラックの幅に収まる。
     ズームを上げると横に伸びて、再生ヘッドがまん中に来るようにずらす。 */
  const ruler = root.querySelector('#rtrack');
  const trackWidth = () => {
    const el = rows.querySelector('.track') || ruler;
    return el ? el.clientWidth : Math.max(1, rows.clientWidth - 118);
  };
  const contentWidth = () => trackWidth() * S.tlZoom;

  /** 再生ヘッドがまん中に来る横のずれ量（px） */
  function scrollX(){
    const w = trackWidth(), cw = contentWidth();
    if(cw <= w) return 0;
    const head = (S.time / Math.max(0.001, S.proj.duration)) * cw;
    return Math.max(0, Math.min(cw - w, head - w / 2));
  }

  const t2x = (t) => (t / Math.max(0.001, S.proj.duration)) * contentWidth() - scrollX();
  const x2t = (x) => Math.max(0, Math.min(S.proj.duration,
                      ((x + scrollX()) / Math.max(1, contentWidth())) * S.proj.duration));

  /** きざみ。ひろげるほど細かく置ける */
  function step(){
    const pxPerSec = contentWidth() / Math.max(0.001, S.proj.duration);
    if(pxPerSec > 400) return 0.01;
    if(pxPerSec > 160) return 0.02;
    if(pxPerSec > 60)  return 0.05;
    return 0.1;
  }
  const snap = (t) => Math.round(t / step()) * step();

  /** 時間じくをひろげる・ちぢめる */
  function zoomTime(k){
    const z = Math.max(1, Math.min(60, S.tlZoom * k));
    if(z === S.tlZoom) return;
    S.tlZoom = z;
    toast(z <= 1.01 ? 'ぜんたい表示' : 'きざみ ' + step().toFixed(2) + '秒');
    onChange();
  }

  /* ---------- ピンの選択 ---------- */
  function selectPin(layerId, t, additive){
    if(S.selPins.layer !== layerId){ S.selPins = { layer: layerId, times: [t] }; }
    else if(additive && S.selPins.times.length === 1 && S.selPins.times[0] !== t){
      S.selPins.times = [S.selPins.times[0], t].sort((a, b) => a - b);
    } else {
      S.selPins.times = [t];
    }
    S.sel = layerId;
    onChange();
  }
  function clearPins(){
    if(S.selPins.times.length){ S.selPins = { layer:null, times:[] }; onChange(); }
  }

  /* ---------- 組み立て ---------- */
  function build(){
    // 再生バー
    root.querySelector('#tnow').textContent = S.time.toFixed(1);
    root.querySelector('#tdur').textContent = S.proj.duration.toFixed(1);
    root.querySelector('#play').textContent = S.playing ? '⏸' : '▶';
    root.querySelector('#play').title = S.playing ? 'とめる' : 'さいせい';
    const rp = root.querySelector('#ripple');
    if(rp) rp.classList.toggle('on', S.ripple);
    const ps = root.querySelector('#paste');
    if(ps) ps.disabled = !(S.clip && S.clip.items.length);
    const zo = root.querySelector('#tlOut');
    if(zo) zo.disabled = S.tlZoom <= 1.01;

    buildPinbar();
    buildRuler();

    rows.innerHTML = '';
    if(!S.proj.layers.length){
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '下の「ついか」から\nPSD・PNG・JPEG をよみこもう';
      rows.appendChild(e);
      return;
    }

    treeRows(S.proj).forEach(r => rows.appendChild(buildRow(r.layer, r.depth)));
    rows.appendChild(buildPlayhead());
  }

  /** 目もりを さわったら、そこへ 再生バーを うつす */
  function attachRulerScrub(){
    if(!ruler || ruler.dataset.scrub) return;
    ruler.dataset.scrub = '1';
    ruler.style.cursor = 'ew-resize';
    ruler.addEventListener('pointerdown', (e) => {
      try{ ruler.setPointerCapture(e.pointerId); }catch(_){}
      S.playing = false;
      // 位置の出し方は レイヤー行と そろえる（スクロールバーのぶん 幅が違うことがある）
      const ref = rows.querySelector('.track') || ruler;
      const rect = ref.getBoundingClientRect();
      const edge = rect.left + ref.clientLeft;   // わくの線のぶんを のぞく
      const scrub = (ev) => { S.time = snap(x2t(ev.clientX - edge)); onChange(); };
      scrub(e);
      const end = () => {
        ruler.removeEventListener('pointermove', scrub);
        ruler.removeEventListener('pointerup', end);
        ruler.removeEventListener('pointercancel', end);
      };
      ruler.addEventListener('pointermove', scrub);
      ruler.addEventListener('pointerup', end);
      ruler.addEventListener('pointercancel', end);
    });
  }

  /** 時間の目盛り。ひろげるほど細かい数字が出る */
  function buildRuler(){
    if(!ruler) return;
    attachRulerScrub();

    /* 目もりの幅を レイヤー行の帯と ぴったり合わせる。
       レイヤーが多いと 縦スクロールバーのぶん 行のほうが せまくなるので、
       合わせておかないと 数字と 再生バーの位置が ずれる。 */
    const rowTrack = rows.querySelector('.track');
    if(rowTrack){
      const w = rowTrack.getBoundingClientRect().width;
      if(w > 1) ruler.style.flex = '0 0 ' + w + 'px';
    } else {
      ruler.style.flex = '1';
    }

    ruler.innerHTML = '';
    const w = trackWidth();
    const dur = S.proj.duration;
    const pxPerSec = contentWidth() / Math.max(0.001, dur);

    // 数字を出す間隔。狭いときは間引く
    const labelGap = pxPerSec > 300 ? 0.5 : pxPerSec > 120 ? 1 : pxPerSec > 40 ? 2 : 5;
    const tickGap  = pxPerSec > 300 ? 0.1 : pxPerSec > 120 ? 0.5 : 1;

    for(let t = 0; t <= dur + 1e-6; t += tickGap){
      const x = t2x(t);
      if(x < -4 || x > w + 4) continue;
      const big = Math.abs(t / labelGap - Math.round(t / labelGap)) < 1e-6;
      const tk = document.createElement('div');
      tk.className = 'rtick' + (big ? ' big' : '');
      tk.style.left = x + 'px';
      ruler.appendChild(tk);
      if(big){
        const lb = document.createElement('span');
        lb.className = 'rlab';
        lb.textContent = labelGap < 1 ? t.toFixed(1) : String(Math.round(t));
        lb.style.left = x + 'px';
        ruler.appendChild(lb);
      }
    }
  }

  function buildRow(l, depth){
    const folder = isFolder(l);
    const row = document.createElement('div');
    row.className = 'trow' + (l.id === S.sel ? ' sel' : '') + (l.visible ? '' : ' off')
      + (folder ? ' folder' : '');
    row.dataset.id = l.id;

    /* --- 左：レイヤー --- */
    const head = document.createElement('div');
    head.className = 'thead';
    if(depth) head.style.paddingLeft = (depth * 14) + 'px';

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = 'つまんで ならびかえ';
    attachReorder(grip, l, row);
    head.appendChild(grip);

    // ☑ ＝ まとめる ときに えらぶ印
    const pick = document.createElement('button');
    pick.className = 'pick' + (S.pick.includes(l.id) ? ' on' : '');
    pick.textContent = S.pick.includes(l.id) ? '☑' : '☐';
    pick.title = 'まとめる ために えらぶ';
    pick.setAttribute('aria-label', pick.title);
    pick.addEventListener('pointerdown', e => e.stopPropagation());
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = S.pick.indexOf(l.id);
      if(i >= 0) S.pick.splice(i, 1); else S.pick.push(l.id);
      onChange();
    });
    head.appendChild(pick);

    if(folder){
      const tw = document.createElement('button');
      tw.className = 'twist';
      tw.textContent = l.open === false ? '▸' : '▾';
      tw.title = l.open === false ? 'ひらく' : 'たたむ';
      tw.addEventListener('pointerdown', e => e.stopPropagation());
      tw.addEventListener('click', (e) => {
        e.stopPropagation();
        l.open = l.open === false;
        onChange();
      });
      head.appendChild(tw);

      const ic = document.createElement('span');
      ic.className = 'folderic';
      ic.textContent = l.open === false ? '📁' : '📂';
      head.appendChild(ic);
    } else {
      const asset = frameAsset(l, 0);
      const th = document.createElement('img');
      th.className = 'thumb'; th.alt = '';
      if(asset) th.src = asset.src;
      head.appendChild(th);
    }

    const nm = document.createElement('span');
    nm.className = 'nm';
    const oya = l.parent ? S.proj.layers.find(x => x.id === l.parent) : null;
    const inFolder = oya && isFolder(oya);
    nm.textContent = (l.clip ? '✂ ' : '') + (oya && !inFolder ? '⤷ ' : '') + l.name
      + (folder ? '（' + membersOf(S.proj, l).length + '）' : '');
    const tips = [];
    if(l.clip) tips.push('下のレイヤーの形でぬいている');
    if(oya) tips.push(oya.name + ' についている');
    if(tips.length) nm.title = tips.join(' / ');
    if(oya) head.classList.add('haschild');
    head.appendChild(nm);

    if(!folder && l.frames.length > 1){
      const f = document.createElement('span');
      f.className = 'frames';
      f.textContent = (valuesAt(l, S.time).frame + 1) + '/' + l.frames.length;
      f.title = 'いま何コマめか';
      head.appendChild(f);
    }

    const eye = document.createElement('button');
    eye.className = 'eye';
    eye.textContent = l.visible ? '👁' : '🚫';
    eye.title = l.visible ? 'かくす' : 'みせる';
    eye.setAttribute('aria-label', eye.title);
    eye.addEventListener('pointerdown', e => e.stopPropagation());
    eye.addEventListener('click', e => {
      e.stopPropagation();
      edit(l.visible ? 'かくす' : 'みせる', () => { l.visible = !l.visible; });
      onChange();
    });
    head.appendChild(eye);

    head.addEventListener('click', () => { S.sel = l.id; clearPins(); onChange(); });
    row.appendChild(head);

    /* --- 右：トラック --- */
    const track = document.createElement('div');
    track.className = 'track';

    // くりかえしの帯
    if(l.loop){
      const band = document.createElement('div');
      band.className = 'loopband' + (l.loop.mode === 'pingpong' ? ' ping' : '');
      band.style.left = t2x(l.loop.from) + 'px';
      band.style.width = Math.max(0, t2x(l.loop.to) - t2x(l.loop.from)) + 'px';
      band.title = l.loop.mode === 'pingpong' ? '往復ループ' : 'ループ';
      track.appendChild(band);
      // 繰り返している先の目印
      const rest = document.createElement('div');
      rest.className = 'looprest';
      rest.style.left = t2x(l.loop.to) + 'px';
      rest.style.width = Math.max(0, trackWidth() - t2x(l.loop.to)) + 'px';
      track.appendChild(rest);
    }

    // 目盛り。ひろげたときに何秒か分かるように
    if(S.tlZoom > 1.01){
      const dur = S.proj.duration;
      const pxPerSec = contentWidth() / Math.max(0.001, dur);
      const gap = pxPerSec > 300 ? 0.1 : pxPerSec > 90 ? 0.5 : 1;
      for(let t = 0; t <= dur + 1e-6; t += gap){
        const x = t2x(t);
        if(x < -2 || x > trackWidth() + 2) continue;
        const tick = document.createElement('div');
        const big = Math.abs(t % 1) < 1e-6;
        tick.className = 'tick' + (big ? ' big' : '');
        tick.style.left = x + 'px';
        track.appendChild(tick);
      }
    }

    // ピン同士をつなぐ線
    const times = pinTimes(l);
    if(times.length > 1){
      const line = document.createElement('div');
      line.className = 'pinline';
      line.style.left = t2x(times[0]) + 'px';
      line.style.width = (t2x(times[times.length - 1]) - t2x(times[0])) + 'px';
      track.appendChild(line);
    }

    const framePins = framePinTimes(l);
    times.forEach(t => {
      const b = document.createElement('button');
      const picked = S.selPins.layer === l.id && S.selPins.times.includes(t);
      const isFrame = framePins.some(f => Math.abs(f - t) < 1e-3);
      b.className = 'pin' + (picked ? ' on' : '')
        + (isHoldAt(l, t) ? ' hold' : '')
        + (isFrame ? ' frame' : '');
      const px = t2x(t);
      if(px < -20 || px > trackWidth() + 20) return;   // 画面の外は作らない
      b.style.left = px + 'px';
      b.title = fmtTime(t) + (isHoldAt(l, t) ? '（とめる）' : '');
      b.setAttribute('aria-label', 'ピン ' + fmtTime(t));
      attachPinDrag(b, l, t);
      track.appendChild(b);
    });

    attachScrub(track, l);
    row.appendChild(track);
    return row;
  }

  function buildPlayhead(){
    const ph = document.createElement('div');
    ph.className = 'playhead';
    ph.id = 'playhead';
    updatePlayhead(ph);
    return ph;
  }

  function updatePlayhead(ph){
    ph = ph || root.querySelector('#playhead');
    if(!ph) return;
    const track = rows.querySelector('.track');
    if(!track){ ph.style.display = 'none'; return; }
    ph.style.display = '';
    // レイヤーが多くてスクロールするときも、いちばん下の行まで届かせる
    ph.style.height = Math.max(rows.scrollHeight, rows.clientHeight) + 'px';
    // レイヤー名の欄の幅は中身で変わるので、実際のトラック位置から出す
    ph.style.left = (track.offsetLeft + t2x(S.time)) + 'px';
  }

  /* ---------- ピンの操作バー ---------- */
  function buildPinbar(){
    const n = S.selPins.times.length;
    pinbar.hidden = n === 0;
    if(!n) return;
    const l = S.proj.layers.find(x => x.id === S.selPins.layer);
    if(!l){ pinbar.hidden = true; return; }

    const info = pinbar.querySelector('#pininfo');
    info.textContent = n === 1
      ? 'ピン ' + fmtTime(S.selPins.times[0])
      : fmtTime(S.selPins.times[0]) + ' 〜 ' + fmtTime(S.selPins.times[1]);

    const hold = pinbar.querySelector('#pinHold');
    const on = n === 1 && isHoldAt(l, S.selPins.times[0]);
    hold.classList.toggle('on', on);
    hold.disabled = n !== 1;
    hold.textContent = on ? '⏸ とめてる' : '⏸ とめる';

    const isLoop = !!l.loop;
    pinbar.querySelector('#pinLoop').classList.toggle('on', isLoop && l.loop.mode === 'loop');
    pinbar.querySelector('#pinPing').classList.toggle('on', isLoop && l.loop.mode === 'pingpong');
    pinbar.querySelector('#pinLoop').disabled = n !== 2 && !isLoop;
    pinbar.querySelector('#pinPing').disabled = n !== 2 && !isLoop;
  }

  /* ---------- ピンをドラッグして時間を変える ---------- */
  function attachPinDrag(btn, l, t){
    let moved = false, startX = 0, curT = t;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try{ btn.setPointerCapture(e.pointerId); }catch(_){}
      moved = false; startX = e.clientX; curT = t;
      const trackEl = btn.parentElement;
      const rect = trackEl.getBoundingClientRect();

      const move = (ev) => {
        if(!moved && Math.abs(ev.clientX - startX) < 5) return;
        if(!moved){ moved = true; beginEdit('ピンをずらす'); if(navigator.vibrate) navigator.vibrate(8); }
        const want = snap(x2t(ev.clientX - rect.left));
        if(want === curT) return;

        let nt;
        if(S.ripple){
          // 後ろのピンも一緒に動く
          nt = snap(movePinRipple(l, curT, want, S.proj.duration));
          if(nt === curT) return;
        } else {
          nt = want;
          movePin(l, curT, nt);
          if(l.loop){
            if(Math.abs(l.loop.from - curT) < 1e-3) l.loop.from = nt;
            if(Math.abs(l.loop.to   - curT) < 1e-3) l.loop.to = nt;
          }
        }

        if(S.selPins.layer === l.id){
          S.selPins.times = S.selPins.times.map(x => Math.abs(x - curT) < 1e-3 ? nt : x).sort((a,b)=>a-b);
        }
        curT = nt;
        S.time = nt;
        onChange();
      };
      const end = (ev) => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', end);
        btn.removeEventListener('pointercancel', end);
        if(moved) commitEdit();
        else selectPin(l.id, t, ev.shiftKey || S.selPins.layer === l.id);
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    });
  }

  /* ---------- トラックを触ると時間が動く ---------- */
  function attachScrub(track, l){
    track.addEventListener('pointerdown', (e) => {
      if(e.target !== track) return;      // ピンの上は除く
      try{ track.setPointerCapture(e.pointerId); }catch(_){}
      S.sel = l.id;
      clearPins();
      S.playing = false;
      const rect = track.getBoundingClientRect();
      const scrub = (ev) => {
        S.time = snap(x2t(ev.clientX - rect.left));
        onChange();
      };
      scrub(e);
      const end = () => {
        track.removeEventListener('pointermove', scrub);
        track.removeEventListener('pointerup', end);
        track.removeEventListener('pointercancel', end);
      };
      track.addEventListener('pointermove', scrub);
      track.addEventListener('pointerup', end);
      track.addEventListener('pointercancel', end);
    });
  }

  /* ---------- 並びかえ ---------- */
  function attachReorder(grip, l, row){
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try{ grip.setPointerCapture(e.pointerId); }catch(_){}
      row.classList.add('dragging');
      beginEdit('ならびかえ');
      if(navigator.vibrate) navigator.vibrate(10);

      const move = (ev) => {
        const all = [...rows.querySelectorAll('.trow')];
        const target = all.find(r => {
          const b = r.getBoundingClientRect();
          return ev.clientY >= b.top && ev.clientY <= b.bottom;
        });
        if(!target || target.dataset.id === l.id) return;
        const from = S.proj.layers.findIndex(x => x.id === l.id);
        const to = S.proj.layers.findIndex(x => x.id === target.dataset.id);
        if(from < 0 || to < 0) return;
        const [m] = S.proj.layers.splice(from, 1);
        S.proj.layers.splice(to, 0, m);
        onChange();
      };
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        commitEdit();
        onChange();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
  }

  /* ---------- 外から呼ぶ操作 ---------- */

  /** いまの姿をピンにする */
  function putPin(){
    const l = S.proj.layers.find(x => x.id === S.sel);
    if(!l) return toast('レイヤーをえらんでね');
    edit('ピンをうつ', () => {
      // チャンネル名と値の名前がずれているものがあるので channelValue 経由で取る
      CHANNELS.forEach(c => setPin(l, c, S.time, channelValue(l, c, S.time), 'smooth'));
      STEP_CHANNELS.forEach(c => setPin(l, c, S.time, channelValue(l, c, S.time), 'hold'));
      // パペットピンのずれも いっしょに残す（固定ピンは動かないので要らない）
      const v = valuesAt(l, S.time);
      (l.pins || []).forEach((p, i) => {
        if(p.type === 'fix') return;
        const vp = v.pins[i] || p;
        setPin(l, pinChX(p.id), S.time, vp.dx || 0, 'smooth');
        setPin(l, pinChY(p.id), S.time, vp.dy || 0, 'smooth');
      });
    });
    S.selPins = { layer: l.id, times: [Math.round(S.time * 10) / 10] };
    toast('ピンをうちました ' + fmtTime(S.time));
    onChange();
  }

  function delPins(){
    const l = S.proj.layers.find(x => x.id === S.selPins.layer);
    if(!l || !S.selPins.times.length) return;
    edit('ピンをけす', () => {
      S.selPins.times.forEach(t => removePin(l, t));
      if(l.loop && !pinTimes(l).length) l.loop = null;
    });
    S.selPins = { layer:null, times:[] };
    onChange();
  }

  /** 選んだピンをおぼえる。2つ選んでいれば、その間のピンも全部 */
  function copyPins(){
    const l = S.proj.layers.find(x => x.id === S.selPins.layer);
    if(!l || !S.selPins.times.length) return toast('ピンをえらんでね');
    const from = S.selPins.times[0];
    const to = S.selPins.times.length > 1 ? S.selPins.times[1] : from;
    const times = pinTimes(l).filter(t => t >= from - 1e-6 && t <= to + 1e-6);

    S.clip = {
      items: times.map(t => {
        const chans = {};
        channelsOf(l).forEach(c => {
          const k = (l.tracks[c] || []).find(k => Math.abs(k.t - t) < 1e-3);
          if(k) chans[c] = { v: k.v, c: k.c };
        });
        return { dt: +(t - from).toFixed(3), chans };
      })
    };
    toast(times.length + 'コのピンを おぼえました');
    onChange();
  }

  /** おぼえたピンを、いまの時間から貼る */
  function pastePins(){
    const l = S.proj.layers.find(x => x.id === S.sel);
    if(!l) return toast('レイヤーをえらんでね');
    if(!S.clip || !S.clip.items.length) return toast('さきに ピンをコピーしてね');

    // 別のレイヤーに貼るときは、パペットピンのチャンネルは持っていけない
    const sameLayer = S.selPins.layer === l.id;
    let n = 0, skipped = 0;
    edit('ピンをはりつけ', () => {
      S.clip.items.forEach(it => {
        const t = +(S.time + it.dt).toFixed(3);
        if(t > S.proj.duration + 1e-6) return;
        let put = false;
        for(const ch in it.chans){
          if(!sameLayer && ch[0] === 'P' && ch.includes(':')){ skipped++; continue; }
          setPin(l, ch, t, it.chans[ch].v, it.chans[ch].c);
          put = true;
        }
        if(put) n++;
      });
    });
    toast(n ? n + 'コのピンを はりました' + (skipped ? '（パペットピンは のぞく）' : '')
            : 'はれませんでした');
    onChange();
  }

  function toggleHold(){
    const l = S.proj.layers.find(x => x.id === S.selPins.layer);
    if(!l || S.selPins.times.length !== 1) return;
    const t = S.selPins.times[0];
    const on = isHoldAt(l, t);
    edit(on ? 'とめるをやめる' : 'とめる', () => setCurveAt(l, t, on ? 'smooth' : 'hold'));
    toast(on ? 'ふつうに もどしました' : 'ここで とまります');
    onChange();
  }

  function setLoop(mode){
    const l = S.proj.layers.find(x => x.id === S.selPins.layer);
    if(!l) return;
    if(l.loop && l.loop.mode === mode){
      edit('くりかえしをやめる', () => { l.loop = null; });
      toast('くりかえしを やめました');
    } else if(S.selPins.times.length === 2){
      const [from, to] = S.selPins.times;
      edit(mode === 'pingpong' ? '往復ループ' : 'ループ', () => { l.loop = { from, to, mode }; });
      toast(mode === 'pingpong' ? '行ってもどってを くりかえします' : 'ここを くりかえします');
    } else if(l.loop){
      edit('くりかえしを かえる', () => { l.loop.mode = mode; });
    } else {
      return toast('ピンを2つえらんでね');
    }
    onChange();
  }

  return { build, updatePlayhead, putPin, delPins, toggleHold, setLoop, clearPins,
           copyPins, pastePins, zoomTime };
}
