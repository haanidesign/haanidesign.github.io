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
    a.boneTune = {};
    a.tuneSig = TUNE_SIG(a);   // いま とった ものを「もと」と して しるしを つける
  }
  return a.base;
}
/* 骨ごとの 調整（a.boneTune[骨id] = { amt, rep, shift }）
   rep   … 1ループの 中で 何回 くり返すか（つなぎ目が とばない ように 整数）
   shift … どれだけ おくらせるか（0〜0.5 周） */
function boneKeys(keys, dur, bt){
  const rep = Math.max(1, Math.round(bt.rep || 1)), shift = bt.shift || 0;
  if(rep === 1 && !shift) return keys.map(k => ({ t:k.t, v:k.v, c:k.c }));
  // 曲線を こまかく 取り直して 並べなおす
  const M = 24 * rep, out = [];
  for(let j = 0; j <= M; j++){
    const t = dur * j / M;
    let f = (t / dur) * rep - shift; f = f - Math.floor(f);
    out.push({ t: +t.toFixed(4), v: sample(keys, f * dur, dur), c:'smooth' });
  }
  return out;
}
function applyTune(a, amt, spd){
  const B = tuneBase(a);
  const dur = +(B.dur / spd).toFixed(3), ts = dur / B.dur;
  const tr = {}, BT = a.boneTune || {};
  for(const id in B.tracks){
    tr[id] = {};
    const bt = BT[id] || {}, ba = (bt.amt ?? 1) * amt;
    for(const ch in B.tracks[id]){
      tr[id][ch] = boneKeys(B.tracks[id][ch], B.dur, bt).map(k => ({
        t: +(k.t * ts).toFixed(4),
        v: isScaleCh(ch) ? 1 + (k.v - 1) * ba : k.v * ba,
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

    // ---- えらんだ 骨だけ ----
    const sl = slotById(S.sel.slot);
    const b = sl ? (slotBones(sl).main || boneById(sl.bone)) : boneById(S.sel.bone);
    body.appendChild(el('div', 'sh-h', 'えらんだ 骨だけ' + (b ? '（' + (b.parent ? b.name : '全体') + '）' : '')));
    if(!b || !tuneBase(a).tracks[b.id]){
      body.appendChild(el('div', 'sh-note', b ? 'この 骨には この 動きの キーが ありません。キャンバスか ツリーで 動いて いる 骨を えらんでね。' : '骨を えらぶと、その 骨だけ 変えられます。'));
      return;
    }
    a.boneTune = a.boneTune || {};
    const bt = a.boneTune[b.id] = a.boneTune[b.id] || { amt: 1, rep: 1, shift: 0 };
    const apply = () => applyTune(a, amt, spd);
    const BA = row('大きさ（' + b.name + '）', 0, 2.5, 0.05, bt.amt, v => Math.round(v * 100) + '%', v => { bt.amt = v; apply(); });
    const rr = el('div', 'tune-row');
    const rl = el('div', 'tune-l'); rl.append(el('b', null, 'くり返し（' + b.name + '）'), el('span', 'tune-v', '1ループの 中で'));
    const rb = el('div', 'soft-row');
    [1, 2, 3, 4].forEach(n => rb.appendChild(mkBtn('×' + n, () => {
      edit(b.name + ' くり返し ×' + n, () => { bt.rep = n; apply(); });
      rb.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i + 1 === n));
    }, 'btn btn-sm' + ((bt.rep || 1) === n ? ' on' : ''))));
    rr.append(rl, rb); body.appendChild(rr);
    const SH = row('ずらす（' + b.name + '）', 0, 0.5, 0.02, bt.shift || 0, v => v ? 'おくれ ' + Math.round(v * 100) + '%' : 'なし', v => { bt.shift = v; apply(); });
    body.appendChild(btnRow(mkBtn('この 骨を もとに もどす', () => {
      edit(b.name + ' を もとに', () => { bt.amt = 1; bt.rep = 1; bt.shift = 0; apply(); });
      BA.i.value = 1; BA.out.textContent = '100%'; SH.i.value = 0; SH.out.textContent = 'なし';
      rb.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0));
    }, 'btn btn-sm')));
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

/* 骨を えらんで いる ときの 右パネルにも 入口 */
const _buildProps6 = buildProps;
buildProps = function(){
  _buildProps6();
  const sl = slotById(S.sel.slot);
  const b = sl ? (slotBones(sl).main || boneById(sl.bone)) : boneById(S.sel.bone);
  const a = anim();
  if(!b || !a || !a.tracks[b.id]) return;
  const host = $('#props');
  const box = el('div', 'tune-box');
  box.appendChild(btnRow(mkBtn('🎚 この 骨の 動きの 大きさ・はやさ', openTune, 'btn')));
  host.insertBefore(box, host.firstChild);
};
