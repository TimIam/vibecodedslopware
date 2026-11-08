// One file, no dependencies, plain WebGL2. Built from tools/savers/ + <folder>/src/scene.js by tools/build-savers.mjs.
//
// URL hash (key=value joined with &):
//   host=saver|app|config   running inside a screensaver host
//   views=x,y,w,h;...       monitor rectangles inside the canvas, in canvas pixels
//   primary=i               which of those views gets the controls
//   screens=x,y,w,h;...     monitors in screen coordinates, for one browser window stretched across them
//   pane=1&cid=..&wx&ww&wh  a window this page opened on another monitor
//   embed                   just the scene: no controls, no input
//
// One continuous world: monitors sit side by side, left to right, tops aligned.
const hash = {};
for (const kv of location.hash.slice(1).split('&')) { if (!kv) continue; const i = kv.indexOf('='); if (i < 0) hash[kv] = '1'; else hash[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); }
const HOST = hash.host || '', IS_PANE = !!hash.pane, EMBED = !!hash.embed, LEADER = !IS_PANE;
const hostPost = (m) => { try { window.chrome.webview.postMessage(m); } catch (e) { if (m === 'exit') window.close(); } };
if (HOST) document.body.classList.add('host');
if (HOST === 'saver') document.body.classList.add('saver');
if (IS_PANE) document.body.classList.add('pane');
if (EMBED) document.body.classList.add('embed');

const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
if (!gl) { document.getElementById('fade').textContent = 'This needs WebGL2'; throw new Error('no webgl2'); }
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
const FLOAT_RT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('OES_texture_float_linear');

const TAU = Math.PI * 2, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
function mulberry(seed) { let a = seed >>> 0; return (x, y) => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296; return x === undefined ? r : y === undefined ? r * x : x + r * (y - x); }; }

const S = {};
let views = [], W = 0, H = 0, unit = 1080, primaryView = 0, multi = null, SEED = +(hash.seed || 0) || (Math.random() * 1e9) | 0;
const parseRects = (t) => t.split(';').map(s => s.split(',').map(Number)).filter(r => r.length === 4 && r[2] > 0 && r[3] > 0);
const screenRects = hash.screens ? parseRects(hash.screens) : null, hostRects = hash.views ? parseRects(hash.views) : null;
function layout() {
  let cw, ch, useRects = hostRects;
  if (screenRects && screenRects.length) {
    const edge = (outerWidth - innerWidth) / 2, ox = screenX + edge, oy = screenY + (outerHeight - innerHeight) - edge;
    useRects = screenRects.map(r => [r[0] - ox, r[1] - oy, r[2], r[3]]);
  }
  if (useRects && useRects.length) {
    const rects = useRects.map((r, i) => ({ r, i })).sort((a, b) => a.r[0] - b.r[0]);
    if (screenRects) { cw = Math.round(innerWidth); ch = Math.round(innerHeight); }
    else { cw = Math.max(...useRects.map(r => r[0] + r[2])); ch = Math.max(...useRects.map(r => r[1] + r[3])); }
    let wx = 0; views = [];
    for (const { r, i } of rects) { views.push({ cx: r[0], cy: r[1], cw: r[2], ch: r[3], wx, ww: r[2], wh: r[3], src: i }); wx += r[2]; }
    W = wx; H = Math.max(...useRects.map(r => r[3]));
    primaryView = Math.max(0, views.findIndex(v => v.src === (+hash.primary || 0)));
  } else {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = Math.round(innerWidth * dpr); ch = Math.round(innerHeight * dpr);
    if (IS_PANE) { views = [{ cx: 0, cy: 0, cw, ch, wx: +hash.wx, ww: +hash.ww, wh: +hash.wh }]; W = +hash.W || (+hash.ww + +hash.wx); H = +hash.H || +hash.wh; }
    else if (multi) { views = [{ cx: 0, cy: 0, cw, ch, wx: multi.wx, ww: multi.ww, wh: multi.wh, all: multi.list }]; W = multi.W; H = multi.H; }
    else { views = [{ cx: 0, cy: 0, cw, ch, wx: 0, ww: cw, wh: ch }]; W = cw; H = ch; }
    primaryView = 0;
  }
  canvas.width = cw; canvas.height = ch;
  unit = Math.min(...(multi ? multi.list.map(l => l.h) : views.map(v => v.wh)));
  const cssK = cw / (canvas.clientWidth || cw), p = views[primaryView] || views[0], hud = document.getElementById('hud');
  hud.style.left = (p.cx / cssK) + 'px'; hud.style.top = (p.cy / cssK) + 'px'; hud.style.width = (p.cw / cssK) + 'px'; hud.style.height = ((p.ch / cssK) - (screenRects ? Math.max(48, screen.height - screen.availHeight) : 0)) + 'px';
}
// the monitors as the scene should lay itself out: every monitor, even ones another window is drawing
const monitors = () => multi ? multi.list.map(l => ({ wx: l.wx, ww: l.w, wh: l.h })) : IS_PANE && hash.mons ? parseRects(hash.mons).map(r => ({ wx: r[0], ww: r[1], wh: r[2] })) : views.map(v => ({ wx: v.wx, ww: v.ww, wh: v.wh }));

function program(vs, fs) {
  const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join('\n')); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
const NOISE = `
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h12(vec2 p){vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
vec2 h22(vec2 p){vec3 a=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));a+=dot(a,a.yzx+33.33);return fract((a.xx+a.yz)*a.zy);}
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n3(p);p=p*2.03+vec3(17.1,9.2,4.7);a*=.5;}return s;}
vec2 voro(vec2 p){vec2 ip=floor(p),fp=fract(p);float f1=9.,f2=9.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j),r=g+h22(ip+g)-fp;float d=dot(r,r);if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}return vec2(sqrt(f1),sqrt(f2));}
`;
const FS_TRI = HEAD + 'const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));void main(){gl_Position=vec4(P[gl_VertexID],0,1);}';
// World-space fullscreen quad. uView = (wx, ww, wh): vW is the world pixel under the fragment (y down).
const QUAD_VS = HEAD + `uniform vec4 uView;out vec2 vW;const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));void main(){vec2 c=P[gl_VertexID];vW=vec2(uView.x+(c.x*.5+.5)*uView.y,(1.-(c.y*.5+.5))*uView.z);gl_Position=vec4(c,.9999,1);}`;
// Vertex-shader helper: world pixel to clip space.
const W2C = `vec4 w2c(vec2 w,float z,vec4 v){return vec4((w.x-v.x)/v.y*2.-1.,1.-w.y/v.z*2.,z,1.);}`;
const emptyVAO = gl.createVertexArray();
const tri = () => { gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); };

function makeRT(w, h, opts = {}) {
  const { float = false, filter = gl.LINEAR, mips = false, attachments = 1 } = opts;
  const useF = float && FLOAT_RT, ifmt = useF ? gl.RGBA16F : gl.RGBA8, type = useF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, tex = [], f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  for (let i = 0; i < attachments; i++) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); tex.push(t);
  }
  gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex: tex[0], texs: tex, fb: f, w, h, free() { gl.deleteFramebuffer(f); tex.forEach(t => gl.deleteTexture(t)); } };
}
const bindTex = (unitI, t, loc) => { gl.activeTexture(gl.TEXTURE0 + unitI); gl.bindTexture(gl.TEXTURE_2D, t); if (loc) gl.uniform1i(loc, unitI); };

// Progressive baking. Jobs run a slice per frame, so a slow GPU never hangs. Budget is in pixels.
let bakeQ = [], baked = false, bakeBudget = 1400000;
function bakeTiles(rt, opts) {
  // opts: { tile, passes, cost, begin(pass), blend, x,y,w,h }
  const tile = opts.tile || 128, passes = opts.passes || 1, cost = opts.cost || 1, x0 = opts.x || 0, y0 = opts.y || 0, w = opts.w || rt.w, h = opts.h || rt.h;
  let pass = 0, tx = 0, ty = 0;
  bakeQ.push((budget) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb); gl.viewport(0, 0, rt.w, rt.h); gl.enable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST); if (opts.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, opts.premult ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); } else gl.disable(gl.BLEND);
    opts.begin(pass); gl.bindVertexArray(emptyVAO); let spent = 0;
    while (spent < budget) {
      const tw = Math.min(tile, w - tx), th = Math.min(tile, h - ty);
      gl.scissor(x0 + tx, y0 + ty, tw, th); gl.drawArrays(gl.TRIANGLES, 0, 3); spent += tw * th * cost;
      tx += tile; if (tx >= w) { tx = 0; ty += tile; if (ty >= h) { ty = 0; pass++; if (pass >= passes) break; opts.begin(pass); } }
    }
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { done: pass >= passes, spent };
  });
}
const bakeStep = (fn) => bakeQ.push(() => { fn(); return { done: true, spent: 1000 }; });
function runBakes() {
  let left = bakeBudget;
  while (bakeQ.length && left > 0) { const r = bakeQ[0](left); left -= Math.max(1, r.spent); if (r.done) bakeQ.shift(); }
  if (!bakeQ.length && !baked) { baked = true; document.getElementById('fade').style.opacity = 0; if (SCENE.onBaked) SCENE.onBaked(); }
}
function rebake() { bakeQ = []; baked = false; }

function eachView(fn) { gl.enable(gl.SCISSOR_TEST); for (const v of views) { gl.viewport(v.cx, canvas.height - v.cy - v.ch, v.cw, v.ch); gl.scissor(v.cx, canvas.height - v.cy - v.ch, v.cw, v.ch); fn(v); } gl.disable(gl.SCISSOR_TEST); }
const setView = (u, v) => gl.uniform4f(u.uView, v.wx, v.ww, v.wh, 0);
