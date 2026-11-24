// Fills the blocks: marches lots along every frontage (rejecting anything that leaves the block or overlaps what is
// already there), builds whatever the district calls for on each lot, and records addresses, kerbside stops and
// parking. Named places are reserved first by town-places.js; this file is the "everything else".
// Tuning: DIST table (lot sizes per district) and the per-district builders below it.

import { makeRng } from './util.js';
import { obb, obbOverlap, obbInPoly, pointInPoly } from './town-geo.js';
import { ctx, house, storefront, tower, parkade, warehouse, shopBox, woodFence, chainFence, hedge, carPark, kerbRamp, cutRun, PAL } from './town-buildings.js';
import { CUT } from './town-atlas.js';
import { GL } from './town-mat.js';
import { BUSINESSES } from './town-atlas.js';
import { WL } from './town-mat.js';

export function rayDepth(poly, x, z, nx, nz) {
  let best = 1e9;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], den = nx * ez - nz * ex; if (Math.abs(den) < 1e-9) continue;
    const ax = a[0] - x, az = a[1] - z, t = (ax * ez - az * ex) / den, u = (ax * nz - az * nx) / den;
    if (t > 0.3 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return best;
}
// Lot frame on the property line s metres along a block side: +Z faces the street.
export function sideFrame(side, s) { return { x: side.i0[0] + side.dx * s, z: side.i0[1] + side.dz * s, h: Math.atan2(-side.nx, -side.nz) }; }

// Where an ambulance pulls up for something fronting half-edge `he` near world point (wx,wz): the kerb-side traffic
// lane, kept clear of the junction boxes; and a spot on the sidewalk beside it.
export function kerbStop(T, he, wx, wz) {
  const e = he.e, f = he.from, len = e.length, lo = f.radius + 12, hi = len - he.to.radius - 12;
  let s = (wx - f.x) * he.dx + (wz - f.z) * he.dz; s = lo < hi ? Math.max(lo, Math.min(hi, s)) : len / 2;
  const rx = -he.dz, rz = he.dx, off = e.median / 2 + (e.lanes - 0.5) * e.laneWidth, so = e.width / 2 + Math.max(0.8, Math.min(he.sw * 0.6, 2.2));
  const cx = f.x + he.dx * s, cz = f.z + he.dz * s;
  return { stop: { x: cx + rx * off, z: cz + rz * off, heading: Math.atan2(he.dx, he.dz) }, spot: { x: cx + rx * so, z: cz + rz * so } };
}
const usedNums = new Set();
export function addressNumber(T, side, wx, wz, force) {
  const e = side.e, a = T.L.nodes[e.a], sE = (wx - a.x) * e.dir.x + (wz - a.z) * e.dir.z;
  const t = Math.max(0, Math.min(0.999, (e.blkS + (e.fwdName ? sE : e.length - sE)) / e.blkLen)), even = side.he.fwd === e.fwdName;
  let n = force || e.blk * 100 + 2 * Math.round(t * 24) + (even ? 0 : 1);
  if (!force && n % 100 < 2) n += 2;
  while (!force && usedNums.has(e.name + n)) n += 2;
  usedNums.add(e.name + n); return n;
}
export function addAddress(T, side, B, doorL, kind, district, force, extra = {}) {
  const door = B.w(doorL[0], doorL[1]), fc = B.w(0, 0), number = addressNumber(T, side, fc[0], fc[1], force), ks = kerbStop(T, side.he, fc[0], fc[1]);
  const a = { id: 'a' + T.addresses.length, label: `${number} ${side.e.name}`, street: side.e.name, number, x: door[0], z: door[1], stop: ks.stop, spot: ks.spot, kind, district, ...extra };
  T.addresses.push(a); return a;
}

const DIST = {
  residential: { w: [16, 21], d: [20, 30] }, bungalow: { w: [12.5, 15.5], d: [16, 24] },
  oldtown: { w: [6.5, 11], d: [13, 22], zero: true }, downtown: { w: [24, 40], d: [18, 32], zero: true }, midtown: { w: [15, 26], d: [14, 24], zero: true },
  industrial: { w: [42, 68], d: [30, 52] }, mixed: { w: [26, 40], d: [28, 40] }, strip: { w: [28, 42], d: [30, 42] }, retail: { w: [30, 44], d: [30, 42] }, campus: { w: [24, 36], d: [18, 30], zero: true },
};
const INDUSTRY = ['Ketter Valley Steel', 'Northbank Lumber', 'Pacific Cold Storage', 'Halloran Machine Works', 'Tri-County Plumbing Supply', 'Falls Recycling', 'Summit Fabrication', 'Riverside Auto Body', 'Evergreen Beverage', 'Mill Race Self Storage', 'Kestrel Electric Supply', 'Foundry Row Tile & Stone', 'Ketter Truck & Diesel', 'Quarry Road Aggregates', 'Orchard Packing Co.', 'Tannery Flats Brewing', 'Blue Tarp Rentals', 'Cannery Row Seafood', 'Depot Street Print Works', 'Valley Propane', 'Northwest Pallet', 'Halloran Door & Sash', 'Pioneer Sheet Metal', 'Ketter Feed & Seed'];
const STRIP = [['Halloran Tire & Brake', '#b3161a', '#ffffff'], ['Dollar Corner', '#f2c21a', '#1a1a1a'], ['Valley Auto Parts', '#17479e', '#ffffff'], ['Burger Barn', '#d8421e', '#fff4d6'], ['Ketter Lanes Bowling', '#2b1f4f', '#f7c948'], ['QuickLube', '#14633a', '#ffffff'], ['Family Pharmacy', '#f4f1ea', '#b3161a'], ['Rent-It Center', '#e06a12', '#ffffff'], ['Falls Furniture Outlet', '#3a2a1e', '#f0d9a8'], ['Pacific Paint & Decor', '#1a6d7a', '#ffffff'], ['Teriyaki Garden', '#1d1d1d', '#e9b33a'], ['Cellular Corner', '#6a1b9a', '#ffffff'], ['Big Pine Sporting Goods', '#1f4d2b', '#f3ead0'], ['Sunset Car Wash', '#0d6fb8', '#ffe45c'], ['Wok Express', '#b3161a', '#f7e7b0'], ['Coin Laundry', '#f4f1ea', '#17479e']];

export function initLots(T) {
  usedNums.clear();
  const L = T.L, rng = makeRng(T.seed * 31 + 5);
  const names = BUSINESSES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[names[i], names[j]] = [names[j], names[i]]; }
  T.nameQ = names; T.indQ = INDUSTRY.slice(); T.stripQ = STRIP.slice();
  for (const b of L.blocks) { b.used = b.used || []; b.rng = makeRng(T.seed + b.id * 7919); }
}
export function buildLots(T) { for (const b of T.L.blocks) fillBlock(T, b); }

function fillBlock(T, b) {
  if (b.river || b.noFill) return;
  const D = DIST[b.district] || DIST.mixed, r = b.rng, lots = [];
  const sides = b.sides.filter(s => s.e.cls !== 'bypass' && s.e.cls !== 'alley' && !s.e.bridge && s.ilen >= D.w[0] + 2 && !s.noLots).sort((p, q) => q.e.rank - p.e.rank || q.ilen - p.ilen);
  for (const side of sides) {
    const Ls = side.ilen; let s = 0.6; const mine = [];
    while (s < Ls - D.w[0] - 0.6) {
      let w = r.r(D.w[0], D.w[1]); const rem = Ls - 0.6 - s;
      if (w > rem) w = rem; else if (rem - w < D.w[0]) w = rem <= D.w[1] * 1.3 ? rem : rem / 2;
      const fr = sideFrame(side, s + w / 2), avail = rayDepth(b.inner, fr.x + side.nx * 0.2, fr.z + side.nz * 0.2, side.nx, side.nz);
      let placed = null;
      for (const want of [Math.min(D.d[1], avail / 2 - 0.5), Math.min(D.d[1], avail - 1.5) * 0.8, D.d[0]]) {
        if (want < D.d[0] - 0.01) continue;
        const o = obb(fr.x + side.nx * (want / 2 + 0.06), fr.z + side.nz * (want / 2 + 0.06), w / 2 - 0.04, want / 2, fr.h);
        if (obbInPoly(o, b.inner) && !b.used.some(u => obbOverlap(o, u, -0.2))) { placed = { o, d: want }; break; }
      }
      if (!placed) { s += 3; continue; }
      b.used.push(placed.o); mine.push({ side, s: s + w / 2, w, d: placed.d, fr, s0: s, s1: s + w }); s += w;
    }
    mine.forEach((l, i) => { l.exposeR = !(i > 0 && Math.abs(mine[i - 1].s1 - l.s0) < 0.3); l.exposeL = !(i + 1 < mine.length && Math.abs(mine[i + 1].s0 - l.s1) < 0.3); l.corner = i === 0 || i === mine.length - 1; });
    lots.push(...mine);
  }
  for (const l of lots) buildLot(T, b, l);
  // left-over middle of a commercial block becomes a car park
  if (['downtown', 'oldtown', 'midtown', 'campus'].includes(b.district) && b.sides.length) {
    const side = b.sides.reduce((a, c) => c.ilen > a.ilen ? c : a), h = Math.atan2(-side.nx, -side.nz);
    let hw = 5, hd = 5; const fits = (a, c) => { const o = obb(b.cx, b.cz, a, c, h); return obbInPoly(o, b.inner) && !b.used.some(u => obbOverlap(o, u, 0.6)); };
    if (pointInPoly(b.cx, b.cz, b.inner) && fits(hw, hd)) {
      let grew = true; while (grew && (hw < 30 || hd < 24)) { grew = false; if (hw < 30 && fits(hw + 1, hd)) { hw++; grew = true; } if (hd < 24 && fits(hw, hd + 1)) { hd++; grew = true; } }
      if (hw >= 7 && hd >= 8.5) { const B = ctx(T, b.cx, b.cz, h); carPark(B, -hw, -hd, hw, hd, { rng: r, occ: 0.45 }); b.used.push(obb(b.cx, b.cz, hw, hd, h)); }
    }
  }
}

function nextName(T, kinds) { const q = T.nameQ; let i = q.findIndex(n => !kinds || kinds.includes(n[1])); if (i < 0) i = 0; const n = q.splice(i, 1)[0] || ['Halloran Falls Trading Co.', 'shop']; if (q.length < 6) q.push(...BUSINESSES.filter(b => !q.includes(b))); return n; }

export function buildLot(T, b, l) {
  const r = b.rng, side = l.side, D = b.district, sw = side.he.sw;
  if (D === 'residential' || D === 'bungalow') {
    // walk-up apartments where a residential block faces an arterial
    if (D === 'residential' && side.e.cls === 'arterial' && l.w >= 17 && l.d >= 20 && r.chance(0.45)) {
      const B = ctx(T, l.fr.x + side.nx * 4.5, l.fr.z + side.nz * 4.5, l.fr.h), w = l.w - 4;
      tower(B, { w, d: Math.min(15, l.d - 8), floors: 3, kind: 'apartment', rng: r, exposeL: true, exposeR: true });
      const Bf = ctx(T, l.fr.x, l.fr.z, l.fr.h); Bf.d.lay(1).col(228, 226, 220); Bf.d.gquad(-1, -4.5, 1, -4.5, 1, 0.45, -1, 0.45, 0.02, 0, 0, 2, 0, 2, 5, 0, 5);
      hedge(Bf, -w / 2, -1.2, -1.8, -1.2, 1.0); hedge(Bf, 1.8, -1.2, w / 2, -1.2, 1.0); Bf.tree(-l.w / 2 + 1.5, -2.2, 'maple', r.r(0.8, 1.1));
      const n = r.i(6, 12), a0 = addAddress(T, side, Bf, [0, -4.4], 'apartment', D); a0.units = n; return;
    }
    const B = ctx(T, l.fr.x, l.fr.z, l.fr.h), fc = [l.fr.x, l.fr.z], small = D === 'bungalow' || !!l.small;
    const force = l.force, number = force || addressNumber(T, side, fc[0], fc[1]); usedNums.delete(side.e.name + number);
    const hs = house(B, { lotW: l.w, lotD: l.d, small, rng: r, number, sw, hl: l.hl });
    const a = addAddress(T, side, B, hs.door, 'house', D, number); if (l.onAddress) l.onAddress(a, B, hs);
    // yard: fence or hedge round the back, trees, foundation shrubs
    const hw = l.w / 2 - 0.15, back = -l.d + 0.2, fz = hs.z0 + 1, k = r();
    if (k < (small ? 0.36 : 0.5)) { const c = r.pick([[176, 150, 120], [150, 128, 104], [196, 190, 180], [120, 100, 84]]); woodFence(B, -hw, back, hw, back, 1.8, c); woodFence(B, -hw, fz, -hw, back, 1.8, c); woodFence(B, hw, back, hw, fz, 1.8, c); }
    else if (k < (small ? 0.68 : 0.6)) { chainFence(B, -hw, back, hw, back, 1.3); chainFence(B, -hw, fz, -hw, back, 1.3); chainFence(B, hw, back, hw, fz, 1.3); }
    else if (k < 0.84) { hedge(B, -hw, back + 0.4, hw, back + 0.4, r.r(1.4, 2.2), 1.1); }
    // garden beds along the front wall, planted
    for (const sx of [-1, 1]) { const bx0 = sx > 0 ? hs.door[0] + 2.7 : hs.hx0 + 0.2, bx1 = sx > 0 ? hs.hx1 - 0.2 : hs.door[0] - 2.7; if (bx1 - bx0 < 1.6 || !r.chance(0.75)) continue; B.d.lay(GL.gravel).col(118, 96, 80); B.d.gquad(bx0, hs.z1 + 0.02, bx1, hs.z1 + 0.02, bx1, hs.z1 + 1.05, bx0, hs.z1 + 1.05, 0.016, bx0, 0, bx1, 0, bx1, 1, bx0, 1); const nbu = Math.max(1, Math.round((bx1 - bx0) / 1.5)); for (let i = 0; i < nbu; i++) B.tree(bx0 + (i + 0.5) * (bx1 - bx0) / nbu, hs.z1 + 0.55, 'bush', r.r(0.55, 0.95)); }
    // picket fence along the front on some lots, open at the walk and the drive
    if (!small && r.chance(0.2)) { const gaps = [[hs.door[0] - 0.9, hs.door[0] + 0.9]]; if (hs.drive) gaps.push([hs.drive[0] - hs.drive[2] / 2 - 0.3, hs.drive[0] + hs.drive[2] / 2 + 0.3]); gaps.sort((p, q) => p[0] - q[0]); let x = -hw; for (const gp of gaps.concat([[hw, hw]])) { if (gp[0] - x > 1) cutRun(B, CUT.picket, x, -0.35, gp[0], -0.35, 0, 0.95, [240, 238, 232], 2.0); x = Math.max(x, gp[1]); } }
    // wheelie bins by the side of the house
    if (r.chance(0.55)) { const bx = (hs.drive && hs.drive[0] > 0 ? hs.hx0 - 0.7 : hs.hx1 + 0.7), p = B.p; if (Math.abs(bx) < hw - 0.6) for (let i = 0; i < 2; i++) { const c = i ? [40, 70, 110] : [44, 64, 48]; p.lay(WL.plain).col(c[0], c[1], c[2]); p.box(bx - 0.28, 0, hs.z1 - 1.6 - i * 0.7, bx + 0.28, 1.0, hs.z1 - 1.0 - i * 0.7, 31); p.col(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7).box(bx - 0.31, 1.0, hs.z1 - 1.63 - i * 0.7, bx + 0.31, 1.07, hs.z1 - 0.97 - i * 0.7, 31); } }
    if (r.chance(0.35) && !small) hedge(B, -hw + 0.3, -0.7, hs.drive ? Math.min(hw - 0.3, hs.drive[0] - hs.drive[2] / 2 - 0.6) : hw - 0.3, -0.7, r.r(0.7, 1.1), 0.8);
    const tk = () => r.pick(['maple', 'maple', 'alder', 'oak', 'fir', 'cedar', 'birch']);
    if (r.chance(0.85)) { const tx = r.r(-hw + 2, hw - 2); if (!hs.drive || Math.abs(tx - hs.drive[0]) > hs.drive[2] / 2 + 1.6) B.tree(tx, r.r(-4.5, -2.2), tk(), r.r(0.7, 1.05)); }
    const nb = r.i(small ? 0 : 1, small ? 2 : 3); for (let i = 0; i < nb; i++) B.tree(r.r(-hw + 2.5, hw - 2.5), r.r(back + 3, hs.z0 - 3.5), tk(), r.r(0.85, 1.3));
    for (const sx of [-1, 1]) if (r.chance(0.6)) B.tree((sx > 0 ? hs.hx1 : hs.hx0) - sx * r.r(0.8, 2.2), hs.z1 + 0.9, 'bush', r.r(0.7, 1.2));
    if (hs.drive) { if (r.chance(0.62)) { const c = B.w(hs.drive[0] + (hs.drive[2] > 4 ? r.pick([-1.3, 1.3]) : 0), hs.drive[3] + 3.4); T.parking.push({ x: c[0], z: c[1], heading: l.fr.h + (r.chance(0.7) ? Math.PI : 0), kind: 'drive' }); } const c = B.w(hs.drive[0], hs.drive[4]); side.cuts = side.cuts || []; side.cuts.push([c[0], c[1], hs.drive[2] / 2 + 1]); }
    const mb = B.w(hs.drive ? hs.drive[0] + hs.drive[2] / 2 + 0.7 : l.w / 2 - 1.2, sw - 0.55); T.mailboxes.push({ x: mb[0], z: mb[1], h: l.fr.h });
    return;
  }
  if (D === 'oldtown') {
    const B = ctx(T, l.fr.x, l.fr.z, l.fr.h), nm = l.name || nextName(T);
    storefront(B, { w: l.w, d: l.d, floors: l.corner ? 3 : r.chance(0.55) ? 2 : 3, rng: r, name: nm[0], exposeL: l.exposeL, exposeR: l.exposeR, hl: l.hl });
    const a = addAddress(T, side, B, [0, 0.6], nm[1], D, null, { name: nm[0] }); if (l.onAddress) l.onAddress(a, B); return;
  }
  if (D === 'downtown' || D === 'midtown' || D === 'campus') {
    const B = ctx(T, l.fr.x, l.fr.z, l.fr.h), dt = D === 'downtown', k = r();
    if (dt && !T.parkadeDone && l.w > 30 && l.d > 26 && side.e.cls !== 'arterial') { T.parkadeDone = true; parkade(B, { w: l.w - 0.5, d: l.d, floors: 5, rng: r, sign: true }); return; }
    let kind, floors;
    if (dt) { kind = k < 0.34 ? 'glass' : k < 0.62 ? 'precast' : k < 0.86 ? 'brick' : !T.hotelDone ? 'hotel' : 'precast'; floors = r.i(6, l.corner ? 14 : 11); if (kind === 'brick') floors = r.i(5, 9); }
    else { kind = k < 0.4 ? 'brick' : k < 0.75 ? 'apartment' : 'precast'; floors = r.i(3, 6); }
    let nm = null, akind = kind === 'apartment' ? 'apartment' : 'office';
    if (kind === 'hotel') { T.hotelDone = true; nm = ['Hotel Ketter', 'hotel']; floors = 11; akind = 'hotel'; }
    else if (kind !== 'apartment' && r.chance(0.65)) { nm = nextName(T, ['office', 'shop', 'restaurant']); if (kind === 'brick' && !dt) akind = nm[1]; }
    tower(B, { w: l.w - (l.exposeL && l.exposeR ? 0 : 0), d: l.d, floors, kind, rng: r, name: nm && nm[0], exposeL: l.exposeL, exposeR: l.exposeR, hl: l.hl });
    const a = addAddress(T, side, B, [0, 0.6], akind, D, null, nm ? { name: nm[0] } : {}); if (kind === 'apartment') a.units = floors * 4; return;
  }
  if (D === 'industrial') {
    const set = Math.min(r.r(9, 14), l.d - 20), B = ctx(T, l.fr.x, l.fr.z, l.fr.h), w = l.w - r.r(8, 14), d = l.d - set - 1.5, nm = (T.indQ.length ? T.indQ : (T.indQ = INDUSTRY.slice())).splice(Math.floor(r() * T.indQ.length), 1)[0];
    const off = 0;
    const wh = warehouse(B, { w, d, rng: r, name: nm, setback: set, lay: r.chance(0.2) ? WL.brick : undefined, col: r.chance(0.2) ? [240, 236, 232] : undefined });
    // fenced yard with a gate gap, something stored beside the shed
    const hw = l.w / 2 - 0.3, gap = r.r(-hw + 8, hw - 8);
    if (r.chance(0.75)) { chainFence(B, -hw, -0.6, gap - 4, -0.6); chainFence(B, gap + 4, -0.6, hw, -0.6); chainFence(B, -hw, -l.d + 0.5, -hw, -0.6); chainFence(B, hw, -0.6, hw, -l.d + 0.5); }
    kerbRamp(B, gap - 3.5, gap + 3.5, sw, side);
    const sx = off + (r.chance(0.5) ? 1 : -1) * (w / 2 + 3.2); if (Math.abs(sx) < hw - 2.5) yardStuff(B, sx, -set - d * r.r(0.3, 0.7), r);
    for (let i = 0; i < 3; i++) if (r.chance(0.5)) { const c = B.w(-hw + 3 + i * 3, -set + 3.2); T.parking.push({ x: c[0], z: c[1], heading: l.fr.h + Math.PI, kind: 'lot' }); }
    addAddress(T, side, B, [off - w / 2 + 3, -set + 0.8], 'industrial', D, null, { name: nm }); void wh; return;
  }
  // roadside commercial: a box set back behind its own parking
  const set = Math.min(r.r(14, 18), l.d - 12), B = ctx(T, l.fr.x, l.fr.z, l.fr.h), w = l.w - r.r(3, 7), d = l.d - set - 1.2;
  const st = (T.stripQ.length ? T.stripQ : (T.stripQ = STRIP.slice())).splice(Math.floor(r() * T.stripQ.length), 1)[0];
  shopBox(B, { w, d, h: r.r(4.8, 6.2), rng: r, name: st[0], signBg: st[1], signFg: st[2], setback: set, lay: r.chance(0.5) ? WL.stucco : WL.panel, col: r.pick(PAL.stucco), band: r.chance(0.5) ? r.pick(PAL.awning) : null, font: r.i(0, 7) });
  carPark(B, -l.w / 2 + 1, -set + 2.2, l.w / 2 - 1, -1.2, { rng: r, occ: 0.35 }); kerbRamp(B, -l.w / 2 + 3, -l.w / 2 + 9.5, sw, side);
  addAddress(T, side, B, [0, -set + 0.8], /Burger|Teriyaki|Wok/.test(st[0]) ? 'restaurant' : 'shop', D, null, { name: st[0] });
}

// Stuff that accumulates beside industrial sheds: tanks, stacked containers, pallets.
export function yardStuff(B, x, z, r) {
  const p = B.p, k = r();
  if (k < 0.35) { const rad = r.r(1.6, 2.6), h = r.r(4.5, 8); p.lay(WL.plain).col(206, 208, 206); p.cyl(x, z, 0.3, h, rad, rad, 14); p.cyl(x, z, h, h + rad * 0.3, rad, rad * 0.2, 14); p.lay(WL.panel).col(160, 160, 156); p.cyl(x, z, 0, 0.3, rad + 0.3, rad + 0.3, 14); p.lay(WL.plain + 32).col(120, 124, 128); p.box(x + rad, 0.3, z - 0.25, x + rad + 0.06, h, z + 0.25, 15); B.collide(x - rad, z - rad, x + rad, z + rad, h, 'building'); }
  else if (k < 0.75) { const cols = [[150, 60, 40], [40, 80, 120], [60, 110, 70], [170, 140, 50], [120, 120, 124], [140, 50, 60]]; const n = r.i(1, 3); for (let i = 0; i < n; i++) { const c = r.pick(cols), y = i * 2.6; p.lay(WL.metal).col(c[0], c[1], c[2]); p.box(x - 1.22, y, z - 3.05, x + 1.22, y + 2.59, z + 3.05, 63); } B.collide(x - 1.22, z - 3.05, x + 1.22, z + 3.05, n * 2.6, 'building'); }
  else { p.lay(WL.wood).col(190, 170, 140); for (let i = 0; i < 4; i++) { const px = x + (i % 2) * 1.4 - 0.7, pz = z + Math.floor(i / 2) * 1.5 - 0.75, h = r.r(0.3, 1.5); p.box(px - 0.6, 0, pz - 0.5, px + 0.6, h, pz + 0.5, 31); } B.collide(x - 1.4, z - 1.3, x + 1.4, z + 1.3, 1.2, 'prop'); }
}
