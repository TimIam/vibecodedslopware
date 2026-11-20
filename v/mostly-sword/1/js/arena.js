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
  thrust: false
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
    thrustLatch: false,
    thrustTime: 0,
    extension: 0
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
export function blade(p) {
  const s = Math.sin(p.face),
    c = Math.cos(p.face);
  const reach = weapons[p.weapon].reach * (p.short ? 0.71 : 1);
  const gripSide = -0.25 + Math.sin(p.yaw) * 0.23;
  const gripFront = 0.32 + 0.1 * Math.cos(p.yaw) + p.extension * 0.16;
  const h = [
    p.x + c * gripSide + s * gripFront,
    1.13 + 0.15 * Math.sin(p.pitch) + 0.09 * p.extension,
    p.z - s * gripSide + c * gripFront
  ];
  const a = p.face + p.yaw,
    horizontal = reach * Math.cos(p.pitch);
  return [
    h,
    [h[0] + Math.sin(a) * horizontal, h[1] + reach * Math.sin(p.pitch), h[2] + Math.cos(a) * horizontal]
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
  p.face = Math.atan2(other.x - p.x, other.z - p.z);
  const s = Math.sin(p.face),
    c = Math.cos(p.face);
  p.stun = Math.max(0, p.stun - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.recoil = Math.max(0, p.recoil - dt * 3);
  p.balance = Math.min(100, p.balance + dt * (p.stun ? 0 : 9));
  p.guard = input.guard && !p.stun;
  p.short = input.short;
  const speed = p.stun ? 0.45 : p.guard ? 1.22 : 2.65;
  const f = input.fwd,
    r = input.side,
    scale = speed / Math.max(1, Math.hypot(f, r));
  p.vx += ((s * f - c * r) * scale - p.vx) * Math.min(1, dt * 8);
  p.vz += ((c * f + s * r) * scale - p.vz) * Math.min(1, dt * 8);
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const radius = Math.hypot(p.x, p.z);
  if (radius > 7.8) {
    p.x *= 7.8 / radius;
    p.z *= 7.8 / radius;
  }
  p.walk += Math.hypot(p.vx, p.vz) * dt * 4.5;
  if (input.thrust && !p.thrustLatch && !p.stun && !p.guard && p.thrustTime === 0) {
    p.thrustTime = 0.55;
    p.vx += s * 2.1;
    p.vz += c * 2.1;
  }
  p.thrustLatch = input.thrust;
  p.thrustTime = Math.max(0, p.thrustTime - dt);
  p.extension = p.thrustTime > 0 ? Math.sin(Math.PI * (1 - p.thrustTime / 0.55)) : 0;
  const targetY = p.guard ? input.yaw * 0.32 + 0.5 : input.yaw * (1 - p.extension);
  const targetP = p.guard ? 0.92 + input.pitch * 0.18 : input.pitch * (1 - p.extension);
  const spring = weapons[p.weapon].spring * (p.short ? 1.5 : 1) * (p.stun ? 0.28 : 1);
  const damper = 2 * Math.sqrt(spring) * 0.68;
  p.wy += ((targetY - p.yaw) * spring - p.wy * damper) * dt;
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
  if (clash.d < 0.11 && Math.max(...velocity) > 1.8 && !g.clashDelay) {
    g.clashDelay = 0.24;
    for (const p of g.p) {
      p.wy *= -0.5;
      p.wp *= -0.4;
      p.cooldown = Math.max(p.cooldown, 0.15);
    }
    event(g, 'clash', clash.pos, -1);
  }
  for (let i = 0; i < 2; i++) {
    const p = g.p[i],
      o = g.p[1 - i];
    if (p.cooldown || p.guard || p.stun || velocity[i] < 1.4) continue;
    const body = [
      [o.x, 0.64, o.z],
      [o.x, 1.7, o.z]
    ];
    const contact = near(blades[i], body);
    if (contact.d > 0.32) continue;
    // The guard catches contacts only on the side covered by the defending blade.
    if (o.guard && near(blades[i], blades[1 - i]).d < 0.48 && o.balance > 14) {
      o.balance -= 13;
      p.wy *= -0.62;
      p.cooldown = 0.3;
      event(g, 'clash', contact.pos, 1 - i);
      continue;
    }
    const momentum = clamp(velocity[i] * weapons[p.weapon].impact, 1.5, 10);
    const armor = g.solo && i === 0 ? 1 - Math.min(0.24, (g.round - 1) * 0.035) : 1;
    o.hp = Math.max(0, o.hp - (6 + momentum * 2.6) * armor);
    o.balance = Math.max(0, o.balance - 14 - momentum * 4);
    o.recoil = 1;
    p.cooldown = 0.42;
    o.vx += Math.sin(p.face) * momentum * 0.23;
    o.vz += Math.cos(p.face) * momentum * 0.23;
    if (o.balance < 12) {
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
