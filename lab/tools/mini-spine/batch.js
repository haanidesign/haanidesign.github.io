/* ミニSpine — いくつかの 動きを まとめて アニメ工房・動画工房へ 送る
   それぞれ 2秒 以上に なるまで くり返して、順番に つなぐ。 */
'use strict';

const animNames = () => Object.keys(S.proj.anims).filter(n => !n.startsWith('__'));
const repsOf = dur => Math.max(1, Math.ceil(2 / Math.max(0.1, dur) - 1e-6));

/** 動きを 1つずつ 切りかえて こまを つくる */
async function renderEach(names, fn){
  const keep = S.proj.current, out = [];
  try{
    for(let i = 0; i < names.length; i++){
      busy('こまを つくっています… ' + (i + 1) + '/' + names.length + '「' + names[i] + '」');
      await nextPaint();
      S.proj.current = names[i]; S.springState = {};
      out.push(await fn(names[i]));
    }
  }finally{ S.proj.current = keep; S.springState = {}; }
  return out;
}

async function sendMany(names, to){
  if(!names.length) return setStatus('動きを えらんでね');
  sheet.hide();
  const title = (S.proj.name && S.proj.name !== 'untitled') ? S.proj.name : 'ミニSpine';
  try{
    if(to === 'kobo'){
      let W = 0, H = 0;
      const items = await renderEach(names, name => {
        const r = renderFrames(12, 1080); W = r.W; H = r.H;
        return { name, fps: r.fps, dur: r.dur, reps: repsOf(r.dur), frames: r.frames.map(c => c.toDataURL('image/png')) };
      });
      busy('アニメ工房へ 送っています…'); await nextPaint();
      await handoffPut('mini-spine', { at: Date.now(), name: title, w: W, h: H, bg: S.proj.canvas.bg, items });
      await saveNow();
      location.href = '../anime-kobo/?from=mini-spine';
    }else{
      let W = 0, H = 0;
      const items = await renderEach(names, async name => {
        const r = renderFrames(15, 1080); W = r.W; H = r.H;
        const blob = await makeApng(r.frames, r.fps);
        return { blob, fileName: baseName() + '_' + name + '.png', len: +(r.dur * repsOf(r.dur)).toFixed(3) };
      });
      busy('動画工房へ 送っています…'); await nextPaint();
      await handoffPut('mini-spine-video', { at: Date.now(), name: title, w: W, h: H, items });
      await saveNow();
      location.href = '../douga-kobo/?from=mini-spine';
    }
  }catch(err){
    busy('');
    alert('送れませんでした: ' + (err && err.message || err));
  }
}

function openSendMany(){
  sheet.show('まとめて 送る', body => {
    body.appendChild(el('div', 'sh-note', '送る 動きを えらんでね。上から 順に つながります（短い 動きは 2秒 以上に なるまで くり返し）。'));
    const pick = new Set([S.proj.current]);
    const list = el('div', 'many-list');
    animNames().forEach(n => {
      const lb = el('label', 'many-item');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = pick.has(n);
      cb.onchange = () => { cb.checked ? pick.add(n) : pick.delete(n); };
      lb.append(cb, el('span', null, n + '（' + S.proj.anims[n].dur.toFixed(1) + '秒）'));
      list.appendChild(lb);
    });
    body.appendChild(list);
    const go = to => sendMany(animNames().filter(n => pick.has(n)), to);
    body.appendChild(btnRow(mkBtn('🎬 アニメ工房へ', () => go('kobo'), 'btn btn-y'), mkBtn('📼 動画工房へ', () => go('douga'), 'btn btn-y')));
  });
}

const _openExportB = openExport;
openExport = function(){
  _openExportB();
  if(animNames().length < 2) return;
  const g = document.querySelector('.sh-grid.wide'); if(!g) return;
  const b = mkBtn('', openSendMany, 'mv wide');
  b.append(el('i', null, '📦'), el('span', null, 'まとめて 送る'), el('small', null, 'いくつかの 動きを えらんで、順番に つないで アニメ工房・動画工房へ。'));
  g.insertBefore(b, g.children[2] || null);
};
