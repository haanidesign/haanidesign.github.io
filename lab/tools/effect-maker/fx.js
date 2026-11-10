/* エフェクトの 描きかた。エフェクトメーカーと 総合工房で 同じものを 使う。 */
/* ================= 色 ================= */
export const PALS = [
  ['gold','金','#FFFFFF','#FFF1A6','#FFB72B'],
  ['white','白光','#FFFFFF','#F3F7FF','#A9C8FF'],
  ['fire','炎','#FFFBD9','#FFC93C','#F2541B'],
  ['ice','氷','#FFFFFF','#C2F3FF','#35A8F0'],
  ['denki','電気','#FFFFFF','#EBD9FF','#9A5BFF'],
  ['heal','回復','#FFFFFF','#D9FFC4','#3FC768'],
  ['pink','ピンク','#FFFFFF','#FFD3E3','#F2689A'],
  ['yami','闇','#F4DCFF','#A050E0','#2E1048'],
  ['anger','赤','#FFFFFF','#FF9F8F','#E3342C'],
  ['smoke','けむり','#FFFFFF','#E6E1D6','#A69F90'],
  ['dust','土','#FFF7E3','#E2CFA6','#A38657'],
  ['mizu','水','#FFFFFF','#C4EEFF','#3D9EE0'],
  ['aki','紅葉','#FFEFB0','#F5A23C','#C9512A'],
  ['gloom','どんより','#FFFFFF','#9C9AD0','#2C2A55'],
  ['ink','墨','#FFFFFF','#BDB8AA','#1E1C14'],
];
export const PAL = Object.fromEntries(PALS.map(p => [p[0], p]));
export const hex = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));

/* ================= 描く道具 ================= */
const TAU = Math.PI*2;
let G = null;   // いま描いているコマの情報
const rnd = i => { const x = Math.sin((i + G.seed*71.37)*127.1 + 311.7)*43758.5453; return x - Math.floor(x); };
const fr  = i => rnd(i + G.f*1013.7 + 0.5);     // コマごとに変わる乱数
export const cl  = t => t < 0 ? 0 : t > 1 ? 1 : t;
const seg = (t,a,b) => cl((t-a)/(b-a));
const lerp = (a,b,t) => a + (b-a)*t;
const eo = t => 1 - Math.pow(1-t,3);
const ei = t => t*t*t;
const back = t => { const c1 = 1.9, c3 = c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };

function col(k, a = 1){
  k = cl(k);
  const [p,q,s] = k < .5 ? [G.pal[0],G.pal[1],k*2] : [G.pal[1],G.pal[2],(k-.5)*2];
  return `rgba(${p.map((v,i)=>Math.round(v+(q[i]-v)*s)).join(',')},${a})`;
}
function colTo(k, rgb, s){ // パレットの色から別の色へ寄せる
  k = cl(k);
  const [p,q,u] = k < .5 ? [G.pal[0],G.pal[1],k*2] : [G.pal[1],G.pal[2],(k-.5)*2];
  const c = p.map((v,i)=>v+(q[i]-v)*u);
  return `rgb(${c.map((v,i)=>Math.round(v+(rgb[i]-v)*s)).join(',')})`;
}

// ボイル: 位置でなめらかに変わるゆがみ（コマごとに位相が変わる）
function jp(x, y){
  const a = G.jamp; if (!a) return [x, y];
  const k = G.jk;
  return [
    x + a*(Math.sin(x*k*1.3 + y*k*.7 + G.p1) + .6*Math.sin(x*k*2.9 - y*k*2.1 + G.p2))*.62,
    y + a*(Math.sin(y*k*1.1 - x*k*.9 + G.p3) + .6*Math.sin(y*k*3.1 + x*k*1.7 + G.p4))*.62,
  ];
}
function trace(pts, close, smooth){
  const c = G.c; c.beginPath();
  const q = pts.map(p => jp(p[0], p[1]));
  const n = q.length;
  if (!smooth || n < 3){
    q.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1]));
    if (close) c.closePath();
    return;
  }
  const mid = (a,b) => [(a[0]+b[0])/2, (a[1]+b[1])/2];
  if (close){
    const m0 = mid(q[n-1], q[0]); c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++){ const m = mid(q[i], q[(i+1)%n]); c.quadraticCurveTo(q[i][0], q[i][1], m[0], m[1]); }
    c.closePath();
  } else {
    c.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < n-1; i++){ const m = mid(q[i], q[i+1]); c.quadraticCurveTo(q[i][0], q[i][1], m[0], m[1]); }
    c.lineTo(q[n-1][0], q[n-1][1]);
  }
}
function fill(pts, k, smooth = false, a = 1){
  if (a <= 0.005) return;
  const c = G.c; c.globalAlpha = a; c.fillStyle = typeof k === 'string' ? k : col(k);
  trace(pts, true, smooth); c.fill(); c.globalAlpha = 1;
}
function line(pts, w, k, close = false, smooth = false, a = 1){
  if (w <= 0.2 || a <= 0.005) return;
  const c = G.c; c.globalAlpha = a; c.strokeStyle = typeof k === 'string' ? k : col(k);
  c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
  trace(pts, close, smooth); c.stroke(); c.globalAlpha = 1;
}
function cut(pts, smooth = true){ // 穴をあける
  const c = G.c; c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  trace(pts, true, smooth); c.fill(); c.globalCompositeOperation = 'source-over';
}
const ell = (x,y,rx,ry,n = 40,r0 = 0) => { const p = []; for (let i=0;i<n;i++){ const a=i/n*TAU; const X=Math.cos(a)*rx, Y=Math.sin(a)*ry; p.push([x+X*Math.cos(r0)-Y*Math.sin(r0), y+X*Math.sin(r0)+Y*Math.cos(r0)]);} return p; };
const blob = (x,y,r,n,irr,key) => { const p=[]; for (let i=0;i<n;i++){ const a=i/n*TAU; const rr=r*(1+(rnd(key+i*7.13)-.5)*irr); p.push([x+Math.cos(a)*rr, y+Math.sin(a)*rr]); } return p; };
function circ(x,y,r,k,a = 1){ if (r > .3) fill(ell(x,y,r,r,Math.max(10,Math.min(40,r/2|0))), k, true, a); }
function astro(x,y,r,rot = 0,p = 3.2,n = 48){ // くびれた4本の光
  const pts=[];
  for (let i=0;i<n;i++){
    const a=i/n*TAU, ca=Math.cos(a), sa=Math.sin(a);
    const X=Math.sign(ca)*Math.pow(Math.abs(ca),p)*r, Y=Math.sign(sa)*Math.pow(Math.abs(sa),p)*r;
    pts.push([x+X*Math.cos(rot)-Y*Math.sin(rot), y+X*Math.sin(rot)+Y*Math.cos(rot)]);
  }
  return pts;
}
function spike(x,y,a,r0,r1,w){ // r0 で幅 w、r1 でとがる
  const ca=Math.cos(a), sa=Math.sin(a), px=-sa*w/2, py=ca*w/2, bx=x+ca*r0, by=y+sa*r0;
  return [[bx+px,by+py],[x+ca*r1,y+sa*r1],[bx-px,by-py]];
}
function lens(x0,y0,x1,y1,w){ // 両はしがとがった線
  const dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1, px=-dy/L*w/2, py=dx/L*w/2, mx=(x0+x1)/2, my=(y0+y1)/2;
  return [[x0,y0],[mx+px,my+py],[x1,y1],[mx-px,my-py]];
}
function xf(pts,x,y,a = 0,sx = 1,sy = 1){
  const ca=Math.cos(a), sa=Math.sin(a);
  return pts.map(([X,Y]) => { X*=sx; Y*=sy; return [x+X*ca-Y*sa, y+X*sa+Y*ca]; });
}
const sc = (pts,s,ox,oy) => pts.map(([x,y]) => [ox+(x-ox)*s, oy+(y-oy)*s]);
function star(x,y,ro,ri,n,rot = 0,irr = 0,key = 0,perFrame = false){
  const p=[];
  for (let i=0;i<n*2;i++){
    const a=rot+i/(n*2)*TAU;
    const j = perFrame ? fr(key+i*3.3) : rnd(key+i*3.3);
    const r=i%2 ? ri : ro*(1-irr*.5+irr*j);
    p.push([x+Math.cos(a)*r, y+Math.sin(a)*r]);
  }
  return p;
}
function heart(x,y,s,r0 = 0){
  const p=[]; for (let i=0;i<36;i++){ const a=i/36*TAU; const X=16*Math.pow(Math.sin(a),3), Y=-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a)); p.push([X/16*s, (Y+2)/16*s]); }
  return xf(p,x,y,r0);
}
function drop(x,y,r,r0 = 0){ // しずく（上がとがる）
  const p=[]; for (let i=0;i<28;i++){ const a=i/28*TAU; p.push([r*.82*Math.sin(a)*Math.sin(a/2), -r*Math.cos(a)*.95 + r*.25]); }
  return xf(p,x,y,r0);
}
function radial(x,y,r,stops,a = 1){
  if (r <= 1) return;
  const c=G.c, g=c.createRadialGradient(x,y,0,x,y,r);
  for (const [o,k,al] of stops) g.addColorStop(o, col(k, al));
  c.globalAlpha=a; c.fillStyle=g; c.beginPath(); c.arc(x,y,r,0,TAU); c.fill(); c.globalAlpha=1;
}
// 3段の塗り（ふち→なか→芯）
function cel(fn, steps = [[1,1],[.5,.7],[0,.42]]){ for (const [k,s] of steps) fn(k,s); }

/* ================= エフェクト ================= */
export const CATS = ['光','衝撃','力・魔法','漫符','自然','画面'];
export const FX = [
/* ---------- 光 ---------- */
{id:'juji',cat:'光',name:'十字フラッシュ',desc:'パッと光ってすぐ消える。決めポーズ・目のキラーンに。',uses:['size','width','rot'],def:{pal:'gold',dur:.7,glow:18},peak:.12,
 fn(){ const {cx,cy,u,t,wd}=G;
  const p = t<.12 ? eo(t/.12) : 1-eo(seg(t,.12,1)); if (p<.01) return;
  const L=u*1.7*p, w=u*.11*wd*Math.sqrt(p);
  cel((k,s)=>{
    for (let i=0;i<4;i++) fill(spike(cx,cy,i*TAU/4,0,(i%2?L*.78:L)*(.8+s*.2),w*s*2),k);
    for (let i=0;i<4;i++) fill(spike(cx,cy,TAU/8+i*TAU/4,0,L*.3*(.6+s*.4),w*s*1.1),k);
    circ(cx,cy,w*1.5*s,k);
  });
  const q=seg(t,.04,.7); if (q>0&&q<1) line(ell(cx,cy,u*(.3+1.1*eo(q)),u*(.3+1.1*eo(q)),48),u*.05*wd*(1-q),.5,true,true);
 }},
{id:'kira',cat:'光',name:'キラッ',desc:'くびれた星がはねて消える。物の輝き・ウインク。',uses:['size','rot'],def:{pal:'gold',dur:.6,glow:16},peak:.22,
 fn(){ const {cx,cy,u,t}=G;
  const p = t<.2 ? back(t/.2) : 1-ei(seg(t,.2,1)); if (p<.01) return;
  const r=u*1.25*p, a=t*.6;
  cel((k,s)=>fill(astro(cx,cy,r*s,a,3.1+(1-s)),k));
  [[.78,-.62,.15],[-.7,.58,.3]].forEach(([ox,oy,d])=>{
    const q=seg(t,d,d+.55); if (q<=0||q>=1) return; const s=Math.sin(q*Math.PI);
    fill(astro(cx+ox*u,cy+oy*u,u*.36*s,0,3.2),.5); fill(astro(cx+ox*u,cy+oy*u,u*.18*s,0,3.6),0);
  });
 }},
{id:'kirakira',cat:'光',name:'きらきら',desc:'画面いっぱいに瞬く。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'gold',dur:1.6,glow:14},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(16*A);
  for (let i=0;i<n;i++){
    const cyc=rnd(i*5.3)>.6?2:1, q=(t*cyc+rnd(i*3.1))%1, s=Math.sin(q*Math.PI); if (s<.05) continue;
    const x=rnd(i*7.7)*W, y=rnd(i*9.1)*H, r=u*.3*(.4+rnd(i*2.9)*.8)*s;
    fill(astro(x,y,r,0,3.3),1); fill(astro(x,y,r*.55,0,3.7),0);
  }
 }},
{id:'flare',cat:'光',name:'レンズフレア',desc:'光源とゴースト。ゆっくり脈打つループ。',loop:true,uses:['size','amount','rot'],def:{pal:'gold',dur:2,glow:6},peak:.3,
 fn(){ const {c,cx,cy,u,t,A}=G; const pulse=1+.06*Math.sin(t*TAU);
  radial(cx,cy,u*1.2*pulse,[[0,0,1],[.2,.4,.75],[1,1,0]]);
  c.save(); c.translate(cx,cy); c.scale(1,.04); radial(0,0,u*2.8,[[0,0,.95],[.35,.5,.5],[1,1,0]]); c.restore();
  const n=Math.max(2,Math.round(8*A));
  for (let i=0;i<n;i++){ const a=i/n*TAU+t*TAU/n; fill(spike(cx,cy,a,0,u*(.8+.5*rnd(i*3)),u*.035),.5,false,.6); }
  circ(cx,cy,u*.16,0);
  [[-.55,.18,.12],[.45,.1,.18],[.8,.26,.08],[1.25,.32,.22],[1.6,.14,.3]].forEach(([k,r,al],i)=>{
    const x=cx+k*u*-1.4, y=cy+k*u*-.8, rr=u*r*(1+.05*Math.sin(t*TAU+i));
    const hx=[]; for (let j=0;j<6;j++){ const a=j/6*TAU+.3; hx.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]); }
    fill(hx,i%2?.5:1,false,al); line(hx,u*.012,.5,true,false,al*1.6);
  });
 }},
{id:'hashira',cat:'光',name:'光の柱',desc:'足元から立ちのぼる。変身・召喚・回復に。',uses:['size','width'],def:{pal:'heal',dur:1.4,glow:16},peak:.35,
 fn(){ const {cx,cy,u,t,wd,A}=G;
  const p = t<.2 ? eo(t/.2) : 1-eo(seg(t,.6,1)); if (p<.01) return;
  const gy=cy+u*.9, top=cy-u*4, w=u*.42*wd*p;
  cel((k,s)=>fill([[cx-w*s,gy],[cx-w*s*.6,top],[cx+w*s*.6,top],[cx+w*s,gy]],k),[[1,1],[.5,.62],[0,.26]]);
  line(ell(cx,gy,w*2.2*(1+t),w*.45*(1+t),40),u*.04,.5,true,true,p);
  const n=Math.round(12*A);
  for (let i=0;i<n;i++){ const v=(t*1.6+rnd(i))%1; circ(cx+(rnd(i*3)-.5)*w*2.6, gy-v*u*3.4, u*.035*(1-v), 0, p); }
 }},
{id:'goko',cat:'光',name:'後光',desc:'うしろでゆっくり回る光の帯。神々しい登場に。',loop:true,uses:['size','amount','rot'],def:{pal:'gold',dur:3,glow:10},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const n=2*Math.max(3,Math.round(9*A)); const ro=t*TAU*2/n, R=u*1.9;
  for (let i=0;i<n;i+=2){ const a0=ro+i/n*TAU, a1=ro+(i+1)/n*TAU;
    fill([[cx,cy],[cx+Math.cos(a0)*R,cy+Math.sin(a0)*R],[cx+Math.cos((a0+a1)/2)*R*1.04,cy+Math.sin((a0+a1)/2)*R*1.04],[cx+Math.cos(a1)*R,cy+Math.sin(a1)*R]],.5,false,.5); }
  radial(cx,cy,u*.9,[[0,0,1],[.5,.3,.7],[1,1,0]]);
  line(ell(cx,cy,u*.62,u*.62,56),u*.035,1,true,true);
  line(ell(cx,cy,u*.7,u*.7,56),u*.014,.5,true,true);
 }},
{id:'tsubu',cat:'光',name:'光のつぶ',desc:'下からふわふわ昇る。余韻・感動シーンのループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'gold',dur:3,glow:16},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(26*A);
  for (let i=0;i<n;i++){ const v=(t+rnd(i))%1, a=Math.sin(v*Math.PI);
    const x=rnd(i*3)*W+Math.sin(v*TAU+i)*u*.15, y=H*(1.05-v*1.15), r=u*.05*(.5+rnd(i*7));
    circ(x,y,r*2.4,.5,.25*a); circ(x,y,r,0,a); }
 }},
{id:'shine',cat:'光',name:'光の走り',desc:'ななめの光がサッと横切る。物のツヤ・ロゴに。',full:true,uses:['size','width','rot'],def:{pal:'white',dur:.8,glow:10,rot:30},peak:.45,
 fn(){ const {W,H,u,t,wd,cx,cy}=G; const D=Math.hypot(W,H), a=G.rot*Math.PI/180;
  const p=eo(seg(t,0,.85)), pos=-D*.6+p*D*1.2, dx=Math.cos(a), dy=Math.sin(a);
  const band=(off,w,k,al)=>{ const bx=cx+dx*(pos+off), by=cy+dy*(pos+off);
    fill([[bx-dy*D-dx*w,by+dx*D-dy*w],[bx+dy*D-dx*w,by-dx*D-dy*w],[bx+dy*D+dx*w,by-dx*D+dy*w],[bx-dy*D+dx*w,by+dx*D+dy*w]],k,false,al); };
  band(0,u*.32*wd,.5,.55); band(0,u*.12*wd,0,.9); band(u*.6,u*.06*wd,0,.8);
 }},

/* ---------- 衝撃 ---------- */
{id:'hit',cat:'衝撃',name:'ヒットスパーク',desc:'殴った・当たった瞬間のギザギザ。',uses:['size','amount','rot'],def:{pal:'gold',dur:.45,glow:14},peak:.25,
 fn(){ const {cx,cy,u,t,A}=G; if (t>=1) return;
  const g=eo(seg(t,0,.35)), R=u*(.5+1.1*g), n=Math.max(6,Math.round(11*A));
  const pts=star(cx,cy,R,R*.36,n,rnd(1)*TAU,1.2,9,true);
  cel((k,s)=>fill(sc(pts,s,cx,cy),k));
  const h=seg(t,.4,1); if (h>0) cut(blob(cx,cy,R*(.2+1.1*eo(h)),14,.3,3));
  for (let i=0;i<8;i++){ const a=rnd(i*4)*TAU, d=R*(.8+.9*eo(t)), len=u*.3*(1-t); if (len>1) fill(spike(cx,cy,a,d,d+len,u*.06),.5); }
 }},
{id:'ring',cat:'衝撃',name:'衝撃リング',desc:'まるく広がる衝撃波。着地・爆発のあと。',uses:['size','width','squash'],def:{pal:'white',dur:.6,glow:14},peak:.25,
 fn(){ const {cx,cy,u,t,wd}=G; const R=u*(.2+1.45*eo(t)), th=u*.3*wd*Math.pow(1-t,1.5); if (th<1) return;
  line(ell(cx,cy,R,R,56),th,1,true,true); line(ell(cx,cy,R,R,56),th*.42,0,true,true);
  for (let i=0;i<12;i++){ const a=i/12*TAU+rnd(i)*.3; fill(spike(cx,cy,a,R+th*.6,R+th*.6+u*.35*(1-t),u*.04*wd),.5); }
 }},
{id:'bakuhatsu',cat:'衝撃',name:'爆発',desc:'炎の玉がふくらんで煙になって消える。',uses:['size','amount'],def:{pal:'fire',dur:1.4,glow:0,outline:6},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const M=Math.max(4,Math.round(8*A)), sm=seg(t,.28,.62), SMK=[118,110,98], SML=[200,194,182];
  if (t<.12) cel((k,s)=>fill(star(cx,cy,u*1.3*eo(t/.12)*s,u*.4*s,9,0,.6,4),k));
  const B=[]; for (let i=0;i<M;i++){ const a=i/M*TAU+rnd(i)*.6, d=u*.55*eo(seg(t,0,.5))*(.35+rnd(i*2)*.8);
    const r=u*(.36+.22*rnd(i*3))*eo(seg(t,0,.28))*(1-ei(seg(t,.62,1)))*(1+.3*sm);
    B.push([cx+Math.cos(a)*d, cy+Math.sin(a)*d*.85-u*.7*eo(seg(t,.3,1))*(.6+rnd(i*5)*.6), r, i]); }
  B.push([cx,cy-u*.5*eo(seg(t,.3,1)),u*.6*eo(seg(t,0,.25))*(1-ei(seg(t,.55,1))),99]);
  for (const [x,y,r,i] of B) fill(blob(x,y,r,12,.3,i*11),colTo(1,SMK,sm),true);
  for (const [x,y,r,i] of B) fill(blob(x-r*.12,y-r*.14,r*.72,12,.3,i*13),colTo(.5,SML,sm),true);
  for (const [x,y,r,i] of B) fill(blob(x-r*.2,y-r*.22,r*.42,10,.3,i*17),0,true,1-sm);
 }},
{id:'pon',cat:'衝撃',name:'けむりポン',desc:'ポンと出て消える白煙。登場・退場・変身に。',uses:['size','amount'],def:{pal:'smoke',dur:.8,glow:0,outline:5},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(5,Math.round(9*A)), R=u*.75*eo(t), life=(1-ei(t))*Math.min(1,t*6);
  const B=[[cx,cy,u*.55*(1-eo(seg(t,0,.7)))*Math.min(1,t*8),0]];
  for (let i=0;i<n;i++){ const a=i/n*TAU+rnd(i)*.4; B.push([cx+Math.cos(a)*R, cy+Math.sin(a)*R*.8, u*.32*(.7+.45*rnd(i*3))*life, i+1]); }
  for (const [x,y,r,i] of B) fill(blob(x,y,r,12,.2,i*7),1,true);
  for (const [x,y,r,i] of B) fill(blob(x-r*.14,y-r*.18,r*.66,12,.2,i*9),0,true);
 }},
{id:'tsuchi',cat:'衝撃',name:'土けむり',desc:'足元から左右に広がる砂ぼこり。着地・急ブレーキ。',uses:['size','amount','rot'],def:{pal:'dust',dur:1,glow:0,outline:5},peak:.35,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(3,Math.round(6*A)); const B=[];
  for (const s of [-1,1]) for (let i=0;i<n;i++){ const f=(i+1)/n; const d=u*(.15+1.5*eo(t)*f);
    const r=u*(.17+.17*rnd(i*3+s))*Math.sin(Math.PI*cl(t*1.2+f*.15))*(1.2-f*.5);
    B.push([cx+s*d, cy-u*.35*eo(t)*f*(.5+rnd(i))-r*.4, r, i*2+(s>0)]); }
  for (const [x,y,r,i] of B) fill(blob(x,y,r,11,.25,i*7),1,true);
  for (const [x,y,r,i] of B) fill(blob(x-r*.12,y-r*.18,r*.62,11,.25,i*5),0,true);
 }},
{id:'zan',cat:'衝撃',name:'斬撃',desc:'三日月の太刀すじ。剣・爪・回し蹴り。',uses:['size','width','rot','squash'],def:{pal:'ice',dur:.45,glow:16,rot:-20},peak:.4,
 fn(){ const {cx,cy,u,t,wd}=G; const R=u*1.3;
  const head=lerp(-2.7,.9,eo(seg(t,0,.45))), tail=lerp(-2.7,.9,eo(seg(t,.15,.95))); if (head-tail<.03) return;
  const th=u*.24*wd*(1-ei(seg(t,.5,1))), N=30;
  const mk=(k0,k1)=>{ const o=[], ii=[]; for (let j=0;j<=N;j++){ const s=j/N, a=tail+(head-tail)*s, w=th*Math.pow(Math.sin(Math.PI*Math.pow(s,.55)),.8);
      o.push([cx+Math.cos(a)*(R-w*k0),cy+Math.sin(a)*(R-w*k0)]); ii.unshift([cx+Math.cos(a)*(R-w*k1),cy+Math.sin(a)*(R-w*k1)]); } return o.concat(ii); };
  fill(mk(0,1),1); fill(mk(.12,.6),.5); fill(mk(.18,.36),0);
  for (let i=0;i<3;i++){ const r2=R*(1.08+i*.07), a0=lerp(tail,head,.3+i*.1); const p=[]; for (let j=0;j<=8;j++){ const a=lerp(a0,head-.1,j/8); p.push([cx+Math.cos(a)*r2,cy+Math.sin(a)*r2]); } line(p,u*.02*wd,.5,false,true,.8); }
 }},
{id:'jimen',cat:'衝撃',name:'地面の衝撃',desc:'地面を割る平たい波と飛ぶ石。',uses:['size','width','amount'],def:{pal:'dust',dur:.9,glow:0,outline:5},peak:.3,
 fn(){ const {cx,cy,u,t,wd,A}=G;
  for (const [d,k] of [[0,1],[.15,.5]]){ const q=seg(t,d,1); if (q<=0||q>=1) continue; const R=u*1.6*eo(q), th=u*.13*wd*(1-q); line(ell(cx,cy,R,R*.26,56),th,k,true,true); }
  const n=Math.round(9*A);
  for (let i=0;i<n;i++){ const a=-Math.PI*(.1+.8*rnd(i)), sp=u*(1.4+rnd(i*3)*1.2), tt=t*1.1;
    const x=cx+Math.cos(a)*sp*tt*.8, y=cy+Math.sin(a)*sp*tt*1.3+u*2.6*tt*tt; if (y>cy+u*.1) continue;
    fill(xf(blob(0,0,u*.09*(.5+rnd(i*5)),5,.6,i*3),x,y,t*6*(rnd(i)-.5)),1); }
 }},
{id:'pishi',cat:'衝撃',name:'ピシッ線',desc:'気づき・ハッとした時の短い強調線。',uses:['size','amount','width','rot'],def:{pal:'ink',dur:.6,glow:0,boil:2},peak:.3,
 fn(){ const {cx,cy,u,t,wd,A}=G; const n=Math.max(2,Math.round(3*A)); const p=t<.18?back(t/.18):1, f=seg(t,.75,1);
  for (let i=0;i<n;i++){ const a=-Math.PI/2+(i-(n-1)/2)*.42, r0=u*(.5+.55*f), r1=u*(.5+.6*p);
    if (r1-r0<2) continue; fill(lens(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,u*.11*wd),1); }
 }},

/* ---------- 力・魔法 ---------- */
{id:'denki',cat:'力・魔法',name:'電撃',desc:'まわりをバチバチ走る稲妻。ループ。',loop:true,uses:['size','amount','width'],def:{pal:'denki',dur:.5,glow:18,boil:2},peak:.3,
 fn(){ const {cx,cy,u,wd,A}=G; const n=Math.max(1,Math.round(4*A));
  for (let k=0;k<n;k++){ const a0=fr(k*9)*TAU, span=.8+fr(k*3)*1.7, pts=[];
    for (let i=0;i<=8;i++){ const a=a0+span*i/8, r=u*(.6+(fr(k*31+i*7)-.5)*.65); pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]); }
    line(pts,u*.07*wd,1); line(pts,u*.028*wd,0);
    const b=pts[3], br=[b]; for (let j=1;j<4;j++) br.push([b[0]+(fr(k*5+j)-.3)*u*.3*j,b[1]+(fr(k*7+j)-.5)*u*.3*j]);
    line(br,u*.04*wd,1); line(br,u*.015*wd,0); }
  circ(cx,cy,u*.18*(.7+fr(2)*.5),.5,.6); circ(cx,cy,u*.09,0);
 }},
{id:'rakurai',cat:'力・魔法',name:'落雷',desc:'上から一本ドンと落ちる雷。',uses:['size','width'],def:{pal:'denki',dur:.8,glow:22},peak:.12,
 fn(){ const {cx,cy,u,t,f,wd}=G; const by=cy+u*.9, ty=cy-u*4;
  if (t<.62 && f%3!==2){ const N=11, pts=[]; for (let i=0;i<=N;i++){ const y=lerp(ty,by,i/N); const off=(i===0||i===N)?0:(rnd(i*3)-.5)*u*.7+(fr(i)-.5)*u*.12; pts.push([cx+off,y]); }
    const w=u*.11*wd*(1-t*.6); line(pts,w,1); line(pts,w*.4,0);
    for (const s of [3,6]){ const b=pts[s], br=[b]; for (let j=1;j<4;j++) br.push([b[0]+(rnd(s*5+j)-.5)*u*.5*j,b[1]+u*.3*j]); line(br,w*.5,1); line(br,w*.2,0); } }
  const q=seg(t,0,.45); if (q<1){ cel((k,s)=>fill(star(cx,by,u*.9*eo(q)*s,u*.3*s,8,0,.8,7,true),k)); }
  const r=seg(t,.05,.9); if (r>0&&r<1) line(ell(cx,by,u*1.4*eo(r),u*.3*eo(r),48),u*.08*(1-r),.5,true,true);
 }},
{id:'charge',cat:'力・魔法',name:'チャージ',desc:'光が集まって、最後にはじける。',uses:['size','amount'],def:{pal:'ice',dur:1.3,glow:18},peak:.6,
 fn(){ const {cx,cy,u,t,f,A}=G; const n=Math.round(16*A);
  if (t<.85) for (let i=0;i<n;i++){ const v=(t*2.4+rnd(i))%1, a=rnd(i*3)*TAU, r1=u*1.6*(1-v)+u*.25, r0=r1+u*.5*(1-v);
    fill(lens(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,u*.045),.5,false,Math.min(1,v*8)); }
  const q=seg(t,.85,1), r=u*(.12+.3*eo(seg(t,0,.85)))*(1+.08*Math.sin(f*2.3))*(1+q*.8);
  if (q<1) cel((k,s)=>circ(cx,cy,r*s,k,1-ei(q)));
  if (q>0&&q<1){ const R=u*2*eo(q); for (let i=0;i<14;i++){ const a=i/14*TAU+rnd(i); fill(spike(cx,cy,a,R*.3,R*(.7+.3*rnd(i*2)),u*.09*(1-q)),.5); } }
 }},
{id:'aura',cat:'力・魔法',name:'オーラ',desc:'体のまわりで燃える気。キャラの後ろに置く。',loop:true,uses:['size','amount','width'],def:{pal:'gold',dur:.75,glow:12,boil:4},peak:.3,
 fn(){ const {cx,cy,u,A,wd}=G; const N=2*Math.max(8,Math.round(14*A)), rx=u*.7*wd, ry=u*1.15, pts=[];
  for (let i=0;i<N;i++){ const a=i/N*TAU, s=Math.sin(a); let x=cx+Math.cos(a)*rx, y=cy+s*ry;
    if (i%2===0 && s<.35){ const e=u*(.25+.6*fr(i*3.7))*(.35-s)/1.35*1.6; y-=e; x+=Math.cos(a)*e*.3; }
    pts.push([x,y]); }
  const oy=cy+ry*.35; fill(pts,1,false,.85); fill(sc(pts,.8,cx,oy),.5,false,.9); fill(sc(pts,.6,cx,oy),0,false,.9);
 }},
{id:'beam',cat:'力・魔法',name:'ビーム',desc:'手元から一直線に伸びる光線。向きで狙いを変える。',uses:['size','width','rot'],def:{pal:'ice',dur:1.4,glow:22},peak:.4,
 fn(){ const {cx,cy,u,t,f,wd,W,H}=G; const L=Math.hypot(W,H)*1.3, end=cx+L*eo(seg(t,0,.22));
  const w=u*.35*wd*(1-ei(seg(t,.7,1)))*(1+.08*Math.sin(f*1.7)); if (w<.5) return;
  const mk=s=>{ const top=[],bot=[]; for (let i=0;i<=40;i++){ const x=lerp(cx,end,i/40), wob=1+.12*Math.sin(x/(u*.22)+f*2); top.push([x,cy-w*s*wob]); bot.unshift([x,cy+w*s*wob]); } return top.concat(bot); };
  cel((k,s)=>fill(mk(s),k),[[1,1],[.5,.62],[0,.3]]);
  cel((k,s)=>circ(cx,cy,w*1.5*s,k)); cel((k,s)=>circ(end,cy,w*1.05*s,k));
 }},
{id:'mahojin',cat:'力・魔法',name:'魔法陣',desc:'ぐるぐる回る円と文字。つぶすと床に置ける。',loop:true,uses:['size','width','rot','squash'],def:{pal:'ice',dur:4,glow:16,boil:1},peak:.3,
 fn(){ const {cx,cy,u,t,wd}=G; const R=u*1.4, lw=u*.022*wd;
  const L2=(p,w,cl2=true)=>{ line(p,w*2.4,1,cl2,false,.55); line(p,w,0,cl2); };
  L2(ell(cx,cy,R,R,72),lw*1.3); L2(ell(cx,cy,R*.86,R*.86,72),lw);
  const m=16, ro=t*TAU/4;
  for (let i=0;i<m;i++){ const a=ro+i/m*TAU, g=i%4, x=cx+Math.cos(a)*R*.93, y=cy+Math.sin(a)*R*.93; const gp=[];
    for (let j=0;j<4;j++) gp.push([(rnd(g*13+j*3)-.5)*u*.14,(rnd(g*17+j*5)-.5)*u*.1]);
    L2(xf(gp,x,y,a+Math.PI/2),lw*.7,false); }
  const ho=-t*TAU/6, tri=o=>[0,1,2].map(j=>{ const a=ho+o+j*TAU/3; return [cx+Math.cos(a)*R*.84,cy+Math.sin(a)*R*.84]; });
  L2(tri(-Math.PI/2),lw); L2(tri(Math.PI/2),lw);
  for (let j=0;j<6;j++){ const a=ho+Math.PI/2+j*TAU/6; L2(ell(cx+Math.cos(a)*R*.84,cy+Math.sin(a)*R*.84,u*.06,u*.06,16),lw*.8); }
  L2(ell(cx,cy,R*.46,R*.46,48),lw);
  const sq=t*TAU/4; L2([0,1,2,3].map(j=>{ const a=sq+j*TAU/4; return [cx+Math.cos(a)*R*.46,cy+Math.sin(a)*R*.46]; }),lw*.8);
 }},
{id:'honoo',cat:'力・魔法',name:'炎',desc:'ゆらゆら燃える火。たき火・怒りの炎。ループ。',loop:true,uses:['size','amount'],def:{pal:'fire',dur:.75,glow:8,outline:5,boil:3},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const by=cy+u*.7, hw=u*.6, T=5, pts=[];
  for (let i=0;i<=T*2;i++){ const s=i/(T*2), x=cx-hw+2*hw*s, bell=Math.sin(Math.PI*s);
    let h = i%2 ? u*(.35+.4*fr(i*5.1))*bell : u*(.8+1*fr(i*5.1))*Math.pow(bell,.7);
    if (i===0||i===T*2) h=0; pts.push([x+(i%2?0:(fr(i*7)-.5)*u*.18), by-u*.25-h]); }
  for (let j=1;j<12;j++){ const a=Math.PI*j/12; pts.push([cx+Math.cos(a)*hw, by-u*.25+Math.sin(a)*u*.35]); }
  fill(pts,1); fill(sc(pts,.7,cx,by),.5); fill(sc(pts,.42,cx,by),0);
  const n=Math.round(6*A); for (let i=0;i<n;i++){ const v=(t+rnd(i))%1; circ(cx+(rnd(i*3)-.5)*hw*1.4+Math.sin(v*TAU)*u*.1, by-u*.6-v*u*2, u*.04*(1-v), .5); }
 }},
{id:'dan',cat:'力・魔法',name:'エネルギー玉',desc:'うずを巻く光の玉。ループ。',loop:true,uses:['size','width'],def:{pal:'denki',dur:.5,glow:20},peak:.3,
 fn(){ const {cx,cy,u,t,wd}=G; const r=u*.55*(1+.05*Math.sin(t*TAU*2));
  circ(cx,cy,r*1.3,1,.35); cel((k,s)=>fill(blob(cx,cy,r*s,18,.06,3),k,true),[[1,1],[.5,.74],[0,.45]]);
  for (let i=0;i<3;i++){ const a0=t*TAU+i*TAU/3, p=[]; for (let j=0;j<=12;j++){ const a=a0+j/12*1.5; p.push([cx+Math.cos(a)*r*1.18,cy+Math.sin(a)*r*1.18*.75]); } line(p,u*.05*wd,0,false,true); }
  for (let i=0;i<4;i++){ const a=fr(i*3)*TAU, d=r*(1.2+fr(i)*.5); fill(spike(cx,cy,a,d,d+u*.18,u*.04),.5); }
 }},

/* ---------- 漫符 ---------- */
{id:'ase',cat:'漫符',name:'汗',desc:'たらっと流れる汗。焦り・困り顔。',loop:true,uses:['size','amount','rot'],def:{pal:'mizu',dur:1.2,glow:0,outline:5},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(1,Math.round(2*A));
  for (let i=0;i<n;i++){ const v=(t+i/n)%1, pop=v<.15?back(v/.15):1, al=1-seg(v,.75,1);
    const r=u*.3*(1-.25*i)*pop, x=cx+u*(.38*i-.15), y=cy+i*u*.4-u*.15+ei(seg(v,.3,1))*u*.55;
    fill(drop(x,y,r),.5,true,al); fill(ell(x-r*.22,y+r*.1,r*.12,r*.22,12,.3),0,true,al); }
 }},
{id:'ikari',cat:'漫符',name:'怒りマーク',desc:'ピクピク動く💢。ループ。',loop:true,uses:['size','width','rot'],def:{pal:'anger',dur:.6,fps:8,glow:0,outline:4},peak:.3,
 fn(){ const {cx,cy,u,t,wd}=G; const s=1+.14*Math.abs(Math.sin(t*TAU)), g=u*.13*s, L=u*.5*s, w=u*.14*wd*s;
  for (let q=0;q<4;q++){ const p=[]; for (let j=0;j<=12;j++){ const v=j/12, a=(1-v)*(1-v), b=2*v*(1-v), c=v*v;
      p.push([a*(g+L*.12)+b*(g*.35)+c*(g+L), a*(g+L)+b*(g*.35)+c*(g+L*.12)]); }
    const r=xf(p,cx,cy,q*Math.PI/2); line(r,w,1); line(r,w*.4,.5); }
 }},
{id:'bikkuri',cat:'漫符',name:'！？',desc:'はねて出るびっくり。文字は変えられる。',uses:['size','text','rot'],def:{pal:'anger',dur:1,glow:0,outline:6,text:'!?'},peak:.3,
 fn(){ const {c,cx,cy,u,t,f,S}=G; const p=t<.2?back(t/.2):1, al=1-seg(t,.85,1); if (p<=0) return;
  const sh=t<.35?(fr(1)-.5)*u*.08:0;
  c.save(); c.globalAlpha=al; c.translate(cx+sh,cy); c.rotate((fr(2)-.5)*.03*G.boil); c.scale(p,p);
  c.font=`800 ${u*1.5}px 'M PLUS Rounded 1c'`; c.textAlign='center'; c.textBaseline='middle';
  c.fillStyle=col(1); c.fillText(G.text||'!?',0,0); c.restore();
  if (t>.08&&t<.7) for (const s of [-1,1]) for (let i=0;i<2;i++){ const a=-Math.PI/2+s*(.75+i*.35), r0=u*.95, r1=u*(1.2+.12*fr(i+s));
    fill(lens(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,u*.09),1,false,al); }
 }},
{id:'moji',cat:'漫符',name:'文字ポップ',desc:'ギザギザのふきだしに擬音。ドン！バーン！',uses:['size','text','rot','amount'],def:{pal:'gold',dur:1.1,glow:0,outline:6,text:'ドン!',rot:-8},peak:.3,
 fn(){ const {c,cx,cy,u,t,A}=G; const p=t<.18?back(t/.18):1, al=1-seg(t,.86,1); if (p<=0) return;
  const txt=G.text||'ドン!', n=Math.max(8,Math.round(14*A)), rx=u*(.6+.28*txt.length)*p, ry=u*.85*p;
  const pts=star(cx,cy,1,.72,n,0,.5,3,true).map(([x,y])=>[cx+(x-cx)*rx,cy+(y-cy)*ry]);
  fill(pts,.5,false,al); fill(sc(pts,.84,cx,cy),0,false,al);
  const tp=t<.1?0:t<.28?back((t-.1)/.18):1;
  c.save(); c.globalAlpha=al; c.translate(cx,cy); c.scale(tp,tp); c.font=`800 ${u*.95}px 'M PLUS Rounded 1c'`;
  c.textAlign='center'; c.textBaseline='middle'; c.lineJoin='round'; c.lineWidth=u*.14; c.strokeStyle=G.line; c.strokeText(txt,0,0);
  c.fillStyle=col(1); c.fillText(txt,0,0); c.restore();
 }},
{id:'heart',cat:'漫符',name:'ハート',desc:'ふわふわ昇るハート。好き・うっとり。ループ。',loop:true,uses:['size','amount'],def:{pal:'pink',dur:2,glow:0,outline:4},peak:.4,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(1,Math.round(5*A));
  for (let i=0;i<n;i++){ const v=(t+i/n)%1, s=u*.24*(.6+rnd(i*5)*.6)*Math.min(1,v*5)*(1-ei(seg(v,.7,1))); if (s<1) continue;
    const x=cx+(rnd(i*3)-.5)*u*1.4+Math.sin(v*TAU+i)*u*.12, y=cy+u*.7-v*u*1.9, r=Math.sin(v*TAU)*.25;
    fill(heart(x,y,s,r),.5); fill(ell(x-s*.42,y-s*.25,s*.12,s*.2,12,.5),0,true); }
 }},
{id:'onpu',cat:'漫符',name:'音符',desc:'ゆれながら昇る♪。ごきげん・歌。ループ。',loop:true,uses:['size','amount'],def:{pal:'ink',dur:2,glow:0},peak:.4,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(1,Math.round(4*A));
  for (let i=0;i<n;i++){ const v=(t+i/n)%1, s=u*.3*(.7+rnd(i*5)*.5)*Math.min(1,v*5)*(1-ei(seg(v,.7,1))); if (s<1) continue;
    const x=cx+(rnd(i*3)-.5)*u*1.5+Math.sin(v*TAU*1.5+i)*u*.15, y=cy+u*.8-v*u*1.9, r=Math.sin(v*TAU)*.3;
    const hd=xf(ell(0,0,s*.42,s*.3,20,-.4),x,y,r); fill(hd,1,true);
    const st=xf([[s*.36,-s*.1],[s*.36,-s*1.45]],x,y,r); line(st,s*.12,1);
    if (i%2){ const fl=xf([[s*.36,-s*1.45],[s*.75,-s*1.15],[s*.8,-s*.75]],x,y,r); line(fl,s*.12,1,false,true); }
    else { const fl=xf([[s*.36,-s*1.45],[s*.9,-s*1.65],[s*.9,-s*1.3]],x,y,r); line(fl,s*.14,1); } }
 }},
{id:'guruguru',cat:'漫符',name:'ぐるぐる',desc:'目が回る・混乱。うずと星がまわる。ループ。',loop:true,uses:['size','width'],def:{pal:'ink',dur:1,glow:0},peak:.3,
 fn(){ const {cx,cy,u,t,wd}=G; const p=[]; for (let i=0;i<=90;i++){ const s=i/90, a=s*TAU*3+t*TAU; p.push([cx+Math.cos(a)*u*.6*s,cy+Math.sin(a)*u*.6*s]); }
  line(p,u*.05*wd,1,false,true);
  for (let i=0;i<3;i++){ const a=t*TAU+i*TAU/3, x=cx+Math.cos(a)*u*.95, y=cy-u*.75+Math.sin(a)*u*.25;
    fill(star(x,y,u*.17,u*.07,5,-Math.PI/2),'#FFD84A'); line(star(x,y,u*.17,u*.07,5,-Math.PI/2),u*.025,1,true); }
 }},
{id:'gaan',cat:'漫符',name:'ガーン縦線',desc:'青ざめた時の縦線。顔の上に重ねる。',loop:true,uses:['size','amount','width'],def:{pal:'gloom',dur:.5,fps:8,glow:0,boil:4},peak:.3,
 fn(){ const {cx,cy,u,wd,A}=G; const n=Math.max(4,Math.round(14*A));
  for (let i=0;i<n;i++){ const x=cx-u*1.1+(i+.5)/n*u*2.2, len=u*(.6+.9*rnd(i*3)), y0=cy-u*1.1;
    line([[x,y0],[x,y0+len*.5],[x,y0+len]],u*.022*wd*(.6+rnd(i)*.8),1); }
 }},
{id:'moyamoya',cat:'漫符',name:'もやもや',desc:'モヤっとした気持ちのぐしゃぐしゃ線。ループ。',loop:true,uses:['size','width','squash'],def:{pal:'ink',dur:1.5,glow:0,boil:2},peak:.3,
 fn(){ const {cx,cy,u,t,wd}=G;
  for (const [s,ph,k] of [[1,0,1],[.62,1.7,1]]){ const p=[]; for (let i=0;i<=220;i++){ const a=i/220*TAU;
      p.push([cx+Math.cos(a)*u*.85*s+Math.cos(a*9+t*TAU+ph)*u*.2*s, cy+Math.sin(a)*u*.5*s+Math.sin(a*9+t*TAU+ph)*u*.2*s]); }
    line(p,u*.025*wd,k,true,true,s<1?.7:1); }
 }},
{id:'yuge',cat:'漫符',name:'怒りの湯気',desc:'頭からプンプン出る湯気。ループ。',loop:true,uses:['size','amount'],def:{pal:'smoke',dur:.9,glow:0,outline:4},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.max(2,Math.round(3*A)), B=[];
  for (const s of [-1,1]) for (let i=0;i<n;i++){ const v=(t+i/n)%1, r=u*.2*Math.pow(Math.sin(Math.PI*v),.6);
    B.push([cx+s*u*(.15+.6*eo(v)), cy-u*(.05+.8*eo(v)), r, i*2+(s>0)]); }
  for (const [x,y,r,i] of B) fill(blob(x,y,r,10,.25,i*3),1,true);
  for (const [x,y,r,i] of B) fill(blob(x-r*.15,y-r*.18,r*.6,10,.25,i*5),0,true);
 }},
{id:'hirameki',cat:'漫符',name:'ひらめき',desc:'ピコーン！頭の上に出る扇の線と星。',uses:['size','width','amount'],def:{pal:'gold',dur:.7,glow:6,outline:4},peak:.3,
 fn(){ const {cx,cy,u,t,wd,A}=G; const p=t<.18?back(t/.18):1, f=seg(t,.78,1), n=Math.max(3,Math.round(5*A));
  for (let i=0;i<n;i++){ const a=-Math.PI/2+(i-(n-1)/2)*.38, r0=u*(.42+.5*f), r1=u*(.45+.7*p); if (r1-r0<2) continue;
    fill(lens(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*r1,cy+Math.sin(a)*r1,u*.13*wd),.6); }
  const s=u*.3*p*(1-f); if (s>1){ fill(astro(cx,cy,s,0,3.2),.5); fill(astro(cx,cy,s*.5,0,3.6),0); }
 }},
{id:'tere',cat:'漫符',name:'照れ',desc:'ほっぺの赤みと斜線。顔の頬に合わせる。ループ。',loop:true,uses:['size','width'],def:{pal:'pink',dur:.5,fps:8,glow:0,boil:3},peak:.3,
 fn(){ const {cx,cy,u,wd}=G;
  for (const s of [-1,1]){ const bx=cx+s*u*.75; fill(ell(bx,cy,u*.36,u*.16,24),.5,true,.55);
    for (let i=0;i<4;i++){ const x=bx-u*.2+i*u*.13; line([[x+u*.06,cy-u*.1],[x-u*.06,cy+u*.1]],u*.03*wd,1); } }
 }},

/* ---------- 自然 ---------- */
{id:'ame',cat:'自然',name:'雨',desc:'ななめに降る雨。向きで傾ける。ループ。',full:true,loop:true,uses:['size','amount','width','rot'],def:{pal:'white',dur:1,glow:0,rot:12,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A,wd}=G; const n=Math.round(90*A), tn=Math.tan(G.rot*Math.PI/180);
  for (let i=0;i<n;i++){ const k=rnd(i*3)>.5?2:1, v=(rnd(i)+t*k)%1, L=u*(.25+.3*rnd(i*5));
    const y=-L+v*(H+2*L), x0=lerp(-Math.abs(tn)*H,W+Math.abs(tn)*H,rnd(i*7)), x=x0+y*tn;
    line([[x,y],[x+L*tn,y+L]],u*.012*wd*(.6+rnd(i*9)),1,false,false,.75); }
 }},
{id:'yuki',cat:'自然',name:'雪',desc:'ゆらゆら舞う雪。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'white',dur:4,glow:4,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(70*A);
  for (let i=0;i<n;i++){ const r=u*.045*(.35+rnd(i*5)), v=(rnd(i)+t)%1, y=-r*3+v*(H+r*6);
    const x=rnd(i*3)*W+Math.sin(v*TAU*2+rnd(i*7)*TAU)*u*.25; circ(x,y,r*1.7,.5,.3); circ(x,y,r,0); }
 }},
{id:'sakura',cat:'自然',name:'桜吹雪',desc:'くるくる舞い散る花びら。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'pink',dur:4,glow:0,outline:2,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(32*A), P=[[0,1],[-.5,.25],[-.45,-.5],[-.16,-1],[0,-.78],[.16,-1],[.45,-.5],[.5,.25]];
  for (let i=0;i<n;i++){ const s=u*.14*(.6+rnd(i*5)*.7), v=(rnd(i)+t)%1, y=-s*2+v*(H+s*4), x=rnd(i*3)*(W+H*.5)-v*H*.5;
    const a=rnd(i*7)*TAU+t*TAU*(1+i%2), sy=Math.cos(t*TAU*(1+i%3)+rnd(i)*TAU);
    const pts=xf(xf(P,0,0,0,s,s*Math.max(.15,Math.abs(sy))),x,y,a); fill(pts,.5,true); fill(sc(pts,.5,x,y),0,true,.6); }
 }},
{id:'konoha',cat:'自然',name:'木の葉',desc:'ひらひら落ちる葉っぱ。秋の場面に。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'aki',dur:4,glow:0,outline:3,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(22*A), P=[[0,-1],[.45,-.55],[.5,0],[.3,.55],[0,1],[-.3,.55],[-.5,0],[-.45,-.55]];
  for (let i=0;i<n;i++){ const s=u*.2*(.6+rnd(i*5)*.7), v=(rnd(i)+t)%1, y=-s*2+v*(H+s*4), x=rnd(i*3)*W+Math.sin(v*TAU*2+i)*u*.35;
    const a=Math.sin(t*TAU*(1+i%2)+i)*1.2, sx=Math.cos(t*TAU+rnd(i)*TAU);
    const k=rnd(i*9); const pts=xf(xf(P,0,0,0,s*Math.max(.2,Math.abs(sx)),s),x,y,a);
    fill(pts,.3+k*.7,true); line([pts[0],pts[4]].map(p=>p),s*.08,1,false,false,.6); }
 }},
{id:'kamifubuki',cat:'自然',name:'紙吹雪',desc:'お祝いのカラフルな紙。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'gold',dur:3,glow:0,outline:0,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(60*A), CS=['#F2A0B8','#E1DD60','#7FD3E8','#9ED36A','#F6A04D','#FFFFFF',col(1)];
  for (let i=0;i<n;i++){ const s=u*.08*(.6+rnd(i*5)*.7), v=(rnd(i)+t)%1, y=-s*2+v*(H+s*4), x=rnd(i*3)*W+Math.sin(v*TAU*2+i)*u*.25;
    const fl=Math.cos(t*TAU*(1+i%3)+rnd(i)*TAU);
    fill(xf([[-s,-s*.6],[s,-s*.6],[s,s*.6],[-s,s*.6]],x,y,rnd(i*7)*TAU+t*TAU,1,Math.max(.1,Math.abs(fl))),CS[i%CS.length]); }
 }},
{id:'awa',cat:'自然',name:'泡',desc:'ぷくぷく昇る泡。水中シーン。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'mizu',dur:3,glow:0,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A}=G; const n=Math.round(30*A);
  for (let i=0;i<n;i++){ const r=u*.09*(.35+rnd(i*5)), v=(rnd(i)+t)%1, y=H+r*2-v*(H+r*4), x=rnd(i*3)*W+Math.sin(v*TAU*3+i)*u*.08;
    circ(x,y,r,.5,.18); line(ell(x,y,r,r,24),r*.14,1,true,true,.9); circ(x-r*.38,y-r*.38,r*.22,0); }
 }},
{id:'shibuki',cat:'自然',name:'水しぶき',desc:'王冠みたいに跳ねる水。着水・こぼれる。',uses:['size','amount'],def:{pal:'mizu',dur:.8,glow:0,outline:4},peak:.3,
 fn(){ const {cx,cy,u,t,A}=G; const n=Math.round(14*A);
  for (let i=0;i<n;i++){ const a=-Math.PI/2+(rnd(i)-.5)*2.3, sp=u*(1.3+rnd(i*3)*.9), r=u*.07*(.5+rnd(i*5))*(1-ei(seg(t,.6,1)));
    const x=cx+Math.cos(a)*sp*t, y=cy+Math.sin(a)*sp*t+u*1.8*t*t; if (r>.5) fill(drop(x,y,r*1.4,Math.atan2(Math.sin(a)*sp+u*3.6*t,Math.cos(a)*sp)+Math.PI/2+Math.PI),.5,true); }
  const q=seg(t,0,.65); if (q<1){ const h=Math.sin(Math.PI*q), rx=u*.6*(.6+.6*q), ry=rx*.28, m=9, p=[];
    for (let j=0;j<=m*2;j++){ const s=j/(m*2), x=cx-rx+2*rx*s; p.push([x, cy - (j%2? u*.12 : u*.55*(.6+.4*rnd(j)))*h - Math.sin(Math.PI*s)*ry*.2]); }
    for (let j=1;j<12;j++){ const a=Math.PI*j/12; p.push([cx+Math.cos(a)*rx, cy+Math.sin(a)*ry]); }
    fill(p,.5); fill(sc(p,.6,cx,cy),0,false,.8); }
 }},

/* ---------- 画面 ---------- */
{id:'shuchu',cat:'画面',name:'集中線',desc:'画面のまわりから中心へ。置き場所が中心になる。ループ。',full:true,loop:true,uses:['size','amount','width'],def:{pal:'ink',dur:.5,glow:0,boil:0},peak:.3,
 fn(){ const {W,H,cx,cy,A,wd}=G; const n=Math.round(100*A), Ro=Math.hypot(W,H), m=Math.min(W,H), sz=G.size/70;
  for (let i=0;i<n;i++){ const a=(i+rnd(i)*.8)/n*TAU, rin=m*(.26+.2*fr(i*3.3))*sz, w=Ro*TAU/n*(.3+.55*rnd(i*5))*wd;
    fill(spike(cx,cy,a,Ro,rin,w),1); }
 }},
{id:'ryusen',cat:'画面',name:'流線',desc:'スピード感の横線。向きで流れを変える。ループ。',full:true,loop:true,uses:['size','amount','width','rot'],def:{pal:'ink',dur:.4,glow:0,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A,wd,cx,cy}=G; const n=Math.round(46*A), D=Math.hypot(W,H), a=G.rot*Math.PI/180;
  for (let i=0;i<n;i++){ const y=(rnd(i)-.5)*D, L=D*(.12+.3*rnd(i*5)), v=(rnd(i*3)+t*2)%1, x=D/2+L-v*(D+2*L);
    fill(xf(lens(x,y,x+L,y,u*.03*wd*(.5+rnd(i*7))),cx,cy,a),1); }
 }},
{id:'beta',cat:'画面',name:'ウニフラッシュ',desc:'黒地に白いトゲトゲ。衝撃・ショックの背景。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'ink',dur:.5,glow:0,boil:0},peak:.3,
 fn(){ const {c,W,H,cx,cy,A}=G; const m=Math.min(W,H), rin=m*.22*G.size/70, n=Math.round(150*A);
  c.fillStyle=col(1); c.fillRect(0,0,W,H);
  const p=[]; for (let i=0;i<n*2;i++){ const a=i/(n*2)*TAU; const r=i%2 ? rin*(.95+.1*fr(i)) : rin*(1.25+1.1*Math.pow(fr(i*3.1),2)); p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]); }
  fill(p,0);
 }},
{id:'hana',cat:'画面',name:'花とキラキラ',desc:'少女漫画のまわりを飾る花。ループ。',full:true,loop:true,uses:['size','amount'],def:{pal:'pink',dur:3,glow:0,outline:3,boil:0},peak:.3,
 fn(){ const {W,H,u,t,A,cx,cy}=G; const n=Math.round(12*A), D=Math.hypot(W,H)/2;
  for (let i=0;i<n;i++){ const a=rnd(i)*TAU, d=D*(.62+.45*rnd(i*3)), x=cx+Math.cos(a)*d, y=cy+Math.sin(a)*d*.8, s=u*.38*(.6+.6*rnd(i*5)), ro=(i%2?1:-1)*t*TAU/5;
    for (let k=0;k<5;k++){ const b=ro+k*TAU/5; circ(x+Math.cos(b)*s*.55,y+Math.sin(b)*s*.55,s*.45,.5); }
    circ(x,y,s*.26,'#FFE27A'); }
  for (let i=0;i<n;i++){ const q=(t+rnd(i*9))%1, s=Math.sin(q*Math.PI)*u*.22; if (s<1) continue; const a=rnd(i*11)*TAU, d=D*(.5+.5*rnd(i*13));
    fill(astro(cx+Math.cos(a)*d,cy+Math.sin(a)*d*.8,s,0,3.3),0); }
 }},
{id:'flash',cat:'画面',name:'フラッシュ',desc:'画面全体がピカッと光る。色を変えれば赤フラッシュも。',full:true,uses:[],def:{pal:'white',dur:.4,glow:0,boil:0},peak:.15,
 fn(){ const {c,W,H,t}=G; const a=t<.1?t/.1:1-eo(seg(t,.1,1)); c.globalAlpha=a; c.fillStyle=col(0); c.fillRect(0,0,W,H); c.globalAlpha=1; }},
{id:'iris',cat:'画面',name:'アイリス',desc:'丸く閉じて開く場面転換。置き場所が丸の中心。',full:true,uses:['amount'],def:{pal:'ink',dur:1.4,glow:0,boil:0},peak:.3,
 fn(){ const {c,W,H,cx,cy,t}=G; const Rm=Math.max(Math.hypot(cx,cy),Math.hypot(W-cx,cy),Math.hypot(cx,H-cy),Math.hypot(W-cx,H-cy));
  const R = t<.42 ? Rm*(1-eo(t/.42)) : t<.58 ? 0 : Rm*ei(seg(t,.58,1)); if (R>=Rm) return;
  c.fillStyle=col(1); c.fillRect(0,0,W,H); if (R>1){ const n=Math.max(3,Math.round(G.A*50)); cut(n>=50?ell(cx,cy,R,R,64):star(cx,cy,R,R*.5,Math.max(3,Math.round(G.A*5)),-Math.PI/2), n>=50); }
 }},
];
export const FXI = Object.fromEntries(FX.map(f => [f.id, f]));


export const BASE = {pal:'gold',outline:0,glow:12,fps:12,dur:.8,boil:3,size:70,amount:50,width:50,rot:0,squash:100,text:''};

export function fxDefaults(id, keep){
  const fx = FXI[id], d = {...BASE, ...fx.def}, p = PAL[d.pal];
  return {...keep, ...d, fx:id, c0:p[2], c1:p[3], c2:p[4], line:'#1E1C14', px:.5, py:.5, text:d.text || keep.text || ''};
}

/* ================= 合成 ================= */
const L = document.createElement('canvas'), O = document.createElement('canvas');
export function totalFrames(Q){ return Math.max(2, Math.round(Q.dur*Q.fps)); }

export function renderTo(out, fi, Q){
  const fx = FXI[Q.fx], W = out.width, H = out.height, total = totalFrames(Q);
  if (L.width !== W || L.height !== H){ L.width = O.width = W; L.height = O.height = H; }
  const lc = L.getContext('2d'); lc.setTransform(1,0,0,1,0,0); lc.clearRect(0,0,W,H); lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
  const m = Math.min(W,H);
  G = { c:lc, W, H, f:fi, t: fx.loop ? fi/total : fi/(total-1), cx:Q.px*W, cy:Q.py*H, u:m*Q.size/200, S:m/1000,
        A:Q.amount/50, wd:Q.width/50, seed:Q.seed, rot:Q.rot, size:Q.size, boil:Q.boil, text:Q.text, line:Q.line,
        pal:[hex(Q.c0),hex(Q.c1),hex(Q.c2)], jamp:Q.boil*m/1000*1.3, jk:1/(m*.07) };
  G.p1 = fr(1)*TAU; G.p2 = fr(2)*TAU; G.p3 = fr(3)*TAU; G.p4 = fr(4)*TAU;
  if (!fx.full){
    lc.translate(G.cx, G.cy); lc.rotate(fx.uses.includes('rot') ? Q.rot*Math.PI/180 : 0);
    lc.scale(1, fx.uses.includes('squash') ? Q.squash/100 : 1); lc.translate(-G.cx, -G.cy);
  }
  fx.fn();
  lc.setTransform(1,0,0,1,0,0);

  const oc = out.getContext('2d'); oc.setTransform(1,0,0,1,0,0); oc.clearRect(0,0,W,H);
  if (Q.glow > 0){
    oc.save(); oc.shadowColor = Q.c1; oc.shadowBlur = Q.glow*m/1000*2.2; oc.shadowOffsetX = W*3;
    oc.drawImage(L, -W*3, 0); oc.shadowColor = Q.c2; oc.shadowBlur = Q.glow*m/1000*4.5; oc.globalAlpha = .7; oc.drawImage(L, -W*3, 0); oc.restore();
  }
  if (Q.outline > 0){
    const r = Q.outline*m/1000*1.25, octx = O.getContext('2d');
    octx.setTransform(1,0,0,1,0,0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0,0,W,H);
    const rings = r > 3 ? [r, r*.55] : [r];
    for (const rr of rings) for (let k=0;k<16;k++){ const a = k/16*TAU; octx.drawImage(L, Math.cos(a)*rr, Math.sin(a)*rr); }
    octx.globalCompositeOperation = 'source-in'; octx.fillStyle = Q.line; octx.fillRect(0,0,W,H); octx.globalCompositeOperation = 'source-over';
    oc.drawImage(O, 0, 0);
  }
  oc.drawImage(L, 0, 0);
}

