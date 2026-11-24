// Rendering core: renderer + post chain, the sky dome, weather, time-of-day presets and the shared "wet surface"
// material patch. Every world (the town, an interior set, the dev harness) is its own THREE.Scene; G.view(scene, camera)
// picks which one the post chain draws.
//
// Conventions for every module: metres, Y up, linear-light colours, MeshStandardMaterial/MeshPhysicalMaterial only
// (so the fog, shadows, IBL and tone mapping all agree). Emissive values above 1 bloom.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { clamp } from './util.js';

// Uniforms shared by every patched material. Mutate .value only.
export const U = {
  uTime: { value: 0 },
  uWet: { value: 0 },      // 0 dry .. 1 soaked
  uRain: { value: 0 },     // 0 none .. 1 heavy (drives ripples)
  uNight: { value: 0 },    // 0 day .. 1 night (lit windows, lamps, light pools)
  uStrobe: { value: new THREE.Color(0, 0, 0) }, // current emergency-light colour, for tinting rain and haze
};

export const QUALITY = {
  low: { scale: 0.75, shadow: 1024, shadowRange: 60, msaa: 0, ao: false, bloom: true, smaa: false, rain: 2000, aniso: 4 },
  medium: { scale: 1, shadow: 2048, shadowRange: 80, msaa: 2, ao: false, bloom: true, smaa: true, rain: 5000, aniso: 8 },
  high: { scale: 1, shadow: 4096, shadowRange: 110, msaa: 4, ao: true, bloom: true, smaa: true, rain: 9000, aniso: 16 },
  ultra: { scale: 1, shadow: 4096, shadowRange: 140, msaa: 4, ao: true, bloom: true, smaa: true, rain: 14000, aniso: 16, dpr: 2 },
};

export const G = {
  renderer: null, composer: null, canvas: null, scene: null, camera: null, quality: 'high', q: QUALITY.high,
  passes: {}, w: 1, h: 1, pmrem: null, noAO: new Set(), grade: null, time: 0,
  view(scene, camera) {
    G.scene = scene; G.camera = camera;
    const p = G.passes;
    if (p.render) { p.render.scene = scene; p.render.camera = camera; }
    if (p.ao) { p.ao.scene = scene; p.ao.camera = camera; }
  },
};

const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';

// Kills any non-number pixel before bloom can smear it across the frame, and caps brightness.
const cleanShader = {
  uniforms: { tDiffuse: { value: null } }, vertexShader: VS,
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tDiffuse; void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; if(!(c.r>=0.0&&c.r<1e4)) c.r=0.0; if(!(c.g>=0.0&&c.g<1e4)) c.g=0.0; if(!(c.b>=0.0&&c.b<1e4)) c.b=0.0; gl_FragColor=vec4(min(c,vec3(40.0)),1.0); }',
};

// Display-referred finishing: lens fringe, contrast/saturation, split tone, vignette, grain, plus gameplay overlays
// (uStress: tunnel vision and desaturation when the player is in trouble; uFade: fade to black).
const gradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uT: { value: 0 }, uAspect: { value: 1.6 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 },
    uSat: { value: 1.06 }, uContrast: { value: 1.06 }, uAberr: { value: 0.0012 }, uShadowTint: { value: new THREE.Color(0.96, 1.0, 1.06) },
    uHighTint: { value: new THREE.Color(1.04, 1.0, 0.95) }, uFade: { value: 0 }, uStress: { value: 0 }, uFlash: { value: 0 },
  },
  vertexShader: VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uT,uAspect,uVig,uGrain,uSat,uContrast,uAberr,uFade,uStress,uFlash; uniform vec3 uShadowTint,uHighTint;
    float hash(vec2 p){ p=fract(p*vec2(443.897,441.423)); p+=dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
    void main(){
      vec2 p=vUv-0.5; vec2 q=vec2(p.x*uAspect,p.y); float d=length(q);
      vec2 dir=p*(d*d);
      float ab=uAberr*(1.0+uStress*3.0);
      vec3 c=vec3(texture2D(tDiffuse,vUv+dir*ab*2.0).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-dir*ab*2.0).b);
      float l=dot(c,vec3(0.2126,0.7152,0.0722));
      c=mix(c*uShadowTint, c*uHighTint, smoothstep(0.1,0.85,l));
      c=mix(vec3(l),c,uSat*(1.0-uStress*0.45));
      c=(c-0.5)*uContrast+0.5;
      float v=smoothstep(0.35,1.05,d);
      c*=1.0-v*(uVig+uStress*0.55);
      c+=uFlash;
      c+=(hash(vUv*vec2(1387.0,911.0)+fract(uT*7.31)*61.0)-0.5)*uGrain*(0.35+0.65*(1.0-l));
      c*=1.0-uFade;
      gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
    }`,
};

export function initGfx(canvas, quality = 'high') {
  G.canvas = canvas; G.quality = quality; G.q = QUALITY[quality] || QUALITY.high;
  const r = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.info.autoReset = true;
  G.pmrem = new THREE.PMREMGenerator(r);
  buildChain();
  return G;
}

function buildChain() {
  const r = G.renderer, q = G.q;
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr || 1.5) * q.scale;
  r.setPixelRatio(dpr);
  const w = G.canvas.clientWidth || window.innerWidth, h = G.canvas.clientHeight || window.innerHeight;
  r.setSize(w, h, false); G.w = w; G.h = h;
  if (G.composer) { G.composer.dispose(); for (const k in G.passes) G.passes[k].dispose?.(); }
  const rt = new THREE.WebGLRenderTarget(Math.floor(w * dpr), Math.floor(h * dpr), { type: THREE.HalfFloatType, samples: q.msaa });
  const c = G.composer = new EffectComposer(r, rt);
  c.setPixelRatio(dpr); c.setSize(w, h);
  const dummyS = G.scene || new THREE.Scene(), dummyC = G.camera || new THREE.PerspectiveCamera();
  const P = G.passes = {};
  c.addPass(P.render = new RenderPass(dummyS, dummyC));
  if (q.ao) {
    const ao = P.ao = new GTAOPass(dummyS, dummyC, w, h);
    ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: 12, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    ao.blendIntensity = 0.9;
    const orig = ao.render.bind(ao);
    ao.render = (...a) => { const hid = []; for (const o of G.noAO) if (o.visible) { o.visible = false; hid.push(o); } orig(...a); for (const o of hid) o.visible = true; };
    c.addPass(ao);
  }
  c.addPass(P.clean = new ShaderPass(cleanShader));
  if (q.bloom) { c.addPass(P.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.6, 1.0)); }
  c.addPass(P.out = new OutputPass());
  c.addPass(P.grade = new ShaderPass(gradeShader)); G.grade = P.grade.uniforms;
  if (q.smaa) c.addPass(P.smaa = new SMAAPass(w * dpr, h * dpr));
  G.grade.uAspect.value = w / h;
  if (G.scene) G.view(G.scene, G.camera);
}

export function setQuality(name) { if (!QUALITY[name]) return; G.quality = name; G.q = QUALITY[name]; buildChain(); for (const fn of qualityHooks) fn(G.q); }
const qualityHooks = [];
export function onQuality(fn) { qualityHooks.push(fn); }

export function resize() {
  if (!G.renderer) return;
  const w = G.canvas.clientWidth, h = G.canvas.clientHeight;
  if (!w || !h || (w === G.w && h === G.h)) return;
  G.w = w; G.h = h; G.renderer.setSize(w, h, false); G.composer.setSize(w, h);
  G.grade.uAspect.value = w / h;
  if (G.camera && G.camera.isPerspectiveCamera) { G.camera.aspect = w / h; G.camera.updateProjectionMatrix(); }
}

export function render(dt) {
  G.time += dt; U.uTime.value = G.time; G.grade.uT.value = G.time;
  if (G.grade.uFlash.value > 0) G.grade.uFlash.value = Math.max(0, G.grade.uFlash.value - Math.max(dt, 0.008) * 1.8);    // impact / shock flashes always fade
  if (G.camera && G.camera.isPerspectiveCamera && Math.abs(G.camera.aspect - G.w / G.h) > 1e-4) { G.camera.aspect = G.w / G.h; G.camera.updateProjectionMatrix(); }
  G.composer.render(dt);
}

// ---------------------------------------------------------------- sky

const SKY_FS = `
  varying vec3 vDir;
  uniform vec3 uSunDir,uZenith,uHorizon,uGlow,uCloudLit,uCloudDark,uFogCol,uMoonDir;
  uniform float uTime,uCover,uStars,uSunDisc,uHaze,uFlash,uMoon,uCityGlow;
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float h31(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
  float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
  float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.7); a*=0.5; } return s; }
  void main(){
    vec3 d=normalize(vDir);
    float up=max(d.y,0.0);
    vec3 col=mix(uHorizon,uZenith,1.0-exp(-up*3.2));
    float sd=max(dot(d,uSunDir),0.0);
    col+=uGlow*(pow(sd,5.0)*0.22+pow(sd,48.0)*0.55);
    // clouds on a flat layer
    float fade=smoothstep(0.015,0.22,d.y);
    if(uCover>0.001 && d.y>0.0){
      vec2 cuv=d.xz/(d.y+0.11)*1.35+vec2(uTime*0.006,uTime*0.0025);
      float n=fbm(cuv);
      float lo=1.0-uCover*0.92, dens=smoothstep(lo,lo+0.32,n+0.18*uCover);
      float n2=fbm(cuv+uSunDir.xz*0.22);
      float lit=clamp(0.55+(n-n2)*2.6,0.0,1.0);
      vec3 cc=mix(uCloudDark,uCloudLit,lit*(1.0-0.55*dens));
      cc+=uGlow*pow(sd,10.0)*0.35*(1.0-dens);
      cc+=vec3(0.75,0.8,1.0)*uFlash*(0.4+0.6*n);
      col=mix(col,cc,dens*fade);
    }
    // stars and moon, hidden by cloud
    if(uStars>0.001){
      vec3 g=d*210.0; vec3 id=floor(g); float r=h31(id);
      vec3 f=fract(g)-0.5; float s=(1.0-smoothstep(0.0,0.22,length(f)))*step(0.972,r);
      s*=0.55+0.45*sin(uTime*2.0+r*90.0);
      col+=vec3(0.85,0.9,1.0)*s*uStars*(1.0-uCover)*smoothstep(0.0,0.25,d.y)*1.6;
    }
    if(uMoon>0.001){
      float md=dot(d,uMoonDir);
      float disc=smoothstep(0.99965,0.99985,md);
      float mare=0.75+0.25*vn(d.xy*90.0);
      col+=vec3(0.95,0.97,1.0)*(disc*mare*2.2+pow(max(md,0.0),300.0)*0.12)*uMoon*(1.0-uCover*0.9);
    }
    float disc=smoothstep(0.99975,0.99992,dot(d,uSunDir));
    col+=uGlow*disc*uSunDisc*(1.0-uCover);
    // sodium glow of the town on low cloud and haze
    col+=vec3(1.0,0.55,0.22)*uCityGlow*exp(-up*5.0)*(0.5+0.5*uCover);
    // haze band into the fog colour so distant geometry meets the sky cleanly
    float hz=exp(-max(d.y,0.0)*uHaze);
    col=mix(col,uFogCol,clamp(hz,0.0,1.0));
    if(d.y<0.0) col=mix(uFogCol,uFogCol*0.55,1.0-smoothstep(-0.4,0.0,d.y));
    gl_FragColor=vec4(max(col,0.0),1.0);
  }`;

function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
      uTime: U.uTime, uCover: { value: 0.3 }, uStars: { value: 0 }, uSunDisc: { value: 1 }, uHaze: { value: 20 }, uFlash: { value: 0 }, uMoon: { value: 0 }, uCityGlow: { value: 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0); gl_Position=p.xyww; }',
    fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
  });
}

// ---------------------------------------------------------------- rain

function makeRain(maxCount) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const seed = new Float32Array(maxCount * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(1.5, 0, 0.6) }, uColor: { value: new THREE.Color(0.5, 0.55, 0.6) }, uStrobe: U.uStrobe, uBox: { value: 44 }, uHeight: { value: 26 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime,uBox,uHeight; uniform vec3 uCam,uWind; varying float vA; varying float vV;
      void main(){
        float sp=15.0+aSeed.w*7.0;
        vec3 fall=normalize(vec3(uWind.x,-sp,uWind.z));
        float t=uTime*sp;
        vec3 w;
        w.x=uCam.x+(fract(aSeed.x-(uCam.x-uWind.x*uTime)/uBox)-0.5)*uBox;
        w.z=uCam.z+(fract(aSeed.z-(uCam.z-uWind.z*uTime)/uBox)-0.5)*uBox;
        w.y=uCam.y-8.0+fract(aSeed.y-(t+uCam.y)/uHeight)*uHeight;
        vec3 toCam=normalize(uCam-w);
        vec3 side=normalize(cross(fall,toCam));
        float len=0.55+aSeed.w*0.55;
        w+=side*position.x*(0.0035+0.00055*distance(w,uCam)) - fall*position.y*len;
        vV=position.y;
        float dist=distance(w,uCam);
        vA=(1.0-smoothstep(uBox*0.3,uBox*0.5,dist))*smoothstep(1.5,6.0,dist);
        gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0);
      }`,
    fragmentShader: 'uniform vec3 uColor,uStrobe; varying float vA; varying float vV; void main(){ float a=vA*sin(vV*3.14159)*0.5; gl_FragColor=vec4((uColor+uStrobe*0.5)*a,a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 900; mesh.userData.max = maxCount;
  return mesh;
}

// ---------------------------------------------------------------- environment presets

const c3 = (r, g, b) => new THREE.Color(r, g, b);
// sunEl/sunAz in degrees (az 0 = +Z, 90 = +X). At night "sun" is the moon.
export const ENV = {
  morning: { sunEl: 24, sunAz: 115, sunCol: c3(1.0, 0.86, 0.70), sunInt: 3.6, hemiSky: c3(0.55, 0.68, 0.95), hemiGnd: c3(0.30, 0.27, 0.22), hemiInt: 0.75, fog: c3(0.66, 0.74, 0.86), fogD: 0.00085, zen: c3(0.13, 0.30, 0.68), hor: c3(0.62, 0.74, 0.90), glow: c3(1.0, 0.8, 0.55), cover: 0.46, cLit: c3(1.0, 0.97, 0.92), cDark: c3(0.55, 0.60, 0.70), haze: 16, exposure: 0.92, envInt: 0.85, bloom: 0.14 },
  noon: { sunEl: 56, sunAz: 160, sunCol: c3(1.0, 0.96, 0.9), sunInt: 4.2, hemiSky: c3(0.50, 0.66, 1.0), hemiGnd: c3(0.33, 0.30, 0.25), hemiInt: 0.8, fog: c3(0.62, 0.74, 0.92), fogD: 0.0006, zen: c3(0.09, 0.25, 0.66), hor: c3(0.55, 0.72, 0.95), glow: c3(1.0, 0.92, 0.75), cover: 0.42, cLit: c3(1, 1, 1), cDark: c3(0.6, 0.65, 0.75), haze: 20, exposure: 0.85, envInt: 0.9, bloom: 0.12 },
  overcast: { sunEl: 48, sunAz: 140, sunCol: c3(0.9, 0.92, 1.0), sunInt: 0.9, hemiSky: c3(0.72, 0.76, 0.82), hemiGnd: c3(0.28, 0.27, 0.26), hemiInt: 1.25, fog: c3(0.60, 0.63, 0.67), fogD: 0.0016, zen: c3(0.42, 0.45, 0.50), hor: c3(0.62, 0.65, 0.69), glow: c3(0.25, 0.25, 0.25), cover: 1.0, cLit: c3(0.70, 0.72, 0.76), cDark: c3(0.36, 0.38, 0.43), haze: 7, exposure: 0.95, envInt: 1.0, bloom: 0.12, wet: 0.25 },
  rainDay: { sunEl: 40, sunAz: 150, sunCol: c3(0.85, 0.9, 1.0), sunInt: 0.5, hemiSky: c3(0.60, 0.65, 0.72), hemiGnd: c3(0.22, 0.22, 0.23), hemiInt: 1.1, fog: c3(0.47, 0.51, 0.56), fogD: 0.0034, zen: c3(0.30, 0.33, 0.38), hor: c3(0.48, 0.52, 0.57), glow: c3(0.12, 0.12, 0.12), cover: 1.0, cLit: c3(0.52, 0.55, 0.60), cDark: c3(0.24, 0.26, 0.31), haze: 5, exposure: 1.0, envInt: 1.0, bloom: 0.16, wet: 1, rain: 0.85, night: 0.25, rainCol: c3(0.30, 0.32, 0.35) },
  dusk: { sunEl: 3.5, sunAz: 262, sunCol: c3(1.0, 0.48, 0.20), sunInt: 2.3, hemiSky: c3(0.36, 0.38, 0.62), hemiGnd: c3(0.22, 0.16, 0.14), hemiInt: 0.6, fog: c3(0.50, 0.38, 0.40), fogD: 0.0012, zen: c3(0.07, 0.10, 0.28), hor: c3(0.95, 0.46, 0.22), glow: c3(1.3, 0.55, 0.2), cover: 0.45, cLit: c3(1.0, 0.55, 0.35), cDark: c3(0.22, 0.18, 0.30), haze: 9, exposure: 1.05, envInt: 0.9, bloom: 0.17, night: 0.7 },
  fogDawn: { sunEl: 7, sunAz: 95, sunCol: c3(1.0, 0.78, 0.6), sunInt: 1.1, hemiSky: c3(0.70, 0.72, 0.76), hemiGnd: c3(0.30, 0.29, 0.28), hemiInt: 0.95, fog: c3(0.60, 0.61, 0.63), fogD: 0.0105, zen: c3(0.42, 0.46, 0.54), hor: c3(0.66, 0.64, 0.62), glow: c3(0.6, 0.45, 0.3), cover: 0.7, cLit: c3(0.75, 0.72, 0.7), cDark: c3(0.42, 0.43, 0.47), haze: 3, exposure: 0.95, envInt: 0.9, bloom: 0.24, night: 0.45, wet: 0.35 },
  night: { sunEl: 38, sunAz: 210, sunCol: c3(0.55, 0.68, 1.0), sunInt: 0.22, hemiSky: c3(0.20, 0.26, 0.45), hemiGnd: c3(0.10, 0.08, 0.07), hemiInt: 0.22, fog: c3(0.020, 0.026, 0.045), fogD: 0.0016, zen: c3(0.004, 0.007, 0.020), hor: c3(0.020, 0.026, 0.045), glow: c3(0, 0, 0), cover: 0.25, cLit: c3(0.06, 0.07, 0.11), cDark: c3(0.012, 0.014, 0.024), haze: 9, exposure: 1.25, envInt: 0.55, bloom: 0.20, night: 1, stars: 1, moon: 1, cityGlow: 0.035 },
  rainNight: { sunEl: 50, sunAz: 210, sunCol: c3(0.5, 0.6, 0.9), sunInt: 0.10, hemiSky: c3(0.22, 0.25, 0.36), hemiGnd: c3(0.10, 0.09, 0.08), hemiInt: 0.20, fog: c3(0.030, 0.034, 0.046), fogD: 0.0042, zen: c3(0.012, 0.014, 0.022), hor: c3(0.034, 0.036, 0.046), glow: c3(0, 0, 0), cover: 1.0, cLit: c3(0.055, 0.050, 0.050), cDark: c3(0.016, 0.017, 0.022), haze: 5, exposure: 1.3, envInt: 0.6, bloom: 0.22, night: 1, wet: 1, rain: 1, cityGlow: 0.07, rainCol: c3(0.20, 0.22, 0.27) },
  storm: { sunEl: 50, sunAz: 210, sunCol: c3(0.5, 0.6, 0.9), sunInt: 0.08, hemiSky: c3(0.20, 0.23, 0.34), hemiGnd: c3(0.09, 0.08, 0.08), hemiInt: 0.18, fog: c3(0.028, 0.032, 0.044), fogD: 0.0058, zen: c3(0.010, 0.012, 0.020), hor: c3(0.030, 0.032, 0.042), glow: c3(0, 0, 0), cover: 1.0, cLit: c3(0.05, 0.05, 0.055), cDark: c3(0.014, 0.015, 0.020), haze: 4, exposure: 1.3, envInt: 0.6, bloom: 0.24, night: 1, wet: 1, rain: 1.5, cityGlow: 0.06, lightning: true, wind: 2.4, rainCol: c3(0.22, 0.24, 0.29) },
};

// Lights + sky + rain for an outdoor scene. applyEnv(rig, 'rainNight') sets everything, including the scene's fog and IBL.
export function createOutdoorRig(scene) {
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), makeSkyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -1000; sky.scale.setScalar(20000); scene.add(sky); G.noAO.add(sky);
  const rain = makeRain(QUALITY.ultra.rain); scene.add(rain); G.noAO.add(rain);
  scene.fog = new THREE.FogExp2(0x888888, 0.001);
  const rig = { scene, sun, hemi, sky, rain, preset: null, name: '', sunDir: new THREE.Vector3(0, 1, 0), envRT: null, flash: 0, nextBolt: 6, onThunder: null, focus: new THREE.Vector3() };
  configureShadow(rig);
  onQuality(() => configureShadow(rig));
  return rig;
}

function configureShadow(rig) {
  const s = rig.sun.shadow, q = G.q, R = q.shadowRange;
  s.mapSize.set(q.shadow, q.shadow);
  if (s.map) { s.map.dispose(); s.map = null; }
  const c = s.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 10; c.far = 700; c.updateProjectionMatrix();
}

export function applyEnv(rig, name) {
  const p = ENV[name] || ENV.noon; rig.preset = p; rig.name = name;
  const el = THREE.MathUtils.degToRad(p.sunEl), az = THREE.MathUtils.degToRad(p.sunAz);
  rig.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  rig.sun.color.copy(p.sunCol); rig.sun.intensity = p.sunInt;
  rig.hemi.color.copy(p.hemiSky); rig.hemi.groundColor.copy(p.hemiGnd); rig.hemi.intensity = p.hemiInt;
  rig.scene.fog.color.copy(p.fog); rig.scene.fog.density = p.fogD;
  const u = rig.sky.material.uniforms; const isNight = (p.moon || 0) > 0;
  u.uSunDir.value.copy(isNight ? new THREE.Vector3(0, -1, 0) : rig.sunDir); u.uMoonDir.value.copy(rig.sunDir);
  u.uZenith.value.copy(p.zen); u.uHorizon.value.copy(p.hor); u.uGlow.value.copy(p.glow); u.uCloudLit.value.copy(p.cLit); u.uCloudDark.value.copy(p.cDark);
  u.uFogCol.value.copy(p.fog); u.uCover.value = p.cover; u.uStars.value = p.stars || 0; u.uHaze.value = p.haze; u.uMoon.value = p.moon || 0; u.uCityGlow.value = p.cityGlow || 0;
  U.uWet.value = p.wet || 0; U.uRain.value = Math.min(1, p.rain || 0); U.uNight.value = p.night || 0;
  G.renderer.toneMappingExposure = p.exposure;
  if (G.passes.bloom) { G.passes.bloom.strength = p.bloom; G.passes.bloom.radius = 0.62; G.passes.bloom.threshold = 1.0; }
  const rm = rig.rain.material.uniforms;
  rm.uColor.value.copy(p.rainCol || c3(0.3, 0.33, 0.36)); rm.uWind.value.set(1.6 * (p.wind || 1), 0, 0.7 * (p.wind || 1));
  rig.rainLevel = p.rain || 0;
  // image-based light from the sky itself (sun disc left out: the directional light already supplies it)
  const tmp = new THREE.Scene(); const dome = new THREE.Mesh(rig.sky.geometry, rig.sky.material); dome.scale.setScalar(100); dome.frustumCulled = false; tmp.add(dome);
  u.uSunDisc.value = 0;
  if (rig.envRT) rig.envRT.dispose();
  rig.envRT = G.pmrem.fromScene(tmp, 0, 0.1, 1000);
  u.uSunDisc.value = 1;
  rig.scene.environment = rig.envRT.texture; rig.scene.environmentIntensity = p.envInt;
  rig.flash = 0; rig.nextBolt = 4 + Math.random() * 8;
  return p;
}

// Call every frame with the point the camera is looking after (shadow box follows it) and the camera.
export function updateRig(rig, dt, focus, camera) {
  const p = rig.preset; if (!p) return;
  const R = G.q.shadowRange, texel = (R * 2) / G.q.shadow;
  // snap the shadow box to texels in light space so shadows do not shimmer as the camera moves
  const d = rig.sunDir, right = _v1.set(d.z, 0, -d.x).normalize(), up = _v2.crossVectors(d, right).normalize();
  const fx = Math.round(focus.dot(right) / texel) * texel, fy = Math.round(focus.dot(up) / texel) * texel, fz = focus.dot(d);
  _v3.set(0, 0, 0).addScaledVector(right, fx).addScaledVector(up, fy).addScaledVector(d, fz);
  rig.sun.target.position.copy(_v3); rig.sun.position.copy(_v3).addScaledVector(d, 300);
  rig.sun.target.updateMatrixWorld();
  rig.focus.copy(focus);
  const rm = rig.rain.material.uniforms; rm.uCam.value.copy(camera.position);
  rig.rain.geometry.instanceCount = Math.floor(Math.min(rig.rain.userData.max, G.q.rain * Math.min(1.6, rig.rainLevel || 0)));
  rig.rain.visible = rig.rain.geometry.instanceCount > 0;
  // lightning
  const u = rig.sky.material.uniforms;
  if (p.lightning) {
    rig.nextBolt -= dt;
    if (rig.nextBolt <= 0) { rig.nextBolt = 7 + Math.random() * 16; rig.flash = 1; rig.boltSeq = [0.0, 0.07, 0.16, 0.2 + Math.random() * 0.2]; rig.boltT = 0; rig.onThunder?.(0.4 + Math.random() * 2.5); }
    if (rig.boltSeq) {
      rig.boltT += dt; const t = rig.boltT;
      let f = 0; for (const s of rig.boltSeq) f = Math.max(f, Math.exp(-Math.max(0, t - s) * 16) * (t >= s ? 1 : 0));
      rig.flash = f; if (t > 1.2) rig.boltSeq = null;
    }
  } else rig.flash = 0;
  u.uFlash.value = rig.flash;
  rig.hemi.intensity = p.hemiInt + rig.flash * 2.2;
  rig.sun.intensity = p.sunInt + rig.flash * 1.5;
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ---------------------------------------------------------------- wet surfaces

// Patch a MeshStandardMaterial so it responds to U.uWet / U.uRain: darker and glossier when wet, standing puddles with
// rain rings on upward faces. opts.puddles (0..1) scales how much standing water this surface collects.
export function patchWet(mat, { puddles = 1, scale = 0.09 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uWet = U.uWet; sh.uniforms.uRain = U.uRain; sh.uniforms.uTime = U.uTime;
    sh.uniforms.uPud = { value: puddles }; sh.uniforms.uPudScale = { value: scale };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n vWetPos=(modelMatrix*wp).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWetPos; uniform float uWet,uRain,uTime,uPud,uPudScale;
      float wH(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float wN(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(wH(i),wH(i+vec2(1,0)),f.x),mix(wH(i+vec2(0,1)),wH(i+vec2(1,1)),f.x),f.y); }
      float wPuddle(vec2 p){ float n=wN(p*uPudScale)*0.6+wN(p*uPudScale*2.7+7.3)*0.3+wN(p*uPudScale*7.1)*0.1; return smoothstep(0.62-0.3*uWet*uPud,0.70-0.3*uWet*uPud,n)*step(0.02,uWet*uPud); }
      vec2 wRing(vec2 p,float t){ vec2 g=floor(p),f=fract(p)-0.5; float r=wH(g); float ph=fract(t*0.9+r*7.0); vec2 o=(vec2(wH(g+3.1),wH(g+9.7))-0.5)*0.5; vec2 dv=f-o; float d=length(dv); float w=sin((d-ph*0.5)*46.0)*(1.0-smoothstep(0.0,0.06,abs(d-ph*0.5)))*(1.0-ph); return dv/max(d,1e-4)*w; }
      float gWetPud=0.0;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { vec3 wnG=inverseTransformDirection(normalize(vNormal),viewMatrix);
        float upF=smoothstep(0.75,0.97,wnG.y);
        gWetPud=wPuddle(vWetPos.xz)*upF;
        float w=clamp(uWet,0.0,1.0);
        diffuseColor.rgb*=mix(1.0,0.52,w*0.85);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.6,gWetPud);
        roughnessFactor=mix(roughnessFactor,min(roughnessFactor,0.34),w*0.85);
        roughnessFactor=mix(roughnessFactor,0.035,gWetPud); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if(gWetPud>0.001){ vec2 rp=vec2(0.0);
        if(uRain>0.01){ rp=wRing(vWetPos.xz*5.3,uTime)+wRing(vWetPos.xz*8.1+4.1,uTime*1.13+0.4)+wRing(vWetPos.xz*12.7+1.7,uTime*0.91+0.7)*0.6; rp*=uRain*0.3; }
        vec3 fl=normalize((viewMatrix*vec4(normalize(vec3(rp.x,1.0,rp.y)),0.0)).xyz);
        normal=normalize(mix(normal,fl,gWetPud)); }`);
  };
  mat.customProgramCacheKey = () => 'wet' + puddles.toFixed(2) + scale.toFixed(3) + (prev ? prev.toString().length : 0);
  return mat;
}

// ---------------------------------------------------------------- small shared builders

// Soft additive glow sprite texture (for lamp halos, light pools, beacon flares).
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.55)'); g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace; _glowTex.userData.shared = true; return _glowTex;
}

// Fade helpers for the grade pass.
export function setFade(v) { if (G.grade) G.grade.uFade.value = clamp(v); }
export function setStress(v) { if (G.grade) G.grade.uStress.value = clamp(v); }
