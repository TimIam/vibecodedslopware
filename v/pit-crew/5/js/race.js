// The race simulation: ten cars lapping a loop, wearing tyres, burning fuel, pitting.
// Distance is measured in laps. Time is real seconds. No DOM.
import { TEAMS, DRIVERS, COMPOUNDS } from './data.js';

export const PIT_IN = 0.93;  // lap fraction where the pit lane splits off
export const PIT_OUT = 0.05; // where it rejoins
export const IN_T = 2.4;     // seconds from pit entry to our box
export const OUT_T = 2.0;    // seconds from the box to the exit
// One tank and one set of wear rates for every track: a tank lasts 5.5 laps, so even
// the shortest race (11 laps) needs two stops. Stints are planned at up to 4.8 laps.
export const TANK = 5.5;
const STINT = 4.8;
const START_FUEL_MARGIN = 0.8;
const FLAG_SLOW = 1.65;      // lap time multiplier while the white flag is out
// Tyre order matches gfx WHEELS: rear-left, front-left, rear-right, front-right.
export const TYRES = ['RL', 'FL', 'RR', 'FR'];
const LEFT = [true, true, false, false];
const FRONT = [false, true, false, true];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Signed curvature around the lap from the track map (Catmull-Rom loop, arc-length
// sampled): +1 is the tightest left-hander, -1 the tightest right. Each tyre's wear
// multiplier is scaled so that a lap averages 1 across all four, which keeps total wear
// the same on every track; only where it lands changes.
const SAMPLES = 240;
function curveTable(points) {
  const n = points.length, pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let k = 0; k < 20; k++) {
      const t = k / 20, t2 = t * t, t3 = t2 * t;
      const c = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      pts.push([c(0), c(1)]);
    }
  }
  const L = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = L[L.length - 1], at = [];
  let j = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const d = s / SAMPLES * total;
    while (L[j + 1] < d) j++;
    const f = (d - L[j]) / (L[j + 1] - L[j] || 1), a = pts[j], b = pts[(j + 1) % pts.length];
    at.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  // heading change per sample (screen y is down, so a positive turn is clockwise = right)
  const turn = at.map((p, i) => {
    const a = at[(i - 2 + SAMPLES) % SAMPLES], b = at[(i + 2) % SAMPLES];
    const h1 = Math.atan2(p[1] - a[1], p[0] - a[0]), h2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = h2 - h1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return -d; // + = left
  });
  const max = Math.max(...turn.map(Math.abs)) || 1;
  const curv = turn.map(v => v / max);
  // sharp corners count for more than gentle ones; the inside tyres and the fronts work hardest
  const raw = (s, i) => 0.55 + 1.1 * Math.pow(Math.abs(s), 1.3) * ((s > 0) === LEFT[i] ? 1.5 : 0.5) * (FRONT[i] ? 1.25 : 0.8);
  let sum = 0;
  for (const s of curv) for (let i = 0; i < 4; i++) sum += raw(s, i);
  const norm = sum / (SAMPLES * 4);
  return { curv, mult: (dist, i) => raw(curv[Math.floor((((dist % 1) + 1) % 1) * SAMPLES) % SAMPLES], i) / norm };
}

// Evenly spaced stops for the laps left, at least two in a race.
function planStops(laps, from, min = 0) {
  const left = laps - from;
  const n = Math.max(min, Math.ceil(left / STINT) - 1);
  return Array.from({ length: n }, (_, k) => from + Math.round(left * (k + 1) / (n + 1)));
}

const INCIDENTS = ['crash', 'crash', 'crash', 'stranded', 'debris', 'animal', 'oil'];
const RETIRES = { crash: true, stranded: true };

export class Race {
  // flagChance: odds of one white-flag incident this race
  constructor(track, { seed = 1, round = 0, flagChance = 0.25 } = {}) {
    this.track = track;
    this.laps = track.laps;
    this.r = rng(seed);
    this.time = 0;
    this.started = false;
    this.wet = 0;
    this.wetTarget = 0;
    this.weatherIdx = 0;
    this.events = [];
    this.chequered = false;
    this.over = false;
    this.overT = 0;
    this.boxBusy = null; // player car currently in our box
    this.curve = curveTable(track.map);
    this.flag = null;
    const r = this.r;
    this.flagPlan = r() < flagChance ? { lap: this.laps * (0.25 + r() * 0.5), kind: INCIDENTS[Math.floor(r() * INCIDENTS.length)] } : null;
    const base = planStops(this.laps, 0, 2);
    // Grid: rough pace order with shuffle; our cars land mid-pack.
    const grid = DRIVERS.map((d, i) => ({ i, k: TEAMS[d.team].pace + d.skill * 0.6 + (r() - 0.5) * 0.35 - (d.team === 0 ? round * 0.02 : 0) }))
      .sort((a, b) => a.k - b.k).map(o => o.i);
    this.cars = DRIVERS.map((d, i) => {
      const team = TEAMS[d.team];
      const player = d.team === 0;
      // our second car runs a lap behind on strategy unless the track stacks them
      const shift = player ? (i === 1 && !track.mods.includes('doubleStack') ? 1 : 0) : Math.round((r() - 0.5) * 2);
      let plans = base.map(p => Math.max(2, Math.min(this.laps - 1, p + shift)));
      // never shift a stint past what a tank can do
      const legs = [plans[0], ...plans.slice(1).map((p, k) => p - plans[k]), this.laps - plans[plans.length - 1]];
      if (legs.some(l => l > STINT + 0.2 || l < 1)) plans = base.slice();
      const slot = grid.indexOf(i);
      return {
        i, d, team, player,
        code: d.code, num: d.num,
        base: team.pace * (1 + d.skill * 0.01) + (player ? -round * 0.03 : 0),
        dist: -slot * 0.012,
        compound: 'medium', tw: [0, 0, 0, 0], wear: 0, fuel: Math.min(TANK, plans[0] + START_FUEL_MARGIN + (player ? 0 : 0.3)),
        damage: 0, puncture: false, state: 'run', stateT: 0, box: false, plans, called: -1,
        stops: 0, penalty: 0, finish: null, dnf: false, cold: 0, bonus: 0, outOfFuel: false,
        aiStop: 0, react: r() * 1.3, noise: r() * 100, pos: slot + 1, lapsDone: 0, dmgRoll: 0,
      };
    });
    this.order = this.cars.slice().sort((a, b) => a.pos - b.pos);
  }

  emit(type, car, extra) { this.events.push({ type, car, ...extra }); }

  nextPlan(c) { return c.plans.find(p => p > c.lapsDone); }

  lapTime(c) {
    const C = COMPOUNDS[c.compound];
    const avg = (c.tw[0] + c.tw[1] + c.tw[2] + c.tw[3]) / 4;
    let f = 1 + C.pace;
    f += avg * avg * 0.11 + (c.wear > 0.85 ? (c.wear - 0.85) * 0.6 : 0);
    f += Math.max(0, c.fuel) * 0.0025;
    f += c.damage * 0.035;
    f += c.compound === 'wet' ? (1 - this.wet) * 0.07 : this.wet * 0.17;
    if (c.cold > 0) f += 0.035;
    if (c.bonus > 0) f -= 0.006;
    f += Math.sin(this.time * 0.37 + c.noise) * 0.004 + Math.sin(this.time * 1.13 + c.noise * 2) * 0.002;
    let t = c.base * f;
    if (c.outOfFuel) t /= 0.4;
    else if (c.puncture) t /= 0.55;
    if (this.flag) t = Math.max(t, c.base * FLAG_SLOW);
    return t;
  }

  start() { this.started = true; this.emit('start'); }

  // Is a player car allowed in our box right now?
  boxFree() { return !this.boxBusy; }

  update(dt) {
    if (!this.started || this.over) return;
    this.time += dt;
    const r = this.r;
    const leader = this.order[0];
    // Weather
    const w = this.track.weather[this.weatherIdx];
    if (w && leader.dist >= w.lap) {
      this.wetTarget = w.wet;
      this.weatherIdx++;
      this.emit(w.wet ? 'rain' : 'dry');
    }
    this.wet += Math.sign(this.wetTarget - this.wet) * Math.min(Math.abs(this.wetTarget - this.wet), dt / 9);
    this.flags(leader, r);

    for (const c of this.cars) this.step(c, dt, r);

    // Order: finished cars by finish time, then by distance, retirements last
    const prev = this.order.map(c => c.i);
    this.order = this.cars.slice().sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      if (a.finish != null && b.finish != null) return a.finish - b.finish;
      if (a.finish != null) return -1;
      if (b.finish != null) return 1;
      return b.dist - a.dist;
    });
    this.order.forEach((c, k) => {
      const was = prev.indexOf(c.i) + 1;
      c.pos = k + 1;
      if (c.player && this.time > 3 && c.state === 'run' && was !== c.pos) this.emit(c.pos < was ? 'gain' : 'lose', c, { from: was, to: c.pos });
    });
    if (this.chequered && this.cars.every(c => c.finish != null || c.dnf)) this.finishAll();
    if (this.chequered && this.cars.filter(c => c.player).every(c => c.finish != null || c.dnf)) {
      this.overT += dt;
      if (this.overT > 2.5) this.finishAll();
    }
  }

  // White flag: an incident slows the whole field for about a lap and a half, which
  // makes a stop cheap. A crash or a breakdown takes a rival car out of the race.
  flags(leader, r) {
    const fp = this.flagPlan;
    if (fp && !fp.done && leader.dist >= fp.lap && !this.chequered) {
      fp.done = true;
      const pool = this.cars.filter(c => !c.player && !c.dnf && c.state === 'run' && c.finish == null);
      const victim = pool[Math.floor(r() * pool.length)];
      if (victim) {
        if (RETIRES[fp.kind]) { victim.dnf = true; victim.state = 'dnf'; victim.box = false; }
        this.flag = { kind: fp.kind, car: victim, until: leader.dist + 1.4 };
        this.emit('whiteFlag', victim, { kind: fp.kind });
        // rivals due a stop soon take the cheap one now
        for (const c of this.cars) if (!c.player && !c.dnf && c.state === 'run' && (this.nextPlan(c) ?? 99) - c.dist < 2.5 && r() < 0.8) c.box = true;
      }
    }
    if (this.flag && (leader.dist >= this.flag.until || this.chequered)) {
      this.flag = null;
      this.emit('flagEnd');
    }
  }

  step(c, dt, r) {
    if (c.dnf) return;
    if (c.finish != null) { c.dist += dt / 22; return; }
    c.stateT += dt;
    const laps = this.laps;
    if (c.state === 'run') {
      const before = c.dist;
      const v = 1 / this.lapTime(c);
      c.dist += v * dt;
      const dd = c.dist - before;
      if (c.dist > 0) {
        const C = COMPOUNDS[c.compound];
        const mism = c.compound === 'wet' ? 1 + (1 - this.wet) * 0.8 : 1;
        // tyres only scrub at racing speed; a crawl behind the white flag saves them
        const pace = this.flag ? 0.4 : 1;
        for (let i = 0; i < 4; i++) c.tw[i] += C.wear * mism * dd * this.curve.mult(c.dist, i) * pace;
        c.wear = Math.max(c.tw[0], c.tw[1], c.tw[2], c.tw[3]);
        c.fuel -= dd * (this.flag ? 0.5 : 1);
      }
      if (c.fuel <= 0 && !c.outOfFuel) { c.outOfFuel = true; c.box = true; this.emit('fuelOut', c); }
      if (c.wear > 1.05 && !c.puncture) { c.puncture = true; c.box = true; this.emit('puncture', c); }
      const lapBefore = Math.floor(before), lapNow = Math.floor(c.dist);
      if (lapNow > lapBefore && c.dist > 0.5) this.crossLine(c, lapNow);
      if (c.finish != null) return;
      // Pit calls
      if (c.player) this.playerCalls(c);
      else this.aiCalls(c, r);
      // Pit entry
      const fr = c.dist - Math.floor(c.dist);
      const bf = before - Math.floor(before);
      if (c.box && bf < PIT_IN && fr >= PIT_IN && c.dist < laps - 0.2 + (c.outOfFuel || c.puncture ? 1 : 0)) {
        c.state = 'in'; c.stateT = 0; c.box = false; c.inFrom = c.dist;
        this.emit('pitEntry', c);
      }
      else if (c.box && bf < PIT_IN && fr >= PIT_IN && c.player) { c.box = false; this.emit('late', c); }
    } else if (c.state === 'in') {
      const p = Math.min(1, c.stateT / IN_T);
      c.dist = c.inFrom + (Math.ceil(c.inFrom) - c.inFrom) * p;
      if (p >= 1) {
        c.dist = Math.ceil(c.inFrom);
        this.crossLine(c, Math.round(c.dist));
        if (c.finish != null) return;
        if (c.player) {
          if (this.boxFree()) { c.state = 'box'; c.stateT = 0; this.boxBusy = c; this.emit('arrive', c); }
          else { c.state = 'wait'; c.stateT = 0; this.emit('queue', c); }
        } else {
          c.state = 'box'; c.stateT = 0;
          c.aiStop = this.track.par * (0.9 + r() * 0.32) + (c.damage ? 1.6 : 0) + (r() < 0.08 ? 2 + r() * 3 : 0);
          this.emit('rivalPit', c);
        }
      }
    } else if (c.state === 'wait') {
      if (this.boxFree()) { c.state = 'box'; c.stateT = 0; this.boxBusy = c; this.emit('arrive', c); }
    } else if (c.state === 'box') {
      if (!c.player && c.stateT >= c.aiStop) {
        this.service(c, {
          compound: this.aiCompound(c), fuel: Math.max(0, this.fuelNeed(c) + 0.3 - Math.max(0, c.fuel)), repaired: true,
          cold: this.track.mods.includes('cold') && r() < 0.3,
        });
        this.release(c);
      }
    } else if (c.state === 'out') {
      const p = Math.min(1, c.stateT / OUT_T);
      c.dist = c.outFrom + PIT_OUT * p;
      if (p >= 1) { c.state = 'run'; c.stateT = 0; }
    }
  }

  crossLine(c, lap) {
    c.lapsDone = lap;
    if (c.cold > 0) c.cold--;
    if (c.bonus > 0) c.bonus--;
    if (this.track.damage && lap >= 1 && lap < this.laps && !c.damage && this.r() < this.track.damage) {
      c.damage = 1;
      this.emit('damage', c);
    }
    if (lap >= this.laps) {
      if (!this.chequered) { this.chequered = true; this.emit('chequered', c); }
      c.finish = this.time;
      if (c.state === 'in' || c.state === 'wait') c.state = 'run';
      if (c.player) this.emit('finish', c);
      return;
    }
    if (this.chequered) {
      // Everyone behind the leader finishes the next time they cross.
      c.finish = this.time;
      if (c.player) this.emit('finish', c);
      return;
    }
    if (c === this.order[0] && lap === this.laps - 1) this.emit('lastLap', c);
  }

  playerCalls(c) {
    const fr = c.dist - Math.floor(c.dist);
    const next = this.nextPlan(c);
    if (next != null && !c.box && c.called !== next && c.lapsDone === next - 1 && fr > 0.25 && c.dist > 0) {
      c.box = true; c.called = next;
      this.emit('boxCall', c);
    }
  }

  aiCalls(c, r) {
    if (c.box || c.dist < 0.5) return;
    const lapsLeft = this.laps - c.dist;
    const fr = c.dist - Math.floor(c.dist);
    if (lapsLeft < 1.1) return;
    const next = this.nextPlan(c);
    if (next != null && c.lapsDone === next - 1 && fr > 0.3) c.box = true;
    if (c.fuel < 1.15 && lapsLeft > c.fuel) c.box = true;
    if (c.wear > 0.95) c.box = true;
    if (this.wet > 0.45 && c.compound !== 'wet' && this.wet - 0.45 > c.react * 0.25) c.box = true;
    if (this.wetTarget === 0 && c.compound === 'wet' && this.wet < 0.5 - c.react * 0.3) c.box = true;
    if (c.damage && fr > 0.5 && c.dmgRoll === 0) { c.dmgRoll = 1; if (r() < 0.55) c.box = true; }
  }

  // The stops still to come after stopping at lap `from`: the plan as it stands for a
  // planned stop, re-spaced evenly for an unplanned one (rain, damage, the white flag).
  plansAfter(c, from) {
    return c.plans.includes(from) ? c.plans.filter(p => p > from) : planStops(this.laps, from);
  }

  // Laps the next stint has to cover (to the next stop, or the flag).
  stintLaps(c) {
    const from = Math.ceil(c.dist - 0.01);
    return (this.plansAfter(c, from)[0] ?? this.laps) - from;
  }

  aiCompound(c) {
    // follow the forecast, not the puddles: once it is drying, slicks go on
    if (this.wetTarget > 0.5) return 'wet';
    const s = this.stintLaps(c);
    return s > 5.5 ? 'hard' : s > 4 ? 'medium' : 'soft';
  }

  // Dev's recommendation for a player car in the lane.
  recommend(c) { return this.aiCompound(c); }

  // Fuel in the tank after the stop: enough for the next stint plus a splash.
  fuelNeed(c) {
    return Math.max(0, Math.min(TANK, this.stintLaps(c) + 0.4));
  }

  service(c, { compound, tyres = true, fuel, repaired, cold, bonus, penalty }) {
    if (tyres) { c.compound = compound; c.tw = [0, 0, 0, 0]; c.wear = 0; c.puncture = false; }
    c.fuel = Math.max(c.fuel, 0) + fuel;
    c.outOfFuel = c.fuel <= 0.05;
    if (repaired) c.damage = 0;
    c.cold = cold ? 1 : 0;
    c.bonus = bonus ? 1 : 0;
    if (penalty) c.penalty += penalty;
    c.stops++;
    c.dmgRoll = 0;
    // An unplanned stop (rain, damage, the white flag) re-spaces the stops still to come.
    c.plans = this.plansAfter(c, Math.ceil(c.dist - 0.01));
    c.called = -1;
    if (!c.player) c.react = this.r() * 1.3;
  }

  release(c) {
    c.state = 'out'; c.stateT = 0; c.outFrom = c.dist;
    if (this.boxBusy === c) this.boxBusy = null;
  }

  toggleBox(c) {
    if (c.state !== 'run' || c.finish != null || c.dnf) return false;
    if (c.outOfFuel || c.puncture) return c.box;
    c.box = !c.box;
    const next = this.nextPlan(c);
    if (c.box) c.called = next ?? -1;
    // waving off a planned call pushes that stop back a lap
    else if (next != null && next === c.lapsDone + 1) {
      c.plans = c.plans.map(p => (p === next ? Math.min(this.laps - 1, p + 1) : p));
      c.called = next + 1;
    }
    return c.box;
  }

  finishAll() {
    if (this.over) return;
    // Anyone still out there finishes in their projected order; retirements last.
    const left = this.cars.filter(c => c.finish == null && !c.dnf).sort((a, b) => b.dist - a.dist);
    for (const c of left) c.finish = this.time + (this.laps - c.dist) * this.lapTime(c) + (c.state === 'box' ? 3 : 0);
    const key = c => c.dnf ? 1e12 - c.dist : c.finish + c.penalty;
    this.result = this.cars.slice().sort((a, b) => key(a) - key(b));
    this.result.forEach((c, k) => { c.final = k + 1; });
    this.over = true;
    this.emit('over');
  }

  gapToLeader(c) {
    const lead = this.order[0];
    if (c === lead) return 0;
    return (lead.dist - c.dist) * 18;
  }
}
