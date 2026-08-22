/* タイムライン。レイヤーが上から並び、右にピンが置かれる。
   時間軸は全体（0〜長さ）を横幅にぴったり収める。指1本でどこでも触れる。 */

import { S, onChange, edit, beginEdit, commitEdit, frameAsset } from '../state.js';
import { CHANNELS, STEP_CHANNELS, ALL_CHANNELS, pinTimes, hasPins, setPin, removePin, movePin, movePinRipple,
         setCurveAt, isHoldAt, channelValue, framePinTimes, valuesAt,
         pinChX, pinChY, fmtTime } from '../engine/anim.js';

const HIT = 14;   // ピンをつかめる範囲（px）

export function createTimeline(root, opts = {}){
  const toast = opts.toast || (() => {});
  const rows = root.querySelector('#tracks');
  const pinbar = root.querySelector('#pinbar');
  let dragPin = null;

  /* ---------- 時間 ⇄ 位置 ---------- */
  const trackWidth = () => {
    const el = rows.querySelector('.track');
    return el ? el.clientWidth : Math.max(1, rows.clientWidth - 118);
  };
  const t2pct = (t) => (t / Math.max(0.001, S.proj.duration)) * 100;
  const x2t = (x, w) => Math.max(0, Math.min(S.proj.duration, (x / Math.max(1, w)) * S.proj.duration));
  const snap = (t) => Math.round(t * 10) / 10;      // 0.1秒きざみ

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
    root.querySelector('#tnow').textContent = fmtTime(S.time);
    root.querySelector('#tdur').textContent = fmtTime(S.proj.duration);
    root.querySelector('#play').textContent = S.playing ? '⏸' : '▶';
    root.querySelector('#play').title = S.playing ? 'とめる' : 'さいせい';
    const rp = root.querySelector('#ripple');
    if(rp) rp.classList.toggle('on', S.ripple);

    buildPinbar();

    rows.innerHTML = '';
    if(!S.proj.layers.length){
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '下の「ついか」から\nPSD・PNG・JPEG をよみこもう';
      rows.appendChild(e);
      return;
    }

    S.proj.layers.forEach(l => rows.appendChild(buildRow(l)));
    rows.appendChild(buildPlayhead());
  }

  function buildRow(l){
    const row = document.createElement('div');
    row.className = 'trow' + (l.id === S.sel ? ' sel' : '') + (l.visible ? '' : ' off');
    row.dataset.id = l.id;

    /* --- 左：レイヤー --- */
    const head = document.createElement('div');
    head.className = 'thead';

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = 'つまんで ならびかえ';
    attachReorder(grip, l, row);
    head.appendChild(grip);

    const asset = frameAsset(l, 0);
    const th = document.createElement('img');
    th.className = 'thumb'; th.alt = '';
    if(asset) th.src = asset.src;
    head.appendChild(th);

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = (l.clip ? '↳ ' : '') + l.name;
    if(l.clip) nm.title = '下のレイヤーの形でぬいている';
    head.appendChild(nm);

    if(l.frames.length > 1){
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
      band.style.left = t2pct(l.loop.from) + '%';
      band.style.width = Math.max(0, t2pct(l.loop.to) - t2pct(l.loop.from)) + '%';
      band.title = l.loop.mode === 'pingpong' ? '往復ループ' : 'ループ';
      track.appendChild(band);
      // 繰り返している先の目印
      const rest = document.createElement('div');
      rest.className = 'looprest';
      rest.style.left = t2pct(l.loop.to) + '%';
      rest.style.width = Math.max(0, 100 - t2pct(l.loop.to)) + '%';
      track.appendChild(rest);
    }

    // ピン同士をつなぐ線
    const times = pinTimes(l);
    if(times.length > 1){
      const line = document.createElement('div');
      line.className = 'pinline';
      line.style.left = t2pct(times[0]) + '%';
      line.style.width = (t2pct(times[times.length - 1]) - t2pct(times[0])) + '%';
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
      b.style.left = t2pct(t) + '%';
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
    // レイヤー名の欄の幅は中身で変わるので、実際のトラック位置から出す
    const left = track.offsetLeft + (S.time / Math.max(0.001, S.proj.duration)) * track.clientWidth;
    ph.style.left = left + 'px';
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
      const w = trackEl.clientWidth;
      const rect = trackEl.getBoundingClientRect();

      const move = (ev) => {
        if(!moved && Math.abs(ev.clientX - startX) < 5) return;
        if(!moved){ moved = true; beginEdit('ピンをずらす'); if(navigator.vibrate) navigator.vibrate(8); }
        const want = snap(x2t(ev.clientX - rect.left, w));
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
      const w = track.clientWidth;
      const scrub = (ev) => {
        S.time = snap(x2t(ev.clientX - rect.left, w));
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

  return { build, updatePlayhead, putPin, delPins, toggleHold, setLoop, clearPins };
}
