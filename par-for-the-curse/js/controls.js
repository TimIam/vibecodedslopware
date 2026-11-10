// The golf stance (right click by your ball) plays every shot one way, Charge (from Golf It! and Kirby's
// Dream Course): the mouse aims, hold left mouse and the power rises and falls, let go at the power you want.
// Fighting has no scheme: holding left mouse makes the mouse your hands (see Swing in golfer.js).
import * as THREE from 'three';

export const GOLF_HINT = 'Mouse aims · <b>hold left mouse</b>, <b>let go</b> at the power you want · hold too long and your hands shake';

const clamp = THREE.MathUtils.clamp;

/* ---------------- golf ---------------- */
export const ASSIST = {
  back: 1.9, putterBack: 0.7,      // how far round the backswing goes at full power
  side: 0.32,                      // radians a completely missed shot starts off line
  pure: 0.14,                      // this close to straight is a pure strike
  up: 0.85,                        // seconds from empty to full power
  shake: 0.4, shakeRate: 6,        // after the first full rise the hands shake, this much more every pass
};
export class Assist {
  constructor(swing) { this.s = swing; this.reset(); }
  reset() { this.phase = 'idle'; this.power = 0; this.err = 0; this.t = 0; this.held = false; }
  get aiming() { return this.phase === 'idle' || this.phase === 'charge'; }
  press() { this.held = true; if (this.phase === 'idle') { this.phase = 'charge'; this.t = 0; this.power = 0; this.err = 0; } }
  release() {
    this.held = false;
    if (this.phase !== 'charge') return;
    if (this.power < 0.03) this.reset(); else { this.phase = 'down'; this.t = 0; }
  }
  update(dt) {
    const s = this.s, back = s.club.id === 'putter' ? ASSIST.putterBack : ASSIST.back;
    this.t += dt;
    if (this.phase === 'charge') {
      const c = this.t / ASSIST.up, f = c % 2;
      this.power = f < 1 ? f : 2 - f;
      this.err = c > 1 ? Math.sin(this.t * ASSIST.shakeRate * Math.PI) * clamp((c - 1) * ASSIST.shake, 0, 1) : 0;
    }
    // The club shows it: drawn back with the power, through on the shot.
    const T = s.target;
    if (this.phase === 'down' || this.phase === 'follow') T.set(back * Math.max(0.4, this.power), 0);
    else { const k = 1 - Math.exp(-dt * 14); T.x += (-back * this.power - T.x) * k; T.y = 0; }
  }
  // The shot this power and shake make, in the golfer's frame (x down the aim line). fullHead is the head
  // speed of a full physical swing with this club, so full power goes as far as a perfect real swing.
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
