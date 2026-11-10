/* tana.js — 素材の棚に つなぐ 部品。
   手元の 棚サーバー（C:/ai/sozai-tana）が 動いて いる ときだけ 使える。
   公開サイト（https）では 何も しない。

   <script src="../../tana.js"></script>
   await HaaniTana.ready()                          つながるか
   await HaaniTana.put(blob, { name, tool, tags })  棚に 入れる（サムネは 自動）
   const files = await HaaniTana.pick({ kinds: ['image','video'], multiple: true })  棚から 選ぶ
   HaaniTana.show(el)                               つながる ときだけ el を 見せる
   HaaniTana.palettes() / savePalette(p) / removePalette(id) / pickPalette()   配色帳

   手を 入れずに つなぐ（道具の HTML に 1行 足す だけ）:
   <script src="../../tana.js" data-dock data-tool="道具の名前" data-in="#file:絵,#bg:背景"></script>
   すみに「棚」の ボタンが 出る。棚から 選んだ ものを data-in の 読みこみ口へ 渡し、
   「書き出しを 棚へ」を 入れて いる 間は、保存（<a download>・共有）を 棚に 入れる。 */
(function () {
  'use strict';
  const me = document.currentScript;
  const PORT = 8640;
  const LOCAL = ['127.0.0.1', 'localhost', '[::1]'];

  /* どこに 棚が あるか。タブレットは ランチャーの 中継（ポート +10000）を 通る */
  function findBase() {
    if (typeof window.HAANI_TANA_BASE === 'string') return window.HAANI_TANA_BASE;
    if (location.protocol !== 'http:') return null;
    const h = location.hostname;
    return 'http://' + h + ':' + (LOCAL.includes(h) ? PORT : PORT + 10000);
  }
  const base = findBase();
  const api = p => base + '/api/' + p;

  let pinged = null;
  function ready() {
    if (base === null) return Promise.resolve(false);
    if (!pinged) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 2500);
      pinged = fetch(api('ping'), { signal: ac.signal })
        .then(r => r.ok ? r.json() : null).then(j => !!(j && j.name === 'sozai-tana'))
        .catch(() => false).finally(() => clearTimeout(t));
      pinged.then(ok => { if (!ok) setTimeout(() => { pinged = null; }, 4000); });
    }
    return pinged;
  }
  function show(...els) {
    els.forEach(el => { if (el) el.hidden = true; });
    return ready().then(ok => { els.forEach(el => { if (el) el.hidden = !ok; }); return ok; });
  }

  async function call(path, opt) {
    const r = await fetch(api(path), opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '棚に つながりません');
    return j;
  }
  const jsonOpt = (method, obj) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

  /* ---------- サムネ ---------- */
  const THUMB = 360;
  function shrink(src, w, h) {
    const k = Math.min(1, THUMB / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b ? { blob: b, w, h } : null), 'image/webp', 0.82));
  }
  function loadEl(tag, url, evt) {
    return new Promise((ok, ng) => {
      const el = document.createElement(tag);
      el.muted = true; el.playsInline = true; el.preload = 'auto';
      el.addEventListener(evt, () => ok(el), { once: true });
      el.addEventListener('error', () => ng(new Error('読めない')), { once: true });
      el.src = url;
    });
  }
  async function makeThumb(blob) {
    const type = blob.type || '';
    const url = URL.createObjectURL(blob);
    try {
      if (type.startsWith('image/')) {
        const img = await loadEl('img', url, 'load');
        return await shrink(img, img.naturalWidth || 300, img.naturalHeight || 300);
      }
      if (type.startsWith('video/')) {
        const v = await loadEl('video', url, 'loadeddata');
        const d = isFinite(v.duration) ? v.duration : 0;
        await new Promise(res => {
          const t = setTimeout(res, 1500);
          v.addEventListener('seeked', () => { clearTimeout(t); res(); }, { once: true });
          v.currentTime = Math.min(0.4, d / 2);
        });
        return await shrink(v, v.videoWidth || 320, v.videoHeight || 180);
      }
    } catch (_) { /* サムネ なしで 進む */ } finally { URL.revokeObjectURL(url); }
    return null;
  }

  /* ---------- 素材 ---------- */
  const list = () => call('items');
  const fileUrl = (id, dl) => api('items/' + id + '/file' + (dl ? '?dl=1' : ''));
  const thumbUrl = it => api('items/' + it.id + '/thumb?t=' + it.created);

  async function put(blob, info) {
    info = info || {};
    const th = await makeThumb(blob);
    const q = new URLSearchParams({
      name: info.name || blob.name || 'むだい', tool: info.tool || '', tags: (info.tags || []).join(','),
      w: info.w || (th && th.w) || 0, h: info.h || (th && th.h) || 0
    });
    let meta = await call('items?' + q, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    if (th) meta = await call('items/' + meta.id + '/thumb', { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: th.blob });
    return meta;
  }
  async function get(it) {
    const r = await fetch(fileUrl(it.id));
    if (!r.ok) throw new Error('取り出せません');
    const b = await r.blob();
    const name = it.name.toLowerCase().endsWith('.' + it.ext) ? it.name : it.name + '.' + it.ext;
    return new File([b], name, { type: it.mime });
  }
  const update = (id, patch) => call('items/' + id, jsonOpt('PUT', patch));
  const remove = (id, hard) => call('items/' + id + (hard ? '?hard=1' : ''), { method: 'DELETE' });
  const restore = id => call('items/' + id + '/restore', { method: 'POST' });

  /* ---------- 配色 ---------- */
  const palettes = () => call('palettes');
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const savePalette = p => call('palettes/' + (p.id || newId()), jsonOpt('PUT', p));
  const removePalette = id => call('palettes/' + id, { method: 'DELETE' });
  const restorePalette = id => call('palettes/' + id + '/restore', { method: 'POST' });

  /* ---------- 見た目（選ぶ 窓・知らせ） ---------- */
  const CSS = `
.htn-back{position:fixed;inset:0;z-index:9990;background:rgba(30,28,20,.55);display:flex;align-items:center;justify-content:center;padding:14px}
.htn-win{width:min(920px,100%);max-height:min(760px,100%);display:flex;flex-direction:column;background:#FBFAEC;color:#1E1C14;
  border:2.5px solid #1E1C14;border-radius:12px;overflow:hidden;font:500 16px/1.6 'M PLUS Rounded 1c',system-ui,sans-serif}
.htn-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#E1DD60;border-bottom:2.5px solid #1E1C14;padding:10px 14px}
.htn-head b{font-weight:800;font-size:1.15rem;margin-right:auto}
.htn-win input[type=search]{font:inherit;min-width:0;width:200px;border:2px solid #1E1C14;border-radius:10px;background:#FFFEF7;padding:4px 10px}
.htn-win input[type=search]:focus{background:#F2F0BE;outline:none}
.htn-b{font:inherit;font-weight:700;font-size:.95rem;color:#1E1C14;background:#FFFEF7;border:2px solid #1E1C14;border-radius:10px;padding:4px 14px;cursor:pointer;white-space:nowrap}
.htn-b:hover{background:#F2F0BE}
.htn-b.on{background:#1E1C14;color:#E1DD60}
.htn-b.y{background:#E1DD60}.htn-b.y:hover{background:#B8B43F}
.htn-b:disabled{opacity:.55;cursor:default}
.htn-b:focus-visible,.htn-it:focus-visible{outline:3px solid #1E1C14;outline-offset:2px}
.htn-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;border-bottom:2.5px dotted rgba(30,28,20,.22)}
.htn-grid{flex:1;overflow:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;align-content:start;
  background:radial-gradient(circle,rgba(30,28,20,.13) 1.5px,transparent 1.6px) 0 0/16px 16px}
.htn-it{font:inherit;color:inherit;text-align:left;padding:0;background:#FFFEF7;border:2.5px solid #1E1C14;border-radius:12px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column}
.htn-it:hover{background:#F2F0BE}
.htn-it.sel{background:#E1DD60}
.htn-th{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;border-bottom:2px solid #1E1C14;background:#FFFEF7;font-size:2.2rem}
.htn-dark .htn-th{background:#1E1C14;color:#FBFAEC}
.htn-th img{width:100%;height:100%;object-fit:contain}
.htn-nm{padding:5px 9px 0;font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.htn-sub{padding:0 9px 6px;font-size:.8rem;color:#6E6857;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.htn-empty{grid-column:1/-1;padding:2.5rem 1rem;text-align:center;color:#4F4A3B}
.htn-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:10px 14px;border-top:2.5px solid #1E1C14;background:#FFFEF7}
.htn-foot span{margin-right:auto;color:#4F4A3B;font-size:.95rem}
.htn-pal{font:inherit;color:inherit;text-align:left;background:#FFFEF7;border:2.5px solid #1E1C14;border-radius:12px;padding:0;overflow:hidden;cursor:pointer}
.htn-pal:hover{background:#F2F0BE}
.htn-pal i{display:flex;height:54px;border-bottom:2px solid #1E1C14}
.htn-pal i span{flex:1}
.htn-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9995;background:#1E1C14;color:#E1DD60;border-radius:100px;
  padding:8px 20px;font:700 15px/1.5 'M PLUS Rounded 1c',system-ui,sans-serif;max-width:92vw}
@media (max-width:520px){.htn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.htn-win input[type=search]{width:100%}}
`;
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ICON = { image: '🖼', video: '🎞', audio: '🎵', other: '📦' };
  const KIND = { image: '絵', video: '動画', audio: '音', other: 'そのほか' };
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';

  let toastEl = null, toastT = 0;
  function toast(msg, ms) {
    style();
    if (!toastEl) { toastEl = el('div', 'htn-toast'); toastEl.setAttribute('role', 'status'); }
    toastEl.textContent = msg; document.body.appendChild(toastEl);
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.remove(), ms || 2400);
  }

  /* 窓の 骨組み。close(値) で 閉じて 値を 返す */
  function dialog(title) {
    style();
    const back = el('div', 'htn-back'), win = el('div', 'htn-win'), head = el('div', 'htn-head');
    win.setAttribute('role', 'dialog'); win.setAttribute('aria-modal', 'true'); win.setAttribute('aria-label', title);
    head.appendChild(el('b', null, title));
    win.appendChild(head); back.appendChild(win);
    const before = document.activeElement;
    let done;
    const result = new Promise(res => { done = res; });
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    function close(v) {
      document.removeEventListener('keydown', key, true);
      back.remove(); if (before && before.focus) before.focus();
      done(v);
    }
    document.addEventListener('keydown', key, true);
    back.addEventListener('pointerdown', e => { if (e.target === back) close(null); });
    document.body.appendChild(back);
    return { win, head, close, result };
  }

  /** 棚から 選ぶ。File の 配列を 返す（やめたら 空） */
  async function pick(opt) {
    opt = opt || {};
    const kinds = opt.kinds || ['image', 'video', 'audio'];
    if (!(await ready())) { toast('棚が 動いて いません（ランチャーで「素材の棚」を 起こす）', 3600); return []; }
    const d = dialog(opt.title || '棚から 選ぶ');
    const q = el('input'); q.type = 'search'; q.placeholder = '名前・タグで さがす'; q.setAttribute('aria-label', 'さがす');
    const dark = el('button', 'htn-b', '下地'); dark.type = 'button'; dark.title = 'サムネの 下地を 紙／黒で 切りかえ';
    const x = el('button', 'htn-b', 'とじる'); x.type = 'button'; x.onclick = () => d.close(null);
    d.head.append(q, dark, x);
    const bar = el('div', 'htn-bar'), grid = el('div', 'htn-grid'), foot = el('div', 'htn-foot');
    const info = el('span'), ok = el('button', 'htn-b y', '入れる'); ok.type = 'button';
    foot.append(info, ok);
    d.win.append(bar, grid); if (opt.multiple) d.win.appendChild(foot);

    let isDark = false;
    try { isDark = localStorage.getItem('haani-tana-dark') === '1'; } catch (_) {}
    const paintDark = () => { grid.classList.toggle('htn-dark', isDark); dark.classList.toggle('on', isDark); };
    dark.onclick = () => { isDark = !isDark; try { localStorage.setItem('haani-tana-dark', isDark ? '1' : '0'); } catch (_) {} paintDark(); };
    paintDark();

    let items = [], kind = 'all', failed = false;
    const sel = new Set();
    grid.appendChild(el('div', 'htn-empty', '読みこみ中…'));
    try { items = (await list()).filter(opt.filter || (it => kinds.includes(it.kind))); }
    catch (e) { failed = true; grid.textContent = ''; grid.appendChild(el('div', 'htn-empty', '棚を 読めませんでした。' + e.message)); }

    const give = async chosen => {
      ok.disabled = true; info.textContent = '取り出して います…';
      try { d.close(await Promise.all(chosen.map(get))); }
      catch (e) { ok.disabled = false; info.textContent = e.message; }
    };
    ok.onclick = () => give(items.filter(it => sel.has(it.id)));

    function draw() {
      bar.textContent = '';
      const have = ['image', 'video', 'audio', 'other'].filter(k => items.some(it => it.kind === k));
      if (have.length > 1) [['all', 'ぜんぶ']].concat(have.map(k => [k, KIND[k]])).forEach(([k, l]) => {
        const b = el('button', 'htn-b' + (kind === k ? ' on' : ''), l); b.type = 'button';
        b.setAttribute('aria-pressed', kind === k);
        b.onclick = () => { kind = k; draw(); };
        bar.appendChild(b);
      });
      bar.hidden = !bar.children.length;
      const word = q.value.trim().toLowerCase();
      const shown = items.filter(it => (kind === 'all' || it.kind === kind)
        && (!word || (it.name + ' ' + it.tool + ' ' + it.tags.join(' ')).toLowerCase().includes(word)));
      grid.textContent = '';
      if (!shown.length) grid.appendChild(el('div', 'htn-empty', items.length ? '当てはまる ものが ありません' : '棚は まだ 空です'));
      shown.forEach(it => {
        const b = el('button', 'htn-it' + (sel.has(it.id) ? ' sel' : '')); b.type = 'button';
        const th = el('div', 'htn-th');
        if (it.thumb) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = thumbUrl(it); th.appendChild(im); }
        else th.textContent = ICON[it.kind];
        b.append(th, el('div', 'htn-nm', it.name), el('div', 'htn-sub', [it.tool, it.w ? it.w + '×' + it.h : '', size(it.size)].filter(Boolean).join('・')));
        b.title = it.name;
        if (opt.multiple) b.setAttribute('aria-pressed', sel.has(it.id));
        b.onclick = () => {
          if (!opt.multiple) return give([it]);
          sel.has(it.id) ? sel.delete(it.id) : sel.add(it.id);
          b.classList.toggle('sel', sel.has(it.id)); b.setAttribute('aria-pressed', sel.has(it.id)); count();
        };
        grid.appendChild(b);
      });
      count();
    }
    function count() { info.textContent = sel.size ? sel.size + ' 個 えらんで います' : 'えらんで「入れる」'; ok.disabled = !sel.size; }
    q.oninput = draw;
    if (!failed) draw();
    q.focus();
    return (await d.result) || [];
  }

  /** 配色帳から 選ぶ。{ id, name, colors } か null */
  async function pickPalette() {
    if (!(await ready())) { toast('棚が 動いて いません（ランチャーで「素材の棚」を 起こす）', 3600); return null; }
    const d = dialog('配色帳から 選ぶ');
    const x = el('button', 'htn-b', 'とじる'); x.type = 'button'; x.onclick = () => d.close(null);
    d.head.appendChild(x);
    const grid = el('div', 'htn-grid'); grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(200px,1fr))';
    d.win.appendChild(grid);
    let pals = [];
    try { pals = await palettes(); } catch (e) { grid.appendChild(el('div', 'htn-empty', '読めませんでした。' + e.message)); }
    if (!pals.length && !grid.children.length) grid.appendChild(el('div', 'htn-empty', '配色は まだ ありません'));
    pals.forEach(p => {
      const b = el('button', 'htn-pal'); b.type = 'button'; b.title = p.colors.join(' ');
      const strip = el('i');
      p.colors.forEach(c => { const s = el('span'); s.style.background = c; strip.appendChild(s); });
      b.append(strip, el('div', 'htn-nm', p.name), el('div', 'htn-sub', p.colors.length + ' 色' + (p.tool ? '・' + p.tool : '')));
      b.onclick = () => d.close(p);
      grid.appendChild(b);
    });
    x.focus();
    return d.result;
  }

  /* ---------- すみの ボタン（data-dock） ---------- */
  const DOCK_CSS = `
.htn-dock{position:fixed;z-index:9980;left:10px;bottom:10px;font:700 15px/1.4 'M PLUS Rounded 1c',system-ui,sans-serif;color:#1E1C14;touch-action:none;user-select:none;-webkit-user-select:none}
.htn-dbtn{font:inherit;color:inherit;min-width:48px;height:44px;padding:0 12px;background:#E1DD60;border:2.5px solid #1E1C14;border-radius:12px;cursor:pointer;white-space:nowrap}
.htn-dbtn:hover{background:#B8B43F}
.htn-dock.on .htn-dbtn{background:#1E1C14;color:#E1DD60}
.htn-dbtn:focus-visible,.htn-menu button:focus-visible,.htn-menu a:focus-visible{outline:3px solid #1E1C14;outline-offset:2px}
.htn-menu{position:absolute;left:0;bottom:52px;min-width:230px;background:#FFFEF7;border:2.5px solid #1E1C14;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.htn-menu[hidden]{display:none}
.htn-dock.top .htn-menu{bottom:auto;top:52px}
.htn-dock.right .htn-menu{left:auto;right:0}
.htn-menu button,.htn-menu a{font:inherit;color:inherit;text-align:left;text-decoration:none;background:none;border:0;border-bottom:2.5px dotted rgba(30,28,20,.22);padding:10px 14px;min-height:44px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:8px;box-sizing:border-box}
.htn-menu > :last-child{border-bottom:0}
.htn-menu button:hover,.htn-menu a:hover{background:#F2F0BE}
.htn-menu button[aria-checked=true]{background:#E1DD60}
.htn-menu i{font-style:normal;width:1.2em;text-align:center}
`;
  function acceptOk(accept, it) {
    const list = String(accept || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return it.kind !== 'other';
    return list.some(a => a.endsWith('/*') ? it.mime.startsWith(a.slice(0, -1))
      : a[0] === '.' ? it.ext === a.slice(1) || (a === '.jpeg' && it.ext === 'jpg') : it.mime === a);
  }

  /* ほかの ボタンや つまみに かぶらない 置き場所を えらぶ */
  function freeSpot(box, cands) {
    const w = box.offsetWidth, h = box.offsetHeight;
    let best = cands[0], bestN = 1e9;
    for (const [x, y] of cands) {
      let n = 0;
      for (const [px, py] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + w / 2, y + h / 2], [x + 3, y + h - 3], [x + w - 3, y + h - 3]])
        for (const e of document.elementsFromPoint(px, py)) {
          if (box.contains(e)) continue;
          if (e.closest('button,a[href],select,input,textarea,label,[role=button],.rs,.htn-dock,.obo')) n++;
          break;
        }
      if (n < bestN) { bestN = n; best = [x, y]; if (!n) break; }
    }
    return best;
  }
  function dock(conf) {
    const tool = conf.tool || document.title;
    const ins = String(conf.in || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const i = x.lastIndexOf(':'); return i > 0 ? { sel: x.slice(0, i), label: x.slice(i + 1) } : { sel: x, label: '' };
    });
    let sendOn = false;

    /* 書き出しを つかまえる。blob: の アドレスは すぐ 消される ので、作った ときに 中身を 覚えて おく */
    const blobs = new Map();
    const mkUrl = URL.createObjectURL, rmUrl = URL.revokeObjectURL;
    URL.createObjectURL = function (o) {
      const u = mkUrl.call(URL, o);
      if (o instanceof Blob) { blobs.set(u, o); if (blobs.size > 8) blobs.delete(blobs.keys().next().value); }
      return u;
    };
    URL.revokeObjectURL = function (u) { setTimeout(() => blobs.delete(u), 15000); return rmUrl.call(URL, u); };
    let line = Promise.resolve();
    function send(blob, name) {
      line = line.then(() => put(blob, { name: String(name || 'むだい').replace(/\.[^.]+$/, ''), tool, tags: [] }))
        .then(m => toast('棚に 入れた: ' + m.name), e => toast('棚に 入りませんでした。' + e.message, 3600));
    }
    const isProject = (name, type) => /\.json$/i.test(name || '') || type === 'application/json';
    function grab(a) {
      const href = a.href || '', name = a.getAttribute('download') || 'むだい';
      if (!sendOn || !/^(blob|data):/.test(href)) return false;
      const b = blobs.get(href);
      if (b) { if (isProject(name, b.type)) return false; send(b, name); return true; }
      if (isProject(name, '')) return false;
      fetch(href).then(r => r.blob()).then(x => send(x, name), () => toast('棚に 入りませんでした', 3600));
      return true;
    }
    const aClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download') && grab(this)) return;
      return aClick.call(this);
    };
    document.addEventListener('click', e => {
      const a = e.target && e.target.closest && e.target.closest('a[download]');
      if (a && grab(a)) e.preventDefault();
    }, true);
    if (navigator.share) {
      const share = navigator.share.bind(navigator);
      navigator.share = function (data) {
        if (sendOn && data && data.files && data.files.length) { [...data.files].forEach(f => send(f, f.name)); return Promise.resolve(); }
        return share(data);
      };
    }

    /* 棚から 選んで、道具の 読みこみ口（input[type=file]）へ 渡す */
    async function bring(inp, label) {
      const files = await pick({
        multiple: inp.multiple, title: '棚から 選ぶ' + (label ? '（' + label + '）' : ''),
        filter: it => acceptOk(inp.accept, it)
      });
      if (!files.length) return;
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    ready().then(ok => {
      if (!ok) return;
      style();
      const st = document.createElement('style'); st.textContent = DOCK_CSS; document.head.appendChild(st);
      const box = el('div', 'htn-dock'), btn = el('button', 'htn-dbtn', '棚'), menu = el('div', 'htn-menu');
      btn.type = 'button'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.title = '素材の棚';
      menu.hidden = true; menu.setAttribute('role', 'menu');
      const item = (icon, text, fn) => {
        const b = el('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.append(el('i', null, icon), el('span', null, text)); b.onclick = fn; menu.appendChild(b); return b;
      };
      const shut = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      ins.forEach(x => item('⬇', '棚から 入れる' + (x.label ? '（' + x.label + '）' : ''), () => {
        shut();
        const inp = document.querySelector(x.sel);
        if (inp) bring(inp, x.label); else toast('いまは 入れる ところが ありません');
      }));
      const sw = item('⬆', '書き出しを 棚へ', () => {
        sendOn = !sendOn; sw.setAttribute('aria-checked', sendOn); box.classList.toggle('on', sendOn);
        btn.textContent = sendOn ? '棚へ' : '棚';
        toast(sendOn ? 'これから 保存する ものは 棚に 入ります' : '保存は PC に もどしました', 2800);
        shut();
      });
      sw.setAttribute('role', 'menuitemcheckbox'); sw.setAttribute('aria-checked', 'false');
      const open = el('a'); open.href = base + '/'; open.target = '_blank'; open.rel = 'noopener'; open.setAttribute('role', 'menuitem');
      open.append(el('i', null, '🗄'), el('span', null, '棚を ひらく')); open.onclick = shut; menu.appendChild(open);
      box.append(menu, btn); document.body.appendChild(box);

      /* 置き場所。じゃまな ときは つまんで 動かせる（道具ごとに 覚える） */
      const KEY = 'haani-tana-dock:' + location.pathname;
      const place = (x, y) => {
        x = Math.max(4, Math.min(innerWidth - box.offsetWidth - 4, x)); y = Math.max(4, Math.min(innerHeight - box.offsetHeight - 4, y));
        box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.bottom = 'auto';
        box.classList.toggle('top', y < innerHeight / 2); box.classList.toggle('right', x > innerWidth / 2);
      };
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (_) {}
      if (saved) place(saved.x * innerWidth, saved.y * innerHeight);
      else setTimeout(() => {
        const W = innerWidth, H = innerHeight, w = box.offsetWidth, h = box.offsetHeight;
        const [x, y] = freeSpot(box, [[10, H - h - 10], [10, H * .62], [10, H * .4], [W - w - 10, H * .62], [W - w - 10, H * .4], [W - w - 10, H - h - 10], [10, H * .2], [W - w - 10, H * .2]]);
        if (x !== 10 || y !== H - h - 10) place(x, y);
      }, 900);
      addEventListener('resize', () => { if (box.style.top) place(box.offsetLeft, box.offsetTop); });
      let drag = null, moved = false;
      btn.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop, moved: false }; btn.setPointerCapture(e.pointerId); });
      btn.addEventListener('pointermove', e => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
        drag.moved = true; shut(); place(drag.l + e.clientX - drag.x, drag.t + e.clientY - drag.y);
      });
      const up = () => {
        moved = !!(drag && drag.moved); drag = null;
        if (moved) { try { localStorage.setItem(KEY, JSON.stringify({ x: box.offsetLeft / innerWidth, y: box.offsetTop / innerHeight })); } catch (_) {} }
      };
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('click', () => {
        if (moved) { moved = false; return; }
        menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', !menu.hidden);
        if (!menu.hidden) menu.querySelector('button,a').focus();
      });
      document.addEventListener('pointerdown', e => { if (!menu.hidden && !box.contains(e.target)) shut(); }, true);
      box.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { shut(); btn.focus(); } });
    });
  }
  if (me && me.dataset.dock !== undefined && base !== null) {
    const go = () => dock({ tool: me.dataset.tool, in: me.dataset.in });
    if (document.body) go(); else addEventListener('DOMContentLoaded', go);
  }

  window.HaaniTana = {
    base, ready, show, toast, makeThumb,
    list, put, get, update, remove, restore, fileUrl, thumbUrl, pick,
    palettes, savePalette, removePalette, restorePalette, pickPalette
  };
})();
