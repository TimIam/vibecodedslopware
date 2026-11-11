// Level 7, the castle: the finale. A huge castle (curtain walls two blocks thick, round towers, a gatehouse, a keep with a
// donjon in the middle) behind a moat, in a world that scrolls only up and down. Every block of it has hit points and
// crumbles to rubble; towers topple over when they go, and crush whatever they land on. Bring more than 90% of it down,
// the keep's tower included, and every hero left runs for it: the game is won.
//
// What counts toward that 90% (see SHARE and setShares) is a fixed amount per thing, added up, with no cap: raze the
// lot and it comes to well over 300%. Each of the nine outer towers is 10%, the keep's tower 60% (paid all at once when
// it is felled: it can't be hit itself, so the round drum it stands on is chopped through like a tree until it goes
// over, see baseHit; the drum pays nothing itself), each of the seven
// buildings in the yard 3%, each segment of the curtain wall 1% (a segment is one block along the wall, both blocks of
// its thickness: the slice that opens a breach when it goes), the gatehouse 2% (it stands in two segments' place), and
// each block of the keep round the tower 1%. However far the count has got, the game is not won while the keep's tower
// stands; once past 90% with it still up, the HUD says only SEIZE YOUR VENGEANCE! DESTROY THE KEEP!
//
// It is held: a 5-man stands guard at the foot of every tower (and one at the drawbridge, and a couple along the
// walls), a 40-man waits in front of the keep, and the king himself hides behind them in gold plate that a stomp, a
// swipe or a careless step will crush. They stay at their posts until the boss comes near (api.garrison), so they slow
// the wrecking down without all piling in at once. A tower that falls takes its garrison with it, or sends it running.

import * as P from '../props.js';
import { newCanvas } from '../art.js';
import { INK, STONEP, ROOF_PAL, rubbleSprite, steerHeroes, shade, paintGround, fillZone, sideWall } from './city.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------------------------------------- the layout

const MW = 320, MH = 452;
const X0 = 40, Y0 = 64, C = 10, COLS = 24, ROWS = 28;          // the castle grid: 240 × 280 px of stone
const MOAT = { y0: 378, y1: 396 }, BRIDGE = { x0: 144, x1: 180 };
export const WIN_PCT = 90;      // more than this, shown as a whole percent, and the keep's tower down
// what each thing is worth when it is down (1 = 100%); they add up, with no cap
export const SHARE = { tower: 0.10, keepTower: 0.60, base: 0, house: 0.03, wallSeg: 0.01, gate: 0.02, keep: 0.01 };
const SHARE_V = 2;              // bumped when the shares change: a save with another number has its shares recomputed
const YARD_BUILDINGS = { city_chapel: 1, city_inn: 1, city_shop: 1, city_pub: 1, city_house: 1 };
// The keep's tower stands on a round drum, which stands on a square plinth as high as the keep's roof. The tower can't be
// hit; the drum is chopped like a tree trunk: it is SECT wedges round, each hit bites the wedge facing whoever hit it (or
// the nearest one still there), and once more than half of them are gone the tower falls toward the cut, leaving the
// rest of the drum as a stump of broken rooms (and, when it went over the back, a bit of clean tower wall on top).
const DONJON_HP = 800, DONJON_L = 22, DONJON_W = 28;
const PLINTH = 12, DRUM = 14, BASE_LIFT = PLINTH + DRUM, DRUM_R = 19, STUB = 6;
const SECT = 16, SECT_HP = 150;
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
  castle_tower: { ...BLOCK, w: 30, h: 30, hp: 1000, rubbleN: 4, value: { pts: 900, venge: 0.35, chaos: 4 }, onDown: towerDown, onHit: towerHit },
  // the drum (and its plinth) under the keep's tower: half of what that tower was worth (the tower itself pays the other
  // half). Its hit points are only for show: it comes down by its wedges (see baseHit)
  castle_base: { ...BLOCK, w: 40, h: 40, hp: DONJON_HP, rubbleN: 4, value: { pts: 450, venge: 0.175, chaos: 2 }, onHit: baseHit },
  // what is left once the tower is felled: in the way, and past hurting
  castle_stump: { r: DRUM_R, solid: true, onHit: () => true, value: { pts: 0, venge: 0, chaos: 0 } },
  castle_gate: { ...BLOCK, w: 20, h: 20, hp: 520, flammable: true, burnTime: 10, value: { pts: 600, venge: 0.3, chaos: 2 } },
  castle_rubble: { r: 3, push: true, fill: 2, value: { pts: 0, venge: 0, chaos: 0 } },
};
const LIFT = { castle_wall: 7, castle_keep: 12, castle_gate: 7, castle_tower: 16, castle_base: BASE_LIFT };

function blockDown(g, p) {
  (g.ruins ||= []).push({ x: p.x, y: p.y, w: p.w, h: p.h, seed: p.seed, castle: true });
  for (let i = 0; i < 6; i++) { const a = g.rng() * TAU; g.cs?.dust.push({ x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 4, vx: Math.cos(a) * 10, vy: Math.sin(a) * 6 - 4, t: 0, life: 0.8 + g.rng() * 0.6 }); }
}
// the keep's tower can't be touched while its drum stands under it (true: the hit is swallowed)
function towerHit(g, p) { return !!p.donjon && g.cs?.base?.state === 'up'; }
// a tower doesn't just crumble: it falls over, away from whatever pushed it, and lands on things
function towerDown(g, p) {
  blockDown(g, p);
  g.cs?.fallen.push(p);
  const len = p.donjon ? 58 : 46;
  g.cs?.topples.push({ x: p.x, y: p.y, ang: p.fallA, len, t: 0, hit: false, seed: p.seed, roof: p.roof, donjon: p.donjon, r: p.donjon ? DONJON_W / 2 : p.w / 2, lift: p.donjon ? BASE_LIFT : 0 });
}

// ---------------------------------------------------------------------------------------------- chopping the drum

const sectorOf = a => Math.floor((((a % TAU) + TAU) % TAU) / TAU * SECT) % SECT;
const cutsOf = p => (p.cuts ||= new Array(SECT).fill(SECT_HP));
const cutCount = cuts => cuts.reduce((n, v) => n + (v <= 0 ? 1 : 0), 0);
// a hit on the drum: ang is the way the blow travels, so the face it lands on looks back the other way
function baseHit(g, p, dmg, ang) {
  if (p.felled || !g.cs) return true;
  const cuts = cutsOf(p), k0 = sectorOf(ang + Math.PI);
  let k = -1;
  for (let d = 0; d <= SECT / 2 && k < 0; d++) for (const s of d ? [k0 + d, k0 - d] : [k0]) { const j = (s + SECT) % SECT; if (cuts[j] > 0) { k = j; break; } }
  if (k < 0) return true;
  cuts[k] -= dmg;
  p.hitT = 0.12;
  p.hp = p.maxhp * cuts.reduce((s, v) => s + Math.max(0, v), 0) / (SECT * SECT_HP);
  (g.cs.chips ||= []).push({ k, broke: cuts[k] <= 0 });
  return true;
}
// which way it goes: toward the middle of the cut
function cutAngle(cuts) {
  let sx = 0, sy = 0;
  for (let k = 0; k < SECT; k++) if (cuts[k] <= 0) { const a = (k + 0.5) / SECT * TAU; sx += Math.cos(a); sy += Math.sin(a); }
  return Math.atan2(sy, sx);
}
// the chips flying off the drum, and the fall once more than half of it is cut through
function chopDrum(g, api) {
  const cs = g.cs, p = cs.base;
  if (!cs.chips?.length || !p) return;
  for (const c of cs.chips) {
    const a = (c.k + 0.5) / SECT * TAU, x = p.x + Math.cos(a) * DRUM_R, y = p.y + Math.sin(a) * DRUM_R - PLINTH;
    for (let i = 0; i < (c.broke ? 10 : 3); i++) api.part(g, x, y, Math.cos(a) * (15 + g.rng() * 30) + (g.rng() - 0.5) * 20, Math.sin(a) * 15 - 10 - g.rng() * 20, 0.5 + g.rng() * 0.3, g.rng() < 0.5 ? 'dust' : 'splinter');
    api.sound(g, c.broke ? 'crunch' : 'thump');
    if (c.broke) g.shake = Math.max(g.shake, 0.15);
  }
  cs.chips.length = 0;
  if (p.felled || p.state !== 'up' || cutCount(cutsOf(p)) <= SECT / 2) return;
  // timber
  const ang = cutAngle(p.cuts), t = keepTower(cs);
  p.felled = true;
  P.addProp(g, 'castle_stump', p.x, p.y, { cuts: p.cuts.slice(), fellA: ang, back: Math.sin(ang) < -0.5, sortY: 20 });
  P.knockDown(g, p, ang);
  if (t && t.state === 'up') P.knockDown(g, t, ang);
  g.shake = Math.max(g.shake, 0.6);
  api.text(g, p.x, p.y - 46, 'TIMBER!', 'gold', 2.2);
}

// ---------------------------------------------------------------------------------------------- build

function build(g, rng) {
  g.ruins = [];
  const cs = g.cs = { cell: new Array(COLS * ROWS + 200).fill(null), orig: new Uint8Array(COLS * ROWS), blocks: [], topples: [], falls: [], dust: [], won: false, crumbleT: 0, share: 0,
    fallen: [], garrisons: [], king: null, manned: false, base: null, donjon: null, houses: [], chips: [], hintT: 0, keepSaid: false };
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
  for (const t of TOWERS) {
    // the keep's tower stands on its drum (same footprint): drawn after it, and paying the half the drum doesn't
    if (t.donjon) cs.base = block('castle_base', t.c, t.r, t.n);
    const p = block('castle_tower', t.c, t.r, t.n, { roof: t.roof, banner: !!t.banner, donjon: !!t.donjon, ...(t.donjon ? { hp: DONJON_HP, paid: 0.5, sortY: 0.5 } : {}) });
    if (t.donjon) cs.donjon = p;
  }
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
  const bld = (kind, x, y, w, h) => { const d = P.KINDS[kind], hp = Math.round(d.hp * Math.sqrt(w * h / (d.w * d.h))); const p = P.addProp(g, kind, x + w / 2, y + h / 2, { w, h, hp, maxhp: hp }); p.v = p.seed % 3; return p; };
  bld('city_chapel', 206, 186, 42, 48);
  bld('city_shop', 62, 92, 30, 24); bld('city_shop', 62, 120, 30, 24);
  bld('city_pub', 228, 92, 30, 24);
  bld('city_house', 62, 256, 34, 24); bld('city_house', 62, 284, 34, 22);
  bld('city_inn', 216, 262, 40, 44);
  setShares(g);
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

// ---------------------------------------------------------------------------------------------- the garrison

const MIDX = X0 + COLS * C / 2, MIDY = Y0 + ROWS * C / 2;
const KING_BONUS = 5000;
// the garrison is a little softer than the heroes the director sends (2.68 on this level): there are a lot of them
const GARRISON_POWER = 1.6, RAID_POWER = 2;
// a spot near (x, y) with nothing solid within r: searched in rings outward, so posts never land inside the stone.
// in: keep to the courtyard, inside the curtain wall.
function freeSpot(g, x, y, r = 9, inYard = false) {
  const yard = (px, py) => px > X0 + 2 * C + r && px < X0 + (COLS - 2) * C - r && py > Y0 + 2 * C + r && py < Y0 + (ROWS - 2) * C - r;
  const clear = (px, py) => {
    if (P.isWater(g, px, py) || px < 12 || px > MW - 12 || (inYard && !yard(px, py))) return false;
    for (const q of P.near(g, px, py, r + 4)) if (q.state === 'up' && P.KINDS[q.kind].solid && P.touches(q, px, py, r)) return false;
    return true;
  };
  for (let d = 0; d < 60; d += 3) for (let k = 0; k < Math.max(1, d * 2); k++) {
    const a = k / Math.max(1, d * 2) * TAU, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (clear(px, py)) return { x: Math.round(px), y: Math.round(py) };
  }
  return { x, y };
}
function manCastle(g, api) {
  const cs = g.cs;
  cs.manned = true;
  // a 5-man at the foot of each tower, on the courtyard side (the donjon stands in the keep, which has its own)
  for (const t of cs.blocks) {
    if (t.kind !== 'castle_tower' || t.donjon) continue;
    const dx = MIDX - t.x, dy = MIDY - t.y, l = Math.hypot(dx, dy) || 1;
    const s = freeSpot(g, t.x + dx / l * (t.w / 2 + 16), t.y + dy / l * (t.w / 2 + 16), 8, true);
    const p = api.garrison(g, { x: s.x, y: s.y, size: 5, guard: 52, leash: 110, power: GARRISON_POWER });
    p.tower = t;
    cs.garrisons.push(p);
  }
  // and a few more: on the drawbridge's landing, and along the west and east walls
  for (const [x, y, yard] of [[162, 360, false], [74, 258, true], [246, 150, true]]) {
    const s = freeSpot(g, x, y, 8, yard);
    cs.garrisons.push(api.garrison(g, { x: s.x, y: s.y, size: 5, guard: 52, leash: 110 }));
  }
  // the 40-man, drawn up in front of the keep, and the king behind them on the keep's steps
  const ky = Y0 + (KEEP.r1 + 1) * C;
  cs.raid = api.garrison(g, { x: MIDX, y: ky + 22, size: 40, guard: 58, leash: 150, power: RAID_POWER });
  cs.king = api.king(g, { x: MIDX, y: ky + 6, hp: 30 });
}

// a tower comes down on the heroes standing guard under it: the ones at its foot are crushed, the rest run
function towerFell(g, api, t) {
  for (const p of g.cs.garrisons) {
    if (p.tower !== t || p.done) continue;
    let dead = 0;
    for (const u of api.alive(p)) if (Math.hypot(u.x - t.x, u.y - t.y) < t.w / 2 + 22) { api.hurtUnit(g, u, 9999); dead++; }
    const left = api.alive(p);
    if (left.length) { api.scatter(g, p); api.bark(g, left[0], dead ? 'RUN!!!' : 'NOPE'); }
    api.text(g, t.x, t.y - 22, dead ? 'GARRISON CRUSHED' : 'GARRISON ROUTED', 'gold', 1.6);
  }
}

// the king: crushed by anything at all, a step included
function updateKing(g, api) {
  const cs = g.cs, k = cs.king, b = g.boss;
  if (!k || cs.kingDone) return;
  if (!k.dead && !k.gone && !b.dead && !g.won && Math.hypot(k.x - b.x, k.y - b.y) < b.r + 3.5) api.hurtUnit(g, k, 9999);
  if (k.dead) {
    cs.kingDone = true;
    const pts = Math.round(KING_BONUS * g.mult);
    api.addScore(g, pts);
    api.text(g, k.x, k.y - 12, `+${pts}`, 'gold', 2.2);
    for (let i = 0; i < 18; i++) { const a = g.rng() * TAU, s = 15 + g.rng() * 40; api.part(g, k.x, k.y - 2, Math.cos(a) * s, Math.sin(a) * s, 0.6, i % 3 ? 'spark' : 'blood'); }
    api.sound(g, 'crunch');
    if (!g.won) api.banner(g, 'THE KING IS CRUSHED', `+${pts}. THE ARMOUR WAS MOSTLY GOLD LEAF.`, 4);
  } else if (k.gone) cs.kingDone = true;
}

// ---------------------------------------------------------------------------------------------- logic

// Who is worth what (SHARE). A wall segment is the slice of curtain wall one block long and both blocks thick, so each
// of its blocks carries half of it. The yard's buildings are found among the props (a save from before this has only
// some of them listed), and the whole is worked out again whenever SHARE_V moves on.
const wallSeg = p => p.gr < 2 ? 'N' + p.gc : p.gr >= ROWS - 2 ? 'S' + p.gc : p.gc < 2 ? 'W' + p.gr : 'E' + p.gr;
function setShares(g) {
  const cs = g.cs, segs = {};
  cs.houses = g.props.filter(p => YARD_BUILDINGS[p.kind] && p.x > X0 && p.x < X0 + COLS * C && p.y > Y0 && p.y < Y0 + ROWS * C);
  for (const p of cs.blocks) if (p.kind === 'castle_wall') segs[wallSeg(p)] = (segs[wallSeg(p)] || 0) + 1;
  for (const p of cs.blocks) {
    if (p.kind === 'castle_wall') { p.seg = segs[wallSeg(p)]; p.share = SHARE.wallSeg / p.seg; }
    else p.share = p.donjon ? SHARE.keepTower : p.kind === 'castle_tower' ? SHARE.tower : p.kind === 'castle_base' ? SHARE.base
      : p.kind === 'castle_gate' ? SHARE.gate : p.kind === 'castle_keep' ? SHARE.keep : 0;
  }
  for (const p of cs.houses) p.share = SHARE.house;
  cs.shareV = SHARE_V;
}
// how much of a thing is down: by its hit points, so the count moves as it is knocked about. The keep's tower pays
// only once it has fallen.
const downFrac = p => p.state !== 'up' ? 1 : p.donjon ? 0 : clamp(p.maxhp - p.hp, 0, p.maxhp) / p.maxhp;
const shareOf = (cs, p) => p.share || 0;
// how much of the castle is down, 1 = 100%: not capped, it goes well past 1
export function castleShare(g) {
  const cs = g.cs;
  let down = 0;
  for (const p of cs.blocks) down += shareOf(cs, p) * downFrac(p);
  for (const p of cs.houses || []) down += shareOf(cs, p) * downFrac(p);
  return down;
}
const keepTower = cs => cs.donjon || cs.blocks.find(p => p.donjon);
const keepStands = cs => { const t = keepTower(cs); return !!t && t.state === 'up'; };
const pct = s => Math.floor(s * 100 + 1e-6);
// past the line: more than 90%, as the HUD shows it
const pastLine = s => pct(s) > WIN_PCT;
// the share table, for the tests: one row per sort of thing (a wall segment counts as its two blocks together)
export function shareTable(g) {
  const cs = g.cs, rows = {};
  const add = (name, p, k) => { const r = rows[name] ||= { asset: name, count: 0, each: shareOf(cs, p) / k, subtotal: 0, blocks: 0 }; r.count += k; r.blocks++; r.subtotal += shareOf(cs, p); };
  for (const p of cs.blocks) {
    if (p.kind === 'castle_wall') add('wall segment', p, 1 / (p.seg || 1));
    else add(p.donjon ? 'keep tower' : p.kind === 'castle_base' ? 'keep tower base' : p.kind === 'castle_tower' ? 'outer tower' : p.kind === 'castle_keep' ? 'keep block' : p.kind.replace('castle_', ''), p, 1);
  }
  for (const p of cs.houses || []) add('building (' + p.kind.replace('city_', '') + ')', p, 1);
  for (const r of Object.values(rows)) { r.count = Math.round(r.count * 1000) / 1000; r.each = Math.round(r.each * 1e6) / 1e6; r.subtotal = Math.round(r.subtotal * 1e6) / 1e6; }
  return Object.values(rows);
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
    const t = (u.state === 'flee' || u.state === 'leave') && u.exit ? u.exit : !u.party?.engaged && (u.post || u.stage) ? (u.post || u.stage) : b;
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
  if (!cs.manned) manCastle(g, api);
  if (!cs.kingSaid && g.t - g.levelT0 > 4.5 && !g.won) { cs.kingSaid = true; api.banner(g, 'THE KING IS AT HOME', 'GOLD ARMOUR. VERY SHINY. VERY THIN.', 3.4); }
  steerHeroes(g, dt, g.map.canals);
  steerThroughWalls(g, dt);
  while (cs.fallen.length) towerFell(g, api, cs.fallen.shift());
  updateKing(g, api);
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

  // the keep's tower: its drum chopped through like a tree
  chopDrum(g, api);

  // the win: more than 90% of the castle down, and the keep's tower among it. Neither is enough alone.
  if (cs.shareV !== SHARE_V) setShares(g);
  cs.share = castleShare(g);
  const enough = pastLine(cs.share), keepUp = keepStands(cs);
  if (!cs.won && !g.boss.dead && !g.won) {
    if (enough && !keepUp) {
      cs.won = true;
      api.win(g);
    } else if (enough) {
      // said again every so often for as long as it holds: other banners talk over it
      cs.hintT = (cs.hintT || 0) - dt;
      if (cs.hintT <= 0) { cs.hintT = 25; api.banner(g, 'SEIZE YOUR VENGEANCE!', 'DESTROY THE KEEP!', 3.6); }
    } else if (!keepUp && !enough && !cs.keepSaid) {
      cs.keepSaid = true;
      api.banner(g, 'THE KEEP TOWER IS DOWN', `NOW THE REST. ${pct(cs.share)}% DOWN, MORE THAN ${WIN_PCT}% WINS.`, 3.6);
    }
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
// the goal line: how much is down (uncapped) and the line to pass; past it with the keep's tower up, only the order
function hud(g) {
  const cs = g.cs;
  if (!cs) return `CASTLE 0%  GOAL >${WIN_PCT}%`;
  const s = cs.share || 0;
  if (!keepStands(cs)) return pastLine(s) ? `CASTLE ${pct(s)}%  KEEP DOWN` : `CASTLE ${pct(s)}%  KEEP DOWN  GOAL >${WIN_PCT}%`;
  return pastLine(s) ? 'SEIZE YOUR VENGEANCE! DESTROY THE KEEP!' : `CASTLE ${pct(s)}%  GOAL >${WIN_PCT}%`;
}
// won: the count keeps climbing as the rest crumbles, so it stays up beside the win
const hudWon = g => g.cs ? `YOU WIN  CASTLE ${pct(g.cs.share || 0)}%` : 'YOU WIN';

// ---------------------------------------------------------------------------------------------- art

const MOSS = '#4f6a32', SLIT = '#0e0b08', LITW = '#e8b850';
const put = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const standing = (g, c, r) => { const p = c >= 0 && r >= 0 && c < COLS && r < ROWS ? g.cs.cell[r * COLS + c] : null; return p && p.state === 'up' ? p : null; };
const wasThere = (g, c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS && g.cs.orig[r * COLS + c] === 1;

// edge state for one side of a block: 0 joined to a neighbour, 1 an outer edge (battlements), 2 broken (a neighbour fell).
// The keep's tower counts as the base it stands on: joined while the base is up, broken once it has gone.
function edges(g, p) {
  const c = p.gc, r = p.gr, out = [];
  for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const q = standing(g, c + dc, r + dr), tower = !!q && q.kind === 'castle_tower';
    if (tower && q.donjon && g.cs.base) out.push(g.cs.base.state === 'up' ? 0 : 2);
    else out.push(q && !tower ? 0 : wasThere(g, c + dc, r + dr) && !tower ? 2 : 1);
  }
  return out;
}

// What is inside the stone. A wall or keep block that is broken open shows the hallway or room behind its face: a back
// wall, a floor, and something in it (a torch, a doorway, a bed...), all darker than the daylight outside. Which room a
// block holds comes from where it stands in the castle (roomOf), so a run of broken blocks is a row of different
// rooms, not one room repeated. It is painted into the block's cached sprite, never per frame.
const ROOM = { dark: '#0c0a08', ceil: '#15110e', wall: ['#211c18', '#2b2520', '#383029'], glow: ['#5c4426', '#80602f'], plank: ['#2c2118', '#4c3825', '#644e33'], flag: ['#24211e', '#39352f', '#4a453d'] };
const ROOMS = 8, BOOKS = ['#8a2a22', '#2a5a8a', '#c8962a', '#3a6a3a'];
const WOOD = ['#4a3220', '#6a4426', '#8a5c34'], STEEL = '#d8dce0', CLOTH = '#8a1e18', LINEN = '#d8d0b8', SKY = '#7a94aa';
// room variant: which of the eight rooms (neighbours along a wall never match), times two for a cross-wall at its left
const roomOf = (h, p) => ((p.gc * 3 + p.gr * 5) % ROOMS) * 2 + (p.gc % 3 === 0 ? 1 : 0);

function paintRoom(c, h, x0, y0, w, hh, keep, rv, seed) {
  const feat = (rv >> 1) % ROOMS, tall = hh >= 9, fl = keep ? ROOM.plank : ROOM.flag, fh = tall ? 2 : 1, fy = y0 + hh - fh, b = fy - 1;
  const torch = (x, y) => {
    for (const [dx, dy] of [[-1, 0], [1, 0], [-1, -1], [1, -1], [0, -2], [-2, 0], [2, 0], [0, 1]]) if (y + dy > y0 && y + dy < fy && x + dx >= x0 && x + dx < x0 + w) put(c, x + dx, y + dy, ROOM.glow[dy < 0 || !dx ? 0 : 0]);
    if (y + 1 < fy) put(c, x, y + 1, WOOD[0]);
    put(c, x, y, '#ff9a2a'); put(c, x, y - 1, '#ffe07a');
  };
  // the back wall in shadow, under the dark of the ceiling
  for (let y = y0; y < fy; y++) for (let x = x0; x < x0 + w; x++) {
    const yy = y - y0, course = Math.floor(yy / 3);
    put(c, x, y, yy === 0 ? ROOM.ceil : yy % 3 === 0 || (x - x0 + course * 3 + seed) % 6 === 0 ? ROOM.wall[0] : ROOM.wall[h.hash(x + seed * 3, course + 50) > 0.8 ? 2 : 1]);
  }
  // the floor: boards in the keep, flags in the walls
  for (let x = x0; x < x0 + w; x++) {
    put(c, x, fy, (x - x0 + seed) % 4 === 0 ? fl[0] : fl[2]);
    if (fh === 2) put(c, x, fy + 1, (x - x0 + seed + 2) % 4 === 0 ? fl[0] : fl[1]);
  }
  // a cross-wall, cut through
  let X = x0 + 1;
  if (rv & 1) { rect(c, x0, y0 + 1, 1, hh - 1, STONEP[0]); rect(c, x0 + 1, y0 + 1, 1, hh - 1, ROOM.wall[2]); X = x0 + 2; }
  if (tall) {
    if (feat === 0) {          // a table with a candle, and a torch on the wall
      torch(X + 6, y0 + 3);
      rect(c, X, b - 2, 5, 1, WOOD[2]); rect(c, X, b - 1, 1, 2, WOOD[0]); rect(c, X + 4, b - 1, 1, 2, WOOD[0]);
      put(c, X + 2, b - 3, LINEN); put(c, X + 2, b - 4, '#ffe07a');
    } else if (feat === 1) {   // a doorway through to the next room, lit from beyond
      rect(c, X, y0 + 3, 6, fy - y0 - 3, ROOM.wall[2]);
      rect(c, X + 1, y0 + 4, 4, fy - y0 - 4, ROOM.dark); put(c, X + 1, y0 + 4, ROOM.wall[2]); put(c, X + 4, y0 + 4, ROOM.wall[2]);
      put(c, X + 3, y0 + 6, ROOM.glow[1]); put(c, X + 2, y0 + 6, ROOM.glow[0]); put(c, X + 3, y0 + 7, ROOM.glow[0]);
    } else if (feat === 2) {   // a bed under a window
      rect(c, X + 4, y0 + 2, 1, 3, SKY); put(c, X + 4, y0 + 2, '#a8c0d0');
      rect(c, X, b - 1, 7, 2, WOOD[0]); rect(c, X + 1, b - 2, 6, 2, CLOTH); rect(c, X + 1, b - 2, 2, 1, LINEN); put(c, X, b - 3, WOOD[0]); put(c, X, b - 2, WOOD[0]);
    } else if (feat === 3) {   // bookshelves
      rect(c, X, y0 + 2, 6, fy - y0 - 2, WOOD[0]);
      for (let y = y0 + 3; y < fy - 1; y += 2) for (let i = 1; i < 5; i++) put(c, X + i, y, h.hash(i + seed, y) > 0.2 ? BOOKS[Math.floor(h.hash(y + seed, i) * 4)] : ROOM.dark);
    } else if (feat === 4) {   // barrels in store, under the king's colours
      rect(c, X + 3, y0 + 2, 3, 4, CLOTH); put(c, X + 4, y0 + 3, '#ffd75a'); put(c, X + 3, y0 + 6, CLOTH); put(c, X + 5, y0 + 6, CLOTH);
      rect(c, X, b - 2, 3, 3, WOOD[1]); rect(c, X, b - 1, 3, 1, STONEP[0]); put(c, X, b - 2, WOOD[2]);
      rect(c, X + 4, b - 1, 2, 2, WOOD[1]); put(c, X + 4, b - 1, WOOD[2]);
    } else if (feat === 5) {   // a hearth, still burning
      rect(c, X, b - 4, 6, 5, STONEP[0]); rect(c, X, b - 4, 6, 1, STONEP[1]); rect(c, X + 1, b - 2, 4, 3, ROOM.dark);
      put(c, X + 2, b, '#ff9a2a'); put(c, X + 3, b, '#ffe07a'); put(c, X + 2, b - 1, '#ffe07a'); put(c, X + 3, b - 1, '#ff9a2a');
      for (let i = 0; i < 6; i++) put(c, X + i, fy, ROOM.glow[1]);
    } else if (feat === 6) {   // a stair going up
      torch(X + 1, y0 + 3);
      for (let i = 0; i < 6; i++) { rect(c, X + 1 + i, b - i, 1, i + 1, ROOM.wall[2]); put(c, X + 1 + i, b - i, STONEP[2]); }
    } else {                   // the armoury: spears racked by a torch
      torch(X + 1, y0 + 3);
      rect(c, X + 3, b - 5, 1, 6, WOOD[2]); put(c, X + 3, b - 6, STEEL); rect(c, X + 5, b - 4, 1, 5, WOOD[2]); put(c, X + 5, b - 5, STEEL);
      rect(c, X + 6, b - 2, 2, 2, '#2a5a8a'); put(c, X + 6, b - 2, '#4a7aaa');
    }
  } else {
    const top = y0 + 1, wh = fy - top;   // the strip of back wall there is to work with
    if (feat === 0) torch(X + 3, y0 + 2);
    else if (feat === 1) { rect(c, X + 1, top, 4, wh, ROOM.dark); put(c, X + 1, top, ROOM.wall[2]); put(c, X + 4, top, ROOM.wall[2]); put(c, X + 3, b, ROOM.glow[0]); }
    else if (feat === 2) { rect(c, X + 1, b - 1, 2, 2, WOOD[1]); put(c, X + 1, b - 1, WOOD[2]); rect(c, X + 4, b, 2, 1, WOOD[0]); }
    else if (feat === 3) { torch(X + 6, y0 + 2); for (const i of [0, 2, 4]) { rect(c, X + i, top, 1, wh, WOOD[2]); put(c, X + i, top, STEEL); } }
    else if (feat === 4) { torch(X + 6, y0 + 2); rect(c, X + 1, top, 3, 2, CLOTH); put(c, X + 2, top, '#ffd75a'); if (wh > 2) put(c, X + 2, top + 2, CLOTH); }
    else if (feat === 5) { rect(c, X + 5, top, 1, 2, SKY); rect(c, X, b, 4, 1, WOOD[1]); }
    else if (feat === 6) { torch(X + 1, y0 + 2); rect(c, X + 3, b, 5, 1, CLOTH); put(c, X + 3, b, LINEN); }
    else for (let i = 0; i < 5; i++) put(c, X + 1 + i, b - (i === 2 ? 1 : 0), STONEP[1 + (i % 3)]);
  }
}

// a block of wall or keep: the walk on top, battlements on the open edges, the face below on the south side. Broken
// open (a neighbour fell, or it has taken a beating) it shows the rooms inside instead of more stone.
function blockSprite(h, kind, mask, stage, v, rv = 0) {
  const L = LIFT[kind], keep = kind === 'castle_keep', gate = kind === 'castle_gate', W = gate ? 20 : C, D = gate ? 20 : C;
  return h.sprite(`cb|${kind}|${mask.join('')}|${stage}|${v}|${rv}`, W, D + L, c => {
    const [eN, eE, eS, eW] = mask, seed = v * 31 + 7;
    // Where the stone is gone. On top: a bite out of every edge whose neighbour fell, and a hole through the walk once
    // the block is badly hurt. In the face: all of it when the block in front has fallen (a cut straight through the
    // rooms), or, on an outside wall, a breach that grows with the damage.
    const bite = (i, k) => 1 + Math.floor(h.hash((i >> 1) + seed, k) * 2.7);
    const tx = 2.5 + Math.floor(h.hash(seed, 21) * (W - 5)), ty = 2.5 + Math.floor(h.hash(21, seed) * (D - 5));
    const topHole = (x, y) => {
      if (gate || x < 0 || y < 0 || x >= W || y >= D) return false;
      if ((eN === 2 && y < bite(x, 61)) || (eW === 2 && x < bite(y, 62)) || (eE === 2 && x > W - 1 - bite(y, 63))) return true;
      if (eS === 2 && y === D - 1 && h.hash(x + seed, 64) < 0.5) return true;
      return stage >= 2 && Math.hypot(x - tx, y - ty) + (h.hash(x + seed, y + 9) - 0.5) < 1.9;
    };
    const open = eS === 2 && !gate;
    const fx = 2 + Math.floor(h.hash(seed, 41) * (W - 4)), fy = D + 2 + Math.floor(h.hash(41, seed) * (L - 4));
    const fr = stage && eS === 1 && !gate ? (keep ? 1.3 : 1) + stage * (keep ? 1.2 : 0.8) : 0;
    const faceHole = (x, y) => {
      if (x < 0 || x >= W || y <= D || y >= D + L - 1) return false;
      if (open) return !((x === 0 && eW !== 0) || (x === W - 1 && eE !== 0)) && (y > D + 1 || h.hash(x + seed, 91) < 0.6);
      return fr > 0 && Math.hypot(x - fx, (y - fy) * 1.15) + (h.hash(x + seed, y) - 0.5) * 1.2 < fr;
    };
    const rim = (hole, x, y) => !hole(x, y) && (hole(x - 1, y) || hole(x + 1, y) || hole(x, y - 1) || hole(x, y + 1));

    // the top: flagstones on the walls, lead roof on the keep; through a hole, the far wall and the floor below
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
      let col;
      if (topHole(x, y)) col = !topHole(x, y - 1) ? ROOM.wall[1] : (x + seed) % 4 === 0 ? ROOM.dark : keep ? (h.hash(x + rv, y + seed) > 0.8 ? '#4a1a16' : '#2a1f16') : '#1f1c19';
      else if (keep) col = (x + y * 3 + v) % 7 === 0 ? '#3e4650' : (y % 4 === 0 ? '#454e58' : '#525c66');
      else { const row = Math.floor(y / 3), lx = (x + row * 2 + v) % 5; col = lx === 0 || y % 3 === 2 ? STONEP[1] : STONEP[2 + (h.hash(Math.floor((x + row * 2 + v) / 5) + seed, row) > 0.6 ? 1 : 0)]; }
      put(c, x, y, col);
    }
    // battlements on the open edges
    const side = (e, horiz, at, inward) => {
      if (e !== 1) return;
      for (let i = 0; i < (horiz ? W : D); i++) {
        const x = horiz ? i : at, y = horiz ? at : i, m = (i % 4) < 2;
        if (topHole(x, y)) continue;
        put(c, x, y, m ? STONEP[4] : INK);
        const x2 = horiz ? i : at + inward, y2 = horiz ? at + inward : i;
        if (!topHole(x2, y2)) put(c, x2, y2, m ? STONEP[5] : STONEP[1]);
      }
    };
    side(eN, true, 0, 1); side(eS, true, D - 1, -1); side(eW, false, 0, 1); side(eE, false, W - 1, -1);
    if (eN === 1) put(c, 0, 0, STONEP[5]);
    // the broken lip round every hole in the top: lit where it faces us, dark elsewhere
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (rim(topHole, x, y)) put(c, x, y, topHole(x, y - 1) ? STONEP[4] : h.hash(x + seed, y) > 0.5 ? '#2a2620' : STONEP[1]);

    // the face: the room behind it first (where it will show), then big ashlar courses, lit a little from the left
    if (open || fr > 0) {
      paintRoom(c, h, 0, D + 1, W, L - 2, keep, rv, seed);
      for (let i = 0; i < (open ? 2 : 0) + stage; i++) put(c, 1 + Math.floor(h.hash(i, seed + 70) * (W - 2)), D + L - 2, STONEP[1 + (i % 3)]);   // fallen stone on the floor
    }
    for (let y = D; y < D + L; y++) for (let x = 0; x < W; x++) {
      if (faceHole(x, y)) continue;
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
    } else if (keep && v === 1 && !open && !faceHole(4, D + 4) && !faceHole(5, D + 4)) {
      rect(c, 4, D + 2, 2, 5, SLIT); put(c, 4, D + 3, LITW);
    } else if (!keep && v === 2 && !open && !faceHole(4, D + 3)) rect(c, 4, D + 2, 1, 3, SLIT);
    if (v === 0 && !keep && !open) { put(c, 1, D + L - 2, MOSS); put(c, 2, D + L - 1, MOSS); }
    // damage
    if (stage >= 1) {
      // a crack or two down the face, chips out of the walk
      for (let i = 0; i < stage; i++) { let x = 1 + Math.floor(h.hash(i, seed + 3) * (W - 3)), y = D + 1 + Math.floor(h.hash(seed, i) * 2); for (let k = 0; k < L - 2; k++) { if (!faceHole(x, y + k)) put(c, x, y + k, '#1c1814'); if (h.hash(k, i + seed) > 0.6) x += h.hash(i, k + seed) > 0.5 ? 1 : -1; } }
      for (let i = 0; i < 2 + stage * 2; i++) { const x = 1 + Math.floor(h.hash(i * 3, seed + 9) * (W - 2)), y = 1 + Math.floor(h.hash(seed + 9, i * 3) * (D - 2)); if (!topHole(x, y)) put(c, x, y, i & 1 ? '#2a2620' : STONEP[1]); }
    }
    if (stage >= 2) for (let i = 0; i < 3; i++) put(c, Math.floor(h.hash(i, seed + 5) * W), 0, '#2a2620');   // the battlements knocked about
    // the ragged stone round a breach in the face
    for (let y = D + 1; y < D + L - 1; y++) for (let x = 0; x < W; x++) if (rim(faceHole, x, y)) put(c, x, y, h.hash(x, y + seed) > 0.5 ? '#1c1814' : STONEP[1]);
    rect(c, 0, D + L - 1, W, 1, INK);
  });
}

// a round tower: a cylinder of stone, topped with a crenellated walk or a cone of slate
function towerSprite(h, p, stage, S = p.w) {
  const L = p.donjon ? DONJON_L : LIFT.castle_tower, R = S / 2 - 1, roof = p.roof, donjon = p.donjon;
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
      // (through it, a bit of the stair inside by torchlight)
      const bx = Math.round(cx) - 9, by = body0 + 1;
      rect(c, bx, by, 6, 5, ROOM.wall[1]); rect(c, bx, by, 6, 1, ROOM.ceil); rect(c, bx, by + 4, 6, 1, ROOM.plank[2]);
      put(c, bx + 3, by + 2, ROOM.glow[0]); put(c, bx + 5, by + 2, ROOM.glow[0]); put(c, bx + 4, by + 2, '#ff9a2a'); put(c, bx + 4, by + 1, '#ffe07a');
      put(c, bx + 1, by + 3, ROOM.wall[2]); rect(c, bx, by + 2, 1, 2, ROOM.wall[2]);
      put(c, bx, by, STONEP[1]); put(c, bx + 5, by + 4, STONEP[1]); put(c, bx + 5, by, '#1c1814');
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
  // which room is inside only matters once the block shows it (broken edges or damage): fewer sprites that way
  const gate = p.kind === 'castle_gate', mask = gate ? [1, 0, 1, 0] : edges(g, p);
  const spr = blockSprite(h, p.kind, mask, st, p.seed % 4, !gate && (st > 0 || mask.includes(2)) ? roomOf(h, p) : 0);
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 3, y + L + 2, p.w, p.h); ctx.globalAlpha = 1;
  ctx.drawImage(spr, x, y);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / 10); ctx.drawImage(h.tinted(spr, '#1a120c'), x, y); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}
// The keep's tower's footing: a square plinth (keep roof on top, ashlar face) with a round drum on it. mask has a '1'
// for every wedge of the drum chopped away. Where the cut opens the drum up, the rooms inside show; where nothing is
// left behind it, whatever is behind shows instead. stump: what is left once the tower has gone over, with a short
// broken ring of the tower's own wall on top (back: it fell over the back, so the wall we see is untouched).
const maskOf = cuts => cuts ? cuts.map(v => v <= 0 ? '1' : '0').join('') : '0'.repeat(SECT);
function drumSprite(h, mask, stump = false, back = false) {
  const W = 40, D = 40, OY = stump ? STUB + 2 : 0;
  return h.sprite(`cdrum|${mask}|${stump ? (back ? 2 : 1) : 0}`, W, OY + BASE_LIFT + D, c => {
    const seed = 53, cut = a => mask[sectorOf(a)] === '1';
    const R = DRUM_R, CX = 20, cyT = OY + 20, py = OY + DRUM;
    // the plinth: a square of the keep's lead roof on an ashlar face with two lit slits
    for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, D - 1 - y);
      put(c, x, py + y, e === 0 ? INK : (x + y * 3) % 7 === 0 ? '#3e4650' : y % 4 === 0 ? '#454e58' : '#525c66');
    }
    for (let y = 0; y < PLINTH; y++) for (let x = 0; x < W; x++) {
      const course = Math.floor(y / 3), mortar = y % 3 === 2 || (x + course * 4) % 6 === 0;
      const l = 2 + (x < 2 ? 1 : 0) - (y > PLINTH - 3 ? 1 : 0) + (y === 0 ? 1 : 0);
      put(c, x, py + D + y, x === 0 || x === W - 1 || y === PLINTH - 1 ? INK : mortar ? STONEP[1] : STONEP[clamp(l + (h.hash(x + seed, course) > 0.8 ? 1 : 0), 0, 5)]);
    }
    for (const wx of [4, 34]) { rect(c, wx, py + D + 3, 2, 5, SLIT); put(c, wx, py + D + 4, LITW); }

    // the rooms inside the drum, painted flat, then bent round it wherever the cut lays them open
    const band = newCanvas(W, DRUM), bc = band.getContext('2d');
    for (let i = 0; i < 4; i++) paintRoom(bc, h, i * 10, 0, 10, DRUM, true, ((i * 3 + 2) % ROOMS) * 2 + (i % 2), seed + i);
    const bd = bc.getImageData(0, 0, W, DRUM).data;
    const room = (x, r) => { const i = (clamp(r, 0, DRUM - 1) * W + x) * 4; return `rgb(${bd[i]},${bd[i + 1]},${bd[i + 2]})`; };

    // the drum, column by column: its top, and below it the curve of its face
    const topAt = (x, y) => { const dx = x + 0.5 - CX, dy = y + 0.5 - cyT; return Math.hypot(dx, dy) <= R && !cut(Math.atan2(dy, dx)); };
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - CX;
      if (Math.abs(dx) > R) continue;
      const hh = Math.sqrt(R * R - dx * dx), front = !cut(Math.atan2(hh, dx));
      let behind = false;   // is any of the drum left further back along this column?
      for (let yy = -hh; yy < hh; yy += 1) if (!cut(Math.atan2(yy, dx))) { behind = true; break; }
      const lx = dx / R, l = lx < -0.55 ? 4 : lx < -0.1 ? 3 : lx < 0.5 ? 2 : 1;
      for (let y = Math.floor(cyT + hh); y < Math.ceil(cyT + hh + DRUM); y++) {
        const f = y + 0.5 - (cyT + hh);
        if (f < 0 || f > DRUM) continue;
        if (front) {
          const edge = Math.abs(dx) > R - 1 || f > DRUM - 1, course = Math.floor(f / 3), mortar = Math.floor(f) % 3 === 2 || (Math.round(dx * 1.4) + course * 3 + 40) % 6 === 0;
          put(c, x, y, edge ? INK : mortar ? STONEP[Math.max(0, l - 2)] : STONEP[l]);
        } else if (behind) put(c, x, y, room(x, Math.floor(f)));
      }
      // the top: flagstones inside a crenellated rim; where it is cut, the rooms below (if anything is left behind)
      for (let y = Math.floor(cyT - hh); y < Math.ceil(cyT + hh); y++) {
        const dy = y + 0.5 - cyT, d = Math.hypot(dx, dy);
        if (d > R) continue;
        if (topAt(x, y)) {
          const ang = Math.atan2(dy, dx), rim = d > R - 2.5;
          let col;
          if (d > R - 0.7) col = INK;
          else if (rim) col = Math.floor((ang + 4) * 6) % 2 ? (dx + dy < 0 ? STONEP[5] : STONEP[3]) : STONEP[1];
          else { const row = Math.floor((y - OY) / 3); col = (x + row * 2) % 5 === 0 || (y - OY) % 3 === 2 ? STONEP[1] : STONEP[2 + (h.hash(Math.floor((x + row * 2) / 5) + seed, row) > 0.6 ? 1 : 0)]; }
          // the broken lip along the cut
          if (!topAt(x - 1, y) || !topAt(x + 1, y) || !topAt(x, y - 1) || !topAt(x, y + 1)) if (d < R - 0.7) col = h.hash(x + seed, y) > 0.5 ? '#2a2620' : STONEP[1];
          put(c, x, y, col);
        } else {
          let left = false;
          for (let yy = -hh; yy < dy; yy += 1) if (!cut(Math.atan2(yy, dx))) { left = true; break; }
          if (left) put(c, x, y, room(x, Math.round((dy + hh) / (2 * hh) * (DRUM - 1))));
        }
      }
      // the ragged edge of the face where the cut starts
      if (front && x > 0) {
        const odx = dx - 1, ohh = Math.sqrt(Math.max(0, R * R - odx * odx));
        if (Math.abs(odx) <= R && cut(Math.atan2(ohh, odx))) for (let y = Math.floor(cyT + hh); y < cyT + hh + DRUM - 1; y++) if (h.hash(y, x + seed) > 0.3) put(c, x, y, '#1c1814');
      }
      if (front && x < W - 1) {
        const odx = dx + 1, ohh = Math.sqrt(Math.max(0, R * R - odx * odx));
        if (Math.abs(odx) <= R && cut(Math.atan2(ohh, odx))) for (let y = Math.floor(cyT + hh); y < cyT + hh + DRUM - 1; y++) if (h.hash(x + seed, y) > 0.3) put(c, x, y, '#1c1814');
      }
    }
    if (!stump) return;
    // a stump has been through a lot: cracks down what is left of the face
    for (let i = 0; i < 5; i++) {
      let x = 3 + Math.floor(h.hash(i, seed + 3) * (W - 6));
      for (let k = 0; k < DRUM - 2; k++) {
        const dx = x + 0.5 - CX, hh = Math.sqrt(Math.max(0, R * R - dx * dx)), y = Math.floor(cyT + hh) + 1 + k;
        if (Math.abs(dx) < R - 1 && !cut(Math.atan2(hh, dx))) put(c, x, y, '#1c1814');
        if (h.hash(k, i + seed) > 0.6) x = clamp(x + (h.hash(i, k + seed) > 0.5 ? 1 : -1), 1, W - 2);
      }
    }
    // and on top, the foot of the tower's wall where it snapped off: a broken ring, whole on the side that stayed
    const Rt = DONJON_W / 2 - 1, cyS = cyT - STUB;
    const ringAt = (x, y, jag) => { const dx = x + 0.5 - CX, dy = y + 0.5 - (cyS + jag), d = Math.hypot(dx, dy); return d <= Rt && d > Rt - 2.5 && !cut(Math.atan2(dy, dx)); };
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - CX;
      if (Math.abs(dx) > Rt) continue;
      const hh = Math.sqrt(Rt * Rt - dx * dx), jag = Math.floor(h.hash(x + seed, 77) * 3), front = !cut(Math.atan2(hh, dx));
      let behind = false;
      for (let yy = -hh; yy < hh; yy += 1) if (!cut(Math.atan2(yy, dx))) { behind = true; break; }
      const lx = dx / Rt, l = lx < -0.55 ? 4 : lx < -0.1 ? 3 : lx < 0.5 ? 2 : 1;
      for (let y = Math.floor(cyS + jag + hh); y < Math.ceil(cyT + hh); y++) {
        const f = y + 0.5 - (cyS + jag + hh);
        if (f < 0) continue;
        if (front) {
          const course = Math.floor((y - cyS) / 3), mortar = Math.floor(y - cyS) % 3 === 2 || (Math.round(dx * 1.4) + course * 3 + 40) % 6 === 0;
          put(c, x, y, Math.abs(dx) > Rt - 1 ? INK : mortar ? STONEP[Math.max(0, l - 2)] : STONEP[l]);
        } else if (behind) put(c, x, y, ROOM.wall[f < 1 ? 2 : (x + y) % 5 === 0 ? 0 : 1]);
      }
      for (let y = Math.floor(cyS + jag - hh); y < Math.ceil(cyS + jag + hh); y++) {
        if (!ringAt(x, y, jag)) continue;
        put(c, x, y, front && !back && h.hash(x, y + seed) > 0.7 ? '#2a2620' : h.hash(x + seed, y) > 0.6 ? STONEP[4] : STONEP[3]);
      }
    }
  });
}
function drawBase(ctx, p, g, h) {
  if (p.state !== 'up') return;
  const x = Math.round(p.x - p.w / 2) + (p.hitT > 0.07 ? 1 : 0), y = Math.round(p.y - p.h / 2) - BASE_LIFT;
  const spr = drumSprite(h, maskOf(p.cuts));
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 6, y + BASE_LIFT + 3, p.w, p.h); ctx.globalAlpha = 1;
  ctx.drawImage(spr, x, y);
  if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}
function drawStump(ctx, p, g, h) {
  const spr = drumSprite(h, maskOf(p.cuts), true, !!p.back);
  const x = Math.round(p.x - 20), y = Math.round(p.y - 20) - BASE_LIFT - (STUB + 2);
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 6, y + STUB + 2 + BASE_LIFT + 3, 40, 40); ctx.globalAlpha = 1;
  ctx.drawImage(spr, x, y);
}
function drawTower(ctx, p, g, h) {
  if (p.state !== 'up') return;
  const top = p.roof === 'cone' ? 8 : 0, st = p.hp / p.maxhp < 0.34 ? 2 : p.hp / p.maxhp < 0.67 ? 1 : 0;
  if (p.donjon) {
    // the keep's tower: narrower, standing on the drum's top (on the ground, in a save from before the drum)
    const S = DONJON_W, L = DONJON_L, spr = towerSprite(h, p, st, S), onDrum = g.cs?.base?.state === 'up';
    const cy = Math.round(p.y - p.h / 2) - (onDrum ? BASE_LIFT : 0) + 20;
    const x = Math.round(p.x - S / 2) + (p.hitT > 0.07 ? 1 : 0), y = Math.round(cy - (top + S / 2 - 0.5 + L));
    ctx.drawImage(spr, x, y);
    if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
    return;
  }
  const L = LIFT.castle_tower, spr = towerSprite(h, p, st);
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
      // (the keep's tower pivots on top of its stump, so its foot stays up there while its top comes down)
      const s = (i / n) * t.len * e, lift = (1 - e) * (16 + i * 0.6) * (i / n) + (t.lift || 0) * (1 - e * i / n);
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
  update, hud, hudWon,
  art: { ground, under, over, props: { castle_wall: drawBlock, castle_keep: drawBlock, castle_gate: drawBlock, castle_tower: drawTower, castle_base: drawBase, castle_stump: drawStump, castle_rubble: drawRubble }, canopy: false, theme: { leash: false } },
};
