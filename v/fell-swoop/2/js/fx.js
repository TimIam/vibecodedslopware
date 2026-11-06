// Wood chips, needles and dust.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export class Fx {
  constructor(scene, dot) {
    this.N = 600;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.chips = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.N);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chips.castShadow = true; this.chips.frustumCulled = false;
    for (let i = 0; i < this.N; i++) { this.chips.setMatrixAt(i, _m.makeScale(0, 0, 0)); this.chips.setColorAt(i, _c.set(0xffffff)); }
    scene.add(this.chips);
    this.pos = new Float32Array(this.N * 3); this.vel = new Float32Array(this.N * 3);
    this.rot = new Float32Array(this.N * 3); this.spin = new Float32Array(this.N * 3);
    this.size = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.rest = new Uint8Array(this.N);
    this.next = 0;

    this.puffs = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xd8c9a8, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.puffs.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
    }
    this.nextPuff = 0;
  }

  // n chips from point p, thrown out along dir.
  chips_(p, dir, n, speed, palette, size = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      const sp = speed * (0.4 + Math.random() * 0.9);
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([dir.x * sp + (Math.random() - 0.5) * speed * 0.7, dir.y * sp + Math.random() * speed * 0.6 + 0.6, dir.z * sp + (Math.random() - 0.5) * speed * 0.7], i * 3);
      this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
      this.spin.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30], i * 3);
      const big = Math.random() < 0.25 ? 1.8 : 1;
      this.size.set([(0.018 + Math.random() * 0.03) * big * size, (0.004 + Math.random() * 0.004) * size, (0.012 + Math.random() * 0.016) * big * size], i * 3);
      this.life[i] = 40 + Math.random() * 20; this.rest[i] = 0;
      this.chips.setColorAt(i, _c.set(palette[Math.floor(Math.random() * palette.length)]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    }
    this.chips.instanceColor.needsUpdate = true;
  }
  woodChips(p, dir, n, speed) { this.chips_(p, dir, n, speed, [0xe9cc94, 0xdcb879, 0xf0d9a8, 0xe2c084, 0x5a4030]); }
  barkBits(p, dir, n, speed) { this.chips_(p, dir, n, speed, [0x4a3427, 0x5d4535, 0x3b2a20], 0.8); }
  needles(p, dir, n, speed) { this.chips_(p, dir, n, speed, [0x2f4a22, 0x3b5a2a, 0x24391b, 0x51683a], 0.7); }

  puff(p, n, size, color = 0xd8c9a8, spread = 0.6, rise = 0.6, life = 1.4) {
    for (let k = 0; k < n; k++) {
      const P = this.puffs[this.nextPuff]; this.nextPuff = (this.nextPuff + 1) % this.puffs.length;
      P.s.visible = true; P.s.position.set(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * spread * 0.3, p.z + (Math.random() - 0.5) * spread);
      P.vel.set((Math.random() - 0.5) * spread, rise * (0.5 + Math.random()), (Math.random() - 0.5) * spread);
      P.life = P.max = life * (0.7 + Math.random() * 0.6); P.size = size * (0.6 + Math.random() * 0.8); P.grow = 1.6;
      P.s.material.color.set(color); P.s.material.rotation = Math.random() * 6;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const o = i * 3;
      if (!this.rest[i]) {
        this.vel[o + 1] -= 9.81 * dt;
        const drag = 1 - 1.6 * dt; this.vel[o] *= drag; this.vel[o + 2] *= drag;
        this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
        this.rot[o] += this.spin[o] * dt; this.rot[o + 1] += this.spin[o + 1] * dt; this.rot[o + 2] += this.spin[o + 2] * dt;
        if (this.pos[o + 1] < 0.004) {
          this.pos[o + 1] = 0.004;
          if (Math.abs(this.vel[o + 1]) < 0.8) { this.rest[i] = 1; this.rot[o] = Math.round(this.rot[o] / Math.PI) * Math.PI; this.rot[o + 2] = Math.round(this.rot[o + 2] / Math.PI) * Math.PI; }
          else { this.vel[o + 1] *= -0.3; this.vel[o] *= 0.5; this.vel[o + 2] *= 0.5; for (let k = 0; k < 3; k++) this.spin[o + k] *= 0.5; }
        }
      }
      const fade = Math.min(1, this.life[i] / 3);
      _e.set(this.rot[o], this.rot[o + 1], this.rot[o + 2]); _q.setFromEuler(_e);
      _s.set(this.size[o] * fade, this.size[o + 1] * fade, this.size[o + 2] * fade);
      _p.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      this.chips.setMatrixAt(i, _m.compose(_p, _q, _s));
      if (this.life[i] <= 0) this.chips.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    if (any) this.chips.instanceMatrix.needsUpdate = true;
    for (const P of this.puffs) {
      if (P.life <= 0) continue;
      P.life -= dt;
      if (P.life <= 0) { P.s.visible = false; continue; }
      const k = 1 - P.life / P.max;
      P.s.position.addScaledVector(P.vel, dt); P.vel.multiplyScalar(1 - 1.5 * dt);
      const sz = P.size * (1 + k * P.grow); P.s.scale.set(sz, sz, sz);
      P.s.material.opacity = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k) * 0.55;
    }
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.N; i++) this.chips.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.chips.instanceMatrix.needsUpdate = true;
    for (const P of this.puffs) { P.life = 0; P.s.visible = false; }
  }
}
