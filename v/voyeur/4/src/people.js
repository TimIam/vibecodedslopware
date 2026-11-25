// Everyone in the scene. An Actor walks at real speed (1:1) while the clock runs at a day per hour,
// so routines are compressed but every step, sit-down and stair climb takes the time it really would.
// Brains are generator functions: each yield is one frame. Interrupts (a doorbell, an emergency)
// are thrown into the generator, unwinding whatever the person was doing through its finally blocks.
import * as THREE from 'three';
import { makeAvatar, makeQuad, animateAvatar, makeProp } from './avatar.js';
import { pick, range, weighted, inCirc, dampAngle } from './util.js';
import { LOBBY, DELI, LAUNDRY, SW_Y, CENTER, FZ, SILL } from './building.js';

export const INT = { interrupt: true };
export function* all(...gens) {
  const live = gens.filter(Boolean);
  while (live.length) {
    for (let i = live.length - 1; i >= 0; i--) if (live[i].next().done) live.splice(i, 1);
    if (live.length) yield;
  }
}

const SKIN = [0xf1d2b6, 0xe0b48f, 0xc68e64, 0x9a6a44, 0x6e4a30, 0x4a3022, 0xf5dcc6, 0xd8a47a];
const HAIR = [0x1a1410, 0x2e2018, 0x5a3a22, 0x8a6a3a, 0xc8a060, 0x9a3a1a, 0x707070, 0xd8d8d8, 0x101010];
const SHIRT = [0x2f4a6a, 0x8a2a2a, 0xe8e4da, 0x3a6a4a, 0x5a5a62, 0xd8a03a, 0x7a4a8a, 0x1f1f24, 0xb85a3a, 0x9ab0c8, 0xc8c0b0, 0x4a8a9a];
const PANTS = [0x23293a, 0x3a3a40, 0x2a2622, 0x5a4a3a, 0x31415a, 0x1a1a1c, 0x7a6a58];
const NAMES_F = ['Maya', 'Priya', 'Dana', 'Rosa', 'Mei', 'Aisha', 'Grace', 'Lena', 'Nadia', 'June', 'Sofia', 'Imani', 'Hana', 'Clara'];
const NAMES_M = ['Jordan', 'Sam', 'Marcus', 'Theo', 'Luis', 'Omar', 'Ben', 'Kenji', 'Eli', 'Victor', 'Andre', 'Felix', 'Raj', 'Walt'];

export function hairFor(r, fem, old) {
  return fem ? pick(r, old ? ['bob', 'short', 'bun', 'curly'] : ['long', 'long', 'bob', 'bun', 'pony', 'curly', 'short'])
    : pick(r, old ? ['bald', 'short', 'buzz', 'bald'] : ['short', 'short', 'buzz', 'curly', 'bald', 'long']);
}
export function randomLook(r, extra = {}) {
  const fem = extra.fem ?? r() < 0.5;
  const old = extra.old;
  const hair = old ? pick(r, [0xb8b8b8, 0xd8d8d8, 0x808080, 0x9a9a9a]) : pick(r, HAIR);
  return {
    height: extra.height || (fem ? range(r, 1.58, 1.74) : range(r, 1.68, 1.88)),
    skin: pick(r, SKIN), hair, shirt: pick(r, SHIRT), pants: pick(r, PANTS),
    shoes: pick(r, [0x1a1a1a, 0x3a2a1a, 0xe8e8e8, 0x5a5a5a, 0x7a3a2a]), hairStyle: hairFor(r, fem, old),
    beard: !fem && r() < (old ? 0.4 : 0.3), glasses: r() < (old ? 0.55 : 0.18), jacket: r() < 0.15 ? pick(r, [0x2a2a30, 0x5a4a3a, 0x3a4a5a]) : null,
    shortSleeves: r() < 0.3, lips: fem && r() < 0.5 ? pick(r, [0xa8403a, 0x8a3a4a, 0xb85a5a]) : null,
    dress: fem && r() < 0.15, fem, ...extra,
  };
}

export class Actor {
  constructor(world, av, o = {}) {
    this.world = world; this.av = av; this.name = o.name || '';
    this.pos = new THREE.Vector3(999, 0, 999); this.yaw = 0; this.targetYaw = 0; this.yawLock = false;
    this.pose = 'stand'; this.seat = 0.45; this.phase = Math.random() * 6; this.speed = o.speed || 1.3;
    this.hidden = true; this.room = null; this.mat = null; this.meshes = av.meshes.slice();
    this.co = null; this.label = ''; this.carry = null; this.busy = false; this.pending = null; this.carriedBy = null;
    this.atSpot = null; this.home = o.home || null; this.counts = !!o.counts; this.dead = false;
    world.scene.add(av.root);
    world.actors.push(this);
    this.setMat(world.outMat);
  }
  setMat(m) { if (this.mat === m) return; this.mat = m; for (const x of this.meshes) x.material = m; }
  hold(prop, offset) {
    this.drop();
    this.carry = prop;
    this.av.J.prop.add(prop.group);
    prop.group.position.set(0, 0, 0);
    prop.group.rotation.set(0, 0, 0);
    if (offset) prop.group.position.copy(offset);
    for (const m of prop.meshes) { m.material = this.mat; this.meshes.push(m); }
  }
  drop() {
    const p = this.carry;
    if (!p) return null;
    this.av.J.prop.remove(p.group);
    this.meshes = this.meshes.filter((m) => !p.meshes.includes(m));
    this.carry = null;
    return p;
  }
  remove() { this.dead = true; this.world.scene.remove(this.av.root); }
  update(dt) {
    if (this.co) {
      try { if (this.co.next().done) this.co = null; } catch (e) { if (e !== INT) console.error(e); this.co = null; }
    }
    if (this.carriedBy) this.carriedBy.place(this);
    if (!this.yawLock) this.yaw = dampAngle(this.yaw, this.targetYaw, 8, dt);
    this.av.root.position.copy(this.pos);
    this.av.root.rotation.y = this.yaw;
    this.av.root.visible = !this.hidden;
    animateAvatar(this.av, this, dt);
    const room = this.hidden ? null : this.world.roomAt(this.pos, this.room);
    if (room !== this.room) { const old = this.room; this.room = room; this.world.onRoomChange(this, old, room); }
    this.setMat(room ? room.mat : this.world.outMat);
  }
  interrupt(job, force = false) {
    if (!this.co || (this.busy && !force) || (this.asleep && !force)) return false;
    this.pending = job;
    try { this.co.throw(INT); } catch (e) { if (e !== INT) console.error(e); this.co = null; }
    return true;
  }
  offstage() { this.hidden = true; this.pos.set(999, 0, 999); this.atSpot = null; }

  // ---- movement (all generators; one yield per frame)
  *walkTo(x, z, y) {
    this.pose = this.carry && this.carry.kind !== 'suitcase' ? 'walkCarry' : this.pushing ? 'walkPush' : 'walk';
    const y0 = this.pos.y;
    const d0 = Math.hypot(x - this.pos.x, z - this.pos.z) || 1;
    for (;;) {
      const dx = x - this.pos.x, dz = z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * this.world.dt;
      if (d <= step || d < 1e-4) { this.pos.x = x; this.pos.z = z; if (y !== undefined) this.pos.y = y; break; }
      this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
      if (y !== undefined) this.pos.y = y0 + (y - y0) * (1 - (d - step) / d0);
      this.targetYaw = Math.atan2(dx, dz);
      this.phase += step * 4.6 / (this.av.s || 1) * (this.av.kind === 'quad' ? 1.8 : 1);
      yield;
    }
    this.pose = 'stand';
  }
  *walkPath(pts, y) { for (const p of pts) yield* this.walkTo(p[0], p[1], p[2] !== undefined ? p[2] : y); }
  *waitReal(sec) { const end = this.world.realT + sec; while (this.world.realT < end) yield; }
  *waitGame(min) { const end = this.world.time + min; while (this.world.time < end) yield; }
  *waitUntil(fn, maxSec = 1e9) { const end = this.world.realT + maxSec; while (!fn() && this.world.realT < end) yield; }
  *glide(x, y, z, yaw, sec) {
    const p0 = this.pos.clone(), y0 = this.yaw;
    this.yawLock = true;
    let d = yaw - y0; d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const t0 = this.world.realT;
    for (;;) {
      const t = Math.min(1, (this.world.realT - t0) / sec);
      const e = t * t * (3 - 2 * t);
      this.pos.set(p0.x + (x - p0.x) * e, p0.y + (y - p0.y) * e, p0.z + (z - p0.z) * e);
      this.yaw = y0 + d * e;
      if (t >= 1) break;
      yield;
    }
    this.targetYaw = this.yaw;
    this.yawLock = false;
  }
  *face(yaw) { this.targetYaw = yaw; yield* this.waitReal(0.35); }

  // ---- inside an apartment
  pathTo(key) {
    const u = this.home, sp = u.spots[key];
    return this.pathToXZ(sp.at, sp.room, sp.via);
  }
  pathToXZ(at, room, via = []) {
    const u = this.home, pts = [];
    if (this.atSpot) { const cur = u.spots[this.atSpot]; for (let i = cur.via.length - 1; i >= 0; i--) pts.push(cur.via[i]); }
    const rk = u.roomKeyAt(this.pos) || 'H';
    const target = room || u.roomKeyAt(new THREE.Vector3(at[0], u.y + 0.5, at[1])) || 'L';
    for (const n of u.bfs(CENTER[rk], CENTER[target])) pts.push(u.nodes[n]);
    for (const v of via) pts.push(v);
    pts.push(at);
    return pts;
  }
  *goSpot(key) {
    const u = this.home, sp = u.spots[key];
    const pts = this.pathTo(key);
    if (this.pos.y > u.y + 0.2) yield* this.glide(this.pos.x, u.y, this.pos.z, this.yaw, 0.35);
    this.atSpot = null;
    yield* this.walkPath(pts, u.y);
    this.atSpot = key;
    this.targetYaw = sp.yaw;
    this.seat = sp.seat;
    if (sp.y) yield* this.glide(sp.at[0], u.y + sp.y, sp.at[1], sp.yaw, 0.45);
    else yield* this.waitReal(0.3);
  }
  *goPoint(x, z) {
    const u = this.home;
    const pts = this.pathToXZ([x, z]);
    this.atSpot = null;
    yield* this.walkPath(pts, u.y);
  }
  claim(keys) {
    const u = this.home;
    for (const k of keys) if (!u.claims[k] || u.claims[k] === this) { u.claims[k] = this; return k; }
    return null;
  }
  release(k) { if (k && this.home.claims[k] === this) delete this.home.claims[k]; }

  // ---- the building: apartment door <-> stairs <-> lobby <-> street
  stairSec() { return (this.home.floor + 1) * 5.5; }
  *exitUnit(toStreet = true) {
    const u = this.home;
    yield* this.goSpot('door');
    this.hidden = true;
    this.atSpot = null;
    this.pos.set(LOBBY.stairTop[0], SW_Y + 1.8, LOBBY.stairTop[1]);
    yield* this.waitReal(this.stairSec());
    this.hidden = false;
    yield* this.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1], SW_Y);
    yield* this.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
    yield* this.walkTo(LOBBY.inside[0] + range(Math.random, -0.15, 0.15), LOBBY.inside[1]);
    if (toStreet) yield* this.walkTo(LOBBY.outside[0], LOBBY.outside[1], SW_Y);
    void u;
  }
  *enterUnit(fromStreet = true) {
    const u = this.home;
    if (fromStreet) yield* this.walkTo(LOBBY.outside[0], LOBBY.outside[1], SW_Y);
    yield* this.walkTo(LOBBY.inside[0], LOBBY.inside[1], SW_Y);
    yield* this.walkTo(LOBBY.mid[0], LOBBY.mid[1]);
    yield* this.walkTo(LOBBY.stairBottom[0], LOBBY.stairBottom[1]);
    yield* this.walkTo(LOBBY.stairTop[0], LOBBY.stairTop[1], SW_Y + 1.8);
    this.hidden = true;
    yield* this.waitReal(this.stairSec());
    const d = u.spots.door;
    this.pos.set(d.at[0], u.y, d.at[1]);
    this.yaw = this.targetYaw = d.yaw + Math.PI;
    this.hidden = false;
    this.atSpot = 'door';
  }
}

// ---------------------------------------------------------------------------------------------
export class Resident extends Actor {
  constructor(world, unit, spec, r) {
    super(world, makeAvatar(spec.look), { name: spec.name, home: unit, counts: true, speed: spec.look.old ? 1.0 : range(r, 1.2, 1.4) });
    this.r = r; Object.assign(this, spec);
    this.morningAt = -1e9; this.dinnerDay = -1; this.lunchDay = -1; this.workedDay = -1e9; this.walkDay = -1;
    this.where = 'home'; this.asleep = false;
    unit.residents.push(this);
    this.co = this.brain();
  }
  get hh() { return this.home.hh; }
  others() { return this.home.residents.filter((p) => p !== this); }
  nextAbs(m) { const w = this.world; let t = w.day * 1440 + (((m % 1440) + 1440) % 1440); if (t <= w.time) t += 1440; return t; }
  lastAbs(m) { const w = this.world; let t = w.day * 1440 + (((m % 1440) + 1440) % 1440); if (t > w.time) t -= 1440; return t; }
  workKey() { return Math.floor((this.world.time - this.leave) / 1440); }
  worksOn(key) {
    const wd = (this.world.startWeekday + key) % 7; // 0 = Sunday
    if (this.job === 'office' || this.job === 'student' || this.job === 'teen') return wd >= 1 && wd <= 5;
    if (this.job === 'night') return [0, 2, 3, 5].includes(wd);
    return false;
  }
  shouldBeAtWork() { return this.worksOn(this.workKey()) && inCirc(this.world.mod, this.leave, this.back); }
  untilNext() {
    const w = this.world, now = w.time;
    let t = this.nextAbs(this.bed);
    { const lv = this.nextAbs(this.leave); const lk = Math.floor((lv - this.leave) / 1440); if (this.worksOn(lk) && this.workedDay !== lk) t = Math.min(t, lv); }
    if (this.dinnerDay !== w.day) { const d = this.nextAbs(this.dinnerAt); if (d - now < 600) t = Math.min(t, d); }
    if (this.goingOut && this.goingOut.day === w.day && !this.goingOut.done) t = Math.min(t, w.day * 1440 + this.goingOut.at);
    return Math.max(2, t - now);
  }

  *brain() {
    yield* this.boot();
    for (;;) {
      try {
        if (this.pending) { const j = this.pending; this.pending = null; yield* j.call(this); }
        else yield* this.next();
        yield;
      } catch (e) {
        if (e !== INT) { console.error(e); }
      }
    }
  }

  *boot() {
    const u = this.home, w = this.world;
    this.morningAt = this.lastAbs(this.wake);
    if (this.trip && this.trip.awayNow) {
      this.trip.gone = true;
      this.offstage(); this.where = 'away';
      this.returnAt = this.trip.back;
      yield* this.waitUntil(() => w.time >= this.trip.back);
      yield* this.comeHome('car', true);
      return;
    }
    if (this.shouldBeAtWork()) {
      this.workedDay = this.workKey();
      this.offstage(); this.where = 'out';
      const back = this.nextAbs(this.back) + range(this.r, -10, 40);
      this.returnAt = back;
      yield* this.waitUntil(() => w.time >= back);
      yield* this.comeHome('walk');
      return;
    }
    if (inCirc(w.mod, this.bed, this.wake)) { this.placeAt(this.bedSide); return; }
    this.placeAt(pick(this.r, ['sofa1', 'sofa2', 'chair1', 'stove', 'winL', 'wardrobe']));
    if (w.mod > this.dinnerAt + 60 || w.mod < 300) this.dinnerDay = w.day;
    void u;
  }
  placeAt(key) {
    const u = this.home;
    const k = this.claim([key]) ? key : null;
    const sp = u.spots[k || 'Lc'] || null;
    const at = sp ? sp.at : u.nodes.Lc;
    this.pos.set(at[0], u.y + (sp && sp.y ? sp.y : 0), at[1]);
    this.yaw = this.targetYaw = sp ? sp.yaw : 0;
    this.hidden = false;
    this.atSpot = sp ? k : null;
    if (sp && sp.pose && sp.pose !== 'stand') { this.pose = sp.pose; this.seat = sp.seat; }
    this.release(k);
  }

  *next() {
    const w = this.world, m = w.mod, now = w.time, r = this.r;
    if (this.trip && !this.trip.gone && now >= this.trip.at) { yield* this.goOnTrip(); return; }
    // (a fresh riser is never sent straight back to bed, whatever the clock says)
    if (inCirc(m, this.bed, this.wake) && !(this.wakeAt && now - this.wakeAt < 90)) { yield* this.sleep(); return; }
    if (this.morningAt < this.lastAbs(this.wake)) { yield* this.morning(); return; }
    const key = this.workKey();
    if (this.worksOn(key) && this.workedDay !== key && inCirc(m, this.leave - 3, this.back - 60)) {
      this.workedDay = key;
      yield* this.outing({ mode: 'walk', until: this.nextAbs(this.back) + range(r, -15, 30), label: this.job === 'teen' ? 'at school' : this.job === 'student' ? 'at class' : this.job === 'night' ? 'on the night shift' : 'at work', coat: true });
      return;
    }
    if (inCirc(m, this.dinnerAt, this.dinnerAt + 150) && this.dinnerDay !== w.day) { yield* this.dinner(); return; }
    const um = this.home.meal;
    if (um && um.cook === this && !um.ready && um.day === w.day) { yield* this.dinner(); return; }
    if (inCirc(m, 720, 820) && this.lunchDay !== w.day) { this.lunchDay = w.day; yield* this.lunch(); return; }
    if (this.goingOut && this.goingOut.day === w.day && !this.goingOut.done && m >= this.goingOut.at && m < this.goingOut.at + 120) {
      this.goingOut.done = true;
      yield* this.outing({ mode: 'car', until: now + range(r, 160, 260), label: 'out with friends', coat: true, carHome: r() < 0.7 });
      return;
    }
    if ((this.job === 'retired' || this.job === 'wfh') && inCirc(m, 600, 1020) && this.walkDay !== w.day && r() < 0.03) {
      this.walkDay = w.day;
      yield* this.outing({ mode: 'walk', until: now + range(r, 45, 110), label: this.job === 'retired' ? 'out for a walk' : 'running errands', coat: true });
      return;
    }
    yield* this.leisure();
  }

  // ---- routines
  *doAt(keys, mins, pose, label, opts = {}) {
    if (typeof keys === 'string') keys = [keys];
    const k = this.claim(keys);
    if (!k) { yield* this.waitGame(2); return; }
    try {
      yield* this.goSpot(k);
      const sp = this.home.spots[k];
      this.pose = pose || sp.pose; this.seat = sp.seat || this.seat;
      this.label = label;
      if (opts.start) opts.start(k);
      yield* this.waitGame(mins);
    } finally {
      if (opts.end) opts.end(k);
      this.release(k);
      this.eating = false; this.typing = false; this.lookDown = 0; this.headTurn = 0;
    }
  }
  // Activities on open floor rather than a named spot (local unit coordinates; faces the window).
  *doAtPoint(lx, lz, mins, pose, label) {
    const u = this.home;
    const k = this.claim(['openfloor']);
    if (!k) { yield* this.waitGame(2); return; }
    try {
      yield* this.goPoint(u.X(lx), u.Z(lz));
      this.targetYaw = 0;
      yield* this.waitReal(0.4);
      this.pose = pose; this.label = label;
      yield* this.waitGame(mins);
    } finally { this.release(k); this.pose = 'stand'; }
  }
  *pacing(mins) {
    const u = this.home, w = this.world, end = w.time + mins;
    const k = this.claim(['openfloor']);
    if (!k) { yield* this.waitGame(2); return; }
    try {
      this.phoneWalk = true;
      this.label = 'pacing on a phone call';
      let flip = false;
      while (w.time < end) {
        flip = !flip;
        yield* this.goPoint(u.X(flip ? 2.2 : 3.75), u.Z(flip ? -1.7 : -3.05));
        this.pose = 'phone';
        yield* this.waitReal(range(this.r, 1.5, 4));
      }
    } finally { this.phoneWalk = false; this.release(k); this.pose = 'stand'; }
  }
  // The teen sneaks a cigarette sitting out on the fire escape, when nobody's in the bedroom.
  *smokeBreak() {
    const u = this.home, w = this.world, r = this.r;
    if (u.residents.some((p) => p !== this && !p.asleep && !p.hidden && p.where === 'home' && u.roomKeyAt(p.pos) === 'B')) { yield* this.waitGame(3); return; }
    const win = u.windows[2];
    const k = this.claim(['winB']);
    if (!k) { yield* this.waitGame(2); return; }
    const cig = new THREE.Group();
    try {
      yield* this.goSpot('winB');
      this.label = 'sneaking out onto the fire escape';
      win.blindTarget = 0;
      yield* this.waitReal(1.2);
      this.pose = 'reach';
      yield* this.glide(win.x, u.y + SILL + 0.02, FZ + 0.12, 0, 1.3);
      this.pose = 'smoke'; this.seat = SILL - 0.35;
      yield* this.glide(win.x, u.y + 0.35, 0.14, 0, 0.8);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 5).rotateX(Math.PI / 2).translate(0, -0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0x8a8a8a }));
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4).translate(0, -0.02, 0.095), new THREE.MeshBasicMaterial({ color: 0xff5010 }));
      cig.add(stick, ember);
      this.av.J.handR.add(cig);
      this.label = 'smoking on the fire escape';
      const end = w.time + range(r, 7, 12);
      let lastPuff = 0;
      while (w.time < end) {
        const c = ((w.realT + this.phaseOff) % 7) / 7;
        ember.material.color.setRGB(c < 0.22 ? 5 : 1.6, c < 0.22 ? 1.2 : 0.35, 0.05);
        if (c > 0.3 && c < 0.36 && w.realT - lastPuff > 3) { lastPuff = w.realT; w.incidents.wisp(this.pos.x, this.pos.y + 0.5 + 0.62 * this.av.s, this.pos.z + 0.15); }
        yield;
      }
      this.av.J.handR.remove(cig);
      this.label = 'climbing back in';
      this.pose = 'reach';
      yield* this.glide(win.x, u.y + SILL + 0.02, FZ + 0.12, Math.PI, 1.0);
      const sp = u.spots.winB;
      yield* this.glide(sp.at[0], u.y, sp.at[1], Math.PI, 1.0);
      this.atSpot = 'winB';
    } finally {
      this.av.J.handR.remove(cig);
      if (this.pos.z > FZ - 0.05) {
        this.pose = 'reach';
        this.pos.set(win.x, u.y + SILL + 0.02, FZ + 0.12);
        const sp = u.spots.winB;
        this.pos.set(sp.at[0], u.y, sp.at[1]); this.atSpot = 'winB';
      }
      this.pose = 'stand';
      win.blindTarget = w.dayF < 0.4 && this.hh.blinds ? 0.6 : this.hh.blindDay;
      this.release(k);
    }
    yield* this.waitReal(0.5);
  }
  *sitEat(mins, label, keys = ['chair1', 'chair2']) {
    yield* this.doAt(keys, mins, null, label, { start: () => { this.eating = true; } });
  }

  *sleep() {
    const u = this.home, w = this.world, r = this.r;
    yield* this.doAt('bath', range(r, 6, 11), 'stand', 'brushing teeth');
    if (this.hh.blinds && u.spots[this.bedSide].room === 'B') for (const win of u.windows) if (win.room === 'B') win.blindTarget = 0.92;
    const k = this.bedSide;
    const BR = u.rooms[u.spots[k].room];
    try {
      yield* this.goSpot(k);
      const sp = u.spots[k];
      this.label = 'getting into bed';
      const hx = -Math.sin(sp.lieYaw), hz = -Math.cos(sp.lieYaw);
      const L = this.av.height * 0.96;
      this.pose = 'lie';
      this.inBed = true;
      yield* this.glide(sp.lie[0] - hx * L, u.y + 0.58, sp.lie[1] - hz * L, sp.lieYaw, 1.3);
      BR.sleepers.add(this);
      if (this.reader && r() < 0.6 && BR.sleepers.size === 1) {
        BR.set(1, true); BR.set(0, false);
        this.label = 'reading in bed';
        yield* this.waitGame(range(r, 10, 28));
        BR.set(1, false);
      }
      BR.set(0, false);
      if (!this.others().some((p) => p.where === 'home' && !p.asleep)) {
        for (const rk of ['L', 'H', 'Ba']) if (r() < this.hh.tidy || rk !== 'L') u.rooms[rk].allOff();
      }
      this.asleep = true;
      this.label = 'asleep';
      const wakeAt = this.nextAbs(this.wake) + range(r, 1, 20);
      this.wakeAt = wakeAt;
      if (r() < 0.3) {
        const mid = w.time + (wakeAt - w.time) * range(r, 0.3, 0.7);
        yield* this.waitUntil(() => w.time >= mid);
        this.asleep = false; BR.sleepers.delete(this);
        yield* this.glide(sp.at[0], u.y, sp.at[1], sp.yaw, 1.1);
        this.pose = 'stand'; this.atSpot = k;
        yield* this.doAt('bath', range(r, 3, 6), 'stand', 'up in the night');
        yield* this.goSpot(k);
        this.pose = 'lie';
        yield* this.glide(sp.lie[0] - hx * L, u.y + 0.58, sp.lie[1] - hz * L, sp.lieYaw, 1.3);
        BR.sleepers.add(this); this.asleep = true; this.label = 'asleep';
      }
      yield* this.waitUntil(() => w.time >= wakeAt);
      this.asleep = false;
      BR.sleepers.delete(this);
      this.label = 'waking up';
      yield* this.waitReal(range(r, 2, 6));
      yield* this.glide(sp.at[0], u.y, sp.at[1], sp.yaw, 1.4);
      this.pose = 'stand';
      this.atSpot = k;
    } finally {
      this.asleep = false; this.inBed = false;
      BR.sleepers.delete(this);
      if (this.pose === 'lie') { const sp = u.spots[k]; this.pos.set(sp.at[0], u.y, sp.at[1]); this.pose = 'stand'; this.atSpot = k; }
    }
  }

  *morning() {
    const r = this.r, u = this.home;
    this.morningAt = this.world.time;
    yield* this.doAt('bath', range(r, 8, 16), 'stand', 'showering');
    yield* this.doAt('wardrobe', range(r, 3, 6), 'reach', 'getting dressed');
    for (const win of u.windows) win.blindTarget = u.hh.blindDay;
    if (r() < 0.55) yield* this.doAt('stove', range(r, 5, 11), 'cook', 'making breakfast');
    else yield* this.doAt('fridge', 1.5, 'reach', 'grabbing breakfast');
    yield* this.sitEat(range(r, 8, 16), 'having breakfast');
  }
  *lunch() {
    const r = this.r;
    yield* this.doAt('fridge', 1.5, 'reach', 'making lunch');
    yield* this.doAt('stove', range(r, 3, 8), 'cook', 'making lunch');
    yield* this.sitEat(range(r, 10, 18), 'having lunch');
  }
  *dinner() {
    const u = this.home, w = this.world, r = this.r;
    this.dinnerDay = w.day;
    const meal = u.meal && u.meal.day === w.day ? u.meal : null;
    if (meal && meal.cook === this && !meal.ready) { yield* this.cookDinner(meal); return; }
    if (meal) {
      if (meal.kind === 'cook') {
        const k = this.claim(['chair1', 'chair2']);
        if (k) {
          try {
            yield* this.goSpot(k);
            this.pose = 'sitTable'; this.seat = 0.47; this.label = 'waiting for dinner';
            yield* this.waitUntil(() => meal.ready || w.time > meal.started + 90);
            this.eating = true; this.label = 'having dinner';
            yield* this.waitGame(range(r, 18, 30));
          } finally { this.release(k); this.eating = false; }
        }
      } else {
        yield* this.watchTV(90, () => meal.ready, 'waiting on the pizza');
        yield* this.watchTV(range(r, 20, 30), null, 'eating pizza', true);
      }
      return;
    }
    if (r() < this.hh.orderRate && this.world.street.canDeliver()) {
      const m = { day: w.day, kind: 'pizza', ready: false, started: w.time };
      u.meal = m;
      this.label = 'ordering food';
      this.pose = 'phone';
      yield* this.waitGame(range(r, 1.5, 3));
      this.pose = 'stand';
      w.street.orderFood(this, m);
      yield* this.watchTV(110, () => m.ready, 'waiting on the pizza');
      if (m.ready) yield* this.watchTV(range(r, 20, 30), null, 'eating pizza', true);
      return;
    }
    const m = { day: w.day, kind: 'cook', ready: false, started: w.time, cook: this, left: range(r, 22, 38) };
    u.meal = m;
    yield* this.doAt('fridge', 1.5, 'reach', 'getting groceries out');
    yield* this.cookDinner(m);
  }
  // Interrupted cooks (the doorbell) come back to the stove for whatever time is left.
  *cookDinner(m) {
    const u = this.home, w = this.world, r = this.r;
    const k = this.claim(['stove']);
    if (k) {
      let t0 = null;
      try {
        yield* this.goSpot(k);
        this.pose = 'cook'; this.label = m.left < 15 ? 'back at the stove' : 'cooking dinner';
        u.burnerOn = true;
        t0 = w.time;
        yield* this.waitUntil(() => w.time >= t0 + m.left);
      } finally {
        u.burnerOn = false; this.release(k);
        if (t0 !== null) m.left -= w.time - t0;
        if (m.left <= 0.5) m.ready = true;
      }
    } else m.ready = true;
    yield* this.sitEat(range(r, 18, 28), 'having dinner');
  }

  *watchTV(mins, until, label = 'watching TV', eating = false) {
    const u = this.home;
    const k = this.claim(['sofa1', 'sofa2']);
    if (!k) { yield* this.waitGame(3); return; }
    const L = u.rooms.L;
    try {
      yield* this.goSpot(k);
      this.pose = 'sit'; this.seat = 0.45; this.label = label; this.eating = eating;
      L.tvWatch.add(this); L.set(2, true);
      if (eating && u.pizzaBox) u.pizzaBox.group.visible = true;
      const end = this.world.time + mins;
      yield* this.waitUntil(() => this.world.time >= end || (until && until()));
    } finally {
      L.tvWatch.delete(this);
      if (!L.tvWatch.size) L.set(2, false);
      if (eating && u.pizzaBox && ![...L.tvWatch].some((p) => p.eating)) { u.pizzaBox.group.visible = false; }
      this.eating = false;
      this.release(k);
    }
  }

  *leisure() {
    const w = this.world, u = this.home, r = this.r, m = w.mod;
    const evening = m >= 1020 || m < 180;
    const cap = this.untilNext();
    const dur = (a, b) => Math.max(2, Math.min(cap, range(r, a, b)));
    const tvOn = u.rooms.L.tvWatch.size > 0;
    const choice = weighted(r, [
      [(evening ? 4 : this.job === 'retired' ? 2 : 0.5) + (tvOn ? 6 : 0), 'tv'],
      [this.reader ? 1.8 : 0.3, 'read'],
      [this.job === 'wfh' && !evening ? 8 : this.job === 'student' ? 2 : evening ? 0.8 : 0.4, 'laptop'],
      [0.8, 'window'],
      [0.5, 'snack'],
      [0.35, 'bath'],
      [0.9, 'phone'],
      [0.5, 'tidy'],
      [u.pets.length ? 0.4 : 0, 'pet'],
      // everyone has a habit or two
      [this.quirk === 'dancer' ? 1.6 : 0, 'dance'],
      [this.quirk === 'gym' ? 1.4 : 0, 'jacks'],
      [this.quirk === 'waver' ? 0.7 : 0, 'wave'],
      [this.quirk === 'singer' ? 1.3 : 0, 'sing'],
      [this.quirk === 'pacer' ? 1.4 : 0, 'pace'],
      [u.theme === 'plants' ? 0.8 : 0, 'water'],
      [this.job === 'teen' ? (evening ? 5 : 2) : 0, 'game'],
      [this.job === 'teen' && (m >= 1260 || m < 120) ? 3.5 : 0, 'smoke'],
    ]);
    switch (choice) {
      case 'tv': yield* this.watchTV(dur(30, 110)); break;
      case 'read': yield* this.doAt(['sofa2', 'sofa1'], dur(20, 60), 'sit', 'reading', { start: () => { this.lookDown = 0.45; if (w.dayF < 0.45) u.rooms.L.set(1, true); } }); break;
      case 'laptop': yield* this.doAt(['chair1', 'chair2'], dur(30, 120), 'sitTable', this.job === 'wfh' && !evening ? 'working from home' : 'on the laptop', { start: (k) => { this.typing = true; u.showLaptop(k, true); }, end: (k) => u.showLaptop(k, false) }); break;
      case 'window': yield* this.doAt(r() < 0.6 ? 'winL' : 'winB', dur(2, 5), 'stand', 'looking out the window', { start: () => { this.headTurn = range(r, -0.5, 0.5); } }); break;
      case 'snack': yield* this.doAt('fridge', 1.2, 'reach', 'raiding the fridge'); yield* this.doAt(['sofa1', 'sofa2'], dur(4, 10), 'sit', 'having a snack', { start: () => { this.eating = true; } }); break;
      case 'bath': yield* this.doAt('bath', dur(4, 12), 'stand', 'in the bathroom'); break;
      case 'phone': yield* this.doAt(pick(r, ['sofa1', 'sofa2', 'chair1']), dur(8, 30), null, 'scrolling on the phone', { start: () => { this.lookDown = 0.55; this.pose = this.home.spots[this.atSpot].pose === 'sitTable' ? 'sitTable' : 'sit'; } }); break;
      case 'tidy': yield* this.doAt(pick(r, ['wardrobe', 'coat', 'pkg', 'stove']), dur(2, 6), 'reach', 'tidying up'); break;
      case 'pet': yield* this.doAt('bowl', 1.5, 'kneel', 'feeding the cat'); break;
      case 'dance': yield* this.doAtPoint(3.0, -2.3, dur(5, 14), 'dance', 'dancing alone in the living room'); break;
      case 'jacks': yield* this.doAtPoint(3.0, -2.2, dur(4, 9), 'jacks', 'doing jumping jacks'); break;
      case 'sing': yield* this.doAtPoint(2.9, -2.5, dur(3, 7), 'sing', 'singing into a hairbrush'); break;
      case 'wave': yield* this.doAt('winL', 1.2, 'wave', 'waving at someone across the street'); break;
      case 'water': yield* this.doAt(r() < 0.5 ? 'winL' : 'winB', dur(2, 4), 'reach', 'watering the plants'); break;
      case 'pace': yield* this.pacing(dur(4, 9)); break;
      case 'game': yield* this.watchTV(dur(30, 90), null, 'playing video games'); break;
      case 'smoke': yield* this.smokeBreak(); break;
      default: yield* this.waitGame(3);
    }
  }

  // ---- leaving the building
  *outing({ mode, until, label, coat, carHome, suitcase }) {
    const w = this.world, u = this.home, r = this.r;
    if (coat) yield* this.doAt('coat', 0.8, 'reach', 'putting on a coat');
    this.label = 'heading out';
    if (suitcase) this.hold(makeProp('suitcase'), new THREE.Vector3(0.32, -1.07 * this.av.s, -0.3));
    yield* this.exitUnit(true);
    this.where = suitcase ? 'away' : 'out';
    this.returnAt = until;
    this.label = label;
    if (mode === 'car') {
      const spot = [-1.2 + range(r, -0.6, 0.6), 3.35];
      yield* this.walkTo(spot[0], spot[1]);
      this.targetYaw = Math.PI / 2 * (r() < 0.5 ? 1 : -1);
      this.pose = 'phone';
      const ride = w.street.callRide(this);
      yield* this.waitUntil(() => ride.car && ride.car.state === 'stopped');
      this.pose = 'stand';
      yield* this.walkTo(ride.car.x + 0.7, 4.3);
      this.drop();
      this.offstage();
      ride.boarded = true;
    } else {
      const dir = r() < 0.5 ? -1 : 1;
      const lane = range(r, 1.6, 3.1);
      yield* this.walkTo(dir * 3, lane);
      yield* this.walkTo(dir * 42, lane + range(r, -0.3, 0.3));
      this.drop();
      this.offstage();
    }
    yield* this.waitUntil(() => w.time >= until);
    yield* this.comeHome(mode === 'car' && carHome !== false ? 'car' : mode === 'car' ? 'walk' : 'walk', !!suitcase);
  }
  *comeHome(mode, suitcase) {
    const w = this.world, r = this.r;
    this.label = 'coming home';
    if (mode === 'car') {
      const ride = w.street.callRide(this, true);
      yield* this.waitUntil(() => ride.car && ride.car.state === 'stopped');
      this.pos.set(ride.car.x + 0.7, SW_Y, 4.35);
      this.hidden = false;
      if (suitcase) this.hold(makeProp('suitcase'), new THREE.Vector3(0.32, -1.07 * this.av.s, -0.3));
      ride.alighted = true;
      yield* this.walkTo(ride.car.x + 0.7, 3.3);
    } else {
      const dir = r() < 0.5 ? -1 : 1;
      const lane = range(r, 1.6, 3.1);
      this.pos.set(dir * 42, SW_Y, lane);
      this.hidden = false;
      if (r() < 0.25) this.hold(makeProp('bag'));
      yield* this.walkTo(dir * 2.5, lane);
    }
    const pkg = w.packages.get(this.home);
    if (pkg) {
      yield* this.walkTo(pkg.pos.x, 0.9);
      this.label = 'picking up a package';
      this.pose = 'kneel';
      yield* this.waitReal(1.2);
      w.scene.remove(pkg.prop.group);
      w.packages.delete(this.home);
      this.hold(pkg.prop);
      this.pose = 'stand';
    }
    yield* this.enterUnit(true);
    this.where = 'home';
    this.label = 'home';
    if (this.carry) {
      if (this.carry.kind === 'package') { yield* this.goSpot('pkg'); this.pose = 'kneel'; yield* this.waitReal(1); this.home.placeBox(this.drop()); this.pose = 'stand'; }
      else if (this.carry.kind === 'suitcase') { yield* this.goSpot('wardrobe'); this.drop(); }
      else { yield* this.goSpot('fridge'); this.drop(); }
    }
    yield* this.doAt('coat', 0.6, 'reach', 'hanging up a coat');
    const bi = this.home.breakIn;
    if (bi && bi.done && !bi.reported) yield* this.world.incidents.discover(this);
  }
  *goOnTrip() {
    const w = this.world, r = this.r;
    this.trip.gone = true;
    w.toast(`${this.name} in ${this.home.name} is leaving for a trip`);
    yield* this.doAt('wardrobe', range(r, 5, 9), 'reach', 'packing a suitcase');
    yield* this.outing({ mode: 'car', until: this.trip.back, label: 'away on a trip', coat: true, carHome: true, suitcase: true });
    this.trip = null;
  }
}

// Doorbell, emergency and helper jobs (called with `this` = the resident).
export function answerDoorJob(evt) {
  return function* () {
    const u = this.home;
    this.busy = true;
    try {
      this.label = 'buzzing the courier in';
      yield* this.exitUnit(false);
      yield* this.walkTo(0, -0.55);
      this.targetYaw = 0;
      this.label = 'at the front door';
      evt.answered = this;
      yield* this.waitUntil(() => evt.handover || evt.cancelled, 40);
      yield* this.waitReal(1.0);
      this.label = 'heading back up';
      yield* this.enterUnit(false);
      if (this.carry && this.carry.kind === 'pizza') {
        yield* this.goSpot('sofa1');
        const box = this.drop();
        u.setPizza(box);
        if (evt.meal) evt.meal.ready = true;
      } else if (this.carry) {
        yield* this.goSpot('pkg');
        this.pose = 'kneel';
        yield* this.waitReal(1.0);
        u.placeBox(this.drop());
        this.pose = 'stand';
      }
    } finally { this.busy = false; if (evt.meal) evt.meal.ready = true; }
  };
}

export function collapseJob(evt) {
  return function* () {
    const u = this.home, w = this.world;
    this.busy = true;
    // Feeling unwell, they make it as far as the open floor behind the coffee table, where the
    // window across the street can see them.
    this.label = 'feeling unwell';
    const sp = u.spots.collapse;
    const speed = this.speed;
    this.speed = 0.6;
    try { yield* this.goPoint(sp.at[0], sp.at[1]); } finally { this.speed = speed; }
    this.atSpot = null;
    this.label = 'collapsed';
    this.pose = 'collapse';
    yield* this.glide(this.pos.x, u.y + 0.1, this.pos.z, sp.lieYaw0, 0.9);
    evt.victimReady = true;
    yield* this.waitUntil(() => this.carriedBy);
    this.pose = 'lie';
    this.label = 'on a stretcher';
    yield* this.waitUntil(() => evt.loadedInto);
    this.carriedBy = null;
    this.yawLock = false;
    this.offstage();
    this.where = 'hospital';
    this.label = 'in the hospital';
    this.pose = 'stand';
    const back = w.time + range(this.r, 600, 1100);
    yield* this.waitUntil(() => w.time >= back);
    this.busy = false;
    yield* this.comeHome('car');
  };
}

export function helperJob(evt) {
  return function* () {
    const u = this.home;
    this.busy = true;
    try {
      yield* this.waitUntil(() => evt.victimReady, 10);
      const v = evt.victim;
      this.label = 'calling 911';
      const hx = -Math.sin(v.yaw), hz = -Math.cos(v.yaw);
      yield* this.goPoint(v.pos.x + hx * 1.7 + hz * 0.45, v.pos.z + hz * 1.7 - hx * 0.45);
      this.targetYaw = Math.atan2(-hz, hx);
      this.pose = 'kneel';
      yield* this.waitUntil(() => evt.medicsInside, 400);
      this.pose = 'stand';
      this.label = 'watching the paramedics';
      yield* this.doAt(['winL', 'chair1'], 0.2, 'stand', 'watching the paramedics');
      yield* this.waitUntil(() => evt.loadedInto, 600);
      this.label = 'shaken up';
      void u;
    } finally { this.busy = false; }
    yield* this.watchTV(25, null, 'shaken up');
  };
}

// ---------------------------------------------------------------------------------------------
export class Walker extends Actor {
  constructor(world, look, brainFn, o = {}) {
    super(world, look.cat || look.dog ? makeQuad(look) : makeAvatar(look), { speed: o.speed || range(Math.random, 1.2, 1.5), home: o.home, counts: o.counts });
    this.name = o.name || '';
    if (brainFn) this.co = brainFn.call(this);
  }
}

export function pedestrianBrain(opts = {}) {
  return function* () {
    const w = this.world, r = Math.random;
    const dir = opts.dir || (r() < 0.5 ? -1 : 1);
    const lane = opts.lane || range(r, 1.3, 3.3);
    this.pos.set(-dir * 42, SW_Y, lane);
    this.hidden = false;
    this.label = 'walking by';
    const deli = w.shopOpen('deli') && r() < 0.22;
    const laundry = !deli && w.shopOpen('laundry') && r() < 0.08;
    const toot = opts.trickOrTreat;
    if (deli || laundry || toot) {
      const S = deli ? DELI : LAUNDRY;
      const door = toot ? [0, 0.75] : S.door;
      yield* this.walkTo(door[0] - dir * 2.5, lane);
      yield* this.walkTo(door[0], toot ? 0.85 : 1.0);
      if (toot) {
        this.targetYaw = Math.PI;
        yield* this.waitReal(range(r, 4, 8));
      } else {
        yield* this.walkTo(S.inside[0], S.inside[1]);
        if (deli) {
          yield* this.walkTo(r() < 0.5 ? DELI.shelf[0] + range(r, -1, 1) : DELI.fridge[0] + 0.4, r() < 0.5 ? DELI.shelf[1] + 0.6 : DELI.fridge[1]);
          this.pose = 'reach';
          yield* this.waitReal(range(r, 3, 7));
          yield* this.walkTo(DELI.counter[0], DELI.counter[1]);
          this.targetYaw = Math.PI;
          this.pose = 'stand';
          this.label = 'buying something';
          yield* this.waitReal(range(r, 5, 12));
          if (r() < 0.6) this.hold(makeProp('bag'));
        } else {
          const ch = pick(r, LAUNDRY.chairs);
          yield* this.walkTo(LAUNDRY.washer[0], LAUNDRY.washer[1]);
          this.targetYaw = Math.PI / 2; this.pose = 'reach';
          yield* this.waitReal(range(r, 4, 8));
          yield* this.walkTo(ch[0] + 0.05, ch[1]);
          this.targetYaw = Math.PI / 2; this.pose = 'sit'; this.seat = 0.45;
          this.label = 'waiting on the laundry';
          yield* this.waitReal(range(r, 25, 70));
          this.pose = 'stand';
        }
        yield* this.walkTo(S.inside[0], S.inside[1]);
        yield* this.walkTo(door[0], 1.0);
      }
    }
    yield* this.walkTo(dir * 42, lane + range(r, -0.3, 0.3));
    this.remove();
  };
}
