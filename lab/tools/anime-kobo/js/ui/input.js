/* 指・ペン・マウスを Pointer Events で一本化して扱う。
   ・1本 …… レイヤーを選ぶ / つかんで動かす / ハンドルで大きさ・回転
   ・2本 …… 画面そのものを動かす（ピンチとパン）
   長押し 400ms で「つかんだ」ことを振動で返す。 */

const LONG_PRESS = 400;
const DRAG_SLOP = 6;      // これ以上動いたらドラッグ開始

export function attachInput(el, handlers){
  const pts = new Map();          // pointerId -> {x,y,x0,y0}
  let mode = null;                // 'maybe' | 'drag' | 'pinch'
  let longTimer = null;
  let pinch0 = null;
  let grabbed = false;

  const pos = (e) => {
    const r = el.getBoundingClientRect();
    const dpr = el.width / r.width;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  };

  const clearLong = () => { if(longTimer){ clearTimeout(longTimer); longTimer = null; } };

  const twoFingers = () => {
    const [a, b] = [...pts.values()];
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      d: Math.hypot(a.x - b.x, a.y - b.y)
    };
  };

  el.addEventListener('pointerdown', (e) => {
    // 捕まえられない場合（合成イベントなど）もあるので落ちないようにする
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    const p = pos(e);
    pts.set(e.pointerId, { ...p, x0: p.x, y0: p.y });

    if(pts.size === 2){
      // 2本目が来たら、1本目のドラッグはやめて画面操作に切り替える
      clearLong();
      if(mode === 'drag' && handlers.onDragEnd) handlers.onDragEnd(true);
      grabbed = false;
      mode = 'pinch';
      pinch0 = twoFingers();
      if(handlers.onPinchStart) handlers.onPinchStart(pinch0);
      return;
    }
    if(pts.size > 2) return;

    mode = 'maybe';
    grabbed = false;
    if(handlers.onDown) handlers.onDown(p, e);

    clearLong();
    longTimer = setTimeout(() => {
      longTimer = null;
      if(mode !== 'maybe') return;
      grabbed = true;
      mode = 'drag';
      if(navigator.vibrate) navigator.vibrate(12);
      if(handlers.onDragStart) handlers.onDragStart(p, true);
    }, LONG_PRESS);
  });

  el.addEventListener('pointermove', (e) => {
    const rec = pts.get(e.pointerId);
    if(!rec) return;
    const p = pos(e);
    rec.x = p.x; rec.y = p.y;

    if(mode === 'pinch' && pts.size >= 2){
      const now = twoFingers();
      if(handlers.onPinch) handlers.onPinch(now, pinch0);
      return;
    }
    if(mode === 'maybe'){
      if(Math.hypot(p.x - rec.x0, p.y - rec.y0) > DRAG_SLOP){
        clearLong();
        mode = 'drag';
        if(handlers.onDragStart) handlers.onDragStart({ x: rec.x0, y: rec.y0 }, false);
      } else return;
    }
    if(mode === 'drag' && handlers.onDrag) handlers.onDrag(p, { x: rec.x0, y: rec.y0 });
    if(handlers.onHover) handlers.onHover(p);
  });

  const up = (e) => {
    const rec = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    clearLong();

    if(mode === 'pinch'){
      if(pts.size < 2){
        if(handlers.onPinchEnd) handlers.onPinchEnd();
        mode = pts.size === 1 ? 'maybe' : null;
        // 残った指の基準位置を今の場所に取り直す（急に飛ばないように）
        for(const r of pts.values()){ r.x0 = r.x; r.y0 = r.y; }
      }
      return;
    }
    if(mode === 'drag'){
      if(handlers.onDragEnd) handlers.onDragEnd(false);
    } else if(mode === 'maybe' && rec){
      if(handlers.onTap) handlers.onTap({ x: rec.x, y: rec.y });
    }
    if(pts.size === 0){ mode = null; grabbed = false; }
  };

  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', (e) => { if(pts.has(e.pointerId)) up(e); });

  // マウスホイールで拡大（PC用）
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if(handlers.onWheel) handlers.onWheel(pos(e), e.deltaY);
  }, { passive:false });

  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    // 手元での動作確認用に、いまの状態を見えるようにしておく
    peek: () => ({ mode, pointers: pts.size, grabbed }),
    isGrabbed: () => grabbed,
    reset(){ pts.clear(); mode = null; grabbed = false; clearLong(); }
  };
}
