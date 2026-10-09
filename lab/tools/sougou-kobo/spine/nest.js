/* 総合工房の 骨キャラレイヤー として うごく とき（?nest=1）の 窓口。

   親（アニメ側）の 1つの レイヤーが、この ページ 1まいを もつ。
   骨・絵・動きは 親の レイヤーに JSON で しまう（この ページは 保存しない）。
   親は window.__nest.frame(t) で その 時こくの 1まいを もらう。
   ゆれ（ばね）は 前の コマからの つづきで 計算する。時間が もどったら 最初から。 */
'use strict';
(function(){
  if(!NESTED) return;
  document.body.classList.add('nested');

  const done = mkBtn('✔ 完了', async () => {
    S.playing = false;
    parent.postMessage({ nest: 'done' }, location.origin);
  }, 'btn btn-sm btn-g');
  done.id = 'nestDone';
  done.title = 'アニメの タイムラインに もどる';
  const live = $('#btnLive');
  if(live) live.replaceWith(done); else $('#titlebar').appendChild(done);

  let cv = null, st = {}, last = -1;

  function frame(t){
    const c = S.proj.canvas, a = anim();
    if(!cv) cv = document.createElement('canvas');
    if(cv.width !== c.w || cv.height !== c.h){ cv.width = c.w; cv.height = c.h; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    if(!a || !S.proj.slots.length) return cv;
    const dur = Math.max(0.05, a.dur || 1);
    const lt = a.loop === false ? Math.min(Math.max(0, t), dur) : ((t % dur) + dur) % dur;
    const p = computePose(S.proj, a, lt);
    applyIKs(S.proj, p);
    const useSpring = S.spring || S.proj.bones.some(b => b.spring);
    if(useSpring){
      if(t < last || t - last > 0.5) st = {};
      const dt = last < 0 || t <= last ? 1 / 30 : Math.min(1 / 15, t - last);
      applySprings(S.proj, p, dt, st, true);
    }
    last = t;
    paintParts(g, p, setupPose(), Math.max(blinkOn ? loopBlink(lt, dur) : 0, animEyes(a, lt)));
    return cv;
  }

  function imagesReady(){
    return Object.values(S.imgs).every(im => im.complete);
  }

  window.__nest = {
    app: 'spine',
    open(json){
      return new Promise(ok => {
        if(json) loadProject(json);
        const wait = () => imagesReady() ? ok() : setTimeout(wait, 50);
        wait();
      });
    },
    info(){
      const c = S.proj.canvas, a = anim();
      return { w: c.w, h: c.h, dur: a ? a.dur : 0, name: S.proj.name };
    },
    json(){ return S.proj.slots.length ? snapshotWithImages() : null; },
    show(t){ return frame(t); },
    async prepare(){},
    frame,
    mix(){ return null; },
    stop(){ S.playing = false; },
    async save(){},
    redraw(){ try{ fitView(); refreshUI(); }catch(_){} }
  };
  parent.postMessage({ nest: 'ready' }, location.origin);
})();
