/* 👀 ためし見。作品に 入れる まえに、小さな 窓で 動きを 見る。

   作品には まだ 入れない（もどす にも のらない）。
   「入れる」を おした ときに はじめて 作品に 足す。
   窓が 画面から 消えたら 自動で 止まる。 */
import { S } from '../state.js?v=400';

/**
 * @param box    入れる 先
 * @param o.layer  ためしに 描く レイヤー（作品には 入って いない）
 * @param o.draw   (layer, 秒, project) → canvas
 * @param o.dur    1周の 秒数
 * @param o.title  見出し
 * @param o.insert 入れる ときに よぶ
 * @param o.cancel やめる ときに よぶ
 */
export function previewBox(box, o){
  const wrap = document.createElement('div');
  wrap.className = 'pvbox';
  const head = document.createElement('div');
  head.className = 'pvhead';
  head.textContent = '👀 ためし見：' + (o.title || '');
  wrap.appendChild(head);
  const cv = document.createElement('canvas');
  const P = S.proj;
  const k = Math.min(1, 480 / Math.max(P.w, P.h));
  cv.width = Math.max(1, Math.round(P.w * k));
  cv.height = Math.max(1, Math.round(P.h * k));
  cv.className = 'pvcv';
  wrap.appendChild(cv);
  const info = document.createElement('div');
  info.className = 'pvinfo';
  wrap.appendChild(info);
  const btns = document.createElement('div');
  btns.className = 'rowbtns';
  const ok = document.createElement('button');
  ok.className = 'on';
  ok.textContent = '✅ この 動きで 入れる';
  ok.addEventListener('click', () => { stop(); o.insert(); });
  const no = document.createElement('button');
  no.textContent = '✕ やめる';
  no.addEventListener('click', () => { stop(); o.cancel(); });
  btns.append(ok, no);
  wrap.appendChild(btns);
  box.appendChild(wrap);
  requestAnimationFrame(() => { if(wrap.isConnected) wrap.scrollIntoView({ block: 'nearest' }); });

  const g = cv.getContext('2d');
  const dur = Math.max(0.5, o.dur || 3);
  const t0 = performance.now();
  let raf = 0, alive = true;
  function stop(){ alive = false; cancelAnimationFrame(raf); }
  function frame(now){
    if(!alive) return;
    if(!cv.isConnected && now - t0 > 500){ stop(); return; }
    const t = ((now - t0) / 1000) % dur;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#FFFEF7';
    g.fillRect(0, 0, cv.width, cv.height);
    try{
      const img = o.draw(o.layer, t, P);
      if(img && img.width) g.drawImage(img, 0, 0, cv.width, cv.height);
    }catch(e){ /* 描けない コマは とばす */ }
    info.textContent = t.toFixed(1) + ' / ' + dur.toFixed(1) + '秒';
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return stop;
}
