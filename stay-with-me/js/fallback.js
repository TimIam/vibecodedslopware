// Plain stand-ins for the big art modules (town, vehicles, human, anatomy, sets). The game uses one only if the real
// module fails to load or throws, so a broken asset never stops a shift. They are deliberately crude.

import * as THREE from 'three';
import { patchWet } from './gfx.js';
import { makeRng } from './util.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o));

export const town = {
  async buildTown() {
    const group = new THREE.Group(), N = 7, S = 130, nodes = [], edges = [], rng = makeRng(5);
    const id = (i, j) => i * N + j;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) nodes.push({ id: id(i, j), x: (i - 3) * S, z: (j - 3) * S, control: (i + j) % 2 ? 'signal' : 'stop', edges: [], radius: 9 });
    const names = ['Alder St', 'Birch St', 'Cedar Ln', 'Dogwood Ave', 'Elm St', 'Fir St', 'Garland Ave', '1st Ave', '2nd Ave', '3rd Ave', '4th Ave', '5th Ave', '6th Ave', '7th Ave'];
    const add = (a, b, name) => { const e = { id: edges.length, a, b, name, cls: 'street', lanes: 1, laneWidth: 3.5, width: 9, median: 0, parking: false, speed: 13, bridge: false, stopAt: { a: true, b: true } }; edges.push(e); nodes[a].edges.push(e.id); nodes[b].edges.push(e.id); };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { if (i < N - 1) add(id(i, j), id(i + 1, j), names[j]); if (j < N - 1) add(id(i, j), id(i, j + 1), names[7 + i]); }
    const half = N * S / 2 + 60;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), patchWet(std(0x3b3d40, { roughness: 0.92 }))); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
    const boxes = [], geo = new THREE.BoxGeometry(1, 1, 1), mat = std(0x8a8078);
    const im = new THREE.InstancedMesh(geo, mat, (N - 1) * (N - 1) * 4); let k = 0; const m4 = new THREE.Matrix4();
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) for (let q = 0; q < 4; q++) { const cx = (i - 2.5) * S + (q % 2 ? 28 : -28), cz = (j - 2.5) * S + (q > 1 ? 28 : -28), h = 6 + rng() * 22, w = 38; m4.compose(new THREE.Vector3(cx, h / 2, cz), new THREE.Quaternion(), new THREE.Vector3(w, h, w)); im.setMatrixAt(k++, m4); boxes.push({ x: cx, z: cz, hw: w / 2, hd: w / 2, rot: 0, h, kind: 'building' }); }
    im.castShadow = im.receiveShadow = true; group.add(im);
    const P = (pid, name, n, dx = 0) => { const nd = nodes[n]; return { id: pid, name, x: nd.x + 40 + dx, z: nd.z + 12, heading: Math.PI / 2, stop: { x: nd.x + 40 + dx, z: nd.z + 1.8, heading: Math.PI / 2 }, spot: { x: nd.x + 40 + dx, z: nd.z + 8 }, kind: 'place' }; };
    const places = {}; ['station4', 'general', 'regional', 'ironworks', 'harbor', 'anchor', 'kessler', 'riverpark', 'maplewood', 'riverview', 'cascade', 'pinecrest', 'stmarks', 'skatepark', 'depot', 'construction', 'market', 'motel', 'brennan', 'highschool', 'library', 'courthouse'].forEach((p, i) => { places[p] = P(p, p, (i * 5 + 3) % (N * N - N)); });
    places.general.name = 'Halloran General Hospital'; places.regional.name = 'St. Brigid Regional Medical Center'; places.station4.name = 'Station 4';
    const addresses = []; for (let i = 0; i < 40; i++) { const nd = nodes[(i * 7 + 2) % (N * N - N)]; addresses.push({ id: 'a' + i, label: `${100 + i * 6} ${names[(i * 3) % 7]}`, x: nd.x + 50, z: nd.z + 12, stop: { x: nd.x + 50, z: nd.z + 1.8, heading: Math.PI / 2 }, spot: { x: nd.x + 50, z: nd.z + 8 }, kind: i % 3 ? 'house' : 'apartment', district: 'residential' }); }
    return { group, bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half }, nodes, edges, streetNames: names, signal: (n, e, t) => (Math.floor(t / 14) + (edges[e].name.includes('Ave') ? 1 : 0)) % 2 ? 'g' : 'r', surface: () => 'road', colliders: { query(x, z, r, out = []) { for (const b of boxes) if (Math.abs(b.x - x) < b.hw + r && Math.abs(b.z - z) < b.hd + r) out.push(b); return out; } }, places, addresses, lamps: new Float32Array(0), parking: [], spawn: places.station4.stop, map: null, update() { }, dispose() { } };
  },
};

export const vehicles = {
  buildAmbulance() {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 4.3), std(0xf2f2ee, { roughness: 0.4 })); box.position.set(0, 1.75, -1.3); const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.6, 2.6), std(0xf2f2ee, { roughness: 0.4 })); cab.position.set(0, 1.3, 2.1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.3), std(0x220000, { emissive: 0xff2010, emissiveIntensity: 0 })); bar.position.set(0, 2.2, 1.9); body.add(box, cab, bar);
    const wheels = [], steer = []; for (const [x, z, f] of [[1.05, 2.0, 1], [-1.05, 2.0, 1], [1.05, -2.0, 0], [-1.05, -2.0, 0]]) { const p = new THREE.Group(); p.position.set(x, 0.4, z); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 18), std(0x111111)); w.rotation.z = Math.PI / 2; const h = new THREE.Group(); h.add(w); p.add(h); group.add(p); wheels.push(h); if (f) steer.push(p); }
    const seat = new THREE.Object3D(); seat.position.set(0.5, 1.9, 1.9); body.add(seat);
    const strobe = new THREE.Color(), strobeL = new THREE.Color(), strobeR = new THREE.Color(); let on = false;
    return { group, body, wheels, steer, seat, dims: { length: 7.2, width: 2.3, height: 2.9, wheelbase: 4, track: 1.9, wheelRadius: 0.4 }, anchors: {}, cab: null,
      lights: { strobe, strobeL, strobeR, setHead() { }, setBrake() { }, setReverse() { }, setIndicators() { }, setInterior() { }, setSceneLights() { }, setEmergency(v) { on = v; }, update(dt, t) { const a = on && (t * 4 % 1) < 0.5, b = on && !a; strobeL.setRGB(a ? 1 : 0, 0, 0); strobeR.setRGB(b ? 1 : 0, b ? 1 : 0, b ? 1 : 0); strobe.setRGB(on ? 1 : 0, b ? 0.5 : 0, b ? 0.5 : 0); bar.material.emissiveIntensity = on ? 6 : 0; } },
      doors: { setRear() { }, setSide() { }, setDriver() { } }, setWipers() { }, setDamage() { }, setDirt() { } };
  },
};

// A jointed mannequin of capsules: enough to click on and to carry the gear.
export const human = {
  async buildHuman(spec = {}) {
    const g = new THREE.Group(), sit = /sitting|semi|slumped/.test(spec.pose), stand = /standing|kneeling/.test(spec.pose), h = spec.heightM || 1.75, k = h / 1.75;
    const skin = std(new THREE.Color().setHSL(0.07, 0.4, 0.72 - 0.45 * (spec.skin ?? 0.3)), { roughness: 0.6 }), top = std(spec.clothing?.topColor ?? 0x556677), bot = std(spec.clothing?.bottomColor ?? 0x2a3040);
    const cap = (r, len, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r * k, len * k, 6, 14), m); o.castShadow = true; return o; };
    // built supine: head toward -Z, face up; then re-posed
    const parts = { torso: cap(0.15, 0.36, top), pelvis: cap(0.145, 0.1, bot), head: cap(0.095, 0.06, skin), legL: cap(0.075, 0.74, bot), legR: cap(0.075, 0.74, bot), armL: cap(0.045, 0.52, skin), armR: cap(0.045, 0.52, skin) };
    const A = {}; const an = (n, x, y, z, nx = 0, ny = 1, nz = 0) => { A[n] = { pos: new THREE.Vector3(x * k, y * k, z * k), normal: new THREE.Vector3(nx, ny, nz).normalize() }; };
    const body = new THREE.Group(); g.add(body);
    const put = (o, x, y, z, rx = Math.PI / 2) => { o.position.set(x * k, y * k, z * k); o.rotation.x = rx; body.add(o); };
    put(parts.torso, 0, 0.13, -0.36); put(parts.pelvis, 0, 0.12, 0); put(parts.head, 0, 0.12, -0.78); put(parts.legL, 0.1, 0.09, 0.5); put(parts.legR, -0.1, 0.09, 0.5); put(parts.armL, 0.27, 0.07, -0.25); put(parts.armR, -0.27, 0.07, -0.25);
    an('forehead', 0, 0.22, -0.82); an('eyeL', 0.03, 0.215, -0.78); an('eyeR', -0.03, 0.215, -0.78); an('nose', 0, 0.225, -0.75); an('mouth', 0, 0.215, -0.71); an('chin', 0, 0.2, -0.67); an('earL', 0.09, 0.13, -0.78, 1, 0, 0); an('earR', -0.09, 0.13, -0.78, -1, 0, 0);
    an('neckFront', 0, 0.2, -0.62); an('carotidL', 0.04, 0.19, -0.62); an('carotidR', -0.04, 0.19, -0.62); an('sternalNotch', 0, 0.25, -0.57); an('sternumCPR', 0, 0.28, -0.4); an('ics2L', 0.08, 0.27, -0.5); an('ics2R', -0.08, 0.27, -0.5); an('ics5L', 0.14, 0.18, -0.36, 1, 0.5, 0); an('ics5R', -0.14, 0.18, -0.36, -1, 0.5, 0); an('apex', 0.08, 0.27, -0.36); an('xiphoid', 0, 0.28, -0.29); an('epigastrium', 0, 0.27, -0.24);
    an('ruq', -0.08, 0.26, -0.18); an('luq', 0.08, 0.26, -0.18); an('rlq', -0.08, 0.26, -0.06); an('llq', 0.08, 0.26, -0.06); an('umbilicus', 0, 0.27, -0.12); an('pelvisL', 0.13, 0.2, 0, 1, 1, 0); an('pelvisR', -0.13, 0.2, 0, -1, 1, 0); an('groinL', 0.08, 0.22, 0.08); an('groinR', -0.08, 0.22, 0.08);
    for (const [S, sx] of [['L', 1], ['R', -1]]) { an('thigh' + S, 0.1 * sx, 0.165, 0.3); an('thighLat' + S, 0.17 * sx, 0.1, 0.3, sx, 0.3, 0); an('knee' + S, 0.1 * sx, 0.165, 0.5); an('tibia' + S, 0.09 * sx, 0.16, 0.58); an('ankle' + S, 0.1 * sx, 0.15, 0.88); an('foot' + S, 0.1 * sx, 0.2, 0.95); an('deltoid' + S, 0.22 * sx, 0.2, -0.52, sx, 1, 0); an('upperArm' + S, 0.27 * sx, 0.115, -0.4); an('acf' + S, 0.27 * sx, 0.115, -0.25); an('forearm' + S, 0.27 * sx, 0.115, -0.12); an('wrist' + S, 0.27 * sx, 0.115, 0.0); an('hand' + S, 0.27 * sx, 0.11, 0.05); an('finger' + S, 0.27 * sx, 0.1, 0.1); }
    an('backUpper', 0, 0, -0.45, 0, -1, 0); an('backLower', 0, 0, -0.15, 0, -1, 0);
    let seat = null;
    if (sit) { // fold at the hips: trunk upright facing +Z
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 * (spec.pose === 'semi' ? 0.5 : 1));
      for (const o of [parts.torso, parts.head, parts.armL, parts.armR]) { o.position.applyQuaternion(q); o.quaternion.premultiply(q); }
      for (const n in A) if (!/thigh|knee|tibia|ankle|foot|groin|pelvis/.test(n)) { A[n].pos.applyQuaternion(q); A[n].normal.applyQuaternion(q); }
      seat = 0; body.position.y = 0; if (spec.pose !== 'semi') seat = 0.02;
    } else if (stand) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); body.quaternion.copy(q); body.position.y = spec.pose === 'kneeling' ? 0.55 * k : 0.98 * k; if (spec.pose === 'kneeling') { parts.legL.visible = parts.legR.visible = false; } }
    g.updateMatrixWorld(true);
    return { group: g, spec, anchors: A, bones: {}, seat, skinMesh: g, clothes: {}, sdf: p => { let d = 1e9; for (const n in A) d = Math.min(d, p.distanceTo(A[n].pos)); return d - 0.02; },
      expose() { parts.torso.material = skin; }, setBreath(v) { parts.torso.scale.x = 1 + v * 0.05; }, setCompress() { }, setSkin(s) { skin.color.setHSL(0.07 - 0.02 * (s.cyanosis || 0), 0.4 * (1 - (s.pallor || 0) * 0.7), (0.72 - 0.45 * (spec.skin ?? 0.3)) * (1 + 0.1 * (s.pallor || 0))); }, setEyes() { }, setMouth() { }, setJVD() { }, setTrachea() { }, addWound() { return 0; }, setBleed() { }, setGround() { }, update() { }, dispose() { g.traverse(o => o.geometry?.dispose()); } };
  },
};

// A layered slab model hung on the surface anchors: depth below the skin decides the tissue, with ribs as bands along
// the trunk, a windpipe behind the front of the neck, a vein in each elbow crease and a tibia under each shin.
export const anatomy = {
  T: { AIR: 0, SKIN: 1, FAT: 2, MUSCLE: 3, BONE: 4, PLEURAL_SPACE: 5, LUNG: 6, AIRWAY_LUMEN: 7, MEMBRANE: 8, VEIN: 9, MARROW: 10, MYOCARDIUM: 11, PERICARDIAL_SPACE: 12, CARTILAGE: 13, ARTERY: 14 },
  buildAnatomy(human) {
    const A = human.anchors, T = anatomy.T, st = { pneumoL: 0, pneumoR: 0, tamponade: 0 }, bmi = human.spec?.bmi || 24, fat = 0.004 + Math.max(0, bmi - 18) * 0.0009;
    const near = (p, n, r) => A[n] && p.distanceTo(A[n].pos) < r;
    const axis = A.sternalNotch && A.xiphoid ? A.sternalNotch.pos.clone().sub(A.xiphoid.pos).normalize() : new THREE.Vector3(0, 0, -1);
    const sample = p => {
      const d = -human.sdf(p); if (d < 0) return { t: T.AIR, name: 'air', side: '' };
      const side = p.x >= 0 ? 'L' : 'R';
      if (d < 0.002) return { t: T.SKIN, name: 'skin', side };
      if (near(p, 'neckFront', 0.05)) { const off = Math.abs(p.clone().sub(A.neckFront.pos).dot(axis)); if (d < 0.002 + fat * 0.6) return { t: T.FAT, name: 'subcutaneous fat', side }; if (d < 0.004 + fat * 0.6) return off < 0.006 ? { t: T.MEMBRANE, name: 'cricothyroid membrane', side } : { t: T.CARTILAGE, name: p.clone().sub(A.neckFront.pos).dot(axis) > 0 ? 'thyroid cartilage' : 'cricoid cartilage', side }; if (d < 0.022 + fat * 0.6) return { t: T.AIRWAY_LUMEN, name: 'airway lumen', side }; return { t: T.MUSCLE, name: 'oesophagus', side }; }
      for (const s of ['L', 'R']) { if (near(p, 'acf' + s, 0.03)) { const lat = Math.abs(p.x - A['acf' + s].pos.x); if (d > 0.003 && d < 0.0075 && lat < 0.004) return { t: T.VEIN, name: 'median cubital vein', side: s }; if (d < 0.012) return { t: T.FAT, name: 'subcutaneous fat', side: s }; return { t: T.MUSCLE, name: 'muscle', side: s }; }
        if (near(p, 'tibia' + s, 0.05)) { if (d < 0.005) return { t: T.FAT, name: 'subcutaneous fat', side: s }; if (d < 0.009) return { t: T.BONE, name: 'tibia cortex', side: s }; if (d < 0.03) return { t: T.MARROW, name: 'tibia marrow', side: s }; return { t: T.BONE, name: 'tibia cortex', side: s }; } }
      if (d < 0.002 + fat) return { t: T.FAT, name: 'subcutaneous fat', side };
      const chest = A.sternumCPR && p.distanceTo(A.sternumCPR.pos) < 0.24;
      if (!chest) return { t: T.MUSCLE, name: 'muscle', side };
      const wall = 0.002 + fat + 0.022; if (d < wall) return { t: T.MUSCLE, name: 'pectoralis major', side };
      const along = p.clone().sub(A.xiphoid?.pos || A.sternumCPR.pos).dot(axis), band = ((along % 0.03) + 0.03) % 0.03;
      if (d < wall + 0.012) { if (band < 0.012) return { t: T.BONE, name: 'rib ' + Math.max(1, 7 - Math.floor(along / 0.03)), side }; if (band < 0.016) return { t: T.ARTERY, name: 'intercostal artery', side }; return { t: T.MUSCLE, name: 'intercostal muscle', side }; }
      const gap = 0.002 + 0.05 * st['pneumo' + side]; if (d < wall + 0.012 + gap) return { t: T.PLEURAL_SPACE, name: 'pleural space', side };
      if (Math.abs(p.x) < 0.05 && A.apex && p.distanceTo(A.apex.pos) < 0.12 && d > 0.05) { if (st.tamponade > 0.05 && d < 0.05 + 0.02 * st.tamponade + 0.004) return { t: T.PERICARDIAL_SPACE, name: 'pericardial space', side: '' }; return { t: T.MYOCARDIUM, name: 'right ventricle', side: '' }; }
      return { t: T.LUNG, name: (side === 'L' ? 'left' : 'right') + ' lung', side };
    };
    const P = new THREE.Vector3();
    return { sample, trace(o, dir, max, step = 0.0005) { const out = []; let cur = null; for (let s = 0; s <= max; s += step) { const r = sample(P.copy(o).addScaledVector(dir, s)); if (!cur || cur.name !== r.name || cur.side !== r.side) { if (cur) cur.to = s; cur = { t: r.t, name: r.name, side: r.side, from: s, to: s }; out.push(cur); } } if (cur) cur.to = max; return out.filter(s => s.name !== 'air'); },
      surface(p) { const q = p.clone(); const n = new THREE.Vector3(human.sdf(q.clone().setX(p.x + 0.002)) - human.sdf(p), human.sdf(q.clone().setY(p.y + 0.002)) - human.sdf(p), human.sdf(q.clone().setZ(p.z + 0.002)) - human.sdf(p)).normalize(); for (let d = 0.003; d < 0.06; d += 0.002) { const r = sample(P.copy(p).addScaledVector(n, -d)); if (r.t === T.BONE) return { feel: /rib/.test(r.name) ? 'rib' : 'flat bone surface', wall: d }; if (r.t === T.CARTILAGE) return { feel: r.name, wall: d }; if (r.t === T.MEMBRANE) return { feel: 'cricothyroid membrane (soft dip)', wall: d }; if (r.t === T.VEIN) return { feel: 'a soft, bouncy vein', wall: d }; if (r.t === T.PLEURAL_SPACE) return { feel: 'intercostal space', wall: d }; } return { feel: 'soft tissue', wall: 0.03 }; },
      group: new THREE.Group(), show() { }, setXray() { }, setState(s) { Object.assign(st, s); }, update() { }, openings: { add() { return 0; }, set() { }, remove() { }, clear() { }, setThoracotomy() { } } };
  },
};

export const sets = {
  listSets: () => [],
  async buildSet(id, opts = {}) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0d0f);
    const W = 5.2, D = 4.4, H = 2.5, wall = std(0xb8b2a6, { roughness: 0.95, side: THREE.BackSide }), room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wall); room.position.y = H / 2; room.receiveShadow = true; scene.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0x6b5a48, { roughness: 0.7 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true; scene.add(floor);
    const key = new THREE.SpotLight(0xfff0dc, 60, 12, 1.0, 0.7, 1.4); key.position.set(1.2, 2.4, 1.0); key.target.position.set(0, 0, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target); scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a2c, 0.55));
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), std(0x40464e)); chair.position.set(-0.9, 0.225, -1.2); chair.castShadow = true;
    const seat = opts.patient === 'seat' || opts.patient === 'bed'; if (seat) scene.add(chair);
    const O = (x, y, z, yaw = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = yaw; scene.add(o); o.updateMatrixWorld(true); return o; };
    return { id, scene, exposure: 1.0, bloom: 0.15, patientSpot: seat ? O(-0.9, 0.45, -1.2, 0) : O(0, 0, 0.3, 0), seatHeight: seat ? 0.45 : 0, kitSpot: O(0.95, 0, 0.1, -0.5), partnerSpot: seat ? O(-0.2, 0, -0.9, -1.2) : O(-0.62, 0, -0.1, Math.PI / 2), bystanderSpots: [O(1.6, 0, -1.4, -2.2)], cameraHome: { pos: new THREE.Vector3(1.7, 1.5, 2.0), target: new THREE.Vector3(0, 0.3, 0) }, cameraBounds: new THREE.Box3(new THREE.Vector3(-W / 2 + 0.2, 0.15, -D / 2 + 0.2), new THREE.Vector3(W / 2 - 0.2, H - 0.15, D / 2 - 0.2)), colliders: [], update() { }, dispose() { scene.traverse(o => o.geometry?.dispose()); } };
  },
};
