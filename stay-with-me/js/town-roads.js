// Roads, kerbs, sidewalks, block ground, the river channel and the three bridges.
// Road quads carry their own (u across, v along) coordinates and cross-section so the road shader in town-mat.js can
// paint markings procedurally; nothing here is a decal. Sidewalk strips are built per block side from the kerb line
// (block.outer) to the property line (block.inner), with the furnishing/verge split depending on the district.

import { lerp, hash2 } from './util.js';
import { GL, WL, METAL } from './town-mat.js';
import { KERB, riverX, riverHW, BOUNDS } from './town-layout.js';
import { SURF, clipHalf, polyArea } from './town-geo.js';

const CLSN = { alley: 0, street: 1, arterial: 2, bypass: 3 };
const RIVER_STEP = 20;
export const WATER_Y = -1.25;

export function buildRoads(T) {
  const { L, chunks, surf } = T;
  const inTown = (x, z) => x > BOUNDS.minX + 40 && x < BOUNDS.maxX - 40 && z > BOUNDS.minZ + 40 && z < BOUNDS.maxZ - 40;

  // ---- surface raster: blocks first, then water, then the roads on top
  for (const b of L.blocks) {
    surf.fill(b.outer, SURF.sidewalk);
    const d = b.district; surf.fill(b.inner, b.river || d === 'residential' || d === 'bungalow' || d === 'campus' ? SURF.grass : SURF.lot);
  }
  { const wp = [], ep = []; for (let z = surf.minZ - 20; z <= surf.minZ + surf.h * surf.res + 20; z += RIVER_STEP) { wp.push([riverX(z) - riverHW(z), z]); ep.push([riverX(z) + riverHW(z), z]); } const band = wp.concat(ep.reverse()); surf.fill(band, SURF.water, SURF.grass); surf.fill(band, SURF.water, SURF.off); }

  // ---- carriageways
  for (const e of L.edges) {
    const a = L.nodes[e.a], b = L.nodes[e.b], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const mb = chunks.get('road', mx, mz).frame().col(255).lay(GL.asphalt);
    const s0 = e.trimA, s1 = e.length - e.trimB, hw = e.width / 2, dx = e.dir.x, dz = e.dir.z, rx = -dz, rz = dx;
    const ctl = n => n.control === 'signal' || n.control === 'stop';
    const town = inTown(mx, mz), dA = e.he[0].district, core = d => d === 'downtown' || d === 'oldtown' || d === 'midtown' || d === 'campus';
    const cwOK = n => ctl(n) && e.cls !== 'alley' && e.cls !== 'bypass' && inTown(n.x, n.z) && (n.control === 'signal' || core(dA) || core(e.he[1].district) || e.cls === 'arterial');
    const stA = (a.control === 'signal' || e.stopAt.a) && a.edges.length > 2, stB = (b.control === 'signal' || e.stopAt.b) && b.edges.length > 2;
    const cwA = cwOK(a) && a.edges.length > 2, cwB = cwOK(b) && b.edges.length > 2;
    const minor = e.cls === 'street' && e.rank <= 1 && (dA === 'residential' || dA === 'bungalow') && (e.he[1].district === 'residential' || e.he[1].district === 'bungalow');
    const ladder = e.cls === 'arterial' || core(dA);
    const flags = (e.parking ? 1 : 0) + (stA ? 2 : 0) + (stB ? 4 : 0) + (cwA ? 8 : 0) + (cwB ? 16 : 0) + (e.bike ? 32 : 0) + CLSN[e.cls] * 64 + (minor ? 256 : 0) + (ladder ? 512 : 0)
      + (a.control === 'signal' && e.median > 2 ? 1024 : 0) + (b.control === 'signal' && e.median > 2 ? 2048 : 0) + (!town && e.cls !== 'bypass' ? 4096 : 0);
    e.mark = { stA, stB, cwA, cwB };
    mb.w.set([e.length, hw, e.lanes, e.laneWidth, e.median, flags, e.trimA, e.trimB]);
    const P = (s, u) => [a.x + dx * s + rx * u, a.z + dz * s + rz * u];
    // split long edges so the interpolated coordinates stay precise
    const n = Math.max(1, Math.ceil((s1 - s0) / 60));
    for (let i = 0; i < n; i++) {
      const t0 = lerp(s0, s1, i / n), t1 = lerp(s0, s1, (i + 1) / n), p0 = P(t0, hw), p1 = P(t1, hw), p2 = P(t1, -hw), p3 = P(t0, -hw);
      mb.gquad(p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], 0, hw, t0, hw, t1, -hw, t1, -hw, t0);
    }
    surf.fill([P(s0 - 0.3, hw), P(s1 + 0.3, hw), P(s1 + 0.3, -hw), P(s0 - 0.3, -hw)], SURF.road);
    // raised median on the bypass
    if (e.cls === 'bypass' && !e.bridge) {
      const g = chunks.get('plain', mx, mz).frame().col(150, 148, 142).lay(WL.panel);
      const m0 = s0 + 6, m1 = s1 - 6, mh = e.median / 2 - 0.5;
      if (m1 > m0 + 4) { const c = P((m0 + m1) / 2, 0); g.push(c[0], 0, c[1], Math.atan2(dx, dz)); g.box(-mh, 0, -(m1 - m0) / 2, mh, 0.16, (m1 - m0) / 2, 31); g.pop(); }
    }
  }
  // ---- junctions
  for (const n of L.nodes) {
    if (!n.poly) continue;
    const mb = chunks.get('road', n.x, n.z).frame().col(255).lay(GL.asphalt), p = n.poly, m = p.length;
    mb.w.fill(0);
    for (let i = 0; i < m; i++) {
      const A = p[i], B = p[(i + 1) % m], kerb = n.polyFlags[i] === 1;
      const ex = B[0] - A[0], ez = B[1] - A[1], el = Math.hypot(ex, ez); if (el < 1e-3) continue;
      const dist = kerb ? Math.abs((n.x - A[0]) * ez - (n.z - A[1]) * ex) / el : 99;
      mb._gv(3);
      mb.w[1] = dist; const c = mb.v(n.x, 0, n.z, 0, 1, 0, n.x, n.z);
      mb.w[1] = kerb ? 0 : 99; const ia = mb.v(A[0], 0, A[1], 0, 1, 0, A[0], A[1]), ib = mb.v(B[0], 0, B[1], 0, 1, 0, B[0], B[1]);
      if (ex * (n.z - A[1]) - ez * (n.x - A[0]) < 0) mb.tri(c, ia, ib); else mb.tri(c, ib, ia);
    }
    surf.fill(p, SURF.road);
  }

  // ---- kerbs, sidewalks, block ground
  for (const b of L.blocks) buildBlockGround(T, b);

  buildRiver(T);
  for (const e of L.edges) if (e.bridge) buildBridge(T, e);
}

function buildBlockGround(T, b) {
  const { chunks } = T, g = chunks.get('ground', b.cx, b.cz).frame();
  const tint = 236 + Math.floor(hash2(b.id, 3, 11) * 16);
  for (const s of b.sides) {
    if (s.len < 0.05 && s.ilen < 0.05) continue;
    const kind = s.he.swKind, sw = s.he.sw;
    // kerb face
    if (s.len > 0.05) { g.col(tint - 30, tint - 31, tint - 36).lay(GL.concrete); g.quad(s.o1[0], 0, s.o1[1], s.o0[0], 0, s.o0[1], s.o0[0], KERB, s.o0[1], s.o1[0], KERB, s.o1[1], 0, 0, s.len, KERB); }
    const strip = (t0, t1, layer, r, gg, bb, v0, v1) => {
      const a0 = [lerp(s.o0[0], s.i0[0], t0), lerp(s.o0[1], s.i0[1], t0)], a1 = [lerp(s.o1[0], s.i1[0], t0), lerp(s.o1[1], s.i1[1], t0)];
      const c0 = [lerp(s.o0[0], s.i0[0], t1), lerp(s.o0[1], s.i0[1], t1)], c1 = [lerp(s.o1[0], s.i1[0], t1), lerp(s.o1[1], s.i1[1], t1)];
      const u = p => (p[0] - s.o0[0]) * s.dx + (p[1] - s.o0[1]) * s.dz;
      g.col(r, gg, bb).lay(layer); g.gquad(a0[0], a0[1], a1[0], a1[1], c1[0], c1[1], c0[0], c0[1], KERB, u(a0), v0, u(a1), v0, u(c1), v1, u(c0), v1);
    };
    if (sw < 0.05) continue;
    const f = m => Math.min(1, m / sw);
    if (kind === 'paved') { strip(0, 1, GL.walk, tint, tint, tint - 3, 0, sw); }
    else if (kind === 'brick') { strip(0, f(0.5), GL.concrete, tint - 10, tint - 11, tint - 16, 0, 0.5); strip(f(0.5), 1, GL.pavers, 245, 240, 235, 0.5, sw); }
    else if (kind === 'verge') { strip(0, f(0.18), GL.concrete, tint - 20, tint - 21, tint - 26, 0, 0.18); strip(f(0.18), f(1.5), GL.grass, 235, 245, 225, 0.18, 1.5); strip(f(1.5), f(3.0), GL.walk, tint, tint, tint - 4, 0.02, 1.48); strip(f(3.0), 1, GL.grass, 240, 245, 230, 3, sw); }
    else if (kind === 'vergeN') { strip(0, f(0.18), GL.concrete, tint - 20, tint - 21, tint - 26, 0, 0.18); strip(f(0.18), f(0.8), GL.gravel, 225, 222, 215, 0.18, 0.8); strip(f(0.8), 1, GL.walk, tint - 8, tint - 8, tint - 12, 0.02, 1.48); }
    else if (kind === 'shoulder') { strip(0, 1, GL.gravel, 215, 212, 205, 0, sw); }
  }
  // corner pads: fan from the property-line corner to the kerb return
  g.lay(GL.walk).col(tint, tint, tint - 3);
  for (const c of b.corners) {
    if (c.pts.length < 2 || !c.inner) continue;
    const I = c.inner[0];
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const A = c.pts[i], B = c.pts[i + 1];
      g._gv(3); const ic = g.v(I[0], KERB, I[1], 0, 1, 0, I[0], I[1]), ia = g.v(A[0], KERB, A[1], 0, 1, 0, A[0], A[1]), ib = g.v(B[0], KERB, B[1], 0, 1, 0, B[0], B[1]);
      if ((A[0] - I[0]) * (B[1] - I[1]) - (A[1] - I[1]) * (B[0] - I[0]) < 0) g.tri(ic, ia, ib); else g.tri(ic, ib, ia);
      const el = Math.hypot(B[0] - A[0], B[1] - A[1]); if (el > 0.02) { g.col(tint - 30, tint - 31, tint - 36).lay(GL.concrete); g.quad(B[0], 0, B[1], A[0], 0, A[1], A[0], KERB, A[1], B[0], KERB, B[1], 0, 0, el, KERB); g.lay(GL.walk).col(tint, tint, tint - 3); }
    }
  }
  // interior
  const d = b.district;
  const base = () => { if (d === 'residential' || d === 'bungalow' || d === 'campus') g.lay(GL.grass).col(238, 246, 228); else if (d === 'downtown' || d === 'oldtown' || d === 'midtown') g.lay(GL.concrete).col(225, 224, 218); else g.lay(GL.asphalt).col(255, 250, 240); };
  if (!b.river) { base(); g.poly(b.inner, KERB, true); return; }
  // river blocks: grass banks either side of the channel, clipped in bands so the bank line matches the channel mesh
  g.lay(GL.grass).col(232, 244, 222);
  const z0 = Math.floor(b.bb.z0 / RIVER_STEP) * RIVER_STEP, z1 = Math.ceil(b.bb.z1 / RIVER_STEP) * RIVER_STEP;
  for (let z = z0; z < z1; z += RIVER_STEP) {
    let band = clipHalf(clipHalf(b.inner, 0, -1, -z), 0, 1, z + RIVER_STEP); if (band.length < 3) continue;
    for (const side of [-1, 1]) {
      const xa = riverX(z) + side * riverHW(z), xb = riverX(z + RIVER_STEP) + side * riverHW(z + RIVER_STEP);
      // half-plane through (xa,z)-(xb,z+step): keep the bank side
      const nx = RIVER_STEP, nz = -(xb - xa), c = nx * xa + nz * z;
      const part = side < 0 ? clipHalf(band, nx, nz, c) : clipHalf(band, -nx, -nz, -c);
      if (part.length >= 3 && Math.abs(polyArea(part)) > 0.5) g.poly(part, KERB, true);
    }
  }
}

// The channel: concrete-capped stone walls through town, natural banks beyond, and the water ribbon.
function buildRiver(T) {
  const { chunks } = T;
  const zA = -2400, zB = 2400, rows = [];
  for (let z = zA; z <= zB; z += RIVER_STEP) rows.push(z);
  const townZ = z => z >= -500 && z <= 700;
  for (let i = 0; i + 1 < rows.length; i++) {
    const za = rows[i], zb = rows[i + 1], zm = (za + zb) / 2, wall = townZ(zm);
    for (const side of [-1, 1]) {
      const xa = riverX(za) + side * riverHW(za), xb = riverX(zb) + side * riverHW(zb);
      const p = chunks.get('plain', (xa + xb) / 2, zm).frame();
      const A = (x, z, off) => [x - side * off, z];
      const q = (o0, y0, o1, y1, lay, r, g, b) => {
        const a0 = A(xa, za, o0), b0 = A(xb, zb, o0), a1 = A(xa, za, o1), b1 = A(xb, zb, o1);
        p.lay(lay).col(r, g, b);
        if (side < 0) p.quad(b0[0], y0, b0[1], a0[0], y0, a0[1], a1[0], y1, a1[1], b1[0], y1, b1[1], zb, y0, za, y1);
        else p.quad(a0[0], y0, a0[1], b0[0], y0, b0[1], b1[0], y1, b1[1], a1[0], y1, a1[1], za, y0, zb, y1);
      };
      if (wall) {
        q(0.02, KERB + 0.38, 0.02, KERB - 0.02, WL.panel, 205, 203, 196);        // land-side face of the coping
        q(0.02, KERB + 0.38, 0.5, KERB + 0.38, WL.panel, 215, 213, 206);         // coping top
        q(0.5, KERB + 0.38, 0.5, KERB - 0.1, WL.panel, 200, 198, 190);
        q(0.5, KERB - 0.1, 0.85, -3.2, WL.brick2, 150, 150, 148);                // battered stone wall into the water
        T.colliders.add((xa + xb) / 2 - side * 0.25, zm, 0.3, RIVER_STEP / 2 + 0.15, Math.atan2(xb - xa, zb - za), 0.5, 'barrier');
      } else {
        const gm = chunks.get('ground', (xa + xb) / 2, zm).frame().lay(GL.grass).col(205, 225, 195);
        const a0 = A(xa, za, -9), b0 = A(xb, zb, -9), a1 = A(xa, za, 2.5), b1 = A(xb, zb, 2.5), a2 = A(xa, za, 6), b2 = A(xb, zb, 6);
        const sl = (P0, Q0, y0, P1, Q1, y1, lay) => { gm.lay(lay); if (side < 0) gm.quad(Q0[0], y0, Q0[1], P0[0], y0, P0[1], P1[0], y1, P1[1], Q1[0], y1, Q1[1], Q0[0], Q0[1], P0[0], P1[1]); else gm.quad(P0[0], y0, P0[1], Q0[0], y0, Q0[1], Q1[0], y1, Q1[1], P1[0], y1, P1[1], P0[0], P0[1], Q0[0], Q1[1]); };
        gm.col(205, 225, 195); sl(a0, b0, 0.4, a1, b1, -1.0, GL.grass); gm.col(190, 185, 175); sl(a1, b1, -1.0, a2, b2, -3.0, GL.gravel);
      }
    }
  }
  // water
  const pos = [], uv = [], idx = [];
  rows.forEach((z, i) => { const x = riverX(z), hw = riverHW(z) + 3; pos.push(x - hw, WATER_Y, z, x + hw, WATER_Y, z); uv.push(0, z, hw * 2, z); if (i + 1 < rows.length) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); });
  T.waterGeo = { pos, uv, idx };
}

// Deck girders, piers, parapets and (for the two town bridges) the steel above the roadway.
function buildBridge(T, e) {
  const { L, chunks } = T, a = L.nodes[e.a], b = L.nodes[e.b];
  // span = where the edge is over the channel
  const zc = (a.z + b.z) / 2, xc = riverX(zc), hwR = riverHW(zc) + 1.2;
  const dx = e.dir.x, dz = e.dir.z, sMid = (xc - a.x) * dx + (zc - a.z) * dz, s0 = sMid - hwR, s1 = sMid + hwR, span = s1 - s0;
  const hw = e.width / 2, sw = 2.4, out = hw + sw, h = Math.atan2(dx, dz);   // local +Z runs along the bridge
  const cx = a.x + dx * sMid, cz = a.z + dz * sMid;
  const p = chunks.get('plain', cx, cz).frame(cx, 0, cz, h);
  // deck slab and girders under the road
  p.lay(WL.panel).col(170, 168, 162); p.box(-out - 0.3, -0.5, -span / 2 - 2, out + 0.3, -0.03, span / 2 + 2, 2 + 1 + 4 + 8 + 32);
  for (const gx of [-out + 0.6, -hw * 0.4, hw * 0.4, out - 0.6]) p.box(gx - 0.35, -1.5, -span / 2, gx + 0.35, -0.5, span / 2, 4 + 8 + 32);
  for (const pz of [-span / 6, span / 6]) { p.lay(WL.panel).col(160, 158, 152); p.box(-out + 0.2, -3.4, pz - 0.8, out - 0.2, -1.5, pz + 0.8, 15); }
  // approach parapets continue 10 m onto the banks
  const pl = span / 2 + 10;
  for (const sd of [-1, 1]) {
    const x0 = sd * (out + 0.02), x1 = sd * (out + 0.32);
    if (e.bridgeId === 'route9') { p.lay(WL.panel).col(185, 183, 176); p.box(Math.min(x0, x1), KERB, -pl, Math.max(x0, x1), KERB + 0.85, pl, 31); p.lay(WL.plain + METAL).col(150, 155, 158); p.box(sd * (out + 0.12) - 0.04, KERB + 0.85, -pl, sd * (out + 0.12) + 0.04, KERB + 1.15, pl, 31); }
    else {
      p.lay(WL.panel).col(190, 188, 180); p.box(Math.min(x0, x1), KERB, -pl, Math.max(x0, x1), KERB + 0.45, pl, 31);
      const rc = e.bridgeId === 'kessler' ? [62, 92, 80] : [112, 62, 48];
      p.lay(WL.plain).col(rc[0], rc[1], rc[2]);
      for (let z = -pl + 0.5; z <= pl - 0.4; z += 2) p.box(sd * (out + 0.17) - 0.05, KERB + 0.45, z - 0.05, sd * (out + 0.17) + 0.05, KERB + 1.1, z + 0.05, 15);
      p.box(sd * (out + 0.17) - 0.06, KERB + 1.06, -pl, sd * (out + 0.17) + 0.06, KERB + 1.16, pl, 31); p.box(sd * (out + 0.17) - 0.03, KERB + 0.72, -pl, sd * (out + 0.17) + 0.03, KERB + 0.78, pl, 15);
    }
    const o = [cx + Math.cos(h) * sd * (out + 0.17), cz - Math.sin(h) * sd * (out + 0.17)];
    T.colliders.add(o[0], o[1], 0.2, pl, h, 1.1, 'barrier');
  }
  if (e.bridgeId === 'kessler') {
    // tied arch either side of the deck: parabolic ribs, hangers, wind bracing over the crown
    const rise = 15, N = 16, ax = out + 1.0;
    p.lay(WL.plain).col(58, 88, 76);
    const yAt = t => KERB + 0.3 + rise * 4 * t * (1 - t);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, z0 = lerp(-span / 2 - 1, span / 2 + 1, t0), z1 = lerp(-span / 2 - 1, span / 2 + 1, t1), y0 = yAt(t0), y1 = yAt(t1);
        const len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0), x = sd * ax;
        // rib segment as a sheared box
        const hh = 0.55, c = Math.cos(ang), s = Math.sin(ang), ox = 0.38;
        const P = (zz, yy) => [zz, yy];
        const u0 = [z0 + s * hh, y0 - c * hh], u1 = [z1 + s * hh, y1 - c * hh], v0 = [z0 - s * hh, y0 + c * hh], v1 = [z1 - s * hh, y1 + c * hh];
        p.quad(x + ox, u0[1], u0[0], x + ox, u1[1], u1[0], x + ox, v1[1], v1[0], x + ox, v0[1], v0[0], z0, 0, z0 + len, 1.1);
        p.quad(x - ox, u1[1], u1[0], x - ox, u0[1], u0[0], x - ox, v0[1], v0[0], x - ox, v1[1], v1[0], z0, 0, z0 + len, 1.1);
        p.quad(x - ox, v0[1], v0[0], x + ox, v0[1], v0[0], x + ox, v1[1], v1[0], x - ox, v1[1], v1[0], 0, z0, 0.76, z0 + len);
        p.quad(x + ox, u0[1], u0[0], x - ox, u0[1], u0[0], x - ox, u1[1], u1[0], x + ox, u1[1], u1[0], 0, z0, 0.76, z0 + len);
        if (i > 0) { p.box(x - 0.09, KERB + 0.3, z0 - 0.09, x + 0.09, y0 - 0.3, z0 + 0.09, 15); }
        void P;
      }
      p.box(sd * ax - 0.45, KERB - 0.6, -span / 2 - 1.5, sd * ax + 0.45, KERB + 0.5, span / 2 + 1.5, 31);   // tie girder
      T.colliders.add(cx + Math.cos(h) * sd * ax, cz - Math.sin(h) * sd * ax, 0.5, span / 2 + 1.5, h, 1.2, 'barrier');
    }
    for (let i = 4; i <= N - 4; i++) {
      const t = i / N, z = lerp(-span / 2 - 1, span / 2 + 1, t), y = yAt(t);
      p.box(-ax, y - 0.25, z - 0.2, ax, y + 0.15, z + 0.2, 63);
      if (i < N - 4) { const zn = lerp(-span / 2 - 1, span / 2 + 1, (i + 1) / N), yn = yAt((i + 1) / N); p.tube(-ax, y, z, ax, yn, zn, 0.1, 0.1, 4); p.tube(ax, y, z, -ax, yn, zn, 0.1, 0.1, 4); }
    }
  } else if (e.bridgeId === 'mill') {
    // riveted pony truss
    const th = 3.6, N = 10, tx = out + 0.75; p.lay(WL.plain).col(108, 58, 44);
    for (const sd of [-1, 1]) {
      const x = sd * tx; p.box(x - 0.2, KERB + th - 0.3, -span / 2, x + 0.2, KERB + th, span / 2, 63); p.box(x - 0.22, KERB - 0.5, -span / 2 - 1, x + 0.22, KERB + 0.25, span / 2 + 1, 31);
      for (let i = 0; i <= N; i++) { const z = lerp(-span / 2, span / 2, i / N); p.box(x - 0.13, KERB + 0.2, z - 0.13, x + 0.13, KERB + th - 0.3, z + 0.13, 15); if (i < N) { const zn = lerp(-span / 2, span / 2, (i + 1) / N), up = (i < N / 2) ? 1 : 0; p.tube(x, KERB + (up ? 0.3 : th - 0.2), z, x, KERB + (up ? th - 0.2 : 0.3), zn, 0.09, 0.09, 4); } }
      T.colliders.add(cx + Math.cos(h) * x, cz - Math.sin(h) * x, 0.3, span / 2 + 1, h, th, 'barrier');
    }
  }
  T.bridges.push({ id: e.bridgeId, e, cx, cz, h, span, out });
}
