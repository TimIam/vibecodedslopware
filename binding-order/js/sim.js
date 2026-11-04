// Lock mechanics. Pure logic, no three.js: every lock is a row of spring-loaded "stacks" (pin stacks, wafers,
// levers, tubular pins) that a pick lifts against a shear line while tension rotates the plug, plus a separate
// warded mechanism that only cares about where a skeleton bit can turn.
//
// Units: mm and seconds. Lift y is measured from a stack's rest position in the direction that opens it; a stack
// is aligned when y reaches `need`, and the shear window is [need, need + tol]. Tension T is 0..1.
//
// The model, per substep:
//   * The binding stack is the unset one with the smallest manufacturing offset (`order`). Only it feels the
//     plug's friction; the next one in line feels a little.
//   * The pick is a lever pivoting at the keyway mouth. Its tip chases the hand's target height, but a stack it is
//     pushing resists with spring + friction, and the pick only gets there by flexing: the actual tip height is the
//     highest one where the flex force covers the resistance of everything it is lifting.
//   * A binding stack lifted into its shear window sets: the driver sits on the plug ledge, the key pin goes loose.
//     Push a set key pin on through the shear line while tension is above the jam threshold and it oversets, and
//     the lock is stuck until tension is let off. Light tension lets an overset pin spring back instead.
//   * Security pins add "catches" below the true shear line: a spool's waist reaching the shear line lets the plug
//     rotate further (false set) and then needs lighter tension to push past (counter-rotation).
//   * Too little tension and set drivers fall again; each set pin has its own hold threshold.

export const SUB = 1 / 240;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Piecewise-linear top edge of a pick profile (z measured from the tip along the shaft, back toward the hand).
export function profileFn(top) {
  return z => {
    if (z < top[0][0]) return -Infinity;
    for (let i = 1; i < top.length; i++) {
      if (z <= top[i][0]) {
        const [z0, y0] = top[i - 1], [z1, y1] = top[i];
        const t = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
        return y0 + (y1 - y0) * t;
      }
    }
    return top[top.length - 1][1];
  };
}

// Security pin catches, as lifts below the true shear lift.
// pass: the most tension under which the pin can be pushed on through the catch (the plug has to turn back).
function catchesFor(type, need, hold) {
  if (type === 'spool') return [{ at: need - 1.55, span: 1.0, rot: 2.6, gain: 3.2, kind: 'spool', pass: hold * 2.3 }];
  if (type === 'mushroom') return [{ at: need - 1.2, span: 0.8, rot: 1.6, gain: 2.4, kind: 'mushroom', pass: hold * 2.6 }];
  if (type === 'serrated') return [0.95, 0.62, 0.3].map(d => ({ at: need - d, span: 0.14, rot: 0.3, gain: 1.45, kind: 'serration', pass: 1 }));
  if (type === 'falsegate') return [{ at: need - 1.35, span: 0.55, rot: 1.1, gain: 2.0, kind: 'false gate', pass: hold * 2.4 }];
  return [];
}

export class StackLock {
  /**
   * geo: { family, z: [depth per stack, mm into the lock], rest: pin bottom height at rest, mouthY: pick pivot height,
   *        tipMin, tipMax: allowed tip centreline heights, reach: max insertion depth, sample: contact half width,
   *        dirs?: [+1/-1 per stack] (wafers) }
   * spec: { pins: ['std'|'spool'|...], needs: [lift], tol, mu, spring, hold, jam, kPick, breakF, seed }
   */
  constructor(geo, spec) {
    this.geo = geo;
    this.spec = spec;
    const rnd = mulberry(spec.seed || 1);
    this.rnd = rnd;
    const n = geo.z.length;
    // binding order: a random permutation, with a minimum gap so it is readable
    const ord = [...Array(n).keys()].sort(() => rnd() - 0.5);
    this.stacks = [];
    for (let i = 0; i < n; i++) {
      const type = spec.pins[i] || 'std';
      const need = spec.needs[i];
      this.stacks.push({
        i, z: geo.z[i], need, type, dir: geo.dirs ? geo.dirs[i] : 1,
        order: ord.indexOf(i) * 0.12 + rnd() * 0.04,
        catches: catchesFor(type, need, spec.hold).filter(c => c.at > 0.2),
        y: 0, yd: 0, v: 0, state: 'free', cIdx: -1, cAt: 0,
        hold: spec.hold * (1 + rnd() * 0.6),
        contact: false, push: 0,
      });
    }
    this.T = 0;            // applied tension (chases the hand's target)
    this.theta = 0;        // plug rotation, degrees
    this.thetaKick = 0;    // transient visual kick (sets, false sets, counter-rotation)
    this.tip = { p: 0, h: geo.mouthY, flip: false }; // actual pick tip: depth into lock, centreline height
    this.strain = 0;       // pick flex force
    this.strainT = 0;      // time spent over the break force
    this.open = false;
    this.events = [];      // drained by the game for sound/feedback: {type, i}
    this.binding = -1;
    this.stats = { sets: 0, oversets: 0, falseSets: 0, drops: 0 };
    this.toolProfile = null;
    this.selected = 0;     // tubular: which feeler is in hand
    this._flipPrev = false;
  }

  setTool(tool) {
    this.toolProfile = tool ? profileFn(tool.top) : null;
    this.tool = tool;
  }

  emit(type, i, extra) { this.events.push({ type, i, ...extra }); }

  // Pick top surface height at depth d (mm into the lock) for tip pose (p, h).
  surface(d, p, h) {
    const g = this.geo;
    if (!this.toolProfile) return -Infinity;
    if (d > p + 0.6) return -Infinity;
    const t = p > 0.01 ? clamp(d / p, 0, 1) : 1;
    const yc = g.mouthY + (h - g.mouthY) * t;
    const prof = this.toolProfile(p - d);
    if (prof === -Infinity) return -Infinity;
    return yc + prof;
  }

  // How far the pick, posed at (p, h), lifts stack s from its rest position (in its open direction).
  contactLift(s, p, h, flip) {
    const g = this.geo;
    if (g.family === 'tubular') return s.i === this.selected ? h : -Infinity;
    if ((s.dir < 0) !== !!flip) return -Infinity;
    let best = -Infinity;
    const hw = g.sample;
    for (let k = -2; k <= 2; k++) {
      const d = s.z + hw * k / 2;
      // flipped: everything is worked in mirrored space (h is already mirrored by the caller)
      const y = this.surface(d, p, h);
      if (y > best) best = y;
    }
    if (best === -Infinity) return -Infinity;
    return best - g.rest;
  }

  bindingIndex() {
    let bi = -1, bo = Infinity;
    for (const s of this.stacks) {
      if (s.state === 'over') return s.i;
      if (s.state === 'set') continue;
      if (s.order < bo) { bo = s.order; bi = s.i; }
    }
    return bi;
  }

  friction(T) { return this.spec.mu * 10 * Math.pow(T, 1.35); }

  // Force needed to lift stack s any further right now.
  resist(s, T, binding) {
    const sp = this.spec;
    if (s.state === 'set') {
      // loose key pin; pushing it past the shear line jams it (overset) under real tension
      return 0.02;
    }
    if (s.state === 'over') return Infinity;
    let F = sp.spring * (1 + s.y * 0.6);
    if (binding) {
      let f = this.friction(T);
      if (s.state === 'caught') {
        const ct = s.catches[s.cIdx];
        if (T > ct.pass) return Infinity;      // the lip is pinned against the plug: let the tension off a little
        f *= ct.gain;
      }
      F += f;
    } else if (s.i === this.next) F += this.friction(T) * 0.12;
    return F;
  }

  /** input: { p, h, T, flip, select } targets from the hand. */
  step(dt, input) {
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(SUB, left);
      this.substep(h, input);
      left -= h;
    }
  }

  substep(dt, inp) {
    const g = this.geo, sp = this.spec;
    if (this.open) return;
    // tension chases the target (the finger is not instant)
    this.T += (clamp(inp.T, 0, 1) - this.T) * Math.min(1, dt * 18);
    const T = this.T;
    if (g.family === 'tubular' && inp.select !== undefined && inp.select !== this.selected) {
      this.selected = inp.select;
      this.tip.h = Math.max(0, this.stacks[this.selected].state === 'set' ? 0 : this.stacks[this.selected].y);
    }
    const flip = !!inp.flip;
    this.tip.flip = flip;
    this.binding = this.bindingIndex();
    // "next" binder: lightly loaded, gives a hint of feel
    let nx = -1, no = Infinity;
    for (const s of this.stacks) if (s.state !== 'set' && s.i !== this.binding && s.order < no) { no = s.order; nx = s.i; }
    this.next = nx;

    // ---- the pick: depth moves freely (within reach), height is solved against resistance
    const pT = clamp(inp.p, 0, g.reach);
    if (flip !== this._flipPrev) { this.tip.h = -this.tip.h; this._flipPrev = flip; }
    const hT = clamp(flip ? -inp.h : inp.h, g.tipMin, g.tipMax);
    const prevP = this.tip.p;
    this.tip.p += clamp(pT - this.tip.p, -140 * dt, 140 * dt);
    const p = this.tip.p;
    const kP = sp.kPick;
    const forceAt = hh => {
      let F = 0;
      for (const s of this.stacks) {
        const c = this.contactLift(s, p, hh, flip);
        if (c > s.y + 1e-4) {
          const r = this.resist(s, T, s.i === this.binding);
          F += r;
        }
      }
      return F;
    };
    let hA;
    const hPrev = this.tip.h;
    const hTgt = hPrev + clamp(hT - hPrev, -90 * dt, 90 * dt);   // the hand can only move so fast
    if (forceAt(hTgt) <= kP * Math.max(0, hT - hTgt)) hA = hTgt;
    else {
      // largest h in [lo, hTgt] with kP*(hT - h) >= resistance
      let lo = Math.min(hPrev, hTgt), hi = hTgt;
      const ok = hh => kP * (hT - hh) >= forceAt(hh);
      if (!ok(lo)) {
        // even where we were it can't hold: step down until it can
        let l2 = lo;
        for (let k = 0; k < 40 && !ok(l2) && l2 > g.tipMin; k++) l2 -= 0.05;
        lo = Math.max(g.tipMin, l2);
      }
      for (let k = 0; k < 16; k++) {
        const m = (lo + hi) / 2;
        if (ok(m)) lo = m; else hi = m;
      }
      hA = lo;
    }
    this.tip.h = hA;
    this.strain = Math.max(0, kP * (hT - hA)) * (forceAt(hA + 0.02) > 0 ? 1 : 0.3);
    if (g.family === 'tubular') this.strain = Math.max(0, kP * (hT - hA));
    if (this.strain > sp.breakF) {
      this.strainT += dt;
      if (this.strainT > 1.1) { this.emit('snap'); this.strainT = 0; this.broken = true; }
      else if (this.strainT > 0.25 && !this._warned) { this._warned = true; this.emit('bend'); }
    } else { this.strainT = Math.max(0, this.strainT - dt * 2); if (this.strainT === 0) this._warned = false; }

    // ---- stacks
    let anyMoved = 0;
    for (const s of this.stacks) {
      const binding = s.i === this.binding;
      const c = this.contactLift(s, p, hA, flip);
      s.contact = c > s.y - 0.05 && c > -0.5;
      const before = s.y;
      if (s.state === 'set') {
        // driver stays on the ledge while tension holds it; the key pin is loose and rides the pick
        if (T < s.hold) {
          s.state = 'free'; s.yd = s.y; this.stats.drops++;
          this.emit('drop', s.i);
          continue;
        }
        const target = Math.max(0, c);
        if (target > s.y) s.y = target; else s.y = Math.max(target, s.y - 160 * dt);
        if (s.y > s.need + sp.tol + 0.05) {
          if (T >= sp.jam) {
            // pushing a set key pin on into the shell: it jams at the shear line
            s.state = 'over'; this.stats.oversets++; this.emit('overset', s.i);
          } else s.yd = Math.max(s.need, s.y);   // light tension: the driver rides up, then drops back on the ledge
        } else s.yd = s.need;
        continue;
      }
      if (s.state === 'over') {
        // jammed key pin: stays put until tension is let off enough
        if (T < sp.jam * 0.5) {
          s.state = 'set'; s.yd = s.need; this.emit('unjam', s.i);
        }
        const target = Math.max(0, c);
        if (target > s.y) s.y = target;
        s.yd = s.y;
        continue;
      }
      // free / caught
      const F_s = sp.spring * (1 + s.y * 0.6);
      let F_f = binding ? this.friction(T) * (s.state === 'caught' ? s.catches[s.cIdx].gain : 1) : (s.i === this.next ? this.friction(T) * 0.12 : 0.01);
      // a binding key pin sitting above the shear line is only held there by heavy tension (that is an overset)
      if (binding && s.state === 'free' && s.y > s.need + sp.tol && T < sp.jam) F_f = 0;
      if (c > s.y) {
        s.y = c;
      } else {
        const floor = Math.max(0, c);
        if (s.state === 'caught') {
          const ct = s.catches[s.cIdx];
          if (T < s.hold) { s.state = 'free'; s.cIdx = -1; this.emit('drop', s.i); }
          else s.y = Math.max(floor, Math.max(ct.at, s.y - 160 * dt));
        } else if (F_s > F_f) {
          s.y = Math.max(floor, s.y - 160 * dt);
        }
      }
      s.yd = s.y;
      if (Math.abs(s.y - before) > 0.002) anyMoved++;
      if (!binding || T < 0.03) {
        if (s.state === 'caught') { s.state = 'free'; s.cIdx = -1; }
        continue;
      }
      // catches (security pins) below the true shear lift
      if (s.state === 'free') {
        for (let k = 0; k < s.catches.length; k++) {
          const ct = s.catches[k];
          if (before < ct.at && s.y >= ct.at) {
            s.state = 'caught'; s.cIdx = k;
            s.y = Math.min(s.y, ct.at + 0.04);   // the lip catches on the plug edge
            this.stats.falseSets++;
            this.thetaKick += ct.rot;
            this.emit(ct.kind === 'serration' ? 'serration' : 'falseset', s.i, { kind: ct.kind });
            break;
          }
        }
      } else if (s.state === 'caught') {
        const ct = s.catches[s.cIdx];
        if (s.y >= ct.at + ct.span) {
          s.state = 'free'; s.cIdx = -1;
          this.emit('counter', s.i, { kind: ct.kind });
        } else if (s.y < ct.at - 0.2) { s.state = 'free'; s.cIdx = -1; }
      }
      const inWin = s.y >= s.need && s.y <= s.need + sp.tol;
      const jumped = before < s.need && s.y > s.need + sp.tol;
      if (s.state === 'free' && T >= Math.max(0.03, sp.hold * 0.8) && (inWin || jumped)) {
        if (inWin) {
          s.state = 'set'; s.yd = s.need; this.stats.sets++;
          this.emit('set', s.i);
          this.thetaKick += 0.5;
        } else if (T >= sp.jam) {
          s.state = 'over'; this.stats.oversets++; this.emit('overset', s.i);
        } else {
          // overshot under light tension: driver pops above, falls back and catches
          s.state = 'set'; s.yd = s.need; this.stats.sets++; this.emit('set', s.i); this.thetaKick += 0.5;
        }
      } else if (s.state === 'free' && T >= sp.jam && s.y > s.need + sp.tol + 0.05) {
        // became the binding pin while already lifted through the shear line
        s.state = 'over'; this.stats.oversets++; this.emit('overset', s.i);
      }
    }
    if (anyMoved) this.scrape = Math.min(1, (this.scrape || 0) + anyMoved * 0.02);
    this.scrape = (this.scrape || 0) * Math.exp(-dt * 8);
    this.pVel = Math.abs(p - prevP) / dt;

    // ---- plug rotation
    const nSet = this.stacks.filter(s => s.state === 'set').length;
    const caught = this.stacks.find(s => s.state === 'caught');
    let th = Math.min(1, T * 6) * 0.35 + nSet * 0.22 + T * 0.4;
    if (caught) {
      const ct = caught.catches[caught.cIdx];
      const prog = clamp((caught.y - ct.at) / ct.span, 0, 1);
      th += ct.rot * (1 - prog);           // counter-rotation as the spool lip is pushed through
    }
    this.thetaKick *= Math.exp(-dt * 6);
    this.theta += (th - this.theta) * Math.min(1, dt * 30);
    if (this.stacks.every(s => s.state === 'set') && T > 0.08) {
      this.open = true;
      this.emit('open');
    }
  }

  /** Tip height in world terms (the sim works flipped picks in mirrored space). */
  get tipY() { return this.tip.flip ? -this.tip.h : this.tip.h; }

  releaseAll() {
    for (const s of this.stacks) { s.state = 'free'; s.cIdx = -1; }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Warded locks: no pins. A skeleton bit turns about the keyhole axis; ward rings fixed at certain depths and radii
// stop any bit that overlaps them; the latch is a spring at (depth, radius) that the bit has to sweep through.
export class WardedLock {
  /** wards: [{z0, z1, r0, r1}] depth (mm into the lock) and radial ranges; latch: {z, r}; reach. */
  constructor(geo, spec) {
    this.geo = geo;
    this.spec = spec;
    this.wards = spec.wards;
    this.latch = spec.latch;
    this.tip = { p: 0, h: 0, flip: false };
    this.angle = 0;     // degrees the bit has turned
    this.T = 0;
    this.open = false;
    this.events = [];
    this.stats = { sets: 0, oversets: 0, falseSets: 0, drops: 0 };
    this.blockedBy = -1;
    this.strain = 0;
    this.strainT = 0;
    this.stacks = [];
    this.theta = 0;
    this.thetaKick = 0;
  }
  setTool(tool) { this.tool = tool; }
  emit(type, i, extra) { this.events.push({ type, i, ...extra }); }
  bitRects(p) {
    const b = this.tool.bit;            // [z0, z1, y0, y1] from the tip back along the shank, radial y
    const rects = [{ z0: p - b[1], z1: p - b[0], r0: b[2], r1: b[3] }];
    const n = this.tool.notch;
    if (n) {
      // notch splits the bit: [z0..notch.z0] full height, [notch.z0..notch.z1] up to notch.y0, rest full height
      rects.length = 0;
      rects.push({ z0: p - n[0], z1: p - b[0], r0: b[2], r1: b[3] });
      rects.push({ z0: p - n[1], z1: p - n[0], r0: b[2], r1: n[2] });
      rects.push({ z0: p - b[1], z1: p - n[1], r0: b[2], r1: b[3] });
    }
    return rects.filter(r => r.z1 > r.z0);
  }
  hits(p) {
    const rs = this.bitRects(p);
    for (let k = 0; k < this.wards.length; k++) {
      const w = this.wards[k];
      for (const r of rs) if (r.z0 < w.z1 && r.z1 > w.z0 && r.r0 < w.r1 && r.r1 > w.r0) return k;
    }
    return -1;
  }
  latchOk(p) {
    const L = this.latch;
    return this.bitRects(p).some(r => L.z >= r.z0 && L.z <= r.z1 && L.r >= r.r0 + 0.3 && L.r <= r.r1);
  }
  step(dt, inp) {
    if (this.open) return;
    this.T += (clamp(inp.T, 0, 1) - this.T) * Math.min(1, dt * 14);
    // depth only changes while the bit is lined up with the keyhole slot
    const pT = clamp(inp.p, 0, this.geo.reach);
    if (this.angle < 6) this.tip.p += clamp(pT - this.tip.p, -120 * dt, 120 * dt);
    else if (Math.abs(pT - this.tip.p) > 0.6) { this.strain = Math.min(10, this.strain + dt * 20); }
    const p = this.tip.p;
    const want = this.T * 110;
    const hit = this.hits(p);
    let lim = 120;
    if (hit >= 0) lim = 10;              // the bit clears the keyhole slot, then meets the ward
    const latch = this.latchOk(p);
    if (!latch && hit < 0) lim = 30;     // turns freely but nothing to catch: spins against the case
    const prev = this.angle;
    this.angle += clamp(Math.min(want, lim) - this.angle, -200 * dt, 200 * dt);
    this.strain = (want > lim + 2) ? Math.min(10, (want - lim) * 0.12) : Math.max(0, this.strain - dt * 10);
    if (prev < lim - 0.5 && this.angle >= lim - 0.5 && want > lim) {
      this.emit(hit >= 0 ? 'ward' : 'spin', hit);
      this.blockedBy = hit;
    }
    if (this.angle < lim - 1) this.blockedBy = -1;
    if (latch && hit < 0 && prev < 40 && this.angle >= 40) this.emit('latch');
    if (latch && hit < 0 && this.angle >= 88) { this.open = true; this.emit('open'); }
    this.theta = this.angle;
  }
}
