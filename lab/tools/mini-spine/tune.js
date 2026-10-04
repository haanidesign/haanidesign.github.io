/* ミニSpine — 動きの 大きさ・はやさ
   いまの アニメ ぜんたいを、つまみ 2つで 大きく／小さく・はやく／おそく する。
   もとの キーを とって おいて（a.base）、そこから 毎回 計算し直すので、何回 動かしても くずれない。
   キーを 自分で 直した あとに ひらくと、その 形を 新しい「もと」に する。 */
'use strict';

const TUNE_SIG = a => JSON.stringify([a.tracks, a.dur, a.eyes || null, a.sets || null]);
function tuneBase(a){
  if(!a.base || a.tuneSig !== TUNE_SIG(a)){
    a.base = JSON.parse(JSON.stringify({ tracks: a.tracks, dur: a.dur, eyes: a.eyes || null, sets: a.sets || null }));
    a.tune = { amt: 1, spd: 1 };
  }
  return a.base;
}
function applyTune(a, amt, spd){
  const B = tuneBase(a);
  const dur = +(B.dur / spd).toFixed(3), ts = dur / B.dur;
  const tr = {};
  for(const id in B.tracks){
    tr[id] = {};
    for(const ch in B.tracks[id]){
      tr[id][ch] = B.tracks[id][ch].map(k => ({
        t: +(k.t * ts).toFixed(4),
        v: isScaleCh(ch) ? 1 + (k.v - 1) * amt : k.v * amt,
        c: k.c
      }));
    }
  }
  a.tracks = tr; a.dur = dur;
  if(B.eyes) a.eyes = B.eyes.map(([t0, t1]) => [+(t0 * ts).toFixed(3), +(t1 * ts).toFixed(3)]);
  if(B.sets){ a.sets = {}; for(const sid in B.sets) a.sets[sid] = B.sets[sid].map(([t, s]) => [+(t * ts).toFixed(3), s]); }
  a.tune = { amt, spd };
  a.tuneSig = TUNE_SIG(a);
  if(S.time > a.dur) S.time = S.time % a.dur;
}

function openTune(){
  const a = anim(); if(!a) return;
  tuneBase(a);
  sheet.show('🎚 動きの 大きさ・はやさ（' + S.proj.current + '）', body => {
    body.appendChild(el('div', 'sh-note', 'つまみを 左右に ドラッグ。再生 しながら 見られます。'));
    const row = (label, min, max, step, val, fmt, on) => {
      const r = el('div', 'tune-row');
      const l = el('div', 'tune-l'); l.append(el('b', null, label));
      const out = el('span', 'tune-v', fmt(val)); l.appendChild(out);
      const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val;
      i.oninput = () => { beginEdit(label + 'を 変える'); out.textContent = fmt(+i.value); on(+i.value); };
      i.onchange = () => commitEdit();
      r.append(l, i); body.appendChild(r);
      return { i, out };
    };
    const cur = a.tune || { amt: 1, spd: 1 };
    let amt = cur.amt, spd = cur.spd;
    const A = row('大きさ', 0, 2.5, 0.05, amt, v => Math.round(v * 100) + '%', v => { amt = v; applyTune(a, amt, spd); });
    const P = row('はやさ', 0.25, 3, 0.05, spd, v => '×' + v.toFixed(2) + '（' + (tuneBase(a).dur / v).toFixed(1) + '秒）', v => { spd = v; applyTune(a, amt, spd); });
    const r2 = el('div', 'soft-row');
    r2.append(
      mkBtn('ちいさめ', () => set(0.6, spd), 'btn btn-sm'),
      mkBtn('ふつう', () => set(1, 1), 'btn btn-sm'),
      mkBtn('おおきめ', () => set(1.5, spd), 'btn btn-sm'),
      mkBtn('ゆっくり', () => set(amt, 0.6), 'btn btn-sm'),
      mkBtn('はやく', () => set(amt, 1.6), 'btn btn-sm'));
    body.appendChild(r2);
    function set(x, y){
      edit('動きの 大きさ・はやさ', () => { amt = x; spd = y; applyTune(a, amt, spd); });
      A.i.value = amt; A.out.textContent = Math.round(amt * 100) + '%';
      P.i.value = spd; P.out.textContent = '×' + spd.toFixed(2) + '（' + (tuneBase(a).dur / spd).toFixed(1) + '秒）';
      refreshUI();
    }
    body.appendChild(el('div', 'sh-note', '大きさ 0% で 止まる・200% で 2ばい。はやさは 長さを 変える（×2 で 半分の 時間）。'));
  });
  S.mode = 'anim'; S.playing = true; refreshUI();
}

/* ボタン: 下の バーの「よくある動き」の となり と、ツールの「よくある動き」の となり */
(() => {
  const b = el('button', 'btn btn-sm', '🎚 大きさ・はやさ'); b.id = 'btnTune';
  b.onclick = openTune;
  $('#btnPreset').after(b);
  const b2 = el('button', 'btn btn-sm', '🎚'); b2.id = 'btnTune2'; b2.title = '動きの 大きさ・はやさ';
  b2.onclick = openTune;
  const p2 = $('#btnPreset2'); if(p2) p2.after(b2);
})();

/* よくある動きを 入れたら、大きさを 変えられる ことを 知らせる */
const _applyWhole1 = applyWhole;
applyWhole = function(m){ _applyWhole1(m); setStatus('「' + S.proj.current + '」を 作りました。大きさ・はやさは 下の 🎚 で 変えられます'); };
