// The tree itself: a trunk, whorls of branches, and a couple of thousand fir sprays on
// alpha-cut cards. Everything is in metres with the floor at y = 0, so AR shows it at true size.
import * as THREE from 'three';
import { makeRng, clamp, smooth, lerp } from './util.js';
import { needleAtlas, barkTexture, deepFoliage } from './textures.js';

export const SPECIES = {
  fraser:   { label: 'Fraser fir', note: 'Dark, dense and upturned. The one on every card.', radius: 0.30, gap: 0.12, per: [6, 9], lift: 0.42, droop: 0.12, frond: 0.24, fill: 1.0, shape: 1.0, palette: 'fraser' },
  douglas:  { label: 'Douglas fir', note: 'Soft, full and drapey. Smells like a candle called "Douglas Fir".', radius: 0.36, gap: 0.12, per: [7, 9], lift: 0.16, droop: 0.26, frond: 0.27, fill: 1.15, shape: 0.92, palette: 'douglas' },
  noble:    { label: 'Noble fir', note: 'Blue-green tiers with gaps made for big ornaments.', radius: 0.29, gap: 0.24, per: [5, 7], lift: 0.1, droop: 0.05, frond: 0.23, fill: 0.45, shape: 1.04, palette: 'noble', tiers: true },
  flocked:  { label: 'Flocked', note: 'Sprayed with fake snow. Sheds fake snow. Forever.', radius: 0.30, gap: 0.12, per: [6, 9], lift: 0.36, droop: 0.12, frond: 0.25, fill: 1.0, shape: 1.0, palette: 'flocked' },
  tinsel:   { label: 'Aluminum', note: 'The 1962 space-age silver tree. Do not string lights on it (we did).', radius: 0.27, gap: 0.085, per: [8, 8], lift: 0.22, droop: 0.03, frond: 0.21, fill: 0.7, shape: 1.08, palette: 'tinsel', metal: true, regular: true },
  pink:     { label: 'Pink tinsel', note: 'Tinsel, but make it a mall in 1998.', radius: 0.27, gap: 0.085, per: [8, 8], lift: 0.22, droop: 0.03, frond: 0.21, fill: 0.7, shape: 1.08, palette: 'pink', metal: true, regular: true },
  scraggly: { label: 'The Underdog', note: 'Four branches and a dream. It just needs a little love.', radius: 0.23, gap: 0.27, per: [3, 5], lift: 0.04, droop: 0.4, frond: 0.21, fill: 0.08, shape: 0.85, palette: 'scraggly', sparse: true },
};

// The tree's outline: outer radius of the foliage at height y.
export function makeProfile(sp, H, W) {
  const yb = Math.min(0.34, 0.1 * H + 0.08);
  const R0 = sp.radius * H * W;
  const r = y => {
    const f = (y - yb) / (H - yb);
    if (f < -0.03 || f > 1) return 0;
    const ff = clamp(f, 0, 1);
    return R0 * Math.pow(1 - ff, sp.shape) * (0.8 + 0.2 * smooth(0, 0.12, ff));
  };
  return { yb, R0, H, r };
}

const UP = new THREE.Vector3(0, 1, 0);

// Writes double-faced cards straight into typed arrays: thousands of them, one draw call.
class CardWriter {
  constructor(maxCards, segs) {
    this.segs = segs;
    const vpc = (segs + 1) * 2 * 2; // two faces
    const ipc = segs * 6 * 2;
    this.pos = new Float32Array(maxCards * vpc * 3);
    this.nor = new Float32Array(maxCards * vpc * 3);
    this.uv = new Float32Array(maxCards * vpc * 2);
    this.idx = new Uint32Array(maxCards * ipc);
    this.v = 0; this.i = 0; this.max = maxCards; this.count = 0;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._n = new THREE.Vector3();
  }
  // A card from `origin` along `dir`. `side` is the across-direction hint, `uv0` the atlas cell.
  card(origin, dir, len, wid, roll, droop, u0, v0, cw, ch, normalFn) {
    if (this.count >= this.max) return;
    this.count++;
    const x = dir.clone().normalize();
    let z = new THREE.Vector3().crossVectors(x, UP);
    if (z.lengthSq() < 1e-6) z.set(1, 0, 0);
    z.normalize().applyAxisAngle(x, roll);
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const S = this.segs, base = this.v;
    for (let face = 0; face < 2; face++) {
      const fb = this.v;
      for (let s = 0; s <= S; s++) {
        const t = s / S;
        const w = wid * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.12)));
        for (let k = 0; k < 2; k++) {
          const across = (k - 0.5);
          const lx = t * len, ly = -droop * t * t * len + Math.abs(across) * 0.12 * len * t, lz = across * w;
          const p = this._p.set(origin.x + x.x * lx + y.x * ly + z.x * lz, origin.y + x.y * lx + y.y * ly + z.y * lz, origin.z + x.z * lx + y.z * ly + z.z * lz);
          const o = this.v * 3;
          this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
          normalFn(p, y, this._n);
          this.nor[o] = this._n.x; this.nor[o + 1] = this._n.y; this.nor[o + 2] = this._n.z;
          this.uv[this.v * 2] = u0 + t * cw; this.uv[this.v * 2 + 1] = v0 + (across + 0.5) * ch;
          this.v++;
        }
      }
      for (let s = 0; s < S; s++) {
        const a = fb + s * 2, b = a + 1, c = a + 2, d = a + 3;
        if (face === 0) { this.idx[this.i++] = a; this.idx[this.i++] = c; this.idx[this.i++] = b; this.idx[this.i++] = b; this.idx[this.i++] = c; this.idx[this.i++] = d; }
        else { this.idx[this.i++] = a; this.idx[this.i++] = b; this.idx[this.i++] = c; this.idx[this.i++] = b; this.idx[this.i++] = d; this.idx[this.i++] = c; }
      }
    }
    return base;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, this.v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.v * 2), 2));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.i), 1));
    g.computeBoundingSphere();
    return g;
  }
}

const matCache = new Map();
export function frondMaterial(sp) {
  const key = sp.palette;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      map: needleAtlas(sp.palette), alphaTest: 0.5, side: THREE.FrontSide,
      roughness: sp.metal ? 0.28 : 0.82, metalness: sp.metal ? 0.85 : 0,
      color: sp.metal ? 0xffffff : 0x9db8a2, envMapIntensity: sp.metal ? 1 : 0.55,
    });
    m.name = 'needles-' + key;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

export function buildTree(t) {
  const sp = SPECIES[t.species] || SPECIES.fraser;
  const H = t.height, W = t.width ?? 1, fullness = t.fullness ?? 1;
  const rng = makeRng((t.seed ?? 1) * 7919 + H * 1000);
  const P = makeProfile(sp, H, W);
  const { yb, R0, r } = P;
  const scale = Math.pow(H / 2.1, 0.55);
  const frondLen = sp.frond * scale;
  const fill = sp.fill * fullness;
  const group = new THREE.Group();
  group.name = 'tree';

  // How a card is lit: as part of a rounded mass, normals pointing out from the trunk.
  const normalFn = (p, cardUp, out) => {
    const rad = Math.hypot(p.x, p.z) || 1e-4;
    const rr = Math.max(r(p.y), 0.05);
    out.set(p.x / rad, 0.55 + 0.25 * (1 - Math.min(1, rad / rr)), p.z / rad).normalize();
    out.lerp(cardUp.y < 0 ? cardUp.clone().negate() : cardUp, 0.25).normalize();
    return out;
  };

  const cards = new CardWriter(9000, 3);
  const cell = 0.25, inset = 0.006;
  const card = (o, dir, len, wid, row, droop = 0.12, roll = 1.3) => {
    const col = Math.floor(rng() * 4);
    cards.card(o, dir, len, wid, (rng() - 0.5) * roll, droop, col * cell + inset, clamp(row, 0, 3) * cell + inset, cell - inset * 2, cell - inset * 2, normalFn);
  };

  // Branch sticks: tapered three-sided tubes, mostly hidden but they show through the gaps.
  const stickPos = [], stickIdx = [], stickNor = [], stickUv = [];
  const stick = (pts, r0, r1) => {
    const base = stickPos.length / 3;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
      const d = new THREE.Vector3().subVectors(q, pp).normalize();
      let a = new THREE.Vector3().crossVectors(d, UP); if (a.lengthSq() < 1e-6) a.set(1, 0, 0); a.normalize();
      const b = new THREE.Vector3().crossVectors(a, d).normalize();
      const rr = lerp(r0, r1, i / (n - 1));
      for (let k = 0; k < 3; k++) {
        const ang = k / 3 * Math.PI * 2;
        const nx = a.x * Math.cos(ang) + b.x * Math.sin(ang), ny = a.y * Math.cos(ang) + b.y * Math.sin(ang), nz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
        stickPos.push(p.x + nx * rr, p.y + ny * rr, p.z + nz * rr);
        stickNor.push(nx, ny, nz);
        stickUv.push(k / 3, i / (n - 1));
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < 3; k++) {
      const a = base + i * 3 + k, b = base + i * 3 + (k + 1) % 3, c = a + 3, d = b + 3;
      stickIdx.push(a, c, b, b, c, d);
    }
  };

  const trunkR = 0.022 + 0.018 * H;
  const branches = [];

  // Whorls up the stem. Noble firs keep their tiers; sheared farm trees fill the gaps.
  let y = yb;
  let whorl = 0;
  const whorlYs = [];
  while (y < H - 0.18 * scale) {
    const rad = r(y);
    const [lo, hi] = sp.per;
    const n = Math.max(3, Math.round(lerp(lo, hi, rng()) * (0.55 + 0.45 * rad / R0)));
    const spin = whorl * 2.39996 + rng();
    for (let i = 0; i < n; i++) {
      if (sp.sparse && rng() < 0.3) continue;
      const az = spin + (i / n) * Math.PI * 2 + (sp.regular ? 0 : (rng() - 0.5) * 0.6);
      const lift = sp.lift * (0.75 + rng() * 0.5) + (1 - rad / R0) * 0.15;
      const droop = sp.droop * (0.7 + rng() * 0.6);
      // Reach out to the outline at the height the tip ends up at.
      let L = rad;
      for (let k = 0; k < 3; k++) L = Math.max(0.05, r(y + L * (lift - droop)) - frondLen * 0.45) * (sp.regular ? 1 : 0.92 + rng() * 0.12);
      branches.push({ y, az, L, lift, droop, f: (y - yb) / (H - yb) });
    }
    const gap = sp.gap * scale * (sp.regular ? 1 : 0.8 + rng() * 0.4) * (1 - 0.35 * (y - yb) / (H - yb));
    whorlYs.push([y, gap]);
    y += gap;
    whorl++;
  }

  const tmp = new THREE.Vector3();
  for (const b of branches) {
    const dirH = new THREE.Vector3(Math.cos(b.az), 0, Math.sin(b.az));
    const at = t => new THREE.Vector3(dirH.x * b.L * t, b.y + b.L * (b.lift * t - b.droop * t * t), dirH.z * b.L * t);
    const tangent = t => new THREE.Vector3(dirH.x * b.L, b.L * (b.lift - 2 * b.droop * t), dirH.z * b.L).normalize();
    const pts = [0, 0.35, 0.7, 1].map(at);
    stick(pts, trunkR * 0.35 * (0.6 + 0.4 * b.L / R0) + 0.004, 0.002);
    const step = frondLen * 0.4 / Math.sqrt(Math.max(0.3, fill));
    const nSteps = Math.max(2, Math.ceil(b.L / step));
    for (let s = 1; s <= nSteps; s++) {
      const tt = 0.1 + 0.9 * s / nSteps;
      const o = at(tt), d = tangent(tt);
      const depth = tt;
      const row = Math.floor(depth * 2.6 + rng() * 0.9 + (b.f > 0.15 ? 0.4 : 0));
      for (const side of [-1, 1]) {
        if (sp.sparse && rng() < 0.25) continue;
        const ang = side * (0.75 + rng() * 0.35);
        const fd = d.clone().applyAxisAngle(UP, ang);
        fd.y += 0.05 + rng() * 0.12;
        const len = frondLen * (0.75 + 0.45 * (1 - tt)) * (0.85 + rng() * 0.3);
        card(o, fd, len, len * 0.62, row, 0.1 + b.droop * 0.4);
      }
    }
    const tip = at(1), td = tangent(1);
    card(tip.clone().addScaledVector(td, -frondLen * 0.15), td, frondLen * (1.0 + rng() * 0.2), frondLen * 0.6, 3, 0.12 + b.droop * 0.3);
  }

  // Noble firs show daylight between their tiers: no shell sprays in the upper part of each gap.
  const inGap = yy => { for (const [wy, g] of whorlYs) if (yy >= wy && yy < wy + g) return (yy - wy) > g * 0.42; return false; };
  // The outer shell: sprays all over the outline, facing out like shingles, so the tree
  // reads as solid green from every side. Some droop, some sweep up at the tips.
  let area = 0;
  for (let i = 0; i < 40; i++) { const y0 = lerp(yb, H, i / 40), y1 = lerp(yb, H, (i + 1) / 40); area += Math.PI * (r(y0) + r(y1)) * Math.hypot(y1 - y0, r(y1) - r(y0)); }
  const nShell = Math.round(fill * area / (frondLen * frondLen * 0.095));
  for (let i = 0; i < nShell; i++) {
    let yy, rad;
    do { yy = lerp(yb, H - 0.12 * scale, rng()); rad = r(yy); } while (rng() * R0 > rad + 0.04 || (sp.tiers && inGap(yy)));
    const az = rng() * Math.PI * 2, depth = 0.72 + rng() * 0.26;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const tan = new THREE.Vector3(-out.z, 0, out.x);
    const up = rng() < (sp.lift > 0.3 ? 0.55 : 0.3);
    const dir = out.clone().multiplyScalar(0.75 + rng() * 0.3).addScaledVector(UP, up ? 0.25 + rng() * 0.35 : -(0.35 + rng() * 0.45)).addScaledVector(tan, (rng() - 0.5) * 0.8);
    const len = frondLen * (0.75 + rng() * 0.4);
    const o = new THREE.Vector3(out.x * rad * depth, yy, out.z * rad * depth).addScaledVector(dir.clone().normalize(), -len * 0.5);
    const row = depth > 0.9 ? 3 : depth > 0.8 ? 2 : 1;
    card(o, dir, len, len * 0.7, row, up ? 0.05 : 0.16, 2.2);
  }

  // The leader: a spike of sprays pointing up to the tip, where the topper goes.
  const topY = H;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + rng();
    const o = new THREE.Vector3(Math.cos(a) * 0.01, topY - frondLen * (1.1 + i * 0.12), Math.sin(a) * 0.01);
    const d = new THREE.Vector3(Math.cos(a) * 0.25, 1, Math.sin(a) * 0.25);
    card(o, d, frondLen * (1.15 - i * 0.08), frondLen * 0.45, 3, 0.02);
  }

  const fronds = new THREE.Mesh(cards.geometry(), frondMaterial(sp));
  fronds.name = 'fronds';
  fronds.castShadow = true; fronds.receiveShadow = true;
  group.add(fronds);

  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(stickPos, 3));
  sg.setAttribute('normal', new THREE.Float32BufferAttribute(stickNor, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(stickUv, 2));
  sg.setIndex(stickIdx);
  const wood = woodMaterial();
  const sticks = new THREE.Mesh(sg, wood);
  sticks.name = 'branches';
  group.add(sticks);

  // Trunk.
  const tg = new THREE.CylinderGeometry(trunkR * 0.12, trunkR, H - 0.05, 10, 6, false);
  tg.translate(0, (H - 0.05) / 2, 0);
  const trunk = new THREE.Mesh(tg, wood);
  trunk.name = 'trunk'; trunk.castShadow = true;
  group.add(trunk);

  // A dark core so you can't see through to the far side.
  const corePts = [];
  for (let i = 0; i <= 16; i++) {
    const yy = lerp(yb + 0.04, H - 0.25 * scale, i / 16);
    corePts.push(new THREE.Vector2(Math.max(0.005, r(yy) * (sp.sparse ? 0.25 : sp.regular ? 0.55 : 0.74)), yy));
  }
  corePts.push(new THREE.Vector2(0.001, H - 0.2 * scale));
  const cg = new THREE.LatheGeometry(corePts, 24);
  { const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(4, Math.round(R0 * 14)), uv.getY(i) * Math.max(3, Math.round(H * 4))); }
  const core = new THREE.Mesh(cg, coreMaterial(sp));
  core.name = 'core';
  if (!sp.sparse) group.add(core);

  // Invisible outline for tap-to-hang and for draping lights and garland.
  const envPts = [];
  for (let i = 0; i <= 24; i++) { const yy = lerp(yb - 0.02, H, i / 24); envPts.push(new THREE.Vector2(Math.max(0.002, r(yy)), yy)); }
  const envelope = new THREE.Mesh(new THREE.LatheGeometry(envPts, 32), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false }));
  envelope.name = 'envelope';
  envelope.userData.liveOnly = true;

  return { group, envelope, profile: P, sp, H, yb, R0, trunkR, frondLen, cards: cards.count };
}

let woodMat = null;
function woodMaterial() {
  if (!woodMat) { woodMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: 0xb9a48e }); woodMat.name = 'bark'; }
  return woodMat;
}

const coreMats = new Map();
function coreMaterial(sp) {
  if (!coreMats.has(sp.palette)) {
    const col = { fraser: 0x0b1d14, douglas: 0x10230d, noble: 0x0d1f1c, flocked: 0x3d4a46, tinsel: 0x6d7378, pink: 0xb55a86, scraggly: 0x1d2a0d }[sp.palette] ?? 0x0b1d14;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: deepFoliage(sp.palette, col), roughness: sp.metal ? 0.4 : 1, metalness: sp.metal ? 0.6 : 0 });
    m.name = 'core-' + sp.palette;
    coreMats.set(sp.palette, m);
  }
  return coreMats.get(sp.palette);
}

// A point on the outline: height fraction f (0 bottom of foliage, 1 tip), angle a, depth d (1 = outer surface).
export function surfacePoint(info, f, a, d = 1, out = new THREE.Vector3()) {
  const y = lerp(info.yb, info.H, f);
  const rad = info.profile.r(y) * d;
  return out.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
}
