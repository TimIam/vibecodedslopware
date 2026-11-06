// A dough ball that becomes a pizza. The outline is a radial profile (radius per angle), so pounding
// off-centre makes it lopsided and spinning evens it out. Sauce and cheese are painted into masks
// in the pie's own frame; toppings are little meshes stuck to it. Baking recolours all of it.
import * as THREE from 'three';
import { clamp, lerp, smooth, canvas, tex, makeRng, wrapAng } from './util.js';
import { TOPPINGS } from './data.js';

export const N = 36;                 // profile samples round the edge
export const DOUGH_V = 0.00042;      // m^3: one ball
export const SPAN = 0.52;            // metres covered by the top texture
export const TEAR_T = 0.0029;        // thinner than this and it tears
const S = 256, G = 52;
const RINGS = [0, 0.18, 0.36, 0.54, 0.7, 0.8, 0.87, 0.92, 0.96, 0.985, 1];
const FLAT = [0.8, 0.8, 0.81, 0.83, 0.86, 0.95, 1.3, 1.62, 1.5, 1.05, 0.25];
const M_TO_IN = 1 / 0.0254;

// Shared topping geometry and base colours ------------------------------------------------
const GEO = {};
function geo(type) {
  if (GEO[type]) return GEO[type];
  let g;
  switch (type) {
    case 'pepperoni': g = new THREE.CylinderGeometry(0.0185, 0.0185, 0.003, 18); break;
    case 'sausage': g = new THREE.IcosahedronGeometry(0.0068, 0); g.scale(1, 0.6, 1); break;
    case 'mushroom': {
      const sh = new THREE.Shape(); sh.moveTo(-0.013, 0); sh.quadraticCurveTo(-0.013, 0.014, 0, 0.014); sh.quadraticCurveTo(0.013, 0.014, 0.013, 0);
      sh.lineTo(0.004, 0); sh.lineTo(0.0045, -0.01); sh.lineTo(-0.0045, -0.01); sh.lineTo(-0.004, 0); sh.closePath();
      g = new THREE.ExtrudeGeometry(sh, { depth: 0.0025, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); break;
    }
    case 'pepper': g = new THREE.TorusGeometry(0.012, 0.0024, 4, 10, 2.5); g.rotateX(Math.PI / 2); break;
    case 'onion': g = new THREE.TorusGeometry(0.0135, 0.0017, 4, 12, 2.8); g.rotateX(Math.PI / 2); break;
    case 'olive': g = new THREE.TorusGeometry(0.0056, 0.0029, 6, 14); g.rotateX(Math.PI / 2); break;
    case 'pineapple': g = new THREE.BoxGeometry(0.015, 0.0065, 0.011); break;
    case 'basil': g = new THREE.SphereGeometry(0.017, 10, 6); g.scale(1, 0.07, 0.55); break;
  }
  return (GEO[type] = g);
}
const BASE = {
  pepperoni: { c: 0xa82a1a, r: 0.45, burnt: 0x3a0f08 }, sausage: { c: 0x8a5434, r: 0.8, burnt: 0x2a160c },
  mushroom: { c: 0xd9c7a6, r: 0.75, burnt: 0x4a3a28 }, pepper: { c: 0x3f8a2d, r: 0.45, burnt: 0x1e2a10 },
  onion: { c: 0xd9b6cf, r: 0.5, burnt: 0x3a2030 }, olive: { c: 0x1f1b18, r: 0.3, burnt: 0x0a0806 },
  pineapple: { c: 0xf0c94a, r: 0.5, burnt: 0x5a3a10 }, basil: { c: 0x3c8a3a, r: 0.6, burnt: 0x14240e },
};
export function pieceMaterial(type) { const b = BASE[type]; return new THREE.MeshStandardMaterial({ color: b.c, roughness: b.r }); }

// Patterns painted through the sauce and cheese masks.
let PAT = null;
function patterns() {
  if (PAT) return PAT;
  const rng = makeRng(77);
  const mk = (fn) => { const c = canvas(S), x = c.getContext('2d'); fn(x); return c; };
  PAT = {
    sauce: mk(x => { x.fillStyle = '#b3241a'; x.fillRect(0, 0, S, S); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${rng() < 0.5 ? '90,10,5' : '230,90,60'},${0.06 + rng() * 0.12})`; x.beginPath(); x.ellipse(rng() * S, rng() * S, 2 + rng() * 6, 1 + rng() * 3, rng() * 3, 0, 7); x.fill(); } for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(40,90,20,0.35)'; x.fillRect(rng() * S, rng() * S, 1.5, 1.5); } }),
    cheeseRaw: mk(x => { x.fillStyle = '#efe6cc'; x.fillRect(0, 0, S, S); for (let i = 0; i < 1500; i++) { x.save(); x.translate(rng() * S, rng() * S); x.rotate(rng() * 6.3); x.fillStyle = `hsl(46,${40 + rng() * 30}%,${80 + rng() * 15}%)`; x.fillRect(-4, -0.8, 8, 1.6); x.restore(); } }),
    cheeseMelt: mk(x => { x.fillStyle = '#f2d987'; x.fillRect(0, 0, S, S); for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rng() < 0.6 ? '255,245,200' : '230,170,60'},${0.12 + rng() * 0.2})`; x.beginPath(); x.ellipse(rng() * S, rng() * S, 3 + rng() * 9, 2 + rng() * 6, rng() * 3, 0, 7); x.fill(); } }),
    spots: mk(x => { for (let i = 0; i < 120; i++) { const px = rng() * S, py = rng() * S, r = 2 + rng() * 7, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(150,80,20,0.9)'); g.addColorStop(1, 'rgba(150,80,20,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); } }),
    flour: mk(x => { for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(255,255,255,${rng() * 0.5})`; x.beginPath(); x.arc(rng() * S, rng() * S, 0.6 + rng() * 1.6, 0, 7); x.fill(); } }),
    char: mk(x => { x.fillStyle = 'rgba(25,14,8,1)'; x.fillRect(0, 0, S, S); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '80,45,20'},${rng() * 0.5})`; x.beginPath(); x.arc(rng() * S, rng() * S, 1 + rng() * 5, 0, 7); x.fill(); } }),
  };
  return PAT;
}

const shredGeo = new THREE.BoxGeometry(0.011, 0.0022, 0.0028);
const shredMat = new THREE.MeshStandardMaterial({ color: 0xf6efd8, roughness: 0.7 });
const MAX_SHREDS = 520;
let NEXT_ID = 1;

export class Pie {
  constructor(scene) {
    this.id = NEXT_ID++;
    this.scene = scene;
    this.r = new Float32Array(N);
    const rng = Math.random;
    for (let i = 0; i < N; i++) this.r[i] = 0.056 * (1 + (rng() - 0.5) * 0.06);
    this.blur(1);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.rot = Math.random() * 6.28; this.spin = 0;
    this.support = null;           // {kind:'surface'|'peel'|'held'|'air'|'helper', ...}
    this.bake = 0; this.torn = false; this.ruined = null; this.served = false; this.order = null;
    this.sauceG = new Float32Array(G * G); this.cheeseG = new Float32Array(G * G);
    this.pieces = [];
    this.work = 0;   // how much it has been worked; first pounds do the most
    this.sauceMask = canvas(S); this.cheeseMask = canvas(S); this.top = canvas(S); this.tmp = canvas(S);
    this.topTex = tex(this.top, { aniso: 4 }); this.topTex.wrapS = this.topTex.wrapT = THREE.ClampToEdgeWrapping;
    this.mat = new THREE.MeshStandardMaterial({ map: this.topTex, roughness: 0.78, alphaTest: 0.5 });
    this.botMat = new THREE.MeshStandardMaterial({ color: 0xe2cfa8, roughness: 0.9 });
    this.group = new THREE.Group(); scene.add(this.group);
    this.buildGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.bottom = new THREE.Mesh(this.bgeo, this.botMat); this.bottom.castShadow = true;
    this.group.add(this.mesh, this.bottom);
    this.shreds = new THREE.InstancedMesh(shredGeo, shredMat.clone(), MAX_SHREDS); this.shreds.count = 0; this.shreds.castShadow = true; this.shreds.frustumCulled = false;
    this.shredData = [];
    this.group.add(this.shreds);
    this.pieceGroup = new THREE.Group(); this.group.add(this.pieceGroup);
    this.pmats = {};
    this.dirty = true; this.geoDirty = true; this.lastBakeDraw = -1; this.lastMelt = -1; this.lastRim = 0;
    this.redraw(); this.updateGeometry();
  }

  dispose() {
    this.scene.remove(this.group); this.geo.dispose(); this.bgeo.dispose(); this.mat.dispose(); this.topTex.dispose(); this.botMat.dispose();
    this.shreds.dispose(); for (const k in this.pmats) this.pmats[k].dispose();
  }

  // Shape -------------------------------------------------------------------------------------
  get meanR() { let s = 0; for (let i = 0; i < N; i++) s += this.r[i]; return s / N; }
  get area() { let s = 0; for (let i = 0; i < N; i++) s += this.r[i] * this.r[i]; return Math.PI * s / N; }
  get thickness() { return DOUGH_V / this.area; }
  get sizeIn() { return 2 * this.meanR * M_TO_IN; }
  get roundness() {
    const m = this.meanR; let v = 0; for (let i = 0; i < N; i++) v += (this.r[i] - m) ** 2;
    return clamp(1 - Math.sqrt(v / N) / m * 6, 0, 1);
  }
  get flat() { return smooth(0.062, 0.1, this.meanR); }
  get topped() { return this.pieces.length > 0 || this.cov(this.sauceG, 0.2) > 0.03 || this.cov(this.cheeseG, 0.2) > 0.03; }
  get canStretch() { return !this.topped && !this.torn && this.bake < 0.2 && !this.ruined; }
  rAt(a) {
    const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * N, i = Math.floor(f), t = f - i;
    return lerp(this.r[i % N], this.r[(i + 1) % N], t);
  }
  blur(k) {
    const r = this.r, c = Float32Array.from(r);
    for (let i = 0; i < N; i++) r[i] = lerp(c[i], (c[(i + N - 1) % N] + c[i] * 2 + c[(i + 1) % N]) / 4, k);
  }
  grow(dA, w) {
    let m = 0; for (let i = 0; i < N; i++) m += w[i]; m /= N;
    for (let i = 0; i < N; i++) this.r[i] = Math.sqrt(this.r[i] * this.r[i] + (dA / Math.PI) * (w[i] / m));
    this.geoDirty = true;
  }
  checkTear() {
    if (!this.torn && this.thickness < TEAR_T) { this.torn = true; this.ruined = 'torn'; this.dirty = true; return true; }
    return false;
  }
  // Resistance: the first few pounds flatten the ball fast, then the gluten fights back.
  stretchK() { const r = this.meanR; return r < 0.15 ? 1 : clamp((0.2 - r) / 0.05, 0.1, 1); }

  // A smack at (lx, lz) in the pie's frame.
  pound(lx, lz, strength = 1) {
    if (!this.canStretch) return 0;
    const m = this.meanR, d = Math.hypot(lx, lz), s = Math.min(1, d / m), phi = Math.atan2(-lz, lx);
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      w[i] = Math.max(0.15, 1 + 1.9 * s * Math.cos(th - phi)) * (1 + (Math.random() - 0.5) * 0.5);
    }
    // smooth the weights so the edge stays doughy rather than spiky
    for (let k = 0; k < 2; k++) { const c = Float32Array.from(w); for (let i = 0; i < N; i++) w[i] = (c[(i + N - 1) % N] + c[i] * 2 + c[(i + 1) % N]) / 4; }
    const dA = 0.0088 * strength * this.stretchK();
    this.grow(dA, w); this.work++;
    this.checkTear();
    return dA;
  }
  // Palm spinning it round on a surface: dTheta radians turned under the hand.
  palmSpin(dth) {
    if (!this.canStretch) return;
    const a = Math.abs(dth), m = this.meanR;
    for (let i = 0; i < N; i++) this.r[i] += (m - this.r[i]) * Math.min(1, 0.07 * a);
    const w = new Float32Array(N).fill(1);
    this.grow(0.00105 * a * this.stretchK(), w);
    this.checkTear();
  }
  // In the air: spin stretches it evenly; no spin makes it flop.
  airStretch(dt, spin) {
    if (!this.canStretch) return;
    const k = clamp(Math.abs(spin) / 12, 0, 1.5);
    const m = this.meanR;
    for (let i = 0; i < N; i++) this.r[i] += (m - this.r[i]) * Math.min(1, dt * 2.2 * k);
    if (k < 0.4) for (let i = 0; i < N; i++) this.r[i] *= 1 + (Math.random() - 0.5) * 0.5 * dt * (0.4 - k) * 4;
    const w = new Float32Array(N).fill(1);
    this.grow(0.02 * dt * k * clamp((0.215 - m) / 0.04, 0.25, 1), w);
    this.checkTear();
  }
  // Caught off-centre: it sags toward the side that missed your knuckles.
  lopsided(lx, lz, q) {
    const phi = Math.atan2(-lz, lx);
    for (let i = 0; i < N; i++) this.r[i] *= 1 + 0.12 * q * Math.cos((i / N) * Math.PI * 2 - phi);
    this.geoDirty = true;
  }
  flop(k = 1) {
    for (let i = 0; i < N; i++) this.r[i] *= 1 + (Math.random() - 0.5) * 0.18 * k;
    this.blur(0.6); this.geoDirty = true;
  }
  // Store-bought perfection, for the hired dough cook.
  makeRound(inches) {
    const r = inches / M_TO_IN / 2;
    for (let i = 0; i < N; i++) this.r[i] = r * (1 + (Math.random() - 0.5) * 0.025);
    this.blur(1); this.work = 12; this.geoDirty = true;
  }

  heightAt(lx, lz) {
    const d = Math.hypot(lx, lz), a = Math.atan2(-lz, lx), R = this.rAt(a), s = d / R;
    return s >= 1 ? 0 : this.profileH(s);
  }
  profileH(s) {
    const r = this.meanR, f = this.flat, t = this.thickness, h0 = (3 * DOUGH_V) / (2 * Math.PI * r * r);
    const dome = h0 * Math.sqrt(Math.max(0, 1 - s * s));
    let k = 0; for (; k < RINGS.length - 2 && RINGS[k + 1] < s; k++);
    const u = clamp((s - RINGS[k]) / (RINGS[k + 1] - RINGS[k]), 0, 1);
    const rimPuff = 1 + 0.55 * smooth(0.2, 1.0, this.bake);
    const fk = lerp(FLAT[k], FLAT[k + 1], u), rimK = s > 0.8 ? rimPuff : 1;
    return lerp(dome, t * fk * rimK, f);
  }
  inside(lx, lz, k = 1) { return Math.hypot(lx, lz) < k * this.rAt(Math.atan2(-lz, lx)); }

  // Geometry ---------------------------------------------------------------------------------
  buildGeometry() {
    const nv = 1 + N * (RINGS.length - 1);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    const idx = [];
    for (let j = 0; j < N; j++) idx.push(0, 1 + j, 1 + ((j + 1) % N));
    for (let k = 1; k < RINGS.length - 1; k++) for (let j = 0; j < N; j++) {
      const a = 1 + (k - 1) * N + j, b = 1 + (k - 1) * N + (j + 1) % N, c = 1 + k * N + j, d = 1 + k * N + (j + 1) % N;
      idx.push(a, c, b, b, c, d);
    }
    this.geo.setIndex(idx);
    this.bgeo = new THREE.BufferGeometry();
    this.bgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    const bi = []; for (let j = 0; j < N; j++) bi.push(0, 1 + ((j + 1) % N), 1 + j);
    this.bgeo.setIndex(bi);
  }
  updateGeometry() {
    const p = this.geo.attributes.position, uv = this.geo.attributes.uv, bp = this.bgeo.attributes.position;
    const h0 = this.profileH(0);
    p.setXYZ(0, 0, h0, 0); uv.setXY(0, 0.5, 0.5); bp.setXYZ(0, 0, 0.0006, 0);
    for (let k = 1; k < RINGS.length; k++) {
      const s = RINGS[k], h = this.profileH(s);
      for (let j = 0; j < N; j++) {
        const a = (j / N) * Math.PI * 2, R = this.r[j] * s, x = Math.cos(a) * R, z = -Math.sin(a) * R;
        const vi = 1 + (k - 1) * N + j;
        p.setXYZ(vi, x, k === RINGS.length - 1 ? 0.0008 : h, z);
        uv.setXY(vi, 0.5 + x / SPAN, 0.5 - z / SPAN);
        if (k === RINGS.length - 1) bp.setXYZ(1 + j, x, 0.0006, z);
      }
    }
    p.needsUpdate = true; uv.needsUpdate = true; bp.needsUpdate = true;
    this.geo.computeVertexNormals(); this.bgeo.computeVertexNormals();
    this.geo.computeBoundingSphere(); this.bgeo.computeBoundingSphere();
    this.geoDirty = false;
    for (const pc of this.pieces) pc.mesh.position.y = this.heightAt(pc.x, pc.z) + pc.dy;
    this.layShreds();
  }

  // Toppings -----------------------------------------------------------------------------------
  toLocal(wx, wz, out = { x: 0, z: 0 }) {
    const dx = wx - this.pos.x, dz = wz - this.pos.z, c = Math.cos(this.rot), s = Math.sin(this.rot);
    // group.rotation.y = rot maps local (x,z) to world (x c + z s, -x s + z c)
    out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out;
  }
  toWorld(lx, lz, out) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    out.x = this.pos.x + lx * c + lz * s; out.z = this.pos.z - lx * s + lz * c; return out;
  }
  paint(grid, mask, lx, lz, rad, amt, style) {
    const cs = SPAN / G;
    const gx = Math.floor((lx + SPAN / 2) / cs), gz = Math.floor((lz + SPAN / 2) / cs), gr = Math.ceil(rad / cs);
    for (let j = -gr; j <= gr; j++) for (let i = -gr; i <= gr; i++) {
      const x = gx + i, z = gz + j; if (x < 0 || z < 0 || x >= G || z >= G) continue;
      const cx = (x + 0.5) * cs - SPAN / 2, cz = (z + 0.5) * cs - SPAN / 2, d = Math.hypot(cx - lx, cz - lz);
      if (d > rad) continue;
      if (!this.inside(cx, cz, 0.985)) continue;
      grid[z * G + x] = Math.min(1.3, grid[z * G + x] + amt * (1 - d / rad * 0.6));
    }
    const ctx = mask.getContext('2d'), px = (0.5 + lx / SPAN) * S, py = (0.5 + lz / SPAN) * S, pr = rad / SPAN * S;
    if (style === 'sauce') {
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(255,255,255,${Math.min(1, amt * 2.2)})`); g.addColorStop(0.7, `rgba(255,255,255,${Math.min(1, amt * 1.6)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let k = 0; k < 11; k++) { const a = Math.random() * 6.3, rr = Math.random() * pr; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * rr, py + Math.sin(a) * rr, 2 + Math.random() * 4, 1.2 + Math.random() * 2, Math.random() * 3, 0, 7); ctx.fill(); }
    }
    this.clipMask(ctx);
    this.dirty = true;
  }
  clipMask(ctx) {
    // keep paint off the crust lip
    ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#fff';
    this.outlinePath(ctx, 0.9); ctx.fill(); ctx.restore();
  }
  outlinePath(ctx, k) {
    ctx.beginPath();
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2, R = this.r[j % N] * k, x = Math.cos(a) * R, z = -Math.sin(a) * R;
      const px = (0.5 + x / SPAN) * S, py = (0.5 + z / SPAN) * S;
      j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  addSauce(lx, lz, amt) { if (!this.ruined) this.paint(this.sauceG, this.sauceMask, lx, lz, 0.042, amt, 'sauce'); }
  addCheese(lx, lz, rad) {
    this.paint(this.cheeseG, this.cheeseMask, lx, lz, rad, 0.5, 'cheese');
    for (let k = 0; k < 28; k++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * rad, x = lx + Math.cos(a) * d, z = lz + Math.sin(a) * d;
      if (!this.inside(x, z, 0.9) || this.shredData.length >= MAX_SHREDS) continue;
      this.shredData.push({ x, z, a: Math.random() * 6.283, tilt: (Math.random() - 0.5) * 0.6, dy: Math.random() * 0.003 });
    }
    this.layShreds();
  }
  layShreds() {
    const melt = smooth(0.15, 0.6, this.bake);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1 - melt * 0.4, Math.max(0.05, 1 - melt), 1 + melt * 0.6);
    let n = 0;
    if (melt < 0.97) for (const s of this.shredData) {
      p.set(s.x, this.heightAt(s.x, s.z) + 0.0012 + s.dy * (1 - melt), s.z);
      e.set(s.tilt * (1 - melt), s.a, 0); q.setFromEuler(e); m4.compose(p, q, sc); this.shreds.setMatrixAt(n++, m4);
    }
    this.shreds.count = n; this.shreds.instanceMatrix.needsUpdate = true;
    this.lastMelt = melt;
  }
  addPiece(type, lx, lz) {
    if (!this.pmats[type]) this.pmats[type] = pieceMaterial(type);
    const mesh = new THREE.Mesh(geo(type), this.pmats[type]);
    mesh.castShadow = true;
    const dy = 0.0016 + (this.pieces.length % 4) * 0.0007 + (type === 'pepperoni' ? 0.0005 : 0);
    mesh.position.set(lx, this.heightAt(lx, lz) + dy, lz);
    mesh.rotation.y = Math.random() * 6.283;
    if (type === 'sausage' || type === 'pineapple') mesh.rotation.x = (Math.random() - 0.5) * 0.6;
    const sc = 0.85 + Math.random() * 0.3; mesh.scale.setScalar(sc);
    this.pieceGroup.add(mesh);
    this.pieces.push({ type, x: lx, z: lz, dy, mesh });
  }

  // Analysis -----------------------------------------------------------------------------------
  cov(grid, thr = 0.35) {
    const cs = SPAN / G; let tot = 0, hit = 0;
    for (let z = 0; z < G; z++) for (let x = 0; x < G; x++) {
      const cx = (x + 0.5) * cs - SPAN / 2, cz = (z + 0.5) * cs - SPAN / 2;
      if (!this.inside(cx, cz, 0.82)) continue;
      tot++; if (grid[z * G + x] > thr) hit++;
    }
    return tot ? hit / tot : 0;
  }
  sauceCov() { return this.cov(this.sauceG); }
  cheeseCov() { return this.cov(this.cheeseG); }
  pieceStats(type) {
    const q = new Set(); let n = 0;
    for (const p of this.pieces) if (p.type === type) { n++; const a = Math.atan2(-p.z, p.x); q.add(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4); if (Math.hypot(p.x, p.z) < this.meanR * 0.3) q.add('c'); }
    return { n, quads: q.size };
  }
  types() { const s = new Set(this.pieces.map(p => p.type)); if (this.sauceCov() > 0.08) s.add('sauce'); if (this.cheeseCov() > 0.08) s.add('cheese'); return s; }

  // Baking -------------------------------------------------------------------------------------
  bakeStep(dt, temp, rate) {
    if (this.ruined === 'dropped') return;
    this.bake += dt * rate * Math.pow(Math.max(0, temp), 1.6);
    if (Math.abs(this.bake - this.lastBakeDraw) > 0.02) this.dirty = true;
    if (Math.abs(smooth(0.15, 0.6, this.bake) - this.lastMelt) > 0.04) this.layShreds();
    if (this.bake > 0.3 && Math.abs(this.bake - this.lastRim) > 0.08) { this.lastRim = this.bake; this.geoDirty = true; }
  }
  get doneness() {
    const b = this.bake;
    if (b < 0.55) return 'raw'; if (b < 0.85) return 'pale'; if (b < 1.15) return 'perfect'; if (b < 1.38) return 'dark'; return 'burnt';
  }

  redraw() {
    const P = patterns(), x = this.top.getContext('2d'), t = this.tmp.getContext('2d'), b = this.bake;
    // dough: raw cream -> gold -> brown -> char
    const doughC = b < 1 ? mix3('#ead9b6', '#e6b469', b) : b < 1.35 ? mix3('#e6b469', '#a8632a', (b - 1) / 0.35) : mix3('#a8632a', '#2a1a10', Math.min(1, (b - 1.35) / 0.4));
    const crustC = b < 1 ? mix3('#e4cfa6', '#c98a3e', b) : b < 1.35 ? mix3('#c98a3e', '#7a4318', (b - 1) / 0.35) : mix3('#7a4318', '#1c120b', Math.min(1, (b - 1.35) / 0.35));
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.fillStyle = crustC; x.fillRect(0, 0, S, S);
    // soft transition from rim to the middle
    for (let k = 0; k < 6; k++) { x.globalAlpha = 0.28; x.fillStyle = doughC; this.outlinePath(x, 0.93 - k * 0.025); x.fill(); }
    x.globalAlpha = 1 - smooth(0.2, 0.8, b); x.drawImage(P.flour, 0, 0);
    // char patches on the rim when it goes too far
    if (b > 1.2) { x.globalAlpha = smooth(1.2, 1.6, b) * 0.7; x.drawImage(P.spots, 0, 0); }
    x.globalAlpha = 1;
    // sauce
    this.layer(x, t, this.sauceMask, P.sauce, 1, [['#3a0c05', smooth(1.05, 1.6, b) * 0.85], ['#6a160c', smooth(0.5, 1.0, b) * 0.25]]);
    // cheese, raw then melting then browning
    const melt = smooth(0.15, 0.6, b);
    if (melt < 1) this.layer(x, t, this.cheeseMask, P.cheeseRaw, (1 - melt) * 0.55, []);
    if (melt > 0) this.layer(x, t, this.cheeseMask, P.cheeseMelt, melt, [[P.spots, smooth(0.75, 1.15, b)], ['#2a170c', smooth(1.25, 1.65, b) * 0.9]]);
    if (this.torn) {
      x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
      const a = (this.id * 2.4) % 6.28, R = this.meanR * 0.35, cx = (0.5 + Math.cos(a) * R / SPAN) * S, cy = (0.5 - Math.sin(a) * R / SPAN) * S;
      x.beginPath(); x.ellipse(cx, cy, 14, 9, a, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
    }
    this.topTex.needsUpdate = true;
    this.botMat.color.set(b < 1 ? mix3('#e2cfa8', '#c48a4a', b) : mix3('#c48a4a', '#2a1a10', Math.min(1, (b - 1) / 0.6)));
    // pieces darken with the bake
    const burn = smooth(0.9, 1.7, b);
    for (const k in this.pmats) { const B = BASE[k]; this.pmats[k].color.set(B.c).lerp(new THREE.Color(B.burnt), burn * 0.85); }
    for (const p of this.pieces) if (p.type === 'pepperoni') { const c = 1 + smooth(0.6, 1.1, b) * 0.35; p.mesh.scale.y = c; }
    this.lastBakeDraw = b; this.dirty = false;
  }
  layer(x, t, mask, pattern, alpha, overlays) {
    if (alpha <= 0.01) return;
    t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, S, S);
    t.drawImage(mask, 0, 0);
    t.globalCompositeOperation = 'source-in'; t.drawImage(pattern, 0, 0);
    t.globalCompositeOperation = 'source-atop';
    for (const [o, a] of overlays) { if (a <= 0.01) continue; t.globalAlpha = a; if (typeof o === 'string') { t.fillStyle = o; t.fillRect(0, 0, S, S); } else t.drawImage(o, 0, 0); }
    t.globalAlpha = 1;
    x.globalAlpha = alpha; x.drawImage(this.tmp, 0, 0); x.globalAlpha = 1;
  }

  sync() {
    if (this.geoDirty) this.updateGeometry();
    if (this.dirty) this.redraw();
    this.group.position.copy(this.pos); this.group.rotation.y = this.rot;
  }
}

function mix3(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1)).getHexString(); }
export { wrapAng };
