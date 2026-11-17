/* LINE スタンプ工房
   画像を 入れる・描く・文字を のせる・動きを つける → 点検 → 申請用の zip。
   描く 場所は 740×640(止まる スタンプの 最大 370×320 の 2 倍)。書き出す ときに 切って 大きさを そろえる。 */
"use strict";
const $ = id => document.getElementById(id);
const DW = 740, DH = 640;
const RULE = {
  static: {w:370, h:320, counts:[8,16,24,32,40], kind:"スタンプ(静止画)"},
  anim:   {w:320, h:270, counts:[8,16,24],       kind:"アニメーションスタンプ"},
};
const FONTS = {
  zen:  s => `900 ${s}px "Zen Maru Gothic"`,
  pop:  s => `400 ${s}px "Dela Gothic One"`,
  hand: s => `400 ${s}px "Yusei Magic"`,
  futo: s => `800 ${s}px "M PLUS Rounded 1c"`,
};
const TEXT_COLS = ["#1E1C14","#FFFFFF","#E8455B","#FF8A4A","#F2C53D","#4BB86B","#3D8BFF","#F2A0B8","#8A5A3B"];
const ST_COLS = ["#FFFFFF","#1E1C14","#F2A0B8","#E1DD60","#3D8BFF"];
const PEN_COLS = ["#1E1C14","#FFFFFF","#E8455B","#FF8A4A","#F2C53D","#4BB86B","#3D8BFF","#F2A0B8","#8A5A3B"];
const FX = [
  ["none","なし"],["puru","ぷるぷる"],["pyon","ぴょん"],["yura","ゆらゆら"],["doon","どーん"],["kuru","くるっ"],
  ["doki","ドキドキ"],["buru","ぶるぶる"],["chika","ちかちか"],["fuwa","ふわふわ"],["pon","ぽんっ"],["yoko","すいー"],
];

const uid = () => Math.random().toString(36).slice(2, 10);
const newStamp = () => ({layers:[], strokes:[], fills:[], fx:"none", fxT:"all", dur:2});
const newProject = () => ({id:uid(), name:"", mode:"static", count:8, sel:0, main:0, edge:6, selL:-1, view:{z:1, r:0, x:0, y:0},
  stamps:Array.from({length:40}, newStamp),
  meta:{titleJa:"", titleEn:"", descJa:"", descEn:"", creator:"", copy:""}});
let P = newProject();
const ASSETS = new Map();   // id -> {img, url}
let tool = "move", penCol = PEN_COLS[0], penW = 10, playing = false, playT0 = 0;
let tCol = "#1E1C14", tSt = "#FFFFFF";
let dirty = false;

const toast = t => { const m = $("msg"); m.textContent = t; m.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(()=> m.classList.remove("on"), 2000); };
const cur = () => P.stamps[P.sel];
const selLayer = () => cur().layers[P.selL];
const isEmpty = st => !st.layers.length && !st.strokes.length && !(st.fills || []).length;
const even = n => Math.max(2, Math.round(n / 2) * 2);
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u*u*(3 - 2*u); };
function setDirty(v){ dirty = v; $("workName").textContent = (P.name || "名前なし") + (v ? " ●" : ""); }

/* ---------------- 動き ----------------
   t は 0〜1(1 まわり)。t=0 は 止まった 形(売り場で 1 コマめが 見本に なるため) */
function fxAt(id, t){
  const o = {dx:0, dy:0, sx:1, sy:1, r:0, a:1};
  const S = Math.sin, PI = Math.PI;
  switch(id){
    case "puru": { const k = S(2*PI*4*t); o.sx = 1 + .04*k; o.sy = 1 - .04*k; break; }
    case "pyon": { const u = (t*2) % 1, up = S(PI*u); o.dy = -70*up*up; const land = Math.max(0, 1 - u/.12) + Math.max(0, (u - .88)/.12);
      o.sy = 1 - .08*land; o.sx = 1 + .06*land; break; }
    case "yura": o.r = 7*S(2*PI*t)*PI/180; break;
    case "doon": { const u = (t + .55) % 1; const k = u < .12 ? .55 + .6*sstep(0,.12,u) : u < .22 ? 1.15 - .15*sstep(.12,.22,u) : 1; o.sx = o.sy = k; break; }
    case "kuru": { const u = (t + .5) % 1; o.r = u < .45 ? 2*PI*sstep(0,.45,u) : 0; break; }
    case "doki": { const u = (t*2) % 1; const k = 1 + .1*Math.max(0, S(PI*Math.min(1, u/.3))) + .06*Math.max(0, S(PI*Math.min(1, Math.max(0, u-.3)/.25))); o.sx = o.sy = k; break; }
    case "buru": o.dx = 9*S(2*PI*10*t); break;
    case "chika": o.a = (Math.floor(t*8) % 2) ? .25 : 1; break;
    case "fuwa": o.dy = -14*S(2*PI*t); o.r = 2*S(2*PI*t + 1)*PI/180; break;
    case "pon": { const u = (t + .5) % 1; const k = u < .1 ? sstep(0,.1,u)*1.2 : u < .18 ? 1.2 - .2*sstep(.1,.18,u) : 1; o.sx = o.sy = Math.max(.02, k); break; }
    case "yoko": { const u = (t + .5) % 1; o.dx = u < .3 ? -DW*(1 - sstep(0,.3,u)) : 0; o.a = u < .3 ? sstep(0,.15,u) : 1; break; }
  }
  return o;
}

/* ---------------- 描く ---------------- */
/* ゆれる落書き: 線の 形を 4 まいの ちがう ゆれで くり返す(手描きアニメの 線の ふるえ)。
   BOIL = {b: いま 何まいめ, A: ゆれの 量}。動くスタンプで「ゆれる落書き」が オンの ときだけ */
let BOIL = null;
const hash = n=>{ const x = Math.sin(n*127.1)*43758.5453; return x - Math.floor(x); };
function vnoise(t, seed){ const i = Math.floor(t), f = t - i, u = f*f*(3 - 2*f);
  return (hash(i + seed*57.3)*(1 - u) + hash(i + 1 + seed*57.3)*u)*2 - 1; }
function boilPts(p, si){
  if(!BOIL) return p;
  const q = new Array(p.length), A = BOIL.A, sd = si*13.7 + BOIL.b*101.3;
  let arc = 0;
  for(let i=0;i<p.length;i+=2){
    if(i) arc += Math.hypot(p[i]-p[i-2], p[i+1]-p[i-1]);
    q[i] = p[i] + vnoise(arc/26, sd)*A; q[i+1] = p[i+1] + vnoise(arc/26, sd + 7.7)*A;
  }
  return q;
}
/* 絵・塗り・文字は 形を 変えずに 少しだけ ずらして 回す */
function boilShake(g, k){
  if(!BOIL) return;
  const sd = k*31.7 + BOIL.b*17.3;
  g.translate((hash(sd) - .5)*BOIL.A*.9, (hash(sd + 3.1) - .5)*BOIL.A*.9);
}
function drawStroke(g, s, si){
  const p = boilPts(s.p, si || 0);
  g.save();
  g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = BOIL ? s.w*(1 + vnoise(BOIL.b*3.1, si || 0)*.12) : s.w; g.strokeStyle = s.c;
  g.beginPath();
  if(p.length === 2){ g.arc(p[0], p[1], s.w/2, 0, Math.PI*2); g.fillStyle = s.c; g.fill(); g.restore(); return; }
  g.moveTo(p[0], p[1]);
  for(let i=2;i<p.length-2;i+=2) g.quadraticCurveTo(p[i], p[i+1], (p[i]+p[i+2])/2, (p[i+1]+p[i+3])/2);
  g.lineTo(p[p.length-2], p[p.length-1]);
  g.stroke(); g.restore();
}
function textMetrics(L){
  const g = textMetrics.g || (textMetrics.g = document.createElement("canvas").getContext("2d"));
  g.font = FONTS[L.font || "zen"](L.size);
  return {w: g.measureText(L.text).width, h: L.size * 1.15};
}
function drawLayer(g, L){
  g.save();
  g.translate(L.x, L.y); g.rotate((L.r || 0) * Math.PI/180);
  if(L.t === "img"){
    const A = ASSETS.get(L.a); if(!A){ g.restore(); return; }
    g.scale(L.s * (L.fl ? -1 : 1), L.s);
    g.drawImage(A.img, -A.img.width/2, -A.img.height/2);
  } else {
    g.font = FONTS[L.font || "zen"](L.size);
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.miterLimit = 2;
    if(L.sw > 0){ g.lineWidth = L.sw * 2; g.strokeStyle = L.stroke; g.strokeText(L.text, 0, 0); }
    g.fillStyle = L.color; g.fillText(L.text, 0, 0);
  }
  g.restore();
}
/* 1 枚 描く。fx は 動き(target に よって 絵だけ・文字だけ にも かかる) */
function renderContent(g, st, t){
  const f = st.fx !== "none" && P.mode === "anim" ? fxAt(st.fx, t) : null;
  BOIL = st.boil && P.mode === "anim" ? {b: Math.floor(t * st.dur * 8) % 4, A: (st.boilA || 2.5) * 2} : null;
  const apply = (fn, on)=>{
    g.save();
    if(f && on){
      const px = DW/2, py = st.fx === "pyon" || st.fx === "yura" ? DH*.85 : DH/2;
      g.globalAlpha = f.a;
      g.translate(px + f.dx, py + f.dy); g.rotate(f.r); g.scale(f.sx, f.sy); g.translate(-px, -py);
    }
    fn(); g.restore();
  };
  const onImg = st.fxT !== "text", onText = st.fxT !== "img";
  apply(()=>{
    st.layers.forEach((L, i)=>{ if(L.t === "img"){ g.save(); boilShake(g, i); drawLayer(g, L); g.restore(); } });
    (st.fills || []).forEach((f, i)=>{ const A = ASSETS.get(f.a); if(!A) return;
      g.save(); boilShake(g, 50 + i); g.drawImage(A.img, f.x - A.img.width/2, f.y - A.img.height/2); g.restore(); });   // 塗りは 線の 下
    st.strokes.forEach((s, i)=> drawStroke(g, s, i));
  }, onImg);
  apply(()=>{ st.layers.forEach((L, i)=>{ if(L.t === "text"){ g.save(); boilShake(g, 100 + i); drawLayer(g, L); g.restore(); } }); }, onText);
  BOIL = null;
}
/* 白い ふちまで つけた 1 枚(740×640) */
function renderFull(st, t){
  const c = document.createElement("canvas"); c.width = DW; c.height = DH;
  const g = c.getContext("2d"); renderContent(g, st, t);
  return P.edge > 0 ? LS.outline(c, P.edge * 2) : c;
}

/* ---------------- 画面 ---------------- */
const cv = $("cv"), ctx = cv.getContext("2d");
cv.width = DW; cv.height = DH;
function fit(){
  const st = $("stage"), aw = st.clientWidth - 200, ah = st.clientHeight - 40;
  const s = Math.max(.2, Math.min(aw / DW, ah / DH));
  cv.style.width = Math.round(DW * s) + "px"; cv.style.height = Math.round(DH * s) + "px";
}
addEventListener("resize", fit);
const checker = (()=>{ const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d");
  g.fillStyle = "#FFFEF7"; g.fillRect(0,0,32,32); g.fillStyle = "#EFEDDA"; g.fillRect(0,0,16,16); g.fillRect(16,16,16,16); return c; })();
let pat = null;
function paint(){
  const st = cur();
  const t = playing ? ((performance.now() - playT0) / 1000 / st.dur) % 1 : 0;
  ctx.clearRect(0,0,DW,DH);
  pat = pat || ctx.createPattern(checker, "repeat");
  ctx.fillStyle = pat; ctx.fillRect(0,0,DW,DH);
  ctx.drawImage(renderFull(st, t), 0, 0);
  // えらんで いる もの の わく
  const L = selLayer();
  if(L && !playing && tool === "move"){
    const b = layerBox(L);
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate((L.r||0)*Math.PI/180);
    ctx.setLineDash([10, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1E1C14";
    ctx.strokeRect(-b.w/2 - 6, -b.h/2 - 6, b.w + 12, b.h + 12);
    ctx.restore();
  }
  // 動く スタンプの 大きさの めやす(320:270)
  if(P.mode === "anim"){
    const h = DW * 270/320;
    ctx.save(); ctx.setLineDash([6, 10]); ctx.strokeStyle = "rgba(30,28,20,.35)"; ctx.lineWidth = 2;
    ctx.strokeRect(1, (DH - h)/2, DW - 2, h); ctx.restore();
  }
}
function layerBox(L){
  if(L.t === "img"){ const A = ASSETS.get(L.a); return A ? {w:A.img.width*L.s, h:A.img.height*L.s} : {w:10, h:10}; }
  const m = textMetrics(L); return {w:m.w + (L.sw||0)*2, h:m.h};
}
function loop(){
  if(playing || needPaint){ paint(); needPaint = false; }
  requestAnimationFrame(loop);
}
let needPaint = true;
const redraw = () => { needPaint = true; };

/* 左の ならび */
function drawThumbs(only){
  const box = $("thumbs");
  if(box.children.length !== P.count) only = undefined;
  if(only === undefined){
    box.innerHTML = "";
    for(let i=0;i<P.count;i++){
      const d = document.createElement("div");
      d.className = "th";
      d.innerHTML = `<canvas width="148" height="128"></canvas><b>${String(i+1).padStart(2,"0")}</b>`;
      d.onclick = ()=>{ P.sel = i; P.selL = -1; playing = false; syncAll(); };
      box.appendChild(d);
    }
  }
  [...box.children].forEach((d, i)=>{
    const st = P.stamps[i];
    d.classList.toggle("on", i === P.sel);
    d.classList.toggle("main", i === P.main);
    d.classList.toggle("empty", isEmpty(st));
    if(only !== undefined && only !== i) return;
    const g = d.firstChild.getContext("2d");
    g.clearRect(0,0,148,128);
    if(!isEmpty(st)) g.drawImage(renderFull(st, 0), 0, 0, 148, 128);
  });
}
let thumbT = 0;
const thumbSoon = () => { clearTimeout(thumbT); thumbT = setTimeout(()=> drawThumbs(P.sel), 250); };

/* 右の 欄 */
function syncSide(){
  const L = selLayer();
  $("lsz").disabled = $("lrot").disabled = !L;
  if(L){
    const sz = L.t === "img" ? L.s : L.size / 90;
    $("lsz").value = sz; $("lszV").textContent = sz.toFixed(2);
    $("lrot").value = L.r || 0; $("lrotV").textContent = Math.round(L.r || 0);
  }
  ["bgCut","flip"].forEach(id=> $(id).disabled = !L || L.t !== "img");
  ["up","down","del"].forEach(id=> $(id).disabled = !L);
  const lay = $("layers"); lay.innerHTML = "";
  const st = cur();
  if(!st.layers.length) lay.innerHTML = '<p class="note">まだ 何も ありません。</p>';
  st.layers.slice().reverse().forEach((Lr, ri)=>{
    const i = st.layers.length - 1 - ri;
    const d = document.createElement("div");
    d.className = i === P.selL ? "on" : "";
    d.innerHTML = `<b>${Lr.t === "img" ? "絵" : "字"}</b><span></span>`;
    d.lastChild.textContent = Lr.t === "img" ? "画像" : Lr.text;
    d.onclick = ()=>{ P.selL = i; tool = "move"; syncTools(); syncSide(); redraw(); };
    lay.appendChild(d);
  });
  if(L && L.t === "text"){
    $("tText").value = L.text; $("tFont").value = L.font || "zen";
    $("tSize").value = L.size; $("tSizeV").textContent = L.size;
    $("tSw").value = L.sw; $("tSwV").textContent = L.sw;
    tCol = L.color; tSt = L.stroke;
  }
  swSync("tCol", tCol); swSync("tSt", tSt); swSync("penCol", penCol);
  // 動き
  [...$("fx").children].forEach(b=> b.classList.toggle("on", b.dataset.v === st.fx));
  segOn("fxT", st.fxT); segOn("dur", String(st.dur));
  $("boil").classList.toggle("on", !!st.boil); $("boil").textContent = st.boil ? "ゆれる落書き: オン" : "ゆれる落書き: オフ";
  $("boilA").value = st.boilA || 2.5; $("boilAV").textContent = (+(st.boilA || 2.5)).toFixed(1);
  $("fx").style.opacity = P.mode === "anim" ? 1 : .45;
  $("play").style.display = P.mode === "anim" ? "" : "none";
  $("edge").value = P.edge; $("edgeV").textContent = P.edge;
}
function segOn(id, v){ [...$(id).children].forEach(b=> b.classList.toggle("on", b.dataset.v === v)); }
function swSync(id, v){ [...$(id).children].forEach(b=> b.classList.toggle("on", b.dataset.c === v)); }
function syncTools(){
  document.querySelectorAll("#tools [data-tool]").forEach(b=> b.classList.toggle("on", b.dataset.tool === tool));
  $("hintS").textContent = tool === "move" ? "絵や 文字を おして えらび、ドラッグで 動かす。指 2 本で 大きさ・回転"
    : tool === "pen" ? "ドラッグで 描く" : tool === "fill" ? "押した 所と つながった 同じ 色を、ペンの 色で 塗る"
    : "描いた 線・塗りの 上を なぞると 消える";
  cv.style.cursor = tool === "move" ? "move" : tool === "fill" ? "cell" : "crosshair";
}
function syncTop(){
  segOn("mode", P.mode);
  const sel = $("count"); sel.innerHTML = "";
  RULE[P.mode].counts.forEach(n=>{ const o = document.createElement("option"); o.value = n; o.textContent = n + " こ"; sel.appendChild(o); });
  const cs = RULE[P.mode].counts;
  if(!cs.includes(P.count)) P.count = cs.filter(n=> n <= P.count).at(-1) || cs[0];
  sel.value = P.count;
  if(P.sel >= P.count) P.sel = 0;
  if(P.main >= P.count) P.main = 0;
  setDirty(dirty);
}
function fixStamps(){ while(P.stamps.length < 40) P.stamps.push(newStamp()); P.stamps.forEach(st=>{ if(!st.fills) st.fills = []; }); if(!P.view) P.view = {z:1, r:0, x:0, y:0}; }
function syncAll(){ fixStamps(); syncTop(); drawThumbs(); syncSide(); syncTools(); applyView(); redraw(); }
function changed(){ setDirty(true); redraw(); thumbSoon(); autosaveSoon(); }

/* ---------------- 画像を 入れる ---------------- */
function loadImg(src){ return new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=> res(i); i.onerror = rej; i.src = src; }); }
async function addAssetFromCanvas(c){
  const url = c.toDataURL("image/png"), id = uid();
  ASSETS.set(id, {img: await loadImg(url), url});
  return id;
}
async function fileToAsset(file){
  const img = await loadImg(URL.createObjectURL(file));
  const s = Math.min(1, 1200 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  // 背景が 塗って ある 絵(四すみが 不透明で 同じ 色)は、まわりの 色を 消す
  if($("autoBg").checked){
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const at = (x, y)=> { const i = (y*W + x)*4; return [d[i], d[i+1], d[i+2], d[i+3]]; };
    const cs = [at(0,0), at(W-1,0), at(0,H-1), at(W-1,H-1)];
    const same = cs.every(p=> p[3] > 250 && Math.abs(p[0]-cs[0][0]) + Math.abs(p[1]-cs[0][1]) + Math.abs(p[2]-cs[0][2]) < 40);
    if(same){ const r = LS.removeBg(c, +$("tol").value); if(LS.bbox([r])) c.getContext("2d").clearRect(0, 0, W, H), c.getContext("2d").drawImage(r, 0, 0); }
  }
  // まわりの 透明な すき間は 切る
  const b = LS.bbox([c]);
  let out = c;
  if(b && (b.w < c.width || b.h < c.height)){
    out = document.createElement("canvas"); out.width = b.w; out.height = b.h;
    out.getContext("2d").drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  }
  return addAssetFromCanvas(out);
}
function placeImg(st, id){
  const A = ASSETS.get(id);
  const s = Math.min(DW * .82 / A.img.width, DH * .82 / A.img.height);
  st.layers.push({t:"img", a:id, x:DW/2, y:DH/2, s:+s.toFixed(3), r:0, fl:false});
  return st.layers.length - 1;
}
async function addImages(files, spread){
  files = [...files].filter(f=> /^image\//.test(f.type));
  if(!files.length) return;
  let i = P.sel;
  for(const f of files){
    const id = await fileToAsset(f);
    if(spread){
      while(i < P.count && !isEmpty(P.stamps[i]) && i !== P.sel) i++;
      if(i >= P.count){ toast("空いて いる スタンプが ありません"); break; }
      placeImg(P.stamps[i], id); drawThumbs(i); i++;
    } else { P.selL = placeImg(cur(), id); }
  }
  tool = "move"; syncTools(); syncSide(); changed(); drawThumbs();
  if(window.Oboeru) Oboeru.check();
}
$("addImg").onclick = ()=> $("fImg").click();
$("addImgAll").onclick = ()=> $("fImgs").click();
$("fImg").onchange = e=>{ addImages(e.target.files, false); e.target.value = ""; };
$("fImgs").onchange = e=>{ addImages(e.target.files, true); e.target.value = ""; };
$("stage").addEventListener("dragover", e=> e.preventDefault());
$("stage").addEventListener("drop", e=>{ e.preventDefault(); addImages(e.dataTransfer.files, e.dataTransfer.files.length > 1); });

/* ---------------- キャンバスの 操作 ---------------- */
const pts = new Map();
let drag = null, pinch = null, vpinch = null, curStroke = null;
/* 画面の 見かた(拡大・回転・ずらし)。作品と いっしょに 覚えて、↶ で もどせる */
const V = () => P.view || (P.view = {z:1, r:0, x:0, y:0});
function applyView(){
  const v = V();
  $("board").style.transform = `translate(${v.x}px, ${v.y}px) rotate(${v.r}deg) scale(${v.z})`;
  $("vz").textContent = Math.round(v.z * 100) + "%";
}
function viewChanged(){ applyView(); autosaveSoon(); clearTimeout(viewChanged.t); viewChanged.t = setTimeout(()=> window.Oboeru && Oboeru.check(), 400); }
function toDoc(e){
  // 回して いても 正しい 場所に なるよう、ボードの まんなかから 逆に たどる
  const sr = $("stage").getBoundingClientRect(), v = V();
  const cx = sr.left + sr.width/2 + v.x, cy = sr.top + sr.height/2 + v.y;
  const a = -v.r * Math.PI/180, dx = e.clientX - cx, dy = e.clientY - cy;
  const k = v.z * (parseFloat(cv.style.width) || DW) / DW;
  return [DW/2 + (dx*Math.cos(a) - dy*Math.sin(a)) / k, DH/2 + (dx*Math.sin(a) + dy*Math.cos(a)) / k];
}
function hit(x, y){
  const st = cur();
  for(let i=st.layers.length-1;i>=0;i--){
    const L = st.layers[i], b = layerBox(L), a = -(L.r||0)*Math.PI/180;
    const dx = x - L.x, dy = y - L.y, lx = dx*Math.cos(a) - dy*Math.sin(a), ly = dx*Math.sin(a) + dy*Math.cos(a);
    if(Math.abs(lx) <= b.w/2 + 10 && Math.abs(ly) <= b.h/2 + 10) return i;
  }
  return -1;
}
function fillHit(f, x, y){
  const A = ASSETS.get(f.a); if(!A) return false;
  const px = Math.round(x - (f.x - A.img.width/2)), py = Math.round(y - (f.y - A.img.height/2));
  if(px < 0 || py < 0 || px >= A.img.width || py >= A.img.height) return false;
  if(!A.px){ const c = document.createElement("canvas"); c.width = A.img.width; c.height = A.img.height;
    const g = c.getContext("2d", {willReadFrequently:true}); g.drawImage(A.img, 0, 0); A.px = g; }
  return A.px.getImageData(px, py, 1, 1).data[3] > 20;
}
function eraseAt(x, y){
  const st = cur(), n = st.strokes.length, nf = st.fills.length;
  st.strokes = st.strokes.filter(s=>{ for(let i=0;i<s.p.length;i+=2) if(Math.hypot(s.p[i]-x, s.p[i+1]-y) < penW + s.w/2) return false; return true; });
  if(st.strokes.length === n) st.fills = st.fills.filter(f=> !fillHit(f, x, y));   // 線が なければ 塗りを 消す
  if(st.strokes.length !== n || st.fills.length !== nf) changed();
}

/* バケツ塗り: 見えて いる 絵(絵・塗り・線・文字)を もとに、押した 所と つながった 似た 色を 塗る。
   塗りは 線の 下に 入る(線画の 中を 塗る ため)。すき間が 出ない よう 2px 広げる */
async function fillAt(x, y){
  const st = cur();
  const c = document.createElement("canvas"); c.width = DW; c.height = DH;
  const g = c.getContext("2d", {willReadFrequently:true});
  const keep = P.mode; P.mode = "static"; renderContent(g, st, 0); P.mode = keep;   // 動きは かけずに
  const im = g.getImageData(0, 0, DW, DH).data;
  const sx = Math.round(x), sy = Math.round(y);
  if(sx < 0 || sy < 0 || sx >= DW || sy >= DH) return;
  const s0 = (sy*DW + sx)*4, tol = +$("fillTol").value * 3;
  const c0 = [im[s0], im[s0+1], im[s0+2], im[s0+3]];
  const like = i=>{ const o = i*4;
    if(c0[3] < 20) return im[o+3] < 20 + tol/3;          // 透明な ところから なら 透明な ところだけ
    return Math.abs(im[o]-c0[0]) + Math.abs(im[o+1]-c0[1]) + Math.abs(im[o+2]-c0[2]) + Math.abs(im[o+3]-c0[3]) <= tol; };
  const mask = new Uint8Array(DW*DH), stack = [sx, sy];
  let n = 0, edge = false;
  while(stack.length){
    let yy = stack.pop(), xx = stack.pop();
    let i = yy*DW + xx;
    while(xx >= 0 && !mask[i] && like(i)){ xx--; i--; }
    xx++; i++;
    let up = false, dn = false;
    while(xx < DW && !mask[i] && like(i)){
      mask[i] = 1; n++;
      if(xx === 0 || xx === DW-1 || yy === 0 || yy === DH-1) edge = true;
      if(yy > 0){ const j = i - DW; if(!mask[j] && like(j)){ if(!up){ stack.push(xx, yy-1); up = true; } } else up = false; }
      if(yy < DH-1){ const j = i + DW; if(!mask[j] && like(j)){ if(!dn){ stack.push(xx, yy+1); dn = true; } } else dn = false; }
      xx++; i++;
    }
  }
  if(!n) return;
  // 2px 広げる(線の ふちとの すき間を うめる)
  let m = mask;
  for(let k=0;k<2;k++){
    const o = m.slice();
    for(let yy=1;yy<DH-1;yy++) for(let xx=1;xx<DW-1;xx++){ const i = yy*DW + xx;
      if(!m[i] && (m[i-1] || m[i+1] || m[i-DW] || m[i+DW])) o[i] = 1; }
    m = o;
  }
  let x0 = DW, y0 = DH, x1 = -1, y1 = -1;
  for(let yy=0;yy<DH;yy++) for(let xx=0;xx<DW;xx++) if(m[yy*DW + xx]){ if(xx<x0)x0=xx; if(xx>x1)x1=xx; if(yy<y0)y0=yy; if(yy>y1)y1=yy; }
  const w = x1-x0+1, h = y1-y0+1;
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const og = out.getContext("2d"), od = og.createImageData(w, h);
  const col = [1,3,5].map(k=> parseInt(penCol.slice(k, k+2), 16));
  for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){
    if(!m[(yy+y0)*DW + xx + x0]) continue;
    const o = (yy*w + xx)*4; od.data[o] = col[0]; od.data[o+1] = col[1]; od.data[o+2] = col[2]; od.data[o+3] = 255;
  }
  og.putImageData(od, 0, 0);
  const id = await addAssetFromCanvas(out);
  st.fills.push({a:id, x:x0 + w/2, y:y0 + h/2});
  changed();
  if(edge && n > DW*DH*.4) toast("外がわまで 塗りました。↶ で もどせます");
  window.Oboeru && Oboeru.check();
}

cv.addEventListener("pointerdown", e=>{
  cv.setPointerCapture(e.pointerId);
  const [x, y] = toDoc(e);
  pts.set(e.pointerId, {x, y, cx:e.clientX, cy:e.clientY});
  playing = false;
  if(pts.size === 2){
    // 描きかけの 線は 取り消す(2 本めの 指は 画面を 動かす ため)
    if(curStroke){ const s = cur().strokes; if(s[s.length-1] === curStroke) s.pop(); curStroke = null; redraw(); }
    drag = null;
    const [a, b] = [...pts.values()];
    const L = selLayer();
    if(L && tool === "move"){
      pinch = {d:Math.hypot(b.x-a.x, b.y-a.y), ang:Math.atan2(b.y-a.y, b.x-a.x), s:L.t === "img" ? L.s : L.size, r:L.r || 0};
    } else {
      const v = V();
      vpinch = {d:Math.hypot(b.cx-a.cx, b.cy-a.cy), ang:Math.atan2(b.cy-a.cy, b.cx-a.cx), mx:(a.cx+b.cx)/2, my:(a.cy+b.cy)/2, z:v.z, r:v.r, x:v.x, y:v.y};
    }
    return;
  }
  if(pts.size > 2) return;
  if(tool === "move"){
    P.selL = hit(x, y); syncSide();
    const L = selLayer();
    if(L) drag = {x, y, lx:L.x, ly:L.y};
    else { const v = V(); drag = {view:true, cx:e.clientX, cy:e.clientY, vx:v.x, vy:v.y}; }   // 何も ない 所は 画面を ずらす
    redraw();
  } else if(tool === "pen"){
    curStroke = {c:penCol, w:penW * 2, p:[+x.toFixed(1), +y.toFixed(1)]};
    cur().strokes.push(curStroke); redraw();
  } else if(tool === "fill"){
    fillAt(x, y);
  } else eraseAt(x, y);
});
cv.addEventListener("pointermove", e=>{
  if(!pts.has(e.pointerId)) return;
  const [x, y] = toDoc(e);
  pts.set(e.pointerId, {x, y, cx:e.clientX, cy:e.clientY});
  if(pts.size === 2 && (pinch || vpinch)){
    const [a, b] = [...pts.values()];
    if(pinch){
      const L = selLayer(); if(!L) return;
      const k = Math.hypot(b.x-a.x, b.y-a.y) / Math.max(1, pinch.d);
      if(L.t === "img") L.s = Math.max(.05, pinch.s * k); else L.size = Math.max(16, Math.min(260, Math.round(pinch.s * k)));
      L.r = Math.round(pinch.r + (Math.atan2(b.y-a.y, b.x-a.x) - pinch.ang) * 180/Math.PI);
      syncSide(); changed(); return;
    }
    const v = V(), k = Math.hypot(b.cx-a.cx, b.cy-a.cy) / Math.max(1, vpinch.d);
    v.z = Math.max(.2, Math.min(6, vpinch.z * k));
    v.r = Math.round((vpinch.r + (Math.atan2(b.cy-a.cy, b.cx-a.cx) - vpinch.ang) * 180/Math.PI) * 10) / 10;
    v.x = vpinch.x + (a.cx+b.cx)/2 - vpinch.mx; v.y = vpinch.y + (a.cy+b.cy)/2 - vpinch.my;
    applyView(); return;
  }
  if(drag && drag.view){ const v = V(); v.x = drag.vx + e.clientX - drag.cx; v.y = drag.vy + e.clientY - drag.cy; applyView(); return; }
  if(drag){ const L = selLayer(); L.x = drag.lx + x - drag.x; L.y = drag.ly + y - drag.y; changed(); return; }
  if(curStroke){
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [], evs = co.length ? co : [e];
    for(const ev of evs){ const [px, py] = toDoc(ev); const p = curStroke.p;
      if(Math.hypot(px - p[p.length-2], py - p[p.length-1]) >= 3) p.push(+px.toFixed(1), +py.toFixed(1)); }
    redraw(); return;
  }
  if(tool === "erase") eraseAt(x, y);
});
function up(e){
  pts.delete(e.pointerId);
  if(pts.size < 2){ if(vpinch) viewChanged(); pinch = null; vpinch = null; }
  if(!pts.size){
    if(drag && drag.view) viewChanged();
    else if(curStroke || drag) changed();
    curStroke = null; drag = null;
  }
}
cv.addEventListener("pointerup", up);
cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", e=>{
  e.preventDefault();
  const L = selLayer();
  const k = Math.exp(-e.deltaY * .0015);
  if(L && tool === "move" && !e.ctrlKey){
    if(e.shiftKey) L.r = Math.round((L.r || 0) + e.deltaY * .1);
    else if(L.t === "img") L.s = Math.max(.05, L.s * k); else L.size = Math.max(16, Math.min(260, Math.round(L.size * k)));
    syncSide(); changed();
    clearTimeout(cv.wt); cv.wt = setTimeout(()=> window.Oboeru && Oboeru.check(), 300);
    return;
  }
  // 何も 選んで いない とき(か Ctrl): 画面を 拡大・縮小、Shift で 回転
  const v = V();
  if(e.shiftKey) v.r = Math.round(v.r + e.deltaY * .05); else v.z = Math.max(.2, Math.min(6, v.z * k));
  viewChanged();
}, {passive:false});
$("stage").addEventListener("wheel", e=>{ if(e.target === $("stage")){ e.preventDefault(); const v = V(); v.z = Math.max(.2, Math.min(6, v.z * Math.exp(-e.deltaY * .0015))); viewChanged(); } }, {passive:false});
$("vPlus").onclick = ()=>{ const v = V(); v.z = Math.min(6, v.z * 1.25); viewChanged(); };
$("vMinus").onclick = ()=>{ const v = V(); v.z = Math.max(.2, v.z / 1.25); viewChanged(); };
$("vRotL").onclick = ()=>{ const v = V(); v.r = Math.round(v.r - 15); viewChanged(); };
$("vRotR").onclick = ()=>{ const v = V(); v.r = Math.round(v.r + 15); viewChanged(); };
$("vReset").onclick = ()=>{ P.view = {z:1, r:0, x:0, y:0}; viewChanged(); };
document.querySelectorAll("#tools [data-tool]").forEach(b=> b.onclick = ()=>{ tool = b.dataset.tool; playing = false; syncTools(); redraw(); });
addEventListener("keydown", e=>{
  if(e.target.matches("input,textarea,select")) return;
  const L = selLayer();
  if((e.key === "Delete" || e.key === "Backspace") && L){ e.preventDefault(); $("del").click(); }
});

/* ---------------- 右の 欄の 操作 ---------------- */
$("lsz").oninput = e=>{ const L = selLayer(); if(!L) return; const v = +e.target.value;
  if(L.t === "img") L.s = v; else L.size = Math.round(v * 90); $("lszV").textContent = v.toFixed(2); changed(); };
$("lrot").oninput = e=>{ const L = selLayer(); if(!L) return; L.r = +e.target.value; $("lrotV").textContent = L.r; changed(); };
$("tol").oninput = e=> $("tolV").textContent = e.target.value;
$("bgCut").onclick = async ()=>{
  const L = selLayer(); if(!L || L.t !== "img") return;
  const A = ASSETS.get(L.a);
  const c = LS.removeBg(A.img, +$("tol").value);
  const b = LS.bbox([c]);
  if(!b){ toast("ぜんぶ 消えて しまうので やめました。「消す強さ」を 下げて ください"); return; }
  const o = document.createElement("canvas"); o.width = b.w; o.height = b.h;
  o.getContext("2d").drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  L.a = await addAssetFromCanvas(o);
  changed(); toast("まわりの 色を 消しました"); window.Oboeru && Oboeru.check();
};
$("flip").onclick = ()=>{ const L = selLayer(); if(!L) return; L.fl = !L.fl; changed(); };
$("up").onclick = ()=>{ const st = cur(), i = P.selL; if(i < 0 || i >= st.layers.length - 1) return;
  [st.layers[i], st.layers[i+1]] = [st.layers[i+1], st.layers[i]]; P.selL++; syncSide(); changed(); };
$("down").onclick = ()=>{ const st = cur(), i = P.selL; if(i <= 0) return;
  [st.layers[i], st.layers[i-1]] = [st.layers[i-1], st.layers[i]]; P.selL--; syncSide(); changed(); };
$("del").onclick = ()=>{ const st = cur(); if(P.selL < 0) return; st.layers.splice(P.selL, 1); P.selL = -1; syncSide(); changed(); };

function makeSw(id, cols, onPick){
  const box = $(id);
  cols.forEach(c=>{ const b = document.createElement("button"); b.dataset.c = c; b.style.background = c; b.title = c;
    b.onclick = ()=>{ onPick(c); swSync(id, c); }; box.appendChild(b); });
}
makeSw("penCol", PEN_COLS, c=> penCol = c);
makeSw("tCol", TEXT_COLS, c=>{ tCol = c; const L = selLayer(); if(L && L.t === "text"){ L.color = c; changed(); } });
makeSw("tSt", ST_COLS, c=>{ tSt = c; const L = selLayer(); if(L && L.t === "text"){ L.stroke = c; changed(); } });
$("penW").oninput = e=>{ penW = +e.target.value; $("penWV").textContent = penW; };
$("clearDraw").onclick = ()=>{ cur().strokes = []; changed(); };
$("clearFill").onclick = ()=>{ cur().fills = []; changed(); };
$("fillTol").oninput = e=> $("fillTolV").textContent = e.target.value;
const textL = () => { const L = selLayer(); return L && L.t === "text" ? L : null; };
$("tText").oninput = e=>{ const L = textL(); if(L){ L.text = e.target.value || " "; syncLayerName(); changed(); } };
function syncLayerName(){ const d = $("layers").querySelector(".on span"); const L = selLayer(); if(d && L) d.textContent = L.t === "img" ? "画像" : L.text; }
$("tFont").onchange = e=>{ const L = textL(); if(L){ L.font = e.target.value; changed(); } };
$("tSize").oninput = e=>{ $("tSizeV").textContent = e.target.value; const L = textL(); if(L){ L.size = +e.target.value; changed(); } };
$("tSw").oninput = e=>{ $("tSwV").textContent = e.target.value; const L = textL(); if(L){ L.sw = +e.target.value; changed(); } };
$("tAdd").onclick = ()=>{
  const text = $("tText").value.trim() || "ありがとう";
  const st = cur();
  const hasImg = st.layers.some(L=> L.t === "img");
  st.layers.push({t:"text", text, x:DW/2, y:hasImg ? DH*.82 : DH/2, size:+$("tSize").value, color:tCol, stroke:tSt, sw:+$("tSw").value, font:$("tFont").value, r:0});
  P.selL = st.layers.length - 1; tool = "move"; syncTools(); syncSide(); changed();
};
document.querySelectorAll("[data-tp]").forEach(b=> b.onclick = ()=>{ const L = textL() || selLayer(); if(!L) return;
  const h = layerBox(L).h; L.y = b.dataset.tp === "top" ? h/2 + 24 : DH - h/2 - 24; changed(); });

FX.forEach(([v, label])=>{ const b = document.createElement("button"); b.dataset.v = v; b.textContent = label;
  b.onclick = ()=>{ if(P.mode !== "anim"){ toast("上の「動く」に すると 使えます"); return; }
    cur().fx = v; syncSide(); changed(); playing = v !== "none"; playT0 = performance.now(); };
  $("fx").appendChild(b); });
$("fxT").onclick = e=>{ const b = e.target.closest("[data-v]"); if(!b) return; cur().fxT = b.dataset.v; syncSide(); changed(); };
$("boil").onclick = ()=>{
  if(P.mode !== "anim"){ toast("上の「動く」に すると 使えます"); return; }
  const st = cur(); st.boil = !st.boil; syncSide(); changed(); playing = st.boil || st.fx !== "none"; playT0 = performance.now();
};
$("boilA").oninput = e=>{ cur().boilA = +e.target.value; $("boilAV").textContent = (+e.target.value).toFixed(1); changed(); };
$("dur").onclick = e=>{ const b = e.target.closest("[data-v]"); if(!b) return; cur().dur = +b.dataset.v; syncSide(); changed(); };
$("play").onclick = ()=>{ playing = !playing; playT0 = performance.now(); $("play").textContent = playing ? "■ 止める" : "▶ 動きを見る"; redraw(); };
$("edge").oninput = e=>{ P.edge = +e.target.value; $("edgeV").textContent = P.edge; changed(); clearTimeout(thumbT); thumbT = setTimeout(()=> drawThumbs(), 300); };
$("setMain").onclick = ()=>{ P.main = P.sel; drawThumbs(); changed(); toast("メイン画像と タブ画像に します"); };
$("dupS").onclick = ()=>{ if(P.sel + 1 >= P.count){ toast("となりが ありません"); return; }
  P.stamps[P.sel + 1] = JSON.parse(JSON.stringify(cur())); drawThumbs(P.sel + 1); changed(); toast(String(P.sel + 2).padStart(2,"0") + " に 写しました"); };
$("clrS").onclick = ()=>{ if(isEmpty(cur()) || confirm("この スタンプを 空に しますか？")){ P.stamps[P.sel] = newStamp(); P.selL = -1; syncSide(); changed(); } };
$("tabs").onclick = e=>{ const b = e.target.closest("[data-p]"); if(!b) return;
  [...$("tabs").children].forEach(x=> x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach(p=> p.classList.toggle("on", p.id === b.dataset.p));
  if(b.dataset.p === "pD" && tool === "move"){ tool = "pen"; syncTools(); }
  if(b.dataset.p !== "pD" && (tool === "pen" || tool === "fill" || tool === "erase") && b.dataset.p === "pE"){ tool = "move"; syncTools(); }
};
$("mode").onclick = e=>{ const b = e.target.closest("[data-v]"); if(!b || b.dataset.v === P.mode) return;
  P.mode = b.dataset.v; playing = false; syncAll(); changed(); };
$("count").onchange = e=>{ P.count = +e.target.value; syncAll(); changed(); };

/* ---------------- 書き出し ---------------- */
function fitInto(src, box, W, H, pad, exact){
  // box(切る 四角)を W×H の 中に おさめる。exact なら W×H ちょうど
  const s = Math.min((W - pad*2) / box.w, (H - pad*2) / box.h);
  const dw = box.w * s, dh = box.h * s;
  const w = exact ? W : even(dw + pad*2), h = exact ? H : even(dh + pad*2);
  const c = document.createElement("canvas"); c.width = Math.min(w, W); c.height = Math.min(h, H);
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
  g.drawImage(src, box.x, box.y, box.w, box.h, (c.width - dw)/2, (c.height - dh)/2, dw, dh);
  return c;
}
const toPng = c => new Promise(res=> c.toBlob(res, "image/png"));
async function buildStamp(st){
  const errs = [];
  if(isEmpty(st)) return {errs:["からっぽです"]};
  if(P.mode === "static"){
    const full = renderFull(st, 0), b = LS.bbox([full]);
    if(!b) return {errs:["絵が 見えません(キャンバスの 外かも)"]};
    const c = fitInto(full, b, 370, 320, 10, false);
    const blob = await toPng(c);
    if(blob.size > 1024*1024) errs.push("1MB を こえて います");
    return {blob, w:c.width, h:c.height, errs, frames:[full], box:b};
  }
  const D = st.dur, N = Math.max(5, Math.min(20, Math.round(D * 10))), loops = Math.max(1, Math.min(4, Math.floor(4 / D)));
  const frames = Array.from({length:N}, (_, i)=> renderFull(st, i / N));
  const b = LS.bbox(frames);
  if(!b) return {errs:["絵が 見えません(キャンバスの 外かも)"]};
  if(st.fx === "none" && !st.boil) errs.push("動きが ついて いません(ぜんぶ 同じ 絵だと 申請で はじかれます)");
  const pad = 2;
  const s = Math.min(320 / (b.w + pad*2), 270 / (b.h + pad*2));
  const w = Math.min(320, Math.round((b.w + pad*2) * s)), h = Math.min(270, Math.round((b.h + pad*2) * s));
  const outs = frames.map(f=>{ const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(f, b.x - pad, b.y - pad, b.w + pad*2, b.h + pad*2, 0, 0, w, h); return c; });
  if(w < 270 && h < 270) errs.push("縦か 横が 270px に とどきません");
  const blob = await LS.encodeApng(outs, Math.round(D*1000/N), loops);
  if(blob.size > 1024*1024) errs.push("1MB を こえて います");
  return {blob, w, h, errs, frames, box:b, N, D, loops};
}
async function buildMainTab(st){
  const r = {};
  if(isEmpty(st)) return null;
  if(P.mode === "static"){
    const full = renderFull(st, 0), b = LS.bbox([full]);
    r.main = await toPng(fitInto(full, b, 240, 240, 10, true));
    r.tab = await toPng(fitInto(full, b, 96, 74, 4, true));
  } else {
    const st2 = await buildStamp(st);
    const fr = st2.frames.map(f=> fitInto(f, st2.box, 240, 240, 6, true));
    r.main = await LS.encodeApng(fr, Math.round(st2.D*1000/st2.N), st2.loops);
    r.tab = await toPng(fitInto(st2.frames[0], st2.box, 96, 74, 4, true));
  }
  return r;
}

/* ---------------- 点検と 申請の 準備 ---------------- */
let built = null;
const META = [["mTitleJa","titleJa"],["mTitleEn","titleEn"],["mDescJa","descJa"],["mDescEn","descEn"],["mCreator","creator"],["mCopy","copy"]];
function metaCheck(){
  const out = [];
  META.forEach(([id, k])=>{
    const el = $(id), v = el.value, max = +el.dataset.max;
    const cnt = el.parentElement.querySelector(".cnt");
    const bad = !v.trim() || [...v].length > max || (!!el.dataset.ascii && /[^\x20-\x7E]/.test(v));
    cnt.textContent = [...v].length + " / " + max;
    cnt.classList.toggle("ng", !!bad);
    if(bad) out.push(k);
  });
  return out;
}
META.forEach(([id, k])=> $(id).addEventListener("input", e=>{ P.meta[k] = e.target.value; metaCheck(); setDirty(true); autosaveSoon(); }));
$("applyBtn").onclick = async ()=>{
  playing = false;
  $("apply").classList.add("on");
  META.forEach(([id, k])=> $(id).value = P.meta[k] || "");
  $("stKind").textContent = RULE[P.mode].kind; $("stCount").textContent = P.count;
  const box = $("chk"); box.innerHTML = ""; built = [];
  $("applyInfo").textContent = "点検して います…";
  let ng = 0;
  for(let i=0;i<P.count;i++){
    const r = await buildStamp(P.stamps[i]);
    built.push(r);
    const d = document.createElement("div");
    d.className = "ck" + (r.errs.length ? " ng" : "");
    const name = String(i+1).padStart(2,"0") + ".png";
    d.innerHTML = `<div class="im">${r.blob ? `<img src="${URL.createObjectURL(r.blob)}" alt="">` : ""}</div>` +
      `<p><b>${name}</b> ${r.blob ? `${r.w}×${r.h}・${Math.ceil(r.blob.size/1024)}KB` : ""}<br>` +
      (r.errs.length ? r.errs.map(e=> "<b>！</b> " + e).join("<br>") : '<span class="ok">✓ 決まりどおり</span>') + "</p>";
    d.onclick = ()=>{ $("apply").classList.remove("on"); P.sel = i; P.selL = -1; syncAll(); };
    box.appendChild(d);
    if(r.errs.length) ng++;
    $("applyInfo").textContent = `点検して います… ${i+1} / ${P.count}`;
    await new Promise(r=> setTimeout(r, 0));
  }
  const mt = metaCheck();
  $("applyInfo").textContent = (ng ? `なおす ところが ${ng} 個 あります(押すと その スタンプへ)。` : "スタンプは ぜんぶ 決まりどおりです。") +
    (mt.length ? " 申請に 書く ことが まだ 足りません。" : "");
};
$("applyBack").onclick = ()=>{ $("apply").classList.remove("on"); syncAll(); };
$("copyMeta").onclick = async ()=>{
  const t = `タイトル: ${P.meta.titleJa}\nTitle: ${P.meta.titleEn}\n説明文: ${P.meta.descJa}\nDescription: ${P.meta.descEn}\nクリエイター名: ${P.meta.creator}\nコピーライト: ${P.meta.copy}\n`;
  try{ await navigator.clipboard.writeText(t); toast("コピーしました"); } catch(e){ toast("コピー できませんでした"); }
};
$("zipBtn").onclick = async ()=>{
  if(!built) return;
  const bad = built.filter(r=> !r.blob).length;
  if(bad){ toast(`からっぽ などで 作れない スタンプが ${bad} 個 あります`); return; }
  $("zipInfo").textContent = "zip を 作って います…";
  const files = built.map((r, i)=> ({name:String(i+1).padStart(2,"0") + ".png", blob:r.blob}));
  const mt = await buildMainTab(P.stamps[P.main]);
  files.push({name:"main.png", blob:mt.main}, {name:"tab.png", blob:mt.tab});
  const zip = await LS.makeZip(files);
  const a = document.createElement("a"); a.href = URL.createObjectURL(zip);
  a.download = (P.name || "line_stamp") + "_" + P.count + ".zip"; a.click();
  const ngs = built.filter(r=> r.errs.length).length;
  $("zipInfo").textContent = `${a.download} を 保存しました(スタンプ ${P.count} 個＋main.png＋tab.png・${Math.ceil(zip.size/1024)}KB)。` +
    (ngs ? ` まだ なおす ところが ${ngs} 個 あります。` : "");
};

/* ---------------- 作品の 保存(この ブラウザの IndexedDB) ---------------- */
function idb(){ return new Promise((res, rej)=>{ const r = indexedDB.open("line-stamp-kobo", 1);
  r.onupgradeneeded = ()=>{ r.result.createObjectStore("works"); r.result.createObjectStore("kv"); };
  r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error); }); }
async function db(store, mode, fn){
  const d = await idb();
  return new Promise((res, rej)=>{ const tx = d.transaction(store, mode), q = fn(tx.objectStore(store));
    tx.oncomplete = ()=> res(q && q.result); tx.onerror = ()=> rej(tx.error); });
}
function usedAssets(){
  const ids = new Set();
  P.stamps.forEach(st=>{ st.layers.forEach(L=>{ if(L.t === "img") ids.add(L.a); }); (st.fills || []).forEach(f=> ids.add(f.a)); });
  const out = {}; ids.forEach(id=>{ const A = ASSETS.get(id); if(A) out[id] = A.url; });
  return out;
}
function thumbUrl(){
  const st = P.stamps[P.main]; if(isEmpty(st)) return "";
  const c = document.createElement("canvas"); c.width = 185; c.height = 160;
  c.getContext("2d").drawImage(renderFull(st, 0), 0, 0, 185, 160);
  return c.toDataURL("image/png");
}
const record = () => ({id:P.id, name:P.name, updated:Date.now(), project:JSON.parse(JSON.stringify(P)), assets:usedAssets(), thumb:thumbUrl()});
let asT = 0;
function autosaveSoon(){ clearTimeout(asT); asT = setTimeout(()=>{ db("kv", "readwrite", s=> s.put({rec:record(), dirty}, "cur")).catch(()=>{}); }, 800); }
async function restore(rec){
  for(const [id, url] of Object.entries(rec.assets || {})) if(!ASSETS.has(id)) ASSETS.set(id, {img: await loadImg(url), url});
  P = Object.assign(newProject(), rec.project);
  while(P.stamps.length < 40) P.stamps.push(newStamp());
  P.selL = -1;
}
async function save(asNew){
  if(asNew || !P.name){
    const n = prompt("作品の 名前", P.name || "スタンプ");
    if(!n) return;
    if(asNew && P.name) P.id = uid();
    P.name = n.trim().slice(0, 40);
  }
  await db("works", "readwrite", s=> s.put(record(), P.id));
  setDirty(false); autosaveSoon(); toast("保存しました");
}
$("saveBtn").onclick = ()=> save(false);
$("saveAsBtn").onclick = ()=> save(true);
$("newBtn").onclick = ()=>{
  if(dirty && !confirm("保存して いない ところが あります。新しく はじめますか？")) return;
  P = newProject(); setDirty(false); syncAll(); autosaveSoon();
  if(window.Oboeru) Oboeru.cut();
};
async function showWorks(){
  const list = (await db("works", "readonly", s=> s.getAll())) || [];
  list.sort((a, b)=> b.updated - a.updated);
  const box = $("wlist"); box.innerHTML = list.length ? "" : '<p class="note">まだ 保存した 作品は ありません。</p>';
  for(const w of list){
    const d = document.createElement("div"); d.className = "wk";
    d.innerHTML = `${w.thumb ? `<img src="${w.thumb}" alt="">` : '<img alt="">'}<b></b><small>${new Date(w.updated).toLocaleString("ja-JP")}</small><button title="消す">✕</button>`;
    d.querySelector("b").textContent = w.name || "名前なし";
    d.onclick = async e=>{
      if(e.target.tagName === "BUTTON"){
        e.stopPropagation();
        if(confirm(`「${w.name}」を 消しますか？ もとに もどせません`)){ await db("works", "readwrite", s=> s.delete(w.id)); showWorks(); }
        return;
      }
      if(dirty && !confirm("保存して いない ところが あります。開きますか？")) return;
      await restore(w); setDirty(false); $("works").classList.remove("on"); syncAll(); autosaveSoon();
      if(window.Oboeru) Oboeru.cut();
    };
    box.appendChild(d);
  }
  $("works").classList.add("on");
}
$("worksBtn").onclick = showWorks;
$("worksClose").onclick = ()=> $("works").classList.remove("on");
addEventListener("keydown", e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"){ e.preventDefault(); save(e.shiftKey); }
});
addEventListener("beforeunload", e=>{ if(dirty){ e.preventDefault(); e.returnValue = ""; } });

/* ---------------- はじまり ---------------- */
(async ()=>{
  try{
    const c = await db("kv", "readonly", s=> s.get("cur"));
    if(c && c.rec){ await restore(c.rec); dirty = !!c.dirty; }
  }catch(e){}
  setDirty(dirty);
  fit(); syncAll(); requestAnimationFrame(loop);
  document.fonts && document.fonts.ready.then(()=>{ drawThumbs(); redraw(); });
  const go = ()=>{
    if(!window.Oboeru) return;
    // もどす: 作品の 中身(絵そのものは ASSETS に あるので 入れない)
    Oboeru.start({key:"line-stamp-kobo", save:false,
      get: ()=> JSON.parse(JSON.stringify(P)),
      set: d=>{ P = d; while(P.stamps.length < 40) P.stamps.push(newStamp()); if(P.selL >= cur().layers.length) P.selL = -1;
        playing = false; drawThumbs(); syncAll(); setDirty(true); autosaveSoon(); }});
  };
  if(document.readyState === "complete") setTimeout(go, 0); else addEventListener("load", ()=> setTimeout(go, 0));
})();
