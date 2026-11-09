// Your arms and the three Returners, as seen from behind your own eyes. Grown, not built: beetle-shell chitin
// with a film of colour on it, lit sacs, long three-fingered hands.

import * as THREE from 'three';
import { flare } from './scenery.js';

const HP = Math.PI / 2;

export function buildArms(camera) {
  const chitin = new THREE.MeshPhysicalMaterial({ color: 0x0c1d24, roughness: 0.3, metalness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.25, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620] });
  const plate = new THREE.MeshPhysicalMaterial({ color: 0x163640, roughness: 0.38, metalness: 0.45, clearcoat: 0.5, iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [300, 700] });
  const skin = new THREE.MeshStandardMaterial({ color: 0x1f5550, roughness: 0.62, metalness: 0.05 });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 1.0, 0.9) });
  const chargeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.45, 1.5) });
  const podM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.2, 0.45) });
  const membrane = new THREE.MeshPhysicalMaterial({ color: 0x1c6a3a, emissive: 0x1a8a40, emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.7, clearcoat: 1 });
  const add = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.frustumCulled = false; parent.add(m); return m; };
  for (const m of [chitin, plate, skin, membrane]) m.side = THREE.DoubleSide;
  const lathe = (pts, n = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n).rotateX(HP);   // profile y runs along Z: negative is forward
  const up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3();
  const seg = (mat, r, x1, y1, z1, x2, y2, z2, parent) => { dv.set(x2 - x1, y2 - y1, z2 - z1); const len = dv.length(), m = add(new THREE.CapsuleGeometry(r, len, 3, 8), mat, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, parent); m.quaternion.setFromUnitVectors(up, dv.normalize()); return m; };

  const vm = new THREE.Group(); camera.add(vm);
  const lamp = new THREE.PointLight(0x9fe8ff, 0.9, 5, 1.6); lamp.position.set(0.1, 0.15, 0.1); vm.add(lamp);

  // ---- an arm: forearm toward +Z (back to the elbow), hand at the origin
  const arm = (side, open) => {
    const g = new THREE.Group();
    add(lathe([[0.034, -0.02], [0.042, -0.1], [0.058, -0.3], [0.066, -0.5], [0.06, -0.7]], 12), skin, 0, 0, 0, g, 0, Math.PI, 0);
    for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, HP), i % 2 ? plate : chitin, 0, 0.012, 0.12 + i * 0.14, g, -0.5, 0, 0, 0.82 + i * 0.07, 0.55, 1.5);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(new THREE.CapsuleGeometry(0.006, 0.07, 3, 6), glowM, s * (0.045 + i * 0.006), -0.005, 0.14 + i * 0.15, g, HP, 0, 0);
    add(new THREE.SphereGeometry(0.05, 12, 9), skin, 0, 0, -0.03, g, 0, 0, 0, 1.05, 0.62, 1.25);
    add(new THREE.SphereGeometry(0.03, 8, 6, 0, Math.PI * 2, 0, HP), chitin, 0, 0.022, -0.03, g, 0, 0, 0, 1.3, 0.7, 1.6);
    const curl = open ? 0.25 : 1.05;
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Group(); f.position.set((i - 1) * 0.036, 0.004, -0.085); f.rotation.set(-0.25 - (open ? 0 : 0.35), (i - 1) * -0.22 * side, 0); g.add(f);
      add(new THREE.CapsuleGeometry(0.0125, 0.075, 3, 7), skin, 0, 0, -0.045, f, HP);
      const k = new THREE.Group(); k.position.z = -0.095; k.rotation.x = -curl; f.add(k);
      add(new THREE.SphereGeometry(0.015, 6, 5), plate, 0, 0, 0, k); add(new THREE.CapsuleGeometry(0.011, 0.06, 3, 7), skin, 0, 0, -0.04, k, HP);
      const t = new THREE.Group(); t.position.z = -0.082; t.rotation.x = -curl * 0.8; k.add(t);
      add(new THREE.ConeGeometry(0.012, open ? 0.13 : 0.075, 6), chitin, 0, 0, open ? -0.06 : -0.035, t, -HP);
    }
    const th = new THREE.Group(); th.position.set(side * -0.05, -0.004, -0.03); th.rotation.set(-0.2, side * 0.9, 0); g.add(th);
    add(new THREE.CapsuleGeometry(0.013, 0.06, 3, 7), skin, 0, 0, -0.04, th, HP); add(new THREE.ConeGeometry(0.012, 0.07, 6), chitin, 0, 0, -0.1, th, -HP);
    return g;
  };

  const vmR = new THREE.Group(); vmR.position.set(0.3, -0.3, -0.52); vm.add(vmR);
  const ra = arm(1, false); ra.position.set(0.012, -0.075, 0.03); ra.rotation.set(0.5, -0.16, 0.25); vmR.add(ra);
  const vmL = arm(-1, true); vmL.position.set(-0.5, -0.9, -0.3); vm.add(vmL);

  // ---- Thorn: a seed-pod that throws its spines. Lit sacs down both flanks show how much is left.
  const th = new THREE.Group();
  add(lathe([[0.0, 0.12], [0.04, 0.1], [0.058, 0.02], [0.062, -0.1], [0.05, -0.26], [0.036, -0.4], [0.03, -0.52], [0.036, -0.56]], 16), chitin, 0, 0.03, 0, th);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + HP; add(new THREE.ConeGeometry(0.012, 0.5, 5), plate, Math.cos(a) * 0.05, 0.03 + Math.sin(a) * 0.05, -0.45, th, -HP, 0, 0, 1, 1, 1).rotation.set(-HP + Math.sin(a) * 0.09, -Math.cos(a) * 0.09, 0); }
  for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.011, 0.06, 5), plate, 0, 0.085 - i * 0.004, 0.02 - i * 0.075, th, 0.9);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    add(new THREE.SphereGeometry(0.019, 10, 8), glowM, s * (0.056 - i * 0.005), 0.034, -0.02 - i * 0.085, th, 0, 0, 0, 0.55, 1, 1.5);
    add(new THREE.TorusGeometry(0.024, 0.005, 5, 12), plate, s * (0.057 - i * 0.005), 0.034, -0.02 - i * 0.085, th, 0, HP, 0, 1, 1, 1).scale.set(1.5, 1, 1);
  }
  add(new THREE.TorusGeometry(0.036, 0.007, 6, 16), plate, 0, 0.03, -0.56, th);
  add(new THREE.SphereGeometry(0.022, 10, 8), glowM, 0, 0.03, -0.55, th);
  add(new THREE.CapsuleGeometry(0.02, 0.07, 3, 8), chitin, 0, -0.04, 0.03, th, 0.3);
  // ---- Chorus: a lyre. Hold the note and the heart of it swells.
  const ch = new THREE.Group();
  add(lathe([[0.0, 0.1], [0.045, 0.06], [0.052, -0.04], [0.03, -0.14], [0.022, -0.2]], 14), chitin, 0, 0.02, 0, ch);
  for (const s of [-1, 1]) {
    seg(plate, 0.013, s * 0.02, 0.02, -0.15, s * 0.1, 0.02, -0.38, ch); seg(plate, 0.01, s * 0.1, 0.02, -0.38, s * 0.07, 0.02, -0.63, ch);
    add(new THREE.SphereGeometry(0.017, 8, 6), chitin, s * 0.1, 0.02, -0.38, ch);
    add(new THREE.ConeGeometry(0.012, 0.09, 6), chitin, s * 0.066, 0.02, -0.69, ch, -HP);
    add(new THREE.SphereGeometry(0.013, 8, 6), chargeM, s * 0.07, 0.02, -0.64, ch);
  }
  for (let i = 0; i < 5; i++) { const z = -0.24 - i * 0.075, w = z > -0.38 ? 0.02 + (0.1 - 0.02) * (-0.15 - z) / 0.23 : 0.1 - 0.03 * (-0.38 - z) / 0.25; add(new THREE.CylinderGeometry(0.0022, 0.0022, w * 2, 4), chargeM, 0, 0.02, z, ch, 0, 0, HP); }
  const core = add(new THREE.OctahedronGeometry(0.026, 1), chargeM, 0, 0.02, -0.42, ch); ch.userData.core = core;
  const ring = add(new THREE.TorusGeometry(0.05, 0.004, 5, 20), chargeM, 0, 0.02, -0.42, ch); ch.userData.ring = ring;
  add(new THREE.CapsuleGeometry(0.02, 0.07, 3, 8), chitin, 0, -0.04, 0.03, ch, 0.3);
  // ---- Spore Pod: a bloom with a belly full of seeds.
  const sp = new THREE.Group();
  add(lathe([[0.0, 0.1], [0.036, 0.07], [0.04, -0.06], [0.03, -0.16]], 12), chitin, 0, 0.02, 0, sp);
  const bulb = add(new THREE.SphereGeometry(0.1, 16, 12), membrane, 0, 0.035, -0.3, sp, 0, 0, 0, 1, 1, 1.25); sp.userData.core = bulb;
  const seeds = new THREE.Group(); seeds.position.set(0, 0.035, -0.3); sp.add(seeds); sp.userData.seeds = seeds;
  for (let i = 0; i < 7; i++) add(new THREE.SphereGeometry(0.022, 8, 6), podM, Math.cos(i * 2.4) * 0.045, Math.sin(i * 1.7) * 0.04, Math.sin(i * 2.4) * 0.06, seeds);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.SphereGeometry(0.05, 8, 6), plate, Math.cos(a) * 0.075, 0.035 + Math.sin(a) * 0.075, -0.43, sp, 0, 0, 0, 0.5, 0.5, 1.9).rotation.set(Math.sin(a) * 0.5, -Math.cos(a) * 0.5, 0); }
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; add(new THREE.TorusGeometry(0.1, 0.006, 5, 14, 2.2), chitin, 0, 0.035, -0.3, sp, 0, a, 0, 1, 1, 1.25); }
  add(new THREE.CapsuleGeometry(0.02, 0.07, 3, 8), chitin, 0, -0.04, 0.03, sp, 0.3);

  const wModels = [th, ch, sp];
  for (const [i, w] of wModels.entries()) { vmR.add(w); w.visible = i === 0; }
  const flash = flare(0x9ffff0, 0.5, 0); flash.position.set(0, 0.03, -0.62); vmR.add(flash);
  return { vm, vmR, vmL, wModels, glowM, chargeM, flash };
}
