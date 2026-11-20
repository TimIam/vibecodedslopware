// Blender local pivot distances are shared by the authoritative hit capsules and the visible rig.
import { heldHand, gripPoint } from './hands.js';

const add = (a, b) => a.map((n, i) => n + b[i]);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const scale = (a, s) => a.map((n) => n * s);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const unit = (a) => scale(a, 1 / Math.max(1e-8, Math.hypot(...a)));
const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
function yaw(a, r) {
  const c = Math.cos(r),
    s = Math.sin(r);
  return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
}
// Three's default local Euler order is XYZ, so a vector encounters Z first.
function rotate(a, [x, y, z]) {
  const cz = Math.cos(z),
    sz = Math.sin(z),
    cx = Math.cos(x),
    sx = Math.sin(x);
  const b = yaw([cz * a[0] - sz * a[1], sz * a[0] + cz * a[1], a[2]], y);
  return [b[0], b[1] * cx - b[2] * sx, b[1] * sx + b[2] * cx];
}
const upperArm = Math.hypot(0.051, 0.287),
  forearm = Math.hypot(0.012, 0.243);
const upperLeg = Math.hypot(0.024, 0.425),
  lowerLeg = 0.39;
function torsoFrame(p, ground) {
  const s = Math.sin(p.face),
    c = Math.cos(p.face),
    speed = Math.min(1, Math.hypot(p.vx, p.vz));
  const hipsRotation = [
    -0.1 * p.recoil - 1.38 * ground.back,
    0,
    0.14 * (p.stun ? 1 : 0) + 0.78 * ground.side
  ];
  const chestRotation = [
    0.08 + p.recoil * 0.21 + (p.vz * c + p.vx * s) * 0.038 + p.bend * 0.15,
    p.torso,
    -(p.vx * c - p.vz * s) * 0.04 + 0.03 * Math.sin(p.walk) * speed
  ];
  const headRotation = [-0.04 - p.recoil * 0.14, -p.yaw * 0.1, 0];
  const Hips = [
    p.x,
    p.height +
      0.865 -
      0.03 * speed +
      0.018 * Math.cos(p.walk * 2) * speed -
      0.24 * p.bend * (1 - ground.low) -
      0.65 * ground.low -
      0.13 * (p.stun ? 1 : 0),
    p.z
  ];
  const hipDir = (a) => yaw(rotate(a, hipsRotation), p.face);
  const chestDir = (a) => hipDir(rotate(a, chestRotation));
  const Chest = add(Hips, hipDir([0, 0.13, 0]));
  const Head = add(Chest, chestDir([0, 0.54, 0]));
  return {
    Hips,
    Chest,
    Head,
    Crown: add(Head, chestDir(rotate([0, 0.31, 0], headRotation))),
    hipDir,
    chestDir,
    hipsRotation,
    chestRotation,
    headRotation
  };
}
function shoulderOf(frame, sign) {
  return add(frame.Chest, frame.chestDir([sign * 0.269, 0.37, 0]));
}
function reachable(origin, point, max) {
  const delta = sub(point, origin),
    distance = Math.hypot(...delta);
  return distance > max ? add(origin, scale(delta, max / distance)) : point;
}
export function supportDistance(p, reach) {
  if (p.gripL || p.gripR || p.left >= 0 === p.right >= 0) return 0;
  if (p.short) return -reach * (0.29 / 0.71);
  return p.weapon === 2 ? 0.23 : p.guard ? 0.1 : 0;
}
export function reachableGrip(p, side, point, ground, supportOffset) {
  const frame = torsoFrame(p, ground);
  const sign = side === 'L' ? 1 : -1,
    radius = upperArm + forearm - 0.001;
  const lead = shoulderOf(frame, sign);
  const first = reachable(lead, point, radius);
  if (!supportOffset) return first;
  // A two-handed grip must be reachable from both shoulders. In coordinates of
  // the lead grip, the second arm's reach sphere is offset by the hand spacing.
  const other = sub(shoulderOf(frame, -sign), supportOffset);
  if (Math.hypot(...sub(first, other)) <= radius) return first;
  const second = reachable(other, point, radius);
  if (Math.hypot(...sub(second, lead)) <= radius) return second;
  const axis = unit(sub(other, lead)),
    center = mix(lead, other, 0.5);
  const delta = sub(point, center),
    radial = unit(sub(delta, scale(axis, dot(axis, delta))));
  const ring = Math.sqrt(Math.max(0, radius * radius - dot(sub(center, lead), sub(center, lead))));
  return add(center, scale(radial, ring));
}
// The same two-link IK sets both the mesh joints and their combat capsules.
function limb(origin, goal, pole, a, b) {
  const delta = sub(goal, origin),
    axis = unit(delta);
  const d = Math.min(a + b - 0.0001, Math.max(Math.abs(a - b) + 0.0001, Math.hypot(...delta)));
  const along = (a * a - b * b + d * d) / (2 * d);
  let bend = sub(pole, scale(axis, dot(axis, pole)));
  if (Math.hypot(...bend) < 0.001) {
    const fallback = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    bend = sub(fallback, scale(axis, dot(axis, fallback)));
  }
  return [
    add(add(origin, scale(axis, along)), scale(unit(bend), Math.sqrt(Math.max(0, a * a - along * along)))),
    add(origin, scale(axis, d))
  ];
}
export function jointPose(p, primary, ground, opponent, offSegment) {
  const f = torsoFrame(p, ground);
  const pose = {
    Hips: f.Hips,
    Chest: f.Chest,
    Head: f.Head,
    Crown: f.Crown,
    hipsRotation: f.hipsRotation,
    chestRotation: f.chestRotation,
    headRotation: f.headRotation
  };
  const origin = [p.x, p.height, p.z],
    toWorld = (a) => add(origin, yaw(a, p.face));
  const speed = Math.hypot(p.vx, p.vz),
    vel = yaw([p.vx, 0, p.vz], -p.face),
    gait = Math.min(1, speed / 0.85);
  const active = heldHand(p);
  const primaryDir = sub(primary[1], primary[0]),
    support = supportDistance(p, Math.hypot(...primaryDir));
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? 1 : -1,
      lead = side === active;
    const segment = lead ? primary : offSegment;
    let hand;
    if (opponent && p['grip' + side]) hand = gripPoint(opponent, side);
    else if (lead || (segment && p[side === 'L' ? 'left' : 'right'] >= 0)) hand = segment[0];
    else if (support) {
      hand = add(primary[0], scale(unit(primaryDir), support));
    } else hand = toWorld([sign * 0.29, 1.05 + 0.025 * Math.sin(p.walk), 0.25]);
    if (!lead && p[side === 'L' ? 'left' : 'right'] < 0 && !p['grip' + side]) {
      hand = mix(hand, toWorld([sign * 0.36, 0.1, 0.02]), ground.low);
    }
    const shoulder = shoulderOf(f, sign);
    pose['UpperArm' + side] = shoulder;
    [pose['Forearm' + side], pose['Hand' + side]] = limb(
      shoulder,
      hand,
      yaw([sign, -0.68, -0.5], p.face),
      upperArm,
      forearm
    );
    const hip = add(f.Hips, f.hipDir([sign * 0.119, -0.024, -0.005]));
    const phase = (p.walk + (side === 'R' ? Math.PI : 0)) % (2 * Math.PI);
    const travel = phase < Math.PI ? 0.5 - phase / Math.PI : -0.5 + (phase - Math.PI) / Math.PI;
    const swing = phase > Math.PI ? Math.sin(phase - Math.PI) : 0;
    const hurt = (p.wounds?.[side === 'L' ? 4 : 5] || 0) / 100;
    const stride = gait * travel * (p.running ? 0.79 : 0.58) * (1 - 0.45 * hurt);
    const foot = toWorld([
      sign * (0.155 + 0.035 * p.bend) + (stride * vel[0]) / Math.max(0.01, speed),
      0.068 + swing * gait * (p.running ? 0.17 : 0.1) * (1 - 0.65 * hurt) + Math.min(0.12, p.height * 0.35),
      sign * 0.055 + (stride * vel[2]) / Math.max(0.01, speed) + ground.back * (0.49 + sign * 0.13)
    ]);
    pose['Thigh' + side] = hip;
    [pose['Shin' + side], pose['Foot' + side]] = limb(
      hip,
      foot,
      yaw([sign * 0.09, 0, 1], p.face),
      upperLeg,
      lowerLeg
    );
  }
  return pose;
}
