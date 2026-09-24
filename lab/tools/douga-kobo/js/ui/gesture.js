/* 指の わざ。
   ・ステージ … 1本で うごかす、2本で 大きさと かたむき
   ・どこでも … 2本指トン＝もどす、3本指トン＝やりなおし
   ・タイムライン … 2本指で つまんで 時間じくを のばす／ちぢめる */
import { S, clamp, findClip, selected, snap as pushUndo, buzz } from '../state.js?v=64';
import { clipBox, handlePoints, toProject, panView, zoomAt, charSpots } from '../render.js?v=64';
import { setOff, offOf } from '../text.js?v=64';
import { bus } from '../bus.js?v=64';

const TAP_MS = 360;     // これより 長く さわって いたら トンでは ない
const TAP_SLOP = 18;    // これくらいの ずれなら 止まって いたと みなす

/* ---------- 2本・3本指の トン ---------- */
export function attachTaps(undo, redo) {
  const pts = new Map();
  let gest = null;
  const reset = () => { if (!pts.size) gest = null; };

  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (!gest) gest = { t0: performance.now(), max: 1, moved: false, ok: true };
    gest.max = Math.max(gest.max, pts.size);
    // 字を 打って いる ときは ねらわない
    if (e.target.closest && e.target.closest('input,textarea,select')) gest.ok = false;
  }, true);

  document.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p || !gest) return;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_SLOP) gest.moved = true;
  }, true);

  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size || !gest) { reset(); return; }
    const dt = performance.now() - gest.t0;
    if (gest.ok && !gest.moved && dt < TAP_MS) {
      if (gest.max === 2) { undo(); buzz(14); }
      else if (gest.max >= 3) { redo(); buzz(14); }
    }
    gest = null;
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}

/* ---------- ステージの 中で じかに ----------
   アニメ工房と 同じ さわりごこち：
     ・1本指 … ふだを えらぶ／うごかす。なにも 無い ところなら 画面ごと ずらす
     ・四すみの つまみ … 大きさと かたむき
     ・2本指 … 画面を ずらす・つまんで 大きく／小さく */
export function attachStage(cv) {
  const pts = new Map();
  let st = null, pinch = null;

  const target = () => {
    const f = selected();
    if (!f || f.c.kind === 'audio') return null;
    if (S.time < f.c.start || S.time >= f.c.start + f.c.dur) return null;
    return f.c;
  };
  const inside = (c, p) => {
    const { w, h } = clipBox(c);
    const dx = p.x - (S.W / 2 + c.x), dy = p.y - (S.H / 2 + c.y);
    const a = -c.rot * Math.PI / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2;
  };
  const hit = (p) => {
    for (const tr of S.tracks) {
      if (tr.hidden || tr.kind === 'audio') continue;
      for (const c of tr.clips) {
        if (S.time < c.start || S.time >= c.start + c.dur) continue;
        if (inside(c, p)) return c;
      }
    }
    return null;
  };
  const grabHandle = (e) => {
    const c = target();
    if (!c) return null;
    const near = handlePoints(c).find(h =>
      Math.hypot(h.x - (e.clientX - cv.getBoundingClientRect().left),
                 h.y - (e.clientY - cv.getBoundingClientRect().top)) < 26);
    return near || null;
  };
  const two = () => {
    const [a, b] = [...pts.values()];
    return {
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
      d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
    };
  };

  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {
      st = null;
      const t = two();
      pinch = { d: t.d, cx: t.cx, cy: t.cy };
      return;
    }
    if (pts.size > 2) return;

    /* 1文字ずつ いじる ときは、まず 字を つかむ */
    const cT = target();
    if (cT && cT.kind === 'text' && cT.text.charOn) {
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 1e9;
      charSpots(cT).forEach(sp => {
        const d = Math.hypot(sp.sx - mx, sp.sy - my);
        const reach = Math.max(22, Math.max(sp.sw, sp.sh) * .7);
        if (d < reach && d < bd) { bd = d; best = sp; }
      });
      if (best) {
        S.selChar = best.idx;
        const p = toProject(e.clientX, e.clientY);
        const o = offOf(cT.text, best.idx);
        st = {
          mode: 'char', c: cT, idx: best.idx, p,
          x0: o.x, y0: o.y, moved: false
        };
        bus.all();
        return;
      }
    }

    const h = grabHandle(e);
    if (h) {
      const c = target();
      const p = toProject(e.clientX, e.clientY);
      const cxp = S.W / 2 + c.x, cyp = S.H / 2 + c.y;
      st = {
        mode: 'handle', c,
        d0: Math.max(1, Math.hypot(p.x - cxp, p.y - cyp)),
        a0: Math.atan2(p.y - cyp, p.x - cxp),
        s0: c.scale, r0: c.rot, moved: false
      };
      return;
    }
    const p = toProject(e.clientX, e.clientY);
    const c = (target() && inside(target(), p)) ? target() : hit(p);
    if (c) {
      if (S.sel !== c.id) { S.sel = c.id; S.selChar = null; bus.all(); }
      st = { mode: 'move', c, p, x0: c.x, y0: c.y, moved: false };
    } else {
      st = { mode: 'pan', sx: e.clientX, sy: e.clientY, moved: false };
    }
  });

  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2 && pinch) {
      const t = two();
      zoomAt(t.cx, t.cy, t.d / pinch.d);
      panView(t.cx - pinch.cx, t.cy - pinch.cy);
      pinch = { d: t.d, cx: t.cx, cy: t.cy };
      bus.stage();
      return;
    }
    if (!st) return;

    if (st.mode === 'pan') {
      panView(e.clientX - st.sx, e.clientY - st.sy);
      st.sx = e.clientX; st.sy = e.clientY;
      st.moved = true;
      bus.stage();
      return;
    }
    if (st.mode === 'char') {
      const p = toProject(e.clientX, e.clientY);
      const T = st.c.text;
      const sc = Math.max(.01, st.c.scale * T.size);
      const a = -st.c.rot * Math.PI / 180;
      const dx = p.x - st.p.x, dy = p.y - st.p.y;
      setOff(T, st.idx, {
        x: st.x0 + (dx * Math.cos(a) - dy * Math.sin(a)) / sc,
        y: st.y0 + (dx * Math.sin(a) + dy * Math.cos(a)) / sc
      });
      st.moved = true;
      bus.stage();
      return;
    }
    if (st.mode === 'handle') {
      const p = toProject(e.clientX, e.clientY);
      const cxp = S.W / 2 + st.c.x, cyp = S.H / 2 + st.c.y;
      const d = Math.max(1, Math.hypot(p.x - cxp, p.y - cyp));
      const a = Math.atan2(p.y - cyp, p.x - cxp);
      st.c.scale = clamp(st.s0 * (d / st.d0), .03, 12);
      if (!e.shiftKey) st.c.rot = st.r0 + (a - st.a0) * 180 / Math.PI;
      st.moved = true;
      bus.stage();
      return;
    }
    // うごかす
    const p = toProject(e.clientX, e.clientY);
    st.c.x = st.x0 + (p.x - st.p.x);
    st.c.y = st.y0 + (p.y - st.p.y);
    if (Math.abs(p.x - st.p.x) > 2 || Math.abs(p.y - st.p.y) > 2) st.moved = true;
    bus.stage();
  });

  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && st) {
      if (st.moved && st.mode !== 'pan') { pushUndo(); bus.panel(); }
      st = null;
    }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  // マウスの ホイールでも 大きく／小さく
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    bus.stage();
  }, { passive: false });
}

/* ---------- タイムラインの つまみズーム ---------- */
export function attachPinchZoom(scroll, onZoom, xToT) {
  const pts = new Map();
  let start = null;
  scroll.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const r = scroll.getBoundingClientRect();
      start = {
        d: Math.abs(a - b), pps: S.pps,
        at: xToT((a + b) / 2 - r.left + scroll.scrollLeft)
      };
      bus.cancelDrag();
    }
  }, true);
  scroll.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 2 && start) {
      const [a, b] = [...pts.values()];
      const d = Math.abs(a - b);
      if (start.d > 8) onZoom(start.pps * (d / start.d), start.at);
    }
  }, true);
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) start = null; };
  scroll.addEventListener('pointerup', up, true);
  scroll.addEventListener('pointercancel', up, true);

  // マウスの ホイール（PCで つかう とき）
  scroll.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = scroll.getBoundingClientRect();
      onZoom(S.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), xToT(e.clientX - r.left + scroll.scrollLeft));
    } else if (e.shiftKey) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
  }, { passive: false });
}
