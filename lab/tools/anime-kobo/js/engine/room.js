/* 🏠 部屋（りったいの はこ）。

   6まいの 絵を「はこの 内がわ」に はって、その まん中から
   見まわす。カメラを まわすと、部屋の 中で 首を ふって いる ように なる。

   なぜ 板を 6まい ならべる のでは だめか
     いままでの やり方（レイヤーを 1まいずつ たおして 天じょう・かべに する）は、
     板どうしの つなぎ目が 合わず、カメラを ふると ばらばらに 動いて 見える。
     部屋は「はこ 1つ」として まとめて 出さないと そろわない。

   やり方
     かべ 1まいごとに ます目を 張って、その かどを 3Dで カメラから 見た
     ところに うつし、三角ずつ 絵を はる（ぐるり360と 同じ 道具）。
     となり合う かべは 3Dで かどを 共有して いる ので、
     うつした あとも ぴったり くっつく ＝ つなぎ目が 出ない。

     カメラの うしろに 回った かどは うつせない ので、
     その 三角は 出さない（見えない ところ なので 問題ない）。 */

import { S, isDraft } from '../state.js?v=248';
import { drawDeformed } from './puppet.js?v=248';
import { newLayer, valuesAt } from './layer.js?v=248';
import { camOf, camDolly } from './camera.js?v=248';

export const isRoom = (l) => !!l && l.kind === 'room';

/** 部屋だけが 持つ うごかせる もの */
export const ROOM_CHANNELS = ['roomY', 'roomP', 'roomZ'];
export const ROOM_LABEL = { roomY:'よこ回転', roomP:'たて回転', roomZ:'ズーム' };

/** かべの ならび。おくから 見て、内がわに はる むきで きめて ある */
export const FACES = [
  { key:'back',  name:'おく（正面）' },
  { key:'left',  name:'ひだりの かべ' },
  { key:'right', name:'みぎの かべ' },
  { key:'up',    name:'天じょう' },
  { key:'down',  name:'ゆか' },
  { key:'front', name:'うしろ（ふりむいた 先）' }
];

export function roomDefaults(project){
  const w = (project || S.proj).w, h = (project || S.proj).h;
  return {
    faces: {},                 // key → アセットの ばんごう
    rw: w, rh: h, rd: w,       // はこの よこ・たて・おくゆき
    roomY: 0, roomP: 0, roomZ: 75
  };
}

/* かべ 1まいの 置きかた。
   もと（origin）から よこ（ud）・たて（vd）へ ひろがる しかく。
   内がわから 見て 絵が さかさに ならない むきに して ある。 */
function faceQuads(W, H, D){
  const x = W / 2, y = H / 2, z = D / 2;
  return {
    back:  { o:[-x,  y,  z], ud:[ W, 0, 0], vd:[0, -H, 0] },
    front: { o:[ x,  y, -z], ud:[-W, 0, 0], vd:[0, -H, 0] },
    left:  { o:[-x,  y, -z], ud:[ 0, 0, D], vd:[0, -H, 0] },
    right: { o:[ x,  y,  z], ud:[ 0, 0,-D], vd:[0, -H, 0] },
    up:    { o:[-x,  y, -z], ud:[ W, 0, 0], vd:[0, 0,  D] },
    down:  { o:[-x, -y,  z], ud:[ W, 0, 0], vd:[0, 0, -D] }
  };
}

/** ます目（かたちは いつも 同じ ので 使いまわす） */
function grid(n){
  const verts = [];
  for(let r = 0; r <= n; r++) for(let c = 0; c <= n; c++) verts.push({ u:0, v:0 });
  return { verts, tris: [], cols: n, rows: n };
}

/**
 * いまの むきで 見た 部屋の 中を 1まいに 描いて かえす。
 *   l … 部屋レイヤー
 *   v … いまの 時こくの 数字（roomY / roomP / roomZ）
 */
export function roomCanvas(l, v, project){
  const P = project || S.proj;
  const w = Math.max(1, P.w), h = Math.max(1, P.h);
  if(!l._rmC || l._rmC.width !== w || l._rmC.height !== h){
    l._rmC = document.createElement('canvas');
    l._rmC.width = w; l._rmC.height = h;
    l._rmC.complete = true;
    l._rmC.naturalWidth = w; l._rmC.naturalHeight = h;
    l._rmKey = null;
  }

  /* ---- どこから どっちを 見て いるか ----
     カメラの まわりこみ（rx/ry）が そのまま 首の むきに なる。
     カメラの よせ（ドリー）で 部屋の おくへ 進む。
     カメラが 無い ときは 部屋 じしんの つまみ だけで 動く。 */
  const cam = camOf(P, S.time);
  const cv = cam ? valuesAt(cam, S.time) : null;
  const yaw   = (v && v.roomY != null ? v.roomY : (l.roomY || 0)) + (cv ? (cv.ry || 0) : 0);
  const pitch = Math.max(-85, Math.min(85,
                  (v && v.roomP != null ? v.roomP : (l.roomP || 0)) + (cv ? (cv.rx || 0) : 0)));
  const fov   = Math.max(20, Math.min(140, v && v.roomZ != null ? v.roomZ : (l.roomZ || 75)));

  const W = Math.max(20, l.rw || P.w);
  const H = Math.max(20, l.rh || P.h);
  const D = Math.max(20, l.rd || P.w);

  /* 前後の 立ち位置。かべを つきぬけない ように 手前で 止める */
  const lim = D / 2 - 30;
  const pz = Math.max(-lim, Math.min(lim, cv ? camDolly(cv) * 0.35 : 0));

  const ids = FACES.map(f => (l.faces && l.faces[f.key]) || '-').join(',');
  const key = [ids, w, h, W, H, D, N, yaw.toFixed(2), pitch.toFixed(2),
               fov.toFixed(2), pz.toFixed(1)].join('|');
  if(l._rmKey === key) return l._rmC;
  l._rmKey = key;

  const g = l._rmC.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);

  /* ---- カメラ ----
     まっすぐ 前（おくの かべ）を +z と する。
     f は 画角から 出す 「レンズの 長さ」。 */
  const f = (w / 2) / Math.tan(fov * Math.PI / 360);
  const cx = w / 2, cy = h / 2;
  /* たては プラスで「上を 見る」に する（実測して むきを 合わせた） */
  const a = yaw * Math.PI / 180, p = -pitch * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cp = Math.cos(p), sp = Math.sin(p);
  const NEAR = 1;

  const draft = isDraft();
  const N = draft ? 5 : Math.max(4, Math.min(24, l.mesh1 || 10));
  if(!l._rmMesh || l._rmMesh.cols !== N) l._rmMesh = grid(N);
  const m = l._rmMesh;
  const n = m.verts.length;
  if(!l._rmXY || l._rmXY.length !== n * 2){
    l._rmXY = new Float32Array(n * 2);
    l._rmUV = new Float32Array(n * 2);
    l._rmOK = new Uint8Array(n);
  }
  const xy = l._rmXY, uv = l._rmUV, ok = l._rmOK;
  const Q = faceQuads(W, H, D);

  for(const fc of FACES){
    const id = l.faces && l.faces[fc.key];
    const img = id ? S.imgs[id] : null;
    if(!img || !img.complete || !img.naturalWidth) continue;
    const q = Q[fc.key];
    const iw = img.naturalWidth, ih = img.naturalHeight;

    for(let r = 0; r <= N; r++){
      const tv = r / N;
      for(let c = 0; c <= N; c++){
        const tu = c / N;
        const i = r * (N + 1) + c;

        // かべの 上の 1点（部屋の ものさし）
        const X = q.o[0] + q.ud[0] * tu + q.vd[0] * tv;
        const Y = q.o[1] + q.ud[1] * tu + q.vd[1] * tv;
        const Z = q.o[2] + q.ud[2] * tu + q.vd[2] * tv - pz;

        // 首を よこに ふる（Y じくまわり）
        const x1 =  X * ca - Z * sa;
        const z1 =  X * sa + Z * ca;
        // 首を たてに ふる（X じくまわり）
        const y2 =  Y * cp + z1 * sp;
        const z2 = -Y * sp + z1 * cp;

        ok[i] = z2 > NEAR ? 1 : 0;
        if(ok[i]){
          xy[i*2]     = cx + x1 * f / z2;
          xy[i*2 + 1] = cy - y2 * f / z2;
        }
        uv[i*2]     = tu * iw;
        uv[i*2 + 1] = tv * ih;
      }
    }

    /* うしろに 回った かどが 1つでも ある 三角は 出さない */
    const tris = m.tris;
    tris.length = 0;
    const id4 = (c, r) => r * (N + 1) + c;
    for(let r = 0; r < N; r++) for(let c = 0; c < N; c++){
      const A = id4(c, r), B = id4(c+1, r), C = id4(c, r+1), Dv = id4(c+1, r+1);
      if(ok[A] && ok[B] && ok[C]) tris.push(A, B, C);
      if(ok[B] && ok[Dv] && ok[C]) tris.push(B, Dv, C);
    }
    if(tris.length) drawDeformed(g, img, m, xy, 1, uv);
  }

  return l._rmC;
}

/** 部屋レイヤーを 1つ つくる。いちばん うしろに 置く */
export function addRoomLayer(name){
  const l = newLayer(name || '部屋', []);
  l.kind = 'room';
  Object.assign(l, roomDefaults(S.proj));
  l.x = S.proj.w / 2; l.y = S.proj.h / 2;
  l.pw = S.proj.w; l.ph = S.proj.h;
  S.proj.layers.push(l);
  S.sel = l.id;
  return l;
}
