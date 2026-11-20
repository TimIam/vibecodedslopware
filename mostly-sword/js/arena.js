import { driveArm } from './motors.js';
import { applyWound, bodyContact, sweptContact, touchingBody } from './contact.js';
import { handState, heldHand, nearestLoot, updateHands } from './hands.js';
import { jointPose, reachableGrip, supportDistance } from './pose.js';
// Fixed-step rules shared by the solo run and the duel host. Units are metres and seconds.
export const STEP = 1 / 90;
export const weapons = [
  { name: 'Arming sword', mesh: 'sword', reach: 1.0, spring: 60, impact: 1.0 },
  { name: 'Flanged mace', mesh: 'mace', reach: 0.79, spring: 45, impact: 1.28 },
  { name: 'Poleaxe', mesh: 'poleaxe', reach: 1.38, spring: 33, impact: 1.18 }
];
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const neutral = () => ({
  fwd: 0,
  side: 0,
  yaw: -0.65,
  pitch: 0.53,
  guard: false,
  short: false,
  leftId: 0,
  rightId: 0,
  swapId: 0,
  offhand: false,
  offYaw: 0.54,
  offPitch: 0.56,
  thrust: false,
  run: false,
  crouch: false,
  jumpId: 0,
  jumpPower: 0
});
export const ranks = ['The Lamplighter', 'The Toll Keeper', 'The Iron Bailiff'];
function fighter(i, weapon) {
  return {
    x: 0,
    z: i ? 1.75 : -1.75,
    face: i ? Math.PI : 0,
    vx: 0,
    vz: 0,
    yaw: -0.65,
    pitch: 0.53,
    wy: 0,
    wp: 0,
    ...handState(weapon),
    weapon,
    wounds: [0, 0, 0, 0, 0, 0],
    armor: 1,
    offhand: false,
    offYaw: 0.36,
    offPitch: 0.56,
    offTorso: 0.18,
    offWY: 0,
    offWP: 0,
    offTorsoSpeed: 0,
    hp: 100,
    balance: 100,
    stun: 0,
    recoil: 0,
    guard: false,
    short: false,
    cooldown: 0,
    walk: 0,
    down: 0,
    recovery: 0,
    rollSide: 1,
    torso: 0,
    torsoSpeed: 0,
    thrustLatch: false,
    thrustTime: 0,
    extension: 0,
    height: 0,
    vy: 0,
    landing: 0,
    bend: 0,
    running: false,
    jumpId: 0,
    fatigue: 0,
    exhausted: false,
    bind: 0
  };
}
export function makeRound(round = 1, solo = true, loadout = 0) {
  const tier = Math.min(2, Math.floor((round - 1) / 2));
  const game = {
    round,
    solo,
    time: 0,
    winner: -1,
    event: null,
    serial: 0,
    scouting: solo,
    p: [fighter(0, loadout), fighter(1, solo ? tier : 0)],
    loot: [
      { x: -0.95, z: -1.9, w: solo && round < 3 ? 1 : 2 },
      { x: 0.95, z: 1.9, w: 1 }
    ],
    clashDelay: 0
  };
  if (solo) {
    game.p[0].z = -3.9;
    game.p[1].z = 3.5;
    game.p[1].armor = tier;
    game.loot = [
      { x: -1.2, z: -3.1, w: tier > 0 ? 2 : 1 },
      { x: 1.2, z: -3.1, w: 0 }
    ];
  }
  return game;
}
// The reference take shows a fall onto the back, a side roll, then a low rise.
export const RECOVERY = 2.85;
function ease(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
export function groundPose(p) {
  const t = RECOVERY - p.recovery;
  const fall = ease(t / 0.48);
  const low = fall * (1 - ease((t - 1.22) / 1.63));
  const back = fall * (1 - ease((t - 1.05) / 1.04));
  const side = ease((t - 0.8) / 0.72) * (1 - ease((t - 1.72) / 0.92)) * p.rollSide;
  return { low, back, side };
}
export function blade(p, side = heldHand(p)) {
  const pose = groundPose(p),
    primary = heldHand(p) === side;
  const weapon = side === 'L' ? p.left : p.right;
  const sign = side === 'L' ? 1 : -1;
  const yaw = primary ? p.yaw : p.offYaw;
  const elevation = primary ? p.pitch : p.offPitch;
  const angle = p.face + (primary ? p.torso : p.offTorso);
  const s = Math.sin(angle),
    c = Math.cos(angle);
  const reach = weapon >= 0 ? weapons[weapon].reach * (primary && p.short ? 0.71 : 1) : 0.16;
  const gripSide = sign * (primary ? 0.25 : 0.32) + Math.sin(yaw) * 0.23;
  const gripFront = 0.32 + 0.1 * Math.cos(yaw) + p.extension * 0.16 - pose.back * 0.35;
  const a = angle + yaw,
    pitch = elevation * (1 - pose.low) + 0.1 * pose.low;
  const direction = [Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch)];
  const support = primary && !pose.low ? supportDistance(p, reach) : 0;
  const h = reachableGrip(
    p,
    side,
    [
      p.x + c * gripSide + s * gripFront,
      1.13 +
        p.height -
        p.bend * 0.24 * (1 - pose.low) +
        0.15 * Math.sin(elevation) +
        0.09 * p.extension -
        0.84 * pose.low -
        (primary ? 0 : 0.11),
      p.z - s * gripSide + c * gripFront
    ],
    pose,
    support ? direction.map((n) => n * support) : null
  );
  return [h, h.map((n, i) => n + direction[i] * reach)];
}
function event(g, type, pos, target, details = {}) {
  g.event = { n: ++g.serial, type, pos, target, ...details };
}
export const nearby = (g, p) => nearestLoot(g, p);

function advance(g, i, input, dt) {
  const p = g.p[i],
    other = g.p[1 - i];
  if (p.recovery > 0) {
    p.recovery = Math.max(0, p.recovery - dt);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const radius = Math.hypot(p.x, p.z);
    if (radius > 7.8) {
      p.x *= 7.8 / radius;
      p.z *= 7.8 / radius;
    }
    p.vx *= Math.exp(-7 * dt);
    p.vz *= Math.exp(-7 * dt);
    p.vy -= 9.81 * dt;
    p.height = Math.max(0, p.height + p.vy * dt);
    if (!p.height) p.vy = 0;
    p.recoil = Math.max(0, p.recoil - dt * 3);
    p.cooldown = 0.12;
    p.jumpId = input.jumpId || p.jumpId;
    p.thrustLatch = input.thrust;
    if (p.recovery < 1.1) p.bend += (0.4 - p.bend) * Math.min(1, dt * 8);
    if (!p.recovery) {
      p.balance = 52;
    }
    return;
  }
  const angle = Math.atan2(other.x - p.x, other.z - p.z) - p.face;
  p.face += clamp(Math.atan2(Math.sin(angle), Math.cos(angle)), -5.8 * dt, 5.8 * dt);
  const s = Math.sin(p.face),
    c = Math.cos(p.face);
  p.stun = Math.max(0, p.stun - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.recoil = Math.max(0, p.recoil - dt * 3);
  p.balance = Math.min(100, p.balance + dt * (p.stun ? 0 : 9));
  p.offhand = !!(input.offhand && p.left >= 0 && p.right >= 0 && !p.stun);
  p.guard = input.guard && !p.stun;
  p.short = !!(
    input.short &&
    (p.left >= 0 || p.right >= 0) &&
    (p.left < 0 || p.right < 0) &&
    !p.gripL &&
    !p.gripR
  );
  const grounded = p.height === 0;
  p.landing = Math.max(0, p.landing - dt);
  p.bind = Math.max(0, p.bind - dt);
  if (input.jumpId && input.jumpId !== p.jumpId) {
    p.jumpId = input.jumpId;
    if (grounded && !p.stun && !p.landing && !p.exhausted) {
      p.vy = (2.05 + 1.1 * input.jumpPower) * (1 - Math.max(p.wounds[4], p.wounds[5]) * 0.004);
      p.fatigue = Math.min(100, p.fatigue + 13);
    }
  }
  p.running = Boolean(
    input.run &&
      grounded &&
      !p.vy &&
      !p.guard &&
      !p.stun &&
      !input.crouch &&
      !p.exhausted &&
      !p.landing &&
      Math.hypot(input.fwd, input.side) > 0.18
  );
  p.fatigue = clamp(p.fatigue + dt * (p.running ? 16 : grounded ? -14 : 0), 0, 100);
  if (p.fatigue >= 99) p.exhausted = true;
  if (p.fatigue < 68) p.exhausted = false;
  const bend = grounded
    ? Math.max(input.crouch ? 0.88 : 0, input.run ? 0.22 : 0, p.guard ? 0.2 : 0, (p.landing / 0.23) * 0.64)
    : 0.22;
  p.bend += (bend - p.bend) * Math.min(1, dt * 15);
  const pace = p.stun ? 0.48 : input.crouch ? 0.86 : p.guard ? 1.35 : p.running ? 4.05 : 1.8;
  const legInjury =
    (Math.max(p.wounds[4], p.wounds[5]) * 0.72 + Math.min(p.wounds[4], p.wounds[5]) * 0.28) / 100;
  const speed = pace * (1 - 0.56 * legInjury);
  const magnitude = Math.max(1, Math.hypot(input.fwd, input.side));
  const f = (input.fwd * (input.fwd < 0 ? 0.68 : 1)) / magnitude,
    r = (input.side * 0.8) / magnitude;
  const dx = (s * f - c * r) * speed - p.vx,
    dz = (c * f + s * r) * speed - p.vz;
  const acceleration = grounded ? (p.running ? 8.4 : 10.8) * (p.landing ? 0.5 : 1) : 1.4;
  const fraction = Math.min(1, (acceleration * dt) / Math.max(0.0001, Math.hypot(dx, dz)));
  p.vx += dx * fraction;
  p.vz += dz * fraction;
  if (p.vy || !grounded) {
    p.vy -= 9.81 * dt;
    p.height += p.vy * dt;
    if (p.height <= 0) {
      p.height = 0;
      p.vy = 0;
      p.landing = 0.23;
    }
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const radius = Math.hypot(p.x, p.z);
  if (radius > 7.8) {
    p.x *= 7.8 / radius;
    p.z *= 7.8 / radius;
  }
  if (grounded) p.walk += Math.hypot(p.vx, p.vz) * dt * (p.running ? 3.9 : 5.4);
  if (input.thrust && !p.thrustLatch && !p.stun && !p.guard && grounded && p.thrustTime === 0) {
    p.thrustTime = 0.55;
    p.lastThrust = g.time;
    p.vx += s * 2.1;
    p.vz += c * 2.1;
  }
  p.thrustLatch = input.thrust;
  p.thrustTime = Math.max(0, p.thrustTime - dt);
  p.extension = p.thrustTime > 0 ? Math.sin(Math.PI * (1 - p.thrustTime / 0.55)) : 0;
  const targetY = p.guard ? clamp(input.yaw * 1.12, -1.5, 1.5) : input.yaw * (1 - p.extension);
  const targetP = p.guard ? clamp(0.46 + input.pitch * 0.78, -0.45, 1.28) : input.pitch * (1 - p.extension);
  const spring = weapons[p.weapon].spring * (p.short ? 1.5 : 1) * (p.stun ? 0.28 : 1) * (p.bind ? 0.24 : 1);
  const armStrength = 1 - p.wounds[heldHand(p) === 'L' ? 2 : 3] * 0.005;
  driveArm(p, targetY, targetP, spring * armStrength, dt);
  if (p.left >= 0 && p.right >= 0) {
    const off = {
      yaw: p.offYaw,
      pitch: p.offPitch,
      torso: p.offTorso,
      wy: p.offWY,
      wp: p.offWP,
      torsoSpeed: p.offTorsoSpeed
    };
    const stiffness = weapons[p.left].spring * (1 - p.wounds[2] * 0.005) * (p.bind ? 0.24 : 1);
    driveArm(off, input.offYaw ?? 0.54, input.offPitch ?? 0.56, stiffness, dt);
    p.offYaw = off.yaw;
    p.offPitch = off.pitch;
    p.offTorso = off.torso;
    p.offWY = off.wy;
    p.offWP = off.wp;
    p.offTorsoSpeed = off.torsoSpeed;
  }
}
export function bot(g, i = 1) {
  const p = g.p[i],
    other = g.p[1 - i],
    t = g.time,
    wave = g.round;
  const range = Math.hypot(p.x - other.x, p.z - other.z);
  const clock = t * (1.03 + Math.min(0.6, wave * 0.055)) + i * 0.2;
  const beat = clock % 1.8,
    stroke = Math.floor(clock / 1.8);
  const dir = stroke % 2 ? 1 : -1;
  // Later challengers occasionally close the distance for one beat. They must
  // reach and release with the same hand action available to a human player.
  const close = wave >= 3 && stroke % 4 === 2 && !other.recovery;
  const takeHold = close && range < 0.72 && p.left < 0 && !p.gripL && beat < 1.08;
  const release = p.gripL && (!close || beat >= 1.27);
  const finishPitch = [0.17, -0.65, 0.38, -0.12][stroke % 4];
  return {
    fwd: close && !p.gripL ? 0.86 : range > 1.31 ? 0.79 : range < 0.97 ? -0.57 : 0.05,
    side: Math.cos(t * 1.18 + i) * 0.3,
    yaw: (beat < 0.82 ? -1 : 1) * dir * 1.36,
    pitch: beat < 0.82 ? 0.61 : finishPitch,
    guard: wave > 1 && beat > 1.49,
    short: range < 1,
    run: range > 2.9 && wave > 1,
    leftId: takeHold || release ? p.leftId + 1 : p.leftId,
    thrust: wave > 2 && beat > 1.25 && beat < 1.43 && range > 1.18
  };
}
// A host-private contact latch for each physical hand. Snapshot consumers never
// resolve damage. A weapon must clear the body or start a fresh reversed stroke.
const embedded = new WeakMap();
export function tick(g, input, dt = STEP) {
  g.time += dt;
  if (g.winner >= 0) {
    g.p[1 - g.winner].down += dt;
    return;
  }
  updateHands(g, input, dt);
  if (g.scouting) {
    advance(g, 0, input[0], dt);
    if (Math.hypot(g.p[0].x, g.p[0].z) < 1.22) {
      g.scouting = false;
      g.time = 0;
      event(g, 'summon', [0, 0, 0], 0);
    }
    return;
  }
  const old = g.p.map((p) => ({ ...p }));
  g.p.forEach((_, i) => advance(g, i, input[i], dt));
  const [a, b] = g.p,
    dx = b.x - a.x,
    dz = b.z - a.z,
    distance = Math.max(0.0001, Math.hypot(dx, dz));
  if (distance < 0.64) {
    const push = (0.64 - distance) * 0.5;
    a.x -= (dx / distance) * push;
    a.z -= (dz / distance) * push;
    b.x += (dx / distance) * push;
    b.z += (dz / distance) * push;
  }
  g.clashDelay = Math.max(0, g.clashDelay - dt);
  // Include both the old and new spacing for fighters crossing the broad phase.
  if (distance > 3.8 && Math.hypot(old[0].x - old[1].x, old[0].z - old[1].z) > 3.8) {
    embedded.delete(a);
    embedded.delete(b);
    return;
  }
  // A new grip changes the weapon's extent discretely. Begin that sweep in
  // the new grip so merely changing stance cannot deal damage.
  for (const [i, p] of g.p.entries()) old[i].short = p.short;
  const hands = ['L', 'R'];
  const oldBlades = old.map((p) => Object.fromEntries(hands.map((side) => [side, blade(p, side)])));
  const blades = g.p.map((p) => Object.fromEntries(hands.map((side) => [side, blade(p, side)])));
  const held = (p, side) => (side === 'L' ? p.left : p.right);
  const speed = (seg, prev) => Math.hypot(...seg[1].map((n, k) => n - prev[1][k])) / dt;
  const geometry = (p, paths, rival) => {
    const primary = heldHand(p);
    return jointPose(p, paths[primary], groundPose(p), rival, paths[primary === 'R' ? 'L' : 'R']);
  };
  const oldPoses = old.map((p, i) => geometry(p, oldBlades[i], old[1 - i]));
  const poses = g.p.map((p, i) => geometry(p, blades[i], g.p[1 - i]));
  // Compare events by time-of-impact: a later weapon crossing cannot
  // retroactively block an earlier body contact in the same physics tick.
  const contacts = [];
  for (let i = 0; i < 2; i++) {
    const p = g.p[i],
      j = 1 - i;
    const previous = embedded.get(p) || {};
    for (const side of hands) {
      const was = previous[side];
      const secondary = side !== heldHand(p);
      const targetYaw = secondary ? input[i].offYaw : input[i].yaw;
      const targetPitch = secondary ? input[i].offPitch : input[i].pitch;
      if (was && Math.hypot(targetYaw - was.yaw, targetPitch - was.pitch) > 0.45) was.redirected = true;
      if (was && was.weapon !== held(p, side)) delete previous[side];
      else if (was && !was.clear && !touchingBody(blades[i][side], poses[j], was.width)) was.clear = true;
      if (p.cooldown || p.guard || p.stun || p.recovery) continue;
      const active = p.offhand ? 'L' : heldHand(p);
      if (side !== active || p['grip' + side]) continue;
      const weapon = held(p, side);
      const moving = speed(blades[i][side], oldBlades[i][side]);
      if (moving < (weapon < 0 ? 0.85 : 1.15)) continue;
      const hit = bodyContact(
        oldBlades[i][side],
        blades[i][side],
        oldPoses[j],
        poses[j],
        weapon,
        dt,
        p.short
      );
      if (!hit) continue;
      if (previous[side]) {
        const changed = was.redirected;
        const reversed = hit.direction.reduce((sum, n, k) => sum + n * was.direction[k], 0) < -0.2;
        const advanced = Math.hypot(p.x - was.x, p.z - was.z) > 0.42 || p.lastThrust !== was.thrust;
        if (!(was.clear && (changed || advanced)) && !(changed && reversed)) continue;
      }
      contacts.push({ i, side, weapon, hit, targetYaw, targetPitch });
    }
  }
  let clash = null,
    clashSpeed = [0, 0],
    clashSides;
  if (!a.recovery && !b.recovery)
    for (const lhs of hands)
      for (const rhs of hands) {
        if (held(a, lhs) < 0 || held(b, rhs) < 0) continue;
        const contact = sweptContact(
          oldBlades[0][lhs],
          blades[0][lhs],
          oldBlades[1][rhs],
          blades[1][rhs],
          a.guard || b.guard ? 0.095 : 0.067
        );
        if (contact && (!clash || contact.time < clash.time)) {
          clash = contact;
          clashSides = [lhs, rhs];
          clashSpeed = [speed(blades[0][lhs], oldBlades[0][lhs]), speed(blades[1][rhs], oldBlades[1][rhs])];
        }
      }
  const intercept = clash && Math.max(...clashSpeed) > 1.4 && !g.clashDelay;
  const ordered = contacts.sort((a, b) => a.hit.time - b.hit.time);
  if (intercept && (!ordered.length || clash.time <= ordered[0].hit.time)) {
    g.clashDelay = 0.17;
    for (const [i, p] of g.p.entries()) {
      const stable = p.guard && !p.height && p.balance > 14;
      p.bind = stable ? 0.06 : 0.12;
      p.recoil = stable ? 0.18 : 0.47;
      p.balance = Math.max(0, p.balance - Math.min(18, clashSpeed[1 - i] * (stable ? 0.95 : 1.6)));
      if (clashSides[i] === heldHand(p)) {
        p.wy *= stable ? -0.22 : -0.64;
        p.wp *= -0.4;
      } else {
        p.offWY *= stable ? -0.22 : -0.64;
        p.offWP *= -0.4;
      }
      p.cooldown = Math.max(p.cooldown, 0.1);
    }
    event(g, 'clash', clash.pos, -1);
    return;
  }
  for (const { i, weapon, side, hit: contact, targetYaw, targetPitch } of ordered) {
    const p = g.p[i],
      o = g.p[1 - i];
    if (p.cooldown || p.recovery || p.stun) continue;
    if (clash && o.guard && o.balance > 14 && clash.time <= contact.time) continue;
    const arm = 1 - p.wounds[side === 'L' ? 2 : 3] * 0.0035;
    const momentum = clamp(contact.speed * (weapon >= 0 ? weapons[weapon].impact : 0.7) * arm, 1, 11);
    const details = applyWound(o, contact, weapon, momentum);
    const latch = embedded.get(p) || {};
    latch[side] = {
      weapon,
      width: contact.width,
      direction: contact.direction,
      clear: false,
      x: p.x,
      z: p.z,
      thrust: p.lastThrust,
      yaw: targetYaw,
      pitch: targetPitch
    };
    embedded.set(p, latch);
    if (details.surface === 'plate' && weapon >= 0) {
      // The plate checks this hand's velocity in the motor. Damage to the
      // opponent and rebound of the attacker are both part of host state.
      const recoil = weapon === 1 ? -0.25 : -0.52;
      if (side === heldHand(p)) {
        p.wy *= recoil;
        p.wp *= recoil;
      } else {
        p.offWY *= recoil;
        p.offWP *= recoil;
      }
      p.bind = Math.max(p.bind, weapon === 1 ? 0.07 : 0.105);
      p.recoil = Math.max(p.recoil, 0.25);
    }
    o.recoil = 1;
    p.cooldown = 0.24;
    o.vx += Math.sin(p.face) * momentum * 0.23;
    o.vz += Math.cos(p.face) * momentum * 0.23;
    if (!o.recovery && o.hp > 0 && o.balance < 12 && momentum >= 4) {
      o.recovery = RECOVERY;
      o.rollSide = Math.sin(p.face + p.yaw - o.face) >= 0 ? 1 : -1;
      o.guard = o.running = false;
      o.bind = o.stun = o.extension = o.thrustTime = 0;
      o.wy = o.wp = o.torsoSpeed = 0;
    } else if (!o.recovery && o.balance < 12) {
      o.stun = 0.67;
      o.balance = 35;
    }
    event(g, 'hit', contact.pos, 1 - i, details);
    if (!o.hp) {
      g.winner = i;
      event(g, 'fall', contact.pos, 1 - i, details);
      break;
    }
  }
}
