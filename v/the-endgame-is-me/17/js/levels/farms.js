// Level 3, the Farms: small holdings strung along a rutted cart track. Fields of wheat and cabbages (cheap, and they
// feed Vengeance only a crumb at a time), a timber barn and a round mud-hut farmhouse on every farm, haystacks, pens,
// and cows, pigs and chickens that bolt when you come near. Barns and farmhouses score like the Low Wood's trees:
// knock one flat for half its value, burn the wreck for the rest, or burn it standing for all of it.
// A necromancer raises dead cows and pigs as bone cows and bone pigs.

import { scatter, canopy } from './forest.js';

const TAU = Math.PI * 2;
export const INK = '#14100c';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------------------------------------- kinds

const CROP = { r: 2, flammable: true, burnTime: 3, spread: 0.45, slow: 0.3, slowR: 4 };
const BUILDING = { solid: true, flammable: true, spread: 0.3 };
export const kinds = {
  wheat: { ...CROP, leaves: '#c8a64a', value: { pts: 8, venge: 0.005, chaos: 0.07 } },
  cabbage: { ...CROP, burnTime: 4, spread: 0.3, leaves: '#6e9a44', value: { pts: 10, venge: 0.005, chaos: 0.07 } },
  hay: { r: 4, flammable: true, burnTime: 5, spread: 0.6, slow: 0.4, slowR: 6, leaves: '#c4a858', value: { pts: 40, venge: 0.03, chaos: 0.4 } },
  fence: { r: 1, w: 8, h: 2, flammable: true, burnTime: 3, spread: 0.3, leaves: '#8a5a36', value: { pts: 5, venge: 0.004, chaos: 0.04 } },
  barn: { ...BUILDING, w: 34, h: 18, hp: 300, burnTime: 11, leaves: '#8a5a36', value: { pts: 260, venge: 0.2, chaos: 2.4 } },
  hut: { ...BUILDING, r: 8, hp: 180, burnTime: 9, leaves: '#a4845a', value: { pts: 180, venge: 0.15, chaos: 1.6 } },
};

export const critters = {
  cow: { r: 3.5, hp: 60, spd: 6, flee: 17, fear: 42, raise: 'skel_cow', cry: 'kill', value: { pts: 200, venge: 0.15, chaos: 0.6 } },
  pig: { r: 2.5, hp: 40, spd: 8, flee: 21, fear: 40, raise: 'skel_pig', value: { pts: 150, venge: 0.1, chaos: 0.4 } },
  chicken: { r: 1.5, hp: 10, spd: 10, flee: 30, fear: 34, bits: 'cream', value: { pts: 60, venge: 0.05, chaos: 0.12 } },
};

// what a necromancer makes of them
export const adds = {
  skel_cow: { name: 'BONE COW', hp: 150, r: 3, spd: 24, dmg: 24, rate: 1.2, reach: 4, sense: 70 },
  skel_pig: { name: 'BONE PIG', hp: 90, r: 2.5, spd: 36, dmg: 12, rate: 0.7, reach: 3, sense: 70 },
};

// ---------------------------------------------------------------------------------------------- layout helpers

// the main cart track's centre line
const trackY = x => 98 + Math.sin(x / 95) * 20 + Math.sin(x / 37 + 1) * 4;

// rectangles that must not overlap
export function Occupancy() {
  const rects = [];
  return {
    rects,
    free: (x0, y0, x1, y1, pad = 0) => !rects.some(r => x0 - pad < r.x1 && x1 + pad > r.x0 && y0 - pad < r.y1 && y1 + pad > r.y0),
    take: (x0, y0, x1, y1, tag) => { const r = { x0, y0, x1, y1, tag }; rects.push(r); return r; },
    inside: (x, y, pad = 0) => rects.some(r => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad),
  };
}

// a fence ring of 8 px segments round a rectangle, with a gap for a gate on one side
export function fenceRing(g, P, x0, y0, x1, y1, gate = 'b') {
  const hs = [], vs = [];
  for (let x = x0 + 4; x <= x1 - 4; x += 8) { if (!(gate === 't' && Math.abs(x - (x0 + x1) / 2) < 6)) hs.push([x, y0]); if (!(gate === 'b' && Math.abs(x - (x0 + x1) / 2) < 6)) hs.push([x, y1]); }
  for (let y = y0 + 4; y <= y1 - 4; y += 8) { vs.push([x0, y]); vs.push([x1, y]); }
  for (const [x, y] of hs) P.addProp(g, 'fence', x, y, { w: 8, h: 2 });
  for (const [x, y] of vs) P.addProp(g, 'fence', x, y, { w: 2, h: 8, vert: true });
}

// a field of crops in rows, skipping the track and anything already built
function sow(g, P, f, occ, rng) {
  const sx = 8, sy = 7;
  for (let y = f.y0 + 4; y <= f.y1 - 3; y += sy) for (let x = f.x0 + 4 + ((y / sy) & 1) * 2; x <= f.x1 - 3; x += sx) {
    const jx = x + (rng() - 0.5) * 2, jy = y + (rng() - 0.5) * 1.5;
    if (Math.abs(jy - trackY(jx)) < 8) continue;
    if (occ.rects.some(r => r.tag !== 'field' && jx > r.x0 - 2 && jx < r.x1 + 2 && jy > r.y0 - 2 && jy < r.y1 + 2)) continue;
    P.addProp(g, f.crop, jx, jy);
  }
}

function build(g, rng, P) {
  const w = 1140, h = 180, start = { x: 40, y: Math.round(trackY(40)), face: 0 };
  const occ = Occupancy(), fields = [], yards = [], spurs = [];
  occ.take(start.x - 26, start.y - 22, start.x + 30, start.y + 22, 'start');
  // the track itself is kept clear
  for (let x = 0; x < w; x += 10) occ.take(x, trackY(x + 5) - 6, x + 10, trackY(x + 5) + 6, 'track');
  const nFarms = 5;
  for (let i = 0; i < nFarms; i++) {
    const cx = 160 + i * 205 + (rng() - 0.5) * 30, up = i % 2 === 0;
    // the yard: barn, farmhouse, a pen with the animals, haystacks
    const ty = trackY(cx);
    const yy = up ? clamp(ty - 50, 40, 60) : clamp(ty + 46, 128, 146);
    const flip = rng() < 0.5 ? -1 : 1;
    const barn = { x: cx + flip * 20, y: yy + (up ? -4 : 2) };
    const hut = { x: cx - flip * 24, y: yy + (up ? 8 : -6) };
    occ.take(barn.x - 19, barn.y - 14, barn.x + 19, barn.y + 11, 'barn');
    occ.take(hut.x - 11, hut.y - 12, hut.x + 11, hut.y + 10, 'hut');
    P.addProp(g, 'barn', barn.x, barn.y);
    P.addProp(g, 'hut', hut.x, hut.y);
    yards.push({ x: cx, y: yy, rx: 46, ry: 22 });
    spurs.push({ x0: cx + (rng() - 0.5) * 10, y0: ty, x1: cx, y1: yy + (up ? 8 : -8) });
    // the pen sits beside the barn, away from the house
    const px0 = barn.x + flip * 23 - (flip < 0 ? 34 : 0), pw = 34, ph = 24;
    const py0 = up ? clamp(barn.y - 8, 24, 40) : clamp(barn.y - 14, 112, 136);
    if (occ.free(px0, py0, px0 + pw, py0 + ph, 2) && px0 > 6 && px0 + pw < w - 6) {
      occ.take(px0 - 1, py0 - 1, px0 + pw + 1, py0 + ph + 1, 'pen');
      fenceRing(g, P, px0, py0, px0 + pw, py0 + ph, up ? 'b' : 't');
      for (let k = 0; k < 2; k++) P.addCritter(g, 'pig', px0 + 8 + k * 14, py0 + 9 + k * 6);
    } else for (let k = 0; k < 2; k++) P.addCritter(g, 'pig', barn.x + (rng() - 0.5) * 30, barn.y + (up ? 16 : -18));
    // cows graze the grass between the fields
    for (let k = 0; k < 2; k++) P.addCritter(g, 'cow', cx + (rng() - 0.5) * 70, up ? clamp(ty - 24, 24, 150) + (rng() - 0.5) * 6 : clamp(ty + 24, 30, 152) + (rng() - 0.5) * 6);
    for (let k = 0; k < 4; k++) P.addCritter(g, 'chicken', cx + (rng() - 0.5) * 40, yy + (up ? 12 : -12) + (rng() - 0.5) * 8);
    // haystacks by the barn
    for (let k = 0; k < 2 + (rng() < 0.5 ? 1 : 0); k++) {
      const hx = barn.x - flip * (2 + k * 9), hy = barn.y + (up ? 15 : -15) + (rng() - 0.5) * 3;
      if (!occ.inside(hx, hy, 3)) { P.addProp(g, 'hay', hx, hy); occ.take(hx - 4, hy - 4, hx + 4, hy + 4, 'hay'); }
    }
    // a big field across the track, and a smaller one on the yard's side
    const fw = 70 + rng() * 20, fh = 34 + rng() * 8;
    const fy0 = up ? clamp(ty + 12, 100, 180) : clamp(ty - 12 - fh, 18, 90);
    const big = { x0: cx - fw / 2 + (rng() - 0.5) * 30, y0: fy0, crop: rng() < 0.65 ? 'wheat' : 'cabbage' };
    big.x1 = big.x0 + fw; big.y1 = Math.min(big.y0 + fh, 160);
    if (!up) big.y0 = Math.max(18, big.y0);
    fields.push(big);
    const sx0 = cx + (flip > 0 ? -86 : 54), sm = { x0: sx0, y0: up ? 20 : 120, x1: sx0 + 36 + rng() * 10, y1: up ? 20 + 28 : 120 + 30, crop: rng() < 0.5 ? 'cabbage' : 'wheat' };
    if (occ.free(sm.x0, sm.y0, sm.x1, sm.y1, 3)) fields.push(sm);
  }
  for (const f of fields) occ.take(f.x0, f.y0, f.x1, f.y1, 'field');
  for (const f of fields) sow(g, P, f, occ, rng);
  // hedgerow bushes and the odd oak between the farms
  const avoid = occ.rects.filter(r => r.tag !== 'track').map(r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 + 6 }));
  for (const t of scatter(rng, 26, 10, 20, w - 10, h - 22, 22, avoid)) {
    if (Math.abs(t.y - trackY(t.x)) < 10) continue;
    P.addProp(g, rng() < 0.3 ? 'oak' : 'bush', t.x, t.y);
  }
  return { w, h, scroll: 'x', start, fields, yards, spurs };
}

// ---------------------------------------------------------------------------------------------- painting helpers

// paints a picture from fill(x, y) -> colour or null. edge 'in' inks the shape's own border, 'out' rings it outside.
export function paint(c, W, H, fill, edge = 'in', ink = INK) {
  const a = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = fill(x, y) || null;
  const at = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? null : a[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col = a[y * W + x];
    const n4 = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    if (col && edge === 'in' && n4.some(v => !v)) col = ink;
    if (!col && edge === 'out' && n4.some(v => v)) col = ink;
    if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
  }
}

// a sprite from a little character map (facing right; flipped for left), ringed in ink
export function mapSprite(h, key, rows, pal, flip = false) {
  const w = Math.max(...rows.map(r => r.length)), H = rows.length;
  return h.sprite(`${key}${flip ? 'L' : 'R'}`, w + 2, H + 2, c => paint(c, w + 2, H + 2, (x, y) => {
    const r = rows[y - 1]; if (!r) return null;
    const ch = r[flip ? w - x : x - 1];
    return ch && ch !== '.' ? pal[ch] : null;
  }, 'out'));
}

// draws a prop sprite with its burn darkening and hit flash
export function blit(ctx, spr, x, y, p, h, burnTime) {
  ctx.drawImage(spr, x, y);
  if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / burnTime * 0.95); ctx.drawImage(h.tinted(spr, '#1a120c'), x, y); ctx.globalAlpha = 1; }
  if (p.hitT > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(h.tinted(spr, '#ffffff'), x, y); ctx.globalAlpha = 1; }
}

// palettes, dark to light
export const THATCH = ['#3a2c14', '#5e4a22', '#83692e', '#a88a40', '#ccb05a'];
export const SHINGLE = ['#2a2420', '#4a4038', '#62564a', '#7a6c5a', '#96866e'];
export const PLANK = ['#2e1c12', '#4a2e1c', '#5e3b24', '#74492c', '#8a5a36'];
export const MUD = ['#4a3420', '#6a4c30', '#86643e', '#a4845a', '#bea072'];
const HUT_THATCH = ['#2e2210', '#4e3a1a', '#6e5426', '#8e7234', '#ae9248'];
export const HAY = ['#5a4a1a', '#8a7430', '#b49c48', '#d8c068', '#f0dc8c'];
export const DAUB = ['#6e6450', '#a89c80', '#c8bc9e', '#ded4b8', '#eee6cc'];

// a building seen from the south and a little above: a roof (thatch or shingles) over a front wall.
// o: { W, RH (roof rows), WH (wall rows), roof: 'thatch'|'shingle', roofPal, wall: 'plank'|'mud'|'timber', wallPal,
//      doors: [{ x, w, h, kind: 'barn'|'plain' }], windows: [{ x, y }], chimney: x, seed }
export function paintHouse(c, o, hash) {
  const { W, RH, WH, seed = 0 } = o, H = RH + WH, eave = RH - 1, ridge = Math.round(RH * 0.36);
  const R = o.roofPal || (o.roof === 'thatch' ? THATCH : SHINGLE), Wp = o.wallPal || PLANK;
  const thatch = o.roof === 'thatch';
  const roofAt = (x, y) => {
    // hipped and (for thatch) rounded corners
    const inset = y < ridge ? Math.ceil((ridge - y) * (o.hip ?? 0.8)) : 0;
    if (x < inset || x > W - 1 - inset) return null;
    if (thatch && y === eave && (x === 0 || x === W - 1)) return null;
    if (thatch && y === 0 && (x === inset || x === W - 1 - inset)) return null;
    const side = x < W * 0.28 ? 0.6 : x > W * 0.74 ? -0.6 : 0;
    let l;
    if (thatch) {
      if (y === eave) return hash(x + seed, 3) < 0.35 ? R[0] : R[1];
      if (y === ridge || y === ridge - 1) return ((x + y) & 1) ? R[1] : y === ridge ? R[2] : R[3];   // the bound ridge roll
      const s = hash(x * 3 + seed, Math.floor(y / 2) + 7);
      l = (y < ridge ? 3.3 : 2.4) + side + (s - 0.5) * 1.3 - (y >= eave - 1 ? 0.6 : 0);
      if (y > ridge && (y - ridge) % 3 === 0 && hash(x, y + seed) < 0.6) l -= 0.8;
    } else {
      if (y === eave) return R[0];
      if (y === ridge) return R[4];
      l = (y < ridge ? 3.2 : 2.4) + side;
      if (y > ridge) { const r = y - ridge; if (r % 2 === 0) l -= 1; else if ((x + (r >> 1) * 2 + seed) % 4 === 0) l -= 0.9; }
      else if ((x + y + seed) % 4 === 0) l -= 0.7;
      l += (hash(x + seed, y) - 0.5) * 0.5;
    }
    return R[clamp(Math.round(l), 1, 4)];
  };
  const wallAt = (x, y) => {   // y: 0 is the row just under the eave
    if (x < 1 || x > W - 2) return null;
    for (const d of o.doors || []) if (x >= d.x && x < d.x + d.w && y >= WH - d.h) {
      const dx = x - d.x, dy = y - (WH - d.h);
      if (dx === 0 || dx === d.w - 1 || dy === 0) return Wp === PLANK ? '#24160e' : PLANK[0];
      if (d.kind === 'barn') { const u = dx / (d.w - 1), v = dy / (d.h - 1); return Math.abs(u - v) < 0.18 || Math.abs(u - (1 - v)) < 0.18 ? PLANK[4] : dx === d.w >> 1 ? PLANK[0] : PLANK[2]; }
      if (d.kind === 'open') return dy > d.h - 3 && hash(dx, seed) < 0.6 ? '#7e6430' : '#120c08';
      return dx === d.w - 2 && dy === d.h >> 1 ? '#c8a64a' : PLANK[2];
    }
    for (const wn of o.windows || []) if (x >= wn.x && x < wn.x + (wn.w || 2) && y >= wn.y && y < wn.y + (wn.h || 2)) return o.lit ? '#e8b048' : '#1a1410';
    if (y === 0) return Wp[0];   // the eave's shadow
    const side = x < W * 0.35 ? 1 : x > W * 0.7 ? -1 : 0;
    if (o.wall === 'plank') return x % 3 === 0 ? Wp[1] : Wp[clamp(3 + side - (y === 1 ? 1 : 0), 1, 4)];
    if (o.wall === 'timber') {
      if (x === 1 || x === W - 2 || (o.posts || []).includes(x) || y === Math.floor(WH / 2) || y === WH - 1) return PLANK[1];
      return Wp[clamp(3 + side + (hash(x + seed, y) < 0.2 ? -1 : 0), 1, 4)];
    }
    return Wp[clamp(Math.round(2.6 + side * 0.8 + (hash(x * 5 + seed, y * 3) - 0.5) * 1.4 - (y === 1 ? 0.8 : 0)), 1, 4)];   // mud
  };
  paint(c, W, H, (x, y) => y <= eave ? roofAt(x, y) : wallAt(x, y - eave - 1));
  if (o.chimney != null) { c.fillStyle = INK; c.fillRect(o.chimney - 1, 0, 4, 4); c.fillStyle = '#7f7f74'; c.fillRect(o.chimney, 0, 2, 3); c.fillStyle = '#aeac9b'; c.fillRect(o.chimney, 0, 1, 2); c.fillStyle = '#1a1410'; c.fillRect(o.chimney, 0, 2, 1); }
}

// what is left of a building: heaps of its roof, stubs of its walls, loose timbers
export function paintRuin(c, W, H, roofPal, wallPal, seed, hash, thatch = false) {
  // the roof has come down in two slabs, split by a jagged crack, with holes punched through and the walls
  // crumbled out round the edge
  const cx = W / 2, cy = H * 0.52, kx = W / 2 - 0.5, ky = H * 0.48;
  const crackAt = (x, y) => (x - cx) - (y - cy) * 0.9 + (hash(y, seed) - 0.5) * 2.4;
  paint(c, W, H, (x, y) => {
    const u = (x + 0.5 - cx) / kx, v = (y + 0.5 - cy) / ky, n = hash(Math.floor(x / 2) + seed, Math.floor(y / 2) + 3);
    const d = Math.max(Math.abs(u), Math.abs(v)) + (n - 0.5) * 0.3;
    if (d > 0.98) return null;
    const k = crackAt(x, y);
    if (Math.abs(k) < 0.8) return '#1a120c';
    if (hash(x * 3 + seed, y * 7) < 0.05) return '#1a120c';
    if (d > 0.8) return wallPal[1 + Math.floor(hash(x + seed, y) * 3)];
    const slab = k > 0 ? 1 : 0;
    let l;
    if (thatch) l = 2.4 + (hash(x * 3 + seed, Math.floor(y / 2)) - 0.5) * 1.4 - (y % 3 === 0 ? 0.6 : 0);
    else { const r = y + slab; l = r % 2 === 0 ? 1 : 2.6 - ((x + (r >> 1) * 2 + seed) % 4 === 0 ? 0.9 : 0); }
    l += slab ? -0.5 : 0.3;
    return roofPal[clamp(Math.round(l), 1, 4)];
  });
  // timbers sticking out of the wreck
  for (let k = 0; k < 4; k++) {
    const a = hash(k * 7, seed) * Math.PI, L = 5 + hash(seed, k * 3) * 6, x0 = W * 0.2 + hash(k, seed + 1) * W * 0.6, y0 = H * 0.25 + hash(seed + 2, k) * H * 0.5;
    for (let i = 0; i < L; i++) {
      const x = Math.round(x0 + Math.cos(a) * i - Math.cos(a) * L / 2), y = Math.round(y0 + Math.sin(a) * i * 0.6);
      if (x < 0 || x >= W || y < 0 || y >= H - 1) continue;
      c.fillStyle = INK; c.fillRect(x, y + 1, 1, 1);
      c.fillStyle = i % 4 ? PLANK[3] : PLANK[4]; c.fillRect(x, y, 1, 1);
    }
  }
}

// a soft shadow to the south-east of something standing
export function shadow(ctx, x, y, w, hh, a = 0.32) {
  ctx.globalAlpha = a; ctx.fillStyle = '#05080a'; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh)); ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------- prop art

const BT = k => kinds[k]?.burnTime || 8;

function drawBarn(ctx, p, g, h) {
  const v = p.seed % 3, W = p.w + 2, RH = 17, WH = 8, H = RH + WH;
  const x0 = Math.round(p.x) - W / 2, base = Math.round(p.y + p.h / 2);
  if (p.state === 'up') {
    const spr = h.sprite(`fm-barn${v}`, W, H, c => paintHouse(c, { W, RH, WH, roof: v === 2 ? 'thatch' : 'shingle', wall: 'plank',
      doors: [{ x: (W >> 1) - 4, w: 8, h: 6, kind: v === 1 ? 'open' : 'barn' }], windows: [{ x: 4, y: 2, w: 2, h: 2 }], seed: v * 11 }, h.hash));
    shadow(ctx, x0 + 3, base - WH, W, WH + 2);
    blit(ctx, spr, x0, base - H + 1, p, h, BT('barn'));
  } else {
    const Hh = p.h + 4, spr = h.sprite(`fm-barnx${v}`, W, Hh, c => paintRuin(c, W, Hh, v === 2 ? THATCH : SHINGLE, PLANK, v * 5 + 2, h.hash, v === 2));
    blit(ctx, spr, x0, base - Hh + 1, p, h, BT('barn'));
  }
}

// the farmhouse: a round mud hut under a cone of thatch, a door at the front and smoke from the top
function paintHut(c, S, T, seed, hash) {
  const cx = S / 2 - 0.5, ax = cx - 0.5, ay = 1, ry = 3.6, wallH = 7, by = Math.floor(T - 2 - wallH - ry), rx = S / 2 - 0.6, R = HUT_THATCH;
  const foot = Math.floor(by + wallH + ry - 0.6);
  paint(c, S, T, (x, y) => {
    // the roof: a cone from the apex down to an ellipse
    const dx = x - cx;
    let inRoof = false;
    if (y >= by) inRoof = (dx / rx) ** 2 + ((y - by) / ry) ** 2 < 1;
    else if (y >= ay) inRoof = Math.abs(x - ax) <= rx * (y - ay + 1) / (by - ay + 1) + 0.3;
    if (inRoof) {
      const ang = Math.atan2(x - ax, (y - ay) + 0.01), streak = hash(Math.floor((ang + 2) * 14) + seed, 1);
      let l = 2.6 - (x - cx) / rx * 1.1 - (y > by + 1 ? 0.6 : 0) + (streak - 0.5) * 1.2;
      if (y >= by && (dx / rx) ** 2 + ((y - by) / ry) ** 2 > 0.72) l -= 0.9;   // the eave's fringe
      if (y <= ay + 1) return R[1];
      return R[clamp(Math.round(l), 1, 4)];
    }
    // the wall: a drum, the eave's ellipse swept down by wallH
    const rxw = rx - 1.5, yy = y - by, ryw = ry - 0.6;
    const inWall = yy > 0 && (yy <= wallH ? Math.abs(dx) < rxw : (dx / rxw) ** 2 + ((yy - wallH) / ryw) ** 2 < 1);
    if (inWall) {
      if (Math.abs(dx) < 1.6 && y >= foot - 3) return y === foot - 3 ? PLANK[0] : '#120c08';   // the doorway
      if (dx > -6.5 && dx < -4.5 && y === foot - 2) return '#1a1410';   // a little window
      const l = 3 - dx / rxw * 1.4 + (hash(x * 3 + seed, y * 7) - 0.5) * 1.1 - (y <= by + ry + 1 ? 1.2 : 0);
      return MUD[clamp(Math.round(l), 1, 4)];
    }
    return null;
  });
}
function drawHut(ctx, p, g, h) {
  const v = p.seed % 2, S = 21, T = 23;
  const x0 = Math.round(p.x) - 10, top = Math.round(p.y) + 7 - T;
  if (p.state === 'up') {
    const spr = h.sprite(`fm-hut${v}`, S, T, c => paintHut(c, S, T, v * 9, h.hash));
    shadow(ctx, x0 + 4, Math.round(p.y) - 1, S - 2, 7, 0.28);
    blit(ctx, spr, x0, top, p, h, BT('hut'));
    // a wisp of smoke from the smoke hole while the fire's in
    if (!p.burning) { const t = Math.floor(g.t * 2 + p.seed) % 6; ctx.globalAlpha = 0.45; ctx.fillStyle = '#b8b0a0'; ctx.fillRect(x0 + 9 + (t > 2 ? 1 : 0), top - t, 1, 1); if (t > 1) ctx.fillRect(x0 + 10 - (t > 4 ? 1 : 0), top - 2 - t, 1, 1); ctx.globalAlpha = 1; }
  } else {
    const spr = h.sprite(`fm-hutx${v}`, S, 14, c => {
      canopy(c, S / 2 - 0.5, 7, 5.8, HUT_THATCH.slice(1), v * 7 + 3, h.hash, 6);
      // a broken ring of mud wall round the heap
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * TAU; if (h.hash(i, v + 5) < 0.35) continue;
        const x = Math.round(S / 2 - 0.5 + Math.cos(a) * 8), y = Math.round(7 + Math.sin(a) * 5);
        c.fillStyle = INK; c.fillRect(x, y, 2, 2); c.fillStyle = MUD[a > Math.PI * 0.5 && a < Math.PI * 1.5 ? 3 : 2]; c.fillRect(x, y, 1, 1);
      }
    });
    blit(ctx, spr, x0, Math.round(p.y) - 7, p, h, BT('hut'));
  }
}

function drawHay(ctx, p, g, h) {
  const v = p.seed % 3, x = Math.round(p.x), y = Math.round(p.y);
  if (p.state === 'up') {
    const spr = h.sprite(`fm-hay${v}`, 11, 10, c => {
      canopy(c, 5, 5, 4.4, HAY.slice(1), v * 17 + 1, h.hash, 6);
      // a few loose straws and a bit of shading underneath
      c.fillStyle = HAY[1]; c.fillRect(3, 8, 5, 1);
      c.fillStyle = HAY[4]; c.fillRect(3, 3, 1, 1); c.fillRect(5, 2, 1, 1); c.fillRect(4, 3, 1, 1);
    });
    shadow(ctx, x - 2, y + 1, 9, 2);
    blit(ctx, spr, x - 5, y - 7, p, h, BT('hay'));
  } else {
    const spr = h.sprite(`fm-hayx${v}`, 13, 8, c => {
      for (let i = 0; i < 26; i++) {
        const a = h.hash(i, v) * TAU, r = h.hash(v, i) * 5.5, px = Math.round(6 + Math.cos(a) * r), py = Math.round(4 + Math.sin(a) * r * 0.55);
        c.fillStyle = HAY[1 + (i % 4)]; c.fillRect(px, py, i % 3 ? 1 : 2, 1);
      }
    });
    blit(ctx, spr, x - 6, y - 4, p, h, BT('hay'));
  }
}

// crops: little sprites (several variants), and flattened ones lying the way they were walked over
const WHEAT = ['#6e5a24', '#977a30', '#b89838', '#d6b84c', '#ecd472'];
const CABB = ['#1e3216', '#2e4a22', '#4f7a34', '#6e9a44', '#9cc46a'];
function drawCrop(ctx, p, g, h) {
  const x = Math.round(p.x), y = Math.round(p.y), wheat = p.kind === 'wheat';
  if (p.state === 'up') {
    const v = p.seed % 4;
    const spr = wheat ? h.sprite(`fm-wheat${v}`, 7, 7, c => {
      for (let i = 0; i < 4; i++) {
        const sx = 1 + i + (i > 1 ? 1 : 0) - (h.hash(i, v) < 0.3 ? 1 : 0), tall = 3 + Math.floor(h.hash(v, i) * 2.5);
        for (let k = 0; k < tall; k++) { c.fillStyle = k === 0 ? WHEAT[0] : WHEAT[1 + (i & 1)]; c.fillRect(sx, 6 - k, 1, 1); }
        c.fillStyle = i < 2 ? WHEAT[4] : WHEAT[3]; c.fillRect(sx, 6 - tall, 1, 1);
        c.fillStyle = WHEAT[3]; c.fillRect(sx, 7 - tall, 1, 1);
      }
    }) : h.sprite(`fm-cabbage${v}`, 7, 6, c => paint(c, 7, 6, (px, py) => {
      const dx = px - 3, dy = (py - 2.6) * 1.25, d = Math.hypot(dx, dy);
      if (d > 2.9 + (h.hash(px + v, py) - 0.5) * 0.6) return null;
      const l = 2.2 - (dx * 0.5 + dy * 0.7) / 2.6 + (h.hash(px * 3 + v, py) - 0.5) * 0.8 - (d > 2.1 ? 0.8 : 0);
      return CABB[clamp(Math.round(l), 1, 4)];
    }, 'out', '#16220e'));
    if (wheat) ctx.drawImage(spr, x - 3, y - 6); else { shadow(ctx, x - 1, y + 2, 5, 1, 0.25); ctx.drawImage(spr, x - 3, y - 3); }
    if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / BT(p.kind)); ctx.drawImage(h.tinted(spr, '#1a120c'), wheat ? x - 3 : x - 3, wheat ? y - 6 : y - 3); ctx.globalAlpha = 1; }
  } else {
    const a8 = Math.round(((p.fallA % TAU) + TAU) % TAU / TAU * 8) % 8, ang = a8 / 8 * TAU, v = p.seed % 2;
    const spr = h.sprite(`fm-${p.kind}x${a8}${v}`, 9, 9, c => {
      if (wheat) for (let i = 0; i < 3; i++) {
        const ox = 4 + Math.round(-Math.sin(ang) * (i - 1) * 1.4), oy = 4 + Math.round(Math.cos(ang) * (i - 1) * 1.4);
        for (let k = 0; k < 4; k++) { c.fillStyle = k === 3 ? WHEAT[3] : WHEAT[1 + (k & 1)]; c.fillRect(Math.round(ox + Math.cos(ang) * (k - 1)), Math.round(oy + Math.sin(ang) * (k - 1)), 1, 1); }
      }
      else for (let i = 0; i < 9; i++) {
        const a = h.hash(i, a8 + v) * TAU, r = h.hash(v + 3, i) * 3.4;
        c.fillStyle = CABB[1 + (i % 4)]; c.fillRect(Math.round(4 + Math.cos(a) * r + Math.cos(ang) * 0.8), Math.round(4 + Math.sin(a) * r * 0.7), 1, 1);
      }
    });
    ctx.drawImage(spr, x - 4, y - 4);
    if (p.burning) { ctx.globalAlpha = Math.min(0.85, p.burnT / BT(p.kind)); ctx.drawImage(h.tinted(spr, '#1a120c'), x - 4, y - 4); ctx.globalAlpha = 1; }
  }
}

// fences: two rails between posts; knocked over they lie in splinters
export function drawFence(ctx, p, g, h) {
  const x = Math.round(p.x), y = Math.round(p.y), vert = p.w < p.h;
  const key = `fm-fence${vert ? 'v' : 'h'}${p.state === 'up' ? '' : 'x' + (p.seed % 2)}`;
  if (p.state === 'up') {
    const spr = vert ? h.sprite(key, 4, 12, c => {
      c.fillStyle = INK; c.fillRect(0, 0, 3, 12);
      c.fillStyle = PLANK[3]; c.fillRect(1, 1, 1, 10); c.fillStyle = PLANK[4]; c.fillRect(1, 1, 1, 2); c.fillRect(1, 8, 1, 2);
      c.fillStyle = 'rgba(5,8,10,.3)'; c.fillRect(3, 2, 1, 10);
    }) : h.sprite(key, 10, 6, c => {
      c.fillStyle = INK; c.fillRect(0, 0, 10, 5);
      c.fillStyle = PLANK[3]; c.fillRect(1, 1, 8, 1); c.fillRect(1, 3, 8, 1);
      c.fillStyle = PLANK[4]; c.fillRect(1, 0, 1, 4); c.fillRect(8, 0, 1, 4);
      c.clearRect(2, 2, 6, 1); c.clearRect(2, 4, 6, 1);
      c.fillStyle = INK; c.fillRect(2, 2, 6, 1); c.fillRect(2, 4, 6, 1);
      c.fillStyle = 'rgba(5,8,10,.3)'; c.fillRect(1, 5, 9, 1);
    });
    if (vert) blit(ctx, spr, x - 1, y - 7, p, h, 3); else blit(ctx, spr, x - 5, y - 3, p, h, 3);
  } else {
    const spr = h.sprite(key, 11, 9, c => {
      for (let k = 0; k < 3; k++) {
        const a = h.hash(k, p.seed % 2) * Math.PI, L = 3 + Math.floor(h.hash(k + 4, p.seed % 2) * 3);
        for (let i = 0; i < L; i++) { const px = Math.round(5 + Math.cos(a) * (i - L / 2)), py = Math.round(4 + Math.sin(a) * (i - L / 2) * 0.7 + k - 1); c.fillStyle = INK; c.fillRect(px, py + 1, 1, 1); c.fillStyle = PLANK[3]; c.fillRect(px, py, 1, 1); }
      }
    });
    blit(ctx, spr, x - 5, y - 4, p, h, 3);
  }
}

// ---------------------------------------------------------------------------------------------- animals

// all facing right; two walking frames each
const COW_PAL = { h: '#e6d9b8', L: '#a06a43', B: '#835233', D: '#5a3622', W: '#e8e0cc', H: '#835233', e: INK, n: '#d89a84', l: '#3a2418', t: '#4a2c1c' };
const COW_PAL2 = { ...COW_PAL, L: '#ece6d6', B: '#d4ccba', D: '#9a9284', W: '#2a2420', H: '#2a2420', n: '#e0a8a0' };
const COW = [
  ['.........h.h.', '.LLLLLLLLHHH.', 'tBWWBBBBWHeHn', 't.BWBBBBBDHnn', '..DDBBBDD....', '..l.l..l.l...'],
  ['.........h.h.', '.LLLLLLLLHHH.', 'tBWWBBBBWHeHn', 't.BWBBBBBDHnn', '..DDBBBDD....', '...l.l..l.l..'],
];
const PIG_PAL = { E: '#c06a72', L: '#f4b4b0', P: '#e2948e', D: '#b86a66', S: '#c87a7a', e: INK, t: '#c87a7a', l: '#8a4a48' };
const PIG = [
  ['.......E..', '.LLLLLLLE.', 'tPPPPPPPeS', '.DPPPPPPPS', '..DDPPDD..', '..l.l..l.l'],
  ['.......E..', '.LLLLLLLE.', 'tPPPPPPPeS', '.DPPPPPPPS', '..DDPPDD..', '...l.l..l.'],
];
const HEN_PAL = { r: '#d8473a', W: '#f2efe2', w: '#c8c0ac', y: '#e8b83a', e: INK };
const HEN = [['..r.', '..We', 'WWWy', '.ww.', '.y..'], ['..r.', '..We', 'WWWy', '.ww.', '..y.']];
const HEN_PECK = ['....', '..r.', 'WWWe', '.wwy', '.y..'];

function drawBeast(ctx, c, h, key, frames, pal, dy = 0, peck = null, t = 0) {
  const x = Math.round(c.x), y = Math.round(c.y);
  const fr = c.moving ? Math.floor(c.walk * (c.scared > 0 ? 1.4 : 1)) % 2 : 0;
  const rows = peck && !c.moving && Math.floor(c.seed + c.walk * 3 + (c.hx || 0)) % 3 === 0 && Math.sin(t * 3 + c.seed) > 0.4 ? peck : frames[fr];
  const spr = mapSprite(h, `${key}${rows === peck ? 'p' : fr}`, rows, pal, c.fx < 0);
  const w = spr.width, hh = spr.height;
  shadow(ctx, x - (w >> 1) + 1, y + 1, w - 2, 1, 0.35);
  const bob = c.moving && fr ? 1 : 0;
  const X = x - (w >> 1), Y = y - hh + 2 + dy - bob;
  ctx.drawImage(spr, X, Y);
  if (c.hitT > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(h.tinted(spr, '#ffffff'), X, Y); ctx.globalAlpha = 1; }
}
const drawCow = (ctx, c, g, h) => drawBeast(ctx, c, h, `fm-cow${c.seed % 3 === 0 ? 'b' : 'a'}`, COW, c.seed % 3 === 0 ? COW_PAL2 : COW_PAL);
const drawPig = (ctx, c, g, h) => drawBeast(ctx, c, h, 'fm-pig', PIG, PIG_PAL);
const drawHen = (ctx, c, g, h) => drawBeast(ctx, c, h, 'fm-hen', HEN, HEN_PAL, 0, HEN_PECK, g.t);

// the dead: on their sides, legs in the air
const COW_DEAD = ['..l.l..l.l...', '..l.l..l.l...', '.LLLLLLLLHH..', 'tBWWBBBBWHeHn', '.DDBBBBBDDHnn', '...rr.rrr....'];
const PIG_DEAD = ['..l.l..l.l', '.LLLLLLLE.', 'tPPPPPPPeS', '.DDPPPPDDS', '..rr.rr...'];
const HEN_DEAD = ['W..w.', '.WWr.', 'w.rWy', '.r...'];
const DEAD_PAL = { r: '#a3201a' };
function corpse(key, rows, pal) {
  return (ctx, c, h) => {
    const spr = mapSprite(h, key, rows, { ...pal, ...DEAD_PAL }, c.fx < 0);
    ctx.drawImage(spr, Math.round(c.x) - (spr.width >> 1), Math.round(c.y) - spr.height + 3);
  };
}

// bone cows and bone pigs: ribs you can see the grass through, skulls with a green glow in the sockets
const BONE_PAL = { b: '#e8e2cc', B: '#b8b09a', s: '#f2efe2', g: '#7cff8a', x: '#2a2420', h: '#a8977a' };
const SKEL_COW = [
  ['.........h.h.', '.bbbbbbbbsss.', 'b.BxBxBxBsgss', '..BxBxBxB.ss.', '..bb...bb....', '..b.B..b.B...'],
  ['.........h.h.', '.bbbbbbbbsss.', 'b.BxBxBxBsgss', '..BxBxBxB.ss.', '..bb...bb....', '...B.b..B.b..'],
];
const SKEL_COW_BITE = ['.........h.h.', '.bbbbbbbbsss.', 'b.BxBxBxBsgsss', '..BxBxBxB.x...', '..bb...bb.sss.', '..b.B..b.B....'];
const SKEL_PIG = [
  ['.......b..', '.bbbbbbsb.', 'b.BxBxBsgs', '..BxBxB.ss', '..b.B.b.B.'],
  ['.......b..', '.bbbbbbsb.', 'b.BxBxBsgs', '..BxBxB.ss', '...B.b.B.b'],
];
const SKEL_PIG_BITE = ['.......b...', '.bbbbbbsb..', 'b.BxBxBsgss', '..BxBxB..x.', '..b.B.b.Bss'];
function drawSkel(key, frames, bite) {
  return (ctx, a, g, h) => {
    const x = Math.round(a.x), y = Math.round(a.y);
    const rows = a.swing > 0 ? bite : frames[a.moving ? Math.floor(a.walk) % 2 : 0];
    const spr = mapSprite(h, `${key}${rows === bite ? 'b' : rows === frames[1] ? 1 : 0}`, rows, BONE_PAL, a.fx < 0);
    const X = x - (spr.width >> 1), Y = y - spr.height + 2 - (a.moving && Math.floor(a.walk) % 2 ? 1 : 0);
    ctx.drawImage(spr, X, Y);
    // the glow in the sockets flickers
    if (Math.floor(g.t * 6 + a.id) % 5 === 0) { ctx.globalAlpha = 0.5; ctx.drawImage(h.tinted(spr, '#7cff8a'), X, Y); ctx.globalAlpha = 1; }
    if (a.hit > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(h.tinted(spr, '#ffffff'), X, Y); ctx.globalAlpha = 1; }
  };
}

// ---------------------------------------------------------------------------------------------- ground

const MEADOW = ['#2e4224', '#364c29', '#3f562f', '#4a6336'];
function ground(ctx, m, h) {
  const { hash, vnoise } = h;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const n = vnoise(x / 30, y / 30) * 0.55 + vnoise(x / 9 + 40, y / 9) * 0.3 + hash(x, y) * 0.2;
    const lvl = clamp(Math.floor(n * 3.4 - 0.2 + ((x + y) & 1) * 0.3), 0, 3);
    ctx.fillStyle = MEADOW[lvl]; ctx.fillRect(x, y, 1, 1);
  }
  // tufts and wildflowers
  for (let i = 0; i < m.w * 2; i++) {
    const x = Math.floor(hash(i, 17) * m.w), y = Math.floor(hash(i, 23) * m.h), k = hash(i, 5);
    ctx.fillStyle = k < 0.06 ? '#e8d23a' : k < 0.1 ? '#f4ecd2' : k < 0.13 ? '#ee8fbf' : k < 0.6 ? '#56763a' : '#26381e';
    ctx.fillRect(x, y, 1, 1);
  }
  // trodden yards round the buildings
  for (const yd of m.yards || []) for (let y = Math.floor(yd.y - yd.ry - 4); y <= yd.y + yd.ry + 4; y++) for (let x = Math.floor(yd.x - yd.rx - 4); x <= yd.x + yd.rx + 4; x++) {
    const d = ((x - yd.x) / yd.rx) ** 2 + ((y - yd.y) / yd.ry) ** 2 + (vnoise(x / 6, y / 6) - 0.5) * 0.7;
    if (d > 1) continue;
    const k = hash(x * 3, y * 5);
    ctx.fillStyle = d > 0.8 ? (k < 0.5 ? '#4a5230' : '#55502e') : k < 0.15 ? '#4a3a26' : k < 0.85 ? '#5e4c32' : '#6e5a3c';
    ctx.fillRect(x, y, 1, 1);
  }
  // tilled fields: furrows across, a grassy headland round the edge
  for (const f of m.fields || []) {
    const wheat = f.crop === 'wheat';
    for (let y = Math.floor(f.y0); y <= f.y1; y++) for (let x = Math.floor(f.x0); x <= f.x1; x++) {
      if (Math.abs(y - trackY(x)) < 5) continue;
      const edge = x - f.x0 < 1 || f.x1 - x < 1 || y - f.y0 < 1 || f.y1 - y < 1;
      const row = (y - Math.floor(f.y0)) % 3, k = hash(x * 7, y * 3);
      let col = row === 0 ? '#3a2a1a' : row === 1 ? (k < 0.5 ? '#5a4228' : '#644a2c') : (k < 0.5 ? '#4c3822' : '#56402a');
      if (wheat && row !== 0 && k > 0.82) col = '#8a7434';
      if (!wheat && row !== 0 && k > 0.9) col = '#3e5a2a';
      if (edge) col = k < 0.5 ? '#3e4e28' : '#4a3a24';
      ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
    }
  }
  // the cart track: two ruts with a grassy crown, and spurs up to each yard
  const rut = (x, y) => { ctx.fillStyle = hash(x, y) < 0.5 ? '#4a3a26' : '#3e3020'; ctx.fillRect(x, y, 1, 1); };
  const worn = (x, y) => { if (hash(x * 3, y) < 0.55) { ctx.fillStyle = hash(y, x) < 0.5 ? '#5a4a30' : '#665438'; ctx.fillRect(x, y, 1, 1); } };
  for (let x = 0; x < m.w; x++) {
    const cy = Math.round(trackY(x));
    for (let dy = -4; dy <= 4; dy++) if (Math.abs(dy) >= 3 || hash(x, dy + 50) < 0.25) worn(x, cy + dy);
    rut(x, cy - 2); rut(x, cy + 2);
    if (hash(x, 9) < 0.5) rut(x, cy - 3 + (hash(x, 1) < 0.5 ? 0 : 0));
  }
  for (const s of m.spurs || []) {
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), nx = -(s.y1 - s.y0) / L, ny = (s.x1 - s.x0) / L;
    for (let i = 0; i <= L; i++) {
      const t = i / L, wob = Math.sin(t * 5 + s.x0) * 3;
      const x = s.x0 + (s.x1 - s.x0) * t + nx * wob, y = s.y0 + (s.y1 - s.y0) * t;
      worn(Math.round(x), Math.round(y)); worn(Math.round(x + 1), Math.round(y));
      rut(Math.round(x - 2), Math.round(y)); rut(Math.round(x + 2), Math.round(y));
    }
  }
}

export default {
  n: 3, id: 'farms', name: 'THE FARMS', sub: 'TRAMPLE THE CROPS. BURN THE BARNS. SCATTER THE HERDS.', mode: 'chaos',
  kinds, critters, adds,
  build(g, rng, P) { return build(g, rng, P); },
  art: {
    ground,
    props: { barn: drawBarn, hut: drawHut, hay: drawHay, wheat: drawCrop, cabbage: drawCrop, fence: drawFence },
    critters: { cow: drawCow, pig: drawPig, chicken: drawHen },
    corpses: { cow: (ctx, c, h) => corpse(`fm-cowd${0}`, COW_DEAD, COW_PAL)(ctx, c, h), pig: corpse('fm-pigd', PIG_DEAD, PIG_PAL), chicken: corpse('fm-hend', HEN_DEAD, HEN_PAL) },
    adds: { skel_cow: drawSkel('fm-skcow', SKEL_COW, SKEL_COW_BITE), skel_pig: drawSkel('fm-skpig', SKEL_PIG, SKEL_PIG_BITE) },
    canopy: false, theme: { leash: false },
  },
};
