// Interior sets: motel room and the elderly person's flat. Layout, clutter and lighting numbers are here.

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS, STAIN } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';
import { F } from './sets-fixtures.js';
import { SUN, SKYFILL, WARM, DUSKSUN, tvFlicker } from './sets-home.js';

const PI = Math.PI, H = PI / 2;

// a failing fluorescent: mostly on, with stutters and the odd long dropout
function flicker(K, mats, light, k, li) {
  let next = 1.5, until = 0, lvl = 1;
  K.on((dt, t) => {
    if (t > next) { until = t + (K.rng() < 0.3 ? 0.5 + K.rng() * 0.9 : 0.08 + K.rng() * 0.2); next = until + 0.4 + K.rng() * 4; }
    const f = t < until ? (Math.sin(t * 87) > 0.2 ? 0.12 : 0.75) : 0.96 + 0.04 * Math.sin(t * 120);
    lvl += (f - lvl) * Math.min(1, dt * 40); for (const m of mats) m.emissiveIntensity = k * lvl; if (light) light.intensity = li * lvl;
  });
}

export const HOME3 = {
  motelRoom(K) {
    const w = 4.2, d = 6.0, h = 2.4, r = K.rng;
    const Fr = K.room({ w, d, h, wallMat: M.wallpaper('motel'), wallCol: 0xe6d9c0, floorMat: M.carpetPattern, floorCol: 0x8fa0a6, ceilMat: M.popcorn, ceilCol: 0xe8e2d4, skirtCol: 0x5a4636, wear: 1, wearCol: 0xb8b0a0, openings: [{ id: 'win', wall: 'N', at: -0.6, w: 1.9, y0: 0.78, y1: 2.05 }, { id: 'door', wall: 'N', at: 1.45, w: 0.86, y1: 2.03 }] });
    K.window(Fr.win, { cols: 2, frameCol: 0x8a8d90, frameMat: M.metal, backdrop: K.night ? 'carpark' : K.dusk ? 'dusk' : K.rain ? 'rain' : 'yardDay', curtain: { col: 0x47605c, open: 0.075, glow: K.day ? 0.2 : K.dusk ? 0.06 : 0.012 } });
    K.door(Fr.door, { open: 0, hinge: -1, col: 0x6a4a36, mat: M.wood, style: 'flush', handle: 'knob', metal: M.brass, frameCol: 0x5a4636, sign: { id: 'evac', w: 0.2, h: 0.25, y: 1.45 } });
    K.onWall('N', 1.45, () => { K.cyl(M.brass, 0.012, 0.012, 0.01, 0, 1.5, -0.035, { rx: H, c: true, seg: 8 }); K.box(M.brass, 0.05, 0.09, 0.012, 0.36, 1.25, 0.014, { r: 0.003 }); K.box(M.brass, 0.04, 0.03, 0.02, -0.4, 1.38, 0.02, { r: 0.004 }); K.tube(M.brass, [[-0.4, 1.38, 0.03], [-0.3, 1.3, 0.035], [-0.2, 1.33, 0.03]], 0.003, { seg: 8, rs: 4 }); });
    // through-the-wall air conditioner under the window
    K.onWall('N', -0.6, () => { K.box(M.satin, 1.06, 0.42, 0.2, 0, 0.06, 0.1, { r: 0.012, col: 0xcfc8b4 }); for (let i = 0; i < 9; i++) K.box(M.matte, 0.98, 0.012, 0.01, 0, 0.12 + i * 0.026, 0.2, { r: 0, col: 0x6a6456, rx: 0.4 }); K.box(M.satin, 0.3, 0.02, 0.1, 0.34, 0.482, 0.1, { r: 0.004, col: 0xbfb8a4 }); K.box(K.emit(0x30ff60, 3, { key: 'acled' }), 0.01, 0.006, 0.002, 0.45, 0.41, 0.201, { r: 0 }); });
    // beds, heads on the west wall, with the nightstand between
    let top = 0.59;
    K.prop(-w / 2 + 0.01, 0, -1.25, H, () => { top = F.bed(K, { w: 1.37, l: 1.98, col: 0x2f5c5e, spreadCol: 0xffffff, spread: M.bedspread, head: C.walnut, headMat: M.wood, hh: 1.05, mess: 0, base: 0x3a2e26 }); });
    K.prop(-w / 2 + 0.01, 0, 0.78, H, () => F.bed(K, { w: 1.37, l: 1.98, col: 0x2f5c5e, spreadCol: 0xffffff, spread: M.bedspread, head: C.walnut, headMat: M.wood, hh: 1.05, mess: 1, base: 0x3a2e26 }));
    let lampA, lampB;
    K.prop(-w / 2 + 0.02, 0, -0.235, H, () => { const t = F.bedside(K, { w: 0.5, col: C.walnut }); K.at(0.02, t, 0.14, 0, () => { lampA = P.tableLamp(K, { on: true, baseCol: 0x8a6a3a, shadeCol: 0xd8c8a0 }); });
      K.box(M.plastic, 0.2, 0.05, 0.15, -0.1, t, 0.31, { r: 0.012, col: 0xc8c0aa }); K.rbox(M.plastic, 0.21, 0.035, 0.05, -0.1, t + 0.05, 0.31, { r: 0.016, col: 0xc8c0aa, seg: 2 }); K.tube(M.plastic, [[-0.2, t + 0.02, 0.3], [-0.26, t + 0.01, 0.36], [-0.2, t + 0.005, 0.4], [-0.1, t + 0.06, 0.34]], 0.004, { col: 0xc8c0aa, rs: 5, seg: 14 });
      K.box(M.plastic, 0.1, 0.06, 0.06, 0.16, t, 0.33, { r: 0.008, col: 0x1a1a1c }); K.plane(K.screen(1.5, 'clk'), 0.08, 0.035, 0.16, t + 0.032, 0.362, { uv: ATLAS.screens.rect.clockRed });
      F.pillBottle(K, 0.17, t, 0.2); F.pillBottle(K, 0.1, t, 0.24, { tipped: true }); F.pillBottle(K, 0.2, t, 0.12, { s: 0.85 }); P.bottle(K, -0.19, t, 0.14, { kind: 'spirit', col: 0x6a3a12, label: 1 }); P.glass(K, -0.08, t, 0.18, { h: 0.09, fill: 0.25 }); });
    K.onWall('W', -1.25, () => P.picture(K, 0, 1.62, { w: 0.7, h: 0.45, pic: 'land1', col: 0xb8964a, mat: M.brass, f: 0.035, mount: 0.03 }));
    K.onWall('W', 0.78, () => P.picture(K, 0, 1.62, { w: 0.7, h: 0.45, pic: 'land2', col: 0xb8964a, mat: M.brass, f: 0.035, mount: 0.03, tilt: -0.035 }));
    // dresser with the old television
    let sm;
    K.prop(w / 2 - 0.02, 0, -0.55, -H, () => { P.tvUnit(K, { w: 1.7, h: 0.76, d: 0.48, col: C.walnut }); const y = 0.782;
      K.at(-0.3, y, 0.25, 0.12, () => { K.box(M.plastic, 0.64, 0.5, 0.42, 0, 0, 0, { r: 0.03, col: 0x2a2a2c }); K.box(M.plastic, 0.5, 0.42, 0.14, 0, 0.04, -0.26, { r: 0.04, col: 0x242426 }); K.box(M.gloss, 0.5, 0.39, 0.012, -0.04, 0.07, 0.21, { r: 0.02, col: 0x08080a }); sm = K.screen(K.night ? 1.6 : 2.2, 'crt'); K.plane(sm, 0.46, 0.35, -0.04, 0.265, 0.2175, { uv: ATLAS.screens.rect.static }); for (let i = 0; i < 4; i++) K.cyl(M.plastic, 0.012, 0.012, 0.012, 0.27, 0.1 + i * 0.05, 0.215, { rx: H, c: true, col: 0x4a4a4c, seg: 8 }); for (const s of [-1, 1]) K.cyl(M.chrome, 0.003, 0.003, 0.42, s * 0.12, 0.7, -0.1, { rz: s * 0.5, c: true, seg: 4 }); });
      K.at(0.55, y, 0.26, 0, () => { lampB = P.tableLamp(K, { on: true, baseCol: 0x8a6a3a, shadeCol: 0xd8c8a0, s: 0.9 }); });
      K.lathe(M.plastic, [[0.001, 0], [0.085, 0], [0.1, 0.18], [0.095, 0.18], [0.08, 0.01]], 0.28, y, 0.3, { col: 0x5a4636, seg: 16 }); for (let i = 0; i < 2; i++) K.lathe(M.glassTint, [[0.001, 0], [0.028, 0], [0.036, 0.09], [0.034, 0.09], [0.026, 0.006]], 0.12 + i * 0.07, y, 0.38, { col: 0xf0f0f0, seg: 10 });
      P.bottle(K, -0.72, y, 0.36, { kind: 'beer', col: 0x4a2a0c }); P.bottle(K, -0.66, y, 0.28, { kind: 'beer', col: 0x4a2a0c }); K.rbox(M.matte, 0.2, 0.14, 0.12, 0.74, y, 0.34, { r: 0.03, wrinkle: 0.02, col: 0xc8a878, seg: 4 }); });
    K.onWall('E', 1.05, () => { K.box(M.wood, 0.6, 0.9, 0.025, 0, 1.0, 0.0125, { r: 0.006, col: C.walnut }); K.plane(M.mirror, 0.5, 0.8, 0, 1.45, 0.026, {}); });
    // luggage rack with an open case
    K.prop(w / 2 - 0.04, 0, 1.15, -H, () => { for (const s of [-1, 1]) { K.box(M.wood, 0.03, 0.62, 0.03, s * 0.3, 0, 0.12, { r: 0.004, rx: 0.5, col: C.walnut }); K.box(M.wood, 0.03, 0.62, 0.03, s * 0.3, 0, 0.42, { r: 0.004, rx: -0.5, col: C.walnut }); }
      K.box(M.plastic, 0.68, 0.14, 0.46, 0, 0.5, 0.27, { r: 0.03, col: 0x2a3a4a }); K.box(M.plastic, 0.68, 0.46, 0.06, 0, 0.6, 0.05, { r: 0.03, col: 0x2a3a4a, rx: -0.2 }); K.rbox(M.fabric, 0.6, 0.1, 0.38, 0, 0.6, 0.27, { r: 0.03, wrinkle: 0.035, col: 0x8a8478, seg: 6 }); K.rbox(M.fabric, 0.3, 0.07, 0.25, 0.1, 0.66, 0.24, { r: 0.03, wrinkle: 0.03, col: 0x7a2a2a, seg: 5, ry: 0.4 }); });
    // table and chairs by the window
    K.prop(-1.2, 0, -2.45, 0, () => { P.table(K, { round: true, w: 0.75, col: C.walnut, h: 0.72 }); K.rbox(M.matte, 0.16, 0.22, 0.1, 0.05, 0.72, 0.05, { r: 0.02, wrinkle: 0.02, col: 0xb89868, seg: 4, ry: 0.4 }); K.cyl(M.matte, 0.04, 0.03, 0.14, -0.18, 0.72, -0.05, { col: 0xb02a2a, seg: 12 }); K.cyl(M.plastic, 0.003, 0.003, 0.2, -0.17, 0.74, -0.05, { rz: 0.2, col: 0xf0f0f0, seg: 4 }); K.box(M.matte, 0.085, 0.002, 0.054, 0.2, 0.72, -0.15, { r: 0, ry: 0.5, col: 0xe8e2d0 }); });
    K.prop(-1.92, 0, -2.4, H - 0.3, () => P.chair(K, { col: C.walnut, seatCol: 0x6a3a2a })); K.prop(-0.5, 0, -2.5, -H + 0.2, () => P.chair(K, { col: C.walnut, seatCol: 0x6a3a2a }));
    // back of the room: bathroom partition and the vanity nook with its failing light
    K.wall(0.1, 1.9, -w / 2, 1.9, { h, t: 0.1, mat: M.wallpaper('motel'), col: 0xe6d9c0, skirtCol: 0x5a4636 }); K.collide(2.2, h, 1.1, -1.0, 0, 2.45, 0);
    K.wall(0.1, d / 2, 0.1, 1.9, { h, t: 0.1, mat: M.wallpaper('motel'), col: 0xe6d9c0, skirtCol: 0x5a4636, holes: [{ u0: 0.2, u1: 0.9, y0: 0, y1: 2.0 }] });
    K.door({ x: 0.1, z: 2.45, ry: H, w: 0.7, y0: 0, y1: 2.0, t: 0.1 }, { open: 0.55, hinge: 1, swing: -1, col: 0x6a4a36, mat: M.wood, style: 'flush', handle: 'knob', metal: M.brass, frameCol: 0x5a4636, beyond: { depth: 1.5, w: 0.86, floorMat: M.floorWhite, floorCol: 0xd8d8d4, col: 0xd8dcd8 } });
    const tube = K.emit(0xdfffe8, 7, { key: 'vanity' }); let nookL;
    K.prop(1.1, 0, d / 2, PI, () => {
      F.baseUnits(K, { len: 1.9, col: 0x8a6a4a, topCol: 0xd8d0c0, h: 0.8, d: 0.5, metal: M.brass });
      K.lathe(M.ceramic, [[0.001, 0.0], [0.08, 0.0], [0.2, 0.09], [0.21, 0.1], [0.19, 0.1], [0.07, 0.03], [0.001, 0.025]], -0.3, 0.84, 0.27, { seg: 22, col: 0xf0f0ec, sx: 1.15 });
      K.cyl(M.chrome, 0.018, 0.02, 0.05, -0.3, 0.84, 0.07, { seg: 10 }); K.tube(M.chrome, [[-0.3, 0.88, 0.07], [-0.3, 0.97, 0.09], [-0.3, 0.97, 0.16], [-0.3, 0.94, 0.19]], 0.009, { tension: 0.5, seg: 12 });
      K.mirror(1.5, 0.85, 0, 1.5, 0.02, {}); K.box(M.metal, 1.56, 0.03, 0.03, 0, 1.05, 0.015, { r: 0.004, col: 0xb8bcc0 }); K.box(M.metal, 1.56, 0.03, 0.03, 0, 1.925, 0.015, { r: 0.004, col: 0xb8bcc0 });
      K.box(M.satin, 1.3, 0.07, 0.1, 0, 2.02, 0.05, { r: 0.01, col: 0xd8d4c8 }); K.cyl(tube, 0.014, 0.014, 1.2, 0, 2.02, 0.115, { rz: H, c: true, seg: 8 });
      for (let i = 0; i < 3; i++) K.rbox(M.carpet, 0.3, 0.05, 0.22, 0.55, 0.84 + i * 0.05, 0.25, { r: 0.02, col: 0xe8e4da, seg: 2, ry: (r() - 0.5) * 0.1 });
      K.rbox(M.matte, 0.24, 0.08, 0.12, 0.18, 0.84, 0.12, { r: 0.012, col: 0x8ab0c8, seg: 1 }); P.bottle(K, -0.62, 0.84, 0.1, { kind: 'squeeze', col: 0xe8e0d0, s: 0.7 }); K.lathe(M.glassTint, [[0.001, 0], [0.028, 0], [0.036, 0.09], [0.034, 0.09], [0.026, 0.006]], -0.72, 0.84, 0.2, { col: 0xf0f0f0, seg: 10 });
      nookL = K.world(0, 1.9, 0.5);
    });
    K.onWall('E', 2.45, () => { K.box(M.wood, 0.9, 0.025, 0.36, 0, 1.75, 0.18, { r: 0.006, col: C.walnut }); K.cyl(M.chrome, 0.012, 0.012, 0.86, 0, 1.66, 0.2, { rz: H, c: true, seg: 8 }); for (let i = 0; i < 5; i++) { K.torus(M.metal, 0.02, 0.0025, -0.3 + i * 0.16, 1.64, 0.2, { ry: H, col: 0x8a8d90, seg: 10, rs: 4 }); K.box(M.wood, 0.012, 0.03, 0.4, -0.3 + i * 0.16, 1.57, 0.2, { r: 0.004, col: C.beech }); } K.rbox(M.fabric, 0.05, 0.75, 0.4, -0.3, 0.8, 0.2, { r: 0.02, col: 0x3a3a3e, seg: 1 }); });
    // floor: bags, shoes, bottle, stains
    K.rbox(M.fabric, 0.6, 0.28, 0.3, 1.55, 0, 2.25, { r: 0.1, puff: 0.02, col: 0x2a2e36, seg: 3, ry: 0.3 });
    for (const s of [-1, 1]) K.rbox(M.leather, 0.1, 0.08, 0.28, -0.05 + s * 0.08, 0, 2.25 + s * 0.07, { r: 0.035, ry: 0.3 + s * 0.25, col: 0x3a2a1e, seg: 2 });
    K.at(0.25, 0, -1.55, 0.6, () => P.bottle(K, 0, 0.031, 0, { kind: 'beer', col: 0x4a2a0c }), 0, H);
    K.grime('smudge', 1.2, 0.9, 1.2, 0.0062, 0.9, { up: true, col: 0x4a4038 }); K.stain('coffee', 0.5, 0.4, -0.6, -2.0, { col: 0x8a8a8a }); K.grime('smudge', 1.5, 1.0, 1.2, 0.0064, -2.3, { up: true, ry: 1, col: 0x4a4038 });
    K.plane(M.stain, 0.9, 0.7, 0.6, h - 0.002, -1.0, { rx: H, uv: STAIN.coffee, col: 0xa89878 });
    K.at(0.9, h, 0.2, 0, () => { K.cyl(M.plastic, 0.06, 0.065, 0.035, 0, -0.035, 0, { col: 0xe8e4da, seg: 16 }); K.box(K.emit(0xff2a1a, 3, { key: 'smk' }), 0.006, 0.004, 0.006, 0.03, -0.037, 0, { r: 0 }); });
    K.switchPlate('N', 0.9, 1.2); K.socket('W', -0.235, 0.75); K.socket('E', -1.6, 0.3, true);
    // a few days in this room: takeaway, cans, clothes where they fell, damp under the air conditioner, nicotine on the ceiling
    K.drop([[1.55, -2.45], [1.6, 0.35], [0.55, 1.45]], 0.34, () => { P.takeaway(K, { cans: 3 }); K.ao(0.6, 0.6, 0, 0.017, 0, { k: 0.4 }); }, 0.5);
    K.drop([[0.55, 1.5], [1.5, 0.45], [1.2, -2.5]], 0.28, () => { P.laundry(K, { cols: [0x3a3a3e, 0x6a7a5a, 0xc8c2b4] }); K.ao(0.8, 0.7, 0, 0.017, 0, { k: 0.4 }); }, 1.1);
    K.scatter(4, [-0.2, -2.7, 1.9, 1.7], 0.06, i => P.can(K, 0, 0, 0, { tipped: true, crushed: i & 1, col: [0x1a4a8a, 0xb02a2a][i & 1] }));
    K.scatter(3, [0.2, -2.4, 1.9, 1.5], 0.05, () => F.pillBottle(K, 0, 0, 0, { tipped: true }));
    K.drop([[1.75, -1.65], [1.8, 0.5]], 0.1, () => P.extension(K, { plugs: 2, col: 0xd8d0b8 }), -H, { under: true });
    K.onWall('N', -0.6, () => { K.grime('drip', 1.1, 0.3, 0, 0.3, 0.021, { col: 0x5a4a38 }); K.grime('smudge', 1.3, 0.7, 0, 0.4, 0.0046, { col: 0x8a7a5a }); });
    K.onWall('W', -1.25, () => K.grime('smudge', 0.9, 0.5, 0, 1.0, 0.0046, { col: 0x9a8a68 })); K.onWall('W', 0.78, () => K.grime('smudge', 0.9, 0.5, 0, 1.0, 0.0046, { col: 0x9a8a68 }));   // heads against the wall
    K.at(-0.9, h - 0.003, -1.6, 0, () => K.grime('smudge', 1.6, 1.2, 0, 0, 0, { rx: H, col: 0x9a8458 })); K.at(1.2, h - 0.003, 0.9, 0, () => K.grime('smudge', 1.2, 1.4, 0, 0, 0, { rx: H, col: 0x9a8458 }));
    K.onWall('E', 0.2, () => P.vent(K, 0, 2.2, { w: 0.3, h: 0.14, col: 0xcfc8b4 })); K.onWall('N', 2.02, () => P.coat(K, 0, 1.7, { col: 0x2a2e36, len: 0.8 }));
    // lighting
    const tvP = K.world(w / 2 - 0.75, 1.05, -0.25), tvK = K.night ? 1.6 : 2.2;
    const tvL = K.point(tvP.x, tvP.y, tvP.z, { col: 0x9ab8ff, int: K.night ? 1.5 : 0.7, dist: 5 }); tvFlicker(K, sm, tvL, tvK, K.night ? 1.5 : 0.7);
    const nl = K.point(nookL.x, nookL.y, nookL.z, { col: 0xdfffe8, int: 2.6, dist: 5 }); flicker(K, [tube], nl, 7, 2.6);
    K.point(lampA.x, lampA.y, lampA.z, { col: 0xffcf9a, int: K.day ? 2.4 : 4.6 }); K.point(lampB.x, lampB.y, lampB.z, { col: 0xffcf9a, int: K.day ? 1.6 : 3.2 });
    if (K.day) { K.hemi(0xb8c0c8, 0x6a6258, 0.13); K.sun(186, 24, K.rain ? 0xdfe6f0 : SUN, K.rain ? 1.5 : 7.5, { soft: 2, shaft: 1.6 }); }
    else if (K.dusk) { K.hemi(0x6a6a80, 0x4a4038, 0.08); K.sun(196, 9, DUSKSUN, 3.5, { soft: 2, shaft: 1.6 }); }
    else { K.hemi(0x30364a, 0x2a241e, 0.035); K.spot(-0.9, 3.4, -d / 2 - 4.2, -0.4, 0.2, 0.6, { col: 0xff9a4a, int: 150, angle: 0.42, pen: 0.5, shadow: true, near: 1, far: 16 }); }
    K.spots({ floor: [0.8, -0.35, 0], bed: [-0.3, top, 0.78, H], side: 1, by: [[1.2, 1.5], [0.6, -2.2]], cam: [1.3, 1.4, 1.3], target: [0.7, 0.25, -0.5], partner: [0.22, 0, -0.75], kit: [1.25, 0, -1.3], bedView: { cam: [1.35, 1.35, 1.45], target: [-0.3, 0.85, 0.78], partner: [0.45, 0, 0.2], kit: [0.5, 0, 1.45] } });
    return { exposure: K.day ? 1.15 : 1.3, bloom: 0.14, envInt: K.day ? 0.9 : 0.7, envPos: [0.7, 1.3, -0.3], cameraBounds: new THREE.Box3(new THREE.Vector3(-w / 2 + 0.22, 0.25, -d / 2 + 0.22), new THREE.Vector3(w / 2 - 0.22, h - 0.18, 1.72)) };
  },

  elderFlat(K) {
    const w = 4.2, d = 4.4, h = 2.45, r = K.rng, on = true, wp = M.wallpaper('floral'), wpc = 0xf2ecdc, dadoC = 0xd6c8a6;
    const Fr = K.room({ w, d, h, wallMat: wp, wallCol: wpc, dado: { h: 0.95, mat: M.plaster, col: dadoC, rail: true, railCol: 0xefe9da }, floorMat: M.carpetPattern, ceilCol: 0xf0ece0, skirt: 0.14, skirtCol: 0xefe9da, cove: 0.09, wear: 0.5, wearCol: 0xc8b8a0, openings: [{ id: 'win', wall: 'W', at: 0.35, w: 1.6, y0: 0.8, y1: 2.05 }, { id: 'door', wall: 'E', at: -0.35, w: 0.84 }] });
    K.window(Fr.win, { cols: 2, net: true, curtain: { col: 0x7a3040, open: 0.72, pelmet: 0x7a3040 } });
    K.onWall('W', 0.35, () => P.radiator(K, { w: 1.2, h: 0.5 }));
    K.door(Fr.door, { open: 1.6, hinge: 1, swing: -1, col: 0xefe9da, beyond: { depth: 1.4, w: 1.8, off: -0.3, glow: 2.5, floorCol: 0x7a5a4a } });
    K.onWall('E', 0.32, () => { K.tube(M.chrome, [[0, 0.9, 0.06], [0, 1.4, 0.06]], 0.014, { seg: 4 }); for (const y of [0.9, 1.4]) K.cyl(M.chrome, 0.012, 0.012, 0.06, 0, y, 0.03, { rx: H, c: true, seg: 8 }); K.cyl(M.matte, 0.0025, 0.0025, 1.5, 0.25, 0.9, 0.02, { col: 0xc02a22, seg: 4 }); K.box(M.plastic, 0.05, 0.05, 0.02, 0.25, 0.86, 0.02, { r: 0.006, col: 0xc02a22, rz: 0.78 }); });
    // chimney breast with the gas fire
    const fire = K.emit(0xff6a1e, 3.2, { key: 'radiant' });
    K.prop(0, 0, -d / 2, 0, () => {
      K.box(M.plaster, 1.5, 0.95, 0.28, 0, 0, 0.14, { r: 0, col: dadoC, uvo: [0, 0.47, 0] }); K.box(wp, 1.5, h - 0.95, 0.28, 0, 0.95, 0.14, { r: 0, col: wpc, uvo: [0, 1.7, 0] });
      K.box(M.satin, 1.5, 0.045, 0.02, 0, 0.93, 0.29, { r: 0.008, col: 0xefe9da }); for (const s of [-1, 1]) { K.box(M.satin, 0.02, 0.045, 0.28, s * 0.76, 0.93, 0.14, { r: 0.008, col: 0xefe9da }); K.box(M.satin, 0.016, 0.14, 0.28, s * 0.758, 0, 0.14, { r: 0.005, col: 0xefe9da }); }
      // surround, hearth, fire
      K.box(M.wallTile, 1.5, 0.04, 0.5, 0, 0, 0.53, { r: 0.004, col: 0x3a5446, uvo: [0, 0, 0] }); K.box(M.wallTile, 1.0, 0.95, 0.02, 0, 0.04, 0.29, { r: 0, col: 0x3a5446, uvo: [0, 0.5, 0] });
      for (const s of [-1, 1]) K.box(M.woodGloss, 0.16, 1.06, 0.1, s * 0.58, 0.04, 0.33, { r: 0.008, col: C.mahog }); K.box(M.woodGloss, 1.32, 0.14, 0.1, 0, 0.96, 0.33, { r: 0.008, col: C.mahog }); K.box(M.woodGloss, 1.46, 0.045, 0.24, 0, 1.1, 0.4, { r: 0.012, col: C.mahog });
      K.box(M.metal, 0.6, 0.66, 0.16, 0, 0.04, 0.37, { r: 0.012, col: 0x1e1e20 }); K.box(M.brass, 0.62, 0.03, 0.17, 0, 0.7, 0.37, { r: 0.01 }); K.box(M.matte, 0.46, 0.4, 0.02, 0, 0.2, 0.445, { r: 0, col: 0x0c0a08 });
      for (let i = 0; i < 4; i++) K.box(fire, 0.085, 0.3, 0.02, -0.165 + i * 0.11, 0.25, 0.452, { r: 0.008 });
      for (let i = 0; i < 6; i++) K.box(M.chrome, 0.44, 0.006, 0.006, 0, 0.22 + i * 0.065, 0.47, { r: 0.002 }); K.box(M.metal, 0.52, 0.12, 0.05, 0, 0.05, 0.46, { r: 0.01, col: 0x2a2a2c }); for (const s of [-1, 1]) K.cyl(M.brass, 0.016, 0.018, 0.02, s * 0.2, 0.1, 0.49, { rx: H, c: true, seg: 10 });
      // mantel: clock, figurines, photographs, cards
      const y = 1.145;
      K.rbox(M.woodGloss, 0.2, 0.2, 0.08, 0, y, 0.4, { r: 0.04, col: C.walnut, seg: 3 }); K.geo(M.signs, new THREE.CircleGeometry(0.065, 20), { x: 0, y: y + 0.11, z: 0.4405, uv: ATLAS.signs.rect.clock });
      for (const s of [-1, 1]) { K.lathe(M.ceramic, [[0.001, 0], [0.035, 0], [0.03, 0.03], [0.045, 0.07], [0.03, 0.12], [0.02, 0.14], [0.03, 0.17], [0.001, 0.19]], s * 0.62, y, 0.4, { col: s > 0 ? 0xe8e0d0 : 0xe8e0d0, seg: 12 }); K.lathe(M.brass, [[0.001, 0], [0.04, 0], [0.012, 0.02], [0.01, 0.16], [0.022, 0.17], [0.022, 0.18]], s * 0.46, y, 0.42, { seg: 10 }); K.cyl(M.matte, 0.009, 0.009, 0.1, s * 0.46, y + 0.18, 0.42, { col: 0xf0ead8, seg: 6 }); }
      K.at(-0.3, y, 0.4, 0.2, () => P.standFrame(K, { pic: 'portrait2', col: 0x8a7a5a, w: 0.12, h: 0.15 })); K.at(0.3, y, 0.41, -0.2, () => P.standFrame(K, { pic: 'portrait5', metal: true, w: 0.11, h: 0.14 })); K.at(0.18, y, 0.44, -0.1, () => P.standFrame(K, { pic: 'kid2', col: 0xf0ead8, w: 0.1, h: 0.13 })); K.at(-0.17, y, 0.44, 0.05, () => P.standFrame(K, { pic: 'portrait0', col: 0x2a2420, w: 0.09, h: 0.12 }));
      K.box(M.brass, 0.6, 0.75, 0.03, 0, 1.42, 0.295, { r: 0.012 }); K.plane(M.mirror, 0.5, 0.65, 0, 1.795, 0.3105, {});
    });
    K.at(0, 0, -1.1, 0, () => K.box(M.carpet, 1.2, 0.012, 0.6, 0, 0, 0, { r: 0.005, col: 0x5a2a2a }));
    // left alcove: television; right alcove: china cabinet
    let sm;
    K.prop(-1.42, 0, -d / 2 + 0.03, 0.12, () => { P.tvUnit(K, { w: 1.0, h: 0.56, d: 0.42, col: C.mahog }); F.doily(K, 0, 0.582, 0.22, 0.5); K.at(0, 0.584, 0.2, 0, () => { sm = P.tv(K, { w: 0.8, on, k: K.night ? 1.6 : 2.4, rect: 'tv1' }); }); });
    K.prop(1.42, 0, -d / 2 + 0.02, 0, () => { const cw = 1.0, cd = 0.36, col = C.mahog;
      K.box(M.woodGloss, cw, 0.78, cd, 0, 0, cd / 2, { r: 0.006, col }); for (const s of [-1, 1]) { K.box(M.woodGloss, cw / 2 - 0.02, 0.6, 0.016, s * cw / 4, 0.12, cd + 0.006, { r: 0.006, col }); K.sph(M.brass, 0.012, s * 0.04, 0.45, cd + 0.022, { seg: 8, seg2: 6 }); K.box(M.woodGloss, 0.03, 1.1, cd - 0.04, s * (cw / 2 - 0.015), 0.78, cd / 2 - 0.02, { r: 0.004, col }); K.box(M.woodGloss, 0.03, 1.1, 0.03, s * (cw / 2 - 0.015), 0.78, cd - 0.035, { r: 0.004, col }); }
      K.box(M.woodGloss, cw, 1.1, 0.012, 0, 0.78, 0.006, { r: 0, col: shade(col, 0.6) }); K.box(M.woodGloss, cw + 0.04, 0.05, cd, 0, 1.88, cd / 2 - 0.01, { r: 0.012, col }); K.box(M.woodGloss, 0.03, 1.1, 0.03, 0, 0.78, cd - 0.035, { r: 0.004, col });
      K.plane(M.glass, cw - 0.06, 1.1, 0, 1.33, cd - 0.035, {});
      for (let i = 0; i < 3; i++) { const sy = 0.78 + i * 0.36; K.box(M.glassTint, cw - 0.06, 0.008, cd - 0.07, 0, sy + (i ? 0 : 0.002), cd / 2 - 0.02, { r: 0, col: 0xdfe8ea }); for (let j = 0; j < 4; j++) { const x = -0.34 + j * 0.23; if ((i + j) & 1) K.cyl(M.ceramic, 0.085, 0.085, 0.008, x, sy + 0.1, 0.07, { rx: H - 0.2, c: true, col: [0xf0ece0, 0xdfe6f0, 0xf0e0e0][i], seg: 18 }); else K.lathe(M.ceramic, [[0.001, 0], [0.025, 0], [0.04, 0.05], [0.038, 0.05], [0.022, 0.006]], x, sy + 0.008, 0.16, { col: 0xf0ece0, seg: 12 }); } }
    });
    // the recliner and everything within arm's reach
    const RY = -2.6, at = (lx, lz) => [1.25 + lx * Math.cos(RY) + lz * Math.sin(RY), 1.25 - lx * Math.sin(RY) + lz * Math.cos(RY)];
    K.prop(1.25, 0, 1.25, RY, () => { F.recliner(K, { col: 0x7c5a48, mat: M.fabric }); K.plane(M.lace, 0.4, 0.4, 0, 1.06, 0.24, { rx: -0.9, col: 0xf4f0e4 }); for (const s of [-1, 1]) K.plane(M.lace, 0.24, 0.24, s * 0.33, 0.672, 0.55, { up: true, col: 0xf4f0e4 }); K.drape(M.curtain, [[0.5, 0.7], [0.5, 0.86], [0.42, 0.93], [0.15, 0.95]], 0.5, 0.05, 0, 0, { col: 0x9a8a5a, wrinkle: 0.02 }); });
    const [sx, sz] = at(-0.7, 0.42);
    K.prop(sx, 0, sz, RY, () => { P.sideTable(K, { w: 0.46, h: 0.56, col: C.mahog }); const y = 0.56; F.doily(K, 0.08, y, 0.06, 0.2);
      K.lathe(M.ceramic, [[0.001, 0], [0.03, 0], [0.065, 0.012], [0.068, 0.016], [0.03, 0.008]], 0.08, y + 0.002, 0.06, { col: 0xf0e8e0, seg: 16 }); K.lathe(M.ceramic, [[0.001, 0.008], [0.02, 0.008], [0.04, 0.05], [0.042, 0.06], [0.038, 0.06], [0.018, 0.014]], 0.08, y + 0.004, 0.06, { col: 0xf0e8e0, seg: 14 }); K.cyl(M.gloss, 0.034, 0.03, 0.002, 0.08, y + 0.05, 0.06, { col: 0x6a3a14, seg: 12 });
      F.pillBox(K, -0.08, y, 0.14, { ry: 0.3 }); F.pillBottle(K, -0.15, y, -0.02); F.pillBottle(K, -0.09, y, -0.07, { s: 0.85 }); F.pillBottle(K, -0.02, y, -0.12); F.pillBottle(K, 0.14, y, -0.12, { tipped: true });
      K.box(M.plastic, 0.045, 0.018, 0.16, 0.16, y, -0.03, { r: 0.007, ry: 0.4, col: 0x18181a }); K.box(M.plastic, 0.11, 0.05, 0.09, -0.12, y, -0.15, { r: 0.012, col: 0xf0f0ec }); K.cyl(K.emit(0xc02a22, 0.6, { key: 'alarm', base: 0xc02a22 }), 0.022, 0.022, 0.01, -0.12, y + 0.05, -0.15, { seg: 12 });
      for (const s of [-1, 1]) K.torus(M.metal, 0.02, 0.002, 0.02 + s * 0.024, y + 0.004, 0.16, { rx: H, col: 0x6a4a2a, seg: 12, rs: 4 }); K.box(M.matte, 0.12, 0.07, 0.22, 0.0, 0.2, 0, { r: 0.006, col: 0x9ab0c8 }); });
    const [ox, oz] = at(0.72, 0.25); let outlet;
    K.prop(ox, 0, oz, RY, () => { outlet = F.o2(K, { on: true }); });
    { const [ax, az] = at(0.36, 0.5), c = (x, y, z) => [x, y, z]; K.tube(M.plastic, [c(outlet.x, outlet.y, outlet.z), c(outlet.x - 0.1, 0.2, outlet.z - 0.12), c(outlet.x - 0.25, 0.02, outlet.z - 0.3), c(ax + 0.25, 0.015, az - 0.25), c(ax + 0.05, 0.3, az - 0.05), c(ax, 0.68, az), c(ax - 0.08, 0.7, az + 0.1)], 0.004, { col: 0x9ad8b0, tension: 0.5, seg: 60, rs: 5 }); }
    K.at(1.05, 0.29, -0.6, 0.5, () => F.walker(K, {}), 0, H); K.collide(0.9, 0.6, 0.6, 1.05, 0, -0.6);
    const lampA = K.prop(1.82, 0, 1.95, 0, () => P.floorLamp(K, { on, h: 1.6, shadeCol: 0xe8d8b0, col: 0x8a6a3a }), { pad: 0 });
    const [kx, kz] = at(-0.62, 0.95);
    K.prop(kx, 0, kz, 0.5, () => { K.lathe(M.wood, [[0.001, 0], [0.14, 0], [0.19, 0.2], [0.195, 0.2], [0.15, 0.015]], 0, 0, 0, { col: 0xb8986a, seg: 16 }); for (let i = 0; i < 3; i++) K.sph(M.carpet, 0.06, -0.06 + i * 0.06, 0.2, (i & 1) * 0.06 - 0.03, { col: [0x7a3a6a, 0x3a6a8a, 0xd8c8a8][i], seg: 10, seg2: 8 }); for (const s of [-1, 1]) K.cyl(M.metal, 0.003, 0.003, 0.3, s * 0.04, 0.27, 0, { rz: 0.5 * s, c: true, col: 0xb8bcc0, seg: 4 }); }, { pad: 0 });
    K.prop(0.5, 0, 0.72, 0.3, () => K.rbox(M.fabric, 0.42, 0.3, 0.42, 0, 0.03, 0, { r: 0.08, puff: 0.02, col: 0x7c5a48, seg: 4 }), { pad: 0 });
    // sideboard on the south wall, and the photograph wall above it
    K.prop(-0.85, 0, d / 2 - 0.02, PI, () => { P.tvUnit(K, { w: 1.4, h: 0.82, d: 0.42, col: C.mahog }); const y = 0.842; F.doily(K, -0.4, y, 0.22, 0.26); F.doily(K, 0.3, y, 0.2, 0.3);
      K.lathe(M.ceramic, [[0.001, 0], [0.06, 0], [0.12, 0.07], [0.125, 0.075], [0.06, 0.012]], 0.3, y + 0.002, 0.2, { col: 0xe8e0c8, seg: 18 }); for (let i = 0; i < 4; i++) K.sph(M.satin, 0.034, 0.3 + Math.cos(i * 1.6) * 0.045, y + 0.07, 0.2 + Math.sin(i * 1.6) * 0.045, { col: [0xd8791a, 0xc02a22, 0x8aa83a, 0xe0c030][i], seg: 10, seg2: 8 });
      K.at(-0.4, y + 0.002, 0.22, 0, () => { K.box(M.plastic, 0.2, 0.06, 0.16, 0, 0, 0, { r: 0.016, col: 0xe8e0d0 }); K.rbox(M.plastic, 0.22, 0.04, 0.05, 0, 0.06, -0.02, { r: 0.018, col: 0xe8e0d0, seg: 2 }); });
      [['portrait1', -0.62], ['portrait3', -0.14], ['portrait4', 0.04], ['kid0', 0.58]].forEach(([p, x], i) => K.at(x, y, 0.12 + (i & 1) * 0.05, (i - 1.5) * 0.15, () => P.standFrame(K, { pic: p, col: [0x8a7a5a, 0x2a2420, 0xe8e4da, 0x8a7a5a][i], w: 0.12 + (i & 1) * 0.03, h: 0.16 + (i & 1) * 0.03 })));
      for (let i = 0; i < 3; i++) K.box(M.matte, 0.11, 0.16, 0.002, 0.02 + i * 0.02, y + 0.08, 0.32 - i * 0.015, { r: 0, rx: -0.15, ry: 0.2 * i, col: [0xf0e8d8, 0xdfe8f0, 0xf0d8d8][i] }); });
    K.onWall('S', -0.85, () => { const pics = ['portrait0', 'land0', 'portrait2', 'portrait4', 'kid1', 'portrait5', 'land2', 'portrait1', 'portrait3'], cols = [0x2a2420, 0x8a7a5a, 0xe8e4da, 0x5a3a22];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const k = j * 3 + i, pw = 0.22 + ((k * 7) % 3) * 0.04, ph = 0.26 + ((k * 5) % 3) * 0.04; P.picture(K, (i - 1) * 0.42 + (r() - 0.5) * 0.03, 1.25 + j * 0.4 + (r() - 0.5) * 0.02, { w: pw, h: ph, pic: pics[k], col: cols[k % 4], mount: 0.03, f: 0.018, tilt: (r() - 0.5) * 0.04, mat: k % 4 === 1 ? M.brass : M.satin }); } });
    K.onWall('S', 0.75, () => { P.picture(K, 0, 1.55, { w: 0.34, h: 0.34, pic: 'calendar', mount: 0, col: 0xe8e4da, f: 0.008 }); P.clock(K, 0.0, 2.05, { r: 0.13, col: 0x6a452c, hour: K.night ? 7.9 : 3.3 }); });
    K.onWall('E', 1.45, () => { P.picture(K, 0, 1.6, { w: 0.5, h: 0.4, pic: 'land1', col: 0x8a7a5a, mat: M.brass, f: 0.03 }); P.picture(K, -0.5, 1.5, { w: 0.2, h: 0.26, pic: 'cert', col: 0x2a2420, mount: 0.015 }); });
    K.onWall('E', -1.35, () => { K.cyl(M.ceramic, 0.11, 0.11, 0.012, 0, 1.75, 0.008, { rx: H, c: true, col: 0xdfe6f0, seg: 20 }); K.cyl(M.ceramic, 0.09, 0.09, 0.012, 0.0, 1.45, 0.008, { rx: H, c: true, col: 0xf0e0e0, seg: 20 }); });
    // visitor's chair, slippers, paper
    K.prop(-1.78, 0, 1.9, 2.35, () => P.sofa(K, { w: 0.92, seats: 1, col: 0x8a7a6a, throws: [0x7a3040] }));
    for (const s of [-1, 1]) K.rbox(M.fabric, 0.1, 0.07, 0.26, 0.55 + s * 0.2, 0, 0.12 + s * 0.1, { r: 0.03, ry: -2.3 + s * 0.5, col: 0x6a3a4a, seg: 2 });
    K.plane(M.signs, 0.36, 0.27, -0.2, 0.004, 0.75, { up: true, uv: ATLAS.signs.rect.news, ry: 0.7 }); K.at(-0.75, 0, 0.62, 2.0, () => P.mug(K, 0, 0, 0, { tipped: true, col: 0xf0e8e0 })); K.stain('coffee', 0.45, 0.35, -0.85, 0.72, { col: 0x9a9a9a });
    K.switchPlate('E', 0.25, 1.2); K.socket('S', 1.2, 0.3, true); K.socket('N', -1.9, 0.3, true);
    // a long tenancy: the sill, the day's paper and post, a stick within reach, soot above the fire, the worn track to the chair
    K.onWall('W', 0.35, () => { K.at(-0.55, 0.8, 0.03, 0, () => P.plant(K, { h: 0.24, n: 10, pot: 0.055, potCol: 0xe8e0d0 })); K.at(0.5, 0.8, 0.03, 0, () => P.plant(K, { h: 0.18, n: 8, pot: 0.05, potCol: 0x9a3a2a })); K.lathe(M.ceramic, [[0.001, 0], [0.03, 0], [0.02, 0.03], [0.04, 0.07], [0.025, 0.11], [0.03, 0.12]], 0, 0.8, 0.03, { col: 0xdfe6f0, seg: 12 }); });
    K.onWall('N', 0, () => K.grime('smudge', 1.1, 0.7, 0, 2.0, 0.2846, { col: 0x8a7a68 })); K.grime('wear', 1.6, 1.0, 0.6, 0.0066, 0.3, { up: true, ry: 0.9, col: 0xc8b8a0 });
    K.at(-1.2, h, 1.1, 0, () => P.smokeAlarm(K)); K.onWall('S', 1.75, () => P.vent(K, 0, 2.25, {}));
    K.drop([[1.95, 0.55], [0.35, 1.95], [2.0, 0.2]], 0.08, () => P.stick(K, { lean: 0.16 }), -H, { under: true });
    K.drop([[0.3, 1.75], [-0.1, 1.2], [1.9, 0.3]], 0.2, () => { P.pile(K, { n: 6, w: 0.3, d: 0.38, cover: null }); P.paperFolded(K, 0.02, 0.035, 0, 0.3); }, 0.6);
    K.drop([[-1.85, -0.9], [-1.9, -1.4]], 0.12, () => P.extension(K, { plugs: 3 }), H, { under: true });
    K.at(-0.85, 0.842, d / 2 - 0.02, PI, () => K.at(0.55, 0, 0.3, 0.2, () => P.mail(K, { n: 5, spread: 0.1 })));
    const pend = K.at(-0.2, h, 0.2, 0, () => { K.cyl(M.plaster, 0.22, 0.24, 0.02, 0, -0.02, 0, { col: 0xf0ece0, seg: 24 }); return P.pendant(K, { kind: 'cone', drop: 0.3, on: K.lampsOn, r: 0.22, col: 0xe8d8b0 }); });
    const fl = K.point(0, 0.45, -d / 2 + 0.75, { col: 0xff7a2a, int: K.night ? 1.6 : 1.0, dist: 4 });
    K.on((dt, t) => { const f = 0.92 + 0.05 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 23.7); fire.emissiveIntensity = 3.2 * f; fl.intensity = (K.night ? 1.6 : 1.0) * f; });
    const tvP = K.world(-1.3, 0.95, -d / 2 + 0.75), tvL = K.point(tvP.x, tvP.y, tvP.z, { col: 0x9ab8ff, int: K.night ? 1.3 : 0.5, dist: 5 }); tvFlicker(K, sm, tvL, K.night ? 1.6 : 2.4, K.night ? 1.3 : 0.5);
    K.point(lampA.x, lampA.y, lampA.z, { col: 0xffcf9a, int: K.day ? 2.2 : 5.2 });
    if (K.day) { K.hemi(0xd6dce6, 0x8a6a5a, 0.2); if (!K.rain) K.sun(266, 27, SUN, 5.8, { soft: 3.5 }); else K.sun(266, 45, 0xdfe6f0, 0.6, { shadow: false }); K.spot(-w / 2 - 1.1, 1.7, 0.35, 0.4, 0.4, 0.2, { col: SKYFILL, int: K.rain ? 57 : 13, angle: 0.85, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 }); }
    else { K.hemi(0x40465a, 0x3a2a24, K.dusk ? 0.08 : 0.03); if (K.dusk) K.sun(268, 8, DUSKSUN, 2.0, { soft: 3 }); K.spot(pend.x, pend.y, pend.z, pend.x, 0, pend.z, { col: WARM, int: 7, angle: 1.15, pen: 0.9, shadow: !K.dusk, soft: 5 }); K.point(pend.x, pend.y + 0.1, pend.z, { col: WARM, int: 0.7, dist: 5 }); }
    const seat = at(0, 0.56);
    K.spots({ floor: [-0.72, -0.38, H], seat: [seat[0], 0.48, seat[1], RY], side: -1, by: [[1.3, 0.0], [-1.0, 0.8]], cam: [0.3, 1.35, 0.95], target: [-0.75, 0.25, -0.4], seatView: { cam: [-0.45, 1.25, 0.35], target: [seat[0], 0.8, seat[1]], partner: [0.6, 0, 0.0], kit: [-0.05, 0, 1.0] } });
    return { exposure: K.day ? 1.05 : 1.15, bloom: 0.14, envInt: K.day ? 1.0 : 0.65 };
  },
};
