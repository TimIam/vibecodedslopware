// Holidays, from the real calendar: Halloween trick-or-treaters with a neighbor handing out candy
// from a lawn chair, jack-o'-lanterns in the windows; Thanksgiving relatives and a turkey;
// Christmas trees going up one apartment at a time, presents, carolers, a snowman, Christmas
// morning; fireworks over the skyline for New Year's and the Fourth of July.
import * as THREE from 'three';
import { Walker, randomLook } from './people.js';
import { makeProp } from './avatar.js';
import { SW_Y, SILL, DELI } from './building.js';
import { range, pick, paint, Kit } from './util.js';

const R = Math.random;
export function thanksgivingDay(year) { const d = new Date(year, 10, 1); return ((4 - d.getDay() + 7) % 7) + 1 + 21; }

export const MOMENTS = [
  { label: 'Halloween night', m: 9, d: 31, t: 17 * 60 + 35 },
  { label: 'Thanksgiving', m: 10, d: 'tg', t: 13 * 60 + 50 },
  { label: 'a December evening (trees going up)', m: 11, d: 5, t: 18 * 60 + 10 },
  { label: 'Christmas Eve', m: 11, d: 24, t: 18 * 60 + 5 },
  { label: 'Christmas morning', m: 11, d: 25, t: 6 * 60 + 50 },
  { label: "New Year's Eve", m: 11, d: 31, t: 23 * 60 + 52 },
  { label: 'the Fourth of July', m: 6, d: 4, t: 21 * 60 },
];

export class Holidays {
  constructor(world) {
    this.world = world;
    this.fw = [];
    this.kidT = 3; this.carolT = 20; this.giver = null; this.carolers = null; this.show = null;
    this.flags = {};
    this.makeSnowman();
    this.makeLanterns();
    this.makePresents();
    this.applySeason(world.season);
  }
  today() { const d = this.world.date(); return { m: d.getMonth(), d: d.getDate(), y: d.getFullYear() }; }
  is(name) {
    const o = this.world.seasonOverride, { m, d, y } = this.today();
    switch (name) {
      case 'halloween': return (m === 9 && d === 31) || o === 'halloween';
      case 'thanksgiving': return m === 10 && d === thanksgivingDay(y);
      case 'xmas': return m === 11 && d === 25;
      case 'nye': return m === 11 && d === 31;
      case 'july4': return m === 6 && d === 4;
      case 'caroling': return (m === 11 && d >= 10 && d <= 24) || o === 'winter';
      case 'decorating': return (m === 10 && d >= 27) || (m === 11 && d <= 14);
      case 'presents': return (m === 11 && d >= 18 && d <= 25) || o === 'winter';
    }
    return false;
  }
  get label() {
    const { m, d, y } = this.today();
    const b = this.birthdays && this.birthdays()[0];
    const bl = b ? b.name + "'s birthday" : '';
    const hl = this._label(m, d, y);
    return [hl, bl].filter(Boolean).join(' · ');
  }
  _label(m, d, y) {
    if (m === 9 && d === 31) return 'Halloween';
    if (m === 10 && d === thanksgivingDay(y)) return 'Thanksgiving';
    if (m === 11 && d === 24) return 'Christmas Eve';
    if (m === 11 && d === 25) return 'Christmas';
    if (m === 11 && d === 31) return "New Year's Eve";
    if (m === 0 && d === 1) return "New Year's Day";
    if (m === 6 && d === 4) return 'Fourth of July';
    return '';
  }
  once(key) { const k = key + ':' + this.world.day; if (this.flags[k]) return false; this.flags[k] = true; return true; }

  // ---------------------------------------------------------------- decorations
  applySeason(s) {
    const W = this.world;
    for (const l of this.lanterns) l.group.visible = !!s.halloween;
    if (this.snowman) this.snowman.visible = !!s.snow;
    for (const u of W.units) if (u.presents) u.presents.visible = !!(s.xmas && u.treeUp && this.is('presents') && !u.presentsOpened);
    const im = W.B.windowLights, c = new THREE.Color();
    if (im) {
      const xm = [0xff3a2a, 0x3aff5a, 0xffc040, 0x4a7aff, 0xff6ad0];
      for (let i = 0; i < im.count; i++) {
        c.set(s.halloween ? (i % 3 === 2 ? 0x9a3aff : 0xff7a10) : xm[i % 5]).multiplyScalar(2.2);
        im.setColorAt(i, c);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  makeLanterns() {
    const W = this.world;
    this.lanterns = [];
    for (const u of W.units) {
      if (R() < 0.45) continue;
      const g = new THREE.Group();
      const lx = u.theme === 'plants' ? 1.75 : 3.3;
      const k = new Kit();
      k.box(u.X(lx - 0.25), u.y + SILL - 0.03, u.Z(-0.05), u.X(lx + 0.25), u.y + SILL, u.Z(-0.3), 0x6a4a32);
      k.geo(new THREE.SphereGeometry(0.15, 14, 10).scale(1.15, 0.85, 1).translate(u.X(lx), u.y + SILL + 0.13, u.Z(-0.17)), 0xe0701a, 0.3);
      k.geo(new THREE.CylinderGeometry(0.015, 0.02, 0.06, 6).translate(u.X(lx), u.y + SILL + 0.27, u.Z(-0.17)), 0x3a5a20);
      g.add(new THREE.Mesh(k.build(), u.rooms.L.mat));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.11), new THREE.MeshBasicMaterial({ color: 0xff9a30 }));
      face.position.set(u.X(lx), u.y + SILL + 0.13, u.Z(-0.17) + 0.158);
      g.add(face);
      g.visible = false;
      W.scene.add(g);
      this.lanterns.push({ group: g, face, unit: u });
    }
  }
  makeSnowman() {
    const k = new Kit();
    const x = -10.4, z = 0.7, y = SW_Y;
    k.geo(new THREE.SphereGeometry(0.38, 16, 12).translate(x, y + 0.34, z), 0xf4f6fa, 0.15);
    k.geo(new THREE.SphereGeometry(0.28, 16, 12).translate(x, y + 0.88, z), 0xf4f6fa, 0.1);
    k.geo(new THREE.SphereGeometry(0.2, 14, 10).translate(x, y + 1.3, z), 0xf4f6fa);
    for (const sd of [-1, 1]) k.geo(new THREE.SphereGeometry(0.025, 6, 4).translate(x + sd * 0.07, y + 1.36, z + 0.18), 0x111111);
    k.geo(new THREE.ConeGeometry(0.03, 0.18, 8).rotateX(Math.PI / 2).translate(x, y + 1.3, z + 0.28), 0xe0701a);
    k.geo(new THREE.TorusGeometry(0.2, 0.04, 6, 16).rotateX(Math.PI / 2).translate(x, y + 1.13, z), 0xb01a1a);
    k.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12).translate(x, y + 1.56, z), 0x151515);
    k.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14).translate(x, y + 1.46, z), 0x151515);
    k.beam(x - 0.25, y + 0.9, z, x - 0.7, y + 1.25, z + 0.05, 0.025, 0x4a3020);
    k.beam(x + 0.25, y + 0.9, z, x + 0.68, y + 1.15, z - 0.05, 0.025, 0x4a3020);
    for (let i = 0; i < 3; i++) k.geo(new THREE.SphereGeometry(0.025, 6, 4).translate(x, y + 0.78 + i * 0.1, z + 0.27), 0x111111);
    this.snowman = new THREE.Mesh(k.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    this.snowman.castShadow = this.snowman.receiveShadow = true;
    this.snowman.visible = false;
    this.world.scene.add(this.snowman);
  }
  makePresents() {
    for (const u of this.world.units) {
      if (!u.tree) continue;
      const k = new Kit();
      const wraps = [0xc01a1a, 0x1a7a3a, 0x2a4aa0, 0xd8b030, 0xe8e2d8, 0x8a2a8a];
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + 0.4, r = 0.45 + (i % 2) * 0.12;
        const lx = 4.32 + Math.cos(a) * r * 0.7 - 0.2, lz = -0.62 - Math.abs(Math.sin(a)) * r;
        const w = range(R, 0.16, 0.3), h = range(R, 0.12, 0.26), d = range(R, 0.16, 0.28);
        const cx = u.X(lx), cz = u.Z(lz);
        k.box(cx - w / 2, u.y, cz - d / 2, cx + w / 2, u.y + h, cz + d / 2, pick(R, wraps), 0.2);
        k.box(cx - 0.02, u.y, cz - d / 2 - 0.003, cx + 0.02, u.y + h + 0.004, cz + d / 2 + 0.003, 0xf4e6a0);
      }
      u.presents = new THREE.Mesh(k.build(), u.rooms.L.mat);
      u.presents.visible = false;
      this.world.scene.add(u.presents);
    }
  }

  // ---------------------------------------------------------------- hourly
  birthdayToday(p) {
    const W = this.world, u = p.home;
    if (!u.balloons) {
      const g = new THREE.Group();
      const cols = [0xff4a6a, 0x4a8aff, 0xffd040, 0x6ad86a, 0xc85aff];
      for (let i = 0; i < 5; i++) {
        const lx = 0.95 + i * 0.22, ly = 2.0 + (i % 2) * 0.22, lz = -0.45 - (i % 3) * 0.12;
        const b = new THREE.Mesh(paint(new THREE.SphereGeometry(0.13, 12, 10).scale(1, 1.2, 1), cols[i]), u.rooms.L.mat);
        b.position.set(u.X(lx), u.y + ly, u.Z(lz));
        g.add(b);
        const s = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.003, 0.003, ly - 0.75, 4), 0xdddddd), u.rooms.L.mat);
        s.position.set(u.X(lx), u.y + 0.75 + (ly - 0.75) / 2 - 0.15, u.Z(lz));
        g.add(s);
      }
      W.scene.add(g);
      u.balloons = g;
    }
    u.balloons.visible = true;
    u.bdayDay = W.day;
    W.toast('It is ' + p.name + "'s birthday today (" + u.name + ')');
  }
  birthdays() { const { m, d } = this.today(); return this.world.residents.filter((p) => p.birthday && p.birthday.m === m && p.birthday.d === d && p.where !== 'hospital'); }
  onHour(h) {
    const W = this.world;
    for (const u of W.units) if (u.balloons && u.balloons.visible && u.bdayDay !== W.day && h >= 10) u.balloons.visible = false;
    if (h >= 8) for (const p of this.birthdays()) if (p.home.bdayDay !== W.day) this.birthdayToday(p);
    if (h >= 19 && h <= 20 && !W.incidents.party) {
      for (const p of this.birthdays()) {
        if (p.where === 'home' && !p.asleep && !p.busy && this.once('bday:' + p.name)) { W.incidents.startParty(p.home, 'birthday', W.time + range(R, 150, 200), p); break; }
      }
    }
    // trees go up one apartment at a time in the weeks after Thanksgiving
    if (this.is('decorating') && h >= 17 && h <= 21 && W.season.xmas) {
      for (const u of W.units) {
        if (!u.tree || u.treeUp || R() > 0.3) continue;
        const p = W.awakeHome((x) => x.home === u)[0];
        if (p) p.interrupt(decorateJob(this, u));
      }
    }
    if (this.is('xmas') && h >= 7 && h <= 10) {
      for (const u of W.units) {
        if (!u.presents || !u.presents.visible || u.presentsOpening) continue;
        const ps = W.awakeHome((x) => x.home === u);
        if (!ps.length) continue;
        u.presentsOpening = true;
        ps.forEach((p, i) => p.interrupt(presentsJob(this, u, i === 0)));
        if (this.once('xmasToast')) W.toast('Christmas morning: presents are getting opened all over the building');
      }
    }
    if (this.is('thanksgiving') && h >= 13 && h <= 16 && !W.incidents.party && this.once('tg')) {
      const units = W.units.filter((u) => !u.fire && u.residents.some((p) => p.where === 'home' && !p.asleep && !p.busy));
      units.sort((a, b) => b.residents.length - a.residents.length);
      if (units.length) W.incidents.startParty(units[0], 'family', W.day * 1440 + 1235);
    }
    if (this.is('nye') && h === 21 && !W.incidents.party && this.once('nyeParty')) W.demo('party');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const W = this.world, m = W.mod, t = W.realT;
    // Halloween night
    if (this.is('halloween')) {
      if (m >= 1030 && m < 1225 && !this.giver && this.once('giver')) this.startGiver();
      if (m >= 1050 && m < 1235) { this.kidT -= dt; if (this.kidT <= 0) { this.kidT = range(R, 10, 24); this.spawnKids(); } }
    }
    for (const l of this.lanterns) if (l.group.visible) { const f = W.dayF < 0.5 ? 2.2 + Math.sin(t * 9 + l.unit.index) * 0.5 + Math.sin(t * 23 + l.unit.index) * 0.3 : 0.25; l.face.material.color.setRGB(f, f * 0.45, f * 0.08); }
    // carolers in December evenings
    if (this.is('caroling') && m >= 1080 && m < 1270 && !this.carolers) { this.carolT -= dt; if (this.carolT <= 0) { this.carolT = range(R, 200, 420); this.spawnCarolers(); } }
    // a Santa walks by on Christmas Eve
    if ((this.is('xmas') || (this.today().m === 11 && this.today().d === 24)) && m > 960 && m < 1320 && this.once('santa')) this.spawnSanta();
    // fireworks at midnight on New Year's and after dark on the Fourth
    const nyeNow = (this.is('nye') && m >= 1438) || (this.today().m === 0 && this.today().d === 1 && m < 24);
    const july = this.is('july4') && m >= 1265 && m < 1310;
    if ((nyeNow || july) && !this.show && this.once('fw')) {
      this.show = { until: W.time + (july ? 45 : 26), finale: W.time + (july ? 38 : 20), acc: 0 };
      W.toast(nyeNow ? 'Happy New Year!' : 'Fourth of July fireworks over the city');
      for (const p of W.awakeHome()) if (R() < 0.75) p.interrupt(windowJob('watching the fireworks', 6, R() < 0.4));
    }
    if (this.show) {
      const rate = W.time > this.show.finale ? 5 : 1.4;
      this.show.acc += rate * dt;
      while (this.show.acc > 1) { this.show.acc -= 1; this.launch(); }
      if (W.time > this.show.until) this.show = null;
    }
    this.updateFireworks(dt);
  }

  // ---------------------------------------------------------------- Halloween
  startGiver() {
    const W = this.world;
    const c = W.awakeHome((p) => p.job === 'retired');
    const p = c[0] || W.awakeHome()[0];
    if (!p) return;
    this.giver = p;
    p.interrupt(candyJob(this));
  }
  spawnKids() {
    const W = this.world, dir = R() < 0.5 ? -1 : 1, lane = range(R, 2.0, 2.9), n = 2 + Math.floor(R() * 3);
    const group = { dir, lane, deli: W.shopOpen('deli') && R() < 0.3, door: R() < 0.5 };
    for (let i = 0; i < n; i++) {
      const k = new Walker(W, costumeLook(pick(R, ['ghost', 'witch', 'pumpkin', 'cape', 'vampire', 'cat', 'cape', 'ghost'])), null, { speed: 1.15 });
      k.role = 'trick-or-treaters';
      k.hold(makeProp('pail'));
      k.co = kidBrain(k, this, group, i);
    }
    const adult = new Walker(W, randomLook(R, { jacket: 0x3a3a40 }), null, { speed: 1.15 });
    adult.co = kidBrain(adult, this, group, n + 0.6, true);
  }
  // ---------------------------------------------------------------- Christmas
  spawnCarolers() {
    const W = this.world, n = 4 + Math.floor(R() * 3), dir = R() < 0.5 ? -1 : 1;
    const C = { singing: false, left: n };
    this.carolers = C;
    for (let i = 0; i < n; i++) {
      const look = randomLook(R, { hatKind: 'santa', jacket: pick(R, [0x2a2a30, 0x5a1a1a, 0x1a3a2a, 0x3a3a4a]) });
      const k = new Walker(W, look, null, { speed: 1.1 });
      k.role = 'carolers';
      k.co = (function* (H) {
        yield* k.waitReal(i * 0.8);
        k.pos.set(dir * 42, SW_Y, 2.6); k.hidden = false; k.label = 'carolers on the way';
        const x = -2.1 + i * 0.75;
        yield* k.walkTo(x, 2.6 + (i % 2) * 0.35);
        k.targetYaw = Math.PI; k.pose = 'sing'; k.label = 'singing carols';
        if (i === n - 1) {
          C.singing = true;
          W.toast('Carolers are singing outside the building');
          for (const p of W.awakeHome()) if (R() < 0.55) p.interrupt(windowJob('listening to the carolers', 3, R() < 0.5));
        }
        yield* k.waitReal(75);
        k.pose = 'stand';
        yield* k.walkTo(-dir * 42, 2.6);
        k.remove();
        if (--C.left === 0) H.carolers = null;
      })(this);
    }
  }
  spawnSanta() {
    const W = this.world;
    const s = new Walker(W, randomLook(R, { fem: false, costume: 'santa', hatKind: 'santa', shirt: 0xc01a1a, pants: 0xc01a1a, shoes: 0x111111, beard: true, hair: 0xf4f4f0, hairStyle: 'short', height: 1.78, jacket: null }), null, { speed: 1.1 });
    s.role = 'Santa';
    s.hold(makeProp('package'));
    s.co = (function* () {
      const dir = R() < 0.5 ? -1 : 1;
      s.pos.set(dir * 42, SW_Y, 2.4); s.hidden = false; s.label = 'walking by in a Santa suit';
      yield* s.walkTo(0.4 * dir, 2.0);
      s.targetYaw = Math.PI; s.pose = 'wave'; s.label = 'waving up at the windows';
      yield* s.waitReal(4);
      s.pose = 'stand';
      yield* s.walkTo(-dir * 42, 2.4);
      s.remove();
    })();
  }

  // ---------------------------------------------------------------- fireworks
  launch() {
    const W = this.world;
    const x = range(R, -65, 65), z = range(R, -60, -115), top = range(R, 40, 64);
    const rocket = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), new THREE.PointsMaterial({ size: 0.5, color: new THREE.Color(3, 2.4, 1.6), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    rocket.frustumCulled = false;
    W.scene.add(rocket);
    this.fw.push({ kind: 'rocket', pts: rocket, x, y: 28, z, top, vy: range(R, 20, 28) });
  }
  burst(x, y, z) {
    const W = this.world, n = 120;
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const sp = range(R, 9, 15);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const k = sp * (0.85 + R() * 0.3);
      vel[i * 3] = Math.cos(a) * r * k; vel[i * 3 + 1] = u * k; vel[i * 3 + 2] = Math.sin(a) * r * k;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    const col = new THREE.Color().setHSL(R(), 0.95, 0.6).multiplyScalar(3.2);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ size: 1.1, color: col, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    W.scene.add(pts);
    this.fw.push({ kind: 'burst', pts, vel, age: 0, life: range(R, 2.2, 3.2) });
  }
  updateFireworks(dt) {
    const W = this.world;
    for (let i = this.fw.length - 1; i >= 0; i--) {
      const f = this.fw[i];
      if (f.kind === 'rocket') {
        f.y += f.vy * dt;
        const a = f.pts.geometry.attributes.position;
        a.setXYZ(0, f.x, f.y, f.z); a.needsUpdate = true;
        if (f.y >= f.top) { W.scene.remove(f.pts); f.pts.geometry.dispose(); this.fw.splice(i, 1); this.burst(f.x, f.y, f.z); }
        continue;
      }
      f.age += dt;
      const a = f.pts.geometry.attributes.position.array, v = f.vel;
      const drag = 1 - 1.6 * dt;
      for (let j = 0; j < v.length; j += 3) {
        v[j] *= drag; v[j + 1] = v[j + 1] * drag - 5 * dt; v[j + 2] *= drag;
        a[j] += v[j] * dt; a[j + 1] += v[j + 1] * dt; a[j + 2] += v[j + 2] * dt;
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
      const k = f.age / f.life;
      f.pts.material.opacity = Math.pow(Math.max(0, 1 - k), 1.4) * (0.75 + 0.25 * Math.sin(f.age * 40 + i));
      if (k >= 1) { W.scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); this.fw.splice(i, 1); }
    }
  }

  // Jumping straight to a holiday, for the demo key.
  jump(i) {
    const W = this.world, mo = MOMENTS[i % MOMENTS.length];
    const now = W.date();
    let y = now.getFullYear();
    const dayOf = (yy) => (mo.d === 'tg' ? thanksgivingDay(yy) : mo.d);
    if (new Date(y, mo.m, dayOf(y)) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y++;
    const s = W.startDate;
    const days = Math.round((new Date(y, mo.m, dayOf(y)) - s) / 86400000);
    W.time = days * 1440 + mo.t;
    W.seasonOverride = null;
    this.flags = {}; this.giver = null; this.show = null; this.kidT = 2; this.carolT = 8;
    for (const u of W.units) { u.presentsOpened = false; u.presentsOpening = false; if (mo.m === 11 && mo.d < 14 && u.tree) u.treeUp = R() < 0.3; }
    W.applySeason();
    W.hourMark = Math.floor(W.time / 60) - 1;
    return mo.label;
  }
}

function costumeLook(kind) {
  const base = randomLook(R, { height: range(R, 0.95, 1.32), glasses: false, beard: false, jacket: null, hat: null });
  const o = { ...base, costume: kind };
  if (kind === 'ghost') Object.assign(o, { shirt: 0xf4f4f0, pants: 0xf4f4f0, hairStyle: 'bald', sleeves: true });
  if (kind === 'witch') Object.assign(o, { fem: true, dress: true, shirt: 0x141018, pants: 0x3a1a4a, hatKind: 'witch', hairStyle: 'long' });
  if (kind === 'pumpkin') Object.assign(o, { shirt: 0xe0701a, pants: 0x1a1a1a });
  if (kind === 'cape') Object.assign(o, { shirt: pick(R, [0x2a4ab0, 0x1a1a1a, 0x2a8a3a]), pants: 0x1a2a6a, capeColor: pick(R, [0xb01a1a, 0xd8b030]), mask: 0x111111 });
  if (kind === 'vampire') Object.assign(o, { shirt: 0x1a1a1a, pants: 0x1a1a1a, hair: 0x101010, hairStyle: 'short' });
  if (kind === 'cat') Object.assign(o, { shirt: 0x141414, pants: 0x141414, hatKind: 'ears' });
  return o;
}

function* kidBrain(k, H, G, i, adult) {
  const W = k.world;
  yield* k.waitReal(i * 0.7);
  k.pos.set(-G.dir * 42, SW_Y, G.lane + (i % 2) * 0.3); k.hidden = false;
  k.label = adult ? 'out with trick-or-treaters' : 'trick-or-treating';
  const stopX = -G.dir * 2.2;
  yield* k.walkTo(stopX, G.lane + (i % 2) * 0.3);
  const g = H.giver;
  if (g && g.onStoop && !adult) {
    yield* k.walkTo(g.pos.x + (i - 1) * 0.35, 1.25 + (i % 2) * 0.25);
    k.targetYaw = Math.atan2(g.pos.x - k.pos.x, g.pos.z - k.pos.z);
    k.label = 'saying trick or treat'; k.pose = 'reach';
    yield* k.waitReal(range(R, 2, 4));
    k.pose = 'stand';
  } else if (G.door && !adult) {
    yield* k.walkTo((i - 1) * 0.35, 0.85 + (i % 2) * 0.3);
    k.targetYaw = Math.PI; k.label = 'ringing every buzzer';
    yield* k.waitReal(range(R, 3, 6));
  } else if (adult) {
    yield* k.waitReal(4);
  }
  if (G.deli && !adult) {
    yield* k.walkTo(DELI.door[0], 1.0);
    yield* k.walkTo(DELI.inside[0], DELI.inside[1]);
    yield* k.walkTo(DELI.counter[0] + (i - 1) * 0.3, DELI.counter[1] + 0.2);
    k.targetYaw = Math.PI; k.pose = 'reach'; k.label = 'trick-or-treating at the deli';
    yield* k.waitReal(range(R, 3, 5));
    k.pose = 'stand';
    yield* k.walkTo(DELI.door[0], 1.0);
  }
  k.label = adult ? 'out with trick-or-treaters' : 'off to the next building';
  yield* k.walkTo(G.dir * 42, G.lane + (i % 2) * 0.3);
  k.remove();
  void W;
}

function candyJob(H) {
  return function* () {
    const w = this.world;
    this.busy = true;
    const chair = makeProp('lawnchair');
    try {
      this.label = 'heading down with a bowl of candy';
      this.hold(makeProp('bowl'));
      yield* this.exitUnit(true);
      this.where = 'out';
      chair.group.position.set(1.2, SW_Y, 1.05);
      for (const m of chair.meshes) m.material = w.outMat;
      w.scene.add(chair.group);
      yield* this.walkTo(1.2, 1.15);
      this.targetYaw = 0; this.pose = 'sit'; this.seat = 0.44;
      this.onStoop = true;
      this.label = 'handing out candy on the stoop';
      w.toast(this.name + ' from ' + this.home.name + ' is handing out candy out front');
      yield* this.waitUntil(() => w.mod >= 1240 || !H.is('halloween'));
      this.onStoop = false;
      this.pose = 'stand';
      this.label = 'heading back in with an empty bowl';
      yield* this.waitReal(1);
      w.scene.remove(chair.group);
      yield* this.enterUnit(true);
      this.drop();
      this.where = 'home';
    } finally { this.busy = false; this.onStoop = false; w.scene.remove(chair.group); if (this.carry) this.drop(); }
  };
}

function windowJob(label, mins, wave) {
  return function* () { yield* this.doAt(Math.random() < 0.6 ? 'winL' : 'winB', mins, wave ? 'wave' : 'stand', label); };
}

function decorateJob(H, u) {
  return function* () {
    const w = this.world;
    this.busy = true;
    try {
      this.label = 'dragging the Christmas tree in';
      yield* this.goPoint(u.X(3.75), u.Z(-1.45));
      this.targetYaw = Math.atan2(u.X(4.32) - this.pos.x, u.Z(-0.5) - this.pos.z);
      u.treeUp = true; u.treeDecorating = true;
      u.tree.group.visible = true; u.plant.visible = false;
      this.pose = 'reach'; this.label = 'putting up the Christmas tree';
      yield* this.waitGame(7);
      this.pose = 'kneel'; this.label = 'untangling the lights';
      yield* this.waitGame(6);
      this.pose = 'reach'; this.label = 'hanging ornaments';
      yield* this.waitGame(8);
      u.treeDecorating = false;
      this.pose = 'stand'; this.label = 'admiring the tree';
      w.toast('Lights on: the tree in ' + u.name + ' is up');
      if (u.presents && H.is('presents')) u.presents.visible = true;
      yield* this.waitGame(3);
    } finally { this.busy = false; u.treeDecorating = false; }
  };
}

function presentsJob(H, u, first) {
  return function* () {
    const w = this.world;
    this.busy = true;
    try {
      this.label = 'opening presents';
      yield* this.goPoint(u.X(first ? 3.7 : 3.4), u.Z(first ? -1.35 : -1.75));
      this.targetYaw = Math.atan2(u.X(4.32) - this.pos.x, u.Z(-0.5) - this.pos.z);
      this.pose = 'kneel';
      yield* this.waitGame(range(R, 14, 22));
      if (first) { u.presents.visible = false; u.presentsOpened = true; w.incidents.mess(u, 'L'); }
      this.pose = 'stand';
      this.label = first ? 'trying on a new sweater' : 'reading the instructions';
      yield* this.waitGame(4);
    } finally { this.busy = false; }
  };
}
