// Townspeople: static figures standing on the sidewalks of Halloran Falls, alone or talking in pairs.
//
// A handful of prototype humans are built once (human.js, detail 'crowd'), and every mesh part of each prototype is drawn
// through one InstancedMesh. Only the people near the camera are written into the instance buffers, so cost follows what
// is on screen, not how many people live in town. Each person is also a collider: drive onto the sidewalk and you hit them.
//
// Tuning: COUNT (how many people exist), NEAR (how far they are drawn), MAX_NEAR (cap on screen), VARIANTS (who they are).

import * as THREE from 'three';
import { makeRng } from './util.js';
import { U } from './gfx.js';

const COUNT = 620, NEAR = 90, MAX_NEAR = 34;

const TOPS = [0x35506a, 0x6a3b35, 0x4d5a43, 0x2b2f38, 0x7a6a52, 0x5b4a66, 0x8a8f96, 0x2f5a5a, 0x7a2f3a];
const VARIANTS = [
  { sex: 'f', age: 34, heightM: 1.66, bmi: 23, skin: 0.35, hair: { style: 'long', color: 0x3a2a1a }, clothing: { top: 'jacket', bottom: 'trousers', shoes: 'trainers' } },
  { sex: 'm', age: 46, heightM: 1.80, bmi: 27, skin: 0.20, hair: { style: 'short', color: 0x2a2018 }, clothing: { top: 'shirt', bottom: 'trousers', shoes: 'boots' } },
  { sex: 'f', age: 67, heightM: 1.59, bmi: 26, skin: 0.15, hair: { style: 'bun', color: 0xc8c8c8 }, clothing: { top: 'jacket', bottom: 'skirt', shoes: 'trainers' } },
  { sex: 'm', age: 23, heightM: 1.76, bmi: 22, skin: 0.75, hair: { style: 'buzz', color: 0x16110e }, clothing: { top: 'hoodie', bottom: 'trousers', shoes: 'trainers' } },
  { sex: 'f', age: 28, heightM: 1.70, bmi: 21, skin: 0.85, hair: { style: 'curly', color: 0x1a1412 }, clothing: { top: 'tshirt', bottom: 'trousers', shoes: 'trainers' } },
  { sex: 'm', age: 71, heightM: 1.72, bmi: 25, skin: 0.30, hair: { style: 'balding', color: 0xb8b8b8 }, clothing: { top: 'jacket', bottom: 'trousers', shoes: 'boots' } },
  { sex: 'm', age: 35, heightM: 1.85, bmi: 30, skin: 0.50, hair: { style: 'short', color: 0x3a2a1a }, clothing: { top: 'hoodie', bottom: 'trousers', shoes: 'boots' } },
  { sex: 'f', age: 45, heightM: 1.63, bmi: 28, skin: 0.55, hair: { style: 'long', color: 0x4a3420 }, clothing: { top: 'shirt', bottom: 'trousers', shoes: 'trainers' } },
];
const BOTTOMS = [0x22242a, 0x2c3140, 0x3a3428, 0x1e2636, 0x45423c];

function blocked(town, x, z, pad, list) {
  list.length = 0; town.colliders?.query(x, z, 3, list);
  for (const o of list) {
    const rot = o.rot ?? o.yaw ?? 0, co = Math.cos(rot), si = Math.sin(rot), dx = x - o.x, dz = z - o.z, lx = dx * co - dz * si, lz = dx * si + dz * co;
    if (Math.abs(lx) < (o.hw ?? 0.3) + pad && Math.abs(lz) < (o.hd ?? 0.3) + pad) return true;
  }
  return false;
}

// Where people stand: sidewalk points near street lamps (which line every paved street), clear of furniture and doors.
function findSpots(town, rng) {
  const lamps = town.lamps || [], n = Math.floor(lamps.length / 3), spots = [], list = [];
  const places = Array.isArray(town.places) ? town.places : Object.values(town.places || {});
  const keepOut = []; for (const p of places) for (const q of [p, p.stop, p.spot, p.kerb]) if (q && Number.isFinite(q.x)) keepOut.push(q);
  const order = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const ok = (x, z) => town.surface(x, z) === 'sidewalk' && !blocked(town, x, z, 0.55, list) && !keepOut.some(q => Math.hypot(q.x - x, q.z - z) < 14) && !spots.some(s => Math.hypot(s.x - x, s.z - z) < 1.6);
  for (const i of order) {
    if (spots.length >= COUNT) break;
    const lx = lamps[i * 3], lz = lamps[i * 3 + 2];
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2, r = 1.6 + rng() * 3.4, x = lx + Math.cos(a) * r, z = lz + Math.sin(a) * r;
      if (!ok(x, z)) continue;
      // face the nearest carriageway (waiting to cross, watching traffic) or along the street
      let yaw = rng() * Math.PI * 2, best = 9;
      for (let d = 0; d < 8; d++) { const b = d * Math.PI / 4; for (let s = 1.5; s < 7; s += 1.5) if (town.surface(x + Math.sin(b) * s, z + Math.cos(b) * s) === 'road') { if (s < best) { best = s; yaw = b; } break; } }
      if (rng() < 0.45) yaw += (rng() < 0.5 ? 1 : -1) * Math.PI / 2 + (rng() - 0.5) * 0.6; else yaw += (rng() - 0.5) * 0.5;
      const v = Math.floor(rng() * VARIANTS.length);
      spots.push({ x, z, yaw, v });
      if (rng() < 0.34) {                              // someone to talk to
        const b = yaw + Math.PI / 2, px = x + Math.sin(b) * 0.85, pz = z + Math.cos(b) * 0.85;
        if (town.surface(px, pz) === 'sidewalk' && !blocked(town, px, pz, 0.5, list)) { spots[spots.length - 1].yaw = b + (rng() - 0.5) * 0.3; spots.push({ x: px, z: pz, yaw: b + Math.PI + (rng() - 0.5) * 0.3, v: (v + 1 + Math.floor(rng() * (VARIANTS.length - 1))) % VARIANTS.length }); }
      }
      break;
    }
  }
  return spots;
}

export async function buildPeds(town, H, scene, onProgress) {
  const rng = makeRng(99173), spots = findSpots(town, rng), protos = [];
  let heavy = false;
  for (let i = 0; i < VARIANTS.length; i++) {
    if (heavy && i >= 3) break;                         // no light tier available: keep the cast small
    const v = VARIANTS[i];
    const h = await H.buildHuman({ ...v, pose: 'standing', detail: 'crowd', eyes: 'open', seed: 300 + i * 17, clothing: { ...v.clothing, topColor: TOPS[(i * 5 + 2) % TOPS.length], bottomColor: BOTTOMS[i % BOTTOMS.length] } });
    h.group.position.set(0, 0, 0); h.group.rotation.set(0, 0, 0); h.group.updateMatrixWorld(true);
    const parts = []; let tris = 0;
    h.group.traverse(o => { if (!o.isMesh || !o.visible || o.isSkinnedMesh) return; let p = o, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; parts.push({ geo: o.geometry, mat: o.material, mx: o.matrixWorld.clone() }); });
    if (tris > 40000) heavy = true;
    protos.push({ parts, tris, meshes: [] });
    onProgress?.((i + 1) / VARIANTS.length);
    await new Promise(r => setTimeout(r, 0));
  }
  const cap = heavy ? 9 : MAX_NEAR, group = new THREE.Group(); group.name = 'townspeople';
  for (const s of spots) s.v %= protos.length;
  for (const p of protos) for (const part of p.parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, cap); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.userData.mx = part.mx;
    p.meshes.push(im); group.add(im);
  }
  scene.add(group);
  const colliders = spots.map(s => ({ x: s.x, z: s.z, hw: 0.24, hd: 0.2, rot: -s.yaw, h: 1.7, kind: 'person' }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), tmp = new THREE.Matrix4();
  const last = new THREE.Vector3(1e9, 0, 1e9); let lastNight = -1, near = [];
  const groundY = (x, z) => (town.heightAt ? town.heightAt(x, z) : 0) || 0;
  function refresh(cam) {
    // fewer people out at night and in the rain
    const night = U.uNight.value > 0.6, rain = U.uRain.value > 0.4, keep = night ? (rain ? 5 : 3) : (rain ? 2 : 1);
    near = [];
    for (let i = 0; i < spots.length; i++) { if (i % keep) continue; const s = spots[i], d = Math.hypot(s.x - cam.x, s.z - cam.z); if (d < NEAR) near.push({ s, d }); }
    near.sort((a, b) => a.d - b.d); if (near.length > cap) near.length = cap;
    for (const p of protos) for (const im of p.meshes) im.count = 0;
    for (const { s } of near) {
      const p = protos[s.v]; if (p.meshes[0].count >= cap) continue;
      q.setFromAxisAngle(up, s.yaw); pos.set(s.x, s.y ?? (s.y = groundY(s.x, s.z) + 0.15), s.z); m.compose(pos, q, one);
      for (const im of p.meshes) { tmp.multiplyMatrices(m, im.userData.mx); im.setMatrixAt(im.count++, tmp); }
    }
    for (const p of protos) for (const im of p.meshes) { im.instanceMatrix.needsUpdate = true; im.visible = im.count > 0; }
  }
  return {
    group, spots, colliders, heavy, protos,
    update(cam) { const n = (U.uNight.value > 0.6 ? 1 : 0) + (U.uRain.value > 0.4 ? 2 : 0); if (Math.hypot(cam.x - last.x, cam.z - last.z) < 6 && n === lastNight) return; last.copy(cam); lastNight = n; refresh(cam); },
    dispose() { scene.remove(group); for (const p of protos) for (const im of p.meshes) im.dispose(); },
  };
}
