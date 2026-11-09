// Pooled effects: glow particles, ground rings, the return bubble, beams, light flashes and damage numbers.

import * as THREE from 'three';
import { S, clamp, rand } from './state.js';

const MAXP = 2600;
let scene, points, pPos, pCol, pSize, pAlpha, head = 0;
const part = [];             // {life, max, vx, vy, vz, g, drag, size, a}
const rings = [], bubbles = [], beams = [], lights = [], nums = [];
let numLayer = null;
const V = new THREE.Vector3(), C = new THREE.Color();
export let shakeAmt = 0;
export const shake = a => { shakeAmt = Math.min(1.4, shakeAmt + a); };

export function initFx(sc) {
  scene = sc;
  const g = new THREE.BufferGeometry();
  pPos = new Float32Array(MAXP * 3); pCol = new Float32Array(MAXP * 3); pSize = new Float32Array(MAXP); pAlpha = new Float32Array(MAXP);
  g.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  for (let i = 0; i < MAXP; i++) part.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 1 });
  points = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=(1.0-smoothstep(0.0,0.5,d)); gl_FragColor=vec4(vC*a*vA, a*vA); }`,
  }));
  points.frustumCulled = false; points.renderOrder = 5;
  scene.add(points);

  const ringGeo = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.add(d); m.visible = false; m.renderOrder = 4; scene.add(m);
    rings.push({ m, d, t: 0, dur: 0 });
  }
  const sph = new THREE.SphereGeometry(1, 20, 14);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(sph, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 1 }, uT: { value: 0 } },
      vertexShader: 'varying vec3 vN, vV; varying vec3 vP; void main(){ vP=position; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform float uA,uT; varying vec3 vN, vV; varying vec3 vP; void main(){ float f=pow(clamp(1.0-abs(dot(normalize(vN),normalize(vV))),0.0,1.0),2.2); float band=0.5+0.5*sin(vP.y*14.0-uT*9.0+sin(atan(vP.z,vP.x)*3.0)*1.5); vec3 c=mix(vec3(0.25,1.0,0.9),vec3(0.75,0.5,1.0),band); gl_FragColor=vec4(c*(f*1.6+band*0.12+0.05)*uA,1.0); }' }));
    m.visible = false; scene.add(m); bubbles.push({ m, t: 0, on: false });
  }
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); beams.push({ m, t: 0, dur: 0, w: 1 });
  }
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); scene.add(l); lights.push({ l, t: 0, dur: 0, i0: 0 }); }

  numLayer = document.getElementById('nums');
  for (let i = 0; i < 28; i++) { const el = document.createElement('i'); numLayer.appendChild(el); nums.push({ el, t: 0, x: 0, y: 0, z: 0 }); }
}

export function setParticleScale(h) { if (points) points.material.uniforms.uScale.value = h * 0.9; }

// burst(x,y,z, {n, color, speed, up, size, life, g, drag, spread})
export function burst(x, y, z, o = {}) {
  const n = o.n ?? 10, sp = o.speed ?? 4, life = o.life ?? 0.6;
  C.set(o.color ?? 0x7ffff0);
  for (let k = 0; k < n; k++) {
    const i = head; head = (head + 1) % MAXP;
    const p = part[i];
    const th = Math.random() * 6.283, ph = Math.acos(rand(-1, 1)), s = sp * rand(0.3, 1);
    p.vx = Math.sin(ph) * Math.cos(th) * s + (o.vx ?? 0); p.vy = Math.cos(ph) * s + (o.up ?? 0); p.vz = Math.sin(ph) * Math.sin(th) * s + (o.vz ?? 0);
    p.life = p.max = life * rand(0.6, 1.2); p.g = o.g ?? 0; p.drag = o.drag ?? 1.5; p.size = (o.size ?? 0.35) * rand(0.6, 1.3);
    const sr = o.spread ?? 0;
    pPos[i * 3] = x + rand(-sr, sr); pPos[i * 3 + 1] = y + rand(-sr, sr); pPos[i * 3 + 2] = z + rand(-sr, sr);
    const v = rand(0.7, 1.15); pCol[i * 3] = C.r * v; pCol[i * 3 + 1] = C.g * v; pCol[i * 3 + 2] = C.b * v;
  }
}

export function ring(x, y, z, r0, r1, color, dur, fill = 0) {
  const r = rings.find(q => !q.m.visible) || rings[0];
  r.m.visible = true; r.m.position.set(x, y + 0.08, z); r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.fill = fill;
  r.m.material.color.set(color); r.d.material.color.set(color);
  return r;
}

// The Returner's bubble: closes round a visitor, then leaves for orbit. h is how tall the visitor is.
export function returnFx(x, y, z, h = 1.8) {
  const b = bubbles.find(q => !q.on) || bubbles[0];
  b.on = true; b.t = 0; b.x = x; b.y = y + h * 0.5; b.z = z; b.h = h; b.m.visible = true; b.lift = false;
  ring(x, y, z, h * 0.2, h * 1.1, 0x7ffff0, 0.5);
  burst(x, b.y, z, { n: 14, color: 0x7ffff0, speed: 3, size: 0.3, life: 0.5 });
}

export function beam(ax, ay, az, bx, by, bz, color, width, dur) {
  const b = beams.find(q => !q.m.visible) || beams[0];
  b.m.visible = true; b.t = 0; b.dur = dur; b.w = width;
  b.m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  b.m.lookAt(bx, by, bz);
  b.len = Math.hypot(bx - ax, by - ay, bz - az);
  b.m.scale.set(width, width, b.len);
  b.m.material.color.set(color); b.m.material.opacity = 1;
  return b;
}

export function flash(x, y, z, color, intensity = 40, dur = 0.25) {
  const l = lights.find(q => q.t >= q.dur) || lights[0];
  l.l.position.set(x, y, z); l.l.color.set(color); l.i0 = intensity; l.t = 0; l.dur = dur;
}

export function num(x, y, z, text, cls = '') {
  const n = nums.find(q => q.t <= 0) || nums[0];
  n.t = 0.8; n.x = x + rand(-0.3, 0.3); n.y = y; n.z = z + rand(-0.3, 0.3);
  n.el.textContent = text; n.el.className = cls;
}

export function clearFx() {
  for (const p of part) p.life = 0;
  pAlpha.fill(0);
  for (const r of rings) r.m.visible = false;
  for (const b of bubbles) { b.on = false; b.m.visible = false; }
  for (const b of beams) b.m.visible = false;
  for (const l of lights) { l.t = l.dur = 0; l.l.intensity = 0; }
  for (const n of nums) { n.t = 0; n.el.style.opacity = 0; }
  shakeAmt = 0;
}

export function updateFx(dt, camera, vw, vh) {
  shakeAmt = Math.max(0, shakeAmt - dt * 2.6);
  for (let i = 0; i < MAXP; i++) {
    const p = part[i];
    if (p.life <= 0) { if (pAlpha[i] !== 0) pAlpha[i] = 0; continue; }
    p.life -= dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt;
    pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += p.vz * dt;
    const k = clamp(p.life / p.max, 0, 1);
    pAlpha[i] = k; pSize[i] = p.size * (0.4 + 0.6 * k);
  }
  const g = points.geometry;
  g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;

  for (const r of rings) {
    if (!r.m.visible) continue;
    r.t += dt; const k = r.t / r.dur;
    if (k >= 1) { r.m.visible = false; continue; }
    const s = r.r0 + (r.r1 - r.r0) * (r.fill ? 1 : (1 - (1 - k) * (1 - k)));
    r.m.scale.setScalar(s);
    r.m.material.opacity = r.fill ? 0.9 : (1 - k);
    r.d.material.opacity = r.fill ? r.fill * (0.25 + 0.75 * k) : 0.12 * (1 - k);
    r.d.scale.setScalar(r.fill ? k : 1);
  }
  for (const b of bubbles) {
    if (!b.on) continue;
    b.t += dt;
    const grow = clamp(b.t / 0.28, 0, 1), rise = Math.max(0, b.t - 0.34);
    const r = b.h * 0.62 * (1 - (1 - grow) * (1 - grow));
    const y = b.y + rise * rise * 160;
    b.m.position.set(b.x, y, b.z);
    b.m.scale.set(r * (1 - Math.min(0.6, rise * 1.4)), r * (1 + rise * 14), r * (1 - Math.min(0.6, rise * 1.4)));
    b.m.material.uniforms.uA.value = 1 - clamp((rise - 0.5) / 0.4, 0, 1); b.m.material.uniforms.uT.value = b.t;
    if (rise > 0 && !b.lift) { b.lift = true; beam(b.x, b.y, b.z, b.x, b.y + 140, b.z, 0x7ffff0, 0.22 + b.h * 0.06, 0.55); burst(b.x, b.y - b.h * 0.4, b.z, { n: 16, color: 0xc8fff6, speed: 4, up: 1, size: 0.3, life: 0.6, g: 4 }); }
    if (rise > 0 && rise < 0.5) burst(b.x, y - r, b.z, { n: 2, color: 0x7ffff0, speed: 0.6, size: 0.3, life: 0.5, drag: 0.5 });
    if (rise > 0.9) { b.on = false; b.m.visible = false; }
  }
  for (const b of beams) {
    if (!b.m.visible) continue;
    b.t += dt; const k = b.t / b.dur;
    if (k >= 1) { b.m.visible = false; continue; }
    const w = b.w * (1 - k); b.m.scale.set(w, w, b.len); b.m.material.opacity = 1 - k;
  }
  for (const l of lights) {
    if (l.t >= l.dur) { l.l.intensity = 0; continue; }
    l.t += dt; l.l.intensity = l.i0 * Math.max(0, 1 - l.t / l.dur);
  }
  for (const n of nums) {
    if (n.t <= 0) continue;
    n.t -= dt; n.y += dt * 1.4;
    V.set(n.x, n.y, n.z).project(camera);
    if (n.t <= 0 || V.z > 1) { n.el.style.opacity = 0; n.t = Math.min(n.t, 0); continue; }
    n.el.style.opacity = clamp(n.t * 3, 0, 1);
    n.el.style.transform = `translate(${((V.x + 1) / 2 * vw).toFixed(0)}px,${((1 - V.y) / 2 * vh).toFixed(0)}px) translate(-50%,-50%)`;
  }
}
