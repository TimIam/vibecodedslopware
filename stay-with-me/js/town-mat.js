// Town materials. Two families of tileable PBR surfaces are generated on the GPU into texture arrays (albedo+roughness,
// normal), one array pair for ground surfaces and one for building surfaces, then a handful of MeshStandardMaterials
// sample them by a per-vertex layer id (aCol.a) with a per-vertex tint (aCol.rgb). On top of that:
//   road    : lane markings, crosswalks, stop bars, wheel wear, tar snakes, patches, manholes, gutters (from road UVs in m),
//             plus world-space cracking, oil spotting and lane-by-lane resurfacing tone
//   ground  : lawns (mowing, dry and worn patches) and sidewalks (slab tone, replaced slabs, damp and spill stains)
//   facade  : window grids with parallax reveals, frames, interior-mapped rooms and night lighting (aWinA / aWinB)
//   plain   : everything else built (roofs, trim, props)
// All of them go through patchWet, take the baked street-lamp light map at night, and break up tiling with a second
// structure-aligned sample plus a world-space macro variation.
// Tuning: LAYERS tables (tile size, normal strength), the GLSL in GROUND_GLSL / WALL_GLSL, ROAD_FS and FACADE_FS.

import * as THREE from 'three';
import { U, patchWet } from './gfx.js';
import { makeRng, fbm2 } from './util.js';

export const GL = { asphalt: 0, walk: 1, concrete: 2, grass: 3, gravel: 4, pavers: 5 };
export const WL = { plain: 0, brick: 1, brick2: 2, panel: 3, stucco: 4, siding: 5, metal: 6, shingle: 7, roof: 8, wood: 9 };
export const METAL = 32;      // add to a layer id for a metallic (bare steel / aluminium) version of that surface

// tile (m), normal strength when baking, [second-sample scale, offset x, offset y], runtime normal scale, roughness scale
const GROUND_LAYERS = [
  { tile: 4, str: 3.2, s2: [0.37, 0.31, 0.17], n: 1.0, sp: 0.75 },      // asphalt
  { tile: 3, str: 6, s2: [1, 0.5, 0.5], n: 1.0 },             // sidewalk slabs (1.5 m)
  { tile: 4, str: 3, s2: [0.43, 0.13, 0.57], n: 1.0 },        // plain concrete
  { tile: 3, str: 5, s2: [0.31, 0.41, 0.23], n: 1.0, sp: 0.15 },        // grass
  { tile: 2.5, str: 6, s2: [0.47, 0.19, 0.63], n: 1.0, sp: 0.4 },      // gravel / dirt
  { tile: 2, str: 6, s2: [1, 0.5, 0.5], n: 1.0 },             // brick pavers
];
const WALL_LAYERS = [
  { tile: 2, str: 1.5, s2: [0.37, 0.21, 0.43], n: 0.6 },      // plain paint
  { tile: 2.4, str: 7, s2: [1, 5 / 12, 14 / 32], n: 1.0, sp: 0.55 },    // red brick
  { tile: 2.4, str: 7, s2: [1, 7 / 12, 10 / 32], n: 1.0, sp: 0.55 },    // buff brick
  { tile: 4.8, str: 5, s2: [1, 0.5, 0.5], n: 1.0 },           // concrete panels
  { tile: 3, str: 4, s2: [0.41, 0.27, 0.61], n: 1.0, sp: 0.5 },        // stucco
  { tile: 2.4, str: 9, s2: [1, 0.37, 5 / 16], n: 1.0 },       // lap siding
  { tile: 2.4, str: 8, s2: [1, 3 / 8, 0.5], n: 1.0 },         // ribbed metal
  { tile: 2.4, str: 8, s2: [1, 3 / 8, 6 / 16], n: 1.0, sp: 0.45 },      // shingles
  { tile: 3, str: 4, s2: [1, 1 / 3, 0.41], n: 1.0, sp: 0.5 },          // flat roof
  { tile: 2.4, str: 6, s2: [1, 5 / 16, 0.37], n: 1.0, sp: 0.5 },       // wood planks
];

// ---------------------------------------------------------------- GPU bake

const BAKE_HEAD = `
precision highp float;
uniform sampler2D uR; uniform int uPass; varying vec2 vUv;
vec4 rnd(vec2 i, vec2 per){ i=mod(i,per); return texelFetch(uR, ivec2(i)&255, 0); }
float vn(vec2 p, vec2 per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(rnd(i,per).x,rnd(i+vec2(1.0,0.0),per).x,f.x), mix(rnd(i+vec2(0.0,1.0),per).x,rnd(i+vec2(1.0,1.0),per).x,f.x), f.y); }
float vn(vec2 p, float per){ return vn(p, vec2(per)); }
float fbm(vec2 uv, float f, int oct){ float s=0.0,a=0.5,n=0.0; for(int i=0;i<6;i++){ if(i>=oct) break; s+=a*vn(uv*f+float(i)*7.31,f); n+=a; f*=2.0; a*=0.5; } return s/n; }
vec3 vor(vec2 p, float per){ vec2 i=floor(p), f=fract(p); float d1=9.0,d2=9.0,id=0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec4 r=rnd(i+g,vec2(per)); vec2 o=g+r.xy-f; float d=dot(o,o); if(d<d1){ d2=d1; d1=d; id=r.z; } else if(d<d2) d2=d; }
  return vec3(sqrt(d1),sqrt(d2),id); }
vec4 brick(vec2 uv, vec2 n){ vec2 p=uv*n; float row=floor(p.y); p.x+=0.5*mod(row,2.0); return vec4(fract(p), mod(vec2(floor(p.x),row),n)); }
`;
const BAKE_TAIL = `
void main(){ vec3 alb; float rgh, hgt; mat(vUv, alb, rgh, hgt);
  if(uPass==0) gl_FragColor=vec4(sqrt(clamp(alb,0.0,1.0)), clamp(rgh,0.03,1.0)); else gl_FragColor=vec4(hgt,0.0,0.0,1.0); }`;

const GROUND_GLSL = [
  // 0 asphalt
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec3 v1=vor(uv*256.0,256.0), v2=vor(uv*128.0+3.3,128.0);
    float stone=(1.0-smoothstep(0.18,0.42,v1.x)), big=(1.0-smoothstep(0.15,0.36,v2.x))*step(0.72,v2.z);
    float n=fbm(uv,6.0,5), fine=vn(uv*512.0,512.0);
    float c=mix(0.06+0.03*n, mix(0.07,0.17,v1.z*v1.z), stone*0.5);
    c=mix(c, 0.13+0.12*v2.z, big*0.4); c*=0.85+0.3*fine;
    alb=vec3(c)*mix(vec3(1.07,1.0,0.92),vec3(1.0,0.99,0.97),vn(uv*5.0+9.0,5.0));
    hgt=stone*0.55+big*0.45+0.25*fine; rgh=mix(0.93,0.8,stone*0.5); }`,
  // 1 sidewalk slabs
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec2 p=uv*2.0, id=mod(floor(p),2.0), f=fract(p), e=min(f,1.0-f); float jd=min(e.x,e.y)*1.5;
    float joint=(1.0-smoothstep(0.004,0.012,jd)), tool=(1.0-smoothstep(0.012,0.055,jd));
    float slab=rnd(id+3.0,vec2(2.0)).x, n=fbm(uv+slab,5.0,5), fine=vn(uv*512.0,512.0), broom=vn(vec2(uv.x*256.0,uv.y*10.0),vec2(256.0,10.0));
    float c=0.40+0.11*(n-0.5)+0.06*(slab-0.5)+0.035*(broom-0.5)+0.04*(fine-0.5);
    c*=1.0-0.2*smoothstep(0.55,0.8,fbm(uv+5.1,3.0,4));
    vec3 g=vor(uv*14.0,14.0); float gum=(1.0-smoothstep(0.035,0.07,g.x))*step(0.6,g.z); c=mix(c,0.11,gum*0.8);
    vec3 cv=vor(uv*2.0+0.7,2.0); float crack=(1.0-smoothstep(0.0,0.008,cv.y-cv.x))*step(0.75,slab); c=mix(c,0.1,crack);
    c*=mix(1.0,0.7,tool); c=mix(c,0.08,joint);
    alb=vec3(c)*vec3(1.0,0.985,0.95); hgt=(1.0-joint)*0.8-tool*0.15+0.08*broom+0.06*fine-crack*0.4; rgh=0.87-0.12*gum; }`,
  // 2 plain concrete
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float n=fbm(uv,4.0,5), fine=vn(uv*512.0,512.0);
    vec3 pv=vor(uv*60.0,60.0); float pit=(1.0-smoothstep(0.04,0.10,pv.x))*step(0.7,pv.z);
    vec3 cv=vor(uv*3.0+1.7,3.0); float crack=(1.0-smoothstep(0.0,0.006,cv.y-cv.x))*smoothstep(0.58,0.7,fbm(uv+2.0,2.0,3));
    float c=0.40+0.13*(n-0.5)+0.05*(fine-0.5); c*=1.0-0.35*pit; c=mix(c,0.12,crack);
    alb=vec3(c)*vec3(1.0,0.985,0.95); hgt=0.7+0.12*n+0.08*fine-0.5*pit-0.6*crack; rgh=0.85; }`,
  // 3 grass
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec3 t1=vor(uv*90.0,90.0), t2=vor(uv*40.0+7.7,40.0);
    float n=fbm(uv,5.0,4), fine=vn(uv*512.0,512.0), f2=vn(uv*256.0+31.0,256.0);
    float g=0.5+0.55*(t1.z-0.5)+0.35*(fine-0.5)+0.25*(f2-0.5)+0.2*(t2.z-0.5); g*=0.7+0.5*smoothstep(0.0,0.45,t1.x);
    vec3 c=mix(vec3(0.040,0.085,0.020),vec3(0.105,0.175,0.040),clamp(g,0.0,1.0));
    c=mix(c,vec3(0.17,0.17,0.065),smoothstep(0.58,0.85,n)*0.45); c=mix(c,vec3(0.03,0.075,0.028),(1.0-smoothstep(0.2,0.45,n))*0.45);
    alb=c; hgt=t1.z*0.45+fine*0.55; rgh=0.92; }`,
  // 4 gravel / dirt
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec3 v1=vor(uv*70.0,70.0), v2=vor(uv*150.0+5.0,150.0);
    float s1=(1.0-smoothstep(0.25,0.5,v1.x)), s2=(1.0-smoothstep(0.1,0.5,v2.x));
    vec3 sc=mix(vec3(0.30,0.28,0.25),vec3(0.13,0.125,0.12),v1.z); sc=mix(sc,vec3(0.34,0.27,0.20),step(0.8,v2.z)*0.6);
    vec3 dirt=vec3(0.15,0.125,0.095)*(0.7+0.6*fbm(uv,6.0,4));
    alb=mix(dirt,sc,s1*0.85)*(0.8+0.4*s2); hgt=s1*0.7+0.3*s2; rgh=0.92; }`,
  // 5 brick pavers
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec4 b=brick(uv,vec2(10.0,20.0)); vec2 e=min(b.xy,1.0-b.xy)*vec2(0.2,0.1); float jd=min(e.x,e.y);
    float joint=(1.0-smoothstep(0.002,0.006,jd)), bevel=(1.0-smoothstep(0.006,0.022,jd)); vec4 r=rnd(b.zw,vec2(10.0,20.0));
    vec3 c=mix(vec3(0.29,0.105,0.068),vec3(0.19,0.085,0.065),r.x); c=mix(c,vec3(0.33,0.185,0.115),step(0.8,r.y)); c*=0.8+0.4*r.z;
    c*=0.85+0.3*vn(uv*512.0,512.0); c*=1.0-0.28*smoothstep(0.5,0.8,fbm(uv,4.0,4));
    c=mix(c,vec3(0.2,0.185,0.16),joint); c*=1.0-0.2*bevel;
    alb=c; hgt=(1.0-joint)*(0.75+0.2*r.w)-bevel*0.2; rgh=0.86; }`,
];

const BRICK = (lo, hi, dark, light) => `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec4 b=brick(uv,vec2(12.0,32.0)); vec2 e=min(b.xy,1.0-b.xy)*vec2(0.2,0.075); float jd=min(e.x,e.y);
    float mort=(1.0-smoothstep(0.0036,0.0078,jd)); vec4 r=rnd(b.zw+11.0,vec2(12.0,32.0));
    vec3 c=mix(${lo},${hi},r.x*r.x*0.8+0.1); c=mix(c,${dark},step(0.9,r.y)*0.5); c=mix(c,${light},step(0.93,r.z)*0.3);
    c*=0.8+0.4*vn(uv*512.0+r.w*40.0,512.0); c*=0.88+0.24*fbm(uv,3.0,4);
    vec3 mc=vec3(0.33,0.315,0.285)*(0.8+0.4*vn(uv*256.0,256.0));
    alb=mix(c,mc,mort); hgt=mix(0.72+0.2*r.w+0.1*vn(uv*256.0+3.0,256.0),0.22,mort); rgh=mix(0.88,0.95,mort); }`;
const WALL_GLSL = [
  // 0 plain paint
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float n=fbm(uv,4.0,5), fine=vn(uv*256.0,256.0); alb=vec3(0.80+0.07*(n-0.5)+0.03*(fine-0.5)); hgt=0.3*n+0.1*fine; rgh=0.55+0.18*(n-0.5); }`,
  BRICK('vec3(0.29,0.082,0.052)', 'vec3(0.41,0.145,0.088)', 'vec3(0.115,0.058,0.048)', 'vec3(0.49,0.235,0.155)'),
  BRICK('vec3(0.44,0.315,0.18)', 'vec3(0.57,0.44,0.275)', 'vec3(0.29,0.195,0.115)', 'vec3(0.63,0.52,0.36)'),
  // 3 concrete panels
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec2 p=uv*vec2(2.0,4.0), f=fract(p), id=mod(floor(p),vec2(2.0,4.0)), e=min(f,1.0-f)*vec2(2.4,1.2); float jd=min(e.x,e.y);
    float joint=(1.0-smoothstep(0.004,0.013,jd)), n=fbm(uv,4.0,5), fine=vn(uv*512.0,512.0), streak=vn(vec2(uv.x*64.0,uv.y*3.0),vec2(64.0,3.0));
    float c=0.43+0.1*(n-0.5)+0.04*(fine-0.5)+0.06*(rnd(id+5.0,vec2(2.0,4.0)).x-0.5); c*=1.0-0.16*smoothstep(0.5,0.9,streak);
    vec2 th=(fract(p*2.0)-0.5)*vec2(1.2,0.6); float hole=(1.0-smoothstep(0.009,0.016,length(th)));
    c=mix(c,0.11,joint); c*=1.0-0.55*hole;
    alb=vec3(c)*vec3(1.0,0.99,0.96); hgt=(1.0-joint)*0.8-hole*0.5+0.06*fine+0.06*n; rgh=0.82; }`,
  // 4 stucco
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float n=fbm(uv,8.0,4), a=vn(uv*128.0,128.0), b=vn(uv*256.0+9.0,256.0), c2=vn(uv*512.0+3.0,512.0), bump=a*0.5+b*0.3+c2*0.2;
    float st=vn(vec2(uv.x*40.0,uv.y*2.0),vec2(40.0,2.0));
    alb=vec3(0.78+0.05*(n-0.5))*(0.9+0.2*bump)*(1.0-0.09*smoothstep(0.55,0.9,st)); hgt=bump; rgh=0.9; }`,
  // 5 lap siding
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float y=uv.y*16.0, f=fract(y), id=mod(floor(y),16.0); float r=rnd(vec2(id,3.0),vec2(16.0,8.0)).x;
    float shadow=smoothstep(0.88,1.0,f), grain=vn(vec2(uv.x*10.0,uv.y*256.0),vec2(10.0,256.0));
    float c=0.80+0.04*(r-0.5)+0.05*(grain-0.5); c*=1.0-0.5*shadow;
    float bx=fract(uv.x*2.0+r*7.0); float seam=(1.0-smoothstep(0.001,0.003,abs(bx-0.5)))*step(0.3,r); c=mix(c,0.3,seam*0.7);
    c*=0.92+0.16*fbm(uv,3.0,4); alb=vec3(c); hgt=(1.0-f)*0.9+0.05*grain; rgh=0.6; }`,
  // 6 ribbed metal
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float x=fract(uv.x*8.0), rib=smoothstep(0.0,0.12,x)*(1.0-smoothstep(0.33,0.45,x)), n=fbm(uv,4.0,4), st=vn(vec2(uv.x*48.0,uv.y*2.0),vec2(48.0,2.0));
    float c=0.62+0.06*(n-0.5); c*=1.0-0.12*smoothstep(0.6,0.9,st); c*=0.88+0.12*rib;
    float sy=abs(fract(uv.y*2.0)-0.5)*1.2, seam=(1.0-smoothstep(0.004,0.012,sy)); c*=1.0-0.4*seam;
    alb=vec3(c); hgt=rib*0.9-seam*0.2; rgh=0.45+0.2*n; }`,
  // 7 asphalt shingles
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float y=uv.y*16.0, row=floor(y), f=fract(y), x=uv.x*8.0+0.5*mod(row,2.0), tx=fract(x); vec2 id=mod(vec2(floor(x),row),vec2(8.0,16.0));
    vec4 r=rnd(id+2.0,vec2(8.0,16.0));
    float slot=(1.0-smoothstep(0.008,0.022,min(tx,1.0-tx)))*step(f,0.8), shadow=smoothstep(0.86,1.0,f), gran=vn(uv*512.0,512.0);
    vec3 c=mix(vec3(0.075,0.072,0.068),vec3(0.145,0.13,0.115),r.x); c*=0.72+0.56*gran; c*=1.0-0.55*shadow; c=mix(c,vec3(0.025),slot);
    c=mix(c,vec3(0.065,0.085,0.04),smoothstep(0.62,0.85,fbm(uv+3.0,3.0,4))*0.35);
    alb=c; hgt=(1.0-f)*0.8+0.15*gran-slot*0.5; rgh=0.93; }`,
  // 8 flat roof
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    vec3 v1=vor(uv*120.0,120.0); float st=(1.0-smoothstep(0.2,0.45,v1.x)), n=fbm(uv,4.0,5);
    float c=0.20+0.13*v1.z*st+0.09*(n-0.5); float d=abs(fract(uv.x*3.0)-0.5), seam=(1.0-smoothstep(0.008,0.02,d));
    c*=1.0-0.3*smoothstep(0.6,0.8,n); c=mix(c,0.07,seam*0.8);
    alb=vec3(c)*vec3(1.0,0.99,0.97); hgt=st*0.5+0.2*n-seam*0.3; rgh=0.9; }`,
  // 9 wood planks
  `void mat(vec2 uv, out vec3 alb, out float rgh, out float hgt){
    float x=uv.x*16.0, id=mod(floor(x),16.0), f=fract(x), gap=(1.0-smoothstep(0.012,0.04,min(f,1.0-f))); vec4 r=rnd(vec2(id,5.0),vec2(16.0,8.0));
    float grain=vn(vec2(x*6.0+r.x*9.0,uv.y*5.0+r.y*3.0),vec2(96.0,5.0)), g2=vn(vec2(x*16.0,uv.y*12.0+r.z),vec2(256.0,12.0));
    vec3 c=mix(vec3(0.29,0.195,0.115),vec3(0.41,0.295,0.185),r.x); c*=0.72+0.38*grain+0.16*g2;
    c=mix(c,vec3(dot(c,vec3(0.333))),0.4*r.w); c=mix(c,vec3(0.03),gap);
    alb=c; hgt=(1.0-gap)*0.8+0.12*grain; rgh=0.82; }`,
];

function bakeArrays(renderer, size, aniso) {
  const rng = makeRng(90210), rd = new Uint8Array(256 * 256 * 4); for (let i = 0; i < rd.length; i++) rd[i] = rng() * 256;
  const rtex = new THREE.DataTexture(rd, 256, 256, THREE.RGBAFormat); rtex.magFilter = rtex.minFilter = THREE.NearestFilter; rtex.needsUpdate = true;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
  const hRT = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const nMat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: hRT.texture }, uStr: { value: 4 }, uPx: { value: 1 / size } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'precision highp float; uniform sampler2D uH; uniform float uStr,uPx; varying vec2 vUv; void main(){ float l=texture2D(uH,vUv-vec2(uPx,0.0)).r, r=texture2D(uH,vUv+vec2(uPx,0.0)).r, d=texture2D(uH,vUv-vec2(0.0,uPx)).r, u=texture2D(uH,vUv+vec2(0.0,uPx)).r; vec3 n=normalize(vec3((l-r)*uStr,(d-u)*uStr,1.0)); gl_FragColor=vec4(n.xy*0.5+0.5,0.0,1.0); }',
  });
  const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear; renderer.autoClear = true;
  const mk = (glsl, layers) => {
    const n = glsl.length;
    const opt = { depthBuffer: false, type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, anisotropy: aniso };
    const alb = new THREE.WebGLArrayRenderTarget(size, size, n, { ...opt, format: THREE.RGBAFormat });
    const nrm = new THREE.WebGLArrayRenderTarget(size, size, n, { ...opt, format: THREE.RGFormat });
    for (const t of [alb.texture, nrm.texture]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; }
    for (let i = 0; i < n; i++) {
      const m = new THREE.ShaderMaterial({ uniforms: { uR: { value: rtex }, uPass: { value: 0 } }, vertexShader: VS, fragmentShader: BAKE_HEAD + glsl[i] + BAKE_TAIL, depthTest: false, depthWrite: false });
      quad.material = m;
      m.uniforms.uPass.value = 0; renderer.setRenderTarget(alb, i); renderer.render(scene, cam);
      m.uniforms.uPass.value = 1; renderer.setRenderTarget(hRT); renderer.render(scene, cam);
      quad.material = nMat; nMat.uniforms.uStr.value = layers[i].str * size / 1024; renderer.setRenderTarget(nrm, i); renderer.render(scene, cam);
      m.dispose();
    }
    return { alb, nrm };
  };
  const ground = mk(GROUND_GLSL, GROUND_LAYERS), wall = mk(WALL_GLSL, WALL_LAYERS);
  renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto;
  nMat.dispose(); hRT.dispose(); rtex.dispose(); quad.geometry.dispose();
  return { ground, wall };
}

// Smooth tileable macro-noise (rgb = three independent fields) used by every shader to break up repetition.
function macroNoise() {
  const n = 256, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = (y * n + x) * 4; for (let c = 0; c < 3; c++) d[i + c] = 255 * fbm2(x / n * 8, y / n * 8, 4, 40 + c * 13, 8); d[i + 3] = 255 * fbm2(x / n * 32, y / n * 32, 3, 91, 32); }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- runtime shaders

const FRAG_PARS = n => `
uniform mediump sampler2DArray uAlb; uniform mediump sampler2DArray uNrm; uniform sampler2D uTNoise; uniform sampler2D uLampMap;
uniform vec4 uLampRect; uniform float uNight; uniform vec4 uLP[${n}]; uniform float uLN[${n}]; uniform float uLS[${n}];
varying vec4 vCol; varying vec2 vUvM; varying vec4 vWinA; varying vec4 vWinB;
vec2 gNxy=vec2(0.0); float gRgh=0.8; float gMetal=0.0; vec3 gEmis=vec3(0.0); vec3 gMacro=vec3(0.5); float gGlass=0.0; float gSpec=1.0; float gShade=0.0;
mat3 gTBN(vec3 eye, vec3 N, vec2 uvv){ vec3 q0=dFdx(eye), q1=dFdy(eye); vec2 s0=dFdx(uvv), s1=dFdy(uvv);
  vec3 q1p=cross(q1,N), q0p=cross(N,q0); vec3 T=q1p*s0.x+q0p*s1.x, B=q1p*s0.y+q0p*s1.y; float det=max(dot(T,T),dot(B,B)); float sc=det<=0.0?0.0:inversesqrt(det); return mat3(T*sc,B*sc,N); }
float gLine(float d, float hw, float fw){ return clamp((hw-d)/fw+0.5,0.0,1.0)*min(1.0,2.0*hw/fw+0.3); }
float gH1(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec3 gH3(vec2 p){ return vec3(gH1(p),gH1(p+17.17),gH1(p+41.3)); }
`;

const BASE_FS = `
{ float lay=floor(vCol.a*255.0+0.5); gMetal=step(31.5,lay); lay=mod(lay,32.0); int li=int(lay); vec4 lp=uLP[li];
  vec2 tuv=vUvM*lp.x, tuv2=tuv*lp.y+lp.zw;
  vec4 a1=texture(uAlb,vec3(tuv,lay)), a2=texture(uAlb,vec3(tuv2,lay)); vec2 n1=texture(uNrm,vec3(tuv,lay)).rg, n2=texture(uNrm,vec3(tuv2,lay)).rg;
  gMacro=texture2D(uTNoise,vWetPos.xz*0.0113+vWetPos.y*0.0071).rgb;
  float bl=smoothstep(0.38,0.62,texture2D(uTNoise,vWetPos.xz*0.031+vWetPos.y*0.017+0.37).g);
  vec4 a=mix(a1,a2,bl); vec2 nn=mix(n1,n2,bl);
  vec3 alb=a.rgb*a.rgb; alb*=0.84+0.32*gMacro.g;
  diffuseColor.rgb=alb*pow(vCol.rgb,vec3(2.2)); gRgh=a.a; gNxy=(nn*2.0-1.0)*uLN[li]; gSpec=uLS[li]; }
`;

// Lawns: mowing-height variation, dry and lush patches, bare earth where the grass has worn through.
const LAWN_FS = `
{ float layg=mod(floor(vCol.a*255.0+0.5),32.0);
  if(layg>2.5&&layg<3.5){ vec2 wp=vWetPos.xz;
    float n1=texture2D(uTNoise,wp*0.047).r, n2=texture2D(uTNoise,wp*0.19+0.3).a, n3=texture2D(uTNoise,wp*0.011+0.7).b, n4=texture2D(uTNoise,wp*0.9).a;
    vec3 c=diffuseColor.rgb*vec3(0.80,0.84,0.78); c*=(0.62+0.6*n2)*(0.8+0.36*n4); c*=0.93+0.14*smoothstep(0.4,0.6,texture2D(uTNoise,wp*2.7+0.2).a);
    c=mix(c,c*vec3(0.78,1.02,0.7),smoothstep(0.55,0.72,texture2D(uTNoise,wp*0.31+0.5).r)*0.5);
    c=mix(c,c*vec3(1.3,1.12,0.55),smoothstep(0.52,0.78,n1)*0.7*smoothstep(0.55,0.8,vCol.g)); c*=0.78+0.44*texture2D(uTNoise,wp*0.0043+0.31).g; c=mix(vec3(dot(c,vec3(0.3,0.6,0.1))),c,0.86);
    c=mix(c,c*vec3(0.6,0.8,0.7),smoothstep(0.5,0.75,n3)*0.5);
    float lawnK=smoothstep(0.55,0.8,vCol.g);            // forest floor and verges under trees stay dark
    float worn=smoothstep(0.7,0.84,texture2D(uTNoise,wp*0.083+1.9).g)*smoothstep(0.42,0.6,n2)*lawnK;
    c=mix(c,vec3(0.105,0.085,0.06)*(0.7+0.6*n4),worn*0.8);
    diffuseColor.rgb=c; gNxy*=1.0+0.9*n2; gRgh=mix(gRgh,0.97,worn); }
  else if(layg>0.5&&layg<2.5){ vec2 wp=vWetPos.xz;
    float n1=texture2D(uTNoise,wp*0.057).g, n2=texture2D(uTNoise,wp*0.23+0.4).a, n3=texture2D(uTNoise,wp*0.013+0.2).r;
    vec3 c=diffuseColor.rgb; c*=0.84+0.3*n1; c*=1.0-0.22*smoothstep(0.52,0.8,n3);
    if(layg<1.5){ float sh=gH1(floor(vUvM/1.5+0.001)+7.3); c*=0.93+0.14*sh; c=mix(c,c*vec3(1.17,1.16,1.13),step(0.95,sh)); }
    float drip=smoothstep(0.6,0.85,n2)*smoothstep(0.45,0.7,n1); c*=1.0-0.28*drip; gRgh-=0.12*drip;
    diffuseColor.rgb=c; } }
`;

// Road markings. vUvM = (u across, + to the right of a->b; v along from node a), vWinA = (length, half width, lanes,
// lane width), vWinB = (median, flags, trimA, trimB). Junction fans have length 0 and vWinA.y = distance to the kerb.
const ROAD_FS = `
{ float len=vWinA.x; vec2 wp=vWetPos.xz; float wearN=texture2D(uTNoise,wp*0.09).a, wearL=texture2D(uTNoise,wp*0.021+0.5).r;
  vec3 base=diffuseColor.rgb; float white=0.0, yellow=0.0, tar=0.0, conc=0.0, iron=0.0, dark=0.0, oilW=0.1, pave=1.0;
  if(len>0.5){
    float u=vUvM.x, v=vUvM.y, hw=vWinA.y, lanes=vWinA.z, lw=vWinA.w, med=vWinB.x, tA=vWinB.z, tB=vWinB.w, au=abs(u);
    float fu=max(fwidth(u),1e-4), fv=max(fwidth(v),1e-4);
    float fl=vWinB.y+0.5; float fPark=mod(floor(fl),2.0), stA=mod(floor(fl/2.0),2.0), stB=mod(floor(fl/4.0),2.0), cwA=mod(floor(fl/8.0),2.0), cwB=mod(floor(fl/16.0),2.0), bike=mod(floor(fl/32.0),2.0), cls=mod(floor(fl/64.0),4.0), noC=mod(floor(fl/256.0),2.0), ladder=mod(floor(fl/512.0),2.0), arrA=mod(floor(fl/1024.0),2.0), arrB=mod(floor(fl/2048.0),2.0), rural=mod(floor(fl/4096.0),2.0);
    float travel=med*0.5+lanes*lw;
    float sA=tA+(cwA>0.5?5.0:(stA>0.5?1.2:0.0)), sB=len-tB-(cwB>0.5?5.0:(stB>0.5?1.2:0.0));
    float inLane=clamp((v-sA)/fv,0.0,1.0)*clamp((sB-v)/fv,0.0,1.0);
    float dash=clamp((3.0-mod(v,12.0))/fv+0.5,0.0,1.0)*clamp(mod(v,12.0)/fv+0.5,0.0,1.0);
    if(cls>0.5){
      if(noC<0.5){
        if(med<0.1) yellow=max(yellow,gLine(abs(au-0.15),0.055,fu));
        else if(cls<2.5){ yellow=max(yellow,gLine(abs(au-(med*0.5-0.08)),0.055,fu)); yellow=max(yellow,gLine(abs(au-(med*0.5-0.34)),0.055,fu)*dash); }
        else yellow=max(yellow,gLine(abs(au-(med*0.5+0.25)),0.065,fu));
      }
      if(lanes>1.5) white=max(white,gLine(abs(au-(med*0.5+lw)),0.055,fu)*dash);
      if(fPark>0.5){ white=max(white,gLine(abs(au-travel),0.05,fu)); float tk=abs(mod(v,6.4)-3.2); white=max(white,gLine(tk,0.05,fv)*step(travel,au)*step(au,travel+0.9)); }
      if(cls>2.5||rural>0.5) white=max(white,gLine(abs(au-(travel+0.12)),0.065,fu));
      if(bike>0.5){ white=max(white,gLine(abs(au-(travel+0.1)),0.05,fu)); white=max(white,gLine(abs(au-(travel+1.6)),0.05,fu)*step(fPark,0.5));
        vec2 bp=vec2(au-(travel+0.85),mod(v,36.0)-18.0); float ar=max(step(abs(bp.x),0.07)*step(abs(bp.y),0.7), step(abs(bp.x),(0.95-bp.y)*0.55)*step(0.45,bp.y)*step(bp.y,0.95)); white=max(white,ar*inLane); }
    }
    white*=inLane; yellow*=inLane;
    // stop bars (traffic bound for node a keeps to u<0, for node b to u>0)
    float uMin=cls>2.5?med*0.5:-med*0.5;
    float barA=gLine(abs(v-(sA-0.45)),0.26,fv)*step(uMin,-u)*step(-u,travel+0.05)*stA;
    float barB=gLine(abs(v-(sB+0.45)),0.26,fv)*step(uMin,u)*step(u,travel+0.05)*stB;
    float lu0=(au-med*0.5)/max(lw,0.1), dl0=(fract(lu0)-0.5)*lw, wheel0=exp(-pow((abs(dl0)-0.85)/0.33,2.0))*step(med*0.5,au)*step(au,travel);
    white=max(white,max(barA,barB)*(1.0-0.55*wheel0*wearN));
    // crosswalks: ladder bars on the big streets, two transverse lines elsewhere
    float cA=v-(tA+0.9), cB=(len-tB-0.9)-v; float cw=0.0;
    float lad=clamp((0.3-abs(fract(u/1.2)-0.5)*1.2)/fu+0.5,0.0,1.0);
    if(cwA>0.5) cw=max(cw, ladder>0.5 ? step(0.0,cA)*step(cA,3.0)*lad : max(gLine(abs(cA-0.15),0.15,fv),gLine(abs(cA-2.85),0.15,fv)));
    if(cwB>0.5) cw=max(cw, ladder>0.5 ? step(0.0,cB)*step(cB,3.0)*lad : max(gLine(abs(cB-0.15),0.15,fv),gLine(abs(cB-2.85),0.15,fv)));
    white=max(white,cw*step(au,hw-0.35)*(1.0-0.6*wheel0*(0.3+wearN)));
    // left-turn arrows in the centre lane ahead of signals
    if(med>2.0&&cls<2.5){
      vec2 pa=vec2(-u*1.0,(sA+13.0)-v), pb=vec2(u,v-(sB-13.0));
      for(int k=0;k<2;k++){ vec2 p=k==0?pa:pb; float on=k==0?arrA:arrB;
        float shaft=step(abs(p.x-0.25),0.09)*step(-1.6,p.y)*step(p.y,0.75), bend=step(abs(p.y-0.75),0.09)*step(-0.35,p.x)*step(p.x,0.34);
        float head=step(abs(p.y-0.75),(p.x+0.95)*0.6)*step(-0.95,p.x)*step(p.x,-0.3);
        white=max(white,max(shaft,max(bend,head))*on); }
    }
    // wheel paths, oil line
    float hsh=gH1(vec2(floor(len*7.0+0.37),floor(hw*13.0+0.37)));
    float lu=(au-med*0.5)/max(lw,0.1); float inT=step(med*0.5,au)*step(au,travel);
    float dl=(fract(lu)-0.5)*lw; float wheel=exp(-pow((abs(dl)-0.85)/0.33,2.0))*inT, oil=exp(-pow(dl/0.28,2.0))*inT;
    float nearStop=max(exp(-max(v-sA,0.0)/14.0)*step(u,0.0), exp(-max(sB-v,0.0)/14.0)*step(0.0,u));
    dark+=wheel*(0.10+0.1*wearL)+oil*(0.10+0.34*nearStop*(0.4+wearL));
    float parkZ=fPark*step(travel,au)*inLane; oilW=0.08+0.5*oil*(0.35+nearStop)+0.55*parkZ;
    pave=inT>0.5?0.9+0.2*gH1(vec2(floor(lu)+step(0.0,u)*9.0+hsh*13.0,floor(v/53.0+hsh*5.0))):(parkZ>0.5?0.93:1.0);
    gRgh-=wheel*0.1;
    // gutter pan and kerb-side dirt
    if(cls>0.5&&cls<2.5){ float gd=hw-au; conc=clamp((0.42-gd)/fu+0.5,0.0,1.0); dark+=exp(-gd/0.5)*0.12*(1.0-conc)+conc*exp(-gd/0.12)*0.3;
      tar=max(tar,gLine(abs(gd-0.42),0.012,fu));
      float dv=mod(v+hw*3.0,31.0)-15.5; iron=max(iron,step(abs(dv),0.45)*step(gd,0.38)*step(0.04,gd)*step(0.3,fract(abs(dv)*9.0))*step(0.0,u)); }
    // tar-sealed cracks wandering along the lane, patches, manholes
    
    float cx=(hsh-0.5)*hw*1.3+sin(v*0.23+hsh*40.0)*0.5+sin(v*0.71+hsh*9.0)*0.16+(wearN-0.5)*0.25;
    tar=max(tar,gLine(abs(u-cx),0.022,fu)*smoothstep(0.42,0.6,texture2D(uTNoise,vec2(v*0.004,hsh)).r));
    float cx2=(gH1(vec2(hsh,3.0))-0.5)*hw*1.5+sin(v*0.31+hsh*11.0)*0.4;
    tar=max(tar,gLine(abs(u-cx2),0.018,fu)*smoothstep(0.5,0.62,texture2D(uTNoise,vec2(v*0.006+0.3,hsh)).g));
    float tcr=abs(mod(v+hsh*20.0,23.0)-11.5); tar=max(tar,gLine(tcr+ (wearN-0.5)*0.1,0.02,fv)*step(0.55,gH1(vec2(floor((v+hsh*20.0)/23.0),hsh)))*step(au,hw-0.5));
    vec2 pc=vec2(floor((u+hw)/3.1),floor(v/7.0)); vec3 ph=gH3(pc+hsh*31.0); vec2 pf=vec2(fract((u+hw)/3.1),fract(v/7.0));
    vec2 pe=min(pf-vec2(0.08+0.2*ph.y,0.1),vec2(0.9-0.2*ph.z,0.85)-pf)*vec2(3.1,7.0);
    float pch=step(0.9,ph.x)*clamp(min(pe.x/fu,pe.y/fv)+0.5,0.0,1.0);
    base=mix(base,base*(ph.y>0.5?0.74:1.16),pch); tar=max(tar,step(0.9,ph.x)*gLine(abs(min(pe.x,pe.y)),0.02,max(fu,fv)));
    vec2 mc=vec2(floor(v/41.0),hsh*91.0); vec3 mh=gH3(mc); vec2 mp=vec2(u-(med*0.5+lw*0.5)*(mh.y>0.5?1.0:-1.0)-(mh.z-0.5)*0.8, mod(v,41.0)-8.0-mh.x*25.0); float md=length(mp);
    float mhOn=step(0.45,mh.x)*step(sA+2.0,v)*step(v,sB-2.0)*step(1.5,cls+0.6);
    iron=max(iron,clamp((0.31-md)/max(fu,fv)+0.5,0.0,1.0)*mhOn); conc=max(conc,clamp((0.44-md)/max(fu,fv)+0.5,0.0,1.0)*mhOn*0.3);
    gNxy+=vec2(0.0,0.25)*iron*sin(mp.x*60.0);
  } else {
    float gd=vWinA.y, fg=max(fwidth(gd),1e-4); conc=clamp((0.42-gd)/fg+0.5,0.0,1.0)*step(gd,50.0); dark+=exp(-gd/0.5)*0.1*(1.0-conc)*step(gd,50.0);
    tar=max(tar,gLine(abs(gd-0.42),0.012,fg)*step(gd,50.0));
    dark+=0.08*wearL;
  }
  { vec4 cn=texture2D(uTNoise,wp*0.043+0.11); float f1=max(fwidth(cn.r),1e-5), f2=max(fwidth(cn.b),1e-5);
    float zone=smoothstep(0.5,0.64,texture2D(uTNoise,wp*0.0087+0.4).g), sealed=smoothstep(0.46,0.56,texture2D(uTNoise,wp*0.0041+0.9).b);
    float cS=max(gLine(abs(cn.r-0.5),0.011,f1),gLine(abs(cn.b-0.47),0.009,f2)*0.9), cO=max(gLine(abs(cn.r-0.5),0.0035,f1),gLine(abs(cn.b-0.47),0.003,f2));
    float cx3=gLine(abs(texture2D(uTNoise,wp*0.11+0.53).g-0.5),0.006,max(fwidth(texture2D(uTNoise,wp*0.11+0.53).g),1e-5))*smoothstep(0.58,0.7,texture2D(uTNoise,wp*0.019+0.77).r);
    float brk=smoothstep(0.38,0.52,texture2D(uTNoise,wp*0.27+0.61).a); tar=max(tar,cS*zone*sealed*brk*step(0.62,cn.g)*0.9); dark+=(cO*zone*brk+cx3)*0.45;
    float o1=texture2D(uTNoise,wp*0.57).a, o2=texture2D(uTNoise,wp*0.131+0.27).r; float spot=smoothstep(0.56,0.74,o1)*smoothstep(0.42,0.66,o2);
    dark+=spot*oilW*0.8; gRgh-=spot*oilW*0.35; }
  // large-scale wear: bleached, patchy asphalt
  base*=pave*mix(0.80,1.24,wearL); base=mix(base,vec3(dot(base,vec3(0.333)))*1.15,0.25*wearN);
  base*=1.0-clamp(dark,0.0,0.6);
  vec3 concC=vec3(0.30,0.295,0.28)*(0.75+0.5*wearN);
  base=mix(base,concC,conc);
  float wearP=(0.4+0.6*smoothstep(0.25,0.62,wearN*0.6+wearL*0.5))*(0.72+0.28*smoothstep(0.3,0.5,texture2D(uTNoise,wp*1.9).a));
  base=mix(base,vec3(0.66,0.66,0.63),white*wearP);
  base=mix(base,vec3(0.70,0.47,0.035),yellow*wearP);
  base=mix(base,vec3(0.018),tar*0.92);
  base=mix(base,vec3(0.05,0.047,0.043)*(0.7+0.6*wearN),iron);
  diffuseColor.rgb=base;
  gRgh=mix(gRgh,0.62,max(white,yellow)*wearP); gRgh=mix(gRgh,0.35,tar); gRgh=mix(gRgh,0.5,iron); gMetal=iron*0.8;
  gNxy*=1.0-0.6*max(white,max(yellow,tar));
}
`;

// Windows. vUvM = wall metres (cells start at vWinB.zw); vWinA = (cell w, cell h, window w, window h),
// vWinB = (seed*8 + lit profile, style + recess depth, grid origin u, v). Styles: 0 masonry punched, 1 office glazing, 2 shopfront,
// 3 industrial multi-pane, 4 glass door, 5 roll-up door, 6 open parking deck, 7 glazed sectional door, 8 panel door,
// 9 house window with casing. Lit profiles: 0 office, 1 apartment, 2 shop, 3 house, 4 industrial, 5 always, 6 never.
const FACADE_FS = `
{ // grime: splash zone at the base, rain streaks down the wall
  vec3 wN=inverseTransformDirection(normalize(vNormal),viewMatrix);
  if(abs(wN.y)<0.6){ float lay0=mod(floor(vCol.a*255.0+0.5),32.0); float soft=(lay0<0.5||(lay0>2.5&&lay0<5.5))?1.0:0.45;
    float streak=texture2D(uTNoise,vec2(vUvM.x*0.31+vWetPos.x*0.01,vUvM.y*0.017)).r;
    float run=smoothstep(0.5,0.85,texture2D(uTNoise,vec2(vUvM.x*1.7+vWetPos.z*0.03,vUvM.y*0.045)).g);
    float blotch=smoothstep(0.45,0.8,texture2D(uTNoise,vUvM*0.045+vWetPos.xz*0.003).b);
    if(lay0>0.5&&lay0<2.5){ float eff=smoothstep(0.6,0.92,texture2D(uTNoise,vec2(vUvM.x*0.37,vUvM.y*0.085)+0.19).a)*smoothstep(0.35,0.7,texture2D(uTNoise,vUvM*0.021+0.6).r); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.62,0.6,0.56),eff*0.3);
      vec2 pq=vUvM/vec2(3.1,2.3); vec3 ph=gH3(floor(pq)+3.7); vec2 pf=fract(pq); float pat=step(0.86,ph.x)*step(0.12,pf.x)*step(pf.x,0.3+0.55*ph.y)*step(0.15,pf.y)*step(pf.y,0.3+0.5*ph.z); diffuseColor.rgb*=mix(1.0,ph.y>0.5?1.22:0.78,pat); }
    diffuseColor.rgb*=mix(0.62,1.0,smoothstep(0.0,1.5,vWetPos.y-0.1+gMacro.b*0.7))*(0.86+0.26*streak)*(1.0-0.3*soft*run)*(1.0-0.16*soft*blotch);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.93,0.9,0.8),soft*run*0.6); }
}
#ifdef TOWN_FACADE
if(vWinA.x>0.01){
  vec2 cuv=vUvM-vWinB.zw; vec2 cs=vWinA.xy, cell=floor(cuv/cs), f=cuv-(cell+0.5)*cs, hs=vWinA.zw*0.5;
  float style=floor(vWinB.y), rec=fract(vWinB.y), prof=mod(floor(vWinB.x+0.5),8.0), seed=floor((vWinB.x+0.5)/8.0);
  float sill = style<0.5||style>8.5 ? 0.95 : style<1.5 ? 0.85 : style<2.5 ? 0.5 : style<3.5 ? (cs.y-vWinA.w)*0.5 : style<4.5 ? 0.04 : style<5.5 ? 0.0 : style<6.5 ? 1.05 : style<7.5 ? 0.0 : 0.04;
  sill=min(sill,cs.y-vWinA.w-0.02);
  f.y-=sill+hs.y-cs.y*0.5;
  vec3 Vv=normalize(vViewPosition), Nv=normalize(vNormal), upV=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);
  vec3 Tv=cross(upV,Nv); float tl=length(Tv); Tv=tl>1e-4?Tv/tl:vec3(1.0,0.0,0.0); vec3 Bv=cross(Nv,Tv);
  vec3 vt=vec3(dot(Vv,Tv),dot(Vv,Bv),max(dot(Vv,Nv),0.12)); vec2 par=vt.xy/vt.z;
  vec2 fw=max(fwidth(vUvM),vec2(1e-4)); float fwm=max(fw.x,fw.y);
  vec3 ch=gH3(cell+seed*7.13), ch2=gH3(cell*1.7+seed*3.3+5.0);
  vec2 q=f-par*rec; vec2 dIn=hs-abs(f), dq=hs-abs(q);
  float aOpen=clamp(min(dIn.x/fw.x,dIn.y/fw.y)+0.5,0.0,1.0);
  float aGlass=clamp(min(dq.x/fw.x,dq.y/fw.y)+0.5,0.0,1.0);
  float lod=(1.0-smoothstep(0.12,0.55,fwm/max(min(vWinA.z,vWinA.w),0.1)));        // 1 near .. 0 when a window is a few pixels
  float vis=(1.0-smoothstep(0.3,0.75,fwm/min(cs.x,cs.y)));
  if(style<3.5||style>8.5){ float us=step(abs(f.x),hs.x+0.06)*step(f.y,-hs.y-0.08)*exp((f.y+hs.y)*0.7)*(0.45+0.55*ch.x); float sn=smoothstep(0.25,0.7,texture2D(uTNoise,vec2(cuv.x*2.3,cuv.y*0.06)).r); diffuseColor.rgb*=1.0-0.4*us*sn*lod; }
  vec3 wallC=diffuseColor.rgb;
  // trim on the wall round the opening
  if(style<0.5){ float sb=step(abs(f.x),hs.x+0.07)*step(-hs.y-0.1,f.y)*step(f.y,-hs.y); float lb=step(abs(f.x),hs.x+0.1)*step(hs.y,f.y)*step(f.y,hs.y+0.16);
    vec3 stone=vec3(0.50,0.48,0.43)*(0.8+0.3*gMacro.r); diffuseColor.rgb=mix(diffuseColor.rgb,stone,max(sb,lb)*lod); gNxy*=1.0-max(sb,lb)*0.8;
    float sh=step(abs(f.x),hs.x+0.07)*smoothstep(-hs.y-0.22,-hs.y-0.1,f.y)*step(f.y,-hs.y-0.1); diffuseColor.rgb*=1.0-0.35*sh*lod;
    float dirt=step(abs(f.x),hs.x)*step(f.y,-hs.y-0.1)*exp((f.y+hs.y)*1.6); diffuseColor.rgb*=1.0-0.16*dirt*ch.x; }
  else if(style>8.5||(style>7.5&&style<8.5)){ vec2 dt=abs(f)-hs; float casing=step(max(dt.x,dt.y),0.095)*step(0.0,max(dt.x,dt.y)); float ledge=step(abs(f.x),hs.x+0.13)*step(-hs.y-0.14,f.y)*step(f.y,-hs.y-0.09)*step(8.5,style);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.74,0.73,0.70),max(casing,ledge)*lod); gNxy*=1.0-casing; gRgh=mix(gRgh,0.5,casing*lod); }
  else if(style>4.5&&style<5.5||style>6.5&&style<7.5){ vec2 dt=abs(f)-hs; float casing=step(max(dt.x,dt.y),0.12)*step(0.0,max(dt.x,dt.y))*step(-hs.y,f.y); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.55,casing*lod); }
  // what is in the opening
  vec3 oc=vec3(0.03); float oRgh=0.5, oMet=0.0; vec3 oE=vec3(0.0); vec2 oN=vec2(0.0);
  float night=smoothstep(0.12,0.55,uNight);
  if(style>4.5&&style<5.5){        // roll-up door: painted slats
    float sl=fract((q.y+hs.y)/0.09); vec3 dc=mix(vec3(0.42,0.43,0.44),vec3(0.50,0.47,0.40),ch.x); if(ch2.x>0.7) dc=mix(vec3(0.13,0.2,0.3),vec3(0.3,0.1,0.08),ch2.y);
    oc=dc*(0.72+0.28*smoothstep(0.0,0.25,sl)*(1.0-smoothstep(0.7,1.0,sl)))*(0.85+0.15*gMacro.r); oN=vec2(0.0,(sl-0.5)*0.9*lod); oRgh=0.5; oc*=mix(0.8,1.0,smoothstep(-hs.y,-hs.y+0.6,q.y));
  } else if(style>7.5&&style<8.5){ // panel door
    vec3 dc=ch.x<0.25?vec3(0.30,0.05,0.04):ch.x<0.5?vec3(0.06,0.11,0.19):ch.x<0.75?vec3(0.16,0.10,0.06):vec3(0.55,0.54,0.5);
    vec2 pq=vec2(abs(q.x)/hs.x,(q.y+hs.y)/(2.0*hs.y)); float pan=step(0.18,pq.x)*step(pq.x,0.82)*(step(0.08,pq.y)*step(pq.y,0.42)+step(0.5,pq.y)*step(pq.y,0.66));
    float lite=step(pq.x,0.7)*step(0.74,pq.y)*step(pq.y,0.92);
    oc=dc*(1.0-0.22*pan*lod); oRgh=0.4; oN=vec2(0.0);
    if(lite>0.5){ oc=vec3(0.09); oMet=1.0; oRgh=0.08; oE=vec3(1.0,0.75,0.45)*0.9*night*step(0.4,ch2.z); }
    float knob=step(length(vec2(q.x-hs.x*0.78,q.y+0.05)),0.04); oc=mix(oc,vec3(0.6,0.5,0.25),knob); oMet=max(oMet,knob);
  } else {                          // glazing of some kind
    float ft = style<0.5||style>8.5 ? 0.055 : style<1.5 ? 0.035 : style<2.5 ? 0.05 : style<3.5 ? 0.03 : 0.06;
    float fr=1.0-clamp(min(dq.x,dq.y)/ft,0.0,1.0); fr=step(0.001,fr);
    float mul=0.0;
    if(style<0.5||style>8.5){ mul=max(step(abs(q.y-0.02),0.028), step(1.45,vWinA.z)*step(abs(q.x),0.025)); }
    else if(style<1.5){ float np=max(1.0,floor(vWinA.z/1.35+0.5)); float px=fract((q.x+hs.x)/(2.0*hs.x)*np); mul=step(min(px,1.0-px)*2.0*hs.x/np,0.022); }
    else if(style<2.5){ float np=max(1.0,floor(vWinA.z/1.7+0.5)); float px=fract((q.x+hs.x)/(2.0*hs.x)*np); mul=max(step(min(px,1.0-px)*2.0*hs.x/np,0.028), step(abs(q.y-(hs.y-0.55)),0.03)*step(2.6,vWinA.w)); }
    else if(style<3.5){ vec2 pp=fract((q+hs)/0.48); mul=max(step(min(pp.x,1.0-pp.x)*0.48,0.016),step(min(pp.y,1.0-pp.y)*0.48,0.016)); }
    else if(style<4.5){ mul=max(step(abs(q.x),0.03)*step(1.5,vWinA.z), step(abs(q.y+hs.y-1.0),0.03)*step(abs(abs(q.x)-hs.x*0.5),hs.x*0.3)); mul=max(mul,step(q.y+hs.y,0.22)); }
    else if(style<6.5){ mul=0.0; fr=0.0; }
    else { float sy=fract((q.y+hs.y)/0.62); mul=max(step(min(sy,1.0-sy)*0.62,0.035), step(abs(fract((q.x+hs.x)/(2.0*hs.x)*4.0)-0.5)*2.0*hs.x/4.0,0.03)); }
    float frame=max(fr,mul)*lod;
    vec3 frameC = style<0.5 ? mix(vec3(0.62,0.61,0.58),vec3(0.12,0.11,0.10),step(0.5,gH1(vec2(seed,3.0)))) : style>8.5 ? vec3(0.72,0.71,0.68) : style<1.5 ? vec3(0.05,0.055,0.06) : style<2.5 ? vec3(0.16,0.16,0.17) : style<3.5 ? vec3(0.10,0.11,0.10) : style>6.5 ? vec3(0.50,0.10,0.08) : vec3(0.33,0.34,0.35);
    // the room behind the glass
    float D = style<1.5 ? (style<0.5?4.0:7.0) : style<2.5 ? 6.5 : style<3.5 ? 9.0 : style<6.5 ? 14.0 : 9.0; if(style>8.5) D=4.0;
    vec2 c0=q+vec2(0.0,sill+hs.y-cs.y*0.5); vec2 hr=vec2(cs.x*0.5,cs.y*0.5); vec2 dd=-par;
    float tx=((dd.x>0.0?hr.x:-hr.x)-c0.x)/(abs(dd.x)<1e-4?(dd.x<0.0?-1e-4:1e-4):dd.x);
    float ty=((dd.y>0.0?hr.y-0.25:-hr.y)-c0.y)/(abs(dd.y)<1e-4?(dd.y<0.0?-1e-4:1e-4):dd.y);
    float tt=max(min(min(tx,ty),D),0.0); vec2 hp=c0+dd*tt; float dep=tt/D;
    vec3 roomC=mix(vec3(0.55,0.50,0.42),vec3(0.45,0.50,0.55),ch.y); if(ch.z>0.6) roomC=mix(roomC,vec3(0.62,0.58,0.5),0.6);
    vec3 ic;
    if(tt>=D-1e-3){ ic=roomC; float furn=step(hp.y,-hr.y+0.9+ch2.x*0.9)*step(abs(hp.x-(ch2.y-0.5)*hr.x),hr.x*(0.3+0.4*ch2.z)); ic=mix(ic,roomC*0.35,furn);
      float pic=step(abs(hp.x+(ch2.z-0.5)*hr.x),0.4)*step(abs(hp.y-0.25),0.28)*step(0.5,ch2.x); ic=mix(ic,vec3(0.25,0.3,0.4)*(0.5+ch2.y),pic);
      if(style>1.5&&style<2.5){ float yy=hp.y+hr.y, bx=(hp.x+hr.x)/1.7, bay=floor(bx), bf=fract(bx), sf=fract(yy/0.46);
        float unit=step(0.3,gH1(vec2(bay,seed+4.0)))*step(yy,1.5+0.9*gH1(vec2(bay,seed+9.0)))*step(0.06,bf)*step(bf,0.94);
        vec3 uc=roomC*mix(0.5,0.8,gH1(vec2(bay,seed+2.0)))*(0.78+0.22*step(0.1,sf));
        vec2 ic2=vec2(floor((hp.x+hr.x)/0.19),floor(yy/0.46)); { float sg=gH1(ic2+seed+7.0); uc=mix(uc,mix(vec3(0.12+0.3*sg),gH3(ic2+seed+7.0)*0.5+0.08,0.2),0.3*step(0.1,sf)*step(sf,0.5+0.4*gH1(ic2+seed))); }
        ic=mix(roomC*0.82,uc,unit); float pst=step(abs(fract(bx*0.5+0.25)-0.5),0.16)*step(1.9,yy)*step(yy,2.7)*(1.0-unit); ic=mix(ic,gH3(vec2(bay,seed))*0.45+0.2,pst*0.7);
        float cn=step(yy,1.0)*step(abs(hp.x-(ch2.y-0.5)*hr.x),hr.x*0.55); ic=mix(ic,vec3(0.13,0.10,0.08),cn); ic=mix(ic,vec3(0.5,0.47,0.42),cn*step(0.93,yy)); }
      if(style>5.5&&style<6.5){ ic=vec3(0.16,0.16,0.17); float colm=step(abs(fract(hp.x/8.0+0.5)-0.5)*8.0,0.3); ic=mix(ic,vec3(0.3),colm); } }
    else if(ty<tx){ ic=dd.y>0.0?vec3(0.72,0.72,0.70):mix(vec3(0.20,0.16,0.12),vec3(0.24,0.24,0.25),ch.x);
      if(dd.y>0.0){ float fx=step(abs(fract(tt/2.4)-0.5),0.12)*step(abs(hp.x),hr.x*0.5); ic=mix(ic,vec3(3.2),fx*step(0.5,style)); }
      else if(style>1.5&&style<2.5){ vec2 tq=vec2(hp.x,tt)/0.6; ic=mix(vec3(0.27,0.25,0.23),vec3(0.22,0.21,0.19),mod(floor(tq.x)+floor(tq.y),2.0)); } }
    else { ic=roomC*0.78; if(style>1.5&&style<2.5){ float yy=hp.y+hr.y, sf=fract(yy/0.46); vec2 ic2=vec2(floor(tt/0.42),floor(yy/0.46)+13.0);
        vec3 uc=roomC*0.6*(0.78+0.22*step(0.1,sf)); { float sg=gH1(ic2+seed+3.0); uc=mix(uc,mix(vec3(0.1+0.4*sg),gH3(ic2+seed+3.0)*0.5+0.08,0.22),0.5*step(0.1,sf)*step(sf,0.5+0.4*gH1(ic2+seed))); }
        ic=mix(ic,uc,step(yy,2.1)*step(0.7,tt)); } }
    ic*=mix(1.0,0.38,dep);
    float litR=prof<0.5?ch.x:mix(ch.x,gH1(vec2(cell.y,seed)),0.1); float floorLit=step(prof,0.5)*step(0.84,gH1(vec2(cell.y,seed+1.0)))*step(0.2,ch2.z);
    float pLit = prof<0.5 ? mix(0.62,0.17,smoothstep(0.75,1.0,uNight)) : prof<1.5 ? 0.42 : prof<2.5 ? 0.8 : prof<3.5 ? 0.5 : prof<4.5 ? 0.22 : prof<5.5 ? 1.0 : 0.0;
    float lit=max(step(1.0-pLit,litR),floorLit)*night;
    vec3 lightC = prof<0.5||prof>3.5 ? mix(vec3(0.82,0.92,1.0),vec3(1.0,0.93,0.8),ch2.x) : mix(vec3(1.0,0.72,0.42),vec3(1.0,0.86,0.66),ch2.x); if(prof>1.5&&prof<2.5) lightC=mix(vec3(1.0,0.8,0.56),vec3(1.0,0.93,0.82),ch2.y);
    float lightI=(0.7+1.1*ch2.y)*(prof>1.5&&prof<2.5?0.9:1.0);
    float dayIn=(1.0-uNight)*(style>1.5&&style<2.5?0.24:0.09), dayBl=(1.0-uNight)*0.36;
    vec3 inner=ic*(dayIn+lit*lightI*lightC*(style>3.5&&style<4.5?0.1:0.19)*(0.75+0.25*smoothstep(-hs.y,hs.y,q.y)));
    // blinds and curtains sit just behind the glass
    float blind=0.0; vec3 blindC=vec3(0.62,0.6,0.55);
    if(style<1.5||style>8.5){ float bf=ch2.z>0.35?ch2.x*ch2.x:0.0; if(style>0.5&&style<1.5) bf*=0.6; blind=step(hs.y-bf*2.0*hs.y,q.y); blindC*=0.85+0.15*sin(q.y*110.0)*lod;
      if(style<0.5||style>8.5){ float cur=step(hs.x*(1.0-0.55*ch.z*step(0.4,ch2.y)),abs(q.x)); vec3 curC=mix(vec3(0.55,0.5,0.42),vec3(0.35,0.2,0.2),ch.y)*(0.8+0.2*sin(q.x*45.0)); if(cur>blind){ blind=cur; blindC=curC; } } }
    if(prof>5.5) { blind=1.0; blindC=vec3(0.3); }
    inner=mix(inner,blindC*(dayBl+lit*lightI*lightC*0.13),blind);
    float F0=style>0.5&&style<1.5?0.24:0.13;
    oc=vec3(F0)*mix(vec3(0.9,1.0,1.05),vec3(1.0),0.5); oMet=1.0; oRgh=0.045+0.05*ch.y; oE=inner; oN=(ch.xy-0.5)*0.05+vec2(0.0,0.015*sin(q.y*2.0));
    if(style>5.5&&style<6.5){ oc=ic*0.4; oMet=0.0; oRgh=0.9; oE=ic*night*1.5*vec3(0.8,0.92,1.0); oN=vec2(0.0); }
    if(style>2.5&&style<3.5){ oRgh=0.35; oE=mix(vec3(0.1,0.12,0.12)*dayIn*4.0,vec3(0.9,1.0,0.95)*0.9,lit)*(0.6+0.4*ch.z); oc=vec3(0.06); }
    if(style>1.5&&style<2.5&&lod>0.3){ vec2 d2=q-vec2((ch2.x-0.5)*hs.x*0.6,hs.y*0.3); float rowf=fract((d2.y+0.2)/0.13);
      float dec=step(abs(d2.x),min(hs.x*0.62,0.95))*step(abs(d2.y),0.2)*step(0.36,gH1(vec2(floor(d2.x/0.085),floor((d2.y+0.2)/0.13)+seed)))*step(0.06,rowf)*step(rowf,0.62)*step(0.35,ch.z);
      vec2 hq=q-vec2(hs.x-0.3,-hs.y+0.5); float card=step(abs(hq.x),0.11)*step(abs(hq.y),0.15)*step(ch.x,0.6); float cl=step(0.5,fract(hq.y/0.04))*step(abs(hq.x),0.08)*step(abs(hq.y),0.12);
      vec3 dcol=mix(vec3(0.85,0.84,0.8),vec3(0.72,0.18,0.14),step(0.7,ch2.z));
      oc=mix(oc,dcol,dec); oc=mix(oc,mix(vec3(0.88),vec3(0.14),cl),card); float op=max(dec,card); oMet*=1.0-op; oRgh=mix(oRgh,0.5,op); oE*=1.0-op*0.85; }
    { float lsh=smoothstep(hs.y-rec*1.7-0.035,hs.y-rec*1.7+0.035,q.y)*(1.0-uNight); oE*=1.0-0.6*lsh; frameC*=1.0-0.45*lsh; gShade=lsh; }
    oc=mix(oc,frameC,frame); oMet*=1.0-frame; oRgh=mix(oRgh,0.45,frame); oE*=1.0-frame; oN*=1.0-frame;
    // far away the pane collapses to an average
    oE=mix(vec3(lit)*lightC*lightI*0.13*roomC,oE,lod);
  }
  // the reveal between wall face and glass
  vec3 rev=wallC*(q.y>hs.y?0.42:q.y<-hs.y?1.05:0.66); if(style<0.5&&q.y<-hs.y) rev=vec3(0.46,0.44,0.40);
  vec3 col=mix(rev,oc,aGlass); float met=oMet*aGlass, rgh=mix(0.85,oRgh,aGlass); vec3 em=oE*aGlass; vec2 nn=oN*aGlass;
  float a=aOpen*vis;
  diffuseColor.rgb=mix(diffuseColor.rgb,col,a); gGlass=met*a; gMetal=mix(gMetal,met,a); gRgh=mix(gRgh,rgh,a); gNxy=mix(gNxy,nn,a); gEmis+=em*a;
  // light spilling onto the wall round a lit shopfront
}
#endif
`;

function patchSurface(mat, kind, tex, nLayers, sh) {
  patchWet(mat, { puddles: kind === 'road' ? 1 : kind === 'ground' ? 0.7 : 0, scale: 0.09 });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev(s, r);
    Object.assign(s.uniforms, { uAlb: { value: tex.alb.texture }, uNrm: { value: tex.nrm.texture }, uTNoise: sh.uTNoise, uLampMap: sh.uLampMap, uLampRect: sh.uLampRect, uNight: U.uNight, uLP: { value: tex.lp }, uLN: { value: tex.ln }, uLS: { value: tex.ls } });
    const win = kind === 'road' || kind === 'facade';
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nattribute vec4 aCol; varying vec4 vCol; varying vec2 vUvM; ${win ? 'attribute vec4 aWinA; attribute vec4 aWinB;' : ''} varying vec4 vWinA; varying vec4 vWinB;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCol=aCol; vUvM=uv; ${win ? 'vWinA=aWinA; vWinB=aWinB;' : 'vWinA=vec4(0.0); vWinB=vec4(0.0);'}`);
    let f = s.fragmentShader;
    f = f.replace('#include <common>', '#include <common>\n' + (kind === 'facade' ? '#define TOWN_FACADE\n' : '') + `#define TOWN_OCC ${kind === 'road' || kind === 'ground' ? '0.6' : '0.42'}
` + FRAG_PARS(nLayers));
    f = f.replace('#include <map_fragment>', BASE_FS + (kind === 'road' ? ROAD_FS : kind === 'ground' ? LAWN_FS : FACADE_FS));
    f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(gRgh,0.03,1.0);');
    f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=clamp(gMetal,0.0,1.0);');
    f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ mat3 tb=gTBN(-vViewPosition,normal,vUvM); normal=normalize(tb*vec3(gNxy,1.0)+normal*1e-4); }');
    f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=gEmis;');
    f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { vec3 lm=texture2D(uLampMap,(vWetPos.xz-uLampRect.xy)*uLampRect.zw).rgb; lm*=lm;
        vec3 wn2=inverseTransformDirection(normal,viewMatrix); float hf=(1.0-smoothstep(1.5,15.0,vWetPos.y))*(0.5+0.5*wn2.y);
        reflectedLight.indirectDiffuse+=lm*(uNight*hf*9.0)*diffuseColor.rgb*(1.0-metalnessFactor);
        // street canyons: reflections that leave near the horizontal would hit other buildings, not bright sky
        vec3 rw=inverseTransformDirection(reflect(-normalize(vViewPosition),normal),viewMatrix); float skyV=smoothstep(-0.12,0.5,rw.y);
        float occ=mix(mix(TOWN_OCC,0.85,smoothstep(6.0,34.0,vWetPos.y)),1.0,skyV); float sk=mix(gSpec,1.0,max(gGlass,max(metalnessFactor,uWet*0.8*smoothstep(0.3,0.7,gSpec)))); float az=atan(rw.z,rw.x+1e-5); float sl=0.05+0.5*gH1(vec2(floor(az*9.0+(vWetPos.x+vWetPos.z)*0.03),3.0))*mix(1.0,0.3,smoothstep(4.0,30.0,vWetPos.y)); float gref=mix(0.1,1.0,smoothstep(sl,sl+0.03,rw.y)); reflectedLight.indirectSpecular*=mix(occ,gref,gGlass)*sk*(1.0-0.5*gShade*gGlass); reflectedLight.directSpecular*=sk; }`);
    s.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'town-' + kind;
  return mat;
}

// River and pond water: dark, glossy, two layers of drifting ripples, a little rain chop.
function makeWater(sh) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.055, 0.05), roughness: 0.07, metalness: 0 });
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uTNoise: sh.uTNoise, uTime: U.uTime, uRain: U.uRain, uLampMap: sh.uLampMap, uLampRect: sh.uLampRect, uNight: U.uNight });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uTNoise,uLampMap; uniform float uTime,uRain,uNight; uniform vec4 uLampRect;\nfloat wH(vec2 p,vec2 f){ return texture2D(uTNoise,p*0.031+f).a+texture2D(uTNoise,p*0.011-f*0.6).r*1.5+texture2D(uTNoise,p*0.13+f*2.0).a*0.35*(1.0+2.0*uRain); }')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 p=vWP.xz, f=vec2(0.02,0.11)*uTime; float h0=wH(p,f), hx=wH(p+vec2(0.35,0.0),f), hz=wH(p+vec2(0.0,0.35),f);
          vec3 wn=normalize(vec3((h0-hx)*0.55,1.0,(h0-hz)*0.55)); normal=normalize((viewMatrix*vec4(wn,0.0)).xyz); }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { vec3 lm=texture2D(uLampMap,(vWP.xz-uLampRect.xy)*uLampRect.zw).rgb; reflectedLight.indirectDiffuse+=lm*lm*uNight*0.6*vec3(0.25,0.3,0.3); }`);
  };
  return mat;
}

export function buildMaterials(renderer, { texSize = 1024, aniso = 16 } = {}) {
  const baked = bakeArrays(renderer, texSize, aniso);
  const pack = (rt, layers) => ({ alb: rt.alb, nrm: rt.nrm, lp: layers.map(l => new THREE.Vector4(1 / l.tile, l.s2[0], l.s2[1], l.s2[2])), ln: layers.map(l => l.n), ls: layers.map(l => l.sp ?? 0.85) });
  const ground = pack(baked.ground, GROUND_LAYERS), wall = pack(baked.wall, WALL_LAYERS);
  const lampCv = document.createElement('canvas'); lampCv.width = lampCv.height = 4;
  const lampTex = new THREE.CanvasTexture(lampCv); lampTex.minFilter = lampTex.magFilter = THREE.LinearFilter; lampTex.generateMipmaps = false; lampTex.colorSpace = THREE.NoColorSpace; lampTex.flipY = false;
  const sh = { uTNoise: { value: macroNoise() }, uLampMap: { value: lampTex }, uLampRect: { value: new THREE.Vector4(0, 0, 1, 1) } };
  const std = o => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, ...o });
  const M = {
    sh, ground, wall,
    road: patchSurface(std(), 'road', ground, GROUND_LAYERS.length, sh),
    ground: patchSurface(std(), 'ground', ground, GROUND_LAYERS.length, sh),
    decal: patchSurface(std({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }), 'ground', ground, GROUND_LAYERS.length, sh),
    facade: patchSurface(std(), 'facade', wall, WALL_LAYERS.length, sh),
    plain: patchSurface(std(), 'plain', wall, WALL_LAYERS.length, sh),
    water: makeWater(sh),
    setLampMap(canvas, minX, minZ, w, h) { lampTex.image = canvas; lampTex.needsUpdate = true; sh.uLampRect.value.set(minX, minZ, 1 / w, 1 / h); },
    dispose() { for (const k of ['road', 'ground', 'decal', 'facade', 'plain', 'water']) M[k].dispose(); for (const t of [ground, wall]) { t.alb.dispose(); t.nrm.dispose(); } sh.uTNoise.value.dispose(); lampTex.dispose(); },
  };
  M.decal.customProgramCacheKey = () => 'town-ground';
  return M;
}
