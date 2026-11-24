// The rare, big events: a kitchen fire (evacuation, fire engine, firefighters, damage that takes
// days to fix) and a break-in (someone up the fire escape with a flashlight while the tenants are
// away, found when they come home, then a police report). Both run as generators on the street.
import * as THREE from 'three';
import { Walker, randomLook, all } from './people.js';
import { makeProp } from './avatar.js';
import { Vehicle } from './street.js';
import { LOBBY, SW_Y, GH, FH, FZ, HEAD, SILL } from './building.js';
import { range, pick, canvasTex, paint } from './util.js';

const R = Math.random;
let soft = null;
const softTex = () => (soft ||= canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));
const platformY = (f) => GH + f * FH + 0.35;

// Crews (paramedics, firefighters, police) come in from the curb and up the stairs, and back.
export function* crewIn(m, unit, delay, perFloor = 4.5, fromDoor = false) {
  yield* m.waitReal(delay);
  if (!fromDoor) yield* m.walkTo(m.pos.x * 0.5 + 0.5, 3.0, SW_Y);
  yield* m.walkTo(LOBBY.outside[0], LOBBY.outside[1]);
  yield* m.walkTo(LOBBY.inside[0], LOBBY.inside[1]);
  yield* m.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
  yield* m.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1]);
  yield* m.walkTo(LOBBY.stairTop[0], LOBBY.stairTop[1], SW_Y + 1.8);
  m.hidden = true;
  yield* m.waitReal((unit.floor + 1) * perFloor);
  const d = unit.spots.door;
  m.pos.set(d.at[0], unit.y, d.at[1]); m.hidden = false; m.atSpot = 'door';
}
export function* crewOut(m, unit, delay, dest, perFloor = 4.5) {
  yield* m.waitReal(delay);
  yield* m.goSpot('door');
  m.hidden = true;
  yield* m.waitReal((unit.floor + 1) * perFloor);
  m.pos.set(LOBBY.stairTop[0], SW_Y + 1.8, LOBBY.stairTop[1]); m.hidden = false;
  yield* m.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1], SW_Y);
  yield* m.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
  yield* m.walkTo(LOBBY.inside[0], LOBBY.inside[1]);
  yield* m.walkTo(LOBBY.outside[0], LOBBY.outside[1]);
  yield* m.walkTo(dest[0], dest[1]);
}

const PARTY = [[2.3, -1.8], [3.0, -1.6], [3.6, -2.2], [2.6, -2.9], [3.4, -3.05], [1.3, -2.2], [2.0, -3.35], [3.9, -3.2], [2.95, -2.35], [3.6, -1.4]];

function hostJob(P) {
  return function* () {
    const u = this.home, w = this.world;
    this.busy = true;
    try {
      yield* this.doAt('pkg', 3, 'reach', 'tidying up for guests');
      if (P.mode === 'family') {
        const k = this.claim(['stove']);
        if (k) {
          try {
            yield* this.goSpot(k);
            this.pose = 'cook'; this.label = 'roasting the turkey'; u.burnerOn = true;
            yield* this.waitUntil(() => w.time >= P.dinnerAt || P.done);
          } finally { u.burnerOn = false; this.release(k); }
        } else {
          yield* this.goPoint(u.X(2.6), u.Z(-1.25));
          this.pose = 'reach'; this.label = 'setting the table';
          yield* this.waitGame(4);
          this.pose = 'stand'; this.label = 'catching up with family';
          yield* this.waitUntil(() => w.time >= P.dinnerAt || P.done);
        }
        if (!P.turkey && k) {
          P.turkey = makeProp('turkey');
          P.turkey.group.position.set(u.X(3.3), u.y + 0.745, u.Z(-0.36));
          for (const m of P.turkey.meshes) m.material = u.rooms.L.mat;
          w.scene.add(P.turkey.group);
          yield* this.goPoint(u.X(3.3), u.Z(-1.05));
          this.targetYaw = 0; this.pose = 'reach'; this.label = 'carving the turkey';
          yield* this.waitGame(5);
        }
        this.pose = 'carry'; this.label = 'having Thanksgiving dinner';
        yield* this.waitUntil(() => w.time >= P.dinnerAt + 75 || P.done);
        if (P.turkey) { w.scene.remove(P.turkey.group); P.turkey = null; }
        u.rooms.L.set(2, true);
        yield* this.watchTV(400, () => P.done, 'watching football with the family');
      }
      let i = 0;
      while (!P.done) {
        const sp = w.incidents.partySpot(P);
        yield* this.goPoint(u.X(sp[0]), u.Z(sp[1]));
        this.targetYaw = Math.atan2(u.X(2.8) - this.pos.x, u.Z(-2.4) - this.pos.z) + range(R, -0.6, 0.6);
        this.label = P.over ? 'saying goodnight to guests' : i % 3 === 2 ? 'dancing at their own party' : 'hosting a party';
        this.pose = i % 3 === 2 && !P.over ? 'dance' : 'stand';
        yield* this.waitUntil(() => P.done, range(R, 15, 30));
        P.taken.delete(sp);
        i++;
      }
      this.pose = 'stand';
      yield* this.doAt('stove', range(R, 12, 20), 'reach', 'cleaning up after the party');
    } finally { this.busy = false; this.pose = 'stand'; }
  };
}

function broomJob() {
  return function* () {
    const u = this.home;
    const broom = makeProp('broom');
    try {
      yield* this.goPoint(u.X(2.9), u.Z(-2.4));
      this.label = 'banging on the ceiling with a broom';
      broom.group.rotation.x = Math.PI;
      for (const m of broom.meshes) { m.material = this.mat; this.meshes.push(m); }
      this.av.J.handR.add(broom.group);
      this.pose = 'broom';
      yield* this.waitGame(1.6);
      this.pose = 'stand';
      this.label = 'grumbling about the noise';
      yield* this.waitGame(3);
      this.pose = 'broom';
      this.label = 'banging on the ceiling again';
      yield* this.waitGame(1.2);
    } finally {
      this.av.J.handR.remove(broom.group);
      this.meshes = this.meshes.filter((m) => !broom.meshes.includes(m));
      this.pose = 'stand';
    }
    yield* this.watchTV(30, null, 'grumbling about the noise');
  };
}

function* partyGuest(g, P, inc, delay) {
  const W = g.world, u = P.unit;
  yield* g.waitReal(delay);
  const dir = R() < 0.5 ? -1 : 1;
  g.pos.set(dir * 42, SW_Y, range(R, 1.6, 3.2)); g.hidden = false;
  g.label = P.mode === 'family' ? 'on the way to Thanksgiving dinner' : 'on the way to a party';
  if (R() < 0.6) g.hold(makeProp(P.mode === 'family' ? 'bag' : R() < 0.3 ? 'bag' : 'cup'));
  yield* g.walkTo(dir * 1.6, 1.5);
  yield* g.walkTo(0.25 * dir, 0.8);
  g.targetYaw = Math.PI; g.label = 'buzzing up';
  yield* g.waitReal(range(R, 2, 5));
  yield* crewIn(g, u, 0, 5.5, true);
  g.label = 'at the party';
  while (!(P.over && W.time >= g.leaveAt)) {
    const sp = inc.partySpot(P);
    yield* g.goPoint(u.X(sp[0]), u.Z(sp[1]));
    g.targetYaw = Math.atan2(u.X(2.8) - g.pos.x, u.Z(-2.4) - g.pos.z) + range(R, -0.8, 0.8);
    if (P.mode === 'family') {
      const ph = W.time < P.dinnerAt ? 0 : W.time < P.dinnerAt + 75 ? 1 : 2;
      if (ph === 1 && !g.carry) g.hold(makeProp('plate'));
      if (ph !== 1 && g.carry && g.carry.kind === 'plate') g.drop();
      g.pose = ph === 1 ? 'carry' : 'stand';
      g.label = ['catching up with family', 'having Thanksgiving dinner', 'watching football'][ph];
      if (ph === 2) g.targetYaw = Math.atan2(u.X(4.4) - g.pos.x, u.Z(-2.1) - g.pos.z);
    } else {
      g.pose = R() < 0.45 ? 'dance' : 'stand';
      g.label = g.pose === 'dance' ? 'dancing' : 'chatting';
    }
    g.headTurn = range(R, -0.6, 0.6);
    yield* g.waitUntil(() => P.over && W.time >= g.leaveAt, range(R, 14, 32));
    P.taken.delete(sp);
  }
  g.pose = 'stand';
  if (g.crasher) {
    // one guest never makes it home
    g.claim(['sofa1']); g.claim(['sofa2']);
    yield* g.goSpot('sofa1');
    g.label = P.mode === 'family' ? 'napping off the turkey on the sofa' : 'sleeping it off on the sofa'; g.sleeping = true;
    g.pose = 'lie';
    yield* g.glide(u.X(0.62), u.y + 0.5, u.Z(-2.95), Math.PI, 1.4);
    let wake = W.day * 1440 + range(R, 510, 600);
    if (wake < W.time) wake += 1440;
    if (P.mode === 'family') wake = W.time + range(R, 35, 80);
    yield* g.waitUntil(() => W.time >= wake);
    g.pose = 'stand';
    yield* g.glide(u.X(1.25), u.y, u.Z(-2.5), 0, 1.4);
    g.release('sofa1'); g.release('sofa2');
    g.label = 'sneaking out, very hungover';
    g.sleeping = false;
  }
  g.label = 'heading home';
  yield* crewOut(g, u, range(R, 0, 3), [range(R, -1.2, 1.2), 2.4], 5.5);
  if (g.carry) g.drop();
  yield* g.walkTo(dir * 42, range(R, 1.6, 3.2));
  g.remove();
}

function evacuateJob(evt) {
  return function* () {
    const w = this.world;
    const sp = this.speed;
    this.busy = true;
    try {
      this.label = this.home === evt.unit ? 'escaping the fire' : 'evacuating (fire alarm)';
      this.speed = Math.max(sp, 1.6);
      if (this.carry) this.drop();
      yield* this.exitUnit(true);
      this.where = 'out';
      let x = range(R, 2, 8) * (R() < 0.5 ? -1 : 1);
      yield* this.walkTo(x, range(R, 2.4, 3.6));
      this.speed = sp;
      this.targetYaw = Math.PI;
      this.label = 'watching from the sidewalk';
      this.headTurn = 0;
      yield* this.waitUntil(() => evt.allClear);
      if (this.home === evt.unit) {
        this.label = 'staying with a friend';
        x = x < 0 ? -42 : 42;
        yield* this.walkTo(x, range(R, 1.6, 3.2));
        this.offstage(); this.where = 'away';
        this.returnAt = evt.returnAt;
        yield* this.waitUntil(() => w.time >= evt.returnAt);
        this.busy = false;
        yield* this.comeHome('walk');
      } else {
        yield* this.waitReal(range(R, 1, 10));
        this.label = 'heading back inside';
        yield* this.enterUnit(true);
        this.where = 'home';
      }
    } finally { this.busy = false; this.speed = sp; }
  };
}

export class Incidents {
  constructor(world) {
    this.world = world;
    this.smoke = [];
    this.pool = [];
  }
  get street() { return this.world.street; }
  busy() { return !!this.street.flashing || this.world.units.some((u) => u.fire && !u.fire.out) || this.burglar; }

  // ---------------------------------------------------------------- fire
  startFire(u) {
    const W = this.world;
    if (u.fire || this.street.flashing) return false;
    const evt = { unit: u, allClear: false, returnAt: W.time + range(R, 1500, 2600) };
    u.fire = { level: 0.12, out: false, fighting: false, smokeLeft: 1, evt, flames: this.makeFlames(u) };
    u.burnerOn = false;
    const cook = u.residents.find((p) => p.where === 'home' && !p.asleep && p.label === 'cooking dinner');
    W.toast(cook ? `A grease fire in ${u.name}! ${cook.name} pulls the alarm.` : `Fire in ${u.name}! The alarm is going off.`);
    for (const p of W.residents) if (p.where === 'home' && !p.busy) p.interrupt(evacuateJob(evt), true);
    this.street.run(this.fireResponse(evt));
    return true;
  }
  makeFlames(u) {
    const g = new THREE.Group();
    const sprites = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: i % 3 ? 0xff7a20 : 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      // the first flames are on the stove; the rest reach toward the windows as it grows
      const reach = i / 8;
      const lx = range(R, 1.0, 2.6) + reach * range(R, -0.6, 1.4), lz = -4.1 + reach * range(R, 2.4, 3.6);
      s.userData = { x: u.X(lx), z: u.Z(lz), y: u.y + (i < 3 ? 0.95 : range(R, 0.15, 0.6)), ph: R() * 10, k: range(R, 0.5, 1.1), reach };
      g.add(s); sprites.push(s);
    }
    this.world.scene.add(g);
    return { g, sprites };
  }
  *fireResponse(evt) {
    const W = this.world, S = this.street, u = evt.unit, f = u.fire;
    yield* this.wait(22);
    const slot = S.slots[0].v ? null : S.slots[0];
    const truck = new Vehicle(S, 'fire', { stopX: slot ? slot.x - 0.4 : -3.0, cruise: 10, flash: true });
    if (slot) slot.v = truck; else truck.curb = 7.3;
    S.flashing = truck;
    W.toast('A fire engine is on the way');
    while (truck.state !== 'stopped') yield;
    const win = u.windows[1];
    truck.ladderTarget = new THREE.Vector3(win.x, u.y + 1.9, 0.4);
    const look = (helmet) => randomLook(R, { shirt: 0x2e2a20, pants: 0x2e2a20, shoes: 0x111111, hairStyle: 'short', hat: helmet, sleeves: true, dress: false });
    const crew = [0, 1, 2].map((i) => {
      const m = new Walker(W, look(i ? 0x1a1a1a : 0xd8b030), null, { speed: 1.6, home: u, counts: true });
      m.role = 'firefighters'; m.label = 'fighting the fire';
      m.pos.set(truck.x + 1.2 + i * 0.7, SW_Y, truck.z - 1.3); m.hidden = false;
      return m;
    });
    yield* all(...crew.map((m, i) => crewIn(m, u, i * 1.1, 3.6)));
    W.toast(`Firefighters are inside ${u.name}`);
    const spots = [[1.9, -3.05], [2.7, -2.85], [1.25, -2.75]];
    yield* all(...crew.map((m, i) => (function* () { yield* m.waitReal(i * 0.6); yield* m.goPoint(u.X(spots[i][0]), u.Z(spots[i][1])); })()));
    for (const m of crew) { m.targetYaw = Math.atan2(0, -1); m.pose = 'push'; }
    f.fighting = true;
    while (!f.out) yield;
    W.toast(`The fire in ${u.name} is out`);
    for (const m of crew) { m.pose = 'stand'; m.label = 'checking for hot spots'; }
    yield* this.wait(14);
    yield* all(...crew.map((m, i) => crewOut(m, u, i * 1.2, [truck.x + 1.2 + i * 0.7, truck.z - 1.3], 3.6)));
    for (const m of crew) m.remove();
    truck.ladderTarget = null;
    u.damage = { until: W.time + range(R, 2.0, 3.2) * 1440 };
    yield* this.wait(8);
    evt.allClear = true;
    truck.leave();
    if (slot) slot.v = null;
    yield* this.wait(10);
    if (S.flashing === truck) S.flashing = null;
  }
  *wait(sec) { const end = this.world.realT + sec; while (this.world.realT < end) yield; }

  // ---------------------------------------------------------------- break-in
  canBreakInto(u, minAway = 90) {
    const W = this.world;
    if (!u.residents.length || u.breakIn || u.fire || u.damage || u.party) return false;
    return u.residents.every((p) => p.where !== 'home' && !p.busy && (p.returnAt || 0) - W.time > minAway);
  }
  startBreakIn(u) {
    const W = this.world;
    if (this.burglar || !u) return false;
    u.breakIn = { done: false, reported: false };
    const b = new Walker(W, randomLook(R, { shirt: 0x15171a, pants: 0x1b1d22, shoes: 0x101010, hat: 0x101012, hairStyle: 'short', dress: false }), null, { speed: 1.3, home: u });
    b.role = 'a stranger with a flashlight';
    b.label = 'walking by';
    this.burglar = b;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    glow.position.set(0.12, 0.05, 0.05);
    b.av.J.prop.add(glow);
    b.glow = glow;
    this.street.run(this.burglary(b, u));
    return true;
  }
  *burglary(b, u) {
    const W = this.world;
    const dir = R() < 0.5 ? -1 : 1;
    b.pos.set(dir * 42, SW_Y, 2.7); b.hidden = false;
    yield* b.walkTo(2.6 * dir, 2.4);
    yield* b.walkTo(2.17, 1.55);
    b.targetYaw = Math.PI; b.label = 'looking around';
    b.headTurn = 0.7; yield* b.waitReal(1.6); b.headTurn = -0.7; yield* b.waitReal(1.6); b.headTurn = 0;
    W.toast('Someone is climbing the fire escape…');
    b.label = 'climbing the fire escape';
    b.pose = 'reach';
    yield* b.glide(2.17, SW_Y + 0.9, 1.05, Math.PI, 0.6);
    const yp0 = platformY(0);
    yield* b.glide(2.17, yp0, 0.95, Math.PI, (yp0 - 1.0) / 0.5);
    b.pose = 'stand';
    yield* b.walkTo(1.6, 0.25, yp0);
    for (let f = 0; f < u.floor; f++) {
      const yp = platformY(f);
      yield* b.walkTo(-2.25, 0.25, yp);
      yield* b.walkTo(-2.25, 0.64, yp);
      b.speed = 0.75;
      yield* b.walkTo(-0.2, 0.64, yp + FH);
      b.speed = 1.3;
      yield* b.walkTo(-0.2, 0.25, yp + FH);
    }
    const wx = u.windows[2].x, ypT = platformY(u.floor);
    yield* b.walkTo(wx, 0.42, ypT);
    b.targetYaw = Math.PI; b.pose = 'kneel'; b.label = 'prying the window open';
    yield* b.waitReal(7);
    u.windows[2].blindTarget = 0;
    b.label = 'climbing in';
    b.pose = 'reach';
    yield* b.glide(wx, u.y + SILL + 0.05, FZ + 0.05, Math.PI, 1.3);
    const sp = u.spots.winB;
    yield* b.glide(sp.at[0], u.y, sp.at[1], Math.PI, 1.1);
    b.atSpot = 'winB'; b.pose = 'stand'; b.speed = 1.0;
    b.flash = true;
    b.label = 'searching with a flashlight';
    yield* b.goSpot('wardrobe'); b.pose = 'reach'; yield* b.waitReal(9); this.mess(u, 'B');
    yield* b.goPoint(u.X(5.5), u.Z(-3.6)); b.targetYaw = Math.atan2(0, -1); b.pose = 'reach'; yield* b.waitReal(5);
    yield* b.goPoint(u.X(3.85), u.Z(-2.1)); b.targetYaw = Math.atan2(u.mirror ? -1 : 1, 0); b.pose = 'reach'; yield* b.waitReal(7);
    this.mess(u, 'L');
    b.hold(makeProp('bag'));
    yield* b.goSpot('stove'); b.pose = 'reach'; yield* b.waitReal(4);
    b.label = 'leaving with a bag';
    yield* b.goSpot('winB');
    b.flash = false;
    b.pose = 'reach';
    yield* b.glide(wx, u.y + SILL + 0.05, FZ + 0.05, 0, 1.0);
    yield* b.glide(wx, ypT, 0.42, 0, 1.2);
    b.pose = 'stand'; b.speed = 1.5;
    for (let f = u.floor; f > 0; f--) {
      const yp = platformY(f);
      yield* b.walkTo(-0.2, 0.25, yp);
      yield* b.walkTo(-0.2, 0.64, yp);
      yield* b.walkTo(-2.25, 0.64, yp - FH);
      yield* b.walkTo(-2.25, 0.25, yp - FH);
    }
    yield* b.walkTo(2.17, 0.95, yp0);
    b.pose = 'reach';
    yield* b.glide(2.17, SW_Y + 0.9, 1.05, Math.PI, (yp0 - 1.0) / 0.9);
    yield* b.glide(2.17, SW_Y, 1.3, Math.PI, 0.35);
    b.pose = 'stand'; b.speed = 2.9; b.label = 'running off';
    u.breakIn.done = true;
    yield* b.walkTo(2.17 + dir * 1.5, 2.6);
    yield* b.walkTo(-dir * 42, 2.6);
    b.remove();
    this.burglar = null;
  }
  mess(u, rk) {
    const room = u.rooms[rk];
    const g = new THREE.Group();
    const cols = [0xe8e2d4, 0x3a4a6a, 0x8a3a2a, 0xc8b890, 0x2a2a2a, 0x6a7a5a];
    const pts = rk === 'B' ? [[5.1, -3.3], [6.5, -3.4], [5.4, -2.0], [6.9, -3.6], [5.0, -1.2]] : [[3.4, -2.5], [2.6, -3.3], [3.8, -3.0], [2.3, -1.9]];
    for (const [lx, lz] of pts) {
      const geo = new THREE.BoxGeometry(range(R, 0.2, 0.5), range(R, 0.03, 0.12), range(R, 0.2, 0.45));
      paint(geo, pick(R, cols));
      const m = new THREE.Mesh(geo, room.mat);
      m.position.set(u.X(lx), u.y + 0.04, u.Z(lz)); m.rotation.y = R() * 3;
      g.add(m);
    }
    this.world.scene.add(g);
    (u.messes ||= []).push(g);
  }
  clearMess(u) { for (const g of u.messes || []) this.world.scene.remove(g); u.messes = []; }

  // Residents who come home to a break-in call it in.
  *discover(p) {
    const W = this.world, u = p.home;
    u.breakIn.reported = true;
    yield* p.goSpot('winB');
    p.label = 'finding the window forced open';
    p.pose = 'stand';
    yield* p.waitReal(4);
    yield* p.goPoint(u.nodes.Lc[0], u.nodes.Lc[1]);
    p.label = 'calling the police'; p.pose = 'phone';
    W.toast(`${p.name} in ${u.name} came home to a break-in`);
    yield* p.waitGame(3);
    p.pose = 'stand';
    const evt = { arrived: false, done: false };
    this.street.run(this.policeVisit(u, evt));
    p.label = 'waiting for the police';
    yield* p.watchTV(240, () => evt.arrived, 'waiting for the police');
    yield* p.goPoint(u.X(2.6), u.Z(-2.0));
    p.label = 'talking to the police';
    yield* p.waitUntil(() => evt.done, 200);
    p.label = 'cleaning up the mess';
    yield* p.doAt('wardrobe', 8, 'reach', 'cleaning up the mess');
    this.clearMess(u);
    yield* p.doAt('pkg', 5, 'reach', 'cleaning up the mess');
    u.windows[2].blindTarget = u.hh.blindDay;
    u.damage = { until: W.time + range(R, 600, 1200), bedroomOnly: true };
    u.breakIn = null;
  }
  *policeVisit(u, evt) {
    const W = this.world, S = this.street;
    yield* this.wait(range(R, 15, 30));
    let slot;
    while (!(slot = S.freeSlot())) yield;
    const car = new Vehicle(S, 'police', { stopX: slot.x, cruise: 9, flash: true });
    slot.v = car;
    if (!S.flashing) S.flashing = car;
    W.toast('A police car pulls up');
    while (car.state !== 'stopped') yield;
    const cops = [0, 1].map((i) => {
      const m = new Walker(W, randomLook(R, { shirt: 0x1a2440, pants: 0x1a2440, hat: 0x1a2440, shoes: 0x0a0a0a, dress: false }), null, { speed: 1.35, home: u, counts: true });
      m.role = 'police officers'; m.label = 'taking a report';
      m.pos.set(car.x + 0.4 + i * 0.8, SW_Y, car.z - 1.2); m.hidden = false;
      return m;
    });
    yield* all(...cops.map((m, i) => crewIn(m, u, i * 1.2, 5.0)));
    evt.arrived = true;
    yield* all(cops[0].goPoint(u.X(3.3), u.Z(-2.2)), (function* () { yield* cops[1].waitReal(1); yield* cops[1].goSpot('winB'); })());
    cops[0].targetYaw = Math.atan2(u.mirror ? 1 : -1, 0);
    cops[1].label = 'looking at the window';
    yield* this.wait(35);
    cops[1].label = 'taking a report';
    yield* cops[1].goPoint(u.X(3.6), u.Z(-2.8));
    yield* this.wait(15);
    evt.done = true;
    yield* all(...cops.map((m, i) => crewOut(m, u, i * 1.2, [car.x + 0.4 + i * 0.8, car.z - 1.2], 5.0)));
    for (const m of cops) m.remove();
    yield* this.wait(1.5);
    car.leave(); slot.v = null;
    yield* this.wait(6);
    if (S.flashing === car) S.flashing = null;
  }

  // ---------------------------------------------------------------- parties
  startParty(u, mode = 'party', endAt) {
    const W = this.world;
    if (this.party || !u || u.fire || u.damage) return false;
    const hosts = u.residents.filter((p) => p.where === 'home' && !p.busy);
    if (!hosts.length) return false;
    const P = { unit: u, mode, guests: [], over: false, done: false, endAt: endAt ?? W.time + range(R, 170, 250), taken: new Set() };
    P.dinnerAt = mode === 'family' ? Math.min(P.endAt - 160, W.time + range(R, 130, 160)) : 1e12;
    this.party = P; u.party = P;
    W.toast(mode === 'family' ? 'Thanksgiving: ' + hosts[0].name + "'s relatives are coming to " + u.name : hosts[0].name + ' in ' + u.name + ' is having people over');
    for (const h of hosts) h.interrupt(hostJob(P), true);
    this.street.run(this.partyRun(P));
    return true;
  }
  partySpot(P) {
    for (let i = 0; i < 20; i++) { const sp = pick(R, PARTY); if (!P.taken.has(sp)) { P.taken.add(sp); return sp; } }
    return pick(R, PARTY);
  }
  *partyRun(P) {
    const W = this.world, u = P.unit, L = u.rooms.L;
    const fam = P.mode === 'family';
    if (fam) { L.set(0, true); } else { L.set(0, false); L.set(1, true); L.set(2, false); }
    const n = fam ? 4 + Math.floor(R() * 4) : 6 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const g = new Walker(W, randomLook(R, fam ? { old: R() < 0.45 } : {}), null, { speed: range(R, 1.15, 1.45), home: u, counts: true });
      g.role = fam ? 'relatives' : 'party guests';
      g.leaveAt = P.endAt + range(R, -30, 70);
      g.crasher = i === 0 && R() < 0.5;
      g.co = partyGuest(g, P, this, i * (fam ? range(R, 14, 34) : range(R, 6, 16)));
      P.guests.push(g);
    }
    yield* this.wait(75);
    const below = fam ? null : W.units.find((x) => x.floor === u.floor - 1 && x.side === u.side);
    const grump = below && below.residents.find((p) => p.where === 'home' && !p.asleep && !p.busy && !p.hidden);
    if (grump && grump.interrupt(broomJob(), false)) W.toast('Downstairs in ' + below.name + ', ' + grump.name + ' is banging on the ceiling with a broom');
    while (W.time < P.endAt) yield;
    P.over = true;
    W.toast(fam ? 'The relatives in ' + u.name + ' are heading home' : 'The party in ' + u.name + ' is winding down');
    while (P.guests.some((g) => !g.dead && !g.sleeping)) yield;
    P.done = true;
    this.party = null; u.party = null;
  }
  wisp(x, y, z) {
    const sp = this.pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false }));
    if (!sp.parent) this.world.scene.add(sp);
    sp.position.set(x, y, z);
    sp.userData = { age: 0, life: range(R, 3.5, 5), vx: range(R, -0.05, 0.12), vy: range(R, 0.18, 0.3), vz: range(R, 0.05, 0.15), y0: y, fire: 0, small: true };
    sp.visible = true;
    this.smoke.push(sp);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const W = this.world, t = W.realT;
    for (const u of W.units) {
      for (const k in u.rooms) u.rooms[k].dyn = null;
      const f = u.fire;
      if (f) {
        if (f.fighting) { f.level -= dt / 26; if (f.level <= 0) { f.level = 0; f.out = true; } }
        else if (!f.out) f.level = Math.min(1, f.level + dt / 55);
        const fl = 0.7 + 0.18 * Math.sin(t * 13.1) + 0.12 * Math.sin(t * 7.7 + 1);
        if (f.level > 0) u.rooms.L.dyn = { pos: new THREE.Vector3(u.X(2.0), u.y + 1.2, u.Z(-4.0 + 2.2 * f.level)), col: new THREE.Vector3(1, 0.4, 0.08).multiplyScalar(22 * f.level * fl) };
        for (const s of f.flames.sprites) {
          const d = s.userData;
          const on = Math.max(0, Math.min(1, (f.level - d.reach * 0.85) * 4));
          const h = (0.35 + 0.9 * f.level) * d.k * on * (0.8 + 0.3 * Math.sin(t * 9 + d.ph));
          s.position.set(d.x, d.y + h * 0.45, d.z);
          s.scale.set(h * 0.7, h * 1.3, 1);
          s.material.opacity = Math.min(1, f.level * 1.6);
          s.visible = on > 0.01;
        }
        const soot = u.rooms.L.mat.uniforms.uSoot.value;
        soot.set(u.X(1.8), u.y + 1.8, u.Z(-3.9), Math.max(soot.w, Math.min(1, f.level * 1.1)));
        if (f.out) f.smokeLeft -= dt / 45;
        const rate = f.out ? Math.max(0, f.smokeLeft) * 3 : 1 + f.level * 9;
        f.smokeAcc = (f.smokeAcc || 0) + rate * dt;
        while (f.smokeAcc > 1) { f.smokeAcc -= 1; this.puff(u, f); }
        if (f.out && f.smokeLeft <= 0) { W.scene.remove(f.flames.g); u.fire = null; }
      }
      if (u.damage) {
        const show = W.time < u.damage.until;
        if (!u.boards) u.boards = this.makeBoards(u);
        u.boards[0].visible = u.boards[1].visible = show && !u.damage.bedroomOnly;
        u.boards[2].visible = show;
        if (!show) { u.damage = null; u.rooms.L.mat.uniforms.uSoot.value.w = 0; for (const b of u.boards) b.visible = false; }
      }
    }
    // party lights: the ceiling off, a slow colored wash
    const Pt = this.party;
    if (Pt && !Pt.done && Pt.mode !== 'family') {
      const pu = Pt.unit, c = new THREE.Color().setHSL((t * 0.06) % 1, 0.9, 0.5);
      pu.rooms.L.dyn = { pos: new THREE.Vector3(pu.X(2.6), pu.y + 2.4, pu.Z(-2.4)), col: new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(5.5) };
    }
    // the burglar's flashlight
    const b = this.burglar;
    if (b && !b.dead) {
      const on = b.flash && !b.hidden;
      b.glow.material.color.setScalar(on ? 5 : 0);
      if (on && b.room && b.room.owner !== 'lobby') {
        const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        b.room.dyn = { pos: new THREE.Vector3(b.pos.x + fx * 0.9, b.pos.y + 1.1, b.pos.z + fz * 0.9), col: new THREE.Vector3(0.85, 0.9, 1).multiplyScalar(2.2 + Math.sin(t * 5) * 0.2) };
      }
    }
    // smoke
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i], d = s.userData;
      d.age += dt;
      const k = d.age / d.life;
      if (k >= 1) { s.visible = false; this.pool.push(s); this.smoke.splice(i, 1); continue; }
      s.position.x += d.vx * dt; s.position.y += d.vy * dt; s.position.z += d.vz * dt;
      d.vy *= 1 - 0.05 * dt;
      const day = W.dayF;
      if (d.small) {
        const sm = 0.08 + k * 0.6;
        s.scale.set(sm, sm, 1);
        s.material.opacity = 0.32 * (1 - k);
        s.material.color.setScalar(0.35 + 0.4 * day);
        continue;
      }
      const sc = 0.7 + k * 3.4;
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.62 * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k);
      const glow = Math.max(0, 1 - (s.position.y - d.y0) / 3) * d.fire;
      s.material.color.setRGB(0.16 + 0.34 * day + glow * 0.5, 0.15 + 0.32 * day + glow * 0.22, 0.15 + 0.32 * day + glow * 0.06);
    }
  }
  puff(u, f) {
    const s = this.pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false }));
    if (!s.parent) this.world.scene.add(s);
    const win = u.windows[R() < 0.5 ? 0 : 1];
    s.position.set(win.x + range(R, -0.45, 0.45), u.y + HEAD - 0.2, 0.15);
    s.userData = { age: 0, life: range(R, 7, 12), vx: range(R, -0.15, 0.15) + 0.12, vy: range(R, 0.7, 1.2), vz: range(R, 0.15, 0.4), y0: u.y + HEAD, fire: f.level };
    s.visible = true;
    s.material.rotation = R() * 6;
    this.smoke.push(s);
  }
  makeBoards(u) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8976a, roughness: 0.95 });
    return u.windows.map((w) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.85, 0.03), mat);
      m.position.set(w.x, u.y + (SILL + HEAD) / 2, 0.03);
      m.castShadow = m.receiveShadow = true;
      m.visible = false;
      this.world.scene.add(m);
      return m;
    });
  }
}
