// Desert Chase. A coyote and a roadrunner on red desert dirt, seen from a fixed long lens across every monitor.
// The coyote stalks, charges and always fails: the bird cuts at the last moment, a cholla gets in the way, a pounce
// lands on nothing, a wash bank gives way. Failures are real physics: the coyote turns into a position-based ragdoll,
// tumbles in the dust, gets up, shakes it off and tries again later.
//
// The desert (terrain, creosote, prickly pear, cholla, rocks, saguaros, far ranges, sky) is ray-marched once into a
// baked colour + depth + direct-sun buffer. Each frame composites that with the animals' sun shadows, then draws the
// animals as skinned meshes: the coyote with shell fur coloured per vertex from the Blender coat (banded guard
// hairs, rufous legs, pale ruff), the roadrunner with its ~4300 feather cards and the Blender feather pattern.
// Models come from desert-chase/tools/export_rt.py (src/models.js).

// ------------------------------------------------------------------------------------------------ settings tables
const TIMES = {
  morning: { name: 'Early morning', sun: [-.62, .30, .30], sunC: [3.6, 2.9, 2.2], zen: [.20, .36, .64], hor: [.72, .70, .70], sky: [.30, .38, .52], grd: [.30, .18, .11], fog: .0018, haze: [.72, .70, .70] },
  midday: { name: 'Midday', sun: [-.30, .86, .40], sunC: [4.4, 4.1, 3.7], zen: [.16, .34, .68], hor: [.66, .72, .80], sky: [.34, .42, .56], grd: [.36, .22, .14], fog: .0014, haze: [.70, .74, .80] },
  golden: { name: 'Golden hour', sun: [.74, .21, -.14], sunC: [4.2, 2.8, 1.6], zen: [.20, .32, .58], hor: [.86, .66, .50], sky: [.26, .30, .44], grd: [.34, .19, .10], fog: .0011, haze: [.80, .64, .52] },
  dusk: { name: 'Dusk', sun: [.80, .07, .55], sunC: [2.6, 1.3, .62], zen: [.14, .17, .34], hor: [.80, .48, .34], sky: [.22, .20, .28], grd: [.22, .12, .07], fog: .0020, haze: [.70, .46, .36] },
};
const LENSES = {
  close: { name: 'Close', dist: 15, height: 2.5, camY: .95 },
  medium: { name: 'Medium', dist: 21, height: 3.7, camY: 1.32 },
  wide: { name: 'Wide', dist: 30, height: 5.2, camY: 1.9 },
};
const TRIES = { rare: { name: 'Now and then', gap: [55, 110] }, often: { name: 'Often', gap: [16, 40] }, relentless: { name: 'Relentlessly', gap: [8, 20] } };

// ------------------------------------------------------------------------------------------------ small vector math
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};
// rotate v about unit axis k by angle a (Rodrigues)
function rotAxis(v, k, a) { const c = Math.cos(a), s = Math.sin(a), d = V3.dot(k, v) * (1 - c), x = V3.cross(k, v); return [v[0] * c + x[0] * s + k[0] * d, v[1] * c + x[1] * s + k[1] * d, v[2] * c + x[2] * s + k[2] * d]; }
const ease = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------------ models
let MD = null, modelsReady = false, decodeErr = '';
function decodeModels() {
  const bin = atob(MODELS_GZ), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds).arrayBuffer().then((buf) => {
    const T = { u1: Uint8Array, i1: Int8Array, u2: Uint16Array, i2: Int16Array, u4: Uint32Array, f4: Float32Array };
    const out = {};
    for (const k in MODELS.buffers) { const [off, dt, n] = MODELS.buffers[k]; out[k] = new T[dt](buf, off, n); }
    MD = out; modelsReady = true;
  }).catch((e) => { console.error('Desert Chase: model decode failed', e); decodeErr = String(e); });
}
const undelta = (d) => { const o = new Uint16Array(d.length); let a = 0; for (let i = 0; i < d.length; i++) { a += d[i]; o[i] = a; } return o; };

// ------------------------------------------------------------------------------------------------ camera across the monitors
// World: x to the right, y up, z toward the camera. The camera sits at +z looking back down -z, slightly down.
const CAM = { pos: [0, 1.3, 21], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], tanX: 1, tanY: .1, near: .3, far: 5000, halfW: 4 };
function setupCamera() {
  // a long-lens camera about knee high; the ground under the action line sits four fifths of the way down the frame,
  // so the empty sand in front of the chase is a thin strip and the horizon stays just above the middle
  const L = LENSES[S.lens] || LENSES.medium, C = [0, L.camY, L.dist];
  CAM.tanY = (L.height / 2) / L.dist; CAM.tanX = CAM.tanY * W / H;
  const a0 = -Math.atan(L.camY / L.dist), pitch = a0 - Math.atan(-.62 * CAM.tanY);
  CAM.pos = C; CAM.fwd = [0, Math.sin(pitch), -Math.cos(pitch)]; CAM.right = [1, 0, 0]; CAM.up = V3.cross(CAM.right, CAM.fwd);
  CAM.halfW = CAM.tanX * L.dist;                 // half the visible width on the action line
}
// clip matrix (column-major) for one monitor's slice of the whole frustum
function viewProj(v) {
  const x0 = v.wx / W * 2 - 1, x1 = (v.wx + v.ww) / W * 2 - 1, yt = 1, yb = 1 - v.wh / H * 2;
  const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2, cy = (yt + yb) / 2, hy = (yt - yb) / 2, n = CAM.near, f = CAM.far;
  const r = CAM.right, u = CAM.up, w = CAM.fwd, C = CAM.pos;
  // camera space: (r.(P-C), u.(P-C), w.(P-C))
  const a = 1 / (CAM.tanX * hx), b = 1 / (CAM.tanY * hy), zz = (f + n) / (f - n), zw = -2 * f * n / (f - n);
  const row = (k0, k1, k2, k3) => [k0 * r[0] + k1 * u[0] + k2 * w[0], k0 * r[1] + k1 * u[1] + k2 * w[1], k0 * r[2] + k1 * u[2] + k2 * w[2], k3 - (k0 * V3.dot(r, C) + k1 * V3.dot(u, C) + k2 * V3.dot(w, C))];
  const R0 = row(a, 0, -cx / hx, 0), R1 = row(0, b, -cy / hy, 0), R2 = row(0, 0, zz, zw), R3 = row(0, 0, 1, 0);
  return new Float32Array([R0[0], R1[0], R2[0], R3[0], R0[1], R1[1], R2[1], R3[1], R0[2], R1[2], R2[2], R3[2], R0[3], R1[3], R2[3], R3[3]]);
}
// world pixel -> ray direction (the same mapping the bake uses)
function pixelRay(wx, wy) { const nx = wx / W * 2 - 1, ny = 1 - wy / H * 2; return V3.norm(V3.add(CAM.fwd, V3.add(V3.mul(CAM.right, nx * CAM.tanX), V3.mul(CAM.up, ny * CAM.tanY)))); }

// ------------------------------------------------------------------------------------------------ terrain + props (shared by bake and physics)
const TER = { s: [0, 0, 0, 0], wash: [3, .2, .55, 1.3], washPhase: 0 };
const TERR_GLSL = `uniform vec4 uTs;uniform vec4 uWash;uniform float uWashPh;
float washC(float z){return uWash.x+z*uWash.y+.6*sin(z*.3+uWashPh);}
float washFade(float z){return smoothstep(7.,3.,z)*smoothstep(-30.,-14.,z);}
float terr(vec2 p){float x=p.x,z=p.y;
 float h=.06*sin(x*.23+uTs.x)*sin(z*.19+uTs.y)+.035*sin(x*.51-z*.37+uTs.z)+.02*sin(x*1.37+z*.91+uTs.w)+.012*max(0.,-z-10.);
 float dx=abs(x-washC(z)),wf=washFade(z);h-=uWash.z*wf*(1.-smoothstep(uWash.w,uWash.w+1.3,dx));h+=.05*wf*smoothstep(uWash.w+.9,uWash.w+1.8,dx)*(1.-smoothstep(uWash.w+1.8,uWash.w+3.2,dx));
 return h;}`;
function washC(z) { return TER.wash[0] + z * TER.wash[1] + .6 * Math.sin(z * .3 + TER.washPhase); }
function washFade(z) { return sstep(7, 3, z) * sstep(-30, -14, z); }
function terr(x, z) {
  const s = TER.s, w = TER.wash;
  let h = .06 * Math.sin(x * .23 + s[0]) * Math.sin(z * .19 + s[1]) + .035 * Math.sin(x * .51 - z * .37 + s[2]) + .02 * Math.sin(x * 1.37 + z * .91 + s[3]) + .012 * Math.max(0, -z - 10);
  const dx = Math.abs(x - washC(z));
  const wf = washFade(z);
  h -= w[2] * wf * (1 - sstep(w[3], w[3] + 1.3, dx)); h += .05 * wf * sstep(w[3] + .9, w[3] + 1.8, dx) * (1 - sstep(w[3] + 1.8, w[3] + 3.2, dx));
  return h;
}
function terrN(x, z) { const e = .05; return V3.norm([terr(x - e, z) - terr(x + e, z), 2 * e, terr(x, z - e) - terr(x, z + e)]); }

// props: type 0 creosote bush, 1 prickly pear, 2 cholla, 3 rock, 4 saguaro
const PT = { BUSH: 0, PEAR: 1, CHOLLA: 2, ROCK: 3, SAGUARO: 4 };
let props = [];
function makeWorld() {
  const R = mulberry(SEED ^ 0x5eed);
  TER.s = [R(TAU), R(TAU), R(TAU), R(TAU)];
  TER.washPhase = R(TAU);
  const hw = CAM.halfW;
  TER.wash = [R(-.4, .4) * hw, (R() < .5 ? -1 : 1) * R(.35, .9), R(.24, .38), R(.8, 1.2)];
  props = [];
  const free = (x, z, r) => props.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + .35) && Math.abs(x - washC(z)) > TER.wash[3] + .9 + r;
  const add = (type, x, z, r, h, tries) => { for (let k = 0; k < (tries || 1); k++) { if (free(x, z, r)) { props.push({ type, x, z, r, h, seed: R(100), y: terr(x, z) }); return true; } } return false; };
  const span = hw + 5;
  // near band: cover for stalking, cactus to crash into, rocks to trip on. Leave the chase lane (z -1.6..2) mostly open.
  const lane = (z) => z > -1.6 && z < 2.2;
  let n = 0;
  // nothing tall between the camera and the chase lane; bushes stand behind it
  for (let i = 0; i < 400 && n < 6 + hw * .6; i++) { const x = R(-span, span), z = R(-9, -2.2); if (add(PT.BUSH, x, z, R(.5, 1.0), R(.6, 1.2))) n++; }
  n = 0; for (let i = 0; i < 300 && n < 2 + hw * .25; i++) { const x = R(-span, span), z = R(-6, 1.4); if (add(PT.PEAR, x, z, R(.32, .55), R(.38, .7))) n++; }
  n = 0; for (let i = 0; i < 300 && n < 2 + hw * .2; i++) { const x = R(-span * .9, span * .9), z = R(-4, 1.2); if (add(PT.CHOLLA, x, z, R(.24, .36), R(.85, 1.35))) n++; }
  n = 0; for (let i = 0; i < 400 && n < 6 + hw * .6; i++) { const x = R(-span, span), z = R(-8, 6); if (add(PT.ROCK, x, z, z > 2.2 ? R(.05, .14) : R(.07, .32), 0)) n++; }
  // far band: thinner scrub and saguaros
  n = 0; for (let i = 0; i < 600 && n < 22; i++) { const z = R(-60, -10), x = R(-1, 1) * (hw * (1 - z / 21) + 4); if (add(PT.BUSH, x, z, R(.6, 1.4), R(.7, 1.6))) n++; }
  n = 0; for (let i = 0; i < 300 && n < 5; i++) { const z = R(-160, -55), x = R(-1, 1) * (hw * (1 - z / 21)); if (add(PT.SAGUARO, x, z, R(.26, .34), R(4.5, 8.5))) n++; }
  n = 0; for (let i = 0; i < 300 && n < 8; i++) { const z = R(-40, -10), x = R(-1, 1) * (hw * (1 - z / 21) + 2); if (add(PT.ROCK, x, z, R(.25, .8), 0)) n++; }
  props = props.slice(0, 64);
}
// physics shapes for the props the animals can hit: cylinders for cactus and bushes, spheres for rocks
function propHit(x, y, z, r) {
  let best = null;
  for (const p of props) {
    if (p.type === PT.SAGUARO || p.z < -12) continue;
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (p.type === PT.ROCK) { const rr = p.r, cy = p.y + rr * .25, dd = Math.hypot(dx, (y - cy) / .6, dz); if (dd < rr + r) best = { p, nx: dx / (d || 1), nz: dz / (d || 1), pen: rr + r - dd, top: cy + rr * .6 }; continue; }
    const rad = p.type === PT.BUSH ? p.r * .7 : p.type === PT.CHOLLA ? p.r * .8 : p.r * .85;
    if (y < p.y + p.h && d < rad + r) best = { p, nx: dx / (d || 1), nz: dz / (d || 1), pen: rad + r - d };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ the desert bake
const SS = `float ss(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}`;
const SDF_LIB = `
float sdEll(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/max(k1,1e-6);}
float sdCap(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}`;
const SKY_GLSL = `uniform vec3 uSun,uSunC,uZen,uHor,uSkyC,uGrd,uHaze;uniform float uFog;
vec3 skyCol(vec3 rd){float e=max(rd.y,0.);vec3 c=mix(uHor,uZen,pow(e,.42));float s=max(dot(rd,uSun),0.);c+=uSunC*(.05*pow(s,5.)+.25*pow(s,48.));c+=uSunC*6.*smoothstep(.99955,.9999,s);return c;}
vec3 hazeCol(vec3 rd){float s=max(dot(rd,uSun),0.);return mix(uHaze,skyCol(normalize(vec3(rd.x,max(rd.y,.02),rd.z))),.35)+uSunC*.08*pow(s,4.);}
vec3 fogIt(vec3 c,vec3 rd,float t){return mix(c,hazeCol(rd),1.-exp(-t*uFog));}
vec3 tone(vec3 c){c*=1.0;vec3 a=c*(2.51*c+.03),b=c*(2.43*c+.59)+.14;c=clamp(a/b,0.,1.);return pow(c,vec3(1./2.2));}`;
const BAKE_FS = HEAD + NOISE + SS + SDF_LIB + TERR_GLSL + SKY_GLSL + `
uniform vec3 uCam,uFwd,uRight,uUp;uniform vec2 uTan,uWorld;uniform vec4 uBake;
uniform vec4 uP[64];uniform vec4 uQ[64];uniform int uNP,uI;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
int cand[16];int nc=0;
// solid props: 1 prickly pear, 2 cholla, 3 rock, 4 saguaro. Bushes (0) are volumes, handled separately.
float propD(int i,vec3 p,out float m){
 vec4 P=uP[i],Q=uQ[i];int ty=int(P.w+.5);vec3 c=vec3(P.x,Q.z,P.y),q=p-c;float r=P.z,h=Q.x,sd=Q.y,d=1e9;m=float(ty);
 if(ty==1){
  // prickly pear: four chains of pads growing from the ground, each pad standing on the edge of the one below
  for(int k=0;k<12*uI;k++){float fk=float(k),j=mod(fk,4.),l=floor(fk/4.);
   float az=j*1.57+sd+(h11(sd+j)-.5)*.9,lean=.25+.45*h11(sd*1.3+j)+l*.12;vec3 base=vec3(cos(az),0.,sin(az))*r*.32*h11(sd*2.1+j);
   vec3 up=normalize(vec3(cos(az)*sin(lean),cos(lean),sin(az)*sin(lean)));float s=.8+.35*h11(sd*3.+fk)-l*.1;
   vec3 o=base+up*(.1+l*.19)*s*h/.55+vec3(cos(az+1.6),0.,sin(az+1.6))*(h11(sd*4.+fk)-.5)*.12*l;
   vec3 v=q-o;v.xz=rot(az+(h11(sd*6.+fk)-.5)*1.2)*v.xz;v.yz=rot(-lean*.6)*v.yz;
   float pd=sdEll(v,vec3(.075,.11,.018)*s);d=min(d,l>0.&&h11(sd*5.+fk)>.72?1e9:pd);}
 }else if(ty==2){vec3 top=vec3(.06*sin(sd),h*.72,.06*cos(sd));d=sdCap(q,vec3(0),top,.045);
  // teddy-bear cholla: a crown of short joints pointing every which way, each joint carrying another
  for(int k=0;k<10*uI;k++){float fk=float(k),a=fk*2.4+sd,el=-.25+1.25*h11(sd*2.+fk);vec3 dir=normalize(vec3(cos(a)*cos(el),sin(el),sin(a)*cos(el)));
   vec3 a0=mix(vec3(0,h*.4,0),top,h11(sd+fk*1.7)),a1=a0+dir*(.10+.08*h11(sd*3.+fk));
   float b=a+(h11(sd*5.+fk)-.5)*2.,e2=el+(h11(sd*6.+fk)-.3)*1.2;vec3 a2=a1+vec3(cos(b)*cos(e2),sin(e2),sin(b)*cos(e2))*(.08+.07*h11(sd*7.+fk));
   d=min(d,sdCap(q,a0,a1,.033));d=min(d,sdCap(q,a1,a2,.03));}
 }else if(ty==3){q.xz=rot(sd)*q.xz;d=sdEll(q-vec3(0,r*.2,0),vec3(r,r*.58,r*.8));d+=(fbm3(p*3./max(r,.08)+sd)-.5)*.3*r;
 }else if(ty==4){float ang=atan(q.z,q.x),rib=.014*cos(ang*13.);d=sdCap(q,vec3(0),vec3(0,h,0),r+rib);
  for(int k=0;k<3*uI;k++){float fk=float(k);if(h11(sd+fk*3.)>.62)continue;float y0=h*(.32+.3*h11(sd*1.3+fk)),a=sd*2.+fk*2.1;vec3 dir=vec3(cos(a),0,sin(a));
   vec3 a0=vec3(0,y0,0),a1=a0+dir*(r+.42),a2=a1+vec3(0,h*(.2+.2*h11(sd+fk*5.)),0);d=min(d,sdCap(q,a0,a1,r*.7+rib));d=min(d,sdCap(q,a1,a2,r*.7+rib));}}
 return d;}
void gather(vec3 ro,vec3 rd,float tmax){nc=0;for(int i=0;i<64*uI;i++){if(i>=uNP||nc>=16)break;vec4 P=uP[i],Q=uQ[i];if(P.w<.5)continue;vec3 c=vec3(P.x,Q.z+Q.x*.45,P.y);vec3 oc=ro-c;float b=dot(oc,rd),cc=dot(oc,oc)-Q.w*Q.w,di=b*b-cc;if(di>0.){float t1=-b+sqrt(di),t0=-b-sqrt(di);if(t1>0.&&t0<tmax)cand[nc++]=i;}}}
float props(vec3 p,out int id,out float m){float d=1e9;id=-1;m=-1.;for(int j=0;j<16*uI;j++){if(j>=nc)break;float mm;float dd=propD(cand[j],p,mm);if(dd<d){d=dd;id=cand[j];m=mm;}}return d;}
float propsOnly(vec3 p){int i;float m;return props(p,i,m);}
float sceneD(vec3 p){return min((p.y-terr(p.xz))*.6,propsOnly(p));}

float softShadow(vec3 p){gather(p,uSun,40.);float res=1.,t=.03;for(int i=0;i<56*uI;i++){vec3 q=p+uSun*t;float h=q.y-terr(q.xz);float d=min(h*.55,propsOnly(q));res=min(res,9.*d/t);t+=clamp(d,.025,.6);if(res<.005||t>40.)break;}
 return clamp(res,0.,1.);}
vec4 pebbles(vec2 q,float sc){vec2 g=floor(q*sc),f=fract(q*sc);float best=9.;vec2 bid=vec2(0);
 for(int j=-uI;j<=uI;j++)for(int i=-uI;i<=uI;i++){vec2 o=vec2(i,j),id=g+o;if(h12(id+3.1)<.55)continue;vec2 c=o+.2+.6*h22(id);float rr=.14+.24*h12(id+7.7);float d=length(f-c)/rr;if(d<best){best=d;bid=id;}}
 return vec4(best,h12(bid),h12(bid+19.3),h12(bid+5.1));}
vec3 groundBase(vec2 q){
 float big=fbm(q*.21+11.),mid=fbm(q*1.6+3.),fine=vn(q*16.);
 vec3 a=mix(vec3(.38,.19,.105),vec3(.54,.30,.17),big);a*=.84+.28*mid;a*=.93+.14*fine;
 float crust=smoothstep(.55,.7,fbm(q*3.2+21.));a=mix(a,a*vec3(1.1,1.04,.98),crust*.5);
 float wf=(1.-smoothstep(uWash.w-.25,uWash.w+.6,abs(q.x-washC(q.y))))*washFade(q.y);a=mix(a,vec3(.58,.43,.30)*(.9+.2*fine),wf*.75);
 return a;}
vec3 groundDetail(vec3 a,vec2 q,float flat_,inout vec3 bump,inout float spec){
 for(int L=0;L<2*uI;L++){float sc=L==0?8.:26.;vec4 pb=pebbles(q,sc);if(pb.x<1.){float dome=sqrt(max(0.,1.-pb.x*pb.x));vec3 pc=pb.y<.35?vec3(.36,.32,.29):pb.y<.6?vec3(.20,.15,.12):pb.y<.78?vec3(.52,.47,.42):vec3(.46,.24,.14);pc*=.75+.35*pb.z;
  float k=ss(1.,.8,pb.x)*(L==0?.9:.7)*flat_;a=mix(a,pc,k);bump.xz+=normalize(fract(q*sc)-.5+.0001)*(1.-dome)*(L==0?.5:.3)*flat_;spec+=dome*.2*flat_;}
  else a*=1.-.14*ss(1.35,1.,pb.x)*flat_;}
 vec2 gq=q*2.3;vec2 gi=floor(gq);if(h12(gi+41.)<.08){vec2 gf=fract(gq)-.5-.3*(h22(gi)-.5);float ga=atan(gf.y,gf.x),gr=length(gf);float bl=smoothstep(.6,1.,sin(ga*23.+h12(gi)*9.))*ss(.22,.02,gr);a=mix(a,vec3(.56,.47,.30),bl*.75);}
 return a;}
// the dirt averaged over the pixel's footprint, which at this grazing angle is long and thin
vec3 groundAlbF(vec2 q,vec2 along,float len,float flat_,out vec3 bump,out float spec){vec3 a0=groundBase(q),a=vec3(0);bump=vec3(0);spec=0.;
 for(int k=0;k<3*uI;k++)a+=groundDetail(a0,q+along*len*(float(k)*.5-.5),flat_,bump,spec);bump/=3.;spec/=3.;return a/3.;}
vec3 ranges(vec3 rd,out float hit){float az=atan(rd.x,-rd.z),el=rd.y;
 float m1=.020+.032*fbm(vec2(az*2.1+3.,.5))+.010*fbm(vec2(az*11.,1.5));
 float m2=.012+.016*fbm(vec2(az*3.4+11.,2.5))+.006*fbm(vec2(az*17.,3.5));
 hit=0.;vec3 c=vec3(0);
 // light and shade from 2D gullies running down the slopes plus the broad facing of each ridge, so nothing reads as columns
 if(el<m1){hit=1.;float g=fbm(vec2(az*55.+el*140.,el*260.))-fbm(vec2(az*55.-el*140.+7.,el*260.+3.));float br=fbm(vec2(az*2.1+3.03,.5))-fbm(vec2(az*2.1+2.97,.5));
  float sl=(g*.9+br*12.)*sign(uSun.x)+.15*(1.-el/m1);vec3 rc=mix(vec3(.40,.38,.48),vec3(.60,.52,.54),clamp(.5+sl,0.,1.));c=mix(rc*(uSkyC*1.3+uSunC*.14),hazeCol(rd),.5+.25*ss(m1,0.,el));}
 if(el<m2){hit=2.;float g=fbm(vec2(az*80.+el*200.,el*420.))-fbm(vec2(az*80.-el*200.+5.,el*420.+9.));float br=fbm(vec2(az*3.4+11.03,2.5))-fbm(vec2(az*3.4+10.97,2.5));
  float sl=(g*1.1+br*10.)*sign(uSun.x);vec3 rc=mix(vec3(.30,.20,.16),vec3(.56,.38,.27),clamp(.5+sl,0.,1.));rc*=.85+.3*fbm(vec2(az*240.,el*900.));c=mix(rc*(uSkyC*1.1+uSunC*.2),hazeCol(rd),.32+.3*ss(m2,0.,el));}
 return c;}
void main(){
 vec2 vW=vec2(uBake.x+gl_FragCoord.x/uBake.y,(uBake.z-gl_FragCoord.y)/uBake.y);
 vec2 nd=vec2(vW.x/uWorld.x*2.-1.,1.-vW.y/uWorld.y*2.);
 vec3 ro=uCam,rd=normalize(uFwd+uRight*nd.x*uTan.x+uUp*nd.y*uTan.y);
 float pa=2.*uTan.y/uWorld.y/uBake.y;                 // radians per bake pixel
 const float TF=420.;
 gather(ro,rd,TF);
 float t=.3,tp=.3;bool hitT=false;int hp=-1;float hm=-1.;
 for(int i=0;i<320*uI;i++){vec3 p=ro+rd*t;float hy=p.y-terr(p.xz);if(hy<0.){hitT=true;break;}
  int id;float mm;float dp=props(p,id,mm);if(dp<.0006*t+.0003){hp=id;hm=mm;break;}
  float st=min(hy/(.42+abs(rd.y)),dp*.7);st=max(st,.0006*t+.0004);tp=t;t+=st;if(t>TF)break;}
 if(hitT){float a=tp,b=t;for(int k=0;k<10*uI;k++){float m=(a+b)*.5;vec3 p=ro+rd*m;if(p.y-terr(p.xz)<0.)b=m;else a=m;}t=b;}
 vec3 col,direct=vec3(0);float dist=1e5;bool opaque=hitT||hp>=0;
 if(!opaque){float rh;vec3 rc=ranges(rd,rh);col=rh>0.?rc:skyCol(rd);}
 else{
  vec3 p=ro+rd*t;dist=t;vec3 n,alb;float spec=0.,sss=0.,rim=0.;
  if(hp<0){float e=.02;n=normalize(vec3(terr(p.xz-vec2(e,0))-terr(p.xz+vec2(e,0)),2.*e,terr(p.xz-vec2(0,e))-terr(p.xz+vec2(0,e))));
   vec3 bump;float fp=min(t*pa/max(abs(rd.y),.015),.6);alb=groundAlbF(p.xz,normalize(rd.xz+1e-5),fp,smoothstep(.85,.97,n.y),bump,spec);n=normalize(n+bump*.5);}
  else{float e=.003;gather(p-rd*.05,rd,1.);if(nc==0)cand[nc++]=hp;
   n=vec3(0);for(int k=0;k<4*uI;k++){vec3 o=k==0?vec3(1,-1,-1):k==1?vec3(-1,-1,1):k==2?vec3(-1,1,-1):vec3(1);n+=o*propsOnly(p+o*e);}n=normalize(n);
   vec4 Q=uQ[hp];float sd=Q.y;vec3 lp=p-vec3(uP[hp].x,Q.z,uP[hp].y);
   if(hm<1.5){vec3 g=vec3(.085,.15,.085);alb=g*(.8+.35*fbm3(p*18.));float ar=ss(.10,.05,length(fract(p*vec3(26.))-.5));alb=mix(alb,vec3(.26,.18,.11),ar*.6);alb+=vec3(.20,.18,.11)*step(.985,n3(p*160.));alb=mix(alb,vec3(.42,.36,.20),ss(.6,.95,abs(n.y))*.25);sss=.2;}
   else if(hm<2.5){n=normalize(n+(vec3(n3(p*140.),n3(p*140.+7.),n3(p*140.+13.))-.5)*.9);alb=mix(vec3(.24,.25,.13),vec3(.50,.47,.30),n3(p*60.))*(.75+.5*n3(p*230.));rim=1.1;float dead=ss(.2,.0,lp.y/Q.x);alb=mix(alb,vec3(.18,.13,.09),dead);}
   else if(hm<3.5){alb=mix(vec3(.16,.11,.08),vec3(.34,.25,.19),fbm3(p*7.+sd));alb*=.8+.3*n3(p*40.);alb=mix(alb,vec3(.40,.38,.24),smoothstep(.72,.8,fbm3(p*13.+sd))*.4);spec=.25;}
   else{float rib=cos(atan(lp.z,lp.x)*13.);alb=vec3(.042,.068,.032)*(.8+.4*fbm3(p*vec3(3.,.6,3.)))*(.6+.4*ss(-.4,.7,rib));alb=mix(alb,vec3(.16,.14,.10),ss(.25,.0,lp.y)*.6);rim=.45;}}
  float sh=softShadow(p+n*.006);
  float ao=1.;{float s=0.;for(int i=1;i<=4*uI;i++){float hk=.05*float(i*i);s+=(hk-sceneD(p+n*hk))/hk;}ao=clamp(1.-s*.16,.25,1.);}
  float ndl=max(dot(n,uSun),0.);vec3 sunL=uSunC*ndl*sh;
  vec3 amb=uSkyC*(.55+.45*n.y)*ao+uGrd*(.5-.5*n.y)*ao;
  vec3 h=normalize(uSun-rd);float sp=spec*pow(max(dot(n,h),0.),40.)*sh;
  col=alb*(sunL+amb)+uSunC*sp*.25;
  col+=alb*uSunC*sss*sh*.35*pow(max(dot(rd,uSun),0.),2.);
  col+=uSunC*rim*.18*pow(1.-max(dot(n,-rd),0.),3.)*(.3+.7*sh);
  direct=alb*sunL+uSunC*sp*.25;
  col=fogIt(col,rd,t);direct*=exp(-t*uFog);
 }
 o0=vec4(col,1.);o1=vec4(dist,direct);
}`;

// second pass: creosote volumes composited front to back over the solid desert
const BUSH_FS = HEAD + NOISE + SS + SKY_GLSL + `
uniform vec3 uCam,uFwd,uRight,uUp;uniform vec2 uTan,uWorld;uniform vec4 uBake;uniform vec4 uP[64];uniform vec4 uQ[64];uniform int uNP,uI;
uniform sampler2D uA0,uA1;layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
vec3 bushC(int i){vec4 P=uP[i],Q=uQ[i];return vec3(P.x,Q.z+Q.x*.5,P.y);}
vec3 bushR(int i){vec4 P=uP[i],Q=uQ[i];return vec3(P.z*1.4,Q.x*.7,P.z*1.27);}
void bushSpan(int i,vec3 ro,vec3 rd,out float t0,out float t1){vec3 R=bushR(i),o=(ro-bushC(i))/R,d=rd/R;float a=dot(d,d),b=dot(o,d),cc=dot(o,o)-1.,di=b*b-a*cc;float s=sqrt(max(di,0.));t0=(-b-s)/a;t1=(-b+s)/a;if(di<0.){t0=0.;t1=-1.;}}
// the D3D compiler crashes on a bool call whose result is dropped, so callers that only want the span use bushSpan
bool bushInt(int i,vec3 ro,vec3 rd,out float t0,out float t1){bushSpan(i,ro,rd,t0,t1);return t1>0.;}
// single exit on purpose: the D3D compiler cannot keep a loop as a loop when an inlined function returns early inside it
// creosote: a dozen woody stems fanning up from one crown, small leaf clusters toward their tips, open inside
const float NST=17.;
float stemDist(vec3 v,float ci,float sd,float r,float h){ci=mod(ci,NST);
 float az=(ci+.15+.7*h11(ci*7.3+sd))/NST*6.2832,tl=.25+.65*h11(ci*3.1+sd*1.7),co=r*.28*h11(ci*5.9+sd*.3);
 vec3 dir=vec3(sin(tl)*cos(az),cos(tl),sin(tl)*sin(az)),o=vec3(cos(az+.6),0.,sin(az+.6))*co;float len=h*(.7+.6*h11(ci+sd*5.));
 vec3 u=v-o;float s=clamp(dot(u,dir),0.,len);vec3 w=u-dir*s;w.y+=s*s/len*.15*sin(tl);return length(w);}
float bushDens(int i,vec3 p,out float twig){vec4 P=uP[i],Q=uQ[i];float sd=Q.y,r=P.z,h=Q.x;
 vec3 v=p-vec3(P.x,Q.z,P.y);float hy=v.y/h;
 vec3 q=vec3(v.x,v.y-h*.5,v.z)/vec3(r,h*.5,r*.9);q.xz/=.6+.45*ss(0.,.7,hy);
 float shape=1.-length(q)+(n3(p*2.2+sd)-.5)*.45;twig=0.;float res=0.;
 if(shape>-.15){float a=atan(v.z,v.x);a+=a<0.?6.2832:0.;float ci=floor(a/6.2832*NST);
  float dl=min(min(stemDist(v,ci-1.,sd,r,h),stemDist(v,ci,sd,r,h)),stemDist(v,ci+1.,sd,r,h));
  float rad=.011*(1.-.6*ss(0.,1.,hy))+.003;
  twig=ss(rad*1.3,rad*.6,dl)*ss(-.15,0.,shape);
  float lr=.06+.26*ss(.1,.85,hy);
  float n=n3(p*24.+sd)*.6+n3(p*57.+sd*2.)*.4;
  float lf=ss(.5,.66,n)*ss(lr,lr*.25,dl)*ss(.12,.4,hy)*ss(0.,.1,shape)*ss(.75,.35,shape);
  res=lf*70.+twig*170.;}
 return res;}
// one bush volume, front to back; called four times by hand because the D3D compiler will not keep a loop around this one
void marchBush(int i,float jit,vec3 ro,vec3 rd,vec2 vW,float tmax,float fwd,inout vec3 acc,inout float T,inout float front){
 if(i>=0&&T>=.02){float t0,t1;bushSpan(i,ro,rd,t0,t1);t0=max(t0,.3);t1=min(t1,tmax);
  float st=max(.016,t0*.0009),sm=t0+st*h12(vW+jit);vec4 Q=uQ[i];
  for(int k=0;k<240*uI;k++){if(sm>t1||T<.02)break;vec3 q=ro+rd*sm;float tw;float de=bushDens(i,q,tw);
   if(de>.01){float al=1.-exp(-de*st);
    float s0,s1;bushSpan(i,q,uSun,s0,s1);float vis=exp(-max(s1,0.)*11.2);
    float hy=clamp((q.y-Q.z)/Q.x,0.,1.);
    vec3 alb=mix(mix(vec3(.075,.095,.035),vec3(.20,.23,.08),n3(q*85.+Q.y))*(.75+.5*n3(q*20.)),vec3(.14,.12,.10)*(.7+.5*n3(q*vec3(9.,40.,9.))),step(.3,tw));
    vec3 c=alb*(uSunC*vis*(.55+.45*hy+fwd*.8)+uSkyC*(.30+.55*hy)+uGrd*.25);
    acc+=T*al*c;T*=1.-al;if(front<0.&&T<.5)front=sm;}
   sm+=st;}}}
void main(){ivec2 px=ivec2(gl_FragCoord.xy);vec4 c0=texelFetch(uA0,px,0),c1=texelFetch(uA1,px,0);
 vec2 vW=vec2(uBake.x+gl_FragCoord.x/uBake.y,(uBake.z-gl_FragCoord.y)/uBake.y);
 vec2 nd=vec2(vW.x/uWorld.x*2.-1.,1.-vW.y/uWorld.y*2.);
 vec3 ro=uCam,rd=normalize(uFwd+uRight*nd.x*uTan.x+uUp*nd.y*uTan.y);
 float dist=c1.x,tmax=min(dist,420.);
 vec3 base=c0.rgb,dir0=c1.gba;
 if(dist<1e4){vec3 hp=ro+rd*dist;float od=0.;int n2=0;
  for(int i=0;i<64*uI;i++){if(i>=uNP||n2>=4)break;if(uP[i].w>.5)continue;float t0,t1;if(!bushInt(i,hp,uSun,t0,t1))continue;n2++;t0=max(t0,0.);float L=t1-t0;
   for(int k=0;k<5*uI;k++){float tw;od+=bushDens(i,hp+uSun*(t0+L*(float(k)+.5)/5.),tw)*L/5.;}}
  float Ts=exp(-od*.85);base-=dir0*(1.-Ts);dir0*=Ts;}
 // the four nearest bush volumes along the ray, kept in scalars (an indexed local array sends the D3D compiler off a cliff)
 int i0=-1,i1=-1,i2=-1,i3=-1;float n0=1e9,n1=1e9,n2=1e9,n3_=1e9;
 for(int i=0;i<64*uI;i++){if(i>=uNP)break;if(uP[i].w>.5)continue;float t0,t1;if(bushInt(i,ro,rd,t0,t1)&&t0<tmax){
  if(t0<n0){i3=i2;n3_=n2;i2=i1;n2=n1;i1=i0;n1=n0;i0=i;n0=t0;}else if(t0<n1){i3=i2;n3_=n2;i2=i1;n2=n1;i1=i;n1=t0;}else if(t0<n2){i3=i2;n3_=n2;i2=i;n2=t0;}else if(t0<n3_){i3=i;n3_=t0;}}}
 vec3 acc=vec3(0);float T=1.,front=-1.;float fwd=pow(max(dot(rd,uSun),0.),3.);
 marchBush(i0,0.,ro,rd,vW,tmax,fwd,acc,T,front);marchBush(i1,7.,ro,rd,vW,tmax,fwd,acc,T,front);marchBush(i2,13.,ro,rd,vW,tmax,fwd,acc,T,front);marchBush(i3,19.,ro,rd,vW,tmax,fwd,acc,T,front);
 float fd=front>0.?front:min(n0,tmax);float fo=1.-exp(-fd*uFog);acc=mix(acc,hazeCol(rd)*(1.-T),fo);
 vec3 col=acc+T*base;vec3 direct=dir0*T;if(front>0.)dist=min(dist,front);
 o0=vec4(col,1.);o1=vec4(dist,direct);}`;

// third pass: a long lens focused on the chase lane. Far saguaros, ridges and the sand at our feet go soft; the lane stays sharp.
// Gather form of a scatter blur: a sample counts if its own blur disc reaches this pixel, and a sharp pixel in front
// is never smeared by the blurry background behind it.
const DOF_FS = HEAD + NOISE + `
uniform sampler2D uC,uD;uniform vec3 uFocus;uniform int uI;layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
float coc(float d){return min(uFocus.y*abs(1.-uFocus.x/max(d,.1)),uFocus.z);}
void main(){ivec2 px=ivec2(gl_FragCoord.xy),mx=textureSize(uC,0)-1;vec4 d0=texelFetch(uD,px,0);float c0=coc(d0.x);
 // every sample spreads its light over its own disc (weight 1/area); each tap stands in for R*R/96 pixels of ours
 float ws=1./max(c0*c0,1.),R=uFocus.z,rot=h12(gl_FragCoord.xy)*6.2832,tw=R*R/96.;vec3 acc=texelFetch(uC,px,0).rgb*ws;
 for(int i=0;i<96*uI;i++){float fi=float(i)+.5,r=sqrt(fi/96.)*R,a=fi*2.39996+rot;ivec2 q=clamp(px+ivec2(floor(vec2(cos(a),sin(a))*r+.5)),ivec2(0),mx);
  float ds=texelFetch(uD,q,0).x,cs=coc(ds);cs=ds>d0.x?min(cs,c0):cs;float w=clamp(cs-r+.5,0.,1.)*tw/max(cs*cs,1.);
  acc+=texelFetch(uC,q,0).rgb*w;ws+=w;}
 o0=vec4(acc/ws,1.);o1=d0;}`;

// The baked buffer covers only the monitors this window draws; bake scale k keeps huge desks affordable.
let bake = null;
function freeBake() { if (!bake) return; for (const f of [bake.fbA, bake.fb]) gl.deleteFramebuffer(f); for (const t of [bake.cA, bake.dA, bake.c, bake.d]) gl.deleteTexture(t); bake = null; }
function makeBake() {
  freeBake();
  const bx0 = Math.min(...views.map(v => v.wx)), bx1 = Math.max(...views.map(v => v.wx + v.ww));
  const px = (bx1 - bx0) * H, k = Math.min(1, Math.sqrt(9e6 / px));
  const w = Math.max(1, Math.round((bx1 - bx0) * k)), h = Math.max(1, Math.round(H * k));
  const tex = (ifmt, type, filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const f32 = !!gl.getExtension('EXT_color_buffer_float');
  const pair = () => {
    const c = FLOAT_RT ? tex(gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR) : tex(gl.RGBA8, gl.UNSIGNED_BYTE, gl.LINEAR);
    const d = f32 ? tex(gl.RGBA32F, gl.FLOAT, gl.NEAREST) : tex(FLOAT_RT ? gl.RGBA16F : gl.RGBA8, FLOAT_RT ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, gl.NEAREST);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, c, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, d, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { fb, c, d };
  };
  const A = pair(), B = pair();
  bake = { fbA: A.fb, cA: A.c, dA: A.d, fb: B.fb, c: B.c, d: B.d, w, h, bx0, k };
}
function propUniforms() {
  const P = new Float32Array(256), Q = new Float32Array(256);
  props.forEach((p, i) => {
    P.set([p.x, p.z, p.r, p.type], i * 4);
    const bound = p.type === PT.BUSH ? Math.hypot(p.r, p.h * .5) * 1.45 : p.type === PT.PEAR ? Math.hypot(p.r + .2, p.h * .5) * 1.2 : p.type === PT.CHOLLA ? Math.hypot(p.h * .5, p.h * .5) * 1.1 : p.type === PT.ROCK ? p.r * 1.4 : Math.hypot(p.h * .5, p.r + 1.2) * 1.1;
    Q.set([p.type === PT.ROCK ? p.r * .5 : p.h, p.seed, p.y, bound], i * 4);
  });
  return [P, Q];
}
function timeUniforms(u) {
  const T = TIMES[S.time] || TIMES.golden, sun = V3.norm(T.sun);
  gl.uniform3fv(u.uSun, sun); gl.uniform3fv(u.uSunC, T.sunC); gl.uniform3fv(u.uZen, T.zen); gl.uniform3fv(u.uHor, T.hor);
  gl.uniform3fv(u.uSkyC, T.sky); gl.uniform3fv(u.uGrd, T.grd); gl.uniform3fv(u.uHaze, T.haze); gl.uniform1f(u.uFog, T.fog);
}
function terrUniforms(u) { gl.uniform4fv(u.uTs, TER.s); gl.uniform4fv(u.uWash, TER.wash); gl.uniform1f(u.uWashPh, TER.washPhase); }
function camUniforms(u) { gl.uniform3fv(u.uCam, CAM.pos); gl.uniform3fv(u.uFwd, CAM.fwd); gl.uniform3fv(u.uRight, CAM.right); gl.uniform3fv(u.uUp, CAM.up); gl.uniform2f(u.uTan, CAM.tanX, CAM.tanY); gl.uniform2f(u.uWorld, W, H); }
function queueBake() {
  makeBake();
  const [Pu, Qu] = propUniforms();
  bakeTiles({ fb: bake.fbA, w: bake.w, h: bake.h }, {
    tile: 96, cost: 7, begin: () => {
      const p = P.bake; gl.useProgram(p.p); camUniforms(p.u); timeUniforms(p.u); terrUniforms(p.u);
      gl.uniform4f(p.u.uBake, bake.bx0, bake.k, bake.h, 0); gl.uniform4fv(p.u.uP, Pu); gl.uniform4fv(p.u.uQ, Qu); gl.uniform1i(p.u.uNP, props.length); gl.uniform1i(p.u.uI, 1);
    },
  });
  bakeTiles({ fb: bake.fb, w: bake.w, h: bake.h }, {
    tile: 64, cost: 70, begin: () => {
      const p = P.bush; gl.useProgram(p.p); camUniforms(p.u); timeUniforms(p.u);
      gl.uniform4f(p.u.uBake, bake.bx0, bake.k, bake.h, 0); gl.uniform4fv(p.u.uP, Pu); gl.uniform4fv(p.u.uQ, Qu); gl.uniform1i(p.u.uNP, props.length);
      bindTex(0, bake.cA, p.u.uA0); bindTex(1, bake.dA, p.u.uA1); gl.uniform1i(p.u.uI, 1);
    },
  });
  // depth of field from B back into A, then A becomes what the composite reads
  bakeTiles({ fb: bake.fbA, w: bake.w, h: bake.h }, {
    tile: 128, cost: 12, begin: () => {
      const p = P.dof, L = LENSES[S.lens] || LENSES.medium; gl.useProgram(p.p);
      gl.uniform3f(p.u.uFocus, L.dist, bake.h * .0075, bake.h * .013); gl.uniform1i(p.u.uI, 1);
      bindTex(0, bake.c, p.u.uC); bindTex(1, bake.d, p.u.uD);
    },
  });
  bakeStep(() => { [bake.fb, bake.fbA] = [bake.fbA, bake.fb]; [bake.c, bake.cA] = [bake.cA, bake.c]; [bake.d, bake.dA] = [bake.dA, bake.d]; });
}

// per frame: the baked desert, minus the sun the animals are blocking, written with its depth
const COMP_FS = HEAD + NOISE + SKY_GLSL + `
in vec2 vW;uniform vec3 uCam,uFwd,uRight,uUp;uniform vec2 uTan,uWorld;uniform vec4 uBake;uniform vec2 uRT;uniform vec2 uNF;
uniform sampler2D uC,uD;uniform highp sampler2DShadow uSh;uniform mat4 uSunVP;uniform float uShOn,uTime;out vec4 o;
float shadowAt(vec3 p){vec4 c=uSunVP*vec4(p,1);vec3 s=c.xyz/c.w*.5+.5;if(any(lessThan(s.xy,vec2(.001)))||any(greaterThan(s.xy,vec2(.999))))return 1.;
 float v=0.;vec2 tx=1./vec2(textureSize(uSh,0));for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)v+=texture(uSh,vec3(s.xy+vec2(i,j)*tx*1.5,s.z-.0015));return v/9.;}
void main(){vec2 uv=vec2((vW.x-uBake.x)*uBake.y/uRT.x,1.-vW.y*uBake.y/uRT.y);
 vec4 c=texture(uC,uv),d=texture(uD,uv);
 vec2 nd=vec2(vW.x/uWorld.x*2.-1.,1.-vW.y/uWorld.y*2.);vec3 rd=normalize(uFwd+uRight*nd.x*uTan.x+uUp*nd.y*uTan.y);
 vec3 col=c.rgb;float t=d.x;
 if(t<1e4){vec3 p=uCam+rd*t;if(uShOn>.5){float v=shadowAt(p);col-=d.gba*(1.-v)*.88;}
  float zc=t*dot(rd,uFwd),n=uNF.x,f=uNF.y;gl_FragDepth=(((f+n)*zc-2.*f*n)/((f-n)*zc))*.5+.5;}
 else gl_FragDepth=.99999;
 col=tone(max(col,0.));col+=(h12(vW+fract(uTime)*91.)-.5)/255.*1.5;o=vec4(col,1);}`;

// ------------------------------------------------------------------------------------------------ animal shaders
const SHADOW_GLSL = `uniform highp sampler2DShadow uSh;uniform mat4 uSunVP;uniform float uShOn;
float shadowAt(vec3 p){if(uShOn<.5)return 1.;vec4 c=uSunVP*vec4(p,1);vec3 s=c.xyz/c.w*.5+.5;if(any(lessThan(s.xy,vec2(.001)))||any(greaterThan(s.xy,vec2(.999))))return 1.;
 float v=0.;vec2 tx=1./vec2(textureSize(uSh,0));for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)v+=texture(uSh,vec3(s.xy+vec2(i,j)*tx,s.z-.002));return v/9.;}`;
// how bright the baked desert is around an animal: a cheap stand-in for bush shade and ground bounce
const AMB_GLSL = `uniform float uGndShade;`;

// coyote: instance 0 is the skin, instances 1.. are fur shells pushed out along the hair direction
const COY_VS = HEAD + `
in vec3 aPos;in vec3 aNrm;in vec3 aFlow;in vec3 aBase;in vec3 aBand;in vec3 aTip;in vec3 aSkin;in vec4 aMisc;in vec2 aMisc2;in vec2 aBone;in float aW;
uniform vec3 uLo,uHi;uniform mat4 uB[20];uniform mat4 uVP;uniform float uNS,uShadowPass,uFluff,uOff;uniform vec3 uGrav;
out vec3 vP,vN,vT,vRest,vBase,vBand,vTip,vSkin;out vec4 vMisc;out float vH,vL,vMat;
void main(){vec3 rp=uLo+aPos*(uHi-uLo);
 mat4 M=uB[int(aBone.x+.5)]*aW+uB[int(aBone.y+.5)]*(1.-aW);
 vec3 P=(M*vec4(rp,1)).xyz,N=normalize(mat3(M)*aNrm),F=normalize(mat3(M)*aFlow);
 float L=aMisc.w*.12*uFluff,lift=aMisc2.x*1.2;vMat=floor(aMisc2.y*255./50.+.5);
 float h=(float(gl_InstanceID)+uOff)/max(uNS-1.,1.);
 vec3 dir=normalize(N*sin(lift)+F*cos(lift));
 vec3 Q=P+dir*L*h+uGrav*L*h*h*.45;
 if(uShadowPass>.5)Q=P+N*L*.4;
 vP=Q;vN=N;vT=normalize(dir+uGrav*h*.45);vRest=rp;vBase=aBase;vBand=aBand;vTip=aTip;vSkin=aSkin;vMisc=aMisc;vH=h;vL=L;
 gl_Position=uVP*vec4(Q,1);}`;
const COY_FS = HEAD + NOISE + SS + SKY_GLSL + SHADOW_GLSL + `
in vec3 vP,vN,vT,vRest,vBase,vBand,vTip,vSkin;in vec4 vMisc;in float vH,vL,vMat;
uniform vec3 uCam;uniform float uCell;out vec4 o;
void main(){vec3 V=normalize(uCam-vP);float t=length(uCam-vP);vec3 N=normalize(vN);
 float sh=shadowAt(vP+N*.012);vec3 col;float alpha=1.;
 if(vH<.001){vec3 alb=lin(vSkin);float ndl=max(dot(N,uSun),0.);
  col=alb*(uSunC*ndl*sh+uSkyC*(.55+.45*N.y)+uGrd*(.5-.5*N.y));
  if(vMat>.5&&vMat<1.5){vec3 h=normalize(uSun+V);col+=uSunC*.25*pow(max(dot(N,h),0.),60.)*sh+uSkyC*.08*pow(1.-max(dot(N,V),0.),3.);}}
 else{if(vL<.0008)discard;
  vec3 q=vRest/uCell,id=floor(q),f=fract(q)-.5;vec3 jit=vec3(h13(id),h13(id+5.3),h13(id+9.1))-.5;
  float r=length(f-jit*.45),len=.5+.62*h13(id+2.7),hs=vH/len;if(hs>1.)discard;
  float rad=.56*(1.-pow(hs,2.))+.08;alpha=ss(rad,rad*.55,r);if(alpha<.02)discard;
  vec3 alb=mix(lin(vBase),lin(vBand),ss(vMisc.x-.07,vMisc.x+.07,hs));
  alb=mix(alb,lin(vTip),ss(vMisc.y-.06,vMisc.y+.06,hs)*vMisc.z*step(.24,h13(id+4.4)));
  alb*=.84+.32*h13(id+8.8);
  float occ=mix(.32,1.,pow(vH,.55));
  vec3 T=normalize(vT);float tl=dot(T,uSun),stl=sqrt(max(0.,1.-tl*tl));
  float dif=mix(max(dot(N,uSun)*.5+.5,0.)*max(dot(N,uSun)+.3,0.),stl,.35);
  vec3 h=normalize(uSun+V);float th=dot(T,h),sp=pow(sqrt(max(0.,1.-th*th)),60.);
  float back=pow(max(dot(-V,uSun),0.),3.)*(1.-vH*.3);
  col=alb*(uSunC*dif*sh+uSkyC*(.6+.4*N.y)*occ+uGrd*(.45-.45*N.y)*occ)*occ+uSunC*sp*.05*sh*occ+alb*uSunC*back*.35*sh;}
 col=fogIt(col,-V,t);o=vec4(tone(col),alpha);}`;

// roadrunner body, bill, legs: mat 0 skin under the feathers (and the bare patch behind the eye), 1 bill, 2 scaled legs
const RR_VS = HEAD + `
in vec3 aPos;in vec3 aNrm;in vec3 aCol;in vec4 aBW;
uniform vec3 uLo,uHi;uniform mat4 uB[13];uniform mat4 uVP;
out vec3 vP,vN,vC,vRest;out float vMat;
void main(){vec3 rp=uLo+aPos*(uHi-uLo);float w=aBW.z/255.;
 mat4 M=uB[int(aBW.x+.5)]*w+uB[int(aBW.y+.5)]*(1.-w);
 vP=(M*vec4(rp,1)).xyz;vN=normalize(mat3(M)*aNrm);vC=aCol;vRest=rp;vMat=floor(aBW.w/50.+.5);
 gl_Position=uVP*vec4(vP,1);}`;
const RR_FS = HEAD + NOISE + SS + SKY_GLSL + SHADOW_GLSL + `
in vec3 vP,vN,vC,vRest;in float vMat;uniform vec3 uCam;out vec4 o;
void main(){vec3 V=normalize(uCam-vP);float t=length(uCam-vP);vec3 N=normalize(vN);if(dot(N,V)<0.)N=-N;
 vec3 alb=lin(vC);float sh=shadowAt(vP+N*.004);float gl=.0,sp=20.;
 if(vMat>1.5){vec2 v=voro(vRest.xy*vec2(900.,700.)+vRest.z*300.);alb*=.7+.45*ss(.0,.25,v.y-v.x);gl=.25;sp=30.;}
 else if(vMat>.5){gl=.6;sp=70.;}
 float ndl=max(dot(N,uSun),0.);vec3 h=normalize(uSun+V);
 vec3 col=alb*(uSunC*ndl*sh+uSkyC*(.55+.45*N.y)+uGrd*(.5-.5*N.y))+uSunC*gl*.3*pow(max(dot(N,h),0.),sp)*sh+uSkyC*gl*.15*pow(1.-max(dot(N,V),0.),4.);
 col=fogIt(col,-V,t);o=vec4(tone(col),1);}`;

// feather cards: per-card attributes live in a texture, 6 texels per card, 64 cards per row
const CARD_VS = HEAD + `
in vec3 aPos;in vec2 aUV;in float aCard;
uniform vec3 uLo,uHi;uniform mat4 uB[13];uniform mat4 uVP;uniform sampler2D uCA;
out vec3 vP,vN;out vec2 vUV;flat out vec3 fMain,fEdge,fStreak,fP,fQ,fS;
vec4 ca(int id,int k){return texelFetch(uCA,ivec2((id%64)*6+k,id/64),0);}
void main(){int id=int(aCard+.5);vec4 t0=ca(id,0),t1=ca(id,1),t2=ca(id,2),t3=ca(id,3),t4=ca(id,4),t5=ca(id,5);
 fMain=t0.rgb;fEdge=vec3(t0.a,t1.r,t1.g);fStreak=vec3(t1.b,t1.a,t2.r);fP=t2.gba*1.25;fQ=t3.rgb;fS=vec3(t3.a,t4.r*12.75,t4.g*2.);
 float b0=t4.b*255.,b1=t4.a*255.,w=t5.r;vec3 nr=t5.gba*2.-1.;
 mat4 M=uB[int(b0+.5)]*w+uB[int(b1+.5)]*(1.-w);
 vec3 rp=uLo+aPos*(uHi-uLo);vP=(M*vec4(rp,1)).xyz;vN=normalize(mat3(M)*nr);vUV=aUV;
 gl_Position=uVP*vec4(vP,1);}`;
const FEATHER_GLSL = `
float featherA(vec2 uv,vec3 fP,vec3 fQ,vec3 fS,out float reff,out float r,out float sb,out float n,out float db){
 float u=uv.x,v=uv.y,au=abs(u);float bt=pow(ss(0.,max(fS.x,.01),v),.5),tw=sqrt(max(0.,1.-pow(max(v,0.),fS.y)));
 float w=max(bt*tw,.001);r=au/w;sb=.5+.5*sin(v*fS.z*70.-au*24.);n=fbm3(vec3(u*3.,v*16.,fQ.z*40.));
 reff=r+(sb-.5)*.06+(n-.5)*(.1+fQ.x*.4);float a=ss(1.,.7,reff);db=ss(.3,.04,v);
 a*=1.-db*(1.-n)*.9;a*=1.-fQ.x*ss(.4,1.,r)*(1.-n)*.7;return a;}`;
const CARD_FS = HEAD + NOISE + SS + SKY_GLSL + SHADOW_GLSL + FEATHER_GLSL + `
in vec3 vP,vN;in vec2 vUV;flat in vec3 fMain,fEdge,fStreak,fP,fQ,fS;uniform vec3 uCam;out vec4 o;
void main(){float reff,r,sb,n,db;float a=featherA(vUV,fP,fQ,fS,reff,r,sb,n,db);if(a<.03)discard;
 vec3 cm=lin(fMain),edge=lin(fEdge),streak=lin(fStreak);float u=vUV.x,v=vUV.y,au=abs(u);
 vec3 c=mix(cm,edge,ss(fP.x,fP.x+.14,reff));
 float sm=ss(fP.y,fP.y*.55,r)*step(.01,fP.y)*ss(.08,.22,v)*ss(.97,.82,v);c=mix(c,streak,sm);
 c=mix(c,edge,ss(fP.z,fP.z+.07,v+r*r*.18));c=mix(c,vec3(.32,.30,.28),db*.3);
 c=mix(c,edge,ss(.045,.012,au)*ss(1.,.85,v)*.3);c*=.82+.18*sb;
 vec3 V=normalize(uCam-vP);float t=length(uCam-vP);vec3 N=normalize(vN);if(dot(N,V)<0.)N=-N;
 float sh=shadowAt(vP+N*.004);float ndl=dot(N,uSun);float gloss=fQ.y;
 vec3 h=normalize(uSun+V);vec3 tint=mix(vec3(1),vec3(.78,.74,.42),gloss);
 vec3 col=c*(uSunC*(max(ndl,0.)+max(-ndl,0.)*.25)*sh+uSkyC*(.62+.38*N.y)+uGrd*.35)+uSunC*tint*gloss*.3*pow(max(dot(N,h),0.),mix(18.,55.,gloss))*sh;
 col=fogIt(col,-V,t);o=vec4(tone(col),a);}`;
const CARD_SH_FS = HEAD + NOISE + SS + FEATHER_GLSL + `in vec2 vUV;flat in vec3 fMain,fEdge,fStreak,fP,fQ,fS;out vec4 o;
void main(){float reff,r,sb,n,db;if(featherA(vUV,fP,fQ,fS,reff,r,sb,n,db)<.5)discard;o=vec4(1);}`;
const DEPTH_FS = HEAD + `out vec4 o;void main(){o=vec4(1);}`;

// eyes: a sphere per eye, iris and pupil around the gaze axis, a wet highlight
const EYE_VS = HEAD + `in vec3 aPos;uniform mat4 uM;uniform mat4 uVP;out vec3 vP,vN,vL;
void main(){vL=aPos;vec4 p=uM*vec4(aPos,1);vP=p.xyz;vN=normalize(mat3(uM)*aPos);gl_Position=uVP*p;}`;
const EYE_FS = HEAD + NOISE + SS + SKY_GLSL + `in vec3 vP,vN,vL;uniform vec3 uCam,uIris1,uIris2;uniform float uPupil;out vec4 o;
void main(){vec3 V=normalize(uCam-vP),N=normalize(vN);float t=length(uCam-vP);
 float r=length(vL.xy)/max(length(vL),1e-4);float front=step(0.,vL.z);
 vec3 c=mix(lin(uIris1),lin(uIris2),ss(uPupil,.85,r));float ang=atan(vL.y,vL.x);c*=.8+.35*vn(vec2(ang*7.,r*4.));
 c=mix(c,vec3(.01),ss(uPupil+.03,uPupil-.02,r)*front);c=mix(c,vec3(.05,.04,.03),ss(.82,.95,r));c=mix(vec3(.05,.04,.03),c,front);
 vec3 h=normalize(uSun+V);vec3 col=c*(uSunC*max(dot(N,uSun),0.)*.6+uSkyC*.7)+uSunC*1.2*pow(max(dot(N,h),0.),300.)+skyCol(reflect(-V,N))*.06;
 col=fogIt(col,-V,t);o=vec4(tone(col),1);}`;

// dust: soft lit puffs
const DUST_VS = HEAD + `in vec4 aP;in vec2 aS;uniform mat4 uVP;uniform float uPx;out float vA,vSeed;
void main(){vec4 c=uVP*vec4(aP.xyz,1);gl_Position=c;gl_PointSize=clamp(aS.x*uPx/c.w,1.,256.);vA=aS.y;vSeed=aP.w;}`;
const DUST_FS = HEAD + NOISE + SS + SKY_GLSL + `in float vA,vSeed;out vec4 o;
void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;float n=fbm(q*2.2+vSeed*13.);float a=vA*ss(1.,.15,r)*(.45+.8*n);
 vec3 c=vec3(.62,.44,.32)*(uSunC*.42+uSkyC*.9);o=vec4(tone(c)*a,a);}`;

// final soft vignette (multiplied over everything)
const VIG_FS = HEAD + `in vec2 vW;uniform vec4 uView;out vec4 o;void main(){vec2 q=vec2((vW.x-uView.x)/uView.y,vW.y/uView.z)*2.-1.;float v=1.-.22*pow(dot(q*vec2(.8,1.),q*vec2(.8,1.))*.5,1.4);o=vec4(v,v,v,1);}`;

const P = {};
function compile() {
  P.bake = program(FS_TRI, BAKE_FS);
  P.bush = program(FS_TRI, BUSH_FS);
  P.dof = program(FS_TRI, DOF_FS);
  P.comp = program(QUAD_VS, COMP_FS);
  P.coy = program(COY_VS, COY_FS);
  P.coySh = program(COY_VS, DEPTH_FS);
  P.rr = program(RR_VS, RR_FS);
  P.rrSh = program(RR_VS, DEPTH_FS);
  P.card = program(CARD_VS, CARD_FS);
  P.cardSh = program(CARD_VS, CARD_SH_FS);
  P.eye = program(EYE_VS, EYE_FS);
  P.dust = program(DUST_VS, DUST_FS);
  P.vig = program(QUAD_VS, VIG_FS);
}

// ------------------------------------------------------------------------------------------------ GPU buffers from the models
const G = {};
function vbo(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
function attr(prog, name, buf, comps, type, norm, stride, off, integer) {
  const loc = gl.getAttribLocation(prog, name); if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, comps, type, norm, stride || 0, off || 0);
}
function buildGPU() {
  const M = MD, B = gl.UNSIGNED_BYTE, SB = gl.BYTE, US = gl.UNSIGNED_SHORT;
  // coyote
  {
    const b = { pos: vbo(M.c_pos), nrm: vbo(M.c_nrm), flow: vbo(M.c_flow), base: vbo(M.c_base), band: vbo(M.c_band), tip: vbo(M.c_tip), skin: vbo(M.c_skin), misc: vbo(M.c_misc), bone: vbo(M.c_bone) };
    const idx = undelta(M.c_idx), ib = gl.createBuffer();
    const mk = (prog) => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      attr(prog, 'aPos', b.pos, 3, US, true); attr(prog, 'aNrm', b.nrm, 3, SB, true); attr(prog, 'aFlow', b.flow, 3, SB, true);
      attr(prog, 'aBase', b.base, 3, B, true); attr(prog, 'aBand', b.band, 3, B, true); attr(prog, 'aTip', b.tip, 3, B, true); attr(prog, 'aSkin', b.skin, 3, B, true);
      attr(prog, 'aMisc', b.misc, 4, B, true, 6, 0); attr(prog, 'aMisc2', b.misc, 2, B, true, 6, 4);
      attr(prog, 'aBone', b.bone, 2, B, false, 3, 0); attr(prog, 'aW', b.bone, 1, B, true, 3, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bindVertexArray(null); return vao; };
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    G.coy = { vao: mk(P.coy.p), vaoSh: mk(P.coySh.p), n: idx.length, lo: MODELS.coyote.lo, hi: MODELS.coyote.hi };
  }
  // roadrunner body, bill and legs
  {
    const b = { pos: vbo(M.r_pos), nrm: vbo(M.r_nrm), col: vbo(M.r_col), bw: vbo(M.r_bone) };
    const idx = undelta(M.r_idx), ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const mk = (prog) => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      attr(prog, 'aPos', b.pos, 3, US, true); attr(prog, 'aNrm', b.nrm, 3, SB, true); attr(prog, 'aCol', b.col, 3, B, true); attr(prog, 'aBW', b.bw, 4, B, false);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bindVertexArray(null); return vao; };
    G.rr = { vao: mk(P.rr.p), vaoSh: mk(P.rrSh.p), n: idx.length, lo: MODELS.roadrunner.lo, hi: MODELS.roadrunner.hi };
  }
  // feather cards: uv and card id rebuilt from the group layout, indices are a regular grid per card
  {
    const R = MODELS.roadrunner, nv = R.nf, uv = new Float32Array(nv * 2), cid = new Float32Array(nv);
    const idx = []; let v = 0;
    for (const [, base, n, Rr, Cc] of R.groups) {
      for (let c = 0; c < n; c++) {
        const v0 = v;
        for (let r = 0; r < Rr; r++) for (let k = 0; k < Cc; k++) { uv[v * 2] = -1 + 2 * k / (Cc - 1); uv[v * 2 + 1] = r / (Rr - 1); cid[v] = base + c; v++; }
        for (let r = 0; r < Rr - 1; r++) for (let k = 0; k < Cc - 1; k++) { const a = v0 + r * Cc + k; idx.push(a, a + Cc, a + Cc + 1, a, a + Cc + 1, a + 1); }
      }
    }
    const ia = nv < 65536 ? new Uint16Array(idx) : new Uint32Array(idx), ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ia, gl.STATIC_DRAW);
    const b = { pos: vbo(M.f_pos), uv: vbo(uv), id: vbo(cid) };
    const mk = (prog) => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      attr(prog, 'aPos', b.pos, 3, US, true); attr(prog, 'aUV', b.uv, 2, gl.FLOAT, false); attr(prog, 'aCard', b.id, 1, gl.FLOAT, false);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bindVertexArray(null); return vao; };
    // the attribute texture: 24 bytes per card = 6 RGBA8 texels, 64 cards per row
    const rows = Math.ceil(R.ncards / 64), tex = new Uint8Array(64 * 6 * rows * 4); tex.set(M.f_attr.subarray(0, R.ncards * 24));
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64 * 6, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    G.card = { vao: mk(P.card.p), vaoSh: mk(P.cardSh.p), n: ia.length, type: nv < 65536 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, tex: t };
  }
  // eye sphere
  {
    const pos = [], idx = [], S1 = 18, S2 = 12;
    for (let j = 0; j <= S2; j++) for (let i = 0; i <= S1; i++) { const th = j / S2 * Math.PI, ph = i / S1 * TAU; pos.push(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)); }
    for (let j = 0; j < S2; j++) for (let i = 0; i < S1; i++) { const a = j * (S1 + 1) + i; idx.push(a, a + S1 + 1, a + 1, a + 1, a + S1 + 1, a + S1 + 2); }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); attr(P.eye.p, 'aPos', vbo(new Float32Array(pos)), 3, gl.FLOAT, false);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW); gl.bindVertexArray(null);
    G.eye = { vao, n: idx.length };
  }
  // dust
  { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, 4096 * 24, gl.DYNAMIC_DRAW);
    const lp = gl.getAttribLocation(P.dust.p, 'aP'), ls = gl.getAttribLocation(P.dust.p, 'aS'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 4, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(ls); gl.vertexAttribPointer(ls, 2, gl.FLOAT, false, 24, 16); gl.bindVertexArray(null);
    G.dust = { vao, b, data: new Float32Array(4096 * 6) }; }
  // sun shadow map
  { const t = gl.createTexture(), N = 2048; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, N, N, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    G.sh = { t, fb, N, vp: new Float32Array(16), on: 0 }; }
}

// ------------------------------------------------------------------------------------------------ skeletons and skinning
function mkSkel(model, sideRule) {
  const rest = model.joints.map(j => j.slice()), names = {};
  model.jointNames.forEach((n, i) => names[n] = i);
  const sk = { model, rest, names, bones: model.bones, sideRule, J: rest.map(j => j.slice()), mats: new Float32Array(model.bones.length * 16) };
  sk.restF = sk.bones.map((b, i) => frameOf(rest, b, sideRule(rest, i, names)));
  return sk;
}
function frameOf(J, b, side) { const x = V3.norm(V3.sub(J[b[1]], J[b[0]])); let z = V3.sub(side, V3.mul(x, V3.dot(side, x))); if (V3.len(z) < 1e-5) z = [0, 0, 1]; z = V3.norm(z); return [x, V3.cross(z, x), z]; }
function skinMats(sk) {
  const J = sk.J, m = sk.mats;
  sk.bones.forEach((b, i) => {
    const Fc = frameOf(J, b, sk.sideRule(J, i, sk.names)), Fr = sk.restF[i], a = J[b[0]], ra = sk.rest[b[0]];
    // R = sum_k Fc[k] Fr[k]^T, t = a - R ra
    const R = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) R[c * 3 + r] += Fc[k][r] * Fr[k][c];
    const t = [a[0] - (R[0] * ra[0] + R[3] * ra[1] + R[6] * ra[2]), a[1] - (R[1] * ra[0] + R[4] * ra[1] + R[7] * ra[2]), a[2] - (R[2] * ra[0] + R[5] * ra[1] + R[8] * ra[2])];
    m.set([R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, t[0], t[1], t[2], 1], i * 16);
  });
}
const coySide = (J, i, n) => {
  const body = V3.norm(V3.add(V3.sub(J[n.HR_hip], J[n.HL_hip]), V3.sub(J[n.FR_sh], J[n.FL_sh])));
  if (i !== 3 && i !== 4) return body;
  const head = V3.cross(V3.sub(J[n.nose], J[n.skull]), V3.sub(J[n.headtop], J[n.skull]));
  return i === 4 ? head : V3.add(body, V3.norm(head));
};
const rrSide = (J, i, n) => {
  const body = V3.norm(V3.sub(J[n.hipR], J[n.hipL]));
  if (i < 1 || i > 3) return body;
  const head = V3.norm(V3.cross(V3.sub(J[n.bill], J[n.head]), V3.sub(J[n.headtop], J[n.head])));
  return i === 3 ? head : V3.add(body, head);
};

// two-bone IK: root A, target T, segment lengths, bend toward pole. Returns the middle joint.
function ik2(A, T, l1, l2, pole) {
  let d = V3.sub(T, A), L = V3.len(d); const Lc = clamp(L, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * .999);
  d = V3.mul(d, 1 / (L || 1));
  const ca = (l1 * l1 + Lc * Lc - l2 * l2) / (2 * l1 * Lc), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  let p = V3.sub(pole, V3.mul(d, V3.dot(pole, d))); p = V3.len(p) < 1e-6 ? [0, 1, 0] : V3.norm(p);
  return V3.add(A, V3.add(V3.mul(d, l1 * ca), V3.mul(p, l1 * sa)));
}

// ------------------------------------------------------------------------------------------------ the coyote's body
// Local frame: x forward, y up, z right. Rest joints come from the model (feet on y = 0).
const GAITS = {
  walk: { off: [.25, .75, 0, .5], duty: .62 },
  trot: { off: [0, .5, .5, 0], duty: .42 },
  gallop: { off: [.62, .5, 0, .1], duty: .3 },
};
function newCoyote() {
  const sk = mkSkel(MODELS.coyote, coySide), n = sk.names, R = sk.rest;
  const legJ = [['FL_sh', 'FL_el', 'FL_ca', 'FL_paw'], ['FR_sh', 'FR_el', 'FR_ca', 'FR_paw'], ['HL_hip', 'HL_st', 'HL_ho', 'HL_paw'], ['HR_hip', 'HR_st', 'HR_ho', 'HR_paw']].map(a => a.map(k => n[k]));
  const legs = legJ.map((j, i) => ({ j, front: i < 2, l1: V3.dist(R[j[0]], R[j[1]]), l2: V3.dist(R[j[1]], R[j[2]]), m: V3.sub(R[j[2]], R[j[3]]), paw: R[j[3]].slice(), off: GAITS.walk.off[i], foot: null }));
  const tail = ['tail1', 'tail2', 'tail3', 'tailtip'].map(k => n[k]);
  return {
    kind: 'coyote', sk, legs, tail, x: 0, z: 0, yaw: 0, v: 0, yawRate: 0, phase: 0, gait: 'walk', f: 1,
    p: { crouch: 0, sit: 0, lie: 0, neck: 0, head: 0, hyaw: 0, tailLift: 0, wag: 0, flex: 0, lean: 0, ear: 0, pounce: 0, shake: 0, sniff: 0, mouth: 0 },
    tgt: {}, look: null, tailP: tail.map(i => R[i].slice()), tailV: tail.map(() => [0, 0, 0]), air: 0, airV: 0, mode: 'kin', blend: 1, rag: null, prevJ: null, jv: null,
  };
}
const lerpP = (a, b, k) => a + (b - a) * k;
function coyotePose(c, dt) {
  const sk = c.sk, R = sk.rest, n = sk.names, p = c.p;
  // gait clock
  const v = Math.abs(c.v);
  const gait = c.gaitLock || (v < 1.7 ? 'walk' : v < 5.2 ? 'trot' : 'gallop');
  c.gait = gait;
  const G0 = GAITS[gait];
  c.f = v < .04 ? 0 : gait === 'walk' ? .55 + .5 * v : gait === 'trot' ? 1.35 + .24 * v : 2.0 + .075 * v;
  c.phase = (c.phase + c.f * dt) % 1;
  const duty = c.duty = lerpP(c.duty || G0.duty, G0.duty, Math.min(1, dt * 4));
  for (let i = 0; i < 4; i++) { const L = c.legs[i]; let d = G0.off[i] - L.off; d -= Math.round(d); L.off += d * Math.min(1, dt * 5); }
  const gal = gait === 'gallop' ? sstep(5, 8, v) : 0, trot = gait === 'trot' ? 1 : 0;
  const ph = c.phase * TAU;
  // torso, in local space
  const cr = p.crouch, si = p.sit, li = p.lie;
  const tor = {};
  const torsoNames = ['pelvis', 'lumbar', 'withers', 'neckbase', 'FL_sh', 'FR_sh', 'HL_hip', 'HR_hip', 'tail1'];
  const flex = gal * .055 * Math.sin(ph + 1.3) + p.flex;           // spine flexes and extends through the gallop
  const bounce = trot * .012 * Math.cos(ph * 2) + (gait === 'walk' ? .006 * Math.cos(ph * 2) : 0) * sstep(.1, .6, v);
  const pitchF = gal * .045 * Math.sin(ph + .4), pitchH = -pitchF * .8;
  for (const k of torsoNames) {
    const r = R[n[k]], hind = r[0] < -.1, front = r[0] > .1;
    let x = r[0], y = r[1], z = r[2];
    y += bounce - cr * (front ? .15 : .11) - li * (front ? .25 : .30);
    y += front ? pitchF : hind ? pitchH : 0;
    x += hind ? -flex : front ? flex * .6 : 0;
    if (k === 'lumbar') y += flex * .6 - cr * .02;
    // sitting: the hindquarters drop and tuck forward
    if (hind || k === 'lumbar') { const w = hind ? 1 : .45; y -= si * .30 * w; x += si * .07 * w; }
    if (front) y -= si * .02;
    tor[k] = [x, y, z];
  }
  // lean into turns and the shake (a roll about the body axis)
  const roll = p.lean + p.shake;
  if (roll) for (const k in tor) { const t = tor[k], h = t[1] - .35; t[2] += Math.sin(roll) * h; t[1] = .35 + Math.cos(roll) * h; }
  // head and neck
  const nb = tor.neckbase, nk = V3.sub(R[n.skull], R[n.neckbase]), nose = V3.sub(R[n.nose], R[n.skull]), top = V3.sub(R[n.headtop], R[n.skull]);
  const rotP = (vv, a) => [vv[0] * Math.cos(a) - vv[1] * Math.sin(a), vv[0] * Math.sin(a) + vv[1] * Math.cos(a), vv[2]];
  const rotY = (vv, a) => [vv[0] * Math.cos(a) - vv[2] * Math.sin(a), vv[1], vv[0] * Math.sin(a) + vv[2] * Math.cos(a)];
  const neckA = p.neck - gal * .22 - cr * .55 - p.sniff * .9 - li * .25, headA = p.head + gal * .1 + cr * .5 + p.sniff * .25 + li * .2;
  const sk1 = V3.add(nb, rotY(rotP(nk, neckA), p.hyaw * .55));
  const hr = (vv) => rotY(rotP(rotP(vv, neckA), headA), p.hyaw);
  const shk = p.shake * 1.6;
  const hrs = (vv) => { let o = hr(vv); if (shk) { const cs = Math.cos(shk), sn = Math.sin(shk); o = [o[0], o[1] * cs - o[2] * sn, o[1] * sn + o[2] * cs]; } return o; };
  const J = {};
  Object.assign(J, tor);
  J.skull = sk1; J.nose = V3.add(sk1, hrs(nose)); J.headtop = V3.add(sk1, hrs(top));
  // tail: hangs at rest, lifts to a streamer in the gallop, lies along the ground when sitting
  const t1 = tor.tail1, lift = p.tailLift + gal * .9 + cr * -.1 + si * -.25, wag = p.wag;
  const segs = [V3.sub(R[n.tail2], R[n.tail1]), V3.sub(R[n.tail3], R[n.tail2]), V3.sub(R[n.tailtip], R[n.tail3])];
  let prev = t1; const tailT = [t1];
  segs.forEach((s, i) => { let d = rotP(s, lift * (i + 1) / 3 * 1.2); d = rotY(d, wag * (i + 1) * .35); prev = V3.add(prev, d); tailT.push(prev); });
  // to world
  const fw = [Math.cos(c.yaw), 0, Math.sin(c.yaw)], rt = [-Math.sin(c.yaw), 0, Math.cos(c.yaw)];
  const toW = (l) => [c.x + fw[0] * l[0] + rt[0] * l[2], l[1], c.z + fw[2] * l[0] + rt[2] * l[2]];
  const shW = toW(tor.withers), hpW = toW(tor.pelvis);
  const yF = terr(shW[0], shW[2]), yH = terr(hpW[0], hpW[2]);
  const gx0 = R[n.pelvis][0], gx1 = R[n.withers][0];
  const ground = (lx) => lerpP(yH, yF, clamp((lx - gx0) / (gx1 - gx0), -.3, 1.3)) + c.air;
  const out = sk.J;
  const put = (name, l) => { const w = toW(l); w[1] = l[1] + ground(l[0]); out[n[name]] = w; };
  for (const k in J) put(k, J[k]);
  // tail with a little lag (springs toward its pose)
  for (let i = 0; i < 4; i++) {
    const l = tailT[i], w = toW(l); w[1] = l[1] + ground(l[0]);
    if (i === 0 || c.snap) { c.tailP[i] = w; c.tailV[i] = [0, 0, 0]; } else {
      const P0 = c.tailP[i], V = c.tailV[i], k = 90, dmp = 11;
      for (let a = 0; a < 3; a++) { V[a] += ((w[a] - P0[a]) * k - V[a] * dmp) * dt; P0[a] += V[a] * dt; }
      const seg = V3.dist(R[c.tail[i]], R[c.tail[i - 1]]), dv = V3.sub(P0, c.tailP[i - 1]), dl = V3.len(dv) || 1;
      c.tailP[i] = V3.add(c.tailP[i - 1], V3.mul(dv, seg / dl));
    }
    out[c.tail[i]] = c.tailP[i].slice();
  }
  c.snap = false;
  // legs
  const S = Math.min(v * duty / Math.max(c.f, .01), gait === 'gallop' ? 1.05 : .75);
  c.legs.forEach((L, i) => {
    const rootL = tor[i === 0 ? 'FL_sh' : i === 1 ? 'FR_sh' : i === 2 ? 'HL_hip' : 'HR_hip'];
    const root = out[L.j[0]];
    let u = (c.phase + L.off) % 1; if (u < 0) u += 1;
    let lx, ly, swing = 0;
    if (c.f === 0) { lx = 0; ly = 0; }
    else if (u < duty) { const s = u / duty; lx = S / 2 - S * s; ly = 0; }
    else { const s = (u - duty) / (1 - duty); swing = Math.sin(Math.PI * s); lx = -S / 2 + S * ease(s); ly = (L.front ? .07 : .06) * swing * (.5 + .5 * Math.min(1, v / 4)); }
    // neutral paw under the shoulder/hip, pushed forward a little with speed; folded for sit and lie
    let pl = [L.paw[0] + lx + v * .012, ly, L.paw[2] * (1 - gal * .25)];
    if (!L.front) { pl[0] = lerpP(pl[0], rootL[0] + .16, si); pl[0] = lerpP(pl[0], rootL[0] + .2, li); }
    else { pl[0] = lerpP(pl[0], L.paw[0] + .22, li); }
    if (p.pounce) { pl[0] += L.front ? p.pounce * .32 : -p.pounce * .25; pl[1] += p.pounce * (L.front ? .25 : .05); }
    const pw = toW(pl); pw[1] = terr(pw[0], pw[2]) + .012 + pl[1] + c.air * (L.front ? .9 : .7);
    if (p.pounce) pw[1] = Math.max(pw[1], terr(pw[0], pw[2]) + .012);
    // metacarpus / metatarsus: upright in stance, folding back through the swing; flat on the ground when lying or sitting
    let m = L.m.slice(); const fold = swing * (L.front ? 1.7 : .9) * Math.min(1, v / 1.2 + .25);
    m = rotP(m, L.front ? -fold : -fold * .6);
    if (!L.front) m = rotP(m, si * .95 + li * 1.05); else m = rotP(m, li * 1.25);
    const mW = V3.add(V3.mul(fw, m[0]), V3.add([0, m[1], 0], V3.mul(rt, m[2])));
    const wrist = V3.add(pw, mW);
    const pole = L.front ? V3.add(V3.mul(fw, -1), [0, -.2, 0]) : V3.add(fw, [0, -.15, 0]);
    out[L.j[1]] = ik2(root, wrist, L.l1, L.l2, pole);
    out[L.j[2]] = wrist; out[L.j[3]] = pw;
    L.foot = pw; L.swing = swing;
  });
}

// ------------------------------------------------------------------------------------------------ the roadrunner's body
function newBird() {
  const sk = mkSkel(MODELS.roadrunner, rrSide), n = sk.names, R = sk.rest;
  const legs = ['L', 'R'].map((s, i) => { const j = ['hip' + s, 'knee' + s, 'ankle' + s, 'foot' + s, 'toe' + s].map(k => n[k]);
    return { j, l1: V3.dist(R[j[0]], R[j[1]]), l2: V3.dist(R[j[1]], R[j[2]]), tar: V3.sub(R[j[2]], R[j[3]]), toe: V3.sub(R[j[4]], R[j[3]]), foot: R[j[3]].slice(), off: i * .5 }; });
  return { kind: 'bird', sk, legs, x: 0, z: 0, yaw: 0, v: 0, yawRate: 0, phase: 0, f: 0, air: 0, airV: 0,
    p: { run: 0, neck: 0, head: 0, hyaw: 0, tail: 0, crouch: 0, peck: 0, lean: 0, pump: 0, bob: 0 }, tgt: {}, look: null };
}
function birdPose(b, dt) {
  const sk = b.sk, R = sk.rest, n = sk.names, p = b.p, v = Math.abs(b.v);
  b.f = v < .03 ? 0 : v < 1.6 ? 1.6 + 1.1 * v : 2.3 + .42 * v;
  b.phase = (b.phase + b.f * dt) % 1;
  const duty = v < 1.6 ? .6 : .36, run = p.run, ph = b.phase * TAU;
  const rotP = (vv, a) => [vv[0] * Math.cos(a) - vv[1] * Math.sin(a), vv[0] * Math.sin(a) + vv[1] * Math.cos(a), vv[2]];
  const rotY = (vv, a) => [vv[0] * Math.cos(a) - vv[2] * Math.sin(a), vv[1], vv[0] * Math.sin(a) + vv[2] * Math.cos(a)];
  // body pitch: the model stands at ~35 degrees nose-up; running levels it to ~8 degrees
  const pivot = R[n.hips], dPitch = -run * .47 - p.peck * .25 + p.crouch * -.1;
  const bob = (v > .03 ? (run ? .006 : .004) * Math.cos(ph * 2) : 0) - p.crouch * .03;
  const T = {};
  for (const k of ['hips', 'chest', 'tailbase', 'hipL', 'hipR']) { const r = V3.sub(R[n[k]], pivot); const q = rotP(r, dPitch); T[k] = V3.add(pivot, [q[0], q[1] + bob, q[2]]); }
  if (p.lean) for (const k in T) { const t = T[k], h = t[1] - .1; t[2] += Math.sin(p.lean) * h; }
  // neck stretches forward and down when running, bobs when walking
  const neckA = dPitch * .6 - run * .25 + p.neck - p.peck * .9, headA = -dPitch * .7 + p.head + run * .15 + p.peck * .5;
  const n1 = V3.sub(R[n.neck], R[n.chest]), n2 = V3.sub(R[n.head], R[n.neck]), hb = V3.sub(R[n.bill], R[n.head]), ht = V3.sub(R[n.headtop], R[n.head]);
  const fwdBob = p.bob;
  T.neck = V3.add(T.chest, rotY(rotP(n1, neckA), p.hyaw * .4));
  T.head = V3.add(T.neck, rotY(rotP(V3.add(n2, [fwdBob, 0, 0]), neckA * 1.1), p.hyaw * .7));
  T.bill = V3.add(T.head, rotY(rotP(hb, neckA + headA), p.hyaw));
  T.headtop = V3.add(T.head, rotY(rotP(ht, neckA + headA), p.hyaw));
  // tail: its own angle about the tail root; streams level when running, pumps when it lands or stops
  const tl = V3.sub(R[n.tailtip], R[n.tailbase]);
  T.tailtip = V3.add(T.tailbase, rotP(tl, dPitch * .2 - run * .85 + p.tail + p.pump));
  const fw = [Math.cos(b.yaw), 0, Math.sin(b.yaw)], rt = [-Math.sin(b.yaw), 0, Math.cos(b.yaw)];
  const toW = (l) => [b.x + fw[0] * l[0] + rt[0] * l[2], l[1], b.z + fw[2] * l[0] + rt[2] * l[2]];
  const g0 = terr(b.x, b.z) + b.air, out = sk.J;
  for (const k in T) { const w = toW(T[k]); w[1] = T[k][1] + g0; out[n[k]] = w; }
  const S = Math.min(v * duty / Math.max(b.f, .01), .5);
  b.legs.forEach((L, i) => {
    let u = (b.phase + L.off) % 1, lx, ly, swing = 0;
    if (b.f === 0) { lx = 0; ly = 0; }
    else if (u < duty) { const s = u / duty; lx = S / 2 - S * s; ly = 0; }
    else { const s = (u - duty) / (1 - duty); swing = Math.sin(Math.PI * s); lx = -S / 2 + S * ease(s); ly = .045 * swing * (.4 + .6 * Math.min(1, v / 3)); }
    const fl = [L.foot[0] + lx + run * .02, ly, L.foot[2]];
    const fwW = toW(fl); fwW[1] = terr(fwW[0], fwW[2]) + .0034 + ly + b.air * .85;
    // tarsus near vertical in stance, swinging back when the foot leaves the ground
    let tv = rotP(L.tar, -swing * .9 - run * .2);
    const tvW = V3.add(V3.mul(fw, tv[0]), V3.add([0, tv[1], 0], V3.mul(rt, tv[2])));
    const ank = V3.add(fwW, tvW), hip = out[L.j[0]];
    out[L.j[1]] = ik2(hip, ank, L.l1, L.l2, V3.add(fw, [0, .3, 0]));
    out[L.j[2]] = ank; out[L.j[3]] = fwW;
    let toe = rotP(L.toe, swing * -1.1);
    out[L.j[4]] = V3.add(fwW, V3.add(V3.mul(fw, toe[0]), V3.add([0, toe[1], 0], V3.mul(rt, toe[2]))));
    L.w = fwW; L.swing = swing;
  });
}

// ------------------------------------------------------------------------------------------------ the coyote's ragdoll
// Position-based dynamics on the joints: bones and a braced torso as distance constraints, joint limits as min/max
// distances, spheres against the terrain (with friction) and against cactus, bushes and rocks.
function ragSetup(c) {
  if (c.ragC) return;
  const sk = c.sk, n = sk.names, R = sk.rest, C = [];
  const add = (a, b, k, lo, hi) => { const d = V3.dist(R[n[a]], R[n[b]]); C.push([n[a], n[b], lo === undefined ? d : d * lo, hi === undefined ? d : d * hi, k]); };
  sk.bones.forEach(([a, b]) => { const d = V3.dist(R[a], R[b]); C.push([a, b, d, d, 1]); });
  const torso = ['pelvis', 'lumbar', 'withers', 'neckbase', 'FL_sh', 'FR_sh', 'HL_hip', 'HR_hip', 'tail1'];
  for (let i = 0; i < torso.length; i++) for (let j = i + 1; j < torso.length; j++) { const lum = torso[i] === 'lumbar' || torso[j] === 'lumbar'; add(torso[i], torso[j], lum ? .35 : 1, lum ? .9 : 1, lum ? 1.08 : 1); }
  for (const [a, b] of [['skull', 'nose'], ['skull', 'headtop'], ['nose', 'headtop']]) add(a, b, 1);
  add('withers', 'skull', .8, .82, 1.04); add('neckbase', 'headtop', .6, .8, 1.15); add('lumbar', 'skull', .4, .85, 1.08);
  add('tail1', 'tail3', .5, .72, 1); add('tail2', 'tailtip', .5, .72, 1); add('pelvis', 'tail2', .6, .85, 1.06);
  for (const s of ['L', 'R']) {
    add('F' + s + '_sh', 'F' + s + '_ca', .9, .5, 1); add('F' + s + '_el', 'F' + s + '_paw', .8, .55, 1); add('withers', 'F' + s + '_el', .7, .72, 1.18); add('lumbar', 'F' + s + '_el', .5, .75, 1.3);
    add('H' + s + '_hip', 'H' + s + '_ho', .9, .45, 1); add('H' + s + '_st', 'H' + s + '_paw', .8, .5, 1); add('pelvis', 'H' + s + '_st', .7, .7, 1.2); add('lumbar', 'H' + s + '_st', .5, .7, 1.25);
  }
  c.ragC = C;
  const rad = {}, mass = {};
  for (const k in n) { rad[k] = .022; mass[k] = 1; }
  Object.assign(rad, { pelvis: .085, lumbar: .095, withers: .1, neckbase: .075, skull: .065, nose: .025, headtop: .045, tail1: .045, tail2: .04, tail3: .035, tailtip: .03, FL_sh: .06, FR_sh: .06, HL_hip: .07, HR_hip: .07, FL_el: .04, FR_el: .04, HL_st: .045, HR_st: .045 });
  Object.assign(mass, { pelvis: 4, lumbar: 4, withers: 5, neckbase: 2.5, skull: 1.5, FL_sh: 2, FR_sh: 2, HL_hip: 2.5, HR_hip: 2.5 });
  c.ragR = sk.J.map((_, i) => rad[sk.model.jointNames[i]]);
  c.ragW = sk.J.map((_, i) => 1 / mass[sk.model.jointNames[i]]);
}
function ragStart(c, kick) {
  ragSetup(c);
  const h = 1 / 240, J = c.sk.J;
  // keep only part of the run in the tumble: a full-speed somersault would carry it out of a frame this narrow
  const pos = J.map(j => j.slice()), vel = (c.jv || J.map(() => [0, 0, 0])).map(v => [v[0] * .62, v[1], v[2] * .62]);
  const prev = pos.map((p, i) => V3.sub(p, V3.mul(V3.add(vel[i], kick ? kick(i, p) : [0, 0, 0]), h)));
  c.rag = { pos, prev, t: 0, still: 0, h };
  c.mode = 'rag';
}
function ragStep(c, dt) {
  const r = c.rag, C = c.ragC, Rr = c.ragR, Wm = c.ragW, h = r.h, steps = Math.max(1, Math.round(dt / h));
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < r.pos.length; i++) { const p = r.pos[i], q = r.prev[i]; const vx = (p[0] - q[0]) * .999, vy = (p[1] - q[1]) * .999, vz = (p[2] - q[2]) * .999; q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; p[0] += vx; p[1] += vy - 9.8 * h * h; p[2] += vz; }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, lo, hi, k] of C) {
        const pa = r.pos[a], pb = r.pos[b], dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2], d = Math.hypot(dx, dy, dz) || 1e-6;
        const tgt = d < lo ? lo : d > hi ? hi : d; if (tgt === d) continue;
        const wa = Wm[a], wb = Wm[b], f = (d - tgt) / d / (wa + wb) * k;
        pa[0] += dx * f * wa; pa[1] += dy * f * wa; pa[2] += dz * f * wa; pb[0] -= dx * f * wb; pb[1] -= dy * f * wb; pb[2] -= dz * f * wb;
      }
      for (let i = 0; i < r.pos.length; i++) {
        const p = r.pos[i], q = r.prev[i], rad = Rr[i], g = terr(p[0], p[2]);
        if (p[1] - rad < g) {
          const sp = Math.hypot(p[0] - q[0], p[2] - q[2]) / h;
          p[1] = g + rad;
          const mu = .35; q[0] = p[0] - (p[0] - q[0]) * (1 - mu); q[2] = p[2] - (p[2] - q[2]) * (1 - mu); if (q[1] < p[1] - .002) q[1] = p[1] - (p[1] - q[1]) * .15;
          if (it === 0 && sp > 1.6 && Math.random() < .25 * h * 240) puff([p[0], g + .02, p[2]], Math.min(1, sp / 6), sp);
        }
        const hit = propHit(p[0], p[1], p[2], rad);
        if (hit) { p[0] += hit.nx * hit.pen; p[2] += hit.nz * hit.pen; if (hit.p.type === PT.ROCK && p[1] < hit.top + rad) p[1] = Math.max(p[1], p[1] + hit.pen * .5); q[0] = p[0] - (p[0] - q[0]) * .5; q[2] = p[2] - (p[2] - q[2]) * .5; c.hitProp = hit.p; }
      }
    }
  }
  r.t += dt;
  let ke = 0; for (let i = 0; i < r.pos.length; i++) ke = Math.max(ke, V3.dist(r.pos[i], r.prev[i]) / h);
  r.still = ke < .25 ? r.still + dt : 0;
  c.sk.J = r.pos.map(p => p.slice());
  return r.still > .45 || r.t > 4.5;
}
// where the coyote lies, as a root for the get-up
function ragRoot(c) {
  const J = c.sk.J, n = c.sk.names, a = J[n.pelvis], b = J[n.withers];
  return { x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, yaw: Math.atan2(b[2] - a[2], b[0] - a[0]) };
}

// ------------------------------------------------------------------------------------------------ dust
const dust = [];
function puff(p, amt, speed) {
  const n = 2 + Math.round(amt * 6);
  for (let i = 0; i < n && dust.length < 4000; i++) dust.push({ p: [p[0] + rnd(-.05, .05), p[1] + rnd(0, .04), p[2] + rnd(-.05, .05)], v: [rnd(-.4, .4) * (1 + speed * .15), rnd(.15, .7) * (1 + amt), rnd(-.4, .4) * (1 + speed * .15)], s: rnd(.06, .16) * (.6 + amt), life: rnd(1.2, 2.6) * (.6 + amt * .6), age: 0, a: rnd(.25, .5) * (.4 + amt * .6), seed: rnd(10) });
}
function stepDust(dt) {
  for (const d of dust) { d.age += dt; d.v[1] -= .25 * dt; d.v = V3.mul(d.v, Math.exp(-dt * 1.6)); d.p = V3.mad(d.p, d.v, dt); d.s += dt * .22; const g = terr(d.p[0], d.p[2]); if (d.p[1] < g) d.p[1] = g; }
  for (let i = dust.length - 1; i >= 0; i--) if (dust[i].age > dust[i].life) dust.splice(i, 1);
}

// ------------------------------------------------------------------------------------------------ the director
// Every attempt picks how it will fail before it starts, and the bird runs to make it happen. The coyote never closes
// the last half metre: a guard forces a dodge if the plan has not finished it by then.
const A = { coy: null, bird: null };
let timeScale = 1, slowT = 0, fails = 0, attempts = 0, lastPlan = '', beetle = null, callNow = false;
const LANE = { z0: -2.4, z1: 1.8 };
const onScreen = (x, m = 0) => Math.abs(x) < CAM.halfW - m;
function steer(a, tx, tz, vmax, dt, o = {}) {
  let dx = tx - a.x, dz = tz - a.z; const d = Math.hypot(dx, dz);
  if (o.avoid) for (const p of props) { if (p.z < -10 || p.type === PT.SAGUARO || p === o.ignore) continue; const ox = a.x - p.x, oz = a.z - p.z, od = Math.hypot(ox, oz), rr = (p.type === PT.ROCK ? p.r : p.r * .85) + o.avoid; if (od < rr + .8 && od > 1e-3) { const k = (rr + .8 - od) / .8 * 2.2; dx += ox / od * k * d * .4; dz += oz / od * k * d * .4; } }
  const want = Math.atan2(dz, dx), v = Math.abs(a.v);
  const turnMax = o.turn || (a.kind === 'coyote' ? 6 / (1 + v * .42) : 10 / (1 + v * .12));
  const dy = angDiff(want, a.yaw), stp = clamp(dy, -turnMax * dt, turnMax * dt);
  a.yaw += stp; a.yawRate = lerp(a.yawRate || 0, stp / Math.max(dt, 1e-4), Math.min(1, dt * 8));
  let vt = vmax; if (o.arrive && d < o.arrive) vt = vmax * d / o.arrive;
  if (a.kind === 'coyote' && !o.noBrake) vt *= 1 - .5 * Math.min(1, Math.abs(dy) / 1.8);
  const acc = a.kind === 'coyote' ? 9.5 : 16, dec = a.kind === 'coyote' ? 11 : 20;
  a.v += clamp(vt - a.v, -dec * dt, acc * dt);
  a.x += Math.cos(a.yaw) * a.v * dt; a.z += Math.sin(a.yaw) * a.v * dt;
  return d;
}
const toward = (p, v, k) => p + (v - p) * Math.min(1, k);
function setP(a, key, v, dt, k = 4) { a.p[key] = toward(a.p[key], v, dt * k); }
function lookAt(a, tx, tz, dt) { const rel = angDiff(Math.atan2(tz - a.z, tx - a.x), a.yaw); setP(a, 'hyaw', clamp(rel, -1.1, 1.1), dt, 5); }

function resetActors() {
  A.coy = newCoyote(); A.bird = newBird();
  const b = A.bird; b.x = rnd(-.6, .6) * CAM.halfW; b.z = rnd(LANE.z0 + .6, LANE.z1 - .4); b.yaw = rnd(TAU); b.st = 'forage'; b.stT = rnd(1, 3);
  const c = A.coy; c.x = -CAM.halfW - 8; c.z = 0; c.st = 'away'; c.stT = rnd(6, 14); c.snap = true;
  birdPose(b, 1 / 60); coyotePose(c, 1 / 60);
}

// ---- the bird
function birdBrain(b, c, dt) {
  b.stT -= dt;
  const cd = Math.hypot(c.x - b.x, c.z - b.z), danger = c.st === 'charge' || c.st === 'pounce';
  const p = b.p;
  switch (b.st) {
    case 'offscreen':
      b.v = 0; if (b.stT < 0) { const s = Math.random() < .5 ? -1 : 1; b.x = s * (CAM.halfW + 3); b.z = rnd(LANE.z0 + .5, LANE.z1 - .5); b.st = 'enter'; b.tx = rnd(-.4, .4) * CAM.halfW; b.tz = rnd(LANE.z0 + .5, LANE.z1 - .5); }
      break;
    case 'enter':
      setP(b, 'run', 1, dt, 6); if (steer(b, b.tx, b.tz, 6.5, dt, { arrive: 2.5, avoid: .25 }) < .3) { b.st = 'forage'; b.stT = rnd(1, 3); }
      break;
    case 'forage': {
      // short walks, stops, pecks, looks around; now and then a dash after an insect
      if (beetle) { b.st = 'snack'; break; }
      if (!b.tx || b.stT < 0) { const r = Math.random(); b.dash = r < .12; b.tx = clamp(b.x + rnd(-2.5, 2.5) * (b.dash ? 1.6 : 1), -CAM.halfW * .45, CAM.halfW * .45); b.tz = clamp(b.z + rnd(-1, 1), LANE.z0 + .3, LANE.z1 - .2); b.stT = rnd(2, 5); b.pause = rnd(.6, 2.4); }
      const d = Math.hypot(b.tx - b.x, b.tz - b.z);
      if (d > .25) { setP(b, 'run', b.dash ? 1 : 0, dt, 5); steer(b, b.tx, b.tz, b.dash ? 4.5 : .9, dt, { arrive: .6, avoid: .25 }); p.bob = .006 * Math.sin(b.phase * TAU * 2); }
      else { b.v = toward(b.v, 0, dt * 10); setP(b, 'run', 0, dt, 4); b.pause -= dt; if (b.pause < 0) b.stT = -1;
        const pk = (Math.sin(performance.now() / 1000 * 3.1 + b.x) > .82) ? 1 : 0; setP(b, 'peck', pk, dt, 12); setP(b, 'hyaw', Math.sin(performance.now() / 1300 + b.z * 3) * .7, dt, 2); }
      setP(b, 'pump', 0, dt, 3);
      if (c.st === 'stalk' && cd < 8 && Math.random() < dt * (cd < 4 ? .5 : .12)) { b.st = 'alert'; b.stT = rnd(.6, 1.4); }
      if (danger && cd < 9) { b.st = 'flee'; b.fleeT = 0; }
      break;
    }
    case 'snack': {
      if (!beetle) { b.st = 'forage'; break; }
      setP(b, 'run', 1, dt, 6); const d = steer(b, beetle.x, beetle.z, 5.5, dt, { arrive: 1, avoid: .2 });
      if (d < .2) { b.v = 0; setP(b, 'peck', 1, dt, 14); beetle.eat = (beetle.eat || 0) + dt; if (beetle.eat > .5) { beetle = null; b.st = 'forage'; b.stT = rnd(1, 2); } }
      if (danger && cd < 9) { b.st = 'flee'; b.fleeT = 0; beetle = null; }
      break;
    }
    case 'alert':
      b.v = toward(b.v, 0, dt * 12); setP(b, 'run', 0, dt, 6); setP(b, 'peck', 0, dt, 10); setP(b, 'tail', .25, dt, 6); lookAt(b, c.x, c.z, dt);
      p.pump = .18 * Math.sin(performance.now() / 160) * Math.max(0, b.stT);
      if (danger) { b.st = 'flee'; b.fleeT = 0; }
      else if (b.stT < -2.5 && (c.st !== 'stalk' || (Math.abs(c.v) < .05 && b.stT < -3.5))) { b.st = 'forage'; setP(b, 'tail', 0, 1, 1); }
      break;
    case 'flee': fleeBrain(b, c, dt, cd); break;
    case 'safe':
      // pull up inside the frame and look back at the wreck; if it already ran clean off, it is gone
      if (!onScreen(b.x, -3)) { b.st = 'offscreen'; b.stT = rnd(4, 12); break; }
      if (!onScreen(b.x, 1)) { setP(b, 'run', 1, dt, 6); steer(b, clamp(b.x, -CAM.halfW + 1.3, CAM.halfW - 1.3), clamp(b.z, LANE.z0 + .3, LANE.z1 - .2), 3.5, dt, { arrive: .8, avoid: .25 }); b.stT = Math.max(b.stT, 2); break; }
      b.v = toward(b.v, 0, dt * 8); setP(b, 'run', 0, dt, 5); setP(b, 'tail', .3, dt, 4); lookAt(b, c.x, c.z, dt);
      p.pump = .2 * Math.sin(performance.now() / 140) * Math.max(0, b.stT - 1);
      if (b.stT < 0) { if (!onScreen(b.x, .5) || Math.random() < .35) { b.st = 'exit'; b.tx = (b.x > 0 ? 1 : -1) * (CAM.halfW + 4); b.tz = b.z; } else { b.st = 'forage'; b.stT = 2; setP(b, 'tail', 0, 1, 1); } }
      break;
    case 'exit':
      setP(b, 'run', 1, dt, 6); setP(b, 'tail', 0, dt, 3); if (steer(b, b.tx, b.tz, 6, dt, { avoid: .25 }) < 1 || !onScreen(b.x, -2.5)) { b.st = 'offscreen'; b.stT = rnd(4, 12); }
      break;
  }
  if (b.st !== 'alert' && b.st !== 'safe' && b.st !== 'forage') setP(b, 'hyaw', 0, dt, 4);
  if (b.st !== 'forage' && b.st !== 'snack') setP(b, 'peck', 0, dt, 10);
  setP(b, 'lean', clamp(-(b.yawRate || 0) * Math.abs(b.v) * .02, -.35, .35), dt, 8);
}
function fleeBrain(b, c, dt, cd) {
  const plan = c.plan || { kind: 'cut' }, p = b.p;
  b.fleeT += dt; setP(b, 'run', 1, dt, 9); setP(b, 'tail', 0, dt, 5); setP(b, 'peck', 0, dt, 12);
  const away = Math.sign(b.x - c.x) || 1;
  let tx = b.x + away * 6, tz = clamp(b.z + (b.z > 0 ? -1 : 1) * .5, LANE.z0, LANE.z1), sp = plan.kind === 'cactus' || plan.kind === 'rock' || plan.kind === 'wash' ? 8.6 : 7.8, ign = null;
  if (plan.kind === 'cactus' && plan.prop) {
    const q = plan.prop, side = plan.side;
    if (!plan.passed) { tx = q.x - plan.dir * .2; tz = q.z + side * (q.r + .65); if (Math.hypot(tx - b.x, tz - b.z) < .5) plan.passed = true; }
    else { tx = q.x + plan.dir * 2.5; tz = q.z - side * .9; }
    ign = q;
  } else if (plan.kind === 'wash') { const far = plan.dir; tx = washC(b.z) + far * (TER.wash[3] + 3.5); tz = b.z; if (Math.abs(b.x - washC(b.z)) > TER.wash[3] + 3 && Math.sign(b.x - washC(b.z)) === far) { tx = b.x + far * 6; } }
  else if (plan.kind === 'rock' && plan.prop) { const q = plan.prop; if (!plan.passed) { tx = q.x + plan.dir * .3; tz = q.z + plan.side * (q.r + .45); if ((b.x - q.x) * plan.dir > .1) plan.passed = true; } else { tx = b.x + plan.dir * 6; tz = q.z + plan.side * .6; } ign = q; }
  else if (plan.kind === 'outrun') { tx = away * (CAM.halfW + 6); sp = 8.6; }
  // the cut: when the coyote is right there, turn hard toward the open side
  // across the coyote's line, toward the middle of the lane, so the bird stays in frame while the coyote overshoots
  if (plan.kind === 'cut' && !plan.cutDone && cd < 1.7 && Math.abs(c.v) > 2) { plan.cutDone = true; const side = b.z > (LANE.z0 + LANE.z1) / 2 ? -1 : 1; plan.cutYaw = c.yaw + side * Math.sign(Math.cos(c.yaw) || 1) * Math.PI * rnd(.42, .6); b.yaw = toward(b.yaw, plan.cutYaw, .45); }
  if (plan.kind === 'cut' && !plan.cutDone) { tx = b.x; tz = b.z; sp = 0; }   // hold, hold, hold...
  if (plan.cutDone) { tx = b.x + Math.cos(plan.cutYaw) * 5; tz = clamp(b.z + Math.sin(plan.cutYaw) * 5, LANE.z0 - 1, LANE.z1 + .8); }
  // pounce: a quick sidestep, then away
  if (plan.kind === 'pounce' && plan.side) { if (!plan.hopT) plan.hopT = .28; plan.hopT -= dt; if (plan.hopT > 0) { tx = b.x + Math.cos(b.yaw) * .2 - Math.sin(c.yaw) * plan.side * 2; tz = b.z + Math.cos(c.yaw) * plan.side * 2; sp = 5; } }
  steer(b, tx, tz, sp, dt, { avoid: .22, ignore: ign, turn: plan.cutDone ? 22 : undefined });
  if (c.st === 'rag' || c.st === 'getup' || c.st === 'frustrated' || c.st === 'shake' || c.st === 'skid' || b.fleeT > 7) { if (b.fleeT > .5) { b.st = 'safe'; b.stT = rnd(3, 5.5); } }
}

// ---- the coyote
// what the bird could lead the coyote into if it ran toward dir from where it stands
function gagsAhead(b, dir) {
  const ahead = (q) => (q.x - b.x) * dir;
  const cact = props.filter(q => (q.type === PT.CHOLLA || q.type === PT.PEAR) && q.z > LANE.z0 - .8 && q.z < LANE.z1 + .6 && ahead(q) > .8 && ahead(q) < 4.5 && onScreen(q.x, 1.4));
  const wx = washC(b.z), wa = (wx - b.x) * dir, wash = wa > .8 && wa < 4.5 && onScreen(wx, 1.6) && washFade(b.z) > .8;
  const rocks = props.filter(q => q.type === PT.ROCK && q.r > .14 && q.z > LANE.z0 && q.z < LANE.z1 && ahead(q) > .8 && ahead(q) < 4 && onScreen(q.x, 1.4));
  return { ahead, cact, rocks, wx, wash, any: cact.length + rocks.length + (wash ? 1 : 0) };
}
function choosePlan(c, b) {
  const dir = Math.sign(b.x - c.x) || 1, opts = [['cut', 3], ['pounce', 2], ['outrun', .8]];
  const forced = c.forcePlan; c.forcePlan = null;
  const g = gagsAhead(b, dir), { ahead, cact, rocks, wx } = g;
  if (cact.length) opts.push(['cactus', 3.5]);
  if (g.wash) opts.push(['wash', 3]);
  if (rocks.length) opts.push(['rock', 2]);
  let tot = opts.reduce((s, o) => s + (o[0] === lastPlan ? o[1] * .25 : o[1]), 0), r = Math.random() * tot, kind = 'cut';
  for (const o of opts) { r -= o[0] === lastPlan ? o[1] * .25 : o[1]; if (r <= 0) { kind = o[0]; break; } }
  if (forced && (opts.some(o => o[0] === forced))) kind = forced;
  lastPlan = kind;
  const plan = { kind, dir, side: Math.random() < .5 ? -1 : 1 };
  if (kind === 'cactus') { cact.sort((p, q) => ahead(p) - ahead(q)); plan.prop = cact[0]; plan.side = plan.prop.z > b.z ? -1 : 1; }
  if (kind === 'rock') { rocks.sort((p, q) => ahead(p) - ahead(q)); plan.prop = rocks[0]; }
  if (kind === 'wash') plan.dir = Math.sign(wx - b.x) || dir;
  return plan;
}
function fail(c, how, kick) {
  fails++;
  if (S.slowmo) { slowT = 1.5; }
  ragStart(c, kick); c.st = 'rag'; c.failHow = how;
  const J = c.sk.J; puff(J[c.sk.names.withers], .8, Math.abs(c.v));
}
function coyoteBrain(c, b, dt) {
  c.stT -= dt;
  const p = c.p, n = c.sk.names, cd = Math.hypot(b.x - c.x, b.z - c.z);
  if (c.mode === 'kin') { c.p.lean = toward(c.p.lean, clamp(-(c.yawRate || 0) * Math.abs(c.v) * .025, -.4, .4), dt * 6); }
  switch (c.st) {
    case 'away':
      c.v = 0; p.sit = 0; p.crouch = 0;
      if ((c.stT < 0 || callNow) && (b.st === 'forage' || b.st === 'alert' || b.st === 'snack') && Math.abs(b.x) < CAM.halfW * .5) {
        callNow = false; attempts++;
        // come in from the side with more room, and stop where the stalk will still be on screen
        // (and, when there is a choice, from the side that puts a cactus, rock or the wash beyond the bird)
        let side = b.x > 0 ? -1 : 1;
        const ok = [-1, 1].filter(sd => Math.abs(b.x - sd * (CAM.halfW - .6)) >= 2.6), gag = ok.filter(sd => gagsAhead(b, -sd).any);
        if (gag.length && Math.random() < .75) side = gag[(Math.random() * gag.length) | 0]; else if (ok.length && !ok.includes(side)) side = ok[0];
        const room = Math.abs(b.x - side * (CAM.halfW - .6));
        c.x = side * (CAM.halfW + 3); c.z = clamp(b.z + rnd(-1, 1), LANE.z0, LANE.z1); c.yaw = side < 0 ? 0 : Math.PI;
        c.sx = b.x + side * clamp(room, 2.6, 6.5); c.st = 'enter'; c.snap = true; c.plan = null;
      }
      break;
    case 'enter': {
      setP(c, 'crouch', 0, dt); setP(c, 'sit', 0, dt);
      const tx = c.sx;
      steer(c, tx, clamp(b.z + .3, LANE.z0, LANE.z1), 2.6, dt, { avoid: .45 });
      if (Math.abs(c.x - tx) < .5 || (cd < 3 && onScreen(c.x, .4))) { c.st = 'notice'; c.stT = rnd(.8, 1.6); c.plan = choosePlan(c, b); }
      break;
    }
    case 'notice':
      c.v = toward(c.v, 0, dt * 6); setP(c, 'head', .15, dt, 4); lookAt(c, b.x, b.z, dt); steer(c, b.x, b.z, 0, dt);
      if (c.stT < 0) { const st = (c.plan.kind === 'pounce' || Math.random() < .6 || cd > 4.5 || cd < 3) ? 'stalk' : 'charge'; c.st = st; c.stT = st === 'stalk' ? (c.plan.kind === 'pounce' ? rnd(9, 15) : rnd(4, 9)) : 6; c.chT = 0; }
      break;
    case 'stalk': {
      setP(c, 'crouch', 1, dt, 3); setP(c, 'head', 0, dt, 3); lookAt(c, b.x, b.z, dt);
      const freeze = b.st === 'alert' || Math.sin(performance.now() / 900 + c.x) > .7;
      steer(c, b.x, b.z, freeze ? 0 : .55, dt, { avoid: .45 });
      const goPounce = c.plan.kind === 'pounce' && cd < 2.3 && b.st !== 'alert';
      if (goPounce) startPounce(c, b);
      else if ((c.plan.kind !== 'pounce' && cd < rnd(3.2, 4.2)) || c.stT < 0 || (c.plan.kind !== 'pounce' && b.st === 'alert' && cd < 4)) { c.st = 'charge'; c.stT = 6; c.chT = 0; if (c.plan.kind === 'pounce') c.plan.kind = 'cut'; }
      break;
    }
    case 'charge': {
      setP(c, 'crouch', 0, dt, 6); setP(c, 'hyaw', 0, dt, 4); setP(c, 'head', 0, dt, 4);
      c.chT = (c.chT || 0) + dt;
      // the bird holds its ground until the last moment, then goes
      // (a cut needs the coyote right on top of it: the frame is only a few metres wide, so no straight-line chase first)
      const lead = c.plan.kind === 'cactus' || c.plan.kind === 'rock' || c.plan.kind === 'wash';   // these need the bird out in front
      const holdTo = c.plan.kind === 'cut' ? 1.6 : lead ? 3.1 : 2.3, holdT = c.plan.kind === 'cut' ? 3 : lead ? .5 : .9;
      if (b.st !== 'flee' && (cd < holdTo || c.chT > holdT || c.plan.kind === 'outrun')) { b.st = 'flee'; b.fleeT = 0; }
      else if (b.st !== 'flee') { b.st = 'alert'; b.stT = 2; }
      const pl = c.plan;
      let tx = b.x + Math.cos(b.yaw) * b.v * .25, tz = b.z + Math.sin(b.yaw) * b.v * .25, o = { noBrake: true };
      if (pl.kind === 'cactus' && pl.passed) { tx = pl.prop.x; tz = pl.prop.z + pl.side * .15; o.turn = 1.6; }
      if (pl.kind === 'rock' && pl.passed) { tx = pl.prop.x; tz = pl.prop.z; o.turn = 1.4; }
      if (pl.kind === 'cut' && pl.cutDone) { o.turn = 1.1; tx = c.x + Math.cos(c.yaw) * 4; tz = c.z + Math.sin(c.yaw) * 4; pl.overT = (pl.overT || 0) + dt; }
      if (pl.kind === 'outrun' && c.stT < 3.4) { tx = c.x + Math.cos(c.yaw) * 3; tz = c.z + Math.sin(c.yaw) * 3; }
      steer(c, tx, tz, pl.kind === 'outrun' ? (c.stT < 3.4 ? 0 : 13) : 9.5, dt, o);   // flat out only when the bird is going to outrun it anyway
      if (Math.abs(c.v) > 6 && Math.random() < dt * 8) { const L = c.legs[(Math.random() * 4) | 0]; if (L.foot) puff(L.foot, .25, c.v); }
      // the endings
      const nose = c.sk.J[n.nose], fw = [Math.cos(c.yaw), 0, Math.sin(c.yaw)], rt = [-Math.sin(c.yaw), 0, Math.cos(c.yaw)];
      if (pl.kind === 'cut' && pl.cutDone && pl.overT > .14 && !pl.slipped) {
        pl.slipped = true;
        if (Math.random() < .72) { const out = Math.sign(angDiff(pl.cutYaw, c.yaw)) || 1; fail(c, 'slip', (i, q) => V3.add(V3.mul(rt, -out * (1.2 + (q[1] - terr(q[0], q[2])) * 4.5)), [0, .6, 0])); }
        else { c.st = 'skid'; c.stT = .9; }
      }
      if (c.st === 'charge' && pl.kind === 'cactus') { for (const k of ['withers', 'skull', 'FL_sh', 'FR_sh']) { const q = c.sk.J[n[k]], h = propHit(q[0], q[1], q[2], .06); if (h && h.p === pl.prop) { fail(c, 'cactus', (i, qq) => V3.add(V3.mul(fw, -Math.abs(c.v) * .85), [0, 1.2 + (qq[1] - terr(qq[0], qq[2])) * 1.8, 0])); break; } } }
      if (c.st === 'charge' && pl.kind === 'rock') { const q = pl.prop; if (Math.hypot(nose[0] - q.x, nose[2] - q.z) < q.r + .35 || c.legs.some(L => L.foot && Math.hypot(L.foot[0] - q.x, L.foot[2] - q.z) < q.r + .05)) fail(c, 'trip', (i, qq) => { const h = qq[1] - terr(qq[0], qq[2]), front = V3.dot(V3.sub(qq, [c.x, 0, c.z]), fw); return V3.add(V3.mul(fw, -front * 2.6), [0, (front < 0 ? 1.9 : -.4) + h * 1.6, 0]); }); }
      if (c.st === 'charge' && pl.kind === 'wash') { const dx = Math.abs(c.x - washC(c.z)); if (dx < TER.wash[3] + .55 && Math.abs(c.v) > 5) fail(c, 'wash', (i, qq) => { const front = V3.dot(V3.sub(qq, [c.x, 0, c.z]), fw); return [0, front < 0 ? 2.2 : -.6, 0]; }); }
      // the guard: never the last half metre
      if (c.st === 'charge' && V3.dist(nose, [b.x, terr(b.x, b.z) + .15, b.z]) < .6) {
        if (pl.kind !== 'cut') { pl.kind = 'cut'; }
        if (!pl.cutDone) { pl.cutDone = true; pl.cutYaw = b.yaw + Math.PI * .7 * (Math.random() < .5 ? -1 : 1); }
      }
      if (c.st === 'charge' && (c.stT < 0 || (pl.kind === 'outrun' && c.stT < 2.6) || !onScreen(c.x, -4))) { c.st = 'skid'; c.stT = .8; }
      break;
    }
    case 'pounce': {
      const t = (c.pT += dt), T = c.pDur;
      const k = Math.min(1, t / T);
      c.air = Math.max(0, 4 * c.pH * k * (1 - k)); c.x += Math.cos(c.yaw) * c.pV * dt; c.z += Math.sin(c.yaw) * c.pV * dt; c.v = c.pV * .4;
      p.pounce = Math.sin(Math.PI * k); setP(c, 'crouch', 0, dt, 10);
      if (k > .3 && !c.plan.side) { c.plan.side = Math.random() < .5 ? -1 : 1; b.st = 'flee'; b.fleeT = 0; }
      if (k >= 1) { c.air = 0; p.pounce = 0; if (Math.random() < .7) fail(c, 'faceplant', (i, qq) => { const front = V3.dot(V3.sub(qq, [c.x, 0, c.z]), [Math.cos(c.yaw), 0, Math.sin(c.yaw)]); return [Math.cos(c.yaw) * 1.5, front > 0 ? -1.2 : 1.6, Math.sin(c.yaw) * 1.5]; }); else { c.st = 'frustrated'; c.stT = rnd(3, 5); puff([c.x, terr(c.x, c.z), c.z], .6, 2); } }
      break;
    }
    case 'skid':
      c.v = toward(c.v, 0, dt * 9); c.x += Math.cos(c.yaw) * c.v * dt; c.z += Math.sin(c.yaw) * c.v * dt;
      if (Math.random() < dt * 30) { const L = c.legs[(Math.random() * 4) | 0]; if (L.foot) puff(L.foot, .5, c.v); }
      if (c.stT < 0) { c.st = 'frustrated'; c.stT = rnd(3, 6); }
      break;
    case 'rag':
      if (ragStep(c, dt)) { const r = ragRoot(c); c.ragJ = c.sk.J.map(j => j.slice()); c.x = r.x; c.z = r.z; c.yaw = r.yaw; c.v = 0; c.mode = 'getup'; c.st = 'getup'; c.stT = 1.2; c.snap = true; Object.assign(p, { crouch: 0, sit: 0, lie: 1, pounce: 0, lean: 0, shake: 0 }); }
      break;
    case 'getup':
      setP(c, 'lie', 0, dt, 2.2);
      if (c.stT < 0) { c.mode = 'kin'; c.st = 'shake'; c.stT = 1.1; c.ragJ = null; puff(c.sk.J[n.withers], .9, 2); }
      break;
    case 'shake':
      p.shake = .42 * Math.sin(c.stT * 30) * sstep(0, .25, c.stT) * sstep(1.1, .85, c.stT);
      if (c.stT < 0) { p.shake = 0; c.st = 'frustrated'; c.stT = rnd(3, 6); }
      break;
    case 'frustrated':
      if (!onScreen(c.x, .9)) { steer(c, Math.sign(c.x) * (CAM.halfW - 1.4), clamp(c.z, LANE.z0, LANE.z1), 2.4, dt, { avoid: .45 }); c.stT = Math.max(c.stT, 3); break; }
      c.v = toward(c.v, 0, dt * 6); lookAt(c, b.x, b.z, dt); steer(c, b.x, b.z, 0, dt);
      setP(c, 'sit', c.stT < 2.2 ? 0 : 1, dt, 1.5); setP(c, 'head', -.05, dt, 2);
      if (c.stT < 0) { c.st = 'leave'; c.tx = (c.x > b.x ? 1 : -1) * (CAM.halfW + 5); }
      break;
    case 'leave':
      setP(c, 'sit', 0, dt, 3); setP(c, 'hyaw', 0, dt, 3);
      steer(c, c.tx, clamp(c.z, LANE.z0, LANE.z1), 2.2, dt, { avoid: .45 });
      if (!onScreen(c.x, -3.5)) { c.st = 'away'; const g = (TRIES[S.tries] || TRIES.often).gap; c.stT = rnd(g[0], g[1]); }
      break;
  }
}
function startPounce(c, b) {
  c.st = 'pounce'; c.pT = 0; c.pDur = .62; c.pH = .55;
  const d = Math.hypot(b.x - c.x, b.z - c.z); c.yaw = Math.atan2(b.z - c.z, b.x - c.x); c.pV = (d - .25) / c.pDur; c.plan.side = 0;
}

// ------------------------------------------------------------------------------------------------ drawing
function sunFrame() {
  const T = TIMES[S.time] || TIMES.golden, s = V3.norm(T.sun);
  const c = A.coy, b = A.bird, pts = [];
  if (onScreen(c.x, -3)) pts.push(c.sk.J[c.sk.names.withers]);
  if (onScreen(b.x, -2)) pts.push(b.sk.J[b.sk.names.hips]);
  if (!pts.length) { G.sh.on = 0; return; }
  const C = pts.length > 1 ? V3.lerp(pts[0], pts[1], .5) : pts[0], Rr = pts.length > 1 ? Math.max(1.7, V3.dist(pts[0], pts[1]) / 2 + 1.5) : 1.7, Z = 6;
  const f = V3.mul(s, -1), r = V3.norm(V3.cross(f, [0, 1, 0])), u = V3.cross(r, f);
  const row = (a, k) => [a[0] / k, a[1] / k, a[2] / k, -V3.dot(a, C) / k];
  const R0 = row(r, Rr), R1 = row(u, Rr), R2 = row(f, Z);
  G.sh.vp.set([R0[0], R1[0], R2[0], 0, R0[1], R1[1], R2[1], 0, R0[2], R1[2], R2[2], 0, R0[3], R1[3], R2[3], 1]); G.sh.on = 1;
}
function animalUniforms(p, VP) {
  const u = p.u; timeUniforms(u);
  gl.uniformMatrix4fv(u.uVP, false, VP); if (u.uCam) gl.uniform3fv(u.uCam, CAM.pos);
  if (u.uSh) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.sh.t); gl.uniform1i(u.uSh, 3); gl.uniformMatrix4fv(u.uSunVP, false, G.sh.vp); gl.uniform1f(u.uShOn, G.sh.on); }
}
const NSHELL = 18;
function drawCoyote(VP, shadow) {
  const c = A.coy; if (!onScreen(c.x, -2.5)) return;
  const p = shadow ? P.coySh : P.coy, u = p.u; gl.useProgram(p.p);
  if (!shadow) animalUniforms(p, VP); else gl.uniformMatrix4fv(u.uVP, false, VP);
  gl.uniform3fv(u.uLo, G.coy.lo); gl.uniform3fv(u.uHi, G.coy.hi); gl.uniformMatrix4fv(u.uB, false, c.sk.mats);
  gl.uniform1f(u.uNS, NSHELL); gl.uniform1f(u.uShadowPass, shadow ? 1 : 0); gl.uniform1f(u.uFluff, 1); gl.uniform3f(u.uGrav, 0, -.7, 0);
  const dist = V3.dist(CAM.pos, c.sk.J[c.sk.names.withers]);
  if (u.uCell) gl.uniform1f(u.uCell, Math.max(.0024, 1.35 * 2 * dist * CAM.tanY / H));
  gl.bindVertexArray(shadow ? G.coy.vaoSh : G.coy.vao);
  gl.uniform1f(u.uOff, 0); gl.enable(gl.CULL_FACE); gl.drawElementsInstanced(gl.TRIANGLES, G.coy.n, gl.UNSIGNED_SHORT, 0, 1); gl.disable(gl.CULL_FACE);
  if (!shadow) { gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); gl.uniform1f(u.uOff, 1); gl.drawElementsInstanced(gl.TRIANGLES, G.coy.n, gl.UNSIGNED_SHORT, 0, NSHELL - 1); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); }
}
function drawBird(VP, shadow) {
  const b = A.bird; if (!onScreen(b.x, -2)) return;
  let p = shadow ? P.rrSh : P.rr; gl.useProgram(p.p); if (!shadow) animalUniforms(p, VP); else gl.uniformMatrix4fv(p.u.uVP, false, VP);
  gl.uniform3fv(p.u.uLo, G.rr.lo); gl.uniform3fv(p.u.uHi, G.rr.hi); gl.uniformMatrix4fv(p.u.uB, false, b.sk.mats);
  gl.bindVertexArray(shadow ? G.rr.vaoSh : G.rr.vao); gl.drawElements(gl.TRIANGLES, G.rr.n, gl.UNSIGNED_SHORT, 0);
  p = shadow ? P.cardSh : P.card; gl.useProgram(p.p); if (!shadow) animalUniforms(p, VP); else gl.uniformMatrix4fv(p.u.uVP, false, VP);
  gl.uniform3fv(p.u.uLo, G.rr.lo); gl.uniform3fv(p.u.uHi, G.rr.hi); gl.uniformMatrix4fv(p.u.uB, false, b.sk.mats);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, G.card.tex); gl.uniform1i(p.u.uCA, 4);
  gl.bindVertexArray(shadow ? G.card.vaoSh : G.card.vao);
  if (!shadow) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.drawElements(gl.TRIANGLES, G.card.n, G.card.type, 0);
  gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
}
const eyeM = new Float32Array(16);
function drawEyes(VP) {
  const p = P.eye; gl.useProgram(p.p); animalUniforms(p, VP); gl.bindVertexArray(G.eye.vao); gl.enable(gl.CULL_FACE);
  const one = (sk, bi, e, r, i1, i2, pupil) => {
    const m = sk.mats.subarray(bi * 16, bi * 16 + 16), z = V3.norm(e.g), x = V3.norm(V3.cross([0, 1, 0], z)), y = V3.cross(z, x);
    const L = [x[0] * r, x[1] * r, x[2] * r, 0, y[0] * r, y[1] * r, y[2] * r, 0, z[0] * r, z[1] * r, z[2] * r, 0, e.c[0], e.c[1], e.c[2], 1];
    for (let cI = 0; cI < 4; cI++) for (let rI = 0; rI < 4; rI++) { let s = 0; for (let k = 0; k < 4; k++) s += m[k * 4 + rI] * L[cI * 4 + k]; eyeM[cI * 4 + rI] = s; }
    gl.uniformMatrix4fv(p.u.uM, false, eyeM); gl.uniform3fv(p.u.uIris1, i1); gl.uniform3fv(p.u.uIris2, i2); gl.uniform1f(p.u.uPupil, pupil);
    gl.drawElements(gl.TRIANGLES, G.eye.n, gl.UNSIGNED_SHORT, 0);
  };
  const c = A.coy, b = A.bird;
  if (onScreen(c.x, -2.5)) for (const e of MODELS.coyote.eyes) one(c.sk, 4, e, MODELS.coyote.eyeR, [.88, .69, .30], [.66, .45, .19], .3);
  if (onScreen(b.x, -2)) for (const e of MODELS.roadrunner.eyes) one(b.sk, 3, e, MODELS.roadrunner.eyeR, [.54, .35, .16], [.79, .60, .35], .34);
  if (beetle) { const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); const e = { c: [beetle.x, terr(beetle.x, beetle.z) + .006, beetle.z], g: [0, 1, 0] };
    one({ mats: m }, 0, e, .009, [.05, .04, .03], [.09, .06, .04], 0); }
  gl.disable(gl.CULL_FACE);
}
function drawDust(v, VP) {
  if (!dust.length) return;
  const d = G.dust.data; let k = 0;
  for (const q of dust) { if (k >= 4096) break; const a = q.a * sstep(0, .15, q.age) * (1 - q.age / q.life); d.set([q.p[0], q.p[1], q.p[2], q.seed, q.s, a], k * 6); k++; }
  const p = P.dust; gl.useProgram(p.p); timeUniforms(p.u); gl.uniformMatrix4fv(p.u.uVP, false, VP);
  const x0 = v.wx / W * 2 - 1, x1 = (v.wx + v.ww) / W * 2 - 1, hy = (v.wh / H * 2) / 2;
  gl.uniform1f(p.u.uPx, v.ch / (2 * CAM.tanY * hy));
  gl.bindVertexArray(G.dust.vao); gl.bindBuffer(gl.ARRAY_BUFFER, G.dust.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, k * 6));
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.drawArrays(gl.POINTS, 0, k);
  gl.depthMask(true); gl.disable(gl.BLEND);
}
function drawComp(v, t) {
  const p = P.comp, u = p.u; gl.useProgram(p.p); setView(u, v); camUniforms(u); timeUniforms(u);
  gl.uniform4f(u.uBake, bake.bx0, bake.k, bake.h, 0); gl.uniform2f(u.uRT, bake.w, bake.h); gl.uniform2f(u.uNF, CAM.near, CAM.far); gl.uniform1f(u.uTime, t);
  bindTex(0, bake.c, u.uC); bindTex(1, bake.d, u.uD);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, G.sh.t); gl.uniform1i(u.uSh, 3); gl.uniformMatrix4fv(u.uSunVP, false, G.sh.vp); gl.uniform1f(u.uShOn, G.sh.on);
  gl.depthFunc(gl.ALWAYS); tri(); gl.depthFunc(gl.LEQUAL);
}

// compile every runtime program (each draws once, off to the side) before the big bake shaders are compiled
function warmUp() {
  if (!bake) makeBake();
  const c = A.coy, b = A.bird, cx = c.x, bx = b.x; c.x = 0; b.x = .5; coyotePose(c, 1 / 60); birdPose(b, 1 / 60); skinMats(c.sk); skinMats(b.sk); sunFrame();
  gl.bindFramebuffer(gl.FRAMEBUFFER, G.sh.fb); gl.viewport(0, 0, 4, 4); gl.enable(gl.DEPTH_TEST); drawCoyote(G.sh.vp, true); drawBird(G.sh.vp, true);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, 4, 4); const v = views[0], VP = viewProj(v);
  drawComp(v, 0); drawCoyote(VP, false); drawBird(VP, false); drawEyes(VP); dust.push({ p: [0, 0, 0], v: [0, 0, 0], s: .1, life: .01, age: 0, a: 0, seed: 0 }); drawDust(v, VP); dust.length = 0;
  gl.disable(gl.DEPTH_TEST); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  c.x = cx; b.x = bx; c.snap = true; coyotePose(c, 1 / 60); birdPose(b, 1 / 60);
}

// ------------------------------------------------------------------------------------------------ the scene
let decoding = null, netJ = null;
const SCENE = {
  key: 'desert-chase',
  defaults: { time: 'golden', lens: 'medium', tries: 'often', slowmo: true, tool: 'snack' },
  validate(s) { if (!TIMES[s.time]) s.time = 'golden'; if (!LENSES[s.lens]) s.lens = 'medium'; if (!TRIES[s.tries]) s.tries = 'often'; s.slowmo = s.slowmo !== false; if (!['snack', 'spook'].includes(s.tool)) s.tool = 'snack'; },
  panelTitle: 'The chase', panelSub: 'Click the ground to use the tool below. Saved between visits.',
  hello: 'Toss the roadrunner a beetle, spook it, or send the coyote in. It will not end well for the coyote.',
  tools: [['snack', 'Toss a beetle'], ['spook', 'Spook the bird'], null, ['call', 'Send the coyote', () => { callNow = true; if (A.coy && A.coy.st === 'away') A.coy.stT = 0; say('Here it comes.'); }]],
  panel(ui) {
    ui.sel('Light', 'time', TIMES);
    ui.sel('Lens', 'lens', LENSES);
    ui.sel('The coyote tries', 'tries', TRIES);
    ui.tog('Slow motion on the wipeouts', 'slowmo');
  },
  changed(k) {
    if (k === 'time') { rebake(); document.getElementById('fade').style.opacity = 1; queueBake(); }
    if (k === 'lens') SCENE.build();
    if (k === 'tries' && A.coy && A.coy.st === 'away') { const g = TRIES[S.tries].gap; A.coy.stT = Math.min(A.coy.stT, rnd(g[0], g[1])); }
  },
  build() {
    if (!P.bake) compile();
    setupCamera(); makeWorld();
    rebake(); document.getElementById('fade').style.opacity = 1;
    if (!decoding) decoding = decodeModels();
    bakeQ.push(() => ({ done: modelsReady, spent: 4000 }));
    bakeStep(() => { if (!G.coy) buildGPU(); resetActors(); });
    bakeStep(() => warmUp());
    queueBake();
  },
  act(tool, x, y, phase) {
    if (phase !== 'down' || !A.bird) return;
    const rd = pixelRay(x, y), C = CAM.pos; let t = 0, hit = null;
    for (let i = 0; i < 400; i++) { const p = V3.mad(C, rd, t); if (p[1] < terr(p[0], p[2])) { hit = p; break; } t += .1 + t * .01; }
    if (!hit) return;
    const b = A.bird;
    if (tool === 'snack') { beetle = { x: clamp(hit[0], -CAM.halfW + .3, CAM.halfW - .3), z: clamp(hit[2], LANE.z0 - 1, LANE.z1 + 1) }; if (b.st === 'offscreen' || b.st === 'exit') { b.st = 'offscreen'; b.stT = 0; } puff([beetle.x, terr(beetle.x, beetle.z), beetle.z], .1, 0); }
    if (tool === 'spook' && (b.st === 'forage' || b.st === 'alert' || b.st === 'snack' || b.st === 'safe')) { const dx = b.x - hit[0], dz = b.z - hit[2], d = Math.hypot(dx, dz) || 1; b.st = 'enter'; b.tx = clamp(b.x + dx / d * 4, -CAM.halfW + .8, CAM.halfW - .8); b.tz = clamp(b.z + dz / d * 2, LANE.z0, LANE.z1); beetle = null; }
  },
  sim(dt) {
    if (!A.coy || !G.coy) return;
    // followers only get the skeletons; where each animal stands (for culling and the shadow frustum) comes from them
    if (!LEADER) { if (netJ) { const c = A.coy, b = A.bird; c.sk.J = netJ.c; b.sk.J = netJ.b; const w = c.sk.J[c.sk.names.withers], h = b.sk.J[b.sk.names.hips]; c.x = w[0]; c.z = w[2]; b.x = h[0]; b.z = h[2]; } return; }
    if (slowT > 0) { slowT -= dt; timeScale = toward(timeScale, .32, dt * 12); } else timeScale = toward(timeScale, 1, dt * 2.5);
    const sdt = dt * timeScale, c = A.coy, b = A.bird;
    birdBrain(b, c, sdt); coyoteBrain(c, b, sdt);
    if (c.mode === 'kin' || c.mode === 'getup') {
      const prev = c.sk.J.map(j => j.slice());
      coyotePose(c, sdt);
      if (c.mode === 'getup' && c.ragJ) { const w = ease(clamp(1 - c.stT / 1.2, 0, 1)); c.sk.J = c.sk.J.map((j, i) => V3.lerp(c.ragJ[i], j, w)); }
      c.jv = c.sk.J.map((j, i) => V3.mul(V3.sub(j, prev[i]), 1 / Math.max(sdt, 1e-4)));
    }
    birdPose(b, sdt);
    stepDust(sdt);
  },
  netState() { const fl = (J) => J.map(j => [+j[0].toFixed(4), +j[1].toFixed(4), +j[2].toFixed(4)]); return { c: fl(A.coy.sk.J), b: fl(A.bird.sk.J), d: dust.slice(0, 400).map(q => [q.p[0], q.p[1], q.p[2], q.s, q.a, q.age, q.life, q.seed]) }; },
  netApply(m) { netJ = m; dust.length = 0; for (const q of m.d) dust.push({ p: [q[0], q[1], q[2]], s: q[3], a: q[4], age: q[5], life: q[6], seed: q[7], v: [0, 0, 0] }); },
  render(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!bake || !G.coy || !A.coy) return;
    skinMats(A.coy.sk); skinMats(A.bird.sk);
    sunFrame();
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.sh.fb); gl.viewport(0, 0, G.sh.N, G.sh.N); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    if (G.sh.on) { drawCoyote(G.sh.vp, true); drawBird(G.sh.vp, true); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    eachView(v => {
      const VP = viewProj(v);
      gl.enable(gl.DEPTH_TEST); drawComp(v, t);
      drawCoyote(VP, false); drawBird(VP, false); drawEyes(VP);
      drawDust(v, VP);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO); const pv = P.vig; gl.useProgram(pv.p); setView(pv.u, v); tri(); gl.disable(gl.BLEND);
    });
    gl.bindVertexArray(null);
  },
  stats() { const c = A.coy, b = A.bird; return c ? `bird ${b.st} · coyote ${c.st}${c.plan ? ' (' + c.plan.kind + ')' : ''} · ${attempts} tries, ${fails} wipeouts` : ''; },
  debug() { return { src: { BAKE_FS, BUSH_FS, DOF_FS }, proj(p) { const m = viewProj(views[0]); const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(x / w * .5 + .5) * innerWidth, (.5 - y / w * .5) * innerHeight]; }, modelsReady, decodeErr, baked: !!bake, gpu: !!G.coy, A, props, CAM, TER, terr, washC, get timeScale() { return timeScale; }, setPlan(kind) { lastPlan = ''; A.coy.forcePlan = kind; } }; },
};
