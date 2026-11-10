/* おぼえる — 道具に「もどす／やり直す」と「自動で しまう」を 足す
   1行で: <script src="../skin/oboeru.js" data-key="道具の名前"></script>
     id の ついた 入力（つまみ・えらぶ・チェック）と、えらぶ ボタンの ならび（.on が 1つ）を 覚える。
     data-undo="off" で もどすを つけない（自前で 持って いる 道具）。data-save="off" で しまわない。
   状態を 自分で 渡す とき: Oboeru.start({ key, get:() => 状態, set:d => { もどして 画面を 作り直す } })
   絵を 読みこんだ ときは 履歴を 区切る（そこより 前には もどらない）。Oboeru.cut() でも 区切れる。 */
(function () {
  'use strict';
  const CSS = `
.obo{position:fixed;z-index:9970;right:10px;bottom:10px;display:flex;gap:6px;font:700 18px/1 'M PLUS Rounded 1c',system-ui,sans-serif}
.obo button{font:inherit;color:#1E1C14;width:44px;height:44px;min-height:0;padding:0;background:#FFFEF7;border:2.5px solid #1E1C14;border-radius:12px;cursor:pointer}
.obo button:hover{background:#F2F0BE}
.obo button:disabled{opacity:.4;cursor:default;background:#FFFEF7}
.obo button:focus-visible{outline:3px solid #1E1C14;outline-offset:2px}
.obo-t{position:fixed;z-index:9971;right:10px;bottom:62px;font:700 14px/1.4 'M PLUS Rounded 1c',system-ui,sans-serif;color:#1E1C14;background:#E1DD60;border:2.5px solid #1E1C14;border-radius:100px;padding:4px 12px;pointer-events:none}
@media print{.obo,.obo-t{display:none}}
`;
  let o = null, last = '', busy = false, timer = 0, saveT = 0, tip = null, tipT = 0;
  const und = [], red = [];
  let bU = null, bR = null;

  const ctrls = () => [...document.querySelectorAll('input[id],select[id],textarea[id]')]
    .filter(e => e.type !== 'file' && e.type !== 'button' && e.type !== 'submit' && e.dataset.oboeru !== 'off' && !e.closest('.htn-dock,.obo,.hc-pop'));
  function formGet() {
    const f = {};
    ctrls().forEach(e => { f[e.id] = (e.type === 'checkbox' || e.type === 'radio') ? e.checked : e.value; });
    return f;
  }
  function formSet(f) {
    if (!f) return;
    ctrls().forEach(e => {
      if (!(e.id in f)) return;
      const box = e.type === 'checkbox' || e.type === 'radio', v = f[e.id];
      if (box ? e.checked === v : e.value === String(v)) return;
      if (box) e.checked = v; else e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  /* えらぶ ボタンの ならび: id の ある 入れものの 直下に ボタンが 2つ以上、うち 1つだけ .on */
  const ON = '.on,.active,.sel,[aria-pressed="true"]';
  function segs() {
    const r = [];
    document.querySelectorAll('[id]').forEach(box => {
      if (box.closest('.htn-dock,.obo,.hc-pop') || box.dataset.oboeru === 'off') return;
      const bs = [...box.children].filter(c => c.tagName === 'BUTTON');
      if (bs.length < 2) return;
      const on = bs.filter(b => b.matches(ON));
      if (on.length === 1) r.push([box.id, bs, bs.indexOf(on[0])]);
    });
    return r;
  }
  function segGet() { const g = {}; segs().forEach(x => { g[x[0]] = x[2]; }); return g; }
  function segSet(g) {
    if (!g) return;
    for (let pass = 0; pass < 2; pass++) segs().forEach(x => { const i = g[x[0]]; if (i != null && i !== x[2] && x[1][i] && !x[1][i].matches('.add')) x[1][i].click(); });
  }
  function snap() {
    try { return JSON.stringify({ s: o.get ? o.get() : null, f: o.forms ? formGet() : null, g: o.forms ? segGet() : null }); } catch (_) { return last; }
  }
  function apply(str) {
    busy = true;
    try {
      const d = JSON.parse(str);
      if (o.set && d.s != null) o.set(d.s);
      if (o.forms) { segSet(d.g); formSet(d.f); }
    } catch (e) { console.warn('oboeru', e); }
    busy = false;
    last = snap();
    store(); btns();
  }
  function store() {
    if (!o.save) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem('oboeru:' + o.key, last); } catch (_) {} }, 400);
  }
  function check() {
    if (!o || busy) return;
    const cur = snap();
    if (cur === last) return;
    if (o.undo) { und.push(last); if (und.length > 80) und.shift(); red.length = 0; }
    last = cur; store(); btns();
  }
  function later(ms) { clearTimeout(timer); timer = setTimeout(check, ms || 250); }
  function btns() { if (bU) { bU.disabled = !und.length; bR.disabled = !red.length; } }
  function say(t) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'obo-t'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.textContent = t; tip.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 1100);
  }
  function undo() { if (!o || !o.undo) return; check(); if (!und.length) return; red.push(last); apply(und.pop()); say('もどした'); }
  function redo() { if (!o || !o.undo) return; check(); if (!red.length) return; und.push(last); apply(red.pop()); say('やり直した'); }
  function cut() { if (!o) return; clearTimeout(timer); und.length = 0; red.length = 0; last = snap(); store(); btns(); }

  function start(conf) {
    o = Object.assign({ undo: true, save: true, touch: true }, conf);
    if (o.forms === undefined) o.forms = !o.get;
    if (!o.key) o.key = location.pathname;
    if (o.save) {
      let s = null;
      try { s = localStorage.getItem('oboeru:' + o.key); } catch (_) {}
      if (s) apply(s);
    }
    last = snap();
    ['change', 'pointerup', 'keyup'].forEach(t => document.addEventListener(t, e => {
      if (busy) return;
      if (t === 'change' && e.target && e.target.type === 'file') { setTimeout(cut, 1200); return; }
      later(t === 'change' ? 80 : 300);
    }, true));
    addEventListener('pagehide', () => { check(); if (o.save) { try { localStorage.setItem('oboeru:' + o.key, last); } catch (_) {} } });
    if (!o.undo) return;

    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const box = document.createElement('div'); box.className = 'obo';
    bU = document.createElement('button'); bU.type = 'button'; bU.textContent = '↶'; bU.title = 'もどす (Ctrl+Z)'; bU.setAttribute('aria-label', 'もどす');
    bR = document.createElement('button'); bR.type = 'button'; bR.textContent = '↷'; bR.title = 'やり直す (Ctrl+Shift+Z)'; bR.setAttribute('aria-label', 'やり直す');
    bU.onclick = undo; bR.onclick = redo; box.append(bU, bR); document.body.appendChild(box); btns();

    addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const t = e.target;
      if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|url|email|number|password|)$/.test(t.type)))) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    });

    /* 2本指タップで もどす、3本指タップで やり直す */
    if (o.touch) {
      let n = 0, t0 = 0, sx = 0, sy = 0, far = false, lastTap = 0;
      addEventListener('touchstart', e => {
        if (e.touches.length === 1) { t0 = performance.now(); far = false; n = 1; }
        n = Math.max(n, e.touches.length); sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      addEventListener('touchmove', e => { if (Math.hypot(e.touches[0].clientX - sx, e.touches[0].clientY - sy) > 14) far = true; }, { passive: true });
      addEventListener('touchend', e => {
        if (e.touches.length) return;
        const now = performance.now();
        if (!far && n >= 2 && now - t0 < 350 && now - lastTap > 500) { lastTap = now; if (n === 2) undo(); else if (n === 3) redo(); }
        n = 0;
      }, { passive: true });
    }
  }
  window.Oboeru = { start, undo, redo, cut, check };
  const me = document.currentScript;
  if (me && me.dataset.key) {
    const go = () => start({ key: me.dataset.key, undo: me.dataset.undo !== 'off', save: me.dataset.save !== 'off' });
    if (document.readyState === 'complete') setTimeout(go, 0); else addEventListener('load', () => setTimeout(go, 0));
  }
})();
