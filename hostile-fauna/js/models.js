// What the visitors look like. Soldiers are assembled once per type into a few merged meshes (so forty of them
// stay cheap), then posed through the pivots in userData: legL/legR, kneeL/kneeR, top, head, gun.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { peaceShieldTex } from './world.js';
import { lightCone, flare } from './scenery.js';

const BOX = new THREE.BoxGeometry(1, 1, 1), HP = Math.PI / 2;
const G = new Map();
const geo = (k, make) => { let g = G.get(k); if (!g) G.set(k, g = make()); return g; };
const cap = (r, l) => geo(`c${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sph = (r, w = 12, h = 9) => geo(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const cyl = (rt, rb, h, n = 10) => geo(`y${rt}|${rb}|${h}|${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));

let MT = null;
function mats() {
  if (MT) return MT;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...o });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  return MT = {
    suit: std(0x2b313c, { roughness: 0.9, metalness: 0 }), trim: std(0xe8641c, { roughness: 0.6 }), gun: std(0x1a1d24, { metalness: 0.7, roughness: 0.4 }), steel: std(0x8a929c, { metalness: 0.8, roughness: 0.35 }),
    navy: std(0x24365c), hull: std(0xd8d4c8, { roughness: 0.5 }), skin: std(0xd9a07a, { roughness: 0.8, metalness: 0 }), hair: std(0xe9c95c, { roughness: 0.6, metalness: 0.1 }), gold: std(0xdcae3c, { metalness: 0.85, roughness: 0.28 }),
    cloak: std(0x4a5438, { roughness: 1, metalness: 0, side: THREE.DoubleSide }), cape: std(0xb8221c, { side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }),
    visor: glow(2.3, 1.25, 0.35), lamp: glow(2.2, 2.1, 1.8), eye: glow(2.6, 0.3, 0.2), muzzle: glow(1.6, 1.0, 0.4), jet: glow(0.6, 1.4, 2.6), green: glow(0.3, 2.2, 0.5),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a6a9a, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.75 }),
    rotor: new THREE.MeshBasicMaterial({ color: 0x9aa8b8, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    shield: new THREE.MeshStandardMaterial({ map: peaceShieldTex(), roughness: 0.35, metalness: 0.3 }),
  };
}

// Collects primitives into buckets by pivot and material, then welds each bucket into one geometry.
function kit() {
  const b = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const add = (grp, mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    c.applyMatrix4(m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz)));
    ((b[grp] ||= {})[mat] ||= []).push(c);
  };
  return { add, box: (grp, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => add(grp, mat, BOX, x, y, z, rx, ry, rz, w, h, d), done() { const o = {}; for (const g in b) { o[g] = {}; for (const m in b[g]) o[g][m] = mergeGeometries(b[g][m]); } return o; } };
}
function hang(parts, grp, parent, M, armor, cast = true) {
  for (const mk in parts[grp] || {}) { const m = new THREE.Mesh(parts[grp][mk], mk === 'armor' ? armor : M[mk]); m.castShadow = cast && (mk === 'armor' || mk === 'suit' || mk === 'cloak'); parent.add(m); }
}

// ------------------------------------------------------------------ soldiers
const HUMAN = {};
function humanParts(type) {
  if (HUMAN[type]) return HUMAN[type];
  const k = kit(), A = k.add, B = k.box, hero = type === 'hero', heavy = type === 'heavy', sniper = type === 'sniper';
  // pelvis
  B('root', 'suit', 0.34, 0.2, 0.24, 0, 0.98, 0); B('root', 'gun', 0.37, 0.06, 0.27, 0, 1.07, 0);
  B('root', 'suit', 0.1, 0.13, 0.08, 0.2, 1.0, 0.04); B('root', 'suit', 0.1, 0.13, 0.08, -0.2, 1.0, 0.04);
  B('root', 'armor', 0.16, 0.14, 0.05, 0, 0.96, 0.13);
  // legs (built once, used for both sides)
  A('thigh', 'suit', cap(0.085, 0.26), 0, -0.2, 0); B('thigh', 'armor', 0.15, 0.27, 0.07, 0, -0.2, 0.07, -0.05);
  B('thigh', 'armor', 0.05, 0.22, 0.14, 0.085, -0.2, 0);
  A('shin', 'armor', sph(0.078), 0, 0, 0.04, 0, 0, 0, 1, 1, 0.85);
  A('shin', 'suit', cap(0.07, 0.24), 0, -0.21, 0); B('shin', 'armor', 0.14, 0.27, 0.1, 0, -0.21, 0.035, 0.04);
  B('shin', 'gun', 0.15, 0.11, 0.3, 0, -0.435, 0.05); B('shin', 'trim', 0.155, 0.025, 0.31, 0, -0.39, 0.05);
  // torso
  A('top', 'suit', cyl(0.15, 0.17, 0.24, 12), 0, 0.1, 0);
  A('top', 'armor', sph(0.23, 14, 10), 0, 0.4, 0.02, 0, 0, 0, heavy ? 1.12 : 1, 0.95, heavy ? 0.86 : 0.74);
  B('top', 'armor', 0.32, 0.17, 0.06, 0, 0.45, 0.165, -0.12); B('top', 'trim', 0.32, 0.03, 0.065, 0, 0.35, 0.168);
  B('top', 'armor', 0.26, 0.1, 0.05, 0, 0.26, 0.15, 0.1);
  B('top', 'lamp', 0.05, 0.03, 0.02, 0.1, 0.47, 0.2);
  A('top', 'gun', cyl(0.1, 0.12, 0.07, 12), 0, 0.61, 0);
  B('top', 'suit', 0.3, 0.38, 0.17, 0, 0.38, -0.22); A('top', 'steel', cyl(0.055, 0.055, 0.3, 8), 0.09, 0.4, -0.33); A('top', 'steel', cyl(0.055, 0.055, 0.3, 8), -0.09, 0.4, -0.33);
  B('top', 'trim', 0.31, 0.04, 0.18, 0, 0.55, -0.22);
  A('top', 'gun', cyl(0.007, 0.007, 0.45, 4), -0.12, 0.8, -0.27); A('top', 'eye', sph(0.018, 6, 5), -0.12, 1.03, -0.27);
  for (const s of [-1, 1]) {
    A('top', hero ? 'gold' : 'armor', sph(hero ? 0.15 : heavy ? 0.14 : 0.115), s * 0.28, 0.56, 0, 0, 0, 0, 1, 0.78, 1.05);
    if (!hero) B('top', 'trim', 0.03, 0.02, 0.2, s * 0.3, 0.63, 0);
    if (hero) A('top', 'gold', new THREE.ConeGeometry(0.04, 0.16, 6), s * 0.36, 0.66, 0, 0, 0, -s * 0.9);
  }
  // arms, posed on the weapon
  A('top', 'suit', cap(0.058, 0.2), 0.27, 0.41, 0.07, -0.6, 0, 0.05); A('top', 'suit', cap(0.052, 0.2), 0.21, 0.31, 0.27, -1.35, -0.3, 0); A('top', 'armor', cap(0.058, 0.1), 0.21, 0.32, 0.27, -1.35, -0.3, 0);
  A('top', 'gun', sph(0.05, 8, 6), 0.14, 0.33, 0.4);
  A('top', 'suit', cap(0.058, 0.2), -0.27, 0.42, 0.09, -0.8, 0, -0.05); A('top', 'suit', cap(0.052, 0.22), -0.16, 0.32, 0.38, -1.3, 0.75, 0); A('top', 'armor', cap(0.058, 0.1), -0.16, 0.32, 0.38, -1.3, 0.75, 0);
  A('top', 'gun', sph(0.05, 8, 6), 0.03, 0.3, 0.6);
  if (sniper) { A('top', 'cloak', new THREE.CylinderGeometry(0.2, 0.46, 0.85, 12, 1, true, HP * 1.2, Math.PI * 1.4), 0, 0.2, -0.02); A('head', 'cloak', new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.12, -0.03); }
  // head
  A('head', 'suit', cyl(0.06, 0.07, 0.1, 8), 0, -0.02, 0);
  if (hero) {
    A('head', 'skin', sph(0.16), 0, 0.13, 0, 0, 0, 0, 0.9, 1.08, 0.96); B('head', 'skin', 0.2, 0.09, 0.1, 0, 0.02, 0.09); B('head', 'skin', 0.04, 0.05, 0.05, 0, 0.12, 0.155);
    B('head', 'hair', 0.3, 0.1, 0.3, 0, 0.27, -0.03); B('head', 'hair', 0.26, 0.1, 0.16, 0.02, 0.33, 0.07, -0.45); B('head', 'hair', 0.31, 0.16, 0.1, 0, 0.18, -0.13);
    B('head', 'gun', 0.25, 0.035, 0.02, 0, 0.16, 0.15);   // sunglasses, obviously
    B('top', 'gold', 0.12, 0.12, 0.03, 0, 0.45, 0.2, 0, 0, Math.PI / 4);
    A('top', 'gun', cyl(0.085, 0.1, 0.5, 10), 0.14, 0.38, -0.4); A('top', 'gun', cyl(0.085, 0.1, 0.5, 10), -0.14, 0.38, -0.4); A('top', 'steel', cyl(0.07, 0.1, 0.1, 10), 0.14, 0.1, -0.4); A('top', 'steel', cyl(0.07, 0.1, 0.1, 10), -0.14, 0.1, -0.4);
  } else {
    A('head', 'armor', sph(0.19, 14, 10), 0, 0.13, 0, 0, 0, 0, 1, 1.02, 1.08);
    A('head', 'visor', sph(0.165, 14, 8), 0, 0.12, 0.065, 0, 0, 0, heavy ? 0.8 : 1, heavy ? 0.28 : 0.52, 1);
    B('head', 'armor', 0.06, 0.05, 0.36, 0, 0.31, 0); B('head', 'gun', 0.2, 0.08, 0.1, 0, 0.01, 0.14);
    A('head', 'gun', cyl(0.05, 0.05, 0.05, 8), 0.195, 0.12, 0, 0, 0, HP); A('head', 'gun', cyl(0.05, 0.05, 0.05, 8), -0.195, 0.12, 0, 0, 0, HP);
    A('head', 'lamp', sph(0.026, 6, 5), 0.15, 0.26, 0.11); B('head', 'trim', 0.03, 0.02, 0.2, 0, 0.345, 0);
  }
  // weapon
  const L = sniper ? 0.95 : heavy ? 0.3 : 0.42;
  B('gun', 'gun', 0.06, 0.11, 0.42, 0, 0, 0.1); A('gun', 'steel', cyl(heavy ? 0.03 : 0.018, heavy ? 0.03 : 0.018, L, 8), 0, 0.02, 0.3 + L / 2, HP);
  B('gun', 'suit', 0.058, 0.075, 0.24, 0, 0, 0.38); B('gun', 'gun', 0.05, 0.09, 0.2, 0, -0.02, -0.2); B('gun', 'gun', 0.04, 0.16, 0.07, 0, -0.12, 0.1, 0.2);
  B('gun', 'gun', 0.03, 0.04, 0.12, 0, 0.085, 0.08); B('gun', 'trim', 0.064, 0.02, 0.1, 0, 0.03, 0.2);
  if (sniper) { A('gun', 'gun', cyl(0.03, 0.03, 0.3, 8), 0, 0.11, 0.12, HP); A('gun', 'visor', cyl(0.028, 0.028, 0.01, 8), 0, 0.11, 0.275, HP); }
  A('gun', 'muzzle', cyl(0.026, 0.026, 0.05, 8), 0, 0.02, 0.32 + L, HP);
  const out = k.done(); out.muzzleZ = 0.36 + 0.34 + L;
  return HUMAN[type] = out;
}

export function humanModel(type, armor, scale = 1) {
  const M = mats(), parts = humanParts(type), g = new THREE.Group(), u = g.userData;
  hang(parts, 'root', g, M, armor);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.11, 0.92, 0); leg.scale.x = s; g.add(leg); hang(parts, 'thigh', leg, M, armor);
    const knee = new THREE.Group(); knee.position.y = -0.43; leg.add(knee); hang(parts, 'shin', knee, M, armor);
    u[s < 0 ? 'legL' : 'legR'] = leg; u[s < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const top = new THREE.Group(); top.position.y = 0.98; g.add(top); u.top = top; hang(parts, 'top', top, M, armor);
  const head = new THREE.Group(); head.position.y = 0.64; top.add(head); u.head = head; hang(parts, 'head', head, M, armor);
  const gun = new THREE.Group(); gun.position.set(0.13, 0.33, 0.36); top.add(gun); u.gun = gun; hang(parts, 'gun', gun, M, armor, false);
  if (type === 'heavy') {
    const sh = new THREE.Group(); sh.position.set(-0.3, 0.3, 0.6); top.add(sh); u.shield = sh;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.05), M.shield); face.castShadow = true; sh.add(face);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.56, 0.03), M.gun); fr.position.z = -0.02; sh.add(fr);
  }
  if (type === 'hero') {
    const cg = new THREE.PlaneGeometry(0.72, 1.35, 3, 6).translate(0, -0.675, 0);
    const cape = new THREE.Mesh(cg, M.cape); cape.position.set(0, 0.6, -0.34); cape.rotation.x = 0.25; cape.castShadow = true; top.add(cape); u.cape = cape; u.cape0 = cg.attributes.position.array.slice();
    u.jets = [];
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.6, 8), M.jet); f.position.set(s * 0.14, -0.22, -0.4); f.rotation.x = Math.PI; f.visible = false; top.add(f); u.jets.push(f); }
  }
  u.muzzleZ = parts.muzzleZ;
  g.scale.setScalar(scale);
  return g;
}

// ------------------------------------------------------------------ machines
const mk = (g, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
const bx = (mat, w, h, d, x, y, z, parent, rx = 0, ry = 0, rz = 0) => mk(BOX, mat, x, y, z, parent, rx, ry, rz, w, h, d);

export function droneModel() {
  const M = mats(), g = new THREE.Group(), u = g.userData;
  mk(sph(0.34, 14, 10), M.navy, 0, 0.45, 0, g, 0, 0, 0, 1, 0.6, 1.15);
  mk(sph(0.2, 12, 8), M.hull, 0, 0.56, -0.05, g, 0, 0, 0, 1, 0.6, 1.2);
  mk(sph(0.1, 10, 8), M.eye, 0, 0.4, 0.34, g); mk(cyl(0.13, 0.13, 0.05, 12), M.gun, 0, 0.4, 0.31, g, HP);
  bx(M.trim, 0.5, 0.03, 0.03, 0, 0.5, 0.3, g);
  u.rotors = [];
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    bx(M.gun, 0.04, 0.04, 0.5, x * 0.26, 0.52, z * 0.26, g, 0, x * z * 0.78);
    mk(new THREE.TorusGeometry(0.26, 0.018, 5, 18), M.hull, x * 0.44, 0.58, z * 0.44, g, HP).castShadow = false;
    mk(cyl(0.03, 0.03, 0.1, 6), M.gun, x * 0.44, 0.56, z * 0.44, g);
    const r = mk(cyl(0.24, 0.24, 0.012, 14), M.rotor, x * 0.44, 0.62, z * 0.44, g); r.castShadow = false; u.rotors.push(r);
  }
  mk(new THREE.ConeGeometry(0.15, 0.26, 10, 1, true), M.hull, 0, 0.24, 0.16, g, -1.1).material.side = THREE.DoubleSide;   // the loudspeaker
  mk(cyl(0.025, 0.025, 0.36, 6), M.gun, 0.12, 0.3, 0.2, g, HP);
  mk(sph(0.03, 6, 5), M.green, -0.2, 0.62, -0.25, g); mk(sph(0.03, 6, 5), M.eye, 0.2, 0.62, -0.25, g);
  const beam = lightCone(7, 2.2, 0xff5a40, 0.5); beam.position.set(0, 0.36, 0.3); beam.rotation.x = -0.5; g.add(beam);
  u.muzzleZ = 0.5;
  return g;
}

export function turretModel() {
  const M = mats(), g = new THREE.Group(), u = g.userData;
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; bx(M.gun, 0.1, 0.1, 1.1, Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4, g, 0.6, -a + HP, 0); bx(M.steel, 0.3, 0.05, 0.3, Math.cos(a) * 0.82, 0.03, Math.sin(a) * 0.82, g); }
  mk(cyl(0.2, 0.3, 0.7, 10), M.gun, 0, 0.6, 0, g); mk(cyl(0.34, 0.34, 0.1, 14), M.steel, 0, 0.95, 0, g);
  const head = new THREE.Group(); head.position.y = 1.2; g.add(head); u.turret = head;
  bx(M.hull, 0.7, 0.5, 0.85, 0, 0.05, 0, head); bx(M.trim, 0.72, 0.08, 0.87, 0, 0.2, 0, head); bx(M.navy, 0.5, 0.2, 0.5, 0, 0.36, -0.1, head);
  for (const s of [-1, 1]) { mk(cyl(0.045, 0.045, 0.9, 8), M.gun, s * 0.2, 0, 0.8, head, HP); mk(cyl(0.06, 0.06, 0.16, 8), M.steel, s * 0.2, 0, 1.2, head, HP); mk(cyl(0.2, 0.2, 0.16, 12), M.gun, s * 0.44, -0.02, -0.05, head, 0, 0, HP); }
  mk(sph(0.09, 10, 8), M.eye, 0, 0.14, 0.44, head); mk(cyl(0.11, 0.11, 0.04, 10), M.gun, 0, 0.14, 0.42, head, HP);
  mk(cyl(0.01, 0.01, 0.5, 4), M.gun, -0.25, 0.7, -0.3, head); mk(sph(0.03, 6, 5), M.eye, -0.25, 0.95, -0.3, head);
  const beam = lightCone(14, 1.6, 0xff5a40, 0.35); beam.position.set(0, 0.14, 0.45); beam.rotation.x = -HP; head.add(beam);
  u.muzzleZ = 1.3;
  return g;
}

export function mechModel(armor) {
  const M = mats(), g = new THREE.Group(), u = g.userData;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 1.25, 2.95, 0); g.add(leg);
    mk(sph(0.5, 12, 9), M.gun, 0, 0, 0, leg); bx(armor, 0.7, 1.5, 0.85, 0, -0.75, 0.3, leg, -0.5); bx(M.trim, 0.72, 0.12, 0.87, 0, -0.35, 0.1, leg, -0.5);
    const knee = new THREE.Group(); knee.position.set(0, -1.4, 0.66); leg.add(knee);
    mk(sph(0.4, 12, 9), M.gun, 0, 0, 0, knee); bx(M.navy, 0.6, 1.55, 0.7, 0, -0.75, -0.25, knee, 0.33); mk(cyl(0.08, 0.08, 1.2, 6), M.steel, 0.36, -0.7, -0.2, knee, 0.33);
    bx(M.gun, 1.0, 0.3, 1.7, 0, -1.48, -0.3, knee); bx(armor, 0.9, 0.3, 0.7, 0, -1.3, 0.25, knee, -0.3);
    for (const t of [-1, 1]) bx(M.steel, 0.3, 0.2, 0.5, t * 0.32, -1.5, 0.75, knee);
    u[s < 0 ? 'legL' : 'legR'] = leg; u[s < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const top = new THREE.Group(); top.position.y = 3.1; g.add(top); u.top = top;
  bx(M.gun, 2.9, 0.5, 1.6, 0, 0, 0, top);
  bx(armor, 2.5, 1.7, 2.3, 0, 1.0, -0.1, top); bx(armor, 2.0, 1.0, 1.0, 0, 0.8, 1.2, top, 0.45); bx(M.trim, 2.56, 0.22, 2.36, 0, 1.55, -0.1, top);
  mk(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, HP), M.glass, 0, 1.25, 0.75, top, 0.5, 0, 0, 0.85, 0.6, 0.8).castShadow = false;
  bx(M.navy, 1.4, 0.5, 1.2, 0, 2.05, -0.5, top); for (const s of [-1, 1]) mk(cyl(0.14, 0.14, 0.9, 8), M.gun, s * 0.5, 2.4, -1.0, top);
  for (let i = 0; i < 7; i++) { bx(M.gun, 0.16, 0.24, 0.02, -1.05 + i * 0.35, 0.45, 1.06, top, 0, 0, 0.6); }
  for (const s of [-1, 1]) {
    bx(M.navy, 1.0, 1.1, 1.7, s * 1.85, 1.35, 0, top); bx(M.trim, 1.04, 0.12, 1.74, s * 1.85, 1.85, 0, top); mk(cyl(0.3, 0.3, 0.5, 10), M.gun, s * 1.3, 1.3, 0, top, 0, 0, HP);
    for (let i = 0; i < 6; i++) { const px = s * 1.85 + ((i % 3) - 1) * 0.28, py = 1.35 + (i < 3 ? 0.22 : -0.22); mk(cyl(0.11, 0.11, 0.1, 8), M.gun, px, py, 0.86, top, HP); mk(sph(0.07, 6, 5), M.eye, px, py, 0.88, top).castShadow = false; }
  }
  mk(cyl(0.035, 0.035, 2.8, 5), M.steel, -0.95, 3.2, -1.0, top); bx(M.trim, 1.3, 0.8, 0.03, -0.28, 4.1, -1.0, top); bx(M.hull, 0.5, 0.5, 0.035, -0.6, 4.1, -1.0, top);
  mk(cyl(0.2, 0.26, 0.3, 10), M.gun, 1.0, 0.25, 1.1, top, HP); mk(sph(0.19, 10, 8), M.lamp, 1.0, 0.25, 1.22, top).castShadow = false;
  const beam = lightCone(22, 5, 0xfff0d0, 0.4); beam.position.set(1.0, 0.25, 1.25); beam.rotation.x = -HP + 0.25; top.add(beam);
  const fl = flare(0xfff0d0, 5, 0.8); fl.position.set(1.0, 0.25, 1.4); top.add(fl);
  u.muzzleZ = 1.2;
  return g;
}

export function shipModel() {
  const M = mats(), g = new THREE.Group(), u = g.userData;
  mk(cap(1.5, 6), M.hull, 0, 0, 0, g, 0, 0, HP, 1, 1, 1.25);
  bx(M.navy, 6.4, 0.9, 3.9, -0.4, -1.1, 0, g); bx(M.trim, 7.6, 0.28, 3.8, 0, 0.55, 0, g);
  mk(sph(1.45, 16, 10), M.glass, 3.2, 0.35, 0, g, 0, 0, 0, 1.25, 0.8, 1.05).castShadow = false;
  bx(M.navy, 2.6, 2.2, 0.25, -4.2, 1.6, 0, g, 0, 0, -0.5); bx(M.trim, 1.2, 0.5, 0.27, -4.7, 2.3, 0, g, 0, 0, -0.5);
  bx(M.lamp, 2.2, 1.5, 0.05, 0, -0.3, 1.9, g).castShadow = false; bx(M.lamp, 2.2, 1.5, 0.05, 0, -0.3, -1.9, g).castShadow = false;   // open doors, light on inside
  u.flames = [];
  for (const s of [-1, 1]) {
    bx(M.navy, 3.2, 0.26, 3.4, -0.6, 0.75, s * 3.5, g, s * 0.08);
    mk(cyl(0.85, 0.95, 1.7, 14), M.gun, -0.6, 0.45, s * 5, g); mk(cyl(0.98, 0.98, 0.16, 14), M.trim, -0.6, 1.1, s * 5, g);
    const f = mk(new THREE.ConeGeometry(0.75, 3.2, 12, 1, true), M.jet, -0.6, -1.9, s * 5, g, Math.PI); f.castShadow = false; f.material.side = THREE.DoubleSide; u.flames.push(f);
    const fl = flare(0x70b8ff, 7, 0.9); fl.position.set(-0.6, -0.9, s * 5); g.add(fl);
    mk(sph(0.1, 6, 5), s < 0 ? M.eye : M.green, 0.6, 0.9, s * 5.2, g).castShadow = false;
  }
  mk(sph(0.25, 8, 6), M.lamp, 2.2, -1.5, 0, g).castShadow = false;
  const beam = lightCone(16, 6, 0xfff0d0, 0.5); beam.position.set(2.2, -1.5, 0); g.add(beam);
  return g;
}
