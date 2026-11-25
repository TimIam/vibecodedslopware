// Every vehicle in the game, built procedurally (no model files). This file is the public face: it re-exports the
// builders and holds the dev harness. The work is in:
//   vehicles-kit.js       geometry kit (`Builder`: grid / loft / sweep / tube / lathe / rbox accumulate triangles per
//                         material), skins, the vertex-attributed "surf" material (colour, roughness, metalness, lamp
//                         channel and a procedural surface effect per vertex, so chrome, rubber, plastic, tyres and every
//                         lamp of a vehicle are ONE draw call), clear-coated paint, glass, lamp halos, wheels, decals
//   vehicles-amb.js       Medic 14: livery / normal / grime atlases, exterior, cab, lights (AMB, EMERGENCY)
//   vehicles-cars.js      traffic and parked cars at three levels of detail (CAR_SPECS, COLOR_WEIGHTS)
//   vehicles-gear.js      motorcycle and the powered cot
//   vehicles-interior.js  the patient compartment as a closed room
// devDemo: dev.html?m=vehicles&v=amb | interior | stretcher | lineup | <car type>&lod=0..2, plus &doors=1, &dirt=0..1,
// &em=0 (the cab is the ambulance seen from __dev.cam(0.44, 1.82, 1.0, 0.44, 1.27, 11, 70)). The cars and the
// compartment have fuller harnesses of their own at ?m=vehicles-cars and ?m=vehicles-interior.
//
// Frame for every vehicle: origin on the ground under the middle of the wheelbase, +Z forward, +Y up, +X = the
// vehicle's LEFT.

import * as THREE from 'three';
import { U, patchWet } from './gfx.js';
import { makeRng } from './util.js';
import { buildAmbulance } from './vehicles-amb.js';
import { buildCar, CAR_TYPES, CAR_COLORS } from './vehicles-cars.js';
import { buildMotorcycle, buildStretcher } from './vehicles-gear.js';
import { buildAmbulanceInterior } from './vehicles-interior.js';

export { buildAmbulance, buildCar, CAR_TYPES, CAR_COLORS, buildMotorcycle, buildStretcher, buildAmbulanceInterior };

// ---------------------------------------------------------------------------------------------- dev harness

export async function devDemo(ctx) {
  const { scene, camera, controls, params } = ctx, v = params.get('v') || '', lod = +(params.get('lod') || 0);
  const gm = patchWet(new THREE.MeshStandardMaterial({ color: 0x3d3d40, roughness: 0.88 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ups = [], info = {}; window.__veh = info;
  const time = (name, fn) => { const t0 = performance.now(), r = fn(); info[name + 'Ms'] = +(performance.now() - t0).toFixed(1); return r; };
  const stats = o => { let calls = 0, tris = 0; o.traverse(m => { if (m.isMesh && m.visible) { calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.geometry.instanceCount || 1); } }); return { calls, tris: Math.round(tris) }; };
  info.stats = stats;
  if (CAR_TYPES.includes(v)) {
    const c = time('car', () => buildCar(v, { lod, seed: 3 })); scene.add(c.group); c.lights.setHead(1); c.lights.setEmergency(true); ups.push((dt, t) => c.lights.update(dt, t));
    info.car = c; info.carStats = stats(c.group); camera.position.set(4.5, 1.8, 5.5); controls.target.set(0, 0.8, 0);
  } else if (v === 'interior') {
    const it = time('interior', () => buildAmbulanceInterior()); it.group.position.y = 0.02; scene.add(it.group); info.interior = it; info.interiorStats = stats(it.group);
    const p = it.cameraHome.position, q = it.cameraHome.userData.target; camera.position.set(p.x, p.y + 0.02, p.z); controls.target.set(q.x, q.y, q.z); camera.fov = 72; camera.near = 0.03; camera.updateProjectionMatrix();
  } else if (v === 'stretcher' || v === 'moto') {
    const st = time('stretcher', () => buildStretcher()); st.group.position.x = -1; scene.add(st.group); info.stretcher = st; info.stretcherStats = stats(st.group);
    const mo = time('moto', () => buildMotorcycle()), m2 = buildMotorcycle({ onSide: true, color: 0x1b3562 }); mo.group.position.set(1.2, 0, 0); m2.group.position.set(3.2, 0, 0.5); scene.add(mo.group, m2.group); info.motoStats = stats(mo.group);
    ups.push((dt, t) => { st.setHeight(0.5 + 0.5 * Math.sin(t * 0.7)); st.setBackrest(0.5 + 0.5 * Math.sin(t * 0.5)); });
    camera.position.set(1.5, 1.5, 3.4); controls.target.set(0.3, 0.6, 0);
  } else if (v === 'lineup') {
    CAR_TYPES.forEach((ty, i) => { for (let l = 0; l < 3; l++) { const c = time(ty + l, () => buildCar(ty, { lod: l, seed: i * 7 + l })); c.group.position.set(i * 3.4 - 15, 0, l * -14); scene.add(c.group); c.lights.setHead(1); c.lights.setEmergency(true); ups.push((dt, t) => c.lights.update(dt, t)); info[ty + l] = stats(c.group); } });
    for (const [k, ty] of ['sedan', 'suv', 'hatch'].entries()) { const c = buildCar(ty, { lod: 2 }), im = new THREE.InstancedMesh(c.geometry, c.material, 10), m4 = new THREE.Matrix4(), rng = makeRng(5 + k); for (let i = 0; i < 10; i++) { im.setMatrixAt(i, m4.makeRotationY(k ? Math.PI : 0).setPosition(i * 2.7 - 12, 0, -40 - k * 6)); im.setColorAt(i, new THREE.Color(rng.pick(CAR_COLORS))); } im.castShadow = true; scene.add(im); }
    camera.position.set(-2, 7, 16); controls.target.set(0, 0.8, -6);
  } else {
    const amb = time('amb', () => buildAmbulance()); scene.add(amb.group); info.amb = amb; info.ambStats = stats(amb.group);
    amb.lights.setEmergency(params.get('em') !== '0'); amb.lights.setHead(1);
    // stand-ins for the point lights the game hangs on the anchors
    const pl = new THREE.PointLight(0xffffff, 0, 22, 2), pr = new THREE.PointLight(0xffffff, 0, 22, 2); amb.anchors.barL.add(pl); amb.anchors.barR.add(pr); pl.position.set(1.6, 0.7, 1.0); pr.position.set(-1.6, 0.7, 1.0);
    for (const n of ['headL', 'headR']) { const sl = new THREE.SpotLight(0xfff2dd, 160, 60, 0.45, 0.7, 1.6); amb.anchors[n].add(sl); sl.position.set(0, 0, 0); sl.target.position.set(0, -0.12, 1); amb.anchors[n].add(sl.target); }
    ups.push((dt, t) => { amb.lights.update(dt, t); U.uStrobe.value.copy(amb.lights.strobe); pl.color.copy(amb.lights.strobeL); pr.color.copy(amb.lights.strobeR); pl.intensity = pr.intensity = 14 * U.uNight.value; for (const n of ['headL', 'headR']) amb.anchors[n].children[0].intensity = 160 * U.uNight.value; });
    if (params.get('doors')) { amb.doors.setRear(1); amb.doors.setSide(0.8); amb.doors.setDriver(0.7); amb.lights.setInterior(true); amb.lights.setSceneLights(true); }
    if (params.get('dirt')) { amb.setDirt(+params.get('dirt')); amb.setDamage(+params.get('dirt')); amb.setWipers(true); }
    if (!v) [['sedan', -4.6, 3.5], ['suv', -4.8, -3], ['pickup', 5.4, -7]].forEach(([ty, x, z], i) => { const c = buildCar(ty, { lod: 1, seed: 11 + i }); c.group.position.set(x, 0, z); c.group.rotation.y = i * 0.2 - 0.1; scene.add(c.group); c.lights.setHead(1); });
    camera.position.set(6.5, 2.6, 8.5); controls.target.set(0, 1.3, -0.5);
  }
  controls.update();
  return (dt, t) => { for (const u of ups) u(dt, t); };
}

