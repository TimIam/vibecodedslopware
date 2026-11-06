// Mycelium: the colony simulation. Pure logic, no DOM, so `node tools/mycelium-balance.mjs`
// can run thousands of ticks of it to check the economy. game.js draws it.
//
// The world is a side-on cross-section of soil, W x H cells. Each cell has a terrain type,
// a nutrient amount, a moisture level, and for each of the two colonies (0 = you, 1 = the
// rival) a hyphae density and a toxin level. Colonies grow by sending out "tips": little
// agents that walk through the soil one cell at a time and leave hyphae behind them.

export const W = 160, H = 96;
export const AIR = 0, SOIL = 1, CLAY = 2, ROCK = 3, WATER = 4, FOOD = 5;
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
    this.energy = [500, 500 * (1 + 0.2 * difficulty) * (this.plot.rival || 1)];
    this.alloc = [{ grow: .6, def: .2, fruit: .2 }, { grow: .65, def: .25, fruit: .1 }];
    this.core = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.sy = new Int16Array(W);
    this.grubs = [];
    this.shrooms = [];
    this.spores = [0, 0];
    this.sporeTarget = 90 + 30 * difficulty;
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
    this.rivalMult = (1 + 0.12 * difficulty) * (this.plot.rival || 1);
    this.grubTimer = 0;
    this.starving = [false, false];
    this.coreHp = [5, 5];
    this.reachedFood = false;
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
    // cores
    for (let s = 0; s < 2; s++) {
      const cx = Math.round(s === 0 ? W * .18 + r() * W * .12 : W * .7 + r() * W * .12);
      const cy = Math.round(this.sy[cx] + 16 + r() * 22);
      this.core[s] = { x: cx, y: cy };
      blob(cx, cy, 2.6, 2.6, i => { if (inSoil(i)) { T[i] = SOIL; this.food[i] = 0; } });
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
    for (let i = 0; i < N; i++) S[i] = T[i] === FOOD ? Math.min(1, this.food[i] / 70) : 0;
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
        tmp[i] = Math.max(sum / n, t === FOOD ? Math.min(1, this.food[i] / 70) : 0);
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
    this.updateGrubs();
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
      const speed = .06 + .08 * Math.min(1, m * 1.6);
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
      const e = en[i];
      if (e > 0) {
        // fight for the cell
        const from = hy[Math.round(tip.y) * W + Math.round(tip.x)] || .3;
        const atk = from * (1 + 2 * this.alloc[s].def) + this.tox[s][i] * 1.5 + r() * .9 + (s === 1 ? .15 * this.difficulty : 0);
        const dfn = e * (1 + 2 * this.alloc[1 - s].def) + this.tox[1 - s][i] * 1.5 + r() * .8;
        this.contact++;
        const ec = this.core[1 - s];
        if (cx === ec.x && cy === ec.y) {
          if (atk > dfn + 1) {
            this.coreHp[1 - s]--;
            if (s === 1) this.say(this.coreHp[0] > 0 ? `The rival is attacking your core! (${this.coreHp[0]} left)` : 'Your core has been consumed.');
            else this.say(this.coreHp[1] > 0 ? `You are eating into the rival core! (${this.coreHp[1]} left)` : 'The rival core is consumed.');
            if (this.coreHp[1 - s] <= 0) { this.state = s === 0 ? 'won' : 'lost'; this.result = s === 0 ? 'rival' : 'consumed'; }
          }
          tips.splice(k, 1); continue;
        }
        if (atk > dfn) {
          en[i] = e - .6 > .05 ? e - .6 : 0;
          if (en[i] === 0 && hy[i] === 0) hy[i] = .3;
          if (s === 1 && r() < .02) this.say('The rival is eating into your network!');
          if (s === 0 && r() < .02) this.say('Your hyphae are pushing the rival back.');
        } else { tips.splice(k, 1); continue; }
        if (en[i] > 0) { tip.a += Math.PI * (.6 + r() * .8); continue; }
      }
      if (hy[i] <= 0) hy[i] = .3; else hy[i] = Math.min(1, hy[i] + .05);
      tip.x = nx; tip.y = ny;
      if (r() < .04 && tips.length < want) tips.push({ x: tip.x, y: tip.y, a: tip.a + (r() < .5 ? -1 : 1) * (.6 + r() * .7), life: 25 + r() * 60 });
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
    if (this.time > TPS * 20 && ++this.grubTimer > (TPS * 26) / this.plot.grubs && this.grubs.length < max) {
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
        this.fx.push({ type: 'grubdeath', x: cx, y: cy });
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
        if (Math.floor(m.t) % 40 === 0) { this.spores[m.side]++; this.fx.push({ type: 'spore', x: m.x, y: this.sy[m.x], side: m.side, size: m.size }); }
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
