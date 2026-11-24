// People, pets and the things they carry. Figures are built from capsules with jointed hips, knees,
// shoulders and a bending torso; poses are joint targets that each frame eases toward, so sitting
// down, lying back and standing up blend on their own.
import * as THREE from 'three';
import { paint, damp } from './util.js';

const CAP = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8);
const PLACE = new THREE.MeshBasicMaterial({ color: 0xff00ff });

function part(parent, geo, hex, meshes) {
  paint(geo, hex);
  const m = new THREE.Mesh(geo, PLACE);
  m.castShadow = true;
  parent.add(m);
  meshes.push(m);
  return m;
}

export function makeAvatar(o) {
  const s = o.height / 1.72;
  const meshes = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.9 * s;
  body.add(hips);
  const J = { root, body, hips };
  const th = 0.43 * s, sh = 0.43 * s;
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.09 * s, 0, 0);
    hips.add(leg);
    const tg = CAP(0.075 * s, th - 0.12 * s); tg.translate(0, -th / 2, 0);
    part(leg, tg, o.pants, meshes);
    const knee = new THREE.Group();
    knee.position.y = -th;
    leg.add(knee);
    const sg = CAP(0.058 * s, sh - 0.1 * s); sg.translate(0, -sh / 2, 0);
    part(knee, sg, o.shorts ? o.skin : o.pants, meshes);
    const shoe = new THREE.BoxGeometry(0.1 * s, 0.07 * s, 0.25 * s); shoe.translate(0, -sh + 0.01, 0.05 * s);
    part(knee, shoe, o.shoes, meshes);
    J[side < 0 ? 'legL' : 'legR'] = leg;
    J[side < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const torso = new THREE.Group();
  hips.add(torso);
  J.torso = torso;
  const pel = new THREE.SphereGeometry(0.135 * s, 10, 8); pel.scale(1.15, 0.8, 0.8); pel.translate(0, 0.03 * s, 0);
  part(torso, pel, o.pants, meshes);
  const tg = CAP(0.15 * s, 0.28 * s); tg.scale(1.2, 1, 0.72); tg.translate(0, 0.3 * s, 0);
  part(torso, tg, o.shirt, meshes);
  if (o.dress) { const dg = new THREE.CylinderGeometry(0.17 * s, 0.26 * s, 0.5 * s, 12); dg.translate(0, -0.18 * s, 0); part(torso, dg, o.shirt, meshes); }
  const head = new THREE.Group();
  head.position.y = 0.6 * s;
  torso.add(head);
  J.head = head;
  part(head, new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.09 * s, 8).translate(0, 0.02 * s, 0), o.skin, meshes);
  part(head, new THREE.SphereGeometry(0.105 * s, 14, 10).translate(0, 0.15 * s, 0), o.skin, meshes);
  if (o.hairStyle !== 'bald') {
    const hg = new THREE.SphereGeometry(0.114 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
    hg.rotateX(-0.45);
    hg.translate(0, 0.165 * s, -0.012 * s);
    part(head, hg, o.hair, meshes);
    if (o.hairStyle === 'long') { const lg = CAP(0.085 * s, 0.16 * s); lg.scale(1.15, 1, 0.7); lg.translate(0, 0.04 * s, -0.07 * s); part(head, lg, o.hair, meshes); }
  }
  if (o.hat) { const hat = new THREE.CylinderGeometry(0.11 * s, 0.115 * s, 0.07 * s, 12); hat.translate(0, 0.25 * s, 0); part(head, hat, o.hat, meshes); const brim = new THREE.BoxGeometry(0.16 * s, 0.015 * s, 0.11 * s); brim.translate(0, 0.225 * s, 0.1 * s); part(head, brim, o.hat, meshes); }
  for (const side of [-1, 1]) {
    const sh2 = new THREE.Group();
    sh2.position.set(side * 0.205 * s, 0.5 * s, 0);
    torso.add(sh2);
    const ag = CAP(0.05 * s, 0.46 * s); ag.translate(0, -0.28 * s, 0);
    part(sh2, ag, o.sleeves === false ? o.skin : o.shirt, meshes);
    part(sh2, new THREE.SphereGeometry(0.045 * s, 8, 6).translate(0, -0.58 * s, 0), o.skin, meshes);
    J[side < 0 ? 'armL' : 'armR'] = sh2;
  }
  const prop = new THREE.Group();
  prop.position.set(0, 0.22 * s, 0.3 * s);
  torso.add(prop);
  J.prop = prop;
  return { root, J, meshes, s, height: o.height, kind: 'human' };
}

export function makeQuad(o) { // cat or dog
  const meshes = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const L = o.len, H = o.h, R = o.r;
  body.position.y = H;
  const bg = CAP(R, L); bg.rotateX(Math.PI / 2);
  part(body, bg, o.color, meshes);
  const head = new THREE.Group();
  head.position.set(0, R * 0.9, L / 2 + R * 0.7);
  body.add(head);
  part(head, new THREE.SphereGeometry(R * 1.05, 10, 8), o.color, meshes);
  if (o.cat) {
    for (const sx of [-1, 1]) { const e = new THREE.ConeGeometry(R * 0.4, R * 0.7, 4); e.translate(sx * R * 0.5, R * 1.05, 0); part(head, e, o.color, meshes); }
  } else {
    const sn = new THREE.BoxGeometry(R * 0.8, R * 0.7, R * 1.1); sn.translate(0, -R * 0.2, R * 0.9); part(head, sn, o.color, meshes);
    for (const sx of [-1, 1]) { const e = new THREE.BoxGeometry(R * 0.25, R * 0.8, R * 0.5); e.translate(sx * R * 0.85, R * 0.3, -R * 0.1); part(head, e, o.ear || o.color, meshes); }
  }
  const tail = new THREE.Group();
  tail.position.set(0, R * 0.4, -L / 2 - R * 0.6);
  body.add(tail);
  const tl = o.cat ? L * 1.1 : L * 0.5;
  const tg = new THREE.CylinderGeometry(R * 0.18, R * 0.25, tl, 6); tg.translate(0, tl / 2, 0);
  part(tail, tg, o.color, meshes);
  tail.rotation.x = o.cat ? -0.5 : -0.9;
  const legs = [];
  for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const g = new THREE.Group();
    g.position.set(lx * R * 0.55, -R * 0.3, lz * L * 0.42);
    body.add(g);
    const lg = new THREE.CylinderGeometry(R * 0.22, R * 0.2, H - R * 0.2, 6); lg.translate(0, -(H - R * 0.2) / 2, 0);
    part(g, lg, o.paws || o.color, meshes);
    legs.push(g);
  }
  return { root, J: { root, body, head, tail, legs }, meshes, s: 1, kind: 'quad', H, L, R };
}

// Joint targets per pose.
const POSES = {
  stand: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0.05, armR: 0.05, torso: 0, head: 0, body: 0 },
  sit: { legL: -1.5, legR: -1.5, kneeL: 1.5, kneeR: 1.5, armL: -0.45, armR: -0.45, torso: -0.08, head: 0.05, body: 0 },
  sitTable: { legL: -1.5, legR: -1.5, kneeL: 1.45, kneeR: 1.45, armL: -1.05, armR: -1.05, torso: 0.14, head: 0.15, body: 0 },
  lie: { legL: 0, legR: 0, kneeL: 0.05, kneeR: 0.05, armL: 0.05, armR: 0.05, torso: 0, head: -0.1, body: -Math.PI / 2 },
  collapse: { legL: -0.3, legR: 0.1, kneeL: 0.6, kneeR: 0.2, armL: -0.4, armR: 0.6, torso: 0, head: 0.3, body: -Math.PI / 2 },
  kneel: { legL: 0, legR: 0, kneeL: 1.55, kneeR: 1.55, armL: -0.9, armR: -0.8, torso: 0.45, head: 0.35, body: 0 },
  cook: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: -0.85, armR: -0.95, torso: 0.1, head: 0.35, body: 0 },
  reach: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0.05, armR: -1.35, torso: 0.05, head: 0.1, body: 0 },
  carry: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: -0.95, armR: -0.95, torso: 0, head: 0, body: 0 },
  phone: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: 0.05, armR: -2.3, torso: 0, head: -0.05, body: 0 },
  push: { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, armL: -1.1, armR: -1.1, torso: 0.15, head: 0, body: 0 },
};

export function animateAvatar(a, p, dt) {
  const J = a.J;
  if (a.kind === 'quad') return animateQuad(a, p, dt);
  const s = a.s;
  const walking = p.pose === 'walk' || p.pose === 'walkCarry' || p.pose === 'walkPush';
  const base = walking ? (p.pose === 'walkCarry' ? POSES.carry : p.pose === 'walkPush' ? POSES.push : POSES.stand) : (POSES[p.pose] || POSES.stand);
  const t = { ...base };
  let hipY = 0.9 * s;
  const time = p.world.realT;
  if (walking) {
    const ph = p.phase;
    const sw = Math.sin(ph) * 0.5;
    t.legL = sw; t.legR = -sw;
    t.kneeL = 0.08 + 0.75 * Math.max(0, -Math.cos(ph));
    t.kneeR = 0.08 + 0.75 * Math.max(0, Math.cos(ph));
    if (p.pose === 'walk') { t.armL = -sw * 0.8; t.armR = sw * 0.8; }
    hipY += 0.022 * Math.abs(Math.cos(ph)) - 0.01;
  } else if (p.pose === 'sit' || p.pose === 'sitTable') {
    hipY = p.seat + 0.02;
  } else if (p.pose === 'kneel') {
    hipY = 0.43 * s + 0.07;
  } else if (p.pose === 'cook') {
    t.armL += Math.sin(time * 2.1) * 0.12; t.armR += Math.sin(time * 3.3 + 1) * 0.18;
  }
  if ((p.pose === 'sitTable' || p.pose === 'sit') && p.eating) t.armR += Math.max(0, Math.sin(time * 0.9)) * -0.7;
  if (p.pose === 'sitTable' && p.typing) { t.armL += Math.sin(time * 9) * 0.03; t.armR += Math.sin(time * 11 + 2) * 0.03; }
  if (!walking && p.pose === 'stand') { t.armL += Math.sin(time * 1.3) * 0.02; t.torso += Math.sin(time * 0.9) * 0.01; }
  const r = walking ? 16 : 7;
  J.legL.rotation.x = damp(J.legL.rotation.x, t.legL, r, dt);
  J.legR.rotation.x = damp(J.legR.rotation.x, t.legR, r, dt);
  J.kneeL.rotation.x = damp(J.kneeL.rotation.x, t.kneeL, r, dt);
  J.kneeR.rotation.x = damp(J.kneeR.rotation.x, t.kneeR, r, dt);
  J.armL.rotation.x = damp(J.armL.rotation.x, t.armL, r, dt);
  J.armR.rotation.x = damp(J.armR.rotation.x, t.armR, r, dt);
  J.armL.rotation.z = -0.08; J.armR.rotation.z = 0.08;
  J.torso.rotation.x = damp(J.torso.rotation.x, t.torso, 6, dt);
  J.head.rotation.x = damp(J.head.rotation.x, t.head + (p.lookDown || 0), 5, dt);
  J.head.rotation.y = damp(J.head.rotation.y, p.headTurn || 0, 3, dt);
  J.body.rotation.x = damp(J.body.rotation.x, t.body, 4, dt);
  J.hips.position.y = damp(J.hips.position.y, hipY, walking ? 20 : 6, dt);
}

function animateQuad(a, p, dt) {
  const J = a.J;
  const walking = p.pose === 'walk';
  const ph = p.phase;
  const tgt = walking ? [Math.sin(ph) * 0.5, Math.sin(ph + Math.PI) * 0.5, Math.sin(ph + Math.PI) * 0.5, Math.sin(ph) * 0.5] : p.pose === 'loaf' ? [-1.4, -1.4, 1.4, 1.4] : [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) J.legs[i].rotation.x = damp(J.legs[i].rotation.x, tgt[i], walking ? 14 : 5, dt);
  const by = p.pose === 'loaf' ? a.H * 0.45 : a.H + (walking ? Math.abs(Math.cos(ph)) * 0.01 : 0);
  J.body.position.y = damp(J.body.position.y, by, 6, dt);
  J.tail.rotation.z = Math.sin(p.world.realT * (walking ? 4 : 0.8)) * 0.3;
  J.head.rotation.y = damp(J.head.rotation.y, p.headTurn || 0, 2, dt);
}

// Props: small grouped meshes that take the material of whoever holds them.
export function makeProp(kind) {
  const group = new THREE.Group();
  const meshes = [];
  const add = (geo, hex) => part(group, geo, hex, meshes);
  if (kind === 'package') {
    add(new THREE.BoxGeometry(0.42, 0.3, 0.34), 0xb48a58);
    add(new THREE.BoxGeometry(0.43, 0.012, 0.08).translate(0, 0.15, 0), 0xd8c9a2);
  } else if (kind === 'pizza') {
    add(new THREE.BoxGeometry(0.42, 0.06, 0.42), 0xe9dfc6);
    add(new THREE.BoxGeometry(0.2, 0.004, 0.2).translate(0, 0.031, 0), 0xb5332a);
  } else if (kind === 'suitcase') {
    add(new THREE.BoxGeometry(0.4, 0.58, 0.24).translate(0, 0.33, 0), 0x2d4f73);
    add(new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(0, 0.76, -0.06), 0x222222);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).rotateZ(Math.PI / 2).translate(0, 0.03, -0.08), 0x111111);
  } else if (kind === 'gurney') {
    add(new THREE.BoxGeometry(0.62, 0.08, 1.95).translate(0, 0.8, 0), 0xc9ced4);
    add(new THREE.BoxGeometry(0.58, 0.08, 1.85).translate(0, 0.88, 0), 0x3b6fa8);
    add(new THREE.BoxGeometry(0.4, 0.06, 1.5).translate(0, 0.45, 0), 0x8d9399);
    for (const z of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.06, 0.75, 0.06).translate(0, 0.42, z), 0x8d9399);
    for (const x of [-0.25, 0.25]) for (const z of [-0.8, 0.8]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2).translate(x, 0.06, z), 0x111111);
  } else if (kind === 'bag') {
    add(new THREE.BoxGeometry(0.3, 0.36, 0.18).translate(0, -0.1, 0), 0xc8a46a);
  }
  return { group, meshes, kind };
}
