// Interior sets: domestic rooms (living room, kitchen, bathroom, bedroom, elderly flat, motel room).
// Each builder lays out one room with the Kit and returns { exposure, bloom, envInt, envPos }. Lighting is tuned
// per room and per time of day right here: K.day / K.dusk / K.night choose the rig.

import * as THREE from 'three';
import { TAU } from './util.js';
import { M, C, ATLAS } from './sets-tex.js';
import { shade } from './sets-kit.js';
import { P } from './sets-props.js';

const PI = Math.PI, H = PI / 2;
// daylight colours shared by the home sets
export const SUN = 0xfff1dc, SKYFILL = 0xcfdff5, WARM = 0xffddb8, DUSKSUN = 0xff9a55;

// television glow that flickers like changing shots
export function tvFlicker(K, sm, light, k, li) {
  let cur = 1, tgt = 1, next = 0;
  K.on((dt, t) => { if (t > next) { tgt = 0.55 + K.rng() * 0.6; next = t + 0.25 + K.rng() * 1.6; } cur += (tgt - cur) * Math.min(1, dt * 9); const f = cur * (0.96 + 0.04 * Math.sin(t * 31)); if (sm.emissiveIntensity !== undefined) sm.emissiveIntensity = k * f; if (light) light.intensity = li * f; });
}

export const HOME = {
  livingRoom(K) {
    const w = 4.6, d = 4.2, h = 2.4, r = K.rng, on = K.lampsOn;
    const F = K.room({ w, d, h, wallCol: 0xd9d2bf, floorMat: M.planks, floorCol: 0xd8c8b4, openings: [{ id: 'win', wall: 'N', at: -0.5, w: 1.9, y0: 0.82, y1: 2.08 }, { id: 'door', wall: 'E', at: 1.38, w: 0.84, y1: 2.03 }] });
    K.window(F.win, { cols: 3, curtain: { col: 0x6f5a4c, open: 0.86 } });
    K.door(F.door, { open: 1.75, hinge: 1, swing: -1, beyond: { depth: 1.7, w: 1.9, off: -0.3, glow: on ? 3 : 0, floorCol: 0x7a6a58, pic: () => P.picture(K, 0.3, 1.5, { w: 0.4, h: 0.5, pic: 'art1' }) } });
    K.onWall('N', -0.5, () => P.radiator(K, { w: 1.3, h: 0.5 }));
    // seating
    K.prop(0, 0, 0.15, 0, () => P.rug(K, { w: 2.5, d: 1.75, col: 0x7c3f36, border: 0xd6c6a6, inner: 0x8a4a3c }), { collide: false });
    K.prop(-w / 2 + 0.03, 0, 0.1, H, () => P.sofa(K, { w: 2.05, col: 0x66707c, throws: [0xb5832f, 0xd8d0c0] }));
    K.prop(1.62, 0, -1.72, -0.62, () => P.sofa(K, { w: 0.98, seats: 1, col: 0x8a6f52, throws: [0x40584a] }));
    K.prop(-0.25, 0, -1.38, 0.22, () => P.coffeeTable(K, {}));
    // tv wall
    K.prop(w / 2 - 0.03, 0, -0.6, -H, () => { P.tvUnit(K, { w: 1.5 }); K.at(0, 0.482, 0.2, 0, () => { K.tv = P.tv(K, { w: 1.08, on: true, k: K.night ? 1.6 : 2.6 }); }); K.at(-0.62, 0.482, 0.22, 0.4, () => P.standFrame(K, { pic: 'portrait1', w: 0.15, h: 0.2 })); });
    // south wall: bookshelf, console with lamp, plant
    K.prop(-1.3, 0, d / 2 - 0.01, PI, () => P.bookshelf(K, { w: 0.95, h: 1.95, col: C.oak }));
    let lampB;
    K.prop(0.45, 0, d / 2 - 0.02, PI, () => { P.tvUnit(K, { w: 1.1, h: 0.72, d: 0.36, col: C.walnut }); K.at(-0.3, 0.742, 0.18, 0, () => { lampB = P.tableLamp(K, { on, baseCol: 0x3d6f7a }); }); K.at(0.18, 0.742, 0.2, -0.3, () => P.standFrame(K, { pic: 'portrait0', w: 0.16, h: 0.21, col: 0x8a7a5a })); K.at(0.4, 0.742, 0.16, 0.25, () => P.standFrame(K, { pic: 'portrait3', w: 0.12, h: 0.16, metal: true })); K.lathe(M.ceramic, [[0.001, 0], [0.05, 0], [0.07, 0.03], [0.07, 0.035], [0.001, 0.02]], 0.05, 0.742, 0.12, { col: 0xe8e2d0, seg: 16 }); });
    K.onWall('S', 0.45, () => P.picture(K, 0, 1.52, { w: 0.9, h: 0.6, pic: 'land0', col: 0x3a2a1e, mount: 0.06, f: 0.03, mat: M.wood }));
    K.prop(1.85, 0, 1.78, 0, () => { P.plant(K, { h: 0.95, n: 20, potCol: 0xd8d4c8 }); K.collide(0.36, 0.6, 0.36); }, { collide: false });
    const lampA = K.prop(-2.02, 0, 1.52, 0, () => P.floorLamp(K, { on }), { pad: 0 });
    // side table by the armchair
    K.prop(0.72, 0, -1.72, 0, () => { P.sideTable(K, { round: true, w: 0.44, h: 0.5, col: C.walnut }); P.mug(K, 0.06, 0.5, 0.05, { col: 0xe8e2d0 }); K.box(M.satin, 0.13, 0.022, 0.19, -0.08, 0.5, -0.04, { r: 0.003, ry: 0.4, col: 0x2a4a6a }); K.box(M.plastic, 0.07, 0.008, 0.14, -0.08, 0.523, -0.04, { r: 0.003, ry: 0.9, col: 0x101012 }); });
    // walls
    K.onWall('W', 0.1, () => { P.picture(K, 0, 1.6, { w: 0.5, h: 0.62, pic: 'portrait4', col: 0x2a2420 }); P.picture(K, -0.62, 1.66, { w: 0.3, h: 0.38, pic: 'portrait2', col: 0x8a7a5a, mat: M.brass }); P.picture(K, 0.62, 1.56, { w: 0.34, h: 0.34, pic: 'portrait5', col: 0xe8e4da }); P.picture(K, 0.6, 1.98, { w: 0.24, h: 0.2, pic: 'kid0', col: 0xe8e4da, mount: 0.02 }); });
    K.onWall('N', 1.45, () => { P.picture(K, 0, 1.55, { w: 0.36, h: 0.46, pic: 'art0', col: 0x1a1a1a }); });
    K.onWall('E', 0.55, () => P.clock(K, 0, 1.95, { r: 0.14, col: 0x3a2a1e, hour: K.night ? 10.8 : 2.3 }));
    K.switchPlate('E', 0.78, 1.2); K.socket('E', -1.5, 0.3, true); K.socket('S', -0.6, 0.3); K.socket('W', 1.6, 0.3, true);
    // the story: tea went down with them
    K.at(0.75, 0.012, 0.95, 2.2, () => P.mug(K, 0, 0, 0, { tipped: true, col: 0xe8e2d0 })); K.stain('coffee', 0.5, 0.38, 0.62, 0.9, { y: 0.012 });
    K.box(M.plastic, 0.045, 0.018, 0.17, -0.55, 0.012, 1.0, { r: 0.007, ry: 1.1, col: 0x18181a });
    for (const s of [-1, 1]) K.rbox(M.fabric, 0.1, 0.07, 0.27, -1.18 + s * 0.07, 0, -1.02 + s * 0.05, { r: 0.03, ry: 0.5 + s * 0.2, col: 0x5a4636, seg: 2 });
    K.at(-w / 2 + 0.03, 0, 0.1, H, () => K.drape(M.curtain, [[0.5, 0.4], [0.74, 0.33], [0.9, 0.22], [0.93, 0.1], [0.8, 0.015], [0.45, 0.005]], 0.62, 0.52, 0, 0, { col: 0xa8934a, wrinkle: 0.02 })); // throw over the sofa back
    // ceiling
    const pend = K.at(0, h, 0.15, 0, () => P.pendant(K, { kind: 'drum', drop: 0.34, on, r: 0.2 }));
    // lighting
    const tvPos = K.world(w / 2 - 0.5, 0.95, -0.6);
    if (K.day) {
      K.hemi(0xcad8ea, 0x7a6850, 0.3);
      if (!K.rain) K.sun(196, 31, SUN, 5.2); else K.sun(190, 50, 0xdfe6f0, 0.9, { soft: 6 });
      K.spot(-0.5, 1.7, -d / 2 - 1.2, -0.2, 0.3, 0.6, { col: SKYFILL, int: K.rain ? 22 : 16, angle: 0.85, pen: 1 });
    } else if (K.dusk) {
      K.hemi(0x8088a8, 0x5a4a3a, 0.12);
      K.sun(204, 9, DUSKSUN, 2.2, { soft: 3 });
      K.spot(pend.x, pend.y - 0.02, pend.z, pend.x, 0, pend.z, { col: WARM, int: 9, angle: 1.3, pen: 0.6 });
      K.point(lampA.x, lampA.y, lampA.z, { col: WARM, int: 3.5 }); K.point(lampB.x, lampB.y, lampB.z, { col: WARM, int: 1.8 });
    } else {
      K.hemi(0x40465a, 0x3a3026, 0.05);
      K.spot(pend.x, pend.y - 0.04, pend.z, pend.x, 0, pend.z, { col: WARM, int: 14, angle: 1.3, pen: 0.55, shadow: true });
      K.point(pend.x, pend.y + 0.12, pend.z, { col: WARM, int: 0.9 });
      K.point(lampA.x, lampA.y, lampA.z, { col: WARM, int: 4 }); K.point(lampB.x, lampB.y, lampB.z, { col: WARM, int: 2.2 });
    }
    const tvL = K.point(tvPos.x, tvPos.y, tvPos.z, { col: 0x9ab8ff, int: K.night ? 1.6 : 0.6, dist: 6 });
    tvFlicker(K, K.tv, tvL, K.night ? 1.6 : 2.6, K.night ? 1.6 : 0.6);
    K.spots({ floor: [0.25, 0.3, H], seat: [-w / 2 + 0.03 + 0.56, 0.47, 0.1, H], side: -1, by: [[1.55, 1.0], [-0.6, -0.9]], cam: K.patient === 'seat' ? null : [1.3, 1.3, 1.4], target: K.patient === 'seat' ? null : [-0.15, 0.25, 0.1] });
    return { exposure: K.day ? 1.0 : K.dusk ? 1.1 : 1.2, bloom: K.day ? 0.14 : 0.16, envInt: K.day ? 1.0 : 0.6 };
  },
};
