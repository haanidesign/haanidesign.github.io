/* 放課後リフレイン — core: loop, input, tween, particles, text, ui */
(function () {
  'use strict';
  const W = 640, H = 360, STEP = 1 / 60;
  const CORE = { W, H, time: 0, timeScale: 1, textSpeed: 1 };
  window.CORE = CORE;

  const PAL = CORE.PAL = {
    ink: '#2b2d5c', ink2: '#4a4c86', cream: '#fff6e0', cream2: '#f4e6c4', white: '#ffffff',
    pink: '#ff8fb1', pink2: '#e8577e', pinkL: '#ffd0de', mint: '#7fe0c4', mint2: '#3fb896', mintL: '#d4f7ec',
    lemon: '#ffe27a', lemon2: '#f2b83d', sky: '#9fd4ff', sky2: '#5a9ee0', lilac: '#c7a8ff', lilac2: '#8f6ae0',
    red: '#ff5a6a', green: '#36c07f', grey: '#9a9ab8', shadow: 'rgba(43,45,92,0.35)', night: '#1b1c3a'
  };

  /* ---------- easing ---------- */
  const E = CORE.ease = {
    linear: t => t,
    quadIn: t => t * t, quadOut: t => t * (2 - t),
    quadInOut: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    cubicOut: t => (--t) * t * t + 1, cubicIn: t => t * t * t,
    sineInOut: t => -(Math.cos(Math.PI * t) - 1) / 2,
    backOut: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    backIn: t => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
    elasticOut: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
    bounceOut: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
      return n * (t -= 2.625 / d) * t + .984375;
    }
  };
  CORE.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  CORE.lerp = (a, b, t) => a + (b - a) * t;
  CORE.rand = (a, b) => a + Math.random() * (b - a);
  CORE.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  CORE.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  CORE.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- canvas & scaling ---------- */
  let canvas, ctx;
  const view = { s: 1, ox: 0, oy: 0 };
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    const fs = Math.floor(s);
    const scale = (fs >= 1 && fs / s > 0.86) ? fs : s;
    const cw = Math.round(W * scale), ch = Math.round(H * scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const r = canvas.getBoundingClientRect();
    view.s = cw / W; view.ox = r.left; view.oy = r.top;
  }
  CORE.toLogical = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) / (r.width / W), y: (cy - r.top) / (r.height / H) };
  };
  CORE.toScreen = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + x * r.width / W, y: r.top + y * r.height / H };
  };

  /* ---------- input ---------- */
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'ok', ' ': 'ok', z: 'ok', Z: 'ok', x: 'cancel', X: 'cancel', Escape: 'cancel', Backspace: 'cancel',
    Control: 'skip', a: 'auto', A: 'auto', l: 'log', L: 'log', w: 'up', s: 'down', W: 'up', S: 'down'
  };
  const pend = { down: false, up: false, keys: new Set() };
  const inp = CORE.input = {
    x: -1, y: -1, down: false, pressed: false, released: false, keys: new Set(), held: new Set(),
    downTime: 0, consumed: false, lastKind: 'mouse',
    key(k) { return !this.consumed && this.keys.has(k); },
    click() { return !this.consumed && this.pressed; },
    advance() { return !this.consumed && (this.pressed || this.keys.has('ok')); },
    consume() { this.consumed = true; },
    get holding() { return (this.down && this.downTime > 0.25) || this.held.has('ok') && this.okHeld > 0.25 || this.held.has('skip'); },
    okHeld: 0
  };
  function setPos(e) {
    const p = CORE.toLogical(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) { inp.x = -99; inp.y = -99; } else { inp.x = p.x; inp.y = p.y; }
  }
  const unlockers = [];
  CORE.onFirstInput = fn => unlockers.push(fn);
  function unlock() { while (unlockers.length) { try { unlockers.shift()(); } catch (e) { /* ignore */ } } }
  function bindInput() {
    window.addEventListener('pointerdown', e => {
      unlock(); setPos(e); inp.lastKind = e.pointerType || 'mouse';
      inp.down = true; inp.downTime = 0; pend.down = true;
      if (e.target === canvas) e.preventDefault();
    }, { passive: false });
    window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || inp.down) setPos(e); });
    window.addEventListener('pointerup', e => { setPos(e); inp.down = false; pend.up = true; if (e.pointerType !== 'mouse') { setTimeout(() => { if (!inp.down) { inp.x = -99; inp.y = -99; } }, 60); } });
    window.addEventListener('pointercancel', () => { inp.down = false; pend.up = true; });
    window.addEventListener('keydown', e => {
      const k = KEYMAP[e.key]; unlock();
      if (!k) return;
      e.preventDefault();
      inp.lastKind = 'key';
      if (!e.repeat) pend.keys.add(k);
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') pend.keys.add(k);
      inp.held.add(k);
    });
    window.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) inp.held.delete(k); if (k === 'ok') inp.okHeld = 0; });
    window.addEventListener('blur', () => { inp.held.clear(); inp.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  function pollInput(dt) {
    inp.pressed = pend.down; inp.released = pend.up;
    inp.keys = new Set(pend.keys);
    pend.down = false; pend.up = false; pend.keys.clear();
    inp.consumed = false;
    if (inp.down) inp.downTime += dt;
    if (inp.held.has('ok')) inp.okHeld += dt;
  }

  /* ---------- timers & tweens ---------- */
  const timers = [], tweens = [];
  CORE.wait = sec => new Promise(res => timers.push({ t: sec, res }));
  CORE.frame = () => CORE.wait(0);
  CORE.waitUntil = fn => new Promise(res => timers.push({ t: 0, cond: fn, res }));
  CORE.tween = (obj, to, dur, opt) => {
    opt = opt || {};
    return new Promise(res => {
      const from = {};
      for (const k in to) from[k] = obj[k];
      tweens.push({ obj, from, to, dur: Math.max(0.0001, dur), t: -(opt.delay || 0), ease: E[opt.ease] || opt.ease || E.quadOut, res, onUpdate: opt.onUpdate });
    });
  };
  CORE.killTweens = obj => { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj) { tweens[i].res(); tweens.splice(i, 1); } };
  function updateTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      const tm = timers[i];
      if (tm.cond) { if (tm.cond()) { timers.splice(i, 1); tm.res(); } continue; }
      tm.t -= dt;
      if (tm.t <= 0) { timers.splice(i, 1); tm.res(); }
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const p = Math.min(1, tw.t / tw.dur), e = tw.ease(p);
      for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (tw.onUpdate) tw.onUpdate(p);
      if (p >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  /* ---------- scene stack ---------- */
  const stack = CORE.stack = [];
  CORE.push = sc => { stack.push(sc); if (sc.enter) sc.enter(); return sc; };
  CORE.remove = sc => { const i = stack.indexOf(sc); if (i >= 0) stack.splice(i, 1); if (sc.exit) sc.exit(); };
  CORE.pop = () => { const sc = stack[stack.length - 1]; if (sc) CORE.remove(sc); return sc; };
  CORE.top = () => stack[stack.length - 1];
  CORE.run = sc => new Promise(res => {
    sc.close = v => { CORE.remove(sc); res(v); };
    CORE.push(sc);
  });
  CORE.clearStack = keep => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i] !== keep) CORE.remove(stack[i]); };

  /* ---------- screen fx ---------- */
  const fx = { shake: 0, shakeMag: 0, shakeDur: 1, flash: 0, flashColor: '#fff', flashDur: 1 };
  CORE.shake = (mag = 4, dur = 0.3) => { fx.shakeMag = Math.max(fx.shake > 0 ? fx.shakeMag : 0, mag); fx.shake = dur; fx.shakeDur = dur; };
  CORE.flash = (color = '#fff', dur = 0.35) => { fx.flash = dur; fx.flashDur = dur; fx.flashColor = color; };

  /* transitions */
  const tr = { type: null, p: 0, color: PAL.ink };
  CORE.busy = () => tr.type !== null;
  CORE.cover = async (type = 'fade', dur = 0.35, color) => {
    tr.type = type; tr.color = color || PAL.ink; tr.p = 0;
    await CORE.tween(tr, { p: 1 }, dur, { ease: 'quadInOut' });
  };
  CORE.uncover = async (dur = 0.35) => {
    if (!tr.type) return;
    await CORE.tween(tr, { p: 0 }, dur, { ease: 'quadInOut' });
    tr.type = null;
  };
  CORE.transition = async (type, mid, dur = 0.7, color) => {
    await CORE.cover(type, dur / 2, color);
    if (mid) await mid();
    await CORE.wait(0.05);
    await CORE.uncover(dur / 2);
  };
  function drawTransition(c) {
    if (!tr.type || tr.p <= 0) return;
    const p = tr.p;
    c.save(); c.fillStyle = tr.color;
    if (tr.type === 'fade') { c.globalAlpha = p; c.fillRect(0, 0, W, H); }
    else if (tr.type === 'iris') {
      const r = Math.max(0, (1 - p) * 380);
      c.beginPath(); c.rect(0, 0, W, H);
      if (r > 0.5) c.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
      c.fill('evenodd');
    } else if (tr.type === 'wipe') {
      const x = p * (W + 120);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(x, 0); c.lineTo(x - 120, H); c.lineTo(0, H); c.fill();
    } else if (tr.type === 'blinds') {
      const n = 12, bh = H / n;
      for (let i = 0; i < n; i++) { const h = Math.ceil(bh * CORE.clamp(p * 1.6 - i * 0.05, 0, 1)); c.fillRect(0, Math.floor(i * bh), W, h); }
    } else { /* diamond pixel dissolve */
      const cs = 32, cols = W / cs + 1, rows = Math.ceil(H / cs) + 1;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const d = (x + y) / (cols + rows);
        const k = CORE.clamp(p * 2 - d, 0, 1);
        if (k <= 0) continue;
        const r = Math.ceil(k * cs * 0.75) ;
        const cx = x * cs, cy = y * cs;
        for (let j = -r; j <= r; j += 2) { const w = (r - Math.abs(j)); c.fillRect(cx - w, cy + j, w * 2, 2); }
      }
    }
    c.restore();
  }

  /* ---------- particles ---------- */
  const parts = [];
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  CORE.HEART = HEART;
  CORE.bitmap = (c, rows, x, y, s, color) => {
    c.fillStyle = color;
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '1') c.fillRect(Math.round(x + i * s), Math.round(y + j * s), s, s);
  };
  const CONF = [PAL.pink, PAL.mint, PAL.lemon, PAL.sky, PAL.lilac, PAL.pink2];
  CORE.burst = (type, x, y, n = 12, opt = {}) => {
    for (let i = 0; i < n; i++) {
      const a = opt.angle != null ? opt.angle + CORE.rand(-opt.spread || -0.5, opt.spread || 0.5) : Math.random() * Math.PI * 2;
      const sp = CORE.rand(opt.min || 30, opt.max || 120);
      const p = { type, x: x + CORE.rand(-(opt.w || 0), opt.w || 0), y: y + CORE.rand(-(opt.h || 0), opt.h || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, life: 0, max: CORE.rand(0.6, 1.2) * (opt.life || 1), rot: Math.random() * 6, vr: CORE.rand(-6, 6), size: 1, color: opt.color || PAL.white, sway: Math.random() * 6 };
      if (type === 'heart') { p.vy -= 40; p.g = -20; p.size = Math.random() < 0.3 ? 2 : 1; p.color = opt.color || CORE.pick([PAL.pink, PAL.pink2, '#ff6f9a']); }
      else if (type === 'sparkle') { p.g = 30; p.color = opt.color || CORE.pick([PAL.white, PAL.lemon, PAL.pinkL]); p.size = CORE.randi(1, 3); }
      else if (type === 'petal') { p.vx = CORE.rand(-30, 10); p.vy = CORE.rand(10, 40); p.g = 0; p.max = CORE.rand(3, 6); p.color = CORE.pick(['#ffc3d6', '#ffb0c8', '#ffe0ea']); }
      else if (type === 'confetti') { p.vy -= 80; p.g = 160; p.color = CORE.pick(CONF); p.max *= 2; }
      else if (type === 'dust') { p.vx *= 0.3; p.vy = CORE.rand(-30, -8); p.color = opt.color || 'rgba(255,255,255,0.7)'; p.size = CORE.randi(2, 4); }
      else if (type === 'note') { p.vy = CORE.rand(-50, -25); p.vx = CORE.rand(-20, 20); p.color = CORE.pick([PAL.pink2, PAL.sky2, PAL.lilac2]); p.max = 1.4; }
      else if (type === 'star') { p.g = 60; p.color = CORE.pick([PAL.lemon, PAL.white]); p.size = 2; }
      parts.push(p);
    }
  };
  CORE.clearParticles = () => { parts.length = 0; };
  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.type === 'petal') p.x += Math.sin(p.life * 3 + p.sway) * 20 * dt;
      if (p.type === 'heart' || p.type === 'note') { p.vx *= 0.96; p.x += Math.sin(p.life * 6 + p.sway) * 12 * dt; }
      if (p.type === 'sparkle' || p.type === 'star') { p.vx *= 0.94; p.vy *= 0.94; }
    }
  }
  function drawParticles(c) {
    for (const p of parts) {
      const k = p.life / p.max, a = k > 0.7 ? (1 - k) / 0.3 : 1;
      c.globalAlpha = a;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.type === 'heart') { CORE.bitmap(c, HEART, x - 3 * p.size, y - 3 * p.size, p.size, PAL.ink); CORE.bitmap(c, HEART, x - 3 * p.size - (p.size > 1 ? 0 : 0), y - 3 * p.size - 1, p.size, p.color); }
      else if (p.type === 'sparkle' || p.type === 'star') {
        const s = Math.max(1, Math.round(p.size * (1 - k * 0.5) * (1 + 0.5 * Math.sin(p.life * 20))));
        c.fillStyle = p.color; c.fillRect(x - s * 2, y, s * 4 + 1, 1); c.fillRect(x, y - s * 2, 1, s * 4 + 1); c.fillRect(x - 1, y - 1, 3, 3);
      } else if (p.type === 'petal') {
        c.fillStyle = p.color; const w = Math.abs(Math.cos(p.rot)) * 3 + 1;
        c.fillRect(x - Math.floor(w / 2), y - 1, Math.ceil(w), 3); c.fillStyle = '#ff8fb1'; c.fillRect(x, y, 1, 1);
      } else if (p.type === 'confetti') {
        c.fillStyle = p.color; const w = Math.abs(Math.cos(p.rot)) * 4 + 1; c.fillRect(x - Math.floor(w / 2), y - 2, Math.ceil(w), 4);
      } else if (p.type === 'dust') { c.fillStyle = p.color; c.fillRect(x, y, p.size, p.size); }
      else if (p.type === 'note') {
        c.fillStyle = p.color; c.fillRect(x, y, 3, 3); c.fillRect(x + 2, y - 6, 1, 7); c.fillRect(x + 3, y - 6, 2, 1);
      }
    }
    c.globalAlpha = 1;
  }

  /* ---------- text ---------- */
  CORE.font = (px, head) => head ? `800 ${px}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif` : `${px}px "DotGothic16", "MS Gothic", monospace`;
  CORE.text = (c, str, x, y, o = {}) => {
    c.font = CORE.font(o.size || 16, o.head);
    c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'top';
    str = String(str);
    x = Math.round(x); y = Math.round(y);
    if (o.alpha != null) c.globalAlpha = o.alpha;
    if (o.outline) {
      c.fillStyle = o.outline; const w = o.ow || 1;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (dx || dy) c.fillText(str, x + dx, y + dy);
    } else if (o.shadow) { c.fillStyle = o.shadow; c.fillText(str, x + 1, y + 1); }
    c.fillStyle = o.color || PAL.ink; c.fillText(str, x, y);
    if (o.alpha != null) c.globalAlpha = 1;
  };
  CORE.measure = (c, str, size, head) => { c.font = CORE.font(size || 16, head); return c.measureText(String(str)).width; };
  const NO_START = '、。，．,.・：；:;？！?!゛゜ヽヾゝゞ々ーｰ）)］]｝}」』】〕〉》’”…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〜～';
  const NO_END = '（(［[｛{「『【〔〈《‘“';
  CORE.wrap = (c, text, maxW, size, head) => {
    c.font = CORE.font(size || 16, head);
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      const chars = Array.from(para);
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (line && c.measureText(line + ch).width > maxW) {
          if (NO_START.includes(ch)) { line += ch; continue; } /* hang punctuation */
          let carry = '';
          while (line.length > 1 && NO_END.includes(line[line.length - 1])) { carry = line[line.length - 1] + carry; line = line.slice(0, -1); }
          /* avoid leaving small kana/punct run at line start: pull previous char down */
          out.push(line); line = carry + ch;
        } else line += ch;
      }
      out.push(line);
    }
    return out;
  };

  class Typewriter {
    constructor(text, maxW, size, onChar) {
      this.size = size || 16;
      this.lines = CORE.wrap(ctx, text, maxW, this.size);
      this.total = this.lines.reduce((a, l) => a + Array.from(l).length, 0);
      this.shown = 0; this.acc = 0; this.onChar = onChar; this.done = this.total === 0; this.idle = 0;
    }
    get cps() { return [18, 34, 60, 400][CORE.textSpeedIdx != null ? CORE.textSpeedIdx : 1]; }
    update(dt, fast) {
      if (this.done) { this.idle += dt; return; }
      this.acc += dt * this.cps * (fast ? 4 : 1);
      while (this.acc >= 1 && !this.done) {
        this.acc -= 1; this.shown++;
        const ch = this.charAt(this.shown - 1);
        if (this.onChar && ch && !'、。…！？ 　'.includes(ch) && this.shown % 2 === 1) this.onChar(ch);
        if ('。！？'.includes(ch)) this.acc -= 3;
        else if ('、…'.includes(ch)) this.acc -= 1.5;
        if (this.shown >= this.total) this.done = true;
      }
    }
    charAt(i) { for (const l of this.lines) { const a = Array.from(l); if (i < a.length) return a[i]; i -= a.length; } return ''; }
    complete() { this.shown = this.total; this.done = true; }
    draw(c, x, y, lh, color) {
      let left = this.shown;
      c.font = CORE.font(this.size); c.textAlign = 'left'; c.textBaseline = 'top';
      for (let i = 0; i < this.lines.length && left > 0; i++) {
        const a = Array.from(this.lines[i]); const s = a.slice(0, left).join(''); left -= a.length;
        c.fillStyle = 'rgba(43,45,92,0.18)'; c.fillText(s, x + 1, y + i * lh + 1);
        c.fillStyle = color || PAL.ink; c.fillText(s, x, y + i * lh);
      }
    }
  }
  CORE.Typewriter = Typewriter;

  /* ---------- UI ---------- */
  const UI = CORE.ui = {};
  /* pixel frame: notched corners, 2px ink border, inner light line, drop shadow */
  UI.frame = (c, x, y, w, h, o = {}) => {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const fill = o.fill || PAL.cream, border = o.border || PAL.ink, hi = o.hi || 'rgba(255,255,255,0.75)';
    if (o.shadow !== false) { c.fillStyle = o.shadowColor || PAL.shadow; const d = o.depth == null ? 3 : o.depth; c.fillRect(x + 2 + d, y + h, w - 4, d); c.fillRect(x + w, y + 2 + d, d, h - 4); c.fillRect(x + w - 2 + d, y + h - 2 + d, 2, 2); c.fillRect(x + w - 2 + d - 2 + 2, y + h - 2, d, 2); }
    c.fillStyle = border;
    c.fillRect(x + 2, y, w - 4, h); c.fillRect(x, y + 2, w, h - 4); c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = fill;
    c.fillRect(x + 3, y + 2, w - 6, h - 4); c.fillRect(x + 2, y + 3, w - 4, h - 6);
    if (o.band) { c.fillStyle = o.band; c.fillRect(x + 3, y + 2, w - 6, o.bandH || 14); c.fillRect(x + 2, y + 3, w - 4, (o.bandH || 14) - 1); }
    c.fillStyle = hi; c.fillRect(x + 3, y + 3, w - 6, 1); c.fillRect(x + 3, y + 3, 1, h - 7);
    if (o.dots) { c.fillStyle = o.dots; for (let yy = y + 6; yy < y + h - 4; yy += 6) for (let xx = x + 6 + ((yy / 6) & 1) * 3; xx < x + w - 4; xx += 6) c.fillRect(xx, yy, 1, 1); }
  };
  UI.bar = (c, x, y, w, h, frac, color, bg) => {
    c.fillStyle = PAL.ink; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = bg || '#e9dcc0'; c.fillRect(x, y, w, h);
    const fw = Math.round(w * CORE.clamp(frac, 0, 1));
    c.fillStyle = color; c.fillRect(x, y, fw, h);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x, y, fw, 1);
  };

  class Gauge {
    constructor(value, max, color) { this.max = max; this.value = value; this.disp = value; this.ghost = value; this.color = color; this.hold = 0; this.pulse = 0; }
    set(v, instant) {
      if (instant) { this.value = this.disp = this.ghost = v; return; }
      if (v < this.value) { this.ghost = Math.max(this.ghost, this.disp); this.disp = v; }
      else if (v > this.value) { this.ghost = v; }
      this.value = v; this.hold = 0.35; this.pulse = 0.3;
    }
    update(dt) {
      this.pulse = Math.max(0, this.pulse - dt);
      if (this.hold > 0) { this.hold -= dt; return; }
      if (this.disp < this.value) this.disp = Math.min(this.value, this.disp + Math.max(dt * this.max * 0.6, (this.value - this.disp) * dt * 6));
      if (this.ghost > this.value) this.ghost = Math.max(this.value, this.ghost - Math.max(dt * this.max * 0.4, (this.ghost - this.value) * dt * 5));
      if (this.ghost < this.disp) this.ghost = this.disp;
      if (this.disp > this.value) this.disp = this.value;
    }
    draw(c, x, y, w, h) {
      c.fillStyle = PAL.ink; c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = '#e9dcc0'; c.fillRect(x, y, w, h);
      const gw = Math.round(w * CORE.clamp(this.ghost / this.max, 0, 1)), dw = Math.round(w * CORE.clamp(this.disp / this.max, 0, 1));
      const rising = this.value >= this.ghost - 0.01 && this.ghost > this.disp + 0.5;
      c.fillStyle = rising || this.ghost <= this.value ? '#bff5c9' : '#ff9aa6'; c.fillRect(x, y, gw, h);
      c.fillStyle = this.color; c.fillRect(x, y, dw, h);
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x, y, dw, 1);
      if (this.pulse > 0) { c.fillStyle = `rgba(255,255,255,${this.pulse * 2})`; c.fillRect(x, y, dw, h); }
      c.fillStyle = 'rgba(43,45,92,0.25)'; for (let i = 1; i < 4; i++) c.fillRect(x + Math.round(w * i / 4), y, 1, h);
    }
  }
  UI.Gauge = Gauge;

  /* Button: hover bounce, press sink */
  class Button {
    constructor(o) {
      Object.assign(this, { x: 0, y: 0, w: 100, h: 28, label: '', size: 16, enabled: true, color: PAL.cream, hoverColor: PAL.pinkL, textColor: PAL.ink, icon: null, desc: '', visible: true }, o);
      this.hov = 0; this.bounce = 0; this.press = 0; this.pressing = false; this.focused = false; this.wasHover = false; this.appear = 1;
    }
    contains(px, py) { return px >= this.x && py >= this.y && px < this.x + this.w && py < this.y + this.h; }
    update(dt, active) {
      const over = active && this.visible && this.contains(inp.x, inp.y);
      if (over && inp.lastKind === 'mouse' && !this.wasHover && this.enabled) { this.bounce = 1; if (this.group) this.group.setFocus(this, true); }
      this.wasHover = over;
      const hot = this.enabled && (this.focused || over);
      this.hov += ((hot ? 1 : 0) - this.hov) * Math.min(1, dt * 14);
      this.bounce = Math.max(0, this.bounce - dt * 3.5);
      if (active && this.visible && this.enabled && over && inp.pressed && !inp.consumed) { this.pressing = true; inp.consume(); }
      if (this.pressing && !inp.down) {
        this.pressing = false;
        if (over) this.fire();
      }
      if (this.pressing && !over && inp.x !== -99) this.pressing = false;
      this.press += ((this.pressing ? 1 : 0) - this.press) * Math.min(1, dt * 25);
    }
    fire() {
      if (!this.enabled) { if (window.SND) SND.se('cancel'); return; }
      this.press = 1; this.bounce = 0.6;
      if (this.onClick) this.onClick(this);
    }
    draw(c) {
      if (!this.visible) return;
      const b = Math.sin(this.bounce * Math.PI * 3) * this.bounce * 2.5;
      const sink = Math.round(this.press * 2);
      const lift = Math.round(-this.hov * 1 - b);
      const x = this.x, y = this.y + sink + lift;
      const col = !this.enabled ? '#ddd5c4' : (this.hov > 0.5 ? this.hoverColor : this.color);
      UI.frame(c, x, y, this.w, this.h, { fill: col, depth: 3 - sink, border: this.enabled ? PAL.ink : PAL.grey });
      let tx = x + this.w / 2;
      if (this.icon && window.ART && ART.icon) {
        const is = this.iconSize || 16;
        const ix = this.label ? x + 8 : x + (this.w - is) / 2;
        try { ART.icon(c, this.icon, Math.round(ix), Math.round(y + (this.h - is) / 2), is); } catch (e) { /* ignore */ }
        if (this.label) tx = x + 8 + is + (this.w - 8 - is) / 2;
      }
      if (this.render) this.render(c, x, y, this);
      else if (this.label) {
        const avail = this.icon ? this.w - (this.iconSize || 16) - 18 : this.w - 12;
        let sz = this.size; if (sz > 12 && CORE.measure(c, this.label, sz, this.head) > avail) sz = 12;
        if (this.icon && sz !== this.size) tx = x + 8 + (this.iconSize || 16) + 4 + (this.w - 12 - (this.iconSize || 16) - 4) / 2;
        CORE.text(c, this.label, tx, y + this.h / 2 - sz / 2 - (sz >= 16 ? 1 : 0), { size: sz, align: 'center', color: this.enabled ? this.textColor : PAL.grey, head: this.head });
      }
      if (this.focused && this.enabled && this.hov > 0.5) {
        const t = CORE.time * 6; const ax = x - 7 + Math.round(Math.sin(t) * 1.5);
        c.fillStyle = PAL.pink2; c.fillRect(ax, y + this.h / 2 - 3, 2, 6); c.fillRect(ax + 2, y + this.h / 2 - 2, 1, 4); c.fillRect(ax + 3, y + this.h / 2 - 1, 1, 2);
      }
    }
  }
  UI.Button = Button;

  /* ButtonGroup: keyboard navigation between buttons (spatial) */
  class Group {
    constructor(buttons, o = {}) {
      this.buttons = []; this.focus = null; this.onCancel = o.onCancel; this.active = true;
      buttons.forEach(b => this.add(b));
      const first = this.buttons.find(b => b.enabled && b.visible);
      if (first) this.setFocus(first, true);
    }
    add(b) { b.group = this; this.buttons.push(b); return b; }
    setFocus(b, silent) {
      if (this.focus === b) return;
      if (this.focus) this.focus.focused = false;
      this.focus = b; if (b) b.focused = true;
      if (!silent && window.SND) SND.se('cursor');
      if (b && this.onFocus) this.onFocus(b);
    }
    move(dx, dy) {
      const f = this.focus; if (!f) return;
      const fx = f.x + f.w / 2, fy = f.y + f.h / 2; let best = null, bd = 1e9;
      for (const b of this.buttons) {
        if (b === f || !b.visible || !b.enabled) continue;
        const bx = b.x + b.w / 2 - fx, by = b.y + b.h / 2 - fy;
        const along = bx * dx + by * dy; if (along <= 2) continue;
        const across = Math.abs(bx * dy - by * dx);
        const d = along + across * 2.5; if (d < bd) { bd = d; best = b; }
      }
      if (best) { this.setFocus(best); best.bounce = 0.7; }
    }
    update(dt, active) {
      active = active && this.active;
      for (const b of this.buttons) b.update(dt, active);
      if (!active) return;
      if (this.focus && !this.focus.hov && inp.lastKind === 'mouse' && !this.buttons.some(b => b.visible && b.contains(inp.x, inp.y))) { /* keep focus */ }
      if (inp.key('up')) { this.move(0, -1); inp.consume(); }
      else if (inp.key('down')) { this.move(0, 1); inp.consume(); }
      else if (inp.key('left')) { this.move(-1, 0); inp.consume(); }
      else if (inp.key('right')) { this.move(1, 0); inp.consume(); }
      else if (inp.key('ok') && this.focus && this.focus.visible) { inp.consume(); this.focus.fire(); }
      else if (inp.key('cancel') && this.onCancel) { inp.consume(); this.onCancel(); }
    }
    draw(c) { for (const b of this.buttons) b.draw(c); }
  }
  UI.Group = Group;

  /* number pops */
  const pops = [];
  CORE.pop = (x, y, text, color, o = {}) => {
    const near = pops.filter(p => Math.abs(p.x0 - x) < 40 && Math.abs(p.y0 - y) < 20 && p.t < 0.5).length;
    const p = { x0: x, y0: y, x, y, text, color: color || PAL.green, t: 0, dur: o.dur || 1.3, off: near * 14, size: o.size || 16, scale: 0 };
    pops.push(p);
  };
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt;
      if (p.t > p.dur) { pops.splice(i, 1); continue; }
      const k = Math.min(1, p.t / 0.4);
      p.y = p.y0 - p.off - 18 * E.backOut(k) - Math.max(0, p.t - 0.8) * 10;
      p.scale = E.elasticOut(Math.min(1, p.t / 0.5));
    }
  }
  function drawPops(c) {
    for (const p of pops) {
      const a = p.t > p.dur - 0.3 ? (p.dur - p.t) / 0.3 : 1;
      c.save(); c.globalAlpha = a; c.translate(Math.round(p.x), Math.round(p.y)); const s = 0.6 + 0.4 * p.scale; c.scale(s, s);
      CORE.text(c, p.text, 0, -p.size / 2, { size: p.size, align: 'center', color: p.color, outline: PAL.white, ow: 2, head: true });
      c.restore();
    }
  }

  /* toasts */
  const toasts = [];
  CORE.toast = (text, o = {}) => { toasts.push({ text, icon: o.icon, color: o.color || PAL.cream, t: 0, dur: o.dur || 2.2, y: -40 }); };
  function updateToasts(dt) {
    for (let i = toasts.length - 1; i >= 0; i--) { const t = toasts[i]; t.t += dt; if (t.t > t.dur) toasts.splice(i, 1); }
  }
  function drawToasts(c) {
    toasts.forEach((t, i) => {
      const inK = E.backOut(Math.min(1, t.t / 0.35)), outK = t.t > t.dur - 0.3 ? E.quadIn((t.t - (t.dur - 0.3)) / 0.3) : 0;
      const w = CORE.measure(c, t.text, 16) + (t.icon ? 40 : 24);
      const y = -34 + (44 + i * 36) * inK - 50 * outK;
      const x = (W - w) / 2;
      UI.frame(c, x, y, w, 30, { fill: t.color });
      let tx = x + 12;
      if (t.icon && window.ART) { try { ART.icon(c, t.icon, tx, y + 7, 16); } catch (e) { /* ignore */ } tx += 20; }
      CORE.text(c, t.text, tx, y + 7, { size: 16 });
    });
  }

  /* ---------- loop ---------- */
  let last = 0, acc = 0;
  CORE.onUpdate = null; CORE.onDraw = null; CORE.onOverlay = null;
  function update(dt) {
    CORE.time += dt;
    pollInput(dt);
    updateTimers(dt);
    if (fx.shake > 0) fx.shake -= dt;
    if (fx.flash > 0) fx.flash -= dt;
    const blocked = CORE.busy();
    for (let i = stack.length - 1; i >= 0; i--) {
      const sc = stack[i];
      if (!sc) continue;
      const active = !blocked && i === stack.length - 1;
      if (sc.update) sc.update(dt, active);
    }
    updateParticles(dt); updatePops(dt); updateToasts(dt);
    if (CORE.onUpdate) CORE.onUpdate(dt);
  }
  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (fx.shake > 0) { const m = fx.shakeMag * (fx.shake / fx.shakeDur); ctx.translate(Math.round(CORE.rand(-m, m)), Math.round(CORE.rand(-m, m))); }
    for (const sc of stack) if (sc.draw) { ctx.save(); try { sc.draw(ctx); } catch (e) { console.error(e); } ctx.restore(); }
    if (CORE.onOverlay) { ctx.save(); CORE.onOverlay(ctx); ctx.restore(); }
    drawParticles(ctx); drawPops(ctx);
    ctx.restore();
    if (fx.flash > 0) { ctx.globalAlpha = Math.min(1, fx.flash / fx.flashDur); ctx.fillStyle = fx.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    drawToasts(ctx);
    drawTransition(ctx);
  }
  function frame(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    acc += dt * CORE.timeScale;
    let n = 0;
    while (acc >= STEP && n < 240) { update(STEP); acc -= STEP; n++; }
    if (n >= 240) acc = 0;
    draw();
    requestAnimationFrame(frame);
  }
  CORE.start = () => {
    canvas = document.getElementById('game');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    CORE.canvas = canvas; CORE.ctx = ctx;
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    bindInput();
    requestAnimationFrame(frame);
  };
  CORE.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return c; };
})();
