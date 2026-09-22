/* 指の わざ。
   ・ステージ … 1本で うごかす、2本で 大きさと かたむき
   ・どこでも … 2本指トン＝もどす、3本指トン＝やりなおし
   ・タイムライン … 2本指で つまんで 時間じくを のばす／ちぢめる */
import { S, clamp, findClip, selected, snap as pushUndo, buzz } from '../state.js?v=4';
import { clipBox } from '../render.js?v=4';
import { bus } from '../bus.js?v=4';

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

/* ---------- ステージの 中で じかに ---------- */
export function attachStage(cv) {
  const pts = new Map();
  let st = null;

  const toStage = e => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (S.W / r.width), y: (e.clientY - r.top) * (S.H / r.height) };
  };
  const two = () => {
    const [a, b] = [...pts.values()];
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      a: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2
    };
  };
  const target = () => {
    const f = selected();
    if (!f || f.c.kind === 'audio') return null;
    if (S.time < f.c.start || S.time >= f.c.start + f.c.dur) return null;
    return f.c;
  };
  const hit = p => {
    // 上の 段から さがして、さわった ところに ある ふだを えらぶ
    for (const tr of S.tracks) {
      if (tr.hidden || tr.kind === 'audio') continue;
      for (const c of tr.clips) {
        if (S.time < c.start || S.time >= c.start + c.dur) continue;
        const { w, h } = clipBox(c);
        const dx = p.x - (S.W / 2 + c.x), dy = p.y - (S.H / 2 + c.y);
        const a = -c.rot * Math.PI / 180;
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2) return c;
      }
    }
    return null;
  };

  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    pts.set(e.pointerId, toStage(e));
    if (pts.size === 1) {
      const p = [...pts.values()][0];
      const c = target() && insideOf(target(), p) ? target() : hit(p);
      if (c) { S.sel = c.id; bus.all(); }
      st = c ? { c, p, x0: c.x, y0: c.y, s0: c.scale, r0: c.rot, moved: false } : null;
    } else if (pts.size === 2 && st) {
      const t = two();
      st.pinch = { d: t.d, a: t.a, s0: st.c.scale, r0: st.c.rot };
    }
  });
  function insideOf(c, p) {
    const { w, h } = clipBox(c);
    const dx = p.x - (S.W / 2 + c.x), dy = p.y - (S.H / 2 + c.y);
    const a = -c.rot * Math.PI / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2;
  }

  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, toStage(e));
    if (!st) return;
    if (pts.size >= 2 && st.pinch) {
      const t = two();
      st.c.scale = clamp(st.pinch.s0 * (t.d / (st.pinch.d || 1)), .05, 8);
      st.c.rot = st.pinch.r0 + (t.a - st.pinch.a) * 180 / Math.PI;
      st.moved = true;
    } else {
      const p = [...pts.values()][0];
      st.c.x = st.x0 + (p.x - st.p.x);
      st.c.y = st.y0 + (p.y - st.p.y);
      if (Math.hypot(p.x - st.p.x, p.y - st.p.y) > 4) st.moved = true;
    }
    bus.stage();
  });

  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0 && st) {
      if (st.moved) { pushUndo(); bus.panel(); }
      st = null;
    } else if (st) { st.pinch = null; }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
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
