/* いちばん最初の画面。どの形の動画を作るかを選ぶ。 */

import { SIZE_PRESETS } from '../state.js';

const LENGTHS = [10, 15, 30, 60];

export function showNewDoc(el, onStart){
  let size = SIZE_PRESETS[0];
  let seconds = 15;

  const card = document.createElement('div');
  card.className = 'card';

  const h1 = document.createElement('h1');
  h1.textContent = 'どの形でつくる？';
  card.appendChild(h1);

  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'あとから変えられます。まよったら「たて」でだいじょうぶ。';
  card.appendChild(sub);

  /* ---- 形えらび ---- */
  const sizes = document.createElement('div');
  sizes.className = 'sizes';
  const sizeBtns = [];

  SIZE_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'sizepick';
    b.setAttribute('aria-pressed', 'false');

    const box = document.createElement('span');
    box.className = 'box';
    // 見た目の比率をそのまま出す
    const long = 44;
    if(p.w === p.h){ box.style.width = long + 'px'; box.style.height = long + 'px'; }
    else if(p.w < p.h){ box.style.width = Math.round(long * p.w / p.h) + 'px'; box.style.height = long + 'px'; }
    else { box.style.width = long + 'px'; box.style.height = Math.round(long * p.h / p.w) + 'px'; }
    b.appendChild(box);

    const t = document.createElement('span');
    t.className = 't'; t.textContent = p.label;
    b.appendChild(t);

    const d = document.createElement('span');
    d.className = 'd'; d.textContent = p.note;
    b.appendChild(d);

    b.addEventListener('click', () => {
      size = p;
      sizeBtns.forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed','false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed','true');
      updateGo();
    });

    sizeBtns.push(b);
    sizes.appendChild(b);
  });
  sizeBtns[0].classList.add('on');
  sizeBtns[0].setAttribute('aria-pressed','true');
  card.appendChild(sizes);

  /* ---- 長さ ---- */
  const lh = document.createElement('h2');
  lh.textContent = 'ながさ';
  lh.style.cssText = 'font-size:.72rem;background:#1E1C14;color:#E1DD60;border-radius:100px;padding:.1rem .8rem;display:inline-block;margin-top:.4rem';
  card.appendChild(lh);

  const lens = document.createElement('div');
  lens.className = 'lenrow';
  const lenBtns = [];
  LENGTHS.forEach(sec => {
    const b = document.createElement('button');
    b.textContent = sec < 60 ? sec + '秒' : '1分';
    b.setAttribute('aria-pressed', String(sec === seconds));
    if(sec === seconds) b.classList.add('on');
    b.addEventListener('click', () => {
      seconds = sec;
      lenBtns.forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed','false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed','true');
      updateGo();
    });
    lenBtns.push(b);
    lens.appendChild(b);
  });
  card.appendChild(lens);

  /* ---- はじめる ---- */
  const go = document.createElement('button');
  go.className = 'go btn-y';
  card.appendChild(go);
  function updateGo(){
    go.textContent = `▶ ${size.label} ${size.w}×${size.h} ／ ${seconds < 60 ? seconds + '秒' : '1分'} ではじめる`;
  }
  updateGo();

  go.addEventListener('click', () => {
    el.style.display = 'none';
    onStart(size.w, size.h, seconds);
  });

  el.innerHTML = '';
  el.appendChild(card);
  el.style.display = 'flex';
}
