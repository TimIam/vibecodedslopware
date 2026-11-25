// The secret level, "the Udderly Secret Level": a dark fen the evil cow on the City Wall drops the boss into (see
// wall.js and world.js SCENE). No heroes come here. Suicide Steers wade in from the dark in waves, a few more each time;
// one that gets close enough to the boss goes off by itself, and one that is killed goes off like a bomb, hurting the
// boss and every steer near it, so a herd that bunches up blows itself apart in a chain. Every blast shakes the screen
// (more of them at once, more shake) and leaves a mud crater that fills with swamp water. Shallow water and craters
// slow the boss down. Survive ten waves and the Minotaur comes: four heroes tall, ten heroes' worth of health, a stun
// charge and a roar that slows the boss's turning and walking. When he falls the swamp takes him (the 'mino' cutscene)
// and the boss drops into the city, level 6. Necromancers have nothing to raise here: nothing leaves a body.
//
// The fen goes on for ever, every way: it is one tile (MW × MH) that wraps round left-right and top-bottom (map.wrapW,
// map.wrapH: the world keeps everything within half a tile of the boss, world.js wrapWorld). One periodic noise field
// (MARSH, a grid of 4 px cells) decides shallow water against land, about 40/60, and the sim and the art read the same
// grid, so the edges of the tile join up seamlessly.

import { drawCow, INK, COW_PAL2, mapSprite } from './farms.js';
import * as P_ from '../props.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const MW = 720, MH = 480, CS = 4, COLS = MW / CS, ROWS = MH / CS;
export const WAVES = 10;
const WADE = 0.6, MUD = 0.55;         // how fast the boss goes in shallow water, and in a crater
const BOOM = { r: 40, boss: 330, fuse: 0.12, crater: 7, shake: 0.15, maxShake: 1 };   // (v20: three times the damage, twice the reach; craters unchanged)
const STEER = { hp: 50, spd: 9, spdWave: 0.7, near: 4 };
// (v21: three times the damage it used to do, twice the health)
const MINO = { hp: 2 * 10 * 110, r: 6, spd: 17, swing: 3 * 70, swingT: 1.3, reach: 6, atk: 0.5, strike: 0.22, charge: { every: 7, wind: 0.8, spd: 125, time: 0.9, dmg: 3 * 220, stun: 1.5, min: 34, max: 140 }, roar: { every: 11, wind: 0.6, range: 120, slow: 4 } };
const wrap = (v, n) => ((v % n) + n) % n;

// ---------------------------------------------------------------------------------------------- the herd

let API = null;   // the world's level api, kept from the last update so a dying steer can go off

export const critters = {
  fen_steer: { r: 3.5, hp: STEER.hp, spd: 0, flee: 0, fear: 0, noCorpse: true, trample: true, bits: 'blood', cry: 'moo', value: { pts: 120, venge: 0.08, chaos: 0 },
    ai: steerAi, onDie: (g, c) => g.fen.booms.push({ x: c.x, y: c.y, t: c.selfBoom ? 0 : BOOM.fuse }) },
  fen_mino: { r: MINO.r, hp: MINO.hp, spd: 0, flee: 0, fear: 0, noCorpse: true, trample: false, bits: 'blood', cry: 'minohurt', value: { pts: 8000, venge: 1, chaos: 0 },
    ai: minoAi, onDie: (g, c) => { g.fen.minoDown = { x: c.x, y: c.y }; } },
};

// a steer plods at the boss; close enough to touch it, it goes off there and then
function steerAi(g, c, dt) {
  if (g.boss.dead) { steerDance(g, c, dt); return; }
  const b = g.boss, dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1;
  const sp = (STEER.spd + STEER.spdWave * (g.fen?.wave || 1)) * (shallowAt(g, c.x, c.y) ? 0.7 : 1);
  c.x += (dx / d + Math.sin(g.t * 1.3 + c.seed) * 0.35) * sp * dt; c.y += (dy / d + Math.cos(g.t * 1.1 + c.seed) * 0.35) * sp * dt;
  c.walk += sp * dt * 0.5; c.moving = true; c.fx = dx > 0 ? 1 : -1;
  if (d < b.r + c.r + STEER.near && !b.dead && !g.scene) { c.selfBoom = true; API?.hurtCritter?.(g, c, 1e6); }
  // they keep a little apart from each other, but not much
  for (const o of g.critters) if (o !== c && !o.dead && o.kind === 'fen_steer') { const ex = c.x - o.x, ey = c.y - o.y, e = Math.hypot(ex, ey); if (e < 6 && e > 0.01) { c.x += ex / e * (6 - e) * 0.5; c.y += ey / e * (6 - e) * 0.5; } }
}

// The boss is down: every steer stops where it is, stands up on its hind legs and dances. Two that end up close take
// each other by the hoof (c.partner: the other's id) and sway together.
function steerDance(g, c, dt) {
  c.moving = false;
  if (!c.dance) {
    c.dance = { t: g.rng() * 2 };
    let best = null, bd = 16;
    for (const o of g.critters) {
      if (o === c || o.dead || o.kind !== 'fen_steer' || o.dance?.partner != null) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      best.dance ||= { t: c.dance.t };
      c.dance.partner = best.id; best.dance.partner = c.id; best.dance.t = c.dance.t;
      // shuffle into step: side by side, a few pixels apart
      const mx = (c.x + best.x) / 2, my = (c.y + best.y) / 2, left = c.x <= best.x ? c : best, right = left === c ? best : c;
      left.x = mx - 6; right.x = mx + 6; left.y = right.y = my;   // (far enough apart that their held-out hooves meet)
      left.fx = 1; right.fx = -1;
    }
  }
  c.dance.t += dt;
}

// the Minotaur: walks you down and swings his axe, now and then lowers his horns and charges, now and then roars.
// c.face is the way he is facing (8 ways round, for the art); m.atk times the swing, which lands partway through it.
const MINO_TAUNTS = ['TOO SLOW, FUZZY', 'MY BOG. MY RULES', 'GO HOME TO YOUR ROCKS', 'WHO IS THE BOSS NOW?', 'SNORT. PATHETIC',
  'NICE HORNS. SHAME', 'MOO-HA-HA-HA', 'RESPAWN AND TRY AGAIN', 'THE STEERS SAY HI', 'BETTER LUCK NEXT RESET'];
function minoGloat(g, c, m, dt) {
  const V = g.cam, on = c.x > V.x - 10 && c.x < V.x + 330 && c.y > V.y - 10 && c.y < V.y + 190;
  if (!on) return;
  m.atk = null; m.state = 'gloat';
  m.gloatT = (m.gloatT ?? 0.3) - dt;
  m.laugh = (m.laugh || 0) + dt;   // (the art shakes him with laughter)
  if (m.gloatT > 0) return;
  if (!m.laughed) {
    m.laughed = true; m.gloatT = 1.6;
    API?.text(g, c.x, c.y - 30, 'HAR HAR HAR', 'red', 1.8);
    API?.sound(g, 'minohurt');
    return;
  }
  m.gloatT = 1.7;
  m.taunt = ((m.taunt ?? Math.floor(g.rng() * MINO_TAUNTS.length)) + 1) % MINO_TAUNTS.length;
  API?.text(g, c.x, c.y - 30, MINO_TAUNTS[m.taunt], 'red', 1.6);
}

function minoAi(g, c, dt) {
  const b = g.boss, m = c.mino ||= { state: 'enter', t: 0, chargeT: 4, roarT: 8, swingT: 1 };
  const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1;
  m.t += dt; m.chargeT -= dt; m.roarT -= dt; m.swingT -= dt;
  c.moving = false;
  const face = a => { c.face = a; c.fx = Math.cos(a) >= 0 ? 1 : -1; };
  const walk = (tx, ty, sp) => {
    const ex = tx - c.x, ey = ty - c.y, e = Math.hypot(ex, ey) || 1, s = Math.min(e, sp * dt * (shallowAt(g, c.x, c.y) ? 0.75 : 1));
    c.x += ex / e * s; c.y += ey / e * s; c.walk += s * 0.4; c.moving = s > 0.01; face(Math.atan2(ey, ex));
  };
  if (c.face == null) face(Math.atan2(dy, dx));
  if (b.dead) { minoGloat(g, c, m, dt); face(Math.atan2(dy, dx)); return; }
  if (m.atk != null) {
    // the swing: up, over, and down onto whatever is in front of him
    const was = m.atk;
    m.atk += dt;
    if (was < MINO.strike && m.atk >= MINO.strike && !b.dead && !g.scene && d < b.r + c.r + MINO.reach + 3) { API?.hurtBoss(g, MINO.swing * ngK(g)); API?.sound(g, 'bite'); g.shake = Math.max(g.shake, 0.12); }
    if (m.atk >= MINO.atk) m.atk = null;
  }
  if (b.dead || g.scene) return;
  switch (m.state) {
    case 'enter':
      walk(b.x, b.y, MINO.spd * 1.3);
      if (d < 90 || m.t > 6) { m.state = 'chase'; API?.sound(g, 'minoroar'); }
      break;
    case 'chase':
      if (m.atk != null) break;   // (he finishes his swing first)
      if (m.roarT <= 0 && d < MINO.roar.range) { m.state = 'roar'; m.t = 0; API?.text(g, c.x, c.y - 30, 'RAAAAWR', 'red', 1.2); break; }
      if (m.chargeT <= 0 && d > MINO.charge.min && d < MINO.charge.max) { m.state = 'wind'; m.t = 0; m.dir = Math.atan2(dy, dx); face(m.dir); break; }
      if (d > b.r + c.r + MINO.reach - 1) walk(b.x, b.y, MINO.spd);
      else { face(Math.atan2(dy, dx)); if (m.swingT <= 0) { m.swingT = MINO.swingT; m.atk = 0; API?.sound(g, 'whoosh'); } }
      break;
    case 'wind':
      // he paws the ground and lowers his horns: a beat to get out of the way
      face(m.dir);
      if (Math.floor(m.t * 10) % 3 === 0) API?.part(g, c.x - Math.cos(m.dir) * 4, c.y - Math.sin(m.dir) * 2, -Math.cos(m.dir) * 20, -8, 0.3, 'dust');
      if (m.t >= MINO.charge.wind) { m.state = 'charge'; m.t = 0; m.hit = false; API?.sound(g, 'charge'); }
      break;
    case 'charge': {
      const s = MINO.charge.spd * dt;
      c.x += Math.cos(m.dir) * s; c.y += Math.sin(m.dir) * s; c.moving = true; c.walk += s * 0.6;
      if (g.rng() < 0.7) API?.part(g, c.x, c.y + 1, (g.rng() - 0.5) * 30, -5, 0.4, 'splash');
      if (!m.hit && Math.hypot(b.x - c.x, b.y - c.y) < b.r + c.r + 2) {
        m.hit = true;
        API?.hurtBoss(g, MINO.charge.dmg * ngK(g));
        API?.stunBoss(g, MINO.charge.stun);
        b.x += Math.cos(m.dir) * 10; b.y += Math.sin(m.dir) * 10;
        g.shake = Math.max(g.shake, 0.5);
        API?.text(g, b.x, b.y - 24, 'STUNNED', 'gold', 1.2);
      }
      if (m.t >= MINO.charge.time) { m.state = 'chase'; m.chargeT = MINO.charge.every * (0.8 + g.rng() * 0.4); }
      break;
    }
    case 'roar':
      face(Math.atan2(dy, dx));
      if (m.t >= MINO.roar.wind && !m.roared) {
        m.roared = true;
        g.rings.push({ x: c.x, y: c.y, r: 6, max: MINO.roar.range, t: 0, col: 'roar' });
        g.shake = Math.max(g.shake, 0.3);
        if (d < MINO.roar.range) { API?.slowBoss(g, MINO.roar.slow); API?.text(g, b.x, b.y - 24, 'SLOWED', 'frost', 1.4); }
        API?.sound(g, 'minoroar');
      }
      if (m.t >= MINO.roar.wind + 0.6) { m.state = 'chase'; m.roared = false; m.roarT = MINO.roar.every * (0.8 + g.rng() * 0.4); }
      break;
  }
  // he is solid to the boss
  const e = Math.hypot(c.x - b.x, c.y - b.y), min = b.r + c.r;
  if (e < min && e > 0.01 && m.state !== 'charge') { c.x = b.x + (c.x - b.x) / e * min; c.y = b.y + (c.y - b.y) / e * min; }
}
const ngK = g => 1 + 0.4 * (g.ng || 0);

// ---------------------------------------------------------------------------------------------- the map

// value noise that repeats every px × py lattice cells (so a field built from it tiles), the same in the sim and the art
const hs = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vnp(x, y, px, py, k) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = t => t * t * (3 - 2 * t);
  const X0 = wrap(xi, px) + k, X1 = wrap(xi + 1, px) + k, Y0 = wrap(yi, py), Y1 = wrap(yi + 1, py);
  const a = hs(X0, Y0), b = hs(X1, Y0), c = hs(X0, Y1), d = hs(X1, Y1), u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function build(g, rng) {
  const a = new Uint8Array(COLS * ROWS), seed = Math.floor(rng() * 1000);
  const start = { x: MW / 2, y: MH / 2, face: -Math.PI / 2 };
  const vals = new Float32Array(COLS * ROWS);
  // three octaves, each a whole number of lattice cells across the tile (180 × 120 cells)
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    vals[r * COLS + c] = vnp(c / 15, r / 15, 12, 8, seed * 7) * 0.6 + vnp(c / 5, r / 5, 36, 24, seed * 7 + 5000) * 0.3 + vnp(c / 2, r / 2, 90, 60, seed * 7 + 9000) * 0.1;
  // the threshold that makes it about 40% water
  const sorted = Array.from(vals).sort((p, q) => p - q), cut = sorted[Math.floor(sorted.length * 0.6)];
  for (let i = 0; i < a.length; i++) a[i] = vals[i] > cut ? 1 : 0;
  // dry land where the boss lands
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (Math.hypot(c * CS - start.x, r * CS - start.y) < 26) a[r * COLS + c] = 0;
  g.fen = { wave: 0, waveT: 4, pause: true, booms: [], minoDown: null, mino: false, done: false };
  g.craters = [];
  return { w: MW, h: MH, scroll: 'xy', wrapW: MW, wrapH: MH, looped: true, start, marsh: { cols: COLS, rows: ROWS, a }, seed };
}
function shallowAt(g, x, y) {
  const M = g.map.marsh;
  if (!M) return false;
  return M.a[wrap(Math.floor(y / CS), M.rows) * M.cols + wrap(Math.floor(x / CS), M.cols)] === 1;
}
function bossSlow(g, x, y) {
  for (const k of g.craters) if (Math.hypot(x - k.x, y - k.y) < k.r) return MUD;
  return shallowAt(g, x, y) ? WADE : 1;
}

// ---------------------------------------------------------------------------------------------- the level's rules

function spawnWave(g, P, n) {
  const b = g.boss, count = 3 + n * 2;
  for (let i = 0; i < count; i++) {
    const a = g.rng() * TAU, r = 190 + g.rng() * 50;
    P.addCritter(g, 'fen_steer', b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.75);
  }
}

function update(g, dt, api) {
  API = api;
  const f = g.fen, b = g.boss;
  if (!f || g.scene) return;
  // the bombs: each blast hurts the boss if it is close, sets off every steer in reach, and leaves a crater. Each one
  // shakes the screen a little; a chain of them shakes it a lot.
  if (f.booms.length) {
    for (const k of f.booms) k.t -= dt;
    const now = f.booms.filter(k => k.t <= 0);
    f.booms = f.booms.filter(k => k.t > 0);
    for (const k of now) {
      g.shake = Math.min(BOOM.maxShake, Math.max(0, g.shake) + BOOM.shake);
      api.sound(g, 'boom');
      g.rings.push({ x: k.x, y: k.y, r: 3, max: BOOM.r, t: 0, col: 'dust' });
      for (let i = 0; i < 18; i++) { const a = g.rng() * TAU, s = 20 + g.rng() * 60; api.part(g, k.x, k.y, Math.cos(a) * s, Math.sin(a) * s, 0.5, i % 3 ? 'flame' : 'dust'); }
      for (let i = 0; i < 6; i++) { const a = g.rng() * TAU; api.part(g, k.x, k.y, Math.cos(a) * 40, Math.sin(a) * 40 - 20, 0.7, '#4a3420'); }
      if (Math.hypot(b.x - k.x, b.y - k.y) < BOOM.r + b.r * 0.3) api.hurtBoss(g, BOOM.boss * ngK(g));
      for (const c of g.critters) if (!c.dead && Math.hypot(c.x - k.x, c.y - k.y) < BOOM.r) api.hurtCritter(g, c, c.kind === 'fen_mino' ? 120 : 1e6);
      g.craters.push({ x: k.x, y: k.y, r: BOOM.crater + g.rng() * 2, seed: Math.floor(g.rng() * 1000), t: 0 });
      if (g.craters.length > 90) g.craters.shift();
    }
  }
  for (const k of g.craters) k.t += dt;
  // the waves, then the Minotaur
  const steers = g.critters.filter(c => !c.dead && c.kind === 'fen_steer').length;
  if (!f.mino) {
    f.waveT -= dt;
    if (f.pause) {
      if (f.waveT <= 0) {
        f.pause = false; f.wave++; f.waveT = 32;
        spawnWave(g, P_, f.wave);
        api.banner(g, `WAVE ${f.wave} OF ${WAVES}`, f.wave === 1 ? 'SUICIDE STEERS. KEEP THEM APART.' : f.wave === WAVES ? 'THE LAST OF THE HERD' : 'MORE OF THEM', 2.4);
        api.sound(g, 'moo');
      }
    } else if (!steers || f.waveT <= 0) {
      if (f.wave >= WAVES) {
        if (!steers) {
          f.mino = true;
          const m = P_.addCritter(g, 'fen_mino', b.x + (g.rng() < 0.5 ? 150 : -150), b.y - 90);
          m.hp = MINO.hp * (1 + 4 * 0.28) * (1 + 0.6 * (g.ng || 0)); m.maxhp = m.hp;
          api.banner(g, 'THE MINOTAUR', 'FOUR HEROES TALL. HE DOES NOT LIKE YOU.', 4);
          api.sound(g, 'minoroar');
        }
      } else { f.pause = true; f.waveT = 3; }
    }
  } else if (f.minoDown && !f.done) {
    f.done = true;
    api.addScore(g, Math.round(5000 * g.mult));
    api.scene(g, 'mino', f.minoDown.x, f.minoDown.y);
  }
}

function hud(g) {
  const f = g.fen;
  if (!f) return '';
  if (f.mino) {
    const m = g.critters.find(c => c.kind === 'fen_mino' && !c.dead);
    return m ? `MINOTAUR ${Math.ceil(100 * m.hp / m.maxhp)}%` : 'THE SWAMP TAKES HIM';
  }
  return f.pause && f.wave === 0 ? 'SOMETHING IS COMING' : `WAVE ${Math.max(1, f.wave)}/${WAVES}`;
}

// ---------------------------------------------------------------------------------------------- art: the fen

const LAND = ['#171d11', '#1e2714', '#263119', '#2f3b1e'], WATER = ['#12303a', '#163842', '#1b414c', '#224c58'];
const REED = ['#2a3a1a', '#3a4e22', '#52682c'], PAD = ['#1e3a1a', '#2e5224', '#3e6a2e'];
// one tile of it, drawn so its edges meet: everything near an edge is painted round onto the other side too
function ground(ctx, m, h) {
  const M = m.marsh, { hash } = h;
  h.minoSprite = () => minoSprite(h, 2, 'walk', 0); h.minoPad = MS - FOOT.y - 2;
  const wetAt = (x, y) => M.a[wrap(Math.floor(y / CS), M.rows) * M.cols + wrap(Math.floor(x / CS), M.cols)] === 1;
  const put = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(wrap(x, m.w), wrap(y, m.h), 1, 1); };
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const n = vnp(x / 8, y / 8, m.w / 8, m.h / 8, m.seed) * 0.6 + hash(x, y) * 0.4;
    // soften the cell edges: a pixel near a cell of the other kind takes it now and then
    let w = wetAt(x, y);
    if (hash(x * 3, y) < 0.3) w = wetAt(x + (hash(x, y * 5) < 0.5 ? -2 : 2), y + (hash(y, x) < 0.5 ? -2 : 2));
    ctx.fillStyle = w ? WATER[Math.min(3, Math.floor(n * 4))] : LAND[Math.min(3, Math.floor(n * 4))];
    ctx.fillRect(x, y, 1, 1);
  }
  // lily pads on the water, reeds and sedge along the banks, bog cotton on the land
  for (let i = 0; i < m.w * m.h / 60; i++) {
    const x = Math.floor(hash(i, 3) * m.w), y = Math.floor(hash(i, 7) * m.h);
    const wet = wetAt(x, y), t = hash(i, 11);
    if (wet && t < 0.25) {
      const R = 1 + Math.floor(hash(i, 13) * 2);
      for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) if (xx * xx + yy * yy <= R * R + 1 && !(xx === 0 && yy < 0)) put(x + xx, y + yy, PAD[(xx + yy + 2) > R ? 2 : 1]);
      if (hash(i, 17) < 0.15) put(x, y, '#d8c0e0');
    } else if (!wet && t < 0.5) {
      const L = 2 + Math.floor(hash(i, 19) * 4);
      for (let k = 0; k < L; k++) put(x + (k > 2 ? (hash(i, k) < 0.5 ? -1 : 1) : 0), y - k, REED[k === L - 1 ? 2 : k % 2]);
      if (hash(i, 23) < 0.2) { put(x, y - L, '#3a2a1a'); put(x, y - L + 1, '#3a2a1a'); }
    } else if (!wet && t < 0.56) put(x, y, '#9aa08a');
  }
}

// craters under everything: brown mud with swamp water in the middle
function under(ctx, g, h) {
  for (const k of g.craters) {
    const R = Math.round(k.r), fill = Math.min(1, k.t / 2);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y * 1.3) / R + (h.hash(x + k.seed, y) - 0.5) * 0.25;
      if (d > 1) continue;
      ctx.fillStyle = d > 0.8 ? '#3a2a1a' : d > 0.6 * fill + 0.1 ? '#2a1e12' : (x + y + Math.floor(g.t * 2)) % 7 ? '#1a3032' : '#2a4a4a';
      ctx.fillRect(Math.round(k.x) + x, Math.round(k.y) + y, 1, 1);
    }
  }
}

// it is dark here: only a pool of dim light around the boss, and will-o'-the-wisps
function over(ctx, g, h) {
  const V = h.VIEW, b = g.boss, cx = b.x, cy = b.y;
  const grd = ctx.createRadialGradient(cx, cy, 30, cx, cy, 170);
  grd.addColorStop(0, 'rgba(4,6,12,0)'); grd.addColorStop(0.5, 'rgba(4,6,12,0.45)'); grd.addColorStop(1, 'rgba(4,6,12,0.78)');
  ctx.fillStyle = grd; ctx.fillRect(V.x, V.y, h.W, h.H);
  for (let i = 0; i < 7; i++) {
    const x = V.x + ((h.hash(i, 1) * h.W + Math.sin(g.t * 0.4 + i) * 30) % h.W + h.W) % h.W, y = V.y + 20 + h.hash(i, 2) * (h.H - 40) + Math.cos(g.t * 0.6 + i * 2) * 10;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(g.t * 3 + i); ctx.fillStyle = '#a8ffd8'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.globalAlpha *= 0.4; ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
  }
  ctx.globalAlpha = 1;
}

// the steers: the farm's cows, black and white
function drawSteer(ctx, c, g, h) {
  if (c.dance) { drawDancer(ctx, c, g, h); return; }
  drawCow(ctx, { ...c, seed: 0 }, g, h);
}
// A steer up dancing, Far Side style: the steer's own sprite stood on end (back to the left, belly to the front), the
// head kept level in profile on top, standing on its hind legs with a hint of udder between them and the tail hanging
// behind; the near foreleg is flung up over its horns, the far one held straight out in front (to take its partner's
// hoof; two partners face each other and their hooves meet). Same colours as a Suicide Steer. Facing right; the
// anchor (the steer's x) is column 4, its feet on the bottom row.
const DANCE = [
  ['....ll.....',
   '...B.......',
   '..B.h.h....',
   '..BHHHH....',
   '..BHeHnn...',
   '..BDHHnn...',
   '..LWBBD....',
   '..LWBBDDDDl',
   '..LBBBBD...',
   '..LBBWWBD..',
   '..LBBWWBD..',
   '..LBBBBD...',
   '.tLWWBBD...',
   '.tLWBBD....',
   't..lnnl....',
   '...ll.ll...'],
  ['.....ll....',
   '....B......',
   '..BBh.h....',
   '..BHHHH....',
   '..BHeHnn...',
   '..BDHHnn...',
   '..LWBBD....',
   '..LWBBDDDDl',
   '..LBBBBD...',
   '..LBBWWBD..',
   '..LBBWWBD..',
   '..LBBBBD...',
   '.tLWWBBD...',
   't.LWBBD....',
   't..lnn.l...',
   '...ll...ll.'],
];
function drawDancer(ctx, c, g, h) {
  const t = c.dance.t, fr = Math.floor(t * 4) % 2, x = Math.round(c.x), y = Math.round(c.y);
  const partner = c.dance.partner != null && g.critters.find(o => o.id === c.dance.partner && !o.dead);
  const flip = c.fx < 0, rows = DANCE[fr];
  const spr = mapSprite(h, 'fen-dance' + fr, rows, COW_PAL2, flip);
  const sway = partner ? 0 : fr ? 1 : -1, bob = Math.floor(t * 8) % 2;
  const X = x - (flip ? spr.width - 6 : 5) + sway, Y = y - spr.height + 2 - bob;   // (the sprite has a 1px ink ring)
  ctx.fillStyle = 'rgba(8,10,6,.35)'; ctx.fillRect(x - 2, y + 1, 5, 1);
  ctx.drawImage(spr, X, Y);
  if (c.hitT > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(h.tinted(spr, '#ffffff'), X, Y); ctx.globalAlpha = 1; }
}

// ---------------------------------------------------------------------------------------------- art: the Minotaur

// He is built, not drawn: limbs, body, head and horns are rounded strokes between points in 3D (gx, gy along the
// ground, z up), seen from the game's three-quarter view (the ground squashed to half height), painted far to near,
// then outlined. That gives him all 8 facings, a 4-frame walk and a 4-frame axe swing from one description.
// dir: 0 east, 2 south (toward you), 4 west, 6 north. pose 'walk' (frame 0 is standing) or 'atk'.
const MP = { fur: ['#3e2616', '#5a3a24', '#74503a'], skin: ['#6a4228', '#8a5a3a', '#a8744e'], cloth: ['#2a1a10', '#4a2c18', '#66402a'],
  horn: ['#a89878', '#e8dcc0', '#fff4dc'], hoof: ['#0e0a06', '#1a120c', '#2a1e14'], wood: ['#5a3a1e', '#8e6436', '#b8884a'],
  iron: ['#4a5060', '#6a7080', '#aeb4c0'], eye: '#ff3a1a', nose: '#c88a7a' };
const MS = 44, FOOT = { x: 22, y: 38 };   // sprite size, and where his feet are in it
const STRIDE = [0, 1, 0, -1];
const SWING = [-2.4, -3.0, 1.35, 0.55];   // the axe arm's angle through the swing: back, over the top, down, through
function minoSprite(h, dir, pose, frame) {
  return h.sprite(`fen-mino|${dir}|${pose}|${frame}`, MS, MS, c => paintMino(c, dir, pose, frame));
}
function paintMino(c, dir, pose, frame) {
  const a = dir * Math.PI / 4, fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;   // forward, and his right hand
  const bob = pose === 'walk' && frame % 2 ? -0.6 : 0;
  // a point: f forward, r to his right, z up
  const pt = (f, r, z) => ({ gx: fx * f + rx * r, gy: fy * f + ry * r, z });
  const prims = [];
  const seg = (p, q, rad, pal, extra = {}) => prims.push({ p, q, rad, pal, ...extra });
  const dot = (p, rad, col) => prims.push({ p, q: p, rad, pal: [col, col, col], flat: true });
  const s = pose === 'walk' ? STRIDE[frame] * 2.6 : pose === 'atk' ? [0, 0.8, 1.6, 1.2][frame] : 0;
  // legs and hooves (he steps into the swing)
  for (const side of [-1, 1]) {
    const st = pose === 'atk' ? (side > 0 ? -s * 0.5 : s) : side * s, hip = pt(0, side * 2.1, 9 + bob), knee = pt(st * 0.6 + 0.6, side * 2.2, 4.6), foot = pt(st, side * 2.1, 0.8);
    seg(hip, knee, 1.5, MP.fur); seg(knee, foot, 1.3, MP.fur); seg(foot, pt(st + 0.6, side * 2.1, 0.4), 1.1, MP.hoof);
  }
  // the loincloth, the body (broad across, shallow front to back) and the shoulders
  const lean = pose === 'atk' ? [-0.4, -0.6, 1.4, 1.0][frame] : pose === 'walk' && frame % 2 ? 0.3 : 0;
  seg(pt(0.3, 0, 10.4 + bob), pt(0.9, 0, 6.6 + bob), 2.7, MP.cloth);
  for (const side of [-1, 1]) seg(pt(0, side * 1.8, 10 + bob), pt(lean, side * 2.2, 16.4 + bob), 2.5, MP.fur);
  seg(pt(lean, -3.6, 16.6 + bob), pt(lean, 3.6, 16.6 + bob), 1.7, MP.fur);
  // the left arm swings as he walks; the right one carries the axe, upright, or swings it
  const arm = (side, hand, elbow) => { const sh = pt(lean, side * 4.2, 16.2 + bob); seg(sh, elbow, 1.4, MP.skin); seg(elbow, hand, 1.3, MP.skin); dot(hand, 1.2, MP.skin[0]); };
  const lw = pose === 'walk' ? -STRIDE[frame] * 1.6 : pose === 'atk' ? -0.8 : 0;
  arm(-1, pt(lw + 0.4, -4.8, 9.5 + bob), pt(lw * 0.5, -5, 12.8 + bob));
  let hand, haft;   // the axe's haft runs from the hand out along (haft) for 10 px; the head sits at its far end
  if (pose === 'atk') {
    const th = SWING[frame], sh = { f: lean, z: 16.2 + bob }, L = 6.5, df = Math.sin(th), dz = -Math.cos(th);
    hand = pt(sh.f + df * L, 4.4, sh.z + dz * L);
    haft = { f: df, r: -0.15, z: dz };
    arm(1, hand, pt(sh.f + df * L * 0.5 + 0.4, 5.0, sh.z + dz * L * 0.5 - 0.6));
  } else {
    hand = pt(1.4 + (pose === 'walk' ? STRIDE[frame] * 0.6 : 0), 5, 10.5 + bob);
    haft = { f: 0.25, r: 0.05, z: 1 };
    arm(1, hand, pt(0.6, 5.2, 13 + bob));
  }
  const hl = Math.hypot(haft.f, haft.r, haft.z), H = { f: haft.f / hl, r: haft.r / hl, z: haft.z / hl };
  const along = k => ({ gx: hand.gx + (fx * H.f + rx * H.r) * k, gy: hand.gy + (fy * H.f + ry * H.r) * k, z: hand.z + H.z * k });
  seg(along(-2), along(13), 0.85, MP.wood);
  // the blade: a broad crescent off the far end of the haft, on the side facing forward of the swing
  const tip = along(12.5), bl = { gx: fx * H.z, gy: fy * H.z, z: -H.f };   // square to the haft, in his forward plane, edge leading
  const bn = Math.hypot(bl.gx, bl.gy, bl.z) || 1, B = k => ({ gx: tip.gx + bl.gx / bn * k, gy: tip.gy + bl.gy / bn * k, z: tip.z + bl.z / bn * k });
  seg(along(10), along(13.6), 1.1, MP.iron);
  seg(B(0.4), B(4.4), 2.2, MP.iron, { blade: true }); seg(B(-1.8), B(0), 1.2, MP.iron);
  // the head: a bull's, long in the face, low between the shoulders; eyes, a pale muzzle, and the horns
  const hz = 19.6 + bob + (pose === 'atk' && frame === 2 ? -0.6 : 0), hf = lean + 0.8;
  seg(pt(hf - 0.8, 0, hz + 0.4), pt(hf + 1.8, 0, hz - 0.6), 2.3, MP.fur);
  seg(pt(hf + 1.9, 0, hz - 0.9), pt(hf + 3.1, 0, hz - 1.4), 1.4, [MP.nose, MP.nose, '#e0a898'], { muzzle: true });
  for (const side of [-1, 1]) {
    dot(pt(hf + 1.9, side * 1.15, hz + 0.3), 0.55, MP.eye);
    const root = pt(hf - 0.2, side * 1.7, hz + 1.6), out = pt(hf - 0.2, side * 4.4, hz + 2.4), up = pt(hf + 0.6, side * 5.2, hz + 5.2);
    seg(root, out, 0.85, MP.horn); seg(out, up, 0.7, MP.horn);
    seg(pt(hf - 0.6, side * 2.3, hz + 0.6), pt(hf - 0.9, side * 2.9, hz - 0.2), 0.7, MP.fur);   // an ear
  }
  // far to near (down the screen is nearer), low before high where it's level
  const P2 = p => ({ x: FOOT.x + p.gx, y: FOOT.y + p.gy * 0.5 - p.z });
  for (const q of prims) q.k = (q.p.gy + q.q.gy) / 2 + (q.p.z + q.q.z) * 0.004;
  prims.sort((u, v) => u.k - v.k);
  const cx = c;
  for (const q of prims) {
    const A = P2(q.p), Bq = P2(q.q), n = Math.max(1, Math.ceil(Math.hypot(Bq.x - A.x, Bq.y - A.y) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = A.x + (Bq.x - A.x) * t, y = A.y + (Bq.y - A.y) * t, r = q.rad;
      if (q.flat) { disc(cx, x, y, r, q.pal[1]); continue; }
      disc(cx, x + 0.35, y + 0.35, r, q.pal[0]);            // the shaded side, down and to the right
      disc(cx, x - 0.25, y - 0.25, r * 0.72, q.pal[1]);      // the body of it
      if (r > 1) disc(cx, x - 0.6, y - 0.6, r * 0.32, q.pal[2]);   // and a highlight
    }
  }
  // an outline round the whole of him
  const d = c.getImageData(0, 0, MS, MS), px = d.data, solid = (x, y) => x >= 0 && y >= 0 && x < MS && y < MS && px[(y * MS + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
  c.fillStyle = INK;
  for (const [x, y] of edge) c.fillRect(x, y, 1, 1);
}
function disc(c, x, y, r, col) {
  c.fillStyle = col;
  const R = Math.max(0.5, r), x0 = Math.floor(x - R), x1 = Math.ceil(x + R), y0 = Math.floor(y - R), y1 = Math.ceil(y + R);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= R * R + 0.15) c.fillRect(xx, yy, 1, 1);
}
// which of his sprites to show now
function minoFrame(c) {
  const m = c.mino || {}, dir = wrap(Math.round((c.face ?? (c.fx < 0 ? Math.PI : 0)) / (Math.PI / 4)), 8);
  if (m.atk != null) return { dir, pose: 'atk', frame: Math.min(3, Math.floor(m.atk / MINO.atk * 4)) };
  if (m.state === 'roar') return { dir, pose: 'atk', frame: 1 };
  if (c.moving) return { dir, pose: 'walk', frame: Math.floor(c.walk / (m.state === 'charge' ? 2 : 2.6)) % 4 };
  return { dir, pose: 'walk', frame: 0 };
}
function drawMino(ctx, c, g, h) {
  const m = c.mino || {}, f = minoFrame(c), spr = minoSprite(h, f.dir, f.pose, f.frame);
  const x = Math.round(c.x) - FOOT.x, y = Math.round(c.y) - FOOT.y;
  ctx.globalAlpha = 0.4; ctx.fillStyle = '#05080a'; ctx.fillRect(Math.round(c.x) - 6, Math.round(c.y) - 1, 13, 3); ctx.globalAlpha = 1;
  const lean = m.state === 'wind' ? (Math.floor(g.t * 12) % 2) : 0;
  ctx.drawImage(spr, x + lean, y + (m.state === 'wind' ? 1 : 0));
  if (m.state === 'roar' || m.state === 'wind') { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(g.t * 20); ctx.drawImage(h.tinted(spr, '#ff3a1a'), x + lean, y + (m.state === 'wind' ? 1 : 0)); ctx.globalAlpha = 1; }
  if (c.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), x + lean, y); ctx.globalAlpha = 1; }
  // his health, over his head
  const w = 24, bx = Math.round(c.x) - w / 2, by = Math.round(c.y) - 34;
  ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
  ctx.fillStyle = '#e8402a'; ctx.fillRect(bx, by, Math.max(1, Math.round(w * c.hp / c.maxhp)), 2);
}
// (the cutscene and the tests draw him from here: one sprite, any facing and pose)
export function minoStill(h, dir = 2, pose = 'walk', frame = 0) { return minoSprite(h, dir, pose, frame); }
export { MS as MINO_SIZE, FOOT as MINO_FOOT };

export default {
  thoughts: ['SQUELCH', 'WET FEET', 'WHY IS IT MOOING', 'SO MUCH MUD', 'BOG. BOG EVERYWHERE', 'SMELLS LIKE COW', 'REEDS IN MY FUR',
    'WHERE DID THE ROCKS GO', 'IS THAT FOG OR ME', 'MOO?', 'DO NOT HUG THE COWS', 'THAT COW IS TICKING', 'A FROG JUDGED ME', 'DEEPER THAN IT LOOKS',
    'NOBODY ELSE HERE', 'TOO QUIET', 'SOMETHING HAS HORNS', 'BIGGER HORNS THAN MINE', 'UDDERLY WRONG', 'MARSH GAS. NOT ME', 'FEN IN MY TOES',
    'WHO FARMS A BOG', 'HOOFPRINTS. BIG ONES', 'STOP EXPLODING, COWS', 'MUD UP TO MY KNEES'],
  n: 5, id: 'fen', name: 'THE UDDERLY SECRET LEVEL', sub: 'SOMETHING IS MOOING IN THE DARK', mode: 'timed', noHeroes: true, secret: true,
  critters,
  build(g, rng) { return build(g, rng); },
  update, hud, bossSlow,
  art: { ground, under, over, critters: { fen_steer: drawSteer, fen_mino: drawMino }, canopy: false, theme: { leash: false } },
};
