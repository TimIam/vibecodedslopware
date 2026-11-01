// Particles: sparks and shards are Points; smoke, fire and suppressant are Sprites.
import * as THREE from 'three';

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class PointPool {
  constructor(scene, n, { additive, size }) {
    this.n = n; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n); this.grav = new Float32Array(n); this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({ size, vertexColors: true, map: radialTexture(), transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }
  emit(p, v, color, life, grav = 9.8) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < -0.58) { this.pos[i * 3 + 1] = -0.58; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] *= (0.97 + 0.03 * f); this.col[i * 3 + 1] *= (0.95 + 0.04 * f); this.col[i * 3 + 2] *= (0.93 + 0.05 * f);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

class SpritePool {
  constructor(scene, n, tex, { additive = false, color = 0xffffff } = {}) {
    this.items = []; this.head = 0; this.n = n;
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
      this.items.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, op: 1, rot: 0 });
    }
  }
  emit(p, v, { life = 2, size = 0.4, grow = 0.6, opacity = 0.5, color = null } = {}) {
    const it = this.items[this.head]; this.head = (this.head + 1) % this.n;
    it.s.position.copy(p); it.vel.copy(v); it.life = it.max = life; it.grow = grow; it.op = opacity;
    it.s.scale.setScalar(size); it.s.material.rotation = Math.random() * 6.28; it.rot = (Math.random() - 0.5) * 0.6;
    if (color) it.s.material.color.set(color);
    it.s.visible = true; it.s.material.opacity = opacity;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.s.position.addScaledVector(it.vel, dt);
      const k = it.s.scale.x + it.grow * dt; it.s.scale.setScalar(k);
      it.s.material.rotation += it.rot * dt;
      const f = it.life / it.max; it.s.material.opacity = it.op * Math.min(1, f * 3) * Math.min(1, (1 - f) * 6 + 0.2);
    }
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new PointPool(scene, 2500, { additive: true, size: 0.045 });
    this.shards = new PointPool(scene, 1500, { additive: false, size: 0.035 });
    this.smoke = new SpritePool(scene, 200, radialTexture('rgba(40,40,44,0.9)', 'rgba(40,40,44,0)'));
    this.fire = new SpritePool(scene, 110, radialTexture('rgba(255,200,90,1)', 'rgba(255,60,0,0)'), { additive: true });
    this.agent = new SpritePool(scene, 150, radialTexture('rgba(235,240,245,0.95)', 'rgba(235,240,245,0)'));
    this.water = new PointPool(scene, 2500, { additive: false, size: 0.03 });
    this.flash = document.getElementById('flash');
    // always visible at zero intensity: toggling a light's visibility recompiles every shader
    this.fireLights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xff7a20, 0, 7, 1.6); scene.add(l); this.fireLights.push(l); }
    this.t = 0;
  }
  sparkBurst(p, n = 40, dir = null, spread = 1.0, speed = 5) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.3 + Math.random() * spread));
      if (dir) v.addScaledVector(dir, speed * 0.6);
      c.setHSL(0.08 + Math.random() * 0.05, 1, 0.55 + Math.random() * 0.3);
      this.sparks.emit(p, v, c, 0.4 + Math.random() * 0.9, 9.8);
    }
  }
  glassBurst(p, n = 120, normal = null) {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      if (normal) v.addScaledVector(normal, 1.5 + Math.random() * 2);
      c.setRGB(0.7 + Math.random() * 0.3, 0.8 + Math.random() * 0.2, 0.95);
      this.shards.emit(p, v, c, 1.5 + Math.random() * 1.5, 9.8);
    }
  }
  debrisBurst(p, n = 30, color = 0x888888) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) this.shards.emit(p, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), c, 1 + Math.random(), 9.8);
  }
  puff(p, n = 6, dark = 0.5) {
    for (let i = 0; i < n; i++) this.smoke.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3)),
      new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4), { life: 2.5 + Math.random() * 2, size: 0.3, grow: 0.5, opacity: dark });
  }
  waterSpray(p, n = 25) {
    const c = new THREE.Color(0.6, 0.75, 0.95);
    for (let i = 0; i < n; i++) this.water.emit(p, new THREE.Vector3((Math.random() - 0.5) * 3.5, -1 - Math.random(), (Math.random() - 0.5) * 3.5), c, 0.9 + Math.random() * 0.5, 9.8);
  }
  agentFog(p, n = 3) {
    for (let i = 0; i < n; i++) this.agent.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)),
      new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.5), { life: 5 + Math.random() * 4, size: 1.2, grow: 1.6, opacity: 0.55 });
  }
  screenFlash(color = 'rgba(255,255,255,1)', ms = 120) {
    if (!this.flash) return; this.flash.style.background = color; this.flash.style.opacity = '1';
    setTimeout(() => { this.flash.style.transition = `opacity ${ms}ms`; this.flash.style.opacity = '0'; setTimeout(() => this.flash.style.transition = '', ms); }, 20);
  }
  /** fires: array of {pos:Vector3, intensity} */
  update(dt, fires) {
    this.t += dt;
    this.sparks.update(dt); this.shards.update(dt); this.water.update(dt);
    this.smoke.update(dt); this.fire.update(dt); this.agent.update(dt);
    let li = 0;
    for (const f of fires) {
      if (f.intensity <= 0.01) continue;
      const n = Math.ceil(f.intensity * 3);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.9) this.fire.emit(f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.6 * f.intensity, (Math.random() - 0.5) * 0.5)),
          new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.9 + Math.random(), (Math.random() - 0.5) * 0.3), { life: 0.5 + Math.random() * 0.5, size: 0.25 + 0.5 * f.intensity, grow: -0.3, opacity: 0.9 });
        if (Math.random() < 0.5) this.smoke.emit(f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7, (Math.random() - 0.5) * 0.4)),
          new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3), { life: 4 + Math.random() * 3, size: 0.5, grow: 0.7, opacity: 0.35 + 0.4 * f.intensity });
      }
      if (li < this.fireLights.length) {
        const l = this.fireLights[li++]; l.position.copy(f.pos).y += 0.6;
        l.intensity = (8 + Math.sin(this.t * 23 + li) * 2 + Math.sin(this.t * 7.3) * 1.5) * f.intensity;
      }
    }
    for (; li < this.fireLights.length; li++) this.fireLights[li].intensity = 0;
  }
}
