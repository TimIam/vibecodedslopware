// Particles (dust, divots, splashes, steam, sparks, fireworks), tumbling confetti and ball trails.
import * as THREE from 'three';

const N = 2400;
export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N); this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.grow = new Float32Array(N); this.s0 = new Float32Array(N);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if (r > .5) discard;
          float edge = smoothstep(.5, .36, r); float shade = 1. - smoothstep(.0, .5, length(d - vec2(-.12,-.12))) * .25;
          gl_FragColor = vec4(vC * (0.85 + shade * 0.2), vA * edge); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g; this.mat = m;
  }
  emit(p, o = {}) {
    const n = o.n ?? 10;
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % N;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      if (o.up) dy = Math.abs(dy) * o.up + (1 - o.up) * dy;
      const dir = o.dir;
      const spread = o.spread ?? 1;
      this.vel[i * 3] = (dir ? dir.x : 0) * (o.dirSpeed ?? 0) + dx * sp * spread;
      this.vel[i * 3 + 1] = (dir ? dir.y : 0) * (o.dirSpeed ?? 0) + dy * sp * spread + (o.lift ?? 0);
      this.vel[i * 3 + 2] = (dir ? dir.z : 0) * (o.dirSpeed ?? 0) + dz * sp * spread;
      const r = o.radius ?? 0.05;
      this.pos[i * 3] = p.x + dx * r; this.pos[i * 3 + 1] = p.y + dy * r * (o.flat ? 0.2 : 1); this.pos[i * 3 + 2] = p.z + dz * r;
      const cols = o.colors || ['#ffffff'];
      c.set(cols[(Math.random() * cols.length) | 0]).convertSRGBToLinear();
      if (o.jitter) c.offsetHSL(0, 0, (Math.random() - 0.5) * o.jitter);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.max[i] = this.life[i] = (o.life ?? 0.8) * (0.6 + Math.random() * 0.8);
      this.s0[i] = (o.size ?? 0.15) * (0.6 + Math.random() * 0.8);
      this.grav[i] = o.grav ?? 9; this.drag[i] = o.drag ?? 1.5; this.grow[i] = o.grow ?? 0;
    }
  }
  update(dt) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = Math.min(1, f * 2.5);
      this.size[i] = this.s0[i] * (1 + (1 - f) * this.grow[i]);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
  setScale(h) { this.mat.uniforms.uScale.value = h * 0.9; }

  // Presets.
  dust(p, n = 14, s = 1) { this.emit(p, { n, speed: 1.6 * s, up: 0.6, colors: ['#f2ead8', '#e4d8bf', '#ffffff'], size: 0.35 * s, life: 0.7, grav: -0.4, drag: 3, grow: 1.4, radius: 0.2 * s, flat: true }); }
  poof(p) { this.emit(p, { n: 26, speed: 2.6, colors: ['#ffffff', '#f4f0ff', '#e8e2ff'], size: 0.5, life: 0.6, grav: -1, drag: 4, grow: 1.6, radius: 0.3 }); }
  divot(p, dir, power = 1) {
    this.emit(p, { n: 10 + power * 10, speed: 2 + power * 2, up: 0.9, dir, dirSpeed: 2.5 * power, colors: ['#6b4a2b', '#7a5434', '#5a3d22'], size: 0.09, life: 1.1, grav: 11, drag: 0.8 });
    this.emit(p, { n: 8 + power * 8, speed: 1.8 + power * 2, up: 0.9, dir, dirSpeed: 2 * power, colors: ['#5fc04a', '#4aa83a', '#7ad65f'], size: 0.07, life: 1.2, grav: 8, drag: 1.2 });
  }
  sand(p, power = 1) { this.emit(p, { n: 22 * power, speed: 2.5 * power, up: 0.9, colors: ['#f6dc9a', '#ecd08a', '#fff0c4'], size: 0.09, life: 0.9, grav: 10, drag: 1 }); }
  splash(p) {
    this.emit(p, { n: 40, speed: 3.5, up: 1, lift: 3, colors: ['#ffffff', '#c9f0ff', '#7fd3ff'], size: 0.16, life: 1.1, grav: 12, drag: 0.6, radius: 0.2 });
    this.emit(p, { n: 16, speed: 1.2, up: 0.3, colors: ['#ffffff', '#dff6ff'], size: 0.5, life: 0.8, grav: 0, drag: 3, grow: 1.5, flat: true });
  }
  bigSplash(p) {
    this.emit(p, { n: 90, speed: 7, up: 1, lift: 7, colors: ['#ffffff', '#c9f0ff', '#7fd3ff'], size: 0.5, life: 1.8, grav: 12, drag: 0.5, radius: 0.5 });
    this.emit(p, { n: 30, speed: 3, up: 0.3, colors: ['#ffffff'], size: 1.6, life: 1.4, grav: 0, drag: 2, grow: 1.5, flat: true });
  }
  sparks(p, n = 20, colors = ['#fff6a8', '#ffd23f', '#ffffff']) { this.emit(p, { n, speed: 5, colors, size: 0.07, life: 0.45, grav: 4, drag: 2 }); }
  steam(p) { this.emit(p, { n: 2, speed: 0.4, up: 1, lift: 1.4, colors: ['#ffffff', '#f2f2f2'], size: 0.12, life: 0.9, grav: -0.5, drag: 1.5, grow: 2.2 }); }
  smoke(p, dir) { this.emit(p, { n: 30, speed: 1.5, dir, dirSpeed: 4, colors: ['#ffffff', '#d9d4cc', '#bfb8ae'], size: 0.9, life: 1.6, grav: -0.6, drag: 2, grow: 2 }); this.sparks(p, 30, ['#ffae3d', '#ffe08a', '#ff5a36']); }
  firework(p) {
    const pal = [['#ff3d6e', '#ffd0dc'], ['#36c5f0', '#d4f4ff'], ['#ffd23f', '#fff4c4'], ['#7bd389', '#e2ffe9'], ['#a76bff', '#eadcff']][(Math.random() * 5) | 0];
    this.emit(p, { n: 120, speed: 9, colors: pal, size: 0.35, life: 1.6, grav: 2.5, drag: 1.4 });
  }
}

// Tumbling paper confetti.
export class Confetti {
  constructor(scene, n = 500) {
    this.n = n;
    const g = new THREE.PlaneGeometry(0.12, 0.07);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
    this.mesh = new THREE.InstancedMesh(g, m, n); this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const pal = ['#ff3d6e', '#ffd23f', '#36c5f0', '#7bd389', '#a76bff', '#ff8c42', '#ffffff'];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, c.set(pal[i % pal.length]));
    this.p = Array.from({ length: n }, () => ({ pos: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 }));
    this.next = 0; this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  burst(at, count = 160, power = 6) {
    for (let k = 0; k < count; k++) {
      const q = this.p[this.next]; this.next = (this.next + 1) % this.n;
      q.pos.copy(at);
      const a = Math.random() * Math.PI * 2, u = 0.4 + Math.random() * 0.6;
      q.v.set(Math.cos(a) * (1 - u) * power, u * power * 1.2, Math.sin(a) * (1 - u) * power);
      q.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      q.life = 4 + Math.random() * 2;
    }
  }
  update(dt, t) {
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (q.life <= 0) { if (q.pos.y > -900) { q.pos.y = -999; this.dummy.position.copy(q.pos); this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); } continue; }
      q.life -= dt;
      q.v.y -= 6 * dt; q.v.multiplyScalar(Math.exp(-dt * 1.8));
      q.v.x += Math.sin(t * 3 + i) * dt * 1.5;
      q.pos.addScaledVector(q.v, dt);
      q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      this.dummy.position.copy(q.pos); this.dummy.rotation.copy(q.rot); this.dummy.scale.setScalar(Math.min(1, q.life));
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// A camera-facing ribbon that follows a ball.
export class Trail {
  constructor(scene, color = '#ffffff', n = 36) {
    this.n = n; this.pts = []; this.width = 0.11;
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(n * 2 * 3); this.alphaA = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alphaA, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * 0.75); }',
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.geo = g;
  }
  setColor(c) { this.mat.uniforms.uColor.value.set(c); }
  push(p, on) {
    if (on) this.pts.unshift(p.clone()); else if (this.pts.length) this.pts.pop();
    if (this.pts.length > this.n) this.pts.pop();
  }
  clear() { this.pts.length = 0; }
  update(cam) {
    const n = this.n, pts = this.pts, side = new THREE.Vector3(), dir = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      if (!p || pts.length < 2 || i >= pts.length) {
        this.alphaA[i * 2] = this.alphaA[i * 2 + 1] = 0;
        if (p) { this.posA.set([p.x, p.y, p.z], i * 6); this.posA.set([p.x, p.y, p.z], i * 6 + 3); }
        continue;
      }
      const L = pts.length - 1, q = pts[Math.min(i + 1, L)], o = pts[Math.min(Math.max(i - 1, 0), L)];
      dir.subVectors(o, q); toCam.subVectors(cam.position, p);
      side.crossVectors(dir, toCam).normalize();
      const f = 1 - i / Math.min(n, pts.length);
      const w = this.width * f;
      this.posA.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
      this.posA.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6 + 3);
      this.alphaA[i * 2] = this.alphaA[i * 2 + 1] = i < pts.length ? f : 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}
