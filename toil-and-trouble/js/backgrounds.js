// Toil & Trouble — parallax backdrops.
//
// Every layer is rasterised once, pixel by pixel, into an offscreen canvas
// (limited palette, ordered dithering, no anti-aliasing) and then blitted at
// whole-pixel offsets each frame. Per-frame work is limited to blits, a few
// flickering glow sprites and a few dozen particles.
//
//   makeBackground(theme, { W, H, levelW, levelH, seed })
//     -> { drawBack(ctx, camX, camY, t), drawFront(ctx, camX, camY, t), fog }

export const THEMES = ['wood', 'bog', 'mine', 'belfry', 'village', 'keep', 'bonus'];

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

// ===========================================================================
// WOOD — Hollow Wood at dusk

function buildWood(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const SKY = pal(['#120b22', '#1b1131', '#271741', '#371c4f', '#4c2259', '#662861', '#843063', '#a33b5f', '#c24c57',
    '#db6450', '#ec834d', '#f6a654', '#fbc96c', '#fde49a', '#fff4cc']);
  const layers = {};

  // ---- sky
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  const sky = new Buf(sw, sh), base = new Float32Array(sh), glow = new Float32Array(sw * sh);
  const stops = [[0, 12.2], [24, 11.1], [50, 9.9], [80, 8.7], [112, 7.4], [146, 6.1], [184, 4.8], [228, 3.6], [290, 2.4],
    [380, 1.3], [520, 0.4], [700, 0]];
  const sunX = 300, sunD = 92, sunR = 25;
  for (let y = 0; y < sh; y++) {
    const d = sh - 1 - y; base[y] = interp(stops, d);
    for (let x = 0; x < sw; x++) {
      const dx = wrapD(x - sunX, sw), dy = d - sunD;
      const g = Math.max(0, 1 - Math.hypot(dx, dy * 1.35) / 160);
      const band = Math.max(0, 1 - Math.abs(dy + 18) / 52) * Math.max(0, 1 - Math.abs(dx) / 440);
      glow[y * sw + x] = 3.3 * g * g + 1.3 * band;
    }
  }
  const cm = new Mask(sw, sh);
  const streak = (cx, cy, len, th) => {
    const segs = Math.max(2, Math.round(len / 12));
    for (let s = 0; s < segs; s++) {
      const f = s / (segs - 1), taper = 1 - Math.abs(f - 0.5) * 1.5;
      rEllipse(cx - len / 2 + f * len + (R() - 0.5) * 6, cy + (R() - 0.5) * 2, 7 + R() * 9,
        Math.max(0.8, th * taper * (0.7 + R() * 0.5)), cm.P(1));
    }
  };
  for (let i = 0; i < 15; i++) streak(R() * sw, sh - 1 - (75 + R() * 150), 50 + R() * 170, 1.5 + R() * 3);
  streak(sunX - 8, sh - 1 - (sunD + 7), 130, 1.5);
  streak(sunX + 34, sh - 1 - (sunD - 8), 160, 1.2);
  streak(sunX - 44, sh - 1 - (sunD + 19), 96, 1.9);
  for (let y = 0; y < sh; y++) {
    const d = sh - 1 - y;
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x, gl = glow[i];
      let v = base[y] + gl, c;
      const dist = Math.hypot(wrapD(x - sunX, sw), d - sunD);
      if (cm.m[i]) {
        const below = cm.at(x, y + 1), below2 = cm.at(x, y + 2), above = cm.at(x, y - 1);
        if (!below) v = base[y] + gl * 1.1 + 1.8;
        else if (!below2) v = base[y] + gl * 0.8 + 0.6;
        else if (!above) v = base[y] + gl * 0.45 - 1.2;
        else v = base[y] + gl * 0.3 - 2.2;
        c = rp(SKY, v, x, y);
      } else if (dist < sunR + 0.5) {
        c = rp(SKY, 12.7 + Math.min(1.5, (sunR - dist) / 5), x, y);
      } else c = rp(SKY, v, x, y);
      sky.d[i] = c;
    }
  }
  const STAR = pal(['#6e4c8c', '#b89ad0', '#f4e4f8']);
  for (let i = 0; i < (sw * sh) / 420; i++) {
    const x = Math.floor(R() * sw), y = Math.floor(R() * sh);
    const v = base[y] + glow[y * sw + x];
    if (v < 3.4 && !cm.at(x, y)) sky.set(x, y, STAR[v < 1.6 && R() < 0.35 ? 2 : v < 2.4 ? 1 : 0]);
  }
  layers.sky = mkLayer(sky.canvas(), 0.03, fyS, 'full');

  // ---- sun rays (additive, same parallax as the sky)
  {
    const b = new Buf(sw, sh), rn = noise1(S + 77, 28, 1), rn2 = noise1(S + 78, 64, 1), c = hex('#ffb070');
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const dx = wrapD(x - sunX, sw), dy = (sh - 1 - y) - sunD, dist = Math.hypot(dx, dy);
      if (dist < sunR + 3 || dy < -30) continue;
      const ang = wrapP(Math.atan2(dy, dx) / TAU, 1);
      const st = clamp((rn(ang) * 0.7 + rn2(ang) * 0.3 - 0.46) * 3.2, 0, 1);
      const a = st * Math.exp(-dist / 210) * clamp((dy + 30) / 40, 0, 1) * 0.55;
      const q = dq(a * 4, x, y) / 4;
      if (q > 0) b.d[y * sw + x] = withA(c, Math.round(q * 120));
    }
    layers.rays = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- far hills with tiny conifers
  const FAR = pal(['#6a3361', '#7b3963', '#8f4166', '#a54a66', '#bd5865']);
  {
    const w = 768, h = 104, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 3, w, 50, 15, 4);
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x]); y < h; y++) m.set(x, y, 1);
    for (let i = 0; i < 170; i++) { const x = R() * w; conifer(m.P(1), x, top[Math.floor(x)] + 3, 4 + R() * 10, 1.6 + R() * 2.2, R); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.at(x, y)) continue;
      let v = 0.6;
      if (!m.at(x, y - 1)) v = 3.2; else if (!m.at(x - 1, y) || !m.at(x, y - 2)) v = 1.7;
      v += clamp((y - 58) / 40, 0, 1) * 2.4;
      b.d[y * w + x] = rp(FAR, v, x, y);
    }
    layers.far = mkLayer(b.canvas(), 0.07, 0.1, 'bottom');
  }

  // ---- conifer ridge
  const CON = pal(['#2a1736', '#341b42', '#40204c', '#4e2654', '#612c5a', '#7a345e', '#94405f']);
  {
    const w = 768, h = 132, b = new Buf(w, h), m = new Mask(w, h);
    const top = ridge(S + 5, w, 100, 9, 6);
    for (let i = 0; i < 80; i++) { const x = R() * w; conifer(m.P(2), x, top[Math.floor(x)] + 2, 16 + R() * 26, 4 + R() * 4, R); }
    for (let i = 0; i < 46; i++) { const x = R() * w; conifer(m.P(1), x, top[Math.floor(x)] + 12, 26 + R() * 40, 6 + R() * 5.5, R); }
    for (let x = 0; x < w; x++) for (let y = Math.floor(top[x] + 8); y < h; y++) m.set(x, y, 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.at(x, y); if (!k) continue;
      let v;
      const le = !m.at(x - 1, y), ue = !m.at(x, y - 1);
      if (k === 2) v = ue ? 4.6 : le ? 3.8 : 2.4;
      else v = ue ? 3.4 : le ? 2.5 : 0.7 + (m.at(x + 1, y) ? 0 : -0.5);
      v += clamp((y - 92) / 34, 0, 1) * 2.8;
      b.d[y * w + x] = rp(CON, v, x, y);
    }
    layers.con = mkLayer(b.canvas(), 0.15, 0.2, 'bottom');
  }

  // ---- giant hollow oaks
  const OAK = pal(['#0f0815', '#160b1e', '#1f1027', '#2a1531', '#3a1b3b', '#552443', '#7c3146', '#a8463f']);
  const LEAF = pal(['#0d0613', '#140a1b', '#1d0e25', '#28132f', '#381939', '#4f2141', '#6e2b46', '#93393f']);
  const lanterns = [];
  {
    const w = 768, fy = 0.3, h = fullH(E, fy), m = new Mask(w, h);
    const baseY = h + 2, hangs = [], trunks = [];
    for (let k = 0; k < 3; k++) {
      const cx = k * 256 + 70 + R() * 110, tw = 28 + R() * 14;
      const lean = (R() - 0.5) * 0.1, amp = 2 + R() * 5, ph = R() * TAU, fr = 0.015 + R() * 0.02;
      const bn = noise1(S + 40 + k, 14, 700);
      const centre = kk => cx + lean * kk + amp * Math.sin(ph + kk * fr);
      trunks.push({ centre, tw, baseY, cx });
      for (let y = -12; y <= baseY; y++) {
        const kk = baseY - y;
        const hw = tw * 0.5 * (1 - 0.22 * Math.min(1, kk / 240)) + (bn(kk) - 0.5) * 5 + tw * 0.42 * Math.exp(-kk / 7);
        const c = centre(kk);
        for (let x = Math.floor(c - hw); x <= Math.ceil(c + hw); x++) m.set(x, y, 1);
      }
      // roots crawling out of the base
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1, sx = centre(10) + side * tw * 0.32;
        limb(m.P(1), R, sx, baseY - 10 - R() * 6, side * (1.75 + R() * 0.35), 22 + R() * 24, 4 + R() * 2, 0, null, null);
      }
      const yTop = 16, yBot = Math.max(40, Math.min(h - 100, 120));
      for (let i = 0; i < 4; i++) {
        const y0 = yTop + R() * (yBot - yTop), side = i % 2 ? 1 : -1, kk = baseY - y0;
        limb(m.P(1), R, centre(kk) + side * tw * 0.2, y0, side * (0.6 + R() * 0.6), 44 + R() * 50, tw * 0.15 + 1.2, 2, null, hangs);
      }
      for (let i = 0; i < 2; i++) {
        const y0 = yBot + 20 + R() * Math.max(10, h - yBot - 150), side = R() < 0.5 ? -1 : 1, kk = baseY - y0;
        limb(m.P(1), R, centre(kk) + side * tw * 0.35, y0, side * (1.1 + R() * 0.3), 8 + R() * 8, 2.6, 0, null, null);
      }
    }
    const b = new Buf(w, h);
    const grooves = noise2(S + 50, 256, w, 14), plates = noise2(S + 52, 128, w, 5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      const dl = edgeDist(m, x, y, -1, 0, 7), dr = edgeDist(m, x, y, 1, 0, 7);
      let v = 1.5;
      if (dr === 1) v = 6.3; else if (dr === 2) v = 4.9; else if (dr === 3) v = 3.5; else if (dr <= 5) v = 2.4;
      else if (dl === 1) v = 3.9; else if (dl === 2) v = 2.8;
      const gr = grooves(x, y), pl = plates(x, y);
      if (gr > 0.6) v -= 1.1; else if (gr < 0.25) v += 0.5;
      if (pl > 0.74) v -= 0.7;
      if (!m.at(x, y - 1)) v += 1.3;
      else if (!m.at(x, y + 1) && dr > 2) v -= 0.6;
      b.d[y * w + x] = rp(OAK, v, x, y);
    }
    // knots
    trunks.forEach(T => {
      for (let j = 0; j < 2; j++) {
        const ky = h - 60 - R() * Math.min(h - 120, 120), kx = T.centre(T.baseY - ky) + (R() - 0.5) * T.tw * 0.4;
        rEllipse(kx, ky, 2.2, 3.2, b.P(OAK[0]));
        b.set(kx + 1, ky + 2, OAK[4]); b.set(kx + 2, ky + 1, OAK[5]); b.set(kx - 2, ky - 2, OAK[3]);
      }
    });
    // hollows
    const HOL = pal(['#060309', '#100710', '#241017', '#43191a', '#6e2e1e', '#a24a26']);
    const LAMP = { k: hex('#26120f'), y: hex('#ffe9a0'), o: hex('#ffad48'), r: hex('#c0602a') };
    const warm = hex('#9a4630');
    trunks.forEach((T, ti) => {
      const nh = 1 + (R() < 0.6 ? 1 : 0) + (h > 400 ? 2 : 0);
      for (let j = 0; j < nh; j++) {
        const hy = j < 2 ? h - 80 - R() * 62 - j * 28 : 60 + R() * (h - 260);
        const kk = T.baseY - hy, hx = T.centre(kk) + (R() - 0.5) * T.tw * 0.2;
        const type = (ti + j) % 4 === 3 ? 'eyes' : (ti + j) % 5 === 2 ? 'window' : 'lamp';
        const rx = type === 'window' ? 5 : 5 + R() * 2.5, ry = type === 'window' ? 5 : 8 + R() * 3;
        if (type === 'window') {
          glowInto(b, hx, hy, 14, warm, 0.32, true);
          rDisc(hx, hy, rx + 1.2, b.P(OAK[0]));
          rDisc(hx, hy, rx, (x, y) => b.set(x, y, rp([hex('#c86a2c'), hex('#ffb54c'), hex('#ffdc8a')], 2.2 - Math.hypot(x + 0.5 - hx, y + 0.5 - hy) / rx * 1.8, x, y)));
          rLine(hx - rx, hy, hx + rx, hy, b.P(hex('#3a1a12')));
          rLine(hx, hy - rx, hx, hy + rx, b.P(hex('#3a1a12')));
          rLine(hx - rx - 1, hy + rx + 2, hx + rx + 1, hy + rx + 2, b.P(OAK[5]));
          lanterns.push({ x: hx, y: hy, s: 0.9 });
          continue;
        }
        if (type === 'lamp') glowInto(b, hx, hy + ry * 0.3, 14, warm, 0.3, true);
        for (let y = Math.floor(hy - ry - 3); y <= hy + ry + 3; y++) for (let x = Math.floor(hx - rx - 3); x <= hx + rx + 3; x++) {
          const ex = (x + 0.5 - hx) / rx, ey = (y + 0.5 - hy) / ry, e = Math.hypot(ex, ey);
          if (e <= 1) {
            let v = 0.4 + (ey + 1) * 0.5;
            if (type === 'lamp') v += 2.6 * Math.max(0, 1 - Math.hypot(x + 0.5 - hx, (y + 0.5 - hy - ry * 0.25) * 1.2) / 6.5);
            b.set(x, y, rp(HOL, v, x, y));
          } else if (e <= 1.3 && m.at(x, y)) {
            if (ey < 0) b.set(x, y, OAK[0]);
            else if (type === 'lamp') { if (ey > 0.15) b.set(x, y, HOL[e < 1.16 ? 5 : 4]); }
            else if (ey > 0.3) b.set(x, y, OAK[4]);
          }
        }
        if (type === 'lamp') {
          const lx = Math.round(hx) - 1, ly = Math.round(hy + ry * 0.25) - 2;
          rLine(lx + 1, hy - ry + 1, lx + 1, ly - 1, b.P(LAMP.k));
          spr(b, lx, ly, ['kkk', 'kyk', 'koo', 'kkk'], LAMP);
          lanterns.push({ x: lx + 1, y: ly + 2, s: 1 });
        } else {
          const ex = Math.round(hx), ey = Math.round(hy - 1);
          b.set(ex - 2, ey, hex('#ffe066')); b.set(ex + 2, ey, hex('#ffe066'));
          b.set(ex - 2, ey + 1, hex('#8a5a1a')); b.set(ex + 2, ey + 1, hex('#8a5a1a'));
        }
      }
    });
    // canopy: overlapping leaf clumps, painted top to bottom
    const clumps = [];
    trunks.forEach(T => {
      for (let i = 0; i < 130; i++) {
        const a = R() * TAU, rr = Math.sqrt(R());
        clumps.push([T.cx + Math.cos(a) * rr * 98, 4 + Math.sin(a) * rr * 30, 4 + R() * 5]);
      }
      for (let i = 0; i < 40; i++) {
        const u = (R() - 0.5) * 1.8, x = T.cx + u * 98;
        clumps.push([x, 4 + 30 * Math.sqrt(Math.max(0, 1 - u * u)) + R() * 5, 2 + R() * 2.5]);
      }
    });
    clumps.sort((a, c) => a[1] - c[1]);
    const cmask = new Mask(w, h);
    for (const [x0, y0, r] of clumps) {
      for (let y = Math.floor(y0 - r - 1); y <= y0 + r + 1; y++) for (let x = Math.floor(x0 - r - 1); x <= x0 + r + 1; x++) {
        const dx = x + 0.5 - x0, dy = y + 0.5 - y0, d = Math.hypot(dx, dy);
        if (d > r - h2(wrapP(x, w), y, S + 7) * 1.4) continue;
        const l = clamp(1 - Math.hypot(dx + r * 0.45, dy + r * 0.55) / (r * 1.4), 0, 1);
        let v = 1.2 + l * 3.4 + (d > r - 1.3 && dy > 0 ? -0.9 : 0) + (h2(wrapP(x, w), y, S + 8) - 0.5) * 0.7;
        if (dy < -r + 1.6 && dx < r * 0.3) v += 1.2;
        b.set(x, y, rp(LEAF, v, x, y));
        cmask.set(x, y, 1);
      }
    }
    // lanterns hanging from limbs (below the canopy)
    let nl = 0;
    for (const [x, y] of hangs) {
      if (nl >= 4 || y < 40 || y > h - 70 || cmask.at(x, y + 4) || R() < 0.3) continue;
      const len = 8 + R() * 14;
      rLine(x, y, x, y + len, b.P(hex('#1a0d12')));
      const lx = Math.round(x) - 1, ly = Math.round(y + len);
      spr(b, lx, ly, ['.k.', 'kkk', 'kyk', 'koo', 'kkk'], LAMP);
      lanterns.push({ x: lx + 1, y: ly + 3, s: 0.8 });
      nl++;
    }
    // ground mist swallowing the roots
    const MI = hex('#4c2a56');
    for (let y = h - 46; y < h; y++) for (let x = 0; x < w; x++) {
      const c = b.d[y * w + x];
      if (!c) continue;
      const q = dq(clamp((y - (h - 46)) / 40, 0, 1) * 0.7 * 4, x, y) / 4;
      if (q > 0) b.d[y * w + x] = mixc(c, MI, q);
    }
    layers.oak = mkLayer(b.canvas(), 0.32, fy, 'full');
  }

  // ---- near: ivy vines, moss, one dark foreground trunk
  {
    const NEAR = pal(['#0a0510', '#110a18', '#190f21', '#26132c', '#3a1a36', '#552240']);
    const w = 768, fy = 0.5, h = fullH(E, fy), m = new Mask(w, h);
    const en = fbm1(S + 9, 6, w, 4), edge = new Float32Array(w);
    for (let x = 0; x < w; x++) { edge[x] = Math.max(0, en(x) * 46 - 16); for (let y = 0; y < edge[x]; y++) m.set(x, y, 1); }
    for (let x = 0; x < w; x += 3) if (edge[x] > 2) rDisc(x + R() * 2, edge[x], 2 + R() * 4, m.P(1));
    // foreground trunk
    const tx = 120 + R() * 500, tw = 24 + R() * 8, tph = R() * TAU, tn = noise1(S + 12, 20, 900);
    for (let y = 0; y < h; y++) {
      const k = h - y;
      const c = tx + Math.sin(tph + y * 0.011) * 7, hw = tw / 2 + (tn(y) - 0.5) * 5 + 12 * Math.exp(-k / 8);
      for (let x = Math.floor(c - hw); x <= c + hw; x++) m.set(x, y, 2);
    }
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      limb(m.P(2), R, tx + side * tw * 0.5, h - 6, side * 1.8, 26 + R() * 14, 4, 0, null, null);
    }
    for (let i = 0; i < 3; i++) {
      const y0 = 30 + R() * Math.min(h - 120, 90), side = i % 2 ? 1 : -1;
      limb(m.P(2), R, tx + side * tw * 0.4, y0, side * (0.9 + R() * 0.5), 24 + R() * 30, 3.5, 1, null, null);
    }
    // ivy vines
    const leaves = [];
    for (let i = 0; i < 15; i++) {
      const x0 = R() * w, y0 = Math.max(0, edge[Math.floor(x0)] - 2), len = 26 + Math.pow(R(), 1.4) * 150;
      const amp = 2 + R() * 5, ph = R() * TAU, fq = 0.03 + R() * 0.04;
      let next = 3 + R() * 4, side = R() < 0.5 ? -1 : 1;
      for (let k = 0; k < len; k++) {
        const x = Math.round(x0 + amp * Math.sin(ph + k * fq) * (k / len)), y = Math.round(y0 + k);
        m.set(x, y, 1);
        if (k > next && k < len - 1) { leaves.push([x, y, side]); side = -side; next = k + 3 + R() * 5; }
      }
      leaves.push([Math.round(x0 + amp * Math.sin(ph + len * fq)), Math.round(y0 + len), 0]);
    }
    const LS = [['.##', '###', '.#.'], ['##.', '###', '.#.'], ['.#.', '###', '.#.']];
    for (const [x, y, s] of leaves) {
      const pat = LS[s > 0 ? 0 : s < 0 ? 1 : 2], ox = s > 0 ? 1 : s < 0 ? -3 : -1;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (pat[j][i] === '#') m.set(x + ox + i, y - 1 + j, 3);
    }
    // moss strands
    for (let x = 0; x < w; x++) {
      if (edge[x] < 4 || h2(x, 3, S) < 0.55) continue;
      const len = 3 + h2(x, 4, S) * 14;
      for (let k = 0; k < len; k++) if ((k + x) % 2 === 0 || k < 3) m.set(x, edge[x] + 2 + k, 1);
    }
    const b = new Buf(w, h), gr = noise2(S + 13, 256, w, 12);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x];
      if (!k) continue;
      let v = 1.1;
      if (k === 2) {
        const dl = edgeDist(m, x, y, -1, 0, 4), dr = edgeDist(m, x, y, 1, 0, 3);
        v = dl === 1 ? 3.6 : dl === 2 ? 2.6 : dr === 1 ? 2.8 : dr === 2 ? 2 : 1.2;
        const g2 = gr(x, y);
        if (g2 > 0.62) v -= 0.9; else if (g2 < 0.25) v += 0.4;
      } else if (k === 3) {
        v = !m.at(x, y - 1) ? 3.4 : !m.at(x - 1, y) ? 2.6 : 1.6;
      } else {
        if (!m.at(x - 1, y)) v = 3.2; else if (!m.at(x, y - 1)) v = 2.4; else if (!m.at(x + 1, y)) v = 0.2;
      }
      b.d[y * w + x] = rp(NEAR, v, x, y);
    }
    layers.near = mkLayer(b.canvas(), 0.55, fy, 'full');
  }

  // ---- animated bits
  const glowS = glowSprite(9, '#ff9a3c', 0.55);
  const motes = [];
  for (let i = 0; i < 10; i++) motes.push({ x: R() * 768, y: 40 + R() * 150, p: R() * TAU, f: 0.4 + R() * 0.5 });
  const LEAFC = ['#c8502a', '#e07a30', '#a33a2a', '#eba046', '#7a2a2a'];
  const fall = [];
  for (let i = 0; i < 18; i++) fall.push({ x: R() * (W + 40), y: R() * (H + 40), vx: -(5 + R() * 10), vy: 9 + R() * 12,
    a: 4 + R() * 10, f: 0.6 + R() * 1.2, p: R() * TAU, sp: 2 + R() * 4, c: LEAFC[i % 5], d: LEAFC[(i + 2) % 5] });

  return {
    fog: '#5e3462',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.con, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.35);
      blit(g, layers.rays, E, cx, cy, t);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.oak, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lanterns.forEach((l, i) => {
        const fl = 0.55 + 0.25 * Math.sin(t * 7.3 + i * 2.1) * Math.sin(t * 3.1 + i) + 0.1 * Math.sin(t * 17 + i * 5);
        g.globalAlpha = clamp(fl * l.s, 0, 1);
        onScreen(layers.oak, E, cx, cy, t, l.x, l.y, 10, (x, y) => g.drawImage(glowS, Math.floor(x) - 9, Math.floor(y) - 9));
      });
      g.fillStyle = '#ffb860';
      for (const m of motes) {
        const a = 0.5 + 0.5 * Math.sin(t * 2.2 + m.p);
        if (a < 0.3) continue;
        g.globalAlpha = a * 0.8;
        onScreen(layers.oak, E, cx, cy, t, m.x + Math.sin(t * m.f + m.p) * 14, m.y + Math.sin(t * m.f * 1.3 + m.p * 2) * 8, 2,
          (x, y) => g.fillRect(Math.floor(x), Math.floor(y), 1, 1));
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
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
// BOG — Bramble Bog

function buildBog(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const SKY = pal(['#071113', '#0b181a', '#0f2022', '#13292a', '#183231', '#1e3c37', '#25473c', '#2e5341', '#3a6046',
    '#4a6e4b', '#5e7d51', '#768d58', '#91a062', '#adb46f', '#c8c787']);
  const layers = {};
  const stops = [[0, 12.4], [12, 11.4], [30, 10.1], [56, 8.7], [88, 7.3], [126, 5.9], [172, 4.6], [228, 3.3], [300, 2.1], [400, 1.1], [560, 0.3]];

  // ---- sky
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  const moonX = 250, moonD = 148, moonR = 14;
  {
    const b = new Buf(sw, sh), mist = new Mask(sw, sh);
    for (let i = 0; i < 9; i++) {
      const cx = R() * sw, d = 70 + R() * 120, len = 70 + R() * 170, nn = noise1(S + 200 + i, 8, 1);
      for (let s = 0; s < len; s += 6) {
        const f = s / len;
        if (nn(f) < 0.35) continue;
        rEllipse(cx - len / 2 + s, sh - 1 - d + Math.sin(f * 5 + i) * 2, 6 + R() * 6, 0.8 + (1 - Math.abs(f - 0.5) * 2) * 1.8, mist.P(1));
      }
    }
    for (let s = 0; s < 80; s += 6) rEllipse(moonX - 44 + s, sh - 1 - moonD + 5 + Math.sin(s * 0.2) * 1.5, 7, 1.2, mist.P(2));
    const MOON = pal(['#7e956c', '#a2b685', '#c6d4a2', '#e2ebc4', '#f4f8e2']);
    const crat = [];
    for (let i = 0; i < 6; i++) crat.push([(R() - 0.5) * moonR * 1.2, (R() - 0.5) * moonR * 1.2, 1.5 + R() * 2.5]);
    for (let y = 0; y < sh; y++) {
      const d = sh - 1 - y, bv = interp(stops, d);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - moonX, sw), dy = d - moonD, dist = Math.hypot(dx, dy);
        let v = bv + 3 * Math.pow(Math.max(0, 1 - dist / 90), 2.2);
        const mk = mist.at(x, y);
        let c;
        if (dist < moonR) {
          const nx = dx / moonR, ny = -dy / moonR, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          let mv = 1.6 + 2.6 * clamp(-nx * 0.45 - ny * 0.35 + nz * 0.8, 0, 1);
          for (const [cx2, cy2, cr] of crat) if (Math.hypot(dx - cx2, -dy - cy2) < cr) mv -= 0.9;
          c = rp(MOON, mk === 2 ? mv - 1.4 : mv, x, y);
        } else {
          if (mk) v += mk === 2 ? 2 : (mist.at(x, y - 1) ? 0.9 : 1.5);
          c = rp(SKY, v, x, y);
        }
        b.d[y * sw + x] = c;
      }
    }
    for (let i = 0; i < (sw * sh) / 600; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh);
      if (sh - y > 130 && !mist.at(x, y) && Math.hypot(wrapD(x - moonX, sw), sh - 1 - y - moonD) > 30)
        b.set(x, y, hex(R() < 0.3 ? '#c8d8b0' : '#5a7a64'));
    }
    layers.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- far: dead treeline, a stilt hut, still water reflecting the sky
  const fw = 768, fh = 100, hz = 26;
  {
    const b = new Buf(fw, fh), m = new Mask(fw, fh);
    for (let i = 0; i < 80; i++) rEllipse(R() * fw, hz - 1, 4 + R() * 10, 1.5 + R() * 5, m.P(1));
    for (let i = 0; i < 44; i++) {
      const x = R() * fw, th = 8 + R() * 30, two = R() < 0.3;
      const tx = x + (R() - 0.5) * 4;
      rLine(x, hz, tx, hz - th, m.P(1)); if (two) rLine(x + 1, hz, tx + 1, hz - th * 0.7, m.P(1));
      for (let j = 0; j < 3 + R() * 4; j++) {
        const f = 0.35 + R() * 0.6, yy = hz - th * f, xx = lerp(x, tx, f), s = R() < 0.5 ? -1 : 1, l = 2 + R() * 6;
        rLine(xx, yy, xx + s * l, yy - 1 - R() * l * 0.8, m.P(1));
      }
    }
    // stilt hut with a sickly lit window
    const hx = Math.floor(80 + R() * 200), hy = hz - 9;
    rRect(hx - 6, hy - 8, 13, 8, m.P(1));
    rPoly([[hx - 9, hy - 7], [hx + 9, hy - 8], [hx + 1, hy - 17]], m.P(1));
    rRect(hx + 3, hy - 17, 2, 5, m.P(1));
    for (const sx of [-5, -1, 4]) rLine(hx + sx, hy, hx + sx + (R() - 0.5) * 2, hz + 1, m.P(1));
    rLine(hx - 9, hy, hx + 9, hy, m.P(1));
    const FT = pal(['#112224', '#162b2c', '#1d3534', '#26413b', '#324f43', '#43614e']);
    const rip = noise2(S + 8, 48, fw, 2);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      let c;
      if (y <= hz) {
        if (!m.at(x, y)) continue;
        let v = 0.8 + (m.at(x, y - 1) ? 0 : 1.1);
        v += clamp((y - (hz - 12)) / 12, 0, 1) * 3;
        c = rp(FT, v, x, y);
      } else {
        const dm = y - hz;
        const sx = Math.round(Math.sin(y * 0.9 + x * 0.02) * (0.5 + dm * 0.03));
        const refl = m.at(x + sx, hz - dm);
        const v = interp(stops, dm * 2.3 + 14) - 2.6 - dm * 0.01 + (rip(x, y) - 0.5) * 1.1;
        if (dm === 1) c = rp(SKY, 10.4, x, y);
        else if (refl && dm % 3 !== 2) c = rp(FT, 0.6 + (rip(x, y) > 0.72 ? 0.8 : 0), x, y);
        else c = rp(SKY, v, x, y);
      }
      b.d[y * fw + x] = c;
    }
    b.set(hx - 2, hy - 5, hex('#e8ec80')); b.set(hx - 1, hy - 5, hex('#e8ec80')); b.set(hx - 2, hy - 4, hex('#a8c060')); b.set(hx - 1, hy - 4, hex('#a8c060'));
    for (let dm = 3; dm < 22; dm += 2) if (h2(dm, 1, S) < 0.75) b.set(hx - 2 + (dm % 4 === 1 ? 1 : 0), hz + dm, hex('#8aa060'));
    layers.far = mkLayer(b.canvas(), 0.08, 0.1, 'bottom');
    const frames = [];
    const G = [hex('#7e9a6a', 150), hex('#a8c084', 190), hex('#d4e2a8', 210)];
    for (let f = 0; f < 4; f++) {
      const gb = new Buf(fw, fh), rr = mulberry32(S + 100 + f);
      for (let i = 0; i < 170; i++) {
        const dm = 2 + Math.floor(Math.pow(rr(), 1.5) * (fh - hz - 3)), y = hz + dm;
        const x = Math.floor(rr() * fw), len = 1 + Math.floor(rr() * (2 + dm / 12));
        const col = G[dm < 10 ? 2 : rr() < 0.5 ? 1 : 0];
        for (let k = 0; k < len; k++) gb.set(x + k, y, col);
      }
      frames.push(gb.canvas());
    }
    layers.glint = { ...mkLayer(frames[0], 0.08, 0.1, 'bottom'), frames };
  }

  // ---- mid: gnarled dead trees standing in the water, moss, reeds, reflections
  const wisps = [];
  {
    const w = 768, h = 168, wl = h - 36, b = new Buf(w, h), m = new Mask(w, h);
    const MID = pal(['#0b1714', '#11201c', '#182a24', '#21362d', '#2d4638', '#3d5946', '#536f58']);
    const MOSS = pal(['#16261f', '#1d3027', '#26402e', '#33523a', '#466a4a']);
    const drapes = [];
    const tree = (x, by, hh, th, nb) => {
      let px = x, py = by, a = (R() - 0.5) * 0.5;
      const pts = [], segs = Math.ceil(hh / 5);
      for (let s = 0; s <= segs; s++) {
        pts.push([px, py, th * (1 - s / segs * 0.8)]);
        a += (R() - 0.5) * 0.5; a *= 0.9;
        px += Math.sin(a) * 5; py -= Math.cos(a) * 5;
      }
      for (let s = 0; s < segs; s++) rSeg(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], pts[s][2], pts[s + 1][2], m.P(1));
      for (let i = 0; i < nb; i++) {
        const p = pts[Math.floor(segs * (0.3 + R() * 0.68))], side = i % 2 ? 1 : -1;
        limb(m.P(1), R, p[0], p[1], side * (0.6 + R() * 1.0), hh * (0.22 + R() * 0.3), Math.max(0.6, p[2] * 0.65), 2, drapes, drapes, 0.05);
      }
      rEllipse(x, by + 1, th * 2.4 + 3, 3, m.P(1));
      for (let i = 0; i < 3; i++) limb(m.P(1), R, x + (i - 1) * th, by - 2, (i - 1) * 1.9 || 2.6, 6 + R() * 6, th * 0.4, 0, null, null);
      wisps.push({ x: x + (R() - 0.5) * 40, y: by - 20 - R() * 40, p: R() * TAU });
    };
    for (let k = 0; k < 3; k++) tree(k * 256 + 40 + R() * 170, wl + (R() - 0.5) * 6, 92 + R() * 36, 5 + R() * 2.5, 6 + Math.floor(R() * 3));
    for (let k = 0; k < 3; k++) tree(k * 256 + 170 + R() * 60, wl - 4 + R() * 4, 38 + R() * 24, 2.4 + R(), 3);
    for (let i = 0; i < 90; i++) {
      const x = R() * w, by = wl + 2 + R() * 6, hh = 5 + R() * 15, lean = (R() - 0.5) * 4;
      rLine(x, by, x + lean, by - hh, m.P(3));
      if (R() < 0.4) { m.set(x + lean, by - hh + 1, 4); m.set(x + lean, by - hh + 2, 4); m.set(x + lean, by - hh + 3, 4); }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let c;
      if (k === 1) {
        let v = 1.4;
        if (!m.at(x - 1, y)) v = 3.8; else if (!m.at(x, y - 1)) v = 3; else if (!m.at(x - 2, y)) v = 2.4; else if (!m.at(x + 1, y)) v = 0.4;
        c = rp(MID, v, x, y);
      } else if (k === 3) c = MID[m.at(x - 1, y) ? 1 : 3];
      else c = hex('#2e2c1a');
      b.d[y * w + x] = c;
    }
    // moss curtains
    for (const [x, y] of drapes) {
      if (R() < 0.35 || y > wl - 10) continue;
      const n = 1 + Math.floor(R() * 3), L0 = 6 + R() * 16;
      for (let j = 0; j < n; j++) {
        const len = L0 * (0.5 + 0.5 * Math.sin(Math.PI * (j + 0.5) / n)), xx = Math.round(x) - (n >> 1) + j;
        for (let k = 1; k < len; k++) {
          const f = k / len;
          if (f > 0.5 && (k + xx) % 2) continue;
          if (j > 0 && j < n - 1 && f > 0.8) continue;
          if (!m.at(xx, y + k) || f < 0.15) b.set(xx, y + k, rp(MOSS, 3.2 - f * 3 - (j === 0 ? 0.5 : 0), xx, y + k));
        }
      }
    }
    // reflections below the waterline
    const RC = pal(['#0a1513', '#0e1c19']);
    for (let y = wl - 1; y >= 0; y--) for (let x = 0; x < w; x++) {
      if (!b.d[y * w + x]) continue;
      const ry = 2 * wl - y + 2;
      if (ry >= h) continue;
      const dm = ry - wl;
      if (dm % 3 === 2 || (dm > 18 && dm % 2)) continue;
      const sx = Math.round(Math.sin(ry * 0.8) * (0.4 + dm * 0.05));
      if (!b.get(x + sx, ry)) b.set(x + sx, ry, RC[dm < 10 ? 1 : 0]);
    }
    layers.mid = mkLayer(b.canvas(), 0.2, 0.25, 'bottom');
  }

  // ---- near: overhanging branches with moss curtains, reeds at the bottom
  {
    const NEAR = pal(['#050b0a', '#091310', '#0e1b17', '#162820', '#22382c', '#304a38']);
    const w = 768, fy = 0.45, h = fullH(E, fy), m = new Mask(w, h);
    const en = fbm1(S + 21, 5, w, 3);
    for (let x = 0; x < w; x++) { const e = Math.max(0, en(x) * 34 - 14); for (let y = 0; y < e; y++) m.set(x, y, 1); }
    const drapes = [];
    for (let i = 0; i < 2; i++) {
      const x0 = i * 384 + R() * 200, side = i ? -1 : 1;
      limb(m.P(1), R, x0, -6, side * (1.9 + R() * 0.3), 110 + R() * 60, 5.5, 2, drapes, drapes, 0);
    }
    for (let x = 0; x < w; x += 2) if (h2(x, 9, S) > 0.75) { let y0 = 0; while (y0 < h && m.at(x, y0)) y0++; if (y0 > 2) drapes.push([x, y0 - 1]); }
    for (const [x, y] of drapes) {
      if (y > h - 60) continue;
      const n = 1 + Math.floor(h2(Math.floor(x), Math.floor(y), S) * 4), L0 = 6 + h2(Math.floor(y), Math.floor(x), S) * 22;
      for (let j = 0; j < n; j++) {
        const len = L0 * (0.4 + 0.6 * Math.sin(Math.PI * (j + 0.5) / n)), xx = Math.round(x) - (n >> 1) + j;
        for (let k = 0; k < len; k++) if (k < len * 0.6 || (k + xx) % 2 === 0) m.set(xx, y + k, 2);
      }
    }
    for (let i = 0; i < 5; i++) {
      const cx = R() * w;
      for (let j = 0; j < 8; j++) {
        const x = cx + (R() - 0.5) * 20, hh = 14 + R() * 22, lean = (R() - 0.5) * 7;
        rLine(x, h, x + lean, h - hh, m.P(1));
        if (R() < 0.5) rRect(x + lean - 0.5, h - hh, 2, 4, m.P(1));
      }
    }
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x];
      if (!k) continue;
      let v = 1;
      if (k === 2) v = !m.at(x - 1, y) ? 3.2 : 2.2;
      else if (!m.at(x - 1, y)) v = 3; else if (!m.at(x, y - 1)) v = 2.2; else if (!m.at(x + 1, y)) v = 0.2;
      b.d[y * w + x] = rp(NEAR, v, x, y);
    }
    layers.near = mkLayer(b.canvas(), 0.45, fy, 'full');
  }

  // ---- front fog + fireflies
  const fogs = [
    { cv: fogStrip(S + 31, 512, 26, '#7fa384', 0.46, 8), y: 150, v: 6, f: 1.05 },
    { cv: fogStrip(S + 32, 512, 20, '#94b090', 0.38, 6), y: 182, v: -4, f: 1.2 },
    { cv: fogStrip(S + 33, 512, 16, '#6d9278', 0.3, 10), y: 106, v: 3, f: 1.1 },
  ];
  const flies = [];
  for (let i = 0; i < 18; i++) flies.push({ x: R() * (W + 40), y: 60 + R() * 140, p: R() * TAU, q: R() * TAU, f: 0.3 + R() * 0.5, b: 0.8 + R() * 1.6, back: i < 8 });
  const wispS = glowSprite(4, '#b8f0d0', 0.6);
  const glint = layers.glint;

  return {
    fog: '#3d6450',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, glint, E, cx, cy, t, glint.frames[Math.floor(t * 3) & 3]);
      blit(g, layers.mid, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      wisps.forEach((wp, i) => {
        g.globalAlpha = clamp(0.45 + 0.35 * Math.sin(t * 1.7 + wp.p), 0, 1);
        onScreen(layers.mid, E, cx, cy, t, wp.x + Math.sin(t * 0.5 + wp.p) * 10, wp.y + Math.sin(t * 0.9 + i) * 4, 6,
          (x, y) => g.drawImage(wispS, Math.floor(x) - 4, Math.floor(y) - 4));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      drawFlies(g, cx, cy, t, true);
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const dy = (E.maxCamY - cy) * 1.0;
      for (const f of fogs) strip(g, f.cv, f.v * t + cx * f.f, f.y + dy);
      drawFlies(g, cx, cy, t, false);
    },
  };
  function drawFlies(g, cx, cy, t, back) {
    const sw2 = W + 40;
    for (const f of flies) {
      if (f.back !== back) continue;
      const a = Math.sin(t * f.b + f.q);
      if (a < 0) continue;
      const par = back ? 0.3 : 1.1;
      const x = Math.floor(wrapP(f.x + Math.sin(t * f.f + f.p) * 22 - cx * par, sw2)) - 20;
      const y = Math.floor(f.y + Math.sin(t * f.f * 1.4 + f.q) * 10 + (E.maxCamY - cy) * par);
      g.globalAlpha = a * (back ? 0.6 : 0.9);
      g.fillStyle = '#e8ff8a'; g.fillRect(x, y, 1, 1);
      g.globalAlpha = a * (back ? 0.25 : 0.35);
      g.fillStyle = '#a8e060'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
    }
    g.globalAlpha = 1;
  }
}

// ===========================================================================
// MINE — Cinder Mine

function buildMine(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const MAG = pal(['#3a0f0a', '#6a1a0c', '#a8300e', '#e0581a', '#ff9030', '#ffd060', '#fff2b0']);
  const veinGlow = hex('#d0481c');

  // ---- far cavern wall, lit from a magma lake far below
  {
    const BK = pal(['#060509', '#0a080d', '#0f0b12', '#150f17', '#1d121a', '#28161b', '#36191b', '#4a1f1b', '#62281c', '#80341d', '#a5461f']);
    const w = 768, fy = 0.06, h = fullH(E, fy), b = new Buf(w, h);
    const strata = fbm2(S + 1, 10, w, 7, 3), rock = fbm2(S + 2, 48, w, 10, 2), pool = fbm1(S + 4, 5, w, 2), tops = fbm1(S + 3, 24, w, 3);
    for (let y = 0; y < h; y++) {
      const d = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const wob = Math.sin(x * 0.013) * 10;
        const sv = strata(x, y + wob), sv2 = strata(x, y + 3 + wob);
        let v = 2.5 + (sv - 0.5) * 2.4 + (rock(x, y) - 0.5) * 0.9;
        if (sv2 - sv > 0.06) v += 1.0;
        v += Math.exp(-d / 64) * (0.55 + 0.9 * pool(x)) * 5.6 + Math.exp(-d / 170) * 1.8;
        if (y < tops(x) * 54 - 12) v = 0.6 + rock(x, y) * 0.8;
        b.d[y * w + x] = rp(BK, v, x, y);
      }
    }
    // distant silhouettes against the glow: a headframe and a trestle
    const sil = hex('#100b10');
    const hx = 150 + R() * 100, gy = h - 1;
    rLine(hx - 16, gy, hx - 2, gy - 70, b.P(sil)); rLine(hx - 15, gy, hx - 1, gy - 70, b.P(sil));
    rLine(hx + 16, gy, hx + 2, gy - 70, b.P(sil)); rLine(hx + 15, gy, hx + 1, gy - 70, b.P(sil));
    for (let k = 1; k < 4; k++) rLine(hx - 16 + k * 3.5, gy - k * 17, hx + 16 - k * 3.5, gy - k * 17, b.P(sil));
    for (let a = 0; a < TAU; a += 0.05) b.set(hx + Math.cos(a) * 11, gy - 74 + Math.sin(a) * 11, sil);
    for (let k = 0; k < 6; k++) rLine(hx, gy - 74, hx + Math.cos(k * TAU / 6) * 11, gy - 74 + Math.sin(k * TAU / 6) * 11, b.P(sil));
    const ty = h - 46;
    for (let x = 0; x < w; x++) { if (wrapD(x - hx, w) > -40 && wrapD(x - hx, w) < 40) continue; b.set(x, ty, sil); }
    for (let x = 0; x < w; x += 14) {
      if (Math.abs(wrapD(x - hx, w)) < 40) continue;
      rLine(x, ty, x, h, b.P(sil));
      rLine(x, ty + 1, x + 14, ty + 15, b.P(sil)); rLine(x + 14, ty + 1, x, ty + 15, b.P(sil));
    }
    // lava falls
    for (let i = 0; i < 3; i++) {
      const x0 = i === 0 ? 110 : R() * w, wd = 2 + Math.floor(R() * 2);
      for (let y = Math.floor(14 + R() * 30); y < h; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.05 + i) * 1.5);
        for (let k = 0; k < wd; k++) b.set(x + k, y, rp(MAG, 2.6 + (k === 1 ? 1 : 0) + ((y + i * 3) % 5 === 0 ? 1 : 0), x + k, y));
        b.set(x - 1, y, rp(BK, 8, x - 1, y)); b.set(x + wd, y, rp(BK, 7.4, x + wd, y));
      }
    }
    layers.wall = mkLayer(b.canvas(), 0.04, fy, 'full');
  }

  // ---- far: rock spires standing in a lava lake, glowing veins, a rail trestle
  let glowFar;
  {
    const RK = pal(['#0b080c', '#120c12', '#1a1117', '#24151a', '#34191a', '#4c201a', '#6a2a1a', '#8e3a1c']);
    const w = 768, fy = 0.14, h = fullH(E, fy), m = new Mask(w, h), lake = h - 26;
    for (let i = 0; i < 7; i++) {
      const cx = R() * w, hw = 12 + R() * 22, hh = 60 + R() * 90, nn = noise1(S + 60 + i, 8, 300);
      for (let y = Math.floor(lake - hh); y < h; y++) {
        const f = Math.min(1, (y - (lake - hh)) / hh), ww = hw * Math.pow(Math.max(0, f), 0.75) + (nn(y) - 0.5) * 6 + (y > lake - 6 ? (y - lake + 6) * 0.8 : 0);
        for (let x = Math.floor(cx - ww); x <= cx + ww; x++) m.set(x, y, 1);
      }
    }
    for (let i = 0; i < 9; i++) {
      const cx = R() * w, hw = 8 + R() * 18, hh = 20 + R() * 60, nn = noise1(S + 80 + i, 8, 300);
      for (let y = 0; y < hh; y++) {
        const f = 1 - y / hh, ww = hw * Math.pow(f, 0.8) + (nn(y) - 0.5) * 4;
        for (let x = Math.floor(cx - ww); x <= cx + ww; x++) m.set(x, y, 1);
      }
    }
    const ceil = fbm1(S + 9, 10, w, 3);
    for (let x = 0; x < w; x++) for (let y = 0; y < ceil(x) * 22; y++) m.set(x, y, 1);
    const b = new Buf(w, h), tex = fbm2(S + 61, 64, w, 6, 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (y >= lake && !m.at(x, y)) {
        // the lava lake surface
        const nn = tex(x * 2, y * 3), dl = y - lake;
        let v = 3.6 - dl * 0.1 + (nn - 0.5) * 1.3;
        if (nn > 0.66) v = 1.3 + (nn - 0.66) * 2;
        if (dl === 0) v = 5.6; else if (dl === 1) v = 4.6;
        b.d[y * w + x] = rp(MAG, v, x, y);
        continue;
      }
      if (!m.m[y * w + x]) continue;
      const d = lake - y, lit = Math.exp(-Math.max(0, d) / 60);
      let v = 0.5 + (tex(x, y) - 0.5) * 0.9 + lit * 1.6;
      if (!m.at(x, y + 1)) v += 3.4;
      else if (!m.at(x - 1, y) || !m.at(x + 1, y)) v += 1.4 + lit * 3;
      else if (!m.at(x - 2, y) || !m.at(x + 2, y)) v += 0.6 + lit * 1.4;
      if (y % 9 === 0 && tex(x, y) > 0.5) v -= 0.6;
      b.d[y * w + x] = rp(RK, v, x, y);
    }
    // rail trestle
    const ry = h - 100, TR = hex('#1a100c'), TRL = hex('#4a2c1a'), TRM = hex('#2a1a12');
    for (let x = 0; x < w; x++) { b.set(x, ry - 1, TRL); b.set(x, ry, TRM); b.set(x, ry + 1, TR); if (x % 4 === 0) b.set(x, ry + 2, TR); }
    for (let x = 0; x < w; x += 24) {
      for (const px of [x, x + 1]) for (let y = ry + 2; y < lake; y++) b.set(px - (y - ry) * 0.06, y, y % 2 ? TR : TRM);
      rLine(x, ry + 2, x + 23, ry + 24, b.P(TR)); rLine(x + 24, ry + 2, x + 1, ry + 24, b.P(TR));
      rLine(x - 1, ry + 25, x + 23, ry + 25, b.P(TRM));
      rLine(x, ry + 26, x + 22, ry + 52, b.P(TR)); rLine(x + 23, ry + 26, x + 1, ry + 52, b.P(TR));
      if (x % 96 === 0) {
        b.set(x, ry - 4, hex('#ffd070')); b.set(x, ry - 3, hex('#c07030')); b.set(x, ry - 2, TR);
        glowInto(b, x + 0.5, ry - 3.5, 5, hex('#c06a28'), 0.5);
      }
    }
    for (let i = 0; i < 2; i++) {
      const x = Math.floor(R() * w);
      spr(b, x, ry - 7, ['kkkkkkkkk', 'kwwwwwwwk', 'kkkkkkkkk', '.oo...oo.'], { k: TR, w: hex('#3a2016'), o: hex('#0c0808') });
    }
    // glowing veins in the rock
    const gl = new Buf(w, h), veins = [];
    for (let i = 0; i < 26; i++) {
      let x = 0, y = 0, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) { x = R() * w; y = 10 + R() * (lake - 20); ok = m.at(x, y) && m.at(x, y + 6); }
      if (!ok) continue;
      let a = (R() - 0.5) * 1.2, run = 0;
      const len = 24 + R() * 50;
      for (let s = 0; s < len; s++) {
        if (!m.at(x, y) || !m.at(x + 1, y) || !m.at(x - 1, y)) break;
        veins.push([x, y]);
        b.set(x, y, MAG[s % 7 === 0 ? 5 : 4]);
        if (s % 2) b.set(x + (a > 0 ? -1 : 1), y, MAG[2]);
        if (--run <= 0) { a = clamp(a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), -1.1, 1.1); run = 3 + R() * 6; }
        if (R() < 0.04) { let bx = x, by = y; const ba = a + (R() < 0.5 ? -1.2 : 1.2); for (let k = 0; k < 6 + R() * 8; k++) { bx += Math.sin(ba); by += Math.cos(ba); if (!m.at(bx, by)) break; b.set(bx, by, MAG[k < 3 ? 3 : 2]); } }
        gl.set(x, y, 1);
        x += Math.sin(a); y += Math.cos(a);
      }
    }
    const halo = new Buf(w, h);
    for (let i = 0; i < veins.length; i += 2) glowInto(halo, veins[i][0] + 0.5, veins[i][1] + 0.5, 4.5, veinGlow, 0.24);
    for (let x = 0; x < w; x += 3) glowInto(halo, x, lake + 2, 10, veinGlow, 0.3);
    glowFar = halo.canvas();
    layers.rocks = mkLayer(b.canvas(), 0.14, fy, 'full');
  }

  // ---- mid: timber scaffolds, a winding wheel, ore buckets, crystal clusters
  const lamps = [];
  {
    const WD = pal(['#100a07', '#1c120c', '#2c1c12', '#40291a', '#5a3a22', '#7a5230', '#9c6c3c']);
    const CR = pal(['#0e2a36', '#164a5a', '#22788a', '#3cb0be', '#8ae8ea', '#e4ffff']);
    const RK = pal(['#0c080b', '#140d12', '#1e1318', '#2a1a1c', '#3a221e', '#52301f']);
    const w = 768, fy = 0.3, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const tex = fbm2(S + 121, 96, w, 5, 2);
    for (let i = 0; i < 4; i++) {
      const cx = i * 192 + R() * 150, wd = 40 + R() * 60, hh = 34 + R() * 50, nn = noise1(S + 120 + i, 10, 400);
      for (let x = Math.floor(cx - wd); x <= cx + wd; x++) {
        const f = 1 - Math.abs(x - cx) / wd, top = h - hh * Math.pow(f, 0.6) - nn(x) * 16 - Math.abs(Math.sin(x * 0.31 + i)) * 4 * f;
        for (let y = Math.floor(top); y < h; y++) m.set(x, y, 1);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      let v = 1.2 + (tex(x, y) - 0.5) * 1.4;
      const sl = (y + Math.floor(tex(x, 0) * 10) + Math.floor(x / 23) % 3) % 9;
      if (sl === 0) v -= 0.9; else if (sl === 1) v += 0.9; else if (sl === 2) v += 0.3;
      if (!m.at(x, y - 1)) v = 4; else if (!m.at(x, y - 2)) v = 3; else if (!m.at(x - 1, y)) v += 1.2; else if (!m.at(x + 1, y)) v -= 0.4;
      b.d[y * w + x] = rp(RK, v, x, y);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(R() * w); let y = 0; while (y < h && !m.at(x, y)) y++;
      if (y >= h - 4) continue;
      const r = 1.5 + R() * 3;
      rDisc(x, y - r * 0.4, r, (px, py) => b.set(px, py, rp(RK, 1.4 + clamp(-(px + 0.5 - x) - (py + 0.5 - y + r * 0.4), -r, r) / r * 1.6, px, py)));
    }
    const crystal = (cx, cy, n, sc) => {
      glowInto(b, cx, cy - 6 * sc, 16 * sc, hex('#1e6a7a'), 0.45, true);
      for (let i = 0; i < n; i++) {
        const a = (R() - 0.5) * 1.5, len = (8 + R() * 14) * sc, wd = (2 + R() * 2) * sc;
        const dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx;
        const bx = cx + (R() - 0.5) * 8 * sc, by = cy;
        const tip = [bx + dx * len, by + dy * len];
        const pts = [[bx - px * wd, by - py * wd], [bx + dx * len * 0.78 - px * wd, by + dy * len * 0.78 - py * wd], tip,
          [bx + dx * len * 0.78 + px * wd, by + dy * len * 0.78 + py * wd], [bx + px * wd, by + py * wd]];
        rPoly(pts, (x, y) => {
          const s = (x + 0.5 - bx) * px + (y + 0.5 - by) * py;
          const along = ((x + 0.5 - bx) * dx + (y + 0.5 - by) * dy) / len;
          b.set(x, y, rp(CR, (s > 0 ? 3.2 : 1.8) + along * 1.2, x, y));
        });
        rLine(bx, by, tip[0], tip[1], b.P(CR[4]));
        b.set(tip[0], tip[1], CR[5]);
      }
    };
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(R() * w);
      let y = 0; while (y < h && !m.at(x, y)) y++;
      if (y >= h - 2) continue;
      crystal(x, y + 2, 4 + Math.floor(R() * 4), 0.8 + R() * 0.5);
    }
    // plank beam with grain
    const beam = (x0, y0, x1, y1, th) => {
      const L = Math.hypot(x1 - x0, y1 - y0);
      rSeg(x0, y0, x1, y1, th, th, (x, y) => {
        const along = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (L * L);
        b.set(x, y, rp(WD, 2.6 + (h2(Math.floor(along * 9), y, S) - 0.5) * 1.2 + (y <= Math.min(y0, y1) - th + 1 ? 1.4 : 0), x, y));
      });
    };
    const post = (px, y0, y1) => { for (let y = Math.floor(y0); y < y1; y++) { b.set(px - 1, y, WD[2]); b.set(px, y, WD[4]); b.set(px + 1, y, WD[3]); b.set(px + 2, y, WD[1]); } };
    const scaffolds = [];
    for (let i = 0; i < 2; i++) {
      const x0 = Math.floor(i * 384 + 40 + R() * 150), wd = 34 + Math.floor(R() * 20), hh = Math.min(h - 10, 110 + R() * 60 + (h - 217) * 0.6);
      const yt = Math.floor(h - hh);
      scaffolds.push([x0, wd, yt]);
      post(x0, yt, h); post(x0 + wd, yt, h);
      for (let y = yt + 6; y < h; y += 30) {
        beam(x0 - 3, y, x0 + wd + 4, y, 1.3);
        if (y + 30 < h) { rLine(x0 + 2, y + 2, x0 + wd - 1, y + 28, b.P(WD[2])); rLine(x0 + wd - 1, y + 2, x0 + 2, y + 28, b.P(WD[1])); }
      }
      const py = yt + 6;
      for (let x = x0 - 8; x < x0 + wd + 9; x++) { b.set(x, py - 2, WD[6]); b.set(x, py - 1, WD[5]); b.set(x, py, x % 6 ? WD[3] : WD[1]); b.set(x, py + 1, WD[1]); }
      const lx = x0 + wd + 5;
      rLine(lx, py + 2, lx, py + 7, b.P(WD[0]));
      glowInto(b, lx, py + 10, 14, hex('#c06a28'), 0.4, true);
      spr(b, lx - 1, py + 8, ['kkk', 'kyk', 'kok', 'kkk'], { k: hex('#1a100a'), y: hex('#fff0b0'), o: hex('#ffb040') });
      lamps.push({ L: 'mid', x: lx, y: py + 10 });
      const lxx = x0 + Math.floor(wd / 2) - 2;
      for (let y = py + 2; y < h; y++) { b.set(lxx, y, WD[3]); b.set(lxx + 4, y, WD[2]); if (y % 4 === 0) for (let k = 1; k < 4; k++) b.set(lxx + k, y, WD[4]); }
    }
    // winding wheel on an A-frame
    {
      const hx = Math.floor(scaffolds[0][0] + 190 + R() * 60), top = Math.max(30, h - 150);
      for (const s of [-1, 1]) { rSeg(hx + s * 22, h, hx + s * 3, top + 4, 1.4, 1.1, b.P(WD[3])); rLine(hx + s * 22 + 1, h, hx + s * 3 + 1, top + 4, b.P(WD[1])); }
      for (let k = 1; k < 5; k++) { const y = top + 4 + k * (h - top) / 5, hw = 3 + 19 * k / 5; beam(hx - hw, y, hx + hw, y, 1); }
      const wr = 15, wy = top;
      for (let a = 0; a < TAU; a += 0.02) { b.set(hx + Math.cos(a) * wr, wy + Math.sin(a) * wr, WD[4]); b.set(hx + Math.cos(a) * (wr - 1), wy + Math.sin(a) * (wr - 1), WD[2]); }
      for (let k = 0; k < 8; k++) rLine(hx, wy, hx + Math.cos(k * TAU / 8 + 0.2) * (wr - 1), wy + Math.sin(k * TAU / 8 + 0.2) * (wr - 1), b.P(WD[3]));
      rDisc(hx, wy, 2.2, b.P(hex('#3a3434')));
      const ropeX = hx + wr;
      for (let y = wy; y < h - 40; y++) b.set(ropeX, y, (y & 1) ? hex('#3a2a1c') : hex('#24180f'));
      spr(b, ropeX - 4, h - 40, ['k.......k', 'kkkkkkkkk', 'kwwwwwwwk', 'kwwwwwwwk', '.kkkkkkk.'], { k: hex('#2a2626'), w: hex('#1a1414') });
    }
    // ore buckets on a sagging rope between the scaffolds
    {
      const [xa, wa, ya] = scaffolds[0], [xb, , yb] = scaffolds[1];
      const x0 = xa + wa, x1 = xb + 768 * (xb < xa ? 1 : 0), y0 = ya + 2, y1 = yb + 2, sag = 26;
      const pt = f => [lerp(x0, x1, f), lerp(y0, y1, f) + sag * 4 * f * (1 - f)];
      let [px, py] = pt(0);
      for (let s = 1; s <= 80; s++) { const [x, y] = pt(s / 80); rLine(px, py, x, y, b.P(hex('#2a1c12'))); px = x; py = y; }
      for (const f of [0.3, 0.55, 0.8]) {
        const [x, y] = pt(f);
        rLine(x, y, x, y + 4, b.P(hex('#2a2626')));
        spr(b, Math.round(x) - 3, Math.round(y) + 4, ['kkkkkkk', 'kwoowwk', '.kwwwk.', '.kkkkk.'], { k: hex('#2a2626'), w: hex('#141012'), o: hex('#4a3a2a') });
      }
    }
    layers.mid = mkLayer(b.canvas(), 0.3, fy, 'full');
  }

  // ---- near: stalactites, a timber roof support, hanging lanterns on chains
  {
    const NK = pal(['#060407', '#0b070b', '#120b10', '#1c1013', '#2a1514', '#3f1d16', '#5a2818']);
    const w = 768, fy = 0.5, h = fullH(E, fy), m = new Mask(w, h);
    const ce = fbm1(S + 140, 8, w, 3);
    for (let x = 0; x < w; x++) for (let y = 0; y < ce(x) * 26 - 4; y++) m.set(x, y, 1);
    for (let i = 0; i < 6; i++) {
      const cx = R() * w, n = 1 + Math.floor(R() * 3);
      for (let j = 0; j < n; j++) {
        const ox = (j - (n - 1) / 2) * (10 + R() * 8), hw = (10 + R() * 18) * (j === 0 ? 1 : 0.6), hh = (30 + R() * 70) * (j === 0 ? 1 : 0.6);
        const nn = noise1(S + 150 + i * 7 + j, 8, 300);
        for (let y = 0; y < hh; y++) {
          const f = 1 - y / hh, ww = hw * Math.pow(f, 0.9) + (nn(y) - 0.5) * 5;
          for (let x = Math.floor(cx + ox - ww); x <= cx + ox + ww; x++) m.set(x, y, 1);
        }
      }
    }
    const b = new Buf(w, h), stri = noise1(S + 160, 192, w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      let v = 1.1 + (stri(x) > 0.6 ? 0.7 : stri(x) < 0.3 ? -0.5 : 0);
      const db = edgeDist(m, x, y, 0, 1, 4);
      if (db === 1) v = 5; else if (db === 2) v = 3.8; else if (db === 3) v = 2.8;
      else if (!m.at(x - 1, y) || !m.at(x + 1, y)) v += 1;
      b.d[y * w + x] = rp(NK, v, x, y);
    }
    // timber roof support
    const WD = pal(['#0c0806', '#1a110a', '#2a1a10', '#3c2616', '#56381e']);
    const IR = pal(['#141214', '#2a2628', '#4a4446']);
    const bx = Math.floor(R() * w), blen = 230;
    for (let x = bx; x < bx + blen; x++) for (let k = 0; k < 8; k++) {
      const band = ((x - bx) % 46) < 3;
      let c = k === 0 ? WD[4] : k === 7 ? WD[0] : rp(WD, 2 + (h2(Math.floor((x - bx) / 7), k, S) - 0.5) * 1.6 - (k > 5 ? 0.8 : 0), x, k);
      if (band) c = k === 3 ? IR[2] : IR[k === 0 ? 2 : 1];
      b.set(x, 18 + k, c);
    }
    for (const px of [bx + 12, bx + blen - 18]) for (let y = 0; y < 18; y++) for (let k = 0; k < 6; k++) b.set(px + k, y, k === 0 ? WD[4] : k === 5 ? WD[0] : rp(WD, 2.2 + (y % 9 === 0 ? -0.8 : 0), px + k, y));
    // chain lanterns
    const CH = hex('#1c1416');
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(i * 256 + 40 + R() * 170), len = 26 + Math.floor(R() * 40);
      for (let y = 0; y < len; y++) b.set(x, y, y % 3 === 2 ? 0 : CH);
      glowInto(b, x + 0.5, len + 5, 16, hex('#c86a2a'), 0.4, true);
      spr(b, x - 2, len, ['.kkk.', 'kkkkk', 'kyyok', 'kyook', 'koook', 'kkkkk', '.kkk.'],
        { k: hex('#140c0a'), y: hex('#fff0b0'), o: hex('#ffa838') });
      lamps.push({ L: 'near', x: x + 0.5, y: len + 3.5 });
    }
    layers.near = mkLayer(b.canvas(), 0.52, fy, 'full');
  }

  const glowS = glowSprite(11, '#ff9030', 0.5);
  const embers = [];
  for (let i = 0; i < 26; i++) embers.push({ x: R() * (W + 20), y: R() * (H + 20), v: 14 + R() * 26, a: 3 + R() * 8, f: 1 + R() * 2, p: R() * TAU, c: i % 3 });
  const dust = [];
  for (let i = 0; i < 14; i++) dust.push({ x: R() * (W + 20), y: R() * (H + 20), p: R() * TAU, f: 0.2 + R() * 0.3 });
  const EC = ['#ffd060', '#ff9030', '#e0581a'];

  return {
    fog: '#3a1c18',
    back(g, cx, cy, t) {
      blit(g, layers.wall, E, cx, cy, t);
      blit(g, layers.rocks, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(0.6 + 0.3 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1), 0, 1);
      blit(g, layers.rocks, E, cx, cy, t, glowFar);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.mid, E, cx, cy, t);
      blit(g, layers.near, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lamps.forEach((l, i) => {
        g.globalAlpha = clamp(0.45 + 0.2 * Math.sin(t * 8 + i * 3) + 0.1 * Math.sin(t * 19 + i), 0, 1);
        onScreen(layers[l.L], E, cx, cy, t, l.x, l.y, 12, (x, y) => g.drawImage(glowS, Math.floor(x) - 11, Math.floor(y) - 11));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      for (const e of embers) {
        const x = Math.floor(wrapP(e.x + Math.sin(t * e.f + e.p) * e.a - cx * 1.15, sw2)) - 10;
        const y = Math.floor(wrapP(e.y - e.v * t - cy * 1.15, sh2)) - 10;
        g.globalAlpha = clamp((y / H) * (0.6 + 0.4 * Math.sin(t * 9 + e.p)), 0, 0.9);
        g.fillStyle = EC[e.c];
        g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = '#9a8a80';
      for (const d of dust) {
        const x = Math.floor(wrapP(d.x + Math.sin(t * d.f + d.p) * 16 - cx * 1.05, sw2)) - 10;
        const y = Math.floor(wrapP(d.y + Math.cos(t * d.f * 0.8 + d.p) * 10 + t * 3 - cy * 1.05, sh2)) - 10;
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t + d.p);
        g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// BELFRY — Belfry Heights (vertical)

function buildBelfry(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const SKY = pal(['#04050d', '#070916', '#0b0e20', '#10142b', '#161b37', '#1d2444', '#262e53', '#313a62', '#3e4771',
    '#4e567f', '#61688d', '#767c9c', '#8d90ab']);
  const stops = [[0, 11.4], [40, 10.1], [90, 8.8], [150, 7.4], [220, 6.1], [300, 4.8], [380, 3.5], [460, 2.3], [560, 1.2], [700, 0.4]];
  const lamps = [];
  const mixq = (c, m, x, y, M) => { const q = dq(clamp(m, 0, 1) * 4, x, y) / 4; return q > 0 ? mixc(c, M, q) : c; };

  // ---- sky: gradient by altitude, big moon near the top, stars thickening upward
  const sw = 768, fyS = 0.18, sh = fullH(E, fyS);
  const moonX = 250, moonY = Math.min(100, sh - 116), moonR = 36;
  const tw = [];
  {
    const b = new Buf(sw, sh);
    const MOON = pal(['#5e6080', '#7e809e', '#a2a2bc', '#c4c2d6', '#e2e0ec', '#f8f8fe']);
    const crat = [];
    for (let i = 0; i < 12; i++) crat.push([(R() - 0.5) * moonR * 1.5, (R() - 0.5) * moonR * 1.5, 2 + R() * 6]);
    const mare = noise2(S + 3, 8, 64, 10);
    for (let y = 0; y < sh; y++) {
      const bv = interp(stops, sh - 1 - y);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - moonX, sw), dy = y - moonY, dist = Math.hypot(dx, dy);
        let c;
        if (dist < moonR) {
          const nx = dx / moonR, ny = dy / moonR, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          let v = 1.3 + 3.8 * clamp(-nx * 0.25 - ny * 0.3 + nz * 0.85, 0, 1);
          if (mare(dx + 40, dy + 40) > 0.6) v -= 0.9;
          for (const [cx2, cy2, cr] of crat) { const e = Math.hypot(dx - cx2, dy - cy2); if (e < cr) v += e > cr - 1.2 && dx - cx2 > 0 ? 0.5 : -0.7; }
          c = rp(MOON, v, x, y);
        } else {
          const g = Math.max(0, 1 - (dist - moonR) / 130);
          c = rp(SKY, bv + 3.6 * g * g + (dist < moonR + 2.5 ? 1.2 : 0), x, y);
        }
        b.d[y * sw + x] = c;
      }
    }
    const STAR = pal(['#3a4270', '#7880b0', '#c0c8f0', '#ffffff']);
    for (let i = 0; i < (sw * sh) / 150; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), d = sh - 1 - y;
      const dens = clamp((d - 110) / 250, 0, 1);
      if (R() > dens || Math.hypot(wrapD(x - moonX, sw), y - moonY) < moonR + 12) continue;
      const k = R();
      b.set(x, y, STAR[k < 0.6 ? 0 : k < 0.88 ? 1 : 2]);
      if (k > 0.985) { b.set(x - 1, y, STAR[1]); b.set(x + 1, y, STAR[1]); b.set(x, y - 1, STAR[1]); b.set(x, y + 1, STAR[1]); b.set(x, y, STAR[3]); }
    }
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), d = sh - 1 - y;
      if (d < 140 || Math.hypot(wrapD(x - moonX, sw), y - moonY) < moonR + 14) continue;
      tw.push({ x, y, p: R() * TAU, f: 1 + R() * 3 });
    }
    layers.sky = mkLayer(b.canvas(), 0.02, fyS, 'full');
  }

  // ---- cumulus banks in the middle of the climb (moonlit from the upper left)
  {
    const CL = pal(['#121630', '#191e3c', '#22284a', '#2d3459', '#3b426a', '#4f567e', '#686e94', '#888caa', '#aeb0c8', '#cfd0e0']);
    const w = 768, fy = 0.3, h = fullH(E, fy), lit = new Float32Array(w * h).fill(-1);
    const bands = h > 300 ? [[h * 0.5, 1.0, 6], [h * 0.76, 0.7, 6], [h * 0.25, 0.55, 5]] : [[h * 0.42, 0.65, 5]];
    for (const [by, k, n] of bands) for (let c = 0; c < n; c++) {
      const cx = (c + R() * 0.6) * w / n, cw = (60 + R() * 90) * k, base = by + (R() - 0.5) * 34 * k;
      const nd = Math.max(3, Math.round(cw / 7));
      for (let i = 0; i < nd; i++) {
        const f = i / (nd - 1), prof = Math.sin(Math.PI * f);
        const r = (4 + prof * 15 * k) * (0.7 + R() * 0.6);
        const dx = cx - cw / 2 + f * cw + (R() - 0.5) * 6, dy = base - r * 0.5 - prof * 9 * k + (R() - 0.5) * 5;
        for (let y = Math.floor(dy - r); y <= Math.min(base + 2, dy + r); y++) {
          if (y < 0 || y >= h) continue;
          for (let x = Math.floor(dx - r); x <= dx + r; x++) {
            const d = Math.hypot(x + 0.5 - dx, y + 0.5 - dy);
            if (d > r) continue;
            const l = 1 - Math.hypot(x + 0.5 - (dx - r * 0.4), y + 0.5 - (dy - r * 0.5)) / (r * 1.55);
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
      let v = 1.4 + l * 7.4;
      const below = y + 1 < h ? lit[(y + 1) * w + x] : -1, below2 = y + 2 < h ? lit[(y + 2) * w + x] : -1, above = y > 0 ? lit[(y - 1) * w + x] : -1;
      if (below < 0) v -= 1.4; else if (below2 < 0) v -= 0.7;
      if (above < 0) v += 1;
      b.d[y * w + x] = rp(CL, v, x, y);
    }
    layers.cloud = mkLayer(b.canvas(), 0.06, fy, 'full', { vx: 2 });
  }

  // stone tower, moonlit from the left
  const towerAt = (b, P, cx, groundY, topY, tw0, opts) => {
    const hw = Math.round(tw0 / 2), sp = Math.round(tw0 * (1.5 + R() * 0.8));
    const nOp = tw0 > 34 ? 2 : 1, owB = Math.floor((tw0 - 6 - (nOp - 1) * 4) / nOp);
    const ySpire = topY + sp, yPar = ySpire + 6, yBell = yPar + (opts.bell ? Math.max(34, Math.round(owB * 1.9)) : 0), yClock = yBell + (opts.clock ? 30 : 0);
    const fillBox = (x0, x1, y0, y1) => {
      const xl = Math.round(x0), xr = Math.round(x1);
      for (let y = Math.floor(y0); y < y1; y++) for (let x = xl; x <= xr; x++) {
        const u = (x - xl) / Math.max(1, xr - xl);
        let v = 3 - u * 2.3;
        if (x === xl) v = 4.7; else if (x === xl + 1) v = 3.9;
        if (x === xr) v = 0.3;
        const row = Math.floor((y - y0) / 6);
        if ((y - y0) % 6 === 0) v -= 0.6; else if ((x - xl + (row % 2) * 4) % 8 === 0) v -= 0.35;
        b.set(x, y, rp(P, v, x, y));
      }
    };
    fillBox(cx - hw, cx + hw, yClock, groundY);
    for (let k = 0; k < 5; k++) {
      const y0 = yClock + 30 + k * 64;
      if (y0 > groundY) break;
      const bw = 3 + k * 2;
      fillBox(cx - hw - bw, cx - hw - 1, y0, groundY);
      fillBox(cx + hw + 1, cx + hw + bw, y0, groundY);
      for (let x = cx - hw - bw; x <= cx + hw + bw; x++) b.set(x, y0, rp(P, x < cx ? 4.8 : 3, x, y0));
    }
    const ledge = y => { for (let x = cx - hw - 2; x <= cx + hw + 2; x++) { b.set(x, y, rp(P, x < cx ? 5 : 3.2, x, y)); b.set(x, y + 1, P[1]); } };
    if (tw0 >= 20) for (let y = yClock + 58; y < groundY - 30; y += 96) {
      ledge(y);
      for (let x = cx - hw + 3; x + 4 <= cx + hw - 2; x += 6) for (let j = 3; j < 11; j++) for (let i = 0; i < 4; i++) {
        if (j === 3 && (i === 0 || i === 3)) continue;
        b.set(x + i, y + j, i === 0 ? P[3] : P[0]);
      }
      ledge(y + 12);
    }
    for (let y = yClock + 20; y < groundY - 20; y += 38) {
      for (const ox of opts.wide ? [-hw * 0.45, hw * 0.45] : [0]) {
        const lw = tw0 > 40 ? 1 : 0, x0 = Math.round(cx + ox), on = R() < opts.lit;
        for (let j = 0; j < 10; j++) for (let i = -lw; i <= lw; i++) {
          if (j === 0 && i !== 0) continue;
          b.set(x0 + i, y + j, on ? rp(opts.WIN, 2.2 + j * 0.12 + (i === 0 ? 0.5 : 0), x0 + i, y + j) : P[0]);
        }
        if (on) lamps.push({ L: opts.L, x: x0 + 0.5, y: y + 5, s: 0.18, c: 'win' });
      }
    }
    if (opts.clock) {
      ledge(yClock - 1);
      fillBox(cx - hw, cx + hw, yBell, yClock);
      const cr = Math.max(5, hw * 0.55), ccy = (yBell + yClock) / 2;
      rDisc(cx + 0.5, ccy, cr + 1.3, b.P(P[0]));
      rDisc(cx + 0.5, ccy, cr, (x, y) => b.set(x, y, rp(opts.CLK, 2.7 - Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - ccy) / cr * 1.4, x, y)));
      const hand = hex('#1a1622'), a1 = -1.1 + R() * 0.4, a2 = 0.6 + R() * 0.8;
      rLine(cx, ccy, cx + Math.cos(a1) * cr * 0.85, ccy + Math.sin(a1) * cr * 0.85, b.P(hand));
      rLine(cx, ccy, cx + Math.cos(a2) * cr * 0.55, ccy + Math.sin(a2) * cr * 0.55, b.P(hand));
      for (let k = 0; k < 12; k++) if (k % 3 === 0) b.set(cx + 0.5 + Math.cos(k * TAU / 12) * (cr - 1.2), ccy + Math.sin(k * TAU / 12) * (cr - 1.2), hand);
      lamps.push({ L: opts.L, x: cx + 0.5, y: ccy, s: 0.35, c: 'clk' });
    }
    if (opts.bell) {
      ledge(yBell - 1);
      fillBox(cx - hw, cx + hw, yPar, yBell);
      const n = nOp, ow = owB;
      for (let i = 0; i < n; i++) {
        const x0 = Math.round(cx - hw + 3 + i * (ow + 4)), y0 = yPar + 4, oh = yBell - y0 - 3;
        for (let y = y0; y < y0 + oh; y++) for (let x = x0; x < x0 + ow; x++) {
          const ax = (x + 0.5 - (x0 + ow / 2)) / (ow / 2), ay = (y - y0) / (ow / 2);
          if (ay < 1 && ax * ax + (1 - ay) * (1 - ay) > 1) continue;
          b.set(x, y, rp(opts.WIN, 0.5 + Math.pow((y - y0) / oh, 1.4) * 3.6 - Math.abs(ax) * 0.5, x, y));
        }
        const bcx = x0 + ow / 2 - 0.5, bt = Math.round(y0 + ow / 2), bh = Math.round(Math.min(oh - ow / 2 - 3, ow * 0.85));
        for (let j = 0; j < bh; j++) {
          const f = j / bh, bw = ow * (0.16 + 0.16 * f + (f > 0.78 ? 0.1 : 0));
          const xl = Math.round(bcx - bw), xr = Math.round(bcx + bw);
          for (let x = xl; x <= xr; x++) b.set(x, bt + j, opts.BELL[x === xl ? 3 : x === xl + 1 ? 2 : j === bh - 1 ? 2 : 1]);
        }
        b.set(Math.round(bcx), bt - 1, opts.BELL[2]); b.set(Math.round(bcx), bt + bh, opts.BELL[0]);
        lamps.push({ L: opts.L, x: x0 + ow / 2, y: y0 + oh * 0.75, s: 0.5, c: 'bell' });
      }
    }
    ledge(yPar);
    for (let x = cx - hw - 1; x <= cx + hw + 1; x++) if (((x - cx) & 3) < 2) for (let y = yPar - 3; y < yPar; y++) b.set(x, y, rp(P, x < cx ? 4 : 1.4, x, y));
    for (const s of [-1, 1]) {
      const px = cx + s * (hw - 1);
      rPoly([[px - 2, yPar], [px + 3, yPar], [px + 0.5, yPar - 12]], (x, y) => b.set(x, y, rp(P, x <= px ? 4.2 : 1.2, x, y)));
    }
    rPoly([[cx - hw + 2, ySpire + 1], [cx + hw - 1, ySpire + 1], [cx + 0.5, topY]], (x, y) => {
      let v = x <= cx ? 3.2 + (cx - x) / hw * 0.6 : 1.1;
      if ((y - topY) % 4 === 0) v -= 0.6;
      b.set(x, y, rp(P, v, x, y));
    });
    for (let y = topY; y <= ySpire; y++) { const f = (y - topY) / sp, x = Math.round(cx + 0.5 - (hw - 1.5) * f); b.set(x, y, rp(P, 5, x, y)); }
    const ly = topY + sp * 0.62, lw = Math.max(2, hw * 0.25);
    rPoly([[cx - lw, ly + lw * 1.4], [cx + lw, ly + lw * 1.4], [cx, ly - lw * 0.6]], b.P(P[1]));
    b.set(cx, ly + lw * 0.6, opts.WIN[3]); b.set(cx, ly + lw * 0.6 + 1, opts.WIN[2]);
    rLine(cx, topY, cx, topY - 7, b.P(P[4]));
    b.set(cx - 1, topY - 4, P[4]); b.set(cx + 1, topY - 4, P[3]);
    rLine(cx - 3, topY - 7, cx + 3, topY - 7, b.P(P[3]));
    b.set(cx + 3, topY - 8, P[3]); b.set(cx - 3, topY - 6, P[3]);
  };

  // rooftops band
  const roofs = (b, P, WIN, y0, h, n, lit, sc) => {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * b.w), wd = Math.round((14 + R() * 26) * sc), ht = Math.round((10 + R() * 22) * sc), ry = Math.round(y0 - ht);
      const rh = Math.round(wd * (0.45 + R() * 0.4)), px = x + wd / 2;
      for (let y = ry; y < h; y++) for (let xx = x; xx < x + wd; xx++) b.set(xx, y, rp(P, xx < x + sc ? 2.6 : 1.2, xx, y));
      rPoly([[x - 2, ry + 1], [x + wd + 2, ry + 1], [px, ry - rh]], (xx, y) => {
        let v = xx < px ? 3 : 0.9;
        if ((y - ry) % (2 * sc) === 0) v -= 0.6;
        b.set(xx, y, rp(P, v, xx, y));
      });
      for (let y = ry - rh; y <= ry; y++) { const f = (y - (ry - rh)) / rh, xx = Math.round(px - (wd / 2 + 2) * f); b.set(xx, y, rp(P, 4.4, xx, y)); }
      if (R() < 0.7) {
        const chx = Math.round(x + wd * (0.55 + R() * 0.25)), cw = 2 + sc, top = Math.round(ry - rh * 0.75);
        for (let y = top; y < ry - rh * 0.1; y++) for (let k = 0; k < cw; k++) b.set(chx + k, y, rp(P, k === 0 ? 2.8 : 1, chx + k, y));
        for (let k = -1; k <= cw; k++) b.set(chx + k, top, rp(P, 3.4, chx + k, top));
        if (sc > 1) { b.set(chx + 1, top - 1, P[2]); b.set(chx + 1, top - 2, P[2]); }
      }
      for (let k = 0; k < 3; k++) if (R() < lit) {
        const ww = sc + 1, wh = 2 * sc + 1, wx = Math.floor(x + 2 + R() * (wd - ww - 4)), wy = Math.floor(ry + 2 + R() * Math.max(1, ht - wh - 4));
        for (let j = 0; j < wh; j++) for (let ii = 0; ii < ww; ii++) b.set(wx + ii, wy + j, sc > 1 && (ii === (ww >> 1) || j === (wh >> 1)) ? WIN[1] : WIN[j < wh / 2 ? 3 : 2]);
      }
    }
  };

  // ---- far: distant town and thin spires
  {
    const P = pal(['#0c1027', '#111632', '#171d3c', '#1e2647', '#273055', '#313b63']);
    const WIN = pal(['#3a3040', '#6a5040', '#b07a44', '#e0a85a']);
    const w = 768, fy = 0.42, h = fullH(E, fy), b = new Buf(w, h);
    for (let i = 0; i < 4; i++) {
      const cx = Math.floor(i * 192 + 30 + R() * 130), tw0 = 12 + Math.floor(R() * 8);
      const topY = Math.floor(lerp(20, h - 140, R() * (i % 2 ? 1 : 0.6)));
      towerAt(b, P, cx, h, topY, tw0, { lit: 0.5, WIN, CLK: WIN, BELL: P, L: 'far' });
    }
    roofs(b, P, WIN, h - 46, h, 64, 0.6, 1);
    const M = hex('#3a4470');
    for (let y = h - 60; y < h; y++) for (let x = 0; x < w; x++) {
      const c = b.d[y * w + x];
      if (c) b.d[y * w + x] = mixq(c, Math.pow(clamp((y - (h - 60)) / 46, 0, 1), 1.2) * 0.85, x, y, M);
    }
    layers.far = mkLayer(b.canvas(), 0.12, fy, 'full');
  }

  // ---- mid: big bell towers + rooftops
  {
    const P = pal(['#080a18', '#0c0f22', '#12162e', '#191f3c', '#222a4c', '#2e3862', '#3e4a7c', '#525f96']);
    const WIN = pal(['#2a1810', '#5a3018', '#a05a24', '#e09a40', '#ffd27a']);
    const CLK = pal(['#6a6450', '#a49c7a', '#d4cca4', '#f0e8c4']);
    const BELL = pal(['#0c0805', '#1e140b', '#3e2c16', '#8a6834']);
    const w = 768, fy = 0.6, h = fullH(E, fy), b = new Buf(w, h);
    const tops = [24 + R() * 30, lerp(24, h - 170, 0.55), lerp(24, h - 150, 0.85)];
    towerAt(b, P, 150 + Math.floor(R() * 40), h, Math.floor(tops[0]), 54, { lit: 0.35, WIN, CLK, BELL, bell: true, clock: true, wide: true, L: 'mid' });
    towerAt(b, P, 560 + Math.floor(R() * 40), h, Math.floor(tops[1]), 44, { lit: 0.35, WIN, CLK, BELL, bell: true, clock: R() < 0.5, L: 'mid' });
    towerAt(b, P, 360 + Math.floor(R() * 30), h, Math.floor(tops[2]), 26, { lit: 0.5, WIN, CLK, BELL, bell: true, L: 'mid' });
    roofs(b, P, WIN, h - 56, h, 34, 0.75, 2);
    const M = hex('#2c3460');
    for (let y = h - 40; y < h; y++) for (let x = 0; x < w; x++) {
      const c = b.d[y * w + x];
      if (c) b.d[y * w + x] = mixq(c, clamp((y - (h - 40)) / 36, 0, 1) * 0.75, x, y, M);
    }
    layers.mid = mkLayer(b.canvas(), 0.24, fy, 'full');
  }

  // ---- near: gothic pinnacles (finite sections on corbels), buttresses, gargoyles, dark roofs at the bottom
  {
    const P = pal(['#04050c', '#080a16', '#0d1020', '#141a30', '#1e2644', '#2c365c']);
    const w = 768, fy = 0.78, h = fullH(E, fy), m = new Mask(w, h);
    const pinnacle = (cx, top, pw) => {
      const sp = Math.round(pw * 2.6);
      rPoly([[cx - pw / 2, top + sp + 1], [cx + pw / 2 + 1, top + sp + 1], [cx + 0.5, top]], m.P(1));
      for (let y = top + 6; y < top + sp - 2; y += 5) {
        const hw2 = pw / 2 * (y - top) / sp;
        m.set(cx - hw2 - 1, y, 1); m.set(cx - hw2 - 2, y - 1, 1); m.set(cx + hw2 + 1, y, 1); m.set(cx + hw2 + 2, y - 1, 1);
      }
      rLine(cx, top, cx, top - 5, m.P(1)); m.set(cx - 1, top - 3, 1); m.set(cx + 1, top - 3, 1);
      return top + sp;
    };
    const shaft = (cx, y0, len, hw) => {
      for (let y = y0; y < y0 + len; y++) for (let x = Math.round(cx - hw); x <= cx + hw; x++) m.set(x, y, 1);
      for (let k = 0; k < 14; k++) { const f = 1 - k / 14; for (let x = Math.round(cx - hw * f); x <= cx + hw * f; x++) m.set(x, y0 + len + k, 1); }
      rDisc(cx + 0.5, y0 + len + 15, 1.6, m.P(1));
      for (let y = y0 + len - 4; y < y0 + len - 1; y++) for (let x = Math.round(cx - hw - 2); x <= cx + hw + 2; x++) m.set(x, y, 1);
    };
    const nEl = Math.max(2, Math.round(h / 280));
    for (let i = 0; i < nEl; i++) {
      const cx = Math.round(wrapP(i * 337 + 80 + R() * 200, w)), pw = 12 + Math.round(R() * 5);
      const top = Math.round(14 + (i + R() * 0.6) * Math.max(0, h - 240) / nEl);
      const st = pinnacle(cx, top, pw);
      const len = Math.min(90 + Math.round(R() * 90), h - 70 - st);
      if (len < 36) continue;
      shaft(cx, st, len, pw / 2);
      for (let y = st + 14; y < st + 26; y++) for (let x = cx - 1; x <= cx + 1; x++) m.set(x, y, 2);
      m.set(cx, st + 13, 2);
      const s = i % 2 ? -1 : 1;
      if (R() < 0.6 && len > 70) {
        const y0 = st + 30, span = 50;
        for (let u = 0; u <= span; u++) {
          const yt = y0 + u * 0.6, yb = yt + 4 + 10 * (1 - Math.sin(Math.PI * u / span));
          for (let y = Math.floor(yt); y < yb; y++) m.set(cx + s * (pw / 2 + u), y, 1);
        }
        const ox = cx + s * (pw / 2 + span), pt = Math.round(y0 + span * 0.6 - 10);
        pinnacle(ox, pt - 22, 8);
        shaft(ox, pt - 1, 40, 4);
      } else {
        const gy = st + Math.round(len * 0.5), gx = cx + s * (pw / 2 + 1);
        rRect(cx - pw / 2 - 2, gy, pw + 5, 2, m.P(1));
        rEllipse(gx + s * 5, gy - 2, 6, 3, m.P(1));
        rDisc(gx + s * 11, gy - 4, 2.4, m.P(1));
        m.set(gx + s * 14, gy - 4, 1); m.set(gx + s * 14, gy - 2, 1); m.set(gx + s * 13, gy - 7, 1); m.set(gx + s * 12, gy - 8, 1);
        rLine(gx + s * 2, gy - 4, gx - s * 2, gy - 11, m.P(1)); rLine(gx + s * 4, gy - 4, gx + s * 1, gy - 10, m.P(1));
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = R() * w, wd = 50 + R() * 50, ry = h - 18 - R() * 14;
      rPoly([[x, h], [x, ry], [x + wd / 2, ry - wd * 0.35], [x + wd, ry], [x + wd, h]], m.P(1));
      rRect(x + wd * 0.7, ry - wd * 0.3, 5, wd * 0.28, m.P(1));
    }
    const rb = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x];
      if (!k) continue;
      let v = 1.3;
      if (k === 2) v = 0.2;
      else if (!m.at(x - 1, y)) v = 4.2; else if (!m.at(x, y - 1)) v = 3.2; else if (!m.at(x - 2, y)) v = 2.6; else if (!m.at(x + 1, y)) v = 0.3;
      if (k === 1 && y % 8 === 0 && m.at(x - 1, y) && m.at(x + 1, y)) v -= 0.5;
      rb.d[y * w + x] = rp(P, v, x, y);
    }
    layers.near = mkLayer(rb.canvas(), 0.42, fy, 'full');
  }

  const glowB = glowSprite(10, '#ffa040', 0.45);
  const glowC = glowSprite(14, '#d8d0a0', 0.3);
  const glowW = glowSprite(5, '#ffa040', 0.5);
  const wispC = [];
  for (let i = 0; i < 3; i++) {
    const w = 80 + Math.floor(R() * 70), h = 5 + Math.floor(R() * 4);
    const b = new Buf(w, h, false), c = hex('#8a90bc');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = Math.sin(Math.PI * x / w), fy2 = Math.sin(Math.PI * (y + 0.5) / h) * (0.6 + 0.4 * Math.sin(x * 0.13 + y));
      const q = Math.round(fx * fx * fy2 * 0.4 * 8) / 8;
      if (q > 0) b.d[y * w + x] = withA(c, Math.round(q * 255));
    }
    wispC.push(b.canvas());
  }
  const wisps = [];
  for (let i = 0; i < 9; i++) wisps.push({ c: wispC[i % 3], x: R() * 800, y: R() * (H + 60), v: 40 + R() * 60, p: R() * TAU });

  return {
    fog: '#363d66',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      const L = layers.sky, oy = layerY(L, E, cy), ox = layerOX(L, cx, t);
      g.fillStyle = '#ffffff';
      for (const s of tw) {
        const y = s.y + oy; if (y < 1 || y >= H - 1) continue;
        const x = wrapP(s.x - ox, L.w); if (x >= W - 1 || x < 1) continue;
        const a = 0.5 + 0.5 * Math.sin(t * s.f + s.p);
        g.globalAlpha = a;
        g.fillRect(x, y, 1, 1);
        if (a > 0.92) { g.globalAlpha = 0.5; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      }
      g.globalAlpha = 1;
      blit(g, layers.cloud, E, cx, cy, t);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      lamps.forEach((l, i) => {
        if (l.L !== 'mid') return;
        g.globalAlpha = clamp(l.s * (0.8 + 0.2 * Math.sin(t * 3 + i)), 0, 1);
        const sp = l.c === 'clk' ? glowC : l.c === 'win' ? glowW : glowB, r = (sp.width - 1) >> 1;
        onScreen(layers.mid, E, cx, cy, t, l.x, l.y, 16, (x, y) => g.drawImage(sp, Math.floor(x) - r, Math.floor(y) - r));
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.near, E, cx, cy, t);
    },
    front(g, cx, cy, t) {
      const sw2 = W + 300, sh2 = H + 60;
      for (const wp of wisps) {
        const x = Math.floor(wrapP(wp.x - wp.v * t - cx * 1.3, sw2)) - 150;
        const y = Math.floor(wrapP(wp.y + Math.sin(t * 0.8 + wp.p) * 4 - cy * 1.2, sh2)) - 30;
        g.drawImage(wp.c, x, y);
      }
    },
  };
}

// ===========================================================================
// VILLAGE — Lantern Lane

function buildVillage(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const SKY = pal(['#05070f', '#080c1a', '#0c1224', '#10182f', '#151f3b', '#1b2747', '#223053', '#2b3a5e', '#364568', '#435172', '#52607e']);
  const stops = [[0, 9.8], [30, 8.6], [70, 7.2], [120, 5.8], [170, 4.4], [230, 3], [320, 1.8], [450, 0.6], [600, 0]];
  const tw = [];
  // ---- sky
  const sw = 768, fyS = 0.08, sh = fullH(E, fyS);
  {
    const b = new Buf(sw, sh);
    const mx = 190, my = Math.max(30, sh - 166), mr = 11;
    const MOON = pal(['#8a8a80', '#bcb8a0', '#e4e0c4', '#f8f6e6']);
    for (let y = 0; y < sh; y++) {
      const bv = interp(stops, sh - 1 - y);
      for (let x = 0; x < sw; x++) {
        const dx = wrapD(x - mx, sw), dy = y - my, dist = Math.hypot(dx, dy);
        let c;
        if (dist < mr) {
          const cut = Math.hypot(dx + 5, dy - 3) < mr - 1;    // gibbous shadow
          const nx = dx / mr, ny = dy / mr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          c = cut ? rp(SKY, bv + 1.6, x, y) : rp(MOON, 1.2 + 2.2 * clamp(nx * 0.5 - ny * 0.3 + nz * 0.7, 0, 1), x, y);
        } else {
          const g = Math.max(0, 1 - (dist - mr) / 70);
          c = rp(SKY, bv + 2.2 * g * g, x, y);
        }
        b.d[y * sw + x] = c;
      }
    }
    // thin moonlit clouds
    const cm = new Mask(sw, sh);
    for (let i = 0; i < 7; i++) {
      const cx = R() * sw, cy = sh - 90 - R() * 90, len = 60 + R() * 140;
      for (let s = 0; s < len; s += 9) rEllipse(cx - len / 2 + s, cy + (R() - 0.5) * 2, 9 + R() * 8, 1.2 + R() * 2, cm.P(1));
    }
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      if (!cm.at(x, y)) continue;
      const bv = interp(stops, sh - 1 - y);
      b.d[y * sw + x] = rp(SKY, bv + (cm.at(x, y - 1) ? 0.6 : 2), x, y);
    }
    const STAR = pal(['#3a4670', '#8a96c8', '#e8ecff']);
    for (let i = 0; i < (sw * sh) / 260; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * sh), d = sh - 1 - y;
      if (d < 70 || cm.at(x, y) || R() > (d - 70) / 120) continue;
      b.set(x, y, STAR[R() < 0.7 ? 0 : R() < 0.8 ? 1 : 2]);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(R() * sw), y = Math.floor(R() * (sh - 90));
      tw.push({ x, y, p: R() * TAU, f: 1 + R() * 2.5 });
    }
    layers.sky = mkLayer(b.canvas(), 0.03, fyS, 'full');
  }

  // ---- the Keep on its hill
  {
    const w = 1024, h = 204, b = new Buf(w, h), m = new Mask(w, h);
    const P = pal(['#0a1023', '#0e152b', '#131b34', '#19233f', '#212d4c', '#2c3a5c', '#3a4a6e']);
    const kx = 300, nn = fbm1(S + 4, 8, w, 3);
    const hillTop = x => { const dx = wrapD(x - kx, w); return h - 34 - 62 * Math.exp(-(dx / 170) * (dx / 170)) - nn(x) * 10; };
    for (let x = 0; x < w; x++) for (let y = Math.floor(hillTop(x)); y < h; y++) m.set(x, y, 1);
    const ht = Math.round(hillTop(kx)) + 3;
    const wins = [];
    const towerT = (x, wd, top, roofH) => {
      rRect(x - wd / 2, top, wd, ht - top + 4, m.P(2));
      if (roofH) { rPoly([[x - wd / 2 - 2, top + 1], [x + wd / 2 + 2, top + 1], [x, top - roofH]], m.P(3)); rLine(x, top - roofH, x, top - roofH - 4, m.P(3)); }
      else for (let i = -wd / 2; i < wd / 2; i += 2) { m.set(x + i, top - 1, 2); m.set(x + i, top - 2, 2); }
      for (let y = top + 5; y < ht - 4; y += 8) for (let i = -wd / 2 + 3; i < wd / 2 - 2; i += 5) wins.push([Math.round(x + i), y]);
    };
    rRect(kx - 66, ht - 24, 132, 28, m.P(2));
    for (let x = kx - 66; x < kx + 66; x += 3) { m.set(x, ht - 25, 2); m.set(x, ht - 26, 2); }
    towerT(kx - 68, 11, ht - 34, 20);
    towerT(kx + 70, 11, ht - 37, 0);
    towerT(kx - 38, 13, ht - 52, 26);
    towerT(kx + 42, 15, ht - 48, 28);
    towerT(kx, 28, ht - 70, 44);
    rLine(kx + 1, ht - 70 - 48, kx + 5, ht - 70 - 47, m.P(3)); rLine(kx + 1, ht - 70 - 47, kx + 4, ht - 70 - 46, m.P(3));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.at(x, y); if (!k) continue;
      let v;
      if (k === 1) v = !m.at(x, y - 1) ? 3.4 : 1.6;
      else if (k === 2) v = !m.at(x - 1, y) ? 4.4 : !m.at(x - 2, y) ? 3.4 : !m.at(x + 1, y) ? 0.8 : 2;
      else v = !m.at(x - 1, y) ? 4.8 : m.at(x + 1, y) === 3 && m.at(x - 1, y) === 3 && x < kx - 200 ? 2 : 1.4;
      if (k === 3) { const l = !m.at(x - 1, y) || !m.at(x - 2, y); v = l ? 4.6 : 1.2; }
      v += clamp((y - (h - 44)) / 40, 0, 1) * 2;
      b.d[y * w + x] = rp(P, v, x, y);
    }
    const WIN = hex('#e8b060'), WIN2 = hex('#a8f0a0');
    for (const [x, y] of wins) if (R() < 0.42 && m.at(x, y) === 2 && m.at(x, y + 1) === 2) { b.set(x, y, WIN); b.set(x, y + 1, hex('#a06830')); }
    b.set(kx, ht - 62, WIN2); b.set(kx, ht - 61, WIN2); b.set(kx + 1, ht - 62, WIN2); b.set(kx + 1, ht - 61, hex('#70b070'));
    glowInto(b, kx + 1, ht - 61, 7, hex('#60a070'), 0.4);
    // switchback road of lamps
    let rx = kx - 10, ry = ht + 2, dir = -1;
    for (let k = 0; k < 40; k++) {
      rx += dir * 3.2; ry += 1.4;
      if (Math.abs(rx - kx) > 50 + k) dir = -dir;
      if (ry >= h - 6) break;
      if (k % 2 === 0) b.set(rx, ry, hex('#c08040'));
    }
    layers.keep = mkLayer(b.canvas(), 0.06, 0.1, 'bottom');
  }

  // ---- far houses
  {
    const w = 768, h = 104, b = new Buf(w, h);
    const P = pal(['#0a1022', '#0e152a', '#131b33', '#1a2440']);
    const SN = pal(['#33405e', '#4a587a', '#66749a']);
    const WIN = pal(['#7a5030', '#c08848', '#f0c070']);
    let x = 0;
    while (x < w) {
      const wd = 18 + Math.floor(R() * 26), ht = 18 + Math.floor(R() * 26), ry = h - 30 - ht + Math.floor(R() * 10), rh = Math.floor(wd * (0.45 + R() * 0.35));
      for (let y = ry; y < h; y++) for (let xx = x; xx < x + wd; xx++) b.set(xx, y, rp(P, 1.4 + (xx === x ? -0.6 : 0), xx, y));
      rPoly([[x - 2, ry + 1], [x + wd + 2, ry + 1], [x + wd / 2, ry - rh]], (xx, y) => {
        const top = !(y > 0) || true;
        b.set(xx, y, rp(P, 0.6, xx, y));
      });
      // snow on the roof edges
      for (let xx = x - 2; xx <= x + wd + 2; xx++) {
        const f = Math.abs(xx - (x + wd / 2)) / (wd / 2 + 2);
        const yy = Math.ceil(ry - rh * (1 - f));
        b.set(xx, yy, SN[2]); b.set(xx, yy + 1, SN[1]); if (h2(xx, 1, S) < 0.5) b.set(xx, yy + 2, SN[0]);
      }
      if (R() < 0.5) { const cxx = x + Math.floor(wd * 0.7); rRect(cxx, ry - rh * 0.6, 3, rh * 0.5, b.P(P[2])); b.set(cxx, ry - rh * 0.6 - 1, SN[2]); b.set(cxx + 1, ry - rh * 0.6 - 1, SN[2]); b.set(cxx + 2, ry - rh * 0.6 - 1, SN[1]); }
      for (let k = 0; k < 4; k++) if (R() < 0.55) {
        const wx = x + 3 + Math.floor(R() * (wd - 6)), wy = ry + 4 + Math.floor(R() * (h - ry - 20));
        b.set(wx, wy, WIN[2]); b.set(wx, wy + 1, WIN[1]); b.set(wx + 1, wy, WIN[1]); b.set(wx + 1, wy + 1, WIN[0]);
      }
      x += wd + 1 + Math.floor(R() * 10);
    }
    // a church spire
    const sx = Math.floor(R() * w);
    rRect(sx - 6, h - 80, 12, 80, b.P(P[1]));
    rPoly([[sx - 7, h - 79], [sx + 7, h - 79], [sx, h - 118]], b.P(P[0]));
    b.set(sx, h - 66, WIN[2]); b.set(sx, h - 65, WIN[1]);
    for (let y = h - 36; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const m = clamp((y - (h - 36)) / 30, 0, 1) * 1.2;
      if (b.d[y * w + xx] && dq(m, xx, y) >= 1) b.d[y * w + xx] = hex('#222e4c');
    }
    layers.far = mkLayer(b.canvas(), 0.14, 0.2, 'bottom');
  }

  // ---- mid: crooked timber-framed houses
  const chimneys = [], lamps = [];
  {
    const w = 768, h = 188, ground = h, b = new Buf(w, h);
    const WALL1 = pal(['#141a2c', '#1a2236', '#212b42', '#29354e', '#323f5a']);
    const WALL2 = pal(['#191a28', '#222232', '#2c2b3c', '#373546', '#433f50']);
    const SHUT = pal(['#0e1620', '#1a2a34', '#26404a']);
    const TIM = pal(['#080a14', '#0e101c', '#161826']);
    const ROOF = pal(['#0a0e1c', '#0f1426', '#151c32', '#1c2540']);
    const SN = pal(['#46547a', '#6a7aa2', '#94a4c8', '#bcc8e4']);
    const WIN = pal(['#5a3418', '#a0602a', '#e09a40', '#ffd27a', '#fff0c0']);
    const SPILL = hex('#7a5a40');
    let x0 = 6;
    while (x0 < w - 40) {
      const wd = 46 + Math.floor(R() * 34), floors = 2 + (R() < 0.45 ? 1 : 0), fh = 26 + Math.floor(R() * 6), jet = 3;
      if (x0 + wd + floors * jet * 2 > w - 4) break;
      const lean = (R() - 0.5) * 0.18, cx = x0 + wd / 2 + floors * jet;
      const WALL = R() < 0.4 ? WALL2 : WALL1;
      const sh = y => lean * (ground - y);
      const wins = [];
      for (let f = 0; f < floors; f++) {
        const yb = ground - f * fh, yt = yb - fh, hw = wd / 2 + f * jet;
        for (let y = yt; y < yb; y++) {
          const l = Math.round(cx - hw + sh(y)), r = Math.round(cx + hw + sh(y));
          for (let x = l; x <= r; x++) {
            let v = 2.3 - (y - yt) / fh * 0.9 + (h2(x >> 2, y >> 2, S) - 0.5) * 0.4;
            if (x === r || x === r - 1) v -= 0.6;
            b.set(x, y, rp(WALL, v, x, y));
          }
          b.set(l, y, TIM[1]); b.set(l + 1, y, TIM[2]); b.set(r, y, TIM[0]); b.set(r - 1, y, TIM[1]);
        }
        // beams
        for (const yy of [yt, yt + 1, yb - 2, yb - 1]) {
          const l = Math.round(cx - hw - 1 + sh(yy)), r = Math.round(cx + hw + 1 + sh(yy));
          for (let x = l; x <= r; x++) b.set(x, yy, TIM[yy === yt ? 2 : 1]);
        }
        // posts + braces
        const np = Math.max(2, Math.round(hw * 2 / 15));
        for (let p = 1; p < np; p++) {
          const px = cx - hw + p * hw * 2 / np;
          for (let y = yt; y < yb; y++) b.set(Math.round(px + sh(y)), y, TIM[1]);
          if ((p + f) % 2 === 0) {
            const qx = cx - hw + (p - 1) * hw * 2 / np;
            rLine(qx + sh(yb), yb - 2, px + sh(yt), yt + 2, b.P(TIM[0]));
          }
        }
        // windows
        const nw = Math.max(1, Math.floor(hw * 2 / 22));
        for (let k = 0; k < nw; k++) {
          const wx = Math.round(cx - hw + (k + 0.5) * hw * 2 / nw - 4), wy = yt + 7;
          if (f === 0 && k === nw - 1 && nw > 1) continue;
          wins.push([wx, wy, 8, 10, R() < 0.72]);
        }
        if (f === 0) wins.push([Math.round(cx + hw * 0.45 - 4), yb - 15, 8, 13, 'door']);
      }
      for (const [wx0, wy, ww, wh, on] of wins) {
        const wx = Math.round(wx0 + sh(wy));
        if (on === true) glowInto(b, wx + ww / 2, wy + wh / 2, 16, SPILL, 0.45, true);
        for (let j = -1; j <= wh; j++) for (let i = -1; i <= ww; i++) {
          const x = wx + i, y = wy + j;
          if (j === -1 || j === wh || i === -1 || i === ww) { b.set(x, y, TIM[0]); continue; }
          if (on === 'door') { b.set(x, y, i === 0 || i === ww - 1 || j === 0 ? TIM[1] : rp(ROOF, 1 + (i % 3 === 0 ? -1 : 0), x, y)); continue; }
          if (on) {
            const d = Math.hypot((i + 0.5 - ww / 2) / ww, (j + 0.5 - wh / 2) / wh);
            let v = 3.6 - d * 3 - j / wh * 0.6;
            if (i === Math.floor(ww / 2) || j === Math.floor(wh / 2)) v = 0.6;
            b.set(x, y, rp(WIN, v, x, y));
          } else b.set(x, y, (i + j) % 5 === 0 ? ROOF[2] : TIM[1]);
        }
        if (on === true && h2(wx, wy, S) < 0.45) for (const sx of [wx - 4, wx + ww + 1]) for (let j = 0; j < wh; j++) for (let i = 0; i < 3; i++) b.set(sx + i, wy + j, i === 1 && j % 2 ? SHUT[2] : SHUT[i === 0 ? 0 : 1]);
        if (on === 'door') { b.set(wx + ww - 2, wy + wh / 2, WIN[3]); lamps.push({ x: wx + ww + 3, y: wy - 3, s: 0.6 }); spr(b, wx + ww + 2, wy - 5, ['k.', 'yk', 'ok'], { k: TIM[0], y: WIN[4], o: WIN[2] }); }
        else for (let i = -1; i <= ww; i++) b.set(wx + i, wy + wh + 1, SN[1]);
      }
      // roof
      const top = ground - floors * fh, hwT = wd / 2 + (floors - 1) * jet + 4, rise = hwT * (1.1 + R() * 0.5);
      const ox = sh(top), peak = cx + ox + (R() - 0.5) * 4;
      const gable = R() < 0.6;
      const pts = gable ? [[cx - hwT + ox, top + 1], [cx + hwT + ox, top + 1], [peak, top - rise]]
        : [[cx - hwT + ox, top + 1], [cx + hwT + ox, top + 1], [cx + hwT * 0.55 + ox, top - rise * 0.75], [cx - hwT * 0.55 + ox, top - rise * 0.75]];
      rPoly(pts, (x, y) => b.set(x, y, rp(ROOF, 1.6 + ((y - top) % 3 === 0 ? -0.8 : 0) + (x > peak ? -0.5 : 0.3), x, y)));
      // chimney
      const chx = Math.round(cx + ox + (R() < 0.5 ? -1 : 1) * hwT * 0.4), chT = Math.round(top - rise * 0.85);
      rRect(chx - 2, chT, 6, rise * 0.6, (x, y) => b.set(x, y, rp(ROOF, x > chx + 1 ? 1 : 2.6, x, y)));
      for (let i = -3; i <= 4; i++) { b.set(chx + i, chT - 1, SN[3]); b.set(chx + i, chT, SN[2]); }
      chimneys.push({ x: chx + 0.5, y: chT - 2, p: R() });
      // snow on the roof
      const sn = noise1(S + x0, 12, 300);
      for (let x = Math.floor(cx - hwT + ox - 1); x <= cx + hwT + ox + 1; x++) {
        let y = top - rise - 2; while (y < top + 1 && !(b.get(x, y) && (b.get(x, y) === ROOF[0] || b.get(x, y) === ROOF[1] || b.get(x, y) === ROOF[2] || b.get(x, y) === ROOF[3]))) y++;
        if (y > top) continue;
        const th = 2 + Math.floor(sn(x) * 3);
        for (let k = 0; k < th; k++) b.set(x, y + k, SN[k === 0 ? 3 : k === 1 ? 2 : 1]);
      }
      for (let x = Math.floor(cx - hwT + ox); x <= cx + hwT + ox; x++) {
        b.set(x, top + 1, SN[1]);
        if (h2(x, 77, S) < 0.2) { b.set(x, top + 2, SN[1]); if (h2(x, 78, S) < 0.5) b.set(x, top + 3, SN[0]); }
      }
      x0 += Math.round(wd + floors * jet * 2 + 8 + R() * 22);
      // lamp post between houses
      if (R() < 0.6 && x0 < w - 20) {
        const lx = x0 - 6, ly = ground - 34;
        for (let y = ly; y < ground; y++) b.set(lx, y, TIM[0]);
        b.set(lx + 1, ly, TIM[0]); b.set(lx + 2, ly, TIM[0]);
        glowInto(b, lx + 2.5, ly + 4, 12, SPILL, 0.5);
        spr(b, lx + 1, ly + 1, ['kkk', 'kyk', 'kok', '.k.'], { k: TIM[0], y: WIN[4], o: WIN[2] });
        lamps.push({ x: lx + 2.5, y: ly + 3, s: 1 });
      }
    }
    layers.mid = mkLayer(b.canvas(), 0.3, 0.35, 'bottom');
  }

  // ---- near: lantern strings and eaves
  const nlamps = [];
  {
    const w = 768, fy = 0.5, h = fullH(E, fy), b = new Buf(w, h);
    const ROPE = hex('#0a0c16');
    const LC = [pal(['#5a1410', '#b8341e', '#ff7a40', '#ffc890']), pal(['#5a3010', '#c07020', '#ffb040', '#ffe8a0']), pal(['#3a1a3a', '#8a3a7a', '#e070b0', '#ffc0e0'])];
    for (let k = 0; k < 4; k++) {
      const x0 = k * 192 + R() * 40, span = 150 + R() * 70, y0 = -1 + R() * 8, y1 = -1 + R() * 8, sag = 16 + R() * 20;
      const pt = f => [x0 + span * f, lerp(y0, y1, f) + sag * 4 * f * (1 - f)];
      let [px, py] = pt(0);
      for (let s = 1; s <= 60; s++) { const [x, y] = pt(s / 60); rLine(px, py, x, y, b.P(ROPE)); px = x; py = y; }
      const n = Math.floor(span / 17);
      for (let i = 1; i < n; i++) {
        const [x, y] = pt(i / n), P = LC[(i + k) % 3];
        const lx = Math.round(x), ly = Math.round(y) + 2;
        b.set(lx, ly - 1, ROPE);
        glowInto(b, lx + 0.5, ly + 3, 8, P[2], 0.35);
        for (let j = 0; j < 6; j++) for (let ii = -2; ii <= 2; ii++) {
          if ((j === 0 || j === 5) && Math.abs(ii) === 2) continue;
          let c;
          if (j === 0 || j === 5) c = ROPE;
          else c = rp(P, 3 - Math.abs(ii) * 0.8 - (j === 1 || j === 4 ? 0.7 : 0), lx + ii, ly + j);
          b.set(lx + ii, ly + j, c);
        }
        b.set(lx, ly + 6, P[1]);
        nlamps.push({ x: lx + 0.5, y: ly + 3, c: (i + k) % 3 });
      }
    }
    layers.near = mkLayer(b.canvas(), 0.5, fy, 'full');
  }

  const puffs = [];
  for (let s = 0; s < 3; s++) {
    const r = 2.5 + s * 1.8, sz = Math.ceil(r) * 2 + 1, b = new Buf(sz, sz, false), c = hex('#6a7498');
    rDisc(sz / 2, sz / 2, r, (x, y) => { if ((x + y) % 2 === 0 || s === 0) b.set(x, y, withA(c, 255)); });
    puffs.push(b.canvas());
  }
  const glowW = glowSprite(9, '#ffb050', 0.45);
  const glowL = [glowSprite(7, '#ff6a3a', 0.5), glowSprite(7, '#ffb040', 0.5), glowSprite(7, '#e070b0', 0.5)];
  const flakes = [];
  for (let i = 0; i < 70; i++) flakes.push({ x: R() * (W + 20), y: R() * (H + 20), v: 10 + R() * 22, a: 3 + R() * 8, f: 0.5 + R() * 1.2, p: R() * TAU, s: R() < 0.15 ? 2 : 1, par: 1.05 + R() * 0.3 });

  return {
    fog: '#25304f',
    back(g, cx, cy, t) {
      blit(g, layers.sky, E, cx, cy, t);
      const L = layers.sky, oy = layerY(L, E, cy), ox = layerOX(L, cx, t);
      g.fillStyle = '#e8ecff';
      for (const s of tw) {
        const y = s.y + oy; if (y < 1 || y >= H) continue;
        const x = wrapP(s.x - ox, L.w); if (x >= W) continue;
        g.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * s.f + s.p));
        g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
      blit(g, layers.keep, E, cx, cy, t);
      blit(g, layers.far, E, cx, cy, t);
      blit(g, layers.mid, E, cx, cy, t);
      // chimney smoke
      const M = layers.mid;
      for (const ch of chimneys) {
        onScreen(M, E, cx, cy, t, ch.x, ch.y, 60, (sx, sy) => {
          for (let k = 0; k < 6; k++) {
            const ph = wrapP(t * 0.25 + ch.p + k / 6, 1);
            const px = sx + ph * 18 + Math.sin(ph * 7 + k) * 2, py = sy - ph * 46;
            g.globalAlpha = 0.5 * (1 - ph * ph);
            const sp = puffs[Math.min(2, Math.floor(ph * 3))];
            g.drawImage(sp, Math.floor(px - sp.width / 2), Math.floor(py - sp.height / 2));
          }
        });
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
      lamps.forEach((l, i) => {
        g.globalAlpha = clamp(l.s * (0.5 + 0.15 * Math.sin(t * 6 + i * 2) + 0.08 * Math.sin(t * 15 + i)), 0, 1);
        onScreen(M, E, cx, cy, t, l.x, l.y, 10, (x, y) => g.drawImage(glowW, Math.floor(x) - 9, Math.floor(y) - 9));
      });
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      blit(g, layers.near, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      nlamps.forEach((l, i) => {
        g.globalAlpha = clamp(0.4 + 0.18 * Math.sin(t * 2.3 + i * 1.7), 0, 1);
        onScreen(layers.near, E, cx, cy, t, l.x, l.y, 8, (x, y) => g.drawImage(glowL[l.c], Math.floor(x) - 7, Math.floor(y) - 7));
      });
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      g.fillStyle = '#e4ecff';
      for (const f of flakes) {
        const x = Math.floor(wrapP(f.x + Math.sin(t * f.f + f.p) * f.a - t * 4 - cx * f.par, sw2)) - 10;
        const y = Math.floor(wrapP(f.y + f.v * t - cy * f.par, sh2)) - 10;
        g.globalAlpha = f.s === 2 ? 0.8 : 0.6;
        g.fillRect(x, y, f.s, f.s);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// KEEP — Witchfinder's Keep (interior)

function buildKeep(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const layers = {};
  const GLASS = [
    pal(['#3a0c18', '#7a1828', '#c03040', '#f06a5a']),
    pal(['#0c1838', '#18388a', '#2e64c8', '#6aa0f0']),
    pal(['#3a2a0c', '#8a6418', '#d0a030', '#f8e078']),
    pal(['#0c2a18', '#1a6a3a', '#30a060', '#78e098']),
    pal(['#200c34', '#4a1e7a', '#8040c0', '#c088f0']),
  ];
  const spacing = 192, colW = 28;

  // ---- stained-glass wall + god rays
  {
    const ST = pal(['#0a0b11', '#0e1017', '#13151d', '#181b24', '#1f222c', '#272a36', '#323644', '#424656', '#565a6c']);
    const w = 768, fy = 0.18, h = fullH(E, fy), b = new Buf(w, h), rays = new Buf(w, h);
    const tex = noise2(S + 11, 96, w, 8);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 11), bx = (x + (row % 2) * 12) % 24;
      let v = 2.3 + (h2(Math.floor((x + (row % 2) * 12) / 24), row, S + 1) - 0.5) * 0.9 + (tex(x, y) - 0.5) * 0.8;
      if (y % 11 === 0) v = 0.9; else if (bx === 0) v = 1.2; else if (y % 11 === 1) v += 0.5;
      b.d[y * w + x] = rp(ST, v, x, y);
    }
    const kx = 0.42, LR = 230;
    const tiers = Math.max(1, Math.floor((h - 60) / 220));
    for (let tr = 0; tr < tiers; tr++) {
      for (let k = 0; k < 4; k++) {
        const ww = 36, wx = k * spacing + spacing - ww / 2, yb = h - 70 - tr * 220, ys = yb - 86, yt = ys - ww * 0.95;
        const g1 = GLASS[(k * 2 + tr) % 5], g2 = GLASS[(k * 2 + tr + 2) % 5], g3 = GLASS[(k + 3 + tr) % 5];
        const inside = (x, y) => {
          if (x < wx || x >= wx + ww || y >= yb || y < yt) return false;
          if (y >= ys) return true;
          return Math.hypot(x + 0.5 - (wx + ww * 0.95), y - ys) <= ww * 0.95 && Math.hypot(x + 0.5 - (wx + ww * 0.05), y - ys) <= ww * 0.95;
        };
        const mid = ww / 2, rcy = ys - 9;
        const glassAt = (x, y) => {
          const lx = x - wx;
          if (lx <= 1 || lx >= ww - 2) return -1;
          if (!inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || y >= yb - 2) return -1;
          const u = lx + 0.5 - mid;
          const rose = Math.hypot(u, y - rcy);
          if (rose < 10) {
            if (rose > 8.8 || (rose > 3.3 && rose < 4.3)) return -1;
            if (rose >= 4.3) { const a = Math.atan2(y - rcy, u) / TAU * 8; if (Math.abs(a - Math.round(a)) < 0.12) return -1; return 5; }
            return 6;
          }
          if (y < ys + 2) return 4;
          if (Math.abs(u) < 1) return -1;
          const lv = y - ys;
          if (lv % 18 === 0) return -1;
          if (Math.abs(u) > mid - 5) return 4;
          const cell = Math.floor(lv / 18), lu = Math.abs(u) - 1, lt = lv % 18;
          const d1 = Math.abs(lu - 6.5) + Math.abs(lt - 9) * 0.7;
          if (d1 < 4.6 && d1 > 3.6) return -1;
          return d1 < 3.6 ? (cell % 2 ? 2 : 6) : 1;
        };
        const colorOf = gi => gi === 2 ? g2 : gi === 4 ? g3 : gi === 5 ? g2 : gi === 6 ? g3 : g1;
        for (let y = Math.floor(yt - 4); y < yb + 5; y++) for (let x = wx - 4; x < wx + ww + 4; x++) {
          if (inside(x, y)) continue;
          let near = false;
          for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4; dx++) if (inside(x + dx, y + dy)) { near = true; break; }
          if (!near) continue;
          const inner = inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1);
          b.set(x, y, rp(ST, inner ? 7.2 : x < wx + ww / 2 ? 5.2 : 3.2, x, y));
        }
        for (let x = wx - 6; x < wx + ww + 6; x++) { b.set(x, yb + 4, ST[8]); b.set(x, yb + 5, ST[6]); b.set(x, yb + 6, ST[1]); }
        for (let y = Math.floor(yt); y < yb; y++) for (let x = wx; x < wx + ww; x++) {
          if (!inside(x, y)) continue;
          const gi = glassAt(x, y);
          if (gi < 0) { b.set(x, y, hex('#08080d')); continue; }
          const P = colorOf(gi);
          const cd = Math.hypot((x - wx - ww / 2) / ww, (y - (yt + yb) / 2) / (yb - yt));
          b.set(x, y, rp(P, 2.7 - cd * 1.8 + (gi === 6 ? 0.6 : 0) + (h2(x, y, S) - 0.5) * 0.35, x, y));
        }
        // god rays down-right toward the floor
        const yr0 = yt + 8;
        for (let y = Math.floor(yr0); y < Math.min(h, yb + LR); y++) {
          const s0 = Math.max(0, y - yb), s1 = y - yr0;
          if (s1 < 0) continue;
          for (let x = wx; x < wx + ww + LR * kx + 2; x++) {
            const sa = Math.max(s0, (x - (wx + ww)) / kx), sb = Math.min(s1, (x - wx) / kx);
            if (sa > sb || sa > LR) continue;
            let gi = -1;
            for (let ss = Math.min(sb, sa + 4); gi < 0 && ss <= sb; ss += 3) gi = glassAt(Math.floor(x - ss * kx), Math.floor(y - ss));
            if (gi < 0) continue;
            const P = colorOf(gi);
            const streak = 0.5 + 0.5 * Math.sin((x - y * kx) * 0.5 + k * 2);
            const a = Math.pow(1 - sa / LR, 1.2) * (0.35 + 0.65 * streak) * (sa < 3 ? 0.3 : 1);
            const q = Math.round(a * 4);
            if (q <= 0) continue;
            rays.set(x, y, withA(P[3], q * 23));
          }
        }
      }
    }
    layers.glass = mkLayer(b.canvas(), 0.18, fy, 'full');
    layers.rays = mkLayer(rays.canvas(), 0.18, fy, 'full');
  }

  // ---- columns, arches, banners, torches (warm, torch-lit stone)
  const torches = [];
  {
    const ST = pal(['#0b090b', '#120f12', '#191519', '#211c20', '#2b2529', '#362e32', '#43393b', '#544745', '#6a5850', '#86705e']);
    const BAN = [pal(['#220810', '#3c0e18', '#5a1422', '#781e2c', '#982a36']), pal(['#081a16', '#0e2a22', '#163e30', '#1f5240', '#2a6a52'])];
    const GOLD = pal(['#4a3410', '#8a6420', '#c09838', '#e8c860']);
    const w = 768, fy = 0.38, h = fullH(E, fy), b = new Buf(w, h), m = new Mask(w, h);
    const tiers = Math.max(1, Math.ceil((h - 40) / 230));
    const arches = [];
    for (let k = 0; k < 4; k++) {
      const cx = k * spacing + spacing / 2;
      rRect(cx - colW / 2, 0, colW, h, m.P(1));
      for (let tr = 1; tr < tiers; tr++) rRect(cx - colW / 2 - 5, h - 128 - tr * 230 + 40, colW + 10, 6, m.P(3));
      rRect(cx - colW / 2 - 6, h - 14, colW + 12, 14, m.P(3));
      for (let tr = 0; tr < tiers; tr++) {
        const sy = h - 128 - tr * 230;
        rRect(cx - colW / 2 - 5, sy - 8, colW + 10, 8, m.P(3));
        const xl = cx + colW / 2, xr = cx + spacing - colW / 2, span = xr - xl, rad = span * 0.56;
        arches.push({ xl, xr, sy, rad, cxl: xl + rad, cxr: xr - rad });
        const apex = Math.round(sy - Math.sqrt(rad * rad - (rad - span / 2) * (rad - span / 2))), ctop = apex - 26;
        for (let y = ctop; y < sy; y++) for (let x = Math.floor(xl); x < xr; x++) {
          const dl = Math.hypot(x + 0.5 - (xl + rad), y - sy), dr = Math.hypot(x + 0.5 - (xr - rad), y - sy);
          const inA = dl <= rad && dr <= rad;
          if (y < ctop + 4) m.set(x, y, 3);
          else if (!inA) m.set(x, y, 4);
          else if (dl > rad - 9 || dr > rad - 9) m.set(x, y, 2);
        }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = m.m[y * w + x]; if (!k) continue;
      let v;
      if (k === 1) {
        const cx = Math.floor(x / spacing) * spacing + spacing / 2, u = (x + 0.5 - cx) / (colW / 2);
        v = 1.3 + 3.8 * clamp(Math.cos((u + 0.25) * Math.PI / 2), 0, 1);
        if (Math.abs(((u + 1) * 3.5) % 1 - 0.5) < 0.15 && Math.abs(u) < 0.9) v -= 0.7;
        if (y % 24 === 0) v -= 0.5;
      } else if (k === 2) {
        let a = 0;
        for (const A of arches) if (x >= A.xl - 1 && x <= A.xr + 1 && y < A.sy + 1) { const useL = x < (A.xl + A.xr) / 2; a = Math.atan2(y - A.sy, x + 0.5 - (useL ? A.cxl : A.cxr)) * (useL ? 1 : -1); }
        v = 4 + (h2(x >> 2, y >> 2, S + 9) - 0.5) * 0.6;
        if (Math.abs((a * 12) % 1) < 0.1) v = 1.6;
        if (!m.at(x, y + 1) || !m.at(x + 1, y + 1) || !m.at(x - 1, y + 1)) v = 6.2;
        else if (m.at(x, y - 1) === 4) v = 2;
      } else if (k === 3) {
        v = !m.at(x, y - 1) || m.at(x, y - 1) === 1 && m.at(x, y - 2) === 1 ? 6.4 : 4 + ((x + y) % 7 === 0 ? -0.6 : 0);
        if (!m.at(x, y + 1) || m.at(x, y + 1) === 1) v = 1.6;
        if (!m.at(x - 1, y)) v += 1; if (!m.at(x + 1, y)) v -= 1.4;
      } else {
        const row = Math.floor(y / 6), bx = (x + (row % 2) * 6) % 12;
        v = 2.6 + (h2(Math.floor((x + (row % 2) * 6) / 12), row, S + 21) - 0.5) * 1;
        if (y % 6 === 0 || bx === 0) v = 1.2;
      }
      b.d[y * w + x] = rp(ST, v, x, y);
    }
    // banners hung from the arches
    for (let k = 0; k < 4; k++) {
      const P = BAN[k % 2], bw = 22, bx = k * spacing + spacing / 2 + colW / 2 + 30, A = arches.find(a => a.xl > bx - spacing && a.xl <= bx) || arches[k * tiers];
      const top = Math.round(A.sy - Math.sqrt(Math.max(0, A.rad * A.rad - (bx - A.cxl) * (bx - A.cxl)))) + 4;
      const bl = 70 + Math.floor(R() * 20), emblem = k % 3;
      for (let y = top; y < top + bl + 8; y++) for (let x = bx - bw / 2; x < bx + bw / 2; x++) {
        const lx = x - (bx - bw / 2), ly = y - top, tail = ly - bl, cut = Math.abs(lx + 0.5 - bw / 2);
        if (tail > 0 && (tail > 8 - cut * 0.75 || cut < tail * 1.1)) continue;
        let v = 2.4 + 1.1 * Math.sin(lx * 0.8 + 0.6) - (ly / bl) * 0.5;
        if (lx === 0) v = 1; if (lx === bw - 1) v = 0.4;
        let c = rp(P, v, x, y);
        if (lx === 2 || lx === bw - 3) c = rp(GOLD, 1.6 + Math.sin(lx * 0.8 + 0.6) * 0.8, x, y);
        const ex = lx + 0.5 - bw / 2, ey = ly - bl * 0.42;
        if (emblem === 0 && Math.abs(ex) + Math.abs(ey) < 6.2 && Math.abs(ex) + Math.abs(ey) > 3.4) c = GOLD[ex < 0 ? 3 : 2];
        if (emblem === 1 && Math.abs(Math.hypot(ex, ey) - 4.6) < 1) c = GOLD[ex < 0 ? 3 : 2];
        if (emblem === 2 && Math.abs(ey - Math.abs(ex) * 0.8) < 1.1 && Math.abs(ex) < 7) c = GOLD[ex < 0 ? 3 : 2];
        b.set(x, y, c);
      }
      for (let x = bx - bw / 2 - 3; x < bx + bw / 2 + 3; x++) { b.set(x, top - 1, GOLD[2]); b.set(x, top, GOLD[1]); b.set(x, top + 1, GOLD[0]); }
      rLine(bx - bw / 2 - 3, top - 1, bx - bw / 2 - 1, top - 6, b.P(GOLD[0])); rLine(bx + bw / 2 + 2, top - 1, bx + bw / 2, top - 6, b.P(GOLD[0]));
    }
    // torches on the columns
    for (let k = 0; k < 4; k++) {
      const cx = k * spacing + spacing / 2, ty = h - 100;
      glowInto(b, cx, ty - 8, 30, hex('#b0602a'), 0.42, true);
      spr(b, cx - 3, ty, ['kkkkkkk', '.kbbbk.', '..kbk..', '..kbk..', '...k...', '...k...', '..kkk..'], { k: hex('#1a1412'), b: hex('#3a2c22') });
      torches.push({ x: cx + 0.5, y: ty - 1 });
    }
    layers.cols = mkLayer(b.canvas(), 0.38, fy, 'full');
  }

  // ---- near: chains, a hanging cage, a candle ring
  const candles = [];
  {
    const w = 768, fy = 0.58, h = fullH(E, fy), b = new Buf(w, h);
    const CH = pal(['#0a0a10', '#16161e', '#262630', '#3a3a48']);
    const chain = (x, y0, y1) => {
      for (let y = y0, i = 0; y < y1; y += 3, i++) {
        if (i % 2) { b.set(x, y, CH[2]); b.set(x, y + 1, CH[1]); b.set(x, y + 2, CH[2]); }
        else { b.set(x - 1, y, CH[3]); b.set(x + 1, y, CH[1]); b.set(x - 1, y + 1, CH[3]); b.set(x + 1, y + 1, CH[1]); b.set(x, y, CH[2]); b.set(x, y + 2, CH[2]); }
      }
    };
    for (let k = 0; k < 5; k++) {
      const x = Math.floor(k * 150 + R() * 100), len = 20 + Math.floor(R() * 80);
      chain(x, 0, len);
      if (k % 3 === 0) { b.set(x, len, CH[3]); b.set(x, len + 1, CH[3]); b.set(x + 1, len + 2, CH[3]); b.set(x + 2, len + 1, CH[2]); }
      else if (k % 3 === 1) {
        for (let y = len; y < len + 20; y++) for (let i = -5; i <= 5; i += 2) b.set(x + i, y, CH[i < 0 ? 3 : 1]);
        for (let i = -5; i <= 5; i++) { b.set(x + i, len, CH[3]); b.set(x + i, len + 19, CH[3]); b.set(x + i, len + 10, CH[2]); }
        rPoly([[x - 6, len], [x + 7, len], [x + 0.5, len - 6]], b.P(CH[1]));
      }
    }
    const rx = Math.floor(R() * w), ry = 46;
    for (const s of [-1, 1]) rLine(rx, 0, rx + s * 22, ry, b.P(CH[1]));
    chain(rx, 0, ry - 10);
    for (let i = -24; i <= 24; i++) { b.set(rx + i, ry, CH[3]); b.set(rx + i, ry + 1, CH[1]); }
    for (let i = -20; i <= 20; i += 8) {
      b.set(rx + i, ry - 1, hex('#c8b890')); b.set(rx + i, ry - 2, hex('#c8b890')); b.set(rx + i, ry - 3, hex('#a89870'));
      candles.push({ x: rx + i, y: ry - 5 });
    }
    layers.near = mkLayer(b.canvas(), 0.58, fy, 'full');
  }

  const flames = [];
  for (let f = 0; f < 4; f++) {
    const b = new Buf(9, 14, false), rr = mulberry32(S + 500 + f);
    const FL = pal(['#a83810', '#ff8a20', '#ffd050', '#fff8d0']);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 9; x++) {
      const fy2 = y / 13, wob = Math.sin(f * 1.7 + y * 0.6) * 1.2 * (1 - fy2);
      const wdt = 3.6 * Math.pow(fy2, 0.6) * (1 - Math.pow(fy2, 6) * 0.4);
      const d = Math.abs(x + 0.5 - 4.5 - wob) / Math.max(0.5, wdt);
      if (d > 1 || (y < 3 && rr() < 0.4)) continue;
      b.set(x, y, FL[clamp(Math.floor((1 - d) * 2.6 + fy2 * 1.4), 0, 3)]);
    }
    flames.push(b.canvas());
  }
  const glowT = glowSprite(20, '#ff7a20', 0.38);
  const glowK = glowSprite(6, '#ffb040', 0.5);
  const motes = [];
  for (let i = 0; i < 32; i++) motes.push({ x: R() * (W + 20), y: R() * (H + 20), p: R() * TAU, f: 0.15 + R() * 0.3, v: 2 + R() * 4 });

  return {
    fog: '#22223a',
    back(g, cx, cy, t) {
      blit(g, layers.glass, E, cx, cy, t);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.6);
      blit(g, layers.rays, E, cx, cy, t);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      blit(g, layers.cols, E, cx, cy, t);
      torches.forEach((tc, i) => {
        onScreen(layers.cols, E, cx, cy, t, tc.x, tc.y, 24, (x, y) => {
          g.drawImage(flames[(Math.floor(t * 10) + i) & 3], Math.floor(x) - 4, Math.floor(y) - 13);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = clamp(0.55 + 0.2 * Math.sin(t * 9 + i * 2) + 0.1 * Math.sin(t * 23 + i), 0, 1);
          g.drawImage(glowT, Math.floor(x) - 20, Math.floor(y) - 26);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        });
      });
      blit(g, layers.near, E, cx, cy, t);
      candles.forEach((c, i) => {
        onScreen(layers.near, E, cx, cy, t, c.x, c.y, 8, (x, y) => {
          g.fillStyle = (Math.floor(t * 8) + i) % 3 ? '#ffd060' : '#ffb040';
          g.fillRect(Math.floor(x), Math.floor(y), 1, 2);
          g.fillStyle = '#fff4c0'; g.fillRect(Math.floor(x), Math.floor(y) + 1, 1, 1);
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 + 0.2 * Math.sin(t * 11 + i);
          g.drawImage(glowK, Math.floor(x) - 6, Math.floor(y) - 5);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        });
      });
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      g.fillStyle = '#e8d8b0';
      for (const m of motes) {
        const x = Math.floor(wrapP(m.x + Math.sin(t * m.f + m.p) * 20 + t * m.v - cx * 1.08, sw2)) - 10;
        const y = Math.floor(wrapP(m.y + Math.sin(t * m.f * 1.3 + m.p * 2) * 12 + t * 2 - cy * 1.08, sh2)) - 10;
        g.globalAlpha = clamp(0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9 + m.p)), 0, 1);
        g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================
// BONUS — magical swirl room

function buildBonus(E) {
  const R = E.rng, S = E.s, W = E.W, H = E.H;
  const P = pal(['#08031a', '#0e0526', '#160934', '#1f0d44', '#291254', '#341866', '#411e78', '#50268a', '#61309c',
    '#743cac', '#8a4abc', '#a25cca', '#bc74d8', '#d494e6', '#ecbef4']);
  // swirl frames (palette-cycled spiral)
  const NF = 12, frames = [];
  const cxs = W / 2, cys = H / 2 - 8;
  const ph = new Float32Array(W * H), rad = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cxs, dy = (y + 0.5 - cys) * 1.15, r = Math.hypot(dx, dy);
    ph[y * W + x] = Math.atan2(dy, dx) / TAU * 3 + Math.log(r + 6) * 1.9;
    rad[y * W + x] = r;
  }
  for (let f = 0; f < NF; f++) {
    const b = new Buf(W, H, false);
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i / W) | 0, r = rad[i];
      const band = wrapP(ph[i] - f / NF, 1), tri = 1 - Math.abs(band * 2 - 1);
      const v = 0.8 + 5.2 * Math.exp(-r / 150) + 3.2 * Math.pow(tri, 2.4) * (0.45 + 0.55 * Math.exp(-r / 240)) + 4.2 * Math.exp(-r / 20);
      b.d[i] = rp(P, v, x, y);
    }
    frames.push(b.canvas());
  }
  // rune rings — frames covering one glyph step
  const GL = [];
  for (let i = 0; i < 18; i++) {
    const strokes = [];
    if (i % 5 === 4) { strokes.push([[0, -4], [3, 0]], [[3, 0], [0, 4]], [[0, 4], [-3, 0]], [[-3, 0], [0, -4]], [[0, -1], [0, 1]]); }
    else {
      strokes.push([[0, -4], [0, 4]]);
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const y0 = [-4, -2, 0, 2][Math.floor(R() * 4)], s2 = R() < 0.5 ? -1 : 1, dy = [-2, 0, 2][Math.floor(R() * 3)];
        strokes.push([[0, y0], [s2 * 3, clamp(y0 + dy, -4, 4)]]);
        if (R() < 0.3) strokes.push([[s2 * 3, clamp(y0 + dy, -4, 4)], [s2 * 3, clamp(y0 + dy + 3, -4, 4)]]);
      }
    }
    GL.push(strokes);
  }
  const ring = (r0, nG, NFr, glyphCol, lineCol, dir) => {
    const size = Math.ceil(r0 + 10) * 2 + 1, c = size / 2, out = [];
    const lc = hex(lineCol), gc = hex(glyphCol), hc = hex('#5a2aa0', 150);
    for (let f = 0; f < NFr; f++) {
      const b = new Buf(size, size, false);
      for (const rr of [r0 - 7, r0 + 7]) rDisc(c, c, rr + 0.6, () => {});
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (Math.abs(d - (r0 - 7)) < 0.55 || Math.abs(d - (r0 + 7)) < 0.55) b.d[y * size + x] = lc;
        else if (d > r0 - 6.5 && d < r0 + 6.5) b.d[y * size + x] = withA(hex('#2a0e5a'), 110);
      }
      const rot = dir * (f / NFr) * (TAU / nG);
      for (let g = 0; g < nG; g++) {
        const a = rot + g * TAU / nG, ca = Math.cos(a), sa = Math.sin(a);
        const map = (p) => [c + ca * (r0 + p[1] * 1.0) - sa * p[0] * 1.0, c + sa * (r0 + p[1] * 1.0) + ca * p[0] * 1.0];
        for (const [p, q] of GL[g % GL.length]) { const A = map(p), B = map(q); rSeg(A[0], A[1], B[0], B[1], 1.1, 1.1, (x, y) => { if (!(b.get(x, y) === gc)) b.set(x, y, hc); }); }
        for (const [p, q] of GL[g % GL.length]) { const A = map(p), B = map(q); rLine(A[0], A[1], B[0], B[1], b.P(gc)); }
      }
      out.push(b.canvas());
    }
    return out;
  };
  const ringA = ring(78, 16, 24, '#f0c8ff', '#9a64e0', 1);
  const ringB = ring(46, 10, 24, '#ffd8f4', '#c070d8', -1);
  // sparkle field layer
  const spk = new Buf(768, fullH(E, 0.25));
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(R() * 768), y = Math.floor(R() * spk.h), big = R() < 0.25;
    const c1 = hex(R() < 0.5 ? '#e8b8ff' : '#ffc8ec'), c2 = hex('#7a46c0');
    spk.set(x, y, c1);
    if (big) { spk.set(x - 1, y, c2); spk.set(x + 1, y, c2); spk.set(x, y - 1, c2); spk.set(x, y + 1, c2); spk.set(x - 2, y, withA(c2, 120)); spk.set(x + 2, y, withA(c2, 120)); spk.set(x, y - 2, withA(c2, 120)); spk.set(x, y + 2, withA(c2, 120)); }
  }
  const field = mkLayer(spk.canvas(), 0.25, 0.25, 'full');
  const sparks = [];
  for (let i = 0; i < 26; i++) sparks.push({ x: R() * (W + 20), y: R() * (H + 20), p: R(), r: 0.3 + R() * 0.5, v: 6 + R() * 10 });
  // dotted outer ring (one dot-step of rotation over 8 frames)
  const dots = [];
  { const r0 = 104, size = 2 * r0 + 7, c = size / 2, n = 48;
    for (let f = 0; f < 8; f++) { const b = new Buf(size, size, false);
      for (let i = 0; i < n; i++) { const a = (i + f / 8) * TAU / n, x = c + Math.cos(a) * r0, y = c + Math.sin(a) * r0;
        b.set(x, y, hex(i % 4 ? '#8a5ad0' : '#e0b0ff')); if (i % 4 === 0) { b.set(x + 1, y, hex('#7a46c0')); b.set(x - 1, y, hex('#7a46c0')); b.set(x, y + 1, hex('#7a46c0')); b.set(x, y - 1, hex('#7a46c0')); } }
      dots.push(b.canvas()); } }
  const orbS = [glowSprite(5, '#d080ff', 0.7), glowSprite(4, '#ff90d8', 0.7), glowSprite(6, '#90a0ff', 0.6)];
  const orbs = [];
  for (let i = 0; i < 9; i++) orbs.push({ x: R() * (W + 60), y: 20 + R() * (H - 40), p: R() * TAU, f: 0.3 + R() * 0.4, k: i % 3 });

  return {
    fog: '#2a1458',
    back(g, cx, cy, t) {
      g.drawImage(frames[Math.floor(t * 5) % NF], 0, 0);
      blit(g, field, E, cx, cy, t);
      const x0 = Math.floor(cxs), ry = Math.floor(cys);
      const dd = dots[Math.floor(t * 3) & 7], a = ringA[Math.floor(t * 8) % 24], b2 = ringB[Math.floor(t * 10) % 24];
      g.drawImage(dd, x0 - (dd.width >> 1), ry - (dd.width >> 1));
      g.drawImage(a, x0 - (a.width >> 1), ry - (a.width >> 1));
      g.drawImage(b2, x0 - (b2.width >> 1), ry - (b2.width >> 1));
      g.globalCompositeOperation = 'lighter';
      for (const o of orbs) {
        const sp = orbS[o.k], r = (sp.width - 1) >> 1;
        const x = Math.floor(wrapP(o.x + Math.sin(t * o.f + o.p) * 10 - cx * 0.5, W + 60)) - 30;
        const y = Math.floor(wrapP(o.y + Math.sin(t * o.f * 1.3 + o.p) * 8 - (cy - E.maxCamY) * 0.5, H + 40)) - 20;
        g.globalAlpha = 0.55 + 0.3 * Math.sin(t * 1.5 + o.p);
        g.drawImage(sp, x - r, y - r);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
    front(g, cx, cy, t) {
      const sw2 = W + 20, sh2 = H + 20;
      for (const s of sparks) {
        const ph = wrapP(t * s.r + s.p, 1);
        if (ph > 0.5) continue;
        const k = Math.sin(ph * 2 * Math.PI);
        const x = Math.floor(wrapP(s.x - cx * 1.1, sw2)) - 10, y = Math.floor(wrapP(s.y - t * s.v - cy * 1.1, sh2)) - 10;
        g.globalAlpha = 0.8 * k;
        g.fillStyle = '#fff0ff'; g.fillRect(x, y, 1, 1);
        if (k > 0.6) { g.globalAlpha = 0.5 * k; g.fillStyle = '#d090ff'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
        if (k > 0.9) { g.globalAlpha = 0.3; g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
      }
      g.globalAlpha = 1;
    },
  };
}

// ===========================================================================

const BUILDERS = { wood: buildWood, bog: buildBog, mine: buildMine, belfry: buildBelfry, village: buildVillage, keep: buildKeep, bonus: buildBonus };

export function makeBackground(theme, { W = 384, H = 216, levelW = 4000, levelH = 216, seed = 1 } = {}) {
  if (!BUILDERS[theme]) theme = 'wood';
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
