// Toolkit for gear.js / gear-kit.js: a geometry builder that merges many small parts into one mesh per material
// (per-vertex colour, roughness and metalness, so a whole device is one draw call), the shared materials and
// procedural textures (cordura weave, webbing, hook-and-loop fuzz, wear), and a few shape helpers.
//
// Where things are tuned: mats() for every surface (plastic, fabric, clear PVC, film), TEX_* for texture scale.
// Colours are sRGB hex; the builder converts them. Units metres.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTex, heightField, heightToNormal, fieldToCanvas, fbm2, noise2, hash2, makeRng, clamp } from './util.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);

// position / euler rotation (radians) / scale -> Matrix4
export function TR(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(V3(px, py, pz), new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz)), V3(sx, sy, sz));
}
// a frame at `p` whose +Z points along `z` and whose +Y is as close to `up` as it can be
export function frame(p, z, up = Y) {
  const zz = z.clone().normalize(); let xx = new THREE.Vector3().crossVectors(up, zz);
  if (xx.lengthSq() < 1e-8) xx = new THREE.Vector3().crossVectors(Math.abs(zz.x) < 0.9 ? X : Z, zz);
  xx.normalize(); const yy = new THREE.Vector3().crossVectors(zz, xx);
  return new THREE.Matrix4().makeBasis(xx, yy, zz).setPosition(p);
}

// ---------------------------------------------------------------- builder

const BOX_UV = 4;      // box-projected UVs per metre for wear / fabric (the textures set their own repeat on top)
export class Builder {
  constructor() { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; }
  get m() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.m.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  // o: { m: Matrix4, c: hex colour, a: alpha, r: roughness, mt: metalness, uv: 'box' | 'keep' | [su, sv] | {rect:[u0,v0,u1,v1]} , s: uv scale for box }
  add(geo, mat, o = {}) {
    if (!geo) return this;
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, n = P.count;
    let part = this.parts.get(mat); if (!part) this.parts.set(mat, part = { pos: [], nor: [], uv: [], col: [], rm: [], n: 0 });
    _m.copy(this.m); if (o.m) _m.multiply(o.m); _n3.getNormalMatrix(_m);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 4), rm = new Float32Array(n * 2);
    _c.set(o.c ?? 0xffffff); const a = o.a ?? 1, r = o.r ?? 0.6, mt = o.mt ?? 0, mode = o.uv ?? 'box', bs = (o.s ?? 1) * BOX_UV, rect = mode.rect;
    const flip = _m.determinant() < 0;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      const px = _v.x, py = _v.y, pz = _v.z;
      if (N) _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); else _v.set(0, 1, 0);
      nor[i * 3] = _v.x; nor[i * 3 + 1] = _v.y; nor[i * 3 + 2] = _v.z;
      if (mode === 'box' || !UV) { const ax = Math.abs(_v.x), ay = Math.abs(_v.y), az = Math.abs(_v.z); if (ax >= ay && ax >= az) { uv[i * 2] = pz * bs; uv[i * 2 + 1] = py * bs; } else if (ay >= az) { uv[i * 2] = px * bs; uv[i * 2 + 1] = pz * bs; } else { uv[i * 2] = px * bs; uv[i * 2 + 1] = py * bs; } }
      else if (rect) { uv[i * 2] = rect[0] + (rect[2] - rect[0]) * UV.getX(i); uv[i * 2 + 1] = rect[1] + (rect[3] - rect[1]) * UV.getY(i); }
      else if (Array.isArray(mode)) { uv[i * 2] = UV.getX(i) * mode[0]; uv[i * 2 + 1] = UV.getY(i) * mode[1]; }
      else { uv[i * 2] = UV.getX(i); uv[i * 2 + 1] = UV.getY(i); }
      col[i * 4] = _c.r; col[i * 4 + 1] = _c.g; col[i * 4 + 2] = _c.b; col[i * 4 + 3] = a; rm[i * 2] = r; rm[i * 2 + 1] = mt;
    }
    if (flip) for (let i = 0; i < n; i += 3) for (const [arr, k] of [[pos, 3], [nor, 3], [uv, 2]]) for (let j = 0; j < k; j++) { const t = arr[(i + 1) * k + j]; arr[(i + 1) * k + j] = arr[(i + 2) * k + j]; arr[(i + 2) * k + j] = t; }
    part.pos.push(pos); part.nor.push(nor); part.uv.push(uv); part.col.push(col); part.rm.push(rm); part.n += n;
    if (g !== geo) g.dispose(); if (!o.keep) geo.dispose();
    return this;
  }
  // -> Group with one mesh per material. opts: { shadow: cast shadows, into: existing Group }
  build(opts = {}) {
    const grp = opts.into || new THREE.Group(), M = mats();
    for (const [key, part] of this.parts) {
      if (!part.n) continue;
      const cat = (arrs, k) => { const out = new Float32Array(part.n * k); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(cat(part.pos, 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(cat(part.nor, 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(cat(part.uv, 2), 2)); g.setAttribute('color', new THREE.BufferAttribute(cat(part.col, 4), 4)); g.setAttribute('aRM', new THREE.BufferAttribute(cat(part.rm, 2), 2));
      const material = typeof key === 'string' ? M[key] : key, mesh = new THREE.Mesh(g, material); mesh.name = typeof key === 'string' ? key : 'custom';
      const clear = material.transparent;
      mesh.castShadow = !!opts.shadow && !clear; mesh.receiveShadow = !clear; if (clear) { mesh.userData.noAO = true; mesh.renderOrder = material.userData.order ?? 2; }
      grp.add(mesh);
    }
    this.parts.clear();
    return grp;
  }
}

// ---------------------------------------------------------------- shapes

export const rbox = (w, h, d, r = 0.004, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.max(0.0002, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 16, open = false, a0 = 0, arc = Math.PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, a0, arc);
export const sph = (r, w = 14, h = 10, p0 = 0, pl = Math.PI * 2, t0 = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, p0, pl, t0, tl);
export const cap = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 5, seg);
export const torus = (R, r, seg = 24, rs = 8, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, rs, seg, arc);
export const plate = (w, h) => new THREE.PlaneGeometry(w, h);
export const disc = (r, seg = 24) => new THREE.CircleGeometry(r, seg);
export const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
export function tube(pts, r, rs = 6, seg = 0, closed = false) {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  return new THREE.TubeGeometry(c, seg || Math.max(4, Math.round(pts.length * 2.5)), r, rs, closed);
}
// extruded outline (array of [x, y]) with a small bevel; depth along +Z, centred
export function slab(outline, depth, bevel = 0.001, holes = null) {
  const s = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1])));
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2 + bevel); return g;
}
export const roundRect = (w, h, r, n = 5) => { const o = [], cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]]; for (const [cx, cy, k] of cs) for (let i = 0; i <= n; i++) { const a = (k + i / n) * Math.PI / 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
export const ellipse = (rx, ry, n = 24) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * rx, Math.sin(i / n * Math.PI * 2) * ry]);

// A flat strap following `pts`, lying in the surface whose normals are `nors` (one per point, or one for all).
// u runs along the length in metres * 1, v across the width 0..1 (so webbing textures scale by length).
export function ribbon(pts, nors, width, thick = 0.0015, closed = false) {
  const n = pts.length, pos = [], uv = [], idx = [], t = new THREE.Vector3(), side = new THREE.Vector3(), nn = new THREE.Vector3(); let len = 0;
  const ring = closed ? n + 1 : n;
  for (let k = 0; k < ring; k++) {
    const i = k % n, a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    t.subVectors(b, a); if (t.lengthSq() < 1e-12) t.set(1, 0, 0); t.normalize();
    nn.copy(Array.isArray(nors) ? nors[i] : nors); side.crossVectors(t, nn); if (side.lengthSq() < 1e-10) side.set(1, 0, 0); side.normalize(); nn.crossVectors(side, t).normalize();
    if (k > 0) len += pts[i].distanceTo(pts[(k - 1) % n]);
    const p = pts[i], hw = width / 2, ht = thick / 2;
    // four corners of the cross-section: outer-left, outer-right, inner-right, inner-left
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) pos.push(p.x + side.x * hw * sx + nn.x * ht * sy, p.y + side.y * hw * sx + nn.y * ht * sy, p.z + side.z * hw * sx + nn.z * ht * sy);
    uv.push(len, 0, len, 1, len, 1, len, 0);
  }
  for (let k = 0; k < ring - 1; k++) { const a = k * 4, b = a + 4; for (let j = 0; j < 4; j++) { const j2 = (j + 1) % 4; idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j); } }
  if (!closed) { const e = (ring - 1) * 4; idx.push(0, 3, 1, 1, 3, 2, e, e + 1, e + 3, e + 1, e + 2, e + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const out = g.toNonIndexed(); g.dispose(); out.computeVertexNormals(); return out;     // flat-shaded edges: a strap has corners
}

// A sheet through a grid of points (rows x cols, row-major) with UVs 0..1; smooth normals. Used for anything draped on skin.
export function sheet(grid, rows, cols, thick = 0, nors = null) {
  const pos = [], uv = [], idx = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = grid[r * cols + c]; pos.push(p.x, p.y, p.z); uv.push(c / (cols - 1), r / (rows - 1)); }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx.push(a, b, d, b, e, d); }
  if (thick > 0 && nors) {     // a rim so that pads have an edge
    const base = rows * cols; for (let i = 0; i < base; i++) { const p = grid[i], n = nors[i]; pos.push(p.x - n.x * thick, p.y - n.y * thick, p.z - n.z * thick); uv.push(uv[i * 2], uv[i * 2 + 1]); }
    const edge = (a, b) => idx.push(a, b, a + base, b, b + base, a + base);
    for (let c = 0; c < cols - 1; c++) { edge(c + 1, c); edge((rows - 1) * cols + c, (rows - 1) * cols + c + 1); }
    for (let r = 0; r < rows - 1; r++) { edge(r * cols, (r + 1) * cols); edge((r + 1) * cols + cols - 1, r * cols + cols - 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- textures

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const T = {};
  // plain-weave cordura: 16 threads a tile, each thread a rounded ridge that dips under its neighbours
  { const n = 256, k = 16, h = heightField(n, (u, v) => { const x = u * k, y = v * k, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix - 0.5, fy = y - iy - 0.5, over = (ix + iy) & 1;
      const warp = Math.cos(fx * Math.PI) * (0.55 + 0.45 * (over ? Math.cos(fy * Math.PI) : -Math.cos(fy * Math.PI) * 0.4)), weft = Math.cos(fy * Math.PI) * (0.55 + 0.45 * (!over ? Math.cos(fx * Math.PI) : -Math.cos(fx * Math.PI) * 0.4));
      return Math.max(warp, weft) * 0.8 + 0.2 * hash2(Math.floor(u * n), Math.floor(v * n), 3) * 0.35; });
    T.weaveN = canvasTex(heightToNormal(h, n, 2.2), { srgb: false, repeat: [13, 13] });
    T.weaveC = canvasTex(fieldToCanvas(n, i => 0.84 + 0.16 * h[i]), { repeat: [13, 13] }); }
  // webbing: fine herringbone ribs running along u
  { const n = 128, h = heightField(n, (u, v) => { const r = (u * 16 + Math.abs(((v * 4) % 1) - 0.5) * 3) % 1; return 0.5 + 0.5 * Math.sin(r * Math.PI * 2) * (0.7 + 0.3 * Math.sin(v * Math.PI * 8)); });
    T.webN = canvasTex(heightToNormal(h, n, 2.2), { srgb: false, repeat: [60, 1] }); }
  // hook-and-loop / foam / brushed fabric: tight random fuzz
  { const n = 128, h = heightField(n, (u, v, x, y) => hash2(x, y, 11) * 0.6 + noise2(u * 40, v * 40, 2, 40) * 0.4);
    T.fuzzN = canvasTex(heightToNormal(h, n, 1.6), { srgb: false, repeat: [10, 10] }); }
  // crepe / gauze: open square mesh
  { const n = 128, k = 24, h = heightField(n, (u, v) => { const a = Math.abs(((u * k) % 1) - 0.5), b = Math.abs(((v * k) % 1) - 0.5); return Math.max(1 - a * 3.2, 1 - b * 3.2, 0) + noise2(u * 9, v * 9, 4, 9) * 0.3; });
    T.gauzeN = canvasTex(heightToNormal(h, n, 1.5), { srgb: false, repeat: [9, 9] });
    T.gauzeC = canvasTex(fieldToCanvas(n, i => 0.9 + 0.1 * clamp(h[i])), { repeat: [9, 9] }); }
  // wear on hard parts: fine scratches (lighter, rougher), grime in broad patches (darker)
  { const n = 512, c = makeCanvas(n), g = c.getContext('2d'), rng = makeRng(77), img = g.createImageData(n, n), d = img.data;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 0.86 - 0.1 * Math.max(0, fbm2(x / 90, y / 90, 4, 9, 6) - 0.45) * 2 + (hash2(x, y, 5) - 0.5) * 0.035; const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = clamp(v) * 255; d[i + 3] = 255; }
    g.putImageData(img, 0, 0); g.lineCap = 'round';
    for (let i = 0; i < 150; i++) { const x = rng() * n, y = rng() * n, a = rng() * Math.PI, l = 6 + rng() * rng() * 110, w = rng.chance(0.85) ? 0.6 : 1.4; g.strokeStyle = `rgba(255,255,255,${0.1 + rng() * 0.3})`; g.lineWidth = w; for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 8, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); } }
    T.wearC = canvasTex(c, { repeat: [1, 1] }); T.wearR = canvasTex(c, { srgb: false, repeat: [1, 1] }); }
  return TEX = T;
}

// ---------------------------------------------------------------- label atlas (everything printed)

const ATLAS = 2048;
class Atlas {
  constructor() { this.c = makeCanvas(ATLAS); this.g = this.c.getContext('2d'); this.g.clearRect(0, 0, ATLAS, ATLAS); this.shelves = []; this.y = 2; this.rects = {}; this.pools = {}; this.tex = canvasTex(this.c, { wrap: false, aniso: 16 }); }
  // draw(ctx, w, h) in pixels with the origin at the label's top-left. Returns the uv rect.
  add(key, w, h, draw) {
    if (this.rects[key]) return this.rects[key];
    w = Math.ceil(w); h = Math.ceil(h);
    let sh = this.shelves.filter(s => s.h >= h && s.h <= h * 2.4 && s.x + w + 4 <= ATLAS).sort((a, b) => a.h - b.h)[0];
    if (!sh) { if (this.y + h + 4 > ATLAS) { sh = this.shelves.find(s => s.h >= h && s.x + w + 4 <= ATLAS); if (!sh) { console.warn('gear atlas full:', key); return this.rects[key] = [0, 0, 0.01, 0.01]; } } else { sh = { x: 2, y: this.y, h }; this.shelves.push(sh); this.y += h + 6; } }
    const X0 = sh.x, Y0 = sh.y; sh.x += w + 6;
    const g = this.g; g.save(); g.translate(X0, Y0); g.beginPath(); g.rect(-1, -1, w + 2, h + 2); g.clip(); draw(g, w, h); g.restore();
    const r = this.rects[key] = [X0 / ATLAS, 1 - (Y0 + h) / ATLAS, (X0 + w) / ATLAS, 1 - Y0 / ATLAS];
    this.tex.needsUpdate = true; return r;
  }
  rect(key) { return this.rects[key] || [0, 0, 0.01, 0.01]; }
  // labels whose text changes from call to call (times, readings, drug names) share a small pool of slots, the
  // oldest being redrawn, so that a long session cannot fill the atlas
  dyn(pool, n, key, w, h, draw) {
    const P = this.pools[pool] || (this.pools[pool] = { keys: [], i: 0 }), hit = P.keys.indexOf(key); if (hit >= 0) return this.rects[pool + '#' + hit];
    if (P.keys.length < n) { P.keys.push(key); return this.add(pool + '#' + (P.keys.length - 1), w, h, draw); }
    const slot = P.i++ % n, r = this.rects[pool + '#' + slot], g = this.g; P.keys[slot] = key;
    g.save(); g.translate(Math.round(r[0] * ATLAS), Math.round((1 - r[3]) * ATLAS)); g.beginPath(); g.rect(0, 0, Math.ceil(w), Math.ceil(h)); g.clip(); g.clearRect(0, 0, w + 1, h + 1); draw(g, Math.ceil(w), Math.ceil(h)); g.restore(); this.tex.needsUpdate = true; return r;
  }
}
let _atlas = null;
export const atlas = () => _atlas || (_atlas = new Atlas());

// ---------------------------------------------------------------- materials

let MATS = null;
// 0 dry .. 1 soaked: gear.js sets it from the weather when the scene is out of doors
export const WET = { value: 0 };
function patchRM(m, key, dark = 0.85) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uGW = WET;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; varying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM; uniform float uGW;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * vRM.x, 0.045, 1.0);
        #ifndef FLAT_SHADED
        { float gw = clamp(uGW, 0.0, 1.0) * (0.4 + 0.6 * smoothstep(-0.3, 0.6, inverseTransformDirection(normalize(vNormal), viewMatrix).y));
          diffuseColor.rgb *= mix(1.0, ${dark.toFixed(2)}, gw); roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.27), gw * 0.85); }
        #endif`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(vRM.y, 0.0, 1.0);');
  };
  m.customProgramCacheKey = () => 'gearRM' + key + dark; return m;
}
// Clear plastic without a transmission pass: see-through face on, denser at grazing angles, highlights kept at full
// strength (premultiplied output). Vertex colour tints it, vertex alpha is the face-on opacity.
function clearMat(side, edge, order) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0, side, envMapIntensity: 1.6,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aRM; varying vec2 vRM;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vRM.x, 0.045, 1.0);')
      .replace('#include <opaque_fragment>', `
        vec3 gSpec = min(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(1.3));
        vec3 gDiff = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        float gNV = clamp(abs(dot(normal, normalize(vViewPosition + vec3(0.0, 0.0, 1e-6)))), 0.0, 1.0);
        float gF = (1.0 - gNV) * (1.0 - gNV);
        float gA = clamp(diffuseColor.a + gF * ${edge.toFixed(2)} * (0.35 + diffuseColor.a), 0.0, 1.0);
        outgoingLight = gDiff * gA + gSpec;
        diffuseColor.a = clamp(gA + dot(gSpec, vec3(0.3333)), 0.0, 1.0);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'gearClear' + edge; m.userData.order = order; return m;
}
export function mats() {
  if (MATS) return MATS;
  const T = textures(), A = atlas();
  const M = {};
  // every hard surface: plastics, rubber, metal, paint. Colour, roughness and metalness come from the vertices.
  M.hard = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, map: T.wearC, roughnessMap: T.wearR }), 'hard');
  // cordura and other woven fabric
  M.fabric = patchRM(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: T.weaveC, normalMap: T.weaveN, normalScale: new THREE.Vector2(0.75, 0.75), sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.4, 0.4, 0.4) }), 'fab', 0.55);
  // webbing straps: u along the strap in metres
  M.web = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, normalMap: T.webN, normalScale: new THREE.Vector2(0.8, 0.8) }), 'web', 0.6);
  // hook-and-loop, foam, neoprene, elastic
  M.fuzz = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, normalMap: T.fuzzN, normalScale: new THREE.Vector2(0.7, 0.7) }), 'fuzz', 0.62);
  M.gauze = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: T.gauzeC, normalMap: T.gauzeN, normalScale: new THREE.Vector2(0.9, 0.9) }), 'gauze', 0.7);
  // printed things: opaque labels, and print on clear film / stickers with soft edges
  M.label = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, map: A.tex, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 'label');
  M.decal = patchRM(new THREE.MeshStandardMaterial({ vertexColors: true, map: A.tex, roughness: 1, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 'decal'); M.decal.userData.order = 3;
  M.clear = clearMat(THREE.DoubleSide, 0.55, 2);      // open shells: masks, bags, dressings
  M.tubing = clearMat(THREE.FrontSide, 0.75, 2);      // closed tubes and solid clear parts
  M.film = clearMat(THREE.FrontSide, 0.25, 1);        // films lying on skin
  M.film.polygonOffset = true; M.film.polygonOffsetFactor = -1; M.film.polygonOffsetUnits = -1;
  M.glass = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.4 }); M.glass.userData.order = 4;
  M.shadow = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false }); M.shadow.userData.order = 0;
  return MATS = M;
}
function blobTex() { const n = 128, c = makeCanvas(n), g = c.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); return canvasTex(c, { wrap: false }); }
export const lit = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

// palette shared by both files (sRGB hex)
export const C = {
  white: 0xe8e8e3, offWhite: 0xd9d6cb, grey: 0x8b9096, midGrey: 0x565b61, char: 0x2a2d31, black: 0x121315, rubber: 0x1a1b1d,
  red: 0xb1241b, bagRed: 0xa81e17, orange: 0xe3691b, yellow: 0xe8c22e, green: 0x2e8a4a, o2green: 0x1f8a4c, blue: 0x2a62b8, navy: 0x1d2c44, teal: 0x4fa79a, pink: 0xd9638f, violet: 0x7d4fa8,
  steel: 0xc8cdd2, alu: 0xb9bdc2, brass: 0xb89a4a, skinTape: 0xe9dcc6, foam: 0xe7e1cf, sharpie: 0x15161a,
};

// ---------------------------------------------------------------- drawing helpers for printed labels

export const SANS = 'Arial, Helvetica, sans-serif', HAND = '"Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
export function txt(g, s, x, y, px, o = {}) {
  g.font = `${o.w ?? 700} ${px}px ${o.f || SANS}`; g.fillStyle = o.c || '#fff'; g.textAlign = o.al || 'center'; g.textBaseline = o.bl || 'middle';
  if (o.sp) { try { g.letterSpacing = o.sp + 'px'; } catch { } }
  if (o.rot) { g.save(); g.translate(x, y); g.rotate(o.rot); g.fillText(s, 0, 0); g.restore(); } else g.fillText(s, x, y);
  if (o.sp) { try { g.letterSpacing = '0px'; } catch { } }
}
export function rr(g, x, y, w, h, r, fill, stroke, lw = 1) { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
export function circ(g, x, y, r, fill, stroke, lw = 1) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
// sub-rectangle of an atlas rect; x0..y1 in 0..1 of the label with y measured from its top
export const subRect = (r, x0, y0, x1, y1) => [r[0] + (r[2] - r[0]) * x0, r[3] - (r[3] - r[1]) * y1, r[0] + (r[2] - r[0]) * x1, r[3] - (r[3] - r[1]) * y0];
// light speckle and a few scuffs over a printed label so that it is not factory-new
export function grime(g, w, h, seed = 1, amt = 1) {
  const rng = makeRng(seed);
  for (let i = 0; i < w * h / 900 * amt; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '20,18,16' : '255,255,255'},${0.03 + rng() * 0.07})`; g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2); }
  g.lineCap = 'round'; for (let i = 0; i < 5 * amt; i++) { const x = rng() * w, y = rng() * h, a = rng() * 6.3, l = 10 + rng() * 50; g.strokeStyle = `rgba(255,255,255,${0.05 + rng() * 0.08})`; g.lineWidth = 0.7 + rng(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
}
