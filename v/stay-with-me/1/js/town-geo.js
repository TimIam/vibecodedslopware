// Town geometry plumbing: a growable mesh builder (MB) that every town generator appends into, the chunk grid that
// turns those builders into frustum-cullable meshes, 2D polygon helpers, the surface raster and the collider hash.
//
// Frames: a builder carries a rigid frame (origin + rotation about Y, three.js convention: local +Z maps to
// (sin h, 0, cos h)). Lots and buildings are authored in a local frame whose +Z points at the street.
// Vertex format: position f32x3, normal i8x3, uv f32x2 (metres), aCol u8x4 (sRGB tint, a = material layer id),
// and for facade meshes aWinA/aWinB f32x4 (window grid, see town-mat.js).

import * as THREE from 'three';

export const CHUNK = 250;

export class MB {
  constructor(win = false) {
    this.win = win; this.n = 0; this.ni = 0; this.cap = 0; this.icap = 0;
    this.P = this.N = this.T = this.C = this.W = this.I = null;
    this.ox = 0; this.oy = 0; this.oz = 0; this.c = 1; this.s = 0; this.h = 0; this.st = [];
    this.r = 255; this.g = 255; this.b = 255; this.l = 0;
    this.w = new Float32Array(8);
    this._gv(512); this._gi(1024);
  }
  _gv(nv) {
    if (this.n + nv <= this.cap) return;
    const cap = Math.max(this.cap * 2, this.n + nv + 512), n = this.n;
    const P = new Float32Array(cap * 3), N = new Int8Array(cap * 3), T = new Float32Array(cap * 2), C = new Uint8Array(cap * 4);
    if (this.P) { P.set(this.P.subarray(0, n * 3)); N.set(this.N.subarray(0, n * 3)); T.set(this.T.subarray(0, n * 2)); C.set(this.C.subarray(0, n * 4)); }
    this.P = P; this.N = N; this.T = T; this.C = C;
    if (this.win) { const W = new Float32Array(cap * 8); if (this.W) W.set(this.W.subarray(0, n * 8)); this.W = W; }
    this.cap = cap;
  }
  _gi(ni) {
    if (this.ni + ni <= this.icap) return;
    const cap = Math.max(this.icap * 2, this.ni + ni + 1024), I = new Uint32Array(cap);
    if (this.I) I.set(this.I.subarray(0, this.ni)); this.I = I; this.icap = cap;
  }
  // ---- state
  frame(x = 0, y = 0, z = 0, h = 0) { this.ox = x; this.oy = y; this.oz = z; this.h = h; this.c = Math.cos(h); this.s = Math.sin(h); return this; }
  push(x = 0, y = 0, z = 0, h = 0) {
    this.st.push(this.ox, this.oy, this.oz, this.h);
    const c = this.c, s = this.s;
    return this.frame(this.ox + x * c + z * s, this.oy + y, this.oz - x * s + z * c, this.h + h);
  }
  pop() { const h = this.st.pop(), z = this.st.pop(), y = this.st.pop(), x = this.st.pop(); return this.frame(x, y, z, h); }
  col(r, g = r, b = r) { this.r = r; this.g = g; this.b = b; return this; }
  hex(c) { this.r = c >> 16 & 255; this.g = c >> 8 & 255; this.b = c & 255; return this; }
  lay(l) { this.l = l; return this; }
  // window grid for the following facade quads: cell size and window size (m), seed, style, recess depth (m, < 1),
  // lit profile, and the wall-uv position of the grid origin (cells start there)
  wn(cw = 0, ch = 3, ww = 1, wh = 1.5, seed = 0, style = 0, recess = 0.15, lit = 0, u0 = 0, v0 = 0) { const w = this.w; w[0] = cw; w[1] = ch; w[2] = ww; w[3] = wh; w[4] = (seed % 4000) * 8 + lit; w[5] = style + Math.min(0.95, recess); w[6] = u0; w[7] = v0; return this; }
  // ---- raw
  v(x, y, z, nx, ny, nz, u, v) {
    if (this.n >= this.cap) this._gv(1);
    const i = this.n, c = this.c, s = this.s, P = this.P, N = this.N, C = this.C;
    P[i * 3] = this.ox + x * c + z * s; P[i * 3 + 1] = this.oy + y; P[i * 3 + 2] = this.oz - x * s + z * c;
    N[i * 3] = (nx * c + nz * s) * 127; N[i * 3 + 1] = ny * 127; N[i * 3 + 2] = (-nx * s + nz * c) * 127;
    this.T[i * 2] = u; this.T[i * 2 + 1] = v;
    C[i * 4] = this.r; C[i * 4 + 1] = this.g; C[i * 4 + 2] = this.b; C[i * 4 + 3] = this.l;
    if (this.win) this.W.set(this.w, i * 8);
    return this.n++;
  }
  tri(a, b, c) { if (this.ni + 3 > this.icap) this._gi(3); const I = this.I; I[this.ni++] = a; I[this.ni++] = b; I[this.ni++] = c; }
  // ---- primitives (all coordinates local to the current frame)
  // Quad a(bottom-left) b(bottom-right) c(top-right) d(top-left) seen from the front; uv from (u0,v0), metres by default.
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0 = 0, v0 = 0, u1, v1) {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
    if (u1 === undefined) u1 = u0 + Math.hypot(e1x, e1y, e1z);
    if (v1 === undefined) v1 = v0 + Math.hypot(e2x, e2y, e2z);
    this._gv(4);
    const a = this.v(ax, ay, az, nx, ny, nz, u0, v0), b = this.v(bx, by, bz, nx, ny, nz, u1, v0), c = this.v(cx, cy, cz, nx, ny, nz, u1, v1), d = this.v(dx, dy, dz, nx, ny, nz, u0, v1);
    this.tri(a, b, c); this.tri(a, c, d);
  }
  // Triangle with planar uv (u along a->b).
  tri3(ax, ay, az, bx, by, bz, cx, cy, cz, u0 = 0, v0 = 0) {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
    const l1 = Math.hypot(e1x, e1y, e1z) || 1, pu = (e2x * e1x + e2y * e1y + e2z * e1z) / l1, pv = Math.sqrt(Math.max(0, e2x * e2x + e2y * e2y + e2z * e2z - pu * pu));
    this._gv(3);
    this.tri(this.v(ax, ay, az, nx, ny, nz, u0, v0), this.v(bx, by, bz, nx, ny, nz, u0 + l1, v0), this.v(cx, cy, cz, nx, ny, nz, u0 + pu, v0 + pv));
  }
  // Vertical wall from (x0,z0) to (x1,z1), left to right as seen from outside (normal = (-dz,0,dx)).
  wall(x0, z0, x1, z1, y0, y1, u0 = 0, v0 = y0) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    this.quad(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, u0, v0, u0 + L, v0 + (y1 - y0));
  }
  // Axis-aligned box. mask bits: 1 +Z, 2 -Z, 4 +X, 8 -X, 16 top, 32 bottom.
  box(x0, y0, z0, x1, y1, z1, mask = 31) {
    if (mask & 1) this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, x0, y0);
    if (mask & 2) this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, -x1, y0);
    if (mask & 4) this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, -z1, y0);
    if (mask & 8) this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, z0, y0);
    if (mask & 16) this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, x0, -z1);
    if (mask & 32) this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, z0);
  }
  // Box centred at (cx,cz) rotated by rot about Y.
  boxR(cx, cy, cz, sx, sy, sz, rot = 0, mask = 31) { this.push(cx, cy, cz, rot); this.box(-sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, mask); this.pop(); }
  // Vertical (optionally tapered) cylinder, smooth shaded. cap: 1 top, 2 bottom.
  cyl(cx, cz, y0, y1, r0, r1 = r0, seg = 8, cap = 1) {
    this._gv(seg * 2 + 2 + (cap ? seg * 2 + 2 : 0));
    const base = this.n, sl = (r0 - r1) / Math.max(1e-3, y1 - y0), nl = 1 / Math.hypot(1, sl);
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), u = i / seg * Math.PI * 2 * Math.max(r0, r1);
      this.v(cx + ca * r0, y0, cz + sa * r0, ca * nl, sl * nl, sa * nl, u, y0);
      this.v(cx + ca * r1, y1, cz + sa * r1, ca * nl, sl * nl, sa * nl, u, y1);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.tri(a, a + 1, a + 3); this.tri(a, a + 3, a + 2); }
    if (cap & 1 && r1 > 1e-3) { const c0 = this.v(cx, y1, cz, 0, 1, 0, 0, 0), b = this.n; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; this.v(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, Math.cos(a) * r1, Math.sin(a) * r1); } for (let i = 0; i < seg; i++) this.tri(c0, b + (i + 1) % seg, b + i); }
    if (cap & 2) { const c0 = this.v(cx, y0, cz, 0, -1, 0, 0, 0), b = this.n; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; this.v(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, Math.cos(a) * r0, Math.sin(a) * r0); } for (let i = 0; i < seg; i++) this.tri(c0, b + i, b + (i + 1) % seg); }
  }
  // Cylinder between two arbitrary points.
  tube(x0, y0, z0, x1, y1, z1, r0, r1 = r0, seg = 5) {
    let ax = x1 - x0, ay = y1 - y0, az = z1 - z0; const L = Math.hypot(ax, ay, az) || 1; ax /= L; ay /= L; az /= L;
    let ux = 0, uy = 1, uz = 0; if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; }
    let px = ay * uz - az * uy, py = az * ux - ax * uz, pz = ax * uy - ay * ux; const pm = Math.hypot(px, py, pz) || 1; px /= pm; py /= pm; pz /= pm;
    const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
    this._gv(seg * 2 + 2); const base = this.n;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), nx = px * ca + qx * sa, ny = py * ca + qy * sa, nz = pz * ca + qz * sa, u = i / seg * 6.28 * r0;
      this.v(x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, nx, ny, nz, u, 0);
      this.v(x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, nx, ny, nz, u, L);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.tri(a, a + 3, a + 1); this.tri(a, a + 2, a + 3); }
  }
  // Flat polygon (array of [x,z], any winding) at height y facing up; uv = local xz * uvs + offset, or world xz if wuv.
  poly(pts, y, wuv = false) {
    const n = pts.length; if (n < 3) return;
    this._gv(n); const base = this.n, c = this.c, s = this.s;
    for (let i = 0; i < n; i++) { const x = pts[i][0], z = pts[i][1]; if (wuv) this.v(x, y, z, 0, 1, 0, this.ox + x * c + z * s, this.oz - x * s + z * c); else this.v(x, y, z, 0, 1, 0, x, z); }
    const tr = earclip(pts), flip = polyArea(pts) > 0;   // positive xz shoelace area faces down, so flip it
    for (let i = 0; i < tr.length; i += 3) { if (flip) this.tri(base + tr[i], base + tr[i + 2], base + tr[i + 1]); else this.tri(base + tr[i], base + tr[i + 1], base + tr[i + 2]); }
  }
  // Up-facing quad from 4 [x,z] points given in either winding (ground strips).
  gquad(ax, az, bx, bz, cx, cz, dx, dz, y, u0, v0, u1, v1, u2, v2, u3, v3) {
    this._gv(4);
    const a = this.v(ax, y, az, 0, 1, 0, u0, v0), b = this.v(bx, y, bz, 0, 1, 0, u1, v1), c = this.v(cx, y, cz, 0, 1, 0, u2, v2), d = this.v(dx, y, dz, 0, 1, 0, u3, v3);
    const cr = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);   // winding in xz; up-facing needs (b-a)x(d-a) pointing +Y => negative in this convention
    if (cr < 0) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
  }
  geometry() {
    if (!this.ni) return null;
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(this.T.slice(0, n * 2), 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.C.slice(0, n * 4), 4, true));
    if (this.win) {
      const ib = new THREE.InterleavedBuffer(this.W.slice(0, n * 8), 8);
      g.setAttribute('aWinA', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aWinB', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    }
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.I.slice(0, this.ni) : new Uint16Array(this.I.subarray(0, this.ni)), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    this.P = this.N = this.T = this.C = this.W = this.I = null;
    return g;
  }
}

// Chunk grid: chunks.get(kind, x, z) returns the builder a feature centred at (x,z) should append to.
export class Chunks {
  constructor(size = CHUNK) { this.size = size; this.map = new Map(); }
  get(kind, x, z) {
    const k = kind + '|' + Math.floor(x / this.size) + '|' + Math.floor(z / this.size);
    let b = this.map.get(k); if (!b) { b = new MB(kind === 'facade' || kind === 'road'); b.kind = kind; this.map.set(k, b); }
    return b;
  }
  // -> [{ kind, geometry }]
  finish() { const out = []; for (const b of this.map.values()) { const g = b.geometry(); if (g) out.push({ kind: b.kind, geometry: g, tris: g.index.count / 3 }); } this.map.clear(); return out; }
}

// ---------------------------------------------------------------- 2D polygons ([x,z] pairs)

export function polyArea(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
export function polyCentroid(p) { let x = 0, z = 0, a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n], c = p[i][0] * q[1] - q[0] * p[i][1]; x += (p[i][0] + q[0]) * c; z += (p[i][1] + q[1]) * c; a += c; } return Math.abs(a) < 1e-6 ? [p[0][0], p[0][1]] : [x / (3 * a), z / (3 * a)]; }
export function pointInPoly(x, z, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; }
  return ins;
}
export function polyBounds(p) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } return { x0, x1, z0, z1 }; }
export function distToSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
export function distToPolyEdge(x, z, p) { let d = 1e9; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; d = Math.min(d, distToSeg(x, z, p[i][0], p[i][1], q[0], q[1])); } return d; }

// Ear clipping for simple polygons; returns index triples. Output winding follows the input.
export function earclip(p) {
  const n = p.length, out = []; if (n < 3) return out;
  const idx = []; for (let i = 0; i < n; i++) idx.push(i);
  const sign = polyArea(p) >= 0 ? 1 : -1;
  const cross = (a, b, c) => (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[c][0] - p[a][0]);
  let guard = n * n + 16;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      const cr = cross(a, b, c) * sign;
      if (cr < 1e-9) { if (cr > -1e-9) { idx.splice(i, 1); cut = true; break; } continue; }   // drop collinear points
      let ok = true;
      for (let j = 0; j < idx.length && ok; j++) {
        const q = idx[j]; if (q === a || q === b || q === c) continue;
        if (cross(a, b, q) * sign >= -1e-9 && cross(b, c, q) * sign >= -1e-9 && cross(c, a, q) * sign >= -1e-9) ok = false;
      }
      if (ok) { out.push(a, b, c); idx.splice(i, 1); cut = true; break; }
    }
    if (!cut) { const a = idx[0], b = idx[1], c = idx[2]; out.push(a, b, c); idx.splice(1, 1); }   // degenerate: force progress
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

// Sutherland-Hodgman clip of polygon p against the half-plane a*x + b*z <= c.
export function clipHalf(p, a, b, c) {
  const out = [], n = p.length;
  for (let i = 0; i < n; i++) {
    const P = p[i], Q = p[(i + 1) % n], dp = a * P[0] + b * P[1] - c, dq = a * Q[0] + b * Q[1] - c;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}

// Oriented rectangles { x, z, hw, hd, c, s } (c,s = cos/sin of heading; half-width along local X, half-depth along local Z).
export function obb(x, z, hw, hd, h) { return { x, z, hw, hd, h, c: Math.cos(h), s: Math.sin(h) }; }
export function obbCorners(o) {
  const ax = o.c * o.hw, az = -o.s * o.hw, bx = o.s * o.hd, bz = o.c * o.hd;
  return [[o.x - ax - bx, o.z - az - bz], [o.x + ax - bx, o.z + az - bz], [o.x + ax + bx, o.z + az + bz], [o.x - ax + bx, o.z - az + bz]];
}
export function obbOverlap(a, b, pad = 0) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]];
  for (let i = 0; i < 4; i++) {
    const ux = axes[i][0], uz = axes[i][1];
    const ra = a.hw * Math.abs(a.c * ux - a.s * uz) + a.hd * Math.abs(a.s * ux + a.c * uz);
    const rb = b.hw * Math.abs(b.c * ux - b.s * uz) + b.hd * Math.abs(b.s * ux + b.c * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb + pad) return false;
  }
  return true;
}
export function obbInPoly(o, p) { for (const c of obbCorners(o)) if (!pointInPoly(c[0], c[1], p)) return false; return true; }

// ---------------------------------------------------------------- surface raster

export const SURF = { off: 0, grass: 1, road: 2, sidewalk: 3, lot: 4, water: 5, building: 6 };
export const SURF_NAME = ['off', 'grass', 'road', 'sidewalk', 'lot', 'water', 'building'];

export class SurfGrid {
  constructor(minX, minZ, maxX, maxZ, res = 0.5) {
    this.minX = minX; this.minZ = minZ; this.res = res; this.inv = 1 / res;
    this.w = Math.ceil((maxX - minX) / res); this.h = Math.ceil((maxZ - minZ) / res);
    this.d = new Uint8Array(this.w * this.h);
  }
  at(x, z) { const i = Math.floor((x - this.minX) * this.inv), j = Math.floor((z - this.minZ) * this.inv); return i < 0 || j < 0 || i >= this.w || j >= this.h ? 0 : this.d[j * this.w + i]; }
  // Scanline fill; `only` (optional) restricts the write to cells currently holding that value.
  fill(p, val, only = -1) {
    const n = p.length, inv = this.inv, w = this.w, d = this.d; let z0 = 1e9, z1 = -1e9;
    for (const q of p) { if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
    const j0 = Math.max(0, Math.floor((z0 - this.minZ) * inv)), j1 = Math.min(this.h - 1, Math.ceil((z1 - this.minZ) * inv));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.minZ + (j + 0.5) * this.res; xs.length = 0;
      for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        let i0 = Math.max(0, Math.round((xs[k] - this.minX) * inv)), i1 = Math.min(w, Math.round((xs[k + 1] - this.minX) * inv));
        if (only < 0) d.fill(val, j * w + i0, j * w + i1); else for (let i = j * w + i0, e = j * w + i1; i < e; i++) if (d[i] === only) d[i] = val;
      }
    }
  }
  fillObb(o, val) { this.fill(obbCorners(o), val); }
}

// ---------------------------------------------------------------- colliders

export class Colliders {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); this.all = []; this.stamp = 0; }
  add(x, z, hw, hd, rot, h, kind, soft = false) {
    const o = { x, z, hw, hd, rot, h, kind, soft, _r: Math.hypot(hw, hd), _s: 0 };
    this.all.push(o);
    const c = this.cell, i0 = Math.floor((x - o._r) / c), i1 = Math.floor((x + o._r) / c), j0 = Math.floor((z - o._r) / c), j1 = Math.floor((z + o._r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = i * 4096 + j; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(o); }
    return o;
  }
  // Drop every obstacle for which test(o) is true and rebuild the hash; returns how many went.
  prune(test) { const keep = this.all.filter(o => !test(o)), n = this.all.length - keep.length; this.map.clear(); this.all = []; for (const o of keep) this.add(o.x, o.z, o.hw, o.hd, o.rot, o.h, o.kind, o.soft); return n; }
  query(x, z, r, out = []) {
    out.length = 0; const c = this.cell, st = ++this.stamp;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this.map.get(i * 4096 + j); if (!a) continue;
      for (let k = 0; k < a.length; k++) { const o = a[k]; if (o._s === st) continue; o._s = st; const dx = o.x - x, dz = o.z - z, rr = r + o._r; if (dx * dx + dz * dz <= rr * rr) out.push(o); }
    }
    return out;
  }
}

// 1D occupancy along a kerb line, so lamps, trees, hydrants, driveways and bus stops do not land on each other.
export class Strip {
  constructor() { this.iv = []; }
  free(s, half) { for (const v of this.iv) if (Math.abs(v[0] - s) < v[1] + half) return false; return true; }
  take(s, half) { if (!this.free(s, half)) return false; this.iv.push([s, half]); return true; }
  force(s, half) { this.iv.push([s, half]); }
}
