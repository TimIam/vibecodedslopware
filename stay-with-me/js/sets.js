// Interior sets: small, enclosed, furnished and lit rooms the game cuts to when the crew reaches an indoor patient.
//
//   listSets() -> ids
//   buildSet(id, { time: 'day'|'night'|'dusk', weather: 'clear'|'rain', seed, patient: 'floor'|'seat'|'bed' }) -> Set
//
// Each Set owns a THREE.Scene (geometry merged per material, its own lights, an environment map rendered from the
// room itself) plus the spots the game needs (patient, kit, partner, bystanders, camera home/bounds/colliders).
// Units metres, Y up, room centred on the origin with the floor at y = 0.
//
// Where things live: sets-tex.js (procedural textures, atlases, material palette), sets-kit.js (geometry builder,
// room shell, windows/doors, lights, env capture, spots), sets-props.js and sets-fixtures.js (shared furniture),
// and the rooms themselves, where layout, clutter and all lighting numbers are tuned:
//   sets-home.js (livingRoom), sets-home2.js (kitchen, bathroom, bedroom), sets-home3.js (motelRoom, elderFlat),
//   sets-public.js (office, diner, gym), sets-public2.js (bar, classroom), sets-works.js (stairwell, warehouse, garage).
// The look every room shares (occlusion decals, sun shafts and bounce, wear, soft furnishings, clutter that keeps clear of
// the people) is built into the kit: see the notes at the top of sets-kit.js. opts.ao = 0 turns the occlusion decals off.
// Patient modes: 'floor' (supine, head along the spot's -Z), 'seat' (chair/sofa, faces +Z, set.seatHeight) and
// 'bed' (sitting on the edge of the bed, faces +Z, set.seatHeight); a set without that furniture falls back to 'floor'
// and reports what it used in set.mode.

import * as THREE from 'three';
import { G } from './gfx.js';
import { Kit } from './sets-kit.js';
import { HOME } from './sets-home.js';
import { HOME2 } from './sets-home2.js';
import { HOME3 } from './sets-home3.js';
import { PUBLIC } from './sets-public.js';
import { PUBLIC2 } from './sets-public2.js';
import { WORKS } from './sets-works.js';

const ROOMS = { ...HOME, ...HOME2, ...HOME3, ...PUBLIC, ...PUBLIC2, ...WORKS };
const ORDER = ['livingRoom', 'kitchen', 'bathroom', 'bedroom', 'elderFlat', 'gym', 'diner', 'bar', 'office', 'classroom', 'warehouse', 'motelRoom', 'stairwell', 'garage'];

export function listSets() { return ORDER.filter(id => ROOMS[id]); }

export async function buildSet(id, opts = {}) {
  const build = ROOMS[id]; if (!build) throw new Error('unknown set: ' + id);
  const t0 = performance.now(), K = new Kit(id, opts), spec = build(K) || {}, tb = performance.now() - t0, set = await K.finish(spec);
  set.stats.geomMs = Math.round(tb);
  set.stats.buildMs = Math.round(performance.now() - t0);
  return set;
}

// dev harness: dev.html?m=sets&set=<id>&time=day|night|dusk&weather=rain&patient=floor|seat|bed
// window.__sets.load(id, opts) switches set; .view(n) jumps between check angles (0 = cameraHome).
export async function devDemo(ctx) {
  const { camera, controls, params } = ctx; let set = null, standins = null;
  camera.near = 0.05; camera.far = 120; camera.updateProjectionMatrix();
  const mk = (geo, col, o) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 })); m.castShadow = m.receiveShadow = true; o.add(m); return m; };
  function addStandins(s) {
    const g = new THREE.Group(); s.scene.add(g);
    const p = new THREE.Group(); p.position.copy(s.patientSpot.position); p.rotation.y = s.patientSpot.rotation.y; g.add(p);
    if (s.mode !== 'floor') { const t = mk(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), 0x8a94a8, p); t.position.set(0, 0.4, -0.05); const hd = mk(new THREE.SphereGeometry(0.11, 16, 12), 0xc8a890, p); hd.position.set(0, 0.86, -0.03); const l = mk(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), 0x4a5568, p); l.rotation.x = Math.PI / 2; l.position.set(0.1, 0.08, 0.25); const l2 = l.clone(); l2.position.x = -0.1; p.add(l2); for (const sx of [-0.1, 0.1]) { const sh = mk(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), 0x4a5568, p); sh.position.set(sx, -s.seatHeight + 0.25, 0.46); } }
    else { const t = mk(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), 0x8a94a8, p); t.rotation.x = Math.PI / 2; t.position.set(0, 0.14, -0.4); const hd = mk(new THREE.SphereGeometry(0.11, 16, 12), 0xc8a890, p); hd.position.set(0, 0.12, -0.84); for (const sx of [-0.1, 0.1]) { const l = mk(new THREE.CapsuleGeometry(0.075, 0.75, 4, 8), 0x4a5568, p); l.rotation.x = Math.PI / 2; l.position.set(sx, 0.09, 0.45); } }
    const pt = new THREE.Group(); pt.position.copy(s.partnerSpot.position); pt.rotation.y = s.partnerSpot.rotation.y; g.add(pt);
    const pb = mk(new THREE.CapsuleGeometry(0.18, 0.3, 6, 12), 0x1f3a2c, pt); pb.position.y = 0.55; const ph = mk(new THREE.SphereGeometry(0.11, 16, 12), 0xc8a890, pt); ph.position.y = 0.98; const pl = mk(new THREE.BoxGeometry(0.34, 0.2, 0.5), 0x1a2a22, pt); pl.position.set(0, 0.12, -0.12);
    const kit = mk(new THREE.BoxGeometry(0.5, 0.3, 0.28), 0xb02a1a, g); kit.position.copy(s.kitSpot.position).y += 0.15; kit.rotation.y = s.kitSpot.rotation.y;
    const mon = mk(new THREE.BoxGeometry(0.3, 0.26, 0.18), 0x2a2a2e, g); mon.position.copy(s.kitSpot.position).add(new THREE.Vector3(0.1, 0.13, 0.36).applyEuler(s.kitSpot.rotation));
    for (const b of s.bystanderSpots) { const bg = new THREE.Group(); bg.position.copy(b.position); bg.rotation.y = b.rotation.y; g.add(bg); const bb = mk(new THREE.CapsuleGeometry(0.18, 1.0, 6, 12), 0x6a5a4a, bg); bb.position.y = 0.72; const bh = mk(new THREE.SphereGeometry(0.11, 16, 12), 0xc8a890, bg); bh.position.y = 1.58; const nose = mk(new THREE.BoxGeometry(0.04, 0.04, 0.08), 0xc8a890, bg); nose.position.set(0, 1.58, 0.12); }
    return g;
  }
  async function load(id, o = {}) {
    if (set) { if (standins) standins.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); set.dispose(); set = null; }
    set = await buildSet(id, { time: 'day', weather: 'clear', seed: 1, patient: 'floor', ...o });
    standins = o.empty ? null : addStandins(set);
    G.view(set.scene, camera); G.renderer.toneMappingExposure = set.exposure;
    if (G.passes.bloom) { G.passes.bloom.strength = set.bloom; G.passes.bloom.radius = 0.6; G.passes.bloom.threshold = 1.0; }
    view(0); api.set = set; return { ...set.stats, mode: set.mode };
  }
  function view(n = 0, fov = 50) {
    const h = set.cameraHome, b = set.cameraBounds, c = set.patientSpot.position, tgt = h.target.clone(), pos = h.pos.clone();
    if (n > 0 && n < 4) { // orbit the patient by 90 degree steps, clamped into the camera bounds
      const off = pos.clone().sub(tgt), a = n * Math.PI / 2; pos.set(tgt.x + off.x * Math.cos(a) + off.z * Math.sin(a), pos.y, tgt.z - off.x * Math.sin(a) + off.z * Math.cos(a));
    } else if (n === 4) { pos.set(b.max.x - 0.05, Math.min(1.65, b.max.y), b.max.z - 0.05); tgt.set((b.min.x + b.max.x) / 2, 0.9, (b.min.z + b.max.z) / 2); }
    else if (n === 5) { pos.set(b.min.x + 0.05, Math.min(1.65, b.max.y), b.min.z + 0.05); tgt.set((b.min.x + b.max.x) / 2, 0.9, (b.min.z + b.max.z) / 2); }
    else if (n === 6) { pos.set(c.x + 0.5, 0.55, c.z + 0.9); tgt.set(c.x, 0.2, c.z - 0.2); }
    else if (n === 7) { pos.set(b.max.x - 0.05, Math.min(1.65, b.max.y), b.min.z + 0.05); tgt.set((b.min.x + b.max.x) / 2, 0.9, (b.min.z + b.max.z) / 2); }
    else if (n === 8) { pos.set(b.min.x + 0.05, Math.min(1.65, b.max.y), b.max.z - 0.05); tgt.set((b.min.x + b.max.x) / 2, 0.9, (b.min.z + b.max.z) / 2); }
    pos.clamp(b.min, b.max);
    camera.position.copy(pos); controls.target.copy(tgt); camera.fov = fov; camera.updateProjectionMatrix(); controls.update();
  }
  // sanity checks a level designer would otherwise find the hard way
  function check() {
    const out = [], s = set, inAny = (p, pad = 0) => s.colliders.findIndex(c => p.x > c.min.x - pad && p.x < c.max.x + pad && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z - pad && p.z < c.max.z + pad);
    if (!s.cameraBounds.containsPoint(s.cameraHome.pos)) out.push('cameraHome outside cameraBounds');
    if (inAny(s.cameraHome.pos, 0.05) >= 0) out.push('cameraHome inside collider ' + inAny(s.cameraHome.pos, 0.05));
    const chk = (name, o, y) => { const p = o.position.clone(); p.y = y; if (inAny(p) >= 0) out.push(name + ' inside a collider'); };
    chk('kitSpot', s.kitSpot, 0.15); chk('partnerSpot', s.partnerSpot, 0.5); s.bystanderSpots.forEach((b, i) => chk('bystander' + i, b, 0.9));
    if (s.mode === 'floor') { const m = s.patientSpot.matrixWorld; for (let ix = -1; ix <= 1; ix++) for (let iz = -2; iz <= 2; iz++) { const p = new THREE.Vector3(ix * 0.68, 0.12, -0.05 + iz * 0.53).applyMatrix4(m); if (inAny(p) >= 0) { out.push(`floor area blocked at local (${(ix * 0.68).toFixed(2)}, ${(-0.05 + iz * 0.53).toFixed(2)})`); } if (!s.cameraBounds.clone().expandByScalar(0.25).containsPoint(p.setY(1))) out.push('floor area outside room'); } }
    const d = s.cameraHome.pos.distanceTo(s.patientSpot.position); if (d < 0.5 || d > 3.2) out.push('cameraHome distance ' + d.toFixed(2));
    return out;
  }
  let cur = '';
  async function go(id, time = 'day', n = 0, o = {}) { const key = id + time + JSON.stringify(o); let st = null; if (key !== cur) { st = await load(id, { time, ...o }); cur = key; } view(n, o.fov); return st ? { ...st, check: check() } : undefined; }
  // build every set in every mode and report stats and layout problems
  async function audit(times = ['day', 'night']) { const out = {}; for (const id of listSets()) for (const tm of times) for (const p of ['floor', 'seat', 'bed']) { const st = await load(id, { time: tm, patient: p, empty: 1 }); if (p !== 'floor' && st.mode === 'floor') continue; const c = check(); out[id + '/' + tm + '/' + st.mode] = [st.tris, st.meshes, st.lights, st.shadowLights, st.buildMs, c.join('; ')].join(' | '); } cur = ''; return out; }
  const api = window.__sets = { audit, load, view, go, check, list: listSets(), set: null, info: () => ({ ...set.stats, calls: set.scene.children.length }) };
  await load(params.get('set') || 'livingRoom', { time: params.get('time') || 'day', weather: params.get('weather') || 'clear', patient: params.get('patient') || 'floor', seed: Number(params.get('seed') || 1), empty: params.has('empty') });
  return (dt, t) => { if (set) set.update(dt, t); };
}
