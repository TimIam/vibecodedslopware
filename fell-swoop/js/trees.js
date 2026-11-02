// A choppable pine. The trunk between CUT_LO and CUT_HI is a stack of 2 cm slices, each a
// GRID x GRID bitmap of wood. Axe bites clear cells; the mesh reads the bitmaps back to draw
// the notch, and the bitmaps decide when the holding wood gives out and which way it goes.
import * as THREE from 'three';
import { mergeGeoms, paint } from './world.js';

export const CUT_LO = 0.25, CUT_HI = 1.65, SLICE_H = 0.02;
export const NS = Math.round((CUT_HI - CUT_LO) / SLICE_H);
export const GRID = 40;
const COLS = 60;
const K_STRENGTH = 1.35;  // how much bending the holding wood takes before it lets go
const G_EFF = 11;         // a little more than real gravity: trees fall in a watchable 3-4 s
export const sliceH = k => CUT_LO + (k + 0.5) * SLICE_H;
const clampH = h => Math.max(CUT_LO, Math.min(CUT_HI, h));

export function barkMaterial(map, bump) {
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, roughness: 0.93, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFresh = { value: new THREE.Color(0xe7c88f) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCut;\nvarying float vCut;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCut = aCut;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFresh;\nvarying float vCut;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float fl = dot(texture2D(map, vMapUv * vec2(0.6, 3.0)).rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, uFresh * (0.72 + 0.7 * fl), smoothstep(0.15, 0.85, vCut));`);
  };
  return m;
}

export class Tree {
  constructor(scene, mats, { x, z, r0, height, lean, leanAng, rng, id }) {
    this.scene = scene; this.mats = mats; this.id = id;
    this.x = x; this.z = z; this.r0 = r0; this.height = height;
    this.leanX = Math.cos(leanAng) * Math.tan(lean); this.leanZ = Math.sin(leanAng) * Math.tan(lean);
    this.hCom = height * 0.42;
    this.state = 'standing';
    this.crownBase = height * (0.3 + rng() * 0.12);
    this.crownR = Math.min(2.7, 1.3 + height * 0.06 + rng() * 0.5);
    this.hits = 0;

    this.S = this.radiusAt(CUT_LO) * 1.02;
    this.cs = 2 * this.S / GRID;
    const NN = GRID * GRID;
    this.grid = new Uint8Array(NS * NN); this.orig = new Uint8Array(NS * NN);
    this.n0 = new Float32Array(NS); this.n = new Float32Array(NS);
    this.sx = new Float32Array(NS); this.sz = new Float32Array(NS);
    for (let k = 0; k < NS; k++) {
      const rk = this.radiusAt(sliceH(k)), r2 = rk * rk;
      for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
        const cx = this.cellX(i), cz = this.cellX(j);
        if (cx * cx + cz * cz > r2) continue;
        const idx = k * NN + i * GRID + j;
        this.grid[idx] = this.orig[idx] = 1;
        this.n0[k]++; this.sx[k] += cx; this.sz[k] += cz;
      }
      this.n[k] = this.n0[k];
    }
    this.lastCutK = Math.round((1.0 - CUT_LO) / SLICE_H);

    this.buildRows();
    this.group = new THREE.Group(); this.group.position.set(x, 0, z);
    this.trunk = new THREE.Mesh(this.sideGeometry(0, this.rows.length - 1), mats.bark);
    this.trunk.castShadow = this.trunk.receiveShadow = true;
    this.crown = new THREE.Mesh(this.crownGeometry(rng), mats.crown);
    this.crown.castShadow = true; this.crown.receiveShadow = true;
    this.group.add(this.trunk, this.crown);
    scene.add(this.group);
    this.analysis = this.analyze();
  }

  radiusAt(h) {
    const flare = 1 + 0.28 * Math.exp(-Math.max(0, h) / 0.32);
    const taper = Math.max(0.04, 1 - h / (this.height * 1.02));
    return this.r0 * flare * Math.pow(taper, 0.75);
  }
  cellX(i) { return -this.S + (i + 0.5) * this.cs; }
  cellIdx(k, lx, lz) {
    const i = Math.floor((lx + this.S) / this.cs), j = Math.floor((lz + this.S) / this.cs);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -1;
    return k * GRID * GRID + i * GRID + j;
  }

  // Is there wood at this world point? (The axe asks this for every sample point, every substep.)
  solidAt(px, py, pz) {
    if (py < 0 || py > this.height) return false;
    if (this.state !== 'standing' && py >= this.breakH) return false;
    const lx = px - this.x, lz = pz - this.z;
    if (py >= CUT_LO && py < CUT_HI) {
      const idx = this.cellIdx(Math.floor((py - CUT_LO) / SLICE_H), lx, lz);
      return idx >= 0 && this.grid[idx] === 1;
    }
    const r = this.radiusAt(py);
    return lx * lx + lz * lz < r * r;
  }

  // Outward surface normal at a point in the wood: away from where the wood is, read off the
  // bitmaps, so the floor and faces of a notch push the axe out the right way. Radial when the
  // neighbourhood is all wood or all air.
  normalAt(px, py, pz, out) {
    const d = this.cs * 1.6, dy = SLICE_H * 1.6;
    let gx = 0, gy = 0, gz = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      if ((a || b || c) && this.solidAt(px + a * d, py + b * dy, pz + c * d)) { gx -= a; gy -= b; gz -= c; }
    }
    const lx = px - this.x, lz = pz - this.z, rho = Math.hypot(lx, lz) || 1;
    _rad.set(lx / rho, 0, lz / rho);
    out.set(gx, gy, gz);
    const L = out.length();
    if (L < 1.5) return out.copy(_rad);
    return out.divideScalar(L).addScaledVector(_rad, 0.15).normalize();
  }

  // Mesh ---------------------------------------------------------------------
  buildRows() {
    const rows = [];
    for (let h = -0.15; h < CUT_LO - 0.01; h += 0.05) rows.push({ h, k: -1 });
    rows.push({ h: CUT_LO, k: -1 });
    this.rowOfSlice = new Int32Array(NS);
    for (let k = 0; k < NS; k++) { this.rowOfSlice[k] = rows.length; rows.push({ h: sliceH(k), k }); }
    rows.push({ h: CUT_HI, k: -1 });
    for (let h = CUT_HI + 0.25; h < 3.2; h += 0.25) rows.push({ h, k: -1 });
    for (let h = 3.2; h < this.height - 0.4; h += 0.9) rows.push({ h, k: -1 });
    rows.push({ h: this.height, k: -1 });
    this.rows = rows;
    this.radii = new Float32Array(rows.length * COLS);
    this.cut = new Float32Array(rows.length * COLS);
    for (let r = 0; r < rows.length; r++) {
      const R = r === rows.length - 1 ? 0.012 : this.radiusAt(rows[r].h);
      this.radii.fill(R, r * COLS, (r + 1) * COLS);
    }
  }

  // Read one slice's bitmap back into the radius of each mesh column: walk in from the bark
  // along the column's ray until the first wood that is still there.
  updateSliceRow(k) {
    const row = this.rowOfSlice[k], rk = this.radiusAt(sliceH(k)), step = this.cs * 0.5;
    for (let j = 0; j < COLS; j++) {
      const a = (j / COLS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let r = 0.004, cutSeen = false;
      for (let t = rk; t > 0; t -= step) {
        const idx = this.cellIdx(k, t * ca, t * sa);
        if (idx < 0 || !this.orig[idx]) continue;
        if (this.grid[idx]) { r = cutSeen ? Math.min(rk, t + step * 0.5) : rk; break; }
        cutSeen = true;
      }
      this.radii[row * COLS + j] = r;
      this.cut[row * COLS + j] = Math.min(1, Math.max(0, (rk - r) / 0.012));
    }
  }

  sideGeometry(r0, r1, ox = 0, oy = 0, oz = 0) {
    const nr = r1 - r0 + 1, nv = nr * (COLS + 1);
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), cut = new Float32Array(nv);
    const g = new THREE.BufferGeometry();
    g.userData = { r0, r1, ox, oy, oz };
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aCut', new THREE.BufferAttribute(cut, 1));
    const vScale = 1 / (2 * Math.PI * this.r0 * 2 / 3);
    for (let r = r0, vi = 0; r <= r1; r++) for (let j = 0; j <= COLS; j++, vi++) {
      uv[vi * 2] = j / COLS * 3; uv[vi * 2 + 1] = this.rows[r].h * vScale;
    }
    const idx = [];
    for (let r = 0; r < nr - 1; r++) for (let j = 0; j < COLS; j++) {
      const a = r * (COLS + 1) + j, b = a + COLS + 1;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    g.setIndex(idx);
    this.writeRows(g, r0, r1);
    return g;
  }

  writeRows(g, ra, rb) {
    const { r0, r1, ox, oy, oz } = g.userData;
    const pos = g.attributes.position.array, cut = g.attributes.aCut.array;
    ra = Math.max(ra, r0); rb = Math.min(rb, r1);
    for (let r = ra; r <= rb; r++) {
      const h = this.rows[r].h;
      for (let j = 0; j <= COLS; j++) {
        const vi = (r - r0) * (COLS + 1) + j, jj = j % COLS, a = (j / COLS) * Math.PI * 2, R = this.radii[r * COLS + jj];
        pos[vi * 3] = Math.cos(a) * R - ox; pos[vi * 3 + 1] = h - oy; pos[vi * 3 + 2] = Math.sin(a) * R - oz;
        cut[vi] = this.cut[r * COLS + jj];
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.aCut.needsUpdate = true;
    g.computeVertexNormals();
    // Weld the seam normals so the trunk has no lighting stripe.
    const n = g.attributes.normal.array;
    for (let r = 0; r <= r1 - r0; r++) {
      const a = r * (COLS + 1) * 3, b = (r * (COLS + 1) + COLS) * 3;
      for (let c = 0; c < 3; c++) { const v = (n[a + c] + n[b + c]) * 0.5; n[a + c] = n[b + c] = v; }
    }
    g.computeBoundingSphere();
  }

  crownGeometry(rng) {
    const parts = [], T = 7, span = this.height - this.crownBase;
    this.tiers = [];
    for (let t = 0; t < T; t++) {
      const f = t / (T - 1);
      const R = this.crownR * Math.pow(1 - f, 0.85) * (0.88 + rng() * 0.24) + 0.2;
      const ch = span * 0.3 * (1 - f * 0.45);
      const yb = this.crownBase + f * (span - ch * 0.6);
      const g = new THREE.ConeGeometry(R, ch, 10, 2);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        if (y < ch * 0.45) {
          const s = 1 + (rng() - 0.5) * 0.35;
          p.setX(k, p.getX(k) * s); p.setZ(k, p.getZ(k) * s);
          p.setY(k, y + (rng() - 0.5) * ch * 0.16 - (y < -ch * 0.4 ? ch * 0.08 : 0));
        }
      }
      g.translate(0, yb + ch / 2, 0);
      paint(g, new THREE.Color().setHSL(0.29 + rng() * 0.06, 0.4 + rng() * 0.15, 0.12 + rng() * 0.06 + f * 0.05));
      parts.push(g);
      this.tiers.push({ yb, R });
    }
    return mergeGeoms(parts);
  }

  // Splintered top of the stump (or bottom of the log): one quad per cell of wood left in the slice.
  capGeometry(k, up, ox = 0, oy = 0, oz = 0) {
    const NN = GRID * GRID, cs = this.cs, h = sliceH(k), pos = [], col = [];
    const c0 = new THREE.Color(0xe2c38a), c1 = new THREE.Color(0xc89f62), c = new THREE.Color();
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      if (!this.grid[k * NN + i * GRID + j]) continue;
      const x0 = -this.S + i * cs - ox, z0 = -this.S + j * cs - oz, y = h - oy;
      const A = [x0, y, z0], B = [x0 + cs, y, z0], C = [x0 + cs, y, z0 + cs], D = [x0, y, z0 + cs];
      const tri = up ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
      const hsh = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      c.copy(c0).lerp(c1, hsh - Math.floor(hsh));
      for (const v of tri) { pos.push(...v); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  // Cutting -------------------------------------------------------------------
  // Width of wood the edge has to get across here: the chord of the trunk along the edge line.
  chordAt(P, e) {
    const lx = P.x - this.x, lz = P.z - this.z, ex = e.x, ez = e.z, el = Math.hypot(ex, ez);
    const r = this.radiusAt(clampH(P.y));
    if (el < 0.2) return 2 * r;
    const p = Math.abs(lx * ez - lz * ex) / el;
    return 2 * Math.sqrt(Math.max(0, r * r - p * p)) / el;
  }

  // P: where the edge met the wood (world). e: along the edge, u: into the wood, w: across the
  // blade (orthonormal, world). Each bite deepens a V notch: everything across the trunk that is
  // short of the new floor (depth past P along u) and inside the V's opening comes out as chips.
  // Returns the number of cells removed.
  carve(P, e, u, w, depth) {
    if (this.state !== 'standing') return 0;
    const aw = 0.016 + depth * 0.25, open = 0.55, back = 0.42;
    const cx = P.x - this.x, cy = P.y, cz = P.z - this.z;
    const reachY = Math.abs(w.y) * (aw + back * open) + Math.abs(u.y) * back + 0.02;
    const k0 = Math.max(0, Math.floor((cy - reachY - CUT_LO) / SLICE_H)), k1 = Math.min(NS - 1, Math.floor((cy + reachY - CUT_LO) / SLICE_H));
    if (k1 < k0 || cy < CUT_LO - 0.01 || cy > CUT_HI + 0.01) return 0;
    const NN = GRID * GRID;
    let removed = 0, bestK = -1, bestN = 0;
    for (let k = k0; k <= k1; k++) {
      const y = sliceH(k) - cy; let here = 0;
      for (let i = 0; i < GRID; i++) {
        const X = this.cellX(i), x = X - cx;
        for (let j = 0; j < GRID; j++) {
          const idx = k * NN + i * GRID + j;
          if (!this.grid[idx]) continue;
          const Z = this.cellX(j), z = Z - cz;
          const du = x * u.x + y * u.y + z * u.z;
          if (du > depth || du < -back) continue;
          const dw = Math.abs(x * w.x + y * w.y + z * w.z), de = x * e.x + y * e.y + z * e.z;
          // A slightly rounded floor, and the V opens toward the mouth of the notch.
          if (du > depth - de * de * 0.6) continue;
          if (dw > aw + Math.max(0, -du) * open) continue;
          this.grid[idx] = 0; here++;
          this.n[k]--; this.sx[k] -= X; this.sz[k] -= Z;
        }
      }
      if (here) { this.updateSliceRow(k); removed += here; if (here > bestN) { bestN = here; bestK = k; } }
    }
    if (removed) {
      this.writeRows(this.trunk.geometry, this.rowOfSlice[k0] - 1, this.rowOfSlice[k1] + 1);
      this.lastCutK = bestK;
      this.analysis = this.analyze();
    }
    return removed;
  }

  // Which slice is closest to letting go, how close, and which way it would go.
  analyze() {
    let best = null, maxCut = 0, maxK = this.lastCutK;
    for (let k = 0; k < NS; k++) {
      const n = this.n[k], a = n / this.n0[k], h = sliceH(k), rk = this.radiusAt(h);
      if (1 - a > maxCut) { maxCut = 1 - a; maxK = k; }
      const cx = n > 0 ? this.sx[k] / n : 0, cz = n > 0 ? this.sz[k] / n : 0;
      const lx = this.leanX * (this.hCom - h), lz = this.leanZ * (this.hCom - h);
      const dx = lx - cx, dz = lz - cz;
      const demand = Math.hypot(dx, dz) / rk + 0.05, cap = K_STRENGTH * Math.pow(Math.max(a, 1e-3), 1.5);
      const ratio = a < 0.035 ? 9 : demand / cap;
      if (!best || ratio > best.ratio) best = { k, ratio, a, cx, cz, dx, dz, h };
    }
    const L = Math.hypot(best.dx, best.dz);
    if (L > 1e-6) { best.fx = best.dx / L; best.fz = best.dz / L; } else { best.fx = 1; best.fz = 0; }
    best.cutFrac = maxCut; best.cutK = maxK;
    return best;
  }

  // Felling -------------------------------------------------------------------
  startFall() {
    const an = this.analysis, k = an.k, h = sliceH(k), fx = an.fx, fz = an.fz, NN = GRID * GRID;
    this.state = 'falling'; this.breakH = h;
    // The tree pivots on the far edge of the hinge, in the direction it falls.
    let lead = -1e9;
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      if (!this.grid[k * NN + i * GRID + j]) continue;
      lead = Math.max(lead, this.cellX(i) * fx + this.cellX(j) * fz);
    }
    if (lead < -1e8) lead = 0;
    const cdot = an.cx * fx + an.cz * fz;
    const px = an.cx + fx * (lead - cdot), pz = an.cz + fz * (lead - cdot);
    this.pivot = new THREE.Vector3(this.x + px, h, this.z + pz);
    this.fallDir = new THREE.Vector3(fx, 0, fz);
    this.fallAxis = new THREE.Vector3(0, 1, 0).cross(this.fallDir).normalize();
    const row = this.rowOfSlice[k];

    this.group.remove(this.trunk); this.trunk.geometry.dispose();
    this.stump = new THREE.Mesh(this.sideGeometry(0, row), this.mats.bark);
    this.stumpCap = new THREE.Mesh(this.capGeometry(k, true), this.mats.cap);
    this.stump.castShadow = this.stump.receiveShadow = this.stumpCap.receiveShadow = true;
    this.group.add(this.stump, this.stumpCap);

    this.log = new THREE.Group(); this.log.position.copy(this.pivot);
    this.logSide = new THREE.Mesh(this.sideGeometry(row, this.rows.length - 1, px, h, pz), this.mats.bark);
    this.logCap = new THREE.Mesh(this.capGeometry(k, false, px, h, pz), this.mats.cap);
    this.logSide.castShadow = this.logSide.receiveShadow = true;
    this.group.remove(this.crown); this.crown.position.set(-px, -h, -pz);
    this.log.add(this.logSide, this.logCap, this.crown);
    this.scene.add(this.log);

    const leanAlong = this.leanX * fx + this.leanZ * fz;
    this.theta = Math.max(0.02, Math.atan(leanAlong) + 0.03);
    this.omega = 0.05;
    this.hold = 0.35 + an.a * 1.6;
    this.L = this.height - h;
    let tg = Math.acos(Math.max(-1, -h / this.L));
    for (const t of this.tiers) {
      const A = t.yb - h, B = t.R; if (A <= 0) continue;
      tg = Math.min(tg, Math.acos(Math.max(-1, Math.min(1, -h / Math.hypot(A, B)))) - Math.atan2(B, A));
    }
    this.thetaGround = tg + 0.06;
    this.groundHit = false;
    this.fallT = 0;
  }

  axisDir(out) { return out.set(0, Math.cos(this.theta), 0).addScaledVector(this.fallDir, Math.sin(this.theta)); }

  updateFall(dt, events) {
    if (this.state !== 'falling') return;
    this.fallT += dt;
    if (this.hold > 0) {
      this.hold -= dt;
      this.theta += 0.01 * dt;
      if (this.hold <= 0) events.push({ type: 'go', tree: this });
    } else {
      const sub = 4, h = dt / sub;
      for (let s = 0; s < sub; s++) {
        const alpha = (3 * G_EFF / (2 * this.L)) * Math.sin(this.theta) - 0.04 * this.omega;
        this.omega += alpha * h; this.theta += this.omega * h;
        if (this.theta >= this.thetaGround) {
          this.theta = this.thetaGround;
          if (!this.groundHit) { this.groundHit = true; events.push({ type: 'crash', tree: this, speed: this.omega }); }
          if (this.omega > 0.32) { this.omega *= -0.2; events.push({ type: 'bounce', tree: this }); }
          else { this.omega = 0; this.state = 'down'; events.push({ type: 'down', tree: this }); break; }
        }
      }
    }
    this.log.quaternion.setFromAxisAngle(this.fallAxis, this.theta);
  }

  radiusAtS(s) {
    const hh = this.breakH + s;
    if (hh < this.crownBase) return this.radiusAt(hh) + 0.06;
    const f = Math.min(1, (hh - this.crownBase) / (this.height - this.crownBase));
    return 0.2 + this.crownR * (1 - f) * 0.85;
  }

  // Does the falling stem or crown pass through the player standing at p?
  hitsPlayer(p) {
    if (this.state !== 'falling' || this.hold > 0 || this.omega < 0.12) return false;
    const d = this.axisDir(_d);
    for (const y of [1.65, 1.15, 0.6]) {
      const qx = p.x - this.pivot.x, qy = y - this.pivot.y, qz = p.z - this.pivot.z;
      const s = Math.max(0, Math.min(this.L, qx * d.x + qy * d.y + qz * d.z));
      const dist = Math.hypot(qx - d.x * s, qy - d.y * s, qz - d.z * s);
      if (s > 0.25 && dist < this.radiusAtS(s) + 0.22) return true;
    }
    return false;
  }

  // Closest point on the fallen log (a capsule) for the axe to bounce off.
  logContact(p, out) {
    if (this.state === 'standing') return -1;
    const d = this.axisDir(_d), L = Math.min(this.L, this.crownBase - this.breakH + 1);
    const qx = p.x - this.pivot.x, qy = p.y - this.pivot.y, qz = p.z - this.pivot.z;
    const s = Math.max(0.02, Math.min(L, qx * d.x + qy * d.y + qz * d.z));
    const cx = qx - d.x * s, cy = qy - d.y * s, cz = qz - d.z * s, dist = Math.hypot(cx, cy, cz);
    const r = this.radiusAt(this.breakH + s);
    if (dist >= r || dist < 1e-6) return -1;
    out.set(cx / dist, cy / dist, cz / dist);
    return r - dist;
  }

  dispose() {
    for (const o of [this.group, this.log]) if (o) {
      this.scene.remove(o);
      o.traverse(m => { if (m.isMesh) m.geometry.dispose(); });
    }
  }
}
const _d = new THREE.Vector3(), _rad = new THREE.Vector3();
