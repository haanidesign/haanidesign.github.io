/* アフターエフェクトへ 持っていく（まるごと版）。

   何を する もの か
     レイヤー 1まいずつを「絵が うごく 連番の PNG」に 焼いて、
     それを AE で もとの 場所に ならべ直す スクリプト（.jsx）と
     いっしょに zip に して 出す。

   なぜ 焼くのか
     このアプリの 動き（パペットピン・ゆがみ・手がき風・球・
     まわりこむ カメラ）は AE に 同じ ものが ない か、
     スクリプトから 作れない（AEの パペットピンは スクリプトで
     打てない）。絵に して しまえば 見た目は そのまま 出る。

   AE で できる こと
     ・レイヤーごとに 消す／出す・順番を 入れかえる
     ・時間を ずらす・のばす
     ・エフェクトを かける・ほかの 素材と 合わせる
   できない こと
     ・焼いた あとの 動き じたいを 直す（それは こちらで 直す） */

import { createRenderer } from '../render/renderer.js?v=299';
import { drawOrder, nearestFolder } from '../engine/layer.js?v=299';

/* ---------- zip（おしこめない「ためるだけ」の zip） ----------
   PNG は もう ちぢんで いる ので、さらに おしこんでも 小さく ならない。
   ためるだけ（store）なら 短い しくみで すむ。 */

let CRC = null;
function crc32(buf){
  if(!CRC){
    CRC = new Uint32Array(256);
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for(let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const enc = new TextEncoder();

function zipMaker(){
  const parts = [];        // Blob でも Uint8Array でも 入れられる
  const dir = [];
  let at = 0;

  const u = (n, len) => {
    const b = new Uint8Array(len);
    for(let i = 0; i < len; i++) b[i] = (n >>> (i * 8)) & 0xFF;
    return b;
  };
  const push = (b) => {
    parts.push(b);
    at += (b instanceof Blob) ? b.size : b.length;
  };

  return {
    /** name … zip の 中の みち、data … Uint8Array か Blob */
    async add(name, data){
      const nm = enc.encode(name);
      const bytes = (data instanceof Blob) ? new Uint8Array(await data.arrayBuffer()) : data;
      const crc = crc32(bytes);
      const size = bytes.length;
      const off = at;

      const head = [];
      head.push(u(0x04034b50, 4), u(20, 2), u(0x0800, 2), u(0, 2),
                u(0, 2), u(0, 2), u(crc, 4), u(size, 4), u(size, 4),
                u(nm.length, 2), u(0, 2), nm);
      let n = 0; head.forEach(h => n += h.length);
      const h = new Uint8Array(n);
      let p = 0; head.forEach(x => { h.set(x, p); p += x.length; });
      push(h);
      /* 中みは もとの まま わたす。Blob の ままに して おくと
         ブラウザが よきに はからって くれる（全部を おぼえて いない）。 */
      push(data instanceof Blob ? data : bytes);
      dir.push({ nm, crc, size, off });
    },

    done(){
      const out = [];
      let n = 0;
      for(const e of dir){
        const c = [u(0x02014b50, 4), u(20, 2), u(20, 2), u(0x0800, 2), u(0, 2),
                   u(0, 2), u(0, 2), u(e.crc, 4), u(e.size, 4), u(e.size, 4),
                   u(e.nm.length, 2), u(0, 2), u(0, 2), u(0, 2), u(0, 2),
                   u(0, 4), u(e.off, 4), e.nm];
        let m = 0; c.forEach(x => m += x.length);
        const b = new Uint8Array(m);
        let p = 0; c.forEach(x => { b.set(x, p); p += x.length; });
        out.push(b); n += m;
      }
      const end = [u(0x06054b50, 4), u(0, 2), u(0, 2),
                   u(dir.length, 2), u(dir.length, 2), u(n, 4), u(at, 4), u(0, 2)];
      let m = 0; end.forEach(x => m += x.length);
      const e = new Uint8Array(m);
      let p = 0; end.forEach(x => { e.set(x, p); p += x.length; });
      return new Blob([...parts, ...out, e], { type: 'application/zip' });
    }
  };
}


/* ---------- なまえ ---------- */

/** ファイル名に つかえる 字だけ に する */
function safe(s, fallback){
  const t = String(s || '').replace(/[^0-9A-Za-zぁ-んァ-ヶ一-龠ー_-]/g, '_').slice(0, 24);
  return t || fallback;
}

const pad4 = (n) => ('000' + n).slice(-4);

/** jsx の 中に 文字を 入れる（ダブルクォートを ころさない） */
function q(s){
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** #RRGGBB → [0〜1, 0〜1, 0〜1] */
function rgb01(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#FFFEF7'));
  const n = m ? parseInt(m[1], 16) : 0xFFFEF7;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}


/* ---------- 本体 ---------- */

/**
 * @param project いまの さくひん
 * @param opt { fps, onProgress, shouldStop }
 * @returns { blob, ext:'zip', frames, layers }
 */
export async function exportAE(project, opt = {}){
  const fps = Math.max(1, Math.round(opt.fps || project.fps || 30));
  const W = Math.max(2, Math.round(project.w));
  const H = Math.max(2, Math.round(project.h));
  const total = Math.max(1, Math.round(project.duration * fps));
  const onProgress = opt.onProgress || (() => {});
  const shouldStop = opt.shouldStop || (() => false);

  /* 手前から ならんだ 絵の レイヤー（フォルダは 中身に ばらけて いる）。
     カメラ・音は 絵に ならない ので 出さない。 */
  /* 目を 切って いる レイヤー（と、目を 切った フォルダの 中み）は 出さない */
  const shown = (l) => {
    let cur = l;
    while(cur){
      if(cur.visible === false) return false;
      cur = nearestFolder(project, cur);
    }
    return true;
  };
  const all = drawOrder(project)
    .filter(l => l.kind !== 'cam' && l.kind !== 'audio' && l.kind !== 'adjust' && shown(l));

  /* ぬき型（トラックマット）に つかって いる レイヤーは、
     それじたいは 画面に 出ない ので 焼かない。
     そのかわり、ぬかれる がわを 焼く あいだは 出して おく。 */
  const MATTES = ['alpha', 'alphaInv', 'luma', 'lumaInv'];
  const matteOf = {};
  const isMatte = new Set();
  for(let i = 1; i < all.length; i++){
    const l = all[i];
    if(MATTES.indexOf(l.matte) < 0) continue;
    const m = all[i - 1];
    if(!m || isMatte.has(m.id) || MATTES.indexOf(m.matte) >= 0) continue;
    matteOf[l.id] = m;
    isMatte.add(m.id);
  }
  const order = all.filter(l => !isMatte.has(l.id));
  if(!order.length) throw new Error('出せる レイヤーが ありません');

  /* 1まいずつ 焼くので、ほかの レイヤーは いったん 消す。
     もとの 見え方は あとで かならず もどす。 */
  const was = project.layers.map(l => [l, l.visible]);
  const solo = (l) => {
    /* カメラと ちょうせいの かみは 消さない。
       カメラを 消すと「カメラなし」の 場所に 焼かれて しまうし、
       ちょうせいの かみを 消すと 色が 変わって しまう。 */
    was.forEach(([x, v]) => {
      x.visible = (x.kind === 'cam' || x.kind === 'adjust') ? v : false;
    });
    let cur = l;
    while(cur){ cur.visible = true; cur = nearestFolder(project, cur); }
    // ぬき型に つかう 1まいも 出して おく（でないと ぬけない）
    const mt = matteOf[l.id];
    if(mt){
      let c2 = mt;
      while(c2){ c2.visible = true; c2 = nearestFolder(project, c2); }
    }
  };
  const undo = () => { was.forEach(([l, v]) => { l.visible = v; }); };

  /* 下見用の 小さい 紙。どこまで 絵が あるかを 先に しらべる
     （その ぶんだけ 切り出せば、ファイルが ずっと 軽くなる）。 */
  const s = Math.min(1, 420 / Math.max(W, H));
  const sw = Math.max(2, Math.round(W * s)), sh = Math.max(2, Math.round(H * s));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const Rs = createRenderer(small);
  const gs = small.getContext('2d', { willReadFrequently: true });

  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const Rb = createRenderer(big);

  const cut = document.createElement('canvas');
  const gc = cut.getContext('2d');

  const view = { x: 0, y: 0, z: 1 };
  const zip = zipMaker();
  const items = [];
  const steps = order.length * total * 2;
  let done = 0;
  const tick = () => { done++; if((done & 7) === 0) onProgress(done / steps); };
  /* ときどき 画面に 番を ゆずる（進みぐあいが 出る・止められる） */
  const breathe = () => new Promise(r => setTimeout(r, 0));

  try{
    for(let li = 0; li < order.length; li++){
      const l = order[li];
      solo(l);

      /* ① どこまで 絵が あるか（小さい 紙で ざっと 見る） */
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for(let i = 0; i < total; i++){
        if(shouldStop()) throw new Error('やめました');
        Rs.draw(project, null, i / fps, view, { forExport: true, noBg: true, scale: s });
        const d = gs.getImageData(0, 0, sw, sh).data;
        for(let y = 0; y < sh; y++){
          const row = y * sw * 4;
          for(let x = 0; x < sw; x++){
            if(d[row + x * 4 + 3] > 2){
              if(x < x0) x0 = x;
              if(x > x1) x1 = x;
              if(y < y0) y0 = y;
              if(y > y1) y1 = y;
            }
          }
        }
        tick();
        if((i & 15) === 0) await breathe();
      }
      if(!isFinite(x0)){ done += total; continue; }        // まるごと 空

      /* 下見は あらいので、まわりに ゆとりを つけて 切り出す */
      const pad = Math.ceil(3 / s) + 2;
      const cx0 = Math.max(0, Math.floor(x0 / s) - pad);
      const cy0 = Math.max(0, Math.floor(y0 / s) - pad);
      const cx1 = Math.min(W, Math.ceil((x1 + 1) / s) + pad);
      const cy1 = Math.min(H, Math.ceil((y1 + 1) / s) + pad);
      const cw = Math.max(2, cx1 - cx0), ch = Math.max(2, cy1 - cy0);
      cut.width = cw; cut.height = ch;

      /* ② ほんばんの 大きさで 焼く */
      const dir = 'frames/' + pad4(li + 1) + '_' + safe(l.name, 'layer');
      const base = safe(l.name, 'layer');
      for(let i = 0; i < total; i++){
        if(shouldStop()) throw new Error('やめました');
        Rb.draw(project, null, i / fps, view, { forExport: true, noBg: true });
        gc.clearRect(0, 0, cw, ch);
        gc.drawImage(big, cx0, cy0, cw, ch, 0, 0, cw, ch);
        const blob = await new Promise(r => cut.toBlob(r, 'image/png'));
        await zip.add(dir + '/' + base + '_' + pad4(i) + '.png', blob);
        tick();
        if((i & 7) === 0) await breathe();
      }

      items.push({ dir, name: l.name || 'レイヤー', x: cx0, y: cy0, w: cw, h: ch,
                   blend: l.blend || 'normal' });
    }
  }finally{
    undo();
  }

  if(!items.length) throw new Error('絵が 出て いる レイヤーが ありません');

  await zip.add('アニメ工房→AE.jsx',
                enc.encode(jsx(project, items, fps, total)));
  await zip.add('よみかた.txt', enc.encode(readme(project, items, fps, total)));
  onProgress(1);

  return { blob: zip.done(), ext: 'zip', frames: total, layers: items.length };
}


/* ---------- AE に わたす スクリプト ---------- */

function jsx(project, items, fps, total){
  const W = Math.round(project.w), H = Math.round(project.h);
  const dur = total / fps;
  const bg = rgb01(project.bg);
  const list = items.map(it => '  { dir: ' + q(it.dir) + ', name: ' + q(it.name)
    + ', x: ' + it.x + ', y: ' + it.y + ', w: ' + it.w + ', h: ' + it.h
    + ', blend: ' + q(it.blend || 'normal') + ' }').join(',\n');

  return `/* アニメ工房 → After Effects
   つかい方: AE の [ファイル]→[スクリプト]→[スクリプトファイルを実行]
   で この ファイルを えらぶ。zip は 先に ぜんぶ 展開して おくこと
   （中の frames フォルダが となりに ある 状態で 実行する）。 */
(function(){
  var base = new File($.fileName).parent;
  var W = ${W}, H = ${H}, FPS = ${fps}, DUR = ${dur.toFixed(4)};

  var items = [
${list}
  ];

  /* かさね方（乗算 など）は AE にも 同じ ものが ある ので そろえる */
  var BM = {};
  try{
    BM = { multiply: BlendingMode.MULTIPLY, screen: BlendingMode.SCREEN,
           overlay: BlendingMode.OVERLAY, darken: BlendingMode.DARKEN,
           lighten: BlendingMode.LIGHTEN, add: BlendingMode.ADD,
           softlight: BlendingMode.SOFT_LIGHT, hardlight: BlendingMode.HARD_LIGHT,
           colordodge: BlendingMode.COLOR_DODGE, colorburn: BlendingMode.COLOR_BURN,
           difference: BlendingMode.DIFFERENCE };
  }catch(e){}

  app.beginUndoGroup("アニメ工房 とりこみ");

  var comp = app.project.items.addComp(${q(project.name || 'アニメ工房')}, W, H, 1, DUR, FPS);
  comp.openInViewer();

  /* うしろの レイヤーから 足す。あとから 足した ものが 上に 乗る ので、
     さいごに 足した ものが いちばん 手前に なる。 */
  for(var i = items.length - 1; i >= 0; i--){
    var it = items[i];
    var dir = new Folder(base.fsName + "/" + it.dir);
    if(!dir.exists){ continue; }
    var files = dir.getFiles("*.png");
    if(!files || !files.length){ continue; }
    files.sort(function(a, b){ return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

    var io = new ImportOptions(files[0]);
    io.sequence = true;
    io.forceAlphabetical = true;
    var foot = app.project.importFile(io);
    try{ foot.mainSource.conformFrameRate = FPS; }catch(e){}
    try{ foot.mainSource.alphaMode = AlphaMode.STRAIGHT; }catch(e){}

    var lay = comp.layers.add(foot);
    lay.name = it.name;
    lay.startTime = 0;
    /* 切り出した ぶんだけ ずらして、もとの 場所に 置く */
    lay.transform.position.setValue([it.x + it.w / 2, it.y + it.h / 2]);
    if(it.blend && BM[it.blend]){ try{ lay.blendingMode = BM[it.blend]; }catch(e){} }
  }

  /* いちばん 下に はいけいの 色 */
  var bg = comp.layers.addSolid([${bg[0].toFixed(4)}, ${bg[1].toFixed(4)}, ${bg[2].toFixed(4)}],
                                "はいけい", W, H, 1, DUR);
  bg.moveToEnd();

  app.endUndoGroup();
  alert("とりこみました: " + comp.name + "（" + items.length + "まい）");
})();
`;
}

function readme(project, items, fps, total){
  const NL = String.fromCharCode(10);
  return [
    'アニメ工房 → After Effects（まるごと版）',
    '',
    'さくひん: ' + (project.name || 'むだい'),
    '大きさ: ' + Math.round(project.w) + '×' + Math.round(project.h),
    'コマ: ' + fps + 'コマ/秒 × ' + total + 'コマ（' + (total / fps).toFixed(2) + '秒）',
    'レイヤー: ' + items.length + 'まい',
    '',
    '【つかい方】',
    '1. この zip を ぜんぶ 展開する（中を 取り出さないと 読めません）',
    '2. AE の [ファイル]→[スクリプト]→[スクリプトファイルを実行]',
    '3. 「アニメ工房→AE.jsx」を えらぶ',
    '',
    '【中みの こと】',
    '・レイヤーは 1まいずつ 連番PNGに 焼いて あります',
    '・うごき（ピン・ゆがみ・手がき風・カメラ）は 絵に 入って います',
    '・AEでは 順番・時間・エフェクト・ほかの 素材との 合成が できます',
    '・うごき じたいを 直したい ときは アニメ工房で 直して 出し直して ください',
    '・音は 入って いません（MP3/動画で 別に 出して ください）'
  ].join(NL);
}
