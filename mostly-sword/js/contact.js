import {
  weaponShape,
  featureName,
  armorShell,
  shellSpace,
  shellNormal,
  unit as normalize
} from './shapes.js';
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

const origin = [
  [0, 0, 0],
  [0, 0, 0]
];
export function bodyContact(oldSegment, segment, oldPose, pose, weapon, dt, short = false, armor = 0) {
  const before = weaponShape(oldSegment, weapon, short),
    now = weaponShape(segment, weapon, short);
  let best = null;
  for (const [start, end, radius, region, lo = 0.025, hi = 0.98] of parts) {
    const oldLimb = limbSegment(oldPose, start, end, lo, hi),
      limb = limbSegment(pose, start, end, lo, hi);
    const span = travel(oldSegment, segment) + travel(oldLimb, limb);
    // Include the rear of a poleaxe, its side blade and the maximum armor thickness.
    if (near(segment, limb).d > span + radius + (weapon === 2 ? 0.73 : 0.43)) continue;
    const plated = coverageFor(armor, start) === 'plate';
    const shell = plated && armorShell(pose, start, end),
      last = plated && armorShell(oldPose, start, end);
    for (const [index, shape] of now.entries()) {
      const a = before[index].line,
        b = shape.line,
        r = shape.r;
      const relative = sub(sub(b[1], a[1]), sub(limb[1], oldLimb[1]));
      if (Math.max(Math.hypot(...relative), travel(a, b) + travel(oldLimb, limb)) < dt * 0.89) continue;
      if (near(b, limb).d > travel(a, b) + travel(oldLimb, limb) + radius + r + 0.14) continue;
      let hit = sweptContact(a, b, oldLimb, limb, radius + r);
      let surface = 'cloth',
        piece = 'padding',
        normal;
      if (shell) {
        const prev = a.map((q) => shellSpace(q, last, r)),
          curr = b.map((q) => shellSpace(q, shell, r));
        const plate = sweptContact(prev, curr, origin, origin, 1);
        if (plate && (!hit || plate.time <= hit.time + 0.0008)) {
          const local = mix(...at(prev, curr, plate.time), plate.s);
          normal = shellNormal(local, shell, r);
          const point = mix(...at(a, b, plate.time), plate.s);
          hit = { ...plate, pos: point.map((v, k) => v - r * normal[k]), d: plate.d * (radius + r) };
          surface = 'plate';
          piece = shell.piece;
        }
      }
      if (!hit) continue;
      const t = hit.time;
      const axis = mix(...at(oldLimb, limb, t), hit.t),
        point = mix(...at(a, b, t), hit.s);
      if (!normal) normal = normalize(sub(point, axis));
      const motion = sub(
        sub(mix(...b, hit.s), mix(...a, hit.s)),
        sub(mix(...limb, hit.t), mix(...oldLimb, hit.t))
      );
      const speed = Math.hypot(...motion) / dt;
      if (speed < (weapon < 0 ? 0.9 : 1.15)) continue;
      const depth = hit.d / (radius + r);
      if (best && (best.time < t - 0.00001 || (Math.abs(best.time - t) < 0.00001 && best.depth <= depth)))
        continue;
      const direction = normalize(motion);
      best = {
        ...hit,
        width: r,
        direction,
        speed,
        depth,
        region,
        segment: start,
        surface,
        piece,
        normal,
        part: featureName(shape, direction),
        along: near([point, point], segment).t
      };
    }
  }
  return best;
}
export function weaponContact(oldA, a, wa, shortA, oldB, b, wb, shortB) {
  const a0 = weaponShape(oldA, wa, shortA),
    a1 = weaponShape(a, wa, shortA);
  const b0 = weaponShape(oldB, wb, shortB),
    b1 = weaponShape(b, wb, shortB);
  let best = null;
  for (const [i, left] of a1.entries())
    for (const [j, right] of b1.entries()) {
      const hit = sweptContact(a0[i].line, left.line, b0[j].line, right.line, left.r + right.r);
      if (hit && (!best || hit.time < best.time)) best = { ...hit, part: left.part, piece: right.part };
    }
  return best;
}

export function applyWound(target, hit, weapon, momentum) {
  const surface = hit.surface ?? coverageFor(target.armor, hit.segment);
  // The poleaxe shaft and mace transfer impact. On a plated segment the edge
  // glances, preserving far more balance transfer than health damage.
  const edge = hit.part
    ? ['edge', 'point', 'axe edge', 'beak', 'spike'].includes(hit.part)
    : weapon === 0 || (weapon === 2 && hit.along >= 0.65);
  const plated = surface === 'plate';
  const kind = edge && !plated ? 'cut' : 'impact';
  const protection = plated ? (edge ? 0.25 : 0.64) : 1;
  const force = (4 + momentum * 2.55) * (weapon < 0 ? 0.6 : 1);
  const damage = force * protection * (['flat', 'guard', 'haft', 'axe blade'].includes(hit.part) ? 0.48 : 1);
  const vital = [1.24, 1.05, 0.58, 0.58, 0.7, 0.7][hit.region];
  target.hp = Math.max(0, target.hp - damage * vital);
  target.wounds[hit.region] = Math.min(100, target.wounds[hit.region] + damage * 1.65);
  target.balance = Math.max(
    0,
    target.balance - (6 + momentum * (weapon === 1 ? 4.2 : 3.3)) * (hit.region >= 4 ? 1.2 : 1)
  );
  return { region: hit.region, surface, kind, part: hit.part, piece: hit.piece, normal: hit.normal };
}
