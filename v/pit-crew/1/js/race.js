// The race simulation: ten cars lapping a loop, wearing tyres, burning fuel, pitting.
// Distance is measured in laps. Time is real seconds. No DOM.
import { TEAMS, DRIVERS, COMPOUNDS } from './data.js';

export const PIT_IN = 0.93;  // lap fraction where the pit lane splits off
export const PIT_OUT = 0.05; // where it rejoins
export const IN_T = 2.4;     // seconds from pit entry to our box
export const OUT_T = 2.0;    // seconds from the box to the exit
const START_FUEL_MARGIN = 0.8;

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

export class Race {
  constructor(track, { seed = 1, round = 0 } = {}) {
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
    const r = this.r;
    const half = Math.floor(this.laps / 2);
    // Grid: rough pace order with shuffle; our cars land mid-pack.
    const grid = DRIVERS.map((d, i) => ({ i, k: TEAMS[d.team].pace + d.skill * 0.6 + (r() - 0.5) * 0.35 - (d.team === 0 ? round * 0.02 : 0) }))
      .sort((a, b) => a.k - b.k).map(o => o.i);
    this.cars = DRIVERS.map((d, i) => {
      const team = TEAMS[d.team];
      const player = d.team === 0;
      const plan = player ? (i === 0 ? half : (track.mods.includes('doubleStack') ? half : half + 1))
        : Math.max(2, Math.min(this.laps - 2, Math.round(this.laps * 0.5 + (r() - 0.5) * 3)));
      const slot = grid.indexOf(i);
      return {
        i, d, team, player,
        code: d.code, num: d.num,
        base: team.pace * (1 + d.skill * 0.01) + (player ? -round * 0.03 : 0),
        dist: -slot * 0.012,
        compound: 'medium', wear: 0, fuel: plan + START_FUEL_MARGIN + (player ? 0 : 0.6),
        damage: 0, puncture: false, state: 'run', stateT: 0, box: false, plan,
        stops: 0, penalty: 0, finish: null, cold: 0, bonus: 0, outOfFuel: false,
        nextCompound: null, aiStop: 0, react: r() * 1.3, noise: r() * 100, pos: slot + 1, lapsDone: 0,
        dmgRoll: 0,
      };
    });
    this.order = this.cars.slice().sort((a, b) => a.pos - b.pos);
  }

  emit(type, car, extra) { this.events.push({ type, car, ...extra }); }

  lapTime(c) {
    const C = COMPOUNDS[c.compound];
    let f = 1 + C.pace;
    f += c.wear * c.wear * 0.11 + (c.wear > 0.85 ? (c.wear - 0.85) * 0.6 : 0);
    f += Math.max(0, c.fuel) * 0.0025;
    f += c.damage * 0.035;
    f += c.compound === 'wet' ? (1 - this.wet) * 0.07 : this.wet * 0.17;
    if (c.cold > 0) f += 0.035;
    if (c.bonus > 0) f -= 0.006;
    f += Math.sin(this.time * 0.37 + c.noise) * 0.004 + Math.sin(this.time * 1.13 + c.noise * 2) * 0.002;
    let t = c.base * f;
    if (c.outOfFuel) t /= 0.4;
    else if (c.puncture) t /= 0.55;
    return t;
  }

  start() { this.started = true; this.emit('start'); }

  // Is a player car allowed in our box right now?
  boxFree() { return !this.boxBusy; }

  update(dt) {
    if (!this.started || this.over) return;
    this.time += dt;
    const r = this.r;
    // Weather
    const w = this.track.weather[this.weatherIdx];
    const leader = this.order[0];
    if (w && leader.dist >= w.lap) {
      this.wetTarget = w.wet;
      this.weatherIdx++;
      this.emit(w.wet ? 'rain' : 'dry');
    }
    this.wet += Math.sign(this.wetTarget - this.wet) * Math.min(Math.abs(this.wetTarget - this.wet), dt / 9);

    for (const c of this.cars) this.step(c, dt, r);

    // Order: finished cars by finish time, then by distance
    const prev = this.order.map(c => c.i);
    this.order = this.cars.slice().sort((a, b) => {
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
    if (this.chequered && this.cars.every(c => c.finish != null)) this.finishAll();
    if (this.chequered && this.cars.filter(c => c.player).every(c => c.finish != null)) {
      this.overT += dt;
      if (this.overT > 2.5) this.finishAll();
    }
  }

  step(c, dt, r) {
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
        const mism = c.compound === 'wet' ? 1 + (1 - this.wet) * 1.4 : 1;
        c.wear += C.wear * mism * dd;
        c.fuel -= dd;
      }
      if (c.fuel <= 0 && !c.outOfFuel) { c.outOfFuel = true; c.box = true; this.emit('fuelOut', c); }
      if (c.wear > 1.05 && !c.puncture) { c.puncture = true; c.box = true; this.emit('puncture', c); }
      const lapBefore = Math.floor(before), lapNow = Math.floor(c.dist);
      if (lapNow > lapBefore && c.dist > 0.5) this.crossLine(c, lapNow);
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
          compound: this.aiCompound(c), fuel: this.fuelNeed(c) + 0.5, repaired: true, cold: this.track.mods.includes('cold') && r() < 0.3,
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
    if (!c.box && !c.called && c.lapsDone === c.plan - 1 && fr > 0.25 && c.dist > 0) {
      c.box = true; c.called = true;
      this.emit('boxCall', c);
    }
  }

  aiCalls(c, r) {
    if (c.box || c.dist < 0.5) return;
    const lapsLeft = this.laps - c.dist;
    const fr = c.dist - Math.floor(c.dist);
    if (lapsLeft < 1.1) return;
    if (c.lapsDone === c.plan - 1 && c.stops === 0 && fr > 0.3) c.box = true;
    if (this.wet > 0.45 && c.compound !== 'wet' && this.wet - 0.45 > c.react * 0.25) c.box = true;
    if (this.wet < 0.35 && this.wetTarget === 0 && c.compound === 'wet' && c.react < 0.9) c.box = true;
    if (c.damage && fr > 0.5 && c.dmgRoll === 0) { c.dmgRoll = 1; if (r() < 0.55) c.box = true; }
  }

  aiCompound(c) {
    if (this.wetTarget > 0.5 || this.wet > 0.5) return 'wet';
    const left = this.laps - c.dist;
    return left > 6 ? 'hard' : left > 3.5 ? 'medium' : 'soft';
  }

  // Dev's recommendation for a player car in the lane.
  recommend(c) { return this.aiCompound(c); }

  fuelNeed(c) {
    return Math.max(0, Math.min(12, this.laps - Math.ceil(c.dist) + 0.3));
  }

  service(c, { compound, fuel, repaired, cold, bonus, penalty }) {
    c.compound = compound; c.wear = 0; c.puncture = false;
    c.fuel = Math.max(c.fuel, 0) + fuel;
    c.outOfFuel = c.fuel <= 0.05;
    if (repaired) c.damage = 0;
    c.cold = cold ? 1 : 0;
    c.bonus = bonus ? 1 : 0;
    if (penalty) c.penalty += penalty;
    c.stops++;
    c.called = false;
    c.dmgRoll = 0;
    if (c.lapsDone < c.plan) c.plan = 99;
    if (!c.player) c.react = this.r() * 1.3;
  }

  release(c) {
    c.state = 'out'; c.stateT = 0; c.outFrom = c.dist;
    if (this.boxBusy === c) this.boxBusy = null;
  }

  toggleBox(c) {
    if (c.state !== 'run' || c.finish != null) return false;
    if (c.outOfFuel || c.puncture) return c.box;
    c.box = !c.box;
    c.called = true;
    if (!c.box && c.plan === c.lapsDone + 1) c.plan += 1;
    return c.box;
  }

  finishAll() {
    if (this.over) return;
    // Anyone still out there finishes in their projected order.
    const left = this.cars.filter(c => c.finish == null).sort((a, b) => b.dist - a.dist);
    for (const c of left) c.finish = this.time + (this.laps - c.dist) * this.lapTime(c) + (c.state === 'box' ? 3 : 0);
    this.result = this.cars.slice().sort((a, b) => (a.finish + a.penalty) - (b.finish + b.penalty));
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
