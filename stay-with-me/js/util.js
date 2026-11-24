// Small shared helpers: seeded randomness, noise, and canvas-to-texture plumbing.
import * as THREE from 'three';

export const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

// Deterministic RNG. rng() in [0,1); rng.r(a,b) float; rng.i(a,b) int inclusive; rng.pick(arr); rng.chance(p).
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const f = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.r = (a, b) => a + (b - a) * f();
  f.i = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.fork = () => makeRng(Math.floor(f() * 4294967296));
  return f;
}

export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash3(x, y, z, seed = 0) { return hash2(x + Math.imul(z | 0, 1013), y + Math.imul(z | 0, 7919), seed); }

// Value noise, smooth, in [0,1]. `period` > 0 makes it tile every `period` lattice cells.
export function noise2(x, y, seed = 0, period = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = period ? (n => ((n % period) + period) % period) : (n => n);
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed), c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, oct = 5, seed = 0, period = 0) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, y, seed + i * 17, period); n += a; x *= 2; y *= 2; if (period) period *= 2; a *= 0.5; }
  return s / n;
}
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c, seed);
  const x00 = lerp(h(0, 0, 0), h(1, 0, 0), u), x10 = lerp(h(0, 1, 0), h(1, 1, 0), u), x01 = lerp(h(0, 0, 1), h(1, 0, 1), u), x11 = lerp(h(0, 1, 1), h(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x, y, z, oct = 4, seed = 0) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z, seed + i * 31); n += a; x *= 2; y *= 2; z *= 2; a *= 0.5; }
  return s / n;
}

export function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Wrap a canvas as a texture. opts: srgb (albedo/emissive = true; data maps = false), repeat [x,y], aniso, wrap (default repeat).
export function canvasTex(canvas, { srgb = true, repeat = null, aniso = 8, wrap = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso; t.generateMipmaps = mip;
  if (!mip) t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Fill a Float32Array height field (size n*n) from f(u,v) with u,v in [0,1).
export function heightField(n, f) { const h = new Float32Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = f(x / n, y / n, x, y); return h; }

// Height field (tileable) -> tangent-space normal map canvas. strength ~ 1..8.
export function heightToNormal(h, n, strength = 2) {
  const c = makeCanvas(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = h[y * n + (x + n - 1) % n], r = h[y * n + (x + 1) % n], u = h[((y + n - 1) % n) * n + x], dn = h[((y + 1) % n) * n + x];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const m = 1 / Math.hypot(nx, ny, nz);
    const i = (y * n + x) * 4; d[i] = (nx * m * 0.5 + 0.5) * 255; d[i + 1] = (ny * m * 0.5 + 0.5) * 255; d[i + 2] = (nz * m * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

// Height field or any per-pixel scalar f(i)->[0,1] to a grey canvas (for roughness/ao maps).
export function fieldToCanvas(n, f) {
  const c = makeCanvas(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
  for (let i = 0; i < n * n; i++) { const v = clamp(f(i)) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}

// Per-pixel RGB canvas from f(u,v,x,y)->[r,g,b] in 0..1 (sRGB values).
export function colorCanvas(n, f) {
  const c = makeCanvas(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = f(x / n, y / n, x, y), i = (y * n + x) * 4; d[i] = clamp(p[0]) * 255; d[i + 1] = clamp(p[1]) * 255; d[i + 2] = clamp(p[2]) * 255; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData.shared) v.dispose(); } m.dispose(); }
  });
}
