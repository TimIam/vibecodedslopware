// Every vehicle in the game, built procedurally (no model files).
//
// Layout of this file:
//   1. Geometry kit: `Builder` accumulates triangles per material; `grid` turns any lattice of 3D points into a
//      smooth-shaded surface (creases wherever two lattice lines coincide), with per-cell materials, window holes,
//      an inner shell and jambs; `loft` feeds it cross-sections made of control points with corner radii;
//      `sweep`/`tube`/`lathe`/`rbox` are built on the same thing.
//   2. Materials: one vertex-attributed "surf" material (colour, roughness, metalness and a lamp channel per vertex,
//      so chrome, rubber, plastic and every lamp of a vehicle are ONE draw call), clear-coated paint with a livery
//      atlas, glass, and a batched additive glow for lamps.
//   3. Wheels, 4. the ambulance (exterior, cab, lights), 5. traffic cars, 6. motorcycle, stretcher, patient
//      compartment, 7. devDemo (?v=amb | cab via __dev.cam | interior | stretcher | lineup | <car type>&lod=0..2,
//      plus &doors=1, &dirt=0..1, &em=0).
//
// Frame for every vehicle: origin on the ground under the middle of the wheelbase, +Z forward, +Y up, +X = the
// vehicle's LEFT. Tuning: ambulance dimensions in `AMB`, flash patterns in `EMERGENCY`, car shapes in `CAR_SPECS`,
// colours in `CAR_COLORS`.

import * as THREE from 'three';
import { U, patchWet, glowTexture } from './gfx.js';
import { makeRng, clamp, lerp, smooth, makeCanvas, canvasTex, TAU, fbm2 } from './util.js';

// ---------------------------------------------------------------------------------------------- small maths

const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const g3 = v => [v, v, v];
const rad = d => d * Math.PI / 180;

// Monotone cubic through [x, y] keys (no overshoot): the body lines of every vehicle are made of these.
function curve(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]), d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1e-9));
  if (n > 1) { m[0] = d[0]; m[n - 1] = d[n - 2]; }
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// Sorted, de-duplicated station list.
function stations(...lists) {
  const a = [].concat(...lists).sort((p, q) => p - q), out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
}
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
// Height of a wheel-arch cut at z (0 outside it).
const archY = (z, cz, cy, R) => { const d = z - cz; return Math.abs(d) < R ? cy + Math.sqrt(R * R - d * d) : 0; };
const archStations = (cz, R, n) => range(0, Math.PI, n).map(a => cz - R * Math.cos(a));

// ---------------------------------------------------------------------------------------------- skins

// A skin says which material a piece of geometry is drawn with and its per-vertex constants
// (linear colour, roughness, metalness, paint mask, lamp channel). `grid` [nx, ny] turns the UVs into an LED lattice.
let _skinId = 0;
function skin(mat, col = [1, 1, 1], rough = 0.5, metal = 0, paint = 0, lamp = 0, grid = null) {
  return { id: ++_skinId, mat, col, s: [rough, metal, paint, lamp], grid };
}
const SK = {
  paint: skin('paint', [1, 1, 1], 0.4, 0, 1),
  black: skin('surf', g3(0.02), 0.5),            // moulded plastic
  gloss: skin('surf', g3(0.012), 0.12),          // piano black
  rubber: skin('surf', g3(0.016), 0.86),
  tyre: skin('surf', g3(0.02), 0.8),
  under: skin('surf', g3(0.012), 0.9),
  chrome: skin('surf', g3(0.92), 0.05, 1),
  steel: skin('surf', g3(0.62), 0.22, 1),        // polished stainless
  alu: skin('surf', g3(0.72), 0.34, 1),          // brushed aluminium extrusion
  iron: skin('surf', g3(0.16), 0.5, 0.85),       // brake discs, chassis iron
  mirror: skin('surf', g3(0.97), 0.0, 1),
  trim: skin('dry', [0.105, 0.11, 0.118], 0.72),    // cab plastics ('dry' = interior material that rain never wets)
  trimDark: skin('dry', [0.032, 0.034, 0.037], 0.62),
  cloth: skin('dry', [0.07, 0.075, 0.085], 0.95),
  vinyl: skin('dry', [0.05, 0.055, 0.065], 0.5),
  headliner: skin('dry', [0.36, 0.36, 0.345], 0.95),
  white: skin('surf', g3(0.8), 0.35),
  whiteGloss: skin('surf', g3(0.85), 0.12),
  glass: skin('glass'),
  red: skin('surf', lin(0x9c1414), 0.4),
  yellow: skin('surf', lin(0xe2b100), 0.45),
  orange: skin('surf', lin(0xd8560a), 0.45),
};
const surf = (col, rough = 0.5, metal = 0) => skin('surf', Array.isArray(col) ? col : lin(col), rough, metal);
// Lamp lens: coloured plastic that glows with lamp channel `ch`; grid = LED lattice across the face.
const lens = (ch, col, grid = null, rough = 0.14) => skin('surf', Array.isArray(col) ? col : lin(col), rough, 0, 0, ch, grid);
const LENS = { red: lin(0x7a0a0a), amber: lin(0xb86a08), clear: g3(0.6), smoke: g3(0.12), blue: lin(0x0a1e7a) };

// ---------------------------------------------------------------------------------------------- builder

// Corner-rounded section: control points {x,y,z,r,flat,k,sub}. r > 0 fillets the corner with k segments, r = 0 leaves a
// hard crease (the point is doubled so the two sides do not share a normal), flat = a plain point on a smooth run,
// sub = split the span after this point into that many cells. Returns the points and, for every cell between
// neighbouring points, a tag: c for cells inside corner c, c + 0.5 for the span from corner c to c + 1.
function expandSection(cp, closed, seg) {
  const n = cp.length, corners = [];
  for (let c = 0; c < n; c++) {
    const P = cp[c], end = !closed && (c === 0 || c === n - 1);
    if (end || P.flat) corners.push([[P.x, P.y, P.z]]);
    else if (!(P.r > 0)) corners.push([[P.x, P.y, P.z], [P.x, P.y, P.z]]);
    else {
      const A = cp[(c - 1 + n) % n], Bn = cp[(c + 1) % n], k = P.k || seg, out = [];
      const ax = A.x - P.x, ay = A.y - P.y, az = A.z - P.z, bx = Bn.x - P.x, by = Bn.y - P.y, bz = Bn.z - P.z;
      const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
      const da = la > 1e-9 ? Math.min(P.r, la * 0.5) / la : 0, db = lb > 1e-9 ? Math.min(P.r, lb * 0.5) / lb : 0;
      const p0 = [P.x + ax * da, P.y + ay * da, P.z + az * da], p2 = [P.x + bx * db, P.y + by * db, P.z + bz * db];
      for (let t = 0; t <= k; t++) {
        const s = t / k, w0 = (1 - s) * (1 - s), w1 = 2 * s * (1 - s), w2 = s * s;
        out.push([w0 * p0[0] + w1 * P.x + w2 * p2[0], w0 * p0[1] + w1 * P.y + w2 * p2[1], w0 * p0[2] + w1 * P.z + w2 * p2[2]]);
      }
      corners.push(out);
    }
  }
  const pts = [], tags = [];
  for (let c = 0; c < n; c++) {
    const pc = corners[c];
    for (let q = 0; q < pc.length; q++) { pts.push(pc[q]); if (q) tags.push(c); }
    if (!closed && c === n - 1) break;
    const sub = cp[c].sub || 1, a = pc[pc.length - 1], b = corners[(c + 1) % n][0];
    for (let q = 1; q < sub; q++) { const t = q / sub; pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]); tags.push(c + 0.5); }
    tags.push(c + 0.5);
  }
  return { pts, tags };
}
// Mirror a half section (first and last control point on the centre line x = 0) into a full ring.
function mirrorRing(half, closed = true) {
  const out = half.slice();
  for (let i = half.length - 2; i >= (closed ? 1 : 0); i--) out.push({ ...half[i], x: -half[i].x, sub: i > 0 ? half[i - 1].sub : undefined });
  out[half.length - 1] = { ...half[half.length - 1], sub: half[half.length - 2].sub };
  return out;
}

class Builder {
  constructor(o = {}) {
    this.accs = new Map(); this.M = new THREE.Matrix4(); this.neg = false; this.stack = [];
    this.seg = o.seg ?? 4;           // default fillet subdivisions
    this.chart = o.chart || null;    // (ch, x, y, z) -> [u, v] for paint; ch 0 left 1 right 2 front 3 rear 4 top
    this.single = o.single || null;  // sk -> material key override (traffic LODs put everything in one mesh)
    this.grp = '';
  }
  acc(sk, grp) {
    const mat = this.single ? this.single(sk) : sk.mat, k = grp + '|' + mat;
    let a = this.accs.get(k);
    if (!a) { a = { grp, mat, p: [], n: [], uv: [], c: [], s: [], i: [], nv: 0 }; this.accs.set(k, a); }
    return a;
  }
  // run fn in a child frame (translate, then rotate XYZ order)
  at(x, y, z, rx, ry, rz, fn) {
    if (typeof rx === 'function') { fn = rx; rx = ry = rz = 0; }
    this.stack.push(this.M.clone()); const neg = this.neg;
    _m.makeRotationFromEuler(_e.set(rx || 0, ry || 0, rz || 0, 'YXZ')).setPosition(x, y, z); this.M.multiply(_m);
    fn(); this.M.copy(this.stack.pop()); this.neg = neg;
  }
  // run fn(side) twice: as is (side = 1) and mirrored across the local x = 0 plane (side = -1)
  mirror(fn) {
    fn(1);
    this.stack.push(this.M.clone()); this.M.multiply(_m.makeScale(-1, 1, 1)); this.neg = !this.neg;
    fn(-1); this.M.copy(this.stack.pop()); this.neg = !this.neg;
  }
  // Lowest level: indexed triangles in local space.
  emit(sk, P, N, UV, I, grp = this.grp) {
    const a = this.acc(sk, grp), e = this.M.elements, neg = this.neg, nv = P.length / 3, isSurf = a.mat !== 'paint' && a.mat !== 'glass' && !a.mat.startsWith('tex');
    const X = new Float32Array(P.length), Q = new Float32Array(P.length);
    for (let k = 0; k < P.length; k += 3) {
      const x = P[k], y = P[k + 1], z = P[k + 2], nx = N[k], ny = N[k + 1], nz = N[k + 2];
      X[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; X[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; X[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      Q[k] = e[0] * nx + e[4] * ny + e[8] * nz; Q[k + 1] = e[1] * nx + e[5] * ny + e[9] * nz; Q[k + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
    }
    const charted = sk.mat === 'paint' && this.chart, map = charted ? new Map() : new Int32Array(nv).fill(-1);
    const gx = sk.grid ? sk.grid[0] : 0, gy = sk.grid ? sk.grid[1] : 0, col = sk.col, s = sk.s;
    const vert = (v, ch) => {
      const k = v * 3; a.p.push(X[k], X[k + 1], X[k + 2]); a.n.push(Q[k], Q[k + 1], Q[k + 2]);
      if (charted) { const uv = this.chart(ch, X[k], X[k + 1], X[k + 2]); a.uv.push(uv[0], uv[1]); }
      else if (isSurf && sk.mat !== 'tex') { if (sk.grid && UV) a.uv.push(UV[v * 2] * gx, UV[v * 2 + 1] * gy); else a.uv.push(-1, -1); }
      else if (UV) a.uv.push(UV[v * 2], UV[v * 2 + 1]); else a.uv.push(0, 0);
      if (isSurf) { a.c.push(col[0], col[1], col[2]); a.s.push(s[0], s[1], s[2], s[3]); }
      return a.nv++;
    };
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = neg ? I[t + 2] : I[t + 1], i2 = neg ? I[t + 1] : I[t + 2], k0 = i0 * 3, k1 = i1 * 3, k2 = i2 * 3;
      const ux = X[k1] - X[k0], uy = X[k1 + 1] - X[k0 + 1], uz = X[k1 + 2] - X[k0 + 2], vx = X[k2] - X[k0], vy = X[k2 + 1] - X[k0 + 1], vz = X[k2 + 2] - X[k0 + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * fx + fy * fy + fz * fz < 1e-18) continue;
      if (charted) {
        const ax = Math.abs(fx), ay = Math.abs(fy), az = Math.abs(fz);
        const ch = ay >= ax && ay >= az ? (fy > 0 ? 4 : X[k0] > 0 ? 0 : 1) : ax >= az ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
        for (const v of [i0, i1, i2]) { const key = v * 8 + ch; let w = map.get(key); if (w === undefined) map.set(key, w = vert(v, ch)); a.i.push(w); }
      } else for (const v of [i0, i1, i2]) { let w = map[v]; if (w < 0) w = map[v] = vert(v, 0); a.i.push(w); }
    }
  }

  // Lattice of ni x nj points -> surface. o: sk | cell(i, j) -> {sk, grp, glass, inner, jamb} | null, wrap (close j),
  // flip (explicit winding; default: face away from the row centroids), inset (shell thickness), grp.
  grid(P, ni, nj, o = {}) {
    const wrap = !!o.wrap, cj = wrap ? nj : nj - 1, N = new Float32Array(ni * nj * 3), vid = (i, j) => i * nj + (j % nj);
    let sgn = o.flip === undefined ? 0 : o.flip ? -1 : 1, vote = 0, cen = null;
    const facing = !sgn && o.facing;   // near-flat patches: say which way they should face instead of using centroids
    if (!sgn && !facing) {
      cen = new Float64Array(ni * 3);
      for (let i = 0; i < ni; i++) { let x = 0, y = 0, z = 0; for (let j = 0; j < nj; j++) { const k = (i * nj + j) * 3; x += P[k]; y += P[k + 1]; z += P[k + 2]; } cen[i * 3] = x / nj; cen[i * 3 + 1] = y / nj; cen[i * 3 + 2] = z / nj; }
    }
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < cj; j++) {
      const a = vid(i, j) * 3, b = vid(i, j + 1) * 3, c = vid(i + 1, j + 1) * 3, d = vid(i + 1, j) * 3;
      const ex = P[c] - P[a], ey = P[c + 1] - P[a + 1], ez = P[c + 2] - P[a + 2], fx = P[d] - P[b], fy = P[d + 1] - P[b + 1], fz = P[d + 2] - P[b + 2];
      const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      for (const k of [a, b, c, d]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
      if (facing) vote += nx * facing[0] + ny * facing[1] + nz * facing[2];
      else if (cen) vote += nx * ((P[a] + P[b] + P[c] + P[d]) / 4 - (cen[i * 3] + cen[i * 3 + 3]) / 2) + ny * ((P[a + 1] + P[b + 1] + P[c + 1] + P[d + 1]) / 4 - (cen[i * 3 + 1] + cen[i * 3 + 4]) / 2) + nz * ((P[a + 2] + P[b + 2] + P[c + 2] + P[d + 2]) / 4 - (cen[i * 3 + 2] + cen[i * 3 + 5]) / 2);
    }
    if (!sgn) sgn = vote >= 0 ? 1 : -1;
    for (let k = 0; k < N.length; k += 3) { const l = Math.hypot(N[k], N[k + 1], N[k + 2]); if (l > 1e-12) { N[k] *= sgn / l; N[k + 1] *= sgn / l; N[k + 2] *= sgn / l; } else N[k + 1] = 1; }
    const UV = new Float32Array(ni * nj * 2);
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) { UV[(i * nj + j) * 2] = j / Math.max(1, nj - 1); UV[(i * nj + j) * 2 + 1] = i / Math.max(1, ni - 1); }
    const lists = new Map(), list = (which, sk, grp) => { const k = which + sk.id + '|' + grp; let l = lists.get(k); if (!l) lists.set(k, l = { which, sk, grp, I: [] }); return l.I; };
    const def = o.cell ? null : { sk: o.sk, grp: o.grp ?? this.grp }, cells = o.cell ? new Array((ni - 1) * cj) : null;
    let anyInner = false;
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < cj; j++) {
      const d = cells ? (cells[i * cj + j] = o.cell(i, j) || null) : def; if (!d) continue;
      const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j + 1), e = vid(i + 1, j), grp = d.grp ?? this.grp;
      for (const sk of [d.sk, d.glass]) if (sk) { const I = list('o', sk, grp); if (sgn > 0) I.push(a, b, c, a, c, e); else I.push(a, c, b, a, e, c); }
      if (d.inner) { anyInner = true; const I = list('i', d.inner, grp); if (sgn > 0) I.push(a, c, b, a, e, c); else I.push(a, b, c, a, c, e); }
    }
    let P2 = null, N2 = null; const JP = [], JN = [];
    if (anyInner) {
      const t = o.inset ?? 0.04; P2 = new Float32Array(P.length); N2 = new Float32Array(P.length);
      for (let k = 0; k < P.length; k++) { P2[k] = P[k] - N[k] * t; N2[k] = -N[k]; }
      // jambs: close the gap between outer skin and inner shell wherever a shelled cell meets a hole, glass or another group
      const cellAt = (i, j) => { if (i < 0 || i >= ni - 1) return undefined; if (wrap) j = (j + cj) % cj; else if (j < 0 || j >= cj) return undefined; return cells[i * cj + j]; };
      for (let i = 0; i < ni - 1; i++) for (let j = 0; j < cj; j++) {
        const d = cells[i * cj + j]; if (!d || !d.inner) continue;
        const grp = d.grp ?? this.grp, q = [vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)];
        const cx = (P[q[0] * 3] + P[q[1] * 3] + P[q[2] * 3] + P[q[3] * 3]) / 4, cy = (P[q[0] * 3 + 1] + P[q[1] * 3 + 1] + P[q[2] * 3 + 1] + P[q[3] * 3 + 1]) / 4, cz = (P[q[0] * 3 + 2] + P[q[1] * 3 + 2] + P[q[2] * 3 + 2] + P[q[3] * 3 + 2]) / 4;
        const nb = [cellAt(i - 1, j), cellAt(i, j + 1), cellAt(i + 1, j), cellAt(i, j - 1)];
        for (let s = 0; s < 4; s++) {
          // edgeJamb: true closes every lattice border, or a string picks them: a = first row, b = last row, l/r = first/last column
          const n = nb[s]; if (n === undefined && !(o.edgeJamb === true || (o.edgeJamb && o.edgeJamb.includes('arbl'[s])))) continue;
          if (n && n.sk && (n.grp ?? this.grp) === grp) continue;
          const v1 = q[s] * 3, v2 = q[(s + 1) % 4] * 3;
          const ux = P[v2] - P[v1], uy = P[v2 + 1] - P[v1 + 1], uz = P[v2 + 2] - P[v1 + 2], wx = P2[v1] - P[v1], wy = P2[v1 + 1] - P[v1 + 1], wz = P2[v1 + 2] - P[v1 + 2];
          let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz); if (l < 1e-10) continue;
          const out = nx * ((P[v1] + P[v2]) / 2 - cx) + ny * ((P[v1 + 1] + P[v2 + 1]) / 2 - cy) + nz * ((P[v1 + 2] + P[v2 + 2]) / 2 - cz) >= 0, f = (out ? 1 : -1) / l;
          nx *= f; ny *= f; nz *= f;
          const base = JP.length / 3;
          JP.push(P[v1], P[v1 + 1], P[v1 + 2], P[v2], P[v2 + 1], P[v2 + 2], P2[v2], P2[v2 + 1], P2[v2 + 2], P2[v1], P2[v1 + 1], P2[v1 + 2]);
          for (let r = 0; r < 4; r++) JN.push(nx, ny, nz);
          const I = list('j', d.jamb || d.inner, grp);
          if (out) I.push(base, base + 1, base + 2, base, base + 2, base + 3); else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }
    for (const l of lists.values()) {
      if (l.which === 'o') this.emit(l.sk, P, N, UV, l.I, l.grp);
      else if (l.which === 'i') this.emit(l.sk, P2, N2, UV, l.I, l.grp);
      else this.emit(l.sk, JP, JN, null, l.I, l.grp);
    }
    return { P, N, ni, nj, sgn };
  }

  // Loft: one corner-rounded section per station. secFn(u, i) -> control points.
  loft(us, secFn, o = {}) {
    const closed = !!o.closed, seg = o.seg ?? this.seg, rows = us.map((u, i) => expandSection(secFn(u, i), closed, seg));
    const ni = rows.length, nj = rows[0].pts.length, P = new Float64Array(ni * nj * 3), tags = rows[0].tags;
    for (let i = 0; i < ni; i++) {
      if (rows[i].pts.length !== nj) throw new Error(`loft: station ${i} has ${rows[i].pts.length} points, expected ${nj}`);
      for (let j = 0; j < nj; j++) { const p = rows[i].pts[j], k = (i * nj + j) * 3; P[k] = p[0]; P[k + 1] = p[1]; P[k + 2] = p[2]; }
    }
    this.grid(P, ni, nj, { ...o, wrap: closed, cell: o.cell ? (i, j) => o.cell(i, tags[j], j) : null });
    const res = { rows: rows.map(r => r.pts), tags, ni, nj };
    if (o.capA) this.cap(o.capA, res.rows[0], res.rows[1]);
    if (o.capB) this.cap(o.capB, res.rows[ni - 1], res.rows[ni - 2]);
    return res;
  }
  // Flat fan closing a ring, facing away from `from` (a neighbouring ring or a point).
  cap(sk, ring, from, grp = this.grp) {
    const n = ring.length, c = [0, 0, 0]; for (const p of ring) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    let f = from; if (Array.isArray(from[0])) { f = [0, 0, 0]; for (const p of from) { f[0] += p[0] / from.length; f[1] += p[1] / from.length; f[2] += p[2] / from.length; } }
    let nx = 0, ny = 0, nz = 0;
    for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const l = Math.hypot(nx, ny, nz) || 1, out = nx * (c[0] - f[0]) + ny * (c[1] - f[1]) + nz * (c[2] - f[2]) >= 0, s = (out ? 1 : -1) / l;
    const P = [c[0], c[1], c[2]], N = [nx * s, ny * s, nz * s], I = [];
    for (let j = 0; j < n; j++) { P.push(ring[j][0], ring[j][1], ring[j][2]); N.push(nx * s, ny * s, nz * s); }
    // Newell normal is for the ring's own winding; flip triangle order when the outward side is the other one
    for (let j = 0; j < n; j++) { const a = 1 + j, b = 1 + (j + 1) % n; if (out) I.push(0, a, b); else I.push(0, b, a); }
    this.emit(sk, P, N, null, I, grp);
  }
  // Coons patch between four boundary polylines (bottom/top share a count, left/right share a count).
  coons(bottom, top, left, right, o = {}) {
    const nj = bottom.length, ni = left.length, P = new Float64Array(ni * nj * 3);
    const param = (a, b) => { const n = a.length, t = [0]; for (let i = 1; i < n; i++) t.push(t[i - 1] + Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1], a[i][2] - a[i - 1][2]) + Math.hypot(b[i][0] - b[i - 1][0], b[i][1] - b[i - 1][1], b[i][2] - b[i - 1][2])); const L = t[n - 1] || 1; return t.map(v => v / L); };
    const S = param(bottom, top), T = param(left, right), b0 = bottom[0], b1 = bottom[nj - 1], t0 = top[0], t1 = top[nj - 1];
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const s = S[j], t = T[i], k = (i * nj + j) * 3;
      for (let a = 0; a < 3; a++) P[k + a] = (1 - t) * bottom[j][a] + t * top[j][a] + (1 - s) * left[i][a] + s * right[i][a] - ((1 - s) * (1 - t) * b0[a] + s * (1 - t) * b1[a] + (1 - s) * t * t0[a] + s * t * t1[a]);
    }
    return this.grid(P, ni, nj, o);
  }
  // Sweep a section {a, b, r...} along a path; a runs along cross(tangent, up), b along up. o: up, open, loop, scale(i)
  sweep(sk, path, sec, o = {}) {
    const n = path.length, up = o.up || [0, 1, 0], loop = !!o.loop, rows = [], idx = loop ? [...Array(n).keys(), 0] : [...Array(n).keys()];
    for (const i of idx) {
      const p = path[i], a = path[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[loop ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const upv = typeof up === 'function' ? up(i) : up, d = upv[0] * tx + upv[1] * ty + upv[2] * tz;
      let ux = upv[0] - d * tx, uy = upv[1] - d * ty, uz = upv[2] - d * tz; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const sx = ty * uz - tz * uy, sy = tz * ux - tx * uz, sz = tx * uy - ty * ux, sc = o.scale ? o.scale(i) : 1, sa = Array.isArray(sc) ? sc[0] : sc, sb = Array.isArray(sc) ? sc[1] : sc;
      rows.push(expandSection(sec.map(q => ({ ...q, x: p[0] + sx * q.a * sa + ux * q.b * sb, y: p[1] + sy * q.a * sa + uy * q.b * sb, z: p[2] + sz * q.a * sa + uz * q.b * sb, r: (q.r || 0) * Math.min(sa, sb) })), !o.open, o.seg ?? 2));
    }
    const ni = rows.length, nj = rows[0].pts.length, P = new Float64Array(ni * nj * 3);
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) { const q = rows[i].pts[j], k = (i * nj + j) * 3; P[k] = q[0]; P[k + 1] = q[1]; P[k + 2] = q[2]; }
    this.grid(P, ni, nj, { sk, wrap: !o.open, grp: o.grp, flip: o.flip });
    if (o.caps !== false && !loop && !o.open) { this.cap(o.capSk || sk, rows[0].pts, rows[1].pts, o.grp); this.cap(o.capSk || sk, rows[ni - 1].pts, rows[ni - 2].pts, o.grp); }
  }
  tube(sk, path, r, seg = 8, o = {}) {
    const sec = []; for (let j = 0; j < seg; j++) { const a = j / seg * TAU; sec.push({ a: Math.cos(a) * r, b: Math.sin(a) * r, flat: true }); }
    this.sweep(sk, path, sec, o);
  }
  // Solid of revolution. prof = [[axial, radius]...] listed counter-clockwise around the solid (up the outside, in over the top).
  lathe(sk, prof, o = {}) {
    const seg = o.seg || 16, axis = o.axis || 'y', arc = o.arc || [0, TAU], full = Math.abs(arc[1] - arc[0] - TAU) < 1e-6, nj = full ? seg : seg + 1, ni = prof.length, P = new Float64Array(ni * nj * 3);
    for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
      const th = arc[0] + (arc[1] - arc[0]) * j / seg, c = Math.cos(th) * prof[i][1], s = Math.sin(th) * prof[i][1], t = prof[i][0], k = (i * nj + j) * 3;
      if (axis === 'y') { P[k] = s; P[k + 1] = t; P[k + 2] = c; } else if (axis === 'x') { P[k] = t; P[k + 1] = c; P[k + 2] = s; } else { P[k] = c; P[k + 1] = s; P[k + 2] = t; }
    }
    return this.grid(P, ni, nj, { sk, grp: o.grp, wrap: full, flip: !!o.flip, cell: o.cell });
  }
  // Cylinder/cone along an axis, centred at (x, y, z). caps: 1 start, 2 end, 3 both.
  cyl(sk, r0, r1, h, x = 0, y = 0, z = 0, axis = 'y', seg = 12, caps = 3, grp = this.grp) {
    const prof = []; if (caps & 1) prof.push([-h / 2, 0], [-h / 2, r0]); prof.push([-h / 2, r0], [h / 2, r1]); if (caps & 2) prof.push([h / 2, r1], [h / 2, 0]);
    this.at(x, y, z, () => this.lathe(sk, prof, { seg, axis, grp }));
  }
  // Box with optional rounded edges (r > 0: every edge becomes a two-facet smooth bevel). Centred at (x, y, z).
  rbox(sk, w, h, d, r = 0, x = 0, y = 0, z = 0, grp = this.grp) {
    const hs = [w / 2, h / 2, d / 2]; r = Math.min(r, hs[0] * 0.98, hs[1] * 0.98, hs[2] * 0.98);
    const P = [], N = [], UV = [], I = [], faces = [[0, 1, 2, 1], [0, 2, 1, -1], [1, 2, 0, 1], [1, 0, 2, -1], [2, 0, 1, 1], [2, 1, 0, -1]];
    for (const [w_, u_, v_, sg] of faces) {
      const cu = r > 0 ? [-hs[u_], -hs[u_] + r, hs[u_] - r, hs[u_]] : [-hs[u_], hs[u_]], cv = r > 0 ? [-hs[v_], -hs[v_] + r, hs[v_] - r, hs[v_]] : [-hs[v_], hs[v_]];
      const base = P.length / 3, nu = cu.length, nv = cv.length;
      for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
        const q = [0, 0, 0]; q[u_] = cu[a]; q[v_] = cv[b]; q[w_] = sg * hs[w_];
        const p = [x, y, z], n = [0, 0, 0];
        if (r > 0) {
          const inn = [clamp(q[0], -hs[0] + r, hs[0] - r), clamp(q[1], -hs[1] + r, hs[1] - r), clamp(q[2], -hs[2] + r, hs[2] - r)];
          const dx = q[0] - inn[0], dy = q[1] - inn[1], dz = q[2] - inn[2], l = Math.hypot(dx, dy, dz) || 1;
          n[0] = dx / l; n[1] = dy / l; n[2] = dz / l; p[0] += inn[0] + n[0] * r; p[1] += inn[1] + n[1] * r; p[2] += inn[2] + n[2] * r;
        } else { n[w_] = sg; p[0] += q[0]; p[1] += q[1]; p[2] += q[2]; }
        P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); UV.push((cu[a] + hs[u_]) / (2 * hs[u_]), (cv[b] + hs[v_]) / (2 * hs[v_]));
      }
      // u x v = +w for sg = 1 with the axis orders chosen above, so (a, a+1, ...) winds outward
      const fl = (((w_ + 1) % 3 === u_) ? 1 : -1) * sg;
      for (let b = 0; b < nv - 1; b++) for (let a = 0; a < nu - 1; a++) {
        const i0 = base + b * nu + a, i1 = i0 + 1, i2 = i0 + nu + 1, i3 = i0 + nu;
        if (fl > 0) I.push(i0, i1, i2, i0, i2, i3); else I.push(i0, i2, i1, i0, i3, i2);
      }
    }
    this.emit(sk, P, N, UV, I, grp);
  }
  box(sk, w, h, d, x = 0, y = 0, z = 0, grp = this.grp) { this.rbox(sk, w, h, d, 0, x, y, z, grp); }
  // Quad in the local XY plane facing +Z, centred; uv = [u0, v0, u1, v1].
  plane(sk, w, h, x = 0, y = 0, z = 0, uv = [0, 0, 1, 1], grp = this.grp) {
    const a = w / 2, b = h / 2;
    this.emit(sk, [x - a, y - b, z, x + a, y - b, z, x + a, y + b, z, x - a, y + b, z], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], [0, 1, 2, 0, 2, 3], grp);
  }
  // child frame at (x, y, z) whose +Z looks at the target (+X is then the right-hand side for someone reading it)
  face(x, y, z, tx, ty, tz, fn) { this.stack.push(this.M.clone()); this.M.multiply(faceMatrix(x, y, z, tx, ty, tz)); fn(); this.M.copy(this.stack.pop()); }
  pt(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.M).toArray(); }
  dir(x, y, z) { return _v.set(x, y, z).transformDirection(this.M).toArray(); }
  // Sphere / ellipsoid.
  ball(sk, rx, ry, rz, x = 0, y = 0, z = 0, seg = 12, grp = this.grp) {
    const rows = Math.max(4, seg >> 1), P = new Float64Array((rows + 1) * seg * 3);
    for (let i = 0; i <= rows; i++) for (let j = 0; j < seg; j++) { const ph = -Math.PI / 2 + Math.PI * i / rows, th = j / seg * TAU, k = (i * seg + j) * 3; P[k] = x + Math.sin(th) * Math.cos(ph) * rx; P[k + 1] = y + Math.sin(ph) * ry; P[k + 2] = z + Math.cos(th) * Math.cos(ph) * rz; }
    const g = this.grid(P, rows + 1, seg, { sk, grp, wrap: true, flip: false });
    return g;
  }

  // Turn the accumulated triangles into meshes. mats[key] -> material. Returns { grp: [Mesh...] }; geometry of group
  // `g` is re-centred on pivots[g] so the group can hinge there.
  build(mats, pivots = {}, o = {}) {
    const out = {};
    for (const a of this.accs.values()) {
      if (!a.i.length) continue;
      const g = new THREE.BufferGeometry(), pv = pivots[a.grp], p = new Float32Array(a.p);
      if (pv) for (let k = 0; k < p.length; k += 3) { p[k] -= pv[0]; p[k + 1] -= pv[1]; p[k + 2] -= pv[2]; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a.n), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
      if (a.c.length) { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(a.c), 3)); g.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(a.s), 4)); }
      g.setIndex(new THREE.BufferAttribute(a.nv > 65535 ? new Uint32Array(a.i) : new Uint16Array(a.i), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mat = mats[a.mat]; if (!mat) throw new Error('vehicles: no material for ' + a.mat);
      const mesh = new THREE.Mesh(g, mat); mesh.name = (a.grp || 'body') + ':' + a.mat;
      const glass = a.mat === 'glass';
      mesh.castShadow = !glass && o.shadow !== false; mesh.receiveShadow = !glass && o.receive !== false; if (glass) mesh.renderOrder = 5;
      (out[a.grp] ||= []).push(mesh);
    }
    return out;
  }
  tris() { let t = 0; for (const a of this.accs.values()) t += a.i.length / 3; return t; }
}
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3();
function faceMatrix(x, y, z, tx, ty, tz) {
  const Z = new THREE.Vector3(tx - x, ty - y, tz - z).normalize(), X = new THREE.Vector3(0, 1, 0).cross(Z).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(x, y, z);
}

// ---------------------------------------------------------------------------------------------- materials

// Rain on bodywork and glass: standing beads everywhere, running streaks on walls. Bump from screen-space derivatives
// of a procedural height (no tangents needed).
const GLSL_WATER = `
  float vhH(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vhBead(vec2 p){ vec2 g=floor(p), f=fract(p); vec2 o=vec2(vhH(g+1.3),vhH(g+7.9))*0.5+0.25; float r=0.09+0.15*vhH(g+3.3); float d=length(f-o)/r; return clamp(1.0-d*d,0.0,1.0); }
  float vhWater(vec3 p, vec3 n, float t, float rain){
    float up=clamp(n.y,0.0,1.0);
    vec2 q=mix(vec2(p.x+p.z,p.y), p.xz, step(0.55,up));
    float h=vhBead(q*61.0)*0.7+vhBead(q*27.0+3.7);
    float col=floor(q.x*34.0);
    float run=vhBead(vec2(q.x*34.0, q.y*2.6+t*(0.5+vhH(vec2(col,2.0))*1.1)+vhH(vec2(col,5.0))*9.0));
    h+=run*1.6*(1.0-step(0.55,up))*rain;
    return h; }
  vec3 vhBump(vec3 N, vec3 vp, float h){
    vec3 dpx=dFdx(vp), dpy=dFdy(vp); float hx=dFdx(h), hy=dFdy(h);
    vec3 r1=cross(dpy,N), r2=cross(N,dpx); float det=dot(dpx,r1);
    vec3 r=abs(det)*N-sign(det)*(hx*r1+hy*r2);
    return dot(r,r)>0.0 ? normalize(r) : N; }`;
const WATER_VS = s => s.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vObjN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP=transformed; vObjN=normal;');
const WATER_FS_NORMAL = `#include <normal_fragment_maps>
  { float vhW=uWet*(1.0-smoothstep(3.0,20.0,length(vViewPosition)));
    if(vhW>0.01){ float hh=vhWater(vObjP,normalize(vObjN+vec3(0.0,1e-5,0.0)),uTime,uRain)*0.0011*vhW; normal=vhBump(normal,-vViewPosition,hh); } }`;

// The workhorse: colour, roughness, metalness and lamp channel come from vertex attributes, so one material (one draw
// call) covers chrome, rubber, plastic and every lamp of a vehicle. lamps = Float32Array(n * 3) of linear emissive
// colours indexed by the lamp channel (slot 0 stays black). paint = uniform colour multiplied in where the paint mask is set.
function makeSurfMat({ physical = false, lamps = null, paint = null, wet = true, side = THREE.FrontSide, map = null, inst = false } = {}) {
  const m = physical ? new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.045, side, map }) : new THREE.MeshStandardMaterial({ vertexColors: true, side, map });
  const nL = lamps ? lamps.length / 3 : 0;
  m.userData.lamps = lamps; m.userData.paint = paint;
  m.onBeforeCompile = sh => {
    sh.uniforms.uWet = wet ? U.uWet : { value: 0 }; if (lamps) sh.uniforms.uLamp = { value: lamps }; if (paint) sh.uniforms.uPaint = paint;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aSurf; varying vec4 vSurf; varying vec2 vLuv; ${lamps ? `uniform vec3 uLamp[${nL}]; varying vec3 vLampE;` : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSurf=aSurf; vLuv=uv; ${lamps ? `vLampE=uLamp[int(clamp(aSurf.w,0.0,${nL - 1}.0)+0.5)];` : ''}`)
      // instanced use (parked cars): the instance colour tints painted panels only, not glass, tyres or trim
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz=color.rgb*mix(vec3(1.0),instanceColor.xyz,aSurf.z);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 vSurf; varying vec2 vLuv; uniform float uWet; ${lamps ? 'varying vec3 vLampE;' : ''} ${paint ? 'uniform vec3 uPaint;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${paint ? 'diffuseColor.rgb*=mix(vec3(1.0),uPaint,vSurf.z);' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=vSurf.x; roughnessFactor=mix(roughnessFactor,min(roughnessFactor,0.2),uWet*0.8);
        diffuseColor.rgb*=1.0-0.25*uWet*(1.0-vSurf.y);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=vSurf.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${lamps ? `{ float led=1.0;
          if(vLuv.x>-0.5 && vSurf.w>0.5 && ${map ? 'false' : 'true'}){ vec2 g=fract(vLuv)-0.5; float dd=1.0-smoothstep(0.10,0.44,length(g)); float aa=clamp(max(fwidth(vLuv.x),fwidth(vLuv.y))*1.3,0.0,1.0);
            led=mix(0.3+1.5*dd,0.8,aa); diffuseColor.rgb*=mix(0.5+0.7*dd,0.8,aa); }
          totalEmissiveRadiance+=vLampE*led; }` : ''}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=vSurf.z;\n#endif`);
  };
  m.customProgramCacheKey = () => `vhsurf${physical ? 1 : 0}${nL}${paint ? 1 : 0}${wet ? 1 : 0}${map ? 1 : 0}${inst ? 1 : 0}`;
  return m;
}

// Clear-coated paint carrying the livery atlas. grime = texture in the same UV layout: R dirt, G damage order, B bare metal.
function makePaintMat({ map, grime }) {
  const m = new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035 });
  const un = m.userData.u = { tGrime: { value: grime }, uDirt: { value: 0 }, uDamage: { value: 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, un, { uWet: U.uWet, uRain: U.uRain, uTime: U.uTime });
    sh.vertexShader = WATER_VS(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObjP; varying vec3 vObjN; uniform sampler2D tGrime; uniform float uDirt,uDamage,uWet,uRain,uTime; ${GLSL_WATER}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 vhG=vec3(0.0);
        #ifdef USE_MAP
        vhG=texture2D(tGrime,vMapUv).rgb;
        #endif
        float vhDirt=clamp(vhG.r*uDirt*1.7,0.0,1.0)*step(0.001,uDirt);
        float vhDmg=smoothstep(1.02-uDamage,1.06-uDamage,vhG.g)*step(0.001,uDamage);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.13,0.11,0.085),vhDirt*0.92);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(0.045),vec3(0.55),vhG.b),vhDmg);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,0.95,vhDirt); roughnessFactor=mix(roughnessFactor,0.5,vhDmg);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,vhG.b,vhDmg);')
      .replace('#include <normal_fragment_maps>', WATER_FS_NORMAL)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal=normal;\n#endif')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=(1.0-vhDirt)*(1.0-vhDmg);\n#endif');
  };
  m.customProgramCacheKey = () => 'vhpaint';
  return m;
}

// Tinted glass: reflections keep their strength where the pane is otherwise see-through, rain beads on the outside.
function makeGlassMat({ color = 0x0b1012, opacity = 0.4, wet = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.02, metalness: 0, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.25 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uWet: wet ? U.uWet : { value: 0 }, uRain: U.uRain, uTime: U.uTime });
    sh.vertexShader = WATER_VS(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObjP; varying vec3 vObjN; uniform float uWet,uRain,uTime; ${GLSL_WATER}`)
      .replace('#include <normal_fragment_maps>', WATER_FS_NORMAL)
      .replace('#include <opaque_fragment>', `if(gl_FrontFacing) diffuseColor.a=clamp(diffuseColor.a+dot(reflectedLight.directSpecular+reflectedLight.indirectSpecular,vec3(0.3333))*1.4,0.0,1.0); else diffuseColor.a*=0.4;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'vhglass' + (wet ? 1 : 0);
  return m;
}

// All lamp halos of a vehicle in one additive draw call. items: { pos, dir, size (m), ch, gain }. A halo follows its
// lamp channel, fades when seen from behind and swells in rain.
function makeGlow(lamps, items) {
  const nL = lamps.length / 3, g = items.isBufferGeometry ? items : glowGeo(items);
  const m = new THREE.ShaderMaterial({
    uniforms: { uLamp: { value: lamps }, uRain: U.uRain, uNight: U.uNight, tGlow: { value: glowTexture() } },
    vertexShader: `uniform vec3 uLamp[${nL}]; uniform float uRain,uNight; attribute vec3 aPos,aDir,aPar; varying vec3 vCol; varying vec2 vUv;
      void main(){
        vec3 e=uLamp[int(clamp(aPar.y,0.0,${nL - 1}.0)+0.5)]; float lum=max(e.r,max(e.g,e.b));
        vec4 mv=modelViewMatrix*vec4(aPos,1.0); float dist=max(length(mv.xyz),0.001); vec3 toEye=-mv.xyz/dist;
        vec3 vd=mat3(modelViewMatrix)*aDir; vd/=max(length(vd),1e-5);
        float f=smoothstep(-0.08,0.6,dot(vd,toEye));
        float sz=aPar.x*(0.45+0.55*min(lum*0.14,1.0))*(1.0+uRain*0.5)*(1.0+dist*0.02);
        mv.xyz+=toEye*min(0.2,dist*0.5); mv.xy+=(uv*2.0-1.0)*sz;
        vCol=e*f*aPar.z*mix(0.15,1.0,uNight); vUv=uv;
        gl_Position=(lum*f<0.004)?vec4(2.0,2.0,2.0,1.0):projectionMatrix*mv; }`,
    fragmentShader: 'uniform sampler2D tGlow; varying vec3 vCol; varying vec2 vUv; void main(){ float a=texture2D(tGlow,vUv).a; gl_FragColor=vec4(vCol*a*a,1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.name = 'glow';
  return mesh;
}
function glowGeo(items) {
  const g = new THREE.InstancedBufferGeometry(), n = items.length;
  // corners come from uv; position stays zero so depth/normal override passes (ambient occlusion) see nothing
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), par = new Float32Array(n * 3);
  items.forEach((it, i) => { pos.set(it.pos, i * 3); dir.set(it.dir, i * 3); par.set([it.size, it.ch, it.gain ?? 1], i * 3); });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.InstancedBufferAttribute(dir, 3)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 3));
  g.instanceCount = n;
  return g;
}

// ---------------------------------------------------------------------------------------------- wheels

// Emits one wheel into B: axle along X through the origin, outer face towards +X. style: front | rear (dually) | alloy | cap.
function wheelInto(B, { R, W, rimR, seg = 36, style = 'alloy', grooves = 3, spokes = 5, rimSk = SK.steel, lugs = 8, lite = false }) {
  const hw = W / 2, sw = R - rimR, crown = a => R - 0.006 * (a / (0.8 * hw)) ** 2;
  const side = s => lite ? [[s * hw * 0.74, rimR], [s * hw, rimR + sw * 0.45], [s * hw * 0.93, R - 0.02], [s * hw * 0.8, crown(0.8 * hw)]]
    : [[s * hw * 0.70, rimR - 0.004], [s * hw * 0.86, rimR + 0.012], [s * hw * 0.98, rimR + sw * 0.32], [s * hw, rimR + sw * 0.56], [s * hw * 0.97, R - sw * 0.24], [s * hw * 0.90, R - 0.022], [s * hw * 0.80, crown(0.8 * hw)]];
  const tyre = side(-1); tyre.push(tyre[tyre.length - 1]);
  if (grooves) {
    const gw = W * 0.06, gd = 0.009;
    for (let k = 0; k < grooves; k++) {
      const c = (k - (grooves - 1) / 2) * (1.6 * hw / (grooves + 1)) * 1.25, y = crown(c);
      tyre.push([c - gw / 2, y], [c - gw / 2, y], [c - gw / 2 + 0.002, y - gd], [c - gw / 2 + 0.002, y - gd], [c + gw / 2 - 0.002, y - gd], [c + gw / 2 - 0.002, y - gd], [c + gw / 2, y], [c + gw / 2, y]);
    }
  }
  const s2 = side(1).reverse(); tyre.push(s2[0], ...s2);
  B.lathe(SK.tyre, tyre, { axis: 'x', seg });
  // rim
  const lip = [[hw * 0.6, rimR + 0.004], [hw * 0.86, rimR + 0.014], [hw * 0.9, rimR + 0.004], [hw * 0.86, rimR - 0.012]];
  let prof, holes = null, nH = 8, frac = 0.5, lugR = 0.085, lugA = 0, back = hw * 0.15;
  if (style === 'front') {
    prof = [...lip, [hw * 0.55, rimR - 0.022], [hw * 0.5, rimR - 0.03], [hw * 0.82, rimR * 0.7], [hw + 0.035, rimR * 0.42], [hw + 0.075, 0.105], [hw + 0.075, 0.105], [hw + 0.11, 0.085], [hw + 0.13, 0.05], [hw + 0.135, 0]];
    holes = [5, 6]; lugA = hw + 0.065; lugR = 0.135; back = hw * 0.3;
  } else if (style === 'rear') {
    prof = [...lip, [-hw * 0.1, rimR - 0.026], [-hw * 0.3, rimR - 0.045], [-hw * 0.42, rimR * 0.8], [-hw * 0.42, rimR * 0.52], [-hw * 0.3, 0.135], [hw * 0.35, 0.115], [hw * 0.35, 0.115], [hw * 0.48, 0.09], [hw * 0.52, 0.05], [hw * 0.53, 0]];
    holes = [6, 7]; lugA = -hw * 0.4; lugR = 0.165; back = -hw * 0.6;
  } else if (style === 'cap') {
    prof = [...lip, [hw * 0.7, rimR - 0.02], [hw * 0.72, rimR - 0.03], [hw * 0.8, rimR * 0.6], [hw * 0.86, rimR * 0.3], [hw * 0.88, 0]];
    holes = [5, 6]; nH = 12; frac = 0.3; lugs = 0; back = hw * 0.4;
  } else {
    prof = [...lip, [hw * 0.45, rimR - 0.02], [hw * 0.42, rimR - 0.028], [hw * 0.66, rimR * 0.9], [hw * 0.5, rimR * 0.3], [hw * 0.58, 0.064], [hw * 0.6, 0.058], [hw * 0.63, 0]];
    holes = [6, 7]; nH = spokes; frac = 0.6; lugA = hw * 0.53; lugR = 0.05; lugs = Math.min(lugs, 5); back = hw * 0.1;
  }
  const rseg = lite ? nH * (nH > 6 ? 2 : 3) : Math.max(nH * 4, Math.round(seg / nH) * nH), per = rseg / nH, open = Math.max(1, Math.round(per * frac));
  B.lathe(rimSk, prof, { axis: 'x', seg: rseg, cell: (i, j) => (holes && i >= holes[0] && i < holes[1] && (j % per) < open) ? null : { sk: rimSk } });
  // what you see through the holes: dark drum, brake disc, and the back of the wheel
  B.lathe(SK.under, [[back, rimR - 0.02], [back, 0]], { axis: 'x', seg: lite ? 8 : 16 });
  if (!lite) { B.lathe(SK.iron, [[back + 0.012, rimR * 0.8], [back + 0.012, 0.07]], { axis: 'x', seg: 20 }); B.lathe(SK.under, [[-hw * 0.55, 0], [-hw * 0.55, rimR + 0.004]], { axis: 'x', seg: 16 }); }
  for (let k = 0; k < lugs; k++) { const a = k / lugs * TAU + 0.2; B.cyl(SK.chrome, 0.012, 0.01, 0.022, lugA + 0.01, Math.cos(a) * lugR, Math.sin(a) * lugR, 'x', 6, 2); }
}

// Wheel object: spin with .rotation.x. side = 1 left (outer face +X), -1 right. dual adds the inner twin.
function makeWheel(mat, spec, side, dual = 0) {
  const B = new Builder({ single: () => 'surf' });
  const emit = () => { wheelInto(B, spec); if (dual) B.at(-dual, 0, 0, () => wheelInto(B, { ...spec, style: 'cap', grooves: spec.grooves, lugs: 0 })); };
  if (side > 0) emit(); else { B.M.makeScale(-1, 1, 1); B.neg = true; emit(); }
  const o = new THREE.Object3D(), ms = B.build({ surf: mat })[''];
  for (const m of ms) o.add(m);
  o.userData.tris = B.tris();
  return o;
}

// ---------------------------------------------------------------------------------------------- ambulance: livery

// Type III box ambulance on a cutaway van chassis. All positions in metres in the vehicle frame.
const AMB = {
  zF: 2.0, zR: -2.0, R: 0.385, tyreW: 0.235, rimR: 0.212, trackF: 0.885, dualOut: 1.02, dualGap: 0.3,
  cabW: 1.0, cabBack: 0.54, nose: 2.74, sill: 0.42, belt: 1.42, archF: 0.48,
  modW: 1.2, modF: 0.5, modR: -4.15, modB: 0.42, modT: 2.70, archR: 0.52, floor: 0.85, tail: -4.45,
  // compartment doors per side [z front, z rear, y bottom, y top]; side door and windows
  compL: [[0.40, -0.25, 0.52, 2.25], [-0.33, -1.42, 0.52, 1.40], [-2.62, -3.98, 0.52, 2.25]],
  compR: [[-0.46, -1.42, 0.52, 1.40], [-2.62, -3.98, 0.52, 2.25]],
  sideDoor: [0.40, -0.38, 0.52, 2.42], sideWin: [0.27, -0.25], fixedWin: [-0.75, -1.95], winY: [1.62, 2.20],
  rearDoor: { x: 0.66, y0: 0.87, y1: 2.45 }, cabDoor: [1.88, 0.80],
};
// Paint atlas: five planar charts (0 left, 1 right, 2 front, 3 rear, 4 top), drawn in centimetres.
const AT = { W: 4096, H: 2048, z0: -4.5, z1: 2.9, y1: 2.96, xh: 1.25, rect: [[0, 0, 2560, 1024], [0, 1024, 2560, 1024], [2560, 0, 768, 1024], [2560, 1024, 768, 1024], [3328, 0, 768, 2048]], cm: [[740, 296], [740, 296], [250, 296], [250, 296], [250, 740]] };
function ambChart(ch, x, y, z) {
  const r = AT.rect[ch], v0 = (AT.y1 - y) / AT.y1; let u, v = v0;
  if (ch === 0) u = (AT.z1 - z) / 7.4; else if (ch === 1) u = (z - AT.z0) / 7.4; else if (ch === 2) u = (x + AT.xh) / 2.5; else if (ch === 3) u = (AT.xh - x) / 2.5; else { u = (AT.xh - x) / 2.5; v = (AT.z1 - z) / 7.4; }
  return [(r[0] + clamp(u, 0.003, 0.997) * r[2]) / AT.W, 1 - (r[1] + clamp(v, 0.003, 0.997) * r[3]) / AT.H];
}
const FONT = (px, w = 700) => `${w} ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
const C_RED = '#8a1414', C_GOLD = '#d2a01c';

// Original county mark: a heartbeat trace inside a double ring.
function drawEmblem(c, cx, cy, r, bg = '#dbdad6') {
  c.save(); c.translate(cx, cy);
  c.fillStyle = bg; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.strokeStyle = C_RED; c.lineWidth = r * 0.14; c.beginPath(); c.arc(0, 0, r * 0.92, 0, TAU); c.stroke();
  c.strokeStyle = C_GOLD; c.lineWidth = r * 0.045; c.beginPath(); c.arc(0, 0, r * 0.76, 0, TAU); c.stroke();
  const tr = [[-1, 0], [-0.56, 0], [-0.46, -0.13], [-0.36, 0], [-0.24, 0], [-0.15, 0.2], [-0.04, -0.86], [0.08, 0.5], [0.16, 0], [0.3, 0], [0.43, -0.22], [0.56, 0], [1, 0]];
  c.strokeStyle = C_RED; c.lineWidth = r * 0.085; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath();
  tr.forEach((p, i) => { const x = p[0] * r * 0.62, y = p[1] * r * 0.5; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
  c.restore();
}

function drawAmbLivery(S) {
  const cv = makeCanvas(AT.W * S, AT.H * S), c = cv.getContext('2d');
  c.fillStyle = '#dbdad6'; c.fillRect(0, 0, cv.width, cv.height);
  const chart = (ch, fn) => { const r = AT.rect[ch]; c.save(); c.beginPath(); c.rect(r[0] * S, r[1] * S, r[2] * S, r[3] * S); c.clip(); c.setTransform(r[2] * S / AT.cm[ch][0], 0, 0, r[3] * S / AT.cm[ch][1], r[0] * S, r[1] * S); fn(); c.restore(); };
  const yy = y => (AT.y1 - y) * 100, SEAM = 'rgba(20,20,24,0.82)';
  const text = (s, x, y, px, col, sp = 0, w = 700) => { c.font = FONT(px, w); c.letterSpacing = sp + 'px'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = col; c.fillText(s, x, y); c.letterSpacing = '0px'; };
  for (const L of [true, false]) chart(L ? 0 : 1, () => {
    const zx = L ? z => (AT.z1 - z) * 100 : z => (z - AT.z0) * 100;
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(zx(p[0]), yy(p[1])) : c.moveTo(zx(p[0]), yy(p[1]))); c.closePath(); c.fill(); };
    const line = (pts, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(zx(p[0]), yy(p[1])) : c.moveTo(zx(p[0]), yy(p[1]))); c.stroke(); };
    // band with reflective gold coach lines
    poly([[-4.2, 0.98], [2.5, 0.98], [2.66, 1.04], [2.66, 1.12], [2.02, 1.26], [-4.2, 1.26]], C_RED);
    line([[-4.2, 1.305], [2.02, 1.305], [2.66, 1.165]], C_GOLD, 2.6); line([[-4.2, 0.935], [2.54, 0.935]], C_GOLD, 2.6);
    text('MEDIC 14', zx(2.2), yy(1.065), 13.5, '#e6e5e0', 0.4);
    c.lineWidth = 0.7; c.strokeStyle = 'rgba(40,20,0,0.35)'; c.font = FONT(31); c.textAlign = 'center'; c.letterSpacing = '1.5px'; c.strokeText('KETTER COUNTY EMS', zx(-1.83) + 0.5, yy(1.415) + 0.5);
    text('KETTER COUNTY EMS', zx(-1.83), yy(1.415), 31, C_RED, 1.5);
    if (L) { drawEmblem(c, zx(-1.83), yy(2.17), 30); text('EMERGENCY MEDICAL SERVICES', zx(-1.83), yy(1.71), 8.5, '#1d2a44', 2.2, 600); }
    else { drawEmblem(c, zx(-3.3), yy(1.9), 25); text('PARAMEDIC', zx(-3.3), yy(2.33), 12, '#1d2a44', 1.6); }
    text('14', zx(0.12), yy(2.36), 20, C_RED, 0);
    // shut lines
    const box = (z0, z1, y0, y1, w = 0.8) => { const x0 = Math.min(zx(z0), zx(z1)), X1 = Math.max(zx(z0), zx(z1)); c.strokeStyle = SEAM; c.lineWidth = w; c.beginPath(); c.roundRect(x0, yy(y1), X1 - x0, (y1 - y0) * 100, 2.2); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.4; c.beginPath(); c.roundRect(x0 + 0.8, yy(y1) + 0.8, X1 - x0 - 1.6, (y1 - y0) * 100 - 1.6, 2); c.stroke(); };
    for (const d of (L ? AMB.compL : AMB.compR)) box(...d);
    if (!L) box(...AMB.sideDoor, 1.0);
    // cab door, following the arch at its front lower corner
    c.strokeStyle = SEAM; c.lineWidth = 0.9; c.beginPath(); c.moveTo(zx(0.80), yy(1.42)); c.lineTo(zx(0.80), yy(0.47)); c.lineTo(zx(1.50), yy(0.47));
    for (let a = 170; a >= 104; a -= 6) c.lineTo(zx(2.0 + 0.5 * Math.cos(rad(a))), yy(0.385 + 0.5 * Math.sin(rad(a)))); c.lineTo(zx(1.88), yy(1.42)); c.stroke();
    line([[2.06, 1.335], [2.5, 1.225]], 'rgba(20,20,24,0.5)', 0.6);
    if (L) box(-0.6, -0.84, 0.56, 0.8, 0.6);   // fuel filler flap
  });
  chart(2, () => { text('AMBULANCE', 125, yy(2.20), 19, C_RED, 2.5); c.fillStyle = C_GOLD; c.fillRect(30, yy(2.165), 190, 1.6); });
  chart(3, () => {
    // battenburg-free rear: red/gold chevrons below the windows
    const y0 = yy(1.62), y1 = yy(0.40); c.fillStyle = C_RED; c.fillRect(0, y0, 250, y1 - y0);
    for (const sg of [1, -1]) {
      c.save(); c.beginPath(); c.rect(sg > 0 ? 0 : 125, y0, 125, y1 - y0); c.clip(); c.strokeStyle = C_GOLD; c.lineWidth = 12.5;
      for (let k = -7; k < 11; k++) { const x = 125 - sg * k * 35.4; c.beginPath(); c.moveTo(x, y1 + 10); c.lineTo(x + sg * 400, y1 + 10 - 400); c.stroke(); }
      c.restore();
    }
    c.fillStyle = C_GOLD; c.fillRect(0, y0 - 2.6, 250, 2.6);
    text('MEDIC 14', 125, yy(2.275), 17, C_RED, 1.2);
  });
  chart(4, () => {
    text('14', 125, (AT.z1 + 2.6) * 100, 150, '#16181c', 4);
    c.save(); c.translate(125, (AT.z1 - 2.36) * 100); c.scale(1, -1); text('AMBULANCE', 0, 5, 17.5, C_RED, 2.2); c.restore();
    c.strokeStyle = 'rgba(20,20,24,0.6)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(125 - 92, (AT.z1 - 2.06) * 100); c.lineTo(125 - 90, (AT.z1 - 2.6) * 100); c.quadraticCurveTo(125 - 88, (AT.z1 - 2.7) * 100, 125 - 78, (AT.z1 - 2.705) * 100); c.lineTo(125 + 78, (AT.z1 - 2.705) * 100); c.quadraticCurveTo(125 + 88, (AT.z1 - 2.7) * 100, 125 + 90, (AT.z1 - 2.6) * 100); c.lineTo(125 + 92, (AT.z1 - 2.06) * 100); c.stroke();
  });
  return cv;
}

// Grime atlas in the same layout: R road film (heavy low down and behind the wheels), G damage order (high = first to
// appear), B bare metal inside the scrapes.
function drawAmbGrime(seed) {
  const W = 2048, H = 1024, S = W / AT.W, rng = makeRng(seed), LW = 512, LH = 256, lo = makeCanvas(LW, LH), lc = lo.getContext('2d'), img = lc.createImageData(LW, LH), d = img.data;
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const X = x * AT.W / LW, Y = y * AT.H / LH; let ch = -1; for (let k = 0; k < 5; k++) { const r = AT.rect[k]; if (X >= r[0] && X < r[0] + r[2] && Y >= r[1] && Y < r[1] + r[3]) { ch = k; break; } }
    const r = AT.rect[ch], u = (X - r[0]) / r[2], v = (Y - r[1]) / r[3]; let dirt = 0;
    const n = fbm2(x * 0.045, y * 0.045, 4, seed), streak = fbm2(x * 0.5, y * 0.03, 3, seed + 9);
    if (ch < 4) {
      const h = (1 - v) * AT.y1; dirt = (1 - smooth(0.35, 1.7, h)) * (0.55 + 0.75 * n) + streak * 0.22 * (1 - smooth(0.6, 2.4, h));
      if (ch < 2) { const z = ch === 0 ? AT.z1 - u * 7.4 : AT.z0 + u * 7.4; for (const az of [AMB.zF, AMB.zR]) { const b = az - z; if (b > 0 && b < 1.6) dirt += (1 - b / 1.6) * (1 - smooth(0.4, 1.5, h)) * (0.5 + n); } }
      if (ch === 3) dirt = dirt * 1.2 + 0.25 * n * (1 - smooth(1.2, 2.6, h));
    } else dirt = 0.12 * n + 0.1 * streak;
    const i = (y * LW + x) * 4; d[i] = clamp(dirt) * 255; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
  }
  lc.putImageData(img, 0, 0);
  const cv = makeCanvas(W, H), c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(lo, 0, 0, W, H);
  c.globalCompositeOperation = 'lighter';
  // scrapes: front-right corner first, then along the right side, then the rear corner of the box
  const scrape = (ch, x0, y0, len, hgt, order, n) => {
    const r = AT.rect[ch], sx = r[2] * S / AT.cm[ch][0], sy = r[3] * S / AT.cm[ch][1];
    for (let k = 0; k < n; k++) {
      const yk = y0 + rng.r(-hgt, hgt), xa = x0 + rng.r(-len * 0.15, len * 0.3), l = len * rng.r(0.3, 1), wob = rng.r(-4, 4), g = Math.round(255 * clamp(order - rng.r(0, 0.25)));
      c.strokeStyle = `rgb(0,${g},${rng.chance(0.3) ? Math.round(rng.r(90, 200)) : 0})`; c.lineWidth = rng.r(0.5, 1.7) * sy; c.lineCap = 'round';
      c.beginPath(); c.moveTo(r[0] * S + xa * sx, r[1] * S + yk * sy); c.quadraticCurveTo(r[0] * S + (xa + l / 2) * sx, r[1] * S + (yk + wob) * sy, r[0] * S + (xa + l) * sx, r[1] * S + (yk + wob * 0.6) * sy); c.stroke();
    }
  };
  scrape(1, (2.25 - AT.z0) * 100, (AT.y1 - 0.95) * 100, 50, 20, 1.0, 34);     // right front wing
  scrape(2, 12, (AT.y1 - 0.95) * 100, 36, 18, 0.95, 22);                      // front, right corner
  scrape(1, (0.9 - AT.z0) * 100, (AT.y1 - 0.9) * 100, 90, 12, 0.72, 20);     // right cab door
  scrape(1, (-1.6 - AT.z0) * 100, (AT.y1 - 0.8) * 100, 150, 10, 0.45, 20);     // box side
  scrape(1, (-4.1 - AT.z0) * 100, (AT.y1 - 0.75) * 100, 45, 20, 0.3, 16);    // rear corner
  return cv;
}

// Small shared decal sheet: number plates and the few bits of lettering that sit on non-paint parts.
let _decal = null;
function decalSheet() {
  if (_decal) return _decal;
  const cv = makeCanvas(1024, 512), c = cv.getContext('2d'), rng = makeRng(4182), uv = {};
  const rect = (name, x, y, w, h) => { uv[name] = [x / 1024, 1 - (y + h) / 512, (x + w) / 1024, 1 - y / 512]; };
  c.fillStyle = '#d8d8d4'; c.fillRect(0, 0, 1024, 512);
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  for (let i = 0; i < 8; i++) {
    const x = (i % 2) * 256, y = (i >> 1) * 128; rect('plate' + i, x + 4, y + 4, 248, 120);
    const g = c.createLinearGradient(0, y, 0, y + 128); g.addColorStop(0, '#e9eef2'); g.addColorStop(1, '#f6f6f1'); c.fillStyle = g; c.beginPath(); c.roundRect(x + 4, y + 4, 248, 120, 10); c.fill();
    c.strokeStyle = '#1b2f55'; c.lineWidth = 4; c.beginPath(); c.roundRect(x + 9, y + 9, 238, 110, 8); c.stroke();
    c.fillStyle = '#1b2f55'; c.textAlign = 'center'; c.font = FONT(20, 700); c.letterSpacing = '3px'; c.fillText(i === 0 ? 'KETTER COUNTY' : 'CASCADE STATE', x + 128, y + 32);
    const txt = i === 0 ? 'XMT 0014' : `${L[rng.i(0, 22)]}${L[rng.i(0, 22)]}${L[rng.i(0, 22)]} ${rng.i(1000, 9999)}`;
    c.font = FONT(64, 700); c.letterSpacing = '4px'; c.fillText(txt, x + 128, y + 92); c.font = FONT(15, 600); c.letterSpacing = '2px'; c.fillText(i === 0 ? 'EXEMPT' : 'evergreen country', x + 128, y + 112); c.letterSpacing = '0px';
  }
  const label = (name, x, y, w, h, bg, fg, txt, px, sp = 2) => { rect(name, x, y, w, h); c.fillStyle = bg; c.fillRect(x, y, w, h); c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = FONT(px, 700); c.letterSpacing = sp + 'px'; c.fillText(txt, x + w / 2, y + h / 2 + px * 0.04); c.letterSpacing = '0px'; c.textBaseline = 'alphabetic'; };
  label('police', 512, 0, 512, 96, '#f2f2ee', '#14284f', 'POLICE', 84, 14);
  label('policeSm', 512, 96, 512, 48, '#f2f2ee', '#14284f', 'HALLORAN FALLS POLICE', 30, 3);
  label('fire', 512, 144, 512, 80, '#8e1512', '#e9c04a', 'HALLORAN FALLS FIRE', 50, 2);
  label('engine', 512, 224, 256, 80, '#8e1512', '#e9c04a', 'ENGINE 3', 56, 2);
  label('bus', 768, 224, 256, 80, '#0c0c0c', '#ffb428', '14 RIVERSIDE', 38, 2);
  label('transit', 512, 304, 512, 64, '#f2f2ee', '#1d5b8a', 'KETTER VALLEY TRANSIT', 38, 2);
  label('haul', 512, 368, 512, 144, '#f2f2ee', '#b3401c', 'NORTHFORK FREIGHT', 54, 2);
  c.fillStyle = '#ffffff'; c.fillRect(0, 500, 12, 12);   // untextured vertices of a single-mesh car sample this corner
  const tex = canvasTex(cv, { wrap: false, aniso: 8 }); tex.userData.shared = true;
  return _decal = { tex, uv, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0 }) };
}
const SK_DECAL = skin('tex'), SK_CAB = skin('texcab'), SK_MDT = skin('texmdt');

// Instrument and control faces of the cab: cluster dials (needles are separate), siren controller, radio, switches, heater.
function drawCabSheet() {
  const cv = makeCanvas(1024, 512), c = cv.getContext('2d'), uv = {};
  const rect = (name, x, y, w, h) => { uv[name] = [x / 1024, 1 - (y + h) / 512, (x + w) / 1024, 1 - y / 512]; };
  const txt = (s, x, y, px, col = '#dfe6ea', w = 600, al = 'center') => { c.fillStyle = col; c.font = FONT(px, w); c.textAlign = al; c.textBaseline = 'middle'; c.fillText(s, x, y); };
  c.fillStyle = '#08090a'; c.fillRect(0, 0, 1024, 512);
  rect('cluster', 0, 0, 720, 270);
  const dial = (cx, cy, r, max, step, minor, unit) => {
    c.strokeStyle = '#33383c'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r + 7, 0, TAU); c.stroke();
    for (let v = 0; v <= max + 1e-6; v += minor) {
      const a = rad(225 - 270 * v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6, l = big ? 17 : 8;
      c.strokeStyle = '#e8eef2'; c.lineWidth = big ? 3.2 : 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy - Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * (r - l), cy - Math.sin(a) * (r - l)); c.stroke();
      if (big) txt(String(Math.round(v)), cx + Math.cos(a) * (r - 34), cy - Math.sin(a) * (r - 34), 19);
    }
    txt(unit, cx, cy + r * 0.5, 13, '#8f9aa2');
  };
  dial(190, 138, 112, 200, 20, 10, 'km/h'); dial(530, 138, 112, 5, 1, 0.25, 'RPM x1000');
  c.fillStyle = '#0d1a14'; c.fillRect(300, 172, 120, 46); txt('D', 318, 195, 24, '#7ef0b0', 700); txt('048213 km', 372, 195, 15, '#7ef0b0');
  for (const [x, lab] of [[330, 'F'], [390, 'H']]) { c.strokeStyle = '#e8eef2'; c.lineWidth = 2; c.beginPath(); c.arc(x, 110, 30, rad(200), rad(340)); c.stroke(); txt(lab, x + 26, 92, 12); txt(lab === 'F' ? 'E' : 'C', x - 26, 92, 12); c.strokeStyle = '#ff5a1a'; c.beginPath(); c.moveTo(x, 110); c.lineTo(x + (lab === 'F' ? 14 : -4), 84); c.stroke(); }
  for (let i = 0; i < 6; i++) { c.fillStyle = ['#1c3a1c', '#3a2a10', '#3a1414', '#12283a', '#3a1414', '#1c3a1c'][i]; c.beginPath(); c.arc(270 + i * 36, 246, 7, 0, TAU); c.fill(); }
  // siren controller
  rect('siren', 0, 280, 360, 220); c.fillStyle = '#16181a'; c.fillRect(0, 280, 360, 220); c.strokeStyle = '#3a3e42'; c.lineWidth = 3; c.strokeRect(3, 283, 354, 214);
  txt('KESTREL 200', 96, 302, 15, '#aeb7bd', 700); c.fillStyle = '#26292c'; c.beginPath(); c.arc(92, 400, 52, 0, TAU); c.fill(); c.strokeStyle = '#d7dde1'; c.lineWidth = 5; c.beginPath(); c.moveTo(92, 400); c.lineTo(122, 366); c.stroke();
  ['RAD', 'PA', 'MAN', 'HF', 'WAIL', 'YELP', 'PHSR'].forEach((l, i) => { const a = rad(215 - i * 42); txt(l, 92 + Math.cos(a) * 74, 400 - Math.sin(a) * 68, 12); });
  ['1', '2', '3', 'HORN', 'AUX'].forEach((l, i) => { c.fillStyle = i < 3 ? '#c41a12' : '#3b3f43'; c.fillRect(186 + i * 34, 318, 28, 28); txt(l, 200 + i * 34, 360, 11); });
  ['FRONT', 'REAR', 'SCENE', 'TKDN'].forEach((l, i) => { c.fillStyle = '#2b2e31'; c.fillRect(190 + i * 42, 400, 32, 54); c.fillStyle = i < 2 ? '#ff3b22' : '#4a1a14'; c.fillRect(200 + i * 42, 406, 12, 8); txt(l, 206 + i * 42, 470, 10); });
  // two-way radio
  rect('radio', 370, 280, 330, 100); c.fillStyle = '#101112'; c.fillRect(370, 280, 330, 100); c.fillStyle = '#1e3b24'; c.fillRect(430, 296, 200, 60); txt('KC EMS DISP', 530, 314, 19, '#9dffa9', 700); txt('CH 04    TAC 2', 530, 340, 15, '#9dffa9');
  for (const x of [398, 664]) { c.fillStyle = '#2b2e31'; c.beginPath(); c.arc(x, 326, 20, 0, TAU); c.fill(); c.strokeStyle = '#aeb7bd'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 326); c.lineTo(x + 8, 310); c.stroke(); }
  // rocker switches
  rect('switch', 370, 390, 330, 110); c.fillStyle = '#16181a'; c.fillRect(370, 390, 330, 110);
  ['PRIM', 'SEC', 'SIDE', 'DOME', 'O2', 'INV'].forEach((l, i) => { c.fillStyle = '#0c0d0e'; c.fillRect(384 + i * 52, 404, 38, 62); c.fillStyle = i % 2 ? '#3a1612' : '#ff3b22'; c.fillRect(390 + i * 52, 410, 26, 22); txt(l, 403 + i * 52, 482, 11); });
  // heater and stereo
  rect('hvac', 730, 0, 290, 130); c.fillStyle = '#141516'; c.fillRect(730, 0, 290, 130);
  [780, 875, 970].forEach((x, i) => { c.fillStyle = '#2b2e31'; c.beginPath(); c.arc(x, 62, 34, 0, TAU); c.fill(); c.strokeStyle = '#d7dde1'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, 62); c.lineTo(x + [-20, 4, 22][i], 62 - [22, 32, 22][i]); c.stroke(); txt(['FAN', 'TEMP', 'MODE'][i], x, 116, 11); });
  rect('stereo', 730, 140, 290, 100); c.fillStyle = '#101112'; c.fillRect(730, 140, 290, 100); c.fillStyle = '#2a1c08'; c.fillRect(790, 156, 170, 44); txt('97.3 FM', 875, 178, 24, '#ffb648', 700);
  for (let i = 0; i < 6; i++) { c.fillStyle = '#2b2e31'; c.fillRect(790 + i * 29, 210, 24, 16); }
  const tex = canvasTex(cv, { wrap: false, aniso: 8 });
  return { tex, uv };
}

// ---------------------------------------------------------------------------------------------- ambulance: build

const LAMP_N = 64, E_RED = [1, 0.02, 0.012], E_WHT = [1, 0.95, 0.86], E_AMB = [1, 0.38, 0.015], E_COOL = [0.84, 0.93, 1];
// n flashes in the first half of each period, dark for the second half (the other side's turn)
const burst = (t, period, phase, n) => { const x = (((t / period + phase) % 1) + 1) % 1; return x < 0.5 && ((x * 2 * n) % 1) < 0.55 ? 1 : 0; };
// Emergency flash plan: [lamp, colour, side (+1 left, -1 right, 0 centre), period s, phase, flashes per burst, weight in lights.strobe]
const EMERGENCY = [
  ['barFLo', E_RED, 1, 0.84, 0, 3, 1], ['barFRo', E_RED, -1, 0.84, 0.5, 3, 1], ['barFLi', E_RED, 1, 0.84, 0.5, 2, 0.6], ['barFRi', E_RED, -1, 0.84, 0, 2, 0.6],
  ['barFWL', E_WHT, 1, 0.42, 0, 2, 0.7], ['barFWR', E_WHT, -1, 0.42, 0.5, 2, 0.7],
  ['barRLo', E_RED, 1, 0.84, 0.5, 3, 0.5], ['barRRo', E_RED, -1, 0.84, 0, 3, 0.5], ['barRLi', E_RED, 1, 0.84, 0, 2, 0.3], ['barRRi', E_RED, -1, 0.84, 0.5, 2, 0.3],
  ['barRAL', E_AMB, 1, 1.1, 0, 1, 0.3], ['barRAR', E_AMB, -1, 1.1, 0.5, 1, 0.3], ['barEL', E_RED, 1, 0.84, 0.25, 3, 0.5], ['barER', E_RED, -1, 0.84, 0.75, 3, 0.5],
  ['grilleL', E_RED, 1, 0.5, 0, 2, 0.4], ['grilleR', E_WHT, -1, 0.5, 0.5, 2, 0.4], ['interL', E_RED, 1, 0.5, 0.5, 2, 0.4], ['interR', E_RED, -1, 0.5, 0, 2, 0.4],
  ['upFL', E_RED, 1, 1.0, 0, 1, 0.7], ['upFR', E_RED, -1, 1.0, 0.5, 1, 0.7], ['upFC', E_WHT, 0, 0.5, 0.25, 2, 0.4],
  ['sideLF', E_RED, 1, 1.0, 0, 1, 0.6], ['sideLR', E_RED, 1, 1.0, 0.5, 1, 0.6], ['sideRF', E_RED, -1, 1.0, 0.5, 1, 0.6], ['sideRR', E_RED, -1, 1.0, 0, 1, 0.6],
  ['rearUL', E_RED, 1, 1.0, 0, 1, 0.5], ['rearUR', E_RED, -1, 1.0, 0.5, 1, 0.5], ['rearUC', E_AMB, 0, 1.0, 0.25, 1, 0.3], ['rearLL', E_RED, 1, 0.5, 0, 2, 0.4], ['rearLR', E_RED, -1, 0.5, 0.5, 2, 0.4],
];

export function buildAmbulance(opts = {}) {
  const A = AMB, S = opts.texScale ?? 1, seed = opts.seed ?? 14, PI = Math.PI;
  const lamps = new Float32Array(LAMP_N * 3), CHN = {}, glows = []; let nCh = 0;
  const chan = n => (CHN[n] ??= ++nCh);
  const B = new Builder({ chart: ambChart, seg: 4 }), dec = decalSheet();
  const D = {
    paint: { sk: SK.paint }, under: { sk: SK.under },
    shell: { sk: SK.paint, inner: SK.trim, jamb: SK.rubber }, roof: { sk: SK.paint, inner: SK.headliner, jamb: SK.rubber },
    doorL: { sk: SK.paint, grp: 'doorL', inner: SK.trim, jamb: SK.trimDark }, glassDoorL: { glass: SK.glass, grp: 'doorL' }, glass: { glass: SK.glass },
    wall: { sk: SK.paint, inner: SK.whiteGloss, jamb: SK.rubber }, sideDoor: { sk: SK.paint, grp: 'sideDoor', inner: SK.whiteGloss, jamb: SK.alu }, glassSide: { glass: SK.glass, grp: 'sideDoor' },
  };
  // a lamp: bezel + LED lens on channel `name`, facing local +Z after the yaw; registers its halo
  const lamp = (name, tint, w, h, grid, x, y, z, ry = 0, o = {}) => {
    const c = chan(name);
    B.at(x, y, z, o.rx || 0, ry, 0, () => {
      if (o.bezel !== null) B.rbox(o.bezel || SK.chrome, w + 0.026, h + 0.026, 0.014, 0.006, 0, 0, 0.004);
      B.rbox(lens(c, tint, grid), w, h, o.d || 0.026, Math.min(0.011, h * 0.3), 0, 0, 0.012);
      if (o.glow !== 0) glows.push({ pos: B.pt(0, 0, 0.04), dir: B.dir(0, 0, 1), size: clamp((o.glow || Math.max(w, h) * 2.2 + 0.1) * 0.62, 0.1, 0.6), ch: c, gain: o.gain ?? 0.05 });
    });
  };

  // ---- cab: lower body (sill to bonnet), front arches cut into the section's lower edge
  const cabW = z => z < 2.5 ? A.cabW : A.cabW - 0.15 * (1 - Math.sqrt(Math.max(0, 1 - ((z - 2.5) / 0.24) ** 2)));
  const bonnetY = curve([[2.02, 1.42], [2.08, 1.405], [2.5, 1.285], [2.64, 1.235], [2.71, 1.2], [2.74, 1.165]]);
  const cabBot = z => Math.max(z > 2.45 ? 0.5 : A.sill, archY(z, A.zF, A.R, A.archF));
  const cabSec = z => {
    const w = cabW(z), b = cabBot(z), cabin = z <= 2.02, t = cabin ? A.belt : bonnetY(z);
    return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w, y: b, z, r: 0.03 }, { x: w + 0.012, y: Math.max(0.95, b + 0.03), z, r: 0.25 }, { x: w - 0.004, y: t, z, r: cabin ? 0.03 : 0.075 }, { x: 0, y: t + (cabin ? 0 : 0.03), z, r: 0.5 }]);
  };
  const zsCab = stations([A.cabBack, 0.80, 1.15, 1.88, 2.02, 2.022, 2.08, 2.2, 2.35, 2.5], archStations(A.zF, A.archF, 16), range(0, 1, 6).map(t => 2.5 + 0.24 * Math.sin(t * PI / 2)));
  B.loft(zsCab, cabSec, {
    closed: true, inset: 0.075, capB: SK.paint, cell: (i, tag) => {
      const zm = (zsCab[i] + zsCab[i + 1]) / 2, cabin = zm < 2.02;
      if (tag < 1 || tag > 7) return D.under;
      if (tag > 3 && tag < 5) return cabin ? null : D.paint;
      if (!cabin || tag === 1 || tag === 7) return D.paint;
      return tag <= 3 && zm > A.cabDoor[1] && zm < A.cabDoor[0] ? D.doorL : D.shell;
    },
  });

  // ---- cab: greenhouse. Station A is the windscreen edge; its side span is the A-pillar.
  const gx = 0.966, ghSt = [
    { b: 2.02, c: 1.40, y: 2.03, cy: 2.062, x: 0.855, bow: 0.07 }, { b: 1.88, c: 1.27, y: 2.052, cy: 2.09, x: 0.86, bow: 0.05 },
    { b: 1.34, c: 1.03, y: 2.075, cy: 2.115, x: 0.865, bow: 0 }, { b: 0.80, c: 0.80, y: 2.08, cy: 2.12, x: 0.87, bow: 0 }, { b: A.cabBack, c: A.cabBack, y: 2.08, cy: 2.12, x: 0.87, bow: 0 }];
  const gh = B.loft([0, 1, 2, 3, 4], (u, i) => { const s = ghSt[i]; return mirrorRing([{ x: gx, y: A.belt, z: s.b, sub: 3 }, { x: s.x, y: s.y, z: s.c, r: 0.09, sub: 2 }, { x: 0, y: s.cy, z: s.c + s.bow, r: 0.5, k: 8 }], false); }, {
    inset: 0.045, edgeJamb: 'lr', cell: (i, tag) => (tag < 1 || tag > 3) ? ((i === 0 || i === 3) ? D.shell : tag < 1 ? D.glassDoorL : D.glass) : D.roof,
  });
  // windscreen: Coons patch between the cowl line and station A (pillars and header stay as a painted frame)
  const r0 = gh.rows[0], nR = r0.length, mid = 5, wsL = r0.slice(0, mid + 1), wsT = r0.slice(mid, nR - mid), wsR = r0.slice(nR - mid - 1).reverse();
  const wsB = wsT.map(p => { const x = p[0] / wsT[0][0] * gx; return [x, A.belt, 2.02 + 0.11 * (1 - (x / gx) ** 2)]; });
  B.coons(wsB, wsT, wsL, wsR, { facing: [0, 0.6, 0.8], inset: 0.045, cell: (i, j) => (j < 2 || j >= wsT.length - 3 || i >= 3) ? D.shell : D.glass });
  B.tube(SK.rubber, wsB.map(p => [p[0] * 1.01, p[1] + 0.004, p[2] + 0.012]), 0.016, 6);        // cowl seal
  B.mirror(s => { B.grp = s > 0 ? 'doorL' : ''; B.tube(SK.rubber, [[gx + 0.006, A.belt + 0.006, 1.87], [gx + 0.006, A.belt + 0.006, 0.81]], 0.011, 6); }); B.grp = '';

  // ---- module: aluminium box, arch cut, right-hand side door and windows, rear door opening
  const zR = A.modR, modBot = z => Math.max(A.modB, archY(z, A.zR, A.R, A.archR));
  const modSec = z => { const b = modBot(z), W = A.modW; return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: W, y: b, z, r: 0.03 }, { x: W, y: Math.max(0.52, b + 0.001), z, flat: true }, { x: W, y: A.winY[0], z, flat: true }, { x: W, y: A.winY[1], z, flat: true }, { x: W, y: 2.42, z, flat: true }, { x: W, y: A.modT, z, r: 0.07 }, { x: 0, y: A.modT + 0.035, z, r: 0.7 }]); };
  const rd = A.rearDoor, rearSec = mirrorRing([{ x: 0, y: rd.y0, z: zR, flat: true }, { x: rd.x, y: rd.y0, z: zR, r: 0.004 }, { x: rd.x, y: rd.y0 + 0.01, z: zR, flat: true }, { x: rd.x, y: A.winY[0], z: zR, flat: true }, { x: rd.x, y: A.winY[1], z: zR, flat: true }, { x: rd.x, y: 2.42, z: zR, flat: true }, { x: rd.x, y: rd.y1, z: zR, r: 0.004 }, { x: 0, y: rd.y1, z: zR, r: 0.3 }]);
  const zsMod = stations([A.modF, A.sideDoor[0], A.sideWin[0], A.sideWin[1], A.sideDoor[1], A.fixedWin[0], -1.2, A.fixedWin[1], -3.0, zR], archStations(A.zR, A.archR, 16)).reverse(), nzM = zsMod.length;
  B.loft([...zsMod, 'rear'], u => u === 'rear' ? rearSec : modSec(u), {
    closed: true, inset: 0.06, capA: SK.paint, edgeJamb: 'b', cell: (i, tag) => {
      if (i === nzM - 1) return D.wall;
      const zm = (zsMod[i] + zsMod[i + 1]) / 2;
      if (tag < 1 || tag > 13) return D.under;
      if (tag === 1 || tag === 13) return D.paint;
      if (tag > 9 && tag < 12) {
        if (zm < A.sideDoor[0] && zm > A.sideDoor[1]) return tag === 10.5 && zm < A.sideWin[0] && zm > A.sideWin[1] ? D.glassSide : D.sideDoor;
        if (tag === 10.5 && zm < A.fixedWin[0] && zm > A.fixedWin[1]) return D.glass;
      }
      return D.wall;
    },
  });
  // rear doors: flat lattice with a window each
  for (const s of [1, -1]) {
    const grp = s > 0 ? 'rearL' : 'rearR', xs = [rd.x - 0.004, rd.x - 0.13, 0.15, 0.004].map(v => v * s), ys = [rd.y0 + 0.006, A.winY[0] + 0.06, A.winY[1], rd.y1 - 0.006], P = [];
    for (const y of ys) for (const x of xs) P.push(x, y, zR - 0.004);
    B.grid(P, 4, 4, { inset: 0.05, edgeJamb: true, facing: [0, 0, -1], cell: (i, j) => i === 1 && j === 1 ? { glass: SK.glass, grp } : { sk: SK.paint, grp, inner: SK.whiteGloss, jamb: SK.rubber } });
    B.grp = grp;
    for (const y of [1.05, 1.66, 2.27]) B.cyl(SK.steel, 0.013, 0.013, 0.11, s * (rd.x + 0.008), y, zR - 0.012, 'y', 8);
    if (s > 0) { B.rbox(SK.under, 0.17, 0.11, 0.008, 0.004, 0.13, 1.28, zR - 0.006); B.rbox(SK.steel, 0.13, 0.035, 0.022, 0.008, 0.13, 1.28, zR - 0.02); }
    else B.rbox(SK.steel, 0.03, 0.26, 0.02, 0.008, -0.07, 1.3, zR - 0.016);
    B.grp = '';
  }

  // ---- front fascia: bumper, valance, grille, headlamps
  const zf = A.nose, bpath = range(0, 1, 28).map(t => { const x = 1.035 * Math.cos(t * PI); return [x, 0.575, 2.86 - 0.34 * Math.abs(x / 1.035) ** 4]; });
  B.sweep(SK.chrome, bpath, [{ a: 0, b: -0.13, r: 0.035 }, { a: 0.1, b: -0.13, r: 0.02 }, { a: 0.1, b: 0.1, r: 0.02 }, { a: 0.03, b: 0.13, r: 0.02 }, { a: 0, b: 0.09, r: 0.02 }]);
  B.sweep(SK.black, bpath.map(p => [p[0] * 0.97, 0.405, p[2] - 0.05]), [{ a: 0, b: -0.07, r: 0.02 }, { a: 0.06, b: -0.07, r: 0.01 }, { a: 0.06, b: 0.05, r: 0.01 }, { a: 0, b: 0.05, r: 0.02 }]);
  B.rbox(SK.black, 0.34, 0.19, 0.012, 0.004, 0, 0.575, 2.864); B.at(0, 0.575, 2.871, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, dec.uv.plate0));
  for (const s of [1, -1]) B.rbox(SK.under, 0.07, 0.05, 0.1, 0.01, s * 0.42, 0.37, 2.8);          // tow hooks
  B.rbox(SK.under, 1.02, 0.39, 0.02, 0, 0, 0.935, zf + 0.002);
  for (let k = 0; k < 16; k++) B.box(SK.black, 0.012, 0.38, 0.022, -0.4725 + k * 0.063, 0.935, zf + 0.016);
  for (const y of [0.84, 0.935, 1.03]) B.rbox(SK.chrome, 1.0, 0.042, 0.034, 0.012, 0, y, zf + 0.03);
  for (const y of [0.732, 1.138]) B.rbox(SK.chrome, 1.09, 0.036, 0.05, 0.013, 0, y, zf + 0.024);
  for (const s of [1, -1]) B.rbox(SK.chrome, 0.036, 0.44, 0.05, 0.013, s * 0.527, 0.935, zf + 0.024);
  lamp('grilleL', LENS.red, 0.115, 0.036, [5, 1], 0.27, 0.985, zf + 0.05, 0, { bezel: SK.black }); lamp('grilleR', LENS.clear, 0.115, 0.036, [5, 1], -0.27, 0.985, zf + 0.05, 0, { bezel: SK.black });
  for (const s of [1, -1]) {
    const x = 0.7 * s, nm = s > 0 ? 'L' : 'R';
    B.rbox(SK.chrome, 0.315, 0.345, 0.02, 0.012, x, 0.94, zf + 0.002); B.rbox(SK.gloss, 0.29, 0.32, 0.022, 0.01, x, 0.94, zf + 0.008);
    lamp('head' + nm, LENS.clear, 0.128, 0.165, [3, 4], x + 0.072 * s, 1.005, zf + 0.016, 0, { glow: 1.0, gain: 0.05 });
    lamp('main' + nm, LENS.clear, 0.118, 0.165, [2, 2], x - 0.068 * s, 1.005, zf + 0.016, 0, { glow: 1.1, gain: 0.05 });
    lamp('ind' + nm, LENS.amber, 0.262, 0.072, [9, 2], x, 0.83, zf + 0.016, 0, {});
    lamp('markA', LENS.amber, 0.1, 0.04, [4, 1], s * 1.004, 0.79, 2.33, s * PI / 2, { glow: 0.2 });
    lamp('inter' + nm, LENS.red, 0.13, 0.07, [5, 2], s * 1.003, 0.80, 2.55, s * PI / 2 * 0.92, {});
  }
  for (const [x, y] of [[0, 2.097], [0.3, 2.092], [-0.3, 2.092], [0.64, 2.074], [-0.64, 2.074]]) { B.ball(lens(chan('markA'), LENS.amber), 0.034, 0.02, 0.06, x, y, 1.3, 8); glows.push({ pos: [x, y + 0.02, 1.34], dir: [0, 0.3, 0.95], size: 0.12, ch: chan('markA'), gain: 0.05 }); }

  B.grp = 'crack'; for (const [dx, dy] of [[0.07, 0.06], [-0.05, 0.08], [-0.08, -0.03], [0.02, -0.08], [0.09, -0.02], [-0.02, 0.03]]) B.tube(SK.under, [[-0.775, 1.0, zf + 0.047], [-0.775 + dx * 0.5, 1.0 + dy * 0.6, zf + 0.047], [-0.775 + dx, 1.0 + dy, zf + 0.047]], 0.0022, 3, { up: [0, 0, 1], caps: false }); B.grp = '';
  // ---- cab hardware: mirrors, handles, steps, arch trims
  B.mirror(s => {
    B.grp = s > 0 ? 'doorL' : '';
    B.tube(SK.black, [[1.0, 1.66, 1.8], [1.15, 1.7, 1.82], [1.27, 1.7, 1.82]], 0.012, 6); B.tube(SK.black, [[1.0, 1.38, 1.8], [1.15, 1.4, 1.82], [1.27, 1.4, 1.82]], 0.012, 6);
    B.rbox(SK.black, 0.2, 0.37, 0.085, 0.03, 1.3, 1.55, 1.835);
    B.rbox(SK.mirror, 0.17, 0.22, 0.006, 0.002, 1.3, 1.6, 1.79); B.rbox(SK.mirror, 0.17, 0.085, 0.006, 0.002, 1.3, 1.425, 1.79);
    B.rbox(SK.black, 0.022, 0.06, 0.2, 0.01, 1.014, 1.21, 0.95); B.rbox(SK.chrome, 0.014, 0.03, 0.15, 0.006, 1.027, 1.21, 0.95);
    B.grp = '';
    B.rbox(SK.black, 0.2, 0.05, 1.02, 0.015, 0.975, 0.385, 1.18); B.box(SK.alu, 0.15, 0.006, 0.96, 0.975, 0.412, 1.18);
    const arc = range(4, 176, 22).map(a => [1.0, A.R + (A.archF + 0.004) * Math.sin(rad(a)), A.zF + (A.archF + 0.004) * Math.cos(rad(a))]);
    B.sweep(SK.black, arc, [{ a: -0.02, b: -0.008, r: 0.006 }, { a: 0.02, b: -0.008, r: 0.008 }, { a: 0.02, b: 0.026, r: 0.01 }, { a: -0.02, b: 0.026, r: 0.006 }], { up: i => [0, Math.sin(rad(4 + i * 172 / 22)), Math.cos(rad(4 + i * 172 / 22))] });
    B.at(0, A.R, A.zF, () => B.lathe(SK.under, [[0.5, A.archF - 0.004], [0.99, A.archF - 0.004]], { axis: 'x', seg: 14, arc: [-PI / 2, PI / 2], flip: true }));
    // module: polished fenderette, liner, rub rails, mud flap
    const arc2 = range(3, 177, 24).map(a => [A.modW, A.R + (A.archR + 0.004) * Math.sin(rad(a)), A.zR + (A.archR + 0.004) * Math.cos(rad(a))]);
    B.sweep(SK.steel, arc2, [{ a: -0.02, b: -0.01, r: 0.006 }, { a: 0.038, b: -0.01, r: 0.01 }, { a: 0.038, b: 0.04, r: 0.014 }, { a: -0.02, b: 0.04, r: 0.006 }], { up: i => [0, Math.sin(rad(3 + i * 174 / 24)), Math.cos(rad(3 + i * 174 / 24))] });
    B.at(0, A.R, A.zR, () => B.lathe(SK.under, [[0.5, A.archR - 0.004], [A.modW - 0.01, A.archR - 0.004]], { axis: 'x', seg: 14, arc: [-PI / 2, PI / 2], flip: true }));
    for (const [za, zb] of [[A.modF, A.zR + A.archR + 0.06], [A.zR - A.archR - 0.06, zR]]) { B.rbox(SK.alu, 0.03, 0.06, za - zb, 0.01, A.modW + 0.012, 0.475, (za + zb) / 2); B.box(SK.rubber, 0.012, 0.03, za - zb - 0.02, A.modW + 0.03, 0.475, (za + zb) / 2); }
    B.box(SK.rubber, 0.5, 0.36, 0.014, 0.9, 0.3, A.zR - A.archR - 0.1);
  });

  // ---- module lamps and hardware
  for (const s of [1, -1]) {
    const nm = s > 0 ? 'L' : 'R', x = s * (A.modW + 0.002), ry = s * PI / 2;
    lamp(`side${nm}F`, LENS.red, 0.225, 0.145, [8, 5], x, 2.52, 0.2, ry); lamp(`side${nm}R`, LENS.red, 0.225, 0.145, [8, 5], x, 2.52, -3.88, ry);
    lamp('scene' + nm, LENS.clear, 0.25, 0.11, [10, 4], x, 2.535, -1.84, ry, { glow: 0.9 });
    lamp('markA', LENS.amber, 0.09, 0.04, [4, 1], x, 0.6, 0.36, ry, { glow: 0.18 }); lamp('markR', LENS.red, 0.09, 0.04, [4, 1], x, 0.6, -4.05, ry, { glow: 0.18 });
    lamp('ind' + nm, LENS.amber, 0.1, 0.05, [4, 2], x, 1.5, -2.0, ry, { glow: 0.3 });
    for (const d of (s > 0 ? A.compL : A.compR)) {
      const [z0, z1, y0, y1] = d, yl = Math.min(y1 - 0.25, 1.52);
      B.rbox(SK.alu, 0.026, 0.014, z0 - z1 + 0.06, 0.005, x + s * 0.01, y1 + 0.028, (z0 + z1) / 2);                     // drip rail
      B.rbox(SK.under, 0.008, 0.12, 0.14, 0.003, x, yl, z1 + 0.11); B.rbox(SK.steel, 0.016, 0.08, 0.1, 0.006, x + s * 0.004, yl, z1 + 0.11);   // paddle latch
      for (const t of [0.15, 0.5, 0.85]) B.cyl(SK.steel, 0.008, 0.008, (y1 - y0) * 0.16, x + s * 0.006, lerp(y0, y1, t), z0 - 0.012, 'y', 6);   // hinge knuckles
    }
    // front face of the box, beside and above the cab
    lamp('upF' + nm, LENS.red, 0.225, 0.145, [8, 5], s * 0.95, 2.5, A.modF + 0.002, 0);
    lamp('markA', LENS.amber, 0.075, 0.035, [3, 1], s * 1.06, 2.635, A.modF + 0.002, 0, { glow: 0.16 });
    // rear face
    lamp('rearU' + nm, LENS.red, 0.225, 0.145, [8, 5], s * 0.95, 2.535, zR - 0.002, PI);
    lamp('sceneB', LENS.clear, 0.22, 0.1, [9, 4], s * 0.47, 2.56, zR - 0.002, PI, { glow: 0.8 });
    lamp('rearL' + nm, LENS.red, 0.17, 0.115, [6, 4], s * 0.945, 1.92, zR - 0.002, PI);
    lamp('tail', LENS.red, 0.16, 0.105, [6, 4], s * 0.945, 1.42, zR - 0.002, PI, { glow: 0.55 });
    lamp('ind' + nm, LENS.amber, 0.16, 0.105, [6, 4], s * 0.945, 1.285, zR - 0.002, PI);
    lamp('rev', LENS.clear, 0.16, 0.105, [6, 4], s * 0.945, 1.15, zR - 0.002, PI);
    B.rbox(SK.rubber, 0.11, 0.24, 0.075, 0.02, s * 1.03, 0.6, zR - 0.035);            // dock bumpers
    if (s < 0) for (const y of [0.8, 1.5, 2.2]) B.cyl(SK.steel, 0.012, 0.012, 0.12, -A.modW - 0.004, y, A.sideDoor[0] + 0.012, 'y', 8);
  }
  lamp('upFC', LENS.clear, 0.225, 0.145, [8, 5], 0, 2.5, A.modF + 0.002, 0);
  for (const x of [-0.16, 0, 0.16]) { lamp('markA', LENS.amber, 0.075, 0.035, [3, 1], x, 2.635, A.modF + 0.002, 0, { glow: 0.16 }); lamp('markR', LENS.red, 0.075, 0.035, [3, 1], x, 2.66, zR - 0.002, PI, { glow: 0.16 }); }
  lamp('rearUC', LENS.amber, 0.225, 0.11, [8, 4], 0, 2.555, zR - 0.002, PI);
  B.grp = 'sideDoor'; B.rbox(SK.under, 0.008, 0.12, 0.16, 0.003, -A.modW - 0.002, 1.3, -0.26); B.rbox(SK.steel, 0.016, 0.08, 0.12, 0.006, -A.modW - 0.006, 1.3, -0.26); B.grp = '';
  B.rbox(SK.alu, 0.026, 0.014, 0.86, 0.005, -A.modW - 0.012, 2.45, 0.01);
  // rear step bumper, threshold plate, plate
  B.rbox(SK.alu, 2.24, 0.055, 0.3, 0.012, 0, 0.42, -4.3); B.rbox(SK.under, 2.16, 0.2, 0.06, 0.012, 0, 0.3, -4.19);
  for (let k = 0; k < 9; k++) B.box(SK.steel, 2.16, 0.004, 0.012, 0, 0.449, -4.18 - k * 0.03);
  B.rbox(SK.alu, 1.34, 0.085, 0.016, 0.004, 0, 0.83, zR - 0.006);
  B.rbox(SK.black, 0.33, 0.18, 0.012, 0.004, 0, 0.61, zR - 0.012); B.at(0, 0.61, zR - 0.019, 0, PI, 0, () => B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0, dec.uv.plate0));
  lamp('plate', LENS.clear, 0.12, 0.018, null, 0, 0.72, zR - 0.004, PI, { rx: 0.9, bezel: SK.black, glow: 0 });

  // ---- light bar on the roof of the box: 8 modules forward, 8 back, one each end
  const barZ = 0.2, barY = A.modT + 0.045;
  B.rbox(SK.black, 1.72, 0.09, 0.2, 0.012, 0, barY + 0.055, barZ); B.rbox(SK.gloss, 1.8, 0.022, 0.32, 0.01, 0, barY + 0.112, barZ); B.rbox(SK.alu, 1.78, 0.018, 0.3, 0.006, 0, barY + 0.005, barZ);
  for (const s of [1, -1]) { B.rbox(SK.under, 0.12, 0.05, 0.36, 0.01, s * 0.62, barY - 0.02, barZ); B.rbox(SK.gloss, 0.03, 0.1, 0.3, 0.012, s * 0.895, barY + 0.058, barZ); }
  const fr = [['barFLo', 'red'], ['barFLo', 'red'], ['barFWL', 'clear'], ['barFLi', 'red'], ['barFRi', 'red'], ['barFWR', 'clear'], ['barFRo', 'red'], ['barFRo', 'red']];
  const rr = [['barRLo', 'red'], ['barRLo', 'red'], ['barRAL', 'amber'], ['barRLi', 'red'], ['barRRi', 'red'], ['barRAR', 'amber'], ['barRRo', 'red'], ['barRRo', 'red']];
  for (let k = 0; k < 8; k++) {
    const x = 0.7525 - k * 0.215;
    lamp(fr[k][0], LENS[fr[k][1]], 0.2, 0.072, [6, 2], x, barY + 0.058, barZ + 0.1, 0, { bezel: null, d: 0.1, glow: 0.62, gain: 0.055 });
    lamp(rr[k][0], LENS[rr[k][1]], 0.2, 0.072, [6, 2], x, barY + 0.058, barZ - 0.1, PI, { bezel: null, d: 0.1, glow: 0.62, gain: 0.055 });
  }
  lamp('barEL', LENS.red, 0.19, 0.072, [6, 2], 0.865, barY + 0.058, barZ, PI / 2, { bezel: null, d: 0.06, glow: 0.62, gain: 0.055 }); lamp('barER', LENS.red, 0.19, 0.072, [6, 2], -0.865, barY + 0.058, barZ, -PI / 2, { bezel: null, d: 0.06, glow: 0.62, gain: 0.055 });
  // roof furniture
  B.rbox(SK.white, 0.42, 0.07, 0.42, 0.025, 0, A.modT + 0.06, -3.3);
  for (const [x, z, h] of [[0.5, -0.9, 0.55], [-0.45, -1.3, 0.38]]) { B.cyl(SK.black, 0.022, 0.014, 0.05, x, A.modT + 0.05, z, 'y', 8); B.tube(SK.black, [[x, A.modT + 0.07, z], [x, A.modT + 0.07 + h, z - 0.02]], 0.004, 4); }

  // ---- wipers (one shared mesh, hinged at the origin; arm along +X in the glass plane)
  B.grp = 'wiper'; B.tube(SK.black, [[0, 0, 0.02], [0.3, 0, 0.038], [0.5, 0, 0.03]], 0.007, 5); B.rbox(SK.black, 0.05, 0.04, 0.03, 0.01, 0, 0, 0.015); B.rbox(SK.rubber, 0.56, 0.016, 0.024, 0.005, 0.47, 0, 0.016); B.grp = '';

  // ---- chassis and running gear
  for (const s of [1, -1]) { B.box(SK.under, 0.08, 0.2, 6.3, s * 0.43, 0.56, -0.95); B.rbox(SK.iron, 0.07, 0.03, 1.3, 0.008, s * 0.6, 0.47, A.zR); }
  B.rbox(SK.under, 1.0, 0.5, 1.15, 0.05, 0, 0.62, A.zF); B.rbox(SK.under, 0.72, 0.36, 1.2, 0.08, 0, 0.5, 1.2); B.box(SK.under, 1.02, 0.5, 1.2, 0, 0.66, A.zR);
  B.cyl(SK.iron, 0.07, 0.07, 1.86, 0, A.R, A.zR, 'x', 10); B.ball(SK.iron, 0.2, 0.19, 0.2, 0, A.R, A.zR, 12);
  B.cyl(SK.iron, 0.045, 0.045, 2.6, 0, 0.44, -0.7, 'z', 8); B.rbox(SK.iron, 1.6, 0.08, 0.1, 0.02, 0, 0.33, A.zF);
  B.rbox(SK.under, 0.8, 0.3, 0.95, 0.06, 0, 0.5, -3.25);
  B.tube(SK.iron, [[-0.3, 0.42, 1.3], [-0.42, 0.36, 0.2], [-0.45, 0.36, -1.5], [-0.45, 0.5, -2.0], [-0.6, 0.38, -2.6], [-1.12, 0.36, -2.78]], 0.038, 8);
  B.cyl(SK.iron, 0.11, 0.11, 0.75, -0.44, 0.36, -0.75, 'z', 12);

  // ---- patient compartment as seen through the doors and windows (walls and ceiling are the box's inner shell)
  const iw = A.modW - 0.06, fy = A.floor, SKF = surf([0.2, 0.21, 0.22], 0.5), SKC = surf([0.05, 0.075, 0.13], 0.5), SKY = surf(0xd9b400, 0.35);
  B.box(SKF, iw * 2, 0.05, A.modF - zR - 0.1, 0, fy - 0.025, (A.modF + zR) / 2);
  B.at(0, 0, A.modF - 0.058, 0, PI, 0, () => { B.plane(SK.whiteGloss, iw * 2, A.modT - fy, 0, (A.modT + fy) / 2, 0); B.plane(SK.gloss, 0.5, 0.4, 0.1, 1.75, 0.004); });
  B.rbox(SK.whiteGloss, 0.42, 1.74, 2.3, 0.02, iw - 0.21, fy + 0.87, -1.0);                              // street-side cabinet wall
  for (let k = 0; k < 3; k++) B.rbox(surf([0.25, 0.3, 0.34], 0.08), 0.01, 0.42, 0.66, 0.004, iw - 0.425, 2.28, -0.3 - k * 0.72);
  B.rbox(SKC, 0.46, 0.1, 0.5, 0.03, iw - 0.3, fy + 0.5, -2.45); B.rbox(SKC, 0.1, 0.5, 0.5, 0.03, iw - 0.08, fy + 0.8, -2.45);     // CPR seat
  B.rbox(SK.whiteGloss, 0.5, 0.42, 2.1, 0.02, -iw + 0.25, fy + 0.21, -2.3); B.rbox(SKC, 0.5, 0.09, 2.06, 0.03, -iw + 0.25, fy + 0.46, -2.3); B.rbox(SKC, 0.09, 0.42, 2.06, 0.03, -iw + 0.06, fy + 0.75, -2.3);   // squad bench
  B.rbox(SK.whiteGloss, 0.36, 0.5, 2.1, 0.02, -iw + 0.18, 2.36, -2.3);
  B.rbox(SKC, 0.5, 0.1, 0.5, 0.04, 0.1, fy + 0.5, 0.05); B.rbox(SKC, 0.5, 0.62, 0.1, 0.04, 0.1, fy + 0.85, 0.3);                // attendant seat
  B.rbox(SK.iron, 0.52, 0.06, 1.95, 0.02, 0.02, fy + 0.5, -2.1); B.rbox(SKC, 0.54, 0.09, 1.9, 0.035, 0.02, fy + 0.6, -2.1);     // cot
  for (const z of [-1.3, -2.9]) for (const x of [-0.2, 0.24]) B.cyl(SK.iron, 0.015, 0.015, 0.5, x, fy + 0.25, z, 'y', 6);
  B.tube(SKY, [[0.05, A.modT - 0.1, -0.2], [0.05, A.modT - 0.16, -0.3], [0.05, A.modT - 0.16, -3.6], [0.05, A.modT - 0.1, -3.7]], 0.016, 8);
  for (const z of [-0.5, -1.6, -2.7, -3.6]) for (const x of [-0.5, 0.5]) { B.rbox(lens(chan('interior'), g3(0.75), [6, 6]), 0.2, 0.012, 0.2, 0.004, x, A.modT - 0.04, z); }

  // ---- cab interior: its own builder and group (`cab`), in materials that rain never wets
  const C = new Builder({ seg: 3, single: sk => sk.mat.startsWith('tex') ? sk.mat : 'dry' }), cs = drawCabSheet(), eye = [0.44, 1.82, 1.0];
  const T = SK.trim, TD = SK.trimDark, zb = x => 2.02 + 0.11 * (1 - (x / gx) ** 2), onDash = (x, y, fn) => { const a = y > 1.12 ? lerp(0.44, 0.47, (y - 1.12) / 0.28) : lerp(0.38, 0.44, (y - 0.98) / 0.14), z = zb(x) + 0.008 - a; C.face(x, y, z, x, y + 0.22, z - 1, fn); };
  C.box(TD, 1.86, 0.04, 1.5, 0, 0.72, 1.28);                                                              // floor mat
  C.at(0, 0, 0.585, () => { C.plane(T, 1.9, 1.5, 0, 1.4, 0); C.rbox(TD, 0.62, 0.46, 0.012, 0.004, 0, 1.62, 0.002); C.rbox(SK.gloss, 0.56, 0.4, 0.012, 0.004, 0, 1.62, 0.006); });   // back wall with the pass-through
  C.at(0, 0, 2.0, 0, PI, 0, () => C.plane(TD, 1.9, 0.5, 0, 0.92, 0));                                      // firewall
  // dashboard: one section swept along the base of the windscreen
  C.sweep(TD, range(0, 1, 14).map(t => { const x = lerp(0.93, -0.93, t); return [x, 0, zb(x) + 0.012]; }), [{ a: 0, b: 1.425, r: 0.01 }, { a: 0.4, b: 1.45, r: 0.04 }, { a: 0.47, b: 1.4, r: 0.03 }, { a: 0.44, b: 1.12, r: 0.03 }, { a: 0.38, b: 0.98, r: 0.05 }, { a: 0.2, b: 0.86, r: 0.03 }, { a: 0, b: 0.86, r: 0.01 }], { seg: 3 });
  onDash(-0.1, 1.215, () => C.rbox(T, 1.5, 0.11, 0.008, 0.003));                                          // lighter insert band
  // instrument binnacle
  const pc = [0.44, 1.315, zb(0.44) - 0.475];
  C.face(...pc, ...eye, () => { C.rbox(TD, 0.43, 0.19, 0.02, 0.006, 0, 0, -0.012); C.plane(SK_CAB, 0.38, 0.1425, 0, 0, 0, cs.uv.cluster); C.rbox(TD, 0.46, 0.03, 0.11, 0.012, 0, 0.098, 0.045); for (const s of [1, -1]) C.rbox(TD, 0.025, 0.2, 0.09, 0.01, s * 0.222, 0.005, 0.035); });
  C.grp = 'needle'; C.box(lens(chan('gauge'), lin(0xff5a1a)), 0.0035, 0.052, 0.002, 0, 0.02, 0.004); C.cyl(SK.gloss, 0.008, 0.008, 0.006, 0, 0, 0.004, 'z', 8); C.grp = '';
  // steering wheel (group `wheel`: rim in its XY plane, +Z towards the driver), column and stalks
  const pw = [0.44, 1.3, 1.5], wn = [0, 0.42, -0.908];
  C.grp = 'wheel'; C.tube(TD, range(0, 1, 28).slice(0, -1).map(t => [Math.cos(t * TAU) * 0.19, Math.sin(t * TAU) * 0.19, 0]), 0.0165, 8, { loop: true, up: [0, 0, 1] });
  C.rbox(TD, 0.17, 0.12, 0.055, 0.03, 0, -0.005, -0.022); for (const a of [14, 166, -42, -138]) C.at(0, 0, -0.014, 0, 0, rad(a), () => C.rbox(TD, 0.18, 0.034, 0.022, 0.01, 0.1, 0, 0)); C.grp = '';
  C.tube(TD, [[pw[0], pw[1] - wn[1] * 0.03, pw[2] - wn[2] * 0.03], [pw[0], pw[1] - wn[1] * 0.36, pw[2] - wn[2] * 0.36]], 0.036, 8);
  for (const s of [1, -1]) C.tube(TD, [[0.44 + s * 0.03, 1.262, 1.585], [0.44 + s * 0.17, 1.275, 1.56]], 0.009, 5);
  C.tube(TD, [[0.4, 1.27, 1.6], [0.3, 1.36, 1.56], [0.27, 1.4, 1.54]], 0.008, 5); C.ball(TD, 0.02, 0.02, 0.02, 0.265, 1.405, 1.538, 8);     // column shifter
  // engine cover and the equipment console between the seats
  C.rbox(T, 0.6, 0.5, 0.72, 0.08, 0, 0.95, 1.72); C.rbox(TD, 0.36, 0.36, 0.66, 0.03, 0, 0.94, 1.1);
  C.face(0, 1.2, 1.36, 0.22, 2.1, 0.7, () => { C.rbox(TD, 0.21, 0.135, 0.07, 0.008, 0, 0, -0.036); C.plane(SK_CAB, 0.19, 0.116, 0, 0, 0.001, cs.uv.siren); });
  C.face(0, 1.137, 1.19, 0.15, 2.1, 0.9, () => { C.rbox(TD, 0.2, 0.068, 0.03, 0.006, 0, 0, -0.016); C.plane(SK_CAB, 0.19, 0.0576, 0, 0, 0.001, cs.uv.radio); });
  C.face(0, 1.128, 1.08, 0.1, 2.1, 0.9, () => { C.rbox(TD, 0.2, 0.074, 0.02, 0.006, 0, 0, -0.011); C.plane(SK_CAB, 0.19, 0.0633, 0, 0, 0.001, cs.uv.switch); });
  C.rbox(TD, 0.045, 0.075, 0.03, 0.008, 0.2, 1.06, 1.3); C.tube(TD, [[0.2, 1.03, 1.3], [0.22, 0.93, 1.26], [0.19, 0.9, 1.18], [0.17, 0.98, 1.1]], 0.005, 4);      // radio microphone and cord
  for (const x of [-0.08, 0.08]) C.cyl(SK.gloss, 0.04, 0.04, 0.008, x, 1.124, 0.88, 'y', 12);              // cup holders
  // mobile data terminal on its pedestal, angled at the driver
  const pm = [-0.16, 1.57, 1.6];
  C.tube(TD, [[-0.21, 1.1, 1.4], [-0.21, 1.36, 1.5], [-0.17, 1.44, 1.57]], 0.014, 6);
  C.face(...pm, ...eye, () => { C.rbox(TD, 0.34, 0.226, 0.02, 0.008, 0, 0, -0.011); C.plane(SK_MDT, 0.31, 0.194, 0, 0, 0.001); });
  C.face(pm[0], 1.445, 1.54, 0.2, 2.6, 1.0, () => { C.rbox(TD, 0.33, 0.2, 0.02, 0.006, 0, 0, -0.01); C.rbox(T, 0.29, 0.1, 0.004, 0.002, 0, 0.03, 0.001); });
  // centre stack, vents, glovebox, pedals
  onDash(-0.1, 1.335, () => { for (const x of [-0.11, 0.11]) { C.rbox(SK.gloss, 0.15, 0.07, 0.01, 0.004, x, 0, 0); for (const y of [-0.018, 0, 0.018]) C.box(T, 0.14, 0.005, 0.018, x, y, 0.004); } });
  onDash(-0.1, 1.215, () => C.plane(SK_CAB, 0.2, 0.069, 0, 0, 0.006, cs.uv.stereo)); onDash(-0.1, 1.07, () => C.plane(SK_CAB, 0.2, 0.0897, 0, 0, 0.002, cs.uv.hvac));
  for (const x of [0.83, -0.83]) onDash(x, 1.33, () => { C.rbox(SK.gloss, 0.13, 0.07, 0.01, 0.004); for (const y of [-0.018, 0, 0.018]) C.box(T, 0.12, 0.005, 0.018, 0, y, 0.004); });
  onDash(-0.55, 1.07, () => { C.rbox(T, 0.44, 0.17, 0.008, 0.004); C.rbox(TD, 0.06, 0.02, 0.012, 0.004, 0, 0.06, 0.004); });
  C.at(0.56, 0.86, 1.9, -0.5, 0, 0, () => C.rbox(TD, 0.06, 0.13, 0.02, 0.008)); C.at(0.4, 0.88, 1.88, -0.4, 0, 0, () => C.rbox(TD, 0.11, 0.08, 0.02, 0.008));
  // seats
  for (const s of [1, -1]) {
    const x = s * 0.44;
    C.rbox(TD, 0.42, 0.28, 0.44, 0.03, x, 0.86, 1.0); C.rbox(SK.vinyl, 0.5, 0.13, 0.5, 0.05, x, 1.045, 1.0);
    C.at(x, 1.42, 0.735, -0.12, 0, 0, () => { C.rbox(SK.vinyl, 0.5, 0.66, 0.13, 0.05); C.rbox(SK.vinyl, 0.27, 0.19, 0.1, 0.04, 0, 0.44, 0.012); for (const b of [1, -1]) C.rbox(SK.vinyl, 0.07, 0.5, 0.1, 0.03, b * 0.23, -0.04, 0.05); });
    C.rbox(SK.vinyl, 0.07, 0.05, 0.3, 0.02, x - s * 0.28, 1.25, 0.92);
    C.tube(surf(g3(0.03), 0.9), [[s * 0.905, 1.95, 0.72], [s * 0.72, 1.5, 0.82], [x - s * 0.24, 1.08, 0.9]], 0.012, 4);
    // door furniture (the left side hinges with the door)
    C.grp = s > 0 ? 'doorL' : '';
    C.rbox(TD, 0.08, 0.06, 0.62, 0.02, s * 0.885, 1.16, 1.3); C.rbox(T, 0.03, 0.17, 0.95, 0.012, s * 0.912, 1.33, 1.33); C.rbox(TD, 0.05, 0.16, 0.7, 0.02, s * 0.9, 0.86, 1.3);
    C.cyl(SK.gloss, 0.08, 0.08, 0.012, s * 0.922, 0.98, 1.72, 'x', 14); C.rbox(SK.chrome, 0.012, 0.03, 0.09, 0.005, s * 0.916, 1.3, 1.64); C.rbox(SK.gloss, 0.012, 0.03, 0.14, 0.004, s * 0.845, 1.192, 1.42);
    C.grp = '';
    C.at(s * 0.42, 1.985, 1.3, 1.36, 0, 0, () => C.rbox(SK.headliner, 0.44, 0.16, 0.022, 0.008));       // sun visors
  }
  C.tube(TD, [[-0.905, 1.62, 1.72], [-0.87, 1.7, 1.63], [-0.89, 1.8, 1.53]], 0.011, 5);                   // grab handle
  C.rbox(lens(chan('cabDome'), g3(0.7)), 0.14, 0.012, 0.08, 0.004, 0, 2.052, 1.0);
  // MDT screen the game draws on (512 x 320)
  const mdtCanvas = makeCanvas(512, 320), mx = mdtCanvas.getContext('2d');
  mx.fillStyle = '#0b1622'; mx.fillRect(0, 0, 512, 320); mx.strokeStyle = '#1d3a52'; mx.lineWidth = 1; for (let i = 0; i < 12; i++) { mx.beginPath(); mx.moveTo(i * 46, 40); mx.lineTo(i * 46 + 60, 320); mx.stroke(); mx.beginPath(); mx.moveTo(0, 60 + i * 30); mx.lineTo(512, 40 + i * 34); mx.stroke(); }
  mx.fillStyle = '#12283a'; mx.fillRect(0, 0, 512, 34); mx.fillStyle = '#cfe6f7'; mx.font = FONT(18, 700); mx.textBaseline = 'middle'; mx.fillText('KETTER COUNTY CAD', 12, 18); mx.textAlign = 'right'; mx.fillText('MEDIC 14  AVAILABLE', 500, 18);
  const mdtTexture = canvasTex(mdtCanvas, { wrap: false, mip: false, aniso: 4 });
  const cabTexMat = new THREE.MeshStandardMaterial({ map: cs.tex, emissiveMap: cs.tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  const mdtMat = new THREE.MeshStandardMaterial({ map: mdtTexture, emissiveMap: mdtTexture, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.25 });
  const cabSurf = makeSurfMat({ lamps, wet: false });

  // ---- materials, meshes, hierarchy
  const map = canvasTex(drawAmbLivery(S), { wrap: false, aniso: 16 }), grime = canvasTex(drawAmbGrime(seed), { srgb: false, wrap: false });
  const paintMat = makePaintMat({ map, grime }), surfMat = makeSurfMat({ lamps }), glassMat = makeGlassMat();
  const mats = { paint: paintMat, surf: surfMat, glass: glassMat, tex: dec.mat, dry: cabSurf };
  const pivots = { doorL: [A.cabW, 0, A.cabDoor[0]], rearL: [rd.x, 0, zR], rearR: [-rd.x, 0, zR], sideDoor: [-A.modW, 0, A.sideDoor[0]] };
  const parts = B.build(mats, pivots);
  const group = new THREE.Group(), body = new THREE.Group(); group.name = 'ambulance'; body.name = 'body'; group.add(body);
  for (const m of parts['']) body.add(m);
  const hinge = {};
  for (const k of Object.keys(pivots)) { const h = hinge[k] = new THREE.Group(); h.name = k; h.position.fromArray(pivots[k]); for (const m of parts[k] || []) h.add(m); body.add(h); }
  const glow = makeGlow(lamps, glows); body.add(glow);
  const crack = new THREE.Group(); crack.visible = false; for (const m of parts.crack) crack.add(m); body.add(crack);
  const cab = new THREE.Group(), cparts = C.build({ dry: cabSurf, texcab: cabTexMat, texmdt: mdtMat }, { doorL: pivots.doorL }, { shadow: false }); cab.name = 'cab'; body.add(cab);
  for (const m of cparts['']) cab.add(m); for (const m of cparts.doorL || []) hinge.doorL.add(m);
  const wheel = new THREE.Group(), wheelHolder = new THREE.Group(); wheelHolder.applyMatrix4(faceMatrix(...pw, pw[0] + wn[0], pw[1] + wn[1], pw[2] + wn[2])); for (const m of cparts.wheel) wheel.add(m); wheelHolder.add(wheel); cab.add(wheelHolder);
  const clusterM = faceMatrix(...pc, ...eye), needles = [-0.0897, 0.0897].map(x => { const h = new THREE.Group(), nd = new THREE.Group(); h.applyMatrix4(clusterM); nd.position.set(x, -0.0016, 0.002); for (const m of cparts.needle) nd.add(m.clone()); h.add(nd); cab.add(h); return nd; });
  const gauges = { setSpeed(kmh) { needles[0].rotation.z = rad(135 - 270 * clamp(kmh / 200)); }, setRpm(v) { needles[1].rotation.z = rad(135 - 270 * clamp(v)); } };
  gauges.setSpeed(0); gauges.setRpm(0.14);
  // wipers: holder aligned with the glass (local Z = glass normal, local X towards the passenger side), arm swings about Z
  const wipers = [], gn = new THREE.Vector3(0, 0.713, 0.701).normalize(), bx = new THREE.Vector3(-1, 0, 0), by = new THREE.Vector3().crossVectors(gn, bx);
  for (const p of [[0.6, A.belt + 0.03, 2.085], [-0.1, A.belt + 0.03, 2.14]]) {
    const h = new THREE.Group(); h.position.fromArray(p); h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, gn));
    const arm = new THREE.Group(); for (const m of parts.wiper) arm.add(m.clone()); h.add(arm); body.add(h); wipers.push(arm);
  }
  // wheels
  const wspec = { R: A.R, W: A.tyreW, rimR: A.rimR, seg: 40, lugs: 8 }, wheels = [], steer = [];
  for (const s of [1, -1]) { const p = new THREE.Group(); p.position.set(s * A.trackF, A.R, A.zF); const w = makeWheel(surfMat, { ...wspec, style: 'front' }, s); p.add(w); group.add(p); steer.push(p); wheels.push(w); }
  for (const s of [1, -1]) { const w = makeWheel(surfMat, { ...wspec, style: 'rear' }, s, A.dualGap); w.position.set(s * A.dualOut, A.R, A.zR); group.add(w); wheels.push(w); }

  // anchors: +Z of each marker is the way its light points
  const anchors = {}, anchor = (n, x, y, z, ry = 0, rx = 0) => { const o = anchors[n] = new THREE.Object3D(); o.name = n; o.position.set(x, y, z); o.rotation.set(rx, ry, 0, 'YXZ'); body.add(o); };
  anchor('headL', 0.7, 1.0, zf + 0.06); anchor('headR', -0.7, 1.0, zf + 0.06); anchor('tailL', 0.945, 1.42, zR - 0.05, PI); anchor('tailR', -0.945, 1.42, zR - 0.05, PI);
  anchor('barL', 0.6, barY + 0.2, barZ); anchor('barR', -0.6, barY + 0.2, barZ); anchor('barC', 0, barY + 0.25, barZ);
  anchor('sceneL', A.modW + 0.05, 2.535, -1.84, PI / 2, 0.5); anchor('sceneR', -A.modW - 0.05, 2.535, -1.84, -PI / 2, 0.5); anchor('sceneRear', 0, 2.56, zR - 0.05, PI, 0.6);
  anchor('rearStep', 0, 0.45, -4.3, PI); anchor('sideDoor', -A.modW - 0.4, 0, 0.01, -PI / 2); anchor('exhaust', -1.14, 0.36, -2.78, -PI / 2);
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.set(0.44, 1.82, 1.0); body.add(seat);

  // ---- lights
  const st = { head: 0, brake: false, rev: false, indL: false, indR: false, interior: false, scene: false, emergency: false, wipers: false, wipe: 0, dmg: 0 };
  const setC = (n, c, k) => { const i = CHN[n]; if (i) { lamps[i * 3] = c[0] * k; lamps[i * 3 + 1] = c[1] * k; lamps[i * 3 + 2] = c[2] * k; } };
  const lights = {
    strobe: new THREE.Color(0, 0, 0), strobeL: new THREE.Color(0, 0, 0), strobeR: new THREE.Color(0, 0, 0), state: st, channels: CHN, lamps,
    setHead(m) { st.head = m | 0; }, setBrake(on) { st.brake = !!on; }, setReverse(on) { st.rev = !!on; }, setIndicators(l, r) { st.indL = !!l; st.indR = !!r; },
    setInterior(on) { st.interior = !!on; }, setSceneLights(on) { st.scene = !!on; }, setEmergency(on) { st.emergency = !!on; },
    update(dt, t) {
      const h = st.head, blink = (t * 1.5) % 1 < 0.5 ? 1 : 0, crack = st.dmg > 0.35 ? 0.12 : 1;
      setC('headL', E_WHT, h ? 7 : 0); setC('headR', E_WHT, h ? 7 * crack : 0); setC('mainL', E_WHT, h === 2 ? 9 : h ? 0.4 : 0); setC('mainR', E_WHT, (h === 2 ? 9 : h ? 0.4 : 0) * crack);
      setC('markA', E_AMB, h ? 2.2 : 0); setC('markR', E_RED, h ? 2 : 0); setC('tail', E_RED, (h ? 1.2 : 0) + (st.brake ? 6 : 0)); setC('rev', E_WHT, st.rev ? 5 : 0); setC('plate', E_WHT, h ? 1.6 : 0);
      setC('indL', E_AMB, st.indL && blink ? 6 : 0); setC('indR', E_AMB, st.indR && blink ? 6 : 0);
      setC('interior', E_COOL, st.interior ? 3.5 : 0); setC('cabDome', E_WHT, st.interior ? 2 : 0); setC('gauge', [1, 0.3, 0.08], 1.6); for (const n of ['sceneL', 'sceneR', 'sceneB']) setC(n, E_COOL, st.scene ? 7 : 0);
      const S0 = lights.strobe.setRGB(0, 0, 0), SL = lights.strobeL.setRGB(0, 0, 0), SR = lights.strobeR.setRGB(0, 0, 0);
      for (const [n, c, side, per, ph, nf, w] of EMERGENCY) {
        const v = st.emergency ? burst(t, per, ph, nf) : 0; setC(n, c, v * 7);
        if (v) { S0.r += c[0] * w; S0.g += c[1] * w; S0.b += c[2] * w; const T = side > 0 ? SL : side < 0 ? SR : null; if (T) { T.r += c[0] * w; T.g += c[1] * w; T.b += c[2] * w; } else { SL.r += c[0] * w * 0.5; SL.g += c[1] * w * 0.5; SL.b += c[2] * w * 0.5; SR.r += c[0] * w * 0.5; SR.g += c[1] * w * 0.5; SR.b += c[2] * w * 0.5; } }
      }
      S0.multiplyScalar(0.4); SL.multiplyScalar(0.5); SR.multiplyScalar(0.5);
      // wipers finish their stroke before parking
      if (st.wipers || st.wipe > 0) { st.wipe += dt / 1.25; if (st.wipe >= 1) st.wipe = st.wipers ? st.wipe - 1 : 0; }
      const a = -(0.5 - 0.5 * Math.cos(st.wipe * TAU)) * 1.55; for (const w of wipers) w.rotation.z = a;
      cabU?.(dt, t);
    },
  };
  let cabU = null;
  const doors = {
    setRear(t) { hinge.rearL.rotation.y = -t * 1.85; hinge.rearR.rotation.y = t * 1.85; }, setSide(t) { hinge.sideDoor.rotation.y = t * 1.45; }, setDriver(t) { hinge.doorL.rotation.y = -t * 1.15; },
  };
  const out = {
    group, body, wheels, steer, seat, anchors, lights, doors, hinge, cab, gauges, wheel, mdtCanvas, mdtTexture,
    dims: { length: 7.3, width: 2.4, height: 2.9, wheelbase: 4.0, track: A.trackF * 2, frontOverhang: 0.86, rearOverhang: 2.45, wheelRadius: A.R, mass: 6200, cgHeight: 1.05 },
    setWipers(on) { st.wipers = !!on; }, setDirt(v) { paintMat.userData.u.uDirt.value = clamp(v); }, setDamage(v) { st.dmg = clamp(v); paintMat.userData.u.uDamage.value = st.dmg; crack.visible = st.dmg > 0.35; },
    materials: mats, tris: B.tris(),
  };
  lights.update(0, 0);
  return out;
}

// ---------------------------------------------------------------------------------------------- traffic

export const CAR_TYPES = ['sedan', 'hatch', 'suv', 'pickup', 'van', 'wagon', 'bus', 'boxtruck', 'police', 'engine'];
// Paint colours weighted the way a real car park is: mostly white, black, grey and silver.
const COLOR_WEIGHTS = [[0xdcdcd8, 22], [0x0b0b0d, 18], [0x5d6064, 15], [0xa9acb0, 13], [0x1b3562, 8], [0x7d1216, 7], [0x26292d, 6], [0x4a3c2b, 2], [0x1f3a27, 2], [0xb5a67f, 2], [0x34618f, 2], [0xb8611a, 1], [0x4f0d17, 2]];
export const CAR_COLORS = COLOR_WEIGHTS.flatMap(([c, w]) => Array(w).fill(c));

// Shapes. Lengths in metres; z positions derive from wheelbase (wb), front overhang (fo) and: cowl = windscreen base
// relative to the front axle, wsRun / rearRun = horizontal run of the front / rear glass, deckLen = boot or bed length,
// cabEnd = trucks only, cab length behind the cowl. pillars = where the side glass is split (0..1 along the cabin).
// cr / nr = plan-view corner radius and depth of the nose rounding, tumble = roof width over body width.
const SEDAN = { L: 4.75, W: 1.86, H: 1.45, wb: 2.82, fo: 0.92, R: 0.34, tw: 0.225, rimR: 0.245, gc: 0.15, cowl: -0.42, bonH: 1.04, noseH: 0.8, belt: 1.0, wsRun: 0.92, deckLen: 0.42, deck: 1.1, rearRun: 0.92, tumble: 0.71, pillars: [0.5], rp: 0.16, mass: 1500, wheel: 'alloy' };
const CAR_SPECS = {
  sedan: SEDAN,
  hatch: { ...SEDAN, L: 4.3, W: 1.8, H: 1.47, wb: 2.62, fo: 0.88, R: 0.325, tw: 0.205, rimR: 0.23, cowl: -0.4, bonH: 1.03, belt: 1.0, wsRun: 0.85, deckLen: 0.1, deck: 1.05, rearRun: 0.5, tumble: 0.73, mass: 1250 },
  suv: { ...SEDAN, L: 4.7, W: 1.92, H: 1.68, wb: 2.75, fo: 0.92, R: 0.375, tw: 0.235, rimR: 0.255, gc: 0.2, cowl: -0.4, bonH: 1.19, noseH: 0.96, belt: 1.16, wsRun: 0.75, deckLen: 0.08, deck: 1.2, rearRun: 0.42, tumble: 0.76, pillars: [0.42, 0.76], rp: 0.13, clad: true, rails: true, mass: 1900, nr: 0.2 },
  wagon: { ...SEDAN, L: 4.82, deckLen: 0.08, deck: 1.05, rearRun: 0.5, pillars: [0.42, 0.76], rp: 0.12, rails: true, mass: 1600 },
  pickup: { ...SEDAN, L: 5.75, W: 2.03, H: 1.93, wb: 3.65, fo: 0.97, R: 0.415, tw: 0.265, rimR: 0.255, gc: 0.25, cowl: -0.36, bonH: 1.34, noseH: 1.2, belt: 1.3, wsRun: 0.56, deckLen: 1.8, deck: 1.33, rearRun: 0.06, tumble: 0.8, pillars: [0.52], rp: 0.14, bed: true, mass: 2400, spokes: 6, taperF: 0.03, taperR: 0.01, sh: 0.1, clad: true, cr: 0.3, nr: 0.1, tailR: 0.04, flare: 0.045 },
  van: { ...SEDAN, L: 5.6, W: 2.03, H: 2.35, wb: 3.4, fo: 1.0, R: 0.36, tw: 0.225, rimR: 0.225, gc: 0.19, cowl: 0.22, bonH: 1.26, noseH: 0.98, belt: 1.26, wsRun: 0.78, deckLen: 0.06, deck: 1.26, rearRun: 0.06, tumble: 0.88, pillars: [0.22], rp: 0.1, solidFrom: 1, rearGlass: false, mass: 2600, wheel: 'cap', taperF: 0.03, taperR: 0.01, clad: true, cr: 0.36, nr: 0.16, tailR: 0.05, boxLamps: true },
  bus: { ...SEDAN, L: 12, W: 2.55, H: 3.05, wb: 6, fo: 2.7, R: 0.5, tw: 0.3, rimR: 0.3, gc: 0.3, cowl: 2.56, bonH: 1.08, noseH: 1.05, belt: 1.08, wsRun: 0.16, deckLen: 0.08, deck: 1.08, rearRun: 0.05, tumble: 0.97, pillars: [0.115, 0.24, 0.365, 0.49, 0.615, 0.74, 0.865], rp: 0.35, winTop: 2.2, mass: 12000, wheel: 'cap', taperF: 0.02, taperR: 0.01, cr: 0.2, nr: 0.1, tailR: 0.06, wsBow: 0.06, clad: true, color: 0xd9dbd6, boxLamps: true, flare: 0, bulge: 0.01, sh: 0.06 },
  boxtruck: { ...SEDAN, L: 7.6, W: 2.4, cabW: 2.1, H: 3.3, cabH: 2.2, wb: 4.3, fo: 1.05, R: 0.42, tw: 0.25, rimR: 0.26, gc: 0.28, cowl: 0.2, bonH: 1.36, noseH: 1.06, belt: 1.36, wsRun: 0.5, cabEnd: 1.65, deckLen: 0.04, deck: 1.36, rearRun: 0.04, tumble: 0.9, pillars: [0.6], rp: 0.1, solidFrom: 1, rearGlass: false, mass: 6500, wheel: 'cap', taperF: 0.03, clad: true, color: 0xd9dbd6, cr: 0.3, nr: 0.14, boxLamps: true },
  police: { ...SEDAN, L: 4.95, W: 1.92, H: 1.47, wb: 2.9, bonH: 1.06, belt: 1.02, deck: 1.12, mass: 1900, wheel: 'cap', color: 0x0c0d10, doorSkin: true },
  engine: { ...SEDAN, L: 9.2, W: 2.5, H: 3.1, cabH: 2.85, wb: 4.7, fo: 2.15, R: 0.52, tw: 0.3, rimR: 0.3, gc: 0.32, cowl: 2.0, bonH: 1.5, noseH: 1.44, belt: 1.5, wsRun: 0.22, cabEnd: 2.5, deckLen: 0.04, deck: 1.5, rearRun: 0.04, tumble: 0.95, pillars: [0.5], rp: 0.12, winTop: 2.42, rearGlass: false, mass: 16000, wheel: 'cap', taperF: 0.02, cr: 0.14, nr: 0.08, wsBow: 0.04, color: 0x8e1512, boxLamps: true, flare: 0, bulge: 0.01, sh: 0.06 },
};
// far and traffic glass: dark, mirror-like, so it picks up the sky instead of reading as black paint
const SK_DGLASS = surf([0.13, 0.155, 0.18], 0.05, 0.9), SK_SEAT = surf([0.045, 0.045, 0.05], 0.85), SK_GOLD = surf(0xc9a227, 0.35, 0.6), SK_PWHITE = surf(g3(0.72), 0.2);
const E_BLUE = [0.05, 0.16, 1];
const carCache = new Map();

function wheelGeo(spec, side, dual = 0) {
  const B = new Builder({ single: () => 'surf' });
  if (side < 0) { B.M.makeScale(-1, 1, 1); B.neg = true; }
  wheelInto(B, spec); if (dual) B.at(-dual, 0, 0, () => wheelInto(B, { ...spec, style: 'cap', lugs: 0 }));
  return B.build({ surf: _phMat })[''][0].geometry;
}
const _phMat = new THREE.MeshBasicMaterial();

// Builds (and caches) the geometry of one car type at one level of detail.
function carBuild(type, lod) {
  const key = type + lod; if (carCache.has(key)) return carCache.get(key);
  const sp = CAR_SPECS[type], hero = lod === 0, far = lod === 2, seg = [6, 4, 1][lod], PI = Math.PI;
  const B = new Builder({ seg, single: sk => sk.mat === 'glass' ? 'glass' : 'surf' }), GL = hero ? SK.glass : SK_DGLASS, dec = decalSheet(), glows = [];
  if (!hero) { const rb = B.rbox.bind(B); B.rbox = (sk, w, h, d, r, ...a) => rb(sk, w, h, d, 0, ...a); }   // bevels only on the hero model
  const zF = sp.wb / 2, zN = zF + sp.fo, zT = zN - sp.L, zC = zF + sp.cowl, zH = zC - sp.wsRun, truck = sp.cabEnd != null;
  const zEnd = truck ? zC - sp.cabEnd : zT, zD = zEnd + sp.deckLen, zRH = zD + sp.rearRun, hw = (sp.cabW || sp.W) / 2, H = sp.cabH || sp.H;
  const tF = sp.taperF ?? 0.05, tR = truck ? 0 : (sp.taperR ?? 0.05), cr = sp.cr ?? 0.46, nr = sp.nr ?? 0.24, cr2 = truck ? 0 : 0.34, tr = sp.tailR ?? 0.15, Ra = sp.R + 0.06;
  const boxLamps = sp.boxLamps || far, hl = 0.44, tl = 0.36;
  const plan = z => {
    let w = hw - tF * smooth(zF - 0.3, zN, z) ** 2 - tR * (1 - smooth(zEnd, -zF + 0.3, z)) ** 2; const dn = zN - z, dt = z - zEnd;
    if (dn < cr) w -= nr * (1 - Math.sqrt(Math.max(0, 1 - (1 - dn / cr) ** 2)));
    if (dt < cr2) w -= tr * (1 - Math.sqrt(Math.max(0, 1 - (1 - dt / cr2) ** 2)));
    return w;
  };
  const tk = truck ? [[zEnd, sp.belt]] : [[zEnd, sp.deck - 0.17], [zEnd + Math.min(0.1, sp.deckLen * 0.6), sp.deck - 0.03], [zD, sp.deck]];
  if (zC - zD > 0.9) tk.push([(zD + zC) / 2, sp.belt]);
  tk.push([zC, sp.bonH]); if (zN - zC > 0.7) tk.push([zN - 0.45, lerp(sp.bonH, sp.noseH, 0.45)]); tk.push([zN - 0.1, sp.noseH + 0.025], [zN, sp.noseH - 0.1]);
  const top = curve(tk);
  const bot = z => {
    let b = sp.gc + 0.02 + 0.1 * smooth(zF + sp.R + 0.15, zN, z) + (truck ? 0 : 0.1 * (1 - smooth(zEnd, -zF - sp.R - 0.15, z)));
    b = Math.max(b, archY(z, zF, sp.R, Ra)); if (!truck) b = Math.max(b, archY(z, -zF, sp.R, Ra)); return b;
  };
  const inBed = z => sp.bed && z < zD - 0.04 && z > zEnd + 0.09, cabinZ = z => z < zC && z > zD;
  const flare = z => (sp.flare ?? 0.032) * Math.max(Math.exp(-(((z - zF) / 0.45) ** 2)), truck ? 0 : Math.exp(-(((z + zF) / 0.45) ** 2)));
  // Section: every corner radius is generous, so the body side and bonnet are continuously curved (no flat slabs).
  const sec = z => {
    const w = plan(z), b = bot(z), t = top(z), cab = cabinZ(z), bed = inBed(z), h = t - b, f = flare(z);
    return mirrorRing([{ x: 0, y: b, z, flat: true }, { x: w - 0.05, y: b, z, r: 0.04, k: far ? 1 : 2 }, { x: w + f * 0.7 + 0.005, y: b + h * 0.16, z, r: 1 }, { x: w + f + (sp.bulge ?? 0.03), y: b + h * 0.52, z, r: 1 },
      { x: w - (cab ? 0.02 : 0.05), y: t, z, r: cab || bed ? 0.05 : (sp.sh ?? 0.14) }, { x: 0, y: t + (cab || bed ? 0 : (sp.crown ?? 0.045)), z, r: 1 }]);
  };
  // greenhouse stations, front to back: A, A', [pillar pairs], rear pillar, rear edge
  const ap = 0.1, rp = sp.rp, pw = 0.04, gs = [{ b: zC, c: zH }, { b: zC - ap, c: zH - ap * 0.85 }];
  for (const t of sp.pillars) { const pb = lerp(zC - ap, zD + rp, t), pc = lerp(zH - ap * 0.85, zRH + rp * 0.6, t); gs.push({ b: pb + pw, c: pc + pw }, { b: pb - pw, c: pc - pw }); }
  gs.push({ b: zD + rp, c: zRH + rp * 0.6 }, { b: zD, c: zRH });
  const nEnd = [8, 5, 2][lod], ends = c => c ? range(0, 1, nEnd).slice(0, -1).map(t => c * (1 - Math.sin(t * PI / 2))) : [];
  const zs = stations(range(zEnd, zN, [22, 9, 4][lod]), [zD, zC, zC + 0.003], zD - 0.003 > zEnd ? [zD - 0.003] : [], archStations(zF, Ra, [14, 8, 4][lod]), truck ? [] : archStations(-zF, Ra, [14, 8, 4][lod]),
    ends(cr).map(d => zN - d), ends(cr2).map(d => zEnd + d), far ? [] : gs.slice(1, -1).map(s => s.b), sp.bed ? [zD - 0.04, zEnd + 0.09] : [],
    boxLamps ? [] : [zN - 0.03, zN - hl + 0.08, zN - hl], boxLamps || truck ? [] : [zEnd + 0.02, zEnd + tl - 0.08, zEnd + tl]);
  const D = {
    paint: { sk: SK.paint }, under: { sk: SK.under }, sill: { sk: SK.black }, clad: { sk: sp.clad ? SK.black : SK.paint }, shell: { sk: SK.paint, inner: SK.trimDark, jamb: SK.rubber },
    bed: { sk: SK.paint, inner: SK.black, jamb: SK.black }, white: { sk: SK_PWHITE }, whiteShell: { sk: SK_PWHITE, inner: SK.trimDark, jamb: SK.rubber },
    pillar: { sk: SK.gloss, inner: hero ? SK.trimDark : null, jamb: SK.rubber }, roof: { sk: SK.paint, inner: hero ? SK.headliner : null, jamb: SK.rubber }, frame: { sk: SK.paint, inner: hero ? SK.trimDark : null, jamb: SK.rubber }, glass: { glass: GL },
    head: { sk: lens(1, LENS.clear) }, tail: { sk: lens(2, LENS.red) }, indL: { sk: lens(3, LENS.amber) }, indR: { sk: lens(4, LENS.amber) },
  };
  const first = {};
  const lo = B.loft(zs, sec, {
    closed: true, capA: SK.paint, capB: SK.paint, inset: 0.05, cell: (i, tag, j) => {
      if (first[tag] === undefined) first[tag] = j;
      const q = j - first[tag], zm = (zs[i] + zs[i + 1]) / 2, cab = cabinZ(zm), bed = inBed(zm);
      if (tag < 1 || tag > 9.6) return D.under;
      if (tag > 4.2 && tag < 5.8) return cab ? null : bed ? (far ? D.under : null) : D.paint;
      if (tag < 2 || tag > 8.2) return D.sill;
      if (tag <= 2.5 || tag >= 7.5) return D.clad;
      if (!boxLamps && ((tag === 4 && q < seg / 2) || (tag === 6 && q >= seg / 2))) {      // lamps wrapped into the shoulder at both ends
        const dn = zN - zm, dt = zm - zEnd;
        if (dn > 0.03 && dn < hl) return dn > hl - 0.08 ? (tag === 4 ? D.indL : D.indR) : D.head;
        if (!truck && dt > 0.02 && dt < tl) return dt > tl - 0.08 ? (tag === 4 ? D.indL : D.indR) : D.tail;
      }
      if (bed && !far && (tag >= 3.5 && tag <= 6.5)) return D.bed;
      const door = sp.doorSkin && zm < gs[1].b && zm > gs[gs.length - 2].b;
      if (hero && cab && tag >= 2.5 && tag <= 7.5) return door ? D.whiteShell : D.shell;
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
  endGlass(gh.rows[nG - 1], zD, -(sp.wsBow ?? 0.14) * 0.6, [0, 0.5, -1], sp.rearGlass !== false);

  // ---- details
  const wf = plan(zN), yfb = bot(zN), yft = sp.noseH - 0.1, hf = yft - yfb, wr = plan(zEnd), xw = sp.W / 2 - sp.tw / 2 - 0.015, big = sp.L > 7, plate = dec.uv['plate' + (1 + CAR_TYPES.indexOf(type) % 7)];
  const lampAt = (ch, tint, w, h, x, y, z, ry, glow, gain = 0.05) => { B.at(x, y, z, 0, ry, 0, () => { B.rbox(lens(ch, tint), w, h, 0.05, far ? 0 : 0.012, 0, 0, 0); if (glow) glows.push({ pos: B.pt(0, 0, 0.05), dir: B.dir(0, 0, 1), size: clamp(glow * 0.7, 0.15, 0.5), ch, gain }); }); };
  // nose: grille between the lamps, lower intake, plate
  B.rbox(SK.gloss, wf * 1.5, hf * 0.2, 0.03, far ? 0 : 0.01, 0, yfb + hf * 0.72, zN - 0.004); B.rbox(SK.under, wf * 1.8, hf * 0.34, 0.03, far ? 0 : 0.012, 0, yfb + hf * 0.24, zN - 0.004);
  if (!far) { B.rbox(SK.chrome, wf * 1.3, 0.016, 0.016, 0.004, 0, yfb + hf * 0.72, zN + 0.012); B.at(0, yfb + hf * 0.47, zN + 0.004, () => { B.rbox(SK.black, 0.33, 0.17, 0.012, 0.003); B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0.008, plate); }); }
  if (boxLamps) for (const s of [1, -1]) {
    const hy = big ? yfb + hf * 0.3 : yfb + hf * 0.8, hx = s * (wf - (big ? 0.3 : 0.14));
    lampAt(1, LENS.clear, big ? 0.3 : 0.3, big ? 0.14 : hf * 0.2, hx, hy, zN - 0.012, s * 0.2, 0.5, 0.04);
    lampAt(s > 0 ? 3 : 4, LENS.amber, 0.1, 0.05, s * (wf - 0.02), hy - (big ? 0 : hf * 0.16), zN - 0.03, s * 0.7, 0.28);
  } else for (const s of [1, -1]) {
    const zl = zN - 0.16, yl = lerp(bot(zl), top(zl), 0.84);
    glows.push({ pos: [s * (plan(zl) + 0.02), yl, zl + 0.08], dir: [s * 0.3, 0, 0.95], size: 0.4, ch: 1, gain: 0.04 }, { pos: [s * (plan(zN - hl + 0.04) + 0.03), yl, zN - hl + 0.04], dir: [s * 0.8, 0, 0.6], size: 0.22, ch: s > 0 ? 3 : 4, gain: 0.05 });
    if (!truck) { const zt = zEnd + 0.14, yt = lerp(bot(zt), top(zt), 0.84); glows.push({ pos: [s * (plan(zt) + 0.02), yt, zt - 0.08], dir: [s * 0.3, 0, -0.95], size: 0.36, ch: 2, gain: 0.04 }, { pos: [s * (plan(zEnd + tl - 0.04) + 0.03), yt, zEnd + tl - 0.04], dir: [s * 0.8, 0, -0.6], size: 0.22, ch: s > 0 ? 3 : 4, gain: 0.05 }); }
  }
  // tail (trucks get theirs on the body further down)
  if (!truck) {
    const yb = bot(zEnd), yt = sp.deck - 0.17, hr = yt - yb, ty = big ? yb + hr * 0.45 : yb + hr * 0.78;
    if (boxLamps) for (const s of [1, -1]) {
      lampAt(2, LENS.red, big ? 0.14 : 0.3, big ? 0.3 : hr * 0.24, s * (wr - (big ? 0.12 : 0.12)), ty, zEnd + 0.012, PI - s * 0.2, 0.45, 0.04);
      lampAt(s > 0 ? 3 : 4, LENS.amber, 0.12, 0.05, s * (wr - 0.12), ty - (big ? 0.24 : hr * 0.17), zEnd + 0.008, PI, 0.28);
    }
    if (!far) for (const s of [1, -1]) lampAt(5, LENS.clear, 0.1, 0.045, s * 0.3, yb + hr * 0.36, zEnd + 0.004, PI, 0);
    B.rbox(SK.under, wr * 1.7, hr * 0.26, 0.03, far ? 0 : 0.012, 0, yb + hr * 0.16, zEnd + 0.004);
    if (!far) B.at(0, yb + hr * (sp.bed ? 0.36 : 0.6), zEnd - 0.004, 0, PI, 0, () => { B.rbox(SK.black, 0.36, 0.2, 0.012, 0.003); B.plane(SK_DECAL, 0.305, 0.152, 0, 0, 0.008, plate); });
    if (hero) for (const s of [1, -1]) B.cyl(SK.chrome, 0.035, 0.035, 0.1, s * (wr - 0.2), yb + 0.05, zEnd + 0.02, 'z', 10, 0);
  }
  // belly between the wheels so the arches are not see-through; arch liners and lips
  B.box(SK.under, (xw - sp.tw / 2 - 0.02) * 2, far ? 0.3 : 0.42, zN - zT - 0.6, 0, sp.gc + (far ? 0.2 : 0.26), (zN + zT) / 2);
  if (!far) B.mirror(() => {
    for (const za of truck ? [zF] : [zF, -zF]) {
      B.at(0, sp.R, za, () => B.lathe(SK.under, [[xw - sp.tw / 2 - 0.03, Ra - 0.004], [hw - 0.02, Ra - 0.004]], { axis: 'x', seg: hero ? 12 : 6, arc: [-PI / 2, PI / 2], flip: true }));
      const n = hero ? 18 : 9, arc = range(10, 170, n).map(a => { const z = za + (Ra + 0.006) * Math.cos(rad(a)); return [plan(z) + flare(z) * 0.55 - 0.014, sp.R + (Ra + 0.006) * Math.sin(rad(a)), z]; });
      B.tube(sp.clad ? SK.black : SK.paint, arc, sp.clad ? 0.026 : 0.014, hero ? 6 : 4, { up: i => [0, Math.sin(rad(10 + i * 160 / n)), Math.cos(rad(10 + i * 160 / n))], caps: false });
    }
  });
  if (!far) {
    // mirrors, handles, shut lines, cowl seal, belt trim
    const mz = gs[1].b - 0.04, my = top(mz) + 0.06;
    B.mirror(() => {
      if (big) { B.rbox(SK.black, 0.1, 0.3, 0.07, 0.03, plan(mz) + 0.2, my + 0.5, mz + 0.5); B.rbox(SK.mirror, 0.08, 0.26, 0.004, 0, plan(mz) + 0.2, my + 0.5, mz + 0.464); B.tube(SK.black, [[plan(mz) - 0.02, my + 0.75, mz + 0.45], [plan(mz) + 0.2, my + 0.7, mz + 0.5], [plan(mz) + 0.2, my + 0.5, mz + 0.5]], 0.012, 5); }
      else { if (hero) B.ball(SK.paint, 0.105, 0.062, 0.05, plan(mz) + 0.07, my, mz, 12); else B.rbox(SK.paint, 0.17, 0.09, 0.06, 0, plan(mz) + 0.035, my, mz); B.rbox(SK.mirror, 0.14, 0.07, 0.004, 0, plan(mz) + (hero ? 0.075 : 0.04), my, mz - (hero ? 0.04 : 0.033)); if (hero) B.rbox(SK.black, 0.07, 0.03, 0.05, 0, plan(mz) - 0.01, my - 0.045, mz); }
      for (let i = 1; i < nG - 1; i++) {
        const zi = gs[i].b, k = zs.findIndex(z => Math.abs(z - zi) < 2e-4); if (k < 0 || (i > 1 && i % 2 === 0) || (sp.bed && i === nG - 2)) continue;
        const row = lo.rows[k], pts = []; for (let j = 0; j < lo.tags.length; j++) if (lo.tags[j] >= 2.5 && lo.tags[j] <= 4) { if (!pts.length) pts.push(row[j]); pts.push(row[j + 1]); }
        B.tube(SK.under, pts.filter((p, n) => !n || Math.hypot(p[1] - pts[n - 1][1], p[0] - pts[n - 1][0]) > 1e-4).map(p => [p[0] + 0.001, p[1], p[2]]), 0.0045, 3, { caps: false, up: [1, 0, 0] });
        if ((i === 1 || i === 3) && !big) { const hz = gs[i + 1].b + 0.14; B.rbox(sp.clad ? SK.black : SK.paint, 0.022, 0.03, 0.17, 0.01, plan(hz) + flare(hz) + 0.012, top(hz) - 0.13, hz); }
      }
      B.tube(SK.gloss, gs.slice(1, nG - 1).map(s => [plan(s.b) - 0.05, top(s.b) + 0.006, s.b]), 0.012, 4, { caps: false });
    });
    B.tube(SK.rubber, wsB.map(p => [p[0], p[1] + 0.003, p[2] + 0.01]), 0.014, 5);
  }
  if (hero) {
    // cabin: floor, dash, seats, wheel, parcel shelf; wipers
    const fl = sp.gc + 0.14, cl = zC - zD, sx = hw * 0.42;
    B.box(SK.trimDark, hw * 1.8, 0.04, cl + 0.3, 0, fl, (zC + zD) / 2); B.rbox(SK.trimDark, hw * 1.8, 0.3, 0.36, 0.08, 0, top(zC) - 0.15, zC - 0.2); B.rbox(SK.trimDark, 0.3, 0.2, cl * 0.5, 0.04, 0, fl + 0.12, zC - cl * 0.4);
    for (const s of [1, -1]) for (const z of [zC - 0.95, ...(cl > 2 ? [zC - 1.85] : [])]) { B.rbox(SK_SEAT, 0.5, 0.13, 0.5, 0.05, s * sx, fl + 0.24, z); B.at(s * sx, fl + 0.54, z - 0.27, -0.2, 0, 0, () => { B.rbox(SK_SEAT, 0.5, 0.56, 0.12, 0.05); B.rbox(SK_SEAT, 0.26, 0.15, 0.1, 0.04, 0, 0.36, 0); }); }
    B.at(sx, top(zC) - 0.14, zC - 0.48, -0.42, 0, 0, () => { const ring = range(0, 1, 20).slice(0, -1).map(t => [Math.cos(t * TAU) * 0.185, Math.sin(t * TAU) * 0.185, 0]); B.tube(SK.trimDark, ring, 0.016, 6, { loop: true, up: [0, 0, 1] }); B.rbox(SK.trimDark, 0.34, 0.07, 0.03, 0.01); B.cyl(SK.trimDark, 0.03, 0.03, 0.3, 0, 0, 0.14, 'z', 6); });
    if (!truck && sp.deckLen > 0.3 && !sp.bed) B.box(SK.trimDark, hw * 1.6, 0.03, sp.rearRun + 0.1, 0, sp.deck - 0.05, zD + sp.rearRun / 2);
    for (const x of [0.55, -0.05]) B.at(x * hw * 2 * 0.55, top(zC) + 0.03, zC + 0.07 + 0.1 * (1 - (x * 0.9) ** 2), -0.75, 0, 0, () => { B.tube(SK.black, [[0, 0, 0.02], [-0.5, 0.03, 0.03]], 0.007, 4); B.rbox(SK.rubber, 0.5, 0.016, 0.02, 0.004, -0.38, 0.03, 0.016); });
  }
  if (sp.rails && !far) B.mirror(() => B.tube(SK.black, [[hw * sp.tumble - 0.1, H - 0.03, zH - 0.25], [hw * sp.tumble - 0.1, H + 0.03, zH - 0.33], [hw * sp.tumble - 0.1, H + 0.03, zRH + 0.2], [hw * sp.tumble - 0.1, H - 0.03, zRH + 0.1]], 0.014, 5));
  if (sp.bed) { const fy = lerp(bot(0), top(zD - 0.2), 0.62); B.box(SK.black, hw * 1.8, 0.03, zD - zEnd - 0.1, 0, fy, (zD + zEnd) / 2); if (!far) { B.at(0, 0, zEnd + 0.1, () => B.plane(SK.black, hw * 1.84, sp.deck - fy, 0, (sp.deck + fy) / 2 - 0.01, 0)); B.at(0, 0, zD - 0.045, 0, PI, 0, () => B.plane(SK.black, hw * 1.84, sp.deck - fy, 0, (sp.deck + fy) / 2 - 0.01, 0)); } }
  let bar = null;
  if (type === 'police') {
    const by = H + 0.02, bz = lerp(zH, zRH, 0.45);
    B.rbox(SK.black, 1.16, 0.03, 0.26, 0.01, 0, by + 0.012, bz); for (const s of [1, -1]) B.rbox(SK.under, 0.05, 0.05, 0.3, 0.01, s * 0.5, by - 0.01, bz);
    for (const s of [1, -1]) { B.rbox(lens(s > 0 ? 6 : 7, s > 0 ? LENS.red : LENS.blue), 0.5, 0.075, 0.24, far ? 0 : 0.02, s * 0.3, by + 0.066, bz); for (const d of [1, -1]) glows.push({ pos: [s * 0.32, by + 0.07, bz + d * 0.14], dir: [0, 0.1, d], size: 0.45, ch: s > 0 ? 6 : 7, gain: 0.06 }); }
    B.rbox(lens(8, LENS.clear), 0.1, 0.07, 0.24, far ? 0 : 0.015, 0, by + 0.064, bz); B.rbox(SK.gloss, 1.14, 0.014, 0.25, 0.005, 0, by + 0.11, bz);
    if (!far) {
      const dz = lerp(gs[1].b, gs[2].b, 0.5) - 0.1, dy = top(dz) - 0.32;
      B.mirror(() => B.tube(SK.black, [[0.3, yfb + 0.02, zN + 0.02], [0.3, yfb + 0.05, zN + 0.1], [0.3, yft + 0.02, zN + 0.1], [0.3, yft + 0.05, zN + 0.0]], 0.02, 6));
      B.rbox(SK.black, 0.62, 0.035, 0.04, 0.012, 0, yft, zN + 0.1); B.rbox(SK.black, 0.62, 0.035, 0.04, 0.012, 0, yfb + hf * 0.45, zN + 0.1);
      B.at(plan(dz) + flare(dz) + 0.035, dy, dz, 0, PI / 2, 0, () => B.plane(SK_DECAL, 0.72, 0.135, 0, 0, 0, dec.uv.police)); B.at(-plan(dz) - flare(dz) - 0.035, dy, dz, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 0.72, 0.135, 0, 0, 0, dec.uv.police));
    }
    bar = 'police';
  }
  // truck bodies behind the cab
  if (truck) {
    const z0 = zEnd - 0.1, bw = sp.W / 2, yb = sp.R * 2 + 0.12, fire = type === 'engine', SB = fire ? SK.paint : SK_PWHITE, bodyH = fire ? 2.55 : sp.H;
    for (const s of [1, -1]) B.box(SK.under, 0.09, 0.24, zEnd - zT + 0.6, s * 0.42, sp.R + 0.22, (zEnd + zT) / 2 + 0.2);
    B.cyl(SK.iron, 0.08, 0.08, sp.W - 0.3, 0, sp.R, -zF, 'x', 8);
    if (fire) {
      B.rbox(SB, bw * 2, bodyH - yb + 0.5, z0 - zT, far ? 0 : 0.03, 0, (bodyH + yb - 0.5) / 2, (z0 + zT) / 2);
      if (!far) {
        B.mirror(() => {
          B.rbox(SK.alu, 0.03, 1.25, 1.0, 0.01, bw + 0.005, 1.5, z0 - 0.6);                                          // pump panel
          for (let i = 0; i < 8; i++) B.cyl(i < 3 ? SK.chrome : SK.gloss, 0.05, 0.05, 0.04, bw + 0.03, 1.2 + (i % 4) * 0.22, z0 - 0.3 - (i >> 2) * 0.45, 'x', 10);
          for (const [za, zb, ya, yb2] of [[z0 - 1.2, -zF + 0.75, 0.75, 2.2], [-zF - 0.75, zT + 0.1, 0.75, 2.2], [-zF + 0.7, -zF - 0.7, 1.75, 2.2]]) B.rbox(SK.alu, 0.02, yb2 - ya, za - zb - 0.08, 0.008, bw + 0.004, (ya + yb2) / 2, (za + zb) / 2);
          B.box(SK_GOLD, 0.012, 0.06, zEnd - zT + 2.2, bw + 0.002, 1.02, (zEnd + zT) / 2 + 1.1);
          lampAt(6, LENS.red, 0.2, 0.13, bw + 0.01, 2.36, z0 - 0.25, PI / 2, 0.6); lampAt(7, LENS.red, 0.2, 0.13, bw + 0.01, 2.36, zT + 0.3, PI / 2, 0.6);
        });
        B.at(bw + 0.012, 2.36, (z0 + zT) / 2, 0, PI / 2, 0, () => B.plane(SK_DECAL, 2.2, 0.34, 0, 0, 0, dec.uv.fire));
        B.at(-(bw + 0.012), 2.36, (z0 + zT) / 2, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 2.2, 0.34, 0, 0, 0, dec.uv.fire));
        B.box(SK.under, bw * 1.5, 0.3, z0 - zT - 1.4, 0, bodyH + 0.1, (z0 + zT) / 2 - 0.3);                             // hose bed
        for (const x of [-bw + 0.25, -bw + 0.7]) B.tube(SK.alu, [[x, bodyH + 0.34, z0 - 0.5], [x, bodyH + 0.34, zT + 0.2]], 0.025, 5);     // ladder
        if (hero) for (let i = 0; i < 9; i++) B.tube(SK.alu, [[-bw + 0.25, bodyH + 0.34, z0 - 0.7 - i * 0.6], [-bw + 0.7, bodyH + 0.34, z0 - 0.7 - i * 0.6]], 0.016, 4, { caps: false });
        B.rbox(SK.alu, bw * 2 + 0.1, 0.06, 0.4, 0.015, 0, yb - 0.45, zT - 0.15);                                         // tailboard
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
    for (const [za, zb] of [[zF + 2.2, zF + 1.0], [-0.2, -1.5]]) B.rbox(SK_DGLASS, 0.02, 0.66, za - zb, 0.006, -hw - 0.001, 0.72, (za + zb) / 2);
    B.mirror(() => B.box(surf(0x1d5b8a, 0.3), 0.012, 0.2, sp.L - 0.9, hw + 0.006, 0.9, (zN + zT) / 2));
    B.at(hw + 0.002, 2.66, 0.8, 0, PI / 2, 0, () => B.plane(SK_DECAL, 5.0, 0.42, 0, 0, 0, dec.uv.transit));
    B.at(-hw - 0.002, 2.66, 0.8, 0, -PI / 2, 0, () => B.plane(SK_DECAL, 5.0, 0.42, 0, 0, 0, dec.uv.transit));
    B.at(0, 2.62, zN - 0.11, () => { B.rbox(SK.gloss, 1.7, 0.36, 0.02, 0.006); B.plane(SK_DECAL, 1.0, 0.31, 0, 0, 0.012, dec.uv.bus); });
    B.rbox(SK_PWHITE, 1.8, 0.2, 2.6, 0.06, 0, H + 0.08, -1.0); B.rbox(SK.under, 1.6, 0.7, 0.03, 0.01, 0, 1.2, zT - 0.004);
  }
  // wheels
  const dual = truck ? sp.tw + 0.03 : 0, wspec = { R: sp.R, W: sp.tw, rimR: sp.rimR, seg: [28, 16, 8][lod], lite: !hero, style: sp.wheel, grooves: hero ? 3 : 0, spokes: sp.spokes || 5, lugs: hero ? 5 : 0, rimSk: sp.wheel === 'cap' ? surf(g3(0.5), 0.3, 0.9) : SK.steel };
  const wpos = [[xw, sp.R, zF], [-xw, sp.R, zF], [xw - (dual ? 0.02 : 0), sp.R, -zF], [-xw + (dual ? 0.02 : 0), sp.R, -zF]];
  if (far) for (const [x, y, z] of wpos) { B.cyl(SK.tyre, sp.R, sp.R, sp.tw + (dual && z < 0 ? dual : 0), x - Math.sign(x) * (dual && z < 0 ? dual / 2 : 0), y, z, 'x', 10); B.at(x + Math.sign(x) * (sp.tw / 2 + 0.004), y, z, () => B.lathe(SK.steel, [[0, sp.rimR], [0, 0]], { axis: 'x', seg: 8, flip: x < 0 })); }
  const parts = B.build({ surf: _phMat, glass: _phMat })[''], geo = {}; for (const m of parts) geo[m.name.split(':')[1]] = m.geometry;
  const res = {
    geo, glow: glowGeo(glows), wpos, bar, tris: B.tris(), wheelGeo: far ? null : [wheelGeo(wspec, 1), wheelGeo(wspec, -1), wheelGeo(wspec, 1, dual), wheelGeo(wspec, -1, dual)],
    dims: { length: sp.L, width: sp.W, height: sp.H + (bar ? 0.15 : 0), wheelbase: sp.wb, track: xw * 2, frontOverhang: sp.fo, rearOverhang: sp.L - sp.wb - sp.fo, wheelRadius: sp.R, mass: sp.mass, cgHeight: lerp(sp.gc, sp.H, 0.33) },
  };
  carCache.set(key, res); return res;
}

let _carGlass = null, _farMat = null;
// One traffic vehicle. opts: color (hex or THREE.Color; fleet vehicles keep their own), lod 0 hero | 1 traffic | 2 far, seed.
export function buildCar(type = 'sedan', opts = {}) {
  if (!CAR_SPECS[type]) type = 'sedan';
  const lod = opts.lod ?? 1, G = carBuild(type, lod), sp = CAR_SPECS[type], rng = makeRng(opts.seed ?? 1);
  const color = new THREE.Color(sp.color ?? opts.color ?? rng.pick(CAR_COLORS)), lamps = new Float32Array(12 * 3), paint = { value: color };
  const group = new THREE.Group(), body = new THREE.Group(); group.name = type; group.add(body);
  const mat = makeSurfMat({ physical: lod < 2, lamps, paint, map: decalSheet().tex });
  const mesh = new THREE.Mesh(G.geo.surf, mat); mesh.castShadow = mesh.receiveShadow = true; body.add(mesh);
  if (G.geo.glass) { const g = new THREE.Mesh(G.geo.glass, _carGlass ||= makeGlassMat({ opacity: 0.5 })); g.renderOrder = 5; body.add(g); }
  const wheels = [], steer = [];
  if (G.wheelGeo) G.wpos.forEach((p, i) => {
    const w = new THREE.Mesh(G.wheelGeo[i], mat); w.castShadow = true;
    if (i < 2) { const s = new THREE.Group(); s.position.fromArray(p); s.add(w); group.add(s); steer.push(s); } else { w.position.fromArray(p); group.add(w); }
    wheels.push(w);
  });
  if (lod < 2) body.add(makeGlow(lamps, G.glow));
  const st = { head: 0, brake: false, l: false, r: false, haz: false, em: false }, set = (i, c, k) => { lamps[i * 3] = c[0] * k; lamps[i * 3 + 1] = c[1] * k; lamps[i * 3 + 2] = c[2] * k; };
  const steady = () => { set(1, E_WHT, st.head === 2 ? 6.5 : st.head ? 4 : 0); set(2, E_RED, (st.head ? 1.2 : 0) + (st.brake ? 5.5 : 0)); };
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
  const out = { group, body, wheels, steer, dims: G.dims, lights, type, lod, tris: G.tris, color };
  if (lod === 2) { out.geometry = G.geo.surf; out.material = _farMat ||= makeSurfMat({ map: decalSheet().tex, inst: true }); }
  return out;
}

// ---------------------------------------------------------------------------------------------- motorcycle, stretcher

let _gearMat = null;
const gearMat = () => _gearMat ||= makeSurfMat({ physical: true });
const groupOf = (B, mats, pivots = {}) => { const parts = B.build(mats, pivots), out = {}; for (const k in parts) { const g = out[k] = new THREE.Group(); g.name = k || 'main'; if (pivots[k]) g.position.fromArray(pivots[k]); for (const m of parts[k]) g.add(m); } return out; };

// Standard road bike for crash scenes. opts: color, onSide (lying on its left side). One draw call.
export function buildMotorcycle(opts = {}) {
  const B = new Builder({ seg: 3, single: () => 'surf' }), PI = Math.PI, col = lin(opts.color ?? 0x7d1216), PAINT = skin('surf', col, 0.35, 0, 1), R = 0.31, wb = 1.42, zf = wb / 2, zr = -wb / 2;
  for (const [z, w] of [[zf, 0.11], [zr, 0.15]]) B.at(0, R, z, () => { wheelInto(B, { R, W: w, rimR: 0.215, seg: 28, style: 'alloy', spokes: 5, grooves: 1, lugs: 0, lite: true }); B.cyl(SK.iron, 0.13, 0.13, 0.008, w / 2 + 0.02, 0, 0, 'x', 16); });
  // forks, bars, headlamp
  B.mirror(() => { B.tube(SK.chrome, [[0.1, R, zf], [0.1, 0.72, zf - 0.17]], 0.019, 8); B.tube(SK.steel, [[0.1, 0.72, zf - 0.17], [0.1, 1.0, zf - 0.28]], 0.024, 8); B.tube(SK.chrome, [[0, 1.04, zf - 0.3], [0.2, 1.08, zf - 0.33], [0.34, 1.07, zf - 0.4]], 0.012, 6); B.tube(SK.rubber, [[0.26, 1.075, zf - 0.365], [0.36, 1.068, zf - 0.41]], 0.017, 6); B.tube(SK.black, [[0.2, 1.08, zf - 0.33], [0.24, 1.2, zf - 0.34]], 0.005, 4); B.rbox(SK.mirror, 0.1, 0.06, 0.008, 0.003, 0.26, 1.22, zf - 0.345); });
  B.rbox(SK.black, 0.26, 0.04, 0.05, 0.012, 0, 1.0, zf - 0.28); B.rbox(SK.black, 0.26, 0.04, 0.05, 0.012, 0, 0.74, zf - 0.18);
  B.ball(SK.chrome, 0.09, 0.09, 0.08, 0, 0.9, zf - 0.13, 12); B.at(0, 0.9, zf - 0.06, () => B.lathe(lens(0, g3(0.55)), [[0, 0.085], [0.012, 0.05], [0.016, 0]], { axis: 'z', seg: 14 }));
  B.rbox(SK.black, 0.16, 0.08, 0.05, 0.02, 0, 1.05, zf - 0.27);                                                // clocks
  B.sweep(PAINT, range(-70, 75, 10).map(a => [0, R + (R + 0.035) * Math.cos(rad(a)), zf + (R + 0.035) * Math.sin(rad(a))]), [{ a: -0.07, b: 0, r: 0.02 }, { a: 0.07, b: 0, r: 0.02 }, { a: 0.07, b: 0.008, r: 0.004 }, { a: -0.07, b: 0.008, r: 0.004 }], { up: i => { const a = rad(-70 + i * 14.5); return [0, Math.cos(a), Math.sin(a)]; }, seg: 2 });
  // frame, engine, tank, seat, tail
  B.mirror(() => { B.tube(SK.black, [[0.03, 0.98, zf - 0.3], [0.1, 0.62, 0.15], [0.12, 0.36, 0.2], [0.12, 0.3, -0.25], [0.1, 0.5, -0.42], [0.08, 0.8, -0.3]], 0.016, 6); B.tube(SK.black, [[0.03, 0.96, zf - 0.32], [0.08, 0.84, 0.0], [0.1, 0.8, -0.3], [0.08, 0.86, -0.72]], 0.016, 6); B.tube(SK.black, [[0.1, 0.42, -0.36], [0.09, R, zr]], 0.022, 6); B.tube(SK.chrome, [[0.13, 0.78, -0.4], [0.12, R + 0.04, zr + 0.02]], 0.02, 8); });
  B.rbox(SK.alu, 0.3, 0.26, 0.34, 0.04, 0, 0.44, -0.04); B.rbox(SK.iron, 0.36, 0.22, 0.26, 0.05, 0, 0.36, -0.08);
  for (let i = 0; i < 6; i++) B.rbox(SK.alu, 0.27, 0.012, 0.2, 0.004, 0, 0.58 + i * 0.026, 0.05);
  B.rbox(SK.black, 0.25, 0.05, 0.22, 0.02, 0, 0.75, 0.05);
  B.ball(PAINT, 0.17, 0.13, 0.3, 0, 0.9, 0.12, 16); B.cyl(SK.chrome, 0.035, 0.035, 0.012, 0, 1.03, 0.16, 'y', 10);
  B.rbox(SK_SEAT, 0.28, 0.09, 0.62, 0.04, 0, 0.84, -0.42); B.rbox(PAINT, 0.22, 0.1, 0.34, 0.04, 0, 0.82, -0.76); B.rbox(lens(0, LENS.red), 0.12, 0.04, 0.03, 0.01, 0, 0.82, -0.935);
  B.sweep(SK.black, range(-150, -80, 6).map(a => [0, R + (R + 0.04) * Math.cos(rad(a)), zr + (R + 0.04) * Math.sin(rad(a))]), [{ a: -0.085, b: 0, r: 0.02 }, { a: 0.085, b: 0, r: 0.02 }, { a: 0.085, b: 0.008, r: 0.004 }, { a: -0.085, b: 0.008, r: 0.004 }], { up: i => { const a = rad(-150 + i * 11.67); return [0, Math.cos(a), Math.sin(a)]; }, seg: 2 });
  B.at(0, 0.6, -0.99, 0.3, PI, 0, () => { B.rbox(SK.black, 0.2, 0.13, 0.008, 0.003); B.plane(SK_PWHITE, 0.18, 0.11, 0, 0, 0.006); });
  // exhaust, pegs, stand
  B.tube(SK.chrome, [[-0.1, 0.5, 0.14], [-0.17, 0.3, 0.16], [-0.18, 0.26, -0.3], [-0.19, 0.32, -0.55]], 0.022, 8); B.at(-0.2, 0.36, -0.8, -0.14, 0, 0, () => B.cyl(SK.chrome, 0.05, 0.055, 0.5, 0, 0, 0, 'z', 12));
  B.mirror(() => B.tube(SK.black, [[0.13, 0.34, -0.22], [0.24, 0.34, -0.22]], 0.012, 5)); B.tube(SK.black, [[0.12, 0.3, -0.1], [0.3, 0.02, -0.02]], 0.012, 5);
  const g = groupOf(B, { surf: gearMat() }), group = new THREE.Group(); group.name = 'motorcycle'; group.add(g['']);
  if (opts.onSide) { g[''].rotation.z = rad(82); g[''].position.set(0.42, 0.33, 0); }
  return { group, dims: { length: 2.1, width: 0.72, height: 1.25, wheelbase: wb, wheelRadius: R, mass: 210 }, tris: B.tris() };
}

// Powered ambulance cot. Origin on the floor under its centre, head end towards +Z. setHeight(0..1) lowers/raises the
// litter on its X-frame, setBackrest(0..1) raises the head section, mattressTop marks where the patient lies.
export function buildStretcher(opts = {}) {
  const B = new Builder({ seg: 3, single: () => 'surf' }), PI = Math.PI, FR = SK.alu, MAT = surf([0.035, 0.045, 0.07], 0.5), WEB = surf(g3(0.025), 0.9), hw = 0.27, L = 1.95;
  // base with four casters
  B.mirror(() => { B.tube(FR, [[0.22, 0.2, -0.82], [0.22, 0.2, 0.82]], 0.02, 8); for (const z of [-0.84, 0.84]) { B.at(0.24, 0.075, z, () => { B.lathe(SK.tyre, [[-0.02, 0.03], [-0.02, 0.07], [-0.012, 0.076], [0.012, 0.076], [0.02, 0.07], [0.02, 0.03]], { axis: 'x', seg: 16 }); B.cyl(SK.alu, 0.035, 0.035, 0.046, 0, 0, 0, 'x', 10); }); B.rbox(SK.black, 0.06, 0.1, 0.05, 0.012, 0.24, 0.15, z + Math.sign(z) * -0.03); } });
  for (const z of [-0.82, 0.0, 0.82]) B.tube(FR, [[-0.22, 0.2, z], [0.22, 0.2, z]], 0.018, 8);
  B.rbox(SK.black, 0.3, 0.1, 0.4, 0.02, 0, 0.25, -0.35); B.cyl(SK.steel, 0.03, 0.03, 0.5, 0, 0.27, 0.15, 'z', 10);          // power pack and ram
  for (const [x, sk] of [[-0.12, SK.red], [0.12, surf(0x1c7a2c, 0.4)]]) B.rbox(sk, 0.09, 0.02, 0.05, 0.006, x, 0.215, -0.88);
  // scissor legs: unit-length pairs along +Z, posed by setHeight
  for (const n of ['legA', 'legB']) { B.grp = n; B.mirror(() => B.tube(FR, [[0.19 + (n === 'legA' ? 0 : 0.04), 0, 0], [0.19 + (n === 'legA' ? 0 : 0.04), 0, 1]], 0.019, 8)); }
  // litter
  B.grp = 'litter';
  B.mirror(() => { B.tube(FR, [[hw, 0, -L / 2 + 0.05], [hw, 0, L / 2 - 0.1]], 0.016, 8); B.tube(SK.yellow, [[hw + 0.012, 0.03, -0.45], [hw + 0.03, 0.2, -0.4], [hw + 0.03, 0.2, 0.1], [hw + 0.012, 0.03, 0.15]], 0.013, 6); B.tube(SK.yellow, [[hw + 0.03, 0.2, -0.15], [hw + 0.012, 0.03, -0.15]], 0.011, 5); });
  B.tube(FR, [[-hw, 0, -L / 2 + 0.05], [-hw * 0.7, 0.02, -L / 2 - 0.02], [hw * 0.7, 0.02, -L / 2 - 0.02], [hw, 0, -L / 2 + 0.05]], 0.016, 8); B.tube(SK.rubber, [[-hw * 0.5, 0.02, -L / 2 - 0.02], [hw * 0.5, 0.02, -L / 2 - 0.02]], 0.02, 8);
  for (const z of [-0.7, -0.15, 0.2]) B.tube(FR, [[-hw, 0, z], [hw, 0, z]], 0.012, 6);
  B.box(SK.black, hw * 1.9, 0.012, 1.1, 0, 0.012, -0.38);
  B.rbox(MAT, 0.52, 0.08, 0.4, 0.03, 0, 0.065, 0.0); B.rbox(MAT, 0.52, 0.08, 0.74, 0.03, 0, 0.065, -0.585);                     // seat and leg mattress sections
  for (const z of [-0.2, -0.7]) { B.rbox(WEB, 0.56, 0.006, 0.05, 0.002, 0, 0.108, z); B.rbox(SK.chrome, 0.06, 0.012, 0.055, 0.004, 0.02, 0.112, z); B.mirror(() => B.box(WEB, 0.006, 0.1, 0.05, 0.262, 0.06, z)); }
  B.rbox(SK.red, 0.16, 0.07, 0.1, 0.015, 0.14, -0.05, -L / 2 + 0.16); B.rbox(SK.black, 0.07, 0.03, 0.05, 0.008, hw - 0.04, 0.03, -L / 2 + 0.02);    // battery, control
  // backrest (hinged at the hips)
  B.grp = 'back';
  B.mirror(() => B.tube(FR, [[hw - 0.02, 0, 0], [hw - 0.02, 0, 0.72]], 0.014, 8)); B.tube(FR, [[-hw + 0.02, 0, 0.72], [-hw * 0.6, 0.01, 0.8], [hw * 0.6, 0.01, 0.8], [hw - 0.02, 0, 0.72]], 0.014, 8);
  B.box(SK.black, hw * 1.8, 0.012, 0.7, 0, 0.012, 0.37); B.rbox(MAT, 0.52, 0.08, 0.74, 0.03, 0, 0.065, 0.39); B.rbox(surf(g3(0.7), 0.8), 0.4, 0.07, 0.26, 0.03, 0, 0.13, 0.58);
  B.mirror(() => { B.rbox(WEB, 0.05, 0.006, 0.5, 0.002, 0.12, 0.108, 0.3); }); B.rbox(WEB, 0.56, 0.006, 0.05, 0.002, 0, 0.11, 0.12); B.rbox(SK.chrome, 0.06, 0.012, 0.055, 0.004, 0, 0.114, 0.12);
  B.grp = '';
  const g = groupOf(B, { surf: gearMat() }), group = new THREE.Group(); group.name = 'stretcher';
  const litter = g.litter, back = g.back; group.add(g[''], g.legA, g.legB, litter); litter.add(back); back.position.set(0, 0.02, 0.2);
  const mattressTop = new THREE.Object3D(); mattressTop.name = 'mattressTop'; mattressTop.position.set(0, 0.11, -0.1); litter.add(mattressTop);
  const pose = (leg, z0, z1, h) => { const dy = h - 0.2, dz = z1 - z0, len = Math.hypot(dy, dz); leg.position.set(0, 0.2, z0); leg.rotation.x = -Math.atan2(dy, dz); leg.scale.z = len; };
  const api = {
    group, mattressTop, litter, backrest: back, height: 0,
    setHeight(t) { const h = lerp(0.34, 0.86, clamp(t)), sl = lerp(0.78, 0.5, clamp(t)); api.height = h; litter.position.y = h; pose(g.legA, 0.72, -sl, h); pose(g.legB, -0.72, sl, h); },
    setBackrest(t) { back.rotation.x = -clamp(t) * 1.25; },
    tris: B.tris(),
  };
  api.setHeight(opts.height ?? 1); api.setBackrest(opts.backrest ?? 0.35);
  return api;
}

// ---------------------------------------------------------------------------------------------- patient compartment

function drawModuleSheets(seed) {
  const rng = makeRng(seed), fl = makeCanvas(512, 1024), f = fl.getContext('2d');
  f.fillStyle = '#6c7074'; f.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 26000; i++) { const v = rng.i(70, 150); f.fillStyle = `rgba(${v},${v + 2},${v + 5},0.5)`; f.fillRect(rng.r(0, 512), rng.r(0, 1024), rng.r(1, 2.6), rng.r(1, 2.6)); }
  // wear: the path the cot wheels and boots take, scuffs by the doors
  const wear = (x, y, w, h, a) => { const g = f.createRadialGradient(x, y, 0, x, y, Math.max(w, h)); g.addColorStop(0, `rgba(40,40,42,${a})`); g.addColorStop(1, 'rgba(40,40,42,0)'); f.save(); f.translate(x, y); f.scale(w / Math.max(w, h), h / Math.max(w, h)); f.translate(-x, -y); f.fillStyle = g; f.fillRect(x - 600, y - 1100, 1200, 2200); f.restore(); };
  wear(256, 560, 90, 460, 0.3); wear(256, 980, 240, 80, 0.4); wear(60, 180, 90, 120, 0.3);
  f.strokeStyle = 'rgba(25,25,27,0.35)'; f.lineCap = 'round'; for (let i = 0; i < 70; i++) { const x = rng.r(150, 370), y = rng.r(80, 1000); f.lineWidth = rng.r(0.6, 2.2); f.beginPath(); f.moveTo(x, y); f.lineTo(x + rng.r(-10, 10), y + rng.r(-60, 60)); f.stroke(); }
  for (let i = 0; i < 16; i++) { f.fillStyle = i % 2 ? '#1a1a1a' : '#d6a800'; f.beginPath(); f.moveTo(i * 36 - 20, 1024); f.lineTo(i * 36 + 16, 1024); f.lineTo(i * 36 + 34, 1000); f.lineTo(i * 36 - 2, 1000); f.fill(); }
  f.strokeStyle = 'rgba(30,30,32,0.5)'; f.lineWidth = 2; f.strokeRect(1, 1, 510, 1022);
  const cv = makeCanvas(1024, 512), c = cv.getContext('2d'), uv = {};
  const rect = (name, x, y, w, h) => { uv[name] = [x / 1024, 1 - (y + h) / 512, (x + w) / 1024, 1 - y / 512]; };
  const txt = (s, x, y, px, col = '#e8ecee', w = 700) => { c.fillStyle = col; c.font = FONT(px, w); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y); };
  c.fillStyle = '#d9dad6'; c.fillRect(0, 0, 1024, 512);
  rect('switches', 0, 0, 380, 210); c.fillStyle = '#17191b'; c.fillRect(0, 0, 380, 210); c.strokeStyle = '#8b9196'; c.lineWidth = 4; c.strokeRect(4, 4, 372, 202);
  ['DOME HI', 'DOME LO', 'CHECK-OUT', 'SUCTION', 'VENT FAN', 'HEAT', 'A/C', 'O2 MAIN', 'INVERTER', 'SCENE L', 'SCENE R', 'REAR LOAD'].forEach((l, i) => { const x = 22 + (i % 6) * 58, y = 24 + (i / 6 | 0) * 92; c.fillStyle = '#060606'; c.fillRect(x, y, 44, 56); c.fillStyle = [0, 3, 7, 8].includes(i) ? '#ff3b22' : '#3a1612'; c.fillRect(x + 6, y + 6, 32, 20); txt(l, x + 22, y + 68, 10); });
  rect('monitor', 390, 0, 300, 210); c.fillStyle = '#05080a'; c.fillRect(390, 0, 300, 210);
  [['#3dff6a', 44, 'HR', '72'], ['#39c8ff', 96, 'SpO2', '98'], ['#ffd23d', 148, 'CO2', '36']].forEach(([col, y, lab, val], k) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); for (let x = 0; x < 200; x++) { const ph = (x % 50) / 50, v = k === 0 ? (ph > 0.3 && ph < 0.34 ? -5 : ph > 0.36 && ph < 0.4 ? 24 : ph > 0.4 && ph < 0.44 ? -8 : ph > 0.6 && ph < 0.72 ? 5 * Math.sin((ph - 0.6) / 0.12 * Math.PI) : 0) : k === 1 ? 12 * Math.max(0, Math.sin(ph * Math.PI * 2)) ** 0.6 : (ph > 0.3 && ph < 0.7 ? 14 : 0); x ? c.lineTo(398 + x, y - v) : c.moveTo(398 + x, y - v); } c.stroke(); txt(lab, 628, y - 22, 12, col); txt(val, 650, y + 2, 32, col); });
  txt('NIBP 124/78', 470, 190, 16, '#e8ecee'); txt('14:32', 640, 190, 14, '#9aa4ac');
  rect('nosmoke', 700, 0, 324, 70); c.fillStyle = '#a81410'; c.fillRect(700, 0, 324, 70); txt('NO SMOKING  -  OXYGEN IN USE', 862, 36, 19, '#fff');
  rect('o2', 700, 80, 150, 60); c.fillStyle = '#1c7a2c'; c.fillRect(700, 80, 150, 60); txt('OXYGEN', 775, 110, 26, '#fff');
  rect('suction', 860, 80, 164, 60); c.fillStyle = '#e9eaea'; c.fillRect(860, 80, 164, 60); c.strokeStyle = '#555'; c.strokeRect(862, 82, 160, 56); txt('SUCTION', 942, 110, 24, '#222');
  rect('sharps', 700, 150, 150, 60); c.fillStyle = '#b3120e'; c.fillRect(700, 150, 150, 60); txt('SHARPS', 775, 172, 22, '#fff'); txt('DO NOT OVERFILL', 775, 196, 11, '#fff');
  ['S', 'M', 'L'].forEach((l, i) => { rect('glove' + i, 860 + i * 55, 150, 52, 60); c.fillStyle = ['#5b3f96', '#2b62a8', '#1f7d7a'][i]; c.fillRect(860 + i * 55, 150, 52, 60); txt('NITRILE', 886 + i * 55, 166, 9, '#fff'); txt(l, 886 + i * 55, 190, 26, '#fff'); });
  ['AIRWAY', 'IV / MEDS', 'TRAUMA', 'PEDIATRIC', 'BURN / OB', 'LINEN', 'SPLINTS', 'PPE'].forEach((l, i) => { rect('lab' + i, (i % 4) * 256, 220 + (i / 4 | 0) * 44, 250, 38); c.fillStyle = '#f2f2ee'; c.fillRect((i % 4) * 256, 220 + (i / 4 | 0) * 44, 250, 38); c.strokeStyle = '#1b2f55'; c.lineWidth = 2; c.strokeRect((i % 4) * 256 + 2, 222 + (i / 4 | 0) * 44, 246, 34); txt(l, (i % 4) * 256 + 125, 240 + (i / 4 | 0) * 44, 24, '#1b2f55'); });
  rect('clock', 0, 320, 180, 180); c.fillStyle = '#f4f4f0'; c.beginPath(); c.arc(90, 410, 84, 0, TAU); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 6; c.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.lineWidth = 3; c.beginPath(); c.moveTo(90 + Math.cos(a) * 70, 410 + Math.sin(a) * 70); c.lineTo(90 + Math.cos(a) * 78, 410 + Math.sin(a) * 78); c.stroke(); } c.lineWidth = 5; c.beginPath(); c.moveTo(90, 410); c.lineTo(118, 384); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(90, 410); c.lineTo(76, 352); c.stroke();
  rect('outlet', 190, 320, 120, 180); c.fillStyle = '#ecebe6'; c.fillRect(190, 320, 120, 180); for (const y of [364, 450]) { c.fillStyle = '#cfcec8'; c.beginPath(); c.roundRect(214, y - 34, 72, 68, 14); c.fill(); c.fillStyle = '#222'; c.fillRect(232, y - 18, 6, 22); c.fillRect(262, y - 18, 6, 22); c.beginPath(); c.arc(250, y + 18, 6, 0, TAU); c.fill(); }
  rect('ext', 320, 320, 120, 180); c.fillStyle = '#f2f2ee'; c.fillRect(320, 320, 120, 180); txt('FIRE', 380, 360, 26, '#a81410'); txt('EXTINGUISHER', 380, 390, 13, '#a81410'); txt('ABC  2.5 kg', 380, 430, 14, '#333');
  rect('gauge', 450, 320, 180, 180); c.fillStyle = '#f4f4f0'; c.beginPath(); c.arc(540, 410, 84, 0, TAU); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 5; c.stroke(); for (let i = 0; i <= 10; i++) { const a = rad(225 - i * 27); c.lineWidth = 3; c.beginPath(); c.moveTo(540 + Math.cos(a) * 62, 410 - Math.sin(a) * 62); c.lineTo(540 + Math.cos(a) * 76, 410 - Math.sin(a) * 76); c.stroke(); } c.strokeStyle = '#c01810'; c.lineWidth = 4; c.beginPath(); c.moveTo(540, 410); c.lineTo(500, 370); c.stroke(); txt('mmHg', 540, 450, 14, '#333');
  return { floor: canvasTex(fl, { wrap: false, aniso: 16 }), sheet: canvasTex(cv, { wrap: false, aniso: 8 }), uv };
}

// The patient compartment as a closed room (about 3.6 x 2.2 x 1.75 m). Frame: origin on the floor at the centre,
// +Z towards the cab, +X = street side. Camera markers point along their +Z.
export function buildAmbulanceInterior(opts = {}) {
  const PI = Math.PI, L = 3.6, W = 2.2, Hh = 1.75, hl = L / 2, hw = W / 2, lamps = new Float32Array(4 * 3), sh = drawModuleSheets(opts.seed ?? 14);
  const B = new Builder({ seg: 3, single: sk => sk.mat.startsWith('tex') || sk.mat === 'glass' || sk.mat === 'acrylic' ? sk.mat : 'dry' });
  const WALL = surf([0.5, 0.51, 0.5], 0.38), CAB = surf([0.56, 0.57, 0.55], 0.3), CUSH = surf([0.03, 0.05, 0.1], 0.45), STL = SK.steel, SKL = skin('texsheet'), SKFL = skin('texfloor'), ACR = skin('acrylic'), DOME = lens(1, g3(0.8), [8, 8]);
  const label = (name, w, x, y, z, ry) => { const r = sh.uv[name], h = w * (r[3] - r[1]) / (r[2] - r[0]) / 2; B.at(x, y, z, 0, ry, 0, () => B.plane(SKL, w, h, 0, 0, 0, r)); };
  // shell (faces point inwards)
  B.at(0, 0, 0, -PI / 2, PI, 0, () => B.plane(SKFL, W, L, 0, 0, 0)); B.at(0, Hh, 0, PI / 2, 0, 0, () => B.plane(WALL, W, L));
  B.at(hw, Hh / 2, 0, 0, -PI / 2, 0, () => B.plane(WALL, L, Hh)); B.at(-hw, Hh / 2, 0, 0, PI / 2, 0, () => B.plane(WALL, L, Hh)); B.at(0, Hh / 2, hl, 0, PI, 0, () => B.plane(WALL, W, Hh));
  B.mirror(() => { B.sweep(surf([0.5, 0.51, 0.52], 0.4), [[hw, 0, -hl], [hw, 0, hl]], [{ a: 0, b: 0, r: 0 }, { a: 0.06, b: 0, r: 0 }, { a: 0, b: 0.07, r: 0 }], { caps: false }); });   // coved floor edge
  // rear wall with the two doors and their windows
  const P = [], xs = [-hw, -0.64, -0.5, -0.14, -0.01, 0.01, 0.14, 0.5, 0.64, hw], ys = [0, 0.8, 1.36, 1.6, Hh]; for (const y of ys) for (const x of xs) P.push(x, y, -hl);
  B.grid(P, ys.length, xs.length, { facing: [0, 0, 1], cell: (i, j) => i === 1 && (j === 2 || j === 6) ? { glass: SK.glass } : j === 4 ? { sk: SK.rubber } : { sk: j === 0 || j === 8 || i === 3 ? WALL : CAB } });
  for (const s of [1, -1]) { B.rbox(STL, 0.03, 0.3, 0.03, 0.01, s * 0.1, 0.95, -hl + 0.04); B.tube(SK.yellow, [[s * 0.56, 0.9, -hl + 0.02], [s * 0.56, 0.95, -hl + 0.08], [s * 0.56, 1.3, -hl + 0.08], [s * 0.56, 1.35, -hl + 0.02]], 0.014, 6); B.rbox(SK.rubber, 0.42, 0.012, 0.012, 0, s * 0.32, 0.795, -hl + 0.006); }
  B.rbox(SK.alu, 1.3, 0.02, 0.1, 0.004, 0, 0.01, -hl + 0.06);
  // front bulkhead: cabinets, pass-through, attendant seat
  B.rbox(CAB, 0.7, 1.75, 0.4, 0.012, hw - 0.35, Hh / 2, hl - 0.2); B.rbox(CAB, 0.62, 0.6, 0.36, 0.012, -hw + 0.31, Hh - 0.3, hl - 0.18);
  for (const [y, n] of [[1.45, 'lab0'], [1.0, 'lab1'], [0.5, 'lab2']]) { B.rbox(ACR, 0.6, 0.38, 0.008, 0, hw - 0.36, y, hl - 0.405); B.rbox(SK.alu, 0.66, 0.014, 0.02, 0, hw - 0.35, y - 0.2, hl - 0.41); label(n, 0.2, hw - 0.36, y + 0.215, hl - 0.412, PI); B.cyl(SK.rubber, 0.018, 0.018, 0.012, hw - 0.14, y, hl - 0.41, 'z', 10); }
  B.at(-0.1, 1.2, hl - 0.004, 0, PI, 0, () => { B.rbox(SK.alu, 0.62, 0.46, 0.012, 0.004); B.rbox(SK.gloss, 0.56, 0.4, 0.012, 0.004, 0, 0, 0.004); });
  label('clock', 0.2, -0.1, 1.6, hl - 0.006, PI); label('nosmoke', 0.5, -0.72, 1.28, hl - 0.006, PI);
  const sa = [-0.1, 0, hl - 0.42];
  B.rbox(SK.black, 0.36, 0.32, 0.36, 0.03, sa[0], 0.2, sa[2]); B.rbox(CUSH, 0.5, 0.1, 0.48, 0.04, sa[0], 0.43, sa[2]); B.at(sa[0], 0.82, sa[2] + 0.25, 0.1, 0, 0, () => { B.rbox(CUSH, 0.5, 0.7, 0.1, 0.04); B.rbox(CUSH, 0.26, 0.18, 0.09, 0.04, 0, 0.43, -0.01); });
  B.mirror(() => B.tube(surf(g3(0.03), 0.9), [[0.19, 1.2, hl - 0.2], [0.05, 0.5, hl - 0.24]], 0.012, 4));
  // street side (+X): action wall, CPR seat, upper cabinets with sliding acrylic doors
  B.rbox(CAB, 0.36, 0.72, 2.2, 0.012, hw - 0.18, 0.36, -0.15); B.rbox(surf([0.2, 0.21, 0.22], 0.3), 0.38, 0.03, 2.24, 0.008, hw - 0.19, 0.735, -0.15);
  B.rbox(CAB, 0.34, 0.5, 2.9, 0.012, hw - 0.17, Hh - 0.25, -0.25);
  for (let k = 0; k < 4; k++) { const z = 0.85 - k * 0.72; B.rbox(ACR, 0.008, 0.4, 0.7, 0, hw - 0.345, Hh - 0.25, z); B.cyl(SK.rubber, 0.018, 0.018, 0.012, hw - 0.35, Hh - 0.25, z - 0.26, 'x', 10); label('lab' + (3 + k), 0.2, hw - 0.352, Hh - 0.025, z, -PI / 2); for (let q = 0; q < 5; q++) B.rbox(surf([[0.8, 0.8, 0.78], [0.1, 0.25, 0.5], [0.7, 0.1, 0.08], [0.85, 0.6, 0.1], [0.2, 0.5, 0.3]][(q + k) % 5], 0.6), 0.2, 0.12 + 0.05 * ((q * 7 + k) % 3), 0.11, 0.01, hw - 0.2, Hh - 0.43 + 0.03 * ((q * 7 + k) % 3), z - 0.26 + q * 0.13); }
  for (const y of [Hh - 0.46, Hh - 0.04]) B.rbox(SK.alu, 0.02, 0.016, 2.9, 0, hw - 0.345, y, -0.25);
  B.rbox(CUSH, 0.34, 0.08, 0.5, 0.03, hw - 0.19, 0.79, -0.75); B.rbox(CUSH, 0.06, 0.42, 0.5, 0.03, hw - 0.045, 1.02, -0.75);                    // CPR seat
  label('switches', 0.36, hw - 0.012, 1.08, 0.2, -PI / 2); label('o2', 0.1, hw - 0.012, 1.2, -0.1, -PI / 2); label('outlet', 0.07, hw - 0.012, 0.92, 0.55, -PI / 2); label('suction', 0.11, hw - 0.012, 1.2, -0.3, -PI / 2);
  for (const z of [-0.06, -0.14]) { B.cyl(STL, 0.022, 0.022, 0.03, hw - 0.02, 1.1, z, 'x', 10); B.cyl(surf(0x1c7a2c, 0.3), 0.028, 0.028, 0.008, hw - 0.01, 1.1, z, 'x', 12); }
  B.cyl(STL, 0.014, 0.014, 0.05, hw - 0.06, 1.07, -0.06, 'y', 8); B.cyl(ACR, 0.016, 0.016, 0.12, hw - 0.06, 1.16, -0.06, 'y', 8); B.ball(SK.steel, 0.007, 0.007, 0.007, hw - 0.06, 1.15, -0.06, 6);   // flowmeter
  B.cyl(ACR, 0.055, 0.05, 0.17, hw - 0.1, 0.99, -0.32, 'y', 12); B.cyl(SK.red, 0.058, 0.058, 0.02, hw - 0.1, 1.085, -0.32, 'y', 12); label('gauge', 0.07, hw - 0.012, 1.08, -0.42, -PI / 2); B.tube(ACR, [[hw - 0.1, 1.1, -0.32], [hw - 0.14, 1.16, -0.36], [hw - 0.03, 1.12, -0.42]], 0.006, 5);   // suction canister
  B.rbox(SK.red, 0.12, 0.2, 0.14, 0.015, hw - 0.07, 0.86, 0.9); B.rbox(ACR, 0.12, 0.05, 0.14, 0.01, hw - 0.07, 0.985, 0.9); label('sharps', 0.11, hw - 0.132, 0.86, 0.9, -PI / 2);
  for (let i = 0; i < 3; i++) { B.rbox(surf([[0.13, 0.08, 0.3], [0.03, 0.12, 0.38], [0.02, 0.2, 0.2]][i], 0.6), 0.1, 0.07, 0.22, 0.006, hw - 0.06, 1.42 - i * 0.085, 0.72); label('glove' + i, 0.065, hw - 0.112, 1.42 - i * 0.085, 0.72, -PI / 2); }
  B.rbox(surf([0.2, 0.21, 0.22], 0.3), 0.3, 0.02, 0.36, 0.006, hw - 0.16, 0.99, 1.15); B.rbox(SK.black, 0.22, 0.26, 0.3, 0.02, hw - 0.15, 1.13, 1.15); label('monitor', 0.26, hw - 0.262, 1.14, 1.15, -PI / 2); B.rbox(SK.yellow, 0.2, 0.03, 0.03, 0.01, hw - 0.15, 1.275, 1.15);
  // curb side (-X): squad bench, overhead locker, side door with window, extinguisher
  B.rbox(CAB, 0.5, 0.42, 2.1, 0.012, -hw + 0.25, 0.21, -0.65); B.rbox(CUSH, 0.5, 0.09, 2.08, 0.03, -hw + 0.25, 0.46, -0.65);
  for (let k = 0; k < 3; k++) { B.rbox(CUSH, 0.08, 0.4, 0.66, 0.03, -hw + 0.05, 0.78, -1.33 + k * 0.69); B.rbox(SK.chrome, 0.05, 0.012, 0.04, 0.004, -hw + 0.32, 0.51, -1.2 + k * 0.69); B.box(surf(g3(0.03), 0.9), 0.3, 0.004, 0.045, -hw + 0.24, 0.508, -1.2 + k * 0.69); }
  for (const z of [-1.2, -0.1]) B.rbox(SK.black, 0.012, 0.02, 0.5, 0, -hw + 0.505, 0.24, z);
  B.rbox(CAB, 0.32, 0.4, 2.1, 0.012, -hw + 0.16, Hh - 0.2, -0.65); for (let k = 0; k < 3; k++) { B.rbox(ACR, 0.008, 0.32, 0.66, 0, -hw + 0.325, Hh - 0.2, -1.33 + k * 0.69); B.cyl(SK.rubber, 0.018, 0.018, 0.012, -hw + 0.33, Hh - 0.2, -1.1 + k * 0.69, 'x', 10); }
  const Pd = [], zs2 = [0.5, 0.62, 1.12, 1.3], ys2 = [0, 0.78, 1.36, 1.66]; for (const y of ys2) for (const z of zs2) Pd.push(-hw + 0.004, y, z);
  B.grid(Pd, 4, 4, { facing: [1, 0, 0], cell: (i, j) => i === 1 && j === 1 ? { glass: SK.glass } : { sk: CAB } });
  B.rbox(SK.rubber, 0.01, 1.68, 0.02, 0, -hw + 0.008, 0.84, 0.49); B.rbox(SK.rubber, 0.01, 1.68, 0.02, 0, -hw + 0.008, 0.84, 1.31); B.rbox(STL, 0.03, 0.05, 0.16, 0.01, -hw + 0.03, 0.95, 0.62); B.tube(SK.yellow, [[-hw + 0.02, 0.8, 1.4], [-hw + 0.08, 0.86, 1.4], [-hw + 0.08, 1.4, 1.4], [-hw + 0.02, 1.46, 1.4]], 0.014, 6);
  B.cyl(SK.red, 0.055, 0.055, 0.34, -hw + 0.09, 0.3, 1.52, 'y', 12); B.cyl(SK.black, 0.02, 0.03, 0.06, -hw + 0.09, 0.5, 1.52, 'y', 8); label('ext', 0.08, -hw + 0.148, 0.3, 1.52, PI / 2);
  // ceiling: dome lights, grab rails, IV hooks, vent
  const domes = [[-0.45, 1.15], [0.45, 1.15], [-0.45, 0], [0.45, 0], [-0.45, -1.15], [0.45, -1.15]];
  for (const [x, z] of domes) { B.cyl(SK.alu, 0.105, 0.105, 0.012, x, Hh - 0.006, z, 'y', 20); B.at(x, Hh - 0.014, z, PI / 2, 0, 0, () => B.plane(DOME, 0.15, 0.15)); }
  for (const x of [-0.12, 0.3]) { B.tube(x < 0 ? SK.yellow : STL, [[x, Hh - 0.005, -1.25], [x, Hh - 0.08, -1.18], [x, Hh - 0.08, 1.0], [x, Hh - 0.005, 1.07]], 0.016, 8); for (const z of [-0.4, 0.3]) B.tube(STL, [[x, Hh, z], [x, Hh - 0.08, z]], 0.01, 6); }
  for (const z of [0.5, -0.2]) B.tube(STL, [[0.1, Hh, z], [0.1, Hh - 0.05, z], [0.13, Hh - 0.07, z], [0.15, Hh - 0.05, z]], 0.005, 5);
  B.rbox(SK.alu, 0.3, 0.012, 0.3, 0.004, -0.75, Hh - 0.006, 1.5); for (let i = 0; i < 6; i++) B.box(SK.under, 0.26, 0.004, 0.02, -0.75, Hh - 0.014, 1.39 + i * 0.044);
  // cot mount on the floor
  B.rbox(SK.alu, 0.08, 0.012, 1.9, 0.004, 0.33, 0.006, -0.3); B.rbox(STL, 0.3, 0.05, 0.1, 0.015, 0.05, 0.03, 0.72);
  const acr = new THREE.MeshStandardMaterial({ color: 0xbfd6dc, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false });
  const mats = { dry: makeSurfMat({ lamps, wet: false }), texsheet: new THREE.MeshStandardMaterial({ map: sh.sheet, roughness: 0.45, emissiveMap: sh.sheet, emissive: 0xffffff, emissiveIntensity: 0.12 }), texfloor: new THREE.MeshStandardMaterial({ map: sh.floor, roughness: 0.42 }), acrylic: acr, glass: makeGlassMat({ wet: false, opacity: 0.3 }) };
  const g = groupOf(B, mats), group = new THREE.Group(); group.name = 'patientCompartment'; group.add(g['']);
  g[''].traverse(m => { if (m.isMesh) { m.castShadow = false; if (m.material === acr) m.renderOrder = 4; } });
  const mark = (n, x, y, z, tx, ty, tz) => { const o = new THREE.Object3D(); o.name = n; o.applyMatrix4(faceMatrix(x, y, z, tx, ty, tz)); o.userData.target = new THREE.Vector3(tx, ty, tz); group.add(o); return o; };
  const patientSpot = mark('patientSpot', 0.05, 0, -0.25, 0.05, 0, 1), seatAttendant = mark('seatAttendant', sa[0], 1.12, sa[2] - 0.05, 0.05, 0.8, -0.3), cameraHome = mark('cameraHome', -0.55, 1.28, -1.25, 0.15, 0.75, 0.25);
  const lights = domes.filter((d, i) => i % 2 === 0).map(([x, z]) => { const l = new THREE.PointLight(0xeaf2ff, 1.5, 6, 1.6); l.position.set(0, Hh - 0.12, z); group.add(l); return l; });
  const fill = new THREE.HemisphereLight(0xdfe8f0, 0x50545a, 0.22); group.add(fill); lights.push(fill);
  let stretcher = null;
  if (opts.stretcher !== false) { stretcher = buildStretcher({ height: 0.55, backrest: 0.35 }); stretcher.group.position.copy(patientSpot.position); group.add(stretcher.group); }
  const api = {
    group, bounds: new THREE.Box3(new THREE.Vector3(-hw, 0, -hl), new THREE.Vector3(hw, Hh, hl)), patientSpot, seatAttendant, cameraHome, lights, stretcher, materials: mats,
    setLights(on) { for (const l of lights) l.visible = !!on; const v = on ? 2.2 : 0; lamps[3] = 0.9 * v; lamps[4] = 0.96 * v; lamps[5] = v; },
    tris: B.tris(),
  };
  api.setLights(opts.lights !== false);
  return api;
}

// ---------------------------------------------------------------------------------------------- dev harness

export async function devDemo(ctx) {
  const { scene, camera, controls, params } = ctx, v = params.get('v') || '', lod = +(params.get('lod') || 0);
  const gm = patchWet(new THREE.MeshStandardMaterial({ color: 0x3d3d40, roughness: 0.88 }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ups = [], info = {}; window.__veh = info;
  const time = (name, fn) => { const t0 = performance.now(), r = fn(); info[name + 'Ms'] = +(performance.now() - t0).toFixed(1); return r; };
  const stats = o => { let calls = 0, tris = 0; o.traverse(m => { if (m.isMesh && m.visible) { calls++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.geometry.instanceCount || 1); } }); return { calls, tris: Math.round(tris) }; };
  info.stats = stats;
  if (CAR_TYPES.includes(v)) {
    const c = time('car', () => buildCar(v, { lod, seed: 3 })); scene.add(c.group); c.lights.setHead(1); c.lights.setEmergency(true); ups.push((dt, t) => c.lights.update(dt, t));
    info.car = c; info.carStats = stats(c.group); camera.position.set(4.5, 1.8, 5.5); controls.target.set(0, 0.8, 0);
  } else if (v === 'interior') {
    const it = time('interior', () => buildAmbulanceInterior()); it.group.position.y = 0.02; scene.add(it.group); info.interior = it; info.interiorStats = stats(it.group);
    const p = it.cameraHome.position, q = it.cameraHome.userData.target; camera.position.set(p.x, p.y + 0.02, p.z); controls.target.set(q.x, q.y, q.z); camera.fov = 72; camera.near = 0.03; camera.updateProjectionMatrix();
  } else if (v === 'stretcher' || v === 'moto') {
    const st = time('stretcher', () => buildStretcher()); st.group.position.x = -1; scene.add(st.group); info.stretcher = st; info.stretcherStats = stats(st.group);
    const mo = time('moto', () => buildMotorcycle()), m2 = buildMotorcycle({ onSide: true, color: 0x1b3562 }); mo.group.position.set(1.2, 0, 0); m2.group.position.set(3.2, 0, 0.5); scene.add(mo.group, m2.group); info.motoStats = stats(mo.group);
    ups.push((dt, t) => { st.setHeight(0.5 + 0.5 * Math.sin(t * 0.7)); st.setBackrest(0.5 + 0.5 * Math.sin(t * 0.5)); });
    camera.position.set(1.5, 1.5, 3.4); controls.target.set(0.3, 0.6, 0);
  } else if (v === 'lineup') {
    CAR_TYPES.forEach((ty, i) => { for (let l = 0; l < 3; l++) { const c = time(ty + l, () => buildCar(ty, { lod: l, seed: i * 7 + l })); c.group.position.set(i * 3.4 - 15, 0, l * -14); scene.add(c.group); c.lights.setHead(1); c.lights.setEmergency(true); ups.push((dt, t) => c.lights.update(dt, t)); info[ty + l] = stats(c.group); } });
    for (const [k, ty] of ['sedan', 'suv', 'hatch'].entries()) { const c = buildCar(ty, { lod: 2 }), im = new THREE.InstancedMesh(c.geometry, c.material, 10), m4 = new THREE.Matrix4(), rng = makeRng(5 + k); for (let i = 0; i < 10; i++) { im.setMatrixAt(i, m4.makeRotationY(k ? Math.PI : 0).setPosition(i * 2.7 - 12, 0, -40 - k * 6)); im.setColorAt(i, new THREE.Color(rng.pick(CAR_COLORS))); } im.castShadow = true; scene.add(im); }
    camera.position.set(-2, 7, 16); controls.target.set(0, 0.8, -6);
  } else {
    const amb = time('amb', () => buildAmbulance()); scene.add(amb.group); info.amb = amb; info.ambStats = stats(amb.group);
    amb.lights.setEmergency(params.get('em') !== '0'); amb.lights.setHead(1);
    // stand-ins for the point lights the game hangs on the anchors
    const pl = new THREE.PointLight(0xffffff, 0, 22, 2), pr = new THREE.PointLight(0xffffff, 0, 22, 2); amb.anchors.barL.add(pl); amb.anchors.barR.add(pr); pl.position.set(1.6, 0.7, 1.0); pr.position.set(-1.6, 0.7, 1.0);
    for (const n of ['headL', 'headR']) { const sl = new THREE.SpotLight(0xfff2dd, 160, 60, 0.45, 0.7, 1.6); amb.anchors[n].add(sl); sl.position.set(0, 0, 0); sl.target.position.set(0, -0.12, 1); amb.anchors[n].add(sl.target); }
    ups.push((dt, t) => { amb.lights.update(dt, t); U.uStrobe.value.copy(amb.lights.strobe); pl.color.copy(amb.lights.strobeL); pr.color.copy(amb.lights.strobeR); pl.intensity = pr.intensity = 14 * U.uNight.value; for (const n of ['headL', 'headR']) amb.anchors[n].children[0].intensity = 160 * U.uNight.value; });
    if (params.get('doors')) { amb.doors.setRear(1); amb.doors.setSide(0.8); amb.doors.setDriver(0.7); amb.lights.setInterior(true); amb.lights.setSceneLights(true); }
    if (params.get('dirt')) { amb.setDirt(+params.get('dirt')); amb.setDamage(+params.get('dirt')); amb.setWipers(true); }
    if (!v) [['sedan', -4.6, 3.5], ['suv', -4.8, -3], ['pickup', 5.4, -7]].forEach(([ty, x, z], i) => { const c = buildCar(ty, { lod: 1, seed: 11 + i }); c.group.position.set(x, 0, z); c.group.rotation.y = i * 0.2 - 0.1; scene.add(c.group); c.lights.setHead(1); });
    camera.position.set(6.5, 2.6, 8.5); controls.target.set(0, 1.3, -0.5);
  }
  controls.update();
  return (dt, t) => { for (const u of ups) u(dt, t); };
}

