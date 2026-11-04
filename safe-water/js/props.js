// Shared props: sky, stars, stereoscopes, lamps, simple lathe-turned things.
import * as THREE from 'three';
import * as T from './tex.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const deg = d => d * Math.PI / 180;

// Unit direction for a camera yaw (deg) and elevation (deg): yaw 0 looks down -Z, +90 looks down -X.
export function dirYaw(yaw, elev = 0) {
  const y = deg(yaw), e = deg(elev);
  return V(-Math.sin(y) * Math.cos(e), Math.sin(e), -Math.cos(y) * Math.cos(e));
}

export function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o }); }
export const brass = () => mat(0xb8913f, { roughness: 0.35, metalness: 0.85 });
export const iron = () => mat(0x2a2826, { roughness: 0.6, metalness: 0.6 });

export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z); return me;
}
export function cyl(rt, rb, h, m, seg = 16, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  me.position.set(x, y, z); return me;
}
export function lathe(pts, m, seg = 24) {
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}

// Gradient sky sphere with a soft glow around one direction.
export function sky({ top = 0x050a18, horizon = 0x1a2540, bottom = 0x020306, glowDir = V(0, 0.3, -1), glowColor = 0x334466, glowSize = 0.2, radius = 1500 } = {}) {
  const u = {
    top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) },
    glowDir: { value: glowDir.clone().normalize() }, glowColor: { value: new THREE.Color(glowColor) }, glowSize: { value: glowSize }, dim: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, horizon, bottom, glowColor, glowDir; uniform float glowSize, dim; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, clamp(-h*4.0,0.0,1.0));
        float g = max(0.0, dot(normalize(vD), glowDir)); c += glowColor * (pow(g, 1.0/glowSize) * 0.9 + pow(g, 400.0) * 2.0);
        gl_FragColor = vec4(c * dim, 1.0); }`,
  });
  const me = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
  me.renderOrder = -10; me.frustumCulled = false;
  me.userData.u = u;
  return me;
}

export function stars({ count = 1800, radius = 1400, minElev = -0.02, seed = 2, size = 2.2 } = {}) {
  const r = T.rng(seed), pos = [], col = [];
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    let y = Math.abs(u); if (y < minElev) continue;
    const s = Math.sqrt(1 - y * y);
    pos.push(Math.cos(th) * s * radius, y * radius, Math.sin(th) * s * radius);
    const b = 0.35 + Math.pow(r(), 3) * 0.9, w = r();
    col.push(b * (0.85 + w * 0.15), b * (0.88 + w * 0.1), b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const tex = T.glow('rgba(255,255,255,1)', 'rgba(255,255,255,.25)');
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.renderOrder = -9; p.frustumCulled = false;
  return p;
}

const glowTex = {};
export function glowSprite(scale, color = 0xffc880, opacity = 1, key = 'warm') {
  glowTex[key] = glowTex[key] || T.glow();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex[key], color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(scale, scale, 1);
  return s;
}

// Halley's comet as a camera-facing billboard pointed away from a light source.
export function comet(len = 260) {
  const m = new THREE.MeshBasicMaterial({ map: T.comet(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const me = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), m);
  me.geometry.translate(len * 0.42, 0, 0);
  me.renderOrder = -8;
  return me;
}

// ---- Stereoscope (a Holmes-pattern hand viewer on a pedestal) ----
export function stereoCardTexture(title) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const paint = (img) => {
    const g = c.getContext('2d');
    g.fillStyle = '#d9c7a0'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#b39b6e'; g.fillRect(6, 6, 500, 244);
    g.fillStyle = '#e6d6b2'; g.fillRect(10, 10, 492, 236);
    for (let k = 0; k < 2; k++) {
      const x = 22 + k * 240, y = 22, w = 228, h = 180;
      g.save(); g.beginPath();
      g.moveTo(x, y + h); g.lineTo(x, y + 40); g.quadraticCurveTo(x, y, x + 40, y); g.lineTo(x + w - 40, y); g.quadraticCurveTo(x + w, y, x + w, y + 40); g.lineTo(x + w, y + h); g.closePath();
      g.clip();
      if (img) g.drawImage(img, img.width * 0.15 + k * 6, 0, img.width * 0.7, img.height, x, y, w, h);
      else { g.fillStyle = '#6b5a40'; g.fillRect(x, y, w, h); }
      g.restore();
    }
    g.fillStyle = '#4a3a24'; g.font = '600 17px "IM Fell English SC", "IM Fell English", Georgia, serif'; g.textAlign = 'center';
    g.fillText(title, 256, 228);
    t.needsUpdate = true;
  };
  paint(null);
  t.userData.paint = paint;
  return t;
}

export function stereoCard(tex) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.178, 0.089), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.178, 0.089), mat(0xcbb58a));
  back.rotation.y = Math.PI; back.position.z = -0.0008;
  g.add(front, back);
  return g;
}

export function stereoscope({ wood = 0x5a3518 } = {}) {
  const g = new THREE.Group();
  const w = mat(wood, { roughness: 0.45 }), velvet = mat(0x1a0d08, { roughness: 1 }), b = brass();
  // hood with two lenses, facing +Z (viewer stands at +Z)
  const hood = new THREE.Group();
  hood.add(box(0.17, 0.075, 0.07, w));
  const lip = box(0.175, 0.085, 0.02, velvet, 0, 0, 0.04); hood.add(lip);
  [-0.032, 0.032].forEach(x => {
    const l = cyl(0.02, 0.02, 0.012, b, 20, x, 0, 0.052); l.rotation.x = Math.PI / 2; hood.add(l);
    const gl = cyl(0.016, 0.016, 0.014, new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.3 }), 20, x, 0, 0.055); gl.rotation.x = Math.PI / 2; hood.add(gl);
  });
  hood.position.set(0, 0, 0.12);
  g.add(hood);
  // the bar the card holder slides on
  g.add(box(0.03, 0.012, 0.3, w, 0, -0.02, -0.03));
  const holder = new THREE.Group();
  holder.add(box(0.2, 0.012, 0.02, w, 0, -0.05, 0));
  holder.add(box(0.012, 0.1, 0.02, w, -0.095, 0, 0), box(0.012, 0.1, 0.02, w, 0.095, 0, 0));
  holder.position.set(0, 0.0, -0.13);
  g.add(holder);
  const handle = cyl(0.014, 0.018, 0.16, w, 12, 0, -0.1, 0.1);
  g.add(handle);
  // turned pedestal
  const ped = lathe([[0.001, 0], [0.16, 0], [0.16, 0.025], [0.06, 0.05], [0.035, 0.12], [0.045, 0.5], [0.03, 0.85], [0.06, 0.9], [0.001, 0.92]], w, 28);
  ped.position.y = -1.08;
  g.add(ped);
  g.userData = { hood, holder, cardSlot: V(0, 0.005, -0.13) };
  return g;
}

// A kerosene table lamp with a warm point light. Returns { group, light, flame }.
export function lamp({ intensity = 6, distance = 9, color = 0xffb46a } = {}) {
  const g = new THREE.Group();
  const b = brass();
  g.add(lathe([[0.001, 0], [0.08, 0], [0.085, 0.015], [0.04, 0.04], [0.03, 0.12], [0.07, 0.17], [0.075, 0.22], [0.04, 0.26], [0.001, 0.27]], b));
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xfff4e0, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.25, depthWrite: false });
  const chim = lathe([[0.025, 0.27], [0.045, 0.31], [0.04, 0.36], [0.022, 0.42], [0.022, 0.5]], glass, 20);
  chim.material.side = THREE.DoubleSide;
  g.add(chim);
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  fl.scale.y = 2.2; fl.position.y = 0.315; g.add(fl);
  const gs = glowSprite(0.5, 0xffb070, 0.55); gs.position.y = 0.32; g.add(gs);
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.y = 0.36; g.add(light);
  return { group: g, light, flame: fl, glow: gs, base: intensity };
}

export function flicker(l, t, amt = 0.08, speed = 1) {
  l.light.intensity = l.base * (1 - amt + amt * (Math.sin(t * 11 * speed) * 0.4 + Math.sin(t * 23.7 * speed + 1) * 0.35 + Math.sin(t * 4.1 * speed) * 0.25 + 0.5));
}

// Merge a list of meshes sharing a material into one (keeps draw calls down for scenery).
export function instanced(geo, material, mats) {
  const im = new THREE.InstancedMesh(geo, material, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  return im;
}
export function tm(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4();
  m.compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
  return m;
}

// Billboard text plane (for signs). Width in metres; height follows the texture aspect.
export function signPlane(tex, w, { transparent = true, emissive = 0, side = THREE.FrontSide, opacity = 1 } = {}) {
  const img = tex.image, h = w * img.height / img.width;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: 0.9, opacity, side, depthWrite: !transparent, emissive: emissive ? new THREE.Color(emissive) : 0x000000, emissiveMap: emissive ? tex : null });
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  if (transparent) { me.material.alphaTest = 0.02; me.material.depthWrite = false; }
  return me;
}
