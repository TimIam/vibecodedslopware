// Motorcycle and the powered ambulance cot.
//
// buildMotorcycle: a naked standard twin for crash scenes, one mesh (its tyres are modelled here because the kit's
// tyre shader wants a wheel-local mesh). Tuning: stance in `R`, `wb` and the fork points, colours in the skins.
// buildStretcher: X-frame powered cot. The legs are rigid and cross at their middle, so setHeight slides their feet
// along the base the way the real thing does; a hydraulic ram follows. Geometry of the litter hangs off `litter`
// (y = litter height), the head section off `backrest`.

import * as THREE from 'three';
import { clamp, lerp, TAU } from './util.js';
import { lin, g3, rad, range, skin, SK, surf, lens, mirrorRing, Builder, makeSurfMat, decalSheet, SK_DECAL, gearMat, groupOf, FX, withFx } from './vehicles-kit.js';

let _bikeMat = null, _dryMat = null;
const bikeMat = () => _bikeMat ||= makeSurfMat({ physical: true, map: decalSheet().tex, flake: { value: 0.55 } });
const dryMat = () => _dryMat ||= makeSurfMat({ physical: true, wet: false });

// Standard road bike for crash scenes. opts: color, onSide (lying on its left side). One draw call.
export function buildMotorcycle(opts = {}) {
  const B = new Builder({ seg: 3, single: () => 'surf' }), PI = Math.PI, R = 0.31, wb = 1.42, zf = wb / 2, zr = -wb / 2, dec = decalSheet();
  const PAINT = skin('surf', lin(opts.color ?? 0x7d1216), 0.3, 0, 1), BLK = withFx(SK.black, FX.grain), FRAME = surf(g3(0.016), 0.25, 0.3), TY = surf(g3(0.024), 0.84), RIM = surf(g3(0.035), 0.28, 0.7);
  const ENG = withFx(surf(g3(0.11), 0.42, 0.8), FX.grain), CASE = surf(g3(0.2), 0.35, 0.85), ALU = withFx(SK.alu, FX.brushed), DISC = withFx(surf(g3(0.36), 0.3, 1), FX.perf, 0.017);
  const GOLD = surf([0.62, 0.44, 0.13], 0.28, 0.9), PIPE = surf([0.42, 0.38, 0.33], 0.3, 1), SEAT = withFx(surf(g3(0.02), 0.62), FX.grain), GRIP = withFx(SK.rubber, FX.ribbed, 1);
  const AMB = surf(0xc46a08, 0.18), LENS = surf(g3(0.62), 0.04), REDL = surf(0x8a0a0a, 0.12), CHAIN = withFx(surf(g3(0.2), 0.4, 1), FX.ribbed);

  // ---- wheels: round-section tyre, cast ten-spoke rim, discs
  const wheel = (z, w, front) => B.at(0, R, z, () => {
    const hw = w / 2, rimR = 0.218, rc = rimR + 0.012, prof = [[-hw * 0.6, rimR]], groove = [-0.55, 0.55];
    for (let i = 0; i <= 10; i++) {
      const a = lerp(-1.95, 1.95, i / 10), c = Math.cos(a), p = [Math.sin(a) * hw, rc + (R - rc) * (c > 0 ? Math.pow(c, 0.85) : c * 0.35)];
      prof.push(p);
      for (const g of groove) if (a <= g && lerp(-1.95, 1.95, (i + 1) / 10) > g) {     // a rain groove between this point and the next
        const q = b => { const cc = Math.cos(b); return [Math.sin(b) * hw, rc + (R - rc) * Math.pow(cc, 0.85)]; }, a0 = q(g - 0.035), a1 = q(g + 0.035);
        prof.push(a0, a0, [a0[0], a0[1] - 0.005], [a0[0], a0[1] - 0.005], [a1[0], a1[1] - 0.005], [a1[0], a1[1] - 0.005], a1, a1);
      }
    }
    prof.push([hw * 0.6, rimR]);
    B.lathe(TY, prof, { axis: 'x', seg: 28 });
    const a = hw * 0.62, r0 = rimR - 0.028, r1 = rimR + 0.005;
    B.lathe(RIM, [[-a, r0], [-a, r1], [-a, r1], [a, r1], [a, r1], [a, r0], [a, r0], [-a, r0]], { axis: 'x', seg: 24 });
    B.lathe(SK.alu, [[-a - 0.001, r1 - 0.007], [-a - 0.001, r1 + 0.001]], { axis: 'x', seg: 24 }); B.lathe(SK.alu, [[a + 0.001, r1 + 0.001], [a + 0.001, r1 - 0.007]], { axis: 'x', seg: 24 });   // machined lips
    for (let k = 0; k < 5; k++) for (const d of [-1, 1]) B.at(0, 0, 0, k / 5 * TAU + d * 0.2, 0, 0, () => B.at(0, 0.03, 0, d * -0.22, 0, 0, () => B.box(RIM, 0.022, r0 - 0.02, 0.018, 0, (r0 - 0.02) / 2, 0)));
    B.cyl(RIM, 0.045, 0.045, w * 0.95, 0, 0, 0, 'x', 14); B.cyl(SK.steel, 0.014, 0.014, w + 0.19, 0, 0, 0, 'x', 8);
    for (const s of front ? [1, -1] : [-1]) { const rd = front ? 0.15 : 0.115, x0 = s * (hw * 0.5 + 0.03) - 0.0025, x1 = x0 + 0.005, ri = rd - 0.05; B.lathe(DISC, [[x0, ri], [x0, rd], [x0, rd], [x1, rd], [x1, rd], [x1, ri]], { axis: 'x', seg: 24 }); for (let k = 0; k < 5; k++) B.at(0, 0, 0, k / 5 * TAU + 0.6, 0, 0, () => B.box(RIM, 0.004, ri + 0.012, 0.03, x0 + 0.0025, (ri + 0.012) / 2, 0)); }
  });
  wheel(zf, 0.115, true); wheel(zr, 0.165, false);

  // ---- front end: upside-down fork, clamps, mudguard, calipers
  const pb = [0.105, R, zf], pt = [0.105, 1.03, zf - 0.33], F = s => [pb[0], lerp(pb[1], pt[1], s), lerp(pb[2], pt[2], s)], rake = -Math.atan2(pb[2] - pt[2], pt[1] - pb[1]);
  B.mirror(() => {
    B.tube(SK.chrome, [F(0.03), F(0.5)], 0.021, 10); B.tube(GOLD, [F(0.46), F(1)], 0.028, 10); B.tube(FRAME, [F(0.455), F(0.48)], 0.031, 10);
    B.at(...F(0), rake, 0, 0, () => { B.rbox(CASE, 0.05, 0.1, 0.06, 0.012, 0, 0.02, 0); B.rbox(CASE, 0.03, 0.05, 0.07, 0.008, -0.03, 0.045, -0.06); });
    B.at(0.062, R + 0.05, zf - 0.125, 0.5, 0, 0, () => { B.rbox(GOLD, 0.05, 0.1, 0.055, 0.012); B.box(FRAME, 0.052, 0.02, 0.056, 0, 0, 0); });      // radial caliper
    B.tube(FRAME, [[0.095, R + 0.2, zf - 0.09], [0.07, R + 0.33, zf - 0.03]], 0.006, 5, { caps: false });
    B.tube(FRAME, [[0.07, 0.9, zf - 0.2], [0.06, 0.6, zf - 0.13], [0.062, R + 0.1, zf - 0.13]], 0.005, 4, { caps: false });                             // brake hose
  });
  B.at(0, lerp(pb[1], pt[1], 0.67), lerp(pb[2], pt[2], 0.67), rake, 0, 0, () => B.rbox(FRAME, 0.275, 0.034, 0.075, 0.012));
  B.at(0, lerp(pb[1], pt[1], 0.985), lerp(pb[2], pt[2], 0.985), rake, 0, 0, () => { B.rbox(CASE, 0.275, 0.024, 0.07, 0.01); for (const s of [1, -1]) B.cyl(CASE, 0.02, 0.02, 0.05, s * 0.05, 0.03, -0.01, 'y', 10); B.cyl(SK.steel, 0.016, 0.016, 0.012, 0, 0.016, -0.045, 'y', 8); });
  B.tube(FRAME, [[0, 0.76, zf - 0.262], [0, 1.02, zf - 0.38]], 0.032, 10);                                                                           // steering head
  const fa = range(-78, 62, 12);
  B.sweep(PAINT, fa.map(a => [0, R + (R + 0.03) * Math.cos(rad(a)), zf + (R + 0.03) * Math.sin(rad(a))]), [{ a: -0.072, b: -0.03, r: 0.012 }, { a: -0.055, b: 0.008, r: 0.035 }, { a: 0.055, b: 0.008, r: 0.035 }, { a: 0.072, b: -0.03, r: 0.012 }, { a: 0.062, b: -0.03, r: 0 }, { a: 0.048, b: 0.0, r: 0.03 }, { a: -0.048, b: 0.0, r: 0.03 }, { a: -0.062, b: -0.03, r: 0 }],
    { up: i => [0, Math.cos(rad(fa[i])), Math.sin(rad(fa[i]))], seg: 2, scale: i => [1 - 0.25 * Math.abs(i - 7) / 7, 1] });

  // ---- bars, controls, mirrors, lamp, clocks
  const zb = zf - 0.35;
  B.tube(SK.chrome, [[-0.36, 1.108, zb - 0.075], [-0.21, 1.115, zb - 0.02], [-0.1, 1.075, zb], [0.1, 1.075, zb], [0.21, 1.115, zb - 0.02], [0.36, 1.108, zb - 0.075]], 0.012, 8);
  B.mirror(s => {
    B.tube(GRIP, [[0.245, 1.113, zb - 0.033], [0.352, 1.108, zb - 0.072]], 0.0175, 10); B.tube(ALU, [[0.352, 1.108, zb - 0.072], [0.375, 1.107, zb - 0.08]], 0.016, 8);
    B.at(0.222, 1.115, zb - 0.02, 0, 0.33, 0, () => { B.rbox(BLK, 0.05, 0.04, 0.045, 0.01); B.rbox(surf(s > 0 ? 0xb01712 : 0x202020, 0.4), 0.014, 0.008, 0.018, 0.003, 0, 0.022, -0.008); });
    B.tube(FRAME, [[0.215, 1.105, zb + 0.012], [0.3, 1.104, zb + 0.025], [0.375, 1.102, zb - 0.03]], 0.0055, 5);                                      // lever
    B.tube(FRAME, [[0.2, 1.125, zb - 0.01], [0.245, 1.215, zb + 0.005], [0.31, 1.262, zb - 0.005]], 0.006, 5, { caps: false });
    B.at(0.345, 1.275, zb - 0.01, 0, -0.18, 0, () => { B.rbox(BLK, 0.135, 0.075, 0.03, 0.022); B.rbox(SK.mirror, 0.118, 0.058, 0.004, 0.002, 0, 0, -0.0145); });
    B.tube(FRAME, [[0.085, 0.905, zf - 0.19], [0.165, 0.9, zf - 0.185]], 0.0065, 5, { caps: false }); B.ball(AMB, 0.026, 0.017, 0.032, 0.185, 0.9, zf - 0.183, 10);   // front indicator
    B.tube(FRAME, [[0.105, 0.99, zf - 0.31], [0.09, 0.93, zf - 0.2]], 0.008, 5, { caps: false });                                                    // lamp bracket
  });
  B.cyl(surf(g3(0.3), 0.15), 0.021, 0.021, 0.04, -0.2, 1.155, zb + 0.005, 'y', 10); B.cyl(FRAME, 0.022, 0.022, 0.008, -0.2, 1.178, zb + 0.005, 'y', 10);     // brake fluid reservoir
  B.ball(BLK, 0.092, 0.092, 0.07, 0, 0.905, zf - 0.185, 12);
  B.at(0, 0.905, zf - 0.128, () => { B.lathe(SK.chrome, [[-0.02, 0.094], [0.004, 0.096], [0.004, 0.096], [0.008, 0.086]], { axis: 'z', seg: 20 }); B.lathe(LENS, [[0.004, 0.087], [0.02, 0.07], [0.03, 0.04], [0.034, 0]], { axis: 'z', seg: 20 }); });
  B.at(0, 1.065, zf - 0.29, -0.95, PI, 0, () => { B.rbox(BLK, 0.15, 0.09, 0.035, 0.014); B.rbox(surf([0.012, 0.03, 0.045], 0.08), 0.125, 0.066, 0.004, 0.002, 0, 0, 0.018); });

  // ---- frame, swingarm, shock
  B.mirror(() => {
    B.tube(FRAME, [[0.03, 0.98, zf - 0.37], [0.11, 0.86, 0.2], [0.15, 0.68, -0.02], [0.15, 0.5, -0.2], [0.13, 0.4, -0.25]], 0.024, 8);
    B.tube(FRAME, [[0.035, 0.9, zf - 0.34], [0.12, 0.66, 0.26], [0.13, 0.5, 0.2]], 0.016, 6, { caps: false });
    B.tube(FRAME, [[0.12, 0.76, -0.12], [0.1, 0.8, -0.5], [0.07, 0.86, -0.84]], 0.014, 6); B.tube(FRAME, [[0.14, 0.52, -0.22], [0.1, 0.8, -0.56]], 0.012, 6, { caps: false });
    B.sweep(CASE, [[0.11, 0.42, -0.2], [0.127, 0.36, -0.45], [0.127, R, zr]], [{ a: -0.016, b: -0.032, r: 0.008 }, { a: 0.016, b: -0.032, r: 0.008 }, { a: 0.016, b: 0.032, r: 0.008 }, { a: -0.016, b: 0.032, r: 0.008 }], { seg: 1 });
    B.cyl(SK.steel, 0.022, 0.022, 0.016, 0.15, R, zr, 'x', 6); B.rbox(CASE, 0.012, 0.05, 0.07, 0.004, 0.146, R, zr + 0.02);
    B.rbox(CASE, 0.012, 0.16, 0.1, 0.004, 0.16, 0.39, -0.27); B.tube(ALU, [[0.16, 0.33, -0.27], [0.25, 0.33, -0.27]], 0.011, 6);                      // peg hanger, peg
    B.tube(FRAME, [[0.12, 0.62, -0.6], [0.2, 0.56, -0.58]], 0.008, 5);                                                                              // pillion peg
  });
  B.cyl(SK.steel, 0.018, 0.018, 0.34, 0, 0.42, -0.2, 'x', 8);
  B.at(0, 0.5, -0.34, 0.5, 0, 0, () => { B.cyl(withFx(surf(0xd9a400, 0.4), FX.ribbed), 0.032, 0.032, 0.17, 0, 0.02, 0, 'y', 12); B.cyl(SK.steel, 0.012, 0.012, 0.28, 0, 0, 0, 'y', 8); B.cyl(GOLD, 0.02, 0.02, 0.07, 0.045, 0.06, 0, 'y', 8); });

  // ---- engine: parallel twin leaning forward, covers, radiator, exhaust
  B.rbox(ENG, 0.29, 0.2, 0.38, 0.04, 0, 0.41, 0.02); B.rbox(ENG, 0.25, 0.17, 0.2, 0.04, 0, 0.45, -0.19); B.rbox(ENG, 0.2, 0.07, 0.24, 0.025, 0, 0.29, 0.03);
  B.at(0, 0.5, 0.11, 0.38, 0, 0, () => {
    B.rbox(ENG, 0.26, 0.17, 0.19, 0.012, 0, 0.07, 0); for (let i = 0; i < 6; i++) B.rbox(CASE, 0.276, 0.007, 0.206, 0.002, 0, 0.012 + i * 0.026, 0);
    B.rbox(CASE, 0.25, 0.06, 0.2, 0.014, 0, 0.185, 0); B.rbox(ENG, 0.21, 0.04, 0.16, 0.016, 0, 0.232, 0); for (const s of [1, -1]) B.cyl(SK.steel, 0.012, 0.012, 0.01, s * 0.06, 0.255, 0, 'y', 6);
    B.rbox(BLK, 0.2, 0.1, 0.1, 0.02, 0, 0.16, -0.14);                                                                                               // throttle bodies
  });
  B.cyl(CASE, 0.092, 0.1, 0.034, -0.158, 0.42, -0.1, 'x', 20); B.cyl(ENG, 0.045, 0.05, 0.014, -0.181, 0.42, -0.1, 'x', 14);                         // clutch cover
  B.cyl(CASE, 0.082, 0.074, 0.04, 0.16, 0.4, 0.09, 'x', 18); B.cyl(ENG, 0.03, 0.028, 0.01, 0.184, 0.4, 0.09, 'x', 10);                              // alternator cover
  B.rbox(ENG, 0.03, 0.13, 0.17, 0.012, 0.14, 0.42, -0.17); B.cyl(FRAME, 0.036, 0.036, 0.075, -0.06, 0.33, 0.235, 'z', 12);                          // sprocket cover, oil filter
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; B.cyl(SK.steel, 0.006, 0.006, 0.006, -0.176, 0.42 + Math.cos(a) * 0.084, -0.1 + Math.sin(a) * 0.084, 'x', 6); }
  B.at(0, 0.66, 0.36, 0.2, 0, 0, () => { B.rbox(withFx(surf(g3(0.03), 0.6, 0.5), FX.ribbed), 0.3, 0.25, 0.028, 0.004); for (const s of [1, -1]) B.rbox(ENG, 0.03, 0.26, 0.04, 0.01, s * 0.165, 0, 0); B.rbox(BLK, 0.31, 0.014, 0.04, 0.004, 0, 0.13, 0); });
  B.tube(BLK, [[-0.13, 0.78, 0.33], [-0.13, 0.82, 0.24], [-0.09, 0.74, 0.16]], 0.014, 6); B.tube(BLK, [[0.14, 0.55, 0.36], [0.14, 0.46, 0.28], [0.1, 0.44, 0.2]], 0.014, 6);
  for (const s of [1, -1]) B.tube(PIPE, [[s * 0.065, 0.68, 0.2], [s * 0.07, 0.6, 0.3], [s * 0.07, 0.4, 0.31], [s * 0.06, 0.25, 0.22], [s * 0.04 - 0.02, 0.215, -0.02], [-0.05, 0.21, -0.22]], 0.02, 8, { caps: false });
  B.rbox(surf(g3(0.06), 0.5, 0.6), 0.16, 0.085, 0.3, 0.03, -0.03, 0.215, -0.3);                                                                     // collector box under the engine
  B.tube(PIPE, [[-0.1, 0.22, -0.4], [-0.17, 0.27, -0.5], [-0.18, 0.31, -0.6]], 0.024, 8, { caps: false });
  B.at(-0.185, 0.365, -0.83, 0.22, 0, 0, () => {
    B.cyl(withFx(surf(g3(0.52), 0.32, 1), FX.brushed, 1), 0.058, 0.062, 0.44, 0, 0, 0, 'z', 16); B.cyl(FRAME, 0.063, 0.05, 0.03, 0, 0, -0.235, 'z', 16, 1); B.cyl(FRAME, 0.06, 0.06, 0.024, 0, 0, 0.215, 'z', 16);
    B.lathe(surf(g3(0.01), 0.9), [[-0.236, 0.034], [-0.236, 0]], { axis: 'z', seg: 12, flip: true });
    B.rbox(withFx(surf(g3(0.03), 0.5, 0.4), FX.perf, 0.012), 0.012, 0.085, 0.3, 0.004, -0.062, 0.012, 0.02);                                           // heat shield
  });
  B.rbox(CASE, 0.012, 0.09, 0.05, 0.004, -0.165, 0.5, -0.56);

  // ---- final drive (left side)
  B.cyl(CHAIN, 0.04, 0.04, 0.01, 0.1, 0.42, -0.17, 'x', 12); B.cyl(withFx(surf(g3(0.42), 0.3, 1), FX.perf, 0.03), 0.108, 0.108, 0.006, 0.096, R, zr, 'x', 28); B.cyl(RIM, 0.06, 0.06, 0.012, 0.092, R, zr, 'x', 12);
  for (const [y0, y1] of [[0.46, R + 0.108], [0.38, R - 0.108]]) B.sweep(CHAIN, [[0.1, y0, -0.17], [0.096, y1, zr]], [{ a: -0.006, b: -0.008, r: 0 }, { a: 0.006, b: -0.008, r: 0 }, { a: 0.006, b: 0.008, r: 0 }, { a: -0.006, b: 0.008, r: 0 }], { seg: 1 });
  B.at(0.104, 0.47, -0.47, 0.1, 0, 0, () => B.rbox(BLK, 0.03, 0.012, 0.4, 0.004));                                                                 // chain guard
  B.tube(FRAME, [[0.175, 0.335, -0.27], [0.19, 0.33, -0.12], [0.24, 0.33, -0.115]], 0.006, 5); B.tube(FRAME, [[-0.175, 0.335, -0.27], [-0.19, 0.32, -0.14], [-0.24, 0.32, -0.135]], 0.006, 5);     // shifter, brake pedal
  B.at(-0.068, R - 0.02, zr + 0.12, 0, 0, 0, () => B.rbox(GOLD, 0.045, 0.06, 0.07, 0.01));

  // ---- bodywork: tank, seat, tail
  const tz = [-0.17, -0.11, 0.0, 0.1, 0.2, 0.28, 0.33], tw = [0.105, 0.128, 0.152, 0.172, 0.168, 0.135, 0.085], tt = [0.865, 0.905, 0.955, 0.98, 0.975, 0.945, 0.9], tb = [0.775, 0.745, 0.715, 0.7, 0.71, 0.75, 0.8];
  B.loft(tz, (z, i) => { const w = tw[i], t = tt[i], b = tb[i]; return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w * 0.72, y: b, z, r: 0.03 }, { x: w, y: lerp(b, t, 0.58), z, r: 0.2 }, { x: w * 0.8, y: t - 0.014, z, r: 0.07 }, { x: 0, y: t, z, r: 0.5 }]); }, { closed: true, sk: PAINT, capA: PAINT, capB: PAINT, seg: 4 });
  B.cyl(FRAME, 0.04, 0.04, 0.008, 0, 0.981, 0.14, 'y', 14); B.cyl(SK.steel, 0.03, 0.03, 0.006, 0, 0.987, 0.14, 'y', 14);
  const sz = [-0.14, -0.2, -0.34, -0.47, -0.52, -0.65, -0.8, -0.87], sw = [0.1, 0.132, 0.14, 0.122, 0.112, 0.1, 0.085, 0.05], stp = [0.865, 0.838, 0.82, 0.832, 0.878, 0.89, 0.895, 0.888];
  B.loft(sz, (z, i) => { const w = sw[i], t = stp[i], b = t - 0.065; return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w, y: b, z, r: 0.012 }, { x: w, y: t - 0.018, z, r: 0.03 }, { x: 0, y: t, z, r: 0.5 }]); }, { closed: true, sk: SEAT, capA: SEAT, capB: SEAT, seg: 3 });
  const az = [-0.4, -0.52, -0.68, -0.84, -0.96], aw = [0.118, 0.128, 0.115, 0.08, 0.035], ab = [0.72, 0.745, 0.79, 0.835, 0.865];
  B.loft(az, (z, i) => { const w = aw[i], t = (i < 1 ? 0.8 : i < 2 ? 0.83 : 0.84 + 0.012 * i), b = ab[i]; return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w * 0.6, y: b, z, r: 0.02 }, { x: w, y: lerp(b, t, 0.6), z, r: 0.1 }, { x: w * 0.92, y: t, z, r: 0.015 }, { x: 0, y: t, z, flat: true }]); }, { closed: true, sk: PAINT, capA: PAINT, capB: PAINT, seg: 3 });
  B.rbox(REDL, 0.11, 0.03, 0.03, 0.01, 0, 0.872, -0.965); B.rbox(SK.chrome, 0.12, 0.004, 0.02, 0, 0, 0.855, -0.962);
  const ha = range(-128, -55, 8);
  B.sweep(BLK, ha.map(a => [0, R + (R + 0.035) * Math.cos(rad(a)), zr + (R + 0.035) * Math.sin(rad(a))]), [{ a: -0.092, b: -0.02, r: 0.01 }, { a: -0.07, b: 0.008, r: 0.03 }, { a: 0.07, b: 0.008, r: 0.03 }, { a: 0.092, b: -0.02, r: 0.01 }], { up: i => [0, Math.cos(rad(ha[i])), Math.sin(rad(ha[i]))], seg: 2 });
  B.tube(FRAME, [[0, 0.83, -0.9], [0, 0.72, -0.99], [0, 0.6, -1.03]], 0.014, 6);                                                                    // plate hanger
  B.at(0, 0.63, -1.045, -0.28, PI, 0, () => { B.rbox(BLK, 0.21, 0.14, 0.008, 0.004); B.plane(SK_DECAL, 0.19, 0.095, 0, 0.005, 0.006, dec.uv.plate5); B.rbox(SK.gloss, 0.05, 0.016, 0.02, 0.004, 0, 0.078, 0.012); });
  B.mirror(() => { B.tube(FRAME, [[0.03, 0.74, -0.985], [0.115, 0.74, -0.99]], 0.0065, 5, { caps: false }); B.ball(AMB, 0.026, 0.017, 0.032, 0.135, 0.74, -0.992, 10); });

  // ---- side stand (folded out on the left)
  B.tube(FRAME, [[0.13, 0.3, -0.1], [0.3, 0.02, -0.04]], 0.012, 6); B.rbox(FRAME, 0.07, 0.01, 0.04, 0.004, 0.31, 0.008, -0.04);

  const g = groupOf(B, { surf: bikeMat() }), group = new THREE.Group(); group.name = 'motorcycle'; group.add(g['']);
  if (opts.onSide) { g[''].rotation.z = rad(82); g[''].position.set(0.42, 0.33, 0); }
  return { group, dims: { length: 2.1, width: 0.72, height: 1.25, wheelbase: wb, wheelRadius: R, mass: 210 }, tris: B.tris() };
}

// Powered ambulance cot. Origin on the floor under its centre, head end towards +Z. setHeight(0..1) lowers/raises the
// litter on its X-frame, setBackrest(0..1) raises the head section, mattressTop marks where the patient lies.
// opts: height, backrest, dry (indoors: never takes the rain look).
export function buildStretcher(opts = {}) {
  const B = new Builder({ seg: 3, single: () => 'surf' }), hw = 0.27, bx = 0.265, yb = 0.2, Lg = 1.5, zF = -0.9, zH = 0.9;
  const FR = withFx(SK.alu, FX.brushed), FRD = withFx(surf(g3(0.06), 0.45, 0.6), FX.brushed), YEL = surf(0xd9a400, 0.36), BLK = withFx(SK.black, FX.grain), STL = SK.steel;
  const MAT = withFx(surf([0.022, 0.026, 0.034], 0.5), FX.weave, 0.0011), PIPE = surf(g3(0.011), 0.7), PIL = withFx(surf([0.6, 0.62, 0.65], 0.85), FX.weave, 0.0012);
  const GRIP = withFx(SK.rubber, FX.ribbed, 1), CAST = surf(g3(0.1), 0.75), RED = surf(0xb01712, 0.4), GRN = surf(0x1c7a2c, 0.4), web = c => withFx(surf(c, 0.9), FX.weave, 0.0026);

  // ---- base frame, casters, power unit
  B.mirror(() => {
    B.rbox(YEL, 0.034, 0.05, 1.72, 0.009, bx, yb, 0);
    for (const z of [-0.88, 0.88]) B.at(bx, 0, z, () => {
      const t = -Math.sign(z) * 0.032;                                                 // trail towards the middle
      B.cyl(STL, 0.024, 0.024, 0.034, 0, 0.168, 0, 'y', 12); B.rbox(BLK, 0.07, 0.02, 0.075, 0.006, 0, 0.146, t * 0.4);
      for (const s of [1, -1]) B.at(s * 0.029, 0.105, t * 0.7, -t * 9, 0, 0, () => B.box(BLK, 0.005, 0.085, 0.04));
      B.at(0, 0.075, t, () => { B.lathe(CAST, [[-0.018, 0.046], [-0.021, 0.066], [-0.013, 0.075], [0.013, 0.075], [0.021, 0.066], [0.018, 0.046]], { axis: 'x', seg: 18 }); B.cyl(SK.alu, 0.047, 0.047, 0.034, 0, 0, 0, 'x', 12); B.cyl(STL, 0.012, 0.012, 0.07, 0, 0, 0, 'x', 6); });
      if (z < 0) B.rbox(RED, 0.036, 0.01, 0.045, 0.004, 0, 0.14, t - 0.085 * Math.sign(t)); else B.rbox(GRN, 0.02, 0.008, 0.03, 0.003, 0.02, 0.158, t * 0.4);
    });
  });
  for (const z of [-0.86, 0.86]) B.rbox(YEL, bx * 2, 0.04, 0.034, 0.009, 0, yb, z);
  B.rbox(BLK, 0.1, 0.08, 0.26, 0.02, 0.12, 0.25, -0.56); B.cyl(STL, 0.028, 0.028, 0.14, 0.12, 0.25, -0.36, 'z', 10);                         // pump and motor
  B.rbox(STL, 0.07, 0.05, 0.03, 0.006, 0, 0.225, -0.82); B.tube(BLK, [[0.07, 0.25, -0.62], [0.03, 0.27, -0.72], [0.02, 0.25, -0.76]], 0.007, 5);

  // ---- X-frame: rigid legs along +Z from their base pivot, crossing at mid-length
  for (const [n, x] of [['legA', 0.2], ['legB', 0.238]]) {
    B.grp = n;
    B.mirror(() => { B.rbox(YEL, 0.026, 0.046, Lg, 0.008, x, 0, Lg / 2); B.cyl(STL, 0.03, 0.03, 0.034, x, 0, Lg / 2, 'x', 12); B.rbox(BLK, 0.032, 0.044, 0.07, 0.008, x, 0.0, Lg - 0.03); });
    B.tube(YEL, [[-x, 0, Lg - 0.03], [x, 0, Lg - 0.03]], 0.014, 8, { caps: false }); B.tube(STL, [[-bx - 0.012, 0, 0.012], [bx + 0.012, 0, 0.012]], 0.012, 8);
    if (n === 'legA') { B.tube(STL, [[-0.255, 0, Lg / 2], [0.255, 0, Lg / 2]], 0.011, 8); B.tube(YEL, [[-x, 0, 0.72 * Lg], [x, 0, 0.72 * Lg]], 0.015, 8, { caps: false }); B.rbox(STL, 0.05, 0.045, 0.035, 0.006, 0, 0, 0.72 * Lg); }
  }
  B.grp = 'ram'; B.cyl(BLK, 0.032, 0.032, 0.4, 0, 0, 0.2, 'z', 12); B.cyl(STL, 0.036, 0.036, 0.024, 0, 0, 0.395, 'z', 12); B.cyl(STL, 0.036, 0.036, 0.02, 0, 0, 0.03, 'z', 12);
  B.grp = 'rod'; B.cyl(SK.chrome, 0.014, 0.014, 0.37, 0, 0, 0.185, 'z', 10);

  // ---- litter: perimeter tube, cross members, deck, mattress, side rails, foot and head ends
  B.grp = 'litter';
  B.tube(FR, [[hw, 0, zH], [hw, 0, zF + 0.05], [hw - 0.025, 0, zF - 0.02], [hw - 0.09, 0, zF - 0.045], [-(hw - 0.09), 0, zF - 0.045], [-(hw - 0.025), 0, zF - 0.02], [-hw, 0, zF + 0.05], [-hw, 0, zH]], 0.016, 8);
  for (const z of [-0.74, -0.22, 0.2, 0.6, 0.86]) B.tube(FRD, [[-hw, -0.004, z], [hw, -0.004, z]], 0.012, 6, { caps: false });
  B.box(BLK, 0.5, 0.012, 0.37, 0, 0.014, 0); B.box(BLK, 0.5, 0.012, 0.72, 0, 0.014, -0.585);
  const pad = (len, z, y) => {
    const h = len / 2 + 0.002, c = 0.022, x1 = 0.2625;
    B.rbox(MAT, 0.52, 0.08, len, 0.028, 0, y, z);
    B.tube(PIPE, [[x1, y, z - h + c], [x1, y, z + h - c], [x1 - c, y, z + h], [c - x1, y, z + h], [-x1, y, z + h - c], [-x1, y, z - h + c], [c - x1, y, z - h], [x1 - c, y, z - h]], 0.0042, 4, { loop: true });
  };
  pad(0.4, 0, 0.065); pad(0.74, -0.585, 0.065);
  B.mirror(s => {
    const x1 = hw + 0.012, x2 = hw + 0.042;
    B.tube(FR, [[x1, 0.02, -0.46], [x2, 0.19, -0.5], [x2, 0.245, -0.45], [x2, 0.245, 0.09], [x2, 0.19, 0.14], [x1, 0.02, 0.1]], 0.013, 8);
    for (const z of [-0.32, -0.18, -0.04]) B.tube(FR, [[x2, 0.245, z], [x1 + 0.006, 0.035, z]], 0.009, 6, { caps: false });
    B.tube(FR, [[x1 + 0.004, 0.035, -0.46], [x1 + 0.004, 0.035, 0.1]], 0.01, 6);
    for (const z of [-0.46, 0.1]) B.rbox(BLK, 0.034, 0.05, 0.055, 0.008, x1, 0.012, z);
    B.rbox(RED, 0.014, 0.032, 0.075, 0.005, x2 + 0.008, 0.2, -0.485);                                                                       // rail release
    // restraints hang unbuckled at the sides: hips black, legs blue; tongue on one side, buckle on the other
    for (const [z, c] of [[-0.13, g3(0.016)], [-0.68, [0.014, 0.04, 0.12]]]) {
      B.box(web(c), 0.05, 0.004, 0.046, hw - 0.004, 0.019, z); B.box(web(c), 0.0035, 0.2, 0.046, hw + 0.02, -0.082, z);
      if (s > 0) { B.rbox(BLK, 0.014, 0.03, 0.05, 0.004, hw + 0.02, -0.19, z); B.rbox(SK.chrome, 0.004, 0.045, 0.03, 0.001, hw + 0.02, -0.225, z); }
      else { B.rbox(BLK, 0.018, 0.062, 0.054, 0.006, hw + 0.02, -0.205, z); B.rbox(RED, 0.006, 0.026, 0.032, 0.002, hw + 0.03, -0.2, z); }
    }
    // head end: telescoping handles, load wheels
    B.tube(FRD, [[hw - 0.035, -0.003, zH - 0.14], [hw - 0.035, -0.003, zH + 0.1]], 0.0125, 8); B.rbox(BLK, 0.04, 0.04, 0.045, 0.008, hw - 0.035, -0.003, zH - 0.02);
    B.box(FRD, 0.01, 0.075, 0.03, 0.19, -0.04, zH + 0.06); B.cyl(CAST, 0.045, 0.045, 0.03, 0.172, -0.085, zH + 0.06, 'x', 14); B.cyl(SK.alu, 0.026, 0.026, 0.032, 0.172, -0.085, zH + 0.06, 'x', 10);
    B.tube(FRD, [[0.2, 0, zF - 0.04], [0.2, 0.1, zF - 0.105], [0.19, 0.17, zF - 0.125], [0.14, 0.172, zF - 0.125]], 0.014, 8, { caps: false });      // foot-end bar
  });
  B.tube(FRD, [[-(hw - 0.035), -0.003, zH + 0.1], [-(hw - 0.075), 0, zH + 0.128], [hw - 0.075, 0, zH + 0.128], [hw - 0.035, -0.003, zH + 0.1]], 0.0125, 8, { caps: false });
  B.tube(GRIP, [[-0.13, 0, zH + 0.128], [0.13, 0, zH + 0.128]], 0.0165, 10); B.tube(GRIP, [[-0.145, 0.172, zF - 0.125], [0.145, 0.172, zF - 0.125]], 0.018, 10);
  B.tube(STL, [[-0.11, -0.012, zH - 0.02], [-0.11, -0.13, zH], [0.11, -0.13, zH], [0.11, -0.012, zH - 0.02]], 0.008, 6);                         // safety bar
  B.rbox(BLK, 0.055, 0.045, 0.065, 0.01, -0.2, 0.185, zF - 0.118); B.rbox(RED, 0.016, 0.006, 0.02, 0.002, -0.2, 0.209, zF - 0.105); B.rbox(GRN, 0.016, 0.006, 0.02, 0.002, -0.2, 0.209, zF - 0.133);      // control pod
  B.rbox(surf(g3(0.035), 0.4), 0.17, 0.065, 0.11, 0.012, 0.09, -0.055, zF + 0.13); B.rbox(RED, 0.172, 0.014, 0.03, 0.004, 0.09, -0.055, zF + 0.085);                                                // battery
  B.tube(RED, [[0.04, 0.105, zF - 0.1], [0.15, 0.105, zF - 0.1]], 0.0065, 6);                                                                                                                      // manual release
  B.tube(STL, [[hw + 0.032, -0.03, 0.22], [hw + 0.032, -0.03, 0.8]], 0.008, 6); B.tube(STL, [[hw + 0.032, -0.03, 0.8], [hw + 0.032, 0, 0.82], [hw + 0.032, -0.02, 0.85]], 0.004, 4);                // folded IV pole
  for (const z of [0.3, 0.7]) B.rbox(BLK, 0.032, 0.03, 0.03, 0.006, hw + 0.02, -0.026, z);

  // ---- backrest (hinged at the hips; local +Z runs up the back)
  B.grp = 'back';
  B.mirror(() => {
    B.tube(FR, [[hw - 0.035, 0, 0], [hw - 0.035, 0, 0.7]], 0.013, 8);
    B.cyl(web([0.55, 0.16, 0.02]), 0.021, 0.021, 0.05, 0.225, 0.106, 0.66, 'x', 10); B.rbox(BLK, 0.02, 0.03, 0.045, 0.004, 0.225, 0.118, 0.635);                                                  // stowed shoulder straps
  });
  B.tube(FR, [[-(hw - 0.035), 0, 0.7], [-(hw - 0.085), 0, 0.745], [hw - 0.085, 0, 0.745], [hw - 0.035, 0, 0.7]], 0.013, 8, { caps: false });
  B.box(BLK, 0.5, 0.012, 0.7, 0, -0.006, 0.37); pad(0.74, 0.39, 0.045);
  B.rbox(PIL, 0.4, 0.075, 0.26, 0.035, 0, 0.116, 0.56);
  B.grp = '';

  const g = groupOf(B, { surf: opts.dry ? dryMat() : gearMat() }), group = new THREE.Group(); group.name = 'stretcher';
  const litter = g.litter, back = g.back; group.add(g[''], g.legA, g.legB, g.ram, g.rod, litter); litter.add(back); back.position.set(0, 0.02, 0.2);
  const mattressTop = new THREE.Object3D(); mattressTop.name = 'mattressTop'; mattressTop.position.set(0, 0.11, -0.1); litter.add(mattressTop);
  const aim = (o, y0, z0, y1, z1) => { o.position.set(0, y0, z0); o.rotation.x = -Math.atan2(y1 - y0, z1 - z0); };
  const api = {
    group, mattressTop, litter, backrest: back, height: 0,
    setHeight(t) {
      const h = lerp(0.34, 0.86, clamp(t)), y0 = yb + 0.015, dy = h - 0.045 - y0, a = Math.sqrt(Lg * Lg - dy * dy) / 2; api.height = h; litter.position.y = h;
      aim(g.legA, y0, a, y0 + dy, -a); aim(g.legB, y0, -a, y0 + dy, a);
      const ty = y0 + dy * 0.72, tz = a - 2 * a * 0.72; aim(g.ram, 0.235, -0.8, ty, tz); aim(g.rod, ty, tz, 0.235, -0.8);
    },
    setBackrest(t) { back.rotation.x = -clamp(t) * 1.25; },
    tris: B.tris(),
  };
  api.setHeight(opts.height ?? 1); api.setBackrest(opts.backrest ?? 0.35);
  return api;
}
