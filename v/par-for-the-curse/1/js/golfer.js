// A stubby golfer built from rigid Blender parts and posed every frame, and the physical swing that
// drives it. The mouse moves the hands (weighted, lagging, capped speed) in a tilted swing plane
// around the shoulders; the club head is a mass on a wrist spring that lags behind the hands on the
// way down and whips through. Nothing about the strike is scripted: ball speed, launch and curve all
// come from where the head is and how it is moving when it meets the ball.
import * as THREE from 'three';
import { make, tint, addOutline, manifest } from './assets.js';
import { BALL_R, G } from './physics.js';

export const CLUBS = [
  { id: 'putter', name: 'Putter', mesh: 'club_putter', len: 0.6, loft: 2.5, smash: 1.0, vMax: 1.6, aMax: 30, sens: 0.5, k: 1600, cock: 0 },
  { id: 'wedge', name: 'Wedge', mesh: 'club_wedge', len: 0.68, loft: 50, smash: 0.86, vMax: 4.2, aMax: 80, sens: 1, k: 1100, cock: 0.9, bite: true },
  { id: 'iron', name: 'Iron', mesh: 'club_iron', len: 0.72, loft: 22, smash: 1.2, vMax: 4.6, aMax: 85, sens: 1, k: 1000, cock: 1.1 },
  { id: 'driver', name: 'Driver', mesh: 'club_driver', len: 0.8, loft: 13, smash: 1.42, vMax: 5.0, aMax: 90, sens: 1.05, k: 900, cock: 1.2 },
];
export const HEAD_R = 0.045;

export const SKINS = ['#ffd9b8', '#f4c09a', '#e0a47a', '#c68655', '#9a6440', '#6e452b'];
export const SHIRTS = ['#ff5d73', '#3fa7ff', '#ffd23f', '#2ec4b6', '#a76bff', '#ff8c42', '#7bd389', '#f15bb5', '#ffffff', '#2b2d42'];
export const PANTS = ['#f4f1e8', '#2b2d42', '#8d6e63', '#3fa7ff', '#ff5d73', '#55a630', '#ffd23f', '#6c757d'];
export const HATS = ['cap', 'bucket', 'beanie', 'visor', 'tophat', 'viking', 'none'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DOWN = V(0, -1, 0), UPV = V(0, 1, 0), XV = V(1, 0, 0);

// Body geometry (overridden by the Blender manifest when present).
function rig() {
  const g = manifest.golfer || {};
  const L = g.lengths || {};
  return {
    upper: L.upper_arm ?? 0.16, fore: L.forearm ?? 0.14, hand: L.hand ?? 0.09,
    thigh: L.thigh ?? 0.13, shin: L.shin ?? 0.12, ankle: g.ankle_height ?? 0.06,
    shoulders: [V(...(g.shoulder_l || [0.17, 0.25, 0])), V(...(g.shoulder_r || [-0.17, 0.25, 0]))],
    hips: [V(...(g.hip_l || [0.075, -0.06, 0])), V(...(g.hip_r || [-0.075, -0.06, 0]))],
    hipDrop: -((g.hip_l || [0, -0.06])[1]),
    neck: g.neck ? V(...g.neck) : V(0, 0.3, 0),
    eyes: g.eyes ? V(...g.eyes) : V(0, 0.2, 0.17),
  };
}

// Two-bone IK: elbow position for a chain from a toward t with lengths l1, l2 bending toward pole.
function ik(a, t, l1, l2, pole, out) {
  _a.subVectors(t, a); let d = _a.length();
  const dir = _a.divideScalar(d || 1);
  d = Math.min(d, (l1 + l2) * 0.9999);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _b.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(a).addScaledVector(dir, x).addScaledVector(_b, h);
}
function aim(mesh, from, to, len) {
  _c.subVectors(to, from); const l = _c.length();
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(DOWN, _c.divideScalar(l || 1));
  const s = Math.max(1, l / len); mesh.scale.set(1 + (s - 1) * -0.3, s, 1 + (s - 1) * -0.3);
}

export class Golfer {
  constructor(look) {
    this.R = rig();
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const P = n => { const m = make(n, { unique: true, outline: 0.012 }); m.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.body.add(m); return m; };
    this.p = {
      head: P('head'), eyes: P('eyes'), stache: P('stache'), torso: P('torso'), hips: P('hips'),
      ua: [P('upper_arm'), P('upper_arm')], fa: [P('forearm'), P('forearm')], hand: [P('hand_l'), P('hand_r')],
      th: [P('thigh'), P('thigh')], sh: [P('shin'), P('shin')], shoe: [P('shoe_l'), P('shoe_r')],
    };
    this.hats = {};
    for (const h of HATS) if (h !== 'none') { this.hats[h] = P('hat_' + h); this.hats[h].visible = false; }
    this.crown = P('hat_crown'); this.crown.visible = false;
    this.clubs = CLUBS.map(c => { const m = P(c.mesh); m.visible = false; return m; });
    this.club = 3;
    this.headBob = V(); this.headBobV = V();
    this.blink = 0; this.nextBlink = 2;
    this.emote = null; this.emoteT = 0;
    this.squash = 0;
    this.redness = 0;
    this.setLook(look);
  }
  setLook(look) {
    this.look = look;
    const parts = [this.p.head, this.p.torso, this.p.hips, ...this.p.ua, ...this.p.fa, ...this.p.th, ...this.p.sh, ...Object.values(this.hats), this.p.stache];
    for (const m of parts) {
      tint(m, 'skin', look.skin); tint(m, 'shirt', look.shirt); tint(m, 'pants', look.pants);
      tint(m, 'hat', look.hat); tint(m, 'hat2', new THREE.Color(look.hat).lerp(new THREE.Color('#ffffff'), 0.55));
      tint(m, 'shirt2', new THREE.Color(look.shirt).lerp(new THREE.Color('#ffffff'), 0.6));
    }
    this.skin = new THREE.Color(look.skin); this._red = -1;
    for (const [k, m] of Object.entries(this.hats)) m.visible = k === look.hatType;
    this.p.stache.visible = !!look.stache;
  }
  setClub(i) { this.club = i; this.clubs.forEach((m, k) => (m.visible = k === i)); }
  setCrown(on) { this.crown.visible = on; if (on) for (const m of Object.values(this.hats)) m.visible = false; else this.setLook(this.look); }

  // Pose the body. s: { G, f, w (world basis), hands: [lead, trail] in local coords, club dir (local),
  // turn, look (local point to look at), shift }
  pose(s, dt, t) {
    const R = this.R, root = this.root;
    root.position.copy(s.G);
    _m4.makeBasis(s.f, UPV, s.w); root.quaternion.setFromRotationMatrix(_m4);
    // Squash/stretch and hops (local).
    this.squash += (0 - this.squash) * Math.min(1, dt * 8);
    const hop = s.hop || 0;
    this.body.position.set(0, hop, 0);
    this.body.scale.set(1 + this.squash * 0.12, 1 - this.squash * 0.15, 1 + this.squash * 0.12);
    const knee = s.knee ?? 0.03;
    const waist = V((s.shift || 0), R.ankle + R.shin + R.thigh + R.hipDrop - knee, s.hipZ ?? -0.02);
    const tilt = s.tilt ?? 0.38, turn = s.turn || 0;
    // Hips turn less than the shoulders.
    const hq = _q.setFromEuler(new THREE.Euler(tilt * 0.25, turn * 0.45, 0, 'XYZ'));
    this.p.hips.position.copy(waist); this.p.hips.quaternion.copy(hq);
    const breathe = 1 + Math.sin(t * 2.2) * 0.012;
    const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, turn, s.lean || 0, 'XYZ'));
    this.p.torso.position.copy(waist); this.p.torso.quaternion.copy(tq); this.p.torso.scale.set(1, breathe, 1);
    // Head on the neck with a little spring wobble, looking at s.look.
    const neck = R.neck.clone().applyQuaternion(tq).add(waist);
    const look = s.look ? _a.subVectors(s.look, neck) : _a.set(0, -0.4, 1);
    const yaw = Math.atan2(look.x, look.z), pitch = -Math.atan2(look.y, Math.hypot(look.x, look.z));
    const want = V(THREE.MathUtils.clamp(pitch, -0.5, 0.75), THREE.MathUtils.clamp(yaw, -1.3, 1.3), (s.headRoll || 0));
    this.headBobV.addScaledVector(_b.subVectors(want, this.headBob), dt * 90).multiplyScalar(Math.exp(-dt * 11));
    this.headBob.addScaledVector(this.headBobV, dt);
    const hq2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.headBob.x, this.headBob.y, this.headBob.z, 'YXZ'));
    for (const m of [this.p.head, this.p.stache, this.crown, ...Object.values(this.hats)]) { m.position.copy(neck); m.quaternion.copy(hq2); }
    // Blink.
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blink = 0.14; this.nextBlink = 1.5 + Math.random() * 3.5; }
    this.blink = Math.max(0, this.blink - dt);
    const eyeS = this.blink > 0 ? 0.12 : (s.squint ? 0.55 : 1);
    this.p.eyes.position.copy(R.eyes).applyQuaternion(hq2).add(neck); this.p.eyes.quaternion.copy(hq2); this.p.eyes.scale.set(1, eyeS, 1);
    // Rage: the face goes red.
    const red = Math.round(this.redness * 20) / 20;
    if (red !== this._red) { this._red = red; tint(this.p.head, 'skin', this.skin.clone().lerp(new THREE.Color('#ff2a1a'), red * 0.75)); }
    // Arms.
    for (let k = 0; k < 2; k++) {
      const sh = R.shoulders[k].clone().applyQuaternion(tq).add(waist);
      const hand = s.hands[k];
      const pole = V(k ? -0.6 : 0.6, -1, -0.2).normalize();
      if (s.elbowsUp) pole.set(k ? -1 : 1, 0.3, 0).normalize();
      const reach = R.upper + R.fore, d = sh.distanceTo(hand);
      const st = Math.max(1, d / (reach * 0.98));
      const el = ik(sh, hand, R.upper * st, R.fore * st, pole, V());
      aim(this.p.ua[k], sh, el, R.upper); aim(this.p.fa[k], el, hand, R.fore);
      const hd = s.handDir ? s.handDir[k] : s.club;
      this.p.hand[k].position.copy(hand);
      this.p.hand[k].quaternion.setFromUnitVectors(DOWN, hd);
    }
    // Legs: feet planted, knees forward and a bit out.
    for (let k = 0; k < 2; k++) {
      const hip = R.hips[k].clone().applyQuaternion(hq).add(waist);
      const foot = (s.feet && s.feet[k]) || V(k ? -0.15 : 0.15, R.ankle, 0.02);
      const pole = V(k ? -0.25 : 0.25, 0, 1).normalize();
      const knee = ik(hip, foot, R.thigh, R.shin, pole, V());
      aim(this.p.th[k], hip, knee, R.thigh); aim(this.p.sh[k], knee, foot, R.shin);
      this.p.shoe[k].position.copy(foot);
      this.p.shoe[k].rotation.set(0, k ? -0.25 : 0.35, 0);
    }
    // Club: grip at the lead hand, shaft down s.club, face toward the target.
    const cm = this.clubs[this.club];
    if (cm && s.club) {
      cm.position.copy(s.hands[0]).addScaledVector(s.club, -0.03);
      const y = _c.copy(s.club).negate();
      const z = _d.set(1, 0, 0).addScaledVector(y, -y.x).normalize();
      if (z.lengthSq() < 0.1) z.set(0, 0, 1);
      const x = _e.crossVectors(y, z).normalize();
      z.crossVectors(x, y);
      _m4.makeBasis(x, y, z); cm.quaternion.setFromRotationMatrix(_m4);
    }
  }
}

/* ---------------- the swing ---------------- */
// All swing state is in the golfer's local frame: x toward the target, y up, z toward the ball line.
export class Swing {
  constructor() {
    this.R = rig();
    this.waistY = this.R.ankle + this.R.shin + this.R.thigh + this.R.hipDrop - 0.03;
    const tilt = 0.38;
    const sh = this.R.shoulders[0].y;
    this.S = V(0, this.waistY + sh * Math.cos(tilt), sh * Math.sin(tilt) - 0.02);   // shoulder centre
    this.gripAddr = V(0, 0.42, 0.29);
    this.rA = this.S.distanceTo(this.gripAddr);
    this.a0 = V().subVectors(this.gripAddr, this.S).normalize();  // arm direction at address
    this.up2 = V().copy(this.a0).negate();                          // "up" in the arm plane
    this.hand = V(); this.handV = V(); this.target = new THREE.Vector2();  // target in plane coords (s along x, r along up2)
    this.head = V(); this.headV = V(); this.prevHead = V();
    this.club = CLUBS[3];
    this.speedHist = 0;
    this.setClub(3);
  }
  setClub(i) {
    this.ci = i; this.club = CLUBS[i];
    const L = this.club.len;
    // Rest the head a touch above the turf, allowing for how far gravity sags it on the wrist spring.
    const drop = this.gripAddr.y - HEAD_R - 0.012 - G * 0.6 / this.club.k;
    this.reachZ = this.gripAddr.z + Math.sqrt(Math.max(0.01, L * L - drop * drop));
    this.d0 = V(0, -drop, this.reachZ - this.gripAddr.z).normalize();
    this.ball = V(0.05, BALL_R, this.reachZ);
    this.reset();
  }
  reset() {
    this.target.set(-0.02, this.rA * 0.995);
    this.planePoint(this.target.x, this.target.y, this.hand);
    this.handV.set(0, 0, 0);
    this.prefDir(_a);
    this.head.copy(this.hand).addScaledVector(_a, this.club.len);
    this.prevHead.copy(this.head); this.headV.set(0, 0, 0);
    this.hit = false; this.armed = true; this.maxHeadSpeed = 0;
  }
  // (s, r): s toward the target, r along the address arm direction (down-ish). Address is (0, rA).
  planePoint(s, r, out) { return out.copy(this.S).addScaledVector(XV, s).addScaledVector(this.a0, r); }
  // Preferred club direction from the hand angle, with the wrists cocking on the backswing.
  prefDir(out) {
    const rel = _b.subVectors(this.hand, this.S);
    const s = rel.dot(XV), r = rel.dot(this.a0);
    const alpha = Math.atan2(s, r);           // 0 at the bottom, negative going back
    let cock = 0;
    const cg = this.club.cock;
    if (alpha < 0) cock = -THREE.MathUtils.clamp(-alpha / 1.6, 0, 1) * cg;
    else cock = THREE.MathUtils.clamp(alpha / 1.8, 0, 1) * cg * 0.75;
    // Never let the club wrap round behind the golfer's back.
    const beta = THREE.MathUtils.clamp(alpha + cock, -1.9, 2.3);
    this.alpha = alpha;
    return out.copy(this.d0).multiplyScalar(Math.cos(beta)).addScaledVector(XV, Math.sin(beta)).normalize();
  }
  // Mouse deltas in pixels (dx right, dy down).
  input(dx, dy) {
    const k = 0.0013 * this.club.sens;
    this.target.x += dx * k;
    this.target.y += dy * k;   // r grows downward (a0 points down-ish); mouse down = hands down
    const l = this.target.length();
    if (l > this.rA) this.target.multiplyScalar(this.rA / l);
  }
  step(dt, ground) {
    const C = this.club;
    // Hands: spring toward the target with capped acceleration and speed (the weight of the club).
    const T = this.planePoint(this.target.x, this.target.y, _c);
    const acc = _d.subVectors(T, this.hand).multiplyScalar(900).addScaledVector(this.handV, -55);
    if (acc.length() > C.aMax) acc.setLength(C.aMax);
    this.handV.addScaledVector(acc, dt);
    if (this.handV.length() > C.vMax) this.handV.setLength(C.vMax);
    this.hand.addScaledVector(this.handV, dt);
    // Keep the hands on or inside the reach sphere.
    const rel = _a.subVectors(this.hand, this.S); const rl = rel.length();
    if (rl > this.rA) { rel.multiplyScalar(this.rA / rl); this.hand.copy(this.S).add(rel); const out = rel.normalize(); const vn = this.handV.dot(out); if (vn > 0) this.handV.addScaledVector(out, -vn); }
    // Club head: wrist spring toward the preferred direction, gravity, rigid shaft length.
    this.prevHead.copy(this.head);
    const want = this.prefDir(_e).multiplyScalar(C.len).add(this.hand);
    const relV = _d.subVectors(this.headV, this.handV);
    const hacc = _a.subVectors(want, this.head).multiplyScalar(C.k).addScaledVector(relV, -1.25 * Math.sqrt(C.k));
    hacc.y -= G * 0.6;
    this.headV.addScaledVector(hacc, dt);
    this.head.addScaledVector(this.headV, dt);
    const sh = _b.subVectors(this.head, this.hand); sh.setLength(C.len); this.head.copy(this.hand).add(sh);
    // Ground: the sole can't go below the turf. Hitting it hard drags the head (a fat shot).
    this.groundHit = 0; this.groundDepth = HEAD_R - this.head.y;
    if (ground && this.head.y < HEAD_R) {
      this.head.y = HEAD_R;
      const sp = this.headV.length();
      if (sp > 2.5) { this.groundHit = sp; this.headV.multiplyScalar(0.86); }
      if (this.headV.y < 0) this.headV.y = 0;
    }
    this.headV.subVectors(this.head, this.prevHead).divideScalar(dt);
    return this.headV;
  }
  // Did the head strike the ball this step? Returns launch info in local coords or null.
  strike(ballLocal) {
    if (!this.armed) return null;
    const Rr = BALL_R + HEAD_R;
    const a = this.prevHead, b = this.head;
    const ab = _a.subVectors(b, a), len2 = ab.lengthSq();
    const t = len2 > 1e-10 ? THREE.MathUtils.clamp(_b.subVectors(ballLocal, a).dot(ab) / len2, 0, 1) : 0;
    const P = _c.copy(a).addScaledVector(ab, t);
    const dist = P.distanceTo(ballLocal);
    if (dist > Rr) return null;
    const vh = this.headV.clone();
    const vf = vh.x;
    if (vf < 0.25) {
      // Resting against the ball or moving away: push the head back out, no shot.
      if (dist < Rr) { const n = _d.subVectors(this.head, ballLocal).normalize(); this.head.copy(ballLocal).addScaledVector(n, Rr + 0.002); }
      return null;
    }
    this.armed = false;
    const C = this.club;
    const hs = Math.hypot(vh.x, vh.z);
    const path = Math.atan2(vh.z, vh.x);                 // + means toward the ball line (in-to-out)
    const attack = Math.atan2(vh.y, hs);
    const dyN = THREE.MathUtils.clamp((ballLocal.y - P.y) / Rr, -1, 1);   // + head below ball centre
    let launch = C.loft * Math.PI / 180 * (0.95 + 0.2 * dyN) + attack * 0.15;
    let q = 1 - Math.min(1, Math.abs(dyN - 0.35) * 0.9);
    let speed = hs * C.smash * (0.72 + 0.28 * q);
    let kind = q > 0.88 ? 'pure' : 'ok';
    if (dyN < -0.25 && C.id !== 'putter') { launch = Math.min(launch, 0.04); speed *= 0.62; kind = 'topped'; }
    if (C.id === 'putter') { launch = Math.max(0.0, Math.min(launch, 0.09)); speed = hs * C.smash; kind = 'putt'; }
    launch = THREE.MathUtils.clamp(launch, -0.05, 1.25);
    const start = path * 0.7;
    const dir = V(Math.cos(start), 0, Math.sin(start));
    const v = dir.multiplyScalar(Math.cos(launch) * speed); v.y = Math.sin(launch) * speed;
    const spin = C.id === 'putter' ? 0 : THREE.MathUtils.clamp(-path * 22 * (speed / 30), -9, 9);
    return { v, spin, headSpeed: vh.length(), quality: q, kind, launch, path, club: C.id, bite: !!C.bite };
  }
  // Plane coordinates of the hands for networking.
  handPlane() { const rel = _a.subVectors(this.hand, this.S); return [rel.dot(XV), rel.dot(this.a0)]; }
}
