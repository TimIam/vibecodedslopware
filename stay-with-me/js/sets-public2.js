// Interior sets: bar and classroom. Layout, clutter and lighting numbers are here, with the pieces only these
// rooms use (pool table, back-bar, bar stools, pupils' desks and chairs).

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';
import { F } from './sets-fixtures.js';
import { SUN, SKYFILL, WARM, DUSKSUN, tvFlicker } from './sets-home.js';

const PI = Math.PI, H = PI / 2;

function barStool(K, { col = 0x1c1c1e, wood = C.darkWood } = {}) {
  for (let i = 0; i < 4; i++) { const a = i * H + PI / 4; K.box(M.wood, 0.035, 0.74, 0.035, Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17, { r: 0.006, col: wood, rz: -Math.cos(a) * 0.09, rx: Math.sin(a) * 0.09 }); }
  K.torus(M.brass, 0.17, 0.008, 0, 0.26, 0, { rx: H, seg: 20, rs: 5 }); K.cyl(M.wood, 0.18, 0.17, 0.03, 0, 0.73, 0, { col: wood, seg: 20 }); K.lathe(M.vinyl, [[0.001, 0], [0.178, 0], [0.18, 0.03], [0.15, 0.055], [0.001, 0.06]], 0, 0.76, 0, { col, seg: 20 });
}
function poolTable(K) {
  const L = 2.54, W = 1.42, wood = C.mahog, felt = 0x1c6a3e;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.lathe(M.woodGloss, [[0.001, 0], [0.07, 0], [0.09, 0.05], [0.055, 0.18], [0.085, 0.42], [0.1, 0.6]], sx * (L / 2 - 0.2), 0, sz * (W / 2 - 0.2), { col: wood, seg: 14 });
  K.box(M.woodGloss, L - 0.12, 0.2, W - 0.12, 0, 0.58, 0, { r: 0.012, col: wood }); K.box(M.fabric, L - 0.22, 0.02, W - 0.22, 0, 0.78, 0, { r: 0, col: felt });
  for (const s of [-1, 1]) { K.box(M.woodGloss, L, 0.07, 0.13, 0, 0.775, s * (W / 2 - 0.065), { r: 0.012, col: wood }); K.box(M.woodGloss, 0.13, 0.07, W - 0.26, s * (L / 2 - 0.065), 0.775, 0, { r: 0.012, col: wood });
    for (const hx of [-1, 1]) K.box(M.fabric, L / 2 - 0.26, 0.04, 0.05, hx * (L / 4 - 0.02), 0.8, s * (W / 2 - 0.15), { r: 0.012, col: shade(felt, 0.85) }); K.box(M.fabric, 0.05, 0.04, W - 0.42, s * (L / 2 - 0.15), 0.8, 0, { r: 0.012, col: shade(felt, 0.85) });
    for (let i = 0; i < 7; i++) if (i !== 3) K.cyl(M.ceramic, 0.007, 0.007, 0.002, -L / 2 + 0.32 + i * (L - 0.64) / 6, 0.845, s * (W / 2 - 0.05), { col: 0xf4f0e0, seg: 6 }); }
  for (const px of [-1, 0, 1]) for (const pz of [-1, 1]) { K.cyl(M.matte, 0.058, 0.058, 0.012, px * (L / 2 - 0.13), 0.795, pz * (W / 2 - (px ? 0.13 : 0.1)), { col: 0x050505, seg: 14 }); K.lathe(M.leather, [[0.001, 0], [0.04, 0.02], [0.06, 0.12], [0.065, 0.2]], px * (L / 2 - 0.1), 0.56, pz * (W / 2 - 0.08), { col: 0x2a1a10, seg: 10 }); }
  const cols = [0xe0b020, 0x1f3f9a, 0xb02020, 0x4a2a7a, 0xd9661e, 0x1c6a3e, 0x6a1a1a, 0x111111, 0xe0b020, 0xb02020, 0xf4f0e0], r = K.rng;
  cols.forEach((c, i) => K.sph(M.ceramic, 0.0286, i === 10 ? -0.7 : -0.2 + r() * 1.1, 0.8186, i === 10 ? 0.15 : (r() - 0.5) * 0.9, { col: c, seg: 14, seg2: 10 }));
  K.cyl(M.wood, 0.006, 0.013, 1.45, -0.35, 0.86, -0.42, { rz: H - 0.012, ry: 0.5, c: true, col: C.beech, seg: 8 }); K.box(M.matte, 0.022, 0.022, 0.022, 0.9, 0.845, W / 2 - 0.06, { r: 0.003, col: 0x2a6ab0 });
}

function pupilDesk(K, col) {
  K.box(M.wood, 0.6, 0.022, 0.45, 0, 0.58, 0, { r: 0.006, col: C.beech }); K.box(M.plastic, 0.5, 0.09, 0.36, 0, 0.485, 0, { r: 0.01, col: 0xd8d8d4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(M.metal, 0.012, 0.012, 0.58, sx * 0.26, 0, sz * 0.19, { col, seg: 8 });
}
function pupilChair(K, col) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(M.metal, 0.01, 0.01, 0.36, sx * 0.15, 0, sz * 0.14, { col: 0x9a9da0, seg: 6, rz: -sx * 0.06, rx: sz * 0.06 });
  K.rbox(M.plastic, 0.34, 0.03, 0.32, 0, 0.35, 0, { r: 0.014, col, seg: 2 }); K.rbox(M.plastic, 0.33, 0.2, 0.025, 0, 0.5, -0.17, { r: 0.012, col, rx: -0.14, seg: 2 });
  for (const sx of [-1, 1]) K.cyl(M.metal, 0.009, 0.009, 0.18, sx * 0.13, 0.37, -0.16, { col: 0x9a9da0, seg: 6, rx: -0.14 });
}

export const PUBLIC2 = {
  bar(K) {
    const w = 8.4, d = 6.6, h = 2.9, r = K.rng, wood = C.walnut;
    const Fr = K.room({ w, d, h, wallCol: 0x2c3d33, dado: { h: 1.1, mat: M.wood, col: wood, rail: true, railCol: 0x4a2f1e }, walls: { N: { mat: M.brick, col: 0xd8ccc0, dado: null } }, floorMat: M.planks, floorCol: 0x9a7a62, ceilCol: 0x2a2520, skirt: 0.14, skirtCol: 0x3a2619, wear: 0.9, wearCol: 0xb8a890, openings: [{ id: 'w0', wall: 'S', at: -2.4, w: 1.3, y0: 1.35, y1: 2.25 }, { id: 'w1', wall: 'S', at: 0.4, w: 1.3, y0: 1.35, y1: 2.25 }, { id: 'door', wall: 'W', at: -0.2, w: 0.95, y1: 2.08 }] });
    ['w0', 'w1'].forEach((id, i) => { K.window(Fr[id], { cols: 2, frameCol: 0x3a2619, frameMat: M.wood, sillCol: 0x3a2619, blind: { kind: 'venetian', drop: 1, col: 0x6a5a48, tilt: 0.9 } }); K.at(Fr[id].x, 0, Fr[id].z, Fr[id].ry, () => K.plane(M.neon, 0.95, i ? 0.54 : 0.62, 0, 1.8, 0.05, { uv: ATLAS.neon.rect[i ? 'beer1' : 'beer0'] })); });
    K.door(Fr.door, { open: 0, style: 'glazed', col: 0x3a2619, mat: M.wood, handle: 'bar', metal: M.brass, frameCol: 0x3a2619, kick: true });
    K.onWall('W', -0.2, () => { K.box(M.plastic, 0.34, 0.16, 0.04, 0, 2.2, 0.02, { r: 0.006, col: 0x1a1a1c }); K.plane(K.screen(2.2, 'exit'), 0.3, 0.13, 0, 2.28, 0.041, { uv: ATLAS.screens.rect.exit }); });
    for (const x of [-2.8, 0, 2.8]) K.box(M.wood, 0.16, 0.2, d, x, h - 0.2, 0, { r: 0.008, col: 0x2a1c12 });
    // back-bar: cabinets, mirror, lit shelves of bottles
    const glow = K.emit(0xffb060, 2.6, { key: 'backbar' });
    K.prop(-1.3, 0, -d / 2, 0, () => {
      F.baseUnits(K, { len: 5.0, col: 0x4a2f1e, topCol: 0x3a2619, topMat: M.woodGloss, h: 0.92, metal: M.brass });
      K.box(M.woodGloss, 5.0, 1.5, 0.05, 0, 0.96, 0.025, { r: 0, col: 0x3a2619 }); K.plane(M.mirror, 4.7, 1.3, 0, 1.72, 0.052, {});
      for (const s of [-1, 0, 1]) K.box(M.woodGloss, 0.09, 1.52, 0.3, s * 2.455, 0.96, 0.15, { r: 0.008, col: 0x3a2619 }); K.box(M.woodGloss, 5.1, 0.12, 0.34, 0, 2.46, 0.17, { r: 0.012, col: 0x3a2619 });
      const kinds = ['wine', 'spirit', 'spirit', 'beer', 'spirit'], cols = [0x1e3a22, 0x6a3a12, 0xdfe8ea, 0x4a2a0c, 0x8a5a1a, 0x1a2a4a, 0x7a1f24, 0xc8a850];
      for (let j = 0; j < 3; j++) { const sy = 1.12 + j * 0.42; K.box(M.glassTint, 4.8, 0.012, 0.24, 0, sy, 0.15, { r: 0, col: 0xdfe8ea }); K.box(glow, 4.76, 0.008, 0.02, 0, sy - 0.006, 0.06, { r: 0 });
        let x = -2.3; while (x < 2.3) { if (Math.abs(x) < 0.08 || Math.abs(Math.abs(x) - 2.4) < 0.06) { x += 0.12; continue; } const kd = r.pick(kinds), c = r.pick(cols); P.bottle(K, x, sy + 0.012, 0.11 + r() * 0.08, { kind: kd, col: c, mat: c === 0xdfe8ea ? M.glassTint : M.bottle, label: kd === 'beer' ? null : r.i(0, 5), s: 0.92 + r() * 0.16 }); x += 0.085 + r() * 0.05 + (r.chance(0.08) ? 0.2 : 0); } }
      // till, glasses, taps on the counter side
      const y = 0.96; K.at(1.7, y, 0.3, -0.2, () => { K.box(M.plastic, 0.34, 0.18, 0.34, 0, 0, 0, { r: 0.012, col: 0x2a2a2e }); K.box(M.plastic, 0.3, 0.2, 0.03, 0, 0.2, -0.08, { r: 0.008, rx: -0.3, col: 0x1a1a1c }); K.plane(K.screen(1.4, 'mon'), 0.26, 0.16, 0, 0.3, -0.058, { rx: -0.3, uv: ATLAS.screens.rect.mon0 }); });
      for (let i = 0; i < 12; i++) P.glass(K, -2.1 + (i % 6) * 0.075, y + (i > 5 ? 0.0 : 0), 0.24 + (i > 5 ? 0.09 : 0), { h: 0.14, r: 0.036 });
      K.rbox(M.fabric, 0.3, 0.02, 0.2, 0.6, y, 0.3, { r: 0.008, col: 0xe8e4da, wrinkle: 0.01, seg: 3 });
    });
    // the bar counter
    K.prop(-1.3, 0, -1.9, 0, () => {
      const len = 5.2; K.box(M.wood, len, 1.02, 0.5, 0, 0, -0.05, { r: 0.008, col: wood }); for (let i = 0; i < 7; i++) K.box(M.wood, len / 7 - 0.1, 0.72, 0.012, -len / 2 + (i + 0.5) * len / 7, 0.18, 0.206, { r: 0.008, col: shade(wood, 1.15) });
      K.box(M.woodGloss, len + 0.16, 0.06, 0.74, 0, 1.02, 0.02, { r: 0.02, col: 0x4a2f1e }); K.box(M.wood, 0.5, 1.02, 1.3, len / 2 + 0.25, 0, -0.75, { r: 0.008, col: wood }); K.box(M.woodGloss, 0.66, 0.06, 1.45, len / 2 + 0.25, 1.02, -0.72, { r: 0.02, col: 0x4a2f1e });
      K.cyl(M.brass, 0.02, 0.02, len - 0.2, 0, 0.2, 0.34, { rz: H, c: true, seg: 10 }); for (let i = 0; i < 6; i++) K.cyl(M.brass, 0.012, 0.012, 0.14, -len / 2 + 0.3 + i * (len - 0.6) / 5, 0.2, 0.27, { rx: H, c: true, seg: 6 });
      const y = 1.08;
      K.at(-0.3, y, -0.1, 0, () => { K.box(M.brass, 0.5, 0.06, 0.16, 0, 0.3, 0, { r: 0.02 }); K.cyl(M.brass, 0.04, 0.05, 0.3, 0, 0, 0, { seg: 12 }); [0xa8231f, 0x24508c, 0xe0b020].forEach((c, i) => { K.cyl(M.chrome, 0.012, 0.012, 0.08, -0.16 + i * 0.16, 0.26, 0.09, { rx: H - 0.3, c: true, seg: 8 }); K.box(M.gloss, 0.035, 0.16, 0.03, -0.16 + i * 0.16, 0.36, 0.085, { r: 0.01, col: c, rx: 0.15 }); }); K.box(M.steel, 0.56, 0.015, 0.2, 0, 0, 0.1, { r: 0.004 }); });
      for (const [x, f] of [[-1.9, 0.7], [-1.1, 0.3], [1.3, 0.85], [2.0, 0.1]]) { P.glass(K, x, y, 0.14 + r() * 0.1, { h: 0.15, r: 0.038, fill: f, col: 0xc8861a }); K.box(M.cork, 0.09, 0.003, 0.09, x, y, 0.16, { r: 0, ry: r() }); }
      P.bottle(K, -1.5, y, 0.05, { kind: 'beer', col: 0x4a2a0c }); P.bottle(K, 0.9, y, 0.1, { kind: 'beer', col: 0x1e3a22 }); K.lathe(M.wood, [[0.001, 0], [0.04, 0], [0.07, 0.04], [0.065, 0.04], [0.035, 0.01]], 0.6, y, 0.12, { col: C.beech, seg: 14 }); K.rbox(M.rubberBlack, 0.5, 0.008, 0.22, -2.2, y, -0.05, { r: 0.003, col: 0x1a2a4a, seg: 1 });
    }, { pad: 0.02 });
    for (let i = 0; i < 6; i++) { if (i === 2) continue; K.prop(-3.5 + i * 0.86, 0, -1.25 + (r() - 0.5) * 0.08, r() * 3, () => barStool(K, {}), { pad: 0 }); }
    K.at(-1.55, 0.2, -0.85, 0.5, () => barStool(K, {}), 0, H - 0.1); K.collide(0.9, 0.42, 0.5, -1.2, 0, -0.85);
    const pb = []; for (const x of [-3.2, -1.3, 0.6]) pb.push(K.at(x, h, -1.75, 0, () => P.pendant(K, { kind: 'metal', drop: 0.8, on: true, col: 0x8a5a2a, r: 0.13, k: 1.2 })));
    // pool table under its lamp
    K.prop(2.3, 0, 1.15, 0, () => poolTable(K));
    const lampY = 1.78; K.at(2.3, 0, 1.15, 0, () => { K.cyl(M.brass, 0.012, 0.012, 1.5, 0, lampY + 0.2, 0, { rz: H, c: true, seg: 8 }); for (const s of [-1, 1]) K.cyl(M.brass, 0.004, 0.004, h - lampY - 0.2, s * 0.6, lampY + 0.2, 0, { seg: 4 }); for (const x of [-0.55, 0, 0.55]) { K.lathe(M.metal, [[0.2, 0], [0.205, 0.008], [0.06, 0.16], [0.03, 0.2]], x, lampY, 0, { seg: 22, col: 0x1c5a3a }); K.lathe(K.emit(0xffe2b0, 1.4, { key: 'poolin', base: 0x000000 }), [[0.03, 0.195], [0.058, 0.156], [0.196, 0.004]], x, lampY, 0, { seg: 22 }); P.bulb(K, true, x, lampY + 0.07, 0, 0.026); } });
    K.prop(w / 2 - 0.16, 0, 2.6, 0, () => { for (let i = 0; i < 3; i++) K.cyl(M.wood, 0.006, 0.013, 1.45, -0.02, 0.0, -0.15 + i * 0.15, { rz: 0.08, col: C.beech, seg: 8 }); K.box(M.wood, 0.1, 0.05, 0.5, 0.06, 0.7, 0, { r: 0.006, col: wood }); K.box(M.wood, 0.14, 0.03, 0.5, 0.04, 0, 0, { r: 0.006, col: wood }); }, { pad: 0 });
    // tables and chairs on the west side
    for (const [x, z] of [[-3.2, 1.9], [-1.3, 2.45]]) { K.prop(x, 0, z, 0, () => { P.table(K, { round: true, w: 0.75, col: C.darkWood, h: 0.74 }); P.glass(K, 0.12, 0.74, 0.05, { h: 0.15, r: 0.038, fill: 0.4, col: 0xc8861a }); P.bottle(K, -0.15, 0.74, -0.08, { kind: 'beer', col: 0x4a2a0c }); K.cyl(K.emit(0xff9a3a, 2.5, { key: 'candle' }), 0.025, 0.02, 0.05, 0, 0.74, 0.18, { seg: 10 }); K.cyl(M.glassTint, 0.035, 0.03, 0.07, 0, 0.74, 0.18, { seg: 10, col: 0xb02020, open: true }); }); for (let i = 0; i < 3; i++) { const a = i * 2.1 + x; K.prop(x + Math.cos(a) * 0.68, 0, z + Math.sin(a) * 0.68, -a - H, () => P.chair(K, { col: C.darkWood, seatCol: 0x5a1f24 }), { pad: 0 }); } }
    // walls: neon, dartboard, pictures, television, jukebox
    K.onWall('E', -1.6, () => K.plane(M.neon, 1.0, 0.58, 0, 1.95, 0.05, { uv: ATLAS.neon.rect.beer2 })); K.onWall('E', 1.15, () => K.plane(M.neon, 0.9, 0.38, 0, 2.3, 0.05, { uv: ATLAS.neon.rect.pool }));
    K.onWall('N', 2.6, () => { K.plane(M.neon, 0.5, 0.57, 0.5, 1.9, 0.05, { uv: ATLAS.neon.rect.cocktail }); K.at(-0.5, 2.0, 0, 0, () => { K.tvS = P.tv(K, { w: 0.95, wall: true, rect: 'tv1', k: 1.8 }); }); });
    K.onWall('S', 3.0, () => { K.box(M.wood, 0.9, 0.9, 0.03, 0, 1.28, 0.015, { r: 0.008, col: 0x1a1a1c }); K.geo(M.signs, new THREE.CircleGeometry(0.23, 28), { x: 0, y: 1.73, z: 0.045, uv: ATLAS.signs.rect.dart }); K.cyl(M.rubberBlack, 0.235, 0.235, 0.03, 0, 1.73, 0.03, { rx: H, c: true, seg: 28, col: 0x111111 }); for (let i = 0; i < 2; i++) { K.cyl(M.chrome, 0.003, 0.003, 0.12, -0.05 + i * 0.12, 1.78 - i * 0.1, 0.1, { rx: H + 0.2, c: true, seg: 4 }); K.box(M.plastic, 0.03, 0.03, 0.002, -0.05 + i * 0.12, 1.79 - i * 0.1, 0.16, { r: 0, col: 0xb02020 }); } });
    K.onWall('S', -1.0, () => { P.picture(K, 0, 1.75, { w: 0.5, h: 0.4, pic: 'land1', col: 0x2a1c12, mat: M.wood }); P.picture(K, 0.62, 1.8, { w: 0.3, h: 0.38, pic: 'portrait2', col: 0x2a1c12, mat: M.wood }); P.picture(K, -0.62, 1.7, { w: 0.3, h: 0.3, pic: 'portrait5', col: 0xb8964a, mat: M.brass }); });
    K.onWall('W', 2.2, () => { P.picture(K, 0, 1.8, { w: 0.7, h: 0.5, pic: 'land2', col: 0x2a1c12, mat: M.wood }); for (let i = 0; i < 4; i++) { K.cyl(M.brass, 0.008, 0.008, 0.07, -0.9 + i * 0.2, 1.75, 0.035, { rx: H, c: true, seg: 6 }); } K.drape(M.curtain, [[0.8, 0.04], [1.55, 0.045], [1.76, 0.07], [1.55, 0.09], [1.0, 0.1]], 0.42, -0.8, 0, 0, { col: 0x3a3226, wrinkle: 0.025, seg: 16, flare: -0.08 }); });
    K.prop(-w / 2 + 0.02, 0, -2.4, H, () => { K.box(M.woodGloss, 0.8, 1.0, 0.55, 0, 0, 0.275, { r: 0.03, col: C.mahog }); K.cyl(M.woodGloss, 0.4, 0.4, 0.55, 0, 1.0, 0.275, { rx: H, c: true, seg: 24, tl: PI, t0: -H, col: C.mahog }); K.plane(K.screen(1.8, 'juke'), 0.62, 0.42, 0, 1.02, 0.556, { uv: ATLAS.screens.rect.juke }); K.box(M.chrome, 0.5, 0.3, 0.02, 0, 0.4, 0.552, { r: 0.006 }); });
    K.onWall('W', -1.3, () => { K.plane(M.signs, 0.5, 0.38, 0, 1.75, 0.004, { uv: ATLAS.signs.rect.menu }); });
    // the story: a stool over, a glass smashed
    K.stain('coffee', 0.7, 0.5, -0.4, -0.75, { col: 0xc8b070 }); for (let i = 0; i < 9; i++) K.box(M.glassTint, 0.02 + r() * 0.04, 0.004, 0.015 + r() * 0.03, -0.55 + r() * 0.5, 0.002, -0.95 + r() * 0.4, { r: 0, ry: r() * 3, col: 0xdfe8ea }); K.stain('scuff', 2.0, 1.2, 1.0, -0.6);
    // lighting: dim and warm
    // closing-time floor: spill haze along the bar, crisp packets and beer mats, coats on the pegs
    K.grime('smudge', 4.5, 0.7, -1.3, 0.0064, -1.0, { up: true, col: 0x2a1c12 }); K.grime('wear', 2.0, 1.4, -1.0, 0.0066, 1.8, { up: true, col: 0xb8a890 }); K.grime('wear', 1.8, 1.2, 1.5, 0.0067, 0.4, { up: true, ry: 1, col: 0xb8a890 });
    K.scatter(7, [-3.8, -0.8, 3.8, 2.9], 0.04, i => i % 3 === 0 ? K.heap(M.gloss, 0.14, 0.03, 0.1, 0, 0, 0, { col: [0xb02a2a, 0x2a5ab0, 0xe0b020][i % 3 + (i > 3 ? 1 : 0)] ?? 0xb02a2a, detail: 2, amp: 0.4, freq: 3 }) : K.box(M.matte, 0.09, 0.003, 0.09, 0, 0.001, 0, { r: 0.001, col: i & 1 ? 0xe8e0c8 : 0x8a2a2a }), { under: true });
    K.onWall('E', 2.3, () => { K.box(M.wood, 1.1, 0.09, 0.022, 0, 1.72, 0.011, { r: 0.005, col: 0x3a2619 }); [[-0.4, 0x2a2e36, 0.95], [-0.12, 0x5a4a3a, 0.8], [0.18, 0x3a4a3a, 0.9], [0.44, 0x1a1a1e, 0.7]].forEach(([x, c, l]) => P.coat(K, x, 1.74, { col: c, len: l, w: 0.44 })); });
    K.hemi(0x5a5048, 0x2a1c14, K.day ? 0.12 : 0.055);
    K.spot(-1.3, h - 0.15, 0.3, -1.3, 0, 0.25, { col: 0xffd2a0, int: K.day ? 9 : 8, angle: 1.15, pen: 0.8, shadow: true, near: 0.2 });
    K.spot(2.3, lampY + 0.1, 1.15, 2.3, 0, 1.15, { col: 0xffe2b0, int: 9, angle: 1.2, pen: 0.5, shadow: true, near: 0.1, map: 1024 });
    K.point(-1.3, 1.7, -d / 2 + 0.6, { col: 0xffb060, int: 2.4, dist: 5 }); K.point(-1.3, 1.9, -1.7, { col: 0xffcf9a, int: 3.0, dist: 6 });
    K.point(w / 2 - 0.5, 1.9, -1.4, { col: 0xff4030, int: 1.6, dist: 5 }); K.point(-1.0, 1.8, d / 2 - 0.5, { col: K.day ? 0xcfdff5 : 0xffb21a, int: K.day ? 3 : 1.6, dist: 5 });
    tvFlicker(K, K.tvS, null, 1.8, 0);
    K.spots({ floor: [-1.3, 0.25, H], seat: [-3.5 + 0.86, 0.82, -1.25, PI], side: -1, by: [[0.2, 0.9], [-2.9, 0.4]], cam: [-0.1, 1.4, 1.35], target: [-1.4, 0.25, 0.1], seatView: { cam: [-1.5, 1.4, 0.2], target: [-2.64, 1.1, -1.25], partner: [-3.2, 0, -0.6], kit: [-1.9, 0, -0.5] } });
    return { exposure: 1.25, bloom: 0.2, envInt: 0.7, envPos: [-0.8, 1.4, 0.3], fog: [0x1a120c, 0.018] };
  },

  classroom(K) {
    const w = 8, d = 7, h = 3.0, r = K.rng, cols4 = [0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe0b020];
    const Fr = K.room({ w, d, h, wallCol: 0xefe7cf, dado: { h: 1.0, col: 0xc6d6de, rail: true, railCol: 0xf4f0e4 }, floorMat: M.lino, floorCol: 0xcfd2cc, ceilMat: M.ceilTile, ceilCol: 0xf4f4f2, skirt: 0.1, skirtCol: 0x5a6a74, wear: 0.7, wearCol: 0x6a6c68, openings: [{ id: 'w0', wall: 'W', at: -2.2, w: 1.7, y0: 0.95, y1: 2.4 }, { id: 'w1', wall: 'W', at: 0, w: 1.7, y0: 0.95, y1: 2.4 }, { id: 'w2', wall: 'W', at: 2.2, w: 1.7, y0: 0.95, y1: 2.4 }, { id: 'door', wall: 'E', at: 2.7, w: 0.9, y1: 2.05 }] });
    ['w0', 'w1', 'w2'].forEach((id, i) => { K.window(Fr[id], { cols: 2, rows: 2, frameCol: 0xf0f0ec, blind: { kind: 'roller', drop: [0.15, 0.3, 0.15][i], col: 0xe8e0c8 } }); K.at(Fr[id].x, 0, Fr[id].z, Fr[id].ry, () => { for (let k = 0; k < 3; k++) K.plane(M.matte, 0.16, 0.16, -0.5 + k * 0.5, 1.4 + (k & 1) * 0.3, -0.085, { col: cols4[(k + i) % 4], rz: k }); }); });
    K.onWall('W', -1.1, () => P.radiator(K, { w: 1.2, h: 0.6 })); K.onWall('W', 1.1, () => P.radiator(K, { w: 1.2, h: 0.6 }));
    K.door(Fr.door, { open: 0, hinge: 1, style: 'glazed', col: 0x2c6ab0, handle: 'lever', frameCol: 0xf0f0ec, kick: true });
    // whiteboard wall
    K.onWall('N', -0.4, () => { K.box(M.metal, 2.9, 1.3, 0.02, 0, 0.9, 0.01, { r: 0.004, col: 0xc8ccd0 }); K.plane(M.signs, 2.8, 1.2, 0, 1.55, 0.021, { uv: ATLAS.signs.rect.whiteboard }); K.box(M.metal, 2.9, 0.02, 0.07, 0, 0.9, 0.045, { r: 0.004, col: 0xc8ccd0 });
      [0x1a1a1c, 0xb02020, 0x1f3f9a, 0x1c6a3e].forEach((c, i) => K.cyl(M.plastic, 0.009, 0.009, 0.13, -0.6 + i * 0.16, 0.93, 0.05, { rz: H, c: true, col: c, seg: 8 })); K.box(M.fabric, 0.13, 0.03, 0.05, 0.6, 0.92, 0.05, { r: 0.006, col: 0x3a3a3e });
      K.plane(M.signs, 4.6, 0.41, 0, 2.55, 0.004, { uv: ATLAS.signs.rect.abc }); P.clock(K, 2.2, 2.0, { r: 0.16, col: 0x2c6ab0, hour: K.night ? 6.6 : 10.9 }); });
    // teacher's corner
    K.prop(3.05, 0, -1.9, -0.5, () => { P.table(K, { w: 1.4, d: 0.7, col: C.beech, h: 0.74 }); const y = 0.74; K.box(M.plastic, 0.34, 0.016, 0.24, -0.2, y, 0.05, { r: 0.006, col: 0x9a9da0 }); K.box(M.plastic, 0.34, 0.22, 0.012, -0.2, y + 0.016, -0.08, { r: 0.006, col: 0x9a9da0, rx: -0.25 }); K.plane(K.screen(1.8, 'mon'), 0.31, 0.19, -0.2, y + 0.125, -0.098, { rx: -0.25, uv: ATLAS.screens.rect.mon1 });
      P.mug(K, 0.25, y, 0.15, { col: 0xb02020, ry: 1 }); let py = y; for (let i = 0; i < 8; i++) { K.box(M.satin, 0.2, 0.008, 0.26, 0.45, py, -0.1, { r: 0.002, ry: (r() - 0.5) * 0.25, col: r.pick(cols4) }); py += 0.008; } K.sph(M.satin, 0.03, 0.05, y + 0.03, -0.2, { col: 0xb02020, seg: 10, seg2: 8 });
      K.sph(M.gloss, 0.13, -0.5, y + 0.2, -0.15, { col: 0x2a6ab0, seg: 20, seg2: 14 }); K.cyl(M.metal, 0.07, 0.09, 0.02, -0.5, y, -0.15, { col: 0x2a2a2c, seg: 14 }); K.torus(M.brass, 0.145, 0.006, -0.5, y + 0.2, -0.15, { arc: PI, rz: -H + 0.4, seg: 16, rs: 5 }); });
    K.prop(1.7, 0, -3.0, 0.2, () => P.chair(K, { col: C.beech, seatCol: 0x2c6ab0 }), { pad: 0 });
    // groups of four desks
    const group = (cx, cz, skip = -1) => K.prop(cx, 0, cz, (r() - 0.5) * 0.12, () => {
      [[-0.305, -0.23, 0], [0.305, -0.23, 0], [-0.305, 0.23, PI], [0.305, 0.23, PI]].forEach(([x, z, ry], i) => {
        const c = cols4[i]; K.at(x, 0, z, ry, () => pupilDesk(K, c));
        if (i !== skip) K.at(x + (r() - 0.5) * 0.1, 0, z + (z < 0 ? -0.42 : 0.42) + (r() - 0.5) * 0.08, (z < 0 ? 0 : PI) + (r() - 0.5) * 0.5, () => pupilChair(K, c));
        const y = 0.602; if (r.chance(0.8)) K.plane(r.chance(0.4) ? M.pics : M.matte, 0.21, 0.297, x + (r() - 0.5) * 0.1, y + 0.001, z + (r() - 0.5) * 0.05, { up: true, ry: (r() - 0.5) * 0.8, col: 0xffffff, uv: ATLAS.pics.rect['kid' + r.i(0, 3)] });
        if (r.chance(0.6)) K.box(M.satin, 0.15, 0.008, 0.21, x + 0.15, y, z - 0.08, { r: 0.002, ry: r(), col: r.pick(cols4) });
      });
      K.lathe(M.plastic, [[0.001, 0], [0.04, 0], [0.045, 0.09], [0.04, 0.09], [0.035, 0.008]], 0, 0.602, 0, { col: 0x3a3a3e, seg: 12 }); for (let i = 0; i < 6; i++) K.cyl(M.matte, 0.004, 0.004, 0.17, (r() - 0.5) * 0.04, 0.61, (r() - 0.5) * 0.04, { rz: (r() - 0.5) * 0.4, rx: (r() - 0.5) * 0.4, col: r.pick([0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe0b020, 0xe67e22, 0x8e44ad]), seg: 5 });
    });
    group(-2.3, -0.4, 1); group(0.4, -0.3); group(-2.3, 1.7); group(0.4, 1.8); group(2.9, 0.4);
    // reading corner
    K.prop(-3.0, 0, -2.6, 0.2, () => P.rug(K, { w: 1.7, d: 1.5, col: 0x2c6ab0, border: 0xe0b020, inner: 0x3a8a4a }), { collide: false });
    K.prop(-3.75, 0, -3.05, 0.3, () => K.rbox(M.fabric, 0.75, 0.42, 0.75, 0, 0, 0, { r: 0.2, puff: 0.04, wrinkle: 0.04, col: 0xc0392b, seg: 6 }));
    K.prop(-2.45, 0, d / -2 + 0.02, 0, () => P.bookshelf(K, { w: 1.3, h: 0.95, shelves: 3, col: 0xf0f0ec, fill: 0.96 }));
    // south wall: tray storage and coat pegs; display boards
    K.prop(-2.2, 0, d / 2 - 0.02, PI, () => { K.box(M.satin, 3.0, 0.95, 0.42, 0, 0, 0.21, { r: 0.006, col: 0xf0f0ec }); for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) { K.box(M.plastic, 0.34, 0.26, 0.02, -1.31 + i * 0.374, 0.07 + j * 0.29, 0.425, { r: 0.012, col: cols4[(i + j) % 4] }); K.box(M.matte, 0.12, 0.04, 0.002, -1.31 + i * 0.374, 0.24 + j * 0.29, 0.436, { r: 0, col: 0xf4f4f0 }); }
      K.lathe(M.ceramic, [[0.001, 0], [0.08, 0], [0.1, 0.16], [0.095, 0.16], [0.075, 0.01]], -1.1, 0.95, 0.2, { col: 0xb5603c, seg: 14 }); for (let i = 0; i < 7; i++) K.cyl(M.matte, 0.006, 0.006, 0.3, -1.1 + (r() - 0.5) * 0.08, 0.98, 0.2 + (r() - 0.5) * 0.08, { rz: (r() - 0.5) * 0.5, rx: (r() - 0.5) * 0.5, col: r.pick(cols4), seg: 5 });
      for (let i = 0; i < 5; i++) K.box(M.satin, 0.22, 0.03 + r() * 0.02, 0.3, 0.2 + (r() - 0.5) * 0.03, 0.95 + i * 0.04, 0.2, { r: 0.003, ry: (r() - 0.5) * 0.3, col: r.pick(cols4) }); P.carton(K, 0.4, 0.26, 0.3, 1.0, 0.95, 0.2, { ry: 0.1 }); });
    K.onWall('S', 2.3, () => { K.box(M.wood, 2.4, 0.09, 0.02, 0, 1.15, 0.01, { r: 0.006, col: C.beech }); for (let i = 0; i < 7; i++) { const x = -1.05 + i * 0.35; K.cyl(M.metal, 0.008, 0.008, 0.07, x, 1.19, 0.045, { rx: H - 0.4, c: true, col: 0x9a9da0, seg: 6 }); if (i % 3 !== 2) { K.rbox(M.fabric, 0.28, 0.36, 0.14, x, 0.72, 0.1, { r: 0.06, puff: 0.02, col: r.pick([0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe86a92, 0x5a3a8a]), seg: 3 }); K.rbox(M.fabric, 0.2, 0.14, 0.05, x, 0.76, 0.185, { r: 0.02, col: 0x2a2a2e, seg: 2 }); } else K.drape(M.curtain, [[0.5, 0.03], [1.0, 0.04], [1.2, 0.07], [1.0, 0.09], [0.6, 0.1]], 0.3, x, 0, 0, { col: r.pick([0x2c6ab0, 0xe0b020]), wrinkle: 0.025, seg: 12, flare: -0.06 }); } });
    const board = (wall, at, bw, pics) => K.onWall(wall, at, () => { K.box(M.cork, bw, 1.15, 0.015, 0, 1.12, 0.0075, { r: 0, uvo: [0, 0, 0] }); for (const s of [-1, 1]) { K.box(M.satin, bw + 0.06, 0.05, 0.02, 0, 1.695 + s * 0.6, 0.01, { r: 0.004, col: cols4[s > 0 ? 1 : 0] }); K.box(M.satin, 0.05, 1.2, 0.02, s * (bw / 2 + 0.005), 1.095, 0.01, { r: 0.004, col: cols4[s > 0 ? 1 : 0] }); }
      const n = Math.floor(bw / 0.38); for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) { const p = pics[(i + j * n) % pics.length]; K.plane(p.startsWith('!') ? M.matte : M.pics, 0.3, 0.3, -bw / 2 + 0.24 + i * (bw - 0.48) / Math.max(1, n - 1), 1.42 + j * 0.52 + (r() - 0.5) * 0.04, 0.017 + (i & 1) * 0.001, { uv: p.startsWith('!') ? undefined : ATLAS.pics.rect[p], rz: (r() - 0.5) * 0.14, col: p.startsWith('!') ? cols4[i % 4] : 0xffffff }); } });
    board('E', -1.6, 2.6, ['kid0', 'kid1', 'kid2', 'kid3', '!', 'kid2', 'kid0', 'land0', 'kid1', 'kid3']); board('E', 0.9, 1.5, ['kid3', 'kid1', '!', 'kid0', 'kid2', 'calendar']); board('N', 2.9, 1.5, ['cert', 'calendar', 'kid2', '!', 'kid0', 'kid1']);
    // bunting across the room
    for (let k = 0; k < 2; k++) { const z = -1.2 + k * 2.6; K.tube(M.matte, [[-w / 2 + 0.02, 2.75, z], [0, 2.52, z + 0.2], [w / 2 - 0.02, 2.75, z]], 0.003, { col: 0xf0f0ec, tension: 0.5, seg: 24, rs: 4, caps: false });
      for (let i = 0; i < 26; i++) { const t = (i + 0.5) / 26, x = -w / 2 + t * w, sag = 2.75 - 0.23 * 4 * t * (1 - t) * 1.0, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, -0.2, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.setIndex([0, 2, 1]); g.computeVertexNormals(); K.geo(M.leaf, g, { x, y: sag, z: z + 0.2 * 4 * t * (1 - t) * 0.0 + (t < 0.5 ? t : 1 - t) * 0.4, ry: (r() - 0.5) * 0.4, col: cols4[i % 4] }); } }
    K.prop(3.6, 0, 1.9, 0, () => F.bin(K, { steel: false, col: 0x3a3a3e, h: 0.4, r: 0.14 }), { pad: 0 });
    K.onWall('E', 2.0, () => { K.cyl(M.gloss, 0.065, 0.065, 0.42, 0, 0.75, 0.085, { col: 0xb81c1c, seg: 14 }); K.plane(M.signs, 0.14, 0.21, 0, 1.6, 0.003, { uv: ATLAS.signs.rect.fireext }); }); K.switchPlate('E', 2.05, 1.25, 2);
    // the story: a chair over, pencils spilt
    K.at(0.75, 0.17, -1.55, 0.6, () => pupilChair(K, cols4[1]), 0, H);
    K.at(-1.6, 0, -1.55, 0.4, () => { K.lathe(M.plastic, [[0.001, 0], [0.04, 0], [0.045, 0.09], [0.04, 0.09], [0.035, 0.008]], 0, 0.045, 0, { col: 0x3a3a3e, seg: 12, rz: H }); for (let i = 0; i < 8; i++) K.cyl(M.matte, 0.004, 0.004, 0.17, 0.1 + r() * 0.25, 0.005, (r() - 0.5) * 0.3, { rz: H, ry: r() * 3, c: true, col: r.pick([0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe0b020, 0xe67e22, 0x8e44ad]), seg: 5 }); });
    K.plane(M.pics, 0.21, 0.297, 0.9, 0.003, -2.9, { up: true, ry: 0.5, uv: ATLAS.pics.rect.kid1 });
    for (const x of [-2.7, -0.9, 0.9, 2.7]) for (const z of [-2.1, 0.3, 2.1]) K.at(x, h, z, 0, () => P.ledPanel(K, { w: 0.57, d: 0.57, on: true, col: 0xfff8ee, k: 2.6 }));
    // end of a school day: coats and bags on the pegs, paper and pencils on the floor, chair-leg scuffs on the lino
    K.onWall('E', 1.9, () => { K.box(M.wood, 2.4, 0.07, 0.02, 0, 1.15, 0.01, { r: 0.005, col: C.beech }); for (let i = 0; i < 8; i++) { const x = -1.05 + i * 0.3; if (i % 4 !== 2) P.coat(K, x, 1.17, { col: [0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe0b020, 0x7a3a9a, 0xe86a92, 0x2a2e36, 0x2c6ab0][i], len: 0.5 + (i % 3) * 0.04, w: 0.3 }); else { K.cyl(M.metal, 0.005, 0.005, 0.05, x, 1.18, 0.025, { rx: H, c: true, seg: 6, col: 0x8a8d90 }); K.rbox(M.fabric, 0.26, 0.3, 0.12, x, 0.84, 0.075, { r: 0.05, soft: true, puff: 0.01, wrinkle: 0.006, col: 0x7a3a9a, cell: 0.04 }); } } });
    K.along('E', 4, 0.2, i => K.rbox(M.fabric, 0.28, 0.34, 0.16, 0, 0, 0, { r: 0.06, soft: true, puff: 0.012, wrinkle: 0.008, crease: 0.006, col: [0xc0392b, 0x2c6ab0, 0x3a8a4a, 0xe86a92][i], cell: 0.04, rx: -0.12 }), { lo: 0.1, hi: 0.95 });
    K.scatter(8, [-3.4, -3.0, 3.4, 3.0], 0.05, i => i % 4 === 0 ? K.cyl(M.satin, 0.004, 0.004, 0.17, 0, 0.004, 0, { rz: H, c: true, col: [0xe0b020, 0xc0392b][i & 1], seg: 6 }) : K.plane(i & 1 ? M.matte : M.pics, 0.21, 0.297, 0, 0.003, 0, { up: true, col: 0xf4f2ea, uv: i & 1 ? undefined : ATLAS.pics.rect['kid' + (i % 4)] }), { under: true });
    for (let i = 0; i < 12; i++) K.grime('scuff', 0.3 + r() * 0.4, 0.12 + r() * 0.14, -3 + r() * 6, 0.0076 + i * 0.0002, -2.6 + r() * 5.4, { up: true, ry: r() * 6 });
    for (const [x, z] of [[-1.8, 0], [1.8, 0]]) K.at(x, h, z, 0, () => P.smokeAlarm(K));
    K.hemi(0xe8eef2, 0x9a9a8e, K.day ? 0.28 : 0.18);
    K.spot(-0.9, h - 0.03, -2.1, -0.7, 0, -2.4, { col: 0xfff6ea, int: 26, angle: 1.3, pen: 0.6, shadow: true, near: 0.1 });
    K.point(-2.4, h - 0.3, 1.0, { col: 0xfff6ea, int: 9 }); K.point(1.8, h - 0.3, 1.0, { col: 0xfff6ea, int: 9 }); K.point(2.2, h - 0.3, -2.0, { col: 0xfff6ea, int: 7 });
    if (K.day && !K.rain) K.sun(266, 38, SUN, 6.2); else if (K.dusk) K.sun(268, 10, DUSKSUN, 2.2, { soft: 3 }); if (K.day) K.spot(-w / 2 - 1.2, 2.2, 0, 0, 0.4, -0.5, { col: SKYFILL, int: K.rain ? 88 : 20, angle: 0.9, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 });
    K.spots({ floor: [-0.6, -2.45, H], seat: [1.7, 0.45, -3.0, 0.2], side: -1, by: [[0.9, -2.2], [-2.0, -1.6]], cam: [0.5, 1.4, -1.3], target: [-0.75, 0.25, -2.5], seatView: { cam: [0.8, 1.3, -1.5], target: [1.7, 0.8, -3.0], partner: [2.3, 0, -2.75], kit: [1.05, 0, -2.5] } });
    return { exposure: 0.86, bloom: 0.06, envInt: 0.85, envPos: [-0.4, 1.5, -1.6] };
  },
};
