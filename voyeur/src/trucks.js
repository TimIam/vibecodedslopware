// Working trucks: the box truck that restocks the deli (driver, roll-up door, a hand truck stacked
// with cases, the clerk signing for it) and the garbage truck that comes on Monday and Thursday
// mornings for the bags the building put out the night before (two sanitation workers riding the
// back, tossing bags into the hopper while the blade packs them in).
import * as THREE from 'three';
import { Kit, canvasTex, pick, range } from './util.js';
import { Vehicle } from './street.js';
import { Walker, randomLook } from './people.js';
import { makeProp } from './avatar.js';
import { SW_Y, DELI } from './building.js';

const R = Math.random;
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
function lb(g, x0, y0, z0, x1, y1, z1, m) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  me.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(me);
  return me;
}
function wheels(g, xs, half, wr) {
  const k = new Kit();
  const wg = new THREE.CylinderGeometry(wr, wr, 0.3, 16); wg.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(wr * 0.5, wr * 0.5, 0.31, 10); hub.rotateX(Math.PI / 2);
  k.geo(wg, 0x111111); k.geo(hub, 0x9a9a9a);
  const geo = k.build();
  const out = [];
  for (const x of xs) for (const z of [-half, half]) { const w = new THREE.Mesh(geo, mat); w.position.set(x, wr, z); w.castShadow = true; g.add(w); out.push(w); }
  return out;
}
const SIGNS = [['FRESH PRODUCE', '#2f7a3a'], ['BREAD & BAKERY', '#b8742a'], ['COLD DRINKS', '#2a5ab0'], ['DAIRY', '#3a8ac8']];
function sideTex(text, col) {
  return canvasTex(1024, 256, (g) => {
    g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = col; g.fillRect(0, 170, 1024, 50);
    g.font = 'bold 96px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    g.fillText(text, 512, 92);
  });
}

// Box truck, front toward -x.
export function makeBoxTruck(kind) {
  const g = new THREE.Group();
  const k = new Kit();
  const [text, col] = pick(R, SIGNS);
  const cab = pick(R, [0xf2f2f0, 0x2a3a5a, 0xc8c8c8]);
  k.box(-3.8, 0.55, -1.1, -2.1, 2.55, 1.1, cab, 0.15);
  k.box(-3.82, 1.55, -1.0, -3.35, 2.4, 1.0, 0x1b222b);
  k.box(-3.3, 1.55, -1.11, -2.3, 2.35, 1.11, 0x1b222b);
  k.box(-3.9, 0.4, -1.1, -3.78, 0.75, 1.1, 0x222222);
  // cargo box with an open back, so the roll-up door shows the load inside
  k.box(-2.1, 0.75, 1.15, 3.8, 3.45, 1.2, 0xf2f0ea, 0.08);
  k.box(-2.1, 0.75, -1.2, 3.8, 3.45, -1.15, 0xf2f0ea, 0.08);
  k.box(-2.1, 3.4, -1.2, 3.8, 3.45, 1.2, 0xf2f0ea);
  k.box(-2.1, 0.75, -1.2, 3.8, 0.8, 1.2, 0x8a8a8a);
  k.box(-2.1, 0.75, -1.2, -2.05, 3.45, 1.2, 0x5a5a5a);
  k.box(3.72, 0.75, -1.2, 3.8, 3.45, -1.08, 0xd8d6ce); k.box(3.72, 0.75, 1.08, 3.8, 3.45, 1.2, 0xd8d6ce); k.box(3.72, 3.3, -1.2, 3.8, 3.45, 1.2, 0xd8d6ce);
  k.box(-2.1, 0.55, -1.0, 3.8, 0.75, 1.0, 0x333333);
  k.box(3.75, 0.5, -1.2, 3.95, 0.62, 1.2, 0x555555);
  g.add(new THREE.Mesh(k.build(), mat));
  const tex = sideTex(text, col);
  const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), sm); p.position.set(0.85, 2.3, sd * 1.205); if (sd < 0) p.rotation.y = Math.PI; g.add(p); }
  const door = new THREE.Group(); door.position.set(3.81, 0, 0); g.add(door);
  const dk = new Kit();
  for (let y = 0.8; y < 3.4; y += 0.16) dk.box(0, y, -1.1, 0.04, y + 0.14, 1.1, 0xe2e0d8);
  const dm = new THREE.Mesh(dk.build(), mat); door.add(dm);
  for (let i = 0; i < 6; i++) lb(g, 2.3 + (i % 2) * 0.55, 0.78 + Math.floor(i / 2) * 0.45, -0.8 + (i % 3) * 0.55, 2.8 + (i % 2) * 0.55, 1.18 + Math.floor(i / 2) * 0.45, -0.35 + (i % 3) * 0.55, basic(0x6a5236));
  const head = basic(0x222222), tail = basic(0x220000), amber = basic(0x221100);
  lb(g, -3.92, 0.85, -0.95, -3.88, 1.05, -0.65, head); lb(g, -3.92, 0.85, 0.65, -3.88, 1.05, 0.95, head);
  lb(g, 3.95, 0.7, -1.2, 3.99, 1.0, -1.0, tail); lb(g, 3.95, 0.7, 1.0, 3.99, 1.0, 1.2, tail);
  lb(g, -3.92, 1.15, -1.1, -3.86, 1.25, -1.0, amber); lb(g, 3.95, 3.3, -1.2, 3.99, 3.4, -1.05, amber); lb(g, 3.95, 3.3, 1.05, 3.99, 3.4, 1.2, amber);
  const wh = wheels(g, [-2.9, 2.2, 2.85], 1.0, 0.45);
  g.traverse((o) => { if (o.isMesh && o.material === mat) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, lights: { head, tail, amber, bar: [] }, wheels: wh, len: 7.9, wr: 0.45, door, doorOpen: 0 };
}

// Garbage truck, front toward -x, with a rear hopper, a packer blade and an amber beacon.
export function makeGarbageTruck() {
  const g = new THREE.Group();
  const k = new Kit();
  const body = pick(R, [0x2f6a3a, 0xf2f2f0, 0x2a4a7a]);
  k.box(-4.3, 0.6, -1.15, -2.6, 2.9, 1.15, 0xf2f2f0, 0.15);
  k.box(-4.32, 1.7, -1.05, -3.85, 2.7, 1.05, 0x1b222b);
  k.box(-3.8, 1.7, -1.16, -2.8, 2.65, 1.16, 0x1b222b);
  k.box(-4.4, 0.45, -1.15, -4.28, 0.85, 1.15, 0x333333);
  k.box(-2.6, 0.85, -1.22, 3.0, 3.25, 1.22, body, 0.12);
  for (let x = -2.2; x < 3; x += 0.7) k.box(x, 0.85, 1.22, x + 0.08, 3.25, 1.26, body, 0.3), k.box(x, 0.85, -1.26, x + 0.08, 3.25, -1.22, body, 0.3);
  k.box(3.0, 0.6, -1.2, 4.3, 2.85, 1.2, 0x3a3e42, 0.2);
  k.box(4.28, 0.95, -0.95, 4.31, 1.9, 0.95, 0x141414);
  k.box(4.15, 0.42, -1.15, 4.75, 0.48, -0.35, 0x8a8a8a);
  k.box(4.15, 0.42, 0.35, 4.75, 0.48, 1.15, 0x8a8a8a);
  k.box(4.3, 0.48, -1.0, 4.34, 2.3, -0.96, 0xc8c8c8); k.box(4.3, 0.48, 0.96, 4.34, 2.3, 1.0, 0xc8c8c8);
  k.box(-2.6, 0.6, -1.0, 3.0, 0.85, 1.0, 0x333333);
  g.add(new THREE.Mesh(k.build(), mat));
  const blade = new THREE.Group(); blade.position.set(3.9, 2.4, 0); g.add(blade);
  lb(blade, -0.04, -1.1, -0.9, 0.04, 0, 0.9, new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.5 }));
  const head = basic(0x222222), tail = basic(0x220000), amber = basic(0x221100), beacon = basic(0x221100);
  lb(g, -4.42, 0.95, -0.95, -4.38, 1.15, -0.65, head); lb(g, -4.42, 0.95, 0.65, -4.38, 1.15, 0.95, head);
  lb(g, 4.3, 2.4, -1.2, 4.34, 2.7, -1.0, tail); lb(g, 4.3, 2.4, 1.0, 4.34, 2.7, 1.2, tail);
  lb(g, -4.42, 1.25, -1.15, -4.36, 1.35, -1.05, amber); lb(g, -4.42, 1.25, 1.05, -4.36, 1.35, 1.15, amber);
  lb(g, -3.6, 2.9, -0.15, -3.3, 3.08, 0.15, beacon);
  const wh = wheels(g, [-3.2, 1.6, 2.4], 1.02, 0.5);
  g.traverse((o) => { if (o.isMesh && o.material === mat) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, lights: { head, tail, amber, bar: [] }, wheels: wh, len: 9.0, wr: 0.5, blade, beacon, packing: 0 };
}

export class Sanitation {
  constructor(world) {
    this.world = world;
    this.bags = [];
    this.stack = [];
    this.flags = {};
  }
  get street() { return this.world.street; }
  // trash goes out the night before Monday and Thursday pickup
  eve() { const wd = this.world.weekday(); return wd === 0 || wd === 3; }
  pickupDay() { const wd = this.world.weekday(); return wd === 1 || wd === 4; }
  once(k) { const key = k + ':' + this.world.day; if (this.flags[key]) return false; this.flags[key] = true; return true; }

  addBag(x, z, kind = 'bag') {
    let m;
    if (kind === 'cardboard') {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 }));
      m.position.set(x, SW_Y + 0.18, z);
    } else {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8).scale(1, 1.15, 0.95), new THREE.MeshStandardMaterial({ color: kind === 'recycle' ? 0x3a5a8a : 0x111214, roughness: 0.3, metalness: 0.1 }));
      m.position.set(x, SW_Y + 0.28, z);
      m.rotation.set(R() * 0.4, R() * 6, R() * 0.3);
    }
    m.castShadow = true;
    this.world.scene.add(m);
    this.bags.push(m);
    return m;
  }
  pileSpot() { return [range(R, 1.6, 3.7), range(R, 3.15, 3.65)]; }

  onHour(h) {
    const W = this.world;
    // deli restock: most mornings, and some middays
    if (W.weekday() !== 0 && h === 6 && this.once('deliAM')) this.street.run(this.deliRun(W.time + range(R, 20, 150)));
    if (h === 11 && R() < 0.45 && this.once('deliMid')) this.street.run(this.deliRun(W.time + range(R, 10, 150)));
    if (this.pickupDay() && h === 6 && this.once('pickup')) this.street.run(this.garbageRun(W.time + range(R, 5, 80)));
  }
  update() {
    const W = this.world, m = W.mod;
    // deli stock boxes get unpacked over a few hours
    if (this.stack.length && W.time > this.stackUntil) { for (const b of this.stack) W.scene.remove(b); this.stack = []; }
    // the deli puts its cardboard out at closing on trash night
    if (this.eve() && m >= 1376 && m < 1400 && this.once('cardboard')) for (let i = 0; i < 2; i++) { const [x, z] = this.pileSpot(); this.addBag(x, z, 'cardboard'); }
  }

  // ---------------------------------------------------------------- deli
  *waitSlot0() { const s = this.street.slots[0]; while (s.v) yield; return s; }
  *deliRun(at) {
    const W = this.world, S = this.street;
    while (W.time < at) yield;
    const slot = yield* this.waitSlot0();
    const truck = new Vehicle(S, 'boxtruck', { stopX: -5.7, cruise: 7.5, build: makeBoxTruck });
    slot.v = truck;
    truck.onUpdate = (dt) => { truck.doorOpen += Math.sign((truck.doorWant || 0) - truck.doorOpen) * Math.min(Math.abs((truck.doorWant || 0) - truck.doorOpen), dt * 0.8); truck.door.position.y = truck.doorOpen * 2.5; truck.door.scale.y = 1 - truck.doorOpen * 0.85; };
    while (truck.state !== 'stopped') yield;
    W.toast('A delivery truck is restocking the deli');
    const d = new Walker(W, randomLook(R, { shirt: pick(R, [0x2a3a5a, 0x5a2a2a, 0x2a4a2a]), pants: 0x2a2a30, hat: 0x2a2a30, fem: R() < 0.25 }), null, { speed: 1.35 });
    d.role = 'a delivery driver';
    d.pos.set(truck.x - 2.4, SW_Y, truck.z - 1.3); d.hidden = false;
    const rear = [truck.x + truck.len / 2 + 0.6, truck.z - 0.3];
    yield* d.walkTo(rear[0], truck.z - 1.4);
    yield* d.walkTo(rear[0], rear[1]);
    d.targetYaw = -Math.PI / 2; d.pose = 'reach'; d.label = 'rolling up the truck door';
    truck.doorWant = 1;
    yield* d.waitReal(3.2);
    const trips = 2 + Math.floor(R() * 2);
    for (let i = 0; i < trips; i++) {
      d.label = 'loading the hand truck'; d.pose = 'reach';
      yield* d.waitReal(range(R, 3, 5));
      const dolly = makeProp('dolly');
      d.hold(dolly, new THREE.Vector3(0, -1.12 * d.av.s, 0.12));
      d.pushing = true; d.label = 'wheeling cases into the deli';
      yield* d.walkTo(rear[0] - 1.2, 3.0);
      yield* d.walkTo(DELI.door[0], 1.0);
      yield* d.walkTo(DELI.inside[0], DELI.inside[1]);
      if (i === 0) W.deliSign = true;
      yield* d.walkTo(-4.9, -1.2);
      d.pushing = false; d.drop();
      d.pose = 'kneel'; d.label = 'stacking cases';
      yield* d.waitReal(range(R, 3, 5));
      for (let j = 0; j < 3; j++) this.addStock();
      d.pose = 'stand';
      if (i === 0) { d.targetYaw = Math.atan2(1, 1); d.label = 'getting it signed for'; yield* d.waitReal(4); W.deliSign = false; }
      d.label = 'heading back to the truck';
      yield* d.walkTo(DELI.inside[0], DELI.inside[1]);
      yield* d.walkTo(DELI.door[0], 1.0);
      yield* d.walkTo(rear[0], 3.0);
      yield* d.walkTo(rear[0], rear[1]);
      d.targetYaw = -Math.PI / 2;
    }
    d.pose = 'reach'; d.label = 'pulling the door down';
    truck.doorWant = 0;
    yield* d.waitReal(3);
    d.pose = 'stand';
    yield* d.walkTo(rear[0], truck.z - 1.4);
    yield* d.walkTo(truck.x - 2.4, truck.z - 1.3);
    d.remove();
    yield* d.waitReal(1.2);
    truck.leave(); slot.v = null;
    this.stackUntil = W.time + range(R, 120, 240);
  }
  addStock() {
    const W = this.world, room = W.B.deli;
    const n = this.stack.length;
    if (n > 10) return;
    const geo = new THREE.BoxGeometry(0.5, 0.32, 0.4);
    const c = new THREE.Color(pick(R, [0xb08a5a, 0xc8a070, 0x9a7a4a])); const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.Mesh(geo, room.mat);
    m.position.set(-5.4 + (n % 3) * 0.52, SW_Y + 0.16 + Math.floor(n / 6) * 0.32, -1.15 - (Math.floor(n / 3) % 2) * 0.42);
    W.scene.add(m);
    this.stack.push(m);
  }

  // ---------------------------------------------------------------- garbage
  *garbageRun(at) {
    const W = this.world, S = this.street;
    while (W.time < at) yield;
    if (!this.bags.length) return;
    const slot = yield* this.waitSlot0();
    const truck = new Vehicle(S, 'garbage', { stopX: -1.9, cruise: 5.5, build: makeGarbageTruck });
    slot.v = truck;
    truck.onUpdate = (dt) => {
      truck.packing = Math.max(0, truck.packing - dt);
      truck.blade.rotation.z = -Math.sin(Math.min(1, truck.packing / 2.5) * Math.PI) * 1.1;
      const on = Math.floor(W.realT * 3) % 2 === 0;
      truck.beacon.color.setRGB(on ? 3.5 : 0.3, on ? 1.6 : 0.15, 0.02);
    };
    // two workers ride the back step
    const crew = [0, 1].map((i) => {
      const m = new Walker(W, randomLook(R, { shirt: 0xd8e030, pants: 0x2a3a2a, hat: 0x2a3a2a, jacket: null, fem: R() < 0.2 }), null, { speed: 1.5 });
      m.role = 'sanitation workers';
      m.riding = true; m.side = i ? 1 : -1;
      m.hidden = false;
      m.co = (function* () {
        for (;;) {
          if (truck.dead) { m.remove(); return; }
          if (m.riding) { m.pos.set(truck.x + truck.len / 2 + 0.25, 0.48, truck.z + m.side * 0.75); m.yaw = m.targetYaw = -Math.PI / 2; m.pose = 'reach'; m.label = 'riding the back of the truck'; }
          yield;
        }
      })();
      return m;
    });
    while (truck.state !== 'stopped') yield;
    W.toast('The garbage truck is here');
    const hopper = () => [truck.x + truck.len / 2 + 0.7, truck.z - 0.5];
    const work = (m) => (function* (self) {
      m.riding = false; m.pose = 'stand';
      yield* m.walkTo(hopper()[0] + 0.3, truck.z - 1.6, SW_Y);
      while (self.bags.length) {
        // nearest bag that isn't already spoken for
        let best = null, bd = 1e9;
        for (const b of self.bags) { if (b.userData.taken) continue; const d = Math.hypot(b.position.x - m.pos.x, b.position.z - m.pos.z); if (d < bd) { bd = d; best = b; } }
        if (!best) break;
        best.userData.taken = true;
        m.label = 'grabbing bags';
        yield* m.walkTo(best.position.x, best.position.z + 0.55);
        m.targetYaw = Math.PI; m.pose = 'kneel';
        yield* m.waitReal(0.6);
        self.bags.splice(self.bags.indexOf(best), 1);
        W.scene.remove(best);
        best.position.set(0, -0.05, 0.05); best.rotation.set(0, 0, 0);
        m.av.J.prop.add(best);
        m.pose = 'stand';
        const [hx, hz] = hopper();
        yield* m.walkTo(hx, hz);
        m.targetYaw = -Math.PI / 2; m.pose = 'reach'; m.label = 'tossing bags in the hopper';
        yield* m.waitReal(0.7);
        m.av.J.prop.remove(best);
        truck.packing = 2.5;
        m.pose = 'stand';
      }
      yield* m.walkTo(truck.x + truck.len / 2 + 0.6, truck.z + m.side * 0.75, 0.48);
      m.riding = true;
    })(this);
    const jobs = crew.map(work);
    while (jobs.length) { for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].next().done) jobs.splice(i, 1); if (jobs.length) yield; }
    yield* this.waitReal(2.8);
    truck.leave(); slot.v = null;
  }
  *waitReal(s) { const end = this.world.realT + s; while (this.world.realT < end) yield; }
}

// Residents take the trash down on trash night (called with this = resident).
export function trashJob(san) {
  return function* () {
    const w = this.world;
    yield* this.doAt('stove', 1.2, 'reach', 'tying up the trash');
    this.hold(makeProp('trash'));
    this.label = 'taking out the trash';
    yield* this.exitUnit(true);
    this.where = 'out';
    this.returnAt = w.time + 20;
    const [x, z] = san.pileSpot();
    yield* this.walkTo(x, z - 0.6);
    this.targetYaw = 0; this.pose = 'kneel';
    yield* this.waitReal(0.9);
    this.drop();
    san.addBag(x, z, R() < 0.3 ? 'recycle' : 'bag');
    this.pose = 'stand';
    yield* this.enterUnit(true);
    this.where = 'home';
  };
}
