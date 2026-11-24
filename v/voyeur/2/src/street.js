// The street: one-way traffic (right to left), parked cars, people walking by, and the visits that
// come to the building: parcel vans, food delivery, rideshares and, rarely, an ambulance.
import * as THREE from 'three';
import { Kit, canvasTex, pick, range, damp } from './util.js';
import { makeProp } from './avatar.js';
import { Walker, pedestrianBrain, answerDoorJob, collapseJob, helperJob, randomLook, all } from './people.js';
import { SW_Y, LOBBY } from './building.js';

const LANE1 = 7.9, LANE2 = 10.9, CURB = 5.3;
const vehMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15 });
const CAR_COLORS = [0x1a1a1c, 0xe8e8e8, 0x8a8f96, 0x2a3a5a, 0x7a1e1e, 0x3a4a3a, 0xb0b4b8, 0x4a3a2a, 0x2a2a30, 0x5a6a7a];
let pizzaTex = null;

function lightBox(group, x0, y0, z0, x1, y1, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  group.add(m);
  return m;
}

// Built with the front toward -x, the direction of travel.
function makeVehicle(kind, color) {
  const g = new THREE.Group();
  const k = new Kit();
  const glass = 0x1b222b, dark = 0x1c1c1e;
  const head = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const tail = new THREE.MeshBasicMaterial({ color: 0x220000 });
  const amber = new THREE.MeshBasicMaterial({ color: 0x221100 });
  const L = { head, tail, amber, bar: [] };
  let len, wheelX, wr = 0.33;
  if (kind === 'van' || kind === 'ambulance') {
    len = 5.8; wheelX = [-1.9, 1.9];
    const body = kind === 'ambulance' ? 0xf2f2f0 : color;
    k.box(-2.9, 0.42, -1.0, -1.5, 2.05, 1.0, body, 0.15);
    k.box(-2.92, 1.25, -0.92, -2.4, 1.95, 0.92, glass);
    k.box(-2.5, 1.25, -1.01, -1.6, 1.9, 1.01, glass);
    k.box(-1.5, 0.42, -1.05, 2.9, 2.65, 1.05, body, 0.12);
    k.box(-2.95, 0.35, -1.0, -2.85, 0.65, 1.0, dark);
    k.box(2.85, 0.35, -1.0, 2.95, 0.6, 1.0, dark);
    if (kind === 'ambulance') {
      k.box(-2.91, 0.95, -1.06, 2.91, 1.25, 1.06, 0xc8281e);
      k.box(-0.4, 1.6, 1.051, 0.4, 2.3, 1.06, 0xc8281e); k.box(-0.75, 1.8, 1.051, 0.75, 2.1, 1.06, 0xc8281e);
      k.box(-0.4, 1.6, -1.06, 0.4, 2.3, -1.051, 0xc8281e); k.box(-0.75, 1.8, -1.06, 0.75, 2.1, -1.051, 0xc8281e);
      const red = new THREE.MeshBasicMaterial({ color: 0x220000 }), wht = new THREE.MeshBasicMaterial({ color: 0x222222 });
      L.bar.push(lightBox(g, -2.6, 2.06, -0.85, -2.0, 2.22, -0.1, red), lightBox(g, -2.6, 2.06, 0.1, -2.0, 2.22, 0.85, wht));
      L.bar.push(lightBox(g, 2.6, 2.66, -0.9, 2.85, 2.8, -0.5, red), lightBox(g, 2.6, 2.66, 0.5, 2.85, 2.8, 0.9, red));
      L.barMats = [red, wht];
    } else {
      k.box(-1.4, 1.0, 1.051, 2.8, 1.18, 1.06, 0xe8b23a);
      k.box(-1.4, 1.0, -1.06, 2.8, 1.18, -1.051, 0xe8b23a);
      k.box(0.2, 0.5, 1.052, 1.6, 2.3, 1.06, new THREE.Color(color).multiplyScalar(0.8).getHex());
    }
    lightBox(g, -2.96, 0.85, -0.85, -2.92, 1.05, -0.55, head); lightBox(g, -2.96, 0.85, 0.55, -2.92, 1.05, 0.85, head);
    lightBox(g, 2.92, 0.7, -1.0, 2.96, 1.2, -0.8, tail); lightBox(g, 2.92, 0.7, 0.8, 2.96, 1.2, 1.0, tail);
    lightBox(g, -2.96, 1.1, -1.0, -2.9, 1.2, -0.9, amber); lightBox(g, -2.96, 1.1, 0.9, -2.9, 1.2, 1.0, amber);
    lightBox(g, 2.92, 1.3, -1.0, 2.96, 1.4, -0.85, amber); lightBox(g, 2.92, 1.3, 0.85, 2.96, 1.4, 1.0, amber);
  } else {
    len = 4.5; wheelX = [-1.42, 1.42];
    k.box(-2.25, 0.3, -0.9, 2.25, 0.98, 0.9, color, 0.25);
    k.box(-1.05, 0.98, -0.8, 1.25, 1.46, 0.8, glass);
    k.box(-0.95, 1.46, -0.78, 1.15, 1.51, 0.78, color);
    k.box(-0.05, 0.98, -0.81, 0.05, 1.46, 0.81, color);
    k.box(-2.3, 0.28, -0.88, -2.2, 0.55, 0.88, dark);
    k.box(2.2, 0.28, -0.88, 2.3, 0.55, 0.88, dark);
    lightBox(g, -2.27, 0.68, -0.8, -2.24, 0.82, -0.5, head); lightBox(g, -2.27, 0.68, 0.5, -2.24, 0.82, 0.8, head);
    lightBox(g, 2.24, 0.68, -0.85, 2.27, 0.84, -0.55, tail); lightBox(g, 2.24, 0.68, 0.55, 2.27, 0.84, 0.85, tail);
    lightBox(g, -2.27, 0.6, -0.9, -2.22, 0.66, -0.82, amber); lightBox(g, -2.27, 0.6, 0.82, -2.22, 0.66, 0.9, amber);
    lightBox(g, 2.22, 0.6, -0.9, 2.27, 0.66, -0.82, amber); lightBox(g, 2.22, 0.6, 0.82, 2.27, 0.66, 0.9, amber);
    if (kind === 'taxi') { const t = new THREE.MeshBasicMaterial({ color: 0x332200 }); lightBox(g, -0.2, 1.51, -0.3, 0.3, 1.68, 0.3, t); L.roof = t; }
    if (kind === 'pizza') {
      pizzaTex ||= canvasTex(256, 96, (c) => { c.fillStyle = '#f4d23a'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#b5241c'; c.font = 'bold 62px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PIZZA', 128, 52); });
      const sm = new THREE.MeshBasicMaterial({ map: pizzaTex, color: 0x555555 });
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.26, 0.24), sm); s.rotation.y = Math.PI / 2; s.position.set(0.1, 1.64, 0); g.add(s);
      L.roof = sm;
    }
    if (kind === 'ride') { const b = new THREE.MeshBasicMaterial({ color: 0x220011 }); lightBox(g, -1.02, 1.05, 0.2, -0.99, 1.15, 0.45, b); L.badge = b; }
  }
  g.add(new THREE.Mesh(k.build(), vehMat));
  const wheels = [];
  const wg = new THREE.CylinderGeometry(wr, wr, 0.22, 14); wg.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.23, 10); hub.rotateX(Math.PI / 2);
  const wk = new Kit(); wk.geo(wg, 0x111111); wk.geo(hub, 0x8a8a8a); const wgeo = wk.build();
  const half = kind === 'van' || kind === 'ambulance' ? 0.92 : 0.82;
  for (const x of wheelX) for (const z of [-half, half]) { const w = new THREE.Mesh(wgeo, vehMat); w.position.set(x, wr, z); g.add(w); wheels.push(w); }
  return { group: g, lights: L, wheels, len, wr };
}

export class Vehicle {
  constructor(street, kind, o = {}) {
    this.street = street; this.kind = kind;
    const col = o.color ?? (kind === 'taxi' ? 0xf0c020 : kind === 'van' ? pick(Math.random, [0x5b3d24, 0xf2f2f0, 0x2a3a6a]) : pick(Math.random, CAR_COLORS));
    Object.assign(this, makeVehicle(kind, col));
    this.x = o.x ?? 58; this.z = o.lane ?? LANE1; this.tz = this.z;
    this.cruise = o.cruise ?? range(Math.random, 7.5, 10); this.v = o.state === 'parked' ? 0 : this.cruise * 0.9;
    this.state = o.state || 'drive'; this.stopX = o.stopX ?? null; this.hazard = false; this.flash = !!o.flash;
    this.yaw = 0; this.braking = false;
    this.group.traverse((o) => { if (o.isMesh && o.material === vehMat) o.castShadow = o.receiveShadow = true; });
    street.world.scene.add(this.group);
    street.vehicles.push(this);
    this.sync();
  }
  sync() { this.group.position.set(this.x, 0, this.z); this.group.rotation.y = this.yaw; }
  leave() { this.state = 'depart'; this.stopX = null; this.tz = LANE1; this.hazard = false; }
  update(dt) {
    const w = this.street.world;
    let vt = this.cruise;
    if (this.state === 'drive' && this.stopX != null) {
      const dist = this.x - this.stopX;
      if (dist < 20) this.tz = this.curb ?? CURB;
      vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * 2.0 * Math.max(0, dist - 0.05))) + 0.15);
      if (dist <= 0.08) { this.x = this.stopX; this.v = 0; this.state = 'stopped'; this.hazard = this.kind !== 'ride' && this.kind !== 'taxi'; }
    }
    if (this.state === 'drive' || this.state === 'depart') {
      for (const o of this.street.vehicles) {
        if (o === this || o.x >= this.x || Math.abs(o.z - this.z) > 1.4) continue;
        const gap = this.x - o.x - (this.len + o.len) / 2;
        if (gap < 14) vt = Math.min(vt, Math.max(0, (gap - 2.2) * 1.1));
      }
      const a = vt > this.v ? 2.4 : 5.0;
      const nv = this.v + Math.sign(vt - this.v) * Math.min(Math.abs(vt - this.v), a * dt);
      this.braking = nv < this.v - 0.01 || nv < 0.3;
      this.v = nv;
      this.x -= this.v * dt;
      const oz = this.z;
      this.z = damp(this.z, this.tz, 0.9, dt);
      const dz = (this.z - oz) / Math.max(dt, 1e-4);
      this.yaw = damp(this.yaw, Math.atan2(dz, Math.max(this.v, 0.5)) * 0.9, 6, dt);
      if (this.x < -62) this.dispose();
    } else {
      this.braking = this.state === 'stopped';
    }
    for (const wh of this.wheels) wh.rotation.z += this.v * dt / this.wr;
    this.sync();
    const night = 1 - w.dayF;
    const blink = Math.sin(w.realT * 7) > 0;
    this.lights.head.color.setRGB(0.15 + 2.6 * night * (this.state === 'parked' ? 0 : 1), 0.15 + 2.4 * night * (this.state === 'parked' ? 0 : 1), 0.13 + 1.9 * night * (this.state === 'parked' ? 0 : 1));
    const t = this.state === 'parked' ? 0.08 : this.braking ? 2.6 : 0.25 + 0.9 * night;
    this.lights.tail.color.setRGB(t, 0.02, 0.01);
    this.lights.amber.color.setRGB(this.hazard && blink ? 2.4 : 0.08, this.hazard && blink ? 1.2 : 0.04, 0.0);
    if (this.lights.roof) this.lights.roof.color.setScalar(0.4 + 1.6 * night);
    if (this.lights.badge) this.lights.badge.color.setRGB(1.6, 0.3, 0.9);
    if (this.lights.barMats) {
      const ph = Math.floor(w.realT * 6) % 4;
      const on = this.flash;
      this.lights.barMats[0].color.setRGB(on && ph % 2 === 0 ? 4 : 0.1, 0.02, 0.02);
      this.lights.barMats[1].color.setScalar(on && ph % 2 === 1 ? 4 : 0.12);
    }
  }
  dispose() { this.dead = true; this.street.world.scene.remove(this.group); }
}

export class Street {
  constructor(world) {
    this.world = world;
    this.vehicles = [];
    this.jobs = [];
    this.slots = [{ x: -2.6, v: null }, { x: 6.0, v: null }];
    this.trafficT = 2; this.pedT = 1;
    this.flashLight = new THREE.PointLight(0xff2020, 0, 30, 1.4);
    this.flashLight.position.set(-2, 3, 6);
    world.scene.add(this.flashLight);
    this.flashing = null;
    for (const x of [-13.5, -19.2, -26, 33, 39]) new Vehicle(this, Math.random() < 0.15 ? 'van' : 'car', { x, lane: CURB, state: 'parked' });
    for (const x of [-15, -22, 30, 38]) new Vehicle(this, 'car', { x, lane: 13.7, state: 'parked' });
  }
  run(gen) { this.jobs.push(gen); }
  freeSlot() { return this.slots.find((s) => !s.v); }
  canDeliver() { return true; }
  update(dt) {
    const w = this.world;
    const h = w.mod / 60;
    const busy = h > 7 && h < 21 ? 1 : h > 5 && h < 24 ? 0.5 : 0.15;
    this.trafficT -= dt;
    if (this.trafficT <= 0) {
      this.trafficT = range(Math.random, 3, 16) / busy;
      const lane = Math.random() < 0.55 ? LANE1 : LANE2;
      if (!this.vehicles.some((v) => v.x > 44 && Math.abs(v.z - lane) < 1.5)) {
        const kind = weightedKind();
        new Vehicle(this, kind, { lane });
      }
    }
    this.pedT -= dt;
    if (this.pedT <= 0) {
      this.pedT = range(Math.random, 4, 14) / busy;
      this.spawnPedestrian();
    }
    if (w.season.halloween && w.mod > 1050 && w.mod < 1230 && Math.random() < dt / 25) this.trickOrTreaters();
    for (const v of this.vehicles) v.update(dt);
    this.vehicles = this.vehicles.filter((v) => !v.dead);
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      let done = false;
      try { done = this.jobs[i].next().done; } catch (e) { console.error(e); done = true; }
      if (done) this.jobs.splice(i, 1);
    }
    if (this.flashing && !this.flashing.dead) {
      const v = this.flashing;
      const ph = Math.floor(w.realT * 6) % 4;
      this.flashLight.position.set(v.x - 1, 2.6, v.z - 1.6);
      this.flashLight.color.set(ph % 2 ? 0xffffff : 0xff1a1a);
      this.flashLight.intensity = v.flash ? (ph % 2 ? 25 : 60) : 0;
    } else this.flashLight.intensity = 0;
  }

  spawnPedestrian() {
    const w = this.world, r = Math.random;
    const look = randomLook(r, { old: r() < 0.12 });
    if (w.season.snow) { look.shirt = pick(r, [0x2a2a30, 0x4a2a2a, 0x2a3a4a, 0x6a5a4a, 0x1a1a1a]); look.hat = r() < 0.4 ? pick(r, [0x9a2a2a, 0x2a4a7a, 0xd8d8d8]) : null; }
    const p = new Walker(w, look, pedestrianBrain());
    if (r() < 0.15) {
      const dogLook = { dog: true, len: range(r, 0.35, 0.6), h: range(r, 0.25, 0.42), r: range(r, 0.12, 0.17), color: pick(r, [0xc8a060, 0x3a2a1a, 0xe8e0d0, 0x1a1a1a, 0x8a5a3a]) };
      const dog = new Walker(w, dogLook, function* () {
        this.hidden = false;
        for (;;) {
          if (p.dead) { this.remove(); return; }
          const off = 0.9;
          const tx = p.pos.x - Math.sin(p.yaw) * off + 0.35, tz = p.pos.z - Math.cos(p.yaw) * off + 0.25;
          const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
          if (this.pos.x > 900) { this.pos.set(tx, SW_Y, tz); }
          else if (d > 0.08) { const sp = Math.min(d * 3, 2.2) * w.dt; this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; this.targetYaw = Math.atan2(dx, dz); this.pose = 'walk'; this.phase += sp * 7; }
          else this.pose = 'stand';
          this.pos.y = SW_Y;
          this.hidden = p.hidden;
          yield;
        }
      });
      dog.speed = 1.6;
    }
  }
  trickOrTreaters() {
    const w = this.world, r = Math.random;
    const dir = r() < 0.5 ? -1 : 1, lane = range(r, 1.8, 2.8);
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const costume = pick(r, [{ shirt: 0xf4f4f4, pants: 0xf4f4f4, hair: 0xf4f4f4 }, { shirt: 0x1a1a1a, pants: 0x1a1a1a, hat: 0x1a1a1a }, { shirt: 0xe07a1a, pants: 0x1a1a1a }, { shirt: 0x2a6a2a, pants: 0x2a6a2a }, { shirt: 0xb02a2a, pants: 0x2a2aa0 }]);
      const look = { ...randomLook(r), height: range(r, 1.0, 1.3), ...costume };
      const p = new Walker(w, look, null, { speed: 1.25 });
      p.co = (function* () { yield* p.waitReal(i * 0.6); yield* pedestrianBrain({ dir, lane: lane + i * 0.3, trickOrTreat: true }).call(p); })();
    }
    const parent = new Walker(w, randomLook(r), null, { speed: 1.2 });
    parent.co = (function* () { yield* parent.waitReal(n * 0.6 + 1.5); yield* pedestrianBrain({ dir, lane: lane + 0.8 }).call(parent); })();
  }

  // ---- visits
  *waitSlot() { let s; while (!(s = this.freeSlot())) yield; return s; }
  deliverPackage(unit) {
    const w = this.world;
    const evt = { unit };
    this.run((function* (S) {
      const slot = yield* S.waitSlot();
      const van = new Vehicle(S, 'van', { stopX: slot.x, cruise: 8 });
      slot.v = van;
      while (van.state !== 'stopped') yield;
      w.toast(`A package is here for ${unit.name}`);
      const look = randomLook(Math.random, { shirt: van.kind === 'van' ? 0x4a3a2a : 0x2a3a5a, pants: 0x3a3022, hat: 0x3a3022 });
      const d = new Walker(w, look, null, { speed: 1.45 });
      d.pos.set(van.x + 0.6, SW_Y, 4.35); d.hidden = false;
      yield* d.waitReal(1.5);
      d.hold(makeProp('package'));
      yield* d.walkTo(van.x + 0.6, 3.2);
      yield* d.walkTo(0.15, 0.75);
      d.targetYaw = Math.PI;
      d.pose = 'carry';
      const res = w.pickAnswerer(unit);
      if (res && res.interrupt(answerDoorJob(evt))) {
        yield* d.waitUntil(() => evt.answered, 75);
      }
      if (evt.answered) {
        yield* d.waitReal(1.2);
        const box = d.drop();
        evt.answered.hold(box);
        evt.handover = true;
        yield* d.waitReal(1.0);
      } else {
        evt.cancelled = true;
        yield* d.waitReal(3);
        d.pose = 'kneel';
        yield* d.waitReal(1.2);
        const box = d.drop();
        w.leavePackage(unit, box, new THREE.Vector3(0.55 * (Math.random() < 0.5 ? -1 : 1), SW_Y + 0.27, 0.32));
        d.pose = 'stand';
        yield* d.waitReal(0.8);
      }
      yield* d.walkTo(van.x + 0.6, 3.2);
      yield* d.walkTo(van.x + 0.6, 4.35);
      d.remove();
      yield* d.waitReal(1.0);
      van.leave(); slot.v = null;
    })(this));
  }
  orderFood(person, meal) {
    const w = this.world;
    const evt = { meal };
    const unit = person.home;
    const eta = w.time + range(Math.random, 22, 40);
    this.run((function* (S) {
      while (w.time < eta) yield;
      const slot = yield* S.waitSlot();
      const car = new Vehicle(S, 'pizza', { stopX: slot.x });
      slot.v = car;
      while (car.state !== 'stopped') yield;
      w.toast(`Food delivery for ${unit.name}`);
      const look = randomLook(Math.random, { shirt: 0xb5241c, hat: 0xb5241c });
      const d = new Walker(w, look, null, { speed: 1.6 });
      d.pos.set(car.x + 0.2, SW_Y, 4.3); d.hidden = false;
      d.hold(makeProp('pizza'));
      yield* d.walkTo(car.x + 0.2, 3.2);
      yield* d.walkTo(-0.15, 0.75);
      d.targetYaw = Math.PI; d.pose = 'carry';
      const res = unit.residents.includes(person) && person.where === 'home' ? person : w.pickAnswerer(unit);
      if (res && res.interrupt(answerDoorJob(evt))) yield* d.waitUntil(() => evt.answered, 80);
      if (evt.answered) {
        yield* d.waitReal(1.0);
        evt.answered.hold(d.drop());
        evt.handover = true;
        d.pose = 'stand';
        yield* d.waitReal(2.5);
      } else { evt.cancelled = true; meal.ready = true; yield* d.waitReal(4); }
      yield* d.walkTo(car.x + 0.2, 3.2);
      yield* d.walkTo(car.x + 0.2, 4.3);
      d.remove();
      yield* d.waitReal(0.8);
      car.leave(); slot.v = null;
    })(this));
  }
  callRide(person, dropoff = false) {
    const ride = { car: null, boarded: false, alighted: false };
    const w = this.world;
    this.run((function* (S) {
      if (!dropoff) yield* person.waitReal(range(Math.random, 6, 14));
      const slot = yield* S.waitSlot();
      const car = new Vehicle(S, Math.random() < 0.25 ? 'taxi' : 'ride', { stopX: slot.x - 0.5, color: pick(Math.random, [0x1a1a1c, 0x2a2a30, 0x4a4a52, 0xe8e8e8]) });
      slot.v = car;
      while (car.state !== 'stopped') yield;
      ride.car = car;
      if (dropoff) { while (!ride.alighted) yield; yield* person.waitReal(1.5); }
      else { while (!ride.boarded) yield; yield* person.waitReal(1.2); }
      car.leave(); slot.v = null;
      void w;
    })(this));
    return ride;
  }
  ambulance(victim) {
    const w = this.world, unit = victim.home;
    const evt = { victim, unit };
    const helper = unit.residents.find((p) => p !== victim && p.where === 'home' && !p.asleep);
    if (!victim.interrupt(collapseJob(evt), true)) return false;
    if (helper) helper.interrupt(helperJob(evt), true);
    w.toast(`Someone in ${unit.name} needs help. 911 has been called.`);
    this.run((function* (S) {
      yield* victim.waitReal(helper ? 10 : 18);
      const slot = S.slots[0].v ? null : S.slots[0];
      if (slot) slot.v = 'amb';
      const amb = new Vehicle(S, 'ambulance', { stopX: slot ? slot.x - 1.2 : -3.4, cruise: 11, flash: true });
      if (!slot) amb.curb = LANE1 - 0.6;
      if (slot) slot.v = amb;
      S.flashing = amb;
      w.toast('An ambulance is pulling up');
      while (amb.state !== 'stopped') yield;
      const mk = () => new Walker(w, randomLook(Math.random, { shirt: 0x1e2a44, pants: 0x1e2a44, hairStyle: 'short' }), null, { speed: 1.55, home: unit, counts: true });
      const m1 = mk(), m2 = mk();
      const rear = amb.x + 3.3;
      m1.pos.set(rear, SW_Y, amb.z - 0.4); m2.pos.set(rear + 0.4, SW_Y, amb.z + 0.4);
      m1.hidden = m2.hidden = false;
      const gurney = makeProp('gurney');
      w.scene.add(gurney.group);
      const G = { pos: new THREE.Vector3(rear + 1.2, SW_Y, amb.z), yaw: 0, parked: false };
      const followG = function* () {
        while (!G.done) {
          if (!G.parked) {
            const fx = Math.sin(m1.yaw), fz = Math.cos(m1.yaw);
            G.pos.x = damp(G.pos.x, m1.pos.x + fx * 1.25, 7, w.dt); G.pos.z = damp(G.pos.z, m1.pos.z + fz * 1.25, 7, w.dt);
            G.pos.y = m1.pos.y; G.yaw = m1.yaw;
          }
          gurney.group.position.copy(G.pos); gurney.group.rotation.y = G.yaw;
          gurney.group.visible = !m1.hidden || G.parked;
          for (const m of gurney.meshes) m.material = G.parked ? (w.roomAt(G.pos) || {}).mat || w.outMat : m1.mat;
          yield;
        }
      }();
      S.run(followG);
      G.place = (a) => { const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw); a.pos.set(G.pos.x + fx * 0.85, G.pos.y + 0.94, G.pos.z + fz * 0.85); a.yaw = a.targetYaw = G.yaw; a.yawLock = true; a.hidden = !gurney.group.visible; };
      m1.pushing = true;
      const inPath = function* (m, delay) {
        yield* m.waitReal(delay);
        yield* m.walkTo(1.0, 3.0, SW_Y);
        yield* m.walkTo(LOBBY.outside[0], LOBBY.outside[1]);
        yield* m.walkTo(LOBBY.inside[0], LOBBY.inside[1]);
        yield* m.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
        yield* m.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1]);
        yield* m.walkTo(LOBBY.stairTop[0], LOBBY.stairTop[1], SW_Y + 1.8);
        m.hidden = true;
        yield* m.waitReal((unit.floor + 1) * 4.2);
        const d = unit.spots.door;
        m.pos.set(d.at[0], unit.y, d.at[1]); m.hidden = false; m.atSpot = 'door';
      };
      yield* all(inPath(m1, 0), inPath(m2, 1.1));
      evt.medicsInside = true;
      unit.rooms.L.set(0, true);
      w.toast(`Paramedics are inside ${unit.name}`);
      while (!evt.victimReady) yield;
      const v = victim.pos;
      const hx = -Math.sin(victim.yaw), hz = -Math.cos(victim.yaw);
      const px = -hz, pz = hx;
      yield* all(m1.goPoint(v.x + hx * 1.2 + px * 0.6, v.z + hz * 1.2 + pz * 0.6), (function* () { yield* m2.waitReal(1.0); yield* m2.goPoint(v.x + hx * 0.5 - px * 0.55, v.z + hz * 0.5 - pz * 0.55); })());
      G.parked = true;
      m1.targetYaw = Math.atan2(-px, -pz); m2.targetYaw = Math.atan2(px, pz);
      m1.pose = m2.pose = 'kneel'; m1.label = m2.label = 'treating the patient';
      yield* m1.waitReal(30);
      m1.pose = m2.pose = 'stand';
      yield* m1.waitReal(1.5);
      G.pos.set(v.x + hx * 0.85 - px * 1.1, unit.y, v.z + hz * 0.85 - pz * 1.1);
      G.yaw = Math.atan2(hx, hz);
      yield* m1.waitReal(0.6);
      victim.carriedBy = G;
      yield* m1.waitReal(1.5);
      G.parked = false;
      const outPath = function* (m, delay) {
        yield* m.waitReal(delay);
        yield* m.goSpot('door');
        m.hidden = true;
        yield* m.waitReal((unit.floor + 1) * 5.0);
        m.pos.set(LOBBY.stairTop[0], SW_Y + 1.8, LOBBY.stairTop[1]); m.hidden = false;
        yield* m.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1], SW_Y);
        yield* m.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
        yield* m.walkTo(LOBBY.inside[0], LOBBY.inside[1]);
        yield* m.walkTo(LOBBY.outside[0], LOBBY.outside[1]);
        yield* m.walkTo(rear + 0.3, amb.z);
      };
      yield* all(outPath(m1, 0), outPath(m2, 1.3));
      yield* m1.waitReal(1.5);
      evt.loadedInto = amb;
      m1.remove(); m2.remove();
      w.scene.remove(gurney.group);
      G.done = true;
      yield* m1.waitReal(1.0);
      amb.leave();
      if (slot) slot.v = null;
      w.toast(`The ambulance leaves for the hospital`);
      yield* m1.waitReal(12);
      if (S.flashing === amb) S.flashing = null;
    })(this));
    return true;
  }
}

function weightedKind() {
  const r = Math.random();
  return r < 0.18 ? 'taxi' : r < 0.26 ? 'van' : 'car';
}
