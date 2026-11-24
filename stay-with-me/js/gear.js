// The kit you can see: response bag and monitor on the floor, and everything that ends up attached to the patient
// (probe, electrodes and their wires, pads, cuff, masks, the bag, airways, collar, tourniquets, seals, cannulas).
// Built from the patient's surface anchors so it sits on any body in any pose. sync(p) shows what p.tx says is in place.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
const M = {
  white: mat(0xe9e9e6, { roughness: 0.5 }), grey: mat(0x8e9499), dark: mat(0x1c1f23, { roughness: 0.45 }), red: mat(0xb3261c, { roughness: 0.7 }), orange: mat(0xe2681a), black: mat(0x101113, { roughness: 0.8 }),
  green: mat(0x2f7d45, { roughness: 0.35, metalness: 0.4 }), blue: mat(0x2f62b8, { roughness: 0.5 }), wire: mat(0xd8d8d2, { roughness: 0.5 }), steel: mat(0xc9ced2, { roughness: 0.25, metalness: 1 }),
  clear: new THREE.MeshPhysicalMaterial({ color: 0xdff2ff, roughness: 0.12, transmission: 0.9, thickness: 0.004, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  bag: new THREE.MeshPhysicalMaterial({ color: 0x9fc7e8, roughness: 0.3, transparent: true, opacity: 0.7, clearcoat: 0.6 }),
  gel: mat(0xf2f2ee, { roughness: 0.35 }), reflect: mat(0xd9d9c8, { roughness: 0.3, metalness: 0.3, emissive: 0x333322 }),
  led: mat(0x220000, { emissive: 0xff2010, emissiveIntensity: 3 }), screen: mat(0x030806, { emissive: 0x1a6b3a, emissiveIntensity: 1.6, roughness: 0.2 }),
  foam: mat(0xe8e2d0, { roughness: 0.9 }), velcro: mat(0x1b2733, { roughness: 0.95 }), amber: mat(0xff9a1f, { roughness: 0.4 }),
};
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

export function buildGear(human, root, kitSpot) {
  const A = human.anchors || {}, body = new THREE.Group(); human.group.add(body);
  const kit = new THREE.Group(); root.add(kit);
  if (kitSpot) { kit.position.copy(kitSpot.pos); kit.rotation.y = kitSpot.yaw || 0; }
  const items = {}, wires = [];
  const sh = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w, h, d, m, r = 0.01) => sh(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), m));

  // ---- the kit on the ground
  const bag = box(0.62, 0.3, 0.34, M.red, 0.05); bag.position.set(0, 0.15, 0); kit.add(bag);
  for (const z of [-0.171, 0.171]) { const s = box(0.6, 0.04, 0.004, M.reflect, 0.001); s.position.set(0, 0.2, z); kit.add(s); }
  const pocket = box(0.3, 0.2, 0.05, M.red, 0.02); pocket.position.set(0, 0.14, 0.19); kit.add(pocket);
  const handle = sh(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), M.black)); handle.position.set(0, 0.3, 0); kit.add(handle);
  const monitor = new THREE.Group(); kit.add(monitor);
  { kit.updateMatrixWorld(true); const toPt = kit.worldToLocal(human.group.getWorldPosition(new THREE.Vector3())); toPt.y = 0; const d = toPt.length() || 1; toPt.multiplyScalar(Math.min(0.5, d * 0.45) / d); monitor.position.copy(toPt); monitor.rotation.y = Math.atan2(toPt.x, toPt.z); }
  const mb = box(0.34, 0.3, 0.2, M.dark, 0.025); mb.position.y = 0.15; monitor.add(mb);
  const scr = box(0.22, 0.15, 0.006, M.screen, 0.004); scr.position.set(-0.03, 0.19, 0.101); monitor.add(scr);
  const mh = sh(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 20, Math.PI), M.dark)); mh.position.set(0, 0.3, 0); monitor.add(mh);
  const pk = box(0.06, 0.2, 0.19, mat(0x8a1a14), 0.01); pk.position.set(0.2, 0.13, 0); monitor.add(pk);
  const o2 = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.36, 6, 16), M.green)); o2.rotation.z = Math.PI / 2; o2.position.set(-0.1, 0.06, -0.3); kit.add(o2);
  const monPort = monitor.position.clone().add(new THREE.Vector3(0, 0.2, 0));

  const at = (name, lift = 0) => { const a = A[name]; if (!a) return null; return { p: a.pos.clone().addScaledVector(a.normal, lift), n: a.normal.clone() }; };
  const place = (obj, name, lift = 0, axis = Z) => { const a = at(name, lift); if (!a) return false; obj.position.copy(a.p); obj.quaternion.setFromUnitVectors(axis, a.n); body.add(obj); return true; };
  const wire = (from, color = M.wire, sag = 0.12, r = 0.0015) => {
    const a = at(from, 0.006); if (!a) return null;
    const end = human.group.worldToLocal(kit.localToWorld(monPort.clone()));
    const mid = a.p.clone().lerp(end, 0.5); mid.y = Math.min(a.p.y, end.y) - sag * 0 + 0.0; const lo = human.group.worldToLocal(new THREE.Vector3().copy(kit.position)).y + 0.012;
    const jit = (wires.length % 5 - 2) * 0.025; const p1 = a.p.clone().lerp(end, 0.35); p1.y = lo; p1.x += jit; const p2 = a.p.clone().lerp(end, 0.75); p2.y = lo; p2.z += jit;
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a.p, p1, p2, end]), 28, r, 5); const m = new THREE.Mesh(g, color); m.castShadow = true; body.add(m); wires.push(m); return m;
  };
  const band = (a1, a2, radius, len, m, t = 0.5) => { const p1 = A[a1], p2 = A[a2]; if (!p1 || !p2) return null; const c1 = p1.pos.clone().addScaledVector(p1.normal, -radius * 0.9), c2 = p2.pos.clone().addScaledVector(p2.normal, -radius * 0.9); const axis = c2.clone().sub(c1).normalize(); const o = sh(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 24, 1, true), m)); o.material.side = THREE.DoubleSide; o.position.copy(c1).lerp(c2, t); o.quaternion.setFromUnitVectors(Y, axis); body.add(o); return o; };

  const make = {
    spo2() { const g = new THREE.Group(); const clip = box(0.022, 0.016, 0.036, M.grey, 0.004); const l = box(0.006, 0.003, 0.006, M.led, 0.001); l.position.set(0, 0.009, 0); g.add(clip, l); place(g, 'fingerL', 0.004, Y) || place(g, 'handL', 0.01, Y); g.userData.w = wire(A.fingerL ? 'fingerL' : 'handL', M.grey); return g; },
    ecg() { const g = new THREE.Group(); body.add(g); for (const [n, c] of [['deltoidR', 0xffffff], ['deltoidL', 0x111111], ['pelvisR', 0x2f8f4a], ['pelvisL', 0xb3261c]]) { const a = at(n, 0.002); if (!a) continue; const d = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 16), M.white)); d.position.copy(a.p); d.quaternion.setFromUnitVectors(Y, a.n); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), mat(c)); s.position.copy(a.p).addScaledVector(a.n, 0.004); s.quaternion.copy(d.quaternion); g.add(d, s); g.add(wire(n) || new THREE.Group()); } return g; },
    pads() { const g = new THREE.Group(); body.add(g); for (const n of ['ics2R', 'ics5L']) { const a = at(n, 0.003); if (!a) continue; const pd = sh(new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.13, 0.004, 2, 0.002), M.gel)); pd.position.copy(a.p); pd.quaternion.setFromUnitVectors(Z, a.n); g.add(pd); const w = wire(n, M.dark, 0.1, 0.0035); if (w) g.add(w); } return g; },
    cuff() { return band('deltoidL', 'acfL', 0.058, 0.13, M.velcro, 0.55) || new THREE.Group(); },
    cap() { const g = new THREE.Group(); const t = box(0.03, 0.006, 0.012, M.clear, 0.002); g.add(t); place(g, 'nose', 0.004); g.userData.w = wire('nose', M.amber, 0.1, 0.0015); return g; },
    nc() { const g = new THREE.Group(); const t = sh(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0025, 6, 32, Math.PI * 1.1), M.clear)); t.rotation.x = Math.PI / 2; g.add(t); place(g, 'nose', -0.05); return g; },
    nrb() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.clear); m.rotation.x = Math.PI / 2; m.scale.set(0.85, 1.15, 0.9); const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 6, 12), M.clear); r.position.set(0, -0.11, 0.02); const strap = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.003, 5, 30), M.white); strap.rotation.x = Math.PI / 2; strap.position.z = -0.05; g.add(m, r, strap); place(g, 'mouth', 0.0) ; g.position.addScaledVector(at('nose')?.n || Z, 0.0); g.userData.w = wire('chin', M.clear, 0.1, 0.004); return g; },
    bvm() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.clear); m.rotation.x = Math.PI / 2; m.scale.set(0.85, 1.15, 0.8); const bagM = sh(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), M.bag)); bagM.scale.set(0.8, 0.8, 1.5); bagM.position.set(0, 0, 0.16); bagM.name = 'bag'; const v = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), M.white)); v.rotation.x = Math.PI / 2; v.position.z = 0.05; const res = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 6, 12), M.clear); res.rotation.x = Math.PI / 2; res.position.z = 0.34; g.add(m, bagM, v, res); place(g, 'mouth', 0.0); return g; },
    opa() { const g = new THREE.Group(); const f = box(0.03, 0.014, 0.004, M.white, 0.002); g.add(f); place(g, 'mouth', 0.004); return g; },
    npa() { const g = new THREE.Group(); const f = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.006, 12), mat(0x5fa89a))); f.rotation.x = Math.PI / 2; g.add(f); place(g, 'nose', 0.002); g.position.x -= 0.008; return g; },
    igel() { const g = new THREE.Group(); const t = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 14), M.clear)); t.rotation.x = Math.PI / 2; t.position.z = 0.03; const b = box(0.03, 0.022, 0.03, mat(0xe8d24a), 0.006); const c = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.02, 12), M.blue)); c.rotation.x = Math.PI / 2; c.position.z = 0.072; g.add(t, b, c); place(g, 'mouth', 0.0); return g; },
    cric() { const g = new THREE.Group(); const fl = box(0.05, 0.022, 0.004, M.white, 0.002); const t = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 12), M.clear)); t.rotation.x = Math.PI / 2; t.position.z = 0.024; const c = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 12), M.blue)); c.rotation.x = Math.PI / 2; c.position.z = 0.055; g.add(fl, t, c); place(g, 'neckFront', 0.002); return g; },
    collar() { const p1 = A.sternalNotch, p2 = A.chin; if (!p1 || !p2) return new THREE.Group(); const g = band('sternalNotch', 'chin', 0.072, 0.085, M.foam, 0.42) || new THREE.Group(); return g; },
    binder() { const a = A.pelvisL, b = A.pelvisR; if (!a || !b) return new THREE.Group(); const mid = a.pos.clone().lerp(b.pos, 0.5); const w = a.pos.distanceTo(b.pos); const axisGuess = A.umbilicus && A.groinL ? A.groinL.pos.clone().lerp(A.groinR?.pos || A.groinL.pos, 0.5).sub(A.umbilicus.pos).normalize() : new THREE.Vector3(0, 0, 1); const n = a.normal.clone().add(b.normal).normalize(); const center = mid.clone().addScaledVector(n, -0.09); const o = sh(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.62, 0.15, 28, 1, true), M.orange)); o.material = M.orange.clone(); o.material.side = THREE.DoubleSide; o.scale.z = 0.68; o.position.copy(center).addScaledVector(axisGuess, 0.04); const q = new THREE.Quaternion().setFromUnitVectors(Y, axisGuess); o.quaternion.copy(q); body.add(o); return o; },
    iv(site) { const g = new THREE.Group(); const hub = box(0.008, 0.008, 0.03, mat(0x3fa35c), 0.003); const tape = box(0.035, 0.002, 0.03, M.clear, 0.001); tape.position.y = 0.0; g.add(hub, tape); place(g, site || 'acfL', 0.004, Y); g.userData.w = wire(site || 'acfL', M.clear, 0.1, 0.002); return g; },
    io(site) { const g = new THREE.Group(); const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.018, 12), mat(0x2f62b8))); hub.rotation.x = Math.PI / 2; hub.position.z = 0.012; const n = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.012, 6), M.steel)); n.rotation.x = Math.PI / 2; g.add(hub, n); place(g, site || 'tibiaL', 0.0); g.userData.w = wire(site || 'tibiaL', M.clear, 0.1, 0.002); return g; },
    tq(limb) { const leg = limb.startsWith('leg'), S = limb.slice(-1); const g = leg ? band('groin' + S, 'thigh' + S, 0.088, 0.045, M.black, 0.55) : band('deltoid' + S, 'acf' + S, 0.055, 0.04, M.black, 0.3); if (!g) return new THREE.Group(); const rod = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), M.black)); rod.rotation.z = Math.PI / 2; rod.position.set(0, 0, leg ? 0.095 : 0.062); g.add(rod); const tag = box(0.03, 0.02, 0.002, M.white, 0.001); tag.position.set(0.03, 0, leg ? 0.09 : 0.058); g.add(tag); return g; },
    seal(side, vented) { const g = new THREE.Group(); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.0015, 28), M.clear); d.rotation.x = Math.PI / 2; g.add(d); if (vented) { const v = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.008, 12), M.white)); v.rotation.x = Math.PI / 2; v.position.z = 0.004; g.add(v); } place(g, 'ics5' + side, 0.002); return g; },
    decomp(side) { const g = new THREE.Group(); const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.02, 8), M.orange)); hub.rotation.x = Math.PI / 2; hub.position.z = 0.01; g.add(hub); place(g, (g.userData.site || 'ics5') + side, 0.0); return g; },
    dressing(name) { const g = new THREE.Group(); const d = box(0.11, 0.11, 0.012, M.white, 0.004); g.add(d); place(g, name, 0.006); return g; },
  };
  const want = (key, on, f) => { if (on && !items[key]) { items[key] = f(); } else if (!on && items[key]) { const o = items[key]; o.removeFromParent(); o.userData.w?.removeFromParent(); delete items[key]; } };

  return {
    sync(p) {
      const t = p.tx, m = t.mon;
      want('spo2', m.spo2, make.spo2); want('ecg', m.ecg, make.ecg); want('pads', m.pads, make.pads); want('cuff', m.cuff, make.cuff); want('cap', m.cap && !t.vent.on, make.cap);
      const dev = t.vent.on ? null : t.o2?.device;
      want('nc', dev === 'nc', make.nc); want('nrb', dev === 'nrb' || dev === 'neb', make.nrb); want('bvm', t.vent.on, make.bvm);
      want('opa', t.adjunct === 'opa', make.opa); want('npa', t.adjunct === 'npa', make.npa); want('igel', t.adjunct === 'igel', make.igel); want('cric', t.adjunct === 'cric', make.cric);
      want('collar', t.collar, make.collar); want('binder', t.binder, make.binder);
      for (const s of ['acfL', 'acfR']) want('iv' + s, t.iv.some(i => i.site === s), () => make.iv(s));
      want('io', !!t.io, () => make.io(t.io.site));
      for (const l of ['legL', 'legR', 'armL', 'armR']) want('tq' + l, !!t.tq[l], () => make.tq(l));
      for (const S of ['L', 'R']) { want('seal' + S, !!t.seal[S], () => make.seal(S, t.seal[S].vented)); want('dec' + S, !!t.decomp[S]?.ok, () => make.decomp(S)); }
      for (const [id, anchor] of [['backStab', 'backLower'], ['scalp', 'forehead'], ['femR', 'thighR']]) want('dr' + id, !!t.dressings[id], () => make.dressing(anchor));
    },
    update(dt, p, breath) { const b = items.bvm?.getObjectByName('bag'); if (b) { const s = 1 - 0.35 * breath; b.scale.set(0.8 * s, 0.8 * s, 1.5); } scr.material.emissiveIntensity = (p.tx.mon.ecg || p.tx.mon.spo2 || p.tx.mon.pads) ? 1.8 : 0.15; },
    monitorPort: monPort, kit,
    dispose() { body.removeFromParent(); kit.removeFromParent(); body.traverse(o => { if (o.geometry) o.geometry.dispose(); }); kit.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
