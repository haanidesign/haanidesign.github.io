/* 読み込み後に幕を上げる */
const ready = () => document.body.classList.add('ready');
if (document.readyState === 'complete') setTimeout(ready, 300);
else window.addEventListener('load', () => setTimeout(ready, 300));
setTimeout(ready, 2500);

/* スクロールで出す */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  e.target.querySelectorAll('[data-count]').forEach(countUp);
  io.unobserve(e.target);
}), { rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

/* 数字を数え上げる */
function countUp(el){
  const to = +el.dataset.count, t0 = performance.now(), dur = 1400;
  const step = t => {
    const p = Math.min((t - t0) / dur, 1), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
    el.textContent = v.toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ヒーロー背景文字をゆっくり動かす */
const bg = document.querySelector('.hero-bg');
if (bg && !matchMedia('(prefers-reduced-motion: reduce)').matches){
  addEventListener('scroll', () => { bg.style.transform = `translateY(${scrollY * .25}px)`; }, { passive:true });
}

/* カルーセル */
document.querySelectorAll('[data-carousel]').forEach(box => {
  const slides = [...box.querySelectorAll('.cslide')];
  const numEl = box.querySelector('.cnum b');
  let cur = 0;
  const go = n => {
    cur = (n + slides.length) % slides.length;
    slides.forEach((s,i) => s.classList.toggle('on', i === cur));
    if (numEl) numEl.textContent = cur + 1;
  };
  box.querySelector('.cprev').addEventListener('click', () => go(cur - 1));
  box.querySelector('.cnext').addEventListener('click', () => go(cur + 1));
  let x0 = null;
  box.addEventListener('touchstart', e => { x0 = e.changedTouches[0].clientX; }, {passive:true});
  box.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) go(dx < 0 ? cur + 1 : cur - 1);
    x0 = null;
  }, {passive:true});
});

/* 動画の音 */
document.querySelectorAll('.vbtn').forEach(btn => {
  const vid = document.getElementById(btn.dataset.vid);
  btn.addEventListener('click', () => {
    document.querySelectorAll('.vbtn').forEach(o => {
      if (o === btn) return;
      document.getElementById(o.dataset.vid).muted = true;
      o.classList.remove('on'); o.textContent = '音を出す';
    });
    vid.muted = !vid.muted;
    if (!vid.muted){ vid.volume = 0.7; if (vid.paused) vid.play(); }
    btn.classList.toggle('on', !vid.muted);
    btn.textContent = vid.muted ? '音を出す' : '音を消す';
  });
});

/* フォーム送信 */
const form = document.getElementById('cForm');
const msg = document.getElementById('formMsg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = '送信中…'; msg.textContent = '';
  try{
    const res = await fetch(form.action, { method:'POST', body:new FormData(form), headers:{Accept:'application/json'} });
    if (!res.ok) throw 0;
    form.innerHTML = '<p class="form-done">お問い合わせありがとうございます。内容を確認のうえ、ご返信いたします。</p>';
  }catch{
    btn.disabled = false; btn.textContent = '送信する';
    msg.textContent = '送れませんでした。時間をおいてもう一度お試しください。';
  }
});
