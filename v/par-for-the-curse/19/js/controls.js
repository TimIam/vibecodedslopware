// Control schemes, picked in the Esc menu (or with [ and ]). Three ways to fight and three ways to play a
// golf shot. The first of each is the physical one: the mouse is the club. The others drive the same
// swing from a button, so the club, the hits and what other players see stay the same simulation.
import * as THREE from 'three';

export const FIGHT_MODES = [
  { id: 'raw', name: 'Raw', how: 'Hold left mouse: the mouse is your hands. Wind up one way, rip the other.' },
  { id: 'slash', name: 'Slash', how: 'Hold left mouse to wind up, let go to cut. The cut follows the way you are turning; the mouse keeps looking.' },
  { id: 'brawl', name: 'Brawler', how: 'Click, click, click for a left, right, overhead combo. Hold and let go for a ground smash.' },
];
export const GOLF_MODES = [
  { id: 'feel', name: 'Feel', how: 'The mouse is the club: draw it back, swing it through the ball. A and D aim.' },
  { id: 'flick', name: 'Flick', how: 'Mouse aims. Hold left mouse, pull back for power, flick forward to hit. A crooked flick bends the shot.' },
  { id: 'meter', name: 'Meter', how: 'Mouse aims. Click to start, click for power, click on the line for a straight shot.' },
];

const clamp = THREE.MathUtils.clamp;

/* ---------------- fighting ---------------- */
// A cut is two poses for the hands (sweep toward the golfer's left, lift): where they wind up and where
// they finish. The hands chase them with the club's real weight, so the head still lags and whips.
// Side cuts go at the height you are looking (Fight.lift, set from the camera): look down to sweep the
// turf and the ball, look level for a body shot, look up for the head.
const CUTS = {
  left: { wind: [-1.2, 0], end: [1.25, 0], side: true },      // from the right across to the left
  right: { wind: [1.2, 0], end: [-1.25, 0], side: true },     // backhand
  chop: { wind: [-0.25, 1.5], end: [0.15, -0.38] },    // overhead, down the middle
  upper: { wind: [-0.95, -0.4], end: [0.7, 1.3] },     // low to high
};
export const FIGHT = {
  slash: { windRate: 15, full: 0.55, min: 0.09, auto: 1.3, cut: 0.3, recover: 0.2 },
  brawl: { wind: 0.13, cut: 0.25, recover: 0.08, combo: ['left', 'right', 'chop'], comboGap: 0.9, hold: 0.32, smashFull: 0.9, smashAuto: 1.5 },
  linger: 0.35,        // the club stays in hand this long after a move, so quick attacks don't flap the pose
  flick: 9,            // pixels of recent mouse travel that count as "turning that way"
};
export class Fight {
  constructor(swing) { this.s = swing; this.mv = { x: 0, y: 0 }; this.cancel(); this.combo = 0; this.endT = -9; this.lift = 0; this.onSmash = null; this.onCut = null; }
  cancel() { this.move = null; this.queued = 0; this.held = false; }
  // Recent mouse travel, so a press can tell which way you were turning.
  mouse(dx, dy, dt) { const k = Math.exp(-dt * 12); this.mv.x = this.mv.x * k + dx; this.mv.y = this.mv.y * k + dy; }
  begin(cut, o = {}) { this.move = { cut, phase: 'wind', t: 0, charge: 0, ...o }; }
  press(mode, t) {
    this.held = true;
    if (mode === 1) {
      if (this.move && this.move.phase !== 'recover') return;
      const { x, y } = this.mv, F = FIGHT.flick;
      const cut = Math.abs(y) > Math.abs(x) && Math.abs(y) > F ? (y > 0 ? 'chop' : 'upper') : x > F ? 'right' : 'left';
      this.begin(cut);
    } else if (mode === 2) {
      if (this.move) { this.queued = Math.min(2, this.queued + 1); return; }      // mashing queues up to two more
      if (t - this.endT > FIGHT.brawl.comboGap) this.combo = 0;
      const list = FIGHT.brawl.combo;
      this.begin(list[this.combo++ % list.length], { quick: true });
    }
  }
  release() { this.held = false; }
  // Returns true while the club should be in hand.
  update(mode, dt, t) {
    const m = this.move, s = this.s;
    if (!m) return t - this.endT < FIGHT.linger;
    s.idle = 0; s.idleY = 0;
    m.t += dt;
    const C = CUTS[m.cut], T = s.target;
    if (m.phase === 'wind') {
      let go = false, amt = 1;
      if (mode === 1) {
        const P = FIGHT.slash;
        m.charge = clamp(m.t / P.full, 0, 1); amt = 0.55 + 0.45 * m.charge;
        go = (!this.held && m.t >= P.min) || m.t > P.auto;
      } else {
        const P = FIGHT.brawl;
        // Still holding after a moment: it turns into the smash, wound up overhead until you let go.
        if (m.quick && this.held && m.t > P.hold) { m.quick = false; m.smash = true; m.cut = 'chop'; }
        if (m.smash) { m.charge = clamp((m.t - P.hold) / P.smashFull, 0, 1); go = !this.held || m.t > P.smashAuto; }
        else { amt = 0.9; go = m.t >= P.wind && !this.held || m.t > P.hold + 0.02; }
      }
      const W = CUTS[m.cut].wind, k = 1 - Math.exp(-dt * FIGHT.slash.windRate), ly = CUTS[m.cut].side ? this.lift : 0;
      T.x += (W[0] * amt - T.x) * k; T.y += (W[1] * amt + ly - T.y) * k;
      if (go) { m.phase = 'cut'; m.t = 0; if (this.onCut) this.onCut(m); }
    } else if (m.phase === 'cut') {
      const amt = mode === 1 ? 0.75 + 0.25 * m.charge : 1;
      T.set(C.end[0] * amt, C.end[1] * amt + (C.side ? this.lift : 0));
      const len = mode === 1 ? FIGHT.slash.cut : FIGHT.brawl.cut;
      if (m.t > len) { if (m.smash && this.onSmash) this.onSmash(m.charge); m.phase = 'recover'; m.t = 0; }
    } else {
      const len = mode === 1 ? FIGHT.slash.recover : FIGHT.brawl.recover;
      if (m.t > len || this.queued) {
        this.move = null; this.endT = t;
        if (this.queued && mode === 2) { this.queued--; const list = FIGHT.brawl.combo; this.begin(list[this.combo++ % list.length], { quick: true }); this.held = false; }
        else this.queued = 0;
      }
    }
    return true;
  }
}

/* ---------------- golf ---------------- */
export const ASSIST = {
  back: 1.9, putterBack: 0.7,      // how far round the backswing goes at full power
  side: 0.32,                      // radians a completely missed shot starts off line
  pure: 0.14,                      // this close to perfect is a pure strike
  flick: { pull: 240, start: 26, push: 110, wide: 0.45, slow: 0.5 },     // pixels pulled for full power; pixels and radians for the flick
  meter: { up: 0.95, sweep: 0.8, sweet: 0.15, band: 0.15 },             // seconds to fill, seconds for the marker's return, where the line is
};
export class Assist {
  constructor(swing) { this.s = swing; this.reset(); }
  reset() { this.phase = 'idle'; this.power = 0; this.err = 0; this.bar = 0; this.mark = null; this.t = 0; this.held = false; this.fwd = 0; this.sideTrack = 0; }
  get aiming() { return this.phase === 'idle'; }
  get busy() { return this.phase !== 'idle'; }
  press(mode) {
    this.held = true;
    if (mode === 1) { if (this.phase === 'idle') { this.phase = 'back'; this.pull = this.peak = 0; this.power = 0; } }
    else if (mode === 2) {
      const M = ASSIST.meter;
      if (this.phase === 'idle') { this.phase = 'up'; this.bar = 0; this.dir = 1; this.power = 0; }
      else if (this.phase === 'up') { if (this.bar < 0.04) return; this.power = this.bar; this.phase = 'acc'; this.mark = 1; }
      else if (this.phase === 'acc') { this.err = clamp((this.mark - M.sweet) / M.band, -1, 1); this.fire(); }
    }
  }
  release(mode) {
    this.held = false;
    if (mode !== 1) return;
    if (this.phase === 'back') this.reset();
    else if (this.phase === 'push') this.flickDone();
  }
  // Flick: mouse travel while the button is down (dy is down the screen: toward you).
  mouse(dx, dy) {
    const F = ASSIST.flick;
    if (this.phase === 'back') {
      this.pull = Math.max(0, this.pull + dy); this.peak = Math.max(this.peak, this.pull);
      this.power = clamp(this.peak / F.pull, 0, 1);
      if (this.peak > F.start && this.pull < this.peak - F.start) { this.phase = 'push'; this.fwd = this.peak - this.pull; this.sideTrack = 0; this.t = 0; }
    } else if (this.phase === 'push') {
      this.fwd += Math.max(0, -dy); this.sideTrack += dx;
      if (this.fwd >= F.push) this.flickDone();
    }
  }
  flickDone() {
    const F = ASSIST.flick;
    this.err = clamp(Math.atan2(this.sideTrack, Math.max(20, this.fwd)) / F.wide, -1, 1);
    if (this.fwd < F.push * 0.5) this.power *= 0.7;      // a flick that never got going
    this.fire();
  }
  fire() { this.phase = 'down'; this.t = 0; this.mark = null; }
  update(mode, dt) {
    const s = this.s, putter = s.club.id === 'putter', back = putter ? ASSIST.putterBack : ASSIST.back, M = ASSIST.meter;
    this.t += dt;
    if (this.phase === 'up') {
      this.bar += this.dir * dt / M.up;
      if (this.bar >= 1) { this.bar = 1; this.dir = -1; }
      if (this.bar <= 0 && this.dir < 0) { this.reset(); }
      this.power = this.bar;
    } else if (this.phase === 'acc') {
      this.mark -= dt / M.sweep;
      if (this.mark <= 0) { this.mark = 0; this.err = -1; this.power *= 0.8; this.fire(); }
    } else if (this.phase === 'push' && this.t > ASSIST.flick.slow) this.flickDone();
    // The club shows it: drawn back with the power, through on the shot.
    const T = s.target;
    if (this.phase === 'down' || this.phase === 'follow') T.set(back * Math.max(0.4, this.power), 0);
    else { const want = -back * this.power, k = 1 - Math.exp(-dt * 14); T.x += (want - T.x) * k; T.y = 0; }
  }
  // The shot this power and accuracy make, in the golfer's frame (x down the aim line). fullHead is the
  // head speed of a full physical swing with this club, so all three ways of swinging reach the same distance.
  shot(fullHead) {
    const s = this.s, C = s.club, putter = C.id === 'putter';
    const p = clamp(this.power, 0.02, 1), e = this.err;
    const sp = fullHead * C.smash * Math.sqrt(p);      // distance goes with speed squared, so the bar reads as distance
    const la = C.loft * 0.95 * Math.PI / 180, start = Math.sign(e) * e * e * ASSIST.side;
    const v = new THREE.Vector3(Math.cos(start) * Math.cos(la) * sp, Math.sin(la) * sp, Math.sin(start) * Math.cos(la) * sp);
    const pure = Math.abs(e) < ASSIST.pure && p > 0.08;
    this.phase = 'follow';
    return {
      club: C.id, contact: s.head.clone(), headSpeed: sp / C.smash, v, spin: 0, quality: 1 - Math.abs(e), launch: la,
      kind: putter ? 'putt' : pure ? 'pure' : 'ok', bite: !!C.bite, where: e > 0.5 ? 'toe' : e < -0.5 ? 'heel' : 'middle', assist: true,
    };
  }
}
