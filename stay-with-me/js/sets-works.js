// Interior sets: apartment stairwell, warehouse, home garage. Layout, clutter and lighting numbers are here,
// together with the pieces only these rooms use (stair flights and balustrades, pallet racking, forklift, car).

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS, STAIN } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';
import { F } from './sets-fixtures.js';
import { SUN, SKYFILL, WARM, DUSKSUN } from './sets-home.js';

const PI = Math.PI, H = PI / 2;

// ---------------------------------------------------------------- stairs
const RISE = 0.175, GOING = 0.26, STEPS = 8;
// concrete flight rising from (zLow, yLow) toward dir*z; cx = centre x, width wd
function flight(K, cx, wd, zLow, yLow, dir) {
  const pts = [[zLow, yLow - 0.2], [zLow, yLow]];
  for (let i = 0; i < STEPS; i++) { pts.push([zLow + dir * i * GOING, yLow + (i + 1) * RISE]); pts.push([zLow + dir * (i + 1) * GOING, yLow + (i + 1) * RISE]); }
  pts.push([zLow + dir * STEPS * GOING, yLow + STEPS * RISE - 0.2]);
  K.extr(M.concrete, pts, wd, cx, 0, 0, { ry: -H, col: 0xb8b4aa });
  for (let i = 0; i < STEPS; i++) K.box(M.metal, wd - 0.02, 0.006, 0.045, cx, yLow + (i + 1) * RISE, zLow + dir * (i * GOING + 0.024), { r: 0.002, col: 0x3a3a3c });
}
// steel balustrade from (z0, y0) to (z1, y1) at x (y = walking surface at each end)
function balustrade(K, x, z0, y0, z1, y1, col = 0x2c3a34) {
  const len = Math.hypot(z1 - z0, y1 - y0), n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.12));
  K.tube(M.metal, [[x, y0 + 0.95, z0], [x, y1 + 0.95, z1]], 0.021, { col, seg: 2, rs: 8 }); K.tube(M.metal, [[x, y0 + 0.12, z0], [x, y1 + 0.12, z1]], 0.012, { col, seg: 2, rs: 6 });
  for (let i = 0; i <= n; i++) { const t = i / n, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t, post = i === 0 || i === n; K.box(M.metal, post ? 0.035 : 0.012, post ? 1.0 : 0.83, post ? 0.035 : 0.012, x, y + (post ? 0 : 0.12), z, { r: 0.002, col }); }
}

// ---------------------------------------------------------------- warehouse pieces
function pallet(K, x, y, z, ry = 0) {
  K.push(x, y, z, ry); const c = shade(0xc8a878, 0.7 + K.rng() * 0.4);
  for (const zz of [-0.44, 0, 0.44]) { K.box(M.wood, 1.2, 0.022, 0.1, 0, 0, zz, { r: 0, col: c }); for (const xx of [-0.55, 0, 0.55]) K.box(M.wood, 0.1, 0.08, 0.1, xx, 0.022, zz, { r: 0, col: c }); K.box(M.wood, 1.2, 0.02, 0.1, 0, 0.102, zz, { r: 0, col: c, noGrain: true }); }
  for (let i = 0; i < 5; i++) K.box(M.wood, 0.14, 0.022, 1.0, -0.53 + i * 0.265, 0.122, 0, { r: 0, col: c });
  K.pop();
}
function load(K, x, y, z, kind, r) {
  K.push(x, y + 0.144, z, (r() - 0.5) * 0.06);
  if (kind === 0) { const nx = 2, nz = 2, ny = r.i(1, 3), bw = 0.56, bd = 0.46, bh = 0.36 + r() * 0.1; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { if (j === ny - 1 && r.chance(0.2)) continue; P.carton(K, bw, bh, bd, (i - 0.5) * (bw + 0.02), j * bh, (k - 0.5) * (bd + 0.02), { ry: (r() - 0.5) * 0.05, label: k === 1 && r.chance(0.5) }); } }
  else if (kind === 1) { const hh = 0.8 + r() * 0.5; K.box(M.matte, 1.1, hh, 0.92, 0, 0, 0, { r: 0.02, col: shade(0xb08a5a, 0.8 + r() * 0.3) }); K.box(M.glassTint, 1.13, hh + 0.01, 0.95, 0, 0, 0, { r: 0.03, col: 0xe8f0f2 }); }
  else if (kind === 2) { for (const [dx, dz] of [[-0.29, -0.24], [0.29, -0.24], [-0.29, 0.24], [0.29, 0.24]]) { K.cyl(M.plastic, 0.27, 0.27, 0.88, dx, 0, dz, { col: 0x24508c, seg: 18 }); for (const yy of [0.28, 0.6]) K.torus(M.plastic, 0.272, 0.012, dx, yy, dz, { rx: H, col: 0x24508c, seg: 18, rs: 5 }); K.cyl(M.plastic, 0.04, 0.04, 0.02, dx + 0.15, 0.88, dz, { col: 0x1a1a1c, seg: 8 }); } }
  else if (kind === 3) { for (let j = 0; j < r.i(2, 4); j++) for (let i = 0; i < 2; i++) K.rbox(M.fabric, 0.52, 0.16, 0.86, (i - 0.5) * 0.56, j * 0.15, 0, { r: 0.06, puff: 0.02, col: shade(0xd8cfb8, 0.85 + r() * 0.2), seg: 2, ry: (j & 1) * H * 0 + (r() - 0.5) * 0.1 }); }
  K.pop();
}
// one racking bay (length 2.7 along X, depth 1.1), frames at both ends
function rackBay(K, r, { levels = 4, lh = 1.55, fill = 0.85, ends = 3 } = {}) {
  const L = 2.7, D = 1.1, ht = levels * lh + 0.3, blue = 0x1f4f8a, org = 0xd9661e;
  for (const s of [-1, 1]) { if (!((s < 0 && (ends & 1)) || (s > 0 && (ends & 2)))) continue;
    for (const dz of [-D / 2, D / 2]) { K.box(M.metal, 0.09, ht, 0.07, s * L / 2, 0, dz, { r: 0.004, col: blue }); K.box(M.metal, 0.14, 0.01, 0.12, s * L / 2, 0, dz, { r: 0.002, col: blue }); }
    for (let i = 0; i < Math.floor(ht / 1.1); i++) { K.box(M.metal, 0.04, 0.04, Math.hypot(D, 1.1) - 0.1, s * L / 2, 0.2 + i * 1.1 + 0.55, 0, { r: 0, rx: (i & 1 ? 1 : -1) * Math.atan2(1.1, D), c: true, col: blue }); K.box(M.metal, 0.04, 0.04, D, s * L / 2, 0.2 + i * 1.1, 0, { r: 0, col: blue }); } }
  for (let lv = 0; lv < levels; lv++) { const y = lv * lh;
    if (lv > 0) for (const dz of [-D / 2, D / 2]) K.box(M.metal, L - 0.09, 0.12, 0.05, 0, y - 0.12, dz, { r: 0.004, col: org });
    for (const px of [-0.66, 0.66]) { if (!r.chance(fill)) continue; pallet(K, px, y, 0, r.chance(0.5) ? PI : 0); load(K, px, y, 0, r.pick([0, 0, 0, 1, 1, 2, 3, 4]), r); } }
}
function forklift(K, beacon) {
  const y0 = 0.16, body = 0xe0a81a;
  K.rbox(M.gloss, 1.1, 0.62, 1.5, 0, y0 + 0.1, -0.2, { r: 0.07, col: body, seg: 3 }); K.rbox(M.metal, 1.12, 0.7, 0.6, 0, y0 + 0.12, -1.02, { r: 0.12, col: 0x2a2a2e, seg: 4 }); K.box(M.metal, 1.0, 0.1, 2.0, 0, y0, -0.2, { r: 0.02, col: 0x1a1a1c });
  for (const s of [-1, 1]) { K.cyl(M.rubberBlack, 0.3, 0.3, 0.2, s * 0.52, 0.3, 0.55, { rz: H, c: true, seg: 22, col: 0x121214 }); K.cyl(M.gloss, 0.14, 0.14, 0.205, s * 0.52, 0.3, 0.55, { rz: H, c: true, seg: 14, col: body }); K.cyl(M.rubberBlack, 0.23, 0.23, 0.17, s * 0.47, 0.23, -0.95, { rz: H, c: true, seg: 20, col: 0x121214 }); K.cyl(M.gloss, 0.1, 0.1, 0.175, s * 0.47, 0.23, -0.95, { rz: H, c: true, seg: 12, col: body }); }
  // overhead guard, seat, controls
  for (const s of [-1, 1]) { K.box(M.metal, 0.06, 1.45, 0.06, s * 0.5, y0 + 0.7, 0.48, { r: 0.008, col: 0x1e1e20, rx: -0.12 }); K.box(M.metal, 0.06, 1.3, 0.06, s * 0.5, y0 + 0.8, -0.8, { r: 0.008, col: 0x1e1e20, rx: 0.06 }); K.box(M.metal, 0.06, 0.06, 1.3, s * 0.5, y0 + 2.08, -0.2, { r: 0.008, col: 0x1e1e20 }); }
  for (let i = 0; i < 5; i++) K.box(M.metal, 1.06, 0.03, 0.04, 0, y0 + 2.1, -0.75 + i * 0.27, { r: 0.004, col: 0x1e1e20 });
  K.rbox(M.vinyl, 0.5, 0.1, 0.48, 0, y0 + 0.72, -0.5, { r: 0.04, col: 0x1a1a1c, seg: 2 }); K.rbox(M.vinyl, 0.5, 0.5, 0.1, 0, y0 + 0.8, -0.76, { r: 0.04, col: 0x1a1a1c, rx: -0.15, seg: 2 });
  K.cyl(M.metal, 0.02, 0.02, 0.5, 0, y0 + 0.95, 0.12, { rx: -0.6, c: true, col: 0x1e1e20, seg: 8 }); K.torus(M.rubberBlack, 0.17, 0.016, 0, y0 + 1.16, -0.02, { rx: H - 0.6, seg: 20, rs: 6, col: 0x111111 });
  K.cyl(M.gloss, 0.16, 0.16, 0.7, 0, y0 + 0.98, -1.06, { rz: H, c: true, col: 0xc8ccd0, seg: 16 });
  K.cyl(M.plastic, 0.05, 0.05, 0.03, 0.35, y0 + 2.14, -0.75, { col: 0x1a1a1c, seg: 12 }); K.cyl(beacon, 0.045, 0.045, 0.08, 0.35, y0 + 2.17, -0.75, { seg: 12 });
  // mast, carriage, forks
  for (const s of [-1, 1]) { K.box(M.metal, 0.09, 2.2, 0.12, s * 0.33, 0.08, 0.92, { r: 0.006, col: 0x1e1e20 }); K.box(M.metal, 0.06, 2.0, 0.08, s * 0.24, 0.1, 0.93, { r: 0.006, col: 0x3a3a3e }); K.box(M.metal, 0.11, 0.045, 1.1, s * 0.25, 0.12, 1.62, { r: 0.008, col: 0x2a2a2e }); K.box(M.metal, 0.11, 0.5, 0.045, s * 0.25, 0.12, 1.06, { r: 0.008, col: 0x2a2a2e }); }
  K.box(M.metal, 0.76, 0.08, 0.1, 0, 2.2, 0.92, { r: 0.006, col: 0x1e1e20 }); K.box(M.metal, 0.9, 0.06, 0.05, 0, 0.5, 1.02, { r: 0.006, col: 0x1e1e20 }); K.box(M.metal, 0.9, 0.06, 0.05, 0, 0.18, 1.02, { r: 0.006, col: 0x1e1e20 });
  for (let i = 0; i < 5; i++) K.box(M.metal, 0.02, 0.9, 0.02, -0.36 + i * 0.18, 0.56, 1.02, { r: 0, col: 0x1e1e20 }); K.cyl(M.chrome, 0.035, 0.035, 1.5, 0, 0.3, 0.9, { seg: 10 });
}

// ---------------------------------------------------------------- garage pieces
function car(K, { col = 0x3a5a78, pitch = 0.035 } = {}) {
  // origin under the rear axle; +Z is the nose. Nose jacked up: rotate about the rear axle.
  K.push(0, 0.31, 0, 0, -pitch); const y = -0.31;
  const body = [[-0.85, 0.36], [-0.9, 0.6], [-0.84, 0.84], [-0.2, 0.92], [2.25, 0.9], [3.15, 0.8], [3.5, 0.66], [3.56, 0.44], [3.46, 0.3], [3.12, 0.28], [3.08, 0.46], [2.95, 0.62], [2.7, 0.68], [2.45, 0.62], [2.32, 0.46], [2.28, 0.26], [0.42, 0.26], [0.38, 0.46], [0.25, 0.62], [0, 0.68], [-0.25, 0.62], [-0.38, 0.46], [-0.42, 0.3], [-0.75, 0.3]];
  K.extr(M.carPaint, body, 1.62, 0, y, 0, { ry: -H, col, bevel: 0.06, bevelSeg: 3 });
  K.extr(M.darkGlass, [[-0.25, 0.9], [0.18, 1.36], [1.2, 1.42], [1.72, 1.37], [2.35, 0.9]], 1.44, 0, y, 0, { ry: -H, bevel: 0.05, bevelSeg: 2 });
  K.rbox(M.carPaint, 1.5, 0.05, 1.5, 0, y + 1.39, 0.95, { r: 0.022, col, seg: 2, rx: -0.01 });
  for (const s of [-1, 1]) { K.box(M.carPaint, 0.05, 0.56, 0.07, s * 0.74, y + 0.88, 0.0, { r: 0.012, col, rx: 0.72 }); K.box(M.carPaint, 0.05, 0.5, 0.07, s * 0.74, y + 0.9, 1.05, { r: 0.012, col }); K.box(M.carPaint, 0.05, 0.62, 0.06, s * 0.74, y + 0.87, 2.02, { r: 0.012, col, rx: -0.9 });
    K.box(M.carPaint, 0.03, 0.05, 2.0, s * 0.775, y + 0.89, 1.05, { r: 0.012, col }); K.box(M.chrome, 0.012, 0.02, 0.12, s * 0.87, y + 0.8, 1.3, { r: 0.004 }); K.box(M.chrome, 0.012, 0.02, 0.12, s * 0.87, y + 0.8, 0.45, { r: 0.004 });
    K.box(M.matte, 0.006, 0.6, 0.008, s * 0.872, y + 0.3, 1.63, { r: 0, col: 0x0a0a0a }); K.box(M.matte, 0.006, 0.6, 0.008, s * 0.872, y + 0.3, 0.72, { r: 0, col: 0x0a0a0a });
    K.rbox(M.plastic, 0.06, 0.1, 0.16, s * 0.92, y + 0.95, 1.9, { r: 0.03, col: 0x1a1a1c, seg: 2 });
    // rear wheel on the ground, front hub bare
    K.cyl(M.rubberBlack, 0.31, 0.31, 0.2, s * 0.76, y + 0.31, 0, { rz: H, c: true, seg: 26, col: 0x101012 }); K.cyl(M.metal, 0.19, 0.19, 0.205, s * 0.76, y + 0.31, 0, { rz: H, c: true, seg: 18, col: 0xb8bcc0 }); K.cyl(M.metal, 0.06, 0.06, 0.215, s * 0.76, y + 0.31, 0, { rz: H, c: true, seg: 10, col: 0x4a4a4c });
    K.cyl(M.steel, 0.15, 0.15, 0.02, s * 0.74, y + 0.31, 2.7, { rz: H, c: true, seg: 22 }); K.cyl(M.metal, 0.07, 0.07, 0.07, s * 0.77, y + 0.31, 2.7, { rz: H, c: true, seg: 12, col: 0x5a5a5c }); K.box(M.gloss, 0.06, 0.12, 0.1, s * 0.74, y + 0.38, 2.6, { r: 0.012, col: 0xa8231f }); K.box(M.metal, 0.04, 0.3, 0.04, s * 0.66, y + 0.4, 2.7, { r: 0.006, col: 0x2a2a2c });
    K.box(M.glassTint, 0.3, 0.1, 0.04, s * 0.58, y + 0.7, 3.52, { r: 0.014, col: 0xf4f4f0, ry: s * -0.25 }); K.box(M.gloss, 0.26, 0.09, 0.03, s * 0.6, y + 0.7, -0.895, { r: 0.012, col: 0x7a1010 });
  }
  K.box(M.matte, 0.9, 0.12, 0.03, 0, y + 0.66, 3.57, { r: 0.008, col: 0x0c0c0e }); for (let i = 0; i < 4; i++) K.box(M.chrome, 0.86, 0.008, 0.01, 0, y + 0.68 + i * 0.025, 3.59, { r: 0 });
  K.rbox(M.plastic, 1.6, 0.16, 0.12, 0, y + 0.34, 3.5, { r: 0.05, col: 0x1e1e20, seg: 2 }); K.rbox(M.plastic, 1.6, 0.16, 0.12, 0, y + 0.36, -0.86, { r: 0.05, col: 0x1e1e20, seg: 2 });
  K.plane(M.signs, 0.36, 0.17, 0, y + 0.44, 3.565, { uv: ATLAS.signs.rect.plate }); K.plane(M.signs, 0.36, 0.17, 0, y + 0.52, -0.925, { uv: ATLAS.signs.rect.plate, ry: PI });
  // open bonnet with the engine bay under it
  K.box(M.matte, 1.4, 0.3, 1.0, 0, y + 0.52, 2.85, { r: 0, col: 0x0e0e10 });
  K.box(M.metal, 0.5, 0.2, 0.6, -0.05, y + 0.72, 2.8, { r: 0.02, col: 0x4a4c50 }); K.box(M.plastic, 0.44, 0.06, 0.5, -0.05, y + 0.92, 2.8, { r: 0.02, col: 0x1a1a1c }); K.box(M.plastic, 0.22, 0.18, 0.17, 0.5, y + 0.72, 3.15, { r: 0.012, col: 0x1e1e20 }); for (const s of [-1, 1]) K.cyl(M.metal, 0.012, 0.012, 0.02, 0.5 + s * 0.06, y + 0.9, 3.15, { col: s > 0 ? 0xa8231f : 0x1a1a1c, seg: 6 });
  K.cyl(M.plastic, 0.07, 0.07, 0.08, -0.5, y + 0.78, 3.1, { col: 0xe8e4da, seg: 12 }); K.cyl(M.plastic, 0.04, 0.04, 0.02, -0.5, y + 0.86, 3.1, { col: 0xe0b020, seg: 10 }); K.tube(M.rubberBlack, [[-0.3, y + 0.86, 2.6], [-0.5, y + 0.9, 2.8], [-0.52, y + 0.82, 3.3]], 0.02, { tension: 0.5, seg: 12 });
  K.push(0, y + 0.92, 2.28, 0, -0.95); K.rbox(M.carPaint, 1.5, 0.04, 1.28, 0, 0, 0.64, { r: 0.018, col, seg: 2 }); K.box(M.matte, 1.3, 0.01, 1.1, 0, -0.012, 0.64, { r: 0, col: 0x1a1a1c }); K.pop();
  K.cyl(M.metal, 0.005, 0.005, 0.86, 0.6, y + 1.26, 3.0, { rx: -0.42, c: true, col: 0x8a8d90, seg: 5 });
  K.pop();
}
function axleStand(K, hgt = 0.36) { for (let i = 0; i < 3; i++) { const a = i * TAU / 3; K.box(M.metal, 0.025, hgt, 0.025, Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075, { r: 0.004, col: 0xa8231f, rz: Math.cos(a) * 0.36, rx: -Math.sin(a) * 0.36 }); } K.cyl(M.metal, 0.02, 0.02, hgt + 0.08, 0, 0.02, 0, { col: 0x8a8d90, seg: 8 }); K.box(M.metal, 0.07, 0.025, 0.04, 0, hgt + 0.09, 0, { r: 0.004, col: 0x8a8d90 }); K.torus(M.metal, 0.13, 0.008, 0, 0.012, 0, { rx: H, col: 0xa8231f, seg: 14, rs: 4 }); }
function wheel(K, x, y, z, o = {}) { K.push(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0); K.cyl(M.rubberBlack, 0.31, 0.31, 0.2, 0, 0, 0, { c: true, seg: 26, col: 0x101012 }); K.cyl(M.metal, 0.19, 0.19, 0.205, 0, 0, 0, { c: true, seg: 18, col: 0xb8bcc0 }); K.cyl(M.metal, 0.06, 0.06, 0.215, 0, 0, 0, { c: true, seg: 10, col: 0x4a4a4c }); K.pop(); }
// hand tools hung flat on a wall (local XY), z = stand-off
function tool(K, kind, x, y, z, s = 1, rz = 0) {
  K.push(x, y, z, 0, 0, rz, s);
  if (kind === 'hammer') { K.cyl(M.wood, 0.014, 0.012, 0.3, 0, -0.3, 0, { col: C.beech, seg: 8 }); K.box(M.metal, 0.11, 0.032, 0.032, 0.005, 0, 0, { r: 0.006, col: 0x3a3a3c }); }
  else if (kind === 'driver') { K.cyl(M.plastic, 0.015, 0.013, 0.1, 0, -0.1, 0, { col: [0xc0392b, 0xe0b020, 0x24508c][Math.floor(K.rng() * 3)], seg: 8 }); K.cyl(M.chrome, 0.0035, 0.0035, 0.13, 0, -0.23, 0, { seg: 5 }); }
  else if (kind === 'spanner') { K.box(M.chrome, 0.016, 0.16, 0.005, 0, -0.16, 0, { r: 0.002 }); K.cyl(M.chrome, 0.016, 0.016, 0.006, 0, 0, 0, { rx: H, c: true, seg: 10 }); K.cyl(M.chrome, 0.014, 0.014, 0.006, 0, -0.17, 0, { rx: H, c: true, seg: 6 }); }
  else if (kind === 'saw') { K.box(M.steel, 0.5, 0.11, 0.002, 0.25, -0.055, 0, { r: 0, rz: 0.0 }); K.rbox(M.wood, 0.13, 0.13, 0.022, -0.05, -0.065, 0, { r: 0.03, col: C.beech, seg: 2 }); }
  else if (kind === 'level') { K.box(M.metal, 0.6, 0.05, 0.022, 0, 0, 0, { r: 0.004, col: 0xe0b020 }); K.box(M.glassTint, 0.05, 0.02, 0.024, 0, 0.015, 0, { r: 0.002, col: 0xc8f08a }); }
  else if (kind === 'pliers') { for (const sx of [-1, 1]) { K.box(M.plastic, 0.012, 0.11, 0.008, sx * 0.012, -0.16, 0, { r: 0.004, col: 0xa8231f, rz: sx * 0.08 }); K.box(M.metal, 0.01, 0.05, 0.006, sx * 0.004, -0.05, 0, { r: 0.002, col: 0x5a5a5c }); } }
  else if (kind === 'cord') { K.torus(M.plastic, 0.12, 0.018, 0, -0.14, 0.01, { col: 0xd9661e, seg: 20, rs: 6 }); K.torus(M.plastic, 0.105, 0.016, 0.006, -0.145, 0.03, { col: 0xd9661e, seg: 20, rs: 6 }); }
  K.cyl(M.metal, 0.003, 0.003, 0.03, 0, 0.012, -0.005, { rx: H, c: true, col: 0x8a8d90, seg: 4 });
  K.pop();
}

export const WORKS = {
  stairwell(K) {
    const r = K.rng, hw = 1.3, zN = -1.1, zE = 0.9, zF = zE + STEPS * GOING, zS = zF + 1.22, yb = -3.0, yt = 5.6, wallC = 0xe2dcc6, dadoC = 0x6c8a7e;
    K.H = 2.6; K.bounds.set(new THREE.Vector3(-hw, yb, zN), new THREE.Vector3(hw, yt, zS));
    const wo = { y0: yb, h: yt, mat: M.block, col: wallC, dado: { h: 1.3, col: dadoC }, skirt: 0, t: 0.18, ext: 0.18 };
    const doors = [{ x: -0.62, id: 'num3a' }, { x: 0.66, id: 'num3b' }];
    K.wall(-hw, zN, hw, zN, { ...wo, holes: doors.map(dd => ({ u0: dd.x + hw - 0.42, u1: dd.x + hw + 0.42, y0: 0, y1: 2.03 })) });
    K.wall(hw, zS, -hw, zS, { ...wo, holes: [{ u0: 0.75, u1: 1.85, y0: 2.3, y1: 3.5 }, { u0: 0.75, u1: 1.85, y0: -0.5, y1: 0.7 }] });
    K.wall(hw, zN, hw, zS, wo); K.wall(-hw, zS, -hw, zN, wo);
    K.box(M.plaster, 2 * hw + 0.4, 0.2, zS - zN + 0.4, 0, yt, (zN + zS) / 2, { r: 0, col: 0x3a3a38 }); K.box(M.concrete, 2 * hw + 0.4, 0.2, zS - zN + 0.4, 0, yb - 0.2, (zN + zS) / 2, { r: 0 });
    // landings: ours (y=0), the ones above and below, and the half-landings at the far end
    const slab = (y, z0, z1, top) => { K.box(M.concrete, 2 * hw, 0.2, z1 - z0, 0, y - 0.2, (z0 + z1) / 2, { r: 0, col: top ?? 0xb8b4aa, uvo: [0, 0, (z0 + z1) / 2] }); };
    for (const y of [-2.8, 0, 2.8]) slab(y, zN, zE); for (const y of [-1.4, 1.4, 4.2]) slab(y, zF, zS);
    K.box(M.plaster, 2 * hw, 0.012, zE - zN, 0, 2.588, (zN + zE) / 2, { r: 0, col: 0xdcd6c4 });
    const cl = -(hw + 0.1) / 2, cr = (hw + 0.1) / 2, fw = hw - 0.1;
    flight(K, cl, fw, zE, 0, 1); flight(K, cr, fw, zF, -1.4, -1); flight(K, cr, fw, zF, 1.4, -1); flight(K, cl, fw, zE, -2.8, 1); flight(K, cl, fw, zE, 2.8, 1);
    // balustrades on the well side of each flight, wall rails on the outer walls
    balustrade(K, -0.1, zE + 0.02, 0, zF, 1.4); balustrade(K, 0.1, zE + 0.02, 0, zF, -1.4); balustrade(K, 0.1, zF, 1.4, zE + 0.02, 2.8); balustrade(K, -0.1, zE + 0.02, -2.8, zF, -1.4);
    K.tube(M.metal, [[-0.1, 0.95, zE + 0.02], [0.1, 0.95, zE + 0.02]], 0.021, { col: 0x2c3a34, seg: 2 }); K.tube(M.metal, [[-0.1, 2.35, zF], [0.1, 2.35, zF]], 0.021, { col: 0x2c3a34, seg: 2 }); K.tube(M.metal, [[-0.1, -0.45, zF], [0.1, -0.45, zF]], 0.021, { col: 0x2c3a34, seg: 2 });
    for (const [x, y0, y1] of [[-hw + 0.07, 0, 1.4], [hw - 0.07, 0, -1.4]]) { K.tube(M.metal, [[x, y0 + 0.92, zE - 0.25], [x, y0 + 0.92, zE + 0.05], [x, y1 + 0.92, zF], [x, y1 + 0.92, zF + 0.25]], 0.02, { col: 0x8a7a5a, tension: 0.05, seg: 30 }); for (let i = 0; i < 3; i++) { const t = i / 2, z = zE + 0.1 + (zF - zE - 0.2) * t; K.cyl(M.metal, 0.008, 0.008, 0.07, x - Math.sign(x) * 0.035, y0 + (y1 - y0) * (z - zE) / (zF - zE) + 0.9, z, { rz: H, c: true, col: 0x8a7a5a, seg: 6 }); } }
    // flat doors
    doors.forEach((dd, i) => {
      const f = { x: dd.x, z: zN, ry: 0, w: 0.84, y0: 0, y1: 2.03, t: 0.18 };
      K.door(f, { open: i ? 0.5 : 0, hinge: i ? -1 : 1, swing: -1, col: i ? 0x3d5a78 : 0x7a3a2e, style: 'panel', handle: 'knob', metal: M.brass, frameCol: 0xd8d2be, beyond: i ? { depth: 1.6, w: 1.2, glow: 2.2, floorCol: 0x7a6a58, col: 0xd8ceb4, h: 2.4 } : false });
      K.at(dd.x, 0, zN, 0, () => { K.plane(M.signs, 0.1, 0.065, 0.56 * (i ? -1 : 1), 1.62, 0.004, { uv: ATLAS.signs.rect[dd.id] }); K.cyl(M.plastic, 0.02, 0.02, 0.012, 0.56 * (i ? -1 : 1), 1.25, 0.008, { rx: H, c: true, col: 0xe8e4d8, seg: 10 }); });
      K.at(dd.x, 0, zN + 0.34, (r() - 0.5) * 0.1, () => K.box(M.carpet, 0.7, 0.014, 0.42, 0, 0, 0, { r: 0.004, col: i ? 0x5a4a36 : 0x3a3a3e }));
    });
    // skirting on the landing, service cupboard, extinguisher, pipes, post
    K.box(M.satin, 0.016, 0.1, zE - zN, -hw + 0.008, 0, (zN + zE) / 2, { r: 0.004, col: 0x4a5a54 }); K.box(M.satin, 0.016, 0.1, zE - zN, hw - 0.008, 0, (zN + zE) / 2, { r: 0.004, col: 0x4a5a54 });
    K.at(-hw, 0, 0.05, H, () => { K.box(M.metal, 0.62, 1.1, 0.03, 0, 0.5, 0.015, { r: 0.004, col: 0x8a9096 }); K.box(M.metal, 0.56, 1.04, 0.008, 0, 0.53, 0.032, { r: 0.004, col: 0x9aa0a6 }); K.plane(M.signs, 0.12, 0.12, 0, 1.2, 0.038, { uv: ATLAS.signs.rect.danger }); K.cyl(M.chrome, 0.012, 0.012, 0.01, 0.22, 1.0, 0.04, { rx: H, c: true, seg: 8 }); });
    K.at(hw, 0, -0.45, -H, () => { K.cyl(M.gloss, 0.065, 0.065, 0.42, 0, 0.75, 0.085, { col: 0xb81c1c, seg: 14 }); K.cyl(M.metal, 0.02, 0.03, 0.06, 0, 1.17, 0.085, { col: 0x1a1a1c, seg: 8 }); K.box(M.metal, 0.03, 0.2, 0.02, 0, 0.95, 0.012, { r: 0.004, col: 0x8a8d90 }); K.plane(M.signs, 0.14, 0.21, 0, 1.62, 0.003, { uv: ATLAS.signs.rect.fireext }); K.plane(M.signs, 0.26, 0.26, 0.75, 1.75, 0.003, { uv: ATLAS.signs.rect.floor3 }); });
    for (const dx of [0, 0.07]) K.cyl(M.metal, 0.022 - dx * 0.1, 0.022 - dx * 0.1, yt - yb, hw - 0.05 - dx, yb, zN + 0.06 + dx * 0.4, { col: dx ? 0xb87348 : 0xd8d2be, seg: 8 });
    K.tube(M.metal, [[-hw + 0.04, 2.5, zN + 0.3], [-hw + 0.04, 2.5, zS - 0.1]], 0.012, { col: 0xb8bcc0, seg: 2 }); K.box(M.metal, 0.07, 0.1, 0.1, -hw + 0.04, 2.45, 0.3, { r: 0.006, col: 0xb8bcc0 });
    // clutter: rubbish bag, flyers, grime
    K.rbox(M.gloss, 0.42, 0.4, 0.38, -1.02, 0, 0.62, { r: 0.16, puff: 0.03, wrinkle: 0.04, col: 0x0c0c0e, seg: 5 }); K.sph(M.gloss, 0.05, -1.02, 0.44, 0.62, { col: 0x0c0c0e, seg: 8, seg2: 6 });
    for (let i = 0; i < 6; i++) K.plane(i % 2 ? M.signs : M.matte, 0.15, 0.21, 0.3 + r() * 0.8, 0.003 + i * 0.0005, -0.85 + r() * 0.35 + (i > 3 ? 1.4 : 0), { up: true, ry: r() * TAU, col: i % 2 ? 0xffffff : 0xe8e0c8, uv: i % 2 ? ATLAS.signs.rect.takeaway : undefined });
    K.stain('scuff', 1.6, 1.0, 0.2, 0.2); K.stain('water', 0.7, 0.5, -0.8, -0.6); K.stain('scuff', 1.0, 0.8, -0.7, 2.0, { y: 0.72 }); K.stain('oil', 0.3, 0.25, 0.9, -0.2, { col: 0x9a9a9a });
    for (const [x, y, z, ry, s] of [[-hw + 0.002, 0.7, -0.4, H, 0.9], [hw - 0.002, 0.5, 0.4, -H, 1.1], [0.1, 0.6, zN + 0.002, 0, 0.8]]) K.plane(M.stain, s, s * 0.7, x, y, z, { ry, uv: STAIN.scuff });
    K.plane(M.stain, 1.2, 0.9, 0.4, 2.586, -0.2, { rx: H, uv: STAIN.coffee, col: 0xb0a080 });
    // what a bake would add where the landing meets the walls, and what a shared stair collects
    { const L = zE - zN, mz = (zN + zE) / 2;
      K.at(0, 0, zN, 0, () => { K.ao(2 * hw, 0.5, 0, 0.016, 0.25, { ry: PI, k: 0.5, strip: true }); K.ao(2 * hw, 0.45, 0, 2.582, 0.225, { rx: H, k: 0.45, strip: true }); for (const sg of [-1, 1]) K.ao(2.6, 0.36, sg * (hw - 0.18), 1.3, 0.0045, { wall: true, rz: sg * H, k: 0.4, strip: true }); });
      for (const sg of [-1, 1]) K.at(sg * hw, 0, mz, -sg * H, () => { K.ao(L, 0.5, 0, 0.016, 0.25, { ry: PI, k: 0.5, strip: true }); K.ao(L, 0.42, 0, 0.21, 0.018, { wall: true, k: 0.36, strip: true }); K.ao(L, 0.45, 0, 2.582, 0.225, { rx: H, k: 0.45, strip: true }); K.grime('drip', 1.4, 0.7, (r() - 0.5) * 0.4, 2.2, 0.0046, { col: 0x6a6a5a }); for (let i = 0; i < 3; i++) K.grime('scuff', 0.3 + r() * 0.4, 0.1 + r() * 0.12, (r() - 0.5) * (L - 0.6), 0.12 + r() * 0.9, 0.019 + i * 0.0003, {}); });
      K.grime('wear', 1.8, 1.3, 0, 0.0066, 0.1, { up: true, col: 0xd8d4c8 }); K.grime('smudge', 1.2, 0.5, -0.62, 0.0068, zN + 0.5, { up: true, col: 0x4a4a44 }); K.grime('smudge', 1.2, 0.5, 0.66, 0.0069, zN + 0.5, { up: true, col: 0x4a4a44 });
      K.scatter(2, [-1.15, -0.95, 1.15, 0.8], 0.05, i => P.can(K, 0, 0, 0, { tipped: true, crushed: !i, col: [0x1a4a8a, 0x2a2a2a][i] }));
      K.scatter(16, [-1.2, -1.0, 1.2, 0.85], 0.012, () => K.cyl(M.matte, 0.009 + K.rng() * 0.008, 0.01, 0.0012, 0, 0, 0, { col: 0x26262a, seg: 7 }), { under: true });
      K.scatter(5, [-1.2, -1.0, 1.2, 0.85], 0.02, () => K.cyl(M.matte, 0.004, 0.004, 0.028, 0, 0.004, 0, { rz: H, c: true, col: 0xd8a868, seg: 5 }), { under: true });
      K.drop([[1.08, 0.6], [-1.05, -0.5]], 0.14, () => P.mail(K, { n: 6, spread: 0.2 })); }
    // windows on the half-landings
    const bd = K.night ? 'night' : K.dusk ? 'dusk' : K.rain ? 'rain' : 'cityDay';
    for (const y0 of [2.3, -0.5]) K.window({ x: 0, z: zS, ry: PI, w: 1.1, y0, y1: y0 + 1.2, t: 0.18 }, { cols: 2, rows: 2, frameCol: 0x5a6a64, frameMat: M.metal, backdrop: y0 > 0 ? bd : null, sillCol: 0xb8b4aa });
    K.at(0, 0, zS, PI, () => K.plane(K.emit(0xdfeaf2, K.day ? 2.0 : K.dusk ? 0.6 : 0.04, { key: 'lowwin', base: 0x202428 }), 1.0, 1.1, 0, 0.1, -0.2, {}));
    // the one working tube
    const tm = [], fx = K.at(0, 2.588, -0.15, 0, () => P.fluoro(K, { len: 1.2, on: true, col: 0xeaf6e4, k: 8 }));
    for (const [k, m] of K.emits) if (k.includes('tube')) tm.push(m);
    K.at(0, 5.6, 3.4, 0, () => P.fluoro(K, { len: 1.2, on: false }));
    K.hemi(0xb8c4c0, 0x4a4a44, K.day ? 0.16 : 0.07);
    const key = K.spot(fx.x, fx.y, fx.z, fx.x, 0, fx.z + 0.1, { col: 0xeaf6e4, int: 11, angle: 1.35, pen: 0.5, shadow: true, near: 0.1, far: 9 });
    const up = K.point(fx.x, fx.y - 0.25, fx.z, { col: 0xeaf6e4, int: 1.2, dist: 6 });
    K.on((dt, t) => { const f = 0.95 + 0.04 * Math.sin(t * 113) + (Math.sin(t * 0.7) > 0.985 ? -0.5 : 0); key.intensity = 11 * f; up.intensity = 1.2 * f; for (const m of tm) m.emissiveIntensity = 8 * f; });
    K.point(0.66, 1.5, zN - 0.8, { col: WARM, int: 1.6, dist: 5 });
    if (K.day) { if (!K.rain) K.sun(4, 40, SUN, 4.5); K.spot(0, 3.2, zS + 1.2, 0, 0.6, 1.2, { col: SKYFILL, int: K.rain ? 26 : 18, angle: 0.7, pen: 1 }); K.point(0, -0.6, zS - 0.8, { col: SKYFILL, int: 2.5, dist: 6 }); }
    else if (K.dusk) K.sun(14, 12, DUSKSUN, 2.2, { soft: 3 }); else K.point(0, 3.0, zS - 0.4, { col: 0xff9a4a, int: 1.2, dist: 6 });
    K.spots({ floor: [0, -0.12, H], side: -1, by: [[0.72, -0.72], [-0.75, 0.62]], cam: [0.72, 1.45, 1.2], target: [-0.1, 0.25, -0.2], partner: [-0.35, 0, -0.78], kit: [-0.72, 0, 0.6] });
    return { exposure: K.day ? 1.15 : 1.3, bloom: 0.12, envInt: K.day ? 0.85 : 0.7, envPos: [0, 1.3, 0.2], cameraBounds: new THREE.Box3(new THREE.Vector3(-hw + 0.2, 0.25, zN + 0.2), new THREE.Vector3(hw - 0.2, 2.4, zE + 0.4)) };
  },

  warehouse(K) {
    const w = 16, d = 18, h = 8, r = K.rng, doorX = 3.2, dw = 4.2, dh = 4.6, open = 2.35;
    K.room({ w, d, h, wallMat: M.corrugated, wallCol: 0xc4c9cc, dado: { h: 2.4, mat: M.block, col: 0xd8d6d0 }, floorMat: M.concrete, floorCol: 0xd0d0cc, ceilMat: M.corrugated, ceilCol: 0x9aa0a4, skirt: 0, wear: 0.5, wearCol: 0x4a4a48, openings: [{ id: 'roller', wall: 'S', at: doorX, w: dw, y0: 0, y1: dh }, { id: 'door', wall: 'W', at: 6.6, w: 0.95, y1: 2.08 }] });
    K.door(K.frames.door, { open: 0, style: 'glazed', col: 0x3a4a5a, mat: M.metal, handle: 'bar', frameCol: 0x3a4a5a, kick: true });
    K.onWall('W', 6.6, () => { K.box(M.plastic, 0.34, 0.16, 0.04, 0, 2.2, 0.02, { r: 0.006, col: 0xe8e8e4 }); K.plane(K.screen(2.2, 'exit'), 0.3, 0.13, 0, 2.28, 0.041, { uv: ATLAS.screens.rect.exit }); });
    // roller door, half up, with the yard beyond
    K.at(doorX, 0, d / 2, PI, () => {
      const bd = K.backdropMat(K.night ? 'carpark' : K.dusk ? 'dusk' : K.rain ? 'rain' : 'yardDay'); K.plane(bd, 40, 20, 0, 1.5 - 0.42 * 20 + 10, -12, {});
      K.box(M.concrete, 14, 0.1, 12, 0, -0.1, -6.1, { r: 0, col: 0xc4c4be }); for (const s of [-1, 1]) K.box(M.block, 0.3, 5, 6, s * (dw / 2 + 3.2), 0, -3.3, { r: 0, col: 0xb8b6b0 });
      // the yard: hatched loading bay, a drain, standing water, bins, spare pallets, the kerb and fence at the far side
      for (let i = 0; i < 8; i++) K.box(M.matte, 0.12, 0.004, 3.4, -2.1 + i * 0.6, 0.001, -2.4, { r: 0, ry: 0.6, col: 0xc8a41c }); for (const z of [-0.7, -4.1]) K.box(M.matte, dw + 0.8, 0.004, 0.12, 0, 0.001, z, { r: 0, col: 0xc8a41c });
      K.box(M.metal, 0.5, 0.012, 0.5, 1.4, 0, -5.2, { r: 0.004, col: 0x3a3a3c }); for (let i = 0; i < 5; i++) K.box(M.matte, 0.4, 0.002, 0.04, 1.4, 0.012, -5.36 + i * 0.08, { r: 0, col: 0x0a0a0a });
      for (let i = 0; i < (K.rain ? 6 : 3); i++) K.plane(M.stain, 1.6 + r() * 1.8, 1.0 + r() * 1.2, -4 + r() * 8, 0.003 + i * 0.0006, -1.5 - r() * 7, { up: true, uv: STAIN.water, ry: r() * 6, col: 0x8a8a88 });
      for (let i = 0; i < 2; i++) K.at(-3.6 - i * 0.75, 0, -1.0 - i * 0.1, 0.1 - i * 0.25, () => { K.box(M.plastic, 0.58, 0.95, 0.7, 0, 0.05, 0, { r: 0.04, col: i ? 0x2a4a34 : 0x24508c }); K.box(M.plastic, 0.62, 0.05, 0.76, 0, 1.0, 0.01, { r: 0.02, col: i ? 0x2a4a34 : 0x24508c, rx: i ? 0 : -0.12 }); for (const sx of [-1, 1]) K.cyl(M.rubberBlack, 0.09, 0.09, 0.04, sx * 0.24, 0.09, -0.3, { rz: H, c: true, col: 0x151515, seg: 12 }); });
      for (let i = 0; i < 4; i++) pallet(K, 3.9 + (r() - 0.5) * 0.06, i * 0.146, -1.5 + (r() - 0.5) * 0.06, 0.2 + (r() - 0.5) * 0.1);
      K.box(M.concrete, 14, 0.16, 0.24, 0, 0, -9.2, { r: 0.02, col: 0xb0b0aa }); for (let i = 0; i < 8; i++) K.cyl(M.metal, 0.03, 0.03, 2.2, -6.3 + i * 1.8, 0.16, -9.3, { col: 0x8a8d90, seg: 8 }); K.plane(M.glassTint, 12.8, 2.0, 0, 1.25, -9.3, { col: 0x8a9096 });
      K.ao(14, 0.8, 0, 0.004, -0.42, { k: 0.5, strip: true }); for (const s of [-1, 1]) K.ao(6, 0.8, s * (dw / 2 + 3.05 - 0.4), 0.004, -3.3, { ry: s * H, k: 0.45, strip: true });
      K.box(M.corrugated, dw - 0.04, dh - open, 0.03, 0, open, -0.1, { r: 0, col: 0x8f979c, uvo: [0, 0, 0] }); K.box(M.metal, dw - 0.04, 0.09, 0.06, 0, open - 0.02, -0.1, { r: 0.008, col: 0x3a3a3c }); K.box(M.rubberBlack, dw - 0.06, 0.03, 0.04, 0, open - 0.05, -0.1, { r: 0.01, col: 0x151515 });
      for (const s of [-1, 1]) { K.box(M.metal, 0.1, dh + 0.3, 0.12, s * (dw / 2 + 0.03), 0, 0.03, { r: 0.006, col: 0x6a7076 }); K.cyl(M.gloss, 0.09, 0.09, 1.1, s * (dw / 2 + 0.45), 0, 0.55, { col: 0xe0b020, seg: 14 }); for (const y of [0.35, 0.75]) K.cyl(M.matte, 0.092, 0.092, 0.12, s * (dw / 2 + 0.45), y, 0.55, { col: 0x151515, seg: 14 }); K.sph(M.gloss, 0.09, s * (dw / 2 + 0.45), 1.1, 0.55, { col: 0xe0b020, seg: 12, seg2: 6, pl: H }); }
      K.box(M.metal, dw + 0.4, 0.45, 0.4, 0, dh + 0.05, 0.2, { r: 0.02, col: 0x6a7076 }); K.box(M.plastic, 0.16, 0.24, 0.09, dw / 2 + 0.5, 1.3, 0.045, { r: 0.01, col: 0xe0b020 }); for (let i = 0; i < 3; i++) K.cyl(M.plastic, 0.02, 0.02, 0.02, dw / 2 + 0.5, 1.48 - i * 0.06, 0.1, { rx: H, c: true, col: [0x2a8a3a, 0xa8231f, 0x1a1a1c][i], seg: 10 });
    });
    // steel frame, rooflights
    for (const z of [-6, 0, 6]) { for (const s of [-1, 1]) { K.box(M.metal, 0.22, h, 0.3, s * (w / 2 - 0.15), 0, z, { r: 0.008, col: 0x7a3a2a }); K.box(M.gloss, 0.3, 1.1, 0.38, s * (w / 2 - 0.17), 0, z, { r: 0.02, col: 0xe0b020 }); } K.box(M.metal, w, 0.36, 0.2, 0, h - 0.5, z, { r: 0.006, col: 0x7a3a2a }); }
    for (const x of [-6, -3, 0, 3, 6]) K.box(M.metal, 0.1, 0.14, d, x, h - 0.14, 0, { r: 0.004, col: 0x8a8d90 });
    const sky = K.emit(0xdfeaf5, K.day ? (K.rain ? 2.2 : 4.5) : K.dusk ? 0.8 : 0.02, { key: 'roofl', base: 0x40484e });
    for (const [x, z] of [[-4.5, -3], [4.5, -3], [-4.5, 3.5], [4.5, 3.5]]) K.box(sky, 1.1, 0.02, 4.5, x, h - 0.03, z, { r: 0 });
    // racking: west wall run, double row, east wall run
    const run = (x, z0, n, ry, o) => { for (let i = 0; i < n; i++) K.at(x, 0, z0 + i * 2.7 + 1.35, ry, () => rackBay(K, r, { ...o, ends: i === 0 ? 3 : (ry > 0 ? 1 : 2) })); K.collide(1.2, 6.6, n * 2.7 + 0.1, x, 0, z0 + n * 1.35, 0.05); };
    run(-w / 2 + 0.75, -8.4, 4, H, {}); run(-3.3, -8.4, 4, H, {}); run(-2.1, -8.4, 4, -H, {}); run(w / 2 - 0.75, -8.4, 3, -H, { fill: 0.7 });
    // floor markings
    const yl = (x0, z0, x1, z1, col = 0xd8a818) => K.box(M.satin, Math.abs(x1 - x0) || 0.1, 0.002, Math.abs(z1 - z0) || 0.1, (x0 + x1) / 2, 0.001, (z0 + z1) / 2, { r: 0, col });
    yl(-1.3, -8.4, -1.3, 2.6); yl(-4.1, -8.4, -4.1, 2.6); yl(-6.5, -8.4, -6.5, 2.6); yl(6.5, -8.4, 6.5, -0.2); yl(-1.3, 2.6, -6.5, 2.6); yl(doorX - dw / 2 - 0.3, 8.9, doorX - dw / 2 - 0.3, 5.5); yl(doorX + dw / 2 + 0.3, 8.9, doorX + dw / 2 + 0.3, 5.5);
    for (let i = 0; i < 9; i++) K.box(M.satin, 0.5, 0.002, 0.12, -7.2 + 0.0, 0.001, 3.6 + i * 0.6, { r: 0, col: 0xe8e8e0, ry: 0.6 }); yl(-7.75, 3.2, -7.75, 8.9, 0x2a8a3a); yl(-6.65, 3.2, -6.65, 8.9, 0x2a8a3a);
    K.stain('scuff', 3.5, 1.6, 2.5, 5.0, { ry: 1.5 }); K.stain('scuff', 3, 1.4, 0.8, -2.0, { ry: 0.3 }); K.stain('oil', 0.8, 0.6, 4.2, -1.8); K.stain('oil', 0.5, 0.4, 0.6, 6.6); K.stain('water', 1.6, 1.1, 5.2, 7.4);
    // forklift, pallet stack, pallet truck, drums, wrap
    const beacon = K.emit(0xff9a1a, 4, { key: 'beacon' }); K.on((dt, t) => { beacon.emissiveIntensity = (t * 1.6) % 1 < 0.25 ? 7 : 0.6; });
    K.prop(4.3, 0, -1.6, -2.5, () => forklift(K, beacon));
    K.prop(6.8, 0, 2.6, 0.06, () => { for (let i = 0; i < 6; i++) pallet(K, (r() - 0.5) * 0.04, i * 0.146, (r() - 0.5) * 0.04, (r() - 0.5) * 0.08); });
    K.prop(6.6, 0, 4.6, 0.3, () => { pallet(K, 0, 0, 0); load(K, 0, 0, 0, 1, r); }); K.prop(-0.2, 0, 6.9, 1.4, () => { pallet(K, 0, 0, 0); load(K, 0, 0, 0, 2, r); });
    K.prop(0.2, 0, 0.9, 2.2, () => { for (const s of [-1, 1]) { K.box(M.metal, 0.16, 0.05, 1.15, s * 0.19, 0.06, 0.55, { r: 0.008, col: 0xa8231f }); K.cyl(M.rubberBlack, 0.04, 0.04, 0.09, s * 0.19, 0.04, 1.02, { rz: H, c: true, seg: 10, col: 0x222222 }); } K.box(M.metal, 0.5, 0.36, 0.2, 0, 0.06, -0.08, { r: 0.02, col: 0xa8231f }); K.cyl(M.rubberBlack, 0.09, 0.09, 0.06, 0, 0.09, -0.16, { rz: H, c: true, seg: 14, col: 0x222222 }); K.tube(M.metal, [[0, 0.4, -0.1], [0, 1.1, -0.42]], 0.016, { col: 0x1e1e20, seg: 2 }); K.torus(M.metal, 0.1, 0.014, 0, 1.18, -0.46, { rx: 0.4, col: 0x1e1e20, seg: 14, rs: 5 }); });
    // walls: signs, first aid, extinguisher
    K.onWall('E', 4.0, () => { K.plane(M.signs, 1.5, 0.56, 0, 2.9, 0.01, { uv: ATLAS.signs.rect.warn }); P.picture(K, -1.6, 1.7, { w: 0.6, h: 0.75, pic: 'safety', atlas: 'signs', mount: 0, col: 0x1a1a1c, f: 0.015 }); });
    K.onWall('S', -3.0, () => { K.box(M.satin, 0.4, 0.4, 0.14, 0, 1.3, 0.07, { r: 0.012, col: 0x0c8a4c }); K.plane(M.signs, 0.3, 0.3, 0, 1.5, 0.142, { uv: ATLAS.signs.rect.firstaid }); K.cyl(M.gloss, 0.075, 0.075, 0.5, 0.8, 0.7, 0.09, { col: 0xb81c1c, seg: 14 }); K.cyl(M.metal, 0.02, 0.03, 0.06, 0.8, 1.2, 0.09, { col: 0x1a1a1c, seg: 8 }); K.plane(M.signs, 0.2, 0.3, 0.8, 1.75, 0.004, { uv: ATLAS.signs.rect.fireext }); K.plane(M.signs, 1.5, 0.56, -2.2, 2.9, 0.01, { uv: ATLAS.signs.rect.warn }); P.clock(K, 2.0, 3.2, { r: 0.25, col: 0x1a1a1c, hour: K.night ? 2.3 : 10.6 }); });
    // the story: a fall from the steps; cartons down with them
    K.at(3.5, 0.2, 1.9, 0.6, () => { for (const s of [-1, 1]) { K.box(M.metal, 0.05, 1.7, 0.025, s * 0.22, 0, 0, { r: 0.004, col: 0xc8ccd0, rz: -s * 0.05 }); K.box(M.metal, 0.04, 1.6, 0.025, s * 0.26, 0, 0.5, { r: 0.004, col: 0xc8ccd0, rx: 0.3 }); } for (let i = 0; i < 5; i++) K.box(M.metal, 0.44 - i * 0.02, 0.025, 0.09, 0, 0.25 + i * 0.3, 0, { r: 0.004, col: 0xc8ccd0 }); K.box(M.plastic, 0.42, 0.04, 0.24, 0, 1.68, 0.05, { r: 0.01, col: 0xd9661e }); }, H - 0.08, 0); K.collide(1.9, 0.5, 1.2, 3.55, 0, 1.9);
    P.carton(K, 0.5, 0.36, 0.42, -0.5, 0, 3.8, { ry: 0.5, label: true }); P.carton(K, 0.5, 0.36, 0.42, 0.25, 0, 4.5, { ry: 1.9 }); K.at(-0.9, 0.21, 4.8, 0.3, () => P.carton(K, 0.5, 0.36, 0.42, 0, 0, 0, {}), H, 0);
    K.at(0.1, 0, 4.0, 1.0, () => { K.sph(M.plastic, 0.13, 0, 0.0, 0, { col: 0xe0b020, seg: 16, seg2: 8, pl: H, sy: 0.9 }); K.cyl(M.plastic, 0.15, 0.15, 0.012, 0, 0, 0.03, { col: 0xe0b020, seg: 16 }); }, 0, 2.6); K.box(M.satin, 0.23, 0.012, 0.32, 2.0, 0, 4.3, { r: 0.004, ry: 0.7, col: 0x6a4a2a }); K.plane(M.signs, 0.2, 0.28, 2.0, 0.014, 4.3, { up: true, ry: 0.7, uv: ATLAS.signs.rect.paper });
    // high-bay lights
    const warm = K.night ? 0xffc27a : 0xf2f6ff, bays = [];
    for (const x of [-4.5, 1.5, 6.0]) for (const z of [-4.5, 2.5]) { bays.push([x, z]); K.at(x, h - 0.9, z, 0, () => { K.cyl(M.metal, 0.004, 0.004, 0.55, 0, 0.3, 0, { seg: 4, col: 0x8a8d90 }); K.lathe(M.metal, [[0.28, 0], [0.26, 0.04], [0.1, 0.22], [0.08, 0.3], [0.001, 0.3]], 0, 0, 0, { seg: 20, col: 0xb8bcc0 }); K.cyl(K.emit(warm, 9, { key: 'bay' }), 0.24, 0.24, 0.01, 0, 0.004, 0, { seg: 20 }); }); }
    // a working shed: tyre marks down the aisles, shrink wrap and cardboard, dust banked against the walls
    for (let i = 0; i < 14; i++) K.grime('scuff', 1.6 + r() * 2.2, 0.35 + r() * 0.3, -1 + r() * 8, 0.0064 + i * 0.0002, -1.5 + r() * 9.5, { up: true, ry: (r() < 0.5 ? 0 : H) + (r() - 0.5) * 0.5 });
    for (let i = 0; i < 6; i++) K.grime('smudge', 1.5 + r() * 1.5, 1.2 + r(), -1 + r() * 8, 0.0096 + i * 0.0002, -1 + r() * 9, { up: true, ry: r() * 6, col: 0x3a3832 });
    K.scatter(3, [-0.5, -1.5, 7.0, 8.2], 0.4, () => { K.heap(M.glassTint, 0.8, 0.17, 0.6, 0, 0, 0, { col: 0xaab6ba, amp: 0.5, freq: 3.2, detail: 4 }); K.collide(0.6, 0.2, 0.5); K.ao(0.95, 0.8, 0, 0.017, 0, { k: 0.4 }); });
    K.scatter(9, [-0.8, -1.8, 7.2, 8.4], 0.12, i => K.box(M.matte, 0.2 + K.rng() * 0.3, 0.004, 0.14 + K.rng() * 0.2, 0, 0.002, 0, { r: 0, col: i % 3 ? 0xb08a5a : 0x9a7a4e, rx: (K.rng() - 0.5) * 0.06 }), { under: true });
    K.hemi(0xdfe6ee, 0x6a6a66, K.day ? 0.26 : 0.09);
    K.spot(1.5, h - 0.95, 2.5, 1.2, 0, 3.4, { col: warm, int: K.day ? 90 : 190, angle: 1.05, pen: 0.6, shadow: true, near: 0.5, far: 16 });
    K.point(-4.5, h - 1.2, -4.5, { col: warm, int: K.day ? 50 : 110 }); K.point(6.0, h - 1.2, -4.5, { col: warm, int: K.day ? 50 : 110 }); K.point(-4.5, h - 1.2, 2.5, { col: warm, int: K.day ? 50 : 110 }); K.point(6.0, h - 1.2, 2.5, { col: warm, int: K.day ? 40 : 90 });
    if (K.day && !K.rain) K.sun(12, 36, SUN, 6, { map: 4096 }); else if (K.dusk) K.sun(22, 10, DUSKSUN, 3, { soft: 3 }); else if (K.night) K.point(doorX, 3.5, d / 2 + 2.5, { col: 0xff9a4a, int: 26, dist: 12 }); else K.point(doorX, 3.0, d / 2 + 1.5, { col: 0xdfe6f0, int: 30, dist: 12 });
    K.spots({ floor: [1.0, 3.3, H], side: 1, by: [[2.9, 3.9], [-0.4, 2.2]], cam: [2.1, 1.45, 4.6], target: [0.8, 0.25, 3.2] });
    return { exposure: K.day ? 0.95 : 1.1, bloom: 0.1, envInt: 0.8, envPos: [1.5, 1.6, 3.5], cameraBounds: new THREE.Box3(new THREE.Vector3(-1.0, 0.25, -2), new THREE.Vector3(7.4, 2.6, 8.6)) };
  },

  garage(K) {
    const w = 5.8, d = 6.4, h = 2.7, r = K.rng, on = true;
    const Fr = K.room({ w, d, h, wallMat: M.block, wallCol: 0xdcd8cc, floorMat: M.concrete, floorCol: 0xc4c2bc, ceilCol: 0xd8d4c8, skirt: 0, wear: 0.8, wearCol: 0x4a4844, openings: [{ id: 'win', wall: 'E', at: -1.5, w: 1.1, y0: 1.28, y1: 1.98 }, { id: 'door', wall: 'N', at: 2.0, w: 0.82, y0: 0.14, y1: 2.14 }] });
    K.window(Fr.win, { cols: 2, frameCol: 0xd8d4c8, sillCol: 0xb8b4aa });
    K.door(Fr.door, { open: 0, hinge: -1, col: 0xe8e4d8, handle: 'knob', metal: M.brass });
    K.onWall('N', 2.0, () => K.box(M.concrete, 1.1, 0.14, 0.34, 0, 0, 0.17, { r: 0.006, col: 0xb8b4aa }));
    for (let i = 0; i < 9; i++) K.box(M.wood, 0.045, 0.2, d, -w / 2 + 0.4 + i * 0.625, h - 0.2, 0, { r: 0.004, col: C.pine });
    // sectional door on the south wall
    K.onWall('S', 0, () => { const pw = 4.9, lite = K.emit(0xdfeaf2, K.day ? (K.rain ? 1.6 : 3.2) : K.dusk ? 0.7 : 0.03, { key: 'lite', base: 0x30363a });
      for (let i = 0; i < 4; i++) { K.box(M.satin, pw, 0.525, 0.045, 0, 0.01 + i * 0.535, 0.04, { r: 0.006, col: 0xe2dfd6 }); for (let j = 0; j < 2; j++) K.box(M.satin, pw - 0.1, 0.02, 0.012, 0, 0.14 + i * 0.535 + j * 0.25, 0.066, { r: 0.004, col: 0xcfccc2 }); for (const x of [-2.2, -0.75, 0.75, 2.2]) K.box(M.metal, 0.05, 0.1, 0.01, x, 0.5 + i * 0.535, 0.068, { r: 0.002, col: 0x8a8d90 }); }
      for (const x of [-1.8, -0.6, 0.6, 1.8]) { K.box(M.plastic, 0.56, 0.32, 0.01, x, 1.71, 0.064, { r: 0.006, col: 0x2a2a2c }); K.plane(lite, 0.5, 0.26, x, 1.87, 0.0695, {}); }
      for (const s of [-1, 1]) { K.box(M.metal, 0.05, 2.2, 0.06, s * (pw / 2 + 0.04), 0, 0.06, { r: 0.004, col: 0x9a9da0 }); K.tube(M.metal, [[s * (pw / 2 + 0.04), 2.15, 0.08], [s * (pw / 2 + 0.04), 2.4, 0.2], [s * (pw / 2 + 0.04), 2.45, 0.5], [s * (pw / 2 + 0.04), 2.45, 2.6]], 0.022, { tension: 0.4, col: 0x9a9da0, seg: 20 }); }
      K.box(M.metal, 0.06, 0.05, 3.0, 0, 2.42, 1.6, { r: 0.006, col: 0x9a9da0 }); K.box(M.plastic, 0.3, 0.16, 0.44, 0, 2.3, 3.1, { r: 0.02, col: 0xd8d4c8 }); K.cyl(K.emit(0xfff0d0, 0.4, { key: 'opener', base: 0xf0ece0 }), 0.05, 0.05, 0.02, 0, 2.28, 3.1, { seg: 12 });
      K.box(K.emit(0xdfeaf2, K.day ? 1.2 : 0.0, { key: 'gap', base: 0x101010 }), pw, 0.012, 0.01, 0, 0.0, 0.02, { r: 0 }); });
    // the car, nose in, front on stands
    K.prop(-1.45, 0, -1.2, 0, () => { car(K, {}); for (const s of [-1, 1]) K.at(s * 0.66, 0, 2.2, s, () => axleStand(K, 0.3)); });
    K.prop(-1.45, 0, 2.95, 0.15, () => { K.box(M.gloss, 0.26, 0.13, 0.62, 0, 0.03, 0, { r: 0.02, col: 0xa8231f }); for (const s of [-1, 1]) { K.cyl(M.metal, 0.035, 0.035, 0.05, s * 0.14, 0.035, 0.26, { rz: H, c: true, col: 0x3a3a3c, seg: 10 }); K.cyl(M.metal, 0.03, 0.03, 0.04, s * 0.13, 0.03, -0.28, { rz: H, c: true, col: 0x3a3a3c, seg: 10 }); } K.box(M.metal, 0.08, 0.04, 0.4, 0, 0.16, 0.1, { r: 0.008, col: 0x8a1c18, rx: -0.25 }); K.cyl(M.metal, 0.05, 0.05, 0.02, 0, 0.22, 0.27, { col: 0x3a3a3c, seg: 12 }); K.tube(M.metal, [[0, 0.14, -0.26], [0, 0.6, -0.72]], 0.014, { col: 0x3a3a3c, seg: 2 }); K.cyl(M.rubberBlack, 0.018, 0.018, 0.14, 0, 0.64, -0.76, { rx: 0.78, c: true, col: 0x1a1a1c, seg: 8 }); }, { pad: 0 });
    wheel(K, -2.72, 0.31, 0.2, { rz: H - 0.22 }); wheel(K, -0.05, 0.1, 2.75, { ry: 0.3 }); K.collide(0.7, 0.25, 0.7, -0.05, 0, 2.75);
    // creeper, drain pan, oil
    K.prop(-0.2, 0, 0.9, 0.12, () => { K.box(M.metal, 0.4, 0.02, 0.98, 0, 0.06, 0, { r: 0.006, col: 0x1e1e20 }); K.rbox(M.vinyl, 0.36, 0.035, 0.74, 0, 0.08, -0.08, { r: 0.016, col: 0xa8231f, seg: 2 }); K.rbox(M.vinyl, 0.26, 0.06, 0.18, 0, 0.08, 0.38, { r: 0.028, col: 0x1a1a1c, seg: 2 }); for (const sx of [-1, 1]) for (const z of [-0.42, 0, 0.42]) K.cyl(M.rubberBlack, 0.028, 0.028, 0.02, sx * 0.18, 0.028, z, { rz: H, c: true, col: 0x222222, seg: 8 }); }, { pad: 0 });
    K.lathe(M.plastic, [[0.001, 0], [0.2, 0], [0.23, 0.09], [0.22, 0.09], [0.19, 0.012], [0.001, 0.01]], -1.3, 0, 1.75, { col: 0x151517, seg: 20 }); K.cyl(M.gloss, 0.2, 0.19, 0.004, -1.3, 0.05, 1.75, { col: 0x0a0806, seg: 18 });
    K.at(-0.6, 0, 2.05, 0.4, () => { P.bottle(K, 0, 0, 0, { kind: 'spray', col: 0x3a3a3e, s: 1.3, mat: M.plastic, cap: 0xe0b020 }); P.bottle(K, 0.14, 0, 0.05, { kind: 'spray', col: 0x3a3a3e, s: 1.3, mat: M.plastic, cap: 0xe0b020 }); K.cyl(M.metal, 0.04, 0.04, 0.09, -0.12, 0, 0.1, { col: 0x24508c, seg: 12 }); K.rbox(M.fabric, 0.26, 0.03, 0.2, 0.3, 0, -0.1, { r: 0.012, wrinkle: 0.02, col: 0xa8231f, seg: 4 }); });
    K.stain('oil', 0.9, 0.7, -1.3, 1.6); K.stain('oil', 0.6, 0.5, -1.6, 0.2); K.stain('oil', 0.4, 0.3, 0.6, -0.9); K.stain('oil', 1.2, 0.8, -1.2, -0.6, { col: 0xaaaaaa }); K.stain('scuff', 2.4, 1.0, -1.45, -1.0, { ry: H }); K.stain('water', 0.9, 0.6, 1.9, 2.6);
    // workbench under the window with a pegboard either side
    K.prop(w / 2, 0, -1.5, -H, () => {
      const bl = 2.3, bd = 0.66, bh = 0.92, c = 0xc8a878;
      K.box(M.wood, bl, 0.05, bd, 0, bh - 0.05, bd / 2, { r: 0.006, col: shade(c, 0.85) }); for (const sx of [-1, 1]) for (const z of [0.06, bd - 0.06]) K.box(M.wood, 0.09, bh - 0.05, 0.09, sx * (bl / 2 - 0.07), 0, z, { r: 0.006, col: c });
      K.box(M.wood, bl - 0.16, 0.025, bd - 0.1, 0, 0.2, bd / 2, { r: 0.004, col: c }); K.box(M.wood, bl - 0.14, 0.09, 0.03, 0, bh - 0.14, bd - 0.05, { r: 0.004, col: c }); K.box(M.wood, bl, 0.12, 0.025, 0, bh, 0.0125, { r: 0.004, col: c });
      // vise
      K.at(-0.9, bh, bd - 0.12, 0, () => { K.box(M.metal, 0.14, 0.05, 0.2, 0, 0, 0, { r: 0.01, col: 0x24508c }); K.box(M.metal, 0.12, 0.1, 0.05, 0, 0.05, -0.05, { r: 0.008, col: 0x24508c }); K.box(M.metal, 0.12, 0.1, 0.04, 0, 0.05, 0.07, { r: 0.008, col: 0x24508c }); K.cyl(M.steel, 0.012, 0.012, 0.22, 0, 0.07, 0.12, { rx: H, c: true, seg: 8 }); K.cyl(M.steel, 0.006, 0.006, 0.16, 0, 0.07, 0.22, { rz: H, c: true, seg: 6 }); });
      // tools and clutter on the bench
      K.at(0.75, bh, 0.36, 0.2, () => { K.box(M.gloss, 0.46, 0.18, 0.22, 0, 0, 0, { r: 0.012, col: 0xa8231f }); K.box(M.gloss, 0.46, 0.02, 0.22, 0, 0.26, -0.13, { r: 0.008, col: 0xa8231f, rx: -1.2 }); K.box(M.metal, 0.4, 0.03, 0.16, 0, 0.16, 0, { r: 0.004, col: 0x5a5a5c }); for (let i = 0; i < 4; i++) K.cyl(M.chrome, 0.008, 0.008, 0.17, -0.14 + i * 0.09, 0.2, 0, { rx: H + 0.2, c: true, seg: 6 }); });
      K.box(M.metal, 0.11, 0.032, 0.032, -0.3, bh, 0.42, { r: 0.006, col: 0x3a3a3c, ry: 0.6 }); K.cyl(M.wood, 0.014, 0.012, 0.3, -0.17, bh + 0.016, 0.33, { rx: H, ry: 0.6 - H, c: true, col: C.beech, seg: 8 });
      K.rbox(M.plastic, 0.08, 0.2, 0.07, 0.2, bh + 0.04, 0.3, { r: 0.025, col: 0x1e7a8a, seg: 2, rz: H, c: true }); K.cyl(M.metal, 0.02, 0.014, 0.06, 0.33, bh + 0.035, 0.3, { rz: -H, c: true, col: 0x3a3a3c, seg: 10 }); K.box(M.plastic, 0.08, 0.06, 0.1, 0.1, bh, 0.22, { r: 0.012, col: 0x1a1a1c });
      for (let i = 0; i < 4; i++) { K.cyl(M.glassTint, 0.035, 0.035, 0.09, -0.55 + i * 0.09, bh, 0.1, { seg: 12, col: 0xdfe8ea }); K.cyl(M.metal, 0.037, 0.037, 0.012, -0.55 + i * 0.09, bh + 0.09, 0.1, { seg: 12, col: 0xc8a030 }); K.cyl(M.metal, 0.03, 0.03, 0.04 + (i & 1) * 0.02, -0.55 + i * 0.09, bh + 0.004, 0.1, { seg: 8, col: 0x6a6a6c }); }
      P.bottle(K, 0.42, bh, 0.12, { kind: 'spray', col: 0x24508c, cap: 0xa8231f, mat: M.plastic }); P.mug(K, 0.0, bh, 0.5, { col: 0xe8e2d0, ry: 2 }); K.rbox(M.matte, 0.07, 0.07, 0.045, -0.05, bh, 0.2, { r: 0.015, col: 0xe0b020, seg: 2 });
      K.box(M.plastic, 0.26, 0.15, 0.09, 1.0, bh, 0.12, { r: 0.012, col: 0x2a2a2e }); K.cyl(M.chrome, 0.003, 0.003, 0.4, 1.1, bh + 0.34, 0.1, { rz: -0.3, c: true, seg: 4 }); K.box(M.matte, 0.1, 0.1, 0.004, 0.95, bh + 0.025, 0.166, { r: 0, col: 0x151515 });
      K.rbox(M.fabric, 0.24, 0.04, 0.2, -0.6, bh, 0.5, { r: 0.015, wrinkle: 0.025, col: 0x8a8478, seg: 4 });
      for (const [px, pw] of [[-0.95, 0.72], [0.95, 0.72]]) { K.box(M.pegboard, pw, 0.86, 0.012, px, 1.14, 0.014, { r: 0, uvo: [0, 0, 0] }); K.box(M.wood, pw + 0.04, 0.02, 0.03, px, 2.0, 0.015, { r: 0.004, col: c }); }
      tool(K, 'hammer', -1.22, 1.86, 0.03); tool(K, 'saw', -1.1, 1.5, 0.03, 1, 0.1); for (let i = 0; i < 5; i++) tool(K, 'spanner', -1.0 + i * 0.06, 1.9, 0.03, 0.75 + i * 0.1); for (let i = 0; i < 3; i++) tool(K, 'driver', -0.74 + i * 0.05, 1.5, 0.03);
      tool(K, 'level', 0.95, 1.9, 0.03); tool(K, 'pliers', 0.72, 1.75, 0.03); tool(K, 'pliers', 0.82, 1.75, 0.03, 0.85); tool(K, 'cord', 1.15, 1.72, 0.03); tool(K, 'hammer', 0.98, 1.55, 0.03, 0.8); for (let i = 0; i < 3; i++) tool(K, 'driver', 0.7 + i * 0.05, 1.42, 0.03);
      // shop light over the bench
      K.at(0, 2.3, 0.4, 0, () => { K.lightB = P.fluoro(K, { len: 1.2, on: K.lampsOn, col: 0xf2f6ff, k: 7, twin: true }); for (const s of [-1, 1]) K.cyl(M.metal, 0.002, 0.002, 0.4, s * 0.5, 0, 0, { seg: 4, col: 0x8a8d90 }); });
      // under the bench
      for (let i = 0; i < 3; i++) K.cyl(M.metal, 0.085, 0.085, 0.19, -0.7 + i * 0.2, 0.225, 0.3, { col: 0xc8ccd0, seg: 14 }); P.carton(K, 0.4, 0.3, 0.34, 0.5, 0.225, 0.33, { ry: 0.1 });
    });
    // tool chest, shelving, tyre stack on the east side
    K.prop(w / 2 - 0.02, 0, 0.55, -H, () => { K.box(M.gloss, 0.68, 0.86, 0.46, 0, 0.1, 0.23, { r: 0.012, col: 0xa8231f }); for (let i = 0; i < 5; i++) { K.box(M.gloss, 0.64, 0.15, 0.012, 0, 0.13 + i * 0.165, 0.466, { r: 0.004, col: 0xb82a22 }); K.box(M.chrome, 0.56, 0.018, 0.016, 0, 0.245 + i * 0.165, 0.478, { r: 0.004 }); } for (const sx of [-1, 1]) for (const z of [0.06, 0.4]) K.cyl(M.rubberBlack, 0.05, 0.05, 0.03, sx * 0.28, 0.05, z, { rz: H, c: true, col: 0x222222, seg: 10 }); K.box(M.gloss, 0.66, 0.3, 0.42, 0, 0.97, 0.22, { r: 0.012, col: 0xa8231f }); K.box(M.chrome, 0.2, 0.02, 0.02, 0, 1.2, 0.44, { r: 0.004 }); });
    K.prop(w / 2 - 0.02, 0, 1.85, -H, () => { const sw = 1.3, sd = 0.45; for (const sx of [-1, 1]) for (const z of [0.03, sd - 0.03]) K.box(M.metal, 0.035, 1.9, 0.035, sx * (sw / 2 - 0.02), 0, z, { r: 0.002, col: 0x8a8d90 });
      for (let i = 0; i < 5; i++) { const y = 0.08 + i * 0.44; K.box(M.metal, sw, 0.025, sd, 0, y, sd / 2, { r: 0.002, col: 0x8a8d90 }); if (i === 4) continue; let x = -sw / 2 + 0.1; while (x < sw / 2 - 0.12) { const q = r.i(0, 3); if (q === 0) { const cr = 0.08 + r() * 0.02; K.cyl(M.metal, cr, cr, 0.19, x + cr, y + 0.025, 0.22, { col: 0xc8ccd0, seg: 14 }); K.cyl(M.satin, cr + 0.001, cr + 0.001, 0.1, x + cr, y + 0.06, 0.22, { col: r.pick([0xd8d4c8, 0x3a6a8a, 0x8a3a2a, 0x4a7a4a]), seg: 14 }); x += cr * 2 + 0.03; } else if (q === 1) { K.box(M.plastic, 0.36, 0.24, 0.38, x + 0.18, y + 0.025, 0.22, { r: 0.02, col: r.pick([0x5a6a7a, 0x3a5a8a, 0x8a8d90]) }); K.box(M.plastic, 0.38, 0.03, 0.4, x + 0.18, y + 0.265, 0.22, { r: 0.012, col: 0x2a2a2e }); x += 0.42; } else if (q === 2) { P.carton(K, 0.3, 0.26, 0.32, x + 0.15, y + 0.025, 0.22, { ry: (r() - 0.5) * 0.2 }); x += 0.35; } else { K.rbox(M.plastic, 0.16, 0.3, 0.26, x + 0.08, y + 0.025, 0.22, { r: 0.04, col: r.pick([0xa8231f, 0x24508c, 0xe0b020]), seg: 2 }); K.cyl(M.plastic, 0.025, 0.025, 0.04, x + 0.12, y + 0.32, 0.3, { col: 0x1a1a1c, seg: 8 }); x += 0.22; } } } });
    K.prop(2.45, 0, 2.78, 0, () => { for (let i = 0; i < 4; i++) { K.cyl(M.rubberBlack, 0.32, 0.32, 0.21, (r() - 0.5) * 0.03, i * 0.215, (r() - 0.5) * 0.03, { seg: 26, col: 0x111113 }); K.cyl(M.matte, 0.19, 0.19, 0.012, 0, i * 0.215 + 0.2, 0, { seg: 18, col: 0x050505 }); } });
    // north wall: water heater, panel, garden tools; west wall: shelf and ladder
    K.prop(-w / 2 + 0.42, 0, -d / 2 + 0.42, 0, () => { K.cyl(M.satin, 0.27, 0.27, 1.45, 0, 0.3, 0, { col: 0xe4e2dc, seg: 24 }); K.sph(M.satin, 0.27, 0, 1.75, 0, { col: 0xe4e2dc, seg: 24, seg2: 8, pl: H, sy: 0.4 }); for (let i = 0; i < 3; i++) K.box(M.metal, 0.04, 0.3, 0.04, Math.cos(i * 2.1) * 0.2, 0, Math.sin(i * 2.1) * 0.2, { r: 0.004, col: 0x3a3a3c }); K.cyl(M.metal, 0.05, 0.05, 0.9, 0, 1.85, 0, { col: 0xb8bcc0, seg: 10 }); for (const s of [-1, 1]) K.tube(M.metal, [[s * 0.12, 1.84, 0.1], [s * 0.12, 2.2, 0.1], [s * 0.12, 2.3, 0.0], [s * 0.12, 2.3, -0.4]], 0.011, { tension: 0.3, col: 0xb87348, seg: 14 }); K.box(M.plastic, 0.14, 0.18, 0.06, 0, 0.5, 0.27, { r: 0.012, col: 0x2a2a2e }); });
    K.onWall('N', -0.4, () => { K.box(M.metal, 0.4, 0.6, 0.1, 0, 1.25, 0.05, { r: 0.006, col: 0x8a9096 }); K.box(M.metal, 0.34, 0.5, 0.008, 0, 1.3, 0.102, { r: 0.004, col: 0x9aa0a6 }); K.plane(M.signs, 0.1, 0.1, 0, 1.72, 0.108, { uv: ATLAS.signs.rect.danger }); K.cyl(M.metal, 0.012, 0.012, 0.85, 0, 1.85, 0.04, { col: 0xb8bcc0, seg: 6 }); });
    K.prop(0.75, 0, -d / 2 + 0.06, 0, () => { K.cyl(M.wood, 0.016, 0.016, 1.5, -0.12, 0, 0.1, { rx: -0.1, col: C.beech, seg: 8 }); K.box(M.metal, 0.22, 0.28, 0.012, -0.12, 0, 0.12, { r: 0.004, col: 0x4a4a4c, rx: -0.1 }); K.cyl(M.wood, 0.016, 0.016, 1.55, 0.14, 0, 0.12, { rx: -0.12, col: C.beech, seg: 8 }); K.box(M.metal, 0.4, 0.02, 0.08, 0.14, 0.02, 0.14, { r: 0.004, col: 0x3a6a3a }); K.cyl(M.wood, 0.014, 0.014, 1.3, 0.34, 0, 0.1, { rx: -0.09, col: C.beech, seg: 8 }); K.box(M.matte, 0.3, 0.14, 0.05, 0.34, 0, 0.12, { r: 0.01, col: 0xc8a030 }); K.collide(0.7, 1.6, 0.3, 0.1, 0, 0.12); }, { collide: false });
    K.onWall('W', 1.4, () => { K.box(M.wood, 1.6, 0.03, 0.3, 0, 1.75, 0.15, { r: 0.004, col: C.pine }); for (const s of [-1, 1]) K.box(M.metal, 0.03, 0.2, 0.26, s * 0.6, 1.55, 0.13, { r: 0.004, col: 0x8a8d90 }); P.carton(K, 0.4, 0.26, 0.26, -0.4, 1.78, 0.15, { label: true }); K.rbox(M.plastic, 0.3, 0.26, 0.2, 0.25, 1.78, 0.15, { r: 0.04, col: 0xa8231f, seg: 2 }); P.carton(K, 0.3, 0.2, 0.24, 0.6, 1.78, 0.15, { ry: 0.2 }); });
    K.onWall('W', -2.2, () => K.plane(M.signs, 0.5, 0.25, 0, 1.6, 0.004, { uv: ATLAS.signs.rect.plate, rz: 0.03 }));
    K.switchPlate('N', 1.4, 1.25); K.socket('E', -0.3, 1.2, false); K.socket('E', -2.6, 1.2);
    // inspection lamp on a lead under the bonnet
    const insp = K.emit(0xfff2dc, 6, { key: 'insp' });
    K.at(-0.75, 0, 1.55, 0, () => { K.cyl(M.plastic, 0.03, 0.03, 0.12, 0, 0.06, 0, { rz: H, c: true, col: 0xe0b020, seg: 10 }); K.cyl(insp, 0.028, 0.028, 0.2, 0.16, 0.06, 0, { rz: H, c: true, seg: 10 }); K.tube(M.plastic, [[-0.06, 0.05, 0], [-0.3, 0.012, 0.3], [0.4, 0.012, 0.9], [1.6, 0.012, 0.6], [2.8, 0.012, -0.9], [3.4, 0.3, -1.6], [3.6, 1.15, -1.82]], 0.006, { col: 0xd9661e, tension: 0.5, seg: 60, rs: 5 }); });
    const bulb = K.at(0.9, h - 0.2, 0.5, 0, () => P.pendant(K, { kind: 'bare', drop: 0.35, on }));
    // years of weekend jobs: oily rags, boots by the door, a trailing lead, damp creeping up the blockwork
    K.scatter(3, [-0.4, -2.6, 2.6, 2.8], 0.14, i => K.rumple(M.curtain, 0.4, 0.3, 0.06, 0, 0, 0, { col: [0x8a2a22, 0x9a9488, 0x3a4a5a][i], n: 14 }));
    K.along('N', 1, 0.2, () => P.shoes(K, { kind: 'boot', col: 0x4a3a2a, sole: 0x1a1a1a, messy: 0.6 }), { lo: 0.2, hi: 0.95 }); K.along('E', 1, 0.16, () => P.extension(K, { plugs: 2, col: 0xe07a1a }));
    for (const k of 'NEW') K.onWall(k, (r() - 0.5) * 2, () => { K.grime('smudge', 2.2, 0.8, 0, 0.42, 0.0046, { col: 0x5a5a50 }); K.grime('drip', 1.6, 0.6, 0.8, h - 0.32, 0.0046, { col: 0x6a665a }); });
    for (let i = 0; i < 5; i++) K.grime('scuff', 0.8 + r() * 1.2, 0.3 + r() * 0.2, -1.5 + r() * 3.5, 0.0064 + i * 0.0002, -2.5 + r() * 5, { up: true, ry: (r() - 0.5) * 0.4 + H });
    K.hemi(0xcad4de, 0x6a6862, K.day ? 0.27 : 0.045);
    K.spot(bulb.x, bulb.y - 0.03, bulb.z, bulb.x, 0, bulb.z, { col: 0xffe2bc, int: K.day ? 7 : 15, angle: 1.38, pen: 0.4, shadow: !(K.day && !K.rain), near: 0.1 }); K.point(bulb.x, bulb.y, bulb.z, { col: 0xffe2bc, int: K.day ? 1.0 : 2.2 });
    K.point(-0.6, 0.25, 1.6, { col: 0xfff2dc, int: 1.2, dist: 3.5 });
    if (K.day) { if (!K.rain) K.sun(92, 31, SUN, 6.8, { shaft: 1.5 }); else K.sun(92, 45, 0xdfe6f0, 0.6, { shadow: false }); K.spot(w / 2 + 1.0, 1.9, -1.5, 0.3, 0.3, -0.6, { col: SKYFILL, int: K.rain ? 78 : 18, angle: 0.8, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 }); K.point(0, 1.6, d / 2 - 0.6, { col: SKYFILL, int: 3.5, dist: 7 }); }
    else { if (K.dusk) K.sun(100, 9, DUSKSUN, 2.2, { soft: 3 }); K.point(w / 2 - 0.5, 2.1, -1.5, { col: 0xf2f6ff, int: 4, dist: 6 }); }
    K.spots({ floor: [1.0, 0.75, 0], side: 1, by: [[1.9, 2.3], [0.5, -1.4]], cam: [1.95, 1.4, 2.0], target: [0.8, 0.25, 0.3], partner: [0.38, 0, 0.4], kit: [1.72, 0, -0.1] });
    return { exposure: K.day ? 1.2 : 1.2, bloom: 0.14, envInt: K.day ? 1.0 : 0.65, envPos: [0.9, 1.3, 0.6] };
  },
};
