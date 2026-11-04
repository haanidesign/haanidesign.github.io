/* 触った だけでは 値が 動かない つまみ。
   ページの 中の <input type="range"> を ぜんぶ これに 置きかえる。
   値は ドラッグした 分だけ 動く（指や ペンを 置いた 場所に は とばない）。
   もとの input は かくして のこし、input / change の できごとも そのまま 出す。 */

const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

function enhance(inp) {
  if (inp.dataset.rs) return;
  inp.dataset.rs = '1';
  const box = document.createElement('div');
  box.className = 'rs';
  box.innerHTML = '<div class="rs-track"><div class="rs-fill"></div></div><div class="rs-knob"></div>';
  inp.after(box);
  inp.style.display = 'none';
  const num = k => parseFloat(inp[k] || inp.getAttribute(k));
  const paint = () => {
    const min = num('min') || 0, max = isNaN(num('max')) ? 100 : num('max');
    const t = max > min ? (parseFloat(desc.get.call(inp)) - min) / (max - min) : 0;
    const p = Math.max(0, Math.min(1, t)) * 100;
    box.querySelector('.rs-fill').style.width = p + '%';
    box.querySelector('.rs-knob').style.left = `calc(9px + (100% - 18px) * ${p / 100})`;
  };
  Object.defineProperty(inp, 'value', {
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); paint(); },
  });
  let drag = null;
  box.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    box.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, v: parseFloat(desc.get.call(inp)), moved: false };
    inp.dispatchEvent(new Event('pointerdown'));
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return; // ふれただけ なら 動かさない
    drag.moved = true;
    box.classList.add('drag');
    const min = num('min') || 0, max = isNaN(num('max')) ? 100 : num('max');
    const w = Math.max(40, box.clientWidth - 18);
    let v = drag.v + dx / w * (max - min);
    const step = num('step');
    if (step > 0) v = Math.round(v / step) * step;
    v = Math.max(min, Math.min(max, v));
    if (String(v) !== desc.get.call(inp)) {
      desc.set.call(inp, v);
      paint();
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const up = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    box.classList.remove('drag');
    if (moved) inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  new ResizeObserver(paint).observe(box);
  paint();
}

export function enhanceAll(root = document) {
  for (const inp of root.querySelectorAll('input[type=range]')) enhance(inp);
}

export function watchRanges() {
  enhanceAll();
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('input[type=range]')) enhance(n);
      else enhanceAll(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
