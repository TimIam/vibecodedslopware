// Toil & Trouble — holiday-world parallax backdrops (set B).
//
// Same house style and API as backgrounds.js: every layer is rasterised once,
// pixel by pixel, into an offscreen canvas (limited palettes, ordered
// dithering, no anti-aliasing) and blitted at whole-pixel offsets each frame.
// Per-frame work is blits, a few flickering glow sprites and a few dozen
// particles. Deterministic per (theme, seed); no Math.random.
//
//   makeBackground(theme, { W, H, levelW, levelH, seed })
//     -> { drawBack(ctx, camX, camY, t), drawFront(ctx, camX, camY, t), fog }

export const THEMES = ['easter_out', 'easter_in', 'val_out', 'val_in', 'thanks_out', 'thanks_in', 'xmas_out', 'xmas_in'];

// ---------------------------------------------------------------------------
// maths, randomness, noise

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function h2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise1(seed, cells, period) {
  const cw = period / cells;
  return x => {
    const g = x / cw, i = Math.floor(g), f = smooth(g - i);
    const a = ((i % cells) + cells) % cells;
    return lerp(h2(a, 0, seed), h2((a + 1) % cells, 0, seed), f);
  };
}
function fbm1(seed, cells, period, oct = 4) {
  const fs = [];
  for (let o = 0; o < oct; o++) fs.push(noise1(seed + o * 7919, cells << o, period));
  return x => {
    let s = 0, a = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += fs[o](x) * a; n += a; a *= 0.5; }
    return s / n;
  };
}
function noise2(seed, cellsX, period, cellH) {
  const cw = period / cellsX;
  return (x, y) => {
    const gx = x / cw, gy = y / cellH;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = smooth(gx - ix), fy = smooth(gy - iy);
    const a = ((ix % cellsX) + cellsX) % cellsX, b = (a + 1) % cellsX;
    return lerp(lerp(h2(a, iy, seed), h2(b, iy, seed), fx), lerp(h2(a, iy + 1, seed), h2(b, iy + 1, seed), fx), fy);
  };
}
function fbm2(seed, cellsX, period, cellH, oct = 3) {
  const fs = [];
  for (let o = 0; o < oct; o++) fs.push(noise2(seed + o * 104729, cellsX << o, period, cellH / (1 << o)));
  return (x, y) => {
    let s = 0, a = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += fs[o](x, y) * a; n += a; a *= 0.5; }
    return s / n;
  };
}
function interp(stops, d) {
  if (d <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      return a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
    }
  }
  return stops[stops.length - 1][1];
}
function wrapD(d, w) { d %= w; if (d > w / 2) d -= w; else if (d < -w / 2) d += w; return d; }
function wrapP(v, w) { v %= w; return v < 0 ? v + w : v; }
const tri = x => Math.abs(wrapP(x, 1) - 0.5) * 2; // 1 at integers, 0 at halves

// ---------------------------------------------------------------------------
// colour + dithering

function hex(h, a = 255) {
  const n = parseInt(h.slice(1), 16);
  return (((a & 255) << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0;
}
const pal = arr => arr.map(h => hex(h));
const withA = (c, a) => (((c & 0xffffff) | ((a & 255) << 24)) >>> 0);
function mixc(c1, c2, t) {
  const r = lerp(c1 & 255, c2 & 255, t), g = lerp((c1 >>> 8) & 255, (c2 >>> 8) & 255, t),
    b = lerp((c1 >>> 16) & 255, (c2 >>> 16) & 255, t), a = Math.max(c1 >>> 24, c2 >>> 24);
  return ((a << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

const B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const bay = (x, y) => (B8[((y & 7) << 3) | (x & 7)] + 0.5) / 64;
const dq = (v, x, y) => { const i = Math.floor(v); return v - i > bay(x, y) ? i + 1 : i; };
function rp(p, v, x, y) { const i = dq(v, x, y); return p[i < 0 ? 0 : i >= p.length ? p.length - 1 : i]; }

// ---------------------------------------------------------------------------
// pixel buffers

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

class Buf {
  constructor(w, h, wrap = true) { this.w = w; this.h = h; this.wrap = wrap; this.d = new Uint32Array(w * h); }
  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.h) return;
    if (this.wrap) { x %= this.w; if (x < 0) x += this.w; } else if (x < 0 || x >= this.w) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.h) return 0;
    if (this.wrap) { x %= this.w; if (x < 0) x += this.w; } else if (x < 0 || x >= this.w) return 0;
    return this.d[y * this.w + x];
  }
  P(c) { return (x, y) => this.set(x, y, c); }
  canvas() {
    const c = mkCanvas(this.w, this.h), g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    img.data.set(new Uint8ClampedArray(this.d.buffer));
    g.putImageData(img, 0, 0);
    return c;
  }
}
class Mask {
  constructor(w, h, wrap = true) { this.w = w; this.h = h; this.wrap = wrap; this.m = new Uint8Array(w * h); }
  set(x, y, v) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.h) return;
    if (this.wrap) { x %= this.w; if (x < 0) x += this.w; } else if (x < 0 || x >= this.w) return;
    this.m[y * this.w + x] = v;
  }
  at(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= this.h) return 0;
    if (this.wrap) { x %= this.w; if (x < 0) x += this.w; } else if (x < 0 || x >= this.w) return 0;
    return this.m[y * this.w + x];
  }
  P(v = 1) { return (x, y) => this.set(x, y, v); }
}
function edgeDist(m, x, y, dx, dy, n) {
  for (let k = 1; k <= n; k++) if (!m.at(x + dx * k, y + dy * k)) return k;
  return n + 1;
}
// same, but "empty" means any value other than k
function edgeDistK(m, x, y, dx, dy, n, k) {
  for (let i = 1; i <= n; i++) if (m.at(x + dx * i, y + dy * i) !== k) return i;
  return n + 1;
}
// paint every set mask pixel with fn(x, y, k) -> colour (0 = leave)
function paint(m, b, fn) {
  const w = m.w, h = m.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = m.m[y * w + x]; if (!k) continue;
    const c = fn(x, y, k); if (c) b.d[y * w + x] = c;
  }
}

// ---------------------------------------------------------------------------
// rasterisers (all take plot(x, y))

function rLine(x0, y0, x1, y1, plot) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let guard = 0; guard < 4000; guard++) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function rDisc(cx, cy, r, plot) {
  const rr = r * r + 0.25;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++) {
    const dy = y + 0.5 - cy;
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= rr) plot(x, y);
    }
  }
}
function rEllipse(cx, cy, rx, ry, plot) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (dx * dx + dy * dy <= 1) plot(x, y);
    }
  }
}
function rSeg(x0, y0, x1, y1, r0, r1, plot) {
  if (Math.max(r0, r1) < 0.75) { rLine(x0, y0, x1, y1, plot); return; }
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rDisc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, plot);
  }
}
function rPoly(pts, plot) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const n = pts.length;
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + (yc - yi) / (yj - yi) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) plot(x, y);
  }
}
function rRect(x, y, w, h, plot) {
  for (let j = Math.floor(y); j < Math.floor(y + h); j++) for (let i = Math.floor(x); i < Math.floor(x + w); i++) plot(i, j);
}
// quadratic-ish sagging curve between two points (catenary stand-in)
function rSag(x0, y0, x1, y1, sag, plot, thick = 0) {
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0)));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t) + sag * 4 * t * (1 - t);
    if (thick) rSeg(px, py, x, y, thick, thick, plot); else rLine(px, py, x, y, plot);
    px = x; py = y;
  }
}
const sagY = (x0, y0, x1, y1, sag, t) => lerp(y0, y1, t) + sag * 4 * t * (1 - t);
function spr(b, x, y, rows, map) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c !== undefined) b.set(x + i, y + j, c); }
  }
}
// heart test, u/v normalised so the heart spans roughly [-1,1] x [-1,1] (v down)
function inHeart(u, v) {
  const x = u * 1.18, y = -v * 1.18 + 0.18;
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}
function glowInto(b, cx, cy, r, col, amax, onlyOpaque = false) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1) continue;
      const a = amax * Math.pow(1 - d, 1.4);
      const q = dq(a * 4, x, y) / 4;
      if (q <= 0) continue;
      const cur = b.get(x, y), ca = cur >>> 24;
      if (ca === 0) { if (!onlyOpaque) { const qa = Math.round(a * 5) / 5; if (qa > 0) b.set(x, y, withA(col, Math.round(clamp(qa, 0, 1) * 200))); } }
      else b.set(x, y, mixc(cur, col, clamp(q, 0, 1)));
    }
  }
}
function glowSprite(r, col, amax) {
  const s = 2 * r + 1, b = new Buf(s, s, false), c = hex(col);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - r, y - r) / (r + 0.5);
    if (d >= 1) continue;
    const a = amax * Math.pow(1 - d, 1.5);
    const q = Math.round(a * 6) / 6;
    if (q > 0) b.d[y * s + x] = withA(c, Math.round(clamp(q, 0, 1) * 255));
  }
  return b.canvas();
}
// lumpy translucent puff (steam / smoke), alpha quantised and dithered
function puffSprite(r, col, amax, seed) {
  const s = 2 * r + 1, b = new Buf(s, s, false), c = hex(col), n = noise2(seed, 4, s, r * 0.6);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - r, (y - r) * 1.15) / (r + 0.5) + (n(x, y) - 0.5) * 0.55;
    if (d >= 1) continue;
    const a = amax * Math.pow(1 - d, 0.9);
    const q = dq(a * 5, x, y) / 5;
    if (q > 0) b.d[y * s + x] = withA(c, Math.round(clamp(q, 0, 1) * 255));
  }
  return b.canvas();
}
// small heart of light: bright core, solid body, checkered halo
function heartSprite(r, col, core) {
  const s = 2 * r + 3, b = new Buf(s, s, false), c = hex(col), k = hex(core), o = r + 1;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = (x - o) / r, v = (y - o) / r;
    if (inHeart(u, v)) b.d[y * s + x] = inHeart(u * 1.7, v * 1.7 + 0.25) ? k : c;
    else if (inHeart(u * 0.72, v * 0.72) && ((x + y) & 1)) b.d[y * s + x] = withA(c, 150);
  }
  return b.canvas();
}

// ---------------------------------------------------------------------------
// layers

function fullH(E, fy) { return E.H + Math.ceil(E.maxCamY * fy) + 1; }
function mkLayer(cv, fx, fy, mode = 'full', o = {}) {
  return { cv, w: cv.width, h: cv.height, fx, fy, mode, y0: o.y0 || 0, vx: o.vx || 0 };
}
function layerY(L, E, camY) {
  if (L.mode === 'full') return -Math.floor(camY * L.fy);
  if (L.mode === 'screen') return L.y0;
  return E.H - L.h + L.y0 + Math.floor((E.maxCamY - camY) * L.fy); // 'bottom'
}
function layerOX(L, camX, t) { let o = Math.floor(camX * L.fx + t * L.vx) % L.w; if (o < 0) o += L.w; return o; }
function blit(g, L, E, camX, camY, t, cv) {
  cv = cv || L.cv;
  const y = layerY(L, E, camY);
  const sy0 = y < 0 ? -y : 0, sy1 = Math.min(L.h, E.H - y);
  if (sy1 <= sy0) return;
  const ox = layerOX(L, camX, t);
  for (let dx = -ox; dx < E.W; dx += L.w) {
    const sx0 = dx < 0 ? -dx : 0, sx1 = Math.min(L.w, E.W - dx);
    if (sx1 > sx0) g.drawImage(cv, sx0, sy0, sx1 - sx0, sy1 - sy0, dx + sx0, y + sy0, sx1 - sx0, sy1 - sy0);
  }
}
function onScreen(L, E, camX, camY, t, px, py, m, fn) {
  const y = layerY(L, E, camY) + py;
  if (y < -m || y > E.H + m) return;
  let x = wrapP(px - layerOX(L, camX, t), L.w);
  if (x - L.w > -m) x -= L.w;
  for (; x < E.W + m; x += L.w) fn(x, y);
}
const add = g => { g.globalCompositeOperation = 'lighter'; };
const norm = g => { g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };

// ---------------------------------------------------------------------------
// shared shape generators

function conifer(plot, cx, by, h, hw, R) {
  const tiers = 3 + Math.floor(R() * 3);
  for (let k = 0; k < h; k++) {
    const f = k / h, tf = (f * tiers) % 1;
    let w = hw * (0.12 + 0.88 * f) * (0.5 + 0.5 * tf) + (R() - 0.5) * 1.1;
    const y = Math.floor(by - h + k);
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) plot(x, y);
  }
  for (let y = Math.floor(by); y < by + 3; y++) plot(Math.round(cx), y);
}
function limb(plot, R, x, y, a, len, r0, depth, tips, hangs, droop = 0) {
  const step = 4, n = Math.max(2, Math.round(len / step));
  let px = x, py = y;
  for (let s = 0; s < n; s++) {
    a += (R() - 0.5) * 0.5 + droop * Math.sign(a);
    const nx = px + Math.sin(a) * step, ny = py - Math.cos(a) * step;
    const r1 = r0 * (1 - (s + 1) / n * 0.8), rr0 = r0 * (1 - s / n * 0.8);
    rSeg(px, py, nx, ny, rr0, r1, plot);
    px = nx; py = ny;
    if (hangs && s >= 1) hangs.push([px, py, r1]);
    if (depth > 0 && s >= 1 && R() < 0.3)
      limb(plot, R, px, py, a + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.6), len * 0.5, Math.max(0.5, r1 * 0.75), depth - 1, tips, null, droop);
  }
  if (tips) tips.push([px, py, a]);
}
function ridge(seed, w, base, amp, cells = 5, oct = 4) {
  const f = fbm1(seed, cells, w, oct), a = new Float32Array(w);
  for (let x = 0; x < w; x++) a[x] = base - (f(x) - 0.5) * 2 * amp;
  return a;
}
// overlapping shaded discs painted back (top) to front (bottom), lit from the upper left
function paintClumps(b, clumps, P, seed, o = {}) {
  const w = b.w, jag = o.jag ?? 1.4, lo = o.lo ?? 1.2, amp = o.amp ?? 3.4, rim = o.rim ?? 0.9, spec = o.spec ?? 1.2;
  clumps.sort((a, c) => a[1] - c[1]);
  for (const cl of clumps) {
    const x0 = cl[0], y0 = cl[1], r = cl[2], bias = cl[3] || 0;
    for (let y = Math.floor(y0 - r - 1); y <= y0 + r + 1; y++) for (let x = Math.floor(x0 - r - 1); x <= x0 + r + 1; x++) {
      if (o.clip && o.clip(x, y)) continue;
      const dx = x + 0.5 - x0, dy = y + 0.5 - y0, d = Math.hypot(dx, dy);
      if (d > r - h2(wrapP(x, w), y, seed) * jag) continue;
      const l = clamp(1 - Math.hypot(dx + r * 0.45, dy + r * 0.55) / (r * 1.4), 0, 1);
      let v = lo + l * amp + (d > r - 1.3 && dy > 0 ? -rim : 0) + (h2(wrapP(x, w), y, seed + 1) - 0.5) * 0.7 + bias;
      if (dy < -r + 1.6 && dx < r * 0.3) v += spec;
      b.set(x, y, rp(P, v, x, y));
      if (o.mask) o.mask.set(x, y, 1);
    }
  }
}
// wispy streak cloud mask (as in Hollow Wood's sky)
function streak(m, R, cx, cy, len, th, v = 1) {
  const segs = Math.max(2, Math.round(len / 12));
  for (let s = 0; s < segs; s++) {
    const f = s / (segs - 1), taper = 1 - Math.abs(f - 0.5) * 1.5;
    rEllipse(cx - len / 2 + f * len + (R() - 0.5) * 6, cy + (R() - 0.5) * 2, 7 + R() * 9,
      Math.max(0.8, th * taper * (0.7 + R() * 0.5)), m.P(v));
  }
}
// cumulus: clump list with a flat base at `by`
function cumulus(R, list, cx, by, w, h) {
  const n = Math.max(3, Math.round(w / 7));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = cx - w / 2 + u * w + (R() - 0.5) * 4;
    const hh = h * Math.pow(Math.sin(Math.PI * u), 0.8) * (0.7 + R() * 0.45);
    const r = Math.max(3, hh * 0.55 + R() * 2);
    list.push([x, by - r * 0.55 - R() * hh * 0.35, r, 0, by]);
  }
  for (let i = 0; i < n * 0.6; i++) {
    const u = 0.2 + R() * 0.6, x = cx - w / 2 + u * w, r = 3 + R() * h * 0.25;
    list.push([x, by - h * 0.5 - R() * h * 0.4, r, 0.3, by]);
  }
}
// a sky gradient buffer, optional glow term (dx, d) -> +v
function skyGrad(E, P, stops, o = {}) {
  const sw = o.w || 768, fy = o.fy ?? 0.08, sh = fullH(E, fy), b = new Buf(sw, sh), base = new Float32Array(sh);
  for (let y = 0; y < sh; y++) base[y] = interp(stops, sh - 1 - y);
  for (let y = 0; y < sh; y++) {
    const d = sh - 1 - y;
    for (let x = 0; x < sw; x++) {
      const v = base[y] + (o.glow ? o.glow(wrapD(x - (o.gx || 0), sw), d, x) : 0);
      b.d[y * sw + x] = rp(P, v, x, y);
    }
  }
  return { b, base, sw, sh, fy };
}
// soft disc (sun / moon) into a sky buffer: fn(nx, ny, dist01) -> colour
function skyDisc(b, cx, cy, r, fn) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d <= r) b.set(x, y, fn(dx / r, dy / r, d / r, x, y));
  }
}
// cumulus/clump cloud layer helper: returns canvas
function cloudLayer(w, h, clumps, P, seed, o = {}) {
  const b = new Buf(w, h);
  for (const c of clumps) {
    const base = c[4];
    paintClumps(b, [c], P, seed, { jag: 0.5, lo: o.lo ?? 1.1, amp: o.amp ?? 3.2, rim: 1, spec: 0.9, clip: (x, y) => y > base });
  }
  // flat, shadowed underside
  if (o.under) {
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
      const c = b.d[y * w + x]; if (!c) continue;
      if (!b.get(x, y + 1)) b.d[y * w + x] = rp(P, o.under, x, y);
    }
  }
  return b.canvas();
}
// generic drifting particle set for drawFront
function drifters(R, n, W, H, o) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({
    x: R() * (W + 40), y: R() * (H + 40), vx: o.vx[0] + R() * (o.vx[1] - o.vx[0]), vy: o.vy[0] + R() * (o.vy[1] - o.vy[0]),
    a: o.amp[0] + R() * (o.amp[1] - o.amp[0]), f: 0.5 + R() * 1.1, p: R() * TAU, sp: 2 + R() * 4,
    c: o.cols[i % o.cols.length], d: o.cols[(i + 2) % o.cols.length], k: R(),
  });
  return a;
}
function driftPos(L, t, cx, cy, W, H, par) {
  const x = Math.floor(wrapP(L.x + L.vx * t + Math.sin(t * L.f + L.p) * L.a - cx * par, W + 40)) - 20;
  const y = Math.floor(wrapP(L.y + L.vy * t - cy * par, H + 40)) - 20;
  return [x, y];
}
// tumbling 2-pixel flake (leaf / petal)
function tumble(g, L, x, y, t) {
  const ph = Math.floor(wrapP(t * L.sp + L.p, 4));
  g.fillStyle = L.c;
  if (ph === 0) g.fillRect(x, y, 2, 1);
  else if (ph === 1) { g.fillRect(x, y, 1, 1); g.fillStyle = L.d; g.fillRect(x + 1, y + 1, 1, 1); }
  else if (ph === 2) g.fillRect(x, y, 1, 2);
  else { g.fillRect(x + 1, y, 1, 1); g.fillStyle = L.d; g.fillRect(x, y + 1, 1, 1); }
}
// cylinder shading term: u in [-1,1] across the width, lit from the left
const cyl = u => Math.cos(clamp(u, -1, 1) * Math.PI / 2 + 0.45);

// ===========================================================================

const BUILDERS = {
  easter_out: buildEasterOut, easter_in: buildEasterIn, val_out: buildValOut, val_in: buildValIn,
  thanks_out: buildThanksOut, thanks_in: buildThanksIn, xmas_out: buildXmasOut, xmas_in: buildXmasIn,
};

export function makeBackground(theme, { W = 384, H = 216, levelW = 4000, levelH = 216, seed = 1 } = {}) {
  if (!BUILDERS[theme]) theme = THEMES[0];
  const maxCamY = Math.max(0, Math.floor(levelH) - H);
  const s = (strHash(theme) ^ Math.imul((seed | 0) + 1, 0x9e3779b1)) >>> 0;
  const E = { W, H, levelW, levelH, maxCamY, s, rng: mulberry32(s) };
  const T = BUILDERS[theme](E);
  const cl = (v, hi) => clamp(Math.floor(v || 0), 0, Math.max(0, hi));
  return {
    fog: T.fog,
    drawBack(ctx, camX, camY, t = 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      T.back(ctx, Math.max(0, Math.floor(camX || 0)), cl(camY, maxCamY), t || 0);
      ctx.restore();
    },
    drawFront(ctx, camX, camY, t = 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      T.front(ctx, Math.max(0, Math.floor(camX || 0)), cl(camY, maxCamY), t || 0);
      ctx.restore();
    },
  };
}

// ===========================================================================
// shared holiday props

const EGG_PALS = [
  ['#b4567a', '#d8789a', '#f0a0bc', '#ffc8da', '#fff0f4'], // pink
  ['#3f8a76', '#5eac92', '#86ccb0', '#b6e8d2', '#ecfff6'], // mint
  ['#6a58a8', '#8a78c8', '#ad9ee2', '#d2c8f6', '#f4f0ff'], // lavender
  ['#b88a2c', '#d8ac44', '#f0cc6a', '#fce6a2', '#fffae0'], // butter
  ['#3f74b0', '#5c94d0', '#86b6ea', '#b8d6f8', '#eef6ff'], // sky
  ['#c0663c', '#e08a56', '#f4ae7c', '#ffd2ae', '#fff2e4'], // apricot
].map(pal);
const EGG_PAIRS = [[0, 3], [1, 2], [2, 3], [3, 0], [4, 5], [5, 1], [1, 0], [2, 1], [4, 3], [0, 4]];
// painted egg; cut(x, y) -> true hides the pixel (buried part)
function paintEgg(b, cx, cy, rx, ry, base, pat, kind, cut, S) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    if (cut && cut(x, y)) continue;
    const yn = (y + 0.5 - cy) / ry, xs = rx * (1 + 0.14 * yn), xn = (x + 0.5 - cx) / xs;
    const rr = xn * xn + yn * yn;
    if (rr > 1) continue;
    const nz = Math.sqrt(1 - rr), lon = Math.asin(clamp(xn / Math.sqrt(Math.max(1e-3, 1 - yn * yn)), -1, 1));
    const light = clamp(-xn * 0.5 - yn * 0.5 + nz * 0.7, 0, 1);
    let v = 0.35 + light * 3.1 + (rr > 0.86 && xn > 0 ? -0.4 : 0);
    let P = base;
    if (kind === 0) { // zigzag band + pinstripes
      const zz = -0.02 + 0.13 * (tri(lon * 2.2) - 0.5);
      if (Math.abs(yn - zz) < 0.15) P = pat;
      else if (Math.abs(yn + 0.52) < 0.055 || Math.abs(yn - 0.45) < 0.055) P = pat;
    } else if (kind === 1) { // polka dots
      const gu = lon * 2.6, gv = yn * 3.4, row = Math.floor(gv + 0.5), off = (row & 1) * 0.5;
      const du = gu + off - Math.round(gu + off), dv = gv - row;
      if (du * du + dv * dv < 0.075) P = pat;
    } else if (kind === 2) { // wavy stripes
      const s = yn * 3.2 + Math.sin(lon * 5) * 0.18;
      if (wrapP(s, 1) < 0.42) P = pat;
    } else { // diamonds between two bands
      if (Math.abs(yn) < 0.32) { if (Math.abs(wrapP(lon * 1.9, 1) - 0.5) * 2 + Math.abs(yn) / 0.32 < 0.95) P = pat; }
      else if (Math.abs(Math.abs(yn) - 0.42) < 0.06) P = pat;
    }
    let c = rp(P, v, x, y);
    if (Math.hypot(xn + 0.36, yn + 0.46) < 0.13) c = base[4];
    b.set(x, y, c);
  }
}
// bunny silhouette mask (sitting), facing dir (+1 right); s = scale; returns head centre
function bunnyMask(plot, x, by, s, dir) {
  rEllipse(x - dir * 2 * s, by - 10 * s, 13 * s, 10.5 * s, plot);
  rEllipse(x + dir * 7 * s, by - 5 * s, 7 * s, 5.5 * s, plot);
  rDisc(x + dir * 10 * s, by - 21 * s, 7 * s, plot);
  rSeg(x + dir * 7 * s, by - 26 * s, x + dir * 4 * s, by - 40 * s, 2.6 * s, 2.1 * s, plot);
  rSeg(x + dir * 11 * s, by - 26 * s, x + dir * 13 * s, by - 40 * s, 2.6 * s, 2.1 * s, plot);
  rDisc(x - dir * 15 * s, by - 13 * s, 3.8 * s, plot);
  return [x + dir * 10 * s, by - 21 * s];
}

// ===========================================================================
// EASTER (outside) — pastel spring meadow, morning

function buildEasterOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};

  // ---- sky: soft blue to a creamy horizon, low morning sun on the left
  const SKY = pal(['#6c9ed6', '#77a7da', '#83b0df', '#90b9e3', '#9dc2e7', '#abcbea', '#b9d4ed', '#c7dcef', '#d4e3ef', '#e0e8ec',
    '#ebeae4', '#f4eadb', '#faecd4', '#fff1d8', '#fff7e8', '#fffcf6']);
  const sunX = 300, sunD = 104;
  const sky = skyGrad(E, SKY, [[0, 12.4], [18, 11.3], [44, 10.1], [78, 8.8], [116, 7.2], [160, 5.4], [205, 3.6], [260, 1.8]], {
    gx: sunX, glow: (dx, d) => { const g = Math.max(0, 1 - Math.hypot(dx, (d - sunD) * 1.2) / 150); return 3.6 * g * g; },
  });
  skyDisc(sky.b, sunX, sky.sh - 1 - sunD, 9, (nx, ny, d, x, y) => SKY[d < 0.7 ? 15 : 14]);
  L.sky = mkLayer(sky.b.canvas(), 0.03, sky.fy, 'full');

  // ---- fluffy clouds (slow drift)
  {
    const w = 1024, h = sky.sh, cl = [];
    const CL = pal(['#a9b3d8', '#bcc5e4', '#cfd6ee', '#e1e6f5', '#f0f3fa', '#ffffff']);
    for (let i = 0; i < 9; i++) {
      const cw = 40 + R() * 80, by = 40 + R() * 70 + (i % 3) * 18;
      cumulus(R, cl, i * (w / 9) + R() * 60, by, cw, 12 + cw * 0.22);
    }
    for (let i = 0; i < 6; i++) { const cw = 24 + R() * 30; cumulus(R, cl, R() * w, 105 + R() * 25, cw, 6 + cw * 0.2); }
    L.cloud = mkLayer(cloudLayer(w, h, cl, CL, S + 31, { lo: 1.3, amp: 3.6, under: 1.2 }), 0.05, sky.fy, 'full', { vx: 1.6 });
  }

  // ---- far hills: hazy blue-green with a windmill on a crest
  let mill;
  {
    const FAR = pal(['#89adc0', '#94b7c4', '#a0c1c8', '#adcacc', '#bbd3d0', '#c9dcd4']);
    const w = 768, h = 150, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 52, 14, 4);
    const mx = 230 + Math.floor(R() * 300);
    for (let x = 0; x < w; x++) { const d = wrapD(x - mx, w); top[x] -= 9 * Math.exp(-(d * d) / 3000); }
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    for (let i = 0; i < 120; i++) { const x = R() * w; if (Math.abs(wrapD(x - mx, w)) < 14) continue; rDisc(x, top[Math.floor(x)] + 1, 1.4 + R() * 2.4, m.P(2)); }
    paint(m, b, (x, y, k) => {
      let v = k === 2 ? 1.3 : 2.4;
      if (!m.at(x, y - 1)) v += k === 2 ? 1.4 : 1.6; else if (k === 2 && !m.at(x - 1, y)) v += 0.7;
      v += clamp((y - 58) / 50, 0, 1) * 2.4;
      return rp(FAR, v, x, y);
    });
    // windmill tower
    const ty = Math.floor(top[mx]) + 2, MW = pal(['#a7b9c4', '#c0ccd0', '#dfe2de', '#f2f0ea']);
    for (let y = ty - 26; y < ty + 2; y++) {
      const f = (y - (ty - 26)) / 28, hw = 2.6 + f * 3.2;
      for (let x = Math.floor(mx - hw); x <= mx + hw; x++) b.set(x, y, rp(MW, 3 - (x + 0.5 - (mx - hw)) / (hw * 2) * 2.4, x, y));
    }
    rPoly([[mx - 4, ty - 26], [mx + 5, ty - 26], [mx + 0.5, ty - 32]], b.P(hex('#9a7f8c')));
    b.set(mx, ty - 10, hex('#7d8ea0')); b.set(mx, ty - 9, hex('#7d8ea0')); b.set(mx - 1, ty - 3, hex('#7d8ea0'));
    b.set(mx - 1, ty - 2, hex('#7d8ea0')); b.set(mx, ty - 3, hex('#7d8ea0')); b.set(mx, ty - 2, hex('#7d8ea0'));
    L.far = mkLayer(b.canvas(), 0.07, 0.1, 'bottom');
    // sails: 8 frames over a quarter turn
    const frames = [], r0 = 15, s = 2 * r0 + 3;
    for (let f = 0; f < 8; f++) {
      const fb = new Buf(s, s, false), c = s >> 1;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4 + f / 32) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        for (let q = 2; q <= r0; q++) {
          fb.set(c + ca * q, c + sa * q, hex('#8a7a80'));
          if (q > 4) for (let wv = 1; wv <= 3; wv++) {
            const px = c + ca * q - sa * wv, py = c + sa * q + ca * wv;
            fb.set(px, py, hex((q + wv) % 2 ? '#f4f0e8' : '#c9c4c4'));
          }
        }
      }
      fb.set(c, c, hex('#6a5a64'));
      frames.push(fb.canvas());
    }
    mill = { x: mx + 0.5, y: ty - 25, frames, r: s >> 1 };
  }

  // ---- mid meadow: rolling green, little blossom trees, small eggs in the grass
  const BARK = pal(['#3a2432', '#52303f', '#6c3f4b', '#8a5458', '#a86c66']);
  const BLOS = pal(['#9a4a70', '#b8648a', '#d482a4', '#e8a2bc', '#f6c4d4', '#ffe2ec', '#fff6fa']);
  const tree = (bark, clumps, x, by, hh, spread, rr) => {
    const tips = [];
    limb(bark, R, x, by, (R() - 0.5) * 0.25, hh * 0.45, hh * 0.05 + 1, 0, tips, null);
    const [tx, ty] = tips[0]; tips.length = 0;
    const nb = 4 + Math.floor(R() * 2);
    for (let i = 0; i < nb; i++) limb(bark, R, tx, ty, (i / (nb - 1) - 0.5) * 2.0 + (R() - 0.5) * 0.3, hh * (0.32 + R() * 0.22), hh * 0.03 + 0.7, 1, tips, null);
    for (let i = 0; i < 14; i++) {
      const a = R() * TAU, q = Math.sqrt(R());
      clumps.push([tx + Math.cos(a) * q * spread, ty - hh * 0.22 + Math.sin(a) * q * spread * 0.55, rr * (0.8 + R() * 0.5)]);
    }
    for (const [px, py] of tips) clumps.push([px + (R() - 0.5) * 4, py + (R() - 0.5) * 3, rr * (0.6 + R() * 0.5)]);
  };
  {
    const G = pal(['#4f8c5c', '#5a9a62', '#66a868', '#74b46e', '#84c076', '#98cc82', '#aed890']);
    const w = 768, h = 150, b = new Buf(w, h), m = new Mask(w, h), bk = new Mask(w, h);
    const top = ridge(S + 5, w, 72, 10, 5);
    const clumps = [];
    for (let i = 0; i < 9; i++) { const x = (i + R() * 0.7) * (w / 9); tree(bk.P(1), clumps, x, top[Math.floor(x)] + 3, 30 + R() * 14, 11 + R() * 4, 3.6); }
    paint(bk, b, (x, y) => rp(BARK, bk.at(x - 1, y) ? 1.3 : 2.6, x, y));
    paintClumps(b, clumps, BLOS, S + 6, { lo: 1.4, amp: 3.6 });
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    const sw = fbm2(S + 7, 24, w, 9, 2);
    paint(m, b, (x, y) => {
      let v = 2.4 + (sw(x, y) - 0.5) * 1.6;
      if (!m.at(x, y - 1)) v += 2.2; else if (!m.at(x, y - 2)) v += 1;
      v += clamp((y - top[x]) / 50, 0, 1) * 1.5 - clamp((y - top[x] - 10) / 40, 0, 1) * 0.8;
      return rp(G, v, x, y);
    });
    // little eggs nestled in the grass
    for (let i = 0; i < 8; i++) {
      const x = R() * w, ry = 4 + R() * 2.5, cy = top[Math.floor(x)] + 6 + R() * 18;
      const cutY = cy + ry * 0.35;
      const [pi, pj] = EGG_PAIRS[i % EGG_PAIRS.length];
      paintEgg(b, x, cy, ry * 0.75, ry, EGG_PALS[pi], EGG_PALS[pj], i % 4, (px, py) => py > cutY + h2(px, 1, S) * 2, S);
    }
    // flower specks
    const FL = [hex('#fff8f0'), hex('#ffe08a'), hex('#f8b8d0'), hex('#c8b8f0')];
    for (let i = 0; i < 260; i++) { const x = Math.floor(R() * w), y = Math.floor(top[x] + 3 + Math.pow(R(), 1.6) * 50); if (m.at(x, y)) b.set(x, y, FL[i & 3]); }
    L.mid = mkLayer(b.canvas(), 0.16, 0.2, 'bottom');
  }

  // ---- close hillside: giant half-buried eggs, rabbit topiaries, big blossom trees
  {
    const G = pal(['#2f6a40', '#387848', '#42864e', '#4e9454', '#5ca25a', '#6eae62', '#84bc6e']);
    const HEDGE = pal(['#1c4a2e', '#245836', '#2e683e', '#3a7846', '#488a50', '#5a9c5a', '#70ae66']);
    const w = 1024, h = 150, b = new Buf(w, h), m = new Mask(w, h), bk = new Mask(w, h), hm = new Mask(w, h);
    const top = ridge(S + 8, w, 96, 12, 5);
    const clumps = [];
    const slots = [];
    for (let i = 0; i < 12; i++) slots.push(i);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const kinds = ['tree', 'egg', 'bunny', 'egg', 'tree', 'egg', 'bunny', 'egg', 'tree', 'egg', 'bunny', 'egg'];
    const items = slots.map((s, i) => ({ x: s * (w / 12) + 20 + R() * 40, k: kinds[i] }));
    for (const it of items) if (it.k === 'tree') tree(bk.P(1), clumps, it.x, top[Math.floor(it.x)] + 4, 58 + R() * 18, 22 + R() * 6, 5.5);
    paint(bk, b, (x, y) => {
      const dl = edgeDist(bk, x, y, -1, 0, 3), dr = edgeDist(bk, x, y, 1, 0, 3);
      return rp(BARK, dl === 1 ? 3.4 : dr === 1 ? 0.6 : 1.8 + (h2(x, y >> 1, S) - 0.5) * 0.8, x, y);
    });
    paintClumps(b, clumps, BLOS, S + 9, { lo: 1.3, amp: 3.8 });
    // hill
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    const sw = fbm2(S + 10, 32, w, 8, 2);
    paint(m, b, (x, y) => {
      let v = 2.6 + (sw(x, y) - 0.5) * 1.8;
      if (!m.at(x, y - 1)) v += 2.4; else if (!m.at(x, y - 2)) v += 1.1;
      v -= clamp((y - top[x] - 8) / 46, 0, 1) * 1.2;
      return rp(G, v, x, y);
    });
    // rabbit topiaries (clipped hedges)
    for (const it of items) if (it.k === 'bunny') {
      const by = top[Math.floor(it.x)] + 9, s = 1.05 + R() * 0.3, dir = R() < 0.5 ? -1 : 1;
      it.head = bunnyMask(hm.P(1), it.x, by, s, dir); it.s = s; it.dir = dir;
      rEllipse(it.x, by + 1, 19 * s, 3.5 * s, hm.P(2));
    }
    const lf = noise2(S + 11, 256, w, 3);
    paint(hm, b, (x, y, k) => {
      const ul = edgeDist(hm, x, y, -1, -1, 4), dr = edgeDist(hm, x, y, 1, 1, 4);
      let v = 2.4 + (ul === 1 ? 2.4 : ul === 2 ? 1.5 : ul === 3 ? 0.7 : 0) - (dr === 1 ? 1.4 : dr === 2 ? 0.6 : 0);
      v += (lf(x, y) - 0.5) * 1.6;
      if (k === 2) v -= 1.2;
      return rp(HEDGE, v, x, y);
    });
    // neck crease, eye, and a grass tuft rim in front of the topiary bases
    for (const it of items) if (it.k === 'bunny') {
      const [hx, hy] = it.head, r = 7 * it.s;
      for (let a = 0.15; a < Math.PI - 0.15; a += 0.04) {
        const px = hx + Math.cos(a) * (r + 0.3), py = hy + Math.sin(a) * (r + 0.3);
        if (hm.at(px, py)) b.set(px, py, HEDGE[1]);
      }
      b.set(hx + it.dir * 3 * it.s, hy - 1, HEDGE[0]); b.set(hx + it.dir * 3 * it.s, hy, HEDGE[0]);
      const by = top[Math.floor(it.x)] + 9;
      for (let x = Math.floor(it.x - 24); x < it.x + 24; x++) {
        const tt = by + 1 + Math.floor(h2(x, 5, S) * 3);
        for (let y = tt; y < by + 6; y++) b.set(x, y, rp(G, y === tt ? 4.6 : 3, x, y));
      }
    }
    // giant painted eggs, half buried
    let ei = 0;
    for (const it of items) if (it.k === 'egg') {
      const ry = 15 + R() * 9, rx = ry * 0.74, x = it.x, cy = top[Math.floor(x)] + ry * 0.55 + 2;
      const lean = (R() - 0.5) * 0.0;
      const cutY = cy + ry * (0.25 + R() * 0.15) + lean;
      const [pi, pj] = EGG_PAIRS[(ei * 5 + Math.floor(R() * 6)) % EGG_PAIRS.length];
      paintEgg(b, x, cy, rx, ry, EGG_PALS[pi], EGG_PALS[pj], ei % 4, (px, py) => py > cutY + Math.floor(h2(px, 2, S) * 3), S);
      // soft contact shadow + tufts at the cut
      for (let px = Math.floor(x - rx - 3); px <= x + rx + 3; px++) {
        const cy2 = Math.floor(cutY + h2(px, 2, S) * 3);
        b.set(px, cy2 + 1, rp(G, 0.8, px, cy2 + 1));
        if (h2(px, 9, S) < 0.4) b.set(px, cy2, rp(G, 4.6, px, cy2));
      }
      ei++;
    }
    const FL = [hex('#fffaf2'), hex('#ffe27a'), hex('#ffb4cc'), hex('#c4b0f4'), hex('#9ad0ff')];
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(R() * w), y = Math.floor(top[x] + 4 + Math.pow(R(), 1.3) * 52);
      if (!m.at(x, y) || hm.at(x, y)) continue;
      const c = FL[i % 5];
      b.set(x, y, c); if (i % 3 === 0) { b.set(x, y + 1, G[1]); }
    }
    L.close = mkLayer(b.canvas(), 0.3, 0.32, 'bottom');
  }

  // ---- near: blossom boughs reaching in from the top
  {
    const w = 1024, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const clumps = [];
    for (let k = 0; k < 3; k++) {
      const x0 = k * (w / 3) + R() * 140, side = k % 2 ? 1 : -1, tips = [], hangs = [];
      limb((x, y) => { if (y < 84) m.set(x, y, 1); }, R, x0, -4, side * (1.72 + R() * 0.2), 100 + R() * 50, 6, 2, tips, hangs, 0);
      for (const [px, py] of hangs) if (py < 76 && R() < 0.55) clumps.push([px + (R() - 0.5) * 8, py + 2 + R() * 5, 3.5 + R() * 3.5]);
      for (const [px, py] of tips) if (py < 92) for (let i = 0; i < 4; i++) clumps.push([px + (R() - 0.5) * 12, py + (R() - 0.5) * 8, 3.5 + R() * 4]);
    }
    const NB = pal(['#2a1824', '#3a2030', '#4c2a3a', '#603644']);
    paint(m, b, (x, y) => rp(NB, !m.at(x, y - 1) ? 2.8 : !m.at(x, y + 1) ? 0.2 : 1.3, x, y));
    const NBL = pal(['#86406a', '#a85a86', '#c878a0', '#e09ab8', '#f2bcd0', '#fcdce8']);
    paintClumps(b, clumps, NBL, S + 12, { lo: 0.8, amp: 3.8, jag: 1.8 });
    L.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const sunG = glowSprite(26, '#fff0c0', 0.35);
  const petals = drifters(R, 22, W, H, { vx: [6, 16], vy: [6, 13], amp: [5, 14], cols: ['#ffd0e0', '#f4a6c2', '#fff4f8', '#e88ab0', '#ffe4ee'] });

  return {
    fog: '#b8d2c8',
    back(g, cx, cy, t) {
      blit(g, L.sky, E, cx, cy, t);
      add(g); g.globalAlpha = 0.7 + 0.15 * Math.sin(t * 0.5);
      onScreen(L.sky, E, cx, cy, t, sunX, L.sky.h - 1 - sunD, 30, (x, y) => g.drawImage(sunG, Math.floor(x) - 26, Math.floor(y) - 26));
      norm(g);
      blit(g, L.cloud, E, cx, cy, t);
      blit(g, L.far, E, cx, cy, t);
      const fr = mill.frames[Math.floor(t * 3) & 7];
      onScreen(L.far, E, cx, cy, t, mill.x, mill.y, 20, (x, y) => g.drawImage(fr, Math.floor(x) - mill.r, Math.floor(y) - mill.r));
      blit(g, L.mid, E, cx, cy, t);
      blit(g, L.close, E, cx, cy, t);
      blit(g, L.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      g.globalAlpha = 0.9;
      for (const P of petals) { const [x, y] = driftPos(P, t, cx, cy, W, H, 1.2); tumble(g, P, x, y, t); }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// EASTER (inside) — the chocolate works: vats, copper pipes, conveyor belts

const COPPER = ['#2e140e', '#4a2214', '#6a321a', '#8c4622', '#b05e2e', '#cc7a3e', '#e49a58', '#f6c088', '#ffe2b8'];
const CHOC = ['#1e0e08', '#2e160c', '#40200f', '#552c16', '#6c3a1e', '#86502c', '#a26a40'];
// copper pipe run (horizontal unless vert) into a buffer, shaded across its thickness
function pipeRun(b, P, x0, y0, len, r, vert, flangeEvery = 0) {
  for (let i = 0; i < len; i++) for (let j = -r; j <= r; j++) {
    const u = j / (r + 0.5), x = vert ? x0 + j : x0 + i, y = vert ? y0 + i : y0 + j;
    let v = 1 + 5.4 * Math.max(0, cyl(u));
    if (Math.abs(u + 0.42) < 0.16) v += 1.4;
    b.set(x, y, rp(P, v, x, y));
  }
  if (flangeEvery) for (let i = flangeEvery >> 1; i < len; i += flangeEvery) for (let k = 0; k < 3; k++) for (let j = -r - 1; j <= r + 1; j++) {
    const u = j / (r + 1.5), x = vert ? x0 + j : x0 + i + k, y = vert ? y0 + i + k : y0 + j;
    b.set(x, y, rp(P, (k === 0 ? 2.5 : 0.8) + 4.2 * Math.max(0, cyl(u)), x, y));
  }
}

function buildEasterIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};
  const CP = pal(COPPER), CH = pal(CHOC);

  // ---- back wall: soft brick, tall arched windows full of morning light, pastel pictogram signs
  {
    const BR = pal(['#2a1a1e', '#352024', '#42282a', '#503230', '#5e3c38', '#6c4840', '#7c564a', '#8c6454']);
    const GL = pal(['#7fa8a4', '#98bcb2', '#b2d0c0', '#cce2cc', '#e4f2da', '#f8fcec']);
    const ST = pal(['#1a1418', '#262028', '#343038', '#46424a', '#5c5862']);
    const w = 768, fy = 0.14, h = fullH(E, fy), b = new Buf(w, h), rays = new Buf(w, h);
    const tex = fbm2(S + 1, 96, w, 8, 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 5), off = (row & 1) * 6, bx = (x + off) % 12;
      let v = 2.6 + (h2(Math.floor((x + off) / 12), row, S + 2) - 0.5) * 1.1 + (tex(x, y) - 0.5) * 1.2;
      if (y % 5 === 0) v = 1; else if (bx === 0) v = 1.3; else if (y % 5 === 1) v += 0.5;
      v += clamp((y - 20) / (h - 20), 0, 1) * 1.6;
      b.d[y * w + x] = rp(BR, v, x, y);
    }
    // pastel painted dado: stripe band over a tiled lower wall
    const TL = pal(['#b8b0a4', '#cfc6b8', '#e2dacc', '#f0eadc']);
    const dado = h - 66;
    const SP = [hex('#f2a8c0'), hex('#f8c8d6'), hex('#9cd8c0'), hex('#c4ecd8'), hex('#f6e08a'), hex('#fcefb8')];
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) { b.set(x, dado - 9 + k * 3, SP[k * 2]); b.set(x, dado - 8 + k * 3, SP[k * 2 + 1]); b.set(x, dado - 7 + k * 3, SP[k * 2]); }
      for (let y = dado; y < h; y++) {
        const tx = x % 10, ty = (y - dado) % 8;
        b.set(x, y, tx === 0 || ty === 0 ? TL[0] : rp(TL, 2.2 + (tx < 3 && ty < 3 ? 0.8 : 0) - (y - dado) / 80, x, y));
      }
    }
    // windows + the light shafts they throw
    const spacing = 192;
    for (let k = 0; k < 4; k++) {
      const cx = k * spacing + spacing / 2, ww = 46, yb = dado - 24, ys = 52, rr = ww / 2;
      const inside = (x, y) => Math.abs(x + 0.5 - cx) < rr && y < yb && (y >= ys || Math.hypot(x + 0.5 - cx, y + 0.5 - ys) < rr);
      for (let y = ys - rr - 4; y < yb + 5; y++) for (let x = cx - rr - 4; x < cx + rr + 4; x++) {
        if (inside(x, y)) {
          const lx = Math.floor(x - (cx - rr)), ly = Math.floor(y - (ys - rr));
          if (lx % 9 === 4 || ly % 11 === 10 || Math.abs(x + 0.5 - cx) > rr - 2 || (y < ys && Math.hypot(x + 0.5 - cx, y + 0.5 - ys) > rr - 2)) {
            b.set(x, y, rp(ST, 1.4 + (lx % 9 === 4 ? 0.8 : 0), x, y)); continue;
          }
          const pane = h2(Math.floor(lx / 9), Math.floor(ly / 11), S + 3);
          let v = 3.4 - (y - (ys - rr)) / (yb - ys + rr) * 1.8 + (pane - 0.5) * 1.2 + (lx % 9 < 2 ? 0.6 : 0);
          if (pane > 0.86) v -= 1.6;
          b.set(x, y, rp(GL, v, x, y));
        } else if (inside(x - 2, y) || inside(x + 2, y) || inside(x, y + 3) || inside(x, y - 2)) {
          b.set(x, y, rp(BR, y > yb ? 6.6 : 5.2 + (x < cx ? 1 : 0), x, y));
        }
      }
      for (let x = cx - rr - 5; x < cx + rr + 5; x++) { b.set(x, yb + 3, TL[3]); b.set(x, yb + 4, TL[1]); b.set(x, yb + 5, BR[1]); }
      const kx = 0.55;
      for (let y = ys - rr + 6; y < h; y++) for (let x = Math.floor(cx - rr); x < cx + rr + (h - ys) * kx; x++) {
        const s = (x - (cx - rr)) - (y - ys) * kx;
        if (s < 2 || s > ww - 2 || (y < yb && inside(x, y))) continue;
        const fade = Math.pow(1 - clamp((y - ys) / 190, 0, 1), 1.3);
        const bar = (Math.floor(s) % 9 === 4) ? 0.35 : 1;
        const a = fade * bar * (0.55 + 0.45 * Math.sin(s * 0.4 + k));
        const q = dq(a * 3, x, y);
        if (q > 0) rays.set(x, y, withA(hex('#fff4d0'), q * 22));
      }
    }
    // steel columns between the windows, each with a round pastel pictogram sign
    const SG = [['#e88aa8', '#f6b8cc', '#ffe0ea'], ['#6cc4a4', '#a2e0c8', '#d8f6ea'], ['#e8c454', '#f6de8c', '#fff4cc'], ['#a08ad8', '#c4b4ee', '#e8e0fc']].map(pal);
    for (let k = 0; k < 4; k++) {
      const cx = k * spacing;
      for (let y = 0; y < dado - 9; y++) for (let x = cx - 5; x <= cx + 5; x++) {
        const u = (x - cx) / 5.5, flange = Math.abs(x - cx) >= 4;
        b.set(x, y, rp(ST, (flange ? 2.4 : 1.2) + 1.6 * Math.max(0, cyl(u)) + (y % 30 === 0 ? -0.8 : 0), x, y));
      }
      for (let y = 0; y < dado - 9; y += 30) { b.set(cx - 4, y + 2, ST[4]); b.set(cx + 3, y + 2, ST[4]); }
      const sy = 88 + (k % 2) * 26, P = SG[k], r = 13;
      for (let y = sy - r - 1; y <= sy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - sy);
        if (d > r + 0.5) continue;
        if (d > r - 1.5) b.set(x, y, rp(ST, 1 + (y < sy ? 1.6 : 0), x, y));
        else if (d > r - 3) b.set(x, y, P[2]);
        else b.set(x, y, rp(P, 1.6 - (y - sy) / r * 0.5, x, y));
      }
      const ic = hex('#fffaf4'), ish = P[0];
      if (k % 3 === 0) { rEllipse(cx, sy + 0.5, 5, 7, b.P(ic)); rLine(cx - 4, sy - 1, cx + 4, sy - 1, b.P(ish)); for (let i = -4; i <= 4; i += 2) b.set(cx + i, sy + 3, ish); }
      else if (k % 3 === 1) {
        rDisc(cx, sy + 3, 5, b.P(ic)); rSeg(cx - 2, sy - 1, cx - 3, sy - 9, 1.2, 1, b.P(ic)); rSeg(cx + 2, sy - 1, cx + 3, sy - 9, 1.2, 1, b.P(ic));
        b.set(cx - 2, sy + 2, ish); b.set(cx + 1, sy + 2, ish);
      } else for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) rRect(cx - 5 + i * 5 + 1, sy - 6 + j * 4 + 1, 4, 3, b.P(ic));
    }
    // roof truss along the top
    for (let x = 0; x < w; x++) for (let y = 12; y < 18; y++) b.set(x, y, rp(ST, y === 12 ? 3.4 : y === 17 ? 0.4 : 1.8, x, y));
    for (let x = 0; x < w; x += 24) { rLine(x, 12, x + 12, 0, b.P(ST[1])); rLine(x + 12, 0, x + 24, 12, b.P(ST[1])); rLine(x + 1, 12, x + 13, 0, b.P(ST[2])); }
    for (let x = 0; x < w; x++) { b.set(x, 0, ST[1]); b.set(x, 1, ST[2]); }
    L.wall = mkLayer(b.canvas(), 0.14, fy, 'full');
    L.rays = mkLayer(rays.canvas(), 0.14, fy, 'full');
  }

  // ---- mid: copper vats brimming with chocolate, pipes, valves, gauges
  const steamSrc = [];
  {
    const w = 768, h = 186, b = new Buf(w, h);
    const ST = pal(['#16121a', '#221c24', '#302832', '#423844', '#584c56']);
    const vats = [];
    for (let k = 0; k < 3; k++) vats.push({ cx: k * 256 + 70 + R() * 110, rw: 32 + R() * 10, yt: 44 + R() * 22, yb: h - 40 });
    const hy = 26;
    pipeRun(b, CP, 0, hy, w, 3, false, 64);
    for (const V of vats) pipeRun(b, CP, Math.round(V.cx + V.rw * 0.45), hy, Math.round(V.yt - hy - 2), 2, true, 0);
    for (const V of vats) {
      const { cx, rw, yt, yb } = V;
      for (const lx of [-0.8, 0, 0.8]) for (let y = yb; y < h; y++) for (let x = Math.round(cx + lx * rw) - 2; x <= cx + lx * rw + 2; x++)
        b.set(x, y, rp(ST, 1 + 2.4 * Math.max(0, cyl((x - (cx + lx * rw)) / 3)), x, y));
      for (let x = Math.round(cx - rw); x <= cx + rw; x++) { b.set(x, h - 18, ST[3]); b.set(x, h - 17, ST[1]); }
      // body
      const bands = [7, Math.round((yb - yt) * 0.5), Math.round(yb - yt - 6)];
      for (let y = Math.floor(yt); y < yb + 10; y++) {
        const bot = y > yb ? Math.sqrt(Math.max(0, 1 - ((y - yb) / 10) ** 2)) : 1, hw = rw * bot;
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          const u = (x + 0.5 - cx) / rw, ly = Math.floor(y - yt);
          let v = 0.8 + 5.6 * Math.max(0, cyl(u)) + (Math.abs(u + 0.5) < 0.05 ? 1.6 : 0) - (y > yb ? (y - yb) * 0.15 : 0);
          const band = bands.some(by => ly >= by && ly < by + 3);
          if (band) v = (ly % 3 === 0 ? 2 : 0.4) + 4.2 * Math.max(0, cyl(u));
          if (band && ly % 3 === 1 && Math.round(x - cx) % 6 === 0) v += 2.2;
          b.set(x, y, rp(CP, v, x, y));
        }
      }
      // rim and the chocolate surface
      for (let y = Math.floor(yt - 5); y <= yt + 4; y++) for (let x = Math.floor(cx - rw - 2); x <= cx + rw + 2; x++) {
        const ex = (x + 0.5 - cx) / (rw + 2), ey = (y + 0.5 - yt) / 4.5;
        if (ex * ex + ey * ey > 1) continue;
        const ix = (x + 0.5 - cx) / (rw - 1), iy = (y + 0.5 - yt + 0.5) / 3.4;
        if (ix * ix + iy * iy <= 1) b.set(x, y, rp(CH, 3 + (ix < -0.2 && iy < 0 ? 1.2 : 0) + Math.sin(x * 0.4 + y) * 0.4 - (iy > 0.5 ? 1 : 0), x, y));
        else b.set(x, y, rp(CP, 2 + 5 * Math.max(0, cyl(ex)) + (ey < 0 ? 1.4 : 0), x, y));
      }
      // overflowing drips
      const nd = 5 + Math.floor(R() * 4);
      for (let i = 0; i < nd; i++) {
        const dx = (R() * 1.7 - 0.85) * rw, x = Math.round(cx + dx), len = 4 + Math.pow(R(), 1.5) * 34, wd = 1 + Math.floor(R() * 2.5);
        const y0 = Math.round(yt + 3 * Math.sqrt(Math.max(0, 1 - (dx / rw) ** 2)));
        for (let y = y0; y < y0 + len; y++) for (let j = 0; j < wd; j++) b.set(x + j, y, rp(CH, j === 0 ? 4.4 : 2.4, x + j, y));
        rDisc(x + wd / 2, y0 + len, wd * 0.5 + 1, (px, py) => b.set(px, py, rp(CH, px <= x ? 4.2 : 2.2, px, py)));
        b.set(x, y0 + len - 1, CH[6]);
      }
      // gauge
      const gx = Math.round(cx + rw * 0.25), gy = Math.round(yt + (yb - yt) * 0.32);
      rDisc(gx, gy, 5, b.P(ST[1])); rDisc(gx, gy, 4, b.P(hex('#f4efe4'))); b.set(gx - 2, gy - 2, hex('#ffffff'));
      rLine(gx, gy, gx + 2, gy - 3, b.P(hex('#d04050'))); b.set(gx, gy, ST[0]);
      // valve wheel on a stub pipe
      const vy = Math.round(yb - 16), vx = Math.round(cx - rw - 1);
      pipeRun(b, CP, vx - 12, vy, 13, 2, false, 0);
      const VW = pal(['#8a2a3a', '#c04a5a', '#e87a8a', '#ffb4c0']);
      for (let a = 0; a < TAU; a += 0.08) b.set(vx - 10 + Math.cos(a) * 5, vy + Math.sin(a) * 5, rp(VW, 1.8 - Math.sin(a) * 1.2, vx, vy));
      for (let k = 0; k < 4; k++) rLine(vx - 10, vy, vx - 10 + Math.cos(k * TAU / 4 + 0.4) * 5, vy + Math.sin(k * TAU / 4 + 0.4) * 5, b.P(VW[1]));
      steamSrc.push({ x: cx, y: yt - 4, w: rw });
    }
    L.mid = mkLayer(b.canvas(), 0.26, 0.28, 'bottom');
  }

  // ---- conveyor: static belt, moving goods, machine housings in front
  const lampsM = [];
  {
    const w = 1024, h = 112, top = 58, b = new Buf(w, h), ib = new Buf(w, h), mb = new Buf(w, h);
    const ST = pal(['#141016', '#201a22', '#2c2430', '#3a3040', '#4a4052', '#5e5466']);
    const MINT = pal(['#2e6a5c', '#3e8270', '#529a84', '#6cb49a', '#8ccab0', '#b0e0c8']);
    for (let x = 0; x < w; x++) {
      b.set(x, top, ST[3]); b.set(x, top + 1, ST[1]); b.set(x, top + 2, ST[0]);
      for (let y = top + 3; y < top + 12; y++) {
        let v = 3.2 - (y - top - 3) * 0.22;
        if (y === top + 3) v = 5; if (y === top + 11) v = 0.4;
        if ((x % 16) >= 6 && (x % 16) <= 9 && y >= top + 5 && y <= top + 8) v = (x % 16 === 6 || y === top + 5) ? 1 : 4.4;
        b.set(x, y, rp(MINT, v, x, y));
      }
    }
    for (let x = 40; x < w; x += 128) for (const s of [-1, 1]) {
      rLine(x, top + 12, x + s * 12, h, b.P(ST[2])); rLine(x + 1, top + 12, x + 1 + s * 12, h, b.P(ST[3]));
    }
    for (let x = 0; x < w; x++) { b.set(x, h - 20, ST[2]); b.set(x, h - 19, ST[1]); }
    L.belt = mkLayer(b.canvas(), 0.4, 0.42, 'bottom');
    // goods: foil eggs and chocolate bunnies with ribbons
    const BU = pal(['#2a140a', '#3c1e10', '#542c18', '#6e3c22', '#8c5232', '#b0724a']);
    let x = 4;
    while (x < w - 24) {
      if (R() < 0.55) {
        const P = EGG_PALS[Math.floor(R() * 6)], rx = 4.5, ry = 6, cy = top - ry + 0.5;
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry; y++) for (let xx = Math.floor(x - rx - 1); xx <= x + rx + 1; xx++) {
          const yn = (y + 0.5 - cy) / ry, xn = (xx + 0.5 - x) / (rx * (1 + 0.14 * yn));
          if (xn * xn + yn * yn > 1) continue;
          const v = 1 + 2.6 * clamp(-xn * 0.6 - yn * 0.4 + 0.6, 0, 1.2) + (h2(xx, y, S + 40) > 0.75 ? 1 : 0);
          ib.set(xx, y, rp(P, v, xx, y));
        }
        ib.set(x - 2, cy - 3, P[4]); ib.set(x - 2, cy - 2, P[4]);
        x += 16 + R() * 10;
      } else {
        const m = new Mask(40, 40, false), dir = R() < 0.5 ? -1 : 1;
        bunnyMask(m.P(1), 20, 39, 0.42, dir);
        for (let yy = 0; yy < 40; yy++) for (let xx = 0; xx < 40; xx++) {
          if (!m.at(xx, yy)) continue;
          const dl = edgeDist(m, xx, yy, -1, -1, 3), dr = edgeDist(m, xx, yy, 1, 0, 2);
          ib.set(x - 20 + xx, top - 40 + yy, rp(BU, 2 + (dl === 1 ? 2.6 : dl === 2 ? 1.4 : 0) - (dr === 1 ? 1.2 : 0), xx, yy));
        }
        const hx = Math.round(x + dir * 4), ny = top - 8;
        for (let i = -3; i <= 3; i++) ib.set(hx + i - dir, ny, hex('#f4a0bc'));
        ib.set(hx - dir, ny - 1, hex('#ffd0de')); ib.set(hx - dir + 1, ny + 1, hex('#e07898')); ib.set(hx - dir - 1, ny + 1, hex('#e07898'));
        x += 20 + R() * 10;
      }
    }
    for (let xx = 0; xx < w; xx += 6) ib.set(xx, top + 1, ST[4]);
    L.goods = mkLayer(ib.canvas(), 0.4, 0.42, 'bottom', { vx: -12 });
    // machine housings the belt runs through
    const PK = pal(['#7a3a52', '#a04e6a', '#c66a86', '#e08ca4', '#f4b4c8', '#ffdce6']);
    const LE = pal(['#7a6a2a', '#a08a38', '#c8ac4a', '#e2c866', '#f4e090', '#fff4c4']);
    const PH = pal(['#6a4020', '#b07030', '#f0b050', '#ffe8a0']);
    for (let k = 0; k < 2; k++) {
      const mx = k * 512 + 120 + Math.floor(R() * 200), mw = 54, my = 18, P = k ? LE : PK;
      for (let y = my; y < top + 12; y++) for (let xx = mx; xx < mx + mw; xx++) {
        const lx = xx - mx, ly = y - my, u = (lx + 0.5) / mw * 2 - 1;
        if (ly < 8 && Math.hypot(Math.max(0, Math.abs(lx + 0.5 - mw / 2) - (mw / 2 - 8)), 8 - ly) > 8) continue;
        if (ly > 22 && ly < top - my + 3 && lx > 9 && lx < mw - 9) {
          const flap = (lx - 10) % 5, fl = ly > 25 && flap !== 4;
          mb.set(xx, y, rp(ST, ly < 25 ? 1.4 : fl ? 1.2 + (flap === 0 ? 0.8 : 0) - (ly - 25) * 0.03 : 0.2, xx, y)); continue;
        }
        if (lx === 7 || lx === mw - 8) { mb.set(xx, y, P[0]); continue; }
        let v = 2.2 + 1.8 * Math.max(0, cyl(u)) - (ly > top - my + 3 ? 0.8 : 0);
        if (lx === 0 || ly === 0) v += 1.2; if (lx === mw - 1) v -= 1.2;
        if ((lx === 4 || lx === mw - 5) && ly % 6 === 3) v += 1.8;
        if (ly >= top - my + 4 && ((lx + ly) % 8) < 3) v = 4.4;
        mb.set(xx, y, rp(P, v, xx, y));
      }
      const px = mx + mw / 2, py = my + 11;
      rDisc(px, py, 5, mb.P(ST[1])); rDisc(px, py, 4, (a, c) => mb.set(a, c, rp(PH, 3 - Math.hypot(a + 0.5 - px, c + 0.5 - py) / 1.6, a, c)));
      rRect(mx + 8, my - 5, 8, 5, mb.P(ST[2])); rRect(mx + 8, my - 6, 8, 1, mb.P(ST[4]));
      // hopper on top
      rPoly([[mx + mw - 24, my - 14], [mx + mw - 6, my - 14], [mx + mw - 11, my], [mx + mw - 19, my]], (a, c) => mb.set(a, c, rp(P, 1.4 + (a < mx + mw - 15 ? 1.6 : 0) + (c === my - 14 ? 2 : 0), a, c)));
      lampsM.push({ x: px, y: py, vent: false });
      lampsM.push({ x: mx + 12, y: my - 7, vent: true });
    }
    L.mach = mkLayer(mb.canvas(), 0.4, 0.42, 'bottom');
  }

  // ---- near: copper pipe run, chocolate drips, hanging industrial lamps
  const lamps = [], drips = [];
  {
    const w = 1024, fy = 0.6, h = fullH(E, fy), b = new Buf(w, h), beam = new Buf(w, h);
    const SH = pal(['#14201c', '#1e2e28', '#2a3e36', '#3a5448', '#4e6c5e']);
    pipeRun(b, CP, 0, 8, w, 4, false, 96);
    pipeRun(b, CP, 0, 19, w, 2, false, 0);
    for (let x = 48; x < w; x += 96) rRect(x, 0, 2, 4, b.P(hex('#2a2228')));
    for (let x = 48 + 96; x < w; x += 192) {
      for (let i = 0; i < 3; i++) {
        const dx = x + i, len = 3 + Math.floor(R() * 7);
        for (let y = 12; y < 13 + len; y++) b.set(dx, y, rp(CH, i === 0 ? 4 : 2.4, dx, y));
        b.set(dx, 13 + len, CH[3]);
        if (i === 1) drips.push({ x: dx, y: 14 + len, p: R(), f: 0.35 + R() * 0.3 });
      }
    }
    for (let k = 0; k < 3; k++) {
      const lx = Math.floor(k * (w / 3) + 60 + R() * 200), ly = 34 + Math.floor(R() * 18);
      rLine(lx, 22, lx, ly - 7, b.P(hex('#1a1416')));
      for (let y = ly - 7; y <= ly; y++) {
        const f = (y - (ly - 7)) / 7, hw = 3 + f * 8;
        for (let x = Math.floor(lx - hw); x <= lx + hw; x++) b.set(x, y, rp(SH, (y === ly ? 4.4 : 1.4 + 2.2 * Math.max(0, cyl((x - lx) / hw))), x, y));
      }
      for (let x = lx - 3; x <= lx + 3; x++) b.set(x, ly + 1, hex(Math.abs(x - lx) < 2 ? '#fff8e0' : '#ffd890'));
      lamps.push({ x: lx + 0.5, y: ly + 2 });
      for (let y = ly + 2; y < Math.min(h, ly + 120); y++) {
        const f = (y - ly) / 120, hw = 10 + f * 52;
        for (let x = Math.floor(lx - hw); x <= lx + hw; x++) {
          const e = Math.abs(x + 0.5 - lx) / hw, a = (1 - f) * (1 - e * e) * 0.9;
          const q = dq(a * 3, x, y);
          if (q > 0) beam.set(x, y, withA(hex('#ffd8a0'), q * 16));
        }
      }
    }
    L.near = mkLayer(b.canvas(), 0.6, fy, 'full');
    L.beam = mkLayer(beam.canvas(), 0.6, fy, 'full');
  }

  const glowL = glowSprite(14, '#ffc070', 0.55), glowP = glowSprite(8, '#ffb050', 0.5), glowR = glowSprite(4, '#ff7088', 0.7), glowG = glowSprite(4, '#90ffb0', 0.6);
  const puffs = [puffSprite(4, '#f6eee8', 0.7, S + 70), puffSprite(6, '#f6eee8', 0.6, S + 71), puffSprite(9, '#f6eee8', 0.5, S + 72), puffSprite(12, '#f6eee8', 0.45, S + 73)];
  const vatSteam = [];
  steamSrc.forEach(v => { for (let j = 0; j < 3; j++) vatSteam.push({ s: v, dx: (R() - 0.5) * v.w, p: R(), f: 0.12 + R() * 0.08 }); });
  const wisps = [];
  for (let i = 0; i < 7; i++) wisps.push({ x: R() * (W + 80), y: 40 + R() * (H - 60), p: R(), f: 0.06 + R() * 0.05 });

  return {
    fog: '#6a4a44',
    back(g, cx, cy, t) {
      blit(g, L.wall, E, cx, cy, t);
      add(g); g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 0.4);
      blit(g, L.rays, E, cx, cy, t);
      norm(g);
      blit(g, L.mid, E, cx, cy, t);
      for (const s of vatSteam) {
        const ph = wrapP(t * s.f + s.p, 1), sp = puffs[Math.min(3, Math.floor(ph * 4))], r = sp.width >> 1;
        g.globalAlpha = 0.4 * Math.sin(ph * Math.PI);
        onScreen(L.mid, E, cx, cy, t, s.s.x + s.dx * (0.4 + ph), s.s.y - ph * 46, 20, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      }
      norm(g);
      blit(g, L.belt, E, cx, cy, t);
      blit(g, L.goods, E, cx, cy, t);
      blit(g, L.mach, E, cx, cy, t);
      add(g);
      lampsM.forEach((l, i) => {
        if (l.vent && Math.floor(t * 2 + i) % 2) return;
        g.globalAlpha = l.vent ? 0.9 : 0.55 + 0.1 * Math.sin(t * 3 + i);
        const sp = l.vent ? (i % 4 === 1 ? glowR : glowG) : glowP, r = sp.width >> 1;
        onScreen(L.mach, E, cx, cy, t, l.x, l.y, 10, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      });
      g.globalAlpha = 0.5;
      blit(g, L.beam, E, cx, cy, t);
      norm(g);
      blit(g, L.near, E, cx, cy, t);
      g.fillStyle = CHOC[4];
      for (const d of drips) {
        const ph = wrapP(t * d.f + d.p, 1);
        if (ph < 0.45) { if (ph > 0.2) onScreen(L.near, E, cx, cy, t, d.x, d.y, 4, (x, y) => g.fillRect(Math.floor(x), Math.floor(y), 1, 1)); continue; }
        const k = (ph - 0.45) / 0.55, fall = k * k * 150;
        onScreen(L.near, E, cx, cy, t, d.x, d.y + fall, 4, (x, y) => g.fillRect(Math.floor(x), Math.floor(y), 1, 2));
      }
      add(g);
      lamps.forEach((l, i) => {
        g.globalAlpha = clamp(0.7 + 0.08 * Math.sin(t * 5 + i * 2) + (Math.sin(t * 31 + i) > 0.97 ? -0.3 : 0), 0, 1);
        onScreen(L.near, E, cx, cy, t, l.x, l.y, 16, (x, y) => g.drawImage(glowL, Math.floor(x) - 14, Math.floor(y) - 14));
      });
      norm(g);
    },
    front(g, cx, cy, t) {
      const sw = W + 80;
      for (const s of wisps) {
        const ph = wrapP(t * s.f + s.p, 1), sp = puffs[2 + (ph > 0.5 ? 1 : 0)], r = sp.width >> 1;
        const x = Math.floor(wrapP(s.x + ph * 30 - cx * 1.15, sw)) - 40, y = Math.floor(s.y - ph * 36 - cy * 1.15);
        g.globalAlpha = 0.16 * Math.sin(ph * Math.PI);
        g.drawImage(sp, x - r, y - r);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// VALENTINE (outside) — rose garden at sunset

const ROSE_R = ['#4a0a1e', '#7a1228', '#a81e38', '#d43450', '#f0607a', '#ff98ac'];
const ROSE_P = ['#7a2a4a', '#a8466a', '#d06a8e', '#ec92b0', '#ffbcd0', '#ffe4ec'];
const ROSE_W = ['#a07880', '#c8a0a4', '#e4c8c4', '#f8e4dc', '#fff8f0'];
// a small rose bloom (r ~ 1.5..2.5)
function rose(b, x, y, r, P) {
  rDisc(x, y, r, (px, py) => {
    const dx = px + 0.5 - x, dy = py + 0.5 - y, d = Math.hypot(dx, dy) / r;
    b.set(px, py, rp(P, 1.6 + 2.6 * clamp(1 - Math.hypot(dx + r * 0.4, dy + r * 0.5) / (r * 1.6), 0, 1) - (d > 0.8 && dy > 0 ? 0.8 : 0), px, py));
  });
  b.set(x, y, P[1]);
  if (r > 1.8) { b.set(x - 1, y, P[2]); b.set(x, y - 1, P[4]); }
}
// clipped-hedge shading: lit from the upper left, leafy texture, warm rim on top
function hedgeShade(m, P, lf, warm) {
  return (x, y, k) => {
    const ul = edgeDist(m, x, y, -1, -1, 4), dr = edgeDist(m, x, y, 1, 1, 4), up = edgeDist(m, x, y, 0, -1, 2);
    let v = 2.2 + (ul === 1 ? 2.2 : ul === 2 ? 1.4 : ul === 3 ? 0.6 : 0) - (dr === 1 ? 1.4 : dr === 2 ? 0.6 : 0) + (lf(x, y) - 0.5) * 1.6;
    if (k === 2) v -= 1;
    let c = rp(P, v, x, y);
    if (warm && up === 1) c = mixc(c, warm, 0.45);
    return c;
  };
}

function buildValOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};
  const RR = pal(ROSE_R), RP = pal(ROSE_P), RW = pal(ROSE_W);

  // ---- sky: violet overhead, rose and gold to the horizon, a fat low sun and lit streak clouds
  const SKY = pal(['#2e1e4e', '#3a2458', '#482a62', '#58306c', '#6a3674', '#7e3c7a', '#943f7c', '#aa467c', '#be507a', '#d05c78', '#e06c74',
    '#ec8070', '#f4966c', '#f8ae6c', '#fbc674', '#fddc88', '#ffeeac', '#fff8d8']);
  const sunX = 250, sunD = 92, sunR = 17;
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  {
    const b = new Buf(sw, sh), base = new Float32Array(sh), glow = new Float32Array(sw * sh);
    const stops = [[0, 15.2], [16, 14.2], [36, 12.9], [62, 11.4], [92, 9.8], [126, 8.2], [164, 6.5], [206, 4.8], [260, 3], [330, 1.2]];
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y; base[y] = interp(stops, d);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - sunX, sw), dy = d - sunD;
        const gl = Math.max(0, 1 - Math.hypot(dx, dy * 1.5) / 170), band = Math.max(0, 1 - Math.abs(dy + 10) / 40) * Math.max(0, 1 - Math.abs(dx) / 420);
        glow[y * sw + x] = 3.2 * gl * gl + 1.2 * band;
      }
    }
    const cm = new Mask(sw, sh);
    for (let i = 0; i < 13; i++) streak(cm, R, R() * sw, sh - 1 - (70 + R() * 120), 50 + R() * 160, 1.5 + R() * 3);
    streak(cm, R, sunX + 20, sh - 1 - (sunD + 12), 150, 1.4);
    streak(cm, R, sunX - 40, sh - 1 - (sunD + 26), 110, 1.8);
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y;
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x, gl = glow[i];
        let v = base[y] + gl, c;
        const dist = Math.hypot(wrapD(x - sunX, sw), d - sunD);
        if (cm.m[i]) {
          const below = cm.at(x, y + 1), below2 = cm.at(x, y + 2), above = cm.at(x, y - 1);
          if (!below) v = base[y] + gl * 1.15 + 2.2;
          else if (!below2) v = base[y] + gl * 0.8 + 0.9;
          else if (!above) v = base[y] + gl * 0.4 - 1.4;
          else v = base[y] + gl * 0.3 - 2.4;
          c = rp(SKY, v, x, y);
        } else if (dist < sunR + 0.5) c = rp(SKY, 16.4 + Math.min(1.2, (sunR - dist) / 5), x, y);
        else c = rp(SKY, v, x, y);
        b.d[i] = c;
      }
    }
    const STAR = pal(['#7a5a9a', '#c8b0e0', '#fff0ff']);
    for (let i = 0; i < (sw * sh) / 700; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), v = base[y] + glow[y * sw + x];
      if (v < 3.2 && !cm.at(x, y)) b.set(x, y, STAR[v < 1.8 && R() < 0.4 ? 2 : v < 2.5 ? 1 : 0]);
    }
    L.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- far: a chateau on a rise among poplars, windows catching the sunset
  const winGlow = [];
  {
    const FAR = pal(['#3a2250', '#462858', '#542e62', '#64366c', '#764076', '#8a4c80', '#a05a88']);
    const w = 768, h = 150, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 62, 10, 4);
    const cx = 150 + Math.floor(R() * 400), gy = Math.floor(top[cx]) + 4;
    for (let x = 0; x < w; x++) { const d = wrapD(x - cx, w); top[x] -= 8 * Math.exp(-(d * d) / 9000); }
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    for (let i = 0; i < 70; i++) {
      const x = R() * w; if (Math.abs(wrapD(x - cx, w)) < 60) continue;
      const ty = top[Math.floor(x)] + 2;
      if (R() < 0.6) rEllipse(x, ty - 7 - R() * 5, 1.6 + R() * 1.4, 7 + R() * 6, m.P(2));
      else rDisc(x, ty - 3, 2.5 + R() * 3, m.P(2));
    }
    // chateau
    const C = m.P(3);
    rRect(cx - 34, gy - 22, 68, 22, C);
    rPoly([[cx - 36, gy - 22], [cx + 36, gy - 22], [cx + 30, gy - 32], [cx - 30, gy - 32]], C);
    rRect(cx - 9, gy - 34, 18, 34, C); rPoly([[cx - 11, gy - 34], [cx + 11, gy - 34], [cx, gy - 50]], C);
    for (const s of [-1, 1]) {
      const tx = cx + s * 38;
      rRect(tx - 6, gy - 38, 12, 38, C); rPoly([[tx - 8, gy - 38], [tx + 8, gy - 38], [tx, gy - 56]], C);
      rRect(tx - 1, gy - 60, 1, 4, C);
    }
    rRect(cx + 18, gy - 38, 3, 7, C); rRect(cx - 22, gy - 37, 3, 6, C);
    paint(m, b, (x, y, k) => {
      let v = k === 2 ? 1.2 : k === 3 ? 0.9 : 2.2;
      if (!m.at(x, y - 1)) v += 1.8; else if (!m.at(x + 1, y) && k !== 1) v += 1.1; else if (!m.at(x - 1, y) && k !== 1) v -= 0.4;
      v += clamp((y - 60) / 70, 0, 1) * 3.2;
      return rp(FAR, v, x, y);
    });
    const WG = hex('#ffd890'), WD = hex('#f0a060');
    for (let row = 0; row < 2; row++) for (let i = -3; i <= 3; i++) {
      if (i === 0 && row === 0) continue;
      const wx = cx + i * 9 - 1, wy = gy - 18 + row * 9;
      if (h2(i, row, S) < 0.2) continue;
      b.set(wx, wy, WG); b.set(wx + 1, wy, WG); b.set(wx, wy + 1, WD); b.set(wx + 1, wy + 1, WD); b.set(wx, wy + 2, WD); b.set(wx + 1, wy + 2, WD);
      if (h2(i, row, S + 1) < 0.35) winGlow.push([wx + 1, wy + 1]);
    }
    for (const s of [-1, 1]) { const tx = cx + s * 38; b.set(tx, gy - 28, WG); b.set(tx, gy - 27, WD); b.set(tx - 1, gy - 28, WG); b.set(tx - 1, gy - 27, WD); }
    b.set(cx, gy - 28, WG); b.set(cx - 1, gy - 28, WG); b.set(cx, gy - 27, WD); b.set(cx - 1, gy - 27, WD);
    winGlow.push([cx, gy - 27]);
    L.far = mkLayer(b.canvas(), 0.07, 0.1, 'bottom');
  }

  // ---- mid: long clipped hedge with heart topiaries, the marble fountain, small rose arches
  const HED = pal(['#162a24', '#1e362c', '#284434', '#32523a', '#3e6040', '#4e6e46', '#647c4c']);
  const LEAF = pal(['#142620', '#1c3228', '#264030', '#304e36', '#3e5e3e', '#526e44']);
  const warm = hex('#f0a070');
  let fountain;
  {
    const w = 768, h = 150, b = new Buf(w, h), m = new Mask(w, h), top = 96;
    const fx0 = 200 + Math.floor(R() * 360);
    for (let x = 0; x < w; x++) {
      const t0 = top + Math.round(Math.sin(x * 0.02) * 0.5);
      for (let y = t0; y < h; y++) m.set(x, y, 1);
    }
    for (let k = 0; k < 7; k++) {
      const x = k * (w / 7) + 40, s = 11 + R() * 3;
      if (Math.abs(wrapD(x - fx0, w)) < 70) continue;
      rRect(x - 1, top - 8, 3, 9, m.P(2));
      for (let y = Math.floor(top - 8 - s * 2.1); y < top - 6; y++) for (let xx = Math.floor(x - s - 1); xx <= x + s + 1; xx++)
        if (inHeart((xx + 0.5 - x) / s, (y + 0.5 - (top - 8 - s)) / s)) m.set(xx, y, 1);
    }
    const lf = noise2(S + 11, 384, w, 2);
    paint(m, b, hedgeShade(m, HED, lf, warm));
    for (let x = 0; x < w; x++) { if (Math.abs(wrapD(x - fx0, w)) < 52) continue; for (let y = top + 22; y < h; y++) b.set(x, y, rp(LEAF, 1 + (y === top + 22 ? 1.2 : 0), x, y)); }
    // roses dotted on the hedge
    for (let i = 0; i < 140; i++) {
      const x = R() * w, y = top + 3 + R() * 16;
      if (Math.abs(wrapD(x - fx0, w)) < 56) continue;
      rose(b, x, y, 1.2 + R() * 0.8, i % 3 ? RR : RP);
    }
    // fountain: wide basin, column, two bowls, finial (pale rose marble)
    const MB = pal(['#6a4a5c', '#8a6476', '#a88090', '#c49ea8', '#dcbcc0', '#f0d8d4', '#fff0e8']);
    const gy = h - 42, marble = (x, y, cxx, rw, extra = 0) => rp(MB, 1.4 + 4.4 * Math.max(0, cyl((x + 0.5 - cxx) / rw)) + extra + (h2(x, y, S + 5) > 0.9 ? -0.6 : 0), x, y);
    for (let y = gy - 10; y < gy; y++) for (let x = fx0 - 46; x <= fx0 + 46; x++) b.set(x, y, marble(x, y, fx0, 47, y === gy - 10 ? 1.4 : 0));
    for (let x = fx0 - 48; x <= fx0 + 48; x++) { b.set(x, gy - 11, MB[6]); b.set(x, gy - 12, MB[4]); b.set(x, gy, MB[1]); }
    for (let x = fx0 - 46; x <= fx0 + 46; x += 12) { b.set(x, gy - 7, MB[2]); b.set(x, gy - 4, MB[2]); }
    for (let y = gy - 40; y < gy - 10; y++) { const rw = y > gy - 16 ? 5 : 3; for (let x = fx0 - rw; x <= fx0 + rw; x++) b.set(x, y, marble(x, y, fx0, rw + 1)); }
    const bowl = (by, rw) => {
      for (let y = by; y < by + 5; y++) { const f = (y - by) / 5, hw = rw * (1 - f * 0.55); for (let x = Math.floor(fx0 - hw); x <= fx0 + hw; x++) b.set(x, y, marble(x, y, fx0, hw + 1, y === by ? 1.6 : -0.4)); }
      for (let x = fx0 - rw - 1; x <= fx0 + rw + 1; x++) b.set(x, by - 1, MB[5]);
    };
    bowl(gy - 42, 20);
    for (let y = gy - 60; y < gy - 42; y++) for (let x = fx0 - 2; x <= fx0 + 2; x++) b.set(x, y, marble(x, y, fx0, 3));
    bowl(gy - 61, 9);
    rDisc(fx0, gy - 66, 2.5, (x, y) => b.set(x, y, marble(x, y, fx0, 3, 0.6)));
    // water frames: sheets falling off the bowls, a little jet, ripples in the basin
    const frames = [], fw = 110, fh = 80, ox = 55, oy = 76;
    const WA = [hex('#e8c8e0', 150), hex('#fff0f8', 200), hex('#ffe0b0', 230), hex('#c8a0d0', 120)];
    for (let f = 0; f < 4; f++) {
      const fb = new Buf(fw, fh, false);
      const sheet = (x0, y0, x1, y1, n) => {
        for (let i = 0; i < n; i++) {
          const t = i / n, y = Math.round(lerp(y0, y1, t)), x = Math.round(lerp(x0, x1, Math.sqrt(t)));
          const k = (i + f * 2) % 7;
          fb.set(ox + x, oy - (66 - (y - (gy - 66))), k < 2 ? WA[1] : k === 4 ? WA[2] : WA[0]);
        }
      };
      for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
        sheet(s * (20 + j), gy - 42, s * (24 + j * 2), gy - 12, 40);
        sheet(s * (9 + j), gy - 61, s * (12 + j), gy - 44, 24);
      }
      for (let i = 0; i < 10; i++) { const y = gy - 68 - i, k = (i + f) % 4; if (k !== 3) fb.set(ox, oy - (66 - (y - (gy - 66))), WA[k === 0 ? 2 : 1]); }
      for (let i = 0; i < 14; i++) { const x = ((i * 13 + f * 5) % 80) - 40; fb.set(ox + x, oy - 1 - (i % 2), WA[(i + f) % 3 === 0 ? 2 : 3]); }
      frames.push(fb.canvas());
    }
    fountain = { x: fx0 - ox, y: gy - oy + 0, frames };
    L.mid = mkLayer(b.canvas(), 0.16, 0.2, 'bottom');
  }

  // ---- close: heart-shaped hedges in terracotta planters, rose arches, rose bushes, a garden lantern
  const lanterns = [];
  {
    const w = 1024, h = 160, b = new Buf(w, h), m = new Mask(w, h), lawn = 120;
    const LAWN = pal(['#1a3020', '#223a26', '#2c462c', '#385234', '#465e3a', '#5a6c40']);
    const TC = pal(['#5a2418', '#7a3420', '#9a4a2a', '#b8643a', '#d0824e']);
    const lfN = noise2(S + 21, 512, w, 2);
    for (let y = lawn; y < h; y++) for (let x = 0; x < w; x++) b.set(x, y, rp(LAWN, 2.6 - (y - lawn) / 30 + (lfN(x, y * 3) - 0.5) * 1.2 + (y === lawn ? 1.4 : 0), x, y));
    const slots = [];
    for (let i = 0; i < 10; i++) slots.push(i);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const kinds = ['arch', 'heart', 'bush', 'heart', 'lamp', 'arch', 'heart', 'bush', 'heart', 'bush'];
    const items = slots.map((s, i) => ({ x: s * (w / 10) + 30 + R() * 40, k: kinds[i] }));
    // arches first (behind)
    const leafCl = [];
    for (const it of items) if (it.k === 'arch') {
      const x = it.x, r = 20, gy = lawn + 4, py = gy - 34;
      const post = (px) => { for (let y = py; y < gy; y++) { b.set(px - 1, y, hex('#e8dcd4')); b.set(px, y, hex('#b8a8a8')); b.set(px + 1, y, hex('#7a6870')); } };
      post(x - r); post(x + r);
      for (let a = Math.PI; a <= TAU + 0.01; a += 0.02) for (let j = -1; j <= 1; j++) b.set(x + Math.cos(a) * (r + j), py + Math.sin(a) * (r + j), hex(j < 0 ? '#e8dcd4' : j ? '#7a6870' : '#b8a8a8'));
      for (let i = 0; i < 46; i++) {
        const f = R(), a = Math.PI + f * Math.PI;
        const onArch = R() < 0.7;
        const px = onArch ? x + Math.cos(a) * r : x + (R() < 0.5 ? -r : r), py2 = onArch ? py + Math.sin(a) * r : py + R() * (gy - py);
        leafCl.push([px + (R() - 0.5) * 5, py2 + (R() - 0.5) * 5, 2.4 + R() * 2.2, 0, it]);
      }
    }
    paintClumps(b, leafCl, LEAF, S + 22, { lo: 1, amp: 3.4 });
    for (const c of leafCl) if (R() < 0.55) rose(b, c[0] + (R() - 0.5) * 3, c[1] + (R() - 0.5) * 3, 1.3 + R() * 0.9, R() < 0.6 ? RR : R() < 0.5 ? RP : RW);
    // heart hedges in planters
    for (const it of items) if (it.k === 'heart') {
      const x = it.x, s = 15 + R() * 5, pot = lawn + 6, hy = pot - 12 - s;
      rRect(x - 1, hy + s * 0.6, 3, pot - hy - s * 0.6, m.P(3));
      for (let y = Math.floor(hy - s - 1); y <= hy + s + 1; y++) for (let xx = Math.floor(x - s - 1); xx <= x + s + 1; xx++)
        if (inHeart((xx + 0.5 - x) / s, (y + 0.5 - hy) / s)) m.set(xx, y, 1);
      for (let y = pot - 2; y < pot + 9; y++) { const f = (y - pot + 2) / 11, hw = 9 - f * 3; for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) m.set(xx, y, 4); }
    }
    // rose bushes
    const bushCl = [];
    for (const it of items) if (it.k === 'bush') for (let i = 0; i < 16; i++) {
      const a = Math.PI + R() * Math.PI, q = Math.sqrt(R());
      bushCl.push([it.x + Math.cos(a) * q * 18, lawn + 4 + Math.sin(a) * q * 12, 3 + R() * 2.4]);
    }
    paintClumps(b, bushCl, LEAF, S + 23, { lo: 1.1, amp: 3.2 });
    for (const c of bushCl) if (R() < 0.7) rose(b, c[0] + (R() - 0.5) * 4, c[1] + (R() - 0.5) * 3, 1.5 + R() * 0.8, R() < 0.5 ? RR : RP);
    const lf = noise2(S + 24, 512, w, 2), hs = hedgeShade(m, HED, lf, warm);
    paint(m, b, (x, y, k) => {
      if (k === 3) return rp(pal(['#2a1a14', '#3e281e', '#5a3a28']), m.at(x - 1, y) === 3 ? 1 : 2, x, y);
      if (k === 4) return rp(TC, 2.2 + (m.at(x - 1, y) !== 4 ? 1.4 : m.at(x - 2, y) !== 4 ? 0.8 : 0) - (m.at(x + 1, y) !== 4 ? 1.2 : 0) + (m.at(x, y - 1) !== 4 ? 1.6 : 0), x, y);
      return hs(x, y, k);
    });
    // a few roses on the hearts
    for (const it of items) if (it.k === 'heart') for (let i = 0; i < 9; i++) {
      const x = it.x + (R() - 0.5) * 22, y = lawn - 30 + (R() - 0.5) * 22;
      if (m.at(x, y) === 1 && m.at(x, y - 2) === 1 && m.at(x + 2, y) === 1) rose(b, x, y, 1.3, RR);
    }
    // garden lantern on a post
    for (const it of items) if (it.k === 'lamp') {
      const x = Math.round(it.x), gy = lawn + 6;
      for (let y = gy - 40; y < gy; y++) { b.set(x, y, hex('#2a1e26')); b.set(x + 1, y, hex('#141016')); }
      spr(b, x - 3, gy - 50, ['..kk...', '.kkkk..', 'kyyyyk.', 'kyooyk.', 'kyooyk.', 'kkkkkk.', '..kk...'],
        { k: hex('#1c1418'), y: hex('#ffe6a0'), o: hex('#ffb060') });
      lanterns.push({ x: x, y: gy - 46 });
    }
    // bed of roses along the lawn edge
    for (let i = 0; i < 160; i++) { const x = R() * w, y = lawn + 2 + R() * 8; rose(b, x, y, 1 + R() * 0.7, i % 4 ? RR : RP); }
    L.close = mkLayer(b.canvas(), 0.32, 0.34, 'bottom');
  }

  // ---- near: climbing roses trailing down from the top edge
  {
    const w = 1024, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const blooms = [];
    for (let i = 0; i < 12; i++) {
      const x0 = R() * w, len = 18 + Math.pow(R(), 1.3) * 60, amp = 2 + R() * 5, ph = R() * TAU, fq = 0.04 + R() * 0.04;
      let next = 3 + R() * 4, side = R() < 0.5 ? -1 : 1;
      for (let k = 0; k < len; k++) {
        const x = Math.round(x0 + amp * Math.sin(ph + k * fq) * (k / len)), y = k - 2;
        m.set(x, y, 1);
        if (k > next) { m.set(x + side, y, 2); m.set(x + side * 2, y, 2); m.set(x + side, y - 1, 2); m.set(x + side * 2, y + 1, 2); if (R() < 0.3) blooms.push([x - side * 2, y]); side = -side; next = k + 3 + R() * 4; }
      }
      blooms.push([Math.round(x0 + amp * Math.sin(ph + len * fq)), len]);
    }
    for (let x = 0; x < w; x++) { const d = Math.max(0, Math.sin(x * 0.011) * 7 + Math.sin(x * 0.037) * 3); for (let y = 0; y < d; y++) m.set(x, y, 2); }
    const NL = pal(['#0c1612', '#121e18', '#1a2a20', '#243628', '#2e4230']);
    paint(m, b, (x, y, k) => rp(NL, k === 1 ? 1 : !m.at(x, y - 1) ? 3.4 : !m.at(x - 1, y) ? 2.6 : 1.4, x, y));
    const NR = pal(['#3a0614', '#600c20', '#8a1630', '#b42642', '#dc4460', '#f47890']);
    for (const [x, y] of blooms) rose(b, x, y + 1, 2.2, NR);
    L.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const sunG = glowSprite(34, '#ffc080', 0.4), glowW = glowSprite(5, '#ffb060', 0.6), glowLn = glowSprite(14, '#ffb060', 0.5);
  const hearts = [heartSprite(3, '#ff9ab8', '#fff0f4'), heartSprite(4, '#ffb0c8', '#fff4f8'), heartSprite(5, '#ff8aaa', '#ffe8f0')];
  const lights = [];
  for (let i = 0; i < 7; i++) lights.push({ x: R() * (W + 60), y: R() * 150, p: R() * TAU, k: i % 3, v: 4 + R() * 5, f: 0.4 + R() * 0.5 });
  const petals = drifters(R, 20, W, H, { vx: [-14, -5], vy: [5, 11], amp: [5, 12], cols: ['#d42a48', '#f05a76', '#a81a34', '#ff8aa4', '#e8405e'] });

  return {
    fog: '#a0587a',
    back(g, cx, cy, t) {
      blit(g, L.sky, E, cx, cy, t);
      add(g); g.globalAlpha = 0.75 + 0.15 * Math.sin(t * 0.4);
      onScreen(L.sky, E, cx, cy, t, sunX, L.sky.h - 1 - sunD, 40, (x, y) => g.drawImage(sunG, Math.floor(x) - 34, Math.floor(y) - 34));
      norm(g);
      blit(g, L.far, E, cx, cy, t);
      add(g);
      winGlow.forEach(([x, y], i) => { g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 1.3 + i * 1.7); onScreen(L.far, E, cx, cy, t, x, y, 8, (sx, sy) => g.drawImage(glowW, Math.floor(sx) - 5, Math.floor(sy) - 5)); });
      norm(g);
      blit(g, L.mid, E, cx, cy, t);
      const fr = fountain.frames[Math.floor(t * 8) & 3];
      onScreen(L.mid, E, cx, cy, t, fountain.x, fountain.y, 120, (x, y) => g.drawImage(fr, Math.floor(x), Math.floor(y)));
      blit(g, L.close, E, cx, cy, t);
      add(g);
      lanterns.forEach((l, i) => {
        g.globalAlpha = clamp(0.6 + 0.15 * Math.sin(t * 6 + i) * Math.sin(t * 2.3), 0, 1);
        onScreen(L.close, E, cx, cy, t, l.x, l.y, 16, (x, y) => g.drawImage(glowLn, Math.floor(x) - 14, Math.floor(y) - 14));
      });
      norm(g);
      blit(g, L.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      g.globalAlpha = 0.9;
      for (const P of petals) { const [x, y] = driftPos(P, t, cx, cy, W, H, 1.2); tumble(g, P, x, y, t); }
      for (const l of lights) {
        const sp = hearts[l.k], r = sp.width >> 1;
        const x = Math.floor(wrapP(l.x + Math.sin(t * l.f + l.p) * 10 - cx * 1.1, W + 60)) - 30;
        const yy = wrapP(l.y - t * l.v - cy * 1.1, 150), y = Math.floor(yy) - 10;
        g.globalAlpha = clamp((0.35 + 0.4 * Math.sin(t * 1.7 + l.p)) * Math.min(1, yy / 30, (150 - yy) / 40), 0, 1);
        g.drawImage(sp, x - r, y - r);
      }
      norm(g);
    },
  };
}

// ===========================================================================
// VALENTINE (inside) — the candy-box mansion

const GOLD = ['#4a2c10', '#7a5018', '#a87826', '#d0a03a', '#ecc85a', '#fff0a0'];
// satin ribbon bow centred at (x, y); P: 5-6 step palette
function bow(b, x, y, s, P) {
  for (const d of [-1, 1]) {
    rPoly([[x, y], [x + d * 7 * s, y - 5 * s], [x + d * 8 * s, y + 3 * s]], (px, py) => {
      const u = Math.abs(px + 0.5 - x) / (8 * s);
      b.set(px, py, rp(P, 1.6 + (d < 0 ? 1.2 : 0) + (1 - u) * 1.4 - (py > y ? 0.8 : 0), px, py));
    });
    rPoly([[x, y], [x + d * 3 * s, y + 9 * s], [x + d * 6 * s, y + 8 * s]], (px, py) => b.set(px, py, rp(P, d < 0 ? 2.4 : 1.2, px, py)));
  }
  rDisc(x, y, 1.6 * s, (px, py) => b.set(px, py, rp(P, 3.4, px, py)));
}

function buildValIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};
  const GD = pal(GOLD);

  // ---- wall: rose damask over red wainscot, heart-shaped windows dressed with velvet curtains
  {
    const PK = pal(['#6e1e3a', '#86284a', '#9c3458', '#b04266', '#c45274', '#d66684', '#e67e98']);
    const RD = pal(['#2a0610', '#3e0a18', '#560f22', '#6e162c', '#881f36', '#a42a42']);
    const VEL = pal(['#280410', '#3c0818', '#560c20', '#721428', '#901c32', '#b0283e', '#cc4050']);
    const SKY = pal(['#2a1a4a', '#3e2260', '#5a2a72', '#7a347c', '#a04482', '#c85a86', '#e87a88']);
    const w = 768, fy = 0.15, h = fullH(E, fy), b = new Buf(w, h);
    const rail = h - 78;
    // damask motif (mirrored, half-drop repeat)
    const TW = 24, TH = 32;
    const motif = (x, y) => {
      const col = Math.floor(x / TW), yy = wrapP(y + (col & 1) * TH / 2, TH), ax = Math.abs(wrapP(x, TW) + 0.5 - TW / 2);
      const fl = Math.hypot(ax / 3.2, (yy - 13) / 7) < 1 && !(yy < 9 && ax > (yy - 6) * 0.9);
      const curl = Math.abs(Math.hypot(ax - 6, yy - 18) - 3.2) < 0.9 && yy > 16;
      const leaf = Math.hypot((ax - 7) / 1.6, (yy - 10) / 3.6) < 1;
      const dot = Math.hypot(ax, yy - 26) < 1.6 || Math.hypot(ax - 11.5, yy - 3) < 1.2;
      const stem = ax < 0.8 && yy > 19 && yy < 25;
      return fl || curl || leaf || dot || stem;
    };
    const tex = fbm2(S + 2, 64, w, 10, 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c;
      if (y < rail) {
        const mo = motif(x, y), sh = !mo && motif(x - 1, y - 1);
        let v = 2.1 + (tex(x, y) - 0.5) * 0.7 + (mo ? 1.25 : 0) - (sh ? 0.7 : 0) + clamp(1 - y / 40, 0, 1) * -0.6;
        if (Math.abs(wrapP(x, TW) - TW / 2) < 0.5 && !mo) v += 0.25;
        c = rp(PK, v, x, y);
      } else {
        const ly = y - rail, px = wrapP(x, 64);
        let v = 2.2 + (tex(x, y) - 0.5) * 0.5;
        const inPanel = px > 6 && px < 58 && ly > 14 && ly < 70;
        if (inPanel) { v = 1.8; if (px === 7 || ly === 15) v = 0.6; if (px === 57 || ly === 69) v = 4.2; if (px > 10 && px < 54 && ly > 18 && ly < 66) v = 2.6; }
        c = rp(RD, v, x, y);
      }
      b.d[y * w + x] = c;
    }
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 7; k++) b.set(x, rail - 3 + k, rp(GD, [2, 4.4, 3.6, 2.6, 1.4, 3, 1][k], x, rail - 3 + k));
      for (let k = 0; k < 8; k++) b.set(x, k, rp(GD, [1, 2, 3.8, 4.6, 3, 2, 3.4, 0.8][k], x, k));
      if (x % 6 === 0) { b.set(x, 5, GD[1]); b.set(x, rail + 1, GD[5]); }
    }
    // heart windows with curtains
    const spacing = 256;
    for (let k = 0; k < 3; k++) {
      const cx = k * spacing + spacing / 2, cy = 74, s = 25;
      const inW = (x, y) => inHeart((x + 0.5 - cx) / s, (y + 0.5 - cy) / s);
      const inF = (x, y) => inHeart((x + 0.5 - cx) / (s + 4), (y + 0.5 - cy + 1) / (s + 4));
      for (let y = cy - s - 8; y < cy + s + 8; y++) for (let x = cx - s - 8; x < cx + s + 8; x++) {
        if (inW(x, y)) {
          const d = (y - (cy - s)) / (2 * s);
          let c = rp(SKY, 1 + d * 5.2, x, y);
          if (Math.abs(x + 0.5 - cx) < 1 || Math.abs(y - cy + 2) < 1) c = GD[2];
          else if (!inW(x - 1, y) || !inW(x, y - 1)) c = GD[1];
          b.set(x, y, c);
        } else if (inF(x, y)) {
          const lx = x + 0.5 - cx, ly = y + 0.5 - cy;
          b.set(x, y, rp(GD, 2.4 + (lx < 0 ? 1 : -0.4) + (ly < 0 ? 0.8 : -0.4) + (h2(x, y, S) > 0.8 ? 0.8 : 0), x, y));
        }
      }
      // moon + stars in the pane
      rDisc(cx + 9, cy - 10, 4, (x, y) => { if (inW(x, y) && Math.hypot(x + 0.5 - cx - 11, y + 0.5 - cy + 11) > 3.6) b.set(x, y, hex('#fff2d8')); });
      for (let i = 0; i < 7; i++) { const x = cx - 18 + R() * 30, y = cy - 18 + R() * 24; if (inW(x, y) && inW(x + 1, y) && Math.abs(x - cx) > 2) b.set(x, y, hex(i % 2 ? '#ffe8f4' : '#c8a0e0')); }
      // curtains: valance across the top, drapes tied back at each side
      for (const sd of [-1, 1]) {
        const x0 = cx + sd * (s + 14);
        for (let y = 14; y < rail - 2; y++) {
          const f = (y - 14) / (rail - 16), tie = Math.exp(-((y - (cy + 18)) ** 2) / 120);
          const hw = 12 + f * 6 - tie * 7, xc = x0 - sd * tie * 4;
          for (let x = Math.floor(xc - hw); x <= xc + hw; x++) {
            const u = (x + 0.5 - xc) / hw;
            const folds = Math.sin(u * Math.PI * 2.6 + (sd > 0 ? 1 : 0)) * (1 - tie * 0.6);
            b.set(x, y, rp(VEL, 2.6 + folds * 1.7 - Math.abs(u) * 0.8 + (y > rail - 10 ? -0.6 : 0), x, y));
          }
        }
        const ty = cy + 18;
        for (let x = x0 - 10; x <= x0 + 10; x++) { b.set(x - sd * 4, ty, GD[4]); b.set(x - sd * 4, ty + 1, GD[2]); }
        rDisc(x0 + sd * 8, ty + 3, 2, b.P(GD[3]));
        for (let i = 0; i < 6; i++) b.set(x0 + sd * 8 - 1 + (i % 3), ty + 5 + (i >> 1), GD[i % 2 ? 1 : 3]);
      }
      for (let x = cx - s - 30; x <= cx + s + 30; x++) {
        const u = (x - (cx - s - 30)) / ((s + 30) * 2), scal = 6 + 7 * Math.abs(Math.sin(u * Math.PI * 3));
        for (let y = 8; y < 14 + scal; y++) b.set(x, y, rp(VEL, 3.4 - (y - 8) / (6 + scal) * 2 + (Math.sin(x * 0.5) > 0.6 ? 0.6 : 0), x, y));
        b.set(x, 14 + scal, GD[3]);
      }
    }
    L.wall = mkLayer(b.canvas(), 0.15, fy, 'full');
  }

  // ---- mid: giant chocolate boxes, ribbon, truffles in ruffled cups
  {
    const w = 1024, h = 168, b = new Buf(w, h), floor = h - 30;
    const BX = [pal(['#3a0612', '#5e0c1e', '#841630', '#a8223e', '#cc3452', '#e85a70']), pal(['#5a2440', '#7e3458', '#a44a72', '#c8648e', '#e486aa', '#f8b0c8']),
      pal(['#5a4630', '#7e6646', '#a48a62', '#c8ae84', '#e6d0a8', '#fff0d0'])];
    const RB = [pal(['#8a5a10', '#b88420', '#e0ac3a', '#f6d060', '#fff0a8']), pal(['#a02a50', '#cc4872', '#ec7098', '#ff9cbc', '#ffd0e0']), pal(['#a0a0b0', '#c8c8d4', '#e4e4ec', '#f8f8ff', '#ffffff'])];
    const CHk = pal(['#1e0c06', '#2e140a', '#44200e', '#5c2e16', '#7a4222', '#9a5c34']);
    let x = 30;
    let n = 0;
    while (x < w - 80) {
      const kind = ['heart', 'stack', 'truffle', 'heart', 'truffle', 'stack'][n % 6];
      if (kind === 'heart') {
        const s = 30 + R() * 8, cy = floor - s - 2, P = BX[n % 2], RBn = RB[(n >> 1) % 2];
        const cx = x + s;
        // box depth (offset to the right/down), then the lid face
        for (let y = Math.floor(cy - s - 2); y < floor; y++) for (let xx = Math.floor(cx - s - 2); xx <= cx + s + 8; xx++) {
          const fu = (xx + 0.5 - cx) / s, fv = (y + 0.5 - cy) / s;
          const face = inHeart(fu, fv), side = !face && inHeart((xx + 0.5 - cx - 6) / s, (y + 0.5 - cy - 3) / s);
          if (side) b.set(xx, y, rp(P, 1.2 + ((xx + y) % 9 === 0 ? 0.6 : 0), xx, y));
          else if (face) {
            const rim = !inHeart(fu * 1.08, fv * 1.08 + 0.02);
            const l = clamp(1 - Math.hypot(fu + 0.35, fv + 0.45) / 1.6, 0, 1);
            let v = rim ? 4.4 - (fu > 0 ? 1.6 : 0) : 1.8 + l * 2.6;
            b.set(xx, y, rp(rim ? GD : P, v, xx, y));
          }
        }
        // ribbon diagonal across the lid + bow
        for (let i = -s; i <= s; i++) for (let j = -2; j <= 2; j++) {
          const px = cx + i * 0.8 + j * 0.6, py = cy + i * 0.6 - j * 0.8;
          if (inHeart((px + 0.5 - cx) / s, (py + 0.5 - cy) / s) && inHeart((px + 0.5 - cx) / s * 1.08, (py + 0.5 - cy) / s * 1.08 + 0.02))
            b.set(px, py, rp(RBn, 2.4 + (j < 0 ? 1.2 : j > 1 ? -1 : 0), px, py));
        }
        bow(b, cx - s * 0.35, cy - s * 0.28, 1.4, RBn);
        x += s * 2 + 30 + R() * 30;
      } else if (kind === 'stack') {
        let by = floor;
        const nb = 2 + Math.floor(R() * 2);
        let bw = 54 + R() * 14;
        const sx = x;
        for (let k = 0; k < nb; k++) {
          const bh = 18 + R() * 10, P = BX[(n + k) % 3], RBn = RB[(n + k + 1) % 3], bx = sx + (R() - 0.5) * 8 + (k ? 6 : 0);
          for (let y = Math.floor(by - bh); y < by; y++) for (let xx = Math.floor(bx); xx < bx + bw; xx++) {
            const lx = xx - bx, ly = y - (by - bh);
            let v = 2.2 + (lx < 2 ? 1.2 : 0) - (lx > bw - 3 ? 1 : 0) + (ly < 4 ? 1.4 : 0) - (ly === 4 ? 0.8 : 0);
            let c = rp(P, v, xx, y);
            if (Math.abs(lx - bw * 0.4) < 2.5) c = rp(RBn, 2.6 + (lx < bw * 0.4 ? 1 : -0.6), xx, y);
            if (ly === 0) c = P[5];
            b.set(xx, y, c);
          }
          if (k === nb - 1) bow(b, bx + bw * 0.4, by - bh - 2, 1.2, RBn);
          by -= bh; bw *= 0.82;
        }
        x += 100 + R() * 40;
      } else {
        // truffle in a ruffled paper cup
        const r = 14 + R() * 5, tx = x + r + 4, ty = floor - r * 1.4;
        const CUP = n % 2 ? RB[0] : BX[1];
        for (let y = Math.floor(ty); y < floor; y++) {
          const f = (y - ty) / (floor - ty), hw = r * 1.2 - f * 3;
          for (let xx = Math.floor(tx - hw); xx <= tx + hw; xx++) {
            const ru = Math.sin((xx - tx) * 1.1);
            b.set(xx, y, rp(CUP, 2 + ru * 0.9 - (xx > tx ? 0.6 : 0) + (y === Math.floor(ty) ? 1.4 : 0), xx, y));
          }
        }
        rDisc(tx, ty - r * 0.35, r, (px, py) => {
          if (py > ty + 2) return;
          const dx = px + 0.5 - tx, dy = py + 0.5 - (ty - r * 0.35);
          const l = clamp(1 - Math.hypot(dx + r * 0.4, dy + r * 0.5) / (r * 1.5), 0, 1);
          b.set(px, py, rp(CHk, 1 + l * 4 + (h2(px, py, S + 9) > 0.85 ? 0.8 : 0), px, py));
        });
        for (let i = 0; i < 4; i++) rSag(tx - r * 0.6, ty - r * 0.8 + i * 3, tx + r * 0.5, ty - r * 0.9 + i * 3 + 2, -2, b.P(i % 2 ? CHk[5] : CHk[4]));
        x += r * 2 + 40 + R() * 30;
      }
      n++;
    }
    // ribbon unspooled along the floor
    const RBf = RB[1];
    for (let xx = 0; xx < w; xx++) {
      const y = floor - 3 + Math.round(Math.sin(xx * 0.03) * 2 + Math.sin(xx * 0.011) * 3);
      if (b.get(xx, y) || b.get(xx, y + 2)) continue;
      b.set(xx, y, RBf[4]); b.set(xx, y + 1, RBf[2]); b.set(xx, y + 2, RBf[1]); b.set(xx, y + 3, RBf[0]);
    }
    L.mid = mkLayer(b.canvas(), 0.3, 0.32, 'bottom');
  }

  // ---- near: crystal chandeliers and ribbon swags
  const candles = [], crystals = [], chand = [];
  {
    const w = 1024, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h);
    const RBN = pal(['#8a2244', '#b43a62', '#d8608a', '#f08cae', '#ffc0d4']);
    const ch = [];
    for (let k = 0; k < 2; k++) ch.push(k * 512 + 140 + Math.floor(R() * 220));
    // swags between the chandeliers and the edges of the strip
    const pts = [];
    for (let x = 0; x <= w; x += 128) pts.push(x);
    for (let i = 0; i + 1 < pts.length; i++) {
      const x0 = pts[i], x1 = pts[i + 1];
      rSag(x0, 2, x1, 2, 14, (x, y) => { b.set(x, y, RBN[3]); b.set(x, y + 1, RBN[2]); b.set(x, y + 2, RBN[1]); b.set(x, y + 3, RBN[0]); });
    }
    for (const x of pts) bow(b, x % w, 4, 1, RBN);
    for (const cx of ch) {
      const cy = 50 + Math.floor(R() * 10);
      chand.push({ x: cx + 0.5, y: cy });
      // chain
      for (let y = 0; y < cy - 20; y += 3) { b.set(cx, y, GD[3]); b.set(cx, y + 1, GD[1]); b.set(cx - 1, y + 1, GD[2]); }
      // stem and bowl
      for (let y = cy - 22; y < cy + 10; y++) {
        const f = (y - (cy - 22)) / 32, hw = 1.5 + Math.sin(f * Math.PI * 3) * 1.2 + (f > 0.7 ? (f - 0.7) * 16 : 0);
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) b.set(x, y, rp(GD, 1.4 + 3.4 * Math.max(0, cyl((x + 0.5 - cx) / (hw + 0.5))), x, y));
      }
      rDisc(cx, cy + 12, 2, b.P(GD[2])); b.set(cx, cy + 15, hex('#ffe8f0'));
      // two tiers of arms with candles and hanging crystals
      for (const [ry, rx, n] of [[cy + 6, 38, 8], [cy - 8, 24, 5]]) {
        for (let i = 0; i < n; i++) {
          const a = (i + 0.5) / n, ax = cx + (a * 2 - 1) * rx;
          rSag(cx, ry, ax, ry - 5, 6, b.P(GD[3]));
          rSag(cx, ry + 1, ax, ry - 4, 6, b.P(GD[1]));
          // candle
          b.set(ax - 1, ry - 6, GD[4]); b.set(ax, ry - 6, GD[4]); b.set(ax + 1, ry - 6, GD[2]);
          for (let y = ry - 11; y < ry - 6; y++) { b.set(ax, y, hex('#fff4ec')); b.set(ax + 1, y, hex('#e8d0c8')); }
          candles.push({ x: ax + 0.5, y: ry - 13 });
          // crystal drops
          const nd = 2 + (i % 2);
          for (let j = 0; j < nd; j++) {
            const dx2 = ax + (j - (nd - 1) / 2) * 3, y0 = sagY(cx, ry, ax, ry - 5, 6, clamp((dx2 - cx) / (ax - cx || 1), 0, 1)) + 2, len = 4 + j * 2 + (i % 3);
            for (let y = y0; y < y0 + len; y++) b.set(dx2, y, hex((y - y0) % 2 ? '#c0d0ff' : '#f0f4ff'));
            b.set(dx2, y0 + len, hex('#ffffff')); b.set(dx2 - 1, y0 + len + 1, hex('#a0b0e0')); b.set(dx2 + 1, y0 + len + 1, hex('#e0e8ff')); b.set(dx2, y0 + len + 2, hex('#c0d0ff'));
            crystals.push({ x: dx2, y: y0 + len + 1, p: R() * TAU });
          }
        }
      }
      // a ring of crystal swags under the bowl
      for (let i = -3; i <= 3; i++) {
        const x0 = cx + i * 5, len = 8 + (3 - Math.abs(i)) * 3;
        for (let y = cy + 10; y < cy + 10 + len; y += 2) { b.set(x0, y, hex('#e8eeff')); b.set(x0, y + 1, hex('#9aa8d8')); }
        crystals.push({ x: x0, y: cy + 10 + len, p: R() * TAU });
      }
    }
    L.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const flames = [];
  for (let f = 0; f < 3; f++) {
    const fb = new Buf(3, 5, false), FL = [hex('#ff9040'), hex('#ffd060'), hex('#fff4c0')];
    const rows = [['.a.', '.b.', 'aba', 'bcb', '.b.'], ['a..', '.b.', '.ba', 'bcb', '.b.'], ['..a', '.b.', 'ab.', 'bcb', '.b.']][f];
    spr(fb, 0, 0, rows, { a: FL[0], b: FL[1], c: FL[2] });
    flames.push(fb.canvas());
  }
  const glowC = glowSprite(10, '#ffb870', 0.45), glowBig = glowSprite(36, '#ffb0a0', 0.22);
  const sparks = [];
  for (let i = 0; i < 24; i++) sparks.push({ x: R() * (W + 20), y: R() * (H * 0.75), p: R(), r: 0.25 + R() * 0.45, v: 2 + R() * 6, c: i % 3 });
  const SPC = [['#fff4fa', '#ff9ac0'], ['#fff8e0', '#f0c050'], ['#ffffff', '#c0b0ff']];

  return {
    fog: '#7a2a4a',
    back(g, cx, cy, t) {
      blit(g, L.wall, E, cx, cy, t);
      blit(g, L.mid, E, cx, cy, t);
      blit(g, L.near, E, cx, cy, t);
      candles.forEach((c, i) => {
        onScreen(L.near, E, cx, cy, t, c.x, c.y, 12, (x, y) => {
          g.drawImage(flames[(Math.floor(t * 9) + i) % 3], Math.floor(x) - 1, Math.floor(y));
          add(g); g.globalAlpha = clamp(0.55 + 0.15 * Math.sin(t * 9 + i * 1.7), 0, 1);
          g.drawImage(glowC, Math.floor(x) - 10, Math.floor(y) - 8);
          norm(g);
        });
      });
      add(g); g.globalAlpha = 0.5 + 0.08 * Math.sin(t * 2);
      for (const c of chand) onScreen(L.near, E, cx, cy, t, c.x, c.y, 40, (x, y) => g.drawImage(glowBig, Math.floor(x) - 36, Math.floor(y) - 36));
      g.fillStyle = '#ffffff';
      for (const c of crystals) {
        const k = Math.sin(t * 2.3 + c.p * 3) * Math.sin(t * 0.7 + c.p);
        if (k < 0.75) continue;
        g.globalAlpha = (k - 0.75) * 4;
        onScreen(L.near, E, cx, cy, t, c.x, c.y, 4, (x, y) => { g.fillRect(Math.floor(x) - 1, Math.floor(y), 3, 1); g.fillRect(Math.floor(x), Math.floor(y) - 1, 1, 3); });
      }
      norm(g);
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H * 0.75;
      for (const s of sparks) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.5) continue;
        const k = Math.sin(ph * 2 * Math.PI);
        const x = Math.floor(wrapP(s.x - cx * 1.1, sw2)) - 10, y = Math.floor(wrapP(s.y + t * s.v - cy * 1.1, sh2));
        g.globalAlpha = 0.85 * k;
        g.fillStyle = SPC[s.c][0]; g.fillRect(x, y, 1, 1);
        if (k > 0.6) { g.globalAlpha = 0.55 * k; g.fillStyle = SPC[s.c][1]; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
        if (k > 0.9) { g.globalAlpha = 0.3; g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// THANKSGIVING (outside) — the farm in late afternoon, harvest moon rising

const AUT = [
  ['#5a1a10', '#7a2414', '#9a321a', '#bc4420', '#d85a28', '#ee7a34', '#f8a04a'], // red-orange
  ['#6a3410', '#8a4814', '#aa621c', '#c87e26', '#e09c34', '#f2bc4c', '#fcd870'], // gold
  ['#4a1014', '#68161a', '#861e20', '#a42a26', '#c03c2e', '#d8583a', '#ec7a4a'], // crimson
].map(pal);
const CROW = [['k.....k', '.k...k.', '..kkk..', '...k...'], ['.......', '..kkk..', '.k.k.k.', 'k..k..k']];

function buildThanksOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};

  // ---- sky: cool blue overhead warming to amber at the horizon; low sun off to the right; big moon
  const SKY = pal(['#34507e', '#3e5a86', '#4a668e', '#587294', '#687e98', '#7a8a9a', '#8e949a', '#a29c96', '#b6a28e', '#c8a684',
    '#d8aa7a', '#e6ae70', '#f0b66a', '#f6c270', '#fad282', '#fde4a6', '#fff4d4']);
  const moonX = 170, moonD = 106, moonR = 22, sunX = 560;
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  {
    const b = new Buf(sw, sh), base = new Float32Array(sh), glow = new Float32Array(sw * sh);
    const stops = [[0, 13.6], [16, 12.6], [38, 11.3], [66, 9.8], [98, 8.2], [134, 6.6], [176, 4.9], [224, 3.2], [290, 1.4]];
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y; base[y] = interp(stops, d);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - sunX, sw), g1 = Math.max(0, 1 - Math.hypot(dx, d * 2) / 300);
        const dm = Math.hypot(wrapD(x - moonX, sw), d - moonD), g2 = Math.max(0, 1 - dm / 60);
        glow[y * sw + x] = 2.6 * g1 * g1 + 1.1 * g2 * g2;
      }
    }
    const cm = new Mask(sw, sh);
    for (let i = 0; i < 12; i++) { const cx = R() * sw; if (Math.abs(wrapD(cx - moonX, sw)) < 50) continue; streak(cm, R, cx, sh - 1 - (60 + R() * 120), 50 + R() * 140, 1.3 + R() * 2.6); }
    const MOON = pal(['#b8603a', '#cc7448', '#de8c58', '#eca86e', '#f6c488', '#fcdcaa', '#fff0d0']);
    const mare = fbm2(S + 9, 6, 60, 10, 3);
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y;
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x, gl = glow[i];
        let v = base[y] + gl, c;
        const dx = wrapD(x - moonX, sw), dy = d - moonD, dm = Math.hypot(dx, dy);
        if (dm < moonR) {
          const nx = dx / moonR, ny = -dy / moonR;
          let mv = 4.6 - Math.hypot(nx + 0.2, ny + 0.2) * 1.4 - (mare(dx + 30, dy + 30) > 0.55 ? 1.3 : 0) + (dm > moonR - 1.2 ? -0.6 : 0);
          c = rp(MOON, mv, x, y);
        } else if (cm.m[i]) {
          const below = cm.at(x, y + 1), above = cm.at(x, y - 1);
          const warmth = clamp(1 - Math.abs(wrapD(x - sunX, sw)) / 380, 0, 1);
          if (!below) v = base[y] + gl + 1.4 + warmth * 1.6;
          else if (!above) v = base[y] + gl - 1.2;
          else v = base[y] + gl + 0.2 + warmth * 0.6;
          c = rp(SKY, v, x, y);
        } else c = rp(SKY, v, x, y);
        b.d[i] = c;
      }
    }
    L.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- far: patchwork of fields over rolling hills, hedgerows, little copses
  {
    const w = 768, h = 150, b = new Buf(w, h), m = new Mask(w, h);
    const FIELDS = [pal(['#8a7a5a', '#9a8862', '#ac966a', '#bea472']), pal(['#7a7a52', '#88885a', '#989662', '#a8a46c']),
      pal(['#8a6448', '#9a7050', '#ac7e5a', '#be8e64']), pal(['#96825a', '#a89064', '#baa070', '#ccb07c'])];
    const top = ridge(S + 3, w, 58, 12, 4), top2 = ridge(S + 4, w, 80, 9, 5);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, y >= top2[x] ? 2 : 1);
    const fid = (x, y) => {
      const k = m.at(x, y), yy = y - (k === 2 ? top2[x] : top[x]);
      return [Math.floor((x + yy * (k === 2 ? 1.6 : -1.3)) / (k === 2 ? 70 : 52)), Math.floor(yy / (k === 2 ? 14 : 9)), k];
    };
    paint(m, b, (x, y, k) => {
      const [fx, fyy] = fid(x, y), P = FIELDS[Math.floor(h2(fx, fyy * 7 + k, S + 5) * 4)];
      const [fx2, fy2] = fid(x + 1, y), [fx3, fy3] = fid(x, y + 1);
      let v = 1.6 + (h2(fx, fyy, S + 6) - 0.5) * 1.2;
      if (h2(fx, fyy, S + 7) > 0.55 && (y % 2 === 0)) v -= 0.6;
      if (!m.at(x, y - 1) || m.at(x, y - 1) !== k) v += 1.5;
      v += clamp((y - 60) / 80, 0, 1) * 0.8;
      if (fx !== fx2 || fyy !== fy3) return rp(AUT[1], 1.2 + clamp((y - 60) / 80, 0, 1), x, y);
      return rp(P, v, x, y);
    });
    // copses of autumn trees on the crests
    const cl = [];
    for (let i = 0; i < 26; i++) { const x = R() * w, k = R() < 0.5, ty = k ? top[Math.floor(x)] : top2[Math.floor(x)]; for (let j = 0; j < 4; j++) cl.push([x + (R() - 0.5) * 10, ty - 1 - R() * 3, 1.6 + R() * 1.8, -0.8, i % 3]); }
    for (const c of cl) paintClumps(b, [c], AUT[c[4]], S + 8, { lo: 1.2, amp: 2.6, jag: 0.6 });
    // haze toward the top of the layer
    const HZ = hex('#c8a888');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = b.d[y * w + x]; if (!c) continue;
      const q = dq(clamp(1 - (y - 50) / 60, 0, 1) * 0.55 * 4, x, y) / 4;
      if (q > 0) b.d[y * w + x] = mixc(c, HZ, q);
    }
    L.far = mkLayer(b.canvas(), 0.07, 0.1, 'bottom');
  }

  // ---- mid: red barn and silo, blazing autumn trees, a rail fence
  {
    const w = 768, h = 156, b = new Buf(w, h), m = new Mask(w, h), bk = new Mask(w, h);
    const G = pal(['#4a4a22', '#5a5628', '#6c622e', '#807036', '#947e3e', '#a88e48']);
    const top = ridge(S + 11, w, 104, 6, 4);
    const bx = 120 + Math.floor(R() * 300), gy = Math.floor(top[bx]) + 3;
    // trees (behind the barn)
    const clumps = [];
    for (let i = 0; i < 8; i++) {
      let x = R() * w; if (Math.abs(wrapD(x - bx - 20, w)) < 70) x += 140;
      const by = top[Math.floor(wrapP(x, w))] + 3, hh = 30 + R() * 22, tips = [];
      limb(bk.P(1), R, x, by, (R() - 0.5) * 0.2, hh * 0.5, 2.2, 0, tips, null);
      const [tx, ty] = tips[0];
      for (let j = 0; j < 3; j++) limb(bk.P(1), R, tx, ty, (j - 1) * 0.7, hh * 0.3, 1.2, 0, null, null);
      const P = i % 3, rr = 9 + R() * 6;
      for (let j = 0; j < 16; j++) { const a = R() * TAU, q = Math.sqrt(R()); clumps.push([tx + Math.cos(a) * q * rr, ty - hh * 0.15 + Math.sin(a) * q * rr * 0.8, 3 + R() * 2.4, 0, P]); }
    }
    paint(bk, b, (x, y) => rp(pal(['#2a1810', '#3e2416', '#54321e']), bk.at(x - 1, y) ? 1 : 2, x, y));
    clumps.sort((a, c) => a[1] - c[1]);
    for (const c of clumps) paintClumps(b, [c], AUT[c[4]], S + 12, { lo: 1, amp: 4 });
    // ground
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    paint(m, b, (x, y) => rp(G, 2.2 + (!m.at(x, y - 1) ? 2 : 0) + (h2(x, y >> 1, S + 13) - 0.5) * 1.2 - clamp((y - top[x]) / 40, 0, 1), x, y));
    // silo
    const sx = bx + 44, sr = 8, stop = gy - 58;
    const SI = pal(['#4a4a52', '#62606a', '#7c7880', '#989096', '#b4aaa8', '#d2c4b8', '#ecdcc8']);
    for (let y = stop; y < gy; y++) for (let x = sx - sr; x <= sx + sr; x++) {
      const u = (x + 0.5 - sx) / (sr + 0.5);
      let v = 1 + 4.6 * Math.max(0, cyl(-u)) + ((y - stop) % 9 === 0 ? -0.8 : 0);
      b.set(x, y, rp(SI, v, x, y));
    }
    rDisc(sx, stop, sr, (x, y) => { if (y <= stop) b.set(x, y, rp(SI, 2 + 4 * clamp(1 - Math.hypot(x + 0.5 - sx - 3, y + 0.5 - stop + 3) / 10, 0, 1), x, y)); });
    // barn: gambrel roof, red boards, white trim, hayloft and big X doors
    const RB = pal(['#3a0c0a', '#561410', '#701c14', '#8c261a', '#a83420', '#c4482a']);
    const RF = pal(['#241a1c', '#342628', '#463434', '#5a4440']);
    const TR = hex('#f0e4d0'), TRs = hex('#b8a898');
    const ww = 30, wt = gy - 26;
    const prof = [[bx - ww - 2, wt + 1], [bx - ww + 7, wt - 13], [bx, wt - 21], [bx + ww - 7, wt - 13], [bx + ww + 2, wt + 1]];
    for (let y = wt; y < gy; y++) for (let x = bx - ww; x <= bx + ww; x++) b.set(x, y, rp(RB, 2.4 + (x % 4 === 0 ? -1 : 0) + (x > bx ? 0.8 : -0.2), x, y));
    rPoly([[bx - ww, wt], [bx - ww + 8, wt - 12], [bx, wt - 19], [bx + ww - 8, wt - 12], [bx + ww, wt]], (x, y) => b.set(x, y, rp(RB, 2.6 + (x % 4 === 0 ? -1 : 0) + (x > bx ? 0.8 : -0.2), x, y)));
    for (let i = 0; i + 1 < prof.length; i++) { rSeg(prof[i][0], prof[i][1], prof[i + 1][0], prof[i + 1][1], 1.2, 1.2, (x, y) => b.set(x, y, rp(RF, i < 2 ? 1.2 : 2.8, x, y))); }
    for (let i = 0; i + 1 < prof.length; i++) rLine(prof[i][0], prof[i][1] - 1, prof[i + 1][0], prof[i + 1][1] - 1, b.P(RF[3]));
    const frame = (x0, y0, x1, y1, X) => {
      for (let x = x0; x <= x1; x++) { b.set(x, y0, TR); b.set(x, y1, TRs); }
      for (let y = y0; y <= y1; y++) { b.set(x0, y, TR); b.set(x1, y, TRs); }
      if (X) { rLine(x0, y0, x1, y1, b.P(TR)); rLine(x1, y0, x0, y1, b.P(TR)); }
    };
    frame(bx - 11, gy - 19, bx + 11, gy - 1, false); frame(bx - 11, gy - 19, bx, gy - 1, true); frame(bx, gy - 19, bx + 11, gy - 1, true);
    rRect(bx - 4, wt - 13, 9, 9, b.P(RB[0])); frame(bx - 5, wt - 14, bx + 5, wt - 4, false);
    for (let y = wt; y < gy; y++) { b.set(bx - ww, y, TR); b.set(bx + ww, y, TRs); }
    for (const s of [-1, 1]) frame(bx + s * 22 - 3, wt + 4, bx + s * 22 + 3, wt + 10, true);
    // rail fence
    const FN = pal(['#3a2a1e', '#5a4430', '#7a6044', '#9a7c58']);
    for (let x = 0; x < w; x++) {
      if (Math.abs(wrapD(x - bx, w)) < ww + 22) continue;
      const fy0 = Math.floor(top[x]) + 8;
      if (x % 18 === 0) for (let y = fy0 - 9; y < fy0 + 1; y++) { b.set(x, y, FN[3]); b.set(x + 1, y, FN[1]); }
      b.set(x, fy0 - 7, FN[2]); b.set(x, fy0 - 6, FN[0]); b.set(x, fy0 - 3, FN[2]); b.set(x, fy0 - 2, FN[0]);
    }
    L.mid = mkLayer(b.canvas(), 0.16, 0.2, 'bottom');
  }

  // ---- close: golden cornfield, stubble with haystacks, crows perched about
  const perched = [];
  {
    const w = 1024, h = 170, b = new Buf(w, h), base = 134;
    const CORN = pal(['#3e2a10', '#58401a', '#745622', '#90702c', '#ac8a38', '#c8a448', '#e2c060', '#f4da86']);
    const ST = pal(['#5a4420', '#6e5428', '#846632', '#9c7a3c', '#b49048', '#caa658']);
    const HAY = pal(['#6a4a1a', '#86601e', '#a27a28', '#be9636', '#d6b04a', '#ecca66', '#fae29a']);
    for (let y = base; y < h; y++) for (let x = 0; x < w; x++) b.set(x, y, rp(ST, 2.4 - (y - base) / 34 + ((x + y * 2) % 5 === 0 ? -0.8 : 0) + (y === base ? 1 : 0), x, y));
    const inCorn = x => { const u = wrapP(x, w) / w; return (u > 0.02 && u < 0.4) || (u > 0.55 && u < 0.92); };
    // haystacks in the stubble
    for (let k = 0; k < 4; k++) {
      let x = R() * w; let tries = 0; while (inCorn(x) && tries++ < 40) x = R() * w;
      if (inCorn(x)) continue;
      const hw = 18 + R() * 8, hh = 22 + R() * 8, gy = base + 6;
      for (let y = Math.floor(gy - hh); y < gy; y++) {
        const f = (y - (gy - hh)) / hh, half = hw * Math.pow(Math.sin(Math.PI / 2 * Math.min(1, f * 1.4)), 0.7);
        for (let xx = Math.floor(x - half); xx <= x + half; xx++) {
          const u = (xx + 0.5 - x) / (half + 0.5);
          const str = h2(xx + (y >> 1), y, S + 14);
          let v = 1.6 + 3.4 * Math.max(0, cyl(u)) + (str > 0.7 ? 0.9 : str < 0.2 ? -0.8 : 0) - (f > 0.85 ? 1 : 0);
          b.set(xx, y, rp(HAY, v, xx, y));
        }
      }
      for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.4, px = x + Math.cos(a) * hw * 0.9 * R(), py = gy - hh * 0.9 + 2 * R(); rLine(px, py, px + Math.cos(a) * 3, py + Math.sin(a) * 3 - 1, b.P(HAY[6])); }
      perched.push({ x: x + (R() - 0.5) * 6, y: gy - hh - 3 });
    }
    // the body of the field: a dark dense mass, then stalks standing above it
    const massTop = fbm1(S + 18, 40, w, 3);
    for (let x = 0; x < w; x++) {
      if (!inCorn(x)) continue;
      const edge = Math.min(wrapP(x, w) - (wrapP(x, w) < 512 ? 0.02 * w : 0.55 * w), (wrapP(x, w) < 512 ? 0.4 * w : 0.92 * w) - wrapP(x, w));
      const t0 = base - 18 + Math.floor(massTop(x) * 8) + Math.max(0, 8 - edge) * 1.5;
      for (let y = Math.floor(t0); y < base + 22; y++) {
        const k = h2(x, Math.floor(y / 3), S + 19);
        b.set(x, y, rp(CORN, 1 + (y - t0) * -0.01 + (k > 0.7 ? 1.4 : k < 0.2 ? -0.6 : 0.4) + (x % 3 === 0 ? 0.5 : 0) + (y === Math.floor(t0) ? 1.6 : 0), x, y));
      }
    }
    for (let row = 0; row < 2; row++) {
      for (let x = 0; x < w; x += 5) {
        const sx = x + Math.floor(h2(x, row, S + 15) * 4) + row * 2;
        if (!inCorn(sx) || !inCorn(sx - 8) || !inCorn(sx + 8)) continue;
        const gy = base + 6 + row * 12, hh = 30 + h2(sx, row, S + 16) * 10, dk = row * 0.9;
        const lean = (h2(sx, 2, S) - 0.5) * 4;
        for (let k = 0; k < hh; k++) { const px = Math.round(sx + lean * k / hh); b.set(px, gy - k, rp(CORN, 2.2 + dk + (k > hh - 6 ? 1 : 0), px, gy - k)); }
        for (let k = 8; k < hh - 6; k += 5 + Math.floor(h2(sx, k, S) * 3)) {
          const sd = ((k + sx) % 2) ? 1 : -1, px = sx + lean * k / hh, py = gy - k;
          for (let j = 1; j < 8; j++) { b.set(px + sd * j, py - 2 + (j * j) / 9, rp(CORN, 3.4 + dk + (j < 4 ? 0.8 : -0.4), px + sd * j, py)); b.set(px + sd * j, py - 1 + (j * j) / 9, CORN[2]); }
        }
        // tassel
        const tx = Math.round(sx + lean), ty = gy - hh;
        b.set(tx, ty - 1, CORN[7]); b.set(tx - 1, ty, CORN[6]); b.set(tx + 1, ty, CORN[6]); b.set(tx, ty - 2, CORN[6]);
        if (h2(sx, 9, S) < 0.25) { const ex = tx + 1, ey = gy - hh * 0.5; rEllipse(ex + 1, ey, 1.4, 3.2, (a, c) => b.set(a, c, rp(CORN, 5.2 + dk, a, c))); b.set(ex + 2, ey - 3, CORN[2]); }
      }
    }
    // pumpkins at the field edge
    const PU = pal(['#6a2408', '#92340c', '#ba4a12', '#dc6a1c', '#f4902e', '#ffb456']);
    for (let i = 0; i < 18; i++) {
      const x = R() * w, y = base + 12 + R() * 14, r = 3 + R() * 3.5;
      rEllipse(x, y, r * 1.25, r, (px, py) => {
        const u = (px + 0.5 - x) / (r * 1.25), rib = Math.abs(Math.sin(u * 4.7)) < 0.25;
        b.set(px, py, rp(PU, 1.2 + 3.6 * clamp(-u * 0.6 - (py + 0.5 - y) / r * 0.4 + 0.5, 0, 1) - (rib ? 0.9 : 0), px, py));
      });
      b.set(x, y - r - 1, hex('#4a5a1c')); b.set(x + 1, y - r - 2, hex('#6a7a28'));
    }
    L.close = mkLayer(b.canvas(), 0.32, 0.34, 'bottom');
  }

  // ---- near: an old oak bough with blazing leaves reaching in from the top
  {
    const w = 1024, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const clumps = [];
    for (let k = 0; k < 2; k++) {
      const x0 = k * 512 + R() * 200, side = k % 2 ? 1 : -1, tips = [], hangs = [];
      limb((x, y) => { if (y < 80) m.set(x, y, 1); }, R, x0, -6, side * (1.75 + R() * 0.2), 150 + R() * 50, 8, 2, tips, hangs, 0);
      for (const [px, py] of hangs) if (py < 66 && R() < 0.7) clumps.push([px + (R() - 0.5) * 10, py + 2 + R() * 4, 4.5 + R() * 3, 0, Math.floor(R() * 3)]);
      for (const [px, py] of tips) if (py < 76) for (let i = 0; i < 5; i++) clumps.push([px + (R() - 0.5) * 16, py + (R() - 0.5) * 9, 4.5 + R() * 3.5, 0, Math.floor(R() * 3)]);
    }
    const NB = pal(['#160c0a', '#22140e', '#321e14', '#46281a']);
    paint(m, b, (x, y) => rp(NB, !m.at(x, y - 1) ? 2.8 : !m.at(x, y + 1) ? 0.2 : 1.3 + (h2(x, y >> 1, S) - 0.5), x, y));
    clumps.sort((a, c) => a[1] - c[1]);
    for (const c of clumps) paintClumps(b, [c], AUT[c[4]], S + 17, { lo: 0.9, amp: 4.4, jag: 2.2 });
    L.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const crowS = CROW.map(rows => { const fb = new Buf(7, 4, false); spr(fb, 0, 0, rows, { k: hex('#1a1216') }); return fb.canvas(); });
  const perchS = (() => { const fb = new Buf(6, 5, false); spr(fb, 0, 0, ['.kk...', 'kkkk..', '.kkkkk', '..kk..', '..k.k.'], { k: hex('#1a1216') }); fb.set(0, 1, hex('#e0a040')); return fb.canvas(); })();
  const crows = [];
  for (let i = 0; i < 6; i++) crows.push({ x: R() * 800, y: 30 + R() * 50, v: 9 + R() * 6, p: R() * TAU, f: 5 + R() * 3 });
  const moonG = glowSprite(40, '#ffc890', 0.22);
  const leaves = drifters(R, 20, W, H, { vx: [-16, -5], vy: [8, 18], amp: [4, 12], cols: ['#c8502a', '#e07a30', '#a33a2a', '#eba046', '#7a2a2a'] });

  return {
    fog: '#b88a64',
    back(g, cx, cy, t) {
      blit(g, L.sky, E, cx, cy, t);
      add(g); g.globalAlpha = 0.8;
      onScreen(L.sky, E, cx, cy, t, moonX, L.sky.h - 1 - moonD, 44, (x, y) => g.drawImage(moonG, Math.floor(x) - 40, Math.floor(y) - 40));
      norm(g);
      for (const c of crows) {
        const x = Math.floor(wrapP(c.x + t * c.v - cx * 0.12, 800)) - 40, y = Math.floor(c.y + Math.sin(t * 0.7 + c.p) * 6 - cy * 0.1);
        if (x < -10 || x > W + 10) continue;
        g.drawImage(crowS[Math.floor(t * c.f + c.p) & 1], x, y);
      }
      blit(g, L.far, E, cx, cy, t);
      blit(g, L.mid, E, cx, cy, t);
      blit(g, L.close, E, cx, cy, t);
      perched.forEach((p, i) => onScreen(L.close, E, cx, cy, t, p.x, p.y, 8, (x, y) => {
        const hop = Math.sin(t * 0.9 + i * 2) > 0.92 ? -1 : 0;
        if (i % 2) { g.save(); g.translate(Math.floor(x) + 3, 0); g.scale(-1, 1); g.drawImage(perchS, -3, Math.floor(y) + hop); g.restore(); }
        else g.drawImage(perchS, Math.floor(x) - 3, Math.floor(y) + hop);
      }));
      blit(g, L.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      g.globalAlpha = 0.85;
      for (const P of leaves) { const [x, y] = driftPos(P, t, cx, cy, W, H, 1.2); tumble(g, P, x, y, t); }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// THANKSGIVING (inside) — the feast-hall kitchen

const WOOD = ['#140a06', '#1e120a', '#2a1a10', '#382416', '#4a301c', '#5e3e24', '#744e2e'];
function flameFrames(seed, w, h, n = 4) {
  const out = [], FL = pal(['#a83010', '#e85a18', '#ff9a30', '#ffd060', '#fff4c8']);
  for (let f = 0; f < n; f++) {
    const b = new Buf(w, h, false), rr = mulberry32(seed + f);
    const tongues = [];
    for (let i = 0; i < Math.max(3, w / 4); i++) tongues.push([(i + 0.5) / Math.max(3, w / 4) * w + (rr() - 0.5) * 3, h * (0.5 + rr() * 0.5), 1.4 + rr() * w / 10, rr() * TAU]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = 0;
      for (const [tx, th, tw, ph] of tongues) {
        const fy2 = (h - y) / th; if (fy2 > 1) continue;
        const wob = Math.sin(ph + f * 1.6 + y * 0.5) * 1.3 * fy2;
        const d = Math.abs(x + 0.5 - tx - wob) / (tw * (1 - fy2 * 0.85) + 0.3);
        if (d < 1) best = Math.max(best, (1 - d) * (1 - fy2 * 0.7));
      }
      if (best <= 0.05 || (y < h * 0.3 && rr() < 0.25)) continue;
      b.set(x, y, FL[clamp(Math.floor(best * 4.6 + (y / h) * 1.2), 0, 4)]);
    }
    out.push(b.canvas());
  }
  return out;
}

function buildThanksIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};
  const WD = pal(WOOD), CP = pal(COPPER);

  // ---- back wall: warm plaster between dark timbers, a great stone hearth, shelves of crockery
  let hearth;
  {
    const PL = pal(['#3a261a', '#4a3020', '#5c3e28', '#6e4c32', '#80593a', '#946a46', '#a87c52']);
    const STN = pal(['#2a221e', '#3a2e28', '#4a3c32', '#5c4a3e', '#706050', '#887460']);
    const w = 768, fy = 0.14, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const tex = fbm2(S + 1, 48, w, 12, 3);
    const hx = 260 + Math.floor(R() * 260), hw = 56, base = h - 40, hFloor = h - 62, hOpen = hFloor - 40, hTop = hFloor - 72;
    // timber frame
    for (let x = 0; x < w; x += 96) rRect(x - 3, 0, 7, h, m.P(1));
    rRect(0, 30, w, 6, m.P(1)); rRect(0, base - 6, w, 6, m.P(1));
    for (let x = 0; x < w; x += 96) { rSeg(x + 4, 64, x + 28, 36, 2, 2, m.P(1)); rSeg(x + 92, 64, x + 68, 36, 2, 2, m.P(1)); rRect(x + 4, 100, 88, 4, m.P(1)); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c;
      if (m.m[y * w + x]) {
        const dl = edgeDist(m, x, y, -1, 0, 3), dt = edgeDist(m, x, y, 0, -1, 2);
        c = rp(WD, 2 + (dl === 1 ? 1.4 : 0) + (dt === 1 ? 1 : 0) + ((x + y * 3) % 11 === 0 ? -0.8 : 0) + (h2(x >> 1, y >> 3, S) - 0.5), x, y);
      } else if (y >= base) {
        const row = Math.floor((y - base) / 6), off = (row & 1) * 8;
        c = rp(STN, 2 + (h2(Math.floor((x + off) / 16), row, S + 2) - 0.5) * 1.5 - ((y - base) % 6 === 0 || (x + off) % 16 === 0 ? 1.4 : 0), x, y);
      } else c = rp(PL, 2.4 + (tex(x, y) - 0.5) * 2 + clamp((y - 40) / 140, 0, 1) * 0.8, x, y);
      b.d[y * w + x] = c;
    }
    // warm wash of firelight around the hearth
    for (let y = 0; y < h; y++) for (let x = hx - 200; x < hx + 200; x++) {
      const d = Math.hypot(x - hx, (y - hOpen - 30) * 1.2) / 200;
      if (d >= 1) continue;
      const q = dq((1 - d) * (1 - d) * 0.5 * 4, x, y) / 4;
      if (q > 0) b.set(x, y, mixc(b.get(x, y), hex('#e07a30'), q));
    }
    // the hearth
    for (let y = hTop; y < h; y++) for (let x = hx - hw - 10; x <= hx + hw + 10; x++) {
      const inner = Math.abs(x + 0.5 - hx) < hw - 12 && y > hOpen - 22 + (Math.abs(x + 0.5 - hx) / (hw - 12)) ** 2 * 18 && y < hFloor + 4;
      const row = Math.floor((y - hTop) / 7), off = (row & 1) * 9, sx = Math.floor((x + off) / 18);
      if (inner) {
        const dd = Math.hypot((x - hx) / (hw - 12), (y - (hFloor + 2)) / 40);
        b.set(x, y, rp(pal(['#0a0606', '#160c08', '#2a140a', '#4a200c', '#7a3410']), 0.6 + clamp(1 - dd, 0, 1) * 4.2, x, y));
        continue;
      }
      let v = 2.2 + (h2(sx, row, S + 3) - 0.5) * 1.6;
      if ((y - hTop) % 7 === 0 || (x + off) % 18 === 0) v = 0.6;
      else if ((y - hTop) % 7 === 1) v += 0.8;
      const lit = clamp(1 - Math.hypot(x - hx, y - hFloor) / 90, 0, 1);
      b.set(x, y, mixc(rp(STN, v + lit * 1.2, x, y), hex('#ff8a30'), dq(lit * 0.5 * 4, x, y) / 4));
    }
    // mantel beam with plates and candlesticks
    rRect(hx - hw - 16, hTop - 6, hw * 2 + 33, 7, (x, y) => b.set(x, y, rp(WD, y === hTop - 6 ? 5 : 2.6 - (y - hTop + 6) * 0.3, x, y)));
    for (let i = -2; i <= 2; i++) {
      const px = hx + i * 20;
      if (i % 2) { rDisc(px, hTop - 13, 6, (x, y) => b.set(x, y, rp(pal(['#5a4a3a', '#8a7a64', '#c0ae90', '#e8dac0']), 2.4 - Math.hypot(x + 0.5 - px + 2, y + 0.5 - hTop + 15) / 4, x, y))); rDisc(px, hTop - 13, 3, b.P(hex('#4a7aa0'))); }
      else { rRect(px - 1, hTop - 16, 3, 10, (x, y) => b.set(x, y, x === px - 1 ? CP[6] : CP[3])); rRect(px - 3, hTop - 7, 7, 1, b.P(CP[4])); rRect(px, hTop - 20, 1, 4, b.P(hex('#f4e8d0'))); }
    }
    // logs and grate
    for (let x = hx - hw + 8; x <= hx + hw - 8; x++) for (let y = hFloor + 4; y < hFloor + 10; y++) b.set(x, y, rp(STN, y === hFloor + 4 ? 4.6 : 2.4, x, y));
    for (let k = 0; k < 3; k++) rSeg(hx - 28 + k * 6, hFloor - k * 3, hx + 26 - k * 4, hFloor - 2 - (k % 2) * 3, 3.2, 3.2, (x, y) => b.set(x, y, rp(WD, 1.6 + ((x + y) % 5 === 0 ? 1.4 : 0) + (y < hFloor - 3 - k * 3 ? 2 : 0), x, y)));
    // iron stew pot hung over the fire
    for (let y = hOpen - 20; y < hFloor - 24; y += 2) b.set(hx, y, hex('#141010'));
    const IR = pal(['#0c0a0c', '#161216', '#221c20', '#342a2c', '#4a3c3a']);
    for (let y = hFloor - 30; y < hFloor - 12; y++) for (let x = hx - 13; x <= hx + 13; x++) {
      const u = (x + 0.5 - hx) / 13, f = (y - hFloor + 30) / 18;
      if (f > 0.55 && Math.hypot(u, (f - 0.55) / 0.45) > 1) continue;
      b.set(x, y, rp(IR, 0.6 + 3 * Math.max(0, cyl(u)) + (y === hFloor - 30 ? 1.4 : 0) + (f > 0.7 ? 0.8 : 0), x, y));
    }
    for (let x = hx - 14; x <= hx + 14; x++) b.set(x, hFloor - 31, IR[4]);
    hearth = { x: hx, y: hFloor + 2, w: 60, potY: hFloor - 32 };
    // shelves with jars and crocks
    const JAR = [pal(['#3a4a2a', '#5a6e3a', '#7e9450', '#a8bc70']), pal(['#6a2a1a', '#924020', '#bc5a2c', '#e0803c']), pal(['#4a3a5a', '#6a5880', '#8c78a4', '#b4a0c8']), pal(['#7a6a3a', '#a8904a', '#d0b460', '#f0d888'])];
    // a tall dresser of blue-and-white plates across the hall from the hearth
    const dx = Math.floor(wrapP(hx + 384, w)), dw = 84, dTop = base - 118;
    {
      const BW = pal(['#1e3a6a', '#2e5a9a', '#5a86c4', '#c8d4e4', '#eef2f8']);
      for (let y = dTop; y < base; y++) for (let x = dx - dw / 2; x < dx + dw / 2; x++) {
        const lx = x - (dx - dw / 2), ly = y - dTop;
        let v = 2.4 + (lx < 3 ? 1.4 : 0) - (lx > dw - 4 ? 1 : 0);
        if (ly < 6) v = ly < 2 ? 5 : 3.4 - ly * 0.2;
        else if (ly > 80) { v = 3; const px2 = lx % 21; if (px2 < 2 || ly === 81 || ly === base - dTop - 1) v = 1.4; if (px2 === 2 || ly === 82) v = 4.4; if (px2 === 15 && ly > 92 && ly < 100) v = 6; }
        else if (lx > 4 && lx < dw - 5) v = 1 + (ly % 25 === 24 ? 3.6 : ly % 25 === 0 ? 1.6 : 0);
        b.set(x, y, rp(WD, v, x, y));
      }
      for (let r = 0; r < 3; r++) {
        const sy = dTop + 30 + r * 25;
        for (let i = 0; i < 6; i++) {
          const px2 = dx - dw / 2 + 12 + i * 12, py = sy - 10;
          rDisc(px2, py, 5.5, (x, y) => { const d = Math.hypot(x + 0.5 - px2, y + 0.5 - py); b.set(x, y, rp(BW, d > 4.6 ? 3 : d > 3.4 ? 1.4 : d > 2 ? 3.6 : (x + y) % 3 ? 1 : 3.4, x, y)); });
        }
        rRect(dx - dw / 2 + 5, sy - 4, dw - 10, 1, b.P(WD[5]));
      }
      for (let i = 0; i < 3; i++) {
        const jx = dx - 26 + i * 26, jy = dTop - 1;
        for (let y = jy - 12; y < jy; y++) { const hw2 = 3 + Math.sin((y - jy + 12) / 12 * Math.PI) * 2.2; for (let x = Math.floor(jx - hw2); x <= jx + hw2; x++) b.set(x, y, rp(i === 1 ? CP : BW, (i === 1 ? 1.4 : 1) + 3.4 * Math.max(0, cyl((x + 0.5 - jx) / hw2)), x, y)); }
      }
    }
    for (let s = 0; s < 4; s++) {
      const sx = s * 192 + 120;
      if (Math.abs(wrapD(sx - hx, w)) < hw + 80 || Math.abs(wrapD(sx - dx, w)) < dw / 2 + 40) continue;
      for (const sy of [64, 100]) {
        rRect(sx - 30, sy, 60, 3, (x, y) => b.set(x, y, rp(WD, y === sy ? 5 : 2.4, x, y)));
        for (const bx of [sx - 26, sx + 22]) rPoly([[bx, sy + 3], [bx + 4, sy + 3], [bx, sy + 9]], b.P(WD[2]));
        let x = sx - 27;
        while (x < sx + 24) {
          const P = JAR[Math.floor(R() * 4)], jw = 5 + Math.floor(R() * 4), jh = 7 + Math.floor(R() * 7);
          if (R() < 0.3) { rDisc(x + 4, sy - 6, 5.5, (px, py) => { if (py < sy) b.set(px, py, rp(pal(['#6a5a4a', '#9a8a72', '#cabaa0', '#f0e4cc']), 2.6 - Math.hypot(px + 0.5 - x - 2, py + 0.5 - sy + 8) / 3, px, py)); }); x += 10; continue; }
          for (let y = sy - jh; y < sy; y++) for (let xx = x; xx < x + jw; xx++) b.set(xx, y, rp(P, 1.4 + (xx === x ? 1.6 : xx === x + 1 ? 1 : 0) - (xx === x + jw - 1 ? 1 : 0) + (y < sy - jh + 2 ? 0.8 : 0), xx, y));
          rRect(x, sy - jh - 1, jw, 1, b.P(hex('#d8c8a8')));
          x += jw + 1 + Math.floor(R() * 3);
        }
      }
    }
    // ceiling joists
    for (let x = 0; x < w; x++) for (let y = 0; y < 10; y++) b.set(x, y, rp(WD, (x % 48 < 10 ? 2.6 : 0.6) - (y > 7 ? 0.5 : 0) + (x % 48 === 0 ? 1.2 : 0), x, y));
    L.wall = mkLayer(b.canvas(), 0.14, fy, 'full');
  }

  // ---- mid: the long banquet table laid for a feast, with brick bread ovens between the tables
  const ovens = [], cands = [], steamM = [];
  {
    const w = 1024, h = 168, b = new Buf(w, h), top = 116;
    const CLOTH = pal(['#7a6a5a', '#988670', '#b4a288', '#cebca0', '#e6d6b8', '#f8ecd0']);
    const PIE = pal(['#5a2c10', '#7e4418', '#a6622a', '#c88440', '#e2a65a', '#f4c882']);
    const ROAST = pal(['#3a1808', '#5a280e', '#7e3c16', '#a4561e', '#c8762c', '#e49a44', '#f8c070']);
    const BRK = pal(['#3a1a14', '#541f16', '#6e2a1c', '#883a26', '#a04c30']);
    const tables = [[30, 470], [560, 960]];
    for (const [x0, x1] of tables) {
      // cloth: top surface, front drop with folds and a hem
      for (let x = x0; x <= x1; x++) {
        b.set(x, top, CLOTH[5]); b.set(x, top + 1, CLOTH[4]);
        const sc = (x - x0) % 40, scal = Math.round(3 * Math.sin(sc / 40 * Math.PI));
        for (let y = top + 2; y < top + 20 + scal; y++) b.set(x, y, rp(CLOTH, 3.2 + Math.sin(x * 0.45) * 0.8 - (y - top) * 0.06 - (x === x0 || x === x1 ? 1.2 : 0), x, y));
        b.set(x, top + 20 + scal, CLOTH[1]);
        if ((x - x0) % 80 === 10) for (let y = top + 22; y < h - 6; y++) { b.set(x, y, WD[3]); b.set(x + 1, y, WD[2]); b.set(x + 2, y, WD[1]); }
      }
      for (let x = x0 - 6; x <= x1 + 6; x++) { b.set(x, h - 22, WD[4]); b.set(x, h - 21, WD[2]); b.set(x, h - 20, WD[1]); }
      for (let x = x0; x <= x1 + 1; x += 60) for (let y = h - 20; y < h; y++) { b.set(x, y, WD[2]); b.set(x + 1, y, WD[1]); }
      // the spread
      let x = x0 + 10;
      let k = 0;
      while (x < x1 - 20) {
        const kind = ['pie', 'roast', 'fruit', 'cand', 'bread', 'pie', 'jug', 'roast', 'pumpkin', 'cand'][k % 10];
        if (kind === 'pie') {
          for (let y = top - 6; y < top; y++) for (let xx = x - 8; xx <= x + 8; xx++) {
            const f = (y - top + 6) / 6, hw = 6 + f * 2.5;
            if (Math.abs(xx + 0.5 - x) > hw) continue;
            const lat = ((xx + y) % 4 === 0 || (xx - y + 40) % 4 === 0) && y < top - 2;
            b.set(xx, y, rp(PIE, y >= top - 2 ? 2 - (xx > x ? 0.6 : 0) : lat ? 4.6 : 2.6 + (xx < x ? 0.8 : 0), xx, y));
          }
          rRect(x - 10, top - 1, 21, 1, b.P(hex('#d0c8c0')));
          x += 24;
        } else if (kind === 'roast') {
          rEllipse(x + 1, top - 3, 15, 2, b.P(hex('#c8c0b8')));
          rEllipse(x, top - 9, 11, 7, (px, py) => {
            const l = clamp(1 - Math.hypot(px + 0.5 - x + 4, py + 0.5 - top + 13) / 14, 0, 1);
            if (py < top - 3) b.set(px, py, rp(ROAST, 1.6 + l * 4.4 + (h2(px, py, S + 4) > 0.85 ? 0.8 : 0), px, py));
          });
          for (const s of [-1, 1]) { rSeg(x + s * 9, top - 7, x + s * 14, top - 13, 2, 1.4, (px, py) => b.set(px, py, rp(ROAST, s < 0 ? 4.4 : 3, px, py))); b.set(x + s * 15, top - 14, hex('#f4ecd8')); b.set(x + s * 15, top - 15, hex('#f4ecd8')); }
          for (let i = -12; i <= 12; i += 4) b.set(x + i, top - 4, hex(i % 8 ? '#5a8a2a' : '#e05a2a'));
          x += 38;
        } else if (kind === 'fruit') {
          rEllipse(x, top - 3, 9, 3, (px, py) => b.set(px, py, rp(WD, 4 - (py - top + 3), px, py)));
          const FR = [pal(['#6a0e10', '#a01c18', '#d03424', '#f06a40']), pal(['#2a3a10', '#4a6418', '#7a9428', '#a8c048']), pal(['#3a1a4a', '#5a2a6e', '#7e4494', '#a46abc']), pal(['#7a4a08', '#b07010', '#e0a028', '#f8d060'])];
          for (let i = 0; i < 9; i++) { const fx2 = x - 6 + (i % 4) * 4 + (i > 3 ? 2 : 0), fy2 = top - 7 - Math.floor(i / 4) * 3; rDisc(fx2, fy2, 2.2, (px, py) => b.set(px, py, rp(FR[(i + k) % 4], 2.8 - Math.hypot(px + 0.5 - fx2 + 1, py + 0.5 - fy2 + 1) * 0.9, px, py))); }
          x += 24;
        } else if (kind === 'cand') {
          for (const dx of [-5, 0, 5]) { const hh = dx ? 9 : 12; rRect(x + dx, top - hh, 2, hh - 1, (px, py) => b.set(px, py, px === x + dx ? hex('#f8f0e0') : hex('#c8b8a0'))); cands.push({ x: x + dx + 0.5, y: top - hh - 4 }); }
          rRect(x - 6, top - 2, 14, 2, b.P(CP[5])); rRect(x - 1, top - 4, 4, 2, b.P(CP[4]));
          x += 20;
        } else if (kind === 'bread') {
          for (let i = 0; i < 2; i++) rEllipse(x + i * 9, top - 4, 6, 3.5, (px, py) => { if (py < top) b.set(px, py, rp(PIE, 2 + clamp(1 - Math.hypot(px + 0.5 - x - i * 9 + 2, py + 0.5 - top + 6) / 6, 0, 1) * 3.4 - ((px - x) % 4 === 0 && py < top - 4 ? 1.4 : 0), px, py)); });
          x += 26;
        } else if (kind === 'jug') {
          for (let y = top - 14; y < top; y++) { const hw = 3 + Math.sin((y - top + 14) / 14 * Math.PI) * 2.5; for (let xx = Math.floor(x - hw); xx <= x + hw; xx++) b.set(xx, y, rp(pal(['#4a5a6a', '#6a7e90', '#90a6b8', '#c0d4e0']), 1.4 + 2.2 * Math.max(0, cyl((xx + 0.5 - x) / hw)), xx, y)); }
          for (let a = -1.4; a < 1.4; a += 0.2) b.set(x + 6 + Math.cos(a) * 3, top - 8 + Math.sin(a) * 4, hex('#4a5a6a'));
          x += 18;
        } else {
          const PU = pal(['#6a2408', '#92340c', '#ba4a12', '#dc6a1c', '#f4902e', '#ffb456']);
          rEllipse(x, top - 6, 8, 6, (px, py) => { const u = (px + 0.5 - x) / 8; b.set(px, py, rp(PU, 1 + 4 * clamp(-u * 0.5 - (py + 0.5 - top + 6) / 12 + 0.55, 0, 1) - (Math.abs(Math.sin(u * 4.7)) < 0.25 ? 0.9 : 0), px, py)); });
          rRect(x, top - 14, 2, 3, b.P(hex('#4a5a1c')));
          x += 24;
        }
        x += 4 + R() * 8; k++;
      }
    }
    // bread ovens between the tables
    for (const ox of [515, 1000]) {
      const gy = h - 4, ow = 34, oh = 52;
      for (let y = gy - oh; y < gy; y++) for (let x = ox - ow; x <= ox + ow; x++) {
        const lx = x + 0.5 - ox, ly = y - (gy - oh);
        const dome = ly > 22 || Math.hypot(lx / ow, (ly - 22) / 22) <= 1;
        if (!dome) continue;
        const row = Math.floor(ly / 4), off = (row & 1) * 4;
        let v = 2 + (h2(Math.floor((x + off) / 8), row, S + 5) - 0.5) * 1.2 + 1.4 * Math.max(0, cyl(lx / ow));
        if (ly % 4 === 0 || (x + off) % 8 === 0) v -= 1.2;
        b.set(x, y, rp(BRK, v, x, y));
      }
      for (let y = gy - 28; y < gy - 6; y++) for (let x = ox - 12; x <= ox + 12; x++) {
        if (y < gy - 18 && Math.hypot(x + 0.5 - ox, y - (gy - 18)) > 12) continue;
        const dd = (y - (gy - 28)) / 22;
        b.set(x, y, rp(pal(['#1a0806', '#3a1206', '#7a2a08', '#c05410', '#f08a20', '#ffc050']), 0.6 + dd * 4.6 - Math.abs(x - ox) / 12, x, y));
      }
      rRect(ox - 14, gy - 6, 29, 2, b.P(BRK[4]));
      ovens.push({ x: ox, y: gy - 12 });
      steamM.push({ x: ox, y: gy - oh - 2 });
    }
    L.mid = mkLayer(b.canvas(), 0.26, 0.28, 'bottom');
  }

  // ---- near: the great beam with dried corn, garlic braids, herbs and a copper pot rack
  {
    const w = 1024, fy = 0.6, h = fullH(E, fy), b = new Buf(w, h);
    const COB = [pal(['#5a2a10', '#8a4218', '#b8602a', '#d88838']), pal(['#6a5a1a', '#a08c2a', '#d0b840', '#f0dc68']), pal(['#4a1a30', '#6e2a48', '#984066', '#b85a80'])];
    const HUSK = pal(['#6a5a3a', '#9a8458', '#c8b07a', '#e8d4a0']);
    for (let x = 0; x < w; x++) for (let y = 0; y < 13; y++) b.set(x, y, rp(WD, 3 - y * 0.18 + (y === 12 ? -1.6 : 0) + ((x * 3 + y * 7) % 23 === 0 ? -1 : 0) + (h2(x >> 3, y, S) - 0.5) * 0.6, x, y));
    let x = 10;
    let k = 0;
    while (x < w - 20) {
      const kind = ['corn', 'garlic', 'rack', 'herb', 'corn', 'garlic', 'herb'][k % 7];
      if (kind === 'corn') {
        rLine(x, 12, x, 18, b.P(HUSK[0]));
        for (let i = -1; i <= 1; i++) {
          const ex = x + i * 4, ey = 24 + Math.abs(i) * -2, P = COB[(i + 1 + k) % 3];
          for (let y = ey; y < ey + 18; y++) { const hw = 2.2 - Math.max(0, (y - ey - 12) / 6) * 1.6; for (let xx = Math.floor(ex - hw); xx <= ex + hw; xx++) b.set(xx, y, rp(P, 1.4 + ((xx + y) % 2 ? 1 : 0) + (xx < ex ? 0.8 : 0), xx, y)); }
          for (const s of [-1, 1]) rSeg(ex, ey + 1, ex + s * 3, ey - 6, 1, 0.6, b.P(HUSK[s < 0 ? 3 : 1]));
          rLine(x, 18, ex, ey - 4, b.P(HUSK[2]));
        }
        x += 30 + R() * 30;
      } else if (kind === 'garlic') {
        const len = 30 + Math.floor(R() * 14);
        for (let y = 13; y < 13 + len; y++) b.set(x + Math.round(Math.sin(y * 0.6)), y, HUSK[1]);
        for (let y = 18; y < 13 + len; y += 5) {
          const gx = x + ((y / 5) % 2 ? -2 : 2);
          rDisc(gx, y, 2.6, (px, py) => b.set(px, py, rp(pal(['#8a7a74', '#b8aaa0', '#e0d6cc', '#fbf6f0']), 2.6 - Math.hypot(px + 0.5 - gx + 1, py + 0.5 - y + 1) * 0.7 - ((px - gx) % 2 === 0 ? 0.4 : 0), px, py)));
        }
        x += 28 + R() * 26;
      } else if (kind === 'herb') {
        rLine(x, 12, x, 16, b.P(HUSK[0]));
        for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 0.8; rLine(x, 16, x + Math.sin(a) * 14, 16 + Math.cos(a) * 16, b.P(pal(['#3a4a24', '#5a6a32', '#7a8a44'])[i % 3])); }
        rRect(x - 2, 16, 5, 2, b.P(hex('#a05a3a')));
        x += 24 + R() * 20;
      } else {
        // iron rack on chains with copper pots and pans
        const rw = 90, ry = 30;
        rLine(x + 4, 12, x + 8, ry, b.P(hex('#1a1416'))); rLine(x + rw - 4, 12, x + rw - 8, ry, b.P(hex('#1a1416')));
        for (let xx = x; xx <= x + rw; xx++) { b.set(xx, ry, hex('#3a3236')); b.set(xx, ry + 1, hex('#1a1416')); }
        let px = x + 8;
        while (px < x + rw - 8) {
          const r = 4 + Math.floor(R() * 4), py = ry + 4 + r + Math.floor(R() * 4);
          rLine(px, ry + 1, px, py - r - 1, b.P(hex('#2a2226')));
          if (R() < 0.5) { // pot
            for (let y = py - r; y < py + r; y++) for (let xx = px - r - 1; xx <= px + r + 1; xx++) {
              const u = (xx + 0.5 - px) / (r + 1.5), f = (y - py + r) / (2 * r);
              if (f > 0.75 && Math.abs(u) > 1 - (f - 0.75) * 2) continue;
              b.set(xx, y, rp(CP, 1 + 5.4 * Math.max(0, cyl(u)) + (y === py - r ? 1.4 : 0), xx, y));
            }
            b.set(px - r - 2, py - r + 1, CP[2]); b.set(px + r + 2, py - r + 1, CP[2]);
          } else { // pan seen edge-on with long handle up
            rEllipse(px, py, r + 1, r + 1, (a, c) => b.set(a, c, rp(CP, 1.4 + 4.6 * clamp(1 - Math.hypot(a + 0.5 - px + r * 0.4, c + 0.5 - py + r * 0.4) / (r * 1.6), 0, 1), a, c)));
            rEllipse(px, py, r - 1, r - 1, (a, c) => b.set(a, c, rp(CP, 1 + 2.4 * clamp(1 - Math.hypot(a + 0.5 - px - 1, c + 0.5 - py - 1) / r, 0, 1), a, c)));
          }
          px += r * 2 + 6;
        }
        x += rw + 30 + R() * 30;
      }
      k++;
    }
    L.near = mkLayer(b.canvas(), 0.6, fy, 'full');
  }

  const fireF = flameFrames(S + 300, 64, 30), candF = [];
  for (let f = 0; f < 3; f++) { const fb = new Buf(3, 5, false), FL = [hex('#ff9040'), hex('#ffd060'), hex('#fff4c0')]; spr(fb, 0, 0, [['.a.', '.b.', 'aba', 'bcb', '.b.'], ['a..', '.b.', '.ba', 'bcb', '.b.'], ['..a', '.b.', 'ab.', 'bcb', '.b.']][f], { a: FL[0], b: FL[1], c: FL[2] }); candF.push(fb.canvas()); }
  const glowH = glowSprite(48, '#ff8030', 0.42), glowO = glowSprite(18, '#ff8a30', 0.45), glowC = glowSprite(7, '#ffb060', 0.5);
  const puffs = [puffSprite(4, '#f0e4d8', 0.6, S + 70), puffSprite(6, '#f0e4d8', 0.55, S + 71), puffSprite(9, '#f0e4d8', 0.45, S + 72), puffSprite(12, '#f0e4d8', 0.38, S + 73)];
  const steam = [];
  steamM.forEach(s => { for (let j = 0; j < 3; j++) steam.push({ s, p: R(), f: 0.1 + R() * 0.08, dx: (R() - 0.5) * 16 }); });
  const embers = [];
  for (let i = 0; i < 14; i++) embers.push({ x: R() * (W + 40), p: R(), f: 0.08 + R() * 0.1, a: 4 + R() * 10, w: 1 + R() * 2 });
  const wisps = [];
  for (let i = 0; i < 5; i++) wisps.push({ x: R() * (W + 80), y: 60 + R() * (H - 90), p: R(), f: 0.05 + R() * 0.05 });

  return {
    fog: '#5a3420',
    back(g, cx, cy, t) {
      blit(g, L.wall, E, cx, cy, t);
      onScreen(L.wall, E, cx, cy, t, hearth.x, hearth.y, 80, (x, y) => {
        g.drawImage(fireF[Math.floor(t * 10) & 3], Math.floor(x) - 32, Math.floor(y) - 28);
        add(g); g.globalAlpha = clamp(0.6 + 0.15 * Math.sin(t * 7) * Math.sin(t * 2.9) + 0.06 * Math.sin(t * 19), 0, 1);
        g.drawImage(glowH, Math.floor(x) - 48, Math.floor(y) - 52);
        norm(g);
      });
      for (let i = 0; i < 3; i++) {
        const ph = wrapP(t * 0.13 + i / 3, 1), sp = puffs[Math.min(3, Math.floor(ph * 4))], r = sp.width >> 1;
        g.globalAlpha = 0.35 * Math.sin(ph * Math.PI);
        onScreen(L.wall, E, cx, cy, t, hearth.x + Math.sin(i * 2 + ph * 3) * 5, hearth.potY - ph * 34, 20, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      }
      g.globalAlpha = 1;
      blit(g, L.mid, E, cx, cy, t);
      add(g);
      ovens.forEach((o, i) => { g.globalAlpha = clamp(0.55 + 0.15 * Math.sin(t * 5 + i * 3), 0, 1); onScreen(L.mid, E, cx, cy, t, o.x, o.y, 20, (x, y) => g.drawImage(glowO, Math.floor(x) - 18, Math.floor(y) - 18)); });
      norm(g);
      cands.forEach((c, i) => onScreen(L.mid, E, cx, cy, t, c.x, c.y, 10, (x, y) => {
        g.drawImage(candF[(Math.floor(t * 9) + i) % 3], Math.floor(x) - 1, Math.floor(y));
        add(g); g.globalAlpha = 0.45 + 0.12 * Math.sin(t * 9 + i * 1.3); g.drawImage(glowC, Math.floor(x) - 7, Math.floor(y) - 5); norm(g);
      }));
      for (const s of steam) {
        const ph = wrapP(t * s.f + s.p, 1), sp = puffs[Math.min(3, Math.floor(ph * 4))], r = sp.width >> 1;
        g.globalAlpha = 0.4 * Math.sin(ph * Math.PI);
        onScreen(L.mid, E, cx, cy, t, s.s.x + s.dx * ph, s.s.y - ph * 40, 20, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      }
      norm(g);
      blit(g, L.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const sw = W + 80;
      for (const s of wisps) {
        const ph = wrapP(t * s.f + s.p, 1), sp = puffs[2 + (ph > 0.5 ? 1 : 0)], r = sp.width >> 1;
        const x = Math.floor(wrapP(s.x + ph * 24 - cx * 1.15, sw)) - 40, y = Math.floor(s.y - ph * 40 - cy * 1.15);
        g.globalAlpha = 0.14 * Math.sin(ph * Math.PI);
        g.drawImage(sp, x - r, y - r);
      }
      for (const e of embers) {
        const ph = wrapP(t * e.f + e.p, 1);
        const x = Math.floor(wrapP(e.x + Math.sin(t * 1.3 + e.p * 9) * e.a - cx * 1.1, W + 40)) - 20, y = Math.floor(H + 10 - ph * (H * 0.8) - cy * 0.3);
        const fl = Math.sin(t * 13 + e.p * 20);
        g.globalAlpha = clamp((1 - ph) * 1.2, 0, 1) * (fl > -0.3 ? 0.9 : 0.4);
        g.fillStyle = fl > 0.5 ? '#ffd070' : '#ff7a28';
        g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// CHRISTMAS (outside) — snowy pine forest under the aurora

// snow-dusted conifer painter: mask value k marks the tree; snow sits on upward-facing edges
function snowyTree(m, b, P, SN, x, y, k, S) {
  const up1 = m.at(x, y - 1) !== k, up2 = m.at(x, y - 2) !== k, up3 = m.at(x, y - 3) !== k;
  const le = m.at(x - 1, y) !== k, re = m.at(x + 1, y) !== k;
  const n = h2(x, y, S);
  if (up1) return rp(SN, 3 + (le ? 0.6 : 0) - (re ? 0.8 : 0), x, y);
  if (up2 && n < 0.9) return rp(SN, 2.2 - (re ? 0.8 : 0), x, y);
  if (up3 && n < 0.55) return rp(SN, 1.2, x, y);
  if (m.at(x, y - 4) !== k && n < 0.2) return rp(SN, 0.6, x, y);
  return rp(P, 1.4 + (le ? 1.6 : 0) - (re ? 0.6 : 0) + (n - 0.5) * 0.8, x, y);
}

// tiered pine: stacked drooping skirts so snow can settle on every shelf
// mask values: 1..n tier index from the top (upper tiers overlap the ones below), 200 trunk
function snowPine(m, x, by, hh, hw, R) {
  const n = 4 + Math.floor(hh / 20);
  for (let y = Math.floor(by - hh * 0.15); y < by + 3; y++) for (let xx = Math.round(x) - 1; xx <= Math.round(x) + 1; xx++) m.set(xx, y, 200);
  for (let i = n - 1; i >= 0; i--) {
    const f = (i + 1) / n, top = by - hh + hh * 0.92 * (i / n), th = hh / n * 1.28, wb = hw * (0.2 + 0.95 * f);
    const jl = R() * 1.5, jr = R() * 1.5;
    for (let y = Math.floor(top); y < top + th; y++) {
      const k = (y - top) / th, half = wb * Math.pow(k, 0.55);
      const dl = half + (k > 0.8 ? jl : 0) + (R() - 0.5), dr = half + (k > 0.8 ? jr : 0) + (R() - 0.5);
      for (let xx = Math.round(x - dl); xx <= Math.round(x + dr); xx++) m.set(xx, y, i + 1);
    }
  }
}

function buildXmasOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};

  // ---- sky: deep blue night with a field of stars
  const SKY = pal(['#03050d', '#050914', '#070d1c', '#0a1224', '#0d172c', '#111e36', '#152640', '#1b2e4a', '#223854', '#2a425e', '#344e68']);
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  const twinkles = [];
  {
    const sky = skyGrad(E, SKY, [[0, 9.6], [24, 8.4], [56, 6.8], [96, 5], [140, 3.4], [200, 1.8], [280, 0.6]], { w: sw, fy: fyS });
    const ST = pal(['#2a3a5a', '#5a6a8a', '#a0b0d0', '#e8f0ff']);
    for (let i = 0; i < (sw * sh) / 140; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh * 0.8), r = R();
      sky.b.set(x, y, ST[r < 0.5 ? 0 : r < 0.82 ? 1 : r < 0.96 ? 2 : 3]);
      if (r > 0.985) { sky.b.set(x - 1, y, ST[1]); sky.b.set(x + 1, y, ST[1]); sky.b.set(x, y - 1, ST[1]); sky.b.set(x, y + 1, ST[1]); twinkles.push([x, y, R() * TAU]); }
    }
    L.sky = mkLayer(sky.b.canvas(), 0.03, fyS, 'full');
  }

  // ---- aurora: two ribbon curtains, two ray phases cross-faded at runtime
  const aur = [];
  {
    const w = 1024, h = sky_h(E), cols = [hex('#40ff90'), hex('#30e0b0'), hex('#3090d0'), hex('#8050e0'), hex('#c050c0')];
    for (let f = 0; f < 2; f++) {
      const b = new Buf(w, h), rays = noise1(S + 40 + f * 13, 220, w), rays2 = noise1(S + 60 + f * 7, 90, w);
      for (let rb = 0; rb < 2; rb++) {
        const cy0 = rb ? 104 : 76, path = fbm1(S + 20 + rb * 5, 5, w, 3), amp = rb ? 20 : 28, fade = noise1(S + 30 + rb, 4, w);
        for (let x = 0; x < w; x++) {
          const yc = cy0 + (path(x) - 0.5) * 2 * amp, str = clamp((fade(x) - 0.25) * 2.2, 0, 1) * (0.45 + 0.55 * rays(x)) * (0.7 + 0.3 * rays2(x));
          if (str <= 0.02) continue;
          const len = 30 + rays(x) * 46;
          for (let y = Math.floor(yc - len); y < yc + 5; y++) {
            const u = (yc + 4 - y) / (len + 4);
            let a = str * (u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.6));
            a *= rb ? 0.75 : 1;
            const q = dq(a * 4, x, y);
            if (q <= 0) continue;
            const ci = u < 0.15 ? 0 : u < 0.35 ? 1 : u < 0.6 ? 2 : u < 0.8 ? 3 : 4;
            const cur = b.get(x, y), na = Math.min(255, q * 50 + (cur >>> 24));
            b.set(x, y, withA(cols[ci], na));
          }
        }
      }
      aur.push(b.canvas());
    }
    L.aur = mkLayer(aur[0], 0.04, 0.08, 'full', { vx: 1.5 });
  }

  // ---- far mountains, snow lit blue by the night
  {
    const MT = pal(['#0e1628', '#141e34', '#1a2842', '#223252', '#2c3e62', '#384c74', '#4a6088', '#62789e', '#7e94b6', '#a4b6d4']);
    const w = 768, h = 160, b = new Buf(w, h), n1 = fbm1(S + 3, 6, w, 5), n2 = noise1(S + 4, 40, w);
    const top = new Float32Array(w);
    for (let x = 0; x < w; x++) { const r = 1 - Math.abs(n1(x) * 2 - 1); top[x] = 96 - r * 70 - n2(x) * 6; }
    const rock = fbm2(S + 5, 128, w, 26, 2);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) {
      const sl = (top[(x + 2) % w] - top[(x + w - 2) % w]);
      const depth = y - top[x];
      let v = 4.6 + clamp(sl * 0.35, -2.6, 2.4) - depth * 0.035;
      const rk = rock(x + depth * (sl > 0 ? 0.6 : -0.6), y);
      if (rk > 0.6 - clamp(depth / 300, 0, 0.1) && depth > 4) v -= 1.6 + (rk > 0.68 ? 0.8 : 0);
      if (depth < 1) v += 1.2;
      v -= clamp((y - 110) / 40, 0, 1) * 2.2;
      b.d[y * w + x] = rp(MT, v, x, y);
    }
    L.far = mkLayer(b.canvas(), 0.05, 0.08, 'bottom');
  }

  // ---- mid: the far shore's treeline and the frozen lake
  {
    const w = 768, h = 160, shore = 86, b = new Buf(w, h), m = new Mask(w, h);
    const TP = pal(['#081012', '#0c1618', '#111e20', '#182828', '#203232']);
    const SN = pal(['#3a4a6a', '#5a6c8e', '#8496b8', '#aebee0']);
    for (let i = 0; i < 220; i++) { const x = R() * w; conifer(m.P(1), x, shore + 2, 8 + R() * 16, 2.2 + R() * 2.6, R); }
    for (let x = 0; x < w; x++) for (let y = shore - 1; y < shore + 3; y++) m.set(x, y, 2);
    paint(m, b, (x, y, k) => k === 2 ? rp(SN, 1.8 + (y === shore - 1 ? 1 : 0), x, y) : snowyTree(m, b, TP, SN, x, y, 1, S + 6));
    const ICE = pal(['#0c1828', '#10203a', '#16294a', '#1e3456', '#284262', '#34526e', '#46667e']);
    const rip = noise2(S + 7, 64, w, 3), cr = noise2(S + 8, 32, w, 10), sn = fbm2(S + 9, 24, w, 8, 3);
    const tint = hex('#2a8a7a');
    for (let y = shore + 3; y < h; y++) for (let x = 0; x < w; x++) {
      const d = y - shore;
      let v = 3.6 - d * 0.03 + (rip(x, y) - 0.5) * 0.8;
      const refl = m.at(x, shore - (d - 3) * 1.2);
      if (refl === 1 && d < 24) v -= 1.6;
      let c = rp(ICE, v, x, y);
      if (Math.abs(cr(x, y) - 0.5) < 0.012 + d * 0.0002) c = ICE[6];
      const s = sn(x, y * 1.6);
      if (s > 0.66) c = rp(SN, 1 + (s - 0.66) * 8 + (y > shore + 3 && sn(x, y * 1.6 - 1.6) <= 0.66 ? 1 : 0), x, y);
      else if (d < 30) { const q = dq(clamp((0.5 - Math.abs(Math.sin(x * 0.012 + 0.6))) * 0.5, 0, 1) * 4, x, y) / 4; if (q > 0) c = mixc(c, tint, q); }
      b.d[y * w + x] = c;
    }
    L.mid = mkLayer(b.canvas(), 0.12, 0.16, 'bottom');
  }

  // ---- close: snow-laden pines and a cabin with warm windows on the near bank
  const windows = [], chimneys = [];
  {
    const w = 1024, h = 200, gy = 166, b = new Buf(w, h), m = new Mask(w, h);
    const TP = pal(['#050c0c', '#081212', '#0c1918', '#122220', '#1a2c28', '#22362e']);
    const SN = pal(['#4a5c80', '#6a7ea4', '#90a6cc', '#bccce8', '#e4eeff']);
    const cabX = 300 + Math.floor(R() * 400);
    const pines = [];
    for (let i = 0; i < 9; i++) {
      let x = (i + R() * 0.6) * (w / 9);
      if (Math.abs(wrapD(x - cabX, w)) < 60) continue;
      pines.push([x, 80 + R() * 50, 20 + R() * 8]);
    }
    for (let i = 0; i < 12; i++) { const x = R() * w; if (Math.abs(wrapD(x - cabX, w)) < 50) continue; pines.push([x, 30 + R() * 30, 10 + R() * 5]); }
    pines.sort((a, c) => a[1] - c[1]);
    const tm = new Mask(w, h);
    for (const [x, hh, hw] of pines) {
      const tmp = new Mask(w, h, true);
      snowPine(tmp, x, gy + 2, hh, hw, R);
      for (let i = 0; i < tmp.m.length; i++) if (tmp.m[i]) tm.m[i] = tmp.m[i];
    }
    const BK = pal(['#140c08', '#22160e', '#342216']);
    paint(tm, b, (x, y, k) => {
      if (k === 200) return rp(BK, tm.at(x - 1, y) === 200 ? 1 : 2, x, y);
      const du = edgeDist(tm, x, y, 0, -1, 4), n = h2(x, y, S + 10), re = !tm.at(x + 1, y), le = !tm.at(x - 1, y);
      if (du === 1) return rp(SN, 4.2 - (re ? 0.8 : 0), x, y);
      if (du === 2) return rp(SN, 3.4 - (re ? 1 : 0), x, y);
      if (du === 3 && n < 0.8) return rp(SN, 2.4 - (re ? 1 : 0), x, y);
      if (du === 4 && n < 0.35) return rp(SN, 1.4, x, y);
      const ua = tm.at(x, y - 1), ub = tm.at(x, y - 2);
      const shade = (ua && ua < k) ? 1.1 : (ub && ub < k) ? 0.5 : 0;
      return rp(TP, 1.7 + (le ? 1.4 : 0) - (re ? 0.6 : 0) + (n - 0.5) * 0.9 - shade + (((x + y * 2) % 7 === 0) ? 0.6 : 0), x, y);
    });
    // snow bank
    const bank = fbm1(S + 11, 12, w, 3);
    for (let x = 0; x < w; x++) {
      const t0 = gy - 2 + Math.floor((bank(x) - 0.5) * 8);
      for (let y = t0; y < h; y++) b.set(x, y, rp(SN, 3.4 - (y - t0) * 0.05 + (y === t0 ? 0.8 : 0) + (h2(x, y >> 1, S + 12) > 0.93 ? -0.6 : 0), x, y));
    }
    // cabin
    const LOG = pal(['#1a0e0a', '#2a1810', '#3c2216', '#502e1c', '#663c24']);
    const cw = 40, ch = 24, cx0 = cabX - cw / 2, cyT = gy - ch;
    for (let y = cyT; y < gy + 2; y++) for (let x = cx0; x < cx0 + cw; x++) {
      const ly = y - cyT;
      b.set(x, y, rp(LOG, 2 + (ly % 4 === 0 ? -1.2 : ly % 4 === 1 ? 0.8 : 0) + (x === cx0 ? 1 : 0), x, y));
    }
    for (let y = cyT; y < gy + 2; y += 4) { b.set(cx0 - 1, y, LOG[3]); b.set(cx0 - 2, y + 1, LOG[2]); b.set(cx0 + cw, y, LOG[2]); b.set(cx0 + cw + 1, y + 1, LOG[1]); }
    // roof with heavy snow
    rPoly([[cx0 - 6, cyT + 1], [cx0 + cw + 6, cyT + 1], [cabX, cyT - 18]], (x, y) => b.set(x, y, rp(LOG, 1 + (x > cabX ? -0.6 : 0.6), x, y)));
    for (let x = cx0 - 7; x <= cx0 + cw + 7; x++) {
      const ry = cyT + 1 - (1 - Math.abs(x + 0.5 - cabX) / (cw / 2 + 6)) * 19;
      const th = 3 + Math.floor(h2(x, 1, S) * 2);
      for (let k = 0; k < th; k++) b.set(x, ry + k - 1, rp(SN, 4 - k * 0.8 - (x > cabX ? 0.6 : 0), x, ry + k));
      if (x % 3 === 0 && Math.abs(x - cabX) > 8) for (let k = 0; k < 2 + (x % 5); k++) b.set(x, cyT + 2 + k, hex('#c8dcf8'));
    }
    // chimney
    rRect(cabX + 9, cyT - 20, 6, 12, (x, y) => b.set(x, y, rp(pal(['#2a1a18', '#3e2620', '#563428']), x === cabX + 9 ? 2.4 : 1, x, y)));
    rRect(cabX + 8, cyT - 22, 8, 2, b.P(SN[4]));
    chimneys.push({ x: cabX + 12, y: cyT - 23 });
    // warm windows and a door
    const WN = pal(['#7a3010', '#c06018', '#f0a030', '#ffd870', '#fff4c0']);
    for (const wx of [cx0 + 6, cx0 + cw - 15]) {
      for (let y = cyT + 6; y < cyT + 15; y++) for (let x = wx; x < wx + 9; x++) {
        const fr = x === wx || x === wx + 8 || y === cyT + 6 || y === cyT + 14 || x === wx + 4 || y === cyT + 10;
        b.set(x, y, fr ? LOG[0] : rp(WN, 3.6 - (y - cyT - 6) * 0.2 - Math.abs(x - wx - 4) * 0.1, x, y));
      }
      for (let x = wx - 1; x < wx + 10; x++) { b.set(x, cyT + 15, SN[4]); b.set(x, cyT + 16, SN[2]); }
      windows.push({ x: wx + 4.5, y: cyT + 10 });
      // light spilling on the snow
      for (let y = gy - 1; y < gy + 14; y++) for (let x = wx - 6; x < wx + 15; x++) {
        const a = (1 - Math.abs(x + 0.5 - wx - 4.5 - (y - gy) * 0.3) / 10) * (1 - (y - gy + 1) / 15);
        const q = dq(clamp(a, 0, 1) * 0.6 * 4, x, y) / 4;
        if (q > 0 && b.get(x, y)) b.set(x, y, mixc(b.get(x, y), hex('#ffb060'), q));
      }
    }
    rRect(cabX - 4, gy - 14, 8, 15, (x, y) => b.set(x, y, rp(LOG, x === cabX - 4 ? 2.4 : 1, x, y)));
    b.set(cabX + 2, gy - 7, hex('#d0a040'));
    // wreath on the door
    for (let a = 0; a < TAU; a += 0.3) b.set(cabX + Math.cos(a) * 2.5, gy - 10 + Math.sin(a) * 2.5, hex(a < 1 ? '#c02030' : '#2a6a3a'));
    L.close = mkLayer(b.canvas(), 0.28, 0.3, 'bottom');
  }

  // ---- near: snow-laden pine boughs reaching in from the top
  {
    const w = 1024, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const TP = pal(['#030808', '#060e0e', '#0a1414', '#0e1c1a', '#142420']);
    const SN = pal(['#3a4c6c', '#5a6e94', '#8296bc', '#b0c2e0', '#dce8fa']);
    const snowCaps = [];
    for (let k = 0; k < 3; k++) {
      const x0 = k * (w / 3) + R() * 120, side = k % 2 ? 1 : -1, pts = [];
      limb((x, y) => { if (y < 64) m.set(x, y, 2); }, R, x0, -4, side * (1.72 + R() * 0.12), 130 + R() * 50, 5, 1, null, pts, 0);
      for (const [px, py, r] of pts) {
        if (py > 60) continue;
        for (let j = 0; j < 14; j++) {
          const sd = j % 2 ? 1 : -1, a = Math.PI / 2 - sd * (0.35 + R() * 0.9), len = 5 + R() * 9;
          rLine(px + (R() - 0.5) * 3, py, px + Math.cos(a) * len, py + Math.sin(a) * len * 0.9, (x, y) => { if (!m.at(x, y)) m.set(x, y, 1); });
        }
        if (R() < 0.6) snowCaps.push([px + (R() - 0.5) * 4, py - r - 1, 3 + R() * 3]);
      }
    }
    paint(m, b, (x, y, k) => {
      const up = m.at(x, y - 1) === 0, up2 = m.at(x, y - 2) === 0;
      if (up && h2(x, y, S + 2) < 0.7) return rp(SN, 2.6 - (m.at(x + 1, y) ? 0 : 0.8), x, y);
      return rp(TP, k === 2 ? 2.4 + (up2 ? 1 : 0) : 1 + (h2(x, y, S + 1) > 0.7 ? 1 : 0), x, y);
    });
    for (const [x, y, r] of snowCaps) rEllipse(x, y, r, r * 0.5, (px, py) => {
      const dy = (py + 0.5 - y) / (r * 0.5);
      b.set(px, py, rp(SN, 3.8 - (dy + 1) * 1.2 - (px > x + r * 0.5 ? 0.6 : 0), px, py));
    });
    L.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const glowWn = glowSprite(14, '#ffa040', 0.5);
  const puffs = [puffSprite(3, '#8a9ab8', 0.7, S + 70), puffSprite(5, '#8a9ab8', 0.6, S + 71), puffSprite(7, '#8a9ab8', 0.5, S + 72), puffSprite(10, '#8a9ab8', 0.4, S + 73)];
  const flakes = [];
  for (let i = 0; i < 80; i++) { const z = i < 46 ? 0 : i < 72 ? 1 : 2; flakes.push({ x: R() * (W + 40), y: R() * (H + 40), z, vy: [10, 17, 26][z] + R() * 5, a: 3 + R() * 8, f: 0.4 + R() * 0.8, p: R() * TAU }); }

  return {
    fog: '#1c2c48',
    back(g, cx, cy, t) {
      blit(g, L.sky, E, cx, cy, t);
      g.fillStyle = '#f0f4ff';
      for (const [x, y, p] of twinkles) {
        const k = Math.sin(t * 2.1 + p);
        if (k < 0.4) continue;
        g.globalAlpha = (k - 0.4) * 1.4;
        onScreen(L.sky, E, cx, cy, t, x, y, 3, (sx, sy) => { g.fillRect(Math.floor(sx) - 1, Math.floor(sy), 3, 1); g.fillRect(Math.floor(sx), Math.floor(sy) - 1, 1, 3); });
      }
      add(g);
      const a = 0.5 + 0.5 * Math.sin(t * 0.45);
      g.globalAlpha = 0.35 + 0.55 * a; blit(g, L.aur, E, cx, cy, t, aur[0]);
      g.globalAlpha = 0.35 + 0.55 * (1 - a); blit(g, L.aur, E, cx, cy, t * 0.8, aur[1]);
      norm(g);
      blit(g, L.far, E, cx, cy, t);
      blit(g, L.mid, E, cx, cy, t);
      blit(g, L.close, E, cx, cy, t);
      add(g);
      windows.forEach((wn, i) => { g.globalAlpha = clamp(0.55 + 0.12 * Math.sin(t * 4 + i * 2) * Math.sin(t * 1.7), 0, 1); onScreen(L.close, E, cx, cy, t, wn.x, wn.y, 16, (x, y) => g.drawImage(glowWn, Math.floor(x) - 14, Math.floor(y) - 14)); });
      norm(g);
      for (const c of chimneys) for (let i = 0; i < 4; i++) {
        const ph = wrapP(t * 0.12 + i / 4, 1), sp = puffs[Math.min(3, Math.floor(ph * 4))], r = sp.width >> 1;
        g.globalAlpha = 0.55 * Math.sin(ph * Math.PI);
        onScreen(L.close, E, cx, cy, t, c.x + ph * 22 + Math.sin(ph * 6 + i) * 2, c.y - ph * 44, 24, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      }
      norm(g);
      blit(g, L.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const sw2 = W + 40, sh2 = H + 40;
      for (const f of flakes) {
        const par = [0.9, 1.15, 1.4][f.z];
        const x = Math.floor(wrapP(f.x + Math.sin(t * f.f + f.p) * f.a - t * 4 - cx * par, sw2)) - 20;
        const y = Math.floor(wrapP(f.y + t * f.vy - cy * par, sh2)) - 20;
        if (f.z === 0) { g.globalAlpha = 0.55; g.fillStyle = '#b8c8e8'; g.fillRect(x, y, 1, 1); }
        else if (f.z === 1) { g.globalAlpha = 0.85; g.fillStyle = '#f0f6ff'; g.fillRect(x, y, 1, 1); }
        else { g.globalAlpha = 0.8; g.fillStyle = '#ffffff'; g.fillRect(x, y, 2, 2); g.globalAlpha = 0.35; g.fillRect(x - 1, y, 1, 2); g.fillRect(x, y - 1, 2, 1); }
      }
      g.globalAlpha = 1;
    },
  };
}
function sky_h(E) { return fullH(E, 0.08); }

// ===========================================================================
// CHRISTMAS (inside) — the toy workshop

const TOYC = [
  ['#5a0a14', '#8a1420', '#ba2430', '#e04a48', '#f88a78'], // red
  ['#0a3a20', '#145a30', '#22804a', '#40a864', '#7ad08a'], // green
  ['#0e2a5a', '#1a4488', '#2c64b4', '#4c8ade', '#8ab8f4'], // blue
  ['#6a4a08', '#a07810', '#d0a820', '#f0d050', '#fff0a0'], // gold
  ['#5a6070', '#8890a0', '#b8c0cc', '#e0e6ee', '#ffffff'], // silver/white
  ['#4a1a5a', '#6e2a86', '#9444b0', '#b86ad0', '#dca0ee'], // purple
].map(pal);
// a wrapped present, bottom-left at (x, by)
function present(b, x, by, w, h, P, RB, S) {
  for (let y = by - h; y < by; y++) for (let xx = x; xx < x + w; xx++) {
    const lx = xx - x, ly = y - (by - h);
    let v = 2 + (lx === 0 ? 1.2 : 0) - (lx === w - 1 ? 1 : 0) + (ly === 0 ? 1.4 : 0) - (ly === h - 1 ? 0.8 : 0);
    let c = rp(P, v, xx, y);
    if (((lx + ly) % 6 === 0) && lx > 0 && lx < w - 1 && ly > 0) c = P[4];
    const rx = Math.floor(w / 2);
    if (lx === rx || lx === rx - 1) c = RB[lx === rx - 1 ? 3 : 2];
    if (ly === Math.floor(h / 2) && w > 7) c = RB[2];
    b.set(xx, y, c);
  }
  const cx = x + Math.floor(w / 2) - 1, ty = by - h - 1;
  b.set(cx - 2, ty, RB[3]); b.set(cx - 1, ty, RB[2]); b.set(cx + 1, ty, RB[2]); b.set(cx + 2, ty, RB[1]); b.set(cx, ty, RB[4]);
  b.set(cx - 3, ty - 1, RB[3]); b.set(cx - 2, ty - 1, RB[3]); b.set(cx + 2, ty - 1, RB[2]); b.set(cx + 3, ty - 1, RB[1]);
}

function buildXmasIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const L = {};
  const WD = pal(WOOD);
  const PL = pal(['#2a160c', '#3a2012', '#4c2c18', '#5e381e', '#724626', '#86562e', '#9c6838']);

  // ---- back wall: warm planks, a big window onto falling snow, shelves crowded with toys
  const wins = [];
  {
    const w = 768, fy = 0.14, h = fullH(E, fy), b = new Buf(w, h);
    const tex = fbm2(S + 1, 48, w, 20, 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pk = Math.floor(x / 12), lx = x % 12;
      let v = 2.6 + (h2(pk, 0, S + 2) - 0.5) * 1.2 + (tex(x, y) - 0.5) * 1.2 + (lx === 0 ? -1.6 : lx === 1 ? 0.6 : 0);
      if ((y + pk * 37) % 97 === 0) v -= 1.4;
      if (h2(x >> 1, y >> 3, S + 3) > 0.94 && lx > 2) v -= 0.6;
      b.d[y * w + x] = rp(PL, v, x, y);
    }
    // baseboard and ceiling beam
    for (let x = 0; x < w; x++) { for (let y = h - 30; y < h - 24; y++) b.set(x, y, rp(WD, y === h - 30 ? 5 : 2, x, y)); for (let y = 0; y < 9; y++) b.set(x, y, rp(WD, 3 - y * 0.25 - (y === 8 ? 1.4 : 0), x, y)); }
    // the big window
    const SKYW = pal(['#0a1430', '#0e1c40', '#14264e', '#1c325e', '#26406c', '#34507a']);
    const SNOW = pal(['#5a6a8a', '#8494b4', '#b0c0dc', '#dce8f8']);
    const wx = 230 + Math.floor(R() * 300), ww = 96, wy0 = 28, wh = 84;
    const hills = fbm1(S + 4, 6, ww, 3);
    for (let y = wy0; y < wy0 + wh; y++) for (let x = wx; x < wx + ww; x++) {
      const lx = x - wx, ly = y - wy0;
      const arch = ly < 20 && Math.hypot(lx + 0.5 - ww / 2, (ly - 20) * 2.4) > ww / 2;
      if (arch) continue;
      const mull = lx % 24 === 0 || lx % 24 === 23 || (ly > 20 && ly % 21 === 20) || lx === ww - 1;
      if (mull) { b.set(x, y, rp(WD, 4 - (lx % 24 === 23 ? 2 : 0), x, y)); continue; }
      let c;
      const ht = 60 + hills(lx) * 12;
      if (ly > ht) c = rp(SNOW, 2.6 - (ly - ht) * 0.05 + (ly === Math.ceil(ht) ? 1 : 0), x, y);
      else c = rp(SKYW, 0.4 + ly / wh * 5.4, x, y);
      // distant pines and a lit cottage window
      const tx = lx % 17, tht = 10 + h2(Math.floor(lx / 17), 1, S) * 8;
      if (ly <= ht && ly > ht - tht && Math.abs(tx - 8) < (ly - (ht - tht)) * 0.4) c = rp(pal(['#081418', '#0e1e22', '#5a6a8a']), ly - (ht - tht) < 2 ? 2 : 0.6, x, y);
      // frost creeping in from the pane corners
      const pcx = lx % 24, pcy = ly > 20 ? (ly - 21) % 21 : ly;
      const fr = Math.min(pcx, 22 - pcx) + Math.min(pcy, 19 - pcy);
      if (fr < 4 && h2(x, y, S + 5) < 0.7 - fr * 0.15) c = mixc(c, hex('#e8f0ff'), 0.6);
      b.set(x, y, c);
    }
    // frame, sill with snow outside reflected as a white lip
    for (let y = wy0 - 4; y < wy0 + wh + 6; y++) for (let x = wx - 5; x < wx + ww + 5; x++) {
      const lx = x - wx, ly = y - wy0;
      const inW = lx >= 0 && lx < ww && ly >= 0 && ly < wh && !(ly < 20 && Math.hypot(lx + 0.5 - ww / 2, (ly - 20) * 2.4) > ww / 2);
      if (inW) continue;
      const inF = lx >= -5 && lx < ww + 5 && ly < wh + 6 && !(ly < 20 && Math.hypot(lx + 0.5 - ww / 2, (ly - 20) * 2.4) > ww / 2 + 5);
      if (!inF) continue;
      b.set(x, y, rp(WD, (ly >= wh ? 5.2 - (ly - wh) * 0.6 : 3.4 + (lx < ww / 2 ? 0.8 : -0.6)), x, y));
    }
    wins.push({ x: wx, y: wy0, w: ww, h: wh });
    // shelves of toys
    const RB = TOYC;
    for (let s = 0; s < 3; s++) {
      const sx = wrapP(wx + ww + 30 + s * 150, w), sw = 110;
      if (Math.abs(wrapD(sx + sw / 2 - (wx + ww / 2), w)) < ww / 2 + sw / 2 + 10) continue;
      for (const sy of [50, 90]) {
        for (let x = sx; x < sx + sw; x++) { b.set(x, sy, WD[6]); b.set(x, sy + 1, WD[4]); b.set(x, sy + 2, WD[2]); b.set(x, sy + 3, WD[1]); }
        for (const bx of [sx + 6, sx + sw - 10]) rPoly([[bx, sy + 3], [bx + 4, sy + 3], [bx, sy + 10]], b.P(WD[2]));
        let x = sx + 3;
        while (x < sx + sw - 12) {
          const kind = Math.floor(R() * 7), P = RB[Math.floor(R() * 6)];
          if (kind === 0) { // blocks
            for (let i = 0; i < 2 + Math.floor(R() * 2); i++) { const Q = RB[(i + s) % 6]; rRect(x + i * 7, sy - 7, 7, 7, (a, c) => b.set(a, c, rp(Q, 2 + (a === x + i * 7 ? 1.2 : 0) + (c === sy - 7 ? 1 : 0) - (a === x + i * 7 + 6 ? 1 : 0), a, c))); rRect(x + i * 7 + 2, sy - 5, 3, 3, b.P(RB[4][(i + s) % 2 ? 4 : 0])); }
            const Q = RB[(s + 3) % 6]; rRect(x + 3, sy - 14, 7, 7, (a, c) => b.set(a, c, rp(Q, 2 + (a === x + 3 ? 1.2 : 0) + (c === sy - 14 ? 1 : 0), a, c))); b.set(x + 6, sy - 11, RB[4][4]);
            x += 24;
          } else if (kind === 1) { // teddy
            const TB = pal(['#4a2a14', '#6a4020', '#8a5a30', '#aa7a48', '#ca9a68']);
            rEllipse(x + 7, sy - 6, 6, 6, (a, c) => b.set(a, c, rp(TB, 1.4 + 2.6 * clamp(1 - Math.hypot(a + 0.5 - x - 5, c + 0.5 - sy + 9) / 8, 0, 1), a, c)));
            rDisc(x + 7, sy - 15, 4.5, (a, c) => b.set(a, c, rp(TB, 1.6 + 2.6 * clamp(1 - Math.hypot(a + 0.5 - x - 6, c + 0.5 - sy + 17) / 6, 0, 1), a, c)));
            rDisc(x + 3, sy - 19, 1.8, b.P(TB[2])); rDisc(x + 11, sy - 19, 1.8, b.P(TB[1]));
            b.set(x + 5, sy - 16, TB[0]); b.set(x + 9, sy - 16, TB[0]); b.set(x + 7, sy - 14, TB[0]); rEllipse(x + 7, sy - 13, 2, 1, b.P(TB[4]));
            for (let i = 4; i < 11; i++) b.set(x + i, sy - 11, RB[0][3]);
            x += 18;
          } else if (kind === 2) { // striped ball
            const r = 5;
            rDisc(x + r, sy - r, r, (a, c) => { const u = (a + 0.5 - x - r) / r, v = (c + 0.5 - sy + r) / r; b.set(a, c, rp(Math.floor((v + Math.sin(u * 2) * 0.3) * 2.5 + 3) % 2 ? P : RB[4], 1.4 + 2.8 * clamp(-u * 0.5 - v * 0.5 + 0.6, 0, 1), a, c)); });
            x += 14;
          } else if (kind === 3) { // toy soldier
            const RD = RB[0], BL = RB[2], GD = RB[3];
            rRect(x + 2, sy - 22, 5, 6, b.P(hex('#141418'))); rRect(x + 2, sy - 16, 5, 1, b.P(GD[3]));
            rRect(x + 3, sy - 15, 3, 3, b.P(hex('#f0c8a0'))); b.set(x + 3, sy - 14, hex('#3a2010')); b.set(x + 5, sy - 14, hex('#3a2010'));
            rRect(x + 2, sy - 12, 5, 6, (a, c) => b.set(a, c, rp(RD, a === x + 2 ? 3.4 : 2, a, c))); rLine(x + 2, sy - 12, x + 6, sy - 8, b.P(hex('#f0f0f0')));
            rRect(x + 2, sy - 6, 2, 6, b.P(BL[1])); rRect(x + 5, sy - 6, 2, 6, b.P(BL[2])); rRect(x + 1, sy - 12, 1, 5, b.P(RD[1])); rRect(x + 7, sy - 12, 1, 5, b.P(RD[1]));
            for (let i = 0; i < 3; i++) b.set(x + 4, sy - 11 + i * 2, GD[4]);
            x += 11;
          } else if (kind === 4) { // drum
            for (let y = sy - 10; y < sy; y++) for (let a = x; a < x + 12; a++) {
              const u = (a + 0.5 - x - 6) / 6, zz = Math.abs(((a - x) + (y - sy) * 1) % 6 - 3) < 1 && y > sy - 9 && y < sy - 1;
              b.set(a, y, zz ? RB[3][3] : rp(P, 1.2 + 3 * Math.max(0, cyl(u)) + (y === sy - 10 || y === sy - 1 ? 1.4 : 0), a, y));
            }
            rEllipse(x + 6, sy - 10, 6, 1.5, b.P(hex('#f4ece0')));
            rLine(x + 2, sy - 16, x + 6, sy - 11, b.P(WD[5])); rLine(x + 11, sy - 15, x + 7, sy - 11, b.P(WD[5]));
            x += 16;
          } else if (kind === 5) { // train engine
            const Q = RB[s % 2 ? 0 : 2];
            rRect(x, sy - 9, 14, 6, (a, c) => b.set(a, c, rp(Q, 2 + (c === sy - 9 ? 1.2 : 0), a, c))); rRect(x + 8, sy - 15, 6, 6, (a, c) => b.set(a, c, rp(Q, 2.4 + (c === sy - 15 ? 1 : 0), a, c)));
            rRect(x + 2, sy - 13, 3, 4, b.P(hex('#141418'))); rRect(x + 1, sy - 14, 5, 1, b.P(RB[3][3])); rRect(x + 10, sy - 13, 3, 2, b.P(hex('#ffe8a0')));
            for (const wx2 of [x + 3, x + 10]) { rDisc(wx2, sy - 2, 2, b.P(hex('#141418'))); b.set(wx2, sy - 2, RB[3][3]); }
            x += 18;
          } else { // spinning top
            rPoly([[x, sy - 9], [x + 10, sy - 9], [x + 5, sy]], (a, c) => b.set(a, c, rp(Math.floor((c - sy + 9) / 3) % 2 ? P : RB[3], 1.6 + (a < x + 5 ? 1.4 : 0), a, c)));
            rRect(x + 4, sy - 13, 2, 4, b.P(WD[5]));
            x += 14;
          }
          x += 2 + Math.floor(R() * 4);
        }
      }
    }
    L.wall = mkLayer(b.canvas(), 0.14, fy, 'full');
  }

  // ---- mid: workbenches with half-made toys, wrapping-paper rolls, stacked presents
  {
    const w = 1024, h = 172, b = new Buf(w, h), top = 100, fl = h - 20;
    const PAPER = [['#c02030', '#f8f0e8'], ['#1a7040', '#f0d050'], ['#2a5aa8', '#f8f8ff'], ['#e0b030', '#c02030'], ['#8a3aa8', '#f0c0f0'], ['#f0ece0', '#2a8a50']];
    let x = 20, k = 0;
    while (x < w - 120) {
      const kind = ['bench', 'rolls', 'gifts', 'bench', 'gifts', 'rolls'][k % 6];
      if (kind === 'bench') {
        const bw = 130 + Math.floor(R() * 40);
        for (let xx = x; xx < x + bw; xx++) for (let y = top; y < top + 6; y++) b.set(xx, y, rp(WD, y === top ? 6.4 : 4 - (y - top) * 0.5 + ((xx * 7) % 31 === 0 ? -1 : 0), xx, y));
        for (const lx of [x + 4, x + bw - 9]) for (let y = top + 6; y < h; y++) for (let xx = lx; xx < lx + 5; xx++) b.set(xx, y, rp(WD, xx === lx ? 4.4 : 2.2, xx, y));
        for (let xx = x + 4; xx < x + bw - 4; xx++) { b.set(xx, fl - 8, WD[4]); b.set(xx, fl - 7, WD[2]); }
        // vise
        rRect(x + bw - 22, top - 7, 12, 7, (a, c) => b.set(a, c, rp(pal(['#2a2a32', '#4a4a56', '#70707e', '#9a9aa8']), a < x + bw - 18 ? 2.6 : 1.4, a, c)));
        rRect(x + bw - 26, top - 4, 4, 1, b.P(hex('#9a9aa8')));
        // tools and work in progress: a little unpainted rocking horse, paint pots, a hammer
        const hx = x + 30;
        const RAW = pal(['#5a3a1c', '#7e5428', '#a87a40', '#d0a464', '#ecc88a']);
        for (let a = -14; a <= 14; a++) b.set(hx + a, top - 2 - Math.round((a * a) / 60), RAW[a < 0 ? 3 : 2]);
        rRect(hx - 8, top - 12, 16, 5, (a, c) => b.set(a, c, rp(RAW, c === top - 12 ? 4 : 2.4, a, c)));
        rRect(hx + 6, top - 18, 5, 7, (a, c) => b.set(a, c, rp(RAW, 2.8, a, c))); rRect(hx + 10, top - 17, 3, 3, b.P(RAW[2]));
        for (const lx of [hx - 7, hx - 3, hx + 3, hx + 6]) rLine(lx, top - 7, lx + (lx < hx ? -2 : 2), top - 3, b.P(RAW[1]));
        const PP = [TOYC[0], TOYC[1], TOYC[2]];
        for (let i = 0; i < 3; i++) {
          const px = x + 62 + i * 10;
          rRect(px, top - 7, 7, 7, (a, c) => b.set(a, c, rp(pal(['#4a4a56', '#70707e', '#a0a0ae']), a === px ? 2 : 1, a, c)));
          rRect(px + 1, top - 7, 5, 1, b.P(PP[i][3]));
          if (i === 1) { rLine(px + 3, top - 7, px + 6, top - 15, b.P(WD[5])); b.set(px + 6, top - 16, PP[i][3]); }
        }
        rLine(x + 100, top - 1, x + 112, top - 4, b.P(WD[5])); rRect(x + 110, top - 7, 4, 4, b.P(hex('#5a5a66')));
        x += bw + 20;
      } else if (kind === 'rolls') {
        // barrel of paper rolls
        const bx = x + 14;
        const rolls = 6;
        for (let i = 0; i < rolls; i++) {
          const rx = bx - 10 + i * 4 + (i % 2), rh = 46 + Math.floor(R() * 18), [c1, c2] = PAPER[(i + k) % 6].map(hex), lean = (i - 2.5) * 0.12;
          for (let y = fl - 32 - rh; y < fl - 32; y++) {
            const off = Math.round((fl - 32 - y) * lean);
            for (let j = 0; j < 4; j++) {
              const xx = rx + j + off, stripe = ((y + (j > 1 ? 1 : 0)) % 6) < 3;
              let c = stripe ? c1 : c2;
              if (j === 0) c = mixc(c, hex('#ffffff'), 0.25); else if (j === 3) c = mixc(c, hex('#000000'), 0.35);
              b.set(xx, y, c);
            }
          }
          b.set(rx + 1 + Math.round(rh * lean), fl - 33 - rh, hex('#c8b090')); b.set(rx + 2 + Math.round(rh * lean), fl - 33 - rh, hex('#8a6a40'));
        }
        for (let y = fl - 44; y < fl; y++) for (let xx = bx - 14; xx < bx + 22; xx++) {
          const u = (xx + 0.5 - bx - 4) / 18, f = (y - fl + 44) / 44, bulge = 1 - Math.pow(f * 2 - 1, 2) * 0.12;
          if (Math.abs(u) > bulge) continue;
          let v = 1.4 + 3.4 * Math.max(0, cyl(u)) + (Math.floor((xx - bx) / 5) % 2 ? -0.4 : 0);
          if ([3, 4, 20, 21, 38, 39].includes(y - fl + 44)) v = 1 + 2.6 * Math.max(0, cyl(u)) - 0.6;
          b.set(xx, y, rp(WD, v + 1.2, xx, y));
        }
        // one roll leaning on the wall, partly unrolled
        const [c1, c2] = PAPER[(k + 2) % 6].map(hex);
        rSeg(x + 48, fl - 2, x + 62, fl - 68, 2.2, 2.2, (a, c) => b.set(a, c, ((a + c) % 6) < 3 ? c1 : c2));
        for (let a = 0; a < 26; a++) for (let j = 0; j < 3; j++) b.set(x + 50 + a, fl - 2 - j - Math.round(Math.sin(a * 0.2) * 1.5), (a % 6) < 3 ? c1 : mixc(c2, hex('#000000'), j * 0.1));
        x += 100;
      } else {
        let gx = x;
        for (let i = 0; i < 4; i++) {
          const gw = 16 + Math.floor(R() * 12), gh = 16 + Math.floor(R() * 10), P = TOYC[Math.floor(R() * 6)], RB = TOYC[(i + 3) % 6];
          present(b, gx, fl, gw, gh, P, RB, S);
          if (i % 3 !== 2) {
            const g2w = Math.max(10, gw - 5), g2h = 11 + Math.floor(R() * 6); present(b, gx + 2, fl - gh, g2w, g2h, TOYC[(i + 1) % 6], TOYC[(i + 4) % 6], S);
            if (i % 2 === 0) present(b, gx + 4, fl - gh - g2h, Math.max(8, g2w - 5), 9, TOYC[(i + 2) % 6], TOYC[(i + 5) % 6], S);
          }
          gx += gw + 1;
        }
        x = gx + 30;
      }
      k++;
    }
    L.mid = mkLayer(b.canvas(), 0.28, 0.3, 'bottom');
  }

  // ---- conveyor of presents, a wrapping machine
  const lampsM = [];
  {
    const w = 1024, h = 112, top = 62, b = new Buf(w, h), ib = new Buf(w, h), mb = new Buf(w, h);
    const ST = pal(['#141016', '#201a22', '#2c2430', '#3a3040', '#4a4052', '#5e5466']);
    const RD = TOYC[0], GR = TOYC[1], GD = TOYC[3];
    for (let x = 0; x < w; x++) {
      b.set(x, top, ST[3]); b.set(x, top + 1, ST[1]); b.set(x, top + 2, ST[0]);
      for (let y = top + 3; y < top + 11; y++) {
        let v = 2.8 - (y - top - 3) * 0.2;
        if (y === top + 3) v = 4.4; if (y === top + 10) v = 0.3;
        let c = rp(RD, v, x, y);
        if (y === top + 6 || y === top + 7) c = ((x >> 2) % 2) ? GD[3] : GD[2];
        b.set(x, y, c);
      }
    }
    for (let x = 60; x < w; x += 128) for (const s of [-1, 1]) { rLine(x, top + 11, x + s * 11, h, b.P(ST[2])); rLine(x + 1, top + 11, x + 1 + s * 11, h, b.P(ST[3])); }
    for (let x = 0; x < w; x++) { b.set(x, h - 20, ST[2]); b.set(x, h - 19, ST[1]); }
    L.belt = mkLayer(b.canvas(), 0.42, 0.44, 'bottom');
    let x = 6;
    while (x < w - 24) {
      const gw = 9 + Math.floor(R() * 9), gh = 8 + Math.floor(R() * 9);
      present(ib, x, top, gw, gh, TOYC[Math.floor(R() * 6)], TOYC[Math.floor(R() * 6)], S);
      x += gw + 10 + Math.floor(R() * 16);
    }
    for (let xx = 0; xx < w; xx += 6) ib.set(xx, top + 1, ST[4]);
    L.goods = mkLayer(ib.canvas(), 0.42, 0.44, 'bottom', { vx: -14 });
    for (let k = 0; k < 2; k++) {
      const mx = k * 512 + 140 + Math.floor(R() * 200), mw = 56, my = 16, P = k ? GR : RD;
      for (let y = my; y < top + 11; y++) for (let xx = mx; xx < mx + mw; xx++) {
        const lx = xx - mx, ly = y - my, u = (lx + 0.5) / mw * 2 - 1;
        if (ly < 8 && Math.hypot(Math.max(0, Math.abs(lx + 0.5 - mw / 2) - (mw / 2 - 8)), 8 - ly) > 8) continue;
        if (ly > 22 && ly < top - my + 3 && lx > 9 && lx < mw - 9) { const fl = (lx - 10) % 5; mb.set(xx, y, rp(ST, ly < 25 ? 1.4 : fl !== 4 ? 1.2 + (fl === 0 ? 0.8 : 0) : 0.2, xx, y)); continue; }
        let v = 1.8 + 1.8 * Math.max(0, cyl(u));
        if (lx === 0 || ly === 0) v += 1.2; if (lx === mw - 1) v -= 1.2;
        let c = rp(P, v, xx, y);
        if (ly === 4 || ly === 20 || lx === 4 || lx === mw - 5) c = rp(GD, 2.6 + (lx < mw / 2 ? 0.8 : 0), xx, y);
        mb.set(xx, y, c);
      }
      // gauge window with candy-stripe trim, two lamps
      const px = mx + mw / 2, py = my + 12;
      rDisc(px, py, 5, mb.P(GD[1])); rDisc(px, py, 4, (a, c) => mb.set(a, c, rp(pal(['#d0d8e0', '#f0f4f8', '#ffffff']), 2 - Math.hypot(a + 0.5 - px + 1, c + 0.5 - py + 1) / 3, a, c)));
      rLine(px, py, px + 2, py - 3, mb.P(RD[1]));
      lampsM.push({ x: mx + 8, y: my + 4, c: 0 }, { x: mx + mw - 8, y: my + 4, c: 1 });
    }
    L.mach = mkLayer(mb.canvas(), 0.42, 0.44, 'bottom');
  }

  // ---- near: evergreen garland swags with bows, and strings of coloured lights
  const bulbs = [];
  {
    const w = 1024, fy = 0.6, h = fullH(E, fy), b = new Buf(w, h);
    const NG = pal(['#061810', '#0a2418', '#123422', '#1c462c', '#2a5a38']);
    const BOW = TOYC[0];
    const span = 128;
    for (let x0 = 0; x0 < w; x0 += span) {
      // garland swag
      for (let i = 0; i <= span; i++) {
        const t = i / span, x = x0 + i, y = sagY(x0, 2, x0 + span, 2, 12, t);
        for (let j = -3; j <= 3; j++) {
          const n = h2(x, j, S + 7);
          if (Math.abs(j) === 3 && n < 0.5) continue;
          b.set(x, y + j, rp(NG, 2 - j * 0.35 + (n - 0.5) * 2, x, y + j));
        }
        if (i % 3 === 0) { const n = h2(x, 9, S); if (n < 0.5) b.set(x + (n < 0.25 ? -1 : 1), y + 4, NG[1]); }
      }
      // berries
      for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, x = x0 + t * span, y = sagY(x0, 2, x0 + span, 2, 12, t); b.set(x, y + 1, hex('#e02838')); b.set(x + 1, y + 1, hex('#a01020')); b.set(x, y, hex('#ff8080')); }
      bow(b, x0, 4, 1.1, BOW);
      // light string slung a little lower
      const sag = 18 + Math.floor(R() * 8), ya = 6, n = 15;
      rSag(x0, ya, x0 + span, ya, sag, b.P(hex('#141a14')));
      for (let i = 1; i < n; i++) {
        const t = i / n, x = Math.round(x0 + t * span), y = Math.round(sagY(x0, ya, x0 + span, ya, sag, t));
        const ci = (x0 / span * 3 + i) % 5;
        b.set(x, y + 1, hex('#2a2a2a'));
        bulbs.push({ x: x + 0.5, y: y + 3, c: ci, i: bulbs.length });
      }
    }
    L.near = mkLayer(b.canvas(), 0.62, fy, 'full');
  }
  const BC = [['#ff4050', '#ffd0d0', '#ff3040'], ['#40e070', '#d0ffd8', '#30d060'], ['#4890ff', '#d0e4ff', '#4080ff'], ['#ffc830', '#fff4c0', '#ffb020'], ['#f0f0ff', '#ffffff', '#c0c8ff']];
  const bulbS = BC.map(([c, k]) => { const fb = new Buf(3, 4, false); spr(fb, 0, 0, ['.a.', 'aba', 'aaa', '.a.'], { a: hex(c), b: hex(k) }); return fb.canvas(); });
  const bulbOff = (() => { const fb = new Buf(3, 4, false); spr(fb, 0, 0, ['.a.', 'aba', 'aaa', '.a.'], { a: hex('#3a3040'), b: hex('#5a5060') }); return fb.canvas(); })();
  const bulbG = BC.map(([, , g]) => glowSprite(6, g, 0.55));
  const lampG = [glowSprite(5, '#ff5060', 0.7), glowSprite(5, '#60ff80', 0.7)];
  const snowIn = [];
  for (let i = 0; i < 40; i++) snowIn.push({ x: R(), y: R(), v: 6 + R() * 10, a: 2 + R() * 4, p: R() * TAU, z: R() < 0.3 });
  const motes = [];
  for (let i = 0; i < 16; i++) motes.push({ x: R() * (W + 20), y: R() * (H * 0.8), p: R(), r: 0.2 + R() * 0.35, v: 3 + R() * 5, c: i % 2 });

  return {
    fog: '#4a2a22',
    back(g, cx, cy, t) {
      blit(g, L.wall, E, cx, cy, t);
      // snow falling past the window, clipped to the panes
      for (const wn of wins) onScreen(L.wall, E, cx, cy, t, wn.x, wn.y, wn.w + 10, (x, y) => {
        const X = Math.floor(x), Y = Math.floor(y);
        if (X > W || X + wn.w < 0) return;
        g.save(); g.beginPath(); g.rect(X, Y + 4, wn.w, wn.h - 4); g.clip();
        for (const f of snowIn) {
          const fx = X + wrapP(f.x * wn.w + Math.sin(t * 0.8 + f.p) * f.a - t * 3, wn.w), fy = Y + wrapP(f.y * wn.h + t * f.v, wn.h);
          g.fillStyle = f.z ? '#ffffff' : '#a8b8d8';
          g.fillRect(Math.floor(fx), Math.floor(fy), 1, 1);
        }
        g.restore();
      });
      blit(g, L.mid, E, cx, cy, t);
      blit(g, L.belt, E, cx, cy, t);
      blit(g, L.goods, E, cx, cy, t);
      blit(g, L.mach, E, cx, cy, t);
      add(g);
      lampsM.forEach((l, i) => {
        if ((Math.floor(t * 2) + l.c) % 2) return;
        g.globalAlpha = 0.9;
        onScreen(L.mach, E, cx, cy, t, l.x, l.y, 8, (x, y) => g.drawImage(lampG[l.c], Math.floor(x) - 5, Math.floor(y) - 5));
      });
      norm(g);
      blit(g, L.near, E, cx, cy, t);
      // lights: slow chase, every bulb softly glowing
      const ph = Math.floor(t * 2.5), lit = [];
      for (const bl of bulbs) {
        const on = ((bl.i + ph) % 4) !== 0;
        onScreen(L.near, E, cx, cy, t, bl.x, bl.y, 8, (x, y) => {
          const X = Math.floor(x) - 1, Y = Math.floor(y) - 1;
          g.drawImage(on ? bulbS[bl.c] : bulbOff, X, Y);
          if (on) lit.push(bl.c, X, Y);
        });
      }
      add(g); g.globalAlpha = 0.55;
      for (let i = 0; i < lit.length; i += 3) g.drawImage(bulbG[lit[i]], lit[i + 1] - 5, lit[i + 2] - 4);
      norm(g);
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H * 0.8;
      for (const s of motes) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.5) continue;
        const k = Math.sin(ph * 2 * Math.PI);
        const x = Math.floor(wrapP(s.x - cx * 1.1, sw2)) - 10, y = Math.floor(wrapP(s.y + t * s.v - cy * 1.1, sh2));
        g.globalAlpha = 0.8 * k;
        g.fillStyle = s.c ? '#fff0b0' : '#ffffff'; g.fillRect(x, y, 1, 1);
        if (k > 0.7) { g.globalAlpha = 0.4 * k; g.fillStyle = s.c ? '#f0c040' : '#c0d0ff'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      }
      g.globalAlpha = 1;
    },
  };
}

