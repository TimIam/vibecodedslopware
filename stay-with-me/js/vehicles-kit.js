// Shared kit for the vehicles: geometry builder, skins, materials, wheels, decal sheet (see vehicles.js for the overview).

import * as THREE from 'three';
import { U, patchWet, glowTexture } from './gfx.js';
import { makeRng, clamp, lerp, smooth, makeCanvas, canvasTex, TAU, fbm2 } from './util.js';

// ---------------------------------------------------------------------------------------------- small maths

export const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const g3 = v => [v, v, v];
export const rad = d => d * Math.PI / 180;

// Monotone cubic through [x, y] keys (no overshoot): the body lines of every vehicle are made of these.
export function curve(keys) {
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
export function stations(...lists) {
  const a = [].concat(...lists).sort((p, q) => p - q), out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
}
export const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
// Height of a wheel-arch cut at z (0 outside it).
export const archY = (z, cz, cy, R) => { const d = z - cz; return Math.abs(d) < R ? cy + Math.sqrt(R * R - d * d) : 0; };
export const archStations = (cz, R, n) => range(0, Math.PI, n).map(a => cz - R * Math.cos(a));

// ---------------------------------------------------------------------------------------------- skins

// A skin says which material a piece of geometry is drawn with and its per-vertex constants
// (linear colour, roughness, metalness, paint mask, lamp channel). `grid` [nx, ny] turns the UVs into an LED lattice.
let _skinId = 0;
export function skin(mat, col = [1, 1, 1], rough = 0.5, metal = 0, paint = 0, lamp = 0, grid = null) {
  return { id: ++_skinId, mat, col, s: [rough, metal, paint, lamp], grid, fx: null };
}
// The same skin with a procedural surface effect (see FX in the materials section): withFx(SK.black, FX.grain).
export const withFx = (sk, id, par = 0) => ({ ...sk, id: ++_skinId, fx: [id, par] });
export const SK = {
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
export const surf = (col, rough = 0.5, metal = 0) => skin('surf', Array.isArray(col) ? col : lin(col), rough, metal);
// Lamp lens: coloured plastic that glows with lamp channel `ch`; grid = LED lattice across the face.
export const lens = (ch, col, grid = null, rough = 0.14) => skin('surf', Array.isArray(col) ? col : lin(col), rough, 0, 0, ch, grid);
export const LENS = { red: lin(0x7a0a0a), amber: lin(0xb86a08), clear: g3(0.6), smoke: g3(0.12), blue: lin(0x0a1e7a) };

// ---------------------------------------------------------------------------------------------- builder

// Corner-rounded section: control points {x,y,z,r,flat,k,sub}. r > 0 fillets the corner with k segments, r = 0 leaves a
// hard crease (the point is doubled so the two sides do not share a normal), flat = a plain point on a smooth run,
// sub = split the span after this point into that many cells. Returns the points and, for every cell between
// neighbouring points, a tag: c for cells inside corner c, c + 0.5 for the span from corner c to c + 1.
export function expandSection(cp, closed, seg) {
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
export function mirrorRing(half, closed = true) {
  const out = half.slice();
  for (let i = half.length - 2; i >= (closed ? 1 : 0); i--) out.push({ ...half[i], x: -half[i].x, sub: i > 0 ? half[i - 1].sub : undefined });
  out[half.length - 1] = { ...half[half.length - 1], sub: half[half.length - 2].sub };
  return out;
}

export class Builder {
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
    if (!a) { a = { grp, mat, p: [], n: [], uv: [], c: [], s: [], f: [], i: [], nv: 0 }; this.accs.set(k, a); }
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
    const gx = sk.grid ? sk.grid[0] : 0, gy = sk.grid ? sk.grid[1] : 0, col = sk.col, s = sk.s, f0 = sk.fx ? sk.fx[0] : 0, f1 = sk.fx ? sk.fx[1] : 0;
    const vert = (v, ch) => {
      const k = v * 3; a.p.push(X[k], X[k + 1], X[k + 2]); a.n.push(Q[k], Q[k + 1], Q[k + 2]);
      if (charted) { const uv = this.chart(ch, X[k], X[k + 1], X[k + 2]); a.uv.push(uv[0], uv[1]); }
      else if (isSurf && sk.mat !== 'tex') { if (sk.grid && UV) a.uv.push(UV[v * 2] * gx, UV[v * 2 + 1] * gy); else a.uv.push(-1, -1); }
      else if (UV) a.uv.push(UV[v * 2], UV[v * 2 + 1]); else a.uv.push(0, 0);
      if (isSurf) { a.c.push(col[0], col[1], col[2]); a.s.push(s[0], s[1], s[2], s[3]); a.f.push(f0, f1); }
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
      if (a.c.length) { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(a.c), 3)); g.setAttribute('aSurf', new THREE.BufferAttribute(new Float32Array(a.s), 4)); g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(a.f), 2)); }
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
export const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3();
export function faceMatrix(x, y, z, tx, ty, tz) {
  const Z = new THREE.Vector3(tx - x, ty - y, tz - z).normalize(), X = new THREE.Vector3(0, 1, 0).cross(Z).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(x, y, z);
}

// ---------------------------------------------------------------------------------------------- materials

// Rain on bodywork and glass: standing beads everywhere, running streaks on walls. Bump from screen-space derivatives
// of a procedural height (no tangents needed).
export const GLSL_WATER = `
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
export const WATER_VS = s => s.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vObjN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP=transformed; vObjN=normal;');
export const WATER_FS_NORMAL = `#include <normal_fragment_maps>
  { float vhW=uWet*(1.0-smoothstep(3.0,20.0,length(vViewPosition)));
    if(vhW>0.01){ float hh=vhWater(vObjP,normalize(vObjN+vec3(0.0,1e-5,0.0)),uTime,uRain)*0.0011*vhW; normal=vhBump(normal,-vViewPosition,hh); } }`;

// Procedural surface detail picked per vertex (attribute aFx = [id, parameter]; see FX): returns height in metres,
// an albedo multiplier and a roughness offset. p, n are object-space; every pattern fades out before it can alias.
export const FX = { tyre: 1, grain: 2, brushed: 3, weave: 4, diamond: 5, ribbed: 6, perf: 7 };
const GLSL_FX = `
  float fxN(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(vhH(i),vhH(i+vec2(1.0,0.0)),f.x),mix(vhH(i+vec2(0.0,1.0)),vhH(i+vec2(1.0,1.0)),f.x),f.y); }
  vec3 fxEval(float id, float par, vec3 p, vec3 n){
    vec3 an=abs(n); vec2 q=(an.y>an.x && an.y>an.z) ? p.xz : (an.x>an.z ? p.zy : p.xy);
    float h=0.0, alb=1.0, ro=0.0;
    if(id<1.5){
      // tyre, wheel-local (axle along X), par = outer radius: shoulder blocks, sipes, sidewall ribs and lettering
      float R=max(par,0.05), r=length(p.yz), rr=r/R, a=atan(p.z,p.y+1e-7), u=a*R, sx=abs(p.x);
      float fade=1.0-smoothstep(0.003,0.014,fwidth(u)+fwidth(r));
      float tread=smoothstep(0.93,0.955,rr)*(1.0-smoothstep(0.55,0.9,an.x));
      float k=u/0.046+step(0.0,p.x)*0.5, gg=abs(fract(k)-0.5);
      float groove=smoothstep(0.36,0.43,gg)*smoothstep(0.035,0.05,sx+0.012*sin(k*6.2832));
      float sipe=smoothstep(0.42,0.48,abs(fract(u/0.0115+p.x*9.0)-0.5))*0.5;
      float tr=max(groove,sipe*(1.0-groove))*tread*fade;
      h=-tr*0.005; alb=mix(1.0,0.42,tr)*mix(1.0,1.35,tread*fxN(vec2(u*9.0,p.x*30.0)));
      float side=(1.0-tread)*smoothstep(0.3,0.7,an.x)*fade;
      float rib=(1.0-smoothstep(0.004,0.008,abs(rr-0.915)))+(1.0-smoothstep(0.002,0.005,abs(rr-0.895)))*0.6+(1.0-smoothstep(0.003,0.007,abs(rr-0.74)));
      float band=step(0.795,rr)*step(rr,0.865)*step(0.45,sin(a*2.0+0.6));
      float cu=u/0.021, cell=floor(cu); vec2 sub=floor(vec2(fract(cu)*4.0,(rr-0.795)/0.07*5.0));
      float glyph=step(0.22,vhH(vec2(cell,3.0)))*step(sub.x,2.5)*step(0.42,vhH(vec2(cell*7.0+sub.x,sub.y+cell)));
      float fine=0.5+0.5*sin(a*260.0);
      h+=side*(rib*0.0016+band*glyph*0.0011+step(0.9,rr)*fine*0.0004);
      alb*=1.0+side*(band*glyph*0.55+rib*0.18); ro=-0.1*side*band*glyph;
    } else if(id<2.5){
      float fade=1.0-smoothstep(0.0006,0.003,fwidth(q.x)+fwidth(q.y));
      float g=fxN(q*820.0)*0.6+fxN(q*1900.0+3.7)*0.4; h=g*0.00022*fade; alb=1.0+(g-0.5)*0.16*fade; ro=(fxN(q*37.0)-0.5)*0.14;
    } else if(id<3.5){
      vec2 w=par>0.5 ? q.yx : q; float s=fxN(vec2(w.x*22.0,w.y*2600.0))*0.6+fxN(vec2(w.x*6.0,w.y*900.0))*0.4;
      float fade=1.0-smoothstep(0.0004,0.002,fwidth(w.y)); ro=(s-0.5)*0.26*fade; alb=1.0+(s-0.5)*0.12*fade; h=s*0.00003*fade;
    } else if(id<4.5){
      float pitch=par>0.0 ? par : 0.0017; vec2 w=q*6.2832/pitch; float fade=1.0-smoothstep(0.15,0.5,(fwidth(q.x)+fwidth(q.y))/pitch);
      float wv=sin(w.x)*sin(w.y); h=wv*0.00014*fade; alb=1.0+(0.14*wv*fade)+(fxN(q*14.0)-0.5)*0.12; ro=0.03*wv*fade;
    } else if(id<5.5){
      vec2 c=q/0.03; vec2 ci=floor(c), f=fract(c)-0.5; float o=mod(ci.x+ci.y,2.0); vec2 d=o>0.5 ? f.xy : f.yx;
      float fade=1.0-smoothstep(0.1,0.45,(fwidth(q.x)+fwidth(q.y))/0.03);
      float l=(1.0-smoothstep(0.55,1.0,length(d*vec2(2.3,6.5))))*fade; h=l*0.0014; ro=-0.14*l+(fxN(q*60.0)-0.5)*0.12; alb=1.0+0.1*l-(1.0-fade)*0.0;
    } else if(id<6.5){
      vec2 w=par>0.5 ? q.yx : q; float pitch=0.011; float fade=1.0-smoothstep(0.12,0.45,fwidth(w.x)/pitch);
      float s=abs(fract(w.x/pitch)-0.5)*2.0; float t=smoothstep(0.25,0.75,s); h=t*0.0013*fade; alb=mix(1.0,0.72+0.28*t,fade);
    } else {
      float pitch=par>0.0 ? par : 0.006; vec2 c=q/pitch; c.x+=0.5*mod(floor(c.y),2.0); float fade=1.0-smoothstep(0.12,0.4,(fwidth(q.x)+fwidth(q.y))/pitch);
      float hole=1.0-smoothstep(0.24,0.32,length(fract(c)-0.5)); alb=mix(0.72,1.0-0.9*hole,fade); h=-hole*0.0009*fade;
    }
    return vec3(h,alb,ro); }`;

// The workhorse: colour, roughness, metalness and lamp channel come from vertex attributes, so one material (one draw
// call) covers chrome, rubber, plastic and every lamp of a vehicle. lamps = Float32Array(n * 3) of linear emissive
// colours indexed by the lamp channel (slot 0 stays black). paint = uniform colour multiplied in where the paint mask
// is set. flake / grime = { value } uniforms: metallic flake in the painted panels, road film low on the body (by world
// height). fill = daylight bounce for interiors (a fraction of the albedo added as light, fading out at night). Lamp lenses with a `grid` show an LED lattice with reflector cups a centimetre behind the lens (parallax).
export function makeSurfMat({ physical = false, lamps = null, paint = null, wet = true, side = THREE.FrontSide, map = null, inst = false, flake = null, grime = null, fill = 0 } = {}) {
  const m = physical ? new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.045, side, map }) : new THREE.MeshStandardMaterial({ vertexColors: true, side, map });
  const nL = lamps ? lamps.length / 3 : 0;
  m.userData.lamps = lamps; m.userData.paint = paint; m.userData.flake = flake; m.userData.grime = grime;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uWet: wet ? U.uWet : { value: 0 }, uRain: wet ? U.uRain : { value: 0 }, uTime: U.uTime });
    if (lamps) sh.uniforms.uLamp = { value: lamps }; if (paint) sh.uniforms.uPaint = paint; if (flake) sh.uniforms.uFlake = flake; if (grime) sh.uniforms.uGrime = grime; if (fill) sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aSurf; attribute vec2 aFx; varying vec4 vSurf; varying vec2 vLuv; varying vec2 vFx; varying vec3 vObjP; varying vec3 vObjN; varying float vWY; ${lamps ? `uniform vec3 uLamp[${nL}]; varying vec3 vLampE;` : ''}`)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nif(aSurf.w>0.5) vMapUv=vec2(0.004,0.008);\n#endif')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSurf=aSurf; vLuv=uv; vFx=aFx; vObjP=transformed; vObjN=normal; ${lamps ? `vLampE=uLamp[int(clamp(aSurf.w,0.0,${nL - 1}.0)+0.5)];` : ''}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 wp=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp=instanceMatrix*wp;\n#endif\n vWY=(modelMatrix*wp).y; }')
      // instanced use (parked cars): the instance colour tints painted panels only, not glass, tyres or trim
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.xyz=color.rgb*mix(vec3(1.0),instanceColor.xyz,aSurf.z);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 vSurf; varying vec2 vLuv; varying vec2 vFx; varying vec3 vObjP; varying vec3 vObjN; varying float vWY; uniform float uWet,uRain,uTime;
      ${lamps ? 'varying vec3 vLampE;' : ''} ${paint ? 'uniform vec3 uPaint;' : ''} ${flake ? 'uniform float uFlake;' : ''} ${grime ? 'uniform float uGrime;' : ''} ${fill ? 'uniform float uNight;' : ''}
      ${GLSL_WATER} ${GLSL_FX}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${paint ? 'diffuseColor.rgb*=mix(vec3(1.0),uPaint,vSurf.z);' : ''}
        vec3 vhFx=vec3(0.0,1.0,0.0); vec3 vhON=normalize(vObjN+vec3(0.0,1e-5,0.0));
        if(vFx.x>0.5){ vhFx=fxEval(vFx.x,vFx.y,vObjP,vhON); diffuseColor.rgb*=vhFx.y; }
        float vhGr=0.0;
        ${grime ? `vhGr=clamp(uGrime*(1.0-smoothstep(0.1,1.15,vWY))*(0.5+1.0*fxN(vObjP.zy*6.0+vObjP.x*2.3))*(1.0-0.6*vSurf.y),0.0,1.0)*step(vSurf.w,0.5);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.15,0.132,0.108),vhGr*0.82);` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=clamp(vSurf.x+vhFx.z,0.02,1.0); roughnessFactor=mix(roughnessFactor,0.92,vhGr); roughnessFactor=mix(roughnessFactor,min(roughnessFactor,0.2),uWet*0.8);
        diffuseColor.rgb*=1.0-0.25*uWet*(1.0-vSurf.y);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor=vSurf.y*(1.0-vhGr); ${flake ? 'metalnessFactor=mix(metalnessFactor,0.62,uFlake*vSurf.z*(1.0-vhGr));' : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if(vFx.x>0.5) normal=vhBump(normal,-vViewPosition,vhFx.x);
        ${flake ? `if(uFlake>0.0 && vSurf.z>0.5){ float fd=1.0-smoothstep(3.0,12.0,length(vViewPosition)); vec3 c3=floor(vObjP*1300.0);
          vec3 rnd=vec3(vhH(c3.xy+c3.z*1.7),vhH(c3.yz+c3.x*2.3),vhH(c3.zx+c3.y*3.1))-0.5; normal=normalize(normal+rnd*0.24*uFlake*fd); }` : ''}
        ${physical && wet ? `{ float vhW=uWet*vSurf.z*(1.0-smoothstep(3.0,16.0,length(vViewPosition)));
          if(vhW>0.01){ float hh=vhWater(vObjP,vhON,uTime,uRain)*0.0011*vhW; normal=vhBump(normal,-vViewPosition,hh); } }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${lamps ? `{ float led=1.0;
          if(vLuv.x>-0.5 && vSurf.w>0.5){
            // lattice tangent frame from screen-space derivatives: the LEDs sit behind the lens and shift with the view
            vec3 vp=-vViewPosition, dpx=dFdx(vp), dpy=dFdy(vp); vec2 dux=dFdx(vLuv), duy=dFdy(vLuv), luv=vLuv; float det=dux.x*duy.y-dux.y*duy.x;
            vec3 Vv=normalize(vViewPosition);
            if(abs(det)>1e-10){ vec3 T=(dpx*duy.y-dpy*dux.y)/det, Bt=(dpy*dux.x-dpx*duy.x)/det; float nv=max(abs(dot(Vv,normal)),0.3);
              vec3 sft=(Vv-normal*dot(Vv,normal))/nv*0.011; luv-=vec2(dot(sft,T)/max(dot(T,T),1e-9),dot(sft,Bt)/max(dot(Bt,Bt),1e-9)); }
            vec2 g=fract(luv)-0.5; float d=length(g), core=1.0-smoothstep(0.07,0.17,d), cup=1.0-smoothstep(0.2,0.47,d), wall=smoothstep(0.3,0.47,d)*cup;
            float aa=clamp(max(fwidth(vLuv.x),fwidth(vLuv.y))*1.3,0.0,1.0);
            float flute=0.9+0.1*sin(vLuv.x*18.85);
            led=mix((0.12+0.55*cup+2.7*core+0.5*wall)*flute,0.8,aa);
            diffuseColor.rgb*=mix((0.3+0.5*cup+0.7*core+0.9*wall)*flute,0.8,aa); }
          totalEmissiveRadiance+=vLampE*led; }` : ''}
        ${fill ? `totalEmissiveRadiance+=diffuseColor.rgb*${fill.toFixed(3)}*mix(1.0,0.06,uNight);` : ''}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=vSurf.z*(1.0-vhGr);\n#endif`);
  };
  m.customProgramCacheKey = () => `vhsurf2${physical ? 1 : 0}${nL}${paint ? 1 : 0}${wet ? 1 : 0}${map ? 1 : 0}${inst ? 1 : 0}${flake ? 1 : 0}${grime ? 1 : 0}${fill ? fill.toFixed(3) : 0}`;
  return m;
}

// Clear-coated paint carrying the livery atlas. grime = texture in the same UV layout: R dirt, G damage order, B bare
// metal and, with vinyl = true, A = reflective sheeting (satin, hardly any clearcoat, faintly bright at night).
// normalMap = panel seams, rivets and sheet waviness in the same layout.
export function makePaintMat({ map, grime, normalMap = null, vinyl = false }) {
  const m = new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035, normalMap });
  const un = m.userData.u = { tGrime: { value: grime }, uDirt: { value: 0 }, uDamage: { value: 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, un, { uWet: U.uWet, uRain: U.uRain, uTime: U.uTime, uNight: U.uNight });
    sh.vertexShader = WATER_VS(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vObjP; varying vec3 vObjN; uniform sampler2D tGrime; uniform float uDirt,uDamage,uWet,uRain,uTime,uNight; ${GLSL_WATER}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 vhG=vec3(0.0); float vhVin=0.0;
        #ifdef USE_MAP
        { vec4 g4=texture2D(tGrime,vMapUv); vhG=g4.rgb; ${vinyl ? 'vhVin=g4.a;' : ''} }
        #endif
        float vhDirt=clamp(vhG.r*uDirt*1.7,0.0,1.0)*step(0.001,uDirt);
        float vhDmg=smoothstep(1.02-uDamage,1.06-uDamage,vhG.g)*step(0.001,uDamage);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.13,0.11,0.085),vhDirt*0.92);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(0.045),vec3(0.55),vhG.b),vhDmg);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,0.5,vhVin*0.85); roughnessFactor=mix(roughnessFactor,0.95,vhDirt); roughnessFactor=mix(roughnessFactor,0.5,vhDmg);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,vhG.b,vhDmg);')
      .replace('#include <normal_fragment_maps>', WATER_FS_NORMAL)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n#ifdef USE_CLEARCOAT\nclearcoatNormal=normal;\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vhVin*0.045*uNight*(1.0-vhDirt);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=(1.0-vhDirt)*(1.0-vhDmg)*(1.0-0.7*vhVin);\n#endif');
  };
  m.customProgramCacheKey = () => 'vhpaint' + (vinyl ? 1 : 0) + (normalMap ? 1 : 0);
  return m;
}

// Tinted glass: reflections keep their strength where the pane is otherwise see-through, rain beads on the outside.
export function makeGlassMat({ color = 0x0b1012, opacity = 0.4, wet = true } = {}) {
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
export function makeGlow(lamps, items) {
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
export function glowGeo(items) {
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
export function wheelInto(B, { R, W, rimR, seg = 36, style = 'alloy', grooves = 3, spokes = 5, rimSk = SK.steel, lugs = 8, lite = false }) {
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
  B.lathe(lite && seg < 12 ? SK.tyre : withFx(SK.tyre, FX.tyre, R), tyre, { axis: 'x', seg });
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
export function makeWheel(mat, spec, side, dual = 0) {
  const B = new Builder({ single: () => 'surf' });
  const emit = () => { wheelInto(B, spec); if (dual) B.at(-dual, 0, 0, () => wheelInto(B, { ...spec, style: 'cap', grooves: spec.grooves, lugs: 0 })); };
  if (side > 0) emit(); else { B.M.makeScale(-1, 1, 1); B.neg = true; emit(); }
  const o = new THREE.Object3D(), ms = B.build({ surf: mat })[''];
  for (const m of ms) o.add(m);
  o.userData.tris = B.tris();
  return o;
}

export const FONT = (px, w = 700) => `${w} ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
export const C_RED = '#8a1414', C_GOLD = '#d2a01c';

// Small shared decal sheet: number plates and the few bits of lettering that sit on non-paint parts.
let _decal = null;
export function decalSheet() {
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
export const SK_DECAL = skin('tex'), SK_CAB = skin('texcab'), SK_MDT = skin('texmdt');

export const LAMP_N = 64, E_RED = [1, 0.02, 0.012], E_WHT = [1, 0.95, 0.86], E_AMB = [1, 0.38, 0.015], E_COOL = [0.84, 0.93, 1];
// n flashes in the first half of each period, dark for the second half (the other side's turn)
export const burst = (t, period, phase, n) => { const x = (((t / period + phase) % 1) + 1) % 1; return x < 0.5 && ((x * 2 * n) % 1) < 0.55 ? 1 : 0; };
export const SK_DGLASS = surf([0.13, 0.155, 0.18], 0.05, 0.9), SK_SEAT = surf([0.045, 0.045, 0.05], 0.85), SK_GOLD = surf(0xc9a227, 0.35, 0.6), SK_PWHITE = surf(g3(0.72), 0.2);
export const E_BLUE = [0.05, 0.16, 1];

export function wheelGeo(spec, side, dual = 0) {
  const B = new Builder({ single: () => 'surf' });
  if (side < 0) { B.M.makeScale(-1, 1, 1); B.neg = true; }
  wheelInto(B, spec); if (dual) B.at(-dual, 0, 0, () => wheelInto(B, { ...spec, style: 'cap', lugs: 0 }));
  return B.build({ surf: _phMat })[''][0].geometry;
}
export const _phMat = new THREE.MeshBasicMaterial();

let _gearMat = null;
export const gearMat = () => _gearMat ||= makeSurfMat({ physical: true });
export const groupOf = (B, mats, pivots = {}) => { const parts = B.build(mats, pivots), out = {}; for (const k in parts) { const g = out[k] = new THREE.Group(); g.name = k || 'main'; if (pivots[k]) g.position.fromArray(pivots[k]); for (const m of parts[k]) g.add(m); } return out; };
