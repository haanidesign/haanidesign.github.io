/* コマ割り表。台本（ネームの 表）を はると、ページ・コマ割り・キャラ・フキダシを いっぺんに 作る。 */
import { S, $, clamp, blankProj, toast, buzz, edit, undo, redo, canUndo, canRedo, resetHist, setOnChange } from './state.js?v=4';
import { parseScript } from './parse.js?v=4';
import { sheetsOf, sheetSVG, PW, PH } from './render.js?v=4';
import { loadProj, autoSave } from './store.js?v=4';
import { exportZip, svgToPng, download, safeName } from './export.js?v=4';
import { SAMPLE } from './sample.js?v=4';
import * as Panel from './panel.js?v=4';
import { watchRanges } from './rslider.js?v=4';
import { aiConf, listModels, chat, toTable, direct, applyDirect, castLook, applyCast } from './ai.js?v=4';

/* ---------- 画面の たかさ ---------- */
function appH() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--appH', h + 'px');
}

/* ---------- 台本を 読む ---------- */
function importScript(text) {
  const r = parseScript(text);
  if (!r.pages.length) { toast('ページが 見つかりません（「1ページ目」と 表が いります）'); return; }
  edit('台本を 読む', () => {
    const P = S.proj;
    // 前に なおした キャラの 見た目は 名前で 引きつぐ
    const old = P.cast;
    r.cast.forEach(c => {
      const o = old.find(x => x.name === c.name);
      if (!o) return;
      for (const pg of r.pages) for (const p of pg.panels) for (const f of p.figs) if (f.id === c.id) f.id = o.id;
      Object.assign(c, { id: o.id, kind: o.kind, hair: o.hair, tone: o.tone, h: o.h });
    });
    P.cast = r.cast;
    P.pages = r.pages;
    P.script = text;
  });
  S.sel = null; S.sheet = 0;
  const n = r.pages.reduce((a, p) => a + (p.spread ? 2 : 1), 0);
  const k = r.pages.reduce((a, p) => a + p.panels.length, 0);
  toast(`${n}ページ・${k}コマ・${r.cast.length}人を 作りました`);
  if (r.warn.length) setTimeout(() => toast(r.warn[0]), 2000);
  fit();
}

/* ---------- 描く ---------- */
let SHEETS = [];
function render() {
  const P = S.proj;
  SHEETS = sheetsOf(P);
  S.sheet = clamp(S.sheet, 0, Math.max(0, SHEETS.length - 1));
  $('#docName').textContent = P.title;
  const total = P.pages.reduce((a, p) => a + (p.spread ? 2 : 1), 0);
  $('#docSize').textContent = total + 'P';
  $('#undo').disabled = !canUndo();
  $('#redo').disabled = !canRedo();
  drawStage();
  drawStrip();
  Panel.draw();
  autoSave(() => S.proj);
}
setOnChange(render);

function drawStage() {
  const sh = SHEETS[S.sheet];
  const view = $('#view');
  if (!sh) { view.innerHTML = ''; $('#pageLbl').textContent = '—'; return; }
  view.innerHTML = sheetSVG(S.proj, sh, { pref: 'v', sel: S.sel });
  const ps = sh.items.map(it => S.proj.pages[it.pg]).sort((a, b) => a.no - b.no);
  const nos = ps.flatMap(p => p.spread ? [p.no, p.no2 || p.no + 1] : [p.no]).sort((a, b) => a - b);
  $('#pageLbl').textContent = nos.length > 1 ? `${nos[0]}-${nos[nos.length - 1]}P` : `${nos[0]}P`;
  $('#prevS').disabled = S.sheet <= 0;
  $('#nextS').disabled = S.sheet >= SHEETS.length - 1;
  applyZ();
}
function drawStrip() {
  const box = $('#strip');
  box.innerHTML = '';
  SHEETS.forEach((sh, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb' + (i === S.sheet ? ' on' : '');
    b.style.aspectRatio = `${sh.w} / ${PH}`;
    b.innerHTML = sheetSVG(S.proj, sh, { pref: 't' + i, plain: false });
    const nos = sh.items.map(it => S.proj.pages[it.pg]).flatMap(p => p.spread ? [p.no, p.no2 || p.no + 1] : [p.no]).sort((a, b) => a - b);
    const tag = document.createElement('span');
    tag.textContent = nos.length > 1 ? `${nos[0]}-${nos[nos.length - 1]}` : String(nos[0]);
    b.appendChild(tag);
    b.addEventListener('click', () => { S.sheet = i; S.sel = null; fit(); render(); });
    box.appendChild(b);
  });
  const on = box.querySelector('.thumb.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ---------- 見る 位置（ズーム・ずらし） ---------- */
const Z = { k: 1, x: 0, y: 0 };
function fit() {
  const sh = SHEETS[S.sheet] || { w: PW * 2 };
  const r = $('#stage').getBoundingClientRect();
  const k = Math.min((r.width - 24) / sh.w, (r.height - 24) / PH);
  Z.k = Math.max(.1, k);
  Z.x = (r.width - sh.w * Z.k) / 2;
  Z.y = (r.height - PH * Z.k) / 2;
  applyZ();
}
function applyZ() { $('#view').style.transform = `translate(${Z.x}px,${Z.y}px) scale(${Z.k})`; }
function zoomAt(px, py, f) {
  const k = clamp(Z.k * f, .15, 8);
  Z.x = px - (px - Z.x) * k / Z.k;
  Z.y = py - (py - Z.y) * k / Z.k;
  Z.k = k;
  applyZ();
}

function attachStage() {
  const st = $('#stage');
  const pts = new Map();
  let g = null;
  const local = e => { const r = st.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  st.addEventListener('pointerdown', e => {
    st.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) g = { mode: 'tap', p0: local(e), z0: { ...Z }, target: e.target };
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      g = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], z0: { ...Z } };
    } else g = { mode: 'none' };
  });
  st.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, local(e));
    const p = local(e);
    if (g.mode === 'tap' && Math.hypot(p[0] - g.p0[0], p[1] - g.p0[1]) > 7) g.mode = 'pan';
    if (g.mode === 'pan') { Z.x = g.z0.x + p[0] - g.p0[0]; Z.y = g.z0.y + p[1] - g.p0[1]; applyZ(); }
    if (g.mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.abs(d - g.d0) < 8 && Math.hypot(m[0] - g.m0[0], m[1] - g.m0[1]) < 8) return;   // トン（もどす）と まちがえない
      const k = clamp(g.z0.k * d / g.d0, .15, 8);
      Z.k = k;
      Z.x = m[0] - (g.m0[0] - g.z0.x) * k / g.z0.k;
      Z.y = m[1] - (g.m0[1] - g.z0.y) * k / g.z0.k;
      applyZ();
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (g && g.mode === 'tap' && !pts.size) {
      const hit = g.target.closest && g.target.closest('.pnl');
      if (hit) select(+hit.dataset.pg, +hit.dataset.i, true);
      else if (S.sel) { S.sel = null; render(); }
    }
    if (!pts.size) g = null;
    else if (g && g.mode === 'pinch') g = { mode: 'none' };
  };
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);
  st.addEventListener('wheel', e => {
    e.preventDefault();
    const r = st.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * .0016));
    else { Z.x -= e.deltaX; applyZ(); }
  }, { passive: false });
}

export function select(pg, i, openIt) {
  S.sel = { pg, i };
  const k = SHEETS.findIndex(sh => sh.items.some(it => it.pg === pg));
  if (k >= 0 && k !== S.sheet) { S.sheet = k; render(); fit(); }
  S.kind = 'panel';
  if (openIt) Panel.open('panel');
  render();
}
function step(d) {
  if (!S.sel) return;
  const P = S.proj;
  let { pg, i } = S.sel;
  i += d;
  while (pg >= 0 && pg < P.pages.length && (i < 0 || i >= P.pages[pg].panels.length)) {
    if (i < 0) { pg--; if (pg >= 0) i = P.pages[pg].panels.length - 1; }
    else { pg++; i = 0; }
  }
  if (pg < 0 || pg >= P.pages.length) return;
  select(pg, i, false);
}
function goSheet(d) {
  const n = clamp(S.sheet + d, 0, SHEETS.length - 1);
  if (n === S.sheet) return;
  S.sheet = n; S.sel = null;
  render(); fit();
}

/* ---------- 2本・3本指の トン ---------- */
function attachTaps() {
  const pts = new Map();
  let gest = null, lastAt = 0;
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x0: e.clientX, y0: e.clientY });
    if (!gest) gest = { t0: performance.now(), max: 1, moved: false, ok: true };
    gest.max = Math.max(gest.max, pts.size);
    if (e.target.closest && e.target.closest('input,textarea,select')) gest.ok = false;
  }, true);
  document.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p || !gest) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 18) gest.moved = true;
  }, true);
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size || !gest) return;
    const g = gest; gest = null;
    const now = performance.now();
    if (!g.ok || g.moved || now - g.t0 > 360 || now - lastAt < 500) return;   // 2回 走らない ように
    if (g.max === 2) { lastAt = now; undo(); buzz(14); }
    else if (g.max >= 3) { lastAt = now; redo(); buzz(14); }
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}

/* ---------- 書き出し・ファイル ---------- */
function busy(on, msg) {
  $('#busy').classList.toggle('on', on);
  if (msg) $('#busyMsg').textContent = msg;
}
async function exportAll() {
  if (!S.proj.pages.length) { toast('ページが ありません'); return; }
  busy(true, '書き出して います');
  try {
    const r = await exportZip(S.proj, (i, n) => {
      $('#busyFill').style.width = Math.round(i / n * 100) + '%';
      $('#busyPct').textContent = `${i + 1} / ${n}`;
    });
    download(r.blob, r.name);
    toast('書き出しました：' + r.name);
  } catch (e) { toast('書き出せませんでした：' + e.message); }
  busy(false);
}
async function exportNow() {
  const sh = SHEETS[S.sheet];
  if (!sh) return;
  const svg = sheetSVG(S.proj, sh, { pref: 'e', plain: true });
  const k = 1200 / PW;
  const png = await svgToPng(svg, Math.round(sh.w * k), Math.round(PH * k));
  download(png, `${safeName(S.proj.title)}_${$('#pageLbl').textContent}.png`);
}
function saveFile() {
  const blob = new Blob([JSON.stringify(S.proj, null, 1)], { type: 'application/json' });
  download(blob, safeName(S.proj.title) + '.name.json');
}
function pick(accept, fn) {
  const inp = $('#fileIn');
  inp.value = '';
  inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(t => fn(t, f)); };
  inp.click();
}
function loadFile() {
  pick('', t => {
    try {
      const p = JSON.parse(t);
      if (!p || !Array.isArray(p.pages)) throw new Error('ちがう ファイル');
      edit('作品を ひらく', () => { S.proj = Object.assign(blankProj(), p); });
      S.sel = null; S.sheet = 0; fit(); toast('ひらきました');
    } catch (e) { toast('ひらけません：' + e.message); }
  });
}
function pickScript() {
  pick('', t => { const ta = $('#scriptIn'); if (ta) ta.value = t; importScript(t); });
}
function clearAll() {
  if (!confirm('ページを ぜんぶ けして まっさらに しますか？（もどすで もどせます）')) return;
  edit('まっさら', () => { const t = S.proj.title; S.proj = blankProj(); S.proj.title = t; });
  S.sel = null; S.sheet = 0;
}

/* ---------- AI ---------- */
let aiAbort = null;
async function aiRun(msg, job) {
  const ac = new AbortController();
  aiAbort = ac;
  busy(true, msg);
  $('#busyFill').style.width = '0%';
  $('#busyPct').textContent = '';
  $('#busyCancel').hidden = false;
  try { return await job(ac.signal); }
  catch (e) { toast(e.name === 'AbortError' ? 'やめました' : (e.message === 'Failed to fetch' ? 'AI に つながりません（入口・CORS を 見て ください）' : e.message)); return null; }
  finally { busy(false); aiAbort = null; $('#busyCancel').hidden = true; }
}
function prog(i, n, txt) {
  $('#busyFill').style.width = Math.round(i / n * 100) + '%';
  $('#busyPct').textContent = `${txt}　${i + 1} / ${n}`;
}
async function aiDirect(scope) {
  const P = S.proj;
  let targets = [];
  if (scope === 'all') targets = P.pages.map((pg, i) => ({ pg: i, idx: pg.panels.map((_, k) => k) }));
  else if (scope === 'sheet' && SHEETS[S.sheet]) targets = SHEETS[S.sheet].items.map(it => ({ pg: it.pg, idx: P.pages[it.pg].panels.map((_, k) => k) }));
  else if (scope === 'panel' && S.sel) targets = [{ pg: S.sel.pg, idx: [S.sel.i] }];
  if (!targets.length) { toast('ページが ありません'); return; }
  if (!P.cast.length) { toast('キャラが いません。さきに 台本を 読みこんで ください'); return; }
  const snap = JSON.parse(JSON.stringify(P));
  const res = await aiRun('AI が 演出を 考えて います', sig => direct(aiConf(), snap, targets, (i, n, pg) => prog(i, n, pg.no + 'ページ目'), sig));
  if (!res) return;
  let n = 0;
  edit('AIで 演出', () => { n = applyDirect(S.proj, res); });
  toast(n ? `${n}コマを AI が 決めました` : 'AI の こたえを あてはめられませんでした');
}
async function aiCast() {
  if (!S.proj.cast.length) { toast('キャラが いません'); return; }
  const list = await aiRun('AI が 見た目を 考えて います', sig => castLook(aiConf(), S.proj, sig));
  if (!list) return;
  let n = 0;
  edit('AIで 見た目', () => { n = applyCast(S.proj, list); });
  toast(`${n}人の 見た目を 決めました`);
}
async function aiTable(text) {
  if (!String(text || '').trim()) { toast('台本が 空です'); return null; }
  return aiRun('AI が 表に して います', sig => toTable(aiConf(), text, sig));
}
async function aiModels() {
  return aiRun('モデルを さがして います', () => listModels(aiConf()));
}
async function aiTest() {
  const t = await aiRun('AI に 話しかけて います', sig => chat(aiConf(), [{ role: 'user', content: '「つながりました」と だけ 返して ください。' }], sig));
  if (t != null) toast('AI：' + String(t).replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 40));
}

/* ---------- ボタン ---------- */
function wire() {
  document.querySelectorAll('#tools .tool').forEach(b => b.addEventListener('click', () => {
    if (S.kind === b.dataset.k && Panel.isOpen() && !Panel.docked()) { Panel.close(); Panel.draw(); return; }
    Panel.open(b.dataset.k);
  }));
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  $('#fit').onclick = fit;
  $('#help').onclick = () => Panel.open('help');
  $('#export').onclick = exportAll;
  $('#docName').onclick = () => Panel.open('file');
  $('#full').onclick = () => {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
    else d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(() => { });
  };
  $('#prevS').onclick = () => goSheet(-1);
  $('#nextS').onclick = () => goSheet(1);
  $('#reroll').onclick = reroll;
  $('#fold').onclick = () => { $('#list').classList.toggle('folded'); setTimeout(fit, 50); };
  $('#ver').onclick = () => location.reload();
  $('#busyCancel').onclick = () => { if (aiAbort) aiAbort.abort(); };
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (e.key === 'ArrowLeft') goSheet(1);       // マンガは 左へ すすむ
    else if (e.key === 'ArrowRight') goSheet(-1);
    else if (e.key === 'Escape') { S.sel = null; Panel.close(); render(); }
  });
  // 下の 帯の 高さ（上の ふちの つまみ）
  const grip = $('#listGrip'), list = $('#list');
  try { const h = +localStorage.getItem('koma-wari:listH'); if (h > 80) list.style.height = h + 'px'; } catch (e) { }
  let gy = null, gh = 0;
  grip.addEventListener('pointerdown', e => { grip.setPointerCapture(e.pointerId); gy = e.clientY; gh = list.getBoundingClientRect().height; });
  grip.addEventListener('pointermove', e => {
    if (gy == null) return;
    const h = clamp(gh - (e.clientY - gy), 90, window.innerHeight * .6);
    list.style.height = h + 'px';
  });
  grip.addEventListener('pointerup', () => {
    if (gy == null) return;
    gy = null;
    try { localStorage.setItem('koma-wari:listH', String(Math.round(list.getBoundingClientRect().height))); } catch (e) { }
    fit();
  });
}
function reroll() {
  const sh = SHEETS[S.sheet];
  if (!sh) return;
  edit('割りなおす', () => { sh.items.forEach(it => { const pg = S.proj.pages[it.pg]; if (pg) pg.seed = 1 + Math.floor(Math.random() * 9999); }); });
}

/* ---------- はじめ ---------- */
async function boot() {
  appH();
  watchRanges();
  Panel.init({ aiDirect, aiCast, aiTable, aiModels, aiTest, importScript, pickScript, sample: () => SAMPLE, step, select, reroll, exportAll, exportNow, saveFile, loadFile, clearAll, stage: () => drawStage() });
  wire();
  attachStage();
  attachTaps();
  const saved = await loadProj();
  if (saved && Array.isArray(saved.pages)) S.proj = Object.assign(blankProj(), saved);
  else {
    S.proj = blankProj();
    const r = parseScript(SAMPLE);
    S.proj.pages = r.pages; S.proj.cast = r.cast; S.proj.script = SAMPLE; S.proj.title = 'みほん';
  }
  resetHist();
  render();
  fit();
  if (!saved) setTimeout(() => toast('「台本」に ネームの 表を はりつけて ください'), 600);
  window.addEventListener('resize', () => { appH(); fit(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', appH);
  new ResizeObserver(() => fit()).observe($('#stage'));
  if (window.__ready) window.__ready();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => { });
}
boot();
