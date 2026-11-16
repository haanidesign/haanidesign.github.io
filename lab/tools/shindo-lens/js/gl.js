/* 絵を つくる ところ（WebGL2）。
   1. 色づくり … 色調・霧・ライト・切り抜き を 1回で
   2. ぼかし   … 深度から ぼけの 大きさを 出して まわりを 集める
   3. しあげ   … 立体の ずらし・深度マップの 色づけ・元画像 */

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

const HEAD = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uImg, uDep;
uniform vec2 uSize;
float dep(vec2 t){ return texture(uDep, t).r; }
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
`;

const GRADE = HEAD + `
uniform int uToneOn, uToneMode; uniform float uSplit, uSoft, uToneAmt, uPop; uniform vec3 uToneCol;
uniform int uFogOn; uniform vec3 uFogCol; uniform float uFogDens, uFogStart, uFogLow, uFogGlow;
uniform int uLightOn, uN, uShadow; uniform vec3 uLP[4]; uniform vec3 uLC[4]; uniform float uLI[4], uLR[4];
uniform float uAmb, uBump;
uniform int uCutOn, uCutBg; uniform float uCutNear, uCutFar, uCutSoft; uniform vec3 uCutCol;

float shade(vec2 t, float d, vec3 L){
  /* 光へ むかって 深度の 上を すすみ、手前の ものに さえぎられたら 影 */
  float s = 1.;
  for (int k = 1; k <= 24; k++){
    float f = float(k) / 25.;
    vec2 q = mix(t, L.xy, f);
    float rz = mix(d, L.z, f);
    float h = dep(q);
    s = min(s, 1. - smoothstep(.015, .07, h - rz) * (1. - f * .6));
  }
  return s;
}

void main(){
  vec4 src = texture(uImg, uv);
  vec3 c = src.rgb;
  float d = dep(uv);
  vec2 asp = vec2(uSize.x / uSize.y, 1.);

  /* 色調: 奥だけ 色を ぬく */
  if (uToneOn == 1){
    float bg = 1. - smoothstep(uSplit - uSoft, uSplit + uSoft, d);
    float l = luma(c);
    vec3 t = vec3(l);
    if (uToneMode == 1) t = l * vec3(1.07, .93, .74) + vec3(.03, .01, 0.);
    if (uToneMode == 2) t = mix(vec3(l), l * uToneCol * 1.6, .75);
    if (uToneMode == 3) t = c * .45;
    c = mix(c, t, bg * uToneAmt);
    float fg = 1. - bg;
    c = mix(vec3(luma(c)), c, 1. + uPop * fg);
  }

  /* ライト */
  if (uLightOn == 1){
    float e = 2.5 / uSize.y;
    float dx = dep(uv + vec2(e * uSize.y / uSize.x, 0.)) - dep(uv - vec2(e * uSize.y / uSize.x, 0.));
    float dy = dep(uv + vec2(0., e)) - dep(uv - vec2(0., e));
    vec3 n = normalize(vec3(-dx * uBump * 60., -dy * uBump * 60., 1.));
    vec3 add = vec3(0.), glow = vec3(0.);
    for (int i = 0; i < 4; i++){
      if (i >= uN) break;
      vec3 L = uLP[i];
      vec3 v = vec3((L.xy - uv) * asp, (L.z - d) * .6);
      float dist = length(v);
      vec3 ld = v / max(dist, 1e-4);
      float lam = clamp((dot(n, ld) + .35) / 1.35, 0., 1.);
      float r = uLR[i];
      float att = 1. / (1. + pow(dist / r, 2.) * 6.);
      att *= smoothstep(r * 1.6, r * .2, dist) * .85 + .15 * smoothstep(r * 2.5, 0., dist);
      float sh = uShadow == 1 ? shade(uv, d, L) : 1.;
      add += uLC[i] * uLI[i] * lam * att * sh;
      float g = length((L.xy - uv) * asp);
      glow += uLC[i] * uLI[i] * exp(-g * g / (r * r * .02)) * .35;
    }
    c = c * (1. - uAmb) + c * add * 1.5 + glow * (1. - c * .5);
  }

  /* 霧: 奥ほど こく、下ほど たまる */
  if (uFogOn == 1){
    float far = 1. - d;
    float f = smoothstep(uFogStart, 1., far);
    f *= mix(1., smoothstep(1.05, .2, uv.y), uFogLow);   // uv.y は 下が 0
    f = clamp(f * uFogDens * 1.25, 0., 1.);
    vec3 fc = uFogCol + uFogGlow * vec3(.25, .2, .12) * (1. - smoothstep(0., .9, length((uv - vec2(.5, .8)) * asp)));
    c = mix(c, fc, f);
  }

  float a = src.a;
  if (uCutOn == 1){
    float m = smoothstep(uCutFar - uCutSoft, uCutFar + uCutSoft, d) * (1. - smoothstep(uCutNear - uCutSoft, uCutNear + uCutSoft, d));
    if (uCutBg == 0) a *= m;
    else c = mix(uCutCol, c, m);
  }
  o = vec4(clamp(c, 0., 1.), a);
}`;

const BLUR = HEAD + `
uniform sampler2D uSrc;
uniform int uOn, uFront; uniform float uFocus, uRange, uMax;
float coc(float d){
  if (uFront == 0 && d > uFocus) return 0.;
  return clamp((abs(d - uFocus) - uRange) / .28, 0., 1.) * uMax;
}
void main(){
  vec4 c0 = texture(uSrc, uv);
  if (uOn == 0 || uMax < .5){ o = c0; return; }
  float d0 = dep(uv);
  float r0 = coc(d0);
  vec4 acc = vec4(c0.rgb * c0.a, c0.a); float w = 1.;
  vec2 px = 1. / uSize;
  const int N = 72;
  for (int i = 0; i < N; i++){
    float f = (float(i) + .5) / float(N);
    float rr = sqrt(f) * uMax;
    float an = float(i) * 2.39996;
    vec2 off = vec2(cos(an), sin(an)) * rr;
    vec2 t = uv + off * px;
    float ds = dep(t);
    float rs = coc(ds);
    if (ds < d0) rs = min(rs, r0 + 1.);           // 奥の ぼけは 手前の くっきりに しみ出さない
    float k = smoothstep(rr - 1.5, rr + .5, rs);
    vec4 s = texture(uSrc, t);
    acc += vec4(s.rgb * s.a, s.a) * k; w += k;
  }
  acc /= w;
  o = vec4(acc.a > 0. ? acc.rgb / acc.a : vec3(0.), acc.a);
}`;

const FINAL = HEAD + `
uniform sampler2D uSrc;
uniform int uMode, uChk; uniform vec2 uOff; uniform float uPivot;
void main(){
  vec2 t = uv;
  if (uOff.x != 0. || uOff.y != 0.){
    for (int i = 0; i < 5; i++) t = uv - uOff * (dep(t) - uPivot);
    t = clamp(t, vec2(.5) / uSize, 1. - vec2(.5) / uSize);
  }
  vec4 c;
  if (uMode == 1){
    float d = dep(t);
    vec3 a = vec3(.11, .14, .56), b = vec3(.52, .53, .64), e = vec3(1., .72, .12);
    c = vec4(d < .5 ? mix(a, b, d * 2.) : mix(b, e, d * 2. - 1.), 1.);
  } else if (uMode == 2) c = texture(uImg, t);
  else c = texture(uSrc, t);
  if (uChk == 1){
    vec2 g = floor(gl_FragCoord.xy / 12.);
    vec3 k = mod(g.x + g.y, 2.) < 1. ? vec3(.98, .98, .93) : vec3(.88, .87, .8);
    c = vec4(mix(k, c.rgb, c.a), 1.);
  }
  o = c;
}`;

export function makeGL(canvas) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
  if (!gl) throw new Error('WebGL2 が つかえません');
  const prog = (fs) => {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {}; return { p, u: n => (n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(p, n))) };
  };
  const P = { g: prog(GRADE), b: prog(BLUR), f: prog(FINAL) };
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const tex = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const tImg = tex(), tDep = tex();
  let W = 1, H = 1, fbs = [];
  const mkFb = () => {
    const t = tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f };
  };

  function setImage(src) {
    W = src.width; H = src.height; canvas.width = W; canvas.height = H;
    gl.bindTexture(gl.TEXTURE_2D, tImg);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    fbs.forEach(x => { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); });
    fbs = [mkFb(), mkFb()];
  }
  function setDepth(src) {
    gl.bindTexture(gl.TEXTURE_2D, tDep);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  /* R: 描くための 値（app.js が S から 作る） */
  function draw(R) {
    gl.viewport(0, 0, W, H);
    const bind = (pr, extra) => {
      gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg); gl.uniform1i(pr.u('uImg'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tDep); gl.uniform1i(pr.u('uDep'), 1);
      if (extra) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, extra); gl.uniform1i(pr.u('uSrc'), 2); }
      gl.uniform2f(pr.u('uSize'), W, H);
    };
    const i1 = (pr, n, v) => gl.uniform1i(pr.u(n), v | 0), f1 = (pr, n, v) => gl.uniform1f(pr.u(n), v);

    // 1 色づくり
    let g = P.g; gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[0].f); bind(g);
    i1(g, 'uToneOn', R.tone.on); i1(g, 'uToneMode', R.tone.mode); f1(g, 'uSplit', R.tone.split);
    f1(g, 'uSoft', R.tone.soft); f1(g, 'uToneAmt', R.tone.amt); f1(g, 'uPop', R.tone.pop);
    gl.uniform3fv(g.u('uToneCol'), hex(R.tone.col));
    i1(g, 'uFogOn', R.fog.on); gl.uniform3fv(g.u('uFogCol'), hex(R.fog.col)); f1(g, 'uFogDens', R.fog.dens);
    f1(g, 'uFogStart', R.fog.start); f1(g, 'uFogLow', R.fog.low); f1(g, 'uFogGlow', R.fog.glow);
    const L = R.light.list.slice(0, 4);
    i1(g, 'uLightOn', R.light.on && L.length); i1(g, 'uN', L.length); i1(g, 'uShadow', R.light.shadow);
    const lp = new Float32Array(12), lc = new Float32Array(12), li = new Float32Array(4), lr = new Float32Array(4);
    L.forEach((l, k) => { lp.set([l.x, 1 - l.y, l.z], k * 3); lc.set(hex(l.col), k * 3); li[k] = l.i; lr[k] = l.r; });
    gl.uniform3fv(g.u('uLP[0]'), lp); gl.uniform3fv(g.u('uLC[0]'), lc);
    gl.uniform1fv(g.u('uLI[0]'), li); gl.uniform1fv(g.u('uLR[0]'), lr);
    f1(g, 'uAmb', R.light.amb); f1(g, 'uBump', R.light.bump);
    i1(g, 'uCutOn', R.cut.on); i1(g, 'uCutBg', R.cut.bg); f1(g, 'uCutNear', R.cut.near); f1(g, 'uCutFar', R.cut.far);
    f1(g, 'uCutSoft', R.cut.soft); gl.uniform3fv(g.u('uCutCol'), hex(R.cut.col));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2 ぼかし
    const b = P.b; gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[1].f); bind(b, fbs[0].t);
    i1(b, 'uOn', R.blur.on); i1(b, 'uFront', R.blur.front); f1(b, 'uFocus', R.blur.focus);
    f1(b, 'uRange', R.blur.range); f1(b, 'uMax', R.blur.max);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3 しあげ
    const f = P.f; gl.bindFramebuffer(gl.FRAMEBUFFER, null); bind(f, fbs[1].t);
    i1(f, 'uMode', R.mode); i1(f, 'uChk', R.chk); gl.uniform2f(f.u('uOff'), R.off[0], R.off[1]); f1(f, 'uPivot', R.pivot);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  return { setImage, setDepth, draw, size: () => [W, H] };
}
