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
import { S, edit, beginEdit, commitEdit, onChange, selected } from '../state.js?v=359';
import { computeAll } from '../engine/layer.js?v=359';
import { setPin } from '../engine/anim.js?v=359';
import { M } from './core.js?v=359';
import { paintWeight } from './core.js?v=359';
import { isHone, setupPose, honePose, honePoseLive, rebind, addBoneAt, removeBone, autoWeigh, boneCh, keyedValue,
         addIK, autoBonesFromNames, SOFT } from './hone.js?v=359';

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
  const poseNow = (l) => S.honeSetup ? setupPose(l.hone) : honePoseLive(l, S.time);

  /* ---- 当たり ---- */
  function hitBone(l, p){
    const pose = poseNow(l);
    const R = 16 / p.sc;
    let best = null, bd = 1e9;
    /* IK の まと（丸）が いちばん さき */
    for(const b of l.hone.bones){
      if(!b.ikTarget) continue;
      const w = pose[b.id] && pose[b.id].world; if(!w) continue;
      const d = Math.hypot(p.x - w.tx, p.y - w.ty);
      if(d < R * 1.3 && d < bd){ bd = d; best = { b, part: 'body', w, tip: M.apply(w, b.len, 0) }; }
    }
    if(best) return best;
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
    if(tool === 'ik'){
      grab(e);
      const hb = hitBone(l, p);
      if(!hb || !hb.b.parent || hb.b.ikTarget){ toast('ひじから 先・ひざから 先 の 骨を おしてね'); return; }
      let t = null;
      edit('IK を つける', () => { t = addIK(l, hb.b.id); });
      if(t){ selBone = t.id; toast('IK を つけました。② アニメート で 丸を 動かすと「' + hb.b.name + '」と その 親が 曲がって とどきます'); }
      onChange(); return;
    }
    if(tool === 'weight' || tool === 'unweight'){
      grab(e);
      if(!selBone){ toast('さきに 骨を えらんでね'); return; }
      beginEdit('ウェイトを ぬる');
      drag = { kind: 'paint', l, R: 40 / p.sc };
      paintAt(l, p, drag.R);
      return;
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
      if((hb.part === 'body' && isRoot) || b.ikTarget){
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
    if(drag.kind === 'paint'){ paintAt(l, p, drag.R); redraw(); return; }
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
  /* 🖌 ウェイトの 筆。組み立ての 姿の 上で ぬる */
  function paintAt(l, p, R){
    const amt = tool === 'weight' ? 0.12 : -0.12;
    for(const s of l.hone.slots) if(s.visible !== false) paintWeight(s, selBone, p.x, p.y, R, amt);
    rebind(l);
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
    if(tool === 'weight' || tool === 'unweight'){
      for(const s of l.hone.slots){
        if(s.visible === false) continue;
        for(const v of s.verts){
          const e = (v.w || []).find(x => x.b === selBone), wv = e ? e.w : 0;
          const q = P(v.x, v.y);
          ctx.beginPath(); ctx.arc(q.x, q.y, (2 + wv * 4) * k, 0, Math.PI * 2);
          ctx.fillStyle = wv > 0.01 ? 'rgba(242,160,184,' + (0.35 + wv * 0.65) + ')' : 'rgba(30,28,20,.25)';
          ctx.fill();
        }
      }
    }
    for(const b of l.hone.bones){
      const w = pose[b.id] && pose[b.id].world; if(!w) continue;
      if(b.ikTarget){
        const q = P(w.tx, w.ty), r = 11 * k;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx.fillStyle = b.id === selBone ? YEL : 'rgba(255,254,247,.9)'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5 * k; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q.x - r * 1.5, q.y); ctx.lineTo(q.x + r * 1.5, q.y); ctx.moveTo(q.x, q.y - r * 1.5); ctx.lineTo(q.x, q.y + r * 1.5);
        ctx.lineWidth = 1.5 * k; ctx.stroke();
        continue;
      }
      const o = P(w.tx, w.ty), tp = M.apply(w, b.len, 0), t = P(tp.x, tp.y);
      const dx = t.x - o.x, dy = t.y - o.y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L, wd = Math.min(12 * k, L * 0.18);
      const mx = o.x + dx * 0.18, my = o.y + dy * 0.18;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y); ctx.lineTo(mx + nx * wd, my + ny * wd); ctx.lineTo(t.x, t.y); ctx.lineTo(mx - nx * wd, my - ny * wd); ctx.closePath();
      ctx.fillStyle = b.id === selBone ? YEL : b.spring ? 'rgba(242,160,184,.85)' : 'rgba(255,254,247,.85)';
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

  /* ---- 帯（ミニSpine と 同じ ならび）----
     上の 段 … ① セットアップ（形をつくる）／ ② アニメート（動かす）／ よくある動き ／ 完了
     下の 段 … その 段の 道具 */
  const top = document.createElement('div');
  top.className = 'honetabs';
  const tools = document.createElement('div');
  tools.className = 'honetools';
  bar.append(top, tools);
  const bigTab = (num, title, sub, fn) => {
    const b = document.createElement('button');
    b.className = 'honetab';
    const t = document.createElement('b'); t.textContent = num + ' ' + title;
    const s2 = document.createElement('small'); s2.textContent = sub;
    b.append(t, s2);
    b.onclick = fn;
    top.appendChild(b);
    return b;
  };
  const tabSetup = bigTab('①', 'セットアップ', '形をつくる', () => setPhase('setup'));
  const tabAnim = bigTab('②', 'アニメート', '動かす', () => setPhase('anim'));
  const motions = document.createElement('button');
  motions.className = 'honemotion';
  motions.textContent = '✨ よくある動き';
  motions.onclick = () => onMotions();
  const done = document.createElement('button');
  done.className = 'btn-g'; done.textContent = '完了';
  top.append(motions, done);

  const btn = {};
  const mk = (label, title, fn) => {
    const b = document.createElement('button');
    b.textContent = label; if(title) b.title = title;
    b.onclick = fn;
    return b;
  };
  const SETUP_TOOLS = [['add', '➕ 骨を足す'], ['setup', '📐 組み立て'], ['bind', '🔗 つける'], ['ik', '🎯 IK'],
                       ['weight', '🖌 ウェイト＋'], ['unweight', '🖌 ウェイト－']];
  SETUP_TOOLS.forEach(([k, label]) => { btn[k] = mk(label, '', () => setTool(k)); });
  btn.pose = mk('✋ 動かす', '骨の 先を つまんで 回す。根もとの 骨は ずらせる', () => setTool('pose'));
  const weigh = mk('🕸 しならせる', 'パーツが 近くの 骨に あわせて しなる ように する（自動ウェイト）', () => {
    const l = layer(); if(!l) return;
    const s = selSlot && l.hone.slots.find(x => x.id === selSlot);
    edit('しならせる', () => autoWeigh(l, s || null));
    toast(s ? '「' + s.name + '」を しならせました' : 'ぜんぶの パーツを しならせました');
    onChange();
  });
  const rename = mk('✏ 名前', '骨の 名前（頭・体・右腕 … に すると よくある動きが 見つけやすい）', () => {
    const l = layer(); if(!l) return;
    const b = l.hone.bones.find(x => x.id === selBone); if(!b) return;
    const n = prompt('骨の 名前（頭・体・首・右腕・左腕・髪・しっぽ など）', b.name);
    if(n == null || !n.trim()) return;
    edit('骨の 名前', () => { b.name = n.trim(); });
    onChange();
  });
  const del = mk('🗑 骨', 'えらんだ 骨を けす（子は 親に つけかえ）', () => {
    const l = layer(); if(!l) return;
    if(selBone === 'root') return toast('根もとの 骨は けせません');
    let ok = false;
    edit('骨を けす', () => { ok = removeBone(l, selBone); });
    if(ok){ selBone = 'root'; toast('骨を けしました'); onChange(); }
  });
  const spring = mk('🌀 ばね', 'えらんだ 骨を ゆれる 骨に する（髪・しっぽ・リボン）。もう1回で もどす', () => {
    const l = layer(); if(!l) return;
    const b = l.hone.bones.find(x => x.id === selBone);
    if(!b || !b.parent) return toast('ゆらす 骨を えらんでね');
    edit('骨の ばね', () => { b.spring = !b.spring; if(b.spring && (b.stiff == null || b.stiff >= 0.3)) Object.assign(b, SOFT.hair); });
    toast(b.spring ? '「' + b.name + '」が ゆれる ように なりました（② アニメート で 体を 動かすと ゆれます）' : '「' + b.name + '」の ばねを はずしました');
    onChange();
  });
  const auto = mk('🤖 名前から骨', 'パーツの 名前（体・頭・腕・脚・髪・目・口）を 見て 骨を 組みなおす', () => {
    const l = layer(); if(!l) return;
    if(l.hone.bones.length > 1 && !confirm('いまの 骨を けして 組みなおします（もどす で 戻せます）')) return;
    let n = 0;
    edit('名前から 骨', () => { n = autoBonesFromNames(l); });
    toast(n ? n + '本の 骨を 組みました（髪・しっぽは ばね つき）' : '名前から わかる パーツが ありませんでした（体・頭・腕・脚・髪 …）');
    onChange();
  });
  let onFace = () => {};
  const face = mk('👁 目・口', '目(開)・目(閉)・口(開)・口(閉) の パーツを きめる（まばたき・口ぱく）', () => onFace());
  const animNote = document.createElement('span');
  animNote.className = 'dot honenote';
  animNote.textContent = 'いまの 時こくに キーが 入ります';

  let phase = 'setup';
  let onMotions = () => {};
  function setPhase(p, quiet){
    phase = p;
    S.honeSetup = p === 'setup';
    tabSetup.classList.toggle('on', p === 'setup');
    tabAnim.classList.toggle('on', p === 'anim');
    tools.innerHTML = '';
    if(p === 'setup'){
      tools.append(btn.add, btn.setup, btn.bind, btn.ik, btn.weight, btn.unweight, weigh, spring, auto, face, rename, del);
      const l = layer();
      setTool(l && l.hone.bones.length < 2 ? 'add' : 'setup', quiet);
    } else {
      tools.append(btn.pose, animNote);
      setTool('pose', quiet);
    }
  }

  function setTool(k, quiet){
    tool = k; selSlot = k === 'bind' ? selSlot : null;
    ['add', 'setup', 'bind', 'pose', 'ik', 'weight', 'unweight'].forEach(x => btn[x].classList.toggle('on', x === k));
    if(!quiet) toast(k === 'pose' ? '骨の 先を つまんで 回す（いまの 時こくに キー）。根もとは ずらせます'
        : k === 'setup' ? '骨の 先で 向きと 長さ、骨を つまんで 場所。絵は その場に のこります'
        : k === 'add' ? 'えらんだ 骨から 引っぱると 子の 骨が できます'
        : k === 'ik' ? 'ひじから 先（ひざから 先）の 骨を おすと、先に IK の 丸が つきます'
        : k === 'weight' ? 'えらんだ 骨の ウェイトを ぬって ふやす（ピンクが こいほど よく ついて くる）'
        : k === 'unweight' ? 'えらんだ 骨の ウェイトを けずる'
        : 'パーツを おして、つぎに 骨を おす');
    redraw();
  }
  setPhase('setup', true);

  return {
    draw, done,
    setTool,
    setPhase,
    setMotions(fn){ onMotions = fn; },
    setFace(fn){ onFace = fn; },
    get bone(){ return selBone; },
    open(){ selBone = 'root'; selSlot = null; setPhase(layer() && layer().hone.bones.length > 1 ? 'anim' : 'setup'); },
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
