// Building generators. Everything is authored in a lot frame: origin on the property line at the middle of the lot's
// frontage, +Z towards the street, +X to the right as seen from the street, y = 0 at lot level (kerb height).
// A build context `B` (see ctx()) bundles the chunk builders for that spot: f = facade walls with shader windows,
// p = plain surfaces (roofs, trim, props), d = ground decals (drives, walks), s = signs, c = alpha cut-outs.
// Window styles and lit profiles are documented with the facade shader in town-mat.js.

import { WL, GL, METAL } from './town-mat.js';
import { KERB } from './town-layout.js';
import { SIGN, CUT, cutUV } from './town-atlas.js';
import { obb } from './town-geo.js';

export function ctx(T, x, z, h) {
  const ch = T.chunks, B = { T, x, z, h, c0: Math.cos(h), s0: Math.sin(h) };
  // builders are shared per chunk, so each context re-applies its own frame whenever it takes one over
  for (const [k, kind] of [['f', 'facade'], ['p', 'plain'], ['d', 'decal'], ['s', 'sign'], ['c', 'cut']]) { const mb = ch.get(kind, x, z); Object.defineProperty(B, k, { get() { if (mb._owner !== B) { mb._owner = B; mb.st.length = 0; mb.frame(x, KERB, z, h); } return mb; } }); }
  B.w = (lx, lz) => [x + lx * B.c0 + lz * B.s0, z - lx * B.s0 + lz * B.c0];
  B.collide = (x0, z0, x1, z1, hgt, kind = 'building', soft = false) => { const c = B.w((x0 + x1) / 2, (z0 + z1) / 2); T.colliders.add(c[0], c[1], Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, h, hgt, kind, soft); return c; };
  B.foot = (x0, z0, x1, z1, hl) => { const c = B.w((x0 + x1) / 2, (z0 + z1) / 2), o = obb(c[0], c[1], Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, h); o.hl = hl; T.footprints.push(o); T.surf.fillObb(o, 6); return o; };
  B.tree = (lx, lz, kind, scale = 1) => { const c = B.w(lx, lz); T.trees.push({ x: c[0], z: c[1], kind, s: scale }); };
  return B;
}

const C = (m, c) => m.col(c[0], c[1], c[2]);
// small per-building drift so neighbours built from the same palette entry do not match exactly
export const jit = (c, r, k = 0.1) => { const m = 1 - k * r(), w = (r() - 0.5) * k * 0.6; return [c[0] * m * (1 + w), c[1] * m, c[2] * m * (1 - w)]; };
export const PAL = {
  siding: [[245, 243, 236], [236, 224, 190], [228, 208, 150], [160, 178, 150], [140, 160, 178], [112, 124, 134], [150, 64, 54], [66, 82, 106], [196, 172, 140], [176, 204, 188], [124, 96, 74], [168, 168, 162], [206, 190, 170], [92, 112, 96]],
  stucco: [[226, 208, 172], [232, 226, 210], [212, 166, 142], [190, 192, 186], [222, 196, 140], [172, 186, 198], [198, 208, 180], [226, 186, 160], [206, 178, 150]],
  brick: [[255, 250, 246], [236, 232, 228], [255, 236, 226], [224, 226, 232]],
  roof: [[255, 255, 255], [255, 228, 204], [226, 244, 226], [255, 206, 190], [188, 190, 196], [240, 240, 250]],
  trim: [[240, 238, 232], [236, 236, 230], [60, 60, 62], [228, 220, 200]],
  awning: [[38, 70, 52], [112, 30, 34], [34, 48, 84], [28, 28, 30], [176, 150, 110], [150, 80, 30], [70, 30, 60]],
  panel: [[236, 230, 218], [222, 208, 184], [206, 204, 200], [244, 238, 226], [190, 180, 166], [228, 214, 196], [214, 196, 170], [200, 190, 182]],
  dark: [[58, 66, 74], [44, 50, 58], [70, 78, 84], [52, 60, 56], [80, 72, 66]],
  metal: [[210, 212, 214], [176, 190, 200], [200, 196, 180], [150, 160, 150], [190, 170, 150], [120, 138, 160], [224, 222, 214]],
};

// ---------------------------------------------------------------- wall helpers

// Wall from (x0,z0) to (x1,z1), left to right as seen from outside, split into cells: [{ w, st, ww, wh, lit, rec }]
// (st < 0 or undefined = blank wall). Cell widths are scaled to fill the wall.
export function wallCells(B, x0, z0, x1, z1, y0, y1, cells, seed = 1) {
  const f = B.f, W = Math.hypot(x1 - x0, z1 - z0); let sum = 0; for (const c of cells) sum += c.w; const k = W / sum, dx = (x1 - x0) / W, dz = (z1 - z0) / W; let u = 0;
  for (const c of cells) {
    const w = c.w * k; if (w < 0.01) continue;
    if (c.st === undefined || c.st < 0) f.wn(0); else f.wn(w, y1 - y0, Math.min(c.ww, w - 0.1), Math.min(c.wh, y1 - y0 - 0.06), seed + Math.round(u * 3), c.st, c.rec ?? 0.14, c.lit ?? 0, u, y0);
    f.wall(x0 + dx * u, z0 + dz * u, x0 + dx * (u + w), z0 + dz * (u + w), y0, y1, u, y0); u += w;
  }
  f.wn(0);
}
// Regular window grid centred on the wall. o: { cw, fh, ww, wh, st, lit, rec, margin, seed }
export function wallGrid(B, x0, z0, x1, z1, y0, y1, o) {
  const f = B.f, W = Math.hypot(x1 - x0, z1 - z0), m = o.margin ?? 0.5, n = o.cw ? Math.floor((W - 2 * m) / o.cw) : 0;
  if (n < 1 || y1 - y0 < 1.2) { f.wn(0); f.wall(x0, z0, x1, z1, y0, y1, 0, y0); return 0; }
  const cw = o.fit ? (W - 2 * m) / n : o.cw, gw = n * cw, left = (W - gw) / 2, dx = (x1 - x0) / W, dz = (z1 - z0) / W, ny = Math.max(1, Math.round((y1 - y0) / o.fh)), ch = (y1 - y0) / ny;
  if (left > 0.01) { f.wn(0); f.wall(x0, z0, x0 + dx * left, z0 + dz * left, y0, y1, 0, y0); f.wall(x0 + dx * (left + gw), z0 + dz * (left + gw), x1, z1, y0, y1, left + gw, y0); }
  f.wn(cw, ch, Math.min(o.ww, cw - 0.08), Math.min(o.wh, ch - 0.1), o.seed ?? 1, o.st ?? 0, o.rec ?? 0.14, o.lit ?? 0, left, y0);
  f.wall(x0 + dx * left, z0 + dz * left, x0 + dx * (left + gw), z0 + dz * (left + gw), y0, y1, left, y0);
  f.wn(0); return n;
}
// The four walls of a rectangle in order front (+Z), right (+X), back (-Z), left (-X).
export const SIDES = (x0, z0, x1, z1) => [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];

// Flat roof with parapet, coping and a scatter of plant. Returns nothing; walls must already reach `top`.
export function flatRoof(B, x0, z0, x1, z1, top, par, wallLay, wallCol, rng, plant = 1) {
  const p = B.p, ry = top - par;
  p.lay(WL.roof).col(255, 252, 248); p.box(x0, ry - 0.2, z0, x1, ry, z1, 16);
  p.lay(wallLay); C(p, wallCol);
  for (const s of SIDES(x0, z0, x1, z1)) p.wall(s[2], s[3], s[0], s[1], ry, top);                   // parapet inner faces
  p.lay(WL.panel).col(205, 203, 196);
  p.box(x0 - 0.06, top, z1 - 0.3, x1 + 0.06, top + 0.08, z1 + 0.06); p.box(x0 - 0.06, top, z0 - 0.06, x1 + 0.06, top + 0.08, z0 + 0.3);
  p.box(x0 - 0.06, top, z0 + 0.3, x0 + 0.3, top + 0.08, z1 - 0.3); p.box(x1 - 0.3, top, z0 + 0.3, x1 + 0.06, top + 0.08, z1 - 0.3);
  const w = x1 - x0, d = z1 - z0; if (w < 5 || d < 5 || !plant) return;
  const n = Math.min(7, Math.floor(w * d / 90 * plant) + 1);
  for (let i = 0; i < n; i++) {
    const cx = rng.r(x0 + 1.6, x1 - 1.6), cz = rng.r(z0 + 1.6, z1 - 1.6), k = rng();
    if (k < 0.5) { const sx = rng.r(0.9, 1.8), sz = rng.r(0.9, 1.5), sy = rng.r(0.7, 1.2); p.lay(WL.plain + METAL).col(188, 190, 190); p.box(cx - sx / 2, ry + 0.15, cz - sz / 2, cx + sx / 2, ry + 0.15 + sy, cz + sz / 2); p.lay(WL.plain).col(40, 42, 44); p.cyl(cx, cz, ry + 0.15 + sy, ry + 0.2 + sy, Math.min(sx, sz) * 0.36, Math.min(sx, sz) * 0.36, 10); p.col(90, 90, 90).box(cx - sx / 2 + 0.1, ry, cz - sz / 2 + 0.1, cx + sx / 2 - 0.1, ry + 0.15, cz + sz / 2 - 0.1, 15); }
    else if (k < 0.72) { p.lay(WL.plain + METAL).col(170, 172, 172); p.cyl(cx, cz, ry, ry + rng.r(0.5, 1.1), 0.16, 0.16, 7); p.cyl(cx, cz, ry + 0.9, ry + 1.05, 0.26, 0.2, 7); }
    else if (k < 0.9 && w > 9 && d > 8) { const sx = rng.r(2.4, 3.4), sz = rng.r(2.4, 3.2); p.lay(wallLay); C(p, wallCol); p.box(cx - sx / 2, ry, cz - sz / 2, cx + sx / 2, ry + 2.6, cz + sz / 2); p.lay(WL.plain).col(70, 74, 78); p.box(cx - 0.45, ry, cz + sz / 2, cx + 0.45, ry + 2.05, cz + sz / 2 + 0.04, 1 + 4 + 8 + 16); }
    else { p.lay(WL.plain).col(120, 122, 120); p.box(cx - 0.3, ry, cz - 1.2, cx + 0.3, ry + 0.25, cz + 1.2); }
  }
}

export function signQuad(B, rect, cx, cy, cz, w, h, rot = 0, glow = 0, flick = 0) {
  const s = B.s; s.col(Math.min(255, Math.round(glow * 60)), flick ? 255 : 0, (cx * 37 + cz * 11) & 255).lay(0);
  s.push(cx, cy, cz, rot); s.quad(-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0, rect.u0, rect.v0, rect.u1, rect.v1); s.pop();
}
// A boxed fascia sign (cabinet + lettered face). Illuminated cabinets glow at night.
export function boxSign(B, rect, cx, cy, cz, w, h, rot = 0, glow = 2.2, depth = 0.14, back = [40, 42, 46]) {
  const p = B.p; p.lay(WL.plain); C(p, back); p.push(cx, cy, cz, rot); p.box(-w / 2 - 0.04, -h / 2 - 0.04, -depth, w / 2 + 0.04, h / 2 + 0.04, 0, 1 + 2 + 4 + 8 + 16 + 32); p.pop();
  signQuad(B, rect, cx + Math.sin(rot) * 0.012, cy, cz + Math.cos(rot) * 0.012, w, h, rot, glow);
}

// Cut-out fence / railing run between two local points, split into panels so the atlas tile repeats.
export function cutRun(B, tile, x0, z0, x1, z1, y0, hgt, col = [255, 255, 255], panel = 2.5) {
  const c = B.c, L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / panel)), uv = cutUV(tile); c.col(col[0], col[1], col[2]).lay(0);
  for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n, ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b; c.quad(ax, y0, az, bx, y0, bz, bx, y0 + hgt, bz, ax, y0 + hgt, az, uv.u0, uv.v0, uv.u1, uv.v1); }
}

// ---------------------------------------------------------------- pitched roofs

// Gable roof over a rectangle centred (cx,cz), half-extents hx (along the ridge) and hz (across), rotated rot.
// Emits both slopes (shingles on top, painted boards underneath), fascias and the two gable-end triangles.
export function gableRoof(B, cx, cz, hx, hz, yT, pitch, rot, wallLay, wallCol, roofCol, ov = 0.45, rake = 0.3, gables = true) {
  const p = B.p, rise = hz * pitch, yR = yT + rise, yE = yT - ov * pitch, th = 0.14;
  p.push(cx, 0, cz, rot);
  for (const sd of [1, -1]) {
    const ze = sd * (hz + ov), xa = sd > 0 ? -hx - rake : hx + rake, xb = -xa;
    p.lay(WL.shingle); C(p, roofCol); p.quad(xa, yE, ze, xb, yE, ze, xb, yR, 0, xa, yR, 0, 0, 0);
    p.lay(WL.plain).col(232, 230, 224);
    p.quad(xb, yE - th, ze, xa, yE - th, ze, xa, yR - th, 0, xb, yR - th, 0, 0, 0);                    // soffit / underside
    p.quad(xa, yE - th, ze, xb, yE - th, ze, xb, yE + 0.02, ze, xa, yE + 0.02, ze, 0, 0);              // eave fascia
    for (const gx of [xa, xb]) { const out = (gx > 0) === (sd > 0); if (out) p.quad(gx, yE - th, ze, gx, yR - th, 0, gx, yR + 0.02, 0, gx, yE + 0.02, ze, 0, 0); else p.quad(gx, yR - th, 0, gx, yE - th, ze, gx, yE + 0.02, ze, gx, yR + 0.02, 0, 0, 0); }
    // gutter along the eave
    p.lay(WL.plain + METAL).col(214, 214, 210); p.box(Math.min(xa, xb) + 0.1, yE - th - 0.02, sd > 0 ? ze : ze - 0.11, Math.max(xa, xb) - 0.1, yE - th + 0.1, sd > 0 ? ze + 0.11 : ze, 1 + 2 + 32);
  }
  p.lay(WL.shingle).col(200, 200, 200); p.box(-hx - rake, yR - 0.03, -0.12, hx + rake, yR + 0.07, 0.12, 1 + 2 + 16);   // ridge cap
  if (gables) { p.lay(wallLay); C(p, wallCol); p.tri3(hx, yT, hz, hx, yT, -hz, hx, yR - 0.05, 0, 0, yT); p.tri3(-hx, yT, -hz, -hx, yT, hz, -hx, yR - 0.05, 0, 0, yT); }
  p.pop();
  return yR;
}
// Hip roof (four slopes) over the same kind of rectangle.
export function hipRoof(B, cx, cz, hx, hz, yT, pitch, rot, roofCol, ov = 0.5) {
  const p = B.p, ex = hx + ov, ez = hz + ov, yE = yT - ov * pitch, rise = ez * pitch, yR = yE + rise, rl = Math.max(0, ex - ez);
  p.push(cx, 0, cz, rot);
  p.lay(WL.shingle); C(p, roofCol);
  p.quad(-ex, yE, ez, ex, yE, ez, rl, yR, 0, -rl, yR, 0, 0, 0); p.quad(ex, yE, -ez, -ex, yE, -ez, -rl, yR, 0, rl, yR, 0, 0, 0);
  p.tri3(ex, yE, ez, ex, yE, -ez, rl, yR, 0); p.tri3(-ex, yE, -ez, -ex, yE, ez, -rl, yR, 0);
  p.lay(WL.plain).col(232, 230, 224); p.box(-ex, yE - 0.14, -ez, ex, yE, ez, 1 + 2 + 4 + 8 + 32);
  p.pop(); return yR;
}

// ---------------------------------------------------------------- houses

// Detached house on a lot lotW wide, lotD deep. o: { lotW, lotD, small, rng, number, sw (sidewalk width to the kerb) }
// Returns { door: [lx,lz], drive: [lx,lz,heading] | null, w, d }.
export function house(B, o) {
  const r = o.rng, f = B.f, p = B.p, small = !!o.small;
  const storeys = !small && r.chance(0.5) ? 2 : 1, sh = 2.75, fy = small ? 0.32 : 0.5;
  let w = small ? r.r(7, 9) : r.r(8.5, 11.5), d = small ? r.r(7.5, 9.5) : r.r(8, 10.5);
  const gw = o.lotW >= w + 7.6 && r.chance(small ? 0.3 : 0.85) ? (o.lotW >= w + 10 && r.chance(0.45) ? 6.0 : 3.7) : 0;
  const carport = !gw && small && o.lotW > w + 5 && r.chance(0.4);
  const setback = Math.min(small ? r.r(4.5, 6.5) : r.r(6, 8.5), Math.max(3, o.lotD - d - 4));
  const gSide = r.chance(0.5) ? 1 : -1, tot = w + gw, hx0 = gSide > 0 ? -tot / 2 : -tot / 2 + gw, hx1 = hx0 + w, z1 = -setback, z0 = z1 - d;
  const mat = r(), lay = mat < 0.62 ? WL.siding : mat < 0.78 ? WL.brick : mat < 0.9 ? WL.stucco : WL.brick2;
  const col = lay === WL.siding ? r.pick(PAL.siding) : lay === WL.stucco ? r.pick(PAL.stucco) : r.pick(PAL.brick), roofCol = r.pick(PAL.roof), seed = r.i(1, 3000);
  const yT = fy + storeys * sh;
  // foundation
  p.lay(WL.panel).col(170, 168, 162); for (const s of SIDES(hx0, z0, hx1, z1)) p.wall(s[0], s[1], s[2], s[3], 0, fy);
  // walls: front has the door, the rest plain grids
  f.lay(lay); C(f, col);
  const doorX = r.r(0.3, 0.7), ww = small ? 1.3 : r.r(1.4, 1.9), wh = small ? 1.25 : 1.45;
  const S = SIDES(hx0, z0, hx1, z1);
  for (let st = 0; st < storeys; st++) {
    const ya = fy + st * sh, yb = ya + sh;
    if (st === 0) wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], ya, yb, [{ w: w * doorX - 0.8, st: 9, ww, wh, lit: 3 }, { w: 1.6, st: 8, ww: 0.95, wh: 2.08, lit: 3, rec: 0.08 }, { w: w * (1 - doorX) - 0.8, st: 9, ww, wh, lit: 3 }], seed);
    else wallGrid(B, S[0][0], S[0][1], S[0][2], S[0][3], ya, yb, { cw: w / (w > 10 ? 3 : 2), fh: sh, ww: ww * 0.85, wh, st: 9, lit: 3, seed: seed + 7, margin: 0, fit: true });
    for (let k = 1; k < 4; k++) { const s = S[k], L = Math.hypot(s[2] - s[0], s[3] - s[1]); wallGrid(B, s[0], s[1], s[2], s[3], ya, yb, { cw: L / (k === 2 ? (w > 10 ? 3 : 2) : 2), fh: sh, ww: k === 2 ? ww : 1.0, wh: 1.25, st: 9, lit: 3, seed: seed + k * 11 + st, margin: 0, fit: true }); }
  }
  // corner boards on siding houses
  if (lay === WL.siding) { p.lay(WL.plain).col(238, 236, 230); for (const [cx, cz] of [[hx0, z0], [hx1, z0], [hx0, z1], [hx1, z1]]) p.box(cx - 0.07, fy, cz - 0.07, cx + 0.07, yT, cz + 0.07, 15); }
  // roof
  const kind = r(), pitch = small ? r.r(0.32, 0.45) : r.r(0.45, 0.75), cx = (hx0 + hx1) / 2, cz = (z0 + z1) / 2;
  let yR;
  if (kind < 0.5) yR = gableRoof(B, cx, cz, w / 2, d / 2, yT, pitch, 0, lay, col, roofCol);
  else if (kind < 0.75) yR = gableRoof(B, cx, cz, d / 2, w / 2, yT, pitch * 0.9, Math.PI / 2, lay, col, roofCol);
  else if (kind < 0.9) yR = hipRoof(B, cx, cz, w / 2, d / 2, yT, pitch * 0.8, 0, roofCol);
  else { yR = gableRoof(B, cx, cz, w / 2, d / 2, yT, pitch, 0, lay, col, roofCol); const wx = hx0 + w * (doorX > 0.5 ? 0.27 : 0.73), wwid = w * 0.42; f.lay(lay); C(f, col); const wz1 = z1 + 1.6; for (let st = 0; st < storeys; st++) wallGrid(B, wx - wwid / 2, wz1, wx + wwid / 2, wz1, fy + st * sh, fy + (st + 1) * sh, { cw: wwid, fh: sh, ww: 1.8, wh: 1.45, st: 9, lit: 3, seed: seed + 31, margin: 0 }); f.wn(0); f.wall(wx - wwid / 2, z1, wx - wwid / 2, wz1, fy, yT); f.wall(wx + wwid / 2, wz1, wx + wwid / 2, z1, fy, yT); p.lay(WL.panel).col(170, 168, 162); p.box(wx - wwid / 2, 0, z1, wx + wwid / 2, fy, wz1, 1 + 4 + 8); gableRoof(B, wx, (z1 + wz1) / 2 - 1.2, (wz1 - z1) / 2 + 1.2, wwid / 2, yT, pitch, Math.PI / 2, lay, col, roofCol, 0.4, 0.3); }
  // chimney
  if (r.chance(0.6)) { const chx = r.chance(0.5) ? hx0 + 0.5 : hx1 - 0.5, chz = cz + r.r(-1.5, 1.5); p.lay(WL.brick).col(235, 225, 220); p.box(chx - 0.38, yT - 0.5, chz - 0.5, chx + 0.38, yR + 0.7, chz + 0.5); p.lay(WL.panel).col(150, 150, 146); p.box(chx - 0.44, yR + 0.7, chz - 0.56, chx + 0.44, yR + 0.8, chz + 0.56); }
  // porch
  const dx = hx0 + w * doorX, porch = !small || r.chance(0.6), pw = porch && r.chance(0.5) ? Math.min(w - 0.6, r.r(3.6, 6.5)) : 2.4, pd = porch ? r.r(1.5, 2.3) : 1.1;
  const px0 = Math.max(hx0 + 0.2, Math.min(hx1 - 0.2 - pw, dx - pw / 2)), px1 = px0 + pw;
  p.lay(WL.wood).col(200, 190, 175); p.box(px0, 0, z1, px1, fy - 0.03, z1 + pd, 1 + 4 + 8 + 16);
  const ns = Math.max(1, Math.round(fy / 0.17)); p.lay(WL.panel).col(190, 188, 182);
  for (let i = 0; i < ns; i++) p.box(dx - 0.75, 0, z1 + pd + i * 0.28, dx + 0.75, fy - (i + 1) * (fy / (ns + 1)), z1 + pd + (i + 1) * 0.28, 1 + 4 + 8 + 16);
  if (porch) {
    const py = fy + 2.45; p.lay(WL.plain).col(238, 236, 230);
    for (const x of pw > 3.4 ? [px0 + 0.1, dx - 0.9, dx + 0.9, px1 - 0.1] : [px0 + 0.1, px1 - 0.1]) if (x >= px0 && x <= px1) p.box(x - 0.07, fy - 0.03, z1 + pd - 0.2, x + 0.07, py, z1 + pd - 0.06, 15);
    p.box(px0 - 0.05, py, z1 + pd - 0.24, px1 + 0.05, py + 0.2, z1 + pd - 0.02, 31);
    p.lay(WL.shingle); C(p, roofCol); p.quad(px0 - 0.25, py + 0.2, z1 + pd + 0.2, px1 + 0.25, py + 0.2, z1 + pd + 0.2, px1 + 0.25, py + 0.75, z1, px0 - 0.25, py + 0.75, z1, 0, 0);
    p.lay(WL.plain).col(230, 228, 222); p.quad(px1 + 0.25, py + 0.16, z1 + pd + 0.2, px0 - 0.25, py + 0.16, z1 + pd + 0.2, px0 - 0.25, py + 0.71, z1, px1 + 0.25, py + 0.71, z1, 0, 0);
    p.tri3(px0 - 0.25, py + 0.2, z1 + pd + 0.2, px0 - 0.25, py + 0.75, z1, px0 - 0.25, py + 0.2, z1); p.tri3(px1 + 0.25, py + 0.2, z1, px1 + 0.25, py + 0.75, z1, px1 + 0.25, py + 0.2, z1 + pd + 0.2);
    if (pw > 3.4) { cutRun(B, CUT.rail, px0, z1 + pd - 0.13, dx - 0.95, z1 + pd - 0.13, fy, 0.9, [236, 234, 228], 1.4); cutRun(B, CUT.rail, dx + 0.95, z1 + pd - 0.13, px1, z1 + pd - 0.13, fy, 0.9, [236, 234, 228], 1.4); cutRun(B, CUT.rail, px0 + 0.1, z1, px0 + 0.1, z1 + pd - 0.13, fy, 0.9, [236, 234, 228], 1.4); cutRun(B, CUT.rail, px1 - 0.1, z1, px1 - 0.1, z1 + pd - 0.13, fy, 0.9, [236, 234, 228], 1.4); }
  }
  if (porch) { p.lay(WL.plain).col(150, 84, 56); for (const sx of [-1, 1]) if (r.chance(0.7)) { const qx = dx + sx * 1.05; if (qx > px0 + 0.2 && qx < px1 - 0.2) p.cyl(qx, z1 + pd - 0.45, fy - 0.03, fy + 0.34, 0.15, 0.2, 7); }
    if (pw > 3.4 && r.chance(0.6)) { const cx2 = dx + (dx - px0 > px1 - dx ? -1 : 1) * 1.9; if (cx2 > px0 + 0.5 && cx2 < px1 - 0.5) { p.lay(WL.wood).col(210, 200, 180); p.box(cx2 - 0.3, fy - 0.03, z1 + 0.25, cx2 + 0.3, fy + 0.42, z1 + 0.85, 31); p.box(cx2 - 0.3, fy + 0.42, z1 + 0.25, cx2 + 0.3, fy + 0.95, z1 + 0.33, 31); } } }
  // porch light and house number
  p.lay(WL.plain).col(30, 30, 32); p.box(dx + 0.68, fy + 1.85, z1, dx + 0.8, fy + 2.05, z1 + 0.1);
  if (o.number) signQuad(B, SIGN.num(B.T.atlas, o.number), dx - 0.85, fy + 1.7, z1 + 0.02, 0.36, 0.155, 0, 0.25);
  // walk from the sidewalk to the steps
  const dc = B.d, zs = z1 + pd + ns * 0.28;
  dc.lay(GL.concrete).col(228, 226, 220); dc.gquad(dx - 0.55, zs, dx + 0.55, zs, dx + 0.55, 0.45, dx - 0.55, 0.45, 0.02, 0, 0, 1.1, 0, 1.1, zs, 0, zs);
  // garage / carport + driveway
  let drive = null;
  if (gw || carport) {
    const cw = gw || 3.4, gx0 = gSide > 0 ? hx1 : hx0 - cw, gx1 = gx0 + cw, gz1 = z1 - (gw ? r.r(0, 1.5) : 0), gz0 = gz1 - 6.4, gh = 2.55;
    if (gw) {
      f.lay(lay); C(f, col); const GS = SIDES(gx0, gz0, gx1, gz1);
      wallCells(B, GS[0][0], GS[0][1], GS[0][2], GS[0][3], 0, gh, gw > 5 ? [{ w: 0.5 }, { w: gw - 1, st: 5, ww: gw - 1.2, wh: 2.15, rec: 0.1 }, { w: 0.5 }] : [{ w: 0.45 }, { w: 2.8, st: 5, ww: 2.6, wh: 2.15, rec: 0.1 }, { w: 0.45 }], seed + 50);
      for (let k = 1; k < 4; k++) { const s = GS[k]; f.wall(s[0], s[1], s[2], s[3], 0, gh); }
      gableRoof(B, (gx0 + gx1) / 2, (gz0 + gz1) / 2, 3.2, cw / 2, gh, pitch * 0.8, Math.PI / 2, lay, col, roofCol, 0.35, 0.3);
      B.collide(gx0, gz0, gx1, gz1, gh + 1); B.foot(gx0, gz0, gx1, gz1);
    } else {
      p.lay(WL.plain).col(230, 228, 222); for (const [x, z] of [[gx0 + 0.15, gz0 + 0.2], [gx1 - 0.15, gz0 + 0.2], [gx0 + 0.15, gz1 - 0.2], [gx1 - 0.15, gz1 - 0.2]]) p.box(x - 0.06, 0, z - 0.06, x + 0.06, 2.3, z + 0.06, 15);
      p.lay(WL.metal).col(215, 215, 210); p.box(gx0 - 0.2, 2.3, gz0 - 0.2, gx1 + 0.2, 2.42, gz1 + 0.3, 63);
    }
    const dcx = (gx0 + gx1) / 2, dw = gw > 5 ? 5.2 : 3.0, zk = o.sw + 0.02;
    dc.lay(GL.concrete).col(214, 212, 206); dc.gquad(dcx - dw / 2, gz1, dcx + dw / 2, gz1, dcx + dw / 2, zk, dcx - dw / 2, zk, 0.022, 0, 0, dw, 0, dw, zk - gz1, 0, zk - gz1);
    // kerb ramp: a wedge in the gutter so the drive reads as a dropped kerb
    const g = B.T.chunks.get('ground', B.x, B.z).frame(B.x, 0, B.z, B.h); g.lay(GL.concrete).col(206, 204, 198);
    g.quad(dcx - dw / 2 - 0.5, 0.012, zk + 0.5, dcx + dw / 2 + 0.5, 0.012, zk + 0.5, dcx + dw / 2, KERB + 0.022, zk - 0.02, dcx - dw / 2, KERB + 0.022, zk - 0.02, 0, 0);
    g.frame();
    { const q = [B.w(dcx - dw / 2 - 0.3, gz1), B.w(dcx + dw / 2 + 0.3, gz1), B.w(dcx + dw / 2 + 0.3, zk + 0.4), B.w(dcx - dw / 2 - 0.3, zk + 0.4)]; B.T.surf.fill(q, 4, 3); B.T.surf.fill(q, 4, 1); }
    drive = [dcx, (gz1 + 0) / 2 - (carport ? 2.5 : 0), dw, gz1, zk];
  }
  B.collide(hx0, z0, hx1, z1, yT + 1.5); B.foot(hx0, z0, hx1, z1, o.hl);
  return { door: [dx, z1 + pd + 0.6], drive, hx0, hx1, z0, z1, top: yR };
}

// Single-wide manufactured home for the trailer court. Long axis perpendicular to the lane.
export function trailer(B, o) {
  const r = o.rng, f = B.f, p = B.p, w = 4.3, d = r.r(15, 19), fy = 0.7, h = 2.6, setback = 3, x0 = -w / 2, x1 = w / 2, z1 = -setback, z0 = z1 - d, seed = r.i(1, 3000);
  const col = r.pick([[230, 228, 220], [200, 210, 205], [215, 200, 170], [190, 200, 212], [170, 180, 165], [222, 214, 196]]);
  p.lay(WL.metal).col(150, 150, 146); for (const s of SIDES(x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05)) p.wall(s[0], s[1], s[2], s[3], 0, fy);
  f.lay(WL.metal); C(f, col); const S = SIDES(x0, z0, x1, z1);
  wallGrid(B, S[0][0], S[0][1], S[0][2], S[0][3], fy, fy + h, { cw: w, fh: h, ww: 1.8, wh: 1.1, st: 9, lit: 3, seed, margin: 0 });
  wallCells(B, S[1][0], S[1][1], S[1][2], S[1][3], fy, fy + h, [{ w: 3, st: 9, ww: 1.1, wh: 1.0, lit: 3 }, { w: 1.5, st: 8, ww: 0.9, wh: 2.0, lit: 3, rec: 0.06 }, { w: d - 9 }, { w: 2.5, st: 9, ww: 1.0, wh: 0.9, lit: 3 }, { w: 2 }], seed);
  wallGrid(B, S[2][0], S[2][1], S[2][2], S[2][3], fy, fy + h, { cw: w, fh: h, ww: 1.0, wh: 0.9, st: 9, lit: 3, seed: seed + 3, margin: 0 });
  wallGrid(B, S[3][0], S[3][1], S[3][2], S[3][3], fy, fy + h, { cw: d / 3, fh: h, ww: 1.1, wh: 0.95, st: 9, lit: 3, seed: seed + 5, margin: 0 });
  p.lay(WL.metal).col(205, 205, 200); p.quad(x0 - 0.15, fy + h, z1 + 0.15, x1 + 0.15, fy + h, z1 + 0.15, x1 + 0.15, fy + h + 0.28, (z0 + z1) / 2, x0 - 0.15, fy + h + 0.28, (z0 + z1) / 2, 0, 0);
  p.quad(x1 + 0.15, fy + h, z0 - 0.15, x0 - 0.15, fy + h, z0 - 0.15, x0 - 0.15, fy + h + 0.28, (z0 + z1) / 2, x1 + 0.15, fy + h + 0.28, (z0 + z1) / 2, 0, 0);
  for (const x of [x0 - 0.15, x1 + 0.15]) { p.tri3(x, fy + h, x > 0 ? z1 + 0.15 : z0 - 0.15, x, fy + h, x > 0 ? z0 - 0.15 : z1 + 0.15, x, fy + h + 0.28, (z0 + z1) / 2); }
  // little deck and steps at the side door
  const dz = z1 - 3.75; p.lay(WL.wood).col(190, 180, 165); p.box(x1, fy - 0.12, dz - 1, x1 + 1.5, fy - 0.02, dz + 1, 63); for (let i = 0; i < 3; i++) p.box(x1 + 1.5 + i * 0.28, 0, dz - 0.6, x1 + 1.78 + i * 0.28, fy - 0.12 - (i + 1) * 0.17, dz + 0.6, 1 + 2 + 4 + 16);
  cutRun(B, CUT.rail, x1 + 0.05, dz - 0.98, x1 + 1.45, dz - 0.98, fy, 0.9, [190, 180, 165], 1.4);
  B.collide(x0, z0, x1, z1, fy + h + 0.3); B.foot(x0, z0, x1, z1);
  if (o.number) signQuad(B, SIGN.num(B.T.atlas, o.number), 0, fy + 2.1, z1 + 0.02, 0.36, 0.155, 0, 0.2);
  return { door: [x1 + 2.6, dz], d, w };
}

// ---------------------------------------------------------------- street-wall buildings

// Old Town storefront building: brick, 2-3 storeys, shop below. o: { w, d, floors, rng, name, exposeL, exposeR, number }
export function storefront(B, o) {
  const r = o.rng, f = B.f, p = B.p, w = o.w, d = o.d, x0 = -w / 2, x1 = w / 2, z1 = 0, z0 = -d;
  const gfH = r.r(4.0, 4.6), fh = r.r(3.2, 3.6), floors = o.floors, par = r.r(0.7, 1.3), top = gfH + (floors - 1) * fh + par, seed = r.i(1, 3000);
  const lay = r.chance(0.62) ? WL.brick : r.chance(0.6) ? WL.brick2 : WL.stucco, col = jit(lay === WL.stucco ? r.pick(PAL.stucco) : r.pick(PAL.brick), r, lay === WL.stucco ? 0.14 : 0.08);
  const S = SIDES(x0, z0, x1, z1);
  // ground floor front: piers, glazing, recessed door
  f.lay(lay); C(f, col);
  const pier = 0.42, doorL = r.chance(0.5), inner = w - pier * 2, dW = 1.5, gW = inner - dW;
  const glass = { st: 2, ww: gW - 0.16, wh: gfH - 1.55, lit: 2, rec: 0.22 }, door = { w: dW, st: 4, ww: 1.15, wh: 2.3, lit: 2, rec: 0.3 };
  const cells = inner > 9 ? [{ w: pier }, { w: gW / 2, ...glass, ww: gW / 2 - 0.16 }, door, { w: gW / 2, ...glass, ww: gW / 2 - 0.16 }, { w: pier }] : doorL ? [{ w: pier }, door, { w: gW, ...glass }, { w: pier }] : [{ w: pier }, { w: gW, ...glass }, door, { w: pier }];
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, gfH - 0.9, cells, seed);
  f.wn(0); f.wall(S[0][0], S[0][1], S[0][2], S[0][3], gfH - 0.9, gfH, 0, gfH - 0.9);
  // upper front
  const nb = Math.max(1, Math.round(w / r.r(2.3, 3.0)));
  if (floors > 1) wallGrid(B, S[0][0], S[0][1], S[0][2], S[0][3], gfH, top - par, { cw: (w - 0.8) / nb, fh, ww: r.r(1.0, 1.35), wh: r.r(1.7, 2.1), st: 0, lit: 1, seed, margin: 0.4 });
  f.wn(0); f.wall(S[0][0], S[0][1], S[0][2], S[0][3], top - par, top, 0, top - par);
  // sides and back
  for (const k of [1, 3]) { const s = S[k], exp = k === 1 ? o.exposeR : o.exposeL; if (exp) { wallGrid(B, s[0], s[1], s[2], s[3], 0, gfH, { cw: 4.5, fh: gfH, ww: 2.6, wh: 2.2, st: 2, lit: 2, seed: seed + k, margin: 1.5, rec: 0.2 }); if (floors > 1) wallGrid(B, s[0], s[1], s[2], s[3], gfH, top - par, { cw: 3.0, fh, ww: 1.15, wh: 1.9, st: 0, lit: 1, seed: seed + k * 3, margin: 0.8 }); f.wall(s[0], s[1], s[2], s[3], top - par, top, 0, top - par); } else { f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, top); } }
  { const s = S[2]; wallCells(B, s[0], s[1], s[2], s[3], 0, gfH, [{ w: 1 }, { w: 1.5, st: 8, ww: 0.95, wh: 2.1, lit: 4, rec: 0.1 }, { w: Math.max(0.5, w - 4.5) }, { w: 2, st: 3, ww: 1.2, wh: 1.2, lit: 4 }], seed + 9); if (floors > 1) wallGrid(B, s[0], s[1], s[2], s[3], gfH, top - par, { cw: 3.2, fh, ww: 1.0, wh: 1.6, st: 0, lit: 1, seed: seed + 5, margin: 0.6 }); f.wn(0); f.wall(s[0], s[1], s[2], s[3], top - par, top, 0, top - par); }
  flatRoof(B, x0, z0, x1, z1, top, par, lay, col, r, 0.8);
  // cornice, pilasters, sign band, awning
  const trim = r.chance(0.5) ? [206, 202, 190] : [150, 146, 138];
  p.lay(WL.panel); C(p, trim);
  p.box(x0 - 0.05, top - par - 0.05, z1, x1 + 0.05, top - par + 0.2, z1 + 0.32, 1 + 4 + 8 + 16 + 32); p.box(x0 - 0.02, top - par - 0.3, z1, x1 + 0.02, top - par - 0.05, z1 + 0.16, 1 + 4 + 8 + 32); p.box(x0 - 0.02, top - 0.1, z1, x1 + 0.02, top + 0.1, z1 + 0.14, 1 + 4 + 8 + 16 + 32);
  p.lay(lay); C(p, col); for (const x of [x0, x1 - 0.36]) p.box(x, 0, z1, x + 0.36, top - par - 0.3, z1 + 0.1, 1 + 4 + 8);
  p.lay(WL.panel); C(p, trim); p.box(x0, gfH - 0.12, z1, x1, gfH + 0.08, z1 + 0.2, 1 + 4 + 8 + 16 + 32); p.box(x0 + pier, 0, z1, x1 - pier, 0.42, z1 + 0.05, 1 + 16);
  const A = B.T.atlas, rect = SIGN.shop(A, o.name, seed), sW = Math.min(w - 1.0, 5.2), sH = sW * rect.h / rect.w;
  boxSign(B, rect, 0, gfH - 0.52, z1 + 0.16, sW, Math.min(0.85, sH), 0, 2.0);
  if (r.chance(0.6)) {
    const ac = r.pick(PAL.awning), ay = gfH - 1.0, ad = r.r(1.1, 1.6), ax0 = x0 + pier, ax1 = x1 - pier;
    p.lay(WL.plain); C(p, ac); p.quad(ax0, ay - 0.65, z1 + ad, ax1, ay - 0.65, z1 + ad, ax1, ay, z1 + 0.03, ax0, ay, z1 + 0.03, 0, 0);
    p.col(ac[0] * 0.6, ac[1] * 0.6, ac[2] * 0.6).quad(ax1, ay - 0.68, z1 + ad, ax0, ay - 0.68, z1 + ad, ax0, ay - 0.03, z1 + 0.03, ax1, ay - 0.03, z1 + 0.03, 0, 0);
    C(p, ac); p.quad(ax0, ay - 0.93, z1 + ad, ax1, ay - 0.93, z1 + ad, ax1, ay - 0.65, z1 + ad, ax0, ay - 0.65, z1 + ad, 0, 0);
    p.tri3(ax0, ay - 0.65, z1 + ad, ax0, ay, z1 + 0.03, ax0, ay - 0.65, z1 + 0.03); p.tri3(ax1, ay - 0.65, z1 + 0.03, ax1, ay, z1 + 0.03, ax1, ay - 0.65, z1 + ad);
  }
  // rear fire escape on taller ones
  if (floors > 2 && r.chance(0.7)) fireEscape(B, r.r(x0 + 2, x1 - 2), z0, gfH, fh, floors - 1, Math.PI);
  B.collide(x0, z0, x1, z1, top); B.foot(x0, z0, x1, z1, o.hl);
  return { top, gfH };
}

export function fireEscape(B, cx, cz, y0, fh, n, rot) {
  const p = B.p; p.push(cx, 0, cz, rot); B.c.push(cx, 0, cz, rot);
  const saveB = { c: B.c };
  for (let i = 0; i < n; i++) {
    const y = y0 + i * fh - 0.1; p.lay(WL.plain).col(34, 34, 36); p.box(-1.3, y, 0, 1.3, y + 0.06, 0.95, 63);
    const uv = cutUV(CUT.rail), c = saveB.c; c.col(34, 34, 36).lay(0);
    const q = (ax, az, bx, bz, ya, yb) => c.quad(ax, ya, az, bx, ya, bz, bx, yb, bz, ax, yb, az, uv.u0, uv.v0, uv.u1, uv.v1);
    q(-1.3, 0.95, 1.3, 0.95, y + 0.06, y + 1.0); q(-1.3, 0, -1.3, 0.95, y + 0.06, y + 1.0); q(1.3, 0.95, 1.3, 0, y + 0.06, y + 1.0);
    if (i > 0) { c.quad(-1.0, y - fh + 0.06, 0.55, 0.9, y + 0.06, 0.55, 0.9, y + 0.5, 0.55, -1.0, y - fh + 0.5, 0.55, uv.u0, uv.v0, uv.u1, uv.v1); p.tube(-1.0, y - fh + 0.1, 0.3, 0.9, y + 0.05, 0.3, 0.035, 0.035, 4); p.tube(-1.0, y - fh + 0.1, 0.8, 0.9, y + 0.05, 0.8, 0.035, 0.035, 4); }
  }
  p.pop(); B.c.pop();
}

// Mid- and high-rise street-wall building. o: { w, d, floors, kind: 'glass'|'precast'|'brick'|'apartment'|'hotel', rng,
// name (ground-floor tenant or building name), exposeL, exposeR, lit }
export function tower(B, o) {
  const r = o.rng, f = B.f, p = B.p, w = o.w, d = o.d, x0 = -w / 2, x1 = w / 2, z1 = 0, z0 = -d, kind = o.kind, seed = r.i(1, 3000);
  const gfH = kind === 'apartment' ? 3.6 : r.r(4.6, 5.6), fh = kind === 'glass' ? 3.9 : kind === 'apartment' || kind === 'hotel' ? 3.05 : 3.6, floors = o.floors, par = 1.1;
  const top = gfH + (floors - 1) * fh + par, S = SIDES(x0, z0, x1, z1);
  let lay, col, win, baseLay, baseCol;
  if (kind === 'glass') { lay = WL.plain; col = r.pick(PAL.dark); win = { cw: r.r(1.4, 1.8), fh, ww: 9, wh: fh - r.r(0.9, 1.3), st: 1, lit: 0, rec: 0.05, margin: 0.3, fit: true }; baseLay = WL.panel; baseCol = [150, 150, 148]; }
  else if (kind === 'precast') { lay = WL.panel; col = r.pick(PAL.panel); win = { cw: r.r(2.8, 3.6), fh, ww: r.r(1.9, 2.5), wh: r.r(1.7, 2.1), st: 1, lit: 0, rec: 0.22, margin: 0.8, fit: true }; baseLay = WL.panel; baseCol = col; }
  else if (kind === 'brick') { lay = r.chance(0.6) ? WL.brick : WL.brick2; col = r.pick(PAL.brick); win = { cw: r.r(2.5, 3.1), fh, ww: r.r(1.2, 1.5), wh: r.r(1.9, 2.3), st: 0, lit: o.lit ?? 0, rec: 0.18, margin: 0.8, fit: true }; baseLay = WL.panel; baseCol = [214, 208, 196]; }
  else { lay = r.chance(0.5) ? WL.stucco : r.chance(0.5) ? WL.brick2 : WL.panel; col = lay === WL.stucco ? r.pick(PAL.stucco) : lay === WL.panel ? r.pick(PAL.panel) : r.pick(PAL.brick); win = { cw: r.r(3.3, 3.9), fh, ww: r.r(1.7, 2.3), wh: 1.55, st: 0, lit: kind === 'hotel' ? 1 : 1, rec: 0.16, margin: 0.8, fit: true }; baseLay = lay; baseCol = col; }
  if (o.lit !== undefined) win.lit = o.lit;
  col = jit(col, r, 0.12); if (baseLay === lay) baseCol = col;
  // ground floor
  f.lay(baseLay); C(f, baseCol);
  const bay = r.r(4.2, 5.4), nb = Math.max(1, Math.floor((w - 1.2) / bay)), bw = (w - 1.2) / nb, entry = Math.floor(nb / 2), cells = [{ w: 0.6 }];
  for (let i = 0; i < nb; i++) { if (i === entry) cells.push({ w: bw, st: 4, ww: Math.min(3.2, bw - 0.8), wh: 2.7, lit: 5, rec: 0.35 }); else cells.push({ w: bw, st: kind === 'apartment' ? 0 : 2, ww: kind === 'apartment' ? 1.8 : bw - 0.7, wh: kind === 'apartment' ? 1.5 : gfH - 1.5, lit: kind === 'apartment' ? 1 : 2, rec: 0.25 }); }
  cells.push({ w: 0.6 });
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, gfH, cells, seed);
  for (const k of [1, 2, 3]) { const s = S[k], exp = k === 2 || (k === 1 ? o.exposeR : o.exposeL); if (exp && kind !== 'apartment' && k !== 2) wallGrid(B, s[0], s[1], s[2], s[3], 0, gfH, { cw: bw, fh: gfH, ww: bw - 0.8, wh: gfH - 1.6, st: 2, lit: 2, seed: seed + k, margin: 0.6, rec: 0.25, fit: true }); else if (k === 2) wallCells(B, s[0], s[1], s[2], s[3], 0, gfH, [{ w: 2 }, { w: 1.6, st: 8, ww: 1.0, wh: 2.15, lit: 4, rec: 0.1 }, { w: Math.max(1, w - 9) }, { w: 4, st: 5, ww: 3.4, wh: 3.4, rec: 0.15 }, { w: 1.4 }], seed + 4); else { f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, gfH); } }
  // shaft
  f.lay(lay); C(f, col);
  for (let k = 0; k < 4; k++) { const s = S[k], exp = k === 0 || k === 2 || (k === 1 ? o.exposeR : o.exposeL) || floors > 5; if (exp) wallGrid(B, s[0], s[1], s[2], s[3], gfH, top - par, { ...win, seed: seed + k * 17 }); else { f.wn(0); f.wall(s[0], s[1], s[2], s[3], gfH, top - par, 0, gfH); } f.wn(0); f.wall(s[0], s[1], s[2], s[3], top - par, top, 0, top - par); }
  flatRoof(B, x0, z0, x1, z1, top, par, lay, col, r, 1.2);
  // relief: belt course, piers / fins, cornice, entrance canopy
  p.lay(WL.panel); C(p, kind === 'glass' ? [60, 64, 68] : [200, 196, 186]);
  p.box(x0 - 0.04, gfH - 0.18, z1, x1 + 0.04, gfH + 0.12, z1 + 0.22, 1 + 4 + 8 + 16 + 32);
  if (kind === 'brick') { p.box(x0 - 0.06, top - par - 0.1, z1, x1 + 0.06, top - par + 0.3, z1 + 0.45, 1 + 4 + 8 + 16 + 32); p.box(x0 - 0.03, top - par - 0.5, z1, x1 + 0.03, top - par - 0.1, z1 + 0.2, 1 + 4 + 8 + 32); }
  if (kind === 'precast' || kind === 'glass') { const nf = Math.max(2, Math.round(w / (kind === 'glass' ? 4.5 : 6.5))); p.lay(kind === 'glass' ? WL.plain + METAL : WL.panel); C(p, kind === 'glass' ? [150, 156, 160] : col); for (let i = 0; i <= nf; i++) { const x = x0 + 0.15 + (w - 0.3) * i / nf; p.box(x - 0.14, gfH + 0.12, z1, x + 0.14, top, z1 + (kind === 'glass' ? 0.18 : 0.3), 1 + 4 + 8 + 16); } }
  const ex = x0 + 0.6 + bw * (entry + 0.5); p.lay(WL.plain + METAL).col(70, 74, 78); p.box(ex - Math.min(2.2, bw / 2), 3.3, z1, ex + Math.min(2.2, bw / 2), 3.5, z1 + 1.8, 63);
  // balconies
  if (kind === 'apartment' || kind === 'hotel' && r.chance(0.4)) {
    const n = Math.max(1, Math.floor((w - 1.6) / win.cw)), cw = (w - 1.6) / n;
    for (let fl = 1; fl < floors; fl++) for (let i = 0; i < n; i++) { if ((i + fl * (kind === 'hotel' ? 0 : 1)) % 2) continue; const bx = x0 + 0.8 + cw * (i + 0.5), by = gfH + (fl - 1) * fh + 0.75; p.lay(WL.panel).col(196, 194, 188); p.box(bx - 1.25, by - 0.14, z1, bx + 1.25, by, z1 + 1.15, 63); cutRun(B, CUT.rail, bx - 1.22, z1 + 1.12, bx + 1.22, z1 + 1.12, by, 1.0, [50, 52, 56], 1.3); cutRun(B, CUT.rail, bx - 1.22, z1, bx - 1.22, z1 + 1.12, by, 1.0, [50, 52, 56], 1.2); cutRun(B, CUT.rail, bx + 1.22, z1, bx + 1.22, z1 + 1.12, by, 1.0, [50, 52, 56], 1.2); }
  }
  if (o.name) { const A = B.T.atlas; if (kind === 'hotel') { const rect = SIGN.text(A, 'vsign:' + o.name, o.name.toUpperCase().split('').join('\n'), { w: 96, h: 512, bg: '#101418', fg: '#ffd27a', font: 6 }); const sh = Math.min(top - gfH - 3, 9); const sw2 = sh * 0.22; boxSign(B, rect, x0 + 0.5, gfH + 2 + sh / 2, z1 + sw2 / 2 + 0.15, sw2, sh, -Math.PI / 2, 3, 0.25); signQuad(B, rect, x0 + 0.762, gfH + 2 + sh / 2, z1 + sw2 / 2 + 0.15, sw2, sh, Math.PI / 2, 3); } else { const rect = SIGN.text(A, 'bsign:' + o.name, o.name, { w: 384, h: 72, bg: '#1b1f24', fg: '#e8e2d2', font: 3 }); boxSign(B, rect, ex, gfH - 0.62, z1 + 0.24, Math.min(w - 1.5, 5.4), 0.8, 0, 2.2); } }
  if (kind === 'brick' && floors > 3 && r.chance(0.6)) fireEscape(B, r.r(x0 + 3, x1 - 3), z0, gfH, fh, Math.min(floors - 1, 6), Math.PI);
  B.collide(x0, z0, x1, z1, top); B.foot(x0, z0, x1, z1, o.hl);
  return { top, gfH, ex };
}

// Multi-storey car park: open decks behind spandrels, a stair tower, ramp opening on the front.
export function parkade(B, o) {
  const f = B.f, p = B.p, w = o.w, d = o.d, x0 = -w / 2, x1 = w / 2, z0 = -d, z1 = 0, fh = 3.1, n = o.floors, top = n * fh + 1.1, S = SIDES(x0, z0, x1, z1), seed = o.rng.i(1, 999);
  f.lay(WL.panel).col(214, 210, 200);
  for (let k = 0; k < 4; k++) { const s = S[k]; if (k === 0) wallCells(B, s[0], s[1], s[2], s[3], 0, fh, [{ w: 2 }, { w: 7, st: 6, ww: 6.4, wh: 2.6, rec: 0.3, lit: 5 }, { w: Math.max(1, w - 11) }, { w: 2 }], seed); else wallGrid(B, s[0], s[1], s[2], s[3], 0, fh, { cw: 8, fh, ww: 7.4, wh: 1.7, st: 6, lit: 5, rec: 0.3, seed: seed + k, margin: 1, fit: true }); wallGrid(B, s[0], s[1], s[2], s[3], fh, n * fh, { cw: 8, fh, ww: 7.4, wh: 1.75, st: 6, lit: 5, rec: 0.3, seed: seed + k * 5, margin: 1, fit: true }); f.wn(0); f.wall(s[0], s[1], s[2], s[3], n * fh, top, 0, n * fh); }
  p.lay(WL.roof).col(200, 200, 200); p.box(x0, n * fh - 0.2, z0, x1, n * fh, z1, 16);
  p.lay(WL.panel).col(214, 210, 200); for (const s of S) p.wall(s[2], s[3], s[0], s[1], n * fh, top);
  p.lay(WL.panel).col(190, 186, 178); p.box(x1 - 5, 0, z1 - 0.02, x1 + 0.3, top + 2.6, z1 + 0.4, 1 + 4 + 8 + 16); p.box(x1 - 5, top, z1 - 5, x1 + 0.3, top + 2.6, z1 + 0.4, 31);
  if (o.sign) { const rect = SIGN.text(B.T.atlas, 'psign', 'P', { w: 128, h: 128, bg: '#1650a8', fg: '#ffffff', font: 6 }); boxSign(B, rect, x0 + 5.5, fh + 1.4, z1 + 0.2, 1.6, 1.6, 0, 3); }
  B.collide(x0, z0, x1, z1, top); B.foot(x0, z0, x1, z1, o.hl);
  return { top };
}

// ---------------------------------------------------------------- sheds and boxes

// Steel warehouse / industrial shed. o: { w, d, h, rng, name, docks, col }
export function warehouse(B, o) {
  const r = o.rng, f = B.f, p = B.p, w = o.w, d = o.d, x0 = -w / 2, x1 = w / 2, z1 = -(o.setback || 0), z0 = z1 - d, h = o.h || r.r(6.5, 9), seed = r.i(1, 3000);
  const lay = o.lay ?? (r.chance(0.7) ? WL.metal : WL.panel), col = o.col || r.pick(PAL.metal), S = SIDES(x0, z0, x1, z1), base = 1.1;
  // masonry base course, then cladding
  f.lay(WL.panel).col(176, 174, 168); f.wn(0);
  const nd = o.docks ?? Math.max(1, Math.floor(w / 12)), cells = [{ w: 2.2 }, { w: 1.5, st: 8, ww: 0.95, wh: 2.1, lit: 4, rec: 0.08 }, { w: 1.2 }, { w: 3.2, st: 3, ww: 2.4, wh: 1.3, lit: 4 }];
  const rem = w - 8.1, dw = Math.max(4.6, rem / Math.max(1, nd)); for (let i = 0; i < nd && (i + 1) * dw <= rem + 0.1; i++) cells.push({ w: dw, st: 5, ww: 3.4, wh: 3.8, rec: 0.12 });
  f.lay(lay); C(f, col);
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, 4.4, cells, seed); f.wn(0); f.wall(S[0][0], S[0][1], S[0][2], S[0][3], 4.4, h, 0, 4.4);
  for (const k of [1, 2, 3]) { const s = S[k]; f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, h - 2.2); wallGrid(B, s[0], s[1], s[2], s[3], h - 2.2, h - 0.6, { cw: 6, fh: 1.6, ww: 3.6, wh: 1.0, st: 3, lit: 4, seed: seed + k, margin: 2 }); f.wn(0); f.wall(s[0], s[1], s[2], s[3], h - 0.6, h, 0, h - 0.6); }
  // low-pitch roof, ridge along X
  p.lay(WL.metal).col(196, 198, 198);
  const rise = Math.min(1.6, d * 0.06), zm = (z0 + z1) / 2;
  p.quad(x0 - 0.2, h, z1 + 0.25, x1 + 0.2, h, z1 + 0.25, x1 + 0.2, h + rise, zm, x0 - 0.2, h + rise, zm, 0, 0); p.quad(x1 + 0.2, h, z0 - 0.25, x0 - 0.2, h, z0 - 0.25, x0 - 0.2, h + rise, zm, x1 + 0.2, h + rise, zm, 0, 0);
  p.lay(lay); C(p, col); p.tri3(x1, h, z1, x1, h, z0, x1, h + rise, zm, 0, h); p.tri3(x0, h, z0, x0, h, z1, x0, h + rise, zm, 0, h);
  p.lay(WL.plain + METAL).col(170, 172, 172); for (let i = 0; i < Math.floor(w / 14); i++) { const vx = x0 + 7 + i * 14; p.cyl(vx, zm, h + rise - 0.1, h + rise + 0.7, 0.35, 0.35, 8); p.cyl(vx, zm, h + rise + 0.7, h + rise + 0.95, 0.55, 0.3, 8); }
  // dock bumpers and canopy
  p.lay(WL.plain).col(30, 30, 30); let u = 8.1; for (let i = 0; i < nd && (i + 1) * dw <= rem + 0.1; i++) { const cx = x0 + u + dw / 2; p.box(cx - 2, 0.7, z1, cx - 1.75, 1.2, z1 + 0.15); p.box(cx + 1.75, 0.7, z1, cx + 2, 1.2, z1 + 0.15); u += dw; }
  if (o.name) { const rect = SIGN.text(B.T.atlas, 'wh:' + o.name, o.name, { w: 512, h: 86, bg: o.signBg || '#f1eee6', fg: o.signFg || '#1d2b3a', font: o.font ?? 6 }); const sw = Math.min(w * 0.5, 11); signQuad(B, rect, x0 + w * 0.62, h - 1.2, z1 + 0.03, sw, sw / 6, 0, 0.5); }
  B.collide(x0, z0, x1, z1, h + rise); B.foot(x0, z0, x1, z1, o.hl);
  return { h, x0, x1, z0, z1 };
}

// Single-storey commercial box (strip store, supermarket, diner shell). o: { w, d, h, rng, name, lay, col, glass (0..1), signBg, signFg, band }
export function shopBox(B, o) {
  const r = o.rng, f = B.f, p = B.p, w = o.w, d = o.d, x0 = -w / 2, x1 = w / 2, z1 = -(o.setback || 0), z0 = z1 - d, h = o.h || 5.2, par = 0.9, seed = r.i(1, 3000);
  const lay = o.lay ?? WL.stucco, col = jit(o.col || r.pick(PAL.stucco), r, 0.1), S = SIDES(x0, z0, x1, z1), gl = o.glass ?? 0.7, gh = Math.min(3.4, h - 1.6);
  f.lay(lay); C(f, col);
  const gw = w * gl, cells = [{ w: (w - gw) / 2 }]; const nb = Math.max(1, Math.round(gw / 3.6)), bw = gw / nb, ent = Math.floor(nb / 2);
  for (let i = 0; i < nb; i++) cells.push(i === ent ? { w: bw, st: 4, ww: Math.min(2.2, bw - 0.4), wh: 2.4, lit: o.lit ?? 2, rec: 0.2 } : { w: bw, st: o.gst ?? 2, ww: bw - 0.14, wh: gh - (o.gst === 1 ? 1.1 : 0.5), lit: o.lit ?? 2, rec: 0.16 });
  cells.push({ w: (w - gw) / 2 });
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, gh, cells, seed); f.wn(0); f.wall(S[0][0], S[0][1], S[0][2], S[0][3], gh, h, 0, gh);
  for (const k of [1, 3]) { const s = S[k]; f.wall(s[0], s[1], s[2], s[3], 0, h); }
  { const s = S[2]; wallCells(B, s[0], s[1], s[2], s[3], 0, h, [{ w: 2 }, { w: 1.5, st: 8, ww: 0.95, wh: 2.1, lit: 4, rec: 0.08 }, { w: Math.max(1, w - 9) }, { w: 4, st: 5, ww: 3.2, wh: 3.2, rec: 0.12 }, { w: 1.5 }], seed + 3); }
  flatRoof(B, x0, z0, x1, z1, h, par, lay, col, r, 0.7);
  if (o.band) { p.lay(WL.plain); C(p, o.band); p.box(x0 - 0.05, gh + 0.15, z1, x1 + 0.05, h - 0.2, z1 + 0.12, 1 + 4 + 8 + 16 + 32); }
  p.lay(WL.plain + METAL).col(90, 94, 98); p.box(x0 + (w - gw) / 2 - 0.3, gh, z1, x1 - (w - gw) / 2 + 0.3, gh + 0.14, z1 + (o.canopy ?? 1.2), 63);
  if (o.name) { const rect = o.rect || SIGN.text(B.T.atlas, 'sb:' + o.name, o.name, { w: 512, h: 96, bg: o.signBg || '#1d2a3a', fg: o.signFg || '#ffffff', font: o.font ?? 6, sub: o.sub }); const sw = Math.min(w * 0.7, o.signW || 9), shh = sw * rect.h / rect.w; boxSign(B, rect, o.signX || 0, o.signY ?? gh + 0.2 + (h - gh - 0.2) / 2, z1 + 0.27, sw, Math.min(shh, h - gh - 0.5), 0, 2.6); }
  B.collide(x0, z0, x1, z1, h); B.foot(x0, z0, x1, z1, o.hl);
  return { h, gh, x0, x1, z0, z1 };
}

// ---------------------------------------------------------------- yard furniture shared by lots

// Dropped kerb in front of a drive or apron spanning local x0..x1: a wedge in the gutter, concrete across the
// sidewalk, and the surface raster switched to 'lot' there so vehicles are not given a kerb bump.
export function kerbRamp(B, x0, x1, sw, side) {
  const g = B.T.chunks.get('ground', B.x, B.z); g._owner = null; g.frame(B.x, 0, B.z, B.h); g.lay(GL.concrete).col(206, 204, 198);
  g.quad(x0 - 0.6, 0.012, sw + 0.55, x1 + 0.6, 0.012, sw + 0.55, x1, KERB + 0.02, sw - 0.02, x0, KERB + 0.02, sw - 0.02, 0, 0); g.frame();
  B.d.lay(GL.concrete).col(214, 212, 206); B.d.gquad(x0, -0.2, x1, -0.2, x1, sw, x0, sw, 0.02, x0, 0, x1, 0, x1, sw, x0, sw);
  const q = [B.w(x0 - 0.3, -0.6), B.w(x1 + 0.3, -0.6), B.w(x1 + 0.3, sw + 0.4), B.w(x0 - 0.3, sw + 0.4)]; B.T.surf.fill(q, 4, 3); B.T.surf.fill(q, 4, 1);
  if (side) { const c = B.w((x0 + x1) / 2, sw); (side.cuts = side.cuts || []).push([c[0], c[1], (x1 - x0) / 2 + 1]); }
}

export function woodFence(B, x0, z0, x1, z1, hgt = 1.8, col = [176, 150, 120]) {
  const p = B.p, L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) return; const rot = Math.atan2(x1 - x0, z1 - z0);
  p.lay(WL.wood); C(p, col); p.push((x0 + x1) / 2, 0, (z0 + z1) / 2, rot); p.box(-0.04, 0, -L / 2, 0.04, hgt, L / 2, 4 + 8 + 16); p.pop();
  const c = B.w((x0 + x1) / 2, (z0 + z1) / 2); B.T.colliders.add(c[0], c[1], 0.08, L / 2, B.h + rot, hgt, 'barrier', true);
}
export function chainFence(B, x0, z0, x1, z1, hgt = 2.2) {
  cutRun(B, CUT.chain, x0, z0, x1, z1, 0, hgt, [235, 238, 240], 3);
  const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0), c = B.w((x0 + x1) / 2, (z0 + z1) / 2); B.T.colliders.add(c[0], c[1], 0.06, L / 2, B.h + rot, hgt, 'barrier');
}
export function hedge(B, x0, z0, x1, z1, hgt = 1.2, wid = 0.9) {
  const c = B.c, L = Math.hypot(x1 - x0, z1 - z0); if (L < 1) return; const rot = Math.atan2(x1 - x0, z1 - z0), uv = cutUV(CUT.bush), n = Math.max(1, Math.round(L / 2));
  c.col(205, 220, 195).lay(255); c.push((x0 + x1) / 2, 0, (z0 + z1) / 2, rot);
  for (let i = 0; i < n; i++) { const a = -L / 2 + L * i / n, b = -L / 2 + L * (i + 1) / n, um = (uv.u0 + uv.u1) / 2, vm = (uv.v0 + uv.v1) / 2, k = 0.2;
    for (const sx of [-1, 1]) { const x = sx * wid / 2; if (sx > 0) c.quad(x, 0, b, x, 0, a, x * 0.8, hgt, a, x * 0.8, hgt, b, um - k, vm - k, um + k, vm + k); else c.quad(x, 0, a, x, 0, b, x * 0.8, hgt, b, x * 0.8, hgt, a, um - k, vm - k, um + k, vm + k); }
    c.quad(-wid * 0.4, hgt, b, wid * 0.4, hgt, b, wid * 0.4, hgt, a, -wid * 0.4, hgt, a, um - k, vm - k, um + k, vm + k); }
  c.pop();
  const cc = B.w((x0 + x1) / 2, (z0 + z1) / 2); B.T.colliders.add(cc[0], cc[1], wid / 2, L / 2, B.h + rot, hgt, 'barrier', true);
}
// Marked car-park rectangle (local), stalls along X in double rows. Registers parking bays.
export function carPark(B, x0, z0, x1, z1, o = {}) {
  const d = B.d, T = B.T; d.lay(GL.asphalt).col(235, 232, 226); d.gquad(x0, z0, x1, z0, x1, z1, x0, z1, 0.02, x0, z0, x1, z0, x1, z1, x0, z1);
  const c = B.w((x0 + x1) / 2, (z0 + z1) / 2), q4 = [B.w(x0, z0), B.w(x1, z0), B.w(x1, z1), B.w(x0, z1)]; T.lots.push(q4); T.surf.fill(q4, 4, 1);
  const sw = 2.7, sd = 5.2, aisle = 6.6, mod = sd * 2 + aisle, rows = Math.max(1, Math.floor((z1 - z0 + aisle * 0.2) / (sd + aisle / 2 + 0.01) / 1)), p = B.p;
  d.lay(GL.concrete).col(245, 245, 240);
  const line = (ax, az, bx, bz, wd = 0.11) => { const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L * wd / 2, nz = (bx - ax) / L * wd / 2; d.gquad(ax - nx, az - nz, bx - nx, bz - nz, bx + nx, bz + nz, ax + nx, az + nz, 0.034, 0, 0, L, 0, L, wd, 0, wd); };
  let z = z0 + 0.4, k = 0; const occ = o.occ ?? 0.4, rng = o.rng;
  while (z + sd <= z1 - 0.3) {
    const n = Math.floor((x1 - x0 - 1) / sw), xs = (x0 + x1) / 2 - n * sw / 2, up = k % 2 === 0;
    for (let i = 0; i <= n; i++) line(xs + i * sw, z, xs + i * sw, z + sd);
    for (let i = 0; i < n; i++) if (!rng || rng.chance(occ)) { const w = B.w(xs + (i + 0.5) * sw, z + sd / 2); T.parking.push({ x: w[0], z: w[1], heading: B.h + (up ? 0 : Math.PI) + (rng && rng.chance(0.5) ? Math.PI : 0), kind: 'lot' }); }
    z += up ? sd + aisle : sd + 0.05; k++;
  }
  void c; void mod; void rows; void p;
}
