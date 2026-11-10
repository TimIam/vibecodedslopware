// Control schemes, picked in the Esc menu (or with [ and ]). Six ways to fight and six ways to play a golf
// shot, each borrowed from a game that does it well. The first of each is the physical one: the mouse is
// the club. The others drive the same swing from buttons and gestures, so the club, the hits and what
// other players see stay the same simulation.
import * as THREE from 'three';

export const FIGHT_MODES = [
  { id: 'raw', name: 'Raw', from: 'Half Sword', how: 'Hold left mouse: the mouse is your hands. Wind up one way, rip the other.',
    hint: 'The mouse is the club · <b>Right mouse</b> thrust · <kbd>Q</kbd><kbd>E</kbd> turn · <kbd>H</kbd> hit boxes', walk: '<b>Hold left mouse</b> to swing freely' },
  { id: 'slash', name: 'Slash', from: 'Mount & Blade', how: 'Hold left mouse to wind up, let go to cut. The way you are moving the mouse as you press picks the cut.',
    hint: 'Slash: <b>hold</b> to wind up, <b>let go</b> to cut · move the mouse as you press to pick the cut', walk: '<b>Hold left mouse</b> to wind up, let go to cut' },
  { id: 'brawl', name: 'Brawler', from: 'Zelda, Devil May Cry', how: 'Click, click, click for a left, right, overhead combo. Hold and let go for a ground smash.',
    hint: 'Brawler: <b>click</b> to chain cuts · <b>hold</b> and let go for a ground smash', walk: '<b>Click</b> to attack, hold for a smash' },
  { id: 'duel', name: 'Duelist', from: 'For Honor', how: 'Walk near a golfer to lock on. The mouse picks your guard: left, top or right. Hits from the side you guard are blocked. Click to strike from your guard, hold for a heavy.',
    hint: 'Duelist: <b>mouse</b> moves your guard · <b>click</b> strike · <b>hold</b> heavy · guard the side the red arrow shows', walk: 'Get near a golfer to lock on · <b>click</b> to strike' },
  { id: 'swipe', name: 'Swipe', from: 'Fruit Ninja, Die by the Blade', how: 'Hold left mouse and swipe: the club cuts along the line you draw, as hard as you draw it. Any angle.',
    hint: 'Swipe: <b>hold left mouse</b> and draw the cut · faster swipe, harder hit', walk: '<b>Hold left mouse</b> and swipe to cut' },
  { id: 'boom', name: 'Boomerang', from: 'God of War, Zelda', how: 'Click to swing. Hold and let go to throw the club: it spins out, bonks golfers and balls, and flies back to you.',
    hint: 'Boomerang: <b>click</b> to swing · <b>hold</b>, aim with the camera, <b>let go</b> to throw', walk: '<b>Click</b> to swing · <b>hold</b> and let go to throw the club' },
];
export const GOLF_MODES = [
  { id: 'feel', name: 'Feel', from: 'Half Sword', how: 'The mouse is the club: draw it back, swing it through the ball. A and D aim.' },
  { id: 'flick', name: 'Flick', from: 'Tiger Woods, PGA 2K swing stick', how: 'Mouse aims. Hold left mouse, pull back for power, flick forward to hit. A crooked flick bends the shot.',
    hint: 'Flick: mouse aims · <b>hold left mouse</b>, pull back for power, flick forward to hit' },
  { id: 'meter', name: 'Meter', from: "Mario Golf, Everybody's Golf", how: 'Mouse aims. Click to start, click for power, click on the line for a straight shot.',
    hint: 'Meter: mouse aims · <b>click</b> to start, <b>click</b> for power, <b>click</b> on the line' },
  { id: 'sling', name: 'Slingshot', from: 'Golf With Your Friends, Angry Birds', how: 'Hold left mouse and pull the mouse toward you like a slingshot: further is harder, sideways aims the other way. Let go to hit.',
    hint: 'Slingshot: <b>hold left mouse</b>, pull toward you · sideways aims · <b>let go</b> to hit' },
  { id: 'charge', name: 'Charge', from: "Golf It!, Kirby's Dream Course", how: 'Mouse aims. Hold left mouse: the power swings up and down. Let go at the power you want. Hold too long and your hands start to shake.',
    hint: 'Charge: mouse aims · <b>hold left mouse</b>, <b>let go</b> at the power you want' },
  { id: 'tempo', name: 'Tempo', from: 'Golf Clash, Golf Story', how: 'Mouse aims. Hold left mouse to take the club back, let go to swing, then click as the ring closes on the circle. Overswing and it goes wild.',
    hint: 'Tempo: mouse aims · <b>hold</b> to take it back, <b>let go</b>, then <b>click</b> when the ring hits the circle' },
];

const clamp = THREE.MathUtils.clamp;

/* ---------------- fighting ---------------- */
// A cut is two poses for the hands (sweep toward the golfer's left, lift): where they wind up and where
// they finish. The hands chase them with the club's real weight, so the head still lags and whips.
// Side cuts go at the height you are looking (Fight.lift, set from the camera): look down to sweep the
// turf and the ball, look level for a body shot, look up for the head.
export const CUTS = {
  left: { wind: [-1.2, 0], end: [1.25, 0], side: true },      // from the right across to the left
  right: { wind: [1.2, 0], end: [-1.25, 0], side: true },     // backhand
  chop: { wind: [-0.25, 1.5], end: [0.15, -0.38] },    // overhead, down the middle
  upper: { wind: [-0.95, -0.4], end: [0.7, 1.3] },     // low to high
};
// Which guard stops which cut, for the Duelist. A cut from the attacker's right lands on your left.
export const GUARD_FOR = { left: 'left', right: 'right', chop: 'top' };
const GUARD_POSE = { left: [0.75, 0.85], right: [-0.75, 0.85], top: [0, 1.35] };
export const FIGHT = {
  slash: { full: 0.55, min: 0.09, auto: 1.3, cut: 0.3, recover: 0.2 },
  brawl: { wind: 0.13, cut: 0.25, recover: 0.08, combo: ['left', 'right', 'chop'], comboGap: 0.9, hold: 0.32, smashFull: 0.9, smashAuto: 1.5 },
  duel: { light: 0.1, hold: 0.22, heavyFull: 0.5, heavyAuto: 1.2, cut: 0.26, recover: 0.22, guardPx: 22 },
  swipe: { len: 70, window: 0.35, wind: 0.06, cut: 0.2, recover: 0.06, slow: 600, fast: 2600 },
  boom: { wind: 0.12, hold: 0.24, full: 0.7, cut: 0.25, recover: 0.1 },
  windRate: 15,
  linger: 0.35,        // the club stays in hand this long after a move, so quick attacks don't flap the pose
  flick: 9,            // pixels of recent mouse travel that count as "turning that way"
};
export class Fight {
  constructor(swing) {
    this.s = swing; this.mv = { x: 0, y: 0 }; this.g = { x: 0, y: 0 }; this.cancel();
    this.combo = 0; this.endT = -9; this.lift = 0; this.guard = 'right'; this.locked = false;
    this.onSmash = null; this.onCut = null; this.onBegin = null; this.onThrow = null;
  }
  cancel() { this.move = null; this.queued = 0; this.held = false; this.stroke = null; }
  // Recent mouse travel, so a press can tell which way you were turning.
  mouse(dx, dy, dt) { const k = Math.exp(-dt * 12); this.mv.x = this.mv.x * k + dx; this.mv.y = this.mv.y * k + dy; }
  pick() {
    const { x, y } = this.mv, F = FIGHT.flick;
    return Math.abs(y) > Math.abs(x) && Math.abs(y) > F ? (y > 0 ? 'chop' : 'upper') : x > F ? 'right' : 'left';
  }
  begin(cut, o = {}) { this.move = { cut, phase: 'wind', t: 0, charge: 0, ...o }; if (this.onBegin) this.onBegin(this.move); }
  // Duelist: while locked on, the mouse moves your guard the way a For Honor stick does.
  guardMouse(dx, dy, dt) {
    const k = Math.exp(-dt * 10), P = FIGHT.duel; this.g.x = this.g.x * k + dx; this.g.y = this.g.y * k + dy;
    const { x, y } = this.g;
    if (-y > P.guardPx && -y > Math.abs(x)) this.guard = 'top';
    else if (x > P.guardPx && x > Math.abs(y)) this.guard = 'right';
    else if (x < -P.guardPx && -x > Math.abs(y)) this.guard = 'left';
  }
  // Swipe: mouse travel while the button is held. A quick enough stroke becomes a cut along it.
  swipeMouse(dx, dy, dt) {
    const st = this.stroke; if (!st || (this.move && this.move.phase !== 'recover')) return;
    // Time counts from when the mouse starts moving, and a pause starts the stroke again.
    if (!dx && !dy) { st.idle = (st.idle || 0) + dt; if (st.idle > 0.08) { st.x = st.y = st.t = 0; } return; }
    st.idle = 0; st.t += dt; st.x += dx; st.y += dy;
    const P = FIGHT.swipe, len = Math.hypot(st.x, st.y);
    if (st.t > P.window) { st.x *= 0.5; st.y *= 0.5; st.t *= 0.5; }      // slow drifting doesn't add up to a cut
    if (len < P.len) return;
    // Screen right is the golfer's right (local -x); screen up lifts.
    const dxT = -st.x / len, dyT = -st.y / len, speed = len / Math.max(st.t, 1 / 120);
    const amt = 0.6 + 0.55 * clamp((speed - P.slow) / (P.fast - P.slow), 0, 1);
    const side = Math.abs(dyT) < 0.5;
    const C = { wind: [-dxT * 1.2, -dyT * 1.2 + (dyT > 0.5 ? -0.1 : 0)], end: [dxT * 1.3, dyT * (dyT < 0 ? 0.5 : 1.3)], side };
    const cut = dyT < -0.6 ? 'chop' : dyT > 0.6 ? 'upper' : dxT > 0 ? 'left' : 'right';
    this.begin(cut, { C, amt });
    this.stroke = { x: 0, y: 0, t: 0 };
  }
  press(id, t) {
    this.held = true; this.pressT = t;
    if (id === 'slash') {
      if (this.move && this.move.phase !== 'recover') return;
      this.begin(this.pick());
    } else if (id === 'brawl') {
      if (this.move) { this.queued = Math.min(2, this.queued + 1); return; }      // mashing queues up to two more
      if (t - this.endT > FIGHT.brawl.comboGap) this.combo = 0;
      const list = FIGHT.brawl.combo;
      this.begin(list[this.combo++ % list.length], { quick: true });
    } else if (id === 'duel') {
      if (this.move && this.move.phase !== 'recover') return;
      if (!this.locked) { const c = this.pick(); this.guard = c === 'chop' || c === 'upper' ? 'top' : c === 'right' ? 'right' : 'left'; }
      // You strike from the side you are guarding: guarding left, the club comes from your left.
      this.begin(this.guard === 'left' ? 'right' : this.guard === 'right' ? 'left' : 'chop', { duel: true });
    } else if (id === 'swipe') {
      this.stroke = { x: 0, y: 0, t: 0 };
    } else if (id === 'boom') {
      if (this.thrown || (this.move && this.move.phase !== 'recover')) return;
      this.begin(this.combo++ % 2 ? 'right' : 'left', { quick: true, boom: true });
    }
  }
  release() { this.held = false; this.stroke = null; }
  // Returns true while the club should be in hand.
  update(id, dt, t) {
    const m = this.move, s = this.s, T = s.target;
    const ease = (x, y, rate = FIGHT.windRate) => { const k = 1 - Math.exp(-dt * rate); T.x += (x - T.x) * k; T.y += (y - T.y) * k; };
    if (!m) {
      if (id === 'duel' && this.locked) { const G = GUARD_POSE[this.guard]; ease(G[0], G[1], 12); s.idle = 0; s.idleY = 0; return true; }
      if (id === 'swipe' && this.held) { ease(0, 0.35 + this.lift, 10); s.idle = 0; s.idleY = 0; return true; }
      return t - this.endT < FIGHT.linger;
    }
    s.idle = 0; s.idleY = 0;
    m.t += dt;
    const C = m.C || CUTS[m.cut], P = FIGHT[id] || FIGHT.brawl;
    if (m.phase === 'wind') {
      let go = false, amt = 1;
      if (id === 'slash') {
        m.charge = clamp(m.t / P.full, 0, 1); amt = 0.55 + 0.45 * m.charge;
        go = (!this.held && m.t >= P.min) || m.t > P.auto;
      } else if (id === 'brawl') {
        // Still holding after a moment: it turns into the smash, wound up overhead until you let go.
        if (m.quick && this.held && m.t > P.hold) { m.quick = false; m.smash = true; m.cut = 'chop'; }
        if (m.smash) { m.charge = clamp((m.t - P.hold) / P.smashFull, 0, 1); go = !this.held || m.t > P.smashAuto; }
        else { amt = 0.9; go = m.t >= P.wind && !this.held || m.t > P.hold + 0.02; }
      } else if (id === 'duel') {
        if (this.held && m.t > P.hold) m.heavy = true;
        if (m.heavy) { m.charge = clamp((m.t - P.hold) / P.heavyFull, 0, 1); amt = 0.85 + 0.2 * m.charge; go = !this.held || m.t > P.heavyAuto; }
        else { amt = 0.85; go = !this.held && m.t >= P.light; }
      } else if (id === 'swipe') {
        amt = m.amt; go = m.t >= P.wind;
      } else if (id === 'boom') {
        if (m.quick && this.held && m.t > P.hold) { m.quick = false; m.aim = true; }
        if (m.aim) {
          // Cocked back over the shoulder, ready to throw.
          m.charge = clamp((m.t - P.hold) / P.full, 0, 1); ease(-0.45, 1.4, 12);
          if (!this.held) { this.move = null; this.endT = t; if (this.onThrow) this.onThrow(m.charge); return false; }
          return true;
        }
        amt = 0.9; go = !this.held && m.t >= P.wind || m.t > P.hold + 0.02;
      }
      ease(C.wind[0] * amt, C.wind[1] * amt + (C.side ? this.lift : 0));
      if (go) { m.phase = 'cut'; m.t = 0; m.amt = id === 'slash' ? 0.75 + 0.25 * m.charge : id === 'duel' ? 0.9 + 0.15 * m.charge : id === 'swipe' ? m.amt : 1; if (this.onCut) this.onCut(m); }
    } else if (m.phase === 'cut') {
      T.set(C.end[0] * m.amt, C.end[1] * m.amt + (C.side ? this.lift : 0));
      if (m.t > P.cut) { if (m.smash && this.onSmash) this.onSmash(m.charge); m.phase = 'recover'; m.t = 0; }
    } else {
      if (m.t > P.recover || this.queued) {
        this.move = null; this.endT = t;
        if (this.queued && id === 'brawl') { this.queued--; const list = FIGHT.brawl.combo; this.begin(list[this.combo++ % list.length], { quick: true }); this.held = false; }
        else this.queued = 0;
      }
    }
    return true;
  }
  // Is a strike from this cut stopped by the guard right now? Only while locked and not mid-swing.
  blocks(cut) { return this.locked && (!this.move || this.move.phase === 'recover') && GUARD_FOR[cut] === this.guard; }
}

/* ---------------- golf ---------------- */
export const ASSIST = {
  back: 1.9, putterBack: 0.7,      // how far round the backswing goes at full power
  side: 0.32,                      // radians a completely missed shot starts off line
  pure: 0.14,                      // this close to perfect is a pure strike
  flick: { pull: 240, start: 26, push: 110, wide: 0.45, slow: 0.5 },     // pixels pulled for full power; pixels and radians for the flick
  meter: { up: 0.95, sweep: 0.8, sweet: 0.15, band: 0.15 },             // seconds to fill, seconds for the marker's return, where the line is
  sling: { pull: 260, turn: 0.0028, maxTurn: 0.9, min: 0.04 },          // pixels for full power, radians of aim per sideways pixel
  charge: { up: 0.85, shake: 0.4, shakeRate: 6 },                       // seconds from empty to full, how fast the hands start to shake
  tempo: { full: 1.0, over: 0.3, ring: 0.5, sweet: 0.25, band: 0.18, wild: 2.2 },   // seconds back, overswing room, ring time, where to click
};
export class Assist {
  constructor(swing) { this.s = swing; this.reset(); }
  reset() { this.phase = 'idle'; this.power = 0; this.over = 0; this.err = 0; this.bar = 0; this.mark = null; this.t = 0; this.held = false; this.fwd = 0; this.sideTrack = 0; this.ring = null; this.px = 0; this.py = 0; this.aimOff = 0; }
  get aiming() { return this.phase === 'idle'; }
  get busy() { return this.phase !== 'idle'; }
  press(id) {
    this.held = true;
    const ph = this.phase;
    if (id === 'flick') { if (ph === 'idle') { this.phase = 'back'; this.pull = this.peak = 0; this.power = 0; } }
    else if (id === 'meter') {
      const M = ASSIST.meter;
      if (ph === 'idle') { this.phase = 'up'; this.bar = 0; this.dir = 1; this.power = 0; }
      else if (ph === 'up') { if (this.bar < 0.04) return; this.power = this.bar; this.phase = 'acc'; this.mark = 1; }
      else if (ph === 'acc') { this.err = clamp((this.mark - M.sweet) / M.band, -1, 1); this.fire(); }
    } else if (id === 'sling') { if (ph === 'idle') { this.phase = 'sling'; this.px = this.py = 0; this.power = 0; this.aimOff = 0; } }
    else if (id === 'charge') { if (ph === 'idle') { this.phase = 'charge'; this.t = 0; this.power = 0; this.err = 0; } }
    else if (id === 'tempo') {
      const P = ASSIST.tempo;
      if (ph === 'idle') { this.phase = 'back'; this.t = 0; this.power = 0; this.over = 0; }
      else if (ph === 'ring') {
        const e = clamp((this.ring - P.sweet) / P.band, -1, 1);
        this.err = clamp(e + Math.sign(e || 1) * this.over * P.wild, -1, 1); this.fire();
      }
    }
  }
  release(id) {
    this.held = false;
    const ph = this.phase;
    if (id === 'flick') { if (ph === 'back') this.reset(); else if (ph === 'push') this.flickDone(); }
    else if (id === 'sling' && ph === 'sling') { if (this.power < ASSIST.sling.min) this.reset(); else { this.err = 0; this.fire(); } }
    else if (id === 'charge' && ph === 'charge') { if (this.power < 0.03) this.reset(); else this.fire(); }
    else if (id === 'tempo' && ph === 'back') { if (this.power < 0.05) this.reset(); else { this.phase = 'ring'; this.ring = 1; this.t = 0; } }
  }
  // Mouse travel while a gesture is under way (dy is down the screen: toward you).
  mouse(id, dx, dy) {
    if (id === 'flick') {
      const F = ASSIST.flick;
      if (this.phase === 'back') {
        this.pull = Math.max(0, this.pull + dy); this.peak = Math.max(this.peak, this.pull);
        this.power = clamp(this.peak / F.pull, 0, 1);
        if (this.peak > F.start && this.pull < this.peak - F.start) { this.phase = 'push'; this.fwd = this.peak - this.pull; this.sideTrack = 0; this.t = 0; }
      } else if (this.phase === 'push') {
        this.fwd += Math.max(0, -dy); this.sideTrack += dx;
        if (this.fwd >= F.push) this.flickDone();
      }
    } else if (id === 'sling' && this.phase === 'sling') {
      const P = ASSIST.sling;
      this.px += dx; this.py = Math.max(0, this.py + dy);
      this.power = clamp(this.py / P.pull, 0, 1);
      this.aimOff = clamp(this.px * P.turn, -P.maxTurn, P.maxTurn);     // pull left, it flies right: added to the aim by the game
    }
  }
  flickDone() {
    const F = ASSIST.flick;
    this.err = clamp(Math.atan2(this.sideTrack, Math.max(20, this.fwd)) / F.wide, -1, 1);
    if (this.fwd < F.push * 0.5) this.power *= 0.7;      // a flick that never got going
    this.fire();
  }
  fire() { this.phase = 'down'; this.t = 0; this.mark = null; }
  update(id, dt) {
    const s = this.s, putter = s.club.id === 'putter', back = putter ? ASSIST.putterBack : ASSIST.back, M = ASSIST.meter;
    this.t += dt;
    const ph = this.phase;
    if (ph === 'up') {
      this.bar += this.dir * dt / M.up;
      if (this.bar >= 1) { this.bar = 1; this.dir = -1; }
      if (this.bar <= 0 && this.dir < 0) { this.reset(); }
      this.power = this.bar;
    } else if (ph === 'acc') {
      this.mark -= dt / M.sweep;
      if (this.mark <= 0) { this.mark = 0; this.err = -1; this.power *= 0.8; this.fire(); }
    } else if (ph === 'push' && this.t > ASSIST.flick.slow) this.flickDone();
    else if (ph === 'charge') {
      const P = ASSIST.charge, c = this.t / P.up, f = c % 2;
      this.power = f < 1 ? f : 2 - f;
      // After the first full rise the hands start to shake, more every pass.
      this.err = c > 1 ? Math.sin(this.t * P.shakeRate * Math.PI) * clamp((c - 1) * P.shake, 0, 1) : 0;
    } else if (ph === 'back' && id === 'tempo') {
      const P = ASSIST.tempo, p = this.t / P.full;
      this.power = Math.min(1, p); this.over = clamp(p - 1, 0, P.over);
      if (p >= 1 + P.over) this.release('tempo');      // all the way round: it swings by itself
    } else if (ph === 'ring') {
      this.ring = 1 - this.t / ASSIST.tempo.ring;
      if (this.ring <= 0) { this.ring = 0; this.err = -1; this.fire(); }
    }
    // The club shows it: drawn back with the power, through on the shot.
    const T = s.target, p = Math.min(1, this.power) + this.over * 0.6;
    if (ph === 'down' || ph === 'follow') T.set(back * Math.max(0.4, p), 0);
    else if (ph === 'ring') T.set(-back * p, 0);
    else { const want = -back * p, k = 1 - Math.exp(-dt * 14); T.x += (want - T.x) * k; T.y = 0; }
  }
  // The shot this power and accuracy make, in the golfer's frame (x down the aim line). fullHead is the
  // head speed of a full physical swing with this club, so every way of swinging reaches the same distance.
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
