// The secret level, "the Udderly Secret Level": a dark fen the evil cow on the City Wall drops the boss into (see
// wall.js and world.js SCENE). No heroes come here. Suicide Steers wade in from the dark in waves, a few more each time;
// kill one and it goes off like a bomb, hurting the boss and every steer near it, so a herd that bunches up blows itself
// apart in a chain. Every blast leaves a mud crater that fills with swamp water. Shallow water and craters slow the boss
// down. Survive ten waves and the Minotaur comes: four heroes tall, ten heroes' worth of health, a stun charge and a
// roar that slows the boss's turning and walking. When he falls the swamp takes him (the 'mino' cutscene) and the boss
// drops into the city, level 6. Necromancers have nothing to raise here: nothing leaves a body.
//
// The fen is procedural: one noise field (MARSH, a grid of 4 px cells) decides shallow water against land, about 40/60,
// and the sim and the art read the same grid.

import { drawCow, COW, COW_PAL2, mapSprite, INK } from './farms.js';
import * as P_ from '../props.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const MW = 720, MH = 440, CS = 4;
export const WAVES = 10;
const WADE = 0.6, MUD = 0.55;         // how fast the boss goes in shallow water, and in a crater
const BOOM = { r: 20, boss: 110, fuse: 0.12, crater: 7 };
const STEER = { hp: 50, spd: 9, spdWave: 0.7, near: 4 };
const MINO = { hp: 10 * 110, r: 6, spd: 17, swing: 70, swingT: 1.3, reach: 6, charge: { every: 7, wind: 0.8, spd: 125, time: 0.9, dmg: 220, stun: 1.5, min: 34, max: 140 }, roar: { every: 11, wind: 0.6, range: 120, slow: 4 } };

// ---------------------------------------------------------------------------------------------- the herd

let API = null;   // the world's level api, kept from the last update so a dying steer can go off

export const critters = {
  fen_steer: { r: 3.5, hp: STEER.hp, spd: 0, flee: 0, fear: 0, noCorpse: true, trample: true, bits: 'blood', cry: 'moo', value: { pts: 120, venge: 0.08, chaos: 0 },
    ai: steerAi, onDie: (g, c) => g.fen.booms.push({ x: c.x, y: c.y, t: BOOM.fuse }) },
  fen_mino: { r: MINO.r, hp: MINO.hp, spd: 0, flee: 0, fear: 0, noCorpse: true, trample: false, bits: 'blood', cry: 'minohurt', value: { pts: 8000, venge: 1, chaos: 0 },
    ai: minoAi, onDie: (g, c) => { g.fen.minoDown = { x: c.x, y: c.y }; } },
};

// a steer plods at the boss; close enough, it goes off on its own
function steerAi(g, c, dt) {
  const b = g.boss, dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1;
  const sp = (STEER.spd + STEER.spdWave * (g.fen?.wave || 1)) * (shallowAt(g, c.x, c.y) ? 0.7 : 1);
  c.x += (dx / d + Math.sin(g.t * 1.3 + c.seed) * 0.35) * sp * dt; c.y += (dy / d + Math.cos(g.t * 1.1 + c.seed) * 0.35) * sp * dt;
  c.walk += sp * dt * 0.5; c.moving = true; c.fx = dx > 0 ? 1 : -1;
  c.hot = d < 26;
  if (d < b.r + c.r + STEER.near && !b.dead && !g.scene) API?.hurtCritter?.(g, c, 1e6);
  // they keep a little apart from each other, but not much
  for (const o of g.critters) if (o !== c && !o.dead && o.kind === 'fen_steer') { const ex = c.x - o.x, ey = c.y - o.y, e = Math.hypot(ex, ey); if (e < 6 && e > 0.01) { c.x += ex / e * (6 - e) * 0.5; c.y += ey / e * (6 - e) * 0.5; } }
  c.x = clamp(c.x, 4, MW - 4); c.y = clamp(c.y, 14, MH - 6);
}

// the Minotaur: walks you down and swings, now and then lowers his horns and charges, now and then roars
function minoAi(g, c, dt) {
  const b = g.boss, m = c.mino ||= { state: 'enter', t: 0, chargeT: 4, roarT: 8, swingT: 1 };
  const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy) || 1;
  m.t += dt; m.chargeT -= dt; m.roarT -= dt; m.swingT -= dt;
  c.moving = false;
  const walk = (tx, ty, sp) => {
    const ex = tx - c.x, ey = ty - c.y, e = Math.hypot(ex, ey) || 1, s = Math.min(e, sp * dt * (shallowAt(g, c.x, c.y) ? 0.75 : 1));
    c.x += ex / e * s; c.y += ey / e * s; c.walk += s * 0.4; c.moving = s > 0.01; if (Math.abs(ex) > 0.3) c.fx = ex > 0 ? 1 : -1;
  };
  if (b.dead || g.scene) return;
  switch (m.state) {
    case 'enter':
      walk(b.x, b.y, MINO.spd * 1.3);
      if (d < 90 || m.t > 6) { m.state = 'chase'; API?.sound(g, 'minoroar'); }
      break;
    case 'chase':
      if (m.roarT <= 0 && d < MINO.roar.range) { m.state = 'roar'; m.t = 0; API?.text(g, c.x, c.y - 30, 'RAAAAWR', 'red', 1.2); break; }
      if (m.chargeT <= 0 && d > MINO.charge.min && d < MINO.charge.max) { m.state = 'wind'; m.t = 0; m.dir = Math.atan2(dy, dx); break; }
      if (d > b.r + c.r + MINO.reach - 1) walk(b.x, b.y, MINO.spd);
      else { c.fx = dx > 0 ? 1 : -1; if (m.swingT <= 0) { m.swingT = MINO.swingT; m.swing = 0.25; API?.hurtBoss(g, MINO.swing * ngK(g)); API?.sound(g, 'bite'); } }
      break;
    case 'wind':
      // he paws the ground and lowers his horns: a beat to get out of the way
      c.fx = Math.cos(m.dir) > 0 ? 1 : -1;
      if (Math.floor(m.t * 10) % 3 === 0) API?.part(g, c.x - c.fx * 4, c.y, -c.fx * 20, -8, 0.3, 'dust');
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
      if (m.t >= MINO.charge.time || c.x < 8 || c.y < 18 || c.x > MW - 8 || c.y > MH - 8) { m.state = 'chase'; m.chargeT = MINO.charge.every * (0.8 + g.rng() * 0.4); }
      break;
    }
    case 'roar':
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
  m.swing = Math.max(0, (m.swing || 0) - dt);
  // he is solid to the boss
  const e = Math.hypot(c.x - b.x, c.y - b.y), min = b.r + c.r;
  if (e < min && e > 0.01 && m.state !== 'charge') { c.x = b.x + (c.x - b.x) / e * min; c.y = b.y + (c.y - b.y) / e * min; }
  c.x = clamp(c.x, 6, MW - 6); c.y = clamp(c.y, 18, MH - 6);
}
const ngK = g => 1 + 0.4 * (g.ng || 0);

// ---------------------------------------------------------------------------------------------- the map

// value noise, same in the sim and the art
const hs = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = t => t * t * (3 - 2 * t);
  const a = hs(xi, yi), b = hs(xi + 1, yi), c = hs(xi, yi + 1), d = hs(xi + 1, yi + 1), u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function build(g, rng) {
  const cols = MW / CS, rows = MH / CS, a = new Uint8Array(cols * rows), seed = Math.floor(rng() * 1000);
  const start = { x: MW / 2, y: MH / 2, face: -Math.PI / 2 };
  const vals = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c + seed, y = r + seed * 2;
    vals[r * cols + c] = vn(x / 14, y / 14) * 0.6 + vn(x / 5 + 50, y / 5) * 0.3 + vn(x / 2, y / 2 + 9) * 0.1;
  }
  // the threshold that makes it about 40% water
  const sorted = Array.from(vals).sort((p, q) => p - q), cut = sorted[Math.floor(sorted.length * 0.6)];
  for (let i = 0; i < a.length; i++) a[i] = vals[i] > cut ? 1 : 0;
  // dry land where the boss lands
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (Math.hypot(c * CS - start.x, r * CS - start.y) < 26) a[r * cols + c] = 0;
  g.fen = { wave: 0, waveT: 4, pause: true, booms: [], minoDown: null, mino: false, done: false };
  g.craters = [];
  return { w: MW, h: MH, scroll: 'xy', start, marsh: { cols, rows, a }, seed };
}
function shallowAt(g, x, y) {
  const M = g.map.marsh;
  if (!M) return false;
  const c = Math.floor(x / CS), r = Math.floor(y / CS);
  return c >= 0 && r >= 0 && c < M.cols && r < M.rows && M.a[r * M.cols + c] === 1;
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
    const x = clamp(b.x + Math.cos(a) * r, 6, MW - 6), y = clamp(b.y + Math.sin(a) * r * 0.75, 18, MH - 8);
    P.addCritter(g, 'fen_steer', x, y);
  }
}

function update(g, dt, api) {
  API = api;
  const f = g.fen, b = g.boss;
  if (!f || g.scene) return;
  // the bombs: each blast hurts the boss if it is close, sets off every steer in reach, and leaves a crater
  if (f.booms.length) {
    for (const k of f.booms) k.t -= dt;
    const now = f.booms.filter(k => k.t <= 0);
    f.booms = f.booms.filter(k => k.t > 0);
    for (const k of now) {
      g.shake = Math.max(g.shake, 0.3);
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
          const m = P_.addCritter(g, 'fen_mino', clamp(b.x + (b.x < MW / 2 ? 150 : -150), 20, MW - 20), clamp(b.y - 90, 24, MH - 20));
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

// ---------------------------------------------------------------------------------------------- art

const LAND = ['#171d11', '#1e2714', '#263119', '#2f3b1e'], WATER = ['#12303a', '#163842', '#1b414c', '#224c58'];
const REED = ['#2a3a1a', '#3a4e22', '#52682c'], PAD = ['#1e3a1a', '#2e5224', '#3e6a2e'];
function ground(ctx, m, h) {
  const M = m.marsh, { hash } = h;
  h.minoSprite = () => minoSprite(h, 0);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = Math.floor(x / CS), r = Math.floor(y / CS), wet = M.a[r * M.cols + c] === 1;
    const n = vn(x / 9 + m.seed, y / 9) * 0.6 + hash(x, y) * 0.4;
    // soften the cell edges: a pixel near a cell of the other kind takes it now and then
    let w = wet;
    if (hash(x * 3, y) < 0.3) { const c2 = Math.floor((x + (hash(x, y * 5) < 0.5 ? -2 : 2)) / CS), r2 = Math.floor((y + (hash(y, x) < 0.5 ? -2 : 2)) / CS); if (c2 >= 0 && r2 >= 0 && c2 < M.cols && r2 < M.rows) w = M.a[r2 * M.cols + c2] === 1; }
    ctx.fillStyle = w ? WATER[Math.min(3, Math.floor(n * 4))] : LAND[Math.min(3, Math.floor(n * 4))];
    ctx.fillRect(x, y, 1, 1);
  }
  // lily pads on the water, reeds and sedge along the banks, bog cotton on the land
  for (let i = 0; i < m.w * m.h / 60; i++) {
    const x = Math.floor(hash(i, 3) * m.w), y = Math.floor(hash(i, 7) * m.h), c = Math.floor(x / CS), r = Math.floor(y / CS);
    const wet = M.a[r * M.cols + c] === 1, t = hash(i, 11);
    if (wet && t < 0.25) {
      const R = 1 + Math.floor(hash(i, 13) * 2);
      for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) if (xx * xx + yy * yy <= R * R + 1 && !(xx === 0 && yy < 0)) { ctx.fillStyle = PAD[(xx + yy + 2) > R ? 2 : 1]; ctx.fillRect(x + xx, y + yy, 1, 1); }
      if (hash(i, 17) < 0.15) { ctx.fillStyle = '#d8c0e0'; ctx.fillRect(x, y, 1, 1); }
    } else if (!wet && t < 0.5) {
      const L = 2 + Math.floor(hash(i, 19) * 4);
      for (let k = 0; k < L; k++) { ctx.fillStyle = REED[k === L - 1 ? 2 : k % 2]; ctx.fillRect(x + (k > 2 ? (hash(i, k) < 0.5 ? -1 : 1) : 0), y - k, 1, 1); }
      if (hash(i, 23) < 0.2) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x, y - L, 1, 2); }
    } else if (!wet && t < 0.56) { ctx.fillStyle = '#9aa08a'; ctx.fillRect(x, y, 1, 1); }
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

// the steers: the farm's cows, black and white, going red as they close in
function drawSteer(ctx, c, g, h) {
  drawCow(ctx, { ...c, seed: 0 }, g, h);
  if (c.hot && Math.floor(g.t * 8 + c.seed) % 2) {
    const spr = mapSprite(h, 'fm-cowb', COW[0], COW_PAL2, c.fx < 0);
    ctx.globalAlpha = 0.55; ctx.drawImage(h.tinted(spr, '#ff2a1a'), Math.round(c.x) - (spr.width >> 1), Math.round(c.y) - spr.height + 2); ctx.globalAlpha = 1;
  }
}

// the Minotaur: 24 px tall (four heroes), a bull's head and horns, a loincloth and an axe
const MINO_PAL = { H: '#e8dcc0', h: '#a89878', F: '#5a3a24', f: '#3e2616', D: '#2a1a10', e: '#ff3a1a', n: '#c88a7a', S: '#8a5a3a', s: '#6a4228', C: '#7a1a14', c: '#4a0e0a', A: '#aeb4c0', a: '#6a7080', W: '#5a3a1e', B: '#1a120c' };
const MINO_ROWS = [
  'H.........H.',
  'Hh.......hH.',
  '.Hh.FFF.hH..',
  '..hFFFFFh...',
  '...FeFeF....',
  '...FFFFF....',
  '...fFnnF....',
  '..SFFFFFS...',
  '.SSFFFFFSS..',
  'SSSFFFFFSSS.',
  'SS.FFFFF.SSA',
  'S..FFFFF..WA',
  's..fFFFf..WA',
  's..CCCCC..W.',
  '...CcCcC..W.',
  '...CCCCC..W.',
  '...ff.ff....',
  '...FF.FF....',
  '...FF.FF....',
  '...FF.FF....',
  '...ff.ff....',
  '..DDD.DDD...',
];
function minoSprite(h, frame, flip = false) {
  const rows = frame ? MINO_ROWS.map((r, i) => i >= 16 ? (i % 2 ? r.replace('FF.FF', 'F..FF') : r.replace('FF.FF', 'FF..F')) : r) : MINO_ROWS;
  return mapSprite(h, `fen-mino${frame}`, rows, MINO_PAL, flip);
}
function drawMino(ctx, c, g, h) {
  const m = c.mino || {}, fr = c.moving ? Math.floor(c.walk / 3) % 2 : 0;
  const spr = minoSprite(h, fr, c.fx < 0), x = Math.round(c.x) - (spr.width >> 1), y = Math.round(c.y) - spr.height + 2;
  ctx.globalAlpha = 0.4; ctx.fillStyle = '#05080a'; ctx.fillRect(Math.round(c.x) - 6, Math.round(c.y), 12, 2); ctx.globalAlpha = 1;
  const lean = m.state === 'wind' ? (Math.floor(g.t * 12) % 2) : m.state === 'charge' ? 2 * (c.fx || 1) : 0;
  ctx.drawImage(spr, x + lean, y + (m.state === 'wind' ? 2 : 0));
  if (m.state === 'roar' || m.state === 'wind') { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(g.t * 20); ctx.drawImage(h.tinted(spr, '#ff3a1a'), x + lean, y + (m.state === 'wind' ? 2 : 0)); ctx.globalAlpha = 1; }
  if (c.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), x + lean, y); ctx.globalAlpha = 1; }
  // his health, over his head
  const w = 24, bx = Math.round(c.x) - w / 2, by = y - 5;
  ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
  ctx.fillStyle = '#e8402a'; ctx.fillRect(bx, by, Math.max(1, Math.round(w * c.hp / c.maxhp)), 2);
}

export default {
  n: 5, id: 'fen', name: 'THE UDDERLY SECRET LEVEL', sub: 'SOMETHING IS MOOING IN THE DARK', mode: 'timed', noHeroes: true, secret: true,
  critters,
  build(g, rng) { return build(g, rng); },
  update, hud, bossSlow,
  art: { ground, under, over, critters: { fen_steer: drawSteer, fen_mino: drawMino }, canopy: false, theme: { leash: false } },
};
