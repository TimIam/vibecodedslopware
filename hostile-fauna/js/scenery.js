// The parts of the Garden that are shaders rather than shapes: the veined ground, the grass that leans away
// from you, pools of coloured light, low mist, light shafts, and the painted panels on the humans' buildings.

import * as THREE from 'three';
import { TAU } from './state.js';

export const sceneT = { value: 0 };          // one clock for every shader here
export const dim = { value: 1 };             // 1 = your air, 0 = theirs (mission four)
export const playerPos = { value: new THREE.Vector3() };

const FOG_FADE = 'float ff=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// ------------------------------------------------------------------ painted surfaces
// Prefab hull: seams, rivets, a hazard band, a stencilled number and a week of alien weather.
export function panelTex(base = '#d9d6cc', seam = '#8f8c82', seed = 1) {
  return canvasTex(512, 256, (g, w, h) => {
    let s = seed * 9301; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.05})`; g.fillRect(i * 128, j * 128, 128, 128); }
    g.strokeStyle = seam; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, 128); g.lineTo(w, 128); g.stroke();
    g.fillStyle = seam;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (const [dx, dy] of [[10, 10], [118, 10], [10, 118], [118, 118]]) { g.beginPath(); g.arc(i * 128 + dx, j * 128 + dy, 2.5, 0, TAU); g.fill(); }
    // hazard band along the foot
    for (let x = -20; x < w; x += 28) { g.fillStyle = '#e8a01c'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 28, h - 16); g.lineTo(x + 14, h - 16); g.fill(); }
    g.fillStyle = 'rgba(20,24,36,.85)'; g.fillRect(0, h - 18, w, 2);
    g.fillStyle = 'rgba(22,35,63,.8)'; g.font = '900 34px Impact, Arial'; g.fillText('UES-' + (10 + Math.floor(rnd() * 89)), 140, 60);
    g.font = '700 11px Arial'; g.fillText('PROPERTY OF HUMANITY · DO NOT REMOVE', 268, 150);
    // grime running down from the seams
    for (let i = 0; i < 60; i++) { const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 70; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(40,36,30,.16)'); gr.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + rnd() * 5, l); }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
export function crateTex(base = '#6f7a52') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.lineWidth = 8; g.beginPath(); g.moveTo(20, 20); g.lineTo(w - 20, h - 20); g.moveTo(w - 20, 20); g.lineTo(20, h - 20); g.stroke();
    g.fillStyle = 'rgba(243,236,216,.85)'; g.font = '900 54px Impact, Arial'; g.textAlign = 'center'; g.fillText('UES', w / 2, h / 2 + 18);
    g.font = '700 15px Arial'; g.fillText('FREEDOM · THIS SIDE UP', w / 2, h - 34);
  });
}
export function concreteTex() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#8d8f8c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},.04)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    for (let x = -20; x < w; x += 32) { g.fillStyle = '#e8641c'; g.beginPath(); g.moveTo(x, 26); g.lineTo(x + 16, 26); g.lineTo(x + 32, 6); g.lineTo(x + 16, 6); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 22, w, 22);
  });
}
// The underside of a cap: gills radiating from the stem.
export function gillTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(128, 128, 6, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#bbb'); gr.addColorStop(1, '#333');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; g.beginPath(); g.moveTo(128 + Math.cos(a) * 14, 128 + Math.sin(a) * 14); g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); g.stroke(); }
  });
}

// ------------------------------------------------------------------ ground
// Moss with veins of light running through it. aPad (per vertex) switches the veins off wherever the humans paved.
export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = sceneT; sh.uniforms.uDim = dim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPad; varying float vPad; varying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad=aPad; vWp=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vPad; varying vec3 vWp; uniform float uT,uDim;
      vec2 h2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); float a=h2(i).x,b=h2(i+vec2(1,0)).x,c=h2(i+vec2(0,1)).x,d=h2(i+vec2(1,1)).x; return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      float vedge(vec2 x){ vec2 n=floor(x),f=fract(x),mg,mr; float md=8.0;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 g=vec2(float(i),float(j)); vec2 r=g+h2(n+g)-f; float d=dot(r,r); if(d<md){md=d;mr=r;mg=g;} }
        md=8.0;
        for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){ vec2 g=mg+vec2(float(i),float(j)); vec2 r=g+h2(n+g)-f; if(dot(mr-r,mr-r)>0.00001) md=min(md,dot(0.5*(mr+r),normalize(r-mr))); }
        return md; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gN1=vn(vWp.xz*1.3), gN2=vn(vWp.xz*0.11+7.0);
        diffuseColor.rgb*=0.72+0.56*gN1;
        diffuseColor.rgb*=1.0-0.13*vPad*smoothstep(0.8,1.0,abs(sin(vWp.x*1.3+gN2*9.0+gN1)));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float gE=vedge(vWp.xz*0.1+vec2(vn(vWp.xz*0.05)*1.8));
        float gLine=(1.0-smoothstep(0.004,0.022,gE))+0.07*(1.0-smoothstep(0.0,0.16,gE));
        float gPulse=0.5+0.5*sin(uT*0.9-length(vWp.xz)*0.14+gN2*7.0);
        vec3 gCol=mix(vec3(0.08,0.9,0.75),vec3(0.6,0.28,1.0),smoothstep(0.38,0.66,gN2));
        totalEmissiveRadiance+=gCol*gLine*(0.25+0.75*gPulse)*(1.0-vPad)*uDim*0.55;`);
  };
  return m;
}

// ------------------------------------------------------------------ grass
// place(i) returns {x,y,z} for blade i or null to skip; hue(x,z) picks a colour for the spot.
export function makeGrass(count, r, place, hue) {
  const geo = new THREE.PlaneGeometry(0.07, 1, 1, 4).translate(0, 0.5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.9)); p.setZ(i, y * y * 0.22); }
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uT: sceneT, uP: playerPos, uDim: dim },
    vertexShader: `uniform float uT; uniform vec3 uP; varying float vH; varying vec3 vC;
      #include <fog_pars_vertex>
      void main(){ vH=uv.y; vC=instanceColor;
        vec4 wp=instanceMatrix*vec4(position,1.0); vec3 root=instanceMatrix[3].xyz;
        float ph=root.x*0.35+root.z*0.27, k=vH*vH;
        wp.x+=(sin(uT*1.3+ph)*0.09+sin(uT*2.9+ph*2.1)*0.03)*k; wp.z+=cos(uT*1.1+ph*1.3)*0.07*k;
        vec2 away=root.xz-uP.xz; float d=length(away), push=(1.0-smoothstep(0.5,2.4,d))*k*step(abs(root.y-uP.y),2.5);
        wp.xz+=normalize(away+1e-4)*push*0.4; wp.y-=push*0.25;
        vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uDim; varying float vH; varying vec3 vC;
      #include <fog_pars_fragment>
      void main(){ vec3 c=vC*mix(0.1,0.6,vH*vH)+vC*pow(clamp(vH,0.0,1.0),7.0)*1.0*uDim; c=mix(vec3(dot(c,vec3(0.33))),c,0.35+0.65*uDim);
        gl_FragColor=vec4(c,1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count), d = new THREE.Object3D(), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 2 && n < count; i++) {
    const at = place(i); if (!at) continue;
    d.position.set(at.x, at.y - 0.04, at.z); d.rotation.set((r() - 0.5) * 0.5, r() * TAU, (r() - 0.5) * 0.5);
    const s = 0.22 + r() * r() * 0.6; d.scale.set(0.7 + r() * 0.7, s, s); d.updateMatrix();
    mesh.setMatrixAt(n, d.matrix); mesh.setColorAt(n, c.setHSL(hue(at.x, at.z) + (r() - 0.5) * 0.06, 0.75, 0.3 + r() * 0.16)); n++;
  }
  mesh.count = n; mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ light on the ground
// Flat additive discs: what a glowing cap or a floodlight does to the ground beneath it, without a real light.
export function makePools(max) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uT: sceneT, uDim: dim },
    vertexShader: `varying vec2 vUv; varying vec4 vC; attribute float aKind;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vC=vec4(instanceColor,aKind); vec4 mvPosition=viewMatrix*instanceMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uDim,uT; varying vec2 vUv; varying vec4 vC;
      #include <fog_pars_fragment>
      void main(){ float d=clamp(length(vUv-0.5)*2.0,0.0,1.0); float a=pow(1.0-d,2.2);
        ${FOG_FADE} float k=mix(uDim,1.0,vC.a);   // kind 1 = human light, which their air doesn't dim
        gl_FragColor=vec4(vC.rgb*a*k*(1.0-ff),1.0); }`,
  });
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), kind = new Float32Array(max);
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  const mesh = new THREE.InstancedMesh(geo, mat, max), d = new THREE.Object3D(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3();
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2;
  mesh.add_ = (x, y, z, rad, color, k = 1, human = 0, nx = 0, nz = 0) => {
    if (mesh.count >= max) return;
    nv.set(nx, 1, nz).normalize(); d.quaternion.setFromUnitVectors(up, nv);
    d.position.set(x, y + 0.06, z); d.scale.set(rad, 1, rad); d.updateMatrix();
    mesh.setMatrixAt(mesh.count, d.matrix); mesh.setColorAt(mesh.count, c.set(color).multiplyScalar(k)); kind[mesh.count] = human; mesh.count++;
  };
  return mesh;
}

// Low banks of mist that drift. Billboards, so they cost almost nothing.
export function makeMist(count, r, R, height, color) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uT: sceneT, uCol: { value: new THREE.Color(color) } },
    vertexShader: `uniform float uT; varying vec2 vUv; varying float vS;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vec3 c=instanceMatrix[3].xyz; float s=instanceMatrix[0].x; vS=fract(c.x*0.37+c.z*0.11);
        c.x+=sin(uT*0.05+vS*40.0)*9.0; c.z+=cos(uT*0.04+vS*31.0)*9.0;
        vec4 mvPosition=viewMatrix*vec4(c,1.0); mvPosition.xy+=position.xy*vec2(s,s*0.3);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uT; varying vec2 vUv; varying float vS;
      #include <fog_pars_fragment>
      void main(){ float d=clamp(length(vUv-0.5)*2.0,0.0,1.0); float a=pow(1.0-d,1.6)*(0.09+0.04*sin(uT*0.3+vS*20.0));
        ${FOG_FADE} float near=smoothstep(2.0,14.0,vFogDepth);
        gl_FragColor=vec4(uCol,a*(1.0-ff*0.7)*near); }`,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count), d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = r() * TAU, rr = Math.sqrt(r()) * R, x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = 22 + r() * 30;
    d.position.set(x, height(x, z) + s * 0.08 + r() * 1.5, z); d.scale.setScalar(s); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
  }
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  return mesh;
}

// A shaft of light: under a floodlight (pointing down) or out of a spire (pointing up).
const shaftMat = (color, strength) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uCol: { value: new THREE.Color(color) }, uK: { value: strength }, uT: sceneT },
  vertexShader: `varying float vY; varying vec3 vN, vV;
    #include <fog_pars_vertex>
    void main(){ vY=uv.y; vec4 mvPosition=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mvPosition.xyz); gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
  fragmentShader: `uniform vec3 uCol; uniform float uK,uT; varying float vY; varying vec3 vN, vV;
    #include <fog_pars_fragment>
    void main(){ float rim=pow(clamp(abs(dot(normalize(vN+1e-5),normalize(vV))),0.0,1.0),1.6); ${FOG_FADE}
      gl_FragColor=vec4(uCol*uK*rim*pow(clamp(vY,0.0,1.0),1.4)*(1.0-ff*0.6),1.0); }`,
});
export function lightCone(h, rad, color = 0xffe9c8, strength = 0.16) {
  const g = new THREE.ConeGeometry(rad, h, 28, 1, true).translate(0, -h / 2, 0);   // apex at the origin, opening downward; uv.y is 1 at the apex
  const m = new THREE.Mesh(g, shaftMat(color, strength)); m.renderOrder = 3; return m;
}
export function skyBeam(h, rad, color = 0x7ff0e0, strength = 0.22) {
  const g = new THREE.CylinderGeometry(rad * 0.25, rad, h, 16, 1, true).translate(0, h / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));   // bright at the foot, gone at the top
  const m = new THREE.Mesh(g, shaftMat(color, strength)); m.renderOrder = 3; return m;
}

// A soft round glow that always faces you: lamp heads, moons, engine flares.
let flareTex = null;
export function flare(color, size, opacity = 1) {
  flareTex ||= canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}
