// Pixel art, made in code. A tiny software rasteriser draws iso boxes, roofs and cylinders
// pixel by pixel so everything stays crisp, then the sprite is cached per (type, era, siding, hue).
import { B, F } from './data.js';

// ---------- colour ----------
export const pk = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const sh = (c, f) => pk(cl(c[0] * f), cl(c[1] * f), cl(c[2] * f));
export function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const H = (hx) => hex(hx);
const LIGHT = [0.96, 0.72, 1.1]; // SW wall, SE wall, top

// ---------- canvas ----------
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// ---------- software sprite ----------
export class Spr {
  // w, d: footprint in the building's own frame. rot 0-3: which of the four directions it is seen from.
  constructor(w, d, top = 64, pad = 4, rot = 0) {
    this.rot = rot & 3; this.lw = w; this.ld = d;
    const vw = rot & 1 ? d : w, vd = rot & 1 ? w : d;
    this.W = Math.ceil((vw + vd) * 16 + pad * 2 + top * 0.95); // room on the right for the cast shadow
    this.H = Math.ceil((vw + vd) * 8 + top + pad * 2);
    this.ox = vd * 16 + pad; this.oy = top + pad;
    this.buf = new Uint32Array(this.W * this.H);
    this.zb = new Float32Array(this.W * this.H).fill(-1e9);  // depth: X+Y grows toward the viewer along any pixel's ray
    this.gnd = new Uint8Array(this.W * this.H); this.gm = 0; // which pixels are the plot's own ground
    this.shm = new Uint8Array(this.W * this.H);              // cast shadow mask
    this.dp = 0; // depth of the last projected point, used by loose pixels and lines
    this.smoke = []; this.extra = {};
  }
  // building frame -> view frame, and back
  v(x, y) {
    switch (this.rot) {
      case 1: return [this.ld - y, x];
      case 2: return [this.lw - x, this.ld - y];
      case 3: return [y, this.lw - x];
      default: return [x, y];
    }
  }
  iv(X, Y) {
    switch (this.rot) {
      case 1: return [Y, this.ld - X];
      case 2: return [this.lw - X, this.ld - Y];
      case 3: return [this.lw - Y, X];
      default: return [X, Y];
    }
  }
  vdir(dx, dy) {
    switch (this.rot) {
      case 1: return [-dy, dx];
      case 2: return [-dx, -dy];
      case 3: return [dy, -dx];
      default: return [dx, dy];
    }
  }
  // which shading a surface facing this building-frame direction gets: 0 lit wall side, 1 shaded side, 2 turned away
  faceIdx(dx, dy) { const [X, Y] = this.vdir(dx, dy); return Y > 0 ? 0 : X > 0 ? 1 : 2; }
  set(x, y, c, d = this.dp) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H || !c) return;
    const i = y * this.W + x;
    if (d < this.zb[i] - 0.02) return;
    this.zb[i] = d; this.buf[i] = c; this.gnd[i] = this.gm;
  }
  // returns [screen x, screen y, depth]
  p(gx, gy, z = 0) { const [X, Y] = this.v(gx, gy); this.dp = X + Y; return [this.ox + (X - Y) * 16, this.oy + (X + Y) * 8 - z, X + Y]; }
  scan(pts, put) {
    let y0 = 1e9, y1 = -1e9;
    for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5; x++) put(x, y);
    }
  }
  // scanline polygon fill with depth interpolated across the plane; fn(sx, sy) -> colour
  poly(pts, fn) {
    let a = 0, b = 0, c = pts[0][2] || 0;
    for (let k = 2; k < pts.length; k++) {
      const [P, Q, R0] = [pts[0], pts[1], pts[k]];
      const det = (Q[0] - P[0]) * (R0[1] - P[1]) - (R0[0] - P[0]) * (Q[1] - P[1]);
      if (Math.abs(det) < 1e-6) continue;
      a = ((Q[2] - P[2]) * (R0[1] - P[1]) - (R0[2] - P[2]) * (Q[1] - P[1])) / det;
      b = ((R0[2] - P[2]) * (Q[0] - P[0]) - (Q[2] - P[2]) * (R0[0] - P[0])) / det;
      c = P[2] - a * P[0] - b * P[1];
      break;
    }
    this.scan(pts, (x, y) => this.set(x, y, fn(x, y), a * (x + 0.5) + b * (y + 0.5) + c));
  }
  // late-afternoon sun from the upper left of the screen: a point at height z lands this far along the ground
  shadow(pts) {
    if (this.gm) return;
    const q = pts.map(([gx, gy, z]) => {
      const [X, Y] = this.v(gx, gy), XX = X + (z * 0.78) / 16, YY = Y - (z * 0.16) / 16;
      return [this.ox + (XX - YY) * 16, this.oy + (XX + YY) * 8];
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = q.length - 1; i >= 0; i--) { const p = q[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    if (hull.length < 3) return;
    this.scan(hull, (x, y) => { if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.shm[y * this.W + x] = 1; });
  }
  shadowBox(x, y, w, d, z, h) { const P = []; for (const [a, b] of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) P.push([a, b, z], [a, b, z + h]); this.shadow(P); }
  // a vertical wall. face, in the building's own frame: 0 the +y wall, 1 +x, 2 -y, 3 -x. Faces turned away are not drawn.
  // inner draws the inside of a far wall instead (for roofless ruins). h may be a function of the column.
  // fn(u, v, side, len, h, face) -> colour, where side is 0 or 1 for how the wall sits in this view
  wall(face, x, y, w, d, z, h, fn, inner = false) {
    const e = [[x, y + d, x + w, y + d], [x + w, y + d, x + w, y], [x + w, y, x, y], [x, y, x, y + d]][face];
    let A = this.p(e[0], e[1], z), Z = this.p(e[2], e[3], z);
    const seen = Z[0] > A[0];
    const span = Math.round(Math.abs(Z[0] - A[0]));
    if (!inner) {
      let hm = 0;
      for (let c = 0; c < span; c += 2) hm = Math.max(hm, typeof h === 'function' ? h(c) : h);
      if (hm > 0) this.shadowBox(Math.min(e[0], e[2]), Math.min(e[1], e[3]), Math.abs(e[2] - e[0]) || 0.001, Math.abs(e[3] - e[1]) || 0.001, z, hm);
    }
    if (seen === inner) return;
    if (inner) [A, Z] = [Z, A];
    const side = Z[1] > A[1] ? 0 : 1, X = Math.round(A[0]);
    for (let c = 0; c < span; c++) {
      const base = Math.round(A[1] + (side === 0 ? c * 0.5 + 0.25 : -c * 0.5 - 0.25));
      const hh = typeof h === 'function' ? h(c) : h, dep = A[2] + ((Z[2] - A[2]) * (c + 0.5)) / span;
      for (let v = 0; v < hh; v++) this.set(X + c, base - 1 - v, fn(c, v, side, span, hh, face), dep);
    }
  }
  walls(x, y, w, d, z, h, fn) { for (let f = 0; f < 4; f++) this.wall(f, x, y, w, d, z, h, fn); }
  // flat top. fn(u, v, sx, sy) where u, v run across the rectangle, 16 per tile, in the building's own frame
  top(x, y, w, d, z, fn) {
    const pts = [this.p(x, y, z), this.p(x + w, y, z), this.p(x + w, y + d, z), this.p(x, y + d, z)];
    const ox = this.ox, oy = this.oy - z;
    this.poly(pts, (sx, sy) => {
      const S0 = sx + 0.5 - ox, T0 = sy + 0.5 - oy;
      const [gx, gy] = this.iv((S0 / 16 + T0 / 8) / 2, (T0 / 8 - S0 / 16) / 2);
      return fn((gx - x) * 16, (gy - y) * 16, sx, sy);
    });
  }
  box(x, y, w, d, z, h, m) {
    this.walls(x, y, w, d, z, h, m.wall);
    if (m.top) this.top(x, y, w, d, z + h, m.top);
  }
  line(x0, y0, x1, y1, c, d0 = this.dp, d1 = d0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, steps = Math.max(dx, -dy) || 1;
    let e = dx + dy, n = 0;
    for (;;) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0) : c, d0 + ((d1 - d0) * n) / steps);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
      n++;
    }
  }
  // upright cylinder (tanks, silos). base colour array; top colour array.
  cyl(cx, cy, r, z, h, col, topc, bands = 0) {
    const [sx, sy, D] = this.p(cx, cy, z), rx = r * 22.6, ry = r * 11.3;
    for (let x = Math.ceil(sx - rx); x <= sx + rx; x++) {
      const t = (x + 0.5 - sx) / rx; if (Math.abs(t) > 1) continue;
      const q = Math.sqrt(1 - t * t), ey = ry * q, f = 1.08 - 0.42 * ((t + 1) / 2) - (t < -0.85 ? 0.12 : 0), front = D + r * 1.414 * q;
      for (let y = Math.round(sy - h + ey); y < Math.round(sy + ey); y++) {
        const band = bands && ((Math.round(sy + ey) - y) % bands === 0) ? 0.82 : 1;
        this.set(x, y, sh(col, f * band * (0.97 + hash(x, y, 7) * 0.06)), front);
      }
      for (let y = Math.round(sy - h - ey); y < Math.round(sy - h + ey); y++) this.set(x, y, sh(topc, 1.05 + (y - (sy - h)) / ry * 0.08 - (Math.abs(t) > 0.9 ? 0.1 : 0)), D + (y + 0.5 - (sy - h)) / 8);
    }
    const P = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; P.push([gx, gy, z], [gx, gy, z + h]); }
    this.shadow(P);
    this.dp = D;
  }
  // gable roof, ridge along the building's x axis (slopes face +y and -y, gable ends +x and -x)
  gableX(x, y, w, d, z, rh, roof, gable, o = 0.08) {
    const X0 = x - o, X1 = x + w + o, Y0 = y - o, Y1 = y + d + o, ym = y + d / 2;
    const ax = this.vdir(1, 0)[0] !== 0 ? 'x' : 'y', fa = this.faceIdx(0, 1), fb = this.faceIdx(0, -1);
    this.shadow([[X0, Y0, z], [X1, Y0, z], [X1, Y1, z], [X0, Y1, z], [X0, ym, z + rh], [X1, ym, z + rh]]);
    const tri = (c) => Math.max(0, Math.round(rh * (1 - Math.abs(c / (d * 16) - 0.5) * 2)));
    this.wall(1, x, y, w, d, z, tri, gable); this.wall(3, x, y, w, d, z, tri, gable);
    this.poly([this.p(X0, Y0, z - 1), this.p(X1, Y0, z - 1), this.p(X1, ym, z + rh), this.p(X0, ym, z + rh)], (sx, sy) => roof(sx, sy, fb, ax));
    this.poly([this.p(X0, Y1, z - 1), this.p(X1, Y1, z - 1), this.p(X1, ym, z + rh), this.p(X0, ym, z + rh)], (sx, sy) => roof(sx, sy, fa, ax));
    const a = this.p(X0, ym, z + rh), b = this.p(X1, ym, z + rh);
    this.line(a[0], a[1], b[0], b[1], (sx, sy) => roof(sx, sy, 3, ax), a[2] + 0.05, b[2] + 0.05);
  }
  // gable roof, ridge along the building's y axis (slopes face +x and -x, gable ends +y and -y)
  gableY(x, y, w, d, z, rh, roof, gable, o = 0.08) {
    const X0 = x - o, X1 = x + w + o, Y0 = y - o, Y1 = y + d + o, xm = x + w / 2;
    const ax = this.vdir(0, 1)[0] !== 0 ? 'x' : 'y', fa = this.faceIdx(1, 0), fb = this.faceIdx(-1, 0);
    this.shadow([[X0, Y0, z], [X1, Y0, z], [X1, Y1, z], [X0, Y1, z], [xm, Y0, z + rh], [xm, Y1, z + rh]]);
    const tri = (c) => Math.max(0, Math.round(rh * (1 - Math.abs(c / (w * 16) - 0.5) * 2)));
    this.wall(0, x, y, w, d, z, tri, gable); this.wall(2, x, y, w, d, z, tri, gable);
    this.poly([this.p(X0, Y0, z - 1), this.p(X0, Y1, z - 1), this.p(xm, Y1, z + rh), this.p(xm, Y0, z + rh)], (sx, sy) => roof(sx, sy, fb, ax));
    this.poly([this.p(X1, Y0, z - 1), this.p(X1, Y1, z - 1), this.p(xm, Y1, z + rh), this.p(xm, Y0, z + rh)], (sx, sy) => roof(sx, sy, fa, ax));
    const a = this.p(xm, Y0, z + rh), b = this.p(xm, Y1, z + rh);
    this.line(a[0], a[1], b[0], b[1], (sx, sy) => roof(sx, sy, 3, ax), a[2] + 0.05, b[2] + 0.05);
  }
  // single-pitch roof, high at the -x,-y corner, for scrap lean-tos. wall fills the gap under the raised eaves.
  lean(x, y, w, d, z, hb, roof, wall = null) {
    const pts = [this.p(x - 0.06, y - 0.06, z + hb), this.p(x + w + 0.06, y - 0.06, z + hb * 0.5), this.p(x + w + 0.06, y + d + 0.06, z - 1), this.p(x - 0.06, y + d + 0.06, z + hb * 0.5)];
    this.shadow([[x, y, z + hb], [x + w, y, z + hb * 0.5], [x + w, y + d, z], [x, y + d, z + hb * 0.5]]);
    this.poly(pts, (sx, sy) => roof(sx, sy, 0, 'l'));
    if (wall) {
      const ramp = (a, b, L) => (c) => Math.round(a + ((b - a) * c) / (L * 16));
      this.wall(0, x, y, w, d, z, ramp(hb * 0.5, 0, w), wall); this.wall(1, x, y, w, d, z, ramp(0, hb * 0.5, d), wall);
      this.wall(2, x, y, w, d, z, ramp(hb * 0.5, hb, w), wall); this.wall(3, x, y, w, d, z, ramp(hb, hb * 0.5, d), wall);
    }
  }
  done() {
    const W = this.W, B0 = this.buf, solid = (i) => B0[i] && !this.gnd[i];
    // darken the silhouette edge of everything standing up, so it reads against the ground
    const edge = [];
    for (let y = 1; y < this.H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (solid(i) && (!solid(i + 1) || !solid(i + W) || !solid(i - 1) || !solid(i - W))) edge.push(i);
    }
    for (const i of edge) { const c = B0[i]; B0[i] = pk((c & 255) * 0.78, ((c >> 8) & 255) * 0.78, ((c >> 16) & 255) * 0.78); }
    // cast shadows: onto bare ground as translucent dark, onto the plot's own ground as a darker shade
    for (let i = 0; i < B0.length; i++) {
      if (!this.shm[i]) continue;
      if (!B0[i]) B0[i] = pk(26, 18, 10, 112);
      else if (this.gnd[i]) { const c = B0[i]; B0[i] = pk((c & 255) * 0.66, ((c >> 8) & 255) * 0.64, ((c >> 16) & 255) * 0.62); }
    }
    // crop to content
    let x0 = this.W, y0 = this.H, x1 = -1, y1 = -1;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (B0[y * this.W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, c = canvas(w, h), ctx = c.getContext('2d');
    const id = ctx.createImageData(w, h), out = new Uint32Array(id.data.buffer);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = B0[(y + y0) * this.W + x + x0];
    ctx.putImageData(id, 0, 0);
    return { c, ax: this.ox - x0, ay: this.oy - y0, w, h, smoke: this.smoke.map(([x, y]) => [x - this.ox, y - this.oy]), extra: Object.fromEntries(Object.entries(this.extra).map(([k, [x, y]]) => [k, [x - this.ox, y - this.oy]])) };
  }
}

// ---------- materials ----------
const SCRAP = ['#8a4b2a', '#77726a', '#566e5d', '#5a6a80', '#9b7d47', '#6e3f2b', '#8d8c84', '#7b5a3c'].map(H);
const WOOD = ['#8a6239', '#7c5631', '#966c40', '#6f4c2c'].map(H);
const LOGS = ['#7a5230', '#8f6538', '#5f3f22'].map(H);
const BRICK = [['#9c4a35', '#8c3f2d', '#a8563c'], ['#b48a5c', '#a37b50', '#c29866'], ['#8d8a85', '#7f7c77', '#9a9790']].map((a) => a.map(H));
const SIDING = ['#7fc4c0', '#f0cf6a', '#ef9a83', '#a99ad6', '#9fd38c', '#86b6e8'].map(H);
const TRIM = H('#f3efe4');
const CONC = H('#a9a59c');
const n = (x, y, s, a = 0.08) => 1 - a + hash(x, y, s) * a * 2;

export function matScrap(seed) {
  const cuts = [], cols = [], splits = [];
  let u = -Math.floor(hash(seed, 1) * 5), k = 0;
  while (u < 400) { const w = 4 + Math.floor(hash(seed, k + 9) * 5); cuts.push(u); cols.push(SCRAP[Math.floor(hash(seed, k) * SCRAP.length)]); splits.push(hash(seed, k + 50)); u += w; k++; }
  const panel = (u) => { let i = 0; while (i + 1 < cuts.length && cuts[i + 1] <= u) i++; return i; };
  return {
    wall(u, v, side, len, h) {
      const i = panel(u), up = splits[i] < 0.4 && v > h * 0.55 ? 1 : 0, c = cols[(i + up * 3) % cols.length];
      let f = LIGHT[side] * n(u, v, seed);
      if (u % 2 === 0) f *= 0.88;
      if (u === cuts[i] || (up && Math.abs(v - Math.floor(h * 0.55)) < 1)) f *= 0.7;
      if (hash(u, v >> 2, seed + 3) < 0.07) return sh(SCRAP[0], f * 0.9);
      if (v === h - 1) f *= 1.15;
      return sh(c, f);
    },
    top(u, v, sx, sy) { const i = panel(Math.floor(u + v)); let f = LIGHT[2] * n(sx, sy, seed); if (Math.floor(u) % 2 === 0) f *= 0.9; return sh(cols[i % cols.length], f); },
  };
}
export function matWood(seed, logs = false) {
  return {
    wall(u, v, side, len, h) {
      let f = LIGHT[side] * n(u, v, seed, 0.06);
      if (logs) { const r = v % 3; f *= r === 0 ? 0.72 : r === 1 ? 1.1 : 1; if (u === 0 || u === len - 1) f *= 1.12; return sh(LOGS[Math.floor(v / 3 + hash(seed, v / 3 | 0) * 2) % 3], f); }
      const row = v >> 1, c = WOOD[Math.floor(hash(row, seed, 3) * WOOD.length)];
      if (v % 2 === 0) f *= 0.82;
      if ((u + Math.floor(hash(row, seed) * 13)) % 13 === 0) f *= 0.75;
      return sh(c, f);
    },
    top(u, v, sx, sy) { return sh(WOOD[(Math.floor(u / 2)) % 4], LIGHT[2] * n(sx, sy, seed) * (Math.floor(u) % 2 ? 1 : 0.85)); },
  };
}
export function matBrick(kind = 0, seed = 0) {
  const P = BRICK[kind % BRICK.length];
  return {
    wall(u, v, side) {
      const row = Math.floor(v / 3), f = LIGHT[side];
      if (v % 3 === 2 || (u + (row % 2) * 3) % 6 === 0) return sh([196, 186, 168], f * 0.85);
      return sh(P[Math.floor(hash(Math.floor((u + (row % 2) * 3) / 6), row, seed) * 3)], f * n(u, v, seed, 0.05));
    },
    top(u, v, sx, sy) { return sh([82, 80, 78], LIGHT[2] * n(sx, sy, seed, 0.1)); },
  };
}
export function matConcrete(seed = 0, col = CONC) {
  return {
    wall(u, v, side) { let f = LIGHT[side] * n(u, v, seed, 0.05); if (u % 12 === 0) f *= 0.86; if (hash(u, v >> 3, seed) < 0.05) f *= 0.85; return sh(col, f); },
    top(u, v, sx, sy) { return sh([96, 94, 90], LIGHT[2] * n(sx, sy, seed, 0.12)); },
  };
}
export function matSiding(hue = 0) {
  const c = SIDING[hue % SIDING.length];
  return {
    wall(u, v, side, len) {
      if (u === 0 || u === len - 1 || v === 0) return sh(TRIM, LIGHT[side]);
      return sh(c, LIGHT[side] * (v % 2 === 0 ? 0.86 : 1) * n(u, v, hue, 0.02));
    },
    top(u, v, sx, sy) { return sh([78, 84, 92], LIGHT[2] * n(sx, sy, 3, 0.08)); },
  };
}
export function matMetal(col = '#8e979c', seed = 0) {
  const c = H(col);
  return {
    wall(u, v, side) { let f = LIGHT[side] * n(u, v, seed, 0.03); if (u % 3 === 0) f *= 1.12; if (u % 3 === 2) f *= 0.88; return sh(c, f); },
    top(u, v, sx, sy) { return sh(c, LIGHT[2] * (Math.floor(u) % 3 === 0 ? 1.1 : 0.95)); },
  };
}
export function matGlass(frame = '#d8d6cf') {
  const fr = H(frame), g = H('#8fc7d4'), pl = H('#4f8a3a');
  return {
    wall(u, v, side, len, h) {
      if (u % 6 === 0 || v % 6 === 0 || v === h - 1 || u === len - 1) return sh(fr, LIGHT[side]);
      if (v < 4 && hash(u, v, 9) < 0.5) return sh(pl, LIGHT[side] * n(u, v, 2, 0.2));
      return sh(g, LIGHT[side] * (1 + ((u + v) % 7 === 0 ? 0.15 : 0)));
    },
    top(u, v) { return (Math.floor(u) % 6 === 0 || Math.floor(v) % 6 === 0) ? sh(fr, 1.1) : sh(g, 1.15); },
  };
}
// roofs: fn(sx, sy, face, axis) face 0/1 front slopes, 2 back slope, 3 ridge
function roofRows(sx, sy, axis) { return axis === 'x' ? sy - 0.5 * sx : axis === 'y' ? sy + 0.5 * sx : sx * 0.5 + sy; }
export function roofCorr(seed) {
  return (sx, sy, face, axis) => {
    const f = [0.9, 0.75, 1.1, 1.2][face];
    const r = Math.floor((axis === 'x' ? sx : axis === 'y' ? sx : sx - sy * 2) / 2);
    const c = SCRAP[Math.floor(hash(Math.floor(r / 3), 1, seed) * 6)];
    return sh(c, f * (r % 2 ? 1 : 0.86) * n(sx, sy, seed));
  };
}
export function roofShingle(col = '#6b4a35', seed = 0) {
  const c = H(col);
  return (sx, sy, face, axis) => {
    const f = [0.92, 0.72, 1.12, 1.25][face], rr = Math.floor(roofRows(sx, sy, axis) / 2);
    let k = f * n(sx, sy, seed, 0.06);
    if (Math.floor(roofRows(sx, sy, axis)) % 2 === 0) k *= 0.82;
    if ((sx + (rr % 2) * 2) % 4 === 0) k *= 0.9;
    return sh(c, k);
  };
}
export function roofTar(seed = 0) { return (sx, sy, face) => sh([70, 68, 66], [0.95, 0.78, 1.1, 1.2][face] * n(sx, sy, seed, 0.12)); }
export function roofMetal(col = '#9aa3a8') { const c = H(col); return (sx, sy, face, axis) => sh(c, [0.95, 0.74, 1.1, 1.25][face] * ((axis === 'x' ? sx : sx) % 3 === 0 ? 1.12 : 1)); }

// ---------- facade openings ----------
const WIN = {
  0: { frame: H('#4a3a2a'), glass: H('#221d19'), hi: H('#3a332c'), board: H('#7b5a36') },
  1: { frame: H('#5a4128'), glass: H('#3b4a52'), hi: H('#a7c6d1') },
  2: { frame: H('#d3cfc4'), glass: H('#4d7ea3'), hi: H('#b9dcef') },
  3: { frame: TRIM, glass: H('#5d8fb8'), hi: H('#d4ecfa') },
};
// windows in rows by storey; one door on the +y face
export function facade(m, o) {
  const st = o.storey || 11, ww = o.ww || 3, wh = o.wh || 4, sp = o.sp || 7, style = o.siding ? 3 : o.era;
  const W = WIN[style];
  return (u, v, side, len, h, face = 0) => {
    const door = o.door !== false && face === (o.doorSide || 0);
    if (door) {
      const du = o.doorU != null ? o.doorU : Math.floor(len / 2) - 1, dw = o.dw || 3, dh = o.dh || 6;
      if (u >= du && u < du + dw && v < dh) {
        const edge = u === du || u === du + dw - 1 || v === dh - 1;
        if (style === 0) return sh([58, 50, 44], LIGHT[side] * (edge ? 1.3 : 1));
        if (style === 3) return edge ? sh(TRIM, LIGHT[side]) : sh(SIDING[(o.hue + 3) % 6], LIGHT[side] * 0.8);
        return sh(style === 1 ? [106, 74, 42] : [92, 58, 38], LIGHT[side] * (edge ? 0.75 : 1));
      }
    }
    if (o.nowin) return m(u, v, side, len, h);
    const storeyIdx = Math.floor(v / st), vv = v - storeyIdx * st, wy0 = Math.max(2, Math.floor((st - wh) / 2) + 1);
    if (h - v > 2 && vv >= wy0 && vv < wy0 + wh) {
      const off = Math.floor((len - Math.floor((len - 2) / sp) * sp) / 2);
      const uu = (u - off + sp * 100) % sp;
      const inDoor = door && storeyIdx === 0 && Math.abs(u - (o.doorU != null ? o.doorU : len / 2 - 1)) < sp * 0.7;
      if (uu < ww && u > 1 && u < len - 2 && !inDoor) {
        const fr = uu === 0 || uu === ww - 1 || vv === wy0 || vv === wy0 + wh - 1;
        if (style === 0) {
          if (hash(Math.floor(u / sp), storeyIdx, o.seed || 1) < 0.5) return sh(W.board, LIGHT[side] * ((vv + uu) % 3 === 0 ? 0.7 : 1));
          return sh(W.glass, 1);
        }
        if (fr && ww > 2) return sh(W.frame, LIGHT[side]);
        return sh(uu === 1 && vv === wy0 + 1 ? W.hi : W.glass, LIGHT[side] * 1.05);
      }
    }
    return m(u, v, side, len, h);
  };
}

// ---------- era styling ----------
function wallMat(o, kind = 'house') {
  if (o.siding && kind !== 'industrial') return matSiding(o.hue);
  if (o.era === 0) return matScrap(o.seed);
  if (o.era === 1) return kind === 'industrial' ? matWood(o.seed) : matWood(o.seed, o.hue % 2 === 0);
  if (kind === 'industrial') return o.siding ? matMetal(['#7da0b5', '#c4a35a', '#b56a5a', '#8b86b8', '#7fae7a', '#6f9fcf'][o.hue], o.seed) : matConcrete(o.seed);
  return matBrick(o.hue % 3, o.seed);
}
function roofOf(o) {
  if (o.era === 0) return roofCorr(o.seed);
  if (o.era === 1) return roofShingle(['#6b4a35', '#5c4b3d', '#7a5638'][o.hue % 3], o.seed);
  return o.siding ? roofShingle(['#4b5563', '#5b4a5e', '#3f5a4f', '#6a4e3a'][o.hue % 4], o.seed) : roofShingle(['#3f4146', '#55413a', '#3b4652'][o.hue % 3], o.seed);
}
function eraH(o, a) { return a[Math.min(o.era, a.length - 1)]; }
function chimney(S, x, y, z, h, o) {
  const m = o.era === 0 ? matMetal('#6f6a62') : o.era === 1 ? matBrick(2, o.seed) : matBrick(0, o.seed);
  if (o.era === 0) { S.cyl(x, y, 0.05, z, h, H('#6f6a62'), H('#2a2622')); }
  else S.box(x, y, 0.14, 0.14, z, h, m);
  const [sx, sy] = S.p(x + 0.07, y + 0.07, z + h + 1);
  return [sx, sy];
}
function flag(S, x, y, z, h, col) {
  const [sx, sy] = S.p(x, y, z);
  S.line(sx, sy, sx, sy - h, sh([60, 58, 55], 1));
  const c = H(col);
  for (let k = 0; k < 6; k++) for (let j = 0; j < 4; j++) S.set(sx + 1 + k, sy - h + j + (k >> 2), sh(c, j === 0 ? 1.15 : 1));
}
// a building block: walls with windows, a roof by era
function block(S, o, x, y, w, d, h, opt = {}) {
  const m = opt.mat || wallMat(o, opt.kind);
  const f = facade(m.wall, { era: o.era, siding: o.siding && opt.kind !== 'industrial', hue: o.hue, seed: o.seed, ...opt.f });
  S.walls(x, y, w, d, 0, h, f);
  const roof = opt.roof || (o.era === 0 ? 'lean' : o.era === 1 ? 'gable' : opt.flat ? 'flat' : 'gable');
  const rf = opt.roofFn || roofOf(o);
  if (roof === 'flat') {
    S.top(x, y, w, d, h, (u, v, sx, sy) => (u < 1 || v < 1 || u > w * 16 - 1 || v > d * 16 - 1 ? sh([150, 146, 138], 1.1) : (o.era === 2 && !o.siding ? sh([84, 82, 80], n(sx, sy, o.seed, 0.12)) : m.top(u, v, sx, sy))));
  } else if (roof === 'lean') S.lean(x, y, w, d, h, opt.rh || 5, rf, m.wall);
  else if (roof === 'gable') ((opt.axis || (o.hue % 2 ? 'x' : 'y')) === 'x' ? S.gableX(x, y, w, d, h, opt.rh || Math.round(Math.min(w, d) * 9), rf, f) : S.gableY(x, y, w, d, h, opt.rh || Math.round(Math.min(w, d) * 9), rf, f));
  else if (roof === 'none') S.top(x, y, w, d, h, m.top);
}
function ground(S, x, y, w, d, fn) { S.gm = 1; S.top(x, y, w, d, 0, fn); S.gm = 0; }
const dirtFn = (seed) => (u, v, sx, sy) => sh([112, 92, 64], n(sx, sy, seed, 0.12));
const grassFn = (seed) => (u, v, sx, sy) => sh(hash(sx, sy, seed) < 0.12 ? [92, 140, 60] : [74, 120, 52], n(sx, sy, seed + 1, 0.1));
const gravelFn = (seed) => (u, v, sx, sy) => sh([132, 126, 114], n(sx, sy, seed, 0.15));
const asphaltFn = (seed) => (u, v, sx, sy) => sh([66, 65, 63], n(sx, sy, seed, 0.1));
function fence(S, o, x, y, w, d, gapU = -1) {
  // posts and rails along the two front edges and the two back edges
  const col = o.era === 0 ? H('#6d655b') : o.era === 1 ? H('#8a6a44') : H('#a5a9ab');
  const pts = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = pts[e], [bx, by] = pts[(e + 1) % 4], L = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4;
    for (let k = 0; k <= L; k++) {
      const gx = ax + ((bx - ax) * k) / L, gy = ay + ((by - ay) * k) / L;
      if (gapU >= 0 && e === 2 && Math.abs(k - L / 2) < 2) continue;
      const [sx, sy] = S.p(gx, gy, 0);
      const ph = o.era === 0 ? 3 + (hash(k, e, o.seed) * 3 | 0) : 4;
      if (k % 2 === 0) for (let j = 0; j < ph; j++) S.set(sx, sy - j, sh(col, 0.85));
      S.set(sx, sy - (o.era === 2 ? 3 : 2), sh(col, 1.1));
      if (o.era > 0) S.set(sx, sy - 4, sh(col, 1.05));
    }
  }
}
function crops(S, x, y, w, d, seed, kind = 0) {
  ground(S, x, y, w, d, (u, v, sx, sy) => {
    const row = Math.floor(v / 3) % 2 === 0;
    const plant = row && hash(Math.floor(u / 2), Math.floor(v / 3), seed + kind) < 0.75;
    if (plant) return sh(kind ? [154, 150, 62] : [86, 128, 52], n(sx, sy, seed, 0.15) * (Math.floor(u) % 2 ? 1 : 0.85));
    return sh(Math.floor(v) % 3 === 2 ? [92, 72, 48] : [118, 94, 64], n(sx, sy, seed, 0.1));
  });
  // little plants standing up
  for (let gv = 0.5; gv < d * 16; gv += 6) for (let gu = 1; gu < w * 16; gu += 2) {
    if (hash(gu, gv, seed) < 0.55) continue;
    const [sx, sy] = S.p(x + gu / 16, y + gv / 16, 0);
    S.set(sx, sy - 1, sh(kind ? [176, 168, 70] : [104, 150, 60], 1)); S.set(sx, sy - 2, sh(kind ? [196, 184, 82] : [124, 170, 70], 1));
  }
}
function tree(S, gx, gy, s, seed, alive = true) {
  const [sx, sy] = S.p(gx, gy, 0);
  const trunk = H('#5b4330'), h = Math.round(4 + s * 6);
  if (alive) { const r0 = (2 + s * 3) / 22; S.shadow([[gx, gy, 0], [gx - r0, gy, h + 2], [gx + r0, gy, h + 2], [gx, gy - r0, h + 2 + r0 * 30], [gx, gy + r0, h + 2], [gx, gy, h + (2 + s * 3) * 2]]); }
  for (let j = 0; j < h; j++) S.set(sx, sy - j, sh(trunk, 1));
  if (!alive) return;
  const r = 2 + s * 3;
  for (let yy = -r; yy <= r; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) {
    if ((xx * xx) / ((r + 1) * (r + 1)) + (yy * yy) / (r * r) > 1) continue;
    const f = 1.15 - ((xx + yy) / (r * 2)) * 0.35;
    S.set(sx + xx, sy - h - r + yy + 1, sh(hash(xx, yy, seed) < 0.2 ? [96, 150, 66] : [62, 112, 48], f));
  }
}
function people(S, gx, gy, n2, seed) {
  for (let k = 0; k < n2; k++) {
    const [sx, sy] = S.p(gx + hash(k, 1, seed) * 0.6, gy + hash(k, 2, seed) * 0.6, 0);
    S.set(sx, sy - 1, sh([70, 60, 50], 1)); S.set(sx, sy - 2, sh(SCRAP[k % 8], 1.2)); S.set(sx, sy - 3, sh([222, 180, 140], 1));
  }
}
function panelRow(S, x, y, w, d, z, tilt) {
  // solar panel strip: a tilted dark blue plane with cell lines
  const pts = [S.p(x, y, z + tilt), S.p(x + w, y, z + tilt), S.p(x + w, y + d, z), S.p(x, y + d, z)];
  S.poly(pts, (sx, sy) => sh((sx % 3 === 0 || sy % 3 === 0) ? [118, 140, 170] : [40, 62, 108], 1 + (hash(sx, sy, 2) < 0.05 ? 0.4 : 0)));
  const [a, b] = [S.p(x + w * 0.5, y + d, 0), S.p(x + w * 0.5, y + d, z)];
  S.line(a[0], a[1], b[0], b[1], sh([120, 120, 120], 1));
}
function awning(S, x, y, w, z, cols) {
  // a striped awning sloping out over the +y face
  const pts = [S.p(x, y, z), S.p(x + w, y, z), S.p(x + w, y + 0.25, z - 4), S.p(x, y + 0.25, z - 4)];
  const A = cols.map(H);
  S.poly(pts, (sx) => sh(A[Math.floor((sx + 400) / 3) % A.length], 1));
}

// ---------- building recipes: draw(S, o) ----------
const R = {};
R.outpost = (S, o) => {
  if (o.era === 0) {
    ground(S, 0, 0, 2, 2, dirtFn(o.seed));
    // a scrap palisade, a shack, a lookout and a flag
    const pal = matScrap(o.seed + 5);
    S.wall(0, 0.05, 0.05, 1.9, 1.9, 0, (c) => (c > 13 && c < 19 ? 0 : 5 + (hash(c >> 1, 1, o.seed) * 3 | 0)), pal.wall);
    for (const f of [1, 2, 3]) S.wall(f, 0.05, 0.05, 1.9, 1.9, 0, (c) => 5 + (hash(c >> 1, f + 1, o.seed) * 3 | 0), pal.wall);
    block(S, o, 0.35, 0.3, 1.05, 0.9, 13, { rh: 6, f: { doorU: 6 } });
    S.cyl(1.55, 0.45, 0.16, 0, 9, H('#5f7a8a'), H('#4a6575'), 3);
    tree(S, 1.6, 1.6, 0, o.seed, false);
    flag(S, 0.35, 0.3, 19, 12, '#d8c26a');
  } else if (o.era === 1) {
    ground(S, 0, 0, 2, 2, gravelFn(o.seed));
    block(S, o, 0.2, 0.25, 1.5, 1.2, 16, { axis: 'x', rh: 11, mat: matWood(o.seed, true), f: { sp: 8 } });
    S.box(0.2, 1.45, 1.5, 0.3, 0, 2, matWood(o.seed));
    const [cx, cy] = chimney(S, 1.4, 0.4, 20, 8, o); S.smoke.push([cx, cy]);
    flag(S, 1.85, 1.85, 0, 22, '#d8c26a');
  } else {
    ground(S, 0, 0, 2, 2, (u, v, sx, sy) => sh([164, 158, 146], n(sx, sy, o.seed, 0.05) * ((Math.floor(u / 4) + Math.floor(v / 4)) % 2 ? 1 : 0.94)));
    block(S, o, 0.2, 0.2, 1.6, 1.4, 24, { flat: true, roof: o.siding ? 'gable' : 'flat', axis: 'x', rh: 10, f: { sp: 6, storey: 12, dw: 4, dh: 8 } });
    // clock tower
    block(S, o, 0.75, 0.55, 0.5, 0.5, 38, { roof: 'gable', axis: 'y', rh: 8, f: { door: false, sp: 5, ww: 2 } });
    flag(S, 1.85, 1.85, 0, 26, '#d8c26a');
  }
};
R.home = (S, o) => {
  const h = eraH(o, [9, 11, 19]);
  ground(S, 0, 0, 1, 1, o.era === 2 ? grassFn(o.seed) : dirtFn(o.seed));
  if (o.era === 0 && !o.siding) {
    block(S, o, 0.18, 0.2, 0.62, 0.6, h, { roof: 'lean', rh: 5, f: { sp: 6, doorU: 3 } });
    const [a, b] = S.p(0.75, 0.75, 0); for (let j = 0; j < 3; j++) S.set(a, b - j, sh([40, 38, 36], 1));
  } else {
    block(S, o, 0.18, 0.2, 0.64, 0.6, h, { rh: 7, f: { sp: 6, storey: o.era === 2 ? 9 : 11, wh: 3 } });
    const [cx, cy] = chimney(S, 0.25, 0.45, h + 2, 5, o); if (o.era < 2) S.smoke.push([cx, cy]);
    if (o.era === 2) tree(S, 0.9, 0.9, 0.3, o.seed);
  }
};
R.tenement = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => sh([150, 146, 138], n(sx, sy, o.seed, 0.05)));
  block(S, o, 0.15, 0.15, 1.7, 1.7, 44, { roof: 'flat', f: { sp: 6, storey: 11, dw: 4 } });
  S.cyl(1.2, 0.6, 0.18, 44, 9, H('#7a6a55'), H('#5a4a3a'), 2);
  S.box(0.4, 0.4, 0.3, 0.3, 44, 4, matConcrete(o.seed));
};
R.farm = (S, o) => {
  crops(S, 0, 0, 3, 3, o.seed, o.hue % 3 === 0 ? 1 : 0);
  fence(S, o, 0.02, 0.02, 2.96, 2.96, 1);
  block(S, o, 0.15, 0.15, 0.75, 0.6, 10, { rh: 6, kind: 'industrial', f: { dw: 4, door: true, sp: 9 } });
  if (o.era === 0) { // scarecrow
    const [sx, sy] = S.p(1.9, 1.6, 0);
    for (let j = 0; j < 8; j++) S.set(sx, sy - j, sh([90, 70, 46], 1));
    for (let k = -2; k <= 2; k++) S.set(sx + k, sy - 6, sh([110, 82, 52], 1));
    S.set(sx, sy - 8, sh([200, 170, 90], 1)); S.set(sx, sy - 9, sh([200, 170, 90], 1));
  } else if (o.era === 1) S.cyl(2.65, 0.4, 0.14, 0, 12, H('#7a5a3a'), H('#5a4028'), 3);
  else S.cyl(2.6, 0.4, 0.18, 0, 18, H('#b8bcbe'), H('#9aa0a4'), 4);
};
R.greenhouse = (S, o) => {
  ground(S, 0, 0, 2, 2, gravelFn(o.seed));
  const g = matGlass(o.era === 1 ? '#8a6a44' : o.siding ? '#f3efe4' : '#d8d6cf');
  S.walls(0.15, 0.15, 1.7, 1.7, 0, 12, g.wall);
  S.gableX(0.15, 0.15, 1.7, 1.7, 12, 10, (sx, sy, face) => ((sx % 6 === 0) ? sh([210, 208, 200], 1) : sh([150, 205, 214], [1, 0.85, 1.1, 1.2][face] + (hash(sx, sy, 4) < 0.15 ? 0.15 : 0))), g.wall, 0.04);
};
R.factoryfarm = (S, o) => {
  crops(S, 0, 1.2, 3, 1.8, o.seed, 1);
  ground(S, 0, 0, 3, 1.2, gravelFn(o.seed));
  block(S, o, 0.1, 0.1, 1.6, 1.0, 16, { kind: 'industrial', roof: 'gable', axis: 'x', rh: 9, roofFn: roofMetal(o.siding ? '#c0584a' : '#9a3b30'), mat: matMetal(o.siding ? '#c74f43' : '#a8433a', o.seed), f: { dw: 5, dh: 9, sp: 10 } });
  S.cyl(2.15, 0.35, 0.22, 0, 30, H('#c7cbcd'), H('#9aa0a4'), 4);
  S.cyl(2.7, 0.55, 0.22, 0, 26, H('#c7cbcd'), H('#9aa0a4'), 4);
  // tractor
  S.box(1.9, 2.0, 0.3, 0.18, 0, 4, matMetal('#4f8a3a'));
  S.box(2.05, 2.02, 0.12, 0.14, 4, 3, matMetal('#4f8a3a'));
};
R.chickens = (S, o) => {
  ground(S, 0, 0, 3, 2, gravelFn(o.seed));
  for (const y0 of [0.15, 1.05]) {
    block(S, o, 0.1, y0, 2.5, 0.75, 8, { kind: 'industrial', roof: 'gable', axis: 'x', rh: 5, roofFn: roofMetal('#b3b8ba'), mat: matMetal(o.siding ? ['#e6d7a8', '#cfe3d8', '#e8c4b8'][o.hue % 3] : '#d8d2c0', o.seed), f: { sp: 5, ww: 2, wh: 2, door: false } });
  }
  S.cyl(2.8, 0.3, 0.13, 0, 18, H('#c7cbcd'), H('#9aa0a4'), 3);
  S.cyl(2.8, 1.2, 0.13, 0, 18, H('#c7cbcd'), H('#9aa0a4'), 3);
};
R.cattle = (S, o) => {
  ground(S, 0, 0, 3, 3, dirtFn(o.seed));
  block(S, o, 0.1, 0.1, 2.3, 1.2, 14, { kind: 'industrial', roof: 'gable', axis: 'x', rh: 8, roofFn: roofMetal('#8e979c'), mat: matMetal(o.siding ? '#c79a52' : '#8a8f86', o.seed), f: { sp: 6, ww: 3, wh: 2, dw: 5, dh: 8 } });
  fence(S, { era: 2, seed: o.seed }, 0.2, 1.55, 2.6, 1.3);
  for (let k = 0; k < 9; k++) { // cows
    const [sx, sy] = S.p(0.4 + hash(k, 1, o.seed) * 2.2, 1.7 + hash(k, 2, o.seed) * 1.0, 0);
    const c = k % 3 ? [235, 230, 220] : [70, 50, 40];
    S.set(sx, sy - 1, sh(c, 1)); S.set(sx + 1, sy - 1, sh(c, 0.9)); S.set(sx, sy - 2, sh(c, 1.1)); S.set(sx + 1, sy - 2, sh([40, 30, 25], 1)); S.set(sx + 2, sy - 2, sh(c, 1));
  }
  S.cyl(2.7, 0.4, 0.18, 0, 26, H('#c7cbcd'), H('#9aa0a4'), 4);
};
R.salvage = (S, o) => {
  ground(S, 0, 0, 2, 2, dirtFn(o.seed));
  fence(S, o, 0.03, 0.03, 1.94, 1.94, 1);
  for (let k = 0; k < 6; k++) {
    const x = 0.3 + hash(k, 3, o.seed) * 1.2, y = 0.9 + hash(k, 4, o.seed) * 0.8, w = 0.2 + hash(k, 5, o.seed) * 0.2;
    S.box(x, y, w, w * 0.8, 0, 2 + hash(k, 6, o.seed) * 4, matScrap(o.seed + k));
  }
  block(S, o, 0.2, 0.15, 0.7, 0.55, 10, { kind: 'industrial', rh: 5, f: { sp: 8 } });
  // crane
  const [a0, a1] = S.p(1.6, 0.4, 0), [b0, b1] = S.p(1.6, 0.4, 26), [c0, c1] = S.p(1.0, 1.1, 26);
  const yel = sh([206, 166, 52], 1);
  S.line(a0, a1, b0, b1, yel); S.line(a0 + 1, a1, b0 + 1, b1, sh([170, 136, 40], 1)); S.line(b0, b1, c0, c1, yel);
  S.line(c0, c1, c0, c1 + 10, sh([40, 40, 40], 1));
  for (let k = -1; k <= 1; k++) S.set(c0 + k, c1 + 11, sh([90, 90, 90], 1));
};
R.tinker = (S, o) => {
  ground(S, 0, 0, 1, 1, dirtFn(o.seed));
  block(S, o, 0.2, 0.2, 0.6, 0.55, 10, { rh: 6, f: { sp: 6, doorU: 2 } });
  const [sx, sy] = S.p(0.35, 0.35, o.era === 0 ? 15 : 17);
  S.line(sx, sy, sx, sy - 9, sh([150, 150, 150], 1)); S.set(sx - 1, sy - 7, sh([150, 150, 150], 1)); S.set(sx + 1, sy - 5, sh([150, 150, 150], 1));
  S.set(sx, sy - 10, sh([230, 80, 60], 1));
  const [cx, cy] = chimney(S, 0.65, 0.3, 12, 4, o); S.smoke.push([cx, cy]);
};
R.guard = (S, o) => {
  ground(S, 0, 0, 1, 1, dirtFn(o.seed));
  const legC = o.era === 0 ? H('#6d655b') : o.era === 1 ? H('#7a5a38') : H('#9a9a96');
  const hgt = eraH(o, [20, 22, 24]);
  if (o.era === 2) S.box(0.3, 0.3, 0.4, 0.4, 0, hgt, matConcrete(o.seed));
  else for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]) {
    const [a, b] = S.p(x, y, 0), [c, d] = S.p(0.5 + (x - 0.5) * 0.8, 0.5 + (y - 0.5) * 0.8, hgt);
    S.line(a, b, c, d, sh(legC, x + y > 1 ? 0.8 : 1));
  }
  if (o.era < 2) { const [a, b] = S.p(0.25, 0.75, 6), [c, d] = S.p(0.75, 0.75, 14); S.line(a, b, c, d, sh(legC, 0.9)); }
  S.box(0.22, 0.22, 0.56, 0.56, hgt, 6, o.siding ? matSiding(o.hue) : wallMat(o));
  S.box(0.22, 0.22, 0.56, 0.56, hgt + 6, 0, { wall: () => 0 });
  if (o.era === 0) S.lean(0.18, 0.18, 0.64, 0.64, hgt + 7, 3, roofCorr(o.seed));
  else S.gableY(0.2, 0.2, 0.6, 0.6, hgt + 7, 5, roofOf(o), wallMat(o).wall, 0.04);
  // the opening where the lookout stands
  for (let k = 0; k < 6; k++) { const [sx, sy] = S.p(0.32 + k * 0.06, 0.78, hgt + 3); S.set(sx, sy, sh([30, 26, 22], 1)); S.set(sx, sy - 1, sh([30, 26, 22], 1)); }
  if (o.era === 2) { const [sx, sy] = S.p(0.8, 0.8, hgt + 5); S.set(sx + 1, sy, sh([255, 240, 170], 1)); S.set(sx + 2, sy, sh([255, 240, 170], 1)); }
};
R.lumber = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => sh(hash(sx, sy, 3) < 0.15 ? [150, 120, 80] : [118, 96, 66], n(sx, sy, o.seed, 0.1)));
  block(S, o, 0.15, 0.15, 0.8, 0.6, 10, { kind: 'industrial', rh: 6, f: { sp: 8 } });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) { // log pile, ends toward the viewer
    const [sx, sy] = S.p(1.1 + k * 0.17 + r * 0.08, 1.75, 2 + r * 4);
    for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 4) S.set(sx + xx, sy + yy, sh(xx * xx + yy * yy <= 1 ? [196, 160, 110] : [110, 78, 46], 1));
  }
  const [a, b] = S.p(1.5, 0.4, 0);
  S.line(a - 4, b, a + 4, b - 4, sh([90, 70, 50], 1));
  const [cx, cy] = chimney(S, 0.3, 0.3, 14, 3, o); S.smoke.push([cx, cy]);
};
R.quarry = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => {
    const d = Math.max(Math.abs(u - 16), Math.abs(v - 18));
    const step = d < 7 ? 0.62 : d < 11 ? 0.78 : 0.92;
    return sh([150, 144, 134], step * n(sx, sy, o.seed, 0.12));
  });
  for (let k = 0; k < 4; k++) S.box(0.15 + k * 0.22, 1.7, 0.18, 0.18, 0, 3, matConcrete(o.seed + k, H('#b8b2a6')));
  block(S, o, 1.3, 0.1, 0.6, 0.5, 9, { kind: 'industrial', rh: 5, f: { sp: 8 } });
  const [a0, a1] = S.p(0.3, 0.3, 0), [b0, b1] = S.p(0.3, 0.3, 22), [c0, c1] = S.p(1.0, 1.0, 22);
  S.line(a0, a1, b0, b1, sh([206, 166, 52], 1)); S.line(b0, b1, c0, c1, sh([206, 166, 52], 1)); S.line(c0, c1, c0, c1 + 14, sh([50, 50, 50], 1));
};
R.smelter = (S, o) => {
  ground(S, 0, 0, 2, 2, gravelFn(o.seed));
  block(S, o, 0.15, 0.2, 1.3, 1.3, 16, { kind: 'industrial', roof: o.era === 0 ? 'lean' : 'gable', axis: 'x', rh: 7, f: { sp: 9, dw: 4, dh: 7 } });
  // furnace glow in the door
  for (let k = 0; k < 3; k++) { const [sx, sy] = S.p(0.7 + k * 0.06, 1.5, 2); S.set(sx, sy, sh([255, 150, 40], 1)); S.set(sx, sy - 1, sh([255, 200, 80], 1)); }
  if (o.era === 0) S.cyl(1.65, 0.5, 0.12, 0, 30, H('#6f6a62'), H('#2a2622'), 4);
  else S.cyl(1.65, 0.5, 0.14, 0, 34, o.era === 2 ? H('#9c4a35') : H('#77726a'), H('#2a2622'), 3);
  S.smoke.push(S.p(1.65, 0.5, 35));
};
R.glassworks = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => sh([178, 160, 120], n(sx, sy, o.seed, 0.1)));
  block(S, o, 0.15, 0.15, 1.1, 1.0, 13, { kind: 'industrial', rh: 7, f: { sp: 7 } });
  S.cyl(1.45, 1.35, 0.3, 0, 8, H('#b07050'), H('#8a5038'), 0);
  S.cyl(1.45, 1.35, 0.2, 8, 4, H('#b07050'), H('#3a2a20'), 0);
  for (let k = 0; k < 3; k++) { const [sx, sy] = S.p(1.45, 1.62, 3); S.set(sx - 1 + k, sy, sh([255, 170, 60], 1)); }
  S.cyl(0.4, 0.4, 0.1, 13, 14, H('#7a7570'), H('#2a2622'), 3);
  S.smoke.push(S.p(0.4, 0.4, 28)); S.smoke.push(S.p(1.45, 1.35, 13));
};
R.refinery = (S, o) => {
  ground(S, 0, 0, 3, 3, asphaltFn(o.seed));
  const tc = o.siding ? H('#e8e2d0') : H('#c9c5bc');
  S.cyl(0.6, 0.6, 0.38, 0, 16, tc, H('#a8a49c'), 4);
  S.cyl(1.55, 0.55, 0.38, 0, 16, tc, H('#a8a49c'), 4);
  S.cyl(0.6, 1.55, 0.38, 0, 16, tc, H('#a8a49c'), 4);
  block(S, o, 1.8, 1.8, 1.0, 1.0, 12, { kind: 'industrial', roof: 'flat', f: { sp: 7 } });
  S.cyl(2.5, 0.6, 0.14, 0, 40, H('#b8bcbe'), H('#808488'), 5);
  S.cyl(1.4, 1.5, 0.08, 0, 30, H('#8a8e90'), H('#505050'), 0);
  const [a, b] = S.p(0.6, 0.6, 12), [c, d] = S.p(2.5, 0.6, 12); S.line(a, b, c, d, sh([150, 150, 150], 1));
  const [e, f] = S.p(0.6, 1.55, 10), [g, h] = S.p(1.8, 1.8, 10); S.line(e, f, g, h, sh([150, 150, 150], 1));
  const [fx, fy] = S.p(1.4, 1.5, 32); S.set(fx, fy, sh([255, 180, 60], 1)); S.set(fx, fy - 1, sh([255, 230, 120], 1));
  S.smoke.push([fx, fy - 2]);
};
R.generator = (S, o) => {
  ground(S, 0, 0, 1, 1, gravelFn(o.seed));
  block(S, o, 0.15, 0.2, 0.6, 0.55, 10, { kind: 'industrial', roof: 'flat', f: { sp: 6, doorU: 2 } });
  S.cyl(0.75, 0.35, 0.07, 0, 22, H('#6f6a62'), H('#2a2622'), 3);
  S.smoke.push(S.p(0.75, 0.35, 23));
  const [a, b] = S.p(0.9, 0.9, 0), [c, d] = S.p(0.9, 0.9, 16); S.line(a, b, c, d, sh([110, 90, 60], 1));
  S.line(c - 3, d + 1, c + 3, d - 1, sh([110, 90, 60], 1));
};
R.windmill = (S, o) => {
  ground(S, 0, 0, 1, 1, grassFn(o.seed));
  const [a, b] = S.p(0.5, 0.5, 0), [c, d] = S.p(0.5, 0.5, 40);
  const col = o.siding ? [246, 246, 240] : o.era === 2 ? [226, 228, 224] : [170, 170, 165];
  for (let y = d; y <= b; y++) { const w = Math.round(((y - d) / (b - d)) * 1.5); for (let k = -w; k <= w; k++) S.set(a + k, y, sh(col, k > 0 ? 0.8 : 1)); }
  S.box(0.42, 0.42, 0.16, 0.24, 40, 4, matMetal('#d8dad6'));
  S.extra.hub = S.p(0.5, 0.68, 43);
};
R.solar = (S, o) => {
  ground(S, 0, 0, 2, 2, gravelFn(o.seed));
  for (let r = 0; r < 4; r++) panelRow(S, 0.15, 0.15 + r * 0.45, 1.7, 0.3, 4, 6);
};
R.park = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => {
    const path = Math.abs(u - v) < 2.2 || Math.abs(u + v - 32) < 2.2;
    if (path) return sh(o.era === 2 ? [190, 182, 166] : [150, 128, 96], n(sx, sy, o.seed, 0.08));
    return grassFn(o.seed)(u, v, sx, sy);
  });
  if (o.era === 2) { S.cyl(1, 1, 0.22, 0, 3, H('#b0aca2'), H('#5f9fc4'), 0); S.cyl(1, 1, 0.05, 3, 4, H('#b0aca2'), H('#cfe8f4'), 0); }
  else S.cyl(1, 1, 0.16, 0, 2, H('#7a7068'), H('#4f7f9a'), 0);
  for (const [x, y, s] of [[0.35, 0.8, 0.8], [0.8, 0.3, 0.6], [1.7, 1.1, 0.9], [1.2, 1.7, 0.7], [0.3, 1.6, 0.5], [1.65, 0.35, 0.5]]) tree(S, x, y, s, o.seed + x * 9);
  const [bx, by] = S.p(1.35, 0.55, 0); for (let k = 0; k < 4; k++) { S.set(bx + k, by - 2 + (k >> 1), sh([120, 86, 52], 1)); S.set(bx + k, by - 3 + (k >> 1), sh([150, 108, 66], 1)); }
};
R.school = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => (u > 20 && v > 18 ? sh([150, 140, 120], n(sx, sy, 1, 0.1)) : grassFn(o.seed)(u, v, sx, sy)));
  block(S, o, 0.15, 0.15, 1.5, 1.0, o.era === 2 ? 20 : 13, { axis: 'x', rh: 9, f: { sp: 6, storey: 10 } });
  // bell tower over the door
  block(S, o, 0.75, 0.9, 0.3, 0.3, o.era === 2 ? 30 : 22, { roof: 'gable', axis: 'y', rh: 6, f: { door: false, ww: 2, sp: 4 } });
  const [sx, sy] = S.p(1.7, 1.7, 0); // swing set
  S.line(sx - 4, sy, sx - 2, sy - 7, sh([180, 60, 50], 1)); S.line(sx + 4, sy - 2, sx + 2, sy - 8, sh([180, 60, 50], 1)); S.line(sx - 2, sy - 7, sx + 2, sy - 8, sh([180, 60, 50], 1));
  flag(S, 0.1, 1.9, 0, 18, '#d8c26a');
};
R.clinic = (S, o) => {
  ground(S, 0, 0, 2, 2, gravelFn(o.seed));
  const m = o.siding ? matSiding(o.hue) : o.era === 0 ? matScrap(o.seed) : o.era === 1 ? matWood(o.seed) : matConcrete(o.seed, H('#dcd8cf'));
  block(S, o, 0.2, 0.2, 1.5, 1.3, o.era === 2 ? 18 : 12, { mat: m, roof: o.era === 2 ? 'flat' : undefined, axis: 'x', rh: 8, f: { sp: 6, dw: 4 } });
  // red cross sign on the +y face
  const [sx, sy] = S.p(1.3, 1.5, o.era === 2 ? 12 : 8);
  for (let k = -2; k <= 2; k++) { S.set(sx + k, sy + (k >> 1), sh([210, 40, 40], 1)); S.set(sx, sy + k, sh([210, 40, 40], 1)); }
};
R.newspaper = (S, o) => {
  ground(S, 0, 0, 2, 2, gravelFn(o.seed));
  block(S, o, 0.15, 0.15, 1.6, 1.2, o.era === 2 ? 20 : 14, { axis: 'x', roof: o.era === 2 ? 'flat' : undefined, rh: 8, f: { sp: 5, storey: 10, dw: 4 } });
  // sign board on the roof
  const z = o.era === 2 ? 20 : 20;
  const [a, b] = S.p(0.45, 0.9, z);
  for (let k = 0; k < 22; k++) for (let j = 0; j < 6; j++) {
    const edge = j === 0 || j === 5 || k === 0 || k === 21;
    const letter = !edge && j > 1 && j < 4 && hash(k, j, 77) < 0.6 && k % 4 !== 0;
    S.set(a + k, b + (k >> 1) - j, edge ? sh([60, 50, 40], 1) : letter ? sh([30, 30, 30], 1) : sh([236, 230, 210], 1));
  }
  for (let k = 0; k < 3; k++) S.box(1.55, 1.5 + k * 0.12, 0.2, 0.1, 0, 2, { wall: (u, v, s) => sh([230, 225, 210], LIGHT[s]), top: () => sh([240, 236, 224], 1) });
  S.cyl(0.4, 0.35, 0.07, o.era === 2 ? 20 : 14, 8, H('#6f6a62'), H('#2a2622'), 0);
  S.smoke.push(S.p(0.4, 0.35, (o.era === 2 ? 20 : 14) + 9));
};
R.stall = (S, o) => {
  ground(S, 0, 0, 1, 1, dirtFn(o.seed));
  block(S, o, 0.2, 0.15, 0.6, 0.45, 9, { rh: 5, f: { door: false, sp: 5 } });
  awning(S, 0.18, 0.6, 0.64, 9, o.siding ? ['#ef9a83', '#f3efe4'] : o.era === 0 ? ['#8a4b2a', '#77726a'] : ['#c0392b', '#e8dcc0']);
  for (let k = 0; k < 3; k++) S.box(0.25 + k * 0.17, 0.7, 0.13, 0.13, 0, 3, matWood(o.seed + k));
};
R.store = (S, o) => {
  ground(S, 0, 0, 2, 2, (u, v, sx, sy) => sh([150, 146, 138], n(sx, sy, o.seed, 0.06)));
  block(S, o, 0.15, 0.15, 1.6, 1.3, o.era === 2 ? 16 : 13, { axis: 'y', roof: o.era === 2 ? 'flat' : undefined, rh: 7, f: { sp: 5, ww: 4, wh: 5, dw: 4, dh: 7 } });
  awning(S, 0.15, 1.45, 1.6, o.era === 2 ? 10 : 9, o.siding ? ['#86b6e8', '#f3efe4'] : ['#3c7a4a', '#e8dcc0']);
  for (let k = 0; k < 3; k++) S.box(0.3 + k * 0.4, 1.75, 0.18, 0.15, 0, 3, matWood(o.seed + k));
};
R.mall = (S, o) => {
  ground(S, 0, 0, 3, 2, (u, v, sx, sy) => (v > 22 && Math.floor(u) % 8 === 0 ? sh([220, 220, 210], 1) : asphaltFn(o.seed)(u, v, sx, sy)));
  const cols = ['#7fc4c0', '#f0cf6a', '#ef9a83', '#a99ad6', '#9fd38c', '#86b6e8'];
  block(S, o, 0.1, 0.1, 2.8, 1.1, 15, { roof: 'flat', f: { sp: 7, ww: 5, wh: 6, door: false } });
  for (let k = 0; k < 6; k++) awning(S, 0.15 + k * 0.46, 1.2, 0.42, 10, [cols[k], '#f3efe4']);
  for (let k = 0; k < 4; k++) { const [sx, sy] = S.p(0.5 + k * 0.6, 1.75, 0); const c = H(cols[(k * 2 + o.hue) % 6]); for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) S.set(sx + x, sy - y - (x >> 1), sh(c, y ? 1.1 : 0.85)); }
};
R.barracks = (S, o) => {
  ground(S, 0, 0, 2, 2, dirtFn(o.seed));
  block(S, o, 0.15, 0.2, 1.65, 0.95, 12, { axis: 'x', roof: o.era === 2 ? 'flat' : undefined, rh: 6, kind: o.era === 2 ? 'house' : 'house', f: { sp: 5, ww: 2, wh: 3 } });
  for (let k = 0; k < 7; k++) S.box(0.2 + k * 0.22, 1.5, 0.18, 0.14, 0, 3, { wall: (u, v, s) => sh([150, 136, 100], LIGHT[s] * (v === 1 ? 0.8 : 1)), top: () => sh([170, 156, 116], 1) });
  flag(S, 1.85, 1.85, 0, 20, '#5a7a4a');
};
// ---------- MSV ----------
export const MSV_SIZE = [1.4, 0.6];
const msvCache = {};
export function msvSprite(rot) {
  if (msvCache[rot]) return msvCache[rot];
  const [w, d] = MSV_SIZE, S = new Spr(w, d, 30, 3, rot);
  const body = { wall: (u, v, s2) => sh(v === 6 || v === 7 ? [216, 120, 50] : (u % 9 === 4 && v > 9 && v < 13) ? [70, 110, 140] : [176, 168, 128], LIGHT[s2] * n(u, v, 3, 0.03)), top: (u, v, sx, sy) => sh([164, 158, 124], 1.1 * n(sx, sy, 2, 0.04)) };
  S.box(0.02, 0.02, w - 0.04, d - 0.04, 3, 15, body);
  for (const y of [0, d - 0.05]) for (const x of [0.2, 0.65, 1.1]) S.box(x, y, 0.2, 0.05, 0, 5, { wall: (u, v, s2) => sh([34, 32, 30], LIGHT[s2] * (v === 2 ? 1.8 : 1)), top: () => sh([44, 42, 40], 1) });
  // cab windows at the front, a folded tower and a mast on the roof
  S.box(w - 0.3, 0.06, 0.26, d - 0.12, 18, 4, { wall: (u, v, s2) => sh([80, 120, 150], LIGHT[s2]), top: () => sh([150, 146, 118], 1.1) });
  S.box(0.3, 0.15, 0.3, 0.3, 18, 6, matMetal('#8e979c'));
  const m0 = S.p(0.15, 0.3, 18), m1 = S.p(0.15, 0.3, 26);
  S.line(m0[0], m0[1], m1[0], m1[1], sh([200, 200, 200], 1), m0[2], m1[2]);
  S.set(m1[0], m1[1] - 1, sh([255, 80, 60], 1), m1[2]);
  msvCache[rot] = S.done();
  return msvCache[rot];
}

// ---------- debris ----------
const RUIN_C = [H('#8f8b82'), H('#9a7c66'), H('#7d7a74')];
export function featureSprite(f, fv, rot = 0) {
  const s = fv * 13 + 7;
  if (f === F.TREE) {
    const S = new Spr(1, 1, 30, 2, rot);
    const [sx, sy] = S.p(0.5 + (hash(s, 1) - 0.5) * 0.4, 0.5 + (hash(s, 2) - 0.5) * 0.4, 0);
    const hgt = 10 + (hash(s, 3) * 10 | 0), col = [H('#4a3b2e'), H('#5c4a3a'), H('#3b3029')][fv % 3];
    { const gx = 0.5 + (hash(s, 1) - 0.5) * 0.4, gy = 0.5 + (hash(s, 2) - 0.5) * 0.4; S.shadow([[gx, gy, 0], [gx + 0.04, gy, 0], [gx, gy, hgt], [gx + 0.04, gy, hgt]]); }
    for (let j = 0; j < hgt; j++) { S.set(sx, sy - j, sh(col, 1)); if (j < 4) S.set(sx + 1, sy - j, sh(col, 0.8)); }
    const nb = 3 + (hash(s, 4) * 3 | 0);
    for (let k = 0; k < nb; k++) {
      const by = sy - hgt * (0.4 + hash(s, k + 10) * 0.6), dir = k % 2 ? 1 : -1, L = 3 + hash(s, k + 20) * 5;
      S.line(sx, by, sx + dir * L, by - L * (0.5 + hash(s, k + 30) * 0.6), sh(col, 1.05));
    }
    return S.done();
  }
  if (f === F.RUIN) {
    const hgt = 9 + Math.round((fv / 255) * 48);
    const S = new Spr(1, 1, hgt + 8, 2, rot);
    const kind = fv % 3, col = RUIN_C[kind];
    const jag = (c) => Math.max(3, hgt - Math.round(Math.abs(Math.sin(c * 0.7 + fv)) * 6 + hash(c >> 1, 5, s) * 9));
    const wall = (u, v, side, len, h) => {
      const st = 9, vv = v % st, win = vv > 2 && vv < 7 && (u % 6 > 1 && u % 6 < 5) && u > 1 && u < len - 2;
      if (win) return sh([28, 26, 25], 1);
      if (v > h - 2) return sh(col, LIGHT[side] * 1.15);
      let f2 = LIGHT[side] * n(u, v, s, 0.08);
      if (hash(u >> 1, v >> 2, s) < 0.06) f2 *= 0.7; // soot
      return sh(col, f2);
    };
    const inner = (u, v, side, len, h) => sh(col, (side === 0 ? 0.6 : 0.5) * n(u, v, s + 1, 0.08));
    // inner back walls first, then rubble floor, then the jagged front walls
    S.top(0.06, 0.06, 0.88, 0.88, 1, (u, v, sx, sy) => sh([72, 68, 62], n(sx, sy, s, 0.2)));
    for (let f2 = 0; f2 < 4; f2++) {
      S.wall(f2, 0.06, 0.06, 0.88, 0.88, 0, (c) => jag(c + f2 * 14), wall);
      S.wall(f2, 0.06, 0.06, 0.88, 0.88, 0, (c) => Math.max(2, jag(c + f2 * 14) - 2), inner, true);
    }
    // rebar
    const [rx, ry] = S.p(0.94, 0.94, jag(0) - 1);
    S.line(rx, ry, rx + 2, ry - 4, sh([110, 70, 50], 1));
    return S.done();
  }
  if (f === F.WRECK) {
    const S = new Spr(1, 1, 12, 2, rot), ax = fv % 2, col = SCRAP[fv % 8];
    const w = ax ? 0.34 : 0.62, d = ax ? 0.62 : 0.34, x = 0.5 - w / 2, y = 0.5 - d / 2;
    const m = { wall: (u, v, side) => sh(v === 0 ? [30, 28, 26] : col, LIGHT[side] * n(u, v, s, 0.12) * (hash(u, v, s) < 0.12 ? 0.7 : 1)), top: (u, v, sx, sy) => sh(col, 1.05 * n(sx, sy, s, 0.15)) };
    S.box(x, y, w, d, 0, 4, m);
    const cab = { wall: (u, v, side) => sh([40, 46, 50], LIGHT[side]), top: () => sh(col, 0.95) };
    S.box(x + w * 0.2, y + d * 0.2, w * 0.6, d * 0.6, 4, 3, cab);
    return S.done();
  }
  if (f === F.JUNK) {
    const S = new Spr(1, 1, 16, 2, rot);
    for (let k = 0; k < 5; k++) {
      const x = 0.15 + hash(s, k) * 0.5, y = 0.15 + hash(s, k + 9) * 0.5, w = 0.12 + hash(s, k + 4) * 0.2;
      if (k === 2) S.cyl(x + 0.1, y + 0.1, 0.08, 0, 6, SCRAP[(fv + k) % 8], sh(SCRAP[(fv + k) % 8], 0.7) && SCRAP[(fv + k) % 8], 2);
      else S.box(x, y, w, w, 0, 2 + hash(s, k + 2) * 5, matScrap(s + k));
    }
    return S.done();
  }
  if (f === F.RUBBLE) {
    const S = new Spr(1, 1, 10, 2, rot);
    for (let k = 0; k < 6; k++) {
      const x = 0.1 + hash(s, k) * 0.6, y = 0.1 + hash(s, k + 9) * 0.6, w = 0.12 + hash(s, k + 4) * 0.22, c = k % 3 === 0 ? H('#9c5a45') : RUIN_C[k % 3];
      S.box(x, y, w, w * (0.6 + hash(s, k + 7) * 0.6), 0, 1 + hash(s, k + 2) * 4, { wall: (u, v, side) => sh(c, LIGHT[side] * n(u, v, s, 0.1)), top: (u, v, sx, sy) => sh(c, 1.1 * n(sx, sy, s, 0.1)) });
    }
    return S.done();
  }
  return null;
}

// ---------- vehicles ----------
// Sized to seat people: a settler is three pixels tall, and two of them show in each windscreen.
export const VEH = { car: [0.52, 0.27], truck: [0.78, 0.3], troop: [0.95, 0.34], cart: [0.42, 0.26] };
const VCOL = ['#7fc4c0', '#f0cf6a', '#ef9a83', '#86b6e8', '#9fd38c', '#a99ad6', '#e8e4da'];
const paint = (c) => ({ wall: (u, v, s) => sh(c, LIGHT[s] * (v === 0 ? 0.7 : 1)), top: (u, v, sx, sy) => sh(c, 1.1 * n(sx, sy, 2, 0.03)) });
const cabin = (c) => ({
  wall: (u, v, s) => (v >= 1 ? ((u % 4 === 1 && v === 1) ? sh([222, 180, 140], 1) : sh([66, 96, 118], LIGHT[s] * 1.1)) : sh(c, LIGHT[s])),
  top: () => sh(c, 1.15),
});
// a vehicle at (x, y) in the frame it is drawn in; length along x, or along y when axis is 'y'
function vehicle(S, kind, col, x, y, axis = 'x') {
  const c = H(col);
  const b = (a0, b0, l, w, z, h, m) => (axis === 'x' ? S.box(x + a0, y + b0, l, w, z, h, m) : S.box(x + b0, y + a0, w, l, z, h, m));
  const [L, W2] = VEH[kind], tyre = paint([30, 28, 26]);
  for (const a of [0.08, L - 0.16]) for (const s0 of [-0.012, W2 - 0.03]) b(a, s0, 0.09, 0.042, 0, 2, tyre);
  if (kind === 'car') {
    b(0, 0, L, W2, 1, 3, paint(c));
    b(0.1, 0.03, 0.3, W2 - 0.06, 4, 3, cabin(c));
  } else if (kind === 'truck') {
    b(0, 0, L, W2, 1, 2, paint([70, 70, 72]));
    b(L - 0.26, 0.01, 0.26, W2 - 0.02, 3, 5, cabin(c));
    b(0, 0.01, L - 0.3, W2 - 0.02, 3, 3, { wall: (u, v, s) => sh(c, LIGHT[s] * (u % 3 ? 0.95 : 0.75)), top: () => sh([44, 40, 36], 1) });
  } else if (kind === 'troop') {
    const blue = H('#3e6a8e');
    b(0, 0, L, W2, 1, 2, paint([44, 52, 62]));
    b(L - 0.26, 0.01, 0.26, W2 - 0.02, 3, 5, cabin(blue));
    b(0, 0.01, L - 0.3, W2 - 0.02, 3, 6, { wall: (u, v, s) => sh(blue, LIGHT[s] * (u % 5 ? 1 : 0.76)), top: (u, v, sx, sy) => sh(blue, 1.2 * n(sx, sy, 3, 0.03)) });
  } else {
    b(0, 0.02, L, W2 - 0.04, 2, 3, matWood(5));
    b(0.04, 0.05, L - 0.08, W2 - 0.1, 5, 2, paint([120, 116, 84]));
  }
}
const vcache = new Map();
export function vehicleSprite(kind, colour, rot) {
  const key = kind + '|' + colour + '|' + rot;
  let s = vcache.get(key);
  if (!s) {
    const [L, W2] = VEH[kind], S = new Spr(L, W2, 16, 3, rot);
    vehicle(S, kind, VCOL[colour % VCOL.length], 0, 0);
    s = S.done(); vcache.set(key, s);
  }
  return s;
}
export const VEH_COLOURS = VCOL.length;

// ---------- bridges and loot ----------
const bcache = new Map();
export function bridgeSprite(axis, era, rot) {
  const key = axis * 10 + era + rot * 100;
  let s = bcache.get(key);
  if (s) return s;
  const S = new Spr(1, 1, 10, 2, rot);
  const col = era === 0 ? '#8a5a3a' : era === 1 ? '#8a6a44' : '#b4b8ba';
  const rail = { wall: (u, v, s2) => sh(H(col), LIGHT[s2] * (v === 2 ? 1.15 : 0.85)), top: () => sh(H(col), 1.2) };
  // two railings along the deck, with a post at each end
  for (const k of [0.17, 0.79]) {
    if (axis === 1) { S.box(0, k, 1, 0.04, 2, 2, rail); S.box(0.02, k, 0.06, 0.04, 0, 2, rail); S.box(0.5, k, 0.06, 0.04, 0, 2, rail); }
    else { S.box(k, 0, 0.04, 1, 2, 2, rail); S.box(k, 0.02, 0.04, 0.06, 0, 2, rail); S.box(k, 0.5, 0.04, 0.06, 0, 2, rail); }
  }
  s = S.done(); bcache.set(key, s);
  return s;
}
let crate = null;
export function crateSprite() {
  if (crate) return crate;
  const S = new Spr(0.4, 0.4, 10, 2, 0);
  S.box(0.06, 0.06, 0.28, 0.28, 0, 5, { wall: (u, v, s) => sh([176, 132, 70], LIGHT[s] * (u % 3 ? 1 : 0.72)), top: (u, v, sx, sy) => sh([206, 164, 90], n(sx, sy, 4, 0.05)) });
  crate = S.done();
  return crate;
}

// ---------- the Camp: tents all game, and they fold ----------
function canvasRoof(col, seed) {
  const c = H(col);
  return (sx, sy, face, axis) => sh(c, [0.98, 0.76, 1.12, 1.26][face] * n(sx, sy, seed, 0.05) * ((axis === 'l' ? sx : sx + sy) % 7 === 0 ? 0.88 : 1));
}
function tent(S, x, y, len, wid, height, col, seed, f, axis = 'x') {
  const fold = 1 - f;
  if (f > 0.97) { // rolled and strapped
    const l = axis === 'x' ? len * 0.5 : wid * 0.5, w = axis === 'x' ? wid * 0.5 : len * 0.5;
    S.box(x + (axis === 'x' ? len * 0.25 : wid * 0.25), y + (axis === 'x' ? wid * 0.25 : len * 0.25), l, w, 0, 3, paint(H(col)));
    return;
  }
  const rf = canvasRoof(col, seed), wall = { wall: (u, v, s) => sh(H(col), LIGHT[s] * (v % 4 === 3 ? 0.88 : 1)) };
  const rh = Math.max(1, Math.round(height * fold)), W2 = wid * (0.45 + 0.55 * fold);
  if (axis === 'x') S.gableX(x, y + (wid - W2) / 2, len * (0.6 + 0.4 * fold), W2, 0, rh, rf, wall.wall, 0.02);
  else S.gableY(x + (wid - W2) / 2, y, W2, len * (0.6 + 0.4 * fold), 0, rh, rf, wall.wall, 0.02);
}
R.camp = (S, o) => {
  const f = o.fold || 0, sd = o.seed;
  ground(S, 0, 0, 4, 4, (u, v, sx, sy) => sh(hash(sx >> 1, sy, 3) < 0.08 ? [124, 104, 72] : [114, 94, 66], n(sx, sy, sd, 0.1)));
  // six sleeping tents in two rows, and a larger command tent at the head
  const C1 = '#7c7c54', C2 = '#94875c';
  tent(S, 0.25, 0.3, 1.0, 0.8, 11, C1, 3, f);
  tent(S, 1.5, 0.3, 1.0, 0.8, 11, C2, 4, f);
  tent(S, 0.25, 2.85, 1.0, 0.8, 11, C2, 5, f);
  tent(S, 1.5, 2.85, 1.0, 0.8, 11, C1, 6, f);
  tent(S, 2.85, 0.3, 1.0, 0.8, 11, C1, 7, f, 'y');
  tent(S, 2.85, 2.5, 1.2, 0.8, 11, C2, 8, f, 'y');
  tent(S, 0.3, 1.45, 1.5, 1.05, 15, '#6a7a58', 9, f);
  // fire pit, crates, and the flag that comes down last
  if (f < 0.5) {
    const [sx, sy, dep] = S.p(2.6, 2.0, 0);
    for (let k = -3; k <= 3; k++) { S.set(sx + k, sy + (k & 1), sh([70, 66, 62], 1), dep); S.set(sx + k, sy - 1 + (k & 1), sh([92, 86, 78], 1), dep); }
    S.set(sx, sy - 2, sh([255, 170, 60], 1), dep + 0.1); S.set(sx + 1, sy - 2, sh([255, 200, 90], 1), dep + 0.1); S.set(sx, sy - 3, sh([255, 220, 120], 1), dep + 0.1);
    if (f === 0) S.smoke.push([sx, sy - 5]);
  }
  for (let k = 0; k < 3; k++) S.box(2.1 + k * 0.22, 1.2, 0.18, 0.18, 0, 3, matWood(sd + k));
  if (f < 0.85) flag(S, 2.1, 1.75, 0, Math.round(26 * (1 - f)), '#3e6a8e');
};

// ---------- the EV plant, with a lot full of real vehicles ----------
R.evplant = (S, o) => {
  ground(S, 0, 0, 3, 3, (u, v, sx, sy) => (v > 31 && Math.floor(u + 3) % 11 === 0 ? sh([214, 214, 204], 1) : asphaltFn(o.seed)(u, v, sx, sy)));
  const m = o.siding ? matMetal(['#7da0b5', '#c4a35a', '#b56a5a', '#8b86b8', '#7fae7a', '#6f9fcf'][o.hue], o.seed) : matConcrete(o.seed, H('#bab6ad'));
  S.walls(0.1, 0.1, 2.8, 1.75, 0, 16, facade(m.wall, { era: 2, siding: false, hue: o.hue, seed: o.seed, sp: 8, ww: 5, wh: 3, dw: 7, dh: 11 }));
  // sawtooth roof: north-light strips
  for (let k = 0; k < 5; k++) {
    const y0 = 0.1 + k * 0.35;
    S.poly([S.p(0.1, y0, 16), S.p(2.9, y0, 16), S.p(2.9, y0 + 0.35, 24), S.p(0.1, y0 + 0.35, 24)], (sx, sy) => sh([160, 164, 166], 1.05 * n(sx, sy, k, 0.04)));
    S.poly([S.p(0.1, y0 + 0.35, 24), S.p(2.9, y0 + 0.35, 24), S.p(2.9, y0 + 0.35, 16), S.p(0.1, y0 + 0.35, 16)], (sx) => sh([120, 170, 200], 1 + (sx % 5 === 0 ? -0.3 : 0)));
  }
  S.wall(1, 0.1, 0.1, 2.8, 1.75, 16, (c) => Math.round(8 * (1 - (c % 5.6) / 5.6)), m.wall);
  S.wall(3, 0.1, 0.1, 2.8, 1.75, 16, (c) => Math.round(8 * ((c % 5.6) / 5.6)), m.wall);
  S.shadow([[0.1, 0.1, 24], [2.9, 0.1, 24], [2.9, 1.85, 24], [0.1, 1.85, 24]]);
  // the lot: a row of cars nose-in, then trucks
  ['#7fc4c0', '#f0cf6a', '#ef9a83', '#86b6e8', '#9fd38c'].forEach((c, k) => vehicle(S, 'car', c, 0.14 + k * 0.56, 2.0, 'y'));
  ['#e8e4da', '#ef9a83', '#7fc4c0'].forEach((c, k) => vehicle(S, 'truck', c, 0.18 + k * 0.92, 2.62));
};

// ---------- the Vehicle Works: a 5x5 yard with a great hangar ----------
R.vworks = (S, o) => {
  const hazard = (u, v) => (u + v) % 12 < 6;
  ground(S, 0, 0, 5, 5, (u, v, sx, sy) => {
    if (v > 50 && v < 53) return hazard(Math.floor(u), 0) ? sh([214, 172, 52], 1) : sh([40, 38, 36], 1);
    if (v > 53 && Math.floor(u) % 26 === 0) return sh([206, 206, 196], 1);
    return asphaltFn(o.seed)(u, v, sx, sy);
  });
  const col = o.siding ? ['#7da0b5', '#c4a35a', '#b56a5a', '#8b86b8', '#7fae7a', '#6f9fcf'][o.hue] : '#a9b0b4', C = H(col);
  const m = matMetal(col, o.seed);
  const X0 = 0.2, L = 4.6, Y0 = 0.2, D = 2.9, Hh = 18, rise = 24;
  // the barrel vault
  for (let k = 0; k < 48; k++) {
    const t = k / 48, t2 = (k + 1) / 48, y = Y0 + D * t, y2 = Y0 + D * t2, z = Hh + rise * Math.sin(Math.PI * t), z2 = Hh + rise * Math.sin(Math.PI * t2);
    const ny = -Math.cos(Math.PI * (t + t2) / 2), nz = Math.sin(Math.PI * (t + t2) / 2), [vx, vy] = S.vdir(0, ny);
    const f = 0.72 + 0.36 * nz + vy * 0.1 - vx * 0.2;
    S.poly([S.p(X0, y, z), S.p(X0 + L, y, z), S.p(X0 + L, y2, z2), S.p(X0, y2, z2)], (sx) => sh(C, f * (sx % 5 === 0 ? 1.1 : 1)));
  }
  const arch = (c) => Math.round(Hh + rise * Math.sin(Math.PI * (c / (D * 16))));
  const endWall = facade(m.wall, { era: 2, door: false, sp: 11, ww: 5, wh: 4, storey: 16 });
  S.wall(1, X0, Y0, L, D, 0, arch, endWall); S.wall(3, X0, Y0, L, D, 0, arch, endWall);
  S.wall(2, X0, Y0, L, D, 0, Hh, m.wall);
  // the open hangar front, with an MSV on the assembly floor inside
  S.wall(0, X0, Y0, L, D, 0, Hh, (u, v, side, len, h) => {
    const u0 = 10, u1 = len - 10;
    if (u >= u0 && u < u1 && v < h - 2) {
      const cu = (u0 + u1) / 2, inU = Math.abs(u - cu) < 15;
      if (inU && v < 10) { if (v < 2) return sh([34, 32, 30], 1); return v > 5 && (u % 7 === 2) ? sh([70, 110, 140], 1) : v === 5 || v === 6 ? sh([216, 120, 50], 0.9) : sh([176, 168, 128], 0.85); }
      return sh([26, 28, 32], 1 + (v > 12 ? 0.2 : 0));
    }
    if (u === u0 - 1 || u === u1) return hazard(0, v) ? sh([214, 172, 52], LIGHT[side]) : sh([40, 38, 36], LIGHT[side]);
    return m.wall(u, v, side);
  });
  // the yard: gantry crane, offices, fuel, parts
  S.box(0.3, 3.45, 1.0, 1.1, 0, 15, { wall: facade(wallMat(o).wall, { era: o.era, siding: o.siding, hue: o.hue, seed: o.seed, sp: 6, doorSide: 1, storey: 8, wh: 3 }), top: (u, v, sx, sy) => sh([84, 82, 80], n(sx, sy, o.seed, 0.12)) });
  S.cyl(4.45, 3.65, 0.28, 0, 16, H('#c9c5bc'), H('#a8a49c'), 4);
  S.cyl(4.45, 4.4, 0.28, 0, 16, H('#c9c5bc'), H('#a8a49c'), 4);
  for (let k = 0; k < 5; k++) S.box(1.6 + k * 0.3, 4.55, 0.24, 0.24, 0, 3 + (k % 3) * 2, matMetal(['#8e979c', '#a5532e', '#5a6a80'][k % 3], k));
  const ye = sh([214, 172, 52], 1), yd = sh([170, 136, 40], 1);
  const posts = [[1.55, 3.3], [4.0, 3.3], [4.0, 4.35], [1.55, 4.35]];
  for (const [x, y] of posts) { const a = S.p(x, y, 0), b = S.p(x, y, 30); S.line(a[0], a[1], b[0], b[1], ye, a[2], b[2]); S.line(a[0] + 1, a[1], b[0] + 1, b[1], yd, a[2], b[2]); }
  for (let k = 0; k < 4; k++) { const a = S.p(posts[k][0], posts[k][1], 30), b = S.p(posts[(k + 1) % 4][0], posts[(k + 1) % 4][1], 30); S.line(a[0], a[1], b[0], b[1], ye, a[2], b[2]); S.line(a[0], a[1] - 1, b[0], b[1] - 1, yd, a[2], b[2]); }
  const h0 = S.p(2.8, 3.8, 30), h1 = S.p(2.8, 3.8, 12);
  S.line(h0[0], h0[1], h1[0], h1[1], sh([40, 40, 40], 1), h0[2], h1[2]);
  S.box(2.7, 3.7, 0.2, 0.2, 9, 3, m);
};

// ---------- building sprite cache ----------
const cache = new Map();
export function buildingSprite(b, rot = 0, fold = 0) {
  const key = `${b.type}|${b.era}|${b.siding ? 1 : 0}|${b.hue}|${rot}|${fold}`;
  let s = cache.get(key);
  if (s) return s;
  const def = B[b.type], [w, d] = def.size;
  const S = new Spr(w, d, 72, 3, rot);
  R[b.type](S, { era: b.era, siding: b.siding, hue: b.hue, seed: (b.hue + 1) * 31 + b.era * 7, w, d, fold });
  s = S.done();
  cache.set(key, s);
  return s;
}
const fcache = new Map();
export function featureSpriteCached(f, fv, rot = 0) {
  const key = (f * 1000 + (f === F.RUIN ? fv : fv % 12)) * 4 + rot;
  let s = fcache.get(key);
  if (s === undefined) { s = featureSprite(f, f === F.RUIN ? fv : fv % 12, rot); fcache.set(key, s); }
  return s;
}

// ---------- resource icons ----------
export function icon(kind, scale = 2) {
  const c = canvas(12 * scale, 12 * scale), x = c.getContext('2d');
  const P = (px, py, col) => { x.fillStyle = col; x.fillRect(px * scale, py * scale, scale, scale); };
  const pat = {
    food: ['.....y......', '....yyy.....', '....yoy.....', '...gyyyg....', '...gyoyg....', '..ggyyygg...', '..ggyoygg...', '...gyyyg....', '...ggggg....', '....ggg.....', '.....g......'],
    scrap: ['............', '..rrr.......', '.rrrrgg.....', '.rrggggg....', 'rrggbbgg....', 'rgggbbbgg...', '.ggbbbbbg...', '..gbbbbg....', '....bb......'],
    wood: ['............', '.......ww...', '.....wwwwk..', '...wwwwwwk..', '.wwwwwwwk...', 'wwwwwwwk....', 'kwwwwwk.....', '.kkkkk......'],
    stone: ['............', '...ssss.....', '..ssssss....', '.ssssssst...', '.sssssstt...', 'ssssssttt...', '.sstttttt...', '..tttttt....'],
    metal: ['............', '............', '...mmmmmm...', '..mmmmmmmn..', '.mmmmmmmnn..', 'nnnnnnnnn...', 'nnnnnnnn....'],
    glass: ['....cc......', '...cccc.....', '..ccwccc....', '..cwccccc...', '..ccccccc...', '...ccccc....', '....ccc.....', '.....c......'],
    plastic: ['............', '...pppp.....', '..pppppp....', '..pyppyp....', '..pppppp....', '..pppppp....', '..pppppp....', '...pppp.....'],
    power: ['....yy......', '...yy.......', '..yyyyy.....', '....yy......', '...yy.......', '..yy........'],
    pop: ['...hh.......', '...hh...hh..', '..bbbb..hh..', '..bbbb.bbbb.', '..bbbb.bbbb.', '..l..l.l..l.'],
    sec: ['...kk.......', '...hh.......', '..vvvvg.....', '..vvvvg.....', '..vvvv......', '..l..l......'],
    kh: ['...yyyy.....', '..yyyyyy....', '..yyyyyy....', '...yyyy.....', '....ss......', '....ss......'],
    appeal: ['............', '..rr.rr.....', '.rrrrrrr....', '.rrrrrrr....', '..rrrrr.....', '...rrr......', '....r.......'],
  }[kind];
  const C = { g: '#6aa64a', o: '#c98a3a', y: '#f2d04a', r: '#a5532e', b: '#5a6a80', w: '#a87a46', k: '#5a3e24', s: '#b4aea2', t: '#7f7a72', m: '#c4ccd0', n: '#7f8a90', c: '#9ad8e8', p: '#ef7fae', h: '#e2b48a', l: '#5a4a3a', v: '#4a6a8a' };
  if (pat) pat.forEach((row, py) => [...row].forEach((ch, px) => { if (C[ch]) P(px, py + 1, C[ch]); }));
  return c.toDataURL();
}
