/* haani-motion.js — はぁにデザイン用のちいさな動きの道具箱
   依存なし・ビルドなし。<script src="haani-motion.js"> で HM が生える。
   仕様は ~/.claude/skills/haani-motion/SKILL.md */
(function (root) {
  'use strict';

  var reduced = false;
  try {
    var mq = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = mq.matches;
    mq.addEventListener ? mq.addEventListener('change', function (e) { reduced = e.matches; })
                        : mq.addListener(function (e) { reduced = e.matches; });
  } catch (e) {}

  /* バネ。damping=跳ね返り(1.0で跳ねない) / response=速さ(秒)。
     to() は今の値と今の速度から再ターゲットするので、途中で何度でも呼べる。 */
  function spring(opt) {
    var value = opt.from || 0,
        target = value,
        vel = opt.velocity || 0,
        damping = opt.damping == null ? 1.0 : opt.damping,
        response = opt.response == null ? 0.4 : opt.response,
        onUpdate = opt.onUpdate || function () {},
        onRest = opt.onRest || null,
        eps = opt.epsilon == null ? 0.01 : opt.epsilon,
        raf = 0, last = 0;

    function emit() { onUpdate(value, vel); }

    function tick(now) {
      var dt = Math.min((now - last) / 1000, 1 / 30); // タブ復帰時に飛ばさない
      last = now;
      var w = 2 * Math.PI / response, k = w * w, c = 2 * damping * w;
      var steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
      for (var i = 0; i < steps; i++) {
        vel += (-k * (value - target) - c * vel) * h;
        value += vel * h;
      }
      if (Math.abs(value - target) < eps && Math.abs(vel) < eps * 10) {
        value = target; vel = 0; raf = 0; emit();
        if (onRest) onRest(value);
        return;
      }
      emit();
      raf = requestAnimationFrame(tick);
    }

    var api = {
      /* 目標へ。opt で velocity(px/s) / damping / response をその場で上書きできる */
      to: function (t, o) {
        o = o || {};
        target = t;
        if (o.velocity != null) vel = o.velocity;
        if (o.damping != null) damping = o.damping;
        if (o.response != null) response = o.response;
        if (reduced) { api.set(t); if (onRest) onRest(value); return api; }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
        return api;
      },
      /* 掴んだ瞬間に呼ぶ。現在値はそのまま残る（＝見た目から続けられる） */
      stop: function () { if (raf) cancelAnimationFrame(raf); raf = 0; vel = 0; return api; },
      /* 指で動かしている最中はこれで直接入れる */
      set: function (v, velocity) {
        api.stop(); value = target = v;
        if (velocity != null) vel = velocity;
        emit(); return api;
      }
    };
    Object.defineProperty(api, 'value', { get: function () { return value; } });
    Object.defineProperty(api, 'velocity', { get: function () { return vel; } });
    Object.defineProperty(api, 'animating', { get: function () { return !!raf; } });
    return api;
  }

  /* 放り投げた先。離した位置ではなくここの最寄りに吸わせる */
  function project(v, d) {
    d = d == null ? 0.998 : d;
    return (v / 1000) * d / (1 - d);
  }

  /* 端の抵抗。押すほど効く */
  function rubberband(over, size, c) {
    c = c == null ? 0.55 : c;
    return (over * size * c) / (size + c * Math.abs(over));
  }

  /* {x?,y?,t} の履歴から px/s。直近 window ms ぶんだけ見る */
  function velocity(hist, axis, win) {
    axis = axis || 'y'; win = win || 100;
    if (!hist || hist.length < 2) return 0;
    var last = hist[hist.length - 1], first = last;
    for (var i = hist.length - 2; i >= 0; i--) {
      if (last.t - hist[i].t > win) break;
      first = hist[i];
    }
    var dt = last.t - first.t;
    return dt > 0 ? (last[axis] - first[axis]) / dt * 1000 : 0;
  }

  /* 履歴バッファ。pointermove ごとに push するだけ */
  function tracker(cap) {
    var h = [];
    return {
      list: h,
      push: function (x, y) { h.push({ x: x, y: y, t: performance.now() }); if (h.length > (cap || 8)) h.shift(); },
      clear: function () { h.length = 0; },
      vx: function () { return velocity(h, 'x'); },
      vy: function () { return velocity(h, 'y'); }
    };
  }

  /* いちばん近い吸着点 */
  function nearest(v, points) {
    var best = points[0], d = Infinity;
    for (var i = 0; i < points.length; i++) {
      var n = Math.abs(points[i] - v);
      if (n < d) { d = n; best = points[i]; }
    }
    return best;
  }

  root.HM = {
    spring: spring, project: project, rubberband: rubberband,
    velocity: velocity, tracker: tracker, nearest: nearest,
    get reduced() { return reduced; }
  };
})(window);
