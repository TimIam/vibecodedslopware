// Ride and facility builders. Each returns { group, anchors, update(dt), setMode(mode), front, size }.
// anchors maps finding id → Object3D placed where that inspection point is (children of moving parts move
// with them). Modes: 'run' (open, guests riding), 'stop' (being inspected), 'test' (one cycle with dummies).
// Visual tells for planted defects are applied here.
import * as THREE from 'three';
import { part, batchAdd, batchAddMatrix, signTex, heightSignTex, faceMat, rustMat, PARTS } from './kit.js';
import { makeRng, hashStr } from './rng.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const SHIRTS = ['#e8453c', '#3c7de8', '#f2c230', '#35b36b', '#ffffff', '#ff7ab6', '#8a5cf0', '#ff9a3c', '#2ac0c9', '#202020', '#c9e04a'];
const PANTS = ['#3a4f7a', '#2c3550', '#bfa982', '#404040', '#6b4f3a', '#1f2a40'];
const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#9c6643', '#6e4429', '#f5d6bd'];

function anchor(parent, x, y, z, map, id) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); map[id] = o; return o;
}
function pivot(parent, obj, hx, hy, hz) {
  // hinge group at (hx,hy,hz) in parent space, obj re-offset so it stays put at angle 0
  const g = new THREE.Group(); g.position.set(hx, hy, hz); parent.add(g);
  obj.position.sub(V(hx, hy, hz)); g.add(obj); return g;
}
const shirtCache = new Map();
function seated(rng, kind = 'rider') {
  const o = part(kind);
  if (kind === 'rider') {
    const sh = rng.pick(SHIRTS), pa = rng.pick(PANTS), sk = rng.pick(SKIN), key = sh + pa + sk;
    o.traverse(m => {
      if (!m.isMesh) return;
      const n = m.material.name, col = n === 'shirt' ? sh : n === 'pants' ? pa : n === 'skin' ? sk : null;
      if (!col) return;
      const k = n + col;
      if (!shirtCache.has(k)) { const mm = m.material.clone(); mm.color.set(col); shirtCache.set(k, mm); }
      m.material = shirtCache.get(k);
    });
  }
  return o;
}
function seatPair(parent, rng, x, y, z, ry = 0) {
  const r = seated(rng, 'rider'), d = seated(rng, 'dummy');
  for (const o of [r, d]) { o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); }
  d.visible = false;
  return { r, d };
}
function showRiders(seats, mode) {
  for (const s of seats) { s.r.visible = mode === 'run'; s.d.visible = mode === 'test'; }
}

function tellOf(tg, kind, pred = () => true) { return tg.findings.filter(f => f.group === 'point' && f.kind === kind && pred(f)); }
function F(tg, kind, pred) { return tellOf(tg, kind, pred)[0]; }

// footing with 4 anchor bolts (some missing) and rust / crack overlays from its finding
function footing(group, tg, f, x, y, z, legDir = null) {
  const missing = f?.tell === 'bolt' ? f.extra.boltsMissing : 0;
  const skip = new Set(); while (skip.size < missing) skip.add(Math.floor(Math.random() * 4));
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], k) => {
    if (skip.has(k)) return;
    const p = group.localToWorld(V(x + sx * 0.34, y + 0.02, z + sz * 0.34));
    batchAdd('bolt', p.x, p.y, p.z, Math.random() * 3, 1.4);
  });
  if (f?.tell === 'rust' || f?.tell === 'crack') {
    const dir = (legDir || V(0, 1, 0)).clone().normalize();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(f.tell === 'rust' ? 0.34 : 0.3, 0.36, 1.4, 16, 1, true),
      f.tell === 'rust' ? rustMat() : new THREE.MeshStandardMaterial({ color: '#000', transparent: true, opacity: 0 }));
    sleeve.position.set(x, y, z).addScaledVector(dir, 0.75);
    sleeve.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
    sleeve.castShadow = true; group.add(sleeve);
    if (f.tell === 'rust') {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), rustMat());
      stain.rotation.x = -Math.PI / 2; stain.position.set(x, y + 0.03, z); group.add(stain);
    } else {
      const c = part('crack'); c.position.copy(sleeve.position).addScaledVector(dir, -0.2);
      c.quaternion.copy(sleeve.quaternion); c.translateZ(0.31); c.rotateZ(0.5); c.scale.set(1.2, 1, 1.4); group.add(c);
    }
  }
}

function fenceLoop(group, tg, pts, gapFront = true) {
  // pts: polygon (local xz), closed. One 1 m panel per metre; front gap near +Z; tell removes two panels.
  const fF = F(tg, 'fence');
  const panels = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L));
    for (let k = 0; k < n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      panels.push({ x, z, ang: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), len: L / n });
    }
  }
  const front = panels.map((p, i) => [i, p.z - Math.abs(p.x) * 2]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(q => q[0]);
  const skip = new Set(gapFront ? front : []);
  let gapAt = null;
  if (fF?.tell === 'fence') {
    const back = panels.map((p, i) => [i, -p.z + Math.abs(p.x) * 0.3]).sort((a, b) => b[1] - a[1]);
    const i0 = back[Math.floor(Math.random() * 4)][0];
    skip.add(i0); skip.add((i0 + 1) % panels.length); gapAt = panels[i0];
  }
  panels.forEach((p, i) => {
    if (skip.has(i)) return;
    const w = group.localToWorld(V(p.x, 0, p.z));
    const m = new THREE.Matrix4().compose(w, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), p.ang + group.rotation.y), V(p.len, 1, 1));
    batchAddMatrix('fence', m);
  });
  const fp = gapAt || panels[Math.floor(panels.length * 0.6)];
  return fp ? V(fp.x, 0.9, fp.z) : V(0, 0.9, 0);
}
const rectPts = (hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
const circlePts = (r, n = 20) => Array.from({ length: n }, (_, i) => [Math.cos(TAU * i / n) * r, Math.sin(TAU * i / n) * r]);

function entrance(group, tg, z, A, opts = {}) {
  // ride sign, height sign, control panel at the front (local +z)
  const s = part('ride_sign', { a: tg.colors.a }); s.position.set(0, 0, z + 1.2); group.add(s);
  const face = part('ride_sign_face'); face.position.copy(s.position);
  face.traverse(m => { if (m.isMesh) m.material = faceMat(signTex(tg.name.toUpperCase(), { bg: '#1b2238', border: tg.colors.b })); });
  group.add(face);
  const fs = F(tg, 'sign');
  if (fs) {
    const hs = part('height_sign'); hs.position.set(2.4, 0, z + 1.6); group.add(hs);
    const hf = part('height_face'); hf.position.copy(hs.position);
    hf.traverse(m => { if (m.isMesh) m.material = faceMat(heightSignTex(tg.spec.minHeight)); }); group.add(hf);
    const arm = part('height_arm'); arm.position.set(2.46, tg.spec.signMark * 0.0254, z + 1.6); group.add(arm);
    anchor(group, 2.4, 1.3, z + 1.6, A, fs.id);
  }
  const fp = F(tg, 'panel');
  if (fp) {
    const p = part('elec_panel'); p.position.set(-3.2, 0, z + 0.4); group.add(p);
    const d = part('elec_door'); d.position.copy(p.position);
    const g = pivot(group, d, -3.2 - 0.4, 0, z + 0.4 + 0.18);
    if (fp.tell === 'panel') g.rotation.y = -1.9;
    anchor(group, -3.2, 1.0, z + 0.4, A, fp.id);
  }
}

// ================================================================================================ FERRIS
function buildFerris(tg, rng, group) {
  const A = {}, paint = { a: tg.colors.a, b: tg.colors.b };
  group.add(part('fw_frame', paint));
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.62, 3.0), PARTS.fw_frame.children?.[0]?.material || new THREE.MeshStandardMaterial());
  deck.material = new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.8 }); deck.position.set(0, 0.31, 0); deck.receiveShadow = deck.castShadow = true; group.add(deck);
  const wheel = part('fw_wheel', paint); const WS = 0.94; wheel.scale.setScalar(WS); wheel.position.set(0, 14, 0); group.add(wheel);
  const motor = part('fw_motor'); group.add(motor);
  const fd = F(tg, 'drive');
  if (fd?.tell !== 'guard') group.add(part('fw_guard', paint));
  anchor(group, 2.6, 1.6, -0.6, A, fd.id);
  const gonds = [], seats = [];
  tellOf(tg, 'gondola').forEach((f, i) => {
    const g = part('fw_gondola', paint); group.add(g);
    const door = part('fw_door', paint);
    const piv = pivot(g, door, -0.39, 0, 0.72);
    if (f.tell === 'door') piv.rotation.y = -1.3;
    anchor(g, 0, -2.0, 0, A, f.id);
    const s1 = seatPair(g, rng, -0.35, -2.4, 0.45, Math.PI), s2 = seatPair(g, rng, 0.35, -2.4, -0.25);
    seats.push(s1, s2);
    gonds.push(g);
  });
  ['A', 'B', 'C', 'D'].forEach((L, k) => {
    const f = F(tg, 'support', q => q.anchor.foot === k);
    const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1;
    const legDir = V(sx * 1.85 - sx * 2.6, 14 - 0.3, -sz * 5.6 * 0 - sz * 5.6 * 0 + (0 - sz * 5.6));
    footing(group, tg, f, sx * 2.6, 0.42, sz * 5.6, legDir);
    anchor(group, sx * 2.6, 0.8, sz * 5.6, A, f.id);
  });
  const fl = F(tg, 'level'); anchor(group, 0, 0.7, 1.6, A, fl.id);
  if (fl.tell === 'tilt') group.userData.tilt = fl.extra.tilt;
  anchor(group, 1.85, 14, 0, A, F(tg, 'bearing').id);
  const fz = 8.5;
  const fenceP = fenceLoop(group, tg, rectPts(4.6, 7.5));
  anchor(group, fenceP.x, fenceP.y, fenceP.z, A, F(tg, 'fence').id);
  entrance(group, tg, fz, A);
  let ang = rng.range(0, TAU), w = 0, target = 1;
  const st = { mode: 'run', t: 0 };
  function place() {
    gonds.forEach((g, i) => {
      const a = TAU * i / 16 + ang, R = 11 * WS;
      g.position.set(0, 14 + Math.sin(a) * R, -Math.cos(a) * R);
      g.rotation.x = Math.sin(st.t * 0.9 + i) * 0.03 * w;
    });
  }
  place();
  return {
    group, anchors: A, front: fz, size: 18, focusY: 9, seats,
    setMode(m) { st.mode = m; showRiders(seats, m); target = m === 'stop' ? 0 : 1; st.t = 0; },
    update(dt) {
      st.t += dt;
      const rated = (tg.spec.testRpm || tg.spec.rated * 0.9) / 60 * TAU;
      w += (target - w) * Math.min(1, dt * 0.6);
      ang += w * rated * dt * (st.mode === 'test' ? 1 : 0.8);
      wheel.rotation.x = -ang;
      place();
    },
    testDuration: 9,
  };
}

// ================================================================================================ DROP TOWER
function buildDrop(tg, rng, group) {
  const A = {}, paint = { a: tg.colors.a, b: tg.colors.b };
  const n = tg.spec.sections;
  group.add(part('dt_base', paint));
  for (let k = 0; k < n; k++) { const s = part('dt_section', paint); s.position.y = 0.95 + 4 * k; group.add(s); }
  const top = part('dt_top', paint); top.position.y = 0.95 + 4 * n; group.add(top);
  const ff = F(tg, 'fins');
  [[0, 1.12, Math.PI / 2], [1.12, 0, 0], [0, -1.12, Math.PI / 2], [-1.12, 0, 0]].forEach(([x, z, r], i) => {
    if (ff.tell === 'fin' && ff.extra.fin === i) return;
    const f = part('dt_fin'); f.position.set(x, 0.95, z); f.rotation.y = r; group.add(f);
  });
  anchor(group, 1.2, 3.5, 0.2, A, ff.id);
  const car = part('dt_carriage', paint); group.add(car);
  const seats = [];
  tellOf(tg, 'harness').forEach((f, i) => {
    const a = TAU * i / 12, phi = a + Math.PI / 2;
    const h = part('dt_harness', paint);
    const g = new THREE.Group(); g.rotation.y = phi; car.add(g);
    const piv = pivot(g, h, 0, 1.18, 2.2);
    if (f.tell === 'bar') piv.rotation.x = 1.1;
    const p = V(Math.cos(a) * 2.3, 0.08, -Math.sin(a) * 2.3);
    seats.push(seatPair(car, rng, p.x, p.y, p.z, phi));
    anchor(car, Math.cos(a) * 2.5, 0.7, -Math.sin(a) * 2.5, A, f.id);
  });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.8, roughness: 0.4 }));
  cable.position.set(0.55, 0, 0.55); group.add(cable);
  anchor(group, 0.6, 8, 0.6, A, F(tg, 'cable').id);
  const fb = F(tg, 'support', q => q.anchor.foot === 0);
  footing(group, tg, fb, 3.2, 0.72, 2.4, V(-0.4, 1, -0.3)); anchor(group, 3.2, 1.0, 2.4, A, fb.id);
  for (const h of [12, 24]) {
    const f = F(tg, 'support', q => q.anchor.splice === h);
    const yy = Math.min(h, 4 * n - 2) + 0.95;
    anchor(group, 0.82, yy, 0.82, A, f.id);
    if (f.tell === 'crack' || f.tell === 'rust') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 10), rustMat()); m.position.set(0.8, yy, 0.8); group.add(m);
    }
    if (f.tell === 'bolt') { /* a missing splice bolt is too small to see from the ground */ }
  }
  const fz = 6.5;
  const fp = fenceLoop(group, tg, circlePts(5.6, 16)); anchor(group, fp.x, fp.y, fp.z, A, F(tg, 'fence').id);
  entrance(group, tg, fz, A);
  const st = { mode: 'run', t: rng.range(0, 40), y: 1.7 };
  const Htop = 1.7 + tg.spec.dropH;
  function cycle(t) {
    // 0–26 lift, 26–32 hold, fall, brake, 40–48 unload
    const tf = Math.sqrt(2 * (tg.spec.dropH * 0.68 - (tg.spec.margin || 3)) / 9.81);
    if (t < 26) return 1.7 + tg.spec.dropH * (0.5 - 0.5 * Math.cos(Math.PI * t / 26));
    if (t < 32) return Htop;
    if (t < 32 + tf) { const q = t - 32; return Htop - 0.5 * 9.81 * q * q; }
    const yb = Htop - 0.5 * 9.81 * tf * tf, q = t - 32 - tf;
    const stop = 1.7 + Math.max(0, (tg.spec.margin ?? 3) - 3) * 0.4;
    return stop + (yb - stop) * Math.exp(-q * 3.2);
  }
  function place() { car.position.y = st.y; cable.scale.y = Math.max(0.1, 0.95 + 4 * n - st.y - 1.2); cable.position.y = st.y + 1.2 + cable.scale.y / 2; }
  place();
  return {
    group, anchors: A, front: fz, size: 10 + n * 2, focusY: Math.min(16, n * 2), seats,
    setMode(m) { st.mode = m; showRiders(seats, m); st.t = m === 'test' ? 0 : st.t; },
    update(dt) {
      if (st.mode === 'stop') { st.y += (1.7 - st.y) * Math.min(1, dt * 0.5); place(); return; }
      st.t += dt;
      if (st.t > 50) st.t = st.mode === 'test' ? 50 : 0;
      st.y = cycle(st.t);
      place();
    },
    testDuration: 44, testSpeed: 1,
  };
}

// ================================================================================================ SWING RIDE
function buildSwing(tg, rng, group) {
  const A = {}, paint = { a: tg.colors.a, b: tg.colors.b, ca: tg.colors.a, cb: '#f5efe2' };
  group.add(part('sw_tower', paint));
  const canopy = part('sw_canopy', paint); canopy.position.y = 10.3; group.add(canopy);
  const seatObjs = [], seats = [];
  tellOf(tg, 'seat').forEach((f, i) => {
    const s = part('sw_seat', paint); group.add(s);
    if (f.tell !== 'belt') { const b = part('sw_belt'); s.add(b); }
    seats.push(seatPair(s, rng, 0, -4.68, 0.02, 0));
    anchor(s, 0, -4.6, 0, A, f.id);
    seatObjs.push(s);
  });
  anchor(group, 0, 0.9, 3.1, A, F(tg, 'level').id);
  const fl = F(tg, 'level'); if (fl.tell === 'tilt') group.userData.tilt = fl.extra.tilt;
  anchor(group, 0, 10.0, 0.6, A, F(tg, 'bearing').id);
  // the obstacle in the swept envelope
  const ob = tg.spec.obstacle;
  const obj = ob.kind === 'tree' ? part('tree_a') : part('lamp');
  const ox = Math.cos(ob.ang) * ob.dist, oz = Math.sin(ob.ang) * ob.dist;
  obj.position.set(ox, 0, oz); group.add(obj);
  anchor(group, ox, 3.2, oz, A, F(tg, 'envelope').id);
  const fz = 13.5;
  const fp = fenceLoop(group, tg, circlePts(12.4, 26)); anchor(group, fp.x, fp.y, fp.z, A, F(tg, 'fence').id);
  entrance(group, tg, fz, A);
  const st = { mode: 'run', ang: 0, w: 0, target: 1, t: rng.range(0, 30) };
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  function place() {
    const rpm = tg.spec.testRpm && st.mode === 'test' ? tg.spec.testRpm : tg.spec.rated * 0.92;
    const om = st.w * rpm * TAU / 60;
    let sw = 0.05; for (let k = 0; k < 8; k++) sw = Math.atan(om * om * (5.4 + 5 * Math.sin(sw)) / 9.81);
    seatObjs.forEach((s, i) => {
      const b = st.ang + TAU * i / 16;
      s.position.set(Math.cos(b) * 5.4, 10.15, Math.sin(b) * 5.4);
      q1.setFromAxisAngle(V(0, 1, 0), -b); q2.setFromAxisAngle(V(0, 0, 1), sw + Math.sin(st.t * 2 + i) * 0.02 * st.w);
      s.quaternion.copy(q1).multiply(q2);
    });
    canopy.rotation.y = -st.ang;
  }
  place();
  return {
    group, anchors: A, front: fz, size: 26, focusY: 5, seats,
    setMode(m) { st.mode = m; showRiders(seats, m); st.target = m === 'stop' ? 0 : 1; },
    update(dt) {
      st.t += dt;
      if (st.mode === 'run') st.target = (st.t % 60) < 44 ? 1 : 0;
      st.w += (st.target - st.w) * Math.min(1, dt * 0.25);
      const rpm = tg.spec.testRpm && st.mode === 'test' ? tg.spec.testRpm : tg.spec.rated * 0.92;
      st.ang += st.w * rpm * TAU / 60 * dt;
      place();
    },
    testDuration: 30,
  };
}

// ================================================================================================ PIRATE SHIP
function buildPirate(tg, rng, group) {
  const A = {}, paint = { a: tg.colors.a, b: tg.colors.b, cb: '#efe6cf' };
  group.add(part('ps_frame', paint));
  const ship = part('ps_ship', paint); ship.position.y = 12; group.add(ship);
  const seats = [];
  for (let r = 0; r < 5; r++) {
    const by = r - 2, z = -by * 1.7, lift = 0.55 * (by * 1.7 / 6) ** 2 * 4, y = -9.5 + 0.3 + lift;
    for (const [si, sd] of ['port', 'starboard'].entries()) {
      const f = F(tg, 'pbar', q => q.anchor.row === r && q.anchor.side === sd);
      const x = si === 0 ? -0.72 : 0.72;
      const bar = part('ps_bar'); bar.scale.x = 0.47; bar.position.set(x, 0, 0);
      const g = new THREE.Group(); g.position.set(0, y, z); ship.add(g);
      const piv = pivot(g, bar, x, 0.25, -0.1);
      if (f.tell === 'bar') piv.rotation.x = -1.1;
      anchor(g, x, 0.6, 0, A, f.id);
      for (const dx of [-0.35, 0.35]) seats.push(seatPair(ship, rng, x + dx, y + 0.12, z + 0.05, 0));
    }
  }
  ['A', 'B', 'C', 'D'].forEach((L, k) => {
    const f = F(tg, 'support', q => q.anchor.foot === k);
    const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1;
    footing(group, tg, f, sx * 3.4, 0.5, sz * 6.2, V(-sx * 0.8, 11.6, -sz * 6.2));
    anchor(group, sx * 3.4, 0.9, sz * 6.2, A, f.id);
  });
  anchor(group, 2.6, 12, 0, A, F(tg, 'bearing').id);
  anchor(group, 0.7, 1.1, 0.6, A, F(tg, 'tyre').id);
  const fz = 10;
  const fp = fenceLoop(group, tg, rectPts(6.2, 9.4)); anchor(group, fp.x, fp.y, fp.z, A, F(tg, 'fence').id);
  entrance(group, tg, fz, A);
  const st = { mode: 'run', t: rng.range(0, 60), amp: 0 };
  return {
    group, anchors: A, front: fz, size: 20, focusY: 7, seats,
    setMode(m) { st.mode = m; showRiders(seats, m); if (m === 'test') st.t = 0; },
    update(dt) {
      st.t += dt;
      const rated = (st.mode === 'test' && tg.spec.testAngle ? tg.spec.testAngle : tg.spec.rated * 0.85) * Math.PI / 180;
      let target = 0;
      if (st.mode === 'run') target = (st.t % 70) < 52 ? rated : 0;
      if (st.mode === 'test') target = st.t < 22 ? rated : 0;
      st.amp += (target - st.amp) * Math.min(1, dt * 0.18);
      ship.rotation.x = st.amp * Math.sin(TAU * st.t / 6.2);
    },
    testDuration: 32,
  };
}

// ================================================================================================ COASTER
function sweep(c, fn, r, segs, i0 = 0, i1 = null, closed = true) {
  // tube along the track: fn(i) → THREE.Vector3 centre
  const N = c.N, idx = [];
  if (i1 === null) { for (let i = 0; i <= N; i++) idx.push(i % N); } else for (let i = i0; i <= i1; i++) idx.push(i % N);
  const pos = [], nor = [], uv = [], ind = [];
  idx.forEach((i, k) => {
    const p = fn(i), j = (i + 1) % N, h = (i - 1 + N) % N;
    const t = fn(j).sub(fn(h)).normalize();
    const u = V(...c.up[i]); const l = t.clone().cross(u).normalize(); u.crossVectors(l, t).normalize();
    for (let s = 0; s <= segs; s++) {
      const a = TAU * s / segs, n = l.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r); nor.push(n.x, n.y, n.z); uv.push(k / 4, s / segs);
    }
  });
  for (let k = 0; k < idx.length - 1; k++) for (let s = 0; s < segs; s++) {
    const a = k * (segs + 1) + s, b = a + segs + 1;
    ind.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  return g;
}

function buildCoaster(tg, rng, group) {
  const A = {}, c = tg.coaster, paint = { a: tg.colors.a, b: tg.colors.b };
  const P = i => V(...c.pos[i]), U = i => V(...c.up[i]);
  const Tn = i => P((i + 1) % c.N).sub(P((i - 1 + c.N) % c.N)).normalize();
  const Ln = i => Tn(i).cross(U(i)).normalize();
  const railMat = new THREE.MeshStandardMaterial({ color: tg.colors.b, metalness: 0.55, roughness: 0.35 });
  const spineMat = new THREE.MeshStandardMaterial({ color: tg.colors.b, metalness: 0.5, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(sweep(c, i => P(i).addScaledVector(Ln(i), 0.55 * side), 0.075, 8), railMat);
    m.castShadow = m.receiveShadow = true; group.add(m);
  }
  const spine = new THREE.Mesh(sweep(c, i => P(i).addScaledVector(U(i), -0.5), 0.2, 10), spineMat);
  spine.castShadow = spine.receiveShadow = true; group.add(spine);
  const i0 = Math.round(c.sLift[0] / c.ds), i1 = Math.round(c.sLift[1] / c.ds);
  const chain = new THREE.Mesh(sweep(c, i => P(i).addScaledVector(U(i), -0.06), 0.06, 6, i0, i1, false),
    new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.8, roughness: 0.5 }));
  group.add(chain);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < c.N; i += 2) {
    const t = Tn(i), u = U(i), x = new THREE.Vector3().crossVectors(u, t).normalize();
    m4.makeBasis(x, u, t).setPosition(group.localToWorld(P(i)));
    batchAddMatrix('cs_tie', m4.clone());
  }
  // supports (point supports get their own meshes so tells can show)
  const pointSup = new Map(tellOf(tg, 'support').map(f => [f.anchor.sup, f]));
  c.supports.forEach((s, k) => {
    const f = pointSup.get(k);
    const ft = part('cs_footing', paint); ft.position.set(s.x, 0, s.z); group.add(ft);
    const col = part('cs_support', paint); col.position.set(s.x, 0.85, s.z); col.scale.y = Math.max(0.2, s.top - 0.85); group.add(col);
    if (f?.tell === 'rust') col.traverse(m => { if (m.isMesh) m.material = rustMat(); });
    if (f?.tell === 'crack') { const cr = part('crack'); cr.position.set(s.x, 1.8, s.z + 0.31); cr.rotation.z = 0.6; cr.scale.set(1.3, 1, 1.5); group.add(cr); }
    const missing = f?.tell === 'bolt' ? f.extra.boltsMissing : 0;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], b) => {
      if (b < missing) return;
      const w = group.localToWorld(V(s.x + sx * 0.36, 0.54, s.z + sz * 0.36));
      batchAdd('bolt', w.x, w.y, w.z, b, 1.5);
    });
    if (f) anchor(group, s.x, 1.4, s.z, A, f.id);
  });
  tellOf(tg, 'splice').forEach(f => {
    const i = f.anchor.track;
    anchor(group, ...P(i).addScaledVector(U(i), -0.3).toArray(), A, f.id);
    if (f.tell === 'crack') { const cr = part('crack'); cr.position.copy(P(i).addScaledVector(U(i), -0.5)); cr.lookAt(group.localToWorld(P(i).add(Ln(i)))); cr.scale.set(1, 1, 1.4); group.add(cr); }
  });
  const fl = F(tg, 'lift'); anchor(group, ...P(fl.anchor.track).toArray(), A, fl.id);

  // station
  const is = c.iStop, sp = P(is), st0 = Tn(is);
  const station = part('cs_station', paint); station.position.set(sp.x, 0, sp.z); station.rotation.y = Math.atan2(st0.x, st0.z); group.add(station);
  const sface = part('cs_station_face'); sface.position.copy(station.position); sface.rotation.copy(station.rotation);
  sface.traverse(m => { if (m.isMesh) { m.material = faceMat(signTex(tg.name.toUpperCase(), { bg: '#141a2c', border: tg.colors.a })); } });
  group.add(sface);
  const toW = (lx, ly, lz) => V(lx, ly, lz).applyEuler(station.rotation).add(station.position);
  anchor(group, ...toW(3.3, 2.2, 6.5).toArray(), A, F(tg, 'estop').id);

  // train
  const cars = [], seats = [];
  tellOf(tg, 'car').forEach((f, k) => {
    const car = part('cs_car', paint); group.add(car);
    [0.25, -0.55].forEach((rz, row) => {
      const bar = part('cs_bar');
      const g = new THREE.Group(); g.position.set(0, 0, rz); car.add(g); g.add(bar);
      if (f.tell === 'bar' && f.extra.row === row + 1) g.rotation.x = 1.0;
      for (const x of [-0.3, 0.3]) seats.push(seatPair(car, rng, x, 0.86, rz - 0.05, 0));
    });
    anchor(car, 0, 1.0, 0, A, f.id);
    cars.push(car);
  });

  // entrance stuff sits on the near side of the station (local +z of the park layout is toward the ring)
  const eg = new THREE.Group(); eg.position.set(sp.x, 0, sp.z + 6.5); group.add(eg);
  const ea = {}; entrance(eg, tg, 0, ea);
  Object.assign(A, ea);
  // perimeter fence: offset of the plan by 5 m
  const plan = [];
  for (let i = 0; i < c.N; i += 6) { const p = P(i), l = Ln(i); const o = V(p.x, 0, p.z).addScaledVector(V(l.x, 0, l.z).normalize(), (l.x * p.x + l.z * p.z) > 0 ? 6 : -6); plan.push([o.x, o.z]); }
  const ctr = plan.reduce((a, p) => [a[0] + p[0] / plan.length, a[1] + p[1] / plan.length], [0, 0]);
  const hull = plan.map(([x, z]) => { const d = Math.hypot(x - ctr[0], z - ctr[1]); return [ctr[0] + (x - ctr[0]) * (d + 3) / d, ctr[1] + (z - ctr[1]) * (d + 3) / d]; });
  const fpt = fenceLoop(group, tg, hull, true); anchor(group, fpt.x, fpt.y, fpt.z, A, F(tg, 'fence').id);

  const st = { mode: 'run', t: rng.range(0, 40), dwell: 0 };
  const tl = c.trace.t, dur = tl[tl.length - 1];
  function trainAt(t) {
    // t in [0, dur] → plan index offset from the stop
    let lo = 0, hi = tl.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tl[m] <= t) lo = m; else hi = m; }
    const f = (t - tl[lo]) / ((tl[hi] - tl[lo]) || 1);
    return (c.iStop + lo + f);
  }
  const _x = V(0, 0, 0);
  function place(fi) {
    cars.forEach((car, k) => {
      let fk = fi - k * 2.4 / c.ds * 0.98;
      fk = ((fk % c.N) + c.N) % c.N;
      const i = Math.floor(fk), j = (i + 1) % c.N, f = fk - i;
      const p = P(i).lerp(P(j), f), u = U(i).lerp(U(j), f).normalize(), t = Tn(i).lerp(Tn(j), f).normalize();
      _x.crossVectors(u, t).normalize(); u.crossVectors(t, _x);
      car.position.copy(p);
      car.quaternion.setFromRotationMatrix(m4.makeBasis(_x, u, t));
    });
  }
  place(c.iStop + 9);
  return {
    group, anchors: A, front: 0, size: 34, focusY: 7, seats, focus: group.localToWorld(V(sp.x + 14, 0, sp.z - 8)),
    setMode(m) { st.mode = m; showRiders(seats, m); if (m !== 'run') { st.t = 0; st.dwell = 0; place(trainAt(0) + 9); } },
    update(dt) {
      if (st.mode === 'stop') return;
      if (st.dwell > 0) { st.dwell -= dt; return; }
      st.t += dt;
      if (st.t >= dur) { st.t = 0; st.dwell = st.mode === 'test' ? 1e9 : 9; }
      place(trainAt(st.t) + 9);
    },
    testDuration: dur,
  };
}

// ================================================================================================ FACILITIES
function buildFood(tg, rng, group) {
  const A = {}, paint = { a: tg.colors.a, b: tg.colors.b, ca: tg.colors.a, cb: '#f7f1e3' };
  const s = part('stand_food', paint); group.add(s);
  const face = part('stand_face'); face.traverse(m => { if (m.isMesh) m.material = faceMat(signTex(tg.name.toUpperCase(), { bg: '#fff3d6', fg: '#b3261e', border: tg.colors.a })); });
  group.add(face);
  anchor(group, 1.2, 1.0, -1.0, A, F(tg, 'fridge').id);
  anchor(group, -1.2, 1.2, -0.6, A, F(tg, 'sink').id);
  const fe = F(tg, 'ext');
  const ext = part('extinguisher'); ext.position.set(-1.95, 0.2, -1.4); if (fe.tell !== 'ext') group.add(ext);
  anchor(group, -1.95, 0.6, -1.4, A, fe.id);
  const fp = F(tg, 'panel');
  const p = part('elec_panel'); p.position.set(2.5, 0, 0.6); p.rotation.y = Math.PI / 2; group.add(p);
  const d = part('elec_door'); const pg = new THREE.Group(); pg.position.copy(p.position); pg.rotation.copy(p.rotation); group.add(pg);
  const piv = pivot(pg, d, -0.4, 0, 0.18); if (fp.tell === 'panel') piv.rotation.y = -1.9;
  anchor(group, 2.6, 1.0, 0.6, A, fp.id);
  for (let k = 0; k < 3; k++) { const w = group.localToWorld(V(-2 + k * 2, 0, 4.5)); batchAdd('bench', w.x, 0, w.z, group.rotation.y + Math.PI); }
  return { group, anchors: A, front: 2.4, size: 9, focusY: 1.5, seats: [], setMode() {}, update() {} };
}

function buildFirstAid(tg, rng, group) {
  const A = {};
  group.add(part('first_aid'));
  const fs = F(tg, 'staff');
  const light = new THREE.PointLight('#fff4d0', fs.defect ? 0 : 6, 6, 1.6); light.position.set(0, 2.2, 0.8); group.add(light);
  anchor(group, 0, 1.2, 2.2, A, fs.id);
  anchor(group, -1.6, 1.2, 2.5, A, F(tg, 'aed').id);
  const fe = F(tg, 'ext');
  const ext = part('extinguisher'); ext.position.set(1.6, 0.2, 2.35); if (fe.tell !== 'ext') group.add(ext);
  anchor(group, 1.6, 0.6, 2.35, A, fe.id);
  return { group, anchors: A, front: 2.6, size: 9, focusY: 1.5, seats: [], setMode() {}, update() {} };
}

const BUILD = { ferris: buildFerris, drop: buildDrop, swing: buildSwing, pirate: buildPirate, coaster: buildCoaster, food: buildFood, firstaid: buildFirstAid };

export function buildTarget(tg) {
  const rng = makeRng(hashStr(tg.id + tg.name));
  const pre = new THREE.Group(); pre.position.set(tg.x, 0, tg.z); pre.rotation.y = tg.rot; pre.updateMatrixWorld(true);
  // builders read world placement through group.localToWorld, so build inside a placed group
  const r = BUILD[tg.type](tg, rng, pre);
  if (r.group.userData.tilt) r.group.rotation.z = r.group.userData.tilt * Math.PI / 180;
  r.group.updateMatrixWorld(true);
  return r;
}
