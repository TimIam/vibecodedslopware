// One pit stop as a set of overlapping quicktime events. The keyboard is a map of the car:
//   Q E  wheel guns (rear-left, front-left)      A D  rear / front jack (lift, later drop)
//   Z C  wheel guns (rear-right, front-right)    S    fuel (hold, release in the band)
//   X    blower / extinguisher (mash)            W    driver (visor, drink)
//   arrows  nose swap combo                      SPACE  catch the car, then release it
import { carSprite, wheelSprite, noseSprite, crew, rect, ellipse, bar, WHEELS, CAR_W, CAR_H, shade } from './gfx.js';
import { text, measure } from './font.js';
import { BOX_X, Y } from './scene.js';
import { TEAMS, TV, COMPOUNDS } from './data.js';
import { TANK } from './race.js';
import { label as keyLabel } from './options.js';

const ARRIVE_D = 1.7;
const ON_D = 0.55;
const WARM_P = 0.9;
const PATH_LEN = BOX_X + 90;
const ARROWS = ['up', 'down', 'left', 'right'];
const ARROW_CH = { up: '↑', down: '↓', left: '←', right: '→' };

export const KEYMAP = {
  KeyQ: 'q', KeyE: 'e', KeyZ: 'z', KeyC: 'c', KeyA: 'a', KeyD: 'd', KeyS: 's', KeyW: 'w', KeyX: 'x',
  Space: 'space', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};

const s = p => p <= 1 ? p * (1.5 - 0.5 * p) : 1 + (1 - Math.exp(-(p - 1) * 2.2)) * 0.12;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class PitStop {
  constructor({ car, track, compound, fuelNow, fuelNeed, rng, sfx = () => {}, hints = false, external = () => [], keepTyres = false, synthetic = true }) {
    this.car = car;
    this.team = TEAMS[0];
    this.track = track;
    this.mods = new Set(track.mods);
    this.keepTyres = keepTyres;
    this.compound = keepTyres ? car.compound : compound;
    this.oldCompound = car.compound;
    this.worn = car.wear > 0.55 || car.puncture;
    this.r = rng;
    this.sfx = sfx;
    this.hints = hints;
    this.external = external;
    // In a race the pit lane only has the cars that are really in it; practice invents traffic.
    this.synthetic = synthetic;
    this.t = 0;
    this.phase = 'arrive';
    this.clock = 0;
    this.caught = false;
    this.settle = 0;      // seconds of push-back still to do
    this.offset = 0;      // px from the mark where the car stopped
    this.carX = -90; this.carY = Y.laneMid; this.lift = [0, 0];
    this.catchGrade = null;
    this.slick = this.mods.has('slick') || (this.mods.has('rain') && compound === 'wet') ? 0.7 : 1;
    const cold = this.mods.has('cold');
    this.jacks = { a: { st: 'wait', t: 0 }, d: { st: 'wait', t: 0 } };
    this.wheels = WHEELS.map(w => ({ ...w, end: w.id[0] === 'R' ? 'a' : 'd', st: keepTyres ? 'done' : 'wait', mash: 0, need: cold ? 8 : 5, t: 0, misses: 0, perfect: false, warm: null, lock: 0, spin: 0 }));
    const band = this.mods.has('heat') ? 0.5 : 0.8;
    this.fuel = { st: 'wait', level: Math.max(0, fuelNow), lo: fuelNeed, hi: fuelNeed + band, max: TANK + 1, rate: 1.6, spilled: false, t: 0, need: fuelNeed > fuelNow + 0.05 };
    if (!this.fuel.need) this.fuel.st = 'skip';
    // Leaving the tyres on: no wheel work, and the car only goes up at the front for a new nose.
    if (keepTyres) { this.jacks.a.st = 'down'; if (!car.damage) this.jacks.d.st = 'down'; }
    this.repair = car.damage ? { st: 'wait', seq: Array.from({ length: this.mods.has('walls') ? 5 : 4 }, () => ARROWS[Math.floor(rng() * 4)]), idx: 0, lock: 0, t: 0, shake: 0 } : null;
    this.intake = this.mods.has('sand') ? { st: 'wait', n: 0, need: 10 } : null;
    this.fire = null;
    this.driver = { st: 'wait', at: 0.9 + rng() * 1.8, kind: this.mods.has('rain') || this.mods.has('sand') ? 'VISOR' : rng() < 0.5 ? 'DRINK' : 'FIST BUMP', t: 0 };
    this.release = { st: 'wait', unsafe: false, t: 0 };
    this.traffic = [];
    this.nextTraffic = 0.8 + rng() * 1.5;
    this.density = this.mods.has('tightLane') ? 3.0 : 4.6;
    this.fx = [];
    this.pops = [];
    this.bubbles = [];
    this.misses = 0; this.perfects = 0; this.goods = 0;
    this.notes = [];
    this.penalty = 0;
    this.extraTime = 0;
    this.shake = 0;
    this.held = new Set();
  }

  get done() { return this.phase === 'done'; }
  get working() { return this.phase === 'work' || this.phase === 'release'; }
  center() { return [this.carX, this.carY]; }

  pop(txt, x, y, color = '#fff') {
    if (this.pops.some(p => p.txt === txt && p.t < 0.6)) return;
    // stack above any popup still on screen in the same spot
    const w = measure(txt);
    for (let k = 0; k < 6 && this.pops.some(p => p.t < 1 && Math.abs(p.x - x) < (w + measure(p.txt)) / 2 + 2 && Math.abs(p.y - p.t * 7 - y) < 9); k++) y -= 9;
    this.pops.push({ txt, x, y, color, t: 0 });
  }
  grade(err, perfect, good) {
    const a = Math.abs(err);
    if (a <= perfect) { this.perfects++; return 'perfect'; }
    if (a <= good) { this.goods++; return 'good'; }
    this.misses++;
    return 'miss';
  }

  // ------------------------------------------------------------ input
  press(k) {
    if (this.held.has(k)) return;
    this.held.add(k);
    if (this.phase === 'arrive') { if (k === 'space') this.catchCar(); return; }
    if (this.phase !== 'work' && this.phase !== 'release') return;
    const settled = this.settle <= 0;
    if (k === 'space') return this.tryRelease();
    if (!settled) { if (k !== 's') this.buzz('HOLD ON'); return; }
    if (k === 'a' || k === 'd') return this.jack(k);
    if (k === 's') return this.fuelDown();
    if (k === 'x') {
      if (this.fire && this.fire.st === 'on') return this.douse();
      if (this.intake && this.intake.st !== 'done') return this.blow();
      return;
    }
    if (k === 'w') return this.driverTap();
    if (ARROWS.includes(k)) return this.combo(k);
    const w = this.wheels.find(w => w.key === k);
    if (w) this.wheel(w);
  }

  releaseKey(k) {
    this.held.delete(k);
    if (k === 's' && this.fuel.st === 'fill') this.fuelUp();
  }

  buzz(msg) { this.sfx('buzz'); if (msg) this.pop(msg, this.carX, this.carY - 4, '#ff6a5a'); }

  catchCar() {
    const p = this.t / ARRIVE_D;
    if (p < 0.5) return;
    const err = (p - 1) * ARRIVE_D * 0.5;
    const g = this.grade(err, 0.05, 0.13);
    this.catchGrade = g;
    this.stopCar(p);
    this.pop(g === 'perfect' ? 'PERFECT STOP' : g === 'good' ? 'GOOD STOP' : p < 1 ? 'SHORT!' : 'OVERSHOT!', BOX_X - 112, Y.box - 4, g === 'miss' ? '#ff6a5a' : g === 'perfect' ? '#7cff8a' : '#ffe27a');
    this.sfx(g === 'miss' ? 'miss' : g);
  }

  stopCar(p) {
    this.phase = 'work';
    this.caught = true;
    this.sfx('brake');
    this.offset = (s(p) - 1) * PATH_LEN;
    const a = Math.abs(this.offset);
    this.settle = a > 3 ? 0.25 + a / 70 : 0;
    if (this.settle) this.notes.push(this.offset < 0 ? 'stopped short' : 'overshot the mark');
    if (this.offset > 18) { this.pop('OOF! LOU GOT BUMPED', BOX_X + 60, Y.box + 40, '#ffb070'); this.shake = 0.3; }
    this.clock = 0;
  }

  jack(k) {
    const j = this.jacks[k];
    const end = this.wheels.filter(w => w.end === k);
    if (j.st === 'wait') { j.st = 'in'; j.t = 0; this.sfx('jack'); return; }
    if (j.st === 'up') {
      const busy = end.some(w => w.st !== 'done') || (k === 'd' && this.repair && this.repair.st !== 'done');
      if (busy) return this.buzz(k === 'a' ? 'REAR NOT DONE' : 'FRONT NOT DONE');
      j.st = 'drop'; j.t = 0; this.sfx('drop');
    }
  }

  wheel(w) {
    if (w.lock > 0) return;
    if (this.jacks[w.end].st !== 'up') return this.buzz(w.end === 'a' ? 'REAR JACK FIRST (A)' : 'FRONT JACK FIRST (D)');
    if (w.st === 'wait') { w.st = 'off'; w.mash = 1; this.sfx('gun', 0); w.spin += 1; return; }
    if (w.st === 'off') {
      w.mash++; w.spin += 1;
      this.sfx('gun', w.mash / w.need);
      this.spark(w, 2);
      if (w.mash >= w.need) { w.st = 'swap'; w.t = 0; this.sfx('whoosh'); }
      return;
    }
    if (w.st === 'warm') {
      const heat = this.heat(w);
      w.warm = heat > 0.8;
      this.pop(w.warm ? 'WARM' : 'COLD', ...this.wheelPos(w), w.warm ? '#ffb05a' : '#8ac8ff');
      this.sfx(w.warm ? 'good' : 'miss');
      if (!w.warm) this.misses++;
      w.st = 'on'; w.t = 0;
      return;
    }
    if (w.st === 'on') {
      const err = (w.t / ON_D - 1) * ON_D;
      const g = this.grade(err, 0.05 * this.slick, 0.12 * this.slick);
      const [px, py] = this.wheelPos(w);
      if (g === 'miss') {
        w.misses++; w.t = 0; w.lock = 0.22;
        this.pop('CROSS-THREAD', px, py, '#ff6a5a');
        this.sfx('miss');
        this.spark(w, 6);
      } else {
        w.st = 'done'; w.perfect = g === 'perfect';
        this.pop(g === 'perfect' ? 'PERFECT' : 'TIGHT', px, py, g === 'perfect' ? '#7cff8a' : '#ffe27a');
        this.sfx('gunTight');
        this.sfx(g);
      }
    }
  }

  heat(w) { return 0.5 - 0.5 * Math.cos(w.t / WARM_P * Math.PI * 2); }

  fuelDown() {
    const f = this.fuel;
    if (f.st === 'skip') return this.buzz('NO FUEL NEEDED');
    if (f.st === 'wait') return this.buzz('HOSE NOT ON');
    if (f.st === 'ready' || f.st === 'idle') { f.st = 'fill'; this.sfx('fuel', 1); }
  }

  fuelUp() {
    const f = this.fuel;
    f.st = 'idle';
    this.sfx('fuel', 0);
    const x = BOX_X + 62, y = Y.box + 57;
    if (f.level < f.lo - 0.05) this.pop('SHORT', x, y, '#ffb070');
    else if (f.level <= f.hi) { this.pop('FUEL OK', x, y, '#7cff8a'); this.sfx('good'); }
  }

  douse() {
    const fi = this.fire;
    fi.n++;
    this.sfx('ext');
    for (let i = 0; i < 6; i++) this.fx.push({ x: this.carX - 4 + (this.r() - 0.5) * 20, y: this.carY + 6, vx: (this.r() - 0.5) * 60, vy: -30 - this.r() * 40, life: 0.6, c: '#f0f4ff', sz: 2 });
    if (fi.n >= fi.need) { fi.st = 'out'; this.pop('FIRE OUT', this.carX, this.carY - 30, '#9ad8ff'); this.sfx('good'); }
  }

  blow() {
    const it = this.intake;
    it.n++;
    this.sfx('blow');
    for (let i = 0; i < 5; i++) this.fx.push({ x: this.carX + 2 + (this.r() - 0.5) * 30, y: this.carY - 8, vx: (this.r() - 0.5) * 120, vy: -20 - this.r() * 50, life: 0.5, c: '#e8c080', sz: 1 });
    if (it.n >= it.need) { it.st = 'done'; this.pop('INTAKES CLEAR', BOX_X - 70, Y.box + 16, '#7cff8a'); this.sfx('good'); }
  }

  driverTap() {
    const d = this.driver;
    if (d.st !== 'show') return;
    d.st = 'done';
    this.bonus = true;
    this.pop(d.kind === 'DRINK' ? 'HYDRATED' : d.kind === 'VISOR' ? 'CLEAN VISOR' : 'BUMP!', this.carX + 2, this.carY + 2, '#7cff8a');
    this.sfx('good');
  }

  combo(k) {
    const r = this.repair;
    if (!r) return;
    if (this.jacks.d.st !== 'up') return this.buzz('FRONT JACK FIRST (D)');
    if (r.st !== 'combo' || r.lock > 0) return;
    if (r.seq[r.idx] === k) {
      r.idx++;
      this.sfx('tick', r.idx / r.seq.length);
      if (r.idx >= r.seq.length) { r.st = 'fit'; r.t = 0; this.sfx('whoosh'); }
    } else { r.lock = 0.22; r.shake = 0.22; this.misses++; this.sfx('miss'); }
  }

  ready() {
    if (this.settle > 0) return false;
    if (this.jacks.a.st !== 'down' || this.jacks.d.st !== 'down') return false;
    if (this.fuel.st === 'wait' || this.fuel.st === 'ready' || this.fuel.st === 'fill') return false;
    if (this.fire && this.fire.st === 'on') return false;
    if (this.intake && this.intake.st !== 'done') return false;
    if (this.extraTime > 0) return false;
    return true;
  }

  danger() {
    const cars = this.traffic.map(c => c.x).concat(this.external());
    let d = 0;
    for (const x of cars) {
      if (x > 140 && x < BOX_X + 80) d = 2;
      else if (x > -60 && x <= 140) d = Math.max(d, 1);
    }
    return d;
  }

  tryRelease() {
    if (!this.ready()) {
      const why = this.fuel.st === 'fill' || this.fuel.st === 'ready' || this.fuel.st === 'wait' ? 'FUEL!' : this.fire && this.fire.st === 'on' ? 'FIRE!' :
        this.intake && this.intake.st !== 'done' ? 'SAND!' : this.jacks.a.st !== 'down' || this.jacks.d.st !== 'down' ? 'CAR STILL UP' : 'NOT READY';
      return this.buzz(why);
    }
    const danger = this.danger();
    this.release.st = 'go'; this.release.t = 0;
    this.release.time = this.clock;
    this.phase = 'leave';
    this.sfx('release');
    if (danger === 2) {
      this.release.unsafe = true;
      this.penalty = 5 / TV;
      this.notes.push('unsafe release');
      this.pop('UNSAFE RELEASE! +5s', this.carX + 30, this.carY - 40, '#ff4a3a');
      this.sfx('crash');
      this.shake = 0.5;
      const near = this.traffic.find(c => c.x > 140 && c.x < BOX_X + 80);
      if (near) near.swerve = 1;
    }
  }

  // ------------------------------------------------------------ positions
  wheelPos(w, dx = 0, dy = 0) {
    return [Math.round(this.carX - CAR_W / 2 + w.x + 7 + dx), Math.round(this.carY - CAR_H / 2 + w.y + 3.5 + dy)];
  }
  fuelPos() { return [BOX_X - 4, Y.box + 26]; }

  spark(w, n) {
    const [x, y] = this.wheelPos(w);
    for (let i = 0; i < n; i++) this.fx.push({ x, y, vx: (this.r() - 0.5) * 90, vy: (this.r() - 0.5) * 90, life: 0.18 + this.r() * 0.15, c: this.r() < 0.5 ? '#ffe27a' : '#ffffff', sz: 1 });
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.t += dt;
    if (this.shake > 0) this.shake -= dt;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 1.1);
    for (const f of this.fx) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 60 * dt; }
    this.fx = this.fx.filter(f => f.life > 0);
    this.updateTraffic(dt);

    if (this.phase === 'arrive') {
      const p = this.t / ARRIVE_D;
      this.placeCar(s(p));
      if (p > 1.4) {
        this.catchGrade = 'miss'; this.misses++;
        this.pop('OVERSHOT!', BOX_X - 112, Y.box - 4, '#ff6a5a');
        this.sfx('miss');
        this.stopCar(p);
      }
      return;
    }
    if (this.phase === 'leave') {
      const r = this.release;
      r.t += dt;
      const q = r.t / 1.2;
      this.carX = BOX_X + q * q * 420 + q * 60;
      this.carY = Y.box + (Y.laneMid - Y.box) * smooth(q * 1.6);
      if (r.unsafe && q < 0.4) this.carY += Math.sin(r.t * 60) * 1.5;
      if (q >= 1) this.phase = 'done';
      return;
    }
    if (this.phase === 'done') return;
    this.clock += dt;

    // push the car back to the mark
    if (this.settle > 0) {
      this.settle -= dt;
      this.offset *= Math.pow(0.02, dt);
      if (this.settle <= 0) this.offset = 0;
    }
    this.carX = BOX_X + this.offset;
    this.carY = Y.box;
    const settled = this.settle <= 0;

    for (const k of ['a', 'd']) {
      const j = this.jacks[k];
      j.t += dt;
      if (j.st === 'in' && j.t > 0.18) { j.st = 'up'; j.t = 0; }
      if (j.st === 'drop' && j.t > 0.14) { j.st = 'down'; j.t = 0; this.sfx('thud'); }
    }
    this.lift[0] = this.jacks.a.st === 'up' ? 1 : this.jacks.a.st === 'in' ? this.jacks.a.t / 0.18 : 0;
    this.lift[1] = this.jacks.d.st === 'up' ? 1 : this.jacks.d.st === 'in' ? this.jacks.d.t / 0.18 : 0;

    for (const w of this.wheels) {
      w.t += dt;
      if (w.lock > 0) w.lock -= dt;
      if (w.st === 'swap' && w.t > 0.32) { w.st = this.mods.has('cold') ? 'warm' : 'on'; w.t = 0; }
      if (w.st === 'warm' && w.t > 2.4) { w.warm = false; this.misses++; w.st = 'on'; w.t = 0; this.pop('COLD', ...this.wheelPos(w), '#8ac8ff'); }
      if (w.st === 'on' && w.t > ON_D + 0.12 * this.slick + 0.05) { w.t = 0; w.misses++; this.misses++; this.sfx('miss'); this.pop('MISSED', ...this.wheelPos(w), '#ff6a5a'); }
    }

    const f = this.fuel;
    f.t += dt;
    if (f.st === 'wait' && settled && this.clock > 0.25) { f.st = 'ready'; this.sfx('clunk'); }
    if (f.st === 'fill') {
      f.level = Math.min(f.max, f.level + f.rate * dt);
      if (f.level > f.hi) {
        if (!f.spilled) { f.spilled = true; this.notes.push('fuel spill'); this.pop('SPILL!', BOX_X + 62, Y.box + 48, '#ffb070'); this.sfx('miss'); this.misses++; if (!this.mods.has('heat')) this.extraTime = 0.6; }
        if (Math.random() < 0.6) this.fx.push({ x: this.fuelPos()[0] + (Math.random() - 0.5) * 6, y: this.fuelPos()[1] - 8, vx: (Math.random() - 0.5) * 30, vy: 10 + Math.random() * 20, life: 0.5, c: '#d8c040', sz: 1 });
        if (this.mods.has('heat') && !this.fire && f.level > f.hi + 0.12) {
          this.fire = { st: 'on', n: 0, need: 8, t: 0 };
          this.notes.push('fire');
          this.pop('FIRE! MASH X', this.carX, this.carY - 34, '#ff7a3a');
          this.sfx('fire');
        }
      }
    }
    if (this.extraTime > 0) this.extraTime -= dt;
    if (this.fire && this.fire.st === 'on') {
      this.fire.t += dt;
      if (Math.random() < 0.9) this.fx.push({ x: this.carX - 10 + (Math.random() - 0.5) * 22, y: this.carY + 4, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 0.45, c: Math.random() < 0.5 ? '#ff7a2a' : '#ffd23a', sz: 2 });
    }
    if (this.repair) {
      const r = this.repair;
      r.t += dt;
      if (r.lock > 0) r.lock -= dt;
      if (r.shake > 0) r.shake -= dt;
      if (r.st === 'wait' && this.jacks.d.st === 'up') { r.st = 'combo'; r.t = 0; }
      if (r.st === 'fit' && r.t > 0.45) { r.st = 'done'; this.pop('NEW NOSE', this.carX + 40, this.carY - 26, '#7cff8a'); this.sfx('good'); }
    }
    if (this.intake && this.intake.st === 'wait' && settled) this.intake.st = 'on';
    const d = this.driver;
    d.t += dt;
    if (d.st === 'wait' && this.clock > d.at && settled) { d.st = 'show'; d.t = 0; this.sfx('ding'); }
    if (d.st === 'show' && d.t > 1.3) d.st = 'gone';
    if (this.phase === 'work' && this.ready()) { this.phase = 'release'; this.sfx('ding'); }
  }

  placeCar(sv) {
    this.carX = -90 + PATH_LEN * sv;
    this.carY = Y.laneMid + (Y.box - Y.laneMid) * smooth((Math.min(sv, 1) - 0.55) / 0.45);
  }

  updateTraffic(dt) {
    if (this.synthetic && this.phase !== 'arrive' && this.phase !== 'done') {
      this.nextTraffic -= dt;
      if (this.nextTraffic <= 0) {
        const team = TEAMS[1 + Math.floor(this.r() * 4)];
        this.traffic.push({ x: -130, team, spd: 150 + this.r() * 20, swerve: 0 });
        this.nextTraffic = this.density * (0.55 + this.r() * 0.9);
      }
    }
    for (const c of this.traffic) { c.x += c.spd * dt; if (c.swerve > 0) c.swerve -= dt; }
    this.traffic = this.traffic.filter(c => c.x < 700);
  }

  result() {
    const coldTyres = this.wheels.filter(w => w.warm === false).length;
    return {
      time: this.release.time ?? this.clock,
      tv: (this.release.time ?? this.clock) * TV,
      catchGrade: this.catchGrade,
      perfects: this.perfects, misses: this.misses,
      fuel: this.fuel.level, fuelShort: this.fuel.need && this.fuel.level < this.fuel.lo - 0.05,
      spilled: this.fuel.spilled, fire: !!this.fire,
      cold: coldTyres >= 2,
      repaired: !this.repair || this.repair.st === 'done',
      bonus: !!this.bonus,
      unsafe: this.release.unsafe,
      penalty: this.penalty,
      compound: this.compound,
      tyres: !this.keepTyres,
      fuelled: this.fuel.st === 'idle',
      notes: this.notes,
    };
  }

  // ------------------------------------------------------------ draw
  draw(g, T) {
    this.bubbles = [];
    const sh = this.shake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    g.save();
    g.translate(sh, 0);
    for (const c of this.traffic) {
      const spr = carSprite(c.team);
      const y = Y.laneMid - 15 - (c.swerve > 0 ? Math.sin(c.swerve * 9) * 4 : 0);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(c.x - 36), Math.round(y + 4), 76, 26);
      for (const w of WHEELS) g.drawImage(wheelSprite('medium', (T * 30 | 0) % 3), Math.round(c.x - 39 + w.x), Math.round(y - 1 + w.y));
      g.drawImage(spr, Math.round(c.x - 39), Math.round(y - 1));
    }
    const cx = Math.round(this.carX), cy = Math.round(this.carY);
    const working = this.phase === 'work' || this.phase === 'release';
    // crew who stand around the box (idle before the car arrives)
    this.drawCrew(g, T, cx, cy, working);
    this.drawCar(g, T, cx, cy);
    this.drawCrewFront(g, T, cx, cy, working);
    for (const f of this.fx) { g.fillStyle = f.c; g.fillRect(Math.round(f.x), Math.round(f.y), f.sz, f.sz); }
    if (this.fire && this.fire.st === 'on') {
      for (let i = 0; i < 4; i++) ellipse(g, cx - 10 + Math.sin(T * 20 + i) * 6, cy + 2 - i * 3, 6 - i, 4 - i * 0.6, i % 2 ? '#ffd23a' : '#ff6a1a');
    }
    this.drawPrompts(g, T, cx, cy);
    for (const p of this.pops) {
      const a = p.t < 0.8 ? 1 : 1 - (p.t - 0.8) / 0.3;
      if (a <= 0) continue;
      g.globalAlpha = a;
      text(g, p.txt, p.x, p.y - p.t * 7, p.color, { align: 'center', outline: '#0a0a10' });
      g.globalAlpha = 1;
    }
    g.restore();
  }

  drawCar(g, T, cx, cy) {
    const team = this.team;
    const lift = (this.lift[0] + this.lift[1]) / 2;
    const x0 = cx - CAR_W / 2, y0 = cy - CAR_H / 2;
    // shadow grows as the car goes up
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(Math.round(x0 + 2 + lift * 2), Math.round(y0 + 4 + lift * 3), CAR_W - 2, CAR_H - 4);
    const nose = this.repair && this.repair.st !== 'done';
    const noNose = this.repair && this.repair.st === 'fit';
    const spr = carSprite(team, { damaged: nose && !noNose, noNose });
    const moving = this.phase === 'arrive' || this.phase === 'leave';
    for (const w of this.wheels) {
      const on = w.st === 'wait' || w.st === 'off' || w.st === 'done' || w.st === 'on';
      const comp = w.st === 'wait' || w.st === 'off' ? this.oldCompound : this.compound;
      const worn = (w.st === 'wait' || w.st === 'off' || this.keepTyres) && this.worn;
      let wx = x0 + w.x - 1, wy = y0 + w.y - 1 - (w.end === 'a' ? this.lift[0] : this.lift[1]);
      const out = w.id[1] === 'L' ? -1 : 1;
      if (w.st === 'swap') {
        const q = w.t / 0.32;
        // old wheel leaves outward-backward, new one arrives outward-forward
        g.drawImage(wheelSprite(this.oldCompound, 0, this.worn), Math.round(wx - 8 * q), Math.round(wy + out * 12 * q));
        g.drawImage(wheelSprite(this.compound, 0), Math.round(wx + 8 * (1 - q)), Math.round(wy + out * 12 * (1 - q)));
        continue;
      }
      if (w.st === 'warm') {
        g.drawImage(wheelSprite(this.compound, 0), Math.round(wx + 4), Math.round(wy + out * 8));
        // blanket wrapped over the tyre
        rect(g, wx + 3, wy + out * 8, 16, 9, '#0a0a10');
        rect(g, wx + 4, wy + out * 8 + 1, 14, 7, mixHeat(this.heat(w)));
        continue;
      }
      if (on) g.drawImage(wheelSprite(comp, moving ? (T * 40 | 0) % 3 : (w.spin | 0) % 3, worn), Math.round(wx), Math.round(wy));
    }
    g.drawImage(spr, Math.round(x0 - 1), Math.round(y0 - 1 - lift));
    if (noNose) {
      const q = this.repair.t / 0.45;
      g.drawImage(noseSprite(team, false), Math.round(cx + 9 + 30 * (1 - q)), Math.round(y0 - 1 - lift));
      if (q < 0.5) g.drawImage(noseSprite(team, true), Math.round(cx + 9 + 40 * q), Math.round(y0 + 18 + 30 * q));
    }
    // wheel nuts glint when the car is up
    for (const w of this.wheels) {
      if (w.st === 'off' || w.st === 'on') {
        const [nx, ny] = this.wheelPos(w, 0, (w.id[1] === 'L' ? -4 : 4) - (w.end === 'a' ? this.lift[0] : this.lift[1]));
        rect(g, nx - 1, ny - 1, 3, 3, w.st === 'off' ? '#ffd23a' : '#d0d4da');
      }
    }
  }

  drawCrew(g, T, cx, cy, working) {
    const team = this.team;
    const bob = k => Math.round(Math.sin(T * 6 + k) * 0.6);
    // wheel crews: gunner by the wheel, tyre-off and tyre-on either side
    for (const [k, w] of this.wheels.entries()) {
      const top = w.id[1] === 'L';
      const dir = top ? 2 : 0;
      const [wx] = this.wheelPos(w);
      const gy = top ? Y.box - 27 : Y.box + 27;
      const homeX = BOX_X - CAR_W / 2 + w.x + 7;
      const active = working && this.jacks[w.end].st !== 'wait';
      const gx = active ? wx : homeX;
      const reach = w.st === 'off' ? 0.9 + Math.sin(T * 50) * 0.1 : w.st === 'on' ? 0.8 : 0.3;
      crew(g, gx, gy, dir, team, { tool: 'gun', reach, bob: bob(k) });
      // tyre carriers
      const offX = gx - 13, onX = gx + 13, cy2 = top ? gy - 4 : gy + 4;
      const hasOld = w.st === 'swap' || w.st === 'warm' || w.st === 'on' || w.st === 'done';
      crew(g, offX, cy2, dir, team, { tool: hasOld && w.st !== 'swap' ? 'tyre' : null, reach: 0.3, bob: bob(k + 2), toolColor: COMPOUNDS[this.oldCompound].color });
      const hasNew = w.st === 'wait' || w.st === 'off';
      crew(g, onX, cy2, dir, team, { tool: hasNew ? 'tyre' : null, reach: 0.3, bob: bob(k + 4), toolColor: COMPOUNDS[this.compound].color });
    }
    // fuel man and hose from the rig
    const [fx, fy] = this.fuelPos();
    const fuelOn = this.fuel.st === 'ready' || this.fuel.st === 'fill' || (this.fuel.st === 'idle' && this.phase !== 'leave' && this.phase !== 'done');
    const fmy = fuelOn ? fy : fy + 14;
    g.fillStyle = '#2a2a30';
    for (let k = 0; k <= 20; k++) { const t = k / 20; g.fillRect(Math.round(BOX_X + (fx - BOX_X) * t + Math.sin(t * 3) * 4), Math.round(Y.garage + 14 + (fmy - 6 - Y.garage - 14) * t), 2, 2); }
    if (this.fuel.st !== 'skip') crew(g, fx, fmy, 0, team, { tool: 'hose', reach: fuelOn ? 0.9 : 0.2, bob: bob(7) });
    // blower for sand
    if (this.intake) crew(g, cx + 2, Y.box - 30, 2, team, { tool: 'blower', reach: this.intake.st === 'on' ? 0.8 : 0.3, bob: bob(9) });
  }

  drawCrewFront(g, T, cx, cy, working) {
    const team = this.team;
    // jacks: lever arms reach under the car
    const ja = this.jacks.a, jd = this.jacks.d;
    const rearX = (ja.st === 'wait' ? cx - 64 : cx - 52), frontX = (jd.st === 'wait' ? cx + 66 : cx + 54);
    if (working || this.phase === 'arrive') {
      crew(g, rearX, cy, 1, team, { tool: 'jack', reach: ja.st === 'up' ? 0.2 : 0.6 });
      crew(g, frontX, cy, 3, team, { tool: 'jack', reach: jd.st === 'up' ? 0.2 : 0.6 });
    } else {
      crew(g, cx - 64, cy, 1, team, { tool: 'jack', reach: 0.3 });
    }
    // lollipop / release man
    const ready = this.phase === 'release';
    const d = ready ? this.danger() : 0;
    const lolly = this.phase === 'leave' || this.phase === 'done' ? 'green' : ready ? (d === 2 ? 'red' : d === 1 ? 'amber' : 'green') : 'red';
    crew(g, BOX_X + 76, Y.box - 30, 3, team, { tool: 'lolly', lolly, reach: 0.6 });
    // wing crew
    if (this.repair && this.repair.st !== 'done') {
      crew(g, BOX_X + 48, Y.box - 24, 2, team, { reach: this.repair.st === 'combo' ? 0.8 : 0.3 });
      crew(g, BOX_X + 48, Y.box + 24, 0, team, { reach: this.repair.st === 'combo' ? 0.8 : 0.3 });
    }
    // extinguisher
    if (this.fire) {
      const q = Math.min(1, this.fire.t / 0.4);
      crew(g, BOX_X + 14, Y.garage + 10 - q * 10, 0, team, { tool: 'ext', reach: 0.9 });
    }
  }

  // The crew waiting in their spots with no car in the box.
  drawIdle(g, T) {
    this.bubbles = [];
    this.drawCrew(g, T, BOX_X, Y.box, false);
    const team = this.team;
    crew(g, BOX_X - 64, Y.box, 1, team, { tool: 'jack', reach: 0.3 });
    crew(g, BOX_X + 66, Y.box, 3, team, { tool: 'jack', reach: 0.3 });
    crew(g, BOX_X + 76, Y.box - 30, 3, team, { tool: 'lolly', lolly: 'red', reach: 0.6 });
  }

  bubble(g, x, y, key, { label, prog, color = '#ffffff', urgent = false, held = false, T = 0, up = false, always = false } = {}) {
    const ch = keyLabel(key); // the player's binding, see Options
    const w = Math.max(11, measure(ch) + 6), h = 11;
    const bx = Math.round(x - w / 2), by = Math.round(y - h / 2);
    const pulse = urgent && (T * 4 % 1) < 0.5;
    rect(g, bx - 1, by - 1, w + 2, h + 3, '#05060a');
    rect(g, bx, by + (held ? 1 : 0), w, h, held ? '#8a8e98' : pulse ? '#ffe27a' : color);
    rect(g, bx, by + h - 2 + (held ? 1 : 0), w, 2, held ? '#5a5e68' : shade(pulse ? '#ffe27a' : color, -0.35));
    text(g, ch, x, by + 2 + (held ? 1 : 0), '#0a0a10', { align: 'center' });
    if (prog != null) bar(g, bx - 2, by + h + 3, w + 4, 4, prog, '#ffd23a');
    if (label && (this.hints || always)) text(g, label, x, up ? by - 10 : by + h + (prog != null ? 9 : 3), '#ffffff', { align: 'center', outline: '#0a0a10' });
    this.bubbles.push({ x: bx - 4, y: by - 4, w: w + 8, h: h + 10, key });
  }

  ringDraw(g, x, y, q, perfectWin, color) {
    // shrinking ring: target circle radius 7, ring from 22 to 7 as q goes 0..1
    const r = 7 + (1 - q) * 15;
    circle(g, x, y, 7, perfectWin ? '#7cff8a' : '#ffffff');
    circle(g, x, y, Math.max(1, r), color);
  }

  drawPrompts(g, T, cx, cy) {
    if (this.phase === 'arrive') {
      const p = this.t / ARRIVE_D;
      if (p > 0.25) {
        const q = Math.min(1.2, p);
        this.ringDraw(g, BOX_X + 44, Y.box, Math.min(1, q), Math.abs(p - 1) < 0.06, p > 1 ? '#ff6a5a' : '#ffe27a');
        this.bubble(g, BOX_X + 44, Y.box - 30, 'space', { label: 'STOP ON THE RING', urgent: p > 0.8, T, up: true, always: true });
      }
      return;
    }
    if (this.phase !== 'work' && this.phase !== 'release') return;
    const settled = this.settle <= 0;
    if (!settled) { text(g, 'PUSHING BACK...', cx, cy - 50, '#ffb070', { align: 'center', outline: '#0a0a10' }); return; }
    // jacks
    for (const k of ['a', 'd']) {
      const j = this.jacks[k];
      const x = k === 'a' ? cx - 66 : cx + 70;
      const endDone = this.wheels.filter(w => w.end === k).every(w => w.st === 'done') && (k === 'a' || !this.repair || this.repair.st === 'done');
      if (j.st === 'wait') this.bubble(g, x, cy - 14, k, { label: 'LIFT', urgent: true, T, up: true });
      else if (j.st === 'up' && endDone) this.bubble(g, x, cy - 14, k, { label: 'DROP', urgent: true, T, color: '#9ad8ff', up: true });
    }
    // wheels: bubbles sit outboard of each corner
    for (const w of this.wheels) {
      const top = w.id[1] === 'L';
      const [wx, wy] = this.wheelPos(w);
      const bx = wx + (w.id[0] === 'R' ? -12 : 12), by = top ? cy - 46 : cy + 46;
      if (this.jacks[w.end].st !== 'up') continue;
      if (w.st === 'wait') this.bubble(g, bx, by, w.key, { label: 'GUN', T, up: top });
      if (w.st === 'off') this.bubble(g, bx, by, w.key, { prog: w.mash / w.need, label: 'MASH', held: this.held.has(w.key), T, up: top });
      if (w.st === 'warm') {
        const h = this.heat(w);
        this.bubble(g, bx, by, w.key, { label: 'PEAK', T, color: h > 0.8 ? '#ffb05a' : '#ffffff', up: top });
        const mx = bx + (w.id[0] === 'R' ? -12 : 9);
        bar(g, mx, by - 6, 4, 13, 1, '#000');
        rect(g, mx + 1, by - 5 + Math.round(11 * (1 - h)), 2, Math.round(11 * h), h > 0.8 ? '#ff5a2a' : '#ffb05a');
        rect(g, mx - 1, by - 5 + 2, 6, 1, '#ffffff');
      }
      if (w.st === 'swap' || w.st === 'warm' || w.st === 'on') {
        rect(g, bx - 1, by + (top ? 8 : -10), 3, 3, COMPOUNDS[this.compound].color);
      }
      if (w.st === 'on') {
        const q = Math.min(1, w.t / ON_D);
        this.ringDraw(g, wx, wy + (top ? -4 : 4), q, Math.abs(w.t - ON_D) < 0.05 * this.slick, w.lock > 0 ? '#ff6a5a' : '#ffe27a');
        this.bubble(g, bx, by, w.key, { label: 'RING', T, up: top });
      }
      if (w.st === 'done') { rect(g, bx - 3, by - 3, 7, 7, '#05060a'); rect(g, bx - 2, by - 2, 5, 5, w.perfect ? '#7cff8a' : '#3ab04a'); }
    }
    // fuel: S under the car, horizontal gauge below it
    const f = this.fuel;
    if (f.st !== 'skip' && f.st !== 'wait') {
      const fx = cx - 2, fy = cy + 46;
      const gx = fx - 20, gy = fy + 9, gw = 40;
      rect(g, gx - 1, gy - 1, gw + 2, 7, '#05060a');
      rect(g, gx, gy, gw, 5, '#22242c');
      const xOf = v => gx + Math.round(gw * v / f.max);
      rect(g, xOf(f.lo), gy, Math.max(1, xOf(f.hi) - xOf(f.lo)), 5, '#2a7a3a');
      rect(g, gx, gy + 1, xOf(f.level) - gx, 3, f.level > f.hi ? '#ff5a2a' : f.level >= f.lo ? '#7cff8a' : '#d8c040');
      rect(g, xOf(f.lo), gy - 2, 1, 9, '#ffffff');
      if (f.st !== 'idle' || f.level < f.lo - 0.05) {
        this.bubble(g, fx, fy, 's', { held: f.st === 'fill', T, urgent: f.st === 'fill' && f.level >= f.lo });
        if (this.hints) text(g, f.st === 'fill' ? 'LET GO' : 'HOLD', fx, gy + 8, '#ffffff', { align: 'center', outline: '#0a0a10' });
      } else { rect(g, fx - 3, fy - 3, 7, 7, '#05060a'); rect(g, fx - 2, fy - 2, 5, 5, f.level <= f.hi ? '#7cff8a' : '#ffb05a'); }
    }
    // intake / fire on X
    if (this.fire && this.fire.st === 'on') this.bubble(g, cx - 2, cy - 46, 'x', { prog: this.fire.n / this.fire.need, label: 'FIRE! MASH', urgent: true, T, color: '#ff9a7a', up: true, always: true });
    else if (this.intake && this.intake.st === 'on') this.bubble(g, cx - 2, cy - 46, 'x', { prog: this.intake.n / this.intake.need, label: 'BLOW', T, up: true });
    // nose combo, shown over the pit wall ahead of the car
    const r = this.repair;
    if (r && r.st !== 'done' && r.st !== 'fit') {
      const sx = cx + 60 - (r.seq.length * 13) / 2 + (r.shake > 0 ? Math.round(Math.sin(T * 80) * 2) : 0), sy = cy - 70;
      if (r.st === 'wait') text(g, 'NOSE: LIFT THE FRONT', cx + 60, sy + 2, '#ffb070', { align: 'center', outline: '#0a0a10' });
      else r.seq.forEach((k, i) => {
        const done = i < r.idx;
        const x = sx + i * 13, y = sy;
        rect(g, x - 1, y - 1, 12, 12, '#05060a');
        rect(g, x, y, 10, 10, done ? '#3ab04a' : i === r.idx ? (r.lock > 0 ? '#ff6a5a' : '#ffe27a') : '#c8ccd4');
        const lab = keyLabel(k);
        text(g, measure(lab) <= 8 ? lab : ARROW_CH[k], x + 5, y + 2, '#0a0a10', { align: 'center' });
        if (i === r.idx) this.bubbles.push({ x: x - 2, y: y - 2, w: 14, h: 14, key: k });
      });
      if (r.st === 'combo') text(g, 'NOSE SWAP: ARROWS', cx + 60, sy - 10, '#ffffff', { align: 'center', outline: '#0a0a10' });
    }
    // driver
    const d = this.driver;
    if (d.st === 'show') {
      this.bubble(g, cx + 2, cy - 1, 'w', { label: d.kind, urgent: true, T, color: '#9ad8ff', always: true });
      bar(g, cx - 8, cy + 8, 20, 3, 1 - d.t / 1.3, '#9ad8ff');
    }
    // release
    if (this.phase === 'release') {
      const dg = this.danger();
      this.bubble(g, BOX_X + 76, Y.box - 52, 'space', { label: dg === 2 ? 'TRAFFIC!' : dg === 1 ? 'CAR COMING' : 'GO GO GO', urgent: dg === 0, T, color: dg === 2 ? '#ff6a5a' : dg === 1 ? '#ffb05a' : '#7cff8a', always: true });
    }
  }

  // Which bubble key is under a screen point (touch / mouse play)?
  hit(x, y) {
    for (const b of this.bubbles) if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b.key;
    return null;
  }
}

function circle(g, cx, cy, r, color) {
  g.fillStyle = color;
  const n = Math.max(12, Math.round(r * 6));
  let last = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    const k = x + ',' + y;
    if (k !== last) g.fillRect(x, y, 1, 1);
    last = k;
  }
}

function mixHeat(h) {
  const r = Math.round(120 + 135 * h), gg = Math.round(40 + 60 * h), b = Math.round(160 - 120 * h);
  return `rgb(${r},${gg},${b})`;
}
