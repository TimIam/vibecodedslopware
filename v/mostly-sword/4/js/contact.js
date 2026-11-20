/* The duel host tests weapon segments against the same joint targets used by the Blender rig.
 * Local-space capsule sizes are in game metres. Positions are ordinary [x, y, z] arrays.
 */
export const regionNames = ['head', 'torso', 'left arm', 'right arm', 'left leg', 'right leg'];
const parts = [
  ['Head', 'Crown', 0.147, 0, 0.41, 0.59],
  ['Hips', 'Chest', 0.183, 1, 0.3, 0.68],
  ['Chest', 'Head', 0.19, 1, 0.17, 0.64],
  ['UpperArmL', 'ForearmL', 0.094, 2],
  ['ForearmL', 'HandL', 0.078, 2],
  ['UpperArmR', 'ForearmR', 0.094, 3],
  ['ForearmR', 'HandR', 0.078, 3],
  ['ThighL', 'ShinL', 0.106, 4],
  ['ShinL', 'FootL', 0.086, 4],
  ['ThighR', 'ShinR', 0.106, 5],
  ['ShinR', 'FootR', 0.086, 5]
];
export function coverageFor(armor, segment) {
  if (armor === 2 || (armor === 1 && ['Head', 'Hips', 'Chest', 'UpperArmL', 'UpperArmR'].includes(segment)))
    return 'plate';
  return 'cloth';
}

const unit = (t) => Math.max(0, Math.min(1, t));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const travel = (old, next) => Math.max(distance(old[0], next[0]), distance(old[1], next[1]));
const at = (old, next, t) => [mix(old[0], next[0], t), mix(old[1], next[1], t)];

// Finite-segment closest points. When an endpoint clamps, recalculate its partner.
// This also covers zero-length capsules and overlapping parallel segments.
export function near([p, q], [a, b]) {
  const u = sub(q, p),
    v = sub(b, a),
    w = sub(p, a);
  const uu = dot(u, u),
    vv = dot(v, v),
    uv = dot(u, v),
    uw = dot(u, w),
    vw = dot(v, w);
  const det = uu * vv - uv * uv;
  let s = det > 1e-12 ? unit((uv * vw - vv * uw) / det) : 0;
  const t = vv > 1e-12 ? unit((uv * s + vw) / vv) : 0;
  s = uu > 1e-12 ? unit((uv * t - uw) / uu) : 0;
  const first = mix(p, q, s),
    second = mix(a, b, t);
  return { d: distance(first, second), pos: mix(first, second, 0.5), s, t };
}

// Conservative advancement. The sum of the maximum endpoint displacements
// bounds the rate at which two interpolated segments can close their separation.
export function sweptContact(oldBlade, blade, oldLimb, limb, radius) {
  const limit = travel(oldBlade, blade) + travel(oldLimb, limb);
  let time = 0;
  for (let i = 0; i < 20; i++) {
    const hit = near(at(oldBlade, blade, time), at(oldLimb, limb, time));
    const gap = hit.d - radius;
    if (gap < 0.0008) return { ...hit, time };
    if (limit < 1e-8 || gap > limit * (1 - time)) return null;
    time += gap / limit;
  }
  return null;
}

function limbSegment(pose, start, end, lo, hi) {
  return [mix(pose[start], pose[end], lo), mix(pose[start], pose[end], hi)];
}

export function touchingBody(segment, pose, width) {
  return parts.some(
    ([start, end, radius, , lo = 0.025, hi = 0.98]) =>
      near(segment, limbSegment(pose, start, end, lo, hi)).d <= radius + width + 0.008
  );
}

export function bodyContact(oldSegment, segment, oldPose, pose, weapon, dt, short = false) {
  const grip = short ? 0.29 : 0;
  const startFraction = weapon < 0 ? 0.48 : weapon === 1 ? 0.68 : 0.16;
  const first = Math.max(0.04, (startFraction - grip) / (1 - grip));
  const active = [mix(segment[0], segment[1], first), segment[1]];
  const before = [mix(oldSegment[0], oldSegment[1], first), oldSegment[1]];
  const width = weapon < 0 ? 0.08 : weapon === 0 ? 0.024 : 0.054;
  let best = null;
  for (const [start, end, radius, region, lo = 0.025, hi = 0.98] of parts) {
    // Capsule hemispheres count toward the silhouette. Inset their centers
    // so a swing over the crown or beside the collar remains a miss.
    const oldLimb = limbSegment(oldPose, start, end, lo, hi);
    const limb = limbSegment(pose, start, end, lo, hi);
    const hit = sweptContact(before, active, oldLimb, limb, radius + width);
    if (!hit) continue;
    const bladeMotion = sub(mix(...active, hit.s), mix(...before, hit.s));
    const limbMotion = sub(mix(...limb, hit.t), mix(...oldLimb, hit.t));
    const motion = sub(bladeMotion, limbMotion);
    const speed = Math.hypot(...motion) / dt;
    if (speed < (weapon < 0 ? 0.9 : 1.15)) continue;
    // Simultaneous initial overlaps choose the most central contact rather than
    // privileging whichever limb happens to be first in the skeleton array.
    const depth = hit.d / (radius + width);
    if (
      best &&
      (best.time < hit.time - 1e-6 || (Math.abs(best.time - hit.time) < 1e-6 && best.depth <= depth))
    )
      continue;
    best = {
      ...hit,
      width,
      direction: motion.map((n) => n / (speed * dt)),
      speed,
      depth,
      region,
      segment: start,
      along: grip + (1 - grip) * (first + hit.s * (1 - first))
    };
  }
  return best;
}

export function applyWound(target, hit, weapon, momentum) {
  const surface = coverageFor(target.armor, hit.segment);
  // The poleaxe shaft and mace transfer impact. On a plated segment the edge
  // glances, preserving far more balance transfer than health damage.
  const edge = weapon === 0 || (weapon === 2 && hit.along >= 0.65);
  const plated = surface === 'plate';
  const kind = edge && !plated ? 'cut' : 'impact';
  const protection = plated ? (edge ? 0.25 : 0.64) : 1;
  const force = (4 + momentum * 2.55) * (weapon < 0 ? 0.6 : 1);
  const damage = force * protection;
  const vital = [1.24, 1.05, 0.58, 0.58, 0.7, 0.7][hit.region];
  target.hp = Math.max(0, target.hp - damage * vital);
  target.wounds[hit.region] = Math.min(100, target.wounds[hit.region] + damage * 1.65);
  target.balance = Math.max(
    0,
    target.balance - (6 + momentum * (weapon === 1 ? 4.2 : 3.3)) * (hit.region >= 4 ? 1.2 : 1)
  );
  return { region: hit.region, surface, kind };
}
