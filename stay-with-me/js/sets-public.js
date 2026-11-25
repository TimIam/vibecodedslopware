// Interior sets: office, diner, gym. Layout, clutter and lighting numbers for each room are here, together with
// the furniture only these rooms use (desks, task chairs, booths, counter stools, free weights).

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';
import { F } from './sets-fixtures.js';
import { SUN, SKYFILL, WARM, DUSKSUN } from './sets-home.js';

const PI = Math.PI, H = PI / 2;
const COOL = 0xeef4ff;

// ---------------------------------------------------------------- office furniture
function monitor(K, x, y, z, { ry = 0, rect = 'mon0', on = true, w = 0.54, k = 2.0 } = {}) {
  K.push(x, y, z, ry); const h = w * 0.58;
  K.box(M.plastic, 0.22, 0.012, 0.17, 0, 0, 0, { r: 0.005, col: 0x1a1a1c }); K.box(M.plastic, 0.045, 0.2, 0.03, 0, 0.012, -0.03, { r: 0.006, col: 0x1a1a1c });
  K.box(M.plastic, w + 0.016, h + 0.016, 0.03, 0, 0.13, 0, { r: 0.006, col: 0x121214 });
  K.plane(K.screen(on ? k : 0, 'mon'), w, h, 0, 0.13 + h / 2 + 0.008, 0.0156, { uv: ATLAS.screens.rect[rect] });
  K.pop();
}
function deskItems(K, r, on) {
  const y = 0.74, dual = r.chance(0.45);
  if (dual) { monitor(K, -0.29, y, -0.14, { ry: 0.2, rect: 'mon' + r.i(0, 2), on: on && r.chance(0.8) }); monitor(K, 0.29, y, -0.14, { ry: -0.2, rect: 'mon' + r.i(0, 2), on: on && r.chance(0.8) }); }
  else monitor(K, 0, y, -0.14, { rect: 'mon' + r.i(0, 2), on: on && r.chance(0.8), w: 0.6 });
  K.box(M.plastic, 0.44, 0.018, 0.14, (r() - 0.5) * 0.06, y, 0.14, { r: 0.005, rx: 0.05, ry: (r() - 0.5) * 0.1, col: 0x1e1e20 }); K.rbox(M.plastic, 0.06, 0.03, 0.1, 0.34, y, 0.15, { r: 0.014, col: 0x1e1e20, seg: 2 }); K.box(M.rubberBlack, 0.24, 0.003, 0.2, 0.34, y, 0.15, { r: 0.001, col: 0x2a2a30 });
  const q = r.i(0, 3);
  if (q < 3) P.mug(K, -0.5 + r() * 0.06, y, 0.18, { col: r.pick([0xe8e2d0, 0x2f5d8a, 0xb8483a, 0x2a2a2e]), ry: r() * 6 });
  let py = y; for (let i = 0; i < r.i(2, 7); i++) { K.box(M.matte, 0.21, 0.004, 0.297, 0.56 + (r() - 0.5) * 0.02, py, -0.12 + (r() - 0.5) * 0.02, { r: 0, ry: (r() - 0.5) * 0.3, col: 0xf2f0ea }); py += 0.0045; }
  K.plane(M.signs, 0.2, 0.28, 0.56, py + 0.001, -0.12, { up: true, uv: ATLAS.signs.rect.paper, ry: (r() - 0.5) * 0.3 });
  if (q > 0) { K.box(M.plastic, 0.16, 0.05, 0.2, -0.55, y, -0.15, { r: 0.01, rx: -0.15, col: 0x2a2a2e }); K.box(M.plastic, 0.05, 0.03, 0.19, -0.6, y + 0.04, -0.15, { r: 0.012, col: 0x1a1a1c }); }
  if (q === 2) { K.lathe(M.ceramic, [[0.001, 0], [0.045, 0], [0.055, 0.08], [0.05, 0.08], [0.04, 0.01]], 0.58, y, 0.22, { col: 0xe8e2d0, seg: 12 }); for (let i = 0; i < 5; i++) K.geo(M.leaf, leaf(0.03, 0.14), { x: 0.58, y: y + 0.07, z: 0.22, ry: i * 1.3, rx: 0.5, col: [0.05, 0.22, 0.06] }); }
  K.box(M.plastic, 0.075, 0.003, 0.075, -0.3 + r() * 0.5, y, 0.27, { r: 0, col: r.pick([0xf3e58a, 0xf4a6c6, 0xbfe0f0]), ry: r() });
}
function leaf(w, l) { const g = new THREE.PlaneGeometry(w, l, 1, 3), p = g.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const v = p[i + 1] / l + 0.5; p[i] *= Math.sin(PI * (0.1 + 0.9 * v) * 0.95); p[i + 2] = v * v * l * 0.5; p[i + 1] = v * l; } g.computeVertexNormals(); return g; }
function desk(K, { w = 1.4, d = 0.7, col = 0xd9cdb4, items = true, on = true, ped = 1 } = {}) {
  K.box(M.wood, w, 0.028, d, 0, 0.712, 0, { r: 0.006, col });
  for (const s of [-1, 1]) { K.box(M.metal, 0.05, 0.7, 0.03, s * (w / 2 - 0.06), 0.012, 0, { r: 0.005, col: 0xc8ccd0 }); K.box(M.metal, 0.06, 0.02, d - 0.08, s * (w / 2 - 0.06), 0, 0, { r: 0.006, col: 0xc8ccd0 }); K.box(M.metal, 0.05, 0.03, d - 0.14, s * (w / 2 - 0.06), 0.682, 0, { r: 0.004, col: 0xc8ccd0 }); }
  K.box(M.metal, w - 0.14, 0.3, 0.012, 0, 0.36, -d / 2 + 0.05, { r: 0.002, col: 0xc8ccd0 });
  if (ped) { const px = ped * (w / 2 - 0.32); K.box(M.satin, 0.4, 0.56, 0.52, px, 0.04, 0.02, { r: 0.006, col: 0xe2e2de }); for (let i = 0; i < 3; i++) { K.box(M.satin, 0.39, 0.175, 0.012, px, 0.05 + i * 0.183, 0.286, { r: 0.004, col: 0xeaeae6 }); K.box(M.metal, 0.1, 0.012, 0.012, px, 0.19 + i * 0.183, 0.296, { r: 0.004, col: 0x9a9da0 }); } }
  if (items) deskItems(K, K.rng, on);
}
function taskChair(K, { col = 0x26303c, back = 0x1a1a1e } = {}) {
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5; K.box(M.plastic, 0.3, 0.025, 0.045, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, { r: 0.01, ry: -a, col: 0x1a1a1c }); K.cyl(M.rubberBlack, 0.028, 0.028, 0.04, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3, { rx: H, ry: -a, c: true, seg: 10, col: 0x111111 }); }
  K.cyl(M.chrome, 0.022, 0.028, 0.32, 0, 0.08, 0, { seg: 10 }); K.box(M.plastic, 0.24, 0.04, 0.24, 0, 0.39, 0, { r: 0.01, col: 0x1a1a1c });
  K.rbox(M.fabric, 0.48, 0.075, 0.46, 0, 0.43, 0.02, { r: 0.035, puff: 0.012, col, seg: 3 });
  K.box(M.plastic, 0.06, 0.34, 0.025, 0, 0.42, -0.24, { r: 0.008, rx: -0.12, col: 0x1a1a1c }); K.rbox(M.fabric, 0.44, 0.5, 0.05, 0, 0.6, -0.25, { r: 0.024, puff: -0.012, col: back, rx: -0.12, seg: 3 });
  for (const s of [-1, 1]) { K.box(M.plastic, 0.03, 0.2, 0.03, s * 0.27, 0.44, -0.02, { r: 0.008, col: 0x1a1a1c }); K.rbox(M.plastic, 0.05, 0.028, 0.24, s * 0.27, 0.64, 0, { r: 0.012, col: 0x222226, seg: 2 }); }
}

// ---------------------------------------------------------------- diner furniture
// one booth: table along local Z (wall at z=0, runs to +Z), benches either side along X
function booth(K, { col = 0x9c2a26, len = 1.15, food = [] } = {}) {
  for (const s of [-1, 1]) {
    K.box(M.satin, 0.52, 0.3, len, s * 0.63, 0, len / 2 + 0.02, { r: 0.004, col: 0x2a2a2c });
    K.rbox(M.vinyl, 0.5, 0.13, len, s * 0.62, 0.3, len / 2 + 0.02, { r: 0.05, puff: 0.012, col, seg: 3 });
    K.box(M.satin, 0.1, 1.0, len, s * 0.93, 0, len / 2 + 0.02, { r: 0.004, col: 0x2a2a2c });
    const n = 5, rw = len / n; for (let i = 0; i < n; i++) K.rbox(M.vinyl, 0.09, 0.6, rw - 0.008, s * 0.86, 0.42, 0.02 + (i + 0.5) * rw, { r: 0.04, col: i === 2 ? shade(col, 1.0) : col, seg: 3, rz: s * 0.06 });
    K.box(M.chrome, 0.13, 0.025, len + 0.02, s * 0.93, 1.0, len / 2 + 0.02, { r: 0.01 });
  }
  K.box(M.lino, 0.7, 0.03, len - 0.05, 0, 0.73, len / 2, { r: 0.004, col: 0xe8e2d2 }); K.box(M.chrome, 0.71, 0.034, len - 0.04, 0, 0.726, len / 2, { r: 0.012 });
  K.cyl(M.chrome, 0.04, 0.04, 0.71, 0, 0.02, len / 2 + 0.1, { seg: 12 }); K.cyl(M.chrome, 0.22, 0.24, 0.02, 0, 0, len / 2 + 0.1, { seg: 20 });
  const y = 0.762;
  // condiments against the wall
  P.bottle(K, -0.12, y, 0.1, { kind: 'squeeze', col: 0xb81c1c }); P.bottle(K, -0.04, y, 0.08, { kind: 'squeeze', col: 0xe0b020 });
  K.box(M.chrome, 0.1, 0.13, 0.09, 0.12, y, 0.1, { r: 0.008 }); K.box(M.matte, 0.085, 0.05, 0.003, 0.12, y + 0.06, 0.146, { r: 0, col: 0xf4f4f0 });
  K.cyl(M.glassTint, 0.022, 0.026, 0.09, 0.24, y, 0.09, { seg: 10, col: 0xf4f4f4 }); K.cyl(M.chrome, 0.023, 0.018, 0.02, 0.24, y + 0.09, 0.09, { seg: 10 });
  for (const s of [-1, 1]) K.cyl(M.glassTint, 0.014, 0.016, 0.06, s * 0.03 + 0.03, y, 0.19, { seg: 8, col: s > 0 ? 0xf4f4f4 : 0x3a3a3a });
  food.forEach((f, i) => { const sx = i & 1 ? 1 : -1, z = 0.42 + (i >> 1) * 0.42; if (f) { P.plate(K, sx * 0.17, y, z, { food: f }); P.mug(K, sx * 0.24, y, z + 0.2, { col: 0xf0ede4, ry: i * 2.1 }); K.box(M.steel, 0.012, 0.003, 0.19, sx * 0.31, y, z, { r: 0.001, ry: 0.1 * sx }); K.box(M.matte, 0.1, 0.004, 0.1, sx * 0.06, y, z + 0.17, { r: 0, ry: 0.3, col: 0xf4f4f0 }); } });
}
function stool(K, { col = 0x9c2a26 } = {}) {
  K.cyl(M.chrome, 0.15, 0.17, 0.02, 0, 0, 0, { seg: 20 }); K.cyl(M.chrome, 0.03, 0.03, 0.62, 0, 0.02, 0, { seg: 12 }); K.torus(M.chrome, 0.14, 0.01, 0, 0.26, 0, { rx: H, seg: 24, rs: 6 });
  for (let i = 0; i < 3; i++) K.cyl(M.chrome, 0.006, 0.006, 0.12, Math.cos(i * 2.09) * 0.08, 0.26, Math.sin(i * 2.09) * 0.08, { rz: H, ry: -i * 2.09, c: true, seg: 5 });
  K.cyl(M.chrome, 0.18, 0.17, 0.035, 0, 0.64, 0, { seg: 24 }); K.lathe(M.vinyl, [[0.001, 0.035], [0.178, 0.035], [0.18, 0.065], [0.16, 0.09], [0.001, 0.096]], 0, 0.64, 0, { col, seg: 24 });
}

// ---------------------------------------------------------------- gym equipment
function dumbbell(K, x, y, z, s, { ry = 0, col = 0x1a1a1c } = {}) { // s 0..1 size grade; lies along local X
  const hr = 0.04 + s * 0.045, hl = 0.05 + s * 0.05;
  K.push(x, y + hr * 0.87, z, ry);
  K.cyl(M.chrome, 0.015, 0.015, 0.13, 0, 0, 0, { rz: H, c: true, seg: 8 });
  for (const sd of [-1, 1]) K.cyl(M.rubberBlack, hr, hr, hl, sd * (0.065 + hl / 2), 0, 0, { rz: H, c: true, seg: 6, col });
  K.pop();
}
function dumbbellRack(K, { len = 2.2, from = 0 } = {}) {
  for (const s of [-1, 1]) { K.box(M.metal, 0.06, 0.82, 0.06, s * (len / 2 - 0.03), 0, 0.12, { r: 0.006, col: 0x1e1e20, rx: -0.2 }); K.box(M.metal, 0.07, 0.05, 0.6, s * (len / 2 - 0.03), 0, 0.3, { r: 0.006, col: 0x1e1e20 }); }
  [0.32, 0.72].forEach((ty, t) => { const tz = 0.34 - t * 0.14;
    K.box(M.metal, len, 0.012, 0.3, 0, ty, tz, { r: 0.003, rx: 0.3, col: 0x2a2a2e }); K.box(M.metal, len, 0.04, 0.012, 0, ty - 0.03, tz + 0.15, { r: 0.003, rx: 0.3, col: 0x2a2a2e });
    const n = Math.floor(len / 0.2); for (let i = 0; i < n; i++) { const g = (from + (t ? 0 : n) + i) / (2 * n + from); if (K.rng.chance(0.1)) continue; dumbbell(K, -len / 2 + 0.11 + i * (len - 0.2) / (n - 1), ty + 0.03, tz - 0.015, g, { ry: H + 0.0 }); } });
}
function bench(K, { incline = 0, col = 0x16161a } = {}) {
  K.box(M.metal, 0.06, 0.05, 1.2, 0, 0, 0, { r: 0.006, col: 0x2a2a2e }); for (const z of [-0.55, 0.55]) { K.box(M.metal, 0.5, 0.05, 0.06, 0, 0, z, { r: 0.006, col: 0x2a2a2e }); K.box(M.metal, 0.06, 0.38, 0.06, 0, 0.04, z * 0.82, { r: 0.006, col: 0x2a2a2e }); }
  if (incline) { K.rbox(M.vinyl, 0.3, 0.07, 0.42, 0, 0.42, 0.36, { r: 0.028, col, seg: 2 }); K.rbox(M.vinyl, 0.3, 0.07, 0.8, 0, 0.42 + Math.sin(incline) * 0.38, -0.2 - (1 - Math.cos(incline)) * 0.3, { r: 0.028, col, rx: incline, seg: 2 }); K.box(M.metal, 0.05, 0.5, 0.05, 0, 0.1, -0.42, { r: 0.006, rx: -0.3, col: 0x2a2a2e }); }
  else K.rbox(M.vinyl, 0.3, 0.075, 1.22, 0, 0.42, 0, { r: 0.03, col, seg: 2 });
}
function plate(K, x, y, z, r, t, col, o = {}) { K.cyl(M.rubberBlack, r, r, t, x, y, z, { rz: H, c: true, seg: 28, col, ...o }); K.cyl(M.metal, r * 0.28, r * 0.28, t + 0.006, x, y, z, { rz: H, c: true, seg: 14, col: 0x9a9da0, ...o }); }
function barbell(K, x, y, z, { ry = 0, plates = [0xb02020, 0x2040a0], len = 2.2 } = {}) {
  K.push(x, y, z, ry); K.cyl(M.chrome, 0.014, 0.014, len, 0, 0, 0, { rz: H, c: true, seg: 10 });
  for (const s of [-1, 1]) { K.cyl(M.chrome, 0.025, 0.025, 0.4, s * (len / 2 - 0.2), 0, 0, { rz: H, c: true, seg: 12 }); K.cyl(M.chrome, 0.04, 0.04, 0.03, s * (len / 2 - 0.415), 0, 0, { rz: H, c: true, seg: 12 }); plates.forEach((pc, i) => plate(K, s * (len / 2 - 0.37 + i * 0.055), 0, 0, 0.225, 0.05, pc)); K.cyl(M.metal, 0.035, 0.035, 0.04, s * (len / 2 - 0.37 + plates.length * 0.055 + 0.0), 0, 0, { rz: H, c: true, seg: 10, col: 0x8a8d90 }); }
  K.pop();
}
function powerRack(K) {
  const c = 0x1c1c20;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box(M.metal, 0.07, 2.3, 0.07, sx * 0.6, 0, sz * 0.6, { r: 0.006, col: c }); K.box(M.metal, 0.2, 0.01, 0.2, sx * 0.6, 0, sz * 0.6, { r: 0.002, col: c }); }
  for (const sx of [-1, 1]) { K.box(M.metal, 0.07, 0.07, 1.27, sx * 0.6, 2.23, 0, { r: 0.006, col: c }); K.box(M.metal, 0.07, 0.07, 1.27, sx * 0.6, 0.0, 0, { r: 0.006, col: c }); K.box(M.metal, 0.05, 0.05, 1.2, sx * 0.6, 0.72, 0, { r: 0.006, col: 0xb02020 }); K.box(M.metal, 0.03, 0.09, 0.12, sx * 0.6, 1.4, 0.69, { r: 0.006, col: 0x8a8d90 }); }
  for (const sz of [-1, 1]) K.box(M.metal, 1.27, 0.07, 0.07, 0, 2.23, sz * 0.6, { r: 0.006, col: c }); K.cyl(M.chrome, 0.016, 0.016, 1.2, 0, 2.2, 0.3, { rz: H, c: true, seg: 8 });
}

export const PUBLIC = {
  office(K) {
    const w = 9, d = 7.5, h = 2.7, r = K.rng, on = true;
    const Fr = K.room({ w, d, h, wallCol: 0xd6d8d6, floorMat: M.carpetTile, floorCol: 0xa4acb8, ceilMat: M.ceilTile, ceilCol: 0xf4f4f2, skirt: 0.1, skirtCol: 0x3a3d42, wear: 0.4, wearCol: 0xd0d4dc, openings: [{ id: 'w0', wall: 'N', at: -2.7, w: 2.1, y0: 0.9, y1: 2.25 }, { id: 'w1', wall: 'N', at: 0, w: 2.1, y0: 0.9, y1: 2.25 }, { id: 'w2', wall: 'N', at: 2.7, w: 2.1, y0: 0.9, y1: 2.25 }, { id: 'door', wall: 'W', at: 0.2, w: 0.95, y1: 2.08 }] });
    const bd = K.night ? 'cityNight' : K.dusk ? 'dusk' : K.rain ? 'rain' : 'cityDay';
    ['w0', 'w1', 'w2'].forEach((id, i) => K.window(Fr[id], { cols: 3, frameCol: 0x4a4d52, backdrop: bd, blind: { kind: 'venetian', drop: [0.45, 0.3, 0.7][i], col: 0xe4e4e0, tilt: 0.5 }, sillCol: 0xe8e8e4, shaft: 0.3 }));
    K.door(Fr.door, { open: 0, hinge: 1, style: 'glazed', col: C.beech, mat: M.wood, handle: 'bar', kick: true, frameCol: 0x4a4d52 });
    K.onWall('W', 0.2, () => { K.box(M.plastic, 0.34, 0.16, 0.04, 0, 2.2, 0.02, { r: 0.006, col: 0xe8e8e4 }); K.plane(K.screen(2.2, 'exit'), 0.3, 0.13, 0, 2.28, 0.041, { uv: ATLAS.screens.rect.exit }); });
    // desk clusters: two facing rows with a low screen between
    const cluster = (cx, cz, n = 2) => K.prop(cx, 0, cz, 0, () => {
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 1.42; K.at(x, 0, -0.36, PI, () => desk(K, { ped: i ? -1 : 1 })); K.at(x, 0, 0.36, 0, () => desk(K, { ped: i ? 1 : -1 })); }
      K.box(M.fabric, n * 1.42 - 0.04, 0.42, 0.03, 0, 0.72, 0, { r: 0.006, col: 0x5a6e86 }); K.box(M.metal, n * 1.42, 0.02, 0.04, 0, 1.14, 0, { r: 0.004, col: 0xc8ccd0 });
    });
    cluster(-2.55, -1.75); cluster(-2.55, 1.85);
    const chairAt = (x, z, ry, tip = false) => tip ? (K.at(x, 0.26, z, ry, () => taskChair(K, {}), 0, H), K.collide(0.9, 0.55, 0.7, x, 0, z)) : K.prop(x, 0, z, ry, () => taskChair(K, { col: r.pick([0x26303c, 0x2a2a2e, 0x3a4a5a]) }), { pad: 0 });
    for (const cz of [-1.75, 1.85]) for (const sx of [-0.71, 0.71]) { if (cz < 0 && sx > 0) chairAt(-1.84, -2.8, 0.25); else chairAt(-2.55 + sx + (r() - 0.5) * 0.2, cz - 1.0 - r() * 0.15, r() * 0.8 - 0.4); if (!(cz < 0 && sx > 0)) chairAt(-2.55 + sx + (r() - 0.5) * 0.2, cz + 1.0 + r() * 0.15, PI + r() * 0.8 - 0.4); }
    // window row of two desks
    K.prop(2.2, 0, -3.36, 0, () => { K.at(-0.72, 0, 0, 0, () => desk(K, { ped: -1 })); K.at(0.72, 0, 0, 0, () => desk(K, { ped: 1 })); });
    chairAt(1.5, -2.65, PI + 0.3); chairAt(3.0, -2.55, PI - 0.5);
    // glass meeting room in the south-east corner
    const mx0 = 1.3, mz0 = 0.75, post = (x, z) => K.box(M.metal, 0.05, h, 0.05, x, 0, z, { r: 0.004, col: 0x4a4d52 });
    const glassRun = (ax, az, bx, bz, skipDoor) => { const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 1.05), ry = Math.atan2(-(bz - az), bx - ax);
      K.at(ax, 0, az, ry, () => { K.box(M.metal, len, 0.05, 0.05, len / 2, 0, 0, { r: 0.004, col: 0x4a4d52 }); K.box(M.metal, len, 0.05, 0.05, len / 2, h - 0.05, 0, { r: 0.004, col: 0x4a4d52 });
        for (let i = 0; i <= n; i++) K.box(M.metal, 0.05, h, 0.05, i * len / n, 0, 0, { r: 0.004, col: 0x4a4d52 });
        for (let i = 0; i < n; i++) { const cx = (i + 0.5) * len / n, pw = len / n - 0.05; if (i === skipDoor) { K.box(M.metal, pw, 0.05, 0.05, cx, 2.1, 0, { r: 0.004, col: 0x4a4d52 }); K.plane(M.glass, pw, h - 2.15, cx, (h + 2.15) / 2, 0, {}); K.push(cx - pw / 2, 0, 0, -0.9); K.plane(M.glass, pw - 0.02, 2.08, pw / 2, 1.05, 0, {}); K.plane(M.glassTint, pw - 0.02, 0.4, pw / 2, 1.1, 0.002, { col: 0xf4f6f8 }); K.cyl(M.chrome, 0.012, 0.012, 0.5, pw - 0.1, 0.85, 0.04, { seg: 8 }); K.cyl(M.chrome, 0.012, 0.012, 0.5, pw - 0.1, 0.85, -0.04, { seg: 8 }); K.box(M.metal, pw, 0.04, 0.02, pw / 2, 0, 0, { r: 0.004, col: 0x4a4d52 }); K.box(M.metal, pw, 0.04, 0.02, pw / 2, 2.06, 0, { r: 0.004, col: 0x4a4d52 }); K.pop(); }
          else { K.plane(M.glass, pw, h - 0.1, cx, h / 2, 0, {}); K.plane(M.glassTint, pw, 0.4, cx, 1.1, 0.002, { col: 0xf4f6f8 }); } } }); K.collide(Math.abs(bx - ax) + 0.08, h, Math.abs(bz - az) + 0.08, (ax + bx) / 2, 0, (az + bz) / 2, 0); };
    glassRun(mx0, mz0, w / 2, mz0, 0); glassRun(mx0, d / 2, mx0, mz0, -1);
    K.prop(2.95, 0, 2.3, 0, () => { K.box(M.wood, 1.9, 0.03, 0.95, 0, 0.71, 0, { r: 0.01, col: C.walnut }); for (const s of [-1, 1]) K.box(M.metal, 0.06, 0.71, 0.6, s * 0.7, 0, 0, { r: 0.006, col: 0x2a2a2e }); K.box(M.plastic, 0.22, 0.05, 0.22, 0, 0.74, 0, { r: 0.02, col: 0x1a1a1c }); P.mug(K, 0.5, 0.74, 0.2, { col: 0xe8e2d0 }); K.box(M.plastic, 0.32, 0.015, 0.22, -0.5, 0.74, -0.15, { r: 0.004, ry: 0.2, col: 0x9a9da0 }); });
    for (const [x, z, ry] of [[2.4, 1.55, PI + 0.2], [3.5, 1.55, PI - 0.3], [2.4, 3.05, 0.3], [3.5, 3.1, -0.1]]) chairAt(x, z, ry);
    K.onWall('E', 2.3, () => K.at(0, 1.15, 0, 0, () => P.tv(K, { w: 1.3, wall: true, rect: 'slides', k: 2.0 })));
    K.onWall('S', 2.9, () => { K.box(M.metal, 1.5, 0.95, 0.02, 0, 1.0, 0.01, { r: 0.004, col: 0xc8ccd0 }); K.plane(M.signs, 1.44, 0.89, 0, 1.475, 0.021, { uv: ATLAS.signs.rect.whiteboard }); });
    // east wall: copier, cabinets, water cooler; south wall: filing cabinets
    K.prop(w / 2 - 0.02, 0, -2.6, -H, () => { K.box(M.satin, 0.62, 0.95, 0.6, 0, 0, 0.3, { r: 0.012, col: 0xdcdcd8 }); K.box(M.satin, 0.64, 0.12, 0.62, 0, 0.95, 0.3, { r: 0.012, col: 0xe8e8e4 }); K.box(M.plastic, 0.56, 0.02, 0.4, 0, 1.07, 0.3, { r: 0.006, col: 0x3a3d42 }); K.box(M.plastic, 0.2, 0.04, 0.12, 0.2, 1.07, 0.56, { r: 0.006, rx: 0.5, col: 0x1a1a1c }); K.plane(K.screen(1.6, 'mon'), 0.12, 0.07, 0.2, 1.11, 0.6, { rx: -1.07, uv: ATLAS.screens.rect.mon1 }); for (let i = 0; i < 3; i++) K.box(M.satin, 0.56, 0.18, 0.012, 0, 0.12 + i * 0.2, 0.606, { r: 0.004, col: 0xe8e8e4 }); K.box(M.satin, 0.4, 0.02, 0.3, -0.5, 0.6, 0.35, { r: 0.006, col: 0xdcdcd8 }); K.box(M.matte, 0.21, 0.01, 0.297, -0.5, 0.62, 0.35, { r: 0, col: 0xf4f2ec }); });
    K.prop(w / 2 - 0.02, 0, -1.3, -H, () => { K.box(M.plastic, 0.32, 0.95, 0.32, 0, 0, 0.18, { r: 0.016, col: 0xe8e8e4 }); K.lathe(M.glassTint, [[0.001, 0], [0.13, 0], [0.135, 0.3], [0.1, 0.36], [0.04, 0.38]], 0, 0.95, 0.18, { col: 0x9ac8ee, seg: 16 }); for (const s of [-1, 1]) K.box(M.plastic, 0.03, 0.03, 0.03, s * 0.06, 0.72, 0.35, { r: 0.006, col: s > 0 ? 0x2a5ab0 : 0xb02a2a }); K.box(M.matte, 0.2, 0.01, 0.1, 0, 0.6, 0.36, { r: 0.002, col: 0x8a8d90 }); });
    K.prop(-2.4, 0, d / 2 - 0.02, PI, () => { for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.82; K.box(M.metal, 0.8, 1.05, 0.45, x, 0, 0.225, { r: 0.006, col: 0xb8bcc0 }); for (let j = 0; j < 3; j++) { K.box(M.metal, 0.78, 0.33, 0.012, x, 0.03 + j * 0.34, 0.456, { r: 0.004, col: 0xc4c8cc }); K.box(M.metal, 0.14, 0.014, 0.014, x, 0.3 + j * 0.34, 0.468, { r: 0.004, col: 0x6a6d70 }); } }
      K.at(-0.9, 1.05, 0.22, 0, () => P.plant(K, { h: 0.5, n: 12, pot: 0.09, potCol: 0xe8e4da })); for (let i = 0; i < 4; i++) K.box(M.satin, 0.07, 0.31, 0.26, 0.2 + i * 0.075, 1.05, 0.2, { r: 0.004, col: [0x24508c, 0x1a1a1c, 0xa8231f, 0x24508c][i], rz: i === 3 ? -0.2 : 0 }); P.carton(K, 0.4, 0.28, 0.3, 0.95, 1.05, 0.22, { ry: 0.1, label: true }); });
    K.onWall('S', -2.4, () => P.picture(K, 0, 1.75, { w: 1.1, h: 0.7, pic: 'notice', atlas: 'signs', mount: 0, col: 0xc8ccd0, mat: M.metal, f: 0.02 }));
    K.onWall('W', -2.2, () => { P.clock(K, 0, 2.2, { r: 0.15, col: 0x1a1a1c, hour: K.night ? 9.6 : 3.4 }); P.picture(K, 0, 1.45, { w: 0.8, h: 0.55, pic: 'art0', col: 0x1a1a1c }); });
    K.onWall('W', 1.2, () => { K.cyl(M.gloss, 0.065, 0.065, 0.42, 0, 0.7, 0.08, { col: 0xb81c1c, seg: 14 }); K.cyl(M.metal, 0.02, 0.03, 0.06, 0, 1.12, 0.08, { col: 0x1a1a1c, seg: 8 }); K.plane(M.signs, 0.14, 0.21, 0, 1.6, 0.003, { uv: ATLAS.signs.rect.fireext }); });
    K.prop(-4.1, 0, 3.3, 0, () => { P.plant(K, { h: 1.2, n: 22, pot: 0.18, potCol: 0x3a3d42 }); K.collide(0.45, 1.0, 0.45); }, { collide: false });
    K.prop(0.6, 0, 3.35, 0, () => { P.plant(K, { h: 1.0, kind: 'blade', n: 14, pot: 0.16, potCol: 0xe8e4da }); K.collide(0.4, 1.0, 0.4); }, { collide: false });
    // the story: went down at their desk; chair over, papers everywhere
    chairAt(-1.3, -1.5, 0.9, true);
    for (let i = 0; i < 9; i++) K.plane(i % 3 ? M.matte : M.signs, 0.21, 0.297, -0.9 + r() * 1.3, 0.004 + i * 0.0006, -1.75 + r() * 0.75, { up: true, ry: r() * TAU, col: 0xf4f2ec, uv: i % 3 ? undefined : ATLAS.signs.rect.paper });
    K.at(-1.02, 0, -0.6, 1.2, () => P.mug(K, 0, 0, 0, { tipped: true, col: 0x2f5d8a })); K.stain('coffee', 0.45, 0.35, -0.95, -0.5); K.box(M.plastic, 0.075, 0.009, 0.15, 1.0, 0, -1.3, { r: 0.004, ry: 0.5, col: 0x101012 });
    // ceiling: panels in the grid, a couple of vents
    const pm = [];
    for (const x of [-3.3, -1.5, 0.3, 2.1, 3.9]) for (const z of [-2.7, -0.9, 0.9, 2.7]) pm.push([x, z]);
    for (const [x, z] of pm) K.at(x, h, z, 0, () => P.ledPanel(K, { w: 0.57, d: 0.57, on, col: 0xf2f6ff, k: 2.6 }));
    for (const [x, z] of [[-0.9, -1.5], [2.7, 0.3], [-2.7, 0.3]]) K.at(x, h, z, 0, () => { K.box(M.satin, 0.56, 0.012, 0.56, 0, -0.012, 0, { r: 0.002, col: 0xe4e4e0 }); for (let i = 0; i < 5; i++) K.box(M.matte, 0.46 - i * 0.09, 0.004, 0.46 - i * 0.09, 0, -0.014 - i * 0.002, 0, { r: 0, col: i & 1 ? 0xd8d8d4 : 0x9a9a98 }); });
    K.switchPlate('W', 0.95, 1.2, 2);
    // a working floor: bins and bags by the desks, coats by the door, boxes of paper, cables, sprinklers and detectors
    K.onWall('W', -0.95, () => { K.box(M.metal, 1.0, 0.05, 0.02, 0, 1.72, 0.01, { r: 0.004, col: 0x4a4d52 }); [[-0.36, 0x2a3a4a, 0.95], [-0.1, 0x6a5a3a, 0.8], [0.2, 0x1e1e22, 1.0], [0.42, 0x7a2a2a, 0.7]].forEach(([x, c, l]) => P.coat(K, x, 1.74, { col: c, len: l, w: 0.44 })); });
    K.scatter(4, [-4.2, -3.2, -0.9, 3.2], 0.16, i => i & 1 ? P.wasteBin(K, { balls: 2 }) : K.rbox(M.fabric, 0.4, 0.3, 0.14, 0, 0, 0, { r: 0.05, soft: true, puff: 0.012, wrinkle: 0.008, crease: 0.006, col: [0x1e2a3a, 0x3a2a22][i >> 1], cell: 0.04 }));
    K.along('E', 3, 0.24, i => { P.carton(K, 0.4, 0.26, 0.3, 0, 0, 0, { label: true }); if (i !== 1) P.carton(K, 0.38, 0.24, 0.3, 0.02, 0.26, 0, { ry: 0.15, label: true }); K.collide(0.44, i !== 1 ? 0.52 : 0.28, 0.34); K.ao(0.7, 0.6, 0, 0.017, 0, { k: 0.45 }); });
    K.along('S', 2, 0.2, i => i ? P.wasteBin(K, { col: 0x24508c, h: 0.4, balls: 1 }) : P.extension(K, { plugs: 3 }), { lo: -0.9, hi: 0.2 });
    for (const [x, z] of [[-2.55, -1.75], [-2.55, 1.85], [2.2, -3.3]]) K.at(x, 0, z, 0, () => { P.extension(K, { plugs: 4, col: 0x2a2a2e }); P.cable(K, [0.2, 0.05], [0.9, 0.2], { slack: 0.2 }); P.cable(K, [-0.2, -0.05], [-1.0, -0.15], { slack: 0.2 }); });
    for (const [x, z] of [[-1.5, 0], [1.2, -0.6], [-1.5, -2.9], [2.9, 2.2]]) K.at(x, h, z, 0, () => P.smokeAlarm(K));
    for (const [x, z] of [[-3.3, -0.9], [0.3, 0.9], [2.1, -2.7], [-1.5, 2.7], [3.9, 0.9]]) K.at(x + 0.9, h, z + 0.9, 0, () => { K.cyl(M.chrome, 0.02, 0.012, 0.03, 0, -0.03, 0, { seg: 8 }); K.cyl(M.chrome, 0.028, 0.028, 0.004, 0, -0.045, 0, { seg: 10 }); });
    K.grime('wear', 2.4, 1.4, -3.3, 0.0066, 0.2, { up: true, col: 0xd0d4dc }); K.grime('wear', 2.6, 1.3, -0.2, 0.0067, 0.1, { up: true, ry: 0.2, col: 0xd0d4dc }); K.grime('smudge', 1.2, 0.8, 4.0, 0.0068, -1.9, { up: true, col: 0x3a4048 });
    K.hemi(0xe8eef6, 0x8a9098, K.day ? 0.27 : 0.17);
    K.spot(0.3, h - 0.03, -0.9, 0.4, 0, -0.5, { col: COOL, int: 22, angle: 1.3, pen: 0.6, shadow: true, near: 0.1 });
    K.point(-2.4, h - 0.25, -1.8, { col: COOL, int: 7 }); K.point(-2.4, h - 0.25, 1.9, { col: COOL, int: 7 }); K.point(2.9, h - 0.25, 2.2, { col: COOL, int: 5 }); K.point(2.6, h - 0.25, -2.2, { col: COOL, int: 6 });
    if (K.day && !K.rain) K.sun(184, 46, SUN, 5.5); else if (K.dusk) K.sun(200, 12, DUSKSUN, 1.8, { soft: 3 });
    K.spots({ floor: [0.5, -0.4, H], seat: [-1.84, 0.5, -2.78, 0.25], side: -1, by: [[1.9, -1.4], [-0.6, 0.9]], cam: [1.35, 1.35, 0.5], target: [0.2, 0.25, -0.5], seatView: { cam: [-0.6, 1.3, -2.0], target: [-1.84, 0.85, -2.8], partner: [-1.1, 0, -3.0], kit: [-0.95, 0, -2.35] } });
    return { exposure: 0.88, bloom: 0.07, envInt: 0.9, envPos: [0.3, 1.4, -0.4] };
  },

  diner(K) {
    const w = 9.2, d = 6.4, h = 2.9, r = K.rng, on = true, red = 0x9c2a26;
    const Fr = K.room({ w, d, h, wallCol: 0xbfd6c8, dado: { h: 1.05, mat: M.subway, col: 0xf0ead8, rail: true, railCol: 0xb8bcc0 }, floorMat: M.chequer, ceilCol: 0xf2f0e8, skirt: 0.12, skirtCol: 0x2a2a2c, cove: 0.08, wear: 0.7, wearCol: 0x8a8880, openings: [
      { id: 'w0', wall: 'S', at: -3.3, w: 1.7, y0: 0.95, y1: 2.3 }, { id: 'w1', wall: 'S', at: -1.3, w: 1.7, y0: 0.95, y1: 2.3 }, { id: 'w2', wall: 'S', at: 0.7, w: 1.7, y0: 0.95, y1: 2.3 }, { id: 'door', wall: 'S', at: 3.3, w: 0.95, y1: 2.1 },
      { id: 'pass', wall: 'N', at: -1.2, w: 1.7, y0: 1.08, y1: 1.72 }, { id: 'kdoor', wall: 'N', at: 3.2, w: 0.9, y1: 2.05 }] });
    ['w0', 'w1', 'w2'].forEach((id, i) => { K.window(Fr[id], { cols: 2, frameCol: 0xc8ccd0, frameMat: M.metal, sillCol: 0xe8e2d2 });
      K.at(Fr[id].x, 0, Fr[id].z, Fr[id].ry, () => { K.cyl(M.brass, 0.008, 0.008, 1.7, 0, 1.52, -0.02, { rz: H, c: true, seg: 6 }); K.geo(K.curtainMat(0xe8dcc0, K.day ? 0.3 : 0.02), curtainStrip(K, 1.66, 0.55), { x: 0, y: 1.245, z: -0.02, uvScale: [2.5, 0.55] }); }); });
    K.at(Fr.w1.x, 0, Fr.w1.z, Fr.w1.ry, () => { K.plane(M.neon, 1.2, 0.48, 0, 1.98, -0.06, { uv: ATLAS.neon.rect.diner, ry: PI }); K.box(M.matte, 1.1, 0.01, 0.01, 0, 2.2, -0.065, { r: 0, col: 0x1a1a1a }); });
    K.at(Fr.w2.x, 0, Fr.w2.z, Fr.w2.ry, () => K.plane(M.neon, 0.62, 0.36, 0.3, 1.9, -0.06, { uv: ATLAS.neon.rect.open, ry: PI }));
    K.door(Fr.door, { open: 0, style: 'glazed', col: 0xb8bcc0, mat: M.metal, handle: 'bar', frameCol: 0xb8bcc0, kick: true });
    K.door(Fr.kdoor, { open: 0, style: 'flush', col: 0xc8ccd0, mat: M.steel, handle: 'bar', kick: true, frameCol: 0xb8bcc0, sign: { id: 'wash', w: 0.26, h: 0.17, y: 1.55 } });
    // pass-through to the kitchen: lit alcove with a steel shelf, heat lamps and order tickets
    K.at(Fr.pass.x, 0, Fr.pass.z, Fr.pass.ry, () => {
      K.box(M.steel, 1.8, 0.03, 0.4, 0, 1.06, -0.1, { r: 0.004 }); K.box(M.steel, 2.6, 1.6, 0.05, 0, 0.6, -1.3, { r: 0 }); K.box(M.wallTile, 2.6, 0.05, 1.3, 0, 2.2, -0.75, { r: 0 }); K.box(M.steel, 2.6, 0.05, 1.2, 0, 0.9, -0.8, { r: 0 });
      for (const s of [-1, 1]) K.box(M.wallTile, 0.05, 1.6, 1.3, s * 1.3, 0.6, -0.7, { r: 0 });
      K.box(K.emit(0xfff0d8, 5, { key: 'kitch' }), 1.2, 0.03, 0.2, 0, 2.16, -0.7, { r: 0 });
      for (const x of [-0.5, 0, 0.5]) { K.lathe(M.metal, [[0.09, 0], [0.03, 0.07], [0.012, 0.09]], x, 1.6, -0.05, { seg: 14, col: 0xb87348 }); K.sph(K.emit(0xff8a3a, 6, { key: 'heat' }), 0.03, x, 1.61, -0.05, { seg: 8, seg2: 6 }); }
      K.box(M.steel, 1.5, 0.012, 0.02, 0, 1.69, 0.02, { r: 0.002 }); for (let i = 0; i < 5; i++) K.plane(M.matte, 0.07, 0.13 + r() * 0.06, -0.55 + i * 0.22 + r() * 0.05, 1.6, 0.032, { col: 0xf6f2e0, rz: (r() - 0.5) * 0.1 });
      P.plate(K, -0.3, 1.09, -0.08, { food: 'burger' }); P.plate(K, 0.35, 1.09, -0.1, { food: 'eggs' }); K.cyl(M.chrome, 0.04, 0.045, 0.03, 0.75, 1.09, 0.0, { seg: 12 }); K.sph(M.chrome, 0.012, 0.75, 1.13, 0, { seg: 8, seg2: 6 });
    });
    K.onWall('N', -1.2, () => { K.box(M.wood, 2.2, 0.72, 0.03, 0, 1.92, 0.015, { r: 0.006, col: C.darkWood }); K.plane(M.signs, 0.92, 0.66, -0.5, 2.28, 0.031, { uv: ATLAS.signs.rect.menu }); K.plane(M.signs, 0.92, 0.66, 0.52, 2.28, 0.031, { uv: ATLAS.signs.rect.menu }); });
    // back counter along the north wall
    K.prop(-0.95, 0, -d / 2, 0, () => {
      F.baseUnits(K, { len: 6.2, col: 0xc8ccd0, topCol: 0xb8bcc0, topMat: M.steel, metal: M.chrome, h: 0.9 });
      const y = 0.94;
      K.at(-2.5, y, 0.3, 0, () => { K.box(M.steel, 0.5, 0.42, 0.36, 0, 0, 0, { r: 0.01 }); K.box(M.plastic, 0.5, 0.08, 0.38, 0, 0.42, 0, { r: 0.01, col: 0x1a1a1c }); for (const s of [-1, 1]) { K.lathe(M.glassTint, [[0.001, 0], [0.06, 0], [0.075, 0.06], [0.07, 0.12], [0.045, 0.15], [0.05, 0.16]], s * 0.12, 0.02, 0.26, { seg: 14, col: 0xdfe8ea }); K.cyl(M.gloss, 0.062, 0.058, 0.07, s * 0.12, 0.025, 0.26, { col: 0x1a0e06, seg: 12 }); K.cyl(M.metal, 0.07, 0.07, 0.012, s * 0.12, 0.006, 0.26, { col: 0x1a1a1c, seg: 14 }); } K.box(K.emit(0xff5a1a, 4, { key: 'cofled' }), 0.02, 0.02, 0.004, 0.18, 0.46, 0.19, { r: 0 }); });
      K.at(-1.55, y, 0.3, 0, () => { K.box(M.steel, 0.2, 0.5, 0.2, 0, 0, -0.05, { r: 0.012, col: 0x4a8a7a }); K.cyl(M.steel, 0.05, 0.04, 0.18, 0, 0.02, 0.1, { seg: 12 }); K.cyl(M.chrome, 0.008, 0.008, 0.3, 0, 0.2, 0.1, { seg: 6 }); });
      K.at(1.3, y, 0.3, 0, () => { K.cyl(M.chrome, 0.18, 0.2, 0.02, 0, 0, 0, { seg: 24 }); K.cyl(M.chrome, 0.03, 0.03, 0.1, 0, 0.02, 0, { seg: 10 }); K.cyl(M.ceramic, 0.19, 0.19, 0.012, 0, 0.12, 0, { seg: 24, col: 0xf4f2ea }); K.cyl(M.matte, 0.15, 0.15, 0.06, 0, 0.132, 0, { seg: 24, tl: 4.6, col: 0xc89a54 }); K.cyl(M.satin, 0.146, 0.146, 0.04, 0, 0.14, 0, { seg: 24, tl: 4.55, col: 0x5a1a2c }); K.sph(M.glass, 0.2, 0, 0.13, 0, { seg: 20, seg2: 10, pl: H }); K.sph(M.chrome, 0.018, 0, 0.335, 0, { seg: 8, seg2: 6 }); });
      for (let i = 0; i < 8; i++) K.cyl(M.ceramic, 0.04, 0.034, 0.09, 0.2 + (i % 4) * 0.09, y + (i > 3 ? 0.092 : 0), 0.2, { seg: 12, col: 0xf0ede4 });
      for (let i = 0; i < 6; i++) K.cyl(M.ceramic, 0.125, 0.125, 0.012, 2.2, y + i * 0.013, 0.3, { seg: 20, col: 0xf0ede4 });
      K.at(2.7, y, 0.3, 0, () => { K.box(M.plastic, 0.36, 0.2, 0.34, 0, 0, 0, { r: 0.012, col: 0x2a2a2e }); K.box(M.plastic, 0.3, 0.14, 0.1, 0, 0.2, -0.08, { r: 0.008, rx: -0.3, col: 0x1a1a1c }); K.plane(K.screen(1.6, 'mon'), 0.24, 0.1, 0, 0.275, -0.02, { rx: -0.3, uv: ATLAS.screens.rect.mon0 }); });
      K.box(M.steel, 6.2, 0.02, 0.26, 0, 1.75 - 0.4, 0.13, { r: 0.004 });
    });
    // customer counter with stools
    K.prop(-0.95, 0, -1.72, 0, () => {
      const len = 6.0; K.box(M.satin, len, 0.12, 0.5, 0, 0, -0.04, { r: 0.004, col: 0x1a1a1c }); K.box(M.satin, len, 0.9, 0.56, 0, 0.12, -0.04, { r: 0.006, col: 0xf0ead8 });
      for (let i = 0; i < 3; i++) K.box(M.chrome, len + 0.004, 0.025, 0.006, 0, 0.3 + i * 0.26, 0.243, { r: 0.002 });
      K.box(M.lino, len + 0.1, 0.04, 0.8, 0, 1.02, 0.02, { r: 0.006, col: 0xe8e2d2, uvo: [0, 0, 0] }); K.box(M.chrome, len + 0.11, 0.045, 0.81, 0, 1.0175, 0.02, { r: 0.016 });
      K.cyl(M.chrome, 0.018, 0.018, len - 0.2, 0, 0.2, 0.36, { rz: H, c: true, seg: 8 }); for (let i = 0; i < 6; i++) K.cyl(M.chrome, 0.01, 0.01, 0.14, -len / 2 + 0.3 + i * (len - 0.6) / 5, 0.2, 0.3, { rx: H, c: true, seg: 6 });
      const y = 1.06;
      for (const x of [-2.2, -0.2, 1.8]) { K.box(M.chrome, 0.1, 0.13, 0.09, x, y, 0.05, { r: 0.008 }); P.bottle(K, x + 0.14, y, 0.03, { kind: 'squeeze', col: 0xb81c1c }); P.bottle(K, x + 0.22, y, 0.05, { kind: 'squeeze', col: 0xe0b020 }); K.cyl(M.glassTint, 0.022, 0.026, 0.09, x - 0.13, y, 0.04, { seg: 10, col: 0xf4f4f4 }); }
      P.plate(K, -1.3, y, 0.18, { food: 'pie' }); P.mug(K, -1.05, y, 0.22, { ry: 1 }); P.plate(K, 0.7, y, 0.2, { food: 'eggs' }); P.mug(K, 0.98, y, 0.16, { ry: 4 }); P.glass(K, 0.5, y, 0.08, { fill: 0.6, col: 0xe8a020 }); K.plane(M.signs, 0.3, 0.22, -2.7, y + 0.002, 0.2, { up: true, uv: ATLAS.signs.rect.news, ry: 0.2 });
    }, { pad: 0.02 });
    for (let i = 0; i < 7; i++) K.prop(-3.55 + i * 0.86, 0, -1.02, 0, () => stool(K, { col: red }), { pad: 0 });
    for (const x of [-3.0, -1.3, 0.4, 2.0]) K.at(x - 0.95 + 0.9, h, -1.5, 0, () => P.pendant(K, { kind: 'metal', drop: 0.85, on, col: 0xa8231f, r: 0.16, k: 1.2 }));
    // booths under the windows
    const foods = [['burger', 'eggs', null, null], ['pie', null, 'burger', null], [null, 'eggs', null, 'burger']];
    [-3.3, -1.3, 0.7].forEach((x, i) => K.prop(x, 0, d / 2, PI, () => booth(K, { col: red, food: foods[i] })));
    // east end: a four-top, the jukebox
    K.prop(3.0, 0, -1.3, 0.1, () => { P.table(K, { w: 0.8, d: 0.8, col: 0x2a2a2c, top: 0xe8e2d2 }); P.bottle(K, 0, 0.75, 0, { kind: 'squeeze', col: 0xb81c1c }); K.box(M.chrome, 0.1, 0.13, 0.09, 0.12, 0.75, 0.05, { r: 0.008 }); });
    K.prop(3.0, 0, -2.0, 0.1, () => P.chair(K, { metal: true, seatCol: red })); K.prop(3.7, 0, -1.25, -H + 0.1, () => P.chair(K, { metal: true, seatCol: red }));
    K.at(2.15, 0.21, -0.75, 2.2, () => P.chair(K, { metal: true, seatCol: red }), 0, H); K.collide(0.95, 0.45, 0.6, 2.2, 0, -0.75);
    K.prop(w / 2 - 0.02, 0, 0.6, -H, () => { K.box(M.woodGloss, 0.8, 1.0, 0.55, 0, 0, 0.275, { r: 0.03, col: C.mahog }); K.cyl(M.woodGloss, 0.4, 0.4, 0.55, 0, 1.0, 0.275, { rx: H, c: true, seg: 24, tl: PI, t0: -H, col: C.mahog }); K.plane(K.screen(2.2, 'juke'), 0.62, 0.42, 0, 1.02, 0.556, { uv: ATLAS.screens.rect.juke }); for (const s of [-1, 1]) K.box(K.emit(0xffb040, 3, { key: 'jk' }), 0.04, 0.9, 0.02, s * 0.36, 0.08, 0.545, { r: 0.01 }); K.box(M.chrome, 0.5, 0.3, 0.02, 0, 0.4, 0.552, { r: 0.006 }); });
    // walls
    K.onWall('W', -1.2, () => { P.picture(K, 0, 1.75, { w: 0.6, h: 0.45, pic: 'land1', col: 0x1a1a1c }); P.picture(K, 0.9, 1.8, { w: 0.4, h: 0.5, pic: 'portrait2', col: 0x1a1a1c }); P.picture(K, -0.85, 1.72, { w: 0.4, h: 0.4, pic: 'portrait5', col: 0x1a1a1c }); P.clock(K, 0, 2.45, { r: 0.17, col: 0xb8bcc0, hour: K.night ? 11.4 : 1.2 }); });
    K.onWall('W', 1.6, () => { for (let i = 0; i < 4; i++) { K.cyl(M.chrome, 0.008, 0.008, 0.07, -0.4 + i * 0.27, 1.7, 0.035, { rx: H, c: true, seg: 6 }); K.sph(M.chrome, 0.014, -0.4 + i * 0.27, 1.7, 0.075, { seg: 8, seg2: 6 }); } K.box(M.wood, 1.1, 0.08, 0.02, 0, 1.66, 0.01, { r: 0.006, col: C.darkWood }); K.drape(M.curtain, [[0.75, 0.04], [1.5, 0.045], [1.7, 0.07], [1.5, 0.09], [0.9, 0.1]], 0.4, -0.13, 0, 0, { col: 0x3a4a3a, wrinkle: 0.025, seg: 16, flare: -0.08 }); });
    K.onWall('E', -1.6, () => { P.picture(K, 0, 1.8, { w: 0.7, h: 0.5, pic: 'land0', col: 0x1a1a1c }); });
    K.onWall('E', 2.4, () => { P.picture(K, 0, 1.75, { w: 0.4, h: 0.5, pic: 'cert', col: 0x1a1a1c, mount: 0.02 }); });
    K.onWall('S', 2.35, () => { K.plane(M.signs, 0.14, 0.21, 0, 1.55, 0.003, { uv: ATLAS.signs.rect.fireext }); });
    // the story: breakfast on the floor
    K.at(1.2, 0, 1.45, 0.3, () => { K.lathe(M.ceramic, [[0.001, 0], [0.075, 0], [0.083, 0.006], [0.125, 0.02], [0.125, 0.024], [0.08, 0.012], [0.001, 0.008]], 0, 0.012, 0, { seg: 24, col: 0xf2f0ea, rx: 0.12 }); for (let i = 0; i < 8; i++) K.box(M.matte, 0.008, 0.008, 0.06, 0.1 + r() * 0.25, 0.004, (r() - 0.5) * 0.3, { r: 0.002, ry: r() * 3, col: 0xdcae3a }); });
    K.at(-0.6, 0, 1.45, 0.7, () => P.mug(K, 0, 0, 0, { tipped: true })); K.stain('coffee', 0.7, 0.5, -0.45, 1.55); K.box(M.steel, 0.012, 0.003, 0.19, 1.6, 0.001, 1.25, { r: 0.001, ry: 1.1 });
    // ceiling globes
    const gl = []; for (const x of [-3.2, -0.2, 2.8]) for (const z of [0.5, 2.2]) gl.push(K.at(x, h, z, 0, () => P.pendant(K, { kind: 'globe', drop: 0.35, on, r: 0.15, warm: 0xffe6c4, k: 2.0 })));
    K.at(0, h, 0, 0, () => { for (const [x, z] of [[-2, 1.4], [1.6, 1.3]]) { K.cyl(M.metal, 0.06, 0.08, 0.12, x, -0.12, z, { col: 0xb8bcc0, seg: 12 }); for (let i = 0; i < 4; i++) K.box(M.wood, 0.62, 0.012, 0.13, x + Math.cos(i * H + 0.3) * 0.36, -0.14, z + Math.sin(i * H + 0.3) * 0.36, { r: 0.004, ry: -(i * H + 0.3), rx: 0.15, col: C.walnut }); } });
    // a lunch service's worth: napkins and straw papers, the wet-floor sign by the kitchen door, coats by the entrance, grease haze over the pass
    K.scatter(9, [-4.2, -0.9, 4.2, 2.2], 0.03, i => i % 3 ? K.box(M.matte, 0.09 + K.rng() * 0.04, 0.002, 0.09, 0, 0.002, 0, { r: 0, col: 0xf4f2ea, rx: (K.rng() - 0.5) * 0.1 }) : K.box(M.matte, 0.12, 0.003, 0.008, 0, 0.002, 0, { r: 0.001, col: 0xf6f4ee }), { under: true });
    K.drop([[2.75, -2.55], [3.9, -2.4], [2.4, -2.2]], 0.22, () => { K.collide(0.32, 0.62, 0.26); K.ao(0.5, 0.45, 0, 0.017, 0, { k: 0.35 }); for (const sg of [-1, 1]) K.box(M.plastic, 0.3, 0.62, 0.012, 0, 0, sg * 0.1, { r: 0.006, rx: -sg * 0.3, col: 0xf2c100 }); K.plane(M.signs, 0.2, 0.2, 0, 0.36, 0.118, { rx: -0.3, uv: ATLAS.signs.rect.danger }); }, 0.3);
    K.onWall('E', 2.4, () => { K.box(M.wood, 0.9, 0.08, 0.02, 0, 1.72, 0.01, { r: 0.005, col: C.darkWood }); [[-0.3, 0x3a3a3e, 0.95], [0, 0x6a2a2a, 0.75], [0.3, 0x4a5a3a, 0.85]].forEach(([x, c, l]) => P.coat(K, x, 1.74, { col: c, len: l, w: 0.44 })); });
    K.onWall('N', -1.2, () => K.grime('smudge', 2.4, 0.5, 0, 2.55, 0.0046, { col: 0x8a7a58 })); K.grime('smudge', 5.6, 0.5, -0.95, 0.0064, -1.3, { up: true, col: 0x4a4640 }); K.grime('wear', 2.2, 1.4, 3.2, 0.0066, 1.6, { up: true, col: 0x8a8880 });
    for (const [x, z] of [[-2.0, 0.6], [1.6, 0.6], [3.4, -0.6]]) K.at(x, h, z, 0, () => P.smokeAlarm(K));
    K.hemi(0xdfe6ea, 0x8a8a86, K.day ? 0.24 : 0.09);
    K.spot(-0.2, h - 0.5, 0.5, 0.3, 0, 0.45, { col: 0xffe8cc, int: K.day ? 9 : 20, angle: 1.3, pen: 0.6, shadow: !K.day || K.rain, near: 0.2 });
    K.point(-3.2, h - 0.6, 1.3, { col: 0xffe8cc, int: K.day ? 3 : 8 }); K.point(2.8, h - 0.6, 1.3, { col: 0xffe8cc, int: K.day ? 3 : 8 }); K.point(-1.0, 2.0, -1.5, { col: 0xffdcb8, int: K.day ? 2 : 6 });
    K.point(-1.3, 1.9, d / 2 - 0.5, { col: 0xff4a9a, int: K.day ? 0.6 : 2.4, dist: 5 }); if (K.night || K.rain) K.point(-1.2, 1.5, -d / 2 + 0.2, { col: 0xffd0a0, int: 1.6, dist: 3.5 });
    if (K.day && !K.rain) K.sun(8, 38, SUN, 6.2); else if (K.dusk) K.sun(20, 10, DUSKSUN, 2.2, { soft: 3 });
    K.spots({ floor: [0.3, 0.45, H], seat: [-1.3 + 0.62, 0.43, d / 2 - 0.62, -H], side: 1, by: [[2.0, 0.6], [-1.4, -0.35]], cam: [1.5, 1.35, -0.55], target: [0.05, 0.25, 0.55], seatView: { cam: [-1.9, 1.3, 0.9], target: [-0.9, 0.8, 2.5], partner: [-1.3, 0, 1.55], kit: [-0.4, 0, 1.6] } });
    return { exposure: K.day ? 0.95 : 1.05, bloom: 0.1, envInt: K.day ? 0.9 : 0.7, envPos: [0.2, 1.4, 0.4] };
  },

  gym(K) {
    const w = 10, d = 8, h = 3.5, r = K.rng;
    const Fr = K.room({ w, d, h, wallCol: 0xd4d7d9, dado: { h: 1.25, col: 0x383c42, rail: true, railCol: 0xa8231f }, floorMat: M.rubber, ceilCol: 0x16171a, ceilMat: M.matte, skirt: 0.12, skirtCol: 0x1a1a1c, wear: 0.8, wearCol: 0x9a9a9a, openings: [
      { id: 'w0', wall: 'S', at: -3, w: 2.4, y0: 2.25, y1: 3.05 }, { id: 'w1', wall: 'S', at: 0, w: 2.4, y0: 2.25, y1: 3.05 }, { id: 'w2', wall: 'S', at: 3, w: 2.4, y0: 2.25, y1: 3.05 }, { id: 'door', wall: 'W', at: 2.9, w: 1.0, y1: 2.1 }] });
    ['w0', 'w1', 'w2'].forEach(id => K.window(Fr[id], { cols: 3, frameCol: 0x2a2a2e, frameMat: M.metal, sill: false }));
    K.door(Fr.door, { open: 0, style: 'glazed', col: 0x2a2a2e, mat: M.metal, handle: 'bar', frameCol: 0x2a2a2e, kick: true });
    K.onWall('W', 2.9, () => { K.box(M.plastic, 0.34, 0.16, 0.04, 0, 2.22, 0.02, { r: 0.006, col: 0xe8e8e4 }); K.plane(K.screen(2.2, 'exit'), 0.3, 0.13, 0, 2.3, 0.041, { uv: ATLAS.screens.rect.exit }); });
    // mirror wall (north) with the dumbbell racks in front of it
    K.onWall('N', 0, () => { K.mirror(8.4, 2.0, 0, 1.35, 0.012, { res: 2048 }); for (let i = 0; i <= 7; i++) K.box(M.metal, 0.006, 2.0, 0.006, -4.2 + i * 1.2, 0.35, 0.016, { r: 0, col: 0x2a2a2e }); K.box(M.metal, 8.44, 0.03, 0.02, 0, 0.32, 0.012, { r: 0.004, col: 0x8a8d90 }); K.box(M.metal, 8.44, 0.03, 0.02, 0, 2.35, 0.012, { r: 0.004, col: 0x8a8d90 }); });
    K.prop(-2.3, 0, -d / 2 + 0.08, 0, () => dumbbellRack(K, { len: 2.3, from: 0 })); K.prop(0.4, 0, -d / 2 + 0.08, 0, () => dumbbellRack(K, { len: 2.3, from: 10 }));
    K.prop(-3.1, 0, -1.9, 0.05, () => bench(K, {})); K.prop(-1.2, 0, -2.0, -0.04, () => bench(K, { incline: 0.6 })); K.prop(0.9, 0, -1.95, 0.02, () => bench(K, {}));
    dumbbell(K, -2.6, 0, -1.6, 0.5, { ry: 0.4 }); dumbbell(K, -2.75, 0, -2.3, 0.5, { ry: 1.3 }); dumbbell(K, 1.5, 0, -1.7, 0.8, { ry: 2.0 }); dumbbell(K, 1.45, 0, -2.2, 0.8, { ry: 1.6 });
    // power rack, plate tree and lifting platform on the east side
    K.prop(3.7, 0, -1.6, -H, () => { powerRack(K); barbell(K, 0, 1.45, 0.69, { plates: [0xb02020, 0x1a1a1c] }); K.at(0, 0, 0.1, H, () => bench(K, {})); });
    K.prop(4.5, 0, 0.35, 0, () => { K.box(M.metal, 0.5, 0.04, 0.5, 0, 0, 0, { r: 0.006, col: 0x1c1c20 }); K.box(M.metal, 0.06, 1.3, 0.06, 0, 0, 0, { r: 0.006, col: 0x1c1c20 }); [0.3, 0.62, 0.94].forEach((y, i) => { for (const s of [-1, 1]) { K.cyl(M.chrome, 0.022, 0.022, 0.2, s * 0.13, y, 0, { rz: H, c: true, seg: 8 }); for (let j = 0; j < 2; j++) plate(K, s * (0.08 + j * 0.045), y, 0, [0.225, 0.19, 0.15][i], 0.04, [0x2040a0, 0xe0b020, 0x2a8a3a][i]); } }); });
    K.prop(3.1, 0, 2.2, 0, () => { K.box(M.rubberBlack, 2.6, 0.03, 1.3, 0, 0, 0, { r: 0.004, col: 0x151517 }); K.box(M.planks, 1.2, 0.006, 1.3, 0, 0.03, 0, { r: 0, col: 0xe0c8a0, swap: true }); barbell(K, 0, 0.225 + 0.03, 0.1, { plates: [0xb02020, 0xb02020] }); K.lathe(M.plastic, [[0.001, 0], [0.11, 0], [0.13, 0.12], [0.125, 0.12], [0.1, 0.01]], -1.05, 0.03, -0.45, { col: 0x2a2a2e, seg: 14 }); K.cyl(M.matte, 0.1, 0.1, 0.02, -1.05, 0.11, -0.45, { col: 0xf0f0ec, seg: 12 }); }, { pad: 0 });
    // south wall: kettlebells, medicine balls, rolled mats; cardio screens
    K.prop(-3.4, 0, d / 2 - 0.05, PI, () => { K.box(M.metal, 1.8, 0.03, 0.4, 0, 0.3, 0.22, { r: 0.004, col: 0x2a2a2e }); K.box(M.metal, 1.8, 0.03, 0.4, 0, 0.02, 0.22, { r: 0.004, col: 0x2a2a2e }); for (const s of [-1, 1]) K.box(M.metal, 0.04, 0.36, 0.4, s * 0.88, 0, 0.22, { r: 0.004, col: 0x2a2a2e });
      for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) { const s = 0.07 + (i + j * 6) * 0.006, x = -0.75 + i * 0.3, y = j ? 0.33 : 0.05; K.sph(M.metal, s, x, y + s * 0.92, 0.22, { col: [0x1a1a1c, 0x24508c, 0xa8231f, 0x1a1a1c, 0xe0b020, 0x1a1a1c][i], seg: 14, seg2: 10 }); K.torus(M.metal, s * 0.55, s * 0.16, x, y + s * 1.85, 0.22, { col: 0x1a1a1c, seg: 14, rs: 6 }); } });
    K.prop(-0.9, 0, d / 2 - 0.05, PI, () => { for (const s of [-1, 1]) K.box(M.metal, 0.04, 1.5, 0.04, s * 0.2, 0, 0.2, { r: 0.004, col: 0x2a2a2e }); for (let i = 0; i < 4; i++) { K.box(M.metal, 0.44, 0.02, 0.3, 0, 0.12 + i * 0.37, 0.2, { r: 0.004, col: 0x2a2a2e }); K.sph(M.rubberBlack, 0.15 + i * 0.006, 0, 0.29 + i * 0.37, 0.2, { col: [0xa8231f, 0x24508c, 0x2f6b46, 0xe0b020][i], seg: 18, seg2: 12 }); } });
    K.prop(0.6, 0, d / 2 - 0.3, 0, () => { for (let i = 0; i < 5; i++) K.cyl(M.rubberBlack, 0.085, 0.085, 0.62, (i % 3) * 0.18 - 0.18, i > 2 ? 0.15 : 0, i > 2 ? 0.02 : 0, { col: [0x5a3a8a, 0x24508c, 0x2f6b46, 0x5a3a8a, 0x3a3a3e][i], seg: 14 }); K.collide(0.6, 0.8, 0.3); }, { collide: false });
    K.onWall('E', 2.2, () => K.at(0, 2.1, 0, 0, () => P.tv(K, { w: 1.2, wall: true, rect: 'tv1', k: 2.0 })));
    // west wall: AED cabinet, fountain, cleaning station, posters
    K.onWall('W', 0.9, () => { K.box(M.satin, 0.4, 0.42, 0.18, 0, 1.2, 0.09, { r: 0.008, col: 0xf0f0ec }); K.box(M.glassTint, 0.3, 0.32, 0.004, 0, 1.25, 0.182, { r: 0.001, col: 0xdfe8ea }); K.rbox(M.plastic, 0.24, 0.26, 0.09, 0, 1.28, 0.1, { r: 0.03, col: 0xc8d81a, seg: 2 }); K.plane(K.screen(2.5, 'aed'), 0.1, 0.07, 0, 1.44, 0.147, { uv: ATLAS.screens.rect.aedPanel }); K.box(M.chrome, 0.015, 0.08, 0.02, 0.17, 1.37, 0.19, { r: 0.004 });
      K.plane(M.signs, 0.34, 0.34, 0, 1.92, 0.004, { uv: ATLAS.signs.rect.aed }); K.box(M.satin, 0.012, 0.3, 0.3, 0, 2.12, 0.15, { r: 0.002, col: 0x0c8a4c }); K.plane(M.signs, 0.28, 0.28, 0.0075, 2.27, 0.15, { uv: ATLAS.signs.rect.aed, ry: H }); K.plane(M.signs, 0.28, 0.28, -0.0075, 2.27, 0.15, { uv: ATLAS.signs.rect.aed, ry: -H });
      K.box(K.emit(0xff3a2a, K.night ? 2 : 1, { key: 'strobe' }), 0.06, 0.05, 0.04, 0.14, 1.66, 0.02, { r: 0.01 }); });
    K.onWall('W', -0.6, () => { K.box(M.steel, 0.4, 0.3, 0.34, 0, 0.75, 0.17, { r: 0.02 }); K.box(M.steel, 0.36, 0.02, 0.3, 0, 1.05, 0.17, { r: 0.006 }); K.tube(M.chrome, [[0.1, 1.07, 0.1], [0.1, 1.14, 0.12], [0.06, 1.15, 0.16]], 0.008, { tension: 0.5, seg: 8 }); K.box(M.steel, 0.3, 0.75, 0.2, 0, 0, 0.1, { r: 0.01 }); });
    K.onWall('W', -2.2, () => { P.picture(K, 0, 1.85, { w: 0.6, h: 0.75, pic: 'rerack', atlas: 'signs', mount: 0, col: 0x1a1a1c, f: 0.015 }); P.picture(K, 0.85, 1.85, { w: 0.6, h: 0.75, pic: 'gymrules', atlas: 'signs', mount: 0, col: 0x1a1a1c, f: 0.015 }); K.box(M.satin, 0.28, 0.36, 0.12, -0.85, 1.2, 0.06, { r: 0.012, col: 0xf0f0ec }); K.plane(M.matte, 0.22, 0.08, -0.85, 1.17, 0.07, { col: 0xf6f4ee }); P.bottle(K, -0.85, 0.9, 0.1, { kind: 'spray', col: 0x2a7ab0 }); K.box(M.metal, 0.3, 0.02, 0.16, -0.85, 0.88, 0.08, { r: 0.004, col: 0x8a8d90 }); });
    K.onWall('E', -3.2, () => P.clock(K, 0, 2.7, { r: 0.2, col: 0x1a1a1c, hour: K.night ? 8.7 : 5.6 }));
    K.onWall('E', 0.6, () => P.picture(K, 0, 1.95, { w: 0.6, h: 0.75, pic: 'safety', atlas: 'signs', mount: 0, col: 0x1a1a1c, f: 0.015 }));
    // the story: dropped weights, towel, bottle
    dumbbell(K, 0.75, 0, 0.0, 0.65, { ry: 0.5 }); dumbbell(K, -1.55, 0, 1.45, 0.65, { ry: 2.2 });
    K.at(0.3, 0, 1.75, 0.4, () => K.rbox(M.carpet, 0.5, 0.03, 0.34, 0, 0, 0, { r: 0.012, wrinkle: 0.02, col: 0xe8e4da, seg: 5 })); K.at(0.9, 0, 1.6, 0, () => P.bottle(K, 0, 0.034, 0, { kind: 'spray', col: 0x2a7ab0 }), 0, H);
    K.box(M.plastic, 0.075, 0.009, 0.15, 0.55, 0.031, 1.72, { r: 0.004, ry: 0.5, col: 0x101012 });
    // ceiling: ducts, beams, hanging LED battens
    K.cyl(M.metal, 0.24, 0.24, w - 0.2, 0, h - 0.4, 2.2, { rz: H, c: true, seg: 18, col: 0xb8bcc0 }); for (let i = 0; i < 5; i++) K.cyl(M.metal, 0.25, 0.25, 0.03, -4 + i * 2, h - 0.4, 2.2, { rz: H, c: true, seg: 18, col: 0x9a9da0 });
    for (const x of [-3.3, 0, 3.3]) K.box(M.metal, 0.16, 0.3, d, x, h - 0.3, 0, { r: 0.004, col: 0x222428 });
    const fix = []; for (const z of [-2.7, -0.4, 1.9]) for (const x of [-3.2, 0, 3.2]) { fix.push([x, z]); K.at(x, h - 0.55, z, 0, () => { P.fluoro(K, { len: 1.5, on: true, col: 0xeaf2ff, k: 6, twin: true }); for (const s of [-1, 1]) K.cyl(M.metal, 0.003, 0.003, 0.55, s * 0.6, 0, 0, { seg: 4, col: 0x8a8d90 }); }); }
    // mid-session: bags and bottles against the walls, towels, chalk on the floor, rubber scuffs under the racks
    K.along('S', 2, 0.36, i => { P.gymBag(K, { col: [0x1e2a3a, 0x3a1e22][i], towel: i ? null : 0xd8dce0 }); K.collide(0.6, 0.32, 0.32); }, { lo: -0.9, hi: 0.5 }); K.along('E', 2, 0.36, i => { P.gymBag(K, { col: [0x2a2a2e, 0x1e3a2a][i], towel: i ? 0xb8c8d8 : null }); K.collide(0.6, 0.32, 0.32); });
    K.scatter(4, [-4.5, -3.5, 4.5, 3.6], 0.06, i => P.sportBottle(K, 0, 0, 0, { col: [0x2a7ab0, 0xc0392b, 0x2a2a2e, 0x3a8a4a][i], tipped: i === 2 }));
    K.scatter(3, [-3.5, -2.5, 3.5, 3.0], 0.22, i => { K.rumple(M.curtain, 0.8, 0.5, 0.07, 0, 0, 0, { col: [0xdfe4e8, 0x9ab0c8, 0xe8e2d4][i] }); K.ao(0.8, 0.6, 0, 0.003, 0, { k: 0.3 }); });
    for (let i = 0; i < 5; i++) K.grime('wear', 0.6 + r() * 0.8, 0.5 + r() * 0.5, -3.5 + r() * 7, 0.0064 + i * 0.0002, -3 + r() * 6, { up: true, ry: r() * 6, col: 0xe8e8e4 });
    for (let i = 0; i < 8; i++) K.grime('scuff', 0.5 + r() * 0.6, 0.2 + r() * 0.2, -4 + r() * 8, 0.0076 + i * 0.0002, -3.2 + r() * 6.4, { up: true, ry: r() * 6 });
    K.hemi(0xdfe8f2, 0x3a3c40, K.day ? 0.22 : 0.14);
    K.spot(0, h - 0.7, -0.4, -0.4, 0, 0.5, { col: COOL, int: 38, angle: 1.25, pen: 0.6, shadow: true, near: 0.2, far: 12 });
    K.point(-3.2, h - 0.8, -1.5, { col: COOL, int: 14 }); K.point(3.2, h - 0.8, -1.5, { col: COOL, int: 14 }); K.point(-3.2, h - 0.8, 2.0, { col: COOL, int: 12 }); K.point(3.2, h - 0.8, 2.0, { col: COOL, int: 12 });
    if (K.day && !K.rain) K.sun(4, 44, SUN, 4.5); else if (K.dusk) K.sun(18, 12, DUSKSUN, 2.0, { soft: 3 });
    K.spots({ floor: [-0.5, 0.75, H], seat: [0.9, 0.5, -1.95, 0.02], side: 1, by: [[1.6, 0.9], [-1.2, -0.6]], cam: [0.9, 1.4, -0.75], target: [-0.6, 0.25, 0.75], seatView: { cam: [1.6, 1.3, -0.6], target: [0.9, 0.8, -1.9], partner: [0.3, 0, -1.3], kit: [1.6, 0, -1.4] } });
    return { exposure: 0.92, bloom: 0.08, envInt: 0.85, envPos: [0, 1.5, 0.5] };
  },
};

// short gathered cafe curtain
function curtainStrip(K, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 80, 2), p = g.attributes.position.array, ph = K.rng() * 6;
  for (let i = 0; i < p.length; i += 3) { const u = p[i] / w + 0.5; p[i + 2] = Math.sin(u * 18 * TAU + ph) * 0.012 + Math.sin(u * 5 * TAU) * 0.006; }
  g.computeVertexNormals(); return g;
}
