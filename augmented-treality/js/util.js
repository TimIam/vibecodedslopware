// Small shared helpers: seeded random numbers, canvases, geometry merging.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// A colour texture from a canvas. Exporters need an image they can read back, which a canvas is.
export function tex(c, { repeat = false, srgb = true, flip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.flipY = flip;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Every geometry the exporters see carries position, normal and uv, so meshes that share
// a material can be merged into one. Colour attributes are dropped: Quick Look ignores them.
export function normalize(g) {
  if (!g.index) {
    const n = g.attributes.position.count, a = new Uint32Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    g.setIndex(new THREE.BufferAttribute(a, 1));
  } else if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

export function merge(list) {
  const geos = list.filter(Boolean).map(normalize);
  if (!geos.length) return null;
  const g = mergeGeometries(geos, false);
  return g;
}

// Bake an object's world transform into a copy of its geometry.
export function baked(mesh, rootInverse) {
  const g = mesh.geometry.clone();
  const m = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  g.applyMatrix4(m);
  return g;
}

// Orient a geometry so its +X axis points along `dir`, with `up` as the preferred normal.
export function basis(dir, up = new THREE.Vector3(0, 1, 0)) {
  const x = dir.clone().normalize();
  let z = new THREE.Vector3().crossVectors(x, up);
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(1, 0, 0));
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

export function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

export function hex(c) { return '#' + new THREE.Color(c).getHexString(); }
