// Traffic and parked cars. Tuning: shapes in CAR_SPECS (body lines plus `nose` / `tail` fascia layouts), colours in
// COLOR_WEIGHTS. Three levels of detail per type: 0 hero (shelled cabin), 1 traffic (body + glass + 4 wheels + glow),
// 2 far / parked (one geometry with the wheels in it, one shared material tinted per instance).
//
// How a car is put together: one loft from tail to nose whose section has a character-line crease under the shoulder
// (lamps wrap around the corners in the band above it), a greenhouse loft, and the two end faces drawn as panels of
// rectangular regions (`endFace`): lamp clusters, grille and intake recesses, bumper, plate recess, cut lines.

import * as THREE from 'three';
import { U, patchWet, glowTexture } from './gfx.js';
import { makeRng, clamp, lerp, smooth, makeCanvas, canvasTex, TAU, fbm2 } from './util.js';
import {
  lin, g3, rad, curve, stations, range, archY, archStations, skin, SK, surf, lens, LENS, expandSection,
  mirrorRing, Builder, _m, _e, _v, faceMatrix, GLSL_WATER, WATER_VS, WATER_FS_NORMAL, makeSurfMat, makePaintMat,
  makeGlassMat, makeGlow, glowGeo, wheelInto, makeWheel, FONT, C_RED, C_GOLD, decalSheet, SK_DECAL, SK_CAB,
  SK_MDT, LAMP_N, E_RED, E_WHT, E_AMB, E_COOL, burst, SK_DGLASS, SK_SEAT, SK_GOLD, SK_PWHITE, E_BLUE, wheelGeo,
  _phMat, gearMat, groupOf, FX, withFx,
} from './vehicles-kit.js';

// ---------------------------------------------------------------------------------------------- traffic

export const CAR_TYPES = ['sedan', 'hatch', 'suv', 'pickup', 'van', 'wagon', 'bus', 'boxtruck', 'police', 'engine'];
// Paint colours weighted the way a real car park is: mostly white, black, grey and silver.
const COLOR_WEIGHTS = [[0xdcdcd8, 22], [0x0b0b0d, 18], [0x5d6064, 15], [0xa9acb0, 13], [0x1b3562, 8], [0x7d1216, 7], [0x26292d, 6], [0x4a3c2b, 2], [0x1f3a27, 2], [0xb5a67f, 2], [0x34618f, 2], [0xb8611a, 1], [0x4f0d17, 2]];
export const CAR_COLORS = COLOR_WEIGHTS.flatMap(([c, w]) => Array(w).fill(c));

// Shapes. Lengths in metres; z positions derive from wheelbase (wb), front overhang (fo) and: cowl = windscreen base
// relative to the front axle, wsRun / rearRun = horizontal run of the front / rear glass, deckLen = boot or bed length,
// cabEnd = trucks only, cab length behind the cowl. pillars = where the side glass is split (0..1 along the cabin).
// cr / nr = plan-view corner radius and depth of the nose rounding, tumble = roof width over body width, band = height
// of the shoulder band above the character line (the lamps live in it), shut = door cut lines (0..1 along the cabin).
// nose: lu lamp inner edge, gu grille half width (both in half-widths), gDrop how far the grille hangs below the lamp
// line, i0/i1/iu lower intake (heights as fractions of the face), bumper 'black' | 'chrome' up to bTop, bars, chrome.
// tail: lu, plate (height fraction), bar (full-width light strip), gate (tailgate cut lines), panel (stamped tailgate),
// split (twin doors), bumper / bTop as for the nose.
const SEDAN = {
  L: 4.75, W: 1.86, H: 1.45, wb: 2.82, fo: 0.92, R: 0.34, tw: 0.225, rimR: 0.245, gc: 0.15, cowl: -0.42, bonH: 1.01, noseH: 0.87, belt: 0.97, wsRun: 0.72, deckLen: 0.56, deck: 1.07, rearRun: 0.68, tumble: 0.78, pillars: [0.5], rp: 0.16, mass: 1500, wheel: 'alloy',
  cr: 0.4, nr: 0.17, tailR: 0.12, sh: 0.09, band: 0.15, rakeN: 0.1, rakeT: 0.07, nose: { lu: 0.5, gu: 0.4, gDrop: 0.14, chrome: true, bars: 3 }, tail: { lu: 0.46, plate: 0.6, garnish: true },
};
const CAR_SPECS = {
  sedan: SEDAN,
  hatch: { ...SEDAN, L: 4.3, W: 1.8, H: 1.47, wb: 2.62, fo: 0.88, R: 0.325, tw: 0.205, rimR: 0.23, cowl: -0.4, bonH: 1.03, belt: 1.0, wsRun: 0.85, deckLen: 0.1, deck: 1.05, rearRun: 0.5, tumble: 0.78, mass: 1250, spoiler: true, rim: 'dark', rakeT: 0.1,
    nose: { lu: 0.52, gu: 0.42, gDrop: 0.0, gsk: 'gloss', bars: 0, iu: 0.7, i1: 0.44 }, tail: { lu: 0.58, plate: 0.5, gate: true, cut: 0.3 } },
  suv: { ...SEDAN, L: 4.7, W: 1.92, H: 1.68, wb: 2.75, fo: 0.92, R: 0.375, tw: 0.235, rimR: 0.255, gc: 0.2, cowl: -0.4, bonH: 1.19, noseH: 1.05, belt: 1.16, wsRun: 0.75, deckLen: 0.08, deck: 1.2, rearRun: 0.42, tumble: 0.8, pillars: [0.42, 0.76], rp: 0.13, clad: true, rails: true, mass: 1900, cr: 0.3, nr: 0.12, sh: 0.07, spokes: 6, spoiler: true, roofGlass: 0.62, rakeN: 0.05, rakeT: 0.06,
    nose: { lu: 0.6, gu: 0.5, gDrop: 0.2, chrome: true, bars: 4, skid: true, iu: 0.5 }, tail: { lu: 0.52, bar: true, plate: 0.58, gate: true, cut: 0.34 } },
  wagon: { ...SEDAN, L: 4.82, deckLen: 0.08, deck: 1.05, rearRun: 0.5, pillars: [0.42, 0.76], rp: 0.12, rails: true, mass: 1600, spokes: 7, spoiler: true, roofGlass: 0.4,
    nose: { lu: 0.52, gu: 0.4, gDrop: 0.14, chrome: true, bars: 0 }, tail: { lu: 0.66, plate: 0.52, gate: true, cut: 0.3 } },
  pickup: { ...SEDAN, L: 5.75, W: 2.03, H: 1.93, wb: 3.65, fo: 0.97, R: 0.415, tw: 0.265, rimR: 0.255, gc: 0.25, cowl: -0.36, bonH: 1.34, noseH: 1.3, belt: 1.3, wsRun: 0.56, deckLen: 1.8, deck: 1.33, rearRun: 0.06, tumble: 0.8, pillars: [0.52], rp: 0.14, bed: true, mass: 2400, spokes: 6, taperF: 0.03, taperR: 0.01, sh: 0.07, clad: true, cr: 0.22, nr: 0.07, tailR: 0.03, flare: 0.045, band: 0.26, hl: 0.24, tl: 0.2, rakeN: 0.02, rakeT: 0,
    nose: { lu: 0.74, gu: 0.66, gDrop: 0.26, chrome: true, bars: 2, barH: 0.04, bumper: 'chrome', bTop: 0.27, iu: 0.42, i0: 0.06, i1: 0.19, fog: false, plate: 0.38 }, tail: { lu: 0.8, bumper: 'chrome', bTop: 0.26, plate: 0.13, panel: true } },
  van: { ...SEDAN, L: 5.6, W: 2.03, H: 2.35, wb: 3.4, fo: 1.0, R: 0.36, tw: 0.225, rimR: 0.225, gc: 0.19, cowl: 0.22, bonH: 1.26, noseH: 1.06, belt: 1.26, wsRun: 0.78, deckLen: 0.06, deck: 1.26, rearRun: 0.06, tumble: 0.88, pillars: [0.22], rp: 0.1, solidFrom: 1, mass: 2600, wheel: 'cap', taperF: 0.03, taperR: 0.01, clad: true, cr: 0.34, nr: 0.14, tailR: 0.05, band: 0.2, tailBand: 0.34, tl: 0.16, sh: 0.07, shut: [0, 0.22, 0.6], rakeN: 0.12, rakeT: 0.02,
    nose: { lu: 0.6, gu: 0.46, gDrop: 0.02, gsk: 'gloss', bars: 2, bumper: 'black', bTop: 0.46, iu: 0.5, i0: 0.1, i1: 0.3, fog: false, plate: 0.36 }, tail: { lu: 0.84, bumper: 'black', bTop: 0.2, split: true, plate: 0.4 } },
  bus: { ...SEDAN, L: 12, W: 2.55, H: 3.05, wb: 6, fo: 2.7, R: 0.5, tw: 0.3, rimR: 0.3, gc: 0.3, cowl: 2.56, bonH: 1.08, noseH: 1.05, belt: 1.08, wsRun: 0.16, deckLen: 0.08, deck: 1.08, rearRun: 0.05, tumble: 0.97, pillars: [0.115, 0.24, 0.365, 0.49, 0.615, 0.74, 0.865], rp: 0.35, winTop: 2.2, mass: 12000, wheel: 'cap', taperF: 0.02, taperR: 0.01, cr: 0.2, nr: 0.1, tailR: 0.06, wsBow: 0.06, clad: true, color: 0xd9dbd6, flare: 0, bulge: 0.01, sh: 0.06, band: 0.2, shut: [], hl: 0.2, tl: 0.14, rakeN: 0, rakeT: 0,
    nose: { lu: 0.7, gu: 0, bumper: 'black', bTop: 0.4, iu: 0.3, i0: 0.1, i1: 0.3, fog: false, plate: 0.56 }, tail: { lu: 0.84, bumper: 'black', bTop: 0.22, plate: 0.36 } },
  boxtruck: { ...SEDAN, L: 7.6, W: 2.4, cabW: 2.1, H: 3.3, cabH: 2.2, wb: 4.3, fo: 1.05, R: 0.42, tw: 0.25, rimR: 0.26, gc: 0.28, cowl: 0.2, bonH: 1.36, noseH: 1.16, belt: 1.36, wsRun: 0.5, cabEnd: 1.65, deckLen: 0.04, deck: 1.36, rearRun: 0.04, tumble: 0.9, pillars: [0.6], rp: 0.1, solidFrom: 1, rearGlass: false, mass: 6500, wheel: 'cap', taperF: 0.03, clad: true, color: 0xd9dbd6, cr: 0.3, nr: 0.14, band: 0.22, sh: 0.07, rakeN: 0.05,
    nose: { lu: 0.66, gu: 0.5, gDrop: 0.14, bars: 3, bumper: 'black', bTop: 0.4, iu: 0.5, i0: 0.1, i1: 0.28, fog: false, plate: 0.34 } },
  police: { ...SEDAN, L: 4.95, W: 1.92, H: 1.47, wb: 2.9, bonH: 1.06, belt: 1.02, deck: 1.12, mass: 1900, wheel: 'cap', color: 0x0c0d10, doorSkin: true, nose: { lu: 0.52, gu: 0.42, gDrop: 0.14, bars: 0 }, tail: { lu: 0.46, plate: 0.6 } },
  engine: { ...SEDAN, L: 9.2, W: 2.5, H: 3.1, cabH: 2.85, wb: 4.7, fo: 2.15, R: 0.52, tw: 0.3, rimR: 0.3, gc: 0.32, cowl: 2.0, bonH: 1.5, noseH: 1.44, belt: 1.5, wsRun: 0.22, cabEnd: 2.5, deckLen: 0.04, deck: 1.5, rearRun: 0.04, tumble: 0.95, pillars: [0.5], rp: 0.12, winTop: 2.42, rearGlass: false, mass: 16000, wheel: 'cap', taperF: 0.02, cr: 0.14, nr: 0.08, wsBow: 0.04, color: 0x8e1512, flare: 0, bulge: 0.01, sh: 0.06, band: 0.22, hl: 0.14, rakeN: 0,
    nose: { lu: 0.72, gu: 0.5, gDrop: 0.3, chrome: true, bars: 4, iu: 0.3, i0: 0.3, i1: 0.34, fog: false, plate: 0.2 } },
};
const carCache = new Map();
// Skins of this file: far paint is glossier because the instanced material has no clear coat.
const SK_PFAR = skin('paint', [1, 1, 1], 0.26, 0, 1), SK_MESH = withFx(surf(g3(0.016), 0.42), FX.perf, 0.013), SK_CLOTH = surf([0.055, 0.055, 0.06], 0.9), SK_GUN = surf(g3(0.09), 0.3, 0.9), SK_REFL = surf(lin(0x8a0d0d), 0.2);
const SK_FGLASS = surf([0.06, 0.075, 0.09], 0.07, 0.55), HEADC = g3(0.2), AMBC = lin(0x9a5206), LED = 0.03;   // pitch of the LED lattice in the lamp clusters

// Flat end face of the body loft, drawn as a panel of rectangular regions. ring / tags = the loft's end section (see the
// section in carBuild for the tags), dir = +1 nose, -1 tail. layout(F) -> regions [{ u: [u0, u1], y: [y0, y1], sk, sym,
// hole (recess depth), floor, wall }]: u in half-width fractions, later regions win, `sym` mirrors a one-sided region,
// sk may be a function of the side (+1 = vehicle's left). The panel's outline follows the ring exactly, so it is watertight.
function endFace(B, ring, tags, dir, kL, base, layout) {
  const j1 = tags.indexOf(1), j5 = tags.indexOf(5), j55 = tags.indexOf(5.5), j7 = tags.indexOf(7), side = ring.slice(j1, j55 + 1), topP = ring.slice(j55, j7 + 1);
  const X = y => { if (y <= side[0][1]) return side[0][0]; for (let k = 1; k < side.length; k++) if (y <= side[k][1] + 1e-9) { const a = side[k - 1], b = side[k]; return lerp(a[0], b[0], clamp((y - a[1]) / Math.max(1e-9, b[1] - a[1]))); } return side[side.length - 1][0]; };
  const yb = side[0][1], yS = side[side.length - 1][1], Xs = side[side.length - 1][0], sl = (side[side.length - 1][2] - side[0][2]) / Math.max(1e-6, yS - yb), Z = y => side[0][2] + sl * (y - yb), nl = Math.hypot(sl, 1), nF = [0, -sl * dir / nl, dir / nl];
  const topY = x => { x = Math.abs(x); for (let k = 1; k < topP.length; k++) { const a = topP[k - 1], b = topP[k]; if (x <= a[0] + 1e-9 && x >= b[0] - 1e-9) return lerp(a[1], b[1], clamp((a[0] - x) / Math.max(1e-9, a[0] - b[0]))); } return yS; };
  const F = { yb, yS, hf: yS - yb, Xs, X, Z, yR: ring[tags.indexOf(2.5)][1], yM: ring[tags.indexOf(3.5)][1], yL: ring[tags.indexOf(4.5)][1], yLT: ring[j5 + kL][1], v: f => yb + f * (yS - yb) };
  const R = []; for (const r of layout(F)) { if (r.sym) R.push({ ...r, s: 1 }, { ...r, u: [-r.u[1], -r.u[0]], s: -1 }); else R.push(r); }
  const lines = (vals, lo, hi) => { const a = vals.map(v => clamp(v, lo, hi)).sort((p, q) => p - q), out = []; for (const v of a) if (!out.length || v - out[out.length - 1] > 2e-4) out.push(v); return out; };
  const Us = lines([-1, 1, ...R.flatMap(r => r.u), ...topP.map(p => p[0] / Xs)], -1, 1), Ys = lines([yb, yS, ...R.flatMap(r => r.y), ...side.map(p => p[1])], yb, yS), nU = Us.length, nY = Ys.length;
  // vertex (i, k); row nY is the crowned top edge of the ring
  const V = (i, k) => { if (i < nY) return [Us[k] * X(Ys[i]), Ys[i], Z(Ys[i])]; const y = topY(Us[k] * Xs); return [Us[k] * Xs, y, Z(y)]; };
  const reg = (i, k) => { if (i < 0 || i >= nY - 1 || k < 0 || k >= nU - 1) return null; const uc = (Us[k] + Us[k + 1]) / 2, yc = (Ys[i] + Ys[i + 1]) / 2; let r = null; for (const g of R) if (uc > g.u[0] && uc < g.u[1] && yc > g.y[0] && yc < g.y[1]) r = g; return r; };
  const bat = new Map();
  const put = (sk, q, n) => {
    let b = bat.get(sk.id); if (!b) bat.set(sk.id, b = { sk, P: [], N: [], UV: [], I: [] });
    const [a, b1, , d] = q, ux = b1[0] - a[0], uy = b1[1] - a[1], uz = b1[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0, o = b.P.length / 3;
    for (const p of q) { b.P.push(p[0], p[1], p[2]); b.N.push(n[0], n[1], n[2]); b.UV.push((p[0] + 4) / LED, p[1] / LED); }
    if (flip) b.I.push(o, o + 3, o + 2, o, o + 2, o + 1); else b.I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const pick = (sk, r) => typeof sk === 'function' ? sk(r.s || 1) : sk, back = (p, d) => [p[0], p[1], p[2] - dir * d];
  for (let i = 0; i < nY; i++) for (let k = 0; k < nU - 1; k++) {
    const q = [V(i, k), V(i, k + 1), V(i + 1, k + 1), V(i + 1, k)], r = reg(i, k);
    if (!r || !r.hole) { put(r ? pick(r.sk, r) : base, q, nF); continue; }
    put(pick(r.floor, r), q.map(p => back(p, r.hole)), nF);
    const nb = [reg(i - 1, k), reg(i, k + 1), reg(i + 1, k), reg(i, k - 1)], nn = [[0, 1, 0], [-1, 0, 0], [0, -1, 0], [1, 0, 0]];
    for (let e = 0; e < 4; e++) if (nb[e] !== r) { const a = q[e], b = q[(e + 1) % 4]; put(pick(r.wall, r), [a, b, back(b, r.hole), back(a, r.hole)], nn[e]); }
  }
  for (const b of bat.values()) B.emit(b.sk, b.P, b.N, b.UV, b.I);
  return F;
}

// Builds (and caches) the geometry of one car type at one level of detail.
function carBuild(type, lod) {
  const key = type + lod; if (carCache.has(key)) return carCache.get(key);
  const sp = CAR_SPECS[type], hero = lod === 0, far = lod === 2, seg = [6, 4, 1][lod], PI = Math.PI;
  const B = new Builder({ seg, single: sk => sk.mat === 'glass' ? 'glass' : 'surf' }), GL = far ? SK_FGLASS : SK.glass, PA = far ? SK_PFAR : SK.paint, dec = decalSheet(), glows = [];
  if (!hero) { const rb = B.rbox.bind(B); B.rbox = (sk, w, h, d, r, ...a) => rb(sk, w, h, d, 0, ...a); }   // bevels only on the hero model
  const zF = sp.wb / 2, zN = zF + sp.fo, zT = zN - sp.L, zC = zF + sp.cowl, zH = zC - sp.wsRun, truck = sp.cabEnd != null;
  const zEnd = truck ? zC - sp.cabEnd : zT, zD = zEnd + sp.deckLen, zRH = zD + sp.rearRun, hw = (sp.cabW || sp.W) / 2, H = sp.cabH || sp.H;
  const tF = sp.taperF ?? 0.05, tR = truck ? 0 : (sp.taperR ?? 0.05), cr = sp.cr ?? 0.4, nr = sp.nr ?? 0.17, cr2 = truck ? 0 : 0.34, tr = sp.tailR ?? 0.12, Ra = sp.R + 0.06;
  const nose = sp.nose || {}, tail = sp.tail || {}, rkN = sp.rakeN ?? 0.09, rkT = truck ? 0 : (sp.rakeT ?? 0.06), kS = [4, 4, 1][lod], kC = [8, 5, 2][lod], kL = far ? 0 : kS / 2, hl = sp.hl ?? 0.36, tl = sp.tl ?? 0.3;
  const plan = z => {
    let w = hw - tF * smooth(zF - 0.3, zN, z) ** 2 - tR * (1 - smooth(zEnd, -zF + 0.3, z)) ** 2; const dn = zN - z, dt = z - zEnd;
    if (dn < cr) w -= nr * (1 - Math.sqrt(Math.max(0, 1 - (1 - dn / cr) ** 2)));
    if (dt < cr2) w -= tr * (1 - Math.sqrt(Math.max(0, 1 - (1 - dt / cr2) ** 2)));
    return w;
  };
  const tk = truck ? [[zEnd, sp.belt]] : [[zEnd, sp.deck - 0.17], [zEnd + Math.min(0.1, sp.deckLen * 0.6), sp.deck - 0.03], [zD, sp.deck]];
  if (zC - zD > 0.9) tk.push([(zD + zC) / 2, sp.belt]);
  tk.push([zC, sp.bonH]); if (zN - zC > 0.7) tk.push([zN - 0.45, lerp(sp.bonH, sp.noseH, 0.32)]); tk.push([zN - 0.09, sp.noseH + 0.02], [zN, sp.noseH - 0.1]);
  const top = curve(tk);
  const bot0 = z => sp.gc + 0.02 + 0.06 * smooth(zF + sp.R + 0.15, zN, z) + (truck ? 0 : 0.08 * (1 - smooth(zEnd, -zF - sp.R - 0.15, z)));
  const bot = z => Math.max(bot0(z), archY(z, zF, sp.R, Ra), truck ? 0 : archY(z, -zF, sp.R, Ra));
  const inBed = z => sp.bed && z < zD - 0.04 && z > zEnd + 0.09, cabinZ = z => z < zC && z > zD;
  const flare = z => (sp.flare ?? 0.032) * Math.max(Math.exp(-(((z - zF) / 0.45) ** 2)), truck ? 0 : Math.exp(-(((z + zF) / 0.45) ** 2)));
  // the shoulder band is deeper at the tail of vans (tall lamps beside the doors)
  const bandAt = z => sp.tailBand ? lerp(sp.tailBand, sp.band, smooth(zEnd + 0.3, zEnd + 1.2, z)) : (sp.band ?? 0.15), bu = sp.bulge ?? 0.03;
  // Body side at station z: sill corner, rocker, widest point, character line, shoulder. px(y) = the side's x at height y.
  const sideAt = z => {
    const w = plan(z), b0 = bot0(z), t = Math.max(top(z), bot(z) + 0.05), f = flare(z), yL = clamp(t - bandAt(z), b0 + 0.03, Math.max(b0 + 0.03, t - 0.012));
    const P = [[w - 0.05, b0], [w + f * 0.7 - 0.006, lerp(b0, yL, 0.3)], [w + f + bu, lerp(b0, yL, 0.66)], [w + f * 0.7 + bu * 0.6, yL], [w - 0.02 + f * 0.4, t]];
    const px = y => { for (let i = 1; i < 5; i++) if (y <= P[i][1]) return lerp(P[i - 1][0], P[i][0], clamp((y - P[i - 1][1]) / Math.max(1e-6, P[i][1] - P[i - 1][1]))); return P[4][0]; };
    return { P, px, t };
  };
  // Section, bottom centre to roof centre: 1 sill corner (the arch lip where a wheel arch cuts into the side), 2 rocker,
  // 3 widest point, 4 character line (a hard crease), 5 shoulder, 6 crown. Cells are tagged by these numbers (n + 0.5 =
  // the span above point n); the far side mirrors to 12 - n.
  const sec = z => {
    const { P, px, t } = sideAt(z), b = bot(z), cab = cabinZ(z), bed = inBed(z), y = [0, 1, 2].map(i => clamp(P[i + 1][1], b + 0.01 * (i + 1), t - 0.01 * (3 - i)));
    // the end faces lean back: every point slides along z in proportion to its height
    const rk = (rkT * (1 - smooth(zEnd, zEnd + 0.5, z)) - rkN * smooth(zN - 0.55, zN, z)) / (t - b), Z = yy => z + rk * (yy - b), yc = t + (cab || bed ? 0 : (sp.crown ?? 0.045));
    return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: px(b), y: b, z, r: 0.03, k: far ? 1 : 2 }, { x: px(y[0]), y: y[0], z: Z(y[0]), flat: true }, { x: px(y[1]), y: y[1], z: Z(y[1]), flat: true },
      far ? { x: px(y[2]), y: y[2], z: Z(y[2]), flat: true } : { x: px(y[2]), y: y[2], z: Z(y[2]), r: 0 },
      { x: P[4][0], y: t, z: Z(t), r: cab || bed ? 0.05 : (sp.sh ?? 0.09), k: kS }, { x: 0, y: yc, z: Z(yc), r: 1, k: kC }]);
  };
  // greenhouse stations, front to back: A, A', [pillar pairs], rear pillar, rear edge
  const ap = 0.1, rp = sp.rp, pw = 0.04, gs = [{ b: zC, c: zH }, { b: zC - ap, c: zH - ap * 0.85 }];
  for (const t of sp.pillars) { const pb = lerp(zC - ap, zD + rp, t), pc = lerp(zH - ap * 0.85, zRH + rp * 0.6, t); gs.push({ b: pb + pw, c: pc + pw }, { b: pb - pw, c: pc - pw }); }
  gs.push({ b: zD + rp, c: zRH + rp * 0.6 }, { b: zD, c: zRH });
  // cut lines: a pair of stations 7 mm apart whose cells are drawn dark (doors, cab / bed gap, bonnet edge)
  const shutT = sp.shut || (sp.pillars.length > 1 ? [0, ...sp.pillars] : [0, ...sp.pillars, 1]), doorZ = far ? [] : [...shutT.map(t => lerp(zC - ap, zD + rp, t)), ...(sp.bed ? [zD - 0.011] : [])], hoodZ = !far && zN - zC > 0.6 ? [zN - 0.17] : [];
  const nEnd = [8, 6, 3][lod], ends = c => c ? range(0, 1, nEnd).slice(0, -1).map(t => c * (1 - Math.sin(t * PI / 2))) : [];
  const zs = stations(range(zEnd, zN, [22, 14, 5][lod]), [zD, zC, zC + 0.003], zD - 0.003 > zEnd ? [zD - 0.003] : [], archStations(zF, Ra, [14, 10, 7][lod]), truck ? [] : archStations(-zF, Ra, [14, 10, 7][lod]),
    ends(cr).map(d => zN - d), ends(cr2).map(d => zEnd + d), far ? [] : gs.slice(1, -1).map(s => s.b), sp.bed ? [zD - 0.04, zEnd + 0.09] : [],
    [zN - hl], far ? [] : [zN - hl + 0.06], truck ? [] : [zEnd + tl], truck || far ? [] : [zEnd + tl - 0.06], [...doorZ, ...hoodZ].flatMap(z => [z, z + 0.007]));
  const idxOf = z0 => zs.findIndex(z => Math.abs(z - z0) < 2e-4), shut = new Set(doorZ.map(idxOf)), hood = new Set(hoodZ.map(idxOf));
  const D = {
    paint: { sk: PA }, under: { sk: SK.under }, sill: { sk: SK.black }, clad: { sk: sp.clad ? SK.black : PA }, shell: { sk: PA, inner: SK.trimDark, jamb: SK.rubber }, line: { sk: SK.under },
    bed: { sk: PA, inner: SK.black, jamb: SK.black }, white: { sk: SK_PWHITE }, whiteShell: { sk: SK_PWHITE, inner: SK.trimDark, jamb: SK.rubber },
    pillar: { sk: SK.gloss, inner: hero ? SK.trimDark : null, jamb: SK.rubber }, roof: { sk: PA, inner: hero ? SK.headliner : null, jamb: SK.rubber }, frame: { sk: PA, inner: hero ? SK.trimDark : null, jamb: SK.rubber }, glass: { glass: GL },
    head: { sk: lens(1, HEADC) }, tail: { sk: lens(2, LENS.red) }, indL: { sk: lens(3, AMBC) }, indR: { sk: lens(4, AMBC) },
  };
  const first = {};
  const lo = B.loft(zs, sec, {
    closed: true, capA: truck ? PA : null, inset: 0.05, cell: (i, tag, j) => {
      if (first[tag] === undefined) first[tag] = j;
      const q = j - first[tag], zm = (zs[i] + zs[i + 1]) / 2, cab = cabinZ(zm), bed = inBed(zm), s = tag > 6 ? 12 - tag : tag, left = tag < 6;
      if (s < 1) return far && bot(zm) < bot0(zm) + 0.01 ? null : D.under;      // parked cars keep their floor only over the wheels
      if (s > 5.2) return cab ? null : bed ? (far ? D.under : null) : hood.has(i) ? D.line : D.paint;
      if (s === 1) return D.sill;
      if (shut.has(i)) return D.line;
      if (s < 2) return D.clad;
      if (s === 4.5 || (s === 5 && kL && (left ? q < kL : q >= kS - kL))) {       // lamps wrapped around the corners, in the shoulder band
        const dn = zN - zm, dt = zm - zEnd;
        if (dn < hl) return !far && dn > hl - 0.06 ? (left ? D.indL : D.indR) : D.head;
        if (!truck && dt < tl) return !far && dt > tl - 0.06 ? (left ? D.indL : D.indR) : D.tail;
      }
      if (bed && !far && s >= 3.5) return D.bed;
      const door = sp.doorSkin && zm < gs[1].b && zm > gs[gs.length - 2].b;
      if (hero && cab && s >= 2.5) return door ? D.whiteShell : D.shell;
      return door ? D.white : D.paint;
    },
  });
  // greenhouse
  const wt = sp.winTop, sub = far ? 1 : hero ? 3 : 2, ck = [8, 4, 2][lod], cseg = far ? 1 : 4, roofY = c => H - 0.04 - 0.05 * ((2 * (c - (zH + zRH) / 2) / Math.max(0.3, zH - zRH)) ** 2);
  const ghSec = (u, i) => {
    const s = gs[i], bx = plan(s.b) - 0.055, cx = hw * sp.tumble, cy = roofY(s.c), half = [{ x: bx, y: top(s.b), z: s.b, sub }];
    if (wt) half.push({ x: lerp(bx, cx, (wt - top(s.b)) / (cy - top(s.b))), y: wt, z: lerp(s.b, s.c, (wt - top(s.b)) / (cy - top(s.b))), flat: true, sub: far ? 1 : 2 });
    half.push({ x: cx, y: cy, z: s.c, r: wt ? 0.12 : 0.13, k: cseg, sub: far ? 1 : 2 }, { x: 0, y: cy + 0.04, z: s.c + (i === 0 ? 0.06 : i === gs.length - 1 ? -0.05 : 0), r: 1, k: ck });
    return mirrorRing(half, false);
  };
  const nG = gs.length, cT = wt ? 2 : 1, glassTag = tag => wt ? (tag === 0.5 || tag === 5.5) : (tag < 1 || tag > 3), sideTag = tag => tag < cT || tag > cT + 2;
  const gh = B.loft(gs.map((s, i) => i), ghSec, {
    inset: 0.04, edgeJamb: hero ? 'lr' : null, cell: (i, tag) => {
      if (!sideTag(tag)) return D.roof;
      if (i === 0 || i === nG - 2) return D.frame;
      if (i % 2 === 0) return D.pillar;
      return glassTag(tag) && !(sp.solidFrom != null && (i - 1) / 2 >= sp.solidFrom) ? D.glass : D.frame;
    },
  });
  // front and rear glass: Coons patches closing the first and last greenhouse stations
  const mid = gh.tags.indexOf(cT) + (cseg >> 1), nR = gh.rows[0].length, glassRows = wt ? sub : gh.tags.indexOf(cT);
  const endGlass = (row, zBase, bow, facing, glazed) => {
    const Lp = row.slice(0, mid + 1), Tp = row.slice(mid, nR - mid), Rp = row.slice(nR - mid - 1).reverse(), bx = row[0][0], fw = cseg >> 1;
    const Bp = Tp.map(p => { const x = p[0] / Tp[0][0] * bx, z = zBase + bow * (1 - (x / bx) ** 2); return [x, top(Math.min(z, zN)), z]; });
    Bp[0] = row[0].slice(); Bp[Bp.length - 1] = row[nR - 1].slice();
    B.coons(Bp, Tp, Lp, Rp, { facing, inset: 0.04, cell: (i, j) => (!glazed || j < fw || j >= Tp.length - 1 - fw || i >= glassRows) ? D.frame : D.glass });
    return Bp;
  };
  const wsB = endGlass(gh.rows[0], zC, sp.wsBow ?? 0.14, [0, 0.5, 1], true);
  endGlass(gh.rows[nG - 1], zD, -Math.min((sp.wsBow ?? 0.14) * 0.6, sp.deckLen * 0.4), [0, 0.5, -1], sp.rearGlass !== false);

  // ---- nose: lamp clusters with a DRL brow, grille and intake recesses, bumper, plate
  const LHEAD = far ? lens(1, [0.1, 0.11, 0.13]) : lens(1, g3(0.5), [1, 1]), LDRL = lens(9, g3(0.8)), LTAIL = lens(2, LENS.red, [1, 1]), LTAILP = lens(2, LENS.red), LREV = lens(5, g3(0.32), [1, 1]);
  const xw = sp.W / 2 - sp.tw / 2 - 0.015, big = sp.L > 7, plate = dec.uv['plate' + (1 + CAR_TYPES.indexOf(type) % 7)], barSk = nose.chrome ? SK.chrome : SK.gloss;
  let gr = null;
  const NF = endFace(B, lo.rows[zs.length - 1], lo.tags, 1, kL, PA, F => {
    const R = [], v = F.v, lu = nose.lu ?? 0.5, gu = nose.gu ?? 0.4, iu = nose.iu ?? 0.58, i0 = v(nose.i0 ?? 0.07), i1 = v(nose.i1 ?? 0.3), e = 0.012 / F.Xs;
    const bsk = nose.bumper === 'black' ? SK.black : nose.bumper === 'chrome' ? SK.chrome : null;
    if (bsk) R.push({ u: [-2, 2], y: [-9, v(nose.bTop ?? 0.36)], sk: bsk }); else if (sp.clad) R.push({ u: [-2, 2], y: [-9, F.yR], sk: SK.black });
    R.push(far ? { u: [-iu, iu], y: [i0, i1], sk: SK.under } : { u: [-iu, iu], y: [i0, i1], hole: 0.05, floor: SK_MESH, wall: SK.black });
    if (nose.skid && !far) R.push({ u: [-iu * 0.8, iu * 0.8], y: [-9, i0 - 0.012], sk: SK.alu });
    if (nose.fog !== false && !far && iu < 0.66) R.push({ u: [iu + 0.1, Math.min(0.93, iu + 0.3)], y: [lerp(i0, i1, 0.2), lerp(i0, i1, 0.8)], hole: 0.03, floor: SK_MESH, wall: SK.black, sym: true });
    const g1 = far ? F.yLT : F.yLT - 0.012, g0 = Math.max(i1 + 0.03, F.yL - (nose.gDrop ?? 0.1));
    if (gu > 0 && g1 - g0 > 0.03) {
      gr = { g0, g1, w: gu * F.X((g0 + g1) / 2) };
      if (far) R.push({ u: [-gu, gu], y: [g0, g1], sk: SK.under });
      else { if (nose.chrome) R.push({ u: [-gu - e, gu + e], y: [g0 - 0.012, g1 + 0.01], sk: SK.chrome }); R.push({ u: [-gu, gu], y: [g0, g1], hole: 0.035, floor: nose.gsk === 'gloss' ? SK.gloss : SK_MESH, wall: barSk }); }
    }
    R.push({ u: [lu, 2], y: [F.yL, F.yLT], sk: LHEAD, sym: true });
    if (!far) R.push({ u: [lu - (nose.brow ?? 0.1), 2], y: [F.yLT - 0.02, F.yLT], sk: LDRL, sym: true });
    return R;
  });
  const wf = NF.Xs, yfb = NF.yb, yft = NF.yS, hf = NF.hf, yLamp = (NF.yL + NF.yLT) / 2;
  if (!far) {
    if (gr && nose.bars) for (let k = 0; k < nose.bars; k++) { const y = lerp(gr.g0, gr.g1, (k + 1) / (nose.bars + 1)); B.box(barSk, gr.w * 2 - 0.01, nose.barH ?? 0.014, 0.022, 0, y, NF.Z(y) - 0.016); }
    if (gr) B.cyl(SK.chrome, 0.04, 0.04, 0.04, 0, (gr.g0 + gr.g1) / 2, NF.Z((gr.g0 + gr.g1) / 2) - 0.017, 'z', 10, 2);                 // badge
    B.at(0, NF.v(nose.plate ?? 0.3), NF.Z(NF.v(nose.plate ?? 0.3)) + 0.006, () => { B.rbox(SK.black, 0.33, 0.17, 0.012, 0.003); B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0.008, plate); });
    for (const s of [1, -1]) {
      const lu = nose.lu ?? 0.5, zi = zN - hl + 0.045;
      glows.push({ pos: [s * NF.X(yLamp) * (1 + lu) / 2, yLamp, zN + 0.06], dir: [s * 0.2, 0, 0.97], size: 0.42, ch: 1, gain: 0.04 }, { pos: [s * (plan(zi) + 0.05), yLamp, zi], dir: [s * 0.85, 0, 0.5], size: 0.22, ch: s > 0 ? 3 : 4, gain: 0.05 });
    }
  }
  // ---- tail: lamp clusters (reversing lamp inboard), optional light bar, plate recess, bumper and cut lines
  const lampAt = (ch, tint, w, h, x, y, z, ry, glow, gain = 0.05) => { B.at(x, y, z, 0, ry, 0, () => { B.rbox(lens(ch, tint), w, h, 0.05, far ? 0 : 0.012, 0, 0, 0); if (glow) glows.push({ pos: B.pt(0, 0, 0.05), dir: B.dir(0, 0, 1), size: clamp(glow * 0.7, 0.15, 0.5), ch, gain }); }); };
  let wr = plan(zEnd);
  if (!truck) {
    let py = 0; const chromeB = tail.bumper === 'chrome';
    const TF = endFace(B, lo.rows[0], lo.tags, -1, kL, PA, F => {
      const R = [], v = F.v, lu = tail.lu ?? 0.48, e = 0.007 / F.Xs, PW = 0.19 / F.Xs, bsk = tail.bumper === 'black' ? SK.black : chromeB ? SK.chrome : null, bT = v(tail.bTop ?? 0.3);
      if (bsk) R.push({ u: [-2, 2], y: [-9, bT], sk: bsk });
      else { if (sp.clad) R.push({ u: [-2, 2], y: [-9, F.yR], sk: SK.black }); R.push({ u: [-0.76, 0.76], y: [-9, v(0.12)], sk: SK.black }); }
      const yc = bsk ? bT : v(tail.cut ?? 0.4); py = v(tail.plate ?? 0.6);
      if (!far) {
        R.push({ u: [-0.95, 0.95], y: [yc, yc + 0.007], sk: SK.under });
        if (tail.gate) R.push({ u: [0.9, 0.9 + e], y: [yc, 9], sk: SK.under, sym: true });
        if (tail.split) R.push({ u: [-e / 2, e / 2], y: [yc, 9], sk: SK.under });
        if (!bsk) R.push({ u: [0.64, 0.9], y: [v(0.2), v(0.2) + 0.03], sk: SK_REFL, sym: true });
        if (tail.panel) R.push({ u: [-0.72, 0.72], y: [v(0.44), F.yS - 0.08], hole: 0.014, floor: PA, wall: PA });
        R.push({ u: [-PW, PW], y: [py - 0.095, py + 0.095], hole: 0.016, floor: chromeB ? SK.black : PA, wall: chromeB ? SK.black : PA });
      }
      R.push({ u: [lu, 2], y: [F.yL, F.yLT], sk: LTAIL, sym: true });
      if (!far) R.push({ u: [lu, lu + 0.1], y: [F.yL, lerp(F.yL, F.yLT, 0.55)], sk: LREV, sym: true });
      if (tail.bar) R.push({ u: [-lu, lu], y: [F.yLT - 0.04, F.yLT], sk: LTAILP });
      return R;
    });
    wr = TF.Xs; const yT = (TF.yL + TF.yLT) / 2;
    if (!far) {
      B.at(0, py, TF.Z(py) + 0.011, 0, PI, 0, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, plate));
      if (tail.garnish) B.box(SK.chrome, 0.5, 0.018, 0.012, 0, py + 0.115, TF.Z(py + 0.115) - 0.004);
      if (tail.panel) B.box(SK.black, 0.22, 0.035, 0.02, 0, TF.yS - 0.05, TF.Z(TF.yS - 0.05) - 0.006);                             // tailgate handle
      if (!tail.bumper) for (const s of sp.clad ? [1] : [1, -1]) { B.cyl(SK.chrome, 0.034, 0.034, 0.09, s * (wr - 0.22), TF.yb + 0.045, zEnd + 0.03, 'z', 8, 1); B.cyl(SK.under, 0.026, 0.026, 0.09, s * (wr - 0.22), TF.yb + 0.045, zEnd + 0.028, 'z', 8, 1); }
      if (sp.rearGlass !== false && !sp.bed) lampAt(2, LENS.red, 0.22, 0.016, 0, roofY(zRH) - 0.035, zRH - 0.035, PI, 0);       // high-mounted stop lamp
      for (const s of [1, -1]) {
        const lu = tail.lu ?? 0.48, zi = zEnd + tl - 0.045;
        glows.push({ pos: [s * TF.X(yT) * (1 + lu) / 2, yT, zEnd - 0.06], dir: [s * 0.2, 0, -0.97], size: 0.38, ch: 2, gain: 0.04 }, { pos: [s * (plan(zi) + 0.05), yT, zi], dir: [s * 0.85, 0, -0.5], size: 0.22, ch: s > 0 ? 3 : 4, gain: 0.05 });
      }
    }
  }
  // belly between the wheels so the arches are not see-through; arch liners and lips
  B.box(SK.under, (xw - sp.tw / 2 - 0.02) * 2, far ? 0.3 : 0.42, zN - zT - 0.6, 0, sp.gc + (far ? 0.2 : 0.26), (zN + zT) / 2);
  if (!far) B.mirror(() => {
    for (const za of truck ? [zF] : [zF, -zF]) {
      B.at(0, sp.R, za, () => B.lathe(SK.under, [[xw - sp.tw / 2 - 0.03, Ra - 0.004], [hw - 0.02, Ra - 0.004]], { axis: 'x', seg: hero ? 12 : 6, arc: [-PI / 2, PI / 2], flip: true }));
      const n = hero ? 18 : 9, arc = range(10, 170, n).map(a => { const z = za + (Ra + 0.006) * Math.cos(rad(a)); const y = sp.R + (Ra + 0.006) * Math.sin(rad(a)); return [sideAt(z).px(y) - (sp.clad ? 0.012 : 0.008), y, z]; });
      if (sp.clad) B.tube(SK.black, arc, 0.028, hero ? 6 : 4, { up: i => [0, Math.sin(rad(10 + i * 160 / n)), Math.cos(rad(10 + i * 160 / n))], caps: false });
    }
  });
  // mirrors, handles, belt trim, cowl seal, roof furniture
  const mz = gs[1].b - 0.04, my = top(mz) + 0.07;
  B.mirror(() => {
    if (big) { B.rbox(SK.black, 0.1, 0.3, 0.07, 0.03, plan(mz) + 0.2, my + 0.5, mz + 0.5); if (!far) { B.rbox(SK.mirror, 0.08, 0.26, 0.004, 0, plan(mz) + 0.2, my + 0.5, mz + 0.464); B.tube(SK.black, [[plan(mz) - 0.02, my + 0.75, mz + 0.45], [plan(mz) + 0.2, my + 0.7, mz + 0.5], [plan(mz) + 0.2, my + 0.5, mz + 0.5]], 0.012, 5); } }
    else if (far) B.box(PA, 0.16, 0.09, 0.07, plan(mz) + 0.05, my, mz);
    else { B.at(plan(mz) + 0.095, my, mz, () => { B.stack.push(B.M.clone()); B.M.multiply(_m.makeScale(1.75, 1, 1));       // housing: a dome with the glass as its flat back
        B.lathe(PA, [[-0.032, 0], [-0.032, 0.05], [-0.036, 0.058], [-0.01, 0.06], [0.03, 0.044], [0.05, 0.02], [0.054, 0]], { axis: 'z', seg: hero ? 14 : 8, cell: i => ({ sk: i === 0 ? SK.mirror : PA }) }); B.M.copy(B.stack.pop()); }); B.box(SK.black, 0.08, 0.025, 0.045, plan(mz) + 0.0, my - 0.04, mz); }
    if (far) return;
    const sh = shutT;
    if (!big) for (let d = 1; d < sh.length; d++) {       // one handle per door, on the character line near its rear edge
      const hz = lerp(zC - ap, zD + rp, sh[d]) + 0.15, hy = top(hz) - bandAt(hz) + 0.04; if (sp.solidFrom != null && d > 1 && type !== 'van') continue;
      const hx = sideAt(hz).px(hy); B.rbox(sp.clad ? SK.black : PA, 0.024, 0.028, 0.17, 0.01, hx + 0.006, hy, hz); B.box(SK.under, 0.01, 0.04, 0.19, hx - 0.004, hy, hz);
    }
    B.tube(SK.gloss, gs.slice(1, nG - 1).map(s => [plan(s.b) - 0.05, top(s.b) + 0.006, s.b]), 0.012, 4, { caps: false });
  });
  // parked cars: the door cut lines are dark strips laid on the body side (cheaper than stations in the loft)
  if (far) B.mirror(() => { for (const t of shutT) { const z0 = lerp(zC - ap, zD + rp, t), S = sideAt(z0), yb = bot(z0) + 0.02, P = [], N = [], I = []; [S.P[1][1], S.P[2][1], S.P[3][1], S.t - 0.012].forEach((y0, i) => { const y = Math.max(y0, yb + i * 0.004), x = S.px(y) + 0.006; P.push(x, y, z0 - 0.007, x, y, z0 + 0.007); N.push(1, 0, 0, 1, 0, 0); if (i) { const o = (i - 1) * 2; I.push(o, o + 3, o + 1, o, o + 2, o + 3); } }); B.emit(SK.under, P, N, null, I); } });
  if (lod === 1) for (const x of [0.5, -0.12]) { const bw = sp.wsBow ?? 0.14, bx = plan(zC) - 0.055, xx = x * bx; B.at(xx, top(zC) + 0.03, zC + bw * (1 - (xx / bx) ** 2) - 0.055, 0, Math.atan(2 * bw * xx / (bx * bx)), 0, () => B.box(SK.black, 0.52, 0.014, 0.022)); }      // wipers at rest
  if (!far) {
    B.tube(SK.rubber, wsB.map(p => [p[0], p[1] + 0.003, p[2] + 0.01]), 0.014, hero ? 5 : 4);
    if (!truck && !sp.bed && !big) B.at(0, roofY(zRH + 0.35) + 0.025, zRH + 0.35, 0.12, 0, 0, () => B.box(SK.gloss, 0.035, 0.05, 0.15));      // aerial fin
    if (sp.roofGlass) B.box(SK_FGLASS, hw * sp.tumble * 1.25, 0.012, (zH - zRH) * sp.roofGlass, 0, roofY((zH + zRH) / 2) + 0.036, lerp(zRH, zH, 0.56));
    if (sp.spoiler) B.at(0, roofY(zRH) - 0.012, zRH - 0.06, 0.1, 0, 0, () => B.box(PA, hw * sp.tumble * 1.86, 0.028, 0.2));
  }
  // cabin. Traffic cars get a dark tub under the glass (the body is single-sided) with seats, dash and wheel;
  // the hero model has a shelled body and a fuller cabin.
  const fl = Math.max(sp.gc + 0.14, sp.belt - 0.72), cl = zC - zD, sx = hw * 0.42, TD = SK.trimDark;
  if (lod === 1) {
    const zm = (zC + zD) / 2, yT = Math.min(top(zC - 0.05), top(zD + 0.05), top(zm)) - 0.004, xt = Math.min(plan(zC), plan(zD)) - 0.03;
    B.mirror(() => B.at(xt, (fl + yT) / 2, zm, 0, -PI / 2, 0, () => B.plane(TD, cl, yT - fl)));
    B.at(0, (fl + top(zC)) / 2, zC - 0.01, 0, PI, 0, () => B.plane(TD, xt * 2, top(zC) - fl)); B.at(0, (fl + top(zD)) / 2, zD + 0.01, () => B.plane(TD, xt * 2, top(zD) - fl));
    B.at(0, fl, zm, -PI / 2, 0, 0, () => B.plane(TD, xt * 2, cl));
    B.box(TD, xt * 2, 0.16, 0.36, 0, top(zC) - 0.08, zC - 0.19);                                             // dash
    if (!truck && sp.deckLen > 0.3 && !sp.bed) B.box(TD, xt * 2, 0.03, sp.rearRun + 0.1, 0, sp.deck - 0.04, zD + sp.rearRun / 2);
    const seat = (x, z, w, heads) => { B.box(SK_CLOTH, w, 0.14, 0.48, x, fl + 0.24, z); B.at(x, fl + 0.56, z - 0.28, -0.18, 0, 0, () => { B.box(SK_CLOTH, w, 0.56, 0.11); for (const hx of heads) B.box(SK_CLOTH, 0.25, 0.17, 0.09, hx, 0.38, 0); }); };
    for (const s of [1, -1]) seat(s * sx, zC - 0.95, 0.5, [0]);
    if (type === 'bus') for (let z = zC - 2.2; z > zD + 1; z -= 0.86) for (const s of [1, -1]) seat(s * (xt - 0.48), z, 0.86, []);
    else if (cl > 2 && sp.solidFrom == null) seat(0, zC - 1.85, sx * 2 + 0.5, [sx, -sx]);
    B.at(sx, top(zC) - 0.13, zC - 0.47, -0.42, 0, 0, () => B.tube(TD, range(0, 1, 10).slice(0, -1).map(t => [Math.cos(t * TAU) * 0.185, Math.sin(t * TAU) * 0.185, 0]), 0.017, 4, { loop: true, up: [0, 0, 1] }));
  }
  if (hero) {
    B.box(TD, hw * 1.8, 0.04, cl + 0.3, 0, fl, (zC + zD) / 2); B.rbox(TD, hw * 1.8, 0.3, 0.36, 0.08, 0, top(zC) - 0.15, zC - 0.2); B.rbox(TD, 0.3, 0.2, cl * 0.5, 0.04, 0, fl + 0.12, zC - cl * 0.4);
    for (const s of [1, -1]) for (const z of [zC - 0.95, ...(cl > 2 ? [zC - 1.85] : [])]) { B.rbox(SK_SEAT, 0.5, 0.13, 0.5, 0.05, s * sx, fl + 0.24, z); B.at(s * sx, fl + 0.54, z - 0.27, -0.2, 0, 0, () => { B.rbox(SK_SEAT, 0.5, 0.56, 0.12, 0.05); B.rbox(SK_SEAT, 0.26, 0.15, 0.1, 0.04, 0, 0.36, 0); }); }
    B.at(sx, top(zC) - 0.14, zC - 0.48, -0.42, 0, 0, () => { const ring = range(0, 1, 20).slice(0, -1).map(t => [Math.cos(t * TAU) * 0.185, Math.sin(t * TAU) * 0.185, 0]); B.tube(TD, ring, 0.016, 6, { loop: true, up: [0, 0, 1] }); B.rbox(TD, 0.34, 0.07, 0.03, 0.01); B.cyl(TD, 0.03, 0.03, 0.3, 0, 0, 0.14, 'z', 6); });
    if (!truck && sp.deckLen > 0.3 && !sp.bed) B.box(TD, hw * 1.6, 0.03, sp.rearRun + 0.1, 0, sp.deck - 0.05, zD + sp.rearRun / 2);
    for (const x of [0.55, -0.05]) B.at(x * hw * 2 * 0.55, top(zC) + 0.03, zC + 0.07 + 0.1 * (1 - (x * 0.9) ** 2), -0.75, 0, 0, () => { B.tube(SK.black, [[0, 0, 0.02], [-0.5, 0.03, 0.03]], 0.007, 4); B.rbox(SK.rubber, 0.5, 0.016, 0.02, 0.004, -0.38, 0.03, 0.016); });
  }
  if (type === 'van' && !far) B.mirror(() => { const za = lerp(zC - ap, zD + rp, 0.22), y = sp.belt - 0.035; B.box(SK.black, 0.014, 0.022, za - zD - 0.5, sideAt(0).px(y) + 0.004, y, (za + zD + 0.5) / 2 - 0.25); });
  if (sp.rails && !far) B.mirror(() => B.tube(SK.black, [[hw * sp.tumble - 0.1, H - 0.03, zH - 0.25], [hw * sp.tumble - 0.1, H + 0.03, zH - 0.33], [hw * sp.tumble - 0.1, H + 0.03, zRH + 0.2], [hw * sp.tumble - 0.1, H - 0.03, zRH + 0.1]], 0.014, hero ? 5 : 4));
  if (sp.bed) { const fy = lerp(bot(0), top(zD - 0.2), 0.62); B.box(SK.black, hw * 1.8, 0.03, zD - zEnd - 0.1, 0, fy, (zD + zEnd) / 2); if (!far) { B.at(0, 0, zEnd + 0.1, () => B.plane(SK.black, hw * 1.84, sp.deck - fy, 0, (sp.deck + fy) / 2 - 0.01, 0)); B.at(0, 0, zD - 0.045, 0, PI, 0, () => B.plane(SK.black, hw * 1.84, sp.deck - fy, 0, (sp.deck + fy) / 2 - 0.01, 0)); } }
  let bar = null;
  if (type === 'police') {
    const by = H + 0.02, bz = lerp(zH, zRH, 0.45);
    B.rbox(SK.black, 1.16, 0.03, 0.26, 0.01, 0, by + 0.012, bz); for (const s of [1, -1]) B.rbox(SK.under, 0.05, 0.05, 0.3, 0.01, s * 0.5, by - 0.01, bz);
    for (const s of [1, -1]) { B.rbox(lens(s > 0 ? 6 : 7, s > 0 ? LENS.red : LENS.blue), 0.5, 0.075, 0.24, far ? 0 : 0.02, s * 0.3, by + 0.066, bz); for (const d of [1, -1]) glows.push({ pos: [s * 0.32, by + 0.07, bz + d * 0.14], dir: [0, 0.1, d], size: 0.45, ch: s > 0 ? 6 : 7, gain: 0.06 }); }
    B.rbox(lens(8, LENS.clear), 0.1, 0.07, 0.24, far ? 0 : 0.015, 0, by + 0.064, bz); B.rbox(SK.gloss, 1.14, 0.014, 0.25, 0.005, 0, by + 0.11, bz);
    if (!far) {
      const dz = lerp(gs[1].b, gs[2].b, 0.5) - 0.1, dy = top(dz) - 0.42;
      B.mirror(() => B.tube(SK.black, [[0.3, yfb + 0.02, zN + 0.02], [0.3, yfb + 0.05, zN + 0.1], [0.3, yft + 0.02, zN + 0.1], [0.3, yft + 0.05, zN + 0.0]], 0.02, 6));
      B.rbox(SK.black, 0.62, 0.035, 0.04, 0.012, 0, yft, zN + 0.1); B.rbox(SK.black, 0.62, 0.035, 0.04, 0.012, 0, yfb + hf * 0.45, zN + 0.1);
      const dx = sideAt(dz).px(dy) + 0.004; B.at(dx, dy, dz, 0, PI / 2, 0, () => B.plane(SK_DECAL, 0.72, 0.135, 0, 0, 0, dec.uv.police)); B.at(-dx, dy, dz, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 0.72, 0.135, 0, 0, 0, dec.uv.police));
    }
    bar = 'police';
  }
  // truck bodies behind the cab
  if (truck) {
    const z0 = zEnd - 0.1, bw = sp.W / 2, yb = sp.R * 2 + 0.12, fire = type === 'engine', SB = fire ? PA : SK_PWHITE, bodyH = fire ? 2.55 : sp.H;
    for (const s of [1, -1]) B.box(SK.under, 0.09, 0.24, zEnd - zT + 0.6, s * 0.42, sp.R + 0.22, (zEnd + zT) / 2 + 0.2);
    B.cyl(SK.iron, 0.08, 0.08, sp.W - 0.3, 0, sp.R, -zF, 'x', 8);
    if (fire) {
      B.rbox(SB, bw * 2, bodyH - yb + 0.5, z0 - zT, far ? 0 : 0.03, 0, (bodyH + yb - 0.5) / 2, (z0 + zT) / 2);
      if (!far) {
        B.mirror(() => {
          B.rbox(SK.alu, 0.03, 1.25, 1.0, 0.01, bw + 0.005, 1.5, z0 - 0.6);                                          // pump panel
          for (let i = 0; i < 8; i++) B.cyl(i < 3 ? SK.chrome : SK.gloss, 0.05, 0.05, 0.04, bw + 0.03, 1.2 + (i % 4) * 0.22, z0 - 0.3 - (i >> 2) * 0.45, 'x', 10);
          for (const [za, zb, ya, yb2] of [[z0 - 1.2, -zF + 0.75, 0.75, 2.2], [-zF - 0.75, zT + 0.1, 0.75, 2.2], [-zF + 0.7, -zF - 0.7, 1.75, 2.2]]) B.rbox(withFx(SK.alu, FX.ribbed, 1), 0.02, yb2 - ya, za - zb - 0.08, 0.008, bw + 0.004, (ya + yb2) / 2, (za + zb) / 2);
          B.box(SK_GOLD, 0.012, 0.06, zEnd - zT + 2.2, bw + 0.002, 1.02, (zEnd + zT) / 2 + 1.1);
          lampAt(6, LENS.red, 0.2, 0.13, bw + 0.01, 2.36, z0 - 0.25, PI / 2, 0.6); lampAt(7, LENS.red, 0.2, 0.13, bw + 0.01, 2.36, zT + 0.3, PI / 2, 0.6);
        });
        B.at(bw + 0.012, 2.36, (z0 + zT) / 2, 0, PI / 2, 0, () => B.plane(SK_DECAL, 2.2, 0.34, 0, 0, 0, dec.uv.fire));
        B.at(-(bw + 0.012), 2.36, (z0 + zT) / 2, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 2.2, 0.34, 0, 0, 0, dec.uv.fire));
        B.box(SK.under, bw * 1.5, 0.3, z0 - zT - 1.4, 0, bodyH + 0.1, (z0 + zT) / 2 - 0.3);                             // hose bed
        for (const x of [-bw + 0.25, -bw + 0.7]) B.tube(SK.alu, [[x, bodyH + 0.34, z0 - 0.5], [x, bodyH + 0.34, zT + 0.2]], 0.025, 5);     // ladder
        if (hero) for (let i = 0; i < 9; i++) B.tube(SK.alu, [[-bw + 0.25, bodyH + 0.34, z0 - 0.7 - i * 0.6], [-bw + 0.7, bodyH + 0.34, z0 - 0.7 - i * 0.6]], 0.016, 4, { caps: false });
        B.rbox(withFx(SK.alu, FX.diamond), bw * 2 + 0.1, 0.06, 0.4, 0.015, 0, yb - 0.45, zT - 0.15);                     // tailboard
      }
      // cab roof bar
      const by = H + 0.03, bz = zH - 0.7; B.rbox(SK.black, 1.9, 0.04, 0.3, 0.01, 0, by, bz);
      for (let k = 0; k < 6; k++) { const x = 0.775 - k * 0.31, ch = [6, 6, 8, 8, 7, 7][k]; B.rbox(lens(ch, ch === 8 ? LENS.clear : LENS.red), 0.29, 0.085, 0.28, far ? 0 : 0.02, x, by + 0.06, bz); for (const d of [1, -1]) glows.push({ pos: [x, by + 0.07, bz + d * 0.16], dir: [0, 0.1, d], size: 0.45, ch, gain: 0.06 }); }
      if (!far) { B.rbox(SK.chrome, hw * 2 + 0.1, 0.3, 0.3, 0.03, 0, yfb + 0.2, zN + 0.14); B.at(0, 2.62, zN + 0.012, () => B.plane(SK_DECAL, 1.0, 0.31, 0, 0, 0, dec.uv.engine)); }
      bar = 'fire';
    } else {
      B.rbox(SB, bw * 2, bodyH - yb, z0 - zT, far ? 0 : 0.035, 0, (bodyH + yb) / 2, (z0 + zT) / 2);
      if (!far) {
        B.at(bw + 0.004, yb + (bodyH - yb) * 0.62, (z0 + zT) / 2, 0, PI / 2, 0, () => B.plane(SK_DECAL, 3.6, 1.0, 0, 0, 0, dec.uv.haul)); B.at(-bw - 0.004, yb + (bodyH - yb) * 0.62, (z0 + zT) / 2, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 3.6, 1.0, 0, 0, 0, dec.uv.haul));
        for (let i = 0; i < 8; i++) B.box(SK.alu, bw * 2 - 0.2, 0.012, 0.012, 0, yb + 0.2 + i * (bodyH - yb - 0.3) / 8, zT - 0.004);
        B.rbox(SK.alu, bw * 2 - 0.12, bodyH - yb - 0.1, 0.02, 0.006, 0, (bodyH + yb) / 2, zT + 0.002); B.box(SK.under, bw * 2, 0.1, 0.08, 0, yb - 0.45, zT + 0.1);
        B.mirror(() => { B.box(SK.under, 0.06, 0.3, 0.06, 0.5, yb - 0.25, zT + 0.1); B.box(SK.rubber, 0.55, 0.4, 0.014, bw - 0.35, sp.R + 0.05, -zF - sp.R - 0.25); B.rbox(SK.under, 0.4, 0.4, 0.9, 0.06, bw - 0.3, yb - 0.32, zEnd - 0.9); });
      }
    }
    const ty = yb - (fire ? 0.2 : 0.02);
    for (const s of [1, -1]) { lampAt(2, LENS.red, 0.14, 0.1, s * (bw - 0.14), ty + 0.2, zT - 0.004, PI, 0.5, 0.045); lampAt(s > 0 ? 3 : 4, LENS.amber, 0.14, 0.1, s * (bw - 0.3), ty + 0.2, zT - 0.004, PI, 0.3); }
    if (!far) B.at(0, ty + 0.2, zT - 0.012, 0, PI, 0, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, dec.uv.plate3));
  }
  if (type === 'bus' && !far) {
    for (const [za, zb] of [[zF + 2.2, zF + 1.0], [-0.2, -1.5]]) B.rbox(SK_DGLASS, 0.02, 0.66, za - zb, 0.006, -hw - 0.012, 0.72, (za + zb) / 2);
    B.mirror(() => B.box(surf(0x1d5b8a, 0.3), 0.012, 0.2, sp.L - 0.9, hw + 0.012, 0.86, (zN + zT) / 2));
    B.at(hw + 0.002, 2.66, 0.8, 0, PI / 2, 0, () => B.plane(SK_DECAL, 5.0, 0.42, 0, 0, 0, dec.uv.transit));
    B.at(-hw - 0.002, 2.66, 0.8, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 5.0, 0.42, 0, 0, 0, dec.uv.transit));
    B.at(0, 2.62, zN - 0.11, () => { B.rbox(SK.gloss, 1.7, 0.36, 0.02, 0.006); B.plane(SK_DECAL, 1.0, 0.31, 0, 0, 0.012, dec.uv.bus); });
    B.rbox(SK_PWHITE, 1.8, 0.2, 2.6, 0.06, 0, H + 0.08, -1.0); B.rbox(SK_MESH, 1.6, 0.7, 0.03, 0.01, 0, 1.5, zT - 0.004);
  }
  // wheels
  const dual = truck ? sp.tw + 0.03 : 0, wspec = { R: sp.R, W: sp.tw, rimR: sp.rimR, seg: [28, 20, 8][lod], lite: !hero, style: sp.wheel, grooves: hero ? 3 : 0, spokes: sp.spokes || 5, lugs: hero ? 5 : 0, rimSk: sp.wheel === 'cap' ? surf(g3(0.5), 0.3, 0.9) : sp.rim === 'dark' ? SK_GUN : SK.steel };
  const wpos = [[xw, sp.R, zF], [-xw, sp.R, zF], [xw - (dual ? 0.02 : 0), sp.R, -zF], [-xw + (dual ? 0.02 : 0), sp.R, -zF]];
  if (far) for (const [x, y, z] of wpos) {
    // far wheel: tyre drum and a rim disc whose wedges alternate bright and dark, which reads as spokes from a distance
    const sg = Math.sign(x), w = sp.tw + (dual && z < 0 ? dual : 0), rimSk = sp.wheel === 'cap' ? surf(g3(0.45), 0.3, 0.9) : sp.rim === 'dark' ? SK_GUN : SK.steel;
    B.cyl(SK.tyre, sp.R, sp.R, w, x - sg * (dual && z < 0 ? dual / 2 : 0), y, z, 'x', 14, sg > 0 ? 2 : 1);
    B.at(x + sg * (sp.tw / 2 + 0.004), y, z, () => B.lathe(rimSk, [[0, sp.rimR], [sg * 0.014, sp.rimR * 0.4], [sg * 0.014, 0]], { axis: 'x', seg: 10, flip: x < 0, cell: (i, j) => ({ sk: sp.wheel !== 'cap' && i === 0 && j % 2 ? SK.under : rimSk }) }));
  }
  const parts = B.build({ surf: _phMat, glass: _phMat })[''], geo = {}; for (const m of parts) geo[m.name.split(':')[1]] = m.geometry;
  const res = {
    geo, glow: glowGeo(glows), wpos, bar, tris: B.tris(), wheelGeo: far ? null : [wheelGeo(wspec, 1), wheelGeo(wspec, -1), wheelGeo(wspec, 1, dual), wheelGeo(wspec, -1, dual)],
    dims: { length: sp.L, width: sp.W, height: sp.H + (bar ? 0.15 : 0), wheelbase: sp.wb, track: xw * 2, frontOverhang: sp.fo, rearOverhang: sp.L - sp.wb - sp.fo, wheelRadius: sp.R, mass: sp.mass, cgHeight: lerp(sp.gc, sp.H, 0.33) },
  };
  carCache.set(key, res); return res;
}

let _carGlass = null, _farMat = null;
// The kit's surface material with a finer metallic flake (its default grain is tuned for close-ups).
function carMat(o) {
  const m = makeSurfMat(o), kit = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => { kit(sh, r); sh.fragmentShader = sh.fragmentShader.replace('rnd*0.24*uFlake*fd', 'rnd*0.06*uFlake*fd'); };
  m.customProgramCacheKey = () => key + 'car';
  return m;
}
// One traffic vehicle. opts: color (hex or THREE.Color; fleet vehicles keep their own), lod 0 hero | 1 traffic | 2 far, seed.
export function buildCar(type = 'sedan', opts = {}) {
  if (!CAR_SPECS[type]) type = 'sedan';
  const lod = opts.lod ?? 1, G = carBuild(type, lod), sp = CAR_SPECS[type], rng = makeRng(opts.seed ?? 1);
  const color = new THREE.Color(sp.color ?? opts.color ?? rng.pick(CAR_COLORS)), lamps = new Float32Array(12 * 3), paint = { value: color };
  // solid white and fleet colours, a little flake in black, full metallic for the rest; every car carries its own road film
  const hsl = color.getHSL({}), flake = { value: sp.color != null || (hsl.l > 0.45 && hsl.s < 0.25) ? 0 : hsl.l < 0.02 ? 0.4 : 0.8 }, grime = { value: 0.12 + 0.5 * rng() };
  const group = new THREE.Group(), body = new THREE.Group(); group.name = type; group.add(body);
  const mat = carMat({ physical: lod < 2, lamps, paint, map: decalSheet().tex, flake, grime });
  const mesh = new THREE.Mesh(G.geo.surf, mat); mesh.castShadow = mesh.receiveShadow = true; body.add(mesh);
  if (G.geo.glass) { const g = new THREE.Mesh(G.geo.glass, _carGlass ||= makeGlassMat({ opacity: 0.74, color: 0x05080a })); g.renderOrder = 5; body.add(g); }
  const wheels = [], steer = [];
  if (G.wheelGeo) G.wpos.forEach((p, i) => {
    const w = new THREE.Mesh(G.wheelGeo[i], mat); w.castShadow = true;
    if (i < 2) { const s = new THREE.Group(); s.position.fromArray(p); s.add(w); group.add(s); steer.push(s); } else { w.position.fromArray(p); group.add(w); }
    wheels.push(w);
  });
  if (lod < 2) body.add(makeGlow(lamps, G.glow));
  const st = { head: 0, brake: false, l: false, r: false, haz: false, em: false }, set = (i, c, k) => { lamps[i * 3] = c[0] * k; lamps[i * 3 + 1] = c[1] * k; lamps[i * 3 + 2] = c[2] * k; };
  // lamp channels: 1 head, 2 tail / brake, 3 4 indicators, 5 reverse, 6 7 8 emergency bar, 9 daytime running strip
  const steady = () => { set(1, E_WHT, st.head === 2 ? 6.5 : st.head ? 4 : 0); set(2, E_RED, (st.head ? 1.2 : 0) + (st.brake ? 5.5 : 0)); set(9, E_COOL, st.head ? 3.2 : 1.8); };
  const lights = {
    state: st, strobe: new THREE.Color(0, 0, 0),
    setHead(m) { st.head = m | 0; steady(); }, setBrake(on) { st.brake = !!on; steady(); }, setIndicators(l, r) { st.l = !!l; st.r = !!r; }, setHazard(on) { st.haz = !!on; }, setReverse(on) { set(5, E_WHT, on ? 4.5 : 0); },
    setEmergency(on) { st.em = !!on && !!G.bar; },
    update(dt, t) {
      const b = (t * 1.5) % 1 < 0.5 ? 5.5 : 0; set(3, E_AMB, st.l || st.haz ? b : 0); set(4, E_AMB, st.r || st.haz ? b : 0);
      if (G.bar) {
        const a = st.em ? burst(t, 0.7, 0, 3) : 0, c = st.em ? burst(t, 0.7, 0.5, 3) : 0, w = st.em ? burst(t, 0.35, 0.25, 2) : 0, cb = G.bar === 'police' ? E_BLUE : E_RED;
        set(6, E_RED, a * 7); set(7, cb, c * 7); set(8, E_WHT, w * 6); lights.strobe.setRGB((a * E_RED[0] + c * cb[0] + w * 0.5) * 0.5, (c * cb[1] + w * 0.5) * 0.5, (c * cb[2] + w * 0.5) * 0.5);
      }
    },
  };
  steady();
  const out = { group, body, wheels, steer, dims: G.dims, lights, type, lod, tris: G.tris, color };
  if (lod === 2) { out.geometry = G.geo.surf; out.material = _farMat ||= makeSurfMat({ map: decalSheet().tex, inst: true, grime: { value: 0.4 } }); }
  return out;
}

// ---------------------------------------------------------------------------------------------- dev harness
// dev.html?m=vehicles-cars [&t=sedan,suv,...] [&lod=1] [&head=1] [&brake=1] [&haz=1] [&c=0x7d1216]: a row of cars at
// the given lod and, behind it, the same types as the game parks them (lod 2, instanced, creased normals).
export async function devDemo(ctx) {
  const { scene, camera, controls, params } = ctx, lod = +(params.get('lod') ?? 1), types = (params.get('t') || 'sedan,hatch,suv,pickup,van,wagon').split(',');
  const gm = patchWet(new THREE.MeshStandardMaterial({ color: 0x3d3d40, roughness: 0.88 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const cars = [], info = { cars, stats: {} }; window.__cars = info;
  const cols = [0xa9acb0, 0x7d1216, 0xdcdcd8, 0x1b3562, 0xdcdcd8, 0x5d6064, 0x0b0b0d, 0x34618f, 0x26292d, 0xb5a67f];
  types.forEach((ty, i) => {
    const c = buildCar(ty, { lod, seed: i * 7 + 3, color: params.get('c') ? +params.get('c') : cols[i % cols.length] }); c.group.position.set(i * 3.4 - (types.length - 1) * 1.7, 0, 0); scene.add(c.group); cars.push(c);
    c.lights.setHead(+(params.get('head') || 0)); c.lights.setBrake(!!params.get('brake')); c.lights.setHazard(!!params.get('haz')); c.lights.setEmergency(true);
    let calls = 0, tris = 0; c.group.traverse(m => { if (m.isMesh) { calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.geometry.instanceCount || 1); } }); info.stats[ty + lod] = calls + '/' + Math.round(tris);
  });
  if (params.get('far') !== '0') {
    const { toCreasedNormals } = await import('three/addons/utils/BufferGeometryUtils.js'), m4 = new THREE.Matrix4(), rng = makeRng(9);
    types.forEach((ty, k) => {
      const c = buildCar(ty, { lod: 2, color: 0xffffff, seed: 3 }), im = new THREE.InstancedMesh(toCreasedNormals(c.geometry.clone(), 0.75), c.material, 3); info.stats[ty + 2] = '1/' + c.geometry.index.count / 3;
      for (let i = 0; i < 3; i++) { im.setMatrixAt(i, m4.makeRotationY(i === 1 ? Math.PI : 0).setPosition(k * 3.4 - (types.length - 1) * 1.7, 0, -9 - i * 6.5)); im.setColorAt(i, new THREE.Color(rng.pick(CAR_COLORS))); }
      im.castShadow = im.receiveShadow = true; scene.add(im);
    });
  }
  camera.position.set(-6, 2.4, 8); controls.target.set(0, 0.7, 0); controls.update();
  return (dt, t) => { for (const c of cars) c.lights.update(dt, t); };
}
