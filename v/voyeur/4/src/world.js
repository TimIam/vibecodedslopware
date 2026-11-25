// The world: clock (a day per real hour), sun and sky from the real date, seasons, the households
// and their pets, the shops' hours, and the house rules for lights (people switch on what they
// need when it gets dark, and some of them forget to switch it off).
import * as THREE from 'three';
import { buildBuilding, GH, FH, SW_Y, FZ, DELI, CURB_Z } from './building.js';
import { Street } from './street.js';
import { Incidents } from './events.js';
import { Resident, Walker, randomLook } from './people.js';
import { makeRng, pick, range, inCirc, smooth, lerp, damp, canvasTex, paint, Kit } from './util.js';
import { makeSky } from './shaders.js';

export const GAME_PER_REAL = 1440 / 3600;

const TEMPLATES = [
  { jobs: ['office', 'office'] },
  { jobs: ['wfh'], pet: 'cat' },
  { jobs: ['retired', 'retired'], old: true },
  { jobs: ['night'] },
  { jobs: ['student'] },
  { jobs: ['office'], trip: true },
  { jobs: ['office', 'wfh'] },
  { jobs: ['office'], pet: 'cat' },
  { jobs: ['office', 'teen'], family: true },
  { jobs: ['wfh'], host: true },
  { jobs: ['retired'], old: true, pet: 'cat' },
  { jobs: ['wfh', 'office'], host: true },
];
const QUIRKS = ['dancer', 'gym', 'waver', 'singer', 'pacer', 'none', 'none', 'dancer', 'singer'];
const FEM = ['Maya', 'Priya', 'Dana', 'Rosa', 'Mei', 'Aisha', 'Grace', 'Lena', 'Nadia', 'June', 'Sofia', 'Imani', 'Hana', 'Clara', 'Ruth'];
const MASC = ['Jordan', 'Sam', 'Marcus', 'Theo', 'Luis', 'Omar', 'Ben', 'Kenji', 'Eli', 'Victor', 'Andre', 'Felix', 'Raj', 'Walt', 'Hector'];
const CAT_NAMES = ['Biscuit', 'Miso', 'Pepper', 'Olive', 'Tofu', 'Mango'];

function schedule(job, r) {
  switch (job) {
    case 'office': return { wake: range(r, 390, 440), leave: range(r, 475, 520), back: range(r, 1050, 1130), bed: range(r, 1350, 1420) };
    case 'wfh': return { wake: range(r, 420, 500), leave: 0, back: 0, bed: range(r, 1385, 1455) };
    case 'retired': return { wake: range(r, 350, 410), leave: 0, back: 0, bed: range(r, 1290, 1345) };
    case 'night': return { wake: range(r, 870, 900), leave: range(r, 1110, 1130), back: range(r, 455, 480), bed: range(r, 510, 540) };
    case 'teen': return { wake: range(r, 395, 425), leave: range(r, 450, 470), back: range(r, 915, 960), bed: range(r, 1470, 1540) };
    case 'student': return { wake: range(r, 560, 620), leave: range(r, 650, 700), back: range(r, 940, 1000), bed: range(r, 1470, 1520) };
  }
}

export class World {
  constructor(scene, opts) {
    this.scene = scene;
    this.rng = makeRng(opts.seed || 1);
    this.startDate = new Date(opts.date.getFullYear(), opts.date.getMonth(), opts.date.getDate());
    this.startWeekday = this.startDate.getDay();
    this.time = opts.startMin;
    this.realT = 0; this.dt = 0; this.ff = 1;
    this.actors = [];
    this.packages = new Map();
    this.toastQ = [];
    this.shared = { uDay: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() }, dayF: 1 };
    this.outMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.B = buildBuilding(scene, this.rng, this.shared);
    this.units = this.B.units;
    this.rooms = this.B.rooms;
    this.dayF = 1;

    this.hemi = new THREE.HemisphereLight(0xbcd0f0, 0x3a3028, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dd, 3);
    this.sun.target.position.set(0, 10, 0);
    const sc = this.sun.shadow;
    sc.mapSize.set(2048, 2048);
    Object.assign(sc.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 5, far: 170 });
    sc.bias = -0.0004; sc.normalBias = 0.035;
    scene.add(this.sun); scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9ab0ff, 0.2);
    this.moon.position.set(30, 50, 60);
    scene.add(this.moon);
    this.sky = makeSky();
    scene.add(this.sky.mesh);
    this.lobbyLight = new THREE.PointLight(0xffd6a0, 0, 9, 1.8);
    this.lobbyLight.position.set(0, 3.0, 0.9);
    scene.add(this.lobbyLight);
    this.shopLights = [new THREE.PointLight(0xe8f2ff, 0, 9, 1.8), new THREE.PointLight(0xe8f2ff, 0, 9, 1.8)];
    this.shopLights[0].position.set(-4.6, 2.0, 1.4); this.shopLights[1].position.set(4.6, 2.0, 1.4);
    for (const l of this.shopLights) scene.add(l);
    this.makeSnow();

    this.seasonOverride = opts.season || null;
    this.applySeason();
    // Daylight shadows: the fire escape on the bricks, the cornice, people and cars on the sidewalk.
    scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    this.street = new Street(this);
    this.incidents = new Incidents(this);
    this.populate();
    this.nbT = 0; this.hourMark = Math.floor(this.time / 60);
    this.updateEnv();
  }

  get day() { return Math.floor(this.time / 1440); }
  get mod() { return ((this.time % 1440) + 1440) % 1440; }
  date() { return new Date(this.startDate.getTime() + this.day * 86400000); }

  // ---- seasons
  seasonFor(d) {
    const m = d.getMonth(), dd = d.getDate();
    const s = {
      name: m <= 1 || m === 11 ? 'Winter' : m <= 4 ? 'Spring' : m <= 7 ? 'Summer' : 'Autumn',
      xmas: m === 11 || (m === 0 && dd <= 6) || (m === 10 && dd >= 27),
      halloween: m === 9 && dd >= 15,
      snow: (m === 11 && dd >= 8) || m === 0 || m === 1,
      leaves: m <= 1 || m === 11 ? null : m <= 4 ? 0x6fa04a : m <= 7 ? 0x3f6b30 : m === 8 ? 0x7a8a34 : m === 9 ? 0xc06a24 : 0xa8582a,
    };
    if (m === 10 && dd > 20) s.leaves = 0x8a5a2e;
    return s;
  }
  applySeason() {
    const presets = {
      winter: { name: 'Winter (holidays)', xmas: true, halloween: false, snow: true, leaves: null },
      halloween: { name: 'Autumn (Halloween)', xmas: false, halloween: true, snow: false, leaves: 0xc06a24 },
      summer: { name: 'Summer', xmas: false, halloween: false, snow: false, leaves: 0x3f6b30 },
      spring: { name: 'Spring', xmas: false, halloween: false, snow: false, leaves: 0x6fa04a },
    };
    const s = this.seasonOverride ? presets[this.seasonOverride] : this.seasonFor(this.date());
    this.season = s;
    const D = this.B.decor;
    for (const g of D.xmas) g.visible = s.xmas;
    for (const g of D.halloween) g.visible = s.halloween;
    for (const g of D.snow) g.visible = s.snow;
    for (const f of D.foliage) { f.visible = !!s.leaves; if (s.leaves) f.material.color.set(s.leaves); }
    for (const u of this.units) { if (u.tree) u.tree.group.visible = s.xmas; u.plant.visible = !(s.xmas && u.tree); }
    this.snow.visible = s.snow;
    this.B.sidewalkMat.color.set(s.snow ? 0xe6eaf0 : 0xffffff);
    this.B.roadMat.color.set(s.snow ? 0x9aa0a8 : 0xffffff);
    this.seasonDay = this.day;
  }
  makeSnow() {
    const N = 4500;
    const pos = new Float32Array(N * 3);
    this.snowV = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = range(Math.random, -26, 26); pos[i * 3 + 1] = range(Math.random, 0, 31); pos[i * 3 + 2] = range(Math.random, -0.2, 18); this.snowV[i] = range(Math.random, 0.7, 1.4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sprite = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.075, map: sprite, transparent: true, depthWrite: false, color: 0xdfe6f0 }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  // ---- households
  populate() {
    const r = this.rng;
    const order = TEMPLATES.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const used = new Set();
    const nameFor = (fem) => { let n; do { n = pick(r, fem ? FEM : MASC); } while (used.has(n)); used.add(n); return n; };
    this.residents = [];
    this.units.forEach((u, i) => {
      const T = order[i];
      u.hh = {
        tidy: range(r, 0.45, 0.98), cozy: r() < 0.5, blinds: r() < 0.65, blindDay: pick(r, [0.06, 0.06, 0.15, 0.3]),
        orderRate: T.jobs.length === 1 ? 0.35 : 0.18, dinner: T.jobs[0] === 'night' ? range(r, 990, 1020) : range(r, 1080, 1175),
      };
      for (const w of u.windows) { w.blindTarget = u.hh.blindDay; w.blind.scale.y = 0.08 + w.blindTarget * 1.6; }
      T.jobs.forEach((job, k) => {
        const fem = r() < 0.5;
        const teen = job === 'teen';
        const look = randomLook(r, { old: T.old, fem, ...(teen ? { height: range(r, 1.55, 1.74), glasses: false, beard: false, jacket: null, shirt: pick(r, [0x7a2a8a, 0x1a1a1a, 0x2a6a5a, 0xc8402a, 0x3a4a8a]) } : {}) });
        const sc = schedule(job, r);
        const spec = {
          name: nameFor(fem), look, job, ...sc, dinnerAt: u.hh.dinner, reader: r() < 0.5,
          bedSide: job === 'teen' ? 'teenBed' : k === 0 ? 'bedF' : 'bedB',
          quirk: job === 'teen' ? 'none' : pick(r, QUIRKS),
        };
        spec.dancer = spec.quirk === 'dancer';
        if (job === 'student') spec.goingOut = { day: this.day, at: range(r, 1230, 1290), done: false };
        if (T.trip) spec.trip = { at: this.time + range(r, 30, 140), back: 0, gone: false };
        if (spec.trip) spec.trip.back = spec.trip.at + range(r, 2.2, 3.2) * 1440;
        const p = new Resident(this, u, spec, makeRng(Math.floor(r() * 1e9)));
        this.residents.push(p);
      });
      if (T.pet) this.makeCat(u, r);
      u.host = !!T.host;
      this.augmentUnit(u);
      if (T.family) this.teenNook(u);
    });
    this.makeClerk();
  }
  // A narrow bed in the back hall for the teen, with a poster and a lava lamp.
  teenNook(u) {
    const k = new Kit();
    const b = (ax, ay, az, bx, by, bz, hex, sh = 0) => k.box(u.X(ax), u.y + ay, u.Z(az), u.X(bx), u.y + by, u.Z(bz), hex, sh);
    b(2.75, 0, -7.05, 4.52, 0.3, -7.95, 0x3a3a40, 0.4);
    b(2.78, 0.3, -7.08, 4.5, 0.45, -7.92, 0xe8e4dc);
    b(2.75, 0.4, -7.04, 3.95, 0.52, -7.96, 0x2a3a6a, 0.2);
    b(4.1, 0.45, -7.2, 4.48, 0.58, -7.8, 0xf2f0ea);
    b(3.2, 1.2, -7.93, 3.9, 2.0, -7.95, 0xd84a2a);
    b(2.6, 1.3, -7.93, 3.05, 1.9, -7.95, 0x2a2a2a);
    const m = new THREE.Mesh(k.build(), u.rooms.H.mat);
    this.scene.add(m);
  }
  augmentUnit(u) {
    const w = this;
    u.boxes = [];
    if (u.theme === 'gamer' || u.theme === 'cozy') {
      // LED strip (gamer) or warm fairy lights (cozy) along the living-room ceiling
      const pts = [];
      for (let x = 0.2; x <= 4.4; x += u.theme === 'cozy' ? 0.18 : 0.06) pts.push([x, -0.12]);
      for (let z = -0.3; z >= -3.6; z -= u.theme === 'cozy' ? 0.18 : 0.06) pts.push([0.12, z]);
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(u.theme === 'cozy' ? 0.025 : 0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
      const mt = new THREE.Matrix4(), c = new THREE.Color(0x000000);
      pts.forEach(([x, z], i) => { mt.makeTranslation(u.X(x), u.y + 2.72 - (u.theme === 'cozy' ? Math.abs(Math.sin(x * 4 + z * 4)) * 0.08 : 0), u.Z(z)); im.setMatrixAt(i, mt); im.setColorAt(i, c); });
      this.scene.add(im);
      u.strip = im;
    }
    u.showLaptop = (k, on) => {
      if (!u.laptop) {
        const g = new THREE.Group();
        const base = new THREE.Mesh(paint(new THREE.BoxGeometry(0.32, 0.02, 0.23), 0x9a9ea4), u.rooms.L.mat);
        const lid = new THREE.Mesh(paint(new THREE.BoxGeometry(0.32, 0.22, 0.012).translate(0, 0.11, 0), 0x9a9ea4), u.rooms.L.mat);
        lid.position.z = -0.11; lid.rotation.x = -0.25;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.19), new THREE.MeshBasicMaterial({ color: 0x9ab8e0 }));
        scr.position.set(0, 0.11, 0.008); lid.add(scr);
        g.add(base, lid);
        w.scene.add(g);
        u.laptop = g;
      }
      u.laptop.position.set(u.X(k === 'chair1' ? 3.0 : 3.6), u.y + 0.75, u.Z(-0.4));
      u.laptop.rotation.y = Math.PI;
      u.laptop.visible = on;
    };
    u.placeBox = (prop) => {
      if (!prop) return;
      prop.group.position.set(u.X(2.9 + u.boxes.length * 0.15), u.y + 0.15, u.Z(-3.8));
      prop.group.rotation.y = Math.random();
      for (const m of prop.meshes) m.material = u.rooms.L.mat;
      w.scene.add(prop.group);
      u.boxes.push({ prop, until: w.time + range(Math.random, 300, 900) });
    };
    u.setPizza = (prop) => {
      if (!prop) return;
      prop.group.position.set(u.X(1.72), u.y + 0.44, u.Z(-2.1));
      for (const m of prop.meshes) m.material = u.rooms.L.mat;
      w.scene.add(prop.group);
      if (u.pizzaBox) w.scene.remove(u.pizzaBox.group);
      u.pizzaBox = prop;
    };
  }
  makeCat(u, r) {
    const w = this;
    const look = { cat: true, len: 0.32, h: 0.2, r: 0.09, color: pick(r, [0x2a2a2a, 0xd88a3a, 0x8a8a8a, 0xe8e2d8, 0x5a4030]) };
    const cat = new Walker(this, look, function* () {
      const sp0 = u.spots.sill;
      this.pos.set(sp0.at[0], u.y + sp0.y, sp0.at[1]); this.yaw = this.targetYaw = sp0.yaw; this.hidden = false; this.atSpot = 'sill'; this.pose = 'loaf';
      yield* this.waitGame(range(Math.random, 20, 60));
      for (;;) {
        const k = pick(Math.random, ['sill', 'sill', 'sill', 'sofa1', 'sofa2', 'bowl', 'bed', 'winB', 'bed']);
        if (this.pos.y > u.y + 0.1) yield* this.glide(this.pos.x, u.y, this.pos.z, this.yaw, 0.35);
        if (k === 'bed') {
          yield* this.goPoint(u.X(5.55), u.Z(-1.8));
          yield* this.glide(u.X(6.2), u.y + 0.63, u.Z(-1.75 + Math.random() * 0.4), Math.random() * 6, 0.6);
          this.pose = 'loaf';
        } else {
          yield* this.goSpot(k);
          const sp = u.spots[k];
          if (k.startsWith('sofa')) { yield* this.glide(sp.at[0] + 0.1 * (u.mirror ? -1 : 1), u.y + 0.5, sp.at[1], sp.yaw, 0.4); }
          this.pose = k === 'bowl' ? 'stand' : 'loaf';
        }
        this.headTurn = range(Math.random, -0.6, 0.6);
        yield* this.waitGame(k === 'bowl' ? 4 : range(Math.random, 25, 120));
      }
    }, { speed: 0.75, home: u });
    cat.name = pick(r, CAT_NAMES);
    cat.label = 'a cat';
    u.pets.push(cat);
  }
  makeClerk() {
    const w = this;
    const clerk = new Walker(this, randomLook(this.rng, { shirt: 0x2f5a3a }), function* () {
      let inside = false;
      for (;;) {
        if (w.shopOpen('deli') && !inside) {
          if (w.realT < 1) this.pos.set(DELI.clerk[0], SW_Y, DELI.clerk[1]);
          else { this.pos.set(-42, SW_Y, 2.4); yield* this.walkTo(DELI.door[0], 1.0, SW_Y); yield* this.walkTo(DELI.inside[0], DELI.inside[1]); yield* this.walkTo(DELI.clerk[0], DELI.clerk[1]); }
          this.hidden = false; inside = true;
        } else if (!w.shopOpen('deli') && inside) {
          yield* this.walkTo(DELI.inside[0], DELI.inside[1]); yield* this.walkTo(DELI.door[0], 1.0); yield* this.walkTo(-42, 2.4);
          this.offstage(); inside = false;
        } else if (inside) {
          this.targetYaw = 0; this.pose = 'stand'; this.label = 'working the counter';
          yield* this.waitReal(range(Math.random, 15, 45));
          if (Math.random() < 0.35 && w.shopOpen('deli')) {
            yield* this.walkTo(DELI.shelf[0] + range(Math.random, -1, 1), DELI.shelf[1] + 0.6);
            this.targetYaw = Math.PI; this.pose = 'reach';
            yield* this.waitReal(range(Math.random, 6, 14));
            this.pose = 'stand';
            yield* this.walkTo(DELI.clerk[0], DELI.clerk[1]);
          }
        }
        yield;
      }
    });
    clerk.name = 'the deli clerk';
  }
  shopOpen(k) { const m = this.mod; return k === 'deli' ? m >= 360 && m < 1380 : m >= 420 && m < 1320; }

  // ---- queries used by the sim
  roomAt(p, hint) {
    if (hint && hint.contains(p)) return hint;
    for (const r of this.rooms) if (r.contains(p)) return r;
    return null;
  }
  onRoomChange(a, old, nw) {
    if (!a.counts) return;
    if (old) old.occ.delete(a);
    if (nw) { nw.occ.add(a); nw.leftOn = false; }
  }
  pickAnswerer(u) {
    const c = u.residents.filter((p) => p.where === 'home' && !p.asleep && !p.busy && !p.hidden);
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }
  leavePackage(u, prop, pos) {
    prop.group.position.copy(pos);
    prop.group.rotation.y = Math.random() - 0.5;
    for (const m of prop.meshes) m.material = this.outMat;
    this.scene.add(prop.group);
    this.packages.set(u, { prop, pos });
    this.toast(`Nobody answered in ${u.name}. The package is left at the door.`);
  }
  toast(msg) { this.toastQ.push({ msg, t: this.realT }); }

  // ---- demo triggers
  awakeHome(pred = () => true) { return this.residents.filter((p) => p.where === 'home' && !p.asleep && !p.busy && !p.hidden && pred(p)); }
  demo(kind) {
    const pickOne = (a) => (a.length ? a[Math.floor(Math.random() * a.length)] : null);
    if (kind === 'delivery') {
      const p = pickOne(this.awakeHome());
      const u = p ? p.home : pickOne(this.units);
      this.street.deliverPackage(u);
      return u.name;
    }
    if (kind === 'pizza') {
      const p = pickOne(this.awakeHome());
      if (!p) return null;
      const w = this;
      p.interrupt(function* () {
        const m = { day: w.day, kind: 'pizza', ready: false, started: w.time };
        this.home.meal = m;
        this.dinnerDay = w.day;
        this.label = 'ordering food'; this.pose = 'phone';
        yield* this.waitGame(2);
        this.pose = 'stand';
        w.street.orderFood(this, m);
        yield* this.watchTV(110, () => m.ready, 'waiting on the food');
        if (m.ready) yield* this.watchTV(range(Math.random, 18, 28), null, 'eating pizza', true);
      });
      return p.home.name;
    }
    if (kind === 'ride') {
      const p = pickOne(this.awakeHome());
      if (!p) return null;
      const w = this;
      p.interrupt(function* () { yield* this.outing({ mode: 'car', until: w.time + range(Math.random, 90, 200), label: 'out for the evening', coat: true, carHome: true }); });
      return p.home.name;
    }
    if (kind === 'party') {
      if (this.incidents.party) return null;
      const ok = (u) => !u.fire && !u.damage && u.residents.some((p) => p.where === 'home' && !p.busy && !p.asleep);
      const hosts = this.units.filter((u) => u.host && ok(u));
      const u = pickOne(hosts.length ? hosts : this.units.filter(ok));
      return u && this.incidents.startParty(u) ? u.name : null;
    }
    if (kind === 'fire') {
      if (this.incidents.busy()) return null;
      const cooking = this.units.filter((u) => u.burnerOn);
      const homes = this.units.filter((u) => u.residents.some((p) => p.where === 'home'));
      const u = pickOne(cooking.length ? cooking : homes.length ? homes : this.units);
      return this.incidents.startFire(u) ? u.name : null;
    }
    if (kind === 'breakin') {
      if (this.incidents.busy()) return null;
      let t = this.units.filter((u) => this.incidents.canBreakInto(u, 90));
      if (!t.length) t = this.units.filter((u) => this.incidents.canBreakInto(u, 25));
      const u = pickOne(t);
      return u && this.incidents.startBreakIn(u) ? u.name : null;
    }
    if (kind === 'ambulance') {
      if (this.street.flashing) return null;
      const front = this.awakeHome((x) => ['L', 'B'].includes(x.home.roomKeyAt(x.pos)));
      const p = pickOne(front.length ? front : this.awakeHome());
      if (!p) return null;
      return this.street.ambulance(p) ? p.home.name : null;
    }
    return null;
  }

  // ---- per frame
  update(dtReal) {
    const dt = Math.min(dtReal, 0.1) * this.ff;
    this.dt = dt;
    this.realT += dt;
    this.time += dt * GAME_PER_REAL;
    if (this.day !== this.seasonDay) this.applySeason();
    const hr = Math.floor(this.time / 60);
    if (hr !== this.hourMark) { this.hourMark = hr; this.onHour(); }
    this.updateEnv();
    this.street.update(dt);
    for (const a of this.actors) if (!a.dead) a.update(dt);
    this.incidents.update(dt);
    this.actors = this.actors.filter((a) => !a.dead);
    this.updateUnits(dt);
    for (const r of this.rooms) r.update(dt, this.realT);
    this.updateDoors(dt);
    if (this.snow.visible) this.updateSnow(dt);
  }
  onHour() {
    const h = this.mod / 60;
    if (h >= 9 && h < 20 && Math.random() < 0.22) {
      const homes = this.units.filter((u) => u.residents.length);
      this.street.deliverPackage(homes[Math.floor(Math.random() * homes.length)]);
    }
    if (h >= 8 && h < 23 && Math.random() < 0.004) this.demo('ambulance');
    // a fire starts in a kitchen maybe once every few weeks of game time; a break-in, rarer still
    for (const u of this.units) if (u.burnerOn && Math.random() < 0.006) this.incidents.startFire(u);
    if (!this.incidents.busy() && (h < 5 || h >= 23) && Math.random() < 0.03) { const t = this.units.filter((u) => this.incidents.canBreakInto(u)); if (t.length) this.incidents.startBreakIn(t[Math.floor(Math.random() * t.length)]); }
    const wd = (this.startWeekday + this.day) % 7;
    if ((wd === 5 || wd === 6) && Math.floor(h) === 21 && !this.incidents.party && Math.random() < 0.6) this.demo('party');
    for (const p of this.residents) {
      if (p.job === 'student' && h > 7 && h < 9 && (!p.goingOut || p.goingOut.day !== this.day)) p.goingOut = Math.random() < 0.4 ? { day: this.day, at: range(Math.random, 1230, 1300), done: false } : null;
    }
  }
  updateUnits(dt) {
    const dark = this.dayF < 0.42;
    const m = this.mod;
    for (const u of this.units) {
      const home = u.residents.filter((p) => p.where === 'home');
      const awakeHome = home.filter((p) => !p.asleep);
      for (const k in u.rooms) {
        const room = u.rooms[k];
        let awake = 0;
        for (const a of room.occ) if (!a.asleep && !a.hidden) awake++;
        const needs = k === 'H' || k === 'Ba' ? true : dark;
        if (awake > 0 && needs && !room.mainOn() && room.sleepers.size === 0) {
          room.onT = (room.onT ?? range(Math.random, 0.5, 1.8)) - dt;
          if (room.onT <= 0) { room.onT = null; if (k === 'L' && u.hh.cozy) room.set(1, true); else room.set(0, true); }
        } else room.onT = null;
        const wantOff = room.mainOn() && !room.leftOn && (awake === 0 || !needs) && !(u.timerOn && k === 'L');
        if (wantOff) {
          room.offT = (room.offT ?? (awake ? range(Math.random, 20, 60) : range(Math.random, 2, 7))) - dt;
          if (room.offT <= 0) {
            room.offT = null;
            if (Math.random() < u.hh.tidy || k === 'Ba' || room.sleepers.size || !needs) room.allOff();
            else room.leftOn = true;
          }
        } else room.offT = null;
      }
      // a timer lamp while everyone is away
      const away = u.residents.length && !home.length;
      const timer = away && u.residents.some((p) => p.where === 'away') && inCirc(m, 1080, 1395);
      if (timer !== !!u.timerOn) { u.timerOn = timer; u.rooms.L.set(1, timer); }
      // stove, blinds, boxes, tree
      const bc = u.burner.material.color;
      if (u.burnerOn) bc.setRGB(1.8 + Math.sin(this.realT * 9) * 0.2, 0.35, 0.05); else bc.setRGB(0.02, 0.02, 0.02);
      for (const w of u.windows) w.blind.scale.y = damp(w.blind.scale.y, 0.08 + w.blindTarget * 1.6, 0.9, dt);
      for (let i = u.boxes.length - 1; i >= 0; i--) if (this.time > u.boxes[i].until) { this.scene.remove(u.boxes[i].prop.group); u.boxes.splice(i, 1); }
      if (u.strip) {
        const on = awakeHome.length > 0 && dark;
        const c = new THREE.Color();
        for (let i = 0; i < u.strip.count; i++) {
          if (!on) c.setRGB(0.03, 0.03, 0.03);
          else if (u.theme === 'gamer') c.setHSL((this.realT * 0.08 + i * 0.004) % 1, 1, 0.5).multiplyScalar(2.2);
          else c.setRGB(2.2, 1.4, 0.55);
          u.strip.setColorAt(i, c);
        }
        u.strip.instanceColor.needsUpdate = true;
      }
      if (u.tree && u.tree.group.visible) {
        const on = awakeHome.length > 0 && (dark || m > 960);
        u.rooms.L.set(3, on);
        u.tree.on = on;
        const c = new THREE.Color();
        for (let i = 0; i < u.tree.base.length; i++) {
          const tw = on ? 1.6 + 1.4 * Math.max(0, Math.sin(this.realT * 1.7 + i * 1.3)) : 0.06;
          c.copy(u.tree.base[i]).multiplyScalar(tw);
          u.tree.im.setColorAt(i, c);
        }
        u.tree.im.instanceColor.needsUpdate = true;
        u.tree.star.material.color.setScalar(on ? 2.5 : 0.1);
      }
    }
    // window string lights glow at night
    if (this.B.windowLights.visible) this.B.windowLights.material.color.setScalar(dark ? 1 : 0.25);
    // shops
    for (const [room, key, li] of [[this.B.deli, 'deli', 0], [this.B.laundry, 'laundry', 1]]) {
      const open = this.shopOpen(key);
      for (let i = 0; i < room.lights.length; i++) room.set(i, open);
      this.B.signs[li].emissiveIntensity = open ? lerp(0.15, 1.4, 1 - this.dayF) : 0;
      this.shopLights[li].intensity = open ? 2.5 * (1 - this.dayF) : 0;
    }
    this.B.openSign.material.color.setScalar(this.shopOpen('deli') ? 2.2 : 0);
    this.lobbyLight.intensity = 2.2 * (1 - this.dayF) + 0.3;
    if (this.B.candles) for (const c of this.B.candles) c.material.color.setRGB(2 + Math.random() * 0.8 * (1 - this.dayF), 0.9, 0.2);
  }
  updateDoors(dt) {
    let near = false;
    for (const a of this.actors) if (!a.hidden && Math.abs(a.pos.x) < 1.2 && a.pos.z > -1.5 && a.pos.z < 1.2 && a.pos.y < 1) { near = true; break; }
    for (const d of this.B.lobbyDoors) {
      d.open = damp(d.open, near ? 1 : 0, near ? 5 : 2, dt);
      d.pivot.rotation.y = d.sd * d.open * 1.2 * -1;
    }
  }
  updateSnow(dt) {
    const p = this.snow.geometry.attributes.position;
    const a = p.array;
    for (let i = 0; i < this.snowV.length; i++) {
      a[i * 3 + 1] -= this.snowV[i] * dt;
      a[i * 3] += Math.sin(this.realT * 0.7 + i) * 0.25 * dt;
      if (a[i * 3 + 1] < 0) { a[i * 3 + 1] += 31; a[i * 3] = range(Math.random, -26, 26); }
    }
    p.needsUpdate = true;
  }
  updateEnv() {
    const d = this.date();
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    const lat = 40.7 * Math.PI / 180;
    const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (doy - 81) / 365);
    const H = ((this.mod / 60) - 11.9) * 15 * Math.PI / 180;
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const el = Math.asin(sinEl);
    const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
    const az = azS + Math.PI;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const elDeg = el * 180 / Math.PI;
    const dayF = smooth(-7, 6, elDeg);
    const tw = smooth(-9, -1, elDeg) * (1 - smooth(1, 12, elDeg));
    this.dayF = dayF; this.shared.dayF = dayF; this.elDeg = elDeg;
    const U = this.sky.uniforms;
    const top = new THREE.Color(0.004, 0.006, 0.018).lerp(new THREE.Color(0.1, 0.24, 0.6), dayF).lerp(new THREE.Color(0.06, 0.07, 0.2), tw * 0.6);
    const hor = new THREE.Color(0.04, 0.032, 0.034).lerp(new THREE.Color(0.55, 0.66, 0.82), dayF).lerp(new THREE.Color(0.95, 0.45, 0.22), tw * 0.85);
    U.uTop.value.copy(top); U.uHor.value.copy(hor);
    U.uSunDir.value.copy(dir);
    U.uSunCol.value.setRGB(1, 0.75 + 0.25 * smooth(0, 20, elDeg), 0.5 + 0.5 * smooth(0, 25, elDeg)).multiplyScalar(smooth(-3, 2, elDeg));
    U.uMoonDir.value.set(0.35, 0.55, -0.75).normalize();
    U.uStars.value = 1 - smooth(-12, -4, elDeg);
    this.hemi.color.copy(hor).lerp(top, 0.5);
    this.hemi.groundColor.setRGB(0.22, 0.18, 0.15);
    this.hemi.intensity = 0.08 + 1.05 * dayF;
    const sk = smooth(-1, 8, elDeg);
    if (!this.sunDir || this.sunDir.angleTo(dir) > 0.004) { this.sunDir = dir.clone(); this.sun.position.copy(dir).multiplyScalar(80).add(this.sun.target.position); }
    this.sun.castShadow = sk > 0.01;
    this.sun.intensity = 3.0 * sk;
    this.sun.color.setRGB(1, 0.78 + 0.22 * smooth(0, 25, elDeg), 0.6 + 0.4 * smooth(0, 30, elDeg));
    this.moon.intensity = 0.25 * (1 - dayF);
    this.exposure = lerp(1.2, 0.9, dayF);
    this.shared.uDay.value.set(0.95, 0.96, 1.04).multiplyScalar(dayF * 0.9).add(new THREE.Vector3(0.25, 0.1, 0.04).multiplyScalar(tw));
    this.shared.uAmb.value.set(0.006, 0.007, 0.012).add(new THREE.Vector3(0.014, 0.01, 0.006).multiplyScalar(1 - dayF));
    const g = this.B.ext.glass;
    g.opacity = lerp(0.06, 0.58, Math.pow(dayF, 0.7));
    g.color.copy(hor).multiplyScalar(0.85).lerp(new THREE.Color(0.25, 0.3, 0.38), 0.3);
    const night = 1 - dayF;
    for (const nb of this.B.neighbors) nb.mat.emissiveIntensity = 0.42 * night + 0.02;
    this.B.skyline.emissiveIntensity = 0.55 * night;
    this.B.skyline.color.setRGB(0.035, 0.04, 0.05).lerp(new THREE.Color(0.42, 0.5, 0.62), dayF * 0.85);
    const lampsOn = dayF < 0.35 ? 1 : 0;
    for (const L of this.B.lamps) { L.light.intensity = 16 * lampsOn; L.head.material.color.setRGB(0.1 + 3.4 * lampsOn, 0.08 + 2.5 * lampsOn, 0.05 + 1.5 * lampsOn); }
    this.nbT -= this.dt;
    if (this.nbT <= 0) {
      this.nbT = 6;
      const h = this.mod / 60;
      const p = h < 5 ? 0.06 : h < 7 ? 0.18 : h < 16 ? 0.12 : h < 23 ? 0.5 : 0.25;
      for (const nb of this.B.neighbors) { for (const r of nb.winRects) if (Math.random() < 0.06) r.lit = Math.random() < p; nb.redraw(); }
    }
  }
}
