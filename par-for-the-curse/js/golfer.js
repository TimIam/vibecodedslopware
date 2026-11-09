// A stubby golfer built from rigid Blender parts and posed every frame, and the physical swing that
// drives it. The mouse moves the hands (weighted, lagging, capped speed) in a tilted swing plane
// around the shoulders; the club head is a mass on a wrist spring that lags behind the hands on the
// way down and whips through. Nothing about the strike is scripted: ball speed, launch and curve all
// come from where the head is and how it is moving when it meets the ball.
import * as THREE from 'three';
import { make, tint, addOutline, manifest, lib } from './assets.js';
import { BALL_R, G, ACTOR } from './physics.js';
// The swing runs in the golfer's own units; only the root is scaled into the world.
const LOCAL_BALL_R = BALL_R / ACTOR;

export const CLUBS = [
  { id: 'putter', name: 'Putter', mesh: 'club_putter', len: 0.6, loft: 2.5, smash: 1.0, vMax: 1.6, aMax: 30, sens: 0.5, k: 1600, cock: 0 },
  { id: 'wedge', name: 'Wedge', mesh: 'club_wedge', len: 0.68, loft: 50, smash: 0.86, vMax: 4.2, aMax: 80, sens: 1, k: 1100, cock: 0.9, bite: true },
  { id: 'iron', name: 'Iron', mesh: 'club_iron', len: 0.72, loft: 22, smash: 1.2, vMax: 4.6, aMax: 85, sens: 1, k: 1000, cock: 1.1 },
  { id: 'driver', name: 'Driver', mesh: 'club_driver', len: 0.8, loft: 13, smash: 1.42, vMax: 5.0, aMax: 90, sens: 1.05, k: 900, cock: 1.2 },
];
export const HEAD_R = 0.045;
const GRIP_Y = 0.42;
// Shaft angle from vertical at address for club i (the stubby golfers stand well away from the ball).
function lieAngle(i) {
  const c = CLUBS[i], drop = GRIP_Y - HEAD_R - 0.012 - G * 0.6 / c.k;
  return Math.acos(Math.min(1, drop / c.len));
}

// The Blender clubs are modelled with a vertical shaft and the head square to it (toe toward +X).
// Bend each head at the hosel so its sole sits flat at the shaft angle the swing actually uses,
// and work out the wrapper transform that mirrors the toe onto the far side of the ball and puts
// the head centre back on the shaft line at the club's playing length. Done once per club model.
const clubFit = new Map();
function fitClub(i) {
  if (clubFit.has(i)) return clubFit.get(i);
  const c = CLUBS[i], info = manifest.clubs?.clubs?.[c.mesh] || {};
  const hy = (info.hosel_top || [0, -c.len * 0.85, 0])[1];
  const hc = V(...(info.head_center || [0.07, -c.len * 0.95, 0]));
  const phi = lieAngle(i);
  const R = new THREE.Matrix4().makeTranslation(0, hy, 0).multiply(new THREE.Matrix4().makeRotationZ(-phi)).multiply(new THREE.Matrix4().makeTranslation(0, -hy, 0));
  const Rn = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationZ(-phi));
  // The hit box is measured from the head's own vertices, in axes that lie along the lofted face: X toe,
  // T up the face, N out of the face.
  const size = info.head_size || [0.13, 0.07, 0.08], topY = hc.y + size[1] / 2 + 0.002;
  const L = c.loft * Math.PI / 180, N = V(...(info.face_normal || [0, Math.sin(L), Math.cos(L)])).normalize();
  const X = V(1, 0, 0), T = V().crossVectors(N, X).normalize();
  const lo = V(Infinity, Infinity, Infinity), hi = V(-Infinity, -Infinity, -Infinity), rel = V();
  const t = lib.get(c.mesh);
  if (t) t.traverse(o => {
    if (!o.isMesh || o.userData.bent) return;
    o.userData.bent = true;
    const p = o.geometry.attributes.position, n = o.geometry.attributes.normal, v = V();
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) >= hy) continue;
      v.fromBufferAttribute(p, k);
      if (v.y < topY) {
        rel.subVectors(v, hc);
        const a = rel.dot(X), b = rel.dot(T), d = rel.dot(N);
        lo.min(_a.set(a, b, d)); hi.max(_a);
      }
      v.applyMatrix4(R); p.setXYZ(k, v.x, v.y, v.z);
      if (n) { v.fromBufferAttribute(n, k).applyMatrix3(Rn); n.setXYZ(k, v.x, v.y, v.z); }
    }
    p.needsUpdate = true; if (n) n.needsUpdate = true;
    o.geometry.computeBoundingSphere();
  });
  if (!Number.isFinite(lo.x)) { lo.set(-size[0] / 2, -size[1] / 2, -size[2] / 2); hi.set(size[0] / 2, size[1] / 2, size[2] / 2); }
  const head = hc.clone().applyMatrix4(R); head.x = -head.x;
  const fit = { q: new THREE.Quaternion().setFromUnitVectors(head.clone().normalize(), DOWN), s: c.len / head.length() };
  // From the Blender club's space into the space of the club wrapper the golfer actually holds.
  const toWrap = p => { const w = p.clone().applyMatrix4(R); w.x = -w.x; return w.multiplyScalar(fit.s).applyQuaternion(fit.q); };
  const dirWrap = d => { const w = d.clone().applyMatrix3(Rn); w.x = -w.x; return w.applyQuaternion(fit.q).normalize(); };
  const mid = V().addVectors(lo, hi).multiplyScalar(0.5), half = V().subVectors(hi, lo).multiplyScalar(0.5 * fit.s);
  const r = THREE.MathUtils.clamp(Math.min(half.x, half.y, half.z) * 0.5, 0.006, 0.02);
  const centre = hc.clone().addScaledVector(X, mid.x).addScaledVector(T, mid.y).addScaledVector(N, mid.z);
  const fc = V(...(info.face_center || [hc.x, hc.y, hi.z + hc.z]));
  const hosel = V(...(info.hosel_top || [0, hy, 0]));
  fit.col = {
    c: toWrap(centre), toe: dirWrap(X), up: dirWrap(T), face: dirWrap(N),
    h: V(half.x - r, half.y - r, half.z - r), r,
    sweetU: (fc.x - centre.x) * fit.s, sweetV: V().subVectors(fc, centre).dot(T) * fit.s,
    hosel: toWrap(hosel), heel: toWrap(centre.clone().addScaledVector(X, lo.x - mid.x)),
  };
  clubFit.set(i, fit);
  return fit;
}
// The club's orientation in the golfer's frame. y runs up the shaft, z is the way the face looks.
function clubBasis(club, faceRef, x, y, z) {
  y.copy(club).negate();
  z.copy(faceRef).addScaledVector(y, -faceRef.dot(y));
  if (z.lengthSq() < 1e-4) z.set(1, 0, 0);
  z.normalize();
  x.crossVectors(y, z).normalize();
}

export const SKINS = ['#ffd9b8', '#f4c09a', '#e0a47a', '#c68655', '#9a6440', '#6e452b'];
export const SHIRTS = ['#ff5d73', '#3fa7ff', '#ffd23f', '#2ec4b6', '#a76bff', '#ff8c42', '#7bd389', '#f15bb5', '#ffffff', '#2b2d42'];
export const PANTS = ['#f4f1e8', '#2b2d42', '#8d6e63', '#3fa7ff', '#ff5d73', '#55a630', '#ffd23f', '#6c757d'];
export const HATS = ['cap', 'bucket', 'beanie', 'visor', 'tophat', 'viking', 'none'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _f3 = V(), _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const DOWN = V(0, -1, 0), UPV = V(0, 1, 0), XV = V(1, 0, 0), PLANE_N = V(0, 0.89, 0.46);

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

const SHAFT_R = 0.014, START_FACE = 0.7;
const newFrame = () => ({ hand: V(), head: V(), o: V(), x: V(), y: V(), z: V() });
const _f0 = newFrame(), _f1 = newFrame(), _f2 = newFrame();
const _s = V(), _r = V(), _c0 = V(), _ct = V(), _cu = V(), _cf = V(), _s0 = V(), _s1 = V(), _sd = V();
const wrapPoint = (f, p, out) => out.copy(f.o).addScaledVector(f.x, p.x).addScaledVector(f.y, p.y).addScaledVector(f.z, p.z);
const wrapDir = (f, d, out) => out.set(0, 0, 0).addScaledVector(f.x, d.x).addScaledVector(f.y, d.y).addScaledVector(f.z, d.z);

export class Golfer {
  constructor(look) {
    this.R = rig();
    this.root = new THREE.Group(); this.root.scale.setScalar(ACTOR);
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
    this.clubs = CLUBS.map((c, i) => {
      const fit = fitClub(i);
      const m = make(c.mesh, { outline: 0.012 }); m.traverse(o => { if (o.isMesh) o.castShadow = true; });
      m.scale.set(-fit.s, fit.s, fit.s); m.quaternion.copy(fit.q);
      const wrap = new THREE.Group(); wrap.add(m); wrap.visible = false; this.body.add(wrap);
      return wrap;
    });
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
      // The face turns with the swing plane: it is square to the target at address, faces up the
      // line on the backswing and closes through impact, the way a real clubface rotates.
      clubBasis(s.club, s.faceRef || _f3.crossVectors(PLANE_N, s.club), _e, _c, _d);
      _m4.makeBasis(_e, _c, _d); cm.quaternion.setFromRotationMatrix(_m4);
    }
  }
}

// Running: legs stride with the speed. Empty hands pump; with a club, the lead hand carries it bouncing
// over the shoulder and the other arm pumps. amt is 0 standing to 1 flat out.
const CARRY = V(-0.05, 0.72, -0.69).normalize(), FIST = V(0, -0.4, 0.9).normalize();
export function runPose(s, phase, amt, opt = {}) {
  const sw = Math.sin(phase), cw = Math.cos(phase), ankle = 0.06, stride = 0.08 + 0.2 * amt;
  s.feet = s.feet || [V(), V()]; s.hands = s.hands || [V(), V()]; s.club = s.club || V();
  s.tilt = 0.05 + 0.3 * amt; s.turn = sw * 0.28 * amt; s.lean = cw * 0.05 * amt; s.knee = 0.03 + 0.03 * amt;
  s.hop = Math.abs(cw) * 0.07 * amt; s.shift = 0; s.look = V(0, 0.72, 2); s.squint = false;
  const moving = amt > 0.03 ? 1 : 0;
  if (opt.air) {
    s.feet[0].set(0.14, ankle + 0.14, 0.14); s.feet[1].set(-0.14, ankle + 0.1, -0.1); s.tilt = 0.12; s.turn = 0;
    s.hands[0].set(0.3, 0.68, 0.04); s.hands[1].set(-0.3, 0.68, 0.04);
  } else {
    s.feet[0].set(0.11, ankle + Math.max(0, cw) * 0.13 * amt * moving, 0.02 + sw * stride * moving);
    s.feet[1].set(-0.11, ankle + Math.max(0, -cw) * 0.13 * amt * moving, 0.02 - sw * stride * moving);
    const lift = 0.36 + 0.14 * Math.min(1, amt * 1.6);
    s.hands[0].set(0.21, lift + cw * 0.03 * amt, 0.08 - sw * 0.2 * amt);
    s.hands[1].set(-0.21, lift - cw * 0.03 * amt, 0.08 + sw * 0.2 * amt);
  }
  s.handDir = [FIST, FIST];
  if (opt.club) {
    const b = Math.sin(phase * 2) * 0.09 * amt;
    s.hands[0].set(0.2, 0.6 + cw * 0.02 * amt, 0.13);
    s.club.copy(CARRY); s.club.y += b; s.club.z -= b * 0.6; s.club.normalize();
    s.handDir = [s.club, FIST];
  } else s.club.set(0, -1, 0);
}
// Sitting in the cart with both hands on the wheel. Coordinates are the cart's, relative to the seat.
export function sitPose(s, steer = 0) {
  s.feet = s.feet || [V(), V()]; s.hands = s.hands || [V(), V()]; s.club = s.club || V();
  s.feet[0].set(0.12, 0.05, 0.3); s.feet[1].set(-0.12, 0.05, 0.3);
  const c = Math.cos(steer * 0.5), n = Math.sin(steer * 0.5), r = 0.12;
  s.hands[0].set(r * c, 0.5 + r * n * 0.6, 0.33); s.hands[1].set(-r * c, 0.5 - r * n * 0.6, 0.33);
  s.tilt = 0.32; s.turn = steer * 0.12; s.lean = -steer * 0.12; s.knee = 0; s.hop = 0; s.shift = 0; s.hipZ = 0;
  s.look = V(steer * 0.5, 0.85, 2); s.squint = false;
  s.club.set(0, -1, 0); s.handDir = [FIST, FIST];
}

/* ---------------- the swing ---------------- */
// All swing state is in the golfer's local frame: x toward the target, y up, z toward the ball line.
//
// The Half Sword idea: you don't press attack, the mouse IS your hands. Moving it steers the hands over a
// shell around the shoulders in any direction: left and right sweep across the body, up lifts in front and
// overhead, and anything between is a diagonal cut. The hands chase that point with a capped force, the
// follow used by active ragdolls (see ashleve/ActiveRagdoll, MIT: PD error, then ClampMagnitude), so the
// club's weight is what you feel. The head is a mass on a wrist spring, so it lags and whips. Wind up the
// other way first or you get no speed. The same swing strikes a ball or a friend.
const V_DEAD = 0.14, VERT_SENS = 0.75, MAX_ARC = 2.3, MOUSE = 0.0048, MIN_LIFT = -V_DEAD;   // the hands can't go below the level of a normal swing
export class Swing {
  constructor() {
    this.R = rig();
    this.waistY = this.R.ankle + this.R.shin + this.R.thigh + this.R.hipDrop - 0.03;
    const tilt = 0.38;
    const sh = this.R.shoulders[0].y;
    this.S = V(0, this.waistY + sh * Math.cos(tilt), sh * Math.sin(tilt) - 0.02);   // shoulder centre
    this.gripAddr = V(0, GRIP_Y, 0.29);
    this.rA = this.S.distanceTo(this.gripAddr);
    this.a0 = V().subVectors(this.gripAddr, this.S).normalize();  // arm direction at address
    this.e2 = V(0, this.a0.z, -this.a0.y).normalize();              // lifting: up and away, square to the arms
    this.hand = V(); this.handV = V(); this.reach = 0.995;
    this.target = new THREE.Vector2();  // where the hands are headed: x sweeps toward the target, y lifts (radians from address)
    this.head = V(); this.headV = V(); this.prevHead = V(); this.prevHand = V(); this.lastDt = 1 / 360;
    this.zero = CLUBS.map(() => ({ z: null, path: 0, face: 0, v: 0 }));   // what a clean full swing does, per club
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
    this.e2c = V(0, this.d0.z, -this.d0.y).normalize();
    this.ball = V(0.05, LOCAL_BALL_R, this.zero[i].z ?? this.reachZ);
    this.reset();
  }
  // Run clean swings of several strengths for each club against a test ball and remember what they do: the
  // line the middle of the face travels along on a full swing (the strike lane on the turf shows it), and
  // the head's natural path, face angle and strike height at each speed, which count as straight and centred.
  calibrate() {
    const swingOnce = (power, onStep) => {
      this.reset();
      const dt = 1 / 360, frames = [[24, -14, 0], [14, 0, 0], [10, 60 * power, 0], [6, 10, 0]];
      for (const [n, dx, dy] of frames) for (let f = 0; f < n; f++) {
        this.input(dx, dy);
        for (let i = 0; i < 6; i++) { this.step(dt, true); if (onStep() === false) return; }
      }
    };
    for (let i = 0; i < CLUBS.length; i++) {
      this.setClub(i);
      const rows = [];
      for (const power of [1, 0.6, 0.4, 0.25]) {
        // First find where the head crosses the ball, then exactly how it meets one there.
        let z = null;
        swingOnce(power, () => { if (this.prevHead.x < -0.07 && this.head.x >= -0.07 && this.headV.x > 0) { z = this.head.z; return false; } });
        if (z === null) continue;
        const ball = V(0.05, LOCAL_BALL_R, z);
        let hit = null;
        swingOnce(power, () => { if (this.headV.x > 0.4) hit = this.probe(ball); if (hit && !hit.overlap) return false; hit = null; });
        if (!hit) continue;
        const p = hit.vel, fv = hit.frameFace;
        rows.push({ hs: Math.hypot(p.x, p.z), z: z - hit.u, path: Math.atan2(p.z, p.x), face: Math.atan2(fv.z, fv.x), v: hit.v });
      }
      rows.sort((a, b) => a.hs - b.hs);
      this.zero[i] = { z: rows.length ? rows[rows.length - 1].z : this.reachZ, rows };
    }
    this.setClub(3);
  }
  // What a clean swing at this head speed does with the current club.
  cleanAt(hs) {
    const rows = this.zero[this.ci].rows || [];
    if (!rows.length) return { path: 0, face: 0, v: 0 };
    if (hs <= rows[0].hs) return rows[0];
    for (let i = 1; i < rows.length; i++) if (hs <= rows[i].hs) {
      const a = rows[i - 1], b = rows[i], k = (hs - a.hs) / Math.max(1e-6, b.hs - a.hs), mix = n => a[n] + (b[n] - a[n]) * k;
      return { path: mix('path'), face: mix('face'), v: mix('v') };
    }
    return rows[rows.length - 1];
  }
  // Position of the club at the fraction t of the last physics step.
  frameAt(t, f) {
    f.hand.lerpVectors(this.prevHand, this.hand, t);
    f.head.lerpVectors(this.prevHead, this.head, t);
    _s.subVectors(f.head, f.hand).normalize();
    clubBasis(_s, this.faceAt(f.hand, _f3), f.x, f.y, f.z);
    f.o.copy(f.hand).addScaledVector(_s, -0.03);
    return f;
  }
  // Touching the ball with the head (a rounded box) or the shaft (a thin capsule)? Local coordinates.
  touch(f, ball, Rb = LOCAL_BALL_R) {
    const col = fitClub(this.ci).col;
    wrapPoint(f, col.c, _c0); wrapDir(f, col.toe, _ct); wrapDir(f, col.up, _cu); wrapDir(f, col.face, _cf);
    _r.subVectors(ball, _c0);
    const u = _r.dot(_ct), v = _r.dot(_cu), w = _r.dot(_cf);
    const cu = THREE.MathUtils.clamp(u, -col.h.x, col.h.x), cv = THREE.MathUtils.clamp(v, -col.h.y, col.h.y), cw = THREE.MathUtils.clamp(w, -col.h.z, col.h.z);
    let du = u - cu, dv = v - cv, dw = w - cw;
    let dist = Math.hypot(du, dv, dw), n = null, part = 'head';
    if (dist < Rb + col.r) {
      if (dist > 1e-6) { du /= dist; dv /= dist; dw /= dist; }
      else {
        // The ball's centre is inside the box: leave by the nearest side.
        const su = col.h.x - Math.abs(u), sv = col.h.y - Math.abs(v), sw = col.h.z - Math.abs(w);
        du = dv = dw = 0;
        if (su <= sv && su <= sw) du = Math.sign(u) || 1; else if (sv <= sw) dv = Math.sign(v) || 1; else dw = Math.sign(w) || 1;
      }
      n = V().addScaledVector(_ct, du).addScaledVector(_cu, dv).addScaledVector(_cf, dw).normalize();
      const q = V().copy(ball).addScaledVector(n, -Rb);
      return { part, n, q, dist: dist + 0, depth: Rb + col.r - dist, u: u - col.sweetU, v: v - col.sweetV, du, dv, dw, frameFace: _cf.clone() };
    }
    // The shaft and hosel: a shank.
    for (const [a, b] of [[V(), col.hosel], [col.hosel, col.heel]]) {
      wrapPoint(f, a, _s0); wrapPoint(f, b, _s1);
      _sd.subVectors(_s1, _s0);
      const l2 = _sd.lengthSq(), s = l2 > 1e-9 ? THREE.MathUtils.clamp(_r.subVectors(ball, _s0).dot(_sd) / l2, 0, 1) : 0;
      _r.copy(_s0).addScaledVector(_sd, s);
      const away = V().subVectors(ball, _r), dd = away.length();
      if (dd < Rb + SHAFT_R) {
        n = dd > 1e-6 ? away.divideScalar(dd) : _cf.clone();
        return { part: 'shaft', n, q: _r.clone(), dist: dd, depth: Rb + SHAFT_R - dd, u: 0, v: 0, du: 0, dv: 0, dw: 0, frameFace: _cf.clone() };
      }
    }
    return null;
  }
  // First contact with the ball during the last physics step, swept through the motion so nothing tunnels.
  probe(ball, R = LOCAL_BALL_R) {
    const STEPS = 8;
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS, hit = this.touch(this.frameAt(t, _f0), ball, R);
      if (!hit) continue;
      hit.overlap = k === 0;
      hit.t = t; hit.headAt = _f0.head.clone();
      // The contact point's own velocity: how the club moved that point over the step.
      this.frameAt(0, _f1); this.frameAt(1, _f2);
      const toCoords = (f, out) => out.set(_r.subVectors(hit.q, _f0.o).dot(_f0.x), _r.dot(_f0.y), _r.dot(_f0.z));
      toCoords(_f0, _c0);
      hit.vel = wrapPoint(_f2, _c0, V()).sub(wrapPoint(_f1, _c0, V())).divideScalar(this.lastDt);
      return hit;
    }
    return null;
  }
  // The middle of the face right now, in local coordinates, plus the head's footprint for drawing.
  headBox(out = {}) {
    const col = fitClub(this.ci).col, f = this.frameAt(1, _f0);
    out.c = wrapPoint(f, col.c, out.c || V()); out.toe = wrapDir(f, col.toe, out.toe || V());
    out.up = wrapDir(f, col.up, out.up || V()); out.face = wrapDir(f, col.face, out.face || V());
    out.h = col.h; out.r = col.r;
    return out;
  }
  reset() {
    // Address with the head a little behind the ball (the putter, with locked wrists, needs more room).
    this.target.set((this.club.cock ? -0.02 : -0.05) / this.rA, 0);
    this.reach = 0.995;
    this.handAt(this.target.x, this.target.y, this.reach, this.hand);
    this.handV.set(0, 0, 0);
    this.prefDir(_a);
    this.head.copy(this.hand).addScaledVector(_a, this.club.len);
    this.prevHead.copy(this.head); this.headV.set(0, 0, 0);
    this.hit = false; this.armed = true; this.maxHeadSpeed = 0;
  }
  // Where the hands are for a sweep angle u and lift v. The lift has a small dead band and comes in gently, so
  // mouse wobble can't change the bottom of a level swing and a diagonal swing flattens out as it reaches the ball.
  handAt(u, v, reach, out) {
    const x = Math.max(0, Math.abs(v) - V_DEAD), lift = Math.sign(v) * x * x / (x + 0.5), th = Math.hypot(u, lift), r = this.rA * reach;
    if (th < 1e-6) return out.copy(this.S).addScaledVector(this.a0, r);
    const k = Math.sin(th) / th;
    return out.copy(this.S).addScaledVector(this.a0, r * Math.cos(th)).addScaledVector(XV, r * k * u).addScaledVector(this.e2, r * k * lift);
  }
  // Where the wrists want the club for given hands, and which way its face looks. The club turns the same way
  // the arms have, a bit further because the wrists cock, and never wraps round behind the golfer's back.
  wrist(hand) {
    const rel = _b.subVectors(hand, this.S);
    const s = rel.dot(XV), up = rel.dot(this.e2), r = rel.dot(this.a0), side = Math.hypot(s, up);
    const th = Math.atan2(side, r), us = side > 1e-6 ? s / side : 0, vs = side > 1e-6 ? up / side : 0;
    const back = s < 0 || up > Math.abs(s), cg = this.club.cock;
    const cock = cg * (back ? THREE.MathUtils.clamp(th / 1.6, 0, 1) : THREE.MathUtils.clamp(th / 1.8, 0, 1) * 0.75);
    return { phi: Math.min(th + cock, 2.6), us, vs, alpha: Math.atan2(s, r) };
  }
  prefDir(out) {
    const w = this.wrist(this.hand);
    this.alpha = w.alpha;
    const c = Math.cos(w.phi), sn = Math.sin(w.phi);
    return out.copy(this.d0).multiplyScalar(c).addScaledVector(XV, sn * w.us).addScaledVector(this.e2c, sn * w.vs).normalize();
  }
  // Square at address; turns rigidly with the arms and wrists after that.
  faceAt(hand, out) {
    const w = this.wrist(hand), c = Math.cos(w.phi), sn = Math.sin(w.phi);
    // The tangent of the arc, plus whatever part of "toward the target" lies across it.
    return out.set(0, 0, 0)
      .addScaledVector(this.d0, -sn * w.us).addScaledVector(XV, c * w.us * w.us + w.vs * w.vs).addScaledVector(this.e2c, c * w.vs * w.us - w.us * w.vs);
  }
  // Mouse deltas in pixels (dx right, dy down). thrust: pull back and push to jab instead of lifting.
  input(dx, dy, thrust = false) {
    const k = MOUSE * this.club.sens;
    this.target.x += dx * k;
    if (thrust) this.reach = THREE.MathUtils.clamp(this.reach - dy * 0.0016, 0.5, 0.995);
    else this.target.y = Math.max(MIN_LIFT, this.target.y - dy * k * VERT_SENS);
    this.thrusting = thrust;
    const l = this.target.length();
    if (l > MAX_ARC) this.target.multiplyScalar(MAX_ARC / l);
  }
  step(dt, ground) {
    const C = this.club;
    this.lastDt = dt; this.prevHand.copy(this.hand);
    // Hands: spring toward the target with capped acceleration and speed (the weight of the club).
    if (!this.thrusting) this.reach += (0.995 - this.reach) * (1 - Math.exp(-dt * 8));
    const T = this.handAt(this.target.x, this.target.y, this.reach, _c);
    const acc = _d.subVectors(T, this.hand).multiplyScalar(900).addScaledVector(this.handV, -55);
    if (acc.length() > C.aMax) acc.setLength(C.aMax);
    this.handV.addScaledVector(acc, dt);
    if (this.handV.length() > C.vMax) this.handV.setLength(C.vMax);
    this.hand.addScaledVector(this.handV, dt);
    // The arms stay extended: the hands slide round the shell instead of cutting a chord through it, so a
    // diagonal swing reaches the same bottom as a level one.
    const rel = _a.subVectors(this.hand, this.S); const rl = rel.length();
    if (rl > 1e-6) { rel.multiplyScalar(this.rA * this.reach / rl); this.hand.copy(this.S).add(rel); const out = rel.normalize(); this.handV.addScaledVector(out, -this.handV.dot(out)); }
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
  // Did the club hit the ball during this physics step? Returns launch info in local coords or null.
  // Everything comes from the real contact: which part of the club touched the ball, where on the face,
  // and how that point of the club was moving.
  strike(ball) {
    if (!this.armed) return null;
    const hit = this.probe(ball);
    if (!hit) return null;
    const vp = hit.vel, arrive = vp.dot(hit.n);
    // A club already resting on the ball or easing up to it doesn't play a shot: the ball stays put and the
    // club stops against it instead of passing through.
    if (hit.overlap || arrive < 0.4) {
      if (hit.overlap) this.head.addScaledVector(hit.n, -(hit.depth + 0.002));
      else this.head.copy(hit.headAt).addScaledVector(hit.n, -0.002);
      this.headV.set(0, 0, 0);
      return null;
    }
    this.armed = false;
    const C = this.club, col = fitClub(this.ci).col, hs = Math.hypot(vp.x, vp.z), clean = this.cleanAt(hs);
    const path = Math.atan2(vp.z, vp.x) - clean.path, attack = Math.atan2(vp.y, hs);
    const faceYaw = Math.atan2(hit.frameFace.z, hit.frameFace.x) - clean.face;
    const toe = THREE.MathUtils.clamp(hit.u / (col.h.x + col.r), -2, 2);
    const low = hit.v - clean.v;         // + the ball met the face higher than a clean strike, so the head was low
    const dyN = THREE.MathUtils.clamp(low / 0.1, -1, 1);
    const putter = C.id === 'putter', info = { path, club: C.id, contact: hit.q.clone(), headSpeed: vp.length() };
    // The shaft or the very end of the head: the ball goes the way the geometry pushes it, and not fast.
    if (hit.part === 'shaft' || Math.abs(hit.du) > 0.72 || hit.dw < 0.2) {
      const kind = hit.part === 'shaft' ? 'shank' : Math.abs(hit.du) > 0.72 ? (hit.du > 0 ? 'toe' : 'heel') : hit.dw < -0.2 ? 'backhand' : hit.dv < 0 ? 'topped' : 'skied';
      const v = hit.n.clone().multiplyScalar(Math.max(arrive, 0) * (kind === 'shank' ? 0.55 : 0.75) * C.smash);
      if (v.y < 0) v.y = 0.3;
      return { ...info, v, spin: 0, quality: 0, kind: putter ? 'putt' : kind, launch: Math.atan2(v.y, Math.hypot(v.x, v.z)), bite: false, where: kind };
    }
    let launch = C.loft * Math.PI / 180 * (0.95 + 0.2 * dyN) + attack * 0.15;
    let q = (1 - Math.min(1, Math.abs(dyN) * 0.9)) * (1 - 0.45 * Math.min(1, Math.abs(toe) * 0.5));
    let speed = hs * C.smash * (0.72 + 0.28 * q);
    let kind = q > 0.88 ? 'pure' : 'ok';
    if (low < -0.035 && !putter) { launch = Math.min(launch, 0.04); speed *= 0.62; kind = 'topped'; }
    if (putter) { launch = Math.max(0.0, Math.min(launch, 0.09)); speed = hs * C.smash; kind = 'putt'; }
    launch = THREE.MathUtils.clamp(launch, -0.05, 1.25);
    // The ball starts mostly where the face looks and takes some of the head's path; off the toe or heel
    // the head twists round the ball.
    const start = faceYaw * START_FACE + path * (1 - START_FACE) + toe * 0.12;
    const v = V(Math.cos(start), 0, Math.sin(start)).multiplyScalar(Math.cos(launch) * speed); v.y = Math.sin(launch) * speed;
    const spin = putter ? 0 : THREE.MathUtils.clamp(-(path - faceYaw) * 22 * (speed / 30), -9, 9);
    return { ...info, v, spin, quality: q, kind, launch, bite: !!C.bite, where: Math.abs(toe) < 0.4 ? 'middle' : toe > 0 ? 'toe' : 'heel' };
  }
}
