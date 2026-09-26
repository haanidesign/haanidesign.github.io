/* いちばん さいしょの 画面。
   つづきから えらぶか、あたらしく つくるか。 */
import { listDocs, deleteDoc, whenText, MAX_DOCS } from '../store.js?v=73';

export const SIZES = [
  { key: '1080x1920', w: 1080, h: 1920, label: 'たて', note: 'TikTok / Reels / Shorts' },
  { key: '1080x1080', w: 1080, h: 1080, label: 'ましかく', note: 'Instagram 投稿' },
  { key: '1920x1080', w: 1920, h: 1080, label: 'よこ', note: 'YouTube ふつうの動画' },
  { key: '1280x720', w: 1280, h: 720, label: 'よこ かるめ', note: 'うごきが かるい' }
];

export async function showStart(el, { onOpen, onNew, onDemo }) {
  const docs = await listDocs();
  el.innerHTML = '';
  el.classList.add('on');

  const card = document.createElement('div');
  card.className = 'startcard';

  if (docs.length) {
    card.appendChild(h('h1', 'つづきから'));
    card.appendChild(h('p', 'じどうで ほぞんされています。おすと つづきから はじまります。', 'sub'));
    const list = document.createElement('div');
    list.className = 'docs';
    docs.forEach(d => list.appendChild(docRow(d, onOpen, list)));
    card.appendChild(list);
    if (docs.length >= MAX_DOCS) {
      const warn = h('p', 'さくひんが ふえて います。つかわない ものは 🗑 で けすと 端末が かるく なります。', 'sub');
      warn.style.color = '#b0446a';
      card.appendChild(warn);
    }
  }

  card.appendChild(h('h1', 'はじめての ひとへ'));
  card.appendChild(h('p', '曲も 歌詞も 入った おためしが あります。ひらいて ▶ を おすだけ。', 'sub'));
  const demo = document.createElement('button');
  demo.className = 'btn-y gobtn demobtn';
  demo.textContent = '▶ デモを ひらく（さわって みる）';
  demo.addEventListener('click', () => { el.classList.remove('on'); onDemo(); });
  card.appendChild(demo);

  card.appendChild(h('h1', 'あたらしく つくる'));
  card.appendChild(h('p', 'あとから 変えられます。まよったら「たて」で だいじょうぶ。', 'sub'));

  let size = SIZES[0], fps = 30;
  const grid = document.createElement('div');
  grid.className = 'sizes';
  const btns = SIZES.map(s => {
    const b = document.createElement('button');
    b.className = 'sizebtn' + (s === size ? ' on' : '');
    const box = document.createElement('span');
    box.className = 'shape';
    const r = s.w / s.h;
    box.style.width = (r >= 1 ? 46 : 46 * r) + 'px';
    box.style.height = (r >= 1 ? 46 / r : 46) + 'px';
    b.appendChild(box);
    b.appendChild(h('b', s.label));
    b.appendChild(h('i', s.note));
    b.addEventListener('click', () => {
      size = s;
      btns.forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      go.textContent = `▶ ${s.label} ${s.w}×${s.h} ではじめる`;
    });
    grid.appendChild(b);
    return b;
  });
  card.appendChild(grid);

  const fpsRow = document.createElement('div');
  fpsRow.className = 'fpsrow';
  fpsRow.appendChild(h('span', 'コマ数', 'title'));
  [24, 30, 60].forEach(v => {
    const b = document.createElement('button');
    b.className = 'btn-sm' + (v === fps ? ' on' : '');
    b.textContent = v + ' fps';
    b.addEventListener('click', () => {
      fps = v;
      [...fpsRow.querySelectorAll('button')].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    fpsRow.appendChild(b);
  });
  card.appendChild(fpsRow);

  const go = document.createElement('button');
  go.className = 'btn-y gobtn';
  go.textContent = `▶ ${size.label} ${size.w}×${size.h} ではじめる`;
  go.addEventListener('click', () => { el.classList.remove('on'); onNew(size, fps); });
  card.appendChild(go);

  el.appendChild(card);
}

function docRow(d, onOpen, list) {
  const item = document.createElement('div');
  item.className = 'docitem';

  const b = document.createElement('button');
  b.className = 'docopen';
  const im = document.createElement('img');
  im.alt = '';
  if (d.thumb) im.src = d.thumb;
  b.appendChild(im);
  const txt = document.createElement('span');
  txt.className = 'doctext';
  txt.appendChild(h('b', d.name || 'むだい'));
  txt.appendChild(h('i', `${whenText(d.at)}・${d.clips}まい・${Math.round(d.secs)}秒` +
    (d.full ? '' : '・素材なし')));
  b.appendChild(txt);
  b.addEventListener('click', () => onOpen(d.id));
  item.appendChild(b);

  const del = document.createElement('button');
  del.className = 'docdel';
  del.textContent = '🗑';
  del.title = 'この さくひんを けす';
  del.addEventListener('click', async () => {
    if (!confirm(`「${d.name}」を けしますか？`)) return;
    await deleteDoc(d.id);
    item.remove();
    if (!list.querySelector('.docitem')) list.remove();
  });
  item.appendChild(del);
  return item;
}

function h(tag, text, cls) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
