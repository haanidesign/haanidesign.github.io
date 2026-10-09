/* 🎬 動画編集レイヤー・🦴 骨キャラレイヤー（kind: 'nest'）。

   1つの レイヤーの 中に、動画工房 か ミニSpine の 作品が まるごと 入って いる。
   中みは 見えない ページ（douga/ か spine/ を ?nest=1 で ひらいた もの）が うごかし、
   ここは その 時こくの 1まいを もらって ふつうの 絵として 出す。
   だから 動かす・大きさ・回転・ピン・カメラ・効果は ほかの レイヤーと 同じに きく。

   しまう もの
     動画 … l.nest.ref（動画工房の さくひん番号。素材は 動画工房の しまい場所に ある）
     骨   … l.nest.json（ミニSpine の 作品 まるごと。絵も 中に 入って いる）
   l.nest.v は 中みを 直す たびに 1 ふやす。もどす で 番号が かわったら 読みなおす。

   時間は レイヤーの「出す ところ」の はじまりが 中の 0秒。 */
import { S, edit, onChange } from '../state.js?v=320';
import { newLayer } from '../engine/layer.js?v=320';

const SRC = { douga: 'douga/index.html?nest=1', spine: 'spine/index.html?nest=1' };
export const NEST_NAME = { douga: '動画編集', spine: '骨キャラ' };

const N = new Map();          // レイヤーの id → { f, app, api, loaded, v, ready, seen }
let redraw = () => {};
let exporting = false;
let editing = null;           // いま 中を 編集して いる レイヤーの id

export const setNestRedraw = (fn) => { redraw = fn; };
export const isNest = (l) => !!l && l.kind === 'nest';
export const nestEditing = () => editing;

export function newNestLayer(app, project){
  const l = newLayer(NEST_NAME[app], []);
  l.kind = 'nest';
  l.nest = { app, ref: null, json: null, v: 0 };
  l.pw = project.w; l.ph = project.h;
  l.x = project.w / 2; l.y = project.h / 2;
  return l;
}

export function localTime(l, t){
  const s = l.span;
  return t - (s && s.from > 0 ? s.from : 0);
}

/* ---------- 見えない ページの おき場 ---------- */
let host = null;
function hostEl(){
  if(host) return host;
  host = document.createElement('div');
  host.id = 'nests';
  document.body.appendChild(host);
  return host;
}

function layerById(id){
  return (S.proj.layers || []).find(l => l.id === id) || null;
}

function boot(l){
  let e = N.get(l.id);
  if(e && e.app === l.nest.app) return e;
  if(e) drop(l.id);
  const f = document.createElement('iframe');
  f.title = NEST_NAME[l.nest.app];
  f.allow = 'fullscreen; clipboard-read; clipboard-write; autoplay';
  f.src = SRC[l.nest.app];
  e = { f, app: l.nest.app, id: l.id, api: null, loaded: false, v: -1, seen: 0, opening: null };
  e.ready = new Promise(ok => { e.ok = ok; });
  N.set(l.id, e);
  hostEl().appendChild(f);
  return e;
}

function drop(id){
  const e = N.get(id);
  if(!e) return;
  try{ e.api && e.api.stop(); }catch(_){}
  e.f.remove();
  N.delete(id);
}

/* 中みを ひらく（はじめて と、もどす で 中みが かわった とき） */
async function load(e, l){
  const want = l.nest.v || 0;
  e.v = want;
  const n = l.nest;
  if(e.app === 'douga'){
    const ref = await e.api.open(n.ref, { w: S.proj.w, h: S.proj.h, fps: S.proj.fps || 30, name: l.name });
    if(ref && ref !== n.ref) n.ref = ref;     // はじめて の ときだけ 番号が つく
  }else{
    await e.api.open(n.json);
  }
  sizeFrom(e, l);
  e.loaded = true;
  e.ok();
  redraw();
}

function sizeFrom(e, l){
  const i = e.api.info();
  if(i.w && i.h && (l.pw !== i.w || l.ph !== i.h)){ l.pw = i.w; l.ph = i.h; }
}

addEventListener('message', (ev) => {
  if(ev.origin !== location.origin || !ev.data || !ev.data.nest) return;
  const e = [...N.values()].find(x => x.f.contentWindow === ev.source);
  if(!e) return;
  if(ev.data.nest === 'ready'){
    e.api = e.f.contentWindow.__nest;
    const l = layerById(e.id);
    if(l) e.opening = load(e, l).catch(err => console.warn(err));
  }else if(ev.data.nest === 'done'){
    finishEdit(e);
  }
});

/** いまの 時こくの 1まい（c2d から よぶ）。まだ 読みこみ中 なら 前の まま */
export function nestCanvas(l, t){
  const e = boot(l);
  e.seen = performance.now();
  if(!e.loaded || editing === l.id) return l._nC || null;
  if((l.nest.v || 0) !== e.v){
    if(!e.opening || e.v !== (l.nest.v || 0)) { e.loaded = false; e.opening = load(e, l); }
    return l._nC || null;
  }
  const lt = localTime(l, t);
  const cv = exporting ? e.api.frame(lt) : e.api.show(lt, !!S.playing);
  if(!cv) return l._nC || null;
  cv.complete = true;
  cv.naturalWidth = cv.width; cv.naturalHeight = cv.height;
  if(l.pw !== cv.width || l.ph !== cv.height){ l.pw = cv.width; l.ph = cv.height; }
  l._nC = cv;
  return cv;
}

/* 出して いない（出す ところの 外・止めた・消した）ページは 止める。
   止めないと 動画の 音だけ 鳴りつづける。 */
setInterval(() => {
  const now = performance.now();
  const alive = new Set((S.proj && S.proj.layers || []).filter(isNest).map(l => l.id));
  N.forEach((e, id) => {
    if(!alive.has(id) && editing !== id){ drop(id); return; }
    if(e.loaded && editing !== id && now - e.seen > 250){ try{ e.api.stop(); }catch(_){} }
  });
}, 200);

/* 止めて いる とき、動画の コマが あとから とどく。とどいた ころに 描きなおす */
let kick = 0;
setInterval(() => {
  if(S.playing || exporting || editing) return;
  if(++kick % 3) return;
  if([...N.values()].some(e => e.loaded && e.app === 'douga')) redraw();
}, 120);

/* ---------- 書き出し ---------- */
const visibleNests = (project) => (project.layers || []).filter(l => isNest(l) && l.visible !== false);

export async function beginNestExport(project){
  exporting = true;
  const list = visibleNests(project);
  list.forEach(l => boot(l));
  await Promise.all(list.map(l => {
    const e = N.get(l.id);
    return Promise.race([e.ready, new Promise(r => setTimeout(r, 15000))]);
  }));
  for(const l of list){ const e = N.get(l.id); if(e && e.opening) await e.opening; }
}
export function endNestExport(){ exporting = false; redraw(); }
/** 実時間で 録る とき（MediaRecorder・すける WebM）は ふだんの 再生で 合わせる */
export function setNestLive(){ exporting = false; }

/** 1コマ 焼く まえに よぶ。動画の コマを その 時こくに ぴったり 合わせる */
export async function prepareNests(project, t){
  const jobs = [];
  for(const l of visibleNests(project)){
    const e = N.get(l.id);
    if(!e || !e.loaded) continue;
    const lt = localTime(l, t);
    if(l.span && l.span.to != null && t > l.span.to) continue;
    if(lt < 0) continue;
    jobs.push(e.api.prepare(lt));
  }
  if(jobs.length) await Promise.all(jobs);
}

/** 動画レイヤーの 音を タイムラインの 時こくで かえす [{ buf, at, until }] */
export async function nestSounds(project, dur){
  const out = [];
  for(const l of visibleNests(project)){
    const e = N.get(l.id);
    if(!e || !e.loaded || e.app !== 'douga') continue;
    const at = l.span && l.span.from > 0 ? l.span.from : 0;
    const until = l.span && l.span.to != null ? l.span.to : dur;
    const len = Math.max(0, Math.min(e.api.info().dur, until - at));
    if(len <= 0) continue;
    try{
      const buf = await e.api.mix(len);
      if(buf) out.push({ buf, at, until });
    }catch(err){ console.warn(err); }
  }
  return out;
}

/* ---------- 中を 編集 ---------- */
export async function openNestEdit(l){
  if(!isNest(l)) return;
  const e = boot(l);
  if(S.playing) S.playing = false;
  editing = l.id;
  document.body.classList.add('nest-edit');
  N.forEach(x => { x.f.classList.toggle('on', x === e); });
  hostEl().classList.add('on');
  await e.ready;
  if(e.opening) await e.opening;
  try{ e.api.redraw(); }catch(_){}
  try{ e.f.focus(); }catch(_){}
}

async function finishEdit(e){
  const l = layerById(e.id);
  try{ e.api.stop(); }catch(_){}
  if(l){
    if(e.app === 'spine'){
      const json = e.api.json();
      if(json !== l.nest.json){
        edit('骨キャラを 直す', () => { l.nest.json = json; l.nest.v = (l.nest.v || 0) + 1; });
      }
    }else{
      await e.api.save();
      /* 動画の 中みは 動画工房の しまい場所に ある。番号を 進めて 読みなおさせる */
      const ref = e.api.info().ref;     // 中で べつの さくひんを ひらいた かも しれない
      edit('動画を 直す', () => { l.nest.ref = ref; l.nest.v = (l.nest.v || 0) + 1; });
    }
    e.v = l.nest.v || 0;        // ページは もう 新しい 中み なので 読みなおさない
    sizeFrom(e, l);
  }
  editing = null;
  host.classList.remove('on');
  N.forEach(x => x.f.classList.remove('on'));
  document.body.classList.remove('nest-edit');
  onChange();
  redraw();
}
