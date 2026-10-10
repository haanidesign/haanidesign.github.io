/* 🦴 骨モード（ステージの 上で 骨を 組む・動かす）。

   道具（下の 帯）
     ✋ 動かす   … 骨の 先を つまむと 回る、根もとの 骨は ずらせる。いまの 時こくに キーが 入る
     📐 組み立て … 骨の 場所・向き・長さを 直す（キーは 入らない。絵は その場に のこる）
     ➕ 骨を足す … えらんだ 骨から 引っぱると 子の 骨が できる
     🔗 つける   … パーツを おして、つぎに 骨を おすと、その 骨に まるごと つく
   ボタン
     🕸 しならせる … 自動ウェイト（えらんだ パーツ、なければ ぜんぶ）
     🗑 骨を けす

   骨の 上・先の まる を おした ときだけ ここで うけとる。
   それ以外（2本指の ズーム など）は ステージに そのまま 通す。
   ➕ と 🔗 の ときは 1本指は ぜんぶ ここで うけとる。 */
import { S, edit, beginEdit, commitEdit, onChange, selected } from '../state.js?v=352';
import { computeAll } from '../engine/layer.js?v=352';
import { setPin } from '../engine/anim.js?v=352';
import { M } from './core.js?v=352';
import { isHone, setupPose, honePose, rebind, addBoneAt, removeBone, autoWeigh, boneCh, keyedValue } from './hone.js?v=352';

const INK = '#1E1C14', YEL = '#E1DD60', PAPER = '#FFFEF7', PINK = '#F2A0B8';

export function createHoneUI({ canvas, bar, toast, redraw }){
  let tool = 'pose';
  let selBone = 'root', selSlot = null;
  let drag = null;           // { kind, ... }
  let preview = null;        // 骨を 足す ときの 線

  const layer = () => { const l = selected(); return isHone(l) ? l : null; };
  const on = () => !!S.honeMode;

  /* ---- ざひょう ---- */
  function honeToProj(l){
    const e = computeAll(S.proj, S.time)[l.id];
    if(!e) return null;
    const pv = l.pivot || { x: .5, y: .5 };
    return M.mul(e.m, { a: 1, b: 0, c: 0, d: 1, tx: -l.pw * pv.x, ty: -l.ph * pv.y });
  }
  function toHone(l, e){
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const cx = (e.clientX - r.left) * k, cy = (e.clientY - r.top) * k;
    const px = (cx - S.view.x) / S.view.z, py = (cy - S.view.y) / S.view.z;
    const m = honeToProj(l);
    if(!m) return null;
    const iv = M.inv(m);
    return { ...M.apply(iv, px, py), sc: S.view.z * Math.hypot(m.a, m.b) / k };   // sc … 骨の 1 が 画面の 何px か
  }
  const poseNow = (l) => tool === 'setup' || tool === 'add' ? setupPose(l.hone) : honePose(l, S.time);

  /* ---- 当たり ---- */
  function hitBone(l, p){
    const pose = poseNow(l);
    const R = 16 / p.sc;
    let best = null, bd = 1e9;
    for(const b of l.hone.bones){
      const w = pose[b.id] && pose[b.id].world; if(!w) continue;
      const tip = M.apply(w, b.len, 0);
      const dt = Math.hypot(p.x - tip.x, p.y - tip.y);
      if(dt < R && dt < bd){ bd = dt; best = { b, part: 'tip', w, tip }; }
    }
    if(best) return best;
    for(const b of l.hone.bones){
      const w = pose[b.id] && pose[b.id].world; if(!w) continue;
      const tip = M.apply(w, b.len, 0);
      const d = segDist(p.x, p.y, w.tx, w.ty, tip.x, tip.y);
      if(d < R * 0.8 && d < bd){ bd = d; best = { b, part: 'body', w, tip }; }
    }
    return best;
  }
  function hitSlot(l, p){
    const pose = poseNow(l);
    for(let i = l.hone.slots.length - 1; i >= 0; i--){
      const s = l.hone.slots[i];
      if(s.visible === false) continue;
      const xy = deformed(s, pose);
      for(let t = 0; t < s.tris.length; t += 3){
        const a = s.tris[t], b = s.tris[t + 1], c = s.tris[t + 2];
        if(inTri(p.x, p.y, xy[a*2], xy[a*2+1], xy[b*2], xy[b*2+1], xy[c*2], xy[c*2+1])) return s;
      }
    }
    return null;
  }

  /* ---- 指 ---- */
  let pointers = 0;
  function down(e){
    pointers++;
    if(!on() || pointers > 1 || e.button > 0) return;
    const l = layer();
    if(!l) return;
    const p = toHone(l, e);
    if(!p) return;
    if(tool === 'add'){
      grab(e);
      const sp = setupPose(l.hone)[selBone];
      /* えらんだ 骨の 先の 近くから 引くと、そこから 生える */
      let a = { x: p.x, y: p.y };
      if(sp){
        const b = l.hone.bones.find(x => x.id === selBone);
        const tip = M.apply(sp.world, b.len, 0);
        if(Math.hypot(tip.x - p.x, tip.y - p.y) < 24 / p.sc) a = tip;
      }
      drag = { kind: 'add', a, l };
      preview = { a, b: a };
      return;
    }
    if(tool === 'bind'){
      grab(e);
      const hb = hitBone(l, p);
      if(hb && selSlot){
        const s = l.hone.slots.find(x => x.id === selSlot);
        if(s){
          edit('パーツを 骨に つける', () => {
            s.bone = hb.b.id;
            s.verts.forEach(v => { v.w = [{ b: hb.b.id, w: 1 }]; });
            rebind(l);
          });
          toast('「' + s.name + '」を「' + hb.b.name + '」に つけました');
          selBone = hb.b.id; selSlot = null; onChange(); return;
        }
      }
      const s = hitSlot(l, p);
      selSlot = s ? s.id : null;
      toast(s ? '「' + s.name + '」。つぎに つける 骨を おしてね' : 'パーツを おしてね');
      redraw(); return;
    }
    const hb = hitBone(l, p);
    if(!hb) return;                       // 骨の 外は ステージに まかせる
    grab(e);
    selBone = hb.b.id;
    const b = hb.b;
    const ang0 = Math.atan2(p.y - hb.w.ty, p.x - hb.w.tx) * 180 / Math.PI;
    if(tool === 'setup'){
      beginEdit('骨を 組み立てる');
      const pw = parentWorld(l, b, true);
      drag = { kind: hb.part === 'tip' ? 'srot' : 'smove', l, b, p0: p, ang0, rot0: b.rot, len0: b.len,
               x0: b.x, y0: b.y, ipw: M.inv(pw), org: { x: hb.w.tx, y: hb.w.ty } };
    } else {
      beginEdit('骨を 動かす');
      const isRoot = !b.parent;
      if(hb.part === 'body' && isRoot){
        const pw = parentWorld(l, b, false);
        drag = { kind: 'pmove', l, b, p0: p, ipw: M.inv(pw),
                 x0: keyedValue(l, b.id, 'x', S.time), y0: keyedValue(l, b.id, 'y', S.time) };
      } else {
        drag = { kind: 'prot', l, b, ang0, rot0: keyedValue(l, b.id, 'rot', S.time), org: { x: hb.w.tx, y: hb.w.ty } };
      }
    }
    redraw();
  }
  function move(e){
    if(!drag) return;
    grab(e);
    const l = drag.l, p = toHone(l, e);
    if(!p) return;
    if(drag.kind === 'add'){ preview = { a: drag.a, b: p }; redraw(); return; }
    const ang = Math.atan2(p.y - drag.org?.y, p.x - drag.org?.x) * 180 / Math.PI;
    let da = ang - drag.ang0;
    while(da > 180) da -= 360; while(da < -180) da += 360;
    if(drag.kind === 'srot'){
      drag.b.rot = drag.rot0 + da;
      drag.b.len = Math.max(8, Math.hypot(p.x - drag.org.x, p.y - drag.org.y));
      rebind(l);
    } else if(drag.kind === 'smove'){
      const d = linear(drag.ipw, p.x - drag.p0.x, p.y - drag.p0.y);
      drag.b.x = drag.x0 + d.x; drag.b.y = drag.y0 + d.y;
      rebind(l);
    } else if(drag.kind === 'prot'){
      setPin(l, boneCh(drag.b.id, 'rot'), S.time, +(drag.rot0 + da).toFixed(2), 'smooth');
    } else if(drag.kind === 'pmove'){
      const d = linear(drag.ipw, p.x - drag.p0.x, p.y - drag.p0.y);
      setPin(l, boneCh(drag.b.id, 'x'), S.time, +(drag.x0 + d.x).toFixed(2), 'smooth');
      setPin(l, boneCh(drag.b.id, 'y'), S.time, +(drag.y0 + d.y).toFixed(2), 'smooth');
    }
    redraw();
  }
  function up(e){
    pointers = Math.max(0, pointers - 1);
    if(!drag) return;
    grab(e);
    const d = drag; drag = null;
    if(d.kind === 'add'){
      preview = null;
      const p = toHone(d.l, e);
      if(p && Math.hypot(p.x - d.a.x, p.y - d.a.y) * p.sc > 12){
        let nb = null;
        edit('骨を 足す', () => { nb = addBoneAt(d.l, selBone || 'root', d.a.x, d.a.y, p.x, p.y); });
        selBone = nb.id;
        toast('骨を 足しました。つづけて 引くと その 先に つながります');
      } else {
        /* トンと おしただけ … 骨を えらぶ */
        const hb = p && hitBone(d.l, p);
        if(hb){ selBone = hb.b.id; toast('「' + hb.b.name + '」から 生やします'); }
      }
      onChange(); redraw(); return;
    }
    commitEdit();
    onChange();
  }
  const grab = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  canvas.addEventListener('pointerdown', down, { capture: true });
  canvas.addEventListener('pointermove', move, { capture: true });
  canvas.addEventListener('pointerup', up, { capture: true });
  canvas.addEventListener('pointercancel', (e) => { pointers = Math.max(0, pointers - 1); if(drag){ drag = null; preview = null; commitEdit(); redraw(); } }, { capture: true });

  function parentWorld(l, b, setup){
    if(!b.parent) return M.ident();
    const pose = setup ? setupPose(l.hone) : honePose(l, S.time);
    return pose[b.parent] ? pose[b.parent].world : M.ident();
  }

  /* ---- 骨を 描く（ステージの 上に かさねる） ---- */
  function draw(ctx){
    if(!on()) return;
    const l = layer();
    if(!l) return;
    const m = honeToProj(l);
    if(!m) return;
    const v = S.view;
    const T = M.mul({ a: v.z, b: 0, c: 0, d: v.z, tx: v.x, ty: v.y }, m);
    const k = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
    const pose = poseNow(l);
    const P = (x, y) => M.apply(T, x, y);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineJoin = 'round';
    /* えらんだ パーツの ふち */
    if(selSlot){
      const s = l.hone.slots.find(x => x.id === selSlot);
      if(s){
        const xy = deformed(s, pose);
        ctx.beginPath();
        for(let t = 0; t < s.tris.length; t += 3){
          for(let j = 0; j < 3; j++){
            const q = P(xy[s.tris[t + j] * 2], xy[s.tris[t + j] * 2 + 1]);
            j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
          }
          ctx.closePath();
        }
        ctx.strokeStyle = PINK; ctx.lineWidth = 1.5 * k; ctx.stroke();
      }
    }
    for(const b of l.hone.bones){
      const w = pose[b.id] && pose[b.id].world; if(!w) continue;
      const o = P(w.tx, w.ty), tp = M.apply(w, b.len, 0), t = P(tp.x, tp.y);
      const dx = t.x - o.x, dy = t.y - o.y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L, wd = Math.min(12 * k, L * 0.18);
      const mx = o.x + dx * 0.18, my = o.y + dy * 0.18;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y); ctx.lineTo(mx + nx * wd, my + ny * wd); ctx.lineTo(t.x, t.y); ctx.lineTo(mx - nx * wd, my - ny * wd); ctx.closePath();
      ctx.fillStyle = b.id === selBone ? YEL : 'rgba(255,254,247,.85)';
      ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5 * k; ctx.stroke();
      ctx.beginPath(); ctx.arc(o.x, o.y, 4.5 * k, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      ctx.beginPath(); ctx.arc(t.x, t.y, 6 * k, 0, Math.PI * 2);
      ctx.fillStyle = b.id === selBone ? YEL : PAPER; ctx.fill(); ctx.lineWidth = 2 * k; ctx.stroke();
    }
    if(preview){
      const a = P(preview.a.x, preview.a.y), b = P(preview.b.x, preview.b.y);
      ctx.setLineDash([8 * k, 6 * k]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 3 * k; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /* ---- 帯 ---- */
  const TOOLS = [['pose', '✋ 動かす'], ['setup', '📐 組み立て'], ['add', '➕ 骨を足す'], ['bind', '🔗 つける']];
  const btn = {};
  TOOLS.forEach(([k, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => setTool(k);
    bar.appendChild(b); btn[k] = b;
  });
  const weigh = document.createElement('button');
  weigh.textContent = '🕸 しならせる';
  weigh.title = 'パーツが 近くの 骨に あわせて しなる ように する（自動ウェイト）';
  weigh.onclick = () => {
    const l = layer(); if(!l) return;
    const s = selSlot && l.hone.slots.find(x => x.id === selSlot);
    edit('しならせる', () => autoWeigh(l, s || null));
    toast(s ? '「' + s.name + '」を しならせました' : 'ぜんぶの パーツを しならせました');
    onChange();
  };
  const del = document.createElement('button');
  del.textContent = '🗑 骨';
  del.title = 'えらんだ 骨を けす（子は 親に つけかえ）';
  del.onclick = () => {
    const l = layer(); if(!l) return;
    if(selBone === 'root') return toast('根もとの 骨は けせません');
    let ok = false;
    edit('骨を けす', () => { ok = removeBone(l, selBone); });
    if(ok){ selBone = 'root'; toast('骨を けしました'); onChange(); }
  };
  const done = document.createElement('button');
  done.className = 'btn-g'; done.textContent = '完了';
  bar.append(weigh, del, done);

  function setTool(k, quiet){
    tool = k; selSlot = k === 'bind' ? selSlot : null;
    TOOLS.forEach(([x]) => btn[x].classList.toggle('on', x === k));
    if(!quiet) toast(k === 'pose' ? '骨の 先を つまんで 回す（いまの 時こくに キー）。根もとは ずらせます'
        : k === 'setup' ? '骨の 先で 向きと 長さ、骨を つまんで 場所。絵は その場に のこります'
        : k === 'add' ? 'えらんだ 骨から 引っぱると 子の 骨が できます'
        : 'パーツを おして、つぎに 骨を おす');
    redraw();
  }
  setTool('pose', true);

  return {
    draw, done,
    setTool,
    open(){ selBone = 'root'; selSlot = null; setTool('pose'); },
  };
}

/* ---- 小道具 ---- */
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
function inTri(px, py, ax, ay, bx, by, cx, cy){
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
const linear = (m, x, y) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y });
function deformed(s, pose){
  const out = new Float32Array(s.verts.length * 2);
  for(let i = 0; i < s.verts.length; i++){
    const v = s.verts[i], bl = v.bind;
    let x = 0, y = 0, tw = 0;
    if(bl) for(const b of bl){
      const p = pose[b.b]; if(!p) continue;
      const m = p.world;
      x += (m.a * b.lx + m.c * b.ly + m.tx) * b.w; y += (m.b * b.lx + m.d * b.ly + m.ty) * b.w; tw += b.w;
    }
    out[i * 2] = tw > 1e-4 ? x / tw : v.x; out[i * 2 + 1] = tw > 1e-4 ? y / tw : v.y;
  }
  return out;
}
