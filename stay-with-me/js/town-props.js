// Street furniture, traffic control, trees and the night-lighting layer.
//   buildStreetscape(T)  kerb-side furniture per block side (lamps, trees, meters, hydrants, poles and wires, bus stops),
//                        signals / stop signs / name blades at junctions, kerbside parking bays, mailboxes
//   buildTrees(T, M)     instanced trees from T.trees (five broadleaf and conifer models built from leaf cards)
//   buildNightFx(T, M)   lamp halos, wet-road reflection streaks, live signal lamps, and the baked lamp light map
// Tuning: lamp spacing in LAMP, tree models in treeGeometry(), halo / streak look in the shaders at the bottom.

import * as THREE from 'three';
import { U, glowTexture } from './gfx.js';
import { makeRng, lerp, makeCanvas } from './util.js';
import { MB, Strip } from './town-geo.js';
import { WL, GL, METAL } from './town-mat.js';
import { KERB, BOUNDS, signalState } from './town-layout.js';
import { SIGN, CUT, cutUV } from './town-atlas.js';
import { ctx, signQuad, boxSign, cutRun } from './town-buildings.js';

const WARM = [1.0, 0.72, 0.42], LED = [1.0, 0.9, 0.74], SODIUM = [1.0, 0.6, 0.26];

// ---------------------------------------------------------------- small props (local frame, y = 0 at sidewalk level)

function lampCobra(T, B, hgt, arm, col, pool = 1) {
  const p = B.p; p.lay(WL.plain + METAL).col(150, 154, 156);
  p.cyl(0, 0, 0, 0.5, 0.16, 0.13, 8, 0); p.cyl(0, 0, 0.5, hgt, 0.11, 0.07, 7, 0);
  p.tube(0, hgt - 0.05, 0, 0, hgt + 0.55, arm * 0.45, 0.06, 0.055, 5); p.tube(0, hgt + 0.55, arm * 0.45, 0, hgt + 0.7, arm, 0.055, 0.05, 5);
  p.lay(WL.plain).col(120, 124, 128); p.box(-0.17, hgt + 0.6, arm - 0.1, 0.17, hgt + 0.76, arm + 0.62, 63);
  const w = cutW(T); B.s.col(255, 0, 0).lay(0); B.s.quad(-0.13, hgt + 0.595, arm, 0.13, hgt + 0.595, arm, 0.13, hgt + 0.595, arm + 0.58, -0.13, hgt + 0.595, arm + 0.58, w.u0, w.v0, w.u1, w.v1);
  const c = B.w(0, arm + 0.3), b = B.w(0, 0); T.lamps.push(c[0], KERB + hgt + 0.55, c[1]); T.lampInfo.push({ x: c[0], y: KERB + hgt + 0.55, z: c[1], col, r: hgt * 1.75 * pool, k: 1 });
  T.colliders.add(b[0], b[1], 0.16, 0.16, 0, hgt, 'pole');
}
function lampPost(T, B, col) {
  const p = B.p, h = 3.9; p.lay(WL.plain).col(26, 30, 28);
  p.cyl(0, 0, 0, 0.7, 0.17, 0.11, 8, 0); p.cyl(0, 0, 0.7, h, 0.07, 0.055, 7, 0); p.cyl(0, 0, h, h + 0.12, 0.2, 0.2, 8); p.cyl(0, 0, h + 0.62, h + 0.86, 0.24, 0.03, 8);
  const w = cutW(T), s = B.s; s.col(215, 0, 0).lay(0);
  for (let i = 0; i < 6; i++) { const a0 = i / 6 * 6.283, a1 = (i + 1) / 6 * 6.283, r0 = 0.15, r1 = 0.2; s.quad(Math.cos(a1) * r0, h + 0.12, Math.sin(a1) * r0, Math.cos(a0) * r0, h + 0.12, Math.sin(a0) * r0, Math.cos(a0) * r1, h + 0.62, Math.sin(a0) * r1, Math.cos(a1) * r1, h + 0.62, Math.sin(a1) * r1, w.u0, w.v0, w.u1, w.v1); }
  const b = B.w(0, 0); T.lamps.push(b[0], KERB + h + 0.4, b[1]); T.lampInfo.push({ x: b[0], y: KERB + h + 0.4, z: b[1], col, r: 9.5, k: 0.8 });
  T.colliders.add(b[0], b[1], 0.14, 0.14, 0, h, 'pole');
}
const cutW = T => T.whiteRect || (T.whiteRect = SIGN.text(T.atlas, 'white', '', { w: 16, h: 16, bg: '#ffffff' }));
function hydrant(B, r) { const p = B.p, c = r.chance(0.7) ? [176, 40, 30] : [200, 170, 40]; p.lay(WL.plain).col(c[0], c[1], c[2]); p.cyl(0, 0, 0, 0.08, 0.16, 0.16, 8); p.cyl(0, 0, 0.08, 0.55, 0.11, 0.11, 8); p.cyl(0, 0, 0.55, 0.7, 0.12, 0.03, 8); p.tube(-0.2, 0.42, 0, 0.2, 0.42, 0, 0.05, 0.05, 5); p.tube(0, 0.36, 0, 0, 0.36, 0.2, 0.065, 0.065, 5); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.18, 0.18, 0, 0.7, 'prop', true); }
function meter(B) { const p = B.p; p.lay(WL.plain + METAL).col(120, 124, 126); p.cyl(0, 0, 0, 1.05, 0.03, 0.03, 5, 0); p.lay(WL.plain).col(54, 58, 62); p.box(-0.09, 1.05, -0.07, 0.09, 1.38, 0.07, 63); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.08, 0.08, 0, 1.3, 'prop', true); }
function bin(B, r) { const p = B.p, c = r.chance(0.5) ? [34, 60, 44] : [50, 52, 56]; p.lay(WL.plain).col(c[0], c[1], c[2]); p.cyl(0, 0, 0, 0.92, 0.27, 0.31, 10); p.col(24, 26, 28).cyl(0, 0, 0.92, 1.02, 0.33, 0.2, 10); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.3, 0.3, 0, 1, 'prop', true); }
function bench(B) { const p = B.p; p.lay(WL.wood).col(170, 140, 110); p.box(-0.85, 0.42, -0.22, 0.85, 0.47, 0.22, 63); p.box(-0.85, 0.55, -0.26, 0.85, 0.9, -0.21, 63); p.lay(WL.plain).col(30, 32, 34); for (const x of [-0.7, 0.7]) { p.box(x - 0.03, 0, -0.24, x + 0.03, 0.42, 0.2, 15); p.box(x - 0.03, 0.42, -0.27, x + 0.03, 0.9, -0.22, 15); } const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.9, 0.3, B.h, 0.9, 'prop', true); }
function newsbox(B, r) { const p = B.p, c = r.pick([[30, 70, 140], [170, 40, 34], [210, 170, 40], [40, 110, 70]]); p.lay(WL.plain).col(c[0], c[1], c[2]); p.box(-0.22, 0.35, -0.19, 0.22, 1.15, 0.19, 63); p.col(30, 30, 32).box(-0.05, 0, -0.05, 0.05, 0.35, 0.05, 15); p.col(20, 24, 28).lay(WL.plain + METAL).box(-0.17, 0.72, 0.19, 0.17, 1.08, 0.2, 1); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.24, 0.2, B.h, 1.15, 'prop', true); }
function planter(B, r) { const p = B.p; p.lay(WL.panel).col(196, 192, 184); p.box(-0.6, 0, -0.6, 0.6, 0.55, 0.6, 31); p.lay(WL.wood).col(70, 56, 44).box(-0.5, 0.5, -0.5, 0.5, 0.52, 0.5, 16); B.tree(0, 0, 'bush', r.r(0.7, 1.0)); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.6, 0.6, B.h, 0.6, 'prop'); }
function bollard(B) { const p = B.p; p.lay(WL.plain).col(200, 170, 40); p.cyl(0, 0, 0, 0.95, 0.08, 0.08, 7); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.09, 0.09, 0, 0.95, 'pole'); }
export function dumpster(B, r) { const p = B.p, c = r.chance(0.6) ? [34, 70, 52] : [40, 60, 110]; p.lay(WL.metal).col(c[0], c[1], c[2]); p.box(-0.95, 0.1, -0.6, 0.95, 1.2, 0.6, 31); p.lay(WL.plain).col(30, 32, 34); p.quad(-0.98, 1.2, 0.63, 0.98, 1.2, 0.63, 0.98, 1.42, -0.63, -0.98, 1.42, -0.63, 0, 0); p.tri3(0.98, 1.2, 0.63, 0.98, 1.2, -0.63, 0.98, 1.42, -0.63); p.tri3(-0.98, 1.2, -0.63, -0.98, 1.2, 0.63, -0.98, 1.42, -0.63); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.98, 0.63, B.h, 1.4, 'prop'); }
function mailbox(B, r) { const p = B.p; p.lay(WL.wood).col(150, 130, 110); p.box(-0.045, 0, -0.045, 0.045, 1.05, 0.045, 15); p.lay(WL.plain + (r.chance(0.5) ? METAL : 0)); const c = r.pick([[40, 40, 42], [200, 200, 196], [150, 40, 34], [30, 50, 90]]); p.col(c[0], c[1], c[2]); p.box(-0.1, 1.05, -0.1, 0.1, 1.28, 0.38, 63); p.lay(WL.plain).col(180, 40, 30).box(0.1, 1.14, 0.2, 0.115, 1.34, 0.24, 63); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.12, 0.2, B.h, 1.3, 'prop', true); }
function signPost(B, rect, w, h, y, glow = 0.12, hgt) { const p = B.p; p.lay(WL.plain + METAL).col(128, 132, 132); p.box(-0.028, 0, -0.028, 0.028, hgt || y + h / 2 + 0.05, 0.028, 15); signQuad(B, rect, 0, y, 0.035, w, h, 0, glow); p.lay(WL.plain + METAL).col(150, 152, 150); p.quad(w * 0.46, y - h * 0.46, 0.03, -w * 0.46, y - h * 0.46, 0.03, -w * 0.46, y + h * 0.46, 0.03, w * 0.46, y + h * 0.46, 0.03, 0, 0); const b = B.w(0, 0); B.T.colliders.add(b[0], b[1], 0.06, 0.06, 0, y + h, 'pole', true); }
// Two-sided street-name blade, long axis along local X.
function blade(B, name, y, len = 0.95) { const rect = SIGN.blade(B.T.atlas, name), h = len * 96 / 512; signQuad(B, rect, 0, y, 0.012, len, h, 0, 0.3); signQuad(B, rect, 0, y, -0.012, len, h, Math.PI, 0.3); }

function utilityPole(T, B, r, wiresTo) {
  const p = B.p, h = 9.6; p.lay(WL.wood).col(120, 100, 84); p.cyl(0, 0, 0, h, 0.15, 0.1, 7);
  p.box(-0.05, h - 0.9, -1.1, 0.05, h - 0.78, 1.1, 63); p.box(-0.05, h - 1.9, -0.8, 0.05, h - 1.8, 0.8, 63);
  if (r.chance(0.3)) { p.lay(WL.plain + METAL).col(120, 124, 126); p.cyl(0.32, 0, h - 3.3, h - 2.3, 0.24, 0.24, 8); }
  const b = B.w(0, 0); T.colliders.add(b[0], b[1], 0.16, 0.16, 0, h, 'pole');
  if (wiresTo) {
    // wiresTo: local offset [dx, dz] to the next pole; three conductors and a lower cable, sagging
    const [dx, dz] = wiresTo, L = Math.hypot(dx, dz), N = 4; p.lay(WL.plain).col(22, 22, 24);
    for (const [ox, oy, sag] of [[-1.0, h - 0.74, 0.5], [0, h - 0.74, 0.55], [1.0, h - 0.74, 0.5], [0.7, h - 1.76, 0.7], [0, h - 3.2, 0.9]]) {
      for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, y0 = oy - sag * 4 * t0 * (1 - t0) * (L / 42), y1 = oy - sag * 4 * t1 * (1 - t1) * (L / 42); p.quad(dx * t0, y0 - 0.014, ox + dz * t0, dx * t1, y1 - 0.014, ox + dz * t1, dx * t1, y1 + 0.014, ox + dz * t1, dx * t0, y0 + 0.014, ox + dz * t0, 0, 0); p.quad(dx * t1, y1 - 0.014, ox + dz * t1, dx * t0, y0 - 0.014, ox + dz * t0, dx * t0, y0 + 0.014, ox + dz * t0, dx * t1, y1 + 0.014, ox + dz * t1, 0, 0); }
    }
  }
}
function busShelter(T, B) {
  const p = B.p; p.lay(WL.plain + METAL).col(70, 76, 80);
  for (const x of [-1.9, 1.9]) for (const z of [-0.55, 0.55]) p.box(x - 0.04, 0, z - 0.04, x + 0.04, 2.35, z + 0.04, 15);
  p.box(-2.1, 2.35, -0.75, 2.1, 2.45, 0.85, 63);
  p.lay(WL.plain + METAL).col(26, 34, 40); p.box(-1.9, 0.25, -0.57, 1.9, 2.2, -0.54, 3); p.box(-1.92, 0.25, -0.55, -1.89, 2.2, 0.3, 12);
  p.lay(WL.wood).col(150, 126, 100); p.box(-1.3, 0.42, -0.45, 1.3, 0.47, -0.1, 63);
  const ad = SIGN.billboard(T.atlas, Math.floor(Math.abs(B.x + B.z)) % 6); boxSign(B, ad, 1.9, 1.25, 0.2, 1.1, 1.6, -Math.PI / 2, 1.6, 0.08);
  B.p.push(2.6, 0, 0.5, 0); B.s.push(2.6, 0, 0.5, 0); signPost(B, SIGN.bus(T.atlas), 0.42, 0.52, 2.5); B.p.pop(); B.s.pop();
  const b = B.w(0, 0); T.colliders.add(b[0], b[1], 2.1, 0.8, B.h, 2.4, 'prop');
}
function billboard(T, B, i) {
  const p = B.p; p.lay(WL.plain + METAL).col(90, 94, 96); p.cyl(0, 0, 0, 7, 0.32, 0.26, 10);
  p.lay(WL.plain).col(40, 42, 46); p.box(-5.6, 7, -0.25, 5.6, 12.2, 0.25, 63);
  const r = SIGN.billboard(T.atlas, i); signQuad(B, r, 0, 9.6, 0.26, 10.8, 4.8, 0, 1.3); signQuad(B, SIGN.billboard(T.atlas, i + 3), 0, 9.6, -0.26, 10.8, 4.8, Math.PI, 1.3);
  const b = B.w(0, 0); T.colliders.add(b[0], b[1], 0.35, 0.35, 0, 12, 'pole');
}

// ---------------------------------------------------------------- streetscape

const CORE = d => d === 'downtown' || d === 'oldtown' || d === 'midtown' || d === 'campus';

export function buildStreetscape(T) {
  const L = T.L, rng = makeRng(T.seed * 17 + 3);
  T.lampInfo = T.lampInfo || []; T.sigLamps = []; T.sigIndex = new Map();
  for (const b of L.blocks) for (const side of b.sides) { side.he.side = side; side.block = b; }
  // --- along every block side
  for (const b of L.blocks) for (const side of b.sides) {
    const he = side.he, e = side.e, sw = he.sw, len = side.len; if (len < 12 || sw < 1.5 || e.cls === 'alley') continue;
    const d = he.district, core = CORE(d), strip = new Strip(), r = makeRng(T.seed + e.id * 131 + (he.fwd ? 7 : 0));
    const at = (s, m, rot = 0) => ctx(T, side.o0[0] + side.dx * s + side.nx * m, side.o0[1] + side.dz * s + side.nz * m, Math.atan2(-side.nx, -side.nz) + rot);
    const sOf = (x, z) => (x - side.o0[0]) * side.dx + (z - side.o0[1]) * side.dz;
    for (const c of side.cuts || []) strip.force(sOf(c[0], c[1]), c[2] + 0.4);
    strip.force(0, 4.5); strip.force(len, 4.5);
    // lamps
    const bridge = e.bridge, both = e.cls === 'arterial' || e.cls === 'bypass' || core || bridge;
    if (both || he.fwd) {
      const sp = d === 'oldtown' || (bridge && e.bridgeId !== 'route9') ? 23 : e.cls === 'bypass' ? 62 : e.cls === 'arterial' ? 46 : core ? 40 : 58;
      const n = Math.max(1, Math.round(len / sp)), ph = both && !he.fwd ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        let s = (i + 0.5 + ph * 0.5) / n * len; if (!strip.free(s, 1.2)) { s += 3; if (!strip.free(s, 1.2)) s -= 6; } if (s < 3 || s > len - 3) continue; strip.force(s, 1.2);
        if (d === 'oldtown' || (bridge && e.bridgeId !== 'route9')) lampPost(T, at(s, 0.75), WARM);
        else lampCobra(T, at(s, 0.7), e.cls === 'bypass' ? 10.5 : e.cls === 'arterial' ? 9.2 : 7.8, e.cls === 'street' ? 1.6 : 2.4, e.cls === 'street' && !core ? SODIUM : LED);
      }
    }
    if (bridge) continue;
    // bus stop on the busier streets
    if (e.rank >= 1.5 && e.cls !== 'bypass' && len > 60 && (e.id + (he.fwd ? 1 : 0)) % 3 === 0) { const s = len - 16; if (strip.take(s, 3.5)) { busShelter(T, at(s, Math.min(sw - 0.9, 2.0))); side.bus = s; } }
    // hydrant
    if (len > 40 && r.chance(0.7)) { const s = r.r(7, len - 7); if (strip.take(s, 2.5)) { hydrant(at(s, 0.55), r); side.hyd = s; } }
    // street trees
    if (e.cls !== 'bypass') {
      const sp = core ? r.r(13, 17) : d === 'residential' || d === 'bungalow' ? r.r(17, 26) : 9e9;
      for (let s = r.r(6, 12); s < len - 6; s += sp * r.r(0.8, 1.25)) {
        if (!strip.take(s, 1.6) || (!core && r.chance(0.3))) continue;
        const B = at(s, core ? 1.0 : 0.85); B.tree(0, 0, r.pick(core ? ['maple', 'alder', 'maple', 'birch'] : ['maple', 'oak', 'alder', 'maple', 'birch']), core ? r.r(0.55, 0.75) : r.r(0.75, 1.1));
        if (core) { B.d.lay(GL.gravel).col(170, 150, 130); B.d.gquad(-0.65, -0.65, 0.65, -0.65, 0.65, 0.65, -0.65, 0.65, 0.012, 0, 0, 1.3, 0, 1.3, 1.3, 0, 1.3); }
      }
    }
    // core clutter: meters, bins, benches, news boxes, planters
    if (core) {
      if (e.parking) { const a = L.nodes[e.a]; for (let s = 6; s < len - 6; s += 1) { const P = [side.o0[0] + side.dx * s, side.o0[1] + side.dz * s], v = (P[0] - a.x) * e.dir.x + (P[1] - a.z) * e.dir.z, k = Math.round((v - 3.2) / 6.4), sv = s + (3.2 + 6.4 * k - v) * (he.fwd ? 1 : -1); if (Math.abs(sv - s) < 0.5 && strip.take(sv, 0.35)) { meter(at(sv, 0.42)); s += 5; } } }
      for (let s = r.r(10, 26); s < len - 8; s += r.r(22, 44)) { const k = r(); if (!strip.take(s, 1.3)) continue; if (k < 0.3) bin(at(s, 0.7), r); else if (k < 0.55) bench(at(s, sw - 0.7)); else if (k < 0.75) newsbox(at(s, 0.75, Math.PI), r); else if (sw > 3.5) planter(at(s, 0.95), r); else bin(at(s, 0.7), r); }
    } else if (d !== 'residential' && d !== 'bungalow' && r.chance(0.4)) { const s = r.r(8, len - 8); if (strip.take(s, 1)) bin(at(s, 0.7), r); }
    // utility poles and wires down the far side of ordinary streets
    if (!core && !he.fwd && e.cls === 'street' && len > 30 && d !== 'retail') {
      const n = Math.max(2, Math.round(len / 40) + 1), pts = [];
      for (let i = 0; i < n; i++) { let s = 3.5 + (len - 7) * i / (n - 1); pts.push(s); }
      pts.forEach((s, i) => { strip.force(s, 0.8); const B = at(s, 0.95), nx = i + 1 < n ? [-(pts[i + 1] - s), 0] : null; utilityPole(T, B, r, nx); });
    }
    // speed limit signs
    if (e.cls !== 'alley' && len > 70 && (e.id * 7 + (he.fwd ? 3 : 0)) % 5 === 0) { const s = 20; if (strip.take(s, 0.8)) signPost(at(s, 0.5, Math.atan2(-side.dx, -side.dz) - Math.atan2(-side.nx, -side.nz)), SIGN.speed(T.atlas, e.cls === 'bypass' ? 55 : e.cls === 'arterial' ? 35 : 25), 0.6, 0.75, 2.3, 0.2); }
    side.strip = strip;
  }

  // --- junction control
  let si = 0;
  for (const n of L.nodes) {
    if (n.edges.length < 3) continue;
    const es = n.edges.map(i => L.edges[i]);
    const names = [...new Set(es.map(e => e.name))];
    if (n.control === 'signal') T.sigIndex.set(n.id, si++);
    let bladesDone = false;
    for (const e of es) {
      // d = direction of travel into the junction along e, r = its right
      const inFwd = e.b === n.id, dx = inFwd ? e.dir.x : -e.dir.x, dz = inFwd ? e.dir.z : -e.dir.z, rx = -dz, rz = dx, hw = e.width / 2, face = Math.atan2(-dx, -dz);
      const cross = es.filter(o => o !== e && Math.abs(o.dir.x * dx + o.dir.z * dz) < 0.75), rc = cross.length ? Math.max(...cross.map(o => o.width / 2)) : hw;
      const other = names.find(nm => nm !== e.name) || e.name;
      if (n.control === 'signal') {
        let px = n.x + dx * (rc + 2.7) + rx * (hw + 2.7), pz = n.z + dz * (rc + 2.7) + rz * (hw + 2.7);
        for (let k = 0; k < 4 && T.surf.at(px, pz) === 2; k++) { px += rx * 1.2 + dx * 0.6; pz += rz * 1.2 + dz * 0.6; }
        const B = ctx(T, px, pz, face), p = B.p, big = e.cls !== 'street', ph = big ? 6.6 : 5.6;
        const reach = (hw + 2.7) - (e.median / 2 + e.laneWidth * 0.5) + 0.6;     // arm runs to the left as traffic sees it = local -X
        p.lay(WL.plain + METAL).col(138, 142, 144); p.cyl(0, 0, 0, 0.6, 0.22, 0.17, 9, 0); p.cyl(0, 0, 0.6, ph + 0.5, 0.14, 0.1, 8);
        p.tube(0, ph - 0.25, 0, -reach, ph + 0.05, 0, 0.1, 0.06, 6);
        const grp = n.sig.g[e.id], idx = T.sigIndex.get(n.id) * 2 + grp;
        const head = (lx, ly, lz) => {
          p.lay(WL.plain).col(196, 160, 30); p.box(lx - 0.19, ly - 0.56, lz - 0.14, lx + 0.19, ly + 0.56, lz + 0.1, 63);
          p.col(20, 20, 20); p.box(lx - 0.24, ly - 0.62, lz - 0.17, lx + 0.24, ly + 0.62, lz - 0.14, 2 + 4 + 8 + 16 + 32);
          for (let k = 0; k < 3; k++) { const y = ly + 0.36 - k * 0.36; p.col(12, 12, 12); p.box(lx - 0.13, y + 0.11, lz + 0.1, lx + 0.13, y + 0.15, lz + 0.3, 63); const w = B.w(lx, lz + 0.115); T.sigLamps.push({ x: w[0], y: KERB + y, z: w[1], h: face, idx, kind: k === 0 ? 2 : k === 1 ? 1 : 0, r: 0.105 }); }
        };
        for (let i = 0; i < e.lanes; i++) { const u = e.median / 2 + (i + 0.5) * e.laneWidth; head(-((hw + 2.7) - u), ph - 0.35, 0.06); }
        head(0.0, 3.3, 0.2);
        // pedestrian head on the pole, facing people crossing with this traffic
        p.lay(WL.plain).col(24, 24, 26); p.box(0.16, 2.25, -0.12, 0.5, 2.65, 0.08, 63); { const w = B.w(0.33, 0.09); T.sigLamps.push({ x: w[0], y: KERB + 2.45, z: w[1], h: face, idx, kind: 3, r: 0.12 }); }
        // overhead street-name sign
        const rect = SIGN.blade(T.atlas, other); signQuad(B, rect, -reach * 0.42, ph + 0.42, 0.11, 1.9, 0.36, 0, 0.5);
        p.lay(WL.plain + METAL).col(150, 152, 150); p.quad(-reach * 0.42 + 0.95, ph + 0.24, 0.1, -reach * 0.42 - 0.95, ph + 0.24, 0.1, -reach * 0.42 - 0.95, ph + 0.6, 0.1, -reach * 0.42 + 0.95, ph + 0.6, 0.1, 0, 0);
        T.colliders.add(px, pz, 0.22, 0.22, 0, ph, 'pole');
        // hospital guide signs on the big roads
        if (e.rank >= 2 && T.places.general && T.places.regional) {
          const hp = [T.places.general, T.places.regional].reduce((a, c) => Math.hypot(c.x - n.x, c.z - n.z) < Math.hypot(a.x - n.x, a.z - n.z) ? c : a), vx = hp.x - n.x, vz = hp.z - n.z, vl = Math.hypot(vx, vz);
          if (vl > 90) { const fwd = (vx * dx + vz * dz) / vl, rt = (vx * rx + vz * rz) / vl, dir = fwd > 0.72 ? -1 : rt > 0 ? 0 : 2; const Bs = ctx(T, n.x - dx * (n.trim + 9) + rx * (hw + 0.6), n.z - dz * (n.trim + 9) + rz * (hw + 0.6), face); if (T.surf.at(Bs.x, Bs.z) !== 2) signPost(Bs, SIGN.hosp(T.atlas, dir), 0.6, 0.8, 2.4, 0.25); }
        }
      } else if (n.control === 'stop') {
        const stop = inFwd ? e.stopAt.b : e.stopAt.a; if (!stop && bladesDone) continue;
        const trim = inFwd ? e.trimB : e.trimA, px = n.x - dx * (trim + 1.4) + rx * (hw + 0.75), pz = n.z - dz * (trim + 1.4) + rz * (hw + 0.75);
        if (T.surf.at(px, pz) === 2) continue;
        const B = ctx(T, px, pz, face), inTown = Math.abs(n.x) < BOUNDS.maxX && Math.abs(n.z) < BOUNDS.maxZ;
        if (!inTown) { B.p.frame(px, -0.05, pz, face); B.s.frame(px, -0.05, pz, face); }
        if (stop) signPost(B, SIGN.stop(T.atlas), 0.76, 0.76, 2.35, 0.3, bladesDone ? 0 : 3.25); else { B.p.lay(WL.plain + METAL).col(128, 132, 132); B.p.box(-0.028, 0, -0.028, 0.028, 3.25, 0.028, 15); }
        if (!bladesDone && names.length > 1 && e.cls !== 'bypass') {
          bladesDone = true;
          // each blade runs parallel to the street it names
          const yaw = nm => { const o = es.find(q => q.name === nm); return Math.atan2(o.dir.x, o.dir.z) - face + Math.PI / 2; };
          names.slice(0, 2).forEach((nm, i) => { B.s.push(0, 0, 0, yaw(nm)); B.p.push(0, 0, 0, yaw(nm)); blade(B, nm, 3.02 + i * 0.2); B.s.pop(); B.p.pop(); });
        }
      }
    }
  }

  // --- kerbside parking bays (the game instances cars on a share of them)
  for (const e of L.edges) {
    if (!e.parking) continue;
    const a = L.nodes[e.a], travel = e.median / 2 + e.lanes * e.laneWidth, r = makeRng(T.seed + e.id * 977);
    for (const sd of [1, -1]) {
      const he = sd > 0 ? e.he[0] : e.he[1], side = he.side, d = he.district, occ = CORE(d) ? (d === 'midtown' ? 0.3 : 0.4) : d === 'residential' || d === 'bungalow' ? 0.13 : 0.1;
      for (let k = Math.ceil((e.trimA + 9) / 6.4); k * 6.4 < e.length - e.trimB - 9; k++) {
        const v = k * 6.4, x = a.x + e.dir.x * v - e.dir.z * sd * (travel + 1.15), z = a.z + e.dir.z * v + e.dir.x * sd * (travel + 1.15);
        if (!r.chance(occ)) continue;
        if (side) { const s = (x - side.o0[0]) * side.dx + (z - side.o0[1]) * side.dz; if ((side.cuts || []).some(c => Math.abs((c[0] - side.o0[0]) * side.dx + (c[1] - side.o0[1]) * side.dz - s) < c[2] + 2.6)) continue; if (side.bus !== undefined && Math.abs(side.bus - s) < 9) continue; if (side.hyd !== undefined && Math.abs(side.hyd - s) < 4) continue; }
        T.parking.push({ x, z, heading: Math.atan2(e.dir.x * sd, e.dir.z * sd), kind: 'kerb' });
      }
    }
  }
  // --- mailboxes, alley dumpsters, billboards
  for (const m of T.mailboxes) mailbox(ctx(T, m.x, m.z, m.h), rng);
  for (const l of T.parkLamps || []) lampPost(T, ctx(T, l.x, l.z, l.h), WARM);
  for (const l of T.parkBenches || []) bench(ctx(T, l.x, l.z, l.h));
  for (const l of T.reeds || []) T.trees.push({ x: l.x, z: l.z, kind: 'reeds', s: l.s, noCollide: true });
  for (const e of L.edges) {
    if (e.cls === 'alley') { const a = L.nodes[e.a]; for (let s = e.trimA + 8; s < e.length - e.trimB - 6; s += rng.r(14, 26)) { const sd = rng.chance(0.5) ? 1 : -1, x = a.x + e.dir.x * s - e.dir.z * sd * (e.width / 2 + 1.6), z = a.z + e.dir.z * s + e.dir.x * sd * (e.width / 2 + 1.6); if (T.surf.at(x, z) !== 6 && T.surf.at(x, z) !== 2) dumpster(ctx(T, x, z, Math.atan2(e.dir.x, e.dir.z) + (sd > 0 ? -Math.PI / 2 : Math.PI / 2)), rng); } }
  }
  let bi = 0;
  for (const e of L.edges) {
    if (e.cls !== 'bypass' || e.bridge || e.length < 120) continue;
    const a = L.nodes[e.a], sd = bi % 2 ? 1 : -1, s = e.length * 0.5, x = a.x + e.dir.x * s - e.dir.z * sd * (e.width / 2 + 9), z = a.z + e.dir.z * s + e.dir.x * sd * (e.width / 2 + 9);
    if (Math.abs(x) > 1250 || T.surf.at(x, z) === 6 || T.surf.at(x, z) === 5) continue;
    const B = ctx(T, x, z, Math.atan2(e.dir.x, e.dir.z) + 0.25); if (T.surf.at(x, z) <= 1) { B.p.frame(x, -0.1, z, B.h); B.s.frame(x, -0.1, z, B.h); } billboard(T, B, bi++);
  }
}

// ---------------------------------------------------------------- trees

function treeGeometry(kind, seed) {
  const r = makeRng(seed), m = new MB(false), leafUV = cutUV(kind === 'maple' ? CUT.leafA : kind === 'oak' ? CUT.leafB : kind === 'birch' ? CUT.leafB : CUT.leafC);
  const bark = cutUV(kind === 'birch' ? CUT.birch : CUT.bark);
  const limb = (x0, y0, z0, x1, y1, z1, r0, r1, seg = 6) => {
    // tube with bark uv
    let ax = x1 - x0, ay = y1 - y0, az = z1 - z0; const L = Math.hypot(ax, ay, az) || 1; ax /= L; ay /= L; az /= L;
    let ux = 0, uy = 1, uz = 0; if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; }
    let px = ay * uz - az * uy, py = az * ux - ax * uz, pz = ax * uy - ay * ux; const pm = Math.hypot(px, py, pz) || 1; px /= pm; py /= pm; pz /= pm;
    const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px, base = m.n;
    for (let i = 0; i <= seg; i++) { const a = i / seg * 6.283, c = Math.cos(a), s = Math.sin(a), nx = px * c + qx * s, ny = py * c + qy * s, nz = pz * c + qz * s, u = lerp(bark.u0, bark.u1, (i / seg * 2) % 1.0001); m.v(x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, nx, ny, nz, u, bark.v0); m.v(x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, nx, ny, nz, u, lerp(bark.v0, bark.v1, Math.min(1, L / 4))); }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; m.tri(a, a + 3, a + 1); m.tri(a, a + 2, a + 3); }
  };
  const card = (cx, cy, cz, size, ox, oy, oz, shade, uv, tint) => {
    // quad facing a random direction; normals pushed outward from the crown centre for soft, rounded shading
    let nx = cx - ox, ny = cy - oy + size * 0.5, nz = cz - oz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // card plane roughly perpendicular to the outward direction, with some scatter
    let fx = nx + r.r(-0.7, 0.7), fy = ny * 0.6 + r.r(-0.5, 0.5), fz = nz + r.r(-0.7, 0.7); const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = fz, rz = -fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; const ux2 = fy * rz, uy2 = fz * rx - fx * rz, uz2 = -fy * rx;
    m.col(tint[0] * shade, tint[1] * shade, tint[2] * shade).lay(255);
    const h = size / 2, v = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => m.v(cx + rx * a * h + ux2 * b * h, cy + uy2 * b * h, cz + rz * a * h + uz2 * b * h, nx, ny * 0.7 + 0.3, nz, a < 0 ? uv.u0 : uv.u1, b < 0 ? uv.v0 : uv.v1));
    m.tri(v[0], v[1], v[2]); m.tri(v[0], v[2], v[3]);
  };
  m.col(255, 255, 255).lay(0);
  if (kind === 'fir' || kind === 'cedar' || kind === 'pine') {
    // Conifer: whorls of drooping bough cards round the trunk, over a pair of crossed silhouette cards that fill the
    // core. 'pine' is the cheap forest-edge version with fewer whorls.
    const lo = kind === 'pine', ced = kind === 'cedar', H = ced ? r.r(13, 16) : lo ? r.r(17, 21) : r.r(15, 19), R = ced ? r.r(3.6, 4.3) : r.r(3.0, 3.7);
    const uv = cutUV(ced ? CUT.cedar : CUT.fir), core = cutUV(ced ? CUT.impB : CUT.impA), whorls = lo ? 7 : 15, per = lo ? 4 : 6;
    m.col(205, 195, 185).lay(0); limb(0, 0, 0, 0, H * 0.5, 0, 0.3, 0.17, lo ? 5 : 7); limb(0, H * 0.5, 0, 0, H - 0.6, 0, 0.17, 0.04, 4);
    // crossed full-height silhouette cards fill the core; the whorls of bough cards give it volume
    m.col(200, 212, 200).lay(255); for (const a of [0.4, 0.4 + Math.PI / 2]) { const c = Math.cos(a) * R * 0.8, s = Math.sin(a) * R * 0.8, q = [m.v(-c, 1.1, -s, -c * 0.15, 0.95, -s * 0.15, core.u0, core.v0 + 0.02), m.v(c, 1.1, s, c * 0.15, 0.95, s * 0.15, core.u1, core.v0 + 0.02), m.v(c, H + 0.5, s, 0, 1, 0, core.u1, core.v1), m.v(-c, H + 0.5, -s, 0, 1, 0, core.u0, core.v1)]; m.tri(q[0], q[1], q[2]); m.tri(q[0], q[2], q[3]); }
    for (let w = 0; w < whorls; w++) {
      const f = w / (whorls - 1), y = lerp(ced ? 1.8 : 2.4, H - 1.0, f), len = (R * Math.pow(1 - f, 0.75) * (0.72 + 0.28 * Math.min(1, f * 6)) + 0.5) * r.r(0.88, 1.1), droop = lerp(ced ? 0.7 : 0.5, -0.12, f) + r.r(-0.08, 0.08), a0 = r() * 6.283;
      for (let k = 0; k < per; k++) {
        const a = a0 + k / per * 6.283 + r.r(-0.25, 0.25), L = len * r.r(0.82, 1.1), wd = L * (ced ? 0.52 : 0.46), ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(droop), sd = Math.sin(droop), tw = r.r(-0.3, 0.3);
        // base at the trunk, tip out and down; the card's width axis is horizontal with a little twist
        const tx = ca * cd * L, ty = -sd * L, tz = sa * cd * L, wx = -sa * wd, wz = ca * wd, wy = tw * wd;
        const sh0 = lerp(0.62, 0.9, f), sh1 = lerp(0.95, 1.12, f), n = [ca * 0.45, 0.85, sa * 0.45];
        m.col(255 * sh0, 255 * sh0, 255 * sh0); const v0 = m.v(-wx, y - wy, -wz, n[0], n[1], n[2], uv.u0, uv.v0), v1 = m.v(wx, y + wy, wz, n[0], n[1], n[2], uv.u0, uv.v1);
        m.col(255 * sh1, 255 * sh1, 255 * sh1); const v2 = m.v(tx + wx, y + ty + wy, tz + wz, n[0], n[1], n[2], uv.u1, uv.v1), v3 = m.v(tx - wx, y + ty - wy, tz - wz, n[0], n[1], n[2], uv.u1, uv.v0);
        m.tri(v0, v1, v2); m.tri(v0, v2, v3);
      }
    }
    return m.geometry();
  }
  if (kind === 'reeds') { const uv = cutUV(CUT.reeds); m.col(255, 255, 255).lay(0); for (let i = 0; i < 5; i++) { const a = i / 5 * 3.14159 + r.r(-0.2, 0.2), c = Math.cos(a) * 0.9, s = Math.sin(a) * 0.9, ox = r.r(-0.5, 0.5), oz = r.r(-0.5, 0.5), v = [m.v(ox - c, 0, oz - s, 0, 1, 0, uv.u0, uv.v0), m.v(ox + c, 0, oz + s, 0, 1, 0, uv.u1, uv.v0), m.v(ox + c, 1.7, oz + s, 0, 1, 0, uv.u1, uv.v1), m.v(ox - c, 1.7, oz - s, 0, 1, 0, uv.u0, uv.v1)]; m.tri(v[0], v[1], v[2]); m.tri(v[0], v[2], v[3]); } return m.geometry(); }
  if (kind === 'bush') {
    const tint = [225, 235, 215];
    for (let i = 0; i < 12; i++) { const a = r() * 6.283, rad = r.r(0, 0.55), y = r.r(0.35, 0.95); card(Math.cos(a) * rad, y, Math.sin(a) * rad, r.r(1.0, 1.4), 0, 0.2, 0, lerp(0.7, 1, y), cutUV(CUT.bush), tint); }
    return m.geometry();
  }
  // broadleaf: trunk, a few rising limbs, crown of leaf cards on an ellipsoid shell plus fill
  const tall = kind === 'alder' || kind === 'birch', th = tall ? r.r(3.2, 4.2) : r.r(2.2, 3.0), crownY = th + (tall ? 3.2 : 2.6), cr = tall ? [2.3, 3.4] : kind === 'oak' ? [3.9, 2.9] : [3.2, 3.0];
  m.col(kind === 'birch' ? 255 : 215, kind === 'birch' ? 255 : 205, kind === 'birch' ? 255 : 195).lay(0);
  const lean = [r.r(-0.25, 0.25), r.r(-0.25, 0.25)]; limb(0, 0, 0, lean[0], th, lean[1], tall ? 0.17 : 0.24, tall ? 0.12 : 0.17, 7);
  const nl = r.i(3, 5);
  for (let i = 0; i < nl; i++) { const a = i / nl * 6.283 + r.r(-0.4, 0.4), rr = cr[0] * r.r(0.45, 0.7), y1 = crownY + r.r(-0.6, 0.8); limb(lean[0], th - 0.1, lean[1], lean[0] + Math.cos(a) * rr, y1, lean[1] + Math.sin(a) * rr, 0.11, 0.035, 5); }
  limb(lean[0], th - 0.1, lean[1], lean[0] * 1.5, crownY + cr[1] * 0.5, lean[1] * 1.5, 0.13, 0.03, 5);
  const tint = kind === 'maple' ? [235, 240, 220] : kind === 'oak' ? [225, 235, 205] : kind === 'birch' ? [240, 248, 200] : [215, 230, 215], n = tall ? 62 : 82;
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * 6.283, shell = i < n * 0.62 ? r.r(0.74, 1.0) : r.r(0.2, 0.7), sq = Math.sqrt(1 - u * u);
    const x = Math.cos(a) * sq * cr[0] * shell, y = u * cr[1] * shell, z = Math.sin(a) * sq * cr[0] * shell;
    if (y < -cr[1] * 0.72) continue;
    const shade = lerp(0.52, 1.0, Math.min(1, (y / cr[1] + 1) * 0.5 * 0.55 + shell * shell * 0.5)) * r.r(0.9, 1.06);
    card(lean[0] + x, crownY + y, lean[1] + z, r.r(1.6, 2.35) * (tall ? 0.9 : 1), lean[0], crownY - 0.6, lean[1], shade, leafUV, tint);
  }
  return m.geometry();
}

export function buildTrees(T, M, group) {
  const KINDS = ['maple', 'oak', 'alder', 'birch', 'fir', 'cedar', 'pine', 'bush', 'reeds'], REG = 640, geos = {}, buckets = new Map();
  KINDS.forEach((k, i) => { geos[k] = [treeGeometry(k, 100 + i * 7)]; });
  const r = makeRng(T.seed * 3 + 11);
  for (const t of T.trees) {
    const kind = KINDS.includes(t.kind) ? t.kind : 'maple', v = 0, key = kind + v + '|' + Math.floor(t.x / REG) + '|' + Math.floor(t.z / REG);
    let b = buckets.get(key); if (!b) buckets.set(key, b = { kind, v, list: [] }); b.list.push(t);
    if (kind !== 'bush' && kind !== 'reeds' && !t.noCollide) T.colliders.add(t.x, t.z, 0.28 * t.s, 0.28 * t.s, 0, 6, 'tree');
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  let count = 0, tris = 0;
  for (const b of buckets.values()) {
    const g = geos[b.kind][b.v], im = new THREE.InstancedMesh(g, M.cut, b.list.length); im.name = 'trees-' + b.kind;
    b.list.forEach((t, i) => {
      const s = t.s * r.r(0.9, 1.1); q.setFromAxisAngle(up, r() * 6.283); pos.set(t.x, t.y ?? KERB, t.z); sc.set(s * r.r(0.92, 1.08), s * r.r(0.9, 1.12), s * r.r(0.92, 1.08));
      mtx.compose(pos, q, sc); im.setMatrixAt(i, mtx);
      const conifer = b.kind === 'fir' || b.kind === 'cedar' || b.kind === 'pine'; col.setRGB(r.r(0.78, 1.0) * (conifer ? 0.9 : 1), r.r(0.86, 1.0), r.r(0.7, 0.95) * (conifer ? 0.95 : 1)); im.setColorAt(i, col);
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.computeBoundingBox(); im.matrixAutoUpdate = false; group.add(im);
    count += b.list.length; tris += g.index.count / 3 * b.list.length;
  }
  T.treeStats = { count, tris, meshes: buckets.size };
  return tris;
}

// ---------------------------------------------------------------- night layer

export function buildNightFx(T, M, group) {
  const lamps = T.lampInfo;
  // 1. baked lamp light map (1.25 m per pixel) sampled by every town surface shader
  const res = 1.25, minX = BOUNDS.minX - 160, minZ = BOUNDS.minZ - 160, w = BOUNDS.maxX - BOUNDS.minX + 320, h = BOUNDS.maxZ - BOUNDS.minZ + 320;
  const cv = makeCanvas(Math.round(w / res), Math.round(h / res)), g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'lighter';
  const blob = (x, z, rad, c, a) => { const px = (x - minX) / res, pz = (z - minZ) / res, pr = rad / res, gr = g.createRadialGradient(px, pz, 0, px, pz, pr), s = k => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a * k})`; gr.addColorStop(0, s(1)); gr.addColorStop(0.25, s(0.72)); gr.addColorStop(0.55, s(0.3)); gr.addColorStop(1, s(0)); g.fillStyle = gr; g.fillRect(px - pr, pz - pr, pr * 2, pr * 2); };
  for (const l of lamps) blob(l.x, l.z, l.r, l.col, 0.62 * l.k);
  for (const s of T.glows || []) blob(s.x, s.z, s.r, s.col, s.a);
  M.setLampMap(cv, minX, minZ, w, h);

  // 2. halos and wet-road streaks: one instanced quad each
  const all = lamps.map(l => ({ ...l, size: 1.7 * l.k })).concat((T.glows || []).filter(s => s.halo).map(s => ({ x: s.x, y: s.y, z: s.z, col: s.col, size: s.halo, k: s.a })));
  const n = all.length, ip = new Float32Array(n * 4), ic = new Float32Array(n * 3);
  all.forEach((l, i) => { ip.set([l.x, l.y, l.z, l.size], i * 4); ic.set(l.col, i * 3); });
  const mk = (vs, fs, order) => {
    const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 4)); geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(ic, 3)); geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({ uniforms: { uNight: U.uNight, uWet: U.uWet, uTex: { value: glowTexture() }, uFog: { value: 0.001 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.onBeforeRender = (rr, sc) => { mat.uniforms.uFog.value = sc.fog ? sc.fog.density : 0; }; group.add(mesh); return mesh;
  };
  const FS = 'uniform sampler2D uTex; varying vec2 vUv; varying vec4 vC; void main(){ float a=texture2D(uTex,vUv).a; gl_FragColor=vec4(vC.rgb*a*a*vC.a,1.0); }';
  T.halos = mk(`attribute vec4 iPos; attribute vec3 iCol; uniform float uNight,uWet,uFog; varying vec2 vUv; varying vec4 vC;
    void main(){ vUv=position.xy*0.5+0.5; vec4 mv=viewMatrix*vec4(iPos.xyz,1.0); float d=length(mv.xyz); float fogK=clamp(uFog*260.0,0.0,2.5);
      float sz=iPos.w*(1.0+fogK*0.7+uWet*0.25)*(1.0+d*0.006); mv.xyz+=normalize(-mv.xyz)*0.5; mv.xy+=position.xy*sz;
      float fade=exp(-uFog*uFog*d*d*0.55); vC=vec4(iCol,(1.5+fogK*0.6)*fade*smoothstep(0.1,0.5,uNight)*smoothstep(0.6,3.0,d)); gl_Position=projectionMatrix*mv; }`, FS, 20);
  T.streaks = mk(`attribute vec4 iPos; attribute vec3 iCol; uniform float uNight,uWet,uFog; varying vec2 vUv; varying vec4 vC;
    void main(){ vUv=position.xy*0.5+0.5; vec2 toC=cameraPosition.xz-iPos.xz; float dist=max(length(toC),0.5); vec2 dir=toC/dist; float hc=max(cameraPosition.y,0.5);
      float t=iPos.y/(iPos.y+hc); vec2 c=iPos.xz+toC*t; float len=clamp(dist*0.16,1.2,18.0), wid=0.35+dist*0.007;
      vec2 p=c+dir*position.y*len+vec2(-dir.y,dir.x)*position.x*wid; vec4 mv=viewMatrix*vec4(p.x,0.035,p.y,1.0); float d=length(mv.xyz);
      vC=vec4(iCol,0.2*uWet*smoothstep(0.1,0.5,uNight)*exp(-uFog*uFog*d*d)*smoothstep(4.0,14.0,dist)*(1.0-smoothstep(120.0,240.0,dist))); gl_Position=projectionMatrix*mv; }`,
    'uniform sampler2D uTex; varying vec2 vUv; varying vec4 vC; void main(){ float a=texture2D(uTex,vec2(vUv.x,0.5)).a; a=a*a*smoothstep(0.0,0.3,vUv.y)*(1.0-smoothstep(0.55,1.0,vUv.y)); gl_FragColor=vec4(vC.rgb*a*vC.a,1.0); }', 19);
  T.streaks.material.polygonOffset = true; T.streaks.material.polygonOffsetFactor = -4; T.streaks.material.polygonOffsetUnits = -8;

  // 3. live signal lamps: instanced discs whose colour follows the uSig state array
  const S = T.sigLamps, ns = S.length, sp = new Float32Array(ns * 4), si = new Float32Array(ns * 3);
  S.forEach((l, i) => { sp.set([l.x, l.y, l.z, l.h], i * 4); si.set([l.idx, l.kind, l.r], i * 3); });
  const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(sp, 4)); geo.setAttribute('iSig', new THREE.InstancedBufferAttribute(si, 3)); geo.instanceCount = ns;
  const nSig = Math.max(2, T.sigIndex.size * 2), state = new Float32Array(nSig);
  const smat = new THREE.ShaderMaterial({
    uniforms: { uNight: U.uNight, uSig: { value: state }, uFog: { value: 0.001 }, uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 iPos; attribute vec3 iSig; uniform float uSig[${nSig}]; uniform float uNight,uFog,uTime; varying vec2 vP; varying vec4 vC; varying float vCore;
      void main(){ float st=uSig[int(iSig.x+0.5)], kind=iSig.y; float on=0.0; vec3 c=vec3(0.0);
        if(kind<2.5){ on=abs(st-kind)<0.5?1.0:0.0; c=kind<0.5?vec3(0.1,1.0,0.55):kind<1.5?vec3(1.0,0.62,0.05):vec3(1.0,0.07,0.04); }
        else { on=1.0; c=st<0.5?vec3(0.9,0.95,1.0):vec3(1.0,0.35,0.05); if(st>0.5&&st<1.5) on=step(0.5,fract(uTime*1.3)); }
        float glow=1.6+uNight*2.6+clamp(uFog*200.0,0.0,2.0); vec2 q=position.xy*iSig.z*glow; vCore=1.0/glow; vP=position.xy;
        vec3 wp=iPos.xyz+vec3(cos(iPos.w)*q.x,q.y,-sin(iPos.w)*q.x)+vec3(sin(iPos.w),0.0,cos(iPos.w))*0.02;
        vec4 mv=viewMatrix*vec4(wp,1.0); float d=length(mv.xyz); vec3 fwd=vec3(sin(iPos.w),0.0,cos(iPos.w)); float facing=dot(normalize(cameraPosition-iPos.xyz),fwd);
        vC=vec4(c,on*smoothstep(-0.05,0.3,facing)*exp(-uFog*uFog*d*d*0.5)); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: 'varying vec2 vP; varying vec4 vC; varying float vCore; void main(){ float r=length(vP); float core=1.0-smoothstep(vCore*0.85,vCore*1.05,r); float halo=pow(max(1.0-r,0.0),2.6)*0.5; gl_FragColor=vec4(vC.rgb*(core*3.2+halo*1.1)*vC.a,1.0); }',
  });
  const sm = new THREE.Mesh(geo, smat); sm.frustumCulled = false; sm.renderOrder = 21; sm.onBeforeRender = (rr, sc) => { smat.uniforms.uFog.value = sc.fog ? sc.fog.density : 0; }; group.add(sm);
  const L = T.L, CODE = { g: 0, y: 1, r: 2 }, sigNodes = [...T.sigIndex.entries()].map(([id, i]) => { const n = L.nodes[id], e0 = n.edges.find(e => n.sig.g[e] === 0), e1 = n.edges.find(e => n.sig.g[e] === 1); return { n, i, e0, e1 }; });
  T.updateSignals = t => { for (const s of sigNodes) { state[s.i * 2] = CODE[signalState(s.n, s.e0, t)]; state[s.i * 2 + 1] = s.e1 === undefined ? 2 : CODE[signalState(s.n, s.e1, t)]; } };
  T.updateSignals(0);
}
