// Interior sets: kitchen, bathroom, bedroom. Layout, clutter and lighting numbers for each room are here.

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';
import { F } from './sets-fixtures.js';
import { SUN, SKYFILL, WARM, DUSKSUN } from './sets-home.js';

const PI = Math.PI, H = PI / 2;

export const HOME2 = {
  kitchen(K) {
    const w = 3.6, d = 4.3, h = 2.4, r = K.rng, on = K.lampsOn, cab = 0xcfd6c8, topC = 0x4c4c50;
    const Fr = K.room({ w, d, h, wallCol: 0xe6e1cf, floorMat: M.floorStone, floorCol: 0xe0d8cc, cove: 0.05, wear: 0.8, wearCol: 0x8a8274, openings: [{ id: 'win', wall: 'N', at: -0.3, w: 1.2, y0: 1.07, y1: 2.02 }, { id: 'door', wall: 'E', at: 1.5, w: 0.84 }] });
    K.window(Fr.win, { cols: 2, blind: { kind: 'roller', drop: 0.2, col: 0xe6d8b8 } });
    K.door(Fr.door, { open: 1.65, hinge: 1, swing: -1, beyond: { depth: 1.5, w: 1.8, off: -0.25, glow: on ? 3 : 0, floorCol: 0x7a6a58 } });
    // north run with the sink under the window
    K.prop(0.3, 0, -d / 2, 0, () => {
      F.baseUnits(K, { len: 3.0, col: cab, topCol: topC, units: [{ w: 0.5, type: 'door' }, { w: 0.8, type: 'door' }, { w: 0.6, type: 'drawers' }, { w: 0.6, type: 'door' }, { w: 0.5, type: 'door', hinge: -1 }], hole: { x: -0.6, w: 0.5, z0: 0.11, z1: 0.5 } });
      F.sink(K, { x: -0.6, drain: 1 });
      K.box(M.subway, 3.0, 0.16, 0.008, 0, 0.908, 0.004, { r: 0, uvo: [0, 0.08, 0] }); K.box(M.subway, 1.5, 0.36, 0.008, 0.75, 1.068, 0.004, { r: 0, uvo: [0.75, 0.34, 0] }); K.box(M.subway, 0.3, 0.36, 0.008, -1.35, 1.068, 0.004, { r: 0, uvo: [-1.35, 0.34, 0] });
      K.at(0.825, 0, 0, 0, () => F.wallUnits(K, { len: 1.35, col: cab, glow: on ? 5 : 0 }));
      // worktop clutter
      const y = 0.908;
      F.kettle(K, 0.42, y, 0.3, { ry: 0.6 }); F.toaster(K, 0.78, y, 0.3, { ry: 0.1 }); F.microwave(K, 1.22, y, 0.3, { ry: -0.05 });
      for (let i = 0; i < 3; i++) K.cyl(M.ceramic, 0.05, 0.05, 0.12 + i * 0.02, -1.33 + i * 0.0, y, 0.14 + i * 0.12, { col: [0x9a3a2a, 0xe8e0c8, 0x3a5a6a][i], seg: 16 });
      K.box(M.wood, 0.11, 0.2, 0.09, -1.12, y, 0.2, { r: 0.006, col: C.walnut, rx: -0.3 }); for (let i = 0; i < 4; i++) K.box(M.plastic, 0.018, 0.07, 0.012, -1.15 + i * 0.022, y + 0.17, 0.14, { r: 0.004, rx: -0.3, col: 0x161616 });
      P.bottle(K, -0.3, y, 0.07, { kind: 'squeeze', col: 0x3a9a4a, s: 1.1 }); K.rbox(M.matte, 0.1, 0.03, 0.065, -0.17, y, 0.08, { r: 0.01, col: 0xe8c832, seg: 1 });
      // dish rack on the drainer
      for (let i = 0; i < 5; i++) K.cyl(M.ceramic, 0.11, 0.11, 0.006, 0.05 + i * 0.035, y + 0.115, 0.3, { rz: H + 0.25, c: true, col: 0xf0eee6, seg: 20 });
      K.box(M.chrome, 0.3, 0.008, 0.008, 0.1, y + 0.012, 0.19, { r: 0.003 }); K.box(M.chrome, 0.3, 0.008, 0.008, 0.1, y + 0.012, 0.41, { r: 0.003 }); P.mug(K, 0.18, y + 0.105, 0.42, { col: 0xd8e2e8, full: false, ry: 1 });
      K.lathe(M.ceramic, [[0.001, 0], [0.045, 0], [0.055, 0.12], [0.05, 0.125], [0.042, 0.01]], -0.95, y, 0.12, { col: 0xe8e0c8, seg: 14 }); for (let i = 0; i < 5; i++) K.cyl(M.wood, 0.005, 0.005, 0.26 + i * 0.01, -0.95 + (r() - 0.5) * 0.04, y + 0.02, 0.12 + (r() - 0.5) * 0.04, { rz: (r() - 0.5) * 0.3, rx: (r() - 0.5) * 0.3, col: r.pick([C.beech, 0x1a1a1a, 0xb8bcc0]), seg: 6 });
    });
    // west run with the cooker, then the fridge
    K.prop(-w / 2, 0, -0.9, H, () => {
      F.baseUnits(K, { len: 2.5, col: cab, top: false, units: [{ w: 0.5, type: 'door' }, { w: 0.6, type: 'gap' }, { w: 0.8, type: 'door' }, { w: 0.6, type: 'door' }] });
      F.worktop(K, { len: 0.5, x: -1.0, col: topC }); F.worktop(K, { len: 1.4, x: 0.55, col: topC });
      K.box(M.subway, 2.5, 0.51, 0.008, 0, 0.908, 0.004, { r: 0, uvo: [0, 0.255, 0] });
      let top; K.at(-0.45, 0, 0, 0, () => { top = F.cooker(K); F.hood(K, { on }); F.pan(K, -0.14, top, 0.43, { ry: 2.4 }); K.cyl(M.wood, 0.006, 0.008, 0.3, -0.1, top + 0.07, 0.4, { rz: 1.0, ry: 0.5, c: true, col: C.beech, seg: 6 });
        K.drape(M.curtain, [[0.38, 0.652], [0.6, 0.652], [0.612, 0.665], [0.5, 0.672], [0.34, 0.674]], 0.2, 0.1, 0, 0, { col: 0xb04a3a, wrinkle: 0.006, seg: 12, segW: 3 }); });
      K.at(-1.0, 0, 0, 0, () => F.wallUnits(K, { len: 0.5, col: cab })); K.at(0.55, 0, 0, 0, () => F.wallUnits(K, { len: 1.4, col: cab, glow: on ? 5 : 0 }));
      const y = 0.908; K.box(M.wood, 0.4, 0.02, 0.28, 0.35, y, 0.3, { r: 0.006, col: C.beech, ry: 0.1 }); K.rbox(M.matte, 0.24, 0.1, 0.11, 0.35, y + 0.02, 0.3, { r: 0.045, col: 0xb07a3a, seg: 3, ry: 0.3 }); K.box(M.steel, 0.2, 0.003, 0.02, 0.36, y + 0.022, 0.42, { r: 0, ry: 0.1 });
      K.lathe(M.ceramic, [[0.001, 0], [0.07, 0], [0.13, 0.06], [0.135, 0.065], [0.07, 0.012]], 0.95, y, 0.3, { col: 0x3a5a7a, seg: 20 }); for (let i = 0; i < 5; i++) K.sph(M.satin, 0.036, 0.95 + Math.cos(i * 1.3) * 0.05, y + 0.06 + (i === 4 ? 0.04 : 0), 0.3 + Math.sin(i * 1.3) * 0.05, { col: [0xd8791a, 0xc02a22, 0x8aa83a, 0xd8791a, 0xe0c030][i], seg: 10, seg2: 8 });
      P.bottle(K, -1.1, y, 0.18, { kind: 'wine', col: 0x1a2a1c }); P.bottle(K, -0.92, y, 0.14, { kind: 'squeeze', col: 0xd8b020 });
    });
    K.prop(-w / 2 + 0.01, 0, 0.72, H, () => F.fridge(K, {}));
    // table and chairs
    K.prop(0.9, 0, 1.3, 0, () => { P.table(K, { w: 1.1, d: 0.76, col: C.pine });
      const y = 0.75; P.plate(K, -0.25, y, 0.12, { food: 'crumbs' }); K.box(M.steel, 0.012, 0.003, 0.19, -0.1, y, 0.13, { r: 0.001, ry: 0.2 }); P.mug(K, 0.3, y, -0.15, { col: 0xb8483a, ry: 2 });
      K.box(M.satin, 0.14, 0.26, 0.06, 0.2, y, 0.18, { r: 0.003, ry: 0.5, col: 0xe0a020 }); K.plane(M.signs, 0.13, 0.25, 0.2 + Math.sin(0.5) * 0.031, y + 0.13, 0.18 + Math.cos(0.5) * 0.031, { ry: 0.5, uv: ATLAS.signs.rect.cereal });
      K.plane(M.signs, 0.36, 0.27, -0.2, y + 0.002, -0.14, { up: true, uv: ATLAS.signs.rect.news, ry: -0.2 }); P.glass(K, -0.42, y, -0.02, { fill: 0.4, col: 0xe8a020 });
    });
    K.prop(0.9, 0, 2.0, PI, () => P.chair(K, { col: C.pine })); K.prop(0.1, 0, 1.35, H + 0.2, () => P.chair(K, { col: C.pine }));
    K.at(0.72, 0.21, 0.66, 0.5, () => P.chair(K, { col: C.pine }), 0, H); K.collide(0.95, 0.45, 0.5, 0.75, 0, 0.66);
    K.prop(1.56, 0, 0.55, 0, () => F.bin(K, {}));
    // the story: breakfast interrupted
    K.at(-0.62, 0, 0.6, 0.7, () => P.mug(K, 0, 0, 0, { tipped: true, col: 0xe8e2d0 })); K.stain('coffee', 0.6, 0.45, -0.5, 0.72);
    K.prop(-0.35, 0, -1.3, 0, () => P.rug(K, { w: 0.9, d: 0.48, col: 0x4a6a6a, border: 0x3a5252 }), { collide: false });
    // walls
    K.onWall('S', -0.75, () => { P.radiator(K, { w: 0.9, h: 0.6 }); P.picture(K, 0, 1.55, { w: 0.56, h: 0.36, pic: 'notice', atlas: 'signs', mount: 0.0, col: C.pine, mat: M.wood, f: 0.025 }); });
    K.onWall('S', 0.6, () => P.picture(K, 0, 1.55, { w: 0.3, h: 0.3, pic: 'calendar', mount: 0.0, col: 0xe8e4da, f: 0.008 }));
    K.onWall('E', -0.6, () => { P.clock(K, 0, 1.85, { r: 0.15, col: 0xc0392b, hour: K.night ? 9.2 : 8.2 }); P.picture(K, 0.9, 1.5, { w: 0.4, h: 0.5, pic: 'art1', col: 0xe8e4da }); });
    K.switchPlate('E', 0.9, 1.2, 2); K.socket('N', 1.3, 1.12); K.socket('N', 0.55, 1.12, false); K.socket('W', -1.5, 1.12);
    // lived in: the sill, what the floor collects in front of the cooker and sink, bags by the fridge, post on the table
    K.onWall('N', -0.3, () => { K.at(0.36, 1.07, 0.02, 0, () => P.plant(K, { h: 0.2, n: 10, pot: 0.05, potCol: C.terracotta })); K.at(0.14, 1.07, 0.02, 0, () => P.plant(K, { h: 0.14, n: 8, pot: 0.045, potCol: 0xe8e2d0 })); K.lathe(M.glassTint, [[0.001, 0], [0.03, 0], [0.034, 0.1], [0.02, 0.12], [0.022, 0.15]], -0.42, 1.07, 0.025, { col: 0x9ad0c0, seg: 12 }); });
    K.onWall('N', 1.45, () => P.vent(K, 0, 2.25, {})); K.at(1.0, h, -0.2, 0, () => P.smokeAlarm(K)); K.onWall('S', 0.15, () => P.thermostat(K, 0, 1.45));
    K.grime('smudge', 0.9, 0.7, -1.0, 0.0062, -1.25, { up: true, ry: 0.4, col: 0x6a5a48 }); K.grime('smudge', 0.8, 0.5, -0.3, 0.0064, -1.35, { up: true, ry: 2.1, col: 0x7a7468 }); K.grime('wear', 1.6, 1.0, -0.2, 0.0066, -0.9, { up: true, ry: 0.2, col: 0x8a8274 });
    K.onWall('W', -1.35, () => K.grime('smudge', 0.7, 0.5, 0, 1.2, 0.0125, { col: 0x9a8a6a }));   // grease haze on the tiles behind the hob
    K.at(0.9, 0.75, 1.3, 0, () => { K.at(-0.38, 0, -0.2, 0.3, () => P.mail(K, { n: 4, spread: 0.12 })); P.meds(K, 0.42, 0, 0.02, { n: 3, spread: 0.1 }); P.rings(K, 0.1, 0, 0.1, { n: 3, spread: 0.4 });
      K.box(M.plastic, 0.055, 0.016, 0.095, 0.3, 0, 0.26, { r: 0.006, ry: 0.5, col: 0x2a4a8a }); K.box(M.darkGlass, 0.036, 0.002, 0.03, 0.3, 0.016, 0.25, { r: 0, ry: 0.5 }); K.cyl(M.plastic, 0.012, 0.012, 0.07, 0.38, 0.012, 0.33, { rz: H, c: true, col: 0xe8e8e4, seg: 8 }); });   // glucose meter and pen
    K.drop([[-1.4, 1.5], [-1.45, 1.9], [1.5, 1.95]], 0.22, () => { K.collide(0.4, 0.3, 0.32); K.ao(0.95, 0.6, 0.15, 0.017, 0, { k: 0.42 }); P.carton(K, 0.36, 0.24, 0.28, 0, 0, 0, { ry: 0.2, tape: false }); for (let i = 0; i < 4; i++) P.bottle(K, -0.1 + (i % 2) * 0.16, 0.02, -0.06 + (i >> 1) * 0.12, { kind: i ? 'wine' : 'squeeze', col: [0xe8e0d0, 0x1e3a22, 0x6a3a12, 0x1e3a22][i] }); K.heap(M.satin, 0.34, 0.22, 0.26, 0.36, 0, 0.05, { col: 0xb8bcc2, amp: 0.34, freq: 2.4 }); }, 0.1);
    K.drop([[1.5, 1.0], [1.55, 1.5], [1.45, -0.6]], 0.15, () => P.shoes(K, { kind: 'slipper', col: 0x6a4a5a }), -H);
    K.scatter(7, [-1.1, -1.5, 0.6, -0.9], 0.02, () => K.box(M.matte, 0.006 + K.rng() * 0.008, 0.003, 0.006, 0, 0, 0, { r: 0, col: 0xc89a54 }), { under: true });
    const pend = K.at(0.9, h, 1.3, 0, () => P.pendant(K, { kind: 'metal', drop: 0.62, on, col: 0x3d6f6a, r: 0.19 }));
    const ceil = K.at(-0.1, h, -0.5, 0, () => P.fluoro(K, { len: 1.2, on, col: 0xfff4e0, k: 8, twin: true }));
    if (K.day) {
      K.hemi(0xcad8ea, 0x8a8478, 0.2);
      if (!K.rain) K.sun(188, 43, SUN, 6.5); else K.sun(188, 50, 0xdfe6f0, 0.6, { shadow: false });
      K.spot(-0.3, 1.8, -d / 2 - 1.0, 0, 0.4, 0.4, { col: SKYFILL, int: K.rain ? 62 : 14, angle: 0.8, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 });
    } else {
      K.hemi(0x40465a, 0x3a3630, K.dusk ? 0.08 : 0.03);
      if (K.dusk) K.sun(205, 10, DUSKSUN, 2.0, { soft: 3 });
      K.spot(ceil.x, ceil.y, ceil.z, ceil.x, 0, ceil.z, { col: 0xfff0dc, int: 9.5, angle: 1.25, pen: 0.85, shadow: !K.dusk, soft: 5 });
      K.point(pend.x, pend.y - 0.1, pend.z, { col: 0xffcf9a, int: 4.2, dist: 6 }); K.point(0.6, 1.25, -d / 2 + 0.45, { col: 0xfff0d8, int: 1.8, dist: 3 });
    }
    K.spots({ floor: [0.15, -0.35, H], seat: [0.1, 0.46, 1.35, H + 0.2], side: -1, by: [[1.3, 0.2], [0.3, 2.0]], cam: [1.25, 1.3, 0.55], target: [-0.1, 0.25, -0.5], seatView: { cam: [-0.75, 1.3, 0.3], target: [0.1, 0.8, 1.35], partner: [-0.45, 0, 1.8], kit: [-0.55, 0, 0.95] } });
    return { exposure: K.day ? 1.0 : 1.15, bloom: K.day ? 0.14 : 0.16, envInt: K.day ? 1.0 : 0.6 };
  },

  bathroom(K) {
    const w = 2.4, d = 2.9, h = 2.35, r = K.rng, on = K.lampsOn;
    const Fr = K.room({ w, d, h, wallMat: M.wallTile, wallCol: 0xf2f2ee, dado: { h: 1.2, col: 0xb9cdd4 }, floorMat: M.floorStone, floorCol: 0xb9bdc0, skirt: 0, ceilCol: 0xf4f4f2, wear: 0.35, wearCol: 0x6a6e70, openings: [{ id: 'win', wall: 'W', at: 0.45, w: 0.62, y0: 1.32, y1: 2.0 }, { id: 'door', wall: 'S', at: 0.6, w: 0.76 }] });
    // frosted window
    K.window(Fr.win, { cols: 1, glass: false, backdrop: null, shaft: 0.5 });
    K.at(Fr.win.x, 0, Fr.win.z, Fr.win.ry, () => K.plane(K.emit(0xdfeaf2, K.day ? (K.rain ? 1.6 : 3.2) : K.dusk ? 0.8 : 0.03, { key: 'frost', base: 0x8a9298, rough: 0.6 }), 0.56, 0.62, 0, 1.66, -0.09, {}));
    K.door(Fr.door, { open: 1.5, hinge: -1, swing: -1, beyond: { depth: 1.3, w: 1.7, off: 0.2, glow: on ? 3 : 0, floorCol: 0x7a6a58 } });
    // bath along the north wall with a shower over it
    K.prop(-0.34, 0, -d / 2, 0, () => {
      const rim = F.bath(K, { l: 1.7, w: 0.7, taps: -1 });
      K.tube(M.chrome, [[-0.8, rim + 0.3, 0.35], [-0.8, 2.0, 0.35], [-0.72, 2.08, 0.35], [-0.55, 2.06, 0.35]], 0.011, { tension: 0.5, seg: 20 }); K.cyl(M.chrome, 0.09, 0.02, 0.03, -0.52, 2.035, 0.35, { seg: 18, rz: -0.25 });
      K.box(M.chrome, 0.05, 0.14, 0.12, -0.83, rim + 0.25, 0.35, { r: 0.012 }); K.tube(M.chrome, [[-0.82, rim + 0.25, 0.4], [-0.7, rim + 0.05, 0.5], [-0.6, rim + 0.2, 0.55], [-0.78, 1.5, 0.5]], 0.007, { tension: 0.5, seg: 30, rs: 6 });
      // curtain pulled halfway on a rail
      K.cyl(M.chrome, 0.012, 0.012, 1.7, 0, 1.98, 0.68, { rz: H, c: true, seg: 8 });
      K.geo(K.curtainMat(0xe8ecee, K.day ? 0.12 : 0, 1), curtainPanel(K, 0.62, 1.82), { x: -0.5, y: 1.06, z: 0.68, uvScale: [1.2, 1.8] });
      for (let i = 0; i < 3; i++) P.bottle(K, 0.42 + i * 0.09, rim, 0.08, { kind: i === 1 ? 'spray' : 'squeeze', col: [0x3a7ab0, 0xe8e0d0, 0x8a3a8a][i], s: 1.05 });
      K.rbox(M.matte, 0.09, 0.03, 0.06, 0.12, rim, 0.07, { r: 0.012, col: 0xf0e8d0, seg: 1 }); K.box(M.gloss, 0.14, 0.012, 0.1, 0.12, rim - 0.002, 0.07, { r: 0.004, col: 0xdfe8ea });
    });
    K.at(-0.3, 0, -0.43, 0.14, () => K.rbox(M.carpet, 0.78, 0.022, 0.48, 0, 0, 0, { r: 0.01, col: 0x6a8a9a, seg: 2 }));
    K.stain('water', 0.7, 0.5, 0.25, -0.35, { ry: 0.4 }); K.stain('water', 0.35, 0.3, -0.75, 0.05);
    // basin and mirror on the east wall, toilet beside it
    K.prop(w / 2, 0, -0.2, -H, () => {
      const bh = F.basin(K, {});
      K.rbox(M.matte, 0.08, 0.025, 0.05, -0.2, bh, 0.07, { r: 0.01, col: 0xd8e8d0, seg: 1 }); K.lathe(M.ceramic, [[0.001, 0], [0.03, 0], [0.034, 0.09], [0.03, 0.09], [0.028, 0.008]], 0.21, bh, 0.06, { col: 0xdfe8ea, seg: 12 });
      for (let i = 0; i < 2; i++) K.cyl(M.plastic, 0.004, 0.005, 0.17, 0.2 + i * 0.02, bh + 0.02, 0.06, { rz: -0.2 + i * 0.4, col: [0x2a7ab0, 0xc0392b][i], seg: 6 });
      // mirrored cabinet with a strip light above
      K.box(M.satin, 0.62, 0.72, 0.12, 0, 1.2, 0.06, { r: 0.006, col: 0xf0f0ec }); K.mirror(0.56, 0.66, 0, 1.56, 0.1215, {});
      K.box(M.satin, 0.5, 0.05, 0.07, 0, 1.96, 0.05, { r: 0.01, col: 0xe8e8e4 }); K.box(on ? K.emit(0xfff4e4, 7, { key: 'strip' }) : M.ceramic, 0.44, 0.03, 0.02, 0, 1.955, 0.09, { r: 0.008, col: 0xf4f4f0 });
      K.box(M.gloss, 0.5, 0.012, 0.11, 0, 1.12, 0.055, { r: 0.004, col: 0xdfe8ea }); F.pillBottle(K, -0.16, 1.132, 0.055); F.pillBottle(K, -0.1, 1.132, 0.06, { s: 0.85 }); F.pillBottle(K, 0.02, 1.132, 0.05, { tipped: true }); P.bottle(K, 0.16, 1.132, 0.055, { kind: 'spray', col: 0x1a1a1c, s: 0.7 });
    });
    K.prop(w / 2, 0, 0.82, -H, () => { F.toilet(K, {}); K.at(-0.3, 0, 0.12, 0, () => { K.lathe(M.plastic, [[0.001, 0], [0.05, 0], [0.045, 0.14], [0.04, 0.14]], 0, 0, 0, { col: 0xf0f0ec, seg: 12 }); K.cyl(M.plastic, 0.008, 0.008, 0.36, 0, 0.02, 0, { col: 0xf0f0ec, seg: 6 }); }); });
    K.onWall('E', 0.33, () => F.loorollHolder(K, 0.68));
    for (let i = 0; i < 2; i++) K.cyl(M.matte, 0.055, 0.055, 0.1, w / 2 - 0.09, i * 0.1, 1.3 + i * 0.012, { col: 0xf6f4ee, seg: 16 });
    // south wall: towel radiator and hook; corner: laundry basket and scales
    K.onWall('S', -0.72, () => F.towelRail(K, { w: 0.5, h: 1.0, y: 0.55 }));
    K.onWall('S', -0.15, () => { K.cyl(M.chrome, 0.008, 0.008, 0.05, 0, 1.75, 0.025, { rx: H, c: true, seg: 6 }); K.sph(M.chrome, 0.014, 0, 1.75, 0.055, { seg: 8, seg2: 6 }); K.drape(M.curtain, [[0.75, 0.03], [1.5, 0.035], [1.75, 0.06], [1.5, 0.075], [0.85, 0.08]], 0.36, 0, 0, 0, { col: 0x8a3a4a, wrinkle: 0.02, seg: 16, segW: 5, flare: -0.05 }); });
    K.prop(1.0, 0, 1.27, 0, () => { K.lathe(M.wood, [[0.001, 0], [0.14, 0], [0.165, 0.45], [0.17, 0.45], [0.15, 0.02]], 0, 0, 0, { col: 0xa8885a, seg: 18 }); K.rbox(M.fabric, 0.25, 0.12, 0.24, 0, 0.38, 0, { r: 0.05, puff: 0.03, col: 0xd8d4cc, seg: 3, wrinkle: 0.02 }); }, { pad: 0 });
    K.rbox(M.plastic, 0.3, 0.025, 0.3, -0.82, 0, 0.55, { r: 0.012, col: 0x2a2a2e, seg: 2, ry: 0.15 });
    K.at(0, h, 0, 0, () => { K.box(M.plastic, 0.2, 0.02, 0.2, 0.75, -0.02, -1.0, { r: 0.006, col: 0xeeeeea }); for (let i = 0; i < 5; i++) K.box(M.matte, 0.16, 0.004, 0.01, 0.75, -0.024, -1.07 + i * 0.035, { r: 0, col: 0x888888 }); });
    K.switchPlate('S', 1.08, 1.25);
    // damp and use: runs under the window and the cistern, limescale haze round the bath, things left on the floor
    K.onWall('W', 0.45, () => K.grime('drip', 0.7, 0.5, 0, 1.06, 0.0046, { col: 0x7a8078 })); K.onWall('N', -0.3, () => K.grime('drip', 1.5, 0.35, 0, 0.74, 0.0046, { col: 0x8a8a80 }));
    K.onWall('N', 0.9, () => K.grime('smudge', 0.6, 0.6, 0, 2.05, 0.0046, { col: 0x5a5e58 })); K.at(1.05, h - 0.003, -1.3, 0, () => K.grime('smudge', 0.7, 0.6, 0, 0, 0, { rx: H, col: 0x6a6a62 }));
    K.grime('smudge', 0.9, 0.3, -0.3, 0.0062, -0.72, { up: true, col: 0x6a7074 });
    K.drop([[0.25, 1.15], [-0.6, 1.2], [-0.9, 0.9]], 0.2, () => { K.rumple(M.curtain, 0.75, 0.5, 0.08, 0, 0, 0, { col: 0xd8d4c8 }); K.ao(0.75, 0.6, 0, 0.003, 0, { k: 0.3 }); }, 0.4);
    K.drop([[-0.95, 1.2], [-0.9, 0.35]], 0.1, () => P.bottle(K, 0, 0.03, 0, { kind: 'squeeze', col: 0x3a7ab0 }));
    const ceil = K.at(-0.15, h, 0.25, 0, () => P.flush(K, { on, r: 0.15, warm: 0xfff2e2, k: 4 }));
    if (K.day) {
      K.hemi(0xd6e0ea, 0x8a8e92, 0.18);
      if (!K.rain) K.sun(262, 36, SUN, 5.0, { soft: 6 });
      K.spot(-w / 2 - 0.9, 1.8, 0.45, 0.4, 0.5, 0.2, { col: SKYFILL, int: K.rain ? 42 : 12, angle: 0.75, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 });
    } else {
      K.hemi(0x40465a, 0x30343a, 0.03);
      K.spot(ceil.x, ceil.y, ceil.z, ceil.x, 0, ceil.z, { col: 0xfff2e2, int: 7, angle: 1.3, pen: 0.8, shadow: true, near: 0.1, soft: 5 });
      K.point(ceil.x, ceil.y - 0.05, ceil.z, { col: 0xfff2e2, int: 0.4 }); K.point(w / 2 - 0.3, 1.9, -0.2, { col: 0xfff4e4, int: 1.4, dist: 3 });
    }
    K.spots({ floor: [-0.45, 0.47, 0], side: 1, by: [[0.6, 1.75]], cam: [0.3, 1.5, 1.2], target: [-0.45, 0.25, 0.0], partner: [-0.95, 0, 0.2], kit: [0.1, 0, -0.2] });
    return { exposure: K.day ? 0.95 : 1.05, bloom: 0.12, envInt: K.day ? 1.0 : 0.6, envPos: [-0.2, 1.3, 0.3], cameraBounds: new THREE.Box3(new THREE.Vector3(-w / 2 + 0.2, 0.25, -0.7), new THREE.Vector3(w / 2 - 0.2, h - 0.2, d / 2 - 0.2)) };
  },

  bedroom(K) {
    const w = 3.9, d = 4.0, h = 2.4, r = K.rng, on = K.lampsOn;
    const Fr = K.room({ w, d, h, wallCol: 0xd8d4c6, floorMat: M.carpet, floorCol: 0xa89a84, cove: 0.06, wear: 0.6, walls: { N: { mat: M.wallpaper('stripe'), col: 0xf0ece0 } }, openings: [{ id: 'win', wall: 'W', at: 0.7, w: 1.3, y0: 0.85, y1: 2.05 }, { id: 'door', wall: 'S', at: 1.35, w: 0.82 }] });
    K.window(Fr.win, { cols: 2, curtain: { col: 0x5d6a80, open: 0.55 } });
    K.onWall('W', 0.7, () => P.radiator(K, { w: 1.0, h: 0.5 }));
    K.door(Fr.door, { open: 1.45, hinge: 1, swing: -1, beyond: { depth: 1.4, w: 1.8, off: -0.3, glow: on ? 2.5 : 0, floorCol: 0x8a7a66 } });
    let bedTop = 0.59, lampP;
    K.prop(-0.3, 0, -d / 2 + 0.01, 0, () => { bedTop = F.bed(K, { w: 1.5, l: 2.03, col: 0x8493a8, head: 0x6a5a4c, mess: 0.5, throwCol: 0x9a5a3a }); });
    K.prop(0.72, 0, -d / 2 + 0.02, 0, () => { const t = F.bedside(K, {}); K.at(-0.06, t, 0.16, 0, () => { lampP = P.tableLamp(K, { on, baseCol: 0xd8d2c4, s: 0.9 }); }); F.pillBottle(K, 0.13, t, 0.3); F.pillBottle(K, 0.05, t, 0.33, { tipped: true }); F.pillBottle(K, 0.17, t, 0.2, { s: 0.85 }); P.glass(K, 0.14, t, 0.1, { fill: 0.5, col: 0xcfe0e8 }); K.box(M.plastic, 0.07, 0.008, 0.14, -0.12, t, 0.33, { r: 0.003, ry: 0.3, col: 0x101012 }); });
    K.prop(-1.32, 0, -d / 2 + 0.02, 0, () => { const t = F.bedside(K, {}); K.at(0, t, 0.16, 0, () => P.tableLamp(K, { on: false, baseCol: 0xd8d2c4, s: 0.9 })); K.box(M.satin, 0.13, 0.03, 0.19, 0.1, t, 0.3, { r: 0.003, ry: 0.3, col: 0x7a2a2a }); K.box(M.plastic, 0.1, 0.06, 0.06, -0.12, t, 0.31, { r: 0.008, col: 0x1a1a1c }); K.plane(K.screen(1.5, 'clk'), 0.08, 0.035, -0.12, t + 0.032, 0.342, { uv: ATLAS.screens.rect.clockRed }); });
    K.prop(w / 2 - 0.01, 0, -0.95, -H, () => F.wardrobe(K, { w: 1.55, col: C.oak, open: 0, ang: 0.85 }));
    K.onWall('N', -0.3, () => P.picture(K, 0, 1.62, { w: 0.8, h: 0.5, pic: 'land2', col: 0xe8e4da, mount: 0.05 }));
    K.onWall('E', 0.75, () => { K.box(M.wood, 0.5, 1.4, 0.025, 0, 0.35, 0.0125, { r: 0.006, col: C.oak }); K.plane(M.mirror, 0.42, 1.32, 0, 1.05, 0.026, {}); });
    K.onWall('S', -0.5, () => { P.picture(K, 0, 1.5, { w: 0.4, h: 0.5, pic: 'portrait4', col: 0x2a2420 }); P.picture(K, 0.55, 1.55, { w: 0.26, h: 0.32, pic: 'portrait1', col: 0x8a7a5a }); });
    // chair with clothes, laundry, slippers
    K.prop(-1.5, 0, 1.55, 2.4, () => { P.chair(K, { col: C.walnut, seatCol: 0x8a7a5a }); K.rbox(M.fabric, 0.36, 0.08, 0.32, 0, 0.47, 0.02, { r: 0.03, wrinkle: 0.03, col: 0x3a4a6a, seg: 5 }); K.drape(M.curtain, [[0.5, 0.1], [0.9, -0.16], [0.95, -0.2], [0.6, -0.25]], 0.34, 0, 0, 0, { col: 0xc8c2b4, wrinkle: 0.02 }); });
    K.prop(1.62, 0, 1.6, 0, () => { K.lathe(M.wood, [[0.001, 0], [0.18, 0], [0.22, 0.52], [0.225, 0.52], [0.19, 0.02]], 0, 0, 0, { col: 0xb8986a, seg: 18 }); K.rbox(M.fabric, 0.32, 0.14, 0.3, 0, 0.45, 0, { r: 0.06, wrinkle: 0.035, col: 0x9a4a4a, seg: 5 }); }, { pad: 0 });
    for (const s of [-1, 1]) K.rbox(M.fabric, 0.1, 0.07, 0.27, 0.72 + s * 0.09, 0, -0.2 + s * 0.12, { r: 0.03, ry: -0.9 + s * 0.3, col: 0x6a5a7a, seg: 2 });
    K.box(M.satin, 0.13, 0.025, 0.19, 0.95, 0, 0.1, { r: 0.003, ry: 0.8, col: 0x2a4a6a }); K.at(1.0, 0, -0.35, 0, () => P.glass(K, 0, 0.033, 0, { h: 0.11 }), 0, H); K.stain('water', 0.4, 0.3, 1.1, -0.3);
    K.switchPlate('S', 0.78, 1.2); K.socket('N', 1.15, 0.3, true); K.socket('W', -1.2, 0.3);
    // lived in: washing that missed the basket, what is on the sill and the bedside, a dressing gown behind the door
    K.onWall('W', 0.7, () => { K.at(-0.4, 0.85, 0.03, 0, () => P.plant(K, { h: 0.22, n: 9, pot: 0.05, potCol: 0xe8e2d0 })); K.at(0.3, 0.85, 0.035, -0.3, () => P.standFrame(K, { pic: 'portrait3', w: 0.1, h: 0.13, col: 0x8a7a5a })); K.box(M.satin, 0.12, 0.05, 0.1, 0.05, 0.85, 0.03, { r: 0.008, col: 0xcfd8e4 }); });
    K.onWall('S', -1.55, () => P.coat(K, 0, 1.75, { col: 0x6a7a94, len: 1.05, w: 0.5 })); K.at(0.6, h, 1.3, 0, () => P.smokeAlarm(K)); K.onWall('E', 1.55, () => P.vent(K, 0, 2.2, {}));
    K.at(0.72, 0.52, -d / 2 + 0.02, 0, () => { K.box(M.plastic, 0.03, 0.065, 0.022, -0.16, 0, 0.3, { r: 0.006, col: 0x3a7ab8, rx: 0.2 }); K.box(M.plastic, 0.026, 0.022, 0.035, -0.16, 0, 0.318, { r: 0.006, col: 0x2a5a98 }); P.meds(K, -0.02, 0, 0.33, { n: 2, spread: 0.06 }); P.rings(K, 0.1, 0, 0.14, { n: 2, spread: 0.1 }); });   // inhaler by the lamp
    K.drop([[1.25, 0.95], [-1.0, 1.15], [0.2, 1.6]], 0.3, () => { P.laundry(K, { cols: [0x4a5a7a, 0xd8d4cc, 0x8a3a3a] }); K.ao(0.8, 0.7, 0, 0.017, 0, { k: 0.4 }); }, 0.5);
    K.drop([[1.35, -1.75], [1.55, 0.3]], 0.14, () => P.shoes(K, { kind: 'trainer', col: 0x3a4a6a, messy: 0.8 }), -H);
    K.drop([[-1.75, -0.6], [-1.75, -1.0]], 0.14, () => P.pile(K, { n: 4, books: true }), 0.3, { under: true });
    K.drop([[1.2, -1.82]], 0.12, () => P.extension(K, { plugs: 2 }), PI, { under: true });
    const pend = K.at(0.1, h, 0.4, 0, () => P.pendant(K, { kind: 'cone', drop: 0.3, on, r: 0.2, col: 0xe8e0d0 }));
    if (K.day) {
      K.hemi(0xcad8ea, 0x8a7c68, 0.24);
      if (!K.rain) K.sun(262, 27, SUN, 6.0); else K.sun(265, 45, 0xdfe6f0, 0.6, { shadow: false });
      K.spot(-w / 2 - 1.1, 1.7, 0.7, 0.3, 0.4, 0.5, { col: SKYFILL, int: K.rain ? 78 : 18, angle: 0.8, pen: 1, shadow: K.rain, soft: 8, near: 0.3, far: 12 });
    } else {
      K.hemi(0x40465a, 0x3a3228, K.dusk ? 0.08 : 0.03);
      if (K.dusk) K.sun(266, 8, DUSKSUN, 2.2, { soft: 3 });
      K.spot(pend.x, pend.y, pend.z, pend.x, 0, pend.z, { col: WARM, int: 7, angle: 1.15, pen: 0.9, shadow: !K.dusk, soft: 5 });
      K.point(pend.x, pend.y + 0.1, pend.z, { col: WARM, int: 0.8, dist: 5 }); K.point(lampP.x, lampP.y, lampP.z, { col: 0xffcf9a, int: 4.4 });
    }
    K.spots({ floor: [0.1, 1.05, H], bed: [0.26, bedTop, -0.45, H], side: -1, by: [[1.45, 0.1], [-1.1, 0.35]], cam: [1.1, 1.3, 1.72], target: [-0.1, 0.25, 0.8], bedView: { cam: [1.15, 1.35, 0.85], target: [0.3, 0.8, -0.45], partner: [0.83, 0, -1.05], kit: [0.7, 0, 0.3] } });
    return { exposure: K.day ? 1.12 : 1.15, bloom: K.day ? 0.14 : 0.16, envInt: K.day ? 1.0 : 0.6 };
  },
};

// shower curtain: taller folds, a little flare at the hem
function curtainPanel(K, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 40, 6), p = g.attributes.position.array, ph = K.rng() * 6;
  // uneven gathers that open out toward the hem, which hangs a little inside the bath
  for (let i = 0; i < p.length; i += 3) { const u = p[i] / w + 0.5, v = p[i + 1] / h + 0.5, uu = u + Math.sin(u * 9 + ph) * 0.035, drop = 1 - v;
    p[i + 2] = Math.sin(uu * 6.3 * TAU + ph) * 0.026 * (0.55 + drop * 0.75) + Math.sin(uu * 2.7 * TAU + ph * 2) * 0.016 * (0.4 + drop) + Math.sin(v * 7 + u * 5) * 0.004 - drop * drop * 0.035;
    p[i] += Math.sin(uu * 3.1 * TAU + ph) * 0.012 * drop; }
  g.computeVertexNormals(); return g;
}
