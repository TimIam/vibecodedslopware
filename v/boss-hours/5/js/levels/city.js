// Level 6, inside the walls: a tall city that scrolls up and down. You come in at the south gate and the level ends when
// you reach the castle gate in the north. In between: stone houses, shops, pubs and inns along cobbled streets, cut
// into bands by canals with a bridge or two each. Wrecking things feeds Vengeance. Fire is a poor tool here: it pays
// points but no Vengeance, and only the timber roofs, tents and stalls burn at all. Rubble shoved into a canal fills
// it, which makes a shortcut.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const INK = '#14100c';

// ---------------------------------------------------------------------------------------------- the layout

const MW = 320, MH = 900, CANAL_H = 18, BR_W = 36;
export const GOAL_Y = 94;  // the boss's centre north of this and you are at the castle gate
const CANALS = [
  { y: 798, br: [252] },
  { y: 600, br: [144] },
  { y: 402, br: [36, 222] },
  { y: 204, br: [246] },
];
// the three maze bands between the canals: vertical streets through the south row (row1) and the north row (row2)
const BANDS = [
  { yB: 798, row1: [[40, 70], [200, 230]], row2: [[100, 130], [262, 292]] },
  { yB: 600, row1: [[60, 90], [250, 280]], row2: [[160, 190]] },
  { yB: 402, row1: [[130, 160]], row2: [[20, 50], [200, 230]] },
];

// ---------------------------------------------------------------------------------------------- kinds

const STONE = { solid: true, rubble: 'city_rubble', rubbleN: 2, onDown: ruinOf };
const TIMBER = { ...STONE, flammable: true, fireVenge: false, spread: 0.3, crushShare: 0.75, rubbleN: 1 };
export const kinds = {
  city_house: { ...STONE, w: 30, h: 24, hp: 300, value: { pts: 300, venge: 0.16, chaos: 1 } },
  city_chapel: { ...STONE, w: 40, h: 48, hp: 560, rubbleN: 4, value: { pts: 650, venge: 0.32, chaos: 2 } },
  city_shop: { ...TIMBER, w: 26, h: 24, hp: 190, burnTime: 9, value: { pts: 240, venge: 0.14, chaos: 1 } },
  city_pub: { ...TIMBER, w: 30, h: 24, hp: 220, burnTime: 8, spread: 0.4, value: { pts: 280, venge: 0.16, chaos: 1 } },
  city_inn: { ...TIMBER, w: 40, h: 48, hp: 380, burnTime: 12, rubbleN: 3, value: { pts: 450, venge: 0.25, chaos: 2 } },
  city_fountain: { ...STONE, r: 8, w: 0, h: 0, hp: 260, rubbleN: 3, value: { pts: 300, venge: 0.16, chaos: 1 } },
  city_tent: { w: 14, h: 10, hp: 1, flammable: true, fireVenge: false, burnTime: 3, spread: 0.35, crushShare: 0.8, value: { pts: 70, venge: 0.05, chaos: 0.3 } },
  city_stall: { w: 10, h: 6, hp: 1, flammable: true, fireVenge: false, burnTime: 3, spread: 0.3, crushShare: 0.8, value: { pts: 40, venge: 0.03, chaos: 0.2 } },
  city_lamp: { r: 1.5, hp: 1, value: { pts: 15, venge: 0.015, chaos: 0.05 } },
  city_rubble: { r: 3, push: true, fill: 2, value: { pts: 0, venge: 0, chaos: 0 } },
};
export const critters = {
  city_folk: { r: 2, hp: 15, spd: 12, flee: 34, fear: 44, value: { pts: 35, venge: 0.025, chaos: 0.1 } },
};

// a stone building that comes down leaves the stubs of its walls behind, drawn under everything
export function ruinOf(g, p) {
  (g.ruins ||= []).push({ x: p.x, y: p.y, w: p.w || p.r * 2, h: p.h || p.r * 2, round: !p.w, seed: p.seed, kind: p.kind });
}

const BIG = { city_inn: 1, city_chapel: 1 };
function addBuilding(g, P, kind, x0, y0, w, h) {
  const d = P.KINDS[kind], hp = Math.round(d.hp * Math.sqrt((w * h) / (d.w * d.h)));
  const p = P.addProp(g, kind, x0 + w / 2, y0 + h / 2, { w, h, hp, maxhp: hp });
  p.v = p.seed % 3;
  return p;
}

// a run of buildings filling x0..x1 in a strip y0..y1, with alleys between them
function placeRun(g, rng, P, x0, x1, y0, y1) {
  let x = x0;
  while (x1 - x >= 16) {
    let w = 22 + Math.floor(rng() * 18);
    if (x1 - (x + w) < 18) w = x1 - x;
    const r = rng();
    const kind = r < 0.42 ? 'city_house' : r < 0.72 ? 'city_shop' : 'city_pub';
    addBuilding(g, P, kind, x, y0, w, y1 - y0);
    x += w + 2 + Math.floor(rng() * 3);
  }
}

// a little market: rows of tents and stalls, and a lamp or two
function market(g, rng, P, x0, x1, y0, y1, plazas) {
  plazas.push({ x0, y0, x1, y1 });
  for (let y = y0 + 4; y + 10 < y1 - 2; y += 15) for (let x = x0 + 4; x + 14 < x1 - 2; x += 19) {
    const r = rng();
    if (r < 0.55) P.addProp(g, 'city_tent', x + 7, y + 5, { v: Math.floor(rng() * 4) });
    else if (r < 0.8) P.addProp(g, 'city_stall', x + 6, y + 4);
  }
  if (x1 - x0 > 40) P.addProp(g, 'city_lamp', (x0 + x1) / 2 + 3, y1 - 3);
}

// one row of a band, between two streets: either two strips of houses back to back, one deep inn or chapel, or a market
function fillBlock(g, rng, P, x0, x1, y0, y1, plazas) {
  if (x1 - x0 < 14) return;
  const r = rng();
  if (r < 0.12 && x1 - x0 >= 36) { market(g, rng, P, x0, x1, y0, y1, plazas); return; }
  if (r < 0.32 && x1 - x0 >= 40) {
    // a deep building on one end, ordinary ones beside it
    const w = 36 + Math.floor(rng() * 8), left = rng() < 0.5;
    const bx = left ? x0 : x1 - w;
    addBuilding(g, P, rng() < 0.6 ? 'city_inn' : 'city_chapel', bx, y0, w, y1 - y0);
    const a = left ? x0 + w + 3 : x0, b = left ? x1 : x1 - w - 3;
    const mid = Math.round((y0 + y1) / 2);
    placeRun(g, rng, P, a, b, y0, mid - 2); placeRun(g, rng, P, a, b, mid + 2, y1);
    return;
  }
  const mid = Math.round((y0 + y1) / 2);
  placeRun(g, rng, P, x0, x1, y0, mid - 2);
  placeRun(g, rng, P, x0, x1, mid + 2, y1);
}

function fillRow(g, rng, P, y0, y1, streets, plazas) {
  const s = streets.slice().sort((a, b) => a[0] - b[0]);
  let x = 10;
  for (const [a, b] of s) { fillBlock(g, rng, P, x, a, y0, y1, plazas); x = b; }
  fillBlock(g, rng, P, x, 310, y0, y1, plazas);
}

function build(g, rng, P) {
  g.ruins = [];
  const water = P.makeWater(MW, MH);
  const canals = [], plazas = [];
  for (const c of CANALS) {
    P.setWater(water, 0, c.y, MW, c.y + CANAL_H - 1, 1);
    for (const x of c.br) P.setWater(water, x, c.y, x + BR_W - 1, c.y + CANAL_H - 1, 2);
    canals.push({ y0: c.y, y1: c.y + CANAL_H, bridges: c.br.map(x => ({ x0: x, x1: x + BR_W })), cross: c.br.map(x => x + BR_W / 2) });
  }
  g.water = water;

  // the three maze bands: a quay along each canal, two rows of buildings with a street between
  for (const B of BANDS) {
    const r1b = B.yB - 24, r1t = r1b - 52, r2b = r1t - 28, r2t = r2b - 52;
    fillRow(g, rng, P, r1t, r1b, B.row1, plazas);
    fillRow(g, rng, P, r2t, r2b, B.row2, plazas);
    for (let x = 22; x < 310; x += 46 + Math.floor(rng() * 20)) if (!CANALS.some(c => c.y === B.yB && c.br.some(b => x > b - 4 && x < b + BR_W + 4))) P.addProp(g, 'city_lamp', x, B.yB - 3);
    for (let x = 30; x < 300; x += 60 + Math.floor(rng() * 30)) P.addProp(g, 'city_lamp', x, r1t - 26);
  }

  // the castle square: a row of buildings with two ways through, then the square, with the gate to the north
  fillRow(g, rng, P, 136, 176, [[20, 50], [150, 180]], plazas);
  plazas.push({ x0: 66, y0: 76, x1: 254, y1: 132 });
  P.addProp(g, 'city_fountain', 160, 108);
  for (const [x, y] of [[92, 88], [92, 120], [228, 88], [228, 120]]) P.addProp(g, 'city_tent', x, y, { v: Math.floor(rng() * 4) });
  for (const [x, y] of [[112, 104], [208, 104], [136, 126], [184, 126]]) P.addProp(g, 'city_stall', x, y);
  addBuilding(g, P, 'city_inn', 12, 80, 44, 50);
  addBuilding(g, P, 'city_pub', 264, 80, 44, 24);
  addBuilding(g, P, 'city_shop', 264, 106, 44, 24);
  for (const x of [66, 254]) P.addProp(g, 'city_lamp', x, 133);

  // inside the south gate: a market, and houses up against the walls
  plazas.push({ x0: 60, y0: 822, x1: 260, y1: 860 });
  market(g, rng, P, 60, 140, 822, 856, plazas);
  market(g, rng, P, 180, 260, 822, 856, plazas);
  placeRun(g, rng, P, 10, 50, 824, 848);
  placeRun(g, rng, P, 270, 310, 824, 848);
  for (const x of [60, 140, 180, 260]) P.addProp(g, 'city_lamp', x, 862);

  // townsfolk, out on the streets
  const foots = g.props.filter(p => p.w && P.KINDS[p.kind].solid).map(p => ({ x0: p.x - p.w / 2, y0: p.y - p.h / 2, x1: p.x + p.w / 2, y1: p.y + p.h / 2 }));
  let n = 0;
  for (let tries = 0; tries < 2000 && n < 34; tries++) {
    const x = 14 + rng() * 292, y = 90 + rng() * 760;
    if (foots.some(f => x > f.x0 - 3 && x < f.x1 + 3 && y > f.y0 - 3 && y < f.y1 + 3) || P.isWater(g, x, y) || P.isWater(g, x, y + 6) || P.isWater(g, x, y - 6)) continue;
    P.addCritter(g, 'city_folk', x, y, { col: Math.floor(rng() * 6) });
    n++;
  }
  return { w: MW, h: MH, scroll: 'y', start: { x: 160, y: 866, face: -Math.PI / 2 }, canals, plazas, foots };
}

// ---------------------------------------------------------------------------------------------- heroes and canals

// Heroes walk straight at what they want. When a canal is in the way, they slide along the bank to the nearest
// crossing (a bridge, or a run of filled cells) instead of standing in a puddle of their own confusion.
export function crossings(g, c) {
  const w = g.water, cs = w.cs, r0 = Math.floor(c.y0 / cs), r1 = Math.floor((c.y1 - 1) / cs), out = [];
  let run = 0;
  for (let col = 0; col <= w.cols; col++) {
    let ok = col < w.cols;
    if (ok) for (let r = r0; r <= r1; r++) if (w.a[r * w.cols + col] === 1) { ok = false; break; }
    if (ok) run++;
    else { if (run >= 2) out.push({ x: (col - run / 2) * cs, half: run * cs / 2 }); run = 0; }
  }
  return out;
}
export function steerHeroes(g, dt, barriers) {
  if (!barriers?.length || !g.water) return;
  if (!g.crossT || g.t - g.crossT > 0.5) { g.crossT = g.t; for (const c of barriers) c.open = crossings(g, c); }
  const b = g.boss;
  for (const u of g.units) {
    if (u.dead || u.gone || u.role === 'rider' || u.stun > 0) continue;
    const t = (u.state === 'flee' || u.state === 'leave') && u.exit ? u.exit : !u.party?.engaged && u.stage ? u.stage : b;
    for (const c of barriers) {
      const mid = (c.y0 + c.y1) / 2;
      if (u.y < c.y0 - 14 || u.y > c.y1 + 14 || (u.y < mid) === (t.y < mid) || !c.open?.length) continue;
      let best = null;
      for (const o of c.open) if (!best || Math.abs(o.x - u.x) < Math.abs(best.x - u.x)) best = o;
      const dx = best.x - u.x;
      if (Math.abs(dx) > best.half - 3) u.x += Math.sign(dx) * Math.min(Math.abs(dx), 46 * dt);
      else u.y += Math.sign(t.y - u.y) * 14 * dt;
    }
  }
}

// ---------------------------------------------------------------------------------------------- level logic

function update(g, dt, api) {
  steerHeroes(g, dt, g.map.canals);
  if (!g.clear && !g.boss.dead && g.boss.y < GOAL_Y) api.endLevel(g, 'AT THE CASTLE GATES', 'THE HOARD OPENS IN A MOMENT. THEN THE CASTLE.');
}
const hud = g => `NORTH TO THE CASTLE  ${Math.max(0, Math.round((g.boss.y - GOAL_Y) / 4))} M`;

// ---------------------------------------------------------------------------------------------- palettes

export const STONEP = ['#3a3a35', '#55564f', '#6b6c63', '#8f8f84', '#aeac9b', '#c8c5b2'];
const ROOF = {
  slate: ['#1e2630', '#2c3744', '#3c4a59', '#4f6072', '#66798c', '#8496a8'],
  tile: ['#3a1610', '#5a2218', '#7a3020', '#9a4028', '#b85834', '#d47a4c'],
  shingle: ['#24180f', '#3a2716', '#4e341e', '#644328', '#7c5634', '#966a42'],
  thatch: ['#3e3016', '#5c4a22', '#7a642e', '#98803a', '#b49c4c', '#d0ba66'],
};
export const ROOF_PAL = ROOF;
const PLASTER = ['#7a6a4a', '#a8966e', '#c8b88e', '#e0d2aa'];
const BEAM = '#3e2716';
const GLASS = '#1a222c', LIT = '#e8b850';
const TENT = [['#a8302a', '#e2d6b8'], ['#2e5a9a', '#e2d6b8'], ['#3e7a3a', '#e8dcb8'], ['#c8962a', '#6a2a1e']];
const FOLK = ['#7a3a2a', '#3a5a7a', '#5a6a2a', '#8a6a3a', '#6a3a6a', '#9a8a6a'];

function put(c, x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

// ---------------------------------------------------------------------------------------------- building sprites

// a pitched roof seen from above and a little south. Most ridges run east-west (the north slope catches the light);
// some run north-south (the west slope does). Courses of tiles or slates run along the eaves.
function paintRoof(c, x0, y0, w, rh, style, seed, hash, ns) {
  const pal = ROOF[style], ridge = ns ? x0 + Math.floor(w / 2) : y0 + Math.max(2, Math.floor(rh * 0.42));
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + w; x++) {
    const q = ns ? x : y, lit = q < ridge, d = lit ? ridge - q : q - ridge;
    const span = Math.max(1, lit ? ridge - (ns ? x0 : y0) : (ns ? x0 + w : y0 + rh) - ridge);
    let l = lit ? 3.6 - d / span * 0.8 : 1.9 - d / span * 0.8;
    l += ns ? (y0 + rh / 2 - y) / rh * 0.5 : (x0 + w / 2 - x) / w * 0.5;
    const along = ns ? y : x;
    if (style === 'thatch') {
      l += (hash(along * 3 + seed, Math.floor(d / 2) + seed) - 0.5) * 1.1 + (d % 3 === 2 ? -0.5 : 0);
    } else {
      const course = Math.floor(d / 2), edge = d % 2 === 0 && d > 0;
      if (edge) l -= 0.8;
      const per = style === 'slate' ? 4 : 3;
      if (!edge && (along + course * 2 + seed) % per === 0) l -= 0.5;
      l += (hash(x + seed, y * 3) - 0.5) * 0.35;
    }
    if (q === ridge) l = 5;
    else if (q === ridge + 1) l = Math.min(l, 1);
    put(c, x, y, pal[clamp(Math.round(l), 0, 5)]);
  }
  rect(c, x0, y0 + rh - 1, w, 1, pal[0]);   // the eave
  return ridge;
}

function chimney(c, x, y) {
  rect(c, x - 1, y - 1, 5, 6, INK);
  rect(c, x, y, 3, 4, STONEP[3]); put(c, x, y, STONEP[5]); put(c, x + 2, y + 3, STONEP[1]);
  rect(c, x, y, 3, 1, STONEP[4]); put(c, x + 1, y, '#1a1612');
}

// the street front: stone or plaster and timber, windows, a door, and whatever hangs off the front
function paintFront(c, kind, w, h, F, seed, hash) {
  const y0 = h - F, plaster = kind !== 'city_house' && kind !== 'city_chapel';
  for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
    if (plaster) {
      const beam = x % 6 === 2 || y === y0 + 3 || x === 1 || x === w - 2;
      put(c, x, y, beam ? BEAM : PLASTER[clamp(2 + (x < w / 2 ? 0 : -1) + (hash(x + seed, y) > 0.8 ? -1 : 0), 0, 3)]);
    } else {
      const course = Math.floor((y - y0) / 2), mortar = (y - y0) % 2 === 1 && hash(x, y + seed) > 0.25 || (x + course * 3 + seed) % 5 === 0;
      put(c, x, y, mortar ? STONEP[1] : STONEP[clamp(3 + (hash(x * 7 + seed, course) > 0.7 ? 1 : 0) - (x > w * 0.7 ? 1 : 0), 0, 5)]);
    }
  }
  rect(c, 0, y0, w, 1, '#1c1610');   // shadow under the eaves
  const door = 3 + Math.floor(hash(seed, 5) * Math.max(1, w - 9));
  for (let x = 3; x < w - 3; x += 6) {
    if (x + 2 > door - 1 && x < door + 4) continue;
    rect(c, x, y0 + 2, 2, 2, GLASS);
    if (hash(x, seed) > 0.55) put(c, x, y0 + 2, LIT);
    rect(c, x, y0 + 4, 2, 1, plaster ? PLASTER[3] : STONEP[5]);
  }
  rect(c, door - 1, y0 + 1, 5, F - 2, INK);
  rect(c, door, y0 + 2, 3, F - 3, kind === 'city_chapel' ? '#4a2a18' : '#5a3a22');
  put(c, door + 2, y0 + 4, '#c8a050');
  if (kind === 'city_shop') {
    // a striped awning over the window by the door
    const ax = door > w / 2 ? door - 9 : door + 4, cols = TENT[seed % 4];
    for (let x = 0; x < 7; x++) { put(c, ax + x, y0 + 1, cols[(x >> 1) & 1]); put(c, ax + x, y0 + 2, x & 1 ? INK : cols[(x >> 1) & 1]); }
  }
  if (kind === 'city_pub' || kind === 'city_inn') {
    // a hanging sign on a bracket
    const sx = door > w / 2 ? door - 5 : door + 5;
    rect(c, sx - 1, y0 + 1, 5, 1, INK);
    rect(c, sx, y0 + 2, 3, 3, INK); rect(c, sx, y0 + 2, 3, 2, kind === 'city_pub' ? '#c8962a' : '#8a2a22'); put(c, sx + 1, y0 + 2, '#f4d070');
    if (kind === 'city_pub') { put(c, door - 2, h - 2, '#6a4224'); put(c, door + 4, h - 2, '#6a4224'); }
  }
  if (kind === 'city_chapel') {
    // a round window over the door
    const rx = door + 1, ry = y0 + 1;
    put(c, rx, ry, '#c8962a'); put(c, rx - 1, ry, '#3a6ab0'); put(c, rx + 1, ry, '#a83a3a');
  }
  rect(c, 0, h - 1, w, 1, INK);
}

// cracks and holes, baked into the sprite for the damaged states
function paintDamage(c, w, h, F, stage, seed, hash, style) {
  if (!stage) return;
  const roofH = h - F, n = stage === 1 ? 2 : 5;
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor(hash(i, seed) * (w - 6)), y = 2 + Math.floor(hash(seed, i * 3) * (roofH - 4));
    rect(c, x, y, 2, 1, '#120c08'); put(c, x + 1, y + 1, ROOF[style][1]);
  }
  for (let i = 0; i < stage * 2; i++) {
    let x = 1 + Math.floor(hash(i * 5, seed + 3) * (w - 3)), y = h - F + 1;
    for (let k = 0; k < 4; k++) { put(c, x, y + k, '#1c1610'); x += hash(k, i + seed) > 0.5 ? 1 : 0; }
  }
  if (stage === 2) {
    // the roof has caved in: rafters over a dark hole
    const hw = Math.min(9, w - 6), hh = Math.min(6, roofH - 3), hx = 3 + Math.floor(hash(seed, 9) * (w - hw - 6)), hy = 2 + Math.floor(hash(9, seed) * (roofH - hh - 3));
    rect(c, hx, hy, hw, hh, '#0e0a07');
    for (let x = hx + 1; x < hx + hw; x += 3) rect(c, x, hy, 1, hh, '#5a3a22');
    rect(c, hx, hy + hh, hw, 1, ROOF[style][0]);
  }
}

function buildingSprite(h, p, stage) {
  const { w: W, h: Hh } = p, kind = p.kind, v = p.v || 0;
  return h.sprite(`${kind}|${W}|${Hh}|${v}|${stage}`, W, Hh, c => {
    const seed = p.seed % 97, F = BIG[kind] ? 9 : 7;
    const style = kind === 'city_house' ? (v === 2 ? 'tile' : 'slate') : kind === 'city_chapel' ? 'slate' : kind === 'city_pub' ? 'thatch' : kind === 'city_inn' ? 'tile' : 'shingle';
    paintRoof(c, 0, 0, W, Hh - F, style, seed, h.hash, !BIG[kind] && v === 1 && W < 34);
    paintFront(c, kind, W, Hh, F, seed, h.hash);
    if (kind === 'city_house' || kind === 'city_inn') {
      chimney(c, 3 + Math.floor(h.hash(seed, 1) * (W - 9)), 1);
      if (kind === 'city_inn') chimney(c, W - 7, 2);
    }
    if (kind === 'city_chapel') {
      // a square bell tower at the west end with a pyramid roof and a gold finial
      const tx = 3, ty = 2, S = 14;
      rect(c, tx - 1, ty - 1, S + 2, S + 2, INK);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - (S - 1) / 2, dy = y - (S - 1) / 2, face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 4 : 1) : (dy < 0 ? 5 : 2);
        put(c, tx + x, ty + y, Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6 ? ROOF.slate[0] : ROOF.slate[face]);
      }
      put(c, tx + S / 2 - 1, ty + S / 2 - 1, '#ffd75a'); put(c, tx + S / 2, ty + S / 2 - 1, '#c8962a');
    }
    paintDamage(c, W, Hh, F, stage, seed, h.hash, style);
    // the ink outline
    rect(c, 0, 0, W, 1, INK); rect(c, 0, 0, 1, Hh, INK); rect(c, W - 1, 0, 1, Hh, INK);
  });
}

// a timber building after it has come down: beams, broken roof, some stone, all lying about the plot
function wreckSprite(h, p) {
  const W = p.w, Hh = p.h, kind = p.kind;
  return h.sprite(`wreck|${kind}|${W}|${Hh}|${p.v || 0}`, W, Hh, c => {
    const seed = p.seed % 89, style = kind === 'city_pub' ? 'thatch' : kind === 'city_inn' ? 'tile' : 'shingle', pal = ROOF[style];
    // patches of fallen roof
    for (let i = 0; i < Math.max(4, W * Hh / 70); i++) {
      const pw = 3 + Math.floor(h.hash(i, seed) * 6), ph = 2 + Math.floor(h.hash(seed, i) * 3);
      const x = Math.floor(h.hash(i * 3, seed + 1) * (W - pw)), y = Math.floor(h.hash(seed + 2, i * 3) * (Hh - ph));
      rect(c, x, y, pw, ph, INK);
      for (let yy = 1; yy < ph; yy++) for (let xx = 1; xx < pw - 1; xx++) put(c, x + xx, y + yy, pal[clamp(2 + (yy === 1 ? 1 : 0) + Math.round((h.hash(xx + i, yy) - 0.5) * 1.4), 0, 5)]);
    }
    // beams at angles
    for (let i = 0; i < Math.max(3, W / 6); i++) {
      const a = h.hash(i, seed + 7) * Math.PI, L = 6 + h.hash(seed, i + 7) * 10;
      let x = 2 + h.hash(i * 7, seed) * (W - 4), y = 2 + h.hash(seed, i * 7) * (Hh - 4);
      for (let k = 0; k < L; k++) {
        const X = Math.round(x + Math.cos(a) * k), Y = Math.round(y + Math.sin(a) * k);
        if (X < 0 || Y < 0 || X >= W || Y >= Hh - 1) break;
        put(c, X, Y + 1, INK); put(c, X, Y, k % 4 ? '#6a4628' : '#84603a');
      }
    }
    for (let i = 0; i < W * Hh / 30; i++) put(c, Math.floor(h.hash(i, seed + 11) * W), Math.floor(h.hash(seed + 11, i) * Hh), h.hash(i, i) > 0.5 ? PLASTER[2] : STONEP[3]);
  });
}

// the stubs of a stone building's walls and the mess inside them; round ones (fountains) get a broken ring
export function ruinSprite(h, r) {
  const W = Math.round(r.w), Hh = Math.round(r.h), seed = r.seed % 83;
  return h.sprite(`ruin|${W}|${Hh}|${r.round ? 1 : 0}|${seed % 4}`, W + 2, Hh + 2, c => {
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const e = r.round ? Math.abs(Math.hypot(x - W / 2 + 0.5, y - Hh / 2 + 0.5) - W / 2 + 1.5) < 1.2 : x < 2 || y < 2 || x >= W - 2 || y >= Hh - 2;
      const hh = h.hash(x + seed * 7, y + seed);
      if (e) {
        if (hh < 0.3) continue;   // gaps where the wall came apart
        put(c, x + 1, y + 2, INK);
        put(c, x + 1, y + 1, hh > 0.8 ? STONEP[4] : hh > 0.55 ? STONEP[3] : STONEP[2]);
      } else if (hh > 0.86) put(c, x + 1, y + 1, hh > 0.95 ? STONEP[3] : STONEP[1]);
      else if (hh < 0.1) put(c, x + 1, y + 1, '#4a3f30');
    }
  });
}

// a heap of broken stone you can shove about
export function rubbleSprite(h, v, big) {
  const S = big ? 9 : 7;
  return h.sprite(`rubble|${v}|${big ? 1 : 0}`, S + 2, S, c => {
    const pts = [];
    for (let i = 0; i < (big ? 7 : 5); i++) pts.push([1 + Math.floor(h.hash(i, v * 13) * (S - 3)), 1 + Math.floor(h.hash(v * 13, i) * (S - 4)), 1 + (h.hash(i + v, 3) > 0.5 ? 1 : 0)]);
    pts.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s] of pts) rect(c, x, y, s + 2, s + 2, INK);
    for (const [x, y, s] of pts) { rect(c, x + 1, y + 1, s, s, STONEP[2 + (x + y + v) % 2]); put(c, x + 1, y + 1, STONEP[4]); }
  });
}

// ---------------------------------------------------------------------------------------------- drawing props

function shadowRect(ctx, x, y, w, h) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 3, y + 2, w, h); ctx.globalAlpha = 1; }
function burnTint(ctx, spr, x, y, p, h) {
  const d = kinds[p.kind];
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / (d?.burnTime || 8) * 0.95); ctx.drawImage(h.tinted(spr, '#1a120c'), x, y); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}
export const stageOf = p => p.hp / p.maxhp < 0.34 ? 2 : p.hp / p.maxhp < 0.67 ? 1 : 0;

function drawBuilding(ctx, p, g, h) {
  const x = Math.round(p.x - p.w / 2) + (p.hitT > 0.07 ? 1 : 0), y = Math.round(p.y - p.h / 2);
  if (p.state === 'down') { const s = wreckSprite(h, p); ctx.drawImage(s, x, y); burnTint(ctx, s, x, y, p, h); return; }
  shadowRect(ctx, x, y, p.w, p.h);
  const s = buildingSprite(h, p, stageOf(p));
  ctx.drawImage(s, x, y);
  burnTint(ctx, s, x, y, p, h);
}

function drawTent(ctx, p, g, h) {
  const x = Math.round(p.x - 7), y = Math.round(p.y - 5), v = (p.v || 0) % 4, cols = TENT[v];
  if (p.state === 'down') {
    const s = h.sprite(`tentdown|${v}|${p.seed % 3}`, 16, 9, c => {
      for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 16; xx++) {
        const r = Math.hypot((xx - 8) / 8, (yy - 4) / 4) + (h.hash(xx + p.seed % 3 * 9, yy) - 0.5) * 0.5;
        if (r > 1) continue;
        put(c, xx, yy, r > 0.85 ? INK : (xx >> 1) & 1 ? cols[1] : cols[0]);
      }
      put(c, 2, 6, '#5a3a22'); put(c, 3, 6, '#5a3a22'); put(c, 12, 2, '#5a3a22'); put(c, 13, 1, '#5a3a22');
    });
    ctx.drawImage(s, x - 1, y + 1); burnTint(ctx, s, x - 1, y + 1, p, h);
    return;
  }
  const s = h.sprite(`tent|${v}`, 14, 10, c => {
    for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 14; xx++) {
      const stripe = ((xx + 1) >> 1) & 1, north = yy < 4;
      let col = cols[stripe];
      if (!north && yy < 8) col = shade(col, -28); else if (yy >= 8) col = shade(col, -50);
      if (yy === 3) col = shade(cols[stripe], 26);
      if (xx === 0 || xx === 13 || yy === 0) col = INK;
      put(c, xx, yy, col);
    }
    for (let xx = 1; xx < 13; xx += 2) put(c, xx, 9, INK);   // the scalloped valance
    rect(c, 6, 7, 2, 2, '#1a120c');
  });
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#05080a'; ctx.fillRect(x + 2, y + 2, 14, 10); ctx.globalAlpha = 1;
  ctx.drawImage(s, x, y); burnTint(ctx, s, x, y, p, h);
}

function drawStall(ctx, p, g, h) {
  const x = Math.round(p.x - 5), y = Math.round(p.y - 3);
  if (p.state === 'down') {
    const s = h.sprite(`stalldown|${p.seed % 3}`, 12, 7, c => {
      for (let i = 0; i < 6; i++) { const xx = Math.floor(h.hash(i, p.seed % 3) * 9), yy = Math.floor(h.hash(p.seed % 3, i) * 5); rect(c, xx, yy + 1, 3, 1, INK); rect(c, xx, yy, 3, 1, i & 1 ? '#8a6a3a' : '#a07a44'); }
      put(c, 5, 3, '#c83a2a'); put(c, 8, 5, '#e8c040');
    });
    ctx.drawImage(s, x - 1, y); burnTint(ctx, s, x - 1, y, p, h);
    return;
  }
  const s = h.sprite('stall', 10, 7, c => {
    // two crates and a barrel, with apples on top
    rect(c, 0, 1, 5, 5, INK); rect(c, 1, 2, 3, 3, '#a07a44'); rect(c, 1, 2, 3, 1, '#c09858'); put(c, 2, 3, '#6a4a28');
    rect(c, 5, 0, 5, 6, INK); rect(c, 6, 1, 3, 4, '#7a4e2a'); rect(c, 6, 1, 3, 1, '#94643a'); rect(c, 6, 3, 3, 1, '#3a2414');
    put(c, 2, 2, '#c83a2a'); put(c, 3, 2, '#e04a2a'); put(c, 7, 1, '#58b84a');
    rect(c, 0, 6, 10, 1, 'rgba(5,8,10,.35)');
  });
  ctx.drawImage(s, x, y); burnTint(ctx, s, x, y, p, h);
}

function drawLamp(ctx, p, g) {
  const x = Math.round(p.x), y = Math.round(p.y);
  ctx.fillStyle = 'rgba(5,8,10,.35)'; ctx.fillRect(x, y, 3, 1);
  ctx.fillStyle = INK; ctx.fillRect(x, y - 6, 1, 6); ctx.fillRect(x - 1, y - 8, 3, 3);
  ctx.fillStyle = (Math.floor(g.t * 3 + p.seed) % 7) ? '#f4c860' : '#e8a040'; ctx.fillRect(x, y - 7, 1, 1);
  ctx.globalAlpha = 0.12; ctx.fillStyle = '#ffd070'; ctx.fillRect(x - 3, y - 9, 7, 6); ctx.globalAlpha = 1;
}

function drawFountain(ctx, p, g, h) {
  const R = 9, x = Math.round(p.x) - R, y = Math.round(p.y) - R;
  const s = h.sprite(`fountain|${stageOf(p)}`, R * 2, R * 2, c => {
    for (let yy = 0; yy < R * 2; yy++) for (let xx = 0; xx < R * 2; xx++) {
      const d = Math.hypot(xx - R + 0.5, yy - R + 0.5);
      if (d > R) continue;
      const l = (-(xx - R) - (yy - R)) / R;
      if (d > R - 1) put(c, xx, yy, INK);
      else if (d > R - 3) put(c, xx, yy, STONEP[clamp(3 + Math.round(l * 1.2), 1, 5)]);
      else put(c, xx, yy, d < 2.5 ? STONEP[4] : (xx + yy) & 1 ? '#2e5a72' : '#346680');
    }
    put(c, R - 1, R - 1, STONEP[5]);
    if (stageOf(p) > 0) { rect(c, 2, R + 2, 3, 1, INK); rect(c, R + 3, 3, 1, 3, INK); }
  });
  shadowRect(ctx, x, y, R * 2 - 3, R * 2 - 3);
  ctx.drawImage(s, x, y);
  // the spout
  const fr = Math.floor(g.t * 6);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i & 1 ? '#bfe8ff' : '#7fc0e0'; ctx.fillRect(x + R - 1 + ((h.hash(i, fr) * 5) | 0) - 2, y + R - 3 + ((h.hash(fr, i) * 4) | 0), 1, 1); }
  burnTint(ctx, s, x, y, p, h);
}

function drawRubble(ctx, p, g, h) {
  const s = rubbleSprite(h, p.seed % 4, false);
  ctx.drawImage(s, Math.round(p.x) - 4, Math.round(p.y) - 3);
}

function drawFolk(ctx, c, g) {
  const x = Math.round(c.x), y = Math.round(c.y), run = c.moving ? Math.floor(c.walk * 2) % 2 : 0;
  const col = c.hitT > 0 ? '#ffffff' : FOLK[(c.col || 0) % FOLK.length];
  ctx.fillStyle = 'rgba(8,10,6,.4)'; ctx.fillRect(x - 1, y + 1, 3, 1);
  ctx.fillStyle = INK; ctx.fillRect(x - 1 + run, y, 1, 1); ctx.fillRect(x + 1 - run, y, 1, 1);
  ctx.fillStyle = col; ctx.fillRect(x - 1, y - 2, 3, 2);
  ctx.fillStyle = '#e8b48a'; ctx.fillRect(x, y - 3, 1, 1);
  if (c.scared > 0 || c.bolting) { ctx.fillStyle = '#e8b48a'; ctx.fillRect(x - 1, y - 4 + run, 1, 1); ctx.fillRect(x + 1, y - 4 + (1 - run), 1, 1); }
}
function drawFolkBody(ctx, c) {
  const x = Math.round(c.x), y = Math.round(c.y);
  ctx.fillStyle = '#7a1a14'; ctx.fillRect(x - 2, y, 5, 1);
  ctx.fillStyle = FOLK[(c.x * 7 | 0) % FOLK.length]; ctx.fillRect(x - 1, y - 1, 3, 1);
  ctx.fillStyle = '#e8b48a'; ctx.fillRect(x + 2, y - 1, 1, 1);
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => clamp(v + k, 0, 255);
  return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

// ---------------------------------------------------------------------------------------------- the ground

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const COBBLE = ['#3c3933', '#48443c', '#534e45', '#5e584d', '#6a6356'].map(rgb);
const FLAG = ['#4e4a42', '#5e594f', '#6a6559', '#777164', '#847d6e'].map(rgb);
const MORTAR = rgb('#33302a'), FOUND = ['#2a2620', '#322d26', '#3a342b'].map(rgb), KERB = ['#3a3833', '#6e6a5e', '#8d8878', '#a8a290'].map(rgb);

// paints a ground picture pixel by pixel into image data: zone 0 cobbles, 1 flagstones, 2 a building's plot, 3 kerb
export function paintGround(ctx, m, h, zone) {
  const img = ctx.createImageData(m.w, m.h), d = img.data, { hash, vnoise } = h;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const z = zone[y * m.w + x], grime = vnoise(x / 22, y / 22) < 0.32 ? -1 : 0;
    let c;
    if (z === 1) {
      const sx = Math.floor((x + (Math.floor(y / 7) % 2) * 4) / 8), sy = Math.floor(y / 7), lx = (x + (sy % 2) * 4) % 8, ly = y % 7;
      if (lx === 0 || ly === 0) c = MORTAR;
      else c = FLAG[clamp(2 + Math.floor((hash(sx, sy) - 0.5) * 2.5) + (lx === 1 || ly === 1 ? 1 : 0) + grime, 0, 4)];
    } else if (z === 2) c = FOUND[Math.floor(hash(x, y) * 3)];
    else if (z === 3) {
      const ly = zone.kerbRow?.[y] ?? 1;
      c = (x + Math.floor(y / 3) * 3) % 7 === 0 ? KERB[0] : KERB[ly];
    } else {
      const row = Math.floor(y / 3), lx = (x + row * 2) % 5, ly = y % 3, sx = Math.floor((x + row * 2) / 5);
      if (lx === 0 || ly === 0) c = hash(x * 3, y * 5) < 0.12 ? COBBLE[1] : MORTAR;
      else c = COBBLE[clamp(1 + Math.floor(hash(sx, row) * 2.6) + (lx === 1 && ly === 1 ? 1 : 0) - (lx === 4 && ly === 2 ? 1 : 0) + grime, 0, 4)];
    }
    const i = (y * m.w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
export function fillZone(zone, W, x0, y0, x1, y1, v) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(zone.length / W, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) zone[y * W + x] = v;
}

// a crenellated stone wall top running north-south down the edge of the map
export function sideWall(ctx, x0, w, y0, y1, h, east) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x0 + w; x++) {
    const merlon = east ? x === x0 : x === x0 + w - 1;
    const lit = east ? x === x0 + 1 : x === x0;
    let col = STONEP[lit ? 4 : 3];
    if ((y + Math.floor((x - x0) / 3) * 2) % 4 === 0) col = STONEP[2];
    if (merlon) col = y % 6 < 3 ? STONEP[4] : INK;
    put(ctx, x, y, col);
  }
  rect(ctx, east ? x0 - 2 : x0 + w, y0, 2, y1 - y0, 'rgba(5,8,10,.35)');
}

function ground(ctx, m, h) {
  const zone = new Uint8Array(m.w * m.h);
  for (const f of m.foots) fillZone(zone, m.w, f.x0 - 1, f.y0 - 1, f.x1 + 1, f.y1 + 1, 2);
  for (const p of m.plazas) fillZone(zone, m.w, p.x0, p.y0, p.x1, p.y1, 1);
  zone.kerbRow = new Uint8Array(m.h);
  for (const c of m.canals) {
    fillZone(zone, m.w, 0, c.y0 - 3, m.w, c.y0, 3); fillZone(zone, m.w, 0, c.y1, m.w, c.y1 + 3, 3);
    zone.kerbRow[c.y0 - 3] = 3; zone.kerbRow[c.y0 - 2] = 2; zone.kerbRow[c.y0 - 1] = 1;
    zone.kerbRow[c.y1] = 2; zone.kerbRow[c.y1 + 1] = 2; zone.kerbRow[c.y1 + 2] = 1;
  }
  paintGround(ctx, m, h, zone);
  // gutters and drains, a few puddles and some straw
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(h.hash(i, 71) * m.w), y = Math.floor(h.hash(71, i) * m.h);
    if (zone[y * m.w + x] > 1) continue;
    const r = h.hash(i, i);
    if (r < 0.25) { rect(ctx, x, y, 3, 2, '#2a3a44'); put(ctx, x + 1, y, '#5f7e8e'); }
    else if (r < 0.5) { put(ctx, x, y, '#a88c44'); put(ctx, x + 1, y + 1, '#c4a85a'); }
    else if (r < 0.6) { rect(ctx, x, y, 3, 3, INK); put(ctx, x + 1, y + 1, '#55564f'); }
  }
  sideWall(ctx, 0, 6, 0, m.h, h, false);
  sideWall(ctx, m.w - 6, 6, 0, m.h, h, true);
  castleFront(ctx, m, h);
  southGate(ctx, m, h);
}

// the castle's outer wall and gatehouse across the top of the city: the walk-top with its merlons, then the face
export function castleFront(ctx, m, h) {
  const face = 30, bot = 74;
  for (let y = 0; y < bot; y++) for (let x = 0; x < m.w; x++) {
    let col;
    if (y < face) col = (x * 3 + Math.floor(y / 3) * 7) % 11 === 0 ? STONEP[2] : STONEP[y < face - 8 ? 3 : 4];
    else {
      const course = Math.floor((y - face) / 4), mortar = (y - face) % 4 === 3 || (x + course * 5) % 10 === 0;
      col = mortar ? STONEP[1] : STONEP[clamp(2 + (h.hash(Math.floor((x + course * 5) / 10), course) > 0.65 ? 1 : 0) - (y > bot - 8 ? 1 : 0) + (y < face + 3 ? 1 : 0), 0, 5)];
    }
    put(ctx, x, y, col);
  }
  // the parapet: merlons along the outer edge, a shadow along the walk
  rect(ctx, 0, face - 8, m.w, 1, STONEP[1]);
  for (let x = 0; x < m.w; x += 7) { rect(ctx, x, face - 6, 5, 6, INK); rect(ctx, x, face - 6, 4, 5, STONEP[4]); rect(ctx, x, face - 6, 4, 1, STONEP[5]); }
  rect(ctx, 0, face, m.w, 1, INK);
  for (let x = 12; x < m.w; x += 24) if (x < 100 || x > 220) { rect(ctx, x, face + 14, 2, 6, INK); }   // arrow slits
  rect(ctx, 0, bot, m.w, 1, INK);
  rect(ctx, 0, bot + 1, m.w, 4, 'rgba(5,8,10,.4)');
  // two round gate towers standing proud of the wall
  for (const cx of [114, 206]) {
    const R = 17, cy = 20;
    for (let y = 0; y < bot + 8; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const X = cx + x, inTop = Math.hypot(x, (y - cy) * 1.2) <= R, inBody = y >= cy && Math.abs(x) <= R && y < bot + 6;
      if (!inTop && !inBody) {
        if (Math.hypot(x, (y - cy) * 1.2) <= R + 1.2 || (y >= cy && Math.abs(x) === R + 1 && y < bot + 7) || (y === bot + 6 && Math.abs(x) <= R)) put(ctx, X, y, INK);
        continue;
      }
      let col;
      if (inTop) {
        const d = Math.hypot(x, (y - cy) * 1.2), rim = d > R - 3;
        col = rim ? (Math.floor((Math.atan2(y - cy, x) + 4) * 5) % 2 ? STONEP[5] : STONEP[3]) : (h.hash(X, y) > 0.8 ? STONEP[1] : STONEP[2]);
        if (rim && d > R - 1) col = INK;
      } else {
        const l = x < -R * 0.5 ? 4 : x < R * 0.3 ? 3 : x < R * 0.75 ? 2 : 1, course = Math.floor(y / 4);
        col = y % 4 === 3 || (x + course * 3 + 40) % 8 === 0 ? STONEP[Math.max(0, l - 2)] : STONEP[l];
      }
      put(ctx, X, y, col);
    }
    // a long red banner with a gold crown, and a lit window
    rect(ctx, cx - 5, 40, 11, 22, INK); rect(ctx, cx - 4, 40, 9, 20, '#8a1e18'); rect(ctx, cx - 4, 40, 9, 1, '#c83a2a'); rect(ctx, cx - 4, 40, 2, 20, '#a82a20');
    rect(ctx, cx - 2, 46, 5, 1, '#ffd75a'); put(ctx, cx - 2, 45, '#ffd75a'); put(ctx, cx, 45, '#ffd75a'); put(ctx, cx + 2, 45, '#ffd75a'); rect(ctx, cx - 2, 47, 5, 1, '#c8962a');
    rect(ctx, cx - 4, 60, 2, 2, '#8a1e18'); rect(ctx, cx + 3, 60, 2, 2, '#8a1e18');
    rect(ctx, cx - 1, 66, 3, 5, INK); put(ctx, cx, 68, '#e8b850');
  }
  // the gate: a deep arch with the portcullis half up and torches either side
  const gx0 = 134, gx1 = 186, gy = 38;
  rect(ctx, gx0 - 2, gy - 2, gx1 - gx0 + 4, bot - gy + 3, INK);
  for (let y = gy; y < bot; y++) for (let x = gx0; x < gx1; x++) {
    const ax = x - (gx0 + gx1 - 1) / 2, top = gy + 12 - Math.sqrt(Math.max(0, 26 * 26 - ax * ax)) * 0.46;
    if (y < top) { put(ctx, x, y, (x + y) % 5 === 0 ? STONEP[2] : STONEP[3]); continue; }
    put(ctx, x, y, y < top + 2 ? STONEP[1] : y < 54 ? '#0c0a08' : '#14110d');
  }
  for (let x = gx0 + 3; x < gx1 - 2; x += 5) { rect(ctx, x, gy + 4, 1, 14, '#3e3e38'); put(ctx, x, gy + 18, '#6b6c63'); }
  rect(ctx, gx0 + 2, gy + 9, gx1 - gx0 - 4, 1, '#3e3e38');
  for (const tx of [gx0 - 6, gx1 + 4]) { rect(ctx, tx, 56, 3, 4, INK); put(ctx, tx + 1, 54, '#ffa22b'); put(ctx, tx + 1, 55, '#fff07a'); put(ctx, tx + 1, 53, '#d64a18'); }
}

// the south gate you came in by, at the very bottom
function southGate(ctx, m, h) {
  const y0 = m.h - 14;
  for (let y = y0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (x > 138 && x < 182) continue;
    put(ctx, x, y, y === y0 ? INK : y === y0 + 1 ? STONEP[4] : (x + y) % 5 === 0 ? STONEP[1] : STONEP[3]);
  }
  for (let x = 0; x < m.w; x += 6) if (x < 136 || x > 184) rect(ctx, x, y0 - 3, 4, 3, STONEP[4]), rect(ctx, x, y0 - 3, 4, 1, INK);
  rect(ctx, 136, y0 - 4, 4, 18, INK); rect(ctx, 181, y0 - 4, 4, 18, INK);
}

// bridges are drawn over the canal: a cobbled deck with a parapet each side
function under(ctx, g, h) {
  const m = g.map;
  for (const c of m.canals) {
    if (c.y1 + 6 < h.VIEW.y || c.y0 - 6 > h.VIEW.y + h.H) continue;
    for (const b of c.bridges) {
      const s = h.sprite(`bridge|${b.x1 - b.x0}`, b.x1 - b.x0, CANAL_H + 6, cc => {
        const W = b.x1 - b.x0, Hh = CANAL_H + 6;
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
          const ry = Math.floor(y / 3), lx = (x + ry * 2) % 5;
          put(cc, x, y, lx === 0 || y % 3 === 0 ? '#3a3730' : COBBLE_HEX[1 + ((h.hash(Math.floor((x + ry * 2) / 5), ry) * 3) | 0)]);
        }
        for (const px of [0, W - 3]) {
          rect(cc, px, 0, 3, Hh, INK);
          for (let y = 1; y < Hh - 1; y++) { put(cc, px + 1, y, y % 4 === 0 ? STONEP[2] : STONEP[4]); put(cc, px + (px ? 1 : 2), y, STONEP[px ? 2 : 3]); }
        }
        // the arch's shadow on the water side, south
        rect(cc, 3, Hh - 2, W - 6, 1, 'rgba(10,14,16,.5)');
      });
      ctx.drawImage(s, b.x0, c.y0 - 3);
    }
  }
  if (g.ruins) for (const r of g.ruins) {
    if (r.y + r.h < h.VIEW.y - 4 || r.y - r.h > h.VIEW.y + h.H + 4) continue;
    ctx.drawImage(ruinSprite(h, r), Math.round(r.x - r.w / 2) - 1, Math.round(r.y - r.h / 2) - 1);
  }
}
const COBBLE_HEX = ['#3c3933', '#48443c', '#534e45', '#5e584d', '#6a6356'];

const props = {
  city_house: drawBuilding, city_shop: drawBuilding, city_pub: drawBuilding, city_inn: drawBuilding, city_chapel: drawBuilding,
  city_tent: drawTent, city_stall: drawStall, city_lamp: drawLamp, city_fountain: drawFountain, city_rubble: drawRubble,
};

export default {
  n: 6, id: 'city', name: 'INSIDE THE WALLS', sub: 'GO NORTH TO THE CASTLE. WRECK THE TOWN ON THE WAY.', mode: 'timed',
  kinds, critters,
  build(g, rng, P) { return build(g, rng, P); },
  update, hud,
  art: { ground, under, props, critters: { city_folk: drawFolk }, corpses: { city_folk: drawFolkBody }, canopy: false, theme: { leash: false } },
};
