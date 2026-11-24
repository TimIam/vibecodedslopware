// Halloran Falls street plan: the river, the declarative street list, and the planar road graph built from it
// (nodes, edges, faces). From the graph come the kerb geometry every other module shares: per-edge trims, junction
// polygons, and one "block" per enclosed face with its filleted kerb outline, sidewalk inner line and frontage sides.
//
// Axes: +X east, +Z south (north is -Z), so a top-down map with X right and Z down reads like an atlas.
// Driving on the right: for a direction d the right-hand normal is (-d.z, d.x).
// Tuning: street coordinates in STREETS(), cross-sections in CLS, districts in districtAt().

import { clamp, lerp, hash2 } from './util.js';
import { polyArea, polyCentroid, polyBounds } from './town-geo.js';

export const BOUNDS = { minX: -1100, maxX: 1100, minZ: -800, maxZ: 800 };
export const KERB = 0.15;

// ---------------------------------------------------------------- river (the Ketter): centreline x = riverX(z)

const RK = [[-2600, 520], [-1700, 380], [-1100, 310], [-720, 250], [-600, 215], [-480, 190], [-370, 180], [-270, 185], [-170, 195], [-70, 200], [50, 215], [170, 245], [290, 270], [410, 280], [530, 265], [680, 235], [900, 190], [1300, 110], [1700, 60], [2600, -80]];
export function riverX(z) {
  let i = 1; while (i < RK.length - 2 && z > RK[i + 1][0]) i++;
  if (z <= RK[1][0]) i = 1;
  const p0 = RK[i - 1], p1 = RK[i], p2 = RK[i + 1], p3 = RK[Math.min(RK.length - 1, i + 2)];
  const h = p2[0] - p1[0], t = clamp((z - p1[0]) / h), m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
export const RIVER_HW = 25;                       // half width of the channel at the top of the bank
export const riverHW = z => RIVER_HW + 3 * Math.sin(z / 170);
const pl = (k, z) => { let i = 0; while (i < k.length - 2 && z > k[i + 1][0]) i++; return lerp(k[i][1], k[i + 1][1], clamp((z - k[i][0]) / (k[i + 1][0] - k[i][0]))); };
const OFFW = [[-480, 80], [50, 80], [170, 128], [290, 150], [410, 122], [530, 86], [680, 80]];
export const riversideX = z => Math.round(riverX(z) - pl(OFFW, z));     // Riverside Dr (west bank)
export const quayX = z => Math.round(riverX(z) + 76);                    // Quay St (east bank)

// ---------------------------------------------------------------- districts

export function districtAt(x, z) {
  if (x > riverX(z)) {
    if (z > 480) return 'retail';
    if (z > 110) return x < 590 ? 'mixed' : 'bungalow';
    if (z > -70 && x > 590 && x < 880) return 'campus';
    return 'industrial';
  }
  if (z > 530) return 'strip';
  if (x > -250 && z > -170 && z < 170) return 'downtown';
  if (x > -250 && z <= -170 && z > -480) return 'oldtown';
  if (x > -380 && x <= -250 && z > -270 && z < 170) return 'midtown';
  if (x > -250 && z >= 170) return 'midtown';
  if (x > -510 && x <= -380 && z > -170 && z < 50) return 'midtown';
  if (x < -640 && z > 290) return 'bungalow';
  return 'residential';
}

// ---------------------------------------------------------------- cross-sections

// width (kerb to kerb) = 2*(lanes*laneWidth + side) + median, side = parking lane or shoulder (+ bike lane)
export const CLS = {
  bypass: { lanes: 2, laneWidth: 3.6, median: 4.0, shoulder: 2.4, park: 0, speed: 24.6, rank: 3, fillet: 9 },
  arterial: { lanes: 2, laneWidth: 3.4, median: 3.4, shoulder: 0.6, park: 0, speed: 15.6, rank: 2, fillet: 7 },
  street: { lanes: 1, laneWidth: 3.3, median: 0, shoulder: 0.7, park: 2.4, speed: 11.2, rank: 1, fillet: 5 },
  alley: { lanes: 1, laneWidth: 2.5, median: 0, shoulder: 0, park: 0, speed: 4.5, rank: 0, fillet: 2 },
};

function STREETS() {
  const S = [];
  const add = (name, cls, pts, o = {}) => S.push({ name, cls, pts, ...o });
  const H = (name, z, x0, x1, cls = 'street', o) => add(name, cls, [[x0, z], [x1, z]], o);
  const V = (name, x, z0, z1, cls = 'street', o) => add(name, cls, [[x, z0], [x, z1]], o);
  const rs = riversideX, qy = quayX;
  // --- west bank, north-south
  V('Ridgeline Rd', -1030, -720, 530, 'street', { park: false });
  V('Alder St', -900, -720, 590);
  V('Birch St', -770, -480, 530);
  V('Hemlock St', -705, -720, -480);
  V('Cedar St', -640, -480, 530);
  add('Halloran Ave', 'arterial', [[-760, -1230], [-640, -1120], [-560, -990], [-510, -850], [-510, -720], [-510, 680]], { bike: true, rank: 2.2 });
  V('Pine St', -380, -600, 530);
  V('Union St', -250, -720, 530);
  V('Main St', -120, -720, 680, 'street', { rank: 1.6 });
  V('Commerce St', 10, -720, 530);
  // --- west bank, east-west
  H('Summit St', -720, -1030, 10);
  H('Maple St', -600, -1030, 10);
  H('Mill St', -480, -1030, rs(-480), 'street', { rank: 1.6 });
  H('Chestnut St', -370, -900, rs(-370));
  H('Jefferson St', -270, -1030, rs(-270));
  H('Court St', -170, -900, -640); H('Court St', -170, -510, rs(-170));
  add('Kessler St', 'arterial', [[-1560, -330], [-1440, -190], [-1300, -100], [-1160, -70], [-1030, -70], [rs(-70), -70]], { rank: 2.4 });
  H('Market St', 50, -1030, rs(50));
  H('Washington St', 170, -1030, rs(170), 'street', { rank: 1.5 });
  H('Lincoln St', 290, -1030, rs(290));
  H('Spruce St', 410, -1030, -380); H('Spruce St', 410, -250, rs(410));
  H('Willow St', 530, -1030, rs(530));
  add('Cascade Ave', 'street', [[-997.5, 680], [-900, 590], [-835, 530], [-770, 470], [-705, 410], [-640, 350], [-575, 290], [-510, 230], [-445, 170], [-380, 110], [-315, 50], [-250, -10], [-185, -70]], { rank: 1.7, park: false });
  // riverside drives follow the banks as chains of short edges
  const chain = (fx, z0, z1, must) => { const zs = new Set(must.filter(z => z >= z0 && z <= z1)); const srt = [...zs].sort((a, b) => a - b), out = []; for (let i = 0; i < srt.length; i++) { out.push(srt[i]); if (i + 1 < srt.length) { const n = Math.ceil((srt[i + 1] - srt[i]) / 62); for (let k = 1; k < n; k++) out.push(Math.round(lerp(srt[i], srt[i + 1], k / n))); } } return out.map(z => [fx(z), z]); };
  add('Riverside Dr', 'street', chain(rs, -480, 680, [-480, -370, -270, -170, -70, 50, 170, 290, 410, 530, 680]), { rank: 1.45, park: false });
  add('Quay St', 'street', chain(qy, -480, 680, [-480, -280, -70, 110, 300, 480, 680]), { rank: 1.2, park: false });
  // --- bridges
  H('Mill St', -480, rs(-480), qy(-480), 'street', { bridge: 'mill', park: false, rank: 1.6 });
  H('Kessler St', -70, rs(-70), qy(-70), 'arterial', { bridge: 'kessler', rank: 2.4 });
  H('Route 9', 680, rs(680), qy(680), 'bypass', { bridge: 'route9' });
  // --- east bank
  V('Foundry St', 440, -600, 480, 'street', { park: false });
  add('Tannery Rd', 'arterial', [[820, -1210], [700, -1090], [620, -960], [590, -820], [590, -600], [590, 680]], { rank: 2.1 });
  V('Brigid Ave', 740, -480, -70); V('Brigid Ave', 740, 110, 480);
  V('Orchard Rd', 880, -600, -480, 'street', { park: false }); V('Orchard Rd', 880, -280, 480);
  V('Quarry Rd', 1030, -600, 680, 'street', { park: false });
  H('Depot St', -600, 440, 1030, 'street', { park: false });
  H('Mill St', -480, qy(-480), 1030, 'street', { rank: 1.6, park: false });
  H('Cannery Row', -280, qy(-280), 1030, 'street', { park: false });
  add('Kessler St', 'arterial', [[qy(-70), -70], [1030, -70], [1170, -70], [1300, -40], [1430, 40], [1540, 160]], { rank: 2.4 });
  H('St. Brigid Way', 110, qy(110), 1030);
  H('Gantry St', 300, qy(300), 1030);
  H('Freight St', 480, qy(480), 1030, 'street', { park: false });
  // --- the bypass
  add('Route 9', 'bypass', [[-1620, 900], [-1470, 770], [-1310, 700], [-1150, 680], [-997.5, 680], [rs(680), 680]]);
  add('Route 9', 'bypass', [[qy(680), 680], [1030, 680], [1180, 680], [1330, 655], [1470, 590], [1600, 480]]);
  // --- alleys behind Main Street
  V('Tanner Alley', -185, -480, -270, 'alley'); V('Cooper Alley', -55, -480, -270, 'alley');
  return S;
}

// ---------------------------------------------------------------- graph

export function buildLayout() {
  const streets = STREETS();
  const nodes = [], edges = [];
  const segs = [];
  streets.forEach((st, si) => { for (let i = 0; i + 1 < st.pts.length; i++) segs.push({ si, a: st.pts[i], b: st.pts[i + 1], cuts: [0, 1] }); });
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    const rx = A.b[0] - A.a[0], rz = A.b[1] - A.a[1], sx = B.b[0] - B.a[0], sz = B.b[1] - B.a[1];
    const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-6) continue;
    const qx = B.a[0] - A.a[0], qz = B.a[1] - A.a[1];
    const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
    const et = 1.5 / Math.hypot(rx, rz), eu = 1.5 / Math.hypot(sx, sz);
    if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
    A.cuts.push(clamp(t)); B.cuts.push(clamp(u));
  }
  const grid = new Map();
  const nodeAt = (x, z) => {
    const gx = Math.round(x / 4), gz = Math.round(z / 4);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = grid.get((gx + dx) * 10007 + gz + dz); if (n && Math.hypot(n.x - x, n.z - z) < 3) return n; }
    const n = { id: nodes.length, x, z, control: 'none', edges: [], radius: 0 }; nodes.push(n); grid.set(gx * 10007 + gz, n); return n;
  };
  const seen = new Set();
  for (const sg of segs) {
    const st = streets[sg.si], cuts = [...new Set(sg.cuts.map(t => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b);
    let prev = null;
    for (const t of cuts) {
      const n = nodeAt(lerp(sg.a[0], sg.b[0], t), lerp(sg.a[1], sg.b[1], t));
      if (prev && prev !== n) {
        const key = Math.min(prev.id, n.id) + ':' + Math.max(prev.id, n.id);
        if (!seen.has(key)) { seen.add(key); edges.push(makeEdge(edges.length, prev, n, st)); }
      }
      prev = n;
    }
  }
  for (const e of edges) { nodes[e.a].edges.push(e.id); nodes[e.b].edges.push(e.id); }

  // half-edges, sorted round each node
  const hes = [];
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const h1 = { e, from: a, to: b, dx: e.dir.x, dz: e.dir.z, fwd: true }, h2 = { e, from: b, to: a, dx: -e.dir.x, dz: -e.dir.z, fwd: false };
    h1.twin = h2; h2.twin = h1; hes.push(h1, h2); e.he = [h1, h2];
  }
  for (const n of nodes) n.out = [];
  for (const h of hes) h.from.out.push(h);
  for (const n of nodes) { n.out.sort((p, q) => Math.atan2(p.dz, p.dx) - Math.atan2(q.dz, q.dx)); n.out.forEach((h, i) => h.oi = i); }
  for (const h of hes) { const o = h.to.out; h.next = o[(h.twin.oi - 1 + o.length) % o.length]; }

  assignControl(nodes, edges);

  // faces (interior faces have positive area and lie to the right of travel, i.e. on the +(-dz,dx) side)
  const faces = [];
  for (const h of hes) {
    if (h.face) continue;
    const f = { hes: [], id: faces.length }; let g = h, guard = 0;
    do { g.face = f; f.hes.push(g); g = g.next; } while (g !== h && guard++ < 5000);
    f.area = polyArea(f.hes.map(q => [q.from.x, q.from.z]));
    faces.push(f);
  }
  let outer = faces[0]; for (const f of faces) if (f.area < outer.area) outer = f;
  outer.outer = true;

  // sidewalk width on the face side of every half-edge
  for (const h of hes) {
    const e = h.e, mx = (h.from.x + h.to.x) / 2 - h.dz * (e.width / 2 + 6), mz = (h.from.z + h.to.z) / 2 + h.dx * (e.width / 2 + 6);
    const d = districtAt(mx, mz); h.district = d;
    if (h.face.outer) { h.sw = 0; h.swKind = 'none'; }
    else if (e.cls === 'bypass') { h.sw = 2.2; h.swKind = 'shoulder'; }
    else if (e.cls === 'alley') { h.sw = 0.6; h.swKind = 'paved'; }
    else if (e.bridge) { h.sw = 2.4; h.swKind = 'paved'; }
    else if (d === 'downtown') { h.sw = 4.2; h.swKind = 'paved'; }
    else if (d === 'oldtown') { h.sw = 3.8; h.swKind = 'brick'; }
    else if (d === 'midtown' || d === 'campus') { h.sw = 3.4; h.swKind = 'paved'; }
    else if (d === 'industrial' || d === 'retail' || d === 'mixed' || d === 'strip') { h.sw = e.cls === 'arterial' ? 3.0 : 2.4; h.swKind = e.cls === 'arterial' ? 'paved' : 'vergeN'; }
    else { h.sw = 3.4; h.swKind = 'verge'; }
  }

  // corners: kerb outline point(s) where consecutive half-edges of a face meet, with the kerb-return fillet
  for (const n of nodes) n.corners = [];
  for (const f of faces) {
    const m = f.hes.length; f.corners = [];
    for (let k = 0; k < m; k++) {
      const hin = f.hes[k], hout = f.hes[(k + 1) % m], v = hin.to;
      const c = { node: v, hin, hout, face: f };
      const solve = (w1, w2) => {
        const r1x = -hin.dz, r1z = hin.dx, r2x = -hout.dz, r2z = hout.dx;
        const cr = hin.dx * hout.dz - hin.dz * hout.dx, dt = hin.dx * hout.dx + hin.dz * hout.dz;
        if (Math.abs(cr) < 0.09) {
          if (dt > 0) { let nx = r1x + r2x, nz = r1z + r2z; const l = Math.hypot(nx, nz); nx /= l; nz /= l; const k1 = 1 / Math.max(0.5, nx * r1x + nz * r1z); return { kind: 'straight', pts: Math.abs(w1 - w2) < 0.05 ? [[v.x + nx * w1 * k1, v.z + nz * w1 * k1]] : [[v.x + nx * w1 * k1, v.z + nz * w1 * k1], [v.x + nx * w2 * k1, v.z + nz * w2 * k1]] }; }
          return { kind: 'uturn', pts: [[v.x + r1x * w1, v.z + r1z * w1], [v.x - r1x * w1, v.z - r1z * w1]] };
        }
        const qx = (w1 * r2z - w2 * r1z) / cr, qz = (r1x * w2 - r2x * w1) / cr;
        return { kind: cr > 0 ? 'convex' : 'reflex', C: [v.x + qx, v.z + qz], cr, dt };
      };
      const w1 = hin.e.width / 2, w2 = hout.e.width / 2;
      const o = solve(w1, w2); c.kind = o.kind;
      if (o.pts) { c.pts = o.pts; }
      else if (o.kind === 'reflex' || f.outer) { c.pts = [o.C]; }
      else {
        const R = Math.min(CLS[hin.e.cls].fillet, CLS[hout.e.cls].fillet), phi = Math.atan2(o.cr, o.dt);
        const t = Math.min(R * Math.tan(phi / 2), 15, hin.e.length * 0.3, hout.e.length * 0.3);
        const A = [o.C[0] - hin.dx * t, o.C[1] - hin.dz * t], B = [o.C[0] + hout.dx * t, o.C[1] + hout.dz * t];
        c.pts = []; const N = 6;
        for (let i = 0; i <= N; i++) { const s = i / N, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), cc = s * s; c.pts.push([a * A[0] + b * o.C[0] + cc * B[0], a * A[1] + b * o.C[1] + cc * B[1]]); }
        c.fillet = true;
      }
      const A = c.pts[0], B = c.pts[c.pts.length - 1];
      c.tIn = Math.max(0, -((A[0] - v.x) * hin.dx + (A[1] - v.z) * hin.dz));
      c.tOut = Math.max(0, (B[0] - v.x) * hout.dx + (B[1] - v.z) * hout.dz);
      if (c.kind === 'uturn') c.tIn = c.tOut = 0;
      if (!f.outer) { const oi = solve(w1 + hin.sw, w2 + hout.sw); c.inner = oi.pts || [oi.C]; }
      f.corners.push(c); v.corners.push(c);
    }
  }
  for (const e of edges) { e.trimA = 0; e.trimB = 0; }
  for (const n of nodes) for (const c of n.corners) {
    const ei = c.hin.e, eo = c.hout.e;
    if (ei.b === n.id && c.hin.fwd) ei.trimB = Math.max(ei.trimB, c.tIn); else ei.trimA = Math.max(ei.trimA, c.tIn);
    if (eo.a === n.id && c.hout.fwd) eo.trimA = Math.max(eo.trimA, c.tOut); else eo.trimB = Math.max(eo.trimB, c.tOut);
  }
  const warn = [];
  for (const e of edges) { if (e.trimA + e.trimB > e.length - 1) { warn.push(`edge ${e.id} ${e.name} too short ${e.length.toFixed(1)} < ${(e.trimA + e.trimB).toFixed(1)}`); const k = (e.length - 1) / (e.trimA + e.trimB); e.trimA *= k; e.trimB *= k; } }

  // junction polygons (clockwise chain of kerb returns and mouth lines round each node)
  for (const n of nodes) {
    n.poly = null; n.mouth = [];
    const trimAt = e => e.a === n.id ? e.trimA : e.trimB;
    let tm = 0; for (const id of n.edges) tm = Math.max(tm, trimAt(edges[id]));
    const stopPad = n.control === 'signal' || n.control === 'stop' ? 5.2 : 0.5;
    n.radius = n.edges.length < 2 ? 0 : tm + stopPad; n.trim = tm;
    if (n.corners.length < 2) continue;
    const pts = [], flags = [];
    let c = n.corners[0];
    for (let k = 0; k < n.corners.length; k++) {
      for (const p of c.pts) { pts.push(p); flags.push(1); }
      const h = c.hout, e = h.e, t = trimAt(e), w = e.width / 2, rx = -h.dz, rz = h.dx;
      flags[flags.length - 1] = 1;
      pts.push([n.x + h.dx * t + rx * w, n.z + h.dz * t + rz * w]); flags.push(0);       // 0 = the edge after this point is an open mouth
      pts.push([n.x + h.dx * t - rx * w, n.z + h.dz * t - rz * w]); flags.push(1);
      c = n.corners.find(q => q.hin === h.twin);
      if (!c) break;
    }
    n.poly = pts; n.polyFlags = flags;
  }

  // blocks
  const blocks = [];
  for (const f of faces) {
    if (f.outer || f.area < 150) continue;
    const m = f.corners.length, outerP = [], innerP = [], sides = [];
    for (let k = 0; k < m; k++) {
      const c = f.corners[k], cn = f.corners[(k + 1) % m];
      for (const p of c.pts) outerP.push(p);
      for (const p of c.inner) innerP.push(p);
      const h = c.hout, o0 = c.pts[c.pts.length - 1], o1 = cn.pts[0], i0 = c.inner[c.inner.length - 1], i1 = cn.inner[0];
      sides.push({ he: h, e: h.e, o0, o1, i0, i1, len: Math.hypot(o1[0] - o0[0], o1[1] - o0[1]), ilen: Math.hypot(i1[0] - i0[0], i1[1] - i0[1]), dx: h.dx, dz: h.dz, nx: -h.dz, nz: h.dx, c0: c, c1: cn });
    }
    const cen = polyCentroid(innerP);
    const b = { id: blocks.length, face: f, outer: outerP, inner: innerP, sides, corners: f.corners, cx: cen[0], cz: cen[1], area: Math.abs(polyArea(innerP)), bb: polyBounds(innerP), district: districtAt(cen[0], cen[1]) };
    const rxm = riverX(cen[1]);
    b.river = b.bb.x0 < rxm && b.bb.x1 > rxm && (b.bb.x1 - b.bb.x0) > 60 && Math.abs(cen[0] - rxm) < 90;
    f.block = b; blocks.push(b);
  }

  // order edges along each named street and give them hundred-block indices for addresses
  const byName = new Map();
  for (const e of edges) { if (!byName.has(e.name)) byName.set(e.name, []); byName.get(e.name).push(e); }
  for (const [name, list] of byName) {
    let sx = 0, sz = 0; for (const e of list) { sx += Math.abs(e.dir.x) * e.length; sz += Math.abs(e.dir.z) * e.length; }
    const ns = sz > sx, key = e => ns ? Math.min(nodes[e.a].z, nodes[e.b].z) : Math.min(nodes[e.a].x, nodes[e.b].x);
    list.sort((p, q) => key(p) - key(q));
    let blk = 1, acc = 0, cur = [];
    const flush = () => { for (const q of cur) q.blkLen = acc; cur = []; acc = 0; blk++; };
    for (const e of list) {
      const a = nodes[e.a], b = nodes[e.b], fwd = ns ? b.z >= a.z : b.x >= a.x, end = fwd ? b : a;
      e.blk = blk; e.blkS = acc; e.fwdName = fwd; acc += e.length; cur.push(e);
      if (end.edges.length >= 3) flush();
    }
    if (cur.length) flush();
  }

  return { nodes, edges, hes, faces, blocks, streets, streetNames: [...byName.keys()], warn, bounds: BOUNDS };
}

function makeEdge(id, a, b, st) {
  const c = CLS[st.cls], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  const parking = st.park === undefined ? c.park > 0 : !!st.park && c.park > 0;
  const bike = st.bike ? 1.7 : 0, side = (parking ? c.park : c.shoulder + (st.cls === 'street' ? 0.3 : 0)) + bike;
  const laneWidth = st.cls === 'street' && !parking ? 3.6 : c.laneWidth;
  const width = 2 * (c.lanes * laneWidth + side) + c.median;
  return {
    id, a: a.id, b: b.id, name: st.name, cls: st.cls, lanes: c.lanes, laneWidth, width, median: c.median, parking, speed: c.speed,
    bridge: !!st.bridge, bridgeId: st.bridge || null, stopAt: { a: false, b: false }, length, dir: { x: dx / length, z: dz / length },
    rank: st.rank ?? c.rank, bike, side,
  };
}

// Signals where two important streets meet (and through the downtown core); stop signs for the minor legs elsewhere.
function assignControl(nodes, edges) {
  for (const n of nodes) {
    const es = n.edges.map(i => edges[i]); if (es.length < 3) { n.control = 'none'; continue; }
    const names = new Map(); for (const e of es) names.set(e.name, Math.max(names.get(e.name) || 0, e.rank));
    const ranks = [...names.values()].sort((a, b) => b - a);
    const top = ranks[0], second = ranks.length > 1 ? ranks[1] : 0;
    const core = n.x > -260 && n.x < 150 && n.z > -180 && n.z < 180 && Math.abs(n.x) < 1100;
    const inTown = Math.abs(n.x) <= 1040 && Math.abs(n.z) <= 730;
    if (inTown && second >= 1 && ((top >= 2 && second >= 1.45) || (top >= 3 && second >= 1.5) || (top >= 1.5 && second >= 1.5) || (core && second >= 1 && es.every(e => e.cls !== 'alley')))) {
      n.control = 'signal';
      // phase groups: the legs of the most important street share a phase, everything else gets the other
      const ref = es.reduce((a, b) => b.rank > a.rank ? b : a), g = {};
      for (const e of es) g[e.id] = e.name === ref.name ? 0 : 1;
      const big = top >= 2;
      n.sig = { g, gA: big ? 26 : 18, gB: big && second < 2 ? 14 : 18, off: hash2(n.id, 7, 3) * 60 };
      continue;
    }
    n.control = 'stop';
    // legs of the top-ranked street run free if that street passes straight through; everyone else stops
    const through = es.filter(e => e.rank === top);
    const free = through.length === 2 && second < top;
    for (const e of es) { const stop = !(free && e.rank === top); if (e.a === n.id) e.stopAt.a = stop; else e.stopAt.b = stop; }
  }
}

const SIG_Y = 3.6, SIG_R = 1.6;
export function signalState(n, edgeId, t) {
  const s = n.sig; if (!s) return 'g';
  const cyc = s.gA + s.gB + 2 * (SIG_Y + SIG_R); let tt = (t + s.off) % cyc; if (tt < 0) tt += cyc;
  if (s.g[edgeId] === 0) return tt < s.gA ? 'g' : tt < s.gA + SIG_Y ? 'y' : 'r';
  const b0 = s.gA + SIG_Y + SIG_R; return tt < b0 ? 'r' : tt < b0 + s.gB ? 'g' : tt < b0 + s.gB + SIG_Y ? 'y' : 'r';
}

// Point on an edge: s metres from node a, u metres to the right of the a->b centreline.
export function edgePoint(L, e, s, u) { const a = L.nodes[e.a]; return [a.x + e.dir.x * s - e.dir.z * u, a.z + e.dir.z * s + e.dir.x * u]; }
// Heading (rotation about Y, forward = (sin h, cos h)) for a direction vector.
export const headingOf = (dx, dz) => Math.atan2(dx, dz);
