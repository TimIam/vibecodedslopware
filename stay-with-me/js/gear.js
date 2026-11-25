// The kit you can see: the open response bag, oxygen and the monitor on the floor, and everything that ends up
// attached to the patient (probe, electrodes and their leads, pads, cuff, masks, the bag, airways, collar, binder,
// tourniquets, seals, cannulas, lines, dressings, splints). Everything is fitted to the patient's surface: flat things
// are draped onto the skin through the body's distance field, bands are wrapped round the actual limb, and cables are
// settled under gravity over the body and onto the floor. sync(p) shows what p.tx says is in place.
//
//   gear.js        this file: the fitting tools (snap / patch / sleeve / rope), kit placement, sync and update
//   gear-items.js  one maker per piece of applied equipment (monitoring here; -items2 airway and breathing,
//                  -items3 circulation, trauma and what is put down by the bag)
//   gear-kit.js    monitor / defibrillator, response bag, oxygen, sharps
//   gear-lib.js    geometry builder, shared materials and textures, the print atlas
//
// Contract (unchanged): buildGear(human, root, kitSpot) -> { sync(p), update(dt, p, breath), monitorPort, kit, dispose() }.

import * as THREE from 'three';
import { G, U } from './gfx.js';
import { V3, sheet, WET } from './gear-lib.js';
import { buildMonitor, buildBag, buildOxygen, buildSharps } from './gear-kit.js';
import { makers } from './gear-items.js';

const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const UP = V3(0, 1, 0);

export function buildGear(human, root, kitSpot) {
  const A = human.anchors || {}, body = new THREE.Group(); body.name = 'gearBody'; human.group.add(body);
  const kit = new THREE.Group(); kit.name = 'gearKit'; root.add(kit);
  if (kitSpot) { kit.position.copy(kitSpot.pos); kit.rotation.y = kitSpot.yaw || 0; }
  root.updateMatrixWorld(true); human.group.updateMatrixWorld(true);
  const items = {}, _p = V3();
  const sdfRaw = typeof human.sdf === 'function' ? human.sdf.bind(human) : null;
  const sdf = p => { if (!sdfRaw) return 1; const d = sdfRaw(p); return d === d ? d : 1; };
  const grad = (p, out = V3()) => { const e = 0.002, d = sdf(p); _p.copy(p); _p.x += e; const dx = sdf(_p) - d; _p.x = p.x; _p.y += e; const dy = sdf(_p) - d; _p.y = p.y; _p.z += e; const dz = sdf(_p) - d; out.set(dx, dy, dz); return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize(); };
  const toLocal = (obj, v) => human.group.worldToLocal(obj.localToWorld(v.clone())), dirLocal = (obj, d) => d.clone().transformDirection(obj.matrixWorld).transformDirection(_inv.copy(human.group.matrixWorld).invert());
  const _inv = new THREE.Matrix4();
  const regAO = o => o.traverse(m => { if (m.userData.noAO) G.noAO?.add(m); }), unregAO = o => o.traverse(m => { if (m.userData.noAO) G.noAO?.delete(m); });

  // ---- where the ground is, in the patient's frame, and what the patient is lying or sitting on
  const floorY = human.group.worldToLocal(kit.getWorldPosition(V3())).y;
  const supine = (A.sternumCPR?.normal.y ?? 1) > 0.6;
  const supportY = supine ? 0 : (human.seat ?? 0), raised = supportY - floorY > 0.05;
  const mid = (a, b) => A[a] && A[b] ? A[a].pos.clone().lerp(A[b].pos, 0.5) : null;
  const sup = (() => { if (!raised) return null; const a = supine ? A.forehead?.pos : mid('pelvisL', 'pelvisR'), b = supine ? mid('ankleL', 'ankleR') : mid('kneeL', 'kneeR'); return a && b ? { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: supine ? 0.31 : 0.33 } : null; })();
  const floorAt = p => { if (!sup) return floorY; const dx = sup.bx - sup.ax, dz = sup.bz - sup.az, t = clamp(((p.x - sup.ax) * dx + (p.z - sup.az) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(p.x - sup.ax - dx * t, p.z - sup.az - dz * t) < sup.r ? supportY : floorY; };

  // ---- the kit on the ground
  const bag = buildBag(), oxy = buildOxygen(), sharps = buildSharps(), mon = buildMonitor();
  oxy.group.position.set(-0.06, 0, -0.305); sharps.group.position.set(0.41, 0, -0.03); sharps.group.rotation.y = 0.35;
  kit.add(bag.group, oxy.group, sharps.group, mon.group);
  { // the monitor faces the patient from wherever by the bag there is room for it and for the hands that will reach it
    const chest = A.sternumCPR ? human.group.localToWorld(A.sternumCPR.pos.clone()) : human.group.getWorldPosition(V3());
    const toPt = kit.worldToLocal(chest); toPt.y = 0; const d = toPt.length() || 1, base = Math.atan2(toPt.x, toPt.z);
    const room = (c, yaw) => { let m = 9; for (const [x, z] of [[0, 0], [-0.21, 0.12], [0.21, 0.12], [-0.21, -0.12], [0.21, -0.12], [0, 0.3], [-0.2, 0.3], [0.2, 0.3], [-0.34, 0.1]]) for (const y of [0.04, 0.16, 0.28]) { const q = toLocal(kit, V3(c.x + x * Math.cos(yaw) + z * Math.sin(yaw), y, c.z - x * Math.sin(yaw) + z * Math.cos(yaw))); m = Math.min(m, sdf(q)); if (sup && floorAt(q) !== floorY) m = -1; } return m; };
    let best = null, bs = -9;
    for (const turn of [0, 0.5, -0.5, 0.95, -0.95, 1.35, -1.35, 1.75, -1.75]) { const ang = base + turn, dx = Math.sin(ang), dz = Math.cos(ang), need = Math.abs(dx) * (dx > 0 ? 0.37 : 0.49) + Math.abs(dz) * (dz > 0 ? 0.25 : 0.44) + 0.2;
      for (const r of [need, need + 0.1]) { const c = V3(dx * r, 0, dz * r), yaw = Math.atan2(toPt.x - c.x, toPt.z - c.z), m = room(c, yaw), score = Math.min(m, 0.14) - Math.abs(turn) * 0.02 - (r - need) * 0.05; if (score > bs) { bs = score; best = [c, yaw]; } } }
    mon.group.position.copy(best[0]); mon.group.rotation.y = best[1];
  }
  kit.updateMatrixWorld(true); regAO(kit);
  const monPort = mon.group.position.clone().add(V3(0, 0.2, 0));

  // ---- fitting tools shared by the item makers (all in the patient's frame)
  const at = (name, lift = 0) => { const a = A[name]; if (!a) return null; return { p: a.pos.clone().addScaledVector(a.normal, lift), n: a.normal.clone() }; };
  // drop a point onto the skin along -n; returns the surface point (lifted) and the true surface normal there
  const snap = (p, n, lift = 0, reach = 0.12) => {
    const q = p.clone().addScaledVector(n, reach); let t = 0;
    for (let i = 0; i < 40 && t < reach * 2.2; i++) { const d = sdf(q); if (d < 0.0004) break; const s = Math.min(d, 0.02); q.addScaledVector(n, -s); t += s; }
    if (t >= reach * 2.2) q.copy(p);
    const gn = grad(q); return { p: q.addScaledVector(gn, lift), n: gn };
  };
  // nearest point of the skin to q (starting just outside it): wraps round curves where a straight drop would not
  const wrapPt = (q, n, lift = 0) => { if (!sdfRaw) return { p: q.clone().addScaledVector(n, lift), n: n.clone() }; const p = q.clone().addScaledVector(n, 0.008), g = V3(); for (let i = 0; i < 4; i++) { const d = sdf(p); grad(p, g); p.addScaledVector(g, -d * 0.9); } grad(p, g); return { p: p.addScaledVector(g, lift - sdf(p)), n: g.clone() }; };
  // tangent frame on the skin: u to the patient's left-ish, v toward `toward` (a direction or a point's offset)
  const tangents = (n, toward) => { const v = toward.clone().addScaledVector(n, -toward.dot(n)); if (v.lengthSq() < 1e-8) v.set(0, 0, -1).addScaledVector(n, n.z); v.normalize(); return { u: new THREE.Vector3().crossVectors(v, n).normalize(), v }; };
  // a w x h patch draped on the skin round `c` (surface point) with normal n; v axis toward `toward`
  const patch = (c, n, toward, w, h, o = {}) => {
    const { u, v } = tangents(n, toward), cols = o.cols || Math.max(3, Math.round(w / 0.014) + 1), rows = o.rows || Math.max(3, Math.round(h / 0.014) + 1), grid = [], nors = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const x = (k / (cols - 1) - 0.5) * w, y = (r / (rows - 1) - 0.5) * h; let q = c.clone().addScaledVector(u, x).addScaledVector(v, y);
      if (o.round) { const m = Math.hypot(x / (w / 2), y / (h / 2)); if (m > 1) q = c.clone().addScaledVector(u, x / m).addScaledVector(v, y / m); }
      else if (o.corner) { const cr = o.corner, ax = Math.abs(x) - (w / 2 - cr), ay = Math.abs(y) - (h / 2 - cr), m = Math.hypot(ax, ay); if (ax > 0 && ay > 0 && m > cr) q = c.clone().addScaledVector(u, Math.sign(x) * (w / 2 - cr + ax * cr / m)).addScaledVector(v, Math.sign(y) * (h / 2 - cr + ay * cr / m)); }
      const s = wrapPt(q, n, o.lift ?? 0.0012); grid.push(s.p); nors.push(s.n); }
    return { grid, nors, rows, cols, u, v, geo: (thick = 0) => sheet(grid, rows, cols, thick, nors) };
  };
  // a band wrapped round whatever part of the body the axis c1 -> c2 runs through. Returns rings of points.
  // o: { w: width along the axis, at: 0..1 along c1->c2, off: gap above the skin, n: points round, rows, rMax }
  const sleeve = (c1, c2, o = {}) => {
    const axis = c2.clone().sub(c1); const len = axis.length() || 1; axis.divideScalar(len);
    const n = o.n || 28, rows = o.rows || 3, w = o.w ?? 0.1, off = o.off ?? 0.003, rGuess = o.r || 0.06;
    let c = c1.clone().addScaledVector(axis, len * (o.at ?? 0.5));
    const e1 = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? UP : V3(1, 0, 0)).normalize(), e2 = new THREE.Vector3().crossVectors(axis, e1);
    const q = V3(), radial = (k, out = V3()) => { const a = k / n * Math.PI * 2; return out.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)); };
    const ring = centre => { if (!sdfRaw) return new Array(n).fill(rGuess); const rr = []; for (let k = 0; k < n; k++) { const d = radial(k); let r = 0.004, hit = o.rMax || rGuess * 2.2;
        for (; r < (o.rMax || rGuess * 2.2); r += 0.004) { q.copy(centre).addScaledVector(d, r); if (sdf(q) > 0) { let lo = r - 0.004, hi = r; for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; q.copy(centre).addScaledVector(d, m); if (sdf(q) > 0) hi = m; else lo = m; } hit = hi; break; } }
        rr.push(hit); }
      const sorted = [...rr].sort((a, b) => a - b), med = sorted[n >> 1]; for (let k = 0; k < n; k++) rr[k] = clamp(rr[k], med * 0.6, med * (o.spread ?? 1.3));
      let out = rr; for (let s = 0; s < (o.smooth || 1); s++) out = out.map((r, k) => (out[(k + n - 1) % n] + 2 * r + out[(k + 1) % n]) / 4); return out; };
    // centre the axis in the limb: two rounds of moving to the centroid of the ring
    for (let it = 0; it < 2; it++) { const rr = ring(c), cen = V3(); for (let k = 0; k < n; k++) cen.addScaledVector(radial(k), rr[k] / n * 2); c.add(cen.multiplyScalar(0.7)); }
    const grid = [], nors = [], radii = [];
    for (let r = 0; r < rows; r++) { const t = rows === 1 ? 0 : r / (rows - 1) - 0.5, cc = c.clone().addScaledVector(axis, t * w), rr = ring(cc); radii.push(rr);
      for (let k = 0; k <= n; k++) { const d = radial(k % n), rad = rr[k % n] + off + (o.flare ? o.flare(k / n, t + 0.5) : 0), p = cc.clone().addScaledVector(d, rad); if (p.y < floorAt(p) + 0.002) p.y = floorAt(p) + 0.002; grid.push(p); nors.push(d); } }
    return { grid, nors, rows, cols: n + 1, c, axis, e1, e2, radii, n, radial, circ: radii[0].reduce((s, r) => s + r, 0) / n * Math.PI * 2, angleOf: dir => Math.atan2(dir.dot(e2), dir.dot(e1)) / (Math.PI * 2),
      geo: (thick = 0) => sheet(grid, rows, n + 1, thick, nors),
      // point on the band at angle fraction a (0..1) and across-width fraction t (0..1), lifted off the band
      point: (a, t = 0.5, lift = 0) => { const k = ((a % 1) + 1) % 1 * n, k0 = Math.floor(k) % n, f = k - Math.floor(k), rf = clamp(t) * (rows - 1), r0 = Math.max(0, Math.min(rows - 2, Math.floor(rf))), r1 = Math.min(rows - 1, r0 + 1), g = rf - r0, W = n + 1;
        const p = grid[r0 * W + k0].clone().lerp(grid[r0 * W + k0 + 1], f).lerp(grid[r1 * W + k0].clone().lerp(grid[r1 * W + k0 + 1], f), g), d = radial(k0).lerp(radial((k0 + 1) % n), f).normalize(); return { p: p.addScaledVector(d, lift), n: d }; } };
  };
  // a cable or tube from a to b, settled under gravity over the body and whatever the patient lies on.
  // o: { r, slack, da / db: unit directions the ends leave along, side: +1 / -1 which way the slack falls, it, n }
  let ropeN = 0;
  const rope = (a, b, o = {}) => {
    const r = o.r ?? 0.002, straight = a.distanceTo(b), total = Math.max(straight * (o.slack ?? 1.22), straight + (o.extra ?? 0.02)), n = o.n || clamp(Math.round(total / 0.022), 10, 60), L = total / n;
    const sd = new THREE.Vector3().crossVectors(b.clone().sub(a), UP); if (sd.lengthSq() < 1e-8) sd.set(1, 0, 0); sd.normalize().multiplyScalar(o.side ?? ((ropeN++ % 2) ? 1 : -1));
    const h = straight * Math.sqrt(Math.max(0, 0.375 * (total / (straight || 1) - 1))), P = [], pin = new Uint8Array(n + 1);
    for (let i = 0; i <= n; i++) { const t = i / n; P.push(a.clone().lerp(b, t).addScaledVector(UP, -h * 0.75 * 4 * t * (1 - t)).addScaledVector(sd, h * 0.65 * Math.sin(t * Math.PI * 2) * (0.6 + 0.4 * t))); }
    { const over = o.over || grad(a).add(grad(b)).add(UP).normalize(); for (let i = 1; i < n; i++) for (let k = 0; k < 40 && sdf(P[i]) < r + 0.004; k++) P[i].addScaledVector(over, 0.008); }
    pin[0] = pin[n] = 1; const lead = Math.max(1, Math.round(0.02 / L));
    if (o.da) for (let i = 1; i <= lead; i++) { P[i].copy(a).addScaledVector(o.da, L * i); pin[i] = 1; }
    if (o.db) for (let i = 1; i <= lead; i++) { P[n - i].copy(b).addScaledVector(o.db, L * i); pin[n - i] = 1; }
    const g = V3(), collide = p => { const fy = floorAt(p) + r; if (p.y < fy) p.y = fy; const d = sdf(p) - r - (o.gap ?? 0.0022); if (d < 0) { grad(p, g); p.addScaledVector(g, -d); if (p.y < fy) p.y = fy; } };
    const iters = o.it || (total > 0.9 ? 85 : 60), dv = V3();
    for (let it = 0; it < iters; it++) {
      for (let i = 1; i < n; i++) if (!pin[i]) P[i].y -= 0.0045;
      for (let pass = 0; pass < 3; pass++) for (let j = 0; j < n; j++) { const i = pass & 1 ? n - 1 - j : j, p0 = P[i], p1 = P[i + 1]; dv.subVectors(p1, p0); const dl = dv.length() || 1e-6, e = (dl - L) / dl; if (Math.abs(e) < 1e-4) continue;
        if (pin[i] && pin[i + 1]) continue; if (pin[i]) p1.addScaledVector(dv, -e); else if (pin[i + 1]) p0.addScaledVector(dv, e); else { p0.addScaledVector(dv, e * 0.5); p1.addScaledVector(dv, -e * 0.5); } }
      for (let i = 1; i < n; i++) if (!pin[i]) collide(P[i]);
    }
    for (let pass = 0; pass < 2; pass++) { for (let i = 1; i < n; i++) if (!pin[i]) { dv.copy(P[i - 1]).add(P[i + 1]).multiplyScalar(0.5); P[i].lerp(dv, 0.35); } for (let i = 1; i < n; i++) if (!pin[i]) collide(P[i]); }
    return P;
  };
  const kitPt = (obj, v) => toLocal(obj, v), kitDir = (obj, d) => dirLocal(obj, d);
  const port = name => { const pt = mon.ports[name]; return { p: kitPt(mon.group, pt.p), d: kitDir(mon.group, pt.d) }; };

  // ---- parts of an item that ride the chest wall: breathing and compressions move the skin under them
  const hu = human.uniforms, follow = new Set();
  const defAt = pos => { // the skin's own deformation weights nearest to a point (falls back to "chest")
    const g = human.skinMesh?.geometry, P = g?.attributes?.position, D = g?.attributes?.aDef; if (!P || !D) return [0.5, 0.5, 0, 1];
    let best = 0, bd = 1e9; const step = Math.max(1, Math.floor(P.count / 20000));
    for (let i = 0; i < P.count; i += step) { const dx = P.getX(i) - pos.x, dy = P.getY(i) - pos.y, dz = P.getZ(i) - pos.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = i; } }
    return bd > 0.01 ? [0, 0, 0, 0] : [D.getX(best), D.getY(best), D.getZ(best), D.getW(best)];
  };
  const rides = (obj, pos, n) => { if (!hu?.uBreath || !hu?.uCpr) return obj; let w; try { w = defAt(pos); } catch { w = [0.5, 0.5, 0, 1]; } if (w[0] + w[1] + w[2] + w[3] < 0.02) return obj; obj.userData.ride = { pos: pos.clone(), n: n.clone(), w }; return obj; };
  const rideUpdate = () => {
    if (!follow.size || !hu?.uBreath) return; const b = hu.uBreath.value, c = hu.uCpr.value, cd = hu.uCprDir?.value;
    for (const o of follow) { const R = o.userData.ride, br = b.x * (R.w[0] * b.y + R.w[1] * b.z) * 0.013 + b.x * b.w * R.w[2] * 0.011; o.position.copy(R.n).multiplyScalar(br);
      if (cd && c.w) { const dx = R.pos.x - c.x, dy = R.pos.y - c.y, dz = R.pos.z - c.z; o.position.addScaledVector(cd, c.w * 0.055 * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * 0.075 * 0.075)) * R.w[3]); } }
  };

  // ---- head frame for anything worn on the face
  const head = (() => { const n = A.nose, l = A.earL, r = A.earR; if (!n || !l || !r) return null; const lat = l.pos.clone().sub(r.pos).normalize(), fwd = n.normal.clone().addScaledVector(lat, -n.normal.dot(lat)).normalize(), up = new THREE.Vector3().crossVectors(fwd, lat).normalize(), c = l.pos.clone().lerp(r.pos, 0.5);
    return { lat, fwd, up, c, radial: (q, lift = 0.001) => { const d = q.clone().sub(c).normalize(); return snap(c.clone().addScaledVector(d, 0.02), d, lift, 0.16); } }; })();

  const K = { THREE, human, A, body, kit, items, at, snap, patch, sleeve, rope, tangents, sdf, grad, floorY, supportY, floorAt, supine, raised, port, mon, bag, oxy, kitPt, kitDir, head, rides, attach: {}, night: () => (U?.uNight?.value || 0) > 0.5 };
  const make = makers(K);

  const drop = key => { const o = items[key]; if (!o) return; o.traverse(m => { if (m.userData.ride) follow.delete(m); if (m.geometry) m.geometry.dispose(); if (m.material?.userData?.own) m.material.dispose(); }); unregAO(o); o.removeFromParent(); delete items[key]; delete K.attach[key]; delete K.attach[key.split('|')[0]]; };
  const want = (key, on, f) => {
    if (on && !items[key]) { let o; try { o = f(); } catch (e) { console.warn('gear: could not build', key, e); o = null; } o = o || new THREE.Group(); o.name = key; if (!o.parent) body.add(o); items[key] = o; regAO(o); o.traverse(m => { if (m.userData.ride) follow.add(m); }); }
    else if (!on && items[key]) drop(key);
  };
  // keyed variants: build the wanted one, drop any other variant of the same family
  const variant = (family, key, f) => { for (const k in items) if (k !== key && (k === family || k.startsWith(family + '|'))) drop(k); if (key) want(key, true, f); };

  // under an open sky the kit gets rained on (a set keeps the weather's wetness value but has no sky of its own)
  const outdoors = !!root.parent?.children?.some(o => o.isMesh && o.material?.uniforms?.uCover);
  let fluidMax = 0, fluidSeen = null, time = 0;
  return {
    sync(p) {
      const t = p.tx, m = t.mon, vent = t.vent.on, adj = t.adjunct;
      want('spo2', m.spo2, make.spo2); want('ecg', m.ecg, make.ecg); want('pads', m.pads, make.pads); want('cuff', m.cuff, make.cuff);
      want('opa', adj === 'opa', make.opa); want('npa', adj === 'npa', make.npa); want('igel', adj === 'igel', make.igel); want('cric', adj === 'cric', make.cric);
      want('cap', m.cap && !vent, make.cap);
      const dev = vent ? null : t.o2?.device;
      want('nc', dev === 'nc', make.nc); want('nrb', dev === 'nrb', () => make.nrb(false)); want('neb', dev === 'neb', () => make.nrb(true));
      variant('bvm', vent ? `bvm|${adj === 'igel' || adj === 'cric' ? adj : 'mask'}|${t.vent.o2 ? 1 : 0}|${m.cap ? 1 : 0}` : null, () => make.bvm(adj, !!t.vent.o2, !!m.cap));
      want('collar', t.collar, make.collar); want('binder', t.binder, make.binder);
      for (const s of ['acfL', 'acfR']) { const iv = t.iv.find(i => i.site === s); variant('iv' + s, iv ? `iv${s}|${iv.gauge || 18}` : null, () => make.iv(s, iv.gauge || 18, iv.t)); }
      variant('io', t.io ? `io|${t.io.site}` : null, () => make.io(t.io.site));
      for (const l of ['legL', 'legR', 'armL', 'armR']) want('tq' + l, !!t.tq[l], () => make.tq(l, t.tq[l].t));
      for (const S of ['L', 'R']) { variant('seal' + S, t.seal[S] ? `seal${S}|${t.seal[S].vented ? 1 : 0}` : null, () => make.seal(S, t.seal[S].vented)); want('dec' + S, !!t.decomp[S]?.ok, () => make.decomp(S)); want('thor' + S, !!t.thoracostomy?.[S] && !t.thoracotomy, () => make.thoracostomy(S)); }
      for (const id in t.dressings) variant('dress:' + id, `dress:${id}|${t.dressings[id].kind || 'pressure'}`, () => make.dressing(id, t.dressings[id].kind));
      for (const k in items) if (k.startsWith('dress:') && !t.dressings[k.slice(6).split('|')[0]]) drop(k);
      for (const w of ['legL', 'legR']) want('sp' + w, !!t.splints?.[w], () => make.splint(w, t.splints[w] === 'traction'));
      // fluids: the bag stays hanging once it has been spiked, running or not
      const f = t.fluidsRunning; if (f) { fluidMax = Math.max(fluidMax, f.left); fluidSeen = { io: f.io, pressure: f.pressure }; }
      const line = fluidSeen ? (fluidSeen.io && t.io ? 'io|' + t.io.site : t.iv[0] ? 'iv' + t.iv[0].site : t.io ? 'io|' + t.io.site : null) : null;
      variant('fluid', fluidSeen && line ? `fluid|${line}|${fluidSeen.pressure ? 1 : 0}` : null, () => make.fluid(line, fluidSeen.pressure));
      // what has been used and put down by the bag
      variant('bgl', p.bglShown != null ? `bgl|${p.bglShown}` : null, () => make.glucometer(p.bglShown));
      want('torch', p.firstTime?.('pupils') != null, make.torch);
      const ng = Math.min(6, p.given?.length || 0); variant('drugs', ng ? `drugs|${ng}` : null, () => make.syringes(p.given.slice(0, 6)));
      want('wrapPads', m.pads, make.padWrapper);
    },
    update(dt, p, breath) {
      time += dt; const t = p.tx, f = t.fluidsRunning;
      for (const k in items) { const o = items[k], ud = o.userData; if (ud.tick) ud.tick(dt, time, p, breath, f, fluidMax); }
      rideUpdate(); WET.value = outdoors ? (U?.uWet?.value || 0) : 0;
      mon.update(dt, !!(t.mon.ecg || t.mon.spo2 || t.mon.pads || t.mon.cap || t.mon.cuff), p.defib, time);
    },
    monitorPort: monPort, kit,
    dispose() {
      for (const k of Object.keys(items)) drop(k);
      unregAO(kit); body.removeFromParent(); kit.removeFromParent(); mon.dispose();
      kit.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
