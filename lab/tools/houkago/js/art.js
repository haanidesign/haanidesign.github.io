/* art.js — 放課後リフレイン : all graphics generated in code (window.ART) */
(function(){
'use strict';
const ART = window.ART = {};

/* ================= utils ================= */
function mk(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function hexRGB(c){const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
function mixHex(a,b,t){const A=hexRGB(a),B=hexRGB(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function rng(seed){let s=seed>>>0;return function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function quantize(cv, palette, athr){
  athr = athr==null?128:athr;
  const c=cv.getContext('2d'), w=cv.width, h=cv.height;
  const im=c.getImageData(0,0,w,h), d=im.data;
  const pal=[...palette].map(hexRGB), cache=new Map();
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]<athr){d[i]=d[i+1]=d[i+2]=d[i+3]=0;continue;}
    const key=(d[i]<<16)|(d[i+1]<<8)|d[i+2];
    let p=cache.get(key);
    if(!p){let best=1e12;for(const q of pal){const dr=d[i]-q[0],dg=d[i+1]-q[1],db=d[i+2]-q[2];const rm=(d[i]+q[0])/2;
      const dist=(2+rm/256)*dr*dr+4*dg*dg+(2+(255-rm)/256)*db*db;if(dist<best){best=dist;p=q;}}cache.set(key,p);}
    d[i]=p[0];d[i+1]=p[1];d[i+2]=p[2];d[i+3]=255;
  }
  c.putImageData(im,0,0);return cv;
}
function downsample(src,k){
  const sw=src.width,sh=src.height,w=Math.floor(sw/k),h=Math.floor(sh/k);
  const sd=src.getContext('2d').getImageData(0,0,sw,sh).data;
  const out=mk(w,h),oc=out.getContext('2d'),od=oc.createImageData(w,h),o=od.data,kk=k*k;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,gg=0,b=0,a=0;
    for(let dy=0;dy<k;dy++){let i=((y*k+dy)*sw+x*k)*4;for(let dx=0;dx<k;dx++,i+=4){const al=sd[i+3];if(al){r+=sd[i]*al;gg+=sd[i+1]*al;b+=sd[i+2]*al;a+=al;}}}
    const j=(y*w+x)*4;if(a>0){o[j]=r/a;o[j+1]=gg/a;o[j+2]=b/a;o[j+3]=a/kk;}
  }
  oc.putImageData(od,0,0);return out;
}

/* ================= vector drawing core (logical coords, hi-res target) ================= */
let g=null, PAL=null, LAYER=null, SC=3;
const reg=c=>{PAL.add(c);return c;};
const TAU=Math.PI*2;
function bp(){g.beginPath();}
function fillC(c){g.fillStyle=reg(c);g.fill();}
function strokeC(c,w){g.strokeStyle=reg(c);g.lineWidth=w;g.lineJoin='round';g.lineCap='round';g.stroke();}
function pathPts(p,closed){g.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)g.lineTo(p[i][0],p[i][1]);if(closed)g.closePath();}
function spline(p,closed){
  const n=p.length,P=i=>closed?p[(i+n)%n]:p[Math.max(0,Math.min(n-1,i))];
  g.moveTo(p[0][0],p[0][1]);
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++){const a=P(i-1),b=P(i),c=P(i+1),d=P(i+2);
    g.bezierCurveTo(b[0]+(c[0]-a[0])/6,b[1]+(c[1]-a[1])/6,c[0]-(d[0]-b[0])/6,c[1]-(d[1]-b[1])/6,c[0],c[1]);}
  if(closed)g.closePath();
}
function lockPath(rx,ry,tx,ty,w,bend){
  const dx=tx-rx,dy=ty-ry,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  const mx=(rx+tx)/2+nx*bend*len,my=(ry+ty)/2+ny*bend*len;
  g.moveTo(rx+nx*w/2,ry+ny*w/2);
  g.quadraticCurveTo(mx+nx*w*0.42,my+ny*w*0.42,tx,ty);
  g.quadraticCurveTo(mx-nx*w*0.42,my-ny*w*0.42,rx-nx*w/2,ry-ny*w/2);
  g.closePath();
}
function ell(x,y,rx,ry,rot){g.ellipse(x,y,rx,ry,rot||0,0,TAU);}
function mirP(p){return p.map(q=>[200-q[0],q[1]]);}
// draws shapes on a separate layer: fills, source-atop shading, union outline behind
function groupL(shapes, ol, ow, shade){
  const main=g, lc=LAYER;
  lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,lc.canvas.width,lc.canvas.height);lc.setTransform(main.getTransform());
  g=lc;
  for(const s of shapes){bp();s.f();fillC(s.c);}
  if(shade){g.globalCompositeOperation='source-atop';shade();}
  g.globalCompositeOperation='destination-over';
  if(ow>0)for(const s of shapes){bp();s.f();strokeC(ol,ow*2);}
  g.globalCompositeOperation='source-over';
  g=main;
  main.save();main.setTransform(1,0,0,1,0,0);main.drawImage(lc.canvas,0,0);main.restore();
}
const LK=(a)=>()=>lockPath(a[0],a[1],a[2],a[3],a[4],a[5]);

/* ================= palette / characters ================= */
const OW=1.2;
const SKIN_FAIR={b:'#fde6d6',s:'#efbba6',d:'#d4907e',o:'#7e443c'};
const SKIN_GIRL={b:'#fee8da',s:'#f3bfae',d:'#dc9484',o:'#86443e'};
const SKIN_TAN ={b:'#f2c49c',s:'#d8986e',d:'#b27250',o:'#62341e'};
const BLZ={b:'#2e3866',s:'#1f2648',d:'#151a33',l:'#48568e',ol:'#0b0e20'};
const SHIRT={b:'#fbfbfd',s:'#ccd1e2',ol:'#4a5070'};
const GOLD={b:'#eebc4c',s:'#a87a24'};

const CHARS={
  minato:{
    skin:SKIN_FAIR, fem:false, ey:104, esep:13, my:125.5, phase:0.3,
    hair:{b:'#e6e4f0',s:'#bab6d0',d:'#8c86a8',l:'#f5f4fb',h:'#ffffff',ol:'#4c4664'}, hlY:62,
    eye:{w:17,h:15.5,tilt:3,irx:0.36,iris:['#464a60','#858ca6','#c8cedf','#262838'],lash:'#383246',lash2:'#8a6a6a',lid:0.06},
    front:{cap:true, circles:[[66,70,9],[76,58,10],[92,50,11],[110,49,10],[125,55,10],[136,68,8]],
      locks:[[70,66,63,110,14,0.12],[77,60,71,100,15,0.08],[87,55,83,98,15,-0.06],[97,54,94,95,15,0.08],[108,55,113,96,15,-0.07],[118,58,126,99,14,0.08],[128,64,137,108,14,-0.12],
        [66,76,57,104,11,0.28],[68,82,63,122,11,0.16],[72,92,72,127,8,0.06],[134,76,143,102,11,-0.28],[132,82,138,121,11,-0.16],[128,92,129,126,8,-0.06],
        [82,92,76,100,6,0.35],[113,92,119,100,6,-0.35],[60,100,52,104,6,-0.3],[140,100,148,103,6,0.3],
        [98,46,90,32,8,-0.3],[104,46,113,35,7,0.3]]},
    back:{cap:[100,84,45,44], circles:[[64,72,10],[78,56,11],[96,48,12],[116,50,11],[131,60,10],[139,76,9]],
      locks:[[68,100,56,128,14,-0.15],[80,112,74,140,14,0.05],[120,112,126,140,14,-0.05],[132,100,144,128,14,0.15],[64,86,50,100,10,-0.2],[136,86,150,100,10,0.2]]},
    outfit:{style:'tie',loose:true,cardigan:true,tie:['#3e7e62','#e6dcae','#2a5a44']}, body:{sw:51,drop:5,out:-3,waist:3}
  },
  aoi:{
    skin:SKIN_FAIR, fem:false, ey:104, esep:13, my:125.5, phase:1.7,
    hair:{b:'#2c3454',s:'#1c2139',d:'#10142a',l:'#4a577f',h:'#93a5d0',ol:'#080a16'}, hlY:60,
    eye:{w:16,h:13,tilt:-2.4,irx:0.33,iris:['#10346e','#2e6ed0','#94c6ff','#081630'],lash:'#12162a',lash2:'#6a5a66',lid:0.12},
    front:{cap:true,circles:[],
      locks:[[84,54,71,86,13,-0.06],[86,56,77,94,12,-0.04],[90,52,129,90,21,0.15],[92,54,121,98,18,0.1],[94,55,109,100,16,0.06],[96,56,99,97,13,0.03],
        [68,74,67,118,10,0.04],[132,72,134,118,12,-0.04],[128,68,137,104,12,-0.08]]},
    back:{cap:[100,82,43,42],circles:[],locks:[[66,96,63,132,16,0.05],[78,108,76,138,16,0.02],[122,108,124,138,16,-0.02],[134,96,137,132,16,-0.05]]},
    outfit:{style:'tie',tie:['#1f3c8a','#c8d4ee','#132a66'],armband:true}, glasses:true, body:{sw:53,drop:-1,out:1,waist:1}
  },
  haruto:{
    skin:SKIN_TAN, fem:false, ey:104, esep:13, my:125.5, phase:2.9,
    hair:{b:'#d9782c',s:'#a8501c',d:'#7a3410',l:'#f2a24e',h:'#ffd89c',ol:'#42200c'}, hlY:60,
    eye:{w:16,h:15,tilt:-0.6,irx:0.37,iris:['#643406','#c0741e','#f6c462','#361c06'],lash:'#2c180c',lash2:'#8a5a3a',lid:0},
    front:{cap:true,circles:[],
      locks:[[90,50,78,24,16,0.1],[104,48,111,20,16,-0.05],[116,52,134,32,15,-0.1],[78,56,58,40,14,0.1],[126,60,146,52,12,-0.1],
        [72,64,65,97,14,0.1],[82,58,79,96,15,0.04],[94,56,89,93,15,-0.03],[106,56,111,94,15,0.04],[118,60,127,95,14,-0.06],[128,66,139,101,12,-0.1],
        [68,76,63,112,10,0.08],[132,76,138,110,10,-0.08]]},
    back:{cap:[100,80,42,40],circles:[],spikes:true,locks:[[66,96,57,128,14,0.1],[134,96,143,128,14,-0.1],[80,108,75,137,14,0],[120,108,125,137,14,0]]},
    outfit:{style:'open',loose:true,tie:['#c4303e','#f2c454','#8a1e2a'],rolled:true}, body:{sw:61,drop:1,out:6,waist:5}
  },
  ritsu:{
    skin:SKIN_FAIR, fem:false, ey:104, esep:13, my:126, phase:4.1,
    hair:{b:'#2f2742',s:'#1e172c',d:'#110b1b',l:'#4f4070',h:'#a08ad0',ol:'#08050e'}, hlY:61,
    eye:{w:16,h:14,tilt:-1.2,irx:0.34,iris:['#381c60','#7a4cc2','#c6a4f2','#180a28'],lash:'#120a1a',lash2:'#6a5070',lid:0.22},
    front:{cap:true,circles:[],
      locks:[[64,72,62,97,8,0.05],[78,60,73,97,12,0.04],[86,56,83,99,12,-0.02],[98,56,99,113,14,0.04],[94,54,109,127,24,0.08],[103,55,122,125,22,0.05],[113,58,134,121,18,0.02],[124,64,140,141,16,-0.04],[132,74,142,150,12,-0.04]]},
    back:{cap:[100,82,44,43],circles:[],locks:[[62,86,54,168,22,0.06],[72,100,66,172,20,0.03],[128,100,136,172,20,-0.03],[138,86,148,166,22,-0.06],[84,110,84,160,20,0],[116,110,118,160,20,0]]},
    outfit:{style:'hoodie',headphones:true}, piercing:true, body:{sw:50,drop:8,out:-7,waist:2}
  },
  friend:{
    skin:SKIN_GIRL, fem:true, ey:105, esep:13.5, my:125, phase:5.3,
    hair:{b:'#d9968a',s:'#b06e68',d:'#86484a',l:'#efb8a8',h:'#fff2e6',ol:'#56262a'}, hlY:62,
    eye:{w:18.5,h:19,tilt:0,irx:0.38,iris:['#86381a','#e07a38','#ffcb92','#461808'],lash:'#3a1618',lash2:'#a0605a',lid:0,fem:true,lw:2.5},
    front:{cap:true,circles:[],
      locks:[[72,62,70,99,14,0.06],[81,57,81,98,14,0.02],[91,55,91,96,14,0],[101,55,103,97,14,-0.02],[111,56,114,98,14,-0.03],[121,60,127,99,14,-0.06],[129,66,134,103,10,-0.06],
        [67,76,68,129,11,0.08],[133,76,132,129,11,-0.08]]},
    back:{cap:[100,84,43,42],circles:[],locks:[[60,70,36,178,34,-0.12],[64,80,50,170,24,0.02],[140,70,164,178,34,0.12],[136,80,150,170,24,-0.02],[40,168,48,184,10,0.3],[160,168,152,184,10,-0.3],[76,110,78,142,18,0],[124,110,122,142,18,0]]},
    outfit:{style:'ribbon',ribbon:['#d23a4e','#96203a']}, scrunchie:'#ffd05a'
  }
};

/* expressions */
const EXPR={
  normal:{eye:{},brow:{i:0,o:0.5,a:1.5},mouth:'neutral'},
  smile:{eye:{low:0.28},brow:{i:-0.5,o:0.5,a:2},mouth:'smile',blush:0.5},
  laugh:{eye:{mode:'happy'},brow:{i:-2,o:-0.5,a:2.5},mouth:'laugh',blush:1,marks:['sparkle']},
  blush:{eye:{lx:3,ly:1.5,lid:0.12,low:0.18,wet:1},brow:{i:-3,o:1.5,a:0.8},mouth:'wavy',blush:2,marks:['sweat']},
  angry:{eye:{lid:0.3,pupil:0.85},brow:{i:4.5,o:-2.5,a:-0.5},mouth:'shout',marks:['vein']},
  annoyed:{eye:{lid:0.48,lx:-2.5},brow:{i:1,o:0,a:0.3},mouth:'flat',marks:['sweat']},
  sad:{eye:{ly:2,lid:0.18,low:0.12,wet:1},brow:{i:-4,o:2.5,a:0.3},mouth:'frown',marks:['gloom','tear']},
  surprise:{eye:{open:1.12,iris:0.74,pupil:0.55},brow:{i:-4.5,o:-3.5,a:3},mouth:'o',marks:['shock']},
  think:{eye:{lx:3.5,ly:-2.5,lid:0.1},brow:{i:0,o:0,a:1.5,asym:true},mouth:'side',marks:['dots']},
  wink:{eye:{},eyeR:{mode:'happy'},brow:{i:-1,o:0,a:2},mouth:'grin',blush:0.5,marks:['star']}
};
ART.exprs=Object.keys(EXPR);
ART.chars=Object.keys(CHARS);

/* ---------- face parts ---------- */
function faceShape(C){
  const ch=C.fem?138:141;
  spline([[70,70],[70.5,96],[73,110],[79,123],[89,133],[100,ch],[111,133],[121,123],[127,110],[129.5,96],[130,70],[100,52]],true);
}
function earL(){ell(70,104,5,8.5,0.1);} function earR(){ell(130,104,5,8.5,-0.1);}
function drawHead(C){
  const K=C.skin;
  groupL([{f:earL,c:K.b},{f:earR,c:K.b},{f:()=>faceShape(C),c:K.b}],K.o,OW,()=>{
    // bang shadow on forehead
    g.save();g.translate(1.5,4.5);
    for(const L of C.front.locks){bp();lockPath(...L);fillC(K.s);}
    if(C.front.cap){bp();capFront();fillC(K.s);}
    g.restore();
    // side jaw shading (light from upper-left)
    bp();spline([[122,96],[128,96],[126,112],[119,126],[110,134],[114,122],[120,110]],true);fillC(K.s);
    // ear inner
    bp();g.moveTo(71.5,99);g.quadraticCurveTo(67.5,103,70.5,109);strokeC(K.d,0.9);
    bp();g.moveTo(128.5,99);g.quadraticCurveTo(132.5,103,129.5,109);strokeC(K.d,0.9);
  });
}
function capFront(){g.ellipse(100,82,44.5,43.5,0,Math.PI*0.98,Math.PI*2.02);g.quadraticCurveTo(100,42,56,84);g.closePath();}

function eyeDraw(C,s,st){
  const E=C.eye, ex=100+s*C.esep, ey=C.ey;
  const w=E.w, h=E.h*(st.open||1), tilt=E.tilt, lc=E.lash;
  const xi=ex-s*w/2, xo=ex+s*w/2;
  const mode=st.mode||'open';
  if(mode==='closed'){
    bp();g.moveTo(xi,ey+1.5);g.quadraticCurveTo(ex,ey+h*0.32,xo+s*1.5,ey+tilt*0.6);strokeC(lc,2.0);
    bp();g.moveTo(xo+s*1.2,ey+tilt*0.6);g.lineTo(xo+s*3.5,ey+tilt*0.6+(E.fem?-1:1.2));strokeC(lc,1.3);
    return;
  }
  if(mode==='happy'){
    bp();g.moveTo(xi,ey+3);g.quadraticCurveTo(ex,ey-h*0.5,xo+s*1.2,ey+3+tilt*0.3);strokeC(lc,2.2);
    if(E.fem){bp();g.moveTo(xo+s*0.5,ey+2.5);g.lineTo(xo+s*3,ey+1);strokeC(lc,1.2);}
    return;
  }
  const lid=Math.min(0.9,(st.lid||0)+(E.lid||0)), low=st.low||0;
  const topY=ey-h*0.52+lid*h*0.62;
  const ti=[xi,ey-h*0.2+lid*h*0.28], to=[xo+s*0.8,ey-h*0.16+tilt+lid*h*0.22], tm=[ex-s*w*0.06,topY];
  const bi=[xi+s*0.6,ey+h*0.30], bo=[xo,ey+h*0.2+tilt*0.5], bm=[ex+s*w*0.05,ey+h*0.47-low*h*0.5];
  const ctl=(a,m,b)=>[2*m[0]-(a[0]+b[0])/2,2*m[1]-(a[1]+b[1])/2];
  const ct=ctl(ti,tm,to), cb=ctl(bo,bm,bi);
  const eyeP=()=>{g.moveTo(ti[0],ti[1]);g.quadraticCurveTo(ct[0],ct[1],to[0],to[1]);g.lineTo(bo[0],bo[1]);g.quadraticCurveTo(cb[0],cb[1],bi[0],bi[1]);g.closePath();};
  bp();eyeP();fillC('#fcf9f7');
  g.save();bp();eyeP();g.clip();
  bp();ell(ex,topY+0.5,w*0.75,h*0.2);fillC('#d8d0e0');
  const ir=st.iris||1, irx=w*E.irx*ir, iry=E.h*0.42*ir;
  const icx=ex+(st.lx||0)+s*0.3, icy=ey+E.h*0.07+(st.ly||0);
  const I=E.iris, pu=st.pupil||1;
  bp();ell(icx,icy,irx+0.9,iry+0.9);fillC(I[3]);
  bp();ell(icx,icy,irx,iry);fillC(I[1]);
  bp();ell(icx,icy-iry*0.52,irx*1.05,iry*0.62);fillC(I[0]);
  bp();ell(icx,icy+iry*0.56,irx*0.74,iry*0.36);fillC(I[2]);
  bp();ell(icx,icy+iry*0.02,irx*0.44*pu,iry*0.5*pu);fillC(I[3]);
  bp();ell(icx-irx*0.36,icy-iry*0.4,irx*0.38,iry*0.27,-0.4);fillC('#ffffff');
  bp();ell(icx+irx*0.45,icy+iry*0.4,irx*0.17,iry*0.13);fillC('#ffffff');
  if(st.wet){bp();g.moveTo(icx-irx*0.7,icy+iry*0.62);g.quadraticCurveTo(icx,icy+iry*1.05,icx+irx*0.7,icy+iry*0.62);strokeC('#ffffff',0.9);}
  g.restore();
  // lash line
  bp();g.moveTo(ti[0],ti[1]);g.quadraticCurveTo(ct[0],ct[1],to[0],to[1]);strokeC(lc,E.lw||2.1);
  if(E.fem){bp();g.moveTo(to[0]-s*2.5,to[1]-0.8);g.lineTo(to[0]+s*3.2,to[1]-2.6);g.lineTo(to[0]+s*0.6,to[1]+1.3);g.closePath();fillC(lc);
    bp();g.moveTo(to[0]-s*1,to[1]-1);g.lineTo(to[0]+s*2.6,to[1]+0.2);strokeC(lc,1);}
  else{bp();g.moveTo(to[0]-s*3.5,to[1]-0.2);g.lineTo(to[0]+s*0.8,to[1]+0.9);strokeC(lc,2.6);}
  // crease
  bp();g.moveTo(ex-s*w*0.1,topY-2.6);g.quadraticCurveTo(ex+s*w*0.3,topY-3.2,to[0]-s*0.5,to[1]-2.4);strokeC(C.skin.d,0.7);
  // lower lash
  bp();g.moveTo(bm[0]-s*w*0.1,bm[1]);g.quadraticCurveTo((bm[0]+bo[0])/2+s*1,(bm[1]+bo[1])/2+0.6,bo[0],bo[1]);strokeC(E.lash2,E.fem?1.1:0.9);
}
function browDraw(C,s,B){
  const E=C.eye, ex=100+s*C.esep, by=C.ey-E.h*0.5-5.5+(E.tilt<0?0.5:0);
  let i=B.i,o=B.o+(E.tilt>1?1.2:(E.tilt<-1?-1.4:0));
  if(B.asym&&s>0){i-=3;o-=4.5;}
  const xi=ex-s*E.w*0.4, xo=ex+s*E.w*0.62;
  bp();g.moveTo(xi,by+i);g.quadraticCurveTo(ex+s*2,by-B.a+(i+o)/2-1,xo,by+o);strokeC(C.hair.ol,C.fem?1.4:1.9);
  bp();g.moveTo(xi,by+i);g.lineTo(xi+s*3,by+i+(o-i)*0.25-0.5);strokeC(C.hair.ol,C.fem?1.9:2.5);
}
function mouthDraw(C,type){
  const y=C.my, lc=C.skin.o, inside='#8c2c3a', tongue='#e87a86';
  const open=(pts,teeth,tng)=>{bp();pts();fillC(inside);
    g.save();bp();pts();g.clip();
    if(tng){bp();ell(100,y+tng,5.5,3.2);fillC(tongue);}
    if(teeth){bp();g.rect(92,y-4,16,teeth+2);fillC('#ffffff');}
    g.restore();bp();pts();strokeC(lc,1.1);};
  switch(type){
    case 'neutral':bp();g.moveTo(96.5,y);g.quadraticCurveTo(100,y+1.2,103.5,y-0.2);strokeC(lc,1.15);break;
    case 'smile':bp();g.moveTo(94.5,y-1.2);g.quadraticCurveTo(100,y+3.4,105.5,y-1.2);strokeC(lc,1.2);break;
    case 'grin':open(()=>{g.moveTo(94,y-1.8);g.quadraticCurveTo(100,y-0.3,106,y-1.8);g.quadraticCurveTo(105,y+5.5,100,y+6);g.quadraticCurveTo(95,y+5.5,94,y-1.8);g.closePath();},C.fem?0:1.4,4.6);break;
    case 'laugh':open(()=>{g.moveTo(92.5,y-2.2);g.quadraticCurveTo(100,y-0.5,107.5,y-2.2);g.quadraticCurveTo(106.5,y+8.5,100,y+9);g.quadraticCurveTo(93.5,y+8.5,92.5,y-2.2);g.closePath();},0,7);break;
    case 'o':open(()=>{ell(100,y+2.2,3.1,4);},0,0);break;
    case 'frown':bp();g.moveTo(95.5,y+2);g.quadraticCurveTo(100,y-1.5,104.5,y+2);strokeC(lc,1.15);break;
    case 'shout':open(()=>{g.moveTo(93.5,y+1);g.quadraticCurveTo(100,y-2.8,106.5,y+1);g.quadraticCurveTo(105,y+6.5,100,y+6.3);g.quadraticCurveTo(95,y+6.5,93.5,y+1);g.closePath();},2.2,5.6);break;
    case 'wavy':bp();g.moveTo(94.5,y+0.8);g.quadraticCurveTo(96.2,y-1.4,98,y+0.6);g.quadraticCurveTo(99.8,y+2,101.6,y+0.2);g.quadraticCurveTo(103.4,y-1.4,105.3,y+0.8);strokeC(lc,1.1);break;
    case 'flat':bp();g.moveTo(96,y+0.6);g.lineTo(104.5,y+0.1);strokeC(lc,1.15);break;
    case 'side':bp();g.moveTo(99,y+0.9);g.quadraticCurveTo(102.5,y-0.9,105.5,y+0.4);strokeC(lc,1.15);break;
  }
}
function blushDraw(C,lvl){
  if(!lvl)return;
  const pk='#f58a94', mix=mixHex(C.skin.b,pk,lvl>=2?0.55:0.4), y=C.ey+11;
  for(const s of [-1,1]){bp();ell(100+s*16.5,y,7.5,3.1);fillC(mix);}
  if(lvl>=2){bp();ell(100,y-3,10,2.2);fillC(mix);}
  if(lvl>=1)for(const s of [-1,1])for(let k=0;k<3;k++){const x=100+s*16.5-3.6+k*3.6;bp();g.moveTo(x+1.3,y-1.8);g.lineTo(x-1.1,y+1.8);strokeC('#e25a6c',0.8);}
}
function noseDraw(C){bp();g.moveTo(101.2,112.5);g.lineTo(100.2,116.8);g.lineTo(101.6,117.2);strokeC(C.skin.d,0.9);}

function markDraw(C,m,X){
  switch(m){
    case 'vein':{const cx=140,cy=58;
      for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){bp();g.moveTo(cx+sx*1.8,cy+sy*6.5);g.quadraticCurveTo(cx+sx*1.8,cy+sy*1.8,cx+sx*6.5,cy+sy*1.8);strokeC('#6a0e1a',3.4);}
      for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){bp();g.moveTo(cx+sx*1.8,cy+sy*6.5);g.quadraticCurveTo(cx+sx*1.8,cy+sy*1.8,cx+sx*6.5,cy+sy*1.8);strokeC('#ec3a4c',1.7);}
      break;}
    case 'sweat':{const x=136,y=80;bp();g.moveTo(x,y-7);g.quadraticCurveTo(x-4.5,y+1,x-2.6,y+3.4);g.quadraticCurveTo(x,y+5.6,x+2.6,y+3.4);g.quadraticCurveTo(x+4.5,y+1,x,y-7);g.closePath();
      fillC('#bfe4ff');strokeC('#4a78b0',0.9);bp();ell(x-1.3,y+1.2,0.9,1.6);fillC('#ffffff');break;}
    case 'tear':{const x=100-C.esep-5,y=C.ey+9;bp();g.moveTo(x,y-3);g.quadraticCurveTo(x-2.6,y+2,x,y+3.5);g.quadraticCurveTo(x+2.6,y+2,x,y-3);fillC('#bfe4ff');strokeC('#5a88c0',0.7);break;}
    case 'gloom':{for(let k=0;k<9;k++){const x=80+k*5,l=5+((k*7)%4)*2.5;bp();g.moveTo(x,68);g.lineTo(x,68+l);strokeC('#5a5ea0',0.9);}break;}
    case 'shock':{for(const [a,b,c,d] of [[146,52,153,44],[151,60,160,57],[140,46,142,37]]){bp();g.moveTo(a,b);g.lineTo(c,d);strokeC('#2a2030',1.6);}break;}
    case 'dots':{for(const [x,y,r] of [[143,64,1.6],[149,55,2.3],[157,44,3.2]]){bp();ell(x,y,r,r);fillC('#ffffff');strokeC('#3a3448',0.9);}break;}
    case 'sparkle':case 'star':{const x=m==='star'?143:146,y=m==='star'?96:60,r=m==='star'?6:5;
      bp();g.moveTo(x,y-r);g.quadraticCurveTo(x,y,x+r,y);g.quadraticCurveTo(x,y,x,y+r);g.quadraticCurveTo(x,y,x-r,y);g.quadraticCurveTo(x,y,x,y-r);g.closePath();fillC('#ffe46a');strokeC('#b07a18',0.8);break;}
  }
}

/* ---------- hair ---------- */
function hairShapes(C,which){
  const H=C.hair, D=C[which], out=[], col=which==='back'?H.s:H.b;
  if(which==='back'){const c=D.cap;out.push({f:()=>ell(c[0],c[1],c[2],c[3]),c:col});
    if(D.spikes)for(let k=0;k<8;k++){const a=Math.PI*(-0.97+k*0.135),r0=18,r1=60+(k%2)*6;
      out.push({f:()=>lockPath(100+Math.cos(a)*r0,82+Math.sin(a)*r0,100+Math.cos(a)*r1,84+Math.sin(a)*r1*0.95,26,(k%2?0.06:-0.06)),c:col});}
  } else if(D.cap) out.push({f:capFront,c:col});
  for(const c of D.circles)out.push({f:()=>ell(c[0],c[1],c[2],c[2]),c:col});
  for(const L of D.locks)out.push({f:LK(L),c:col});
  return out;
}
function hairShadeFront(C){
  const H=C.hair, D=C.front;
  // soft light top-left
  bp();ell(84,58,26,15,-0.3);fillC(H.l);
  // per-lock shade band on right side
  for(const L of D.locks){const [rx,ry,tx,ty,w,b]=L;if(w<8)continue;
    bp();lockPath(rx+w*0.26,ry+7,tx+0.6,ty-0.5,w*0.46,b);fillC(H.s);}
  // right side shadow
  bp();ell(146,96,22,50,0);fillC(H.s);
  // strand lines
  for(const L of D.locks){const [rx,ry,tx,ty,w]=L;if(w<10)continue;
    const a=0.45,b=0.88;bp();g.moveTo(rx+(tx-rx)*a-w*0.08,ry+(ty-ry)*a);g.lineTo(rx+(tx-rx)*b-w*0.05,ry+(ty-ry)*b);strokeC(H.d,0.6);}
  // angel ring highlight
  const y0=C.hlY;
  for(let i=0;i<8;i++){const x=70+i*8.6,dx=(x-100)/40,y=y0+dx*dx*12-(i%2)*1.5;
    if(i%2)continue;bp();lockPath(x,y-1.5,x+dx*1.5,y+5.5,3.2,0.05);fillC(H.h);}
  bp();g.moveTo(68,y0+12);g.quadraticCurveTo(100,y0-10,132,y0+12);strokeC(H.l,2.6);
  
}
function hairShadeBack(C){
  const H=C.hair;
  bp();g.rect(0,110,200,120);fillC(H.d);
  bp();ell(86,70,34,26,-0.3);fillC(H.b);
  for(const L of C.back.locks){const [rx,ry,tx,ty,w]=L;bp();g.moveTo(rx+(tx-rx)*0.3,ry+(ty-ry)*0.3);g.lineTo(rx+(tx-rx)*0.85,ry+(ty-ry)*0.85);strokeC(H.s,0.7);}
}

/* ---------- body ---------- */
/* body geometry: per-character shoulders / posture */
const BODY_DEF={sw:54,sy:162,drop:2,out:0,waist:2,neck:86};
function bodyGeom(C,cut){
  cut=cut||300;
  const Bd=Object.assign({},BODY_DEF,C.fem?{sw:48,sy:165,drop:3,out:-1,waist:3,neck:88}:{},C.body||{});
  const L=100-Bd.sw, sy=Bd.sy, d=Bd.drop, o=Bd.out;
  const T=[L+15,sy-5+d*0.4], cap=[L,sy+11+d], ctl=[L+1,sy-3+d], om=[L-3+o*0.35,sy+62], ob=[L-5+o,300], ib=[L+24+o,300], ap=[L+26,sy+34+d];
  const armX=y=>{const k=(y-om[1])/(300-om[1]);const ox=y<om[1]?cap[0]+(om[0]-cap[0])*(y-cap[1])/(om[1]-cap[1]):om[0]+(ob[0]-om[0])*k;const ki=(y-ap[1])/(300-ap[1]);return [ox,ap[0]+(ib[0]-ap[0])*ki];};
  const cx=armX(cut), cb=[cx[0],cut], ci=[cx[1],cut];
  const armL=()=>{g.moveTo(T[0],T[1]);g.quadraticCurveTo(ctl[0],ctl[1],cap[0],cap[1]);g.quadraticCurveTo(cap[0]-3,(cap[1]+om[1])/2,om[0],om[1]);g.lineTo(cb[0],cb[1]);g.lineTo(ci[0],ci[1]);g.lineTo(ap[0],ap[1]);g.closePath();};
  const armR=()=>{g.moveTo(200-T[0],T[1]);g.quadraticCurveTo(200-ctl[0],ctl[1],200-cap[0],cap[1]);g.quadraticCurveTo(203-cap[0],(cap[1]+om[1])/2,200-om[0],om[1]);g.lineTo(200-cb[0],cb[1]);g.lineTo(200-ci[0],ci[1]);g.lineTo(200-ap[0],ap[1]);g.closePath();};
  const n=Bd.neck, ny=C.fem?149:146;
  const tor=[[n,ny],[T[0],T[1]],[L+20,sy+16+d],[L+22+Bd.waist,300],[178-L-Bd.waist,300],[180-L,sy+16+d],[200-T[0],T[1]],[200-n,ny]];
  return {Bd,L,sy,d,o,T,cap,om,ob,ib,ap,armX,armL,armR,tor};
}

function drawBody(C){
  const B=BLZ, K=C.skin, O=C.outfit, fem=C.fem;
  const cut=O.rolled?266:300;
  const G=bodyGeom(C,cut), L=G.L;
  // forearms (rolled sleeves)
  if(O.rolled){
    const [o1,i1]=G.armX(262);const fa=[[o1+2,262],[i1-2,262],[i1-3+G.o*0.1,300],[o1+3,300]];
    groupL([{f:()=>pathPts(fa,true),c:K.b},{f:()=>pathPts(mirP(fa),true),c:K.b}],K.o,OW,()=>{bp();g.rect(i1-10,262,10,40);fillC(K.s);bp();g.rect(200-i1,262,16,40);fillC(K.s);});
  }
  const bcol=[[82,150],[86,137],[114,137],[118,150]];
  groupL([{f:()=>pathPts(G.tor,true),c:B.b},{f:()=>{G.armL();},c:B.b},{f:()=>{G.armR();},c:B.b},{f:()=>pathPts(bcol,true),c:B.s}],B.ol,OW,()=>{
    const R0=200-L;
    bp();pathPts([[R0-28,G.sy],[210,G.sy],[210,300],[R0-24+G.o,300]],true);fillC(B.s);
    bp();pathPts([[128,165],[146-L*0.2,165],[148-L*0.2,300],[132,300]],true);fillC(B.s);
    bp();pathPts([[L+8,G.sy+30],[L+16,G.sy+26],[L+18+G.o,300],[L+8+G.o,300]],true);fillC(B.s);
    bp();pathPts([[R0-10,G.sy+14],[R0,G.sy+28],[R0+3-G.o,300],[R0-6-G.o,300]],true);fillC(B.d);
    bp();ell(100,151,30,9);fillC(B.s);
    bp();g.moveTo(L-2,G.sy+26+G.d);g.quadraticCurveTo(L+4,G.sy+2+G.d,L+18,G.sy-2+G.d*0.5);strokeC(B.l,3);
    bp();g.moveTo(L+22,G.sy+8);g.lineTo(84,152);strokeC(B.l,1.6);
    // waist fold shading
    bp();g.moveTo(L+26,G.sy+70);g.quadraticCurveTo(L+30,G.sy+100,L+27+G.Bd.waist,300);strokeC(B.s,2);
  });
  // hood draped over the blazer collar
  if(O.style==='hoodie'){
    groupL([{f:()=>{g.moveTo(60,170);g.quadraticCurveTo(58,136,100,130);g.quadraticCurveTo(142,136,140,170);g.quadraticCurveTo(132,160,124,162);g.quadraticCurveTo(100,146,76,162);g.quadraticCurveTo(68,160,60,170);g.closePath();},c:'#6c697e'}],'#1c1a26',OW,
      ()=>{bp();g.rect(104,120,40,60);fillC('#524f66');bp();g.moveTo(64,164);g.quadraticCurveTo(80,148,100,144);strokeC('#8a88a0',1.6);bp();g.moveTo(74,160);g.quadraticCurveTo(70,150,82,146);strokeC('#45435a',1);bp();g.moveTo(126,160);g.quadraticCurveTo(130,150,118,146);strokeC('#3a384c',1);});
  }
  // arm seams + folds
  for(const s of [1,-1]){const X=x=>s>0?x:200-x;
    const [,i0]=G.armX(G.sy+36),[,i1]=G.armX(Math.min(300,cut));
    bp();g.moveTo(X(i0+1),G.sy+36);g.quadraticCurveTo(X((i0+i1)/2),(G.sy+36+cut)/2,X(i1+1),Math.min(300,cut));strokeC(B.ol,1.1);
    for(const fy of [246,258]){if(fy>cut-4)continue;const [a,c]=G.armX(fy);bp();g.moveTo(X(a+3),fy);g.quadraticCurveTo(X((a+c)/2),fy+5,X(c-3),fy+2);strokeC(B.d,0.8);}
  }
  if(O.rolled){ // cuffs & wristband
    const [a,c]=G.armX(262);const cf=[[a-2,256],[c+2,256],[c+1,271],[a,271]];const [a2,c2]=G.armX(290);const wb=[[a2+4,284],[c2-4,284],[c2-4.2,295],[a2+4.2,295]];
    groupL([{f:()=>pathPts(cf,true),c:SHIRT.b},{f:()=>pathPts(mirP(cf),true),c:SHIRT.b}],SHIRT.ol,OW,()=>{
      bp();g.rect(0,264,200,8);fillC(SHIRT.s);bp();g.rect(c-12,250,14,30);fillC(SHIRT.s);bp();g.rect(198-c,250,20,30);fillC(SHIRT.s);});
    for(const x of [a+5,a+13,a+21]){bp();g.moveTo(x,258);g.lineTo(x-1,268);strokeC(SHIRT.s,0.8);bp();g.moveTo(200-x,258);g.lineTo(201-x,268);strokeC(SHIRT.s,0.8);}
    groupL([{f:()=>pathPts(wb,true),c:'#f4f4f8'},{f:()=>pathPts(mirP(wb),true),c:'#f4f4f8'}],'#3a2a20',OW,()=>{bp();g.rect(0,288,200,3.2);fillC('#ee7a2a');});
  }
  // headphone band behind neck
  if(O.headphones){bp();g.moveTo(75,163);g.quadraticCurveTo(100,127,125,163);strokeC('#0c0a12',6.5);bp();g.moveTo(75,163);g.quadraticCurveTo(100,127,125,163);strokeC('#34313f',3.8);}
  // neck
  groupL([{f:()=>pathPts([[90,122],[110,122],[111.5,156],[88.5,156]],true),c:K.b}],K.o,OW*0.9,()=>{
    bp();ell(100,127,17,12.5);fillC(K.s);bp();g.rect(105,120,10,40);fillC(K.s);});
  // inner V
  const open=O.style==='open';
  const V= fem?[[88,148],[112,148],[100,222]] : open?[[84,146],[116,146],[131,300],[69,300]] : [[86,146],[114,146],[100,233]];
  if(O.cardigan){
    groupL([{f:()=>pathPts(V,true),c:'#efe2c2'}],'#5a4a30',OW,()=>{bp();pathPts([[103,146],[118,146],[102,240]],true);fillC('#d4c19a');
      for(let yy=178;yy<236;yy+=4.5){bp();g.moveTo(80,yy);g.lineTo(120,yy);strokeC('#e0cfa8',0.6);}});
    for(const by of [214,226]){bp();ell(100,by,2,2);fillC('#8a6a40');}
  }
  const SV=O.cardigan?[[90,146],[110,146],[100,204]]:V;
  if(O.style==='hoodie'){
    groupL([{f:()=>pathPts(V,true),c:'#6c697e'}],'#1c1a26',OW,()=>{bp();pathPts([[104,146],[118,146],[102,236]],true);fillC('#524f66');bp();ell(100,147,16,6);fillC('#4a475c');});
    for(const [x0,x1,y1] of [[95,93.5,188],[105,106.5,184]]){bp();g.moveTo(x0,152);g.quadraticCurveTo(x0-1,170,x1,y1);strokeC('#e8e6f2',1.2);bp();g.rect(x1-1.2,y1,2.4,4);fillC('#c8c4d0');}
  } else {
    groupL([{f:()=>pathPts(SV,true),c:SHIRT.b}],SHIRT.ol,OW,()=>{bp();ell(100,146,15,7);fillC(SHIRT.s);bp();pathPts([[106,150],[125,150],[125,300],[112,300]],true);fillC(SHIRT.s);});
    if(open){for(const by of [250,272,294]){bp();ell(100.5,by,1.6,1.6);fillC(SHIRT.s);strokeC(SHIRT.ol,0.6);}
      bp();g.moveTo(102.5,160);g.lineTo(103.5,300);strokeC(SHIRT.s,0.8);}
    const loose=O.loose;
    if(loose){ // open collar skin V
      groupL([{f:()=>pathPts([[93,146],[107,146],[100,163]],true),c:K.b}],K.o,0.6,()=>{bp();ell(100,146,9,6);fillC(K.s);});
    }
    // collar
    const cl= loose?[[88.5,140],[96,165],[83,158],[83,147]]:[[89.5,139],[99.5,156],[85,153.5],[84,146]];
    groupL([{f:()=>pathPts(cl,true),c:SHIRT.b},{f:()=>pathPts(mirP(cl),true),c:SHIRT.b}],SHIRT.ol,OW*0.9,()=>{bp();pathPts(mirP(cl),true);fillC(SHIRT.s);});
    if(O.tie){
      const T=O.tie, ky=loose?164:154, len=loose?72:76, sw=loose?4:0;
      const knot=[[96.5,ky],[103.5,ky],[102.6,ky+7.5],[97.4,ky+7.5]];
      const blade=[[97.4,ky+7.5],[102.6,ky+7.5],[106+sw,ky+len-8],[100+sw,ky+len],[94+sw,ky+len-8]];
      groupL([{f:()=>pathPts(blade,true),c:T[0]},{f:()=>pathPts(knot,true),c:T[0]}],'#1a1018',OW*0.9,()=>{
        for(let k=-4;k<14;k++){bp();g.moveTo(90,ky+k*6);g.lineTo(112,ky+k*6+9);strokeC(T[1],1.3);}
        bp();pathPts([[101,ky],[110,ky],[112+sw,ky+len],[101+sw,ky+len]],true);fillC(T[2]);});
    }
    if(O.ribbon){
      const R=O.ribbon,y=157;
      const lp=()=>{g.moveTo(100,y);g.quadraticCurveTo(92,y-11,85,y-6);g.quadraticCurveTo(83,y+1,87,y+6);g.quadraticCurveTo(94,y+6,100,y);g.closePath();};
      const rp=()=>{g.moveTo(100,y);g.quadraticCurveTo(108,y-11,115,y-6);g.quadraticCurveTo(117,y+1,113,y+6);g.quadraticCurveTo(106,y+6,100,y);g.closePath();};
      groupL([{f:()=>pathPts([[98,y+1],[92,y+19],[96,y+17.5],[100,y+2]],true),c:R[0]},{f:()=>pathPts([[102,y+1],[108,y+19],[104,y+17.5],[100,y+2]],true),c:R[0]},{f:lp,c:R[0]},{f:rp,c:R[0]},{f:()=>ell(100,y,3.4,3.8),c:R[0]}],'#3a0e18',OW*0.9,()=>{
        bp();rp();fillC(R[1]);bp();g.moveTo(88,y-3);g.quadraticCurveTo(92,y-5,96,y-1);strokeC('#f07a88',1);bp();ell(99,y-1,1.2,1.4);fillC('#f07a88');});
    }
  }
  // lapels
  const lap= open?[[84,144],[63,166],[71,172],[66,178],[61,300],[70,300]] : fem?[[88,147],[71,166],[78,171],[74,176],[99.5,223]] : [[86,144],[68,165],[76,171],[72,177],[99.5,234]];
  groupL([{f:()=>pathPts(lap,true),c:B.b},{f:()=>pathPts(mirP(lap),true),c:B.b}],B.ol,OW,()=>{
    bp();pathPts(mirP(lap),true);fillC(B.s);bp();g.moveTo(lap[1][0]+2,lap[1][1]+1);g.lineTo(lap[4][0]-(open?0:6),lap[4][1]-(open?0:14));strokeC(B.l,1.4);});
  bp();g.moveTo(lap[2][0],lap[2][1]);g.lineTo(lap[3][0]+2,lap[3][1]+1);strokeC(B.ol,0.9);
  // buttons, pocket, crest
  if(!open){const bys=fem?[240,264]:[250,275];for(const by of bys){bp();ell(100,by,3.1,3.1);fillC(GOLD.b);strokeC('#4a3208',0.9);bp();ell(99.2,by-0.8,1,1);fillC('#fff0b0');}}
  const px=fem?-4:0;
  bp();g.moveTo(115+px,204);g.lineTo(137+px,201);strokeC(B.ol,1.1);
  bp();g.moveTo(122+px,191);g.lineTo(130+px,191);g.lineTo(130+px,196);g.quadraticCurveTo(130+px,200,126+px,202);g.quadraticCurveTo(122+px,200,122+px,196);g.closePath();fillC(GOLD.b);strokeC('#4a3208',0.7);
  bp();g.moveTo(126+px,193);g.lineTo(126+px,199);strokeC(GOLD.s,0.8);
  if(!fem&&!open){const Gp=bodyGeom(C),px0=Gp.L+26+Gp.Bd.waist;bp();g.moveTo(px0,283);g.lineTo(px0+20,283);strokeC(B.ol,1);bp();g.moveTo(200-px0,283);g.lineTo(180-px0,283);strokeC(B.ol,1);}
  if(O.armband){
    const G2=bodyGeom(C),[ao,ai]=G2.armX(212),x0=200-ai+0.5,x1=200-ao+1.5,dx=x0-141.5;
    const ab=[[x0,203],[x1-1.5,207],[x1,222],[x0+0.5,218]];
    groupL([{f:()=>pathPts(ab,true),c:'#c8323e'}],'#3a0810',OW,()=>{bp();pathPts([[x0-1,203],[x1+1,207],[x1+1,209.5],[x0-1,205.5]],true);fillC(GOLD.b);bp();pathPts([[x0-1,215.6],[x1+2,219.6],[x1+2,222],[x0-1,218]],true);fillC(GOLD.b);bp();g.rect(x1-10,200,14,30);fillC('#961c2a');});
    for(let k=0;k<3;k++){const x=147+dx+k*6.5,y=210.5+k*0.9;bp();g.moveTo(x,y);g.lineTo(x+3.5,y+0.4);g.moveTo(x+1.7,y-1);g.lineTo(x+1.7,y+4);g.moveTo(x,y+3.4);g.lineTo(x+3.5,y+3.8);strokeC('#fff4e0',0.8);}
  }
  if(O.headphones){
    for(const s of [-1,1]){const cx=100+s*21,cy=163;
      groupL([{f:()=>ell(cx,cy,7.5,9.5,s*0.55),c:'#2a2733'}],'#06050a',OW,()=>{bp();ell(cx+s*1.5,cy+1,5.5,7.5,s*0.55);fillC('#8a5ac8');bp();ell(cx+s*1.5,cy+1,3.8,5.6,s*0.55);fillC('#1c1a24');bp();ell(cx-s*3,cy-4,1.6,2.4,s*0.55);fillC('#6a6680');});
    }
  }
}

/* ---------- full character ---------- */
function drawChar(C,exprName,blink){
  const X=EXPR[exprName]||EXPR.normal;
  groupL(hairShapes(C,'back'),C.hair.ol,OW,()=>hairShadeBack(C));
  drawBody(C);
  drawHead(C);
  blushDraw(C,X.blush||0);
  noseDraw(C);
  mouthDraw(C,X.mouth);
  for(const s of [-1,1]){
    let st=Object.assign({},X.eye);
    if(s>0&&X.eyeR)st=Object.assign(st,X.eyeR);
    if(blink&&st.mode!=='happy')st.mode='closed';
    eyeDraw(C,s,st);
  }
  groupL(hairShapes(C,'front'),C.hair.ol,OW,()=>hairShadeFront(C));
  for(const s of [-1,1])browDraw(C,s,X.brow);
  if(C.glasses){
    for(const s of [-1,1]){const ex=100+s*C.esep,ey=C.ey;bp();g.roundRect(ex-11,ey-8.5,22,17.5,5);strokeC('#2e3444',1.25);
      bp();g.moveTo(ex+2,ey-6);g.lineTo(ex+7,ey-1);g.moveTo(ex+4.5,ey-6.5);g.lineTo(ex+8.5,ey-2.5);strokeC('#eaf2ff',0.9);}
    bp();g.moveTo(100-C.esep+11,C.ey-3.5);g.quadraticCurveTo(100,C.ey-6.5,100+C.esep-11,C.ey-3.5);strokeC('#2e3444',1.1);
    bp();g.moveTo(100-C.esep-11,C.ey-4);g.lineTo(72,C.ey-2.5);g.moveTo(100+C.esep+11,C.ey-4);g.lineTo(128,C.ey-2.5);strokeC('#2e3444',1.1);
  }
  if(C.piercing){bp();g.arc(68.4,113.2,2.2,0,TAU);strokeC('#dfe4ee',1.1);bp();ell(69.5,108.3,1.1,1.1);fillC('#cfd6e6');}
  if(C.scrunchie){for(const s of [-1,1]){const x=100+s*41,y=68;
    groupL([{f:()=>ell(x,y,6.5,8,s*0.3),c:C.scrunchie}],'#6a4610',OW,()=>{bp();ell(x+s*2,y+2,4,6,s*0.3);fillC('#e8a830');bp();ell(x-s*2,y-3,2,2.4);fillC('#fff4c0');});}
    bp();g.moveTo(118,64);g.lineTo(127,58);strokeC('#3a1a22',3.4);bp();g.moveTo(118,64);g.lineTo(127,58);strokeC('#ff7aa2',1.8);
    bp();g.moveTo(121,67);g.lineTo(130,61);strokeC('#3a1a22',3.4);bp();g.moveTo(121,67);g.lineTo(130,61);strokeC('#ffd05a',1.8);
  }
  for(const m of (X.marks||[]))markDraw(C,m,X);
}

/* ---------- render + cache ---------- */
const PCACHE=new Map();
function renderHi(id,expr,blink){
  const C=CHARS[id];
  const hi=mk(200*SC,300*SC);
  if(!LAYER||LAYER.canvas.width!==hi.width||LAYER.canvas.height!==hi.height)LAYER=mk(hi.width,hi.height).getContext('2d');
  g=hi.getContext('2d');g.setTransform(SC,0,0,SC,0,0);PAL=new Set(['#000000']);
  drawChar(C,expr,blink);
  const pal=PAL;g=null;return {hi,pal};
}
function getPortrait(id,expr,blink){
  const k=id+'|'+expr+'|'+(blink?1:0);
  let c=PCACHE.get(k);
  if(!c){const r=renderHi(id,expr,blink);c=quantize(downsample(r.hi,SC),r.pal,118);PCACHE.set(k,c);}
  return c;
}
function getSil(id){
  const k=id+'|sil';let c=PCACHE.get(k);
  if(!c){const src=getPortrait(id,'normal',false);c=mk(src.width,src.height);const x=c.getContext('2d');x.drawImage(src,0,0);x.globalCompositeOperation='source-in';x.fillStyle='#231d3a';x.fillRect(0,0,c.width,c.height);
    x.globalCompositeOperation='source-atop';x.fillStyle='#3a3160';x.fillRect(0,0,c.width,150);PCACHE.set(k,c);}
  return c;
}
const openEyes=e=>e!=='laugh';
function isBlink(t,ph){const p=3.9,u=(t+ph*1.37)%p;return u<0.12||(Math.floor((t+ph*1.37)/p)%3===1&&u>0.28&&u<0.38);}
ART.portrait=function(ctx,id,expr,x,y,o){
  o=o||{};const C=CHARS[id];if(!C)return;
  const t=o.t||0;const ex=EXPR[expr]?expr:'normal';
  const bl=o.blink!==false&&!o.silhouette&&openEyes(ex)&&isBlink(t,C.phase);
  const img=o.silhouette?getSil(id):getPortrait(id,ex,bl);
  const bob=Math.sin(t*1.8+C.phase)>0.2?1:0;
  ctx.save();ctx.imageSmoothingEnabled=false;
  if(o.alpha!=null)ctx.globalAlpha*=o.alpha;
  const dx=Math.round(x),dy=Math.round(y)-300+bob;
  if(o.flip){ctx.translate(dx,0);ctx.scale(-1,1);ctx.drawImage(img,-100,dy);}
  else ctx.drawImage(img,dx-100,dy);
  ctx.restore();
};
const FCACHE=new Map();
ART.face=function(ctx,id,expr,x,y,size){
  size=size||32;const C=CHARS[id];if(!C)return;const ex=EXPR[expr]?expr:'normal';
  const k=id+'|'+ex+'|'+size;let c=FCACHE.get(k);
  if(!c){const r=renderHi(id,ex,false);c=mk(size,size);const cx=c.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';
    cx.drawImage(r.hi,46*SC,34*SC,108*SC,108*SC,0,0,size,size);quantize(c,r.pal,110);FCACHE.set(k,c);}
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(c,Math.round(x),Math.round(y));ctx.restore();
};

/* ================= backgrounds ================= */
let b=null, BP=null;
const bc=c=>{BP.add(c);return c;};
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const PATC=new Map();
function tpat(c1,c2,lv){ // c2 over c1 at level/16 ; c1 may be null (transparent)
  const k=c1+'|'+c2+'|'+lv;let p=PATC.get(k);
  if(!p){const cv=mk(4,4),x=cv.getContext('2d');for(let i=0;i<16;i++){const c=BAYER[i]<lv?c2:c1;if(c){x.fillStyle=c;x.fillRect(i%4,i>>2,1,1);}}p=cv;PATC.set(k,p);}
  if(c1)bc(c1);bc(c2);return b.createPattern(p,'repeat');
}
function R(c,x,y,w,h){b.fillStyle=bc(c);b.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function PG(c,p){b.fillStyle=typeof c==='string'?bc(c):c;b.beginPath();b.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)b.lineTo(p[i],p[i+1]);b.closePath();b.fill();}
function CI(c,x,y,r){b.fillStyle=typeof c==='string'?bc(c):c;b.beginPath();b.arc(x,y,r,0,TAU);b.fill();}
function EL(c,x,y,rx,ry){b.fillStyle=typeof c==='string'?bc(c):c;b.beginPath();b.ellipse(x,y,rx,ry,0,0,TAU);b.fill();}
function LN(c,x1,y1,x2,y2,w){b.strokeStyle=bc(c);b.lineWidth=w||1;b.beginPath();b.moveTo(x1,y1);b.lineTo(x2,y2);b.stroke();}
function DG(x,y,w,h,st){ // vertical dithered gradient
  const n=st.length-1,bands=n*16;
  for(let i=0;i<bands;i++){const s=Math.floor(i/16),lv=i%16;const y0=Math.round(y+h*i/bands),y1=Math.round(y+h*(i+1)/bands);
    b.fillStyle=lv?tpat(st[s],st[s+1],lv):bc(st[s]);b.fillRect(x,y0,w,y1-y0);}
}
function DF(c,lv,p){PG(tpat(null,c,lv),p);}      // dithered poly overlay
function DR(c,lv,x,y,w,h){b.fillStyle=tpat(null,c,lv);b.fillRect(x,y,w,h);}
function glow(x,y,r,c,maxLv){for(let i=4;i>=1;i--){b.fillStyle=tpat(null,c,Math.round(maxLv*(5-i)/4));b.beginPath();b.arc(x,y,r*i/4,0,TAU);b.fill();}}
function frame(c,x,y,w,h,t){R(c,x,y,w,t);R(c,x,y+h-t,w,t);R(c,x,y,t,h);R(c,x+w-t,y,t,h);}
function hole(x,y,w,h){b.clearRect(x,y,w,h);}
function blob(x,y,r,tones,seed,n){ // foliage cluster
  const rr=rng(seed);n=n||9;const pts=[];for(let i=0;i<n;i++){const a=rr()*TAU,d=rr()*r*0.7;pts.push([x+Math.cos(a)*d,y+Math.sin(a)*d*0.8,r*(0.35+rr()*0.3)]);}
  for(const p of pts)CI(tones[0],p[0]+2,p[1]+3,p[2]);
  for(const p of pts)CI(tones[1],p[0],p[1],p[2]*0.92);
  for(const p of pts)CI(tones[2],p[0]-p[2]*0.3,p[1]-p[2]*0.35,p[2]*0.5);
  if(tones[3])for(const p of pts)CI(tones[3],p[0]-p[2]*0.45,p[1]-p[2]*0.5,p[2]*0.2);
}
function stars(n,seed,ymax,cols){const r=rng(seed);for(let i=0;i<n;i++){const x=r()*640,y=r()*ymax;R(cols[i%cols.length],x,y,1,1);if(r()<0.08){R(cols[0],x-1,y,3,1);R(cols[0],x,y-1,1,3);}}}
function ridge(c,y,amp,seed,step){const r=rng(seed);const p=[0,360,0,y];let h=y;for(let x=0;x<=640;x+=step){h=y-amp*(0.5+0.5*Math.sin(x*0.013+seed))-r()*amp*0.3;p.push(x,h);}p.push(640,360);PG(c,p);}
function city(y,cols,seed,win){const r=rng(seed);let x=-5;while(x<640){const w=14+r()*30,h=12+r()*50;R(cols[0],x,y-h,w,h+80);R(cols[1],x+w-3,y-h,3,h+80);
  if(win)for(let yy=y-h+4;yy<y;yy+=5)for(let xx=x+3;xx<x+w-4;xx+=4)if(r()<0.4)R(win,xx,yy,2,2);x+=w+r()*3;}}
function building(x,y,w,h,P){ // school facade
  R(P.wall,x,y,w,h);R(P.wallS,x,y+h-6,w,6);R(P.roof,x-3,y-5,w+6,6);
  for(let fy=y+10;fy<y+h-14;fy+=Math.max(18,h/4))for(let fx=x+8;fx<x+w-16;fx+=22){R(P.frame,fx-1,fy-1,18,12);R(P.glass,fx,fy,16,10);R(P.glassL,fx,fy,6,3);R(P.wallS,fx-1,fy+11,18,1);}
}
function fenceChain(x,y,w,h,c){b.save();b.beginPath();b.rect(x,y,w,h);b.clip();for(let k=-h;k<w;k+=9){LN(c,x+k,y,x+k+h,y+h,1);LN(c,x+k+h,y,x+k,y+h,1);}b.restore();}
function petal(ctx,x,y,a){ctx.fillStyle='#ffc6d8';ctx.fillRect(x,y,2,1);ctx.fillStyle=a?'#ff9ec0':'#fff0f4';ctx.fillRect(x+(a?1:0),y+1,2,1);}

/* tiny 3x5 pixel font for signage */
const PF={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010','!':'010010010000010','%':'101001010100101','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110','♥':'000101111111010','-':'000000111000000',' ':'000000000000000'};
function PXT(str,x,y,c,s){s=s||1;let xx=x;for(const ch of str){const gl=PF[ch]||PF[' '];for(let i=0;i<15;i++)if(gl[i]==='1')R(c,xx+(i%3)*s,y+Math.floor(i/3)*s,s,s);xx+=4*s;}}
function pxw(str,s){return str.length*4*(s||1)-(s||1);}
function person(x,y,s,hair,body,o){o=o||{};// simple back/front view figure, feet at y
  const hs=7*s;R(body,x-7*s,y-28*s,14*s,20*s);R(o.leg||'#3a3440',x-5*s,y-9*s,4*s,9*s);R(o.leg||'#3a3440',x+1*s,y-9*s,4*s,9*s);
  CI(o.skin||'#f4d4bc',x,y-33*s,hs*0.9);CI(hair,x,y-35*s,hs);if(o.back){CI(hair,x,y-33*s,hs*0.95);}else R(o.skin||'#f4d4bc',x-5*s,y-33*s,10*s,5*s);
  if(o.tail)EL(hair,x+6*s,y-30*s,3*s,6*s);if(o.bag)R(o.bag,x+6*s,y-20*s,6*s,8*s);}
/* cloud sprites */
const CLOUDS=[];
function cloudSprite(w,h,cols,seed){
  const cv=mk(w,h),x=cv.getContext('2d');const ob=b,oP=BP;b=x;BP=new Set(['#000000']);const r=rng(seed);
  const pts=[];for(let i=0;i<9;i++){const px=w*0.15+r()*w*0.7,py=h*0.55+r()*h*0.15-Math.sin(((px/w)*Math.PI))*h*0.25;pts.push([px,py,h*(0.2+r()*0.18)]);}
  for(const p of pts)CI(cols[2],p[0]+1,p[1]+2,p[2]);
  for(const p of pts)CI(cols[1],p[0],p[1]-1,p[2]*0.9);
  for(const p of pts)CI(cols[0],p[0]-p[2]*0.25,p[1]-p[2]*0.4,p[2]*0.55);
  quantize(cv,BP,100);b=ob;BP=oP;return cv;
}
function getClouds(key,cols){if(!CLOUDS[key])CLOUDS[key]=[0,1,2,3].map(i=>cloudSprite(90+i*25,34+i*6,cols,i*31+key.length));return CLOUDS[key];}
function drawClouds(ctx,t,key,cols,ymax,speed){const cs=getClouds(key,cols);for(let i=0;i<5;i++){const s=cs[i%4];const x=Math.round(((i*173+t*speed*(1+i*0.15))%(640+s.width))-s.width);const y=Math.round(8+((i*47)%Math.max(10,ymax-s.height)));ctx.drawImage(s,x,y);}}
const CL_DAY=['#ffffff','#e2ecf8','#b8cce4'], CL_EVE=['#ffe2b8','#f4a88a','#b0688a'], CL_SUM=['#ffffff','#eef4ff','#bcd0ec'];

/* shared furniture */
function desk(x,y,s,P){ // school desk seen from front-high
  const w=64*s,d=14*s;
  R(P.metal,x+4*s,y+d,3*s,40*s);R(P.metal,x+w-7*s,y+d,3*s,40*s);
  R(P.metalD,x+6*s,y+d+2,w-12*s,10*s);R(P.metal,x+6*s,y+d+2,w-12*s,2);
  PG(P.woodL,[x+6*s,y,x+w-6*s,y,x+w,y+d,x,y+d]);R(P.wood,x,y+d,w,3*s);R(P.woodD,x,y+d+3*s,w,1);
  LN(P.woodD,x+10*s,y+d*0.5,x+w-12*s,y+d*0.5,1);
}
function chairBack(x,y,s,P){R(P.metal,x,y,3*s,28*s);R(P.metal,x+40*s,y,3*s,28*s);R(P.wood,x-2*s,y,47*s,14*s);R(P.woodL,x-2*s,y,47*s,3*s);R(P.woodD,x-2*s,y+13*s,47*s,1*s);}
function woodFloor(y0,h,cols,vx){R(cols[0],0,y0,640,h);for(let i=-20;i<=20;i++){LN(cols[1],vx+i*8,y0,vx+i*60,y0+h,1);}for(let yy=y0+4,k=0;yy<y0+h;k++,yy+=4+k*2.2)LN(cols[2],0,yy,640,yy,1);}
function curtain(x,y,w,h,c,cs,cl){R(c,x,y,w,h);for(let k=0;k<w;k+=8){R(cs,x+k+5,y,3,h);R(cl,x+k+1,y,1,h);}R(cs,x,y+h-3,w,3);}
function books(x,y,w,h,seed,cols){const r=rng(seed);let xx=x;while(xx<x+w-3){const bw=3+Math.floor(r()*4),bh=h-Math.floor(r()*h*0.3);const c=cols[Math.floor(r()*cols.length)];if(xx+bw>x+w)break;R(c,xx,y+h-bh,bw,bh);R('#1a1420',xx+bw-1,y+h-bh,1,bh);if(bw>3)R('#f0e6c8',xx+1,y+h-bh+3,bw-2,1);xx+=bw;}}
function shelf(x,y,w,rows,rh,seed,P){R(P.woodD,x-4,y-4,w+8,rows*rh+8);for(let i=0;i<rows;i++){R(P.back,x,y+i*rh,w,rh-3);books(x+1,y+i*rh+2,w-2,rh-5,seed+i,P.books);R(P.wood,x-4,y+i*rh+rh-3,w+8,3);}}
function lamp(x,y,c,cl){R('#3a3040',x-1,0,2,y);PG(c,[x-12,y+8,x-6,y,x+6,y,x+12,y+8]);R(cl,x-8,y+8,16,2);}

/* scene painters: sky (opaque) / fg (with holes) / mid(ctx,t) / top(ctx,t) */
const SCENES={};
const SK_DAY=['#4d8fe0','#7ab4ee','#b4d8f6','#e2f0fa'], SK_EVE=['#3c3470','#8e4a88','#e27a6a','#ffb86a','#ffe0a0'], SK_NIGHT=['#070a22','#101840','#1c2a5c','#2c3c74'];
const SK_SUM=['#2a78e0','#4aa0f0','#8cc8f8','#d4ecfc'];

function skyScene(st,far){return ()=>{DG(0,0,640,360,st);if(far)far();};}
// ---- classroom
function classroomFG(eve){return ()=>{
  const P=eve?{wall:'#d8a878',wallS:'#b07a58',ceil:'#b88868',board:'#26443a',boardF:'#6a4028',frame:'#c89878',frameD:'#8a5a44',floor:['#b86a3a','#8a4a2a','#a45a32'],wood:'#c07a44',woodL:'#e2a060',woodD:'#7a4428',metal:'#8a6a6a',metalD:'#5a4048',cur:'#f0b87a',curS:'#c88a5a',curL:'#ffd8a0'}
    :{wall:'#ece4d0',wallS:'#cfc4a8',ceil:'#dcd4c0',board:'#2e5a48',boardF:'#8a6038',frame:'#c4c8d0',frameD:'#8a8e9a',floor:['#c8965e','#a8784a','#b88650'],wood:'#d8a868',woodL:'#f0cc8e',woodD:'#94683e',metal:'#8c929e',metalD:'#5e6470',cur:'#f4ecd6',curS:'#d6ccb0',curL:'#ffffff'};
  R(P.wall,0,0,640,360);R(P.ceil,0,0,640,22);R(P.wallS,0,22,640,2);
  for(const x of [60,300,540]){R('#ffffff',x,8,70,5);R(P.wallS,x,13,70,2);}
  // blackboard
  R(P.boardF,6,62,160,124);R(P.board,12,68,148,110);DR('#ffffff',1,12,68,148,110);
  const r=rng(7);for(let i=0;i<7;i++){const y=80+i*13,l=40+r()*80;for(let x=20;x<20+l;x+=3+Math.floor(r()*3))R(eve?'#c8d4b8':'#dfe8dc',x,y+Math.floor(r()*2),2,r()<0.5?2:1);}
  R(P.boardF,6,182,160,6);R('#ffffff',30,180,8,2);R('#ff8888',44,180,6,2);R('#ffe066',54,180,6,2);
  CI(P.frameD,86,40,13);CI('#ffffff',86,40,11);LN('#222',86,40,86,32,1.5);LN('#222',86,40,92,42,1.5);
  // windows
  R(P.frame,176,34,464,206);hole(182,40,452,194);
  for(let x=176;x<640;x+=116){R(P.frame,x,34,6,206);R(P.frameD,x+5,34,1,206);R(P.frame,x+56,40,4,194);}
  R(P.frame,176,132,464,5);R(P.frameD,176,136,464,1);
  DF('#ffffff',2,[182,40,300,40,182,150]);DF('#ffffff',2,[420,40,470,40,300,234,250,234]);
  curtain(160,28,30,214,P.cur,P.curS,P.curL);curtain(612,28,28,214,P.cur,P.curS,P.curL);R(P.curS,150,24,490,6);
  R(P.wallS,160,240,480,26);R(P.wall,160,240,480,3);
  woodFloor(266,94,P.floor,320);
  if(eve){DF('#ffcc70',5,[200,266,330,266,420,360,240,360]);DF('#ffcc70',5,[380,266,500,266,640,340,640,360,560,360]);DF('#ffd890',3,[182,40,300,40,120,360,0,360,0,300]);}
  chairBack(80,262,1.2,P);chairBack(400,262,1.2,P);
  desk(20,300,2.2,P);desk(360,300,2.2,P);
  R('#5a8ae0',60,296,30,6);R('#f0f0f0',62,294,26,3);
};}
SCENES.classroom={sky:skyScene(SK_DAY,()=>{ridge('#9cc0de',210,30,3,20);blob(250,230,50,['#3e7a44','#56a050','#7cc466','#a8e088'],3,12);blob(520,220,60,['#3e7a44','#56a050','#7cc466','#a8e088'],5,12);R('#56a050',180,230,460,20);}),
  fg:classroomFG(false),mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,120,6)};
SCENES.classroom_eve={sky:skyScene(SK_EVE,()=>{CI('#fff2c0',470,190,22);glow(470,190,70,'#fff0b0',6);ridge('#6a3a5a',210,30,3,20);blob(250,230,50,['#2a1a30','#3a2238','#4a2c40'],3,12);blob(520,220,60,['#2a1a30','#3a2238','#4a2c40'],5,12);R('#3a2238',180,230,460,20);}),
  fg:classroomFG(true),mid:(c,t)=>drawClouds(c,t,'eve',CL_EVE,110,4),
  top:(c,t)=>{for(let i=0;i<14;i++){const x=(200+i*37+Math.sin(t*0.5+i)*20)%640,y=(80+i*23+t*6)%260+40;c.fillStyle=i%2?'#ffe8a8':'#fff8d8';c.fillRect(x|0,y|0,1,1);}}};

// ---- hallway (one-point perspective)
SCENES.hallway={sky:skyScene(SK_DAY,()=>{blob(80,200,70,['#3e7a44','#56a050','#7cc466','#a8e088'],11,14);blob(200,190,60,['#3e7a44','#56a050','#7cc466'],12,10);}),
 fg:()=>{const vx=330,vy=170,pr=(x,y,k)=>[vx+(x-vx)*k,vy+(y-vy)*k];
  R('#e8e2d2',0,0,640,360);
  // ceiling
  PG('#d8d2c2',[0,0,640,0,...pr(640,0,0.22),...pr(0,0,0.22)]);
  // floor
  PG('#b4b0a4',[0,360,640,360,...pr(640,360,0.22),...pr(0,360,0.22)]);
  const zs=[1,0.72,0.54,0.42,0.33,0.27,0.22];
  for(let i=0;i<zs.length-1;i++){const a=zs[i],c=zs[i+1];
    // left windows
    const p1=pr(0,40,a),p2=pr(0,40,c),p3=pr(0,250,c),p4=pr(0,250,a);
    b.save();b.globalCompositeOperation='destination-out';PG('#000',[p1[0]+4*a,p1[1]+4*a,p2[0]-3*c,p2[1]+4*c,p3[0]-3*c,p3[1],p4[0]+4*a,p4[1]]);b.restore();
    const m1=pr(0,145,a),m2=pr(0,145,c);LN('#c4c8d0',m1[0],m1[1],m2[0],m2[1],Math.max(1,4*a));
    const q1=pr(0,40,a),q4=pr(0,250,a);LN('#b0b4be',q1[0],q1[1],q4[0],q4[1],Math.max(2,10*a));
    // right doors
    const d1=pr(640,90,a),d2=pr(640,90,c),d3=pr(640,330,c),d4=pr(640,330,a);
    PG(i%2?'#a8784a':'#b8885a',[d1[0]-6*a,d1[1],d2[0]+2,d2[1],d3[0]+2,d3[1],d4[0]-6*a,d4[1]]);
    const w1=pr(640,110,a),w2=pr(640,110,(a*2+c)/3),w3=pr(640,170,(a*2+c)/3),w4=pr(640,170,a);
    PG('#cfe4f4',[w1[0]-10*a,w1[1],w2[0],w2[1],w3[0],w3[1],w4[0]-10*a,w4[1]]);
    const s1=pr(640,60,a);R('#f4f4f4',s1[0]-40*a,s1[1],30*a,12*a);R('#3a5aa0',s1[0]-36*a,s1[1]+3*a,20*a,5*a);
    // floor reflections / lines
    const f1=pr(0,360,a),f2=pr(640,360,a);LN('#a09c90',f1[0],f1[1],f2[0],f2[1],1);
    DF('#ffffff',3,[...pr(40,360,a),...pr(40,360,c),...pr(200,360,c),...pr(200,360,a)]);
    // ceiling lights
    const l1=pr(260,0,(a+c)/2),l2=pr(400,0,(a+c)/2);R('#ffffff',l1[0],l1[1]+2,l2[0]-l1[0],Math.max(2,8*a));
  }
  const e1=pr(0,0,0.22),e2=pr(640,360,0.22);R('#d4ceba',e1[0],e1[1],e2[0]-e1[0],e2[1]-e1[1]);
  hole(e1[0]+24,e1[1]+14,e2[0]-e1[0]-48,40);R('#c4c8d0',e1[0]+22,e1[1]+12,e2[0]-e1[0]-44,2);
  R('#8a7a6a',0,300,6,60);LN('#9a968a',0,250,257,154,2);
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,110,5)};

// ---- rooftop
SCENES.rooftop={sky:skyScene(SK_SUM,()=>{ridge('#a8c4e0',250,40,9,16);city(262,['#8aa4c4','#7890b4'],4,'#c8dcf0');}),
 fg:()=>{R('#a8a4a0',0,282,640,78);for(let y=286;y<360;y+=12)LN('#8e8a86',0,y,640,y,1);for(let x=0;x<640;x+=40)LN('#8e8a86',x,282,x-40,360,1);
  DR('#6a6660',2,0,282,640,12);
  fenceChain(0,130,640,152,'#6c747e');R('#5a626c',0,126,640,6);R('#8a929c',0,126,640,2);
  for(let x=10;x<640;x+=90){R('#4a525c',x,122,6,162);R('#8a929c',x,122,2,162);}
  // stair housing left
  R('#d8d2c4',0,70,120,214);R('#b8b0a0',100,70,20,214);R('#c4bcaa',0,62,124,10);R('#6a7688',30,170,50,114);R('#8a96a8',34,174,42,108);CI('#e0c060',70,230,3);
  // water tank right
  R('#6e7a86',520,40,8,110);R('#6e7a86',610,40,8,110);EL('#c8ccd0',570,40,70,20);R('#c8ccd0',500,40,140,60);EL('#a8acb4',570,100,70,20);R('#dde0e4',510,44,20,54);
  DR('#ffffff',3,0,282,640,78);
 },mid:(c,t)=>drawClouds(c,t,'sum',CL_SUM,150,8)};

// ---- schoolgate sakura
function sakuraTree(x,y,s,seed){R('#5a3a34',x-6*s,y,12*s,200);R('#7a5448',x-6*s,y,4*s,200);LN('#5a3a34',x,y+20,x-40*s,y-20*s,5*s);LN('#5a3a34',x,y+30,x+44*s,y-10*s,5*s);
  const T=['#e88aa8','#f6aec4','#ffd0de','#fff0f4'];blob(x,y-30*s,70*s,T,seed,14);blob(x-50*s,y-5*s,45*s,T,seed+1,9);blob(x+50*s,y,45*s,T,seed+2,9);}
SCENES.schoolgate_sakura={sky:skyScene(['#6aa8ea','#9ccaf2','#d2e8f8','#f4f0f4'],()=>{
   const P={wall:'#f2ecdc',wallS:'#cfc6b0',roof:'#8a8a94',frame:'#a8acb4',glass:'#7aa4cc',glassL:'#c8e0f4'};
   building(150,120,340,120,P);R('#f2ecdc',290,84,60,40);R('#8a8a94',286,80,68,6);CI('#ffffff',320,104,12);CI('#2a2a34',320,104,1.5);LN('#2a2a34',320,104,320,96,1.5);LN('#2a2a34',320,104,326,104,1.5);
 }),
 fg:()=>{b.clearRect(0,0,640,360);
  R('#b8ac98',0,240,640,120);PG('#d4c8b0',[250,240,390,240,520,360,120,360]);for(let y=250;y<360;y+=10){const k=(y-240)/120;LN('#bcb09a',320-70-130*k,y,320+70+130*k,y,1);}
  R('#a8a090',0,236,640,6);R('#c8c0b0',0,226,200,14);R('#c8c0b0',440,226,200,14);
  // pillars
  for(const x of [196,414]){R('#9a948a',x,150,30,110);R('#c0bab0',x,150,10,110);R('#7a746a',x+26,150,4,110);R('#8a847a',x-4,144,38,8);}
  R('#e8e4d8',226+2,186,8,40);R('#2a2a2a',229,190,2,30);
  R('#f4f0e4',418,176,22,52);for(let i=0;i<5;i++)R('#2a2a34',424,182+i*9,10,5);
  sakuraTree(70,150,1.2,21);sakuraTree(580,140,1.3,23);
  const r=rng(9);for(let i=0;i<260;i++){const x=r()*640,y=250+r()*110;R(r()<0.5?'#ffc4d6':'#ffe4ec',x,y,2,1);}
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,70,5),
 top:(c,t)=>{for(let i=0;i<46;i++){const sp=18+(i%5)*6;const y=((i*53+t*sp)%400)-20,x=((i*137+t*14+Math.sin(t*1.3+i)*24)%680)-20;petal(c,x|0,y|0,(Math.floor(t*4+i)%2));}}};

// ---- gym
SCENES.gym={sky:skyScene(SK_DAY),fg:()=>{
  R('#e0dccc',0,0,640,360);R('#8a8272',0,0,640,30);for(let x=0;x<640;x+=40){LN('#6a6254',x,0,x+40,30,2);LN('#6a6254',x+40,0,x,30,2);}
  for(let x=20;x<640;x+=80){R('#9aa0aa',x,40,60,40);hole(x+3,43,54,34);R('#9aa0aa',x+29,43,2,34);}
  R('#c89868',0,120,640,110);for(let x=0;x<640;x+=14)R('#b08050',x,120,1,110);R('#8a6a40',0,228,640,3);
  // stage
  R('#6a3a28',170,110,300,110);R('#a8203a',170,96,300,20);for(let x=170;x<470;x+=10)R('#801828',x,96,4,20);
  R('#b8243e',170,110,40,100);R('#b8243e',430,110,40,100);for(let x=170;x<210;x+=8)R('#8a1a2e',x+5,110,3,100);for(let x=430;x<470;x+=8)R('#8a1a2e',x+5,110,3,100);
  R('#3a2a2a',210,116,220,94);R('#d8b890',160,210,320,14);R('#a88860',160,222,320,4);
  // hoop
  R('#f4f4f4',560,110,56,40);frame('#d02a2a',572,124,30,20,2);R('#f06020',574,150,26,3);for(let k=0;k<5;k++)LN('#ffffff',576+k*6,153,578+k*5,172,1);R('#6a6a72',586,60,4,50);
  // floor
  const vy=180;PG('#d8a868',[0,231,640,231,640,360,0,360]);for(let i=-12;i<=12;i++)LN('#c49458',320+i*20,231,320+i*120,360,1);
  LN('#ffffff',0,300,640,300,2);EL(tpat(null,'#ffffff',16),320,290,120,20);EL('#d8a868',320,290,118,18);LN('#ffffff',320,231,320,360,2);LN('#e8c020',40,250,600,250,2);
  DF('#ffffff',3,[40,231,120,231,90,360,0,360]);DF('#ffffff',3,[520,231,600,231,640,300,640,360,560,360]);
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,60,6)};

// ---- ground
SCENES.ground={sky:skyScene(SK_SUM,()=>{ridge('#8cb0d4',200,40,5,18);ridge('#6a9a6e',215,16,8,10);}),fg:()=>{b.clearRect(0,0,640,360);
  const P={wall:'#f2ecdc',wallS:'#cfc6b0',roof:'#8a8a94',frame:'#a8acb4',glass:'#7aa4cc',glassL:'#c8e0f4'};building(20,120,240,100,P);
  blob(330,200,40,['#2e6a3a','#46904a','#6ab85a','#98d878'],41,10);blob(420,196,46,['#2e6a3a','#46904a','#6ab85a','#98d878'],42,10);blob(600,190,50,['#2e6a3a','#46904a','#6ab85a','#98d878'],43,10);
  fenceChain(0,170,640,52,'#8a9a9a');R('#6a7a7a',0,168,640,3);
  R('#caa478',0,222,640,138);DR('#b08a60',3,0,222,640,138);
  b.strokeStyle=bc('#ffffff');b.lineWidth=2;for(let k=0;k<3;k++){b.beginPath();b.ellipse(320,330,300+k*18,70+k*10,0,Math.PI,TAU);b.stroke();}
  // goal
  R('#ffffff',470,210,4,70);R('#ffffff',600,210,4,70);R('#ffffff',470,208,134,4);b.save();b.beginPath();b.rect(474,212,126,68);b.clip();for(let x=470;x<610;x+=6)LN('#dde4ee',x,212,x+10,280,1);for(let y=212;y<282;y+=6)LN('#dde4ee',470,y,610,y,1);b.restore();
  R('#e8e8e8',140,300,10,6);CI('#ffffff',200,320,5);CI('#2a2a2a',200,320,2);
 },mid:(c,t)=>drawClouds(c,t,'sum',CL_SUM,110,7)};

// ---- library
const LIBP={woodD:'#4a2e20',wood:'#8a5a38',back:'#2e1e18',books:['#8a2a2a','#2a4a7a','#3a6a3a','#c89a3a','#6a3a6a','#c8c0a8','#2a2a3a','#a85a2a']};
SCENES.library={sky:skyScene(['#8ab8e0','#b8d8f0','#e8f4f8'],()=>blob(320,200,90,['#3e7a44','#56a050','#7cc466','#a8e088'],61,14)),
 fg:()=>{R('#d8c8a8',0,0,640,360);R('#a88a60',0,0,640,16);
  shelf(10,30,200,6,40,5,LIBP);shelf(430,30,200,6,40,9,LIBP);
  R('#6a4a30',236,26,168,214);hole(244,34,152,198);R('#6a4a30',318,34,4,198);R('#6a4a30',244,130,152,4);
  DF('#fff8d8',3,[244,34,300,34,470,360,300,360]);DF('#fff8d8',2,[300,34,396,34,560,360,470,360]);
  R('#9a6a42',0,280,640,80);for(let y=284;y<360;y+=8)LN('#7a5232',0,y,640,y,1);
  // table
  R('#6a3e22',60,290,520,18);R('#8a5634',60,286,520,6);R('#4a2a18',80,308,14,52);R('#4a2a18',546,308,14,52);
  R('#2a4a7a',120,276,40,10);R('#c8c0a8',124,272,36,5);R('#8a2a2a',126,266,30,6);
  R('#3a6a3a',440,274,6,14);EL('#3a8a4a',443,270,12,8);R('#d0b070',470,280,40,6);R('#ffffff',472,276,36,5);
 },top:(c,t)=>{for(let i=0;i<20;i++){const x=(260+i*17+t*5+Math.sin(t+i)*8)%400+220,y=(60+i*29+t*4)%280+40;c.fillStyle='#fff8d8';if((i+Math.floor(t*2))%3)c.fillRect(x|0,y|0,1,1);}}};

// ---- music room
SCENES.music_room={sky:skyScene(SK_DAY,()=>blob(560,220,70,['#3e7a44','#56a050','#7cc466','#a8e088'],71,12)),
 fg:()=>{R('#ece6d8',0,0,640,360);for(let y=20;y<250;y+=6)for(let x=(y%12?3:0);x<480;x+=6)R('#d4ccba',x,y,2,2);
  R('#2e4a3e',40,50,260,110);frame('#8a6038',36,46,268,118,5);for(let s=0;s<2;s++)for(let l=0;l<5;l++)R('#dde8dc',50,70+s*44+l*6,240,1);
  const r=rng(3);for(let i=0;i<14;i++)EL('#ffffff',60+i*16,72+s0(i)*3+Math.floor(r()*20),2.5,2);
  function s0(i){return i%5;}
  for(let i=0;i<4;i++){frame('#8a6a3a',44+i*66,6,40,34,3);R('#6a5a4a',47+i*66,9,34,28);EL('#e8d4b8',64+i*66,20,7,8);R('#2a2a34',54+i*66,28,20,9);}
  R('#b0b4bc',480,20,160,230);hole(488,28,144,214);R('#b0b4bc',558,28,4,214);curtain(470,14,24,240,'#b83a4a','#8a2436','#d85a6a');curtain(622,14,18,240,'#b83a4a','#8a2436','#d85a6a');
  R('#9a7048',0,250,640,110);for(let y=254;y<360;y+=7)LN('#7a5436',0,y,640,y,1);
  // grand piano
  PG('#16141c',[300,190,470,170,520,196,500,236,320,244]);PG('#2c2836',[300,190,470,170,480,176,312,196]);R('#16141c',310,240,6,70);R('#16141c',480,232,6,70);
  R('#f4f4f4',300,242,200,10);for(let x=302;x<498;x+=6)R('#bcbcc4',x,242,1,10);for(let x=305;x<496;x+=12){R('#16141c',x,242,3,6);R('#16141c',x+6,242,3,6);}
  LN('#6a6680',330,196,470,178,1);DR('#ffffff',2,300,190,200,10);
  // drums & amp
  EL('#c8c8d0',110,296,40,14);R('#a82a3a',70,296,80,34);EL('#e8e8f0',110,296,38,12);R('#8a8a94',68,300,4,26);EL('#c8b040',60,262,20,4);LN('#8a8a94',60,262,60,320,2);
  R('#1e1c22',180,270,60,60);R('#3a3844',184,274,52,40);for(let y=276;y<312;y+=3)R('#2a2830',186,y,48,1);R('#c8a860',186,318,48,6);
  R('#2a2830',560,270,4,60);PG('#2a2830',[540,262,584,262,580,270,544,270]);
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,100,5),
 top:(c,t)=>{for(let i=0;i<3;i++){const p=(t*0.4+i/3)%1;const x=380+i*30+Math.sin(p*6)*8,y=160-p*90;if(p<0.9){c.fillStyle='#6a5a8a';c.fillRect(x|0,y|0,3,3);c.fillRect((x+2)|0,(y-7)|0,1,8);c.fillRect((x+3)|0,(y-7)|0,2,1);}}}};

// ---- art room
SCENES.art_room={sky:skyScene(SK_DAY,()=>blob(160,220,80,['#3e7a44','#56a050','#7cc466','#a8e088'],81,12)),
 fg:()=>{R('#e8e2d4',0,0,640,360);R('#b8b4ac',20,20,300,180);hole(28,28,284,164);R('#b8b4ac',168,28,4,164);R('#b8b4ac',28,108,284,4);
  DF('#fff8e0',3,[28,28,120,28,300,300,160,300]);
  shelf(360,40,260,3,40,17,{woodD:'#6a4a30',wood:'#a87a50',back:'#d8ccb4',books:['#e84a4a','#4a8ae8','#f0c040','#58b858','#a060c8','#ffffff']});
  R('#c4bcaa',360,164,260,40);for(let i=0;i<8;i++){R(['#e84a4a','#4a8ae8','#f0c040','#58b858'][i%4],370+i*30,172,14,20);R('#f4f0e4',370+i*30,168,14,5);}
  R('#a07a52',0,240,640,120);for(let y=244;y<360;y+=7)LN('#86623e',0,y,640,y,1);
  // easels
  for(const [x,y,s] of [[120,150,1],[430,160,1.1]]){LN('#7a5234',x,y,x-30*s,y+170*s,4);LN('#7a5234',x,y,x+30*s,y+170*s,4);LN('#7a5234',x,y,x,y+160*s,3);R('#7a5234',x-40*s,y+84*s,80*s,5);}
  R('#f4f0e8',70,160,100,76);R('#8ac0e8',74,164,92,30);R('#5aa05a',74,194,92,38);CI('#ffe070',140,176,8);blob(100,200,16,['#2e6a3a','#46904a','#6ab85a'],5,6);
  R('#f4f0e8',376,168,110,84);R('#3a3a6a',380,172,102,76);CI('#f0a040',430,210,24);CI('#e85a6a',410,200,12);R('#f4f0e8',376,168,110,4);
  // bust
  R('#c8c0b0',250,230,60,70);R('#e4dccc',250,230,20,70);EL('#f4f0ea',280,190,20,26);EL('#d8d0c4',288,194,12,20);R('#f4f0ea',270,210,20,22);
  // table
  R('#8a6a50',0,316,640,44);R('#a8886a',0,312,640,6);for(let i=0;i<30;i++)CI(['#e84a4a','#4a8ae8','#f0c040','#58b858'][i%4],(i*97)%640,322+(i*13)%30,1.5+(i%3));
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,100,5)};

// ---- bedroom
function bedroomFG(night){return ()=>{
  const P=night?{wall:'#3a3e6e',wallS:'#2c2e58',stripe:'#40447a',floor:'#4a3a58',floorD:'#3a2c48',wood:'#6a4a5a',woodL:'#8a6a78',woodD:'#3e2a3c',bed:'#6a6aa8',bedL:'#8a8ac8',bedD:'#4a4a88',pil:'#b8b8e0',cur:'#5a4a8a',curS:'#44386e',curL:'#7a6aa8',rug:'#8a5a8a'}
   :{wall:'#fbeee6',wallS:'#ecd8cc',stripe:'#f8e4dc',floor:'#d8a878',floorD:'#b88a5c',wood:'#c89a70',woodL:'#e8c098',woodD:'#8a6040',bed:'#f4a8b8',bedL:'#ffd0da',bedD:'#d8808e',pil:'#ffffff',cur:'#b8e0d0',curS:'#90c4b0',curL:'#e0f4ec',rug:'#f0c8d8'};
  R(P.wall,0,0,640,360);for(let x=0;x<640;x+=24)R(P.stripe,x,0,8,260);R(P.wallS,0,256,640,6);
  if(night){for(const [r,k] of [[96,0.08],[68,0.14],[42,0.22]]){CI(mixHex(P.wall,'#ffb860',k),148,184,r);}for(let x=0;x<250;x+=24)R(mixHex(P.stripe,'#ffb860',0.06),x,90,8,170);R(P.wallS,0,256,640,6);}
  R(P.woodL,200,40,180,150);hole(210,50,160,130);R(P.woodL,288,50,4,130);R(P.woodL,210,112,160,4);R(P.woodD,196,188,188,6);
  curtain(172,30,36,170,P.cur,P.curS,P.curL);curtain(372,30,36,170,P.cur,P.curS,P.curL);R(P.woodD,168,26,244,6);
  R(P.floor,0,262,640,98);for(let y=268;y<360;y+=10)LN(P.floorD,0,y,640,y,1);
  if(night){EL(mixHex(P.floor,'#ffb860',0.12),120,296,130,32);EL(mixHex(P.floor,'#ffb860',0.22),110,290,76,18);}
  EL(P.rug,330,330,150,24);EL(night?mixHex(P.rug,'#ffffff',0.12):tpat(null,'#ffffff',3),330,330,140,20);
  // desk left
  R(P.wood,20,210,150,10);R(P.woodD,20,220,150,4);R(P.wood,26,224,10,100);R(P.wood,150,224,14,100);R(P.woodD,110,224,40,50);R(P.woodL,112,240,36,2);
  shelf(30,90,110,2,36,31,{woodD:P.woodD,wood:P.wood,back:P.wallS,books:['#e86a8a','#6a8ae8','#f0c060','#8ad0a0','#ffffff']});
  // lamp
  R('#e8e0d0',128,200,16,10);LN('#c8c0b0',136,200,146,168,2);PG(night?'#ffe8a0':'#f8f0e0',[132,168,156,160,164,176,140,182]);
  // laptop & items
  R('#c8ccd8',50,198,50,12);R('#8a90a0',54,178,42,24);R(night?'#8ab4ff':'#c8e0ff',57,181,36,18);
  // bed right
  R(P.woodD,420,190,210,20);R(P.wood,420,186,8,120);R(P.bedD,428,240,212,70);R(P.bed,428,236,212,56);for(let x=440;x<640;x+=26)R(P.bedL,x,240,10,52);
  EL(P.pil,470,232,36,14);EL(P.bedL,466,228,26,8);
  // plush
  CI('#f4e0c8',600,220,16);CI('#f4e0c8',590,200,6);CI('#f4e0c8',610,200,6);CI('#2a2030',594,218,1.5);CI('#2a2030',606,218,1.5);
  // phone
  R('#1a1a24',520,236,14,22);R(night?'#bfe0ff':'#6a7a9a',521,238,12,17);
  // poster & clock
  R('#ffffff',440,70,70,90);R(night?'#6a5a9a':'#ffb0c4',444,74,62,82);CI(night?'#8a7ac0':'#ffd0dc',475,110,18);R('#ffffff',450,140,50,4);
  CI(P.woodD,560,70,16);CI('#ffffff',560,70,13);LN('#2a2030',560,70,560,60,1.5);LN('#2a2030',560,70,567,74,1.5);
  if(!night){DF('#ffffff',3,[210,50,370,50,470,360,160,360]);}
};}
SCENES.bedroom={sky:skyScene(SK_NIGHT,()=>{stars(120,5,200,['#ffffff','#c8d4ff','#8a9ad8']);CI('#fff4d0',330,90,16);CI('#1c2a5c',336,86,14);city(200,['#141a38','#10152e'],7,'#ffd870');}),
  fg:bedroomFG(true),
  mid:(c,t)=>{for(let i=0;i<12;i++){if(Math.sin(t*2+i*1.7)>0.6){const x=215+(i*37)%150,y=55+(i*23)%70;c.fillStyle='#ffffff';c.fillRect(x,y-1,1,3);c.fillRect(x-1,y,3,1);}}},
  top:(c,t)=>{if(Math.floor(t*1.5)%2){c.fillStyle='#8affc8';c.fillRect(531,237,2,1);}}};
SCENES.bedroom_day={sky:skyScene(SK_DAY,()=>{blob(260,180,60,['#3e7a44','#56a050','#7cc466','#a8e088'],91,12);city(200,['#e8e0d8','#c8c0b8'],7,'#8ab0d8');}),
  fg:bedroomFG(false),mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,90,5)};

// ---- station
SCENES.station={sky:skyScene(['#6a9ae0','#9cc0ec','#f0d8c0','#ffc898'],()=>{ridge('#9ab0cc',200,20,13,20);city(220,['#8a98b4','#7a88a4'],13,'#f0e0b0');}),
 fg:()=>{b.clearRect(0,0,640,360);
  // far platform
  R('#8a8680',0,215,640,10);R('#6a665e',0,225,640,6);R('#4a4640',0,231,640,30);for(let x=0;x<640;x+=14)R('#6a5a4a',x,244,8,3);R('#b8b8c0',0,240,640,2);R('#b8b8c0',0,252,640,2);
  R('#5a564e',0,261,640,10);
  // near platform
  R('#c4beb2',0,271,640,89);R('#f0d040',0,276,640,6);for(let x=0;x<640;x+=6)R('#d8b020',x,277,3,4);R('#e8e4dc',0,271,640,3);DR('#ffffff',2,0,290,640,70);
  // roof
  R('#5a6068',0,0,640,34);R('#7a8088',0,34,640,6);for(let x=0;x<640;x+=40)R('#4a5058',x,0,4,34);for(const x of [80,280,480])R('#ffffff',x,40,80,3);
  for(const x of [60,380]){R('#8a929a',x,40,10,231);R('#aab2ba',x,40,3,231);}
  // sign
  R('#3a3a44',230,70,4,30);R('#3a3a44',406,70,4,30);R('#ffffff',210,96,220,40);R('#2a8a4a',210,128,220,8);for(let i=0;i<4;i++)R('#2a2a34',290+i*16,104,10,14);R('#6a6a74',220,110,40,4);R('#6a6a74',380,110,40,4);
  // vending machine
  R('#e03a3a',520,180,54,92);R('#f4f4f4',526,186,42,40);for(let i=0;i<8;i++)R(['#4a8ae8','#f0c040','#58b858','#e84a4a'][i%4],529+(i%4)*10,190+Math.floor(i/4)*18,6,12);R('#2a2a34',530,240,34,12);glow(547,210,60,'#fff4d0',3);
  // bench
  R('#8a5a34',120,236,120,8);R('#6a4a2a',120,250,120,6);R('#4a4a52',130,244,4,28);R('#4a4a52',226,244,4,28);
 },mid:(c,t)=>drawClouds(c,t,'eve',['#fff0e0','#f8d0c0','#c8a0a8'],120,5)};

// ---- amusement
const FW=[];
function ferrisFrame(i){ if(FW[i])return FW[i];const cv=mk(220,220),x=cv.getContext('2d');const ob=b,oP=BP;b=x;BP=new Set(['#000000']);
  const cx=110,cy=110,R0=98,a0=i/12*(Math.PI/4);b.strokeStyle=bc('#f4f4fa');b.lineWidth=3;b.beginPath();b.arc(cx,cy,R0,0,TAU);b.stroke();b.lineWidth=1.5;b.beginPath();b.arc(cx,cy,R0-12,0,TAU);b.stroke();
  for(let k=0;k<16;k++){const a=a0+k*TAU/16;LN('#dcdce8',cx,cy,cx+Math.cos(a)*R0,cy+Math.sin(a)*R0,1.2);}
  for(let k=0;k<8;k++){const a=a0+k*TAU/8,px=cx+Math.cos(a)*R0,py=cy+Math.sin(a)*R0;R(['#ff6a8a','#ffd04a','#6ac8ff','#8ae08a'][k%4],px-6,py+2,12,11);R('#ffffff',px-4,py+4,8,4);LN('#8a8a9a',px,py,px,py+3,1);}
  CI('#ff8aa8',cx,cy,8);CI('#ffffff',cx,cy,3);quantize(cv,BP,100);b=ob;BP=oP;FW[i]=cv;return cv;}
SCENES.amusement={sky:skyScene(['#4a8ae0','#7ab0f0','#b8d4f4','#ffe4d4'],()=>{ridge('#a8bcd8',250,20,19,20);}),
 fg:()=>{b.clearRect(0,0,640,360);
  // ferris support drawn in fg (wheel in mid)
  LN('#c8c8d4',470,130,420,260,5);LN('#c8c8d4',470,130,520,260,5);
  // coaster
  b.strokeStyle=bc('#e84a5a');b.lineWidth=4;b.beginPath();b.moveTo(0,150);b.bezierCurveTo(80,60,140,240,220,150);b.bezierCurveTo(260,110,300,200,340,200);b.stroke();
  for(let x=10;x<340;x+=22)LN('#b8b8c8',x,160+Math.sin(x*0.03)*30,x,260,2);
  // tents & stalls
  for(const [x,c] of [[40,'#ff6a8a'],[250,'#4ab0e8']]){PG(c,[x,230,x+60,190,x+120,230]);for(let k=0;k<6;k++)PG(k%2?'#ffffff':c,[x+k*20,230,x+60,190,x+k*20+20,230]);R('#fff4e0',x+6,230,108,40);R(c,x+6,230,108,6);R('#8a5a3a',x+20,250,80,20);}
  // carousel
  PG('#ffcc4a',[520,200,580,170,640,200]);R('#ffe8a8',530,200,110,50);for(let x=534;x<640;x+=14)R('#d89a3a',x,204,3,46);R('#e84a5a',520,196,120,8);
  // ground
  R('#e0cca8',0,262,640,98);DG(0,262,640,98,['#d8c4a0','#e8d8b8']);for(let y=270;y<360;y+=14)for(let x=((y/14)%2)*20;x<640;x+=40)R('#d0b890',x,y,20,1);
  blob(180,262,30,['#2e6a3a','#46904a','#6ab85a','#98d878'],101,8);blob(370,262,34,['#2e6a3a','#46904a','#6ab85a','#98d878'],102,8);
  // bunting
  for(let x=0;x<640;x+=14){const y=40+Math.sin(x/640*Math.PI)*30;PG(['#ff6a8a','#ffd04a','#6ac8ff','#8ae08a'][(x/14)%4],[x,y,x+12,y,x+6,y+10]);}
  LN('#8a8a9a',0,40,640,40,1);
  // balloons
  for(const [x,y,c] of [[600,110,'#ff6a8a'],[612,100,'#6ac8ff'],[590,96,'#ffd04a']]){LN('#ffffff',x,y+10,600,180,1);EL(c,x,y,8,10);R('#ffffff',x-4,y-5,2,3);}
 },mid:(c,t)=>{drawClouds(c,t,'day',CL_DAY,80,6);c.drawImage(ferrisFrame(Math.floor(t*3)%12),360,20);},
 top:(c,t)=>{for(let i=0;i<8;i++){c.fillStyle=(i+Math.floor(t*4))%2?'#fff8a0':'#ff8a4a';c.fillRect(528+i*14,198,3,3);}}};

// ---- aquarium
SCENES.aquarium={sky:()=>{DG(0,0,640,360,['#3ab4e8','#1a78c0','#0c4488','#062650']);for(let k=0;k<6;k++)DF('#9ae8ff',3,[100+k*90,0,130+k*90,0,60+k*110,360,20+k*110,360]);
   R('#d8c89a',0,300,640,60);blob(80,300,30,['#2a6a5a','#3a8a6a','#5ab08a'],3,8);for(let i=0;i<6;i++){const x=40+i*110;LN('#3aa06a',x,300,x+Math.sin(i)*10,220,4);LN('#5ac08a',x+8,300,x+8,240,3);}
   for(let i=0;i<12;i++)CI(['#e8704a','#f0a0a0','#ffffff'][i%3],30+i*52,300+(i%3)*6,6);},
 fg:()=>{b.clearRect(0,0,640,360);R('#040c1e',0,0,640,360);b.save();b.globalCompositeOperation='destination-out';b.beginPath();b.moveTo(40,330);b.lineTo(40,110);b.quadraticCurveTo(320,-20,600,110);b.lineTo(600,330);b.closePath();b.fill();b.restore();
  b.strokeStyle=bc('#1a2c4a');b.lineWidth=6;b.beginPath();b.moveTo(40,330);b.lineTo(40,110);b.quadraticCurveTo(320,-20,600,110);b.lineTo(600,330);b.stroke();
  R('#0a1628',0,322,640,38);R('#16284a',0,318,640,4);DR('#3ab4e8',2,0,322,640,38);
  for(let x=0;x<640;x+=40)R('#0c182c',x,300,4,22);R('#16284a',0,298,640,4);
 },mid:(c,t)=>{
  for(let i=0;i<9;i++){const dir=i%2?1:-1,sp=14+(i*7)%20;let x=((i*97+t*sp)%760)-60;if(dir<0)x=640-x;const y=60+(i*41)%210+Math.sin(t+i)*6;const col=['#ffb04a','#f4f4f4','#8ae0ff','#ff7a8a','#ffe070'][i%5];
   c.fillStyle=col;c.fillRect(x|0,y|0,12,6);c.fillRect((x+(dir>0?-4:12))|0,(y+1)|0,4,4);c.fillStyle='#10203a';c.fillRect((x+(dir>0?9:2))|0,(y+1)|0,1,1);c.fillStyle='#ffffff';c.fillRect((x+4)|0,y|0,4,1);}
  // manta
  const mx=((t*20)%900)-150,my=120+Math.sin(t*0.7)*12;c.fillStyle='#0e3a6a';c.beginPath();c.moveTo(mx,my);c.lineTo(mx+40,my-18);c.lineTo(mx+30,my+4);c.lineTo(mx+40,my+22);c.closePath();c.fill();c.fillRect((mx+30)|0,(my-1)|0,30,2);
  for(let i=0;i<14;i++){const x=(i*47)%600+20,y=340-((t*30+i*60)%330);c.fillStyle='#c8f4ff';c.fillRect(x+Math.sin(t*3+i)*2|0,y|0,2,2);}
 },top:(c,t)=>{c.fillStyle='#2a6aa0';for(let i=0;i<30;i++){const x=(i*29+Math.sin(t*1.3+i)*10)%640,w=6+Math.sin(t*2+i*2)*4;c.fillRect(x|0,324+(i%4)*8,w|0,1);}}};

// ---- cinema
SCENES.cinema={sky:()=>{R('#0a0810',0,0,640,360);},fg:()=>{
  DG(0,0,640,360,['#241632','#1a1026','#120a1a']);
  // ceiling lights
  const r=rng(77);for(let i=0;i<40;i++){const x=r()*640,y=r()*24;R(r()<0.3?'#ffe8a0':'#8a6a9a',x,y,1,1);}
  // wall sconces
  for(const x of [40,600]){PG('#3a2440',[x-10,120,x+10,120,x+6,136,x-6,136]);EL('#ffd890',x,118,12,5);EL('#fff0c0',x,118,6,2);PG('#3a2a3a',[x-14,112,x+14,112,x-2,40,x+2,40]);}
  // exit sign
  R('#1a3a24',18,60,44,16);R('#2aa04a',20,62,40,12);PXT('EXIT',25,65,'#e8ffe8');
  // screen + frame
  R('#050408',100,24,440,202);R('#e8eef8',106,28,428,190);
  b.save();b.beginPath();b.rect(110,32,420,182);b.clip();
  DG(110,32,420,120,['#ff9a7a','#ffc48a','#ffe4b0']);CI('#fff4d8',320,150,28);CI('#ffe8b8',320,150,20);
  DG(110,150,420,64,['#e8806a','#b85a6a','#6a3a5a']);for(let y=154;y<214;y+=5)R('#ffc8a0',150+((y*37)%120),y,60+((y*13)%80),1);
  PG('#2a1a2a',[110,214,110,160,180,150,250,170,262,214]);
  // two silhouettes on the cliff
  for(const [x,d] of [[206,1],[232,-1]]){CI('#2a1a2a',x,128,6);PG('#2a1a2a',[x-6,134,x+6,134,x+8,160,x-8,160]);}
  CI('#ff6a8a',219,118,3);CI('#ff6a8a',223,118,3);PG('#ff6a8a',[216,119,226,119,221,125]);
  b.restore();
  // valance + curtains
  R('#6a1424',90,0,460,20);for(let x=90;x<550;x+=20){CI('#6a1424',x+10,20,10);R('#e8b84a',x,20,20,2);}R('#e8b84a',90,18,460,2);
  curtain(0,0,96,300,'#6a1626','#420c18','#8a2436');curtain(544,0,96,300,'#6a1626','#420c18','#8a2436');
  for(const x of [92,544]){R('#e8b84a',x,0,4,300);CI('#e8b84a',x+2,200,5);R('#c8943a',x,205,4,14);}
  R('#2a1a2a',100,226,440,10);R('#3a2a3a',100,226,440,2);
  // seats
  for(let row=0;row<4;row++){const y=236+row*30,s=1+row*0.22,w=32*s,h=26*s;for(let x=-24+(row%2)*14;x<660;x+=w+6){
    if(x>296-w/2&&x<336)continue;
    R('#2a0810',x,y,w,h);PG('#8a1a2e',[x+2,y+6,x+5,y+1,x+w-5,y+1,x+w-2,y+6,x+w-2,y+h-6,x+2,y+h-6]);R('#b02a40',x+5,y+2,w-10,2);R('#5a0e1c',x+2,y+h-8,w-4,3);R('#1a1014',x-3,y+h-12,4,12);}}
  // aisle & step lights
  R('#1a1220',300,236,40,124);for(let y=244;y<360;y+=18){R('#ffcc6a',302,y,3,2);R('#ffcc6a',335,y,3,2);R('#2a1e2a',300,y+10,40,2);}
  // audience heads (rim lit by the screen)
  for(const [x,y,sz] of [[120,236,8],[170,238,8],[420,234,8],[520,264,10],[80,294,12],[400,296,12]]){EL('#0c0810',x,y+sz+3,sz*1.5,sz*0.7);CI('#0c0810',x,y,sz);EL('#3a2a40',x-sz*0.3,y-sz*0.55,sz*0.4,sz*0.2);}
  // popcorn
  PG('#f4f4f4',[454,316,470,316,468,332,456,332]);R('#e84a4a',457,316,3,16);R('#e84a4a',464,316,3,16);for(let k=0;k<5;k++)CI('#fff0b0',456+k*3.4,314-(k%2)*2,2.4);
 },top:(c,t)=>{const f=Math.sin(t*9)*0.5+Math.sin(t*3.1)*0.5;c.save();c.globalAlpha=0.1+f*0.04;c.fillStyle='#fff4e0';c.beginPath();c.moveTo(320,0);c.lineTo(106,30);c.lineTo(534,30);c.closePath();c.fill();
   c.globalAlpha=0.05+f*0.03;c.fillRect(110,32,420,182);c.restore();
   for(let i=0;i<14;i++){const x=(i*47+t*6)%420+110,y=(i*29+t*3)%30;c.fillStyle='#fff4e0';if((i+Math.floor(t*3))%3===0)c.fillRect(x|0,y|0,1,1);}}};

// ---- park
SCENES.park={sky:skyScene(SK_DAY,()=>{ridge('#9cc0de',210,24,23,20);blob(120,200,60,['#3e7a44','#56a050','#7cc466'],21,10);blob(420,200,50,['#3e7a44','#56a050','#7cc466'],22,10);}),
 fg:()=>{b.clearRect(0,0,640,360);R('#6ab85a',0,210,640,150);DG(0,210,640,150,['#5aa84a','#7cc466']);
  EL('#4a8ac8',420,270,170,40);EL('#8ac8f0',420,262,160,30);EL(tpat(null,'#ffffff',3),420,262,150,26);
  PG('#e8d8b0',[0,360,120,360,300,240,340,210,290,210,200,260]);
  for(let i=0;i<200;i++){const r=(i*7919)%640,y=220+(i*131)%140;R('#4a9a3e',r,y,1,2);}
  // trees
  R('#6a4a34',40,40,20,200);blob(50,40,90,['#2e6a3a','#46904a','#6ab85a','#98d878'],31,16);
  R('#6a4a34',590,60,18,180);blob(600,50,80,['#2e6a3a','#46904a','#6ab85a','#98d878'],32,14);
  // bench
  R('#8a5a34',180,250,90,6);R('#8a5a34',180,236,90,6);R('#3a3a42',186,256,4,24);R('#3a3a42',260,256,4,24);R('#3a3a42',186,232,4,24);R('#3a3a42',260,232,4,24);
  // lamp
  R('#2a3a3a',330,120,5,120);R('#2a3a3a',322,116,20,6);EL('#fffae0',332,112,8,8);
  // ducks
  for(const x of [380,400]){EL('#ffffff',x,266,6,4);CI('#ffffff',x+5,262,3);R('#f0a030',x+8,262,2,1);}
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,110,6),
 top:(c,t)=>{for(let i=0;i<10;i++){if(Math.sin(t*3+i*2)>0.5){c.fillStyle='#ffffff';c.fillRect(300+i*24,248+(i*7)%30,3,1);}}}};

// ---- mall
SCENES.mall={sky:skyScene(SK_DAY),fg:()=>{R('#f6f2f8',0,0,640,360);
  // skylight roof
  R('#cfcad8',0,0,640,58);for(let x=12;x<640;x+=64){hole(x,6,52,44);LN('#e8e4f0',x,50,x+26,6,2);LN('#e8e4f0',x+52,50,x+26,6,2);}R('#b4aec2',0,56,640,4);R('#ffffff',0,58,640,1);
  const shops=[['#ff8aa8','#fff0f4','CAFE'],['#6ac8ff','#eaf8ff','BOOK'],['#ffc84a','#fff8e0','GIFT'],['#7ad88a','#efffef','SHOP'],['#b08ae8','#f4eeff','TOYS'],['#ff9a6a','#fff2ea','SHOE']];
  const shop=(x,y,w,h,sc,big)=>{const [c,l,t]=sc;R('#e2dcea',x,y,w,h);R(l,x+4,y+14,w-8,h-14);R(c,x+2,y,w-4,14);R(mixHex(c,'#ffffff',0.5),x+2,y,w-4,2);PXT(t,x+w/2-pxw(t,big?2:1)/2,y+(big?2:4),'#ffffff',big?2:1);
    for(let k=0;k<(w-8)/10;k++)PG(k%2?'#ffffff':c,[x+4+k*10,y+14,x+14+k*10,y+14,x+9+k*10,y+20]);
    R('#c6d6e6',x+10,y+24,w-20,h-28);DF('#ffffff',5,[x+10,y+24,x+30,y+24,x+16,y+h-4,x+10,y+h-4]);
    // display: mannequin + shelf
    const mx=x+w*0.32;CI('#f4e8dc',mx,y+31,4);PG(c,[mx-5,y+36,mx+5,y+36,mx+8,y+h-10,mx-8,y+h-10]);R('#8a8498',mx-1,y+h-10,2,6);
    R('#a88a6a',x+w*0.55,y+h-18,w*0.35,2);for(let k=0;k<4;k++)R(['#ff7aa2','#5ab8f0','#ffd04a','#7ad88a'][Math.abs(k+x)%4],x+w*0.57+k*6,y+h-26,5,8);
    R('#a88a6a',x+w*0.55,y+h-34,w*0.35,2);for(let k=0;k<3;k++)CI(['#ffffff','#ffd0de','#d0e8ff'][k],x+w*0.6+k*8,y+h-38,3);
    R('#9a94aa',x+2,y+h-2,w-4,2);};
  // upper floor
  for(let i=0;i<6;i++)shop(i*108-4,66,104,72,shops[i],false);
  R('#bdb8cc',0,140,640,12);R('#ffffff',0,140,640,2);R('#9a94aa',0,150,640,2);
  R('#dff0fa',0,120,640,20);for(let x=0;x<640;x+=40){R('#b4c8d8',x,120,2,20);LN('#ffffff',x+8,138,x+18,122,1);}R('#a8a2b8',0,118,640,3);
  for(let i=0;i<5;i++)person(40+i*130+((i*37)%30),118,0.55,['#3a2a24','#6a4a34','#2a2430','#8a5a3a','#4a3a5a'][i],['#ff9ab8','#7ab8e8','#f0d070','#9ad89a','#c8a8f0'][i]);
  // lower floor
  for(let i=0;i<5;i++)shop(i*132-10,160,126,110,shops[(i+3)%6],true);
  // escalator
  PG('#8a849a',[372,272,500,152,528,152,404,272]);PG('#b8b2c8',[380,272,504,156,520,156,396,272]);for(let k=0;k<14;k++){const t=k/14;LN('#9a94aa',380+124*t,272-116*t,396+124*t,272-116*t,1);}
  LN('#2a2634',366,262,496,144,4);LN('#6a6680',366,261,496,143,1);PG('#dff0fa',[364,264,494,146,494,158,368,274]);
  // fountain
  EL('#9a94aa',220,300,74,16);EL('#dfe9f4',220,296,70,13);EL('#8ac8f0',220,296,62,10);R('#c8c2d4',212,258,16,38);EL('#dfe9f4',220,258,20,5);
  for(const d of [-1,1]){b.strokeStyle=bc('#bfe6ff');b.lineWidth=2;b.beginPath();b.moveTo(220,252);b.quadraticCurveTo(220+d*30,236,220+d*44,292);b.stroke();}
  // floor
  R('#e6e0ec',0,272,640,88);for(let y=272,k=0;y<360;k++,y+=8+k*3)R('#d6d0de',0,y,640,1);for(let i=-10;i<=10;i++)LN('#d6d0de',320+i*40,272,320+i*110,360,1);
  // shoppers
  person(96,300,0.85,'#3a2a24','#ff9ab8',{bag:'#ffffff'});person(470,296,0.8,'#8a5a3a','#7ab8e8',{back:true,tail:true});person(590,302,0.85,'#2a2430','#f0d070',{bag:'#ff7aa2'});
  // planters & bench
  for(const x of [16,620]){R('#c8a07a',x-14,244,28,28);R('#a8805a',x-14,244,28,4);blob(x,232,22,['#2e6a3a','#46904a','#6ab85a','#98d878'],x+3,8);}
  R('#b08a60',290,318,70,6);R('#8a6a44',290,324,70,3);R('#6a6680',294,327,4,14);R('#6a6680',352,327,4,14);
  // hanging lamps
  for(const x of [150,420]){LN('#6a6680',x,60,x,96,1);PG('#ffe8b0',[x-8,104,x-4,96,x+4,96,x+8,104]);}
 },mid:(c,t)=>drawClouds(c,t,'day',CL_DAY,50,5),
 top:(c,t)=>{for(let i=0;i<8;i++){const p=(t*0.8+i/8)%1;const d=i%2?1:-1;const x=220+d*p*44,y=252-Math.sin(p*Math.PI)*16+p*40;c.fillStyle='#ffffff';c.fillRect(x|0,y|0,2,2);}
   for(let i=0;i<5;i++){if(Math.sin(t*2+i*1.7)>0.7){c.fillStyle='#ffffff';const x=40+i*130,y=30;c.fillRect(x,y-2,1,5);c.fillRect(x-2,y,5,1);}}}};

// ---- cafe
SCENES.cafe={sky:skyScene(['#8ab8e0','#c8e0f0','#f0f0e8'],()=>{R('#d8b89a',40,90,160,200);for(let y=100;y<280;y+=24)for(let x=50;x<190;x+=30)R('#8aa8c8',x,y,20,16);R('#a8886a',0,250,280,60);}),
 fg:()=>{R('#7a4e32',0,0,640,360);for(let x=0;x<640;x+=18)R('#6a4028',x,0,2,260);R('#f0e0c4',0,0,640,24);
  R('#4a2e1e',20,60,240,190);hole(28,68,224,174);R('#4a2e1e',138,68,4,174);R('#c84a3a',20,54,240,10);for(let x=20;x<260;x+=20)R('#f4e0c0',x,54,10,10);
  // menu board
  R('#2a2a24',300,50,120,90);frame('#a87a50',296,46,128,98,4);for(let i=0;i<6;i++){R('#f0ecd8',310,62+i*12,50,2);R('#f0c060',390,62+i*12,20,2);}
  // shelves cups
  for(const y of [80,120]){R('#a87a50',450,y,170,5);for(let x=458;x<610;x+=20){R(['#ffffff','#e8c8a0','#a8d0c8'][(x/20|0)%3],x,y-12,12,12);}}
  // counter
  R('#5a3420',300,200,340,80);R('#b08058',296,192,348,10);R('#3a2014',300,270,340,10);
  R('#c8ccd4',520,146,70,46);R('#8a8e98',524,150,62,20);R('#2a2a34',540,176,8,12);R('#2a2a34',566,176,8,12);
  // pendant lamps
  for(const x of [120,360,540])lamp(x,40,'#e8a048','#fff0b0');
  // floor & table
  R('#a87850',0,280,640,80);for(let x=0;x<640;x+=32)for(let y=280;y<360;y+=16)R(((x+y)/16)%2?'#9a6a44':'#b08458',x,y,32,16);
  EL('#f4ece0',160,300,110,20);EL('#d8ccbc',160,304,110,18);EL('#f4ece0',160,298,108,17);R('#5a3420',154,316,12,44);
  R('#ffffff',120,284,18,14);EL('#6a3a1e',129,285,8,2);R('#ffffff',138,288,4,5);PG('#ffffff',[180,296,210,296,206,300,184,300]);PG('#f8e8c8',[186,296,204,296,196,282]);R('#ff6a7a',194,280,4,4);
  for(const x of [120,360,540])glow(x,56,70,'#ffe8b0',4);
 },top:(c,t)=>{for(let i=0;i<5;i++){const p=(t*0.5+i/5)%1;c.fillStyle='#ffffff';if(p<0.8&&(i+Math.floor(t*6))%2)c.fillRect((127+Math.sin(p*8+i)*3)|0,(280-p*30)|0,1,2);}}};

// ---- karaoke
SCENES.karaoke={sky:()=>R('#120a20',0,0,640,360),fg:()=>{
  R('#1e1030',0,0,640,360);for(let x=0;x<640;x+=32)R('#261440',x,0,16,240);
  LN('#ff4ad0',0,30,640,30,2);LN('#4ae8ff',0,36,640,36,1);
  R('#0a0a12',180,50,280,160);DG(186,56,268,148,['#3a1a7a','#aa3ab8','#ff8a6a']);R('#ffffff',210,170,220,8);R('#ffe04a',210,170,120,8);R('#ffffff',230,186,180,6);CI('#ffe070',320,110,26);
  R('#5a2a3a',0,240,640,120);
  PG('#b0203a',[0,250,160,250,160,320,0,330]);R('#d0304a',0,246,160,10);PG('#b0203a',[480,250,640,250,640,330,480,320]);R('#d0304a',480,246,160,10);
  R('#2a1a2a',200,290,240,16);R('#4a2e44',196,284,248,8);for(const [x,c] of [[220,'#ffb04a'],[250,'#4ae88a'],[380,'#ff6a8a']]){R('#dde8f0',x,268,14,18);R(c,x+2,274,10,10);}
  R('#1a1a24',300,276,40,8);R('#8a8a94',320,272,4,6);CI('#3a3a44',326,272,4);
  R('#f0d040',400,268,4,18);CI('#ffd04a',420,276,10);CI('#1e1030',420,276,6);
 },top:(c,t)=>{const cols=['#ff5ad8','#5ae8ff','#ffe85a','#8aff8a'];for(let i=0;i<22;i++){const a=t*0.6+i*0.9;const x=320+Math.cos(a)*(150+(i%5)*40),y=130+Math.sin(a*1.3)*100;c.fillStyle=cols[i%4];c.fillRect(x|0,y|0,3,2);}
  CI2(c,320,14,8,'#dcdce8');}};
function CI2(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.fillStyle='#ffffff';c.fillRect(x-3,y-4,2,2);}

// ---- beach
SCENES.beach={sky:skyScene(SK_SUM,()=>{DG(0,190,640,90,['#2a8ad0','#4ab0e0','#8ad8f0']);R('#ffffff',0,190,640,1);ridge('#6a9ac0',192,10,31,30);}),
 fg:()=>{b.clearRect(0,0,640,360);R('#f0dcae',0,270,640,90);DG(0,270,640,90,['#e8d0a0','#f8e8c4']);
  // umbrella
  LN('#ffffff',160,200,172,320,3);PG('#ff5a6a',[70,210,160,170,250,210]);for(let k=0;k<4;k++)PG(k%2?'#ffffff':'#ff5a6a',[70+k*45,210,160,170,115+k*45,210]);
  R('#4ab0e8',120,310,110,20);R('#ffffff',120,316,110,3);
  // beach house
  R('#c8a878',480,200,160,90);PG('#4a7ab0',[470,200,560,176,650,200]);R('#fff4e0',500,214,120,30);for(let i=0;i<3;i++)R('#e84a4a',520+i*30,220,20,18);R('#8a6a4a',480,260,160,30);
  // shells
  for(const [x,y] of [[300,330],[380,344],[60,340]]){EL('#ffd8e0',x,y,4,3);R('#e8a0b0',x-1,y-1,1,3);}
 },mid:(c,t)=>{drawClouds(c,t,'sum',CL_SUM,110,5);for(let i=0;i<30;i++){if(Math.sin(t*2.5+i*1.9)>0.4){c.fillStyle='#ffffff';c.fillRect((i*23)%640,200+(i*11)%66,3,1);}}},
 top:(c,t)=>{c.fillStyle='#ffffff';for(let x=0;x<640;x+=4){const y=268+Math.sin(x*0.04+t*1.6)*3+Math.sin(t*0.8)*2;c.fillRect(x,y|0,4,2);}c.fillStyle='#bfe8f8';for(let x=0;x<640;x+=4){const y=264+Math.sin(x*0.05+t*1.6+1)*2;c.fillRect(x,y|0,4,1);}
  const gx=((t*30)%800)-80;c.fillStyle='#ffffff';c.fillRect(gx|0,60,4,1);c.fillRect((gx+4)|0,59,1,1);c.fillRect((gx-2)|0,59,2,1);}};

// ---- sports day
SCENES.sports_day={sky:skyScene(SK_SUM,()=>{ridge('#8cb0d4',200,30,5,18);}),fg:()=>{b.clearRect(0,0,640,360);
  const P={wall:'#f2ecdc',wallS:'#cfc6b0',roof:'#8a8a94',frame:'#a8acb4',glass:'#7aa4cc',glassL:'#c8e0f4'};building(180,110,280,100,P);R('#ffffff',300,120,40,20);R('#e84a4a',304,124,32,4);
  R('#caa478',0,210,640,150);DR('#b08a60',3,0,210,640,150);b.strokeStyle=bc('#ffffff');b.lineWidth=2;for(let k=0;k<3;k++){b.beginPath();b.ellipse(320,340,320+k*18,90+k*10,0,Math.PI,TAU);b.stroke();}
  for(const x of [10,470]){R('#ffffff',x,180,160,14);for(let k=0;k<8;k++)R(k%2?'#ffffff':'#e84a5a',x+k*20,194,20,34);R('#8a8a94',x+2,194,3,50);R('#8a8a94',x+155,194,3,50);
    for(let k=0;k<9;k++){CI(['#2a1a14','#4a2e1e','#2a1a14'][k%3],x+12+k*17,238,6);R(k%2?'#ffffff':'#3a58a8',x+6+k*17,244,12,10);}}
  for(let s=0;s<3;s++){for(let x=0;x<640;x+=16){const y=30+s*18+Math.sin(x/640*Math.PI)*40;PG(['#e84a4a','#ffffff','#3a78d8','#ffd04a','#4ab84a'][(x/16+s)%5],[x,y,x+12,y,x+6,y+11]);}}
 },mid:(c,t)=>drawClouds(c,t,'sum',CL_SUM,100,7)};

// ---- shrine tanabata
SCENES.shrine_tanabata={sky:skyScene(['#0a0c30','#1e1a58','#4a2a78','#c85a7a','#ffa86a'],()=>{stars(160,11,200,['#ffffff','#c8d4ff','#ffe8c8']);for(let i=0;i<300;i++){const x=i*2.1,y=40+Math.sin(i*0.02)*30+((i*37)%30);R('#b8b8ff',x,y,1,1);}}),
 fg:()=>{b.clearRect(0,0,640,360);
  R('#2a1a30',0,280,640,80);DG(0,280,640,80,['#3a2438','#1e1224']);PG('#6a5a64',[260,280,380,280,480,360,160,360]);
  // torii
  R('#c8323a',470,70,14,210);R('#c8323a',600,70,14,210);PG('#2a1a1a',[440,56,648,56,640,70,448,70]);R('#c8323a',452,70,176,10);R('#c8323a',460,96,164,10);R('#2a1a1a',532,80,16,16);
  // lanterns string
  for(let x=20;x<440;x+=40){const y=110+Math.sin(x/440*Math.PI)*24;LN('#2a1a1a',x,y-4,x+40,110+Math.sin((x+40)/440*Math.PI)*24-4,1);EL('#ff8a3a',x,y+6,8,10);R('#2a1a1a',x-5,y-4,10,3);R('#2a1a1a',x-5,y+14,10,3);R('#ffd070',x-3,y+2,6,8);glow(x,y+6,26,'#ffb050',4);}
  // bamboo
  for(const [x,h] of [[110,300],[150,280]]){R('#4a8a3a',x,360-h,8,h);R('#6ab050',x+1,360-h,2,h);for(let y=360-h;y<360;y+=30)R('#2e5a24',x,y,8,2);}
  for(let i=0;i<14;i++){const x=60+(i*29)%160,y=70+(i*37)%120;PG('#3a7a2e',[x,y,x+26,y-8,x+30,y-4]);PG('#5aa040',[x,y,x+22,y-6,x+26,y-4]);}
  // stone lantern
  R('#7a7480',330,230,24,50);R('#8a8490',322,220,40,10);R('#ffd070',336,236,12,12);R('#8a8490',318,276,48,6);
 },top:(c,t)=>{const cols=['#ff6a8a','#ffd04a','#6ac8ff','#8ae08a','#c88aff','#ffffff'];for(let i=0;i<16;i++){const x=70+(i*37)%150,y=80+(i*23)%130+Math.sin(t*1.5+i)*2;const sw=Math.round(Math.sin(t*1.2+i*0.7)*2);c.fillStyle=cols[i%6];c.fillRect(x+sw,y,5,14);c.fillStyle='#2a1a1a';c.fillRect(x+2,y-2,1,2);}}};

// ---- rank board
SCENES.rank_board={sky:skyScene(SK_DAY,()=>{blob(40,140,60,['#3e7a44','#56a050','#7cc466','#a8e088'],5,12);blob(620,150,50,['#3e7a44','#56a050','#7cc466','#a8e088'],6,10);}),fg:()=>{
  R('#efe8d6',0,0,640,360);R('#dcd4c0',0,0,640,22);R('#c8c0aa',0,22,640,2);for(const x of [60,300,540]){R('#ffffff',x,7,70,5);R('#c8c0aa',x,12,70,1);}
  // windows on both sides
  for(const x of [8,572]){R('#c4c8d0',x,40,60,150);hole(x+4,44,52,142);R('#c4c8d0',x+28,44,4,142);R('#c4c8d0',x+4,112,52,3);R('#8a8e9a',x,188,60,4);}
  // wainscot
  R('#b88a5a',0,236,640,36);R('#d0a070',0,236,640,3);for(let x=0;x<640;x+=40)R('#a07448',x,240,2,32);
  // board
  R('#5a3a24',76,34,488,236);R('#6a4a30',80,38,480,228);R('#c09060',88,46,464,212);
  const rr=rng(3);for(let i=0;i<900;i++)R(rr()<0.5?'#b0804e':'#cc9c6c',88+rr()*462,46+rr()*210,1,1);
  // banner
  R('#b02832',186,50,268,26);R('#d83a44',188,52,264,22);R('#f0c048',188,52,264,2);R('#f0c048',188,72,264,2);
  PXT('RANKING',320-pxw('RANKING',2)/2,58,'#fff4e0',2);for(const x of [174,466]){CI('#ff8aa8',x,63,10);CI('#ffc0d0',x,63,6);CI('#ffe070',x,63,2);}
  // result sheets
  for(let c=0;c<4;c++){const x=102+c*110,y=86+(c%2)*3;R('#b8a88a',x+2,y+2,100,166);R('#fdfcf6',x,y,100,166);R('#e8e2cc',x+96,y,4,166);
    R('#e8d8a0',x+36,y-4,28,8);for(let r=0;r<14;r++){const yy=y+14+r*10.5;R(r<3&&c===0?'#e84a5a':'#3a3a44',x+6,yy,8,4);R('#8a8a94',x+20,yy,48,4);R('#3a3a44',x+80,yy,14,4);}}
  // side posters
  for(const [x,y,c,ic] of [[14,200,'#ffd0de','ball'],[590,196,'#d0e8ff','note']]){R('#ffffff',x,y,40,32);R(c,x+2,y+2,36,28);R('#e84a5a',x+17,y-2,6,4);
    if(ic==='ball'){CI('#ffffff',x+20,y+16,8);CI('#2a2a34',x+20,y+16,3);}else{R('#4a6ab0',x+16,y+8,2,14);CI('#4a6ab0',x+14,y+22,3);R('#4a6ab0',x+16,y+8,8,2);}}
  // floor
  R('#9a8e78',0,272,640,88);for(let y=278,k=0;y<360;k++,y+=6+k*2)R('#8a7e68',0,y,640,1);R('#b0a48c',0,272,640,2);
  // crowd (backs)
  const HAIR=['#2a1e1a','#4a2e20','#1e1a24','#6a4430','#3a2a30'];
  const kid=(x,y,s,h,o)=>{o=o||{};const bw=30*s;
    PG('#2e3866',[x-bw/2,y+60*s,x-bw/2+3*s,y+18*s,x-8*s,y+12*s,x+8*s,y+12*s,x+bw/2-3*s,y+18*s,x+bw/2,y+60*s]);R('#48568e',x-bw/2+3*s,y+18*s,3*s,40*s);
    R('#f4e4d8',x-4*s,y+8*s,8*s,6*s);PG('#fbfbfd',[x-6*s,y+12*s,x+6*s,y+12*s,x,y+17*s]);
    EL(h,x,y,12*s,13*s);EL(mixHex(h,'#ffffff',0.18),x-4*s,y-6*s,5*s,3*s);
    if(o.tail){EL(h,x,y+14*s,4*s,10*s);CI(o.tail,x,y+6*s,3*s);}
    if(o.twin){for(const d of [-1,1]){EL(h,x+d*12*s,y+10*s,4*s,11*s);CI(o.twin,x+d*11*s,y+1*s,2.5*s);}}
    if(o.arm){LN('#2e3866',x+10*s,y+18*s,x+22*s,y-14*s,6*s);CI('#f4e4d8',x+22*s,y-16*s,3.2*s);}};
  for(const [x,sc,h,o] of [[40,0.8,0,{}],[112,0.85,1,{tail:'#ff7aa2'}],[520,0.8,2,{}],[604,0.85,3,{twin:'#ffd04a'}]])kid(x,278,sc,HAIR[h],o);
  for(const [x,sc,h,o] of [[70,1.1,4,{arm:1}],[160,1.05,0,{}],[480,1.1,1,{}],[570,1.15,2,{tail:'#5ab8f0'}]])kid(x,300,sc,HAIR[h],o);
  for(const [x,sc,h] of [[18,1.35,3],[250,1.3,2],[400,1.3,0],[630,1.35,1]])kid(x,326,sc,HAIR[h]);
 }};

// ---- title
SCENES.title={sky:skyScene(['#2a2060','#6a3a8a','#d86a8a','#ffb49a','#ffe0c0'],()=>{stars(70,3,110,['#ffffff','#ffe0f0']);CI('#fff4e0',520,190,20);glow(520,190,80,'#ffe8d0',6);
   ridge('#8a4a7a',250,20,2,20);city(282,['#5a2e5e','#4a2650'],17,'#ffd08a');ridge('#3a1e40',300,16,8,12);}),
 fg:()=>{b.clearRect(0,0,640,360);const T=['#c85a8a','#ee8aae','#ffc0d4','#fff0f6'];
  LN('#3a2030',0,40,120,90,8);LN('#3a2030',60,70,160,40,5);blob(60,40,70,T,51,14);blob(150,60,40,T,52,8);
  LN('#3a2030',640,30,520,80,8);blob(590,40,70,T,53,14);blob(500,80,40,T,54,8);
  R('#2a1430',0,330,640,30);for(let i=0;i<80;i++)R('#ffc0d4',(i*53)%640,332+(i*7)%26,2,1);
 },mid:(c,t)=>drawClouds(c,t,'eve',CL_EVE,120,4),
 top:(c,t)=>{for(let i=0;i<60;i++){const sp=16+(i%5)*6;const y=((i*53+t*sp)%400)-20,x=((i*137+t*18+Math.sin(t*1.3+i)*24)%680)-20;petal(c,x|0,y|0,(Math.floor(t*4+i)%2));}
  for(let i=0;i<6;i++){if(Math.sin(t*2+i*1.3)>0.7){const x=100+i*90,y=40+(i*31)%80;c.fillStyle='#ffffff';c.fillRect(x,y-2,1,5);c.fillRect(x-2,y,5,1);}}}};

const BCACHE={};
function paint(fn,clear){const cv=mk(640,360),x=cv.getContext('2d');b=x;BP=new Set(['#000000']);fn();const P=BP;quantize(cv,P,clear?128:0);b=null;return cv;}
function getBG(id){if(!BCACHE[id]){const S=SCENES[id];BCACHE[id]={sky:paint(S.sky,false),fg:S.fg?paint(S.fg,true):null};}return BCACHE[id];}
ART.bgs=Object.keys(SCENES);
ART.bg=function(ctx,id,t){
  const S=SCENES[id]||SCENES.classroom;id=SCENES[id]?id:'classroom';t=t||0;
  const c=getBG(id);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(c.sky,0,0);if(S.mid)S.mid(ctx,t);if(c.fg)ctx.drawImage(c.fg,0,0);if(S.top)S.top(ctx,t);ctx.restore();
};

/* ================= chibi protagonist (48x48 cell, feet at bottom-center) ================= */
const CH_H={b:'#8a5232',s:'#643820',l:'#b87a4e',ol:'#2c160c'};
const CH_SK={b:'#fee6d6',s:'#f0b8a4',o:'#7a3e34'};
function chibiDraw(a,f){
  // pose params
  const P={dy:0,eyes:'open',mouth:'smile',armL:[-0.3,0],armR:[0.3,0],legs:'stand',blush:0,prop:null,head:0,lie:false,marks:[]};
  const ph=f%4, sw=[0,1,0,-1][ph];
  switch(a){
    case 'study':P.legs='sit';P.eyes=ph===3?'happy':'down';P.mouth=ph===3?'smile':'line';P.armR=[0.9,sw];P.armL=[-0.9,0];P.prop='desk';P.head=ph%2?1:0;break;
    case 'sport':P.legs='run'+ph;P.armL=[-0.6+sw*0.9,0];P.armR=[0.6-sw*0.9,0];P.dy=ph%2?-2:0;P.eyes='determined';P.mouth='open';P.marks=['sweat'];break;
    case 'art':P.prop='easel';P.armR=[1.8+sw*0.4,0];P.eyes='open';P.mouth=ph===2?'open':'smile';P.paint=ph;break;
    case 'culture':P.legs='sit';P.prop='book';P.eyes=ph===3?'happy':'down';P.armL=[-1.4,0];P.armR=[1.4,0];P.flip=ph===2;break;
    case 'style':P.prop='mirror';P.armR=[2.2,0];P.armL=[-2.4+sw*0.3,0];P.eyes=ph%2?'wink':'open';P.mouth='smile';P.blush=1;P.marks=['spark'+ph];break;
    case 'rest':P.lie=true;P.eyes='closed';P.mouth='line';P.marks=['z'+ph];break;
    case 'play':P.dy=[0,-5,-8,-4][ph];P.armL=[-2.6,0];P.armR=[2.6,0];P.eyes='happy';P.mouth='open';P.legs=ph?'jump':'stand';P.marks=['note'+ph];break;
    case 'walk':P.legs='walk'+ph;P.armL=[-0.35+sw*0.5,0];P.armR=[0.35-sw*0.5,0];P.dy=ph%2?-1:0;P.mouth='smile';break;
    case 'fail':P.legs='kneel';P.eyes='sad';P.mouth='frown';P.head=3;P.armL=[-0.2,0];P.armR=[0.2,0];P.marks=['gloom'+ph];break;
    case 'sick':P.lie=true;P.eyes='closed';P.mouth='wavy';P.blush=2;P.marks=['ice','heat'+ph];break;
  }
  const H=CH_H,K=CH_SK;
  if(P.lie){ // futon scene
    groupL([{f:()=>{g.roundRect(4,36,42,10,3);},c:'#f4f4fa'}],'#3a3450',0.8,()=>{bp();g.rect(4,42,42,4);fillC('#d4d4e4');});
    groupL([{f:()=>{g.roundRect(4,30,20,9,4);},c:'#ffffff'}],'#3a3450',0.8);
    // head lying
    groupL([{f:()=>ell(16,27,10,9),c:H.b}],H.ol,0.8,()=>{bp();ell(18,31,9,5);fillC(H.s);});
    groupL([{f:()=>ell(17,29,7.5,6.5),c:K.b}],K.o,0.7,()=>{if(P.blush){bp();ell(13,31,2.5,1.2);fillC('#f5a0a8');bp();ell(21,31,2.5,1.2);fillC('#f5a0a8');}});
    bp();g.moveTo(10,24);g.quadraticCurveTo(16,20,24,25);g.lineTo(24,27);g.quadraticCurveTo(16,24,10,28);g.closePath();fillC(H.b);
    for(const x of [14,20]){bp();g.moveTo(x-1.5,29);g.quadraticCurveTo(x,30.5,x+1.5,29);strokeC('#2a1a1a',0.9);}
    bp();if(P.mouth==='wavy'){g.moveTo(15.5,33);g.lineTo(16.5,32.5);g.lineTo(17.5,33);g.lineTo(18.5,32.5);}else{g.moveTo(16,33);g.lineTo(18,33);}strokeC(K.o,0.7);
    groupL([{f:()=>{g.moveTo(22,32);g.quadraticCurveTo(34,24,46,32);g.lineTo(46,40);g.lineTo(22,40);g.closePath();},c:P.marks.includes('ice')?'#8ac0f0':'#f4a0b8'}],'#3a3450',0.8,()=>{for(let x=26;x<46;x+=6){bp();g.rect(x,30,3,10);fillC(P.marks.includes('ice')?'#a8d4f8':'#ffc0d0');}});
    if(P.marks.includes('ice')){groupL([{f:()=>ell(16,21,6,3),c:'#bfe4ff'}],'#3a5a8a',0.6);}
  } else {
    const oy=P.dy;
    g.save();g.translate(0,oy);
    // props behind
    if(P.prop==='easel'){bp();g.moveTo(36,20);g.lineTo(31,46);g.moveTo(36,20);g.lineTo(42,46);strokeC('#6a4028',1.4);groupL([{f:()=>g.rect(29,14,15,16),c:'#fbf6ea'}],'#6a4028',0.7,()=>{const cs=['#e84a4a','#4a8ae8','#f0c040','#58b858'];for(let k=0;k<=P.paint;k++){bp();ell(33+k*2.5,19+(k%2)*5,2.2,1.6);fillC(cs[k]);}});}
    // legs
    const legs=P.legs;
    const leg=(x,y1,y2)=>{bp();g.moveTo(x,y1);g.lineTo(x,y2);strokeC('#3a2a3a',4.2);bp();g.moveTo(x,y1);g.lineTo(x,y2);strokeC('#f6dccc',2.6);bp();ell(x,y2+0.8,2.4,1.5);fillC('#5a3424');};
    if(legs==='stand'){leg(21,36,44);leg(27,36,44);}
    else if(legs==='jump'){leg(20,35,41);leg(28,35,41);}
    else if(legs.startsWith('run')||legs.startsWith('walk')){const q=+legs.slice(-1),A=legs.startsWith('run')?4:2.2,s=[1,0,-1,0][q];leg(21-s*A*0.5,36,44-Math.max(0,s)*2);leg(27+s*A*0.5,36,44-Math.max(0,-s)*2);}
    else if(legs==='kneel'){bp();ell(20,43,5,2.4);ell(28,43,5,2.4);fillC('#f6dccc');strokeC('#3a2a3a',0.7);}
    // skirt
    groupL([{f:()=>{g.moveTo(17,31);g.lineTo(31,31);g.lineTo(34,38);g.lineTo(14,38);g.closePath();},c:'#3a4468'}],'#141830',0.7,()=>{for(let x=15;x<34;x+=3){bp();g.moveTo(x,31);g.lineTo(x-0.5,38);strokeC('#56608a',0.6);}bp();g.rect(14,33.5,22,0.8);fillC('#b8384a');});
    if(legs==='sit'||legs==='kneel'){}
    // body
    groupL([{f:()=>{g.moveTo(18,23);g.quadraticCurveTo(24,21,30,23);g.lineTo(31.5,32);g.lineTo(16.5,32);g.closePath();},c:BLZ.b}],BLZ.ol,0.7,()=>{bp();g.moveTo(22,22);g.lineTo(26,22);g.lineTo(24,27);g.closePath();fillC('#ffffff');bp();g.rect(27,22,6,11);fillC(BLZ.s);});
    bp();ell(24,24,1.8,1.2);fillC('#d23a4e');
    // arms: angle 0 = down, + = raise toward outside
    const arm=(side,ang)=>{const sx=24+side*6,sy=24;const a=ang*1.0;const ex=sx+side*Math.sin(Math.abs(a))*7*(a*side>=0?1:-1)*side*side, ey=sy+Math.cos(a)*7;
      const hx=sx+Math.sin(a)*7, hy=sy+Math.cos(a)*7;
      bp();g.moveTo(sx,sy);g.lineTo(hx,hy);strokeC(BLZ.ol,3.8);bp();g.moveTo(sx,sy);g.lineTo(hx,hy);strokeC(BLZ.b,2.4);bp();ell(hx,hy,1.6,1.6);fillC(K.b);strokeC(K.o,0.5);};
    arm(-1,P.armL[0]);arm(1,P.armR[0]+(a==='study'?P.armR[1]*0.15:0));
    // head
    g.save();g.translate(24,14+P.head);
    groupL([{f:()=>{ell(0,0,11,10);},c:H.b},{f:()=>{g.moveTo(-11,0);g.quadraticCurveTo(-12,9,-8,11);g.lineTo(8,11);g.quadraticCurveTo(12,9,11,0);g.closePath();},c:H.b}],H.ol,0.8,()=>{bp();ell(4,6,9,6);fillC(H.s);});
    groupL([{f:()=>{g.moveTo(-8,-1);g.quadraticCurveTo(-8.5,8,0,9.5);g.quadraticCurveTo(8.5,8,8,-1);g.closePath();},c:K.b}],K.o,0.6);
    groupL([{f:()=>{g.moveTo(-10,1);g.quadraticCurveTo(-9,-10,0,-10);g.quadraticCurveTo(9,-10,10,1);g.lineTo(6,-1);g.lineTo(3,2);g.lineTo(0,-1);g.lineTo(-3,2);g.lineTo(-6,-1);g.closePath();},c:H.b}],H.ol,0.7,()=>{bp();g.moveTo(-6,-6);g.quadraticCurveTo(0,-9,6,-6);strokeC(H.l,1.2);});
    if(P.blush){bp();ell(-5,5.5,2.2,1.1);ell(5,5.5,2.2,1.1);fillC('#f5a0a8');}
    const E=P.eyes;
    for(const s of [-1,1]){const x=s*4,y=3;
      if(E==='happy'||(E==='wink'&&s>0)){bp();g.moveTo(x-1.6,y+0.8);g.quadraticCurveTo(x,y-1.4,x+1.6,y+0.8);strokeC('#2a1a1a',0.9);}
      else if(E==='closed'||E==='down'){bp();g.moveTo(x-1.6,y+0.2);g.quadraticCurveTo(x,y+1.4,x+1.6,y+0.2);strokeC('#2a1a1a',0.9);}
      else{bp();ell(x,y+0.3,1.4,E==='sad'?1.6:2);fillC('#3a1e14');bp();ell(x-0.4,y-0.4,0.6,0.6);fillC('#ffffff');
        if(E==='sad'){bp();g.moveTo(x-s*1.8,y-3.5);g.lineTo(x+s*1.2,y-2.2);strokeC(H.ol,0.6);}
        if(E==='determined'){bp();g.moveTo(x-s*1.8,y-2.2);g.lineTo(x+s*1.2,y-3.4);strokeC(H.ol,0.7);}}}
    const M=P.mouth;bp();
    if(M==='open'){ell(0,7,1.4,1.2);fillC('#a0303a');}
    else if(M==='smile'){g.moveTo(-1.3,6.6);g.quadraticCurveTo(0,7.8,1.3,6.6);strokeC(K.o,0.6);}
    else if(M==='frown'){g.moveTo(-1.2,7.5);g.quadraticCurveTo(0,6.6,1.2,7.5);strokeC(K.o,0.6);}
    else{g.moveTo(-0.9,7);g.lineTo(0.9,7);strokeC(K.o,0.6);}
    g.restore();
    // props front
    if(P.prop==='desk'){groupL([{f:()=>g.rect(8,30,32,4),c:'#d8a868'},{f:()=>g.rect(10,34,3,12),c:'#8c929e'},{f:()=>g.rect(35,34,3,12),c:'#8c929e'}],'#4a3020',0.7);
      groupL([{f:()=>g.rect(14,27.5,14,3),c:'#ffffff'}],'#5a5a6a',0.5);bp();g.moveTo(26+P.armR[1],25);g.lineTo(28+P.armR[1],30);strokeC('#e8b020',1.1);}
    if(P.prop==='book'){groupL([{f:()=>{g.moveTo(15,26);g.lineTo(24,28);g.lineTo(33,26);g.lineTo(33,34);g.lineTo(24,35);g.lineTo(15,34);g.closePath();},c:'#fbf6ea'}],'#3a5a8a',0.8,()=>{for(let y=28;y<33;y+=1.6){bp();g.moveTo(17,y);g.lineTo(22,y+0.6);g.moveTo(26,y+0.6);g.lineTo(31,y);strokeC('#a8a8b8',0.4);}});
      if(P.flip){bp();g.moveTo(24,28);g.quadraticCurveTo(28,22,32,26);g.lineTo(24,34);g.closePath();fillC('#ffffff');strokeC('#3a5a8a',0.6);}}
    if(P.prop==='mirror'){bp();g.moveTo(35,20);g.lineTo(34,27);strokeC('#e87aa0',1.6);groupL([{f:()=>ell(36,14,4.5,5.5),c:'#cfe8ff'}],'#b04a78',0.8,()=>{bp();g.moveTo(34,12);g.lineTo(36,10);strokeC('#ffffff',0.8);});}
    g.restore();
  }
  // marks
  for(const m of P.marks){
    if(m==='sweat'){bp();g.moveTo(37,6);g.quadraticCurveTo(35,10,37,11);g.quadraticCurveTo(39,10,37,6);fillC('#bfe4ff');strokeC('#4a78b0',0.5);}
    if(m[0]==='z'&&m!=='z'){const q=+m[1];for(let k=0;k<=q%3;k++){const x=30+k*5,y=20-k*6,s=2+k*0.8;bp();g.moveTo(x,y);g.lineTo(x+s,y);g.lineTo(x,y+s);g.lineTo(x+s,y+s);strokeC('#6a7ac8',0.9);}}
    if(m.startsWith('note')){const q=+m[4];const x=q%2?6:38,y=8+q;bp();ell(x,y+4,1.6,1.2);fillC('#ff6a9a');bp();g.moveTo(x+1.4,y+4);g.lineTo(x+1.4,y-1);g.lineTo(x+3.5,y);strokeC('#ff6a9a',0.8);}
    if(m.startsWith('spark')){const q=+m[5];const pts=[[40,6],[8,10],[42,26],[6,24]];const [x,y]=pts[q];bp();g.moveTo(x,y-3);g.lineTo(x+0.8,y-0.8);g.lineTo(x+3,y);g.lineTo(x+0.8,y+0.8);g.lineTo(x,y+3);g.lineTo(x-0.8,y+0.8);g.lineTo(x-3,y);g.lineTo(x-0.8,y-0.8);g.closePath();fillC('#ffe46a');}
    if(m.startsWith('gloom')){const q=+m[5];for(let k=0;k<4;k++){const x=15+k*6;bp();g.moveTo(x,2+(q+k)%2);g.lineTo(x,7+(q+k)%2);strokeC('#5a5ea0',0.7);}}
    if(m.startsWith('heat')){const q=+m[4];bp();g.moveTo(8,14-q);g.quadraticCurveTo(10,12-q,8,10-q);g.quadraticCurveTo(6,8-q,8,6-q);strokeC('#e85a6a',0.8);bp();g.moveTo(24,17-q);g.quadraticCurveTo(26,15-q,24,13-q);strokeC('#e85a6a',0.8);}
  }
}
const CHIBI_ACTIONS=['study','sport','art','culture','style','rest','play','walk','fail','sick'];
ART.chibiFrames={};CHIBI_ACTIONS.forEach(a=>ART.chibiFrames[a]=4);
const CCACHE=new Map();
function getChibi(a,f){
  const k=a+'|'+f;let c=CCACHE.get(k);if(c)return c;
  const S=6,hi=mk(48*S,48*S);const oSC=SC,oL=LAYER;SC=S;LAYER=mk(hi.width,hi.height).getContext('2d');
  g=hi.getContext('2d');g.setTransform(S,0,0,S,0,0);PAL=new Set(['#000000']);
  chibiDraw(a,f);const pal=PAL;g=null;SC=oSC;LAYER=oL;
  c=quantize(downsample(hi,S),pal,120);CCACHE.set(k,c);return c;
}
ART.chibi=function(ctx,action,frame,x,y){
  if(!ART.chibiFrames[action])action='walk';
  const n=ART.chibiFrames[action];const f=((frame|0)%n+n)%n;const c=getChibi(action,f);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(c,Math.round(x)-24,Math.round(y)-48);ctx.restore();
};

/* ================= icons 16x16 (procedural pixel rules + auto outline) ================= */
const IC={};
const inC=(x,y,cx,cy,r)=>(x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r;
const inR=(x,y,x0,y0,x1,y1)=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
const heartF=(x,y,cx,cy,s)=>{const u=(x-cx)/s,v=-(y-cy)/s+0.15;const q=u*u+v*v-1;return q*q*q-u*u*v*v*v<=0;};
function starF(x,y,cx,cy,R0,r0){let a=Math.atan2(y-cy,x-cx)+Math.PI/2;const d=Math.hypot(x-cx,y-cy);a=((a%(TAU/5))+TAU/5)%(TAU/5);const t=Math.abs(a-TAU/10)/(TAU/10);return d<=r0+(R0-r0)*t*t*0.95+0.2;}
const ICONS={
  study:(x,y)=>{ if(inR(x,y,2,4,7,12)||inR(x,y,8,4,13,12)){if((y===6||y===8||y===10)&&(x>2&&x<7||x>8&&x<13))return '#9aa0b8';return x===7||x===8?'#d8dcec':'#ffffff';} if(inR(x,y,1,12,14,13))return '#3a70d8';
    if(x+y>=16&&x+y<=17&&x>=9&&x<=14&&y<=7&&y>=2)return '#ffd04a'; return null;},
  sport:(x,y)=>{if(!inC(x,y,7.5,7.5,6.6))return null;const d=Math.hypot(x-7.5,y-7.5);const a=Math.atan2(y-7.5,x-7.5);if(d<2.4)return '#2a2238';if(d>4.3&&Math.cos(a*5)>0.55)return '#2a2238';return (x+y>17)?'#c8c8d8':'#ffffff';},
  art:(x,y)=>{if(!(inC(x,y,7.5,8,6.6)&&!inC(x,y,11,11.5,2.2)))return null;if(inC(x,y,4.5,6,1.3))return '#e84a4a';if(inC(x,y,8,4.5,1.3))return '#4a8ae8';if(inC(x,y,4.5,10.5,1.3))return '#58b858';if(inC(x,y,11,6.5,1.3))return '#ffd04a';return '#e8c088';},
  culture:(x,y)=>{if(inR(x,y,3,7,12,12)&&!(y===12&&(x===3||x===12)))return y<9?'#6ab86a':(x>9?'#b0765a':'#d89a78');if(inR(x,y,13,8,14,10)&&!(x===14&&y===9))return '#d89a78';if((y===3||y===5)&&(x===6||x===9))return '#e8e8f0';if(y===4&&(x===7||x===10))return '#e8e8f0';return null;},
  style:(x,y)=>{if(inC(x,y,7,6,4.6))return inC(x,y,6,5,1.6)?'#ffffff':'#a8d8ff';if(inR(x,y,6,11,8,14))return '#ff7aa8';if(inR(x,y,5,10,9,10))return '#ff7aa8';if((x===13&&y>=1&&y<=5)||(y===3&&x>=11&&x<=15))return '#ffe46a';return null;},
  rest:(x,y)=>{if(inC(x,y,7,8,6)&&!inC(x,y,10,5.5,5))return x<5?'#ffe070':'#ffcf40';if((y===2&&x>=11&&x<=14)||(y===5&&x>=11&&x<=14)||(x+y===16&&y>2&&y<5&&x>=11))return '#9ab0ff';return null;},
  play:(x,y)=>{if(!(inR(x,y,2,5,13,11)||inC(x,y,3.5,10,2.4)||inC(x,y,11.5,10,2.4)))return null;if((x===4&&y>=6&&y<=10)||(y===8&&x>=2&&x<=6))return '#2a2238';if(inC(x,y,11.5,7,0.8))return '#e84a4a';if(inC(x,y,10,9,0.8))return '#4a8ae8';return y<7?'#a8a4c8':'#8a86b0';},
  phone:(x,y)=>{if(!inR(x,y,4,1,11,14))return null;if(inR(x,y,5,3,10,11))return (x+y<11)?'#c8f0ff':'#6ac8ff';if(y===13&&x>=7&&x<=8)return '#8a86a0';return '#3a3650';},
  heart:(x,y)=>heartF(x,y,7.5,7.5,6.2)?(inC(x,y,5,5,1.3)?'#ffffff':(x+y>15?'#d02a50':'#ff5a80')):null,
  heart_break:(x,y)=>{if(!heartF(x,y,7.5,7.5,6.2))return null;const cx=7.5+((y%4<2)?(y%2?1:0):(y%2?0:-1));if(Math.abs(x-cx)<0.9&&y>2)return null;return x<cx?'#a8a0b8':'#8a8298';},
  bomb:(x,y)=>{if(inC(x,y,7,9.5,5.3))return inC(x,y,5,7.5,1.5)?'#8a86a0':'#3a3650';if(inR(x,y,9,3,11,4))return '#6a6680';if((x===11&&y===2)||(x===12&&y===1))return '#c8a878';return null;},
  bomb_lit:(x,y)=>{if(inC(x,y,7,9.5,5.3))return inC(x,y,5,7.5,1.5)?'#ff8a6a':'#3a3650';if(inR(x,y,9,3,11,4))return '#6a6680';if(inC(x,y,12.5,1.8,1.8))return inC(x,y,12.5,1.8,0.8)?'#ffffff':'#ffd04a';return null;},
  star:(x,y)=>starF(x+0.5,y+0.5,8,8.6,7.6,3.3)?(x+y<13?'#fff4a0':'#ffd04a'):null,
  note:(x,y)=>{if(inC(x,y,4.5,12,2.4)||inC(x,y,11.5,10,2.4))return '#b05ae8';if((x===6&&y>=3&&y<=12)||(x===13&&y>=1&&y<=10))return '#b05ae8';if(inR(x,y,6,2,13,4)&&(y-2)<=((13-x)*0+2))return '#b05ae8';return null;},
  calendar:(x,y)=>{if(!inR(x,y,1,2,14,14))return null;if(y<=5)return '#e84a4a';if((x===4||x===11)&&y<=3)return '#3a3650';if(inR(x,y,3,7,12,13)&&(x%3===0)&&(y%3===1))return '#8a86a0';if(inR(x,y,9,10,10,11))return '#e84a4a';return '#ffffff';},
  gear:(x,y)=>{const d=Math.hypot(x-7.5,y-7.5),a=Math.atan2(y-7.5,x-7.5);const R0=Math.cos(a*8)>0.2?6.8:5.2;if(d>R0||d<2)return null;return x+y<14?'#c8ccd8':'#9aa0b0';},
  save:(x,y)=>{if(!inR(x,y,1,1,14,14)||(x===14&&y===1))return null;if(inR(x,y,4,1,11,5))return x===9||x===10?'#3a3650':'#e8e8f0';if(inR(x,y,3,8,12,14))return '#ffffff';return '#4a6ad8';},
  sun:(x,y)=>{const d=Math.hypot(x-7.5,y-7.5),a=Math.atan2(y-7.5,x-7.5);if(d<=4.3)return x+y<13?'#fff4a0':'#ffc030';if(d>5.6&&d<7.6&&Math.cos(a*8)>0.6)return '#ffb020';return null;},
  cloud:(x,y)=>(inC(x,y,5,9,3.4)||inC(x,y,9,7,4)||inC(x,y,12,10,2.8)||inR(x,y,4,10,12,12))&&y<=12?(y>10?'#c8d4e8':'#ffffff'):null,
  rain:(x,y)=>{if((inC(x,y,5,6,3)||inC(x,y,9,5,3.6)||inC(x,y,12,7,2.4)||inR(x,y,4,7,12,9))&&y<=9)return y>7?'#8a9ab8':'#b8c4dc';if(y>=11&&(x===4||x===8||x===12)&&y<=13)return '#4a8ae8';if(y===14&&(x===3||x===7||x===11))return '#4a8ae8';return null;},
  health:(x,y)=>{if(!heartF(x,y,7.5,7.5,6.2))return null;if((inR(x,y,6,4,9,11)||inR(x,y,4,6,11,9)))return '#ffffff';return x+y>15?'#2aa058':'#4ad07a';},
  stress:(x,y)=>{const cx=7.5,cy=7.5;for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const px=cx+sx*1.5,py=cy+sy*1.5;const lx=(x-px)*sx,ly=(y-py)*sy;if((lx>=0&&lx<=5&&ly>=0&&ly<=1.2)||(ly>=0&&ly<=5&&lx>=0&&lx<=1.2))return '#e8384a';}return null;},
};
function buildIcon(id){
  const fn=ICONS[id]||ICONS.star;const cv=mk(16,16),x=cv.getContext('2d');const grid=[];
  for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++)grid.push(fn(xx,yy));
  const at=(xx,yy)=>xx<0||yy<0||xx>15||yy>15?null:grid[yy*16+xx];
  for(let yy=0;yy<16;yy++)for(let xx=0;xx<16;xx++){const c=at(xx,yy);if(c){x.fillStyle=c;x.fillRect(xx,yy,1,1);}
    else if(at(xx-1,yy)||at(xx+1,yy)||at(xx,yy-1)||at(xx,yy+1)){x.fillStyle='#2a2238';x.fillRect(xx,yy,1,1);}}
  return cv;
}
ART.icons=Object.keys(ICONS);
ART.icon=function(ctx,id,x,y,size){size=size||16;if(!IC[id])IC[id]=buildIcon(id);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(IC[id],Math.round(x),Math.round(y),size,size);ctx.restore();};

ART.player={name:'春野 ひなた'};
ART.init=function(){
  for(const id of Object.keys(CHARS)){getPortrait(id,'normal',false);}
  for(const id of ART.icons)if(!IC[id])IC[id]=buildIcon(id);
  getBG('title');
};
ART.preload=function(){ // optional heavier warmup
  for(const id of Object.keys(CHARS))for(const e of ART.exprs){getPortrait(id,e,false);}
  for(const id of ART.bgs)getBG(id);
};
})();
