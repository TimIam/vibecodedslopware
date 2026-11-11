// Active ragdolls, in the manner of Half Sword. Every golfer's body is a set of separate rigid bodies in a
// Rapier world (hips, torso, head, two upper arms, two forearms, two thighs, two shins and the club), held
// together by ball joints. Nothing is posed directly any more: the game's animation and the player's mouse
// still work out a pose every frame (Golfer.pose), but that pose is only the TARGET. Each joint has a motor
// made of a spring and a damper that pulls the child limb's angle toward the target angle relative to its
// parent, and the bodies go wherever the forces take them, so a limb that meets another golfer stops,
// pushes and is pushed back.
//
// Rapier's own motors (configureMotorPosition on revolute and prismatic joints) work on one axis only and
// its ball joint (SphericalImpulseJoint) has none, so the motor here is our own spring and damper:
//   spin change = (h w0^2 angleError - (2 zeta w0 h + w0^2 h^2) spinError) / (1 + 2 zeta w0 h + w0^2 h^2)
// pushed into the limb as a torque impulse every 1/240 s physics step (h). That is the spring-damper solved
// backward in time (implicit), the way a physics engine solves its own motors, so no stiffness can make it
// overshoot and shake. w0 is the joint's spring frequency (RAGDOLL.freq), scaled by the square root of
// RAGDOLL.stiffness, the stiff-to-floppy setting; zeta is RAGDOLL.damping. The angle error is measured
// against the parent as it is now, so a limb holds its pose relative to a body that is being knocked about.
// The spin change is turned into a push with the inertia the joint really moves: the limb about the joint
// (a limb turns about its joint, not its middle), plus the mass hanging further down, which a ball joint
// passes on as weight but not as spin. Swinging a limb and twisting it about its own length are very
// different loads, so the two are worked out separately. The motor pushes on the limb; the joint carries
// the reaction into the rest of the body.
// Limbs are aimed, not twisted: the animation only says which way an arm or leg points (its twist is an
// accident of how the pose was built, and flips when an arm points straight up), so a limb's motor pulls
// its direction and only damps its twist. A forearm or shin follows where its upper arm or thigh points,
// not how it happens to be twisted. The club's motor aims it in the world, the way the swing holds it, so
// its face stays true whatever the forearm does.
//
// Standing up is the hips' job: they are pulled to where the game's walking puts the golfer by a spring of
// their own (RAGDOLL.root), and the body feels only RAGDOLL.weight of its weight. Knocked out, the hips are
// let go, the joints go almost slack and full gravity drops the body onto a floor under it.
import * as THREE from 'three';
import { ACTOR, G } from './physics.js';
import { CLUBS } from './golfer.js';

export const RAGDOLL = {
  stiffness: 1,       // the Esc menu's floppy-to-stiff slider: multiplies every joint spring (0.1 floppy, 2.5 stiff)
  damping: 0.85,      // damping ratio of every joint motor: 1 settles without overshoot, less is bouncier
  freq: { waist: 24, neck: 20, shoulder: 24, elbow: 24, hip: 20, knee: 20, wrist: 32 },   // spring frequency, rad/s, at stiffness 1
  root: { freq: 16, turn: 14, damping: 1 },    // how hard the hips are held to where the game puts the golfer
  weight: 0.2,        // share of gravity a standing body feels (its muscles hold the rest); knocked out, all of it
  koStrength: 0.05,   // share of the joint springs left in a knocked-out body
  getUp: 0.8,         // seconds to stiffen back up after a knockout
  maxAccel: 1500,     // cap on any motor's angular acceleration, rad/s², so one bad frame can't fling a limb
  hz: 240,            // physics steps per second (about: each frame is cut into equal steps of about this size)
  grip: { freq: 70, damping: 1, trailArm: 0.15 },     // the spring that keeps the trail hand on the club while swinging (rad/s, ratio)
  snap: 1.5,          // metres: a body this far from where it should be is put straight back (teleports, respawns)
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = V(), _s = V(), _a = V(), _b = V(), _c = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const ball = (r, x, y, z) => ({ ball: r, at: [x, y, z] });
const cap = (len, r) => ({ cap: Math.max(0.002, len / 2 - r), r, at: [0, -len / 2, 0] });
// The segments, in golfer units (scaled by ACTOR in the world). Each body's origin is its joint with its
// parent, which is where Golfer.pose puts the matching model, so a model and its body share one frame.
// [name, parent, kg, joint, colliders(rig)]. The trailing digit is the side: 0 lead (left), 1 trail.
const SEGS = [
  ['hips', null, 8, null, () => [ball(0.17, 0, -0.03, 0)]],
  ['torso', 'hips', 14, 'waist', () => [ball(0.19, 0, 0.14, 0)]],
  ['head', 'torso', 4, 'neck', () => [ball(0.2, 0, 0.14, 0)]],
  ['ua0', 'torso', 2, 'shoulder', R => [cap(R.upper, 0.045)]], ['ua1', 'torso', 2, 'shoulder', R => [cap(R.upper, 0.045)]],
  ['fa0', 'ua0', 1.5, 'elbow', R => [cap(R.fore + 0.05, 0.045)]], ['fa1', 'ua1', 1.5, 'elbow', R => [cap(R.fore + 0.05, 0.045)]],
  ['th0', 'hips', 4, 'hip', R => [cap(R.thigh, 0.06)]], ['th1', 'hips', 4, 'hip', R => [cap(R.thigh, 0.06)]],
  ['sh0', 'th0', 3, 'knee', R => [cap(R.shin + R.ankle * 0.5, 0.055)]], ['sh1', 'th1', 3, 'knee', R => [cap(R.shin + R.ankle * 0.5, 0.055)]],
  ['club', 'fa0', 0.5, 'wrist', null],
];
const GRIP = V(0, -0.03, 0);     // where the lead hand holds the club, in the club's own frame
const KIND = n => n.replace(/\d$/, '');
// The model each segment drives, and the smaller models that ride along with it.
function meshOf(g, n) {
  const k = +n.slice(-1);
  switch (KIND(n)) {
    case 'hips': return g.p.hips; case 'torso': return g.p.torso; case 'head': return g.p.head;
    case 'ua': return g.p.ua[k]; case 'fa': return g.p.fa[k]; case 'th': return g.p.th[k]; case 'sh': return g.p.sh[k];
    case 'club': return g.club >= 0 ? g.clubs[g.club] : null;
  }
}
function riders(g, n) {
  const k = +n.slice(-1);
  switch (KIND(n)) {
    case 'head': return [g.p.eyes, g.p.stache, g.crown, ...Object.values(g.hats)];
    case 'fa': return [g.p.hand[k]];
    case 'sh': return [g.p.shoe[k]];
  }
  return [];
}
function clubShapes(ci) {
  const L = CLUBS[ci].len;
  return [{ cap: Math.max(0.01, (L - 0.08) / 2), r: 0.018, at: [0, -0.03 - (L - 0.08) / 2, 0] }, { ball: 0.05, at: [0, -L, 0], head: true }];
}

export class Ragdolls {
  // Rapier is fetched when the game starts. If it can't be had, the game carries on with posed bodies.
  static async load() {
    const R = (await import('@dimforge/rapier3d-compat')).default;
    await R.init();
    return new Ragdolls(R);
  }
  constructor(R) {
    this.R = R;
    this.world = new R.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = 1 / RAGDOLL.hz;
    this.events = new R.EventQueue(true);
    this.dolls = new Map();       // golfer -> doll
    this.cols = new Map();        // collider handle -> { doll, seg }
    this.slots = [0, 1, 2, 3, 4, 5, 6];
    this.onHit = null;            // (hit) => void, see contacts()
    this.groundAt = null;         // (x, y, z) => height of the ground under that point, or null
  }
  remove(golfer) {
    const d = this.dolls.get(golfer); if (!d) return;
    d.grip = null;
    for (const m of managed(golfer)) m.matrixAutoUpdate = true;
    for (const s of d.segs) { for (const c of s.cols) this.cols.delete(c.handle); this.world.removeRigidBody(s.body); }
    this.world.removeRigidBody(d.floor);
    this.slots.push(d.slot); this.dolls.delete(golfer);
  }
  // One frame. list: [{ golfer, key, ground (y under the golfer), mode: 'active' | 'kinematic', ko: bool,
  // twoHands: bool (both hands on the club) }].
  // Call it after every golfer has been posed: their models hold the targets, and come back holding the bodies.
  step(dt, list) {
    for (const it of list) this.prepare(it, dt);
    // The frame's own time, cut into equal steps: what is drawn is always the bodies at this frame's moment.
    // (Fixed steps carried over between frames come out as 1, 2, 1, 2 steps a frame on a 144 Hz screen and
    // the bodies judder against the camera.)
    if (!(dt > 0)) return;
    const n = Math.min(10, Math.max(1, Math.round(dt * RAGDOLL.hz))), h = dt / n;
    this.world.timestep = h;
    for (let k = 0; k < n; k++) {
      for (const it of list) { const d = this.dolls.get(it.golfer); if (d) this.drive(d, h); }
      this.world.step(this.events);
      this.contacts();
    }
    for (const it of list) { const d = this.dolls.get(it.golfer); if (d) this.show(d); }
  }

  /* ---------- per frame ---------- */
  prepare(it, dt) {
    const g = it.golfer;
    let d = this.dolls.get(g);
    if (!d && !this.slots.length) return;
    // The animation has set every model's position, turn and size: build their matrices from that. After
    // the physics we write those matrices directly (show), so nothing is ever split back into position,
    // turn and size, which drifts: a turned, stretched part can't be split exactly, and the error grew
    // every frame on the parts the animation never resizes (hands, shoes, hats).
    for (const m of managed(g)) { m.matrixAutoUpdate = false; m.updateMatrix(); }
    g.root.updateMatrixWorld(true);
    if (!d) d = this.build(it);
    d.key = it.key; d.mode = it.mode;
    // Targets: where the animation put every model this frame.
    for (const s of d.segs) {
      const mesh = meshOf(g, s.name) || (s.name === 'club' ? g.p.fa[0] : null);
      s.mesh = meshOf(g, s.name);
      mesh.matrixWorld.decompose(s.tp, s.tq, s.ts);
      if (s.name === 'club' && !s.mesh) s.tp.add(_a.set(0, -(g.R.fore + 0.03) * ACTOR, 0).applyQuaternion(s.tq));     // no club: it hangs from the hand
      s.tm.compose(s.tp, s.tq, _s.set(1, 1, 1));
      (s.tw || (s.tw = new THREE.Matrix4())).copy(mesh.matrixWorld);
      s.ride = riders(g, s.name).filter(r => r.visible).map(r => ({ mesh: r, tw: r.matrixWorld.clone() }));
    }
    // Each joint's target angle, and how fast that target is turning (in the parent's frame), so a motor can
    // keep up with a moving pose instead of always trailing it.
    for (const j of d.joints) {
      j.rel.copy(j.parent.tq).invert().multiply(j.child.tq);
      spin(j.rel, j.relPrev, dt, j.wT); j.relPrev.copy(j.rel);
    }
    for (const x of d.segs) { spin(x.tq, x.prevQ, dt, x.wW); x.prevQ.copy(x.tq); }
    d.wT.copy(d.segs[0].wW);
    // What each joint really carries, in this frame's pose.
    for (const j of d.joints) {
      const C = j.child, piv = _c.copy(j.a2).applyQuaternion(C.tq).add(C.tp);
      j.axis.set(0, 1, 0).applyQuaternion(C.tq);
      const r = _b.copy(C.com).applyQuaternion(C.tq).add(C.tp).sub(piv), m = C.body.mass(), al = r.dot(j.axis);
      let Is = avgInertia(C.body) + m * r.lengthSq(), It = axialInertia(C) + m * Math.max(0, r.lengthSq() - al * al);
      for (const k of j.next) {
        let M = 0; for (const x of k.below) M += x.body.mass();
        const q = _a.copy(k.a2).applyQuaternion(k.child.tq).add(k.child.tp).sub(piv), aq = q.dot(j.axis);
        Is += M * q.lengthSq(); It += M * Math.max(0, q.lengthSq() - aq * aq);
      }
      j.Is = Math.max(1e-6, Is); j.It = Math.max(1e-7, It);
    }
    if ((g.club ?? -1) !== d.club) this.fitClub(d, g.club);
    this.trailGrip(d, !!it.twoHands && d.club >= 0 && it.mode === 'active' && !it.ko);
    // Holding on, the trail hand is drawn where the pose puts it on the club: the posed forearm stretches to
    // reach the grip and the physical one can't, so drawn on the forearm it would hover off the club.
    if (d.grip) {
      const fa = d.segs.find(x => x.name === 'fa1'), club = d.segs.find(x => x.name === 'club'), i = fa.ride.findIndex(r => r.mesh === g.p.hand[1]);
      if (i >= 0 && club.mesh) club.ride.push(...fa.ride.splice(i, 1));
    }
    const hips = d.segs[0];
    d.vT.copy(hips.tp).sub(d.lastT).divideScalar(Math.max(dt, 1e-4));
    if (d.vT.length() > 30) d.vT.set(0, 0, 0);
    d.lastT.copy(hips.tp);
    // Knockouts: let go, then stiffen back up over RAGDOLL.getUp.
    if (it.ko) { d.ko = true; d.up = 0; } else if (d.ko) { d.ko = false; d.up = 1e-3; }
    if (d.up > 0) { d.up += dt / RAGDOLL.getUp; if (d.up >= 1) d.up = 0; }
    const lost = hips.body.translation(); _a.set(lost.x, lost.y, lost.z);
    if (it.mode === 'kinematic' || (!d.ko && _a.distanceTo(hips.tp) > RAGDOLL.snap)) this.snap(d);
    // The floor under a knocked-out golfer: wherever its body actually is, at the ground's height there (none
    // over a drop, so it falls). Standing, it is out of the way, so feet don't scrape on slopes.
    if (d.ko || d.up) {
      const g0 = this.groundAt ? this.groundAt(lost.x, lost.y, lost.z) : it.ground;
      d.floor.setNextKinematicTranslation({ x: lost.x, y: g0 == null ? -1e4 : g0 - 0.1, z: lost.z });
    } else d.floor.setNextKinematicTranslation({ x: hips.tp.x, y: it.ground - 0.45, z: hips.tp.z });
    const gs = d.ko ? 1 : d.up ? 1 - (1 - RAGDOLL.weight) * d.up : RAGDOLL.weight;
    if (gs !== d.gs) { d.gs = gs; for (const s of d.segs) s.body.setGravityScale(gs, true); }
  }
  // Both hands on the club: a spring from the trail hand to its place on the grip, made where the pose
  // puts it, and let go again when the golfer lets go.
  // (Our own spring between the two points, solved like the joint motors: Rapier's spring joint at zero rest
  // length divides by the distance between them and goes to NaN.)
  trailGrip(d, want) {
    if (want === !!d.grip) return;
    if (!want) { d.grip = null; return; }
    const fa = d.segs.find(x => x.name === 'fa1'), club = d.segs.find(x => x.name === 'club');
    const hand = d.golfer.p.hand[1].getWorldPosition(V());
    d.grip = { fa, club, a1: hand.clone().sub(fa.tp).applyQuaternion(fa.tq.clone().invert()), a2: hand.clone().sub(club.tp).applyQuaternion(club.tq.clone().invert()) };
  }
  holdGrip(d, h) {
    const G = d.grip, B1 = G.fa.body, B2 = G.club.body;
    const p1 = worldPoint(B1, G.a1, V()), p2 = worldPoint(B2, G.a2, V());
    const v1 = pointVelAt(B1, p1), v2 = pointVelAt(B2, p2);
    // The hand is pulled onto the club and the club is left alone: the swing steers the club, and a trail
    // hand dragging on it knocked it off the line the player swung.
    implicit(_c, _a.subVectors(p2, p1), _b.subVectors(v1, v2), RAGDOLL.grip.freq, RAGDOLL.grip.damping, h);
    B1.applyImpulseAtPoint(_c.multiplyScalar(B1.mass()), p1, true);
  }
  // Put every body exactly on its target, still. For teleports, carts and the title screen.
  snap(d) {
    for (const s of d.segs) {
      s.body.setTranslation(s.tp, true); s.body.setRotation(s.tq, true);
      s.body.setLinvel(d.mode === 'kinematic' ? d.vT : { x: 0, y: 0, z: 0 }, true); s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  // The springs, once per physics step.
  drive(d, h) {
    if (d.mode === 'kinematic') return;
    const strength = d.ko ? RAGDOLL.koStrength : d.up ? RAGDOLL.koStrength + (1 - RAGDOLL.koStrength) * d.up : 1;
    const stiff = Math.max(0.01, RAGDOLL.stiffness) * strength, zeta = RAGDOLL.damping;
    for (const j of d.joints) {
      const P = j.parent.body, C = j.child.body;
      // Where the child should be turned to, given where the parent is now, and how far off it is.
      const qp = P.rotation(), qc = C.rotation(), wp = P.angvel(), wc = C.angvel();
      const club = j.child.name === 'club';
      // The target: relative to the parent as it is now; for a limb hanging off a limb, turned only by how far
      // the parent limb has swung off its own target (not by its twist); for the club, in the world.
      const limbParent = !club && !['hips', 'torso'].includes(j.parent.kind);
      if (club) _q.copy(j.child.tq);
      else if (limbParent) {
        _p.set(0, 1, 0).applyQuaternion(j.parent.tq); _s.set(0, 1, 0).applyQuaternion(_q2.set(qp.x, qp.y, qp.z, qp.w));
        _q.setFromUnitVectors(_p, _s).multiply(j.child.tq);
      } else _q.set(qp.x, qp.y, qp.z, qp.w).multiply(j.rel);
      _q2.set(qc.x, qc.y, qc.z, qc.w);
      if (j.round || club) {
        _q.multiply(_q2.invert());
        if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
        const sn = Math.hypot(_q.x, _q.y, _q.z), ang = 2 * Math.atan2(sn, _q.w);
        if (sn > 1e-9) _a.set(_q.x, _q.y, _q.z).multiplyScalar(ang / sn); else _a.set(0, 0, 0);
      } else {
        // A limb: only the turn that swings its length onto the target's.
        const now = _p.set(0, 1, 0).applyQuaternion(_q2), want = _s.set(0, 1, 0).applyQuaternion(_q);
        _a.crossVectors(now, want); const sn = _a.length(), ang = Math.atan2(sn, now.dot(want));
        if (sn > 1e-9) _a.multiplyScalar(ang / sn); else _a.set(0, 0, 0);
      }
      if (club) _b.set(wc.x, wc.y, wc.z).sub(j.child.wW);
      else if (limbParent) _b.set(wc.x - wp.x, wc.y - wp.y, wc.z - wp.z).sub(_c.copy(j.child.wW).sub(j.parent.wW));
      else _b.set(wc.x - wp.x, wc.y - wp.y, wc.z - wp.z).sub(_c.copy(j.wT).applyQuaternion(_q2.set(qp.x, qp.y, qp.z, qp.w)));
      // With both hands on the club the trail arm follows the grip, not its own pose: it only steers.
      const w0 = RAGDOLL.freq[j.kind] * Math.sqrt(stiff * (d.grip && (j.child.name === 'fa1' || j.child.name === 'ua1') ? RAGDOLL.grip.trailArm : 1));
      implicit(_c, _a, _b, w0, zeta, h);
      // Swing and twist (about the limb's own length) each get the inertia they actually move.
      if (j.round) _c.multiplyScalar(j.Is);
      else { const t = _c.dot(j.axis); _c.addScaledVector(j.axis, -t).multiplyScalar(j.Is).addScaledVector(j.axis, t * j.It); }
      C.applyTorqueImpulse(_c, true);
    }
    if (d.grip) this.holdGrip(d, h);
    // The hips, held where the game wants the golfer to be, carrying the part of the body's weight it feels.
    if (d.ko) return;
    const hips = d.segs[0], H = hips.body, rs = d.up || 1, R0 = RAGDOLL.root;
    const p = H.translation(), v = H.linvel(), w = R0.freq * Math.sqrt(rs);
    _a.set(hips.tp.x - p.x, hips.tp.y - p.y, hips.tp.z - p.z); _b.set(v.x - d.vT.x, v.y - d.vT.y, v.z - d.vT.z);
    implicit(_c, _a, _b, w, R0.damping, h); _c.y += G * d.gs * h;
    H.applyImpulse(_c.multiplyScalar(d.mass), true);
    const q = H.rotation();
    _q.copy(hips.tq).multiply(_q2.set(q.x, q.y, q.z, q.w).invert());
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const sn = Math.hypot(_q.x, _q.y, _q.z), ang = 2 * Math.atan2(sn, _q.w), wt = R0.turn * Math.sqrt(rs);
    if (sn > 1e-9) _a.set(_q.x, _q.y, _q.z).multiplyScalar(ang / sn); else _a.set(0, 0, 0);
    const av = H.angvel();
    implicit(_c, _a, _b.set(av.x, av.y, av.z).sub(d.wT), wt, R0.damping, h);
    H.applyTorqueImpulse(_c.multiplyScalar(d.torsoI), true);
  }
  // Draw the models where the bodies are.
  show(d) {
    for (const s of d.segs) {
      const t = s.body.translation(), r = s.body.rotation();
      // The rigid move physics made from the target frame, applied to the posed model and what rides on it.
      _m.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s.set(1, 1, 1)).multiply(_m2.copy(s.tm).invert());
      if (s.mesh) put(s.mesh, _m, s.tw);
      for (const rd of s.ride) put(rd.mesh, _m, rd.tw);
    }
  }
  // Two bodies started touching. The game hears about every touch between different golfers fast enough to
  // matter, with how fast the two touching points were closing and which part of each it was.
  contacts() {
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started || !this.onHit) return;
      const a = this.cols.get(h1), b = this.cols.get(h2);
      if (!a || !b || a.doll === b.doll) return;
      const va = pointVel(this.world.getCollider(h1)), vb = pointVel(this.world.getCollider(h2));
      const rel = V().subVectors(va, vb), speed = rel.length();
      // The one whose part was moving faster is the one doing the hitting.
      const [by, to, dir] = va.length() >= vb.length() ? [a, b, rel] : [b, a, rel.negate()];
      const c = this.world.getCollider(to.handle).translation();
      this.onHit({ by: by.doll.key, part: by.seg.kind, head: !!by.head, to: to.doll.key, hitPart: to.seg.kind, speed, dir: dir.normalize(), at: V(c.x, c.y, c.z) });
    });
  }

  /* ---------- building ---------- */
  build(it) {
    const R = this.R, g = it.golfer, slot = this.slots.shift();
    const d = { golfer: g, key: it.key, slot, segs: [], joints: [], club: -2, ko: false, up: 0, gs: -1, vT: V(), lastT: V(), mass: 0, torsoI: 1,
      member: 1 << slot, filter: (0x7f & ~(1 << slot)) | (1 << (8 + slot)) };
    const byName = {};
    for (const [name, parent, kg, joint, shapes] of SEGS) {
      const mesh = meshOf(g, name) || g.p.fa[0];
      const s = { name, kind: KIND(name), kg, tp: V(), tq: new THREE.Quaternion(), ts: V(1, 1, 1), tm: new THREE.Matrix4(), cols: [], ride: [] };
      mesh.matrixWorld.decompose(s.tp, s.tq, s.ts);
      s.com = V();
      s.body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(s.tp.x, s.tp.y, s.tp.z).setRotation(s.tq)
        .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.4).setCcdEnabled(name === 'club' || KIND(name) === 'fa'));
      if (shapes) this.addShapes(d, s, shapes(g.R));
      else s.body.setAdditionalMass(0.2, true);
      d.segs.push(s); byName[name] = s;
      if (parent) {
        const P = byName[parent];
        // The joint sits at this segment's own origin (or the club's grip), wherever that is in the parent now.
        const piv = name === 'club' ? GRIP.clone().multiplyScalar(ACTOR) : V();
        const world = piv.clone().applyQuaternion(s.tq).add(s.tp);
        const a1 = world.sub(P.tp).applyQuaternion(P.tq.clone().invert());
        const jt = this.world.createImpulseJoint(R.JointData.spherical(a1, piv), P.body, s.body, true);
        jt.setContactsEnabled(false);
        const j = { kind: joint, parent: P, child: s, rel: new THREE.Quaternion(), relPrev: P.tq.clone().invert().multiply(s.tq), wT: V(), jt, a1: a1.clone(), a2: piv.clone() };
        j.axis = V(); j.round = ['torso', 'head'].includes(name);
        d.joints.push(j);
      }
    }
    for (const s of d.segs) if (s.name !== 'club') d.mass += s.kg;
    // Each joint carries its child and everything hanging off the child.
    const kids = s => d.joints.filter(j => j.parent === s).flatMap(j => [j.child, ...kids(j.child)]);
    for (const j of d.joints) { j.below = [j.child, ...kids(j.child)]; j.next = d.joints.filter(k => k.parent === j.child); }
    d.torsoI = 4 * avgInertia(byName.hips.body) + avgInertia(byName.torso.body);
    d.floor = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(it.golfer.root.position.x, it.ground - 0.5, it.golfer.root.position.z));
    this.world.createCollider(R.ColliderDesc.cuboid(1.4, 0.1, 1.4).setFriction(0.9).setCollisionGroups(((1 << (8 + slot)) << 16) | (1 << slot)), d.floor);
    d.lastT.copy(byName.hips.tp); d.wT = V();
    for (const x of d.segs) { x.prevQ = x.tq.clone(); x.wW = V(); }
    this.dolls.set(g, d);
    return d;
  }
  addShapes(d, s, shapes) {
    const R = this.R, A = ACTOR;
    for (const sh of shapes) {
      const desc = (sh.ball ? R.ColliderDesc.ball(sh.ball * A) : R.ColliderDesc.capsule(sh.cap * A, sh.r * A))
        .setTranslation(sh.at[0] * A, sh.at[1] * A, sh.at[2] * A).setMass(s.kg / shapes.length).setFriction(0.6).setRestitution(0.1)
        .setCollisionGroups((d.member << 16) | d.filter).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const c = this.world.createCollider(desc, s.body);
      s.cols.push(c); this.cols.set(c.handle, { doll: d, seg: s, head: !!sh.head, handle: c.handle });
    }
    // Centre of mass, in the body's frame: each collider weighs the same share of the segment.
    s.com = V(); for (const sh of shapes) s.com.add(V(...sh.at).multiplyScalar(A / shapes.length));
  }
  // A new club in hand: new colliders of the right length (none for bare hands).
  fitClub(d, ci) {
    const s = d.segs.find(x => x.name === 'club');
    for (const c of s.cols) { this.cols.delete(c.handle); this.world.removeCollider(c, true); }
    s.cols = [];
    d.club = ci ?? -1;
    if (d.club >= 0 && CLUBS[d.club]) this.addShapes(d, s, clubShapes(d.club));
  }
}

// Every model the ragdoll draws: the body parts, what rides on them and all the clubs.
function managed(g) {
  const p = g.p;
  return [p.hips, p.torso, p.head, p.eyes, p.stache, g.crown, ...Object.values(g.hats), ...p.ua, ...p.fa, ...p.hand, ...p.th, ...p.sh, ...p.shoe, ...g.clubs];
}
// Set a model's own matrix so that it lands at world matrix rigid x tw.
function put(mesh, rigid, tw) {
  mesh.matrix.copy(mesh.parent.matrixWorld).invert().multiply(rigid).multiply(tw);
  mesh.matrixWorldNeedsUpdate = true;
}
// One step of a spring (w, damping ratio z) and damper, solved backward in time: the change in velocity
// that lands its next state exactly, from error e and velocity error ve. Stable at any stiffness.
function implicit(out, e, ve, w, z, h) {
  const k1 = 2 * z * w * h, k2 = w * w * h * h;
  out.copy(e).multiplyScalar(w * w * h).addScaledVector(ve, -(k1 + k2)).divideScalar(1 + k1 + k2);
  if (out.length() > RAGDOLL.maxAccel * h) out.setLength(RAGDOLL.maxAccel * h);
  return out;
}
// The angular velocity that turns quaternion a into b over dt, in the frame they are both expressed in.
function spin(b, a, dt, out) {
  const q = _sq.copy(b).multiply(_sq2.copy(a).invert());
  if (q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; }
  const sn = Math.hypot(q.x, q.y, q.z);
  if (sn < 1e-9 || dt < 1e-4) return out.set(0, 0, 0);
  out.set(q.x, q.y, q.z).multiplyScalar(2 * Math.atan2(sn, q.w) / sn / dt);
  if (out.length() > 40) out.set(0, 0, 0);       // a jump (a teleport, a new pose) is not a spin
  return out;
}
const _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion();
// A segment's inertia about its own length: the smallest principal one for a limb, the average for a ball.
function axialInertia(s) { const i = s.body.principalInertia(); return ['hips', 'torso', 'head'].includes(s.kind) ? (i.x + i.y + i.z) / 3 : Math.max(1e-7, Math.min(i.x, i.y, i.z)); }
function avgInertia(b) { const i = b.principalInertia(); return Math.max(1e-6, (i.x + i.y + i.z) / 3); }
// A point fixed in a body (its own frame) in the world, and that point's velocity.
function worldPoint(b, local, out) { const r = b.rotation(), t = b.translation(); return out.copy(local).applyQuaternion(_wq.set(r.x, r.y, r.z, r.w)).add(_wp.set(t.x, t.y, t.z)); }
function pointVelAt(b, p) { const o = b.translation(), v = b.linvel(), w = b.angvel(); return V(v.x, v.y, v.z).add(V(w.x, w.y, w.z).cross(V(p.x - o.x, p.y - o.y, p.z - o.z))); }
const _wq = new THREE.Quaternion(), _wp = V();
// The velocity of a collider's centre, from its body's spin and travel.
function pointVel(col) {
  const b = col.parent(), c = col.translation(), o = b.translation(), v = b.linvel(), w = b.angvel();
  return V(v.x, v.y, v.z).add(V(w.x, w.y, w.z).cross(V(c.x - o.x, c.y - o.y, c.z - o.z)));
}
