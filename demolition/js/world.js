// The data hall: layout, physics bodies, instanced visuals, and what happens when you hit things.
import * as THREE from 'three';
import { Kit, part, firstPart, bodyMatrix } from './kit.js';
import { RACK, ROWS, RACKS_PER_ROW, RACK_X0, HALL, SERVER, COST } from './config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const RY = a => new THREE.Matrix4().makeRotationY(a);
// loose debris: membership bit 3, collides with everything except the player (bit 1), so parts on the floor never block you
const DEBRIS_GROUPS = 0x0004FFFE;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// Geometric centre + half extents of every detachable piece, in its asset's local (glTF, Y-up) frame.
const PIECES = {
  door_front:  { c: V(0, 1.0225, 0.5225), h: V(0.295, 0.9325, 0.0125), mass: 14, cost: COST.door, label: 'Rack door' },
  door_rear_L: { c: V(-0.15, 1.0225, -0.5225), h: V(0.147, 0.9325, 0.0125), mass: 8, cost: COST.door, label: 'Rack door' },
  door_rear_R: { c: V(0.15, 1.0225, -0.5225), h: V(0.147, 0.9325, 0.0125), mass: 8, cost: COST.door, label: 'Rack door' },
  side_L:      { c: V(-0.294, 1.02, 0), h: V(0.006, 0.935, 0.48), mass: 10, cost: COST.sidePanel, label: 'Rack side panel' },
  side_R:      { c: V(0.294, 1.02, 0), h: V(0.006, 0.935, 0.48), mass: 10, cost: COST.sidePanel, label: 'Rack side panel' },
  pdu_A:       { c: V(-0.255, 1.0, -0.445), h: V(0.0275, 0.8, 0.0225), mass: 6, cost: COST.rackPdu, label: 'Rack PDU strip' },
  pdu_B:       { c: V(0.255, 1.0, -0.445), h: V(0.0275, 0.8, 0.0225), mass: 6, cost: COST.rackPdu, label: 'Rack PDU strip' },
  panel_controls: { c: V(-0.8, 1.04, 0.438), h: V(0.35, 0.94, 0.0125), mass: 18, cost: COST.cracPanel, label: 'CRAC panel' },
  panel_grille:   { c: V(0.37, 1.03, 0.438), h: V(0.78, 0.93, 0.0125), mass: 24, cost: COST.cracPanel, label: 'CRAC panel' },
  door:        { c: V(0, 1.03, 0.363), h: V(0.48, 0.94, 0.012), mass: 22, cost: COST.pduDoor, label: 'PDU door' },
  ups_door:    { c: V(0, 1.04, 0.413), h: V(0.58, 0.95, 0.012), mass: 26, cost: COST.pduDoor, label: 'UPS door' },
  battery_door:{ c: V(1.0, 1.04, 0.413), h: V(0.38, 0.95, 0.012), mass: 18, cost: COST.pduDoor, label: 'Battery cabinet door' },
  tile:        { c: V(0, 0.0175, 0), h: V(0.3, 0.0175, 0.3), mass: 13, cost: COST.tile, label: 'Floor tile' },
  cables:      { c: V(0, 0.03, 0), h: V(1.5, 0.012, 0.17), mass: 30, cost: COST.trayCables, label: 'Cable tray run (re-pulled, re-terminated)' },
  tray:        { c: V(0, 0.05, 0), h: V(1.5, 0.05, 0.225), mass: 25, cost: 600, label: 'Ladder tray section' },
  fiber_duct:  { c: V(0, 0.05, 0), h: V(1.5, 0.05, 0.05), mass: 6, cost: COST.fiberCut, label: 'Fibre trunk cut (splicing, re-certification)' },
  agent_cylinder: { c: V(0, 0.75, 0), h: V(0.2, 0.75, 0.2), mass: 180, cost: COST.cylinder, label: 'Clean-agent cylinder' },
};

export class World {
  constructor(G) {
    this.G = G; const { scene, phys, R, assets } = G;
    this.ents = G.ents; this.racks = []; this.cracs = []; this.pdus = []; this.upss = []; this.batteries = [];
    this.tiles = []; this.trays = []; this.ducts = []; this.taps = []; this.glass = []; this.cyls = []; this.loose = [];
    this.fixtures = []; this.strobes = []; this.servers = []; this.doorsOpen = new Set(); this.time = 0;
    this.kits = {};
    this.buildRoom();
    this.buildFloor();
    this.buildRacks();
    this.buildPlant();
    this.buildOverhead();
    this.buildSafety();
  }

  // ---------------------------------------------------------------- helpers
  kit(name, meshes, cap, opts) { const k = new Kit(meshes, cap, this.G.scene, opts); this.kits[name] = k; return k; }
  fixedBox(cx, cy, cz, hx, hy, hz, ent, rotY = 0) {
    const { R, phys } = this.G;
    const b = phys.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation(quatY(rotY)));
    const c = phys.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.7), b);
    if (ent) { ent.collider = c; ent.body = b; this.ents.set(c.handle, ent); }
    return c;
  }
  /** root matrix for an asset placed at p facing rotY */
  root(x, y, z, rotY = 0) { return T(x, y, z).multiply(RY(rotY)); }
  cost(key, label, n, cost) { this.G.systems.ledger.add(key, label, n, cost); }
  log(msg, cls) { this.G.hud.log(msg, cls); }

  // ---------------------------------------------------------------- room shell
  buildRoom() {
    const { scene } = this.G; const hx = HALL.x / 2, hz = HALL.z / 2, H = HALL.h, P = HALL.plenum;
    const wall = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.85 });
    const slab = new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.95 });
    const ceil = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.9 });
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m; };
    add(new THREE.BoxGeometry(HALL.x + 0.4, 0.2, HALL.z + 0.4), slab, 0, -P - 0.1, 0);           // concrete slab under the plenum
    add(new THREE.BoxGeometry(HALL.x + 0.4, 0.2, HALL.z + 0.4), ceil, 0, H + 0.1, 0);            // ceiling
    const wg = new THREE.BoxGeometry(HALL.x + 0.4, H + P + 0.4, 0.2), wg2 = new THREE.BoxGeometry(0.2, H + P + 0.4, HALL.z + 0.4);
    add(wg, wall, 0, (H - P) / 2, -hz - 0.1); add(wg, wall, 0, (H - P) / 2, hz + 0.1);
    add(wg2, wall, -hx - 0.1, (H - P) / 2, 0); add(wg2, wall, hx + 0.1, (H - P) / 2, 0);
    // door on the east wall
    const door = add(new THREE.BoxGeometry(0.06, 2.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x5a5e63, roughness: 0.6, metalness: 0.4 }), hx - 0.03, 1.05, 4.5);
    add(new THREE.BoxGeometry(0.03, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x27a84a, emissive: 0x1a7a30, emissiveIntensity: 1.2 }), hx - 0.1, 2.4, 4.5); // exit sign
    // yellow safety line down the main walkway ends
    const line = new THREE.MeshStandardMaterial({ color: 0xe8c43a, roughness: 0.8 });
    add(new THREE.BoxGeometry(0.08, 0.003, HALL.z - 2), line, -7.3, 0.002, 0); add(new THREE.BoxGeometry(0.08, 0.003, HALL.z - 2), line, 7.3, 0.002, 0);
    // under-floor cabling
    const uf = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    for (const r of ROWS) for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.025, 0.025, 13, 8), uf, 0, -0.35 - k * 0.07, r.z + 0.1 + k * 0.08, 0).rotation.z = Math.PI / 2;
    const cw = new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.5, metalness: 0.6 });
    for (const z of [-6.9, 6.9]) add(new THREE.CylinderGeometry(0.08, 0.08, HALL.x - 2, 12), cw, 0, -0.3, z).rotation.z = Math.PI / 2; // chilled water mains
    // colliders
    this.fixedBox(0, -P - 0.1, 0, hx + 0.2, 0.1, hz + 0.2, { kind: 'slab' });
    this.fixedBox(0, H + 0.1, 0, hx + 0.2, 0.1, hz + 0.2, { kind: 'ceiling' });
    this.fixedBox(0, 1.5, -hz - 0.1, hx + 0.2, 3, 0.1, { kind: 'wall' }); this.fixedBox(0, 1.5, hz + 0.1, hx + 0.2, 3, 0.1, { kind: 'wall' });
    this.fixedBox(-hx - 0.1, 1.5, 0, 0.1, 3, hz + 0.2, { kind: 'wall' }); this.fixedBox(hx + 0.1, 1.5, 0, 0.1, 3, hz + 0.2, { kind: 'wall' });
    this.ents.set(this.fixedBox(hx - 0.03, 1.05, 4.5, 0.04, 1.05, 0.5, { kind: 'exit' }).handle, { kind: 'exit' });
  }

  // ---------------------------------------------------------------- raised floor
  buildFloor() {
    const { assets } = this.G; const nx = Math.round(HALL.x / HALL.tile), nz = Math.round(HALL.z / HALL.tile);
    this.nx = nx; this.nz = nz; this.tileX0 = -HALL.x / 2 + 0.3; this.tileZ0 = -HALL.z / 2 + 0.3;
    const solid = this.kit('tile_solid', part(assets.floor, 'tile_solid'), nx * nz, { shadow: false });
    const perf = this.kit('tile_perf', part(assets.floor, 'tile_perf'), 200, { shadow: false });
    const ped = this.kit('pedestal', part(assets.floor, 'pedestal'), (nx + 1) * (nz + 1), { shadow: false });
    const str = this.kit('stringer', part(assets.floor, 'stringer'), (nx + 1) * nz + nx * (nz + 1), { shadow: false });
    solid.prims.forEach(p => p.mesh.receiveShadow = true); perf.prims.forEach(p => p.mesh.receiveShadow = true);
    const coldAisle = z => (z > -2.87 && z < -1.67) || (z > 1.67 && z < 2.87);
    this.perfTotal = 0;
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = this.tileX0 + ix * 0.6, z = this.tileZ0 + iz * 0.6;
      const isPerf = coldAisle(z) && Math.abs(x) < 6.1;
      const k = isPerf ? perf : solid, idx = k.alloc(); k.set(idx, T(x, -0.035, z));
      const t = { kind: 'tile', ix, iz, x, z, kit: k, idx, perf: isPerf, removed: false, occupied: false };
      this.fixedBox(x, -0.0175, z, 0.3, 0.0175, 0.3, t);
      this.tiles.push(t); if (isPerf) this.perfTotal++;
    }
    for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
      const x = this.tileX0 - 0.3 + ix * 0.6, z = this.tileZ0 - 0.3 + iz * 0.6;
      ped.set(ped.alloc(), T(x, -HALL.plenum, z));
      if (ix < nx) str.set(str.alloc(), T(x + 0.3, -HALL.plenum, z));
      if (iz < nz) str.set(str.alloc(), T(x, -HALL.plenum, z + 0.3).multiply(RY(Math.PI / 2)));
    }
    this.perfInPlace = this.perfTotal; this.holes = 0;
    solid.commit(); perf.commit(); ped.commit(); str.commit();
  }
  tileAt(x, z) {
    const ix = Math.round((x - this.tileX0) / 0.6), iz = Math.round((z - this.tileZ0) / 0.6);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return null;
    return this.tiles[ix * this.nz + iz];
  }
  occupy(x, z, hx, hz) {
    for (const t of this.tiles) if (Math.abs(t.x - x) < hx + 0.29 && Math.abs(t.z - z) < hz + 0.29) t.occupied = true;
  }

  // ---------------------------------------------------------------- racks and servers
  buildRacks() {
    const { assets, R, phys } = this.G;
    const names = ['frame', 'side_L', 'side_R', 'door_front', 'door_rear_L', 'door_rear_R', 'pdu_A', 'pdu_B'];
    const N = ROWS.length * RACKS_PER_ROW;
    for (const n of names) this.kit(n, part(assets.rack, n), N);
    // plan contents first so server kits get exact capacities
    const plans = []; const counts = { '1u': 0, '2u': 0, gpu: 0 };
    ROWS.forEach((row, ri) => { for (let col = 0; col < RACKS_PER_ROW; col++) {
      const list = [];
      const put = (type, u) => { list.push({ type, u }); counts[type]++; };
      if (row.kind === 'gpu' && col >= 5 && col < 15) { for (let i = 0; i < 4; i++) put('gpu', i * 4); put('1u', 34); put('1u', 35); }
      else if (row.kind === 'storage' && col < 10) { for (let i = 0; i < 18; i++) put('2u', i * 2); }
      else { for (let i = 0; i < 36; i++) put('1u', i); }
      put('1u', 40); // top-of-rack switch
      plans.push(list);
    } });
    // servers live inside closed cabinets: receiving shadows is enough, casting them would redraw 2,500 chassis in the shadow pass
    const sk = { '1u': this.kit('server1u', firstPart(assets.server1u), counts['1u'], { cast: false }), '2u': this.kit('server2u', firstPart(assets.server2u), counts['2u'], { cast: false }), gpu: this.kit('gpu', firstPart(assets.gpu4u), counts.gpu) };
    ROWS.forEach((row, ri) => { for (let col = 0; col < RACKS_PER_ROW; col++) {
      const id = ri * RACKS_PER_ROW + col, x = RACK_X0 + col * 0.6, z = row.z, rotY = row.face > 0 ? 0 : Math.PI;
      const body = phys.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, 0, z).setRotation(quatY(rotY)).setLinearDamping(0.2).setAngularDamping(0.5));
      const rack = { kind: 'rack', id, row: ri, col, name: `${row.name}-${String(col + 1).padStart(2, '0')}`, body, bolted: true, boltDamage: 0, toppled: false, destroyed: false,
        parts: Object.fromEntries(names.map(n => [n, true])), servers: [], kw: 0, drives: 0, powered: true, feedA: true, feedB: true, breakerTripped: false,
        thermalTrip: false, net: true, fire: 0, water: false, gpu: false, offline: false, toppledAt: 0, chain: 0, root: new THREE.Matrix4(), dirty: true, isGpu: false };
      const col_ = phys.createCollider(R.ColliderDesc.cuboid(0.29, 0.995, 0.525).setTranslation(0, 1.0, 0).setMass(RACK.mass).setFriction(0.6)
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(12000), body);
      rack.collider = col_; this.ents.set(col_.handle, rack);
      for (const p of plans[id]) {
        const spec = SERVER[p.type], k = sk[p.type], idx = k.alloc();
        const sv = { kind: 'server', type: p.type, u: p.u, kit: k, idx, rack, attached: true, destroyed: false, body: null, local: T(0, RACK.bottomU + p.u * RACK.U, spec.zOff), spec };
        rack.servers.push(sv); this.servers.push(sv); rack.kw += spec.kw; rack.drives += spec.drives; if (p.type === 'gpu') rack.isGpu = true;
      }
      this.racks.push(rack); this.occupy(x, z, 0.3, 0.535);
    } });
    this.racks.forEach(r => this.syncRack(r, true));
  }
  rackNeighbors(rack) { return this.racks.filter(r => r.row === rack.row && Math.abs(r.col - rack.col) === 1); }
  syncRack(rack, force = false) {
    if (!force && rack.body.isSleeping() && !rack.dirty) return;
    bodyMatrix(rack.body, rack.root);
    for (const n in rack.parts) if (rack.parts[n]) this.kits[n].set(rack.id, rack.root);
    for (const sv of rack.servers) if (sv.attached) sv.kit.set(sv.idx, _m.multiplyMatrices(rack.root, sv.local));
    rack.dirty = false;
  }
  setRackLeds(rack, on) {
    for (const sv of rack.servers) if (sv.attached && !sv.destroyed) sv.kit.setLeds(sv.idx, on);
    for (const n of ['pdu_A', 'pdu_B']) if (rack.parts[n]) this.kits[n].setLeds(rack.id, on);
  }

  // ---------------------------------------------------------------- CRACs, PDUs, UPS
  buildPlant() {
    const { assets } = this.G;
    const cracBody = this.kit('crac_body', part(assets.crac, 'body'), 8), fans = this.kit('crac_fans', part(assets.crac, 'fans'), 8), coil = this.kit('crac_coil', part(assets.crac, 'coil'), 8);
    this.kit('panel_controls', part(assets.crac, 'panel_controls'), 8); this.kit('panel_grille', part(assets.crac, 'panel_grille'), 8);
    [-9, -3, 3, 9].forEach(x => [[-7.6, 0], [7.6, Math.PI]].forEach(([z, ry]) => {
      const id = this.cracs.length, root = this.root(x, 0, z, ry);
      const c = { kind: 'crac', id, name: `CRAC-${id + 1}`, root, pos: V(x, 1, z), on: true, alive: true, parts: { panel_controls: true, panel_grille: true }, fansAlive: true, coilAlive: true, ry };
      for (const n of ['crac_body', 'crac_fans', 'crac_coil', 'panel_controls', 'panel_grille']) this.kits[n].set(id, root);
      this.fixedBox(x, 1.0, z, 1.15, 1.0, 0.46, c, ry); this.cracs.push(c); this.occupy(x, z, 1.15, 0.46);
    }));
    this.kit('pdu_cabinet', part(assets.pdu, 'cabinet'), 4); this.kit('pdu_transformer', part(assets.pdu, 'transformer'), 4); this.kit('door', part(assets.pdu, 'door'), 4);
    [[-9, -2.27, 'A', 0, Math.PI / 2], [-9, 2.27, 'B', 0, Math.PI / 2], [9, -2.27, 'A', 1, -Math.PI / 2], [9, 2.27, 'B', 1, -Math.PI / 2]].forEach(([x, z, feed, half, ry]) => {
      const id = this.pdus.length, root = this.root(x, 0, z, ry);
      const p = { kind: 'pdu', id, name: `PDU-${feed}${half + 1}`, feed, half, root, pos: V(x, 1, z), parts: { door: true }, tripped: false, alive: true, ry };
      for (const n of ['pdu_cabinet', 'pdu_transformer', 'door']) this.kits[n].set(id, root);
      this.fixedBox(x, 1.0, z, 0.5, 1.0, 0.39, p, ry); this.pdus.push(p); this.occupy(x, z, 0.5, 0.39);
    });
    for (const n of ['ups', 'ups_internals', 'ups_door', 'battery', 'battery_internals', 'battery_door']) this.kit(n, part(assets.ups, n), 2);
    [[-12.6, -5.0, 'A', Math.PI / 2], [12.6, 5.0, 'B', -Math.PI / 2]].forEach(([x, z, feed, ry]) => {
      const id = this.upss.length, root = this.root(x, 0, z, ry);
      for (const n of ['ups', 'ups_internals', 'ups_door', 'battery', 'battery_internals', 'battery_door']) this.kits[n].set(id, root);
      const u = { kind: 'ups', id, name: `UPS-${feed}`, feed, root, pos: V(x, 1, z), parts: { ups_door: true }, bypass: false, alive: true, ry };
      const bpos = _v.set(1.0, 1, 0).applyMatrix4(root).clone();
      const b = { kind: 'battery', id, name: `Battery-${feed}`, feed, root, pos: bpos, parts: { battery_door: true }, alive: true, ry };
      this.fixedBox(x, 1.0, z, 0.6, 1.0, 0.43, u, ry); this.fixedBox(bpos.x, 1.0, bpos.z, 0.4, 1.0, 0.43, b, ry);
      this.upss.push(u); this.batteries.push(b); this.occupy(x, z, 0.6, 0.6); this.occupy(bpos.x, bpos.z, 0.6, 0.6);
    });
  }

  // ---------------------------------------------------------------- overhead: trays, fibre, busway, containment, lights
  buildOverhead() {
    const { assets } = this.G; const segX = [-4.5, -1.5, 1.5, 4.5];
    const tray = this.kit('tray', part(assets.overhead, 'tray'), 16), cables = this.kit('cables', part(assets.overhead, 'cables'), 16);
    const duct = this.kit('fiber_duct', part(assets.overhead, 'fiber_duct'), 8), bus = this.kit('busway', part(assets.overhead, 'busway'), 32);
    const tapA = this.kit('tapbox_a', part(assets.overhead, 'tapbox_a'), 32), tapB = this.kit('tapbox_b', part(assets.overhead, 'tapbox_b'), 32);
    ROWS.forEach((row, ri) => segX.forEach((x, si) => {
      const root = this.root(x, 2.6, row.z); const i = tray.alloc(); cables.alloc(); tray.set(i, root); cables.set(i, root);
      const t = { kind: 'tray', row: ri, seg: si, root, pos: V(x, 2.65, row.z), idx: i, cut: false, fallen: false, parts: { tray: true, cables: true } };
      this.fixedBox(x, 2.65, row.z, 1.5, 0.06, 0.225, t); this.trays.push(t);
      for (const [feed, dz] of [['A', -0.32], ['B', 0.32]]) { const bi = bus.alloc(); bus.set(bi, this.root(x, 2.95, row.z + dz)); }
    }));
    this.fixedBox(0, 3.02, 0, 6, 0.07, 4, { kind: 'busway' });
    // one busway run per PDU half, so no tap-off box ever straddles the two feeds' halves
    const TAP_GROUPS = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18, 19]];
    TAP_GROUPS.forEach((cols, g) => ROWS.forEach((row, ri) => for_(['A', 'B'], (feed, fi) => {
      const x = RACK_X0 + (cols[0] + cols[cols.length - 1]) / 2 * 0.6, z = row.z + (fi ? 0.32 : -0.32);
      const k = fi ? tapB : tapA, idx = k.alloc(); k.set(idx, this.root(x, 2.75, z));
      const tp = { kind: 'tap', feed, row: ri, cols, on: true, alive: true, pos: V(x, 2.85, z), name: `Tap ${feed} ${row.name}${g + 1}` };
      this.fixedBox(x, 2.85, z, 0.125, 0.1, 0.08, tp); this.taps.push(tp);
    })));
    [-2.27, 2.27].forEach((z, ai) => segX.forEach((x, si) => {
      const root = this.root(x, 2.42, z), idx = duct.alloc(); duct.set(idx, root);
      const d = { kind: 'duct', aisle: ai, seg: si, root, pos: V(x, 2.47, z), idx, cut: false };
      this.fixedBox(x, 2.47, z, 1.5, 0.05, 0.05, d); this.ducts.push(d);
    }));
    // hot-aisle containment: roof panels + sliding end doors
    const roof = this.kit('roof_panel', part(assets.containment, 'roof_panel'), 10), doorK = this.kit('door_panel', part(assets.containment, 'door_panel'), 2);
    for (const k of [roof, doorK]) for (const p of k.prims) if (/glass/.test(p.name)) p.mesh.castShadow = false; // clear panels should not shade the hot aisle
    for (let i = 0; i < 10; i++) {
      const x = -5.4 + i * 1.2, root = this.root(x, 2.0, 0), idx = roof.alloc(); roof.set(idx, root);
      const g = { kind: 'glass', what: 'roof', kit: roof, idx, root, pos: V(x, 2.0, 0), broken: false };
      this.fixedBox(x, 2.015, 0, 0.6, 0.02, 0.6, g); this.glass.push(g);
    }
    [[-6.1, Math.PI / 2], [6.1, -Math.PI / 2]].forEach(([x, ry]) => {
      const root = this.root(x, 0, 0, ry), idx = doorK.alloc(); doorK.set(idx, root);
      const g = { kind: 'glass', what: 'door', kit: doorK, idx, root, pos: V(x, 1, 0), broken: false, open: 0, x, ry };
      this.fixedBox(x, 1.0, 0, 0.03, 1.0, 0.5, g, 0); this.glass.push(g);
    });
    // lighting
    const lk = this.kit('led_fixture', firstPart(assets.light), 60, { shadow: false });
    for (const z of [-5.6, -2.27, 0, 2.27, 5.6]) for (let i = 0; i < 10; i++) { const idx = lk.alloc(); lk.set(idx, T(-10.8 + i * 2.4, HALL.h - 0.01, z)); this.fixtures.push(idx); }
    for (const k of Object.values(this.kits)) k.commit();
  }

  // ---------------------------------------------------------------- fire protection, EPO
  buildSafety() {
    const { assets } = this.G;
    const cyl = this.kit('agent_cylinder', part(assets.fire, 'agent_cylinder'), 3), pull = this.kit('pull_station', part(assets.fire, 'pull_station'), 2);
    const strobe = this.kit('strobe', part(assets.fire, 'strobe'), 8), epo = this.kit('epo', part(assets.fire, 'epo'), 1), sd = this.kit('smoke_detector', part(assets.fire, 'smoke_detector'), 12);
    [6.0, 6.6, 7.2].forEach((z, i) => {
      const x = -12.6, root = this.root(x, 0, z), idx = cyl.alloc(); cyl.set(idx, root);
      const c = { kind: 'cyl', id: i, kit: cyl, idx, root, pos: V(x, 0.75, z), spent: false, rocket: 0, body: null };
      this.fixedBox(x, 0.9, z, 0.21, 0.9, 0.21, c); this.cyls.push(c); this.occupy(x, z, 0.21, 0.21);
    });
    const hx = HALL.x / 2;
    const ep = { kind: 'epo', armed: 0, pos: V(hx - 0.07, 1.4, 5.6) }; epo.set(epo.alloc(), this.root(hx - 0.04, 1.34, 5.6, -Math.PI / 2)); this.fixedBox(hx - 0.07, 1.4, 5.6, 0.04, 0.07, 0.07, ep); this.epo = ep;
    // a pull station by the exit raises the building alarm; the manual release by the cylinders dumps the agent
    const ps = { kind: 'pull', release: false, pulled: false, pos: V(hx - 0.07, 1.3, 5.2) }; pull.set(pull.alloc(), this.root(hx - 0.04, 1.23, 5.2, -Math.PI / 2)); this.fixedBox(hx - 0.07, 1.3, 5.2, 0.04, 0.08, 0.06, ps);
    const ps2 = { kind: 'pull', release: true, pulled: false, pos: V(-hx + 0.07, 1.3, 5.4) }; pull.set(pull.alloc(), this.root(-hx + 0.04, 1.23, 5.4, Math.PI / 2)); this.fixedBox(-hx + 0.07, 1.3, 5.4, 0.04, 0.08, 0.06, ps2);
    for (const [x, z, ry] of [[hx - 0.05, 2.0, -Math.PI / 2], [hx - 0.05, -4, -Math.PI / 2], [-hx + 0.05, 2.0, Math.PI / 2], [-hx + 0.05, -4, Math.PI / 2], [-6, HALL.z / 2 - 0.05, Math.PI], [6, HALL.z / 2 - 0.05, Math.PI], [-6, -HALL.z / 2 + 0.05, 0], [6, -HALL.z / 2 + 0.05, 0]]) {
      const idx = strobe.alloc(); strobe.set(idx, this.root(x, 2.55, z, ry)); this.strobes.push(idx);
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) sd.set(sd.alloc(), T(-9 + i * 6, HALL.h, -5 + j * 5));
    for (const k of Object.values(this.kits)) k.commit();
  }

  // ---------------------------------------------------------------- detaching pieces into physics
  detach(kitName, idx, root, pieceKey, impulse, atPoint, ent, cost = PIECES[pieceKey].cost) {
    const { R, phys } = this.G; const P = PIECES[pieceKey];
    const c = P.c.clone().applyMatrix4(root); root.decompose(_v, _q, new THREE.Vector3());
    const body = phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setLinearDamping(0.35).setAngularDamping(0.8));
    const col = phys.createCollider(R.ColliderDesc.cuboid(P.h.x, P.h.y, P.h.z).setMass(P.mass).setFriction(0.6).setRestitution(0.05).setCollisionGroups(DEBRIS_GROUPS), body);
    const item = { kind: 'loose', what: pieceKey, kit: this.kits[kitName], idx, body, col, local: T(-P.c.x, -P.c.y, -P.c.z), t: this.time, frozen: false, ent, mass: P.mass, label: P.label };
    this.ents.set(col.handle, item); this.loose.push(item);
    if (impulse) body.applyImpulseAtPoint(impulse, atPoint || c, true);
    if (cost) this.cost(pieceKey, P.label, 1, cost);
    return item;
  }
  ejectServer(sv, vel, cause = 'Smashed', offset = null) {
    if (!sv.attached) return;
    const { R, phys } = this.G; const rack = sv.rack, spec = sv.spec;
    _m.multiplyMatrices(rack.root, sv.local); _m.decompose(_v, _q, new THREE.Vector3());
    const c = new THREE.Vector3(0, spec.h / 2, 0).applyMatrix4(_m); if (offset) c.add(offset);
    const body = phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }).setLinearDamping(0.4).setAngularDamping(1.0));
    const col = phys.createCollider(R.ColliderDesc.cuboid(0.24, spec.h / 2, spec.d / 2).setMass(spec.mass).setFriction(0.6).setRestitution(0.02).setCollisionGroups(DEBRIS_GROUPS), body);
    const wasDestroyed = sv.destroyed;
    sv.attached = false; sv.body = body;
    const item = { kind: 'loose', what: 'server', sv, kit: sv.kit, idx: sv.idx, body, col, local: T(0, -spec.h / 2, 0), t: this.time, frozen: false, mass: spec.mass, label: spec.U + 'U server' };
    this.ents.set(col.handle, item); this.loose.push(item);
    if (vel) { body.setLinvel(vel, true); body.setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 }, true); }
    this.destroyServer(sv, cause);
    if (!wasDestroyed) { rack.kw -= spec.kw; rack.drives -= spec.drives; this.G.systems.stats.ejected++; }
    rack.dirty = true;
  }
  destroyServer(sv, cause) {
    if (sv.destroyed) return; sv.destroyed = true;
    sv.kit.setLeds(sv.idx, false);
    const label = sv.type === 'gpu' ? 'GPU server (8-GPU 4U)' : sv.type === '2u' ? '2U storage server' : '1U server';
    this.cost('server_' + sv.type, label, 1, sv.spec.cost);
    if (cause !== 'fire' && cause !== 'water') { sv.rack.kw -= sv.attached ? sv.spec.kw : 0; }
  }
  recycleLoose() {
    if (this.loose.length <= 150) return;
    const { phys } = this.G;
    const idx = this.loose.findIndex(l => !l.frozen && l.body.isSleeping() && this.time - l.t > 2.5 && l !== this.G.player.carrying);
    if (idx < 0) return;
    const l = this.loose[idx]; l.frozen = true; this.ents.delete(l.col.handle); phys.removeCollider(l.col, false); phys.removeRigidBody(l.body); this.loose.splice(idx, 1);
  }

  // ---------------------------------------------------------------- what a hit does
  /** ent from the ray, world hit point, surface normal, ray direction, tool spec. */
  hit(ent, point, normal, dir, tool) {
    const S = this.G.systems, fx = this.G.fx, au = this.G.audio;
    const imp = v => ({ x: dir.x * v, y: dir.y * v + 0.5, z: dir.z * v });
    switch (ent.kind) {
      case 'rack': return this.hitRack(ent, point, normal, dir, tool);
      case 'loose': {
        ent.body.applyImpulseAtPoint(imp(tool.impulse * 0.5), point, true); au.clang(0.8);
        if (ent.what === 'server') fx.sparkBurst(point, 10, normal, 0.5, 3);
        return true;
      }
      case 'tile': {
        if (ent.removed) return false;
        if (ent.occupied) { au.clang(0.5); this.log(`There's ${(Math.round(RACK.mass))} kg of rack standing on that tile.`); return true; }
        if (tool.cuts) { au.clang(0.5); return true; }
        this.removeTile(ent, true); fx.debrisBurst(point, 40, 0x777770); au.thud(0.8); au.clang(0.4);
        this.log(`Cracked a floor tile at ${ent.ix},${ent.iz}. The plenum is 600 mm deep. Mind the step.`); return true;
      }
      case 'crac': return this.hitCrac(ent, point, normal, dir, tool);
      case 'pdu': {
        if (ent.parts.door) { ent.parts.door = false; this.detach('door', ent.id, ent.root, 'door', imp(tool.impulse * 0.4), point, ent); au.clang(1); this.log(`${ent.name} door off. Panelboard and 480 V transformer exposed.`, 'warn'); return true; }
        if (S.power.pduEnergized(ent)) { S.arcFlash(point, `${ent.name} interior with a steel sledgehammer, 480 V live`); return true; }
        if (ent.alive) { ent.alive = false; fx.sparkBurst(point, 60, normal, 1, 6); fx.debrisBurst(point, 20); au.clang(1.2); this.cost('pdu', 'Power distribution unit', 1, COST.pdu); this.log(`${ent.name} transformer smashed (de-energized, so you're alive). Feed ${ent.feed} lost for racks ${ent.half ? '11-20' : '1-10'}.`, 'warn'); S.power.recompute(); return true; }
        au.clang(0.6); return true;
      }
      case 'ups': {
        if (ent.parts.ups_door) { ent.parts.ups_door = false; this.detach('ups_door', ent.id, ent.root, 'ups_door', imp(tool.impulse * 0.4), point, ent); au.clang(1); this.log(`${ent.name} door off. Rectifier, inverter and DC bus exposed.`, 'warn'); return true; }
        if (!ent.bypass && ent.alive && !S.power.epo) { S.arcFlash(point, `the ${ent.name} DC bus while it was online (not in maintenance bypass)`); return true; }
        if (ent.alive) { ent.alive = false; fx.sparkBurst(point, 50, normal, 1, 5); au.clang(1.2); this.cost('ups', 'UPS lineup (rectifier, inverter, static switch)', 1, COST.ups); this.log(`${ent.name} wrecked. ${ent.bypass ? 'Loads ride through on the maintenance bypass: raw utility, no battery.' : 'Feed ' + ent.feed + ' dropped.'}`, 'warn'); S.power.recompute(); return true; }
        au.clang(0.6); return true;
      }
      case 'battery': {
        if (ent.parts.battery_door) { ent.parts.battery_door = false; this.detach('battery_door', ent.id, ent.root, 'battery_door', imp(tool.impulse * 0.4), point, ent); au.clang(1); this.log(`${ent.name} door off. VRLA strings at 480 V DC. There is no off switch for chemistry.`, 'warn'); return true; }
        if (ent.alive) { ent.alive = false; S.startFire(ent.pos.clone(), null, 'battery'); this.cost('battery', 'Battery strings and cabinet', 1, COST.battery); S.arcFlash(point, `a 480 V DC battery string. DC arcs don't self-extinguish`); return true; }
        return true;
      }
      case 'tap': {
        if (S.power.tapEnergized(ent)) { S.arcFlash(point, `a live busway tap-off box (${ent.name})`); return true; }
        if (ent.alive) { ent.alive = false; fx.sparkBurst(point, 25, normal, 1, 4); au.clang(1); this.cost('tap', 'Busway tap-off box', 1, COST.tapBox); this.log(`${ent.name} smashed. Racks ${ent.cols.map(c => c + 1).join(', ')} lose feed ${ent.feed}.`); S.power.recompute(); return true; }
        au.clang(0.5); return true;
      }
      case 'tray': {
        if (ent.parts.cables && (tool.cuts || Math.random() < 0.5)) { ent.parts.cables = false; this.detach('cables', ent.idx, ent.root, 'cables', imp(60), point, ent); this.cutTray(ent, tool.cuts ? 'Cut' : 'Ripped out'); au.wood(); return true; }
        if (ent.parts.tray) { ent.parts.tray = false; this.detach('tray', ent.idx, ent.root, 'tray', imp(tool.impulse * 0.3), point, ent); if (ent.parts.cables) { ent.parts.cables = false; this.detach('cables', ent.idx, ent.root, 'cables', imp(60), point, ent); } this.cutTray(ent, 'Tray dropped;'); this.G.phys.removeCollider(ent.collider, false); this.ents.delete(ent.collider.handle); au.clang(1); return true; }
        return false;
      }
      case 'duct': {
        if (ent.cut) return false; ent.cut = true;
        this.detach('fiber_duct', ent.idx, ent.root, 'fiber_duct', imp(40), point, ent); this.G.phys.removeCollider(ent.collider, false); this.ents.delete(ent.collider.handle);
        au.wood(); fx.debrisBurst(point, 15, 0xe8c43a); S.network.ductCut(ent); return true;
      }
      case 'glass': return this.breakGlass(ent, point, normal);
      case 'cyl': {
        if (ent.spent) { au.clang(0.7); return true; }
        const local = point.clone().applyMatrix4(_m2.copy(ent.root).invert());
        if (local.y > 1.35) { this.rocketCylinder(ent, dir); return true; }
        au.clang(1); this.log('That is a 300 bar steel cylinder of IG-541. Hit the valve and it becomes a rocket. (Do not.)'); return true;
      }
      case 'epo': { S.pressEPO(true); return true; }
      case 'pull': { S.pullStation(ent); return true; }
      case 'busway': case 'wall': case 'ceiling': case 'slab': case 'exit': au.clang(0.3); return true;
      default: return false;
    }
  }
  hitRack(rack, point, normal, dir, tool) {
    const S = this.G.systems, fx = this.G.fx, au = this.G.audio;
    const local = point.clone().applyMatrix4(_m2.copy(rack.root).invert());
    const imp = v => ({ x: dir.x * v, y: dir.y * v, z: dir.z * v });
    const front = local.z > 0.45, rear = local.z < -0.45, side = Math.abs(local.x) > 0.25 && !front && !rear, top = local.y > 1.95;
    // a knocked-off door clears the cabinet and falls flat in the aisle instead of jamming against the rack
    const side_ = new THREE.Vector3(normal.z, 0, -normal.x).multiplyScalar(local.x >= 0 ? 1 : -1);
    const doorImp = { x: normal.x * 20 + side_.x * 30 + dir.x * 8, y: 10, z: normal.z * 20 + side_.z * 30 + dir.z * 8 };
    const doorAt = new THREE.Vector3(point.x, 1.9, point.z); // hit high on the door so it rotates outward over its sill
    let did = false;
    if (front && rack.parts.door_front) { rack.parts.door_front = false; this.detach('door_front', rack.id, rack.root, 'door_front', doorImp, doorAt, rack); S.stats.doors++; did = true; this.log(`${rack.name}: front door torn off its hinges.`); }
    else if (rear && local.x < 0 && rack.parts.door_rear_L) { rack.parts.door_rear_L = false; this.detach('door_rear_L', rack.id, rack.root, 'door_rear_L', doorImp, doorAt, rack); S.stats.doors++; did = true; }
    else if (rear && local.x >= 0 && rack.parts.door_rear_R) { rack.parts.door_rear_R = false; this.detach('door_rear_R', rack.id, rack.root, 'door_rear_R', doorImp, doorAt, rack); S.stats.doors++; did = true; }
    else if (rear && local.x < -0.18 && rack.parts.pdu_A) { rack.parts.pdu_A = false; this.detach('pdu_A', rack.id, rack.root, 'pdu_A', imp(80), point, rack); fx.sparkBurst(point, 30, normal, 1, 4); did = true; this.log(`${rack.name}: A-side rack PDU ripped out. Single-corded on B now.`); S.power.recompute(); }
    else if (rear && local.x > 0.18 && rack.parts.pdu_B) { rack.parts.pdu_B = false; this.detach('pdu_B', rack.id, rack.root, 'pdu_B', imp(80), point, rack); fx.sparkBurst(point, 30, normal, 1, 4); did = true; this.log(`${rack.name}: B-side rack PDU ripped out. Single-corded on A now.`); S.power.recompute(); }
    else if (side && local.x < 0 && rack.parts.side_L) { rack.parts.side_L = false; this.detach('side_L', rack.id, rack.root, 'side_L', imp(tool.impulse * 0.3), point, rack); did = true; }
    else if (side && local.x > 0 && rack.parts.side_R) { rack.parts.side_R = false; this.detach('side_R', rack.id, rack.root, 'side_R', imp(tool.impulse * 0.3), point, rack); did = true; }
    else if ((front || rear) && tool.serverEject > 0) {
      const u = (local.y - RACK.bottomU) / RACK.U;
      const near = rack.servers.filter(sv => sv.attached && !sv.destroyed && Math.abs(sv.u + sv.spec.U / 2 - u) < tool.serverEject + sv.spec.U / 2).sort((a, b) => Math.abs(a.u - u) - Math.abs(b.u - u)).slice(0, tool.serverEject === 1 ? 1 : 4);
      if (near.length) {
        const out = front ? 1 : -1;
        for (const sv of near) {
          // the chassis shears off its rails and comes out the side you hit, at the player's feet
          const fwd = new THREE.Vector3(0, 0, out).applyQuaternion(_q.setFromRotationMatrix(rack.root));
          const v = fwd.clone().multiplyScalar(1.6 + Math.random() * 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.2 + Math.random(), 0));
          this.ejectServer(sv, v, 'Smashed', fwd.multiplyScalar(sv.spec.d * 0.5 + 0.15));
          if (rack.powered) { fx.sparkBurst(point, 18, normal, 1, 4); if (Math.random() < (sv.type === 'gpu' ? 0.06 : 0.025)) S.startFire(point.clone().add(new THREE.Vector3(0, 0.1, 0)), rack, 'PSU short'); }
        }
        au.clang(1.1); did = true;
      }
    }
    if (!did) au.clang(0.7);
    // anchors
    if (rack.bolted) {
      rack.boltDamage += tool.dmg;
      if (rack.boltDamage >= 4) this.unbolt(rack, 'Anchor bolts sheared');
    }
    if (!rack.bolted) rack.body.applyImpulseAtPoint(imp(tool.impulse), point, true);
    if (top) au.thud(0.5);
    rack.dirty = true;
    return true;
  }
  unbolt(rack, why) {
    if (!rack.bolted) return; rack.bolted = false;
    rack.body.setBodyType(this.G.R.RigidBodyType.Dynamic, true);
    this.log(`${rack.name}: ${why}. ${RACK.mass} kg is now free-standing.`, 'warn');
  }
  hitCrac(c, point, normal, dir, tool) {
    const S = this.G.systems, fx = this.G.fx, au = this.G.audio;
    const local = point.clone().applyMatrix4(_m2.copy(c.root).invert());
    const imp = v => ({ x: dir.x * v, y: dir.y * v, z: dir.z * v });
    if (local.z < 0.3) { au.clang(0.5); return true; }
    if (local.x < -0.45) {
      if (c.parts.panel_controls) { c.parts.panel_controls = false; this.detach('panel_controls', c.id, c.root, 'panel_controls', imp(tool.impulse * 0.35), point, c); au.clang(1); return true; }
      if (!c.controlsDead) { c.controlsDead = true; c.on = false; fx.sparkBurst(point, 25, normal, 1, 3); au.clang(1); this.log(`${c.name} controller smashed. Fans spin down, and nobody is restarting this one from the front panel.`, 'warn'); return true; }
      au.clang(0.6); return true;
    }
    if (c.parts.panel_grille) { c.parts.panel_grille = false; this.detach('panel_grille', c.id, c.root, 'panel_grille', imp(tool.impulse * 0.35), point, c); au.clang(1); this.log(`${c.name} front panel off. Plug fans and the cooling coil are right there.`); return true; }
    if (local.y < 0.75) {
      if (c.fansAlive) { c.fansAlive = false; c.alive = false; fx.sparkBurst(point, 60, normal, 1, 6); fx.debrisBurst(point, 25, 0x999999); au.clang(1.3); au.thud(1); this.cost('crac', 'CRAC unit', 1, COST.crac); this.log(`${c.name}: EC fan wheel destroyed at 1,200 rpm. Unit dead. Cooling capacity down ${Math.round(100 / this.cracs.length)}%.`, 'warn'); return true; }
      au.clang(0.6); return true;
    }
    if (c.coilAlive) { c.coilAlive = false; const was = c.alive; c.alive = false; fx.puff(point, 20, 0.25); au.clang(1); au.sprinkler(); if (was) this.cost('crac', 'CRAC unit', 1, COST.crac); this.log(`${c.name}: chilled-water coil ruptured. 7 °C water on the raised floor, and the unit is done.`, 'warn'); fx.waterSpray(point, 60); return true; }
    au.clang(0.6); return true;
  }
  breakGlass(g, point, normal) {
    if (g.broken) return false; g.broken = true;
    g.kit.hide(g.idx); this.G.phys.removeCollider(g.collider, false); this.ents.delete(g.collider.handle);
    this.G.fx.glassBurst(point, 140, normal); this.G.audio.glass();
    this.cost('glass', 'Containment panel (polycarbonate)', 1, COST.glassPanel); this.G.systems.stats.glassBroken++;
    if (g.what === 'roof') this.G.systems.stats.roofBroken++; else this.refreshDoors();
    this.log(g.what === 'door' ? 'Hot-aisle door shattered. Hot exhaust is recirculating into the cold aisle.' : 'Containment roof panel broken. Hot and cold air are mixing.');
    return true;
  }
  cutTray(t, how) {
    if (!t.cut) { t.cut = true; this.G.systems.network.trayCut(t, how); }
  }
  removeTile(t, broken) {
    if (t.removed) return; t.removed = true;
    this.G.phys.removeCollider(t.collider, false); this.ents.delete(t.collider.handle);
    if (t.perf) this.perfInPlace--; else this.holes++;
    if (broken) { t.kit.hide(t.idx); this.cost('tile', 'Raised-floor tile', 1, COST.tile); }
    else {
      // set it down flat on the neighbouring tile nearest the player (a lifted tile is not a broken one: no charge)
      const p = this.G.player.pos(); const dx = p.x - t.x, dz = p.z - t.z; const ax = Math.abs(dx) > Math.abs(dz);
      const root = T(t.x + (ax ? Math.sign(dx) * 0.62 : 0), 0.002, t.z + (ax ? 0 : Math.sign(dz) * 0.62));
      const item = this.detach(t.kit === this.kits.tile_perf ? 'tile_perf' : 'tile_solid', t.idx, root, 'tile', null, null, t, 0);
      item.label = 'Floor tile'; this.G.systems.stats.tilesLifted++;
    }
  }
  refreshDoors() { this.G.systems.thermal.doorOpen = this.glass.filter(x => x.what === 'door' && (x.open || x.broken)).length; }
  rocketCylinder(c, dir) {
    const S = this.G.systems; c.spent = true; S.stats.cylRocket++;
    this.G.phys.removeCollider(c.collider, false); this.ents.delete(c.collider.handle);
    const item = this.detach('agent_cylinder', c.idx, c.root, 'agent_cylinder', { x: dir.x * 200, y: 300, z: dir.z * 200 }, null, c);
    item.rocket = 4.5; c.body = item.body; item.isCyl = true;
    this.G.audio.rocket(); this.G.fx.screenFlash('rgba(255,255,255,0.6)', 200);
    this.log('Valve sheared off an inert-gas cylinder. 180 kg of steel is now propelled by 300 bar of nitrogen and argon. Suppression is below design concentration.', 'bad');
    S.suppression.cylinderLost();
  }

  // ---------------------------------------------------------------- interaction (E)
  promptFor(ent, point) {
    const S = this.G.systems;
    switch (ent?.kind) {
      case 'rack': return `${ent.name} · ${ent.isGpu ? 'GPU rack' : ent.servers.length - 1 + ' servers'} · ${ent.powered ? Math.round(ent.kw) + ' kW' : 'DARK'}${ent.bolted ? ' · bolted' : ' · unbolted'}${ent.net ? '' : ' · no network'}`;
      case 'crac': return ent.controlsDead ? `${ent.name} · controller destroyed · ${ent.alive ? 'stopped' : 'DESTROYED'}` : `[E] ${ent.name} ${ent.on ? 'stop unit' : 'start unit'} · ${ent.alive ? (ent.on && !S.power.epo ? 'running' : 'stopped') : 'DESTROYED'}`;
      case 'pdu': return `[E] ${ent.name} main breaker: ${ent.tripped ? 'closed → energize' : 'TRIP'} · feed ${ent.feed} · ${S.power.pduEnergized(ent) ? (ent.tripped ? 'output off, LINE SIDE LIVE 480 V' : 'LIVE 480 V') : 'de-energized'}`;
      case 'ups': return `[E] ${ent.name} ${ent.bypass ? 'return from bypass' : 'transfer to maintenance bypass'} · ${ent.alive ? (ent.bypass ? 'bypassed, module de-energized' : 'online, 480 V DC bus live') : 'DESTROYED'}`;
      case 'battery': return `${ent.name} · sealed VRLA · 480 V DC · always live`;
      case 'tap': return `[E] ${ent.name} breaker ${ent.on ? 'OFF' : 'ON'} · ${S.power.tapEnergized(ent) ? 'busway LIVE' : 'busway dead'}`;
      case 'tile': return ent.removed ? '' : ent.occupied ? 'Floor tile (loaded)' : `[E] lift floor tile${ent.perf ? ' (vented, 25% open)' : ''}`;
      case 'glass': return ent.what === 'door' ? `[E] ${ent.open ? 'close' : 'open'} hot-aisle door` : 'Containment roof panel';
      case 'epo': return ent.armed > 0 ? '[E] EPO — PRESS AGAIN TO CONFIRM' : '[E] Emergency Power Off';
      case 'pull': return ent.release ? (ent.pulled ? 'Manual agent release (activated)' : '[E] Inert-gas MANUAL RELEASE') : (ent.pulled ? 'Pull station (activated)' : '[E] Fire alarm pull station');
      case 'cyl': return `IG-541 cylinder ${ent.id + 1}/3 · ${ent.spent ? 'EMPTY' : 'charged, 300 bar'}`;
      case 'tray': return `Cable tray · row ${ROWS[ent.row].name} · ${ent.cut ? 'CUT' : 'in service'}`;
      case 'duct': return `Fibre trunk · ${ent.cut ? 'CUT' : 'lit'}`;
      case 'loose': return ent.what === 'server' && ent.mass <= 40 ? `[E] pick up ${ent.label}` : ent.label;
      case 'exit': return 'Exit · you work here, you can\'t leave';
      default: return '';
    }
  }
  interact(ent, point) {
    const S = this.G.systems, au = this.G.audio;
    switch (ent?.kind) {
      case 'crac': if (!ent.alive) return; if (ent.controlsDead) { this.log(`${ent.name}: the controller is in pieces on the floor.`); return; } ent.on = !ent.on; au.click(); this.log(`${ent.name} ${ent.on ? 'started' : 'stopped from its controller'}.`); return;
      case 'pdu': ent.tripped = !ent.tripped; au.breaker(); this.log(`${ent.name} main breaker ${ent.tripped ? 'TRIPPED. Feed ' + ent.feed + ' dead for racks ' + (ent.half ? '11-20' : '1-10') + ' in every row.' : 'closed. Feed ' + ent.feed + ' restored.'}`, ent.tripped ? 'warn' : ''); S.power.recompute(); return;
      case 'ups': if (!ent.alive) return; ent.bypass = !ent.bypass; au.breaker(); this.log(`${ent.name} ${ent.bypass ? 'transferred to maintenance bypass. Loads on raw utility; the module is de-energized.' : 'back online.'}`); S.power.recompute(); return;
      case 'tap': ent.on = !ent.on; au.breaker(); this.log(`${ent.name} breaker ${ent.on ? 'closed' : 'opened'}.`); S.power.recompute(); return;
      case 'tile': if (ent.removed || ent.occupied) return; this.removeTile(ent, false); au.thud(0.4); this.log(`Lifted a ${ent.perf ? 'vented' : 'solid'} tile. 13 kg. Open hole in the floor behind you.`); return;
      case 'glass': if (ent.what !== 'door' || ent.broken) return; ent.open = ent.open ? 0 : 1; au.wood(); this.slideDoor(ent); return;
      case 'epo': S.pressEPO(false); return;
      case 'pull': S.pullStation(ent); return;
      case 'loose': if (ent.what === 'server' && ent.mass <= 40) this.G.player.pickUp(ent); return;
    }
  }
  slideDoor(g) {
    const open = g.open;
    g.kit.set(g.idx, this.root(g.x, 0, open ? 1.0 : 0, g.ry));
    g.collider.setTranslation({ x: g.x, y: 1.0, z: open ? 1.0 : 0 });
    this.refreshDoors();
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt; const S = this.G.systems, fx = this.G.fx;
    for (const r of this.racks) {
      if (r.bolted && !r.dirty) continue;
      this.syncRack(r);
      if (!r.bolted && !r.toppled) {
        const rot = r.body.rotation(); _q.set(rot.x, rot.y, rot.z, rot.w); _v.set(0, 1, 0).applyQuaternion(_q);
        if (_v.y < 0.55) this.topple(r);
      }
    }
    for (const l of this.loose) {
      if (l.frozen) continue;
      if (l.rocket > 0) {
        l.rocket -= dt; const rot = l.body.rotation(); _q.set(rot.x, rot.y, rot.z, rot.w); _v.set(0, 1, 0).applyQuaternion(_q);
        l.body.applyImpulse({ x: _v.x * 2600 * dt, y: _v.y * 2600 * dt, z: _v.z * 2600 * dt }, true);
        const t = l.body.translation(); fx.agentFog(new THREE.Vector3(t.x - _v.x * 0.8, t.y - _v.y * 0.8, t.z - _v.z * 0.8), 2); fx.puff(new THREE.Vector3(t.x, t.y, t.z), 1, 0.15);
        S.suppression.vent(dt);
      }
      if (!l.body.isSleeping()) l.kit.set(l.idx, bodyMatrix(l.body, _m, l.local));
    }
    this.recycleLoose();
    for (const k of Object.values(this.kits)) k.commit();
  }
  topple(r) {
    r.toppled = true; r.destroyed = true; r.toppledAt = this.time; const S = this.G.systems;
    const here = new THREE.Vector3().setFromMatrixPosition(r.root);
    const recent = this.racks.filter(o => o !== r && o.toppled && this.time - o.toppledAt < 4 && (Math.abs(o.col - r.col) === 1 && o.row === r.row || new THREE.Vector3().setFromMatrixPosition(o.root).distanceTo(here) < 2.6));
    r.chain = 1 + Math.max(0, ...recent.map(o => o.chain));
    S.stats.toppled++; S.stats.maxChain = Math.max(S.stats.maxChain, r.chain);
    let n = 0; for (const sv of r.servers) if (sv.attached && !sv.destroyed) { this.destroyServer(sv, 'toppled'); n++; }
    this.cost('rack', 'Rack cabinet (42U)', 1, COST.rack);
    this.G.audio.thud(1.5); this.G.fx.debrisBurst(new THREE.Vector3().setFromMatrixPosition(r.root), 40, 0x444444);
    if (r.powered && Math.random() < 0.04) S.startFire(new THREE.Vector3().setFromMatrixPosition(r.root).add(new THREE.Vector3(0, 0.3, 0)), r, 'ripped power cords');
    this.log(`${r.name} is on the floor. ${n} servers written off.${r.chain > 1 ? ' Chain of ' + r.chain + '.' : ''}`, 'bad');
    S.power.recompute();
  }
  /** contact-force events: racks hitting things */
  contact(h1, h2, force) {
    const a = this.ents.get(h1), b = this.ents.get(h2);
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x?.kind === 'rack' && !x.bolted) {
        const lv = x.body.linvel(), av = x.body.angvel(); const moving = Math.hypot(lv.x, lv.y, lv.z) > 0.6 || Math.hypot(av.x, av.y, av.z) > 0.6;
        if (!moving) continue;
        if (y?.kind === 'rack' && y.bolted && force > 15000) this.unbolt(y, `hit by ${x.name} with ${Math.round(force / 1000)} kN; anchors failed`);
        if (force > 25000 && !x.toppled) { this.G.audio.thud(Math.min(1.5, force / 40000)); }
      }
    }
  }
}

function quatY(a) { return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }; }
function for_(arr, fn) { arr.forEach((v, i) => fn(v, i)); }
