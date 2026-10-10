/* 🛰 俯瞰（シーンを 外から 見る）。

   レイヤーを おくゆきの ところに 板として ならべて、
   カメラ・うつる はんい（四角すい）・ゆかの ます目 と いっしょに
   ななめ上から 見せる（Blender の 3Dビューの ような もの）。
   見るだけ。さわって 動かすのは いつもの ステージで。

   ざひょう
     作品の まん中を 0、右が X+、下が Y+、おくが Z+（camera.js と 同じ）。
     レイヤーの おくゆきは depthLen、カメラの 目は ドリーより CAM_F 手前。
   見る がわの カメラ（view）は yaw・pitch・dist で まわりを まわる。 */
import { computeAll } from '../engine/layer.js?v=350';
import { camOf, camDolly, camTarget, depthLen, CAM_F, isCam } from '../engine/camera.js?v=350';
import { valuesAt } from '../engine/anim.js?v=350';
import { frameAsset, frameImage } from '../state.js?v=350';

const INK = '#1E1C14';
const GRID = 'rgba(30,28,20,.18)';
const YEL = '#E1DD60';

export function createOverview(host){
  const panel = document.createElement('div');
  panel.id = 'ovPanel';
  panel.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'ovbar';
  const ttl = document.createElement('b');
  ttl.textContent = '俯瞰';
  const front = document.createElement('button');
  front.className = 'btn-sm'; front.textContent = 'ななめ';
  front.title = 'ななめ上からの 見え方に もどす';
  const side = document.createElement('button');
  side.className = 'btn-sm'; side.textContent = 'よこ';
  side.title = '真横から 見る（おくゆきが わかりやすい）';
  const top = document.createElement('button');
  top.className = 'btn-sm'; top.textContent = '真上';
  const close = document.createElement('button');
  close.className = 'btn-sm'; close.textContent = '✕';
  close.setAttribute('aria-label', '俯瞰を とじる');
  bar.append(ttl, front, side, top, close);
  const cv = document.createElement('canvas');
  panel.append(bar, cv);
  host.appendChild(panel);
  const g = cv.getContext('2d');

  const V = { yaw: -35, pitch: 24, dist: 4200, cx: 0, cy: 0, cz: 600 };
  const preset = (yaw, pitch) => { V.yaw = yaw; V.pitch = pitch; want(); };
  front.onclick = () => { V.dist = 4200; V.cx = 0; V.cy = 0; V.cz = 600; preset(-35, 24); };
  side.onclick = () => preset(-90, 4);
  top.onclick = () => preset(0, 88);
  let onClose = () => {};
  close.onclick = () => onClose();

  let need = true;
  const want = () => { need = true; };

  /* ---- 指・マウスで まわす ---- */
  const pts = new Map();
  let pinch0 = null;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(pts.size === 2){
      const [a, b] = [...pts.values()];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: V.dist };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if(!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if(pts.size === 2 && pinch0){
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      V.dist = clampDist(pinch0.dist * pinch0.d / Math.max(10, d));
    } else if(pts.size === 1){
      if(e.shiftKey || e.button === 1 || e.buttons === 4){
        /* ずらす（見て いる 中心を うごかす） */
        const k = V.dist / 900;
        const yr = V.yaw * Math.PI / 180;
        V.cx -= (dx * Math.cos(yr)) * k;
        V.cz -= (dx * Math.sin(yr)) * k;
        V.cy -= dy * k;
      } else {
        V.yaw += dx * 0.4;
        V.pitch = Math.max(-10, Math.min(89, V.pitch + dy * 0.3));
      }
    }
    want();
  });
  const up = (e) => { pts.delete(e.pointerId); if(pts.size < 2) pinch0 = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    V.dist = clampDist(V.dist * Math.exp(e.deltaY * 0.0012));
    want();
  }, { passive: false });
  const clampDist = (d) => Math.max(600, Math.min(20000, d));

  /* ---- 見る がわの カメラ ---- */
  function viewer(W, H){
    const yr = V.yaw * Math.PI / 180, pr = V.pitch * Math.PI / 180;
    /* 目の ところ（中心から dist はなれ、上へ pitch） */
    const ex = V.cx + Math.sin(yr) * Math.cos(pr) * V.dist;
    const ey = V.cy - Math.sin(pr) * V.dist;
    const ez = V.cz - Math.cos(yr) * Math.cos(pr) * V.dist;
    /* 前・右・上 */
    let fx = V.cx - ex, fy = V.cy - ey, fz = V.cz - ez;
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    // 上は 画面の Y- の 向き
    let rx = fz, ry = 0, rz = -fx;
    const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const foc = Math.min(W, H) * 1.1;
    return (X, Y, Z) => {
      const dx = X - ex, dy = Y - ey, dz = Z - ez;
      const cz = dx * fx + dy * fy + dz * fz;
      if(cz < 20) return null;
      const cx = dx * rx + dy * ry + dz * rz;
      const cy = -(dx * ux + dy * uy + dz * uz);   // u は 上むき。画面は 下が プラス
      return { x: W / 2 + cx / cz * foc, y: H / 2 + cy / cz * foc, z: cz };
    };
  }

  function line(P, a, b){
    const p = P(...a), q = P(...b);
    if(!p || !q) return;
    g.moveTo(p.x, p.y); g.lineTo(q.x, q.y);
  }

  /* 三角1まいに 絵を はる（アフィン） */
  function tri(img, p0, p1, p2, u0, v0, u1, v1, u2, v2){
    g.save();
    g.beginPath();
    g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.closePath();
    g.clip();
    const d = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if(Math.abs(d) < 1e-6){ g.restore(); return; }
    const a = (p0.x * (v1 - v2) + p1.x * (v2 - v0) + p2.x * (v0 - v1)) / d;
    const b = (p0.y * (v1 - v2) + p1.y * (v2 - v0) + p2.y * (v0 - v1)) / d;
    const c = (p0.x * (u2 - u1) + p1.x * (u0 - u2) + p2.x * (u1 - u0)) / d;
    const dd = (p0.y * (u2 - u1) + p1.y * (u0 - u2) + p2.y * (u1 - u0)) / d;
    const e = (p0.x * (u1 * v2 - u2 * v1) + p1.x * (u2 * v0 - u0 * v2) + p2.x * (u0 * v1 - u1 * v0)) / d;
    const f = (p0.y * (u1 * v2 - u2 * v1) + p1.y * (u2 * v0 - u0 * v2) + p2.y * (u0 * v1 - u1 * v0)) / d;
    g.transform(a, b, c, dd, e, f);
    try{ g.drawImage(img, 0, 0); }catch(_){}
    g.restore();
  }

  /* 板 1まい。四すみ（3D）を N×N に わけて はる（おくが せまく なる のを それらしく） */
  function plate(P, img, iw, ih, C){
    const N = 4;
    const at = (s, t) => {
      const x = C[0][0] + (C[1][0] - C[0][0]) * s + (C[3][0] - C[0][0]) * t + (C[0][0] - C[1][0] + C[2][0] - C[3][0]) * s * t;
      const y = C[0][1] + (C[1][1] - C[0][1]) * s + (C[3][1] - C[0][1]) * t + (C[0][1] - C[1][1] + C[2][1] - C[3][1]) * s * t;
      const z = C[0][2] + (C[1][2] - C[0][2]) * s + (C[3][2] - C[0][2]) * t + (C[0][2] - C[1][2] + C[2][2] - C[3][2]) * s * t;
      return P(x, y, z);
    };
    const grid = [];
    for(let j = 0; j <= N; j++){
      const row = [];
      for(let i = 0; i <= N; i++){ const q = at(i / N, j / N); if(!q) return; row.push(q); }
      grid.push(row);
    }
    for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
      const u0 = iw * i / N, u1 = iw * (i + 1) / N, v0 = ih * j / N, v1 = ih * (j + 1) / N;
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      /* つぎ目が すけない ように ほんの すこし 外へ */
      tri(img, a, b, c, u0, v0, u1, v0, u1, v1);
      tri(img, a, c, d, u0, v0, u1, v1, u0, v1);
    }
  }

  function draw(project, time){
    if(panel.hidden) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
    if(cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    need = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#FBFAEC';
    g.fillRect(0, 0, W, H);
    const P = viewer(W, H);
    const cx = project.w / 2, cy = project.h / 2;

    /* ゆか（作品の 下の はし の 高さ） */
    const fy = cy, step = 200, ext = 4000;
    g.beginPath();
    g.strokeStyle = GRID; g.lineWidth = 1;
    for(let x = -ext; x <= ext; x += step) line(P, [x, fy, -2000], [x, fy, 6000]);
    for(let z = -2000; z <= 6000; z += step) line(P, [-ext, fy, z], [ext, fy, z]);
    g.stroke();
    /* おくゆき 0 の 線（作品の 面） */
    g.beginPath(); g.strokeStyle = 'rgba(30,28,20,.45)'; g.lineWidth = 1.5 * dpr;
    line(P, [-ext, fy, 0], [ext, fy, 0]);
    g.stroke();

    /* 板。おくゆきの ところに、カメラを かけない 姿で ならべる */
    const all = computeAll(project, time);
    const items = [];
    for(const l of project.layers){
      const e = all[l.id];
      if(!e || !e.vis || isCam(l) || l.kind === 'folder' || l.kind === 'audio' || l.kind === 'adjust') continue;
      const a = frameAsset(l, e.v.frame);
      const img = frameImage(l, e.v.frame);
      if(!a || !img || !(img.naturalWidth || img.width)) continue;
      const m = e.mNoCam || e.m;
      const pvx = l.pivot ? l.pivot.x : 0.5, pvy = l.pivot ? l.pivot.y : 0.5;
      const z = depthOfChain(project, l, time, all);
      const corner = (u, v) => {
        const x = (u - pvx) * a.w, y = (v - pvy) * a.h;
        return [m.a * x + m.c * y + m.tx - cx, m.b * x + m.d * y + m.ty - cy, z];
      };
      const C = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
      const mid = P((C[0][0] + C[2][0]) / 2, (C[0][1] + C[2][1]) / 2, z);
      if(!mid) continue;
      items.push({ l, img, iw: img.naturalWidth || img.width, ih: img.naturalHeight || img.height, C, far: mid.z,
                   alpha: Math.max(0, Math.min(1, e.v.opacity == null ? 1 : e.v.opacity)) });
    }
    /* うしろの 板（作品の 下じき）。作品の 面に うすく */
    const bg = [[-cx, -cy, 0], [cx, -cy, 0], [cx, cy, 0], [-cx, cy, 0]];
    const pb = bg.map(p => P(...p));
    if(pb.every(Boolean)){
      g.beginPath(); pb.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath();
      g.fillStyle = project.bg || '#FFFEF7'; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
    }
    items.sort((a, b) => b.far - a.far);
    for(const it of items){
      g.globalAlpha = it.alpha;
      plate(P, it.img, it.iw, it.ih, it.C);
      g.globalAlpha = 1;
    }

    /* カメラ */
    const cam = camOf(project, time);
    const cv0 = cam ? valuesAt(cam, time) : null;
    drawCamera(P, cv0, project, dpr);
  }

  /* 親子で つながって いる ものは、いちばん 外の 親の おくゆき に いる */
  function depthOfChain(project, l, time, all){
    let cur = l, g2 = 0, d = 0;
    while(cur && g2++ < 64){
      const e = all[cur.id];
      d += depthLen(e ? e.v : cur);
      cur = cur.parent ? project.layers.find(x => x.id === cur.parent) : null;
    }
    return d;
  }

  function drawCamera(P, v, project, dpr){
    const cx = project.w / 2, cy = project.h / 2;
    const zoom = v ? ((v.scaleX == null ? 1 : v.scaleX) || 1) : 1;
    const ox = v ? (v.x || 0) - cx : 0, oy = v ? (v.y || 0) - cy : 0;
    const dz = v ? camDolly(v) : 0;
    const roll = (v && v.rot || 0) * Math.PI / 180;
    /* 写る 四角（おくゆき 0 の 面）と 目 */
    const hw = cx / zoom, hh = cy / zoom;
    const rc = Math.cos(-roll), rs = Math.sin(-roll);
    let frame = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [ox + x * rc - y * rs, oy + x * rs + y * rc, 0]);
    let eye = [ox, oy, dz - CAM_F];
    /* まわりこみ。カメラを 注視点の まわりに まわす */
    if(v && (v.rx || v.ry)){
      const T = camTarget(v, cx, cy);
      const rot = (p) => rot3([p[0] - T.x, p[1] - T.y, p[2] - T.z], v.rx || 0, v.ry || 0);
      frame = frame.map(p => { const q = rot(p); return [q[0] + T.x, q[1] + T.y, q[2] + T.z]; });
      const e = rot(eye); eye = [e[0] + T.x, e[1] + T.y, e[2] + T.z];
    }
    g.lineJoin = 'round';
    /* 四角すい */
    g.beginPath(); g.strokeStyle = 'rgba(30,28,20,.55)'; g.lineWidth = 1.5 * dpr;
    frame.forEach(p => line(P, eye, p));
    g.stroke();
    /* 写る 四角 */
    const fp = frame.map(p => P(...p));
    if(fp.every(Boolean)){
      g.beginPath(); fp.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath();
      g.strokeStyle = INK; g.lineWidth = 2.5 * dpr; g.stroke();
      /* 上がわに 三角（どっちが 上か） */
      const a = fp[0], b = fp[1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
      const s = Math.min(40 * dpr, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
      g.beginPath();
      g.moveTo(mx - (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y) * s, my - (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) * s);
      g.lineTo(mx + (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y) * s, my + (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y) * s);
      g.lineTo(mx + nx / nl * s * 1.1 * (ny > 0 ? -1 : 1), my + ny / nl * s * 1.1 * (ny > 0 ? -1 : 1));
      g.closePath();
      g.fillStyle = YEL; g.fill(); g.lineWidth = 2 * dpr; g.stroke();
    }
    /* 目（カメラ本体） */
    const e = P(...eye);
    if(e){
      g.beginPath(); g.arc(e.x, e.y, 7 * dpr, 0, Math.PI * 2);
      g.fillStyle = YEL; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5 * dpr; g.stroke();
    }
    if(!v){
      g.fillStyle = INK;
      g.font = `700 ${13 * dpr}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText('カメラ なし（まん中から 見た ところ）', 12 * dpr, H() - 12 * dpr);
    }
  }
  const H = () => cv.height;

  return {
    panel,
    get open(){ return !panel.hidden; },
    show(on){ panel.hidden = !on; want(); },
    setClose(fn){ onClose = fn; },
    needs(){ return need; },
    want,
    draw
  };
}

function rot3(p, rx, ry){
  const d = Math.PI / 180;
  let [x, y, z] = p;
  if(rx){ const c = Math.cos(rx * d), s = Math.sin(rx * d); const ny = y * c - z * s, nz = y * s + z * c; y = ny; z = nz; }
  if(ry){ const c = Math.cos(ry * d), s = Math.sin(ry * d); const nx = x * c + z * s, nz = -x * s + z * c; x = nx; z = nz; }
  return [x, y, z];
}
