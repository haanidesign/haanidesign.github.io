/* 音に合わせる: 曲の拍を見つけて、拍ごとにうなずく・はねる・ゆれる。
   拍の見つけ方: 音の大きさが急に上がったところ(低い音を重く)を並べ、
   その並びがいちばんよくそろう間隔と出だしを探す。 */
"use strict";
(()=>{
const O = {buf:null, ctx:null, src:null, startAt:0, playing:false, exportT:-1,
           per:0.5, t0:0, loud:null, hop:0.01, bpm:0};

/* ---- 拍をさがす ---- */
function analyze(buf){
  const sr = buf.sampleRate, hopS = Math.round(sr / 100);
  const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const n = Math.floor(buf.length / hopS);
  const en = new Float32Array(n), bs = new Float32Array(n);
  const k = Math.exp(-2*Math.PI*150/sr);
  let lp = 0;
  for(let i=0;i<n;i++){
    let s = 0, sb = 0;
    for(let j=i*hopS, e=j+hopS; j<e; j++){
      const x = (a[j] + b[j]) * 0.5;
      lp = lp*k + x*(1-k);
      s += x*x; sb += lp*lp;
    }
    en[i] = Math.log1p(100*Math.sqrt(s/hopS)); bs[i] = Math.log1p(300*Math.sqrt(sb/hopS));
  }
  const on = new Float32Array(n);
  for(let i=1;i<n;i++) on[i] = Math.max(0, en[i]-en[i-1]) + 1.5*Math.max(0, bs[i]-bs[i-1]);
  // まわりの平均を引いて、ずっと大きいところを消す
  const out = new Float32Array(n); let acc = 0; const W = 10;
  for(let i=0;i<n;i++){ acc += on[i]; if(i >= W) acc -= on[i-W]; out[i] = Math.max(0, on[i] - acc/Math.min(i+1, W)); }

  // 間隔の候補(70〜180 BPM)。120 あたりを少しひいきする
  const lo = Math.round(6000/180), hi = Math.round(6000/70);
  let bestL = 50, bestS = -1;
  const m = Math.min(n, 100*90);
  for(let L=lo; L<=hi; L++){
    let s = 0; for(let i=0;i+L<m;i++) s += out[i]*out[i+L];
    const w = Math.exp(-0.5 * (Math.log2(L/50)/0.9)**2);
    s *= w;
    if(s > bestS){ bestS = s; bestL = L; }
  }
  // 細かく合わせる: 間隔と出だしを動かして、拍の上の強さの合計がいちばん大きいところ
  let best = {p:bestL, ph:0, s:-1};
  for(let p=bestL-1; p<=bestL+1; p+=0.02){
    for(let ph=0; ph<p; ph+=1){
      let s = 0; for(let x=ph; x<n; x+=p) s += out[Math.round(x)] || 0;
      if(s > best.s) best = {p, ph, s};
    }
  }
  // 大きさ(0..1): 0.5 秒ならして、上のほう 5% を 1 にする
  const ld = new Float32Array(n); let sm = 0;
  for(let i=0;i<n;i++){ sm += (en[i]-sm)*0.05; ld[i] = sm; }
  const sorted = Float32Array.from(ld).sort(), top = sorted[Math.floor(n*0.95)] || 1, bot = sorted[Math.floor(n*0.1)] || 0;
  for(let i=0;i<n;i++) ld[i] = Math.max(0, Math.min(1, (ld[i]-bot)/Math.max(1e-4, top-bot)));
  O.per = best.p / 100; O.t0 = best.ph / 100; O.loud = ld; O.bpm = 6000 / best.p;
}

/* ---- 拍で動く ---- */
const shapes = {
  nod(f, n, A){ const k = f < 0.12 ? sstep(0, 0.12, f) : 1 - sstep(0.12, 0.7, f);
    return {hy: 0.2*A*k, hz: 0.05*A*Math.sin(Math.PI*(n+f)), bob: psdH*0.004*A*k}; },
  hop(f, n, A){ const up = Math.sin(Math.PI*f);
    return {bob: -psdH*0.022*A*up*up, hy: -0.06*A*up + 0.08*A*Math.max(0, 1 - f/0.15), tilt: 0.04*A*Math.sin(Math.PI*(n+f))}; },
  sway(f, n, A){ const s = Math.sin(Math.PI*(n+f));
    return {hz: 0.26*A*s, tilt: 0.16*A*s, hx: 0.1*A*s, gx: -0.25*A*s, hy: 0.05*A*(1 - sstep(0, 0.4, f))}; },
};
const MIX = ["nod", "sway", "hop", "sway"];
function pose(t){
  const A = (+$("otoAmp").value || 1) * (0.55 + 0.45*(O.loud ? O.loud[Math.min(O.loud.length-1, Math.max(0, Math.floor(t*100)))] : 1));
  const bt = (t - O.t0) / O.per, n = Math.floor(bt), f = bt - n;
  const style = $("otoStyle").value;
  const o = {hx:0, hy:0, hz:0, tilt:0, gx:0, bob:0};
  const add = (sh, w)=>{ const r = shapes[sh](f, n, A); for(const k in r) o[k] += r[k]*w; };
  if(style !== "mix") add(style, 1);
  else {
    // 4 小節(16 拍)ごとに ノリ方を かえる。かわり目は 1 拍かけて まぜる
    const sec = Math.floor(n/16), into = (n % 16 + 16) % 16 + f;
    const cur = MIX[((sec % 4) + 4) % 4], prev = MIX[(((sec-1) % 4) + 4) % 4];
    const w = sstep(0, 1, into);
    if(w < 1 && prev !== cur) add(prev, 1 - w);
    add(cur, prev === cur ? 1 : w);
    add("nod", 0.3);
  }
  const fade = sstep(0, 0.6, t);   // 始めは そっと
  for(const k in o) o[k] *= fade;
  return o;
}
const prevHook = poseHook;
poseHook = function(t, dt, loop){
  if(O.exportT >= 0) return pose(O.exportT);
  if(O.playing && O.ctx) return pose(O.ctx.currentTime - O.startAt);
  return prevHook ? prevHook(t, dt, loop) : null;
};

/* ---- 読みこみ・再生 ---- */
const fmtT = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
$("otoLoad").onclick = ()=> $("otoFile").click();
$("otoFile").onchange = async e=>{
  const f = e.target.files[0]; e.target.value = "";
  if(!f) return;
  stop();
  $("otoInfo").textContent = "曲を読んでいます…";
  try{
    O.ctx = O.ctx || new AudioContext();
    O.buf = await O.ctx.decodeAudioData(await f.arrayBuffer());
    $("otoInfo").textContent = "拍をさがしています…";
    await new Promise(r=> setTimeout(r, 20));
    analyze(O.buf);
    O.name = f.name.replace(/\.[^.]+$/, "");
    $("otoInfo").textContent = `${f.name}・${fmtT(O.buf.duration)}・テンポ ${Math.round(O.bpm)} くらい`;
    $("otoPlay").disabled = false; $("otoRec").disabled = false;
  }catch(err){
    $("otoInfo").textContent = "この曲は読めませんでした。mp3・wav・m4a などを使ってください。";
  }
};
function stop(){
  if(O.src){ try{ O.src.onended = null; O.src.stop(); }catch(e){} O.src = null; }
  O.playing = false;
  $("otoPlay").textContent = "▶ 流す";
}
$("otoPlay").onclick = async ()=>{
  if(O.playing){ stop(); return; }
  if(!O.buf) return;
  await O.ctx.resume();
  const src = O.ctx.createBufferSource(); src.buffer = O.buf; src.connect(O.ctx.destination);
  src.onended = stop;
  O.startAt = O.ctx.currentTime + 0.05; src.start(O.startAt);
  O.src = src; O.playing = true;
  $("otoPlay").textContent = "■ 止める";
};

/* ---- 書き出し ---- */
async function pickCodec(w, h, fps){
  if(typeof VideoEncoder === "undefined" || !window.Mp4Muxer) return null;
  for(const codec of ["avc1.640034","avc1.640028","avc1.4d0028","avc1.42002a","avc1.42001f"]){
    for(const hw of ["no-preference", "prefer-software"]){
      const cfg = {codec, width:w, height:h, bitrate:8e6, framerate:fps, hardwareAcceleration:hw};
      try{ const r = await VideoEncoder.isConfigSupported(cfg); if(r && r.supported) return cfg; }catch(e){}
    }
  }
  return null;
}
async function pickAudio(buf){
  if(typeof AudioEncoder === "undefined") return null;
  for(const [codec, box] of [["mp4a.40.2","aac"], ["opus","opus"]]){
    const cfg = {codec, sampleRate:buf.sampleRate, numberOfChannels:Math.min(2, buf.numberOfChannels), bitrate:160000};
    try{ const r = await AudioEncoder.isConfigSupported(cfg); if(r && r.supported) return {cfg, box}; }catch(e){}
  }
  return null;
}
async function encodeAudio(muxer, cfg, buf, dur){
  let failed = null;
  const enc = new AudioEncoder({output:(c, m)=> muxer.addAudioChunk(c, m), error:e=>{ failed = e; }});
  enc.configure(cfg);
  const rate = cfg.sampleRate, ch = cfg.numberOfChannels, total = Math.min(buf.length, Math.floor(dur*rate));
  const chans = []; for(let c=0;c<ch;c++) chans.push(buf.getChannelData(Math.min(c, buf.numberOfChannels-1)));
  for(let i=0;i<total;i+=4096){
    const n = Math.min(4096, total-i), data = new Float32Array(n*ch);
    for(let c=0;c<ch;c++) data.set(chans[c].subarray(i, i+n), c*n);
    const ad = new AudioData({format:"f32-planar", sampleRate:rate, numberOfFrames:n, numberOfChannels:ch,
      timestamp:Math.round(i/rate*1e6), data});
    enc.encode(ad); ad.close();
    if(enc.encodeQueueSize > 16) await new Promise(r=> setTimeout(r, 4));
    if(failed) break;
  }
  await enc.flush(); enc.close();
  if(failed) throw failed;
}
/* WebM の長さを書き足す(録画だと入らない) */
async function fixWebmDuration(blob, ms){
  const b = new Uint8Array(await blob.arrayBuffer());
  for(let i=0;i<Math.min(b.length-4, 4096);i++){
    if(b[i]===0x15 && b[i+1]===0x49 && b[i+2]===0xA9 && b[i+3]===0x66){
      const szByte = b[i+4]; let len = 1; while(len <= 8 && !(szByte & (0x80 >> (len-1)))) len++;
      let size = szByte & (0xFF >> len); for(let k=1;k<len;k++) size = size*256 + b[i+4+k];
      const start = i+4+len, dur = new Uint8Array(11); dur[0]=0x44; dur[1]=0x89; dur[2]=0x88;
      new DataView(dur.buffer).setFloat64(3, ms);
      const ns = size+11, sz = new Uint8Array(8); sz[0]=0x01; for(let k=7, v=ns; k>=1; k--, v=Math.floor(v/256)) sz[k] = v & 255;
      const out = new Uint8Array(b.length + 11 + 8 - len);
      out.set(b.subarray(0, i+4)); out.set(sz, i+4); out.set(b.subarray(start, start+size), i+12);
      out.set(dur, i+12+size); out.set(b.subarray(start+size), i+23+size);
      return new Blob([out], {type:blob.type});
    }
  }
  return blob;
}

$("otoRec").onclick = async ()=>{
  if(!O.buf || !layers.length){ $("otoInfo").textContent = "絵と曲の両方を読みこんでください。"; return; }
  stop();
  const len = +$("otoLen").value, D = len ? Math.min(len, O.buf.duration) : O.buf.duration;
  const fps = 30, dt = 1/fps, N = Math.ceil(D*fps);
  const s = Math.min(1, 1080 / Math.max(outW(), outH()));
  const w = Math.max(2, Math.round(outW()*s/2)*2), h = Math.max(2, Math.round(outH()*s/2)*2);
  const bgv = $("otoBg").value, bg = bgv === "cur" ? (currentBg() || "#FFFFFF") : bgv;
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const og = out.getContext("2d");
  const paint = ()=>{ og.fillStyle = bg; og.fillRect(0,0,w,h); og.drawImage(cv, crop.on ? crop.x : 0, crop.on ? crop.y : 0, outW(), outH(), 0, 0, w, h); };

  const savedT = {...T};
  TOGGLES.filter(t=>t.live).forEach(t=> T[t.id] = false);
  syncChips();
  exporting = true;
  $("otoRec").disabled = true; $("recbar").classList.add("on");
  const info = $("otoInfo");
  try{
    resetSprings();
    const vcfg = await pickCodec(w, h, fps);
    if(vcfg){
      const a = await pickAudio(O.buf);
      const muxer = new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),
        video:{codec:"avc", width:w, height:h, frameRate:fps},
        ...(a ? {audio:{codec:a.box, numberOfChannels:a.cfg.numberOfChannels, sampleRate:a.cfg.sampleRate}} : {}),
        fastStart:"in-memory"});
      let failed = null;
      const enc = new VideoEncoder({output:(c, m)=> muxer.addVideoChunk(c, m), error:e=>{ failed = e; }});
      enc.configure(vcfg);
      for(let i=0;i<N;i++){
        if(failed) throw failed;
        O.exportT = i*dt;
        draw(step(i*dt, dt, false)); paint();
        const fr = new VideoFrame(out, {timestamp:Math.round(i*1e6/fps), duration:Math.round(1e6/fps)});
        enc.encode(fr, {keyFrame: i % (fps*2) === 0}); fr.close();
        if(enc.encodeQueueSize > 8) while(enc.encodeQueueSize > 4) await new Promise(r=> setTimeout(r, 4));
        if(i % 10 === 0){ $("recinfo").textContent = info.textContent = `書き出し中… ${Math.round(i/N*100)}%`; await new Promise(r=> setTimeout(r, 0)); }
      }
      await enc.flush(); enc.close();
      if(failed) throw failed;
      if(a){ info.textContent = "音を入れています…"; await encodeAudio(muxer, a.cfg, O.buf, D); }
      muxer.finalize();
      save(new Blob([muxer.target.buffer], {type:"video/mp4"}), (O.name || "avatar") + "_odori.mp4");
      info.textContent = `MP4 を保存しました(${w}×${h}・${fmtT(D)}${a ? "" : "・このブラウザでは音を入れられませんでした"})。`;
    } else {
      // VideoEncoder が無いとき(タブレットから LAN の http で開いたときなど): 流しながら録る
      const mime = ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(m=> window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if(!mime) throw new Error("このブラウザは動画の書き出しに対応していません。");
      await O.ctx.resume();
      const dest = O.ctx.createMediaStreamDestination();
      const src = O.ctx.createBufferSource(); src.buffer = O.buf; src.connect(dest); src.connect(O.ctx.destination);
      const vs = out.captureStream(fps);
      const rec = new MediaRecorder(new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]), {mimeType:mime, videoBitsPerSecond:6e6});
      const chunks = []; rec.ondataavailable = e=>{ if(e.data.size) chunks.push(e.data); };
      const done = new Promise(r=> rec.onstop = r);
      rec.start(); const t0 = O.ctx.currentTime; src.start(t0);
      let prev = 0;
      while(true){
        const t = O.ctx.currentTime - t0;
        if(t >= D) break;
        O.exportT = t;
        draw(step(t, Math.max(1/120, Math.min(0.1, t - prev)), false)); paint(); prev = t;
        $("recinfo").textContent = info.textContent = `録っています… ${fmtT(t)} / ${fmtT(D)}`;
        await new Promise(r=> requestAnimationFrame(r));
      }
      src.stop(); rec.stop(); await done;
      save(await fixWebmDuration(new Blob(chunks, {type:mime}), D*1000), (O.name || "avatar") + "_odori.webm");
      info.textContent = `WebM を保存しました(${w}×${h}・${fmtT(D)})。`;
    }
  }catch(err){
    info.textContent = "書き出せませんでした: " + (err.message || err);
  }finally{
    O.exportT = -1;
    exporting = false;
    $("otoRec").disabled = false; $("recbar").classList.remove("on");
    Object.assign(T, savedT); syncChips();
    resetSprings(); last = performance.now();
  }
};
})();
