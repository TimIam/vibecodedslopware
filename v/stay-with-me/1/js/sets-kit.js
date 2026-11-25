// Interior sets: the construction kit.
// A Kit accumulates transformed geometry into one bucket per material and merges each bucket into a single mesh at
// finish(), so a furnished room costs a few dozen draw calls. Primitives take a base position (x, y = underside, z)
// unless noted, an options bag { r (bevel), rx/ry/rz, col (sRGB hex vertex tint), c (y is the centre) } and are
// affected by the current transform stack (push/pop/at/prop). Bevelled boxes share vertices between faces and
// chamfers (face-weighted normals) so every edge catches a highlight for 44 triangles.
//
// Also here: the room shell (walls with openings, skirting, floor, ceiling), windows with a blurred exterior
// backdrop / curtains / blinds / rain, doors with a stub hall behind, lights, the room-rendered environment map,
// and the Set object the game consumes. Lighting numbers for each room live in the sets-*.js room files.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, U } from './gfx.js';
import { makeRng, fbm3, TAU } from './util.js';
import { M, C, ATLAS, STAIN, backdropTex } from './sets-tex.js';

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n3 = new THREE.Matrix3();
const colCache = new Map();
export function lin(col) {
  if (col == null) return WHITE;
  if (Array.isArray(col)) return col;
  if (col.isColor) return [col.r, col.g, col.b];
  let v = colCache.get(col); if (!v) { _c.set(col); v = [_c.r, _c.g, _c.b]; colCache.set(col, v); } return v;
}
const WHITE = [1, 1, 1];
// shade(hex, k): same hue scaled in linear light; mix(a, b, t)
export const shade = (col, k) => { const c = lin(col); return [c[0] * k, c[1] * k, c[2] * k]; };
export const mixc = (a, b, t) => { const p = lin(a), q = lin(b); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; };

// ---- bevelled box template
const BB = (() => {
  const vid = (a, sg, sn) => (a * 2 + (sg > 0 ? 1 : 0)) * 4 + (sn[(a + 1) % 3] > 0 ? 1 : 0) + (sn[(a + 2) % 3] > 0 ? 2 : 0);
  const P = []; for (let a = 0; a < 3; a++) for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) { const p = [0, 0, 0]; p[a] = s ? 1 : -1; p[(a + 1) % 3] = (k & 1 ? 1 : -1) * 0.75; p[(a + 2) % 3] = (k & 2 ? 1 : -1) * 0.75; P.push(p); }
  const idx = [];
  const tri = (i, j, k, out) => { const A = P[i], B = P[j], Cc = P[k]; const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * out[0] + ny * out[1] + nz * out[2] >= 0) idx.push(i, j, k); else idx.push(i, k, j); };
  for (let a = 0; a < 3; a++) for (let s = 0; s < 2; s++) { const f = (a * 2 + s) * 4, out = [0, 0, 0]; out[a] = s ? 1 : -1; tri(f, f + 1, f + 3, out); tri(f, f + 3, f + 2, out); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = 3 - a - b; for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const sn = [0, 0, 0]; sn[a] = sa; sn[b] = sb; const out = [0, 0, 0]; out[a] = sa; out[b] = sb;
    sn[c] = -1; const A0 = vid(a, sa, sn), B0 = vid(b, sb, sn); sn[c] = 1; const A1 = vid(a, sa, sn), B1 = vid(b, sb, sn);
    tri(A0, A1, B1, out); tri(A0, B1, B0, out); } }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const sn = [sx, sy, sz]; tri(vid(0, sx, sn), vid(1, sy, sn), vid(2, sz, sn), sn); }
  return { idx: new Uint16Array(idx), flat: new Uint16Array(idx.slice(0, 36)) };
})();
const UA = [2, 0, 0], VA = [1, 2, 1]; // in-plane (u,v) axes for faces whose normal is X, Y, Z

function bevelBox(w, h, d, r, tile, grain, uvo, swap) {
  const hs = [w / 2, h / 2, d / 2]; r = Math.max(0, Math.min(r, hs[0] * 0.6, hs[1] * 0.6, hs[2] * 0.6));
  const pos = new Float32Array(72), nrm = new Float32Array(72), uv = new Float32Array(48), dims = [w, h, d];
  const tu = tile ? tile[0] : 1, tv = tile ? tile[1] : 1;
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3; let ua = UA[a], va = VA[a];
    if (swap || (grain && dims[va] > dims[ua])) { const t = ua; ua = va; va = t; }
    for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) {
      const v = (a * 2 + s) * 4 + k, i = v * 3, sg = s ? 1 : -1;
      pos[i + a] = sg * hs[a]; pos[i + b] = (k & 1 ? 1 : -1) * (hs[b] - r); pos[i + c] = (k & 2 ? 1 : -1) * (hs[c] - r); nrm[i + a] = sg;
      uv[v * 2] = (pos[i + ua] + uvo[ua]) / tu; uv[v * 2 + 1] = (pos[i + va] + uvo[va]) / tv;
    }
  }
  return { pos, nrm, uv, idx: r > 0 ? BB.idx : BB.flat };
}

// three geometry -> raw arrays (uv scaled, or box-projected for tiling materials)
function rawOf(geo, tile, uvScale, boxUV, uvRect) {
  const pos = geo.attributes.position.array, n = pos.length / 3;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array, uv = new Float32Array(n * 2), src = geo.attributes.uv ? geo.attributes.uv.array : null;
  if (uvRect && src) { for (let i = 0; i < n; i++) { uv[i * 2] = uvRect[0] + src[i * 2] * (uvRect[2] - uvRect[0]); uv[i * 2 + 1] = uvRect[1] + src[i * 2 + 1] * (uvRect[3] - uvRect[1]); } }
  else if (tile && (boxUV || !src)) {
    for (let i = 0; i < n; i++) { const ax = Math.abs(nrm[i * 3]), ay = Math.abs(nrm[i * 3 + 1]), az = Math.abs(nrm[i * 3 + 2]); const a = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
      uv[i * 2] = pos[i * 3 + UA[a]] / tile[0]; uv[i * 2 + 1] = pos[i * 3 + VA[a]] / tile[1]; }
  } else if (src) { const su = tile && uvScale ? uvScale[0] / tile[0] : 1, sv = tile && uvScale ? uvScale[1] / tile[1] : 1; for (let i = 0; i < n; i++) { uv[i * 2] = src[i * 2] * su; uv[i * 2 + 1] = src[i * 2 + 1] * sv; } }
  let idx = geo.index ? geo.index.array : null;
  if (!idx) { idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
  return { pos, nrm, uv, idx };
}

export class Kit {
  constructor(id, opts = {}) {
    this.id = id; this.time = opts.time || 'day'; this.night = this.time === 'night'; this.dusk = this.time === 'dusk'; this.day = this.time === 'day';
    this.lampsOn = !this.day; this.rain = opts.weather === 'rain'; this.patient = opts.patient || 'floor';
    this.rng = makeRng((opts.seed ?? 1) * 7919 + id.length * 131 + id.charCodeAt(0));
    this.scene = new THREE.Scene(); this.scene.name = 'set:' + id;
    this.m = new THREE.Matrix4(); this.stack = []; this.buckets = new Map(); this.colliders = []; this.updates = []; this.owned = []; this.noAO = [];
    this.lights = []; this.shadowLights = 0; this.track = null; this.mirrors = []; this.tris = 0; this.H = 2.4; this.bounds = new THREE.Box3(); this.frames = {}; this.emits = new Map(); this.walls = null;
  }
  // ---- transform stack
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) { this.stack.push(this.m.clone()); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(s, s, s)); this.m.multiply(_m); return this; }
  pop() { this.m.copy(this.stack.pop()); return this; }
  at(x, y, z, ry, fn, rx = 0, rz = 0, s = 1) { this.push(x, y, z, ry, rx, rz, s); const r = fn(); this.pop(); return r; }
  // like at(), but records the world bounding box of everything built inside as a camera collider
  prop(x, y, z, ry, fn, { collide = true, pad = 0.04 } = {}) {
    const prev = this.track, box = this.track = new THREE.Box3(); this.push(x, y, z, ry); const r = fn(); this.pop(); this.track = prev;
    if (!box.isEmpty()) { if (collide) this.colliders.push(box.clone().expandByScalar(pad)); if (prev) prev.union(box); }
    return r;
  }
  // explicit camera collider: a w x h x d box with its base centre at local (x, y, z)
  collide(w, h, d, x = 0, y = 0, z = 0, pad = 0.03) { const b = new THREE.Box3(); for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) b.expandByPoint(_p.set(x + sx * w / 2, y + sy * h, z + sz * d / 2).applyMatrix4(this.m)); this.colliders.push(b.expandByScalar(pad)); }
  world(x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z).applyMatrix4(this.m); }
  // ---- core: add raw arrays under local transform o + current matrix
  put(mat, raw, o = {}) {
    const mm = _m.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1)).premultiply(this.m);
    const e = mm.elements, ne = _n3.getNormalMatrix(mm).elements, { pos, nrm } = raw, n = pos.length / 3, tr = this.track;
    for (let i = 0; i < n; i++) {
      const j = i * 3, x = pos[j], y = pos[j + 1], z = pos[j + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      pos[j] = wx; pos[j + 1] = wy; pos[j + 2] = wz;
      if (tr) { const a = tr.min, b = tr.max; if (wx < a.x) a.x = wx; if (wy < a.y) a.y = wy; if (wz < a.z) a.z = wz; if (wx > b.x) b.x = wx; if (wy > b.y) b.y = wy; if (wz > b.z) b.z = wz; }
      const nx = nrm[j], ny = nrm[j + 1], nz = nrm[j + 2];
      let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz, oy = ne[1] * nx + ne[4] * ny + ne[7] * nz, oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(ox, oy, oz) || 1; nrm[j] = ox / l; nrm[j + 1] = oy / l; nrm[j + 2] = oz / l;
    }
    let b = this.buckets.get(mat); if (!b) this.buckets.set(mat, b = { parts: [], nv: 0, ni: 0 });
    b.parts.push({ pos, nrm, uv: raw.uv, idx: raw.idx, col: lin(o.col) }); b.nv += n; b.ni += raw.idx.length;
  }
  jit() { return [this.rng() * 3, this.rng() * 3, this.rng() * 3]; }
  // ---- primitives
  box(mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const t = mat.userData.tile, raw = bevelBox(w, h, d, o.r ?? 0.004, t, mat.userData.grain && !o.noGrain, o.uvo || (t ? this.jit() : ZERO), o.swap);
    this.put(mat, raw, { ...o, x, y: o.c ? y : y + h / 2, z });
  }
  // soft rounded box (cushions, mattresses). o: r radius, seg, puff (bulge of the big faces), wrinkle (noise amplitude)
  rbox(mat, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const r = Math.min(o.r ?? 0.04, w * 0.49, h * 0.49, d * 0.49); let g = new RoundedBoxGeometry(w, h, d, o.seg ?? 3, r);
    if (o.puff || o.wrinkle) {
      if (o.wrinkle) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4); }
      const p = g.attributes.position.array, sd = this.rng() * 50, pf = o.puff || 0, wk = o.wrinkle || 0, wf = o.wfreq || 5;
      const dm = [w, h, d], ta = w <= h && w <= d ? 0 : h <= d ? 1 : 2, a1 = (ta + 1) % 3, a2 = (ta + 2) % 3; // puff bulges the two big faces
      for (let i = 0; i < p.length; i += 3) {
        const px = p[i], py = p[i + 1], pz = p[i + 2];
        if (pf) p[i + ta] += Math.sign(p[i + ta]) * pf * Math.max(0, 1 - (2 * p[i + a1] / dm[a1]) ** 2) * Math.max(0, 1 - (2 * p[i + a2] / dm[a2]) ** 2);
        if (wk) { const nn = fbm3(px * wf + sd, py * wf, pz * wf + sd, 3) - 0.5; p[i + 1] += nn * wk * 2 * (py > 0 ? 1 : 0.2); p[i] += (fbm3(px * wf, py * wf + sd, pz * wf, 2) - 0.5) * wk * (Math.abs(px) > w * 0.4 ? 1 : 0); }
      }
      if (o.wrinkle) g.computeVertexNormals();
    }
    this.put(mat, rawOf(g, mat.userData.tile, null, true), { ...o, x, y: o.c ? y : y + h / 2, z });
  }
  cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16, 1, !!o.open, o.t0 ?? 0, o.tl ?? TAU);
    this.put(mat, rawOf(g, mat.userData.tile, [TAU * Math.max(rt, rb), h], false, o.uv), { ...o, x, y: o.c ? y : y + h / 2, z });
  }
  // sphere: (x, y, z) is the centre
  sph(mat, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg ?? 16, o.seg2 ?? 12, 0, TAU, o.p0 ?? 0, o.pl ?? Math.PI);
    this.put(mat, rawOf(g, mat.userData.tile, [TAU * r, Math.PI * r], false, o.uv), { ...o, x, y, z });
  }
  torus(mat, R, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.TorusGeometry(R, r, o.rs ?? 8, o.seg ?? 20, o.arc ?? TAU);
    this.put(mat, rawOf(g, mat.userData.tile, [TAU * R, TAU * r]), { ...o, x, y, z });
  }
  // lathe: profile [[radius, height], ...] from the bottom up; base at y
  lathe(mat, pts, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1])), o.seg ?? 20);
    let R = 0, Hh = 0; for (const p of pts) { R = Math.max(R, p[0]); Hh = Math.max(Hh, p[1]); }
    this.put(mat, rawOf(g, mat.userData.tile, [TAU * R, Hh]), { ...o, x, y, z });
  }
  // tube through points [[x,y,z],...] in local space
  tube(mat, pts, rad, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed, 'catmullrom', o.tension ?? 0.12);
    const g = new THREE.TubeGeometry(curve, o.seg ?? Math.max(8, pts.length * 6), rad, o.rs ?? 7, !!o.closed);
    this.put(mat, rawOf(g, mat.userData.tile, [1, TAU * rad]), o);
    if (o.caps !== false && !o.closed) { const a = pts[0], b = pts[pts.length - 1]; this.sph(mat, rad, a[0], a[1], a[2], { seg: 8, seg2: 6, col: o.col }); this.sph(mat, rad, b[0], b[1], b[2], { seg: 8, seg2: 6, col: o.col }); }
  }
  // quad centred at (x, y, z) facing local +Z (or +Y with o.up). o.uv = atlas rect
  plane(mat, w, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, o.segW ?? 1, o.segH ?? 1); if (o.up) g.rotateX(-Math.PI / 2);
    this.put(mat, rawOf(g, mat.userData.tile, [w, h], false, o.uv), { ...o, x, y, z });
  }
  // extruded outline [[x,y],...] (in local XY), depth along Z centred
  extr(mat, pts, depth, x = 0, y = 0, z = 0, o = {}) {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel || 0, bevelThickness: o.bevel || 0, bevelSegments: o.bevelSeg ?? 2, steps: 1, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    this.put(mat, rawOf(g, mat.userData.tile || [1, 1], null, true), { ...o, x, y, z });
  }
  // cloth strip draped along a profile [[y, z], ...] in local YZ, `width` along X (use a double-sided material)
  drape(mat, prof, width, x = 0, y = 0, z = 0, o = {}) {
    const curve = new THREE.CatmullRomCurve3(prof.map(p => new THREE.Vector3(0, p[0], p[1])), false, 'catmullrom', 0.5), segs = o.seg ?? 18, sw = o.segW ?? 5;
    const g = new THREE.PlaneGeometry(width, 1, sw, segs), p = g.attributes.position.array, sd = this.rng() * 40, wk = o.wrinkle ?? 0.012, len = curve.getLength();
    for (let i = 0; i < p.length; i += 3) { const v = 0.5 - p[i + 1], u = p[i] / width, pt = curve.getPointAt(Math.min(1, Math.max(0, v))); const nn = fbm3(u * 6 + sd, v * len * 8, sd, 2) - 0.5, n2 = fbm3(u * 3, v * len * 5 + sd, 7, 2) - 0.5;
      p[i] = u * width * (1 + n2 * 0.08) + n2 * wk; p[i + 1] = pt.y + nn * wk * 0.6; p[i + 2] = pt.z + nn * wk + Math.abs(u) * (o.flare ?? 0) ; }
    g.computeVertexNormals(); this.put(mat, rawOf(g, mat.userData.tile, [width, len]), { ...o, x, y, z });
  }
  geo(mat, g, o = {}) { this.put(mat, rawOf(g, mat.userData.tile, o.uvScale, o.boxUV, o.uv), o); }
  // floor decal from the stain atlas
  stain(kind, w, d, x, z, o = {}) { this.plane(M.stain, w, d, x, (o.y || 0) + 0.003 + this.rng() * 0.002, z, { up: true, uv: STAIN[kind], ry: o.ry ?? this.rng() * TAU, col: o.col }); }
  // standalone object (animated things) under the current transform
  mesh(obj) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(this.m); g.add(obj); this.scene.add(g); return obj; }
  own(x) { this.owned.push(x); return x; }
  // per-set emissive material (cached by key)
  emit(col, k, o = {}) {
    const key = col + '|' + k + '|' + (o.key || '') + (o.map ? o.map.uuid : '');
    let m = this.emits.get(key);
    if (!m) { m = this.own(new THREE.MeshStandardMaterial({ color: o.base ?? 0x000000, emissive: col, emissiveIntensity: k, roughness: o.rough ?? 0.5, emissiveMap: o.map || null, map: o.albedo || null, side: o.double ? THREE.DoubleSide : THREE.FrontSide, vertexColors: false }));
      m.userData.noShadow = !o.shadow; if (o.tile) m.userData.tile = [o.tile, o.tile]; this.emits.set(key, m); }
    return m;
  }
  // screen material: emissive from the screens atlas (k = brightness, 0 = dark glass)
  screen(k, key = '') { return k > 0 ? this.emit(0xffffff, k, { map: ATLAS.screens.tex, key: 'scr' + key, rough: 0.2 }) : M.darkGlass; }
  on(fn) { this.updates.push(fn); }

  // ---- shell
  wall(ax, az, bx, bz, o = {}) {
    const { h = this.H, y0 = 0, t = 0.16, side = 1, col = C.white, mat = M.plaster, holes = [], skirt = 0.1, skirtCol = C.white, dado = null, ext = 0, skirtBoth = false } = o;
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), zc = side ? -t / 2 : 0;
    this.push(ax, 0, az, ry);
    const hs = [...holes].sort((a, b) => a.u0 - b.u0);
    const slab = (u0, u1, ya, yb, m, c) => this.box(m, u1 - u0, yb - ya, t, (u0 + u1) / 2, ya, zc, { r: 0, col: c, uvo: [(u0 + u1) / 2, (ya + yb) / 2, 0] });
    const piece = (u0, u1, ya, yb) => {
      if (u1 - u0 < 1e-4 || yb - ya < 1e-4) return;
      if (dado && ya < dado.h - 1e-4 && yb > dado.h + 1e-4) { slab(u0, u1, ya, dado.h, dado.mat || mat, dado.col ?? col); slab(u0, u1, dado.h, yb, mat, col); }
      else if (dado && yb <= dado.h + 1e-4) slab(u0, u1, ya, yb, dado.mat || mat, dado.col ?? col);
      else slab(u0, u1, ya, yb, mat, col);
    };
    let u = -ext;
    for (const hh of hs) { piece(u, hh.u0, y0, h); piece(hh.u0, hh.u1, y0, hh.y0); piece(hh.u0, hh.u1, hh.y1, h); u = hh.u1; }
    piece(u, len + ext, y0, h);
    if (skirt) { // skirting between door openings
      let s0 = 0; const segs = []; for (const hh of hs) if (hh.y0 <= y0 + 0.01) { segs.push([s0, hh.u0 - (hh.trim ?? 0.07)]); s0 = hh.u1 + (hh.trim ?? 0.07); } segs.push([s0, len]);
      for (const [a, b] of segs) if (b - a > 0.02) { this.box(M.satin, b - a, skirt, 0.016, (a + b) / 2, y0, (side ? 0 : t / 2) + 0.008, { r: 0.005, col: skirtCol }); if (skirtBoth) this.box(M.satin, b - a, skirt, 0.016, (a + b) / 2, y0, -t / 2 - 0.008, { r: 0.005, col: skirtCol }); }
    }
    if (dado && dado.rail) this.box(M.satin, len, 0.045, 0.02, len / 2, dado.h - 0.02, 0.01, { r: 0.008, col: dado.railCol ?? skirtCol });
    this.pop();
  }
  // Rectangular room centred on the origin, floor at y=0. Walls: N (z=-d/2), S (z=+d/2), W (x=-w/2), E (x=+w/2).
  // openings: [{ id, wall, at (world x for N/S, world z for E/W), w, y0, y1 }] -> this.frames[id] for window()/door().
  room(o) {
    const { w, d, h = 2.4, t = 0.16, wallCol = C.white, wallMat = M.plaster, floorMat = M.planks, floorCol, ceilCol = C.white, ceilMat = M.plaster, skirt = 0.1, skirtCol = C.white, dado = null, openings = [], floorSwap = false, walls = {} } = o;
    this.H = h; this.W = w; this.D = d; this.T = t; this.bounds.set(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
    const def = { N: [-w / 2, -d / 2, w / 2, -d / 2], S: [w / 2, d / 2, -w / 2, d / 2], E: [w / 2, -d / 2, w / 2, d / 2], W: [-w / 2, d / 2, -w / 2, -d / 2] };
    this.walls = { w, d, t };
    for (const k of 'NSEW') {
      const holes = [];
      for (const op of openings) if (op.wall === k) {
        const u = k === 'N' ? op.at + w / 2 : k === 'S' ? w / 2 - op.at : k === 'E' ? op.at + d / 2 : d / 2 - op.at;
        holes.push({ u0: u - op.w / 2, u1: u + op.w / 2, y0: op.y0 ?? 0, y1: op.y1 ?? 2.03, trim: op.trim });
        this.frames[op.id] = { ...this.wallFrame(k, op.at), w: op.w, y0: op.y0 ?? 0, y1: op.y1 ?? 2.03, t, wall: k };
      }
      const wo = walls[k] || {};
      if (wo.skip) continue;
      this.wall(...def[k], { h, t, col: wo.col ?? wallCol, mat: wo.mat ?? wallMat, holes, skirt: wo.skirt ?? skirt, skirtCol, dado: wo.dado === undefined ? dado : wo.dado, ext: t });
    }
    this.box(floorMat, w + 2 * t, 0.12, d + 2 * t, 0, -0.12, 0, { r: 0, col: floorCol, uvo: ZERO, swap: floorSwap });
    if (!o.noCeil) this.box(ceilMat, w + 2 * t, 0.12, d + 2 * t, 0, h, 0, { r: 0, col: ceilCol, uvo: ZERO });
    return this.frames;
  }
  wallFrame(k, at) { const { w, d } = this.walls; return k === 'N' ? { x: at, z: -d / 2, ry: 0 } : k === 'S' ? { x: at, z: d / 2, ry: Math.PI } : k === 'E' ? { x: w / 2, z: at, ry: -Math.PI / 2 } : { x: -w / 2, z: at, ry: Math.PI / 2 }; }
  // run fn in a wall's frame: local +Z into the room, +X along the wall, y world
  onWall(k, at, fn) { const f = this.wallFrame(k, at); return this.at(f.x, 0, f.z, f.ry, fn); }

  // ---- window dressing for an opening frame
  window(f, o = {}) {
    const { frameCol = C.white, cols = 2, rows = 1, sill = true, glass = true, backdrop = this.extKind(), dist = 9, bright = 1 } = o;
    this.at(f.x, 0, f.z, f.ry, () => {
      const w = f.w, y0 = f.y0, y1 = f.y1, h = y1 - y0, t = f.t, fw = 0.045, fd = 0.07, zc = -t * 0.6;
      const fm = o.frameMat || M.satin;
      this.box(fm, w, fw, fd, 0, y0, zc, { col: frameCol }); this.box(fm, w, fw, fd, 0, y1 - fw, zc, { col: frameCol });
      this.box(fm, fw, h, fd, -w / 2 + fw / 2, y0, zc, { col: frameCol }); this.box(fm, fw, h, fd, w / 2 - fw / 2, y0, zc, { col: frameCol });
      for (let i = 1; i < cols; i++) this.box(fm, fw * 0.9, h - fw * 2, fd * 0.8, -w / 2 + i * w / cols, y0 + fw, zc, { col: frameCol });
      for (let i = 1; i < rows; i++) this.box(fm, w - fw * 2, fw * 0.9, fd * 0.8, 0, y0 + i * h / rows - fw * 0.45, zc, { col: frameCol });
      // reveal lining so the plaster edge looks finished, and the sill board
      if (sill) this.box(M.satin, w + 0.1, 0.028, t * 0.6 + 0.05, 0, y0 - 0.028, -t * 0.3 + 0.025, { r: 0.008, col: o.sillCol ?? frameCol });
      if (glass) this.plane(M.glass, w - fw * 2, h - fw * 2, 0, y0 + h / 2, zc, {});
      if (backdrop) {
        const bm = this.backdropMat(backdrop, bright), Wp = 34, Hp = 17, off = (this.rng() - 0.5) * 6;
        this.plane(bm, Wp, Hp, off, 1.5 - 0.42 * Hp + Hp / 2, -t - dist, {});
      }
      if (this.rain && glass) this.plane(this.rainMat(), w - fw * 2, h - fw * 2, 0, y0 + h / 2, zc - 0.006, { uv: [0, 0, w - fw * 2, h - fw * 2] });
      if (o.curtain) this.curtains(w, y0, y1, o.curtain);
      if (o.blind) this.blind(w, y0, y1, t, o.blind);
      if (o.net) { const nm = this.curtainMat(0xf4f2ea, this.day ? 0.5 : this.dusk ? 0.2 : 0.03, 0.55); this.geo(nm, curtainGeo(w - 0.06, h - 0.05, Math.round(w * 9), 0.012, this.rng), { x: 0, y: y0 + h / 2, z: -t * 0.25, uvScale: [w * 1.6, h] }); }
    });
  }
  extKind() { return this.night ? 'night' : this.dusk ? 'dusk' : this.rain ? 'rain' : 'day'; }
  backdropMat(kind, bright = 1) {
    const key = 'bd' + kind + bright; let m = this.emits.get(key);
    if (!m) { const k = (/night|carpark|Night/.test(kind) ? 1.5 : kind === 'dusk' ? 1.5 : kind === 'rain' ? 2.4 : 3.6) * bright;
      m = this.own(new THREE.MeshBasicMaterial({ map: backdropTex(kind), color: new THREE.Color(k, k, k), fog: false })); m.userData.noShadow = true; m.userData.noRecv = true; this.emits.set(key, m); }
    return m;
  }
  rainMat() {
    let m = this.emits.get('rain');
    if (!m) {
      m = this.own(new THREE.ShaderMaterial({
        uniforms: { uTime: U.uTime, uCol: { value: this.night ? new THREE.Color(0.5, 0.42, 0.3) : new THREE.Color(2.2, 2.3, 2.4) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vP; void main(){ vP=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `varying vec2 vP; uniform float uTime; uniform vec3 uCol;
          float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
          void main(){ float a=0.0; float hi=0.0;
            for(int L=0;L<2;L++){ float sc=L==0?34.0:57.0; vec2 q=vP*vec2(sc,sc*0.22); float cx=floor(q.x); float r=h21(vec2(cx,float(L)*7.0+1.0));
              float yy=q.y+uTime*(0.12+r*0.45)+r*17.0; float cy=floor(yy), fy=fract(yy); float r2=h21(vec2(cx,cy)+3.1);
              float fx=fract(q.x)-0.5+(r2-0.5)*0.4+sin(yy*9.0+r*6.0)*0.04; float on=step(0.62,r2);
              float head=smoothstep(0.2,0.05,length(vec2(fx,(fy-0.14)*0.45)));
              float trail=smoothstep(0.07,0.0,abs(fx))*smoothstep(0.14,0.2,fy)*(1.0-fy);
              a+=on*(head*0.75+trail*0.3); hi+=on*head*smoothstep(0.0,0.12,fx+0.05); }
            vec2 g=vP*150.0; vec2 id=floor(g); float r3=h21(id); vec2 f=fract(g)-0.5+(vec2(h21(id+1.7),h21(id+5.3))-0.5)*0.5;
            float d=smoothstep(0.26*r3,0.1*r3,length(f))*step(0.72,r3); a+=d*0.55; hi+=d*smoothstep(-0.1,0.2,f.y)*0.6;
            a=clamp(a,0.0,1.0);
            vec3 c=mix(uCol*0.12,uCol,clamp(hi,0.0,1.0)); gl_FragColor=vec4(c,a*0.6+0.035); }`,
      }));
      m.userData.noShadow = true; m.userData.noAO = true; m.userData.order = 4; this.emits.set('rain', m);
    }
    return m;
  }
  // fabric with a set colour and a back-lit glow (day curtains over a window)
  curtainMat(col, glow = 0, opacity = 1) {
    const key = 'cur' + col + '|' + glow + '|' + opacity; let m = this.emits.get(key);
    if (!m) { const b = M.curtain; m = this.own(new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, normalScale: b.normalScale, roughness: 0.95, color: col, emissive: col, emissiveIntensity: glow, emissiveMap: b.map, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
      m.userData.tile = [0.25, 0.25]; if (opacity < 1) { m.userData.noAO = true; m.userData.order = 3; m.userData.noShadow = opacity < 0.5; } this.emits.set(key, m); }
    return m;
  }
  // c: { col, open 0..1 (1 = fully drawn back), len: 'floor' | 'sill', glow, pole: colour, pelmet }
  curtains(w, y0, y1, c) {
    const open = c.open ?? 0.8, top = y1 + 0.14, bot = c.len === 'sill' ? y0 - 0.15 : 0.02, hh = top - bot, z = 0.075, half = w / 2 + 0.2;
    const glow = c.glow ?? (this.day ? 0.22 : this.dusk ? 0.08 : 0) * (1 - open * 0.3), mat = this.curtainMat(c.col ?? 0x8a6a4a, glow);
    const pw = Math.max(0.16, half * (1 - open * 0.84));
    for (const s of [-1, 1]) this.geo(mat, curtainGeo(pw, hh, Math.max(3, Math.round(4 + half * 5 * (0.5 + open * 0.5))), 0.03 + open * 0.02, this.rng), { x: s * (half - pw / 2), y: bot + hh / 2, z, uvScale: [half * 1.6, hh] });
    if (c.pelmet) this.box(M.fabric, w + 0.5, 0.22, 0.14, 0, top - 0.12, z, { r: 0.02, col: c.pelmet });
    else { this.cyl(M.metal, 0.012, 0.012, w + 0.6, 0, top + 0.01, z, { rz: Math.PI / 2, c: true, col: c.pole ?? 0x3a3a3a, seg: 8 }); for (const s of [-1, 1]) this.sph(M.metal, 0.022, s * (w / 2 + 0.3), top + 0.01, z, { col: c.pole ?? 0x3a3a3a, seg: 8, seg2: 6 }); }
  }
  // b: { kind: 'venetian' | 'roller', col, drop 0..1, tilt }
  blind(w, y0, y1, t, b) {
    const h = y1 - y0, drop = b.drop ?? 1, col = b.col ?? 0xe8e6e0, z = -t * 0.28, bw = w - 0.03;
    this.box(M.satin, bw, 0.035, 0.04, 0, y1 - 0.04, z, { col, r: 0.004 });
    if (b.kind === 'roller') { const mat = this.curtainMat(col, this.day ? 0.3 : this.dusk ? 0.1 : 0); this.plane(mat, bw - 0.02, h * drop, 0, y1 - 0.04 - h * drop / 2, z, {}); this.cyl(M.satin, 0.012, 0.012, bw - 0.02, 0, y1 - 0.04 - h * drop, z, { rz: Math.PI / 2, c: true, col, seg: 8 }); return; }
    const pitch = 0.024, n = Math.floor(h * drop / pitch), tilt = b.tilt ?? 0.55;
    for (let i = 0; i < n; i++) this.box(M.satin, bw, 0.0015, 0.025, 0, y1 - 0.05 - i * pitch, z, { r: 0, rx: tilt, c: true, col });
    this.box(M.satin, bw, 0.018, 0.028, 0, y1 - 0.06 - n * pitch, z, { col, r: 0.004 });
    for (const s of [-1, 1]) this.cyl(M.matte, 0.0012, 0.0012, n * pitch, s * bw * 0.36, y1 - 0.05 - n * pitch, z + 0.013, { col: 0xdddddd, seg: 4 });
  }
  // ---- door for an opening frame. o: { open (rad), hinge -1|1, swing 1 into room | -1, col, frameCol, style: 'panel'|'flush'|'glazed', metal, beyond: {...}|false, leaf: false for an open arch }
  door(f, o = {}) {
    const { open = 0, hinge = -1, swing = 1, col = C.white, frameCol = C.white, style = 'panel', metal = M.chrome, leaf = true, mat = M.satin } = o;
    this.at(f.x, 0, f.z, f.ry, () => {
      const w = f.w, h = f.y1, t = f.t, aw = 0.065;
      for (const s of [-1, 1]) { this.box(M.satin, 0.022, h, t + 0.004, s * (w / 2 - 0.011), 0, -t / 2, { col: frameCol, r: 0.003 }); this.box(M.satin, aw, h + aw, 0.018, s * (w / 2 + aw / 2 - 0.012), 0, 0.009, { col: frameCol, r: 0.006 }); }
      this.box(M.satin, w, 0.022, t + 0.004, 0, h - 0.022, -t / 2, { col: frameCol, r: 0.003 }); this.box(M.satin, w + aw * 2 - 0.024, aw, 0.018, 0, h - 0.012, 0.009, { col: frameCol, r: 0.006 });
      if (leaf) {
        const lw = w - 0.05, lh = h - 0.03, lt = 0.04, zc = swing > 0 ? -lt / 2 - 0.004 : -t + lt / 2 + 0.004;
        this.push(hinge * (w / 2 - 0.024), 0, zc, hinge * open * swing);
        const cx = -hinge * lw / 2;
        this.box(mat, lw, lh, lt, cx, 0.006, 0, { col, r: 0.004, noGrain: false });
        if (style === 'panel') { const pw = (lw - 0.3) / 2; for (const sz of [-1, 1]) for (const sx of [-1, 1]) { this.box(mat, pw, 0.62, 0.008, cx + sx * (pw / 2 + 0.05), 0.2, sz * (lt / 2 + 0.002), { col, r: 0.006 }); this.box(mat, pw, lh - 1.12, 0.008, cx + sx * (pw / 2 + 0.05), 0.98, sz * (lt / 2 + 0.002), { col, r: 0.006 }); } }
        else if (style === 'glazed') { for (const sz of [-1, 1]) this.box(M.darkGlass, lw * 0.26, 0.7, 0.004, cx - hinge * lw * 0.2, 1.05, sz * (lt / 2 + 0.001), { r: 0.001 }); }
        if (o.kick) for (const sz of [-1, 1]) this.box(M.steel, lw - 0.02, 0.22, 0.003, cx, 0.03, sz * (lt / 2 + 0.001), { r: 0.001 });
        if (o.sign) this.plane(M.signs, o.sign.w, o.sign.h, cx, o.sign.y ?? 1.55, (o.sign.back ? -1 : 1) * (lt / 2 + 0.004), { uv: ATLAS.signs.rect[o.sign.id], ry: o.sign.back ? Math.PI : 0 });
        const hx = cx - hinge * (lw / 2 - 0.065);
        for (const sz of [-1, 1]) {
          if (o.handle === 'knob') { this.cyl(metal, 0.012, 0.014, 0.03, hx, 1.0, sz * (lt / 2 + 0.015), { rx: Math.PI / 2, c: true, seg: 10 }); this.sph(metal, 0.028, hx, 1.0, sz * (lt / 2 + 0.045), { seg: 12, seg2: 8, sz: 0.75 }); }
          else if (o.handle === 'bar') { this.cyl(metal, 0.014, 0.014, 0.4, hx, 0.95, sz * (lt / 2 + 0.05), { seg: 10 }); for (const yy of [1.0, 1.3]) this.cyl(metal, 0.008, 0.008, 0.05, hx, yy, sz * (lt / 2 + 0.025), { rx: Math.PI / 2, c: true, seg: 8 }); }
          else { this.cyl(metal, 0.026, 0.026, 0.008, hx, 1.0, sz * (lt / 2 + 0.004), { rx: Math.PI / 2, c: true, seg: 14 }); this.cyl(metal, 0.009, 0.009, 0.045, hx, 1.0, sz * (lt / 2 + 0.026), { rx: Math.PI / 2, c: true, seg: 8 }); this.box(metal, 0.115, 0.018, 0.016, hx + hinge * 0.045, 0.991, sz * (lt / 2 + 0.048), { r: 0.006 }); }
        }
        this.pop();
      }
      const by = o.beyond ?? (open > 0.05 || !leaf);
      if (by) {
        const b = by === true ? {} : by, bd = b.depth ?? 1.5, bw = b.w ?? w + 0.7, bc = b.col ?? C.offWhite, bh = b.h ?? this.H, ox = b.off ?? 0;
        this.box(b.floorMat ?? M.carpet, bw, 0.1, bd, ox, -0.1, -t - bd / 2, { r: 0, col: b.floorCol ?? 0x8a7a66 });
        this.box(M.plaster, bw, 0.1, bd, ox, bh, -t - bd / 2, { r: 0, col: C.white });
        this.box(M.plaster, bw + 0.2, bh, 0.1, ox, 0, -t - bd - 0.05, { r: 0, col: bc });
        for (const s of [-1, 1]) this.box(M.plaster, 0.1, bh, bd, ox + s * (bw / 2 + 0.05), 0, -t - bd / 2, { r: 0, col: bc });
        this.box(M.satin, bw, 0.1, 0.016, ox, 0, -t - bd + 0.008, { col: C.white, r: 0.005 });
        if (b.pic) this.at(ox, 0, -t - bd, 0, () => b.pic());
        if (b.glow) { this.cyl(this.emit(b.glowCol ?? 0xffd9a0, b.glow), 0.12, 0.14, 0.05, ox, bh - 0.05, -t - bd * 0.5, { seg: 16 }); }
      }
    });
  }
  switchPlate(wall, at, y = 1.2, gang = 1) { this.onWall(wall, at, () => { this.box(M.plastic, 0.086 * (gang > 1 ? 1.7 : 1), 0.086, 0.009, 0, y, 0.0045, { r: 0.004, col: 0xf0f0ec }); for (let i = 0; i < gang; i++) this.box(M.plastic, 0.022, 0.036, 0.006, (i - (gang - 1) / 2) * 0.05, y + 0.025, 0.011, { r: 0.002, rx: 0.12, col: 0xf6f6f2 }); }); }
  socket(wall, at, y = 0.3, plug = false) { this.onWall(wall, at, () => { this.box(M.plastic, 0.146, 0.086, 0.009, 0, y, 0.0045, { r: 0.004, col: 0xf0f0ec }); for (const s of [-1, 1]) { this.box(M.plastic, 0.012, 0.018, 0.004, s * 0.055, y + 0.058, 0.01, { r: 0.001, col: 0xf8f8f4 }); this.box(M.matte, 0.022, 0.006, 0.002, s * 0.03, y + 0.03, 0.0092, { r: 0, col: 0x222222 }); }
    if (plug) { this.box(M.plastic, 0.045, 0.045, 0.03, -0.03, y + 0.015, 0.024, { r: 0.006, col: 0x1a1a1a }); this.tube(M.rubberBlack, [[-0.03, y + 0.015, 0.03], [-0.03, y - 0.1, 0.035], [0.02, 0.012, 0.05], [0.25, 0.008, 0.09]], 0.004, { rs: 5, seg: 14 }); } }); }

  // ---- lights (keep <= 7 real lights, <= 2 shadow casters)
  hemi(sky, gnd, int) { const l = new THREE.HemisphereLight(sky, gnd, int); this.scene.add(l); this.hemiL = l; return l; }
  // sun/sky key from outside: az degrees (0 = from +Z, 90 = from +X), el degrees above horizon
  sun(az, el, col, int, o = {}) {
    const l = new THREE.DirectionalLight(col, int), a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el), b = this.bounds, c = b.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)), R = (o.range ?? b.getSize(_p).length() * 0.5 + 1.5);
    l.position.copy(c).addScaledVector(dir, R + 6); l.target.position.copy(c); this.scene.add(l, l.target);
    if (o.shadow !== false && this.shadowLights < 2) { l.castShadow = true; const s = l.shadow, k = s.camera; k.left = -R; k.right = R; k.top = R; k.bottom = -R; k.near = 1; k.far = R * 2 + 12; s.mapSize.set(o.map ?? 2048, o.map ?? 2048); s.bias = -0.0004; s.normalBias = 0.02; s.radius = o.soft ?? 2.5; this.shadowLights++; }
    this.lights.push(l); return l;
  }
  spot(x, y, z, tx, ty, tz, o = {}) {
    const l = new THREE.SpotLight(o.col ?? 0xffffff, o.int ?? 10, o.dist ?? 0, o.angle ?? 1.0, o.pen ?? 0.7, o.decay ?? 2);
    const p = this.world(x, y, z), t = this.world(tx, ty, tz); l.position.copy(p); l.target.position.copy(t); this.scene.add(l, l.target);
    if (o.shadow && this.shadowLights < 2) { l.castShadow = true; const s = l.shadow; s.mapSize.set(o.map ?? 2048, o.map ?? 2048); s.camera.near = o.near ?? 0.15; s.camera.far = o.far ?? 14; s.bias = -0.0006; s.normalBias = 0.015; s.radius = o.soft ?? 3; this.shadowLights++; }
    this.lights.push(l); return l;
  }
  point(x, y, z, o = {}) { const l = new THREE.PointLight(o.col ?? 0xffffff, o.int ?? 4, o.dist ?? 0, o.decay ?? 2); l.position.copy(this.world(x, y, z)); this.scene.add(l); this.lights.push(l); return l; }
  // planar mirror: a real Reflector at high quality, a polished panel otherwise
  mirror(w, h, x, y, z, o = {}) {
    if (!G.q.ao || o.cheap) return this.plane(M.mirror, w, h, x, y, z, o);
    const r = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: o.res ?? 1024, textureHeight: Math.round((o.res ?? 1024) * Math.min(1, h / w * 1.2)), color: o.tint ?? 0xd8dedc, multisample: 2, clipBias: 0.003 });
    r.position.set(x, y, z); r.rotation.y = o.ry || 0; this.mesh(r); this.mirrors.push(r); this.noAO.push(r); this.own(r.material); this.own({ dispose: () => { r.getRenderTarget().dispose(); r.geometry.dispose(); } });
    return r;
  }

  // ---- spots. spec: { floor: [x, z, ry], seat: [x, y, z, ry], bed: [x, y, z, ry] (sitting on the bed edge, facing +Z of the spot),
  //   side: +1|-1 camera side, by: [[x,z],...], cam/target/partner/kit: floor-mode overrides, seatView / bedView: { cam, target, partner, kit } }
  spots(spec) {
    const mode = spec[this.patient] ? this.patient : 'floor', s = spec[mode], side = spec.side ?? 1;
    const mk = (x, y, z, ry = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); o.updateMatrixWorld(); return o; };
    let ps, loc, cam, tgt, partner, kit, seatHeight = 0;
    if (mode === 'floor') { ps = mk(s[0], 0, s[1], s[2]); loc = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(ps.matrixWorld); cam = loc(side * 1.5, 1.25, 0.85); tgt = loc(0, 0.2, -0.3); partner = loc(-side * 0.62, 0, -0.35); kit = loc(side * 0.78, 0, -0.8); }
    else if (mode === 'seat' || mode === 'bed') { ps = mk(s[0], s[1], s[2], s[3]); seatHeight = s[1]; loc = (x, y, z) => new THREE.Vector3(x, y - s[1], z).applyMatrix4(ps.matrixWorld); cam = loc(side * 1.0, 1.25, 1.65); tgt = loc(0, s[1] + 0.3, 0); partner = loc(-side * 0.7, 0, 0.62); kit = loc(side * 0.72, 0, 0.8); }
    const ov = spec[mode + 'View'] || (mode === 'floor' ? spec : null); // per-mode overrides: floorView / seatView / bedView = { cam, target, partner, kit }
    if (ov && ov.cam) cam.set(...ov.cam); if (ov && ov.target) tgt.set(...ov.target);
    if (ov && ov !== spec) { if (ov.partner) partner.set(...ov.partner); if (ov.kit) kit.set(...ov.kit); }
    const face = (v) => { const o = mk(v.x, v.y, v.z); o.rotation.y = Math.atan2(ps.position.x - v.x, ps.position.z - v.z); o.updateMatrixWorld(); return o; };
    if (ov && ov === spec) { if (spec.partner) partner.set(...spec.partner); if (spec.kit) kit.set(...spec.kit); }
    this.spot_ = { mode, patientSpot: ps, seatHeight, kitSpot: face(kit), partnerSpot: face(partner), bystanderSpots: (spec.by || []).map(b => face(new THREE.Vector3(b[0], 0, b[1]))), cameraHome: { pos: cam, target: tgt } };
    return this.spot_;
  }

  // ---- finish: merge buckets, render the environment from the room, return the Set
  async finish(spec = {}) {
    const scene = this.scene; let meshes = 0;
    for (const [mat, b] of this.buckets) {
      const pos = new Float32Array(b.nv * 3), nrm = new Float32Array(b.nv * 3), uv = new Float32Array(b.nv * 2), col = new Float32Array(b.nv * 3), idx = b.nv > 65535 ? new Uint32Array(b.ni) : new Uint16Array(b.ni);
      let vo = 0, io = 0;
      for (const p of b.parts) { pos.set(p.pos, vo * 3); nrm.set(p.nrm, vo * 3); uv.set(p.uv, vo * 2); const n = p.pos.length / 3, c = p.col; for (let i = 0; i < n; i++) { const j = (vo + i) * 3; col[j] = c[0]; col[j + 1] = c[1]; col[j + 2] = c[2]; } const id = p.idx; for (let i = 0; i < id.length; i++) idx[io + i] = id[i] + vo; vo += n; io += id.length; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, mat); mesh.name = mat.name || 'bucket'; mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = !mat.userData.noShadow && !mat.userData.noRecv; if (mat.userData.order) mesh.renderOrder = mat.userData.order;
      if (mat.userData.noAO) this.noAO.push(mesh);
      scene.add(mesh); meshes++; this.tris += b.ni / 3;
    }
    this.buckets.clear();
    scene.background = new THREE.Color(spec.bg ?? 0x020203);
    if (spec.fog) scene.fog = new THREE.FogExp2(spec.fog[0], spec.fog[1]);
    // environment: render the lit room into a PMREM, twice so the second pass includes one bounce
    const envPos = new THREE.Vector3(...(spec.envPos || [0, Math.min(1.3, this.H * 0.5), 0]));
    for (const r of this.mirrors) r.visible = false;
    // compile off the main thread first (programs keyed for the HDR target the post chain and the env capture use)
    scene.environment = blankEnv(); scene.environmentIntensity = 0; let rt = null;
    try { const r = G.renderer, prev = r.getRenderTarget(); r.setRenderTarget(compileRT()); const pr = r.compileAsync(scene, compileCam); r.setRenderTarget(prev); await pr; } catch (e) { /* fall back to compiling on first draw */ }
    for (let pass = 0; pass < 2; pass++) { const n = G.pmrem.fromScene(scene, 0, 0.05, 80, { size: 256, position: envPos }); if (rt) rt.dispose(); rt = n; scene.environment = rt.texture; scene.environmentIntensity = spec.envInt ?? 1; }
    for (const r of this.mirrors) r.visible = true;
    for (const o of this.noAO) G.noAO.add(o);
    const sp = this.spot_ || this.spots({ floor: [0, 0, 0] }), updates = this.updates, noAO = this.noAO, owned = this.owned, b = this.bounds, self = this;
    const cb = spec.cameraBounds || new THREE.Box3(new THREE.Vector3(b.min.x + 0.22, 0.25, b.min.z + 0.22), new THREE.Vector3(b.max.x - 0.22, Math.min(b.max.y - 0.18, 2.6), b.max.z - 0.22));
    return {
      id: this.id, scene, exposure: spec.exposure ?? 1, bloom: spec.bloom ?? 0.2, ...sp, cameraBounds: cb, colliders: this.colliders, time: this.time,
      stats: { tris: Math.round(this.tris), meshes, lights: this.lights.length + (this.hemiL ? 1 : 0), shadowLights: this.shadowLights },
      update(dt, t) { for (const f of updates) f(dt, t); },
      dispose() {
        for (const o of noAO) G.noAO.delete(o);
        scene.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); if (o.isLight) o.dispose?.(); });
        for (const m of owned) m.dispose?.(); rt.dispose(); scene.environment = null; self.scene = null;
      },
    };
  }
}
const ZERO = [0, 0, 0];
let _blank = null, _crt = null; const compileCam = new THREE.PerspectiveCamera(50, 1.6, 0.05, 120);
function blankEnv() { if (!_blank) { const s = new THREE.Scene(); s.background = new THREE.Color(0x000000); _blank = G.pmrem.fromScene(s, 0, 0.1, 10, { size: 256 }).texture; _blank.userData.shared = true; } return _blank; }
function compileRT() { return _crt || (_crt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: G.q.msaa || 0 })); }

// gathered curtain panel: sine folds that tighten toward the top
export function curtainGeo(w, h, folds, amp, rng) {
  const g = new THREE.PlaneGeometry(w, h, folds * 6, 5), p = g.attributes.position.array, ph = rng() * 6, k2 = 0.6 + rng() * 0.5;
  for (let i = 0; i < p.length; i += 3) {
    const u = p[i] / w + 0.5, v = p[i + 1] / h + 0.5, a = amp * (0.75 + 0.35 * (1 - v));
    p[i + 2] = Math.sin(u * folds * TAU + ph) * a + Math.sin(u * folds * TAU * 0.37 * k2 + ph * 2) * a * 0.45 + Math.sin(v * 5 + u * 9) * 0.004;
    p[i] += Math.sin(u * folds * TAU * 0.5 + ph) * 0.01 * (1 - v);
  }
  g.computeVertexNormals(); return g;
}
