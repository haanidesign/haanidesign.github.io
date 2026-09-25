/* SND: WebAudio synthesized SE + BGM (no files) */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master, comp, bgmBus, seBus, revIn, dlyIn, noiseBuf, waves = {};
  var vol = { bgm: 0.5, se: 0.7 };
  var pendingBgm = null, cur = null, curName = null, timer = null;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var NI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function note(s) { // "F#5" -> midi
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) return null;
    return NI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  }
  var CQ = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6] };
  function chord(s) { // "F#m7" -> {root, tones}
    var m = /^([A-G][#b]?)(.*)$/.exec(s);
    var r = note(m[1] + '3'); if (r > 54) r -= 12;
    return { root: r, iv: CQ[m[2]] || CQ[''] };
  }

  function build() {
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ctx.destination);
    bgmBus = ctx.createGain(); bgmBus.gain.value = vol.bgm; bgmBus.connect(comp);
    seBus = ctx.createGain(); seBus.gain.value = vol.se; seBus.connect(comp);
    // reverb
    var len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    var conv = ctx.createConvolver(); conv.buffer = ir;
    revIn = ctx.createGain(); revIn.gain.value = 0.25; revIn.connect(conv);
    var rg = ctx.createGain(); rg.gain.value = 0.5; conv.connect(rg); rg.connect(comp);
    // feedback delay
    dlyIn = ctx.createGain(); dlyIn.gain.value = 0.3;
    var dl = ctx.createDelay(1); dl.delayTime.value = 0.28;
    var fb = ctx.createGain(); fb.gain.value = 0.32;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    dlyIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
    // noise
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0); for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // pulse waves
    [0.125, 0.25].forEach(function (duty) {
      var n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (var k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 1;
      for (k = 1; k < n; k++) { re[k] = im[k] * Math.sin(k * Math.PI * duty); im[k] = im[k] * Math.cos(k * Math.PI * duty); }
      waves['p' + duty] = ctx.createPeriodicWave(re, im);
    });
  }

  // ---------- voices ----------
  function setType(o, t) { if (waves[t]) o.setPeriodicWave(waves[t]); else o.type = t; }
  // tone: generic enveloped oscillator
  function tone(out, t, o) {
    var osc = ctx.createOscillator(), g = ctx.createGain();
    setType(osc, o.type || 'square');
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.slide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    var a = o.a || 0.004, v = o.v || 0.2, dur = o.dur || 0.1, r = o.r || 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sus != null) g.gain.setTargetAtTime(v * o.sus, t + a, dur * 0.3);
    g.gain.setValueAtTime(o.sus != null ? v * o.sus : v, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    if (o.vib) { var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t + 0.12); l.stop(t + dur + r + 0.05); }
    osc.connect(g);
    [].concat(out).forEach(function (d) { if (d.node) { var s = ctx.createGain(); s.gain.value = d.amt; g.connect(s); s.connect(d.node); } else g.connect(d); });
    osc.start(t); osc.stop(t + dur + r + 0.05);
    return osc;
  }
  function fm(out, t, f, dur, v, ratio, idx) { // FM bell
    var c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.frequency.value = f; m.frequency.value = f * (ratio || 3.5);
    mg.gain.setValueAtTime(f * (idx || 2), t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    m.connect(mg); mg.connect(c.frequency); c.connect(g);
    [].concat(out).forEach(function (d) { if (d.node) { var s = ctx.createGain(); s.gain.value = d.amt; g.connect(s); s.connect(d.node); } else g.connect(d); });
    c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  }
  function noise(out, t, o) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = o.ft || 'highpass'; f.frequency.setValueAtTime(o.ff || 5000, t);
    if (o.ff2) f.frequency.exponentialRampToValueAtTime(o.ff2, t + o.dur);
    f.Q.value = o.q || 0.7;
    var v = o.v || 0.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (o.a || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); [].concat(out).forEach(function (d) { g.connect(d); });
    s.start(t, Math.random()); s.stop(t + o.dur + 0.05);
  }
  function pad(out, t, midis, dur, v) {
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.25);
    g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    f.connect(g); g.connect(out); var s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(revIn);
    midis.forEach(function (m) {
      [-7, 7].forEach(function (dt) {
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
        o.connect(f); o.start(t); o.stop(t + dur + 0.15);
      });
    });
  }
  function kick(out, t, v) { tone(out, t, { type: 'sine', f: 150, f2: 40, slide: 0.12, dur: 0.02, r: 0.16, v: v || 0.7 }); }
  function snare(out, t, v) { noise(out, t, { ft: 'bandpass', ff: 2500, q: 0.6, dur: 0.16, v: (v || 0.35) }); tone(out, t, { type: 'triangle', f: 220, f2: 140, dur: 0.03, r: 0.06, v: 0.25 }); }
  function hat(out, t, v, open) { noise(out, t, { ff: 7500, dur: open ? 0.18 : 0.04, v: v || 0.1 }); }

  // ---------- SE ----------
  function N(s) { return mtof(note(s)); }
  var SE = {
    cursor: function (t, o) { tone(o, t, { type: 'p0.25', f: 1760, dur: 0.018, r: 0.02, v: 0.12 }); },
    decide: function (t, o) { tone(o, t, { type: 'p0.25', f: N('E6'), dur: 0.04, r: 0.02, v: 0.15 }); tone([o, { node: dlyIn, amt: 0.3 }], t + 0.045, { type: 'p0.25', f: N('B6'), dur: 0.06, r: 0.12, v: 0.15 }); },
    cancel: function (t, o) { tone(o, t, { type: 'square', f: 660, f2: 330, dur: 0.07, r: 0.03, v: 0.1 }); },
    pop_up: function (t, o) { ['C6', 'E6', 'G6', 'C7'].forEach(function (n, i) { tone(o, t + i * 0.035, { type: 'p0.25', f: N(n), dur: 0.03, r: 0.05, v: 0.11 }); }); },
    pop_down: function (t, o) { ['G5', 'D#5', 'C5', 'G4'].forEach(function (n, i) { tone(o, t + i * 0.045, { type: 'triangle', f: N(n), dur: 0.035, r: 0.05, v: 0.2 }); }); },
    success: function (t, o) { ['C5', 'E5', 'G5', 'C6'].forEach(function (n, i) { tone([o, { node: revIn, amt: 0.4 }], t + i * 0.06, { type: 'p0.25', f: N(n), dur: i === 3 ? 0.25 : 0.05, r: 0.15, v: 0.13 }); }); },
    great: function (t, o) {
      var sq = [['G5', 0], ['G5', .09], ['G5', .18], ['C6', .3]];
      sq.forEach(function (x, i) { tone([o, { node: revIn, amt: 0.5 }], t + x[1], { type: 'p0.25', f: N(x[0]), dur: i === 3 ? 0.5 : 0.06, r: 0.25, v: 0.15, vib: i === 3 ? 8 : 0 }); });
      ['C5', 'E5', 'G5'].forEach(function (n) { tone(o, t + 0.3, { type: 'square', f: N(n), dur: 0.5, r: 0.25, v: 0.05 }); });
      tone(o, t + 0.3, { type: 'triangle', f: N('C3'), dur: 0.5, r: 0.2, v: 0.3 });
      noise([o, revIn], t + 0.3, { ff: 6000, dur: 0.8, v: 0.06 });
      for (var i = 0; i < 6; i++) fm([o, { node: dlyIn, amt: 0.4 }], t + 0.35 + i * 0.07, N('C7') * Math.pow(2, (i % 3) * 4 / 12), 0.3, 0.05);
    },
    fail: function (t, o) { tone(o, t, { type: 'square', f: 392, dur: 0.12, r: 0.03, v: 0.1 }); tone(o, t + 0.16, { type: 'square', f: 370, f2: 250, slide: 0.4, dur: 0.4, r: 0.1, v: 0.1, vib: 10 }); },
    type: function (t, o) { tone(o, t, { type: 'p0.125', f: 1100 + Math.random() * 120, dur: 0.012, r: 0.012, v: 0.04 }); },
    page: function (t, o) { noise(o, t, { ft: 'bandpass', ff: 1500, ff2: 5000, q: 1, dur: 0.12, a: 0.03, v: 0.12 }); },
    heart: function (t, o) { // kyun
      tone([o, { node: revIn, amt: 0.5 }], t, { type: 'sine', f: 700, f2: 1900, slide: 0.12, dur: 0.14, r: 0.18, v: 0.22, vib: 25 });
      tone([o, { node: dlyIn, amt: 0.4 }], t + 0.01, { type: 'p0.25', f: 1400, f2: 2800, slide: 0.12, dur: 0.1, r: 0.12, v: 0.05 });
      fm([o, { node: dlyIn, amt: 0.5 }], t + 0.14, N('E7'), 0.4, 0.05, 2, 1);
    },
    heart_break: function (t, o) {
      tone(o, t, { type: 'square', f: 900, f2: 120, slide: 0.5, dur: 0.5, r: 0.1, v: 0.1 });
      noise(o, t + 0.05, { ft: 'bandpass', ff: 3000, ff2: 400, q: 2, dur: 0.35, v: 0.2 });
      tone(o, t + 0.05, { type: 'triangle', f: 90, f2: 50, dur: 0.2, r: 0.1, v: 0.35 });
    },
    bomb_warn: function (t, o) { // fuse
      noise(o, t, { ft: 'bandpass', ff: 4000, q: 3, dur: 0.9, a: 0.05, v: 0.12 });
      for (var i = 0; i < 3; i++) tone(o, t + i * 0.25, { type: 'square', f: 1320, dur: 0.07, r: 0.02, v: 0.07 });
      for (i = 0; i < 18; i++) noise(o, t + i * 0.05 + Math.random() * 0.02, { ff: 6000, dur: 0.015, v: 0.08 });
    },
    bomb: function (t, o) {
      noise(o, t, { ft: 'bandpass', ff: 5000, q: 3, dur: 0.35, v: 0.1 });
      var e = t + 0.35;
      noise([o, revIn], e, { ft: 'lowpass', ff: 3000, ff2: 150, dur: 1.2, v: 0.8, q: 1 });
      tone(o, e, { type: 'sine', f: 120, f2: 30, slide: 0.5, dur: 0.1, r: 0.7, v: 0.9 });
      tone(o, e, { type: 'square', f: 80, f2: 35, slide: 0.3, dur: 0.1, r: 0.3, v: 0.25 });
    },
    flash: function (t, o) { noise([o, revIn], t, { ff: 3000, ff2: 12000, dur: 0.25, v: 0.2 }); tone(o, t, { type: 'sine', f: 3000, f2: 8000, dur: 0.1, r: 0.1, v: 0.08 }); },
    phone_ring: function (t, o) { // smartphone marimba-ish ringtone, ~2s
      var mel = ['E6', 'G6', 'B6', 'G6', 'E6', 'G6', 'B6', 'D7', null, 'E6', 'G6', 'B6', 'G6', 'E6', 'G6', 'B6', 'D7'];
      mel.forEach(function (n, i) { if (n) fm([o, { node: revIn, amt: 0.3 }], t + i * 0.11, N(n), 0.18, 0.12, 4, 1.2); });
    },
    phone_dial: function (t, o) { // ringback tone x2
      for (var r = 0; r < 2; r++) { tone(o, t + r * 1.0, { type: 'sine', f: 400, dur: 0.5, r: 0.02, v: 0.12 }); tone(o, t + r * 1.0, { type: 'sine', f: 416, dur: 0.5, r: 0.02, v: 0.1 }); }
    },
    phone_pickup: function (t, o) { noise(o, t, { ft: 'bandpass', ff: 1200, q: 2, dur: 0.05, v: 0.3 }); tone(o, t + 0.04, { type: 'sine', f: 1200, f2: 1800, dur: 0.05, r: 0.04, v: 0.1 }); },
    chime: function (t, o) { // Westminster
      var m = ['E5', 'C5', 'D5', 'G4', null, 'G4', 'D5', 'E5', 'C5'];
      m.forEach(function (n, i) { if (n) fm([o, { node: revIn, amt: 0.8 }], t + i * 0.5, N(n), 1.5, 0.16, 3.01, 1.5); });
    },
    bell_rank: function (t, o) { [0, 0.12, 0.24].forEach(function (d) { fm([o, { node: revIn, amt: 0.6 }], t + d, N('C7'), 0.7, 0.1, 2.76, 2.5); }); },
    whistle: function (t, o) { tone(o, t, { type: 'sine', f: 2800, dur: 0.12, r: 0.02, v: 0.14, vib: 120 }); tone(o, t + 0.2, { type: 'sine', f: 2800, dur: 0.55, r: 0.05, v: 0.14, vib: 140 }); noise(o, t, { ft: 'bandpass', ff: 2800, q: 4, dur: 0.75, v: 0.04 }); },
    cheer: function (t, o) {
      noise([o, revIn], t, { ft: 'bandpass', ff: 1800, q: 0.5, dur: 1.6, a: 0.25, v: 0.35 });
      for (var i = 0; i < 20; i++) tone(o, t + Math.random() * 1.1, { type: 'sawtooth', f: 500 + Math.random() * 600, f2: 700 + Math.random() * 800, dur: 0.15, r: 0.15, v: 0.015 });
      for (i = 0; i < 25; i++) noise(o, t + Math.random() * 1.3, { ft: 'bandpass', ff: 2000, q: 1, dur: 0.03, v: 0.12 });
    },
    drumroll: function (t, o) {
      for (var i = 0; i < 40; i++) noise(o, t + i * 0.035, { ft: 'bandpass', ff: 2200, q: 0.7, dur: 0.06, v: 0.08 + 0.15 * i / 40 });
      snare(o, t + 1.45, 0.5); kick(o, t + 1.45, 0.8); noise([o, revIn], t + 1.45, { ff: 5000, dur: 0.8, v: 0.15 });
    },
    camera: function (t, o) { noise(o, t, { ft: 'bandpass', ff: 3000, q: 1, dur: 0.03, v: 0.35 }); noise(o, t + 0.09, { ft: 'bandpass', ff: 2000, q: 1, dur: 0.05, v: 0.3 }); },
    sparkle: function (t, o) { for (var i = 0; i < 7; i++) fm([o, { node: dlyIn, amt: 0.5 }], t + i * 0.045, mtof(96 + [0, 4, 7, 11, 12, 16, 19][i]), 0.25, 0.05, 2, 1); },
    week: function (t, o) { tone([o, { node: revIn, amt: 0.4 }], t, { type: 'p0.25', f: N('G5'), dur: 0.08, r: 0.05, v: 0.12 }); tone([o, { node: revIn, amt: 0.4 }], t + 0.1, { type: 'p0.25', f: N('C6'), dur: 0.2, r: 0.2, v: 0.12 }); },
    levelup: function (t, o) {
      ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'].forEach(function (n, i) { tone(o, t + i * 0.04, { type: 'p0.25', f: N(n), dur: 0.035, r: 0.02, v: 0.1 }); });
      tone([o, { node: revIn, amt: 0.5 }], t + 0.34, { type: 'p0.25', f: N('C6'), dur: 0.1, r: 0.05, v: 0.13 });
      tone([o, { node: revIn, amt: 0.5 }], t + 0.46, { type: 'p0.25', f: N('G6'), dur: 0.35, r: 0.25, v: 0.13, vib: 8 });
    },
    stamp: function (t, o) { tone(o, t, { type: 'sine', f: 180, f2: 60, dur: 0.03, r: 0.1, v: 0.6 }); noise(o, t, { ft: 'lowpass', ff: 1500, dur: 0.08, v: 0.4 }); },
    door: function (t, o) { // sliding classroom door
      noise(o, t, { ft: 'bandpass', ff: 400, ff2: 900, q: 1.5, dur: 0.4, a: 0.05, v: 0.3 });
      tone(o, t + 0.38, { type: 'triangle', f: 110, f2: 70, dur: 0.02, r: 0.12, v: 0.4 }); noise(o, t + 0.38, { ft: 'lowpass', ff: 1200, dur: 0.08, v: 0.3 });
    }
  };

  // ---------- BGM data ----------
  // mel: 8 tokens per bar (8th notes), '-' hold, '.' rest. drums: 16 steps per bar; k kick, s snare, h hat, o open hat, c clap
  var SONGS = {
    title: { bpm: 132, lead: 'p0.25', arp: 'bell', bass: 'oct', pad: 1, echo: 1,
      ch: 'F G Em Am F G C C',
      mel: 'A5 - G5 E5 - C5 D5 E5 | D5 - - B4 - G4 A4 B4 | G5 - E5 - B4 - E5 G5 | A5 - - - C6 - B5 A5 | F5 - E5 F5 - A5 G5 F5 | E5 - D5 E5 - G5 F5 D5 | E5 - C5 G4 C5 E5 G5 C6 | C6 - - - . . . .',
      dr: ['k...s..kk.k.s...', 'h.h.h.h.h.h.h.ho'] },
    daily: { bpm: 120, lead: 'p0.125', arp: 0, bass: 'bounce', pad: 0, swing: 0.12,
      ch: 'F Dm Gm C7 F Dm Bb C',
      mel: 'C5 . F5 . A5 . G5 F5 | G5 - E5 . C5 . . . | D5 . G5 . Bb5 . A5 G5 | A5 - G5 - E5 . . . | C5 . F5 . A5 . C6 A5 | D6 - C6 . A5 . F5 . | D5 . F5 . Bb5 . A5 G5 | F5 - - - . . . .',
      dr: ['k.......k.......', '....s.......s...', '..h...h...h...h.'] },
    school: { bpm: 140, lead: 'square', arp: 'pulse', bass: 'oct', pad: 0,
      ch: 'G D Em C G D C D',
      mel: 'B4 D5 G5 - F#5 - E5 D5 | A4 - D5 - F#5 - A5 - | G5 - F#5 E5 B4 - E5 - | C5 E5 G5 - E5 - C5 - | B4 D5 G5 - B5 - A5 G5 | F#5 - A5 - D6 - A5 - | G5 - E5 - C5 - E5 G5 | F#5 - - - D5 - - -',
      dr: ['k...s...k.k.s...', 'h.h.h.h.h.h.h.h.'] },
    date_happy: { bpm: 126, lead: 'p0.25', arp: 'bell', bass: 'bounce', pad: 1, swing: 0.1,
      ch: 'D Bm G A D Bm Em A',
      mel: 'F#5 - A5 - D6 - A5 F#5 | D5 - F#5 - B5 - - - | G5 - B5 - D6 - B5 G5 | A5 - - - E5 - - - | F#5 - A5 - D6 - E6 - | F#6 - D6 - B5 - - - | G5 - F#5 - E5 - G5 - | A5 - - - C#6 - - -',
      dr: ['k..k..k.k..k..k.', '....c.......c...', 'h.hhh.hhh.hhh.hh'] },
    date_calm: { bpm: 88, lead: 'tri', arp: 'bell', bass: 'root', pad: 1, echo: 1,
      ch: 'Cmaj7 Am7 Dm7 G7 Cmaj7 Em7 Fmaj7 G7',
      mel: 'E5 - - G5 - - B5 - | A5 - - - G5 - E5 - | F5 - - A5 - - C6 - | B5 - A5 - G5 - - - | E5 - - G5 - - D6 - | B5 - - - G5 - - - | A5 - G5 - E5 - C5 - | D5 - - - - - . .',
      dr: ['k.........k.....', '....h.......h...'] },
    tension: { bpm: 150, lead: 'square', arp: 'pulse', bass: 'eighth', pad: 0,
      ch: 'Am Am F E Am Am Dm E',
      mel: 'A4 . A4 C5 . A4 E5 . | A4 . A4 C5 . E5 D5 C5 | F4 . A4 C5 . F5 E5 D5 | E5 - G#4 - B4 - E5 - | A5 . A5 G5 . E5 C5 . | A4 . C5 E5 . A5 G5 E5 | F5 . D5 A4 . D5 F5 A5 | G#5 - - - E5 - B4 -',
      dr: ['k..k..k.k..k..k.', '....s.......s..s', 'hhhhhhhhhhhhhhhh'] },
    festival: { bpm: 160, lead: 'square', arp: 0, bass: 'oct', pad: 0,
      ch: 'C F G C C F G C',
      mel: 'G4 - C5 - E5 - G5 - | A5 - F5 - C5 - A4 - | B4 - D5 - G5 - F5 E5 | E5 - C5 - G4 - C5 - | E5 E5 G5 - E5 E5 G5 - | A5 A5 C6 - A5 - F5 - | G5 - F5 E5 D5 - G4 - | C5 - - - . G4 C5 .',
      dr: ['k...k...k...k...', '..s.s.s...s.sss.', 'h.h.h.h.h.h.h.h.'] },
    night: { bpm: 76, lead: 'tri', arp: 'bell', bass: 'root', pad: 1, echo: 1,
      ch: 'Fmaj7 Em7 Dm7 Cmaj7 Bbmaj7 Am7 Gm7 C7',
      mel: 'A5 - - - C6 - A5 - | G5 - - - - - . . | F5 - - - A5 - F5 - | E5 - - - - - . . | D5 - - F5 - - A5 - | C6 - - - A5 - - - | Bb5 - A5 - G5 - F5 - | E5 - - - - - . .',
      dr: ['................', '..h...h...h...h.'] },
    heartbeat: { bpm: 96, lead: 'bell', arp: 0, bass: 'root', pad: 1, echo: 1,
      ch: 'Amaj7 E F#m7 Dmaj7 Amaj7 E F#m7 Dmaj7',
      mel: 'E5 . . . C#6 . . . | B5 . . . G#5 . . . | A5 . . . C#6 . . . | F#5 - - - . . . . | E5 . . . E6 . . . | D#6 . . . B5 . . . | C#6 . . . A5 . . . | F#5 - - - - - - -',
      dr: ['k.k.............', '................'] },
    sad: { bpm: 70, lead: 'tri', arp: 'bell', bass: 'root', pad: 1, echo: 1,
      ch: 'Dm Bb Gm A Dm F Gm A7',
      mel: 'A5 - - - F5 - D5 - | D5 - - - - - . . | Bb4 - D5 - G5 - F5 - | E5 - - - C#5 - - - | D5 - F5 - A5 - D6 - | C6 - - - A5 - - - | Bb5 - A5 - G5 - E5 - | C#5 - - - - - - -',
      dr: [] },
    ending: { bpm: 136, lead: 'p0.25', arp: 'pulse', bass: 'oct', pad: 1, echo: 1,
      ch: 'F G Em Am Dm G C C',
      mel: 'C6 - B5 C6 - A5 G5 A5 | B5 - A5 B5 - G5 E5 G5 | G5 - - E5 - B4 E5 G5 | C6 - B5 A5 - E5 - - | F5 - A5 C6 - A5 D6 - | D6 - C6 B5 - A5 B5 - | C6 - - - G5 - E5 - | C6 - - - - - - -',
      dr: ['k...s...k.k.s...', 'h.h.h.h.h.h.h.hh', '..............c.'] },
    summer: { bpm: 112, lead: 'p0.25', arp: 'bell', bass: 'bounce', pad: 1, swing: 0.14, echo: 1,
      ch: 'Cmaj7 D Bm Em Am7 D G G',
      mel: 'E5 - G5 - B5 - A5 G5 | F#5 - A5 - - - D5 - | D5 - F#5 - B5 - A5 F#5 | G5 - - - E5 - - - | C6 - B5 A5 - G5 E5 - | F#5 - A5 - D6 - C6 A5 | B5 - - - G5 - D5 - | G5 - - - - - . .',
      dr: ['k.....k...k.....', '....s.......s...', '..h...h...h...h.'] }
  };
  // pre-parse
  Object.keys(SONGS).forEach(function (k) {
    var s = SONGS[k];
    s.chords = s.ch.split(' ').map(chord);
    var toks = s.mel.replace(/\|/g, ' ').trim().split(/\s+/), ev = [];
    toks.forEach(function (tk, i) {
      if (tk === '-') { if (ev.length && ev[ev.length - 1].end === i) ev[ev.length - 1].end = i + 1; return; }
      if (tk === '.') return;
      ev.push({ st: i * 2, m: note(tk), end: i + 1 });
    });
    s.notes = {}; ev.forEach(function (e) { s.notes[e.st] = { m: e.m, len: (e.end * 2 - e.st) }; });
    s.bars = s.chords.length; s.steps = s.bars * 16;
  });

  function playStep(p, step, t) {
    var s = p.song, out = p.bus, sd = 60 / s.bpm / 4, bar = Math.floor(step / 16), i = step % 16;
    var c = s.chords[bar], root = c.root;
    var fx = s.echo ? [out, { node: dlyIn, amt: 0.35 }, { node: revIn, amt: 0.3 }] : [out, { node: revIn, amt: 0.2 }];
    // melody
    var n = s.notes[step];
    if (n) {
      var f = mtof(n.m), d = n.len * sd * 0.9;
      if (s.lead === 'bell') fm(fx, t, f, Math.max(0.6, d), 0.14, 2, 1.2);
      else tone(fx, t, { type: s.lead === 'tri' ? 'triangle' : s.lead, f: f, dur: d, r: 0.08, v: s.lead === 'tri' ? 0.2 : 0.075, sus: 0.7, vib: d > 0.3 ? f * 0.008 : 0 });
    }
    // pad
    if (s.pad && i === 0) pad(out, t, c.iv.map(function (x) { return root + 12 + x; }), sd * 16, 0.028);
    // arp
    if (s.arp && i % 2 === 0) {
      var tones = c.iv.concat([12, c.iv[1] + 12]), am = root + 24 + tones[(i / 2) % tones.length];
      if (s.arp === 'bell') { if (i % 4 === 0 || s.bpm > 110) fm([out, { node: dlyIn, amt: 0.3 }], t, mtof(am + 12), 0.25, 0.035, 3.5, 1); }
      else tone(out, t, { type: 'p0.125', f: mtof(am + 12), dur: sd * 0.5, r: 0.03, v: 0.03 });
    }
    // bass
    var bm = null, bl = 1;
    if (s.bass === 'root') { if (i === 0) { bm = root; bl = 8; } else if (i === 8) { bm = root + 7; bl = 7; } }
    else if (s.bass === 'oct') { if (i % 2 === 0) { bm = root + ((i / 2) % 2 ? 12 : 0); bl = 1.6; } }
    else if (s.bass === 'eighth') { if (i % 2 === 0) { bm = root; bl = 1.3; } }
    else if (s.bass === 'bounce') { var pat = { 0: 0, 3: 12, 4: 7, 8: 0, 11: 12, 12: c.iv[1] }; if (pat[i] != null) { bm = root + pat[i]; bl = 1.5; } }
    if (bm != null) tone(out, t, { type: 'triangle', f: mtof(bm), dur: bl * sd, r: 0.04, v: 0.34 });
    // drums
    s.dr.forEach(function (line) {
      var ch = line[i];
      if (ch === 'k') kick(out, t, 0.55); else if (ch === 's') snare(out, t, 0.22);
      else if (ch === 'h') hat(out, t, 0.05); else if (ch === 'o') hat(out, t, 0.06, 1);
      else if (ch === 'c') { noise([out, revIn], t, { ft: 'bandpass', ff: 1500, q: 1, dur: 0.1, v: 0.25 }); }
    });
  }

  function tick() {
    if (!ctx) return;
    var ahead = ctx.currentTime + 0.15;
    [cur].concat(fading).forEach(function (p) {
      if (!p || p.dead) return;
      while (p.next < ahead) {
        if (p.next >= ctx.currentTime - 0.05) { try { playStep(p, p.step, p.next); } catch (e) { if (!p.err) { p.err = 1; console.error("SND step", e); } } }
        var sd = 60 / p.song.bpm / 4, sw = (p.step % 2 === 0 ? 1 : -1) * (p.song.swing || 0) * sd;
        p.step = (p.step + 1) % p.song.steps;
        p.next += sd + sw;
        if (p.next < ctx.currentTime - 0.2) p.next = ctx.currentTime + 0.05; // recover after tab stall
      }
    });
  }
  var fading = [];
  function fadeOut(p, sec) {
    if (!p) return;
    var t = ctx.currentTime;
    p.bus.gain.cancelScheduledValues(t); p.bus.gain.setValueAtTime(p.bus.gain.value, t);
    p.bus.gain.linearRampToValueAtTime(0, t + sec);
    fading.push(p);
    setTimeout(function () { p.dead = true; fading = fading.filter(function (x) { return x !== p; }); try { p.bus.disconnect(); } catch (e) { } }, sec * 1000 + 300);
  }
  function startBgm(name, fade) {
    var song = SONGS[name]; if (!song) return;
    if (cur) fadeOut(cur, fade);
    var g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + Math.max(0.05, fade));
    g.connect(bgmBus);
    cur = { song: song, bus: g, step: 0, next: t + 0.06 };
    curName = name;
    dlyIn.gain.value = 0; dlyIn.gain.setTargetAtTime(0.3, t, 0.1);
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }

  var SND = {
    init: function () {
      try {
        if (!AC) return;
        if (!ctx) build();
        if (ctx.state === 'suspended') ctx.resume();
        if (pendingBgm) { var n = pendingBgm; pendingBgm = null; SND.bgm(n); }
      } catch (e) { if (window.console) console.warn('SND.init', e); }
    },
    se: function (name) {
      if (!ctx || !SE[name]) return;
      try { if (ctx.state === 'suspended') ctx.resume(); SE[name](ctx.currentTime + 0.005, seBus); } catch (e) { console.error("SND se", name, e); }
    },
    bgm: function (name) {
      if (!SONGS[name]) return;
      if (!ctx) { pendingBgm = name; return; }
      if (curName === name && cur) return;
      startBgm(name, cur ? 0.8 : 0.3);
    },
    stopBgm: function (fadeSec) {
      pendingBgm = null;
      if (!ctx || !cur) return;
      fadeOut(cur, fadeSec == null ? 0.6 : fadeSec); cur = null; curName = null;
    },
    setVolume: function (o) {
      o = o || {};
      if (o.bgm != null) vol.bgm = Math.max(0, Math.min(1, o.bgm));
      if (o.se != null) vol.se = Math.max(0, Math.min(1, o.se));
      if (ctx) { bgmBus.gain.setTargetAtTime(vol.bgm, ctx.currentTime, 0.03); seBus.gain.setTargetAtTime(vol.se, ctx.currentTime, 0.03); }
    },
    get current() { return curName; },
    list: { se: Object.keys(SE), bgm: Object.keys(SONGS) }
  };
  window.SND = SND;
})();
