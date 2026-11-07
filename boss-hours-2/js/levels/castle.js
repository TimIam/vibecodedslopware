// Level 7, the castle: the finale. A huge castle (curtain walls two blocks thick, round towers, a gatehouse, a keep with a
// donjon in the middle) behind a moat, in a world that scrolls only up and down. Every block of it has hit points and
// crumbles to rubble; towers topple over when they go, and crush whatever they land on. Bring 90% of it down and
// every hero left runs for it: the game is won.

import * as P from '../props.js';
import { INK, STONEP, ROOF_PAL, rubbleSprite, steerHeroes, shade, paintGround, fillZone, sideWall } from './city.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------------------------------------- the layout

const MW = 320, MH = 452;
const X0 = 40, Y0 = 64, C = 10, COLS = 24, ROWS = 28;          // the castle grid: 240 × 280 px of stone
const MOAT = { y0: 378, y1: 396 }, BRIDGE = { x0: 144, x1: 180 };
export const WIN_SHARE = 0.9;
// towers: top-left cell, size in cells, roof ('cone' or 'flat'), lift (how tall it stands)
const TOWERS = [
  { c: -1, r: -1, n: 3, roof: 'cone' }, { c: 22, r: -1, n: 3, roof: 'cone' }, { c: -1, r: 26, n: 3, roof: 'cone' }, { c: 22, r: 26, n: 3, roof: 'cone' },
  { c: -1, r: 12, n: 3, roof: 'flat' }, { c: 22, r: 12, n: 3, roof: 'flat' }, { c: 10, r: -1, n: 4, roof: 'flat' },
  { c: 8, r: 26, n: 3, roof: 'flat', banner: true }, { c: 13, r: 26, n: 3, roof: 'flat', banner: true },
  { c: 10, r: 6, n: 4, roof: 'cone', donjon: true },
];
const KEEP = { c0: 6, c1: 17, r0: 4, r1: 11 };
const GATE = { c: 11, r: 26, n: 2 };

// ---------------------------------------------------------------------------------------------- kinds

const BLOCK = { solid: true, rubble: 'castle_rubble', rubbleN: 1, w: C, h: C, onDown: blockDown };
export const kinds = {
  castle_wall: { ...BLOCK, hp: 170, value: { pts: 110, venge: 0.05, chaos: 1 } },
  castle_keep: { ...BLOCK, hp: 210, value: { pts: 140, venge: 0.06, chaos: 1 } },
  castle_tower: { ...BLOCK, w: 30, h: 30, hp: 1000, rubbleN: 4, value: { pts: 900, venge: 0.35, chaos: 4 }, onDown: towerDown },
  castle_gate: { ...BLOCK, w: 20, h: 20, hp: 520, flammable: true, burnTime: 10, crushShare: 0.6, value: { pts: 600, venge: 0.3, chaos: 2 } },
  castle_rubble: { r: 3, push: true, fill: 2, value: { pts: 0, venge: 0, chaos: 0 } },
};
const LIFT = { castle_wall: 7, castle_keep: 12, castle_gate: 7, castle_tower: 16 };

function blockDown(g, p) {
  (g.ruins ||= []).push({ x: p.x, y: p.y, w: p.w, h: p.h, seed: p.seed, castle: true });
  for (let i = 0; i < 6; i++) { const a = g.rng() * TAU; g.cs?.dust.push({ x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 4, vx: Math.cos(a) * 10, vy: Math.sin(a) * 6 - 4, t: 0, life: 0.8 + g.rng() * 0.6 }); }
}
// a tower doesn't just crumble: it falls over, away from whatever pushed it, and lands on things
function towerDown(g, p) {
  blockDown(g, p);
  const len = p.donjon ? 58 : 46;
  g.cs?.topples.push({ x: p.x, y: p.y, ang: p.fallA, len, t: 0, hit: false, seed: p.seed, roof: p.roof, donjon: p.donjon, r: p.w / 2 });
}

// ---------------------------------------------------------------------------------------------- build

function build(g, rng) {
  g.ruins = [];
  const cs = g.cs = { cell: new Array(COLS * ROWS + 200).fill(null), orig: new Uint8Array(COLS * ROWS), blocks: [], topples: [], falls: [], dust: [], won: false, crumbleT: 0, share: 0 };
  const key = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS ? r * COLS + c : -1;
  const taken = new Set();
  const block = (kind, c, r, n = 1, extra = {}) => {
    const w = C * n;
    const p = P.addProp(g, kind, X0 + c * C + w / 2, Y0 + r * C + w / 2, { w, h: w, castle: true, gc: c, gr: r, gn: n, ...extra });
    if (extra.hp) p.maxhp = extra.hp;
    cs.blocks.push(p);
    for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
      const k = key(Math.floor(c + dc), Math.floor(r + dr));
      if (k >= 0) { cs.cell[k] = p; cs.orig[k] = 1; taken.add(k); }
    }
    return p;
  };
  for (const t of TOWERS) block('castle_tower', t.c, t.r, t.n, { roof: t.roof, banner: !!t.banner, donjon: !!t.donjon, ...(t.donjon ? { hp: 1600 } : {}) });
  block('castle_gate', GATE.c, GATE.r, GATE.n);
  // the curtain wall, two blocks thick, and the keep
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const edge = r < 2 || r >= ROWS - 2 || c < 2 || c >= COLS - 2;
    const keep = c >= KEEP.c0 && c <= KEEP.c1 && r >= KEEP.r0 && r <= KEEP.r1;
    if ((!edge && !keep) || taken.has(key(c, r))) continue;
    block(keep ? 'castle_keep' : 'castle_wall', c, r);
  }
  cs.total = cs.blocks.reduce((s, p) => s + p.maxhp, 0);

  // the courtyard: a chapel, stables and barracks against the walls, a well, the training ground and a market
  const bld = (kind, x, y, w, h) => { const d = P.KINDS[kind], hp = Math.round(d.hp * Math.sqrt(w * h / (d.w * d.h))); const p = P.addProp(g, kind, x + w / 2, y + h / 2, { w, h, hp, maxhp: hp }); p.v = p.seed % 3; };
  bld('city_chapel', 206, 186, 42, 48);
  bld('city_shop', 62, 92, 30, 24); bld('city_shop', 62, 120, 30, 24);
  bld('city_pub', 228, 92, 30, 24);
  bld('city_house', 62, 256, 34, 24); bld('city_house', 62, 284, 34, 22);
  bld('city_inn', 216, 262, 40, 44);
  P.addProp(g, 'city_fountain', 116, 214);
  for (const [x, y] of [[80, 196], [80, 222], [148, 284], [176, 284], [176, 210]]) P.addProp(g, 'city_tent', x, y, { v: Math.floor(rng() * 4) });
  for (const [x, y] of [[100, 296], [130, 298], [196, 300], [150, 210], [190, 236]]) P.addProp(g, 'city_stall', x, y);
  for (const [x, y] of [[100, 250], [220, 250], [140, 320], [180, 320]]) P.addProp(g, 'city_lamp', x, y);
  // the road up to the drawbridge, with lamps
  for (const y of [408, 428]) { P.addProp(g, 'city_lamp', 136, y); P.addProp(g, 'city_lamp', 188, y); }
  for (let i = 0; i < 10; i++) P.addCritter(g, 'city_folk', 100 + rng() * 120, 200 + rng() * 110, { col: Math.floor(rng() * 6) });
  for (let i = 0; i < 6; i++) P.addCritter(g, 'city_folk', 30 + rng() * 260, 402 + rng() * 26, { col: Math.floor(rng() * 6) });

  const water = P.makeWater(MW, MH);
  P.setWater(water, 0, MOAT.y0, MW, MOAT.y1 - 1, 1);
  P.setWater(water, BRIDGE.x0, MOAT.y0, BRIDGE.x1 - 1, MOAT.y1 - 1, 2);
  g.water = water;
  const canals = [{ y0: MOAT.y0, y1: MOAT.y1, bridges: [BRIDGE], cross: [(BRIDGE.x0 + BRIDGE.x1) / 2] }];
  return { w: MW, h: MH, scroll: 'y', start: { x: 160, y: 420, face: -Math.PI / 2 }, canals };
}

// ---------------------------------------------------------------------------------------------- logic

export function castleShare(g) {
  const cs = g.cs;
  let down = 0;
  for (const p of cs.blocks) down += p.state === 'up' ? clamp(p.maxhp - p.hp, 0, p.maxhp) : p.maxhp;
  return down / cs.total;
}

// gaps in the curtain wall (where both blocks of its thickness are down), as points just outside and just inside
function openings(g) {
  const out = [], open = (c, r) => !standing(g, c, r);
  const runAlong = (n, isOpen, mk) => {
    let run = 0;
    for (let i = 0; i <= n; i++) {
      if (i < n && isOpen(i)) { run++; continue; }
      if (run) out.push({ ...mk(i - run / 2), hw: run * C / 2 });
      run = 0;
    }
  };
  const xs = i => X0 + i * C, ys = i => Y0 + i * C, R = Y0 + ROWS * C, Rx = X0 + COLS * C;
  runAlong(COLS, c => open(c, ROWS - 1) && open(c, ROWS - 2), m => ({ side: 2, ox: xs(m), oy: R + 20, ix: xs(m), iy: R - 2 * C - 5 }));
  runAlong(COLS, c => open(c, 0) && open(c, 1), m => ({ side: 0, ox: xs(m), oy: Y0 - 20, ix: xs(m), iy: Y0 + 2 * C + 5 }));
  runAlong(ROWS, r => open(0, r) && open(1, r), m => ({ side: 3, ox: X0 - 20, oy: ys(m), ix: X0 + 2 * C + 5, iy: ys(m) }));
  runAlong(ROWS, r => open(COLS - 1, r) && open(COLS - 2, r), m => ({ side: 1, ox: Rx + 20, oy: ys(m), ix: Rx - 2 * C - 5, iy: ys(m) }));
  return out;
}
// the walk around the outside of the walls: corners NE, SE, SW, NW (clockwise after side N, E, S, W)
const RING = [{ x: X0 + COLS * C + 21, y: Y0 - 22 }, { x: X0 + COLS * C + 21, y: Y0 + ROWS * C + 22 }, { x: X0 - 21, y: Y0 + ROWS * C + 22 }, { x: X0 - 21, y: Y0 - 22 }];
function sidesOf(x, y) {
  const s = [];
  if (y < Y0 - 3) s.push(0);
  if (x > X0 + COLS * C + 3) s.push(1);
  if (y > Y0 + ROWS * C + 3) s.push(2);
  if (x < X0 - 3) s.push(3);
  return s;
}
// Heroes don't pathfind. One on the wrong side of the curtain wall is walked round the outside to the nearest breach
// and through it (or, inside, to the breach and out).
function steerThroughWalls(g, dt) {
  const cs = g.cs, b = g.boss;
  if (!cs.openT || g.t - cs.openT > 0.5) { cs.openT = g.t; cs.open = openings(g); }
  if (!cs.open.length) return;
  const inside = (x, y) => x > X0 + 4 && x < X0 + COLS * C - 4 && y > Y0 + 4 && y < Y0 + ROWS * C - 4;
  for (const u of g.units) {
    if (u.dead || u.gone || u.role === 'rider' || u.stun > 0 || u.y > MOAT.y0 - 2) continue;
    const t = (u.state === 'flee' || u.state === 'leave') && u.exit ? u.exit : !u.party?.engaged && u.stage ? u.stage : b;
    const ui = inside(u.x, u.y);
    if (ui === inside(t.x, t.y)) continue;
    let best = null, bd = 1e9;
    for (const o of cs.open) {
      const d = ui ? Math.hypot(o.ix - u.x, o.iy - u.y) + Math.hypot(t.x - o.ox, t.y - o.oy) : Math.hypot(o.ox - u.x, o.oy - u.y) + Math.hypot(t.x - o.ix, t.y - o.iy);
      if (d < bd) { bd = d; best = o; }
    }
    const o = best;
    let tx, ty;
    if (ui) {
      const near = (o.side % 2 ? Math.abs(u.y - o.iy) : Math.abs(u.x - o.ix)) < o.hw - 2 && Math.hypot(o.ix - u.x, o.iy - u.y) < 12;
      tx = near ? o.ox : o.ix; ty = near ? o.oy : o.iy;
    } else {
      const sides = sidesOf(u.x, u.y);
      const corner = sides.length === 2 ? RING[sides.includes(3) && sides.includes(0) ? 3 : Math.min(...sides)] : null;
      const past = [u.y < Y0 - 13, u.x > X0 + COLS * C + 13, u.y > Y0 + ROWS * C + 13, u.x < X0 - 13][o.side];
      if (corner && sides.includes(o.side) && !past) { tx = corner.x; ty = corner.y; }
      else if (!sides.length || sides.includes(o.side)) {
        // on the right side: to the gap, then through it
        const near = (o.side % 2 ? Math.abs(u.y - o.oy) : Math.abs(u.x - o.ox)) < o.hw - 2 || !sides.length;
        tx = near ? o.ix : o.ox; ty = near ? o.iy : o.oy;
      } else {
        // round the corner, whichever way is shorter
        const s = sides[0], cw = (o.side - s + 4) % 4, k = cw <= 2 && !(cw === 2 && u.x + u.y * 0.01 < 160) ? s : (s + 3) % 4;
        tx = RING[k].x; ty = RING[k].y;
      }
    }
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(d / dt, 70); u.x += dx / d * sp * dt; u.y += dy / d * sp * dt;
  }
}

function update(g, dt, api) {
  const cs = g.cs;
  if (!cs) return;
  steerHeroes(g, dt, g.map.canals);
  steerThroughWalls(g, dt);
  // toppling towers: they lean, fall, and land a moment later on whatever is in the way
  for (const t of cs.topples) {
    t.t += dt;
    if (!t.hit && t.t >= 0.42) {
      t.hit = true;
      const ca = Math.cos(t.ang), sa = Math.sin(t.ang), done = new Set();
      g.shake = Math.max(g.shake, 0.55);
      api.sound(g, 'collapse');
      for (let s = t.r * 0.6; s <= t.len; s += 4) {
        const x = t.x + ca * s, y = t.y + sa * s;
        for (const q of P.near(g, x, y, 10)) {
          if (q.state !== 'up' || done.has(q) || !P.touches(q, x, y, 7)) continue;
          done.add(q);
          if (P.KINDS[q.kind].solid) P.hitProp(g, q, t.donjon ? 520 : 420, t.ang);
          else P.knockDown(g, q, t.ang);
        }
        for (const u of g.units) if (!u.dead && !u.gone && Math.hypot(u.x - x, u.y - y) < 9 && !done.has(u)) { done.add(u); api.hurtUnit(g, u, 180); }
        for (let i = 0; i < 2; i++) api.part(g, x + (g.rng() - 0.5) * 10, y + (g.rng() - 0.5) * 8, (g.rng() - 0.5) * 50, -10 - g.rng() * 30, 0.5 + g.rng() * 0.4, g.rng() < 0.6 ? 'dust' : 'splinter');
      }
      // what is left of it: a long heap you can shove into the moat
      for (let s = t.len * 0.35; s <= t.len; s += 9) P.addProp(g, 'castle_rubble', t.x + ca * s + (g.rng() - 0.5) * 6, t.y + sa * s + (g.rng() - 0.5) * 6);
      if (g.water && P.isWater(g, t.x + ca * t.len * 0.85, t.y + sa * t.len * 0.85)) P.fillWater(g, t.x + ca * t.len * 0.85, t.y + sa * t.len * 0.85, 3);
    }
  }
  for (const d of cs.dust) { d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.96; d.vy *= 0.96; }
  if (cs.dust.length > 60 || cs.dust.some(d => d.t > d.life)) cs.dust = cs.dust.filter(d => d.t < d.life).slice(-60);

  cs.share = castleShare(g);
  if (!cs.won && !g.boss.dead && cs.share >= WIN_SHARE) {
    cs.won = true;
    api.win(g);
  }
  // once it is won, what is still standing comes down by itself
  if (cs.won) {
    cs.crumbleT -= dt;
    if (cs.crumbleT <= 0) {
      cs.crumbleT = 0.09;
      const left = cs.blocks.filter(p => p.state === 'up');
      if (left.length) { const p = left[Math.floor(g.rng() * left.length)]; P.knockDown(g, p, g.rng() * TAU); }
    }
  }
}
const hud = g => `CASTLE ${Math.floor((g.cs?.share || 0) * 100)}% DOWN  ${Math.round(WIN_SHARE * 100)} WINS`;

// ---------------------------------------------------------------------------------------------- art

const MOSS = '#4f6a32', SLIT = '#0e0b08', LITW = '#e8b850';
const put = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const standing = (g, c, r) => { const p = c >= 0 && r >= 0 && c < COLS && r < ROWS ? g.cs.cell[r * COLS + c] : null; return p && p.state === 'up' ? p : null; };
const wasThere = (g, c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && g.cs.orig[r * COLS + c] === 1;

// edge state for one side of a block: 0 joined to a neighbour, 1 an outer edge (battlements), 2 broken (a neighbour fell)
function edges(g, p) {
  const c = p.gc, r = p.gr, out = [];
  for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const q = standing(g, c + dc, r + dr);
    out.push(q && q.kind !== 'castle_tower' ? 0 : wasThere(g, c + dc, r + dr) && !(q && q.kind === 'castle_tower') ? 2 : 1);
  }
  return out;
}

// a block of wall or keep: the walk on top, battlements on the open edges, the face below on the south side
function blockSprite(h, kind, mask, stage, v) {
  const L = LIFT[kind], keep = kind === 'castle_keep', gate = kind === 'castle_gate', W = gate ? 20 : C, D = gate ? 20 : C;
  return h.sprite(`cb|${kind}|${mask.join('')}|${stage}|${v}`, W, D + L, c => {
    const [eN, eE, eS, eW] = mask, seed = v * 31 + 7;
    // the top: flagstones on the walls, lead roof on the keep
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
      let col;
      if (keep) col = (x + y * 3 + v) % 7 === 0 ? '#3e4650' : (y % 4 === 0 ? '#454e58' : '#525c66');
      else { const row = Math.floor(y / 3), lx = (x + row * 2 + v) % 5; col = lx === 0 || y % 3 === 2 ? STONEP[1] : STONEP[2 + (h.hash(Math.floor((x + row * 2 + v) / 5) + seed, row) > 0.6 ? 1 : 0)]; }
      put(c, x, y, col);
    }
    // battlements on open edges, jagged broken edges where a neighbour fell
    const merlon = (x, y) => { put(c, x, y, STONEP[5]); };
    const side = (e, horiz, at, inward) => {
      if (e === 0) return;
      for (let i = 0; i < (horiz ? W : D); i++) {
        const x = horiz ? i : at, y = horiz ? at : i;
        if (e === 1) {
          const m = (i % 4) < 2;
          put(c, x, y, m ? STONEP[4] : INK);
          const x2 = horiz ? i : at + inward, y2 = horiz ? at + inward : i;
          put(c, x2, y2, m ? STONEP[5] : STONEP[1]);
        } else {
          put(c, x, y, h.hash(i + seed, at) > 0.5 ? INK : STONEP[1]);
          if (h.hash(at, i + seed) > 0.6) { const x2 = horiz ? i : at + inward, y2 = horiz ? at + inward : i; put(c, x2, y2, '#2a2620'); }
        }
      }
    };
    side(eN, true, 0, 1); side(eS, true, D - 1, -1); side(eW, false, 0, 1); side(eE, false, W - 1, -1);
    if (eN === 1) merlon(0, 0);
    // the face: big ashlar courses, lit a little from the left, a slit or a window now and then
    for (let y = D; y < D + L; y++) for (let x = 0; x < W; x++) {
      const yy = y - D, course = Math.floor(yy / 3), mortar = yy % 3 === 2 || (x + course * 4 + v) % 6 === 0;
      const l = 2 + (x < 2 ? 1 : 0) - (yy > L - 3 ? 1 : 0) + (yy === 0 ? 1 : 0);
      put(c, x, y, mortar ? STONEP[1] : STONEP[clamp(l + (h.hash(x + seed, course) > 0.8 ? 1 : 0), 0, 5)]);
    }
    rect(c, 0, D, W, 1, INK);
    if (gate) {
      // the gate itself: a pointed arch with the doors shut and the portcullis down
      rect(c, 3, D + 1, W - 6, L - 1, INK);
      for (let y = D + 2; y < D + L; y++) for (let x = 4; x < W - 4; x++) put(c, x, y, (x - 4) % 3 === 0 ? '#2a1a0e' : '#5a3a22');
      for (let x = 5; x < W - 4; x += 3) rect(c, x, D + 2, 1, L - 2, '#6b6c63');
    } else if (keep && v === 1) {
      rect(c, 4, D + 2, 2, 5, SLIT); put(c, 4, D + 3, LITW);
    } else if (!keep && v === 2) rect(c, 4, D + 2, 1, 3, SLIT);
    if (v === 0 && !keep) { put(c, 1, D + L - 2, MOSS); put(c, 2, D + L - 1, MOSS); }
    // damage
    if (stage >= 1) {
      // a crack or two down the face, chips out of the walk
      for (let i = 0; i < stage; i++) { let x = 1 + Math.floor(h.hash(i, seed + 3) * (W - 3)), y = D + 1 + Math.floor(h.hash(seed, i) * 2); for (let k = 0; k < L - 2; k++) { put(c, x, y + k, '#1c1814'); if (h.hash(k, i + seed) > 0.6) x += h.hash(i, k + seed) > 0.5 ? 1 : -1; } }
      for (let i = 0; i < 2 + stage * 2; i++) put(c, 1 + Math.floor(h.hash(i * 3, seed + 9) * (W - 2)), 1 + Math.floor(h.hash(seed + 9, i * 3) * (D - 2)), i & 1 ? '#2a2620' : STONEP[1]);
    }
    if (stage >= 2) {
      // a hole through the walk, and the battlements knocked about
      const hx = 1 + Math.floor(h.hash(seed, 21) * (W - 5)), hy = 2 + Math.floor(h.hash(21, seed) * (D - 5));
      rect(c, hx, hy, 2, 2, '#0c0a08'); put(c, hx + 2, hy + 1, '#2a2620'); put(c, hx, hy, '#2a2620');
      for (let i = 0; i < 3; i++) put(c, Math.floor(h.hash(i, seed + 5) * W), 0, '#2a2620');
      rect(c, Math.floor(h.hash(seed, 33) * (W - 3)), D + L - 4, 2, 2, '#0c0a08');
    }
    rect(c, 0, D + L - 1, W, 1, INK);
  });
}

// a round tower: a cylinder of stone, topped with a crenellated walk or a cone of slate
function towerSprite(h, p, stage) {
  const S = p.w, L = p.donjon ? 26 : LIFT.castle_tower, R = S / 2 - 1, roof = p.roof, donjon = p.donjon;
  const key = `tw|${S}|${roof}|${donjon ? 1 : 0}|${p.banner ? 1 : 0}|${stage}`;
  return h.sprite(key, S, S + L + (roof === 'cone' ? 8 : 0), c => {
    const top = roof === 'cone' ? 8 : 0, cx = S / 2 - 0.5, cy = top + S / 2 - 0.5;
    // the body, from the top disc down to the ground
    for (let y = Math.floor(cy); y < S + L + top; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx, body = Math.abs(dx) <= R && y < cy + L + 0.5 + Math.sqrt(Math.max(0, R * R - dx * dx)) * 0.5;
      if (!body) continue;
      const edge = Math.abs(dx) > R - 1 || !(y + 1 < cy + L + 0.5 + Math.sqrt(Math.max(0, R * R - dx * dx)) * 0.5);
      const course = Math.floor((y - cy) / 3), lx = dx / R;
      const l = lx < -0.55 ? 4 : lx < -0.1 ? 3 : lx < 0.5 ? 2 : 1;
      const mortar = (y - Math.floor(cy)) % 3 === 2 || (Math.round(dx * 1.4) + course * 3 + 40) % 6 === 0;
      put(c, x, y, edge ? INK : mortar ? STONEP[Math.max(0, l - 2)] : STONEP[l]);
    }
    // slits and a lit window
    rect(c, Math.round(cx) - 1, Math.round(cy + L * 0.45), 2, 4, SLIT);
    if (donjon || p.banner) put(c, Math.round(cx) - 1, Math.round(cy + L * 0.45) + 1, LITW);
    if (p.banner) {
      const bx = Math.round(cx) - 4, by = Math.round(cy + R * 0.6);
      rect(c, bx - 1, by, 10, 13, INK); rect(c, bx, by, 8, 11, '#8a1e18'); rect(c, bx, by, 2, 11, '#a82a20');
      rect(c, bx + 2, by + 4, 4, 1, '#ffd75a'); put(c, bx + 2, by + 3, '#ffd75a'); put(c, bx + 5, by + 3, '#ffd75a');
      put(c, bx, by + 11, '#8a1e18'); put(c, bx + 7, by + 11, '#8a1e18');
    }
    // the top
    for (let y = 0; y < S + top; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (roof === 'cone') {
        // a cone: the disc stretched up into a point, lit from the top left
        const k = (y - (cy - R - top)) / (R + top), rr = R + 1;
        if (y > cy) { if (d > rr) continue; }
        else { const half = rr * clamp((y - (cy - R - top)) / (R + top), 0, 1); if (Math.abs(dx) > half) continue; }
        const a = Math.atan2(dy - (y > cy ? 0 : 0), dx), lit = dx < -1 ? 4 : dx < 2 ? 3 : dx < R * 0.6 ? 2 : 1;
        const pal = donjon ? ROOF_PAL.tile : ROOF_PAL.slate;
        const ring = y > cy && d > rr - 1, outline = (y <= cy && Math.abs(dx) > rr * clamp(k, 0, 1) - 1) || ring;
        put(c, x, y, outline ? INK : (Math.round(dx + 20) % 3 === 0 && y < cy) ? pal[Math.max(0, lit - 1)] : pal[lit]);
        void a;
      } else {
        if (d > R + 0.5) continue;
        const rim = d > R - 2.5, ang = Math.atan2(dy, dx);
        let col;
        if (d > R - 0.5) col = INK;
        else if (rim) col = Math.floor((ang + 4) * 4.2) % 2 ? (dx + dy < 0 ? STONEP[5] : STONEP[3]) : STONEP[1];
        else { const ring = Math.floor(d) % 4 === 0, spoke = Math.floor((ang + 4) * 8 / TAU * 1.0001 * (d > 6 ? 2 : 1)) !== Math.floor((Math.atan2(dy, dx + 0.7) + 4) * 8 / TAU * (d > 6 ? 2 : 1)); col = ring || spoke ? STONEP[1] : STONEP[2 + ((Math.floor(d / 4) + Math.floor((ang + 4) * 3)) % 3 === 0 ? 1 : 0)]; }
        put(c, x, y, col);
      }
    }
    if (roof === 'cone') { put(c, Math.round(cx), 0, donjon ? '#ffd75a' : '#c8962a'); put(c, Math.round(cx), 1, INK); }
    else { rect(c, Math.round(cx) - 1, Math.round(cy) - 1, 3, 3, '#4a3a2a'); put(c, Math.round(cx) - 1, Math.round(cy) - 1, '#6a5a44'); }
    // damage: cracks down the body, gaps in the top
    const body0 = Math.round(cy + R + 1), bodyH = Math.max(4, Math.round(L - R * 0.5 - 2));
    if (stage >= 1) for (let i = 0; i < 1 + stage * 2; i++) {
      let x = Math.round(cx - R + 3 + h.hash(i, S) * (R * 2 - 6)), y = body0 + Math.floor(h.hash(S, i) * 2);
      for (let k = 0; k < bodyH; k++) { put(c, x, y + k, '#1c1814'); if (h.hash(k, i) > 0.55) x += h.hash(i, k) > 0.5 ? 1 : -1; }
    }
    if (stage >= 2) {
      // the roof stove in (or the floor of the walk), and a bite out of the masonry
      const hx = Math.round(cx) + 1, hy = Math.round(cy) - (roof === 'cone' ? 6 : 3);
      rect(c, hx, hy, 6, 4, '#0c0a08'); rect(c, hx + 1, hy, 1, 4, '#5a3a22'); rect(c, hx + 4, hy, 1, 4, '#5a3a22'); rect(c, hx, hy + 4, 6, 1, INK);
      rect(c, Math.round(cx) - 8, body0 + 2, 4, 3, '#0c0a08');
    }
  });
}

// the ground plan of a fallen block: broken stone and dust, a few stubs standing
function ruinField(h, r) {
  const W = Math.round(r.w), D = Math.round(r.h), v = r.seed % 4;
  return h.sprite(`cruin|${W}|${v}`, W + 4, D + 4, c => {
    // a bed of grit and dust, then broken stones lying on it, each with a little shadow
    for (let y = 0; y < D + 4; y++) for (let x = 0; x < W + 4; x++) {
      const e = Math.min(x, y, W + 3 - x, D + 3 - y), n = h.hash(x + v * 13, y + W);
      if (e < 2 && n < 0.6) continue;
      if (n < 0.55) put(c, x, y, n < 0.2 ? '#3a342b' : '#4a4236');
    }
    for (let i = 0; i < W * D / 14; i++) {
      const x = 1 + Math.floor(h.hash(i, v * 7 + W) * (W + 1)), y = 1 + Math.floor(h.hash(v * 7 + W, i) * (D + 1)), s = h.hash(i, i + v) > 0.65 ? 2 : 1;
      rect(c, x + 1, y + 1, s, s, '#1c1814');
      rect(c, x, y, s, s, STONEP[2 + Math.floor(h.hash(x, y) * 3)]);
    }
  });
}

// a fallen tower: a long heap of masonry along the line it fell, its roof broken at the far end
function fallenTower(h, t) {
  const a8 = Math.round(((t.ang % TAU) + TAU) % TAU / TAU * 16) % 16, ang = a8 / 16 * TAU, L = t.len, S = Math.ceil(L * 2 + 16);
  return h.sprite(`ftw|${a8}|${L}|${t.roof}|${t.donjon ? 1 : 0}|${t.seed % 3}`, S, S, c => {
    const C2 = S / 2, ca = Math.cos(ang), sa = Math.sin(ang), v = t.seed % 3;
    const blobs = [];
    for (let s = 2; s < L; s += 2) {
      const wid = 7 - s / L * 2;
      for (let k = 0; k < 4; k++) {
        const off = (h.hash(s + v, k) - 0.5) * wid * 2;
        blobs.push([C2 + ca * s - sa * off, C2 + sa * s + ca * off, h.hash(k, s + v) > 0.6 ? 3 : 2]);
      }
    }
    blobs.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s] of blobs) rect(c, Math.round(x) - 1, Math.round(y), s + 2, s + 1, '#1c1814');
    for (const [x, y, s] of blobs) { rect(c, Math.round(x), Math.round(y), s, s, STONEP[2 + (Math.round(x + y) % 3)]); put(c, Math.round(x), Math.round(y), STONEP[5]); }
    if (t.roof === 'cone') {
      const pal = t.donjon ? ROOF_PAL.tile : ROOF_PAL.slate, ex = C2 + ca * (L - 2), ey = C2 + sa * (L - 2);
      for (let k = 0; k < 9; k++) {
        const x = Math.round(ex + (h.hash(k, v) - 0.5) * 10), y = Math.round(ey + (h.hash(v, k) - 0.5) * 8);
        rect(c, x - 1, y - 1, 5, 4, INK); rect(c, x, y, 3, 2, pal[2 + (k % 3)]);
      }
      put(c, Math.round(ex + ca * 4), Math.round(ey + sa * 4), t.donjon ? '#ffd75a' : '#c8962a');
    }
  });
}

function drawBlock(ctx, p, g, h) {
  if (p.state !== 'up') return;
  const L = LIFT[p.kind], x = Math.round(p.x - p.w / 2) + (p.hitT > 0.07 ? 1 : 0), y = Math.round(p.y - p.h / 2) - L;
  const st = p.hp / p.maxhp < 0.34 ? 2 : p.hp / p.maxhp < 0.67 ? 1 : 0;
  const spr = blockSprite(h, p.kind, p.kind === 'castle_gate' ? [1, 0, 1, 0] : edges(g, p), st, p.seed % 4);
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 3, y + L + 2, p.w, p.h); ctx.globalAlpha = 1;
  ctx.drawImage(spr, x, y);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / 10); ctx.drawImage(h.tinted(spr, '#1a120c'), x, y); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}
function drawTower(ctx, p, g, h) {
  if (p.state !== 'up') return;
  const L = p.donjon ? 26 : LIFT.castle_tower, top = p.roof === 'cone' ? 8 : 0;
  const st = p.hp / p.maxhp < 0.34 ? 2 : p.hp / p.maxhp < 0.67 ? 1 : 0;
  const spr = towerSprite(h, p, st);
  const x = Math.round(p.x - p.w / 2) + (p.hitT > 0.07 ? 1 : 0), y = Math.round(p.y - p.h / 2) - L - top + Math.round(p.w / 2 - (p.w / 2 - 1) / 2);
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a';
  for (let k = -4; k <= 4; k++) { const hw = Math.round(p.w / 2 * Math.sqrt(1 - (k / 5) ** 2)); ctx.fillRect(Math.round(p.x) + 5 - hw, Math.round(p.y + p.h / 2) - 2 + k, hw * 2, 1); }
  ctx.globalAlpha = 1;
  ctx.drawImage(spr, x, y);
  if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}
function drawRubble(ctx, p, g, h) { ctx.drawImage(rubbleSprite(h, p.seed % 4, p.seed % 5 === 0), Math.round(p.x) - 4, Math.round(p.y) - 3); }

// ---------------------------------------------------------------------------------------------- the ground

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const GRASS = ['#24331d', '#2c3e23', '#364b2a', '#425a31'];
const DIRT = ['#3f3222', '#54432d', '#6a5538'];

function ground(ctx, m, h) {
  const zone = new Uint8Array(m.w * m.h);
  // courtyard flagstones and the road are paved; everything else is grass, painted after
  fillZone(zone, m.w, X0, Y0, X0 + COLS * C, Y0 + ROWS * C, 1);
  fillZone(zone, m.w, 140, Y0 + ROWS * C, 184, m.h, 0);
  const grassy = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const inCastle = x >= X0 && x < X0 + COLS * C && y >= Y0 && y < Y0 + ROWS * C, road = x >= 140 && x < 184 && y >= MOAT.y1;
    if (!inCastle && !road) grassy[y * m.w + x] = 1;
  }
  paintGround(ctx, m, h, zone);
  // grass outside the walls, and a worn dirt track
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!grassy[y * m.w + x]) continue;
    const n = h.vnoise(x / 18, y / 18) * 0.6 + h.vnoise(x / 6 + 40, y / 6) * 0.25 + h.hash(x, y) * 0.2;
    let col = GRASS[clamp(Math.floor(n * 3.6 - 0.4 + ((x + y) & 1) * 0.3), 0, 3)];
    if (y > MOAT.y1 && Math.abs(x - 162 + Math.sin(y / 20) * 4) < 30 && h.hash(x * 3, y) < 0.5 - Math.abs(x - 162) / 70) col = DIRT[Math.floor(h.hash(x, y * 7) * 3)];
    put(ctx, x, y, col);
  }
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(h.hash(i, 5) * m.w), y = Math.floor(h.hash(5, i) * m.h);
    if (!grassy[y * m.w + x]) continue;
    put(ctx, x, y, i % 3 ? '#56763a' : '#6c8f46'); if (i % 7 === 0) put(ctx, x, y - 1, i % 2 ? '#f4ecd2' : '#e8d23a');
  }
  // the moat's banks
  for (const [y0, y1] of [[MOAT.y0 - 3, MOAT.y0], [MOAT.y1, MOAT.y1 + 3]]) for (let y = y0; y < y1; y++) for (let x = 0; x < m.w; x++) put(ctx, x, y, (x + y * 3) % 8 === 0 ? '#3a3833' : y === MOAT.y0 - 3 || y === MOAT.y1 + 2 ? '#6e6a5e' : '#8d8878');
  // a dark courtyard border where the wall foot meets the yard, and the road edge
  rect(ctx, 140, MOAT.y1 + 3, 1, m.h, '#2a2723'); rect(ctx, 183, MOAT.y1 + 3, 1, m.h, '#2a2723');
  // the distant hills and the city's own wall at the bottom
  sideWall(ctx, 0, 5, MOAT.y1 + 3, m.h, h, false);
  sideWall(ctx, m.w - 5, 5, MOAT.y1 + 3, m.h, h, true);
}

// the drawbridge over the moat, ruins and fallen towers under everything else
function under(ctx, g, h) {
  const V = h.VIEW;
  if (MOAT.y1 > V.y - 10 && MOAT.y0 < V.y + h.H + 10) {
    const s = h.sprite('drawbridge', BRIDGE.x1 - BRIDGE.x0, MOAT.y1 - MOAT.y0 + 4, c => {
      const W = BRIDGE.x1 - BRIDGE.x0, D = MOAT.y1 - MOAT.y0 + 4;
      for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) put(c, x, y, x % 4 === 0 ? '#3a2414' : (y % 6 === 0 ? '#5a3a22' : x < W / 2 ? '#7a5030' : '#6a4428'));
      for (let y = 0; y < D; y += 6) { put(c, 2, y + 1, '#a9b4c2'); put(c, W - 3, y + 1, '#a9b4c2'); }
      rect(c, 0, 0, 1, D, INK); rect(c, W - 1, 0, 1, D, INK); rect(c, 0, D - 1, W, 1, INK);
      // the chains
      for (let y = 0; y < D - 2; y += 2) { put(c, 3, y, '#55564f'); put(c, W - 4, y, '#55564f'); }
    });
    ctx.drawImage(s, BRIDGE.x0, MOAT.y0 - 2);
  }
  if (g.ruins) for (const r of g.ruins) {
    if (r.y + r.h < V.y - 6 || r.y - r.h > V.y + h.H + 6) continue;
    ctx.drawImage(ruinField(h, r), Math.round(r.x - r.w / 2) - 2, Math.round(r.y - r.h / 2) - 2);
  }
  for (const t of g.cs?.topples || []) {
    if (!t.hit) continue;
    const s = fallenTower(h, t);
    ctx.drawImage(s, Math.round(t.x - s.width / 2), Math.round(t.y - s.height / 2));
  }
}

function disc(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let y = -Math.floor(r); y <= Math.floor(r); y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
// a tower on its way down: its top swings out along the line it falls, trailing dust
function over(ctx, g, h) {
  const cs = g.cs;
  if (!cs) return;
  for (const t of cs.topples) {
    if (t.hit) continue;
    const k = Math.min(1, t.t / 0.42), e = k * k, ca = Math.cos(t.ang), sa = Math.sin(t.ang);
    const n = Math.ceil(t.len / 3);
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * t.len * e, lift = (1 - e) * (16 + i * 0.6) * (i / n);
      const x = Math.round(t.x + ca * s), y = Math.round(t.y + sa * s - lift), r = Math.max(3, t.r - 2 - i * 0.12);
      disc(ctx, x, y, r + 1, INK);
      disc(ctx, x, y, r, i === n ? (t.roof === 'cone' ? (t.donjon ? '#9a4028' : '#4f6072') : STONEP[4]) : STONEP[i % 3 === 0 ? 2 : 3]);
      if (i < n) disc(ctx, x - Math.round(r * 0.3), y - Math.round(r * 0.3), Math.max(1, r * 0.35), STONEP[4]);
    }
  }
  for (const d of cs.dust) {
    const a = 1 - d.t / d.life;
    ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#b4a27c';
    const s = Math.round(2 + d.t * 4);
    ctx.fillRect(Math.round(d.x - s / 2), Math.round(d.y - s / 2), s, s);
  }
  ctx.globalAlpha = 1;
}

export default {
  n: 7, id: 'castle', name: 'THE CASTLE', sub: 'BRING IT DOWN. ALL OF IT.', mode: 'timed',
  kinds,
  build(g, rng) { return build(g, rng); },
  update, hud,
  art: { ground, under, over, props: { castle_wall: drawBlock, castle_keep: drawBlock, castle_gate: drawBlock, castle_tower: drawTower, castle_rubble: drawRubble }, canopy: false, theme: { leash: false } },
};
