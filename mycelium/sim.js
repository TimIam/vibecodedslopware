// Mycelium: the colony simulation. Pure logic, no DOM, so `node tools/mycelium-balance.mjs`
// can run thousands of ticks of it to check the economy. game.js draws it.
//
// The world is a side-on cross-section of soil, W x H cells. Each cell has a terrain type,
// a nutrient amount, a moisture level, and for each of the two colonies (0 = you, 1 = the
// rival) a hyphae density and a toxin level. Colonies grow by sending out "tips": little
// agents that walk through the soil one cell at a time and leave hyphae behind them.

export const W = 160, H = 96;
export const AIR = 0, SOIL = 1, CLAY = 2, ROCK = 3, WATER = 4, FOOD = 5, LROOT = 6;
export const TPS = 30;             // ticks per second at 1x
export const DAY = 90 * TPS;       // ticks per in-game day
export const WEATHER = ['sun', 'cloud', 'rain', 'storm'];

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const PLOT_KINDS = {
  lawn:    { name: 'Lawn',         desc: 'Turf over loam. Dead roots and a few leaves. Easy pickings.',          food: 1,   rocks: 1,   clay: 1,   water: 1,   grubs: 1,   roots: 1 },
  bed:     { name: 'Flower bed',   desc: 'Rich, turned soil. Lots to eat, and lots of grubs eating it.',         food: 1.5, rocks: .5,  clay: .6,  water: 1.2, grubs: 1.8, roots: 1 },
  compost: { name: 'Compost heap', desc: 'A feast. The rival knows it too.',                                      food: 2.4, rocks: .2,  clay: .2,  water: 1.5, grubs: 1.3, roots: .5, rival: 1.5 },
  tree:    { name: 'Under the oak',desc: 'Deep roots, dry shade, stones everywhere.',                             food: 1.2, rocks: 1.8, clay: 1.2, water: .7,  grubs: .8,  roots: 2.5 },
  path:    { name: 'Gravel path',  desc: 'Packed and stony. Little to eat, little room to grow.',                 food: .6,  rocks: 2.6, clay: 1.6, water: .6,  grubs: .6,  roots: .6 },
  pond:    { name: 'Pond edge',    desc: 'Waterlogged and soft. Growth is quick; so is the rival\'s.',            food: 1.1, rocks: .4,  clay: .3,  water: 3,   grubs: 1,   roots: .8, rival: 1.3 },
  patio:   { name: 'Patio',        desc: 'Concrete. Nothing grows here.', barren: true },
};

const STEP_COST = 0.6;        // energy per cell a tip grows into
const SPAWN_COST = 2;         // energy to start a new tip
const UPKEEP = 0.0005;        // energy per hyphae cell per tick
const DEF_COST = 0.0004;      // extra upkeep per cell per unit of defense allocation
const EXTRACT = 0.025;         // nutrient pulled per connected food cell per tick
const SHROOM_COST = 80;
export const COSTS = { surge: 60, toxin: 45, fruit: SHROOM_COST, lead: 0, retract: 0 };
const LROOT_INCOME = 0.012;   // a living root trades sugar for minerals, forever
export const GOALS = [
  { id: 'food',   text: 'Reach a food source',             reward: 6 },
  { id: 'root',   text: 'Connect to a living root',        reward: 10 },
  { id: 'shroom', text: 'Fruit a mushroom',                reward: 6 },
  { id: 'cache',  text: 'Find something buried',           reward: 6 },
  { id: 'grub',   text: 'Kill a grub with toxins',         reward: 8 },
  { id: 'fight',  text: 'Win 25 fights against the rival', reward: 8 },
  { id: 'spores', text: 'Shed 50 spores',                  reward: 10 },
];

export class Sim {
  constructor(seed, kind = 'lawn', difficulty = 0) {
    this.seed = seed;
    this.rnd = mulberry(seed);
    this.kind = kind;
    this.plot = PLOT_KINDS[kind] || PLOT_KINDS.lawn;
    this.difficulty = difficulty;
    const N = W * H;
    this.terrain = new Uint8Array(N);
    this.food = new Float32Array(N);
    this.moist = new Float32Array(N);
    this.smell = new Float32Array(N);     // diffused "where the food is", sensed by tips
    this.scent = new Float32Array(N);     // the player's painted attractant
    this.dist = new Uint8Array(N);        // disturbed soil (cosmetic)
    this.hyph = [new Float32Array(N), new Float32Array(N)];
    this.tox = [new Float32Array(N), new Float32Array(N)];
    this.conn = [new Uint8Array(N), new Uint8Array(N)];
    this.connList = [[], []];
    this.surfaceCands = [[], []];
    this.hyphCount = [0, 0];
    this.tips = [[], []];
    this.energy = [500, 500 * (1 + 0.12 * difficulty) * (this.plot.rival || 1)];
    this.alloc = [{ grow: .6, def: .2, fruit: .2 }, { grow: .65, def: .25, fruit: .1 }];
    this.core = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.sy = new Int16Array(W);
    this.grubs = [];
    this.shrooms = [];
    this.spores = [0, 0];
    this.sporeTarget = 110 + 30 * difficulty;
    this.time = 0;
    this.day = 1;
    this.weather = 'sun';
    this.nextWeather = null;
    this.spade = null;
    this.spadeAt = -1;
    this.state = 'play';
    this.result = '';
    this.log = [];
    this.fx = [];
    this.contact = 0;          // recent combat, drives rival AI
    this.aggr = 0.4 + 0.3 * difficulty;
    this.rivalMult = (1 + 0.08 * difficulty) * (this.plot.rival || 1);
    this.grubTimer = 0;
    this.starving = [false, false];
    this.coreHp = [5, 5];
    this.reachedFood = false;
    this.pilot = null;             // the tip you steer by hand
    this.slugs = [];
    this.slugTimer = 0;
    this.bonus = new Map();        // cell index -> what is buried there
    this.goals = GOALS.map(g => ({ ...g, done: false }));
    this.stats = { fights: 0, grubs: 0, caches: 0, roots: 0, shroomsGrown: 0, slugs: 0, shed: 0 };
    this.generate();
    this.recomputeSmell();
    this.refresh();
  }

  say(msg) { this.log.push({ t: this.time, msg }); if (this.log.length > 40) this.log.shift(); }

  // ---------- world generation ----------
  generate() {
    const r = this.rnd, p = this.plot, T = this.terrain;
    const ph = r() * 6.28, ph2 = r() * 6.28;
    for (let x = 0; x < W; x++) {
      this.sy[x] = Math.round(14 + 2 * Math.sin(x / 13 + ph) + 1.5 * Math.sin(x / 5.3 + ph2));
    }
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) T[y * W + x] = y < this.sy[x] ? AIR : SOIL;

    const blob = (cx, cy, rx, ry, fn) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1 + (r() - .5) * .4) fn(y * W + x, d);
      }
    };
    const inSoil = i => T[i] !== AIR;

    // clay bands
    const bands = Math.round(2 * p.clay);
    for (let b = 0; b < bands; b++) {
      const yc = 30 + r() * (H - 42), th = 2 + r() * 4, wob = r() * 6.28;
      for (let x = 0; x < W; x++) {
        const y0 = yc + 3 * Math.sin(x / 9 + wob) + 2 * Math.sin(x / 3.1 + b);
        for (let y = Math.floor(y0); y < y0 + th; y++) if (y > 0 && y < H && inSoil(y * W + x) && r() < .9) T[y * W + x] = CLAY;
      }
    }
    // rocks
    const rocks = Math.round(7 * p.rocks);
    for (let k = 0; k < rocks; k++) {
      const cx = r() * W, cy = 20 + r() * (H - 24), rx = 2 + r() * 6, ry = 1 + r() * 3.5;
      blob(cx, cy, rx, ry, i => { if (inSoil(i)) T[i] = ROCK; });
    }
    // water pockets
    const waters = Math.round(1.5 * p.water);
    for (let k = 0; k < waters; k++) {
      const cx = r() * W, cy = H * .55 + r() * H * .4, rx = 2 + r() * 3, ry = 1.5 + r() * 2;
      blob(cx, cy, rx, ry, i => { if (inSoil(i) && T[i] !== ROCK) T[i] = WATER; });
    }
    const feed = (i, amt) => { if (inSoil(i) && T[i] !== ROCK && T[i] !== WATER) { T[i] = FOOD; this.food[i] = Math.max(this.food[i], amt); } };
    // dead roots wandering down from the surface
    const roots = Math.round(3 * p.roots * Math.min(p.food, 1.5));
    for (let k = 0; k < roots; k++) {
      let x = 8 + r() * (W - 16), y = this.sy[Math.round(x)] + 1, a = Math.PI / 2 + (r() - .5);
      const len = 15 + r() * 40, amt = 40 + r() * 50;
      for (let s = 0; s < len; s++) {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || xi >= W || yi >= H) break;
        feed(yi * W + xi, amt);
        if (s < 8 && xi + 1 < W) feed(yi * W + xi + 1, amt * .8);
        a += (r() - .5) * .6; a = Math.PI / 2 + Math.max(-1.2, Math.min(1.2, a - Math.PI / 2));
        x += Math.cos(a); y += Math.sin(a);
      }
    }
    // leaf litter near the surface
    const leaves = Math.round(8 * p.food);
    for (let k = 0; k < leaves; k++) {
      const cx = r() * W, cy = this.sy[Math.floor(cx)] + 1 + r() * 6;
      blob(cx, cy, 1 + r() * 2.5, .7 + r() * 1.2, i => feed(i, 30 + r() * 30));
    }
    // buried logs
    const logs = p.food >= 2 ? 2 : (r() < .6 * p.food ? 1 : 0);
    for (let k = 0; k < logs; k++) {
      const cx = 20 + r() * (W - 40), cy = 32 + r() * (H - 50);
      blob(cx, cy, 7 + r() * 7, 2.5 + r() * 2.5, i => feed(i, 110 + r() * 90));
    }
    // something died down there
    const corpses = Math.round(2 * p.food);
    for (let k = 0; k < corpses; k++) {
      const cx = r() * W, cy = 24 + r() * (H - 30);
      blob(cx, cy, 1 + r() * 1.5, 1 + r(), i => feed(i, 90 + r() * 40));
    }
    // living roots: steady sugar for whoever connects to them
    const live = 1 + Math.round(r() * Math.min(2, p.roots));
    for (let k = 0; k < live; k++) {
      let x = 10 + r() * (W - 20), y = this.sy[Math.round(x)] + 1, a = Math.PI / 2 + (r() - .5) * .8;
      const len = 18 + r() * 30;
      for (let st = 0; st < len; st++) {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || xi >= W || yi >= H) break;
        const i = yi * W + xi;
        if (T[i] !== AIR && T[i] !== ROCK && T[i] !== WATER) { T[i] = LROOT; this.food[i] = 0; }
        a += (r() - .5) * .5; a = Math.PI / 2 + Math.max(-1.1, Math.min(1.1, a - Math.PI / 2));
        x += Math.cos(a); y += Math.sin(a);
      }
    }
    // buried surprises
    const kinds = ['seed', 'seed', 'bone', 'print', 'coin', 'beetle'];
    const caches = 4 + Math.round(r() * 2);
    for (let k = 0; k < caches; k++) {
      const cx = Math.floor(4 + r() * (W - 8)), cy = Math.floor(this.sy[cx] + 8 + r() * (H - this.sy[cx] - 12));
      const i = cy * W + cx;
      if (T[i] === SOIL || T[i] === CLAY) this.bonus.set(i, kinds[Math.floor(r() * kinds.length)]);
    }
    // cores
    for (let s = 0; s < 2; s++) {
      const cx = Math.round(s === 0 ? W * .18 + r() * W * .12 : W * .7 + r() * W * .12);
      const cy = Math.round(this.sy[cx] + 16 + r() * 22);
      this.core[s] = { x: cx, y: cy };
      blob(cx, cy, 2.6, 2.6, i => { if (inSoil(i)) { T[i] = SOIL; this.food[i] = 0; this.bonus.delete(i); } });
      blob(cx, cy, 1.6, 1.6, i => { this.hyph[s][i] = .6; });
      this.hyph[s][cy * W + cx] = 1;
    }
    // moisture
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const i = y * W + x, t = T[i];
      if (t === AIR || t === ROCK) { this.moist[i] = 0; continue; }
      if (t === WATER) { this.moist[i] = 1; continue; }
      const depth = (y - this.sy[x]) / (H - this.sy[x]);
      this.moist[i] = Math.min(1, .3 + .3 * depth + (r() - .5) * .12 + .1 * Math.min(p.water, 2));
    }
    for (let k = 0; k < 6; k++) this.diffuseMoisture(1);
  }

  recomputeSmell() {
    const S = this.smell, T = this.terrain, N = W * H;
    for (let i = 0; i < N; i++) S[i] = T[i] === FOOD ? Math.min(1, this.food[i] / 70) : T[i] === LROOT ? .5 : 0;
    const tmp = new Float32Array(N);
    for (let k = 0; k < 14; k++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, t = T[i];
        if (t === AIR || t === ROCK) { tmp[i] = 0; continue; }
        let sum = S[i] * 2, n = 2;
        if (x > 0) { sum += S[i - 1]; n++; }
        if (x < W - 1) { sum += S[i + 1]; n++; }
        if (y > 0) { sum += S[i - W]; n++; }
        if (y < H - 1) { sum += S[i + W]; n++; }
        tmp[i] = Math.max(sum / n, t === FOOD ? Math.min(1, this.food[i] / 70) : t === LROOT ? .5 : 0);
      }
      S.set(tmp);
    }
  }

  // ---------- per tick ----------
  tick() {
    if (this.state !== 'play') return;
    this.time++;
    const t = this.time;
    if (t % DAY === 0) this.newDay();
    if (t % 2 === 0) this.weatherStep();
    if (t % 20 === 0) this.refresh();
    if (t % 90 === 0) this.recomputeSmell();
    if (t % (this.weather === 'storm' ? 200 : 450) === 0) this.leafFall();
    this.cellPass();
    for (let s = 0; s < 2; s++) this.growTips(s);
    if (this.pilot) this.updatePilot();
    this.updateGrubs();
    this.updateSlugs();
    if (t % 30 === 0) this.checkGoals();
    this.updateShrooms();
    if (this.spade) this.updateSpade();
    if (t % 60 === 0) this.rivalAI();
    if (t % 30 === 0) this.checkEnd();
  }

  newDay() {
    this.day++;
    const r = this.rnd();
    const wet = this.plot.water >= 2 ? .15 : 0;
    this.weather = r < .4 - wet ? 'sun' : r < .65 - wet ? 'cloud' : r < .9 ? 'rain' : 'storm';
    const names = { sun: 'A dry, sunny day. The topsoil will bake.', cloud: 'Overcast. The soil keeps its water.', rain: 'Rain. Perfect fruiting weather.', storm: 'A storm! The ground is soaked.' };
    this.say(`Day ${this.day}. ${names[this.weather]}`);
    if (this.day >= 3 && this.rnd() < .35) this.spadeAt = this.time + Math.floor(DAY * (.2 + .6 * this.rnd()));
  }

  weatherStep() {
    const M = this.moist, T = this.terrain, w = this.weather;
    const tod = (this.time % DAY) / DAY;
    const daylight = tod > .25 && tod < .78;
    for (let x = 0; x < W; x++) {
      const sy = this.sy[x];
      if (w === 'rain' || w === 'storm') {
        const add = w === 'storm' ? .05 : .025;
        for (let y = sy; y < sy + 3 && y < H; y++) { const i = y * W + x; if (T[i] !== ROCK) M[i] = Math.min(1, M[i] + add * (1 - (y - sy) * .3)); }
      } else if (daylight) {
        const ev = w === 'sun' ? .006 : .0015;
        for (let y = sy; y < sy + 7 && y < H; y++) { const i = y * W + x; if (T[i] !== ROCK && T[i] !== WATER) M[i] = Math.max(0, M[i] - ev * (1 - (y - sy) / 7)); }
      }
    }
    this.diffuseMoisture(.08);
    if (this.spadeAt > 0 && this.time >= this.spadeAt && !this.spade) {
      this.spadeAt = -1;
      this.spade = { x: Math.round(10 + this.rnd() * (W - 20)), t: 0, dur: 45 };
      this.say('The gardener is coming with a spade!');
    }
  }

  leafFall() {
    const r = this.rnd, T = this.terrain;
    const n = r() < .5 * Math.min(2, this.plot.food) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const cx = Math.floor(r() * W), rx = 1 + r() * 1.6, amt = 25 + r() * 25 * this.plot.food;
      for (let y = this.sy[cx]; y <= this.sy[cx] + 1; y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (Math.abs(x - cx) <= rx && T[i] !== ROCK && T[i] !== WATER && T[i] !== AIR) { T[i] = FOOD; this.food[i] += amt * (y === this.sy[cx] ? 1 : .5); }
      }
      this.fx.push({ type: 'leaf', x: cx, y: this.sy[cx] });
    }
  }

  diffuseMoisture(rate) {
    const M = this.moist, T = this.terrain;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, t = T[i];
      if (t === AIR || t === ROCK || t === WATER) continue;
      let sum = 0, n = 0;
      const nb = (j, wgt) => { const tj = T[j]; if (tj === AIR || tj === ROCK) return; sum += M[j] * wgt; n += wgt; };
      nb(i - 1, 1); nb(i + 1, 1); nb(i - W, .8); nb(i + W, 1.2);
      if (n > 0) M[i] += (t === CLAY ? rate * .35 : rate) * (sum / n - M[i]);
    }
  }

  // Connectivity (BFS from each core), counts, fruiting candidates.
  refresh() {
    const N = W * H;
    for (let s = 0; s < 2; s++) {
      const hy = this.hyph[s], cn = this.conn[s], list = [];
      cn.fill(0);
      const c = this.core[s], ci = c.y * W + c.x;
      hy[ci] = 1;
      const q = new Int32Array(N); let qh = 0, qt = 0;
      q[qt++] = ci; cn[ci] = 1;
      while (qh < qt) {
        const i = q[qh++]; list.push(i);
        const x = i % W, y = (i - x) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (hy[j] > 0 && !cn[j]) { cn[j] = 1; q[qt++] = j; }
        }
      }
      this.connList[s] = list;
      let count = 0; for (let i = 0; i < N; i++) if (hy[i] > 0) count++;
      this.hyphCount[s] = count;
      const cands = [];
      for (let x = 0; x < W; x++) { const i = this.sy[x] * W + x; if (cn[i] && hy[i] > .3 && this.terrain[i] !== ROCK) cands.push(x); }
      this.surfaceCands[s] = cands;
    }
  }

  cellPass() {
    const N = W * H, T = this.terrain, M = this.moist;
    const income = [0, 0];
    for (let s = 0; s < 2; s++) {
      const cost = this.hyphCount[s] * (UPKEEP + DEF_COST * this.alloc[s].def);
      this.energy[s] -= cost;
    }
    for (let s = 0; s < 2; s++) {
      const hy = this.hyph[s], en = this.hyph[1 - s], cn = this.conn[s], tx = this.tox[s], etx = this.tox[1 - s];
      const def = this.alloc[s].def, starving = this.starving[s];
      const coreI = this.core[s].y * W + this.core[s].x;
      const cap = 500 + .25 * this.hyphCount[s];
      for (let i = 0; i < N; i++) {
        let d = hy[i];
        if (d <= 0) { if (tx[i] > 0.001) tx[i] *= .985; else if (tx[i]) tx[i] = 0; continue; }
        if (cn[i]) {
          if (!starving) d += .0006;
          if (T[i] === LROOT) { income[s] += LROOT_INCOME; if (s === 0 && !this.stats.roots) { this.stats.roots = 1; this.say('A living root! It trades sugar for your minerals: steady energy, forever.'); this.fx.push({ type: 'text', x: i % W, y: (i - i % W) / W, text: 'living root!', col: '#b8e08a' }); } }
          if (T[i] === FOOD && this.energy[s] + income[s] < cap) {
            const take = Math.min(this.food[i], EXTRACT * Math.min(1, d * 2));
            this.food[i] -= take; income[s] += take;
            if (this.food[i] <= 0) { T[i] = SOIL; this.food[i] = 0; }
          }
        } else d -= .003;
        if (M[i] < .12) d -= .0015;
        if (starving && T[i] !== FOOD && i !== coreI) {
          const x = i % W;
          const leaf = (x > 0 && hy[i - 1] <= 0) || (x < W - 1 && hy[i + 1] <= 0) || (i >= W && hy[i - W] <= 0) || (i < N - W && hy[i + W] <= 0);
          d -= leaf ? .0009 : .00008; // shed the frontier, keep the cords
        }
        const et = etx[i];
        if (et > 0) d -= et * .006;
        if (def > 0.02) {
          const prod = def * d * .015;
          tx[i] = Math.min(1, tx[i] + prod);
          const x = i % W;
          if (x > 0) tx[i - 1] = Math.min(1, tx[i - 1] + prod * .3);
          if (x < W - 1) tx[i + 1] = Math.min(1, tx[i + 1] + prod * .3);
          if (i >= W) tx[i - W] = Math.min(1, tx[i - W] + prod * .3);
          if (i < N - W) tx[i + W] = Math.min(1, tx[i + W] + prod * .3);
        }
        tx[i] *= .985;
        if (d > 1) d = 1;
        if (i === coreI) d = 1; else if (d <= .03) d = 0;
        hy[i] = d;
      }
      // a small colony lives off the reserves in its spore case; a big one has to eat
      const reserve = Math.max(0, .2 * (1 - Math.max(0, this.hyphCount[s] - 350) / 450));
      this.energy[s] += income[s] * 1.1 + reserve;
      if (s === 0 && income[0] > 0 && !this.reachedFood) { this.reachedFood = true; this.say('Your hyphae found food. Energy flows back along the network.'); }
      if (this.energy[s] <= 0) {
        this.energy[s] = 0;
        if (!this.starving[s]) { this.starving[s] = true; if (s === 0) this.say('Energy exhausted! The network is eating itself. Reach food.'); }
      } else if (this.starving[s] && this.energy[s] > 15) {
        this.starving[s] = false; if (s === 0) this.say('Energy restored.');
      }
    }
    const sc = this.scent, hy0 = this.hyph[0];
    for (let i = 0; i < N; i++) { const v = sc[i]; if (v > 0) sc[i] = v < .01 ? 0 : v * (hy0[i] > 0 ? .985 : .9997); }
    this.income = income;
  }

  desiredTips(s) {
    const a = this.alloc[s];
    if (this.energy[s] <= 0) return 0;
    let n = 1 + a.grow * (3 + this.energy[s] / 70);
    if (s === 1) n *= this.rivalMult;
    if (this.energy[s] < 40) n = Math.min(n, 2);
    return Math.min(s === 1 ? 45 : 40, Math.round(n));
  }

  growTips(s) {
    const tips = this.tips[s], want = this.desiredTips(s);
    if (tips.length < want && this.energy[s] > SPAWN_COST && this.connList[s].length) {
      for (let k = 0; k < 2 && tips.length < want; k++) this.spawnTip(s);
    }
    const hy = this.hyph[s], en = this.hyph[1 - s], T = this.terrain, M = this.moist, r = this.rnd;
    for (let k = tips.length - 1; k >= 0; k--) {
      const tip = tips[k];
      const ci = Math.round(tip.y) * W + Math.round(tip.x);
      const m = M[ci] || 0;
      const speed = .07 + .09 * Math.min(1, m * 1.6);
      if (r() > speed) continue;
      if (this.energy[s] < STEP_COST || tip.life-- <= 0 || r() < .004) { tips.splice(k, 1); continue; }
      this.steer(tip, s);
      const nx = tip.x + Math.cos(tip.a), ny = tip.y + Math.sin(tip.a);
      const cx = Math.round(nx), cy = Math.round(ny);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) { tips.splice(k, 1); continue; }
      const i = cy * W + cx, t = T[i];
      if (t === ROCK || t === AIR || t === WATER) { tip.a += Math.PI * (.5 + r()); tip.life -= 3; continue; }
      if (t === CLAY && r() < .55) continue;
      this.energy[s] -= hy[i] > 0 ? STEP_COST * .15 : STEP_COST;
      if (en[i] > 0) {
        const res = this.attack(s, hy[Math.round(tip.y) * W + Math.round(tip.x)] || .3, cx, cy, 0);
        if (res !== 'won') { tips.splice(k, 1); continue; }
        if (en[i] > 0) { tip.a += Math.PI * (.6 + r() * .8); continue; }
      }
      if (hy[i] <= 0) { hy[i] = .3; this.enter(s, i); } else hy[i] = Math.min(1, hy[i] + .05);
      tip.x = nx; tip.y = ny;
      if (r() < .04 && tips.length < want) tips.push({ x: tip.x, y: tip.y, a: tip.a + (r() < .5 ? -1 : 1) * (.6 + r() * .7), life: 25 + r() * 60 });
    }
  }

  // One colony's tip tries to take cell (cx,cy) from the other. Returns 'won', 'lost' or 'core'.
  attack(s, from, cx, cy, bonus) {
    const i = cy * W + cx, en = this.hyph[1 - s], hy = this.hyph[s], r = this.rnd, e = en[i];
    const atk = from * (1 + 2 * this.alloc[s].def) + this.tox[s][i] * 1.5 + r() * .9 + bonus + (s === 1 ? .15 * this.difficulty : 0);
    const dfn = e * (1 + 2 * this.alloc[1 - s].def) + this.tox[1 - s][i] * 1.5 + r() * .8;
    this.contact++;
    const ec = this.core[1 - s];
    if (cx === ec.x && cy === ec.y) {
      if (atk > dfn + 1) {
        this.coreHp[1 - s]--;
        if (s === 1) this.say(this.coreHp[0] > 0 ? `The rival is attacking your core! (${this.coreHp[0]} left)` : 'Your core has been consumed.');
        else this.say(this.coreHp[1] > 0 ? `You are eating into the rival core! (${this.coreHp[1]} left)` : 'The rival core is consumed.');
        this.fx.push({ type: 'text', x: cx, y: cy, text: s === 0 ? 'core hit!' : 'core under attack!', col: '#ff8a6a' });
        if (this.coreHp[1 - s] <= 0) { this.state = s === 0 ? 'won' : 'lost'; this.result = s === 0 ? 'rival' : 'consumed'; }
      }
      return 'core';
    }
    if (atk > dfn) {
      en[i] = e - .6 > .05 ? e - .6 : 0;
      if (en[i] === 0 && hy[i] === 0) hy[i] = .3;
      if (s === 0) this.stats.fights++;
      if (s === 1 && r() < .02) this.say('The rival is eating into your network!');
      if (s === 0 && r() < .02) this.say('Your hyphae are pushing the rival back.');
      return 'won';
    }
    return 'lost';
  }

  // A colony grew into a fresh cell: anything buried there?
  enter(s, i) {
    if (s !== 0) return;
    const b = this.bonus.get(i); if (!b) return;
    this.bonus.delete(i);
    const x = i % W, y = (i - x) / W, T = this.terrain;
    this.stats.caches++;
    const feedAround = (amt, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (T[j] === SOIL || T[j] === CLAY || T[j] === FOOD) { T[j] = FOOD; this.food[j] += amt; } } };
    if (b === 'seed') { this.energy[0] += 120; this.say('A buried seed, full of starch. +120 energy.'); this.fx.push({ type: 'text', x, y, text: '+120 energy', col: '#ffe27a' }); }
    else if (b === 'bone') { feedAround(60, 1); this.say('An old bone. Slow food, but plenty of it.'); this.fx.push({ type: 'text', x, y, text: 'a bone!', col: '#eee8ce' }); }
    else if (b === 'beetle') { feedAround(90, 1); this.say('A dead beetle. Dinner.'); this.fx.push({ type: 'text', x, y, text: 'dead beetle!', col: '#eee8ce' }); }
    else if (b === 'print') { this.spores[0] += 15; this.say('A spore print from an older colony. +15 spores.'); this.fx.push({ type: 'text', x, y, text: '+15 spores', col: '#fffbe8' }); }
    else { this.say('A coin. Fungi have no use for money.'); this.fx.push({ type: 'text', x, y, text: 'a coin. useless.', col: '#c8c8c8' }); }
    this.fx.push({ type: 'bonus', x, y });
  }

  // ---------- the lead tip: the one you steer ----------
  lead(x, y, start) {
    if (start || !this.pilot) {
      const list = this.connList[0]; let best = -1, bd = 1e9;
      for (const i of list) { const cx = i % W, cy = (i - cx) / W; const d = (cx - x) * (cx - x) + (cy - y) * (cy - y); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      this.pilot = { x: best % W, y: Math.floor(best / W), tx: x, ty: y, t: 0, stuck: 0 };
    } else { this.pilot.tx = x; this.pilot.ty = y; }
  }
  release() {
    const p = this.pilot; if (!p) return;
    this.tips[0].push({ x: p.x, y: p.y, a: Math.atan2(p.ty - p.y, p.tx - p.x), life: 40 });
    this.pilot = null;
  }
  updatePilot() {
    const p = this.pilot, T = this.terrain, hy = this.hyph[0], en = this.hyph[1], r = this.rnd;
    p.t++;
    const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
    if (dist < .7) return;
    const m = this.moist[Math.round(p.y) * W + Math.round(p.x)] || 0;
    if (r() > .28 + .3 * Math.min(1, m * 1.6)) return;
    if (this.energy[0] < STEP_COST) return;
    const a0 = Math.atan2(dy, dx);
    let cx = -1, cy = -1, i = -1;
    for (const da of [0, .8, -.8, 1.5, -1.5]) {
      const a = a0 + da, nx = p.x + Math.cos(a), ny = p.y + Math.sin(a);
      const tx = Math.round(nx), ty = Math.round(ny);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const t = T[ty * W + tx];
      if (t === ROCK || t === AIR || t === WATER) continue;
      cx = tx; cy = ty; i = ty * W + tx; p.nx = nx; p.ny = ny; break;
    }
    if (i < 0) { p.stuck++; return; }
    if (T[i] === CLAY && r() < .4) return;
    if (en[i] > 0) {
      this.energy[0] -= STEP_COST;
      const res = this.attack(0, Math.max(.5, hy[Math.round(p.y) * W + Math.round(p.x)] || .5), cx, cy, .6);
      if (res === 'core') return;
      if (res === 'lost') { this.energy[0] -= 4; return; }
      if (en[i] > 0) return;
    }
    this.energy[0] -= hy[i] > 0 ? STEP_COST * .15 : STEP_COST * 1.2;
    if (hy[i] <= 0) { hy[i] = .5; this.conn[0][i] = 1; this.enter(0, i); } else hy[i] = Math.min(1, hy[i] + .1);
    p.x = p.nx; p.y = p.ny;
  }

  // ---------- abilities ----------
  nearConnected(x, y, rad) {
    const out = [], cn = this.conn[0];
    for (let yy = y - rad; yy <= y + rad; yy++) for (let xx = x - rad; xx <= x + rad; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > rad * rad) continue;
      const i = yy * W + xx; if (cn[i] && this.hyph[0][i] > 0) out.push(i);
    }
    return out;
  }
  surge(x, y) {
    if (this.energy[0] < COSTS.surge) return `Surge needs ${COSTS.surge} energy.`;
    const cells = this.nearConnected(x, y, 5);
    if (!cells.length) return 'Your network has to reach here first.';
    this.energy[0] -= COSTS.surge;
    const r = this.rnd;
    for (let k = 0; k < 8; k++) {
      const i = cells[Math.floor(r() * cells.length)], cx = i % W, cy = (i - cx) / W;
      this.tips[0].push({ x: cx, y: cy, a: Math.atan2(y - cy, x - cx) + (r() - .5) * 2.4, life: 50 + r() * 40 });
    }
    this.fx.push({ type: 'surge', x, y });
    return '';
  }
  toxinBurst(x, y) {
    if (this.energy[0] < COSTS.toxin) return `A toxin burst needs ${COSTS.toxin} energy.`;
    if (!this.nearConnected(x, y, 7).length) return 'Your network has to reach here first.';
    this.energy[0] -= COSTS.toxin;
    const T = this.terrain, tx = this.tox[0], en = this.hyph[1];
    for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y); if (d2 > 17) continue;
      const i = yy * W + xx; if (T[i] === AIR || T[i] === ROCK) continue;
      tx[i] = 1;
      if (en[i] > 0) { const ec = this.core[1]; if (!(ec.x === xx && ec.y === yy)) { en[i] = Math.max(0, en[i] - .5); if (en[i] === 0) this.stats.fights++; } }
    }
    for (const g of this.grubs) if (Math.hypot(g.x - x, g.y - y) < 5.5) { g.hp -= 6; g.hurt = 15; }
    for (const sl of this.slugs) if (Math.abs(sl.x - x) < 5.5 && Math.abs(this.sy[Math.round(sl.x)] - y) < 5.5) { sl.hp -= 6; sl.hurt = 15; }
    this.fx.push({ type: 'toxin', x, y });
    return '';
  }
  fruitAt(x) {
    if (this.energy[0] < COSTS.fruit) return `A mushroom costs ${COSTS.fruit} energy.`;
    let best = -1, bd = 99;
    for (const cx of this.surfaceCands[0]) { const d = Math.abs(cx - x); if (d < bd && d <= 4) { bd = d; best = cx; } }
    if (best < 0) return 'Your network has to touch the surface here.';
    if (this.shrooms.some(m => Math.abs(m.x - best) < 4 && m.phase < 2)) return 'Too close to another mushroom.';
    this.energy[0] -= COSTS.fruit;
    this.shrooms.push({ x: best, side: 0, t: 0, phase: 0, kind: Math.floor(this.rnd() * 3), size: 7 + this.rnd() * 5, flip: this.rnd() < .5, stage: 0 });
    this.stats.shroomsGrown++;
    return '';
  }
  retract(x, y) {
    const hy = this.hyph[0], c = this.core[0]; let n = 0;
    for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || (xx === c.x && yy === c.y)) continue;
      if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > 10) continue;
      const i = yy * W + xx; if (hy[i] > 0) { hy[i] = 0; this.conn[0][i] = 0; this.scent[i] = 0; n++; }
    }
    if (!n) return '';
    this.tips[0] = this.tips[0].filter(t => Math.hypot(t.x - x, t.y - y) > 3.5);
    if (this.pilot && Math.hypot(this.pilot.x - x, this.pilot.y - y) < 3.5) this.pilot = null;
    this.energy[0] += n * .25;
    this.fx.push({ type: 'text', x, y, text: `+${Math.round(n * .25)}`, col: '#9aa894' });
    return '';
  }

  // ---------- slugs raid the surface ----------
  updateSlugs() {
    const r = this.rnd, tod = (this.time % DAY) / DAY, night = tod < .22 || tod > .83, rain = this.weather === 'rain' || this.weather === 'storm';
    const mine = this.shrooms.filter(m => m.side === 0 && m.phase < 2);
    const max = 1 + (this.difficulty > 1 ? 1 : 0);
    if (this.time > TPS * 40 && mine.length && this.slugs.length < max && ++this.slugTimer > TPS * (night || rain ? 20 : 45)) {
      this.slugTimer = 0;
      const left = r() < .5;
      this.slugs.push({ x: left ? 0 : W - 1, dir: left ? 1 : -1, hp: 5, t: 0, hurt: 0, bite: 0 });
      this.say('A slug is sliding toward your mushrooms. Toxins (or a toxin burst) will see it off.');
    }
    for (let k = this.slugs.length - 1; k >= 0; k--) {
      const sl = this.slugs[k]; sl.t++; if (sl.hurt > 0) sl.hurt--;
      let target = null, bd = 1e9;
      for (const m of mine) { const d = Math.abs(m.x - sl.x); if (d < bd) { bd = d; target = m; } }
      if (target && bd < 1.2) {
        sl.bite++;
        target.bitten = (target.bitten || 0) + 1;
        if (target.bitten > 100) { this.shrooms.splice(this.shrooms.indexOf(target), 1); this.say('A slug ate one of your mushrooms.'); this.fx.push({ type: 'text', x: target.x, y: this.sy[target.x] - 3, text: 'munch', col: '#d0b090' }); }
        const i = this.sy[target.x] * W + target.x;
        const dmg = this.tox[0][i] * .08; if (dmg > 0) { sl.hp -= dmg; if (dmg > .01) sl.hurt = 3; }
      } else {
        const dir = target ? Math.sign(target.x - sl.x) : sl.dir;
        sl.x += dir * .09; sl.dir = dir;
        if (sl.x < -2 || sl.x > W + 1) { this.slugs.splice(k, 1); continue; }
      }
      if (sl.hp <= 0) {
        this.slugs.splice(k, 1); this.stats.slugs++;
        const cx = Math.round(Math.max(0, Math.min(W - 1, sl.x))), T = this.terrain;
        for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx; if (xx < 0 || xx >= W) continue; const i = this.sy[xx] * W + xx; if (T[i] === SOIL || T[i] === CLAY || T[i] === FOOD) { T[i] = FOOD; this.food[i] += 50; } }
        this.fx.push({ type: 'grubdeath', x: cx, y: this.sy[cx] - 1 });
        this.say('The slug is dead. Slug is food.');
      }
    }
  }

  checkGoals() {
    const st = this.stats;
    const done = { food: this.reachedFood, root: st.roots > 0, shroom: st.shroomsGrown > 0, cache: st.caches > 0, grub: st.grubs > 0, fight: st.fights >= 25, spores: st.shed >= 50 };
    for (const g of this.goals) {
      if (g.done || !done[g.id]) continue;
      g.done = true; this.spores[0] += g.reward;
      this.say(`Goal: ${g.text}. +${g.reward} spores.`);
      this.fx.push({ type: 'text', x: this.core[0].x, y: this.core[0].y - 2, text: `goal! +${g.reward} spores`, col: '#fffbe8' });
    }
  }

  spawnTip(s) {
    const list = this.connList[s], r = this.rnd, hy = this.hyph[s], T = this.terrain, sc = this.scent;
    let best = null, bv = -1e9;
    for (let k = 0; k < 10; k++) {
      const i = list[Math.floor(r() * list.length)];
      const x = i % W, y = (i - x) / W;
      let v = r() * .5 + this.smell[i] * 1.5;
      if (s === 0) v += sc[i] * 5;
      let frontier = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx, t = T[j];
        if (hy[j] <= 0 && t !== AIR && t !== ROCK && t !== WATER) { frontier++; if (s === 0) v += sc[j] * .8; v += this.smell[j] * .3; }
        if (s === 1 && this.hyph[0][j] > 0) v += this.aggr * .4;
      }
      if (!frontier) v -= 2; else v += .3 + frontier * .15;
      if (v > bv) { bv = v; best = i; }
    }
    if (best == null) return;
    const x = best % W, y = (best - x) / W, c = this.core[s];
    const away = Math.atan2(y - c.y, x - c.x);
    this.energy[s] -= SPAWN_COST;
    this.tips[s].push({ x, y, a: (Math.abs(x - c.x) + Math.abs(y - c.y) < 3 ? r() * 6.283 : away) + (r() - .5) * 1.6, life: 30 + r() * 70 });
  }

  steer(tip, s) {
    const sc = s === 0 ? this.scent : null, T = this.terrain, r = this.rnd;
    let best = -1e9, bestA = tip.a;
    for (let k = -1; k <= 1; k++) {
      const a = tip.a + k * .75;
      const cx = Math.round(tip.x + Math.cos(a) * 2), cy = Math.round(tip.y + Math.sin(a) * 2);
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = cy * W + cx, t = T[i];
      let v = r() * .7;
      if (t === ROCK || t === AIR || t === WATER) v -= 3;
      else {
        v += this.smell[i] * 2.2 + this.moist[i] * .4;
        if (sc) v += sc[i] * 4.5;
        if (this.hyph[s][i] > 0) v -= .9;
        if (this.hyph[1 - s][i] > 0) v += (s === 1 ? this.aggr : .6 * this.alloc[0].def) - .5;
        if (t === FOOD) v += 1;
        if (t === CLAY) v -= .3;
      }
      if (v > best) { best = v; bestA = a; }
    }
    tip.a = bestA + (r() - .5) * .45;
  }

  // ---------- grubs ----------
  updateGrubs() {
    const r = this.rnd, T = this.terrain;
    const max = Math.round(1 + this.difficulty * .5 + this.plot.grubs);
    if (this.time > TPS * 20 && ++this.grubTimer > (TPS * 18) / this.plot.grubs && this.grubs.length < max) {
      this.grubTimer = 0;
      const left = r() < .5, x = left ? 0 : W - 1;
      let y = this.sy[x] + 4 + Math.floor(r() * (H * .6));
      for (let k = 0; k < 20 && (T[y * W + x] === ROCK || T[y * W + x] === WATER); k++) y = this.sy[x] + 4 + Math.floor(r() * (H * .6));
      this.grubs.push({ x, y, a: left ? 0 : Math.PI, hp: 7 + this.difficulty * 1.5, maxhp: 7 + this.difficulty * 1.5, t: 0, fed: 0, hurt: 0 });
      this.say('A grub has burrowed in. It eats hyphae.');
    }
    for (let k = this.grubs.length - 1; k >= 0; k--) {
      const g = this.grubs[k];
      g.t++; if (g.hurt > 0) g.hurt--;
      if (g.t % 5) continue;
      // steer toward hyphae
      let best = -1e9, bestA = g.a;
      for (let j = -1; j <= 1; j++) {
        const a = g.a + j * .8;
        const cx = Math.round(g.x + Math.cos(a) * 1.5), cy = Math.round(g.y + Math.sin(a) * 1.5);
        let v = r() * .6 - (j ? .05 : 0);
        if (cx < 0 || cx >= W) v += .2; // allowed to leave
        else if (cy < 0 || cy >= H) v -= 5;
        else {
          const i = cy * W + cx, t = T[i];
          if (t === AIR || t === ROCK || t === WATER) v -= 5;
          else v += (this.hyph[0][i] + this.hyph[1][i]) * 3 - (this.tox[0][i] + this.tox[1][i]) * 1.5;
        }
        if (v > best) { best = v; bestA = a; }
      }
      g.a = bestA + (r() - .5) * .3;
      if (best < -3) { g.a += Math.PI * (.5 + r()); continue; }
      const nx = g.x + Math.cos(g.a), ny = g.y + Math.sin(g.a);
      const cx = Math.round(nx), cy = Math.round(ny);
      if (cx < 0 || cx >= W) { this.grubs.splice(k, 1); continue; }
      if (cy < 0 || cy >= H) { g.a = -g.a; continue; }
      const i = cy * W + cx, t = T[i];
      if (t === AIR || t === ROCK || t === WATER) { g.a += Math.PI * (.5 + r()); continue; }
      g.x = nx; g.y = ny;
      let ate = false, bitYou = this.hyph[0][i] > 0;
      for (let s = 0; s < 2; s++) {
        if (this.hyph[s][i] > 0) {
          this.hyph[s][i] = Math.max(0, this.hyph[s][i] - .35);
          const coreI = this.core[s].y * W + this.core[s].x;
          if (i === coreI) this.hyph[s][i] = 1;
          ate = true;
          const dmg = (this.tox[0][i] + this.tox[1][i]) * 2.2;
          if (dmg > .05) { g.hp -= dmg; g.hurt = 10; }
        }
      }
      if (ate) {
        g.fed = 40;
        if (bitYou && r() < .02) this.say('A grub is chewing through your network.');
        // remove tips it bit through
        for (let s = 0; s < 2; s++) this.tips[s] = this.tips[s].filter(tp => Math.abs(tp.x - cx) + Math.abs(tp.y - cy) > 1.5);
      }
      if (g.hp <= 0) {
        this.grubs.splice(k, 1);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (T[j] === SOIL || T[j] === CLAY || T[j] === FOOD) { T[j] = FOOD; this.food[j] += (dx || dy) ? 35 : 70; }
        }
        this.fx.push({ type: 'grubdeath', x: cx, y: cy }); this.stats.grubs++;
        this.say('A grub died of your toxins. Waste not: it is food now.');
      }
    }
  }

  // ---------- fruiting ----------
  updateShrooms() {
    const r = this.rnd, rain = this.weather === 'rain' || this.weather === 'storm';
    for (let s = 0; s < 2; s++) {
      const a = this.alloc[s], cands = this.surfaceCands[s];
      if (a.fruit > .02 && this.energy[s] >= SHROOM_COST + 20 && cands.length) {
        const live = this.shrooms.filter(m => m.side === s && m.phase < 2).length;
        if (live < 12 && r() < a.fruit * .012 * (rain ? 1.8 : 1)) {
          const x = cands[Math.floor(r() * cands.length)];
          if (!this.shrooms.some(m => Math.abs(m.x - x) < 5)) {
            this.energy[s] -= SHROOM_COST;
            this.shrooms.push({ x, side: s, t: 0, phase: 0, kind: Math.floor(r() * 3), size: 6 + r() * 5, flip: r() < .5, stage: 0 });
            if (s === 0) this.stats.shroomsGrown++;
            if (s === 0 && this.shrooms.filter(m => m.side === 0).length === 1) this.say('A mushroom breaks the surface! It will shed spores when grown.');
          }
        }
      }
    }
    const GROW = TPS * 18, SPORE = TPS * 24, WILT = TPS * 7;
    for (let k = this.shrooms.length - 1; k >= 0; k--) {
      const m = this.shrooms[k];
      m.t += rain ? 1.4 : 1;
      if (m.phase === 0) { m.stage = Math.min(1, m.t / GROW); if (m.t >= GROW) { m.phase = 1; m.t = 0; } }
      else if (m.phase === 1) {
        m.stage = 1;
        if (Math.floor(m.t) % 30 === 0) { this.spores[m.side]++; if (!m.side) this.stats.shed++; this.fx.push({ type: 'spore', x: m.x, y: this.sy[m.x], side: m.side, size: m.size }); }
        if (m.t >= SPORE) { m.phase = 2; m.t = 0; }
      } else { m.stage = Math.max(0, 1 - m.t / WILT); if (m.t >= WILT) this.shrooms.splice(k, 1); }
    }
  }

  // ---------- the gardener ----------
  updateSpade() {
    const sp = this.spade; sp.t++;
    if (sp.t === sp.dur) {
      const x0 = Math.max(0, sp.x - 3), x1 = Math.min(W - 1, sp.x + 3), T = this.terrain;
      for (let x = x0; x <= x1; x++) {
        const depth = this.sy[x] + 30;
        for (let y = this.sy[x]; y < depth && y < H; y++) {
          const i = y * W + x;
          for (let s = 0; s < 2; s++) { const ci = this.core[s]; if (ci.x !== x || ci.y !== y) this.hyph[s][i] = 0; }
          this.scent[i] = 0;
          if (T[i] !== ROCK && T[i] !== WATER) { this.dist[i] = 1; if (this.moist[i] > .3) this.moist[i] -= .15; }
        }
      }
      for (let s = 0; s < 2; s++) this.tips[s] = this.tips[s].filter(t => t.x < x0 - 1 || t.x > x1 + 1 || t.y > this.sy[Math.round(t.x)] + 30);
      this.grubs = this.grubs.filter(g => g.x < x0 - 1 || g.x > x1 + 1 || g.y > this.sy[Math.round(g.x)] + 30);
      this.shrooms = this.shrooms.filter(m => m.x < x0 - 1 || m.x > x1 + 1);
      this.fx.push({ type: 'dig', x: sp.x, y: this.sy[sp.x] });
      this.say('The spade cut through the soil. Severed hyphae will wither.');
    }
    if (sp.t > sp.dur + 40) this.spade = null;
  }

  rivalAI() {
    const a = this.alloc[1];
    const def = Math.max(.25, Math.min(.6, .25 + this.contact * .01));
    a.def = def; a.fruit = .1; a.grow = 1 - def - .1;
    this.contact = Math.floor(this.contact * .5);
  }

  checkEnd() {
    if (this.time < TPS * 8) return;
    if (this.spores[0] >= this.sporeTarget) { this.state = 'won'; this.result = 'spores'; return; }
    if (this.time > TPS * 60 && this.hyphCount[1] <= 2 && this.tips[1].length === 0 && this.energy[1] < 60) { this.state = 'won'; this.result = 'rival'; return; }
    if (this.hyphCount[0] <= 2 && this.tips[0].length === 0 && this.energy[0] < 6) { this.state = 'lost'; this.result = 'starved'; }
  }

  // ---------- player input ----------
  paint(cx, cy, erase, strength = 1) {
    const R = 5, sc = this.scent, T = this.terrain;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - cx, y - cy); if (d > R) continue;
      const i = y * W + x;
      if (erase) { sc[i] = Math.max(0, sc[i] - (1 - d / R) * .6); continue; }
      if (T[i] === AIR || T[i] === ROCK) continue;
      sc[i] = Math.min(1, sc[i] + Math.max(.08, 1 - d / R) * strength * (d < 1.5 ? 1 : .35));
    }
  }

  setAlloc(grow, def, fruit) {
    const sum = grow + def + fruit || 1;
    this.alloc[0] = { grow: grow / sum, def: def / sum, fruit: fruit / sum };
  }

  avgMoisture(s = 0) {
    const l = this.connList[s]; if (!l.length) return 0;
    let sum = 0; for (const i of l) sum += this.moist[i];
    return sum / l.length;
  }
}
