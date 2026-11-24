// The named places the story uses: Station 4, the two hospitals, schools, the diner, the trailer court and so on.
// Each one claims a rectangle on a specific block frontage (so the generic lot filler builds round it), builds its
// campus from the pieces in town-buildings.js plus a few signature shapes, and registers a Town.places entry with a
// pull-up point (`stop`, in the kerb lane or on an apron) and a patient `spot`.
// Tuning: the PLACES list at the bottom (which block, which street, how big).

import { makeRng, lerp } from './util.js';
import { obb, pointInPoly, polyBounds } from './town-geo.js';
import { WL, GL, METAL } from './town-mat.js';
import { KERB, riverX, riverHW } from './town-layout.js';
import { SIGN, CUT, cutUV } from './town-atlas.js';
import { ctx, tower, parkade, warehouse, shopBox, storefront, trailer, wallCells, wallGrid, flatRoof, gableRoof, hipRoof, SIDES, signQuad, boxSign, cutRun, woodFence, chainFence, hedge, carPark, kerbRamp } from './town-buildings.js';
import { rayDepth, sideFrame, kerbStop, addAddress, buildLot, yardStuff } from './town-lots.js';

const RED = [1.0, 0.16, 0.1], WHITE = [1.0, 0.95, 0.85], COOL = [0.8, 0.9, 1.0];

function claim(T, pt, street, w, d, near = null) {
  const b = T.L.blocks.find(q => !q.river && pointInPoly(pt[0], pt[1], q.inner)); if (!b) { console.warn('[town] no block at', pt); return null; }
  const all = b.sides.filter(s => s.e.name === street && s.ilen > 2); if (!all.length) { console.warn('[town] no side', street, 'on block at', pt); return null; }
  // a frontage can run across several collinear sides (T-junctions on the far kerb split the edge, not the block face)
  const ref = all.reduce((a, c) => c.ilen > a.ilen ? c : a), parts = all.filter(s => s.dx * ref.dx + s.dz * ref.dz > 0.995 && Math.abs((s.i0[0] - ref.i0[0]) * ref.nx + (s.i0[1] - ref.i0[1]) * ref.nz) < 1).sort((p, q) => (p.i0[0] - q.i0[0]) * ref.dx + (p.i0[1] - q.i0[1]) * ref.dz);
  const first = parts[0], last = parts[parts.length - 1], ilen = (last.i1[0] - first.i0[0]) * ref.dx + (last.i1[1] - first.i0[1]) * ref.dz;
  const run = { i0: first.i0, i1: last.i1, ilen, dx: ref.dx, dz: ref.dz, nx: ref.nx, nz: ref.nz };
  const partAt = (wx, wz) => parts.reduce((a, c) => { const m = q => { const s = (wx - q.i0[0]) * q.dx + (wz - q.i0[1]) * q.dz; return s < 0 ? -s : s > q.ilen ? s - q.ilen : 0; }; return m(c) < m(a) ? c : a; });
  w = Math.min(w, ilen - 2);
  let s = near ? (near[0] - run.i0[0]) * run.dx + (near[1] - run.i0[1]) * run.dz : 0.5 * ilen; s = Math.max(w / 2 + 1, Math.min(ilen - w / 2 - 1, s));
  const fr = sideFrame(run, s); d = Math.min(d, rayDepth(b.inner, fr.x + run.nx * 0.2, fr.z + run.nz * 0.2, run.nx, run.nz) - 1.2);
  b.used = b.used || []; b.used.push(obb(fr.x + run.nx * d / 2, fr.z + run.nz * d / 2, w / 2, d / 2, fr.h));
  const side = partAt(fr.x, fr.z);
  return { B: ctx(T, fr.x, fr.z, fr.h), T, w, d, side, partAt, block: b, fr, s, sw: side.he.sw, sub: (lx, lz, rot = 0) => { const c = Math.cos(fr.h), sn = Math.sin(fr.h); return ctx(T, fr.x + lx * c + lz * sn, fr.z - lx * sn + lz * c, fr.h + rot); } };
}
function place(C, id, name, kind, cl, o = {}) {
  const { T, B } = C, c = B.w(cl[0], cl[1]), f = B.w(o.fx ?? cl[0], 0), side = C.partAt ? C.partAt(f[0], f[1]) : C.side, ks = kerbStop(T, side.he, f[0], f[1]);
  const st = o.stop ? (() => { const w = B.w(o.stop[0], o.stop[1]); return { x: w[0], z: w[1], heading: B.h + (o.stop[2] || 0) }; })() : ks.stop;
  const sp = o.spot ? (() => { const w = B.w(o.spot[0], o.spot[1]); return { x: w[0], z: w[1] }; })() : ks.spot;
  T.places[id] = { id, name, kind, x: c[0], z: c[1], heading: B.h, stop: st, spot: sp, mapLabel: o.label ?? name, kerb: ks.stop }; return T.places[id];
}
const glow = (B, lx, y, lz, r, col, a, halo = 0) => { const w = B.w(lx, lz); (B.T.glows = B.T.glows || []).push({ x: w[0], y: KERB + y, z: w[1], r, col, a, halo }); };
const lot = (B, x0, z0, x1, z1, lay = GL.asphalt, col = [235, 232, 226], y = 0.018) => { B.d.lay(lay).col(col[0], col[1], col[2]); B.d.gquad(x0, z0, x1, z0, x1, z1, x0, z1, y, x0, z0, x1, z0, x1, z1, x0, z1); const q = [B.w(x0, z0), B.w(x1, z0), B.w(x1, z1), B.w(x0, z1)]; if (lay !== GL.grass) B.T.surf.fill(q, 4, 1); if (lay === GL.asphalt) B.T.lots.push(q); else if (lay === GL.grass) B.T.greens.push([B.w(x0, z0), B.w(x1, z0), B.w(x1, z1), B.w(x0, z1)]); };
const ramp = (B, x0, x1, sw) => kerbRamp(B, x0, x1, sw);
function flagpole(B, x, z, h = 9) { const p = B.p; p.lay(WL.plain + METAL).col(200, 202, 204); p.cyl(x, z, 0, h, 0.06, 0.035, 6); p.cyl(x, z, h, h + 0.1, 0.07, 0.07, 6); p.lay(WL.plain).col(150, 36, 40); p.quad(x + 0.05, h - 1.3, z, x + 1.75, h - 1.35, z + 0.15, x + 1.75, h - 0.35, z + 0.15, x + 0.05, h - 0.3, z, 0, 0); p.col(40, 50, 100).quad(x + 1.75, h - 1.35, z + 0.15, x + 0.05, h - 1.3, z, x + 0.05, h - 0.3, z, x + 1.75, h - 0.35, z + 0.15, 0, 0); const w = B.w(x, z); B.T.colliders.add(w[0], w[1], 0.08, 0.08, 0, h, 'pole'); }
function canopy(B, x0, z0, x1, z1, h, col = [228, 226, 220], cols = true, light = WHITE) {
  const p = B.p; p.lay(WL.plain); p.col(col[0], col[1], col[2]); p.box(x0, h, z0, x1, h + 0.55, z1, 63);
  if (cols) { p.lay(WL.panel).col(190, 188, 182); for (const [x, z] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]]) { p.box(x - 0.22, 0, z - 0.22, x + 0.22, h, z + 0.22, 15); B.collide(x - 0.22, z - 0.22, x + 0.22, z + 0.22, h, 'pole'); } }
  if (light) { const w = SIGN.text(B.T.atlas, 'white', '', { w: 16, h: 16, bg: '#ffffff' }), nx = Math.max(1, Math.round((x1 - x0) / 4.5)), nz = Math.max(1, Math.round((z1 - z0) / 4.5)); B.s.col(215, 0, 0).lay(0);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const cx = lerp(x0, x1, (i + 0.5) / nx), cz = lerp(z0, z1, (j + 0.5) / nz); B.s.quad(cx - 0.6, h - 0.01, cz - 0.2, cx + 0.6, h - 0.01, cz - 0.2, cx + 0.6, h - 0.01, cz + 0.2, cx - 0.6, h - 0.01, cz + 0.2, w.u0, w.v0, w.u1, w.v1); glow(B, cx, h - 0.3, cz, h * 2.2, light, 0.55, 0); } }
}
function poleSign(B, rect, x, z, h, w, hh, glowK = 2.6, rot = 0) { const p = B.p; p.lay(WL.plain + METAL).col(96, 100, 104); p.cyl(x, z, 0, h - hh / 2, 0.16, 0.13, 8); boxSign(B, rect, x + Math.sin(rot) * 0.13, h, z + Math.cos(rot) * 0.13, w, hh, rot, glowK, 0.26); signQuad(B, rect, x - Math.sin(rot) * 0.14, h, z - Math.cos(rot) * 0.14, w, hh, rot + Math.PI, glowK); const c = B.w(x, z); B.T.colliders.add(c[0], c[1], 0.18, 0.18, 0, h, 'pole'); }
function monument(B, rect, x, z, w, hh, rot = 0, glowK = 1.4) { const p = B.p; p.lay(WL.brick).col(240, 236, 232); p.push(x, 0, z, rot); p.box(-w / 2 - 0.3, 0, -0.3, w / 2 + 0.3, hh + 0.5, 0.3, 31); p.lay(WL.panel).col(210, 206, 198).box(-w / 2 - 0.36, hh + 0.5, -0.36, w / 2 + 0.36, hh + 0.62, 0.36, 31); p.pop(); signQuad(B, rect, x + Math.sin(rot) * 0.31, hh / 2 + 0.3, z + Math.cos(rot) * 0.31, w, hh, rot, glowK); signQuad(B, rect, x - Math.sin(rot) * 0.31, hh / 2 + 0.3, z - Math.cos(rot) * 0.31, w, hh, rot + Math.PI, glowK); B.collide(x - w / 2, z - 0.3, x + w / 2, z + 0.3, hh + 0.6, 'prop'); }
// Brick or panel box with a custom front; other walls take a grid. Flat roof.
function shell(B, x0, z0, x1, z1, h, lay, col, front, o = {}) {
  const f = B.f, S = SIDES(x0, z0, x1, z1), par = o.par ?? 0.8, r = o.rng; f.lay(lay).col(col[0], col[1], col[2]);
  const fh = o.frontH || h - par; wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, fh, front, o.seed || 3); f.wn(0); f.wall(S[0][0], S[0][1], S[0][2], S[0][3], fh, h, 0, fh);
  for (const k of [1, 2, 3]) { const s = S[k]; if (o.grid) { wallGrid(B, s[0], s[1], s[2], s[3], 0, h - par, { ...o.grid, seed: (o.seed || 3) + k }); f.wn(0); f.wall(s[0], s[1], s[2], s[3], h - par, h, 0, h - par); } else { f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, h); } }
  flatRoof(B, x0, z0, x1, z1, h, par, lay, col, r, o.plant ?? 0.6); B.collide(x0, z0, x1, z1, h); B.foot(x0, z0, x1, z1, true);
}
const txt = (T, key, s, o) => SIGN.text(T.atlas, key, s, o);

// ---------------------------------------------------------------- the places

function station4(T) {
  const C = claim(T, [-330, -30], 'Kessler St', 40, 32, [-342, -70]); if (!C) return; const { B } = C, r = makeRng(4), bay = { st: 7, ww: 4.3, wh: 4.5, lit: 5, rec: 0.18 };
  shell(B, -15, -28, -2.6, -13, 6.6, WL.brick, [248, 240, 236], [{ w: 0.75 }, { w: 4.9, ...bay }, { w: 1.1 }, { w: 4.9, ...bay }, { w: 0.75 }], { rng: r, frontH: 5.2, grid: { cw: 4.4, fh: 5.8, ww: 1.4, wh: 1.5, st: 0, lit: 5, margin: 1 } });
  shell(B, -2.6, -26, 10, -13, 4.4, WL.brick, [248, 240, 236], [{ w: 0.9 }, { w: 1.7, st: 4, ww: 1.1, wh: 2.3, lit: 5, rec: 0.2 }, { w: 0.7 }, { w: 4.2, st: 0, ww: 3.0, wh: 1.6, lit: 5 }, { w: 4.2, st: 0, ww: 3.0, wh: 1.6, lit: 5 }, { w: 0.9 }], { rng: r, frontH: 3.6, grid: { cw: 4, fh: 3.6, ww: 1.4, wh: 1.4, st: 0, lit: 5, margin: 1 } });
  const p = B.p; p.lay(WL.panel).col(214, 210, 200); p.box(-15.05, 5.2, -13, -2.55, 5.5, -12.8, 1 + 4 + 8 + 16 + 32);
  boxSign(B, txt(T, 'st4', 'KETTER COUNTY EMS', { w: 1024, h: 150, bg: '#1b2a44', fg: '#f4f1e6', font: 0, sub: 'STATION 4   ·   MEDIC 14', subFg: '#f2b53a' }), -8.8, 5.92, -12.86, 8.2, 1.0, 0, 1.8);
  for (const bx of [-11.8, -5.8]) { signQuad(B, txt(T, 'bayn' + bx, bx < -8 ? '1' : '2', { w: 64, h: 64, bg: '#b3161a', fg: '#fff', font: 6 }), bx, 4.95, -12.97, 0.4, 0.4, 0, 0.6); glow(B, bx, 4.2, -11, 11, WHITE, 0.6, 0.9); }
  lot(B, -15.5, -13, -2, C.sw, GL.concrete, [222, 220, 214]); ramp(B, -15.5, -2, C.sw);
  carPark(B, 1, -12, 12, -1.2, { rng: r, occ: 0.6 }); flagpole(B, 12.5, -3.5);
  p.lay(WL.plain).col(200, 170, 40); for (const x of [-15.3, -9.2, -8.4, -2.4]) { p.cyl(x, -12.6, 0, 1.0, 0.09, 0.09, 7); }
  const pl = place(C, 'station4', 'Ketter County EMS Station 4', 'station', [-8.8, -20], { stop: [-11.8, -6.2, 0], spot: [-5.5, -9.5], label: 'Station 4' });
  T.spawn = { ...pl.stop };
}

function hospital(T, id, o) {
  const C = claim(T, o.pt, o.street, o.w, o.d, o.near); if (!C) return; const { B } = C, r = makeRng(o.seed), ex = o.edX, big = o.big;
  // main block (and tower) behind, emergency department forward on one side
  const mainZ = big ? -72 : -52, mainX = o.mainX;
  if (big) { tower(C.sub(mainX, mainZ - 2), { w: 64, d: 30, floors: 9, kind: 'precast', rng: r, exposeL: true, exposeR: true, lit: 5 }); tower(C.sub(mainX, mainZ + 38), { w: 104, d: 40, floors: 2, kind: 'precast', rng: r, exposeL: true, exposeR: true, lit: 5, name: 'Main Entrance' }); }
  else tower(C.sub(mainX, mainZ + 24), { w: 58, d: 28, floors: 4, kind: 'precast', rng: r, exposeL: true, exposeR: true, lit: 5, name: 'Main Entrance' });
  const edW = big ? 38 : 26, edD = big ? 24 : 18, edZ = big ? -30 : -24;
  const E = C.sub(ex, edZ);
  shopBox(E, { w: edW, d: edD, h: 8.2, gst: 1, lit: 5, signY: 6.85, rng: r, name: 'EMERGENCY', rect: txt(T, 'emerg', 'EMERGENCY', { w: 1024, h: 176, bg: '#b3121a', fg: '#ffffff', font: 6 }), signW: big ? 13 : 10, lay: WL.panel, col: [236, 232, 222], glass: 0.6, canopy: 0.3, hl: true });
  glow(E, 0, 6.8, 1.5, 18, RED, 0.5, 2.6);
  if (big) boxSign(E, txt(T, 'trauma', 'TRAUMA CENTER', { w: 768, h: 96, bg: '#f4f1ea', fg: '#17479e', font: 0 }), -edW / 2 + 6, 3.2, 0.3, 7, 0.85, 0, 1.6);
  // ambulance bay canopy over the drive
  const cz0 = edZ + 0.4, cz1 = edZ + (big ? 11 : 9), cx0 = ex - (big ? 17 : 9), cx1 = ex + (big ? 17 : 9);
  canopy(B, cx0, cz0, cx1, cz1, 4.7, [236, 234, 228]);
  const amb = txt(T, 'ambonly', 'AMBULANCE ENTRANCE', { w: 1024, h: 110, bg: '#b3121a', fg: '#ffffff', font: 0 }); boxSign(B, amb, ex, 4.98, cz1 + 0.02, big ? 12 : 9, 0.5, 0, 3.0, 0.04);
  lot(B, cx0 - 8, cz0 - 0.2, cx1 + 8, C.sw, GL.asphalt, [236, 234, 228]); ramp(B, cx0 - 8, cx1 + 8, C.sw);
  B.d.lay(GL.concrete).col(238, 60, 50); for (const lx of [cx0 + 0.3, cx1 - 0.3]) B.d.gquad(lx - 0.07, cz0 + 0.5, lx + 0.07, cz0 + 0.5, lx + 0.07, cz1, lx - 0.07, cz1, 0.03, 0, 0, 0.14, 0, 0.14, 8, 0, 8);
  // signs: monument on the street, H on the roofline
  const mon = txt(T, id + 'mon', o.signName, { w: 1024, h: 256, bg: '#f4f1ea', fg: '#17479e', font: 1, sub: 'EMERGENCY  ➜', subFg: '#b3121a' });
  monument(B, mon, big ? ex - 34 : ex + 22, -2.6, 6.4, 1.6, 0, 1.6);
  const Hs = txt(T, 'Hbig', 'H', { w: 128, h: 128, bg: '#17479e', fg: '#ffffff', font: 6 });
  const top = big ? 5.3 + 8 * 3.6 + 1.1 : 5.3 + 3 * 3.6 + 1.1;
  boxSign(C.sub(mainX, big ? mainZ - 2 : mainZ + 24), big ? txt(T, id + 'top', o.short, { w: 1024, h: 128, bg: '#f4f1ea', fg: '#17479e', font: 0 }) : Hs, big ? 0 : -22, top - 2.2, 0.35, big ? 26 : 3, big ? 3.2 : 3, 0, 2.4);
  // parking
  if (big) { carPark(B, mainX - 50, -24, Math.min(mainX + 44, cx0 - 12), -3, { rng: r, occ: 0.5 }); ramp(B, mainX - 8, mainX, C.sw); parkade(C.sub(o.parkX, -108), { w: 46, d: 34, floors: 5, rng: r, sign: true }); }
  else { carPark(B, cx1 + 12, -22, Math.min(C.w / 2 - 2, cx1 + 66), -3, { rng: r, occ: 0.5 }); ramp(B, cx1 + 14, cx1 + 21, C.sw); }
  if (big) { // ground helipad with perimeter lights and a windsock
    const hx = o.heliX, hz = -112; lot(B, hx - 15, hz - 15, hx + 15, hz + 15, GL.concrete, [220, 218, 212]); const hr = SIGN.helipad(T.atlas); B.s.col(40, 0, 0).lay(0); B.s.quad(hx - 12, 0.14, hz + 12, hx + 12, 0.14, hz + 12, hx + 12, 0.14, hz - 12, hx - 12, 0.14, hz - 12, hr.u0, hr.v0, hr.u1, hr.v1);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; glow(B, hx + Math.cos(a) * 13.5, 0.3, hz + Math.sin(a) * 13.5, 3.5, [0.2, 1.0, 0.4], 0.5, 0.35); }
    B.p.lay(WL.plain + METAL).col(200, 200, 200); B.p.cyl(hx + 17, hz - 14, 0, 6, 0.07, 0.05, 6); B.p.lay(WL.plain).col(230, 110, 30); B.p.tube(hx + 17, 5.8, hz - 14, hx + 18.6, 5.5, hz - 13.4, 0.22, 0.1, 6);
    place({ ...C }, 'helipad', 'St. Brigid Helipad', 'helipad', [hx, hz], { label: '' });
  }
  for (let i = 0; i < 6; i++) B.tree(lerp(-C.w / 2 + 4, C.w / 2 - 4, (i + 0.5) / 6) + r.r(-3, 3), -1.6, r.pick(['maple', 'alder', 'birch']), r.r(0.7, 1.0));
  place(C, id, o.name, 'hospital', [ex, edZ - edD / 2], { stop: [ex, (cz0 + cz1) / 2 + 0.4, Math.PI / 2], spot: [ex + 2, cz0 + 1.6], label: o.short, fx: ex });
}

function ironworks(T) {
  const C = claim(T, [350, -175], 'Foundry St', 46, 42, [440, -190]); if (!C) return; const r = makeRng(31);
  warehouse(C.B, { w: 34, d: 24, h: 9.5, rng: r, name: 'IRONWORKS GYM', setback: 15, docks: 1, lay: WL.brick, col: [246, 238, 234], signBg: '#141414', signFg: '#e9b33a', font: 2, hl: true });
  carPark(C.B, -21, -13.5, 21, -1.4, { rng: r, occ: 0.55 }); ramp(C.B, -3.5, 3.5, C.sw); glow(C.B, 0, 6, -13, 14, [1, 0.8, 0.4], 0.4, 1.5);
  place(C, 'ironworks', 'Ironworks Gym', 'gym', [0, -27], { spot: [-13, -13.8] }); addAddress(T, C.side, C.B, [-13, -14.2], 'gym', 'industrial', null, { name: 'Ironworks Gym' });
}

function harbor(T) {
  const C = claim(T, [60, 110], 'Riverside Dr', 40, 30); if (!C) return; const { B } = C, r = makeRng(77);
  const rect = txt(T, 'harbor', 'Harbor Lights', { w: 1024, h: 256, bg: '#10203a', fg: '#ffd27a', font: 4, sub: 'D  I  N  E  R      OPEN 24 HOURS', subFg: '#ff5a4a' });
  const sb = shopBox(B, { w: 22, d: 10.5, h: 4.6, rng: r, name: 'Harbor Lights', rect, signW: 7.5, lay: WL.plain + METAL, col: [206, 210, 214], glass: 0.86, setback: 13, band: [168, 28, 32], canopy: 0.9, hl: true });
  boxSign(B, rect, 0, sb.h + 1.5, -13 - 4, 9, 2.25, 0, 3.4, 0.3); signQuad(B, rect, 0, sb.h + 1.5, -17.31, 9, 2.25, Math.PI, 3.4);
  B.p.lay(WL.plain + METAL).col(90, 94, 98); for (const x of [-3.5, 3.5]) B.p.box(x - 0.06, sb.h, -17.2, x + 0.06, sb.h + 0.5, -17.06, 15);
  glow(B, 0, 5.5, -15, 16, [1.0, 0.75, 0.4], 0.5, 2.6); glow(B, 0, 2.5, -11, 14, WARMW, 0.55, 0);
  carPark(B, -19, -11.6, 19, -1.4, { rng: r, occ: 0.5 }); ramp(B, -3.5, 3.5, C.sw);
  poleSign(B, txt(T, 'harborp', 'DINER', { w: 512, h: 200, bg: '#b3161a', fg: '#fff3d0', font: 6, sub: 'Harbor Lights', subFg: '#ffd27a' }), 17.5, -0.9, 7.2, 3.2, 1.25, 3.0, Math.PI / 2);
  place(C, 'harbor', 'Harbor Lights Diner', 'restaurant', [0, -18], { spot: [3, -12.2] }); addAddress(T, C.side, B, [0, -12.6], 'restaurant', 'downtown', null, { name: 'Harbor Lights Diner' });
}
const WARMW = [1.0, 0.82, 0.6];

function anchor(T) {
  const C = claim(T, [-90, -420], 'Main St', 9.4, 20, [-120, -428]); if (!C) return; const { B } = C, r = makeRng(55);
  const sf = storefront(B, { w: 9.4, d: C.d, floors: 2, rng: r, name: 'THE ANCHOR', hl: true });
  const neon = txt(T, 'anchorN', '⚓', { w: 160, h: 320, bg: '#0b0f14', fg: '#49d6ff', font: 6, sub: 'BAR', subFg: '#ff4a6a' });
  boxSign(B, neon, 4.2, sf.gfH + 1.6, 0.75, 1.1, 2.2, -Math.PI / 2, 3.6, 0.2); signQuad(B, neon, 4.41, sf.gfH + 1.6, 0.75, 1.1, 2.2, Math.PI / 2, 3.6);
  glow(B, 3.5, 5, 1, 9, [0.3, 0.8, 1.0], 0.45, 1.3);
  place(C, 'anchor', 'The Anchor', 'bar', [0, -8], { spot: [1.5, 1.6] }); addAddress(T, C.side, B, [0, 0.6], 'bar', 'oldtown', null, { name: 'The Anchor' });
}

function school(T, id, o) {
  const C = claim(T, o.pt, o.street, o.w, o.d, o.near); if (!C) return; const { B } = C, r = makeRng(o.seed), hs = !!o.high;
  const mw = hs ? 84 : 68, mx = hs ? -34 : -14, set = hs ? 16 : 20;
  tower(C.sub(mx, -set), { w: mw, d: hs ? 22 : 18, floors: hs ? 3 : 2, kind: 'brick', rng: r, exposeL: true, exposeR: true, lit: 0 });
  shopBox(C.sub(mx + mw / 2 + (hs ? 20 : 15), -set - 2), { w: hs ? 34 : 24, d: hs ? 28 : 20, h: hs ? 10 : 8, rng: r, lay: WL.brick, col: [250, 244, 240], glass: 0.18, hl: true });
  monument(B, txt(T, id + 's', o.sign, { w: 1024, h: 256, bg: '#f4f1ea', fg: hs ? '#5a1620' : '#1f5a3a', font: 1, sub: o.sub }), mx, -3, 6.5, 1.6, 0, 1.2); flagpole(B, mx + 6, -4.5);
  lot(B, mx - 26, -set + 3.5, mx + 26, -set + 9.5, GL.asphalt); for (const ex2 of [mx - 23, mx + 23]) { lot(B, ex2 - 3, -set + 9.5, ex2 + 3, C.sw, GL.asphalt); ramp(B, ex2 - 3, ex2 + 3, C.sw); } B.d.lay(GL.concrete).col(245, 215, 60); B.d.gquad(mx - 26, -set + 3.5, mx + 26, -set + 3.5, mx + 26, -set + 3.7, mx - 26, -set + 3.7, 0.03, 0, 0, 52, 0, 52, 0.2, 0, 0.2);
  lot(B, -C.w / 2 + 2, -set + 10, C.w / 2 - 2, -0.6, GL.grass, [236, 246, 226], 0.012);
  for (let i = 0; i < 9; i++) B.tree(lerp(-C.w / 2 + 6, C.w / 2 - 6, (i + r()) / 9), r.r(-7, -2.5), r.pick(['maple', 'oak', 'alder']), r.r(0.8, 1.15));
  if (hs) { // football field, goal posts, bleachers
    const fx0 = -52, fx1 = 44, fz0 = -Math.min(C.d - 3, 104), fz1 = fz0 + 50; lot(B, fx0 - 4, fz0 - 2, fx1 + 4, fz1 + 2, GL.grass, [205, 240, 195], 0.014);
    B.d.lay(GL.concrete).col(250, 250, 248); const ln = (x0, z0, x1, z1) => B.d.gquad(x0, z0, x1, z0, x1, z1, x0, z1, 0.03, 0, 0, 1, 0, 1, 1, 0, 1);
    ln(fx0, fz0, fx1, fz0 + 0.14); ln(fx0, fz1 - 0.14, fx1, fz1); for (let i = 0; i <= 12; i++) { const x = lerp(fx0, fx1, i / 12); ln(x - 0.07, fz0, x + 0.07, fz1); }
    B.p.lay(WL.plain).col(230, 200, 40); for (const gx of [fx0 - 1.5, fx1 + 1.5]) { const zm = (fz0 + fz1) / 2; B.p.cyl(gx, zm, 0, 3, 0.09, 0.09, 6); B.p.tube(gx, 3, zm - 2.8, gx, 3, zm + 2.8, 0.07, 0.07, 5); B.p.cyl(gx, zm - 2.8, 3, 9, 0.06, 0.06, 5); B.p.cyl(gx, zm + 2.8, 3, 9, 0.06, 0.06, 5); }
    B.p.lay(WL.plain + METAL).col(170, 174, 176); for (let i = 0; i < 6; i++) B.p.box(fx0 + 12, i * 0.42, fz1 + 3 + i * 0.75, fx1 - 12, (i + 1) * 0.42, fz1 + 3.75 + i * 0.75, 63); B.collide(fx0 + 12, fz1 + 3, fx1 - 12, fz1 + 7.5, 2.5, 'building');
    for (const lx of [fx0 + 4, fx1 - 4]) for (const lz of [fz0 - 3, fz1 + 9]) { B.p.lay(WL.plain + METAL).col(140, 144, 146); B.p.cyl(lx, lz, 0, 16, 0.2, 0.12, 7); B.p.box(lx - 1.4, 15.4, lz - 0.15, lx + 1.4, 16.4, lz + 0.15, 63); glow(B, lx, 15.5, lz, 30, COOL, 0.3, 2.6); B.collide(lx - 0.2, lz - 0.2, lx + 0.2, lz + 0.2, 16, 'pole'); }
  } else { // playground
    const px = mx + mw / 2 - 8, pz = -set - 30; lot(B, px - 12, pz - 8, px + 12, pz + 8, GL.gravel, [200, 160, 120], 0.014); const p = B.p;
    p.lay(WL.plain + METAL).col(60, 110, 170); for (const sx of [-4, 4]) { p.tube(px + sx, 0, pz - 1.2, px + sx, 2.4, pz, 0.05); p.tube(px + sx, 0, pz + 1.2, px + sx, 2.4, pz, 0.05); } p.tube(px - 4, 2.4, pz, px + 4, 2.4, pz, 0.05);
    p.lay(WL.plain).col(30, 30, 30); for (const sx of [-2.4, 0, 2.4]) { p.tube(px + sx - 0.25, 2.4, pz, px + sx - 0.25, 0.5, pz, 0.012); p.tube(px + sx + 0.25, 2.4, pz, px + sx + 0.25, 0.5, pz, 0.012); p.box(px + sx - 0.28, 0.46, pz - 0.1, px + sx + 0.28, 0.5, pz + 0.1, 63); }
    p.lay(WL.plain).col(210, 60, 40); p.box(px + 7, 0, pz + 3, px + 9, 1.6, pz + 5, 31); p.col(230, 190, 40).quad(px + 7.4, 0.1, pz - 0.5, px + 8.6, 0.1, pz - 0.5, px + 8.6, 1.6, pz + 3, px + 7.4, 1.6, pz + 3, 0, 0);
    chainFence(B, px - 12.5, pz - 8.5, px + 12.5, pz - 8.5, 1.4); chainFence(B, px - 12.5, pz - 8.5, px - 12.5, pz + 8.5, 1.4); chainFence(B, px + 12.5, pz + 8.5, px + 12.5, pz - 8.5, 1.4);
  }
  place(C, id, o.name, 'school', [mx, -set - 9], { fx: mx, label: o.label });
}

function riverview(T) {
  const C = claim(T, [60, 230], 'Commerce St', 96, 70); if (!C) return; const { B } = C, r = makeRng(12);
  for (const x of [-25, 25]) { const S = C.sub(x, -15); tower(S, { w: 31, d: 18, floors: 12, kind: 'apartment', rng: r, exposeL: true, exposeR: true, hl: true }); const a = addAddress(T, C.side, S, [0, 0.8], 'apartment', 'midtown', null, { name: 'Riverview Towers ' + (x < 0 ? 'North' : 'South') }); a.units = 88; hedge(S, -15, 3, -3, 3, 1.0); hedge(S, 3, 3, 15, 3, 1.0); }
  monument(B, txt(T, 'rvt', 'RIVERVIEW TOWERS', { w: 1024, h: 200, bg: '#2a3038', fg: '#e8dcc0', font: 7, sub: 'APARTMENT HOMES' }), 0, -3, 5.5, 1.1, 0, 1.3);
  lot(B, -46, -13.5, 46, -0.6, GL.grass, [232, 244, 222], 0.012); lot(B, -1.3, -14, 1.3, 0.4, GL.walk, [236, 236, 232], 0.02);
  if (C.d > 52) { carPark(B, -44, -C.d + 2, 44, -35, { rng: r, occ: 0.6 }); lot(B, 40, -35, 46, C.sw, GL.asphalt); ramp(B, 40, 46, C.sw); }
  for (const x of [-42, -9, 9, 42]) B.tree(x, -7, 'maple', r.r(0.9, 1.2));
  place(C, 'riverview', 'Riverview Towers', 'apartment', [0, -24], { spot: [0, -12] });
}

function cascade(T) {
  const C = claim(T, [950, -380], 'Cannery Row', 230, 150, [900, -280]); if (!C) return; const { B } = C, r = makeRng(91), set = 44, p = B.p;
  const wh = warehouse(B, { w: 126, d: 58, h: 11.5, rng: r, name: 'CASCADE FREIGHT', setback: set, docks: 10, col: [226, 226, 222], signBg: '#1a1a1a', signFg: '#f2552f', font: 2, hl: true });
  p.lay(WL.plain).col(220, 80, 40); p.box(-63.02, 9.2, -set, 63.02, 10.0, -set + 0.05, 1 + 4 + 8);
  // trailers backed up to some docks
  for (let i = 0; i < 10; i++) { if (!r.chance(0.55)) continue; const x = -63 + 8.1 + 11.8 * (i + 0.5), c = r.pick([[236, 236, 232], [226, 228, 232], [60, 90, 140], [236, 236, 232]]); p.lay(WL.metal).col(c[0], c[1], c[2]); p.box(x - 1.28, 1.25, -set + 0.4, x + 1.28, 4.0, -set + 14, 63); p.lay(WL.plain).col(26, 26, 28); p.box(x - 1.2, 0.2, -set + 1.2, x + 1.2, 1.25, -set + 3.6, 31); p.box(x - 0.1, 0, -set + 11.5, x + 0.1, 1.25, -set + 11.7, 15); p.box(x - 0.9, 0, -set + 11.4, x + 0.9, 0.08, -set + 11.8, 31); B.collide(x - 1.28, -set + 0.4, x + 1.28, -set + 14, 4, 'building'); }
  // container stacks, rail spur with box cars along the back
  const boxes = Object.assign(() => 0.5, { r: r.r, i: r.i, pick: r.pick, chance: r.chance });
  for (let i = 0; i < 12; i++) yardStuff(B, -C.w / 2 + 8 + (i % 6) * 4.2, -24 - Math.floor(i / 6) * 8, boxes);
  const rz = -Math.min(C.d - 4, 138); lot(B, -C.w / 2 + 2, rz - 2.2, C.w / 2 - 2, rz + 2.2, GL.gravel, [190, 186, 180]);
  p.lay(WL.plain + METAL).col(96, 84, 76); for (const o of [-0.72, 0.72]) p.box(-C.w / 2 + 2, 0.1, rz + o - 0.04, C.w / 2 - 2, 0.24, rz + o + 0.04, 31);
  p.lay(WL.wood).col(110, 90, 76); for (let x = -C.w / 2 + 2.5; x < C.w / 2 - 2; x += 0.75) p.box(x - 0.11, 0.02, rz - 1.25, x + 0.11, 0.12, rz + 1.25, 31);
  for (const [bx, c] of [[-40, [130, 60, 40]], [-23.5, [70, 80, 60]], [20, [150, 130, 60]]]) { p.lay(WL.metal).col(c[0], c[1], c[2]); p.box(bx - 7.6, 1.1, rz - 1.5, bx + 7.6, 4.6, rz + 1.5, 63); p.lay(WL.plain).col(24, 24, 26); p.box(bx - 6.8, 0.25, rz - 1.3, bx - 4.4, 1.1, rz + 1.3, 31); p.box(bx + 4.4, 0.25, rz - 1.3, bx + 6.8, 1.1, rz + 1.3, 31); B.collide(bx - 7.6, rz - 1.5, bx + 7.6, rz + 1.5, 4.6, 'building'); }
  const hw = C.w / 2 - 0.5; chainFence(B, -hw, -0.6, -8, -0.6); chainFence(B, 8, -0.6, hw, -0.6); chainFence(B, -hw, -C.d + 0.6, -hw, -0.6); chainFence(B, hw, -0.6, hw, -C.d + 0.6); ramp(B, -7, 7, C.sw);
  shell(B, 9, -7, 12, -3.5, 3, WL.metal, [226, 226, 222], [{ w: 1 }, { w: 1.4, st: 9, ww: 1.1, wh: 1.1, lit: 5 }, { w: 0.6 }], { rng: r, par: 0.2, plant: 0 });
  for (const x of [-50, -10, 30, 60]) { glow(B, x, 9, -set + 6, 22, COOL, 0.45, 2.0); }
  void wh; place(C, 'cascade', 'Cascade Freight', 'industrial', [0, -set - 29], { stop: [0, -20, Math.PI / 2], spot: [-30, -set + 16.5] }); addAddress(T, C.side, B, [-61, -set + 0.8], 'industrial', 'industrial', null, { name: 'Cascade Freight' });
}

function pinecrest(T) {
  const C = claim(T, [-700, 610], 'Willow St', 190, 128, [-672, 530]); if (!C) return; const { B } = C, r = makeRng(41);
  lot(B, -C.w / 2 + 1, -C.d + 1, C.w / 2 - 1, -0.5, GL.grass, [226, 238, 212], 0.01);
  lot(B, -3, -C.d + 8, 3, C.sw, GL.asphalt, [240, 236, 228]); ramp(B, -3, 3, C.sw);
  let unit = 1; const base = 600 + 2 * Math.round(r.r(8, 20));
  for (const lz of [-34, -86]) {
    if (-lz + 26 > C.d) continue;
    lot(B, -C.w / 2 + 5, lz - 2.8, C.w / 2 - 5, lz + 2.8, GL.asphalt, [240, 236, 228]);
    for (const sd of [1, -1]) for (let x = -C.w / 2 + 12; x < C.w / 2 - 8; x += 13.2) {
      if (Math.abs(x) < 7) continue;
      const S = C.sub(x, lz + sd * (-2.8), sd > 0 ? 0 : Math.PI), t = trailer(S, { rng: r, number: unit }); void t;
      const d0 = S.w(3.6, -3.75 - 3), ks = kerbStop(T, C.side.he, B.w(0, 0)[0], B.w(0, 0)[1]), lane = B.w(x, lz);
      T.addresses.push({ id: 'a' + T.addresses.length, label: `${base} Willow St #${unit}`, street: 'Willow St', number: base, unit, x: d0[0], z: d0[1], stop: { x: lane[0], z: lane[1], heading: B.h + Math.PI / 2 }, spot: { x: S.w(4.2, -1)[0], z: S.w(4.2, -1)[1] }, kind: 'house', district: 'bungalow', name: 'Pinecrest' }); unit++;
      if (r.chance(0.7)) { const c = S.w(-4.6, -6); T.parking.push({ x: c[0], z: c[1], heading: S.h + Math.PI, kind: 'drive' }); }
      if (r.chance(0.5)) S.tree(r.r(-5, 5), -22, r.pick(['fir', 'cedar', 'alder']), r.r(0.7, 1.0));
    }
  }
  monument(B, txt(T, 'pine', 'PINECREST', { w: 1024, h: 256, bg: '#3a2a1e', fg: '#f0d9a8', font: 1, sub: 'MOBILE HOME COMMUNITY  ·  55+' }), -9, -2.6, 5, 1.25, 0, 1.0);
  const hw = C.w / 2 - 0.6; chainFence(B, -hw, -C.d + 0.8, hw, -C.d + 0.8, 1.6); chainFence(B, -hw, -C.d + 0.8, -hw, -1, 1.6); chainFence(B, hw, -1, hw, -C.d + 0.8, 1.6);
  for (let i = 0; i < 10; i++) B.tree(lerp(-hw + 3, hw - 3, i / 9), -C.d + 3.5, r.pick(['fir', 'cedar', 'fir']), r.r(0.8, 1.2));
  for (const x of [-60, 8, 60]) for (const lz of [-34, -86]) if (-lz + 26 <= C.d) { /* yard lights */ glow(B, x, 6, lz, 16, [1.0, 0.6, 0.26], 0.5, 1.4); B.p.lay(WL.wood).col(120, 100, 84); B.p.cyl(x, lz + 3.4, 0, 6.4, 0.11, 0.08, 6); T.lamps.push(B.w(x, lz + 3.4)[0], KERB + 6.3, B.w(x, lz + 3.4)[1]); }
  place(C, 'pinecrest', 'Pinecrest Trailer Court', 'trailer', [0, -60], { stop: [0, -34, Math.PI / 2], spot: [8, -30], label: 'Pinecrest' });
}

function stmarks(T) {
  const C = claim(T, [-835, 110], 'Market St', 54, 52); if (!C) return; const { B } = C, r = makeRng(8), f = B.f, p = B.p;
  const x0 = -6.5, x1 = 6.5, z1 = -11, z0 = Math.max(-C.d + 4, -39), h = 7.2, col = [240, 236, 226], S = SIDES(x0, z0, x1, z1);
  f.lay(WL.stucco).col(col[0], col[1], col[2]);
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], 0, h, [{ w: 4.6 }, { w: 3.8, st: 8, ww: 2.2, wh: 3.1, lit: 3, rec: 0.25 }, { w: 4.6 }], 5);
  for (const k of [1, 3]) wallGrid(B, S[k][0], S[k][1], S[k][2], S[k][3], 0, h, { cw: 4.4, fh: h, ww: 1.15, wh: 4.4, st: 0, lit: 3, margin: 1.2, seed: 9 + k, rec: 0.22 });
  f.wn(0); f.wall(S[2][0], S[2][1], S[2][2], S[2][3], 0, h);
  const yR = gableRoof(B, 0, (z0 + z1) / 2, (z1 - z0) / 2, 6.5, h, 1.15, Math.PI / 2, WL.stucco, col, [200, 200, 205], 0.5, 0.4);
  // bell tower and spire at the front corner
  const tx0 = -11, tx1 = -6.5, tz1 = -9.6, tz0 = -14.1, th = 15.5; f.lay(WL.stucco).col(col[0], col[1], col[2]); const TS = SIDES(tx0, tz0, tx1, tz1);
  for (const s of TS) { f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, th - 3.6); wallGrid(B, s[0], s[1], s[2], s[3], th - 3.6, th, { cw: 4.5, fh: 3.6, ww: 1.5, wh: 2.4, st: 6, lit: 6, margin: 0, rec: 0.3 }); }
  p.lay(WL.panel).col(210, 206, 196); p.box(tx0 - 0.15, th, tz0 - 0.15, tx1 + 0.15, th + 0.25, tz1 + 0.15, 31);
  const sy = hipRoof(B, (tx0 + tx1) / 2, (tz0 + tz1) / 2, 2.25, 2.25, th + 0.25, 3.4, 0, [150, 190, 170], 0.2);
  p.lay(WL.plain + METAL).col(214, 190, 110); p.box(-8.8, sy, -11.9, -8.7, sy + 1.6, -11.8, 31); p.box(-9.2, sy + 1.0, -11.9, -8.3, sy + 1.1, -11.8, 31);
  B.collide(x0, z0, x1, z1, yR); B.collide(tx0, tz0, tx1, tz1, th + 6); B.foot(x0, z0, x1, z1, true); B.foot(tx0, tz0, tx1, tz1, true);
  p.lay(WL.panel).col(196, 192, 184); for (let i = 0; i < 3; i++) p.box(-3 - i * 0.3, 0, z1 + i * 0.32, 3 + i * 0.3, 0.42 - i * 0.14, z1 + (i + 1) * 0.32 + 0.4, 31);
  lot(B, -C.w / 2 + 1, -C.d + 1, C.w / 2 - 1, -0.6, GL.grass, [232, 244, 222], 0.01); lot(B, -1.4, z1 + 1.2, 1.4, 0.4, GL.walk, [236, 236, 232], 0.02);
  if (C.w > 40) { carPark(B, 9.5, -C.d + 3, C.w / 2 - 2, -6, { rng: r, occ: 0.25 }); lot(B, 12, -6, 17, C.sw, GL.asphalt); ramp(B, 12, 17, C.sw); }
  monument(B, txt(T, 'stm', "ST. MARK'S", { w: 1024, h: 256, bg: '#f4f1ea', fg: '#2a2a2a', font: 1, sub: 'LUTHERAN CHURCH   ·   SUNDAY 9 & 11' }), -15, -3, 4.4, 1.1, 0, 1.0);
  for (const [x, z] of [[-20, -8], [-22, -26], [-16, -40]]) if (-z < C.d - 3) B.tree(x, z, r.pick(['oak', 'maple']), r.r(1.0, 1.3));
  glow(B, 0, 4, z1 + 3, 10, WARMW, 0.4, 0.8);
  place(C, 'stmarks', "St. Mark's Church", 'church', [0, (z0 + z1) / 2], { spot: [1.2, -6] });
}

function depot(T) {
  const C = claim(T, [515, -540], 'Mill St', 120, 96); if (!C) return; const { B } = C, r = makeRng(63), set = 44;
  warehouse(B, { w: 74, d: Math.min(34, C.d - set - 4), h: 8.5, rng: r, name: 'KETTER TRANSIT  ·  BUS DEPOT', setback: set, docks: 6, col: [214, 222, 228], signBg: '#1b5fa8', signFg: '#ffffff', font: 0, hl: true });
  // parked buses
  for (let i = 0; i < 7; i++) { if (i === 3) continue; const S = C.sub(-36 + i * 12, -17, 0.5), f = S.f, p = S.p, L = 12.2, W = 2.55; f.lay(WL.plain).col(236, 238, 240);
    const SS = SIDES(-W / 2, -L / 2, W / 2, L / 2); for (let k = 0; k < 4; k++) { const s = SS[k]; if (k % 2) wallGrid(S, s[0], s[1], s[2], s[3], 0.45, 3.15, { cw: 1.5, fh: 2.7, ww: 1.36, wh: 1.05, st: 1, lit: 6, margin: 0.35, rec: 0.03, seed: i * 7 + k, fit: true }); else wallGrid(S, s[0], s[1], s[2], s[3], 0.45, 3.15, { cw: W, fh: 2.7, ww: 2.2, wh: 1.3, st: 1, lit: 6, margin: 0, rec: 0.03, seed: i }); }
    p.lay(WL.plain).col(236, 238, 240); p.box(-W / 2, 3.15, -L / 2, W / 2, 3.2, L / 2, 16); p.col(30, 100, 170).box(-W / 2 - 0.01, 1.0, -L / 2 - 0.01, W / 2 + 0.01, 1.28, L / 2 + 0.01, 15); p.col(22, 22, 24); for (const z of [-3.6, 3.9]) p.box(-W / 2 + 0.02, 0, z - 0.5, W / 2 - 0.02, 0.95, z + 0.5, 15); p.box(-W / 2 + 0.1, 0.3, -L / 2 + 0.1, W / 2 - 0.1, 0.45, L / 2 - 0.1, 32 + 15);
    S.collide(-W / 2, -L / 2, W / 2, L / 2, 3.2, 'building'); }
  const hw = C.w / 2 - 0.5; chainFence(B, -hw, -0.6, -7, -0.6); chainFence(B, 7, -0.6, hw, -0.6); ramp(B, -6, 6, C.sw);
  for (const x of [-40, 0, 40]) glow(B, x, 8, -set + 5, 22, COOL, 0.45, 2.0);
  place(C, 'depot', 'Ketter Transit Bus Depot', 'depot', [0, -set - 15], { spot: [4, -1.2], label: 'Bus Depot' });
}

function construction(T) {
  const C = claim(T, [355, 20], 'Kessler St', 62, 70); if (!C) return; const { B } = C, r = makeRng(29), p = B.p, hw = C.w / 2 - 0.8, d = C.d;
  lot(B, -hw, -d + 0.8, hw, -0.6, GL.gravel, [196, 176, 150], 0.014);
  const ply = [206, 180, 140]; woodFence(B, -hw, -0.9, -6, -0.9, 2.4, ply); woodFence(B, 6, -0.9, hw, -0.9, 2.4, ply); ramp(B, -5, 5, C.sw); woodFence(B, -hw, -d + 1, -hw, -0.9, 2.4, ply); woodFence(B, hw, -0.9, hw, -d + 1, 2.4, ply); woodFence(B, hw, -d + 1, -hw, -d + 1, 2.4, ply);
  signQuad(B, txt(T, 'cons', 'KESSLER POINT', { w: 1024, h: 300, bg: '#f4f1ea', fg: '#12355b', font: 7, sub: '64 RIVERFRONT RESIDENCES  ·  COMING SOON', subFg: '#b3161a' }), 16, 1.4, -0.84, 6.4, 1.9, 0, 0.6);
  // concrete frame going up
  const gx = 5, gz = 4, sp = 6.2, ox = -22, oz = -d + 9, fl = 3.5;
  for (let k = 0; k < 4; k++) { const nx = k < 3 ? gx : 3; p.lay(WL.panel).col(186, 184, 178);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= gz; j++) p.box(ox + i * sp - 0.25, k * fl, oz + j * sp - 0.25, ox + i * sp + 0.25, (k + 1) * fl - 0.25, oz + j * sp + 0.25, 15);
    p.box(ox - 0.6, (k + 1) * fl - 0.25, oz - 0.6, ox + nx * sp + 0.6, (k + 1) * fl, oz + gz * sp + 0.6, 63);
    if (k === 3) { p.lay(WL.plain + METAL).col(120, 90, 70); for (let i = 0; i <= nx; i++) for (let j = 0; j <= gz; j++) for (const o of [-0.12, 0.12]) p.cyl(ox + i * sp + o, oz + j * sp, (k + 1) * fl, (k + 1) * fl + 1.3, 0.02, 0.02, 4, 0); }
    cutRun(B, CUT.rail, ox - 0.5, oz + gz * sp + 0.55, ox + nx * sp + 0.5, oz + gz * sp + 0.55, (k + 1) * fl, 1.1, [230, 120, 30], 2); }
  B.collide(ox - 0.6, oz - 0.6, ox + gx * sp + 0.6, oz + gz * sp + 0.6, 14); B.foot(ox - 0.6, oz - 0.6, ox + gx * sp + 0.6, oz + gz * sp + 0.6, true);
  // tower crane
  const cx = ox + gx * sp + 5, cz = oz + 6, mh = 44, uv = cutUV(CUT.lattice), c = B.c; c.col(232, 190, 40).lay(0);
  for (let y = 0; y < mh; y += 1.9) for (const [ax, az, bx, bz] of [[-0.95, 0.95, 0.95, 0.95], [0.95, 0.95, 0.95, -0.95], [0.95, -0.95, -0.95, -0.95], [-0.95, -0.95, -0.95, 0.95]]) c.quad(cx + ax, y, cz + az, cx + bx, y, cz + bz, cx + bx, y + 1.9, cz + bz, cx + ax, y + 1.9, cz + az, uv.u0, uv.v0, uv.u1, uv.v1);
  p.lay(WL.panel).col(170, 168, 162); p.box(cx - 2.4, 0, cz - 2.4, cx + 2.4, 0.6, cz + 2.4, 31); B.collide(cx - 1, cz - 1, cx + 1, cz + 1, mh, 'building');
  p.lay(WL.plain).col(232, 190, 40); p.box(cx - 1.2, mh, cz - 1.2, cx + 1.2, mh + 1.4, cz + 1.2, 63); p.box(cx - 1.0, mh + 1.4, cz + 0.6, cx + 0.6, mh + 3.4, cz + 2.4, 63); p.lay(WL.plain + METAL).col(30, 40, 50).box(cx - 0.9, mh + 2.0, cz + 2.4, cx + 0.5, mh + 3.2, cz + 2.42, 1);
  const jl = 40, cj = 13, jy = mh + 1.6, ja = -0.9, jc = Math.cos(ja), js = Math.sin(ja);
  const J = (t, o, y) => [cx + jc * t - js * o, y, cz - js * t + jc * o].slice();
  for (let t = -cj; t < jl; t += 2.0) { for (const o of [-0.6, 0.6]) { const a = J(t, o, jy), b = J(t + 2, o, jy); c.quad(a[0], jy, a[2], b[0], jy, b[2], b[0], jy + 1.6, b[2], a[0], jy + 1.6, a[2], uv.u0, uv.v0, uv.u1, uv.v1); } }
  p.lay(WL.plain).col(232, 190, 40); { const a = J(-cj, 0, 0), b = J(jl, 0, 0); p.tube(a[0], jy + 1.6, a[2], b[0], jy + 1.6, b[2], 0.09, 0.09, 4); const t0 = J(0, 0, 0); p.tube(t0[0], mh + 7.5, t0[2], b[0], jy + 1.6, b[2], 0.03, 0.03, 3); p.tube(t0[0], mh + 7.5, t0[2], a[0], jy + 1.6, a[2], 0.03, 0.03, 3); p.cyl(cx, cz, mh + 1.4, mh + 7.5, 0.25, 0.1, 5); }
  { const a = J(-cj + 2.5, 0, 0); p.lay(WL.panel).col(150, 150, 146); p.push(a[0], jy - 1.6, a[2], ja + Math.PI / 2); p.box(-1, 0, -1.8, 1, 1.9, 1.8, 63); p.pop(); const hk = J(jl * 0.62, 0, 0); p.lay(WL.plain).col(20, 20, 22); p.tube(hk[0], jy, hk[2], hk[0], jy - 19, hk[2], 0.02, 0.02, 3); p.col(232, 190, 40).box(hk[0] - 0.25, jy - 19.8, hk[2] - 0.2, hk[0] + 0.25, jy - 19, hk[2] + 0.2, 63); (T.glows = T.glows || []).push({ x: B.w(cx, cz)[0], y: KERB + mh + 7.6, z: B.w(cx, cz)[1], r: 1, col: RED, a: 0.9, halo: 1.3 }); }
  // site office, toilets, piles
  shell(B, -hw + 2, -8.5, -hw + 10, -5.4, 2.8, WL.metal, [226, 224, 216], [{ w: 1 }, { w: 1.4, st: 8, ww: 0.9, wh: 2.0, lit: 5, rec: 0.06 }, { w: 2 }, { w: 2, st: 9, ww: 1.4, wh: 1.0, lit: 5 }, { w: 1.6 }], { rng: r, par: 0.15, plant: 0 });
  p.lay(WL.plain).col(40, 90, 150); for (const x of [-hw + 12, -hw + 13.4]) { p.box(x, 0, -8.3, x + 1.15, 2.25, -7.1, 31); B.collide(x, -8.3, x + 1.15, -7.1, 2.3, 'prop'); }
  for (let i = 0; i < 5; i++) yardStuff(B, r.r(-hw + 5, hw - 16), r.r(-18, -11), Object.assign(() => 0.9, { r: r.r, i: r.i, pick: r.pick, chance: r.chance }));
  glow(B, 0, 8, -12, 20, COOL, 0.4, 2.0);
  place(C, 'construction', 'Kessler Point construction site', 'construction', [ox + gx * sp / 2, oz + gz * sp / 2], { spot: [0, -4], label: 'Construction site' });
}

function market(T) {
  const C = claim(T, [760, 580], 'Freight St', 216, 175, [800, 480]); if (!C) return; const { B } = C, r = makeRng(17), set = Math.min(112, C.d - 56);
  const rect = txt(T, 'fresh', 'FreshWay', { w: 1024, h: 256, bg: '#1f7a3e', fg: '#ffffff', font: 4, sub: 'S U P E R M A R K E T', subFg: '#f6e27a' });
  const sb = shopBox(B, { w: 88, d: 50, h: 8.6, rng: r, name: 'FreshWay', rect, signW: 17, lay: WL.panel, col: [236, 228, 208], glass: 0.42, setback: set, band: [31, 110, 60], canopy: 3.2, hl: true });
  glow(B, 0, 6.5, -set + 3, 30, WARMW, 0.6, 3.2); for (const x of [-30, -10, 10, 30]) glow(B, x, 3.2, -set + 2.5, 12, WARMW, 0.6, 0);
  boxSign(B, txt(T, 'pharm', 'PHARMACY', { w: 512, h: 96, bg: '#f4f1ea', fg: '#b3161a', font: 0 }), -30, 5.7, -set + 0.26, 6, 1.0, 0, 2.2); boxSign(B, txt(T, 'bakery', 'BAKERY  ·  DELI', { w: 512, h: 96, bg: '#f4f1ea', fg: '#1f7a3e', font: 0 }), 30, 5.7, -set + 0.26, 6, 1.0, 0, 2.2);
  carPark(B, -C.w / 2 + 6, -set + 9, C.w / 2 - 6, -3, { rng: r, occ: 0.4 }); ramp(B, -10, -2, C.sw); ramp(B, 30, 38, C.sw);
  // lot lights, tree islands, cart corrals
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = lerp(-C.w / 2 + 26, C.w / 2 - 26, i / 3), z = lerp(-set + 22, -14, j / 2), p = B.p; p.lay(WL.panel).col(196, 192, 186); p.cyl(x, z, 0, 0.8, 0.3, 0.3, 8); p.lay(WL.plain + METAL).col(150, 154, 156); p.cyl(x, z, 0.8, 10.5, 0.12, 0.08, 7); p.box(x - 1.3, 10.4, z - 0.16, x + 1.3, 10.56, z + 0.16, 63); B.collide(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 10.5, 'pole');
    const w = B.w(x, z); T.lamps.push(w[0], KERB + 10.3, w[1]); T.lampInfo.push({ x: w[0], y: KERB + 10.3, z: w[1], col: [1.0, 0.9, 0.74], r: 26, k: 1.1 });
    if ((i + j) % 2) { B.tree(x + 8, z, 'maple', 0.7); B.tree(x - 8, z, 'alder', 0.7); } }
  const p = B.p; p.lay(WL.plain + METAL).col(170, 174, 176); for (const x of [-48, -16, 16, 48]) { const z = -set + 40; for (const o of [-1.1, 1.1]) { p.tube(x + o, 0, z - 2.4, x + o, 1.0, z - 2.4, 0.03); p.tube(x + o, 1.0, z - 2.4, x + o, 1.0, z + 2.4, 0.03); p.tube(x + o, 0, z + 2.4, x + o, 1.0, z + 2.4, 0.03); } B.collide(x - 1.1, z - 2.4, x + 1.1, z + 2.4, 1, 'prop', true); }
  poleSign(B, rect, -C.w / 2 + 7, -2.5, 9.5, 6, 1.5, 3.0, 0);
  void sb; place(C, 'market', 'FreshWay Supermarket car park', 'retail', [0, -set - 25], { stop: [-6, -set + 12.3, Math.PI / 2], spot: [-2, -set + 6], label: 'FreshWay' }); addAddress(T, C.side, B, [0, -set + 0.8], 'shop', 'retail', null, { name: 'FreshWay Supermarket' });
}

function motel(T) {
  const C = claim(T, [-300, 605], 'Willow St', 104, 62, [-250, 530]); if (!C) return; const { B } = C, r = makeRng(23), f = B.f, p = B.p, fh = 2.85, col = [226, 214, 190];
  const bar = (S, L, rooms0) => { // rooms along local X, doors facing +Z
    const x0 = -L / 2, x1 = L / 2, z1 = 0, z0 = -7.6, n = Math.round(L / 4), SS = SIDES(x0, z0, x1, z1); S.f.lay(WL.stucco).col(col[0], col[1], col[2]);
    for (let fl = 0; fl < 2; fl++) { const cells = []; for (let i = 0; i < n; i++) cells.push({ w: 1.5, st: 8, ww: 0.92, wh: 2.05, lit: 3, rec: 0.07 }, { w: 2.5, st: 9, ww: 1.7, wh: 1.25, lit: 1 }); wallCells(S, SS[0][0], SS[0][1], SS[0][2], SS[0][3], fl * fh, (fl + 1) * fh, cells, rooms0 + fl * 31); wallGrid(S, SS[2][0], SS[2][1], SS[2][2], SS[2][3], fl * fh, (fl + 1) * fh, { cw: 4, fh, ww: 0.9, wh: 0.7, st: 9, lit: 1, margin: 0, seed: rooms0 + 5 + fl }); }
    S.f.wn(0); for (const k of [1, 3]) S.f.wall(SS[k][0], SS[k][1], SS[k][2], SS[k][3], 0, fh * 2);
    gableRoof(S, 0, -3.1, L / 2 + 0.2, 4.8, fh * 2 + 0.05, 0.28, 0, WL.stucco, col, [255, 220, 200], 0.9, 0.5);
    S.p.lay(WL.panel).col(196, 192, 184); S.p.box(x0, fh - 0.16, z1, x1, fh, z1 + 1.45, 63); cutRun(S, CUT.rail, x0, z1 + 1.4, x1, z1 + 1.4, fh, 1.05, [60, 40, 34], 1.6);
    S.p.lay(WL.plain).col(60, 40, 34); for (let i = 0; i <= n; i++) S.p.box(x0 + i * 4 - 0.06, 0, z1 + 1.33, x0 + i * 4 + 0.06, fh * 2 - 0.1, z1 + 1.45, 15);
    S.p.lay(WL.panel).col(190, 186, 178); S.p.box(x1, fh - 0.16, z1, x1 + 1.3, fh, z1 + 1.45, 63); for (let i = 0; i < 9; i++) S.p.box(x1 + 0.1, 0, z1 + 1.45 + (8 - i) * 0.3, x1 + 1.3, (i + 1) * (fh / 9) - 0.16, z1 + 1.45 + (9 - i) * 0.3, 31);
    S.collide(x0, z0, x1, z1, fh * 2 + 1.4); S.foot(x0, z0, x1, z1, true);
    for (let i = 0; i < n; i += 2) glow(S, x0 + i * 4 + 2, 2.4, 1.0, 5, WARMW, 0.45, 0);
  };
  const aL = Math.min(72, C.w - 26), zA = -Math.min(C.d - 9, 50);
  bar(C.sub(-8, zA), aL, 11); bar(C.sub(-8 + aL / 2 + 9.5, zA + 22, -Math.PI / 2), 36, 47);
  // office with a porte-cochere, the sign
  const O = C.sub(-8 - aL / 2 + 6, -19); shopBox(O, { w: 11, d: 8, h: 3.8, rng: r, name: 'OFFICE', signBg: '#10203a', signFg: '#ffd27a', lay: WL.stucco, col, glass: 0.6, font: 0, signW: 3 }); canopy(O, -4, 0.2, 4, 6, 3.3, [226, 214, 190]);
  const st = txt(T, 'starlite', 'STARLITE', { w: 768, h: 420, bg: '#0c1220', fg: '#ffe27a', font: 4, sub: 'M O T E L', subFg: '#ff4a6a' }), vac = txt(T, 'vacancy', 'VACANCY', { w: 512, h: 110, bg: '#0c1220', fg: '#5cf0a0', font: 0 }), tv = txt(T, 'colortv', 'WEEKLY RATES  ·  HBO  ·  WI-FI', { w: 768, h: 96, bg: '#f4f1ea', fg: '#1a1a1a', font: 0 });
  const sx = -C.w / 2 + 6, sz = -2.4; p.lay(WL.plain + METAL).col(96, 100, 104); p.cyl(sx, sz, 0, 9.5, 0.2, 0.16, 8);
  for (const rt of [0, Math.PI]) { const o = rt ? -0.17 : 0.17; signQuad(B, st, sx, 9.2, sz + o, 5.2, 2.85, rt, 3.6, 1); signQuad(B, vac, sx, 7.15, sz + o, 3.2, 0.7, rt, 3.4, 1); signQuad(B, tv, sx, 6.3, sz + o, 4.2, 0.55, rt, 1.4); }
  p.lay(WL.plain).col(20, 24, 34); p.box(sx - 2.65, 7.75, sz - 0.16, sx + 2.65, 10.65, sz + 0.16, 63); p.box(sx - 1.65, 6.78, sz - 0.16, sx + 1.65, 7.52, sz + 0.16, 63); p.box(sx - 2.15, 6.0, sz - 0.16, sx + 2.15, 6.6, sz + 0.16, 63);
  glow(B, sx, 9, sz, 15, [1.0, 0.8, 0.45], 0.5, 3.0); B.collide(sx - 0.2, sz - 0.2, sx + 0.2, sz + 0.2, 10, 'pole');
  carPark(B, -8 - aL / 2 + 13, zA + 2.6, -8 + aL / 2 - 2, -3, { rng: r, occ: 0.35 }); ramp(B, -12, -4, C.sw);
  place(C, 'motel', 'Starlite Motel', 'motel', [-8, zA - 3], { stop: [-8, zA + 6, Math.PI / 2], spot: [-4, zA + 2.2], label: 'Starlite Motel' }); addAddress(T, C.side, B, [-8 - aL / 2 + 6, -18.4], 'motel', 'strip', null, { name: 'Starlite Motel' });
}

function brennan(T) {
  const b = T.L.blocks.find(q => !q.river && pointInPoly(-965, -540, q.inner)); if (!b) return; const side = b.sides.find(s => s.e.name === 'Alder St'); if (!side) return;
  // 218 falls 9/24 of the way down the 200 block
  const e = side.e, a = T.L.nodes[e.a], tB = 9 / 24, along = tB * e.blkLen - e.blkS, sE = e.fwdName ? along : e.length - along, wx = a.x + e.dir.x * sE, wz = a.z + e.dir.z * sE;
  let s = (wx - side.i0[0]) * side.dx + (wz - side.i0[1]) * side.dz; const w = 17; s = Math.max(w / 2 + 1, Math.min(side.ilen - w / 2 - 1, s));
  const fr = sideFrame(side, s), d = Math.min(27, rayDepth(b.inner, fr.x + side.nx * 0.2, fr.z + side.nz * 0.2, side.nx, side.nz) / 2 - 0.6);
  b.used = b.used || []; b.used.push(obb(fr.x + side.nx * d / 2, fr.z + side.nz * d / 2, w / 2 - 0.04, d / 2, fr.h));
  b.rng = b.rng || makeRng(T.seed + b.id * 7919);
  buildLot(T, b, { side, s, w, d, fr, s0: s - w / 2, s1: s + w / 2, force: 218, hl: true, small: true, onAddress: (ad, B) => { const ks = kerbStop(T, side.he, fr.x, fr.z); T.places.brennan = { id: 'brennan', name: 'Brennan residence, ' + ad.label, kind: 'house', x: ad.x, z: ad.z, heading: fr.h, stop: ks.stop, spot: ad.spot, address: ad.id, mapLabel: ad.label }; ad.name = 'Brennan'; } });
}

function civic(T, id, o) {
  const C = claim(T, o.pt, o.street, o.w, o.d); if (!C) return; const { B } = C, r = makeRng(o.seed), f = B.f, p = B.p;
  const w = o.bw, d = o.bd, h = o.bh, set = o.set, x0 = -w / 2, x1 = w / 2, z1 = -set, z0 = z1 - d, base = 1.3, col = [240, 232, 214], S = SIDES(x0, z0, x1, z1), nf = Math.round((h - base - 1) / 3.9);
  f.lay(WL.panel).col(214, 208, 196); for (const s of S) { f.wn(0); f.wall(s[0], s[1], s[2], s[3], 0, base); }
  f.col(col[0], col[1], col[2]);
  const pw = o.cols * 2.3;                                  // portico width
  wallCells(B, S[0][0], S[0][1], S[0][2], S[0][3], base, base + 3.9, [{ w: (w - 3.4) / 2 - 3.4 }, { w: 3.4, st: 0, ww: 1.4, wh: 2.6, lit: 0 }, { w: 3.4, st: 8, ww: 2.2, wh: 3.2, lit: 3, rec: 0.3 }, { w: 3.4, st: 0, ww: 1.4, wh: 2.6, lit: 0 }, { w: (w - 3.4) / 2 - 3.4 }], o.seed);
  wallGrid(B, S[0][0], S[0][1], S[0][2], S[0][3], base + 3.9, h - 1, { cw: 3.4, fh: 3.9, ww: 1.4, wh: 2.6, st: 0, lit: 0, margin: 1, seed: o.seed + 1, rec: 0.25, fit: true });
  for (const k of [1, 2, 3]) wallGrid(B, S[k][0], S[k][1], S[k][2], S[k][3], base, h - 1, { cw: 3.4, fh: (h - 1 - base) / nf, ww: 1.4, wh: 2.6, st: 0, lit: 0, margin: 1, seed: o.seed + k * 3, rec: 0.25, fit: true });
  for (const s of S) { f.wn(0); f.wall(s[0], s[1], s[2], s[3], h - 1, h, 0, h - 1); }
  flatRoof(B, x0, z0, x1, z1, h, 1, WL.panel, col, r, 0.4);
  p.lay(WL.panel).col(col[0], col[1], col[2]); p.box(x0 - 0.3, h - 1.25, z0 - 0.3, x1 + 0.3, h - 0.85, z1 + 0.3, 1 + 2 + 4 + 8 + 32); p.box(x0 - 0.12, base - 0.12, z0 - 0.12, x1 + 0.12, base + 0.1, z1 + 0.12, 1 + 2 + 4 + 8 + 16);
  // portico: steps, columns, entablature, pediment
  const pd = 4.6, ch = h - 1.25 - base - 0.9, pz = z1 + pd;
  for (let i = 0; i < 7; i++) p.box(-pw / 2 - 1.2, 0, pz + i * 0.36, pw / 2 + 1.2, base - (i + 1) * (base / 8), pz + (i + 1) * 0.36, 31);
  p.box(-pw / 2 - 0.6, 0, z1, pw / 2 + 0.6, base, pz, 31);
  for (let i = 0; i < o.cols; i++) { const x = -pw / 2 + 1.0 + (pw - 2.0) * i / (o.cols - 1); p.lay(WL.plain).col(238, 232, 218); p.cyl(x, pz - 0.75, base + 0.3, base + ch, 0.44, 0.37, 14, 0); p.lay(WL.panel).col(col[0], col[1], col[2]); p.box(x - 0.55, base, pz - 1.3, x + 0.55, base + 0.3, pz - 0.2, 31); p.box(x - 0.52, base + ch, pz - 1.27, x + 0.52, base + ch + 0.25, pz - 0.23, 31); B.collide(x - 0.45, pz - 1.2, x + 0.45, pz - 0.3, ch, 'pole'); }
  const ey = base + ch + 0.25; p.box(-pw / 2 - 0.3, ey, z1, pw / 2 + 0.3, ey + 0.9, pz - 0.1, 63);
  const py = ey + 0.9, ph = pw * 0.14; p.quad(-pw / 2 - 0.5, py, pz, pw / 2 + 0.5, py, pz, pw / 2 + 0.5, py + 0.01, pz, -pw / 2 - 0.5, py + 0.01, pz, 0, 0);
  p.tri3(-pw / 2 - 0.5, py, pz, pw / 2 + 0.5, py, pz, 0, py + ph, pz); p.lay(WL.roof).col(230, 230, 232);
  p.quad(-pw / 2 - 0.5, py, pz + 0.1, 0, py + ph, pz + 0.1, 0, py + ph, z1, -pw / 2 - 0.5, py, z1, 0, 0); p.quad(0, py + ph, pz + 0.1, pw / 2 + 0.5, py, pz + 0.1, pw / 2 + 0.5, py, z1, 0, py + ph, z1, 0, 0);
  signQuad(B, txt(T, id + 'fr', o.frieze, { w: 1024, h: 80, bg: '#d9d0bb', fg: '#3a352c', font: 1 }), 0, ey + 0.45, pz - 0.08, Math.min(pw - 0.6, 12), Math.min(pw - 0.6, 12) * 80 / 1024, 0, 0.25);
  if (o.dome) { // clock tower and copper dome
    const cy = h, cz = (z0 + z1) / 2; f.lay(WL.panel).col(col[0], col[1], col[2]); const TS = SIDES(-3.6, cz - 3.6, 3.6, cz + 3.6); for (const s of TS) { f.wn(0); f.wall(s[0], s[1], s[2], s[3], cy - 1, cy + 7.5); }
    const ck = txt(T, 'clock', '◷', { w: 128, h: 128, bg: '#efe8d6', fg: '#2a2a2a', font: 1 }); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; signQuad(B, ck, Math.sin(a) * 3.62, cy + 5.2, cz + Math.cos(a) * 3.62, 2.6, 2.6, a, 0.9); }
    p.lay(WL.panel).col(col[0], col[1], col[2]); p.box(-3.9, cy + 7.5, cz - 3.9, 3.9, cy + 7.9, cz + 3.9, 63);
    p.lay(WL.plain).col(120, 168, 150); let rr = 3.4; for (let i = 0; i < 6; i++) { const a0 = i / 6 * Math.PI / 2, a1 = (i + 1) / 6 * Math.PI / 2; p.cyl(0, cz, cy + 7.9 + Math.sin(a0) * 3.4, cy + 7.9 + Math.sin(a1) * 3.4, Math.cos(a0) * 3.4, Math.cos(a1) * 3.4 + 0.02, 16, 0); } void rr;
    p.lay(WL.plain + METAL).col(214, 190, 110); p.cyl(0, cz, cy + 11.3, cy + 13.6, 0.1, 0.02, 6);
  }
  B.collide(x0, z0, x1, z1, h); B.collide(-pw / 2 - 0.6, z1, pw / 2 + 0.6, pz, base, 'barrier'); B.foot(x0, z0, x1, z1, true);
  // grounds
  lot(B, -C.w / 2 + 1.5, -C.d + 1.5, C.w / 2 - 1.5, -0.8, GL.grass, [232, 244, 222], 0.01); lot(B, -pw / 2 - 1.2, pz + 2.4, pw / 2 + 1.2, 0.4, GL.walk, [240, 240, 236], 0.02);
  for (const sx of [-1, 1]) { for (let i = 0; i < 3; i++) { const x = sx * (pw / 2 + 5 + i * 6.5); if (Math.abs(x) < C.w / 2 - 3) B.tree(x, -set / 2 - 1, r.pick(['oak', 'maple']), r.r(1.0, 1.3)); } if (o.dome) flagpole(B, sx * (pw / 2 + 2.6), -3.2, 10); glow(B, sx * pw * 0.3, 2, pz + 2, 9, WARMW, 0.45, 0.7); }
  if (!o.dome) flagpole(B, pw / 2 + 3, -3.2);
  monument(B, txt(T, id + 'm', o.sign, { w: 1024, h: 220, bg: '#3b3f44', fg: '#e8e2d2', font: 1, sub: o.sub }), -pw / 2 - 6.5, -2.4, 4.6, 1.0, 0, 1.0);
  if (C.d > set + d + 16) carPark(B, -C.w / 2 + 3, -C.d + 2.5, C.w / 2 - 3, z0 - 3, { rng: r, occ: 0.5 });
  place(C, id, o.name, 'civic', [0, (z0 + z1) / 2], { spot: [0, pz + 4.5], label: o.label }); addAddress(T, C.side, B, [0, pz + 0.5], 'office', 'downtown', null, { name: o.name });
}

function gasStation(T, pt, street, near, seed) {
  const C = claim(T, pt, street, 42, 40, near); if (!C) return; const { B } = C, r = makeRng(seed), p = B.p;
  lot(B, -20, -C.d + 1, 20, C.sw, GL.asphalt, [232, 228, 222]); ramp(B, -19, -11, C.sw); ramp(B, 11, 19, C.sw);
  const brand = txt(T, 'kgas', 'KETTER GAS', { w: 768, h: 128, bg: '#c21d1d', fg: '#ffffff', font: 2 });
  canopy(B, -10, -22, 10, -9.5, 5.2, [236, 236, 232], false, [0.9, 0.95, 1.0]); p.lay(WL.plain).col(190, 30, 30); p.box(-10.05, 5.2, -22.05, 10.05, 5.5, -9.45, 15);
  for (const z of [-9.44, -22.06]) signQuad(B, brand, 0, 5.45, z, 5, 0.6, z > -15 ? 0 : Math.PI, 2.6);
  for (const x of [-5, 5]) { p.lay(WL.panel).col(196, 192, 186); p.box(x - 0.6, 0, -19.5, x + 0.6, 0.18, -12, 31); p.box(x - 0.2, 0.18, -15.95, x + 0.2, 5.2, -15.55, 15); for (const z of [-18, -13.5]) { p.lay(WL.plain).col(226, 226, 222); p.box(x - 0.4, 0.18, z - 0.3, x + 0.4, 1.9, z + 0.3, 31); p.col(190, 30, 30).box(x - 0.42, 1.55, z - 0.32, x + 0.42, 1.9, z + 0.32, 31); p.lay(WL.plain + METAL).col(20, 26, 30).box(x - 0.41, 1.05, z - 0.2, x + 0.41, 1.45, z + 0.2, 12); B.collide(x - 0.4, z - 0.3, x + 0.4, z + 0.3, 1.9, 'prop'); } }
  shopBox(B, { w: 17, d: 9, h: 4.3, rng: r, name: 'KETTER MART', signBg: '#c21d1d', signFg: '#ffffff', lay: WL.panel, col: [232, 228, 218], glass: 0.7, setback: 27, font: 0, signW: 6 }); glow(B, 0, 2.6, -26, 11, [0.9, 0.95, 1.0], 0.6, 0);
  const price = txt(T, 'price', 'KETTER GAS', { w: 512, h: 640, bg: '#c21d1d', fg: '#ffffff', font: 2, sub: 'REGULAR 3.89⁹   DIESEL 4.29⁹' });
  const px = 17.5, pz = -2.2; p.lay(WL.plain + METAL).col(96, 100, 104); p.cyl(px, pz, 0, 5, 0.18, 0.15, 8); p.lay(WL.plain).col(30, 30, 34); p.box(px - 1.25, 5, pz - 0.18, px + 1.25, 8.1, pz + 0.18, 63); for (const rt of [0, Math.PI]) signQuad(B, price, px, 6.55, pz + (rt ? -0.19 : 0.19), 2.4, 3.0, rt, 2.8); B.collide(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 8, 'pole'); glow(B, px, 6.5, pz, 9, RED, 0.3, 1.6);
  addAddress(T, C.side, B, [0, -26.4], 'shop', C.block.district, null, { name: 'Ketter Gas' });
}

function waterTower(T) {
  const x = -640, z = -772, B = ctx(T, x, z, 0.4), p = B.p; for (const m of [B.p, B.s]) m.frame(x, -0.1, z, 0.4);
  const R = 6.6, y0 = 23, y1 = 30.5; p.lay(WL.plain).col(206, 214, 216);
  p.cyl(0, 0, y0, y1, R, R, 22, 0); p.cyl(0, 0, y1, y1 + 2.4, R, 0.6, 22); p.cyl(0, 0, y0 - 2.6, y0, R * 0.45, R, 22, 0); p.cyl(0, 0, 0, y0 - 2.6, 0.9, 0.9, 10, 0);
  p.lay(WL.plain + METAL).col(170, 176, 178); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, a2 = (i + 1) / 6 * 6.283; p.tube(Math.cos(a) * 8.4, 0, Math.sin(a) * 8.4, Math.cos(a) * 5.9, y0, Math.sin(a) * 5.9, 0.22, 0.18, 6); for (const [ya, yb] of [[2, 11], [11, 20]]) { p.tube(Math.cos(a) * (8.4 - ya * 0.108), ya, Math.sin(a) * (8.4 - ya * 0.108), Math.cos(a2) * (8.4 - yb * 0.108), yb, Math.sin(a2) * (8.4 - yb * 0.108), 0.05, 0.05, 4); } }
  p.box(-R - 0.6, y0 - 0.1, -0.5, -R, y0, 0.5, 63);
  const name = txt(T, 'wtower', 'HALLORAN FALLS', { w: 1024, h: 160, bg: 'none', fg: '#1d3d6b', font: 1 });
  for (const a of [0, Math.PI]) signQuad(B, name, Math.sin(a) * (R + 0.05), (y0 + y1) / 2, Math.cos(a) * (R + 0.05), 9.4, 1.5, a, 0.35);
  T.colliders.add(x, z, 8.5, 8.5, 0, 30, 'building'); (T.glows = T.glows || []).push({ x, y: y1 + 2.6, z, r: 1, col: RED, a: 0.9, halo: 1.2 });
  T.places.watertower = { id: 'watertower', name: 'Halloran Falls water tower', kind: 'landmark', x, z, heading: 0, stop: { x: -640, z: -720 + 1.8, heading: Math.PI / 2 }, spot: { x: -640, z: -730 }, mapLabel: '' };
}

// Mid-span of Kessler Bridge: pull up in the eastbound kerb lane, patient on the sidewalk by the railing.
function kesslerBridge(T) {
  const br = T.bridges.find(b => b.id === 'kessler'); if (!br) return; const e = br.e, he = e.dir.x > 0 ? e.he[0] : e.he[1], rx = -he.dz, rz = he.dx;
  const off = e.median / 2 + (e.lanes - 0.5) * e.laneWidth;
  T.places.kessler = { id: 'kessler', name: 'Kessler Bridge, mid-span', kind: 'bridge', x: br.cx, z: br.cz, heading: Math.atan2(he.dx, he.dz), stop: { x: br.cx + rx * off, z: br.cz + rz * off, heading: Math.atan2(he.dx, he.dz) }, spot: { x: br.cx + rx * (e.width / 2 + 1.3) + he.dx * 3, z: br.cz + rz * (e.width / 2 + 1.3) + he.dz * 3 }, mapLabel: 'Kessler Bridge' };
}

// Riverside Park (and the skate park at its south end) on the west bank; promenades on the other river blocks.
function riverBanks(T) {
  const r = makeRng(T.seed + 404);
  for (const b of T.L.blocks) {
    if (!b.river) continue;
    const park = b.cz > 60 && b.cz < 560, bb = polyBounds(b.inner), B = { get d() { const m = T.chunks.get('decal', b.cx, b.cz); m._owner = null; return m.frame(0, KERB, 0, 0); } }, west = (x, z) => x < riverX(z) - riverHW(z) - 1.5 && pointInPoly(x, z, b.inner);
    const bankX = z => riverX(z) - riverHW(z);
    // promenade along the top of the west wall, with railing-side lamps and benches
    const z0 = bb.z0 + 6, z1 = bb.z1 - 6;
    for (let z = z0; z < z1 - 4; z += 8) { const xa = bankX(z) - 5.2, xb = bankX(z + 8) - 5.2; if (!west(xa - 2.5, z) || !west(xb - 2.5, z + 8)) continue; B.d.lay(GL.walk).col(236, 236, 230); B.d.gquad(xa - 1.6, z, xa + 1.6, z, xb + 1.6, z + 8, xb - 1.6, z + 8, 0.02, 0, z, 3.2, z, 3.2, z + 8, 0, z + 8); }
    for (let z = z0 + 10; z < z1 - 8; z += 34) { const x = bankX(z) - 7.6; if (!west(x - 1, z)) continue; T.parkLamps.push({ x, z, h: -Math.PI / 2 }); if (r.chance(0.8)) T.parkBenches.push({ x: bankX(z + 9) - 3.0, z: z + 9, h: Math.PI / 2 }); }
    const blocked = [];
    if (park) {
      // pond
      const pz = 300, px = bankX(pz) - 64, pa = 21, pb = 14, ring = [], water = []; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283, k = 1 + 0.12 * Math.sin(a * 3 + 1); ring.push([px + Math.cos(a) * (pa + 2.2) * k, pz + Math.sin(a) * (pb + 2.2) * k]); water.push([px + Math.cos(a) * pa * k, pz + Math.sin(a) * pb * k]); }
      B.d.lay(GL.gravel).col(196, 186, 168); B.d.poly(ring, 0.02, true); T.ponds.push(water); T.waters.push(water); T.surf.fill(water, 5); blocked.push([px, pz, pa + 6]);
      for (let i = 0; i < 16; i++) { const a = r() * 6.283; T.reeds.push({ x: px + Math.cos(a) * (pa + 0.6), z: pz + Math.sin(a) * (pb + 0.6), s: r.r(0.8, 1.4) }); }
      // loop path from the drive round the pond and up to the promenade
      const path = (pts, wd = 2.4) => { for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], c = pts[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]), nx = -(c[1] - a[1]) / L * wd / 2, nz = (c[0] - a[0]) / L * wd / 2; B.d.lay(GL.walk).col(232, 232, 226); B.d.gquad(a[0] - nx, a[1] - nz, c[0] - nx, c[1] - nz, c[0] + nx, c[1] + nz, a[0] + nx, a[1] + nz, 0.021, 0, 0, L, 0, L, wd, 0, wd); } };
      const loop = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * 6.283; loop.push([px + Math.cos(a) * (pa + 7), pz + Math.sin(a) * (pb + 7)]); } path(loop);
      const rdx = bb.x0 + 1; path([[rdx, 262], [px - pa - 7, 290]]); path([[px + pa + 7, 300], [bankX(300) - 5.2, 300]]); path([[rdx, 150], [bankX(190) - 5.2, 190]]); path([[rdx, 400], [bankX(385) - 5.2, 385]]);
      // bandstand
      const gx = bankX(190) - 38, gz = 196, G = ctx(T, gx, gz, 0), gp = G.p; gp.lay(WL.panel).col(200, 196, 188); gp.cyl(0, 0, 0, 0.6, 4.6, 4.6, 8); gp.lay(WL.plain).col(238, 236, 230); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; gp.cyl(Math.cos(a) * 4.1, Math.sin(a) * 4.1, 0.6, 3.5, 0.09, 0.09, 6, 0); }
      gp.lay(WL.shingle).col(170, 200, 185); gp.cyl(0, 0, 3.5, 5.6, 5.1, 0.3, 8); gp.lay(WL.plain).col(238, 236, 230); gp.cyl(0, 0, 3.3, 3.5, 5.0, 5.0, 8, 2); T.colliders.add(gx, gz, 4.6, 4.6, 0, 0.6, 'barrier'); blocked.push([gx, gz, 8]); T.glows.push({ x: gx, y: KERB + 3.2, z: gz, r: 10, col: [1, 0.8, 0.5], a: 0.5, halo: 0.8 });
      // skate park
      const sx = bankX(452) - 58, sz = 452, S = ctx(T, sx, sz, 0.12), sp = S.p; lot(S, -17, -10, 17, 10, GL.concrete, [226, 224, 218], 0.02); blocked.push([sx, sz, 21]);
      sp.lay(WL.panel).col(206, 204, 198);
      // quarter pipes at both ends, a fun box, a rail, a low ledge
      for (const dir of [-1, 1]) { const xe = dir * 16.5, N = 5, R = 2.3; for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI / 2, a1 = (i + 1) / N * Math.PI / 2, xa = xe - dir * (R - Math.sin(a0) * R) - dir * 0, xb = xe - dir * (R - Math.sin(a1) * R), ya = R - Math.cos(a0) * R, yb = R - Math.cos(a1) * R; if (dir > 0) sp.quad(xa, ya, 8, xa, ya, -8, xb, yb, -8, xb, yb, 8, 0, 0); else sp.quad(xa, ya, -8, xa, ya, 8, xb, yb, 8, xb, yb, -8, 0, 0); } sp.box(Math.min(xe, xe + dir * 1.2), 0, -8, Math.max(xe, xe + dir * 1.2), R, 8, 63); S.collide(Math.min(xe, xe + dir * 1.2), -8, Math.max(xe, xe + dir * 1.2), 8, R, 'barrier'); }
      sp.box(-3, 0, -1.6, 3, 0.55, 1.6, 31); sp.quad(-6, 0.01, 1.6, -6, 0.01, -1.6, -3, 0.55, -1.6, -3, 0.55, 1.6, 0, 0); sp.quad(6, 0.01, -1.6, 6, 0.01, 1.6, 3, 0.55, 1.6, 3, 0.55, -1.6, 0, 0); S.collide(-3, -1.6, 3, 1.6, 0.55, 'barrier');
      sp.box(-8, 0, 6, -1, 0.4, 6.6, 31); sp.lay(WL.plain + METAL).col(170, 174, 176); sp.tube(2, 0.5, 6, 9, 0.5, 6, 0.04); sp.tube(2, 0, 6, 2, 0.5, 6, 0.04); sp.tube(9, 0, 6, 9, 0.5, 6, 0.04);
      chainFence(S, -17.5, -10.5, 17.5, -10.5, 1.5); chainFence(S, 17.5, -10.5, 17.5, 10.5, 1.5); T.glows.push({ x: sx, y: KERB + 7, z: sz, r: 24, col: COOL, a: 0.4, halo: 0 });
      // places
      const sd = z => b.sides.filter(s => s.e.name === 'Riverside Dr').reduce((a, c) => Math.abs((c.i0[1] + c.i1[1]) / 2 - z) < Math.abs((a.i0[1] + a.i1[1]) / 2 - z) ? c : a);
      const mk = (id, name, x, z, spot, label) => { const side = sd(z), ks = kerbStop(T, side.he, (side.i0[0] + side.i1[0]) / 2, z); T.places[id] = { id, name, kind: 'park', x, z, heading: 0, stop: ks.stop, spot: spot || ks.spot, mapLabel: label }; };
      mk('riverpark', 'Riverside Park', px, pz, { x: px - pa - 8, z: 289 }, 'Riverside Park'); mk('skatepark', 'Riverside skate park', sx, sz, { x: sx - 18.5, z: sz + 2 }, 'Skate park');
      T.greens.push(b.inner.filter(q => q[0] < riverX(q[1])).concat([[bankX(bb.z1), bb.z1], [bankX(300), 300], [bankX(bb.z0), bb.z0]]));
    }
    // trees: clustered on the west bank lawns, sparse on the east embankment
    const n = Math.round(b.area / (park ? 260 : 420));
    for (let i = 0; i < n * 3 && i < 900; i++) {
      const x = r.r(bb.x0 + 3, bb.x1 - 3), z = r.r(bb.z0 + 3, bb.z1 - 3), w = west(x, z), e = !w && x > riverX(z) + riverHW(z) + 2.5 && pointInPoly(x, z, b.inner);
      if (!w && !e) continue; if (w && Math.abs(x - (bankX(z) - 5.2)) < 3.2) continue; if (blocked.some(q => Math.hypot(x - q[0], z - q[1]) < q[2])) continue; if (i > n && !park) break; if (e && r.chance(0.6)) continue;
      if (T.surf.at(x, z) !== 1) continue;
      T.trees.push({ x, z, kind: r.pick(park ? ['maple', 'oak', 'alder', 'maple', 'birch', 'cedar', 'fir', 'oak'] : ['alder', 'alder', 'birch', 'cedar', 'maple']), s: r.r(0.85, 1.45) });
      if (T.trees.length % 3 === 0 && park) T.trees.push({ x: x + r.r(-3, 3), z: z + r.r(-3, 3), kind: 'bush', s: r.r(0.8, 1.6), noCollide: true });
    }
  }
}

export function buildPlaces(T) {
  T.glows = T.glows || []; T.ponds = []; T.reeds = []; T.parkLamps = []; T.parkBenches = [];
  for (const b of T.L.blocks) b.used = b.used || [];
  station4(T);
  hospital(T, 'general', { pt: [-575, -170], street: 'Kessler St', near: [-575, -70], w: 104, d: 150, seed: 2, edX: -30, mainX: 14, name: 'Halloran General Hospital', short: 'Halloran General', signName: 'HALLORAN GENERAL HOSPITAL' });
  hospital(T, 'regional', { pt: [735, 20], street: 'Kessler St', near: [735, -70], w: 262, d: 168, seed: 3, edX: 74, mainX: -36, big: true, parkX: -98, heliX: 96, name: 'St. Brigid Regional Medical Center', short: 'St. Brigid Regional', signName: 'ST. BRIGID REGIONAL MEDICAL CENTER' });
  ironworks(T); harbor(T); anchor(T); riverview(T); cascade(T); pinecrest(T); stmarks(T); depot(T); construction(T); market(T); motel(T);
  school(T, 'maplewood', { pt: [-400, -660], street: 'Maple St', near: [-385, -600], w: 124, d: 96, seed: 5, name: 'Maplewood Elementary School', sign: 'MAPLEWOOD', sub: 'ELEMENTARY SCHOOL   ·   HOME OF THE OTTERS', label: 'Maplewood Elementary' });
  school(T, 'highschool', { pt: [-965, -170], street: 'Alder St', near: [-900, -170], w: 176, d: 108, seed: 6, high: true, name: 'Halloran Falls High School', sign: 'HALLORAN FALLS HIGH', sub: 'HOME OF THE TIMBERWOLVES', label: 'Halloran Falls High' });
  civic(T, 'library', { pt: [-315, -220], street: 'Court St', w: 52, d: 46, seed: 71, bw: 34, bd: 22, bh: 10.2, set: 10, cols: 6, name: 'Halloran Falls Public Library', sign: 'PUBLIC LIBRARY', sub: 'HALLORAN FALLS', frieze: 'HALLORAN FALLS PUBLIC LIBRARY  ·  MCMXII', label: 'Library' });
  civic(T, 'courthouse', { pt: [-185, -220], street: 'Court St', w: 78, d: 70, seed: 72, bw: 46, bd: 30, bh: 14, set: 17, cols: 8, dome: true, name: 'Ketter County Courthouse', sign: 'KETTER COUNTY COURTHOUSE', sub: 'SUPERIOR COURT  ·  COUNTY CLERK  ·  SHERIFF', frieze: 'KETTER COUNTY COURTHOUSE', label: 'Courthouse' });
  gasStation(T, [-300, 605], 'Halloran Ave', [-510, 612], 81); gasStation(T, [760, 580], 'Tannery Rd', [590, 590], 82);
  brennan(T); kesslerBridge(T); waterTower(T); riverBanks(T);
}
