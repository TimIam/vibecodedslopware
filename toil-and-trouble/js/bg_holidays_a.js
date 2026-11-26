// Toil & Trouble — holiday parallax backdrops, set A (Halloween, Fourth of July, St Patrick's).
//
// Same house rules as backgrounds.js: every layer is rasterised once, pixel by
// pixel, into an offscreen canvas (limited palettes, ordered dithering, no
// anti-aliasing) and blitted at whole-pixel offsets each frame. Per-frame work
// is blits, a handful of glow sprites, firework bursts and a few dozen
// particles. All randomness comes from the seeded generator.
//
//   makeBackground(theme, { W, H, levelW, levelH, seed })
//     -> { drawBack(ctx, camX, camY, t), drawFront(ctx, camX, camY, t), fog }

export const THEMES = ['hallo_out', 'hallo_in', 'july_out', 'july_in', 'july_rocket', 'pat_out', 'pat_in'];

// ---------------------------------------------------------------------------
// (helpers below are copied from backgrounds.js so this module stands alone)
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
// 1D value noise, periodic over `period` pixels
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
// 2D value noise, periodic in x over `period`, cells of height cellH in y
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
function css(c) { return `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`; }

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
// steps (1..n) along (dx,dy) until an empty pixel; n+1 if none
function edgeDist(m, x, y, dx, dy, n) {
  for (let k = 1; k <= n; k++) if (!m.at(x + dx * k, y + dy * k)) return k;
  return n + 1;
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
function spr(b, x, y, rows, map) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c !== undefined) b.set(x + i, y + j, c); }
  }
}
// bake a dithered glow: lerps opaque pixels toward col, writes translucent pixels into empty ones
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
// screen positions of a point fixed in a layer (one per visible wrapped copy)
function onScreen(L, E, camX, camY, t, px, py, m, fn) {
  const y = layerY(L, E, camY) + py;
  if (y < -m || y > E.H + m) return;
  let x = wrapP(px - layerOX(L, camX, t), L.w);
  if (x - L.w > -m) x -= L.w;
  for (; x < E.W + m; x += L.w) fn(x, y);
}
// draw a horizontally wrapping strip canvas at screen offset
function strip(g, cv, ox, y) {
  const w = cv.width;
  let x = -wrapP(Math.floor(ox), w);
  for (; x < g.canvas.width + w; x += w) g.drawImage(cv, x, Math.floor(y));
}

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
// crooked limb, a = angle from vertical (0 = up)
function limb(plot, R, x, y, a, len, r0, depth, tips, hangs, droop = 0) {
  const step = 4, n = Math.max(2, Math.round(len / step));
  let px = x, py = y;
  for (let s = 0; s < n; s++) {
    a += (R() - 0.5) * 0.5 + droop * Math.sign(a);
    const nx = px + Math.sin(a) * step, ny = py - Math.cos(a) * step;
    const r1 = r0 * (1 - (s + 1) / n * 0.8), rr0 = r0 * (1 - s / n * 0.8);
    rSeg(px, py, nx, ny, rr0, r1, plot);
    px = nx; py = ny;
    if (hangs && s === (n >> 1)) hangs.push([px, py, r1]);
    if (depth > 0 && s >= 1 && R() < 0.3)
      limb(plot, R, px, py, a + (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.6), len * 0.5, Math.max(0.5, r1 * 0.75), depth - 1, tips, null, droop);
  }
  if (tips) tips.push([px, py, a]);
}
// periodic ridge heights
function ridge(seed, w, base, amp, cells = 5, oct = 4) {
  const f = fbm1(seed, cells, w, oct), a = new Float32Array(w);
  for (let x = 0; x < w; x++) a[x] = base - (f(x) - 0.5) * 2 * amp;
  return a;
}
// soft translucent band (fog/mist/wisps), wraps horizontally
function fogStrip(seed, w, h, col, amax, cells = 10) {
  const b = new Buf(w, h), c = hex(col), n = fbm2(seed, cells, w, h * 0.7, 3);
  for (let y = 0; y < h; y++) {
    const fy = Math.sin(Math.PI * (y + 0.5) / h);
    for (let x = 0; x < w; x++) {
      const v = clamp((n(x, y) - 0.34) * 2, 0, 1) * fy * fy;
      const q = Math.round(v * amax * 10) / 10;
      if (q > 0) b.d[y * w + x] = withA(c, Math.round(clamp(q, 0, 1) * 255));
    }
  }
  return b.canvas();
}

// ---------------------------------------------------------------------------
// shared helpers for the holiday sets

// dithered blend of c toward M by m (0..1)
function mixq(c, m, x, y, M) { const q = dq(clamp(m, 0, 1) * 4, x, y) / 4; return q > 0 ? mixc(c, M, q) : c; }
// fade every opaque pixel of rows y0..y1 toward M (ramp^pw * amax), for calm bottoms and mist
function fadeRows(b, y0, y1, M, amax, pw = 1) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(b.h, y1); y++) {
    const m = Math.pow(clamp((y - y0) / Math.max(1, y1 - y0), 0, 1), pw) * amax;
    for (let x = 0; x < b.w; x++) { const c = b.d[y * b.w + x]; if (c >>> 24 === 255) b.d[y * b.w + x] = mixq(c, m, x, y, M); }
  }
}
// sagging wire between two points
function sagY(y0, y1, f, sag) { return lerp(y0, y1, f) + sag * 4 * f * (1 - f); }
function wire(b, x0, y0, x1, y1, sag, c) {
  const n = Math.max(1, Math.ceil(Math.abs(x1 - x0)));
  let py = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = Math.round(lerp(x0, x1, f)), y = Math.round(sagY(y0, y1, f, sag));
    if (py !== null && Math.abs(y - py) > 1) for (let yy = Math.min(y, py) + 1; yy < Math.max(y, py); yy++) b.set(x, yy, c);
    b.set(x, y, c); py = y;
  }
}
// triangle pennants along a sagging line; cols = [[dark, light], ...]
function bunting(b, x0, y0, x1, y1, sag, cols, wc, step = 7, tw = 5, th = 6) {
  wire(b, x0, y0, x1, y1, sag, wc);
  let ci = 0;
  for (let xx = x0 + step * 0.6; xx < x1 - tw; xx += step) {
    const f = (xx - x0) / (x1 - x0), y = Math.round(sagY(y0, y1, f, sag)) + 1, P = cols[ci++ % cols.length];
    for (let j = 0; j < th; j++) {
      const hw = (tw / 2) * (1 - j / th);
      for (let x = Math.round(xx - hw); x <= Math.round(xx + hw - 0.5); x++) b.set(x, y + j, P[x < xx - 0.5 ? 1 : 0]);
    }
  }
}
// string of bulbs along a sagging line; bulb screen positions pushed to out
function bulbs(b, x0, y0, x1, y1, sag, step, wc, bc, out, tag) {
  wire(b, x0, y0, x1, y1, sag, wc);
  for (let xx = x0 + step / 2; xx < x1; xx += step) {
    const f = (xx - x0) / (x1 - x0), y = Math.round(sagY(y0, y1, f, sag)), x = Math.round(xx);
    b.set(x, y + 1, bc[1]); b.set(x, y + 2, bc[0]);
    if (out) out.push({ x: x + 0.5, y: y + 2, L: tag, p: h2(x, y, 77) * TAU });
  }
}
// little 4-frame candle/torch flame sprites
function flameFrames(seed, w = 5, h = 8, cols = ['#a83810', '#ff8a20', '#ffd050', '#fff8d0']) {
  const out = [], FL = pal(cols);
  for (let f = 0; f < 4; f++) {
    const b = new Buf(w, h, false), rr = mulberry32(seed + f * 31);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fy = y / (h - 1), wob = Math.sin(f * 1.7 + y * 0.9) * 0.7 * (1 - fy);
      const wd = (w / 2 - 0.3) * Math.pow(fy, 0.7) * (1 - Math.pow(fy, 5) * 0.35);
      const d = Math.abs(x + 0.5 - w / 2 - wob) / Math.max(0.4, wd);
      if (d > 1 || (y < 2 && rr() < 0.35)) continue;
      b.set(x, y, FL[clamp(Math.floor((1 - d) * 2.4 + fy * 1.5), 0, 3)]);
    }
    out.push(b.canvas());
  }
  return out;
}
// glow with an ordered-dither falloff (reads as pixel light rather than a flat disc)
function ditherGlow(r, col, amax, pw = 1.6) {
  const s = 2 * r + 1, b = new Buf(s, s, false), c = hex(col);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - r, y - r) / (r + 0.5);
    if (d >= 1) continue;
    const q = dq(amax * Math.pow(1 - d, pw) * 5, x, y) / 5;
    if (q > 0) b.d[y * s + x] = withA(c, Math.round(clamp(q, 0, 1) * 255));
  }
  return b.canvas();
}
// tiny 4-point twinkle
function twinkle(g, x, y, k, c1, c2) {
  g.fillStyle = c1; g.fillRect(x, y, 1, 1);
  if (k > 0.55) { g.fillStyle = c2; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
  if (k > 0.85) { g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1); }
}
// standing crowd silhouettes into a mask; raised hands pushed to hands
function crowd(m, x0, x1, by, R, sc, v, hands) {
  for (let x = x0; x < x1; x += (3.6 + R() * 3) * sc) {
    const hh = (12 + R() * 6) * sc, hw = (2.4 + R() * 0.9) * sc, ys = by - hh * 0.72;
    rRect(x - hw, ys + 1.2 * sc, hw * 2 + 1, by - ys, m.P(v));
    rEllipse(x + 0.5, ys + 1.6 * sc, hw + 0.4, 1.7 * sc, m.P(v));
    rRect(x - 0.4 * sc, ys - 0.8 * sc, 0.8 * sc + 1, 1.2 * sc + 1, m.P(v));
    rEllipse(x + 0.5, ys - 2.2 * sc, 1.75 * sc, 2 * sc, m.P(v));
    const k = R();
    if (k < 0.1) { rEllipse(x + 0.5, ys - 5.2 * sc, 1.6 * sc, 2.1 * sc, m.P(v)); rDisc(x + 0.5, ys - 8.2 * sc, 1.3 * sc, m.P(v)); }
    else if (k < 0.2) {
      const s = R() < 0.5 ? -1 : 1, hx = x + s * (hw + 2 * sc), hy = ys - 6 * sc;
      rLine(x + s * hw, ys + 1.5 * sc, hx, hy, m.P(v));
      if (sc > 1.4) rLine(x + s * hw + s, ys + 1.5 * sc, hx + s, hy, m.P(v));
      if (hands) hands.push([hx, hy]);
    } else if (k < 0.34) rRect(x - 2 * sc, ys - 3.6 * sc, 4 * sc + 1, 1, m.P(v));
  }
}

// ---------------------------------------------------------------------------
// fireworks: deterministic bursts from t. place(i, k, a, b, cx, cy) -> [burstX, burstY, launchX, launchY] in screen px
const FWC = [['#ff4a3a', '#ffb4a0'], ['#fff2e0', '#b8c8ff'], ['#4a82ff', '#c4d8ff'], ['#ffbe50', '#fff0b8'],
  ['#6cff8c', '#e0ffe4'], ['#c27aff', '#f0d4ff'], ['#ff6ac4', '#ffd4f0']];
function makeFireworks(seed, n, o) {
  const cols = o.cols || [0, 1, 2, 3, 0, 1, 2, 4, 5, 6];
  const glows = FWC.map(c => ditherGlow(o.gr || 26, c[0], 0.32, 2));
  const gr = o.gr || 26, size = o.size || 1;
  const slots = [];
  for (let i = 0; i < n; i++) { const P = o.pmin + h2(i, 11, seed) * (o.pmax - o.pmin); slots.push({ P, off: h2(i, 12, seed) * P * 3 }); }
  const draw = (g, t, cx, cy) => {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const s = slots[i], tau = t + s.off, k = Math.floor(tau / s.P), age = tau - k * s.P;
      if (h2(k, i, seed + 3) < (o.skip || 0)) continue;
      const hA = h2(k, i, seed + 4), hB = h2(k, i, seed + 5), hC = h2(k, i, seed + 6);
      const pos = o.place(i, k, hA, hB, cx, cy);
      if (!pos) continue;
      const [bx, by, lx, ly] = pos;
      const rise = 0.5 + hC * 0.35, type = Math.floor(h2(k, i, seed + 7) * 5);
      const life = type === 2 ? 2.7 : 1.7 + hB * 0.6;
      if (age > rise + life) continue;
      const R0 = size * (type === 1 ? 24 : 17 + hB * 17);
      if (bx < -R0 - 10 || bx > g.canvas.width + R0 + 10 || by < -R0 - 20 || by > g.canvas.height + R0 + 30) continue;
      const ci = cols[Math.floor(hA * 977) % cols.length], C = FWC[ci], C2 = FWC[cols[Math.floor(hB * 613) % cols.length]];
      if (age < rise) {
        const f = age / rise;
        g.fillStyle = '#ffd890';
        for (let q = 0; q < 5; q++) {
          const ff = Math.max(0, f - q * 0.035), e = 1 - (1 - ff) * (1 - ff);
          g.globalAlpha = (0.9 - q * 0.17) * (o.alpha || 1);
          g.fillRect(Math.floor(lerp(lx, bx, e) + Math.sin(ff * 11 + i) * 0.8), Math.floor(lerp(ly, by, e)), 1, 1);
        }
        continue;
      }
      const ab = age - rise, fade = 1 - ab / life, A = Math.min(1, Math.pow(fade, 0.8) * 1.15) * (o.alpha || 1);
      if (ab < 0.7) {
        g.globalAlpha = (1 - ab / 0.7) * 0.9 * (o.glowA || 1);
        g.drawImage(glows[ci], Math.floor(bx) - gr, Math.floor(by) - gr);
      }
      const np = type === 1 ? 26 : 28 + Math.floor(hC * 16), e = 1 - Math.exp(-ab * 3.1);
      const gy = (type === 2 ? 11 : 5) * ab * ab * size, big = ab < 0.55 ? 2 : 1;
      const tw = ab > life * 0.55;
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = pass ? (ab < 0.15 ? '#ffffff' : type === 3 && ab > 0.8 ? C2[0] : type === 2 ? '#ffc860' : C[0]) : (type === 2 ? '#b07a30' : C[1]);
        g.globalAlpha = A * (pass ? 1 : 0.4);
        for (let j = 0; j < np; j++) {
          const a = (j + h2(j, k, seed) * 0.5) / np * TAU, sp = type === 1 ? 1 : 0.45 + 0.55 * h2(j, k + 7, seed);
          if (pass && tw && h2(j + i * 50, Math.floor(t * 14), seed) < 0.45) continue;
          const r = R0 * sp * (pass ? e : e * 0.8), ca = Math.cos(a), sa = Math.sin(a);
          let px = bx + ca * r, py = by + sa * r + gy * (pass ? 1 : 0.8);
          if (!pass && type !== 2 && type !== 4 && ab > 1) continue;
          if (pass && type === 3 && ab > 0.8) {
            const d = (ab - 0.8) * 7;
            g.fillRect(Math.floor(px - sa * d), Math.floor(py + ca * d), 1, 1);
            px += sa * d; py -= ca * d;
          }
          g.fillRect(Math.floor(px), Math.floor(py), pass ? big : 1, pass ? big : 1);
          if (!pass && (type === 2 || type === 4)) g.fillRect(Math.floor(bx + ca * r * 0.6), Math.floor(by + sa * r * 0.6 + gy * 0.5), 1, 1);
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };
  return draw;
}

// ===========================================================================
// HALLO_OUT — the pumpkin patch under a harvest moon

function buildHalloOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {}, lights = [];
  const SKY = pal(['#06030b', '#0a0511', '#0f0718', '#150920', '#1c0c29', '#240f31', '#2e133a', '#391642', '#461a48',
    '#561e4c', '#68244e', '#7c2c4c', '#933646', '#aa443c', '#c25832', '#d8702c', '#ea8c30', '#f6aa42']);
  const stops = [[0, 10.6], [20, 9.5], [50, 8], [90, 6.2], [140, 4.5], [200, 3.1], [280, 1.9], [400, 0.8], [600, 0.1]];

  // ---- sky: purple-black, huge orange moon with cloud streaks across it
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  const moonX = 262, moonD = Math.min(120, sh - 52), moonR = 41, moonY = sh - 1 - moonD;
  {
    const b = new Buf(sw, sh), cm = new Mask(sw, sh);
    const MOON = pal(['#6e260e', '#8e3412', '#ae4616', '#ca5c1c', '#e27624', '#f2922e', '#faae40', '#ffcc62', '#ffe490']);
    const streak = (cx, cy, len, th) => {
      const segs = Math.max(2, Math.round(len / 10));
      for (let s = 0; s < segs; s++) {
        const f = s / (segs - 1), taper = 1 - Math.abs(f - 0.5) * 1.6;
        if (taper <= 0) continue;
        rEllipse(cx - len / 2 + f * len + (R() - 0.5) * 5, cy + (R() - 0.5) * 1.5, 6 + R() * 8, Math.max(0.7, th * taper * (0.7 + R() * 0.5)), cm.P(1));
      }
    };
    for (let i = 0; i < 7; i++) streak(R() * sw, sh - 1 - (70 + R() * 130), 60 + R() * 140, 2 + R() * 2.4);
    streak(moonX + 10, moonY + 12, 130, 3.2);
    streak(moonX + 48, moonY - 20, 100, 2.4);
    const crat = [];
    for (let i = 0; i < 9; i++) crat.push([(R() - 0.5) * moonR * 1.4, (R() - 0.5) * moonR * 1.4, 2 + R() * 5]);
    const mare = fbm2(S + 3, 6, 96, 14, 3);
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y, bv = interp(stops, d);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - moonX, sw), dy = y - moonY, dist = Math.hypot(dx, dy);
        const g1 = Math.max(0, 1 - (dist - moonR) / 160), g2 = Math.max(0, 1 - (dist - moonR) / 34);
        const glow = 4.6 * g1 * g1 + 3.6 * g2 * g2;
        const ck = cm.at(x, y);
        let c;
        if (ck) {
          const below = cm.at(x, y + 1), above = cm.at(x, y - 1);
          let v = bv + glow * 0.3 - 1.6;
          if (!below) v = bv + glow * 0.95 + 0.6;
          else if (!above) v = bv + glow * 0.5 - 0.6;
          if (dist < moonR + 1 && below) v = Math.min(v, 6.5);
          c = rp(SKY, v, x, y);
        } else if (dist < moonR) {
          const nx = dx / moonR, ny = dy / moonR, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          let v = 2.2 + 5.6 * clamp(-nx * 0.28 - ny * 0.34 + nz * 0.78, 0, 1);
          const mv = mare(dx + 48, dy + 48);
          if (mv > 0.56) v -= 1.1; else if (mv > 0.5) v -= 0.5;
          for (const [cx2, cy2, cr] of crat) { const e = Math.hypot(dx - cx2, dy - cy2); if (e < cr) v += e > cr - 1.2 && dx - cx2 < 0 ? 0.6 : -0.7; }
          v -= Math.pow(dist / moonR, 6) * 1.6;
          c = rp(MOON, v, x, y);
        } else c = rp(SKY, bv + glow + (dist < moonR + 1.5 ? 1.5 : 0), x, y);
        b.d[y * sw + x] = c;
      }
    }
    const STAR = pal(['#4a2c54', '#9a7ca8', '#eadcf2']);
    for (let i = 0; i < (sw * sh) / 380; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), d = sh - 1 - y;
      if (d < 70 || cm.at(x, y) || Math.hypot(wrapD(x - moonX, sw), y - moonY) < moonR + 40) continue;
      const k = R();
      b.set(x, y, STAR[k < 0.65 ? 0 : k < 0.93 ? 1 : 2]);
    }
    layers.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- far hills: lanterns glowing along the ridges, tiny dead trees
  {
    const P = pal(['#1a0d24', '#21102b', '#291433', '#32183a', '#3d1d42', '#4a2349', '#5a2a50']);
    const w = 768, h = 120, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 28, 14, 4);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    for (let i = 0; i < 22; i++) {
      const x = R() * w, by = top[Math.floor(x)] + 1, th = 4 + R() * 8;
      rLine(x, by, x + (R() - 0.5) * 2, by - th, m.P(1));
      for (let j = 0; j < 3; j++) { const yy = by - th * (0.4 + R() * 0.6), s = R() < 0.5 ? -1 : 1; rLine(x, yy, x + s * (1 + R() * 3), yy - 1 - R() * 2, m.P(1)); }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      let v = 1.6;
      if (!m.at(x, y - 1)) v = 4.4; else if (!m.at(x, y - 2)) v = 3;
      v += clamp((y - 36) / 40, 0, 1) * 2.4;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(R() * w), y = Math.floor(top[x] + 4 + R() * 22);
      b.set(x, y, hex('#ffb83a')); b.set(x + 1, y, hex('#f08a1e')); b.set(x, y + 1, hex('#c0561a')); b.set(x + 1, y + 1, hex('#8a3414'));
      lights.push({ L: 'far', x: x + 1, y: y + 1, s: 0.55, k: 0 });
    }
    layers.far = mkLayer(b.canvas(), 0.06, 0.1, 'bottom');
  }

  // ---- mid hills: the farmhouse, gnarled trees, a fence line
  {
    const P = pal(['#0a0510', '#0f0716', '#150a1d', '#1c0d24', '#25112c', '#301634', '#3e1c3c', '#4e2444']);
    const WIN = pal(['#5a2410', '#a8521a', '#e88a2a', '#ffc45a', '#ffe8a0']);
    const w = 768, h = 170, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 5, w, 94, 10, 3);
    const hx = Math.floor(200 + R() * 80);
    let hy = 0; for (let x = hx - 36; x <= hx + 40; x++) hy = Math.max(hy, top[wrapP(x, w)]);
    hy = Math.floor(hy - 3);
    for (let x = 0; x < w; x++) {
      let t0 = top[x];
      const dd = Math.abs(wrapD(x - hx, w));
      if (dd < 60) t0 = lerp(hy + 1, t0, smooth(clamp((dd - 38) / 22, 0, 1)));
      top[x] = t0;
      for (let y = Math.floor(t0); y < h; y++) m.set(x, y, 1);
    }
    // farmhouse: main block, steep crooked gable, turret, chimney, porch
    const M2 = m.P(2);
    rRect(hx - 26, hy - 30, 52, 31, M2);
    rPoly([[hx - 31, hy - 29], [hx + 30, hy - 30], [hx + 3, hy - 58]], M2);
    rRect(hx - 2, hy - 60, 3, 4, M2);
    rRect(hx + 15, hy - 52, 5, 16, M2); rRect(hx + 14, hy - 53, 7, 2, M2);
    rRect(hx - 44, hy - 46, 16, 47, M2);
    rPoly([[hx - 47, hy - 45], [hx - 25, hy - 46], [hx - 38, hy - 76]], M2);
    rLine(hx - 38, hy - 76, hx - 39, hy - 82, M2); rLine(hx - 41, hy - 80, hx - 37, hy - 80, M2);
    rRect(hx + 26, hy - 16, 16, 17, M2);
    rPoly([[hx + 24, hy - 15], [hx + 44, hy - 16], [hx + 26, hy - 24]], M2);
    rPoly([[hx - 30, hy - 13], [hx + 28, hy - 13], [hx + 24, hy - 17], [hx - 27, hy - 17]], M2);
    for (let x = hx - 26; x <= hx + 24; x += 10) rLine(x, hy - 13, x, hy, M2);
    // gnarled dead trees
    const tree = (x, by, hh, th) => {
      let px = x, py = by, a = (R() - 0.5) * 0.4;
      const segs = Math.ceil(hh / 5), pts = [];
      for (let s = 0; s <= segs; s++) { pts.push([px, py, th * (1 - s / segs * 0.8)]); a += (R() - 0.5) * 0.55; a *= 0.85; px += Math.sin(a) * 5; py -= Math.cos(a) * 5; }
      for (let s = 0; s < segs; s++) rSeg(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], pts[s][2], pts[s + 1][2], m.P(3));
      for (let i = 0; i < 5; i++) {
        const p = pts[Math.floor(segs * (0.35 + R() * 0.6))], s = i % 2 ? 1 : -1;
        limb(m.P(3), R, p[0], p[1], s * (0.7 + R() * 0.9), hh * (0.25 + R() * 0.3), Math.max(0.6, p[2] * 0.6), 2, null, null, 0.06);
      }
      for (let i = 0; i < 2; i++) limb(m.P(3), R, x + (i ? 1 : -1) * th, by - 1, (i ? 1 : -1) * 2, 6 + R() * 5, th * 0.4, 0, null, null);
    };
    for (let k = 0; k < 4; k++) {
      const x = wrapP(hx + 90 + k * 160 + R() * 70, w);
      tree(x, top[Math.floor(x)] + 3, 34 + R() * 34, 2.4 + R() * 1.6);
    }
    tree(hx - 64, top[wrapP(hx - 64, w)] + 2, 46, 3.2);
    // fence line on the crest
    for (let x = 0; x < w; x += 7) {
      if (h2(x >> 6, 3, S) < 0.4) continue;
      const by = Math.floor(top[x]) + 2, lean = Math.round((h2(x, 4, S) - 0.5) * 2);
      rLine(x, by, x + lean, by - 5 - Math.round(h2(x, 5, S) * 2), m.P(3));
      if (h2(x, 6, S) > 0.25) rLine(x, by - 3, x + 7, Math.floor(top[wrapP(x + 7, w)]) - 1, m.P(3));
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let v = 1.4;
      if (k === 2) {
        v = 1.5;
        if (!m.at(x, y - 1)) v = 4.4; else if (!m.at(x - 1, y)) v = 3.4; else if (!m.at(x + 1, y)) v = 0.4;
        if ((y - hy) % 4 === 0 && m.at(x - 1, y) && m.at(x + 1, y) && y > hy - 30) v -= 0.5;
      } else if (k === 3) {
        v = !m.at(x - 1, y) ? 3.6 : !m.at(x, y - 1) ? 3 : !m.at(x + 1, y) ? 0.4 : 1.3;
      } else {
        if (!m.at(x, y - 1)) v = 4.2; else if (!m.at(x, y - 2)) v = 2.8;
        v += clamp((y - 100) / 40, 0, 1) * 1.8;
      }
      b.d[y * w + x] = rp(P, v, x, y);
    }
    // windows: most lit, one dark, round attic light
    const win = (x0, y0, ww, wh, lit) => {
      for (let j = -1; j <= wh; j++) for (let i = -1; i <= ww; i++) b.set(x0 + i, y0 + j, P[0]);
      if (!lit) return;
      glowInto(b, x0 + ww / 2, y0 + wh / 2, 13, hex('#7a3a1a'), 0.4, true);
      for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) b.set(x0 + i, y0 + j, rp(WIN, 3.4 - j / wh * 1.6 - Math.abs(i + 0.5 - ww / 2) / ww, x0 + i, y0 + j));
      for (let j = 0; j < wh; j++) b.set(x0 + (ww >> 1), y0 + j, WIN[0]);
      for (let i = 0; i < ww; i++) b.set(x0 + i, y0 + (wh >> 1), WIN[0]);
      lights.push({ L: 'mid', x: x0 + ww / 2, y: y0 + wh / 2, s: 0.5, k: 1 });
    };
    win(hx - 20, hy - 26, 6, 8, true); win(hx - 6, hy - 26, 6, 8, false); win(hx + 8, hy - 26, 6, 8, true);
    win(hx - 39, hy - 38, 5, 8, true); win(hx - 39, hy - 24, 5, 7, false);
    win(hx + 30, hy - 11, 5, 6, true); win(hx - 18, hy - 10, 5, 7, true);
    rDisc(hx + 1, hy - 40, 3.2, b.P(P[0]));
    rDisc(hx + 1, hy - 40, 2.2, b.P(WIN[3])); b.set(hx + 1, hy - 40, WIN[1]); b.set(hx, hy - 41, WIN[4]);
    lights.push({ L: 'mid', x: hx + 1, y: hy - 40, s: 0.4, k: 1 });
    rLine(hx + 6, hy - 27, hx + 4, hy - 17, b.P(P[3])); // hanging shutter
    fadeRows(b, h - 34, h, hex('#2a1434'), 0.7);
    layers.mid = mkLayer(b.canvas(), 0.14, 0.2, 'bottom');
  }

  // ---- the patch: rows of pumpkins, crooked fences, scarecrows, one great dead tree
  {
    const w = 768, h = 172, b = new Buf(w, h), m = new Mask(w, h);
    const F = pal(['#07040a', '#0b060e', '#100913', '#160c18', '#1e101e', '#281526', '#33192e']);
    const WOOD = pal(['#09060b', '#110b12', '#1a121a', '#261a24', '#352430', '#463040']);
    const STRAW = pal(['#24160e', '#3c2816', '#5a3e20', '#78562c']);
    const top = ridge(S + 7, w, 104, 4, 3);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    // great dead tree
    const tx = Math.floor(560 + R() * 80), tb = top[tx] + 2;
    {
      let px = tx, py = tb, a = -0.12;
      const pts = [];
      for (let s = 0; s <= 18; s++) { pts.push([px, py, 7 * (1 - s / 18 * 0.75)]); a += (R() - 0.5) * 0.4 - 0.01; px += Math.sin(a) * 5; py -= Math.cos(a) * 5; }
      for (let s = 0; s < 18; s++) rSeg(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], pts[s][2], pts[s + 1][2], m.P(3));
      for (let i = 0; i < 7; i++) {
        const p = pts[6 + Math.floor(R() * 12)], s = i % 2 ? 1 : -1;
        limb(m.P(3), R, p[0], p[1], s * (0.9 + R() * 0.8), 30 + R() * 34, Math.max(1, p[2] * 0.6), 2, null, null, 0.05);
      }
      for (let i = 0; i < 4; i++) { const s = i % 2 ? 1 : -1; limb(m.P(3), R, tx + s * 4, tb - 2, s * (1.8 + R() * 0.3), 12 + R() * 12, 3, 0, null, null); }
    }
    // fences
    const fence = (x0, x1) => {
      for (let x = x0; x < x1; x += 14 + Math.floor(R() * 6)) {
        const by = Math.floor(top[wrapP(x, w)]) + 3, ht = 19 + R() * 8, lean = (R() - 0.5) * 6;
        rSeg(x, by, x + lean, by - ht, 1.1, 0.9, m.P(4));
        if (R() < 0.85) {
          const nx = x + 16, nb = Math.floor(top[wrapP(nx, w)]) + 3;
          for (const hr of [7, 15]) {
            if (R() < 0.18) { rLine(x + lean * hr / ht, by - hr, nx - 4, nb - hr + 7 + R() * 4, m.P(4)); continue; }
            rLine(x + lean * hr / ht, by - hr, nx, nb - hr + (R() - 0.5) * 3, m.P(4));
            rLine(x + lean * hr / ht, by - hr + 1, nx, nb - hr + 1 + (R() - 0.5) * 2, m.P(4));
          }
        }
      }
    };
    fence(20, 230); fence(330, 520);
    // scarecrows (pole + crossbar + ragged coat + sack head + floppy hat)
    const crows = [];
    const scarecrow = (x, by) => {
      const ys = by - 44;
      rRect(x - 1, ys - 6, 3, 50, m.P(4));
      rRect(x - 19, ys + 2, 39, 2, m.P(4));
      const hem = [];
      for (let i = 0; i <= 10; i++) hem.push([x + 11 - i * 2.2, by - 17 + (i % 2 ? 3 : 0) + R() * 2]);
      rPoly([[x - 8, ys + 1], [x + 9, ys + 1], [x + 11, by - 17], ...hem, [x - 11, by - 17]], m.P(5));
      for (const s of [-1, 1]) {
        rSeg(x + s * 7, ys + 3, x + s * 17, ys + 4, 2.6, 2, m.P(5));
        for (let k = 0; k < 4; k++) rLine(x + s * 18, ys + 3 + k, x + s * (21 + R() * 3), ys + 4 + k * 1.6 + R(), m.P(6));
      }
      for (let k = 0; k < 5; k++) rLine(x - 4 + k * 2, by - 17, x - 5 + k * 2.4, by - 11 - R() * 3, m.P(6));
      rDisc(x + 0.5, ys - 5, 6, m.P(7));
      rLine(x - 2, ys + 1, x + 3, ys + 1, m.P(6));
      rEllipse(x + 1, ys - 10, 11, 2.2, m.P(5));
      rPoly([[x - 5, ys - 10], [x + 6, ys - 11], [x + 4, ys - 19], [x - 2, ys - 18]], m.P(5));
      crows.push([x + 15, ys + 2]);
      return ys;
    };
    const scs = [];
    for (const sx of [130 + Math.floor(R() * 40), 420 + Math.floor(R() * 40)]) scs.push([sx, scarecrow(sx, Math.floor(top[sx]) + 6)]);
    // crow on an arm
    const [cwx, cwy] = crows[0];
    rEllipse(cwx, cwy - 3, 3, 2, m.P(3)); rDisc(cwx + 3, cwy - 5, 1.5, m.P(3)); m.set(cwx + 5, cwy - 5, 3); rLine(cwx - 3, cwy - 3, cwx - 6, cwy - 1, m.P(3));
    // paint
    const furrow = noise2(S + 9, 96, w, 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let c;
      if (k === 1) {
        const dy = y - top[x];
        let v = 2.2 - dy * 0.03;
        if (dy < 1) v = 4.4; else if (dy < 2) v = 3.2;
        if (Math.floor(dy) % 7 === 3) v += 0.6;
        v += (furrow(x, y) - 0.5) * 0.8;
        if (y > 150) v = lerp(v, 1.6, clamp((y - 150) / 16, 0, 1));
        c = rp(F, v, x, y);
      } else if (k === 3 || k === 4) {
        const v = !m.at(x - 1, y) ? 3.8 : !m.at(x, y - 1) ? 3 : !m.at(x + 1, y) ? 0.3 : 1.3;
        c = rp(WOOD, v + (k === 4 ? 0.5 : 0), x, y);
      } else if (k === 5) {
        const v = !m.at(x - 1, y) ? 3.4 : !m.at(x, y - 1) ? 2.8 : 1.2 + ((x * 3 + y) % 5 === 0 ? 0.8 : 0);
        c = rp(WOOD, v, x, y);
      } else if (k === 6) c = rp(STRAW, !m.at(x, y - 1) ? 2.6 : 1.4, x, y);
      else c = rp(STRAW, !m.at(x - 1, y) || !m.at(x, y - 1) ? 2.2 : 1.1, x, y);
      b.d[y * w + x] = c;
    }
    // stitched sack faces
    for (const [sx, ys] of scs) { b.set(sx - 2, ys - 6, F[0]); b.set(sx + 3, ys - 6, F[0]); for (let i = -2; i <= 3; i++) b.set(sx + i, ys - 2 - (i === -2 || i === 3 ? 1 : 0), F[0]); }
    // pumpkins, back rows first
    const PUMP = pal(['#1e0a06', '#341208', '#4e1c0a', '#6c2a0e', '#8e3c14', '#b0521c', '#cc6a26']);
    const STEM = pal(['#0e140a', '#1c2812', '#2e3e1a']);
    const FACE = pal(['#8a3a0a', '#e07a18', '#ffb030', '#ffe070']);
    const pumpkin = (cx, cy, rx, ry, jack) => {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx; x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const rib = Math.abs(Math.cos(nx * Math.PI * 1.6));
        let v = 1.6 + 2.6 * clamp(-nx * 0.5 - ny * 0.6 + 0.4, 0, 1) - (rib < 0.25 ? 1 : 0) - Math.max(0, ny) * 0.8;
        if (jack) v += 1.6;
        b.set(x, y, rp(PUMP, v, x, y));
      }
      rLine(cx, cy - ry, cx + 1, cy - ry - 2, b.P(STEM[2])); b.set(cx + 1, cy - ry - 1, STEM[1]);
      if (jack) {
        const ex = Math.max(1, Math.round(rx * 0.35)), ey = Math.round(cy - ry * 0.25);
        for (const s of [-1, 1]) {
          const x0 = Math.round(cx + s * ex);
          b.set(x0, ey - 1, FACE[2]); b.set(x0 - 1, ey, FACE[1]); b.set(x0, ey, FACE[3]); b.set(x0 + 1, ey, FACE[1]);
        }
        const my = Math.round(cy + ry * 0.3);
        for (let x = Math.round(cx - rx * 0.6); x <= cx + rx * 0.6; x++) {
          b.set(x, my, FACE[2]); if ((x + Math.round(cx)) % 2) b.set(x, my - 1, FACE[1]); else b.set(x, my + 1, FACE[1]);
        }
        glowInto(b, cx, cy, rx * 2.6, hex('#6a2a10'), 0.35, true);
        lights.push({ L: 'patch', x: cx + 0.5, y: cy, s: 0.75, k: 2 });
      }
    };
    for (let row = 0; row < 3; row++) {
      for (let x = R() * 20; x < w; x += 14 + R() * 26) {
        const xi = Math.floor(x), cy = top[xi] + 6 + row * 8 + R() * 2, sc = 0.75 + row * 0.25;
        if (Math.abs(wrapD(xi - tx, w)) < 10) continue;
        const jack = R() < (row === 2 ? 0.2 : 0.12);
        // vine
        const vl = 6 + R() * 10;
        for (let k = 0; k < vl; k++) b.set(xi + k + 2, Math.round(cy + 2 + Math.sin(k * 0.8 + x) * 1.2), STEM[1]);
        pumpkin(xi, cy, (4 + R() * 3) * sc, (3 + R() * 1.6) * sc, jack);
      }
    }
    // one big carved pumpkin beside each scarecrow
    for (const [sx] of scs) pumpkin(sx + 18, Math.floor(top[sx + 18]) + 14, 8, 6, true);
    layers.patch = mkLayer(b.canvas(), 0.3, 0.34, 'bottom');
  }

  // ---- near: crooked overhanging branches from the top
  {
    const P = pal(['#040207', '#08040c', '#0d0712', '#140a19', '#1d0f22', '#2a1530']);
    const w = 768, fy = 0.5, h = fullH(E, fy), m = new Mask(w, h);
    for (let i = 0; i < 2; i++) {
      const x0 = i * 384 + 40 + R() * 200, side = i ? -1 : 1;
      limb(m.P(1), R, x0, -8, side * (2.15 + R() * 0.2), 84 + R() * 30, 3.6, 2, null, null, 0.02);
      if (i === 0) limb(m.P(1), R, x0 + side * 24, -6, side * (2.4 + R() * 0.15), 40 + R() * 20, 2.2, 1, null, null, 0.04);
    }
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      let v = 1;
      if (!m.at(x, y - 1)) v = 3.6; else if (!m.at(x - 1, y)) v = 2.6; else if (!m.at(x, y + 1)) v = 0.2;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    layers.near = mkLayer(b.canvas(), 0.55, fy, 'full');
  }

  // ---- animated bits
  const glows = [glowSprite(4, '#ff8a2a', 0.55), glowSprite(7, '#ff9a3c', 0.42), glowSprite(10, '#ff7a20', 0.5)];
  const batF = [['.k...k.', 'kkk.kkk', '..kkk..', '...k...'], ['.......', 'kkkkkkk', '.kkkkk.', '...k...'], ['.......', '..kkk..', 'kkkkkkk', 'k..k..k']]
    .map(rows => { const bb = new Buf(7, 4, false); spr(bb, 0, 0, rows, { k: hex('#0b0612') }); return bb.canvas(); });
  const batFB = [['k........k', 'kk......kk', '.kkk..kkk.', '..kkkkkk..', '....kk....'], ['..........', 'kkkk..kkkk', '.kkkkkkkk.', '...kkkk...', '....kk....'],
    ['..........', '..........', '.kkkkkkkk.', 'kkk.kk.kkk', 'k...kk...k']]
    .map(rows => { const bb = new Buf(10, 5, false); spr(bb, 0, 0, rows, { k: hex('#0b0612') }); return bb.canvas(); });
  const bats = [];
  for (let i = 0; i < 9; i++) bats.push({ x: R() * 768, y: 10 + R() * 80, ax: 20 + R() * 40, ay: 6 + R() * 12, f: 0.25 + R() * 0.35, p: R() * TAU, v: 6 + R() * 10, big: i < 2 });
  const fogs = [
    { cv: fogStrip(S + 31, 512, 24, '#6c4a7c', 0.42, 8), y: 158, v: 5, f: 1.05 },
    { cv: fogStrip(S + 32, 512, 18, '#7e5a88', 0.34, 6), y: 186, v: -3.5, f: 1.2 },
    { cv: fogStrip(S + 33, 512, 14, '#5a3c6c', 0.3, 10), y: 128, v: 2.5, f: 1.1 },
  ];
  const LEAFC = ['#b8481e', '#d8702a', '#8a2e1e', '#e0a040', '#6a2a1e'];
  const fall = [];
  for (let i = 0; i < 12; i++) fall.push({ x: R() * (W + 40), y: R() * (H + 40), vx: -(6 + R() * 10), vy: 8 + R() * 10,
    a: 4 + R() * 9, f: 0.6 + R() * 1.1, p: R() * TAU, sp: 2 + R() * 4, c: LEAFC[i % 5], d: LEAFC[(i + 2) % 5] });

  return {
    fog: '#3a2246',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      // bats wheel around the moon
      const oy = layerY(layers.sky, E, cy) + moonY - 75;
      for (const bt of bats) {
        const x = Math.floor(wrapP(bt.x + Math.cos(t * bt.f + bt.p) * bt.ax - t * bt.v - cx * 0.06, W + 60)) - 30;
        const y = Math.floor(bt.y + Math.sin(t * bt.f * 1.7 + bt.p) * bt.ay + oy);
        const fr = Math.floor(t * (bt.big ? 7 : 9) + bt.p * 3) % 4, k = fr === 3 ? 1 : fr;
        g.drawImage(bt.big ? batFB[k] : batF[k], x, y);
      }
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      blit(g, layers.patch, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lights.forEach((l, i) => {
        const fl = 0.6 + 0.22 * Math.sin(t * 6.1 + i * 2.3) * Math.sin(t * 2.7 + i) + 0.1 * Math.sin(t * 15 + i * 4);
        const sp = glows[l.k], r = (sp.width - 1) >> 1;
        g.globalAlpha = clamp(fl * l.s, 0, 1);
        onScreen(layers[l.L], E, cx, cy, t, l.x, l.y, r + 2, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const dy = (E.maxCamY - cy) * 1.0;
      for (const f of fogs) strip(g, f.cv, f.v * t + cx * f.f, f.y + dy);
      const sw2 = W + 40, sh2 = H + 40;
      g.globalAlpha = 0.85;
      for (const L of fall) {
        const x = Math.floor(wrapP(L.x + L.vx * t + Math.sin(t * L.f + L.p) * L.a - cx * 1.2, sw2)) - 20;
        const y = Math.floor(wrapP(L.y + L.vy * t - cy * 1.2, sh2)) - 20;
        const ph = Math.floor(wrapP(t * L.sp + L.p, 4));
        g.fillStyle = L.c;
        if (ph === 0) g.fillRect(x, y, 2, 1);
        else if (ph === 1) { g.fillRect(x, y, 1, 1); g.fillStyle = L.d; g.fillRect(x + 1, y + 1, 1, 1); }
        else if (ph === 2) g.fillRect(x, y, 1, 2);
        else { g.fillRect(x + 1, y, 1, 1); g.fillStyle = L.d; g.fillRect(x, y + 1, 1, 1); }
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// HALLO_IN — the haunted mansion's hall

function buildHalloIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {}, eyes = [], candles = [];
  const winX = [150, 534], ww = 46;

  // ---- back wall: damask paper, wainscot, moonlit arched windows, portraits
  {
    const WALL = pal(['#060409', '#09060d', '#0d0912', '#120c17', '#17101d', '#1d1424', '#24192c', '#2c1e35', '#36253f']);
    const WOOD = pal(['#060304', '#0b0607', '#110a0a', '#18100e', '#211612', '#2c1d17', '#3a271d', '#4a3224']);
    const NIGHT = pal(['#070b1e', '#0b1228', '#101a34', '#162342', '#1e2e52', '#283a62', '#344874']);
    const MOON = pal(['#8a96b4', '#b0bcd4', '#d4dcec', '#f0f4fc']);
    const VEL = pal(['#0c0306', '#16050a', '#22080f', '#300c15', '#40121c', '#521a24']);
    const GILT = pal(['#1e1406', '#3a280c', '#5a4014', '#7c5a20', '#a07a30', '#c49c48']);
    const w = 768, fy = 0.16, h = fullH(E, fy), b = new Buf(w, h), fl = new Buf(w, h), ray = new Buf(w, h), glass = new Mask(w, h);
    const rail = h - 58, sill = rail - 10, wtop = sill - 132;
    const stain = fbm2(S + 2, 12, w, 40, 3), grain = noise2(S + 4, 192, w, 30);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v;
      if (y < rail) {
        const row = Math.floor(y / 30), off = (row % 2) * 12, lx = ((x + off) % 24) - 12, ly = (y % 30) - 15;
        const dmd = Math.abs(lx) / 9 + Math.abs(ly) / 13;
        const fleur = (lx * lx) / 10 + ((ly + 2) * (ly + 2)) / 30 < 1 || (Math.abs(lx) < 1 && ly > 4 && ly < 9) || (lx * lx + (ly + 9) * (ly + 9) < 3);
        v = 3.4 + ((dmd > 0.86 && dmd < 1.02) || fleur ? 1.1 : 0) + ((x % 48) < 2 ? -0.5 : 0);
        const st = stain(x, y);
        v -= clamp((st - 0.5) * 6, 0, 2.2);
        v -= clamp((y - (rail - 60)) / 60, 0, 1) * 0.8;
        v -= clamp((30 - y) / 30, 0, 1) * 1.2;
        b.d[y * w + x] = rp(WALL, v, x, y);
      } else {
        const py = y - rail, px = x % 64;
        v = 2.6 + (grain(x, y) - 0.5) * 0.8;
        if (py < 3) v = py === 0 ? 5.6 : py === 1 ? 4.2 : 1.2;
        else if (px < 3 || py < 8 || y > h - 8) v = px === 1 ? 3.8 : 3.2;
        else if (px === 3 || py === 8) v = 0.8;
        else if (px === 63) v = 4;
        b.d[y * w + x] = rp(WOOD, v, x, y);
      }
    }
    // crown moulding
    for (let x = 0; x < w; x++) for (let y = 0; y < 7; y++) b.set(x, y, WOOD[[1, 5, 3, 2, 6, 2, 0][y]]);
    // windows: night outside, moon in one, branches, leading, frame, tattered velvet
    winX.forEach((cx, wi) => {
      const x0 = cx - ww / 2, rr = ww / 2;
      const inside = (x, y) => x >= x0 && x < x0 + ww && y < sill && (y >= wtop + rr || Math.hypot(x + 0.5 - cx, y - (wtop + rr)) <= rr);
      const mx = cx + (wi ? -8 : 9), my = wtop + 34, br = new Mask(w, h);
      limb(br.P(1), R, x0 + (wi ? ww + 4 : -4), wtop + 50 + R() * 30, (wi ? -1 : 1) * (1.2 + R() * 0.4), 44, 2.2, 2, null, null, 0.04);
      for (let y = wtop - 2; y < sill + 2; y++) for (let x = x0 - 4; x < x0 + ww + 4; x++) {
        if (inside(x, y)) {
          const lx = x - x0, ly = y - wtop;
          const lead = lx === rr || lx === rr - 1 || (ly > rr && (ly - rr) % 26 === 0) || ((lx + ly) % 9 === 0 && ly > rr + 2 && ((lx * 7 + ly * 3) % 5 === 0));
          if (lead || lx === 0 || lx === ww - 1 || y === sill - 1) { b.set(x, y, WOOD[lx === 0 ? 5 : 1]); continue; }
          let c, dm = Math.hypot(x - mx, y - my);
          if (wi === 0 && dm < 9) c = rp(MOON, 2.6 - dm / 9 * 1.4 - (h2(x, y, S) > 0.8 ? 0.6 : 0), x, y);
          else if (br.at(x, y)) c = NIGHT[0];
          else c = rp(NIGHT, 1 + (y - wtop) / 132 * 3.6 + Math.max(0, 1 - dm / 40) * 2.2, x, y);
          b.set(x, y, c); glass.set(x, y, 1);
          fl.set(x, y, withA(hex('#c4d4ff'), 220));
        } else {
          let near = false;
          for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (inside(x + dx, y + dy)) { near = true; break; }
          if (near) b.set(x, y, rp(WOOD, inside(x + 1, y) || inside(x, y + 1) ? 6.2 : x < cx ? 4.6 : 3, x, y));
        }
      }
      for (let x = x0 - 6; x < x0 + ww + 6; x++) { b.set(x, sill, WOOD[7]); b.set(x, sill + 1, WOOD[4]); b.set(x, sill + 2, WOOD[1]); }
      // moonbeam shafts slanting down-left from the panes to the floor
      const kx = -0.62, dust = noise2(S + 8 + wi, 64, w, 6);
      for (const [p0, p1] of [[3, rr - 3], [rr + 2, ww - 3]]) {
        const top = sill - 70;
        for (let y = top; y < h; y++) {
          const s0 = y - top, xa = x0 + p0 + s0 * kx, xb = x0 + p1 + s0 * kx;
          for (let x = Math.floor(xa) - 1; x <= xb + 1; x++) {
            if (y < sill && inside(x, y)) continue;
            const e = Math.min(x + 0.5 - xa, xb - x - 0.5), edge = clamp(e / 4, 0, 1);
            const a = edge * Math.pow(clamp(1 - s0 / 190, 0, 1), 1.4) * (0.5 + 0.5 * dust(x - y * kx, y)) * 0.75;
            const q = dq(a * 4, x, y);
            if (q > 0 && (ray.get(x, y) >>> 24) < q * 26) ray.set(x, y, withA(hex('#6c7cc8'), q * 26));
          }
        }
      }
      // velvet drapes, a swag across the top
      for (const s of [-1, 1]) {
        const ex = s < 0 ? x0 - 8 : x0 + ww - 6, dw = 14;
        for (let y = wtop - 8; y < h - 30; y++) for (let i = 0; i < dw; i++) {
          const hem = h - 34 - Math.floor(h2(ex + i, 3, S) * 8) - (i % 3 === 0 ? 3 : 0);
          if (y > hem) continue;
          const pinch = y < wtop + 40 ? 0 : Math.round(Math.sin(clamp((y - wtop - 40) / 60, 0, 1) * Math.PI / 2) * 3);
          const xx = ex + (s < 0 ? i - pinch : i + pinch);
          const v = 2.4 + 1.6 * Math.sin(i * 1.1 + (s < 0 ? 0 : 1.5)) - (y > hem - 3 ? 1 : 0) + (i === 0 ? 0.6 : 0);
          b.set(xx, y, rp(VEL, v, xx, y));
        }
      }
      for (let y = wtop - 12; y < wtop + 8; y++) for (let x = x0 - 10; x < x0 + ww + 10; x++) {
        const f = (x - x0 + 10) / (ww + 20), drop = 6 + 9 * Math.sin(f * Math.PI * 3) * Math.sin(f * Math.PI * 3);
        if (y - (wtop - 12) > drop + 5) continue;
        b.set(x, y, rp(VEL, 3.2 - (y - (wtop - 12)) / (drop + 5) * 2 + (y === wtop - 12 ? 1.5 : 0), x, y));
      }
      rRect(x0 - 12, wtop - 14, ww + 24, 2, b.P(GILT[3]));
    });
    // portraits with painted figures; eye positions animated later
    const portrait = (cx, cy, pw, ph, oval, kind) => {
      const inPic = (x, y, m) => oval ? (((x + 0.5 - cx) / (pw / 2 - m)) ** 2 + ((y + 0.5 - cy) / (ph / 2 - m)) ** 2 <= 1) : (Math.abs(x + 0.5 - cx) <= pw / 2 - m && Math.abs(y + 0.5 - cy) <= ph / 2 - m);
      glowInto(b, cx, cy + 4, pw * 0.9, hex('#2a1a30'), 0.3, true);
      for (let y = Math.floor(cy - ph / 2 - 2); y <= cy + ph / 2 + 2; y++) for (let x = Math.floor(cx - pw / 2 - 2); x <= cx + pw / 2 + 2; x++) {
        if (!inPic(x, y, -2)) continue;
        if (!inPic(x, y, 3)) {
          const edge = !inPic(x, y, -1) || inPic(x, y, 2);
          const lit = (x - cx) / pw * -1 + (y - cy) / ph * -1;
          b.set(x, y, rp(GILT, (edge ? 1 : 3) + lit * 2 + (h2(x, y, S + 5) > 0.85 ? 1 : 0), x, y));
          continue;
        }
        const u = (x + 0.5 - cx) / pw, v0 = (y + 0.5 - cy) / ph;
        const hd = Math.hypot(u, (v0 + 0.12) * 0.8);
        let v = 2.6 - hd * 4, P = pal(['#08090a', '#0e110f', '#151a15', '#1d241c', '#283024']);
        const hy = kind ? -0.14 : -0.1;
        const head = (u / 0.17) ** 2 + ((v0 - hy) / 0.16) ** 2 < 1;
        const body = v0 > 0.1 && Math.abs(u) < 0.34 + (v0 - 0.1) * 0.5;
        const hair = kind ? (u / 0.2) ** 2 + ((v0 + 0.33) / 0.16) ** 2 < 1 || (Math.abs(u) < 0.23 && Math.abs(u) > 0.12 && v0 > -0.3 && v0 < 0.02) : false;
        const collar = !kind && v0 > 0.04 && v0 < 0.18 && Math.abs(u) < 0.2 + (v0 - 0.04) * 1.2;
        const sock = head && Math.abs(Math.abs(u) - 0.065) < 0.05 && Math.abs(v0 - hy + 0.01) < 0.035;
        const cap = head && !kind && v0 < hy - 0.05 - u * u * 2;
        if (sock) { P = WOOD; v = 0.4; }
        else if (cap) { P = WOOD; v = 1.6 - u * 4; }
        else if (head) { P = pal(['#1a1418', '#2c2226', '#40343a', '#5a4a4a', '#746258']); v = 2.6 - u * 6 - (v0 - hy) * 5 - (Math.abs(u) > 0.13 ? 0.8 : 0); }
        else if (hair) { P = WOOD; v = 2.2 - u * 3; }
        else if (collar) { P = pal(['#2a2a34', '#3e3e4a', '#545462']); v = 1.4 - u * 2; }
        else if (body) { P = kind ? VEL : WOOD; v = 2.4 - u * 4 - v0; }
        b.set(x, y, rp(P, v, x, y));
      }
      const ey = Math.round(cy + (kind ? -0.15 : -0.11) * ph), ex = Math.round(pw * 0.065) + 1;
      b.set(cx - ex, ey, hex('#05030a')); b.set(cx + ex, ey, hex('#05030a'));
      eyes.push({ x: cx - ex, y: ey, dx: ex * 2, p: R() * TAU });
      for (let k = -1; k <= 1; k++) b.set(cx + k, Math.round(cy - ph / 2 - 5), GILT[2]);
      rLine(cx, cy - ph / 2 - 5, cx - pw * 0.3, cy - ph / 2 + 1, b.P(GILT[1])); rLine(cx, cy - ph / 2 - 5, cx + pw * 0.3, cy - ph / 2 + 1, b.P(GILT[1]));
    };
    const tiers = Math.max(1, Math.round((h - 40) / 170));
    for (let tr = 0; tr < tiers; tr++) {
      const yb = h - 140 - tr * 170;
      portrait(342, yb + (tr ? 0 : 20), 40, 54, false, 0);
      portrait(726, yb + (tr ? 10 : 14), 34, 46, true, 1);
      if (tr) { portrait(150, yb + 30, 30, 40, true, 1); portrait(534, yb + 20, 38, 48, false, 0); }
    }
    layers.wall = mkLayer(b.canvas(), 0.16, fy, 'full');
    layers.flash = mkLayer(fl.canvas(), 0.16, fy, 'full');
    layers.ray = mkLayer(ray.canvas(), 0.16, fy, 'full');
  }

  // ---- mid: grand staircase, candelabras, dust-sheeted furniture
  {
    const WOOD = pal(['#040203', '#080405', '#0d0708', '#140b0b', '#1c100e', '#271612', '#341e17', '#46281c']);
    const SHEET = pal(['#111019', '#181722', '#20202c', '#2a2a38', '#363646', '#444456', '#545468']);
    const BRASS = pal(['#1e1408', '#3a280e', '#5e4418', '#86662a']);
    const w = 768, fy = 0.36, h = fullH(E, fy), m = new Mask(w, h), b = new Buf(w, h);
    // staircase rising to the right to a landing and a railed gallery
    const sx0 = 40, run = 12, rise = 8, n = 13, floor = h - 24, land = floor - n * rise;
    for (let i = 0; i < n; i++) {
      const x = sx0 + i * run, y = floor - (i + 1) * rise;
      rRect(x, y, run + 2, h - y, m.P(1));
      rRect(x - 1, y, run + 3, 2, m.P(2));
    }
    const lx1 = sx0 + n * run, gal = lx1 + 150;
    rRect(lx1, land, gal - lx1, 7, m.P(2));
    rRect(lx1, land + 7, gal - lx1, 4, m.P(1));
    for (let x = lx1 + 6; x < gal; x += 48) rRect(x, land + 11, 5, h - land - 11, m.P(1));
    for (let x = lx1 + 6; x + 48 <= gal + 6; x += 48) {
      const c = x + 26.5;
      for (let y = land + 11; y < land + 30; y++) for (let xx = x + 5; xx < x + 48; xx++) {
        const dx = (xx + 0.5 - c) / 21.5, dy = (y - (land + 30)) / 17;
        if (dx * dx + dy * dy > 1) m.set(xx, y, 1);
      }
    }
    const railH = 16;
    for (let i = 0; i <= n * run; i += 4) {
      const x = sx0 + i + 3, y = floor - Math.floor(i / run + 1) * rise;
      rLine(x, y - 1, x, y - railH, m.P(3));
    }
    rSeg(sx0 + 2, floor - rise - railH - 1, lx1 + 2, land - railH - 1, 1.1, 1.1, m.P(4));
    for (let x = lx1 + 2; x < gal; x += 4) rLine(x, land - 1, x, land - railH, m.P(3));
    rRect(lx1, land - railH - 2, gal - lx1, 2, m.P(4));
    rRect(sx0 - 3, floor - rise - 26, 6, 26 + rise, m.P(4)); rDisc(sx0, floor - rise - 29, 3.2, m.P(4));
    rRect(lx1 - 1, land - railH - 8, 5, railH + 8, m.P(4)); rDisc(lx1 + 1.5, land - railH - 10, 2.4, m.P(4));
    // dust-sheeted shapes
    const sheet = (cx, by, sw2, sh2, kind) => {
      const pts = [];
      const k = 18;
      for (let i = 0; i <= k; i++) {
        const f = i / k, u = f * 2 - 1;
        let top;
        if (kind === 'chair') top = by - sh2 * (Math.abs(u) < 0.55 ? 1 - u * u * 0.6 : 0.55 + (1 - Math.abs(u)) * 0.2);
        else if (kind === 'clock') top = by - sh2 * (1 - Math.pow(Math.abs(u), 6) * 0.15) + (Math.abs(u) < 0.6 ? -3 * Math.cos(u * 2.6) : 0);
        else if (kind === 'sofa') top = by - sh2 * (Math.abs(u) > 0.82 ? 0.7 : 0.92 + 0.08 * Math.cos(u * Math.PI * 2));
        else top = by - sh2 * (Math.abs(u) < 0.9 ? 1 : 0.8);
        pts.push([cx + u * sw2 / 2, top]);
      }
      for (let i = k; i >= 0; i--) { const u = i / k * 2 - 1; pts.push([cx + u * (sw2 / 2 + 3), by - 3 + (i % 3 === 0 ? 2 : 0)]); }
      if (kind !== 'frame') for (const u of [-0.42, 0.42]) rRect(cx + u * sw2 - 1, by - 3, 2, 3, m.P(8));
      rPoly(pts, m.P(5));
      for (let f = -0.4; f <= 0.41; f += 0.2) { const fx = cx + f * sw2 + (h2(f * 10, by, S) - 0.5) * 3; rLine(fx, by - sh2 * 0.6, fx + f * 6, by - 4, (x, y) => { if (m.at(x, y) === 5) m.set(x, y, 9); }); }
    };
    const furn = [['chair', 270 + R() * 30, 30, 34], ['clock', 360 + R() * 20, 16, 66], ['sofa', 470 + R() * 30, 62, 28], ['frame', 600 + R() * 30, 30, 40], ['chair', 700 + R() * 20, 28, 32]];
    for (const [kind, x, sw2, sh2] of furn) sheet(x, floor - 2, sw2, sh2, kind);
    // floor-standing candelabras
    const cands = [[230 + Math.floor(R() * 20), 62], [560 + Math.floor(R() * 20), 70]];
    for (const [x, ht] of cands) {
      rLine(x, floor - 1, x, floor - ht, m.P(6)); rLine(x + 1, floor - 1, x + 1, floor - ht, m.P(6));
      rLine(x - 6, floor - 1, x, floor - 7, m.P(6)); rLine(x + 7, floor - 1, x + 1, floor - 7, m.P(6));
      rEllipse(x + 0.5, floor - ht * 0.55, 2.5, 1.2, m.P(6));
      const top = floor - ht;
      for (const s of [-1, 1]) for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; m.set(Math.round(x + 0.5 + s * (5 - Math.cos(a) * 5)), Math.round(top + 2 - Math.sin(a) * 4 + 4), 6); }
      for (const ox of [-10, 0, 10]) {
        const cy2 = top + (ox ? 2 : -3);
        rRect(x + ox - 1, cy2 - 1, 4, 2, m.P(6));
        rRect(x + ox, cy2 - 7, 2, 6, m.P(7));
        candles.push({ x: x + ox + 1, y: cy2 - 8, main: !ox });
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let c;
      if (k === 5) {
        let v = 3.6 - (y - (h - 90)) / 60 + (m.at(x + 1, y) === 9 ? 0.9 : 0);
        if (!m.at(x, y - 1)) v += 1.4; else if (!m.at(x - 1, y)) v += 0.8; else if (!m.at(x + 1, y)) v -= 1;
        c = rp(SHEET, v, x, y);
      } else if (k === 9) c = rp(SHEET, 1.6 - (y - (h - 90)) / 80, x, y);
      else if (k === 8) c = WOOD[2];
      else if (k === 6) c = BRASS[!m.at(x - 1, y) || !m.at(x, y - 1) ? 3 : 1];
      else if (k === 7) c = hex(y % 3 ? '#8a7e66' : '#a89a7c');
      else {
        let v = 1.2;
        if (k === 2 || k === 4) v = !m.at(x, y - 1) ? 4.6 : 3;
        else if (k === 3) v = 2.2;
        else if (!m.at(x - 1, y)) v = 2.8; else if (!m.at(x, y - 1)) v = 2.4;
        c = rp(WOOD, v, x, y);
      }
      b.d[y * w + x] = c;
    }
    for (const c of candles) glowInto(b, c.x, c.y + 4, 34, hex('#6a3418'), 0.32, true);
    layers.mid = mkLayer(b.canvas(), 0.36, fy, 'full');
  }

  // ---- near: chandelier, cobwebs from the ceiling, a dangling spider
  const spiders = [];
  {
    const IRON = pal(['#030205', '#07050b', '#0e0b14', '#1a1622', '#2a2434']);
    const WEB = hex('#8c88a4', 120), WEB2 = hex('#8c88a4', 70);
    const w = 768, fy = 0.58, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const ccx = 420 + Math.floor(R() * 60), ccy = 44;
    rLine(ccx, 0, ccx, ccy - 10, m.P(1)); rLine(ccx + 1, 0, ccx + 1, ccy - 10, m.P(1));
    rEllipse(ccx + 0.5, ccy - 8, 4, 3, m.P(1));
    for (const [rx, ry, yy] of [[34, 5, ccy], [22, 4, ccy + 8]]) {
      for (let i = 0; i < 80; i++) { const a = i / 80 * TAU; m.set(Math.round(ccx + 0.5 + Math.cos(a) * rx), Math.round(yy + Math.sin(a) * ry), 1); }
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) / 6 * Math.PI, px = Math.round(ccx + 0.5 - Math.cos(a) * rx), py = Math.round(yy + Math.sin(a) * ry);
        rLine(ccx, ccy - 6, px, py, m.P(1));
        rRect(px - 1, py - 1, 3, 1, m.P(1));
        rRect(px, py - 4 - (k % 2) * 2, 1, 3 + (k % 2) * 2, m.P(2));
        if (k % 3 === 1) candles.push({ x: px + 0.5, y: py - 6 - (k % 2) * 2, near: true });
        for (let j = 0; j < 3; j++) m.set(px, py + 2 + j * 2, 3);
      }
    }
    rDisc(ccx + 0.5, ccy + 14, 2.2, m.P(1)); rLine(ccx, ccy + 16, ccx, ccy + 20, m.P(1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      b.d[y * w + x] = k === 2 ? hex('#6a604e') : k === 3 ? hex('#5a5a78') : rp(IRON, !m.at(x, y - 1) ? 3.6 : !m.at(x - 1, y) ? 2.6 : 1, x, y);
    }
    // cobwebs: fans of radials with sagging spirals
    const web = (cx, r0, a0, a1) => {
      const nr = 7, rad = [];
      for (let i = 0; i < nr; i++) { const a = lerp(a0, a1, i / (nr - 1)) + (R() - 0.5) * 0.1; rad.push(a); rLine(cx, 0, cx + Math.cos(a) * r0, Math.sin(a) * r0, (x, y) => b.set(x, y, WEB)); }
      for (let r = 5; r < r0; r += 4 + R() * 2) for (let i = 0; i + 1 < nr; i++) {
        if (R() < 0.12) continue;
        const ax = cx + Math.cos(rad[i]) * r, ay = Math.sin(rad[i]) * r, bx = cx + Math.cos(rad[i + 1]) * r, by = Math.sin(rad[i + 1]) * r;
        const n = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let s = 0; s <= n; s++) { const f = s / n; b.set(lerp(ax, bx, f), lerp(ay, by, f) + Math.sin(f * Math.PI) * r * 0.08, WEB2); }
      }
    };
    web(60 + R() * 40, 30, 0.15, Math.PI - 0.15);
    web(280 + R() * 60, 22, 0.3, Math.PI - 0.6);
    web(640 + R() * 50, 34, 0.2, Math.PI - 0.2);
    // tattered web strands
    for (let i = 0; i < 9; i++) {
      const x = R() * w, len = 6 + R() * 24;
      for (let k = 0; k < len; k++) b.set(x + Math.sin(k * 0.3) * 0.8, k, k > len * 0.7 ? WEB2 : WEB);
    }
    for (let i = 0; i < 2; i++) spiders.push({ x: Math.floor(R() * w), len: 30 + R() * 30, p: R() * TAU });
    layers.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const flames = flameFrames(S + 50, 3, 6);
  const glowC = glowSprite(14, '#ff9a40', 0.3), glowS = glowSprite(6, '#ffc060', 0.5);
  const eyeG = glowSprite(3, '#ff3020', 0.7);
  const motes = [];
  for (let i = 0; i < 26; i++) motes.push({ x: R() * (W + 20), y: R() * (H + 20), p: R() * TAU, f: 0.12 + R() * 0.25, v: 1 + R() * 3 });
  // lightning: a double flash every few seconds, skipping some cycles
  const flash = t => {
    const P = 7.3, k = Math.floor(t / P), u = t - k * P - h2(k, 1, S) * 3;
    if (h2(k, 2, S) < 0.3 || u < 0) return 0;
    if (u < 0.08) return 1;
    if (u < 0.18) return 0.2;
    if (u < 0.26) return 0.85;
    return u < 1.1 ? 0.85 * Math.pow(1 - (u - 0.26) / 0.84, 2) : 0;
  };
  // draughts: candles gutter now and then
  const gust = t => { const k = Math.floor(t / 4.1), u = t - k * 4.1 - h2(k, 5, S) * 2; return h2(k, 6, S) < 0.45 && u > 0 && u < 0.6 ? 0.35 + 0.3 * Math.sin(u * 30) : 1; };

  return {
    fog: '#1e1a30',
    back(g, cx, cy, t) {
      const fa = flash(t), gu = gust(t);
      blit(g, layers.wall, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(0.75 + 0.2 * Math.sin(t * 0.4) + fa * 0.8, 0, 1);
      blit(g, layers.ray, E, cx, cy, t);
      if (fa > 0) { g.globalAlpha = fa; blit(g, layers.flash, E, cx, cy, t); }
      // portrait eyes: glow, blink, glance toward the middle of the screen
      for (const e of eyes) {
        const on = Math.sin(t * 0.23 + e.p) > -0.85 && wrapP(t * 0.37 + e.p, 1) > 0.05;
        if (!on) continue;
        onScreen(layers.wall, E, cx, cy, t, e.x, e.y, 6, (x, y) => {
          const lk = x + e.dx / 2 < W / 2 ? 1 : 0;
          g.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2 + e.p);
          g.drawImage(eyeG, Math.floor(x) - 3, Math.floor(y) - 3); g.drawImage(eyeG, Math.floor(x) + e.dx - 3, Math.floor(y) - 3);
          g.globalAlpha = 1;
          g.fillStyle = '#ffb040';
          g.fillRect(Math.floor(x) + lk - 1 + 1, Math.floor(y), 1, 1); g.fillRect(Math.floor(x) + e.dx + lk, Math.floor(y), 1, 1);
        });
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.mid, E, cx, cy, t);
      blit(g, layers.near, E, cx, cy, t);
      // spiders on their threads
      g.fillStyle = '#2a2638';
      for (const s of spiders) {
        const len = Math.floor(s.len + Math.sin(t * 0.5 + s.p) * 12);
        onScreen(layers.near, E, cx, cy, t, s.x, 0, 4, (x, y) => {
          g.globalAlpha = 0.5; g.fillRect(Math.floor(x), Math.floor(y), 1, len);
          g.globalAlpha = 1; g.fillStyle = '#0a0810'; g.fillRect(Math.floor(x) - 1, Math.floor(y) + len, 3, 2); g.fillRect(Math.floor(x) - 2, Math.floor(y) + len + 1, 5, 1);
          g.fillStyle = '#2a2638';
        });
      }
      // candle flames and their light
      candles.forEach((c, i) => {
        const L = c.near ? layers.near : layers.mid;
        onScreen(L, E, cx, cy, t, c.x, c.y, 16, (x, y) => {
          const fr = flames[(Math.floor(t * 9) + i) & 3];
          if (gu > 0.6 || i % 2) g.drawImage(fr, Math.floor(x) - 1, Math.floor(y) - 4);
          else { g.fillStyle = '#ff8a20'; g.fillRect(Math.floor(x), Math.floor(y), 1, 2); }
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = clamp((0.5 + 0.15 * Math.sin(t * 9 + i * 2) + 0.08 * Math.sin(t * 23 + i)) * gu, 0, 1);
          if (c.near) g.drawImage(glowS, Math.floor(x) - 6, Math.floor(y) - 6);
          else if (c.main) g.drawImage(glowC, Math.floor(x) - 14, Math.floor(y) - 12);
          else g.drawImage(glowS, Math.floor(x) - 6, Math.floor(y) - 6);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        });
      });
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      g.fillStyle = '#b4b8d8';
      for (const m of motes) {
        const x = Math.floor(wrapP(m.x + Math.sin(t * m.f + m.p) * 18 + t * m.v - cx * 1.08, sw2)) - 10;
        const y = Math.floor(wrapP(m.y + Math.sin(t * m.f * 1.3 + m.p * 2) * 10 + t * 1.5 - cy * 1.08, sh2)) - 10;
        g.globalAlpha = clamp(0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.8 + m.p)), 0, 1);
        g.fillRect(x, y, 1, 1);
      }
      const fa = flash(t);
      if (fa > 0.05) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fa * 0.07;
        g.fillStyle = '#8090d0';
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// JULY_OUT — fireworks night over the fairground

function buildJulyOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {}, bulbL = [];
  const SKY = pal(['#03040c', '#050714', '#080a1c', '#0b0f25', '#0f142e', '#141a38', '#1b2042', '#24264a', '#2e2c50', '#3a3254',
    '#483856', '#583e56', '#6a4654']);
  const stops = [[0, 11.6], [16, 10.2], [40, 8.4], [75, 6.4], [120, 4.6], [180, 3], [260, 1.6], [400, 0.5]];
  const BUNT = [pal(['#6a1424', '#a02838']), pal(['#7c7c90', '#bcbccc']), pal(['#16245e', '#2a429a'])];

  // ---- sky: navy fading to a warm haze from the fair, sparse stars, smoke banks
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  {
    const b = new Buf(sw, sh), smoke = fbm2(S + 2, 10, sw, 18, 3);
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y, bv = interp(stops, d);
      const band = Math.max(0, 1 - Math.abs(d - 120) / 40);
      for (let x = 0; x < sw; x++) {
        const sm = clamp((smoke(x, y) - 0.5) * 3, 0, 1) * band;
        b.d[y * sw + x] = rp(SKY, bv + sm * 1.6, x, y);
      }
    }
    const STAR = pal(['#2e3a66', '#6a78b0', '#c8d4ff']);
    for (let i = 0; i < (sw * sh) / 300; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), d = sh - 1 - y;
      if (d < 90) continue;
      const k = R();
      b.set(x, y, STAR[k < 0.7 ? 0 : k < 0.94 ? 1 : 2]);
    }
    layers.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }
  const fw = makeFireworks(S + 9, 7, {
    pmin: 2.7, pmax: 4.3, skip: 0.08, gr: 28, size: 1.2,
    place: (i, k, a, b2, cx, cy) => {
      const oy = layerY(layers.sky, E, cy) + sh - 1;
      const bx = wrapP(a * 977 + i * 160 - cx * 0.05, W + 120) - 60, by = oy - (112 + b2 * 76);
      return [bx, by, bx + (a - 0.5) * 30, oy - 50];
    },
  });

  // ---- far: treeline, a little town, a water tower
  {
    const P = pal(['#090c1c', '#0d1124', '#11162c', '#161c35', '#1c233f', '#242c4a']);
    const WIN = [hex('#c08a40'), hex('#7a5a34')];
    const w = 768, h = 110, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 34, 5, 4);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    for (let i = 0; i < 140; i++) { const x = R() * w; rEllipse(x, top[Math.floor(x)] - 2 - R() * 3, 3 + R() * 6, 3 + R() * 4, m.P(1)); }
    const wins = [];
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(R() * w), wd = 8 + Math.floor(R() * 12), ht = 6 + Math.floor(R() * 8), by = Math.floor(top[x]) + 2;
      rRect(x, by - ht, wd, ht + 2, m.P(1));
      rPoly([[x - 1, by - ht], [x + wd + 1, by - ht], [x + wd / 2, by - ht - wd * 0.45]], m.P(1));
      if (R() < 0.7) wins.push([x + 2 + Math.floor(R() * (wd - 4)), by - ht + 2]);
    }
    const st = Math.floor(R() * w), sb = Math.floor(top[st]) + 2;
    rRect(st, sb - 18, 8, 20, m.P(1)); rPoly([[st - 1, sb - 18], [st + 9, sb - 18], [st + 4, sb - 34]], m.P(1));
    const wt = wrapP(st + 300, w), wb = Math.floor(top[wt]);
    for (const s of [-1, 1]) rLine(wt + s * 5, wb, wt + s * 3, wb - 22, m.P(1));
    rLine(wt - 4, wb - 10, wt + 4, wb - 16, m.P(1)); rLine(wt + 4, wb - 10, wt - 4, wb - 16, m.P(1));
    rEllipse(wt + 0.5, wb - 27, 8, 6, m.P(1)); rPoly([[wt - 8, wb - 30], [wt + 9, wb - 30], [wt + 0.5, wb - 37]], m.P(1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      let v = 1.4;
      if (!m.at(x, y - 1)) v = 3.6; else if (!m.at(x, y - 2)) v = 2.6;
      v += clamp((y - 30) / 40, 0, 1) * 1.6;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    for (const [x, y] of wins) { b.set(x, y, WIN[0]); b.set(x, y + 1, WIN[1]); }
    b.set(st + 3, sb - 12, WIN[0]); b.set(st + 4, sb - 12, WIN[0]);
    layers.far = mkLayer(b.canvas(), 0.07, 0.1, 'bottom');
  }

  // ---- mid: the fair — big-top tent, striped booths, flag poles, the ferris wheel legs
  const wheel = { x: 0, y: 0 };
  {
    const P = pal(['#06081a', '#0a0d22', '#0f132b', '#151a35', '#1d2340', '#262e4e']);
    const RED = pal(['#2a0a14', '#45101e', '#62182a', '#842236', '#a83040']), WHT = pal(['#2c2c40', '#46465c', '#646478', '#868698', '#a8a8b8']);
    const WARM = pal(['#2e140a', '#5a3016', '#8e5426', '#c4843a', '#ecb460']);
    const w = 768, h = 170, gy = 118, b = new Buf(w, h), m = new Mask(w, h);
    const lights = [];
    for (let y = gy; y < h; y++) for (let x = 0; x < w; x++) b.d[y * w + x] = rp(P, 2.2 - (y - gy) / 30 + (y === gy ? 1.6 : 0), x, y);
    // ferris wheel A-frame (the wheel itself is an animated sprite)
    wheel.x = 200 + Math.floor(R() * 40); wheel.y = 56;
    for (const s of [-1, 1]) { rSeg(wheel.x + s * 2, wheel.y, wheel.x + s * 30, gy, 1.2, 1.6, m.P(1)); rLine(wheel.x + s * 8, wheel.y + 20, wheel.x + s * 19, gy - 20, m.P(1)); }
    rRect(wheel.x - 34, gy - 8, 69, 8, m.P(1));
    rRect(wheel.x - 10, gy - 14, 21, 6, m.P(1));
    // striped canopy helper: vertical stripes, scalloped valance
    const stripe = (x, y, P1, P2, u) => (Math.floor(u) % 2 ? P1 : P2);
    const booth = (x0, wd, ht) => {
      const ry = gy - ht, peak = ry - wd * 0.28;
      for (let y = ry; y < gy; y++) for (let x = x0; x < x0 + wd; x++) b.set(x, y, rp(P, x === x0 ? 3 : 1.4, x, y));
      const cy0 = ry + 4, ch = ht - 10;
      for (let y = cy0; y < cy0 + ch; y++) for (let x = x0 + 3; x < x0 + wd - 3; x++) b.set(x, y, rp(WARM, 2.1 - (y - cy0) / ch * 2.4 - Math.abs(x + 0.5 - x0 - wd / 2) / wd * 1.4, x, y));
      for (let x = x0 + 5; x < x0 + wd - 5; x += 3) { const ph = 2 + Math.floor(h2(x, ry, S) * 4); for (let j = 0; j < ph; j++) b.set(x, cy0 + ch - 1 - j, BUNT[(x >> 1) % 3][j ? 0 : 1]); }
      for (let x = x0 + 2; x < x0 + wd - 2; x++) { b.set(x, cy0 + ch, P[4]); b.set(x, cy0 + ch + 1, P[1]); }
      lights.push([x0 + wd / 2, cy0 + ch / 2, wd]);
      rPoly([[x0 - 3, ry + 1], [x0 + wd + 3, ry + 1], [x0 + wd / 2, peak]], (x, y) => {
        const u = (x + 0.5 - (x0 + wd / 2)) / Math.max(1, y - peak + 1) * 4 + 50;
        const C = stripe(x, y, RED, WHT, u);
        b.set(x, y, rp(C, 2.4 - (x - x0) / wd * 1.4 + (y === Math.floor(peak) + 1 ? 1 : 0), x, y));
      });
      for (let x = x0 - 3; x < x0 + wd + 3; x++) {
        const sc = Math.round(1.5 + 1.5 * Math.sin((x - x0) * 0.9));
        for (let j = 0; j < sc + 2; j++) b.set(x, ry + 1 + j, rp(Math.floor((x - x0 + 30) / 4) % 2 ? RED : WHT, 2.2 - j * 0.4, x, ry + 1 + j));
      }
      rLine(x0 + wd / 2, peak, x0 + wd / 2, peak - 6, b.P(P[4]));
      rPoly([[x0 + wd / 2 + 1, peak - 6], [x0 + wd / 2 + 6, peak - 4.5], [x0 + wd / 2 + 1, peak - 3]], b.P(BUNT[(x0 >> 3) % 3][1]));
      return [x0 + wd / 2, peak - 6];
    };
    // big top: conical striped roof over a drum
    const bt = wrapP(wheel.x + 220 + Math.floor(R() * 40), w), bw = 120, bdr = gy - 30, bpk = bdr - 46;
    for (let y = bdr; y < gy; y++) for (let x = bt - bw / 2; x < bt + bw / 2; x++) {
      const u = (x + 0.5 - bt) / (bw / 2), C = Math.floor((u + 2) * 7) % 2 ? RED : WHT;
      b.set(x, y, rp(C, 1.8 - u * 1.2 - (y - bdr) / 30, x, y));
    }
    for (let y = gy - 22; y < gy; y++) for (let x = bt - 8; x < bt + 8; x++) b.set(x, y, rp(WARM, 3 - (y - (gy - 22)) / 10, x, y));
    lights.push([bt, gy - 12, 30]);
    rPoly([[bt - bw / 2 - 6, bdr + 2], [bt + bw / 2 + 6, bdr + 2], [bt + 3, bpk], [bt - 3, bpk]], (x, y) => {
      const u = (x + 0.5 - bt) / Math.max(4, (y - bpk) * 1.4 + 6);
      const C = Math.floor((Math.atan(u) + 2) * 6.5) % 2 ? RED : WHT;
      b.set(x, y, rp(C, 2.7 - (x - bt) / bw * 2.4 - (y - bpk) / 60, x, y));
    });
    for (let x = bt - bw / 2 - 6; x < bt + bw / 2 + 6; x++) { const sc = Math.round(2 + 2 * Math.abs(Math.sin((x - bt) * 0.35))); for (let j = 0; j < sc; j++) b.set(x, bdr + 2 + j, rp(RED, 3.4 - j * 0.6, x, bdr + 2 + j)); }
    rLine(bt, bpk, bt, bpk - 10, b.P(P[5]));
    rPoly([[bt + 1, bpk - 10], [bt + 9, bpk - 8], [bt + 1, bpk - 6]], b.P(BUNT[0][1]));
    const tops = [[bt, bpk - 10]];
    for (let k = 0; k < 6; k++) {
      const x0 = wrapP(wheel.x + 50 + k * 34 + (k > 2 ? 150 : 0) + Math.floor(R() * 8), w), wd = 22 + Math.floor(R() * 8);
      if (Math.abs(wrapD(x0 - bt, w)) < bw / 2 + 30 || Math.abs(wrapD(x0 + wd / 2 - wheel.x, w)) < 38) continue;
      tops.push(booth(x0, wd, 24 + Math.floor(R() * 8)));
    }
    // flag poles carrying light strings over the midway
    for (let k = 0; k < 7; k++) {
      const x = wrapP(wheel.x - 90 + k * 110 + Math.floor(R() * 20), w);
      rRect(x, gy - 62, 2, 62, m.P(1));
      tops.push([x + 1, gy - 62]);
    }
    tops.sort((a, c) => a[0] - c[0]);
    for (let i = 0; i + 1 < tops.length; i++) {
      const [x0, y0] = tops[i], [x1, y1] = tops[i + 1];
      if (x1 - x0 > 130 || x1 - x0 < 16) continue;
      bulbs(b, x0, y0, x1, y1, 7 + (x1 - x0) * 0.08, 6, P[3], [hex('#a06a30'), hex('#ffe0a0')], bulbL, 'mid');
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      b.d[y * w + x] = rp(P, !m.at(x - 1, y) ? 5 : !m.at(x, y - 1) ? 4.4 : 3, x, y);
    }
    for (const [lx, ly, lw] of lights) glowInto(b, lx, ly, lw * 0.8, hex('#8a4a1c'), 0.3, true);
    layers.mid = mkLayer(b.canvas(), 0.15, 0.2, 'bottom');
  }
  // the wheel: 12 frames covering 1/8 turn (8 gondolas), chasing bulbs baked in
  const wheelF = [];
  {
    const Rw = 48, sz = 2 * Rw + 21, c = sz / 2, NF = 12;
    const ST = pal(['#0e1230', '#1e2648', '#2e3a64', '#46548a']);
    const GON = [pal(['#3a0e18', '#7a1e2e']), pal(['#404054', '#8a8aa0']), pal(['#101c4a', '#24408a'])];
    const BUL = [hex('#ffe8b0'), hex('#ff6a5a'), hex('#7aa0ff')];
    for (let f = 0; f < NF; f++) {
      const b = new Buf(sz, sz, false), a0 = f / NF * TAU / 8;
      const P1 = (x, y) => b.set(x, y, ST[2]), P0 = (x, y) => b.set(x, y, ST[1]);
      for (let i = 0; i < 16; i++) { const a = a0 + i * TAU / 16; rLine(c, c, c + Math.cos(a) * Rw, c + Math.sin(a) * Rw, P0); }
      for (let i = 0; i < 240; i++) { const a = i / 240 * TAU; P1(c + Math.cos(a) * Rw, c + Math.sin(a) * Rw); P0(c + Math.cos(a) * (Rw - 1), c + Math.sin(a) * (Rw - 1)); P0(c + Math.cos(a) * (Rw - 7), c + Math.sin(a) * (Rw - 7)); }
      for (let i = 0; i < 32; i++) {
        const a = a0 + i * TAU / 32, a2 = a0 + (i + 1) * TAU / 32, r1 = i % 2 ? Rw - 7 : Rw - 1, r2 = i % 2 ? Rw - 1 : Rw - 7;
        rLine(c + Math.cos(a) * r1, c + Math.sin(a) * r1, c + Math.cos(a2) * r2, c + Math.sin(a2) * r2, P0);
      }
      rDisc(c, c, 4.5, b.P(ST[3])); rDisc(c, c, 2, b.P(ST[1]));
      for (let i = 0; i < 32; i++) {
        const a = a0 + i * TAU / 32, x = Math.floor(c + Math.cos(a) * (Rw + 1)), y = Math.floor(c + Math.sin(a) * (Rw + 1));
        const on = (i + f) % 3, col = on === 0 ? BUL[(i >> 1) % 3] : on === 1 ? BUL[0] : 0;
        if (col) { glowInto(b, x + 0.5, y + 0.5, 3.2, col, 0.5); b.set(x, y, col); }
        else b.set(x, y, hex('#5a4a40'));
      }
      for (let i = 0; i < 8; i++) {
        const a = a0 + i * TAU / 8, px = Math.round(c + Math.cos(a) * Rw), py = Math.round(c + Math.sin(a) * Rw), G = GON[i % 3];
        rLine(px, py, px, py + 3, P1);
        rRect(px - 3, py + 3, 7, 1, b.P(G[1]));
        rRect(px - 3, py + 4, 7, 4, b.P(G[0]));
        b.set(px - 2, py + 5, hex('#c0904a')); b.set(px + 2, py + 5, hex('#c0904a'));
        rRect(px - 3, py + 8, 7, 1, b.P(G[1]));
      }
      wheelF.push(b.canvas());
    }
  }

  // ---- crowd: silhouettes watching, picnic tables, sparklers
  const sparklers = [];
  {
    const P = pal(['#03040a', '#06070f', '#0a0c18', '#121628', '#1c2240', '#2a3058']);
    const w = 768, h = 100, base = 62, m = new Mask(w, h), b = new Buf(w, h);
    const hands = [];
    for (let k = 0; k < 4; k++) { const x0 = k * 192 + R() * 30; crowd(m, x0, x0 + 90 + R() * 50, base, R, 1.9, 1, hands); }
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(k * 256 + 120 + R() * 80), ty = base + 2;
      rRect(x - 20, ty - 9, 41, 3, m.P(2));
      for (const s of [-1, 1]) { rLine(x + s * 14, ty - 6, x + s * 18, ty + 6, m.P(2)); rLine(x + s * 13, ty - 6, x + s * 9, ty + 6, m.P(2)); }
      rRect(x - 24, ty - 2, 49, 2, m.P(2));
      crowd(m, x - 16, x + 18, ty - 1, R, 1.3, 1, null);
    }
    for (const [hx, hy] of hands) if (R() < 0.6) sparklers.push({ x: hx, y: hy, p: R() * TAU });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.at(x, y);
      if (y >= base) { b.d[y * w + x] = rp(P, 1.5 - (y - base) / 20 + (y === base ? 0.5 : 0), x, y); continue; }
      if (!k) continue;
      let v = 0.8;
      if (!m.at(x, y - 1)) v = 3.6; else if (!m.at(x, y - 2)) v = 2.4; else if (!m.at(x - 1, y) || !m.at(x + 1, y)) v = 1.8;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    layers.crowd = mkLayer(b.canvas(), 0.32, 0.34, 'bottom');
  }

  // ---- near: light strings and bunting hanging into the top of the frame
  {
    const w = 768, fy = 0.55, h = fullH(E, fy), b = new Buf(w, h);
    for (let k = 0; k < 2; k++) {
      const x0 = k * 384 + Math.floor(R() * 60), x1 = x0 + 250 + Math.floor(R() * 60);
      bunting(b, x0, -2, x1, -3, 26 + R() * 10, BUNT, hex('#1a1a2a'), 9, 6, 8);
      bulbs(b, x0 + 30, -2, x1 + 70, -2, 46 + R() * 12, 11, hex('#14141e'), [hex('#a0601c'), hex('#ffe6a8')], bulbL, 'near');
    }
    layers.near = mkLayer(b.canvas(), 0.55, fy, 'full');
  }

  const glowB = ditherGlow(4, '#ffc870', 0.5), glowN = ditherGlow(6, '#ffc870', 0.45), glowW = ditherGlow(30, '#ffb060', 0.2);
  const smokes = [
    { cv: fogStrip(S + 31, 512, 30, '#4a4e6e', 0.34, 6), y: 40, v: 2.5, f: 0.4 },
    { cv: fogStrip(S + 32, 512, 16, '#5a5a78', 0.3, 9), y: 168, v: -3, f: 1.15 },
  ];
  const sparks = [];
  for (let i = 0; i < 20; i++) sparks.push({ x: R() * (W + 20), y: R() * (H + 20), p: R(), r: 0.25 + R() * 0.4, v: 8 + R() * 14, c: i % 3 ? '#ffb850' : '#ffe8b0' });

  return {
    fog: '#2a2c4a',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      fw(g, t, cx, cy);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      const wf = wheelF[Math.floor(t * 4) % wheelF.length], r = wf.width >> 1;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.4;
      onScreen(layers.mid, E, cx, cy, t, wheel.x, wheel.y, 70, (x, y) => g.drawImage(glowW, Math.floor(x) - 30, Math.floor(y) - 30));
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      onScreen(layers.mid, E, cx, cy, t, wheel.x, wheel.y, r + 2, (x, y) => g.drawImage(wf, Math.floor(x) - r, Math.floor(y) - r));
      g.globalCompositeOperation = 'lighter';
      bulbL.forEach((l, i) => {
        if (l.L !== 'mid' || i % 2) return;
        g.globalAlpha = 0.45 + 0.2 * Math.sin(t * 3 + l.p);
        onScreen(layers.mid, E, cx, cy, t, l.x, l.y, 6, (x, y) => g.drawImage(glowB, Math.floor(x) - 4, Math.floor(y) - 4));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.crowd, E, cx, cy, t);
      for (const s of sparklers) {
        onScreen(layers.crowd, E, cx, cy, t, s.x, s.y, 6, (x, y) => {
          for (let k = 0; k < 5; k++) {
            const a = h2(k, Math.floor(t * 18), s.p * 99) * TAU, d = 1 + h2(k, Math.floor(t * 18) + 3, s.p * 99) * 4;
            g.fillStyle = k % 2 ? '#fff4c0' : '#ffb040';
            g.fillRect(Math.floor(x + Math.cos(a) * d), Math.floor(y + Math.sin(a) * d), 1, 1);
          }
          g.fillStyle = '#ffffff'; g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
        });
      }
      blit(g, layers.near, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      bulbL.forEach((l, i) => {
        if (l.L !== 'near') return;
        g.globalAlpha = 0.5 + 0.15 * Math.sin(t * 2.3 + l.p);
        onScreen(layers.near, E, cx, cy, t, l.x, l.y, 8, (x, y) => g.drawImage(glowN, Math.floor(x) - 6, Math.floor(y) - 6));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
    front(g, cx, cy, t) {
      const dy = (E.maxCamY - cy) * 1.0;
      for (const s of smokes) strip(g, s.cv, s.v * t + cx * s.f, s.y + dy * (s.f > 1 ? 1 : 0.3));
      const sw2 = W + 20, sh2 = H + 20;
      for (const s of sparks) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.6) continue;
        const x = Math.floor(wrapP(s.x + Math.sin(t * 1.3 + s.p * 9) * 6 - cx * 1.15, sw2)) - 10;
        const y = Math.floor(wrapP(s.y - t * s.v - cy * 1.15, sh2)) - 10;
        g.globalAlpha = 0.9 * Math.sin(ph / 0.6 * Math.PI);
        g.fillStyle = s.c; g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// JULY_IN — the fireworks warehouse

function buildJulyIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const HAZY = hex('#c49a22'), HAZK = hex('#16120c');
  const door = { x: 0, y: 0, w: 108, h: 0, sx: -999, sy: 0 };

  // ---- back wall: corrugated steel, columns, girts, roof trusses, the loading door
  {
    const ST = pal(['#06080c', '#0a0d13', '#0e121a', '#131821', '#191f2a', '#202734', '#29313f', '#333c4c', '#3f4a5c']);
    const NIGHT = pal(['#04071a', '#081024', '#0d1830', '#14223e', '#1c2e4e']);
    const RED = pal(['#3a0c0c', '#6a1414', '#9a2020', '#c43a2a']);
    const w = 768, fy = 0.14, h = fullH(E, fy), b = new Buf(w, h);
    const tex = noise2(S + 1, 96, w, 20), rust = fbm2(S + 2, 16, w, 30, 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const rib = x % 8;
      let v = 2.5 + (rib < 2 ? 1.3 : rib < 4 ? 0.4 : rib === 7 ? -1.2 : -0.4) + (tex(x, y) - 0.5) * 0.6;
      v -= clamp((rust(x, y) - 0.55) * 5, 0, 1.4);
      v -= clamp((40 - y) / 40, 0, 1) * 1.5;
      v -= clamp((y - (h - 50)) / 50, 0, 1) * 0.8;
      b.d[y * w + x] = rp(ST, v, x, y);
    }
    // girts and columns
    for (let gy = h - 70; gy > 30; gy -= 72) for (let x = 0; x < w; x++) { b.set(x, gy, ST[7]); b.set(x, gy + 1, ST[5]); b.set(x, gy + 2, ST[4]); b.set(x, gy + 3, ST[1]); }
    for (let k = 0; k < 4; k++) {
      const cx = k * 192 + 20;
      for (let y = 0; y < h; y++) for (let i = 0; i < 12; i++) {
        const fl = i < 2 || i > 9;
        b.set(cx + i, y, rp(ST, fl ? (i === 0 ? 6.4 : i === 1 ? 5 : i === 10 ? 2.4 : 1.2) : 2.2 - (i - 2) * 0.15, cx + i, y));
      }
      for (let y = h - 70; y > 0; y -= 72) for (let i = -2; i < 14; i++) b.set(cx + i, y + 6, ST[6]);
    }
    // roof trusses along the top
    const tr = (x, y) => b.set(x, y, ST[1]);
    for (let x = 0; x < w; x++) { tr(x, 4); tr(x, 5); tr(x, 22); tr(x, 23); b.set(x, 24, ST[5]); }
    for (let x = 0; x < w; x += 24) { rLine(x, 5, x + 12, 22, tr); rLine(x + 12, 22, x + 24, 5, tr); rLine(x + 1, 5, x + 13, 22, tr); }
    // loading door opening (night outside), half-raised shutter, hazard jambs, bump rail
    door.x = 470 + Math.floor(R() * 40); door.h = Math.min(118, h - 40); door.y = h - door.h;
    const sh = Math.round(door.h * 0.34);
    const tl = ridge(S + 6, door.w, door.h - 22, 4, 4);
    for (let y = door.y; y < h; y++) for (let x = door.x; x < door.x + door.w; x++) {
      const lx = x - door.x, ly = y - door.y;
      let c;
      if (ly < sh) { const sl = ly % 5; c = rp(ST, sl === 0 ? 2.2 : sl === 4 ? 1 : 3.6 - (lx / door.w) * 0.8, x, y); if (ly === sh - 1) c = ST[7]; }
      else if (ly >= tl[lx]) c = rp(NIGHT, 0.4 + (h2(lx >> 2, 1, S) < 0.2 && ly < tl[lx] + 3 ? 1 : 0), x, y);
      else c = rp(NIGHT, 0.8 + (ly - sh) / (door.h - sh) * 3.4, x, y);
      b.set(x, y, c);
    }
    for (let i = 0; i < 26; i++) { const x = door.x + 2 + Math.floor(R() * (door.w - 4)), y = door.y + sh + 2 + Math.floor(R() * 40); if (y < door.y + tl[x - door.x] - 2) b.set(x, y, hex(R() < 0.3 ? '#c8d0ff' : '#5a6aa0')); }
    for (let x = door.x + 70; x < door.x + 96; x++) for (let y = door.y + door.h - 30; y < h; y++) b.set(x, y, rp(ST, x === door.x + 70 ? 3 : 0.4, x, y));
    for (let y = door.y - 8; y < h; y++) for (let s = 0; s < 2; s++) for (let i = 0; i < 8; i++) {
      const x = s ? door.x + door.w + i : door.x - 8 + i;
      if (y < door.y && (s ? i > 8 - (y - door.y + 8) : i < (door.y - y))) continue;
      b.set(x, y, ((x + y) >> 2) % 2 ? HAZY : HAZK);
    }
    for (let x = door.x - 8; x < door.x + door.w + 8; x++) for (let j = 0; j < 4; j++) b.set(x, door.y - 12 + j, ((x - j) >> 2) % 2 ? HAZY : HAZK);
    // signs: warning diamond, no-flame roundel, extinguisher
    const sign = (x, y) => {
      for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
        const d = Math.abs(i) + Math.abs(j);
        if (d > 8) continue;
        b.set(x + i, y + j, d > 6 ? HAZK : HAZY);
      }
      for (let j = -4; j <= 1; j++) b.set(x, y + j, HAZK); b.set(x, y + 3, HAZK);
    };
    const roundel = (x, y) => {
      rDisc(x + 0.5, y + 0.5, 8, b.P(RED[2])); rDisc(x + 0.5, y + 0.5, 6, b.P(hex('#b8b4a8')));
      spr(b, x - 2, y - 4, ['..k..', '.kk..', '.kkk.', 'kkkkk', 'kk.kk', '.kkk.'], { k: hex('#2a2018') });
      rLine(x - 4, y - 4, x + 4, y + 4, b.P(RED[2])); rLine(x - 4, y - 3, x + 3, y + 4, b.P(RED[2]));
    };
    for (let k = 0; k < 4; k++) {
      const x = k * 192 + 72 + Math.floor(R() * 60);
      if (Math.abs(wrapD(x - door.x - door.w / 2, w)) < 80) continue;
      if (k % 2) sign(x, h - 116); else roundel(x, h - 116);
      const ex = x + 30;
      rRect(ex - 2, h - 54, 5, 12, (xx, yy) => b.set(xx, yy, rp(RED, xx === ex - 2 ? 3.4 : 2 - (xx - ex) * 0.5, xx, yy)));
      rRect(ex - 1, h - 59, 3, 3, b.P(ST[1])); rLine(ex + 2, h - 58, ex + 5, h - 52, b.P(ST[1]));
    }
    layers.wall = mkLayer(b.canvas(), 0.14, fy, 'full');
  }

  // ---- racks: pallet racking stacked with crates, tube boxes and rockets
  {
    const UP = pal(['#0a1224', '#121e38', '#1c2c4e', '#283c66', '#364e80']);
    const BEAM = pal(['#2a1006', '#4a1e0a', '#6e2e10', '#944016', '#b45620']);
    const CARD = pal(['#1e140c', '#2e2014', '#42301e', '#58422a', '#6e5636', '#866a44']);
    const WOOD = pal(['#1a1008', '#2a1a0e', '#3e2a16', '#56391e', '#6e4c28']);
    const WR = [pal(['#3a0a10', '#6a1420', '#962234', '#bc3646']), pal(['#0c1638', '#16285e', '#24408a', '#3a5cb0']), pal(['#3a3a44', '#62626e', '#8a8a96', '#b4b4be'])];
    const w = 768, fy = 0.32, h = fullH(E, fy), b = new Buf(w, h);
    const floor = h - 18;
    const box = (x, by, bw, bh, kind) => {
      for (let y = by - bh; y < by; y++) for (let i = 0; i < bw; i++) {
        let v = 2.8 - i / bw * 1.2 - (y - (by - bh)) / bh * 0.6;
        if (i === 0) v = 4.6; else if (y === by - bh) v = 4.2; else if (i === bw - 1) v = 0.6;
        b.set(x + i, y, rp(CARD, v, x + i, y));
      }
      const mid = Math.round(by - bh / 2);
      if (kind === 0) for (let y = mid - 2; y <= mid + 1; y++) for (let i = 1; i < bw - 1; i++) b.set(x + i, y, ((x + i + y) >> 1) % 2 ? HAZY : HAZK);
      else if (kind === 1) { const cx = Math.round(x + bw / 2); spr(b, cx - 2, mid - 2, ['..r..', 'rrrrr', '.rrr.', 'r...r'], { r: WR[(x >> 2) % 2][2] }); }
      else if (kind === 2) for (let y = mid - 2; y <= mid + 2; y++) for (let i = 2; i < Math.min(bw - 2, 9); i++) b.set(x + i, y, y === mid - 2 || i === 2 ? hex('#8a8a86') : (y + i) % 3 ? hex('#6a6a66') : hex('#2a2a2a'));
      for (let y = by - bh; y < by - bh + 2; y++) b.set(Math.round(x + bw / 2), y, CARD[5]);
    };
    const crate = (x, by, cw, ch, load) => {
      for (let y = by - ch; y < by; y++) for (let i = 0; i < cw; i++) {
        const ly = y - (by - ch);
        let v = 2.6 - i / cw;
        if (ly % 5 === 4) v = 0.6;
        if (i < 2 || i >= cw - 2) v = i === 0 ? 4.2 : i === cw - 1 ? 0.8 : 3;
        if (ly === 0) v = 4;
        b.set(x + i, y, rp(WOOD, v + (h2(x + i >> 2, ly / 5 | 0, S) - 0.5) * 0.6, x + i, y));
      }
      if (!load) return;
      const n = Math.floor((cw - 4) / 5);
      for (let k = 0; k < n; k++) {
        const rx = x + 3 + k * 5, C = WR[(k + (x >> 3)) % 3], ht = 6 + Math.floor(h2(rx, by, S) * 8);
        if (load === 1) {
          // fins poking up: tube tail with flared fins
          for (let y = by - ch - ht; y < by - ch; y++) { b.set(rx, y, C[3]); b.set(rx + 1, y, C[2]); b.set(rx + 2, y, C[1]); }
          rPoly([[rx - 1.5, by - ch - ht + 5], [rx, by - ch - ht + 1], [rx, by - ch - ht + 5]], b.P(C[3]));
          rPoly([[rx + 3, by - ch - ht + 1], [rx + 4.5, by - ch - ht + 5], [rx + 3, by - ch - ht + 5]], b.P(C[1]));
          b.set(rx + 1, by - ch - ht - 1, hex('#1a1410'));
        } else {
          // nose cones up
          for (let y = by - ch - ht + 4; y < by - ch; y++) { b.set(rx, y, C[3]); b.set(rx + 1, y, C[2]); b.set(rx + 2, y, C[1]); }
          b.set(rx + 1, by - ch - ht + 1, C[3]); b.set(rx, by - ch - ht + 3, C[3]); b.set(rx + 1, by - ch - ht + 2, C[2]); b.set(rx + 1, by - ch - ht + 3, C[2]); b.set(rx + 2, by - ch - ht + 3, C[1]);
          for (let y = by - ch - ht + 6; y < by - ch; y += 3) b.set(rx + 1, y, WR[2][3]);
        }
      }
    };
    const tubes = (x, by, n) => {
      for (let k = 0; k < n; k++) {
        const tx = x + k * 6, ht = 15 + Math.floor(h2(tx, by, S) * 9), C = WR[(k + (x >> 2)) % 3], C2 = WR[(k + (x >> 2) + 1) % 3];
        for (let y = by - ht; y < by; y++) for (let i = 0; i < 5; i++) {
          const ly = y - (by - ht), band = ly > 2 && ly < 6;
          b.set(tx + i, y, (band ? C2 : C)[i === 0 ? 3 : i === 4 ? 0 : i === 1 ? 2 : 1]);
        }
        b.set(tx + 2, by - ht + 4, WR[2][3]);
        for (let i = 0; i < 5; i++) { b.set(tx + i, by - ht, hex('#1a120c')); b.set(tx + i, by - 2, C[0]); }
        b.set(tx + 2, by - ht - 1, hex('#4a3a28')); b.set(tx + 3, by - ht - 2, hex('#4a3a28')); b.set(tx + 3, by - ht - 3, hex('#6a5034'));
      }
    };
    const fillShelf = (x0, x1, by, maxH) => {
      let x = x0;
      while (x < x1 - 6) {
        const k = h2(x, by, S + 3), room = x1 - x;
        if (k < 0.3 && room > 16) { const bw = Math.min(room, 14 + Math.floor(h2(x, 1, S) * 12)); box(x, by, bw, Math.min(maxH, 10 + Math.floor(h2(x, 2, S) * 12)), Math.floor(h2(x, 3, S) * 4)); x += bw + 1; }
        else if (k < 0.55 && room > 20) { const cw = Math.min(room, 20 + Math.floor(h2(x, 4, S) * 10)); crate(x, by, cw, Math.min(maxH - 14, 12 + Math.floor(h2(x, 5, S) * 6)), 1 + (h2(x, 6, S) < 0.5 ? 1 : 0)); x += cw + 1; }
        else if (k < 0.75 && room > 14) { const n = Math.min(Math.floor(room / 6), 2 + Math.floor(h2(x, 7, S) * 3)); tubes(x, by, n); x += n * 6 + 2; }
        else if (room > 12) { const bw = 10 + Math.floor(h2(x, 8, S) * 6); box(x, by, Math.min(bw, room), Math.min(maxH, 8 + Math.floor(h2(x, 9, S) * 6)), 0); if (room > 24 && h2(x, 10, S) < 0.6) box(x + 2, by - 8 - Math.floor(h2(x, 9, S) * 6), Math.min(bw, room) - 4, 7, 2); x += bw + 2; }
        else x += 4;
      }
    };
    for (let k = 0; k < 4; k++) {
      const x0 = k * 192 + 44, uw = 132, lev = 44, nl = Math.max(3, Math.floor((floor - 30) / lev));
      const top = floor - nl * lev - 6;
      for (let L = 0; L <= nl; L++) {
        const by = floor - L * lev - (L ? 4 : 0);
        fillShelf(x0 + 5, x0 + uw - 5, by, L === nl ? 22 : lev - 8);
      }
      for (const ux of [x0, x0 + uw - 4]) for (let y = top; y < floor; y++) for (let i = 0; i < 4; i++) {
        let v = i === 0 ? 4.4 : i === 3 ? 0.8 : 2.4;
        if (i === 1 && y % 6 === 2) v = 0.4;
        b.set(ux + i, y, rp(UP, v, ux + i, y));
      }
      for (let L = 1; L < nl + 1; L++) {
        const by = floor - L * lev;
        for (let x = x0; x < x0 + uw; x++) for (let j = 0; j < 4; j++) b.set(x, by + j, rp(BEAM, j === 0 ? 4.6 : j === 3 ? 0.8 : 2.6, x, by + j));
      }
      for (let x = x0 - 2; x < x0 + uw + 2; x++) for (let j = 0; j < 2; j++) b.set(x, floor + j, UP[j ? 0 : 3]);
    }
    // a pallet jack and floor stacks between racks
    for (let k = 0; k < 4; k++) {
      const x = k * 192 + 180 + Math.floor(R() * 6);
      crate(x, floor + 2, 22, 14, 0);
      if (R() < 0.6) box(x + 3, floor - 12, 16, 9, 1);
    }
    fadeRows(b, floor - 40, h, hex('#0c0e16'), 0.65, 1.2);
    layers.racks = mkLayer(b.canvas(), 0.32, fy, 'full');
  }

  // ---- near: hanging bulbs with shades and their light cones, a chain hoist
  const lamps = [];
  {
    const SH = pal(['#05070c', '#0e121a', '#1c222e', '#2e3646', '#465064']);
    const w = 768, fy = 0.56, h = fullH(E, fy), b = new Buf(w, h), cone = new Buf(w, h);
    const lc = hex('#ffc878');
    for (let k = 0; k < 4; k++) {
      const x = k * 192 + 60 + Math.floor(R() * 70), len = 18 + Math.floor(R() * 26);
      for (let y = 0; y < len; y++) b.set(x, y, SH[1]);
      for (let j = 0; j < 6; j++) for (let i = -2 - j; i <= 2 + j; i++) b.set(x + i, len + j, rp(SH, j === 5 ? 1 : i < 0 ? 3.6 - j * 0.3 : 2 - j * 0.2, x + i, len + j));
      b.set(x - 1, len + 6, hex('#ffe8b0')); b.set(x, len + 6, hex('#fff6d8')); b.set(x + 1, len + 6, hex('#ffe8b0')); b.set(x, len + 7, hex('#ffd890'));
      lamps.push({ x: x + 0.5, y: len + 6, p: R() * TAU });
      for (let y = len + 7; y < len + 130; y++) {
        const s = y - len - 7, hw = 7 + s * 0.42;
        for (let i = -Math.ceil(hw); i <= hw; i++) {
          const e = clamp((hw - Math.abs(i)) / 6, 0, 1), a = e * Math.pow(1 - s / 123, 1.5) * 0.42;
          const q = dq(a * 4, x + i, y);
          if (q > 0) cone.set(x + i, y, withA(lc, q * 22));
        }
      }
    }
    const hx = Math.floor(R() * w);
    for (let y = 0; y < 52; y += 3) { b.set(hx, y, SH[3]); b.set(hx, y + 1, SH[2]); b.set(hx + 1, y + 1, SH[1]); }
    rRect(hx - 4, 52, 9, 10, (x, y) => b.set(x, y, rp(SH, x === hx - 4 ? 4 : 2, x, y)));
    for (let y = 62; y < 84; y += 3) { b.set(hx - 2, y, SH[3]); b.set(hx - 2, y + 1, SH[2]); }
    spr(b, hx - 4, 84, ['.kkk.', 'k...k', '....k', '...k.', 'kkk..'], { k: SH[4] });
    layers.near = mkLayer(b.canvas(), 0.56, fy, 'full');
    layers.cone = mkLayer(cone.canvas(), 0.56, fy, 'full');
  }

  const glowL = ditherGlow(9, '#ffd080', 0.6);
  const fwDoor = makeFireworks(S + 9, 3, {
    pmin: 2.8, pmax: 4.4, skip: 0.15, gr: 14, size: 0.5,
    place: (i, k, a, b2) => door.sx < -500 ? null : [door.sx + 12 + a * (door.w - 24), door.sy + door.h * 0.38 + 8 + b2 * 16, door.sx + 12 + a * (door.w - 24), door.sy + door.h],
  });
  const motes = [];
  for (let i = 0; i < 24; i++) motes.push({ x: R() * (W + 20), y: R() * (H + 20), p: R() * TAU, f: 0.12 + R() * 0.25, v: 1.5 + R() * 3 });
  const sparks = [];
  for (let i = 0; i < 6; i++) sparks.push({ x: R() * (W + 20), y: R() * (H + 20), p: R(), r: 0.3 + R() * 0.3, v: 12 + R() * 10 });

  return {
    fog: '#1c1e2a',
    back(g, cx, cy, t) {
      blit(g, layers.wall, E, cx, cy, t);
      door.sx = -999;
      onScreen(layers.wall, E, cx, cy, t, door.x, door.y, door.w + 20, (x, y) => { if (x > -door.w && x < W) { door.sx = x; door.sy = y; } });
      if (door.sx > -500) {
        g.save();
        g.beginPath(); g.rect(Math.floor(door.sx), Math.floor(door.sy + door.h * 0.34), door.w, Math.floor(door.h * 0.45)); g.clip();
        fwDoor(g, t, cx, cy);
        g.restore();
      }
      blit(g, layers.racks, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1;
      blit(g, layers.cone, E, cx, cy, t);
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.near, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lamps.forEach((l, i) => {
        g.globalAlpha = clamp(0.7 + 0.12 * Math.sin(t * 5 + l.p) + (Math.sin(t * 23 + i) > 0.97 ? -0.4 : 0), 0, 1);
        onScreen(layers.near, E, cx, cy, t, l.x, l.y, 12, (x, y) => g.drawImage(glowL, Math.floor(x) - 9, Math.floor(y) - 8));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      g.fillStyle = '#e8d0a0';
      for (const m of motes) {
        const x = Math.floor(wrapP(m.x + Math.sin(t * m.f + m.p) * 16 + t * m.v - cx * 1.08, sw2)) - 10;
        const y = Math.floor(wrapP(m.y + Math.sin(t * m.f * 1.3 + m.p * 2) * 10 + t * 2 - cy * 1.08, sh2)) - 10;
        g.globalAlpha = clamp(0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.9 + m.p)), 0, 1);
        g.fillRect(x, y, 1, 1);
      }
      for (const s of sparks) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.35) continue;
        const x = Math.floor(wrapP(s.x + ph * 30 - cx * 1.1, sw2)) - 10, y = Math.floor(wrapP(s.y + ph * s.v * 3 - cy * 1.1, sh2)) - 10;
        g.globalAlpha = 1 - ph / 0.35;
        g.fillStyle = '#ffd070'; g.fillRect(x, y, 1, 1);
        g.fillStyle = '#ff8a20'; g.fillRect(x - 1, y - 1, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// JULY_ROCKET — a vertical climb up a giant firework rocket on its launch gantry

function buildJulyRocket(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {}, beacons = [];
  const midX = fx => Math.round(W / 2 + Math.max(0, (E.levelW - W) / 2) * fx);

  // ---- sky: warm launch-pad haze at the bottom, deep blue, then star-thick black at the top
  const sw = 768, fyS = 0.3, sh = fullH(E, fyS);
  {
    const SKY = pal(['#020208', '#04050e', '#060916', '#0a0d20', '#0e132a', '#131a36', '#1a2242', '#232a4c', '#2e3254', '#3c3858',
      '#4c3e5a', '#5e445a', '#724a58', '#8a5456', '#a26052']);
    const stops = [[0, 14], [0.05, 12], [0.12, 10], [0.22, 8], [0.35, 6.2], [0.5, 4.4], [0.65, 2.8], [0.8, 1.5], [0.92, 0.6], [1, 0.2]];
    const b = new Buf(sw, sh), neb = fbm2(S + 2, 12, sw, 30, 4);
    const mx = 560, my = Math.round(sh * 0.06) + 14, mr = 9;
    for (let y = 0; y < sh; y++) {
      const f = (sh - 1 - y) / sh, bv = interp(stops, f);
      for (let x = 0; x < sw; x++) {
        let v = bv;
        if (f > 0.5) { const band = Math.max(0, 1 - Math.abs((y - sh * 0.12) - (x - 384) * 0.25) / 60); v += clamp((neb(x, y) - 0.45) * 3, 0, 1) * band * 1.3 * clamp((f - 0.5) * 4, 0, 1); }
        const dm = Math.hypot(wrapD(x - mx, sw), y - my);
        if (dm < mr) {
          const dc = Math.hypot(wrapD(x - mx - 4, sw), y - my + 2);
          b.d[y * sw + x] = dc < mr - 0.5 ? rp(SKY, bv + 1.2, x, y) : hex(dm > mr - 1.5 ? '#b8bcd0' : '#e4e6f0');
          continue;
        }
        v += 2.2 * Math.pow(Math.max(0, 1 - dm / 50), 2);
        b.d[y * sw + x] = rp(SKY, v, x, y);
      }
    }
    const STAR = pal(['#2a3260', '#5a64a0', '#a8b4f0', '#ffffff']);
    for (let i = 0; i < (sw * sh) / 120; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), f = (sh - 1 - y) / sh;
      if (R() > clamp((f - 0.28) / 0.45, 0, 1)) continue;
      const k = R();
      b.set(x, y, STAR[k < 0.6 ? 0 : k < 0.88 ? 1 : 2]);
      if (k > 0.99) { b.set(x - 1, y, STAR[1]); b.set(x + 1, y, STAR[1]); b.set(x, y - 1, STAR[1]); b.set(x, y + 1, STAR[1]); b.set(x, y, STAR[3]); }
    }
    layers.sky = mkLayer(b.canvas(), 0.02, fyS, 'full');
  }

  // ---- thin cloud banks at middle altitudes, underlit by the pad
  {
    const CL = pal(['#0e1226', '#151a32', '#1e2440', '#29304e', '#363c5e', '#47486c', '#5a5476']);
    const w = 768, fy = 0.45, h = fullH(E, fy), lit = new Float32Array(w * h).fill(-1);
    const bands = h > 400 ? [0.32, 0.52, 0.72] : [0.4];
    for (const bf of bands) for (let c = 0; c < 4; c++) {
      const cx = (c + R() * 0.7) * w / 4, cw = 90 + R() * 120, base = h * bf + (R() - 0.5) * 30;
      for (let i = 0; i < cw / 6; i++) {
        const f = i / (cw / 6), r = (3 + Math.sin(Math.PI * f) * 7) * (0.7 + R() * 0.5);
        const dx = cx - cw / 2 + f * cw, dy = base - Math.sin(Math.PI * f) * 4;
        for (let y = Math.floor(dy - r); y <= dy + r * 0.6; y++) for (let x = Math.floor(dx - r * 1.6); x <= dx + r * 1.6; x++) {
          if (y < 0 || y >= h) continue;
          const d = Math.hypot((x + 0.5 - dx) / 1.6, y + 0.5 - dy);
          if (d > r) continue;
          const l = clamp((y - (dy - r)) / (r * 1.6), 0, 1) * (1 - bf * 0.6);
          const idx = y * w + wrapP(x, w);
          if (l > lit[idx]) lit[idx] = l;
        }
      }
    }
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lit[y * w + x];
      if (l < 0) continue;
      let v = 0.6 + l * 5;
      if (y + 1 < h && lit[(y + 1) * w + x] < 0) v += 1.2;
      b.d[y * w + x] = rp(CL, v, x, y);
    }
    layers.cloud = mkLayer(b.canvas(), 0.05, fy, 'full', { vx: 1.5 });
  }

  // ---- crowd: skyline glow, grandstands, the crowd behind the barrier, searchlight housings
  const lamps = [];
  {
    const P = pal(['#03040a', '#060812', '#0b0e1c', '#121728', '#1b2136', '#262e48', '#36405e']);
    const WIN = [hex('#c49050'), hex('#806040')];
    const w = 768, h = 132, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 4, w, 34, 4, 4);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    const wins = [];
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(R() * w), bw = 6 + Math.floor(R() * 12), bh = 6 + Math.floor(R() * 22);
      rRect(x, top[x] - bh, bw, bh + 2, m.P(1));
      for (let k = 0; k < bh / 4; k++) if (R() < 0.4) wins.push([x + 1 + Math.floor(R() * (bw - 2)), Math.floor(top[x] - bh + 2 + k * 4)]);
    }
    // grandstands: stepped wedges
    for (let k = 0; k < 2; k++) {
      const x0 = k * 384 + 30 + Math.floor(R() * 60), sw2 = 150;
      for (let s = 0; s < 6; s++) rRect(x0 + s * 6, 72 - s * 4, sw2 - s * 12, 30, m.P(2));
      for (let x = x0; x < x0 + sw2; x += 30) rRect(x, 50, 2, 30, m.P(2));
      rRect(x0 - 2, 48, sw2 + 4, 3, m.P(2));
      crowd(m, x0 + 4, x0 + sw2 - 4, 70, R, 0.9, 3, null);
    }
    crowd(m, 0, w, 96, R, 1.35, 3, null);
    for (let x = 0; x < w; x++) { m.set(x, 92, 4); m.set(x, 99, 4); if (x % 12 === 0) for (let y = 92; y < 104; y++) m.set(x, y, 4); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.at(x, y); if (!k) continue;
      let v;
      if (y >= 104) v = 1.4 - (y - 104) / 20;
      else if (k === 1) { v = 2.4 + clamp((y - 20) / 30, 0, 1) * 1.6; if (!m.at(x, y - 1)) v += 1.4; }
      else if (k === 4) v = 4.4;
      else v = !m.at(x, y - 1) ? 3.4 : !m.at(x - 1, y) ? 2 : 0.8;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    for (const [x, y] of wins) b.set(x, y, WIN[R() < 0.5 ? 0 : 1]);
    // searchlight housings
    const SL = pal(['#0e1220', '#2a3044', '#5a6278', '#c8d0e8']);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(k * 192 + 60 + R() * 70), y = 104;
      rRect(x - 4, y - 3, 9, 3, b.P(SL[1])); rRect(x - 3, y - 7, 7, 4, b.P(SL[2]));
      rRect(x - 2, y - 8, 5, 1, b.P(SL[3]));
      lamps.push({ x: x + 0.5, y: y - 8, p: R() * TAU, s: 0.3 + R() * 0.15, k });
    }
    layers.crowd = mkLayer(b.canvas(), 0.2, 0.45, 'bottom');
  }
  // searchlight beam sprites at fixed tilt steps
  const NA = 13, AMAX = 0.42, BL = 460;
  const beams = [];
  for (let i = 0; i < NA; i++) {
    const a = -AMAX + 2 * AMAX * i / (NA - 1), sa = Math.sin(a), ca = Math.cos(a), mw = 2 + BL * 0.055;
    const xl = Math.floor(Math.min(0, sa * BL) - mw - 2), xr = Math.ceil(Math.max(0, sa * BL) + mw + 2);
    const bw = xr - xl, bh = Math.ceil(BL * ca + mw + 4), b = new Buf(bw, bh, false), c = hex('#b8c4ff');
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const px = x + xl + 0.5, py = -(bh - 1 - y) + 0.5;
      const s = px * sa - py * ca, p = px * ca + py * sa;
      if (s < 0 || s > BL) continue;
      const hw = 1.5 + s * 0.055, e = clamp((hw - Math.abs(p)) / hw * 1.8, 0, 1);
      const al = e * Math.pow(1 - s / BL, 1.1) * 0.7;
      const q = dq(al * 4, x, y);
      if (q > 0) b.d[y * bw + x] = withA(c, q * 38);
    }
    beams.push({ cv: b.canvas(), ox: -xl, oy: bh - 1 });
  }

  // ---- the rocket on its gantry, standing on the pad
  const RF = 0.7, rcx = midX(0.3);
  {
    const w = 768, h = fullH(E, RF), b = new Buf(w, h), m = new Mask(w, h);
    const RED = pal(['#18060a', '#2a0910', '#400e17', '#58141f', '#721b27', '#8c2430', '#a4323a']);
    const WHT = pal(['#18182a', '#24243a', '#34344c', '#46465e', '#5a5a74', '#72728c', '#8c8ca4']);
    const BLU = pal(['#060a20', '#0c1436', '#142050', '#1e2e6c', '#2a3e8a', '#3a52a6', '#5470c0']);
    const GOLD = pal(['#1e1206', '#36220a', '#543610', '#744c18', '#966624', '#b88434', '#d8a850']);
    const ST = pal(['#04050a', '#080a12', '#0e111c', '#151a28', '#1e2536', '#2a3248', '#3a445e']);
    const CON = pal(['#0e0e14', '#16161e', '#202028', '#2a2a34', '#363640', '#44444e']);
    const rw = 34, padTop = h - 30, yb = padTop - 18, tip = Math.min(66, Math.max(16, Math.floor(h * 0.08)));
    const nb = Math.min(yb - 90, tip + 112);
    const lightAt = (x, y) => clamp(0.5 - (x - rcx) / rw * 0.8, 0, 1);
    // body: candy-twist helix with blue star rings
    for (let y = nb; y < yb; y++) for (let x = rcx - rw; x < rcx + rw; x++) {
      const u = (x + 0.5 - rcx) / rw, n = Math.asin(clamp(u, -1, 1));
      const lit = Math.max(0, Math.cos(n + 0.7));
      let v = 0.2 + 5.2 * Math.pow(lit, 1.3) + (Math.abs(u) > 0.94 ? -0.6 : 0);
      const ring = (y - nb) % 190;
      let P;
      if (ring < 22) {
        P = BLU;
        if (ring === 0 || ring === 21) { P = GOLD; v += 0.8; }
      } else {
        const ph = (y * 0.9 + n * rw * 1.25) / 13;
        P = Math.floor(ph) % 2 ? RED : WHT;
        if (P === WHT) v -= 0.4;
      }
      if ((y - nb) % 63 === 40) v -= 1.2;
      else if ((y - nb) % 63 === 41 && (x % 6) === 0) v += 1;
      b.set(x, y, rp(P, v, x, y));
    }
    // white stars around each blue ring, foreshortened toward the edges
    for (let ry = nb; ry + 22 < yb; ry += 190) for (let k = -3; k <= 3; k++) {
      const n = k * 0.42 + ((ry / 190) % 2) * 0.21, u = Math.sin(n);
      if (Math.abs(u) > 0.9) continue;
      const sx = Math.round(rcx + u * rw), lit = Math.max(0, Math.cos(n + 0.7)), c = WHT[clamp(Math.round(2 + lit * 4), 0, 6)];
      const narrow = Math.abs(u) > 0.6;
      spr(b, sx - 2, ry + 8, narrow ? ['..w..', '.www.', '.www.', '.w.w.'] : ['..w..', 'wwwww', '.www.', '.w.w.'], { w: c });
    }
    // nose cone with a tip and a ring
    for (let y = tip; y < nb; y++) {
      const f = (y - tip) / (nb - tip), hw = rw * Math.pow(f, 0.78) * (1 + 0.06 * Math.sin(f * Math.PI));
      for (let x = Math.floor(rcx - hw); x < rcx + hw; x++) {
        const u = (x + 0.5 - rcx) / Math.max(1, hw), n = Math.asin(clamp(u, -1, 1));
        let v = 0.3 + 5 * Math.pow(Math.max(0, Math.cos(n + 0.7)), 1.3) + (1 - f) * 0.6;
        const P = f < 0.16 ? RED : (f > 0.5 && f < 0.58) ? BLU : GOLD;
        if (Math.abs(f - 0.16) < 0.01 || Math.abs(f - 0.5) < 0.008 || Math.abs(f - 0.58) < 0.008) v += 1.4;
        b.set(x, y, rp(P, v, x, y));
      }
    }
    for (let x = rcx - rw - 2; x < rcx + rw + 2; x++) for (let j = 0; j < 4; j++) b.set(x, nb + j, rp(WHT, (j === 0 ? 5.5 : 3.2) - (x - rcx) / rw * 1.8, x, nb + j));
    rLine(rcx, tip - 1, rcx, tip - 8, b.P(GOLD[5])); b.set(rcx, tip - 9, GOLD[6]);
    // tail: gold collar, fins, nozzle
    for (let y = yb - 10; y < yb; y++) for (let x = rcx - rw - 1; x < rcx + rw + 1; x++) b.set(x, y, rp(GOLD, 4.4 - (x - rcx) / rw * 2.4 - (y === yb - 10 ? -1 : 0), x, y));
    for (const s of [-1, 1]) rPoly([[rcx + s * (rw - 2), yb - 70], [rcx + s * (rw + 28), yb + 4], [rcx + s * (rw + 28), yb + 12], [rcx + s * (rw - 2), yb + 2]], (x, y) => {
      const e = Math.abs(x - rcx) > rw + 24 || y > yb + 8;
      b.set(x, y, (e ? WHT : BLU)[s < 0 ? (e ? 5 : 4) : (e ? 3 : 2)]);
    });
    rPoly([[rcx - 4, yb - 60], [rcx + 4, yb - 60], [rcx + 6, yb + 14], [rcx - 6, yb + 14]], (x, y) => b.set(x, y, rp(BLU, x < rcx ? 4.4 : 3, x, y)));
    rPoly([[rcx - 16, yb], [rcx + 16, yb], [rcx + 20, yb + 12], [rcx - 20, yb + 12]], (x, y) => b.set(x, y, rp(ST, 4 - (x - rcx) / 10, x, y)));
    // fuse cord coiling down to the pad
    for (let k = 0; k < 40; k++) { const f = k / 40; b.set(Math.round(rcx + 8 + f * 40 + Math.sin(f * 9) * 4), Math.round(yb + 12 + f * 12), hex('#5a4a2a')); }
    // gantry tower right, slimmer mast left
    const tower = (x0, tw, yTop, decks) => {
      for (let y = yTop; y < padTop; y++) for (const xx of [x0, x0 + tw - 3]) for (let i = 0; i < 3; i++) m.set(xx + i, y, 1);
      for (let y = padTop - 2; y > yTop; y -= 22) {
        rRect(x0, y - 1, tw, 2, m.P(1));
        rLine(x0 + 2, y, x0 + tw - 3, y - 21, m.P(2)); rLine(x0 + tw - 3, y, x0 + 2, y - 21, m.P(2));
      }
      for (const dy of decks) {
        rRect(x0 - 6, dy, tw + 12, 3, m.P(1));
        for (let x = x0 - 6; x < x0 + tw + 6; x += 3) m.set(x, dy - 6, 1);
        rRect(x0 - 6, dy - 7, tw + 12, 1, m.P(1));
        beacons.push({ x: x0 + tw + 5, y: dy - 9, p: R() * TAU });
      }
      rLine(x0 + tw / 2, yTop, x0 + tw / 2, yTop - 26, m.P(1));
      beacons.push({ x: x0 + tw / 2, y: yTop - 27, p: R() * TAU });
    };
    const gx = rcx + rw + 26, decks = [];
    for (let y = padTop - 80; y > tip + 40; y -= 150) decks.push(y);
    tower(gx, 40, tip - 30, decks);
    tower(rcx - rw - 58, 18, Math.max(10, tip + 60), []);
    // umbilical arms with sagging hoses into the rocket
    for (const dy of decks) {
      rRect(rcx + rw - 1, dy + 2, gx - (rcx + rw) + 2, 4, m.P(1));
      for (let x = rcx + rw; x < gx; x += 6) rLine(x, dy + 2, x + 6, dy + 5, m.P(2));
      wire(b, gx, dy + 8, rcx + rw, dy + 14, 10, hex('#14161e'));
      wire(b, gx, dy + 10, rcx + rw, dy + 18, 14, hex('#1c1e28'));
    }
    // pad: concrete apron, flame trench, mount legs, rails
    for (let y = padTop; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.abs(wrapD(x - rcx, w));
      if (dx > 150 + (y - padTop) * 3) continue;
      let v = 3.4 - (y - padTop) * 0.12 - dx / 120;
      if (y === padTop) v = 5;
      if (dx < 26 && y > padTop + 2) v = 0.3;
      b.set(x, y, rp(CON, v, x, y));
    }
    for (const s of [-1, 1]) {
      rRect(rcx + s * 30 - 3, yb + 4, 6, padTop - yb - 4, m.P(1));
      rLine(rcx + s * 27, yb + 6, rcx + s * 18, yb + 2, m.P(1));
    }
    for (let x = rcx - 150; x < rcx + 150; x += 5) { m.set(x, padTop - 6, 3); rLine(x, padTop - 6, x, padTop - 1, (xx, yy) => { if (x % 15 === 0) m.set(xx, yy, 3); }); }
    for (let x = rcx - 150; x < rcx + 150; x++) m.set(x, padTop - 6, 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let v = k === 2 ? 1.6 : !m.at(x - 1, y) ? 4.2 : !m.at(x, y - 1) ? 3.6 : !m.at(x + 1, y) ? 0.6 : 2.2;
      if (k === 3) v = 3;
      v += clamp((y - (h - 160)) / 160, 0, 1) * 1.2;
      b.d[y * w + x] = rp(ST, v, x, y);
    }
    // floodlight wash on the lower rocket
    glowInto(b, rcx - 30, yb + 6, 110, hex('#d8b080'), 0.28, true);
    glowInto(b, rcx + 60, yb + 6, 80, hex('#8090c8'), 0.22, true);
    layers.rocket = mkLayer(b.canvas(), 0.3, RF, 'full');
  }

  // ---- near: foreground girders at the frame edges
  {
    const ST = pal(['#020306', '#05060c', '#0a0c16', '#111522', '#1a1f30', '#262c42']);
    const w = 768, fy = 0.9, h = fullH(E, fy), m = new Mask(w, h), ox = midX(0.45) - W / 2;
    for (const [x0, gw] of [[ox - 6, 14], [ox + W - 9, 16]]) {
      rRect(x0, 0, gw, h, m.P(1));
      for (let y = 20 + Math.floor(R() * 60); y < h - 90; y += 160 + Math.floor(R() * 60)) {
        const s = x0 < ox + W / 2 ? 1 : -1, ex = s > 0 ? x0 + gw : x0;
        rSeg(ex, y, ex + s * 34, y + 40, 2.2, 1.6, m.P(2));
        rRect(Math.min(ex, ex + s * 18), y - 3, 18, 5, m.P(2));
      }
    }
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let v = 1.2;
      if (!m.at(x - 1, y)) v = 3.4; else if (!m.at(x + 1, y)) v = 0.2; else if (!m.at(x - 3, y)) v = 2.2;
      if (k === 1 && y % 24 === 0 && m.at(x - 2, y) && m.at(x + 2, y)) v += 1.4;
      b.d[y * w + x] = rp(ST, v, x, y);
    }
    layers.near = mkLayer(b.canvas(), 0.45, fy, 'full');
  }

  const fw = makeFireworks(S + 9, 9, {
    pmin: 2.6, pmax: 4.2, skip: 0.06, gr: 30, size: 1.3,
    place: (i, k, a, b2, cx, cy) => {
      const oy = layerY(layers.sky, E, cy);
      const sy = i < 6 ? 30 + b2 * 170 : sh * (0.25 + 0.45 * ((i - 6) / 3 + b2 * 0.33));
      const bx = 24 + a * (W - 48) - cx * 0.03, by = sy + oy;
      return [bx, by, bx + (a - 0.5) * 24, by + 110];
    },
  });
  const glowR = ditherGlow(4, '#ff3a2a', 0.7);
  const steams = [
    { cv: fogStrip(S + 31, 512, 26, '#8a8aa0', 0.5, 7), y: H - 44, v: 6, f: 1.05 },
    { cv: fogStrip(S + 32, 512, 18, '#a0a0b8', 0.42, 5), y: H - 26, v: -4, f: 1.2 },
  ];
  const sparks = [];
  for (let i = 0; i < 18; i++) sparks.push({ x: R() * (W + 20), y: R() * (H + 20), p: R(), r: 0.2 + R() * 0.35, v: 10 + R() * 16, c: i % 3 ? '#ffb850' : '#fff0c0' });

  return {
    fog: '#1e2240',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      fw(g, t, cx, cy);
      blit(g, layers.cloud, E, cx, cy, t);
      blit(g, layers.crowd, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      for (const l of lamps) {
        const a = 0.36 * Math.sin(t * l.s + l.p) * (l.k % 2 ? 1 : -1), i = clamp(Math.round((a + AMAX) / (2 * AMAX) * (NA - 1)), 0, NA - 1), bm = beams[i];
        g.globalAlpha = 0.9;
        onScreen(layers.crowd, E, cx, cy, t, l.x, l.y, BL, (x, y) => g.drawImage(bm.cv, Math.floor(x) - bm.ox, Math.floor(y) - bm.oy));
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.rocket, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      beacons.forEach((bc, i) => {
        const on = wrapP(t * 0.8 + bc.p, 1) < 0.5;
        if (!on) return;
        onScreen(layers.rocket, E, cx, cy, t, bc.x, bc.y, 6, (x, y) => {
          g.globalAlpha = 0.9; g.drawImage(glowR, Math.floor(x) - 4, Math.floor(y) - 4);
          g.fillStyle = '#ff8070'; g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
        });
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const dy = (E.maxCamY - cy);
      if (dy < 80) for (const s of steams) strip(g, s.cv, s.v * t + cx * s.f, s.y + dy * 1.1);
      const sw2 = W + 20, sh2 = H + 20;
      for (const s of sparks) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.6) continue;
        const x = Math.floor(wrapP(s.x + Math.sin(t * 1.1 + s.p * 9) * 8 - cx * 1.1, sw2)) - 10;
        const y = Math.floor(wrapP(s.y - t * s.v - cy * 1.1, sh2)) - 10;
        g.globalAlpha = 0.85 * Math.sin(ph / 0.6 * Math.PI);
        g.fillStyle = s.c; g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// PAT_OUT — emerald hills, dry-stone walls and a rainbow

function buildPatOut(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const STONE = pal(['#3a3e3a', '#4e544c', '#666c62', '#80867a', '#9aa092', '#b4b8a8', '#cdd0c0']);

  // ---- sky with the rainbow baked in
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  {
    const SKY = pal(['#2a62c0', '#306cc8', '#3876d0', '#4282d6', '#4c8edc', '#589ae2', '#66a6e6', '#74b2ea', '#84bcee', '#96c8f0',
      '#a8d2f2', '#bcdcf4', '#cee6f6', '#e0f0f8']);
    const stops = [[0, 13.2], [14, 12], [36, 10.4], [66, 8.8], [104, 7.2], [150, 5.8], [210, 4.4], [290, 3], [400, 1.7], [560, 0.6]];
    const RB = ['#ff5c5c', '#ff9c44', '#ffe266', '#70d874', '#5aa4ff', '#6c6ce4', '#ac6ce0'].map(c => hex(c));
    const b = new Buf(sw, sh), rx = 300, ry = sh - 1 + 40, r0 = 250, bw = 3.6;
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y, bv = interp(stops, d);
      for (let x = 0; x < sw; x++) {
        const dr = Math.hypot(wrapD(x - rx, sw), y - ry);
        let c = rp(SKY, bv + (dr < r0 - 7 * bw ? 0.7 : 0), x, y);
        const k = (r0 - dr) / bw;
        if (k >= 0 && k < 7) {
          const band = Math.floor(k), fe = Math.min(k - band, band + 1 - k);
          const al = 0.62 * clamp(d / 70, 0, 1) * (band === 0 || band === 6 ? 0.75 : 1) * (fe < 0.18 ? 0.7 : 1);
          c = mixq(c, al, x, y, RB[band]);
        }
        b.d[y * sw + x] = c;
      }
    }
    layers.sky = mkLayer(b.canvas(), 0.02, fyS, 'full');
  }

  // ---- soft white cumulus drifting by
  {
    const CL = pal(['#7c98c4', '#8ea8cc', '#a2b8d6', '#b6c8e0', '#cad8ea', '#dce6f2', '#eef3f9', '#ffffff']);
    const w = 768, fy = 0.1, h = fullH(E, fy), lit = new Float32Array(w * h).fill(-1);
    for (let c = 0; c < 7; c++) {
      const cx = (c + R() * 0.6) * w / 7, cw = 40 + R() * 60, base = h - 1 - (96 + R() * 80);
      const nd = Math.max(3, Math.round(cw / 7));
      for (let i = 0; i < nd; i++) {
        const f = i / (nd - 1), prof = Math.sin(Math.PI * f), r = (4 + prof * 11) * (0.7 + R() * 0.5);
        const dx = cx - cw / 2 + f * cw + (R() - 0.5) * 6, dy = base - r * 0.45 - prof * 6;
        for (let y = Math.floor(dy - r); y <= Math.min(base, dy + r); y++) {
          if (y < 0 || y >= h) continue;
          for (let x = Math.floor(dx - r); x <= dx + r; x++) {
            if (Math.hypot(x + 0.5 - dx, y + 0.5 - dy) > r) continue;
            const l = 1 - Math.hypot(x + 0.5 - (dx - r * 0.35), y + 0.5 - (dy - r * 0.6)) / (r * 1.6);
            const idx = y * w + wrapP(x, w);
            if (l > lit[idx]) lit[idx] = Math.max(0, l);
          }
        }
      }
    }
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lit[y * w + x];
      if (l < 0) continue;
      let v = 2.2 + l * 6;
      if (y + 1 < h && lit[(y + 1) * w + x] < 0) v -= 1.2;
      if (y > 0 && lit[(y - 1) * w + x] < 0) v += 1;
      b.d[y * w + x] = rp(CL, v, x, y);
    }
    layers.cloud = mkLayer(b.canvas(), 0.04, fy, 'full', { vx: 2 });
  }

  // ---- far hills: hazy green, a round tower on the skyline
  {
    const P = pal(['#4a8680', '#549088', '#5e9a8e', '#6aa494', '#78ae9a', '#88baa2', '#9ac6ac']);
    const T = pal(['#58707c', '#6c848e', '#8298a0', '#9cb0b4', '#b8c8c8']);
    const w = 768, h = 130, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 24, 9, 4);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    const patch = noise2(S + 4, 48, w, 6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      const sl = top[wrapP(x + 2, w)] - top[wrapP(x - 2, w)];
      let v = 3.4 - sl * 0.6 + (patch(x, y) > 0.62 ? 0.7 : patch(x, y) < 0.3 ? -0.5 : 0);
      if (!m.at(x, y - 1)) v += 1.2;
      v += clamp((y - 30) / 60, 0, 1) * 1.4;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    let tx = 0; for (let x = 0; x < w; x++) if (top[x] < top[tx]) tx = x;
    const tb = Math.floor(top[tx]) + 3;
    for (let y = tb - 38; y < tb; y++) { const hw = 2 + (y - (tb - 38)) / 38; for (let i = -Math.round(hw); i <= Math.round(hw); i++) b.set(tx + i, y, rp(T, i < 0 ? 3.4 : i === 0 ? 2.4 : 1.1, tx + i, y)); }
    rPoly([[tx - 3, tb - 37], [tx + 3.5, tb - 37], [tx + 0.5, tb - 46]], (x, y) => b.set(x, y, rp(T, x <= tx ? 2.8 : 0.8, x, y)));
    b.set(tx, tb - 32, T[0]); b.set(tx - 1, tb - 22, T[0]); b.set(tx, tb - 14, T[0]); b.set(tx, tb - 5, T[0]); b.set(tx, tb - 4, T[0]);
    for (let i = 0; i < 6; i++) { const x = wrapP(tx + 20 + i * 4 + Math.floor(R() * 3), w); rRect(x, Math.floor(top[x]) - 2, 2, 3, b.P(T[1])); }
    layers.far = mkLayer(b.canvas(), 0.06, 0.1, 'bottom');
  }

  // ---- mid hills: patchwork fields, dry-stone walls, sheep, standing stones, hedgerow trees
  const sheepPos = [];
  {
    const P = pal(['#0e4a1c', '#145622', '#1a6428', '#22722e', '#2a8034', '#348e3a', '#409c40', '#4eaa46', '#5eb84e', '#70c658']);
    const TREE = pal(['#0a3014', '#0e3c18', '#14481e', '#1c5624', '#26662c']);
    const w = 768, h = 160, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 5, w, 64, 13, 3);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    // walls: contour walls under the crest, cross walls down the slope
    const wallY = [];
    for (const off of [10, 22, 40, 66]) { const n = noise1(S + off, 12, w), a = new Float32Array(w); for (let x = 0; x < w; x++) a[x] = top[x] + off + (n(x) - 0.5) * 10; wallY.push(a); }
    const cross = [];
    for (let x = 20 + R() * 40; x < w - 10; x += 50 + R() * 60) cross.push({ x, lean: (R() - 0.5) * 0.5 });
    const fieldId = (x, y) => {
      let row = 0; for (const a of wallY) if (y > a[x]) row++;
      let col = 0; for (const c of cross) if (x > c.x + (y - top[x]) * c.lean) col++;
      return [row, col];
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      const [row, col] = fieldId(x, y), ft = h2(row, col, S + 7);
      const sl = top[wrapP(x + 3, w)] - top[wrapP(x - 3, w)];
      let v = 6 - sl * 0.45 - (y - top[x]) * 0.025 + (ft < 0.25 ? -1.1 : ft > 0.75 ? 0.9 : 0);
      if (y - top[x] < 1) v += 1.6; else if (y - top[x] < 2) v += 0.8;
      if (ft > 0.85 && (x + y * 2) % 7 === 0) v -= 0.8;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    const stoneAt = (x, y, k) => { const sx = Math.floor((x + (y & 1) * 2) / 3); b.set(x, y, STONE[clamp(Math.round(k + (h2(sx, y, S) - 0.5) * 2 + ((x + (y & 1) * 2) % 3 === 0 ? -1.4 : 0)), 0, 6)]); };
    for (const a of wallY) for (let x = 0; x < w; x++) { const y = Math.round(a[x]); if (y < h) { stoneAt(x, y - 1, 4.4); stoneAt(x, y, 3); b.set(x, y + 1, P[1]); } }
    for (const c of cross) {
      for (let y = Math.floor(top[Math.floor(c.x)]) + 1; y < h; y++) {
        const x = Math.round(c.x + (y - top[Math.floor(c.x)]) * c.lean);
        stoneAt(x, y, 4); stoneAt(x + 1, y, 2.6); b.set(x + 2, y, P[2]);
      }
    }
    // hedgerow trees along the walls
    for (let i = 0; i < 16; i++) {
      const a = wallY[Math.floor(R() * 2)], x = Math.floor(R() * w), y = a[x] - 2, r = 3 + R() * 3;
      for (let yy = Math.floor(y - r * 1.6); yy <= y; yy++) for (let xx = Math.floor(x - r - 1); xx <= x + r + 1; xx++) {
        const dd = Math.hypot((xx + 0.5 - x) / r, (yy + 0.5 - (y - r * 0.7)) / (r * 0.95));
        if (dd > 1 - h2(xx, yy, S) * 0.15) continue;
        b.set(xx, yy, rp(TREE, 3.2 - (xx - x) / r * 1.4 - (yy - (y - r * 1.6)) / (r * 1.6) * 1.2, xx, yy));
      }
    }
    // standing stones on a crest
    let sx = 0; for (let x = 0; x < w; x++) if (top[x] < top[sx] && Math.abs(x - 200) > 120) sx = x;
    const sy = Math.floor(top[sx]) + 4;
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + 0.3, px = Math.round(sx + Math.cos(a) * 16), py = Math.round(sy + Math.sin(a) * 3), ht = 6 + Math.floor(R() * 5) + (Math.sin(a) > 0 ? 1 : 0), wd = 3 + (R() < 0.4 ? 1 : 0);
      for (let y = py - ht; y <= py; y++) for (let i = 0; i < wd; i++) {
        if (y === py - ht && (i === 0 || i === wd - 1)) continue;
        b.set(px + i, y, STONE[i === 0 ? 5 : i === wd - 1 ? 1 : 3]);
      }
    }
    rRect(sx + 26, sy - 9, 3, 9, b.P(STONE[4])); rRect(sx + 34, sy - 9, 3, 9, b.P(STONE[2])); rRect(sx + 24, sy - 12, 15, 3, b.P(STONE[5])); rRect(sx + 24, sy - 10, 15, 1, b.P(STONE[2]));
    // sheep
    const SH = [hex('#f4f2ea'), hex('#d8d6cc'), hex('#b4b2aa')], FACE = hex('#2a2620');
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(R() * w), y = Math.floor(top[x] + 6 + R() * (h - top[x] - 20));
      if (y >= h - 8 || wallY.some(a => Math.abs(a[x] - y) < 3)) continue;
      const s = R() < 0.5 ? -1 : 1;
      spr(b, x, y, s > 0 ? ['.aab.', 'aaabf', 'abbc.', '.f.f.'] : ['.baa.', 'fbaaa', '.cbba', '.f.f.'], { a: SH[0], b: SH[1], c: SH[2], f: FACE });
      sheepPos.push([x, y]);
    }
    layers.mid = mkLayer(b.canvas(), 0.16, 0.22, 'bottom');
  }

  // ---- near: the closest slope, a wall along its crest, clover and daisies, calm below
  {
    const P = pal(['#0a4018', '#0e4c1c', '#125a22', '#186828', '#1e762e', '#268436', '#30923e', '#3ca046', '#4aae4e']);
    const w = 768, h = 84, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 8, w, 26, 6, 3);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    const tuft = noise2(S + 9, 128, w, 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      const dy = y - top[x];
      let v = 6.4 - dy * 0.06 + (dy < 14 ? (tuft(x, y) - 0.5) * 1.6 : (tuft(x, y) - 0.5) * 0.5);
      if (dy < 1) v += 1.4;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    for (let x = 0; x < w; x += 2) if (h2(x, 1, S) > 0.55) { const y = Math.floor(top[x]); b.set(x, y - 1, P[7]); if (h2(x, 2, S) > 0.6) b.set(x + (h2(x, 3, S) > 0.5 ? 1 : -1), y - 2, P[8]); }
    // dry-stone wall: big stones with a cope of upright slabs, broken in places
    const segs = [[40, 300], [380, 700]];
    for (const [x0, x1] of segs) {
      for (let x = x0; x < x1; ) {
        const sw2 = 4 + Math.floor(h2(x, 7, S) * 4), base = Math.floor(top[x]) + 5;
        for (let row = 0; row < 3; row++) {
          const yy = base - 3 - row * 3, ox = row % 2 ? 2 : 0;
          for (let i = 0; i < sw2; i++) for (let j = 0; j < 3; j++) {
            const k = 3.6 + (j === 0 ? 1.4 : j === 2 ? -1 : 0) + (i === 0 ? 0.8 : i === sw2 - 1 ? -1.6 : 0) + (h2(x + ox, row, S) - 0.5) * 1.4;
            b.set(x + ox + i, yy + j, STONE[clamp(Math.round(k), 0, 6)]);
          }
        }
        for (let i = 0; i < sw2; i += 2) { b.set(x + i, base - 12, STONE[5]); b.set(x + i, base - 11, STONE[4]); b.set(x + i + 1, base - 11, STONE[2]); }
        x += sw2;
      }
    }
    // clover and daisies near the crest only
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(R() * w), y = Math.floor(top[x] + 2 + R() * 10);
      if (R() < 0.6) { b.set(x, y, hex('#f4f4ec')); if (R() < 0.5) b.set(x + 1, y, hex('#f0d040')); }
      else { b.set(x, y, P[8]); b.set(x + 1, y, P[8]); b.set(x, y - 1, P[7]); }
    }
    layers.near = mkLayer(b.canvas(), 0.36, 0.4, 'bottom');
  }

  // clover leaves tumbling on the breeze
  const LV = [['.g.g.', 'ggggg', '.gdg.', '..g..', '.g...'], ['..g..', '.ggg.', '.gdg.', '..g..', '..g..'], ['.g.g.', 'gdggg', '.ggg.', '..g..', '...g.']]
    .map(rows => { const bb = new Buf(5, 5, false); spr(bb, 0, 0, rows, { g: hex('#3cae48'), d: hex('#1e7a2e') }); return bb.canvas(); });
  const leaves = [];
  for (let i = 0; i < 9; i++) leaves.push({ x: R() * (W + 40), y: R() * (H + 40), vx: -(8 + R() * 10), vy: 6 + R() * 8, a: 5 + R() * 9, f: 0.5 + R() * 0.9, p: R() * TAU, sp: 1.5 + R() * 2.5 });

  return {
    fog: '#a0ccb4',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      blit(g, layers.cloud, E, cx, cy, t);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const sw2 = W + 40, sh2 = H + 40;
      for (const L of leaves) {
        const x = Math.floor(wrapP(L.x + L.vx * t + Math.sin(t * L.f + L.p) * L.a - cx * 1.2, sw2)) - 20;
        const y = Math.floor(wrapP(L.y + L.vy * t - cy * 1.2, sh2)) - 20;
        const ph = Math.floor(wrapP(t * L.sp + L.p, 4));
        g.drawImage(LV[ph === 3 ? 1 : ph], x, y);
      }
    },
  };
}

// ===========================================================================
// PAT_IN — the counting house: ledgers, copper vats and heaps of gold

function buildPatIn(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {}, lanterns = [], glints = [];
  const GOLD = pal(['#241604', '#40280a', '#62400e', '#866016', '#a87e20', '#c89c2c', '#e2ba40', '#f4d660', '#fff0a0']);
  const BRASS = pal(['#2a1c08', '#4a3410', '#6e5018', '#947024', '#b89036', '#d8b050']);
  const vaultX = 384 + 40;

  // ---- back wall: green panelling, ledger shelves, the round vault door
  {
    const PAN = pal(['#040a06', '#07100a', '#0a160e', '#0e1d12', '#132517', '#192e1d', '#203824', '#2a442c', '#365236']);
    const WOOD = pal(['#0c0704', '#160d07', '#21140a', '#2e1c0e', '#3c2614', '#4e321a', '#623f22']);
    const LED = [pal(['#2a0a0c', '#4a1216', '#6a1c20']), pal(['#0a2410', '#123a1a', '#1c5226']), pal(['#2a1a0a', '#46301a', '#64462a']),
      pal(['#0c1430', '#18224a', '#243262']), pal(['#3a2a08', '#5a4410', '#7a5e1c'])];
    const STEEL = pal(['#0e1210', '#181e1a', '#242c26', '#323c34', '#445046', '#5a685c', '#76847a']);
    const w = 768, fy = 0.15, h = fullH(E, fy), b = new Buf(w, h);
    const rail = h - 62, gr = noise2(S + 3, 128, w, 26);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x % 48, py = y < rail ? (y - 8) % 70 : y - rail;
      let v = 3 + (gr(x, y) - 0.5) * 0.8;
      if (px < 2 || px > 45) v = px === 0 ? 5 : px === 1 ? 4.2 : px === 47 ? 1 : 2;
      else if (py < 3 || py > 66) v = py === 0 ? 5 : py === 1 ? 4 : py > 66 ? 1.4 : 2.6;
      else if (px === 5 || py === 6) v = 4.4; else if (px === 42 || py === 62) v = 1.8;
      if (y >= rail && y < rail + 4) v = 6.4 - (y - rail) * 1.4;
      b.d[y * w + x] = rp(PAN, v - clamp((40 - y) / 40, 0, 1) * 1.6, x, y);
    }
    for (let x = 0; x < w; x++) { b.set(x, rail, BRASS[5]); b.set(x, rail + 1, BRASS[3]); b.set(x, rail + 2, BRASS[1]); }
    // ledger bookcases between the panels
    const shelfTop = Math.max(16, rail - 150);
    for (let k = 0; k < 4; k++) {
      const x0 = k * 192 + 12, x1 = x0 + 120;
      if (Math.abs(wrapD((x0 + x1) / 2 - vaultX, w)) < 110) continue;
      for (let y = shelfTop - 6; y < rail; y++) for (let x = x0 - 6; x < x1 + 6; x++) {
        const side = x < x0 || x >= x1;
        b.set(x, y, rp(WOOD, side ? (x === x0 - 6 ? 5 : x >= x1 ? 1.4 : 3) : y < shelfTop ? 4 : 0.8, x, y));
      }
      for (let sy = shelfTop + 26; sy <= rail; sy += 28) {
        let x = x0 + 1;
        while (x < x1 - 2) {
          const k2 = h2(x, sy, S + 4);
          if (k2 < 0.12 && x1 - x > 22) {
            for (let j = 0; j < 4; j++) { const P = LED[Math.floor(h2(x, j, S) * 5)], lw = 18 + (j % 2) * 2; for (let i = 0; i < lw; i++) for (let q = 0; q < 3; q++) b.set(x + i, sy - 3 - j * 3 + q, i === 0 || i === lw - 1 ? P[0] : q === 0 ? P[2] : P[1]); }
            x += 22; continue;
          }
          const bw = 3 + Math.floor(h2(x, sy, S + 5) * 4), bh = 14 + Math.floor(h2(x, sy, S + 6) * 9), P = LED[Math.floor(h2(x, sy, S + 7) * 5)];
          const lean = k2 > 0.93 && x1 - x > 12;
          for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
            const xx = x + i + (lean ? Math.floor(j / 4) : 0), yy = sy - 1 - j;
            let c = P[i === 0 ? 2 : i === bw - 1 ? 0 : 1];
            if (j === 3 || j === bh - 4) c = BRASS[i === 0 ? 4 : 2];
            if (j === Math.floor(bh / 2) && i > 0 && i < bw - 1) c = BRASS[3];
            b.set(xx, yy, c);
          }
          x += bw + (lean ? Math.ceil(bh / 4) : 0);
        }
        for (let x2 = x0; x2 < x1; x2++) { b.set(x2, sy, WOOD[6]); b.set(x2, sy + 1, WOOD[4]); b.set(x2, sy + 2, WOOD[1]); }
      }
    }
    // the vault door
    const vy = rail - 66, vr = 50;
    for (let y = vy - vr - 6; y <= vy + vr + 6; y++) for (let x = vaultX - vr - 6; x <= vaultX + vr + 6; x++) {
      const dx = x + 0.5 - vaultX, dy = y + 0.5 - vy, d = Math.hypot(dx, dy), lit = (-dx - dy) / (d + 0.01);
      if (d > vr + 5) continue;
      let c;
      if (d > vr) c = rp(STEEL, 1.4 + lit * 0.8, x, y);
      else if (d > vr - 6) c = rp(BRASS, 2.8 + lit * 1.8 * (d > vr - 3 ? 1 : -1), x, y);
      else {
        let v = 3 + lit * 0.6 - d / vr;
        if (Math.abs(d - (vr - 16)) < 1) v -= 1.6; else if (Math.abs(d - (vr - 15)) < 0.8) v += 1.2;
        if (Math.abs(d - 14) < 1) v += 1.4;
        c = rp(STEEL, v, x, y);
      }
      b.set(x, y, c);
    }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, bx = vaultX + Math.cos(a) * (vr - 10), by = vy + Math.sin(a) * (vr - 10); rDisc(bx, by, 2, b.P(BRASS[2])); b.set(bx - 1, by - 1, BRASS[5]); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; rSeg(vaultX + 0.5, vy + 0.5, vaultX + 0.5 + Math.cos(a) * 13, vy + 0.5 + Math.sin(a) * 13, 1.2, 1, b.P(BRASS[k < 3 ? 4 : 2])); rDisc(vaultX + 0.5 + Math.cos(a) * 14, vy + 0.5 + Math.sin(a) * 14, 1.6, b.P(BRASS[5])); }
    rDisc(vaultX + 0.5, vy + 0.5, 4, b.P(BRASS[3])); rDisc(vaultX - 0.5, vy - 0.5, 1.5, b.P(BRASS[5]));
    for (const oy of [-26, 22]) rRect(vaultX + vr + 1, vy + oy, 8, 9, (x, y) => b.set(x, y, rp(STEEL, x === vaultX + vr + 1 ? 5 : 2.4 - (y - vy - oy) * 0.1, x, y)));
    layers.wall = mkLayer(b.canvas(), 0.15, fy, 'full');
  }

  // ---- mid: copper vats, pipework, gauges, green lanterns
  {
    const COP = pal(['#120704', '#200d06', '#32160a', '#46200e', '#5c2c14', '#743a1c', '#8e4c26', '#a86434', '#c4844a']);
    const IRON = pal(['#06080a', '#0e1214', '#181e20', '#242c2e']);
    const w = 768, fy = 0.3, h = fullH(E, fy), b = new Buf(w, h);
    const floor = h - 20;
    const pipeH = (x0, x1, y, th) => { for (let x = x0; x < x1; x++) for (let j = 0; j < th; j++) { const n = (j + 0.5) / th * 2 - 1; let v = 1.2 + 5 * Math.max(0, Math.cos(Math.asin(n) + 0.7)); if ((x - x0) % 48 < 2) v += 1.2; b.set(x, y + j, rp(COP, v, x, y + j)); } };
    const pipeV = (x, y0, y1, th) => { for (let y = y0; y < y1; y++) for (let i = 0; i < th; i++) { const n = (i + 0.5) / th * 2 - 1; let v = 1.2 + 5 * Math.max(0, Math.cos(Math.asin(n) + 0.7)); if ((y - y0) % 40 < 2) v += 1.2; b.set(x + i, y, rp(COP, v, x + i, y)); } };
    pipeH(0, w, 30, 6); pipeH(0, w, 46, 4);
    const vats = [];
    for (let k = 0; k < 3; k++) {
      const cx = Math.floor(k * 256 + 60 + R() * 120), vw = 34 + Math.floor(R() * 10), vtop = floor - 92 - Math.floor(R() * 20);
      vats.push([cx, vw, vtop]);
      for (let y = vtop - vw * 0.5; y < floor; y++) {
        const yy = y - vtop, hw = yy < 0 ? vw * Math.sqrt(Math.max(0, 1 - (yy / (vw * 0.5)) ** 2)) : yy > floor - vtop - 10 ? vw * (1 - (yy - (floor - vtop - 10)) / 30) : vw;
        for (let x = Math.floor(cx - hw); x < cx + hw; x++) {
          const u = (x + 0.5 - cx) / vw, n = Math.asin(clamp(u, -1, 1));
          let v = 0.8 + 6.4 * Math.pow(Math.max(0, Math.cos(n + 0.65)), 1.4);
          if (yy >= 0 && (yy % 22 === 0 || yy % 22 === 1)) { v += yy % 22 ? -1.8 : 1.4; }
          else if (yy >= 0 && yy % 22 === 3 && (x % 5 === 0)) v += 2.4;
          b.set(x, Math.floor(y), rp(COP, v, x, Math.floor(y)));
        }
      }
      // sight glass with a gold level, gauge, spigot, legs
      const gx = Math.round(cx + vw * 0.35);
      for (let y = vtop + 8; y < floor - 16; y++) { b.set(gx, y, y > vtop + 40 ? GOLD[6] : hex('#2a3a30')); b.set(gx + 1, y, y > vtop + 40 ? GOLD[4] : hex('#1a241e')); b.set(gx - 1, y, BRASS[4]); b.set(gx + 2, y, BRASS[1]); }
      rDisc(cx - vw * 0.3, vtop + 16, 5, b.P(BRASS[3])); rDisc(cx - vw * 0.3, vtop + 16, 3.8, b.P(hex('#d8d4c0')));
      rLine(cx - vw * 0.3, vtop + 16, cx - vw * 0.3 + 3, vtop + 13, b.P(hex('#3a1010')));
      rRect(cx - 6, floor - 14, 10, 4, b.P(BRASS[3])); rRect(cx + 2, floor - 10, 2, 4, b.P(BRASS[2]));
      for (const s of [-1, 1]) rRect(cx + s * (vw - 8) - 1, floor - 6, 3, 6, b.P(IRON[2]));
      // pipe from the vat lid up into the header
      pipeV(cx - 2, 34, vtop - vw * 0.45, 5);
      rRect(cx - 5, 46, 11, 3, b.P(BRASS[2]));
      // valve wheel on the riser
      const vy2 = Math.floor((50 + vtop - vw * 0.45) / 2);
      for (let k2 = 0; k2 < 24; k2++) { const a = k2 / 24 * TAU; b.set(cx + 0.5 + Math.cos(a) * 5, vy2 + Math.sin(a) * 2, hex('#a02a20')); }
      rLine(cx - 4, vy2, cx + 5, vy2, b.P(hex('#701c16')));
    }
    // cross pipe between vats with an elbow down to the floor
    for (let k = 0; k < 2; k++) {
      const [ax, aw] = vats[k], [bx] = vats[k + 1], y = floor - 40 - k * 12;
      pipeH(ax + aw - 2, bx - 20, y, 4);
      pipeV(bx - 22, y, floor, 4);
    }
    // lanterns on chains from the header pipe
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(k * 192 + 150 + R() * 40), len = 18 + Math.floor(R() * 22);
      for (let y = 36; y < 36 + len; y += 2) b.set(x, y, IRON[3]);
      const ly = 36 + len;
      spr(b, x - 3, ly, ['..k..', '.kkk.', 'kgGgk', 'kgGgk', 'kgggk', 'kgggk', '.kkk.', '..k..'], { k: IRON[2], g: hex('#2aa850'), G: hex('#a0ffb0') });
      lanterns.push({ L: 'mid', x: x + 0.5, y: ly + 4, p: R() * TAU });
    }
    fadeRows(b, floor - 30, h, hex('#0a0804'), 0.55);
    layers.mid = mkLayer(b.canvas(), 0.3, fy, 'full');
  }

  // ---- heaps: gold mounds, coin stacks, sacks
  {
    const w = 768, h = 126, b = new Buf(w, h), base = h - 22;
    const SACK = pal(['#1a1208', '#2e2010', '#46321a', '#5e4626', '#786034']);
    const mounds = [];
    for (let k = 0; k < 4; k++) mounds.push({ x: k * 192 + 40 + R() * 110, wd: 38 + R() * 30, ht: 36 + R() * 34 });
    const hAt = x => { let m = -1e9; for (const M of mounds) { const d = wrapD(x - M.x, w) / M.wd; const v = M.ht * Math.exp(-d * d * 1.6); if (v > m) m = v; } return m; };
    const prof = new Float32Array(w);
    for (let x = 0; x < w; x++) prof[x] = base - hAt(x + 0.5) - (h2(x >> 1, 9, S) > 0.7 ? 1 : 0);
    for (let x = 0; x < w; x++) {
      const sl = prof[wrapP(x + 2, w)] - prof[wrapP(x - 2, w)];
      for (let y = Math.floor(prof[x]); y < h; y++) {
        const cyc = Math.floor(y / 2), cxc = Math.floor((x + (cyc % 2) * 2) / 4), lx = (x + (cyc % 2) * 2) % 4, ly = y % 2;
        const cr = h2(cxc, cyc, S + 11);
        let v = 3.8 - sl * 0.9 - (y - prof[x]) * 0.075 + (cr - 0.5) * 1.6;
        if (ly === 0 && lx === 1) v += 1.4; else if (ly === 1 && lx === 3) v -= 1.6; else if (lx === 0) v -= 0.6;
        if (y - prof[x] < 1) v += 1.2;
        b.set(x, y, rp(GOLD, v, x, y));
        if (ly === 0 && lx === 1 && v > 5.4 && cr > 0.75 && y < base - 4) glints.push([x, y]);
      }
    }
    // coin stacks at the feet of the heaps
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(R() * w), n = 4 + Math.floor(R() * 9), by = base + 2 + Math.floor(R() * 4);
      for (let c = 0; c < n; c++) for (let i = 0; i < 7; i++) {
        const y = by - c * 2;
        b.set(x + i, y, GOLD[i === 0 ? 6 : i === 6 ? 2 : 4]);
        b.set(x + i, y - 1, GOLD[i < 2 ? 7 : i === 6 ? 3 : 5]);
      }
      for (let i = 1; i < 6; i++) b.set(x + i, by - n * 2 + 1, GOLD[8]);
    }
    // sacks spilling coins
    for (let k = 0; k < 3; k++) {
      const x = Math.floor(k * 256 + 100 + R() * 120), by = base + 3;
      rEllipse(x, by - 9, 9, 9, (xx, yy) => b.set(xx, yy, rp(SACK, 3 - (xx - x) / 9 * 1.6 - (yy - by + 9) / 9 * 0.8 + ((xx + yy) % 3 === 0 ? -0.5 : 0), xx, yy)));
      rPoly([[x - 4, by - 17], [x + 4, by - 17], [x + 6, by - 23], [x - 5, by - 22]], (xx, yy) => b.set(xx, yy, rp(SACK, 2.6 - (xx - x) / 5, xx, yy)));
      for (let i = -3; i <= 3; i++) b.set(x + i, by - 18, SACK[0]);
      for (let i = 0; i < 9; i++) { const cx2 = x + 9 + i * 2 + Math.floor(R() * 2), cy2 = by - 2 + Math.floor(R() * 3); b.set(cx2, cy2, GOLD[7]); b.set(cx2 + 1, cy2, GOLD[5]); }
    }
    fadeRows(b, base - 6, h, hex('#1a1006'), 0.75, 1.3);
    layers.heap = mkLayer(b.canvas(), 0.42, 0.44, 'bottom');
  }

  // ---- near: big pipe along the ceiling with brackets, one lantern close by
  {
    const COP = pal(['#140804', '#24100a', '#3a1a0e', '#522614', '#6a341c', '#844626']);
    const w = 768, fy = 0.58, h = fullH(E, fy), b = new Buf(w, h);
    for (let x = 0; x < w; x++) for (let j = 0; j < 9; j++) {
      const n = (j + 0.5) / 9 * 2 - 1; let v = 0.6 + 4.6 * Math.max(0, Math.cos(Math.asin(n) + 0.7));
      if (x % 96 < 3) v += 1.2;
      b.set(x, j, rp(COP, v, x, j));
    }
    for (let x = 30; x < w; x += 96) { rRect(x, 9, 2, 5, b.P(COP[1])); }
    for (let k = 0; k < 2; k++) {
      const x = Math.floor(k * 384 + 80 + R() * 200), len = 34 + Math.floor(R() * 20);
      for (let y = 9; y < 9 + len; y += 2) { b.set(x, y, COP[2]); b.set(x, y + 1, COP[0]); }
      const ly = 9 + len;
      spr(b, x - 4, ly, ['..kkk..', '.kkkkk.', 'kgGGggk', 'kgGGggk', 'kggggdk', 'kggggdk', 'kggggdk', '.kkkkk.', '...k...'], { k: hex('#0c0e0c'), g: hex('#24a04a'), G: hex('#b0ffc0'), d: hex('#14602c') });
      lanterns.push({ L: 'near', x: x + 0.5, y: ly + 4, p: R() * TAU });
    }
    layers.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const glowG = ditherGlow(18, '#40ff80', 0.4), glowGs = ditherGlow(12, '#60ff90', 0.45);
  const motes = [];
  for (let i = 0; i < 22; i++) motes.push({ x: R() * (W + 20), y: R() * (H + 20), p: R(), r: 0.15 + R() * 0.3, v: 3 + R() * 6, s: R() * TAU });

  return {
    fog: '#1e2a16',
    back(g, cx, cy, t) {
      blit(g, layers.wall, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      blit(g, layers.heap, E, cx, cy, t);
      // glints winking across the gold
      const n = glints.length;
      if (n) for (let k = 0; k < 7; k++) {
        const ph = t * 1.3 + k * 0.37, i = Math.floor(h2(Math.floor(ph), k, S) * n), f = ph - Math.floor(ph);
        const [gx, gy] = glints[i];
        onScreen(layers.heap, E, cx, cy, t, gx, gy, 3, (x, y) => twinkle(g, Math.floor(x), Math.floor(y), Math.sin(f * Math.PI), '#ffffff', '#fff0a0'));
      }
      blit(g, layers.near, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lanterns.forEach((l, i) => {
        g.globalAlpha = clamp(0.6 + 0.15 * Math.sin(t * 4.3 + l.p) + 0.08 * Math.sin(t * 11 + i), 0, 1);
        const sp = l.L === 'near' ? glowG : glowGs, r = (sp.width - 1) >> 1;
        onScreen(layers[l.L], E, cx, cy, t, l.x, l.y, r + 2, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      for (const m of motes) {
        const ph = wrapP(t * m.r + m.p, 1);
        const x = Math.floor(wrapP(m.x + Math.sin(t * 0.7 + m.s) * 10 - cx * 1.1, sw2)) - 10;
        const y = Math.floor(wrapP(m.y - t * m.v - cy * 1.1, sh2)) - 10;
        const k = Math.sin(ph * Math.PI);
        g.globalAlpha = 0.25 + 0.6 * k;
        if (k > 0.85) twinkle(g, x, y, k * 0.7, '#fff6c0', '#e0b040');
        else { g.fillStyle = '#f0c850'; g.fillRect(x, y, 1, 1); }
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================

const BUILDERS = {
  hallo_out: buildHalloOut, hallo_in: buildHalloIn, july_out: buildJulyOut, july_in: buildJulyIn,
  july_rocket: buildJulyRocket, pat_out: buildPatOut, pat_in: buildPatIn,
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
