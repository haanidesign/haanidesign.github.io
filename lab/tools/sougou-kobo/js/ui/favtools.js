/* ★ お気に入りの 道具。
   左の 道具を 長押し（右クリック）すると ★ が つき、いちばん 上の「★ お気に入り」に ならぶ。
   もう いちど 長押しで はずす。この 端末だけの 好み（localStorage）。 */
const KEY = 'sougou-kobo.fav';
let favs = [];
try{ favs = JSON.parse(localStorage.getItem(KEY)) || []; }catch(_){ favs = []; }
let toast = () => {};

const tools = () => document.getElementById('tools');
const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(favs)); }catch(_){} };
export const isFav = (id) => favs.includes(id);
export const allTools = () => [...tools().querySelectorAll('.tool[id]')].filter(b => !b.closest('#favTools'));

export function toggleFav(id){
  const b = document.getElementById(id);
  if(isFav(id)) favs = favs.filter(x => x !== id);
  else favs.push(id);
  save();
  render();
  const name = b ? b.textContent.trim() : '';
  toast(isFav(id) ? '★「' + name + '」を お気に入りに' : '「' + name + '」を お気に入りから はずしました');
}

function render(){
  const T = tools();
  let box = document.getElementById('favTools');
  if(!box){
    box = document.createElement('div');
    box.id = 'favTools';
    T.insertBefore(box, T.firstChild);
  }
  box.innerHTML = '';
  const live = favs.map(id => document.getElementById(id)).filter(b => b && !b.closest('#favTools'));
  box.hidden = !live.length;
  if(live.length){
    const h = document.createElement('div');
    h.className = 'favhead';
    h.textContent = '★ お気に入り';
    box.appendChild(h);
    live.forEach(src => {
      const b = src.cloneNode(true);
      b.removeAttribute('id');
      b.dataset.fav = src.id;
      b.classList.add('favcopy');
      b.addEventListener('click', () => src.click());
      hold(b, () => toggleFav(src.id));
      box.appendChild(b);
    });
  }
  allTools().forEach(b => b.classList.toggle('isfav', isFav(b.id)));
}

/* 長押し（0.55秒）と 右クリック。長押しの あとの クリックは 道具を ひらかない */
function hold(el, fn){
  let timer = 0, fired = false, x0 = 0, y0 = 0;
  el.addEventListener('pointerdown', (e) => {
    fired = false; x0 = e.clientX; y0 = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { fired = true; if(navigator.vibrate) navigator.vibrate(12); fn(); }, 550);
  });
  el.addEventListener('pointermove', (e) => { if(Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, () => clearTimeout(timer)));
  el.addEventListener('click', (e) => { if(fired){ e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(timer); fn(); });
}

export function initFavTools(notify){
  toast = notify || toast;
  allTools().forEach(b => hold(b, () => toggleFav(b.id)));
  render();
}
