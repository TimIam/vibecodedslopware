// People, pets and the things they carry. A person is ten merged meshes on a jointed rig: hips,
// knees, shoulders, elbows, a bending torso and a turning head, with a face (eyes, brows, nose,
// ears), a dozen hair styles, beards, glasses and hats. Poses are joint targets that each frame
// eases toward, so sitting down, lying back, dancing and standing up blend on their own.
import * as THREE from 'three';
import { paint, damp, Kit } from './util.js';

const CAP = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
const PLACE = new THREE.MeshBasicMaterial({ color: 0xff00ff });

function part(parent, geo, hex, meshes) {
  paint(geo, hex);
  const m = new THREE.Mesh(geo, PLACE);
  m.castShadow = true;
  parent.add(m);
  meshes.push(m);
  return m;
}
function kitMesh(parent, kit, meshes) {
  const m = new THREE.Mesh(kit.build(), PLACE);
  m.castShadow = true;
  parent.add(m);
  meshes.push(m);
  return m;
}
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

export function makeAvatar(o) {
  const s = o.height / 1.72;
  const fem = !!o.fem;
  const meshes = [];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.9 * s;
  body.add(hips);
  const J = { root, body, hips };
  const th = 0.43 * s, sh = 0.43 * s;
  const lower = o.shorts ? o.skin : o.pants;
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * (fem ? 0.095 : 0.09) * s, 0, 0);
    hips.add(leg);
    const tk = new Kit();
    tk.geo(CAP(0.078 * s, th - 0.14 * s).translate(0, -th / 2, 0), o.pants);
    kitMesh(leg, tk, meshes);
    const knee = new THREE.Group();
    knee.position.y = -th;
    leg.add(knee);
    const sk = new Kit();
    sk.geo(CAP(0.058 * s, sh - 0.1 * s).translate(0, -sh / 2, 0), o.dress && !o.shorts ? o.skin : lower);
    sk.geo(new THREE.BoxGeometry(0.1 * s, 0.075 * s, 0.25 * s).translate(0, -sh + 0.012, 0.05 * s), o.shoes);
    sk.geo(new THREE.BoxGeometry(0.098 * s, 0.025 * s, 0.24 * s).translate(0, -sh - 0.02 * s + 0.012, 0.05 * s), shade(o.shoes, 0.6));
    kitMesh(knee, sk, meshes);
    J[side < 0 ? 'legL' : 'legR'] = leg;
    J[side < 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const torso = new THREE.Group();
  hips.add(torso);
  J.torso = torso;
  const bk = new Kit();
  bk.geo(new THREE.SphereGeometry(0.14 * s, 14, 10).scale(fem ? 1.24 : 1.1, 0.8, 0.78).translate(0, 0.03 * s, 0), o.dress ? o.shirt : o.pants);
  bk.geo(new THREE.BoxGeometry(fem ? 0.27 * s : 0.29 * s, 0.035 * s, 0.2 * s).translate(0, 0.1 * s, 0), o.belt ?? shade(o.pants, 0.55));
  bk.geo(CAP(0.122 * s, 0.1 * s).scale(fem ? 1.04 : 1.12, 1, 0.76).translate(0, 0.19 * s, 0), o.shirt);
  bk.geo(CAP(0.15 * s, 0.14 * s).scale(fem ? 1.12 : 1.3, 1, fem ? 0.8 : 0.74).translate(0, 0.37 * s, 0), o.shirt);
  for (const sd of [-1, 1]) bk.geo(new THREE.SphereGeometry(0.066 * s, 10, 8).translate(sd * 0.19 * s, 0.48 * s, 0), o.shirt);
  if (o.dress) bk.geo(new THREE.CylinderGeometry(0.16 * s, 0.27 * s, 0.52 * s, 16, 1, true).translate(0, -0.2 * s, 0), o.shirt);
  if (o.jacket) for (const sd of [-1, 1]) bk.geo(new THREE.BoxGeometry(0.13 * s, 0.42 * s, 0.03 * s).translate(sd * 0.1 * s, 0.3 * s, 0.11 * s), o.jacket);
  // costumes (Halloween, Santa, superheroes)
  const cos = o.costume;
  if (cos === 'ghost') bk.geo(new THREE.CylinderGeometry(0.2 * s, 0.34 * s, 1.5 * s, 14).translate(0, -0.2 * s, 0), 0xf4f4f0);
  if (cos === 'pumpkin') { bk.geo(new THREE.SphereGeometry(0.27 * s, 14, 10).scale(1.1, 0.9, 1).translate(0, 0.25 * s, 0), 0xe0701a); bk.geo(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.06 * s, 6).translate(0, 0.5 * s, 0), 0x3a5a20); }
  if (cos === 'cape' || cos === 'vampire' || cos === 'santa') {
    if (cos !== 'santa') bk.geo(new THREE.BoxGeometry(0.42 * s, 0.95 * s, 0.02 * s).translate(0, 0.0, -0.15 * s), cos === 'vampire' ? 0x101010 : o.capeColor || 0xb01a1a);
    if (cos === 'vampire') bk.geo(new THREE.BoxGeometry(0.4 * s, 0.9 * s, 0.01 * s).translate(0, 0.02 * s, -0.135 * s), 0x8a0a0a);
  }
  if (cos === 'santa') { bk.geo(new THREE.BoxGeometry(0.33 * s, 0.05 * s, 0.24 * s).translate(0, 0.1 * s, 0), 0x111111); bk.geo(new THREE.BoxGeometry(0.06 * s, 0.4 * s, 0.02 * s).translate(0, 0.33 * s, 0.12 * s), 0xf4f4f0); }
  kitMesh(torso, bk, meshes);
  const head = new THREE.Group();
  head.position.y = 0.6 * s;
  torso.add(head);
  J.head = head;
  const hk = new Kit();
  const skinD = shade(o.skin, 0.88);
  hk.geo(new THREE.CylinderGeometry(0.046 * s, 0.054 * s, 0.1 * s, 10).translate(0, 0.02 * s, 0), o.skin);
  hk.geo(new THREE.SphereGeometry(0.105 * s, 18, 14).scale(0.92, 1.1, 1.0).translate(0, 0.15 * s, 0), o.skin);
  hk.geo(new THREE.SphereGeometry(0.06 * s, 10, 8).scale(1.05, 0.7, 0.9).translate(0, 0.09 * s, 0.035 * s), o.skin);
  for (const sd of [-1, 1]) {
    hk.geo(new THREE.SphereGeometry(0.026 * s, 8, 6).scale(0.45, 1, 0.8).translate(sd * 0.097 * s, 0.15 * s, -0.005 * s), skinD);
    hk.geo(new THREE.SphereGeometry(0.0115 * s, 8, 6).translate(sd * 0.034 * s, 0.168 * s, 0.09 * s), 0x18120e);
    hk.geo(new THREE.BoxGeometry(0.032 * s, 0.007 * s, 0.012 * s).translate(sd * 0.035 * s, 0.191 * s, 0.093 * s), o.brow ?? o.hair);
  }
  hk.geo(new THREE.BoxGeometry(0.022 * s, 0.042 * s, 0.03 * s).translate(0, 0.143 * s, 0.103 * s), skinD);
  hk.geo(new THREE.BoxGeometry(0.034 * s, 0.006 * s, 0.008 * s).translate(0, 0.105 * s, 0.097 * s), fem && o.lips ? o.lips : shade(o.skin, 0.62));
  if (o.glasses) {
    for (const sd of [-1, 1]) hk.geo(new THREE.TorusGeometry(0.019 * s, 0.003 * s, 4, 12).translate(sd * 0.035 * s, 0.168 * s, 0.103 * s), 0x1a1a1a);
    hk.geo(new THREE.BoxGeometry(0.03 * s, 0.004 * s, 0.004 * s).translate(0, 0.17 * s, 0.104 * s), 0x1a1a1a);
  }
  const cap = (r, t, tilt = -0.42) => new THREE.SphereGeometry(r * s, 18, 10, 0, Math.PI * 2, 0, Math.PI * t).rotateX(tilt).translate(0, 0.165 * s, -0.012 * s);
  const hs = o.hairStyle;
  if (hs === 'short') hk.geo(cap(0.113, 0.52), o.hair);
  else if (hs === 'buzz') hk.geo(cap(0.108, 0.46, -0.5), o.hair);
  else if (hs === 'long' || hs === 'bob') {
    hk.geo(cap(0.115, 0.56, -0.3), o.hair);
    const L = hs === 'long' ? 0.22 : 0.08;
    hk.geo(CAP(0.088 * s, L * s).scale(1.22, 1, 0.66).translate(0, (0.1 - L / 2) * s, -0.06 * s), o.hair);
    for (const sd of [-1, 1]) hk.geo(CAP(0.03 * s, (L * 0.7 + 0.04) * s).translate(sd * 0.09 * s, (0.12 - L * 0.35) * s, 0.0), o.hair);
  } else if (hs === 'bun') {
    hk.geo(cap(0.114, 0.55, -0.3), o.hair);
    hk.geo(new THREE.SphereGeometry(0.052 * s, 12, 8).translate(0, 0.265 * s, -0.07 * s), o.hair);
  } else if (hs === 'pony') {
    hk.geo(cap(0.114, 0.55, -0.3), o.hair);
    hk.geo(new THREE.SphereGeometry(0.03 * s, 8, 6).translate(0, 0.205 * s, -0.115 * s), o.hair);
    hk.geo(CAP(0.028 * s, 0.15 * s).rotateX(0.3).translate(0, 0.1 * s, -0.14 * s), o.hair);
  } else if (hs === 'curly') {
    hk.geo(new THREE.IcosahedronGeometry(0.132 * s, 1).scale(1.0, 0.92, 0.84).translate(0, 0.19 * s, -0.04 * s), o.hair);
  }
  if (o.beard) {
    hk.geo(new THREE.SphereGeometry(0.112 * s, 16, 8, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.55, Math.PI * 0.3).scale(0.94, 1.1, 1.02).translate(0, 0.15 * s, 0), o.hair);
    hk.geo(new THREE.BoxGeometry(0.05 * s, 0.012 * s, 0.012 * s).translate(0, 0.118 * s, 0.1 * s), o.hair);
  }
  if (o.hatKind === 'witch') {
    hk.geo(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.012 * s, 18).translate(0, 0.235 * s, 0), 0x141018);
    hk.geo(new THREE.ConeGeometry(0.1 * s, 0.32 * s, 14).rotateX(-0.25).translate(0, 0.39 * s, -0.03 * s), 0x141018);
  } else if (o.hatKind === 'santa') {
    hk.geo(new THREE.ConeGeometry(0.11 * s, 0.26 * s, 14).rotateX(-0.5).translate(0, 0.33 * s, -0.06 * s), 0xc01a1a);
    hk.geo(new THREE.TorusGeometry(0.105 * s, 0.022 * s, 6, 16).rotateX(Math.PI / 2).translate(0, 0.235 * s, -0.005 * s), 0xf4f4f0);
    hk.geo(new THREE.SphereGeometry(0.03 * s, 8, 6).translate(0, 0.42 * s, -0.17 * s), 0xf4f4f0);
  } else if (o.hatKind === 'ears') {
    for (const sd of [-1, 1]) hk.geo(new THREE.ConeGeometry(0.035 * s, 0.07 * s, 4).translate(sd * 0.06 * s, 0.27 * s, -0.01 * s), 0x141414);
  } else if (o.hat) {
    hk.geo(new THREE.CylinderGeometry(0.112 * s, 0.118 * s, 0.075 * s, 16).translate(0, 0.25 * s, -0.005 * s), o.hat);
    hk.geo(new THREE.BoxGeometry(0.17 * s, 0.014 * s, 0.11 * s).translate(0, 0.222 * s, 0.1 * s), o.hat);
  }
  if (o.costume === 'ghost') {
    hk.geo(new THREE.SphereGeometry(0.135 * s, 14, 10).scale(1, 1.15, 1).translate(0, 0.17 * s, 0), 0xf4f4f0);
    for (const sd of [-1, 1]) hk.geo(new THREE.SphereGeometry(0.022 * s, 8, 6).scale(0.8, 1.3, 0.4).translate(sd * 0.045 * s, 0.19 * s, 0.128 * s), 0x111111);
  }
  if (o.mask) hk.geo(new THREE.BoxGeometry(0.15 * s, 0.035 * s, 0.02 * s).translate(0, 0.17 * s, 0.1 * s), o.mask);
  kitMesh(head, hk, meshes);
  for (const side of [-1, 1]) {
    const sh2 = new THREE.Group();
    sh2.position.set(side * 0.21 * s, 0.49 * s, 0);
    torso.add(sh2);
    const ak = new Kit();
    ak.geo(CAP(0.054 * s, 0.2 * s).translate(0, -0.14 * s, 0), o.sleeves === false ? o.skin : o.shirt);
    kitMesh(sh2, ak, meshes);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28 * s;
    sh2.add(elbow);
    const fk = new Kit();
    fk.geo(CAP(0.045 * s, 0.18 * s).translate(0, -0.13 * s, 0), o.sleeves === false || o.shortSleeves ? o.skin : o.shirt);
    fk.geo(new THREE.SphereGeometry(0.046 * s, 10, 8).scale(0.78, 1.15, 0.55).translate(0, -0.29 * s, 0), o.skin);
    kitMesh(elbow, fk, meshes);
    const hand = new THREE.Group();
    hand.position.y = -0.3 * s;
    elbow.add(hand);
    J[side < 0 ? 'armL' : 'armR'] = sh2;
    J[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
    J[side < 0 ? 'handL' : 'handR'] = hand;
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


// Joint targets per pose. Shoulders (aL/aR) and elbows (eL/eR) swing forward when negative,
// zL/zR raise the arms out sideways, lzL/lzR spread the legs.
const BASE = { legL: 0, legR: 0, kneeL: 0.04, kneeR: 0.04, aL: 0.05, aR: 0.05, eL: -0.12, eR: -0.12, zL: 0, zR: 0, lzL: 0, lzR: 0, torso: 0, twist: 0, head: 0, body: 0 };
const P = (o) => ({ ...BASE, ...o });
const POSES = {
  stand: P({}),
  sit: P({ legL: -1.5, legR: -1.5, kneeL: 1.5, kneeR: 1.5, aL: -0.3, aR: -0.3, eL: -0.9, eR: -0.9, torso: -0.08, head: 0.05 }),
  sitTable: P({ legL: -1.5, legR: -1.5, kneeL: 1.45, kneeR: 1.45, aL: -0.45, aR: -0.45, eL: -1.15, eR: -1.15, torso: 0.12, head: 0.15 }),
  lie: P({ kneeL: 0.05, kneeR: 0.05, eL: -0.1, eR: -0.1, head: -0.1, body: -Math.PI / 2 }),
  collapse: P({ legL: -0.3, legR: 0.1, kneeL: 0.6, kneeR: 0.2, aL: -0.4, aR: 0.6, eL: -0.6, eR: -0.2, head: 0.3, body: -Math.PI / 2 }),
  kneel: P({ kneeL: 1.55, kneeR: 1.55, aL: -0.6, aR: -0.5, eL: -0.8, eR: -0.9, torso: 0.45, head: 0.35 }),
  cook: P({ aL: -0.45, aR: -0.5, eL: -1.15, eR: -1.2, torso: 0.1, head: 0.35 }),
  reach: P({ aR: -1.4, eR: -0.25, torso: 0.05, head: 0.1 }),
  carry: P({ aL: -0.55, aR: -0.55, eL: -1.1, eR: -1.1 }),
  phone: P({ aR: -0.35, eR: -2.35, zR: 0.25, head: -0.05 }),
  push: P({ aL: -0.85, aR: -0.85, eL: -0.6, eR: -0.6, torso: 0.15 }),
  wave: P({ aR: -2.5, eR: -0.5, zR: 0.35 }),
  broom: P({ aL: -2.75, aR: -2.75, eL: -0.35, eR: -0.35, head: -0.45 }),
  sing: P({ aR: -0.45, eR: -2.25, aL: -0.2, zL: -0.5, eL: -0.4, head: -0.15 }),
  smoke: P({ legL: -1.5, legR: -1.5, kneeL: 1.4, kneeR: 1.4, aL: -0.3, eL: -0.9, aR: -0.3, eR: -0.9, torso: 0.1, head: 0 }),
  dance: P({}), jacks: P({}),
};

export function animateAvatar(a, p, dt) {
  const J = a.J;
  if (a.kind === 'quad') return animateQuad(a, p, dt);
  const s = a.s;
  const walking = p.pose === 'walk' || p.pose === 'walkCarry' || p.pose === 'walkPush';
  const base = walking ? (p.pose === 'walkCarry' ? POSES.carry : p.pose === 'walkPush' ? POSES.push : POSES.stand) : (POSES[p.pose] || POSES.stand);
  const t = { ...base };
  let hipY = 0.9 * s;
  const time = p.world.realT + (p.phaseOff || (p.phaseOff = Math.random() * 20));
  if (walking) {
    const ph = p.phase;
    const sw = Math.sin(ph) * 0.5;
    t.legL = sw; t.legR = -sw;
    t.kneeL = 0.08 + 0.75 * Math.max(0, -Math.cos(ph));
    t.kneeR = 0.08 + 0.75 * Math.max(0, Math.cos(ph));
    if (p.pose === 'walk') { t.aL = -sw * 0.75; t.aR = sw * 0.75; t.eL = -0.25 + Math.min(0, -sw * 0.4); t.eR = -0.25 + Math.min(0, sw * 0.4); }
    t.twist = sw * 0.12;
    hipY += 0.022 * Math.abs(Math.cos(ph)) - 0.01;
  } else if (p.pose === 'sit' || p.pose === 'sitTable' || p.pose === 'smoke') {
    hipY = p.seat + 0.02;
  } else if (p.pose === 'kneel') {
    hipY = 0.43 * s + 0.07;
  } else if (p.pose === 'cook') {
    t.aL += Math.sin(time * 2.1) * 0.1; t.eR += Math.sin(time * 3.3 + 1) * 0.25;
    if (p.dancer) { hipY += Math.abs(Math.sin(time * 4.2)) * 0.03 - 0.015; t.twist = Math.sin(time * 2.1) * 0.25; t.head += Math.sin(time * 4.2) * 0.12; }
  } else if (p.pose === 'dance') {
    const b = time * 4.4;
    hipY += -0.04 + Math.abs(Math.sin(b)) * 0.05;
    t.kneeL = 0.25 + 0.25 * Math.max(0, Math.sin(b)); t.kneeR = 0.25 + 0.25 * Math.max(0, -Math.sin(b));
    t.legL = -0.12 - 0.1 * Math.max(0, Math.sin(b)); t.legR = -0.12 - 0.1 * Math.max(0, -Math.sin(b));
    t.aL = -0.8 + Math.sin(b * 0.5) * 0.9; t.aR = -0.8 - Math.sin(b * 0.5) * 0.9;
    t.eL = -1.3 + Math.sin(b) * 0.4; t.eR = -1.3 - Math.sin(b) * 0.4;
    t.zL = -0.3; t.zR = 0.3;
    t.twist = Math.sin(b * 0.5) * 0.35; t.head = Math.sin(b) * 0.15;
  } else if (p.pose === 'jacks') {
    const b = (Math.sin(time * 5.2) + 1) / 2;
    t.zL = -0.15 - b * 2.7; t.zR = 0.15 + b * 2.7; t.eL = t.eR = -0.15;
    t.lzL = -0.05 - b * 0.28; t.lzR = 0.05 + b * 0.28;
    hipY += -0.02 + b * 0.05;
  } else if (p.pose === 'wave') {
    t.eR += Math.sin(time * 9) * 0.45;
    t.zR += Math.sin(time * 9) * 0.15;
  } else if (p.pose === 'broom') {
    const b = Math.max(0, Math.sin(time * 7));
    t.aL += -b * 0.2; t.aR += -b * 0.2; t.eL += b * 0.4; t.eR += b * 0.4;
    hipY += b * 0.02;
  } else if (p.pose === 'sing') {
    t.twist = Math.sin(time * 1.6) * 0.25; t.torso += Math.sin(time * 3.2) * 0.05; t.head += Math.sin(time * 1.6) * 0.2;
    t.zL += Math.sin(time * 1.6) * 0.4;
  }
  if (walking && p.phoneWalk) { t.aR = -0.35; t.eR = -2.35; t.zR = 0.25; }
  if (p.pose === 'smoke') {
    const c = (time % 7) / 7;
    if (c < 0.22) { t.aR = -0.45; t.eR = -2.3; t.head = -0.12; }
  }
  if ((p.pose === 'sitTable' || p.pose === 'sit') && p.eating) { const k = Math.max(0, Math.sin(time * 0.9)); t.eR += -1.0 * k; t.aR += -0.3 * k; }
  if (p.pose === 'sitTable' && p.typing) { t.eL += Math.sin(time * 9) * 0.04; t.eR += Math.sin(time * 11 + 2) * 0.04; }
  if (!walking && p.pose === 'stand') { t.aL += Math.sin(time * 1.3) * 0.02; t.torso += Math.sin(time * 0.9) * 0.01; t.head += Math.sin(time * 0.37) * 0.05; }
  const fast = walking || p.pose === 'dance' || p.pose === 'jacks' || p.pose === 'wave' || p.pose === 'broom';
  const r = fast ? 16 : 7;
  const d = (o, k, v, rate = r) => { o[k] = damp(o[k], v, rate, dt); };
  d(J.legL.rotation, 'x', t.legL); d(J.legR.rotation, 'x', t.legR);
  d(J.legL.rotation, 'z', t.lzL); d(J.legR.rotation, 'z', t.lzR);
  d(J.kneeL.rotation, 'x', t.kneeL); d(J.kneeR.rotation, 'x', t.kneeR);
  d(J.armL.rotation, 'x', t.aL); d(J.armR.rotation, 'x', t.aR);
  d(J.armL.rotation, 'z', -0.07 + t.zL); d(J.armR.rotation, 'z', 0.07 + t.zR);
  d(J.elbowL.rotation, 'x', t.eL); d(J.elbowR.rotation, 'x', t.eR);
  d(J.torso.rotation, 'x', t.torso, 6); d(J.torso.rotation, 'y', t.twist, fast ? 10 : 4);
  d(J.head.rotation, 'x', t.head + (p.lookDown || 0), 5);
  d(J.head.rotation, 'y', p.headTurn || 0, 3);
  d(J.body.rotation, 'x', t.body, 4);
  J.hips.position.y = damp(J.hips.position.y, hipY, fast ? 20 : 6, dt);
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
  } else if (kind === 'broom') {
    add(new THREE.CylinderGeometry(0.014, 0.014, 1.35, 6).translate(0, 0.35, 0), 0x9a7a4a);
    add(new THREE.BoxGeometry(0.26, 0.12, 0.06).translate(0, 1.07, 0), 0xc8a050);
  } else if (kind === 'umbrella') {
    const col = [0x15161a, 0x15161a, 0x1c2a4a, 0x8a1a1a, 0x2a4a2a, 0xd8b020, 0x5a2a6a][Math.floor(Math.random() * 7)];
    add(new THREE.ConeGeometry(0.56, 0.24, 12).translate(0, 0.42, 0), col);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 5).translate(0, 0.08, 0), 0x2a2a2a);
  } else if (kind === 'vacuum') {
    add(new THREE.BoxGeometry(0.3, 0.12, 0.2).translate(0, 0.06, 0.25), 0x8a2a2a);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 5).rotateX(-0.6).translate(0, 0.42, 0.02), 0x2a2a2a);
  } else if (kind === 'lawnchair') {
    add(new THREE.BoxGeometry(0.5, 0.04, 0.45).translate(0, 0.42, 0), 0x2a6a9a);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.04).rotateX(-0.25).translate(0, 0.68, -0.25), 0x2a6a9a);
    for (const sx of [-0.23, 0.23]) { add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5).rotateX(0.5).translate(sx, 0.22, 0), 0xb8b8b8); add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5).rotateX(-0.5).translate(sx, 0.22, 0), 0xb8b8b8); }
  } else if (kind === 'pail') {
    add(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 12).translate(0, -0.12, 0.05), 0xe0701a);
    add(new THREE.TorusGeometry(0.08, 0.008, 4, 12, Math.PI).translate(0, -0.05, 0.05), 0x1a1a1a);
  } else if (kind === 'bowl') {
    add(new THREE.CylinderGeometry(0.17, 0.1, 0.08, 14).translate(0, -0.1, 0.05), 0xd8a030);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.05, 0.03, 0.03).translate(Math.cos(i) * 0.08, -0.05, 0.05 + Math.sin(i) * 0.08), [0xff3a2a, 0x7a3aff, 0xffd030][i % 3]);
  } else if (kind === 'plate') {
    add(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 14).translate(0, -0.08, 0.04), 0xf2f0ea);
    add(new THREE.SphereGeometry(0.05, 8, 6).scale(1.3, 0.5, 1).translate(0, -0.06, 0.04), 0x8a5a2a);
  } else if (kind === 'turkey') {
    add(new THREE.CylinderGeometry(0.24, 0.2, 0.025, 18), 0xe8e4da);
    add(new THREE.SphereGeometry(0.13, 12, 8).scale(1.25, 0.75, 1).translate(0, 0.09, 0), 0x9a5a22);
    for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.02, 0.035, 0.12, 6).rotateZ(sd * 1.1).translate(sd * 0.14, 0.12, 0.05), 0x8a4a1a);
  } else if (kind === 'cup') {
    add(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 8).translate(0, 0.0, 0.03), 0xd8301e);
  } else if (kind === 'bag') {
    add(new THREE.BoxGeometry(0.3, 0.36, 0.18).translate(0, -0.1, 0), 0xc8a46a);
  }
  return { group, meshes, kind };
}
