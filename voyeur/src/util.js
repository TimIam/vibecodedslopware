// Small shared helpers: seeded randomness, easing, and a "kit" that collects colored boxes and
// merges them into one geometry so a whole room or facade is a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function dampAngle(a, b, rate, dt) {
  let d = b - a;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-rate * dt));
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const range = (r, a, b) => a + (b - a) * r();
export function weighted(r, entries) { // [[weight, value], ...]
  let tot = 0;
  for (const e of entries) tot += Math.max(0, e[0]);
  if (tot <= 0) return null;
  let x = r() * tot;
  for (const e of entries) { x -= Math.max(0, e[0]); if (x <= 0) return e[1]; }
  return entries[entries.length - 1][1];
}

const tmpC = new THREE.Color();
// Vertex colors, with an optional darkening toward the bottom of the piece (cheap contact shading).
export function paint(geo, hex, shade = 0) {
  const pos = geo.attributes.position;
  const n = pos.count;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = Math.max(1e-6, bb.max.y - bb.min.y);
  tmpC.set(hex);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = 1 - shade * (1 - (pos.getY(i) - bb.min.y) / h);
    a[i * 3] = tmpC.r * f; a[i * 3 + 1] = tmpC.g * f; a[i * 3 + 2] = tmpC.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

export class Kit {
  constructor() { this.parts = []; }
  box(x0, y0, z0, x1, y1, z1, hex, shade = 0) {
    const w = Math.max(0.002, Math.abs(x1 - x0)), h = Math.max(0.002, Math.abs(y1 - y0)), d = Math.max(0.002, Math.abs(z1 - z0));
    const g = new THREE.BoxGeometry(w, h, d);
    paint(g, hex, shade);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.parts.push(g);
    return g;
  }
  geo(g, hex, shade = 0) { if (hex !== undefined && hex !== null) paint(g, hex, shade); this.parts.push(g); return g; }
  beam(ax, ay, az, bx, by, bz, t, hex) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(t, L, t);
    paint(g, hex);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)));
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.parts.push(g);
    return g;
  }
  build() {
    if (!this.parts.length) return null;
    const gs = this.parts.map((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
      if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
      return ng;
    });
    const m = mergeGeometries(gs, false);
    for (const g of this.parts) g.dispose();
    return m;
  }
}

// World-space UVs so textures keep one scale across boxes of any size.
export function planarUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (az >= ax && az >= ay) { u = p.getX(i); v = p.getY(i); }
    else if (ax >= ay) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getZ(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Circular interval test on minutes-of-day: is m in [a, b)?
export function inCirc(m, a, b) {
  a = ((a % 1440) + 1440) % 1440; b = ((b % 1440) + 1440) % 1440;
  return a <= b ? m >= a && m < b : m >= a || m < b;
}
