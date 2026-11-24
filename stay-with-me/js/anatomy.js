// What is under the skin. An analytic model of the internal anatomy, defined in the same reference frame as human.js
// (1.75 m adult male; +X patient's left, +Y up, +Z anterior) and mapped onto each patient through the bone matrices, so
// soft-tissue thickness comes from that patient's skin and fat while the skeleton and organs scale with the frame.
//
//   sample(p)   tissue at a root-frame point         trace(o, d, len)  contiguous tissue segments along a tool path
//   surface(p)  what a palpating finger feels        group             organ / skeleton meshes of the same shapes
//
// Layering at any point: skin (by depth under the skin SDF) -> subcutaneous fat (outside the lean-body SDF) -> then the
// region's own sampler (trunk, neck, arm, leg, head), which checks bones, vessels and organs in priority order and falls
// back to a named muscle.
//
// Tuning: thoracic wall constants (RIBT, PLT ...), organ shapes in the HEART / ABDOMEN blocks, vessel paths in VESSELS.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REF, ribY, ribEnd, ribCCJ, cageU, cagePoint, cageSdf, patchOpenings } from './human.js';
import { meshSDF, sdEllipsoid, sdRoundCone, sdCapsule, sdRoundBox, smin, sweepTube, sdfNormal, sdfRaycast } from './sdf.js';
import { clamp, lerp, smooth, noise3 } from './util.js';
import { U, G as GFX } from './gfx.js';

export const T = { AIR: 0, SKIN: 1, FAT: 2, MUSCLE: 3, BONE: 4, CARTILAGE: 5, PLEURA: 6, PLEURAL_SPACE: 7, LUNG: 8, PERICARDIUM: 9, PERICARDIAL_SPACE: 10, MYOCARDIUM: 11, HEART_CHAMBER: 12, ARTERY: 13, VEIN: 14, NERVE: 15, AIRWAY_LUMEN: 16, AIRWAY_WALL: 17, MEMBRANE: 18, GLAND: 19, OESOPHAGUS: 20, DIAPHRAGM: 21, LIVER: 22, SPLEEN: 23, STOMACH: 24, BOWEL: 25, KIDNEY: 26, BLADDER: 27, PERITONEAL: 28, MARROW: 29, MEDIASTINUM: 30, BRAIN: 31, CSF: 32, FASCIA: 33, TENDON: 34, FLUID: 35 };

const RIBT = 0.0078;      // thickness of the rib / intercostal layer (cage surface inwards)
const PLT = 0.0009;       // parietal pleura
const RIBH = 0.0065;      // half height of a rib
const DIAT = 0.0035;      // diaphragm thickness
const L = REF.larynx;

// ---------------------------------------------------------------- shared shapes (reference frame)

const cap = (x, y, z, a, b, r) => sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r);
const cone = (x, y, z, a, r1, b, r2) => sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r1, r2);
// distance to a polyline of [x,y,z(,r)] points; returns distance minus radius (radius interpolated when given per point)
function tube(x, y, z, pts, r) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const d = a.length > 3 ? sdRoundCone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3]) : sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r); if (d < best) best = d; }
  return best;
}

// lowest rib edge at each cage azimuth: below this the wall is abdominal
const MARGIN = new Float32Array(101);
for (let i = 0; i <= 100; i++) { const u = i / 100; let m = 9; for (let k = 1; k <= 12; k++) if (u <= ribEnd(k)) m = Math.min(m, ribY(k, u)); MARGIN[i] = m - RIBH; }
const marginY = u => { const f = clamp(u) * 100, i = Math.min(99, Math.floor(f)); return lerp(MARGIN[i], MARGIN[i + 1], f - i); };
const sternW = y => y > REF.angleY ? lerp(0.021, 0.03, clamp((y - REF.angleY) / (REF.notchY - REF.angleY))) : y > REF.xiphiY ? 0.019 : lerp(0.006, 0.012, clamp((y - REF.xiphoidTipY) / (REF.xiphiY - REF.xiphoidTipY)));

// vertebral column
const VERT = [];
{ let y = REF.T1top + 7 * 0.0165; for (let i = 1; i <= 7; i++) { VERT.push({ name: 'cervical vertebra', id: 'C' + i, y1: y, y0: y - 0.0165 }); y -= 0.0165; }
  for (let k = 1; k <= 12; k++) { const p = 0.019 + (k - 1) * 0.009 / 11; VERT.push({ name: 'thoracic vertebra', id: 'T' + k, y1: y, y0: y - p }); y -= p; }
  for (let k = 1; k <= 5; k++) { VERT.push({ name: 'lumbar vertebra', id: 'L' + k, y1: y, y0: y - 0.035 }); y -= 0.035; } }
const SPINE_Z = [[1.62, 0.0], [1.5, 0.0], [1.47, -0.013], [1.435, -0.032], [1.34, -0.058], [1.25, -0.057], [1.2, -0.05], [1.115, -0.04], [1.04, -0.046], [0.99, -0.07]];
function spineZ(y) { if (y >= SPINE_Z[0][0]) return SPINE_Z[0][1]; for (let i = 1; i < SPINE_Z.length; i++) if (y >= SPINE_Z[i][0]) { const a = SPINE_Z[i - 1], b = SPINE_Z[i]; return lerp(b[1], a[1], (y - b[0]) / (a[0] - b[0])); } return SPINE_Z[SPINE_Z.length - 1][1]; }
const spineR = y => y > 1.48 ? 0.0085 : y > 1.2 ? lerp(0.016, 0.011, (y - 1.2) / 0.28) : 0.019;
function vertebraAt(y) { for (const v of VERT) if (y <= v.y1 && y > v.y0) return v; return null; }

// diaphragm: height of the dome over (x, z); inflate lowers it
const DIA_RIM = [[0, 1.2], [0.3, 1.185], [0.5, 1.165], [0.66, 1.16], [0.8, 1.19], [0.93, 1.226], [1, 1.232]];
function diaRim(u) { for (let i = 1; i < DIA_RIM.length; i++) if (u <= DIA_RIM[i][0]) { const a = DIA_RIM[i - 1], b = DIA_RIM[i]; return lerp(a[1], b[1], smooth(a[0], b[0], u)); } return 1.232; }
function diaY(x, z, inflate) {
  const c = REF.cage, rho2 = (x / (c.r[0] - 0.006)) ** 2 + ((z - c.c[2]) / (c.r[2] - 0.005)) ** 2, u = cageU(x, z), rim = diaRim(u);
  const dr = x + 0.066, dl = x - 0.072, drop = 0.013 * inflate;
  const peak = 1.283 - drop * 0.5 + (1.293 - 1.283 - drop * 0.5) * Math.exp(-dr * dr / 0.0026) + (1.2835 - 1.283 - drop * 0.5) * Math.exp(-dl * dl / 0.0021);
  return rim + (peak - rim) * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, rho2), 1.3)), 0.6);
}

// ---- heart (reference frame). Outer surface = ventricles + atria + great-vessel roots; cavities inside.
const H = {
  lvA: [0.02, 1.344, 0.036], lvB: [0.076, 1.2865, 0.06], lvR: [0.033, 0.016],
  rvA: [-0.002, 1.331, 0.061], rvB: [0.06, 1.2895, 0.071], rvR: [0.032, 0.0195],
  ra: [-0.035, 1.366, 0.044, 0.024, 0.032, 0.026], la: [0.012, 1.379, 0.013, 0.03, 0.024, 0.02],
  centre: [0.022, 1.33, 0.05], apex: [0.085, 1.277, 0.068],
};
const lvOut = (x, y, z) => cone(x, y, z, H.lvA, H.lvR[0], H.lvB, H.lvR[1]);
const rvOut = (x, y, z) => cone(x, y, z, H.rvA, H.rvR[0], H.rvB, H.rvR[1]);
const raOut = (x, y, z) => sdEllipsoid(x - H.ra[0], y - H.ra[1], z - H.ra[2], H.ra[3], H.ra[4], H.ra[5]);
const laOut = (x, y, z) => sdEllipsoid(x - H.la[0], y - H.la[1], z - H.la[2], H.la[3], H.la[4], H.la[5]);
// great vessels as [x, y, z, r] polylines
const VES = {
  ascAorta: [[0.004, 1.364, 0.04, 0.0155], [-0.008, 1.402, 0.038, 0.015], [-0.006, 1.424, 0.03, 0.0145]],
  arch: [[-0.006, 1.424, 0.03, 0.0145], [0.008, 1.434, 0.012, 0.014], [0.022, 1.427, -0.008, 0.0135], [0.027, 1.405, -0.02, 0.013]],
  descAorta: [[0.027, 1.405, -0.02, 0.013], [0.026, 1.33, -0.03, 0.0125], [0.02, 1.25, -0.03, 0.012], [0.014, 1.205, -0.024, 0.0115]],
  abdAorta: [[0.014, 1.205, -0.024, 0.0115], [0.012, 1.14, -0.016, 0.0105], [0.008, 1.075, -0.014, 0.009]],
  pulmTrunk: [[0.014, 1.366, 0.058, 0.0145], [0.026, 1.392, 0.046, 0.014], [0.03, 1.405, 0.028, 0.013]],
  svc: [[-0.03, 1.44, 0.032, 0.011], [-0.032, 1.39, 0.036, 0.0115]],
  ivc: [[-0.03, 1.346, 0.028, 0.012], [-0.028, 1.27, 0.012, 0.012], [-0.024, 1.2, -0.006, 0.012], [-0.02, 1.08, -0.01, 0.011]],
  brachioL: [[0.036, 1.456, 0.042, 0.007], [0.0, 1.448, 0.045, 0.0075], [-0.029, 1.44, 0.034, 0.008]],
  brachioR: [[-0.036, 1.46, 0.04, 0.007], [-0.03, 1.44, 0.033, 0.008]],
  brachioTrunk: [[-0.004, 1.432, 0.02, 0.0065], [-0.02, 1.462, 0.024, 0.006]],
  carotidLroot: [[0.012, 1.434, 0.01, 0.0045], [0.021, 1.468, 0.02, 0.004]],
  subclavLroot: [[0.022, 1.43, -0.004, 0.005], [0.03, 1.462, 0.022, 0.0048]],
};
// vessels that run symmetrical (x >= 0 given; mirrored)
const SYM = {
  subclavA: [[0.03, 1.462, 0.022, 0.0046], [0.062, 1.47, 0.03, 0.0045], [0.1, 1.458, 0.028, 0.0045], [0.145, 1.425, 0.005, 0.0042]],
  subclavV: [[0.034, 1.455, 0.042, 0.006], [0.066, 1.458, 0.045, 0.006], [0.104, 1.449, 0.04, 0.006], [0.145, 1.416, 0.012, 0.0055]],
  iliacA: [[0.006, 1.075, -0.014, 0.0065], [0.045, 0.985, 0.0, 0.006], [0.066, 0.925, 0.068, 0.0052]],
  iliacV: [[-0.006, 1.07, -0.016, 0.007], [0.036, 0.98, -0.006, 0.0065], [0.054, 0.925, 0.065, 0.0058]],
  femA: [[0.066, 0.925, 0.068, 0.0048], [0.064, 0.86, 0.056, 0.0045], [0.058, 0.76, 0.03, 0.004], [0.052, 0.64, 0.004, 0.0038]],
  femV: [[0.054, 0.925, 0.065, 0.0055], [0.053, 0.86, 0.052, 0.0052], [0.05, 0.76, 0.024, 0.0046], [0.048, 0.64, -0.002, 0.0042]],
  femN: [[0.079, 0.93, 0.068, 0.003], [0.08, 0.87, 0.056, 0.0028], [0.08, 0.8, 0.04, 0.002]],
  phrenic: [[0.03, 1.47, 0.03, 0.0013], [0.045, 1.43, 0.03, 0.0013]],
};
const TRACHEA = [[0, 1.44, 0.026], [0, 1.41, 0.012], [0, 1.376, -0.002]], CARINA = [0, 1.376, -0.002], BRONCH_R = [-0.036, 1.356, -0.006], BRONCH_L = [0.042, 1.35, -0.01];
const HILUM = { L: [0.045, 1.36, 0.0], R: [-0.04, 1.36, 0.0] };
const AO_ROOT = VES.ascAorta.slice(0, 2), PT_ROOT = VES.pulmTrunk.slice(0, 2);

// abdominal organs
const liverSdf = (x, y, z) => smin(sdEllipsoid(x + 0.058, y - 1.23, z - 0.018, 0.085, 0.062, 0.078), sdEllipsoid(x + 0.026, y - 1.238, z - 0.046, 0.046, 0.03, 0.038), 0.02);
const stomachSdf = (x, y, z) => smin(sdEllipsoid(x - 0.06, y - 1.225, z - 0.02, 0.04, 0.05, 0.04), cap(x, y, z, [0.05, 1.19, 0.045], [0.0, 1.17, 0.045], 0.02), 0.02);
const spleenSdf = (x, y, z) => sdEllipsoid(x - 0.104, y - 1.232, z + 0.046, 0.022, 0.055, 0.034);
const kidneySdf = (x, y, z) => sdEllipsoid(Math.abs(x) - 0.058, y - (x > 0 ? 1.146 : 1.132), z + 0.052, 0.027, 0.055, 0.021);
const bladderSdf = (x, y, z) => sdEllipsoid(x, y - 0.925, z - 0.032, 0.036, 0.03, 0.03);
const gallSdf = (x, y, z) => sdEllipsoid(x + 0.05, y - 1.182, z - 0.062, 0.012, 0.02, 0.012);
const pancreasSdf = (x, y, z) => cap(x, y, z, [-0.03, 1.158, -0.01], [0.075, 1.185, -0.02], 0.011);
const COLON = { asc: [[-0.102, 1.0, 0.012, 0.027], [-0.102, 1.13, 0.012, 0.024]], trans: [[-0.102, 1.13, 0.012, 0.024], [-0.04, 1.11, 0.066, 0.022], [0.04, 1.11, 0.066, 0.022], [0.104, 1.145, 0.0, 0.02]], desc: [[0.104, 1.145, 0.0, 0.02], [0.102, 1.0, 0.0, 0.018]], sig: [[0.102, 1.0, 0.0, 0.018], [0.05, 0.955, 0.0, 0.018], [0.0, 0.94, -0.045, 0.018]] };
const PELVIS = {
  ilium: (x, y, z) => Math.max(Math.abs(sdEllipsoid(Math.abs(x) - 0.012, y - 0.985, z + 0.02, 0.118, 0.085, 0.085) ) - 0.005, 0.94 - y, y - 1.062, 0.045 - Math.abs(x) - (z < -0.05 ? 0.03 : 0), z - 0.07),
  pubis: (x, y, z) => cap(Math.abs(x), y, z, [0.006, 0.905, 0.058], [0.086, 0.938, 0.012], 0.0095),
  ischium: (x, y, z) => cap(Math.abs(x), y, z, [0.086, 0.935, 0.0], [0.058, 0.862, -0.03], 0.012),
  sacrum: (x, y, z) => sdEllipsoid(x, y - 0.985, z + 0.076, 0.05, 0.06, 0.02),
};

// ---------------------------------------------------------------- the anatomy of one patient

export async function buildAnatomy(human, opts = {}) {
  const D = human.dims, rig = human.rig, model = rig.model, Ai = rig.Ainv, A = rig.A;
  const state = { pneumoL: 0, pneumoR: 0, hemoL: 0, hemoR: 0, tamponade: 0, heartRate: 72, heartStrength: 1, fibrillating: false, lungInflate: 0, liverBleed: 0, pericardiumOpen: 0 };
  const vs = D.visc / D.sz, kid = D.age < 16;
  const tsk = { trunk: D.skinT, back: D.skinT * 1.4, neck: D.skinT * 0.75, arm: D.skinT * 0.75, hand: D.skinT * 0.7, leg: D.skinT, head: D.skinT, foot: D.skinT };
  const abdC = [0, 1.09, 0.016 + vs * 0.5], abdR = [0.121 + vs * 0.35, 0.199, 0.083 + vs * 0.55];
  const abdSdf = (x, y, z) => sdEllipsoid(x - abdC[0], y - abdC[1], z - abdC[2], abdR[0], abdR[1], abdR[2]);

  // front of the lean neck in the midline (reference z by y): the larynx hangs a fixed distance behind it
  const NECK_Y0 = 1.425, NECK_N = 26, neckFront = new Float32Array(NECK_N);
  const neckBent = Math.abs(rig.bones.neck.rotation.x) + Math.abs(rig.bones.head.rotation.x) > 0.3;
  { const lean = (x, y, z) => model.eval(x, y, z, 0, 0, neckBent ? 2 : 3), o = [0, 0, 0], d = [0, 0, 0], e = A.neck.elements, ei = Ai.neck.elements;
    for (let i = 0; i < NECK_N; i++) { const y = NECK_Y0 + i * 0.005;
      o[0] = e[4] * y + e[8] * 0.3 + e[12]; o[1] = e[5] * y + e[9] * 0.3 + e[13]; o[2] = e[6] * y + e[10] * 0.3 + e[14]; d[0] = -e[8]; d[1] = -e[9]; d[2] = -e[10]; const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
      const t = sdfRaycast(lean, o[0], o[1], o[2], d[0], d[1], d[2], 0.6, 5e-5), px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
      neckFront[i] = t < 0 ? 0.04 : ei[2] * px + ei[6] * py + ei[10] * pz + ei[14]; } }
  const RLUM = 0.0085;
  // airway centre line z at height y: larynx and cervical trachea follow the neck, the thoracic trachea dives to the carina
  const airZneck = y => { const f = clamp((y - NECK_Y0) / 0.005, 0, NECK_N - 1.001), i = Math.floor(f); return lerp(neckFront[i], neckFront[i + 1], f - i) - 0.005 - 0.0013 - RLUM; };
  const zTop = airZneck(1.45);
  const airZ = y => y >= 1.45 ? airZneck(y) : lerp(CARINA[2], zTop, clamp((y - CARINA[1]) / (1.45 - CARINA[1])));

  // result registers (sample writes these; no allocation in the marching loop)
  let rT = 0, rN = 'air', rS = '';
  const set = (t, n, s = '') => { rT = t; rN = n; rS = s; return true; };
  const loc = {};

  // ---- heart and pericardium
  const heartOut = (x, y, z) => Math.min(smin(smin(lvOut(x, y, z), rvOut(x, y, z), 0.012), Math.min(raOut(x, y, z), laOut(x, y, z)), 0.008), tube(x, y, z, AO_ROOT), tube(x, y, z, PT_ROOT));
  function sampleHeart(x, y, z) {
    const dx = x - H.centre[0], dy = y - H.centre[1], dz = z - H.centre[2]; if (dx * dx + dy * dy + dz * dz > 0.0115) return false;
    const gap = state.tamponade > 0 ? 0.0012 + 0.013 * state.tamponade : 0, h = heartOut(x, y, z);
    if (h > gap + 0.0015) return false;
    if (h > gap) return set(T.PERICARDIUM, 'pericardium');
    if (h > 0) return set(T.PERICARDIAL_SPACE, 'pericardial space');
    // coronaries on the surface
    if (h > -0.004) { if (tube(x, y, z, COR.lad, 0.0019) < 0) return set(T.ARTERY, 'left anterior descending artery'); if (tube(x, y, z, COR.rca, 0.0019) < 0) return set(T.ARTERY, 'right coronary artery'); }
    const lv = lvOut(x, y, z), rv = rvOut(x, y, z), ra = raOut(x, y, z), la = laOut(x, y, z);
    if (tube(x, y, z, VES.ascAorta) < 0 && lv > -0.004) return set(T.ARTERY, tube(x, y, z, VES.ascAorta) < -0.002 ? 'ascending aorta' : 'ascending aorta wall');
    if (tube(x, y, z, VES.pulmTrunk) < 0 && rv > -0.002) return set(T.ARTERY, 'pulmonary trunk');
    if (lv < 0) return lv < -0.011 ? set(T.HEART_CHAMBER, 'left ventricle', 'L') : set(T.MYOCARDIUM, rv < 0 ? 'interventricular septum' : 'left ventricle myocardium', 'L');
    if (rv < 0) return rv < -0.0045 ? set(T.HEART_CHAMBER, 'right ventricle', 'R') : set(T.MYOCARDIUM, 'right ventricle myocardium', 'R');
    if (ra < 0) return ra < -0.0025 ? set(T.HEART_CHAMBER, 'right atrium', 'R') : set(T.MYOCARDIUM, 'right atrium wall', 'R');
    if (la < 0) return la < -0.0025 ? set(T.HEART_CHAMBER, 'left atrium', 'L') : set(T.MYOCARDIUM, 'left atrium wall', 'L');
    return set(T.MYOCARDIUM, 'myocardium');
  }
  // coronary arteries and phrenic nerves are laid on the heart / pericardium surface by projection
  const projectTo = (fn, p, dir, off) => { let t = 0; for (let i = 0; i < 60; i++) { const v = fn(p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t) - off; if (v < 1e-4) break; t += v; if (t > 0.25) return [p[0] + dir[0] * 0.08, p[1] + dir[1] * 0.08, p[2] + dir[2] * 0.08]; } return [p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t]; };
  const COR = { lad: [], rca: [] };
  { const nA = [-0.24, 0.22, 0.945];
    for (let i = 0; i <= 8; i++) { const t = i / 8, g = [lerp(0.03, 0.078, t) + nA[0] * 0.06, lerp(1.37, 1.292, t) + nA[1] * 0.06, lerp(0.05, 0.064, t) + nA[2] * 0.06]; COR.lad.push(projectTo(heartOut, g, [-nA[0], -nA[1], -nA[2]], -0.0006)); }
    for (let i = 0; i <= 7; i++) { const t = i / 7, a = -0.5 + t * 2.2, g = [-0.014 - 0.016 * Math.sin(a) - 0.05, 1.352 - 0.03 * t - 0.026 * Math.sin(a), 0.05 + 0.03 * Math.cos(a) + 0.03]; COR.rca.push(projectTo(heartOut, g, [0.82, 0.0, -0.57], -0.0006)); } }
  const PHREN = { L: [], R: [] };
  for (const [sd, pts] of [['L', [[0.1, 1.43, 0.03], [0.14, 1.38, 0.05], [0.16, 1.33, 0.06], [0.16, 1.29, 0.065]]], ['R', [[-0.1, 1.43, 0.035], [-0.13, 1.39, 0.045], [-0.14, 1.34, 0.045], [-0.13, 1.3, 0.04]]]]) for (const g of pts) PHREN[sd].push(projectTo(heartOut, g, [sd === 'L' ? -1 : 1, 0, 0], 0.0022));

  // ---- thorax: everything inside the parietal pleura
  function mediastinum(x, y, z) {
    let d = heartOut(x, y, z) - 0.005 - (state.tamponade > 0 ? 0.013 * state.tamponade : 0);
    d = Math.min(d, sdRoundBox(x - 0.002, y - 1.415, z - 0.014, 0.027, 0.055, 0.05, 0.02));              // superior mediastinum
    d = Math.min(d, cap(x, y, z, [0.012, 1.47, -0.03], [0.012, 1.2, -0.042], 0.03));                      // spine, aorta, oesophagus
    d = Math.min(d, sdRoundBox(x, y - 1.33, z - 0.085, 0.012, 0.07, 0.02, 0.008));                         // retrosternal fat
    d = Math.min(d, sdEllipsoid(x - 0.028, y - 1.3, z - 0.088, 0.046, 0.06, 0.034));                       // cardiac notch
    return d;
  }
  function lobe(side, y, z) {
    const yf = 1.41 - 0.8125 * (z + 0.07);
    if (side === 'L') return y > yf ? 'left lung upper lobe' : 'left lung lower lobe';
    return y <= yf ? 'right lung lower lobe' : y > 1.335 ? 'right lung upper lobe' : 'right lung middle lobe';
  }
  // inside the lung (>0 = metres inside) for a possibly collapsed lung
  function lungIn(x, y, z, side) {
    const pn = side === 'L' ? state.pneumoL : state.pneumoR, hm = side === 'L' ? state.hemoL : state.hemoR, hl = HILUM[side], s = 1 - 0.62 * clamp(Math.max(pn, hm * 0.5));
    const qx = hl[0] + (x - hl[0]) / s, qy = hl[1] + (y - hl[1]) / s, qz = hl[2] + (z - hl[2]) / s;
    const pc = -(cageSdf(qx, qy, qz) + RIBT + PLT), md = mediastinum(qx, qy, qz), dy = qy - diaY(qx, qz, state.lungInflate) - DIAT;
    lobeQ[0] = qy; lobeQ[1] = qz;
    return Math.min(pc, md, dy) * s - 0.0005;
  }
  const lobeQ = [0, 0];
  function sampleThorax(x, y, z) {
    if (sampleHeart(x, y, z)) return true;
    // great vessels
    if (y > 1.19) {
      if (z < 0.05 && x > -0.01) { if (tube(x, y, z, VES.arch) < 0) return set(T.ARTERY, 'aortic arch'); if (tube(x, y, z, VES.descAorta) < 0) return set(T.ARTERY, 'descending aorta'); }
      if (y > 1.36) {
        if (tube(x, y, z, VES.ascAorta) < 0) return set(T.ARTERY, 'ascending aorta');
        if (tube(x, y, z, VES.pulmTrunk) < 0) return set(T.ARTERY, 'pulmonary trunk');
        if (tube(x, y, z, VES.svc) < 0) return set(T.VEIN, 'superior vena cava');
        if (y > 1.42) {
          if (tube(x, y, z, VES.brachioL) < 0 || tube(x, y, z, VES.brachioR) < 0) return set(T.VEIN, 'brachiocephalic vein', x > 0 ? 'L' : 'R');
          if (tube(x, y, z, VES.brachioTrunk) < 0) return set(T.ARTERY, 'brachiocephalic trunk');
          if (tube(x, y, z, VES.carotidLroot) < 0) return set(T.ARTERY, 'common carotid artery', 'L');
          if (tube(x, y, z, VES.subclavLroot) < 0) return set(T.ARTERY, 'subclavian artery', 'L');
        }
      }
      if (x < 0 && tube(x, y, z, VES.ivc) < 0) return set(T.VEIN, 'inferior vena cava');
      // airway and oesophagus
      if (y > CARINA[1] - 0.03) {
        const az = airZ(y);
        if (y >= CARINA[1]) { const r = Math.hypot(x, z - az); if (r < RLUM + 0.0022) return airwayRing(x, y, z - az, r); }
        else { for (const [b, nm, sd] of [[BRONCH_R, 'right main bronchus', 'R'], [BRONCH_L, 'left main bronchus', 'L']]) { const d = cap(x, y, z, CARINA, b, 0.0075); if (d < 0) return d < -0.0015 ? set(T.AIRWAY_LUMEN, 'airway lumen (' + nm + ')', sd) : set(T.AIRWAY_WALL, nm, sd); } }
      }
      const oz = Math.min(airZ(Math.max(y, 1.3)) - RLUM - 0.0105, spineZ(y) + spineR(y) + 0.009);
      if (Math.hypot(x - 0.004, z - oz) < 0.0075) return set(T.OESOPHAGUS, 'oesophagus');
      for (const sd of ['L', 'R']) if (tube(x, y, z, PHREN[sd], 0.0013) < 0) return set(T.NERVE, 'phrenic nerve', sd);
    }
    const md = mediastinum(x, y, z);
    if (md < 0) return set(T.MEDIASTINUM, 'mediastinal fat');
    const side = x > 0.012 ? 'L' : 'R';
    if (lungIn(x, y, z, side) > 0) return set(T.LUNG, lobe(side, lobeQ[0], lobeQ[1]), side);
    const hm = side === 'L' ? state.hemoL : state.hemoR;
    return set(T.PLEURAL_SPACE, hm > 0.05 ? 'pleural space (blood)' : 'pleural space', side);
  }
  // rings, ligaments and lumen of the trachea at radius r from its axis (zr = z relative to the axis)
  function airwayRing(x, y, zr, r) {
    if (r < RLUM) return set(T.AIRWAY_LUMEN, 'airway lumen');
    const k = (L.ringY0 - y) / L.ringPitch, f = k - Math.floor(k);
    if (zr < -RLUM * 0.55) return set(T.AIRWAY_WALL, 'trachea (posterior wall)');
    return f < 0.68 ? set(T.CARTILAGE, 'tracheal ring') : set(T.AIRWAY_WALL, 'trachea');
  }

  // ---- neck: larynx, trachea, thyroid, carotid sheaths (reference coordinates; called for y in the neck range)
  function sampleNeck(x, y, z, depth, lean, noMuscle) {
    const az = airZ(y), zr = z - az, r = Math.hypot(x, zr), ax = Math.abs(x), phi = Math.atan2(ax, zr), side = x > 0 ? 'L' : 'R';
    if (y < L.hyoidY + 0.007 && r < 0.03) {
      if (y >= L.cricY0 - 0.0005 || y < L.ringY0 + 0.002) {
        if (y > L.ctmY1) {                       // thyroid cartilage level
          if (y > 1.512) { if (y > L.hyoidY - 0.005 && phi < 1.9 && Math.abs(r - 0.0135) < 0.0026) return set(T.BONE, 'hyoid bone'); if (r < 0.0075) return set(T.AIRWAY_LUMEN, 'airway lumen'); if (r < 0.0105) return set(T.MEMBRANE, y < L.hyoidY - 0.005 ? 'thyrohyoid membrane' : 'laryngeal mucosa'); }
          else {
            const r1 = 0.0098 + 0.003 * Math.exp(-(((y - L.promY) / 0.0075) ** 2)) * Math.exp(-((phi / 0.55) ** 2));
            if (phi < 2.1 && r >= r1 && r < r1 + 0.0032) return set(T.CARTILAGE, 'thyroid cartilage');
            if (phi >= 2.1 && r >= 0.01 && r < 0.0135 && y < 1.489) return set(T.CARTILAGE, 'cricoid cartilage');
            if (r < r1) {
              if (y > 1.4895 && y < 1.4945 && ax > 0.0012) return set(T.MEMBRANE, 'vocal cords', side);
              return r < 0.0078 ? set(T.AIRWAY_LUMEN, 'airway lumen') : set(T.MEMBRANE, 'laryngeal mucosa');
            }
          }
        } else if (y > L.ctmY0) {                // cricothyroid membrane level
          if (r < RLUM) return set(T.AIRWAY_LUMEN, 'airway lumen');
          if (phi < 1.3) { if (r < RLUM + 0.0013) return set(T.MEMBRANE, 'cricothyroid membrane'); }
          else if (phi < 1.95) { if (r < RLUM + 0.005) return set(T.MUSCLE, 'cricothyroid muscle', side); }
          else if (r < RLUM + 0.004) return set(T.CARTILAGE, 'cricoid cartilage');
        } else if (y > L.cricY0) {               // cricoid ring
          if (r < RLUM - 0.0003) return set(T.AIRWAY_LUMEN, 'airway lumen');
          if (r < RLUM + 0.0036) return set(T.CARTILAGE, 'cricoid cartilage');
        } else if (r < RLUM + 0.0022) return airwayRing(x, y, zr, r);
      } else {                                   // between cricoid and first ring: cricotracheal ligament
        if (r < RLUM) return set(T.AIRWAY_LUMEN, 'airway lumen'); if (r < RLUM + 0.0016) return set(T.AIRWAY_WALL, 'trachea');
      }
      // thyroid gland
      if (y < 1.4585 && y > 1.441 && phi < 0.9 && r < RLUM + 0.0065 && r >= RLUM + 0.0022) return set(T.GLAND, 'thyroid isthmus');
      if (sdEllipsoid(ax - 0.0185, y - 1.4625, zr + 0.001, 0.0085, 0.022, 0.011) < 0) return set(T.GLAND, 'thyroid lobe', side);
    }
    // carotid sheath: artery medial, internal jugular lateral and a little anterior
    if (y > 1.435 && y < 1.6) {
      const cx = lerp(0.021, 0.031, clamp((y - 1.44) / 0.09)), cz = az - 0.01;
      if (Math.hypot(ax - cx, z - cz) < 0.0036) return set(T.ARTERY, y > 1.522 ? 'internal carotid artery' : 'common carotid artery', side);
      if (Math.hypot(ax - cx - 0.0096, z - cz + 0.002) < 0.0058) return set(T.VEIN, 'internal jugular vein', side);
      if (Math.hypot(ax - cx - 0.004, z - cz + 0.006) < 0.0012) return set(T.NERVE, 'vagus nerve', side);
    }
    if (y > 1.44 && y < 1.48 && ax > 0.02) { if (tube(ax, y, z, SYM.subclavA) < 0) return set(T.ARTERY, 'subclavian artery', side); if (tube(ax, y, z, SYM.subclavV) < 0) return set(T.VEIN, 'subclavian vein', side); }
    // oesophagus and cervical spine
    const sz = Math.min(spineZ(y), az - 0.036), sr = spineR(y);
    if (Math.hypot(x - 0.003, z - (az - RLUM - 0.0095)) < 0.007) return set(T.OESOPHAGUS, 'oesophagus');
    if (sampleSpine(x, y, z, sz, sr)) return true;
    if (lean > 0 || noMuscle) return false;
    // muscles
    if (zr > 0 && ax < 0.0045 && r < 0.03) return set(T.FASCIA, 'pretracheal fascia');
    if (zr > 0 && ax < 0.021 && r < 0.03) return set(T.MUSCLE, 'sternohyoid (strap muscle)', side);
    if (z > sz - 0.005 && ax > 0.02 && depth < 0.022) return set(T.MUSCLE, 'sternocleidomastoid muscle', side);
    if (z < sz - 0.02) return set(T.MUSCLE, depth < 0.015 ? 'trapezius muscle' : 'splenius muscle', side);
    return set(T.MUSCLE, z > sz ? 'longus colli muscle' : 'scalene muscle', side);
  }
  function sampleSpine(x, y, z, sz, sr) {
    const dz = z - sz, ax = Math.abs(x);
    if (ax > 0.035 || dz > sr + 0.002 || dz < -sr - 0.05) return false;
    const v = vertebraAt(y); if (!v) return false;
    if ((x / (sr * 1.25)) ** 2 + (dz / sr) ** 2 < 1) return (v.y1 - y) < 0.0035 ? set(T.CARTILAGE, 'intervertebral disc') : set(T.BONE, v.name + ' ' + v.id);
    const cz = sz - sr - 0.0085, dc = Math.hypot(x, z - cz);
    if (dc < 0.0048) return set(T.NERVE, y > 1.165 ? 'spinal cord' : 'cauda equina');
    if (dc < 0.0082) return set(T.CSF, 'cerebrospinal fluid');
    if (dc < 0.0125 && (v.y1 - y) > 0.004) return set(T.BONE, v.name + ' ' + v.id + ' (arch)');
    if (ax < 0.005 && z < cz && z > cz - 0.036 && (v.y1 - y) > 0.005) return set(T.BONE, 'spinous process ' + v.id);
    if (ax < 0.03 && Math.abs(z - cz - 0.006) < 0.005 && (v.y1 - y) > 0.008 && (v.y1 - y) < 0.016) return set(T.BONE, 'transverse process ' + v.id);
    return false;
  }

  // ---- trunk
  const clavA = [0.022, 1.443, 0.0715], clavB = [0.1, 1.459, 0.09], clavC = [0.182, 1.457, 0.008];
  function clavicle(ax, y, z) { let best = 1e9, px = clavA[0], py = clavA[1], pz = clavA[2]; for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t, qx = u * u * clavA[0] + 2 * u * t * clavB[0] + t * t * clavC[0], qy = u * u * clavA[1] + 2 * u * t * clavB[1] + t * t * clavC[1], qz = u * u * clavA[2] + 2 * u * t * clavB[2] + t * t * clavC[2]; best = Math.min(best, sdCapsule(ax, y, z, px, py, pz, qx, qy, qz, 0.0076)); px = qx; py = qy; pz = qz; } return best; }
  function wallMuscle(x, y, z, c, u, depth, side) {
    const ax = Math.abs(x);
    if (y > 1.455) return set(T.MUSCLE, z < -0.01 ? 'trapezius muscle' : 'scalene muscle', side);
    if (u > 0.62) {
      if (y > 1.3) { if (ax < 0.02) return set(T.FASCIA, 'presternal fascia'); if (c < 0.006 && ax > 0.06 && ax < 0.13 && y < 1.36 && y > 1.31) return set(T.MUSCLE, 'pectoralis minor', side); return set(T.MUSCLE, 'pectoralis major', side); }
      return ax < 0.07 ? set(T.MUSCLE, 'rectus abdominis', side) : set(T.MUSCLE, 'external oblique muscle', side);
    }
    if (u > 0.36) return c < 0.009 || u > 0.5 ? set(T.MUSCLE, 'serratus anterior', side) : set(T.MUSCLE, 'latissimus dorsi muscle', side);
    if (ax < 0.065 && c > 0.004) return depth < 0.02 && y > 1.33 ? set(T.MUSCLE, 'trapezius muscle', side) : set(T.MUSCLE, 'erector spinae muscle', side);
    return y > 1.33 ? set(T.MUSCLE, depth < 0.016 ? 'trapezius muscle' : 'rhomboid muscle', side) : set(T.MUSCLE, 'latissimus dorsi muscle', side);
  }
  function sampleTrunk(x, y, z, depth, lean) {
    const ax = Math.abs(x), side = x > 0 ? 'L' : 'R';
    // neck structures continue into the top of the chest
    if (y > 1.435 && ax < 0.05 && z > spineZ(y) - 0.01) { if (sampleNeck(x, y, z, depth, lean, true)) return true; }
    else if (sampleSpine(x, y, z, spineZ(y), spineR(y))) return true;
    if (y > 1.42 && clavicle(ax, y, z) < 0) return lean > 0 ? false : set(T.BONE, 'clavicle', side);
    if (y > 1.39 && ax > 0.02) {
      if (tube(ax, y, z, SYM.subclavA) < 0) return set(T.ARTERY, 'subclavian artery', side);
      if (tube(ax, y, z, SYM.subclavV) < 0) return set(T.VEIN, 'subclavian vein', side);
    }
    if (lean > 0) return false;
    const c = cageSdf(x, y, z), u = cageU(x, z), inCage = y >= marginY(u) && y < 1.5;
    if (y < 1.07 || (c > 0 && y < 1.2 && !inCage)) { if (samplePelvisBones(x, y, z, side)) return true; }
    if (inCage || c <= -RIBT) {
      if (c > 0) {
        if (u < 0.42 && c > 0.009 && c < 0.016 && y > 1.275 && y < 1.43 && ax > 0.055 && ax < 0.15 - (1.43 - y) * 0.25) return set(T.BONE, 'scapula', side);
        return wallMuscle(x, y, z, c, u, depth, side);
      }
      if (c > -RIBT) {
        // sternum
        if (u > 0.85 && y < REF.notchY && y > REF.xiphoidTipY && ax < sternW(y)) return y > REF.angleY ? set(T.BONE, 'sternum (manubrium)') : y > REF.xiphiY ? set(T.BONE, 'sternum (body)') : set(T.CARTILAGE, 'xiphoid');
        let above = 0, yAbove = 9;
        for (let k = 1; k <= 12; k++) {
          if (u > ribEnd(k)) continue; const ry = ribY(k, u), dy = y - ry, hh = k === 1 ? 0.008 : RIBH;
          if (dy < hh && dy > -hh) return u > ribCCJ(k) && k <= 10 ? set(T.CARTILAGE, 'costal cartilage ' + k, side) : set(T.BONE, 'rib ' + k, side);
          if (dy < 0 && ry - hh < yAbove) { yAbove = ry - hh; above = k; }
        }
        if (above) {
          const below = yAbove - y;            // neurovascular bundle in the costal groove: vein, artery, nerve from the top
          if (below < 0.0052 && c < -0.0045 && u > 0.1) { const dc = c + 0.006; if (Math.hypot(below - 0.0011, dc) < 0.001) return set(T.VEIN, 'intercostal vein', side); if (Math.hypot(below - 0.0027, dc) < 0.00095) return set(T.ARTERY, 'intercostal artery', side); if (Math.hypot(below - 0.0042, dc) < 0.0009) return set(T.NERVE, 'intercostal nerve', side); }
          return c > -0.003 ? set(T.MUSCLE, 'external intercostal', side) : c > -0.0058 ? set(T.MUSCLE, 'internal intercostal', side) : set(T.MUSCLE, 'innermost intercostal', side);
        }
        return wallMuscle(x, y, z, c, u, depth, side);
      }
      // inside the rib cage
      const dia = diaY(x, z, state.lungInflate);
      if (y > dia + DIAT) {
        if (c > -RIBT - 0.0032 && u > 0.82 && y < 1.425 && y > 1.3) {   // internal mammary vessels behind the cartilages
          const xs = sternW(y) + 0.015; if (Math.hypot(ax - xs, c + RIBT + 0.0016) < 0.0015) return set(T.ARTERY, 'internal mammary artery', side); if (Math.hypot(ax - xs + 0.0042, c + RIBT + 0.0016) < 0.0015) return set(T.VEIN, 'internal mammary vein', side);
        }
        if (c > -RIBT - PLT) return mediastinum(x, y, z) < 0.002 ? set(T.FASCIA, 'endothoracic fascia') : set(T.PLEURA, 'parietal pleura', side);
        return sampleThorax(x, y, z);
      }
      if (y > dia) return set(T.DIAPHRAGM, 'diaphragm', side);
      if (c > -RIBT - DIAT && y > marginY(u)) return set(T.DIAPHRAGM, 'diaphragm', side);     // costal attachment lining the lower ribs
      return sampleAbdomen(x, y, z, side, Math.max(Math.min(-(c + RIBT + DIAT), dia - y), -abdSdf(x, y, z)));
    }
    // abdominal wall (the cavity never lies in front of the ribs: above the costal margin everything outside the cage is wall)
    const a = y > marginY(u) ? Math.max(abdSdf(x, y, z), 0.001) : abdSdf(x, y, z);
    if (a > 0) {
      if (y < 1.0 && samplePelvisBones(x, y, z, side)) return true;
      if (z < -0.02) return ax < 0.075 ? set(T.MUSCLE, z > spineZ(y) - 0.03 && ax > 0.022 ? 'psoas major muscle' : 'erector spinae muscle', side) : set(T.MUSCLE, 'quadratus lumborum muscle', side);
      if (y < 0.94) return set(T.MUSCLE, z < 0 ? 'gluteus maximus muscle' : 'iliopsoas muscle', side);
      if (ax < 0.006 && z > 0.05) return set(T.FASCIA, 'linea alba');
      if (ax < 0.068 && z > 0.04) return set(T.MUSCLE, 'rectus abdominis', side);
      const tot = a - lean; return a > tot * 0.62 ? set(T.MUSCLE, 'external oblique muscle', side) : a > tot * 0.3 ? set(T.MUSCLE, 'internal oblique muscle', side) : set(T.MUSCLE, 'transversus abdominis muscle', side);
    }
    return sampleAbdomen(x, y, z, side, -a);
  }
  function samplePelvisBones(x, y, z, side) {
    if (y > 1.07 || y < 0.84) return false;
    if (PELVIS.ilium(x, y, z) < 0) return set(T.BONE, 'ilium', side);
    if (PELVIS.pubis(x, y, z) < 0) return set(T.BONE, 'pubis', side);
    if (PELVIS.ischium(x, y, z) < 0) return set(T.BONE, 'ischium', side);
    if (PELVIS.sacrum(x, y, z) < 0) return set(T.BONE, 'sacrum');
    if (Math.hypot(Math.abs(x) - 0.085, y - 0.935, z) < 0.0235) return set(T.BONE, 'femur (head)', side);
    return false;
  }
  function sampleAbdomen(x, y, z, side, inside) {
    const ax = Math.abs(x);
    if (tube(x, y, z, VES.abdAorta) < 0 || (y > 1.19 && tube(x, y, z, VES.descAorta) < 0)) return set(T.ARTERY, 'abdominal aorta');
    if (x < 0.01 && tube(x, y, z, VES.ivc) < 0) return set(T.VEIN, 'inferior vena cava');
    if (y < 1.08) { if (tube(ax, y, z, SYM.iliacA) < 0) return set(T.ARTERY, y < 0.94 ? 'femoral artery' : 'iliac artery', side); if (tube(ax, y, z, SYM.iliacV) < 0) return set(T.VEIN, y < 0.94 ? 'femoral vein' : 'iliac vein', side); }
    if (inside < 0.0009 && z > -0.03) return set(T.PERITONEAL, 'peritoneum');
    if (kidneySdf(x, y, z) < 0) return set(T.KIDNEY, 'kidney', side);
    if (y > 1.13) {
      if (liverSdf(x, y, z) < 0) return set(T.LIVER, 'liver');
      if (gallSdf(x, y, z) < 0) return set(T.GLAND, 'gallbladder');
      if (spleenSdf(x, y, z) < 0) return set(T.SPLEEN, 'spleen');
      if (stomachSdf(x, y, z) < 0) return set(T.STOMACH, 'stomach');
      if (pancreasSdf(x, y, z) < 0) return set(T.GLAND, 'pancreas');
    }
    if (bladderSdf(x, y, z) < 0) return set(T.BLADDER, 'bladder');
    if (tube(x, y, z, COLON.trans) < 0) return set(T.BOWEL, 'transverse colon');
    if (tube(x, y, z, COLON.asc) < 0) return set(T.BOWEL, 'ascending colon'); if (tube(x, y, z, COLON.desc) < 0) return set(T.BOWEL, 'descending colon'); if (tube(x, y, z, COLON.sig) < 0) return set(T.BOWEL, 'sigmoid colon');
    if (y < 1.13 && y > 0.955 && z > -0.03) return inside < 0.006 && z > 0.03 ? set(T.FAT, 'greater omentum') : set(T.BOWEL, 'small bowel');
    if (z < -0.03) return set(T.FAT, 'retroperitoneal fat');
    return set(T.PERITONEAL, 'peritoneal cavity');
  }

  // ---- limbs. Superficial vessels are defined in "skin coordinates": a path on the surface and a depth under it.
  function surfVessel(lx, y, depth, list, r, d0) { let best = 1e9; for (let k = 1; k < list.length; k++) { const a = list[k - 1], b = list[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = ((lx - a[0]) * dx + (y - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const e = Math.hypot(lx - a[0] - dx * t, y - a[1] - dy * t); if (e < best) best = e; } return Math.hypot(best, depth - d0) - r; }
  const BRACH = [[0.172, 1.33], [0.175, 1.2], [0.181, 1.11], [0.184, 1.072]], RADIAL = [[0.184, 1.072], [0.2, 1.0], [0.207, 0.9], [0.208, 0.845]], ULNAR = [[0.184, 1.072], [0.174, 1.0], [0.172, 0.9], [0.173, 0.848]], MEDN = [[0.166, 1.33], [0.169, 1.2], [0.1755, 1.11], [0.1785, 1.072], [0.189, 0.99], [0.19, 0.85]];
  function sampleArm(part, side, x, y, z, depth, lean, fatT) {
    const lx = x * side, sd = side > 0 ? 'L' : 'R', bn = part === 'upperArm' ? 'shoulder' : part === 'forearm' ? 'elbow' : 'wrist', ant = part === 'palm' || part === 'finger' ? z > 0 : z > -0.012;
    const t0 = tsk.arm;
    // superficial veins in the subcutaneous layer
    if (depth < 0.02 && part !== 'finger') for (const v of REF.veins) { if (v.bone !== bn || (v.side > 0) !== ant) continue; if (surfVessel(lx, y, depth, v.pts, v.r, t0 + v.r + 0.0004 + 0.45 * fatT) < 0) return set(T.VEIN, v.name, sd); }
    if (ant && part !== 'palm' && part !== 'finger') {
      if (y < 1.34 && y > 1.065) {
        const d0 = lerp(0.016, 0.0115, clamp((1.2 - y) / 0.12)) + 0.6 * fatT;
        if (surfVessel(lx, y, depth, BRACH, 0.0023, d0) < 0) return set(T.ARTERY, 'brachial artery', sd);
        if (y < 1.115 && Math.abs(lx - 0.183) < 0.013 && depth > d0 - 0.0048 && depth < d0 - 0.0026 && lean <= 0) return set(T.FASCIA, 'bicipital aponeurosis', sd);
        if (y < 1.12 && surfVessel(lx, y, depth, [[0.191, 1.13], [0.1925, 1.06]], 0.0035, 0.0095 + 0.6 * fatT) < 0 && lean <= 0) return set(T.TENDON, 'biceps tendon', sd);
      }
      if (y < 1.34 && surfVessel(lx, y, depth, MEDN, 0.0019, (y > 1.06 ? lerp(0.0165, 0.012, clamp((1.2 - y) / 0.12)) : 0.014) + 0.6 * fatT) < 0) return set(T.NERVE, 'median nerve', sd);
      if (y <= 1.072) { if (surfVessel(lx, y, depth, RADIAL, 0.0015, lerp(0.011, 0.0042, clamp((1.02 - y) / 0.15)) + 0.5 * fatT) < 0) return set(T.ARTERY, 'radial artery', sd); if (surfVessel(lx, y, depth, ULNAR, 0.0015, lerp(0.012, 0.0065, clamp((1.02 - y) / 0.15)) + 0.5 * fatT) < 0) return set(T.ARTERY, 'ulnar artery', sd); }
    }
    if (lean > 0) return false;
    if (part === 'upperArm') {
      const hb = Math.min(cap(lx, y, z, [0.19, 1.385, -0.012], [0.19, 1.1, -0.014], 0.0115), Math.hypot(lx - 0.178, y - 1.408, z + 0.01) - 0.0235);
      if (hb < 0) return hb < -0.0035 ? set(T.MARROW, 'humerus marrow', sd) : set(T.BONE, 'humerus', sd);
      if (y > 1.33 && (lx > 0.2 || depth < 0.025)) return set(T.MUSCLE, 'deltoid muscle', sd);
      return z > -0.012 ? set(T.MUSCLE, hb < 0.012 ? 'brachialis muscle' : 'biceps brachii muscle', sd) : set(T.MUSCLE, 'triceps brachii muscle', sd);
    }
    if (part === 'forearm') {
      if (y > 1.06) { const hb = sdEllipsoid(lx - 0.19, y - 1.09, z + 0.014, 0.031, 0.014, 0.012); if (hb < 0) return set(T.BONE, 'humerus', sd); if (Math.hypot(lx - 0.19, y - 1.083, z + 0.034) < 0.012) return set(T.BONE, 'ulna (olecranon)', sd); }
      if (cone(lx, y, z, [0.203, 1.068, -0.008], 0.0075, [0.2045, 0.848, 0.0], 0.0098) < 0) return set(T.BONE, 'radius', sd);
      if (cone(lx, y, z, [0.178, 1.085, -0.02], 0.009, [0.1765, 0.85, -0.004], 0.006) < 0) return set(T.BONE, 'ulna', sd);
      return z > -0.006 ? set(T.MUSCLE, lx > 0.198 && y > 0.95 ? 'brachioradialis muscle' : y > 1.03 && lx < 0.185 ? 'pronator teres muscle' : 'forearm flexor muscle', sd) : set(T.MUSCLE, 'forearm extensor muscle', sd);
    }
    if (part === 'finger') return depth > 0.0042 ? set(T.BONE, 'phalanx', sd) : set(T.TENDON, 'digital tendon sheath', sd);
    if (y > 0.815) return depth > 0.006 ? set(T.BONE, 'carpal bone', sd) : set(T.TENDON, z > 0 ? 'flexor retinaculum' : 'extensor tendon', sd);
    if (z < 0.002 && depth > 0.004) return set(T.BONE, 'metacarpal', sd);
    return set(T.MUSCLE, z > 0 ? 'intrinsic hand muscle' : 'interosseous muscle', sd);
  }
  const TB = REF.tibia, tbc = Math.cos(TB.yaw), tbs = Math.sin(TB.yaw);
  function tibiaSdf(lx, y, z) {
    const dx = lx - TB.c[0], dz = z - TB.c[2], bx = tbc * dx - tbs * dz, bz = tbs * dx + tbc * dz;   // into the box frame (rotation by -yaw about Y)
    let d = sdRoundBox(bx, y - TB.c[1], bz, TB.half[0], TB.half[1], TB.half[2], TB.round);
    d = Math.min(d, cone(lx, y, z, [0.075, 0.487, 0.003], 0.034, [0.071, 0.43, 0.02], 0.017), Math.hypot(lx - 0.075, y - TB.tubY, z - 0.039) - 0.0118, cone(lx, y, z, [0.068, 0.14, 0.0], 0.014, [0.064, 0.088, -0.024], 0.019));
    return d;
  }
  function sampleLeg(part, side, x, y, z, depth, lean, fatT) {
    const lx = x * side, sd = side > 0 ? 'L' : 'R';
    if (part === 'thigh' || (part === 'pelvis')) {
      if (tube(lx, y, z, SYM.femA) < 0) return set(T.ARTERY, 'femoral artery', sd);
      if (tube(lx, y, z, SYM.femV) < 0) return set(T.VEIN, 'femoral vein', sd);
      if (tube(lx, y, z, SYM.femN) < 0) return set(T.NERVE, 'femoral nerve', sd);
      if (part === 'pelvis') return false;
    }
    if (part === 'shin' && depth < 0.02 && z > -0.03 && lx < 0.07) { if (surfVessel(lx, y, depth, [[0.032, 0.1], [0.037, 0.28], [0.034, 0.45]], 0.0018, tsk.leg + 0.0022 + 0.4 * fatT) < 0 && tibiaSdf(lx, y, z) > 0.001) return set(T.VEIN, 'great saphenous vein', sd); }
    if (lean > 0.0006) return false;
    if (part === 'thigh') {
      const fb = Math.min(cone(lx, y, z, [0.118, 0.9, -0.005], 0.015, [0.078, 0.535, 0.0], 0.0135), Math.hypot(lx - 0.085, y - 0.935, z) - 0.0235, cap(lx, y, z, [0.085, 0.935, 0], [0.122, 0.918, -0.008], 0.014), sdEllipsoid(lx - 0.075, y - 0.515, z + 0.002, 0.04, 0.03, 0.032));
      if (fb < 0) return fb < -0.005 ? set(T.MARROW, 'femur marrow', sd) : set(T.BONE, 'femur', sd);
      if (lean > 0) return false;
      const rel = lx - lerp(0.078, 0.1, clamp((y - 0.53) / 0.37));
      return z > 0.012 ? set(T.MUSCLE, rel > 0.02 ? 'vastus lateralis muscle' : rel < -0.025 ? 'vastus medialis muscle' : 'rectus femoris muscle', sd) : rel < -0.03 ? set(T.MUSCLE, 'adductor muscle', sd) : set(T.MUSCLE, z < -0.015 ? 'hamstring muscle' : 'vastus intermedius muscle', sd);
    }
    if (part === 'shin') {
      if (y > 0.47) { const fb = sdEllipsoid(lx - 0.075, y - 0.515, z + 0.002, 0.04, 0.03, 0.032); if (fb < 0) return fb < -0.004 ? set(T.MARROW, 'femur marrow', sd) : set(T.BONE, 'femur', sd); if (sdEllipsoid(lx - 0.075, y - 0.508, z - 0.0425, 0.021, 0.023, 0.0095) < 0) return set(T.BONE, 'patella', sd); }
      const tb = Math.max(tibiaSdf(lx, y, z) - 0.0045, lean - 0.0002);     // the medial face is subcutaneous: bone starts at the lean surface
      if (tb < 0.0007) {
        if (tb > -0.0004) return set(T.MEMBRANE, 'periosteum', sd);
        if (kid && Math.abs(y - 0.4685) < 0.0014 && tb < -0.001) return set(T.CARTILAGE, 'growth plate', sd);
        const ct = y > 0.45 ? 0.0022 : y > 0.38 ? lerp(0.0045, 0.0026, (y - 0.38) / 0.07) : 0.005;
        return tb > -ct ? set(T.BONE, 'tibia cortex', sd) : set(T.MARROW, 'tibia marrow', sd);
      }
      if (cap(lx, y, z, [0.108, 0.462, -0.02], [0.104, 0.085, -0.036], 0.0062) < 0) return set(T.BONE, 'fibula', sd);
      if (lean > 0) return false;
      if (y > 0.455 && z > 0.02) return set(T.TENDON, 'patellar tendon', sd);
      return z > -0.005 && lx > 0.068 ? set(T.MUSCLE, 'tibialis anterior muscle', sd) : set(T.MUSCLE, y > 0.25 ? (depth < 0.03 ? 'gastrocnemius muscle' : 'soleus muscle') : 'calf muscle', sd);
    }
    if (lean > 0) return false;
    return depth > 0.009 ? set(T.BONE, z > 0.11 ? 'phalanx' : z > 0.02 ? 'metatarsal' : y < 0.06 && z < -0.03 ? 'calcaneus' : 'tarsal bone', sd) : set(T.TENDON, 'plantar fascia', sd);
  }
  function sampleHead(part, x, y, z, depth, lean) {
    if (part === 'ear') return set(T.CARTILAGE, 'auricular cartilage', x > 0 ? 'L' : 'R');
    if (y < 1.56 && z < 0.05 && sampleNeck(x, y, z, depth, lean, true)) return true;
    const E = REF.eye;
    if (Math.hypot(Math.abs(x) - E[0], y - E[1], z - E[2]) < REF.eyeR) return set(T.GLAND, 'eye', x > 0 ? 'L' : 'R');
    const cr = sdEllipsoid(x, y - 1.665, z + 0.012, 0.0725, 0.086, 0.098);
    if (cr < -0.0005 && y > 1.615 + Math.max(0, z) * 0.35) return cr > -0.0068 ? set(T.BONE, 'skull') : cr > -0.0095 ? set(T.CSF, 'cerebrospinal fluid') : set(T.BRAIN, 'brain');
    if (lean > 0) return false;
    if (y < 1.578 && y > 1.535 && z > 0.02 && Math.abs(x) < 0.03 && depth > 0.012) return set(T.MUSCLE, 'tongue');
    if (depth > 0.009 && y < 1.625) return set(T.BONE, y < 1.578 ? 'mandible' : 'maxilla');
    return set(T.MUSCLE, 'facial muscle');
  }

  // ---- the public sampler
  const TRUNK = { pelvis: 1, spine: 1, chest: 1 }, ARM = { upperArm: 1, forearm: 1, palm: 1, finger: 1 }, LEG = { thigh: 1, shin: 1, foot: 1 };
  const _p = new THREE.Vector3();
  function sampleXYZ(px, py, pz) {
    _p.set(px, py, pz); human.locate(_p, loc);
    if (loc.d > 0) return set(T.AIR, 'air');
    const depth = -loc.d, part = loc.part, x = loc.x, y = loc.y, z = loc.z;
    const ts = TRUNK[part] ? (z < -0.03 ? tsk.back : tsk.trunk) : part === 'neck' ? (z < 0 ? tsk.back : tsk.neck) : ARM[part] ? (part === 'palm' || part === 'finger' ? tsk.hand : tsk.arm) : tsk.leg;
    const side = TRUNK[part] || part === 'neck' || part === 'head' ? (x > 0 ? 'L' : 'R') : (loc.side > 0 ? 'L' : 'R');
    if (depth < ts) return set(T.SKIN, 'skin', side);
    const lean = human.lean(_p, loc.gm), fatT = Math.max(0, depth + lean - ts);
    let hit = false;
    if (part === 'neck') {
      // anterior jugular veins run in the fat either side of the midline
      if (lean > 0 && z > 0 && y > 1.445 && y < 1.515 && Math.hypot(Math.abs(x) - 0.0095, depth - ts - Math.max(0.0016, 0.5 * fatT)) < 0.0013) hit = set(T.VEIN, 'anterior jugular vein', side);
      else hit = sampleNeck(x, y, z, depth, lean);
    }
    else if (TRUNK[part]) hit = (part === 'pelvis' && y < 0.95 && sampleLeg('pelvis', x > 0 ? 1 : -1, x, y, z, depth, lean, fatT)) || sampleTrunk(x, y, z, depth, lean);
    else if (ARM[part]) hit = sampleArm(part, loc.side, x, y, z, depth, lean, fatT);
    else if (LEG[part]) hit = sampleLeg(part, loc.side, x, y, z, depth, lean, fatT);
    else hit = sampleHead(part, x, y, z, depth, lean);
    if (hit) return true;
    if (lean > 0) return set(T.FAT, 'subcutaneous fat', side);
    return set(T.MUSCLE, 'muscle', side);
  }

  const anatomy = {
    T, state, human,
    sample(p) { sampleXYZ(p.x, p.y, p.z); return { t: rT, name: rN, side: rS }; },
    // Contiguous tissue segments along a ray; from/to are metres from the origin. Boundaries are refined by bisection.
    trace(origin, dir, maxLen, step = 0.0005) {
      const ox = origin.x, oy = origin.y, oz = origin.z; let dx = dir.x, dy = dir.y, dz = dir.z; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      const segs = []; sampleXYZ(ox, oy, oz); let cur = { t: rT, name: rN, side: rS, from: 0, to: 0 }, prev = 0;
      const n = Math.max(1, Math.ceil(maxLen / step));
      for (let i = 1; i <= n; i++) {
        const s = Math.min(maxLen, i * step); sampleXYZ(ox + dx * s, oy + dy * s, oz + dz * s);
        if (rN !== cur.name || rS !== cur.side) {
          const nt = rT, nn = rN, ns = rS; let lo = prev, hi = s;
          for (let b = 0; b < 4; b++) { const m = (lo + hi) / 2; sampleXYZ(ox + dx * m, oy + dy * m, oz + dz * m); if (rN === cur.name && rS === cur.side) lo = m; else hi = m; }
          cur.to = hi; segs.push(cur); cur = { t: nt, name: nn, side: ns, from: hi, to: hi };
        }
        prev = s;
      }
      cur.to = maxLen; segs.push(cur); return segs;
    },
    // What a fingertip feels at a skin point, and the soft-tissue thickness to the first bone or cavity.
    surface(p) {
      const nb = [0, 0, 0, 0]; let gmS = 0; let sk = (x, y, z) => model.eval(x, y, z, 1, 0, gmS); sdfNormal(sk, p.x, p.y, p.z, 0.002, nb);
      human.locate({ x: p.x - nb[0] * 0.003, y: p.y - nb[1] * 0.003, z: p.z - nb[2] * 0.003 }, loc); if (loc.gm) { gmS = loc.gm; sdfNormal(sk, p.x, p.y, p.z, 0.002, nb); }
      const n = new THREE.Vector3(-nb[0], -nb[1], -nb[2]), q = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(n, -sk(p.x, p.y, p.z) - 0.0005);
      human.locate(q.clone().addScaledVector(n, 0.002), loc); const part = loc.part, x = loc.x, y = loc.y, z = loc.z, ax = Math.abs(x);
      const region = part === 'chest' ? (z < -0.02 ? 'back' : 'chest') : part === 'spine' ? (z < -0.02 ? 'back' : 'abdomen') : part === 'pelvis' ? 'pelvis' : part === 'upperArm' ? 'upper arm' : part === 'palm' || part === 'finger' ? 'hand' : part === 'ear' ? 'head' : part;
      const segs = anatomy.trace(q, n, 0.12, 0.001); let wall = 0.12, feel = 'soft', pulse = false, firstHard = null;
      // a pulse is felt if a named artery lies within ~2.5 cm under the fingertip (probe a small cone of directions)
      const t1 = new THREE.Vector3(1, 0, 0); if (Math.abs(n.x) > 0.8) t1.set(0, 1, 0); t1.addScaledVector(n, -t1.dot(n)).normalize(); const t2 = new THREE.Vector3().crossVectors(n, t1), pd = new THREE.Vector3();
      for (let k = 0; k < 19 && !pulse; k++) { const a = k * Math.PI / 3, tl = k === 0 ? 0 : k < 7 ? 0.35 : k < 13 ? 0.7 : 1.1; pd.copy(n).addScaledVector(t1, Math.cos(a) * tl).addScaledVector(t2, Math.sin(a) * tl).normalize(); for (let s = 0.003; s < 0.04; s += 0.0012) { sampleXYZ(q.x + pd.x * s, q.y + pd.y * s, q.z + pd.z * s); if (rT === T.ARTERY && /carotid|radial|brachial|femoral/.test(rN)) { pulse = true; break; } if (rT === T.BONE) break; } }
      for (const s of segs) {
        if (s.t === T.ARTERY && s.from < 0.027 && /carotid|radial|brachial|femoral|ulnar/.test(s.name)) pulse = true;
        if (!firstHard && (s.t === T.BONE || s.t === T.CARTILAGE)) firstHard = s;
        if (s.t === T.BONE || s.t === T.CARTILAGE || s.t === T.PLEURA || s.t === T.PLEURAL_SPACE || s.t === T.LUNG || s.t === T.PERITONEAL || s.t === T.AIRWAY_LUMEN || s.t === T.MEMBRANE && /cricothyroid/.test(s.name)) { wall = Math.min(wall, s.from); if (s.t !== T.BONE && s.t !== T.CARTILAGE) break; }
      }
      const near = firstHard && firstHard.from < 0.03 + (part === 'chest' ? 0.03 : 0);
      if ((part === 'neck' || part === 'chest' || part === 'head') && ax < 0.013 && z > 0.01 && y > 1.43 && y < 1.53) {
        feel = y > L.hyoidY - 0.006 ? 'hyoid bone' : y > L.ctmY1 ? 'thyroid cartilage (laryngeal prominence)' : y > L.ctmY0 ? 'cricothyroid membrane (soft dip)' : y > L.cricY0 ? 'cricoid ring' : y > REF.notchY + 0.004 ? 'tracheal rings' : 'sternal notch';
      } else if (near) {
        const nm = firstHard.name, soft = segs.find(s => /intercostal/.test(s.name) && s.from < firstHard.from);
        feel = /^rib/.test(nm) ? (soft && soft.to - soft.from > 0.004 ? 'intercostal space' : 'rib') : /costal cartilage/.test(nm) ? 'costal cartilage' : /sternum|xiphoid/.test(nm) ? (/xiphoid/.test(nm) ? 'xiphoid process' : 'sternum') : /clavicle/.test(nm) ? 'clavicle'
          : /tibia/.test(nm) ? (Math.abs(y - REF.tibia.tubY) < 0.014 && Math.abs(Math.abs(x) - 0.075) < 0.012 ? 'tibial tuberosity' : 'flat bone surface') : /patella/.test(nm) ? 'patella' : /ilium/.test(nm) ? 'iliac crest' : /thyroid cartilage/.test(nm) ? 'thyroid cartilage (laryngeal prominence)' : /cricoid/.test(nm) ? 'cricoid ring' : /tracheal ring/.test(nm) ? 'tracheal rings' : firstHard.from < 0.012 ? 'bone under the skin' : 'firm';
      } else if (part === 'chest' && segs.some(s => /intercostal/.test(s.name) && s.from < 0.06)) feel = 'intercostal space';
      if (pulse && !/rib|sternum|clavicle|cartilage|membrane|ring|notch|tibi/.test(feel)) feel = 'pulsation';
      return { region, feel, wall, side: x > 0 ? 'L' : 'R' };
    },
    group: new THREE.Group(), openings: human.openings,
    show() { }, setXray(v) { human.setGhost(v); },
    setState(st) { for (const k in st) if (st[k] !== undefined && st[k] !== null) state[k] = st[k]; },
    update() { },
    // internals shared with the mesh builder
    _: { heartOut, lvOut, rvOut, raOut, laOut, mediastinum, lungIn, lobeQ, diaY, abdSdf, airZ, RLUM, COR, PHREN, abdC, abdR, tibiaSdf, clavA, clavB, clavC, sampleXYZ, result: () => ({ t: rT, name: rN, side: rS }) },
  };
  anatomy.group.name = 'anatomy'; human.group.add(anatomy.group);
  if (opts.organs !== false) await buildMeshes(anatomy);
  return anatomy;
}

// ---------------------------------------------------------------- meshes of the same shapes

const GLN = `
float sH(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float sN(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(sH(i),sH(i+vec3(1,0,0)),f.x),mix(sH(i+vec3(0,1,0)),sH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(sH(i+vec3(0,0,1)),sH(i+vec3(1,0,1)),f.x),mix(sH(i+vec3(0,1,1)),sH(i+vec3(1,1,1)),f.x),f.y),f.z); }
float sF(vec3 p){ return sN(p)*0.5+sN(p*2.03+7.1)*0.3+sN(p*4.1+3.3)*0.2; }
float sC(vec3 p){ vec3 i=floor(p-0.5), f=p-i; float d=8.0;
  for(int a=0;a<2;a++) for(int b=0;b<2;b++) for(int c=0;c<2;c++){ vec3 o=vec3(float(a),float(b),float(c)); vec3 q=i+o; vec3 h=vec3(sH(q),sH(q+17.3),sH(q+41.7)); vec3 r=o+0.25+0.5*h-f; d=min(d,dot(r,r)); }
  return sqrt(d); }`;

const COL = {
  bone: [0.8, 0.74, 0.6], cartilage: [0.74, 0.78, 0.76], artery: [0.55, 0.06, 0.05], vein: [0.14, 0.2, 0.46], nerve: [0.85, 0.78, 0.35], heart: [0.47, 0.085, 0.07], lung: [0.74, 0.5, 0.5], liver: [0.3, 0.06, 0.045],
  spleen: [0.28, 0.07, 0.12], stomach: [0.76, 0.5, 0.46], kidney: [0.42, 0.13, 0.1], bowel: [0.78, 0.55, 0.5], bladder: [0.8, 0.68, 0.48], gall: [0.24, 0.36, 0.16], pancreas: [0.8, 0.64, 0.4], gland: [0.58, 0.2, 0.17],
  airway: [0.84, 0.78, 0.72], membrane: [0.82, 0.7, 0.42], oesoph: [0.68, 0.42, 0.38], muscle: [0.46, 0.085, 0.07], fat: [0.86, 0.68, 0.24], skin: [0.74, 0.5, 0.42], pleura: [0.72, 0.42, 0.42], fascia: [0.8, 0.74, 0.68], peric: [0.82, 0.74, 0.66], dia: [0.5, 0.14, 0.12],
};
const TISSUE_COL = t => t === T.SKIN ? COL.skin : t === T.FAT ? COL.fat : t === T.BONE ? COL.bone : t === T.CARTILAGE ? COL.cartilage : t === T.PLEURA ? COL.pleura : t === T.FASCIA || t === T.MEMBRANE || t === T.TENDON ? COL.fascia : t === T.DIAPHRAGM ? COL.dia : t === T.ARTERY ? COL.artery : t === T.VEIN ? COL.vein : t === T.NERVE ? COL.nerve : t === T.MEDIASTINUM ? COL.fat : t === T.MARROW ? [0.5, 0.1, 0.08] : t === T.LIVER ? COL.liver : COL.muscle;
// tissue ids for the procedural look: 0 plain, 1 heart, 2 lung, 3 solid organ, 4 bone, 5 muscle, 6 fat, 7 vessel, 8 bowel
function paint(geo, col, tis, extra) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), t = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; t[i] = tis; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.setAttribute('aTis', new THREE.BufferAttribute(t, 1));
  if (geo.index && geo.index.array.constructor !== Uint32Array) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(geo.index.array), 1));
  for (const k in geo.attributes) if (!['position', 'normal', 'color', 'aTis'].includes(k) && !(extra && extra.includes(k))) geo.deleteAttribute(k);
  return geo;
}
function mirrorX(geo) {
  const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal, idx = g.index.array;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return g;
}
// tubes drop any point that jumps away from the run (a projection that missed its surface)
const tubeGeo = (src, r, seg = 8) => { const pts = src.filter((p, i) => i === 0 || Math.hypot(p[0] - src[i - 1][0], p[1] - src[i - 1][1], p[2] - src[i - 1][2]) < 0.3); return sweepTube(pts, (i) => pts[i].length > 3 ? pts[i][3] : r, { segments: seg }); };

function tissueMaterial(an, o = {}) {
  const hu = an.human.uniforms, uni = an._.uni;
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: o.roughness ?? 0.32, clearcoat: o.clearcoat ?? 0.7, clearcoatRoughness: 0.12, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: !o.transparent });
  mat.defines = {}; if (o.mode) mat.defines[o.mode] = 1;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni); sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aTis; attribute float aSide; varying float vTis; varying vec3 vP; varying float vFrac;
      uniform float uBeat, uFib, uTime, uTamp; uniform vec3 uHeartC, uHilL, uHilR; uniform vec2 uLungS;`)
      .replace('#include <begin_vertex>', `vec3 transformed = position; vTis = aTis; vP = position; vFrac = 0.0;
      #ifdef HEART
        vec3 hd = position - uHeartC; transformed = uHeartC + hd*(1.0 - 0.085*uBeat) + cross(vec3(0.3,-0.6,0.2), hd)*0.1*uBeat;
        transformed += normal*uFib*0.0016*sin(uTime*37.0 + position.x*310.0 + position.y*270.0)*sin(uTime*23.0 + position.z*350.0);
      #endif
      #ifdef PERI
        transformed += normal*uTamp*0.013;
      #endif
      #ifdef LUNG
        vec3 hl = aSide > 0.5 ? uHilL : uHilR; float ls = aSide > 0.5 ? uLungS.x : uLungS.y; transformed = hl + (position - hl)*ls;
      #endif
      #ifdef WALL
        vFrac = aSide;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vTis; varying vec3 vP; varying float vFrac; uniform float uXray, uTime, uPeriOpen, uTamp; uniform vec3 uHeartC, uPeriN; float gR=0.32;${GLN}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 c=diffuseColor.rgb; float n1=sF(vP*90.0), n2=sN(vP*420.0);
        if(vTis<0.5) c*=0.85+0.3*n1;
        else if(vTis<1.5){ float ft=smoothstep(0.5,0.66,sF(vP*vec3(70.0,150.0,70.0)+3.0)); c=mix(c*(0.75+0.5*n1),vec3(0.8,0.62,0.22),ft*0.8); gR=mix(0.22,0.4,ft); }
        else if(vTis<2.5){ float cell=sC(vP*170.0); c*=0.78+0.34*n1; c=mix(c,c*vec3(0.5,0.45,0.52),smoothstep(0.42,0.6,cell)*0.5); c=mix(c,vec3(0.16,0.16,0.19),smoothstep(0.66,0.78,sF(vP*40.0+9.0))*0.45); gR=0.28; }
        else if(vTis<3.5){ c*=0.75+0.45*n1; gR=0.16; }
        else if(vTis<4.5){ c*=(0.88+0.18*n1)*(0.92+0.12*n2); gR=0.5; }
        else if(vTis<5.5){ float f=sN(vP*vec3(700.0,45.0,700.0)); c*=0.62+0.6*f; c=mix(c,vec3(0.75,0.66,0.6),smoothstep(0.72,0.8,sF(vP*vec3(30.0,6.0,30.0)))*0.35); gR=0.35; }
        else if(vTis<6.5){ float cell=sC(vP*240.0); c*=0.72+0.5*cell; gR=0.3; }
        else if(vTis<7.5){ c*=0.82+0.3*n1; gR=0.22; }
        else { c*=0.8+0.3*n1; c=mix(c,c*vec3(1.0,0.8,0.8),smoothstep(0.55,0.7,sF(vP*200.0))*0.4); gR=0.24; }
        #ifdef WALL
          float lvl=0.24+0.05*sin(uTime*0.9); float bl=smoothstep(1.0-lvl-0.12,1.0-lvl+0.05,vFrac+(n1-0.5)*0.25);
          float drip=smoothstep(0.6,0.75,sN(vec3(vP.x*260.0,vP.y*260.0,vP.z*260.0)+vec3(0.0,uTime*0.05,0.0)))*smoothstep(0.1,0.5,vFrac);
          c=mix(c,vec3(0.3,0.012,0.012),clamp(bl+drip*0.6,0.0,1.0)*0.92); gR=mix(0.45,0.1,clamp(bl+drip,0.0,1.0));
        #endif
        #ifdef PERI
          c=mix(c,vec3(0.3,0.1,0.2),uTamp*0.6);
          if(dot(normalize(vP-uHeartC),uPeriN) + (n1-0.5)*0.12 > 1.0-uPeriOpen*0.95) discard;
          c=mix(c,vec3(0.86,0.8,0.74),0.35);
        #endif
        diffuseColor.rgb=c; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=gR;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*uXray*0.55;');
  };
  mat.customProgramCacheKey = () => 'swm-tissue' + (o.mode || '');
  if (o.open) patchOpenings(mat, an.human, o.mode || '');
  return mat;
}

async function buildMeshes(an) {
  const human = an.human, rig = human.rig, A = rig.A, D = human.dims, I = an._, model = rig.model, st = an.state;
  const tick = () => new Promise(r => setTimeout(r, 0));
  const v3 = (bone, p) => human.toRoot(bone, p[0], p[1], p[2]);
  const uni = I.uni = { uBeat: { value: 0 }, uFib: { value: 0 }, uTamp: { value: 0 }, uHeartC: { value: v3('chest', H.centre) }, uHilL: { value: v3('chest', HILUM.L) }, uHilR: { value: v3('chest', HILUM.R) }, uLungS: { value: new THREE.Vector2(1, 1) }, uXray: { value: 0 }, uPeriOpen: { value: 0 }, uPeriN: { value: new THREE.Vector3() } };
  uni.uPeriN.value.copy(human.anchors.sternumCPR.normal);
  const toRoot = (geo, bone) => { geo.applyMatrix4(A[bone]); return geo; };
  const mesh = (geos, mat, name) => { const g = mergeGeometries(geos.filter(Boolean), false); for (const q of geos) q?.dispose(); const m = new THREE.Mesh(g, mat); m.name = name; m.raycast = () => { }; m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; return m; };
  const box = (c, r) => ({ min: [c[0] - r[0], c[1] - r[1], c[2] - r[2]], max: [c[0] + r[0], c[1] + r[1], c[2] + r[2]] });
  const sdfGeo = (fn, bb, res, col, tis, bone = 'chest') => { const g = meshSDF(fn, bb, res, { slack: 1.5 }); return g ? toRoot(paint(g, col, tis), bone) : null; };
  const G = { skeleton: new THREE.Group(), organs: new THREE.Group(), vessels: new THREE.Group(), airway: new THREE.Group(), muscles: new THREE.Group(), walls: new THREE.Group() };
  for (const k in G) { G[k].name = k; G[k].visible = false; an.group.add(G[k]); }
  G.walls.visible = true;
  const matOrgan = tissueMaterial(an), matBone = tissueMaterial(an, { open: true, clearcoat: 0.25, mode: 'BONEM' });

  // ---- skeleton
  const sk = [];
  for (const side of [1, -1]) {
    for (let k = 1; k <= 12; k++) {       // ribs and costal cartilages: one sweep each along the cage
      const end = ribEnd(k), ccj = k <= 10 ? ribCCJ(k) : 2, pts = [], n = 26;
      for (let i = 0; i <= n; i++) { const u = lerp(0.045, Math.min(end, k <= 7 ? 0.985 : end), i / n), p = cagePoint(u, ribY(k, u), side), c = REF.cage, nx = (p[0] - c.c[0]) / c.r[0] ** 2, ny = (p[1] - c.c[1]) / c.r[1] ** 2, nz = (p[2] - c.c[2]) / c.r[2] ** 2, l = Math.hypot(nx, ny, nz); pts.push([p[0] - nx / l * 0.0039, p[1] - ny / l * 0.0039, p[2] - nz / l * 0.0039, u]); }
      const g = sweepTube(pts, () => [k === 1 ? 0.008 : RIBH, 0.0036], { segments: 8, side: () => [0, 1, 0] });
      paint(g, COL.bone, 4); const col = g.attributes.color;
      for (let i = 0; i < col.count; i++) { const ring = Math.min(n, Math.floor(i / 8)); if (pts[ring] && pts[ring][3] > ccj) { col.setXYZ(i, COL.cartilage[0], COL.cartilage[1], COL.cartilage[2]); } }
      sk.push(toRoot(g, 'chest'));
    }
    const cl = []; for (let i = 0; i <= 10; i++) { const t = i / 10, u = 1 - t, a = I.clavA, b = I.clavB, c = I.clavC; cl.push([side * (u * u * a[0] + 2 * u * t * b[0] + t * t * c[0]), u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2], 0.0074 + 0.0022 * Math.abs(t - 0.5)]); }
    sk.push(toRoot(paint(tubeGeo(cl), COL.bone, 4), 'chest'));
    // scapula: a plate lying on the back of the cage
    sk.push(sdfGeo((x, y, z) => Math.max(Math.abs(cageSdf(x, y, z) - 0.0125) - 0.003, 1.275 - y, y - 1.43, 0.055 - side * x, side * x - (0.15 - (1.43 - y) * 0.25), z + 0.0), box([side * 0.1, 1.35, -0.07], [0.07, 0.1, 0.06]), 0.004, COL.bone, 4));
    // arm and leg bones (left-side reference shapes, mirrored through the right bones' matrices)
    const sd = side > 0 ? 'L' : 'R', X = p => [side * p[0], p[1], p[2], p[3]];
    const add = (pts, bone, r) => sk.push(toRoot(paint(tubeGeo(pts.map(X), r, 7), COL.bone, 4), bone + sd));
    add([[0.176, 1.412, -0.01, 0.022], [0.186, 1.385, -0.012, 0.0125], [0.19, 1.2, -0.013, 0.0105], [0.19, 1.11, -0.014, 0.012], [0.19, 1.09, -0.014, 0.02]], 'shoulder');
    add([[0.203, 1.068, -0.008, 0.0075], [0.204, 0.95, -0.003, 0.0068], [0.2045, 0.848, 0.0, 0.0098]], 'elbow'); add([[0.19, 1.085, -0.034, 0.011], [0.178, 1.07, -0.02, 0.009], [0.1765, 0.85, -0.004, 0.006]], 'elbow');
    add([[0.085, 0.935, 0, 0.0235], [0.112, 0.922, -0.006, 0.014], [0.12, 0.9, -0.005, 0.016], [0.1, 0.7, -0.002, 0.0135], [0.079, 0.545, 0.0, 0.015], [0.075, 0.515, -0.002, 0.031]], 'hip');
    add([[0.108, 0.462, -0.02, 0.007], [0.106, 0.3, -0.028, 0.0055], [0.104, 0.085, -0.036, 0.0075]], 'knee');
    sk.push(sdfGeo((x, y, z) => I.tibiaSdf(x * side, y, z) - 0.004, box([side * 0.07, 0.29, 0.01], [0.05, 0.22, 0.05]), 0.004, COL.bone, 4, 'knee' + sd));
    sk.push(sdfGeo((x, y, z) => sdEllipsoid(x * side - 0.075, y - 0.508, z - 0.0425, 0.021, 0.023, 0.0095), box([side * 0.075, 0.508, 0.0425], [0.03, 0.03, 0.02]), 0.004, COL.bone, 4, 'knee' + sd));
    // hand and foot rays
    for (const f of [[0.217, 0.7425, 0.073], [0.1975, 0.7375, 0.081], [0.178, 0.741, 0.075], [0.1595, 0.752, 0.059]]) add([[lerp(0.19, f[0], 0.35), 0.822, 0, 0.0045], [f[0], f[1], -0.002, 0.004], [f[0], f[1] - f[2] * 0.55, 0.004, 0.0033], [f[0], f[1] - f[2] * 0.95, 0.012, 0.0026]], 'wrist');
    add([[0.205, 0.82, 0.004, 0.005], [0.2415, 0.773, 0.02, 0.0042], [0.2625, 0.716, 0.036, 0.003]], 'wrist');
    for (const t of [[0.036, 0.168], [0.057, 0.165], [0.073, 0.156], [0.09, 0.145], [0.104, 0.13]]) add([[lerp(0.07, t[0], 0.4), 0.055, 0.0, 0.007], [t[0], 0.022, 0.1, 0.0055], [t[0], 0.016, t[1] - 0.006, 0.0035]], 'ankle');
    add([[0.07, 0.04, -0.07, 0.018], [0.07, 0.06, -0.025, 0.016]], 'ankle');
  }
  sk.push(sdfGeo((x, y, z) => Math.max(Math.abs(cageSdf(x, y, z) + 0.0045) - 0.0045, Math.abs(x) - sternW(y), y - REF.notchY, REF.xiphoidTipY - y, -z), box([0, 1.345, 0.09], [0.04, 0.1, 0.035]), 0.003, COL.bone, 4));
  for (const v of VERT) {                 // vertebral bodies and arches
    const yc = (v.y0 + v.y1) / 2, r = spineR(yc), z = v.id[0] === 'C' ? Math.min(spineZ(yc), I.airZ(yc) - 0.036) : spineZ(yc), h = (v.y1 - v.y0) - 0.004;
    const b = new THREE.CylinderGeometry(r, r, h, 12); b.scale(1.25, 1, 1); b.translate(0, yc - 0.002, z); sk.push(toRoot(paint(b, COL.bone, 4), v.id[0] === 'L' ? 'spine' : v.id[0] === 'C' ? 'neck' : 'chest'));
    const a = new THREE.BoxGeometry(0.03 + r, h * 0.7, 0.012); a.translate(0, yc - 0.002, z - r - 0.014); sk.push(toRoot(paint(a, COL.bone, 4), v.id[0] === 'L' ? 'spine' : v.id[0] === 'C' ? 'neck' : 'chest'));
    const s = new THREE.BoxGeometry(0.007, h * 0.6, 0.026); s.rotateX(0.35); s.translate(0, yc - 0.008, z - r - 0.032); sk.push(toRoot(paint(s, COL.bone, 4), v.id[0] === 'L' ? 'spine' : v.id[0] === 'C' ? 'neck' : 'chest'));
  }
  sk.push(sdfGeo((x, y, z) => Math.min(PELVIS.ilium(x, y, z), PELVIS.pubis(x, y, z), PELVIS.ischium(x, y, z), PELVIS.sacrum(x, y, z)), box([0, 0.96, -0.01], [0.16, 0.12, 0.11]), 0.0045, COL.bone, 4, 'pelvis'));
  // skull: cranium, face, orbits, nasal aperture, jaw
  const E = REF.eye;
  const skull = (x, y, z) => {
    const ax = Math.abs(x);
    let d = smin(sdEllipsoid(x, y - 1.667, z + 0.012, 0.067, 0.08, 0.092), sdEllipsoid(x, y - 1.62, z - 0.03, 0.05, 0.045, 0.048), 0.02);
    d = smin(d, sdEllipsoid(ax - 0.046, y - 1.62, z - 0.045, 0.014, 0.009, 0.022), 0.012);
    d = smin(d, sdEllipsoid(x, y - 1.587, z - 0.055, 0.03, 0.016, 0.03), 0.01);
    d = -smin(-d, sdEllipsoid(ax - E[0], y - E[1], z - 0.08, 0.017, 0.015, 0.02), 0.004);
    d = -smin(-d, sdEllipsoid(x, y - 1.612, z - 0.083, 0.011, 0.016, 0.012), 0.003);
    const jaw = Math.min(sdCapsule(ax, y, z, 0.01, 1.552, 0.066, 0.036, 1.556, 0.04, 0.009), sdCapsule(ax, y, z, 0.036, 1.556, 0.04, 0.04, 1.578, 0.002, 0.008), sdCapsule(ax, y, z, 0.04, 1.578, 0.002, 0.05, 1.622, -0.008, 0.007), sdEllipsoid(x, y - 1.55, z - 0.07, 0.016, 0.012, 0.012));
    return Math.min(d, jaw);
  };
  sk.push(sdfGeo(skull, box([0, 1.64, 0.0], [0.085, 0.115, 0.115]), 0.0038, COL.bone, 4, 'head'));
  G.skeleton.add(mesh(sk, matBone, 'skeleton'));
  await tick();

  // ---- heart, pericardium, lungs
  const heartGeo = [sdfGeo(I.heartOut, box(H.centre, [0.085, 0.085, 0.07]), 0.003, COL.heart, 1)];
  heartGeo.push(toRoot(paint(tubeGeo(I.COR.lad, 0.002, 6), COL.artery, 7), 'chest'), toRoot(paint(tubeGeo(I.COR.rca, 0.002, 6), COL.artery, 7), 'chest'));
  for (const [k, c] of [['ascAorta', COL.artery], ['pulmTrunk', [0.3, 0.2, 0.42]]]) heartGeo.push(toRoot(paint(tubeGeo(VES[k], 0, 12), c, 7), 'chest'));
  const heart = mesh(heartGeo, tissueMaterial(an, { mode: 'HEART' }), 'heart'); G.organs.add(heart);
  const peri = mesh([sdfGeo((x, y, z) => I.heartOut(x, y, z) - 0.0024, box(H.centre, [0.09, 0.09, 0.075]), 0.004, COL.peric, 0)], tissueMaterial(an, { mode: 'PERI', roughness: 0.14, clearcoat: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }), 'pericardium'); peri.renderOrder = 4; G.organs.add(peri);
  const lungGeo = [];
  for (const sd of ['L', 'R']) {
    const fn = (x, y, z) => { let d = -I.lungIn(x, y, z, sd); const yf = 1.41 - 0.8125 * (z + 0.07), df = (y - yf) / 1.288; d += 0.003 * Math.exp(-((df / 0.0028) ** 2)); if (sd === 'R' && y > yf) d += 0.003 * Math.exp(-(((y - 1.335) / 0.0028) ** 2)); return d; };
    const g = meshSDF(fn, box([sd === 'L' ? 0.075 : -0.07, 1.33, 0.005], [0.085, 0.19, 0.11]), 0.0045, { slack: 1.6 }); if (!g) continue;
    paint(g, COL.lung, 2); const s = new Float32Array(g.attributes.position.count).fill(sd === 'L' ? 1 : 0); g.setAttribute('aSide', new THREE.BufferAttribute(s, 1)); lungGeo.push(toRoot(g, 'chest'));
  }
  const lungs = mesh(lungGeo, tissueMaterial(an, { mode: 'LUNG' }), 'lungs'); G.organs.add(lungs);
  await tick();
  // inner wall of the chest (pleura over ribs, diaphragm below), seen from inside through any opening
  {
    const fn = (x, y, z) => Math.max(cageSdf(x, y, z) + RIBT + PLT, diaY(x, z, 0) + DIAT - y);
    const g = meshSDF(fn, box([0, 1.33, 0.008], [0.15, 0.2, 0.115]), 0.006, { slack: 1.6 });
    if (g) {
      paint(g, COL.pleura, 0); const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, q = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { human.toRoot('chest', p.getX(i) + n.getX(i) * 0.003, p.getY(i) + n.getY(i) * 0.003, p.getZ(i) + n.getZ(i) * 0.003, q); I.sampleXYZ(q.x, q.y, q.z); const r = I.result(), k = r.t === T.BONE ? COL.bone : r.t === T.CARTILAGE ? COL.cartilage : r.t === T.DIAPHRAGM ? COL.dia : COL.pleura; c.setXYZ(i, lerp(COL.pleura[0], k[0], 0.6), lerp(COL.pleura[1], k[1], 0.6), lerp(COL.pleura[2], k[2], 0.6)); }
      G.organs.add(mesh([toRoot(g, 'chest')], tissueMaterial(an, { side: THREE.BackSide, mode: 'LINING' }), 'lining'));
    }
  }
  await tick();

  // ---- abdominal organs
  const og = [];
  og.push(sdfGeo((x, y, z) => Math.max(liverSdf(x, y, z), y - diaY(x, z, 0) + 0.002), box([-0.045, 1.23, 0.025], [0.115, 0.075, 0.09]), 0.0045, COL.liver, 3, 'spine'));
  og.push(sdfGeo((x, y, z) => Math.max(stomachSdf(x, y, z), y - diaY(x, z, 0) + 0.002), box([0.04, 1.21, 0.03], [0.08, 0.075, 0.06]), 0.0045, COL.stomach, 8, 'spine'));
  og.push(sdfGeo(spleenSdf, box([0.104, 1.232, -0.046], [0.03, 0.06, 0.04]), 0.004, COL.spleen, 3, 'spine'));
  og.push(sdfGeo(kidneySdf, box([0, 1.14, -0.052], [0.095, 0.07, 0.03]), 0.004, COL.kidney, 3, 'spine'));
  og.push(sdfGeo(bladderSdf, box([0, 0.925, 0.032], [0.045, 0.04, 0.04]), 0.004, COL.bladder, 8, 'pelvis'));
  og.push(sdfGeo(gallSdf, box([-0.05, 1.182, 0.062], [0.02, 0.028, 0.02]), 0.003, COL.gall, 3, 'spine'));
  og.push(sdfGeo(pancreasSdf, box([0.02, 1.17, -0.015], [0.075, 0.035, 0.025]), 0.004, COL.pancreas, 6, 'spine'));
  for (const k in COLON) { const src = COLON[k], pts = []; for (let i = 1; i < src.length; i++) for (let j = 0; j < 8; j++) { const t = j / 8, a = src[i - 1], b = src[i]; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t) * (0.86 + 0.14 * Math.abs(Math.sin((i * 8 + j) * 1.4)))]); } pts.push(src[src.length - 1]); og.push(toRoot(paint(tubeGeo(pts, 0, 10), COL.bowel, 8), 'spine')); }
  { const pts = []; for (let i = 0; i <= 260; i++) { const t = i / 260; pts.push([0.072 * Math.sin(t * 34.5 + Math.sin(t * 9) * 0.8), lerp(1.105, 0.972, t) + 0.011 * Math.sin(t * 69), 0.05 + I.abdC[2] - 0.016 + 0.02 * Math.cos(t * 45), 0.0125]); } og.push(toRoot(paint(tubeGeo(pts, 0, 7), [0.8, 0.58, 0.54], 8), 'spine')); }
  G.organs.add(mesh(og, matOrgan, 'abdomen'));
  await tick();

  // ---- airway and oesophagus
  const aw = [], yA = 1.465;
  { const pts = []; for (let y = yA; y > CARINA[1]; y -= 0.0011) { const k = (L.ringY0 - y) / L.ringPitch, f = k - Math.floor(k); pts.push([0, y, I.airZ(y), I.RLUM + 0.0012 + (f < 0.68 && y < L.ringY0 ? 0.0011 : 0)]); } pts.push([CARINA[0], CARINA[1], CARINA[2], I.RLUM]); aw.push(toRoot(paint(tubeGeo(pts, 0, 12), COL.airway, 0), 'chest')); }
  aw.push(toRoot(paint(tubeGeo([[...CARINA, 0.008], [...BRONCH_R, 0.007]], 0, 10), COL.airway, 0), 'chest'), toRoot(paint(tubeGeo([[...CARINA, 0.008], [...BRONCH_L, 0.0068]], 0, 10), COL.airway, 0), 'chest'));
  const lar = (band) => (x, y, z) => { const zr = z - I.airZ(y), r = Math.hypot(x, zr), phi = Math.atan2(Math.abs(x), zr); return band(r, phi, y); };
  aw.push(sdfGeo(lar((r, phi, y) => { const r1 = 0.0098 + 0.003 * Math.exp(-(((y - L.promY) / 0.0075) ** 2)) * Math.exp(-((phi / 0.55) ** 2)); return Math.max(Math.abs(r - r1 - 0.0016) - 0.0016, (phi - 2.1) * 0.01, L.ctmY1 - y, y - 1.512); }), box([0, 1.497, I.airZ(1.497)], [0.024, 0.02, 0.024]), 0.0014, COL.cartilage, 4, 'neck'));
  aw.push(sdfGeo(lar((r, phi, y) => Math.max(Math.abs(r - I.RLUM - 0.002) - 0.0018, L.cricY0 - y, y - (phi > 1.95 ? 1.489 : L.ctmY0))), box([0, 1.477, I.airZ(1.477)], [0.018, 0.015, 0.018]), 0.0014, COL.cartilage, 4, 'neck'));
  aw.push(sdfGeo(lar((r, phi, y) => Math.max(Math.abs(r - I.RLUM - 0.0007) - 0.0007, (phi - 1.3) * 0.01, L.ctmY0 - y, y - L.ctmY1)), box([0, 1.478, I.airZ(1.478)], [0.016, 0.008, 0.016]), 0.0011, COL.membrane, 0, 'neck'));
  { const pts = []; for (let i = 0; i <= 12; i++) { const a = lerp(-1.9, 1.9, i / 12); pts.push([0.0135 * Math.sin(a), L.hyoidY, I.airZ(L.hyoidY) + 0.0135 * Math.cos(a), 0.0024]); } aw.push(toRoot(paint(tubeGeo(pts, 0, 6), COL.bone, 4), 'neck')); }
  for (const s of [1, -1]) { const e = new THREE.SphereGeometry(1, 12, 8); e.scale(0.0085, 0.022, 0.011); e.translate(s * 0.0185, 1.4625, I.airZ(1.4625) - 0.001); aw.push(toRoot(paint(e, COL.gland, 3), 'neck')); }
  { const pts = []; for (let y = 1.5; y > 1.21; y -= 0.012) pts.push([0.004, y, y > 1.44 ? I.airZ(y) - I.RLUM - 0.0095 : Math.min(I.airZ(Math.max(y, 1.3)) - I.RLUM - 0.0105, spineZ(y) + spineR(y) + 0.009), 0.0068]); aw.push(toRoot(paint(tubeGeo(pts, 0, 8), COL.oesoph, 8), 'chest')); }
  G.airway.add(mesh(aw, matOrgan, 'airway'));

  // ---- vessels and nerves
  const vg = [];
  for (const [k, c] of [['arch', COL.artery], ['descAorta', COL.artery], ['abdAorta', COL.artery], ['svc', COL.vein], ['ivc', COL.vein], ['brachioL', COL.vein], ['brachioR', COL.vein], ['brachioTrunk', COL.artery], ['carotidLroot', COL.artery], ['subclavLroot', COL.artery]]) vg.push(toRoot(paint(tubeGeo(VES[k], 0, 10), c, 7), k === 'abdAorta' ? 'spine' : 'chest'));
  for (const s of [1, -1]) {
    const sd = s > 0 ? 'L' : 'R', X = p => [s * p[0], p[1], p[2], p[3]];
    for (const [k, c, bone] of [['subclavA', COL.artery, 'chest'], ['subclavV', COL.vein, 'chest'], ['iliacA', COL.artery, 'pelvis'], ['iliacV', COL.vein, 'pelvis'], ['femA', COL.artery, 'hip' + sd], ['femV', COL.vein, 'hip' + sd], ['femN', COL.nerve, 'hip' + sd]]) vg.push(toRoot(paint(tubeGeo(SYM[k].map(X), 0, 8), c, 7), bone));
    vg.push(toRoot(paint(tubeGeo(I.PHREN[sd], 0.0013, 5), COL.nerve, 7), 'chest'));
    const car = [], jug = []; for (let y = 1.44; y <= 1.562; y += 0.012) { const cx = lerp(0.021, 0.031, clamp((y - 1.44) / 0.09)), cz = I.airZ(y) - 0.01; car.push([s * cx, y, cz, 0.0036]); jug.push([s * (cx + 0.0096), y, cz - 0.002, 0.0058]); }
    vg.push(toRoot(paint(tubeGeo(car, 0, 8), COL.artery, 7), 'neck'), toRoot(paint(tubeGeo(jug, 0, 8), COL.vein, 7), 'neck'));
    // surface-following vessels of the arm: drop each path point onto the skin and sink it to its depth
    const skinFn = model.fn(1, 0), o = new THREE.Vector3(), t = new THREE.Vector3();
    const follow = (path, bone, front, depth, r, col) => {
      const pts = [];
      for (let i = 1; i < path.length; i++) for (let j = 0; j < 5; j++) { const f = j / 5, lx = lerp(path[i - 1][0], path[i][0], f), y = lerp(path[i - 1][1], path[i][1], f);
        human.toRoot(bone, s * lx, y, front * 0.25, o); human.toRoot(bone, s * lx, y, -front * 0.02, t); t.sub(o).normalize(); const d = sdfRaycast(skinFn, o.x, o.y, o.z, t.x, t.y, t.z, 0.4, 1e-4); if (d < 0) continue; pts.push([o.x + t.x * (d + depth), o.y + t.y * (d + depth), o.z + t.z * (d + depth), r]); }
      if (pts.length > 1) vg.push(paint(tubeGeo(pts, 0, 6), col, 7));
    };
    const fatA = Math.max(0, D.fat.forearm - D.skinT * 0.75);
    for (const v of REF.veins) follow(v.pts, v.bone + sd, v.side, D.skinT * 0.75 + v.r + 0.0004 + 0.45 * fatA, v.r, COL.vein);
    follow([[0.172, 1.33], [0.175, 1.2], [0.181, 1.11], [0.184, 1.072]], 'shoulder' + sd, 1, 0.013 + 0.6 * fatA, 0.0023, COL.artery);
    follow([[0.184, 1.072], [0.2, 1.0], [0.207, 0.9], [0.208, 0.845]], 'elbow' + sd, 1, 0.007 + 0.5 * fatA, 0.0015, COL.artery);
    follow([[0.166, 1.33], [0.169, 1.2], [0.1755, 1.11], [0.1785, 1.072]], 'shoulder' + sd, 1, 0.014 + 0.6 * fatA, 0.0019, COL.nerve);
  }
  G.vessels.add(mesh(vg, matOrgan, 'vessels'));
  await tick();

  // ---- muscle layer: the lean body
  { const g = meshSDF(model.fn(0, 0), model.bounds(0.01), 0.011, { slack: 1.5 }); if (g) G.muscles.add(mesh([paint(g, COL.muscle, 5)], tissueMaterial(an, { open: true, mode: 'MUSC', clearcoat: 0.4 }), 'muscles')); }

  // ---- cut walls of surgical openings (rebuilt whenever the opening set changes)
  const wallMat = tissueMaterial(an, { side: THREE.DoubleSide, mode: 'WALL', clearcoat: 0.2, roughness: 0.45 }); let wallMesh = null;
  const skinFn = model.fn(1, 0), nb = [0, 0, 0, 0];
  const onSkin = (p) => { for (let k = 0; k < 3; k++) { const d = sdfNormal(skinFn, p.x, p.y, p.z, 0.002, nb); p.x -= nb[0] * d; p.y -= nb[1] * d; p.z -= nb[2] * d; } return p; };
  function buildWalls(set) {
    if (wallMesh) { wallMesh.geometry.dispose(); G.walls.remove(wallMesh); wallMesh = null; }
    const P = [], N = [], C = [], F = [], Ix = [], ND = 14, w = new THREE.Vector3(), tv = new THREE.Vector3(), q = new THREE.Vector3();
    // one wall = a row of columns going inwards from skin-edge points; cols: [{p, n (outward skin normal), inw (unit, towards the cut centre), depth, slope}]
    const wall = (cols, flip) => {
      const base = P.length / 3;
      for (const c of cols) for (let j = 0; j <= ND; j++) {
        const f = j / ND, d = c.depth * f; q.copy(c.p).addScaledVector(c.n, -d).addScaledVector(c.inw, c.slope * f);
        I.sampleXYZ(c.p.x - c.n.x * Math.max(d, 0.0004) - c.inw.x * 0.0006, c.p.y - c.n.y * Math.max(d, 0.0004) - c.inw.y * 0.0006, c.p.z - c.n.z * Math.max(d, 0.0004) - c.inw.z * 0.0006);
        const col = TISSUE_COL(I.result().t); P.push(q.x, q.y, q.z); N.push(c.inw.x * 0.6 + c.n.x * 0.8, c.inw.y * 0.6 + c.n.y * 0.8, c.inw.z * 0.6 + c.n.z * 0.8); C.push(col[0], col[1], col[2]); F.push(f);
      }
      for (let i = 0; i + 1 < cols.length; i++) for (let j = 0; j < ND; j++) { const a = base + i * (ND + 1) + j, b = a + ND + 1; if (flip) Ix.push(a, b + 1, b, a, a + 1, b + 1); else Ix.push(a, b, b + 1, a, b + 1, a + 1); }
      return base;
    };
    const floor = (b0, b1, n) => { for (let i = 0; i + 1 < n; i++) { const a = b0 + i * (ND + 1) + ND, b = a + ND + 1, c = b1 + i * (ND + 1) + ND, d = c + ND + 1; Ix.push(a, c, d, a, d, b); } };
    for (const op of set.list) {
      if (!op || op.gape < 0.0015) continue;
      const ab = tv.subVectors(op.b, op.a), Lg = ab.length(); if (Lg < 1e-4) continue; ab.multiplyScalar(1 / Lg); w.crossVectors(op.n, ab).normalize();
      const sides = [[], []], NS = 18;
      for (let i = 0; i <= NS; i++) { const s = i / NS, hw = 0.5 * op.gape * Math.sqrt(Math.max(4 * s * (1 - s), 0));
        for (const sg of [1, -1]) { const p = onSkin(new THREE.Vector3().copy(op.a).addScaledVector(ab, Lg * s).addScaledVector(w, sg * hw)); sides[sg > 0 ? 0 : 1].push({ p, n: op.n, inw: w.clone().multiplyScalar(-sg), depth: op.depth, slope: hw * 0.4 }); } }
      const b0 = wall(sides[0], false), b1 = wall(sides[1], true);
      I.sampleXYZ(...new THREE.Vector3().copy(op.a).lerp(op.b, 0.5).addScaledVector(op.n, -op.depth - 0.001).toArray()); const tb = I.result().t;
      if (![T.AIR, T.PLEURAL_SPACE, T.LUNG, T.AIRWAY_LUMEN, T.PERITONEAL, T.PERICARDIAL_SPACE].includes(tb)) floor(b0, b1, NS + 1);
    }
    const ribGeo = [];
    if (set.thor > 0.01 && set.thorPath) {
      // The skin band is cut by the shader (GL_OPEN in human.js); thorField is the same test on the CPU, so the wall is
      // hung exactly on the band's edge. Rows: upper and lower edge; each column drops to the pleura.
      const path = set.thorPath, n = path.length, gape = set.thor * 0.115, up = [], dn = [], d3 = new THREE.Vector3(), nn2 = new THREE.Vector3(), t2 = new THREE.Vector3(), w2 = new THREE.Vector3();
      const thorField = (p) => { let best = -1;
        for (let i = 0; i < n - 1; i++) { const a = path[i].pos; t2.subVectors(path[i + 1].pos, a); const Lg = t2.length() || 1e-4; t2.multiplyScalar(1 / Lg); nn2.addVectors(path[i].n, path[i + 1].n).normalize(); w2.crossVectors(nn2, t2); const wl = w2.length(); if (wl < 1e-4) continue; w2.multiplyScalar(1 / wl);
          d3.subVectors(p, a); const s = d3.dot(t2) / Lg, lat = d3.dot(w2), dep = -d3.dot(nn2); if (s < (i === 0 ? 0 : -0.45) || s > (i === n - 2 ? 1 : 1.45) || dep > 0.16 || dep < -0.012) continue;
          const gs = (i + clamp(s)) / (n - 1), hw = 0.5 * gape * Math.pow(Math.max(4 * gs * (1 - gs), 0), 0.35); if (hw - Math.abs(lat) > best) best = hw - Math.abs(lat); }
        return best; };
      const cols = [];
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < (i === n - 2 ? 5 : 4); j++) {
        const f = j / 4, gs = (i + f) / (n - 1); if (gs < 0.03 || gs > 0.97) continue;
        const pos = new THREE.Vector3().lerpVectors(path[i].pos, path[i + 1].pos, f), nn = new THREE.Vector3().addVectors(path[i].n, path[i + 1].n).normalize();
        tv.subVectors(path[i + 1].pos, path[i].pos).normalize(); const wv = new THREE.Vector3().crossVectors(nn, tv).normalize();
        for (const sg of [1, -1]) {
          let lo = 0, hi = gape; const probe = x => onSkin(pos.clone().addScaledVector(wv, sg * x));
          if (thorField(probe(hi)) > 0) hi = gape * 1.6;
          for (let b = 0; b < 11; b++) { const m = (lo + hi) / 2; if (thorField(probe(m)) > 0) lo = m; else hi = m; }
          const p = probe(hi + 0.0006); let depth = 0.04; const segs = an.trace(p.clone().addScaledVector(nn, 0.0005), nn.clone().negate(), 0.09, 0.0015);
          for (const s of segs) if (s.t === T.PLEURA || s.t === T.PLEURAL_SPACE || s.t === T.LUNG || s.t === T.MEDIASTINUM || s.t === T.PERICARDIUM) { depth = s.from + 0.001; break; }
          cols.push({ p, n: nn, inw: wv.clone().multiplyScalar(-sg), depth: clamp(depth, 0.018, 0.075), slope: 0.003, sg });
        }
      }
      for (const sg of [1, -1]) {
        const row = cols.filter(c => c.sg === sg);
        for (let it = 0; it < 3; it++) { const dd = row.map(c => c.depth); for (let i = 1; i + 1 < row.length; i++) row[i].depth = (dd[i - 1] + 2 * dd[i] + dd[i + 1]) / 4; }
        if (row.length > 2) {
          wall(row, sg < 0);
          // the spread ribs: rib 5 lifted with the upper edge, rib 6 held down with the lower, cream bone under the cut muscle
          const pts = row.map(c => [c.p.x - c.n.x * (c.depth - 0.0055) + c.inw.x * 0.002, c.p.y - c.n.y * (c.depth - 0.0055) + c.inw.y * 0.002, c.p.z - c.n.z * (c.depth - 0.0055) + c.inw.z * 0.002]);
          const tg = sweepTube(pts, () => [0.0048, 0.0062], { segments: 8, side: (i) => row[i].n.toArray() }); paint(tg, COL.bone, 4); tg.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count), 1)); ribGeo.push(tg);
        }
      }
    }
    if (!Ix.length) return;
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(F, 1));
    g.setAttribute('aTis', new THREE.BufferAttribute(new Float32Array(P.length / 3).fill(6.6), 1)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(Ix), 1));
    if (ribGeo.length) { const all = mergeGeometries([g, ...ribGeo], false); if (all) { g.dispose(); for (const q of ribGeo) q.dispose(); g = all; } }
    wallMesh = new THREE.Mesh(g, wallMat); wallMesh.name = 'cut walls'; wallMesh.raycast = () => { }; wallMesh.frustumCulled = false; G.walls.add(wallMesh);
  }

  // ---- blood lying in the dependent part of the chest (haemothorax, or an opened chest): a level surface clipped to the cavity
  const Aic = rig.Ainv.chest.elements, cavIn = (x, y, z) => { const rx = Aic[0] * x + Aic[4] * y + Aic[8] * z + Aic[12], ry = Aic[1] * x + Aic[5] * y + Aic[9] * z + Aic[13], rz = Aic[2] * x + Aic[6] * y + Aic[10] * z + Aic[14]; return Math.max(cageSdf(rx, ry, rz) + RIBT + PLT, diaY(rx, rz, 0) + DIAT - ry) < -0.001; };
  const cb = new THREE.Box3(); for (const cx of [-0.15, 0.15]) for (const cy of [1.14, 1.5]) for (const cz of [-0.11, 0.12]) cb.expandByPoint(human.toRoot('chest', cx, cy, cz));
  const BX = 46, BZ = 60, bdx = (cb.max.x - cb.min.x) / BX, bdz = (cb.max.z - cb.min.z) / BZ; let cavY0 = null, bloodMesh = null, bloodLevel = -1;
  const setChestBlood = (hgt) => {
    if (hgt < 0.002 || !G.organs.visible) { if (bloodMesh) bloodMesh.visible = false; return; }
    if (bloodMesh && Math.abs(hgt - bloodLevel) < 0.002) { bloodMesh.visible = true; return; }
    if (cavY0 === null) { cavY0 = cb.max.y; for (let y = cb.min.y; y < cb.max.y && cavY0 === cb.max.y; y += 0.004) for (let i = 0; i < BX && cavY0 === cb.max.y; i += 2) for (let k = 0; k < BZ; k += 2) if (cavIn(cb.min.x + (i + 0.5) * bdx, y, cb.min.z + (k + 0.5) * bdz)) { cavY0 = y; break; } }
    const y = cavY0 + hgt, P = [], Ix = [];
    for (let i = 0; i < BX; i++) for (let k = 0; k < BZ; k++) { const x = cb.min.x + i * bdx, z = cb.min.z + k * bdz; if (!cavIn(x + bdx / 2, y - 0.002, z + bdz / 2)) continue; const b = P.length / 3; P.push(x, y, z, x + bdx, y, z, x + bdx, y, z + bdz, x, y, z + bdz); Ix.push(b, b + 2, b + 1, b, b + 3, b + 2); }
    if (bloodMesh) { bloodMesh.geometry.dispose(); G.organs.remove(bloodMesh); bloodMesh = null; }
    bloodLevel = hgt; if (!Ix.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.length).map((v, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(Ix);
    paint(g, [0.26, 0.008, 0.01], 7); bloodMesh = new THREE.Mesh(g, matBlood); bloodMesh.name = 'chest blood'; bloodMesh.raycast = () => { }; bloodMesh.frustumCulled = false; G.organs.add(bloodMesh);
  };
  const matBlood = tissueMaterial(an, { roughness: 0.06, clearcoat: 1, mode: 'BLOODM' });

  // ---- visibility and state
  const shown = { skeleton: false, organs: false, vessels: false, airway: false, muscles: false };
  let deep = false, xray = 0, phase = 0;
  const refresh = () => { for (const k in shown) G[k].visible = shown[k] || (deep && k !== 'muscles'); peri.visible = G.organs.visible && (xray < 0.01 || st.tamponade > 0.05); };
  human.openings.onChange = (set) => { deep = set.thor > 0.01 || set.list.some(o => o && o.depth > 0.012 && o.gape > 0.004); buildWalls(set); refresh(); };
  an.show = (o = {}) => { for (const k in shown) if (k in o) shown[k] = !!o[k]; refresh(); };
  an.setXray = (v) => { xray = clamp(v); uni.uXray.value = xray; human.setGhost(xray); refresh(); };
  an.update = (dt) => {
    phase += dt * Math.max(0, st.heartRate || 0) / 60; const ph = phase - Math.floor(phase), s = clamp(st.heartStrength ?? 1);
    uni.uBeat.value = st.fibrillating ? 0 : s * (Math.exp(-(((ph - 0.14) / 0.085) ** 2)) + 0.25 * Math.exp(-(((ph - 0.42) / 0.1) ** 2)));
    uni.uFib.value = st.fibrillating ? 1 : 0; uni.uTamp.value = clamp(st.tamponade);
    const inf = 1 + 0.075 * clamp(st.lungInflate); uni.uLungS.value.set((1 - 0.62 * clamp(Math.max(st.pneumoL, st.hemoL * 0.5))) * inf, (1 - 0.62 * clamp(Math.max(st.pneumoR, st.hemoR * 0.5))) * inf);
    uni.uPeriOpen.value = Math.max(clamp(st.pericardiumOpen), smooth(0.55, 1, human.openings.thor));
    setChestBlood((human.openings.thor > 0.3 ? 0.014 : 0) + 0.045 * clamp(Math.max(st.hemoL, st.hemoR)));
  };
  an.meshes = G; refresh();
}

