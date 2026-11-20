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
  grab: false,
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
    weapon,
    hp: 100,
    balance: 100,
    stun: 0,
    recoil: 0,
    guard: false,
    short: false,
    cooldown: 0,
    walk: 0,
    grabLatch: false,
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
function bodyAxis(p, pose) {
  const pitch = -1.38 * pose.back,
    roll = 0.78 * pose.side;
  const side = -Math.sin(roll),
    front = Math.sin(pitch) * Math.cos(roll);
  return [
    Math.cos(p.face) * side + Math.sin(p.face) * front,
    Math.cos(pitch) * Math.cos(roll),
    -Math.sin(p.face) * side + Math.cos(p.face) * front
  ];
}
export function blade(p) {
  const pose = groundPose(p);
  const s = Math.sin(p.face + p.torso),
    c = Math.cos(p.face + p.torso);
  const reach = weapons[p.weapon].reach * (p.short ? 0.71 : 1);
  const gripSide = -0.25 + Math.sin(p.yaw) * 0.23;
  const gripFront = 0.32 + 0.1 * Math.cos(p.yaw) + p.extension * 0.16 - pose.back * 0.35;
  const h = [
    p.x + c * gripSide + s * gripFront,
    1.13 +
      p.height -
      p.bend * 0.24 * (1 - pose.low) +
      0.15 * Math.sin(p.pitch) +
      0.09 * p.extension -
      0.84 * pose.low,
    p.z - s * gripSide + c * gripFront
  ];
  const a = p.face + p.torso + p.yaw,
    pitch = p.pitch * (1 - pose.low) + 0.1 * pose.low,
    horizontal = reach * Math.cos(pitch);
  return [
    h,
    [h[0] + Math.sin(a) * horizontal, h[1] + reach * Math.sin(pitch), h[2] + Math.cos(a) * horizontal]
  ];
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// Closest points of two finite segments, including parallel and point segments.
function near([p, q], [a, b]) {
  const u = sub(q, p),
    v = sub(b, a),
    w = sub(p, a);
  const uu = dot(u, u),
    vv = dot(v, v),
    uv = dot(u, v),
    uw = dot(u, w),
    vw = dot(v, w);
  const det = uu * vv - uv * uv;
  let s = det > 1e-8 ? clamp((uv * vw - vv * uw) / det, 0, 1) : 0;
  const t = vv ? clamp((uv * s + vw) / vv, 0, 1) : 0;
  s = uu ? clamp((uv * t - uw) / uu, 0, 1) : 0;
  const first = lerp(p, q, s),
    second = lerp(a, b, t),
    d = sub(first, second);
  return { d: Math.sqrt(dot(d, d)), pos: lerp(first, second, 0.5) };
}
function event(g, type, pos, target) {
  g.event = { n: ++g.serial, type, pos, target };
}
export function nearby(g, p) {
  let best,
    dist = 1.3;
  for (const item of g.loot) {
    const d = Math.hypot(item.x - p.x, item.z - p.z);
    if (d < dist) {
      best = item;
      dist = d;
    }
  }
  return best;
}
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
    p.grabLatch = input.grab;
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
  p.guard = input.guard && !p.stun;
  p.short = input.short;
  const grounded = p.height === 0;
  p.landing = Math.max(0, p.landing - dt);
  p.bind = Math.max(0, p.bind - dt);
  if (input.jumpId && input.jumpId !== p.jumpId) {
    p.jumpId = input.jumpId;
    if (grounded && !p.stun && !p.landing && !p.exhausted) {
      p.vy = 2.05 + 1.1 * input.jumpPower;
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
    ? Math.max(
        input.crouch ? 0.88 : 0,
        input.run ? 0.22 : 0,
        p.guard ? 0.2 : 0,
        (p.landing / 0.23) * 0.64
      )
    : 0.22;
  p.bend += (bend - p.bend) * Math.min(1, dt * 15);
  const speed = p.stun ? 0.48 : input.crouch ? 0.86 : p.guard ? 1.35 : p.running ? 4.05 : 1.8;
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
    p.vx += s * 2.1;
    p.vz += c * 2.1;
  }
  p.thrustLatch = input.thrust;
  p.thrustTime = Math.max(0, p.thrustTime - dt);
  p.extension = p.thrustTime > 0 ? Math.sin(Math.PI * (1 - p.thrustTime / 0.55)) : 0;
  const targetY = p.guard ? clamp(input.yaw * 1.12, -1.5, 1.5) : input.yaw * (1 - p.extension);
  const targetP = p.guard
    ? clamp(0.46 + input.pitch * 0.78, -0.45, 1.28)
    : input.pitch * (1 - p.extension);
  const spring =
    weapons[p.weapon].spring * (p.short ? 1.5 : 1) * (p.stun ? 0.28 : 1) * (p.bind ? 0.24 : 1);
  const damper = 2 * Math.sqrt(spring) * 0.68;
  // Shoulders start the turn; the grip and forearm finish the remaining angle.
  p.torsoSpeed += ((targetY * 0.34 - p.torso) * 85 - p.torsoSpeed * 12) * dt;
  p.torso += p.torsoSpeed * dt;
  p.wy += ((targetY * 0.66 - p.yaw) * spring - p.wy * damper) * dt;
  p.wp += ((targetP - p.pitch) * spring - p.wp * damper) * dt;
  p.yaw += p.wy * dt;
  p.pitch += p.wp * dt;
  if (input.grab && !p.grabLatch) {
    const item = nearby(g, p);
    if (item) {
      const w = p.weapon;
      p.weapon = item.w;
      item.w = w;
      event(g, 'equip', [p.x, 1, p.z], i);
    }
  }
  p.grabLatch = input.grab;
}
export function bot(g, i = 1) {
  const p = g.p[i],
    other = g.p[1 - i],
    t = g.time,
    wave = g.round;
  const range = Math.hypot(p.x - other.x, p.z - other.z);
  const beat = (t * (1.03 + Math.min(0.6, wave * 0.055)) + i * 0.2) % 1.8;
  const dir = Math.floor((t * (1.03 + Math.min(0.6, wave * 0.055)) + i * 0.2) / 1.8) % 2 ? 1 : -1;
  return {
    fwd: range > 1.31 ? 0.79 : range < 0.97 ? -0.57 : 0.05,
    side: Math.cos(t * 1.18 + i) * 0.3,
    yaw: (beat < 0.82 ? -1 : 1) * dir * 1.36,
    pitch: beat < 0.82 ? 0.61 : -0.18 + 0.25 * Math.sin(t),
    guard: wave > 1 && beat > 1.49,
    short: range < 1,
    run: range > 2.9 && wave > 1,
    grab: false,
    thrust: wave > 2 && beat > 1.25 && beat < 1.43 && range > 1.18
  };
}
export function tick(g, input, dt = STEP) {
  g.time += dt;
  if (g.winner >= 0) {
    g.p[1 - g.winner].down += dt;
    return;
  }
  if (g.scouting) {
    advance(g, 0, input[0], dt);
    if (Math.hypot(g.p[0].x, g.p[0].z) < 1.22) {
      g.scouting = false;
      g.time = 0;
      event(g, 'summon', [0, 0, 0], 0);
    }
    return;
  }
  const old = g.p.map(blade);
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
  const blades = g.p.map(blade);
  const velocity = blades.map((seg, i) => Math.hypot(...sub(seg[1], old[i][1])) / dt);
  g.clashDelay = Math.max(0, g.clashDelay - dt);
  const clash = near(blades[0], blades[1]);
  const braced = g.p.some((p) => p.guard && !p.height && p.balance > 14);
  const touching = !a.recovery && !b.recovery && clash.d < (braced ? 0.13 : 0.095);
  if (touching && Math.max(...velocity) > 1.4 && !g.clashDelay) {
    g.clashDelay = 0.24;
    for (const [i, p] of g.p.entries()) {
      const stable = p.guard && !p.height && p.balance > 14;
      p.bind = stable ? 0.07 : 0.18;
      p.recoil = stable ? 0.18 : 0.47;
      p.balance = Math.max(0, p.balance - Math.min(18, velocity[1 - i] * (stable ? 0.95 : 1.6)));
      p.wy *= stable ? -0.22 : -0.72;
      p.wp *= -0.4;
      p.cooldown = Math.max(p.cooldown, 0.15);
    }
    event(g, 'clash', clash.pos, -1);
  }
  for (let i = 0; i < 2; i++) {
    const p = g.p[i],
      o = g.p[1 - i];
    if (p.cooldown || p.guard || p.stun || p.recovery || velocity[i] < 1.4) continue;
    const pose = groundPose(o),
      axis = bodyAxis(o, pose);
    const hip = [o.x, o.height + 0.865 - o.bend * 0.24 * (1 - pose.low) - pose.low * 0.65, o.z];
    const body = [-0.25, 0.83].map((offset) => hip.map((n, j) => n + axis[j] * offset));
    const contact = near(blades[i], body);
    if (contact.d > 0.32) continue;
    // A held bind continues to protect the covered line until the blades separate.
    if (touching && o.guard && o.balance > 14) continue;
    const momentum = clamp(velocity[i] * weapons[p.weapon].impact, 1.5, 10);
    const armor = g.solo && i === 0 ? 1 - Math.min(0.24, (g.round - 1) * 0.035) : 1;
    o.hp = Math.max(0, o.hp - (6 + momentum * 2.6) * armor);
    o.balance = Math.max(0, o.balance - 14 - momentum * 4);
    o.recoil = 1;
    p.cooldown = 0.42;
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
    event(g, 'hit', contact.pos, 1 - i);
    if (!o.hp) {
      g.winner = i;
      event(g, 'fall', contact.pos, 1 - i);
      break;
    }
  }
}
