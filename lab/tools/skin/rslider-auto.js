/* つまみを 触った だけでは 動かない ものに 置きかえる（あとから 足す 用）。
   <script type="module" src="../skin/rslider-auto.js"></script> を 1行 足す だけ。
   中身は oekaki-kobo/js/rslider.js。こちらは 見た目と、もとの つまみの 幅・並び方を 引きつぐ 役。 */
import { enhanceAll } from '../oekaki-kobo/js/rslider.js';

const CSS = `
:where(.rs){position:relative;height:28px;min-width:48px;touch-action:pan-y;cursor:ew-resize;box-sizing:border-box}
:where(.rs-track){position:absolute;left:9px;right:9px;top:9px;height:10px;border:2px solid #1E1C14;border-radius:6px;background:#FBFAEC;overflow:hidden;box-sizing:border-box}
:where(.rs-fill){height:100%;background:#E1DD60}
:where(.rs-knob){position:absolute;top:4px;width:20px;height:20px;margin-left:-10px;border:2.5px solid #1E1C14;border-radius:50%;background:#FFFEF7;box-sizing:border-box}
:where(.rs.drag .rs-knob){background:#E1DD60}
:where(.rs.rs-off){opacity:.5;pointer-events:none}
:where(.rs.rs-bg .rs-fill){background:none}
`;
if (!document.getElementById('rs-auto-css')) {
  const st = document.createElement('style'); st.id = 'rs-auto-css'; st.textContent = CSS;
  document.head.prepend(st);          // 道具の 自前の .rs が あれば そちらが 勝つ
}

/* もとの つまみが どう 置かれて いたかを 見て、置きかえた 箱に 写す */
function look(inp) {
  const cs = getComputedStyle(inp), par = inp.parentElement;
  const pd = par ? getComputedStyle(par).display : '';
  const w = inp.offsetWidth, pw = par ? par.clientWidth : 0;
  const o = { seen: w > 0, margin: cs.margin, bg: /gradient/.test(cs.backgroundImage) ? cs.backgroundImage : '' };
  if (/flex/.test(pd) && /^column/.test(getComputedStyle(par).flexDirection)) {
    o.width = cs.alignSelf === 'auto' || cs.alignSelf === 'stretch' || !w ? '100%' : w + 'px';   // 縦ならびの 中: 高さは のばさない
    o.flex = '0 0 auto';
  } else if (/flex/.test(pd)) {
    const fixed = +cs.flexGrow === 0 && cs.flexBasis === 'auto';
    o.flex = cs.flexGrow + ' ' + cs.flexShrink + ' ' + (fixed && w ? w + 'px' : cs.flexBasis);
    if (fixed && w) o.minWidth = Math.min(w, 129) + 'px';    // もとの つまみは 決めた 幅より ちぢまない
    if (fixed && !w) o.flex = '1 1 80px';
    o.alignSelf = cs.alignSelf;
  } else if (/grid/.test(pd)) {
    o.gridColumn = cs.gridColumn; o.gridRow = cs.gridRow; o.width = '100%';
  } else if (!w || cs.display === 'block' || (pw && w >= pw * 0.85)) {
    o.width = '100%';
  } else {
    o.display = 'inline-block'; o.width = w + 'px'; o.verticalAlign = 'middle';
  }
  return o;
}
function sync(inp, box) {
  box.classList.toggle('rs-off', inp.disabled);
  if (inp.hidden || inp.getAttribute('data-rs-hide') === '1') box.style.display = 'none';
}
function run(root) {
  const list = [...root.querySelectorAll('input[type=range]')].filter(i => !i.dataset.rs && !i.closest('[data-rs-skip]'));
  if (root.matches && root.matches('input[type=range]') && !root.dataset.rs) list.push(root);
  if (!list.length) return;
  const seen = list.map(i => [i, look(i)]);
  enhanceAll(root.matches && root.matches('input[type=range]') ? root.parentNode : root);
  for (const [inp, o] of seen) {
    const box = inp.nextElementSibling;
    if (!box || !box.classList.contains('rs')) continue;
    const put = o => {
      const bg = o.bg; delete o.bg; delete o.seen;
      Object.assign(box.style, o);
      if (bg) { box.classList.add('rs-bg'); box.querySelector('.rs-track').style.backgroundImage = bg; }
    };
    const hidden = !o.seen;
    put(o);
    if (hidden) {
      /* かくれて いて 幅が 分からなかった。見えた ときに、いちど もとの つまみを 出して はかり直す */
      const ro = new ResizeObserver(() => {
        if (box.offsetParent === null) return;
        ro.disconnect();
        const keep = box.style.display;
        box.style.display = 'none'; inp.style.display = '';
        const fresh = inp.offsetWidth ? look(inp) : null;
        inp.style.display = 'none'; box.style.display = keep;
        if (fresh) { box.style.flex = box.style.width = box.style.minWidth = ''; put(fresh); }
      });
      ro.observe(box);
    }
    if (inp.title) box.title = inp.title;
    sync(inp, box);
    new MutationObserver(() => sync(inp, box)).observe(inp, { attributes: true, attributeFilter: ['disabled', 'hidden'] });
  }
}
function start() {
  run(document);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) run(n);
  }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start); else start();
