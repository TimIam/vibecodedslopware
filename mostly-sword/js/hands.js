import { findGrip, refreshGrips } from './grabs.js';
// X moves the held equipment between the two sockets. A grip on the rival is
// bound to its physical hand and is released when the hands exchange equipment.
export function handState(weapon) {
  return {
    right: weapon,
    left: -1,
    gripL: false,
    gripR: false,
    grabL: null,
    grabR: null,
    leftId: 0,
    rightId: 0,
    swapId: 0
  };
}
export const heldWeapon = (p) => (p.right >= 0 ? p.right : p.left);
export const heldHand = (p) => (p.right < 0 && p.left >= 0 ? 'L' : 'R');
const actions = [
  ['swapId', ''],
  ['leftId', 'L'],
  ['rightId', 'R']
];

function offset(p, side, front) {
  const c = Math.cos(p.face),
    s = Math.sin(p.face);
  return [p.x + c * side + s * front, p.z - s * side + c * front];
}
export function nearestLoot(g, p, side) {
  const [x, z] = offset(p, side === 'L' ? 0.16 : side === 'R' ? -0.16 : 0, 0.12);
  let best,
    distance = 1.12 - Math.min(0.5, p.height);
  for (const item of g.loot) {
    if (item.w < 0) continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d < distance) {
      distance = d;
      best = item;
    }
  }
  return best;
}

export function freeHandTarget(g, i, side) {
  const p = g.p[i],
    other = g.p[1 - i];
  if (p.recovery || p.stun || p.down || p.hp <= 0) return null;
  const item = nearestLoot(g, p, side);
  if (!g.scouting && (!item || p.bend < 0.5) && (p.wounds?.[side === 'L' ? 2 : 3] ?? 0) < 90)
    return findGrip(p, other, side) || item;
  return item;
}

function handAction(g, i, side) {
  const p = g.p[i];
  const slot = side === 'L' ? 'left' : 'right',
    grip = 'grip' + side;
  if (p[grip]) {
    p[grip] = false;
  } else if (p[slot] >= 0) {
    const [x, z] = offset(p, side === 'L' ? 0.32 : -0.32, 0.26);
    const radius = Math.max(1, Math.hypot(x, z) / 7.75);
    let free = g.loot.find((item) => item.w < 0);
    if (!free) {
      free = {};
      g.loot.push(free);
    }
    Object.assign(free, { w: p[slot], x: x / radius, z: z / radius });
    p[slot] = -1;
  } else {
    const item = freeHandTarget(g, i, side);
    if (item?.part) {
      p['grab' + side] = item;
      p[grip] = true;
    } else if (item) {
      p[slot] = item.w;
      item.w = -1;
    } else return;
  }
  g.event = { n: ++g.serial, type: 'equip', pos: [p.x, 1, p.z], target: i };
}

export function updateHands(g, input, dt) {
  for (const [i, p] of g.p.entries()) {
    if (p.wounds?.[2] >= 90) p.gripL = false;
    if (p.wounds?.[3] >= 90) p.gripR = false;
    if (g.scouting && i === 1) continue;
    const enabled = !(p.recovery || p.down || p.stun || p.hp <= 0);
    if (!enabled) p.gripL = p.gripR = false;
    const intent = input[i];
    const pending = actions.filter(([id]) => Number.isSafeInteger(intent?.[id]) && intent[id] > p[id]);
    pending.sort(([a], [b]) => intent[a] - intent[b]);
    for (const [id, side] of pending) {
      const sequence = intent[id];
      p[id] = sequence;
      if (!enabled) continue;
      if (side) handAction(g, i, side);
      else {
        if (p.right < 0 && p.left < 0) continue;
        [p.right, p.left] = [p.left, p.right];
        p.gripL = p.gripR = false;
      }
      p.weapon = Math.max(0, heldWeapon(p));
    }
  }
  refreshGrips(g, dt);
  // The host solves each hand tether once. Equal and opposite impulses let a
  // backstep tug the other fighter and allow two opponents to resist each other.
  for (const [i, p] of g.p.entries()) {
    if (p.grabL?.progress !== 1 && p.grabR?.progress !== 1) continue;
    const other = g.p[1 - i];
    const dx = other.x - p.x,
      dz = other.z - p.z,
      distance = Math.hypot(dx, dz);
    if (
      other.recovery ||
      other.down ||
      other.hp <= 0 ||
      distance > 1.38 ||
      Math.abs(other.height - p.height) > 0.78
    ) {
      p.gripL = p.gripR = false;
      continue;
    }
    if (distance < 0.001) continue;
    const nx = dx / distance,
      nz = dz / distance;
    const relative = (other.vx - p.vx) * nx + (other.vz - p.vz) * nz;
    const strength =
      (p.gripL ? 1 - (p.wounds?.[2] || 0) / 120 : 0) + (p.gripR ? 1 - (p.wounds?.[3] || 0) / 120 : 0);
    const force = Math.max(-10, Math.min(42, 120 * (distance - 0.67) + 13 * relative));
    const impulse = force * dt * Math.min(1, strength * 0.64);
    p.vx += nx * impulse;
    p.vz += nz * impulse;
    other.vx -= nx * impulse;
    other.vz -= nz * impulse;
  }
}
