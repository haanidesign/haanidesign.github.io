/* 放課後リフレイン — game */
(function () {
  'use strict';
  const C = CORE, P = C.PAL, UI = C.ui, W = 640, H = 360;
  const inp = C.input;
  const D = () => window.DATA || {};
  const G = { phase: 'boot', fast: false, log: [] };

  /* ================= safe wrappers ================= */
  const warned = {};
  function warnOnce(k, e) { if (!warned[k]) { warned[k] = 1; console.warn('[houkago]', k, e && e.message); } }
  const snd = {
    se(n) { if (window.SND && !G.muteSe) try { SND.se(n); } catch (e) { warnOnce('se' + n, e); } },
    bgm(n) { if (!window.SND) return; try { if (n) SND.bgm(n); else SND.stopBgm(); } catch (e) { warnOnce('bgm' + n, e); } },
    stop(f) { if (window.SND) try { SND.stopBgm(f); } catch (e) { /* ignore */ } }
  };
  const BG_FALLBACK = { title: ['#ffd0de', '#fff6e0'], bedroom: ['#1f2150', '#3a3d7a'], night: ['#1f2150', '#3a3d7a'] };
  const art = {
    bg(c, id, t) {
      if (window.ART && ART.bg) { try { ART.bg(c, id, t); return; } catch (e) { warnOnce('bg:' + id, e); } }
      const f = BG_FALLBACK[id] || ['#bfe6ff', '#fff6e0'];
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, f[0]); g.addColorStop(1, f[1]);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    },
    portrait(c, id, expr, x, y, o) {
      if (window.ART && ART.portrait) { try { ART.portrait(c, id, expr || 'normal', x, y, o); return; } catch (e) { warnOnce('pt:' + id + expr, e); } }
      c.save(); c.globalAlpha = o && o.alpha != null ? o.alpha : 1;
      c.fillStyle = charColor(id); c.beginPath(); c.arc(x, y - 230, 42, 0, 7); c.fill(); c.fillRect(x - 70, y - 180, 140, 180); c.restore();
    },
    face(c, id, expr, x, y, s) {
      if (window.ART && ART.face) { try { ART.face(c, id, expr || 'normal', x, y, s); return; } catch (e) { warnOnce('face:' + id, e); } }
      c.fillStyle = charColor(id); c.fillRect(x, y, s, s); c.fillStyle = P.ink; c.fillRect(x + s * .3, y + s * .45, 2, 3); c.fillRect(x + s * .65, y + s * .45, 2, 3);
    },
    chibi(c, action, frame, x, y) {
      if (window.ART && ART.chibi) { try { ART.chibi(c, action, frame, x, y); return; } catch (e) { warnOnce('chibi:' + action, e); } }
      const b = (frame % 2) * 2;
      c.fillStyle = '#5a3a2e'; c.fillRect(x - 10, y - 38 + b, 20, 16);
      c.fillStyle = '#ffe0c8'; c.fillRect(x - 8, y - 32 + b, 16, 12);
      c.fillStyle = P.ink; c.fillRect(x - 5, y - 27 + b, 2, 3); c.fillRect(x + 3, y - 27 + b, 2, 3);
      c.fillStyle = P.pink; c.fillRect(x - 9, y - 20 + b, 18, 14); c.fillStyle = P.ink; c.fillRect(x - 7, y - 6, 5, 6); c.fillRect(x + 2, y - 6, 5, 6);
    },
    chibiFrames(a) { return (window.ART && ART.chibiFrames && ART.chibiFrames[a]) || 2; },
    icon(c, id, x, y, s) {
      if (window.ART && ART.icon) { try { ART.icon(c, id, x, y, s); return; } catch (e) { warnOnce('icon:' + id, e); } }
      if (id === 'heart') { C.bitmap(c, C.HEART, x + 1, y + 2, Math.max(1, Math.floor(s / 8)), P.pink2); return; }
      c.fillStyle = PARAM_COLOR[id] || P.lilac; c.fillRect(x + 2, y + 2, s - 4, s - 4);
    }
  };
  const thumbs = {};
  function thumb(id) {
    if (thumbs[id]) return thumbs[id];
    const big = C.makeCanvas(W, H), bx = big.getContext('2d');
    art.bg(bx, id, 0);
    const t = C.makeCanvas(128, 72), tx = t.getContext('2d');
    tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = 'high';
    tx.drawImage(big, 0, 0, 128, 72);
    thumbs[id] = t; return t;
  }

  /* ================= settings & save ================= */
  const SETKEY = 'houkago_refrain_settings', SAVEKEY = 'houkago_refrain_save';
  const settings = { bgm: 0.6, se: 0.8, text: 1 };
  function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem(SETKEY) || '{}')); } catch (e) { /* ignore */ } applySettings(); }
  function saveSettings() { try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
  function applySettings() { C.textSpeedIdx = settings.text; if (window.SND) try { SND.setVolume({ bgm: settings.bgm, se: settings.se }); } catch (e) { /* ignore */ } }
  function hasSave() { try { return !!localStorage.getItem(SAVEKEY); } catch (e) { return false; } }
  function writeSave() { try { localStorage.setItem(SAVEKEY, JSON.stringify(S)); return true; } catch (e) { return false; } }
  function readSave() { try { const s = JSON.parse(localStorage.getItem(SAVEKEY)); return s && s.params ? s : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVEKEY); } catch (e) { /* ignore */ } }

  /* ================= data helpers ================= */
  const PARAM_COLOR = { study: '#6fb3ff', sport: '#ff8a5c', art: '#b98bff', culture: '#4fcf98', style: '#ff7fb0' };
  const DEF_PARAMS = [{ id: 'study', name: '学力' }, { id: 'sport', name: '運動' }, { id: 'art', name: '芸術' }, { id: 'culture', name: '教養' }, { id: 'style', name: '容姿' }];
  const params = () => (D().params && D().params.length ? D().params : DEF_PARAMS);
  const paramName = id => (params().find(p => p.id === id) || {}).name || ({ hp: '体調', stress: 'ストレス' })[id] || id;
  const chars = () => D().chars || {};
  const FRIEND = 'friend';
  const boys = () => Object.keys(chars()).filter(k => k !== FRIEND && k !== 'me' && k !== 'player' && !chars()[k].friend);
  const PLAYER = () => (D().player && D().player.name) || (window.ART && typeof ART.player === 'string' && ART.player) || '春野 ひなた';
  const playerShort = () => { const n = PLAYER(); const a = n.split(/[ 　]/); return a[a.length - 1]; };
  function charName(id) {
    if (id === 'me' || id === 'player') return playerShort();
    const c = chars()[id]; if (!c) return typeof id === 'string' ? id : '';
    return c.short || c.name || id;
  }
  function charColor(id) {
    if (id === 'me' || id === 'player') return P.pink;
    const c = chars()[id]; return (c && c.color) || P.lilac;
  }
  function givenName(id) { const c = chars()[id]; if (!c) return id; if (c.short) return c.short; const a = (c.name || '').split(/[ 　]/); return a[a.length - 1] || c.name; }
  const TIERS = ['知り合い', '友達', '仲良し', '気になる', 'ときめき'];
  const tierIdx = a => a >= 80 ? 4 : a >= 60 ? 3 : a >= 40 ? 2 : a >= 20 ? 1 : 0;
  const tierName = a => { const t = D().tiers && D().tiers[tierIdx(a)]; return (t && (t.name || t)) || TIERS[tierIdx(a)]; };
  const commands = () => D().commands || [];
  const places = () => D().places || [];
  const placeOf = id => places().find(p => p.id === id) || { id, name: id, bg: id };
  const calendar = () => D().calendar || [];
  const WEEKS = () => calendar().length || 16;
  function calOf(w) {
    const c = calendar().find(x => x.week === w);
    if (c) return c;
    const m = 4 + Math.floor((w - 1) / 4); return { week: w, month: m, label: `${m}月 第${((w - 1) % 4) + 1}週` };
  }
  const EVENT_NAMES = { entrance: '入学式', midterm: '中間テスト', sports_day: '体育祭', tanabata: '七夕まつり', final_exam: '期末テスト', final: '期末テスト', closing: '終業式', club: '部活見学', rainy: '梅雨入り', pool: 'プール開き', golden_week: 'ゴールデンウィーク', gw: 'ゴールデンウィーク', festival: '文化祭', health: '身体測定' };
  function eventTitle(cal) {
    if (!cal || !cal.event) return '';
    const ev = D().events && D().events[cal.event];
    return cal.eventName || cal.title || (ev && typeof ev === 'object' && !Array.isArray(ev) && (ev.name || ev.title)) || EVENT_NAMES[cal.event] || (String(cal.event).startsWith('meet_') ? '' : cal.event);
  }
  function fmt(t) {
    return String(t == null ? '' : t)
      .replace(/\{name\}|\{player\}/g, playerShort()).replace(/\{fullname\}/g, PLAYER())
      .replace(/\{place\}/g, G.curPlace ? placeOf(G.curPlace).name : '')
      .replace(/\{boy\}/g, G.curBoy ? givenName(G.curBoy) : '');
  }

  /* ================= state ================= */
  let S = null;
  function newState() {
    const s = { week: 1, params: {}, hp: 100, stress: 0, aff: {}, hurt: {}, lit: {}, met: {}, metWeek: {}, lastDate: {}, dates: {}, flags: {}, calledThisWeek: false, date: null, exams: {}, sports: null, randomSeen: [], pendingWarn: [], pendingBoom: [], eventsDone: 0, name: PLAYER(), history: [], collapses: 0 };
    params().forEach(p => { s.params[p.id] = p.init != null ? p.init : C.randi(8, 13); });
    boys().forEach(id => {
      s.aff[id] = 0; s.hurt[id] = 0;
      const m = chars()[id].meet || {};
      if (m.type === 'start' || m === 'start') { s.met[id] = true; s.flags['met_' + id] = true; s.metWeek[id] = 1; s.aff[id] = chars()[id].initAff != null ? chars()[id].initAff : 22; }
    });
    return s;
  }
  const clampS = () => {
    for (const k in S.params) S.params[k] = C.clamp(Math.round(S.params[k]), 0, 200);
    S.hp = C.clamp(Math.round(S.hp), 0, 100); S.stress = C.clamp(Math.round(S.stress), 0, 100);
    for (const k in S.aff) S.aff[k] = C.clamp(Math.round(S.aff[k]), 0, 100);
    for (const k in S.hurt) S.hurt[k] = C.clamp(Math.round(S.hurt[k]), 0, 100);
  };
  function cmp(v, spec) {
    if (spec == null) return !!v;
    if (typeof spec === 'number') return v >= spec;
    if (typeof spec === 'boolean') return !!v === spec;
    let ok = true;
    if (spec.gte != null) ok = ok && v >= spec.gte;
    if (spec.gt != null) ok = ok && v > spec.gt;
    if (spec.lte != null) ok = ok && v <= spec.lte;
    if (spec.lt != null) ok = ok && v < spec.lt;
    if (spec.eq != null) ok = ok && v === spec.eq;
    return ok;
  }
  function evalCond(c) {
    if (c == null) return true;
    if (typeof c === 'function') { try { return !!c(S, G); } catch (e) { return false; } }
    if (typeof c === 'string') return !!S.flags[c];
    if (Array.isArray(c)) return c.every(evalCond);
    let ok = true;
    if (c.all) ok = ok && c.all.every(evalCond);
    if (c.any) ok = ok && c.any.some(evalCond);
    if (c.not) ok = ok && !evalCond(c.not);
    if (c.param) {
      if (typeof c.param === 'string') ok = ok && cmp(S.params[c.param] || 0, c.value != null ? { gte: c.value } : c);
      else for (const k in c.param) ok = ok && cmp(S.params[k] || 0, c.param[k]);
    }
    if (c.params) for (const k in c.params) ok = ok && cmp(S.params[k] || 0, c.params[k]);
    if (c.aff) {
      if (typeof c.aff === 'string') ok = ok && cmp(S.aff[c.aff] || 0, c.value != null ? { gte: c.value } : c);
      else for (const k in c.aff) ok = ok && cmp(S.aff[k] || 0, c.aff[k]);
    }
    if (c.hurt) for (const k in c.hurt) ok = ok && cmp(S.hurt[k] || 0, c.hurt[k]);
    if (c.flag) ok = ok && (Array.isArray(c.flag) ? c.flag.every(f => S.flags[f]) : !!S.flags[c.flag]);
    if (c.noflag || c.notFlag || c.not_flag) { const f = c.noflag || c.notFlag || c.not_flag; ok = ok && !S.flags[f]; }
    if (c.met) ok = ok && (Array.isArray(c.met) ? c.met.every(m => S.met[m]) : !!S.met[c.met]);
    if (c.notMet || c.not_met) ok = ok && !S.met[c.notMet || c.not_met];
    if (c.hp != null) ok = ok && cmp(S.hp, c.hp);
    if (c.stress != null) ok = ok && cmp(S.stress, c.stress);
    if (c.week != null) ok = ok && cmp(S.week, c.week);
    if (c.minWeek != null) ok = ok && S.week >= c.minWeek;
    if (c.weekMin != null) ok = ok && S.week >= c.weekMin;
    if (c.weekMax != null) ok = ok && S.week <= c.weekMax;
    if (c.months) ok = ok && c.months.includes(calOf(S.week).month);
    if (c.maxWeek != null) ok = ok && S.week <= c.maxWeek;
    if (c.month != null) ok = ok && cmp(calOf(S.week).month, c.month);
    if (c.sports != null) ok = ok && S.sports && cmp(S.sports.place, c.sports);
    if (c.chance != null) ok = ok && Math.random() < c.chance;
    return ok;
  }
  function applyEffect(eff, silent) {
    if (!eff) return;
    const shown = [];
    for (const k in eff) {
      const v = eff[k];
      if (typeof v !== 'number') { if (k === 'flag') S.flags[v] = true; continue; }
      if (S.aff[k] != null || boys().includes(k)) { S.aff[k] = (S.aff[k] || 0) + v; shown.push([k, v, 'aff']); if (v > 0 && S.hurt[k]) S.hurt[k] = Math.max(0, S.hurt[k] - v * 2); }
      else if (S.params[k] != null) { S.params[k] += v; shown.push([k, v, 'param']); }
      else if (k === 'hp' || k === 'stress') { S[k] += v; shown.push([k, v, 'stat']); }
      else if (k.startsWith('hurt_')) { const id = k.slice(5); S.hurt[id] = (S.hurt[id] || 0) + v; }
      else S.flags[k] = v;
    }
    clampS();
    if (!silent) shown.forEach(([k, v, kind], i) => {
      const good = kind === 'stat' && k === 'stress' ? v < 0 : v > 0;
      if (kind === 'aff') { if (v > 0) { snd.se('heart'); const a = STAGE.actors[k]; C.burst('heart', a ? a.x : W / 2, 150, 10); } else snd.se('heart_break'); }
      else C.pop(W / 2, 200 - i * 4, `${paramName(k)} ${v > 0 ? '+' : ''}${v}`, good ? P.green : P.red);
    });
  }

  /* ================= stage (bg + actors) ================= */
  const POS = { left: 170, center: 320, right: 470, farleft: 110, farright: 530, l: 170, c: 320, r: 470 };
  const STAGE = {
    bg: null, actors: {}, tint: 0, tintColor: P.night, petals: false,
    update(dt) {
      for (const k in this.actors) { const a = this.actors[k]; a.bob = Math.max(0, a.bob - dt * 4); }
      if (this.bg && /sakura|schoolgate/.test(this.bg) && Math.random() < dt * 5) C.burst('petal', C.rand(0, W + 60), -6, 1);
    },
    draw(c) {
      if (!this.bg) { c.fillStyle = P.ink; c.fillRect(0, 0, W, H); return; }
      art.bg(c, this.bg, C.time);
      const list = Object.values(this.actors).sort((a, b) => (a.speaking ? 1 : 0) - (b.speaking ? 1 : 0) || a.x - b.x);
      for (const a of list) {
        if (a.alpha <= 0.01) continue;
        const y = 364 - Math.round(Math.sin(a.bob * Math.PI) * 4) + Math.round(a.dy || 0);
        const o = { t: C.time + a.seed, alpha: a.alpha, flip: !!a.flip, blink: true };
        if (a.prev && a.xf < 1) { art.portrait(c, a.id, a.prev, Math.round(a.x), y, o); art.portrait(c, a.id, a.expr, Math.round(a.x), y, Object.assign({}, o, { alpha: a.alpha * a.xf })); }
        else art.portrait(c, a.id, a.expr, Math.round(a.x), y, o);
      }
      if (this.tint > 0) { c.globalAlpha = this.tint; c.fillStyle = this.tintColor; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    }
  };
  const StageScene = { name: 'stage', update: dt => STAGE.update(dt), draw: c => STAGE.draw(c) };
  async function setBg(id, trans) {
    if (!id) return;
    if (STAGE.bg === id && !trans) return;
    if (!STAGE.bg || trans === 'none' || G.fast) { STAGE.bg = id; return; }
    await C.transition(trans || 'fade', () => { STAGE.bg = id; }, 0.5);
  }
  async function showActor(id, expr, pos, opt = {}) {
    const x = typeof pos === 'number' ? pos : (POS[pos] || POS.center);
    let a = STAGE.actors[id];
    if (a) {
      if (expr && expr !== a.expr) setExpr(id, expr);
      if (Math.abs(a.x - x) > 1) { C.killTweens(a); await C.tween(a, { x, alpha: 1 }, 0.25, { ease: 'cubicOut' }); }
      else if (a.alpha < 1) await C.tween(a, { alpha: 1 }, 0.2);
      return;
    }
    a = STAGE.actors[id] = { id, expr: expr || 'normal', prev: null, xf: 1, x: x + (x < 320 ? -30 : 30), alpha: 0, bob: 0, seed: Math.random() * 10, dy: 0 };
    if (G.fast) { a.x = x; a.alpha = 1; return; }
    await C.tween(a, { x, alpha: 1 }, opt.dur || 0.28, { ease: 'cubicOut' });
  }
  function setExpr(id, expr) {
    const a = STAGE.actors[id]; if (!a || !expr || a.expr === expr) return;
    C.killTweens(a.xfo || {});
    a.prev = a.expr; a.expr = expr; a.xf = 0;
    const o = a.xfo = { v: 0 };
    C.tween(o, { v: 1 }, 0.22, { onUpdate: () => { a.xf = o.v; } }).then(() => { if (a.xfo === o) { a.prev = null; a.xf = 1; } });
  }
  async function hideActor(id) {
    const ids = id === 'all' || id === true ? Object.keys(STAGE.actors) : [id];
    await Promise.all(ids.map(async k => {
      const a = STAGE.actors[k]; if (!a) return;
      C.killTweens(a);
      if (!G.fast) await C.tween(a, { alpha: 0, x: a.x + (a.x < 320 ? -20 : 20) }, 0.22, { ease: 'quadIn' });
      if (STAGE.actors[k] === a) delete STAGE.actors[k];
    }));
  }
  function clearActors() { STAGE.actors = {}; }

  /* ================= message window ================= */
  const MSG = { alpha: 0, target: 0, who: null, name: '', color: P.pink, tw: null, auto: false, skip: false, btns: [] };
  const MSGB = { x: 10, y: 262, w: 620, h: 92 };
  const pillRects = () => [{ id: 'log', x: 470, y: 247 }, { id: 'auto', x: 522, y: 247 }, { id: 'skip', x: 574, y: 247 }].map(r => Object.assign(r, { w: 48, h: 16 }));
  function drawMsg(c) {
    MSG.alpha += (MSG.target - MSG.alpha) * 0.4;
    if (MSG.alpha < 0.02 || !MSG.tw) return;
    const a = MSG.alpha, oy = Math.round((1 - a) * 16);
    c.globalAlpha = a;
    const { x, w, h } = MSGB, y = MSGB.y + oy;
    UI.frame(c, x, y, w, h, { fill: 'rgba(255,246,224,0.96)', dots: 'rgba(255,143,177,0.18)' });
    c.fillStyle = MSG.color; c.fillRect(x + 4, y + 4, 3, h - 8);
    if (MSG.name) {
      const nw = Math.max(70, C.measure(c, MSG.name, 16) + 26);
      UI.frame(c, x + 14, y - 16, nw, 24, { fill: MSG.color, depth: 2 });
      C.text(c, MSG.name, x + 14 + nw / 2, y - 12, { size: 16, align: 'center', color: P.white, outline: P.ink });
    }
    MSG.tw.draw(c, x + 22, y + 14, 23, MSG.who == null ? P.ink2 : P.ink);
    if (MSG.tw.done && MSG.waiting) {
      const b = Math.round(Math.abs(Math.sin(C.time * 5)) * 3);
      c.fillStyle = P.pink2; const tx = x + w - 22, ty = y + h - 16 + b;
      c.fillRect(tx, ty, 9, 2); c.fillRect(tx + 1, ty + 2, 7, 2); c.fillRect(tx + 3, ty + 4, 3, 2);
    }
    if (MSG.waiting) for (const r of pillRects()) {
      const on = MSG[r.id] === true;
      c.fillStyle = P.ink; c.fillRect(r.x, r.y + oy, r.w, r.h);
      c.fillStyle = on ? P.pink2 : P.cream; c.fillRect(r.x + 1, r.y + 1 + oy, r.w - 2, r.h - 2);
      C.text(c, r.id.toUpperCase(), r.x + r.w / 2, r.y + 2 + oy, { size: 12, align: 'center', color: on ? P.white : P.ink });
    }
    c.globalAlpha = 1;
  }
  function msgHide() { MSG.target = 0; }
  class SayWait {
    constructor() { this.name = 'say'; this.t = 0; }
    update(dt, active) {
      const tw = MSG.tw; this.t += dt;
      const skipping = G.fast || MSG.skip || inp.held.has('skip');
      tw.update(dt, skipping || inp.holding);
      if (skipping) { tw.complete(); if (this.t > (G.fast ? 0.02 : 0.07)) return this.close(); }
      if (!active) return;
      if (inp.pressed && !inp.consumed) {
        const r = pillRects().find(r => inp.x >= r.x && inp.x < r.x + r.w && inp.y >= r.y - 2 && inp.y < r.y + r.h + 2);
        if (r) { inp.consume(); snd.se('cursor'); if (r.id === 'log') openLog(); else { MSG[r.id] = !MSG[r.id]; if (r.id === 'auto') MSG.skip = false; if (r.id === 'skip') MSG.auto = false; } return; }
      }
      if (inp.key('auto')) { MSG.auto = !MSG.auto; inp.consume(); snd.se('cursor'); }
      if (inp.key('log')) { inp.consume(); openLog(); return; }
      if (inp.advance()) {
        inp.consume();
        if (!tw.done) tw.complete();
        else { snd.se('page'); return this.close(); }
      }
      if (MSG.auto && tw.done && tw.idle > 1.0 + tw.total * 0.035) this.close();
    }
  }
  async function say(who, text, opt = {}) {
    if (who === 'narration' || who === 'nar' || who === '') who = null;
    text = fmt(text);
    MSG.who = who; MSG.name = who ? (opt.name || charName(who)) : ''; MSG.color = who ? charColor(who) : P.ink2;
    MSG.tw = new C.Typewriter(text, 584, 16, () => { if (!MSG.skip && !G.fast) snd.se('type'); });
    MSG.target = 1; MSG.waiting = true;
    G.log.push({ name: MSG.name, text, color: MSG.color }); if (G.log.length > 80) G.log.shift();
    for (const k in STAGE.actors) STAGE.actors[k].speaking = k === who;
    if (who && STAGE.actors[who]) STAGE.actors[who].bob = 1;
    const prev = G.phase; G.phase = 'say';
    await C.run(new SayWait());
    MSG.waiting = false; G.phase = prev;
  }
  /* backlog */
  class LogScene {
    constructor() { this.name = 'log'; this.scroll = 0; }
    update(dt, active) {
      if (!active) return;
      const lines = this.lines || [];
      if (inp.key('up')) { this.scroll = Math.min(this.scroll + 1, Math.max(0, lines.length - 12)); inp.consume(); }
      else if (inp.key('down')) { this.scroll = Math.max(0, this.scroll - 1); inp.consume(); }
      else if (inp.key('cancel') || inp.key('log') || inp.key('ok') || inp.click()) {
        if (inp.pressed && inp.x > 590 && inp.y < 180 && inp.y > 40) { this.scroll = Math.min(this.scroll + 3, Math.max(0, lines.length - 12)); inp.consume(); return; }
        if (inp.pressed && inp.x > 590 && inp.y >= 180) { this.scroll = Math.max(0, this.scroll - 3); inp.consume(); return; }
        inp.consume(); snd.se('cancel'); this.close();
      }
    }
    draw(c) {
      c.fillStyle = 'rgba(27,28,58,0.88)'; c.fillRect(0, 0, W, H);
      UI.frame(c, 20, 14, 600, 332, { fill: P.cream, band: P.lilac, bandH: 22 });
      C.text(c, 'バックログ', 36, 18, { size: 16, color: P.white, outline: P.ink });
      C.text(c, 'クリックで とじる', 604, 20, { size: 12, align: 'right', color: P.ink });
      const lines = [];
      for (const l of G.log) { const w = C.wrap(c, l.text, 440, 12); w.forEach((s, i) => lines.push({ name: i === 0 ? l.name : '', s, color: l.color })); }
      this.lines = lines;
      const start = Math.max(0, lines.length - 19 - this.scroll);
      lines.slice(start, start + 19).forEach((l, i) => {
        if (l.name) C.text(c, l.name, 40, 44 + i * 15, { size: 12, color: l.color, outline: P.ink });
        C.text(c, l.s, 150, 44 + i * 15, { size: 12 });
      });
      C.text(c, '▲', 606, 60, { size: 12, align: 'center' }); C.text(c, '▼', 606, 320, { size: 12, align: 'center' });
    }
  }
  function openLog() { C.run(new LogScene()); }

  /* ================= choice ================= */
  class ChoiceScene {
    constructor(opts, o = {}) {
      this.name = 'choice'; this.t = 0;
      const n = opts.length, bh = 30, gap = 8, total = n * bh + (n - 1) * gap;
      const top = o.top != null ? o.top : Math.max(24, 140 - total / 2);
      const bw = o.width || 380;
      this.btns = opts.map((op, i) => new UI.Button({
        x: (W - bw) / 2, y: top + i * (bh + gap), w: bw, h: bh, label: fmt(op.text || op), size: 16,
        color: P.cream, hoverColor: P.pinkL, enabled: op.enabled !== false,
        onClick: () => { if (this.done) return; this.done = true; snd.se('decide'); this.pick(i); }
      }));
      this.btns.forEach((b, i) => { b.appear = 0; C.tween(b, { appear: 1 }, 0.25, { delay: i * 0.05, ease: 'backOut' }); });
      this.group = new UI.Group(this.btns);
    }
    async pick(i) { const b = this.btns[i]; b.bounce = 1; for (let k = 0; k < 6; k++) { await C.wait(0.03); b.visibleBlink = k % 2; } this.close(i); }
    update(dt, active) { this.t += dt; this.group.update(dt, active && this.t > 0.15 && !this.done); }
    draw(c) {
      c.fillStyle = `rgba(27,28,58,${0.25 * Math.min(1, this.t * 4)})`; c.fillRect(0, 0, W, 258);
      for (const b of this.btns) {
        if (b.visibleBlink) continue;
        c.save(); const s = b.appear; c.globalAlpha = Math.min(1, s * 1.5);
        c.translate(Math.round((1 - s) * 30), 0); b.draw(c); c.restore();
      }
    }
  }
  async function choose(opts, o) { const prev = G.phase; G.phase = 'choice'; const r = await C.run(new ChoiceScene(opts, o)); G.phase = prev; return r; }

  /* ================= script runner ================= */
  function resolveSteps(ref) {
    if (!ref) return null;
    if (Array.isArray(ref)) return ref;
    if (typeof ref === 'string') { const s = D().scenes && D().scenes[ref]; return Array.isArray(s) ? s : (s && s.steps) || null; }
    if (typeof ref === 'object') return ref.steps || resolveSteps(ref.scene) || null;
    return null;
  }
  async function runScript(ref, depth = 0) {
    const steps = resolveSteps(ref);
    if (!steps || depth > 8) return;
    const labels = {};
    steps.forEach((s, i) => { if (s && s.label != null) labels[s.label] = i; });
    let pc = 0, guard = 0;
    while (pc < steps.length && guard++ < 4000) {
      const s = steps[pc++];
      if (!s || typeof s !== 'object') continue;
      const jump = await execStep(s, depth);
      if (jump === '__end') return '__end';
      if (jump != null) {
        if (labels[jump] != null) pc = labels[jump] + 1;
        else if (resolveSteps(jump)) { return runScript(jump, depth + 1); }
        else return;
      }
    }
  }
  async function execStep(s, depth) {
    if (s.goto != null) return s.goto;
    if (s.end) return '__end';
    if (s.bgm !== undefined) snd.bgm(s.bgm);
    if (s.stopBgm) snd.stop(s.stopBgm === true ? 0.6 : s.stopBgm);
    if (s.bg) await setBg(s.bg, s.trans || s.transition);
    if (s.se) snd.se(s.se);
    if (s.hide !== undefined && s.hide !== null) await hideActor(s.hide);
    if (s.show) await showActor(s.show, s.expr, s.pos || s.at || 'center');
    else if (s.expr && !('say' in s)) setExpr(s.expr, s.to || s.face || 'normal');
    if (s.meet) await meet(s.meet);
    if (s.set) doSet(s.set);
    if (s.effect) applyEffect(s.effect);
    if (s.aff) applyEffect(s.aff);
    if (s.fx) await doFx(s.fx, s);
    if (s.wait != null) await C.wait(G.fast ? 0.01 : s.wait);
    if ('say' in s || (s.text != null && !s.choice)) {
      const who = s.say === undefined ? null : s.say;
      if (who && s.expr && STAGE.actors[who]) setExpr(who, s.expr);
      if (who && s.show === undefined && s.expr && !STAGE.actors[who] && boys().concat([FRIEND]).includes(who)) await showActor(who, s.expr, s.pos || 'center');
      const txt = Array.isArray(s.text) ? s.text : [s.text];
      for (const t of txt) await say(who, t, { name: s.name });
    }
    if (s.choice) {
      const opts = s.choice.filter(o => !o.if || evalCond(o.if));
      const i = await choose(opts.map(o => ({ text: o.text })));
      const o = opts[i];
      if (o.effect) applyEffect(o.effect);
      if (o.set) doSet(o.set);
      if (o.reply) await say(o.by || G.curBoy || null, o.reply);
      if (o.steps) { const r = await runScript(o.steps, depth + 1); if (r === '__end') return r; }
      if (o.next != null) return o.next;
      if (o.goto != null) return o.goto;
    }
    if (s.if) {
      const r = evalCond(s.if) ? s.then : s.else;
      if (Array.isArray(r)) { const x = await runScript(r, depth + 1); if (x === '__end') return x; }
      else if (r != null) return r;
    }
    if (s.call || s.run) await runScript(s.call || s.run, depth + 1);
    return null;
  }
  function doSet(v) {
    if (typeof v === 'string') { S.flags[v] = true; return; }
    if (Array.isArray(v)) { v.forEach(doSet); return; }
    for (const k in v) {
      const x = v[k];
      if (k === 'flag') { (Array.isArray(x) ? x : [x]).forEach(f => { S.flags[f] = true; }); }
      else if (k === 'unflag') { (Array.isArray(x) ? x : [x]).forEach(f => { delete S.flags[f]; }); }
      else if (k === 'flags') Object.assign(S.flags, x);
      else if (k === 'aff' || k === 'param' || k === 'params') applyEffect(x);
      else if ((k === 'hp' || k === 'stress') && typeof x === 'number') applyEffect({ [k]: x });
      else if (k === 'hurt' && typeof x === 'object') for (const id in x) S.hurt[id] = C.clamp((S.hurt[id] || 0) + x[id], 0, 100);
      else S.flags[k] = x;
    }
    clampS();
  }
  async function doFx(f, s) {
    const list = Array.isArray(f) ? f : [f];
    for (const k of list) {
      const who = s && (s.say || s.show || s.target), a = who && STAGE.actors[who];
      const cx = a ? a.x : W / 2;
      if (k === 'flash') { C.flash('#fff', 0.4); snd.se('flash'); }
      else if (k === 'shake') { C.shake(6, 0.35); }
      else if (k === 'heart') { C.burst('heart', cx, 150, 16, { w: 40, h: 20 }); snd.se('heart'); }
      else if (k === 'sparkle') { C.burst('sparkle', cx, 140, 22, { w: 60, h: 40 }); snd.se('sparkle'); }
      else if (k === 'confetti') { C.burst('confetti', W / 2, 40, 60, { w: 300 }); }
      else if (k === 'petals') { for (let i = 0; i < 30; i++) C.burst('petal', C.rand(0, W), C.rand(-40, 0), 1); }
      else if (k === 'fadeblack' || k === 'fadewhite') { if (!G.fast) { await C.cover('fade', 0.35, k === 'fadewhite' ? '#fff' : '#101024'); await C.wait(0.2); await C.uncover(0.35); } }
      else if (k === 'dark' || k === 'night') { STAGE.tint = 0.35; }
      else if (k === 'clear') { STAGE.tint = 0; }
    }
  }
  async function meet(id) {
    if (!chars()[id] || S.met[id]) { S.met[id] = true; S.flags['met_' + id] = true; return; }
    S.met[id] = true; S.metWeek[id] = S.week; S.lastDate[id] = S.week; S.flags['met_' + id] = true;
    if (!S.aff[id]) S.aff[id] = chars()[id].initAff != null ? chars()[id].initAff : 8;
    snd.se('sparkle');
    C.toast(`${charName(id)} と 知り合った`, { icon: 'heart', color: P.pinkL });
  }

  /* ================= common drawing ================= */
  function popBg(c, col1, col2, t) {
    c.fillStyle = col1; c.fillRect(0, 0, W, H);
    c.fillStyle = col2; const o = Math.floor((t * 12) % 32);
    for (let x = -64 + o; x < W + 64; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 16, 0); c.lineTo(x + 16 - 90, H); c.lineTo(x - 90, H); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 8; y < H; y += 24) for (let x = ((y / 24) & 1) * 12 + 6; x < W; x += 24) c.fillRect(x, y, 2, 2);
  }
  function panel(c, x, y, w, h, title, band) {
    UI.frame(c, x, y, w, h, { fill: P.cream, band: band || P.pink, bandH: 16 });
    if (title) C.text(c, title, x + 8, y + 2, { size: 12, color: P.white, outline: P.ink });
  }
  function hearts(c, x, y, n, of = 5, s = 1) {
    for (let i = 0; i < of; i++) {
      C.bitmap(c, C.HEART, x + i * 9 * s, y + 1, s, P.ink);
      C.bitmap(c, C.HEART, x + i * 9 * s, y, s, i < n ? P.pink2 : '#e3d6bd');
    }
  }
  function statBars(c, x, y, w, gHp, gSt) {
    art.icon(c, 'health', x, y, 16); C.text(c, '体調', x + 18, y + 2, { size: 12 });
    gHp.draw(c, x + 52, y + 5, w - 80, 7); C.text(c, String(Math.round(gHp.value)), x + w - 2, y + 2, { size: 12, align: 'right' });
    art.icon(c, 'stress', x, y + 20, 16); C.text(c, 'ストレス', x + 18, y + 22, { size: 12 });
    gSt.draw(c, x + 72, y + 25, w - 100, 7); C.text(c, String(Math.round(gSt.value)), x + w - 2, y + 22, { size: 12, align: 'right' });
  }
  function drawStamp(c, text, x, y, color, scale, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || -0.18); c.scale(scale, scale);
    c.font = C.font(22, true); const w = c.measureText(text).width + 20;
    c.globalAlpha = Math.min(1, scale < 1.2 ? 1 : 2.5 - scale);
    c.fillStyle = color; c.fillRect(-w / 2 - 3, -17, w + 6, 34);
    c.fillStyle = '#fff'; c.fillRect(-w / 2, -14, w, 28);
    c.fillStyle = color; c.fillRect(-w / 2 + 2, -12, w - 4, 24);
    C.text(c, text, 0, -13, { size: 22, head: true, align: 'center', color: '#fff' });
    c.restore();
  }
  function scaled(c, s, x, y, fn) { c.save(); c.translate(x, y); c.scale(s, s); fn(); c.restore(); }

  /* ================= title ================= */
  class TitleScene {
    constructor() {
      this.name = 'title'; this.t = 0; this.letters = Array.from('放課後リフレイン').map((ch, i) => ({ ch, y: -60, a: 0, i }));
      this.letters.forEach((l, i) => C.tween(l, { y: 0, a: 1 }, 0.6, { delay: 0.25 + i * 0.07, ease: 'bounceOut' }));
      this.sub = { a: 0 }; C.tween(this.sub, { a: 1 }, 0.5, { delay: 1.0 });
      const cont = hasSave();
      const mk = (label, y, fn, en = true) => new UI.Button({ x: 250, y, w: 140, h: 28, label, enabled: en, onClick: fn, color: P.cream, hoverColor: P.pinkL });
      this.btns = [
        mk('はじめから', 238, () => this.go('new')),
        mk('つづきから', 272, () => this.go('continue'), cont),
        mk('設定', 306, () => { snd.se('decide'); openSettings(); })
      ];
      this.group = new UI.Group(this.btns);
      if (cont) this.group.setFocus(this.btns[1], true);
      this.bin = 0;
    }
    go(v) { if (this.done) return; this.done = true; snd.se('decide'); this.close(v); }
    update(dt, active) {
      this.t += dt;
      if (Math.random() < dt * 6) C.burst('petal', C.rand(0, W + 80), -8, 1);
      this.bin = Math.min(1, Math.max(0, (this.t - 1.1) / 0.4));
      this.group.update(dt, active && this.t > 0.6 && !this.done);
      if (active && this.t < 1.2 && inp.click()) { this.t = 1.2; this.letters.forEach(l => { C.killTweens(l); l.y = 0; l.a = 1; }); this.sub.a = 1; }
    }
    draw(c) {
      art.bg(c, 'title', this.t);
      c.fillStyle = 'rgba(255,246,224,0.18)'; c.fillRect(0, 0, W, H);
      const cx = W / 2; let x0 = cx - 150;
      c.font = C.font(44, true);
      const widths = this.letters.map(l => c.measureText(l.ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + 4 * (widths.length - 1);
      x0 = cx - total / 2;
      let x = x0;
      this.letters.forEach((l, i) => {
        const wob = Math.round(Math.sin(this.t * 2.2 + i * 0.6) * 2);
        c.globalAlpha = l.a;
        const col = i < 3 ? P.pink2 : P.sky2;
        C.text(c, l.ch, x + 3, 74 + l.y + wob + 3, { size: 44, head: true, color: P.ink });
        C.text(c, l.ch, x, 74 + l.y + wob, { size: 44, head: true, color: col, outline: P.white, ow: 3 });
        x += widths[i] + 4;
      });
      c.globalAlpha = this.sub.a;
      UI.frame(c, cx - 110, 142, 220, 26, { fill: P.lemon, depth: 2 });
      C.text(c, '1学期 体験版 ～4月から7月まで～', cx, 147, { size: 12, align: 'center' });
      C.text(c, 'Afterschool Refrain', cx, 176, { size: 12, align: 'center', color: P.ink, outline: P.white });
      c.globalAlpha = 1;
      /* sparkle glints on logo */
      if (this.t > 1.2 && Math.random() < 0.08) C.burst('sparkle', C.rand(x0, x), C.rand(70, 120), 1, { min: 0, max: 10 });
      c.save(); c.globalAlpha = this.bin; c.translate(0, Math.round((1 - this.bin) * 20));
      this.group.draw(c); c.restore();
      C.text(c, '© 放課後リフレイン製作委員会ごっこ', W - 8, H - 14, { size: 12, align: 'right', color: P.white, outline: P.ink, alpha: 0.9 });
    }
  }

  /* settings */
  class SettingsScene {
    constructor() {
      this.name = 'settings'; this.t = 0;
      const rows = [
        { key: 'bgm', label: 'BGM 音量' }, { key: 'se', label: 'SE 音量' }, { key: 'text', label: '文字の速さ' }
      ];
      this.rows = rows;
      const btns = [];
      rows.forEach((r, i) => {
        const y = 110 + i * 44;
        btns.push(new UI.Button({ x: 300, y, w: 30, h: 26, label: '−', onClick: () => this.adj(r.key, -1) }));
        btns.push(new UI.Button({ x: 472, y, w: 30, h: 26, label: '+', onClick: () => this.adj(r.key, 1) }));
      });
      btns.push(new UI.Button({ x: 260, y: 252, w: 120, h: 28, label: 'とじる', color: P.mintL, hoverColor: P.mint, onClick: () => { snd.se('cancel'); saveSettings(); this.close(); } }));
      this.group = new UI.Group(btns, { onCancel: () => { snd.se('cancel'); saveSettings(); this.close(); } });
      this.btns = btns;
    }
    adj(k, d) {
      if (k === 'text') settings.text = C.clamp(settings.text + d, 0, 3);
      else settings[k] = Math.round(C.clamp(settings[k] + d * 0.1, 0, 1) * 10) / 10;
      applySettings(); snd.se(k === 'bgm' ? 'cursor' : 'pop_up');
    }
    update(dt, active) { this.t += dt; this.group.update(dt, active); }
    draw(c) {
      c.fillStyle = `rgba(27,28,58,${Math.min(0.6, this.t * 3)})`; c.fillRect(0, 0, W, H);
      const s = C.ease.backOut(Math.min(1, this.t * 5));
      c.save(); c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-W / 2, -H / 2);
      UI.frame(c, 120, 60, 400, 236, { fill: P.cream, band: P.mint, bandH: 24, dots: 'rgba(127,224,196,0.25)' });
      C.text(c, '設定', 136, 64, { size: 16, color: P.white, outline: P.ink });
      art.icon(c, 'gear', 492, 64, 16);
      const SPD = ['おそい', 'ふつう', 'はやい', '一瞬'];
      this.rows.forEach((r, i) => {
        const y = 110 + i * 44;
        C.text(c, r.label, 140, y + 5, { size: 16 });
        if (r.key === 'text') {
          UI.frame(c, 338, y, 128, 26, { fill: P.white, depth: 1 });
          C.text(c, SPD[settings.text], 402, y + 5, { size: 16, align: 'center' });
        } else {
          for (let k = 0; k < 10; k++) { c.fillStyle = P.ink; c.fillRect(340 + k * 13, y + 4, 11, 18); c.fillStyle = k < Math.round(settings[r.key] * 10) ? (r.key === 'bgm' ? P.pink : P.sky2) : '#e9dcc0'; c.fillRect(341 + k * 13, y + 5, 9, 16); }
        }
      });
      this.group.draw(c);
      c.restore();
    }
  }
  function openSettings() { return C.run(new SettingsScene()); }

  /* ================= week card ================= */
  class WeekCard {
    constructor(cal) { this.name = 'weekcard'; this.cal = cal; this.t = 0; this.k = { a: 0, x: -W }; C.tween(this.k, { x: 0 }, 0.35, { ease: 'backOut' }); this.dur = 1.1; snd.se('week'); }
    update(dt, active) {
      this.t += dt;
      if (active && inp.advance() && this.t > 0.3) { inp.consume(); this.dur = Math.min(this.dur, this.t + 0.2); }
      if (this.t >= this.dur && !this.closing) { this.closing = true; C.tween(this.k, { x: W }, 0.25, { ease: 'backIn' }).then(() => this.close()); }
    }
    draw(c) {
      popBg(c, P.pinkL, '#ffc4d6', this.t);
      c.save(); c.translate(Math.round(this.k.x), 0);
      UI.frame(c, 180, 90, 280, 170, { fill: P.cream, band: P.pink2, bandH: 30 });
      c.fillStyle = P.ink; for (let i = 0; i < 6; i++) { c.fillRect(206 + i * 42, 84, 6, 14); }
      C.text(c, `${this.cal.month}月`, 320, 92, { size: 22, head: true, align: 'center', color: P.white, outline: P.ink });
      const wk = this.cal.label ? this.cal.label.replace(/^\d+月\s*/, '') : `第${this.cal.week}週`;
      C.text(c, wk, 320, 140, { size: 44, head: true, align: 'center', color: P.pink2, outline: P.white, ow: 2 });
      const ev = eventTitle(this.cal);
      C.text(c, ev ? `今週: ${ev}` : this.cal.note ? this.cal.note : `あと ${WEEKS() - this.cal.week + 1} 週で 夏休み`, 320, 212, { size: 16, align: 'center', color: P.ink2 });
      c.restore();
    }
  }

  /* ================= main week menu ================= */
  const CMD_ICON = { study: 'study', sport: 'sport', art: 'art', culture: 'culture', style: 'style', rest: 'rest', play: 'play' };
  class MenuScene {
    constructor() {
      this.name = 'menu'; this.t = 0;
      this.pg = {}; params().forEach(p => { this.pg[p.id] = new UI.Gauge(S.params[p.id], 200, PARAM_COLOR[p.id] || P.lilac); });
      this.ghp = new UI.Gauge(S.hp, 100, P.green); this.gst = new UI.Gauge(S.stress, 100, P.red);
      const cmds = commands();
      const bw = 106, bh = 34;
      this.btns = cmds.map((cm, i) => {
        const col = i % 4, row = Math.floor(i / 4);
        return new UI.Button({ x: 166 + col * (bw + 5), y: 166 + row * (bh + 6), w: bw, h: bh, label: cm.name, icon: CMD_ICON[cm.id] || cm.icon || cm.id, iconSize: 16, desc: cm.desc, cmd: cm, color: P.cream, hoverColor: P.mintL, onClick: b => this.pick(b.cmd) });
      });
      this.gear = new UI.Button({ x: 166 + 3 * 111, y: 206, w: 106, h: 34, icon: 'gear', label: '設定', onClick: () => { snd.se('decide'); openSettings(); }, desc: '音量と 文字の速さを 変える', cmd: null, color: P.cream, hoverColor: P.lemon });
      this.btns.push(this.gear);
      this.group = new UI.Group(this.btns);
      this.group.onFocus = b => { this.hl = b; this.hlT = 0; };
      this.hl = this.btns[0]; this.hlT = 0;
      this.enterK = { v: 0 }; C.tween(this.enterK, { v: 1 }, 0.4, { ease: 'backOut' });
    }
    pick(cmd) { if (this.done) return; this.done = true; snd.se('decide'); this.close(cmd); }
    update(dt, active) {
      this.t += dt; this.hlT += dt;
      for (const k in this.pg) this.pg[k].update(dt); this.ghp.update(dt); this.gst.update(dt);
      this.group.update(dt, active && !this.done && this.t > 0.2);
    }
    draw(c) {
      const t = this.t, e = this.enterK.v;
      popBg(c, '#fff0f5', '#ffe3ec', t);
      const cal = calOf(S.week);
      /* calendar */
      c.save(); c.translate(0, Math.round((1 - e) * -40));
      UI.frame(c, 10, 10, 140, 96, { fill: P.cream, band: P.pink2, bandH: 22 });
      c.fillStyle = P.ink; c.fillRect(30, 6, 4, 10); c.fillRect(126, 6, 4, 10);
      C.text(c, `${cal.month}月`, 80, 12, { size: 16, align: 'center', color: P.white, outline: P.ink, head: true });
      const wk = cal.label ? cal.label.replace(/^\d+月\s*/, '') : `第${S.week}週`;
      C.text(c, wk, 80, 36, { size: 22, head: true, align: 'center', color: P.pink2 });
      const nx = nextEvent();
      C.text(c, nx ? `次: ${nx.name}` : '次: 夏休み', 80, 66, { size: 12, align: 'center' });
      C.text(c, nx ? (nx.in === 0 ? '今週！' : `あと ${nx.in} 週`) : `あと ${WEEKS() - S.week + 1} 週`, 80, 82, { size: 12, align: 'center', color: P.pink2 });
      c.restore();
      /* player */
      c.save(); c.translate(Math.round((1 - e) * -60), 0);
      panel(c, 10, 112, 140, 140, PLAYER(), P.sky2);
      c.fillStyle = '#e8f4ff'; c.fillRect(16, 132, 128, 58);
      c.fillStyle = '#cfe6ff'; c.fillRect(16, 176, 128, 14);
      const ch = S.hp < 30 ? 'sick' : S.stress > 70 ? 'fail' : 'walk';
      scaled(c, 1, 80, 188, () => art.chibi(c, ch, Math.floor(t * 5) % art.chibiFrames(ch), 0, 0));
      statBars(c, 16, 196, 128, this.ghp, this.gst);
      c.restore();
      /* params */
      c.save(); c.translate(0, Math.round((1 - e) * -40));
      panel(c, 158, 10, 236, 128, 'パラメータ', P.mint2);
      params().forEach((p, i) => {
        const y = 30 + i * 21;
        art.icon(c, p.id, 166, y, 16);
        C.text(c, p.name, 186, y + 2, { size: 12 });
        this.pg[p.id].draw(c, 222, y + 5, 124, 8);
        C.text(c, String(S.params[p.id]), 386, y + 2, { size: 12, align: 'right' });
      });
      c.restore();
      /* boys */
      c.save(); c.translate(Math.round((1 - e) * 60), 0);
      panel(c, 402, 10, 228, 128, 'ときめき', P.pink2);
      boys().forEach((id, i) => {
        const y = 32 + i * 26;
        if (!S.met[id]) {
          c.fillStyle = '#d8ccb2'; c.fillRect(410, y, 24, 24); C.text(c, '?', 422, y + 5, { size: 16, align: 'center', color: P.white });
          C.text(c, '？？？', 442, y + 6, { size: 12, color: P.grey });
          return;
        }
        c.fillStyle = P.ink; c.fillRect(409, y - 1, 26, 26);
        art.face(c, id, S.lit[id] ? 'sad' : tierIdx(S.aff[id]) >= 3 ? 'smile' : 'normal', 410, y, 24);
        C.text(c, givenName(id), 442, y - 1, { size: 12 });
        C.text(c, tierName(S.aff[id]), 442, y + 12, { size: 12, color: P.pink2 });
        hearts(c, 530, y + 7, tierIdx(S.aff[id]) + 1);
        if (S.lit[id]) {
          const fl = Math.sin(t * 14) > 0;
          art.icon(c, fl ? 'bomb_lit' : 'bomb', 606, y + 4, 16);
        }
      });
      c.restore();
      /* commands */
      c.save(); c.translate(0, Math.round((1 - e) * 60));
      panel(c, 158, 144, 472, 106, '今週の行動を えらぶ', P.lilac2);
      this.group.draw(c);
      /* desc */
      const b = this.hl || this.btns[0];
      UI.frame(c, 10, 258, 620, 94, { fill: P.cream, dots: 'rgba(199,168,255,0.25)' });
      if (b) {
        const cm = b.cmd;
        if (cm) {
          art.icon(c, CMD_ICON[cm.id] || cm.id, 22, 268, 16);
          C.text(c, cm.name, 44, 268, { size: 16, color: P.lilac2 });
          const lines = C.wrap(c, cm.desc || '', 360, 12);
          lines.slice(0, 3).forEach((l, i) => C.text(c, l, 22, 292 + i * 16, { size: 12 }));
          let cx = 400; let cy = 268;
          const chips = [];
          for (const k in (cm.gain || {})) chips.push([paramName(k), cm.gain[k], k === 'stress' ? cm.gain[k] < 0 : cm.gain[k] > 0]);
          for (const k in (cm.cost || {})) chips.push([paramName(k), cm.cost[k], k === 'stress' ? cm.cost[k] < 0 : cm.cost[k] > 0]);
          for (const [n, v, good] of chips) {
            if (!v) continue;
            const label = `${n}${v > 0 ? '↑' : '↓'}${Math.abs(v) >= 6 ? (v > 0 ? '↑' : '↓') : ''}`;
            const w = C.measure(c, label, 12) + 12;
            if (cx + w > 624) { cx = 400; cy += 20; }
            c.fillStyle = P.ink; c.fillRect(cx, cy, w, 16); c.fillStyle = good ? P.mintL : '#ffd6da'; c.fillRect(cx + 1, cy + 1, w - 2, 14);
            C.text(c, label, cx + 6, cy + 2, { size: 12, color: good ? P.mint2 : P.pink2 });
            cx += w + 4;
          }
          const warn = S.hp < 35 ? '体調が 悪い。無理は 禁物…' : S.stress > 70 ? 'ストレスが たまっている。失敗しやすい' : '';
          if (warn) C.text(c, warn, 400, 330, { size: 12, color: P.red });
        } else {
          C.text(c, '設定', 44, 268, { size: 16, color: P.lilac2 }); C.text(c, b.desc, 22, 292, { size: 12 });
        }
      }
      c.restore();
    }
  }
  function nextEvent() {
    for (let w = S.week; w <= WEEKS(); w++) {
      const c = calOf(w); const n = eventTitle(c);
      if (n && c.event && !String(c.event).startsWith('meet_') && !(w === S.week && S.eventsDone >= S.week)) return { name: n, in: w - S.week };
      if (n && w > S.week) return { name: n, in: w - S.week };
    }
    return null;
  }

  /* ================= weekday execution ================= */
  const DAYS = ['月', '火', '水', '木', '金'];
  function rollDay(cmd) {
    const restLike = cmd.id === 'rest' || cmd.id === 'play' || cmd.kind === 'rest';
    if (restLike) return Math.random() < 0.25 ? 'great' : 'ok';
    let fail = 0.08 + Math.max(0, S.stress - 45) / 140 + Math.max(0, 50 - S.hp) / 110;
    if (S.stress > 80) fail += 0.3;
    if (S.hp < 25) fail += 0.2;
    fail = C.clamp(fail, 0.04, 0.8);
    const great = C.clamp(0.16 + (S.hp - 60) / 400 - S.stress / 500, 0.05, 0.3);
    const r = Math.random();
    return r < fail ? 'fail' : r < fail + great ? 'great' : 'ok';
  }
  const GAIN_DAY = 0.34, COST_DAY = 0.3;
  class ExecScene {
    constructor(cmd) {
      this.name = 'exec'; this.cmd = cmd; this.t = 0; this.day = -1; this.panels = DAYS.map((d, i) => ({ d, i, k: 0, res: null, stampK: 0, frameT: 0, gains: [] }));
      this.total = {}; this.hp0 = S.hp; this.st0 = S.stress; this.p0 = Object.assign({}, S.params);
      this.ghp = new UI.Gauge(S.hp, 100, P.green); this.gst = new UI.Gauge(S.stress, 100, P.red);
      this.summary = null; this.speed = 1;
    }
    async run() {
      const cmd = this.cmd, acc = {};
      snd.bgm('daily');
      for (let i = 0; i < 5; i++) {
        this.day = i; const p = this.panels[i];
        snd.se('cursor');
        await this.w(C.tween(p, { k: 1 }, 0.22, { ease: 'backOut' }));
        await this.sleep(0.45);
        const r = rollDay(cmd); p.res = r;
        const mult = r === 'great' ? 1.8 : r === 'fail' ? 0.3 : 1;
        const gains = [];
        const addG = (k, raw) => { acc[k] = (acc[k] || 0) + raw; const v = Math.trunc(acc[k]); acc[k] -= v; if (v) gains.push([k, v]); };
        for (const k in (cmd.gain || {})) addG(k, cmd.gain[k] * GAIN_DAY * (cmd.gain[k] > 0 ? mult : 1) + (cmd.gain[k] > 0 && r !== 'fail' ? Math.random() * 0.3 : 0));
        for (const k in (cmd.loss || {})) addG(k, cmd.loss[k] * GAIN_DAY);
        for (const k in (cmd.cost || {})) addG(k, cmd.cost[k] * COST_DAY * (r === 'fail' && k === 'stress' && cmd.cost[k] > 0 ? 1.6 : 1) * (r === 'great' && k === 'stress' && cmd.cost[k] < 0 ? 1.4 : 1));
        if (!cmd.cost) { addG('hp', -1.5); addG('stress', 1); }
        p.gains = gains;
        for (const [k, v] of gains) {
          if (S.params[k] != null) S.params[k] += v; else if (k === 'hp' || k === 'stress') S[k] += v;
          this.total[k] = (this.total[k] || 0) + v;
        }
        clampS(); this.ghp.set(S.hp); this.gst.set(S.stress);
        C.tween(p, { stampK: 1 }, 0.28, { ease: 'backOut' });
        const px = 14 + i * 124 + 58;
        if (r === 'great') { snd.se('great'); C.flash('#fff', 0.25); C.burst('sparkle', px, 150, 18, { w: 40, h: 30 }); }
        else if (r === 'fail') { snd.se('fail'); C.shake(5, 0.3); C.burst('dust', px, 180, 8, { w: 30 }); }
        else snd.se('success');
        await this.sleep(0.12); snd.se('stamp');
        gains.filter(g => S.params[g[0]] != null).forEach((g, j) => setTimeout(() => { }, 0) || C.pop(px, 214 - j * 2, `${paramName(g[0])}${g[1] > 0 ? '+' : ''}${g[1]}`, g[1] > 0 ? P.green : P.red, { size: 12 }));
        snd.se(gains.some(g => S.params[g[0]] != null && g[1] > 0) ? 'pop_up' : 'pop_down');
        await this.sleep(0.5);
      }
      await this.sleep(0.2);
      this.summary = { k: 0 };
      { const res = this.panels.map(p => p.res), gc = res.filter(r => r === 'great').length, fc = res.filter(r => r === 'fail').length;
        const kind = gc >= 2 ? 'great' : fc >= 2 ? 'fail' : 'success';
        const rl = D().reportLines && D().reportLines[cmd.id] && D().reportLines[cmd.id][kind];
        if (rl && rl.length) this.line = C.pick(rl); }
      snd.se('levelup');
      await C.tween(this.summary, { k: 1 }, 0.35, { ease: 'backOut' });
      await C.waitUntil(() => this.go);
      snd.se('decide');
      this.close();
    }
    w(p) { return p; }
    async sleep(s) { let t = 0; while (t < s) { await C.frame(); t += 1 / 60 * this.speed; } }
    update(dt, active) {
      this.t += dt;
      this.speed = G.fast ? 8 : (inp.holding ? 3.5 : 1);
      this.ghp.update(dt); this.gst.update(dt);
      for (const p of this.panels) p.frameT += dt;
      if (this.summary && this.summary.k > 0.9 && active && (inp.advance() || G.fast)) { inp.consume(); this.go = true; }
      else if (active && inp.pressed && !this.summary) { inp.consume(); }
    }
    draw(c) {
      popBg(c, '#eaf8ff', '#dcf1ff', this.t);
      UI.frame(c, 10, 8, 620, 40, { fill: P.cream, band: null });
      art.icon(c, CMD_ICON[this.cmd.id] || this.cmd.id, 22, 20, 16);
      C.text(c, `${calOf(S.week).label || ''}　${this.cmd.name}`, 44, 18, { size: 16 });
      C.text(c, inp.holding ? '>> 早送り中' : '長押しで 早送り', 618, 20, { size: 12, align: 'right', color: inp.holding ? P.pink2 : P.grey });
      const act = this.cmd.chibi || this.cmd.anim || this.cmd.id;
      this.panels.forEach((p, i) => {
        const x = 14 + i * 124, y = 58;
        if (p.k <= 0) { UI.frame(c, x, y, 116, 186, { fill: 'rgba(255,255,255,0.4)', shadow: false, border: '#c6d8ea' }); C.text(c, p.d, x + 58, y + 80, { size: 22, head: true, align: 'center', color: '#c6d8ea' }); return; }
        c.save(); const s = p.k; c.translate(x + 58, y + 93); c.scale(1, s); c.translate(-(x + 58), -(y + 93));
        const band = p.res === 'great' ? P.lemon2 : p.res === 'fail' ? P.grey : P.sky2;
        UI.frame(c, x, y, 116, 186, { fill: P.cream, band, bandH: 22 });
        C.text(c, `${p.d}曜日`, x + 58, y + 3, { size: 16, align: 'center', color: P.white, outline: P.ink });
        c.fillStyle = '#eef7ff'; c.fillRect(x + 6, y + 28, 104, 104);
        c.fillStyle = '#d7ebfb'; c.fillRect(x + 6, y + 110, 104, 22);
        const a = p.res === 'fail' ? 'fail' : act;
        const fr = Math.floor(p.frameT * (p.res === 'great' ? 9 : 6)) % art.chibiFrames(a);
        scaled(c, 2, x + 58, y + 128, () => art.chibi(c, a, fr, 0, 0));
        if (p.res) {
          const st = p.res === 'great' ? ['大成功', P.lemon2] : p.res === 'fail' ? ['失敗…', P.grey] : [this.cmd.id === 'rest' ? 'すやすや' : '成功', P.pink2];
          const sk = 1 + (1 - p.stampK) * 2;
          if (p.stampK > 0) drawStamp(c, st[0], x + 58, y + 112, st[1], sk, -0.2);
          p.gains.slice(0, 3).forEach((g, j) => {
            const good = g[0] === 'stress' ? g[1] < 0 : g[1] > 0;
            C.text(c, `${paramName(g[0])} ${g[1] > 0 ? '+' : ''}${g[1]}`, x + 58, y + 138 + j * 15, { size: 12, align: 'center', color: good ? P.mint2 : P.pink2 });
          });
        }
        c.restore();
      });
      UI.frame(c, 10, 254, 300, 96, { fill: P.cream });
      statBars(c, 20, 270, 280, this.ghp, this.gst);
      C.text(c, S.stress > 80 ? 'ストレス限界…！' : S.hp < 25 ? 'ふらふら…' : 'がんばってる！', 20, 318, { size: 12, color: S.stress > 80 || S.hp < 25 ? P.red : P.ink2 });
      if (this.summary) {
        const k = this.summary.k;
        c.fillStyle = `rgba(27,28,58,${0.5 * Math.min(1, k)})`; c.fillRect(0, 0, W, H);
        c.save(); c.translate(W / 2, 180); c.scale(k, k); c.translate(-W / 2, -180);
        UI.frame(c, 160, 70, 320, 220, { fill: P.cream, band: P.pink2, bandH: 24, dots: 'rgba(255,143,177,0.2)' });
        C.text(c, '今週の まとめ', 320, 74, { size: 16, align: 'center', color: P.white, outline: P.ink });
        const res = this.panels.map(p => p.res);
        const gc = res.filter(r => r === 'great').length, fc = res.filter(r => r === 'fail').length;
        C.text(c, `大成功 ${gc}　成功 ${5 - gc - fc}　失敗 ${fc}`, 320, 100, { size: 12, align: 'center', color: P.ink2 });
        if (this.line) C.text(c, this.line, 320, 238, { size: 12, align: 'center', color: P.pink2 });
        let row = 0;
        params().forEach(p => {
          const d = S.params[p.id] - this.p0[p.id]; if (!d) return;
          const y = 124 + row * 20; row++;
          art.icon(c, p.id, 190, y - 2, 16);
          C.text(c, p.name, 212, y, { size: 12 });
          C.text(c, `${this.p0[p.id]} → ${S.params[p.id]}`, 330, y, { size: 12, align: 'center' });
          C.text(c, `${d > 0 ? '+' : ''}${d}`, 450, y, { size: 16, align: 'right', color: d > 0 ? P.green : P.red, head: true });
        });
        const y = Math.max(124 + row * 20 + 6, 200);
        const dh = S.hp - this.hp0, ds = S.stress - this.st0;
        C.text(c, `体調 ${dh >= 0 ? '+' : ''}${dh}`, 230, y, { size: 12, color: dh >= 0 ? P.green : P.red, align: 'center' });
        C.text(c, `ストレス ${ds >= 0 ? '+' : ''}${ds}`, 410, y, { size: 12, color: ds <= 0 ? P.green : P.red, align: 'center' });
        if (k > 0.9) C.text(c, 'クリックで つぎへ', 320, 262, { size: 12, align: 'center', color: P.pink2, alpha: 0.5 + 0.5 * Math.sin(this.t * 6) });
        c.restore();
      }
    }
  }

  /* ================= weekend ================= */
  class WeekendScene {
    constructor() {
      this.name = 'weekend'; this.t = 0;
      this.ghp = new UI.Gauge(S.hp, 100, P.green); this.gst = new UI.Gauge(S.stress, 100, P.red);
      const mk = (label, icon, y, fn, en = true, col) => new UI.Button({ x: 448, y, w: 176, h: 32, label, icon, enabled: en, onClick: fn, color: col || P.cream, hoverColor: P.pinkL });
      const booked = !!S.date;
      this.btns = [
        mk('電話する', 'phone', 76, () => this.pick('phone'), !S.calledThisWeek),
        mk('家で 休む', 'rest', 116, () => this.pick('rest'), !booked && !S.restedThisWeek),
        mk('ステータス', 'star', 156, () => this.pick('status')),
        mk('セーブ', 'save', 196, () => this.pick('save')),
        mk(booked ? '日曜日へ（デート）' : '日曜日へ', 'calendar', 244, () => this.pick('next'), true, P.lemon)
      ];
      this.group = new UI.Group(this.btns);
      if (S.calledThisWeek || S.restedThisWeek) this.group.setFocus(this.btns[4], true);
    }
    pick(v) { if (this.done) return; this.done = true; snd.se('decide'); this.close(v); }
    update(dt, active) { this.t += dt; this.ghp.update(dt); this.gst.update(dt); this.group.update(dt, active && !this.done); }
    draw(c) {
      art.bg(c, 'bedroom_day', this.t);
      c.fillStyle = 'rgba(255,246,224,0.2)'; c.fillRect(0, 0, W, H);
      const k = C.ease.backOut(Math.min(1, this.t * 4));
      c.save(); c.translate(Math.round((1 - k) * -200), 0);
      UI.frame(c, 16, 16, 220, 110, { fill: P.cream, band: P.sky2, bandH: 22 });
      C.text(c, '週末', 28, 19, { size: 16, color: P.white, outline: P.ink });
      C.text(c, calOf(S.week).label || '', 224, 21, { size: 12, align: 'right', color: P.white, outline: P.ink });
      art.icon(c, 'sun', 28, 50, 16); C.text(c, '土曜日', 50, 50, { size: 16 });
      if (S.date) {
        const pl = placeOf(S.date.place);
        art.face(c, S.date.id, 'smile', 28, 76, 32);
        C.text(c, `日曜: ${givenName(S.date.id)}と`, 68, 76, { size: 12 });
        C.text(c, `${pl.name}で デート`, 68, 92, { size: 12, color: P.pink2 });
      } else C.text(c, S.restedThisWeek ? '日曜は のんびり休む' : '日曜の予定は まだない', 28, 84, { size: 12, color: P.ink2 });
      UI.frame(c, 16, 136, 220, 70, { fill: P.cream });
      statBars(c, 26, 148, 200, this.ghp, this.gst);
      c.restore();
      c.save(); c.translate(Math.round((1 - k) * 220), 0);
      UI.frame(c, 438, 40, 196, 250, { fill: 'rgba(255,246,224,0.9)', band: P.pink2, bandH: 22 });
      C.text(c, '週末の すごしかた', 450, 43, { size: 16, color: P.white, outline: P.ink });
      this.group.draw(c);
      c.restore();
    }
  }
  /* status */
  class StatusScene {
    constructor() { this.name = 'status'; this.t = 0; }
    update(dt, active) { this.t += dt; if (active && this.t > 0.2 && (inp.advance() || inp.key('cancel'))) { inp.consume(); snd.se('cancel'); this.close(); } }
    draw(c) {
      c.fillStyle = `rgba(27,28,58,${Math.min(0.6, this.t * 3)})`; c.fillRect(0, 0, W, H);
      const k = C.ease.backOut(Math.min(1, this.t * 5));
      c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
      UI.frame(c, 30, 20, 580, 320, { fill: P.cream, band: P.lilac2, bandH: 24, dots: 'rgba(199,168,255,0.2)' });
      C.text(c, `ステータス　${PLAYER()}`, 46, 24, { size: 16, color: P.white, outline: P.ink });
      params().forEach((p, i) => {
        const y = 60 + i * 26;
        art.icon(c, p.id, 50, y, 16); C.text(c, p.name, 72, y + 1, { size: 16 });
        UI.bar(c, 124, y + 5, 120, 8, S.params[p.id] / 200, PARAM_COLOR[p.id]);
        C.text(c, String(S.params[p.id]), 280, y + 1, { size: 16, align: 'right' });
      });
      C.text(c, `体調 ${S.hp}　ストレス ${S.stress}`, 50, 200, { size: 16 });
      if (S.exams.midterm) C.text(c, `中間テスト ${S.exams.midterm}位`, 50, 226, { size: 12, color: P.ink2 });
      if (S.exams.final) C.text(c, `期末テスト ${S.exams.final}位`, 50, 244, { size: 12, color: P.ink2 });
      if (S.sports) C.text(c, `体育祭 ${S.sports.place}位`, 50, 262, { size: 12, color: P.ink2 });
      boys().forEach((id, i) => {
        const y = 56 + i * 64;
        if (!S.met[id]) { C.text(c, '？？？　まだ 出会っていない', 320, y + 16, { size: 12, color: P.grey }); return; }
        art.face(c, id, 'normal', 320, y, 48);
        C.text(c, charName(id), 376, y, { size: 16 });
        C.text(c, chars()[id].role || chars()[id].grade || '', 376, y + 18, { size: 12, color: P.ink2 });
        hearts(c, 376, y + 34, tierIdx(S.aff[id]) + 1);
        C.text(c, tierName(S.aff[id]), 430, y + 34, { size: 12, color: P.pink2 });
        if (S.lit[id]) art.icon(c, 'bomb_lit', 560, y + 16, 16);
      });
      C.text(c, 'クリックで とじる', 320, 318, { size: 12, align: 'center', color: P.pink2 });
      c.restore();
    }
  }

  /* ================= phone ================= */
  const PHONE = { x: 36, y: 20, w: 190, h: 326 };
  class PhoneScene {
    constructor() {
      this.name = 'phone'; this.t = 0; this.mode = 'list'; this.target = null; this.k = { v: 0 };
      C.tween(this.k, { v: 1 }, 0.35, { ease: 'backOut' });
      const contacts = boys().filter(id => S.met[id]).concat(chars()[FRIEND] ? [FRIEND] : []);
      this.btns = contacts.map((id, i) => new UI.Button({
        x: PHONE.x + 14, y: PHONE.y + 64 + i * 46, w: PHONE.w - 28, h: 40, cid: id, color: P.white, hoverColor: P.pinkL,
        render: (c, x, y) => {
          c.fillStyle = P.ink; c.fillRect(x + 5, y + 3, 34, 34); art.face(c, id, 'normal', x + 6, y + 4, 32);
          C.text(c, givenName(id), x + 46, y + 5, { size: 12 });
          if (id === FRIEND) C.text(c, '情報通の 親友', x + 46, y + 21, { size: 12, color: P.ink2 });
          else { hearts(c, x + 46, y + 23, tierIdx(S.aff[id]) + 1, 5, 1); if (S.lit[id]) art.icon(c, 'bomb_lit', x + 128, y + 4, 16); }
        },
        onClick: b => this.pick(b.cid)
      }));
      this.btns.push(new UI.Button({ x: PHONE.x + 40, y: PHONE.y + PHONE.h - 44, w: PHONE.w - 80, h: 26, label: 'やめる', size: 12, color: P.cream, onClick: () => this.pick(null) }));
      this.group = new UI.Group(this.btns, { onCancel: () => this.pick(null) });
    }
    pick(id) { if (this.done) return; this.done = true; snd.se(id ? 'phone_dial' : 'cancel'); this.close(id); }
    update(dt, active) { this.t += dt; if (this.mode === 'list') this.group.update(dt, active && !this.done); }
    draw(c) {
      art.bg(c, 'bedroom', this.t);
      c.fillStyle = 'rgba(27,28,58,0.35)'; c.fillRect(0, 0, W, H);
      const k = this.k.v;
      c.save(); c.translate(0, Math.round((1 - k) * 360));
      drawPhone(c, this.t, () => {
        C.text(c, '電話帳', PHONE.x + PHONE.w / 2, PHONE.y + 36, { size: 16, align: 'center', color: P.ink });
        this.group.draw(c);
      });
      c.restore();
      UI.frame(c, 250, 20, 370, 60, { fill: 'rgba(255,246,224,0.92)' });
      C.text(c, 'だれに 電話する？', 266, 30, { size: 16 });
      C.text(c, 'OKなら 日曜日に デート。好きな場所を 選ぼう', 266, 52, { size: 12, color: P.ink2 });
    }
  }
  function drawPhone(c, t, content, shake) {
    const { x, y, w, h } = PHONE;
    const sx = shake ? Math.round(Math.sin(t * 60) * 2) : 0;
    c.save(); c.translate(sx, 0);
    c.fillStyle = 'rgba(27,28,58,0.4)'; c.fillRect(x + 6, y + 6, w, h);
    c.fillStyle = P.ink; c.fillRect(x + 2, y, w - 4, h); c.fillRect(x, y + 2, w, h - 4);
    c.fillStyle = '#ff9ec0'; c.fillRect(x + 3, y + 2, w - 6, h - 4); c.fillRect(x + 2, y + 3, w - 4, h - 6);
    c.fillStyle = P.ink; c.fillRect(x + 8, y + 16, w - 16, h - 36);
    c.fillStyle = '#fff8f0'; c.fillRect(x + 10, y + 18, w - 20, h - 40);
    c.fillStyle = P.ink; c.fillRect(x + w / 2 - 14, y + 6, 28, 4); c.fillRect(x + w / 2 - 10, y + h - 14, 20, 6);
    c.fillStyle = '#fff'; c.fillRect(x + 6, y + 6, 2, 30);
    c.save(); c.beginPath(); c.rect(x + 10, y + 18, w - 20, h - 40); c.clip();
    content(); c.restore();
    c.restore();
  }
  class CallScene {
    constructor(id) { this.name = 'call'; this.id = id; this.t = 0; this.state = 'ring'; this.show = { k: 0 }; }
    update(dt) { this.t += dt; }
    draw(c) {
      art.bg(c, 'bedroom', this.t);
      c.fillStyle = 'rgba(27,28,58,0.35)'; c.fillRect(0, 0, W, H);
      drawPhone(c, this.t, () => {
        const cx = PHONE.x + PHONE.w / 2;
        c.fillStyle = this.state === 'ring' ? '#ffe3ec' : '#e6fff5'; c.fillRect(PHONE.x + 10, PHONE.y + 18, PHONE.w - 20, PHONE.h - 40);
        if (this.state === 'ring') for (let i = 0; i < 3; i++) {
          const r = ((this.t * 40 + i * 20) % 60) + 26;
          c.strokeStyle = `rgba(232,87,126,${1 - (r - 26) / 60})`; c.lineWidth = 2; c.beginPath(); c.arc(cx, PHONE.y + 110, r, 0, 7); c.stroke();
        }
        c.fillStyle = P.ink; c.fillRect(cx - 26, PHONE.y + 84, 52, 52);
        art.face(c, this.id, this.state === 'talk' ? (G.callExpr || 'normal') : 'normal', cx - 24, PHONE.y + 86, 48);
        C.text(c, charName(this.id), cx, PHONE.y + 150, { size: 16, align: 'center' });
        const st = this.state === 'ring' ? '呼び出し中' + '…'.repeat(1 + Math.floor(this.t * 3) % 3) : this.state === 'end' ? '通話終了' : `通話中 ${String(Math.floor(this.t / 60)).padStart(2, '0')}:${String(Math.floor(this.t % 60)).padStart(2, '0')}`;
        C.text(c, st, cx, PHONE.y + 172, { size: 12, align: 'center', color: this.state === 'ring' ? P.pink2 : P.mint2 });
        c.fillStyle = P.red; c.beginPath(); c.arc(cx, PHONE.y + 250, 16, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.fillRect(cx - 8, PHONE.y + 248, 16, 4);
      }, this.state === 'ring');
      if (this.state !== 'ring') {
        const k = this.show.k;
        art.portrait(c, this.id, G.callExpr || 'normal', 450 + Math.round((1 - k) * 60), 364, { t: C.time, alpha: k, blink: true });
      }
    }
  }
  class PlaceScene {
    constructor(boy) {
      this.name = 'places'; this.t = 0; this.boy = boy;
      const pl = places();
      const cols = 3, cw = 196, ch = 58;
      this.btns = pl.map((p, i) => new UI.Button({
        x: 20 + (i % cols) * (cw + 8), y: 44 + Math.floor(i / cols) * (ch + 8), w: cw, h: ch, place: p, color: P.cream, hoverColor: P.pinkL,
        render: (c, x, y) => {
          c.fillStyle = P.ink; c.fillRect(x + 5, y + 5, 82, 48);
          c.drawImage(thumb(p.bg || p.id), 0, 0, 128, 72, x + 6, y + 6, 80, 46);
          const big = C.measure(c, p.name, 16) <= 96;
          C.text(c, p.name, x + 94, y + (big ? 12 : 14), { size: big ? 16 : 12 });
          C.text(c, p.cost ? '¥'.repeat(Math.min(3, p.cost)) : 'おこづかい 0', x + 94, y + 34, { size: 12, color: P.ink2 });
        },
        onClick: b => this.pick(b.place.id)
      }));
      const n = pl.length, rows = Math.ceil(n / cols);
      this.btns.push(new UI.Button({ x: 260, y: 44 + rows * (ch + 8) + 2, w: 120, h: 26, label: 'やっぱりやめる', size: 12, onClick: () => this.pick(null) }));
      this.group = new UI.Group(this.btns, { onCancel: () => this.pick(null) });
      this.group.onFocus = b => { this.hl = b; };
      this.hl = this.btns[0];
    }
    pick(v) { if (this.done) return; this.done = true; snd.se(v ? 'decide' : 'cancel'); this.close(v); }
    update(dt, active) { this.t += dt; this.group.update(dt, active && !this.done && this.t > 0.2); }
    draw(c) {
      c.fillStyle = `rgba(27,28,58,${Math.min(0.75, this.t * 4)})`; c.fillRect(0, 0, W, H);
      const k = C.ease.backOut(Math.min(1, this.t * 4));
      c.save(); c.translate(0, Math.round((1 - k) * 30)); c.globalAlpha = Math.min(1, k);
      UI.frame(c, 12, 8, 616, 30, { fill: P.pink2 });
      C.text(c, `${givenName(this.boy)}を どこに さそう？`, 26, 14, { size: 16, color: P.white, outline: P.ink });
      this.group.draw(c);
      const p = this.hl && this.hl.place;
      if (p && p.desc) { UI.frame(c, 12, 322, 616, 30, { fill: P.cream }); C.text(c, p.desc, 24, 330, { size: 12 }); }
      c.restore();
    }
  }
  function lineOf(v) {
    if (!v) return null;
    if (typeof v === 'string') return [{ say: G.curBoy, text: v }];
    if (Array.isArray(v)) {
      if (!v.length) return null;
      if (typeof v[0] === 'string') return [{ say: G.curBoy, text: C.pick(v) }];
      if (Array.isArray(v[0])) return lineOf(C.pick(v));
      if (v[0] && (v[0].text || v[0].say !== undefined || v[0].expr)) {
        if (v.every(x => x && x.text && x.say === undefined && !x.expr && !x.show && !x.fx)) return [{ say: G.curBoy, text: C.pick(v).text }];
        return v;
      }
    }
    if (typeof v === 'object' && v.text) return [{ say: G.curBoy, text: v.text, expr: v.expr }];
    return null;
  }
  async function runLine(v, fallback) {
    const steps = lineOf(v) || fallback;
    if (!steps) return;
    const mapped = steps.map(s => { const o = Object.assign({}, s); if (o.expr && o.say) { G.callExpr = o.expr; } return o; });
    for (const s of mapped) {
      if (s.expr && s.say !== undefined) G.callExpr = s.expr;
      if (s.say !== undefined && s.say !== 'me' && s.say !== null && s.say !== G.curBoy && G.phase === 'call') { /* third person in call */ }
      await execStep(G.phase === 'call' ? Object.assign({}, s, { show: undefined }) : s, 0);
    }
  }
  function acceptChance(id, place) {
    const ch = chars()[id] || {};
    const likes = (ch.likes && ch.likes.place) || [];
    const hates = (ch.likes && ch.likes.hate) || ch.dislikes || [];
    let p = 0.42 + S.aff[id] / 100 * 0.5;
    if (likes.includes(place)) p += 0.25;
    if (hates.includes && hates.includes(place)) p -= 0.25;
    if (S.hurt[id] >= 50) p -= 0.15;
    const lp = ch.likes && ch.likes.param;
    const pv = lp === 'balance' ? Object.values(S.params).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(S.params).length) : (lp ? S.params[lp] || 0 : 0);
    if (lp && pv >= 40) p += 0.1;
    if (!S.dates[id]) p += 0.1;
    if (S.lastDate[id] === S.week - 1 && S.dates[id]) p -= 0.15;
    return C.clamp(p, 0.12, 0.96);
  }
  async function phoneFlow() {
    G.phase = 'phone';
    const id = await C.run(new PhoneScene());
    if (!id) return false;
    S.calledThisWeek = true;
    G.curBoy = id; G.callExpr = 'normal';
    const call = new CallScene(id);
    C.push(call); G.phase = 'call';
    snd.bgm('night');
    for (let i = 0; i < 2; i++) { snd.se('phone_ring'); await C.wait(G.fast ? 0.05 : 0.7); }
    snd.se('phone_pickup'); call.state = 'talk'; call.t = 0;
    C.tween(call.show, { k: 1 }, 0.3, { ease: 'cubicOut' });
    const ph = (D().phone && D().phone[id]) || {};
    let booked = false;
    if (id === FRIEND) {
      await runLine(ph.open || ph.first, [{ say: FRIEND, text: 'もしもし〜？ ひよりだよ。なになに、情報ほしいの？' }]);
      S.flags.called_friend = true;
      await friendReport();
    } else {
      const firstTime = !S.flags['called_' + id];
      S.flags['called_' + id] = true;
      if (S.hurt[id] >= 50 && ph.hurt) { G.callExpr = 'sad'; await runLine(ph.hurt); }
      else await runLine(firstTime ? (ph.first || ph.hello) : (ph.hello || null), [{ say: id, text: `もしもし、${givenName(id)}だけど。……どうしたの？` }]);
      const busyChance = 0.12 + (S.aff[id] < 20 ? 0.1 : 0);
      if (!firstTime && Math.random() < busyChance && ph.busy) {
        G.callExpr = 'think';
        await runLine(ph.busy);
      } else {
        msgHide();
        G.phase = 'places';
        const place = await C.run(new PlaceScene(id));
        G.phase = 'call';
        if (place) {
          G.curPlace = place;
          await say('me', `日曜日、${placeOf(place).name}に 行かない？`);
          const ok = Math.random() < acceptChance(id, place);
          if (!G.fast) { await C.wait(0.35); }
          if (ok) {
            G.callExpr = 'smile'; snd.se('heart'); C.burst('heart', 450, 120, 12, { w: 40 });
            const at = ph.acceptTier && ph.acceptTier[tierIdx(S.aff[id])];
            await runLine(at || ph.accept, [{ say: id, text: `${placeOf(place).name}か。いいよ、行こう。` }]);
            S.date = { id, place }; booked = true;
            C.toast(`日曜日: ${givenName(id)}と ${placeOf(place).name}`, { icon: 'heart', color: P.pinkL });
          } else {
            G.callExpr = 'sad'; snd.se('cancel');
            await runLine(ph.decline, [{ say: id, text: 'ごめん、その日は 予定があって…。また 誘って。' }]);
          }
        } else {
          await say('me', 'あ……ううん、なんでもない！ 声が 聞きたかっただけ。');
          applyEffect({ [id]: 1 }, true);
        }
      }
    }
    msgHide();
    snd.se('cancel'); call.state = 'end';
    await C.tween(call.show, { k: 0 }, 0.2);
    await C.wait(G.fast ? 0.05 : 0.4);
    C.remove(call);
    G.curBoy = null;
    snd.bgm('daily');
    return booked;
  }
  async function friendReport() {
    const bt = D().bombTalk || {};
    if (bt.intro) await say(FRIEND, C.pick(bt.intro));
    const opts = boys().map(id => ({ id, text: S.met[id] ? `${givenName(id)}のこと` : `${(chars()[id].title || chars()[id].grade || '')}のこと` }));
    opts.push({ id: null, text: '今日は いいや' });
    const i = await choose(opts);
    const id = opts[i].id;
    if (id) {
      G.callExpr = 'smile';
      if (S.met[id]) {
        const f = bt.feelings && bt.feelings[id];
        await say(FRIEND, f ? f[tierIdx(S.aff[id])] : `${givenName(id)}くんは 今「${tierName(S.aff[id])}」って感じかな。`);
        C.toast(`${givenName(id)}: ${tierName(S.aff[id])}`, { icon: 'heart', color: P.pinkL });
      } else {
        const u = bt.unmet && bt.unmet[id];
        await say(FRIEND, u ? C.pick(u) : 'その人とは まだ 会ってないでしょ？');
      }
    }
    const lit = boys().filter(b => S.met[b] && S.lit[b]);
    if (lit.length) { G.callExpr = 'think'; await runLine(bombLine(lit[0], 'warn'), [{ say: FRIEND, text: `${givenName(lit[0])}くん、最近 ほったらかしでしょ。危ないよ。` }]); }
    else if (bt.calm) await say(FRIEND, C.pick(bt.calm));
    const ph = (D().phone && D().phone[FRIEND]) || {};
    G.callExpr = 'wink';
    if (ph.close) await say(FRIEND, C.pick(ph.close));
  }
  function bombLine(id, kind) {
    const b = D().bombTalk || {};
    const src = kind === 'warn' ? b.warn : kind === 'boom' ? (b.explode || b.boom) : b[kind];
    let v = src && (Array.isArray(src) ? src : src[id]);
    if (!v) return null;
    if (typeof v === 'string') v = [v];
    return v.length && typeof v[0] === 'string' ? [{ say: FRIEND, text: C.pick(v).replace(/\{boy\}/g, givenName(id)) }] : v;
  }
  /* ================= date ================= */
  function getDate(id, place) {
    const all = D().dates || {};
    const d = all[id] || {};
    const spec = d[place] && (d[place].opener || d[place].talks) ? d[place] : null;
    const common = d.common || d.base || d.default || d;
    const pickArr = (k) => (spec && spec[k]) || common[k] || null;
    const placeLine = (d.places && d.places[place]) || (d.placeLines && d.placeLines[place]) || (common.place && common.place[place]) || (d[place] && !spec ? d[place] : null) || (all.placeLines && all.placeLines[id] && all.placeLines[id][place]);
    let talks = pickArr('talks') || [];
    if (all.common && all.common.talks && talks.length < 3) talks = talks.concat(all.common.talks);
    return {
      opener: pickArr('opener') || [], placeLine, talks,
      good: pickArr('closer_good') || pickArr('good') || [], bad: pickArr('closer_bad') || pickArr('bad') || []
    };
  }
  class DateHUD {
    constructor(id, place) { this.name = 'datehud'; this.id = id; this.place = place; this.ex = new UI.Gauge(50, 100, P.pink2); this.round = 0; this.t = 0; this.pulse = 0; }
    update(dt) { this.t += dt; this.ex.update(dt); this.pulse = Math.max(0, this.pulse - dt * 2); }
    draw(c) {
      const pl = placeOf(this.place);
      UI.frame(c, 8, 8, 170, 26, { fill: P.cream, depth: 2 });
      art.icon(c, 'heart', 14, 13, 16);
      C.text(c, `${pl.name}デート`, 34, 13, { size: 12 });
      for (let i = 0; i < 3; i++) { c.fillStyle = P.ink; c.fillRect(140 + i * 12, 16, 9, 9); c.fillStyle = i < this.round ? P.pink2 : '#e3d6bd'; c.fillRect(141 + i * 12, 17, 7, 7); }
      UI.frame(c, 410, 8, 222, 26, { fill: P.cream, depth: 2 });
      const s = 1 + this.pulse * 0.6;
      scaled(c, s, 424, 21, () => { C.bitmap(c, C.HEART, -7, -6, 2, P.ink); C.bitmap(c, C.HEART, -7, -7, 2, this.ex.value >= 50 ? P.pink2 : P.grey); });
      C.text(c, 'もりあがり', 442, 13, { size: 12 });
      this.ex.draw(c, 510, 16, 112, 9);
    }
  }
  async function dateFlow() {
    const { id, place } = S.date; S.date = null;
    G.curBoy = id; G.curPlace = place; G.phase = 'date';
    const pl = placeOf(place), ch = chars()[id] || {};
    const liked = ((ch.likes && ch.likes.place) || []).includes(place);
    const affBefore = S.aff[id];
    await C.transition('iris', async () => { clearActors(); STAGE.bg = pl.bg || place; STAGE.tint = 0; }, 0.9);
    snd.bgm(liked || S.aff[id] >= 50 ? 'date_happy' : 'date_calm');
    const hud = new DateHUD(id, place); C.push(hud);
    const dd = getDate(id, place);
    await showActor(id, 'smile', 'center');
    if (dd.opener.length) await runScript(dd.opener);
    else await say(id, `おまたせ。${pl.name}、ちょっと 楽しみにしてた。`);
    if (dd.placeLine) await runLine(dd.placeLine);
    if (liked) { setExpr(id, 'laugh'); C.burst('sparkle', 320, 130, 16, { w: 60 }); snd.se('sparkle'); hud.ex.set(62); }
    let ex = hud.ex.value, sumDelta = 0;
    const talks = C.shuffle(dd.talks).slice(0, 3);
    for (let r = 0; r < talks.length; r++) {
      hud.round = r + 1;
      const tk = talks[r];
      setExpr(id, 'normal');
      if (tk.q) { if (typeof tk.q === 'string') await say(id, tk.q); else await runScript(tk.q); }
      const chs = C.shuffle(tk.choices || []);
      if (!chs.length) continue;
      const i = await choose(chs.map(o => ({ text: o.text })));
      const o = chs[i];
      const dv = o.delta != null ? o.delta : (o.effect && o.effect[id]) || 0;
      sumDelta += dv;
      setExpr(id, o.expr || (dv >= 3 ? 'laugh' : dv > 0 ? 'smile' : dv < 0 ? 'annoyed' : 'think'));
      ex = C.clamp(ex + dv * 5 + (dv > 0 ? 2 : -4), 0, 100); hud.ex.set(ex); hud.pulse = 1;
      if (dv > 0) { snd.se('heart'); C.burst('heart', 320, 140, 6 + dv * 4, { w: 50, h: 30 }); if (dv >= 3) C.flash('#ffe0ea', 0.3); }
      else if (dv < 0) { snd.se('heart_break'); C.shake(5, 0.3); const a = STAGE.actors[id]; if (a) { C.tween(a, { dy: 6 }, 0.1).then(() => C.tween(a, { dy: 0 }, 0.2)); } }
      else snd.se('pop_down');
      if (o.reply) { if (typeof o.reply === 'string') await say(id, o.reply); else await runScript(o.reply); }
    }
    const good = ex >= 50;
    setExpr(id, good ? 'blush' : 'sad');
    if (good) snd.bgm('heartbeat');
    const closer = good ? dd.good : dd.bad;
    if (closer && closer.length) await runScript(closer);
    else await say(id, good ? '今日は すごく 楽しかった。……また 誘って。' : '…今日は ありがと。じゃあ、また 学校で。');
    msgHide();
    let gain = Math.round(sumDelta * 0.7 + (liked ? 3 : 0) + (good ? 3 : -2) + (ex >= 80 ? 2 : 0));
    S.aff[id] += gain; S.hurt[id] = Math.max(0, S.hurt[id] - 45); if (S.hurt[id] < 50) S.lit[id] = false;
    S.lastDate[id] = S.week; S.dates[id] = (S.dates[id] || 0) + 1; S.stress -= good ? 10 : 2;
    clampS();
    C.remove(hud);
    await C.run(new DateResult(id, affBefore, S.aff[id], good, ex));
    await hideActor(id);
    G.curBoy = null; G.curPlace = null;
  }
  class DateResult {
    constructor(id, a0, a1, good, ex) {
      this.name = 'dateresult'; this.id = id; this.a0 = a0; this.a1 = a1; this.good = good; this.ex = ex; this.t = 0;
      this.g = new UI.Gauge(a0, 100, P.pink2); this.k = { v: 0 };
      C.tween(this.k, { v: 1 }, 0.4, { ease: 'backOut' }).then(() => { this.g.set(a1); snd.se(a1 >= a0 ? 'levelup' : 'pop_down'); if (tierIdx(a1) > tierIdx(a0)) { snd.se('great'); C.burst('heart', 320, 150, 24, { w: 80 }); C.toast(`${givenName(id)}: ${tierName(a1)} に なった！`, { icon: 'heart', color: P.pinkL }); } });
    }
    update(dt, active) {
      this.t += dt; this.g.update(dt);
      if (this.good && Math.random() < dt * 8) C.burst('heart', C.rand(170, 470), 280, 1, { angle: -Math.PI / 2, spread: 0.3, min: 40, max: 70 });
      if (active && this.t > 0.7 && (inp.advance() || G.fast)) { inp.consume(); snd.se('decide'); this.close(); }
    }
    draw(c) {
      c.fillStyle = `rgba(27,28,58,${Math.min(0.55, this.t * 2)})`; c.fillRect(0, 0, W, H);
      const k = this.k.v;
      c.save(); c.translate(W / 2, 170); c.scale(k, k); c.translate(-W / 2, -170);
      UI.frame(c, 170, 60, 300, 210, { fill: P.cream, band: this.good ? P.pink2 : P.grey, bandH: 26, dots: 'rgba(255,143,177,0.2)' });
      C.text(c, this.good ? 'デート 大成功！' : 'デート 終了', 320, 64, { size: 16, align: 'center', color: P.white, outline: P.ink, head: true });
      c.fillStyle = P.ink; c.fillRect(191, 99, 50, 50); art.face(c, this.id, this.good ? 'blush' : 'sad', 192, 100, 48);
      C.text(c, charName(this.id), 252, 104, { size: 16 });
      C.text(c, `もりあがり ${Math.round(this.ex)}%`, 252, 126, { size: 12, color: P.ink2 });
      C.text(c, 'ときめき度', 192, 164, { size: 12 });
      this.g.draw(c, 192, 182, 256, 10);
      const d = this.a1 - this.a0;
      C.text(c, `${d >= 0 ? '+' : ''}${d}`, 448, 160, { size: 16, align: 'right', color: d >= 0 ? P.green : P.red, head: true });
      hearts(c, 192, 204, tierIdx(this.g.value) + 1, 5, 2);
      C.text(c, tierName(this.a1), 448, 206, { size: 16, align: 'right', color: P.pink2 });
      if (this.t > 0.7) C.text(c, 'クリックで つぎへ', 320, 246, { size: 12, align: 'center', color: P.pink2, alpha: 0.5 + 0.5 * Math.sin(this.t * 6) });
      c.restore();
    }
  }

  /* ================= exams ================= */
  const SURN = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '松本', '井上', '木村', '林', '清水', '森', '池田', '橋本', '石川', '前田', '藤田', '岡田', '後藤', '長谷川', '村上', '近藤', '石井'];
  const GIVEN = ['葵', '蓮', '陽菜', '悠真', '結衣', '湊斗', '美咲', '大翔', '凛', '陸', '心春', '颯', '紬', '樹', '杏', '奏', '芽依', '律', '楓', '朝陽', '詩', '晴', '澪', '蒼', '莉子', '航', '小春', '湧', '千尋', '光'];
  function examRank(kind) {
    const base = S.params.study * 1.25 + S.params.culture * 0.25 + C.rand(-10, 10) - (S.stress > 70 ? 12 : 0) - (kind === 'final' ? 8 : 0);
    const z = (base - 48) / 18;
    const pct = 1 / (1 + Math.exp(-z));
    return C.clamp(Math.round(240 * (1 - pct)) + 1, 1, 240);
  }
  class RankScene {
    constructor(kind, rank) {
      this.name = 'rank'; this.kind = kind; this.rank = rank; this.t = 0; this.scroll = { y: -40 }; this.stampK = 0; this.phase = 'roll';
      const n = 240; this.rows = [];
      const myScore = Math.round(C.clamp(500 - rank * 1.4 + C.rand(-2, 2), 80, 498));
      for (let i = 1; i <= n; i++) {
        if (i === rank) this.rows.push({ r: i, name: PLAYER(), score: myScore, me: true });
        else { const boyName = i === 3 && chars().ritsu ? charName('ritsu') : null; this.rows.push({ r: i, name: boyName || `${C.pick(SURN)} ${C.pick(GIVEN)}`, score: Math.round(C.clamp(500 - i * 1.4 + C.rand(-0.6, 0.6), 80, 499)) }); }
      }
    }
    async run() {
      snd.bgm('tension');
      await C.wait(G.fast ? 0.05 : 0.6);
      snd.se('drumroll');
      const target = (this.rank - 1) * 18 - 60;
      await C.tween(this.scroll, { y: target }, G.fast ? 0.2 : C.clamp(1.4 + this.rank / 120, 1.4, 3.0), { ease: 'cubicOut' });
      this.phase = 'slam';
      await C.wait(0.15);
      snd.se('stamp'); snd.se('bell_rank'); C.shake(8, 0.4);
      this.stamp = { k: 0 }; await C.tween(this.stamp, { k: 1 }, 0.3, { ease: 'backOut' });
      if (this.rank <= 10) { C.burst('confetti', W / 2, 20, 80, { w: 300 }); snd.se('cheer'); C.flash('#fff', 0.3); }
      else if (this.rank > 160) snd.se('fail');
      else snd.se('success');
      await C.waitUntil(() => this.go);
      snd.se('decide'); this.close();
    }
    update(dt, active) { this.t += dt; if (this.stamp && this.stamp.k >= 1 && active && (inp.advance() || G.fast)) { inp.consume(); this.go = true; } else if (active && inp.pressed && this.phase === 'roll') { inp.consume(); } }
    draw(c) {
      art.bg(c, 'rank_board', this.t);
      c.fillStyle = 'rgba(27,28,58,0.25)'; c.fillRect(0, 0, W, H);
      UI.frame(c, 150, 16, 340, 30, { fill: P.lemon });
      C.text(c, `${this.kind === 'final' ? '期末' : '中間'}テスト 成績上位者`, 320, 23, { size: 16, align: 'center' });
      const bx = 150, by = 54, bw = 340, bh = 250;
      UI.frame(c, bx, by, bw, bh, { fill: '#fdfbf4' });
      c.save(); c.beginPath(); c.rect(bx + 4, by + 4, bw - 8, bh - 8); c.clip();
      const y0 = by + 8 - this.scroll.y; const first = Math.max(0, Math.floor(this.scroll.y / 18) - 1);
      for (let i = first; i < Math.min(this.rows.length, first + 16); i++) {
        const r = this.rows[i], y = y0 + i * 18;
        if (r.me && this.phase === 'slam') { c.fillStyle = P.pinkL; c.fillRect(bx + 4, y - 2, bw - 8, 18); }
        c.fillStyle = 'rgba(43,45,92,0.12)'; c.fillRect(bx + 10, y + 15, bw - 20, 1);
        C.text(c, `${r.r}位`, bx + 50, y, { size: 12, align: 'right', color: r.r <= 3 ? P.pink2 : P.ink });
        C.text(c, r.me && this.phase !== 'slam' ? '？？？' : r.name, bx + 66, y, { size: 12, color: r.me ? P.pink2 : P.ink });
        C.text(c, `${r.score}点`, bx + bw - 20, y, { size: 12, align: 'right', color: P.ink2 });
      }
      c.restore();
      if (this.phase === 'roll') { const b = Math.round(Math.sin(this.t * 20) * 2); C.text(c, 'ドキドキ……', 320, 316 + b, { size: 16, align: 'center', color: P.white, outline: P.ink }); }
      if (this.stamp) {
        const k = this.stamp.k, s = 1 + (1 - k) * 2.5;
        c.save(); c.translate(W / 2, 178); c.rotate(-0.12); c.scale(s, s); c.globalAlpha = Math.min(1, k * 1.5);
        UI.frame(c, -130, -46, 260, 92, { fill: this.rank <= 10 ? P.lemon : this.rank <= 120 ? P.pinkL : '#dde0f0', band: P.pink2, bandH: 20 });
        C.text(c, `学年 ${240}人中`, 0, -44, { size: 12, align: 'center', color: P.white, outline: P.ink });
        C.text(c, `${this.rank}位`, 0, -20, { size: 44, align: 'center', head: true, color: P.pink2, outline: P.white, ow: 2 });
        c.restore();
        if (k >= 1) {
          const rc = (D().rankComments || []).find(x => this.rank <= x.max);
          const cm = rc ? rc.text : this.rank <= 10 ? 'トップ10入り！ すごい！' : this.rank <= 60 ? '上位に 入った！' : this.rank <= 150 ? 'まあまあ…かな' : 'もっと 勉強しなきゃ…';
          UI.frame(c, 60, 310, 520, 30, { fill: P.cream });
          C.text(c, cm, 320, 318, { size: 12, align: 'center', color: this.rank <= 60 ? P.pink2 : P.ink2 });
        }
      }
    }
  }
  async function examFlow(kind, evName) {
    await runEventPart(evName, 'pre');
    msgHide(); clearActors();
    const rank = examRank(kind);
    S.exams[kind] = rank;
    S.flags[`${kind}_top`] = rank <= 10; S.flags[`${kind}_good`] = rank <= 60; S.flags[`${kind}_bad`] = rank > 150;
    G.phase = 'rank';
    const sc = new RankScene(kind, rank);
    await runTrans(sc, 'diamond', 0.7);
    if (rank <= 10) applyEffect({ stress: -10 }, true); else if (rank > 150) applyEffect({ stress: 10 }, true);
    await runEventPart(evName, rank <= 30 ? 'good' : rank <= 120 ? 'normal' : 'bad');
    await runEventPart(evName, 'post');
  }

  /* ================= sports day ================= */
  class SportsScene {
    constructor() {
      this.name = 'sports'; this.t = 0; this.round = 0; this.results = []; this.cur = 0; this.dir = 1; this.state = 'intro'; this.msg = '';
      this.zoneW = C.clamp(0.1 + S.params.sport / 700, 0.1, 0.34); this.zone = 0.6; this.speed = 1.1; this.runner = 0; this.judge = null;
    }
    async run() {
      snd.bgm('festival');
      this.state = 'intro'; await this.waitGo();
      for (let r = 0; r < 3; r++) {
        this.round = r; this.zone = C.rand(0.25, 0.85 - this.zoneW); this.speed = 1.0 + r * 0.35; this.cur = 0; this.dir = 1; this.judge = null;
        snd.se('whistle'); this.state = 'play';
        await C.waitUntil(() => this.state === 'judged');
        await C.wait(G.fast ? 0.05 : 0.8);
      }
      const pts = this.results.reduce((a, b) => a + b, 0);
      const score = pts * 10 + S.params.sport * 0.35 + C.rand(-5, 5);
      this.place = score >= 70 ? 1 : score >= 50 ? 2 : score >= 32 ? 3 : 4;
      this.state = 'result';
      this.res = { k: 0 }; snd.se('stamp');
      await C.tween(this.res, { k: 1 }, 0.35, { ease: 'backOut' });
      if (this.place === 1) { snd.se('cheer'); C.burst('confetti', W / 2, 20, 90, { w: 300 }); C.flash('#fff', 0.3); }
      else if (this.place <= 3) snd.se('success'); else snd.se('fail');
      await this.waitGo();
      snd.se('decide');
      this.close();
    }
    async waitGo() { this.go = false; await C.waitUntil(() => this.go); }
    update(dt, active) {
      this.t += dt;
      if (this.state === 'play') {
        this.cur += this.dir * dt * this.speed; if (this.cur > 1) { this.cur = 1; this.dir = -1; } if (this.cur < 0) { this.cur = 0; this.dir = 1; }
        this.runner = Math.min(1, this.runner + dt * 0.15);
        const auto = G.fast && Math.abs(this.cur - (this.zone + this.zoneW / 2)) < this.zoneW * 0.3;
        if ((active && (inp.advance())) || auto) {
          inp.consume();
          const c = this.zone + this.zoneW / 2, d = Math.abs(this.cur - c);
          const j = d < this.zoneW * 0.18 ? 3 : d < this.zoneW / 2 ? 2 : d < this.zoneW ? 1 : 0;
          this.results.push(j); this.judge = { j, t: 0 };
          snd.se(j === 3 ? 'great' : j >= 2 ? 'success' : j === 1 ? 'pop_down' : 'fail');
          if (j === 3) { C.flash('#fff', 0.2); C.burst('star', 320, 130, 20); } if (j === 0) C.shake(5, 0.3);
          this.state = 'judged';
        }
      } else if ((this.state === 'intro' || (this.state === 'result' && this.res && this.res.k >= 1)) && active && (inp.advance() || G.fast) && this.t > 0.3) { inp.consume(); this.go = true; }
      if (this.judge) this.judge.t += dt;
    }
    draw(c) {
      art.bg(c, 'sports_day', this.t);
      UI.frame(c, 140, 10, 360, 30, { fill: P.lemon });
      C.text(c, 'クラス対抗リレー　バトンパス！', 320, 17, { size: 16, align: 'center' });
      /* track & runner */
      c.fillStyle = '#d9824f'; c.fillRect(0, 238, W, 30); c.fillStyle = '#fff'; for (let x = 0; x < W; x += 40) c.fillRect(x + Math.floor(-this.t * 80 % 40), 252, 20, 2);
      const rx = 80 + (this.round + (this.state === 'judged' ? 1 : this.runner * 0.6)) * 130;
      scaled(c, 1, Math.min(560, rx), 266, () => art.chibi(c, 'sport', Math.floor(this.t * 10) % art.chibiFrames('sport'), 0, 0));
      /* gauge */
      const gx = 120, gy = 190, gw = 400;
      UI.frame(c, gx - 10, gy - 30, gw + 20, 56, { fill: P.cream });
      C.text(c, `第${this.round + 1}走者 → バトン`, gx, gy - 24, { size: 12 });
      for (let i = 0; i < 3; i++) { const j = this.results[i]; c.fillStyle = P.ink; c.fillRect(gx + gw - 60 + i * 20, gy - 26, 14, 14); c.fillStyle = j == null ? '#e3d6bd' : ['#9a9ab8', P.sky2, P.mint2, P.lemon2][j]; c.fillRect(gx + gw - 59 + i * 20, gy - 25, 12, 12); }
      c.fillStyle = P.ink; c.fillRect(gx - 1, gy - 1, gw + 2, 18);
      c.fillStyle = '#f1e5c8'; c.fillRect(gx, gy, gw, 16);
      c.fillStyle = P.mint; c.fillRect(gx + Math.round(this.zone * gw), gy, Math.round(this.zoneW * gw), 16);
      c.fillStyle = P.lemon; c.fillRect(gx + Math.round((this.zone + this.zoneW * 0.32) * gw), gy, Math.round(this.zoneW * 0.36 * gw), 16);
      const cx = gx + Math.round(this.cur * gw);
      c.fillStyle = P.pink2; c.fillRect(cx - 2, gy - 6, 4, 28); c.fillStyle = P.ink; c.fillRect(cx - 4, gy - 8, 8, 3);
      if (this.state === 'intro') {
        UI.frame(c, 150, 70, 340, 76, { fill: P.cream, band: P.pink2, bandH: 20 });
        C.text(c, 'ルール', 320, 72, { size: 12, align: 'center', color: P.white, outline: P.ink });
        C.text(c, '動くバーが 緑のゾーンに 入ったら', 320, 98, { size: 12, align: 'center' });
        C.text(c, 'クリック / Zキーで バトンを渡せ！（3回）', 320, 116, { size: 12, align: 'center' });
        C.text(c, `運動 ${S.params.sport} → ゾーンの広さ UP`, 320, 222, { size: 12, align: 'center', color: P.ink2, alpha: 0.8 });
        C.text(c, 'クリックで スタート', 320, 300, { size: 16, align: 'center', color: P.white, outline: P.ink, alpha: 0.5 + 0.5 * Math.sin(this.t * 6) });
      }
      if (this.judge) {
        const J = [['ミス…', P.grey], ['おしい', P.sky2], ['GOOD!', P.mint2], ['PERFECT!!', P.lemon2]][this.judge.j];
        const s = 1 + Math.max(0, 1 - this.judge.t * 5) * 1.5;
        drawStamp(c, J[0], 320, 110, J[1], s, -0.08);
      }
      if (this.state === 'result' && this.res) {
        const k = this.res.k;
        c.fillStyle = `rgba(27,28,58,${0.4 * k})`; c.fillRect(0, 0, W, H);
        c.save(); c.translate(W / 2, 170); c.scale(k, k);
        UI.frame(c, -130, -60, 260, 120, { fill: this.place === 1 ? P.lemon : P.cream, band: P.pink2, bandH: 22 });
        C.text(c, 'リレー 結果', 0, -58, { size: 12, align: 'center', color: P.white, outline: P.ink });
        C.text(c, `${this.place}位`, 0, -30, { size: 44, align: 'center', head: true, color: P.pink2, outline: P.white, ow: 2 });
        C.text(c, this.place === 1 ? 'クラス 大よろこび！' : this.place <= 3 ? 'よく がんばった！' : '次は きっと…！', 0, 30, { size: 12, align: 'center' });
        c.restore();
      }
    }
  }
  async function sportsFlow(evName) {
    await runEventPart(evName, 'pre');
    msgHide(); clearActors();
    const sc = new SportsScene(); G.phase = 'sports';
    await runTrans(sc, 'blinds', 0.7);
    S.sports = { place: sc.place, pts: sc.results.reduce((a, b) => a + b, 0) };
    S.flags.sports_win = sc.place === 1; S.flags.sports_good = sc.place <= 2; S.flags.sports_lose = sc.place >= 3;
    applyEffect({ sport: sc.place === 1 ? 6 : 3, stress: sc.place === 1 ? -10 : -3 }, true);
    await runEventPart(evName, sc.place <= 2 ? 'win' : 'lose');
    await runEventPart(evName, 'post');
  }

  /* ================= events ================= */
  function eventRef(name) {
    const evs = D().events || {};
    let ev = evs[name];
    if (ev == null && D().scenes && D().scenes[name]) ev = name;
    return ev;
  }
  async function runEventPart(name, part) {
    const ev = eventRef(name);
    if (ev == null) return;
    let ref = null;
    if (typeof ev === 'string' || Array.isArray(ev)) { if (part === 'pre') ref = ev; }
    else if (typeof ev === 'object') {
      const alias = { pre: ['pre', 'before', 'scene', 'steps', 'intro', 'main'], good: ['good', 'win', 'success'], normal: ['normal', 'good'], bad: ['bad', 'lose', 'fail'], win: ['win', 'good'], lose: ['lose', 'bad'], post: ['post', 'after', 'outro'] }[part] || [part];
      for (const k of alias) if (ev[k] != null) { ref = ev[k]; break; }
      if (part === 'pre' && !ref && typeof ev.id === 'string') ref = ev.id;
      if (part !== 'pre' && !ref && D().scenes && D().scenes[`${name}_${part}`]) ref = `${name}_${part}`;
    }
    if (ref) { G.phase = 'event'; await runScript(ref); }
  }
  async function playEvent(name) {
    if (!name) return;
    const kindOf = n => /final/.test(n) ? 'final' : /mid/.test(n) ? 'midterm' : /exam|test/.test(n) ? 'midterm' : null;
    snd.bgm('school');
    STAGE.tint = 0;
    if (/exam|test|midterm|final_exam/.test(name) && name !== 'closing') { await examFlow(kindOf(name) || 'midterm', name); }
    else if (/sports/.test(name)) await sportsFlow(name);
    else { await runEventPart(name, 'pre'); await runEventPart(name, 'post'); }
    msgHide(); await hideActor('all');
  }

  /* ================= weekly systems ================= */
  async function paramMeets() {
    for (const id of boys()) {
      if (S.met[id]) continue;
      const m = chars()[id].meet || {};
      let trigger = false;
      if ((m.type === 'param' || m.param) && S.params[m.param] >= (m.value || 25)) trigger = true;
      if (m.type === 'event' && m.week != null && S.week >= m.week) trigger = true;
      if (m.type === 'event' && m.week == null && !calendar().some(c => c.event === m.id) && S.week >= 3) trigger = true;
      if (!trigger) continue;
      const sc = resolveSteps(m.scene) || (m.type !== 'event' || !calendar().some(c => c.event === m.id) ? resolveSteps(m.id) : null) || resolveSteps('meet_' + id);
      snd.bgm('school');
      if (sc) { G.phase = 'event'; await runScript(sc); }
      if (!S.met[id]) await meet(id);
      msgHide(); await hideActor('all');
    }
  }
  async function bombWarnings() {
    for (const id of S.pendingBoom.splice(0)) {
      snd.bgm('sad'); await setBg('hallway');
      await showActor(FRIEND, 'surprise', 'center');
      const steps = bombLine(id, 'boom') || [{ say: FRIEND, text: `た、たいへん！ ${givenName(id)}くんが「ほったらかしにされた」って 言ってて… 変なうわさが 広まってる！` }];
      snd.se('bomb'); C.shake(10, 0.6); C.flash('#ff9aa6', 0.5);
      await runScript(steps);
      for (const b of boys()) if (S.met[b]) S.aff[b] -= 15;
      S.stress += 20; S.hurt[id] = 30; S.lit[id] = false; clampS();
      C.toast('うわさが 広まった… みんなの ときめき -15', { icon: 'bomb', color: '#ffd6da' });
      snd.se('heart_break');
      await say(null, 'みんなの 視線が なんだか 冷たい……。（全員の ときめき度 -15・ストレス +20）');
      msgHide(); await hideActor('all');
    }
    for (const id of S.pendingWarn.splice(0)) {
      snd.bgm('tension'); await setBg('classroom');
      await showActor(FRIEND, 'think', 'center');
      snd.se('bomb_warn');
      const steps = bombLine(id, 'warn') || [{ say: FRIEND, text: `ねえ、${givenName(id)}くんのこと 最近 ほったらかしてない？ なんか 元気なかったよ。` }];
      await runScript(steps);
      await say(null, `${givenName(id)}の 傷心度が たまっている。デートに 誘って フォローしよう。`);
      C.toast(`${givenName(id)}に 爆弾が 点火した`, { icon: 'bomb_lit', color: '#ffd6da' });
      msgHide(); await hideActor('all');
    }
  }
  function updateHurt() {
    for (const id of boys()) {
      if (!S.met[id]) continue;
      const last = S.lastDate[id] != null ? S.lastDate[id] : (S.metWeek[id] || 1);
      const since = S.week - last;
      if (since >= 3 && S.aff[id] >= 10) S.hurt[id] += 11 + (S.aff[id] >= 40 ? 4 : 0);
      clampS();
      if (S.hurt[id] >= 100) S.pendingBoom.push(id);
      else if (S.hurt[id] >= 50 && !S.lit[id]) { S.lit[id] = true; S.pendingWarn.push(id); }
    }
  }
  async function randomEvent() {
    const list = (D().random || []).filter(r => r && !S.randomSeen.includes(r.id) && evalCond(r.cond || r.if));
    if (!list.length || Math.random() > (G.forceRandom ? 1 : 0.35)) return;
    const r = C.pick(list); S.randomSeen.push(r.id);
    snd.bgm(r.bgm || 'school'); G.phase = 'event';
    await runScript(r.scene || r.steps || r.id);
    msgHide(); await hideActor('all');
  }
  async function collapseFlow() {
    G.phase = 'collapse';
    snd.bgm('sad');
    await C.transition('fade', () => { clearActors(); STAGE.bg = 'bedroom_day'; }, 0.8);
    const sc = { name: 'collapse', t: 0, update(dt) { this.t += dt; }, draw(c) { c.fillStyle = 'rgba(27,28,58,0.35)'; c.fillRect(0, 0, W, H); UI.frame(c, 250, 60, 140, 110, { fill: P.cream }); scaled(c, 2, 320, 156, () => art.chibi(c, 'sick', Math.floor(this.t * 3) % art.chibiFrames('sick'), 0, 0)); } };
    C.push(sc); snd.se('fail'); C.shake(6, 0.4);
    await say(null, '体が 重い……。熱を 出して 倒れてしまった。');
    await say(null, '今週は 1週間 ずっと 寝込むことに なった……。');
    S.hp = 70; S.stress = Math.max(0, S.stress - 15); S.collapses++;
    for (const k in S.params) S.params[k] = Math.max(0, S.params[k] - 2);
    clampS();
    C.pop(320, 200, '体調 回復', P.green);
    msgHide(); C.remove(sc);
  }

  /* ================= report & ending ================= */
  function grade(v) { return v >= 90 ? 5 : v >= 60 ? 4 : v >= 35 ? 3 : v >= 18 ? 2 : 1; }
  function feelLine(id) {
    const ch = chars()[id] || {}; const ti = tierIdx(S.aff[id]);
    const src = (D().reportCard && D().reportCard[id]) || ch.feel || ch.report;
    if (Array.isArray(src)) return fmt(src[Math.min(ti, src.length - 1)]);
    if (src && typeof src === 'object') return fmt(src[TIERS[ti]] || src[ti] || '');
    return ['ただの クラスメイト、かな。', '話しやすい 友達だと 思ってる。', '一緒に いると 楽しい。夏休みも 会えたら いいな。', '……最近、つい 目で 追ってしまう。', '夏休み、ふたりで 出かけたい。……言えるかな。'][ti];
  }
  class ReportScene {
    constructor() { this.name = 'report'; this.t = 0; this.k = { v: 0 }; C.tween(this.k, { v: 1 }, 0.5, { ease: 'backOut' }); this.rows = 0; this.go = false; }
    async run() {
      snd.bgm('ending');
      await C.wait(0.5);
      const n = params().length + boys().filter(b => S.met[b]).length;
      for (let i = 0; i < n; i++) { this.rows = i + 1; snd.se('stamp'); await C.wait(G.fast ? 0.02 : 0.28); }
      await C.waitUntil(() => this.go); snd.se('decide'); this.close();
    }
    update(dt, active) { this.t += dt; if (active && this.rows > 0 && (inp.advance() || G.fast)) { inp.consume(); const n = params().length + boys().filter(b => S.met[b]).length; if (this.rows < n) this.rows = n; else this.go = true; } }
    draw(c) {
      popBg(c, '#fff4d6', '#ffecc0', this.t);
      const k = this.k.v;
      c.save(); c.translate(0, Math.round((1 - k) * 360));
      UI.frame(c, 16, 8, 608, 344, { fill: '#fffdf6', band: P.sky2, bandH: 26 });
      C.text(c, `通知表　1学期　1年　${PLAYER()}`, 30, 12, { size: 16, color: P.white, outline: P.ink, head: true });
      C.text(c, 'せいせき', 30, 42, { size: 12, color: P.ink2 });
      params().forEach((p, i) => {
        if (i >= this.rows) return;
        const y = 60 + i * 30, g = grade(S.params[p.id]);
        art.icon(c, p.id, 30, y, 16); C.text(c, p.name, 52, y + 1, { size: 16 });
        C.text(c, String(S.params[p.id]), 150, y + 1, { size: 16, align: 'right', color: P.ink2 });
        c.fillStyle = g >= 4 ? P.pink2 : g >= 3 ? P.sky2 : P.grey; c.beginPath(); c.arc(186, y + 9, 12, 0, 7); c.fill();
        C.text(c, String(g), 186, y + 1, { size: 16, align: 'center', color: '#fff', head: true });
      });
      c.fillStyle = 'rgba(43,45,92,0.2)'; c.fillRect(214, 44, 1, 290);
      const tops = params().slice().sort((a, b) => S.params[b.id] - S.params[a.id]);
      if (this.rows >= params().length) {
        const cm = { study: '授業態度が まじめで 成績も 伸びました。', sport: '体を動かすことに 積極的で、体育祭でも 活躍しました。', art: '感性が ゆたかで、作品づくりに 光るものが あります。', culture: '本をよく読み、ものの見方が 深まりました。', style: 'いつも 身だしなみが 整っていて、明るい印象です。' }[tops[0].id] || 'よく がんばりました。';
        C.wrap(c, `先生より: ${cm}`, 170, 12).forEach((l, i) => C.text(c, l, 30, 222 + i * 15, { size: 12, color: P.ink2 }));
        const ex = [S.exams.midterm ? `中間 ${S.exams.midterm}位` : '', S.exams.final ? `期末 ${S.exams.final}位` : ''].filter(Boolean).join(' / ');
        if (ex) C.text(c, ex, 30, 300, { size: 12 });
        if (S.sports) C.text(c, `体育祭リレー ${S.sports.place}位`, 30, 316, { size: 12 });
      }
      C.text(c, 'みんなの 気持ち', 226, 42, { size: 12, color: P.ink2 });
      const met = boys().filter(b => S.met[b]);
      met.forEach((id, i) => {
        if (params().length + i >= this.rows) return;
        const y = 58 + i * 70;
        c.fillStyle = P.ink; c.fillRect(225, y - 1, 50, 50); art.face(c, id, tierIdx(S.aff[id]) >= 3 ? 'blush' : tierIdx(S.aff[id]) >= 1 ? 'smile' : 'normal', 226, y, 48);
        C.text(c, charName(id), 284, y, { size: 16 });
        hearts(c, 400, y + 4, tierIdx(S.aff[id]) + 1); C.text(c, tierName(S.aff[id]), 450, y + 2, { size: 12, color: P.pink2 });
        C.wrap(c, `「${feelLine(id)}」`, 320, 12).slice(0, 2).forEach((l, j) => C.text(c, l, 284, y + 22 + j * 15, { size: 12, color: P.ink2 }));
      });
      if (!met.length) C.text(c, 'まだ だれとも 出会えなかった……', 240, 70, { size: 12, color: P.grey });
      if (this.rows >= params().length + met.length) C.text(c, 'クリックで つぎへ', 610, 334, { size: 12, align: 'right', color: P.pink2, alpha: 0.5 + 0.5 * Math.sin(this.t * 6) });
      c.restore();
    }
  }
  class EndCard {
    constructor() { this.name = 'endcard'; this.t = 0; this.a = { v: 0 }; C.tween(this.a, { v: 1 }, 1.2); }
    update(dt, active) {
      this.t += dt;
      if (Math.random() < dt * 4) C.burst('sparkle', C.rand(0, W), C.rand(0, 200), 1, { min: 0, max: 8 });
      if (active && this.t > 2 && (inp.advance() || G.fast)) { inp.consume(); snd.se('decide'); this.close(); }
    }
    draw(c) {
      art.bg(c, 'beach', this.t);
      c.fillStyle = 'rgba(255,246,224,0.15)'; c.fillRect(0, 0, W, H);
      const a = this.a.v;
      c.globalAlpha = a;
      const y = 90 + Math.round((1 - a) * 20);
      C.text(c, '夏休み編へ', 320, y, { size: 44, head: true, align: 'center', color: P.sky2, outline: P.white, ow: 3 });
      C.text(c, 'つづく', 320, y + 56, { size: 44, head: true, align: 'center', color: P.pink2, outline: P.white, ow: 3 });
      if (this.t > 1.2) {
        const b = Math.min(1, (this.t - 1.2) * 2);
        c.globalAlpha = b;
        UI.frame(c, 130, 238, 380, 68, { fill: 'rgba(255,246,224,0.95)', band: P.lemon2, bandH: 18 });
        C.text(c, 'NEXT', 144, 239, { size: 12, color: P.white, outline: P.ink });
        const best = boys().filter(x => S.met[x]).sort((x, y) => S.aff[y] - S.aff[x])[0];
        C.text(c, best ? `海、花火、夏祭り。${givenName(best)}との 夏が はじまる――？` : '海、花火、夏祭り。新しい 出会いの 夏が はじまる――？', 320, 262, { size: 12, align: 'center' });
        C.text(c, '体験版を 遊んでくれて ありがとう！', 320, 282, { size: 12, align: 'center', color: P.pink2 });
      }
      c.globalAlpha = 1;
      if (this.t > 2) C.text(c, 'クリックで タイトルへ', 320, 330, { size: 12, align: 'center', color: P.white, outline: P.ink, alpha: 0.5 + 0.5 * Math.sin(this.t * 5) });
    }
  }

  async function runTrans(sc, type, dur, color, clear) {
    let p;
    await C.transition(type, () => { if (clear === true || color === true) C.clearStack(StageScene); p = C.run(sc); if (sc.run) sc.run(); }, dur, typeof color === 'string' ? color : undefined);
    return p;
  }
  /* ================= main flow ================= */
  async function titleFlow() {
    for (;;) {
      G.phase = 'title';
      C.clearStack(StageScene); STAGE.bg = null; clearActors(); msgHide();
      snd.bgm('title');
      const r = await C.run(new TitleScene());
      if (r === 'new') { S = newState(); G.log = []; await C.transition('diamond', () => { }, 0.8); if (eventRef('prologue') != null) { G.phase = 'event'; await runEventPart('prologue', 'pre'); msgHide(); await hideActor('all'); } await gameFlow(false); }
      else if (r === 'continue') { const s = readSave(); if (!s) continue; S = Object.assign(newState(), s); await C.transition('iris', () => { }, 0.8); await gameFlow(true); }
    }
  }
  async function gameFlow(resumed) {
    while (S.week <= WEEKS()) {
      const cal = calOf(S.week);
      G.phase = 'weekcard';
      if (!resumed || S.eventsDone < S.week) {
        await C.run(new WeekCard(cal));
        S.calledThisWeek = false; S.restedThisWeek = false;
        STAGE.bg = null;

        await bombWarnings();
        const isClosing = cal.event === 'closing' || S.week === WEEKS();
        if (isClosing) { await closingFlow(cal); return; }
        if (cal.event) await playEvent(cal.event);
        if (!cal.event) await randomEvent();
        S.eventsDone = S.week;
      }
      resumed = false;
      msgHide(); clearActors();
      writeSave();
      if (S.hp < 20) {
        await collapseFlow();
      } else {
        G.phase = 'menu';
        snd.bgm('daily');
        const cmd = await C.run(new MenuScene());
        G.phase = 'exec';
        const ex = new ExecScene(cmd);
        await runTrans(ex, 'wipe', 0.5);
        if (boys().some(b => !S.met[b])) { STAGE.bg = null; await paramMeets(); STAGE.bg = null; }
        await weekendFlow();
      }
      updateHurt();
      S.week++;
    }
  }
  async function weekendFlow() {
    snd.bgm('daily');
    for (;;) {
      G.phase = 'weekend';
      const v = await C.run(new WeekendScene());
      if (v === 'phone') { await phoneFlow(); }
      else if (v === 'rest') {
        S.restedThisWeek = true; snd.se('pop_up');
        applyEffect({ hp: 18, stress: -14 }, true);
        C.toast('ゆっくり休んだ。体調 +18 ストレス -14', { icon: 'rest', color: P.mintL });
      }
      else if (v === 'status') { G.phase = 'status'; await C.run(new StatusScene()); }
      else if (v === 'save') { const ok = writeSave(); snd.se(ok ? 'camera' : 'cancel'); C.toast(ok ? 'セーブしました' : 'セーブできませんでした', { icon: 'save' }); }
      else break;
    }
    if (S.date) { STAGE.bg = null; await dateFlow(); }
    else { applyEffect({ hp: 6, stress: -4 }, true); }
    STAGE.bg = null; clearActors(); msgHide();
  }
  async function closingFlow(cal) {
    snd.bgm('school');
    await runEventPart(cal.event || 'closing', 'pre');
    await runEventPart(cal.event || 'closing', 'post');
    msgHide(); await hideActor('all');
    const met = boys().filter(b => S.met[b]).sort((a, b) => S.aff[a] - S.aff[b]);
    for (const id of met) {
      const e = D().endings && D().endings[id];
      const steps = e && e[tierIdx(S.aff[id])];
      if (steps) { G.curBoy = id; await runScript(steps); msgHide(); await hideActor('all'); }
    }
    G.curBoy = null;
    G.phase = 'report';
    const rs = new ReportScene();
    await runTrans(rs, 'blinds', 0.8);
    G.phase = 'end';
    snd.bgm('summer');
    const ec = new EndCard();
    await runTrans(ec, 'fade', 1.0, '#fff', true);
    clearSave();
    await C.transition('iris', () => { C.clearStack(StageScene); }, 0.8);
  }

  /* ================= boot ================= */
  async function boot() {
    C.start();
    loadSettings();
    C.onFirstInput(() => { if (window.SND) { try { SND.init(); applySettings(); } catch (e) { /* ignore */ } } });
    C.onOverlay = drawMsg;
    try { if (window.ART && ART.init) ART.init(); if (window.ART && ART.preload) ART.preload(); } catch (e) { warnOnce('ART.init', e); }
    const bootScene = { name: 'boot', t: 0, update(dt) { this.t += dt; }, draw(c) { c.fillStyle = P.ink; c.fillRect(0, 0, W, H); C.text(c, 'Now Loading' + '.'.repeat(1 + Math.floor(this.t * 3) % 3), 320, 172, { size: 16, align: 'center', color: P.cream }); } };
    C.push(bootScene);
    try { if (document.fonts) await Promise.race([Promise.all([document.fonts.load('16px "DotGothic16"'), document.fonts.load('800 22px "M PLUS Rounded 1c"')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* ignore */ }
    C.remove(bootScene);
    C.push(StageScene);
    titleFlow();
  }

  /* QA hooks */
  window.__game = {
    get state() { return S; }, G,
    phase: () => G.phase,
    fast(on, scale) { G.fast = !!on; C.timeScale = on ? (scale || 6) : 1; },
    scenes: () => C.stack.map(s => s.name || '?'),
    buttons() {
      const top = C.top(); if (!top || C.busy()) return [];
      const g = top.group; if (!g || g.active === false) return [];
      return g.buttons.filter(b => b.visible && b.enabled).map(b => { const p = C.toScreen(b.x + b.w / 2, b.y + b.h / 2); return { label: b.label || (b.cid ? charName(b.cid) : b.place ? b.place.name : b.cmd ? b.cmd.name : ''), id: (b.cmd && b.cmd.id) || b.cid || (b.place && b.place.id) || '', x: p.x, y: p.y }; });
    },
    busy: () => C.busy(),
    toScreen: (x, y) => C.toScreen(x, y),
    setState(o) { Object.assign(S, o); },
    forceRandom(v) { G.forceRandom = v; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
