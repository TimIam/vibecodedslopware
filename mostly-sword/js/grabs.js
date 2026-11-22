import { blade, groundPose } from './arena.js';
import { jointPose } from './pose.js';
import { heldHand } from './hands.js';
import { near } from './contact.js';

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const dist = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const slot = (side) => (side === 'L' ? 'left' : 'right');
function geometry(p) {
  const s = heldHand(p),
    tools = { L: blade(p, 'L'), R: blade(p, 'R') };
  return { tools, j: jointPose(p, tools[s], groundPose(p), true, tools[s === 'L' ? 'R' : 'L']) };
}
function line({ tools, j }, p, part, s) {
  const elbow = j['Forearm' + s],
    palm = j['Hand' + s],
    wrist = mix(elbow, palm, 0.72);
  if (part === 'wrist') return [wrist, palm, 0.06];
  if (part === 'forearm') return [elbow, wrist, 0.07];
  if (part === 'sleeve') return [j['UpperArm' + s], elbow, 0.09];
  const w = p[slot(s)];
  if (w < 0) return null;
  const [a, b] = tools[s],
    grip = p.short && s === heldHand(p) ? 0.29 : 0;
  return [
    mix(a, b, ((w === 2 ? -0.3 : -0.13) - grip) / (1 - grip)),
    mix(a, b, ((w === 0 ? 0.13 : 0.57) - grip) / (1 - grip)),
    0.032
  ];
}
export function findGrip(p, other, side) {
  if (other.recovery || other.down || other.hp <= 0 || Math.hypot(p.x - other.x, p.z - other.z) > 1.25)
    return null;
  const own = geometry(p).j,
    target = geometry(other);
  const h = own['Hand' + side],
    shoulder = own['UpperArm' + side],
    aim = p.face + p.yaw * 0.32;
  const outward = side === 'L' ? 0.095 : -0.095;
  const end = [
    shoulder[0] + Math.sin(aim) * 0.47 + Math.cos(p.face) * outward,
    h[1] + 0.17 + 0.1 * Math.sin(p.pitch),
    shoulder[2] + Math.cos(aim) * 0.47 - Math.sin(p.face) * outward
  ];
  let best = null,
    score = Infinity;
  for (const s of ['L', 'R'])
    for (const part of ['wrist', 'forearm', 'sleeve', 'gear']) {
      const l = line(target, other, part, s);
      if (!l) continue;
      const { s: u, t, d } = near([h, end], l);
      const center = mix(l[0], l[1], t),
        probe = mix(h, end, u);
      const offset = probe.map((v, k) => ((v - center[k]) * l[2]) / Math.max(0.0001, d));
      const point = center.map((v, k) => v + offset[k]);
      const rank = u * dist(h, end) + Math.max(0, d - l[2]);
      if (d > l[2] + 0.17 || dist(shoulder, point) > 0.53 || rank >= score) continue;
      score = rank;
      const c = Math.cos(other.face),
        f = Math.sin(other.face),
        [x, y, z] = offset,
        primary = s === heldHand(other);
      best = {
        part,
        side: s,
        t,
        offset: [c * x - f * z, y, f * x + c * z],
        span: relativePosition(p, other),
        from: h,
        point: h,
        progress: 0,
        weapon: part === 'gear' ? other[slot(s)] : -1,
        yaw: primary ? other.yaw + other.torso : other.offYaw + other.offTorso,
        pitch: primary ? other.pitch : other.offPitch
      };
    }
  return best;
}
export function refreshGrips(g, dt = 0) {
  const poses = g.p.some((p) => p.gripL || p.gripR) ? g.p.map(geometry) : null;
  for (const [i, p] of g.p.entries())
    for (const side of ['L', 'R']) {
      const key = 'grab' + side,
        grip = 'grip' + side,
        a = p[key],
        other = g.p[1 - i];
      if (!a || !p[grip] || (a.part === 'gear' && a.weapon !== other[slot(a.side)])) {
        p[key] = null;
        p[grip] = false;
        continue;
      }
      const l = line(poses[1 - i], other, a.part, a.side),
        base = mix(l[0], l[1], a.t);
      const [x, y, z] = a.offset,
        c = Math.cos(other.face),
        s = Math.sin(other.face);
      const point = [base[0] + c * x + s * z, base[1] + y, base[2] - s * x + c * z];
      if (dist(poses[i].j['UpperArm' + side], point) > 0.575) {
        p[key] = null;
        p[grip] = false;
      } else {
        const progress = Math.min(1, a.progress + dt / 0.065),
          smooth = progress * progress * (3 - 2 * progress);
        p[key] = { ...a, progress, point: progress === 1 ? point : mix(a.from, point, smooth) };
      }
    }
}
export const heldArm = (p, s) =>
  ['L', 'R'].map((h) => p['grip' + h] && p['grab' + h]).find((a) => a && a.progress === 1 && a.side === s);
function relativePosition(holder, target) {
  const x = holder.x - target.x,
    z = holder.z - target.z,
    c = Math.cos(target.face),
    s = Math.sin(target.face);
  return [c * x - s * z, holder.height - target.height - 0.24 * (holder.bend - target.bend), s * x + c * z];
}
export function restrainedAim(holder, target, side) {
  const grip = heldArm(holder, side);
  if (!grip) return null;
  const displacement = relativePosition(holder, target).map((v, k) => v - grip.span[k]);
  const [x, y, z] = displacement,
    lateral = x * Math.cos(grip.yaw) - z * Math.sin(grip.yaw);
  const limit = (v) => Math.max(-0.65, Math.min(0.65, v));
  return { yaw: grip.yaw + limit(lateral * 2.8), pitch: grip.pitch + limit(y * 3) };
}
export const gripLabel = (a) =>
  a ? (a.side === 'L' ? 'left ' : 'right ') + (a.part === 'gear' ? 'weapon' : a.part) : '';
