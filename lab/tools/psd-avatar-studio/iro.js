/* 色ちがい: 写真や配色帳から色をもらって、かみ・ひとみ・ふくの色をかえる。
   線(色の薄いところ)・白・肌の色はさわらない。もとの絵は l.iroOrig に取っておく。 */
"use strict";
(()=>{
const PARTS = [
  {id:"hair",  label:"かみ",   roles:["frontHair","backHair","brow"]},
  {id:"eye",   label:"ひとみ", roles:["iris"]},
  {id:"cloth", label:"ふく",   roles:["body","chest","arm"], skin:true},
];
const iro = {pal:[], as:{hair:-1, eye:-1, cloth:-1}};
const key = ()=> "psdIro:" + psdName;
const hex = c => "#" + c.map(v=> v.toString(16).padStart(2,"0")).join("");
const unhex = h => [1,3,5].map(i=> parseInt(h.slice(i, i+2), 16));

function rgb2hsl(r, g, b){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
  if(mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
  let h = mx === r ? (g-b)/d + (g < b ? 6 : 0) : mx === g ? (b-r)/d + 2 : (r-g)/d + 4;
  return [h/6, s, l];
}
function hsl2rgb(h, s, l){
  if(s === 0){ const v = Math.round(l*255); return [v,v,v]; }
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t =>{ t = (t%1+1)%1;
    return t < 1/6 ? p+(q-p)*6*t : t < 1/2 ? q : t < 2/3 ? p+(q-p)*(2/3-t)*6 : p; };
  return [f(h+1/3), f(h), f(h-1/3)].map(v=> Math.round(v*255));
}
const isSkin = (h, s, l)=> (h < 0.14 || h > 0.95) && s > 0.04 && s < 0.85 && l > 0.6;

const orig = l => l.iroOrig || l.canvas;
const partLayers = P => layers.filter(l=> P.roles.includes(l.role));

/* 塗りかえる重み。白っぽいところ(シャツ・光)と肌は残す */
function weight(h, s, l, P){
  if(P.skin && isSkin(h, s, l)) return 0;
  const base = s > 0.25 ? 1 : 1 - sstep(0.55, 0.72, l);
  // 明るくて色のうすいところ(白い服の影の水色・灰色)も残す
  return base * (1 - sstep(0.72, 0.82, l) * (1 - sstep(0.45, 0.7, s)));
}
/* その部分の明るさの分布(暗い 10%・まんなか・明るい 90%) */
function lumStats(P){
  const hist = new Float64Array(101); let n = 0;
  for(const l of partLayers(P)){
    const c = orig(l), d = c.getContext("2d").getImageData(0,0,c.width,c.height).data;
    const stepPx = Math.max(1, Math.floor(d.length/4/6000));
    for(let i=0;i<d.length;i+=4*stepPx){
      if(d[i+3] < 128) continue;
      const [h,s,li] = rgb2hsl(d[i],d[i+1],d[i+2]);
      const w = weight(h, s, li, P);
      if(w < 0.5) continue;
      hist[Math.round(li*100)] += 1; n++;
    }
  }
  if(n < 20) return null;
  const at = q =>{ let acc = 0; for(let i=0;i<=100;i++){ acc += hist[i]; if(acc >= q*n) return i/100; } return 1; };
  return {lo:at(0.1), mid:at(0.5), hi:at(0.9)};
}

/* 明るさの差はそのまま残して、色だけ目当ての色にする(グラデーションマップに近い) */
function recolorLayer(l, P, st, tgt){
  const src = orig(l);
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0,0,c.width,c.height), d = im.data;
  const [tH, tS, tL] = tgt;
  const C = (1 - Math.abs(2*tL - 1)) * tS;           // 色の濃さ(彩度ではなく)を保つ
  const hiL = Math.min(0.96, tL + 0.32);
  const mid = Math.max(0.05, st.mid), top = Math.max(mid + 0.02, st.hi);
  for(let i=0;i<d.length;i+=4){
    if(d[i+3] === 0) continue;
    const [h,s,li] = rgb2hsl(d[i],d[i+1],d[i+2]);
    const w = weight(h, s, li, P) * sstep(0.35, 0.85, d[i+3]/255);   // うすく重ねた影はそのまま
    if(w <= 0) continue;
    // 暗いほうは 0 に向かって(線は黒いまま)、明るいほうは 光の色へ
    const nl = li <= mid ? tL * Math.pow(li / mid, 0.85)
                         : tL + Math.min(1, (li - mid) / (top - mid) * 0.8) * (hiL - tL);
    const den = 1 - Math.abs(2*nl - 1);
    const ns = den > 0.01 ? Math.min(1, C / den) : 0;
    const [r,gg,b] = hsl2rgb(tH, ns, nl);
    d[i] = Math.round(d[i] + (r - d[i])*w);
    d[i+1] = Math.round(d[i+1] + (gg - d[i+1])*w);
    d[i+2] = Math.round(d[i+2] + (b - d[i+2])*w);
  }
  g.putImageData(im, 0, 0);
  if(!l.iroOrig) l.iroOrig = l.canvas;
  l.canvas = c;
}

function apply(){
  for(const P of PARTS){
    const ls = partLayers(P);
    const idx = iro.as[P.id], col = iro.pal[idx];
    if(!col){ ls.forEach(l=>{ if(l.iroOrig){ l.canvas = l.iroOrig; delete l.iroOrig; } }); continue; }
    const st = lumStats(P);
    if(!st) continue;
    const tgt = rgb2hsl(...unhex(col));
    tgt[1] = Math.max(tgt[1], 0.18);   // 白っぽい色をもらっても、少しは色が見えるように
    tgt[2] = Math.max(0.28, Math.min(0.68, tgt[2]));   // 明るすぎ・暗すぎだと 影や線が消えるので まんなか寄りに
    ls.forEach(l=> recolorLayer(l, P, st, tgt));
  }
  try{ localStorage.setItem(key(), JSON.stringify(iro)); }catch(e){}
  ui();
}

function ui(){
  const pal = $("iroPal");
  pal.innerHTML = "";
  iro.pal.forEach(c=>{ const i = document.createElement("i"); i.style.background = c; pal.appendChild(i); });
  const box = $("iroParts"); box.innerHTML = "";
  for(const P of PARTS){
    const row = document.createElement("div"); row.className = "iropart";
    const b = document.createElement("b"); b.textContent = P.label;
    const btn = document.createElement("button");
    const col = iro.pal[iro.as[P.id]];
    if(col) btn.style.background = col;
    btn.title = P.label + "の色をかえる";
    const n = partLayers(P).length;
    btn.disabled = !n || !iro.pal.length;
    btn.onclick = ()=>{
      // もと → 1色め → 2色め … → もと
      const v = iro.as[P.id] + 1;
      iro.as[P.id] = v >= iro.pal.length ? -1 : v;
      apply();
    };
    const sp = document.createElement("span");
    sp.textContent = !n ? "この絵にはない" : col ? "" : "もとの色";
    row.append(b, btn, sp);
    box.appendChild(row);
  }
}

function setPalette(cols){
  iro.pal = cols.slice(0, 6);
  // はじめは 色の濃い順に かみ → ふく → ひとみ
  const order = iro.pal.map((c,i)=>[i, rgb2hsl(...unhex(c))[1]]).sort((a,b)=> b[1]-a[1]).map(a=>a[0]);
  iro.as = {hair: order[0] ?? -1, cloth: order[1] ?? -1, eye: order[2] ?? order[0] ?? -1};
  apply();
}

/* 写真から 6 色。中央値分割(GIF 書き出しと同じもの)で分けて、似た色はまとめる */
async function fromPhoto(file){
  const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=> res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, 120 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width*s)); c.height = Math.max(1, Math.round(img.height*s));
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0,0,c.width,c.height).data, px = [];
  for(let i=0;i<d.length;i+=4) if(d[i+3] > 128) px.push([d[i],d[i+1],d[i+2]]);
  if(!px.length) return;
  const cand = medianCut(px, 16).map(c=>({c, hsl:rgb2hsl(...c)}))
    .sort((a,b)=> b.hsl[1] - a.hsl[1]);
  const out = [];
  for(const k of cand){
    if(out.some(o=> Math.abs(o.c[0]-k.c[0]) + Math.abs(o.c[1]-k.c[1]) + Math.abs(o.c[2]-k.c[2]) < 70)) continue;
    out.push(k); if(out.length >= 6) break;
  }
  setPalette(out.map(o=> hex(o.c)));
  $("iroInfo").textContent = "写真から色をもらいました。丸をおすと、その部分の色が順にかわります。";
}

$("iroPhoto").onclick = ()=> $("iroFile").click();
$("iroFile").onchange = e=>{ const f = e.target.files[0]; if(f) fromPhoto(f); e.target.value = ""; };
$("iroBook").onclick = async ()=>{
  const box = $("iroBookBox");
  if(box.firstChild){ box.innerHTML = ""; return; }
  const m = await import("../skin/haishoku.js");
  box.appendChild(m.haishokuPicker(p=>{
    setPalette([...p.acc, p.bg[0], p.bg[1], p.text].filter((c,i,a)=> a.indexOf(c) === i));
    box.innerHTML = "";
    $("iroInfo").textContent = "「" + p.name + "」の色にしました。";
  }));
};
$("iroShuffle").onclick = ()=>{
  if(!iro.pal.length) return;
  const n = iro.pal.length, used = new Set();
  for(const P of PARTS){
    let v, tries = 0;
    do { v = Math.floor(Math.random()*n); } while(used.has(v) && ++tries < 20);
    used.add(v); iro.as[P.id] = v;
  }
  apply();
};
$("iroReset").onclick = ()=>{ PARTS.forEach(P=> iro.as[P.id] = -1); apply(); };

/* 読みこんだあとに、その絵で前に選んだ色をもどす */
window.iroAfterLoad = ()=>{
  try{
    const s = JSON.parse(localStorage.getItem(key()) || "null");
    iro.pal = s && Array.isArray(s.pal) ? s.pal : [];
    iro.as = s && s.as ? {hair:-1, eye:-1, cloth:-1, ...s.as} : {hair:-1, eye:-1, cloth:-1};
  }catch(e){ iro.pal = []; }
  if(iro.pal.length) apply(); else ui();
};
ui();
if(layers.length) window.iroAfterLoad();
})();
