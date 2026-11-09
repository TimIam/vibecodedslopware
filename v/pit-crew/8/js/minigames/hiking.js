// A walk in the woods until it gets dark. No score, no objective, nothing chasing anyone.
// The wood is generated once from a fixed seed and kept: ground, stream, trail and cliff-top view
// are baked into one big canvas, trees and rocks are sprites sorted by depth over it.
import { rect, ellipse, poly, shade, mix, dith, ditherRect, canvas, outline, panel } from '../gfx.js';
import { text, measure } from '../font.js';
import { PEOPLE, TEAMS } from '../data.js';
import { rename } from '../banter.js';

const WW = 2400, WH = 1800, CELL = 4, CW = WW / CELL, CH = WH / CELL;
const DAY = 180; // seconds from late afternoon to full dark
const INK = '#0a0a10';
const START = [640, 1640];
const VIEW = [1620, 212];
const edgeY = x => 168 + 22 * Math.sin(x * 0.0061) + 12 * Math.sin(x * 0.017 + 1);
const streamY = x => 900 + 110 * Math.sin(x * 0.0029 + 1) + 40 * Math.sin(x * 0.0087);
const streamW = x => 10 + 3 * Math.sin(x * 0.01);
const TRAIL = [[600, 1790], [640, 1640], [720, 1470], [640, 1290], [820, 1130], [1010, 1010], [1060, 850], [980, 700], [1180, 560], [1400, 500], [1500, 360], VIEW];
const GLADES = [{ x: 1500, y: 1260, r: 170 }, { x: 540, y: 520, r: 130 }, { x: 1950, y: 660, r: 150 }, { x: 1620, y: 250, r: 110 }, { x: 640, y: 1640, r: 70 }];
const LIGHT = [[0, '#fff2d8'], [0.32, '#ffd9a4'], [0.52, '#ff9e62'], [0.68, '#a06c9a'], [0.84, '#44427e'], [1, '#141a3a']];

function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function noise2(r) {
  const t = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) t[i] = r();
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (i, j) => t[(i * 127 + j * 311) & 4095];
    return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  };
  return (x, y) => n(x, y) * 0.6 + n(x * 2.1 + 7, y * 2.1 + 3) * 0.3 + n(x * 4.3 + 1, y * 4.3 + 9) * 0.1;
}
function catmull(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = a => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lightAt(t) {
  for (let i = 0; i < LIGHT.length - 1; i++) if (t <= LIGHT[i + 1][0]) return mix(LIGHT[i][1], LIGHT[i + 1][1], (t - LIGHT[i][0]) / (LIGHT[i + 1][0] - LIGHT[i][0]));
  return LIGHT[LIGHT.length - 1][1];
}

// ---------------------------------------------------------------- sprites
function conifer(h, pal) {
  const w = Math.round(h * 0.62), [c, b] = canvas(w + 4, h + 4), cx = (w + 4) / 2;
  rect(b, cx - 2, h - 7, 4, 9, '#3f2c1c'); rect(b, cx - 2, h - 7, 1, 9, '#6a4c30');
  const tiers = Math.round(h / 11);
  for (let i = 0; i < tiers; i++) {
    const t0 = 2 + (h - 12) * i / tiers * 0.86, t1 = t0 + (h - 8) / tiers * 1.5, hw = (w / 2) * (i + 1.5) / (tiers + 0.5);
    poly(b, [[cx, t0], [cx + hw, t1], [cx - hw, t1]], pal[0]);
    poly(b, [[cx, t0], [cx - hw * 0.1, t1 - 1], [cx - hw, t1 - 1]], pal[1]);
    poly(b, [[cx - hw * 0.25, t0 + (t1 - t0) * 0.45], [cx - hw * 0.5, t1 - 1], [cx - hw * 0.9, t1 - 1]], pal[2]);
  }
  outline(c);
  return { c, ax: Math.floor(cx), ay: h + 1, w, h, cone: true };
}
function leafy(h, pal, trunk, r) {
  const w = Math.round(h * 0.82), [c, b] = canvas(w + 6, h + 4), cx = (w + 6) / 2;
  rect(b, cx - 2, h * 0.5, 5, h * 0.5 + 2, trunk); rect(b, cx - 2, h * 0.5, 1, h * 0.5 + 2, shade(trunk, 0.35));
  if (trunk === '#d8d4c4') for (let y = h * 0.55; y < h; y += 5) rect(b, cx - 2 + r() * 3, y, 3, 1, '#35322a');
  const blobs = [];
  for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * 0.62; blobs.push([cx + Math.cos(a) * d * w * 0.38, h * 0.36 + Math.sin(a) * d * h * 0.26, w * (0.2 + r() * 0.08)]); }
  for (const [x, y, q] of blobs) ellipse(b, x, y, q, q * 0.88, pal[0]);
  for (const [x, y, q] of blobs) ellipse(b, x - 2, y - 2, q * 0.78, q * 0.68, pal[1]);
  for (const [x, y, q] of blobs) ellipse(b, x - q * 0.42, y - q * 0.44, q * 0.36, q * 0.3, pal[2]);
  outline(c);
  return { c, ax: Math.floor(cx), ay: h + 1, w, h, cone: false };
}
function boulder(rx, ry, moss) {
  const [c, b] = canvas(rx * 2 + 6, ry * 2 + 6), x = rx + 3, y = ry + 3;
  ellipse(b, x, y, rx, ry, '#6a6c70');
  ellipse(b, x - rx * 0.2, y - ry * 0.25, rx * 0.74, ry * 0.62, '#8e9196');
  ellipse(b, x - rx * 0.36, y - ry * 0.46, rx * 0.34, ry * 0.26, '#b4b6b8');
  if (moss) ellipse(b, x + rx * 0.2, y - ry * 0.45, rx * 0.5, ry * 0.3, '#6f8f44');
  outline(c);
  return { c, ax: x, ay: y + ry - 2, w: rx * 2, h: ry * 2, r: rx - 1, rock: true };
}
function deerSprite(flip, head) {
  const [c, b] = canvas(30, 24);
  if (flip) { b.translate(30, 0); b.scale(-1, 1); }
  const hide = '#a8784a', dk = '#7a5230', pale = '#e0c8a0';
  rect(b, 7, 10, 15, 7, hide); rect(b, 7, 15, 15, 2, pale); rect(b, 8, 10, 12, 1, shade(hide, 0.2));
  for (const x of [8, 11, 18, 21]) { rect(b, x, 16, 2, 7, dk); }
  rect(b, 5, 9, 3, 3, pale);
  const hy = head ? 16 : 2, ny = head ? 12 : 6;
  rect(b, 20, ny, 4, head ? 6 : 6, hide);
  rect(b, 22, hy, 6, 4, hide); rect(b, 27, hy + 1, 2, 2, dk); rect(b, 24, hy + 1, 1, 1, INK);
  rect(b, 22, hy - 2, 2, 2, dk);
  outline(c);
  return c;
}
function bake() {
  const r = rng(90210), fbm = noise2(r), fbm2 = noise2(r);
  const [ground, b] = canvas(WW, WH);
  // cell masks: signed distance to the water, distance to the trail, how deep in a glade
  const dS = new Float32Array(CW * CH).fill(999), dT = new Float32Array(CW * CH).fill(999), gl = new Float32Array(CW * CH);
  const stamp = (mask, x, y, w, R) => {
    const c0 = Math.max(0, Math.floor((x - R) / CELL)), c1 = Math.min(CW - 1, Math.ceil((x + R) / CELL));
    const r0 = Math.max(0, Math.floor((y - R) / CELL)), r1 = Math.min(CH - 1, Math.ceil((y + R) / CELL));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) { const d = Math.hypot(i * CELL + 2 - x, j * CELL + 2 - y) - w, k = j * CW + i; if (d < mask[k]) mask[k] = d; }
  };
  for (let x = 0; x < WW; x += 6) stamp(dS, x, streamY(x), streamW(x), 44);
  const path = catmull(TRAIL, 5);
  for (const [x, y] of path) stamp(dT, x, y, 0, 34);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const x = i * CELL + 2, y = j * CELL + 2; let v = 0;
    for (const c of GLADES) v = Math.max(v, 1 - Math.hypot(x - c.x, y - c.y) / c.r);
    gl[j * CW + i] = v + (v > 0 ? (fbm(x * 0.02, y * 0.02) - 0.5) * 0.35 : 0);
  }
  const at = (m, x, y) => m[clamp(Math.floor(y / CELL), 0, CH - 1) * CW + clamp(Math.floor(x / CELL), 0, CW - 1)];

  // beyond the cliff: sky down to the rim
  const SKY = ['#3f7fd0', '#5a98dc', '#80b4e4', '#a8cee8', '#d0e4ea'];
  for (let y = 0; y < 230; y++) { const f = Math.min(0.999, y / 150) * (SKY.length - 1), i = Math.floor(f); rect(b, 0, y, WW, 1, SKY[i]); ditherRect(b, 0, y, WW, 1, SKY[Math.min(SKY.length - 1, i + 1)], f - i); }
  // the floor
  const FOREST = ['#35502a', '#40602c', '#4f7030', '#5f7a36', '#6d7a3c'], MEADOW = ['#6f9a3c', '#83ab44', '#9abf52'], DIRT = ['#9c7e50', '#b0925e', '#c2a470'];
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    const x = i * CELL + 2, y = j * CELL + 2, ed = edgeY(x), k = j * CW + i;
    if (y < ed) continue;
    const n = clamp((fbm(x * 0.012, y * 0.012) - 0.22) / 0.56, 0, 0.999) * (FOREST.length - 1), a = Math.floor(n);
    let col = dith(i, j, n - a) ? FOREST[a + 1] : FOREST[a];
    if (gl[k] > 0 && dith(i, j, gl[k] * 3.4)) { const m = clamp(fbm2(x * 0.02, y * 0.02) * 3, 0, 2.99) | 0; col = MEADOW[m]; }
    if (dS[k] < 6 && dS[k] >= 0) { if (dith(i, j, 1 - dS[k] / 7)) col = dS[k] < 3 ? '#9a8c70' : '#6a6a48'; }
    if (dT[k] < 9) { const f = 1 - clamp((dT[k] - 5) / 4, 0, 1); if (dith(i, j, f)) col = DIRT[clamp(fbm2(x * 0.05, y * 0.05) * 3, 0, 2.99) | 0]; }
    if (dS[k] < 0) { const d = -dS[k]; col = d < 3 ? (dith(i, j, 0.5) ? '#6fb8c4' : '#4f9db4') : d < 7 ? '#3a8aa8' : dith(i, j, 0.4) ? '#2c7898' : '#256c8c'; }
    if (y < ed + 8) col = y < ed + 4 ? (dith(i, j, 0.5) ? '#a8a494' : '#807c6c') : dith(i, j, 0.6) ? col : '#8a8674';
    b.fillStyle = col; b.fillRect(i * CELL, j * CELL, CELL, CELL);
  }
  // small print on the floor
  for (let n = 0; n < 34000; n++) {
    const x = r() * WW | 0, y = r() * WH | 0;
    if (y < edgeY(x) + 8 || at(dS, x, y) < 3 || at(dT, x, y) < 6) continue;
    const g0 = at(gl, x, y);
    if (g0 > 0.1) { if (n % 3 === 0) rect(b, x, y, 1, 2, '#b0cf60'); else if (n % 17 === 0) { const f = ['#fff4c0', '#e8a0d0', '#ffd23a', '#f4f4f4'][n % 4]; rect(b, x, y, 2, 2, f); rect(b, x, y + 2, 1, 2, '#3f6a2c'); } else rect(b, x, y, 1, 2, '#5f8a34'); }
    else if (n % 5 === 0) rect(b, x, y, 2, 1, ['#7a6232', '#8c5a26', '#6a5228'][n % 3]);
    else rect(b, x, y, 1, 2, n % 2 ? '#6d8a3a' : '#2c4424');
  }
  const fern = (x, y, q) => {
    for (let f = 0; f < 7; f++) {
      const a = -Math.PI + f / 6 * Math.PI, L = q * (0.8 + r() * 0.3), c = f % 2 ? '#7fae48' : '#58883a';
      for (let s = 0; s < L; s++) { const px = x + Math.cos(a) * s * 1.2, py = y + Math.sin(a) * s * 0.7 + s * s * 0.012; rect(b, px, py, 1, 1, c); if (s % 2 === 0 && s < L - 2) { rect(b, px + 1, py + 1, 1, 1, c); rect(b, px - 1, py + 1, 1, 1, c); } }
    }
  };
  for (let n = 0; n < 820; n++) { const x = r() * WW, y = r() * WH; if (y > edgeY(x) + 14 && at(dS, x, y) > 8 && at(dT, x, y) > 10 && at(gl, x, y) < 0.15) fern(x, y, 7 + r() * 8); }
  for (let n = 0; n < 240; n++) { const x = r() * WW, y = r() * WH; if (y < edgeY(x) + 14 || at(dS, x, y) < 8 || at(dT, x, y) < 8) continue; rect(b, x, y - 3, 2, 4, '#e8dcc8'); rect(b, x - 2, y - 5, 6, 3, n % 3 ? '#b8452c' : '#e8c070'); rect(b, x - 1, y - 5, 2, 1, '#f4f0e0'); }
  for (let n = 0; n < 420; n++) { const x = r() * WW; const s = streamY(x) + (r() - 0.5) * 40; if (at(dS, x, s) > -2 && at(dS, x, s) < 8) { const q = 1.5 + r() * 2.5; ellipse(b, x, s, q + 1, q * 0.7 + 1, '#3a3e3c'); ellipse(b, x, s, q, q * 0.7, r() < 0.5 ? '#a8a494' : '#8a8878'); } }

  // the bridge, where the trail meets the water
  let bridge = null;
  for (const [x, y] of path) if (at(dS, x, y) < 0) { bridge = { x: Math.round(x), y: Math.round(streamY(x)) }; break; }
  if (bridge) {
    const { x, y } = bridge;
    rect(b, x - 12, y - 28, 24, 56, INK); rect(b, x - 11, y - 27, 22, 54, '#8a6238');
    for (let py = y - 27; py < y + 27; py += 5) { rect(b, x - 11, py, 22, 4, py % 2 ? '#a87c4c' : '#986e42'); rect(b, x - 11, py, 22, 1, '#c09a64'); }
    rect(b, x - 13, y - 30, 3, 60, '#5e4226'); rect(b, x + 10, y - 30, 3, 60, '#5e4226');
    rect(b, x - 13, y - 30, 1, 60, '#8a6a42'); rect(b, x + 10, y - 30, 1, 60, '#8a6a42');
  }

  // the view: far peaks over a hazy valley, on their own layer so the sun can set behind them
  const [peaks, p] = canvas(WW, 240);
  const ridge = (spacing, top, vary, base, lit, dark, snow, snowDark, snowLine) => {
    const list = [];
    for (let x = -80; x < WW + 200; x += spacing * (0.7 + r() * 0.7)) list.push([x, top + r() * vary, 0.55 + r() * 0.4]);
    for (let x = 0; x < WW; x++) {
      let t = 1e9, pc = 0;
      for (const [c, q, s] of list) { const v = q + Math.abs(x - c) * s; if (v < t) { t = v; pc = c; } }
      const y = Math.round(t + Math.sin(x * 0.21) * 1.6 + Math.sin(x * 0.07) * 2), end = Math.round(edgeY(x)) - 1;
      if (y >= end) continue;
      const east = x > pc + Math.sin(x * 0.13 + y * 0.2) * 6;
      rect(p, x, y, 1, end - y, east ? dark : lit);
      if (snow) { const l = Math.round(snowLine + Math.sin(x * 0.37) * 5 + Math.sin(x * 0.11) * 4); if (y < l) rect(p, x, y, 1, l - y, east ? snowDark : snow); }
    }
  };
  ridge(110, 70, 34, 200, '#8ca0bc', '#6f86a6', '#f4f8fa', '#c4d4e4', 92);
  ridge(80, 108, 22, 200, '#6a8a90', '#587880', null);
  for (let x = 0; x < WW; x++) { const y = Math.round(138 + Math.sin(x * 0.02) * 5 + Math.sin(x * 0.07 + 2) * 2), end = Math.round(edgeY(x)) - 1; if (y < end) rect(p, x, y, 1, end - y, (x >> 1) % 7 ? '#3f6a58' : '#477460'); }

  // sprites
  const pals = [['#16382a', '#245038', '#3a7048'], ['#1a3f34', '#2a5a44', '#44805a'], ['#20402a', '#305c34', '#4c7f46']];
  const leaf = [['#35602a', '#508234', '#78a84a'], ['#4a6a24', '#6f9234', '#a0bc50'], ['#2c5a30', '#44803c', '#6aa652']];
  const SPR = {
    con: [conifer(44, pals[0]), conifer(56, pals[1]), conifer(68, pals[0]), conifer(36, pals[2])],
    leaf: [leafy(46, leaf[0], '#4a3420', r), leafy(58, leaf[1], '#4a3420', r), leafy(50, leaf[2], '#d8d4c4', r)],
    rock: [boulder(9, 6, true), boulder(13, 9, false), boulder(18, 12, true), boulder(7, 5, false)],
    deer: [deerSprite(false, false), deerSprite(false, true), deerSprite(true, false), deerSprite(true, true)],
  };
  const [bench, bb] = canvas(30, 14);
  rect(bb, 2, 2, 26, 4, '#8a6238'); rect(bb, 2, 2, 26, 1, '#b08a58'); rect(bb, 2, 7, 26, 4, '#a07448'); rect(bb, 2, 7, 26, 1, '#c09a64'); rect(bb, 4, 10, 3, 4, '#5e4226'); rect(bb, 23, 10, 3, 4, '#5e4226'); outline(bench);
  const [sign, sb] = canvas(16, 26);
  rect(sb, 7, 8, 3, 18, '#5e4226'); rect(sb, 1, 2, 14, 9, '#a07448'); rect(sb, 1, 2, 14, 1, '#c09a64'); rect(sb, 3, 5, 10, 1, '#3a2412'); rect(sb, 3, 7, 7, 1, '#3a2412'); outline(sign);
  SPR.bench = { c: bench, ax: 15, ay: 13, w: 30, h: 14, r: 12, rock: true };
  SPR.sign = { c: sign, ax: 8, ay: 25, w: 16, h: 26, r: 3, rock: true };

  // what stands on the floor, sorted by depth
  const things = [];
  const ok = (x, y, gap) => y > edgeY(x) + 30 && at(dS, x, y) > gap && at(dT, x, y) > gap && at(gl, x, y) < 0.02 && Math.hypot(x - START[0], y - START[1]) > 60;
  for (let gy = 0; gy < WH; gy += 34) for (let gx = 0; gx < WW; gx += 34) {
    const x = gx + r() * 30, y = gy + r() * 30, edge = Math.min(x, WW - x, WH - y);
    const keep = edge < 90 ? 0.95 : 0.08 + fbm2(x * 0.006, y * 0.006) * 0.72;
    if (r() > keep || !ok(x, y, 14)) continue;
    const conifers = y < 900 ? 0.8 : 0.45, s = r() < conifers ? SPR.con[r() * 4 | 0] : SPR.leaf[r() * 3 | 0];
    things.push({ x, y, s, ph: r() * 6.28, r: 5, solid: true });
  }
  for (let n = 0; n < 220; n++) {
    const x = r() * WW, y = r() * WH;
    if (ok(x, y, 12)) { const s = SPR.rock[r() * 4 | 0]; things.push({ x, y, s, ph: 0, r: s.r, solid: true }); }
  }
  for (const [x, y] of [[VIEW[0] - 62, edgeY(VIEW[0] - 62) + 15], [VIEW[0] + 64, edgeY(VIEW[0] + 64) + 18], [VIEW[0] + 88, edgeY(VIEW[0] + 88) + 26]]) { const s = SPR.rock[1 + (x & 1)]; things.push({ x, y, s, ph: 0, r: s.r, solid: true }); }
  things.push({ x: VIEW[0] + 22, y: edgeY(VIEW[0] + 22) + 22, s: SPR.bench, ph: 0, r: 12, solid: true });
  things.push({ x: START[0] + 26, y: START[1] - 18, s: SPR.sign, ph: 0, r: 3, solid: true });
  things.sort((a, q) => a.y - q.y);
  const grid = new Map();
  for (const t of things) { const k = (t.x >> 6) + (t.y >> 6) * 4096; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t); }
  const stars = []; for (let n = 0; n < 900; n++) stars.push([r() * WW | 0, r() * 86 | 0, r() * 6.28]);
  return { ground, peaks, things, grid, SPR, dS, at, bridge, stars, gl };
}
let world = null; // baked once and kept: stepping through the scenes does not build the wood again

export default function make(ctx) {
  const { g, W, H, A } = ctx;
  const who = ['mags', 'toby', 'lou', 'dev', 'pip'][Math.floor(Math.random() * 5)], me = PEOPLE[who];
  const shortName = rename(me.name.charAt(0) + me.name.slice(1).toLowerCase().replace(/ l/, ' L'));
  let w = null, clock = 0, t = 0, ended = false, endT = 0, moved = 0, hint = 1;
  let px = START[0], py = START[1], vx = 0, vy = 0, dir = 0, dist = 0, camX = 0, camY = 0, wet = false;
  let note = '', noteT = 0;
  const NOTES = [
    { x: VIEW[0], y: VIEW[1] - 20, r: 90, s: 'The whole valley. Nobody needs you for anything.' },
    { x: GLADES[0].x, y: GLADES[0].y, r: 110, s: 'A clearing. Nothing happening in it, beautifully.' },
    { x: GLADES[1].x, y: GLADES[1].y, r: 90, s: 'Grass, flowers, no radio. Bliss.' },
    { x: GLADES[2].x, y: GLADES[2].y, r: 100, s: `${shortName} sits down for a minute. Then a few more.` },
  ];
  const deer = [], birds = [], flies = [], ripples = [];
  const [shade0, sg] = canvas(W, H);

  function spot(far) {
    for (let i = 0; i < 40; i++) {
      const x = 80 + Math.random() * (WW - 160), y = 260 + Math.random() * (WH - 340);
      if (w.at(w.dS, x, y) < 10) continue;
      if (far && Math.hypot(x - px, y - py) < 420) continue;
      return [x, y];
    }
    return [px + 500, py];
  }
  function push() {
    const cx = px >> 6, cy = py >> 6;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      const cell = w.grid.get(i + j * 4096);
      if (cell) for (const o of cell) {
        const dx = px - o.x, dy = (py - o.y) * 1.25, d = Math.hypot(dx, dy), R = o.r + 5;
        if (d < R && d > 0.001) { px = o.x + dx / d * R; py = o.y + dy / d * R / 1.25; }
      }
    }
    px = clamp(px, 22, WW - 22);
    py = clamp(py, edgeY(px) + 14, WH - 18);
  }
  function drawHiker(x, y) {
    x = Math.round(x); y = Math.round(y);
    const tm = TEAMS[0], skin = me.skin, hair = me.hair, shirt = tm.c1, pack = tm.c2, walking = Math.hypot(vx, vy) > 8;
    const st = walking ? Math.sin(dist / 4.5) : 0, a = Math.round(st * 2), b0 = walking ? Math.round(Math.abs(st)) : 0;
    const R = (px0, py0, w0, h0, c) => rect(g, x + px0, y + py0 - b0, w0, h0, c);
    if (dir === 1 || dir === 3) {
      const f = dir === 1 ? 1 : -1, L = (k, c) => rect(g, x - 2 + k, y - 7, 4, 7, c);
      L(a * f, INK); L(-a * f, INK);
      rect(g, x - 1 + a * f, y - 7, 2, 6, '#7a6a4a'); rect(g, x - 1 - a * f, y - 7, 2, 6, '#6a5a3e');
      rect(g, x - 2 + a * f, y - 2, 4, 2, '#3a2a1c'); rect(g, x - 2 - a * f, y - 2, 4, 2, '#2c2016');
      R(-4, -15, 8, 9, INK); R(-3, -14, 6, 8, shirt); R(-3, -14, 6, 2, shade(shirt, 0.25));
      R(-f * 6 - 2, -15, 5, 9, INK); R(-f * 6 - 1, -14, 3, 7, pack); R(-f * 6 - 1, -14, 3, 1, shade(pack, 0.3));
      R(a * f - 1, -13, 2, 6, skin);
      R(-5, -24, 10, 10, INK); R(-4, -23, 8, 8, skin);
      R(-4, -23, 8, 3, hair || skin); R(-f * 3 - 1, -23, 3, 5, hair || skin);
      R(f * 2 - 1, -19, 2, 2, INK);
      if (me.moustache) R(f * 2 - 1, -17, 3, 1, hair);
      return;
    }
    const L0 = -4 + (a > 0 ? 1 : 0), R0 = 1 - (a < 0 ? 1 : 0);
    rect(g, x - 5, y - 7, 10, 7, INK);
    rect(g, x + L0, y - 7 + Math.max(0, a), 3, 5 - Math.max(0, a), '#7a6a4a'); rect(g, x + R0, y - 7 + Math.max(0, -a), 3, 5 - Math.max(0, -a), '#6a5a3e');
    rect(g, x + L0, y - 2, 3, 2, '#3a2a1c'); rect(g, x + R0, y - 2, 3, 2, '#3a2a1c');
    R(-6, -15, 12, 9, INK); R(-5, -14, 10, 8, shirt); R(-5, -14, 10, 2, shade(shirt, 0.25));
    R(-7, -14, 2, 7, INK); R(5, -14, 2, 7, INK); R(-6, -13, 1, 5, skin); R(5, -13, 1, 5, skin);
    if (dir === 0) { R(-5, -16, 10, 11, INK); R(-4, -15, 8, 9, pack); R(-4, -15, 8, 2, shade(pack, 0.3)); R(-3, -11, 6, 1, shade(pack, -0.3)); }
    else { R(-3, -14, 1, 7, shade(pack, -0.1)); R(2, -14, 1, 7, shade(pack, -0.1)); }
    R(-5, -24, 10, 10, INK); R(-4, -23, 8, 8, dir === 0 ? hair || skin : skin);
    if (dir !== 0) { if (hair) { R(-4, -23, 8, 3, hair); if (me.hairStyle === 'bob' || me.hairStyle === 'mop') { R(-5, -22, 2, 7, hair); R(3, -22, 2, 7, hair); } } R(-3, -19, 2, 2, INK); R(1, -19, 2, 2, INK); if (me.moustache) R(-2, -16, 4, 1, hair); }
  }

  return {
    enter() {
      w = world || (world = bake());
      for (let i = 0; i < 9; i++) { const [x, y] = spot(i > 3); deer.push({ x, y, s: 'graze', t: Math.random() * 4, flip: Math.random() < 0.5, vx: 0, vy: 0, gone: 0 }); }
      deer[0].x = START[0] + 150; deer[0].y = START[1] - 150;
      for (let i = 0; i < 16; i++) { const [x, y] = spot(false); birds.push({ x, y, z: 0, s: 'peck', t: Math.random() * 2, vx: 0, vy: 0, c: ['#6a4a30', '#3a4a6a', '#a04030'][i % 3] }); }
      for (let i = 0; i < 90; i++) flies.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * 6.28, s: 1 + Math.random() * 1.6 });
      camX = clamp(px - W / 2, 0, WW - W); camY = clamp(py - H / 2, 0, WH - H);
    },
    update(dt, io) {
      clock += dt;
      noteT -= dt;
      if (!ended) {
        t += dt / DAY;
        if (t >= 1) { t = 1; ended = true; vx = 0; vy = 0; A.sfx('ding'); ctx.done(); }
      } else endT += dt;
      if (!ended) {
        const ix = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
        const iy = (io.held('KeyS') || io.held('ArrowDown') ? 1 : 0) - (io.held('KeyW') || io.held('ArrowUp') ? 1 : 0);
        const L = Math.hypot(ix, iy) || 1;
        wet = w.at(w.dS, px, py) < -1 && !(w.bridge && Math.abs(px - w.bridge.x) < 13 && Math.abs(py - w.bridge.y) < 30);
        const spd = wet ? 42 : 76;
        const k = Math.min(1, dt * 12);
        vx += (ix / L * spd - vx) * k; vy += (iy / L * spd - vy) * k;
        if (ix || iy) { moved += dt; if (Math.abs(ix) >= Math.abs(iy) && ix) dir = ix > 0 ? 1 : 3; else if (iy) dir = iy > 0 ? 2 : 0; }
        const ox = px, oy = py;
        px += vx * dt; py += vy * dt;
        push();
        dist += Math.hypot(px - ox, py - oy);
        if (wet && Math.random() < dt * Math.hypot(vx, vy) * 0.12) ripples.push({ x: px, y: py, a: 0 });
        for (const n of NOTES) if (!n.done && Math.hypot(px - n.x, py - n.y) < n.r) { n.done = true; note = n.s; noteT = 4.5; A.sfx('blip', 660); }
      }
      if (moved > 2.5 || clock > 9) hint = Math.max(0, hint - dt * 1.2);
      // the camera leans a little into the walk
      const tx = clamp(px + vx * 0.35 - W / 2, 0, WW - W), ty = clamp(py - 12 + vy * 0.35 - H / 2, 0, WH - H);
      camX += (tx - camX) * Math.min(1, dt * 5); camY += (ty - camY) * Math.min(1, dt * 5);
      for (const d of deer) {
        const pd = Math.hypot(px - d.x, py - d.y);
        d.t -= dt;
        if (d.s !== 'flee' && pd < 86) { d.s = 'flee'; const n = pd || 1; d.vx = (d.x - px) / n * 150; d.vy = (d.y - py) / n * 150; d.flip = d.vx < 0; d.t = 2.4; A.sfx('whoosh'); }
        else if (d.s === 'graze' && d.t <= 0) { d.s = 'walk'; const a = Math.random() * 6.28; d.vx = Math.cos(a) * 16; d.vy = Math.sin(a) * 16; d.flip = d.vx < 0; d.t = 1.5 + Math.random() * 3; }
        else if (d.s === 'walk' && d.t <= 0) { d.s = 'graze'; d.vx = d.vy = 0; d.t = 2 + Math.random() * 5; }
        else if (d.s === 'flee' && d.t <= 0 && pd > 340) { const [x, y] = spot(true); d.x = x; d.y = y; d.s = 'graze'; d.vx = d.vy = 0; d.t = 3; }
        else if (d.s === 'flee' && d.t <= 0) { d.vx *= 0.97; d.vy *= 0.97; d.t = 0.2; }
        d.x = clamp(d.x + d.vx * dt, 30, WW - 30); d.y = clamp(d.y + d.vy * dt, edgeY(d.x) + 30, WH - 30);
      }
      for (const q of birds) {
        q.t -= dt;
        if (q.s === 'peck') { if (Math.hypot(px - q.x, py - q.y) < 62) { q.s = 'fly'; const a = Math.atan2(q.y - py, q.x - px) + (Math.random() - 0.5); q.vx = Math.cos(a) * 110; q.vy = Math.sin(a) * 110; q.t = 3; A.sfx('blip', 900 + Math.random() * 500); } }
        else { q.x += q.vx * dt; q.y += q.vy * dt; q.z += dt * 46; if (q.t <= 0) { const [x, y] = spot(true); q.x = x; q.y = y; q.z = 0; q.s = 'peck'; q.t = 2; } }
      }
      for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].a += dt; if (ripples[i].a > 0.8) ripples.splice(i, 1); }
    },
    draw() {
      const T = clock; // our own clock: the host calls draw without a time
      if (!w) return;
      const cx = Math.round(camX), cy = Math.round(camY);
      g.drawImage(w.ground, cx, cy, W, H, 0, 0, W, H);
      if (cy < 240) {
        const sx = 1490 - cx, sy = 26 + t * 170 - cy, sc = mix('#fff8d8', '#ff7a30', clamp(t * 1.5, 0, 1));
        ellipse(g, sx, sy, 22, 22, mix(sc, '#d8e0ea', 0.6)); ellipse(g, sx, sy, 15, 15, sc);
        g.drawImage(w.peaks, cx, cy, W, Math.min(H, 240 - cy), 0, 0, W, Math.min(H, 240 - cy));
      }
      // the stream sliding by
      const sy0 = streamY(cx + W / 2);
      if (sy0 > cy - 220 && sy0 < cy + H + 220) for (let x = cx - (cx % 6); x < cx + W; x += 6) for (let k = 0; k < 3; k++) {
        const wd = streamW(x), lane = Math.sin(x * 0.7 + k * 2.1) * wd * 0.68, y = streamY(x) + lane;
        if (Math.sin(T * 2.6 + x * 0.31 + k) < 0.1) continue;
        if (w.bridge && Math.abs(x - w.bridge.x) < 16 && Math.abs(y - w.bridge.y) < 30) continue;
        rect(g, x + (T * 24 + k * 7 + x * 1.7) % 6 - cx, y - cy, 3 + k, 1, k ? '#a8e0e4' : '#e4fafa');
      }
      for (const q of ripples) { const n = 12, r0 = 3 + q.a * 12; g.fillStyle = '#d8f4f4'; for (let i = 0; i < n; i++) g.fillRect(Math.round(q.x - cx + Math.cos(i / n * 6.28) * r0), Math.round(q.y - cy + Math.sin(i / n * 6.28) * r0 * 0.5), 1, 1); }
      // collect what is on screen, by depth
      const vis = [];
      let lo = 0, hi = w.things.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (w.things[m].y < cy - 40) lo = m + 1; else hi = m; }
      for (let i = lo; i < w.things.length; i++) {
        const o = w.things[i];
        if (o.y > cy + H + 100) break;
        if (o.x > cx - 70 && o.x < cx + W + 70) vis.push(o);
      }
      // long shadows on their own layer, so overlaps do not double up
      const ang = 0.18 + t * 0.32, dx = Math.cos(ang), dy = Math.sin(ang), perp = [-dy, dx];
      const len = 0.42 + Math.min(1, t / 0.56) * 2.7, sa = t < 0.6 ? 0.28 + t * 0.22 : Math.max(0, 0.41 * (1 - (t - 0.6) / 0.26));
      if (sa > 0.01) {
        sg.clearRect(0, 0, W, H);
        const P = (x, y, hw, along) => [[x + perp[0] * hw + dx * along, y + perp[1] * hw + dy * along], [x - perp[0] * hw + dx * along, y - perp[1] * hw + dy * along]];
        for (const o of vis) {
          const s = o.s, x = o.x - cx, y = o.y - cy, L = s.h * len, wid = s.w * 0.42;
          if (s.rock) { const [a, b0] = P(x, y, s.w * 0.45, 0), [c, e] = P(x, y, s.w * 0.3, L * 0.55); poly(sg, [a, c, e, b0], '#0a1428'); continue; }
          const [a, b0] = P(x, y, 3, 0);
          if (s.cone) { const [c, e] = P(x, y, wid, L * 0.3); poly(sg, [a, c, [x + dx * L, y + dy * L], e, b0], '#0a1428'); }
          else { const [c, e] = P(x, y, wid, L * 0.55), [c2, e2] = P(x, y, wid * 0.6, L * 0.95); poly(sg, [a, c, c2, e2, e, b0], '#0a1428'); }
        }
        const [a, b0] = P(px - cx, py - cy, 5, 0), [c, e] = P(px - cx, py - cy, 4, 24 * len);
        poly(sg, [a, c, e, b0], '#0a1428');
        g.globalAlpha = sa; g.drawImage(shade0, 0, 0); g.globalAlpha = 1;
      }
      const list = vis.map(o => ({ y: o.y, o }));
      list.push({ y: py, me: true });
      for (const d of deer) if (d.x > cx - 40 && d.x < cx + W + 40 && d.y > cy - 30 && d.y < cy + H + 30) list.push({ y: d.y, d });
      for (const q of birds) if (q.x > cx - 20 && q.x < cx + W + 20 && q.y > cy - 20 && q.y < cy + H + 20) list.push({ y: q.y, q });
      list.sort((a, b) => a.y - b.y);
      for (const it of list) {
        if (it.me) { if (wet) { rect(g, px - cx - 6, py - cy - 1, 12, 2, '#a8e0e4'); } drawHiker(px - cx, py - cy); continue; }
        if (it.d) {
          const d = it.d, walk = d.s !== 'graze';
          const fr = (d.flip ? 2 : 0) + (walk ? 0 : 1);
          const hop = d.s === 'flee' ? Math.abs(Math.sin(T * 12)) * 6 : 0;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(d.x - cx) - 10, Math.round(d.y - cy) - 1, 20, 3);
          g.drawImage(w.SPR.deer[fr], Math.round(d.x - cx - 15), Math.round(d.y - cy - 23 - hop));
          continue;
        }
        if (it.q) {
          const q = it.q, x = Math.round(q.x - cx), y = Math.round(q.y - cy), flap = q.s === 'fly' && (T * 18 % 1) < 0.5;
          rect(g, x - 1, y, 4, 1, 'rgba(0,0,0,0.3)');
          const yy = y - 3 - Math.round(q.z) - (q.s === 'peck' && (T * 3 + q.x) % 1 < 0.15 ? 1 : 0);
          rect(g, x - 1, yy, 4, 3, q.c); rect(g, x + 3, yy, 1, 1, '#e8a830');
          if (q.s === 'fly') { rect(g, x - 3, yy + (flap ? -1 : 1), 3, 1, q.c); rect(g, x + 3, yy + (flap ? -1 : 1), 3, 1, q.c); }
          continue;
        }
        const o = it.o, s = o.s, x = Math.round(o.x - cx - s.ax), y = Math.round(o.y - cy - s.ay);
        const hides = !s.rock && o.y > py && o.y - s.h < py - 4 && Math.abs(o.x - px) < s.w * 0.5;
        if (hides) g.globalAlpha = 0.45;
        if (s.rock) g.drawImage(s.c, x, y);
        else {
          const cut = Math.round(s.h * 0.55), sway = Math.round(Math.sin(T * 0.9 + o.ph) * 1.2);
          g.drawImage(s.c, 0, 0, s.c.width, cut, x + sway, y, s.c.width, cut);
          g.drawImage(s.c, 0, cut, s.c.width, s.c.height - cut, x, y + cut, s.c.width, s.c.height - cut);
        }
        g.globalAlpha = 1;
      }
      // the light: multiply a moving tint over everything
      g.globalCompositeOperation = 'multiply';
      rect(g, 0, 0, W, H, lightAt(t));
      g.globalCompositeOperation = 'source-over';
      const beam = t > 0.18 && t < 0.72 ? Math.sin((t - 0.18) / 0.54 * Math.PI) : 0;
      if (beam > 0.02) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.055 * beam;
        for (let i = 0; i < 5; i++) { const x0 = ((i * 137 - cx * 0.6) % 700 + 700) % 700 - 160, wd = 22 + i * 9; poly(g, [[x0, 0], [x0 + wd, 0], [x0 + wd + 190, H], [x0 + 190, H]], '#ffc070'); }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      if (cy < 90 && t > 0.62) {
        g.globalAlpha = clamp((t - 0.62) / 0.2, 0, 1);
        for (const [x, y, p] of w.stars) if (x >= cx && x < cx + W && y >= cy && Math.sin(T * 2 + p) > -0.5) rect(g, x - cx, y - cy, 1, 1, '#f4f4d8');
        g.globalAlpha = 1;
      }
      // fireflies from dusk on
      const nf = Math.round(clamp((t - 0.58) / 0.26, 0, 1) * flies.length);
      for (let i = 0; i < nf; i++) {
        const f = flies[i], x = ((f.x + Math.sin(T * 0.5 * f.s + f.p) * 22 - cx * 0.9) % W + W) % W, y = ((f.y + Math.cos(T * 0.7 * f.s + f.p) * 16 - cy * 0.9) % H + H) % H;
        const glow = Math.sin(T * f.s * 1.8 + f.p);
        if (glow < 0.15) continue;
        if (glow > 0.6) { g.globalAlpha = 0.35; rect(g, x - 2, y, 5, 1, '#c8ff70'); rect(g, x, y - 2, 1, 5, '#c8ff70'); g.globalAlpha = 1; }
        rect(g, x, y, 2, 2, '#f4ffa8');
      }
      if (hint > 0) {
        const s = 'WASD OR ARROWS: WANDER UNTIL DARK', tw = measure(s);
        g.globalAlpha = hint; panel(g, W / 2 - tw / 2 - 8, 262, tw + 16, 16); text(g, s, W / 2, 267, '#ffe9a8', { align: 'center' }); g.globalAlpha = 1;
      }
      if (noteT > 0 && !ended) {
        g.globalAlpha = clamp(noteT, 0, 1);
        text(g, rename(note), W / 2, 248, '#fff4d8', { align: 'center', outline: INK });
        g.globalAlpha = 1;
      }
      if (ended) {
        const a = clamp(endT / 1.4, 0, 1), y = 122 - Math.round((1 - a) * 6);
        const line1 = "It's dark.", line2 = 'Time to head back.', tw = measure(line2, 2);
        g.globalAlpha = a;
        panel(g, W / 2 - tw / 2 - 14, y, tw + 28, 46, { fill: '#10142a' });
        text(g, line1, W / 2, y + 9, '#f4e8c8', { align: 'center', scale: 2 });
        text(g, line2, W / 2, y + 27, '#ffffff', { align: 'center', scale: 2 });
        g.globalAlpha = 1;
      }
    },
    leave() {},
  };
}
