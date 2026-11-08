// Boss Hours: smoke. Anything burning (props, the ground the fire breath leaves alight, fresh ash) puffs out small
// clouds that drift with the map's wind, swell and thin out. To keep the count down, nearby clouds merge: ones that
// sit nearly on top of each other become one denser cloud, ones that just touch become one bigger cloud. No DOM.
//
// A cloud: { x, y, r (px), m (mass; density is m / r², 0..1), vx, vy, age, v (look variant) }.
// The wind is picked once per map (g.map.wind) and never blows down: anywhere from straight left, through up, to
// straight right.

import { KINDS } from './props.js';

export const SMOKE_MAX = 140;       // hard cap on live clouds
const R_MAX = 30;                   // nothing grows past this
const R_SMALL = 15;                 // only clouds this small join up into a bigger one
const CELL = 16;                    // merge grid
const MERGE_EVERY = 0.1;            // seconds between merge passes
const FADE = 9;                     // seconds for a cloud's mass to fall to 1/e
const D_MIN = 0.045;                // thinner than this and it is gone

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const density = c => Math.min(1, c.m / (c.r * c.r));

// the map's wind: a direction from left (π) through up (−π/2) to right (0), and a speed. Seeded by the run and the
// map so it doesn't touch the game's own random numbers.
export function pickWind(seed, n, salt = 0) {
  const rng = mulberry32((seed ^ Math.imul(n + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA6B)) >>> 0);
  rng(); rng();
  // five headings, jittered a little, so "straight up" and "straight sideways" both turn up
  const k = Math.floor(rng() * 5);                    // 0 left, 1 up-left, 2 up, 3 up-right, 4 right
  let ang = -Math.PI + k * Math.PI / 4 + (rng() - 0.5) * 0.3;
  ang = Math.min(0, Math.max(-Math.PI, ang));          // never with a downward part
  const spd = 6 + rng() * 9;
  const x = Math.cos(ang) * spd, y = Math.min(0, Math.sin(ang) * spd);
  const name = ['LEFT', 'UP-LEFT', 'UP', 'UP-RIGHT', 'RIGHT'][k];
  return { ang, spd, x, y, name };
}

function init(g) {
  const m = g.map;
  if (!m.wind) m.wind = pickWind(g.seed >>> 0, m.n || 0, g.maps || 0);
  g.smoke = { map: m, clouds: [], rng: mulberry32(((g.seed >>> 0) ^ 0x5bd1e995 ^ (m.n || 0)) >>> 0), mergeT: 0, ashSeen: 0, smoulder: [],
    stats: { born: 0, dense: 0, large: 0, absorbed: 0, dropped: 0 } };
  return g.smoke;
}

// is (x, y) on the 320×180 screen (give or take m)?
const seen = (g, x, y, m) => x > g.cam.x - m && x < g.cam.x + 320 + m && y > g.cam.y - m && y < g.cam.y + 180 + m;

// a new puff at (x, y); when the cap is reached it is folded into the nearest cloud instead
function puff(s, g, x, y, r, d) {
  const rng = s.rng, w = g.map.wind, cs = s.clouds;
  const m = d * r * r;
  if (cs.length >= SMOKE_MAX) {
    let best = null, bd = 1e9;
    for (const c of cs) { const dd = (c.x - x) ** 2 + (c.y - y) ** 2; if (dd < bd) { bd = dd; best = c; } }
    if (best && bd < (best.r + 14) ** 2) { best.m += m * 0.8; s.stats.absorbed++; return; }
    // nothing near: off screen, skip it; on screen, make room by dropping the faintest cloud (off-screen ones first)
    if (!seen(g, x, y, 10)) { s.stats.skipped = (s.stats.skipped || 0) + 1; return; }
    let fi = 0, fd = Infinity;
    for (let i = 0; i < cs.length; i++) { const c = cs[i], dd = density(c) * c.r * (seen(g, c.x, c.y, c.r) ? 1 : 0.2); if (dd < fd) { fd = dd; fi = i; } }
    cs[fi] = cs[cs.length - 1]; cs.pop(); s.stats.dropped++;
  }
  cs.push({ x, y, r, m, vx: w.x * 0.2 + (rng() - 0.5) * 3, vy: -6 - rng() * 5, age: 0, v: Math.floor(rng() * 3) });
  s.stats.born++;
}

// how hard something burns over its life: it catches, roars, then dies down
const roar = k => k < 0.15 ? 0.4 + k * 4 : k > 0.8 ? Math.max(0.3, (1 - k) * 5) : 1;

function emit(s, g, dt) {
  const rng = s.rng;
  for (const p of g.props) {
    if (!p.burning || p.state === 'gone') continue;
    const d = KINDS[p.kind], bt = d?.burnTime || 6;
    const w = p.w || p.r * 2 + 2, size = p.w ? (p.w + p.h) / 2 : p.r * 2;
    const heat = roar(p.burnT / bt);
    // bigger fires puff more often and fatter puffs
    const rate = (1.2 + size * 0.22) * heat;
    p.smokeAcc = (p.smokeAcc || 0) + rate * dt;
    while (p.smokeAcc >= 1) {
      p.smokeAcc -= 1;
      const top = p.y - (p.state === 'up' ? (p.h ? p.h / 2 + 4 : 10) : 3);
      puff(s, g, p.x + (rng() - 0.5) * w * 0.8, top - rng() * 3, 1.8 + rng() * 1.4 + Math.min(4, size * 0.08), 0.45 + 0.3 * heat);
    }
  }
  // the ground the breath set alight
  for (const f of g.fires) {
    const k = f.t / f.life;
    if (k > 0.95) continue;
    f.smokeAcc = (f.smokeAcc || 0) + (0.7 + f.r * 0.12) * (k > 0.7 ? 0.5 : 1) * dt;
    if (f.smokeAcc >= 1) { f.smokeAcc -= 1; puff(s, g, f.x + (rng() - 0.5) * f.r, f.y - 2, 1.6 + rng() * 1.2, 0.22 + rng() * 0.12); }
  }
  // fresh ash smoulders for a few seconds
  if (g.ashes.length < s.ashSeen) s.ashSeen = 0;
  for (; s.ashSeen < g.ashes.length; s.ashSeen++) { const a = g.ashes[s.ashSeen]; s.smoulder.push({ x: a.x, y: a.y, r: a.r, t: 0, life: 4 + Math.min(4, a.r * 0.3), acc: 0 }); }
  for (const a of s.smoulder) {
    a.t += dt; a.acc += (0.5 + a.r * 0.08) * (1 - a.t / a.life) * dt;
    if (a.acc >= 1) { a.acc -= 1; puff(s, g, a.x + (rng() - 0.5) * a.r, a.y - 2, 1.6 + rng(), 0.2 + 0.1 * rng()); }
  }
  if (s.smoulder.length) s.smoulder = s.smoulder.filter(a => a.t < a.life);
}

// joins clouds that overlap or nearly touch. Only clouds in the same or neighbouring grid cells are compared.
function merge(s) {
  const cs = s.clouds, grid = new Map();
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i], k = Math.floor(c.x / CELL) * 8192 + Math.floor(c.y / CELL);
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  }
  const dead = new Uint8Array(cs.length);
  for (let i = 0; i < cs.length; i++) {
    if (dead[i]) continue;
    const a = cs[i], gx = Math.floor(a.x / CELL), gy = Math.floor(a.y / CELL);
    // big clouds reach farther, so look one more cell out for them
    const reach = a.r > CELL ? 2 : 1;
    for (let cy = gy - reach; cy <= gy + reach && !dead[i]; cy++) for (let cx = gx - reach; cx <= gx + reach && !dead[i]; cx++) {
      const list = grid.get(cx * 8192 + cy);
      if (!list) continue;
      for (const j of list) {
        if (j <= i || dead[j]) continue;
        const b = cs[j], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), q = dist / (a.r + b.r);
        if (q < 0.55) {
          // nearly on top of each other: one denser cloud, a touch bigger than the bigger one
          const big = a.r >= b.r ? a : b, sm = big === a ? b : a;
          const M = a.m + b.m, r = Math.min(R_MAX, Math.max(Math.sqrt(big.r * big.r + 0.3 * sm.r * sm.r), Math.sqrt(M)));
          const x = (a.x * a.m + b.x * b.m) / M, y = (a.y * a.m + b.y * b.m) / M;
          a.vx = (a.vx * a.m + b.vx * b.m) / M; a.vy = (a.vy * a.m + b.vy * b.m) / M;
          a.age = Math.min(a.age, b.age); a.x = x; a.y = Math.min(y, a.y, b.y); a.r = r; a.m = Math.min(M, r * r); a.v = big.v;
          dead[j] = 1; s.stats.dense++;
        } else if (q < 1.05 && a.r <= R_SMALL && b.r <= R_SMALL) {
          // close but apart: one bigger cloud covering both
          const r = (dist + a.r + b.r) / 2;
          if (r > R_MAX) continue;
          const t = dist > 0.001 ? (r - a.r) / dist : 0;
          const M = (a.m + b.m) * 0.96;
          a.vx = (a.vx * a.m + b.vx * b.m) / (a.m + b.m); a.vy = (a.vy * a.m + b.vy * b.m) / (a.m + b.m);
          a.x += dx * t; a.y = Math.min(a.y + dy * t, a.y, b.y); a.r = r; a.m = Math.min(M, r * r); a.age = Math.min(a.age, b.age);
          dead[j] = 1; s.stats.large++;
        } else continue;
        if (a.r > CELL && reach === 1) break;   // it grew; the next pass will look farther
      }
    }
  }
  let n = 0;
  for (let i = 0; i < cs.length; i++) if (!dead[i]) cs[n++] = cs[i];
  cs.length = n;
}

export function updateSmoke(g, dt) {
  let s = g.smoke;
  if (!s || s.map !== g.map) s = init(g);
  emit(s, g, dt);
  const w = g.map.wind, B = g.map, cs = s.clouds;
  const kv = 1 - Math.exp(-1.2 * dt), fade = Math.exp(-dt / FADE);
  let n = 0;
  for (const c of cs) {
    c.age += dt;
    // fresh puffs rise off the fire, then the wind takes them
    const lift = c.age < 2 ? -5 * (1 - c.age / 2) : 0;
    c.vx += (w.x - c.vx) * kv; c.vy += (w.y + lift - c.vy) * kv;
    if (c.vy > 0) c.vy = 0;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.r = Math.min(R_MAX, c.r + dt * 0.9 / (1 + c.r / 8));
    c.m *= fade;
    if (c.m / (c.r * c.r) < D_MIN) continue;
    if (c.x < -R_MAX - 20 || c.x > B.w + R_MAX + 20 || c.y < -R_MAX - 30 || c.y > B.h + R_MAX + 20) continue;
    cs[n++] = c;
  }
  cs.length = n;
  s.mergeT -= dt;
  if (s.mergeT <= 0 && cs.length > 1) { s.mergeT = MERGE_EVERY; merge(s); }
}
