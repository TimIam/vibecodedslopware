// Interior sets: fitted furniture, appliances, sanitary ware, beds and care equipment.
// Same conventions as sets-props.js: built at the Kit's current transform, front faces local +Z, wall-backed pieces
// have their origin at the back-centre on the floor.

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';

const PI = Math.PI, H = PI / 2;
export const F = {};

// ---- kitchen
// run of base cabinets along X. units: [{ w, type: 'door' | 'drawers' | 'gap' }]. top: worktop with optional cut-out { x, w, z0, z1 }
F.baseUnits = (K, { len, col = 0xe6e2d6, plinth = 0x2a2a2c, units, topCol = 0x56565a, topMat = M.lino, hole = null, top = true, metal = M.chrome, d = 0.58, h = 0.87 } = {}) => {
  if (!units) { const n = Math.max(1, Math.round(len / 0.5)); units = Array.from({ length: n }, () => ({ w: len / n, type: 'door' })); }
  let x = -len / 2;
  for (const u of units) {
    const cx = x + u.w / 2;
    if (u.type !== 'gap') {
      K.box(M.satin, u.w, 0.12, d - 0.07, cx, 0, (d - 0.07) / 2, { r: 0, col: plinth });
      K.box(M.satin, u.w, h - 0.12, d - 0.02, cx, 0.12, (d - 0.02) / 2, { r: 0.002, col: shade(col, 0.82) });
      if (u.type === 'drawers') { let y = h - 0.004; for (const dh of [0.14, 0.29, 0.31]) { y -= dh; K.box(M.satin, u.w - 0.005, dh - 0.005, 0.019, cx, y, d - 0.001, { r: 0.003, col }); K.cyl(metal, 0.006, 0.006, Math.min(0.18, u.w * 0.5), cx, y + dh - 0.05, d + 0.032, { rz: H, c: true, seg: 8 }); for (const s of [-1, 1]) K.cyl(metal, 0.004, 0.004, 0.025, cx + s * Math.min(0.07, u.w * 0.2), y + dh - 0.05, d + 0.02, { rx: H, c: true, seg: 6 }); } }
      else { const nd = u.w > 0.65 ? 2 : 1, dw = u.w / nd; for (let j = 0; j < nd; j++) { const dx = x + (j + 0.5) * dw; K.box(M.satin, dw - 0.005, h - 0.13, 0.019, dx, 0.125, d - 0.001, { r: 0.003, col }); const hx = dx + (nd === 1 ? (u.hinge ?? 1) : (j ? -1 : 1)) * (dw / 2 - 0.04); K.cyl(metal, 0.006, 0.006, 0.14, hx, h - 0.2, d + 0.032, { seg: 8, c: true }); for (const s of [-1, 1]) K.cyl(metal, 0.004, 0.004, 0.025, hx, h - 0.2 + s * 0.055, d + 0.02, { rx: H, c: true, seg: 6 }); } }
    }
    x += u.w;
  }
  if (top) F.worktop(K, { len, col: topCol, mat: topMat, hole, y: h });
};
F.worktop = (K, { len, col = 0x56565a, mat = M.lino, hole = null, y = 0.87, d = 0.62, t = 0.038, x = 0 } = {}) => {
  const o = { r: 0.006, col, uvo: [0, 0, 0] };
  if (!hole) return K.box(mat, len, t, d, x, y, d / 2, o);
  const x0 = hole.x - hole.w / 2, x1 = hole.x + hole.w / 2, a = -len / 2, b = len / 2;
  K.box(mat, x0 - a, t, d, x + (a + x0) / 2, y, d / 2, o); K.box(mat, b - x1, t, d, x + (x1 + b) / 2, y, d / 2, o);
  K.box(mat, hole.w, t, hole.z0, x + hole.x, y, hole.z0 / 2, o); K.box(mat, hole.w, t, d - hole.z1, x + hole.x, y, (hole.z1 + d) / 2, o);
};
// stainless sink set into a worktop cut-out, with drainer (side -1 | 1) and mixer tap
F.sink = (K, { x = 0, w = 0.5, z0 = 0.1, z1 = 0.5, y = 0.908, drain = 1 } = {}) => {
  const dp = 0.17, zc = (z0 + z1) / 2, dz = z1 - z0;
  K.box(M.steel, w, 0.004, dz, x, y - dp, zc, { r: 0 });
  for (const s of [-1, 1]) { K.box(M.steel, 0.004, dp, dz, x + s * (w / 2 - 0.002), y - dp, zc, { r: 0 }); K.box(M.steel, w, dp, 0.004, x, y - dp, zc + s * (dz / 2 - 0.002), { r: 0 }); K.box(M.steel, 0.022, 0.004, dz + 0.04, x + s * (w / 2 + 0.009), y, zc, { r: 0.001 }); K.box(M.steel, w + 0.04, 0.004, 0.022, x, y, zc + s * (dz / 2 + 0.009), { r: 0.001 }); }
  K.cyl(M.chrome, 0.022, 0.022, 0.003, x, y - dp + 0.004, zc, { seg: 14 });
  if (drain) { const dx = x + drain * (w / 2 + 0.25); K.box(M.steel, 0.44, 0.004, dz + 0.04, dx, y, zc, { r: 0.001 }); for (let i = 0; i < 9; i++) K.box(M.steel, 0.36, 0.004, 0.012, dx, y + 0.003, z0 + 0.03 + i * (dz - 0.06) / 8, { r: 0.002 }); }
  K.cyl(M.chrome, 0.024, 0.026, 0.045, x, y, z0 - 0.045, { seg: 14 });
  K.tube(M.chrome, [[x, y + 0.04, z0 - 0.045], [x, y + 0.27, z0 - 0.045], [x, y + 0.34, z0 + 0.0], [x, y + 0.33, z0 + 0.1], [x, y + 0.27, z0 + 0.13]], 0.011, { tension: 0.5, seg: 24, rs: 8 });
  K.box(M.chrome, 0.014, 0.014, 0.09, x + 0.03, y + 0.05, z0 - 0.02, { r: 0.005, rx: -0.4, ry: -0.5 });
};
F.wallUnits = (K, { len, col = 0xe6e2d6, y = 1.42, h = 0.72, d = 0.32, glow = 0, metal = M.chrome } = {}) => {
  const n = Math.max(1, Math.round(len / 0.5)), uw = len / n;
  K.box(M.satin, len, h, d - 0.02, 0, y, (d - 0.02) / 2, { r: 0.002, col: shade(col, 0.82) });
  for (let i = 0; i < n; i++) { const cx = -len / 2 + (i + 0.5) * uw; K.box(M.satin, uw - 0.005, h - 0.005, 0.019, cx, y + 0.0025, d - 0.001, { r: 0.003, col }); K.cyl(metal, 0.006, 0.006, 0.12, cx + (i & 1 ? -1 : 1) * (uw / 2 - 0.04), y + 0.11, d + 0.032, { seg: 8, c: true }); }
  if (glow) K.box(K.emit(0xfff0d8, glow, { key: 'undercab' }), len - 0.1, 0.008, 0.03, 0, y - 0.009, d - 0.1, { r: 0 });
};
F.cooker = (K, { col = 0xf0f0ee, clock = true } = {}) => {
  const w = 0.6, d = 0.6, h = 0.9;
  K.box(M.gloss, w, h - 0.04, d - 0.03, 0, 0.03, (d - 0.03) / 2, { r: 0.006, col }); K.box(M.matte, w - 0.06, 0.03, d - 0.1, 0, 0, d / 2, { r: 0, col: 0x1a1a1a });
  K.box(M.gloss, w - 0.016, 0.5, 0.024, 0, 0.15, d - 0.006, { r: 0.006, col }); K.box(M.darkGlass, w - 0.16, 0.28, 0.004, 0, 0.27, d + 0.007, { r: 0.002 });
  K.cyl(M.chrome, 0.009, 0.009, w - 0.1, 0, 0.6, d + 0.05, { rz: H, c: true, seg: 8 }); for (const s of [-1, 1]) K.cyl(M.chrome, 0.006, 0.006, 0.045, s * (w / 2 - 0.09), 0.6, d + 0.03, { rx: H, c: true, seg: 6 });
  K.box(M.gloss, w - 0.016, 0.1, 0.024, 0, 0.04, d - 0.006, { r: 0.006, col });
  K.box(M.gloss, w - 0.006, 0.11, 0.03, 0, 0.67, d - 0.008, { r: 0.005, col: shade(col, 0.9) });
  for (let i = 0; i < 5; i++) { if (i === 2 && clock) { K.box(M.darkGlass, 0.09, 0.045, 0.004, 0, 0.705, d + 0.008, { r: 0.001 }); K.plane(K.screen(1.6, 'clk'), 0.07, 0.03, 0, 0.7275, d + 0.0105, { uv: ATLAS.screens.rect.ovenClock }); continue; } K.cyl(M.plastic, 0.018, 0.021, 0.026, -0.22 + i * 0.11, 0.725, d + 0.018, { rx: H, c: true, col: 0x1c1c1e, seg: 14 }); }
  K.box(M.gloss, w, 0.014, d, 0, h - 0.014, d / 2, { r: 0.004, col: 0x0b0b0d });
  for (const [bx, bz, br] of [[-0.14, 0.17, 0.07], [0.14, 0.17, 0.055], [-0.14, 0.43, 0.055], [0.14, 0.43, 0.075]]) { K.cyl(M.metal, br, br, 0.008, bx, h, bz, { col: 0x1e1e20, seg: 18 }); K.cyl(M.metal, br * 0.45, br * 0.45, 0.014, bx, h, bz, { col: 0x3a3a3c, seg: 12 }); for (let k = 0; k < 4; k++) K.box(M.metal, br * 1.5, 0.012, 0.008, bx + Math.cos(k * H) * br * 0.75, h + 0.004, bz + Math.sin(k * H) * br * 0.75, { r: 0.002, ry: -k * H, col: 0x161618 }); }
  K.box(M.gloss, w, 0.07, 0.03, 0, h - 0.004, 0.015, { r: 0.004, col });
  return h + 0.016;
};
F.hood = (K, { on = false, y = 1.5 } = {}) => {
  K.box(M.steel, 0.6, 0.07, 0.48, 0, y, 0.24, { r: 0.004 }); K.box(M.steel, 0.26, 0.9 - 0.07, 0.24, 0, y + 0.07, 0.12, { r: 0.004 });
  for (const s of [-1, 1]) K.cyl(on ? K.emit(0xfff0d0, 6, { key: 'hood' }) : M.ceramic, 0.028, 0.028, 0.004, s * 0.16, y - 0.004, 0.3, { seg: 12, col: 0xf0f0e8 });
  K.box(M.matte, 0.5, 0.002, 0.3, 0, y - 0.002, 0.2, { r: 0, col: 0x333336 });
};
F.fridge = (K, { col = 0xe9e9e6, steel = false, magnets = true, h = 1.8 } = {}) => {
  const w = 0.6, d = 0.66, mat = steel ? M.steel : M.gloss, r = K.rng, fz = d + 0.0015;
  K.box(mat, w, h - 0.02, d - 0.07, 0, 0.02, (d - 0.07) / 2, { r: 0.012, col }); K.box(M.matte, w - 0.05, 0.02, d - 0.15, 0, 0, d / 2 - 0.03, { r: 0, col: 0x1a1a1a });
  K.box(mat, w - 0.004, 0.62, 0.06, 0, 0.03, d - 0.03, { r: 0.014, col }); K.box(mat, w - 0.004, h - 0.67, 0.06, 0, 0.66, d - 0.03, { r: 0.014, col });
  for (const [y0, hh] of [[0.36, 0.26], [0.72, 0.5]]) { K.cyl(M.chrome, 0.01, 0.01, hh, -w / 2 + 0.05, y0, d + 0.04, { seg: 8 }); for (const yy of [y0 + 0.03, y0 + hh - 0.03]) K.cyl(M.chrome, 0.006, 0.006, 0.04, -w / 2 + 0.05, yy, d + 0.02, { rx: H, c: true, seg: 6 }); }
  if (magnets) {
    K.plane(M.pics, 0.2, 0.2, 0.08, 1.42, fz, { uv: ATLAS.pics.rect.kid1, rz: 0.06 }); K.plane(M.pics, 0.17, 0.17, -0.04, 1.15, fz, { uv: ATLAS.pics.rect.kid2, rz: -0.09 });
    K.plane(M.signs, 0.11, 0.17, 0.17, 1.12, fz, { uv: ATLAS.signs.rect.takeaway, rz: 0.04 }); K.plane(M.signs, 0.1, 0.13, -0.06, 0.88, fz, { uv: ATLAS.signs.rect.paper, rz: -0.03 }); K.plane(M.pics, 0.15, 0.15, 0.14, 0.86, fz + 0.0005, { uv: ATLAS.pics.rect.portrait3, rz: 0.1 });
    for (let i = 0; i < 12; i++) { const mc = r.pick([0xc0392b, 0x2c5aa0, 0xe0b020, 0x3a8a4a, 0xe86a92, 0xf0f0f0, 0x222222]); const mx = (r() - 0.3) * 0.36, my = 0.8 + r() * 0.85; if (r.chance(0.5)) K.cyl(M.plastic, 0.013, 0.013, 0.006, mx, my, fz + 0.003, { rx: H, c: true, col: mc, seg: 10 }); else K.box(M.plastic, 0.03, 0.02, 0.005, mx, my, fz + 0.003, { r: 0.002, c: true, col: mc, rz: r() * 0.4 }); }
  }
};
F.kettle = (K, x, y, z, { col = 0xc8ccd0, ry = 0 } = {}) => { K.push(x, y, z, ry); K.lathe(M.steel, [[0.001, 0], [0.075, 0], [0.08, 0.01], [0.07, 0.15], [0.055, 0.19], [0.001, 0.2]], 0, 0, 0, { seg: 18, col }); K.cyl(M.plastic, 0.085, 0.085, 0.018, 0, -0.0, 0, { col: 0x1a1a1c, seg: 18 }); K.torus(M.plastic, 0.06, 0.009, -0.085, 0.12, 0, { arc: PI, rz: H, col: 0x1a1a1c, seg: 12, rs: 6 }); K.box(M.steel, 0.045, 0.03, 0.03, 0.075, 0.15, 0, { r: 0.01, rz: 0.5, col }); K.sph(M.plastic, 0.014, 0, 0.205, 0, { col: 0x1a1a1c, seg: 8, seg2: 6 }); K.pop(); };
F.toaster = (K, x, y, z, { ry = 0, col = 0xd8d8d4 } = {}) => { K.push(x, y, z, ry); K.rbox(M.steel, 0.27, 0.18, 0.16, 0, 0.008, 0, { r: 0.035, col, seg: 3 }); for (const s of [-1, 1]) K.box(M.matte, 0.2, 0.004, 0.028, 0, 0.186, s * 0.035, { r: 0, col: 0x0a0a0a }); K.box(M.plastic, 0.012, 0.03, 0.03, 0.14, 0.1, 0, { r: 0.004, col: 0x1a1a1a }); K.box(M.plastic, 0.24, 0.008, 0.14, 0, 0, 0, { r: 0.002, col: 0x1a1a1a }); K.pop(); };
F.microwave = (K, x, y, z, { ry = 0, on = true } = {}) => { K.push(x, y, z, ry); K.box(M.satin, 0.46, 0.27, 0.34, 0, 0.01, 0, { r: 0.008, col: 0xdcdcd8 }); K.box(M.darkGlass, 0.3, 0.2, 0.004, -0.06, 0.045, 0.172, { r: 0.002 }); K.box(M.plastic, 0.1, 0.23, 0.006, 0.17, 0.03, 0.172, { r: 0.002, col: 0x1a1a1c }); if (on) K.plane(K.screen(1.8, 'clk'), 0.075, 0.03, 0.17, 0.225, 0.176, { uv: ATLAS.screens.rect.clockGreen }); for (let i = 0; i < 6; i++) K.box(M.plastic, 0.022, 0.014, 0.004, 0.145 + (i % 3) * 0.026, 0.15 - Math.floor(i / 3) * 0.03, 0.176, { r: 0.002, col: 0x444448 }); K.box(M.plastic, 0.012, 0.2, 0.02, 0.09, 0.045, 0.18, { r: 0.004, col: 0x2a2a2c }); K.pop(); };
F.pan = (K, x, y, z, { r = 0.09, h = 0.08, ry = 0, lid = false } = {}) => { K.push(x, y, z, ry); K.lathe(M.steel, [[0.001, 0], [r, 0], [r + 0.004, 0.004], [r + 0.004, h], [r, h], [r - 0.003, 0.008], [0.001, 0.006]], 0, 0, 0, { seg: 20 }); K.box(M.plastic, 0.17, 0.016, 0.026, r + 0.085, h - 0.025, 0, { r: 0.007, col: 0x161618 }); if (lid) { K.lathe(M.steel, [[r + 0.006, 0], [r * 0.6, 0.018], [0.02, 0.024]], 0, h, 0, { seg: 20 }); K.sph(M.plastic, 0.016, 0, h + 0.035, 0, { col: 0x161618, seg: 8, seg2: 6 }); } else K.cyl(M.gloss, r - 0.004, r - 0.004, 0.002, 0, h * 0.6, 0, { col: 0xb8642a, seg: 16 }); K.pop(); };
F.bin = (K, { h = 0.6, r = 0.15, col, steel = true } = {}) => { K.lathe(steel ? M.steel : M.plastic, [[0.001, 0], [r * 0.92, 0], [r, 0.02], [r, h], [r * 0.9, h + 0.03], [0.001, h + 0.05]], 0, 0, 0, { seg: 20, col }); K.cyl(M.plastic, r + 0.004, r + 0.004, 0.03, 0, 0, 0, { col: 0x1a1a1a, seg: 20 }); K.box(M.plastic, 0.09, 0.012, 0.05, 0, 0.01, r + 0.02, { r: 0.004, col: 0x1a1a1a }); };

// ---- bathroom
F.toilet = (K, { col = 0xf4f4f0, lidUp = true } = {}) => {
  K.box(M.ceramic, 0.2, 0.34, 0.16, 0, 0, 0.1, { r: 0.03, col });
  K.lathe(M.ceramic, [[0.001, 0], [0.12, 0], [0.125, 0.03], [0.1, 0.1], [0.12, 0.24], [0.175, 0.36], [0.185, 0.4], [0.17, 0.405], [0.14, 0.37], [0.07, 0.24], [0.04, 0.2], [0.001, 0.19]], 0, 0, 0.42, { seg: 22, col, sz: 1.3 });
  K.cyl(M.gloss, 0.06, 0.06, 0.002, 0, 0.215, 0.44, { col: 0x9ab0b8, seg: 14 });
  K.torus(M.plastic, 0.158, 0.024, 0, 0.415, 0.42, { rx: H, sy: 1.3, sz: 0.45, col: 0xf8f8f4, seg: 28, rs: 8 });
  if (lidUp) K.cyl(M.plastic, 0.185, 0.185, 0.018, 0, 0.64, 0.205, { rx: H - 0.14, c: true, sy: 1, sx: 1, sz: 1.28, col: 0xf8f8f4, seg: 28 });
  else K.cyl(M.plastic, 0.185, 0.185, 0.018, 0, 0.43, 0.42, { sz: 1.3, col: 0xf8f8f4, seg: 28 });
  K.rbox(M.ceramic, 0.42, 0.36, 0.17, 0, 0.42, 0.09, { r: 0.03, col, seg: 3 }); K.rbox(M.ceramic, 0.44, 0.035, 0.19, 0, 0.775, 0.09, { r: 0.015, col, seg: 2 });
  K.cyl(M.chrome, 0.02, 0.02, 0.006, 0, 0.81, 0.09, { seg: 12 });
};
F.basin = (K, { col = 0xf4f4f0, h = 0.85, pedestal = true } = {}) => {
  K.lathe(M.ceramic, [[0.001, h - 0.15], [0.07, h - 0.15], [0.19, h - 0.07], [0.24, 0 + h - 0.012], [0.245, h], [0.225, h], [0.2, h - 0.03], [0.07, h - 0.11], [0.001, h - 0.115]], 0, 0, 0.22, { seg: 26, col, sx: 1.25, sz: 0.92 });
  K.box(M.ceramic, 0.6, 0.06, 0.1, 0, h - 0.06, 0.05, { r: 0.02, col });
  if (pedestal) K.lathe(M.ceramic, [[0.001, 0], [0.1, 0], [0.085, 0.05], [0.07, 0.35], [0.085, h - 0.15]], 0, 0, 0.16, { seg: 18, col });
  K.cyl(M.chrome, 0.016, 0.016, 0.003, 0, h - 0.113, 0.22, { seg: 10 });
  K.cyl(M.chrome, 0.02, 0.024, 0.05, 0, h, 0.05, { seg: 12 }); K.tube(M.chrome, [[0, h + 0.04, 0.05], [0, h + 0.1, 0.06], [0, h + 0.11, 0.13], [0, h + 0.085, 0.16]], 0.01, { tension: 0.5, seg: 14, rs: 7 }); K.box(M.chrome, 0.012, 0.012, 0.07, 0, h + 0.07, 0.03, { r: 0.004, rx: -0.5 });
  return h;
};
// bath along X (length l), back at z=0. Returns rim height.
F.bath = (K, { l = 1.7, w = 0.7, h = 0.55, col = 0xf4f4f0, taps = -1 } = {}) => {
  K.box(M.ceramic, l, h - 0.05, 0.018, 0, 0, w - 0.03, { r: 0.004, col });
  for (const s of [-1, 1]) K.box(M.ceramic, 0.018, h - 0.05, w - 0.03, s * (l / 2 - 0.009), 0, w / 2 - 0.015, { r: 0.004, col });
  for (const z of [0.04, w - 0.04]) K.rbox(M.ceramic, l, 0.05, 0.08, 0, h - 0.05, z, { r: 0.02, col, seg: 2 });
  for (const s of [-1, 1]) K.rbox(M.ceramic, 0.09, 0.05, w - 0.1, s * (l / 2 - 0.045), h - 0.05, w / 2, { r: 0.02, col, seg: 2 });
  const il = l - 0.17, iw = w - 0.15, dp = h - 0.13;
  K.box(M.ceramic, il - 0.1, 0.01, iw - 0.1, 0, h - 0.04 - dp, w / 2, { r: 0, col });
  for (const s of [-1, 1]) { K.box(M.ceramic, il, dp + 0.02, 0.01, 0, h - 0.045 - dp, w / 2 + s * (iw / 2 - 0.025), { r: 0, rx: s * 0.12, col }); K.box(M.ceramic, 0.01, dp + 0.02, iw, s * (il / 2 - 0.03), h - 0.045 - dp, w / 2, { r: 0, rz: -s * (s === taps ? 0.1 : 0.32), col }); }
  const tx = taps * (l / 2 - 0.045);
  for (const s of [-1, 1]) { K.cyl(M.chrome, 0.018, 0.02, 0.07, tx, h, w / 2 + s * 0.09, { seg: 10 }); K.box(M.chrome, 0.08, 0.016, 0.02, tx - taps * 0.04, h + 0.065, w / 2 + s * 0.09, { r: 0.006 }); K.cyl(M.chrome, 0.022, 0.022, 0.015, tx, h + 0.075, w / 2 + s * 0.09, { seg: 6 }); }
  K.cyl(M.chrome, 0.02, 0.02, 0.003, tx - taps * 0.3, h - 0.03 - dp, w / 2, { seg: 10 });
  return h;
};
// heated ladder rail on a wall (call inside onWall), with optional towels
F.towelRail = (K, { w = 0.5, h = 0.9, y = 0.7, towels = [0x6a8a9a, 0xe8e2d4] } = {}) => {
  for (const s of [-1, 1]) K.cyl(M.chrome, 0.012, 0.012, h, s * w / 2, y, 0.07, { seg: 8 });
  const n = 7; for (let i = 0; i < n; i++) K.cyl(M.chrome, 0.009, 0.009, w, 0, y + 0.05 + i * (h - 0.1) / (n - 1), 0.07, { rz: H, c: true, seg: 8 });
  for (const s of [-1, 1]) for (const yy of [y + 0.08, y + h - 0.08]) K.cyl(M.chrome, 0.007, 0.007, 0.07, s * w / 2, yy, 0.035, { rx: H, c: true, seg: 6 });
  towels.forEach((tc, i) => { const ty = y + h - 0.05 - i * (h - 0.1) / (n - 1) * 3; K.drape(M.curtain, [[ty - 0.42 + i * 0.1, 0.055], [ty - 0.1, 0.052], [ty + 0.012, 0.07], [ty - 0.1, 0.09], [ty - 0.3 - i * 0.06, 0.094]], w - 0.08, 0, 0, 0, { col: tc, wrinkle: 0.008, seg: 14, segW: 4 }); });
};
F.loorollHolder = (K, y = 0.7) => { K.cyl(M.chrome, 0.007, 0.007, 0.14, 0, y, 0.05, { rz: H, c: true, seg: 6 }); K.cyl(M.chrome, 0.007, 0.007, 0.05, -0.07, y, 0.025, { rx: H, c: true, seg: 6 }); K.cyl(M.matte, 0.055, 0.055, 0.1, 0.01, y, 0.05, { rz: H, c: true, col: 0xf6f4ee, seg: 18 }); K.plane(M.matte, 0.1, 0.07, 0.01, y - 0.045, 0.105, { col: 0xf6f4ee, ry: 0 }); };

// ---- bedroom
// bed with headboard at z=0. o: { w, l, col (duvet), sheet, head, mess: duvet dragged toward +X, spread: material for the cover }
F.bed = (K, { w = 1.5, l = 2.0, col = 0x7f8fa6, sheet = 0xeeeae2, head = 0x5a4a3c, headMat = M.fabric, mess = 0, spread = M.fabric, pillows = 2, base = 0x4a4038, throwCol = null, hh = 1.1, spreadCol } = {}) => {
  const r = K.rng, top = 0.56;
  K.rbox(headMat, w + 0.08, hh - 0.2, 0.07, 0, 0.2, 0.035, { r: 0.03, col: head, seg: 2 });
  K.box(M.fabric, w, 0.26, l - 0.1, 0, 0.07, 0.07 + (l - 0.1) / 2, { r: 0.015, col: base });
  for (const sx of [-1, 1]) for (const z of [0.15, l - 0.1]) K.cyl(M.wood, 0.025, 0.02, 0.07, sx * (w / 2 - 0.08), 0, z, { col: C.darkWood, seg: 8 });
  K.rbox(M.fabric, w - 0.02, 0.23, l - 0.12, 0, 0.33, 0.07 + (l - 0.12) / 2, { r: 0.07, col: sheet, seg: 4 });
  const pw = pillows === 1 ? 0.7 : Math.min(0.7, w / 2 - 0.05);
  for (let i = 0; i < pillows; i++) { const px = pillows === 1 ? 0 : (i ? 1 : -1) * (w / 4); K.rbox(M.fabric, pw, 0.15, 0.42, px, top - 0.01, 0.34, { r: 0.065, puff: 0.04, seg: 5, col: shade(sheet, 0.98 + r() * 0.04), ry: (r() - 0.5) * 0.25, rx: -0.12 }); }
  const dl = l * 0.66, dz = l - dl / 2 + 0.03 - mess * 0.1;
  K.rbox(spread, w + 0.16, 0.07, dl, mess * 0.22, top - 0.005, dz, { r: 0.034, col: spreadCol ?? col, wrinkle: 0.035 + mess * 0.02, wfreq: 3.2, seg: 12, ry: mess * 0.12 });
  // turned-back top edge
  K.rbox(spread, w + 0.1, 0.05, 0.3, mess * 0.3, top + 0.04, dz - dl / 2 + 0.1, { r: 0.024, col: spreadCol ? 0xe8e4dc : shade(col, 1.12), wrinkle: 0.02, seg: 6, ry: mess * 0.22, rx: 0.06 });
  // sides hanging down
  for (const s of [-1, 1]) K.at(s * (w / 2 + 0.06) + mess * 0.22, 0, dz, s * H, () => K.drape(M.curtain, [[top + 0.02, -0.12], [top + 0.03, -0.01], [top - 0.08, 0.035], [0.28 - (s > 0 ? mess * 0.26 : 0), 0.05 + (s > 0 ? mess * 0.12 : 0)]], dl - 0.06, 0, 0, 0, { col: shade(col, 0.96), wrinkle: 0.02, seg: 12, segW: 10 }));
  K.at(mess * 0.22, 0, l + 0.085, 0, () => K.drape(M.curtain, [[top + 0.02, -0.14], [top + 0.03, -0.01], [top - 0.08, 0.03], [0.3, 0.045]], w + 0.1, 0, 0, 0, { col: shade(col, 0.96), wrinkle: 0.02, seg: 12, segW: 10 }));
  if (throwCol != null) K.at(0, 0, l - 0.36, H, () => K.drape(M.curtain, [[0.42, -w / 2 - 0.13], [top + 0.0, -w / 2 - 0.1], [top + 0.075, -w / 2 - 0.02], [top + 0.085, 0], [top + 0.075, w / 2 + 0.02 + mess * 0.2], [top - 0.02, w / 2 + 0.1 + mess * 0.24], [0.38, w / 2 + 0.14 + mess * 0.26]], 0.5, 0, 0, 0, { col: throwCol, wrinkle: 0.025, seg: 30, segW: 6 }));
  return top + 0.03;
};
F.bedside = (K, { col = C.oak, w = 0.45, h = 0.52, d = 0.4 } = {}) => {
  K.box(M.wood, w, h - 0.06, d, 0, 0.06, d / 2, { r: 0.005, col }); K.box(M.wood, w + 0.02, 0.02, d + 0.015, 0, h - 0.02, d / 2, { r: 0.005, col });
  for (const sx of [-1, 1]) for (const z of [0.04, d - 0.04]) K.box(M.wood, 0.035, 0.06, 0.035, sx * (w / 2 - 0.035), 0, z, { r: 0.004, col });
  for (const [y, dh] of [[0.09, 0.2], [0.3, 0.17]]) { K.box(M.wood, w - 0.03, dh - 0.008, 0.016, 0, y, d + 0.006, { r: 0.004, col }); K.sph(M.brass, 0.013, 0, y + dh / 2, d + 0.024, { seg: 8, seg2: 6 }); }
  return h;
};
// wardrobe: `open` = index of a door standing ajar (shows hanging clothes), doors per bay width ~0.5
F.wardrobe = (K, { w = 1.5, h = 2.0, d = 0.58, col = C.oak, open = -1, knob = M.brass, ang: openAng = 1.25 } = {}) => {
  const n = Math.round(w / 0.5), dw = w / n, r = K.rng, t = 0.02;
  K.box(M.wood, w + 0.04, 0.05, d + 0.03, 0, h - 0.05, d / 2, { r: 0.008, col }); K.box(M.wood, w, 0.08, d - 0.03, 0, 0, d / 2, { r: 0.003, col: shade(col, 0.7) });
  K.box(M.wood, w, h - 0.13, 0.008, 0, 0.08, 0.004, { r: 0, col: shade(col, 0.55) });
  for (const s of [-1, 1]) K.box(M.wood, t, h - 0.13, d, s * (w / 2 - t / 2), 0.08, d / 2, { r: 0.003, col });
  K.box(M.wood, w, t, d, 0, 0.08, d / 2, { r: 0.002, col }); K.box(M.wood, w, t, d, 0, h - 0.07, d / 2, { r: 0.002, col });
  for (let i = 1; i < n; i++) K.box(M.wood, t, h - 0.17, d - 0.02, -w / 2 + i * dw, 0.1, d / 2 - 0.01, { r: 0, col: shade(col, 0.7) });
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (i + 0.5) * dw, hg = i & 1 ? 1 : -1, ang = i === open ? openAng : 0;
    K.push(cx + hg * (dw / 2 - 0.004), 0, d + 0.002, hg * ang);
    K.box(M.wood, dw - 0.006, h - 0.16, 0.02, -hg * (dw / 2 - 0.003), 0.1, 0.01, { r: 0.004, col });
    for (const [py, ph] of [[0.2, 0.62], [0.92, h - 1.18]]) K.box(M.wood, dw - 0.14, ph, 0.006, -hg * (dw / 2 - 0.003), py, 0.022, { r: 0.006, col: shade(col, 1.05) });
    K.sph(knob, 0.015, -hg * (dw - 0.05), 1.0, 0.04, { seg: 8, seg2: 6 });
    K.pop();
    if (i === open) { K.cyl(M.chrome, 0.01, 0.01, dw - 0.04, cx, h - 0.24, d / 2, { rz: H, c: true, seg: 8 }); let x = cx - dw / 2 + 0.05; while (x < cx + dw / 2 - 0.05) { const gw = 0.02 + r() * 0.03, gl = 0.7 + r() * 0.5; K.rbox(M.fabric, gw, gl, 0.42, x, h - 0.27 - gl, d / 2, { r: 0.008, col: r.pick([0x2a3a5a, 0x8a2a3a, 0xd8d4c8, 0x3a3a3e, 0x6a7a5a, 0xb08a5a, 0x4a6a8a]), seg: 1, rz: (r() - 0.5) * 0.04 }); x += gw + 0.012; } for (let k = 0; k < 2; k++) K.rbox(M.leather, 0.1, 0.07, 0.27, cx - 0.08 + k * 0.14, 0.1, d / 2 + 0.05, { r: 0.03, col: 0x2a1c14, seg: 2, ry: k * 0.2 }); }
  }
};
F.pillBottle = (K, x, y, z, { tipped = false, s = 1 } = {}) => { if (tipped) K.at(x, y + 0.022 * s, z, K.rng() * TAU, () => P.bottle(K, 0, 0, 0, { kind: 'pill', col: 0xd8741a, s, label: 'paper', mat: M.plastic }), 0, H); else P.bottle(K, x, y, z, { kind: 'pill', col: 0xd8741a, s, label: 'paper', mat: M.plastic }); };

// ---- care equipment
F.recliner = (K, { col = 0x6e4f3a, mat = M.leather, footrest = 0 } = {}) => {
  const w = 0.86, d = 0.88;
  K.rbox(mat, w, 0.3, d - 0.06, 0, 0.06, d / 2, { r: 0.05, col, seg: 3 });
  for (const sx of [-1, 1]) for (const z of [0.1, d - 0.1]) K.cyl(M.plastic, 0.03, 0.03, 0.06, sx * (w / 2 - 0.1), 0, z, { col: 0x1a1a1a, seg: 8 });
  for (const s of [-1, 1]) K.rbox(mat, 0.2, 0.34, d - 0.04, s * (w / 2 - 0.1), 0.32, d / 2, { r: 0.09, col, seg: 4, puff: 0.01 });
  K.rbox(mat, w - 0.42, 0.18, 0.6, 0, 0.3, 0.55, { r: 0.06, puff: 0.025, col: shade(col, 1.04), seg: 4 });
  K.rbox(mat, w - 0.36, 0.5, 0.2, 0, 0.44, 0.2, { r: 0.08, puff: 0.03, col: shade(col, 1.03), rx: -0.26, seg: 4 }); K.rbox(mat, w - 0.4, 0.28, 0.2, 0, 0.9, 0.075, { r: 0.09, puff: 0.04, col: shade(col, 1.05), rx: -0.3, seg: 4 });
  K.rbox(mat, w - 0.44, 0.36, 0.1, 0, 0.1 + footrest * 0.22, d + 0.0 + footrest * 0.32, { r: 0.045, col, rx: -footrest * 1.3, seg: 3 });
  K.box(M.plastic, 0.03, 0.12, 0.04, w / 2 + 0.01, 0.34, d * 0.45, { r: 0.01, col: 0x2a2a2a, rx: 0.5 });
  return { seat: [0, 0.48, 0.56] };
};
F.walker = (K, { col = 0xb8bcc0 } = {}) => {
  const w = 0.56, d = 0.46, h = 0.86;
  for (const s of [-1, 1]) { K.tube(M.metal, [[s * w / 2, 0.03, d / 2], [s * w / 2, h - 0.06, d / 2 - 0.04], [s * w / 2, h, d / 2 - 0.12], [s * w / 2, h, -d / 2 + 0.06], [s * w / 2, h - 0.08, -d / 2], [s * w / 2, 0.03, -d / 2 - 0.02]], 0.0125, { tension: 0.25, seg: 40, col });
    K.tube(M.metal, [[s * w / 2, 0.36, d / 2 - 0.015], [s * w / 2, 0.36, -d / 2 - 0.008]], 0.01, { col, seg: 4 });
    K.cyl(M.rubberBlack, 0.017, 0.017, 0.14, s * w / 2, h, -0.02, { rx: H, c: true, col: 0x4a4a4c, seg: 10 });
    K.cyl(M.rubberBlack, 0.02, 0.022, 0.04, s * w / 2, 0, -d / 2 - 0.02, { col: 0x6a6a6c, seg: 10 });
    K.cyl(M.rubberBlack, 0.06, 0.06, 0.025, s * w / 2, 0.06, d / 2, { rz: H, c: true, col: 0x2a2a2c, seg: 16 }); }
  K.tube(M.metal, [[-w / 2, h - 0.2, d / 2 - 0.03], [0, h - 0.2, d / 2 + 0.02], [w / 2, h - 0.2, d / 2 - 0.03]], 0.0125, { tension: 0.5, col, seg: 12 });
  K.tube(M.metal, [[-w / 2, 0.42, d / 2 - 0.02], [0, 0.42, d / 2 + 0.03], [w / 2, 0.42, d / 2 - 0.02]], 0.01, { tension: 0.5, col, seg: 12 });
};
// home oxygen concentrator; returns the outlet's world position
F.o2 = (K, { on = true } = {}) => {
  const w = 0.36, h = 0.6, d = 0.3;
  K.rbox(M.plastic, w, h, d, 0, 0.05, 0, { r: 0.035, col: 0xdfe3e6, seg: 3 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(M.rubberBlack, 0.025, 0.025, 0.03, sx * (w / 2 - 0.05), 0.012, sz * (d / 2 - 0.05), { rz: H, c: true, seg: 10, col: 0x222222 });
  K.box(M.plastic, w - 0.06, 0.2, 0.01, 0, 0.4, d / 2 + 0.001, { r: 0.006, col: 0x3d6a8a });
  K.cyl(M.glassTint, 0.012, 0.012, 0.13, -0.08, 0.43, d / 2 + 0.014, { seg: 8, col: 0xdff0f0 }); K.sph(M.chrome, 0.007, -0.08, 0.48, d / 2 + 0.014, { seg: 8, seg2: 6 });
  K.cyl(M.plastic, 0.022, 0.025, 0.02, 0.0, 0.45, d / 2 + 0.014, { rx: H, c: true, col: 0x1c1c1e, seg: 14 });
  K.plane(on ? K.screen(1.5, 'lcd') : M.darkGlass, 0.075, 0.036, 0.09, 0.53, d / 2 + 0.0075, { uv: ATLAS.screens.rect.lcdO2 });
  K.box(K.emit(on ? 0x30ff60 : 0x101010, on ? 5 : 0, { key: 'o2led' }), 0.008, 0.008, 0.002, 0.09, 0.47, d / 2 + 0.0075, { r: 0 });
  for (let i = 0; i < 7; i++) K.box(M.matte, w - 0.1, 0.008, 0.004, 0, 0.1 + i * 0.03, d / 2, { r: 0, col: 0x55595c });
  K.box(M.plastic, 0.2, 0.03, 0.05, 0, h + 0.035, 0, { r: 0.012, col: 0xc8ccd0 });
  K.cyl(M.chrome, 0.006, 0.006, 0.03, 0.09, 0.41, d / 2 + 0.015, { rx: H, c: true, seg: 6 });
  return K.world(0.09, 0.41, d / 2 + 0.03);
};
// weekly pill organiser
F.pillBox = (K, x, y, z, { ry = 0 } = {}) => { K.push(x, y, z, ry); K.box(M.plastic, 0.22, 0.022, 0.07, 0, 0, 0, { r: 0.004, col: 0xe8ecf0 }); const cols = [0xc0392b, 0xe67e22, 0xe0b020, 0x3a8a4a, 0x2c7ab0, 0x5a4ab0, 0x9a4a9a]; for (let i = 0; i < 7; i++) { const op = i === 2 || i === 3; K.box(M.plastic, 0.028, 0.004, 0.064, -0.09 + i * 0.03, op ? 0.03 : 0.022, op ? -0.03 : 0, { r: 0.001, col: cols[i], rx: op ? -1.2 : 0 }); } K.pop(); };
// lace doily
F.doily = (K, x, y, z, s = 0.22) => K.plane(M.lace, s, s, x, y + 0.0015, z, { up: true, ry: K.rng() * 3, col: 0xf4f0e4 });
