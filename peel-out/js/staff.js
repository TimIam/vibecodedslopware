// Waiters at the pass window. Little people built from capsules who get visibly cross.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export class Waiter {
  constructor(scene, look, slot) {
    this.look = look; this.slot = slot;
    const g = this.group = new THREE.Group(); g.scale.setScalar(0.82); scene.add(g);
    const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    const add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
    this.body = add(new THREE.CapsuleGeometry(0.17, 0.5, 6, 14), M(look.shirt), 0, 1.0, 0);
    this.body.scale.set(1, 1, 0.75);
    add(new THREE.CylinderGeometry(0.175, 0.2, 0.42, 16, 1, true), M(look.apron), 0, 0.82, 0.02);
    this.headG = new THREE.Group(); this.headG.position.set(0, 1.5, 0); g.add(this.headG);
    const skin = M(look.skin);
    this.head = add(new THREE.SphereGeometry(0.13, 20, 16), skin, 0, 0, 0, this.headG);
    add(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M(look.hair), 0, 0.02, -0.01, this.headG);
    const eye = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
    this.eyes = [-0.045, 0.045].map(x => add(new THREE.SphereGeometry(0.014, 8, 6), eye, x, 0.01, 0.118, this.headG));
    this.brows = [-0.045, 0.045].map(x => add(new THREE.BoxGeometry(0.04, 0.008, 0.01), eye, x, 0.05, 0.12, this.headG));
    this.mouth = add(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x5a2018 }), 0, -0.05, 0.118, this.headG);
    add(new THREE.SphereGeometry(0.02, 8, 6), skin, 0, -0.01, 0.13, this.headG);
    this.arms = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.2, 1.3, 0); g.add(piv);
      add(new THREE.CapsuleGeometry(0.045, 0.32, 4, 8), M(look.shirt), 0, -0.2, 0, piv);
      add(new THREE.SphereGeometry(0.045, 10, 8), skin, 0, -0.41, 0, piv);
      return piv;
    });
    // order pad in the left hand
    add(new THREE.BoxGeometry(0.07, 0.1, 0.01), M(0xfafafa), 0, -0.4, 0.05, this.arms[0]);
    this.x = slot; this.tx = slot; this.z = -2.6; this.tz = -1.75; this.mood = 1; this.t = Math.random() * 10; this.carry = null; this.leaving = 0;
    this.say = null; this.sayT = 0;
    g.position.set(this.x, 0, this.z);
  }
  update(dt, mood, active) {
    this.t += dt;
    this.mood = lerp(this.mood, mood, Math.min(1, dt * 2));
    const tz = active ? this.tz : -2.6;
    this.x += (this.tx - this.x) * Math.min(1, dt * 2.5);
    this.z += (tz - this.z) * Math.min(1, dt * 2.2);
    const walking = Math.abs(tz - this.z) > 0.05 || Math.abs(this.tx - this.x) > 0.05;
    const bob = walking ? Math.abs(Math.sin(this.t * 9)) * 0.03 : Math.sin(this.t * 2) * 0.006;
    this.group.position.set(this.x, bob, this.z);
    // impatient: weight shifting, foot tapping, arms crossed
    const cross = smoothstep(0.45, 0.15, this.mood);
    this.group.rotation.y = this.z < -2 ? Math.PI : Math.sin(this.t * 0.7) * 0.15 * (1 - cross) + (this.mood < 0.25 ? Math.sin(this.t * 6) * 0.05 : 0);
    this.arms[0].rotation.set(-cross * 1.3 - (this.carry ? 1.2 : 0), 0, -cross * 0.9 + (walking ? Math.sin(this.t * 9) * 0.3 : 0));
    this.arms[1].rotation.set(-cross * 1.3 - (this.carry ? 1.2 : 0), 0, cross * 0.9 - (walking ? Math.sin(this.t * 9) * 0.3 : 0));
    const angry = clamp(1 - this.mood, 0, 1);
    this.brows[0].rotation.z = -angry * 0.6; this.brows[1].rotation.z = angry * 0.6;
    this.brows.forEach(b => (b.position.y = 0.05 - angry * 0.012));
    this.mouth.rotation.z = this.mood > 0.5 ? Math.PI : 0;
    this.mouth.position.y = this.mood > 0.5 ? -0.04 : -0.07;
    this.headG.rotation.x = -0.25 + Math.sin(this.t * 1.3) * 0.04;
    this.headG.rotation.z = this.mood < 0.3 ? Math.sin(this.t * 3) * 0.1 : 0;
    if (this.carry) {
      const p = this.carry;
      p.pos.set(this.x, 1.06 + bob, this.z + Math.cos(this.group.rotation.y) * 0.28);
    }
  }
  headWorld(out) { return out.set(this.x, 1.45, this.z); }
}

function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
