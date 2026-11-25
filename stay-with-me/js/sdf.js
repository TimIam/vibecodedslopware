// Signed-distance toolkit: scalar primitives and blends, a compiled primitive model (SdfModel) that evaluates hundreds
// of bone-attached primitives quickly, and a narrow-band surface-nets mesher (meshSDF / meshSDFAsync) that returns an
// indexed BufferGeometry with normals taken from the SDF gradient.
//
// Conventions: metres, distances negative inside. Every fn handed to the mesher is fn(x, y, z) -> distance and should be
// roughly 1-Lipschitz (smooth unions of true distance fields are; opts.slack covers mild overestimates).
//
// Tuning: mesher block size / slack in meshGen(); primitive record layout in the STRIDE comment below.

import * as THREE from 'three';

// ---------------------------------------------------------------- blends

// Polynomial smooth minimum: k is the blend width in metres (k <= 0 gives a hard min).
export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = k - Math.abs(a - b);
  return h <= 0 ? (a < b ? a : b) : (a < b ? a : b) - h * h / (4 * k);
}
export const smax = (a, b, k) => -smin(-a, -b, k);
export const ssub = (a, b, k) => -smin(-a, b, k);          // a with b carved out
export const sround = (d, r) => d - r;                      // inflate
export const sshell = (d, t) => Math.abs(d) - t;            // hollow shell of half-thickness t

// ---------------------------------------------------------------- primitives (point given relative to the primitive)

export const sdSphere = (x, y, z, r) => Math.sqrt(x * x + y * y + z * z) - r;

// First-order ellipsoid distance (exact on the surface, good within a few cm of it).
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  let d = k0 * (k0 - 1) / k1;
  if (k0 > 1) {      // far from a flat ellipsoid the first-order estimate collapses: never report less than the distance to its box
    const qx = Math.abs(x) - rx, qy = Math.abs(y) - ry, qz = Math.abs(z) - rz, ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0, db = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (db > d) d = db;
  }
  return d;
}

export function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  let h = l2 > 1e-12 ? (pax * bax + pay * bay + paz * baz) / l2 : 0; h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// Capsule whose radius goes from r1 at a to r2 at b (exact).
export function sdRoundCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr;
  const pax = x - ax, pay = y - ay, paz = z - az;
  if (a2 <= 1e-12) { return r1 > r2 ? Math.sqrt(pax * pax + pay * pay + paz * paz) - r1 : Math.sqrt((x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2) - r2; }
  return roundConeCore(pax, pay, paz, bax, bay, baz, l2, rr, a2, 1 / l2, r1, r2);
}
function roundConeCore(pax, pay, paz, bax, bay, baz, l2, rr, a2, il2, r1, r2) {
  const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
  const cx = pax * l2 - bax * yy, cy = pay * l2 - bay * yy, cz = paz * l2 - baz * yy;
  const x2 = cx * cx + cy * cy + cz * cz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = (rr < 0 ? -1 : 1) * rr * rr * x2;
  if ((zz < 0 ? -1 : 1) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if ((yy < 0 ? -1 : 1) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

// Box with half extents (hx,hy,hz) and corner radius r (the radius is taken out of the extents, so the box keeps its size).
export function sdRoundBox(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  const m = qx > qy ? (qx > qz ? qx : qz) : (qy > qz ? qy : qz);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + (m < 0 ? m : 0) - r;
}

// Torus around the local Y axis: ring radius R, tube radius r.
export function sdTorus(x, y, z, R, r) { const q = Math.sqrt(x * x + z * z) - R; return Math.sqrt(q * q + y * y) - r; }

// Quadratic Bezier tube A -> (B control) -> C, radius r1 at A to r2 at C. Returns distance; sdBezier.t holds the parameter.
export function sdBezier(x, y, z, A, B, C, r1, r2 = r1) {
  const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2];
  const bx = A[0] - 2 * B[0] + C[0], by = A[1] - 2 * B[1] + C[1], bz = A[2] - 2 * B[2] + C[2];
  const dx = A[0] - x, dy = A[1] - y, dz = A[2] - z;
  const bb = bx * bx + by * by + bz * bz;
  let t;
  if (bb < 1e-12) {   // straight
    const cx = C[0] - A[0], cy = C[1] - A[1], cz = C[2] - A[2], l2 = cx * cx + cy * cy + cz * cz;
    t = l2 > 1e-12 ? -(dx * cx + dy * cy + dz * cz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = dx + cx * t, ey = dy + cy * t, ez = dz + cz * t;
    sdBezier.t = t; return Math.sqrt(ex * ex + ey * ey + ez * ez) - (r1 + (r2 - r1) * t);
  }
  const kk = 1 / bb, kx = kk * (ax * bx + ay * by + az * bz);
  const ky = kk * (2 * (ax * ax + ay * ay + az * az) + (dx * bx + dy * by + dz * bz)) / 3, kz = kk * (dx * ax + dy * ay + dz * az);
  const p = ky - kx * kx, p3 = p * p * p, q = kx * (2 * kx * kx - 3 * ky) + kz;
  let h = q * q + 4 * p3, res;
  const d2 = tt => { const ex = dx + (2 * ax + bx * tt) * tt, ey = dy + (2 * ay + by * tt) * tt, ez = dz + (2 * az + bz * tt) * tt; return ex * ex + ey * ey + ez * ez; };
  const c01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  if (h >= 0) {
    h = Math.sqrt(h);
    const x0 = (h - q) / 2, x1 = (-h - q) / 2;
    t = c01(Math.cbrt(x0) + Math.cbrt(x1) - kx); res = d2(t);
  } else {
    const zz = Math.sqrt(-p), v = Math.acos(Math.max(-1, Math.min(1, q / (p * zz * 2)))) / 3, m = Math.cos(v), n = Math.sin(v) * 1.732050808;
    const t0 = c01((m + m) * zz - kx), t1 = c01((-n - m) * zz - kx), e0 = d2(t0), e1 = d2(t1);
    if (e0 < e1) { t = t0; res = e0; } else { t = t1; res = e1; }
  }
  sdBezier.t = t; return Math.sqrt(res) - (r1 + (r2 - r1) * t);
}

// ---------------------------------------------------------------- domain helpers

export const opMirrorX = x => Math.abs(x);
export const opRepeat = (v, period) => v - period * Math.round(v / period);
export const opRepeatLim = (v, period, lo, hi) => v - period * Math.max(lo, Math.min(hi, Math.round(v / period)));
// Rotate (x, y) by angle a; returns [x', y'].
export const opRot2 = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * x - s * y, s * x + c * y]; };
// Wrap an fn so it is evaluated in the local space of a Matrix4 (rigid transforms keep distances exact).
export function opTransform(fn, matrix) {
  const e = new THREE.Matrix4().copy(matrix).invert().elements;
  return (x, y, z) => fn(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
}

// Gradient by tetrahedral differences (4 evaluations). Writes the unit normal into out[0..2], returns the mean value
// (a second-order estimate of fn at the point).
export function sdfNormal(fn, x, y, z, eps, out) {
  const a = fn(x + eps, y - eps, z - eps), b = fn(x - eps, y - eps, z + eps), c = fn(x - eps, y + eps, z - eps), d = fn(x + eps, y + eps, z + eps);
  let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
  out[0] = nx; out[1] = ny; out[2] = nz; out[3] = l / (4 * eps);
  return (a + b + c + d) * 0.25;
}

// Sphere-trace from o along unit d. Returns the distance travelled to the surface, or -1 if nothing within maxLen.
export function sdfRaycast(fn, ox, oy, oz, dx, dy, dz, maxLen = 2, tol = 1e-4) {
  let t = 0;
  for (let i = 0; i < 160 && t < maxLen; i++) {
    const v = fn(ox + dx * t, oy + dy * t, oz + dz * t);
    if (v < tol) return t;
    t += v * 0.9;
  }
  return -1;
}

// ---------------------------------------------------------------- compiled model

// Primitive record, STRIDE floats: [0] type [1] op [2] k [3] fat [4] flags [5..8] bound sphere (centre, radius)
// [9..] parameters. Types: 0 sphere, 1 round cone, 2 ellipsoid, 3 round box, 4 torus, 5 half-space.
const STRIDE = 28;
export const OP_UNION = 0, OP_SUB = 1, OP_INT = 2;
export const F_FAT_ONLY = 1;       // only present when fat scale > 0 (pure adipose shapes)
export const F_DETAIL = 2;         // skipped when evaluating with the DETAIL bit masked out (clothing bases)
// Higher bits are user "mode" bits: a primitive carrying any of them is only evaluated when eval() is called with a mode
// that shares a bit (used for cloth-only drape shapes).
const USER_MASK = ~3;

const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

class SdfGroup {
  constructor(model, o) {
    this.model = model; this.name = o.name || ''; this.tag = o.tag ?? 0;
    this.matrix = o.matrix ? o.matrix.clone() : new THREE.Matrix4();   // primitive space -> model space (affine)
    this.rScale = o.rScale ?? 1;                                        // multiplies radii of spheres/cones/tori
    this.parent = o.parent ? o.parent.index : -1; this.k = o.k ?? 0;
    this.joint = null; this.jr0 = 0; this.jr1 = 0;
    if (o.joint) { const j = _v.set(o.joint[0], o.joint[1], o.joint[2]).applyMatrix4(this.matrix); this.joint = [j.x, j.y, j.z]; this.jr0 = o.jr0 ?? 0.1; this.jr1 = o.jr1 ?? 0.2; }
    this.post = o.post || null; this.data = []; this.n = 0; this.prims = null;
    this.cx = 0; this.cy = 0; this.cz = 0; this.r = 0; this.fatMax = 0; this.index = model.groups.length; this.mask = o.mask ?? 1;
    this.defaults = { k: o.pk ?? 0.01, fat: o.fat ?? 0, op: OP_UNION, flags: 0 };
  }
  _rec(type, o, bound, params) {
    const d = this.defaults, rec = new Array(STRIDE).fill(0);
    rec[0] = type; rec[1] = o?.op ?? d.op; rec[2] = o?.k ?? d.k; rec[3] = rec[1] === OP_UNION ? (o?.fat ?? d.fat) : 0; rec[4] = o?.flags ?? d.flags;
    rec[5] = bound[0]; rec[6] = bound[1]; rec[7] = bound[2]; rec[8] = bound[3];
    for (let i = 0; i < params.length; i++) rec[9 + i] = params[i];
    this.data.push(rec); this.n++; return this;
  }
  _pt(x, y, z) { _v.set(x, y, z).applyMatrix4(this.matrix); return [_v.x, _v.y, _v.z]; }
  sphere(x, y, z, r, o) { const c = this._pt(x, y, z); r *= o?.rs ?? this.rScale; return this._rec(0, o, [c[0], c[1], c[2], r], [c[0], c[1], c[2], r]); }
  cone(ax, ay, az, r1, bx, by, bz, r2, o) {
    const a = this._pt(ax, ay, az), b = this._pt(bx, by, bz), rs = o?.rs ?? this.rScale; r1 *= rs; r2 *= rs;
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr;
    if (a2 <= 1e-10) { return r1 >= r2 ? this._rec(0, o, [a[0], a[1], a[2], r1], [a[0], a[1], a[2], r1]) : this._rec(0, o, [b[0], b[1], b[2], r2], [b[0], b[1], b[2], r2]); }
    const l = Math.sqrt(l2), br = l * 0.5 + Math.max(r1, r2);
    return this._rec(1, o, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, br], [a[0], a[1], a[2], bax, bay, baz, r1, r2, l2, rr, a2, 1 / l2]);
  }
  // Oriented primitives: build local->model matrix from centre + Euler rotation (XYZ, radians, in primitive space).
  _inv(cx, cy, cz, rot, ext) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ'); _q.setFromEuler(_e);
    _m.compose(_v.set(cx, cy, cz), _q, _s); _m.premultiply(this.matrix);
    // pull the (possibly non-uniform) scale out of the composed matrix into the extents so local space stays metric
    const e = _m.elements, out = [];
    for (let c = 0; c < 3; c++) {
      const l = Math.hypot(e[c * 4], e[c * 4 + 1], e[c * 4 + 2]) || 1;
      e[c * 4] /= l; e[c * 4 + 1] /= l; e[c * 4 + 2] /= l; out.push(ext[c] * l);
    }
    const centre = [e[12], e[13], e[14]];
    _mi.copy(_m).invert(); const i = _mi.elements;
    return { inv: [i[0], i[4], i[8], i[12], i[1], i[5], i[9], i[13], i[2], i[6], i[10], i[14]], ext: out, centre };
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, rot, o) {
    const t = this._inv(cx, cy, cz, rot, [rx, ry, rz]);
    return this._rec(2, o, [t.centre[0], t.centre[1], t.centre[2], Math.max(t.ext[0], t.ext[1], t.ext[2])], [...t.inv, t.ext[0], t.ext[1], t.ext[2]]);
  }
  box(cx, cy, cz, hx, hy, hz, round, rot, o) {
    const t = this._inv(cx, cy, cz, rot, [hx, hy, hz]);
    return this._rec(3, o, [t.centre[0], t.centre[1], t.centre[2], Math.hypot(t.ext[0], t.ext[1], t.ext[2])], [...t.inv, t.ext[0], t.ext[1], t.ext[2], round * (o?.rs ?? this.rScale)]);
  }
  torus(cx, cy, cz, R, r, rot, o) {
    const t = this._inv(cx, cy, cz, rot, [1, 1, 1]), rs = o?.rs ?? this.rScale;
    return this._rec(4, o, [t.centre[0], t.centre[1], t.centre[2], (R + r) * rs], [...t.inv, R * rs, r * rs]);
  }
  // Half-space: keeps the side the normal points away from when used with OP_INT (d = n.p - offset).
  plane(px, py, pz, nx, ny, nz, o) {
    const p = this._pt(px, py, pz), q = this._pt(px + nx, py + ny, pz + nz);
    let ax = q[0] - p[0], ay = q[1] - p[1], az = q[2] - p[2]; const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    return this._rec(5, o, [0, 0, 0, 1e9], [ax, ay, az, ax * p[0] + ay * p[1] + az * p[2]]);
  }
  // Quadratic Bezier tube as a chain of round cones.
  bezier(A, B, C, r1, r2, n = 6, o) {
    let px = A[0], py = A[1], pz = A[2], pr = r1;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * A[0] + 2 * u * t * B[0] + t * t * C[0], y = u * u * A[1] + 2 * u * t * B[1] + t * t * C[1], z = u * u * A[2] + 2 * u * t * B[2] + t * t * C[2], r = r1 + (r2 - r1) * t;
      this.cone(px, py, pz, pr, x, y, z, r, o); px = x; py = y; pz = z; pr = r;
    }
    return this;
  }
  _finalize() {
    const n = this.n, P = this.prims = new Float64Array(n * STRIDE);
    let minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9, fat = 0;
    for (let i = 0; i < n; i++) {
      const rec = this.data[i]; P.set(rec, i * STRIDE);
      if (rec[1] !== OP_UNION || rec[0] === 5) continue;
      const r = rec[8]; fat = Math.max(fat, rec[3]);
      minx = Math.min(minx, rec[5] - r); maxx = Math.max(maxx, rec[5] + r); miny = Math.min(miny, rec[6] - r); maxy = Math.max(maxy, rec[6] + r); minz = Math.min(minz, rec[7] - r); maxz = Math.max(maxz, rec[7] + r);
    }
    this.cx = (minx + maxx) / 2; this.cy = (miny + maxy) / 2; this.cz = (minz + maxz) / 2;
    let r = 0;
    for (let i = 0; i < n; i++) { const rec = this.data[i]; if (rec[1] !== OP_UNION || rec[0] === 5) continue; r = Math.max(r, Math.hypot(rec[5] - this.cx, rec[6] - this.cy, rec[7] - this.cz) + rec[8]); }
    this.r = r; this.fatMax = fat; this.box = [minx, miny, minz, maxx, maxy, maxz];
  }
}

export class SdfModel {
  constructor() { this.groups = []; this.hit = -1; this._dist = null; }
  // o: { name, tag, matrix (Matrix4: primitive space -> model space), rScale, parent (group), k (blend with parent),
  //      joint [x,y,z] + jr0/jr1 (blend with the parent fades out between jr0 and jr1 metres from the joint),
  //      pk (default primitive blend), fat (default fat inflation), post(x,y,z,d,fs,mode) -> d }
  group(o = {}) { const g = new SdfGroup(this, o); this.groups.push(g); return g; }
  finalize() { for (const g of this.groups) g._finalize(); this._dist = new Float64Array(this.groups.length); return this; }
  bounds(pad = 0.02) {
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const g of this.groups) { if (!g.n) continue; for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], g.box[i] - g.fatMax - pad); b[i + 3] = Math.max(b[i + 3], g.box[i + 3] + g.fatMax + pad); } }
    return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
  }
  // Distance at a model-space point. fs scales every primitive's fat inflation (0 = lean body, 1 = skin surface);
  // mode selects user-flagged primitives; gm (optional) restricts evaluation to groups whose .mask shares a bit.
  // Sets this.hit to the index of the group the point belongs to.
  eval(x, y, z, fs = 1, mode = 0, gm = 0) {
    const groups = this.groups, dist = this._dist; let best = 1e9, bestRaw = 1e9, hit = -1;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!g.n || (gm && !(g.mask & gm))) { dist[gi] = 1e9; continue; }
      const dx = x - g.cx, dy = y - g.cy, dz = z - g.cz;
      const db = Math.sqrt(dx * dx + dy * dy + dz * dz) - g.r - g.fatMax * fs;
      if (db > best + g.k + 0.002) { dist[gi] = db; continue; }
      let d = evalGroup(g, x, y, z, fs, mode);
      if (g.post) d = g.post(x, y, z, d, fs, mode);
      if (d < bestRaw) { bestRaw = d; hit = gi; }
      if (g.parent >= 0) {
        let k = g.k;
        if (g.joint) { const jx = x - g.joint[0], jy = y - g.joint[1], jz = z - g.joint[2], jd = Math.sqrt(jx * jx + jy * jy + jz * jz); let t = (jd - g.jr0) / (g.jr1 - g.jr0); t = t < 0 ? 0 : t > 1 ? 1 : t; k *= 1 - t * t * (3 - 2 * t); }
        d = smin(dist[g.parent], d, k);
      }
      dist[gi] = d;
      if (d < best) best = d;
    }
    this.hit = hit; return best;
  }
  fn(fs = 1, mode = 0) { return (x, y, z) => this.eval(x, y, z, fs, mode); }
}

function evalGroup(g, x, y, z, fs, mode) {
  const P = g.prims, n = g.n; let d = 1e9;
  for (let i = 0, o = 0; i < n; i++, o += STRIDE) {
    const flags = P[o + 4];
    if (flags !== 0) {
      if ((flags & F_FAT_ONLY) && fs <= 0) continue;
      if ((flags & F_DETAIL) && (mode & F_DETAIL)) continue;
      const u = flags & USER_MASK; if (u && !(u & mode)) continue;
    }
    const op = P[o + 1], k = P[o + 2], f = P[o + 3] * fs, type = P[o];
    if (type !== 5) {
      const bx = x - P[o + 5], by = y - P[o + 6], bz = z - P[o + 7];
      const db = Math.sqrt(bx * bx + by * by + bz * bz) - P[o + 8] - f;
      if (op === 0) { if (db > d + k) continue; } else if (op === 1) { if (db > k) continue; }
    }
    let dp;
    switch (type) {
      case 0: { const ax = x - P[o + 9], ay = y - P[o + 10], az = z - P[o + 11]; dp = Math.sqrt(ax * ax + ay * ay + az * az) - P[o + 12]; break; }
      case 1: dp = roundConeCore(x - P[o + 9], y - P[o + 10], z - P[o + 11], P[o + 12], P[o + 13], P[o + 14], P[o + 17], P[o + 18], P[o + 19], P[o + 20], P[o + 15], P[o + 16]); break;
      case 2: {
        const lx = P[o + 9] * x + P[o + 10] * y + P[o + 11] * z + P[o + 12], ly = P[o + 13] * x + P[o + 14] * y + P[o + 15] * z + P[o + 16], lz = P[o + 17] * x + P[o + 18] * y + P[o + 19] * z + P[o + 20];
        dp = sdEllipsoid(lx, ly, lz, P[o + 21], P[o + 22], P[o + 23]); break;
      }
      case 3: {
        const lx = P[o + 9] * x + P[o + 10] * y + P[o + 11] * z + P[o + 12], ly = P[o + 13] * x + P[o + 14] * y + P[o + 15] * z + P[o + 16], lz = P[o + 17] * x + P[o + 18] * y + P[o + 19] * z + P[o + 20];
        dp = sdRoundBox(lx, ly, lz, P[o + 21], P[o + 22], P[o + 23], P[o + 24]); break;
      }
      case 4: {
        const lx = P[o + 9] * x + P[o + 10] * y + P[o + 11] * z + P[o + 12], ly = P[o + 13] * x + P[o + 14] * y + P[o + 15] * z + P[o + 16], lz = P[o + 17] * x + P[o + 18] * y + P[o + 19] * z + P[o + 20];
        dp = sdTorus(lx, ly, lz, P[o + 21], P[o + 22]); break;
      }
      default: dp = P[o + 9] * x + P[o + 10] * y + P[o + 11] * z - P[o + 12];
    }
    dp -= f;
    if (op === 0) d = smin(d, dp, k); else if (op === 1) d = -smin(-d, dp, k); else d = -smin(-d, -dp, k);
  }
  return d;
}

// ---------------------------------------------------------------- mesher

const yieldNow = (() => {
  if (typeof MessageChannel === 'undefined') return () => new Promise(r => setTimeout(r, 0));
  const ch = new MessageChannel(), q = [];
  ch.port1.onmessage = () => { const r = q.shift(); if (r) r(); };
  return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); });
})();

// Narrow-band surface nets. bbox { min:[x,y,z], max:[x,y,z] } (or Box3), res = cell size in metres.
// opts:
//   block     coarse block size in cells (default 4): fn is sampled once per block and the block skipped when far
//   slack     safety factor on that skip test (default 1.3; raise for sloppy distance fields)
//   normalFn  alternative field used only for normals (e.g. with extra fine detail)
//   eps       gradient step (default res * 0.2)
//   project   pull each vertex onto fn = 0 with one Newton step (default true)
//   keep      (x,y,z) -> bool vertex filter; triangles touching a dropped vertex are removed (ragged clip)
//   skip      (cx,cy,cz,R) -> bool: skip the whole block centred there (R = its bounding radius), e.g. outside a region
//   attributes { name: itemSize, ... } extra per-vertex Float32 attributes, filled by
//   vertex     (x,y,z,nx,ny,nz, arrays, i, g) called once per final vertex (write arrays[name][i*itemSize + c]);
//              g is the field's gradient length there (1 for a true distance field, less inside smooth blends)
// Returns a BufferGeometry (position, normal, index) or null when the field has no surface in the box.
export function meshSDF(fn, bbox, res, opts = {}) {
  const it = meshGen(fn, bbox, res, opts); let r;
  while (!(r = it.next()).done);
  return r.value;
}
// Same, yielding to the event loop every opts.budgetMs (default 12 ms); opts.onProgress(0..1) is called on each yield.
export async function meshSDFAsync(fn, bbox, res, opts = {}) {
  const it = meshGen(fn, bbox, res, opts), budget = opts.budgetMs ?? 12; let t0 = performance.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - t0 > budget) { opts.onProgress?.(r.value); await yieldNow(); t0 = performance.now(); }
  }
}

function* meshGen(fn, bbox, h, o) {
  const B = o.block || 4, slack = o.slack || 1.3;
  const mn = bbox.min.isVector3 ? bbox.min.toArray() : bbox.min, mx = bbox.max.isVector3 ? bbox.max.toArray() : bbox.max;
  const x0 = mn[0], y0 = mn[1], z0 = mn[2];
  const bx = Math.max(1, Math.ceil((mx[0] - x0) / (h * B))), by = Math.max(1, Math.ceil((mx[1] - y0) / (h * B))), bz = Math.max(1, Math.ceil((mx[2] - z0) / (h * B)));
  const NX = bx * B, NY = by * B, NZ = bz * B, sx = NX + 1, sy = NY + 1, sxy = sx * sy;
  const vals = new Float32Array(sx * sy * (NZ + 1)).fill(NaN);
  const active = new Uint8Array(bx * by * bz), list = [];
  const R = B * h * 0.8661 * slack, half = B * h * 0.5;
  let tick = 0;
  // pass 1: find blocks near the surface and sample their corners
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    const bcx = x0 + i * B * h + half, bcy = y0 + j * B * h + half, bcz = z0 + k * B * h + half;
    if (o.skip && o.skip(bcx, bcy, bcz, R)) continue;
    const d = fn(bcx, bcy, bcz);
    if (d > R || d < -R) continue;
    active[i + bx * (j + by * k)] = 1; list.push(i, j, k);
    for (let c = 0; c <= B; c++) { const zz = k * B + c, pz = z0 + zz * h; for (let b = 0; b <= B; b++) { const yy = j * B + b, py = y0 + yy * h; let idx = i * B + sx * yy + sxy * zz; for (let a = 0; a <= B; a++, idx++) if (vals[idx] !== vals[idx]) vals[idx] = fn(x0 + (i * B + a) * h, py, pz); } }
    if ((++tick & 31) === 0) yield 0.45 * (k / bz);
  }
  if (!list.length) return null;
  // pass 2: one vertex per cell that straddles the surface
  const cellVert = new Int32Array(NX * NY * NZ).fill(-1), nxy = NX * NY;
  const pos = [];
  const cornerOff = [0, 1, sx, sx + 1, sxy, sxy + 1, sxy + sx, sxy + sx + 1];
  const E0 = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], E1 = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const cv = new Float64Array(8);
  for (let b = 0; b < list.length; b += 3) {
    const bi = list[b] * B, bj = list[b + 1] * B, bk = list[b + 2] * B;
    for (let k = bk; k < bk + B; k++) for (let j = bj; j < bj + B; j++) for (let i = bi; i < bi + B; i++) {
      const base = i + sx * j + sxy * k; let mask = 0;
      for (let c = 0; c < 8; c++) { const v = vals[base + cornerOff[c]]; cv[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, cnt = 0;
      for (let e = 0; e < 12; e++) {
        const a = E0[e], c = E1[e], va = cv[a], vc = cv[c];
        if ((va < 0) === (vc < 0)) continue;
        const t = va / (va - vc);
        ax += (a & 1) + ((c & 1) - (a & 1)) * t; ay += ((a >> 1) & 1) + (((c >> 1) & 1) - ((a >> 1) & 1)) * t; az += ((a >> 2) & 1) + (((c >> 2) & 1) - ((a >> 2) & 1)) * t; cnt++;
      }
      cellVert[i + NX * j + nxy * k] = pos.length / 3;
      pos.push(x0 + (i + ax / cnt) * h, y0 + (j + ay / cnt) * h, z0 + (k + az / cnt) * h);
    }
    if ((b & 255) === 0) yield 0.45 + 0.1 * (b / list.length);
  }
  // pass 3: a quad for every grid edge that crosses the surface
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // split along the shorter diagonal
    const d1 = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const d2 = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (d1 <= d2) { if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); }
    else if (flip) idx.push(b, a, d, b, d, c); else idx.push(a, b, d, b, c, d);
  };
  for (let b = 0; b < list.length; b += 3) {
    const bi = list[b] * B, bj = list[b + 1] * B, bk = list[b + 2] * B;
    for (let k = bk; k < bk + B; k++) for (let j = bj; j < bj + B; j++) for (let i = bi; i < bi + B; i++) {
      const base = i + sx * j + sxy * k, v0 = vals[base], in0 = v0 < 0, c = i + NX * j + nxy * k;
      if (j > 0 && k > 0) { const v1 = vals[base + 1]; if (in0 !== (v1 < 0)) quad(cellVert[c - NX - nxy], cellVert[c - nxy], cellVert[c], cellVert[c - NX], !in0); }
      if (i > 0 && k > 0) { const v1 = vals[base + sx]; if (in0 !== (v1 < 0)) quad(cellVert[c - 1 - nxy], cellVert[c - 1], cellVert[c], cellVert[c - nxy], !in0); }
      if (i > 0 && j > 0) { const v1 = vals[base + sxy]; if (in0 !== (v1 < 0)) quad(cellVert[c - 1 - NX], cellVert[c - NX], cellVert[c], cellVert[c - 1], !in0); }
    }
  }
  // pass 4: gradient normals, projection onto the surface, attributes
  const nv = pos.length / 3, P = new Float32Array(pos), N = new Float32Array(nv * 3), GM = new Float32Array(nv), keepV = o.keep ? new Uint8Array(nv) : null;
  const eps = o.eps || h * 0.2, out = [0, 0, 0, 0], project = o.project !== false, nfn = o.normalFn || null;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const d = sdfNormal(fn, x, y, z, eps, out); GM[v] = out[3];
    if (project && d > -h && d < h) { const g = Math.max(out[3], 0.5); x -= out[0] * d / g; y -= out[1] * d / g; z -= out[2] * d / g; P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; }
    if (nfn) sdfNormal(nfn, x, y, z, eps, out);
    N[v * 3] = out[0]; N[v * 3 + 1] = out[1]; N[v * 3 + 2] = out[2];
    if (keepV) keepV[v] = o.keep(x, y, z) ? 1 : 0;
    if ((v & 1023) === 0) yield 0.55 + 0.35 * (v / nv);
  }
  // drop filtered triangles and compact
  let index = idx, Pp = P, Nn = N, Gg = GM, count = nv;
  if (keepV) {
    const kept = []; for (let t = 0; t < idx.length; t += 3) if (keepV[idx[t]] && keepV[idx[t + 1]] && keepV[idx[t + 2]]) kept.push(idx[t], idx[t + 1], idx[t + 2]);
    const remap = new Int32Array(nv).fill(-1); count = 0;
    for (let t = 0; t < kept.length; t++) { const v = kept[t]; if (remap[v] < 0) remap[v] = count++; kept[t] = remap[v]; }
    Pp = new Float32Array(count * 3); Nn = new Float32Array(count * 3); Gg = new Float32Array(count);
    for (let v = 0; v < nv; v++) { const r = remap[v]; if (r < 0) continue; Pp[r * 3] = P[v * 3]; Pp[r * 3 + 1] = P[v * 3 + 1]; Pp[r * 3 + 2] = P[v * 3 + 2]; Nn[r * 3] = N[v * 3]; Nn[r * 3 + 1] = N[v * 3 + 1]; Nn[r * 3 + 2] = N[v * 3 + 2]; Gg[r] = GM[v]; }
    index = kept;
  }
  if (!count || !index.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Pp, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
  if (o.attributes) {
    const arrays = {};
    for (const name in o.attributes) arrays[name] = new Float32Array(count * o.attributes[name]);
    if (o.vertex) for (let v = 0; v < count; v++) { o.vertex(Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2], arrays, v, Gg[v]); if ((v & 1023) === 0) yield 0.9 + 0.1 * (v / count); }
    for (const name in arrays) geo.setAttribute(name, new THREE.BufferAttribute(arrays[name], o.attributes[name]));
  }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

// Sweep an ellipse (half-widths a along the supplied side vector, b along the binormal) along a polyline. Points is an
// array of [x,y,z]; radius(i, t) may return [a, b]; side(i) optionally gives a preferred side vector to keep the section
// from twisting. Used for ribs, vessels, hair bands and anything else that is a tube. Returns a BufferGeometry.
export function sweepTube(points, radius, { segments = 8, side = null, caps = true } = {}) {
  const n = points.length, pos = [], nor = [], idx = [];
  const T = new THREE.Vector3(), S = new THREE.Vector3(1, 0, 0), Bn = new THREE.Vector3(), prev = new THREE.Vector3(), nxt = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    prev.fromArray(points[Math.max(0, i - 1)]); nxt.fromArray(points[Math.min(n - 1, i + 1)]); T.subVectors(nxt, prev).normalize();
    if (side) S.fromArray(side(i)); else if (i === 0) { S.set(1, 0, 0); if (Math.abs(T.x) > 0.9) S.set(0, 1, 0); }
    S.addScaledVector(T, -S.dot(T)).normalize(); Bn.crossVectors(T, S).normalize();
    const r = radius(i, i / (n - 1)), a = Array.isArray(r) ? r[0] : r, b = Array.isArray(r) ? r[1] : r, p = points[i];
    for (let s = 0; s < segments; s++) {
      const an = s / segments * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an);
      pos.push(p[0] + S.x * c * a + Bn.x * sn * b, p[1] + S.y * c * a + Bn.y * sn * b, p[2] + S.z * c * a + Bn.z * sn * b);
      const nx = S.x * c * b + Bn.x * sn * a, ny = S.y * c * b + Bn.y * sn * a, nz = S.z * c * b + Bn.z * sn * a, l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
    }
    if (i > 0) for (let s = 0; s < segments; s++) { const a0 = (i - 1) * segments + s, a1 = (i - 1) * segments + (s + 1) % segments, b0 = i * segments + s, b1 = i * segments + (s + 1) % segments; idx.push(a0, a1, b1, a0, b1, b0); }
  }
  if (caps) for (const end of [0, n - 1]) {
    const c = pos.length / 3, p = points[end]; pos.push(p[0], p[1], p[2]);
    prev.fromArray(points[Math.max(0, end - 1)]); nxt.fromArray(points[Math.min(n - 1, end + 1)]); T.subVectors(nxt, prev).normalize(); if (end === 0) T.negate();
    nor.push(T.x, T.y, T.z);
    for (let s = 0; s < segments; s++) { const a0 = end * segments + s, a1 = end * segments + (s + 1) % segments; if (end === 0) idx.push(c, a1, a0); else idx.push(c, a0, a1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}
