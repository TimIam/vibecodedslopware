// pix.js — a tiny software rasteriser for crisp, lit pixel-art sprites, plus colour helpers and the bitmap font.
// Shapes are shaded per pixel from a fake 3D normal and an ordered dither between ramp tones, which gives the
// soft pre-rendered 16-bit look without any anti-aliasing. Works in the browser and (minus toCanvas) in node.

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function css(c, a = 1) {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb([h, s, l]) {
  const f = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255].map(Math.round);
}
export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round); }
export function shadeCol(c, k) { return c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))); }

// Light-to-dark ramp with hue shifting: highlights drift warm, shadows drift cool and more saturated.
export function ramp(h, n = 5, spread = 1) {
  const base = rgb2hsl(typeof h === 'string' ? hex(h) : h);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1); // 0 = light, 1 = dark
    const k = (t - 0.4) * spread;
    let hh = base[0] + (k > 0 ? 0.045 : 0.03) * k * (base[0] > 0.12 && base[0] < 0.6 ? 1 : -1);
    hh = (hh + 1) % 1;
    const ss = Math.max(0, Math.min(1, base[1] * (1 + 0.25 * k) - (k < 0 ? 0.08 * -k : 0)));
    const ll = Math.max(0.02, Math.min(0.97, base[2] - 0.34 * k * (base[2] < 0.25 ? 0.6 : 1)));
    out.push(hsl2rgb([hh, ss, ll]));
  }
  return out;
}

const LX = -0.48, LY = -0.62, LZ = 0.62;
const LN = Math.hypot(LX, LY, LZ);
const L = [LX / LN, LY / LN, LZ / LN];
export function light(nx, ny, nz) {
  const d = nx * L[0] + ny * L[1] + nz * L[2];
  return Math.max(0, Math.min(1, 0.22 + 0.85 * d));
}

// Painter: shapes are rasterised at ss times resolution with smooth Phong lighting (diffuse ramp, specular highlight,
// cool rim light, a little grain), then resolved down to 1x with a hard alpha edge and a darkened silhouette rim:
// the look of rendered 3D sprites squeezed onto a 16-bit screen. ss = 1 keeps plain one-pass painting (title, map).
const HV = (() => { const x = L[0], y = L[1], z = L[2] + 1, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
function lerpRamp(r, l) {
  const n = r.length, v = (1 - Math.max(0, Math.min(1, l))) * (n - 1), i = Math.floor(v), f = v - i;
  const a = r[i], b = r[Math.min(n - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export class Painter {
  constructor(w, h, ox = 0, oy = 0, ss = 1) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy; this.ss = ss;
    this.W = w * ss; this.H = h * ss;
    this.c = new Float32Array(this.W * this.H * 3);
    this.a = new Uint8Array(this.W * this.H);
    this.rim = 0.55; // silhouette darkening on resolve
  }
  _lx(ax) { return (ax + 0.5) / this.ss - this.ox; }
  _ly(ay) { return (ay + 0.5) / this.ss - this.oy; }
  _put(ax, ay, c) { const i = ay * this.W + ax; this.c[i * 3] = c[0]; this.c[i * 3 + 1] = c[1]; this.c[i * 3 + 2] = c[2]; this.a[i] = 1; }
  _box(x0, y0, x1, y1) {
    const s = this.ss;
    return [Math.max(0, Math.floor((x0 + this.ox) * s)), Math.max(0, Math.floor((y0 + this.oy) * s)), Math.min(this.W - 1, Math.ceil((x1 + this.ox) * s)), Math.min(this.H - 1, Math.ceil((y1 + this.oy) * s))];
  }
  // lit colour for a surface normal
  shade(r, nx, ny, nz, o, ax, ay) {
    let l = o.flat != null ? o.flat : light(nx, ny, nz);
    if (o.bias) l += o.bias;
    let c = lerpRamp(r, l);
    if (o.flat == null || o.gloss) {
      const sp = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), o.shin || 16) * (o.spec ?? 0.32);
      const rim = Math.pow(1 - Math.max(0, nz), 2.4) * Math.max(0, nx * 0.8 - ny * 0.2) * (o.rim ?? 0.3);
      c = [c[0] + (255 - c[0]) * sp + 70 * rim, c[1] + (255 - c[1]) * sp + 95 * rim, c[2] + (250 - c[2]) * sp + 130 * rim];
    }
    const gr = o.grain ?? 0.035;
    if (gr) { const k = 1 + (hash2(ax, ay, 7) - 0.5) * gr * 2; c = [c[0] * k, c[1] * k, c[2] * k]; }
    return c;
  }
  set(x, y, c, a = 255) {
    // one screen pixel (eyes, mouths, details): fill its ss by ss block
    const s = this.ss, X = Math.floor(x + this.ox), Y = Math.floor(y + this.oy);
    if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) return;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const ax = X * s + i, ay = Y * s + j, k = ay * this.W + ax;
      if (a >= 255 || !this.a[k]) this._put(ax, ay, c);
      else { const t = a / 255; this.c[k * 3] += (c[0] - this.c[k * 3]) * t; this.c[k * 3 + 1] += (c[1] - this.c[k * 3 + 1]) * t; this.c[k * 3 + 2] += (c[2] - this.c[k * 3 + 2]) * t; }
    }
  }
  opaque(x, y) { const s = this.ss, X = Math.floor((x + this.ox) * s), Y = Math.floor((y + this.oy) * s); return X >= 0 && Y >= 0 && X < this.W && Y < this.H && !!this.a[Y * this.W + X]; }
  // dithered ramp pick, for the plain painted screens (title, map)
  pick(r, l, ax, ay) {
    const n = r.length, v = (1 - l) * (n - 1), i = Math.floor(v), f = v - i;
    return r[Math.min(n - 1, f > BAYER4[(ay & 3) * 4 + (ax & 3)] ? i + 1 : i)];
  }
  ellipse(cx, cy, rx, ry, r, opts = {}) {
    const rot = opts.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), R = Math.max(rx, ry) + 1;
    const [x0, y0, x1, y1] = this._box(cx - R, cy - R, cx + R, cy + R);
    const ek = Math.max(0, 1 - 1.3 / Math.min(rx, ry)), edgeK = ek * ek;
    for (let ay = y0; ay <= y1; ay++) for (let ax = x0; ax <= x1; ax++) {
      const px = this._lx(ax) - cx, py = this._ly(ay) - cy;
      const lx = px * cs + py * sn, ly = -px * sn + py * cs;
      const nx = lx / rx, ny = ly / ry, q = nx * nx + ny * ny;
      if (q > 1) continue;
      if (opts.clip && !opts.clip(px + cx, py + cy)) continue;
      const wx = nx * cs - ny * sn, wy = nx * sn + ny * cs, nz = Math.sqrt(Math.max(0, 1 - q));
      let c = this.shade(r, wx, wy, nz, opts, ax, ay);
      const k = ay * this.W + ax;
      if (opts.edge && this.a[k] && q > edgeK) c = [c[0] * 0.58, c[1] * 0.56, c[2] * 0.62];
      this._put(ax, ay, c);
    }
  }
  capsule(x0, y0, x1, y1, r0, r1, r, opts = {}) {
    const R = Math.max(r0, r1) + 1;
    const [bx0, by0, bx1, by1] = this._box(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R);
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
    for (let ay = by0; ay <= by1; ay++) for (let ax = bx0; ax <= bx1; ax++) {
      const px = this._lx(ax), py = this._ly(ay);
      let t = ((px - x0) * dx + (py - y0) * dy) / len2; t = Math.max(0, Math.min(1, t));
      const qx = x0 + dx * t, qy = y0 + dy * t, rr = r0 + (r1 - r0) * t;
      const ex = px - qx, ey = py - qy, dd = Math.hypot(ex, ey);
      if (dd > rr) continue;
      const k = dd / rr, nz = Math.sqrt(Math.max(0, 1 - k * k));
      const nx = dd > 0 ? (ex / dd) * k : 0, ny = dd > 0 ? (ey / dd) * k : 0;
      const ramp = opts.stripe && Math.floor((py - opts.stripe.o) / opts.stripe.p) % 2 ? opts.stripe.r : r;
      let c = this.shade(ramp, nx, ny, nz, opts, ax, ay);
      const i = ay * this.W + ax;
      if (opts.edge && this.a[i] && k > 1 - 1.1 / rr) c = [c[0] * 0.58, c[1] * 0.56, c[2] * 0.62];
      this._put(ax, ay, c);
    }
  }
  poly(pts, r, opts = {}) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const nx0 = opts.nx || 0, ny0 = opts.ny || 0, nz0 = Math.sqrt(Math.max(0, 1 - nx0 * nx0 - ny0 * ny0));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, s = this.ss;
    const bend = opts.round ?? 0.6;
    const [, ay0, , ay1] = this._box(minx, miny, maxx, maxy);
    for (let ay = ay0; ay <= ay1; ay++) {
      const py = this._ly(ay);
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py)) xs.push(xi + ((py - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const sx0 = xs[k], sx1 = xs[k + 1];
        for (let ax = Math.max(0, Math.ceil((sx0 + this.ox) * s - 0.5)); ax <= Math.min(this.W - 1, Math.floor((sx1 + this.ox) * s - 0.5)); ax++) {
          const px = this._lx(ax);
          let c;
          if (opts.flat != null && !opts.lit) {
            let l = opts.flat;
            if (opts.grad) l += (px - cx) * opts.grad[0] + (py - cy) * opts.grad[1];
            // flat shapes still get a soft round falloff across the span
            const u = sx1 > sx0 ? ((px - sx0) / (sx1 - sx0)) * 2 - 1 : 0;
            l -= Math.pow(Math.abs(u), 3) * 0.18 * bend + u * 0.06;
            c = this.shade(r, 0, 0, 1, { ...opts, flat: l }, ax, ay);
          } else {
            // a soft cylindrical normal across the span, so cloth and cones read as round
            const u = sx1 > sx0 ? ((px - sx0) / (sx1 - sx0)) * 2 - 1 : 0;
            const nx = nx0 + u * bend, nn = Math.hypot(nx, ny0, nz0) || 1;
            c = this.shade(r, nx / nn, ny0 / nn, nz0 / nn, { ...opts, flat: undefined }, ax, ay);
          }
          this._put(ax, ay, c);
        }
      }
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // kept for the old call sites: sets how dark the resolved silhouette rim gets (0 = none)
  outline(k = 0.55) { this.rim = k; }
  // supersampled buffer to RGBA at 1x: average covered samples, hard alpha at half coverage, darken the rim
  resolve() {
    const { w, h, ss, W } = this, out = new Uint8ClampedArray(w * h * 4), n = ss * ss;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let cov = 0, r = 0, g = 0, b = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const k = (y * ss + j) * W + x * ss + i;
        if (this.a[k]) { cov++; r += this.c[k * 3]; g += this.c[k * 3 + 1]; b += this.c[k * 3 + 2]; }
      }
      if (cov === 0 || cov * 2 < n) continue;
      const o = (y * w + x) * 4;
      out[o] = r / cov; out[o + 1] = g / cov; out[o + 2] = b / cov; out[o + 3] = 255;
    }
    if (this.rim > 0) {
      const src = new Uint8ClampedArray(out), k = 1 - this.rim * 0.6;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (!src[o + 3]) continue;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !src[o - 4 + 3] || !src[o + 4 + 3] || !src[o - w * 4 + 3] || !src[o + w * 4 + 3];
        if (edge) { out[o] = src[o] * k; out[o + 1] = src[o + 1] * k; out[o + 2] = src[o + 2] * Math.min(1, k + 0.08); }
      }
    }
    this.d = out;
    return out;
  }
  toCanvas(opts = {}) {
    const d = this.resolve();
    if (opts.hurt) for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { d[i] = Math.min(255, d[i] * 0.5 + 140); d[i + 1] *= 0.6; d[i + 2] *= 0.6; }
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(d, this.w, this.h), 0, 0);
    return c;
  }
}

// Deterministic hash noise for tiles and decoration.
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 3) {
  let a = 0, f = 1, w = 0.5, t = 0;
  for (let i = 0; i < oct; i++) { a += vnoise(x * f, y * f, s + i * 17) * w; t += w; f *= 2; w *= 0.5; }
  return a / t;
}

// ---------------------------------------------------------------------------------------------------------------
// Bitmap font, 5×7 cells (a few glyphs narrower). '#' = ink.
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#..##', '#.#.#', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
};
export const FONT_H = 7;
export function glyph(ch) { return GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS['?']; }
export function textWidth(s, scale = 1) {
  let w = 0;
  for (const ch of s) w += (glyph(ch)[0].length + 1) * scale;
  return Math.max(0, w - scale);
}
// Draw text onto a 2D context with 1px dark outline/shadow. color: css string.
export function drawText(ctx, s, x, y, color = '#fff', opts = {}) {
  const scale = opts.scale || 1, align = opts.align || 'left';
  const w = textWidth(s, scale);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  const shadow = opts.shadow === undefined ? '#120818' : opts.shadow;
  const paint = (ox, oy, col) => {
    ctx.fillStyle = col;
    let px = cx + ox;
    for (const ch of s) {
      const g = glyph(ch);
      for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') ctx.fillRect(px + c * scale, y + oy + r * scale, scale, scale);
      px += (g[0].length + 1) * scale;
    }
  };
  if (shadow) {
    if (opts.outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) paint(ox * scale, oy * scale, shadow);
    else paint(scale, scale, shadow);
  }
  if (opts.grad) {
    // vertical two-colour gradient, row by row
    for (let r = 0; r < FONT_H; r++) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - 2, y + r * scale, w + 4, scale); ctx.clip();
      paint(0, 0, r < FONT_H / 2 ? opts.grad[0] : r < FONT_H - 1 ? opts.grad[1] : opts.grad[2] || opts.grad[1]);
      ctx.restore();
    }
  } else paint(0, 0, color);
  return w;
}
