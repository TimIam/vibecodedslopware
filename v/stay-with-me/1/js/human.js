// The patient (and every other person): a procedurally generated human built from signed-distance primitives attached
// to a posed skeleton, meshed with surface nets, plus skin / hair / eye / clothing shading, wounds and bleeding.
//
// Frames. All shapes are authored in the REFERENCE frame: a 1.75 m adult male standing in the anatomical position,
// +X = patient's left, +Y = up, +Z = anterior, origin on the floor between the feet. Each bone carries an affine
// matrix A (reference -> root frame) that scales the reference shapes to this patient and poses them; its inverse is
// what anatomy.js uses to ask "where in the reference body is this point?". The root frame is Human.group's local frame
// (supine: head towards -Z, face up; upright poses: facing +Z; origin on the ground under the pelvis).
//
// Where things are tuned:
//   makeDims()    body proportions from sex / age / height / BMI / build, regional fat thickness
//   POSES         joint angles per pose
//   buildBody()   every primitive of the body (reference coordinates, metres)
//   REGIONS / buildHuman()  mesh resolutions and the seams between them
//   skinMaterial()  the skin shader (colour model, SSS approximation, clinical state, wounds)
//   GARMENTS / clothMaterial()  clothing shapes and fabrics

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SdfModel, meshSDFAsync, sdfNormal, sdfRaycast, sdEllipsoid, smin, OP_SUB, OP_INT, F_FAT_ONLY, F_DETAIL } from './sdf.js';
import { makeRng, clamp, lerp, smooth, noise3, fbm3 } from './util.js';
import { U, G as GFX } from './gfx.js';

const DEG = Math.PI / 180;
const MODE_TOP = 4, MODE_BOTTOM = 8, MODE_HOOD = 16, MODE_SKIRT = 32, MODE_BULK = 64;

// ---------------------------------------------------------------- reference anatomy shared with anatomy.js

export const BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', shoulderL: 'chest', elbowL: 'shoulderL', wristL: 'elbowL', shoulderR: 'chest', elbowR: 'shoulderR', wristR: 'elbowR', hipL: 'pelvis', kneeL: 'hipL', ankleL: 'kneeL', hipR: 'pelvis', kneeR: 'hipR', ankleR: 'kneeR' };
// Joint centres in the reference frame.
const JREF = { pelvis: [0, 0.935, 0], spine: [0, 1.08, -0.03], chest: [0, 1.25, -0.03], neck: [0, 1.468, -0.02], head: [0, 1.595, -0.012], shoulderL: [0.18, 1.41, -0.01], elbowL: [0.19, 1.085, -0.015], wristL: [0.19, 0.835, 0], hipL: [0.085, 0.935, 0], kneeL: [0.075, 0.5, 0.005], ankleL: [0.07, 0.085, -0.03] };
for (const n of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']) { const j = JREF[n + 'L']; JREF[n + 'R'] = [-j[0], j[1], j[2]]; }

// Landmarks of the reference body (metres). The rib cage is one ellipsoid; ribs are bands on it (ribY below).
export const REF = {
  joints: JREF,
  cage: { c: [0, 1.27, 0.008], r: [0.138, 0.235, 0.102] },
  notchY: 1.435, angleY: 1.387, xiphiY: 1.285, xiphoidTipY: 1.256, T1top: 1.48,
  mclX: 0.095,                         // mid-clavicular line
  eye: [0.031, 1.640, 0.0662], eyeR: 0.0124,
  larynx: { hyoidY: 1.518, promY: 1.497, ctmY0: 1.473, ctmY1: 1.4825, cricY0: 1.465, ringY0: 1.4605, ringPitch: 0.0055 },
  tibia: { c: [0.066, 0.295, 0.030], half: [0.0145, 0.165, 0.0125], round: 0.006, yaw: -40 * DEG, tubY: 0.452 },
  // superficial veins as polylines on the skin (x, y of the LEFT arm; z comes from the surface). side: +1 anterior, -1 dorsal
  veins: [
    { name: 'cephalic vein', bone: 'elbow', side: 1, r: 0.0021, pts: [[0.2135, 0.862], [0.2175, 0.95], [0.2155, 1.03], [0.2125, 1.085]] },
    { name: 'cephalic vein', bone: 'shoulder', side: 1, r: 0.0021, pts: [[0.2125, 1.085], [0.2135, 1.15], [0.212, 1.26]] },
    { name: 'basilic vein', bone: 'elbow', side: 1, r: 0.0023, pts: [[0.168, 0.90], [0.1655, 1.0], [0.169, 1.07], [0.1715, 1.10]] },
    { name: 'basilic vein', bone: 'shoulder', side: 1, r: 0.0023, pts: [[0.1715, 1.10], [0.172, 1.19]] },
    { name: 'median cubital vein', bone: 'elbow', side: 1, r: 0.0024, pts: [[0.2145, 1.04], [0.2, 1.064], [0.185, 1.085], [0.1725, 1.10]] },
    { name: 'median antebrachial vein', bone: 'elbow', side: 1, r: 0.0015, pts: [[0.19, 0.865], [0.189, 0.95], [0.193, 1.02], [0.2, 1.064]] },
    { name: 'dorsal metacarpal vein', bone: 'wrist', side: -1, r: 0.0014, pts: [[0.2045, 0.752], [0.2035, 0.795], [0.208, 0.832]] },
    { name: 'dorsal metacarpal vein', bone: 'wrist', side: -1, r: 0.0014, pts: [[0.186, 0.75], [0.187, 0.795], [0.193, 0.832]] },
    { name: 'dorsal metacarpal vein', bone: 'wrist', side: -1, r: 0.0013, pts: [[0.1705, 0.756], [0.172, 0.795], [0.179, 0.83]] },
    { name: 'dorsal venous arch', bone: 'wrist', side: -1, r: 0.0013, pts: [[0.1665, 0.802], [0.187, 0.806], [0.2075, 0.8]] },
  ],
};

// Rib k (1..12): height of the rib's centre line where the cage azimuth is u (0 = spine, 0.5 = mid-axillary, 1 = sternum).
// post = costovertebral joint height, drop = descent to the costochondral junction (ccj), rise = ascent of the cartilage
// back up to the sternum, end = where the rib (or its cartilage) stops.
const RIBS = [null,
  { post: 1.4705, drop: 0.0555, ccj: 0.90, rise: 0, end: 1 }, { post: 1.4511, drop: 0.067, ccj: 0.88, rise: 0.004, end: 1 },
  { post: 1.4309, drop: 0.079, ccj: 0.86, rise: 0.010, end: 1 }, { post: 1.4099, drop: 0.090, ccj: 0.84, rise: 0.018, end: 1 },
  { post: 1.388, drop: 0.100, ccj: 0.82, rise: 0.028, end: 1 }, { post: 1.3653, drop: 0.107, ccj: 0.80, rise: 0.040, end: 1 },
  { post: 1.3418, drop: 0.111, ccj: 0.77, rise: 0.055, end: 1 }, { post: 1.3175, drop: 0.118, ccj: 0.74, rise: 0.085, end: 0.86 },
  { post: 1.2924, drop: 0.125, ccj: 0.70, rise: 0.10, end: 0.80 }, { post: 1.2665, drop: 0.130, ccj: 0.66, rise: 0.11, end: 0.74 },
  { post: 1.2397, drop: 0.085, ccj: 0.52, rise: 0, end: 0.52 }, { post: 1.2121, drop: 0.045, ccj: 0.30, rise: 0, end: 0.30 }];
export function ribY(k, u) {
  const r = RIBS[k]; let y = r.post - r.drop * smooth(0.06, r.ccj, u);
  if (u > r.ccj && r.rise) { const t = (u - r.ccj) / (1 - r.ccj); y += r.rise * Math.pow(t, 1.8); }
  return y;
}
export const ribEnd = k => RIBS[k].end, ribCCJ = k => RIBS[k].ccj;
// Cage azimuth of a reference point (see ribY) and the point on the cage surface at (u, y).
export function cageU(x, z) { const c = REF.cage; return Math.atan2(Math.abs(x) / c.r[0], -(z - c.c[2]) / c.r[2]) / Math.PI; }
export function cagePoint(u, y, side = 1) {
  const c = REF.cage, f = Math.sqrt(Math.max(0, 1 - ((y - c.c[1]) / c.r[1]) ** 2)), a = u * Math.PI;
  return [side * c.r[0] * f * Math.sin(a), y, c.c[2] - c.r[2] * f * Math.cos(a)];
}
export const INLET = { p: [0, 1.4625, 0.005], n: [0, 0.945, 0.327] };
export function cageSdf(x, y, z) { const c = REF.cage, d = sdEllipsoid(x - c.c[0], y - c.c[1], z - c.c[2], c.r[0], c.r[1], c.r[2]), pl = (y - INLET.p[1]) * INLET.n[1] + (z - INLET.p[2]) * INLET.n[2]; return d > pl ? d : pl; }
function cageNormal(p) { const c = REF.cage; const n = [(p[0] - c.c[0]) / c.r[0] ** 2, (p[1] - c.c[1]) / c.r[1] ** 2, (p[2] - c.c[2]) / c.r[2] ** 2], l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; }
// Azimuth of the mid-clavicular line at height y.
export function mclU(y) { const c = REF.cage, f = Math.sqrt(Math.max(0.05, 1 - ((y - c.c[1]) / c.r[1]) ** 2)); return 1 - Math.asin(clamp(REF.mclX / (c.r[0] * f), 0, 1)) / Math.PI; }

// ---------------------------------------------------------------- body dimensions

// Subcutaneous fat at BMI 24 for an adult male, metres, by region.
const FAT24 = { chest: 0.0055, lat: 0.006, abd: 0.012, flank: 0.011, back: 0.0075, neck: 0.003, nape: 0.006, face: 0.0035, scalp: 0.003, clav: 0.0022, sternum: 0.0035, arm: 0.004, forearm: 0.0026, hand: 0.0012, thigh: 0.0085, knee: 0.003, shin: 0.0013, calf: 0.005, foot: 0.002, glute: 0.016, pubic: 0.009 };
const FEMALE_FAT = { chest: 1.25, thigh: 1.6, glute: 1.5, arm: 1.5, calf: 1.3, flank: 1.2, abd: 1.15 };

export function makeDims(spec) {
  const male = spec.sex !== 'f', age = clamp(spec.age ?? 35, 6, 95);
  const kid = 1 - smooth(8, 17, age), old = smooth(55, 90, age);
  const H = spec.heightM ?? (male ? 1.78 : 1.64) * lerp(1, 0.66, kid), s = H / 1.75;
  const bmi = clamp(spec.bmi ?? 24, 15.5, 48), build = clamp(spec.build ?? 0.4, 0, 1);
  const headS = (male ? 1 : 0.955) * (0.75 + 0.25 * s) * lerp(1, 0.97, kid);
  // split the height into legs / trunk / neck+head
  const rho = lerp(male ? 0.636 : 0.630, 0.60, kid);
  const trunk = (H - 0.22 * headS) / (1 / (1 - rho) + 0.112), legLen = trunk * rho / (1 - rho);
  const sy = trunk / 0.535;
  const frame = Math.pow(s, 0.85) * (male ? 1 : 0.92) * lerp(1, 0.93, kid);     // skeletal breadth
  const sx = frame, sz = frame * (male ? 1 : 0.97);
  const footS = s * (male ? 1 : 0.95) * lerp(1, 1.05, kid), legS = (legLen - 0.085 * footS) / 0.85;
  const armS = s * lerp(1, 0.96, kid), handS = s * (male ? 1 : 0.94) * lerp(1, 1.06, kid);
  const mus = (0.86 + 0.3 * build) * (male ? 1 : 0.9) * (1 - 0.13 * old) * lerp(1, 0.9, kid);    // muscle bulk multiplier
  const gl = frame * (0.94 + 0.08 * mus), ga = frame * (0.92 + 0.1 * mus);
  // fat: g = 1 at BMI 24; children carry the same fat at a lower BMI
  const g = Math.pow(Math.max(0.12, (bmi + kid * 6.5 - 14) / 10), 1.6);
  const skinT = 0.0021 * (1 - 0.25 * old) * lerp(1, 0.75, kid);
  const fat = {}, fatOnly = {};
  // the trunk below the ribs and the hips store fat fastest; chest wall, neck and limbs thicken more slowly
  const gSlow = Math.pow(g, 0.8), FAST = { flank: 1, glute: 1, pubic: 1, thigh: 1 };
  for (const k in FAT24) { fatOnly[k] = FAT24[k] * (FAST[k] ? g : gSlow) * (male ? 1 : (FEMALE_FAT[k] || 1.3)) * Math.sqrt(s); fat[k] = fatOnly[k] + skinT * (k === 'back' || k === 'nape' ? 1.4 : k === 'neck' || k === 'forearm' ? 0.75 : 1); }
  fat.scalp = fatOnly.scalp = 0.003 + skinT; fat.hand = 0.0012 * Math.sqrt(g) + skinT * 0.7; fat.foot = 0.002 * Math.sqrt(g) + skinT;
  const visc = Math.max(0, bmi - 22) * (male ? 0.0021 : 0.0013) * s;     // visceral fat pushes the abdominal wall out
  const hipW = sx * (male ? 1 : 1.1);
  // joint centres of this patient in the standing (rest) frame
  const J = {}, tr = p => [sx * p[0], legLen + sy * (p[1] - 0.935), sz * p[2]];
  for (const n of ['pelvis', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR']) J[n] = tr(JREF[n]);
  for (const sd of ['L', 'R']) {
    const m = sd === 'L' ? 1 : -1, d = (a, b, sc) => [(JREF[a][0] - JREF[b][0]) * sc[0], (JREF[a][1] - JREF[b][1]) * sc[1], (JREF[a][2] - JREF[b][2]) * sc[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    J['elbow' + sd] = add(J['shoulder' + sd], d('elbow' + sd, 'shoulder' + sd, [ga, armS, ga]));
    J['wrist' + sd] = add(J['elbow' + sd], d('wrist' + sd, 'elbow' + sd, [ga, armS, ga]));
    J['hip' + sd] = [m * 0.085 * hipW, legLen, 0];
    J['knee' + sd] = add(J['hip' + sd], d('knee' + sd, 'hip' + sd, [gl, legS, gl]));
    J['ankle' + sd] = add(J['knee' + sd], d('ankle' + sd, 'knee' + sd, [gl, legS, gl]));
  }
  // per-bone scale of reference shapes about the joint, and the radius scale for round primitives
  const S = {}, rs = {};
  for (const n of ['pelvis', 'spine', 'chest', 'neck']) { S[n] = [sx, sy, sz]; rs[n] = Math.sqrt(sx * sz); }
  S.head = [headS, headS, headS]; rs.head = headS;
  for (const sd of ['L', 'R']) {
    S['shoulder' + sd] = S['elbow' + sd] = [ga, armS, ga]; rs['shoulder' + sd] = rs['elbow' + sd] = ga;
    S['wrist' + sd] = [handS, handS, handS]; rs['wrist' + sd] = handS;
    S['hip' + sd] = S['knee' + sd] = [gl, legS, gl]; rs['hip' + sd] = rs['knee' + sd] = gl;
    S['ankle' + sd] = [footS, footS, footS]; rs['ankle' + sd] = footS;
  }
  return { male, age, kid, old, H, s, bmi, build, headS, sx, sy, sz, legLen, legS, armS, handS, footS, gl, ga, mus, g, fat, fatOnly, skinT, visc, hipW, J, S, rs, fem: male ? 0 : 1 };
}

// ---------------------------------------------------------------- skeleton and poses

// Euler XYZ degrees per bone, relative to the standing rest pose. root = rotations applied to the whole body, in order.
// Signs: X+ tips a segment's far end backwards (knee flexion +, hip/elbow flexion -), Z+ abducts the LEFT limb.
const sym = (o) => { const r = {}; for (const k in o) { const v = o[k]; r[k + 'L'] = v; r[k + 'R'] = [v[0], -v[1], -v[2]]; } return r; };
const POSES = {
  supine: { root: [['x', -90]], curl: 0.7, b: { ...sym({ shoulder: [0, 0, 13], elbow: [-9, 0, 0], hip: [0, 11, 5], ankle: [30, 0, 0] }) } },
  standing: { root: [], curl: 0.8, b: { ...sym({ shoulder: [2, 0, 7], elbow: [-10, -78, 0], hip: [0, 6, 2.5] }) } },
  sitting: { root: [], curl: 0.6, seat: true, b: { ...sym({ shoulder: [-15, 0, 12], elbow: [-50, -18, 0], hip: [-88, 4, 5], knee: [88, 0, 0] }), neck: [4, 0, 0] } },
  semi: { root: [['x', -45]], curl: 0.7, b: { ...sym({ shoulder: [6, 0, 13], elbow: [-22, -8, 0], hip: [-45, 9, 5], ankle: [24, 0, 0] }), neck: [8, 0, 0], head: [6, 0, 0] } },
  recovery: { root: [['x', -90], ['z', -90]], curl: 0.8, b: { shoulderL: [-78, 0, 6], elbowL: [-35, 0, 0], shoulderR: [-62, 0, 8], elbowR: [-92, 0, 0], hipL: [-6, 0, 2], kneeL: [10, 0, 0], hipR: [-74, 0, 4], kneeR: [86, 0, 0], ankleL: [25, 0, 0], ankleR: [20, 0, 0], neck: [-8, 0, 0], head: [-6, 10, 0], spine: [4, 6, 0], chest: [4, 8, 0] } },
  // kneeling at the patient's side doing compressions: hips over the knees, arms straight, heels of the hands on the sternum
  kneeling: { root: [['x', 36]], curl: 0.25, b: { ...sym({ hip: [-21, 0, 4], knee: [75, 0, 0], ankle: [80, 0, 0], shoulder: [-67, 0, -15], elbow: [-2, 180, 0], wrist: [-72, 0, 0] }), spine: [5, 0, 0], chest: [5, 0, 0], neck: [8, 0, 0], head: [8, 0, 0] } },
  // collapsed forwards and to one side in a seat: the trunk leans as one piece (the anatomy stays continuous), the head hangs
  slumped: { root: [['x', 30], ['z', 9]], curl: 0.9, seat: true, b: { ...sym({ hip: [-114, 5, 7], knee: [80, 0, 0] }), shoulderL: [-24, 0, 12], shoulderR: [-18, 0, -11], elbowL: [-30, -15, 0], elbowR: [-24, 15, 0], neck: [26, 0, 8], head: [18, 6, 6] } },
};

function makeRig(dims, poseName, gaze) {
  let pose = POSES[poseName] || POSES.supine;
  if (gaze === 'down') pose = { ...pose, b: { ...pose.b, neck: [(pose.b.neck?.[0] || 0) + 17, 0, 0], head: [(pose.b.head?.[0] || 0) + 15, 0, 0] } };
  const J = dims.J, root = new THREE.Group(); root.name = 'rig';
  const bones = {};
  for (const n of BONES) { const b = bones[n] = new THREE.Object3D(); b.name = n; }
  for (const n of BONES) {
    const p = PARENT[n], b = bones[n];
    if (p) { bones[p].add(b); b.position.set(J[n][0] - J[p][0], J[n][1] - J[p][1], J[n][2] - J[p][2]); } else root.add(b);
    const r = pose.b?.[n]; if (r) b.rotation.set(r[0] * DEG, r[1] * DEG, (r[2] + (n.startsWith('shoulder') && poseName !== 'standing' && poseName !== 'kneeling' ? (n.endsWith('L') ? 1 : -1) * clamp((dims.g - 1) * 9, 0, 30) : 0)) * DEG, 'XYZ');
  }
  const q = new THREE.Quaternion(), ax = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, t = new THREE.Quaternion();
  for (const [a, deg] of pose.root) q.premultiply(t.setFromAxisAngle(ax[a], deg * DEG));
  bones.pelvis.quaternion.premultiply(q);
  const rig = { dims, pose, poseName, root, bones, A: {}, Ainv: {}, model: null, fields: null };
  rig.place = (y) => {
    bones.pelvis.position.set(0, y, 0); root.updateMatrixWorld(true);
    const sc = new THREE.Matrix4(), tr = new THREE.Matrix4();
    for (const n of BONES) { const S = dims.S[n], jr = JREF[n]; rig.A[n] = bones[n].matrixWorld.clone().multiply(sc.makeScale(S[0], S[1], S[2])).multiply(tr.makeTranslation(-jr[0], -jr[1], -jr[2])); rig.Ainv[n] = rig.A[n].clone().invert(); }
  };
  rig.place(0);
  return rig;
}

// ---------------------------------------------------------------- the body as primitives

const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _eu = new THREE.Euler(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
function eulerFromBasis(x, y, z) { _mA.makeBasis(_va.fromArray(x), _vb.fromArray(y), _vc.fromArray(z)); _eu.setFromRotationMatrix(_mA, 'XYZ'); return [_eu.x, _eu.y, _eu.z]; }

// Hairline: height of the hair margin (reference y) around the head, by azimuth a (0 = front, PI = nape).
const HAIRLINE = [[0, 1.709], [0.5, 1.706], [0.85, 1.692], [1.12, 1.655], [1.3, 1.63], [1.52, 1.655], [1.9, 1.628], [2.3, 1.585], [Math.PI, 1.566]];
function hairField(x, y, z, style) {
  const a = Math.atan2(Math.abs(x), z + 0.012); let yl = HAIRLINE[HAIRLINE.length - 1][1];
  for (let i = 1; i < HAIRLINE.length; i++) if (a <= HAIRLINE[i][0]) { const p = HAIRLINE[i - 1], q = HAIRLINE[i], t = smooth(p[0], q[0], a); yl = lerp(p[1], q[1], t); break; }
  let f = y - yl;
  if (style === 'balding') f = Math.min(f, 1.7 + 0.03 * (1 - Math.cos(a)) * 0.5 - y);
  return f;
}

const GARMENT_BOTTOM = {
  jeans: { t: 0.004, cuff: 0.105, fabric: 2, bulk: 0.35 }, trousers: { t: 0.0035, cuff: 0.1, fabric: 1, bulk: 0.8 }, shorts: { t: 0.0035, cuff: 0.6, fabric: 1, bulk: 0.9 },
  skirt: { t: 0.003, cuff: 0.56, fabric: 1, skirt: true, bulk: 0 }, uniform: { t: 0.004, cuff: 0.1, fabric: 6, bulk: 0.8, piping: true },
};
const GARMENT_TOP = {
  tshirt: { t: 0.0035, sleeve: 1.2, hem: 0.925, neckR: 0.079, fabric: 0, bulk: 0.25 }, shirt: { t: 0.0035, sleeve: 0, hem: 0.905, neckR: 0.068, fabric: 1, bulk: 0.45, placket: 1, collar: 1 },
  hoodie: { t: 0.008, sleeve: 0, hem: 0.915, neckR: 0.076, fabric: 3, bulk: 1, hood: true, cuffs: true }, blouse: { t: 0.003, sleeve: 0, hem: 0.925, neckR: 0.082, fabric: 5, bulk: 0.3, vneck: true },
  gown: { t: 0.003, sleeve: 1.18, hem: 0.57, neckR: 0.08, fabric: 4, bulk: 0.7, gown: true }, uniform: { t: 0.004, sleeve: 0, hem: 0.905, neckR: 0.068, fabric: 6, bulk: 0.5, placket: 1, collar: 1, piping: true },
  jacket: { t: 0.011, sleeve: 0, hem: 0.9, neckR: 0.07, fabric: 7, bulk: 1, placket: 2, collar: 1 },
};

// Builds the SdfModel of the whole body in the root frame. feat carries surface-attached details found on a first pass
// (navel, nipples). Returns { model, fields } where fields are small models used only to paint masks (lips, nails ...).
function buildBody(rig, spec, feat) {
  const D = rig.dims, F = D.fat, mu = D.mus, A = rig.A, m = new SdfModel(), fem = D.fem, kid = D.kid, old = D.old;
  const rng = makeRng((spec.seed ?? 1) * 7919 + 13), vr = a => 1 + (rng() - 0.5) * 2 * a;
  const fields = { lip: new SdfModel(), nail: new SdfModel(), eye: new SdfModel(), brow: new SdfModel() };
  const grp = (name, bone, part, side, o = {}) => { const g = m.group({ name, tag: BI[bone], matrix: A[bone], rScale: D.rs[bone], ...o }); g.part = part; g.side = side; g.bone = bone; return g; };
  const fgrp = (model, bone) => model.group({ matrix: A[bone], rScale: D.rs[bone], pk: 0 });
  const bf = D.g;                                   // fat factor (1 at BMI 24)
  const thin = clamp(1 - D.fatOnly.lat / 0.0065);   // 1 = ribs show
  const cl = spec.clothing || {};

  // ---- pelvis
  const pelvis = grp('pelvis', 'pelvis', 'pelvis', 0, { pk: 0.04, fat: F.flank });
  const hw = D.hipW / D.sx;
  pelvis.ellipsoid(0, 0.975, -0.008, 0.156 * hw, 0.105, 0.097, null, { k: 0 });
  for (const s of [1, -1]) {
    pelvis.ellipsoid(s * 0.082 * hw, 0.925, -0.066, 0.085, 0.10, 0.07 * (0.8 + 0.2 * mu), null, { fat: F.glute, k: 0.035 });
    pelvis.sphere(s * 0.115 * hw, 1.0, 0.068, 0.015, { fat: F.clav * 1.6, k: 0.03 });          // ASIS
    pelvis.ellipsoid(s * 0.13 * hw, 1.045, -0.02, 0.022, 0.03, 0.06, null, { fat: F.flank, k: 0.04 });   // iliac crest
  }
  pelvis.ellipsoid(0, 0.9, 0.062, 0.05, 0.04, 0.032, null, { fat: F.pubic, k: 0.04 });
  pelvis.ellipsoid(0, 0.865, 0.012, 0.042, 0.035, 0.065, null, { fat: F.pubic * 0.5, k: 0.03 });
  if (!fem) pelvis.ellipsoid(0, 0.872, 0.074, 0.036, 0.034, 0.026, null, { fat: 0.003, k: 0.03 });
  if (GARMENT_BOTTOM[cl.bottom]?.skirt || GARMENT_TOP[cl.top]?.gown) pelvis.cone(0, 0.98, -0.005, 0.165 * hw, 0, 0.6, 0.0, 0.2 * hw, { flags: MODE_SKIRT, k: 0.02, fat: 0 });

  // ---- lumbar / abdomen
  const spine = grp('spine', 'spine', 'spine', 0, { parent: pelvis, k: 0.06, pk: 0.05, fat: F.abd });
  const vs = D.visc / D.sz;
  spine.ellipsoid(0, 1.09, 0.012 + vs * 0.5, 0.142 + vs * 0.35, 0.205, 0.098 + vs * 0.55, null, { k: 0 });
  for (const s of [1, -1]) {
    spine.ellipsoid(s * 0.112, 1.085, -0.012, 0.036, 0.10, 0.068, null, { fat: F.flank });
    spine.cone(s * 0.036, 1.23, -0.07, 0.034 * mu, s * 0.036, 1.02, -0.068, 0.036 * mu, { fat: F.back, k: 0.03 });
    if (bf > 1.25) spine.ellipsoid(s * 0.135, 1.03, -0.015, 0.03, 0.06, 0.07, null, { fat: F.flank * 1.3, flags: F_FAT_ONLY, k: 0.05 });
    spine.ellipsoid(s * 0.12, 1.1, 0.0, 0.045, 0.14, 0.085, null, { flags: MODE_TOP | MODE_BULK, k: 0.05, fat: 0 });   // shirts hang from chest to hip
  }
  if (bf > 1.2) spine.ellipsoid(0, 1.025, 0.07 + vs, 0.11, 0.085, 0.045, null, { fat: FAT24.abd * bf * 1.3 * (fem ? 1.15 : 1) + D.skinT, flags: F_FAT_ONLY, k: 0.07 });
  if (feat) spine.ellipsoid(0, feat.navel[1], feat.navel[2] + 0.002, 0.0075, 0.009, 0.011, null, { op: OP_SUB, k: 0.008, flags: F_DETAIL });
  if (mu > 1.02 && bf < 1.15) spine.cone(0, 1.26, 0.118, 0.004, 0, 1.08, 0.118, 0.004, { op: OP_SUB, k: 0.02, flags: F_DETAIL });   // linea alba on the lean and muscular

  // ---- chest
  const cg = REF.cage;
  const ribPost = thin > 0.02 ? (x, y, z, d) => {
    if (d > 0.02 || d < -0.02) return d;
    const e = rig.Ainv.chest.elements, rx = e[0] * x + e[4] * y + e[8] * z + e[12], ry = e[1] * x + e[5] * y + e[9] * z + e[13], rz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (ry > 1.37 || ry < 1.12) return d;
    const u = cageU(rx, rz); if (u < 0.3) return d;
    let b = 0; for (let k = 5; k <= 10; k++) { if (u > RIBS[k].end) continue; const dy = (ry - ribY(k, u)) / 0.0065; if (dy > -2.5 && dy < 2.5) b += Math.exp(-dy * dy); }
    return d - 0.0021 * thin * b * smooth(0.3, 0.45, u) * (1 - smooth(0.86, 0.97, u)) * (1 - smooth(1.33, 1.37, ry + (u - 0.5) * 0.1));
  } : null;
  const chest = grp('chest', 'chest', 'chest', 0, { parent: spine, k: 0.045, pk: 0.035, fat: F.lat, post: ribPost });
  chest.ellipsoid(cg.c[0], cg.c[1], cg.c[2] - 0.0015, cg.r[0] + 0.006, cg.r[1] + 0.004, cg.r[2] + 0.003, null, { k: 0 });
  chest.plane(INLET.p[0], INLET.p[1] + 0.006, INLET.p[2], INLET.n[0], INLET.n[1], INLET.n[2], { op: OP_INT, k: 0.04 });
  const pecT = 0.0165 * (0.72 + 0.28 * mu);
  for (const s of [1, -1]) {
    chest.ellipsoid(s * 0.091, 1.372, 0.066, 0.078, 0.064, pecT, [0.22, s * 0.42, s * 0.12], { fat: F.chest, k: 0.03 });
    chest.cone(s * 0.045, 1.495, -0.036, 0.04 * (0.85 + 0.15 * mu), s * 0.165, 1.45, -0.02, 0.036, { fat: F.back * 0.7, k: 0.045 });            // trapezius / shoulder girdle
    chest.ellipsoid(s * 0.095, 1.36, -0.078, 0.07, 0.092, 0.028 * mu, [0, s * -0.3, 0], { fat: F.back, k: 0.04 });   // scapular mass
    chest.cone(s * 0.034, 1.445, -0.068, 0.03 * mu, s * 0.036, 1.2, -0.074, 0.033 * mu, { fat: F.back, k: 0.03 });     // erector spinae
    chest.ellipsoid(s * 0.124, 1.3, -0.034, 0.024 * mu, 0.115, 0.058, null, { fat: F.lat, k: 0.04 });                    // latissimus edge
    chest.bezier([s * 0.022, 1.443, 0.0715], [s * 0.1, 1.459, 0.09], [s * 0.182, 1.457, 0.008], 0.0088, 0.0082, 7, { fat: F.clav, k: 0.011 });   // clavicle
    if (fem && !kid) { const b = 0.85 + 0.2 * Math.min(bf, 2.2); chest.ellipsoid(s * 0.083, 1.318, 0.094, 0.057 * b, 0.054 * b, 0.036 * b, [0.2, s * 0.25, 0], { fat: F.chest, flags: F_FAT_ONLY, k: 0.03 }); }
    else if (bf > 2.2) chest.ellipsoid(s * 0.088, 1.325, 0.08, 0.06, 0.045, 0.003 * (bf - 2.2), null, { fat: F.chest, flags: F_FAT_ONLY, k: 0.03 });
    if (feat && !fem) chest.sphere(s * feat.nipple[0], feat.nipple[1], feat.nipple[2] - 0.0012, 0.0036, { k: 0.003, fat: 0, flags: F_DETAIL });
  }
  chest.sphere(0, 1.449, 0.086, 0.0145, { op: OP_SUB, k: 0.014 });                                   // suprasternal notch
  chest.ellipsoid(0, 1.5, -0.085, 0.09, 0.075, 0.05, null, { flags: MODE_HOOD, k: 0.03, fat: 0 });   // hood lying behind the neck

  // ---- neck
  const nk = (fem ? 0.86 : 1) * (0.94 + 0.06 * mu) * lerp(1, 0.9, kid);
  const neck = grp('neck', 'neck', 'neck', 0, { parent: chest, k: 0.035, pk: 0.02, fat: F.neck });
  neck.cone(0, 1.452, -0.018, 0.058 * nk, 0, 1.585, -0.012, 0.053 * nk, { k: 0, fat: F.neck });
  neck.cone(0, 1.47, -0.035, 0.05 * nk, 0, 1.59, -0.03, 0.05 * nk, { fat: F.nape });
  for (const s of [1, -1]) neck.bezier([s * 0.064, 1.6, -0.03], [s * 0.056, 1.525, 0.012], [s * 0.019, 1.447, 0.058], 0.0125 * mu, 0.008, 6, { k: 0.016 });   // sternocleidomastoid
  if (!fem && !kid) neck.ellipsoid(0, REF.larynx.promY - 0.004, 0.0385, 0.012, 0.016, 0.011, [0.3, 0, 0], { k: 0.018, fat: F.neck });   // laryngeal prominence
  else neck.ellipsoid(0, REF.larynx.promY - 0.006, 0.034, 0.012, 0.016, 0.01, null, { k: 0.02, fat: F.neck });
  if (bf > 1.3) neck.ellipsoid(0, 1.535, 0.03, 0.045, 0.022, 0.035, null, { flags: F_FAT_ONLY, fat: F.neck * 1.5, k: 0.03 });   // submental fat

  // ---- head. Big soft masses first (cranium, forehead, the tapering face, jaw), then the small crisp features.
  const head = grp('head', 'head', 'head', 0, { parent: neck, k: 0.012, pk: 0.02, fat: F.scalp });
  // face shapes are authored at their BMI-24 skin surface: cf is only the departure from that
  const jw = (fem ? 0.9 : 1) * vr(0.05) * lerp(1, 0.92, kid), nw = (fem ? 0.9 : 1) * vr(0.1), lf = (fem ? 1.2 : 1) * vr(0.15), cf = (F.face - 0.0056) * 0.6, bz = fem ? 0.55 : 1;
  const E = REF.eye, eyeX = E[0];
  head.ellipsoid(0, 1.665, -0.012, 0.0725, 0.086, 0.098, null, { k: 0 });
  head.ellipsoid(0, 1.686, 0.03, 0.062, 0.055, 0.057, null, { fat: F.scalp * 0.8, k: 0.03 });
  head.cone(0, 1.63, 0.02, 0.0575, 0, 1.566, 0.05, 0.0305 * (0.7 + 0.3 * jw), { fat: cf, k: 0.035 });           // the face, tapering to the mouth
  head.ellipsoid(0, 1.5525 + 0.004 * kid, 0.0705 - 0.004 * fem, 0.02 * jw, 0.019, 0.019, null, { fat: cf * 0.7, k: 0.018 });   // chin
  head.ellipsoid(0, 1.56, 0.03, 0.03, 0.018, 0.04, null, { fat: cf, k: 0.02 });                                           // floor of mouth
  for (const s of [1, -1]) {
    head.bezier([s * 0.011, 1.549, 0.067], [s * 0.033 * jw, 1.551, 0.046], [s * 0.04 * jw, 1.577, 0.002], 0.012, 0.0108, 5, { fat: cf * 0.8, k: 0.014 });   // mandible
    head.cone(s * 0.04 * jw, 1.577, 0.002, 0.0108, s * 0.053, 1.626, -0.008, 0.0105, { fat: cf, k: 0.018 });
    head.ellipsoid(s * 0.0455, 1.622, 0.05, 0.016, 0.011, 0.022, null, { fat: cf * 0.7, k: 0.026 });                      // zygoma
    head.ellipsoid(s * 0.033, 1.6, 0.047, 0.0155, 0.024, 0.022, null, { fat: cf * 1.1, k: 0.03 });                        // cheek
    head.ellipsoid(s * 0.028, 1.6615, 0.0785, 0.028, 0.0095, 0.013 * (0.75 + 0.25 * bz), [0, 0, s * 0.1], { fat: 0, k: 0.018 });   // brow ridge
    if (old > 0.3 || bf > 1.4) head.ellipsoid(s * 0.034, 1.558, 0.046, 0.013, 0.012, 0.02, null, { flags: F_FAT_ONLY, fat: Math.max(0.0005, cf * (0.5 + 0.6 * old) + 0.0028 * old), k: 0.02 });   // jowl
  }
  head.sphere(0, 1.659, 0.0785, 0.0115, { fat: 0, k: 0.02 });
  // eyes: carve the orbit, lay the lids over the globe; the palpebral fissure is cut by head.post (see eyeFis)
  // Palpebral fissure: metres inside the eye opening (> 0) for a root-frame point, in angular coordinates on the lid sphere.
  const AiH = rig.Ainv.head, hs = D.headS;
  const eyeFis = rig.eyeFis = (x, y, z) => {
    const e = AiH.elements, rx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13] - E[1], lz = e[2] * x + e[6] * y + e[10] * z + e[14] - E[2];
    const s = rx > 0 ? 1 : -1, lx = (rx - s * eyeX) * s, r = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (r > 0.024 || lz < 0.002) return -0.01;
    const az = Math.atan2(lx, lz), t = az / (az > 0 ? 1.24 : 1.15); if (t <= -1 || t >= 1) return -0.004;
    const sh = Math.pow(1 - t * t, 0.6), el = Math.asin(clamp(ly / r, -1, 1)) - 0.07 * az;
    const fu = (0.38 * sh - el) * r, fl = (el + 0.24 * sh) * r; eyeFis.up = fu < fl;
    return Math.min(fu, fl, r - 0.0105, 0.0153 - r);
  };
  head.post = (x, y, z, d) => {
    if (d > 0.01 || d < -0.03) return d;
    const f = eyeFis(x, y, z); if (f < -0.0045) return d;
    // upper lid crease just above the opening, then the opening itself
    if (f < 0) d += eyeFis.up ? 0.0011 * Math.exp(-(((f + 0.003) / 0.0009) ** 2)) : 0.0005 * (1 + old) * Math.exp(-(((f + 0.0042) / 0.0013) ** 2));
    return -smin(-d, -f * hs, 0.0008);
  };
  for (const s of [1, -1]) {
    head.ellipsoid(s * (eyeX + 0.001), E[1] + 0.001, 0.0865, 0.019, 0.0112, 0.014, null, { op: OP_SUB, k: 0.014 });
    head.sphere(s * eyeX, E[1], E[2], 0.0143, { k: 0.0042, fat: 0 });
    if (old > 0.25) head.ellipsoid(s * eyeX, E[1] - 0.0135, 0.0775, 0.011, 0.0035, 0.0035, null, { k: 0.006, fat: 0.0006 + 0.0016 * old });   // lower lid bag
  }
  // nose
  head.cone(0, 1.65, 0.0805, 0.0062 * nw, 0, 1.613, 0.1035, 0.0068 * nw, { fat: 0.0008, k: 0.01 });
  head.sphere(0, 1.6035, 0.1105, 0.0092 * nw, { fat: 0.0008, k: 0.007 });
  head.cone(0, 1.5985, 0.108, 0.0046, 0, 1.5935, 0.095, 0.005, { fat: 0.0008, k: 0.005 });
  for (const s of [1, -1]) head.ellipsoid(s * 0.0108 * nw, 1.5988, 0.0975, 0.0058, 0.0066, 0.009, [0, s * 0.35, 0], { fat: 0.0008, k: 0.005 });
  // lips on the muzzle
  const fl = fgrp(fields.lip, 'head');
  head.ellipsoid(0, 1.582, 0.0785, 0.027, 0.017, 0.0155, null, { fat: cf * 0.5, k: 0.02 });
  const lipU = [0, 1.5752, 0.0885, 0.0232, 0.0046 * lf, 0.0068], lipL = [0, 1.5666, 0.0878, 0.02, 0.006 * lf, 0.0084];
  rig.lipH = [0.0074 * lf, 0.0098 * lf]; rig.nw = nw; rig.mouthY = 1.5709 + 0.0007 * (lf - 1) + 0.0004;
  head.ellipsoid(...lipU, null, { fat: 0.001, k: 0.004 }); fl.ellipsoid(...lipU, null, { fat: 0.001 });
  head.ellipsoid(...lipL, null, { fat: 0.001, k: 0.002 }); fl.ellipsoid(...lipL, null, { fat: 0.001 });
  for (const s of [1, -1]) {
    head.ellipsoid(s * 0.0066 * nw, 1.5926, 0.0995, 0.0038, 0.0033, 0.0064, [0.6, s * 0.3, 0], { op: OP_SUB, k: 0.0024 });   // nostril
    head.bezier([s * 0.0165, 1.598, 0.09], [s * 0.0265, 1.585, 0.084], [s * 0.0295, 1.566, 0.0765], 0.0009 + 0.002 * old + 0.0005 * clamp(bf - 1), 0.0008, 5, { op: OP_SUB, k: 0.006 });   // nasolabial fold
  }
  head.cone(0, 1.5915, 0.0975, 0.0022, 0, 1.581, 0.0975, 0.003, { op: OP_SUB, k: 0.0045 });                               // philtrum
  head.cone(-0.01, 1.558, 0.0915, 0.005, 0.01, 1.558, 0.0915, 0.005, { op: OP_SUB, k: 0.009 });                           // mentolabial sulcus
  const fb = fgrp(fields.brow, 'head');
  for (const s of [1, -1]) fb.ellipsoid(s * 0.031, 1.6625, 0.087, 0.0245, 0.0043, 0.03, [0, 0, s * 0.14]);
  // ears
  for (const s of [1, -1]) {
    const M = new THREE.Matrix4().makeTranslation(0.0775, 1.632, -0.014).multiply(_mB.makeRotationY(-27 * DEG));
    if (s < 0) M.premultiply(_mB.makeScale(-1, 1, 1));
    M.premultiply(A.head);
    const ear = m.group({ name: 'ear', tag: BI.head, matrix: M, rScale: D.headS, parent: head, k: 0.005, pk: 0.003, fat: 0.0012 }); ear.part = 'ear'; ear.side = s; ear.bone = 'head';
    ear.ellipsoid(0.001, 0, -0.004, 0.003, 0.03, 0.016, null, { k: 0 });
    ear.ellipsoid(-0.004, -0.002, 0.007, 0.008, 0.02, 0.008, null, { k: 0.004 });
    const hp = a => [0.0036, 0.0285 * Math.cos(a), -0.0035 - 0.0155 * Math.sin(a)];
    for (let i = 0; i < 11; i++) { const a0 = (-52 + i * 19.5) * DEG, a1 = (-52 + (i + 1) * 19.5) * DEG, p = hp(a0), q = hp(a1); ear.cone(p[0], p[1], p[2], 0.003 - 0.0008 * (i / 11), q[0], q[1], q[2], 0.003 - 0.0008 * ((i + 1) / 11), { k: 0.0025 }); }
    const ap = a => [0.0042, 0.016 * Math.cos(a) - 0.003, -0.003 - 0.0085 * Math.sin(a)];
    for (let i = 0; i < 6; i++) { const p = ap((15 + i * 22) * DEG), q = ap((37 + i * 22) * DEG); ear.cone(p[0], p[1], p[2], 0.0021, q[0], q[1], q[2], 0.0021, { k: 0.0025 }); }
    ear.ellipsoid(0.0058, -0.0045, 0.002, 0.005, 0.0088, 0.0058, null, { op: OP_SUB, k: 0.003 });
    ear.ellipsoid(0.001, -0.027, 0.0012, 0.004, 0.0088, 0.0072, null, { k: 0.004 });
    ear.sphere(0.0028, -0.005, 0.0108, 0.0038, { k: 0.003 });
  }

  // ---- arms
  rig.tips = {}; rig.knuckles = [];
  const nail = (bone, rs, args, rot) => { const g = fields.nail.group({ matrix: A[bone], rScale: rs, pk: 0 }); g.ellipsoid(args[0], args[1], args[2], args[3], args[4], args[5] + 0.0005, rot, { fat: 0.0006 }); };
  for (const s of [1, -1]) {
    const sd = s > 0 ? 'L' : 'R', X = x => s * x;
    const ua = grp('upperArm' + sd, 'shoulder' + sd, 'upperArm', s, { parent: chest, k: 0.04, joint: [X(0.18), 1.41, -0.01], jr0: 0.1, jr1: 0.2, pk: 0.03, fat: F.arm });
    ua.ellipsoid(X(0.198), 1.385, -0.01, 0.047 * mu, 0.078, 0.052 * mu, [0, 0, s * 0.15], { k: 0 });                         // deltoid
    ua.cone(X(0.19), 1.34, 0.011, 0.035 * mu, X(0.19), 1.14, 0.007, 0.03 * mu, {});                                           // biceps
    ua.cone(X(0.19), 1.36, -0.03, 0.035 * mu, X(0.19), 1.12, -0.03, 0.028 * mu, {});                                          // triceps
    ua.cone(X(0.19), 1.3, -0.01, 0.045, X(0.19), 1.12, -0.012, 0.042, { flags: MODE_TOP | MODE_BULK, fat: 0 });
    const fa = grp('forearm' + sd, 'elbow' + sd, 'forearm', s, { parent: ua, k: 0.025, joint: [X(0.19), 1.085, -0.015], jr0: 0.07, jr1: 0.14, pk: 0.022, fat: F.forearm });
    fa.ellipsoid(X(0.19), 1.085, -0.014, 0.036, 0.032, 0.029, null, { k: 0 });
    fa.sphere(X(0.19), 1.082, -0.036, 0.0155, { fat: F.forearm * 0.6, k: 0.015 });                                            // olecranon
    fa.cone(X(0.204), 1.07, -0.004, 0.03 * mu, X(0.204), 0.93, 0, 0.021, {});                                                 // extensors / brachioradialis
    fa.cone(X(0.177), 1.065, 0.0, 0.03 * mu, X(0.18), 0.93, 0.002, 0.021, {});                                                // flexors
    fa.cone(X(0.191), 0.95, 0, 0.026, X(0.19), 0.85, 0, 0.0195, {});
    fa.ellipsoid(X(0.19), 0.84, 0, 0.0285, 0.022, 0.019, null, {});                                                           // wrist
    fa.sphere(X(0.168), 0.846, -0.012, 0.0085, { k: 0.01, fat: F.hand });                                                     // ulnar styloid
    fa.cone(X(0.19), 1.06, -0.005, 0.043, X(0.19), 0.86, 0, 0.032, { flags: MODE_TOP | MODE_BULK, fat: 0 });
    const palm = grp('palm' + sd, 'wrist' + sd, 'palm', s, { parent: fa, k: 0.016, joint: [X(0.19), 0.835, 0], jr0: 0.03, jr1: 0.07, pk: 0.009, fat: F.hand });
    palm.box(X(0.19), 0.787, 0, 0.04, 0.047, 0.0125, 0.0115, null, { k: 0 });
    palm.ellipsoid(X(0.216), 0.8, 0.012, 0.019, 0.03, 0.0135, [0, 0, s * -0.3], {});                                          // thenar
    palm.ellipsoid(X(0.162), 0.79, 0.0105, 0.014, 0.032, 0.012, null, {});                                                    // hypothenar
    palm.ellipsoid(X(0.19), 0.782, 0.023, 0.02, 0.026, 0.008, null, { op: OP_SUB, k: 0.012 });
    // fingers: [mcp x (left), y, z, length, radius, spread deg]
    const fr = F.hand / D.handS, FG = [[0.2175, 0.7425, 0, 0.073, 0.0086 - fr, 7], [0.1975, 0.7375, 0.002, 0.081, 0.0089 - fr, 1], [0.178, 0.741, 0.001, 0.075, 0.0083 - fr, -5], [0.1595, 0.752, -0.002, 0.059, 0.0074 - fr, -12]];
    const curl = rig.pose.curl ?? 0.7;
    FG.forEach((f, fi) => {
      const g = grp('finger' + sd + fi, 'wrist' + sd, 'finger', s, { parent: palm, k: 0.008, joint: [X(f[0]), f[1], f[2]], jr0: 0.012, jr1: 0.028, pk: 0.004, fat: F.hand });
      const sp = f[5] * DEG, L = [f[3] * 0.45, f[3] * 0.3, f[3] * 0.25], R = [f[4], f[4] * 0.89, f[4] * 0.8, f[4] * 0.66];
      let p = [f[0], f[1], f[2]], ph = 0; const fl = [-22 * curl * (1 + fi * 0.12), -34 * curl * (1 + fi * 0.1), -18 * curl];
      palm.sphere(X(f[0]), f[1] + 0.003, f[2] - 0.0045, 0.0088, { k: 0.008 });                                                // knuckle
      for (let j = 0; j < 3; j++) {
        ph += fl[j] * DEG;
        const dir = [Math.sin(sp), -Math.cos(sp) * Math.cos(ph), -Math.cos(sp) * Math.sin(ph)], dor = [0, Math.sin(ph), -Math.cos(ph)], lat = [Math.cos(sp), Math.sin(sp) * Math.cos(ph), Math.sin(sp) * Math.sin(ph)];
        const q = [p[0] + dir[0] * L[j], p[1] + dir[1] * L[j], p[2] + dir[2] * L[j]];
        g.cone(X(p[0]), p[1], p[2], R[j], X(q[0]), q[1], q[2], R[j + 1], { k: j ? 0.003 : 0 });
        if (j > 0) g.sphere(X(p[0] + dor[0] * 0.0012), p[1] + dor[1] * 0.0012, p[2] + dor[2] * 0.0012, R[j] * (j === 1 ? 1.04 : 1.03), { k: 0.005 });
        { const kp = [0, 0, 0]; apply(A['wrist' + sd], X(p[0]), p[1], p[2], kp); rig.knuckles.push(kp); }
        if (j === 2) g.sphere(X(q[0] - dor[0] * R[3] * 0.3), q[1] - dor[1] * R[3] * 0.3, q[2] - dor[2] * R[3] * 0.3, R[3] * 1.03, { k: 0.005 });
        if (j === 2) {
          const c = [0, 1, 2].map(i => p[i] + dir[i] * L[2] * 0.62 + dor[i] * R[3] * 0.62);
          // mirrored basis for the right hand: negate x of each axis, then flip the lateral axis to stay right-handed
          const rot = s > 0 ? eulerFromBasis(lat, dir, dor) : eulerFromBasis([lat[0], -lat[1], -lat[2]], [-dir[0], dir[1], dir[2]], [-dor[0], dor[1], dor[2]]);
          const na = [X(c[0]), c[1], c[2], R[3] * 0.8, L[2] * 0.44, R[3] * 0.42];
          g.ellipsoid(...na, rot, { k: 0.0012, fat: F.hand }); nail('wrist' + sd, D.handS, na, rot);
          if (fi === 0) rig.tips[sd] = { p: [X(q[0]), q[1], q[2]], d: [s * dir[0], dir[1], dir[2]], r: R[3] };
        }
        p = q;
      }
    });
    // thumb
    const tg = grp('thumb' + sd, 'wrist' + sd, 'finger', s, { parent: palm, k: 0.012, joint: [X(0.22), 0.805, 0.01], jr0: 0.02, jr1: 0.045, pk: 0.004, fat: F.hand });
    const TP = [[0.218, 0.806, 0.01], [0.2415, 0.773, 0.019 + 0.006 * curl], [0.2555, 0.743, 0.026 + 0.012 * curl], [0.2625, 0.716, 0.031 + 0.018 * curl]], TR = [0.0128 - fr, 0.0108 - fr, 0.0099 - fr, 0.009 - fr];
    for (let j = 0; j < 3; j++) tg.cone(X(TP[j][0]), TP[j][1], TP[j][2], TR[j], X(TP[j + 1][0]), TP[j + 1][1], TP[j + 1][2], TR[j + 1], { k: j ? 0.003 : 0 });
    {
      const a = TP[2], b = TP[3], dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...dir); dir[0] /= l; dir[1] /= l; dir[2] /= l;
      let dor = [0.72, 0.1, -0.69]; const dd = dor[0] * dir[0] + dor[1] * dir[1] + dor[2] * dir[2]; dor = dor.map((v, i) => v - dir[i] * dd); const dl = Math.hypot(...dor); dor = dor.map(v => v / dl);
      const lat = [dir[1] * dor[2] - dir[2] * dor[1], dir[2] * dor[0] - dir[0] * dor[2], dir[0] * dor[1] - dir[1] * dor[0]];
      const c = [0, 1, 2].map(i => a[i] + dir[i] * l * 0.6 + dor[i] * TR[3] * 0.62);
      const rot = s > 0 ? eulerFromBasis(lat, dir, dor) : eulerFromBasis([lat[0], -lat[1], -lat[2]], [-dir[0], dir[1], dir[2]], [-dor[0], dor[1], dor[2]]);
      const na = [X(c[0]), c[1], c[2], TR[3] * 0.82, l * 0.42, TR[3] * 0.42];
      tg.ellipsoid(...na, rot, { k: 0.0012, fat: F.hand }); nail('wrist' + sd, D.handS, na, rot);
    }
  }

  // ---- legs
  for (const s of [1, -1]) {
    const sd = s > 0 ? 'L' : 'R', X = x => s * x;
    const th = grp('thigh' + sd, 'hip' + sd, 'thigh', s, { parent: pelvis, k: 0.05, joint: [X(0.085), 0.935, 0], jr0: 0.13, jr1: 0.3, pk: 0.035, fat: F.thigh });
    th.cone(X(0.092), 0.87, -0.006, 0.079 * (0.9 + 0.1 * mu), X(0.075), 0.545, 0, 0.05, { k: 0 });
    th.cone(X(0.096), 0.85, 0.022, 0.057 * mu, X(0.078), 0.58, 0.02, 0.042, {});                                              // quadriceps
    th.cone(X(0.086), 0.84, -0.03, 0.058 * mu, X(0.075), 0.57, -0.02, 0.04, {});                                              // hamstrings
    th.cone(X(0.052), 0.86, -0.006, 0.048, X(0.066), 0.62, 0, 0.035, {});                                                     // adductors
    th.cone(X(0.09), 0.88, 0, 0.095, X(0.076), 0.56, 0, 0.065, { flags: MODE_BOTTOM | MODE_BULK, fat: 0 });
    const sh = grp('shin' + sd, 'knee' + sd, 'shin', s, { parent: th, k: 0.03, joint: [X(0.075), 0.5, 0.005], jr0: 0.09, jr1: 0.18, pk: 0.025, fat: F.calf });
    sh.ellipsoid(X(0.075), 0.5, 0.0, 0.05, 0.05, 0.051, null, { k: 0, fat: F.knee });
    sh.ellipsoid(X(0.075), 0.508, 0.043, 0.024, 0.027, 0.013, null, { k: 0.014, fat: F.knee * 0.8 });                         // patella
    sh.sphere(X(0.075), REF.tibia.tubY, 0.039, 0.013, { k: 0.02, fat: F.shin });                                              // tibial tuberosity
    const tb = REF.tibia;
    sh.box(X(tb.c[0]), tb.c[1], tb.c[2], tb.half[0], tb.half[1], tb.half[2], tb.round, [0, s * tb.yaw, 0], { k: 0.012, fat: F.shin });   // subcutaneous tibia
    sh.cone(X(0.074), 0.43, -0.018, 0.053 * mu, X(0.072), 0.31, -0.02, 0.047 * mu, {});                                       // gastrocnemius
    sh.cone(X(0.072), 0.31, -0.02, 0.045, X(0.07), 0.13, -0.03, 0.026, {});
    sh.cone(X(0.086), 0.44, 0.012, 0.03, X(0.079), 0.2, 0.01, 0.02, {});                                                      // tibialis anterior
    sh.cone(X(0.07), 0.15, -0.03, 0.03, X(0.07), 0.08, -0.03, 0.033, { fat: F.foot });
    sh.cone(X(0.07), 0.2, -0.055, 0.0135, X(0.07), 0.06, -0.068, 0.014, { fat: F.foot, k: 0.02 });                            // Achilles
    sh.sphere(X(0.036), 0.088, -0.028, 0.016, { fat: F.foot, k: 0.014 });                                                     // medial malleolus
    sh.sphere(X(0.104), 0.078, -0.038, 0.015, { fat: F.foot, k: 0.014 });
    sh.cone(X(0.075), 0.47, -0.005, 0.066, X(0.07), 0.11, -0.02, 0.05, { flags: MODE_BOTTOM | MODE_BULK, fat: 0 });
    const ft = grp('foot' + sd, 'ankle' + sd, 'foot', s, { parent: sh, k: 0.02, joint: [X(0.07), 0.085, -0.03], jr0: 0.05, jr1: 0.1, pk: 0.016, fat: F.foot });
    ft.sphere(X(0.07), 0.04, -0.066, 0.036, { k: 0 });
    ft.cone(X(0.07), 0.06, -0.03, 0.036, X(0.068), 0.04, 0.07, 0.03, {});
    ft.cone(X(0.09), 0.022, -0.05, 0.022, X(0.1), 0.02, 0.09, 0.02, {});
    ft.ellipsoid(X(0.066), 0.024, 0.105, 0.05, 0.022, 0.035, null, {});
    const TOE = [[0.036, 0.02, 0.13, 0.034, 0.016, 0.168, 0.0145, 0.012], [0.057, 0.017, 0.135, 0.057, 0.013, 0.165, 0.0095, 0.008], [0.073, 0.016, 0.13, 0.074, 0.012, 0.156, 0.009, 0.0075], [0.088, 0.015, 0.122, 0.09, 0.011, 0.145, 0.0085, 0.007], [0.101, 0.014, 0.112, 0.104, 0.01, 0.13, 0.008, 0.0068]];
    for (const t of TOE) {
      ft.cone(X(t[0]), t[1], t[2], t[6], X(t[3]), t[4], t[5], t[7], { k: 0.0035 });
      nail('ankle' + sd, D.footS, [X(t[3]), t[4] + t[7] * 0.75, t[5] - t[7] * 0.2, t[7] * 0.8, t[7] * 0.45, t[7] * 0.9], null);
    }
    ft.ellipsoid(X(0.05), 0.0, 0.01, 0.022, 0.016, 0.05, null, { op: OP_SUB, k: 0.02 });                                      // arch
    ft.plane(0, 0.0005, 0, 0, -1, 0, { op: OP_INT, k: 0.006 });
  }
  m.finalize(); for (const k in fields) fields[k].finalize();
  return { model: m, fields };
}

// ---------------------------------------------------------------- shaders

const MAX_WOUNDS = 10, MAX_OPEN = 8, MAX_THOR = 12;
const WOUND_KINDS = ['stab', 'gsw', 'gswExit', 'laceration', 'abrasion', 'burn', 'bruise', 'deformity', 'amputation', 'needleMark', 'rash', 'swelling'];

const GL_NOISE = `
float sH(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float sN(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(sH(i),sH(i+vec3(1,0,0)),f.x),mix(sH(i+vec3(0,1,0)),sH(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(sH(i+vec3(0,0,1)),sH(i+vec3(1,0,1)),f.x),mix(sH(i+vec3(0,1,1)),sH(i+vec3(1,1,1)),f.x),f.y),f.z); }
float sF(vec3 p){ return sN(p)*0.5+sN(p*2.03+7.1)*0.3+sN(p*4.1+3.3)*0.2; }
float sC(vec3 p){ vec3 i=floor(p-0.5), f=p-i; float d=8.0;
  for(int a=0;a<2;a++) for(int b=0;b<2;b++) for(int c=0;c<2;c++){ vec3 o=vec3(float(a),float(b),float(c)); vec3 q=i+o; vec3 h=vec3(sH(q),sH(q+17.3),sH(q+41.7)); vec3 r=o+0.25+0.5*h-f; d=min(d,dot(r,r)); }
  return sqrt(d); }
vec3 bumpN(vec3 N, vec3 pv, float h){ vec3 dpx=dFdx(pv), dpy=dFdy(pv); float hx=dFdx(h), hy=dFdy(h);
  vec3 r1=cross(dpy,N), r2=cross(N,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(hx*r1+hy*r2);
  vec3 n=abs(det)*N-g; float l=length(n); return l>1e-12 ? n/l : N; }
`;

// Surgical openings: > 0 inside a cut (metres from its edge). Shared by the skin and by every layer under it.
const GL_OPEN = `
uniform int uOpCount; uniform vec4 uOpA[${MAX_OPEN}]; uniform vec4 uOpB[${MAX_OPEN}]; uniform vec3 uOpN[${MAX_OPEN}];
uniform int uThCount; uniform vec3 uThP[${MAX_THOR}]; uniform vec3 uThN[${MAX_THOR}]; uniform float uThGape;
float openField(vec3 p){
  float best=-1.0;
  for(int i=0;i<${MAX_OPEN};i++){ if(i>=uOpCount) break;
    vec3 a=uOpA[i].xyz, ab=uOpB[i].xyz-a; float gape=uOpA[i].w, depth=uOpB[i].w; vec3 n=uOpN[i];
    float L=max(length(ab),1e-4); vec3 t=ab/L; vec3 w=cross(n,t); float wl=length(w); if(wl<1e-4) continue; w/=wl;
    vec3 d=p-a; float s=dot(d,t)/L, lat=dot(d,w), dep=-dot(d,n);
    if(s<0.0||s>1.0||dep>depth+0.003||dep<-0.03) continue;
    float hw=0.5*gape*sqrt(max(4.0*s*(1.0-s),0.0))*(1.0-0.4*clamp(dep/max(depth,1e-3),0.0,1.0));
    best=max(best,hw-abs(lat)); }
  if(uThGape>0.0005){
    for(int i=0;i<${MAX_THOR - 1};i++){ if(i>=uThCount-1) break;
      vec3 a=uThP[i], ab=uThP[i+1]-a; vec3 n=normalize(uThN[i]+uThN[i+1]);
      float L=max(length(ab),1e-4); vec3 t=ab/L; vec3 w=cross(n,t); float wl=length(w); if(wl<1e-4) continue; w/=wl;
      vec3 d=p-a; float s=dot(d,t)/L, lat=dot(d,w), dep=-dot(d,n);
      if(s<(i==0?0.0:-0.45)||s>(i==uThCount-2?1.0:1.45)||dep>0.16||dep<-0.012) continue;
      float gs=(float(i)+clamp(s,0.0,1.0))/float(uThCount-1);
      float hw=0.5*uThGape*pow(max(4.0*gs*(1.0-gs),0.0),0.35);
      best=max(best,hw-abs(lat)); } }
  return best;
}`;

const GL_WOUND_PARS = `
uniform int uWCount; uniform vec4 uWA[${MAX_WOUNDS}]; uniform vec4 uWB[${MAX_WOUNDS}]; uniform vec4 uWC[${MAX_WOUNDS}];`;

const VS_PARS = `
attribute vec4 aDef; attribute vec4 aDef2; attribute vec4 aLid;
uniform vec4 uBreath, uCpr, uParadox; uniform vec3 uCprDir, uJawPivot, uHeadX; uniform float uLid, uJaw, uJVD, uTrachea, uParadoxAmt;
varying vec3 vRest; varying vec3 vRestN;
vec3 hRot(vec3 v, vec3 ax, float a){ float c=cos(a), s=sin(a); return v*c+cross(ax,v)*s+ax*dot(ax,v)*(1.0-c); }
`;
// Shared body deformation: breathing, CPR compression, flail segment; skin adds lids, jaw, neck veins, trachea, swelling.
const VS_BEGIN = `
vec3 transformed = position; vRest = position; vRestN = normal;
#ifdef SKIN_DEF
  vM0=aM0; vM1=aM1; vM2=aM2; vM3=aM3;
  if(aLid.w!=0.0){ float la = aLid.w>0.0 ? -0.53*uLid : 0.34*uLid; transformed = aLid.xyz + hRot(position-aLid.xyz, uHeadX, la); }
  if(aDef2.x>0.001){ vec3 jp = uJawPivot + hRot(transformed-uJawPivot, uHeadX, uJaw*0.4); transformed = mix(transformed, jp, aDef2.x); }
  transformed += normal*(uJVD*aDef2.y*0.003) + uHeadX*(uTrachea*aDef2.z*0.007);
  for(int i=0;i<${MAX_WOUNDS};i++){ if(i>=uWCount) break; float kd=uWB[i].w; if(kd<6.5||(kd>7.5&&kd<10.5)) continue;
    vec3 wd=position-uWA[i].xyz; float sz=uWA[i].w; transformed += uWB[i].xyz*(sz*0.22*exp(-dot(wd,wd)/max(0.4*sz*sz,1e-6))); }
#else
  vC0=aC0; vC1=aC1; vC2=aC2;
#endif
  { float br = uBreath.x*(aDef.x*uBreath.y+aDef.y*uBreath.z)*0.013 + uBreath.x*uBreath.w*aDef.z*0.011;
    vec3 pd = position-uParadox.xyz; br -= uBreath.x*uParadoxAmt*0.03*exp(-dot(pd,pd)/max(2.0*uParadox.w*uParadox.w,1e-5))*aDef.w;
    transformed += normal*br;
    vec3 cd = position-uCpr.xyz; transformed += uCprDir*(uCpr.w*0.055*exp(-dot(cd,cd)/(2.0*0.075*0.075))*aDef.w); }
`;
const VS_NORMAL = `
vec3 objectNormal = vec3( normal );
#ifdef SKIN_DEF
  if(aLid.w!=0.0){ float la = aLid.w>0.0 ? -0.53*uLid : 0.34*uLid; objectNormal = hRot(objectNormal, uHeadX, la); }
#endif
`;

// Wrap-lit diffuse with a red-shifted terminator and back-lit translucency in thin parts, swapped into three's
// physical direct-light function. gLightRaw is the light colour before the shadow test (see patchLights).
function patchLights(sh) {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment, line = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );';
  if (!src.includes(line)) return;
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', src.replace(line, `
    { float rawNL = dot( geometryNormal, directLight.direction );
      vec3 wrapW = vec3(0.36, 0.13, 0.06) * gSSS;
      vec3 wrapNL = clamp((vec3(rawNL) + wrapW) / (1.0 + wrapW), 0.0, 1.0);
      vec3 lit = wrapNL * mix(vec3(1.0), vec3(1.0, 0.8, 0.7), gSSS * (1.0 - clamp(rawNL * 3.0, 0.0, 1.0)) * 0.5);
      reflectedLight.directDiffuse += directLight.color * lit * BRDF_Lambert( material.diffuseContribution );
      float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0) * gThin;
      reflectedLight.directDiffuse += gLightRaw * back * vec3(0.95, 0.17, 0.07) * 0.4 * BRDF_Lambert( material.diffuseContribution + 0.12 ); }`))
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(/(get\w+LightInfo\([^;]*\);)/g, '$1 gLightRaw = directLight.color;'));
}

const FS_WOUNDS = `
  for(int i=0;i<${MAX_WOUNDS};i++){ if(i>=uWCount) break;
    vec3 wd=P-uWA[i].xyz; float sz=max(uWA[i].w,1e-4); float kd=uWB[i].w; vec3 wn=uWB[i].xyz;
    if(kd>7.5&&kd<8.5){ float s=dot(wd,wn); float lat=length(wd-wn*s); if(s>0.0&&lat<sz+s*0.9&&s<0.9) discard;
      float rim=smoothstep(-0.03,0.0,s)*step(lat,sz*1.6); skin=mix(skin,vec3(0.22,0.01,0.012),rim*0.9); gWoundRough=min(gWoundRough,mix(1.0,0.15,rim)); continue; }
    float reach = sz*(2.2+3.0*uWC[i].w); if(dot(wd,wd)>reach*reach) continue;
    if(dot(normalize(vRestN),wn)<0.05) continue;
    vec3 wt=uWC[i].xyz, wb=cross(wn,wt); vec2 q=vec2(dot(wd,wt),dot(wd,wb))/(sz*0.5); float r=length(q);
    float nz=sF(P*230.0+float(i)*7.3), nz2=sN(P*900.0+float(i)*3.1);
    float wet=0.0, hole=0.0, bump=0.0;
    if(kd<0.5||(kd>2.5&&kd<3.5)){      // stab / laceration: a slit
      float jag = kd>2.5 ? (sN(vec3(q.x*5.0,float(i),0.5))-0.5)*0.22 : 0.0;
      float hw = (kd>2.5?0.15:0.085)*sqrt(max(1.0-q.x*q.x,0.0)); float dy=abs(q.y+jag);
      hole = smoothstep(hw+0.02,hw*0.7,dy)*step(abs(q.x),1.0);
      float lipR = smoothstep(hw+0.22,hw+0.02,dy)*smoothstep(1.15,0.95,abs(q.x));
      skin = mix(skin, skin*vec3(0.85,0.5,0.52), smoothstep(2.0,0.6,r)*0.5);
      skin = mix(skin, vec3(0.42,0.02,0.02), lipR*0.85); skin = mix(skin, vec3(0.07,0.0,0.002), hole);
      wet = max(lipR,hole); bump = lipR*0.0006 - hole*0.002;
    } else if(kd<1.5){                 // gunshot entry: punched hole, abrasion collar
      hole = smoothstep(0.5,0.38,r); float collar=smoothstep(0.95,0.6,r+(nz-0.5)*0.2);
      skin = mix(skin, skin*vec3(0.8,0.55,0.55), smoothstep(2.2,0.9,r)*0.55);
      skin = mix(skin, vec3(0.16,0.035,0.03), collar*0.9); skin = mix(skin, vec3(0.03,0.0,0.0), hole);
      wet = hole; bump = collar*0.0004 - hole*0.003;
    } else if(kd<2.5){                 // exit: stellate, everted
      float rr = r*(0.75+0.6*sN(vec3(atan(q.y,q.x)*2.2,float(i),1.0)));
      hole = smoothstep(0.62,0.45,rr); float ev = smoothstep(1.05,0.6,rr);
      skin = mix(skin, skin*vec3(0.8,0.5,0.52), smoothstep(2.2,0.9,r)*0.6);
      skin = mix(skin, mix(vec3(0.5,0.05,0.05),vec3(0.75,0.35,0.3),nz2), ev*0.9); skin = mix(skin, vec3(0.06,0.0,0.0), hole);
      wet = ev; bump = ev*0.0015*(0.5+nz) - hole*0.004;
    } else if(kd<4.5){                 // abrasion: raw streaks
      float m = smoothstep(1.0,0.55,r+(nz-0.5)*0.5)*smoothstep(0.25,0.7,sN(vec3(q.x*2.5,q.y*26.0,float(i))));
      skin = mix(skin, mix(vec3(0.5,0.08,0.07),vec3(0.75,0.3,0.26),nz2), m*0.85); wet = m*0.5; bump = -m*0.0002;
    } else if(kd<5.5){                 // burn: erythema, blisters, leathery centre
      float m = smoothstep(1.05,0.6,r+(nz-0.5)*0.6), c = smoothstep(0.6,0.25,r+(nz-0.5)*0.5);
      skin = mix(skin, skin*vec3(1.15,0.42,0.38)+vec3(0.1,0.0,0.0), m*0.85);
      skin = mix(skin, mix(vec3(0.72,0.62,0.52),vec3(0.07,0.05,0.045),smoothstep(0.4,0.7,nz)), c*0.9);
      float bl = (1.0-smoothstep(0.1,0.3,sC(P*160.0)))*m*(1.0-c); wet = max(bl,m*0.4); bump = bl*0.0012 - c*0.0004*nz2;
    } else if(kd<7.5){                 // bruise (and the skin over a deformity)
      float m = smoothstep(1.1,0.15,r+(nz-0.5)*0.7);
      skin = mix(skin, skin*vec3(0.95,0.95,0.6), smoothstep(1.4,0.7,r+(nz-0.5)*0.6)*0.35);
      skin = mix(skin, skin*mix(vec3(0.55,0.38,0.66),vec3(0.42,0.2,0.3),nz), m*0.8);
    } else if(kd<9.5){                 // needle mark
      hole = smoothstep(0.5,0.25,r); skin = mix(skin, skin*vec3(0.8,0.6,0.7), smoothstep(2.0,0.6,r)*0.4); skin = mix(skin, vec3(0.3,0.02,0.02), hole); wet=hole*0.6;
    } else if(kd<10.5){                // rash: raised wheals
      float m = smoothstep(1.0,0.7,r+(nz-0.5)*0.4)*(1.0-smoothstep(0.22,0.4,sC(P*110.0+float(i))));
      skin = mix(skin, skin*vec3(1.2,0.55,0.55)+vec3(0.06,0.0,0.0), m*0.8); bump = m*0.0005;
    } else {                           // swelling: tight, shiny, pink
      float m = smoothstep(1.2,0.2,r); skin = mix(skin, skin*vec3(1.08,0.82,0.8), m*0.6); wet = m*0.35;
    }
    float bl = uWC[i].w; if(bl>0.001){ float br = 0.7+2.6*bl; float bm = smoothstep(br,br*0.55,r+(nz-0.5)*0.7)*smoothstep(0.0,0.08,bl);
      skin = mix(skin, vec3(0.3,0.012,0.012)*(0.7+0.5*nz2), bm*0.93); wet = max(wet,bm); }
    gWoundRough = min(gWoundRough, mix(1.0, 0.12, clamp(wet,0.0,1.0))); gWoundBump += bump; gSSS *= 1.0-hole;
  }`;

function skinMaterial(hu) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, ior: 1.4, sheen: 0.14, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.9, 0.75, 0.68) });
  mat.defines = { SKIN_DEF: 1 };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, hu);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aM0; attribute vec4 aM1; attribute vec4 aM2; attribute vec4 aM3; varying vec4 vM0; varying vec4 vM1; varying vec4 vM2; varying vec4 vM3;' + VS_PARS + GL_WOUND_PARS)
      .replace('#include <beginnormal_vertex>', VS_NORMAL).replace('#include <begin_vertex>', VS_BEGIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRest; varying vec3 vRestN; varying vec4 vM0; varying vec4 vM1; varying vec4 vM2; varying vec4 vM3;
      uniform vec3 uSkin, uLip, uPalm, uHairCol, uUnderCol, uHeadX, uHeadY, uHeadPos; uniform vec4 uClin, uClin2; uniform float uTone, uBeard, uScalp, uFreckle, uJaw;
      float gSSS=1.0, gThin=0.0, gWoundRough=1.0, gWoundBump=0.0, gLipM=0.0, gNailM=0.0, gHairM=0.0, gUnderM=0.0, gNMid=0.5; vec3 gLightRaw=vec3(0.0);
      ${GL_NOISE}${GL_OPEN}${GL_WOUND_PARS}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if(openField(vRest)>0.0) discard;\n if(vM3.w>0.3&&vM3.w<1.5&&uJaw>0.07) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 P=vRest; float fw=length(fwidth(P))+1e-6;
        float dFine=1.0-smoothstep(0.0004,0.0016,fw), dMid=1.0-smoothstep(0.002,0.01,fw);
        float nLow=sF(P*26.0), nMid=sF(P*170.0+11.0); gNMid=nMid;
        float lipM=smoothstep(-0.0005,0.0004,vM0.x), nailM=smoothstep(-0.0011,-0.0002,vM0.y);
        float underM=smoothstep(-0.0008,0.0008,vM0.z);
        float pallor=uClin.x, cyan=uClin.y, flush_=uClin.z;
        vec3 skin=uSkin*(0.88+0.24*nLow)*(0.95+0.1*nMid); skin=pow(max(skin,vec3(0.0)),vec3(1.12));
        skin=mix(skin,uPalm*(0.95+0.1*nMid),vM1.z);
        float bloodVis=mix(1.0,0.4,uTone);
        float perf=clamp(0.45+0.9*vM1.x+(nLow-0.5)*0.5+0.35*vM1.z,0.0,1.8);
        perf=perf*(1.0-0.9*pallor)+flush_*(0.7+0.6*vM1.x);
        float cyanLocal=clamp(max(vM2.z,nailM)*smoothstep(0.0,0.45,cyan)+smoothstep(0.4,1.0,cyan)*0.75,0.0,1.0);
        vec3 bloodT=mix(vec3(1.0,0.60,0.56),vec3(0.62,0.60,0.86),cyanLocal);
        skin*=mix(vec3(1.0),bloodT,clamp(0.5*perf*bloodVis+0.5*cyanLocal*bloodVis,0.0,0.9));
        float lum=dot(skin,vec3(0.3,0.5,0.2));
        skin=mix(skin,vec3(lum)*vec3(1.03,1.0,0.9)*1.12,0.5*pallor*bloodVis);
        float net=smoothstep(0.42,0.66,sC(P*60.0+sN(P*14.0)*3.0))*(0.5+0.5*sN(P*11.0+5.0));
        skin=mix(skin,skin*vec3(0.66,0.52,0.78),uClin2.x*net*0.7*bloodVis);
        skin=mix(skin,skin*vec3(1.12,1.0,0.42)+vec3(0.05,0.04,0.0),0.6*uClin2.y);
        float vein=smoothstep(-0.0036,-0.0009,vM1.w)*(0.7+0.6*nMid);
        skin=mix(skin,skin*vec3(0.68,0.86,0.93),0.5*vein*bloodVis);
        skin=mix(skin,skin*vec3(0.78,0.5,0.46),smoothstep(0.25,0.7,vM3.x)*0.8);
        float spots=smoothstep(0.62,0.7,sN(P*260.0)*sN(P*70.0+3.0)*2.2);
        skin=mix(skin,skin*vec3(0.62,0.45,0.32),spots*clamp(uClin2.w*1.2+uFreckle,0.0,1.0)*0.6*dMid);
        vec3 lip=uLip*(0.9+0.2*nMid);
        lip=mix(lip,skin*vec3(1.02,0.95,0.95),0.75*pallor);
        lip=mix(lip,vec3(0.30,0.24,0.42)*(0.6+lum),smoothstep(0.0,0.5,cyan)*0.85);
        skin=mix(skin,lip,lipM);
        vec3 nailC=mix(skin*vec3(1.08,0.9,0.88)+0.05,vec3(0.36,0.33,0.5)*(0.6+lum),smoothstep(0.0,0.5,cyan)*0.8);
        nailC=mix(nailC,vec3(lum)*1.2+0.04,0.5*pallor);
        skin=mix(skin,nailC,nailM);
        vec3 hz=cross(uHeadX,uHeadY); vec3 hl=vec3(dot(P-uHeadPos,uHeadX),dot(P-uHeadPos,uHeadY),dot(P-uHeadPos,hz));
        if(vM2.w>1.5){ float lt=vM2.w-2.0; float lc=hl.x*3100.0; float lu=fract(lc+(sH(vec3(floor(lc),3.0,7.0))-0.5)*0.7*lt); if(abs(lu-0.5)>mix(0.5,0.44-0.36*lt,dFine)||lt>mix(0.5,0.6+0.4*sH(vec3(floor(lc),9.0,1.0)),dFine)) discard; }
        float st1=sN(vec3(hl.x*330.0,hl.y*3400.0+abs(hl.x)*1500.0,hl.z*420.0));
        float st2=sN(vec3(hl.x*900.0+3.0,hl.y*3000.0-abs(hl.x)*900.0,hl.z*700.0));
        float browE=smoothstep(-0.0016,0.0012,vM2.y+(st1-0.5)*0.003);
        float brow=browE*mix(0.62,max(smoothstep(0.4,0.62,st1),smoothstep(0.5,0.7,st2)*0.8),dFine);
        // stubble: short dashes lying down the face, over a faint blue-grey shadow
        float dash=smoothstep(0.56,0.7,sN(vec3(hl.x*4400.0,hl.y*1250.0+hl.x*500.0,hl.z*4400.0)));
        float stub=dash;
        float beardM=vM2.x*uBeard;
        skin=mix(skin,skin*vec3(0.8,0.83,0.88),clamp(beardM*1.6,0.0,1.0)*0.45);
        float beard=clamp(beardM*3.2,0.0,1.0)*mix(0.28,dash,dFine)*0.72+smoothstep(0.3,0.75,beardM)*(0.5+0.5*sN(vec3(hl.x*2400.0,hl.y*300.0,hl.z*2400.0)))*0.9;
        float scalp=smoothstep(-0.003,0.004,vM0.w+(nMid-0.5)*0.003)*uScalp; scalp*=mix(1.0,0.7+0.3*stub,dFine);
        float hairOn=clamp(max(max(brow,beard),scalp),0.0,1.0);
        hairOn=max(hairOn,smoothstep(0.35,0.9,vM2.w));
        skin=mix(skin,uHairCol*(0.7+0.6*st1),hairOn*0.92);
        skin=mix(skin,vec3(0.05,0.008,0.008),smoothstep(0.75,0.98,vM3.w)*0.6);
        float toothM=step(0.012,vM0.y);
        skin=mix(skin,vec3(0.72,0.68,0.55)*(0.86+0.14*nMid)*(1.0-0.45*smoothstep(0.4,0.5,abs(fract(hl.x*128.0)-0.5))),toothM);
        if(vM3.w>1.5) skin=vec3(0.03,0.004,0.004);
        float band=underM*(1.0-smoothstep(0.018,0.021,vM0.z));
        vec3 und=uUnderCol*(0.88+0.24*sN(P*1500.0))*(1.0-0.3*band);
        skin=mix(skin,und,underM);
        gLipM=lipM; gNailM=nailM; gHairM=hairOn; gUnderM=underM; gThin=vM1.y*(1.0-underM); gSSS=(1.0-underM)*(1.0-0.7*hairOn)*(1.0-toothM)*(vM3.w>1.5?0.0:1.0);
        ${FS_WOUNDS}
        diffuseColor.rgb=skin;
        float ndv=abs(dot(normalize(vNormal),normalize(vViewPosition)));
        diffuseColor.a=mix(1.0,clamp(0.05+0.7*pow(1.0-ndv,2.2),0.0,1.0),uClin2.z);
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      { float r=0.56-0.16*vM3.z+(gNMid-0.5)*0.14;
        r=mix(r,0.26,gLipM); r=mix(r,0.2,gNailM); r=mix(r,0.7,gHairM*0.7); r=mix(r,0.92,gUnderM);
        float bead=(1.0-smoothstep(0.1,0.3,sC(vRest*420.0+3.0)))*smoothstep(0.15,0.8,uClin.w);
        r=mix(r,0.2,clamp(uClin.w*0.5+bead,0.0,1.0)*(1.0-gUnderM)*(1.0-gHairM));
        roughnessFactor=clamp(min(r,gWoundRough),0.06,1.0); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 P=vRest; float fw=length(fwidth(P))+1e-6;
        float dFine=1.0-smoothstep(0.00025,0.0009,fw), dMid=1.0-smoothstep(0.0012,0.005,fw);
        float h=sC(P*1000.0)*0.00007*dFine*(1.0-gNailM)*(1.0-gUnderM);
        h+=(sN(P*380.0)-0.5)*0.00016*dMid;
        vec3 hz=cross(uHeadX,uHeadY); vec3 hl=vec3(dot(P-uHeadPos,uHeadX),dot(P-uHeadPos,uHeadY),dot(P-uHeadPos,hz));
        h-=abs(sN(vec3(hl.x*45.0,hl.y*650.0,hl.z*45.0))-0.5)*0.0017*min(vM3.y,1.0)*max(uClin2.w,step(1.5,vM3.y))*dMid;
        h-=abs(sN(P*150.0)-0.5)*0.0003*uClin2.w*dMid;
        h-=max(vM3.y-1.0,0.0)*abs(sN(P*vec3(1300.0,1300.0,1300.0))-0.5)*0.0009*dMid;
        h+=(1.0-smoothstep(0.1,0.3,sC(P*420.0+3.0)))*smoothstep(0.15,0.8,uClin.w)*0.00035*dMid*(1.0-gUnderM);
        h+=gHairM*sN(P*1900.0)*0.0003*dFine;
        h-=gLipM*abs(sN(vec3(hl.x*1500.0,hl.y*90.0,hl.z*200.0))-0.5)*0.0007*dMid;
        h+=gUnderM*(sin(dot(P,vec3(5200.0,5200.0,0.0)))*sin(dot(P,vec3(-5200.0,5200.0,5200.0))))*0.00005*dFine;
        h+=gWoundBump;
        normal=bumpN(normal,-vViewPosition,h); }`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.5,0.7,0.95)*(0.25+gl_FragColor.rgb),uClin2.z*0.75);');
    patchLights(sh);
  };
  mat.customProgramCacheKey = () => 'swm-skin';
  return mat;
}

// Eyeball: sclera with vessels, fibrous iris with limbal ring, pupil sized in mm, wet clearcoat for the highlight.
function eyeMaterial(hu, irisCol) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.38 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uPupil = hu.uPupil; sh.uniforms.uIris = { value: irisCol }; sh.uniforms.uClin2 = hu.uClin2; sh.uniforms.uClin = hu.uClin;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aEye; varying vec4 vEye;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vEye=aEye;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec4 vEye; uniform vec2 uPupil; uniform vec3 uIris; uniform vec4 uClin, uClin2;${GL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 l=normalize(vEye.xyz); float rr=length(l.xy)*11.8; float ang=atan(l.y,l.x);
        float pup=0.5*(vEye.w>0.5?uPupil.y:uPupil.x);
        vec3 scl=vec3(0.80,0.78,0.74)*(0.9+0.1*sN(l*9.0));
        float ves=smoothstep(0.55,0.75,sN(vec3(ang*3.0+sN(l*14.0)*2.5,rr*0.35,vEye.w*9.0)))*smoothstep(6.5,11.0,rr);
        scl=mix(scl,vec3(0.62,0.2,0.16),ves*0.5); scl=mix(scl,scl*vec3(1.0,0.9,0.86),smoothstep(7.0,12.0,rr));
        scl=mix(scl,vec3(0.82,0.7,0.2),uClin2.y*0.7);
        float fib=sN(vec3(ang*26.0,rr*1.6,3.0))*0.6+sN(vec3(ang*70.0,rr*3.0,7.0))*0.4;
        vec3 iris=uIris*(0.45+1.1*fib); iris=mix(iris,uIris*1.5+vec3(0.1,0.07,0.02),smoothstep(pup+1.6,pup+0.2,rr)*0.5);
        iris*=1.0-0.75*smoothstep(4.9,5.9,rr);
        vec3 c=mix(iris,scl,smoothstep(5.75,6.05,rr)); c=mix(vec3(0.004),c,smoothstep(pup-0.12,pup+0.12,rr));
        c*=0.55+0.45*smoothstep(-0.55,0.35,l.y)*smoothstep(0.75,-0.1,l.y)+0.1;
        diffuseColor.rgb=c; }`);
  };
  mat.customProgramCacheKey = () => 'swm-eye';
  return mat;
}

function hairMaterial(hu, col, curly) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.6, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(col).multiplyScalar(1.5).addScalar(0.05) });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHairCol = { value: new THREE.Color(col) }; sh.uniforms.uCurl = { value: curly ? 1 : 0 }; sh.uniforms.uClin2 = hu.uClin2; sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aHair; varying vec4 vHair; varying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vHair=aHair; vRest=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec4 vHair; varying vec3 vRest; uniform vec3 uHairCol; uniform float uCurl, uWet; uniform vec4 uClin2; float gS1=0.5, gFade=1.0; vec3 gFlow=vec3(0.0,1.0,0.0);${GL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 fl=vHair.xyz; float l=length(fl); fl = l>1e-4 ? fl/l : vec3(0.0,1.0,0.0); gFlow=fl;
        vec3 q=mix(vRest-fl*dot(vRest,fl)*0.965, vRest+0.004*vec3(sN(vRest*70.0),sN(vRest*70.0+5.0),sN(vRest*70.0+9.0)), uCurl*0.85);
        float hfw=length(fwidth(vRest))+1e-6, hfade=1.0-smoothstep(0.00025,0.0011,hfw); gFade=hfade;
        float s1=mix(0.5,sN(q*2300.0),hfade), s2=mix(0.5,sN(q*600.0+3.0),1.0-smoothstep(0.001,0.004,hfw)), s3=sN(q*120.0);
        gS1=s1;
        if(vHair.w*1.5 + (s2-0.5)*0.5 + (s1-0.5)*0.22 < 0.32) discard;
        vec3 c=uHairCol*(0.35+0.9*s1)*(0.7+0.6*s2)*(0.8+0.4*s3);
        c=mix(c,vec3(0.62,0.62,0.6)*(0.6+0.6*s1),step(1.0-uClin2.w*0.55,s2*0.6+sN(q*900.0+17.0)*0.4+0.2)*0.85);
        c*=mix(1.0,0.6,uWet*0.6);
        diffuseColor.rgb=c; diffuseColor.a=1.0; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=mix(0.55+0.2*gS1,0.32,uWet*0.6);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 fv=normalize((viewMatrix*vec4(gFlow,0.0)).xyz+vec3(1e-5)); vec3 sd=cross(normal,fv); float sl=length(sd); sd = sl>1e-4 ? sd/sl : vec3(1.0,0.0,0.0);
        vec3 q=vRest-gFlow*dot(vRest,gFlow)*0.965;
        normal=normalize(normal+(sd*(sN(q*2300.0+31.0)-0.5)*0.7+fv*(sN(q*500.0+11.0)-0.5)*0.3)*gFade); }`);
  };
  mat.customProgramCacheKey = () => 'swm-hair';
  return mat;
}

// Clothing and shoes. fabric: 0 jersey, 1 plain weave, 2 denim, 3 fleece, 4 printed gown cotton, 5 satin, 6 ripstop,
// 7 nylon shell, 8 shoe.
function clothMaterial(hu, o) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.85, sheen: o.fabric === 3 ? 0.9 : 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(o.color).multiplyScalar(0.6).addScalar(0.08), side: THREE.DoubleSide });
  const own = { uCol: { value: new THREE.Color(o.color) }, uCol2: { value: new THREE.Color(o.color2 ?? 0xdddddd) }, uFabric: { value: o.fabric }, uPlacket: { value: o.placket || 0 }, uPiping: { value: o.piping ? 1 : 0 }, uExMask: { value: o.exMask || new THREE.Vector4(1, 1, 1, 1) } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, hu, own); sh.uniforms.uWet = U.uWet; sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aC0; attribute vec4 aC1; attribute vec4 aC2; varying vec4 vC0; varying vec4 vC1; varying vec4 vC2;' + VS_PARS)
      .replace('#include <beginnormal_vertex>', VS_NORMAL).replace('#include <begin_vertex>', VS_BEGIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vRest; varying vec3 vRestN; varying vec4 vC0; varying vec4 vC1; varying vec4 vC2;
      uniform vec3 uCol, uCol2; uniform vec4 uExpose, uExMask, uClin2; uniform float uFabric, uPlacket, uPiping, uWet, uNight;
      float gRough=0.85, gH=0.0, gPipe=0.0, gMetal=0.0; vec3 gLightRaw=vec3(0.0); float gSSS=0.0, gThin=0.0;
      ${GL_NOISE}${GL_WOUND_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 P=vRest; vec3 an=abs(normalize(vRestN)); vec2 uv = (an.y>an.x&&an.y>an.z) ? P.xz : (an.x>an.z ? P.zy : P.xy);
        float fw=length(fwidth(P))+1e-6;
        // scissor cuts (expose): each field is metres inside its cut region
        float cutN=(sN(P*60.0)-0.5)*0.010+(sN(P*500.0)-0.5)*0.003;
        vec4 ex=uExpose*uExMask; float cut=-1.0;
        if(ex.x>0.002) cut=max(cut,vC0.x-(1.0-ex.x)*0.2); if(ex.y>0.002) cut=max(cut,vC0.y-(1.0-ex.y)*0.2);
        if(ex.z>0.002) cut=max(cut,vC0.z-(1.0-ex.z)*0.2); if(ex.w>0.002) cut=max(cut,vC0.w-(1.0-ex.w)*0.2);
        if(cut+cutN>0.0) discard;
        float fray=smoothstep(-0.006,0.0,cut+cutN);
        float fadeA=1.0-smoothstep(0.00025,0.0008,fw);
        vec3 col=uCol; float h=0.0, rough=0.86, fab=uFabric;
        if(fab<0.5){ h=abs(fract(uv.x*1500.0)-0.5)*0.00014; col*=0.92+0.16*sN(P*600.0); }
        else if(fab<1.5){ h=sin(uv.x*10050.0)*sin(uv.y*10050.0)*0.00006; col*=0.94+0.12*sN(P*500.0); rough=0.8; }
        else if(fab<2.5){ float tw=sin((uv.x+uv.y)*5650.0); h=tw*0.0001; float weft=smoothstep(0.1,0.9,tw*0.5+0.5)*sN(P*1500.0);
          col=mix(col,col*1.9+0.07,weft*0.5*fadeA+0.17*(1.0-fadeA)); col*=0.8+0.4*sF(P*13.0); rough=0.9; }
        else if(fab<3.5){ h=(sN(P*900.0)-0.5)*0.0003; col*=0.88+0.24*sN(P*300.0); rough=0.97; }
        else if(fab<4.5){ h=sin(uv.x*8800.0)*sin(uv.y*8800.0)*0.00005; vec2 g=fract(uv*34.0)-0.5; col=mix(col,uCol2,smoothstep(0.17,0.13,length(g))*0.8); }
        else if(fab<5.5){ h=(sN(P*vec3(300.0,1500.0,300.0))-0.5)*0.00005; rough=0.46; }
        else if(fab<6.5){ vec2 g=abs(fract(uv*170.0)-0.5); float rip=smoothstep(0.43,0.48,max(g.x,g.y)); h=rip*0.00012+sin(uv.x*11300.0)*sin(uv.y*11300.0)*0.00004; col*=0.9+0.12*rip; rough=0.78; }
        else if(fab<7.5){ h=(sN(P*800.0)-0.5)*0.00005; rough=0.5; col*=0.93+0.14*sN(P*38.0); }
        else { // shoe: vC1.x sole, vC1.y laces, vC1.z toe cap / trim
          float sole=smoothstep(-0.001,0.001,vC1.x); float lace=smoothstep(0.0,0.002,vC1.y);
          h=(sN(P*700.0)-0.5)*0.00008; col*=0.9+0.2*sN(P*90.0); rough=0.7;
          float lc=fract(vC2.x*62.0); float lx=smoothstep(0.32,0.28,abs(lc-0.5))*lace; col=mix(col,uCol2*0.9,lx); h+=lx*0.0012;
          col=mix(col,col*0.6,smoothstep(0.3,0.7,vC1.z)*0.5);
          vec3 sc=uCol2*(0.75+0.25*sN(P*300.0)); float tread=step(0.5,fract(vC2.x*45.0)); col=mix(col,sc*(0.8+0.2*tread),sole); rough=mix(rough,0.6,sole); h+=sole*tread*0.0006;
        }
        h*=fadeA;
        if(fab<7.5){
          // hems and stitching
          float hem=vC1.x; float dash=step(0.35,fract(dot(P,vec3(1.0,1.0,1.0))*240.0));
          float st=(smoothstep(0.0011,0.0004,abs(hem-0.008))+smoothstep(0.0011,0.0004,abs(hem-0.012))*step(1.5,fab))*dash*(1.0-smoothstep(0.0006,0.0014,fw));
          col=mix(col,col*1.5+0.06,st*0.55); h+=st*0.00025; h+=smoothstep(0.016,0.013,hem)*0.0005;
          float seam=smoothstep(0.0016,0.0005,abs(vC1.y)); col*=1.0-0.22*seam; h-=seam*0.0005;
          if(uPlacket>0.5){ float px=vC1.z;
            if(uPlacket<1.5){ float band=smoothstep(0.0165,0.015,px); h+=band*0.0005; col*=1.0-0.12*smoothstep(0.0025,0.0005,abs(px-0.0155));
              float by=(fract((vC1.w-0.945)/0.085)-0.5)*0.085; float bd=length(vec2(px,by)); float btn=smoothstep(0.0062,0.0052,bd)*step(vC1.w,1.44);
              col=mix(col,uCol2*(1.0-0.5*smoothstep(0.0022,0.0012,abs(bd-0.0025))),btn); h+=btn*0.0014; rough=mix(rough,0.35,btn); }
            else { float zt=smoothstep(0.0042,0.0034,px); float teeth=step(0.5,fract(vC1.w*420.0)); col=mix(col,vec3(0.55,0.55,0.56)*(0.6+0.4*teeth),zt); h+=zt*teeth*0.0006; gMetal=zt; rough=mix(rough,0.35,zt);
              col*=1.0-0.2*smoothstep(0.003,0.0005,abs(px-0.012)); }
          }
          if(uPiping>0.5){ float pd=abs(vC2.y); float silver=smoothstep(0.013,0.011,pd), hv=smoothstep(0.026,0.024,pd)*(1.0-silver);
            col=mix(col,vec3(0.86,0.9,0.12),hv); col=mix(col,vec3(0.72,0.74,0.76)*(0.85+0.15*sin(uv.x*3000.0)*sin(uv.y*3000.0)),silver); gPipe=silver; rough=mix(rough,0.4,silver); }
          col=mix(col,col*1.25+0.04,fray*0.6);
        }
        // blood soaking through from wounds underneath
        for(int i=0;i<${MAX_WOUNDS};i++){ if(i>=uWCount) break; vec3 wd=P-uWA[i].xyz; float kd=uWB[i].w; if((kd>3.5&&kd<8.5&&!(kd>7.5))||kd>8.5) continue;
          float sz=uWA[i].w; if(kd>7.5){ float s=dot(wd,uWB[i].xyz); float lat=length(wd-uWB[i].xyz*s); if(s>0.0&&lat<sz+s*0.9&&s<0.9) discard; continue; }
          float r=length(wd)/max(sz*(0.8+3.5*uWC[i].w)+0.012,1e-4); float m=smoothstep(1.0,0.5,r+(sF(P*120.0)-0.5)*0.6);
          col=mix(col,vec3(0.2,0.012,0.012),m*0.92); rough=mix(rough,0.3,m*uWC[i].w); }
        col*=mix(1.0,0.62,uWet*0.75); rough=mix(rough,min(rough,0.45),uWet*0.7);
        gRough=rough; gH=h;
        diffuseColor.rgb=col;
        float ndv=abs(dot(normalize(vNormal),normalize(vViewPosition)));
        diffuseColor.a=mix(1.0,clamp(0.03+0.3*pow(1.0-ndv,2.5),0.0,1.0),uClin2.z);
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor=clamp(gRough,0.05,1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor=gMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal=bumpN(normal,-vViewPosition,gH);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=vec3(0.8,0.85,0.9)*gPipe*uNight*0.22*pow(abs(dot(normal,normalize(vViewPosition))),2.0);')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.5,0.7,0.95)*(0.25+gl_FragColor.rgb),uClin2.z*0.75);');
  };
  mat.customProgramCacheKey = () => 'swm-cloth';
  return mat;
}

// Blood: flowing ribbons on the body and pools on the ground share one glossy dark-red material.
function bloodMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x4a0406, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aB; varying vec4 vB; varying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vB=aB; vRest=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec4 vB; varying vec3 vRest;${GL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float n=sF(vRest*24.0+vB.w*7.0), n2=sF(vRest*120.0); float edge=1.0-abs(vB.x);           // vB: x across (-1..1), y arrival (0 = reached), z thickness, w seed
        float a=smoothstep(0.0,0.06,edge-0.14+(n-0.5)*0.34+(n2-0.5)*0.05)*smoothstep(0.0,0.02,-vB.y);
        if(a<0.02) discard;
        diffuseColor.rgb=mix(vec3(0.2,0.006,0.008),vec3(0.05,0.001,0.002),clamp(vB.z*(0.25+0.95*edge),0.0,1.0)); diffuseColor.a=a*mix(0.84,0.985,clamp(vB.z,0.0,1.0)); }`);
  };
  mat.customProgramCacheKey = () => 'swm-blood';
  return mat;
}

// Give any material the surgical-opening discard (anatomy.js uses this on the layers under the skin).
export function patchOpenings(mat, human, extraKey = '') {
  const prev = mat.onBeforeCompile, hu = human.uniforms;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    for (const k of ['uOpCount', 'uOpA', 'uOpB', 'uOpN', 'uThCount', 'uThP', 'uThN', 'uThGape']) sh.uniforms[k] = hu[k];
    if (!sh.vertexShader.includes('vOpenPos')) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOpenPos;').replace('#include <project_vertex>', 'vOpenPos = position;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOpenPos;' + GL_OPEN).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if(openField(vOpenPos)>0.0) discard;');
  };
  const pk = mat.customProgramCacheKey?.bind(mat); mat.customProgramCacheKey = () => (pk ? pk() : '') + 'open' + extraKey;
  return mat;
}

// ---------------------------------------------------------------- building a person

const GM_TRUNK = 1, GM_NECK = 2, GM_HEAD = 4, GM_ARM = 8, GM_HAND = 16, GM_LEG = 32, GM_FOOT = 64;
// extra bits: each limb as proximal (upper arm / thigh) and distal (forearm + hand / shin + foot) so one limb can be
// evaluated on its own; LIMB_ALL[bone] is the whole limb that bone belongs to
const LIMB_BIT = { upperArm: [128, 256], forearm: [512, 1024], palm: [512, 1024], finger: [512, 1024], thigh: [2048, 4096], shin: [8192, 16384], foot: [8192, 16384] };
const GM_DISTAL = 512 | 1024 | 8192 | 16384, GM_PROX = 128 | 256 | 2048 | 4096, GM_AXIAL = 1 | 2 | 4;
const LIMB_ALL = { shoulderL: 128 | 512, elbowL: 128 | 512, wristL: 128 | 512, shoulderR: 256 | 1024, elbowR: 256 | 1024, wristR: 256 | 1024, hipL: 2048 | 8192, kneeL: 2048 | 8192, ankleL: 2048 | 8192, hipR: 4096 | 16384, kneeR: 4096 | 16384, ankleR: 4096 | 16384 };
const PART_MASK = { pelvis: GM_TRUNK, spine: GM_TRUNK, chest: GM_TRUNK, neck: GM_NECK, head: GM_HEAD, ear: GM_HEAD, upperArm: GM_ARM, forearm: GM_ARM, palm: GM_HAND, finger: GM_HAND, thigh: GM_LEG, shin: GM_LEG, foot: GM_FOOT };

const srgb = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
function ramp(stops, t) { t = clamp(t) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i; return srgb(lerp(stops[i][0], stops[i + 1][0], f), lerp(stops[i][1], stops[i + 1][1], f), lerp(stops[i][2], stops[i + 1][2], f)); }
const SKIN_STOPS = [[240, 208, 188], [224, 180, 150], [190, 142, 106], [132, 90, 62], [68, 44, 32]], LIP_STOPS = [[186, 104, 104], [168, 92, 90], [150, 86, 80], [112, 62, 58], [84, 48, 46]];

function normalizeSpec(s) {
  const o = { sex: 'm', age: 35, bmi: 24, build: 0.4, skin: 0.25, beard: 0, pose: 'supine', eyes: 'open', seed: 1, detail: 'high', ...s };
  o.hair = { style: 'short', color: 0x2a1c12, ...(s.hair || {}) };
  o.clothing = { top: 'tshirt', topColor: 0x5a6a78, bottom: 'jeans', bottomColor: 0x27344a, shoes: 'trainers', underwear: true, ...(s.clothing || {}) };
  if (!POSES[o.pose]) o.pose = 'supine';
  return o;
}

// Lowest point of the body (root y) found by casting up under every primitive that could be touching the ground.
function groundContact(model) {
  const fn = model.fn(1, 0); let lowB = 1e9; const cand = [];
  for (const g of model.groups) for (const rec of g.data) { if (rec[1] !== 0 || rec[0] === 5 || rec[4] > 3) continue; const b = rec[6] - rec[8]; cand.push([rec[5], b, rec[7]]); if (b < lowB) lowB = b; }
  let low = 1e9;
  for (const c of cand) { if (c[1] > lowB + 0.14) continue; const t = sdfRaycast(fn, c[0], lowB - 0.06, c[2], 0, 1, 0, 0.5, 2e-4); if (t >= 0) low = Math.min(low, lowB - 0.06 + t); }
  return low > 1e8 ? lowB : low;
}

const _p4 = new THREE.Vector3();
function apply(m, x, y, z, out) { const e = m.elements; out[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[2] = e[2] * x + e[6] * y + e[10] * z + e[14]; return out; }
function applyDir(m, x, y, z, out) { const e = m.elements; out[0] = e[0] * x + e[4] * y + e[8] * z; out[1] = e[1] * x + e[5] * y + e[9] * z; out[2] = e[2] * x + e[6] * y + e[10] * z; const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l; return out; }
const segDist2 = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));

// Chest / abdomen breathing weights for a reference-frame point of the given part: [left chest, right chest, abdomen, trunk].
function breathW(part, rx, ry, rz, out) {
  out[0] = out[1] = out[2] = out[3] = 0;
  if (part !== 'chest' && part !== 'spine' && part !== 'pelvis') return out;
  const w = smooth(1.13, 1.22, ry) * (1 - smooth(1.41, 1.47, ry)) * (0.3 + 0.7 * smooth(-0.06, 0.07, rz)) * (1 - smooth(0.15, 0.19, Math.abs(rx)));
  const l = smooth(-0.025, 0.025, rx); out[0] = w * l; out[1] = w * (1 - l);
  out[2] = smooth(0.95, 1.05, ry) * (1 - smooth(1.2, 1.31, ry)) * smooth(-0.02, 0.08, rz);
  out[3] = smooth(0.98, 1.1, ry) * smooth(-0.07, 0.0, rz); return out;
}

// Underwear as a signed field (metres inside the fabric): boxer-briefs for everyone, a sports bra for women and girls.
function underwearField(part, D, rx, ry, rz) {
  let f = -0.02;
  if (part === 'pelvis' || part === 'spine' || part === 'thigh') f = Math.min((D.fem ? 1.0 : 0.992) - ry, ry - (D.fem ? 0.842 : 0.8));
  if (D.fem && (part === 'chest' || part === 'upperArm' || part === 'neck')) {
    const ax = Math.abs(rx), top = (rz > -0.02 ? 1.388 : 1.41) + 0.115 * smooth(0.045, 0.075, ax) - 0.168 * smooth(0.105, 0.14, ax);
    f = Math.max(f, part === 'chest' ? Math.min(ry - 1.262, top - ry) : -0.02);
  }
  return clamp(f, -0.02, 0.03);
}

export async function buildHuman(specIn = {}, onProgress) {
  const spec = normalizeSpec(specIn), low = spec.detail === 'low', t0 = performance.now();
  const prog = (f) => onProgress?.(clamp(f));
  // crew and bystanders (low detail, standing) look down at the patient unless told otherwise
  const D = makeDims(spec), rig = makeRig(D, spec.pose, spec.gaze ?? (low && spec.pose === 'standing' ? 'down' : null)), rng = makeRng(spec.seed * 2654435 + 77);
  const group = new THREE.Group(); group.name = 'human'; group.add(rig.root);

  // pass 1: plain body, to find where it meets the ground and where surface details sit
  let body = buildBody(rig, spec, null);
  const feat = (() => {
    const fn = body.model.fn(1, 0), o = [0, 0, 0], d = [0, 0, 0], r = [0, 0, 0], hit = (bone, x, y) => {
      apply(rig.A[bone], x, y, 0.5, o); applyDir(rig.A[bone], 0, 0, -1, d); const t = sdfRaycast(fn, o[0], o[1], o[2], d[0], d[1], d[2], 1); if (t < 0) return [x, y, 0.12];
      apply(rig.Ainv[bone], o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t, r); return [x, y, r[2]];
    };
    return { navel: hit('spine', 0, 1.055), nipple: hit('chest', 0.103, 1.322) };
  })();
  const ground = groundContact(body.model);
  rig.place(-ground - (rig.poseName === 'standing' || rig.pose.seat ? 0.0 : 0.004));
  body = buildBody(rig, spec, feat);
  const model = rig.model = body.model, fields = rig.fields = body.fields, groups = model.groups;
  for (const g of groups) { g.mask = PART_MASK[g.part] || 1; const lb = LIMB_BIT[g.part]; if (lb) { g.mask |= lb[g.side > 0 ? 0 : 1]; g.distal = g.part !== 'upperArm' && g.part !== 'thigh'; g.limb = g.distal ? LIMB_ALL[g.bone] & GM_DISTAL : LIMB_ALL[g.bone]; } }
  const skinFn = model.fn(1, 0);
  const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
  const A = rig.A, Ai = rig.Ainv;
  const shod = spec.clothing.shoes && spec.clothing.shoes !== 'none';

  // seat height for seated poses: underside of the buttocks
  let seat = null;
  if (rig.pose.seat) { let s = 1e9; for (const sx of [-0.09, 0.09]) { const t = sdfRaycast(skinFn, sx * D.hipW, 0.02, -0.03, 0, 1, 0, 1.2); if (t >= 0) s = Math.min(s, 0.02 + t); } seat = s < 1e8 ? s : D.legLen * 0.5; }

  // ---- mesh regions: body, head/neck, face, ears, hands, feet (each a field < 0 inside, roughly metres)
  const capsule = (p, a, b, r) => { const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2]; let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz); h = h < 0 ? 0 : h > 1 ? 1 : h; return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r; };
  const cHead = (x, y, z) => { apply(Ai.neck, x, y, z, tmp); const a = capsule(tmp, [0, 1.458, -0.012], [0, 1.6, -0.01], 0.1) * D.sx; apply(Ai.head, x, y, z, tmp); return Math.min(a, (Math.hypot(tmp[0], tmp[1] - 1.652, tmp[2] + 0.004) - 0.132) * D.headS); };
  const cFace = (x, y, z) => { apply(Ai.head, x, y, z, tmp); return (Math.hypot(tmp[0], tmp[1] - 1.61, tmp[2] - 0.078) - 0.088) * D.headS; };
  const cEar = (x, y, z) => { apply(Ai.head, x, y, z, tmp); return (Math.hypot(Math.abs(tmp[0]) - 0.083, tmp[1] - 1.632, tmp[2] + 0.016) - 0.04) * D.headS; };
  const cHand = (x, y, z) => { let m = 1e9; for (const s of [1, -1]) { apply(s > 0 ? Ai.wristL : Ai.wristR, x, y, z, tmp); m = Math.min(m, Math.max(capsule(tmp, [s * 0.192, 0.86, 0.002], [s * 0.205, 0.68, 0.014], 0.1), tmp[1] - 0.862) * D.handS); } return m; };
  const cFoot = (x, y, z) => { let m = 1e9; for (const s of [1, -1]) { apply(s > 0 ? Ai.ankleL : Ai.ankleR, x, y, z, tmp); m = Math.min(m, (shod ? capsule(tmp, [s * 0.07, 0.03, -0.06], [s * 0.07, 0.02, 0.135], 0.064) : capsule(tmp, [s * 0.07, 0.06, -0.06], [s * 0.07, 0.03, 0.14], 0.092)) * D.footS); } return m; };
  const R = low ? { body: 0.014, head: 0.0062, hand: 0.0062, foot: 0.008, cloth: 0.017, hair: 0.009, shoe: 0.009 } : { body: 0.0093, head: 0.0039, face: 0.0022,  ear: 0.0017, hand: 0.0029, foot: 0.0045, cloth: 0.0094, hair: 0.005, shoe: 0.0075 };
  const boxOf = (pred, pad) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const g of groups) { if (!g.n || !pred(g)) continue; for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], g.box[i] - g.fatMax - pad); b[i + 3] = Math.max(b[i + 3], g.box[i + 3] + g.fatMax + pad); } } return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] }; };

  // ---- per-vertex paint masks (see the attribute list in skinMaterial)
  const style = spec.hair.style, bw = [0, 0, 0, 0], nrm = [0, 0, 0];
  const veins = REF.veins;
  function skinVertex(x, y, z, nx, ny, nz, Ar, i) {
    model.eval(x, y, z, 1, 0); const g = groups[model.hit] || groups[0], part = g.part, side = g.side || 1, bone = g.bone;
    apply(Ai[bone], x, y, z, tmp); const rx = tmp[0], ry = tmp[1], rz = tmp[2], ax = Math.abs(rx);
    applyDir(Ai[bone], nx, ny, nz, nrm);
    let lip = -0.01, nailF = -0.01, under = -0.02, hairF = -0.02, red = 0, thinF = 0, palm = 0, vein = -0.02, beard = 0, brow = -0.01, cyanP = 0, lash = 0, areola = 0, wr = 0, oil = 0, mouthIn = 0, jaw = 0, jvd = 0, trach = 0;
    if (part === 'head' || part === 'ear') {
      if (part === 'ear') { red = 0.55; thinF = 1; if (ry < 1.613) cyanP = 1; }
      else {
        if (ry > 1.553 && ry < 1.59 && rz > 0.066 && ax < 0.03) { const tx = Math.min(1, ax / 0.0238), ym = rig.mouthY + 0.0006 * tx * tx, yu = ym + rig.lipH[0] * Math.pow(1 - tx * tx, 0.75) - 0.0011 * Math.exp(-((ax / 0.0042) ** 2)), yl = ym - rig.lipH[1] * Math.pow(Math.max(0, 1 - (ax / 0.0215) ** 2), 0.6); lip = clamp(Math.min(yu - ry, ry - yl, (0.0238 - ax) * 0.6), -0.01, 0.004); }
        if (ry > 1.615 && ry < 1.665 && rz > 0.055) { const d = -rig.eyeFis(x, y, z); if (d < 0) lip = 0.002; else lash = (1 - smooth(0.0001, 0.0011, d)) * (rig.eyeFis.up ? 1 : 0.3); brow = clamp(-fields.brow.eval(x, y, z, 1, 0), -0.01, 0.004); }
        else if (ry >= 1.655 && ry < 1.69 && rz > 0.05) brow = clamp(-fields.brow.eval(x, y, z, 1, 0), -0.01, 0.004);
        hairF = clamp(hairField(rx, ry, rz, style), -0.02, 0.02);
        red = 0.8 * gauss((ax - 0.043) ** 2 + (ry - 1.602) ** 2, 0.017) * smooth(0.03, 0.06, rz) + 0.7 * gauss(rx * rx + (ry - 1.602) ** 2 + (rz - 0.113) ** 2, 0.012) + 0.2 * gauss(rx * rx + (ry - 1.552) ** 2, 0.02) * smooth(0.04, 0.07, rz);
        thinF = 0.45 * gauss((ax - 0.014) ** 2 + (ry - 1.597) ** 2 + (rz - 0.102) ** 2, 0.008) + 0.25 * smooth(-0.002, 0, lip);
        if (ry < 1.6 && ry > 1.586 && rz > 0.09 && sdEllipsoid(ax - 0.0066 * rig.nw, ry - 1.5926, rz - 0.0995, 0.0038, 0.0033, 0.0064) < 0.0002) lash = 0.95;
        cyanP = 0.6 * gauss(rx * rx + (ry - 1.602) ** 2 + (rz - 0.113) ** 2, 0.012);
        const lineY = 1.632 - 0.05 * smooth(0.0, 0.07, rz);
        beard = (1 - smooth(lineY - 0.008, lineY + 0.01, ry)) * smooth(-0.022, 0.008, rz) * (1 - smooth(-0.0018, -0.0002, lip));
        wr = Math.max(smooth(1.668, 1.68, ry) * smooth(0.04, 0.07, rz), 0.9 * gauss((ax - 0.052) ** 2 + (ry - 1.64) ** 2, 0.012) * smooth(0.03, 0.05, rz), 0.5 * smooth(1.6, 1.58, ry) * smooth(0.02, 0.05, ax));
        oil = gauss(rx * rx, 0.022) * smooth(0.055, 0.075, rz);
        const yc = rig.mouthY + 0.0006 * Math.min(1, ax / 0.0238) ** 2;
        if (rz > 0.07 && ax < 0.0245) mouthIn = (1 - smooth(0.0016, 0.0034, Math.abs(ry - yc))) * (1 - smooth(0.0175, 0.0215, ax));
        const hh = 0.0004 + 0.016 * smooth(0.0145, 0.0215, ax) + 0.03 * smooth(0.02, 0.046, ax);
        jaw = (1 - smooth(yc - hh, yc + hh, ry)) * smooth(-0.02, 0.022, rz);
      }
    } else if (part === 'neck') {
      beard = smooth(1.5, 1.535, ry) * smooth(0.0, 0.025, rz) * 0.8; wr = 0.35; hairF = clamp(hairField(rx, ry, rz, style), -0.02, 0.02);
      jaw = smooth(1.505, 1.545, ry) * smooth(0.0, 0.035, rz) * 0.55;
      jvd = gauss(segDist2(ax, ry, 0.056, 1.575, 0.043, 1.462) ** 2, 0.0055) * smooth(-0.03, 0.01, rz);
      trach = gauss(rx * rx + (ry - 1.482) ** 2, 0.017) * smooth(0.015, 0.035, rz);
    }
    if (part === 'chest' || part === 'spine' || part === 'pelvis' || part === 'thigh' || part === 'upperArm' || part === 'neck') {
      under = underwearField(part, D, rx, ry, rz);
      if (part === 'chest' && !D.fem) areola = gauss((ax - feat.nipple[0]) ** 2 + (ry - feat.nipple[1]) ** 2, 0.0072) * smooth(0.03, 0.06, rz);
      if (part === 'chest' && ry > 1.44) { jvd = Math.max(jvd, 0); }
    }
    if (part === 'forearm') red = 0.55 * gauss((ry - 1.085) ** 2 + (rz + 0.04) ** 2, 0.022);
    if (part === 'palm' || part === 'finger') {
      const pal = smooth(0.1, 0.5, nrm[2]); palm = pal; thinF = part === 'finger' ? 0.55 : 0.15; red = (1 - pal) * (part === 'finger' ? 0.4 : 0.25) + pal * 0.25;
      { let kd = 1; for (const kp of rig.knuckles) { const d = Math.hypot(x - kp[0], y - kp[1], z - kp[2]); if (d < kd) kd = d; } const kw = Math.exp(-((kd / (0.0062 * D.handS)) ** 2)); wr = 1 + kw; red += 0.35 * kw * (1 - pal); }
      if (part === 'finger') { cyanP = 0.5; nailF = clamp(-fields.nail.eval(x, y, z, 1, 0), -0.01, 0.003); }
    }
    if (part === 'shin') red = 0.5 * gauss((ry - 0.505) ** 2 + (rz - 0.05) ** 2, 0.03);
    if (part === 'foot') {
      const sole = smooth(0.3, 0.7, -nrm[1]); palm = sole; red = 0.25 * gauss((rz + 0.07) ** 2, 0.03);
      if (rz > 0.105) { cyanP = 0.5; thinF = 0.3; nailF = clamp(-fields.nail.eval(x, y, z, 1, 0), -0.01, 0.003); }
    }
    if (part === 'upperArm' || part === 'forearm' || part === 'palm') {
      const bn = part === 'upperArm' ? 'shoulder' : part === 'forearm' ? 'elbow' : 'wrist', lx = rx * side;
      for (const v of veins) { if (v.bone !== bn || nrm[2] * v.side < 0.12) continue; const p = v.pts; for (let k = 1; k < p.length; k++) { const d = segDist2(lx, ry, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1]) - v.r * 0.4; if (-d > vein) vein = -d; } }
      vein = Math.max(vein, -0.02) * (0.6 + 0.4 * clamp(D.mus)) / Math.max(0.7, Math.sqrt(D.g));
    }
    breathW(part, rx, ry, rz, bw);
    const o = i * 4;
    Ar.aM0[o] = lip; Ar.aM0[o + 1] = nailF; Ar.aM0[o + 2] = spec.clothing.underwear === false ? -0.02 : under; Ar.aM0[o + 3] = hairF;
    Ar.aM1[o] = red; Ar.aM1[o + 1] = thinF; Ar.aM1[o + 2] = palm; Ar.aM1[o + 3] = vein;
    Ar.aM2[o] = beard; Ar.aM2[o + 1] = brow; Ar.aM2[o + 2] = cyanP; Ar.aM2[o + 3] = lash;
    Ar.aM3[o] = areola; Ar.aM3[o + 1] = wr; Ar.aM3[o + 2] = oil; Ar.aM3[o + 3] = mouthIn;
    Ar.aDef[o] = bw[0]; Ar.aDef[o + 1] = bw[1]; Ar.aDef[o + 2] = bw[2]; Ar.aDef[o + 3] = bw[3];
    Ar.aDef2[o] = jaw; Ar.aDef2[o + 1] = jvd; Ar.aDef2[o + 2] = trach; Ar.aDef2[o + 3] = 0;
  }
  const SKIN_ATTR = { aM0: 4, aM1: 4, aM2: 4, aM3: 4, aDef: 4, aDef2: 4, aLid: 4 };

  // ---- skin meshes
  const jobs = [];
  const dl = (a, b) => 1.6 * Math.max(a, b);
  if (low) {
    jobs.push({ w: 3, box: model.bounds(0.02), res: R.body, keep: (x, y, z) => cHead(x, y, z) > -0.4 * R.body && cHand(x, y, z) > -0.4 * R.body && cFoot(x, y, z) > (shod ? 0 : -dl(R.body, R.foot)), skip: (x, y, z, r) => cHead(x, y, z) < -r - 0.03 || cHand(x, y, z) < -r - 0.03 || cFoot(x, y, z) < -r - 0.03 });
    jobs.push({ w: 2, box: boxOf(g => g.mask & (GM_HEAD | GM_NECK), 0.01), res: R.head, keep: (x, y, z) => cHead(x, y, z) < dl(R.body, R.head), skip: (x, y, z, r) => cHead(x, y, z) > r + 0.03 });
    jobs.push({ w: 2, box: boxOf(g => g.mask & (GM_HAND | GM_ARM), 0.01), res: R.hand, keep: (x, y, z) => cHand(x, y, z) < dl(R.body, R.hand), skip: (x, y, z, r) => cHand(x, y, z) > r + 0.02 });
  } else {
    jobs.push({ w: 4, box: model.bounds(0.02), res: R.body, keep: (x, y, z) => cHead(x, y, z) > -0.4 * R.body && cHand(x, y, z) > -0.4 * R.body && cFoot(x, y, z) > (shod ? 0 : -dl(R.body, R.foot)), skip: (x, y, z, r) => cHead(x, y, z) < -r - 0.03 || cHand(x, y, z) < -r - 0.03 || cFoot(x, y, z) < -r - 0.03 });
    jobs.push({ w: 3, box: boxOf(g => g.mask & (GM_HEAD | GM_NECK), 0.012), res: R.head, keep: (x, y, z) => cHead(x, y, z) < dl(R.body, R.head) && cFace(x, y, z) > -0.4 * R.head && cEar(x, y, z) > -0.4 * R.head, skip: (x, y, z, r) => cHead(x, y, z) > r + 0.03 || cFace(x, y, z) < -r - 0.02 });
    jobs.push({ w: 3, box: boxOf(g => g.part === 'head', 0.004), res: R.face, eps: 0.0005, keep: (x, y, z) => cFace(x, y, z) < dl(R.head, R.face) && cEar(x, y, z) > -0.4 * R.face, skip: (x, y, z, r) => cFace(x, y, z) > r + 0.012 });
    jobs.push({ w: 1, box: boxOf(g => g.part === 'ear', 0.03), res: R.ear, eps: 0.0004, keep: (x, y, z) => cEar(x, y, z) < dl(R.head, R.ear), skip: (x, y, z, r) => cEar(x, y, z) > r + 0.01 });
    jobs.push({ w: 2, box: boxOf(g => g.mask & GM_HAND, 0.05), res: R.hand, eps: 0.0005, keep: (x, y, z) => cHand(x, y, z) < dl(R.body, R.hand), skip: (x, y, z, r) => cHand(x, y, z) > r + 0.02 });
  }
  if (!shod) jobs.push({ w: 1, box: boxOf(g => g.mask & GM_FOOT, 0.07), res: R.foot, keep: (x, y, z) => cFoot(x, y, z) < dl(R.body, R.foot), skip: (x, y, z, r) => cFoot(x, y, z) > r + 0.02 });
  const garmentJobs = [];   // filled below; counted in the progress total
  const top = GARMENT_TOP[spec.clothing.top], bottom = GARMENT_BOTTOM[spec.clothing.bottom];
  const totalW = jobs.reduce((a, j) => a + j.w, 0) + (top ? 2 : 0) + (bottom ? 2 : 0) + (shod ? 1 : 0) + 1;
  let doneW = 0;
  const run = async (fn, j, extra) => { const g = await meshSDFAsync(fn, j.box, j.res, { keep: j.keep, skip: j.skip, eps: j.eps, slack: 1.35, ...extra, onProgress: f => prog((doneW + j.w * f) / totalW) }); doneW += j.w; prog(doneW / totalW); return g; };
  const skinGeos = [];
  // Seams: where a coarser mesh runs under a finer one it is sunk a fraction of a millimetre, so the finer surface
  // always wins the depth test and the ragged edge of the coarse mesh never shows.
  const sinkOf = [
    (x, y, z) => Math.min(cHead(x, y, z), cHand(x, y, z), shod ? 1 : cFoot(x, y, z)),                // body under head, hands, feet
    low ? null : (x, y, z) => Math.min(cFace(x, y, z), cEar(x, y, z)),                                 // head under face and ears
    low ? null : (x, y, z) => cEar(x, y, z),                                                           // face under ears
  ];
  for (let ji = 0; ji < jobs.length; ji++) {
    const j = jobs[ji], g = await run(skinFn, j, { attributes: SKIN_ATTR, vertex: skinVertex }); if (!g) continue;
    const sf = sinkOf[ji];
    if (sf) { const p = g.attributes.position, n = g.attributes.normal, dlt = 1.6 * j.res; for (let i = 0; i < p.count; i++) { const c = sf(p.getX(i), p.getY(i), p.getZ(i)); if (c > dlt) continue; const a = 0.2 * j.res * (1 - smooth(0.55 * dlt, dlt, c)); p.setXYZ(i, p.getX(i) - n.getX(i) * a, p.getY(i) - n.getY(i) * a, p.getZ(i) - n.getZ(i) * a); } }
    skinGeos.push(g);
  }

  // ---- eyelids (spherical shells that rotate about the eye) and eyeballs
  const hX = new THREE.Vector3().setFromMatrixColumn(A.head, 0).normalize(), hY = new THREE.Vector3().setFromMatrixColumn(A.head, 1).normalize(), hZ = new THREE.Vector3().setFromMatrixColumn(A.head, 2).normalize();
  const E = REF.eye, eyeGeos = [], eyeCentres = [];
  {
    const P = [], N = [], I = [], LID = [], M0 = [], M2 = [], M3 = [], D2 = [], NA = 14, NE = 7, rl = 0.0133;
    // one extra vertex of the skin mesh, given in the head's reference frame, with the few masks that matter here
    const pv = (x, y, z, nx, ny, nz, o) => {
      apply(A.head, x, y, z, tmp); applyDir(A.head, nx, ny, nz, tmp2); P.push(tmp[0], tmp[1], tmp[2]); N.push(tmp2[0], tmp2[1], tmp2[2]);
      M0.push(o.lip ?? -0.01, o.tooth ? 0.02 : -0.01, -0.02, -0.02); M2.push(0, -0.01, 0, o.lash ?? 0); M3.push(0, 0, 0, o.cavity ? 2 : 0); D2.push(o.jaw ?? 0, 0, 0, 0);
      if (o.lid) LID.push(o.lid[0], o.lid[1], o.lid[2], o.lid[3]); else LID.push(0, 0, 0, 0); return P.length / 3 - 1;
    };
    const grid = (nu, nv, base, flip) => { for (let a = 0; a < nu; a++) for (let e = 0; e < nv; e++) { const i0 = base + a * (nv + 1) + e, i1 = i0 + nv + 1; if (flip) I.push(i0, i1 + 1, i1, i0, i0 + 1, i1 + 1); else I.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1); } };
    for (const s of [1, -1]) {
      const c = apply(A.head, s * E[0], E[1], E[2], [0, 0, 0]); eyeCentres.push(new THREE.Vector3(c[0], c[1], c[2]));
      for (const up of [1, -1]) {
        const base = P.length / 3, e0 = -8 * DEG, e1 = up > 0 ? 56 * DEG : -54 * DEG, lidRef = [c[0], c[1], c[2], up];
        for (let a = 0; a <= NA; a++) for (let e = 0; e <= NE; e++) {
          const az = (a / NA - 0.5) * 150 * DEG, el = lerp(e0, e1, e / NE), l = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
          pv(s * E[0] + l[0] * rl, E[1] + l[1] * rl, E[2] + l[2] * rl, l[0], l[1], l[2], { lid: lidRef, lash: e === 0 ? 1 : e === 1 ? 0.35 : 0 });
        }
        grid(NA, NE, base, up < 0);
        if (up > 0 && !low) {       // lashes: a fringe of alpha-cut strands on the upper lid margin (they ride the lid)
          const lb = P.length / 3, NL = 22;
          for (let a = 0; a <= NL; a++) {
            const t = a / NL, az = (t - 0.5) * 118 * DEG, len = 0.0062 * (0.55 + 0.45 * Math.sin(Math.PI * t)), el0 = e0 + 0.02, el1 = e0 - 0.16;
            const r0 = [Math.sin(az) * Math.cos(el0), Math.sin(el0), Math.cos(az) * Math.cos(el0)], r1 = [Math.sin(az * 1.12) * Math.cos(el1), Math.sin(el1) + 0.12, Math.cos(az * 1.12) * Math.cos(el1)];
            pv(s * E[0] + r0[0] * (rl + 0.0009), E[1] + r0[1] * (rl + 0.0009), E[2] + r0[2] * (rl + 0.0009), 0, 0.7, 0.7, { lid: lidRef, lash: 2 });
            pv(s * E[0] + r0[0] * rl + r1[0] * len, E[1] + r0[1] * rl + r1[1] * len, E[2] + r0[2] * rl + r1[2] * len, 0, 0.7, 0.7, { lid: lidRef, lash: 3 });
          }
          for (let a = 0; a < NL; a++) { const i0 = lb + a * 2, i1 = i0 + 2; I.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1, i0, i1 + 1, i1, i0, i0 + 1, i1 + 1); }
        }
      }
      // eyeball
      const sg = new THREE.SphereGeometry(1, low ? 12 : 22, low ? 8 : 14), sp = sg.attributes.position, n = sp.count, ep = new Float32Array(n * 3), en = new Float32Array(n * 3), ea = new Float32Array(n * 4);
      const gz = (rng() - 0.5) * 0.08, gy = (rng() - 0.5) * 0.05;
      for (let i = 0; i < n; i++) {
        const lx = sp.getX(i), ly = sp.getY(i), lz = sp.getZ(i);
        const wx = lx + lz * gz, wy = ly + lz * gy, wz = lz - lx * gz - ly * gy, wl = Math.hypot(wx, wy, wz);
        apply(A.head, s * E[0] + wx / wl * REF.eyeR, E[1] + wy / wl * REF.eyeR, E[2] + wz / wl * REF.eyeR, tmp); applyDir(A.head, wx, wy, wz, tmp2);
        ep.set(tmp, i * 3); en.set(tmp2, i * 3); ea[i * 4] = lx; ea[i * 4 + 1] = ly; ea[i * 4 + 2] = lz; ea[i * 4 + 3] = s > 0 ? 0 : 1;
      }
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('normal', new THREE.BufferAttribute(en, 3)); eg.setAttribute('aEye', new THREE.BufferAttribute(ea, 4)); eg.setIndex(sg.index); eyeGeos.push(eg); sg.dispose();
    }
    // the mouth behind the lips: a dark cavity, two arches of teeth and the tongue; the lower ones ride the jaw
    {
      const cy = rig.mouthY, cz = 0.061, rx = 0.0262, ry = 0.0175, rz = 0.031, NT = 10, NP = 14, cb = P.length / 3;
      for (let a = 0; a <= NP; a++) for (let e = 0; e <= NT; e++) {
        const th = e / NT * 180 * DEG, ph = a / NP * Math.PI * 2, x = rx * Math.sin(th) * Math.cos(ph), y = ry * Math.sin(th) * Math.sin(ph), z = -rz * Math.cos(th);
        pv(x, cy + y, cz + z, -x / rx, -y / ry, -z / rz, { cavity: true, jaw: clamp(-y / 0.004) });
      }
      grid(NP, NT, cb, true);
      for (const lower of [0, 1]) {
        const tb = P.length / 3, R0 = lower ? 0.0192 : 0.0205, y0 = lower ? 1.5703 : 1.5736, y1 = lower ? 1.5638 : 1.5672, NS = 16;
        for (let a = 0; a <= NS; a++) for (let e = 0; e <= 1; e++) { const an = (a / NS - 0.5) * 156 * DEG; pv(R0 * Math.sin(an), e ? y1 : y0, 0.0625 + R0 * 0.92 * Math.cos(an), Math.sin(an), 0, Math.cos(an), { tooth: true, jaw: lower }); }
        grid(NS, 1, tb, true);
      }
      const gb = P.length / 3, NG = 8;
      for (let a = 0; a <= NG; a++) for (let e = 0; e <= NG; e++) { const u = a / NG * 2 - 1, v = e / NG, x = 0.0165 * u * Math.sqrt(1 - 0.35 * v * v), z = 0.043 + 0.036 * v, h = Math.sqrt(Math.max(0, 1 - u * u)) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, v * 1.15))); pv(x, 1.5628 + 0.004 * h, 0.046 + (z - 0.043) * 0.9, u * 0.5, 0.85, 0.1, { lip: 0.004, jaw: 1 }); }
      grid(NG, NG, gb, false);
    }
    const lg = new THREE.BufferGeometry(), nv = P.length / 3, z4 = () => new THREE.BufferAttribute(new Float32Array(nv * 4), 4);
    lg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); lg.setIndex(new THREE.BufferAttribute(new Uint32Array(I), 1));
    const m1 = new Float32Array(nv * 4); for (let i = 0; i < nv; i++) m1[i * 4 + 3] = -0.02;
    lg.setAttribute('aM0', new THREE.Float32BufferAttribute(M0, 4)); lg.setAttribute('aM1', new THREE.BufferAttribute(m1, 4)); lg.setAttribute('aM2', new THREE.Float32BufferAttribute(M2, 4)); lg.setAttribute('aM3', new THREE.Float32BufferAttribute(M3, 4));
    lg.setAttribute('aDef', z4()); lg.setAttribute('aDef2', new THREE.Float32BufferAttribute(D2, 4)); lg.setAttribute('aLid', new THREE.Float32BufferAttribute(LID, 4));
    skinGeos.push(lg);
  }
  for (const g of skinGeos) if (g.index.array.constructor !== Uint32Array) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  const skinGeo = mergeGeometries(skinGeos, false); for (const g of skinGeos) g.dispose();
  skinGeo.computeBoundingBox(); skinGeo.computeBoundingSphere();

  // ---- uniforms shared by this person's materials
  const tone = clamp(spec.skin), V4 = () => new THREE.Vector4(0, 0, 0, 0), V3 = () => new THREE.Vector3();
  const skinCol = ramp(SKIN_STOPS, tone), lipCol = ramp(LIP_STOPS, tone).lerp(skinCol, D.fem ? 0.05 : 0.18);
  const cprA = { pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) };
  const jp = apply(A.head, 0, 1.622, -0.006, [0, 0, 0]), hp = apply(A.head, 0, 1.64, 0, [0, 0, 0]);
  const hu = {
    uBreath: { value: new THREE.Vector4(0, 1, 1, 1) }, uCpr: { value: V4() }, uCprDir: { value: V3() }, uParadox: { value: new THREE.Vector4(0, 0, 0, 0.05) }, uParadoxAmt: { value: 0 },
    uLid: { value: 1 }, uJaw: { value: 0 }, uJawPivot: { value: new THREE.Vector3(jp[0], jp[1], jp[2]) }, uHeadX: { value: hX }, uHeadY: { value: hY }, uHeadPos: { value: new THREE.Vector3(hp[0], hp[1], hp[2]) },
    uJVD: { value: 0 }, uTrachea: { value: 0 }, uClin: { value: V4() }, uClin2: { value: new THREE.Vector4(0, 0, 0, D.old) },
    uSkin: { value: skinCol }, uLip: { value: lipCol }, uPalm: { value: skinCol.clone().lerp(srgb(236, 190, 172), 0.3 + 0.35 * tone) }, uHairCol: { value: new THREE.Color(spec.hair.color) },
    uUnderCol: { value: new THREE.Color(rng.pick([0xc9c9cc, 0x25282e, 0x18233a, 0x6f7278])) }, uTone: { value: tone }, uBeard: { value: D.fem || D.kid > 0.5 ? 0 : clamp(spec.beard) },
    uScalp: { value: style === 'bald' ? 0.12 : style === 'buzz' ? 0.85 : 0.97 }, uFreckle: { value: tone < 0.3 && rng() < 0.3 ? 0.5 : 0 }, uPupil: { value: new THREE.Vector2(3.5, 3.5) },
    uWCount: { value: 0 }, uWA: { value: Array.from({ length: MAX_WOUNDS }, V4) }, uWB: { value: Array.from({ length: MAX_WOUNDS }, V4) }, uWC: { value: Array.from({ length: MAX_WOUNDS }, V4) },
    uOpCount: { value: 0 }, uOpA: { value: Array.from({ length: MAX_OPEN }, V4) }, uOpB: { value: Array.from({ length: MAX_OPEN }, V4) }, uOpN: { value: Array.from({ length: MAX_OPEN }, V3) },
    uThCount: { value: 0 }, uThP: { value: Array.from({ length: MAX_THOR }, V3) }, uThN: { value: Array.from({ length: MAX_THOR }, V3) }, uThGape: { value: 0 },
    uExpose: { value: V4() },
  };
  const skinMat = skinMaterial(hu);
  const skinMesh = new THREE.Mesh(skinGeo, skinMat); skinMesh.name = 'skin'; skinMesh.castShadow = skinMesh.receiveShadow = true; skinMesh.frustumCulled = true; group.add(skinMesh);
  // picking: sphere-trace the body instead of testing every triangle
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _inv = new THREE.Matrix4();
  skinMesh.raycast = function (raycaster, hits) {
    _inv.copy(this.matrixWorld).invert(); _ro.copy(raycaster.ray.origin).applyMatrix4(_inv); _rd.copy(raycaster.ray.direction).transformDirection(_inv);
    const bs = this.geometry.boundingSphere, oc = _p4.copy(bs.center).sub(_ro), tc = oc.dot(_rd), d2 = oc.lengthSq() - tc * tc; if (d2 > bs.radius * bs.radius) return;
    const tStart = Math.max(0, tc - bs.radius), t = sdfRaycast(skinFn, _ro.x + _rd.x * tStart, _ro.y + _rd.y * tStart, _ro.z + _rd.z * tStart, _rd.x, _rd.y, _rd.z, 2 * bs.radius + 0.1, 3e-4);
    if (t < 0) return;
    const pt = new THREE.Vector3(_ro.x + _rd.x * (tStart + t), _ro.y + _rd.y * (tStart + t), _ro.z + _rd.z * (tStart + t)).applyMatrix4(this.matrixWorld), dist = pt.distanceTo(raycaster.ray.origin);
    if (dist < raycaster.near || dist > raycaster.far) return;
    hits.push({ distance: dist, point: pt, object: this });
  };
  const noPick = m => { m.raycast = () => { }; return m; };

  const irisCol = tone > 0.45 ? new THREE.Color(0.11, 0.045, 0.018) : rng.pick([new THREE.Color(0.1, 0.19, 0.3), new THREE.Color(0.17, 0.2, 0.08), new THREE.Color(0.19, 0.09, 0.03), new THREE.Color(0.14, 0.2, 0.24)]);
  const eyeMesh = noPick(new THREE.Mesh(mergeGeometries(eyeGeos, false), eyeMaterial(hu, irisCol))); eyeMesh.name = 'eyes'; group.add(eyeMesh);

  // ---- hair
  let hairMesh = null;
  if (style !== 'bald' && style !== 'buzz' || style === 'buzz') {
    const hm = new SdfModel(), hg = hm.group({ matrix: A.head, rScale: D.headS, pk: 0.02 });
    hg.ellipsoid(0, 1.665, -0.012, 0.076, 0.086, 0.098, null, { k: 0, fat: D.fat.scalp }); hg.ellipsoid(0, 1.686, 0.03, 0.066, 0.055, 0.057, null, { fat: D.fat.scalp * 0.8 });
    const ex = new SdfModel(), eg = ex.group({ matrix: A.head, rScale: D.headS, pk: 0.03 });
    if (style === 'long') { eg.ellipsoid(0, 1.6, -0.062, 0.088, 0.115, 0.05, null, { k: 0 }); eg.ellipsoid(0, 1.66, -0.02, 0.088, 0.08, 0.1, null, {}); }
    if (style === 'bun') eg.sphere(0, 1.725, -0.092, 0.037, { k: 0 });
    hm.finalize(); ex.finalize();
    const T = style === 'buzz' ? [0.0022, 0.0028] : style === 'short' ? [0.005, 0.012] : style === 'balding' ? [0.004, 0.006] : style === 'curly' ? [0.016, 0.026] : style === 'bun' ? [0.006, 0.009] : [0.009, 0.016];
    const curly = style === 'curly';
    const hairFn = (x, y, z) => {
      apply(Ai.head, x, y, z, tmp); const rx = tmp[0], ry = tmp[1], rz = tmp[2], hf = hairField(rx, ry, rz, style);
      let th = lerp(T[0], T[1], smooth(1.655, 1.735, ry)) * smooth(0.0, 0.028, hf) + 0.0012;
      if (curly) th += (fbm3(rx * 55, ry * 55, rz * 55, 2, 7) - 0.5) * 0.014 * smooth(0, 0.02, hf);
      else th += (noise3(rx * 40, ry * 12, rz * 40, 5) - 0.5) * 0.0035 * smooth(0, 0.02, hf);
      let d = hm.eval(x, y, z, 1, 0) - th * D.headS;
      if (ex.groups[0].n) d = smin(d, ex.eval(x, y, z, 1, 0), 0.02);
      return Math.max(d, -hf * D.headS);
    };
    const hb = boxOf(g => g.part === 'head', style === 'long' ? 0.06 : 0.04);
    const crown = apply(A.head, 0, 1.748, -0.045, [0, 0, 0]);
    const hgeo = style === 'bald' ? null : await run(hairFn, { w: 1, box: hb, res: R.hair, keep: (x, y, z) => skinFn(x, y, z) > -0.0025 }, {
      slack: 1.6, attributes: { aHair: 4 }, vertex: (x, y, z, nx, ny, nz, Ar, i) => {
        let fx = x - crown[0], fy = y - crown[1], fz = z - crown[2]; const dn = fx * nx + fy * ny + fz * nz; fx -= nx * dn; fy -= ny * dn; fz -= nz * dn; const l = Math.hypot(fx, fy, fz) || 1;
        apply(Ai.head, x, y, z, tmp); const hf = hairField(tmp[0], tmp[1], tmp[2], style);
        Ar.aHair[i * 4] = fx / l; Ar.aHair[i * 4 + 1] = fy / l; Ar.aHair[i * 4 + 2] = fz / l; Ar.aHair[i * 4 + 3] = smooth(0.0, 0.016, hf) + (style === 'long' || style === 'bun' ? 0.4 : 0);
      },
    });
    if (hgeo) { hairMesh = noPick(new THREE.Mesh(hgeo, hairMaterial(hu, spec.hair.color, curly))); hairMesh.name = 'hair'; hairMesh.castShadow = true; hairMesh.receiveShadow = true; group.add(hairMesh); }
  } else doneW += 1;

  // ---- clothing: an offset of the body, cut to the garment's outline
  const clothes = { top: null, bottom: null, shoes: null, underwear: null };
  const smax = (a, b, k) => -smin(-a, -b, k);
  const neckC = top?.vneck ? [0, 1.468, 0.045] : [0, 1.487, 0.012];
  function topRegion(part, rx, ry, rz) {
    if (part === 'chest' || part === 'spine' || part === 'pelvis' || part === 'neck') { const sph = top.neckR - Math.hypot(rx, ry - neckC[1], rz - neckC[2]), cap = ry - (neckC[1] + (top.collar ? 0.02 : 0.013)); return Math.max(top.hem - ry, sph, cap); }
    if (part === 'upperArm') return top.sleeve ? top.sleeve - ry : -0.05;
    if (part === 'forearm') return top.sleeve ? top.sleeve - ry : 0.855 - ry;
    if (part === 'thigh') return top.hem - ry;
    return 0.05;
  }
  function bottomRegion(part, rx, ry, rz) {
    if (part === 'chest' || part === 'spine' || part === 'pelvis') return ry - 0.998;
    if (part === 'thigh' || part === 'shin') return bottom.cuff - ry;
    return 0.05;
  }
  function garment(G, isTop) {
    const gm = isTop ? (GM_TRUNK | GM_NECK | GM_ARM | (G.gown ? GM_LEG : 0)) : (GM_TRUNK | GM_LEG);
    const mode = F_DETAIL | (isTop ? (G.bulk >= 0.4 ? MODE_TOP : 0) | (G.hood ? MODE_HOOD : 0) | (G.gown ? MODE_SKIRT : 0) : (G.bulk >= 0.5 ? MODE_BOTTOM : 0) | (G.skirt ? MODE_SKIRT : 0));
    const region = isTop ? topRegion : bottomRegion, jointY = isTop ? 1.085 : 0.5;
    const fn = (x, y, z) => {
      const d = model.eval(x, y, z, 1, mode, gm), g = groups[model.hit]; if (!g) return 1;
      apply(Ai[g.bone], x, y, z, tmp); const rx = tmp[0], ry = tmp[1], rz = tmp[2], part = g.part;
      let w = (noise3(rx * 16 + 3, ry * 16, rz * 16, 3) - 0.5) * 0.007 * G.bulk + (noise3(rx * 45, ry * 45, rz * 45, 9) - 0.5) * 0.0022 * (0.4 + G.bulk);
      if (part === (isTop ? 'forearm' : 'shin') || part === (isTop ? 'upperArm' : 'thigh')) w += Math.sin(ry * 210 + noise3(rx * 30, 0, rz * 30, 1) * 5) * 0.0024 * (0.5 + G.bulk) * Math.exp(-(((ry - jointY) / 0.055) ** 2));
      if (!isTop && (part === 'pelvis' || part === 'thigh')) w += Math.sin((ry + Math.abs(rx) * 0.8) * 150) * 0.0011 * (0.4 + G.bulk) * Math.exp(-(((ry - 0.9) / 0.06) ** 2));
      if (isTop && (part === 'spine' || part === 'pelvis' || part === 'thigh')) w += Math.sin(ry * 120 + noise3(rx * 14, 0, rz * 14, 4) * 6) * 0.0022 * (0.3 + G.bulk) * (1 - smooth(1.05, 1.2, ry)) + 0.0065 * (1 - smooth(1.0, 1.03, ry));
      const rg = region(part, rx, ry, rz);
      return smax(d - G.t - Math.max(w, -G.t * 0.6) - 0.0035 * smooth(-0.014, -0.004, rg), rg * D.sy, 0.003);
    };
    const vertex = (x, y, z, nx, ny, nz, Ar, i) => {
      model.eval(x, y, z, 1, mode, gm); const g = groups[model.hit] || groups[0], part = g.part, side = g.side || 1;
      apply(Ai[g.bone], x, y, z, tmp); const rx = tmp[0], ry = tmp[1], rz = tmp[2], ax = Math.abs(rx), o = i * 4, trunk = part === 'chest' || part === 'spine' || part === 'pelvis' || part === 'neck';
      breathW(part, rx, ry, rz, bw); Ar.aDef[o] = bw[0]; Ar.aDef[o + 1] = bw[1]; Ar.aDef[o + 2] = bw[2]; Ar.aDef[o + 3] = bw[3];
      let eC = -0.05, eA = -0.05, eL = -0.05, eR = -0.05, seam = 1, px = 1, pipe = 1;
      const front = Math.min(0.2, (rz + 0.04) * 2.2);
      if (isTop) {
        if (trunk) { eC = Math.min(front, (ry - 1.1) * 1.5); eA = Math.min(front, (1.27 - ry) * 1.5); if (ax > 0.1) seam = rz + 0.004; if (rz > 0.02) px = ax; pipe = ry - 1.3; }
        else if (part === 'upperArm' || part === 'forearm') { eR = Math.min(0.2, (rz + 0.045) * 1.6); if (part === 'upperArm') { pipe = ry - 1.225; eC = Math.min(eR, 0.02 + (rz) * 1.5) - 0.02; } }
        else if (part === 'thigh') { eL = Math.min(0.2, (rz + 0.03) * 1.6); eA = eL; }
        if (G.gown && trunk && ry < 1.05) eL = front;
      } else {
        if (trunk) eL = Math.min(0.2, (rz + 0.015) * 1.8, 0.17 - ax); else { eL = Math.min(0.2, (rz + 0.035) * 1.7); seam = Math.abs((rx - (part === 'thigh' ? lerp(0.075, 0.09, clamp((ry - 0.5) / 0.4)) : 0.072) * side)) > 0.022 ? rz + (part === 'thigh' ? 0.004 : 0.012) : 1; if (part === 'shin') pipe = ry - 0.3; }
      }
      Ar.aC0[o] = eC; Ar.aC0[o + 1] = eA; Ar.aC0[o + 2] = eL; Ar.aC0[o + 3] = eR;
      Ar.aC1[o] = -region(part, rx, ry, rz); Ar.aC1[o + 1] = seam; Ar.aC1[o + 2] = px; Ar.aC1[o + 3] = ry;
      Ar.aC2[o] = 0; Ar.aC2[o + 1] = G.piping ? pipe : 1; Ar.aC2[o + 2] = 0; Ar.aC2[o + 3] = 0;
    };
    return { fn, vertex, gm };
  }
  const CL_ATTR = { aC0: 4, aC1: 4, aC2: 4, aDef: 4 };
  // Hems: surface nets leave a staircase along a garment's edge. Relax the vertices near the hem along the mesh, then
  // put them back on the garment surface, so the edge runs as a clean line.
  const relaxHem = (geo, fn, res) => {
    const p = geo.attributes.position, c1 = geo.attributes.aC1, idx = geo.index.array, n = p.count, flag = new Uint8Array(n), acc = new Float32Array(n * 4), nb4 = [0, 0, 0, 0];
    let any = 0; for (let i = 0; i < n; i++) if (c1.getX(i) < res * 2.4) { flag[i] = 1; any++; }
    if (!any) return;
    for (let it = 0; it < 4; it++) {
      acc.fill(0);
      for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const i = idx[t + e], j = idx[t + (e + 1) % 3]; if (flag[i]) { acc[i * 4] += p.getX(j); acc[i * 4 + 1] += p.getY(j); acc[i * 4 + 2] += p.getZ(j); acc[i * 4 + 3]++; } if (flag[j]) { acc[j * 4] += p.getX(i); acc[j * 4 + 1] += p.getY(i); acc[j * 4 + 2] += p.getZ(i); acc[j * 4 + 3]++; } }
      for (let i = 0; i < n; i++) { const c = acc[i * 4 + 3]; if (!c) continue; p.setXYZ(i, lerp(p.getX(i), acc[i * 4] / c, 0.6), lerp(p.getY(i), acc[i * 4 + 1] / c, 0.6), lerp(p.getZ(i), acc[i * 4 + 2] / c, 0.6)); }
      for (let i = 0; i < n; i++) { if (!flag[i]) continue; const d = sdfNormal(fn, p.getX(i), p.getY(i), p.getZ(i), 0.0012, nb4); if (d > -res && d < res) p.setXYZ(i, p.getX(i) - nb4[0] * d, p.getY(i) - nb4[1] * d, p.getZ(i) - nb4[2] * d); }
    }
  };
  const clothKeep = (x, y, z) => skinFn(x, y, z) > -0.007;
  if (top) {
    const g = garment(top, true), geo = await run(g.fn, { w: 2, box: boxOf(q => q.mask & g.gm, 0.03), res: R.cloth, keep: clothKeep }, { slack: 1.6, attributes: CL_ATTR, vertex: g.vertex });
    if (geo && !low) relaxHem(geo, g.fn, R.cloth);
    if (geo) { const m = noPick(new THREE.Mesh(geo, clothMaterial(hu, { color: spec.clothing.topColor ?? 0x5a6a78, color2: top.fabric === 4 ? 0x7fa3c9 : top.piping ? 0x1a1a1a : 0xe8e4da, fabric: top.fabric, placket: top.placket, piping: top.piping, exMask: new THREE.Vector4(1, 1, top.gown ? 1 : 0, 1) }))); m.name = 'top'; m.castShadow = m.receiveShadow = true; group.add(m); clothes.top = m; }
  }
  if (bottom) {
    const g = garment(bottom, false), geo = await run(g.fn, { w: 2, box: boxOf(q => q.mask & g.gm, 0.03), res: R.cloth, keep: clothKeep }, { slack: 1.6, attributes: CL_ATTR, vertex: g.vertex });
    if (geo && !low) relaxHem(geo, g.fn, R.cloth);
    if (geo) { const m = noPick(new THREE.Mesh(geo, clothMaterial(hu, { color: spec.clothing.bottomColor ?? 0x27344a, fabric: bottom.fabric, piping: bottom.piping, exMask: new THREE.Vector4(0, 0, 1, 0) }))); m.name = 'bottom'; m.castShadow = m.receiveShadow = true; group.add(m); clothes.bottom = m; }
  }
  if (shod) {
    const boots = spec.clothing.shoes === 'boots', sm = new SdfModel();
    for (const s of [1, -1]) {
      const g = sm.group({ matrix: A[s > 0 ? 'ankleL' : 'ankleR'], rScale: D.footS, pk: 0.012 }), X = x => s * x, st = boots ? 0.006 : 0;
      g.box(X(0.069), 0.014 + st * 0.5, 0.036, 0.05, 0.016 + st * 0.5, 0.144, 0.014, null, { k: 0 });
      g.ellipsoid(X(0.069), 0.05 + st, 0.03, 0.047, 0.042, 0.125, null, {});
      g.ellipsoid(X(0.068), 0.04 + st, 0.125, 0.046, 0.032, 0.052, null, {});
      g.ellipsoid(X(0.07), 0.06 + st, -0.062, 0.041, 0.055, 0.045, null, {});
      g.cone(X(0.07), 0.07, -0.03, 0.044, X(0.07), boots ? 0.2 : 0.112, -0.031, boots ? 0.046 : 0.042, { k: 0.02 });
      g.cone(X(0.07), boots ? 0.17 : 0.095, -0.03, 0.036, X(0.07), 0.3, -0.03, 0.036, { op: OP_SUB, k: 0.004 });
      g.plane(0, 0.0005, 0, 0, -1, 0, { op: OP_INT, k: 0.004 });
    }
    sm.finalize(); const sfn = sm.fn(1, 0);
    const geo = await run(sfn, { w: 1, box: sm.bounds(0.01), res: R.shoe }, {
      attributes: CL_ATTR, vertex: (x, y, z, nx, ny, nz, Ar, i) => {
        apply(Ai.ankleL, x, y, z, tmp); apply(Ai.ankleR, x, y, z, tmp2); const r = Math.abs(tmp[0] - 0.069) < Math.abs(tmp2[0] + 0.069) ? tmp : tmp2, o = i * 4, ax = Math.abs(Math.abs(r[0]) - 0.069);
        applyDir(Ai.ankleL, nx, ny, nz, nrm);
        Ar.aC1[o] = (boots ? 0.034 : 0.027) - r[1]; Ar.aC1[o + 1] = Math.min(0.019 - ax, r[2] + 0.002, 0.088 - r[2], (nrm[1] - 0.25) * 0.02); Ar.aC1[o + 2] = smooth(0.1, 0.118, r[2]) + smooth(-0.07, -0.085, r[2]); Ar.aC1[o + 3] = r[1];
        Ar.aC2[o] = r[2]; Ar.aC2[o + 1] = 1; Ar.aC0[o] = Ar.aC0[o + 1] = Ar.aC0[o + 2] = Ar.aC0[o + 3] = -0.05;
      },
    });
    if (geo) { const m = noPick(new THREE.Mesh(geo, clothMaterial(hu, { color: boots ? 0x1b1a19 : (spec.clothing.shoeColor ?? 0x5c6066), color2: boots ? 0x101010 : 0xd9d6cf, fabric: 8, exMask: new THREE.Vector4(0, 0, 0, 0) }))); m.name = 'shoes'; m.castShadow = m.receiveShadow = true; group.add(m); clothes.shoes = m; }
  }
  prog(1);
  return finishHuman({ spec, D, rig, group, model, fields, skinFn, skinMesh, eyeMesh, hairMesh, clothes, hu, seat, feat, eyeCentres, hZ, buildMs: performance.now() - t0 });
}

// ---------------------------------------------------------------- anchors, runtime state, wounds, bleeding

// [name, bone, from (reference point outside the body), towards]. L entries are mirrored for R.
const ANCHOR_RAYS = [
  ['forehead', 'head', [0, 1.69, 0.4], [0, 1.69, 0]], ['mouth', 'head', [0, 1.5707, 0.4], [0, 1.5707, 0]], ['nose', 'head', [0, 1.6025, 0.4], [0, 1.6025, 0]], ['chin', 'head', [0, 1.552, 0.4], [0, 1.552, 0]],
  ['earL', 'head', [0.4, 1.632, -0.014], [0, 1.632, -0.014]], ['neckFront', 'neck', [0, 1.4778, 0.4], [0, 1.4778, 0]], ['carotidL', 'neck', [0.2, 1.502, 0.22], [0.02, 1.502, 0.012]],
  ['sternalNotch', 'chest', [0, 1.441, 0.4], [0, 1.441, 0]], ['sternumCPR', 'chest', [0, 1.311, 0.4], [0, 1.311, 0]], ['xiphoid', 'chest', [0, 1.272, 0.4], [0, 1.272, 0]],
  ['epigastrium', 'spine', [0, 1.225, 0.5], [0, 1.225, 0]], ['ruq', 'spine', [-0.08, 1.16, 0.5], [-0.08, 1.16, 0]], ['luq', 'spine', [0.08, 1.16, 0.5], [0.08, 1.16, 0]], ['rlq', 'spine', [-0.07, 1.0, 0.5], [-0.07, 1.0, 0]], ['llq', 'spine', [0.07, 1.0, 0.5], [0.07, 1.0, 0]],
  ['umbilicus', 'spine', [0, 1.055, 0.5], [0, 1.055, 0]], ['pelvisL', 'pelvis', [0.45, 1.04, 0.0], [0, 1.04, -0.01]], ['groinL', 'pelvis', [0.066, 0.913, 0.5], [0.066, 0.913, 0]],
  ['thighL', 'hipL', [0.09, 0.7, 0.5], [0.085, 0.7, 0]], ['thighLatL', 'hipL', [0.5, 0.7, 0], [0.08, 0.7, 0]], ['kneeL', 'kneeL', [0.075, 0.508, 0.5], [0.075, 0.508, 0]],
  ['ankleL', 'kneeL', [0.07, 0.105, 0.4], [0.07, 0.105, -0.03]], ['footL', 'ankleL', [0.068, 0.4, 0.07], [0.068, 0, 0.07]],
  ['deltoidL', 'shoulderL', [0.5, 1.37, -0.01], [0.19, 1.37, -0.01]], ['upperArmL', 'shoulderL', [0.21, 1.24, 0.4], [0.19, 1.24, 0]], ['acfL', 'elbowL', [0.1975, 1.0675, 0.4], [0.1975, 1.0675, 0]],
  ['forearmL', 'elbowL', [0.19, 0.96, 0.4], [0.19, 0.96, 0]], ['wristL', 'elbowL', [0.208, 0.852, 0.4], [0.208, 0.852, 0]], ['handL', 'wristL', [0.19, 0.787, -0.4], [0.19, 0.787, 0]],
  ['backUpper', 'chest', [0, 1.36, -0.5], [0, 1.36, 0]], ['backLower', 'spine', [0, 1.1, -0.5], [0, 1.1, 0]],
];

function finishHuman(h) {
  const { spec, D, rig, group, model, skinFn, skinMesh, eyeMesh, hairMesh, clothes, hu } = h, A = rig.A, Ai = rig.Ainv, groups = model.groups;
  const o = [0, 0, 0], t = [0, 0, 0], nb = [0, 0, 0, 0], ref = [0, 0, 0];
  const anchors = {}, trunkFn = (x, y, z) => model.eval(x, y, z, 1, 0, GM_AXIAL | 2048 | 4096), axialFn = (x, y, z) => model.eval(x, y, z, 1, 0, GM_AXIAL);
  const neckBent = Math.abs(rig.bones.neck.rotation.x) + Math.abs(rig.bones.head.rotation.x) > 0.3;
  // forearm / hand and shin / foot sites sit on the distal segment itself (a flexed elbow must not hand them to the biceps)
  const partFn = bone => { let lm = LIMB_ALL[bone]; if (lm && !/^(shoulder|hip)/.test(bone)) lm &= GM_DISTAL; return lm ? (x, y, z) => model.eval(x, y, z, 1, 0, lm) : bone === 'pelvis' ? trunkFn : bone === 'neck' && neckBent ? (x, y, z) => model.eval(x, y, z, 1, 0, GM_NECK) : axialFn; };
  const normalAt = (x, y, z, fn = skinFn) => { sdfNormal(fn, x, y, z, 0.0015, nb); return new THREE.Vector3(nb[0], nb[1], nb[2]); };
  const cast = (name, bone, from, to) => {
    apply(A[bone], from[0], from[1], from[2], o); apply(A[bone], to[0], to[1], to[2], t);
    let dx = t[0] - o[0], dy = t[1] - o[1], dz = t[2] - o[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const fn = partFn(bone);
    const d = sdfRaycast(fn, o[0], o[1], o[2], dx, dy, dz, l + 0.1, 5e-5), k = d < 0 ? l : d;
    const pos = new THREE.Vector3(o[0] + dx * k, o[1] + dy * k, o[2] + dz * k);
    anchors[name] = { pos, normal: d < 0 ? new THREE.Vector3(-dx, -dy, -dz) : normalAt(pos.x, pos.y, pos.z, fn), dir: new THREE.Vector3(dx, dy, dz) };
  };
  for (const [name, bone, from, to] of ANCHOR_RAYS) {
    cast(name, bone, from, to);
    if (name.endsWith('L')) cast(name.slice(0, -1) + 'R', bone.endsWith('L') ? bone.slice(0, -1) + 'R' : bone, [-from[0], from[1], from[2]], [-to[0], to[1], to[2]]);
  }
  // chest wall sites from the rib geometry
  // An intercostal site: the skin point from which a needle driven perpendicular to the SKIN arrives in the middle of
  // the space. On a thick or sloping chest wall that is not straight over the space, so the site is walked into place.
  const ics = (name, k, u, side) => {
    let yOff = 0;
    for (let it = 0; it < 5; it++) {
      const y = (ribY(k, u) + ribY(k + 1, u)) / 2 + yOff, p = cagePoint(u, y, side), c = REF.cage, n = [(p[0] - c.c[0]) / c.r[0] ** 2, (p[1] - c.c[1]) / c.r[1] ** 2, (p[2] - c.c[2]) / c.r[2] ** 2], l = Math.hypot(n[0], n[1], n[2]);
      cast(name, 'chest', [p[0] + n[0] / l * 0.3, p[1] + n[1] / l * 0.3, p[2] + n[2] / l * 0.3], p);
      const a = anchors[name]; let err = 0;
      for (let s = 0.002; s < 0.16; s += 0.002) { apply(Ai.chest, a.pos.x - a.normal.x * s, a.pos.y - a.normal.y * s, a.pos.z - a.normal.z * s, ref); if (cageSdf(ref[0], ref[1], ref[2]) < -0.004) { const uh = cageU(ref[0], ref[2]); err = ref[1] - (ribY(k, uh) + ribY(k + 1, uh)) / 2; break; } }
      if (Math.abs(err) < 0.0012) break; yOff -= err * 0.9;
    }
  };
  const yI2 = (ribY(2, 0.72) + ribY(3, 0.72)) / 2, yI5 = (ribY(5, 0.72) + ribY(6, 0.72)) / 2;
  ics('ics2L', 2, mclU(yI2), 1); ics('ics2R', 2, mclU(yI2), -1); ics('ics5L', 5, 0.59, 1); ics('ics5R', 5, 0.59, -1); ics('apex', 5, mclU(yI5), 1);
  // tibial IO site: on the flat medial face, 2 cm below and medial to the tuberosity
  for (const s of [1, -1]) { const tb = REF.tibia, n = [-s * Math.sin(-tb.yaw), 0, Math.cos(tb.yaw)], c = [s * (tb.c[0] - 0.004) + n[0] * tb.half[2], tb.tubY - 0.022, tb.c[2] + n[2] * tb.half[2]]; cast('tibia' + (s > 0 ? 'L' : 'R'), s > 0 ? 'kneeL' : 'kneeR', [c[0] + n[0] * 0.3, c[1], c[2] + n[2] * 0.3], c); }
  for (const s of [1, -1]) {
    const sd = s > 0 ? 'L' : 'R', e = h.eyeCentres[s > 0 ? 0 : 1], tip = rig.tips[sd];
    anchors['eye' + sd] = { pos: e.clone().addScaledVector(h.hZ, REF.eyeR * D.headS), normal: h.hZ.clone() };
    apply(A['wrist' + sd], tip.p[0] + tip.d[0] * tip.r, tip.p[1] + tip.d[1] * tip.r, tip.p[2] + tip.d[2] * tip.r, o); applyDir(A['wrist' + sd], tip.d[0], tip.d[1], tip.d[2], t);
    anchors['finger' + sd] = { pos: new THREE.Vector3(o[0], o[1], o[2]), normal: new THREE.Vector3(t[0], t[1], t[2]) };
  }
  {
    apply(A.chest, 0.017, 1.266, 0.5, o); applyDir(A.chest, 0, 0, -1, t); const dh = sdfRaycast(axialFn, o[0], o[1], o[2], t[0], t[1], t[2], 1, 5e-5); apply(Ai.chest, o[0] + t[0] * dh, o[1] + t[1] * dh, o[2] + t[2] * dh, ref);
    const cg = REF.cage, zc = cg.c[2] + cg.r[2] * Math.sqrt(Math.max(0, 1 - (0.017 / cg.r[0]) ** 2 - ((1.266 - cg.c[1]) / cg.r[1]) ** 2)), wall = Math.max(0.004, ref[2] - zc);
    // start from the estimate and walk the entry down until the needle path meets no rib, cartilage or xiphoid on its way in
    const dr = [Math.sin(10 * DEG), Math.sin(48 * DEG) * Math.cos(10 * DEG), -Math.cos(48 * DEG) * Math.cos(10 * DEG)], dR = [0, 0, 0]; applyDir(A.chest, dr[0], dr[1], dr[2], dR);
    const clears = () => { const e = anchors.subxiphoid.pos; let inside = false; for (let s = 0.002; s < 0.2; s += 0.0015) { apply(Ai.chest, e.x + dR[0] * s, e.y + dR[1] * s, e.z + dR[2] * s, ref); const c = cageSdf(ref[0], ref[1], ref[2]); if (c <= -0.0085) { inside = true; break; } if (c > 0.0008) continue;
      const u = cageU(ref[0], ref[2]); let m = 9; for (let k = 5; k <= 10; k++) if (u <= RIBS[k].end) m = Math.min(m, ribY(k, u)); if (ref[1] > m - 0.0065 - 0.0035) return false; if (ref[1] > 1.253 && Math.abs(ref[0]) < 0.0145) return false; } return inside; };
    let yE = clamp(1.263 - 1.106 * (wall + 0.0078 + 0.005), 1.17, 1.246) + 0.008, okY = 0;
    for (let i = 0; i < 28 && yE > 1.14; i++, yE -= 0.004) { cast('subxiphoid', 'chest', [0.012, yE, 0.5], [0.012, yE, 0]); if (clears()) { okY = yE; break; } }
    if (okY) cast('subxiphoid', 'chest', [0.012, okY - 0.004, 0.5], [0.012, okY - 0.004, 0]);
    // the path is fixed to the chest (straight back, tipped 48 degrees to the head and 10 to the left), not to the belly's slope
    applyDir(A.chest, Math.sin(10 * DEG), Math.sin(48 * DEG) * Math.cos(10 * DEG), -Math.cos(48 * DEG) * Math.cos(10 * DEG), t); anchors.subxiphoid.dir = new THREE.Vector3(t[0], t[1], t[2]);
  }
  hu.uCpr.value.set(anchors.sternumCPR.pos.x, anchors.sternumCPR.pos.y, anchors.sternumCPR.pos.z, 0); hu.uCprDir.value.copy(anchors.sternumCPR.normal).negate();

  const exposeT = new THREE.Vector4(0, 0, 0, 0), wounds = [], pools = [], flows = [];
  let bloodMat = null, groundY = 0, ghost = 0;
  const allMats = () => [skinMesh, clothes.top, clothes.bottom, clothes.shoes].filter(Boolean).map(m => m.material);
  const _g = new THREE.Vector3(), _q = new THREE.Quaternion();
  const human = {
    group, spec, dims: D, rig, bones: rig.bones, anchors, seat: h.seat, uniforms: hu, skinMesh, clothes, hairMesh, eyeMeshes: [eyeMesh], openings: null, buildMs: h.buildMs,
    sdf(p) { return model.eval(p.x, p.y, p.z, 1, 0); },
    // signed distance to the lean body (the surface under the subcutaneous fat)
    lean(p, gm = 0) { return model.eval(p.x, p.y, p.z, 0, 0, gm); },
    // which body part a root-frame point belongs to and where it sits in the reference body
    // out.gm is the group mask to measure depth with (0 = whole body): for a limb it is that limb alone, so skin and
    // fat thickness are the limb's own even when another body part overlaps it.
    locate(p, out = {}) {
      const px = p.x, py = p.y, pz = p.z; let d = model.eval(px, py, pz, 1, 0), g = groups[model.hit] || groups[0], gm = 0;
      if (d <= 0) {
        if (!g.distal) {
          if (model.eval(px, py, pz, 1, 0, GM_DISTAL) < 0) g = groups[model.hit];
          else if (!g.limb && model.eval(px, py, pz, 1, 0, GM_PROX) < 0) { const g3 = groups[model.hit], j = g3.joint; if (j && Math.hypot(px - j[0], py - j[1], pz - j[2]) > (g3.part === 'thigh' ? 0.2 : 0.16)) g = g3; }
        }
        if (g.limb) { gm = g.limb; d = Math.min(-1e-6, model.eval(px, py, pz, 1, 0, gm)); }
        else {
          // a flexed neck lies against the chest: what is inside the neck is neck; and the trunk's own skin is measured
          // without the limbs, so an arm against the chest wall does not thicken it
          if (neckBent && (g.part === 'chest' || g.part === 'head') && model.eval(px, py, pz, 1, 0, GM_NECK) < 0) { apply(Ai.neck, px, py, pz, ref); if (ref[1] > 1.455 && ref[1] < 1.6) g = groups[model.hit]; }
          gm = g.part === 'neck' && neckBent ? GM_NECK : g.part === 'pelvis' ? GM_AXIAL | 2048 | 4096 : GM_AXIAL; d = Math.min(-1e-6, model.eval(px, py, pz, 1, 0, gm));
        }
      }
      apply(Ai[g.bone], px, py, pz, ref); out.gm = gm; out.d = d; out.part = g.part; out.side = g.side; out.bone = g.bone; out.x = ref[0]; out.y = ref[1]; out.z = ref[2]; return out; },
    toRoot(bone, x, y, z, target = new THREE.Vector3()) { apply(A[bone], x, y, z, o); return target.set(o[0], o[1], o[2]); },
    expose(part, on = true) { const v = on ? 1 : 0; if (part === 'all') exposeT.set(v, v, v, v); else if (part === 'chest') exposeT.x = v; else if (part === 'abdomen') exposeT.y = v; else if (part === 'legs') exposeT.z = v; else if (part === 'arms') exposeT.w = v; },
    setBreath(v, left = 1, right = 1, opt) { hu.uBreath.value.set(v, left, right, opt?.abdomen ?? 1); if (opt && 'paradox' in opt) { const pd = opt.paradox; if (pd && pd.pos) { hu.uParadox.value.set(pd.pos.x, pd.pos.y, pd.pos.z, pd.radius ?? 0.05); hu.uParadoxAmt.value = pd.amount ?? 1; } else hu.uParadoxAmt.value = 0; } },
    setCompress(d) { hu.uCpr.value.w = clamp(d, -1, 1); },
    setSkin(s) { const c = hu.uClin.value, c2 = hu.uClin2.value; if (s.pallor != null) c.x = clamp(s.pallor); if (s.cyanosis != null) c.y = clamp(s.cyanosis); if (s.flush != null) c.z = clamp(s.flush); if (s.sweat != null) c.w = clamp(s.sweat); if (s.mottling != null) c2.x = clamp(s.mottling); if (s.jaundice != null) c2.y = clamp(s.jaundice); },
    setEyes(open, pupilL, pupilR) { hu.uLid.value = clamp(open); if (pupilL != null) hu.uPupil.value.x = clamp(pupilL, 1.5, 9); if (pupilR != null) hu.uPupil.value.y = clamp(pupilR ?? pupilL, 1.5, 9); },
    setMouth(open) { hu.uJaw.value = clamp(open); },
    setJVD(v) { hu.uJVD.value = clamp(v); }, setTrachea(s) { hu.uTrachea.value = clamp(s, -1, 1); },
    setGround(y) { groundY = y; },
    // ghost the body (anatomy.setXray drives this)
    setGhost(v) {
      ghost = clamp(v); hu.uClin2.value.z = ghost; const on = ghost > 0.001;
      for (const m of allMats()) { if (m.transparent !== on) { m.transparent = on; m.depthWrite = !on; m.needsUpdate = true; } }
      for (const m of [skinMesh, clothes.top, clothes.bottom, clothes.shoes]) if (m) { m.renderOrder = on ? 20 : 0; m.castShadow = !on; if (on) GFX.noAO.add(m); else GFX.noAO.delete(m); }
      if (hairMesh) hairMesh.visible = ghost < 0.4;
    },
    addWound(def) {
      if (wounds.length >= MAX_WOUNDS) return -1;
      const id = wounds.length, kind = Math.max(0, WOUND_KINDS.indexOf(def.kind)), n = (def.normal ? def.normal.clone() : normalAt(def.pos.x, def.pos.y, def.pos.z)).normalize();
      const tn = new THREE.Vector3(0, 0, 1); if (Math.abs(n.z) > 0.9) tn.set(1, 0, 0); tn.addScaledVector(n, -tn.dot(n)).normalize().applyAxisAngle(n, def.angle || 0);
      const size = def.size ?? 0.02, w = { id, def, kind, pos: def.pos.clone(), normal: n, size, bleed: 0, flow: null };
      wounds.push(w);
      hu.uWA.value[id].set(w.pos.x, w.pos.y, w.pos.z, size); hu.uWB.value[id].set(n.x, n.y, n.z, kind); hu.uWC.value[id].set(tn.x, tn.y, tn.z, 0); hu.uWCount.value = wounds.length;
      if (def.kind === 'amputation') {       // the stump: muscle, fat rim and cut bone
        const cap = new THREE.Mesh(new THREE.CircleGeometry(size * 1.02, 28), new THREE.MeshPhysicalMaterial({ color: 0x5a0a0c, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
        const bone = new THREE.Mesh(new THREE.CircleGeometry(size * 0.3, 16), new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.5 })); bone.position.z = 0.0008; cap.add(bone);
        cap.position.copy(w.pos).addScaledVector(n, -0.001); cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); cap.raycast = () => { }; group.add(cap); w.cap = cap;
      }
      return id;
    },
    setBleed(id, rate) {
      const w = wounds[id]; if (!w) return; w.bleed = clamp(rate); hu.uWC.value[id].w = Math.max(hu.uWC.value[id].w, w.bleed * 0.6);
      if (w.bleed > 0.02 && !w.flow) w.flow = makeFlow(w);
    },
    addBloodPool(pos, radius = 0.1) { return makePool(pos.x, pos.z, radius, radius); },
    update(dt) {
      const e = hu.uExpose.value, k = Math.min(1, dt * 2.2);
      e.x += Math.sign(exposeT.x - e.x) * Math.min(Math.abs(exposeT.x - e.x), k); e.y += Math.sign(exposeT.y - e.y) * Math.min(Math.abs(exposeT.y - e.y), k);
      e.z += Math.sign(exposeT.z - e.z) * Math.min(Math.abs(exposeT.z - e.z), k); e.w += Math.sign(exposeT.w - e.w) * Math.min(Math.abs(exposeT.w - e.w), k);
      for (const w of wounds) {
        const f = w.flow; if (!f) continue;
        hu.uWC.value[w.id].w = Math.max(hu.uWC.value[w.id].w, Math.min(1, hu.uWC.value[w.id].w + dt * 0.02 * w.bleed));
        if (w.bleed <= 0) continue;
        if (f.front < f.len) { f.front = Math.min(f.len, f.front + dt * (0.012 + 0.05 * w.bleed)); const a = f.mesh.geometry.attributes.aB; for (let i = 0; i < a.count; i++) a.array[i * 4 + 1] = f.s[i] - f.front; a.needsUpdate = true; }
        else if (f.pool) { const p = f.pool; p.r = Math.min(p.max, Math.sqrt(p.r * p.r + dt * 0.0032 * w.bleed)); p.mesh.scale.set(p.r, 1, p.r); }
        else if (f.end) f.pool = makePool(f.end.x, f.end.z, 0.02, 0.3 + 0.25 * w.bleed);
      }
    },
    dispose() { group.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); GFX.noAO.delete(skinMesh); group.removeFromParent(); },
  };

  function blood() { return bloodMat || (bloodMat = bloodMaterial()); }
  function makePool(x, z, r, max) {
    const g = new THREE.CircleGeometry(1, 40), n = g.attributes.position.count, aB = new Float32Array(n * 4), seed = Math.random();
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) { const px = g.attributes.position.getX(i), pz = g.attributes.position.getZ(i); aB[i * 4] = Math.hypot(px, pz); aB[i * 4 + 1] = -1; aB[i * 4 + 2] = 1; aB[i * 4 + 3] = seed; }
    g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    const m = new THREE.Mesh(g, blood()); m.position.set(x, groundY - group.position.y + 0.004, z); m.scale.set(r, 1, r); m.renderOrder = 3; m.raycast = () => { }; m.receiveShadow = true; group.add(m); GFX.noAO.add(m);
    const p = { mesh: m, r, max }; pools.push(p); return p;
  }
  // Follow gravity down the skin from a wound; returns a ribbon that is revealed as the blood front advances.
  function makeFlow(w) {
    group.updateMatrixWorld(); _g.set(0, -1, 0).applyQuaternion(group.getWorldQuaternion(_q).invert());
    const P = [], N = [], Dr = []; let p = w.pos.clone(), len = 0, end = null; const prev = new THREE.Vector3(), gt = new THREE.Vector3(), gl = groundY - group.position.y;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3(), cand = new THREE.Vector3();
    for (let i = 0; i < 280; i++) {
      const d0 = sdfNormal(skinFn, p.x, p.y, p.z, 0.0015, nb); const n = new THREE.Vector3(nb[0], nb[1], nb[2]); p.addScaledVector(n, -d0);
      gt.copy(_g).addScaledVector(n, -_g.dot(n)); let l = gt.length();
      if (n.dot(_g) > 0.55 && i > 2) { end = p.clone(); break; }                      // underside: it drips off
      if (l < 0.3) {
        t1.set(1, 0, 0); if (Math.abs(n.x) > 0.8) t1.set(0, 0, 1); t1.addScaledVector(n, -t1.dot(n)).normalize(); t2.crossVectors(n, t1); let bd = 1e-4, found = false;
        for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2; cand.copy(t1).multiplyScalar(Math.cos(an)).addScaledVector(t2, Math.sin(an)); q.copy(p).addScaledVector(cand, 0.03); const dq = sdfNormal(skinFn, q.x, q.y, q.z, 0.002, nb); q.x -= nb[0] * dq; q.y -= nb[1] * dq; q.z -= nb[2] * dq; const drop = q.sub(p).dot(_g) + (i ? 0.004 * cand.dot(prev) : 0); if (drop > bd) { bd = drop; gt.copy(cand); found = true; } }
        if (!found) { if (i === 0) gt.set(Math.sin(w.id * 2.4), 0, Math.cos(w.id * 2.4)).addScaledVector(n, -gt.dot(n)); else gt.copy(prev); } l = gt.length() || 1;
      }
      gt.multiplyScalar(1 / l); gt.x += (noise3(p.x * 40, p.y * 40, p.z * 40, w.id) - 0.5) * 0.5; gt.normalize(); prev.copy(gt);
      P.push(p.clone()); N.push(n); Dr.push(gt.clone());
      if (p.dot(_g) > -gl - 0.006 && i > 1) { end = p.clone(); break; }
      p = p.clone().addScaledVector(gt, 0.004); len += 0.004;
    }
    if (P.length < 2) return { front: 0, len: 0, end: end || w.pos.clone(), mesh: { geometry: { attributes: { aB: { count: 0, array: [] } } } }, s: [] };
    const n = P.length, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), aB = new Float32Array(n * 8), s = new Float32Array(n * 2), idx = [], sd = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      sd.crossVectors(N[i], Dr[i]).normalize(); const wd = (0.0036 + 0.0034 * noise3(i * 0.21, w.id, 0, 3)) * (0.7 + 0.6 * w.bleed) * Math.min(1, (n - i) / 6 + 0.25);
      for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1, j = i * 2 + k; pos[j * 3] = P[i].x + sd.x * wd * sg + N[i].x * 0.0007; pos[j * 3 + 1] = P[i].y + sd.y * wd * sg + N[i].y * 0.0007; pos[j * 3 + 2] = P[i].z + sd.z * wd * sg + N[i].z * 0.0007; nor[j * 3] = N[i].x; nor[j * 3 + 1] = N[i].y; nor[j * 3 + 2] = N[i].z; aB[j * 4] = sg * 1.0; aB[j * 4 + 1] = 1; aB[j * 4 + 2] = 0.8; aB[j * 4 + 3] = w.id; s[j] = i * 0.004; }
      if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2 + 1, (i - 1) * 2, i * 2 + 1, i * 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4)); g.setIndex(idx);
    const m = new THREE.Mesh(g, blood()); m.renderOrder = 2; m.raycast = () => { }; group.add(m); GFX.noAO.add(m);
    if (end) { const wp = end.clone(); end = new THREE.Vector3(wp.x, 0, wp.z); }
    const f = { mesh: m, s, front: 0, len: n * 0.004, end, pool: null }; flows.push(f); return f;
  }

  human.setEyes(spec.eyes === 'closed' ? 0 : spec.eyes === 'half' ? 0.45 : 1, 3.5, 3.5);
  human.openings = makeOpeningSet(human);
  return human;
}

// Surgical openings: uniforms that punch the hole in the skin (and in every patched layer); anatomy.js hooks onChange
// to build the cut walls.
function makeOpeningSet(human) {
  const hu = human.uniforms, list = [], nb = [0, 0, 0, 0], skin = human.rig.model.fn(1, 0);
  const set = { list, thor: 0, thorPath: null, onChange: null };
  const sync = () => {
    let n = 0;
    for (const op of list) { if (!op || n >= MAX_OPEN) continue; hu.uOpA.value[n].set(op.a.x, op.a.y, op.a.z, op.gape); hu.uOpB.value[n].set(op.b.x, op.b.y, op.b.z, op.depth); hu.uOpN.value[n].copy(op.n); n++; }
    hu.uOpCount.value = n; set.onChange?.(set);
  };
  const normalOf = (a, b) => { const m = a.clone().add(b).multiplyScalar(0.5); sdfNormal(skin, m.x, m.y, m.z, 0.003, nb); return new THREE.Vector3(nb[0], nb[1], nb[2]); };
  set.add = (o) => { const op = { a: o.a.clone(), b: o.b.clone(), gape: o.gape ?? 0.015, depth: o.depth ?? 0.01, n: normalOf(o.a, o.b) }; list.push(op); sync(); return list.length - 1; };
  set.set = (id, o) => { const op = list[id]; if (!op) return; if (o.gape != null) op.gape = o.gape; if (o.depth != null) op.depth = o.depth; if (o.b) { op.b.copy(o.b); op.n = normalOf(op.a, op.b); } if (o.a) { op.a.copy(o.a); op.n = normalOf(op.a, op.b); } sync(); };
  set.remove = (id) => { list[id] = null; sync(); };
  set.clear = () => { list.length = 0; set.thor = 0; hu.uThGape.value = 0; sync(); };
  // clamshell: both 5th intercostal spaces joined across the sternum, spread to ~11 cm
  set.setThoracotomy = (t) => {
    t = clamp(t); set.thor = t;
    if (!set.thorPath) {
      const pts = [], fn = (x, y, z) => human.rig.model.eval(x, y, z, 1, 0, GM_AXIAL), A = human.rig.A.chest, o = [0, 0, 0], q = [0, 0, 0], us = [0.52, 0.6, 0.68, 0.76, 0.84, 0.92, 1];
      const one = (u, side) => { const y = (ribY(5, u) + ribY(6, u)) / 2 - (u > 0.9 ? 0.004 : 0), p = cagePoint(u, y, side), c = REF.cage, n = [(p[0] - c.c[0]) / c.r[0] ** 2, (p[1] - c.c[1]) / c.r[1] ** 2, (p[2] - c.c[2]) / c.r[2] ** 2], l = Math.hypot(n[0], n[1], n[2]);
        apply(A, p[0] + n[0] / l * 0.3, p[1] + n[1] / l * 0.3, p[2] + n[2] / l * 0.3, o); apply(A, p[0], p[1], p[2], q); let dx = q[0] - o[0], dy = q[1] - o[1], dz = q[2] - o[2]; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
        const d = sdfRaycast(fn, o[0], o[1], o[2], dx, dy, dz, dl + 0.1, 1e-4), k = d < 0 ? dl : d; const pos = new THREE.Vector3(o[0] + dx * k, o[1] + dy * k, o[2] + dz * k); sdfNormal(fn, pos.x, pos.y, pos.z, 0.004, nb); return { pos, n: new THREE.Vector3(nb[0], nb[1], nb[2]) }; };
      for (let i = 0; i < us.length; i++) pts.push(one(us[i], -1));
      for (let i = us.length - 2; i >= 0; i--) pts.push(one(us[i], 1));
      set.thorPath = pts; hu.uThCount.value = Math.min(MAX_THOR, pts.length);
      for (let i = 0; i < Math.min(MAX_THOR, pts.length); i++) { hu.uThP.value[i].copy(pts[i].pos); hu.uThN.value[i].copy(pts[i].n); }
    }
    hu.uThGape.value = t * 0.115; set.onChange?.(set);
  };
  return set;
}

// ---------------------------------------------------------------- dev harness

// dev.html?m=human&pose=supine&sex=m&age=40&bmi=24&build=0.4&skin=0.3&hair=short&top=tshirt&bottom=jeans&shoes=trainers
// Keys: E expose all, C chest only, X x-ray, O organs, T thoracotomy, B breathing on/off. window.__demo holds the person,
// the anatomy and helpers for scripted screenshots.
export async function devDemo(ctx) {
  const { scene, params, camera, controls } = ctx, num = (k, d) => params.has(k) ? Number(params.get(k)) : d, str = (k, d) => params.get(k) || d;
  const { patchWet } = await import('./gfx.js');
  const gm = patchWet(new THREE.MeshStandardMaterial({ color: 0x4d4e50, roughness: 0.92 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const spot = new THREE.SpotLight(0xfff1dd, 0, 12, 0.5, 0.6, 1.4); spot.position.set(1.2, 2.6, 0.4); spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.01; scene.add(spot, spot.target);
  const spot2 = new THREE.SpotLight(0xcfe0ff, 0, 10, 0.7, 0.8, 1.4); spot2.position.set(-1.6, 1.8, -1.2); scene.add(spot2, spot2.target);
  const demo = window.__demo = { human: null, anat: null, lights(a, b = a * 0.35) { spot.intensity = a; spot2.intensity = b; }, breathing: true };
  if (params.has('lit')) demo.lights(Number(params.get('lit')) || 60);
  const specOf = (o = {}) => ({
    sex: str('sex', 'm'), age: num('age', 38), heightM: params.has('h') ? num('h') : undefined, bmi: num('bmi', 24), build: num('build', 0.45), skin: num('skin', 0.25), beard: num('beard', 0.25),
    hair: { style: str('hair', 'short'), color: params.has('haircol') ? Number(params.get('haircol')) : 0x2a1c12 }, pose: str('pose', 'supine'), eyes: str('eyes', 'open'), seed: num('seed', 3), detail: str('detail', 'high'),
    clothing: { top: str('top', 'tshirt'), topColor: params.has('topcol') ? Number(params.get('topcol')) : 0x56697a, bottom: str('bottom', 'jeans'), bottomColor: params.has('botcol') ? Number(params.get('botcol')) : 0x26344b, shoes: str('shoes', 'trainers') }, ...o,
  });
  demo.build = async (o) => {
    if (demo.human) { demo.human.dispose(); demo.anat?.group?.removeFromParent(); }
    const t0 = performance.now(); const hmn = demo.human = await buildHuman(specOf(o)); demo.ms = Math.round(performance.now() - t0);
    scene.add(hmn.group); hmn.setGround(0); demo.anat = null;
    if (str('anat', '1') !== '0') { try { const an = await import('./anatomy.js'); const t1 = performance.now(); demo.anat = await an.buildAnatomy(hmn, { organs: true }); demo.anatMs = Math.round(performance.now() - t1); demo.T = an.T; } catch (e) { demo.anatErr = String(e.stack || e); } }
    const c = hmn.anchors.sternumCPR.pos; spot.target.position.copy(c); spot2.target.position.copy(c);
    let tris = 0; hmn.group.traverse(m => { if (m.isMesh && m.geometry.index) tris += m.geometry.index.count / 3; }); demo.tris = Math.round(tris);
    return { ms: demo.ms, anatMs: demo.anatMs, tris: demo.tris, anatErr: demo.anatErr };
  };
  await demo.build();
  const hmn = () => demo.human;
  const a0 = hmn().anchors.sternumCPR.pos; controls.target.copy(a0); camera.position.set(a0.x + 1.6, a0.y + 1.5, a0.z + 1.9); camera.near = 0.02; camera.updateProjectionMatrix(); controls.update();
  // look at an anchor from along its normal: __demo.look('forehead', 0.4)
  demo.look = (name, dist = 0.5, yaw = 0, pitch = 0, fov) => { const a = hmn().anchors[name]; if (!a) return 'no anchor ' + name; const n = a.normal.clone(), up = Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0), sx = new THREE.Vector3().crossVectors(up, n).normalize(), sy = new THREE.Vector3().crossVectors(n, sx);
    const d = n.multiplyScalar(Math.cos(yaw) * Math.cos(pitch)).addScaledVector(sx, Math.sin(yaw) * Math.cos(pitch)).addScaledVector(sy, Math.sin(pitch)); const p = a.pos.clone().addScaledVector(d, dist); window.__dev.cam(p.x, p.y, p.z, a.pos.x, a.pos.y, a.pos.z, fov); };
  // camera at an anchor plus an offset, looking at it: __demo.view('nose', 0, 0.4, 0.2, 30)
  demo.view = (name, dx, dy, dz, fov, tx = 0, ty = 0, tz = 0) => { const a = hmn().anchors[name]; if (!a) return 'no anchor ' + name; window.__dev.cam(a.pos.x + dx, a.pos.y + dy, a.pos.z + dz, a.pos.x + tx, a.pos.y + ty, a.pos.z + tz, fov); };
  demo.stats = () => { const r = { ms: demo.ms, anatMs: demo.anatMs }; hmn().group.traverse(m => { if (m.isMesh && m.geometry.index) r[m.name || '?'] = (r[m.name || '?'] || 0) + m.geometry.index.count / 3; }); return r; };
  // layer thicknesses along the inward normal at a site, in mm
  demo.layers = (name, len = 0.12, dir) => { const a = hmn().anchors[name], an = demo.anat; if (!a || !an) return null; const d = dir || a.normal.clone().negate(); return an.trace(a.pos.clone().addScaledVector(d, -0.002), d, len).map(s => `${s.name} ${((s.to - s.from) * 1000).toFixed(1)}`); };
  demo.traceTable = async () => {
    const an = await import('./anatomy.js'), rows = [];
    for (const bmi of [20, 27, 38]) {
      const h2 = await buildHuman(specOf({ bmi, detail: 'low', pose: 'supine' })), a2 = await an.buildAnatomy(h2, { organs: false });
      const first = (site, re, dir, len = 0.15) => { const a = h2.anchors[site], d = dir || a.normal.clone().negate(), segs = a2.trace(a.pos.clone().addScaledVector(d, -0.001), d, len); const s = segs.find(q => re.test(q.name)); return { depth: s ? +((s.from - 0.001) * 1000).toFixed(1) : null, segs: segs.filter(q => q.name !== 'air').map(q => `${q.name}:${((q.to - q.from) * 1000).toFixed(1)}`).join(' | ') }; };
      const xi = h2.anchors.xiphoid, sh = h2.anchors.deltoidL, pc = h2.anchors.subxiphoid.pos.clone();
      const pd = h2.anchors.subxiphoid.dir.clone();
      const pseg = a2.trace(pc.clone().addScaledVector(pd, -0.001), pd, 0.16), peri = pseg.find(q => /pericardium/.test(q.name));
      const back = new THREE.Vector3().setFromMatrixColumn(h2.rig.A.neck, 2).normalize().negate();
      rows.push({ bmi, ics2_pleura: first('ics2L', /parietal pleura/, h2.anchors.ics2L.dir).depth, ics5_pleura: first('ics5L', /parietal pleura/, h2.anchors.ics5L.dir).depth, neck_ctm: first('neckFront', /cricothyroid membrane/, back).depth, neck_lumen: first('neckFront', /airway lumen/, back).depth,
        xiphoid_pericardium: peri ? +((peri.from - 0.001) * 1000).toFixed(1) : null, acf_vein: first('acfL', /vein/).depth, tibia_cortex: first('tibiaL', /tibia cortex/).depth, tibia_marrow: first('tibiaL', /tibia marrow/).depth,
        ics2: first('ics2L', /x/, h2.anchors.ics2L.dir, 0.09).segs, ics5: first('ics5L', /x/, h2.anchors.ics5L.dir, 0.09).segs, neck: first('neckFront', /x/, back, 0.05).segs, peri: pseg.filter(q => q.name !== 'air').map(q => `${q.name}:${((q.to - q.from) * 1000).toFixed(1)}`).join(' | '), acf: first('acfL', /x/, null, 0.03).segs, tibia: first('tibiaL', /x/, null, 0.03).segs });
      h2.dispose();
    }
    console.table(rows); return rows;
  };
  // Self-check of every procedure site: one row per pose and BMI, PASS or the first tissues met.
  demo.selfCheck = async (poses = ['supine', 'semi', 'sitting', 'slumped', 'recovery'], bmis = [20, 27, 38]) => {
    const an = await import('./anatomy.js'), rows = [];
    for (const pose of poses) for (const bmi of bmis) {
      const h2 = await buildHuman(specOf({ bmi, pose, detail: 'low' })), a2 = await an.buildAnatomy(h2, { organs: false }), row = { pose, bmi }, A2 = h2.anchors;
      const tr = (a, d, len) => a2.trace(a.pos.clone().addScaledVector(d, -0.001), d, len, 0.0005).filter(s => s.name !== 'air');
      const inw = a => a.normal.clone().negate();
      const seq = (segs, re1, re2) => { const i = segs.findIndex(s => re1.test(s.name)); return i >= 0 && segs.slice(i + 1).some(s => re2.test(s.name)); };
      const note = (k, ok, segs) => { row[k] = ok ? 'PASS' : 'FAIL ' + segs.slice(0, 6).map(s => s.name + ':' + ((s.to - s.from) * 1000).toFixed(1)).join('>'); };
      for (const sd of ['L', 'R']) {
        let s = tr(A2['acf' + sd], inw(A2['acf' + sd]), 0.02); const v = s.find(q => /vein/.test(q.name)); note('acf' + sd, !!v && v.from - 0.001 < 0.012, s);
        s = tr(A2['tibia' + sd], inw(A2['tibia' + sd]), 0.04); note('tibia' + sd, seq(s, /tibia cortex/, /tibia marrow/), s);
        for (const k of ['ics2', 'ics5']) { s = tr(A2[k + sd], inw(A2[k + sd]), 0.16); note(k + sd, seq(s, /intercostal/, /parietal pleura/) && !s.slice(1).some(q => /^skin/.test(q.name)), s); }
        s = tr(A2['wrist' + sd], inw(A2['wrist' + sd]), 0.02); note('wrist' + sd, a2.surface(A2['wrist' + sd].pos).feel === 'pulsation' || s.some(q => /radial artery/.test(q.name)), s);
      }
      const back = new THREE.Vector3().setFromMatrixColumn(h2.rig.A.neck, 2).normalize().negate();
      let s = tr(A2.neckFront, back, 0.07); note('neckFront', seq(s, /cricothyroid membrane/, /airway lumen/), s);
      s = tr(A2.subxiphoid, A2.subxiphoid.dir, 0.18); const pi = s.findIndex(q => /pericardium/.test(q.name));
      note('subxiphoid', pi > 0 && !s.slice(0, pi).some(q => /cartilage|rib \d|lung|liver|sternum|xiphoid/.test(q.name)), s); row.periDepth = pi > 0 ? +((s[pi].from - 0.001) * 1000).toFixed(0) : null;
      rows.push(row); h2.dispose();
    }
    console.table(rows); return rows;
  };
  let ex = false, xr = false, org = false, th = false;
  addEventListener('keydown', e => {
    const h = hmn(), a = demo.anat;
    if (e.code === 'KeyE') { ex = !ex; h.expose('all', ex); } else if (e.code === 'KeyC') h.expose('chest', true); else if (e.code === 'KeyB') demo.breathing = !demo.breathing;
    else if (e.code === 'KeyX' && a) { xr = !xr; a.setXray(xr ? 0.7 : 0); a.show({ skeleton: xr, organs: xr, vessels: xr, airway: xr }); }
    else if (e.code === 'KeyO' && a) { org = !org; a.show({ skeleton: org, organs: org, vessels: org, airway: org, muscles: false }); }
    else if (e.code === 'KeyT' && a) { th = !th; h.expose('chest', true); a.openings.setThoracotomy(th ? 1 : 0); }
  });
  return (dt, t) => { const h = hmn(); if (!h) return; if (demo.breathing) h.setBreath(0.5 - 0.5 * Math.cos(t * 1.6)); h.update(dt, t); demo.anat?.update?.(dt, t); };
}
