// Interior sets: procedural texture library and the shared material palette.
// Everything here is generated once, lazily, and cached at module level so all sets share it (textures and materials
// are flagged userData.shared so a set's dispose() leaves them alone).
//
// Tiling textures are built per pixel from one tileable noise field (NZ) so they are cheap; signs, pictures, screens,
// neon and window backdrops are drawn with canvas 2D into packed atlases (ATLAS.<name>.rect.<id> = [u0,v0,u1,v1]).
// Materials are vertex-coloured: one "wood", "fabric", "paint"... material serves every tint, which keeps a whole
// room to a few dozen draw calls. `userData.tile` is the size in metres of one texture repeat (the kit box-maps UVs).

import * as THREE from 'three';
import { makeCanvas, canvasTex, heightToNormal, fbm2, hash2, makeRng, clamp, TAU } from './util.js';
import { U } from './gfx.js';
const U_TIME = U.uTime;

// ------------------------------------------------------------------ noise base
const N = 512; let NZ = null, WN = null;
function base() {
  if (NZ) return;
  NZ = new Float32Array(N * N); WN = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { NZ[y * N + x] = fbm2(x / N * 8, y / N * 8, 4, 7, 8); WN[y * N + x] = hash2(x, y, 3); }
}
const nz = (x, y) => NZ[((y & 511) << 9) | (x & 511)];
const wn = (x, y) => WN[((y & 511) << 9) | (x & 511)];
// bilinear, float coords (wraps every 512)
function nzf(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const a = nz(xi, yi), b = nz(xi + 1, yi), c = nz(xi, yi + 1), d = nz(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

const TC = {};
const cached = (key, fn) => TC[key] || (TC[key] = fn());
const share = t => { t.userData.shared = true; return t; };

// Per-pixel generator: f(x, y, o) fills o.r/g/b (sRGB 0..1), o.h (height), o.ro (roughness). `src` preloads rgb from a canvas.
function gen(n, f, { nstr = 2, src = null, aniso = 8, rough = true } = {}) {
  base();
  const ca = makeCanvas(n), xa = ca.getContext('2d'), ia = xa.createImageData(n, n), da = ia.data;
  const sd = src ? src.getContext('2d').getImageData(0, 0, n, n).data : null;
  const cr = makeCanvas(n), xr = cr.getContext('2d'), ir = xr.createImageData(n, n), dr = ir.data;
  const H = new Float32Array(n * n), o = { r: 0, g: 0, b: 0, h: 0, ro: 0.6 };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, j = i * 4;
    if (sd) { o.r = sd[j] / 255; o.g = sd[j + 1] / 255; o.b = sd[j + 2] / 255; }
    o.h = 0; o.ro = 0.6; f(x, y, o);
    da[j] = clamp(o.r) * 255; da[j + 1] = clamp(o.g) * 255; da[j + 2] = clamp(o.b) * 255; da[j + 3] = 255;
    const rv = clamp(o.ro) * 255; dr[j] = dr[j + 1] = dr[j + 2] = rv; dr[j + 3] = 255; H[i] = o.h;
  }
  xa.putImageData(ia, 0, 0); xr.putImageData(ir, 0, 0);
  const out = { map: share(canvasTex(ca, { aniso })), normalMap: share(canvasTex(heightToNormal(H, n, nstr), { srgb: false, aniso })) };
  if (rough) out.roughnessMap = share(canvasTex(cr, { srgb: false, aniso }));
  return out;
}

// ------------------------------------------------------------------ tiling surfaces
export const TEX = {
  // floorboards running along U; 8 boards per repeat (tile 1.6 m -> 0.2 m boards)
  planks: () => cached('planks', () => {
    const n = 1024, B = 8, bw = n / B;
    return gen(n, (x, y, o) => {
      const j = Math.floor(y / bw), fy = y - j * bw;
      const off = hash2(j, 1, 5) * n, xs = (x + off) % n;
      const seg = xs < hash2(j, 2, 5) * n * 0.6 + n * 0.2 ? 0 : 1;
      const jx = seg ? hash2(j, 2, 5) * n * 0.6 + n * 0.2 : 0;
      const tone = 0.82 + 0.3 * hash2(j, seg, 9), warm = hash2(j, seg, 11) - 0.5;
      const g1 = nzf(x * 0.5 + j * 91, y * 12 + seg * 300), g2 = nzf(x * 0.5 + j * 40, y * 3.0 + 77);
      const ring = 0.5 + 0.5 * Math.sin((g2 * 9 + fy * 0.11) * TAU);
      const gap = Math.min(fy, bw - fy), end = Math.abs(xs - jx), e = Math.min(gap, end < 1.5 ? 0 : 99);
      const gp = sstep(0.6, 2.4, e);
      const v = tone * (0.74 + 0.22 * g1 + 0.1 * ring) * (0.35 + 0.65 * gp);
      o.r = 0.70 * v * (1 + warm * 0.08); o.g = 0.50 * v; o.b = 0.31 * v * (1 - warm * 0.12);
      o.h = gp * 0.8 + g1 * 0.12 + ring * 0.04; o.ro = 0.36 + 0.2 * g1 + (1 - gp) * 0.5;
    }, { nstr: 2.2, aniso: 16 });
  }),
  // straight furniture grain along U, light so vertex colour sets the species
  grain: () => cached('grain', () => gen(512, (x, y, o) => {
    const g1 = nzf(x, y * 14), g2 = nzf(x + 190, y * 3 + 55), ring = 0.5 + 0.5 * Math.sin((g2 * 11 + y * 0.012) * TAU);
    const v = 0.72 + 0.2 * g1 + 0.1 * ring;
    o.r = v; o.g = v * 0.96; o.b = v * 0.9; o.h = g1 * 0.3 + ring * 0.1; o.ro = 0.4 + 0.25 * g1;
  }, { nstr: 1.0 })),
  carpet: () => cached('carpet', () => gen(256, (x, y, o) => {
    const a = wn(x, y), b = nz(x * 6, y * 6), c = nz(x * 2 + 40, y * 2);
    const v = 0.72 + (a - 0.5) * 0.34 + (b - 0.5) * 0.3 + (c - 0.5) * 0.14;
    o.r = o.g = o.b = v; o.h = a * 0.7 + b * 0.8; o.ro = 1;
  }, { nstr: 2.6, rough: false })),
  carpetTile: () => cached('carpetTile', () => gen(512, (x, y, o) => {
    const tx = x >> 8, ty = y >> 8, dir = (tx + ty) & 1;
    const s = dir ? nzf(x * 1, y * 24) : nzf(x * 24, y * 1), a = wn(x, y);
    const fx = x & 255, fy = y & 255, e = Math.min(fx, 255 - fx, fy, 255 - fy), sm = sstep(0, 2, e);
    const v = (0.62 + (s - 0.5) * 0.3 + (a - 0.5) * 0.22 + (dir ? 0.04 : -0.03)) * (0.6 + 0.4 * sm);
    o.r = v * 0.86; o.g = v * 0.92; o.b = v * 1.02; o.h = a * 0.5 + s * 0.6 + sm * 0.6; o.ro = 1;
  }, { nstr: 2.2, rough: false })),
  // elderly patterned Axminster: drawn motif + fibre noise
  carpetPattern: () => cached('carpetPattern', () => {
    const n = 512, c = makeCanvas(n), x = c.getContext('2d');
    x.fillStyle = '#5a1c22'; x.fillRect(0, 0, n, n);
    const motif = (cx, cy, s) => {
      x.save(); x.translate(cx, cy);
      for (let k = 0; k < 8; k++) { x.rotate(TAU / 8); x.fillStyle = k & 1 ? '#b8924a' : '#22304e'; x.beginPath(); x.ellipse(0, -s * 0.52, s * 0.13, s * 0.3, 0, 0, TAU); x.fill(); }
      x.fillStyle = '#d9c9a0'; x.beginPath(); x.arc(0, 0, s * 0.2, 0, TAU); x.fill();
      x.fillStyle = '#8a2c30'; x.beginPath(); x.arc(0, 0, s * 0.11, 0, TAU); x.fill();
      x.strokeStyle = '#3d5a3a'; x.lineWidth = s * 0.05; x.beginPath(); x.arc(0, 0, s * 0.92, 0, TAU); x.stroke();
      x.restore();
    };
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) { motif(i * 256 + 128, j * 256 + 128, 92); motif(i * 256, j * 256, 46); }
    x.strokeStyle = '#b8924a'; x.lineWidth = 3;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(i * 128 + 64, j * 128 + 64, 9, 0, TAU); x.stroke(); }
    return gen(n, (px, py, o) => {
      const a = wn(px, py), b = nz(px * 6, py * 6), k = 0.78 + (a - 0.5) * 0.4 + (b - 0.5) * 0.3;
      o.r *= k; o.g *= k; o.b *= k; o.h = a * 0.7 + b * 0.8; o.ro = 1;
    }, { src: c, nstr: 2.4, rough: false });
  }),
  // ceramic/vinyl tile grid. key picks a preset below.
  tiles: (key) => cached('tiles_' + key, () => {
    const P = TILE_PRESETS[key], n = P.n || 512, nx = P.nx, ny = P.ny, cw = n / nx, ch = n / ny, g = P.grout, bev = P.bevel || 2;
    return gen(n, (x, y, o) => {
      const ty = Math.floor(y / ch), xo = P.bond && (ty & 1) ? x + cw / 2 : x, tx = Math.floor(xo / cw) % nx;
      const fx = xo - Math.floor(xo / cw) * cw, fy = y - ty * ch, e = Math.min(fx, cw - fx, fy, ch - fy);
      const t = sstep(g, g + bev, e), hv = hash2(tx, ty, P.seed || 1);
      let col = P.col; if (P.col2 && ((tx + ty) & 1)) col = P.col2;
      const sp = P.speck ? (wn(x, y) > 0.86 ? -P.speck : wn(x + 9, y) > 0.9 ? P.speck * 0.6 : 0) : 0;
      const cl = (nz(x * 2, y * 2) - 0.5) * (P.cloud || 0.04) + (hv - 0.5) * (P.vary || 0.05) + sp + (P.face ? (nz(x * 9, y * 9) - 0.5) * P.face : 0);
      const dirt = 1 - (1 - sstep(0, cw * 0.3, e)) * (P.dirt || 0) * nz(x * 3 + 31, y * 3);
      const gc = P.groutCol, gn = 0.9 + 0.2 * wn(x, y);
      o.r = (gc[0] * gn) * (1 - t) + (col[0] + cl) * dirt * t; o.g = (gc[1] * gn) * (1 - t) + (col[1] + cl) * dirt * t; o.b = (gc[2] * gn) * (1 - t) + (col[2] + cl) * dirt * t;
      o.h = t * (P.depth || 1) + (hv - 0.5) * 0.06 * t + (P.face ? nz(x * 9, y * 9) * P.face * 2 : 0) + wn(x, y) * (P.grain || 0);
      o.ro = (1 - t) * 0.95 + t * (P.rough + (nz(x * 4, y * 4) - 0.5) * 0.12 + (P.face ? nz(x * 9, y * 9) * 0.2 : 0));
    }, { nstr: P.nstr || 2.5, aniso: 16 });
  }),
  plaster: () => cached('plaster', () => gen(512, (x, y, o) => {
    const lo = nz(x, y), mid = nz(x * 4 + 13, y * 4), hi = nz(x * 16, y * 16), w = wn(x, y);
    const v = 0.9 + (lo - 0.5) * 0.07 + (mid - 0.5) * 0.03;
    o.r = o.g = o.b = v; o.h = lo * 1.2 + mid * 0.35 + hi * 0.22 + w * 0.05; o.ro = 0.86 + (mid - 0.5) * 0.1;
  }, { nstr: 1.5 })),
  popcorn: () => cached('popcorn', () => gen(256, (x, y, o) => {
    const a = nz(x * 16, y * 16), b = nz(x * 32 + 5, y * 32), w = wn(x, y);
    const v = 0.86 + (a - 0.5) * 0.14; o.r = o.g = o.b = v; o.h = a * 1.2 + b * 0.8 + w * 0.3; o.ro = 0.95;
  }, { nstr: 3, rough: false })),
  wallpaper: (kind) => cached('wallpaper_' + kind, () => {
    const n = 512, c = makeCanvas(n), x = c.getContext('2d');
    if (kind === 'stripe') {
      x.fillStyle = '#e9e2d2'; x.fillRect(0, 0, n, n);
      for (let i = 0; i < 8; i++) { x.fillStyle = '#d5d9c6'; x.fillRect(i * 64 + 8, 0, 26, n); x.fillStyle = '#c3b99a'; x.fillRect(i * 64 + 4, 0, 2, n); x.fillRect(i * 64 + 36, 0, 2, n); }
    } else if (kind === 'damask') {
      x.fillStyle = '#e4d6bf'; x.fillRect(0, 0, n, n);
      const m = (cx, cy) => {
        x.save(); x.translate(cx, cy); x.fillStyle = '#cdb994';
        for (const s of [1, -1]) { x.save(); x.scale(s, 1);
          x.beginPath(); x.moveTo(0, -84); x.bezierCurveTo(34, -64, 54, -30, 26, 0); x.bezierCurveTo(60, 20, 40, 66, 0, 84); x.bezierCurveTo(8, 50, 6, 20, 0, 0); x.bezierCurveTo(10, -30, 8, -60, 0, -84); x.fill();
          x.beginPath(); x.ellipse(48, -72, 9, 20, 0.7, 0, TAU); x.fill(); x.beginPath(); x.ellipse(52, 62, 8, 18, -0.7, 0, TAU); x.fill(); x.restore(); }
        x.fillStyle = '#e4d6bf'; x.beginPath(); x.ellipse(0, 0, 6, 26, 0, 0, TAU); x.fill();
        x.restore();
      };
      for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) { m(i * 256 + 64, j * 256 + 96); m(i * 256 + 192, j * 256 + 224); }
    } else if (kind === 'floral') {
      x.fillStyle = '#e8dccb'; x.fillRect(0, 0, n, n); const r = makeRng(41);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const cx = i * 128 + (j & 1 ? 64 : 0) + 30, cy = j * 128 + 50;
        for (const [dx, dy] of [[0, 0], [n, 0], [0, n], [-n, 0], [0, -n]]) {
          x.save(); x.translate(cx + dx, cy + dy); x.rotate(r() * 0.01 + (i + j) * 0.7);
          x.strokeStyle = '#93a380'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(20, 30, 4, 62); x.stroke();
          x.fillStyle = '#93a380'; x.beginPath(); x.ellipse(16, 30, 6, 14, 0.8, 0, TAU); x.fill(); x.beginPath(); x.ellipse(-6, 44, 6, 13, -0.6, 0, TAU); x.fill();
          for (let k = 0; k < 5; k++) { x.rotate(TAU / 5); x.fillStyle = (i + j) & 1 ? '#c98f96' : '#d7a877'; x.beginPath(); x.ellipse(0, -11, 7, 10, 0, 0, TAU); x.fill(); }
          x.fillStyle = '#e9d27c'; x.beginPath(); x.arc(0, 0, 5, 0, TAU); x.fill(); x.restore();
        }
      }
    } else { // motel: dated lattice
      x.fillStyle = '#d6c7a6'; x.fillRect(0, 0, n, n); x.strokeStyle = '#b89f72'; x.lineWidth = 5;
      for (let j = -1; j <= 8; j++) for (let i = -1; i <= 8; i++) { x.beginPath(); x.arc(i * 64 + (j & 1 ? 32 : 0), j * 64, 30, 0, TAU); x.stroke(); }
      x.fillStyle = '#a8804e'; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(i * 64 + (j & 1 ? 32 : 0), j * 64, 5, 0, TAU); x.fill(); }
    }
    return gen(n, (px, py, o) => {
      const f = nzf(px * 1, py * 20), w = wn(px, py), lo = nz(px, py), sx = px & 255, seam = sx < 2 ? 1 : sx < 5 ? 0.35 : 0, k = (0.95 + (f - 0.5) * 0.08 + (w - 0.5) * 0.05 + (lo - 0.5) * 0.06) * (1 - seam * 0.1);
      o.h = f * 0.3 + w * 0.12 + (o.r + o.g + o.b) * 0.12 - seam * 0.5 + (sx > 4 && sx < 12 ? 0.12 : 0); o.r *= k; o.g *= k; o.b *= k; o.ro = 0.8 + (f - 0.5) * 0.1;
    }, { src: c, nstr: 1.3 });
  }),
  concrete: () => cached('concrete', () => gen(1024, (x, y, o) => {
    const lo = nzf(x * 0.5, y * 0.5), mid = nz(x * 2 + 100, y * 2), hi = nz(x * 8, y * 8), w = wn(x, y);
    const cr1 = Math.abs(nzf(x * 0.125 + 300, y * 0.125 + 170) - 0.5), mask = sstep(0.56, 0.66, nzf(x * 0.25 + 41, y * 0.25 + 400));
    const crack = (1 - sstep(0.0, 0.0012, cr1)) * mask * 0.45;
    const pore = w > 0.992 ? 1 : 0, trow = nzf(x * 0.5, y * 4);
    let v = 0.47 + (lo - 0.5) * 0.3 + (mid - 0.5) * 0.14 + (hi - 0.5) * 0.08 + (trow - 0.5) * 0.05 + (w - 0.5) * 0.04;
    v *= 1 - crack * 0.55 - pore * 0.4;
    o.r = v * 1.01; o.g = v; o.b = v * 0.97; o.h = lo * 0.5 + hi * 0.25 + w * 0.08 - crack * 1.5 - pore * 1.2; o.ro = 0.72 + (mid - 0.5) * 0.3 - (lo - 0.5) * 0.2;
  }, { nstr: 2.2, aniso: 16 })),
  rubber: () => cached('rubber', () => gen(512, (x, y, o) => {
    const w = wn(x, y), w2 = wn(x + 77, y + 31), b = nz(x * 8, y * 8);
    const fx = x & 255, fy = y & 255, e = Math.min(fx, 255 - fx, fy, 255 - fy), sm = sstep(0, 1.6, e);
    let v = 0.085 + (b - 0.5) * 0.03 + (w - 0.5) * 0.03, r = v, g = v, bl = v * 1.05;
    if (w2 > 0.955) { const k = 0.25 + w * 0.3; r = 0.35 * k + v; g = 0.5 * k + v; bl = 0.85 * k + v; }
    else if (w2 < 0.03) { r = g = bl = 0.3 + w * 0.2; }
    o.r = r * (0.5 + 0.5 * sm); o.g = g * (0.5 + 0.5 * sm); o.b = bl * (0.5 + 0.5 * sm); o.h = w * 0.5 + b * 0.5 + sm * 0.8; o.ro = 0.78 + (b - 0.5) * 0.2;
  }, { nstr: 1.6 })),
  brushed: () => cached('brushed', () => gen(256, (x, y, o) => {
    const s = nzf(x * 2, y * 62), s2 = nzf(x * 2 + 50, y * 15 + 9);
    const v = 0.86 + (s - 0.5) * 0.2; o.r = o.g = o.b = v; o.h = s * 0.5 + s2 * 0.3; o.ro = 0.3 + (s - 0.5) * 0.3 + (s2 - 0.5) * 0.14;
  }, { nstr: 0.7 })),
  fabric: () => cached('fabric', () => gen(256, (x, y, o) => {
    const W = 48, a = Math.sin(x * TAU * W / 256), b = Math.sin(y * TAU * W / 256), we = a * b * 0.5 + 0.5, tw = Math.sin((x + y) * TAU * W / 512) * 0.5 + 0.5;
    const nn = nz(x * 4, y * 4), w = wn(x, y), v = 0.78 + we * 0.12 + (nn - 0.5) * 0.14 + (w - 0.5) * 0.1;
    o.r = o.g = o.b = v; o.h = we * 0.7 + tw * 0.3 + w * 0.25; o.ro = 0.95;
  }, { nstr: 1.8, rough: false })),
  leather: () => cached('leather', () => gen(256, (x, y, o) => {
    const a = nz(x * 8, y * 8), b = nz(x * 16 + 7, y * 16 + 3), rdg = 1 - Math.abs(2 * a - 1), rd2 = 1 - Math.abs(2 * b - 1);
    const crease = Math.pow(rdg, 6) * 0.8 + Math.pow(rd2, 8) * 0.4, lo = nz(x * 2, y * 2);
    const v = 0.86 + (lo - 0.5) * 0.12 - crease * 0.12; o.r = o.g = o.b = v; o.h = -crease + lo * 0.2; o.ro = 0.42 + crease * 0.3 + (lo - 0.5) * 0.15;
  }, { nstr: 1.4 })),
  ceilTile: () => cached('ceilTile', () => gen(256, (x, y, o) => {
    const e = Math.min(x, 255 - x, y, 255 - y), w = wn(x, y), fz = nz(x * 12, y * 3), bar = e < 5 ? 1 : 0;
    const pin = w > 0.93 ? 1 : 0, fis = fz > 0.66 && wn(x + 3, y + 9) > 0.5 ? 1 : 0;
    const v = bar ? 0.88 : 0.82 - pin * 0.3 - fis * 0.18 + (nz(x * 2, y * 2) - 0.5) * 0.05;
    o.r = o.g = o.b = v; o.h = bar ? 0.2 : 1 - pin * 0.9 - fis * 0.5; o.ro = bar ? 0.4 : 0.95;
  }, { nstr: 2.0 })),
  pegboard: () => cached('pegboard', () => gen(256, (x, y, o) => {
    const fx = (x & 31) - 16, fy = (y & 31) - 16, d = Math.hypot(fx, fy), hole = 1 - sstep(3, 4.5, d);
    const g = nzf(x * 2, y * 20), v = 0.62 + (g - 0.5) * 0.1 + (nz(x, y) - 0.5) * 0.08;
    o.r = v * (1 - hole * 0.9); o.g = v * 0.8 * (1 - hole * 0.9); o.b = v * 0.56 * (1 - hole * 0.9); o.h = 1 - hole * 1.5 + g * 0.1; o.ro = 0.75;
  }, { nstr: 2.0 })),
  bedspread: () => cached('bedspread', () => {
    const n = 512, c = makeCanvas(n), x = c.getContext('2d'); x.fillStyle = '#2f5c5e'; x.fillRect(0, 0, n, n);
    for (let j = -1; j <= 4; j++) for (let i = -1; i <= 4; i++) {
      const cx = i * 128 + (j & 1 ? 64 : 0), cy = j * 128;
      x.save(); x.translate(cx, cy); x.fillStyle = '#7c2f3c';
      for (let k = 0; k < 6; k++) { x.rotate(TAU / 6); x.beginPath(); x.ellipse(0, -22, 10, 18, 0, 0, TAU); x.fill(); }
      x.fillStyle = '#c9a25a'; x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill();
      x.fillStyle = '#3f7d6c'; x.beginPath(); x.ellipse(40, 40, 8, 20, 0.8, 0, TAU); x.fill(); x.beginPath(); x.ellipse(-40, 40, 8, 20, -0.8, 0, TAU); x.fill(); x.restore();
    }
    return gen(n, (px, py, o) => {
      const d1 = Math.abs(((px + py) & 127) - 64), d2 = Math.abs(((px - py) & 127) - 64), q = sstep(0, 5, Math.min(d1, d2));
      const w = wn(px, py), a = nz(px * 8, py * 8), k = (0.84 + (w - 0.5) * 0.14 + (a - 0.5) * 0.12) * (0.82 + 0.18 * q);
      o.r *= k; o.g *= k; o.b *= k; o.h = q * 1.4 + Math.sin(sstep(0, 64, Math.min(d1, d2)) * Math.PI) * 0.8 + w * 0.2; o.ro = 0.8 - a * 0.25;
    }, { src: c, nstr: 1.6 });
  }),
  corrugated: () => cached('corrugated', () => gen(128, (x, y, o) => {
    const s = Math.sin(y * TAU * 4 / 128), g = nzf(x * 4, y * 0.5 * 4), v = 0.78 + s * 0.05 + (g - 0.5) * 0.08;
    o.r = o.g = o.b = v; o.h = s * 3.0; o.ro = 0.45 + (g - 0.5) * 0.3;
  }, { nstr: 2.4 })),
  lino: () => cached('lino', () => gen(512, (x, y, o) => {
    const w = wn(x, y), w2 = wn(x + 91, y + 17), lo = nz(x, y), mid = nz(x * 4, y * 4);
    let v = 0.74 + (lo - 0.5) * 0.08 + (mid - 0.5) * 0.05, r = v, g = v, b = v;
    if (w > 0.9) { r = g = b = v - 0.16; } else if (w2 > 0.92) { r = v + 0.1; g = v + 0.08; b = v; } else if (w2 < 0.06) { r = v - 0.08; g = v - 0.02; b = v + 0.04; }
    o.r = r; o.g = g; o.b = b; o.h = lo * 0.3 + w * 0.05; o.ro = 0.38 + (mid - 0.5) * 0.25 + (lo - 0.5) * 0.2;
  }, { nstr: 0.8 })),
  // wiped, handled paintwork and plastic: roughness that wanders, wipe streaks, the odd glossy touch; very fine orange peel
  smear: () => cached('smear', () => gen(512, (x, y, o) => {
    const lo = nz(x, y), mid = nz(x * 3 + 60, y * 3 + 11), wipe = nzf(x * 0.7 + 200, y * 9), wipe2 = nzf(x * 7 + 31, y * 0.9 + 90), w = wn(x, y), touch = sstep(0.7, 0.82, nz(x * 2 + 300, y * 2 + 140));
    o.r = o.g = o.b = 1; o.h = w * 0.5 + nz(x * 24, y * 24) * 0.5; o.ro = clamp(0.84 + (lo - 0.5) * 0.22 + (mid - 0.5) * 0.12 + (wipe - 0.5) * 0.1 + (wipe2 - 0.5) * 0.07 - touch * 0.2, 0.45, 1);
  }, { nstr: 0.6 })),
  cork: () => cached('cork', () => gen(256, (x, y, o) => {
    const a = nz(x * 8, y * 8), b = nz(x * 16 + 11, y * 16), w = wn(x, y), v = 0.5 + (a - 0.5) * 0.35 + (b - 0.5) * 0.25 + (w - 0.5) * 0.12;
    o.r = v * 1.12; o.g = v * 0.8; o.b = v * 0.5; o.h = a + b * 0.6; o.ro = 0.95;
  }, { nstr: 1.8, rough: false })),
};

const TILE_PRESETS = {
  // square floor tile 0.3 m (tile 1.2 m)
  floorStone: { nx: 4, ny: 4, grout: 2.5, bevel: 3, col: [0.63, 0.6, 0.55], groutCol: [0.34, 0.33, 0.31], rough: 0.42, cloud: 0.12, vary: 0.07, dirt: 0.25, n: 1024, nstr: 3 },
  floorWhite: { nx: 4, ny: 4, grout: 2.5, bevel: 3, col: [0.8, 0.8, 0.78], groutCol: [0.42, 0.41, 0.39], rough: 0.2, cloud: 0.05, vary: 0.03, dirt: 0.3, n: 1024, nstr: 3 },
  // wall tiles
  wallWhite: { nx: 4, ny: 4, grout: 2, bevel: 5, col: [0.9, 0.9, 0.88], groutCol: [0.62, 0.61, 0.58], rough: 0.12, cloud: 0.02, vary: 0.02, dirt: 0.12, nstr: 3.5 },
  subway: { nx: 4, ny: 8, grout: 1.5, bevel: 4, bond: true, col: [0.9, 0.9, 0.87], groutCol: [0.68, 0.67, 0.64], rough: 0.12, cloud: 0.02, vary: 0.03, dirt: 0.1, nstr: 3.5 },
  chequer: { nx: 2, ny: 2, grout: 1.2, bevel: 1.5, col: [0.86, 0.85, 0.8], col2: [0.07, 0.07, 0.075], groutCol: [0.16, 0.16, 0.15], rough: 0.3, cloud: 0.05, vary: 0.02, dirt: 0.15, depth: 0.4, nstr: 1.4 },
  brick: { nx: 3, ny: 8, grout: 4, bevel: 3, bond: true, col: [0.52, 0.27, 0.2], groutCol: [0.55, 0.52, 0.47], rough: 0.85, cloud: 0.1, vary: 0.22, face: 0.14, dirt: 0.2, nstr: 3 },
  block: { nx: 2, ny: 4, grout: 4, bevel: 3, bond: true, col: [0.62, 0.62, 0.6], groutCol: [0.5, 0.5, 0.48], rough: 0.9, cloud: 0.08, vary: 0.08, face: 0.16, dirt: 0.2, nstr: 2.4 },
};

// ------------------------------------------------------------------ atlases (canvas 2D)
function packer(W, H, bg) {
  const c = makeCanvas(W, H), x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
  let cx = 0, cy = 0, rowH = 0; const rect = {};
  const add = (name, w, h, draw) => {
    if (cx + w > W) { cx = 0; cy += rowH + 4; rowH = 0; }
    x.save(); x.translate(cx, cy); x.beginPath(); x.rect(0, 0, w, h); x.clip(); draw(x, w, h); x.restore();
    rect[name] = [(cx + 1.5) / W, 1 - (cy + h - 1.5) / H, (cx + w - 1.5) / W, 1 - (cy + 1.5) / H];
    cx += w + 4; rowH = Math.max(rowH, h);
  };
  return { c, x, rect, add };
}
const FONT = (px, w = 'bold', f = 'Arial, Helvetica, sans-serif') => `${w} ${px}px ${f}`;
function greek(x, r, x0, y0, w, h, lh, col = '#444', gap = 0.35) {
  x.fillStyle = col;
  for (let y = y0; y < y0 + h - lh * 0.6; y += lh) { let px = x0; const end = x0 + w * (0.6 + 0.4 * r()); while (px < end) { const ww = 6 + r() * 26; x.fillRect(px, y, Math.min(ww, end - px), lh * (1 - gap) * 0.6); px += ww + 4; } }
}

function buildPics() {
  const P = packer(1024, 1280, '#888'), r = makeRng(2026);   // 17 tiles of 252: five rows
  const skins = ['#e8c4a4', '#c99872', '#8e5e3e', '#f0d2b8', '#a8744c', '#6b4530'], hairs = ['#2a1d14', '#5a3b22', '#c8c2ba', '#8a8580', '#a57a3e', '#1a1614'], cloth = ['#3e5a7a', '#7a2f35', '#e4e0d6', '#46604a', '#2b2b30', '#b08a4a', '#8a6a8a'];
  const person = (x, cx, cy, s) => {
    x.fillStyle = r.pick(cloth); x.beginPath(); x.ellipse(cx, cy + s * 1.55, s * 1.15, s * 0.95, 0, 0, TAU); x.fill();
    const sk = r.pick(skins); x.fillStyle = sk; x.fillRect(cx - s * 0.22, cy + s * 0.3, s * 0.44, s * 0.6);
    x.beginPath(); x.ellipse(cx, cy, s * 0.5, s * 0.62, 0, 0, TAU); x.fill();
    x.fillStyle = r.pick(hairs); x.beginPath(); x.ellipse(cx, cy - s * 0.28, s * 0.55, s * 0.45, 0, Math.PI, TAU); x.fill();
    if (r.chance(0.5)) { x.beginPath(); x.ellipse(cx, cy - s * 0.1, s * 0.62, s * 0.7, 0, Math.PI * 0.95, TAU * 1.03); x.fill(); x.fillStyle = sk; x.beginPath(); x.ellipse(cx, cy + s * 0.06, s * 0.42, s * 0.52, 0, 0, TAU); x.fill(); }
  };
  for (let i = 0; i < 6; i++) P.add('portrait' + i, 252, 252, (x, w, h) => {
    const sep = i === 2 || i === 5, g = x.createLinearGradient(0, 0, w * 0.3, h), hue = r.i(0, 360);
    g.addColorStop(0, sep ? '#b8a88c' : `hsl(${hue},22%,62%)`); g.addColorStop(1, sep ? '#6e5f4a' : `hsl(${hue + 30},25%,34%)`); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.filter = 'blur(5px)';
    const k = i === 0 ? 1 : i === 1 ? 2 : i === 3 ? 3 : i === 4 ? 4 : 1;
    for (let j = 0; j < k; j++) person(x, w * (0.5 + (j - (k - 1) / 2) * (0.62 / Math.max(1, k - 0.4))), h * (0.42 + (j & 1) * 0.06 + (k > 2 ? 0.05 : 0)), k === 1 ? 62 : k === 2 ? 46 : 34);
    x.filter = 'none';
    if (sep) { x.globalCompositeOperation = 'color'; x.fillStyle = '#9a7c54'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; }
    const v = x.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); x.fillStyle = v; x.fillRect(0, 0, w, h);
  });
  for (let i = 0; i < 3; i++) P.add('land' + i, 252, 252, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h * 0.6); g.addColorStop(0, ['#5e86b8', '#d08a5a', '#8ea2b0'][i]); g.addColorStop(1, ['#cfdcea', '#f2d6a2', '#d8dcd8'][i]); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.filter = 'blur(1.5px)';
    for (let L = 0; L < 4; L++) { x.fillStyle = [['#7f95a8', '#56707a', '#3d5a48', '#2c4630'], ['#8a6a6a', '#6a4a52', '#3e3340', '#241f2a'], ['#8a9a94', '#667c70', '#4a6452', '#33503c']][i][L];
      x.beginPath(); x.moveTo(0, h); for (let px = 0; px <= w; px += 6) x.lineTo(px, h * (0.42 + L * 0.13) + Math.sin(px * 0.02 * (L + 1) + i * 2 + L) * 16 / (L * 0.5 + 1) + Math.sin(px * 0.07 + L * 3) * 5); x.lineTo(w, h); x.fill(); }
    if (i === 0) { x.fillStyle = '#9db8cc'; x.fillRect(0, h * 0.8, w, h * 0.2); }
    x.filter = 'none';
  });
  for (let i = 0; i < 4; i++) P.add('kid' + i, 252, 252, (x, w, h) => {
    x.fillStyle = ['#f4f1e8', '#f1eee2', '#eef0ea', '#f6efe0'][i]; x.fillRect(0, 0, w, h); x.lineCap = 'round'; x.lineJoin = 'round'; x.globalAlpha = 0.85;
    const wob = (pts, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); pts.forEach(([a, b], k) => { const px = a + r.r(-3, 3), py = b + r.r(-3, 3); k ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); };
    for (let k = 0; k < 16; k++) wob([[r.r(0, w), h - 26 + r.r(-6, 6)], [r.r(0, w), h - 8]], '#4f9a3c', 7);
    if (i !== 2) { x.strokeStyle = '#f2c21c'; x.lineWidth = 7; x.beginPath(); x.arc(44, 44, 20, 0, TAU); x.stroke(); for (let k = 0; k < 8; k++) wob([[44 + Math.cos(k * TAU / 8) * 28, 44 + Math.sin(k * TAU / 8) * 28], [44 + Math.cos(k * TAU / 8) * 42, 44 + Math.sin(k * TAU / 8) * 42]], '#f2c21c', 5); }
    if (i === 0 || i === 3) { wob([[110, 210], [110, 130], [190, 130], [190, 210], [110, 210]], '#c0392b', 6); wob([[100, 132], [150, 84], [200, 132]], '#7a4a2a', 6); wob([[140, 210], [140, 170], [160, 170], [160, 210]], '#2c5aa0', 5); }
    if (i === 1 || i === 3) for (const cx of i === 1 ? [70, 130, 190] : [50]) { const hy = 120 + r.r(-10, 14), col = r.pick(['#c0392b', '#2c5aa0', '#8e44ad', '#16a085']); x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.arc(cx, hy, 13, 0, TAU); x.stroke(); wob([[cx, hy + 14], [cx, hy + 56]], col, 5); wob([[cx - 20, hy + 30], [cx + 20, hy + 30]], col, 5); wob([[cx - 14, hy + 84], [cx, hy + 56], [cx + 14, hy + 84]], col, 5); }
    if (i === 2) { ['#c0392b', '#e67e22', '#f2c21c', '#4f9a3c', '#2c5aa0', '#8e44ad'].forEach((col, k) => { x.strokeStyle = col; x.lineWidth = 9; x.beginPath(); x.arc(w / 2, h * 0.8, 100 - k * 10, Math.PI, TAU); x.stroke(); }); }
    for (let k = 0; k < 5; k++) wob([[r.r(60, w), r.r(10, 60)], [r.r(60, w), r.r(10, 60)], [r.r(60, w), r.r(10, 60)]], '#6aa8d8', 6);
    x.globalAlpha = 1;
  });
  P.add('art0', 252, 252, (x, w, h) => { x.fillStyle = '#e6dfd0'; x.fillRect(0, 0, w, h); x.filter = 'blur(3px)'; [['#b7472a', 24, 26, 204, 84], ['#d99a2b', 24, 118, 204, 52], ['#28415e', 24, 178, 204, 50]].forEach(([c, a, b, cw, ch]) => { x.fillStyle = c; x.fillRect(a, b, cw, ch); }); x.filter = 'none'; });
  P.add('art1', 252, 252, (x, w, h) => { x.fillStyle = '#ecebe4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#55705a'; x.lineWidth = 3; for (let k = 0; k < 7; k++) { x.save(); x.translate(w / 2, h * 0.92); x.rotate((k - 3) * 0.22); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(14, -90, 0, -170 + Math.abs(k - 3) * 16); x.stroke(); x.fillStyle = k & 1 ? '#6b8a6a' : '#8aa37c'; for (let q = 1; q < 6; q++) { x.beginPath(); x.ellipse((q & 1 ? 12 : -10), -q * 26, 7, 16, q & 1 ? 0.7 : -0.7, 0, TAU); x.fill(); } x.restore(); } });
  P.add('cert', 252, 252, (x, w, h) => { x.fillStyle = '#f2ecd8'; x.fillRect(0, 0, w, h); x.strokeStyle = '#9a8040'; x.lineWidth = 4; x.strokeRect(12, 12, w - 24, h - 24); x.fillStyle = '#333'; x.fillRect(60, 40, 132, 9); greek(x, r, 40, 70, 172, 100, 13, '#666'); x.fillStyle = '#a03030'; x.beginPath(); x.arc(190, 196, 20, 0, TAU); x.fill(); x.fillStyle = '#555'; x.fillRect(40, 204, 90, 2); });
  P.add('calendar', 252, 252, (x, w, h) => { x.fillStyle = '#f6f4ee'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f5d8a'; x.fillRect(0, 0, w, 62); x.fillStyle = '#fff'; x.font = FONT(30); x.textAlign = 'center'; x.fillText('NOVEMBER', w / 2, 42); x.fillStyle = '#333'; x.font = FONT(17, 'normal'); for (let d = 1; d <= 30; d++) { const cx = ((d + 5) % 7) * 34 + 24, cy = Math.floor((d + 5) / 7) * 36 + 92; x.fillText(String(d), cx, cy); } x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.beginPath(); x.arc(3 * 34 + 24, 3 * 36 + 86, 14, 0, TAU); x.stroke(); });
  return P;
}

function buildSigns() {
  const P = packer(2048, 1024, '#777'), r = makeRng(404);
  P.add('aed', 252, 252, (x, w, h) => { x.fillStyle = '#0c8a4c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(126, 150); x.bezierCurveTo(40, 96, 62, 30, 126, 66); x.bezierCurveTo(190, 30, 212, 96, 126, 150); x.fill(); x.fillStyle = '#0c8a4c'; x.beginPath(); x.moveTo(134, 62); x.lineTo(106, 104); x.lineTo(126, 104); x.lineTo(114, 140); x.lineTo(148, 94); x.lineTo(128, 94); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.font = FONT(70); x.textAlign = 'center'; x.fillText('AED', 126, 228); });
  P.add('clock', 252, 252, (x, w, h) => { x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = FONT(26); x.textAlign = 'center'; x.textBaseline = 'middle'; for (let k = 1; k <= 12; k++) { const a = k * TAU / 12; x.fillText(String(k), 126 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); } for (let k = 0; k < 60; k++) { const a = k * TAU / 60; x.save(); x.translate(126, 126); x.rotate(a); x.fillRect(-1, -120, k % 5 ? 2 : 4, k % 5 ? 6 : 10); x.restore(); } });
  P.add('whiteboard', 764, 380, (x, w, h) => {
    x.fillStyle = '#f3f4f2'; x.fillRect(0, 0, w, h); x.lineCap = 'round';
    for (let k = 0; k < 9; k++) { x.fillStyle = `rgba(120,130,140,${0.03 + r() * 0.04})`; x.beginPath(); x.ellipse(r.r(0, w), r.r(0, h), r.r(40, 160), r.r(20, 60), r() * 3, 0, TAU); x.fill(); }
    x.fillStyle = '#1d3f8a'; x.font = FONT(34, 'normal', '"Segoe Print", "Comic Sans MS", cursive'); x.fillText('Tuesday 24 November', 30, 52);
    x.fillStyle = '#222'; x.font = FONT(28, 'normal', '"Segoe Print", "Comic Sans MS", cursive'); ['7 + 5 = 12', '9 + 6 = 15', '8 + 8 = __', '14 - 6 = __'].forEach((s, k) => x.fillText(s, 40, 120 + k * 50));
    x.strokeStyle = '#b02a2a'; x.lineWidth = 4; x.beginPath(); x.arc(520, 190, 70, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(520, 190); x.lineTo(520, 120); x.moveTo(520, 190); x.lineTo(580, 226); x.moveTo(520, 190); x.lineTo(462, 228); x.stroke();
    x.fillStyle = '#1b6b3a'; x.font = FONT(26, 'normal', '"Segoe Print", "Comic Sans MS", cursive'); x.fillText('thirds', 480, 300); x.fillText('Reading groups: Otters, Herons', 250, 350);
  });
  P.add('menu', 508, 380, (x, w, h) => {
    x.fillStyle = '#16181a'; x.fillRect(0, 0, w, h); for (let k = 0; k < 14; k++) { x.fillStyle = `rgba(255,255,255,${0.015 + r() * 0.02})`; x.beginPath(); x.ellipse(r.r(0, w), r.r(0, h), r.r(40, 140), r.r(10, 40), r() * 3, 0, TAU); x.fill(); }
    x.fillStyle = '#f0e8c8'; x.textAlign = 'center'; x.font = FONT(36, 'bold', 'Georgia, serif'); x.fillText("TODAY'S SPECIALS", w / 2, 50); x.textAlign = 'left'; x.font = FONT(24, 'normal', '"Segoe Print", "Comic Sans MS", cursive');
    [['Falls Burger & fries', '9.50'], ['Meatloaf plate', '10.25'], ['Patty melt', '8.75'], ['Soup of the day', '4.50'], ['Marionberry pie', '4.25'], ['Bottomless coffee', '2.00']].forEach(([a, b], k) => { x.fillStyle = k & 1 ? '#e8d8a8' : '#f4f0e4'; x.fillText(a, 30, 108 + k * 46); x.fillText(b, w - 96, 108 + k * 46); });
  });
  P.add('notice', 380, 252, (x, w, h) => {
    x.fillStyle = '#a8794a'; x.fillRect(0, 0, w, h); for (let k = 0; k < 3000; k++) { x.fillStyle = r.chance(0.5) ? 'rgba(60,35,15,0.25)' : 'rgba(220,180,130,0.2)'; x.fillRect(r.r(0, w), r.r(0, h), 2, 2); }
    for (let k = 0; k < 9; k++) { const pw = r.r(56, 90), ph = r.r(70, 104), px = (k % 4) * 92 + r.r(4, 14), py = Math.floor(k / 4) * 110 + r.r(6, 20); x.save(); x.translate(px, py); x.rotate(r.r(-0.07, 0.07)); x.fillStyle = r.pick(['#f6f4ec', '#f6f4ec', '#f3e58a', '#bfe0f0', '#f4c6c6', '#cdeccd']); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 5; x.fillRect(0, 0, pw, ph); x.shadowBlur = 0; x.fillStyle = '#333'; x.fillRect(6, 8, pw * 0.6, 5); greek(x, r, 6, 20, pw - 12, ph - 26, 8, '#666'); x.fillStyle = r.pick(['#c0392b', '#2c5aa0', '#e0b020']); x.beginPath(); x.arc(pw / 2, 5, 4, 0, TAU); x.fill(); x.restore(); }
  });
  P.add('dart', 252, 252, (x, w, h) => {
    x.fillStyle = '#111'; x.fillRect(0, 0, w, h); const cx = 126, cy = 126;
    for (let k = 0; k < 20; k++) { const a0 = (k - 0.5) * TAU / 20 - Math.PI / 2, a1 = a0 + TAU / 20; const seg = (r0, r1, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r1, a0, a1); x.arc(cx, cy, r0, a1, a0, true); x.fill(); };
      seg(12, 96, k & 1 ? '#e6dcc0' : '#141414'); seg(56, 62, k & 1 ? '#1e7a3c' : '#b82a2a'); seg(90, 96, k & 1 ? '#1e7a3c' : '#b82a2a'); }
    x.fillStyle = '#1e7a3c'; x.beginPath(); x.arc(cx, cy, 12, 0, TAU); x.fill(); x.fillStyle = '#b82a2a'; x.beginPath(); x.arc(cx, cy, 5, 0, TAU); x.fill();
    x.fillStyle = '#ddd'; x.font = FONT(14); x.textAlign = 'center'; x.textBaseline = 'middle'; [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].forEach((v, k) => { const a = k * TAU / 20; x.fillText(String(v), cx + Math.sin(a) * 110, cy - Math.cos(a) * 110); });
  });
  P.add('warn', 508, 188, (x, w, h) => { x.fillStyle = '#f2c100'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; for (let k = -4; k < 30; k++) { x.beginPath(); x.moveTo(k * 40, 0); x.lineTo(k * 40 + 20, 0); x.lineTo(k * 40 - 10, 30); x.lineTo(k * 40 - 30, 30); x.fill(); x.beginPath(); x.moveTo(k * 40, h - 30); x.lineTo(k * 40 + 20, h - 30); x.lineTo(k * 40 - 10, h); x.lineTo(k * 40 - 30, h); x.fill(); } x.font = FONT(50); x.textAlign = 'center'; x.fillText('CAUTION', w / 2, 88); x.font = FONT(30); x.fillText('FORKLIFT TRAFFIC', w / 2, 132); });
  P.add('firstaid', 124, 124, (x, w, h) => { x.fillStyle = '#0c8a4c'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(48, 22, 28, 80); x.fillRect(22, 48, 80, 28); });
  P.add('fireext', 124, 188, (x, w, h) => { x.fillStyle = '#c21f1f'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(46, 50, 32, 74); x.fillRect(54, 36, 16, 16); x.fillRect(66, 30, 26, 6); x.font = FONT(17); x.textAlign = 'center'; x.fillText('FIRE', 62, 150); x.fillText('EXTINGUISHER', 62, 172, 112); });
  P.add('evac', 124, 156, (x, w, h) => { x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, w, h); x.strokeStyle = '#333'; x.lineWidth = 2; x.strokeRect(14, 40, 96, 70); for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(14 + k * 24, 40); x.lineTo(14 + k * 24, 66); x.moveTo(14 + k * 24, 84); x.lineTo(14 + k * 24, 110); x.stroke(); } x.strokeStyle = '#c21f1f'; x.lineWidth = 3; x.beginPath(); x.moveTo(26, 75); x.lineTo(100, 75); x.lineTo(92, 69); x.moveTo(100, 75); x.lineTo(92, 81); x.stroke(); x.fillStyle = '#c21f1f'; x.font = FONT(13); x.textAlign = 'center'; x.fillText('EVACUATION PLAN', 62, 24, 110); greek(x, r, 14, 120, 96, 34, 8, '#777'); });
  P.add('wash', 188, 124, (x, w, h) => { x.fillStyle = '#1f4f9a'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = FONT(22); x.textAlign = 'center'; x.fillText('EMPLOYEES', w / 2, 40); x.fillText('MUST WASH', w / 2, 70); x.fillText('HANDS', w / 2, 100); });
  P.add('rerack', 252, 316, (x, w, h) => { x.fillStyle = '#17191c'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8b21a'; x.fillRect(0, 0, w, 16); x.fillRect(0, h - 16, w, 16); x.fillStyle = '#f2f2f2'; x.font = FONT(44); x.textAlign = 'center'; ['RE-RACK', 'YOUR', 'WEIGHTS'].forEach((s, k) => x.fillText(s, w / 2, 96 + k * 58, 230)); x.fillStyle = '#e8b21a'; x.font = FONT(18, 'normal'); x.fillText('Wipe down equipment after use', w / 2, 268, 230); });
  P.add('gymrules', 252, 316, (x, w, h) => { x.fillStyle = '#f2f2ee'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a3d6e'; x.fillRect(0, 0, w, 60); x.fillStyle = '#fff'; x.font = FONT(26); x.textAlign = 'center'; x.fillText('FLOOR RULES', w / 2, 40); greek(x, r, 22, 84, 208, 210, 20, '#444', 0.5); });
  P.add('safety', 252, 316, (x, w, h) => { x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#1e7a3c'; x.fillRect(0, 0, w, 64); x.fillStyle = '#fff'; x.font = FONT(26); x.textAlign = 'center'; x.fillText('SAFETY FIRST', w / 2, 42); x.fillStyle = '#f2c100'; x.beginPath(); x.moveTo(126, 86); x.lineTo(186, 190); x.lineTo(66, 190); x.closePath(); x.fill(); x.fillStyle = '#111'; x.fillRect(121, 116, 10, 44); x.fillRect(121, 168, 10, 10); greek(x, r, 26, 210, 200, 90, 16, '#444', 0.5); });
  P.add('plate', 252, 124, (x, w, h) => { x.fillStyle = '#e9ecef'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1d3a6a'; x.lineWidth = 6; x.strokeRect(5, 5, w - 10, h - 10); x.fillStyle = '#1d3a6a'; x.font = FONT(18); x.textAlign = 'center'; x.fillText('KETTER COUNTY', w / 2, 30); x.font = FONT(58); x.fillText('4RN 218', w / 2, 94); });
  P.add('abc', 1020, 92, (x, w, h) => { const cols = ['#d94a3d', '#f0a91e', '#4b9b4a', '#2f7dc0', '#8a55b0', '#e86a92']; for (let k = 0; k < 13; k++) { x.fillStyle = cols[k % 6]; x.fillRect(k * 78.5, 0, 77, h); x.fillStyle = '#fff'; x.font = FONT(50); x.textAlign = 'center'; x.fillText(String.fromCharCode(65 + k) + String.fromCharCode(97 + k), k * 78.5 + 38, 66, 70); } });
  P.add('paper', 124, 160, (x, w, h) => { x.fillStyle = '#f5f4ef'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.fillRect(12, 14, 64, 6); greek(x, r, 12, 30, 100, 120, 9, '#666'); });
  P.add('news', 252, 188, (x, w, h) => { x.fillStyle = '#dedad0'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = FONT(24, 'bold', 'Georgia, serif'); x.textAlign = 'center'; x.fillText('Halloran Falls Courier', w / 2, 28, 236); x.fillRect(8, 36, w - 16, 2); x.fillStyle = '#8a8880'; x.fillRect(10, 46, 110, 70); for (let c = 0; c < 3; c++) greek(x, r, 10 + c * 80 + (c ? 0 : 0), c < 2 && c * 80 < 120 ? 124 : 46, 72, c < 2 && c * 80 < 120 ? 60 : 138, 7, '#555'); });
  P.add('takeaway', 124, 188, (x, w, h) => { x.fillStyle = '#c8302a'; x.fillRect(0, 0, w, h); x.fillStyle = '#f6e7b0'; x.font = FONT(20); x.textAlign = 'center'; x.fillText('GOLDEN', w / 2, 30); x.fillText('WOK', w / 2, 54); x.fillStyle = '#f4f0e6'; x.fillRect(10, 66, w - 20, h - 76); greek(x, r, 16, 74, w - 32, h - 90, 8, '#733'); });
  P.add('num12', 92, 60, (x, w, h) => { x.fillStyle = '#b89650'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = FONT(44); x.textAlign = 'center'; x.fillText('12', w / 2, 46); });
  P.add('num3a', 92, 60, (x, w, h) => { x.fillStyle = '#c8c8c4'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = FONT(44); x.textAlign = 'center'; x.fillText('3A', w / 2, 46); });
  P.add('num3b', 92, 60, (x, w, h) => { x.fillStyle = '#c8c8c4'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = FONT(44); x.textAlign = 'center'; x.fillText('3B', w / 2, 46); });
  P.add('danger', 124, 124, (x, w, h) => { x.fillStyle = '#f2c100'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.beginPath(); x.moveTo(62, 12); x.lineTo(112, 100); x.lineTo(12, 100); x.closePath(); x.fill(); x.fillStyle = '#f2c100'; x.beginPath(); x.moveTo(68, 34); x.lineTo(50, 66); x.lineTo(62, 66); x.lineTo(54, 90); x.lineTo(76, 58); x.lineTo(64, 58); x.closePath(); x.fill(); });
  P.add('floor3', 124, 124, (x, w, h) => { x.fillStyle = '#e8e8e2'; x.fillRect(0, 0, w, h); x.fillStyle = '#26384e'; x.font = FONT(88); x.textAlign = 'center'; x.fillText('3', w / 2, 96); });
  const lab = (name, bg, fg, t1, t2) => P.add(name, 92, 124, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(6, 6, w - 12, h - 12); x.fillStyle = fg; x.textAlign = 'center'; x.font = FONT(19, 'bold', 'Georgia, serif'); x.fillText(t1, w / 2, 50, 76); x.font = FONT(13, 'normal', 'Georgia, serif'); x.fillText(t2, w / 2, 74, 76); x.beginPath(); x.arc(w / 2, 98, 9, 0, TAU); x.fill(); });
  lab('label0', '#efe6cc', '#5a2a1a', 'KETTER', 'Rye Whiskey'); lab('label1', '#1a1a1a', '#d8b050', 'OLD FALLS', 'Bourbon'); lab('label2', '#f4f4f0', '#1d3a6a', 'HERON', 'Dry Gin'); lab('label3', '#7a1f24', '#f0e2b8', 'CASCADE', 'Red Blend'); lab('label4', '#e8d9a0', '#2a4a2a', 'TAMARACK', 'Amaro'); lab('label5', '#dfe8ee', '#b0282a', 'NORTHLINE', 'Vodka');
  P.add('cereal', 124, 188, (x, w, h) => { x.fillStyle = '#e8a21a'; x.fillRect(0, 0, w, h); x.fillStyle = '#c0392b'; x.fillRect(0, 0, w, 54); x.fillStyle = '#fff'; x.font = FONT(24); x.textAlign = 'center'; x.fillText('OAT', w / 2, 26); x.fillText('RINGS', w / 2, 48); x.fillStyle = '#f6e8c0'; x.beginPath(); x.ellipse(62, 128, 44, 30, 0, 0, TAU); x.fill(); x.strokeStyle = '#c98a2a'; x.lineWidth = 4; for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(62 + r.r(-28, 28), 128 + r.r(-16, 16), 6, 0, TAU); x.stroke(); } });
  P.add('carton', 252, 124, (x, w, h) => { x.fillStyle = '#b08a5a'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(210,180,130,0.6)'; x.fillRect(0, 50, w, 24); x.fillStyle = '#3a2a1a'; x.font = FONT(20); x.fillText('HALLORAN SUPPLY', 12, 30); x.fillStyle = '#f2f0ea'; x.fillRect(150, 82, 90, 34); x.fillStyle = '#111'; for (let k = 0; k < 20; k++) x.fillRect(156 + k * 4, 88, r.chance(0.5) ? 2 : 1, 22); });
  P.add('thermo', 124, 188, (x, w, h) => { x.fillStyle = '#e9e7e0'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = FONT(16); x.textAlign = 'center'; x.fillText('HEAT', w / 2, 24); x.strokeStyle = '#333'; x.lineWidth = 2; x.beginPath(); x.arc(62, 100, 44, 0, TAU); x.stroke(); for (let k = 0; k < 11; k++) { const a = Math.PI * 0.75 + k * Math.PI * 1.5 / 10; x.beginPath(); x.moveTo(62 + Math.cos(a) * 36, 100 + Math.sin(a) * 36); x.lineTo(62 + Math.cos(a) * 44, 100 + Math.sin(a) * 44); x.stroke(); } x.strokeStyle = '#c21f1f'; x.lineWidth = 4; x.beginPath(); x.moveTo(62, 100); x.lineTo(92, 78); x.stroke(); });
  return P;
}

function buildScreens() {
  const P = packer(1024, 1024, '#000'), r = makeRng(909);
  const tv = (name, draw) => P.add(name, 380, 214, draw);
  tv('tv0', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#27407a'); g.addColorStop(1, '#6a2a4a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.filter = 'blur(6px)'; x.fillStyle = '#c9a07a'; x.beginPath(); x.ellipse(130, 86, 34, 42, 0, 0, TAU); x.fill(); x.fillStyle = '#2a3348'; x.beginPath(); x.ellipse(130, 190, 80, 62, 0, 0, TAU); x.fill(); x.fillStyle = '#7fb2e0'; x.fillRect(230, 36, 120, 80); x.filter = 'none'; x.fillStyle = '#b01c1c'; x.fillRect(0, h - 44, w, 28); x.fillStyle = '#fff'; x.fillRect(12, h - 36, 200, 10); x.fillStyle = '#e8e8e8'; x.fillRect(0, h - 16, w, 16); });
  tv('tv1', (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7ab0e0'); g.addColorStop(0.5, '#d8e6c8'); g.addColorStop(0.52, '#4c8a3c'); g.addColorStop(1, '#2d5e2a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.filter = 'blur(4px)'; x.fillStyle = '#e8e4d8'; for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(r.r(30, w - 30), r.r(120, 190), 9, 14, 0, 0, TAU); x.fill(); } x.filter = 'none'; x.fillStyle = 'rgba(10,20,50,0.8)'; x.fillRect(16, 14, 110, 26); x.fillStyle = '#fff'; x.fillRect(24, 22, 60, 9); });
  tv('tv2', (x, w, h) => { x.fillStyle = '#1e3a2c'; x.fillRect(0, 0, w, h); x.filter = 'blur(8px)'; for (let k = 0; k < 9; k++) { x.fillStyle = `hsl(${r.i(20, 60)},60%,${r.i(30, 60)}%)`; x.beginPath(); x.ellipse(r.r(0, w), r.r(0, h), r.r(30, 80), r.r(20, 60), 0, 0, TAU); x.fill(); } x.filter = 'none'; });
  const mon = (name, kind) => P.add(name, 316, 198, (x, w, h) => {
    x.fillStyle = kind === 2 ? '#1c2128' : '#e9edf2'; x.fillRect(0, 0, w, h); x.fillStyle = kind === 2 ? '#2a313b' : '#2b5797'; x.fillRect(0, 0, w, 16);
    if (kind === 0) { x.fillStyle = '#fff'; x.fillRect(6, 22, w - 12, h - 28); x.strokeStyle = '#c8ced6'; x.lineWidth = 1; for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(6, 22 + k * 13); x.lineTo(w - 6, 22 + k * 13); x.stroke(); } for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(6 + k * 50, 22); x.lineTo(6 + k * 50, h - 6); x.stroke(); } x.fillStyle = '#d9ead3'; x.fillRect(6, 22, w - 12, 13); x.fillStyle = '#555'; for (let j = 1; j < 13; j++) for (let k = 0; k < 6; k++) if (r.chance(0.7)) x.fillRect(10 + k * 50, 26 + j * 13, r.r(10, 36), 5); }
    else if (kind === 1) { x.fillStyle = '#f7f8fa'; x.fillRect(0, 16, 84, h); x.fillStyle = '#fff'; x.fillRect(84, 16, w - 84, h); for (let k = 0; k < 9; k++) { x.fillStyle = k === 2 ? '#cfe0f5' : '#eef0f3'; x.fillRect(4, 22 + k * 19, 76, 16); x.fillStyle = '#667'; x.fillRect(8, 26 + k * 19, r.r(30, 60), 4); } greek(x, r, 96, 30, w - 110, h - 40, 11, '#556'); }
    else { const cols = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#c0caf5']; for (let k = 0; k < 13; k++) { let px = 12 + (r.i(0, 3)) * 14; for (let q = 0; q < r.i(1, 5); q++) { const ww = r.r(14, 60); x.fillStyle = r.pick(cols); x.fillRect(px, 24 + k * 13, ww, 5); px += ww + 6; } } }
  });
  mon('mon0', 0); mon('mon1', 1); mon('mon2', 2);
  P.add('slides', 380, 214, (x, w, h) => { x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, w, h); x.fillStyle = '#1d3a6a'; x.fillRect(0, 0, w, 36); x.fillStyle = '#fff'; x.fillRect(16, 12, 150, 12); const bars = [60, 96, 78, 128, 110]; bars.forEach((b, k) => { x.fillStyle = k === 3 ? '#e0832a' : '#4a7ab8'; x.fillRect(40 + k * 34, 190 - b, 24, b); }); greek(x, r, 230, 60, 130, 120, 14, '#556'); });
  const seg = (name, txt, col, bg = '#050505', fw = 124, fh = 60) => P.add(name, fw, fh, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 6; x.font = FONT(h * 0.72, 'bold', '"Consolas", "Courier New", monospace'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, w / 2, h / 2 + 2, w - 8); });
  seg('clockRed', '2:47', '#ff2a1a'); seg('clockGreen', '12:47', '#3aff7a'); seg('lcdO2', '2.0 L', '#101a10', '#9ec88a'); seg('ovenClock', '14:20', '#58c8ff');
  P.add('exit', 252, 124, (x, w, h) => { x.fillStyle = '#0a6a34'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8fff0'; x.font = FONT(84); x.textAlign = 'center'; x.fillText('EXIT', w / 2, 94); });
  P.add('static', 252, 188, (x, w, h) => { x.fillStyle = '#243046'; x.fillRect(0, 0, w, h); x.filter = 'blur(7px)'; x.fillStyle = '#d6b890'; x.beginPath(); x.ellipse(90, 80, 30, 38, 0, 0, TAU); x.fill(); x.fillStyle = '#5b6f96'; x.fillRect(150, 30, 90, 70); x.fillStyle = '#3a2a2a'; x.beginPath(); x.ellipse(90, 170, 60, 50, 0, 0, TAU); x.fill(); x.filter = 'none'; for (let y = 0; y < h; y += 3) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, y, w, 1); } });
  P.add('aedPanel', 124, 92, (x, w, h) => { x.fillStyle = '#060806'; x.fillRect(0, 0, w, h); x.fillStyle = '#2aff5a'; x.beginPath(); x.arc(28, 46, 12, 0, TAU); x.fill(); x.fillStyle = '#9aa'; x.fillRect(54, 30, 56, 8); x.fillRect(54, 48, 40, 8); });
  P.add('white', 60, 60, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); });
  P.add('vend', 188, 316, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a6ad8'); g.addColorStop(1, '#0f2a6a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = FONT(30); x.textAlign = 'center'; x.fillText('COLD', w / 2, 60); x.fillText('DRINKS', w / 2, 96); x.fillStyle = '#bfe2ff'; x.beginPath(); x.ellipse(w / 2, 210, 40, 70, 0, 0, TAU); x.fill(); });
  P.add('juke', 252, 188, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#ff5a2a'); g.addColorStop(0.5, '#ffe06a'); g.addColorStop(1, '#ff3a8a'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 8; k++) x.fillRect(k * 32 + 12, 0, 6, h); });
  return P;
}

function buildNeon() {
  const P = packer(1024, 1024, '#000');
  const glowText = (x, txt, cx, cy, px, col, font, maxw) => {
    x.font = FONT(px, 'normal', font); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineCap = 'round';
    x.shadowColor = col; x.strokeStyle = col;
    x.shadowBlur = 30; x.lineWidth = 7; x.globalAlpha = 0.6; x.strokeText(txt, cx, cy, maxw);
    x.shadowBlur = 12; x.lineWidth = 5; x.globalAlpha = 1; x.strokeText(txt, cx, cy, maxw);
    x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.6; x.strokeText(txt, cx, cy, maxw);
  };
  const glowPath = (x, col, lw, path) => { x.lineJoin = 'round'; x.lineCap = 'round'; x.shadowColor = col; x.strokeStyle = col; x.shadowBlur = 26; x.lineWidth = lw + 2; x.globalAlpha = 0.6; x.beginPath(); path(); x.stroke(); x.shadowBlur = 10; x.globalAlpha = 1; x.lineWidth = lw; x.beginPath(); path(); x.stroke(); x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = lw * 0.3; x.beginPath(); path(); x.stroke(); };
  const script = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive', sans = '"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
  P.add('open', 380, 220, (x, w, h) => { glowPath(x, '#2a7aff', 6, () => x.roundRect(22, 22, w - 44, h - 44, 34)); glowText(x, 'OPEN', w / 2, h / 2 + 4, 104, '#ff2a2a', sans, w - 90); });
  P.add('diner', 620, 250, (x, w, h) => { glowText(x, 'Falls Diner', w / 2, h * 0.42, 108, '#ff3a8a', script, w - 50); glowPath(x, '#2affd8', 6, () => { x.moveTo(60, h - 48); x.quadraticCurveTo(w / 2, h - 14, w - 60, h - 48); }); });
  P.add('beer0', 380, 250, (x, w, h) => { glowPath(x, '#ffb21a', 6, () => x.ellipse(w / 2, h / 2, w / 2 - 22, h / 2 - 22, 0, 0, TAU)); glowText(x, 'Ketter', w / 2, h * 0.38, 70, '#ffe9a0', script, w - 110); glowText(x, 'GOLD', w / 2, h * 0.68, 54, '#ffb21a', sans, w - 150); });
  P.add('beer1', 440, 250, (x, w, h) => { glowText(x, 'Blue Heron', w / 2, h * 0.4, 80, '#3a9aff', script, w - 40); glowText(x, 'ALE', w / 2, h * 0.78, 44, '#f4f4ff', sans, 120); glowPath(x, '#3a9aff', 5, () => { x.moveTo(40, h * 0.78); x.lineTo(w / 2 - 70, h * 0.78); x.moveTo(w / 2 + 70, h * 0.78); x.lineTo(w - 40, h * 0.78); }); });
  P.add('beer2', 380, 220, (x, w, h) => { glowPath(x, '#ff2a2a', 6, () => x.roundRect(20, 20, w - 40, h - 40, 16)); glowText(x, 'HALLORAN', w / 2, h * 0.38, 58, '#f4f4f4', sans, w - 70); glowText(x, 'Lager', w / 2, h * 0.7, 62, '#ff2a2a', script, w - 120); });
  P.add('cocktail', 220, 250, (x, w, h) => { glowPath(x, '#ff3ad0', 6, () => { x.moveTo(40, 50); x.lineTo(180, 50); x.lineTo(110, 130); x.closePath(); x.moveTo(110, 130); x.lineTo(110, 204); x.moveTo(70, 208); x.lineTo(150, 208); }); glowPath(x, '#5aff5a', 5, () => { x.arc(150, 56, 13, 0, TAU); }); });
  P.add('pool', 380, 160, (x, w, h) => { glowText(x, 'POOL', w / 2, h / 2 + 4, 92, '#3aff8a', sans, w - 60); });
  return P;
}

const ATL = {};
export const ATLAS = {
  get pics() { return ATL.pics || (ATL.pics = fin(buildPics())); },
  get signs() { return ATL.signs || (ATL.signs = fin(buildSigns())); },
  get screens() { return ATL.screens || (ATL.screens = fin(buildScreens())); },
  get neon() { return ATL.neon || (ATL.neon = fin(buildNeon())); },
};
function fin(P) { return { tex: share(canvasTex(P.c, { wrap: false, aniso: 8 })), rect: P.rect }; }

// Stain decals (2x2 atlas with alpha): 0 oil, 1 coffee/liquid, 2 scuff/dirt, 3 water ring.
function buildStains() {
  base(); const n = 512, c = makeCanvas(n), x = c.getContext('2d'), im = x.createImageData(n, n), d = im.data;
  for (let y = 0; y < n; y++) for (let px = 0; px < n; px++) {
    const q = (px >> 8) + (y >> 8) * 2, u = ((px & 255) - 128) / 128, v = ((y & 255) - 128) / 128, rr = Math.hypot(u, v), an = Math.atan2(v, u);
    const lob = nz(px * 2 + q * 131, y * 2 + q * 57), edge = 0.52 + 0.26 * (nzf((an + Math.PI) * 163 + q * 40, q * 9.3) - 0.5) * 2 + (lob - 0.5) * 0.25;
    let a = 1 - sstep(edge - 0.1, edge, rr), r = 0, g = 0, b = 0;
    if (q === 0) { r = 0.03; g = 0.027; b = 0.025; a *= 0.6 + 0.4 * lob; a = Math.max(a, (1 - sstep(edge, edge + 0.3, rr)) * 0.25 * lob); }
    else if (q === 1) { const rim = sstep(edge - 0.2, edge - 0.04, rr); r = 0.2 - rim * 0.08; g = 0.11 - rim * 0.05; b = 0.05 - rim * 0.03; a *= 0.55 + rim * 0.3; }
    else if (q === 2) { r = g = b = 0.1; a = (1 - sstep(0.2, 0.95, rr)) * sstep(0.35, 0.7, nz(px * 3, y * 12)) * 0.5; }
    else { r = g = b = 0.02; a *= 0.3; }
    const j = (y * n + px) * 4; d[j] = r * 255; d[j + 1] = g * 255; d[j + 2] = b * 255; d[j + 3] = clamp(a) * 255;
  }
  x.putImageData(im, 0, 0); return share(canvasTex(c, { wrap: false }));
}
export const STAIN = { oil: [0.01, 0.51, 0.49, 0.99], coffee: [0.51, 0.51, 0.99, 0.99], scuff: [0.01, 0.01, 0.49, 0.49], water: [0.51, 0.01, 0.99, 0.49] };

// Dry grime decals (2x2 atlas with alpha): smudge (hand marks, soot), scuff (shoe and furniture rubs, runs along U),
// wear (pale trodden / dusty patch), drip (streaks running down from V=1).
function buildGrime() {
  base(); const n = 512, c = makeCanvas(n), x = c.getContext('2d'), im = x.createImageData(n, n), d = im.data;
  for (let y = 0; y < n; y++) for (let px = 0; px < n; px++) {
    const q = (px >> 8) + (y >> 8) * 2, fu = (px & 255) / 255, fv = (y & 255) / 255, u = fu * 2 - 1, v = fv * 2 - 1, rr = Math.hypot(u, v);
    const edge = Math.max(0, 1 - Math.max(Math.abs(u), Math.abs(v))), ef = sstep(0, 0.22, edge);
    let a = 0, r = 0.1, g = 0.085, b = 0.07;
    if (q === 0) { const cl = nz(px * 2 + 17, y * 2 + 90), fine = nz(px * 9, y * 9); a = (1 - sstep(0.1, 0.95, rr)) * sstep(0.25, 0.8, cl * 0.75 + fine * 0.25 + (1 - rr) * 0.25) * 0.3; }
    else if (q === 1) { const row = Math.floor(fv * 9), ro = hash2(row, 3, 77), s0 = hash2(row, 5, 77) * 0.5, s1 = s0 + 0.2 + hash2(row, 7, 77) * 0.3, fy = fv * 9 - row, th = 0.12 + 0.3 * hash2(row, 9, 77);
      const band = (1 - sstep(th * 0.4, th, Math.abs(fy - 0.5 + (nz(px * 2, row * 40) - 0.5) * 0.3))) * sstep(s0, s0 + 0.06, fu) * (1 - sstep(s1 - 0.1, s1, fu));
      r = g = b = 0.035; a = ro > 0.35 ? band * (0.35 + 0.5 * nz(px * 6, y * 30)) * 0.8 : 0; }
    else if (q === 2) { const cl = nz(px + 300, y + 40), fine = nz(px * 8, y * 8), w2 = wn(px, y); r = 0.74; g = 0.71; b = 0.66; a = (1 - sstep(0.25, 1.0, rr)) * (0.3 + 0.7 * cl) * (0.6 + 0.4 * fine) * (0.8 + 0.2 * w2) * 0.34; }
    else { const col = nzf(px * 5.0, 3.3), col2 = nzf(px * 17.0, 9.1), len = 0.25 + 0.75 * nzf(px * 3.0, 20.5), st = sstep(0.52, 0.78, col * 0.7 + col2 * 0.3);
      r = 0.16; g = 0.13; b = 0.09; a = st * (1 - sstep(len * 0.5, len, fv)) * (0.55 + 0.45 * nz(px * 4, y * 2)) * 0.5; }
    a *= ef; const j = (y * n + px) * 4; d[j] = r * 255; d[j + 1] = g * 255; d[j + 2] = b * 255; d[j + 3] = clamp(a) * 255;
  }
  x.putImageData(im, 0, 0); return share(canvasTex(c, { wrap: false }));
}
export const GRIME = { smudge: [0.01, 0.51, 0.49, 0.99], scuff: [0.51, 0.51, 0.99, 0.99], wear: [0.01, 0.01, 0.49, 0.49], drip: [0.51, 0.01, 0.99, 0.49] };

function buildLace() {
  const n = 256, c = makeCanvas(n), x = c.getContext('2d'); x.translate(128, 128); x.strokeStyle = '#fff'; x.fillStyle = '#fff';
  x.beginPath(); x.arc(0, 0, 58, 0, TAU); x.fill(); x.lineWidth = 3;
  for (let k = 0; k < 16; k++) { x.rotate(TAU / 16); x.beginPath(); x.arc(0, -92, 22, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, -72, 9, 0, TAU); x.stroke(); x.beginPath(); x.moveTo(0, -58); x.lineTo(0, -110); x.stroke(); }
  x.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 8; k++) { x.rotate(TAU / 8); x.beginPath(); x.ellipse(0, -36, 7, 13, 0, 0, TAU); x.fill(); } x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill();
  return share(canvasTex(c, { wrap: false }));
}

// Blurred exterior seen through a window. kind: day | rain | dusk | night | carpark | yardDay | yardNight | cityDay | cityNight
export function backdropTex(kind) {
  return cached('ext_' + kind, () => {
    const W = 1024, H = 512, c = makeCanvas(W, H), x = c.getContext('2d'), r = makeRng(kind.length * 131 + kind.charCodeAt(0));
    const night = /night|carpark|Night/.test(kind), dusk = kind === 'dusk', rain = kind === 'rain', city = /city/.test(kind), yard = /yard|carpark/.test(kind);
    const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
    if (night) { sky.addColorStop(0, '#05070c'); sky.addColorStop(1, yard ? '#2a1c12' : '#10131c'); }
    else if (dusk) { sky.addColorStop(0, '#27345a'); sky.addColorStop(0.6, '#b0685a'); sky.addColorStop(1, '#f0a45a'); }
    else if (rain) { sky.addColorStop(0, '#8d949c'); sky.addColorStop(1, '#bfc5ca'); }
    else { sky.addColorStop(0, '#9ebfe6'); sky.addColorStop(1, '#eef3f6'); }
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    const hz = H * 0.58; // horizon row (eye level)
    x.filter = 'blur(5px)';
    const dark = night ? 0.12 : dusk ? 0.4 : rain ? 0.7 : 1;
    const sh = (r0, g0, b0) => `rgb(${r0 * dark | 0},${g0 * dark | 0},${b0 * dark | 0})`;
    // distant tree line / skyline
    if (city) { for (let i = 0; i < 26; i++) { const bw = r.r(40, 90), bh = r.r(60, 260), bx = i * 42 + r.r(-10, 10); x.fillStyle = sh(110 + r.i(0, 40), 118 + r.i(0, 40), 130 + r.i(0, 40)); x.fillRect(bx, hz - bh, bw, bh + 20);
        for (let wy = hz - bh + 8; wy < hz; wy += 14) for (let wx = bx + 5; wx < bx + bw - 6; wx += 11) { if (night ? r.chance(0.35) : r.chance(0.5)) { x.fillStyle = night ? r.pick(['#ffd890', '#fff0c8', '#bfe0ff']) : sh(70, 84, 100); x.fillRect(wx, wy, 6, 8); } } } }
    else { x.fillStyle = sh(72, 96, 78); x.beginPath(); x.moveTo(0, hz + 10); for (let px = 0; px <= W; px += 8) x.lineTo(px, hz - 46 - 30 * Math.abs(Math.sin(px * 0.021)) - 18 * Math.sin(px * 0.057 + 1) - r.r(0, 10)); x.lineTo(W, hz + 10); x.fill(); }
    // mid: houses / units
    if (!city) for (let i = 0; i < 6; i++) {
      const bx = i * 180 + r.r(-20, 30), bw = r.r(110, 150), bh = r.r(60, 86);
      x.fillStyle = yard ? sh(120, 124, 128) : sh(...r.pick([[196, 186, 168], [168, 150, 132], [180, 190, 196], [150, 110, 90]])); x.fillRect(bx, hz - bh + 22, bw, bh);
      if (!yard) { x.fillStyle = sh(84, 70, 66); x.beginPath(); x.moveTo(bx - 10, hz - bh + 24); x.lineTo(bx + bw / 2, hz - bh - 22); x.lineTo(bx + bw + 10, hz - bh + 24); x.fill(); }
      for (let k = 0; k < 3; k++) { const lit = (night || dusk) && r.chance(0.55); x.fillStyle = lit ? '#ffc870' : sh(70, 84, 100); x.fillRect(bx + 14 + k * (bw - 40) / 2.4, hz - bh + 40, 20, 24); }
    }
    // ground
    const gg = x.createLinearGradient(0, hz + 14, 0, H);
    if (yard || city) { gg.addColorStop(0, sh(96, 98, 100)); gg.addColorStop(1, sh(60, 62, 64)); } else { gg.addColorStop(0, sh(74, 96, 60)); gg.addColorStop(0.45, sh(58, 80, 50)); gg.addColorStop(0.5, sh(88, 90, 92)); gg.addColorStop(1, sh(60, 62, 66)); }
    x.fillStyle = gg; x.fillRect(0, hz + 18, W, H);
    // hedge / fence / parked cars
    if (!city) { x.fillStyle = sh(54, 84, 52); for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(r.r(0, W), hz + 26 + r.r(-4, 8), r.r(40, 90), r.r(16, 30), 0, 0, TAU); x.fill(); } }
    if (yard || kind === 'carpark') for (let i = 0; i < 4; i++) { const cx = 120 + i * 240 + r.r(-30, 30); x.fillStyle = sh(...r.pick([[150, 40, 40], [200, 200, 205], [40, 60, 110], [70, 72, 76]])); x.beginPath(); x.roundRect(cx, hz + 34, 150, 44, 14); x.fill(); x.beginPath(); x.roundRect(cx + 28, hz + 10, 92, 34, 12); x.fill(); }
    // trees (near, soft)
    if (!city && !yard) for (let i = 0; i < 4; i++) { const tx = r.r(40, W - 40), th = r.r(150, 230); x.fillStyle = sh(64, 52, 42); x.fillRect(tx - 6, hz - th * 0.3, 12, th * 0.42); x.fillStyle = sh(60 + r.i(0, 30), 104 + r.i(0, 30), 58); for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(tx + r.r(-46, 46), hz - th * 0.5 + r.r(-50, 30), r.r(30, 54), r.r(26, 44), 0, 0, TAU); x.fill(); } }
    x.filter = 'none';
    // lights with bokeh
    if (night || dusk) {
      x.globalCompositeOperation = 'lighter';
      const lamp = (lx, ly, rad, col, a = 1) => { const g = x.createRadialGradient(lx, ly, 0, lx, ly, rad); g.addColorStop(0, col); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = a; x.fillStyle = g; x.beginPath(); x.arc(lx, ly, rad, 0, TAU); x.fill(); x.globalAlpha = 1; };
      const sod = 'rgba(255,150,50,1)';
      for (let i = 0; i < (yard ? 4 : 5); i++) { const lx = r.r(30, W - 30), ly = hz - r.r(70, 150); lamp(lx, ly, r.r(26, 40), sod, night ? 0.9 : 0.5); lamp(lx, hz + 60, 120, 'rgba(160,80,20,1)', night ? 0.35 : 0.12); }
      for (let i = 0; i < 12; i++) lamp(r.r(0, W), hz + r.r(-60, 30), r.r(5, 12), r.pick(['rgba(255,220,160,1)', 'rgba(255,255,255,1)', 'rgba(255,60,40,1)', 'rgba(140,200,255,1)']), 0.7);
      x.globalCompositeOperation = 'source-over';
    }
    if (rain) { x.fillStyle = 'rgba(200,205,210,0.25)'; x.fillRect(0, 0, W, H); }
    return share(canvasTex(c, { wrap: false, aniso: 4 }));
  });
}

// ------------------------------------------------------------------ materials
const MC = {};
function mat(key, fn) { if (!MC[key]) { const m = fn(); m.userData.shared = true; m.name = key; MC[key] = m; } return MC[key]; }
function std(o) {
  const { tile, grain, noShadow, noAO, order, physical, decal, ...p } = o;
  const m = physical ? new THREE.MeshPhysicalMaterial({ vertexColors: true, ...p }) : new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  if (tile) m.userData.tile = Array.isArray(tile) ? tile : [tile, tile];
  if (grain) m.userData.grain = true; if (noShadow) m.userData.noShadow = true; if (noAO) m.userData.noAO = true; if (order) m.userData.order = order; if (decal) m.userData.decal = true;
  return m;
}
const ns = v => new THREE.Vector2(v, v);
// plain finish with the smear maps; jit2: its UV offsets come from the kit's second RNG so layouts stay as they were
function handled(rough, bump) { const t = TEX.smear(), m = std({ roughness: rough, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: ns(bump), tile: 0.8 }); m.userData.jit2 = true; return m; }

export const M = {
  // flat finishes, vertex coloured
  get matte() { return mat('matte', () => std({ roughness: 0.88 })); },
  get satin() { return mat('satin', () => handled(0.58, 0.07)); },
  get gloss() { return mat('gloss', () => handled(0.2, 0.04)); },
  get plastic() { return mat('plastic', () => handled(0.4, 0.05)); },
  get ceramic() { return mat('ceramic', () => std({ roughness: 0.08, physical: true, clearcoat: 0.6, clearcoatRoughness: 0.05 })); },
  get carPaint() { return mat('carPaint', () => std({ roughness: 0.4, metalness: 0.3, physical: true, clearcoat: 1, clearcoatRoughness: 0.06 })); },
  get rubberBlack() { return mat('rubberBlack', () => std({ roughness: 0.9 })); },
  get chrome() { return mat('chrome', () => std({ roughness: 0.12, metalness: 1 })); },
  get metal() { return mat('metal', () => std({ roughness: 0.42, metalness: 1 })); },         // painted/dull metal, tint by vertex colour
  get steel() { return mat('steel', () => { const t = TEX.brushed(); return std({ roughness: 1, metalness: 1, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: ns(0.25), tile: 0.5, grain: true }); }); },
  get brass() { return mat('brass', () => std({ roughness: 0.25, metalness: 1, color: 0xd9a54a })); },
  get mirror() { return mat('mirror', () => std({ roughness: 0.02, metalness: 1, color: 0xdfe6e8, envMapIntensity: 1.6 })); },
  get darkGlass() { return mat('darkGlass', () => std({ roughness: 0.04, metalness: 0.0, color: 0x050607, envMapIntensity: 1.8 })); },
  get glass() { return mat('glass', () => std({ roughness: 0.03, transparent: true, opacity: 0.07, color: 0xe6f2f0, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4, noShadow: true, noAO: true, order: 5 })); },
  get glassTint() { return mat('glassTint', () => std({ roughness: 0.05, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.5, noShadow: true, noAO: true, order: 6 })); },
  get bottle() { return mat('bottle', () => std({ roughness: 0.07, envMapIntensity: 1.6 })); },
  // textured
  get plaster() { return mat('plaster', () => { const t = TEX.plaster(); return std({ ...t, roughness: 1, normalScale: ns(0.5), tile: 2.2 }); }); },
  get popcorn() { return mat('popcorn', () => { const t = TEX.popcorn(); return std({ ...t, roughness: 0.96, normalScale: ns(1.0), tile: 0.7 }); }); },
  get wood() { return mat('wood', () => { const t = TEX.grain(); return std({ ...t, roughness: 1, normalScale: ns(0.35), tile: 0.9, grain: true }); }); },
  get woodGloss() { return mat('woodGloss', () => { const t = TEX.grain(); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.2, normalScale: ns(0.15), tile: 0.9, grain: true }); }); },
  get planks() { return mat('planks', () => { const t = TEX.planks(); return std({ ...t, roughness: 1, normalScale: ns(0.8), tile: 1.6 }); }); },
  get carpet() { return mat('carpet', () => { const t = TEX.carpet(); return std({ ...t, roughness: 1, normalScale: ns(1.2), tile: 0.45 }); }); },
  get carpetTile() { return mat('carpetTile', () => { const t = TEX.carpetTile(); return std({ ...t, roughness: 1, normalScale: ns(1.0), tile: 1.0 }); }); },
  get carpetPattern() { return mat('carpetPattern', () => { const t = TEX.carpetPattern(); return std({ ...t, roughness: 1, normalScale: ns(1.0), tile: 1.1 }); }); },
  tiles(key, tile) { return mat('tiles_' + key, () => { const t = TEX.tiles(key); return std({ ...t, roughness: 1, normalScale: ns(1), tile }); }); },
  get floorStone() { return M.tiles('floorStone', 1.6); },
  get floorWhite() { return M.tiles('floorWhite', 1.2); },
  get wallTile() { return M.tiles('wallWhite', 0.6); },
  get subway() { return M.tiles('subway', [0.6, 0.6]); },
  get chequer() { return M.tiles('chequer', 0.61); },
  get brick() { return M.tiles('brick', [0.675, 0.6]); },
  get block() { return M.tiles('block', [0.88, 0.8]); },
  wallpaper(kind) { return mat('wallpaper_' + kind, () => { const t = TEX.wallpaper(kind); return std({ ...t, roughness: 1, normalScale: ns(0.4), tile: kind === 'stripe' ? 0.9 : 1.06 }); }); },
  get concrete() { return mat('concrete', () => { const t = TEX.concrete(); return std({ ...t, roughness: 1, normalScale: ns(0.9), tile: 3.2 }); }); },
  get rubber() { return mat('rubber', () => { const t = TEX.rubber(); return std({ ...t, roughness: 1, normalScale: ns(0.8), tile: 2 }); }); },
  get fabric() { return mat('fabric', () => { const t = TEX.fabric(); return std({ ...t, roughness: 0.95, normalScale: ns(0.9), tile: 0.2 }); }); },
  get curtain() { return mat('curtain', () => { const t = TEX.fabric(); return std({ ...t, roughness: 0.95, normalScale: ns(0.6), tile: 0.25, side: THREE.DoubleSide }); }); },
  get leather() { return mat('leather', () => { const t = TEX.leather(); return std({ ...t, roughness: 1, normalScale: ns(0.8), tile: 0.35 }); }); },
  get vinyl() { return mat('vinyl', () => { const t = TEX.leather(); return std({ normalMap: t.normalMap, roughness: 0.32, normalScale: ns(0.25), tile: 0.5 }); }); },
  get ceilTile() { return mat('ceilTile', () => { const t = TEX.ceilTile(); return std({ ...t, roughness: 1, normalScale: ns(0.8), tile: 0.6 }); }); },
  get pegboard() { return mat('pegboard', () => { const t = TEX.pegboard(); return std({ ...t, roughness: 1, normalScale: ns(0.8), tile: 0.2 }); }); },
  get bedspread() { return mat('bedspread', () => { const t = TEX.bedspread(); return std({ ...t, roughness: 1, normalScale: ns(0.9), tile: 0.8 }); }); },
  get corrugated() { return mat('corrugated', () => { const t = TEX.corrugated(); return std({ ...t, roughness: 1, metalness: 0.7, normalScale: ns(1.2), tile: [1.2, 0.32] }); }); },
  get lino() { return mat('lino', () => { const t = TEX.lino(); return std({ ...t, roughness: 1, normalScale: ns(0.3), tile: 1.4 }); }); },
  get cork() { return mat('cork', () => { const t = TEX.cork(); return std({ ...t, roughness: 1, normalScale: ns(0.7), tile: 0.5 }); }); },
  get leaf() { return mat('leaf', () => std({ roughness: 0.55, side: THREE.DoubleSide })); },
  // atlases
  get pics() { return mat('pics', () => std({ map: ATLAS.pics.tex, roughness: 0.22 })); },
  get signs() { return mat('signs', () => std({ map: ATLAS.signs.tex, roughness: 0.5 })); },
  get neon() { return mat('neon', () => { const m = new THREE.MeshBasicMaterial({ map: ATLAS.neon.tex, color: new THREE.Color(5, 5, 5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); m.userData.noShadow = true; m.userData.noAO = true; m.userData.order = 8; return m; }); },
  get stain() { return mat('stain', () => std({ decal: true, map: buildStains(), roughness: 0.18, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, noShadow: true, noAO: true, order: 2 })); },
  get grime() { return mat('grime', () => std({ decal: true, map: buildGrime(), roughness: 0.9, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, noShadow: true, noAO: true, order: 2, side: THREE.DoubleSide })); },
  // Multiply decal standing in for baked ambient occlusion and contact shadow. Vertex colour carries the shape:
  // r = strength, then either (g, b) = soft edge as a fraction of the half size in U and V (a blob), or b = 2 for a
  // strip that is darkest along V = 0 and gone by V = 1.
  get ao() { return mat('ao', () => { const m = new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: 'varying vec2 vUv; varying vec3 vC; void main(){ vUv=uv; vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; varying vec3 vC;
      void main(){ float a;
        if(vC.b>1.5){ float t=clamp(1.0-vUv.y,0.0,1.0); a=t*t*(3.0-2.0*t); a*=a; }
        else { vec2 p=abs(vUv*2.0-1.0); vec2 s=clamp(vC.gb,0.02,1.0); vec2 q=clamp((1.0-p)/s,0.0,1.0); q=q*q*(3.0-2.0*q); a=q.x*q.y; }
        float k=clamp(a*vC.r,0.0,0.92); gl_FragColor=vec4(vec3(1.0-k),1.0); }` });
    m.userData.noShadow = true; m.userData.noAO = true; m.userData.order = 1; m.userData.decal = true; return m; }); },
  // Additive light-shaft card: U runs from the window (0) to the far end (1), V across the beam. Vertex colour is the
  // light colour times strength. Cards fade when seen edge-on so a crossed stack of them reads as a volume.
  get shaft() { return mat('shaft', () => { const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U_TIME }, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vC; varying vec3 vW; varying float vF;
      void main(){ vUv=uv; vC=color; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vec3 n=mat3(modelMatrix)*normal; float nl=length(n); vec3 v=cameraPosition-wp.xyz; float l=length(v);
        vF=(nl>1e-5&&l>1e-5)?abs(dot(n/nl,v/l)):1.0; vF*=smoothstep(0.25,1.5,l); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC; varying vec3 vW; varying float vF; uniform float uTime;
      float h31(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      void main(){ float al=clamp(1.0-vUv.x,0.0,1.0); float e=clamp(vUv.y*(1.0-vUv.y)*4.0,0.0,1.0);
        float face=smoothstep(0.04,0.55,vF);
        float a=(0.3+0.7*al*al)*(0.3+0.7*e)*face;
        vec3 q=vW*2.2+vec3(uTime*0.02,-uTime*0.015,uTime*0.017); float cl=0.78+0.22*sin(q.x*1.7+q.y*2.3+q.z*1.3);
        float n=h31(floor(vW*260.0+vec3(0.0,-uTime*0.9,0.0))); float mote=step(0.9988,n)*(0.5+0.5*sin(uTime*1.7+n*900.0));
        gl_FragColor=vec4(vC*(a*cl+mote*al*face*4.0),1.0); }` });
    m.userData.noShadow = true; m.userData.noAO = true; m.userData.order = 7; m.userData.decal = true; return m; }); },
  get lace() { return mat('lace', () => std({ map: buildLace(), roughness: 0.9, alphaTest: 0.5, side: THREE.DoubleSide, noShadow: true })); },
};

// Colour palette (sRGB hex) used across sets so finishes stay consistent.
export const C = {
  white: 0xf2f0ea, offWhite: 0xe6e1d6, cream: 0xe0d6c0, magnolia: 0xe9dfc8, black: 0x101010, dark: 0x26262a, grey: 0x8a8c8e, lightGrey: 0xc4c6c8,
  oak: 0xb98d5a, pine: 0xd8b078, walnut: 0x6a452c, mahog: 0x6e3222, darkWood: 0x3a2619, teak: 0x9a6a3c, whiteWood: 0xeeeae0, beech: 0xd9bb8e,
  red: 0xa8231f, blue: 0x24508c, green: 0x2f6b46, yellow: 0xe0b020, orange: 0xd9691e, teal: 0x2a7a78, navy: 0x1c2a44, burgundy: 0x6a1f2a, sage: 0x9aab8e, mustard: 0xc79a2e,
  terracotta: 0xb5603c, steel: 0xb8bcc0, brass: 0xd9a54a, copper: 0xb87348, cardboard: 0xb08a5a, paper: 0xf4f2ea,
};
