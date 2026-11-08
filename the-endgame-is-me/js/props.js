// The Endgame is Me: everything on a level that can be knocked down, set on fire, trampled or shoved into water.
// Props are trees, crops, buildings, walls and rubble; critters are the animals that run about; water is a grid of
// cells that pushed rubble fills in. No DOM. Kinds are registered by the level modules (see levels/index.js).
//
// Scoring rule for anything flammable: knocking it down pays def.crushShare of its value, burning pays the rest,
// and burning it standing pays all of it, so "crush then burn" and "just burn" are worth the same.

export const KINDS = {};      // prop kind → definition (see defaults below)
export const CRITTERS = {};   // critter kind → definition
const PROP_DEFAULTS = {
  r: 3, w: 0, h: 0, hp: 1, solid: false, slow: 0, slowR: 0, flammable: false, burnTime: 6, spread: 0.2,
  crushShare: 0.5, breaks: true, push: false, rubble: null, value: { pts: 0, venge: 0, chaos: 0 }, fireVenge: true,
};
const CRITTER_DEFAULTS = { r: 2, hp: 30, spd: 20, flee: 40, fear: 50, value: { pts: 50, venge: 0.05, chaos: 0.2 }, raise: null, trample: true, leaves: false };

let API = null;   // world.js hands over addScore, text, part, hurt, sound and so on (no import cycle at load time)
export function setWorldApi(api) { API = api; }
export function registerKinds(kinds = {}, critters = {}) {
  for (const k in kinds) KINDS[k] = { ...PROP_DEFAULTS, ...kinds[k], value: { ...PROP_DEFAULTS.value, ...(kinds[k].value || {}) } };
  for (const k in critters) CRITTERS[k] = { ...CRITTER_DEFAULTS, ...critters[k], value: { ...CRITTER_DEFAULTS.value, ...(critters[k].value || {}) } };
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- props

// rubble (push kinds) starts lying down, ready to shove
export function addProp(g, kind, x, y, extra = {}) {
  const d = KINDS[kind];
  if (!d) throw new Error('unknown prop kind ' + kind);
  const p = { id: g.nextId++, kind, x, y, r: d.r, w: d.w, h: d.h, hp: d.hp, maxhp: d.hp, state: d.push ? 'down' : 'up', burning: false, burnT: 0,
    paid: 0, seed: Math.floor(g.rng() * 1e6), fallA: 0, hitT: 0, vx: 0, vy: 0, broken: false, ...extra };
  g.props.push(p);
  g.propsDirty = true;
  return p;
}

// does a circle at (x, y) of radius r touch this prop? Props are circles, or rectangles when they have w and h.
export function touches(p, x, y, r) {
  if (p.w) { const dx = Math.max(Math.abs(x - p.x) - p.w / 2, 0), dy = Math.max(Math.abs(y - p.y) - p.h / 2, 0); return dx * dx + dy * dy < r * r; }
  return Math.hypot(x - p.x, y - p.y) < r + p.r;
}
// the point on a prop's outline closest to (x, y), and the push-out direction
function closest(p, x, y) {
  if (p.w) {
    const cx = clamp(x, p.x - p.w / 2, p.x + p.w / 2), cy = clamp(y, p.y - p.h / 2, p.y + p.h / 2);
    let nx = x - cx, ny = y - cy, d = Math.hypot(nx, ny);
    if (d < 0.001) { // inside: push out the short way
      const ex = p.w / 2 - Math.abs(x - p.x), ey = p.h / 2 - Math.abs(y - p.y);
      if (ex < ey) { nx = Math.sign(x - p.x) || 1; ny = 0; return { x: p.x + nx * p.w / 2, y, nx, ny, d: -ex }; }
      nx = 0; ny = Math.sign(y - p.y) || 1; return { x, y: p.y + ny * p.h / 2, nx, ny, d: -ey };
    }
    return { x: cx, y: cy, nx: nx / d, ny: ny / d, d };
  }
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy) || 0.001;
  return { x: p.x + dx / d * p.r, y: p.y + dy / d * p.r, nx: dx / d, ny: dy / d, d: d - p.r };
}

// a coarse grid so "what is near here" stays cheap with hundreds of props
const CELL = 24;
function rebuildGrid(g) {
  const grid = new Map();
  for (const p of g.props) {
    if (p.state === 'gone') continue;
    const rx = (p.w ? p.w / 2 : p.r) + 2, ry = (p.h ? p.h / 2 : p.r) + 2;
    for (let cy = Math.floor((p.y - ry) / CELL); cy <= Math.floor((p.y + ry) / CELL); cy++)
      for (let cx = Math.floor((p.x - rx) / CELL); cx <= Math.floor((p.x + rx) / CELL); cx++) {
        const k = cx * 4096 + cy;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(p);
      }
  }
  g.pgrid = grid; g.propsDirty = false;
}
export function near(g, x, y, r) {
  if (!g.pgrid || g.propsDirty) rebuildGrid(g);
  const out = new Set();
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      const a = g.pgrid.get(cx * 4096 + cy);
      if (a) for (const p of a) if (p.state !== 'gone') out.add(p);
    }
  return out;
}

// pays a share of a prop's value: points (times the multiplier), Vengeance and Chaos
function pay(g, p, frac, fire) {
  frac = Math.min(frac, 1 - p.paid);
  if (frac <= 0) return;
  p.paid += frac;
  const d = KINDS[p.kind], v = d.value;
  if (v.pts) {
    const pts = Math.round(v.pts * frac * g.mult);
    API.addScore(g, pts);
    if (pts >= 20) API.text(g, p.x, p.y - 8, `+${pts}`, fire ? 'flame' : 'cream', 0.9);
  }
  if (v.venge && (!fire || d.fireVenge)) API.vengeance(g, v.venge * frac);
  if (v.chaos) API.chaos(g, v.chaos * frac);
}

// knocked over, flattened or collapsed. ang is the direction it falls.
export function knockDown(g, p, ang = 0) {
  if (p.state !== 'up') return;
  const d = KINDS[p.kind];
  p.state = d.flammable || d.push ? 'down' : 'gone';
  p.fallA = ang; p.hp = 0; p.broken = true;
  pay(g, p, d.flammable ? d.crushShare : 1, false);
  g.propsDirty = true;
  API.sound(g, d.solid ? 'collapse' : 'crunch');
  const kind = d.leaves || 'splinter';
  for (let i = 0; i < (d.solid ? 16 : 7); i++) { const a = g.rng() * TAU, s = 15 + g.rng() * 35; API.part(g, p.x, p.y - 2, Math.cos(a) * s, Math.sin(a) * s, 0.5, kind); }
  if (d.solid) g.shake = Math.max(g.shake, 0.2);
  // buildings leave rubble you can shove about (into a moat, for one)
  if (d.rubble) for (let i = 0; i < (d.rubbleN || 2); i++) {
    const a = g.rng() * TAU, rr = (p.w ? Math.min(p.w, p.h) / 3 : p.r) * g.rng();
    addProp(g, d.rubble, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
  }
  if (d.onDown) d.onDown(g, p);
}

export function hitProp(g, p, dmg, ang) {
  if (p.state !== 'up') return;
  p.hp -= dmg;
  p.hitT = 0.12;
  if (p.hp <= 0) knockDown(g, p, ang);
  else if (KINDS[p.kind].solid) API.sound(g, 'thump');
}

export function ignite(g, p) {
  const d = KINDS[p.kind];
  if (!d.flammable || p.burning || p.state === 'gone') return false;
  p.burning = true; p.burnT = 0;
  API.sound(g, 'whoosh');
  return true;
}

// a swipe, stomp or charge: every prop and critter the test accepts takes the hit
export function damageZone(g, test, dmg, cx, cy, reach) {
  for (const p of near(g, cx, cy, reach)) {
    if (p.state !== 'up') continue;
    const c = closest(p, cx, cy);
    if (test(c.x, c.y) || test(p.x, p.y)) hitProp(g, p, dmg, Math.atan2(p.y - cy, p.x - cx));
  }
  for (const c of g.critters) if (!c.dead && test(c.x, c.y)) hurtCritter(g, c, dmg);
}
// fire breath, burning ground and the beam: set alight whatever they touch (chance per call)
export function igniteZone(g, test, cx, cy, reach, chance = 1) {
  for (const p of near(g, cx, cy, reach)) if (KINDS[p.kind].flammable && !p.burning && test(p.x, p.y) && g.rng() < chance) ignite(g, p);
}

export function slowAt(g, x, y) {
  let f = 1;
  for (const p of near(g, x, y, 14)) {
    const d = KINDS[p.kind];
    if (p.state === 'up' && d.slow && Math.hypot(x - p.x, y - p.y) < d.slowR) f = Math.min(f, 1 - d.slow);
  }
  return f;
}

// keeps something round out of solid props (and out of water)
export function solidPush(g, e, r) {
  for (const p of near(g, e.x, e.y, r + 4)) {
    if (p.state !== 'up' || !KINDS[p.kind].solid) continue;
    const c = closest(p, e.x, e.y);
    if (c.d < r) { e.x += c.nx * (r - c.d); e.y += c.ny * (r - c.d); }
  }
  if (g.water && isWater(g, e.x, e.y)) unstuck(g, e);
}

// the boss has just moved from (ox, oy): trample, bash, shove. Returns true if something solid stopped it.
export function bossTouch(g, ox, oy, dt) {
  const b = g.boss, mx = b.x - ox, my = b.y - oy, ml = Math.hypot(mx, my);
  let blocked = false;
  for (const p of near(g, b.x, b.y, b.r + 14)) {
    const d = KINDS[p.kind];
    if (!touches(p, b.x, b.y, b.r - 1)) continue;
    if (p.state === 'up' && d.solid) {
      // push back out, and bash it if you were walking into it
      const c = closest(p, b.x, b.y);
      if (c.d < b.r) { b.x += c.nx * (b.r - c.d); b.y += c.ny * (b.r - c.d); blocked = true; }
      p.bashT = (p.bashT || 0) - dt;
      if (ml > 0.05 && (mx * -c.nx + my * -c.ny) > 0 && p.bashT <= 0) {
        p.bashT = 0.4;
        hitProp(g, p, b.bash || 45, Math.atan2(-c.ny, -c.nx));
        g.shake = Math.max(g.shake, 0.1);
      }
    } else if (p.state === 'up') {
      if (ml > 0.05) knockDown(g, p, Math.atan2(my, mx) + (g.rng() - 0.5) * 0.8);
    } else if (p.state === 'down' && d.push) {
      // rubble gets shoved ahead of you
      const dx = p.x - b.x, dy = p.y - b.y, dd = Math.hypot(dx, dy) || 1;
      const sp = ml / Math.max(dt, 0.001);
      p.vx = (mx / (ml || 1)) * Math.max(40, sp * 2.2) + dx / dd * 25;
      p.vy = (my / (ml || 1)) * Math.max(40, sp * 2.2) + dy / dd * 25;
    }
  }
  for (const c of g.critters) {
    if (c.dead || Math.hypot(c.x - b.x, c.y - b.y) > b.r + c.r) continue;
    if (CRITTERS[c.kind].trample) hurtCritter(g, c, 999);
  }
  return blocked;
}

export function updateProps(g, dt) {
  for (const p of g.props) {
    if (p.state === 'gone') continue;
    p.hitT = Math.max(0, p.hitT - dt);
    const d = KINDS[p.kind];
    if (p.burning) {
      p.burnT += dt;
      // fire spreads to whatever is close, and burns heroes standing in it
      if (g.rng() < d.spread * dt * 4) {
        for (const q of near(g, p.x, p.y, 16)) if (q !== p && !q.burning && KINDS[q.kind].flammable && Math.hypot(q.x - p.x, q.y - p.y) < (p.w || p.r * 2) + 10 && g.rng() < 0.25) ignite(g, q);
      }
      // licks of flame (the smoke comes from smoke.js)
      if (g.rng() < 0.25) API.part(g, p.x + (g.rng() - 0.5) * (p.w || p.r * 2), p.y - 2 - g.rng() * 4, (g.rng() - 0.5) * 8, -12 - g.rng() * 14, 0.5 + g.rng() * 0.4, 'flame');
      for (const u of g.units) if (!u.dead && touches(p, u.x, u.y, 4)) API.hurt(g, u, 20 * dt);
      if (p.burnT >= d.burnTime) {
        p.burning = false; p.state = 'gone'; p.ash = true;
        pay(g, p, 1, true);
        g.ashes.push({ x: p.x, y: p.y, r: p.w ? Math.max(p.w, p.h) / 2 : p.r + 2, w: p.w, h: p.h, seed: p.seed });
        g.propsDirty = true;
      }
    }
    if (p.vx || p.vy) {
      // shoved rubble slides, slows, and drops into any water it reaches
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.exp(-5 * dt); p.vx *= k; p.vy *= k;
      if (Math.abs(p.vx) + Math.abs(p.vy) < 2) { p.vx = 0; p.vy = 0; }
      g.propsDirty = true;
      if (g.water && isWater(g, p.x, p.y)) {
        fillWater(g, p.x, p.y, d.fill || 1);
        p.state = 'gone'; p.vx = p.vy = 0;
        API.sound(g, 'splash');
        for (let i = 0; i < 8; i++) { const a = g.rng() * TAU; API.part(g, p.x, p.y, Math.cos(a) * 25, Math.sin(a) * 25 - 10, 0.5, 'splash'); }
      }
    }
  }
  if (g.props.length > 1500) { g.props = g.props.filter(p => p.state !== 'gone' || p.burning); g.propsDirty = true; }
  updateCritters(g, dt);
}

// ---------------------------------------------------------------------------------------------- water

// cells: 0 land, 1 water, 2 filled with rubble (walkable)
export function makeWater(w, h, cs = 6) {
  const cols = Math.ceil(w / cs), rows = Math.ceil(h / cs);
  return { cs, cols, rows, a: new Uint8Array(cols * rows) };
}
export function setWater(wt, x0, y0, x1, y1, v = 1) {
  for (let y = Math.floor(y0 / wt.cs); y <= Math.floor(y1 / wt.cs); y++) for (let x = Math.floor(x0 / wt.cs); x <= Math.floor(x1 / wt.cs); x++)
    if (x >= 0 && y >= 0 && x < wt.cols && y < wt.rows) wt.a[y * wt.cols + x] = v;
}
export function waterCell(g, x, y) {
  const w = g.water, cx = Math.floor(x / w.cs), cy = Math.floor(y / w.cs);
  return cx < 0 || cy < 0 || cx >= w.cols || cy >= w.rows ? 0 : w.a[cy * w.cols + cx];
}
export const isWater = (g, x, y) => g.water && waterCell(g, x, y) === 1;
// a lump of rubble fills the cell it lands in and some of its neighbours
export function fillWater(g, x, y, amount = 1) {
  const w = g.water, cx = Math.floor(x / w.cs), cy = Math.floor(y / w.cs);
  const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  let n = 0;
  for (const [dx, dy] of cells) {
    if (n >= 2 + amount * 2) break;
    const X = cx + dx, Y = cy + dy;
    if (X < 0 || Y < 0 || X >= w.cols || Y >= w.rows || w.a[Y * w.cols + X] !== 1) continue;
    w.a[Y * w.cols + X] = 2; n++;
  }
  g.waterDirty = true;
  if (n) API.filled?.(g, x, y, n);
}
// does a circle hit open water?
export function hitsWater(g, x, y, r) {
  if (!g.water) return false;
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; if (isWater(g, x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85)) return true; }
  return isWater(g, x, y);
}
// moves something standing in water to the nearest dry spot
function unstuck(g, e) {
  const w = g.water;
  for (let rr = 1; rr < 8; rr++) for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU, x = e.x + Math.cos(a) * rr * w.cs, y = e.y + Math.sin(a) * rr * w.cs;
    if (!isWater(g, x, y)) { e.x = x; e.y = y; return; }
  }
}

// ---------------------------------------------------------------------------------------------- critters

export function addCritter(g, kind, x, y, extra = {}) {
  const d = CRITTERS[kind];
  const c = { id: g.nextId++, kind, x, y, hx: x, hy: y, hp: d.hp, r: d.r, dead: false, gone: false, walk: g.rng() * 10, fx: g.rng() < 0.5 ? 1 : -1,
    moving: false, tx: x, ty: y, scared: 0, hitT: 0, seed: Math.floor(g.rng() * 1e6), ...extra };
  g.critters.push(c);
  return c;
}

export function hurtCritter(g, c, dmg) {
  if (c.dead) return;
  c.hp -= dmg; c.hitT = 0.12; c.scared = 4;
  if (c.hp > 0) return;
  c.dead = true;
  const d = CRITTERS[c.kind], v = d.value;
  const pts = Math.round(v.pts * g.mult);
  API.addScore(g, pts);
  API.text(g, c.x, c.y - 6, `+${pts}`, 'cream', 0.9);
  if (v.venge) API.vengeance(g, v.venge);
  if (v.chaos) API.chaos(g, v.chaos);
  API.sound(g, d.cry || 'kill');
  for (let i = 0; i < 6; i++) { const a = g.rng() * TAU, s = 10 + g.rng() * 25; API.part(g, c.x, c.y - 1, Math.cos(a) * s, Math.sin(a) * s, 0.35, d.bits || 'blood'); }
  if (!d.leaves) g.corpses.push({ u: null, critter: c.kind, x: c.x, y: c.y, cls: null, t: 0, fx: c.fx });
}

function updateCritters(g, dt) {
  const b = g.boss;
  for (const c of g.critters) {
    if (c.dead) continue;
    const d = CRITTERS[c.kind];
    c.hitT = Math.max(0, c.hitT - dt);
    c.scared = Math.max(0, c.scared - dt);
    const db = Math.hypot(c.x - b.x, c.y - b.y);
    if (db < d.fear || c.scared > 0 || c.bolting) {
      // run away from the boss (carts and the like bolt for the edge of the map and are gone)
      let ax = c.x - b.x, ay = c.y - b.y; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      if (d.leaves) c.bolting = true;
      const sp = d.flee * (c.slowed || 1);
      const ox = c.x, oy = c.y;
      c.x += (ax + Math.sin(g.t * 3 + c.seed) * 0.4) * sp * dt; c.y += (ay + Math.cos(g.t * 2.7 + c.seed) * 0.4) * sp * dt;
      c.walk += sp * dt * 0.5; c.moving = true; if (Math.abs(c.x - ox) > 0.01) c.fx = c.x > ox ? 1 : -1;
      c.face = Math.atan2(c.y - oy, c.x - ox);
    } else {
      // wander about near home
      if (Math.hypot(c.tx - c.x, c.ty - c.y) < 1.5) {
        c.moving = false;
        if (g.rng() < 0.4 * dt) { c.tx = c.hx + (g.rng() - 0.5) * 30; c.ty = c.hy + (g.rng() - 0.5) * 20; }
      } else {
        const dx = c.tx - c.x, dy = c.ty - c.y, l = Math.hypot(dx, dy);
        c.x += dx / l * d.spd * dt; c.y += dy / l * d.spd * dt; c.walk += d.spd * dt * 0.5; c.moving = true;
        if (Math.abs(dx) > 0.2) c.fx = dx > 0 ? 1 : -1;
        c.face = Math.atan2(dy, dx);
      }
    }
    solidPush(g, c, c.r);
    const B = g.map;
    if (c.bolting && (c.x < -20 || c.y < -20 || c.x > B.w + 20 || c.y > B.h + 20)) c.gone = true;
    c.x = clamp(c.x, c.bolting ? -30 : 4, c.bolting ? B.w + 30 : B.w - 4); c.y = clamp(c.y, c.bolting ? -30 : 14, c.bolting ? B.h + 30 : B.h - 18);
  }
  if (g.critters.some(c => c.dead || c.gone)) g.critters = g.critters.filter(c => !c.dead && !c.gone);
}
