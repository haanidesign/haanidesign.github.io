/* どうが編集台 — ブラウザだけで動く動画編集台
   素材だな / 多段タイムライン / 切り貼り / 文字・歌詞 / 書き出し */

/* ============================================================
   0. 小道具
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const uid = () => Math.random().toString(36).slice(2, 9);
const r2 = v => Math.round(v * 100) / 100;

function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
function tc(sec, fps) {
  sec = Math.max(0, sec);
  const f = Math.floor((sec % 1) * fps);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(f)}`;
}

/* ============================================================
   1. 状態
   ============================================================ */
const S = {
  fps: 30, W: 1280, H: 720, bg: '#101010',
  tracks: [],
  time: 0, pps: 60,
  sel: null, selTrack: null,
  tool: 'select', snap: true, ripple: false,
  playing: false
};
const MEDIA = new Map();           // id -> {id,name,kind,url,el,dur,w,h,peaks}
let HIST = [], HPOS = -1;

const newTrack = (kind, name) => ({ id: uid(), kind, name, mute: false, hidden: false, lock: false, clips: [] });

function bootProject() {
  S.tracks = [
    newTrack('video', '文字 1'),
    newTrack('video', '映像 2'),
    newTrack('video', '映像 1'),
    newTrack('audio', '音 1')
  ];
  S.tracks[0].kind = 'text';
  S.time = 0; S.sel = null;
}

const allClips = () => S.tracks.flatMap(t => t.clips.map(c => ({ c, t })));
const findClip = id => { for (const t of S.tracks) { const c = t.clips.find(c => c.id === id); if (c) return { c, t }; } return null; };
const trackOf = id => S.tracks.find(t => t.id === id);
const duration = () => Math.max(1, ...allClips().map(({ c }) => c.start + c.dur));

/* --- undo --- */
function snap(label) {
  const s = JSON.stringify({ tracks: S.tracks, sel: S.sel });
  if (HIST[HPOS] === s) return;
  HIST = HIST.slice(0, HPOS + 1);
  HIST.push(s); HPOS = HIST.length - 1;
  if (HIST.length > 60) { HIST.shift(); HPOS--; }
  if (label) S._last = label;
}
function restore(i) {
  if (i < 0 || i >= HIST.length) return;
  HPOS = i;
  const o = JSON.parse(HIST[i]);
  S.tracks = o.tracks; S.sel = o.sel;
  drawAll();
}
const undo = () => { if (HPOS > 0) { restore(HPOS - 1); toast('もどした'); } };
const redo = () => { if (HPOS < HIST.length - 1) { restore(HPOS + 1); toast('やりなおした'); } };

/* ============================================================
   2. 素材だな
   ============================================================ */
let AC = null, recDest = null;
const srcNodes = new Map();

function audioCtx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    recDest = AC.createMediaStreamDestination();
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function hookAudio(m) {
  if (m.kind === 'image' || srcNodes.has(m.id)) return;
  try {
    const ac = audioCtx();
    const node = ac.createMediaElementSource(m.el);
    node.connect(ac.destination);
    node.connect(recDest);
    srcNodes.set(m.id, node);
  } catch (e) { /* 対応していない時は素の音のまま */ }
}

function kindOf(file) {
  if (file.type.startsWith('video')) return 'video';
  if (file.type.startsWith('audio')) return 'audio';
  if (file.type.startsWith('image')) return 'image';
  const e = file.name.split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(e)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(e)) return 'audio';
  return 'image';
}

function importFiles(files) {
  const list = [...files];
  if (!list.length) return;
  let done = 0;
  list.forEach(file => {
    const kind = kindOf(file);
    const url = URL.createObjectURL(file);
    const m = { id: uid(), name: file.name, kind, url, dur: 5, w: S.W, h: S.H, peaks: null, file };
    if (kind === 'image') {
      const el = new Image();
      el.addEventListener('load', () => { m.w = el.naturalWidth; m.h = el.naturalHeight; makePoster(m); ready(); }, { once: true });
      el.addEventListener('error', ready, { once: true });
      el.src = url; m.el = el;
    } else {
      const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
      el.src = url; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      el.playsInline = true; el.muted = false;
      el.addEventListener('loadedmetadata', () => {
        m.dur = isFinite(el.duration) ? el.duration : 10;
        if (kind === 'video') { m.w = el.videoWidth || S.W; m.h = el.videoHeight || S.H; makePoster(m); }
        ready();
      }, { once: true });
      el.addEventListener('error', ready, { once: true });
      el.addEventListener('seeked', () => { if (!S.playing) renderStage(S.time); });
      m.el = el;
      if (kind === 'audio') makePeaks(m, file);
    }
    MEDIA.set(m.id, m);
    function ready() { if (++done === list.length) { drawBin(); } else drawBin(); }
  });
  drawBin();
  toast(list.length + ' 個 とりこんだ');
}

async function makePeaks(m, file) {
  try {
    const buf = await file.arrayBuffer();
    const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const ab = await ac.decodeAudioData(buf);
    const ch = ab.getChannelData(0);
    const N = 1200, step = Math.max(1, Math.floor(ch.length / N)), peaks = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let mx = 0;
      for (let j = 0; j < step; j += 4) { const v = Math.abs(ch[i * step + j] || 0); if (v > mx) mx = v; }
      peaks[i] = mx;
    }
    m.peaks = peaks; m.dur = ab.duration;
    drawTimeline();
  } catch (e) { /* 波は出さない */ }
}

function drawBin() {
  const body = $('#binBody');
  body.innerHTML = '';
  $('#binCount').textContent = MEDIA.size;
  if (!MEDIA.size) {
    body.innerHTML = '<div class="empty">まだ なにも ない</div>';
    return;
  }
  for (const m of MEDIA.values()) {
    const d = document.createElement('div');
    d.className = 'mitem'; d.draggable = true; d.dataset.mid = m.id;
    const icon = { video: '🎞', image: '🖼', audio: '🎵' }[m.kind];
    d.innerHTML = `<div class="mthumb">${icon}</div>
      <div class="mmeta"><div class="mname" title="${m.name}">${m.name}</div>
      <div class="msub dot">${m.kind === 'image' ? `${m.w}×${m.h}` : r2(m.dur) + 's'}</div></div>
      <button class="tbtn" data-act="add" title="タイムラインに足す">＋</button>`;
    if (m.kind !== 'audio') {
      const t = d.querySelector('.mthumb');
      t.textContent = '';
      const cv = document.createElement('canvas');
      cv.width = 46; cv.height = 32; cv.style.width = '100%'; cv.style.height = '100%';
      t.appendChild(cv);
      thumbInto(cv, m);
    }
    d.addEventListener('click', e => {
      if (e.target.dataset.act === 'add') { addFromMedia(m, S.time); return; }
      $$('.mitem').forEach(x => x.classList.remove('sel'));
      d.classList.add('sel');
    });
    d.addEventListener('dblclick', () => addFromMedia(m, S.time));
    d.addEventListener('dragstart', e => e.dataTransfer.setData('text/mid', m.id));
    body.appendChild(d);
  }
}
function makePoster(m) {
  // 1枚だけ 見本の絵を とっておく（だなの札にも 帯にも つかう）
  const grab = () => {
    const cv = document.createElement('canvas');
    const sw = m.w || 16, sh = m.h || 9;
    cv.width = 192; cv.height = Math.max(1, Math.round(192 * sh / sw));
    try { cv.getContext('2d').drawImage(m.el, 0, 0, cv.width, cv.height); m.poster = cv; } catch (e) { return; }
    drawBin(); drawTimeline();
  };
  if (m.kind === 'image') { m.el.complete ? grab() : m.el.addEventListener('load', grab, { once: true }); return; }
  if (m.kind !== 'video') return;
  const el = m.el;
  const onSeek = () => { grab(); el.removeEventListener('seeked', onSeek); };
  const go = () => { el.addEventListener('seeked', onSeek); el.currentTime = Math.min(0.2, m.dur / 2); };
  el.readyState >= 2 ? go() : el.addEventListener('loadeddata', go, { once: true });
}
function thumbInto(cv, m) {
  const g = cv.getContext('2d');
  g.fillStyle = '#FBFAEC'; g.fillRect(0, 0, cv.width, cv.height);
  if (!m.poster) return;
  const s = Math.max(cv.width / m.poster.width, cv.height / m.poster.height);
  const w = m.poster.width * s, h = m.poster.height * s;
  g.drawImage(m.poster, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
}

/* ============================================================
   3. ふだ（クリップ）を作る
   ============================================================ */
function newClip(kind, o = {}) {
  return Object.assign({
    id: uid(), kind, mid: null, name: '',
    start: 0, dur: 4, inp: 0,
    x: 0, y: 0, scale: 1, rot: 0, opacity: 1, fit: 'contain',
    vol: 1, fin: 0, fout: 0, speed: 1,
    fx: { br: 100, ct: 100, sa: 100, bl: 0, hue: 0, sepia: 0 },
    anim: 'none',
    text: { str: 'ここに 文字', size: 72, color: '#FFFEF7', stroke: '#1E1C14', sw: 8, weight: 800, align: 'center', bgOn: false, bgColor: '#E1DD60' }
  }, o);
}

function laneFor(kind) {
  const want = kind === 'audio' ? 'audio' : kind === 'text' ? 'text' : 'video';
  let t = S.tracks.find(t => t.kind === want && !t.lock);
  if (!t) { t = newTrack(want, want === 'audio' ? '音' : want === 'text' ? '文字' : '映像'); S.tracks.push(t); }
  return t;
}
function freeSlot(track, from, dur) {
  let s = from;
  const sorted = [...track.clips].sort((a, b) => a.start - b.start);
  for (const c of sorted) {
    if (s + dur > c.start + 1e-6 && c.start + c.dur > s + 1e-6) s = c.start + c.dur;
  }
  return s;
}
function freeLane(kind, items) {
  const hit = (t) => t.clips.some(c => items.some(n => n.start < c.start + c.dur - 1e-6 && c.start < n.start + n.dur - 1e-6));
  let t = S.tracks.find(t => t.kind === kind && !t.lock && !hit(t));
  if (!t) {
    t = newTrack(kind, ({ video: '映像', audio: '音', text: '文字' })[kind] + ' ' + (S.tracks.filter(x => x.kind === kind).length + 1));
    S.tracks.unshift(t);
  }
  return t;
}
function addFromMedia(m, at = 0, track = null) {
  const kind = m.kind;
  const t = track || laneFor(kind);
  const c = newClip(kind, { mid: m.id, name: m.name, dur: kind === 'image' ? 4 : Math.min(m.dur, 600), inp: 0 });
  c.start = freeSlot(t, Math.max(0, at), c.dur);
  t.clips.push(c);
  S.sel = c.id;
  hookAudio(m);
  snap('add'); drawAll();
  return c;
}
function addText(at = S.time, str) {
  const t = laneFor('text');
  const c = newClip('text', { name: '文字', dur: 3 });
  if (str) c.text.str = str;
  c.start = freeSlot(t, at, c.dur);
  t.clips.push(c); S.sel = c.id;
  snap('text'); drawAll();
  return c;
}

/* ============================================================
   4. 画面に えがく
   ============================================================ */
const stage = $('#stage');
const G = stage.getContext('2d');

function activeClips(t) {
  const out = [];
  for (let i = S.tracks.length - 1; i >= 0; i--) {     // 下の段から先に描く
    const tr = S.tracks[i];
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      if (t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6) out.push({ c, tr });
    }
  }
  return out;
}
function fadeAlpha(c, local) {
  let a = 1;
  if (c.fin > 0) a *= clamp(local / c.fin, 0, 1);
  if (c.fout > 0) a *= clamp((c.dur - local) / c.fout, 0, 1);
  return a;
}
function filterStr(fx) {
  return `brightness(${fx.br}%) contrast(${fx.ct}%) saturate(${fx.sa}%)` +
    (fx.bl ? ` blur(${fx.bl}px)` : '') + (fx.hue ? ` hue-rotate(${fx.hue}deg)` : '') +
    (fx.sepia ? ` sepia(${fx.sepia}%)` : '');
}

function renderStage(t) {
  G.setTransform(1, 0, 0, 1, 0, 0);
  G.globalAlpha = 1; G.filter = 'none';
  G.fillStyle = S.bg; G.fillRect(0, 0, S.W, S.H);
  for (const { c, tr } of activeClips(t)) {
    if (c.kind === 'audio') continue;
    const local = t - c.start;
    let alpha = c.opacity * fadeAlpha(c, local);
    let sx = 1, dy = 0;
    const p = clamp(local / Math.min(0.5, c.dur), 0, 1);
    if (c.anim === 'fade') alpha *= p;
    if (c.anim === 'zoom') sx = 0.86 + 0.14 * p;
    if (c.anim === 'up') dy = (1 - p) * S.H * 0.06;
    if (c.anim === 'kenburns') sx = 1.06 + 0.10 * (local / c.dur);
    if (alpha <= 0.002) continue;

    G.save();
    G.globalAlpha = clamp(alpha, 0, 1);
    G.translate(S.W / 2 + c.x, S.H / 2 + c.y + dy);
    G.rotate(c.rot * Math.PI / 180);
    G.scale(c.scale * sx, c.scale * sx);

    if (c.kind === 'text') drawText(c);
    else {
      const m = MEDIA.get(c.mid);
      if (!m) { G.restore(); continue; }
      const el = m.el;
      const ok = c.kind === 'image' ? el.complete && el.naturalWidth : el.readyState >= 2;
      if (!ok) { G.restore(); continue; }
      const sw = m.w || S.W, sh = m.h || S.H;
      const s = c.fit === 'cover' ? Math.max(S.W / sw, S.H / sh)
        : c.fit === 'fill' ? 1 : Math.min(S.W / sw, S.H / sh);
      const w = c.fit === 'fill' ? S.W : sw * s, h = c.fit === 'fill' ? S.H : sh * s;
      G.filter = filterStr(c.fx);
      try { G.drawImage(el, -w / 2, -h / 2, w, h); } catch (e) { }
      G.filter = 'none';
    }
    G.restore();
  }
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1; G.filter = 'none';
  if (S.sel && !S.playing) drawHandles();
}

function drawText(c) {
  const T = c.text;
  const lines = String(T.str).split('\n');
  const lh = T.size * 1.32;
  G.font = `${T.weight} ${T.size}px 'M PLUS Rounded 1c', sans-serif`;
  G.textAlign = T.align; G.textBaseline = 'middle';
  G.lineJoin = 'round'; G.miterLimit = 2;
  const ax = T.align === 'left' ? -S.W / 2 + 60 : T.align === 'right' ? S.W / 2 - 60 : 0;
  const y0 = -(lines.length - 1) * lh / 2;
  if (T.bgOn) {
    let wMax = 0;
    lines.forEach(l => wMax = Math.max(wMax, G.measureText(l).width));
    const pad = T.size * 0.34;
    const bx = T.align === 'left' ? ax - pad : T.align === 'right' ? ax - wMax - pad : -wMax / 2 - pad;
    G.fillStyle = T.bgColor;
    G.strokeStyle = '#1E1C14'; G.lineWidth = Math.max(3, T.size * 0.07);
    const rr = T.size * 0.22, bw = wMax + pad * 2, bh = lines.length * lh + pad;
    G.beginPath();
    if (G.roundRect) G.roundRect(bx, y0 - lh / 2 - pad / 2, bw, bh, rr);
    else G.rect(bx, y0 - lh / 2 - pad / 2, bw, bh);
    G.fill(); G.stroke();
  }
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    if (T.sw > 0) { G.strokeStyle = T.stroke; G.lineWidth = T.sw; G.strokeText(l, ax, y); }
    G.fillStyle = T.color; G.fillText(l, ax, y);
  });
}

function drawHandles() {
  const f = findClip(S.sel); if (!f || f.c.kind === 'audio') return;
  const c = f.c;
  const m = c.mid ? MEDIA.get(c.mid) : null;
  let w = S.W, h = S.H;
  if (m && c.fit !== 'fill') {
    const sw = m.w || S.W, sh = m.h || S.H;
    const s = c.fit === 'cover' ? Math.max(S.W / sw, S.H / sh) : Math.min(S.W / sw, S.H / sh);
    w = sw * s; h = sh * s;
  }
  w *= c.scale; h *= c.scale;
  G.save();
  G.translate(S.W / 2 + c.x, S.H / 2 + c.y);
  G.rotate(c.rot * Math.PI / 180);
  G.strokeStyle = '#E1DD60'; G.lineWidth = 4; G.setLineDash([14, 10]);
  G.strokeRect(-w / 2, -h / 2, w, h);
  G.setLineDash([]);
  G.strokeStyle = '#1E1C14'; G.lineWidth = 2; G.strokeRect(-w / 2, -h / 2, w, h);
  for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    G.fillStyle = '#E1DD60';
    G.beginPath(); G.arc(hx * w / 2, hy * h / 2, 11, 0, 7); G.fill(); G.stroke();
  }
  G.restore();
}

/* ============================================================
   5. さいせい
   ============================================================ */
let raf = 0, t0 = 0, base = 0;

function syncMedia(t) {
  const act = new Set();
  for (const { c, tr } of activeClips(t)) {
    if (!c.mid) continue;
    const m = MEDIA.get(c.mid); if (!m || m.kind === 'image') continue;
    act.add(m.id);
    const want = clamp(c.inp + (t - c.start) * (c.speed || 1), 0, Math.max(0, m.dur - 0.02));
    const vol = tr.mute ? 0 : clamp(c.vol * fadeAlpha(c, t - c.start), 0, 1);
    m.el.volume = vol;
    m.el.playbackRate = c.speed || 1;
    if (S.playing) {
      if (Math.abs(m.el.currentTime - want) > 0.25) m.el.currentTime = want;
      if (m.el.paused) { hookAudio(m); m.el.play().catch(() => { }); }
    } else {
      if (!m.el.paused) m.el.pause();
      if (Math.abs(m.el.currentTime - want) > 0.03) m.el.currentTime = want;
    }
  }
  for (const m of MEDIA.values()) {
    if (m.kind !== 'image' && !act.has(m.id) && !m.el.paused) m.el.pause();
  }
}

function seek(t, quiet) {
  S.time = clamp(t, 0, duration());
  syncMedia(S.time);
  renderStage(S.time);
  updatePlayhead();
  $('#tcode').textContent = tc(S.time, S.fps);
  if (!quiet) autoScrollTL();
}
function loop(ts) {
  if (!S.playing) return;
  if (!t0) t0 = ts;
  S.time = base + (ts - t0) / 1000;
  if (S.time >= duration()) { S.time = duration(); pause(); seek(S.time); return; }
  syncMedia(S.time);
  renderStage(S.time);
  updatePlayhead();
  $('#tcode').textContent = tc(S.time, S.fps);
  autoScrollTL();
  raf = requestAnimationFrame(loop);
}
function play() {
  if (S.playing) return;
  if (S.time >= duration() - 0.02) S.time = 0;
  audioCtx();
  S.playing = true; base = S.time; t0 = 0;
  $('#btnPlay').innerHTML = '⏸ とめる';
  $('#btnPlay').classList.add('btn-p');
  raf = requestAnimationFrame(loop);
}
function pause() {
  S.playing = false; cancelAnimationFrame(raf);
  for (const m of MEDIA.values()) if (m.kind !== 'image' && !m.el.paused) m.el.pause();
  $('#btnPlay').innerHTML = '▶ さいせい';
  $('#btnPlay').classList.remove('btn-p');
  renderStage(S.time);
}
const toggle = () => S.playing ? pause() : play();

/* ============================================================
   6. 書き出し
   ============================================================ */
let REC = null;
async function exportMovie(opt) {
  if (!allClips().length) { toast('なにも 置いていない'); return; }
  pause();
  const dur = duration();
  audioCtx();
  for (const m of MEDIA.values()) hookAudio(m);

  const vs = stage.captureStream(S.fps);
  const tracks = [...vs.getVideoTracks()];
  if (recDest) tracks.push(...recDest.stream.getAudioTracks());
  const stream = new MediaStream(tracks);

  const cands = [
    `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`, `video/mp4`
  ].filter(t => !window.MediaRecorder || MediaRecorder.isTypeSupported(t));
  if (!cands.length) { toast('この ブラウザでは 書き出せない'); return; }

  const chunks = [];
  REC = new MediaRecorder(stream, { mimeType: cands[0], videoBitsPerSecond: opt.bps });
  REC.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  REC.onstop = () => {
    const blob = new Blob(chunks, { type: cands[0] });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (opt.name || 'movie') + (cands[0].includes('mp4') ? '.mp4' : '.webm');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('#recDot').classList.remove('on');
    REC = null;
    toast('書き出した（' + r2(blob.size / 1048576) + 'MB）');
  };

  seek(0, true);
  await new Promise(r => setTimeout(r, 400));
  REC.start(200);
  $('#recDot').classList.add('on');
  play();
  const tick = setInterval(() => {
    $('#recTime').textContent = r2(S.time) + ' / ' + r2(dur) + 's';
    if (!S.playing || S.time >= dur - 0.01) {
      clearInterval(tick);
      setTimeout(() => { if (REC && REC.state !== 'inactive') REC.stop(); pause(); }, 300);
    }
  }, 100);
}

/* ============================================================
   7. タイムライン
   ============================================================ */
const lanes = $('#lanes'), heads = $('#headsBody'), scroll = $('#scroll');
const x2t = x => x / S.pps;
const t2x = t => t * S.pps;

function tlWidth() { return Math.max(scroll.clientWidth + 200, t2x(duration()) + 400); }

function drawRuler() {
  const cv = $('#rulerCv'), w = tlWidth();
  cv.width = w; cv.style.width = w + 'px';
  const g = cv.getContext('2d');
  g.fillStyle = '#F2F0BE'; g.fillRect(0, 0, w, 24);
  const steps = [1 / S.fps, 0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find(s => s * S.pps > 62) || 600;
  g.strokeStyle = '#1E1C14'; g.fillStyle = '#1E1C14';
  g.font = "10px 'DotGothic16', monospace"; g.textBaseline = 'top';
  for (let t = 0; t2x(t) < w; t += step) {
    const x = Math.round(t2x(t)) + .5;
    g.globalAlpha = .9; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 24); g.stroke();
    g.fillText(t >= 60 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : r2(t) + 's', x + 3, 2);
    const sub = step / (step * S.pps > 140 ? 4 : 2);
    for (let k = 1; k * sub < step; k++) {
      const sx = Math.round(t2x(t + k * sub)) + .5;
      g.globalAlpha = .35; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(sx, 19); g.lineTo(sx, 24); g.stroke();
    }
  }
  g.globalAlpha = 1;
}

function drawHeads() {
  heads.innerHTML = '';
  S.tracks.forEach((tr, i) => {
    const d = document.createElement('div');
    d.className = 'thead' + (S.selTrack === tr.id ? ' sel' : '');
    const icon = { video: '🎞', audio: '🎵', text: '🅣' }[tr.kind];
    d.innerHTML = `<div class="thead-name">${icon} <span contenteditable class="tname">${tr.name}</span></div>
      <div class="thead-btns">
        <button class="tbtn ${tr.hidden ? 'off' : 'on'}" data-a="hide">${tr.hidden ? '🚫' : '👁'}</button>
        <button class="tbtn ${tr.mute ? 'off' : 'on'}" data-a="mute">${tr.mute ? '🔇' : '🔊'}</button>
        <button class="tbtn" data-a="up">▲</button>
        <button class="tbtn" data-a="down">▼</button>
        <button class="tbtn" data-a="del">🗑</button>
      </div>`;
    d.onclick = e => {
      const a = e.target.dataset.a;
      S.selTrack = tr.id;
      if (a === 'hide') tr.hidden = !tr.hidden;
      else if (a === 'mute') tr.mute = !tr.mute;
      else if (a === 'up' && i > 0) { S.tracks.splice(i, 1); S.tracks.splice(i - 1, 0, tr); }
      else if (a === 'down' && i < S.tracks.length - 1) { S.tracks.splice(i, 1); S.tracks.splice(i + 1, 0, tr); }
      else if (a === 'del') {
        if (S.tracks.length <= 1) return toast('さいごの 段は けせない');
        if (tr.clips.length && !confirm('この段の ふだも いっしょに けします。いい？')) return;
        S.tracks.splice(i, 1);
      }
      if (a) { snap('track'); drawAll(); } else drawHeads();
    };
    const nm = d.querySelector('.tname');
    nm.onblur = () => { tr.name = nm.textContent.trim() || tr.name; snap('rename'); drawHeads(); };
    nm.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } };
    heads.appendChild(d);
  });
}

function clipEl(tr, c) {
  const d = document.createElement('div');
  d.className = `clip ${c.kind}` + (S.sel === c.id ? ' sel' : '');
  d.style.left = t2x(c.start) + 'px';
  d.style.width = Math.max(10, t2x(c.dur)) + 'px';
  d.dataset.cid = c.id;
  const label = c.kind === 'text' ? (c.text.str.split('\n')[0] || '文字') : (c.name || '素材');
  d.innerHTML = `<div class="clip-name">${c.kind === 'audio' ? '🎵' : c.kind === 'text' ? '🅣' : '🎞'} ${label}</div>
    <div class="clip-body"></div>
    <div class="clip-h l"></div><div class="clip-h r"></div>`;
  const body = d.querySelector('.clip-body');
  if (c.fin > 0) { const f = document.createElement('div'); f.className = 'clip-fade'; f.style.left = 0; f.style.width = t2x(c.fin) + 'px'; f.style.opacity = .5; body.appendChild(f); }
  if (c.fout > 0) { const f = document.createElement('div'); f.className = 'clip-fade'; f.style.right = 0; f.style.width = t2x(c.fout) + 'px'; f.style.opacity = .5; body.appendChild(f); }
  const m = c.mid ? MEDIA.get(c.mid) : null;
  if (m && m.kind === 'audio' && m.peaks) {
    const cv = document.createElement('canvas');
    const w = Math.max(10, Math.round(t2x(c.dur))), h = 26;
    cv.width = w; cv.height = h; body.appendChild(cv);
    const g = cv.getContext('2d');
    g.strokeStyle = 'rgba(30,28,20,.55)'; g.lineWidth = 1;
    for (let x = 0; x < w; x++) {
      const tt = (c.inp + x / S.pps) / m.dur;
      const p = m.peaks[clamp(Math.floor(tt * m.peaks.length), 0, m.peaks.length - 1)] || 0;
      g.beginPath(); g.moveTo(x + .5, h / 2 - p * h / 2); g.lineTo(x + .5, h / 2 + p * h / 2); g.stroke();
    }
  } else if (m && m.kind !== 'audio') {
    const cv = document.createElement('canvas');
    cv.width = Math.min(360, Math.max(20, Math.round(t2x(c.dur)))); cv.height = 26;
    body.appendChild(cv); thumbStrip(cv, m);
  }
  return d;
}
function thumbStrip(cv, m) {
  const g = cv.getContext('2d');
  g.fillStyle = '#FFFEF7'; g.fillRect(0, 0, cv.width, cv.height);
  if (!m.poster) return;
  const tw = Math.max(8, Math.round(cv.height * m.poster.width / m.poster.height));
  for (let x = 0; x < cv.width; x += tw) g.drawImage(m.poster, x, 0, tw, cv.height);
  g.globalAlpha = .25; g.fillStyle = '#1E1C14';
  for (let x = tw; x < cv.width; x += tw) g.fillRect(x, 0, 1, cv.height);
  g.globalAlpha = 1;
}
function drawTimeline() {
  const w = tlWidth();
  lanes.style.width = w + 'px';
  $$('.lane', lanes).forEach(e => e.remove());
  S.tracks.forEach(tr => {
    const L = document.createElement('div');
    L.className = 'lane ' + tr.kind; L.dataset.tid = tr.id;
    L.style.width = w + 'px';
    if (tr.hidden) L.style.opacity = .45;
    tr.clips.forEach(c => L.appendChild(clipEl(tr, c)));
    lanes.appendChild(L);
  });
  drawRuler();
  updatePlayhead();
  $('#durLabel').textContent = '/ ' + r2(duration()) + 's';
  $('#zoomLabel').textContent = r2(S.pps / 60) + 'x';
  const f = S.sel && findClip(S.sel);
  $('#selLabel').textContent = f ? `${f.c.kind === 'text' ? '文字' : f.c.name || f.c.kind} ・ ${r2(f.c.dur)}s` : 'えらんでいない';
}
function updatePlayhead() {
  $('#playhead').style.left = t2x(S.time) + 'px';
  $('#playhead').style.height = lanes.scrollHeight + 'px';
}
function autoScrollTL() {
  const x = t2x(S.time), left = scroll.scrollLeft, w = scroll.clientWidth;
  if (x < left + 40 || x > left + w - 60) scroll.scrollLeft = x - w * 0.35;
}
function drawAll() {
  drawHeads(); drawTimeline(); drawProps();
  renderStage(S.time);
  $('#tcode').textContent = tc(S.time, S.fps);
  $('#sizeLabel').textContent = `${S.W}×${S.H} / ${S.fps}fps`;
  $('#btnUndo').disabled = HPOS <= 0;
  $('#btnRedo').disabled = HPOS >= HIST.length - 1;
}
scroll.addEventListener('scroll', () => { heads.style.transform = `translateY(${-scroll.scrollTop}px)`; });

/* --- 定規をドラッグして再生位置 --- */
function rulerDrag(e) {
  const move = ev => {
    const r = scroll.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left + scroll.scrollLeft;
    seek(x2t(Math.max(0, x)), true);
  };
  move(e);
  const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
$('#ruler').addEventListener('pointerdown', rulerDrag);

/* --- ふだのドラッグ（移動・トリム）--- */
let drag = null;
lanes.addEventListener('pointerdown', e => {
  const el = e.target.closest('.clip');
  if (!el) {
    const lane = e.target.closest('.lane');
    if (lane) { S.selTrack = lane.dataset.tid; S.sel = null; drawAll(); }
    return;
  }
  const f = findClip(el.dataset.cid); if (!f) return;
  S.sel = f.c.id; S.selTrack = f.t.id;
  if (S.tool === 'cut') {
    const r = scroll.getBoundingClientRect();
    const t = x2t(e.clientX - r.left + scroll.scrollLeft);
    splitAt(f, t); return;
  }
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const r = scroll.getBoundingClientRect();
  drag = {
    f, mode, el,
    x0: e.clientX, y0: e.clientY,
    start0: f.c.start, dur0: f.c.dur, inp0: f.c.inp,
    rect: r, moved: false
  };
  el.setPointerCapture && el.setPointerCapture(e.pointerId);
  drawAll();
});
function snapT(t, self) {
  if (!S.snap) return t;
  const cand = [0, S.time];
  allClips().forEach(({ c }) => { if (c.id !== self) { cand.push(c.start, c.start + c.dur); } });
  const tol = 8 / S.pps;
  let best = null, bd = tol;
  cand.forEach(v => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } });
  if (best !== null) { showSnap(best); return best; }
  hideSnap(); return t;
}
function showSnap(t) { const s = $('#snapline'); s.style.display = 'block'; s.style.left = t2x(t) + 'px'; s.style.height = lanes.scrollHeight + 'px'; }
function hideSnap() { $('#snapline').style.display = 'none'; }

document.addEventListener('pointermove', e => {
  if (!drag) return;
  const c = drag.f.c, dx = e.clientX - drag.x0;
  const dt = x2t(dx);
  if (Math.abs(dx) > 2 || Math.abs(e.clientY - drag.y0) > 2) drag.moved = true;
  const m = c.mid ? MEDIA.get(c.mid) : null;
  const srcDur = m && m.kind !== 'image' ? m.dur : Infinity;
  if (drag.mode === 'move') {
    c.start = Math.max(0, snapT(drag.start0 + dt, c.id));
    const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lane');
    if (lane && lane.dataset.tid !== drag.f.t.id) {
      const nt = trackOf(lane.dataset.tid);
      const compat = nt && (nt.kind === c.kind || (nt.kind === 'video' && c.kind === 'image') || (nt.kind === 'video' && c.kind === 'video'));
      if (compat) {
        drag.f.t.clips = drag.f.t.clips.filter(x => x !== c);
        nt.clips.push(c); drag.f.t = nt; S.selTrack = nt.id;
      }
    }
  } else if (drag.mode === 'l') {
    let ns = snapT(drag.start0 + dt, c.id);
    let d = drag.dur0 - (ns - drag.start0);
    let ni = drag.inp0 + (ns - drag.start0);
    if (ni < 0) { ns -= ni; d += ni; ni = 0; }
    if (d < 1 / S.fps) return;
    c.start = Math.max(0, ns); c.dur = d; c.inp = ni;
  } else {
    let d = snapT(drag.start0 + drag.dur0 + dt, c.id) - c.start;
    d = Math.max(1 / S.fps, d);
    if (isFinite(srcDur)) d = Math.min(d, (srcDur - c.inp) / (c.speed || 1));
    c.dur = d;
  }
  drawTimeline(); drawProps(); renderStage(S.time);
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  hideSnap();
  if (drag.moved) snap('drag');
  drag = null;
  drawAll();
});

/* --- 素材だなから タイムラインへ ドロップ --- */
lanes.addEventListener('dragover', e => e.preventDefault());
lanes.addEventListener('drop', e => {
  e.preventDefault();
  const mid = e.dataTransfer.getData('text/mid');
  const lane = e.target.closest('.lane');
  const r = scroll.getBoundingClientRect();
  const t = Math.max(0, x2t(e.clientX - r.left + scroll.scrollLeft));
  if (mid && MEDIA.get(mid)) {
    const m = MEDIA.get(mid);
    let tr = lane ? trackOf(lane.dataset.tid) : null;
    if (tr && ((tr.kind === 'audio') !== (m.kind === 'audio') || tr.kind === 'text')) tr = null;
    addFromMedia(m, t, tr);
  } else if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
});

/* --- 編集そうさ --- */
function splitAt(f, t) {
  const c = f.c;
  if (t <= c.start + 1 / S.fps || t >= c.start + c.dur - 1 / S.fps) { toast('ふだの 中で 切って'); return; }
  const b = JSON.parse(JSON.stringify(c));
  b.id = uid();
  const off = t - c.start;
  b.start = t; b.dur = c.dur - off; b.inp = c.inp + off * (c.speed || 1); b.fin = 0;
  c.dur = off; c.fout = 0;
  f.t.clips.push(b);
  S.sel = b.id;
  snap('split'); drawAll();
  toast('切った');
}
function splitPlayhead() {
  const hits = S.tracks.flatMap(t => t.clips.filter(c => S.time > c.start && S.time < c.start + c.dur).map(c => ({ c, t })));
  const target = S.sel ? hits.filter(h => h.c.id === S.sel) : hits;
  if (!target.length) { toast('切れる ふだが ない'); return; }
  target.forEach(f => splitAt(f, S.time));
}
function delSel() {
  const f = S.sel && findClip(S.sel); if (!f) { toast('えらんでから'); return; }
  const gap = f.c.dur, at = f.c.start;
  f.t.clips = f.t.clips.filter(c => c.id !== f.c.id);
  if (S.ripple) f.t.clips.forEach(c => { if (c.start >= at) c.start -= gap; });
  S.sel = null;
  snap('del'); drawAll();
}
function dupSel() {
  const f = S.sel && findClip(S.sel); if (!f) return;
  const b = JSON.parse(JSON.stringify(f.c));
  b.id = uid(); b.start = freeSlot(f.t, f.c.start + f.c.dur, b.dur);
  f.t.clips.push(b); S.sel = b.id;
  snap('dup'); drawAll();
}
function setZoom(v) {
  S.pps = clamp(v, 4, 900);
  drawTimeline();
}
function fitView() {
  setZoom(clamp((scroll.clientWidth - 40) / duration(), 4, 900));
  scroll.scrollLeft = 0;
}

/* ============================================================
   8. せってい（プロパティ）
   ============================================================ */
function rowRange(label, val, min, max, step, unit, fn) {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="val dot">${r2(val)}${unit || ''}</span>`;
  const inp = d.querySelector('input'), out = d.querySelector('.val');
  inp.addEventListener('input', () => { out.textContent = r2(+inp.value) + (unit || ''); fn(+inp.value, false); });
  inp.addEventListener('change', () => fn(+inp.value, true));
  return d;
}
function rowAny(label, node) {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<label>${label}</label>`;
  d.appendChild(node); return d;
}
function group(title, nodes) {
  const g = document.createElement('div'); g.className = 'pgroup';
  g.innerHTML = `<div class="pgroup-ttl"><span class="title">${title}</span></div>`;
  nodes.forEach(n => n && g.appendChild(n));
  return g;
}
function mk(tag, attrs = {}) { const e = document.createElement(tag); Object.assign(e, attrs); return e; }
function sel(opts, val, fn) {
  const s = mk('select');
  opts.forEach(([v, l]) => { const o = mk('option', { value: v, textContent: l }); s.appendChild(o); });
  s.value = val; s.onchange = () => fn(s.value);
  return s;
}
const live = () => { renderStage(S.time); drawTimeline(); };

function drawProps() {
  const body = $('#propBody'); body.innerHTML = '';
  const f = S.sel && findClip(S.sel);
  if (!f) {
    $('#propWhat').textContent = '作品';
    body.appendChild(group('作品の かたち', [
      rowAny('大きさ', sel([['1280x720', '1280×720 (HD)'], ['1920x1080', '1920×1080 (フルHD)'],
      ['1080x1080', '1080×1080 (四角)'], ['1080x1920', '1080×1920 (たて)'], ['854x480', '854×480 (かるい)']],
        `${S.W}x${S.H}`, v => { const [w, h] = v.split('x').map(Number); S.W = w; S.H = h; stage.width = w; stage.height = h; drawAll(); })),
      rowAny('コマ数', sel([['24', '24 fps'], ['30', '30 fps'], ['60', '60 fps']], String(S.fps), v => { S.fps = +v; drawAll(); })),
      rowAny('下じき', (() => { const i = mk('input', { type: 'color', value: S.bg }); i.oninput = () => { S.bg = i.value; renderStage(S.time); }; return i; })())
    ]));
    const h = mk('div', { className: 'hint' });
    h.innerHTML = '素材だなに 動画や 画像を おとして、<br>タイムラインへ ドラッグすると はじまる。<br>ふだを えらぶと ここが 変わる。';
    body.appendChild(h);
    return;
  }
  const c = f.c;
  $('#propWhat').textContent = c.kind === 'text' ? '文字' : c.kind === 'audio' ? '音' : c.kind === 'image' ? '画像' : '動画';
  const m = c.mid ? MEDIA.get(c.mid) : null;

  /* 時間 */
  const tin = mk('input', { type: 'number', step: 0.05, value: r2(c.start) });
  tin.onchange = () => { c.start = Math.max(0, +tin.value); snap('t'); drawAll(); };
  const tdu = mk('input', { type: 'number', step: 0.05, value: r2(c.dur) });
  tdu.onchange = () => { c.dur = Math.max(1 / S.fps, +tdu.value); snap('t'); drawAll(); };
  body.appendChild(group('いつ', [
    rowAny('はじまり', tin), rowAny('ながさ', tdu),
    rowRange('入り ぼかし', c.fin, 0, 3, .05, 's', (v, e) => { c.fin = v; live(); if (e) snap('fade'); }),
    rowRange('出 ぼかし', c.fout, 0, 3, .05, 's', (v, e) => { c.fout = v; live(); if (e) snap('fade'); }),
    c.kind === 'video' || c.kind === 'audio'
      ? rowRange('はやさ', c.speed, .25, 4, .05, 'x', (v, e) => {
        const end = c.inp + c.dur * c.speed; c.speed = v;
        if (m) c.dur = Math.min(c.dur, (m.dur - c.inp) / v);
        live(); if (e) { snap('speed'); drawAll(); }
      }) : null
  ]));

  if (c.kind !== 'audio') {
    body.appendChild(group('見た目', [
      rowRange('よこ', c.x, -S.W, S.W, 1, '', (v, e) => { c.x = v; live(); if (e) snap('x'); }),
      rowRange('たて', c.y, -S.H, S.H, 1, '', (v, e) => { c.y = v; live(); if (e) snap('y'); }),
      rowRange('大きさ', c.scale, .05, 4, .01, 'x', (v, e) => { c.scale = v; live(); if (e) snap('s'); }),
      rowRange('かたむき', c.rot, -180, 180, 1, '°', (v, e) => { c.rot = v; live(); if (e) snap('r'); }),
      rowRange('すけ', c.opacity, 0, 1, .01, '', (v, e) => { c.opacity = v; live(); if (e) snap('o'); }),
      c.kind !== 'text' ? rowAny('おさめ方', sel([['contain', 'ぜんぶ 入れる'], ['cover', '画面を うめる'], ['fill', 'ひきのばす']], c.fit, v => { c.fit = v; live(); snap('fit'); })) : null,
      rowAny('出かた', sel([['none', 'そのまま'], ['fade', 'じわっ'], ['up', '下から'], ['zoom', 'ズーム'], ['kenburns', 'ゆっくり寄る']], c.anim, v => { c.anim = v; live(); snap('anim'); }))
    ]));
  }

  if (c.kind === 'text') {
    const T = c.text;
    const ta = mk('textarea', { value: T.str, rows: 3 });
    ta.oninput = () => { T.str = ta.value; live(); };
    ta.onchange = () => snap('str');
    const col = mk('input', { type: 'color', value: T.color }); col.oninput = () => { T.color = col.value; live(); };
    const st = mk('input', { type: 'color', value: T.stroke }); st.oninput = () => { T.stroke = st.value; live(); };
    const bc = mk('input', { type: 'color', value: T.bgColor }); bc.oninput = () => { T.bgColor = bc.value; live(); };
    body.appendChild(group('文字', [
      rowAny('ことば', ta),
      rowRange('大きさ', T.size, 12, 300, 1, 'px', (v, e) => { T.size = v; live(); if (e) snap('ts'); }),
      rowAny('色', col), rowAny('ふち色', st),
      rowRange('ふち', T.sw, 0, 32, 1, 'px', (v, e) => { T.sw = v; live(); if (e) snap('tw'); }),
      rowAny('よせ', sel([['center', 'まんなか'], ['left', 'ひだり'], ['right', 'みぎ']], T.align, v => { T.align = v; live(); snap('ta'); })),
      rowAny('太さ', sel([['400', 'ほそい'], ['700', 'ふつう'], ['800', 'ふとい']], String(T.weight), v => { T.weight = +v; live(); snap('tb'); })),
      rowAny('ふだ地', (() => {
        const w = mk('div'); w.style.cssText = 'display:flex;gap:.3rem;flex:1;align-items:center';
        const b = mk('button', { className: 'btn btn-sm' + (T.bgOn ? ' on' : ''), textContent: T.bgOn ? 'あり' : 'なし' });
        b.onclick = () => { T.bgOn = !T.bgOn; live(); snap('tbg'); drawProps(); };
        w.append(b, bc); return w;
      })())
    ]));
  }

  if (c.kind === 'video' || c.kind === 'image') {
    const F = c.fx;
    body.appendChild(group('色あい', [
      rowRange('あかるさ', F.br, 0, 300, 1, '%', (v, e) => { F.br = v; live(); if (e) snap('fx'); }),
      rowRange('こさ', F.ct, 0, 300, 1, '%', (v, e) => { F.ct = v; live(); if (e) snap('fx'); }),
      rowRange('あざやか', F.sa, 0, 300, 1, '%', (v, e) => { F.sa = v; live(); if (e) snap('fx'); }),
      rowRange('ぼかし', F.bl, 0, 40, .5, 'px', (v, e) => { F.bl = v; live(); if (e) snap('fx'); }),
      rowRange('色まわし', F.hue, -180, 180, 1, '°', (v, e) => { F.hue = v; live(); if (e) snap('fx'); }),
      rowRange('セピア', F.sepia, 0, 100, 1, '%', (v, e) => { F.sepia = v; live(); if (e) snap('fx'); }),
      (() => {
        const w = mk('div'); w.className = 'row';
        w.innerHTML = '<label>下じき</label>';
        [['もどす', { br: 100, ct: 100, sa: 100, bl: 0, hue: 0, sepia: 0 }],
        ['しろくろ', { br: 105, ct: 110, sa: 0, bl: 0, hue: 0, sepia: 0 }],
        ['ふるい', { br: 105, ct: 95, sa: 70, bl: 0, hue: 0, sepia: 55 }],
        ['つよい', { br: 105, ct: 130, sa: 130, bl: 0, hue: 0, sepia: 0 }]].forEach(([n, p]) => {
          const b = mk('button', { className: 'btn btn-sm', textContent: n });
          b.style.fontSize = '.58rem'; b.style.padding = '.2rem .4rem';
          b.onclick = () => { Object.assign(c.fx, p); live(); snap('fx'); drawProps(); };
          w.appendChild(b);
        });
        return w;
      })()
    ]));
  }

  if (c.kind === 'video' || c.kind === 'audio') {
    body.appendChild(group('音', [
      rowRange('おおきさ', c.vol, 0, 2, .01, 'x', (v, e) => { c.vol = v; live(); if (e) snap('vol'); })
    ]));
  }

  const ops = mk('div'); ops.className = 'row'; ops.style.flexWrap = 'wrap';
  [['✂ 切る', splitPlayhead], ['⧉ 複製', dupSel], ['🗑 けす', delSel],
  ['⇤ 頭出し', () => { c.start = S.time; snap('mv'); drawAll(); }]].forEach(([n, fn]) => {
    const b = mk('button', { className: 'btn btn-sm', textContent: n }); b.onclick = fn; ops.appendChild(b);
  });
  body.appendChild(group('この ふだに', [ops]));
  if (m && m.kind !== 'image') {
    const h = mk('div', { className: 'hint' });
    h.innerHTML = `もとの 素材: ${m.name}<br>${r2(m.dur)}s のうち ${r2(c.inp)}s から つかっている`;
    body.appendChild(h);
  }
}

/* ============================================================
   9. 画面の 中で じかに 動かす
   ============================================================ */
(() => {
  let d = null;
  const toStage = e => {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (S.W / r.width), y: (e.clientY - r.top) * (S.H / r.height) };
  };
  stage.addEventListener('pointerdown', e => {
    const f = S.sel && findClip(S.sel);
    if (!f || f.c.kind === 'audio') return;
    const p = toStage(e);
    d = { c: f.c, p, x0: f.c.x, y0: f.c.y, s0: f.c.scale, corner: e.shiftKey };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!d) return;
    const p = toStage(e);
    if (d.corner) {
      const k = 1 + (p.x - d.p.x) / S.W * 2;
      d.c.scale = clamp(d.s0 * k, .05, 6);
    } else {
      d.c.x = d.x0 + (p.x - d.p.x);
      d.c.y = d.y0 + (p.y - d.p.y);
    }
    renderStage(S.time);
  });
  stage.addEventListener('pointerup', () => { if (d) { snap('move'); drawProps(); d = null; } });
})();

/* ============================================================
   10. 保存・ひらく
   ============================================================ */
function saveProject() {
  const data = {
    app: 'douga-hen', ver: 1,
    W: S.W, H: S.H, fps: S.fps, bg: S.bg,
    media: [...MEDIA.values()].map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: m.dur, w: m.w, h: m.h })),
    tracks: S.tracks
  };
  const a = mk('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: 'douga.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('保存した（素材は 入っていない）');
}
async function openProject(file) {
  try {
    const o = JSON.parse(await file.text());
    if (o.app !== 'douga-hen') { toast('この台の ファイルじゃない'); return; }
    S.W = o.W; S.H = o.H; S.fps = o.fps; S.bg = o.bg || '#101010';
    stage.width = S.W; stage.height = S.H;
    S.tracks = o.tracks; S.sel = null; S.time = 0;
    // 素材は 名前で つなぎ直す
    const byName = new Map([...MEDIA.values()].map(m => [m.name, m]));
    const remap = new Map();
    (o.media || []).forEach(sm => { const hit = byName.get(sm.name); if (hit) remap.set(sm.id, hit.id); });
    let miss = 0;
    allClips().forEach(({ c }) => {
      if (!c.mid) return;
      if (remap.has(c.mid)) c.mid = remap.get(c.mid);
      else if (!MEDIA.has(c.mid)) { miss++; }
    });
    HIST = []; HPOS = -1; snap('open');
    drawAll(); fitView();
    toast(miss ? `ひらいた（素材 ${miss}個 みつからない → 同じ名前で とりこむ）` : 'ひらいた');
  } catch (e) { toast('ひらけなかった'); }
}
function relinkAll() {
  const byName = new Map([...MEDIA.values()].map(m => [m.name, m]));
  let n = 0;
  allClips().forEach(({ c }) => {
    if (c.mid && !MEDIA.has(c.mid) && byName.has(c.name)) { c.mid = byName.get(c.name).id; n++; }
  });
  if (n) { drawAll(); toast(n + '個 つなぎ直した'); }
}

/* ============================================================
   11. まど（モーダル）
   ============================================================ */
const veil = $('#veil'), modal = $('#modal');
function openModal(html, after) {
  modal.innerHTML = html; veil.classList.add('on');
  modal.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  after && after();
}
function closeModal() { veil.classList.remove('on'); }
veil.addEventListener('pointerdown', e => { if (e.target === veil) closeModal(); });

function helpModal() {
  openModal(`
  <h2>つかいかた</h2>
  <p>ブラウザの 中だけで 動く。素材は どこにも 送られない。</p>
  <h3>1. 素材を 入れる</h3>
  <ul><li>左の「素材だな」に 動画・画像・音を ドラッグして おとす</li>
  <li>だなの ふだを タイムラインへ ドラッグ（＋を 押すと 再生位置に 足す）</li></ul>
  <h3>2. 切る・ならべる</h3>
  <ul><li>ふだの まん中を つかむと 動く。左右の はしで ながさを 変える</li>
  <li>上下の 段に ドラッグすると 段を うつれる（音は 音の段だけ）</li>
  <li><kbd>S</kbd> で 再生位置の ところで 切る。✂の 道具を 選んで 直接 切ってもいい</li>
  <li>🧲 吸着 を 入れておくと 他の ふだの はしに くっつく</li></ul>
  <h3>3. 見た目を いじる</h3>
  <ul><li>ふだを えらぶと 右に 設定が 出る（位置・大きさ・色あい・音）</li>
  <li>画面の 中を じかに ドラッグしても 動く。<kbd>Shift</kbd>＋ドラッグで 大きさ</li>
  <li>🅣 で 文字、🎵 で 歌詞を まとめて 流しこめる</li></ul>
  <h3>4. 書き出す</h3>
  <ul><li>⏏ 書き出し を 押すと、最初から 最後まで 通して 録りながら WebM を 作る</li>
  <li>録っている あいだは 他の ことを しない（画面を そのまま 録っている）</li></ul>
  <h3>ショートカット</h3>
  <ul><li><kbd>Space</kbd> さいせい／とめる　<kbd>←</kbd><kbd>→</kbd> 1コマ　<kbd>Shift</kbd>＋矢印 1秒</li>
  <li><kbd>S</kbd> 切る　<kbd>Delete</kbd> けす　<kbd>Ctrl</kbd>+<kbd>D</kbd> 複製</li>
  <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> もどす　<kbd>Ctrl</kbd>+<kbd>Y</kbd> やりなおし</li>
  <li><kbd>V</kbd> えらぶ　<kbd>C</kbd> 切る　<kbd>H</kbd> ずらす　<kbd>+</kbd><kbd>-</kbd> ズーム</li></ul>
  <p style="margin-top:.7rem"><b>保存</b>は 組み立てだけを JSON に 入れる。素材は 入らないので、
  ひらいた あとに 同じ名前の ファイルを もう一度 とりこめば つながる。</p>
  <div style="text-align:right;margin-top:.6rem"><button class="btn btn-y" data-close>とじる</button></div>`);
}

function exportModal() {
  const dur = duration();
  openModal(`
  <h2>書き出し</h2>
  <div class="hint">画面を そのまま 通しで 録る やりかた。<br>
  ながさは <b>${r2(dur)}秒</b>。その あいだ この タブを 前に 出したまま 待つ。</div>
  <div class="row" style="margin-top:.6rem"><label>名前</label><input type="text" id="exName" value="douga"></div>
  <div class="row"><label>きれいさ</label><select id="exQ">
    <option value="4000000">ふつう（4Mbps）</option>
    <option value="8000000" selected>きれい（8Mbps）</option>
    <option value="16000000">とても きれい（16Mbps）</option>
    <option value="2000000">かるい（2Mbps）</option>
  </select></div>
  <p>作られる のは WebM。X や YouTube には そのまま 上げられる。</p>
  <div style="text-align:right;margin-top:.6rem">
    <button class="btn btn-sm" data-close>やめる</button>
    <button class="btn btn-g" id="exGo">⏺ 録りはじめる</button></div>`, () => {
    $('#exGo').onclick = () => {
      const name = $('#exName').value.trim() || 'douga';
      const bps = +$('#exQ').value;
      closeModal();
      exportMovie({ name, bps });
    };
  });
}

function lyricModal() {
  openModal(`
  <h2>歌詞を 流しこむ</h2>
  <div class="hint">1行 ＝ 1まい の 文字ふだ。<br>
  行の あたまに <b>0:12</b> のように 時間を 書くと そこに 置く。<br>
  書かない ときは 下の「1行ぶん」ずつ ならべる。</div>
  <div class="row" style="margin-top:.5rem"><label>はじめ</label><input type="number" id="lyFrom" step="0.1" value="${r2(S.time)}"><span class="val">s</span></div>
  <div class="row"><label>1行ぶん</label><input type="number" id="lyEach" step="0.1" value="2.5"><span class="val">s</span></div>
  <div class="row"><label>すきま</label><input type="number" id="lyGap" step="0.1" value="0"><span class="val">s</span></div>
  <textarea id="lyText" rows="9" style="width:100%;margin-top:.4rem" placeholder="0:00 さいしょの 行&#10;つぎの 行&#10;そのつぎの 行"></textarea>
  <div style="text-align:right;margin-top:.6rem">
    <button class="btn btn-sm" data-close>やめる</button>
    <button class="btn btn-y" id="lyGo">ならべる</button></div>`, () => {
    $('#lyGo').onclick = () => {
      const lines = $('#lyText').value.split('\n').map(s => s.trim()).filter(Boolean);
      if (!lines.length) { toast('なにも 書いていない'); return; }
      const from = +$('#lyFrom').value || 0, each = Math.max(.2, +$('#lyEach').value || 2.5), gap = +$('#lyGap').value || 0;
      let cur = from;
      const made = [];
      lines.forEach(line => {
        const m = line.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)\s+(.+)$/);
        let at = cur, str = line;
        if (m) { at = (+(m[1] || 0)) * 60 + (+m[2]); str = m[3]; }
        const c = newClip('text', { name: '歌詞', start: at, dur: each });
        c.text.str = str; c.text.size = 64; c.fin = .15; c.fout = .15; c.anim = 'fade';
        c.y = S.H * 0.3;
        made.push(c);
        cur = at + each + gap;
      });
      // 時間指定があった行は つぎの行の 頭まで のばす
      made.sort((a, b) => a.start - b.start).forEach((c, i, arr) => {
        const nx = arr[i + 1];
        if (nx && c.start + c.dur > nx.start) c.dur = Math.max(.2, nx.start - c.start - gap);
      });
      const tr = freeLane('text', made);
      made.forEach(c => tr.clips.push(c));
      closeModal(); snap('lyric'); drawAll();
      toast(lines.length + '行 ならべた');
    };
  });
}

/* ============================================================
   12. つなぎこみ
   ============================================================ */
$('#btnAdd').onclick = () => $('#fileMedia').click();
$('#fileMedia').onchange = e => { importFiles(e.target.files); relinkAll(); e.target.value = ''; };
$('#binDrop').onclick = () => $('#fileMedia').click();
['dragenter', 'dragover'].forEach(k => $('#binDrop').addEventListener(k, e => { e.preventDefault(); $('#binDrop').classList.add('hot'); }));
['dragleave', 'drop'].forEach(k => $('#binDrop').addEventListener(k, e => { e.preventDefault(); $('#binDrop').classList.remove('hot'); }));
$('#binDrop').addEventListener('drop', e => { importFiles(e.dataTransfer.files); relinkAll(); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  if (e.target.closest('#lanes') || e.target.closest('#binDrop')) return;
  e.preventDefault();
  if (e.dataTransfer.files.length) { importFiles(e.dataTransfer.files); relinkAll(); }
});

$('#btnSave').onclick = saveProject;
$('#btnOpen').onclick = () => $('#fileProj').click();
$('#fileProj').onchange = e => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; };
$('#btnExport').onclick = exportModal;
$('#btnHelp').onclick = helpModal;
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;

$('#btnPlay').onclick = toggle;
$('#btnHome').onclick = () => { pause(); seek(0); };
$('#btnEnd').onclick = () => { pause(); seek(duration()); };
$('#btnPrevF').onclick = () => { pause(); seek(S.time - 1 / S.fps); };
$('#btnNextF').onclick = () => { pause(); seek(S.time + 1 / S.fps); };

$('#btnSplit').onclick = splitPlayhead;
$('#btnDup').onclick = dupSel;
$('#btnDel').onclick = delSel;
$('#btnSnap').onclick = e => { S.snap = !S.snap; e.currentTarget.classList.toggle('on', S.snap); };
$('#btnRipple').onclick = e => { S.ripple = !S.ripple; e.currentTarget.classList.toggle('on', S.ripple); };
$('#btnZoomIn').onclick = () => setZoom(S.pps * 1.5);
$('#btnZoomOut').onclick = () => setZoom(S.pps / 1.5);

$$('.tool[data-tool]').forEach(t => t.onclick = () => {
  S.tool = t.dataset.tool;
  $$('.tool[data-tool]').forEach(x => x.classList.toggle('on', x === t));
  scroll.style.cursor = S.tool === 'hand' ? 'grab' : S.tool === 'cut' ? 'crosshair' : '';
});
$('#tAddText').onclick = () => addText(S.time);
$('#tAddLyric').onclick = lyricModal;
$('#tAddTrack').onclick = () => {
  const kind = prompt('どの段を 足す？ 1=映像 2=音 3=文字', '1');
  const k = { '1': 'video', '2': 'audio', '3': 'text' }[String(kind || '').trim()];
  if (!k) return;
  const n = S.tracks.filter(t => t.kind === k).length + 1;
  S.tracks.unshift(newTrack(k, ({ video: '映像', audio: '音', text: '文字' })[k] + ' ' + n));
  snap('track'); drawAll();
};
$('#tFitView').onclick = fitView;
$('#btnPaneBin').onclick = () => $('#bin').classList.toggle('show');
$('#btnPaneProp').onclick = () => $('#prop').classList.toggle('show');

/* --- タイムラインの ずらし・ズーム --- */
scroll.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const r = scroll.getBoundingClientRect();
    const at = x2t(e.clientX - r.left + scroll.scrollLeft);
    setZoom(S.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    scroll.scrollLeft = t2x(at) - (e.clientX - r.left);
  } else if (e.shiftKey) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
}, { passive: false });
scroll.addEventListener('pointerdown', e => {
  if (S.tool !== 'hand' && e.button !== 1) return;
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY, sl = scroll.scrollLeft, st = scroll.scrollTop;
  const mv = ev => { scroll.scrollLeft = sl - (ev.clientX - x0); scroll.scrollTop = st - (ev.clientY - y0); };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});

/* --- キー --- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); dupSel(); return; }
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
  if (ctrl) return;
  const step = e.shiftKey ? 1 : 1 / S.fps;
  switch (e.key) {
    case ' ': e.preventDefault(); toggle(); break;
    case 'ArrowLeft': e.preventDefault(); pause(); seek(S.time - step); break;
    case 'ArrowRight': e.preventDefault(); pause(); seek(S.time + step); break;
    case 'Home': seek(0); break;
    case 'End': seek(duration()); break;
    case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
    case 's': case 'S': splitPlayhead(); break;
    case 'v': case 'V': $('.tool[data-tool=select]').click(); break;
    case 'c': case 'C': $('.tool[data-tool=cut]').click(); break;
    case 'h': case 'H': $('.tool[data-tool=hand]').click(); break;
    case '+': case ';': setZoom(S.pps * 1.5); break;
    case '-': setZoom(S.pps / 1.5); break;
    case 'Escape': S.sel = null; drawAll(); break;
  }
});
window.addEventListener('resize', () => { drawTimeline(); });
window.addEventListener('beforeunload', e => {
  if (allClips().length) { e.preventDefault(); e.returnValue = ''; }
});

/* ============================================================
   13. はじまり
   ============================================================ */
bootProject();
stage.width = S.W; stage.height = S.H;
drawBin();
snap('init');
drawAll();
setZoom(60);
