// Interior sets: shared furniture and clutter. Every function builds at the Kit's current transform.
// Conventions: front faces local +Z. Wall-backed pieces (sofa, shelves, cabinets, beds, appliances) have their origin
// at the back-centre on the floor; free-standing pieces (tables, chairs, lamps) at the centre of their footprint.
// Functions that light up take `on` and return the world position for a light where useful.

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade, mixc } from './sets-kit.js';

const PI = Math.PI, H = PI / 2;
export const BOOKS = [0x7a2a2a, 0x2a4a6a, 0x3a5a3a, 0xc8b890, 0x1e1e22, 0xa87a3a, 0x5a3a5a, 0xd8d4c8, 0x8a3a1a, 0x2a2a4a, 0x4a6a6a, 0xb04a3a, 0xe0c060, 0x6a6a6a];
export const P = {};

// lampshade material: glows when on
P.shadeMat = (K, on, col = 0xeadfc8, warm = 0xffb070, k = 1.1) => on ? K.emit(warm, k, { base: 0x000000, double: true, key: 'shade' + col, rough: 1 }) : K.emit(0x000000, 0, { base: col, double: true, key: 'shadeOff' + col });
P.bulb = (K, on, x, y, z, r = 0.028, col = 0xffd9a8) => K.sph(on ? K.emit(col, 14, { key: 'bulb' }) : M.ceramic, r, x, y, z, { seg: 10, seg2: 8, col: 0xf4f0e8 });

P.sofa = (K, { w = 2.0, col = 0x6c7683, seats = 3, leather = false, throws = [0xb8873a, 0xd8d2c4], d = 0.92 } = {}) => {
  const mat = leather ? M.leather : M.fabric, aw = 0.2, sw = w - 2 * aw, r = K.rng;
  for (const sx of [-1, 1]) for (const z of [0.08, d - 0.08]) K.cyl(M.wood, 0.024, 0.018, 0.07, sx * (w / 2 - 0.09), 0, z, { col: C.darkWood, seg: 8 });
  K.rbox(mat, w, 0.25, d - 0.04, 0, 0.07, d / 2, { r: 0.035, col });
  K.rbox(mat, w - 0.04, 0.6, 0.2, 0, 0.28, 0.115, { r: 0.07, col, rx: -0.1 });
  for (const s of [-1, 1]) K.rbox(mat, aw, 0.36, d - 0.02, s * (w / 2 - aw / 2), 0.28, d / 2, { r: 0.085, col, seg: 4 });
  for (let i = 0; i < seats; i++) {
    const x = -sw / 2 + (i + 0.5) * sw / seats, c = shade(col, 0.97 + r() * 0.06);
    K.rbox(mat, sw / seats - 0.012, 0.16, 0.62, x, 0.31, 0.55, { r: 0.055, puff: 0.018, col: c, seg: 4, ry: (r() - 0.5) * 0.02 });
    K.rbox(mat, sw / seats - 0.03, 0.42, 0.17, x, 0.46, 0.29, { r: 0.075, puff: 0.03, col: c, rx: -0.22 + (r() - 0.5) * 0.06, seg: 4 });
  }
  throws.forEach((tc, i) => { const s = i ? 1 : -1; K.rbox(M.fabric, 0.42, 0.42, 0.13, s * (sw / 2 - 0.2), 0.48, 0.44, { r: 0.06, puff: 0.05, col: tc, rx: -0.42, ry: s * 0.25, rz: (r() - 0.5) * 0.3, seg: 4 }); });
  return { seat: [0, 0.47, 0.56], seatW: sw };
};

P.coffeeTable = (K, { w = 1.1, d = 0.58, h = 0.42, col = C.oak, items = true } = {}) => {
  K.box(M.wood, w, 0.034, d, 0, h - 0.034, 0, { r: 0.008, col });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M.wood, 0.05, h - 0.034, 0.05, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), { r: 0.006, col });
  K.box(M.wood, w - 0.14, 0.02, d - 0.14, 0, 0.12, 0, { r: 0.004, col });
  for (const sz of [-1, 1]) K.box(M.wood, w - 0.17, 0.05, 0.018, 0, h - 0.084, sz * (d / 2 - 0.06), { r: 0.003, col });
  if (items) {
    const r = K.rng; let y = h;
    for (let i = 0; i < 3; i++) { K.box(M.satin, 0.21, 0.006 + r() * 0.006, 0.28, -w * 0.26 + r() * 0.02, y, 0.02, { r: 0.002, ry: (r() - 0.5) * 0.5, col: [0xd8d4c8, 0x7a2a2a, 0x2a4a6a][i] }); y += 0.009; }
    K.plane(M.pics, 0.2, 0.27, -w * 0.26, y + 0.004, 0.02, { up: true, uv: ATLAS.pics.rect.land1, ry: 0.2 });
    K.box(M.plastic, 0.045, 0.018, 0.17, w * 0.12, h, -0.08, { r: 0.007, ry: 0.5, col: 0x18181a });
    K.box(M.plastic, 0.04, 0.016, 0.15, w * 0.2, h, 0.03, { r: 0.007, ry: -0.3, col: 0x2a2a2e });
    P.mug(K, w * 0.32, h, 0.12, { col: 0x2f5d8a, ry: 1 }); K.cyl(M.cork, 0.05, 0.05, 0.004, w * 0.32, h, 0.12, { seg: 14 });
    K.box(M.satin, 0.2, 0.012, 0.13, 0.05, 0.14, 0.05, { r: 0.002, ry: 0.1, col: 0x3a5a3a }); K.plane(M.signs, 0.3, 0.22, -0.2, 0.146, 0, { up: true, uv: ATLAS.signs.rect.news, ry: -0.15 });
  }
};

P.sideTable = (K, { w = 0.45, h = 0.52, col = C.oak, round = false } = {}) => {
  if (round) { K.cyl(M.wood, w / 2, w / 2, 0.025, 0, h - 0.025, 0, { col, seg: 28 }); K.cyl(M.wood, 0.025, 0.03, h - 0.045, 0, 0.02, 0, { col, seg: 10 }); K.cyl(M.wood, w * 0.32, w * 0.34, 0.02, 0, 0, 0, { col, seg: 20 }); return; }
  K.box(M.wood, w, 0.025, w, 0, h - 0.025, 0, { r: 0.006, col });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M.wood, 0.035, h - 0.025, 0.035, sx * (w / 2 - 0.04), 0, sz * (w / 2 - 0.04), { r: 0.004, col });
  K.box(M.wood, w - 0.09, 0.09, w - 0.09, 0, h - 0.115, 0, { r: 0.003, col }); K.sph(M.brass, 0.012, 0, h - 0.07, w / 2 - 0.035, { seg: 8, seg2: 6 });
};

P.mug = (K, x, y, z, { col = 0xf0ede4, ry = 0, tipped = false, full = true } = {}) => {
  K.push(x, y + (tipped ? 0.04 : 0), z, ry, 0, tipped ? H : 0);
  K.lathe(M.ceramic, [[0.001, 0], [0.034, 0], [0.04, 0.008], [0.04, 0.092], [0.037, 0.095], [0.035, 0.09], [0.034, 0.012], [0.001, 0.01]], 0, 0, 0, { col, seg: 16 });
  K.torus(M.ceramic, 0.024, 0.006, 0.052, 0.05, 0, { col, seg: 12, rs: 6 });
  if (full && !tipped) K.cyl(M.gloss, 0.034, 0.034, 0.002, 0, 0.075, 0, { col: 0x2a1608, seg: 14 });
  K.pop();
};

P.bookshelf = (K, { w = 0.9, h = 1.9, d = 0.3, shelves = 5, col = C.oak, fill = 0.9, backCol } = {}) => {
  const r = K.rng, t = 0.02;
  for (const s of [-1, 1]) K.box(M.wood, t, h, d, s * (w / 2 - t / 2), 0, d / 2, { r: 0.003, col });
  K.box(M.wood, w, t, d, 0, h - t, d / 2, { r: 0.003, col }); K.box(M.wood, w - 2 * t, 0.07, d - 0.02, 0, 0, d / 2 - 0.01, { r: 0.002, col });
  K.box(M.wood, w - 0.01, h - 0.01, 0.006, 0, 0, 0.004, { r: 0, col: backCol ?? shade(col, 0.8) });
  const gap = (h - 0.07 - t) / shelves;
  for (let i = 0; i < shelves; i++) {
    const sy = 0.07 + i * gap; K.box(M.wood, w - 2 * t, t, d - 0.012, 0, sy, d / 2, { r: 0.002, col });
    let x = -w / 2 + t + 0.01; const top = sy + t, x1 = w / 2 - t - 0.01;
    while (x < x1 - 0.03) {
      const q = r();
      if (q > fill) { x += 0.05 + r() * 0.12; continue; }
      if (q < 0.07 && x1 - x > 0.2) { // ornament
        const k = r.i(0, 2);
        if (k === 0) K.lathe(M.ceramic, [[0.001, 0], [0.04, 0], [0.055, 0.06], [0.03, 0.13], [0.025, 0.16], [0.035, 0.18]], x + 0.07, top, d * 0.55, { col: r.pick([0x2f5d8a, 0xe8e4d8, 0x7a8a5a, 0xb5603c]), seg: 14 });
        else if (k === 1) K.at(x + 0.08, top, d * 0.6, (r() - 0.5) * 0.5, () => P.standFrame(K, { pic: 'portrait' + r.i(0, 5) }));
        else { let yy = top; for (let j = 0; j < 3; j++) { const bh = 0.02 + r() * 0.025; K.box(M.satin, 0.19 + r() * 0.05, bh, 0.14, x + 0.11, yy, d * 0.55, { r: 0.002, ry: (r() - 0.5) * 0.3, col: r.pick(BOOKS) }); yy += bh; } }
        x += 0.2; continue;
      }
      const n = r.i(3, 9), bhBase = Math.min(gap - t - 0.03, 0.2 + r() * 0.08);
      for (let j = 0; j < n && x < x1 - 0.02; j++) {
        const bw = 0.016 + r() * 0.03, bh = bhBase - r() * 0.05, bd = Math.min(d - 0.05, 0.13 + r() * 0.06), lean = j === n - 1 && r.chance(0.4) ? 0.16 : 0;
        K.box(M.satin, bw, bh, bd, x + bw / 2 + lean * bh * 0.5, top, d - 0.03 - bd / 2, { r: 0.002, rz: -lean, col: shade(r.pick(BOOKS), 0.7 + r() * 0.6) });
        x += bw + 0.001 + lean * bh;
      }
    }
  }
};

// small standing photo frame (origin at base centre, faces +Z)
P.standFrame = (K, { w = 0.13, h = 0.17, pic = 'portrait0', col = 0x2a2420, metal = false } = {}) => {
  K.push(0, 0, 0, 0, -0.16);
  K.box(metal ? M.chrome : M.satin, w, h, 0.012, 0, 0, 0, { r: 0.004, col });
  K.plane(M.pics, w - 0.03, h - 0.03, 0, h / 2, 0.0068, { uv: ATLAS.pics.rect[pic] });
  K.box(M.matte, 0.03, h * 0.7, 0.004, 0, 0.005, -0.03, { r: 0, rx: 0.5, col: 0x1a1a1a });
  K.pop();
};

// framed picture on a wall: call inside K.onWall(...); centre at (x, y), z = 0 is the wall
P.picture = (K, x, y, { w = 0.5, h = 0.4, pic = 'land0', col = 0x2a2420, mount = 0.045, f = 0.022, mat = M.satin, atlas = 'pics', tilt = 0 } = {}) => {
  K.push(x, y, 0, 0, 0, tilt);
  K.box(mat, w + 2 * f, f, 0.022, 0, h / 2, 0.011, { r: 0.004, col }); K.box(mat, w + 2 * f, f, 0.022, 0, -h / 2 - f, 0.011, { r: 0.004, col });
  for (const s of [-1, 1]) K.box(mat, f, h, 0.022, s * (w / 2 + f / 2), -h / 2, 0.011, { r: 0.004, col });
  K.plane(M.matte, w, h, 0, 0, 0.008, { col: 0xf0ece0 });
  K.plane(atlas === 'pics' ? M.pics : M.signs, w - mount * 2, h - mount * 2, 0, 0, 0.0095, { uv: ATLAS[atlas].rect[pic] });
  K.pop();
};

P.tv = (K, { w = 1.1, on = true, k = 2.2, rect = 'tv0', wall = false } = {}) => {
  const h = w * 0.5625, y0 = wall ? 0 : 0.075;
  K.box(M.plastic, w + 0.02, h + 0.02, 0.035, 0, y0, wall ? 0.03 : 0, { r: 0.006, col: 0x0c0c0e });
  const sm = K.screen(on ? k : 0, 'tv'); K.plane(sm, w, h, 0, y0 + h / 2 + 0.01, (wall ? 0.03 : 0) + 0.0185, { uv: ATLAS.screens.rect[rect] });
  if (!wall) { K.box(M.plastic, 0.07, 0.07, 0.03, 0, 0.012, -0.01, { r: 0.004, col: 0x101012 }); K.box(M.plastic, 0.46, 0.012, 0.22, 0, 0, 0, { r: 0.005, col: 0x101012 }); }
  K.box(K.emit(on ? 0x40ff60 : 0xff2a1a, 3, { key: 'led' + on }), 0.006, 0.003, 0.002, w / 2 - 0.05, y0 + 0.006, (wall ? 0.03 : 0) + 0.018, { r: 0 });
  return sm;
};

P.tvUnit = (K, { w = 1.5, h = 0.46, d = 0.42, col = C.oak } = {}) => {
  K.box(M.wood, w, h - 0.06, d, 0, 0.06, d / 2, { r: 0.006, col }); K.box(M.wood, w - 0.08, 0.06, d - 0.08, 0, 0, d / 2, { r: 0.002, col: shade(col, 0.5) });
  K.box(M.wood, w + 0.02, 0.022, d + 0.015, 0, h, d / 2, { r: 0.006, col });
  const n = 3, dw = (w - 0.03) / n;
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.015 + (i + 0.5) * dw; if (i === 1) { K.box(M.matte, dw - 0.006, h - 0.1, 0.01, x, 0.08, d - 0.02, { r: 0, col: 0x0a0a0a }); K.box(M.plastic, dw * 0.7, 0.045, 0.2, x, 0.2, d - 0.14, { r: 0.004, col: 0x151518 }); K.box(K.emit(0x3aa0ff, 4, { key: 'ledb' }), 0.02, 0.004, 0.002, x + 0.08, 0.22, d - 0.039, { r: 0 }); }
    else { K.box(M.wood, dw - 0.006, h - 0.085, 0.018, x, 0.075, d + 0.009, { r: 0.004, col }); K.cyl(M.metal, 0.008, 0.008, 0.1, x + (i ? -1 : 1) * (dw / 2 - 0.04), h * 0.55, d + 0.03, { seg: 8, col: 0x2a2a2a, c: true }); } }
};

P.floorLamp = (K, { on = true, h = 1.55, shadeCol = 0xeadfc8, col = 0x2a2a2c } = {}) => {
  K.cyl(M.metal, 0.13, 0.14, 0.018, 0, 0, 0, { col, seg: 24 }); K.cyl(M.metal, 0.011, 0.011, h - 0.1, 0, 0.018, 0, { col, seg: 8 });
  K.lathe(P.shadeMat(K, on, shadeCol), [[0.21, 0], [0.15, 0.26]], 0, h - 0.3, 0, { seg: 28 });
  K.cyl(M.metal, 0.02, 0.02, 0.06, 0, h - 0.2, 0, { col, seg: 8 }); P.bulb(K, on, 0, h - 0.12, 0);
  return K.world(0, h - 0.14, 0);
};

P.tableLamp = (K, { on = true, baseCol = 0x3d6f7a, shadeCol = 0xeadfc8, s = 1 } = {}) => {
  K.push(0, 0, 0, 0, 0, 0, s);
  K.lathe(M.ceramic, [[0.001, 0], [0.065, 0], [0.068, 0.012], [0.045, 0.03], [0.08, 0.11], [0.072, 0.2], [0.025, 0.26], [0.014, 0.3], [0.014, 0.34]], 0, 0, 0, { col: baseCol, seg: 20 });
  K.lathe(P.shadeMat(K, on, shadeCol), [[0.17, 0], [0.115, 0.2]], 0, 0.3, 0, { seg: 26 }); P.bulb(K, on, 0, 0.4, 0, 0.026);
  const p = K.world(0, 0.4, 0); K.pop(); return p;
};

P.rug = (K, { w = 2.2, d = 1.5, col = 0x8a4a3a, border = 0xd8c8a8, inner } = {}) => {
  K.box(M.carpet, w, 0.011, d, 0, 0, 0, { r: 0.005, col: border });
  K.box(M.carpet, w - 0.24, 0.004, d - 0.24, 0, 0.0095, 0, { r: 0.002, col });
  if (inner) K.box(M.carpet, w - 0.7, 0.003, d - 0.7, 0, 0.012, 0, { r: 0.001, col: inner });
};

// pot plant. kind: 'blade' (snake plant), 'arch' (spider/dracaena)
P.plant = (K, { h = 0.8, kind = 'arch', potCol = C.terracotta, n = 16, pot = 0.14 } = {}) => {
  const r = K.rng, ph = pot * 1.7;
  K.lathe(kind === 'arch' ? M.matte : M.ceramic, [[0.001, 0], [pot * 0.72, 0], [pot, ph], [pot * 1.06, ph + 0.012], [pot * 0.94, ph + 0.012], [pot * 0.9, ph - 0.03], [0.001, ph - 0.03]], 0, 0, 0, { col: potCol, seg: 18 });
  for (let i = 0; i < n; i++) {
    const L = h * (0.55 + r() * 0.45), wd = kind === 'blade' ? 0.07 : 0.045, g = new THREE.PlaneGeometry(wd, L, 2, 6), p = g.attributes.position.array, bend = kind === 'blade' ? 0.08 + r() * 0.1 : 0.5 + r() * 0.6;
    for (let j = 0; j < p.length; j += 3) { const v = p[j + 1] / L + 0.5; p[j] *= Math.pow(Math.sin(PI * (0.12 + 0.88 * (1 - v) * 0.9 + 0.05)), 0.7); p[j + 2] = bend * v * v * L + Math.abs(p[j]) * 0.5; p[j + 1] = (v - bend * 0.35 * v * v * v) * L; }
    g.computeVertexNormals();
    const gr = 0.5 + r() * 0.5; K.geo(M.leaf, g, { x: (r() - 0.5) * pot * 0.8, y: ph - 0.03, z: (r() - 0.5) * pot * 0.8, ry: r() * TAU, rx: kind === 'blade' ? (r() - 0.5) * 0.25 : 0.15 + r() * 0.5, col: [0.05 * gr, 0.2 * gr + 0.03, 0.04 * gr] });
  }
};

// wall clock: call inside K.onWall; second hand animates
P.clock = (K, x, y, { r = 0.15, col = 0x1a1a1c, hour = 2.3 } = {}) => {
  K.cyl(M.plastic, r, r, 0.035, x, y, 0.0175, { rx: H, c: true, col, seg: 32 });
  K.geo(M.signs, new THREE.CircleGeometry(r * 0.92, 32), { x, y, z: 0.036, uv: ATLAS.signs.rect.clock });
  const ha = -hour / 12 * TAU, ma = -(hour % 1) * TAU;
  K.box(M.matte, 0.012, r * 0.5, 0.003, x - Math.sin(ha) * r * 0.22, y + Math.cos(ha) * r * 0.22, 0.039, { r: 0, rz: ha, c: true, col: 0x111111 });
  K.box(M.matte, 0.008, r * 0.75, 0.003, x - Math.sin(ma) * r * 0.33, y + Math.cos(ma) * r * 0.33, 0.042, { r: 0, rz: ma, c: true, col: 0x111111 });
  const g = new THREE.BoxGeometry(0.003, r * 0.8, 0.002); g.translate(0, r * 0.3, 0);
  const hand = K.mesh(new THREE.Mesh(K.own(g), K.emit(0x000000, 0, { base: 0xb02020, key: 'sec' }))); hand.position.set(x, y, 0.045);
  K.on((dt, t) => { hand.rotation.z = -Math.floor(t) / 60 * TAU; });
};

P.radiator = (K, { w = 1.0, h = 0.6, col = 0xf0eee8 } = {}) => {
  K.box(M.satin, w, h, 0.045, 0, 0.14, 0.055, { r: 0.012, col });
  const n = Math.floor(w / 0.034); for (let i = 0; i < n; i++) K.box(M.satin, 0.014, h - 0.07, 0.01, -w / 2 + 0.03 + i * (w - 0.06) / (n - 1), 0.175, 0.082, { r: 0.004, col });
  K.box(M.satin, w + 0.006, 0.02, 0.07, 0, 0.14 + h, 0.045, { r: 0.004, col });
  for (const s of [-1, 1]) { K.cyl(M.chrome, 0.008, 0.008, 0.14, s * (w / 2 - 0.03), 0, 0.055, { seg: 8 }); }
  K.cyl(M.plastic, 0.022, 0.022, 0.07, w / 2 + 0.03, 0.16, 0.055, { rz: H, c: true, col: 0xf4f4f0, seg: 12 });
};

// ---- ceiling fittings: call with the origin on the ceiling (K.at(x, H, z, 0, ...)). Return the lamp's world position.
P.pendant = (K, { drop = 0.5, kind = 'drum', on = true, col = 0xeadfc8, warm = 0xffb878, k = 1.6, r = 0.2 } = {}) => {
  K.cyl(M.plastic, 0.05, 0.045, 0.025, 0, -0.025, 0, { col: 0xf0f0ec, seg: 16 }); K.cyl(M.rubberBlack, 0.003, 0.003, drop, 0, -drop, 0, { seg: 5, col: kind === 'bare' ? 0x1a1a1a : 0xe8e8e4 });
  K.cyl(M.plastic, 0.02, 0.022, 0.05, 0, -drop - 0.05, 0, { col: kind === 'bare' ? 0x1a1a1a : 0xf0f0ec, seg: 10 });
  const by = -drop - 0.09;
  if (kind === 'drum') K.lathe(P.shadeMat(K, on, col, warm, k), [[r, 0], [r, r * 0.95]], 0, -drop - r * 0.95 + 0.02, 0, { seg: 32 });
  else if (kind === 'cone') K.lathe(P.shadeMat(K, on, col, warm, k), [[r * 1.15, 0], [r * 0.25, r * 0.8], [0.03, r * 0.86]], 0, -drop - r * 0.86 + 0.03, 0, { seg: 28 });
  else if (kind === 'metal') { K.lathe(M.metal, [[r * 1.1, 0], [r * 1.12, 0.01], [r * 0.3, r * 0.75], [0.03, r * 0.82]], 0, -drop - r * 0.82 + 0.03, 0, { seg: 28, col }); K.lathe(on ? K.emit(warm, 0.9, { base: 0xf0e8d8, key: 'inner' }) : M.satin, [[0.03, r * 0.8], [r * 0.28, r * 0.73], [r * 1.07, 0.004]], 0, -drop - r * 0.82 + 0.03, 0, { seg: 28, col: 0xf0e8d8 }); }
  else if (kind === 'globe') { K.sph(on ? K.emit(warm, k > 1.9 ? k : 3.2, { base: 0xf8f4ea, key: 'globe' }) : M.ceramic, r, 0, -drop - r - 0.03, 0, { seg: 20, seg2: 14, col: 0xf4f0e6 }); return K.world(0, -drop - r - 0.03, 0); }
  P.bulb(K, on, 0, by, 0, kind === 'bare' ? 0.03 : 0.028);
  return K.world(0, by, 0);
};
P.flush = (K, { r = 0.17, on = true, warm = 0xffe2bc, k = 3 } = {}) => {
  K.cyl(M.satin, r + 0.012, r + 0.012, 0.02, 0, -0.02, 0, { col: 0xf0f0ec, seg: 28 });
  K.sph(on ? K.emit(warm, k, { base: 0xf8f6f0, key: 'flush' }) : M.ceramic, r, 0, -0.02, 0, { seg: 24, seg2: 8, p0: H, pl: H, sy: 0.5, col: 0xf6f4ee });
  return K.world(0, -0.14, 0);
};
// fluorescent batten along local X
P.fluoro = (K, { len = 1.2, on = true, col = 0xf2f6ff, k = 9, twin = false } = {}) => {
  K.box(M.satin, len + 0.06, 0.045, twin ? 0.13 : 0.07, 0, -0.045, 0, { r: 0.005, col: 0xeeeeea });
  const tm = on ? K.emit(col, k, { key: 'tube' + col }) : M.ceramic;
  for (const z of twin ? [-0.03, 0.03] : [0]) { K.cyl(tm, 0.013, 0.013, len - 0.04, 0, -0.064, z, { rz: H, c: true, seg: 8, col: 0xf4f4f0 }); for (const s of [-1, 1]) K.box(M.plastic, 0.02, 0.03, 0.03, s * (len / 2 - 0.005), -0.078, z, { r: 0.002, col: 0xe8e8e4 }); }
  return K.world(0, -0.09, 0);
};
P.ledPanel = (K, { w = 0.6, d = 0.6, on = true, col = 0xf4f8ff, k = 4.5 } = {}) => {
  K.box(M.satin, w, 0.012, d, 0, -0.012, 0, { r: 0.002, col: 0xe8e8e6 });
  K.plane(on ? K.emit(col, k, { key: 'panel' + col }) : M.satin, w - 0.03, d - 0.03, 0, -0.0125, 0, { rx: H, col: 0xf0f0ee });
  return K.world(0, -0.03, 0);
};

// simple dining / kitchen chair (centre origin, faces +Z)
P.chair = (K, { col = C.oak, seatCol, h = 0.45, back = 0.92, w = 0.42, metal = false } = {}) => {
  const m = metal ? M.metal : M.wood, d = 0.42, lc = metal ? 0x2a2a2c : col;
  for (const sx of [-1, 1]) { K.box(m, 0.034, h, 0.034, sx * (w / 2 - 0.025), 0, d / 2 - 0.03, { r: 0.006, col: lc }); K.box(m, 0.034, back, 0.034, sx * (w / 2 - 0.025), 0, -d / 2 + 0.03, { r: 0.006, col: lc, rx: -0.04 }); }
  K.box(seatCol != null ? M.fabric : M.wood, w, 0.03, d, 0, h - 0.015, 0, { r: 0.01, col: seatCol ?? col });
  for (const sz of [-1, 1]) K.box(m, w - 0.07, 0.022, 0.018, 0, h * 0.4, sz * (d / 2 - 0.03), { r: 0.004, col: lc });
  K.box(m, w - 0.05, 0.1, 0.018, 0, back - 0.11, -d / 2 + 0.012, { r: 0.006, col: lc }); K.box(m, w - 0.05, 0.05, 0.016, 0, back - 0.3, -d / 2 + 0.018, { r: 0.005, col: lc });
};

P.table = (K, { w = 1.2, d = 0.8, h = 0.75, col = C.oak, top, leg = 0.055, round = false } = {}) => {
  if (round) { K.cyl(M.wood, w / 2, w / 2, 0.03, 0, h - 0.03, 0, { col: top ?? col, seg: 36 }); K.cyl(M.wood, 0.04, 0.05, h - 0.06, 0, 0.03, 0, { col, seg: 12 }); K.cyl(M.wood, w * 0.28, w * 0.3, 0.03, 0, 0, 0, { col, seg: 24 }); return; }
  K.box(M.wood, w, 0.03, d, 0, h - 0.03, 0, { r: 0.008, col: top ?? col });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M.wood, leg, h - 0.03, leg, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07), { r: 0.006, col });
  for (const sz of [-1, 1]) K.box(M.wood, w - 0.2, 0.08, 0.02, 0, h - 0.11, sz * (d / 2 - 0.07), { r: 0.003, col });
  for (const sx of [-1, 1]) K.box(M.wood, 0.02, 0.08, d - 0.2, sx * (w / 2 - 0.07), h - 0.11, 0, { r: 0.003, col });
};

// bottle shapes (lathe). kind: wine | spirit | beer | squeeze | pill | spray
P.bottle = (K, x, y, z, { kind = 'wine', col = 0x1e3a22, s = 1, mat, cap = 0x222222, label } = {}) => {
  const prof = { wine: [[0.001, 0], [0.037, 0], [0.038, 0.19], [0.03, 0.22], [0.014, 0.255], [0.0135, 0.3], [0.001, 0.3]], spirit: [[0.001, 0], [0.04, 0], [0.042, 0.17], [0.036, 0.2], [0.015, 0.22], [0.014, 0.27], [0.001, 0.27]], beer: [[0.001, 0], [0.03, 0], [0.031, 0.12], [0.02, 0.17], [0.013, 0.2], [0.013, 0.23], [0.001, 0.23]], squeeze: [[0.001, 0], [0.03, 0], [0.032, 0.13], [0.022, 0.16], [0.01, 0.18], [0.004, 0.21], [0.001, 0.21]], pill: [[0.001, 0], [0.022, 0], [0.022, 0.055], [0.019, 0.058], [0.001, 0.058]], spray: [[0.001, 0], [0.033, 0], [0.033, 0.17], [0.02, 0.19], [0.012, 0.2], [0.001, 0.2]] }[kind];
  K.push(x, y, z, K.rng() * TAU, 0, 0, s);
  K.lathe(mat ?? (kind === 'squeeze' || kind === 'spray' ? M.plastic : M.bottle), prof, 0, 0, 0, { col, seg: 12 });
  const top = prof[prof.length - 1][1];
  if (kind === 'pill') K.cyl(M.plastic, 0.023, 0.023, 0.016, 0, top, 0, { col: 0xf4f4f0, seg: 12 });
  else if (kind !== 'squeeze') K.cyl(M.plastic, 0.0145, 0.0145, 0.018, 0, top - 0.004, 0, { col: cap, seg: 8 });
  if (label != null) { const lr = prof[2][0] + 0.0006; K.cyl(M.signs, lr, lr, kind === 'pill' ? 0.035 : 0.075, 0, kind === 'pill' ? 0.01 : 0.06, 0, { seg: 12, open: true, t0: -0.9, tl: 1.8, uv: ATLAS.signs.rect[typeof label === 'string' ? label : 'label' + label] }); }
  K.pop();
};

// plate with optional food; glass tumbler
P.plate = (K, x, y, z, { r = 0.125, col = 0xf2f0ea, food = null } = {}) => {
  K.lathe(M.ceramic, [[0.001, 0], [r * 0.6, 0], [r * 0.66, 0.006], [r, 0.02], [r, 0.024], [r * 0.64, 0.012], [0.001, 0.008]], x, y, z, { col, seg: 24 });
  const rr = K.rng;
  if (food === 'burger') { K.cyl(M.matte, 0.05, 0.048, 0.02, x - 0.02, y + 0.01, z, { col: 0xc88a3c, seg: 14 }); K.cyl(M.matte, 0.052, 0.052, 0.012, x - 0.02, y + 0.03, z, { col: 0x3a1c10, seg: 14 }); K.cyl(M.satin, 0.054, 0.054, 0.004, x - 0.02, y + 0.042, z, { col: 0xe0a020, seg: 6 }); K.sph(M.satin, 0.05, x - 0.02, y + 0.046, z, { col: 0xc8822e, seg: 14, seg2: 6, pl: H, sy: 0.6 }); for (let i = 0; i < 9; i++) K.box(M.matte, 0.008, 0.008, 0.05 + rr() * 0.02, x + 0.05 + rr() * 0.04, y + 0.014 + rr() * 0.012, z + (rr() - 0.5) * 0.08, { r: 0.002, ry: rr() * 3, rx: (rr() - 0.5) * 0.4, col: 0xdcae3a }); }
  else if (food === 'eggs') { for (const s of [-1, 1]) { K.cyl(M.satin, 0.035, 0.038, 0.004, x + s * 0.03, y + 0.011, z - 0.01, { col: 0xf6f4ec, seg: 12 }); K.sph(M.gloss, 0.014, x + s * 0.03, y + 0.014, z - 0.01, { col: 0xe8a81a, seg: 10, seg2: 6, sy: 0.6 }); } K.box(M.matte, 0.07, 0.008, 0.07, x, y + 0.012, z + 0.055, { r: 0.003, ry: 0.4, col: 0xc89a54 }); }
  else if (food === 'pie') { K.cyl(M.matte, 0.07, 0.06, 0.03, x, y + 0.01, z, { col: 0xc89a54, seg: 3, tl: 1.0 }); K.cyl(M.satin, 0.066, 0.058, 0.02, x, y + 0.014, z, { col: 0x4a1830, seg: 3, tl: 0.98 }); }
  else if (food === 'crumbs') for (let i = 0; i < 8; i++) K.box(M.matte, 0.006, 0.004, 0.006, x + (rr() - 0.5) * r, y + 0.011, z + (rr() - 0.5) * r, { r: 0, col: 0xc89a54 });
};
P.glass = (K, x, y, z, { h = 0.11, r = 0.033, fill = 0, col = 0xd8b060 } = {}) => {
  K.lathe(M.glassTint, [[0.001, 0.004], [r * 0.82, 0.004], [r, h], [r * 0.94, h], [r * 0.76, 0.012], [0.001, 0.012]], x, y, z, { seg: 14, col: 0xdfe8ea });
  if (fill) K.cyl(M.gloss, r * (0.8 + 0.16 * fill), r * 0.76, h * fill, x, y + 0.012, z, { seg: 12, col });
};

// open cardboard box / closed carton
P.carton = (K, w, h, d, x, y, z, { ry = 0, col = C.cardboard, tape = true, label = false } = {}) => {
  K.push(x, y, z, ry); K.box(M.matte, w, h, d, 0, 0, 0, { r: 0.004, col: shade(col, 0.85 + K.rng() * 0.3) });
  if (tape) K.box(M.satin, 0.05, 0.002, d + 0.004, 0, h, 0, { r: 0, col: 0xc8b48a });
  if (label) K.plane(M.signs, Math.min(w * 0.7, 0.3), Math.min(h * 0.6, 0.15), 0, h * 0.55, d / 2 + 0.002, { uv: ATLAS.signs.rect.carton });
  K.pop();
};
export { H as HALF_PI, mixc, shade };
