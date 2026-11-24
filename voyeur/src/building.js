// The building: a four-storey brick walk-up over a deli, a lobby and a laundromat, with eight
// mirrored one-bedroom apartments behind real windows, a fire escape, a water tower, the street,
// two neighbors and a far skyline. Everything is generated here; nothing is loaded from disk.
import * as THREE from 'three';
import { Kit, paint, planarUV, canvasTex, pick, range, damp } from './util.js';
import { makeRoomMaterial } from './shaders.js';

export const FZ = -0.3, UW = 7.5, UD = 8, GH = 4.2, FH = 3.2, FLOORS = 4, BW = 7.75, CH = 2.85;
export const TOP = GH + FLOORS * FH;
export const SILL = 0.85, HEAD = 2.6, WW = 1.2, SW_Y = 0.15;
export const CURB_Z = 4.0;

// ---- Apartment plan (local coordinates: x across the unit, z negative going back from the street wall)
const WINS = [{ room: 'L', cx: 1.4 }, { room: 'L', cx: 3.3 }, { room: 'B', cx: 6.15 }];
const RDEF = {
  L: { x0: 0, x1: 4.6, z0: 0, z1: -4.5, doors: { x1: [[-4.2, -3.2]], z1: [[2.9, 3.9]] }, front: false },
  B: { x0: 4.8, x1: UW, z0: 0, z1: -4.5, doors: { x0: [[-4.2, -3.2]] }, front: false },
  H: { x0: 0, x1: 4.6, z0: -4.7, z1: -UD, doors: { z0: [[2.9, 3.9]], x1: [[-6.9, -6.0]] }, front: true },
  Ba: { x0: 4.8, x1: UW, z0: -4.7, z1: -UD, doors: { x0: [[-6.9, -6.0]] }, front: true },
};
export const NODES = {
  Lc: [2.4, -2.4], dLB_L: [4.3, -3.7], dLB_B: [5.2, -3.7], Bc: [5.4, -3.2],
  dLH_L: [3.4, -4.15], dLH_H: [3.4, -5.1], Hc: [2.4, -6.2], dHB_H: [4.3, -6.45], dHB_B: [5.2, -6.45], Bac: [6.0, -6.45],
};
export const EDGES = [['Lc', 'dLB_L'], ['dLB_L', 'dLB_B'], ['dLB_B', 'Bc'], ['Lc', 'dLH_L'], ['dLH_L', 'dLH_H'], ['dLH_H', 'Hc'], ['Hc', 'dHB_H'], ['dHB_H', 'dHB_B'], ['dHB_B', 'Bac']];
export const CENTER = { L: 'Lc', B: 'Bc', H: 'Hc', Ba: 'Bac' };
export const SPOTS = {
  sofa1: { room: 'L', via: [[1.25, -3.05], [1.25, -1.7]], at: [0.64, -1.7], face: [1, 0], pose: 'sit', seat: 0.45 },
  sofa2: { room: 'L', via: [[1.25, -3.05], [1.25, -2.55]], at: [0.64, -2.55], face: [1, 0], pose: 'sit', seat: 0.45 },
  stove: { room: 'L', at: [1.9, -3.42], face: [0, -1], pose: 'cook' },
  fridge: { room: 'L', at: [0.55, -3.3], face: [0, -1], pose: 'reach' },
  chair1: { room: 'L', at: [3.0, -0.95], face: [0, 1], pose: 'sitTable', seat: 0.47 },
  chair2: { room: 'L', at: [3.6, -0.95], face: [0, 1], pose: 'sitTable', seat: 0.47 },
  winL: { room: 'L', via: [[2.15, -1.6]], at: [1.4, -0.45], face: [0, 1], pose: 'stand' },
  pkg: { room: 'L', at: [2.9, -3.45], face: [0, -1], pose: 'stand' },
  bedF: { room: 'B', via: [[5.3, -2.0], [5.3, -0.55]], at: [5.9, -0.55], face: [1, 0], pose: 'stand', lie: [7.12, -1.32] },
  bedB: { room: 'B', via: [[5.4, -2.9]], at: [5.9, -2.85], face: [1, 0], pose: 'stand', lie: [7.12, -2.08] },
  winB: { room: 'B', via: [[5.3, -2.0], [5.3, -0.55]], at: [6.15, -0.48], face: [0, 1], pose: 'stand' },
  wardrobe: { room: 'B', at: [6.8, -3.55], face: [0, -1], pose: 'reach' },
  bath: { room: 'Ba', at: [6.1, -6.5], face: [1, 0], pose: 'stand' },
  coat: { room: 'H', at: [0.75, -5.9], face: [-1, 0], pose: 'reach' },
  door: { room: 'H', at: [2.05, -7.55], face: [0, -1], pose: 'stand' },
  sill: { room: 'L', at: [1.4, -0.22], face: [0, 1], pose: 'loaf', y: 0.86 },
  bowl: { room: 'L', at: [3.0, -3.9], face: [0, -1], pose: 'stand' },
  collapse: { room: 'L', at: [2.05, -2.3], face: [1, 0], pose: 'stand' },
};

// Lobby and shop points (world)
export const LOBBY = { stairBottom: [0.95, -3.0], stairTop: [0.95, -5.7], inside: [0, -1.0], outside: [0, 0.9], mid: [0, -2.2] };
export const DELI = { door: [-2.65, 0.6], inside: [-2.65, -0.8], counter: [-3.1, -1.15], clerk: [-3.1, -2.75], shelf: [-5.0, -3.6], fridge: [-6.8, -2.6] };
export const LAUNDRY = { door: [2.65, 0.6], inside: [2.65, -0.8], chairs: [[2.3, -2.4], [2.3, -3.2], [2.3, -4.0]], washer: [6.5, -3.0] };

const PAL = {
  wall: [0xe9e4da, 0xd9cdb8, 0xb9c7c4, 0xc9b8a8, 0xdcd6c8, 0x9fb1c2, 0xe6d3b3, 0xc4b59c, 0xa9b89f],
  floor: [0x8a5a3a, 0x9b6b43, 0x6e4a33, 0xb08560, 0x5a4033, 0x7d6250],
  sofa: [0x4a5a6a, 0x7a3b32, 0x3e5e4a, 0xa89a86, 0x2f3540, 0x8a6a4a, 0x5b4b6b, 0x6b7f8f],
  rug: [0x8c6a5a, 0x5a6a8a, 0xb8a890, 0x6a7a5a, 0x9a4a3a, 0x3c4a5c],
  duvet: [0xe8e4dc, 0x9ab0c8, 0xc8a888, 0x7a8a7a, 0xd8c0c0, 0x4a5a7a, 0xe0d4b4],
  wood: [0x7a5536, 0x5a3e2a, 0xa07a52, 0x3a2a20, 0x8b6a48],
  art: [0xc0492f, 0x2f6fa0, 0xe0b040, 0x3a8a6a, 0x9a4a8a, 0xe08050, 0x1f2f4f],
  cab: [0xf0ede6, 0x3d4a52, 0x6f8a7a, 0xa88a6a, 0x2a2a2a],
  blind: [0xf2efe6, 0xe8dcc4, 0xc8b48a, 0xdedede],
  curtain: [0x8a3a3a, 0x3a5a7a, 0xd8ccb0, 0x5a6a4a, 0x8a7a9a, 0xb8a080],
  temp: [0xffc98a, 0xffd9a8, 0xffe8cc, 0xf4f4ff],
};

export class Room {
  constructor(key, owner, min, max, shared, hasWin) {
    this.key = key; this.owner = owner; this.min = min; this.max = max; this.shared = shared;
    this.mat = makeRoomMaterial(min, max, shared, hasWin);
    this.lights = [];
    this.occ = new Set();
    this.sleepers = new Set();
    this.tvWatch = new Set();
    this.flick = 1; this.flickTarget = 1; this.flickT = 0; this.tvTint = new THREE.Vector3(0.55, 0.65, 1);
    this.lmin = min.clone(); this.lmax = max.clone();
    this.lmin.x -= 0.11; this.lmin.z -= 0.11; this.lmax.x += 0.11; this.lmax.z += 0.11;
    this.lmin.y -= 0.4;
  }
  addLight(slot, pos, hex, I, emit, kind, offHex = 0x8a8a8a) {
    const c = new THREE.Color(hex);
    this.lights[slot] = { pos, col: new THREE.Vector3(c.r, c.g, c.b), I, on: false, lv: 0, emit, kind, off: new THREE.Color(offHex) };
    this.mat.uniforms.uLP.value[slot].copy(pos);
  }
  set(slot, on) { const L = this.lights[slot]; if (L) L.on = on; }
  mainOn() { return this.lights.some((l) => l && l.on && (l.kind === 'ceiling' || l.kind === 'lamp')); }
  allOff() { for (const l of this.lights) if (l && l.kind !== 'tree' && l.kind !== 'tv') l.on = false; }
  contains(p) { return p.x >= this.lmin.x && p.x <= this.lmax.x && p.z >= this.lmin.z && p.z <= this.lmax.z && p.y >= this.lmin.y && p.y < this.max.y; }
  update(dt, realT) {
    const U = this.mat.uniforms.uLC.value;
    const day = this.shared.dayF;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      if (!L) continue;
      L.lv = damp(L.lv, L.on ? 1 : 0, L.kind === 'ceiling' ? 30 : 14, dt);
      let k = L.lv * L.I;
      if (L.kind === 'tv') {
        this.flickT -= dt;
        if (this.flickT <= 0) {
          this.flickT = 0.12 + Math.random() * 0.7;
          this.flickTarget = 0.45 + Math.random() * 0.7;
          const r = Math.random();
          this.tvTint.set(r < 0.5 ? 0.5 : r < 0.8 ? 0.85 : 1, r < 0.5 ? 0.62 : r < 0.8 ? 0.85 : 0.75, r < 0.8 ? 1 : 0.55);
        }
        this.flick = damp(this.flick, this.flickTarget, 18, dt);
        k *= this.flick;
        U[i].set(this.tvTint.x * k, this.tvTint.y * k, this.tvTint.z * k);
      } else if (L.kind === 'tree') {
        U[i].set(L.col.x * k * (0.85 + 0.15 * Math.sin(realT * 2.3)), L.col.y * k, L.col.z * k);
      } else {
        U[i].set(L.col.x * k, L.col.y * k, L.col.z * k);
      }
      if (L.emit) {
        const m = L.emit.material;
        if (L.kind === 'tv') {
          const f = L.lv * this.flick * 1.6;
          m.color.setRGB(0.02 + this.tvTint.x * f, 0.02 + this.tvTint.y * f, 0.03 + this.tvTint.z * f);
        } else {
          const offK = 0.05 + day * 0.5;
          const onK = L.lv * 3.2;
          m.color.setRGB(L.off.r * offK * (1 - L.lv) + L.col.x * onK, L.off.g * offK * (1 - L.lv) + L.col.y * onK, L.off.b * offK * (1 - L.lv) + L.col.z * onK);
        }
      }
    }
  }
}

function solid(a, b, gaps) {
  const gs = (gaps || []).map((g) => [Math.min(g[0], g[1]), Math.max(g[0], g[1])]).sort((p, q) => p[0] - q[0]);
  const out = [];
  let c = a;
  for (const [g0, g1] of gs) { if (g0 > c) out.push([c, g0]); c = Math.max(c, g1); }
  if (c < b) out.push([c, b]);
  return out;
}

// Walls, floor and ceiling of an axis-aligned room in world coordinates. doors: {xmin,xmax,zmin,zmax}
function shell(kit, b, y0, h, doors, wall, floor, ceil, opts = {}) {
  const T = 0.08, DH = 2.1;
  kit.box(b.x0, y0 - 0.06, b.z0, b.x1, y0, b.z1, floor);
  kit.box(b.x0, y0 + h, b.z0, b.x1, y0 + h + 0.06, b.z1, ceil);
  const base = opts.base ? 0xf4f1ea : null;
  const along = (side, a0, a1, mk) => {
    const gaps = doors[side] || [];
    for (const [s, e] of solid(a0, a1, gaps)) { mk(s, e, 0, h, wall); if (base) mk(s, e, 0, 0.1, base, 0.015); }
    for (const [g0, g1] of gaps) mk(Math.min(g0, g1), Math.max(g0, g1), DH, h, wall);
  };
  // back wall (zmin)
  along('zmin', b.x0, b.x1, (s, e, ya, yb, c, p = 0) => kit.box(s, y0 + ya, b.z1, e, y0 + yb, b.z1 + T + p, c));
  if (opts.front) along('zmax', b.x0, b.x1, (s, e, ya, yb, c, p = 0) => kit.box(s, y0 + ya, b.z0 - T - p, e, y0 + yb, b.z0, c));
  along('xmin', b.z1, b.z0, (s, e, ya, yb, c, p = 0) => kit.box(b.x0, y0 + ya, s, b.x0 + T + p, y0 + yb, e, c));
  along('xmax', b.z1, b.z0, (s, e, ya, yb, c, p = 0) => kit.box(b.x1 - T - p, y0 + ya, s, b.x1, y0 + yb, e, c));
}

function emitterMesh(geo, scene) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
  scene.add(m);
  return m;
}

function brickTextures(base, seed, mortar = '#8a8278') {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const W = 512, rows = 29, cols = 10;
  const rh = W / rows, cw = W / cols;
  const col = new THREE.Color(base);
  const map = canvasTex(W, W, (g) => {
    g.fillStyle = mortar; g.fillRect(0, 0, W, W);
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * cw / 2;
      for (let x = -1; x <= cols; x++) {
        const c = col.clone();
        const k = 0.78 + r() * 0.36;
        c.multiplyScalar(k);
        if (r() < 0.06) c.lerp(new THREE.Color(0x3a2a22), 0.4);
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x * cw + off + 1.6, y * rh + 1.4, cw - 3.2, rh - 2.8);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x * cw + off + 1.6, y * rh + rh - 4, cw - 3.2, 2.5);
      }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = canvasTex(W, W, (g) => {
    g.fillStyle = '#202020'; g.fillRect(0, 0, W, W);
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * cw / 2;
      for (let x = -1; x <= cols; x++) { const v = 200 + Math.floor(r() * 50); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x * cw + off + 2, y * rh + 1.8, cw - 4, rh - 3.6); }
    }
  }, false);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

function noiseTex(w, h, base, spread, lines, srgb = true) {
  const t = canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * spread; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    if (lines) lines(g, w, h);
  }, srgb);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTex(text, bg, fg, w = 1024, h = 128, font = 'bold 56px Georgia, serif') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// ---- Build everything
export function buildBuilding(scene, rng, shared) {
  const B = { units: [], rooms: [], windows: [], emitters: [], doors: [], decor: { snow: [], xmas: [], halloween: [], foliage: [] }, lamps: [], shared };
  const ext = {
    brick: null,
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    glass: new THREE.MeshBasicMaterial({ color: 0x8fa7bd, transparent: true, opacity: 0.1, depthWrite: false }),
    snow: new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.9 }),
  };
  B.ext = ext;
  const bt = brickTextures(0x8b4632, 7);
  ext.brick = new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: 1.2, roughness: 0.92 });
  const brickK = new Kit(), trimK = new Kit(), metalK = new Kit(), glassK = new Kit(), snowK = new Kit();
  const snowTop = (x0, y, z0, x1, z1, t = 0.05) => snowK.box(x0, y, z0, x1, y + t, z1, 0xffffff);
  const STONE = 0xc9bba3, FRAME = 0xeeeae2, DARK = 0x2a332f, IRON = 0x1d1f22;

  // ---- Apartments
  let uidx = 0;
  for (let f = 0; f < FLOORS; f++) {
    for (let side = 0; side < 2; side++) {
      const unit = buildUnit(scene, rng, shared, f, side, uidx++);
      B.units.push(unit);
      for (const k in unit.rooms) B.rooms.push(unit.rooms[k]);
      B.emitters.push(...unit.emitters);
    }
  }

  // ---- Residential facade with window holes
  for (let f = 0; f < FLOORS; f++) {
    const y0 = GH + f * FH;
    const holes = [];
    for (const u of B.units.filter((u) => u.floor === f)) for (const w of u.windows) holes.push([w.x - WW / 2, w.x + WW / 2]);
    brickK.box(-BW, y0, 0, BW, y0 + SILL, FZ, 0xffffff);
    brickK.box(-BW, y0 + HEAD, 0, BW, y0 + FH, FZ, 0xffffff);
    for (const [s, e] of solid(-BW, BW, holes)) brickK.box(s, y0 + SILL, 0, e, y0 + HEAD, FZ, 0xffffff);
  }
  for (const u of B.units) {
    for (const w of u.windows) {
      const x = w.x, y0 = u.y;
      trimK.box(x - 0.72, y0 + SILL - 0.09, FZ + 0.08, x + 0.72, y0 + SILL + 0.01, 0.13, STONE, 0.2);
      trimK.box(x - 0.74, y0 + HEAD, -0.02, x + 0.74, y0 + HEAD + 0.24, 0.045, STONE, 0.15);
      trimK.box(x - 0.08, y0 + HEAD + 0.02, 0.04, x + 0.08, y0 + HEAD + 0.25, 0.07, 0xd6cab4);
      snowTop(x - 0.72, y0 + SILL + 0.01, FZ + 0.08, x + 0.72, 0.13);
      snowTop(x - 0.74, y0 + HEAD + 0.24, -0.02, x + 0.74, 0.045, 0.04);
      const zf0 = FZ + 0.08, zf1 = FZ + 0.15, fc = u.frame;
      trimK.box(x - 0.6, y0 + SILL, zf0, x - 0.54, y0 + HEAD, zf1, fc);
      trimK.box(x + 0.54, y0 + SILL, zf0, x + 0.6, y0 + HEAD, zf1, fc);
      trimK.box(x - 0.6, y0 + HEAD - 0.07, zf0, x + 0.6, y0 + HEAD, zf1, fc);
      trimK.box(x - 0.6, y0 + SILL, zf0, x + 0.6, y0 + SILL + 0.07, zf1, fc);
      trimK.box(x - 0.6, y0 + SILL + 0.84, zf0 - 0.03, x + 0.6, y0 + SILL + 0.9, zf1, fc);
      glassK.box(x - 0.55, y0 + SILL + 0.05, FZ + 0.115, x + 0.55, y0 + HEAD - 0.05, FZ + 0.118, 0xffffff);
      if (w.ac) {
        trimK.box(x - 0.34, y0 + SILL + 0.02, FZ - 0.1, x + 0.34, y0 + SILL + 0.46, 0.38, 0xd9d5ca, 0.25);
        trimK.box(x - 0.3, y0 + SILL + 0.06, 0.381, x + 0.3, y0 + SILL + 0.4, 0.385, 0x9a978e);
        trimK.box(x - 0.54, y0 + SILL + 0.46, FZ + 0.1, x + 0.54, y0 + SILL + 0.5, FZ + 0.16, fc);
        snowTop(x - 0.34, y0 + SILL + 0.46, FZ + 0.1, x + 0.34, 0.38, 0.06);
      }
      B.windows.push({ unit: u, x, y0, win: w });
    }
  }
  // string course, cornice, parapet, sides, roof
  trimK.box(-BW - 0.05, GH - 0.18, -0.02, BW + 0.05, GH + 0.05, 0.12, STONE, 0.2);
  snowTop(-BW - 0.05, GH + 0.05, -0.02, BW + 0.05, 0.12);
  trimK.box(-BW, TOP - 0.45, -0.02, BW, TOP, 0.07, 0x4a423a);
  trimK.box(-BW - 0.12, TOP, -0.02, BW + 0.12, TOP + 0.36, 0.58, 0x3d3631, 0.35);
  for (let x = -BW + 0.35; x <= BW - 0.3; x += 1.0) trimK.box(x - 0.07, TOP - 0.42, 0.06, x + 0.07, TOP, 0.48, 0x3d3631, 0.4);
  snowTop(-BW - 0.12, TOP + 0.36, -0.02, BW + 0.12, 0.58, 0.07);
  brickK.box(-BW, TOP, 0, BW, TOP + 0.95, FZ, 0xffffff);
  trimK.box(-BW - 0.02, TOP + 0.95, 0.02, BW + 0.02, TOP + 1.02, FZ - 0.02, STONE);
  brickK.box(-BW - 0.25, 0, 0, -BW, TOP + 1.0, -UD - 0.6, 0xffffff);
  brickK.box(BW, 0, 0, BW + 0.25, TOP + 1.0, -UD - 0.6, 0xffffff);
  brickK.box(-BW, TOP + 0.6, -UD - 0.6, BW, TOP + 1.0, -UD - 0.3, 0xffffff);
  trimK.box(-BW, TOP - 0.05, FZ, BW, TOP + 0.12, -UD - 0.3, 0x3a3836);
  brickK.box(1.8, TOP, -2.8, 4.6, TOP + 2.5, -5.8, 0xffffff);
  trimK.box(1.7, TOP + 2.5, -2.7, 4.7, TOP + 2.62, -5.9, 0x3d3631);
  snowTop(1.7, TOP + 2.62, -2.7, 4.7, -5.9, 0.08);
  // water tower
  const wtx = -3.2, wtz = -5.6, wty = TOP + 0.1;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) metalK.beam(wtx + dx * 1.15, wty, wtz + dz * 1.15, wtx + dx * 1.0, wty + 2.0, wtz + dz * 1.0, 0.12, 0x2a2622);
  metalK.beam(wtx - 1.1, wty + 0.9, wtz + 1.1, wtx + 1.1, wty + 0.9, wtz + 1.1, 0.06, 0x2a2622);
  metalK.box(wtx - 1.4, wty + 2.0, wtz - 1.4, wtx + 1.4, wty + 2.12, wtz + 1.4, 0x2a2622);
  const tank = new THREE.CylinderGeometry(1.25, 1.3, 2.4, 20, 1, true); tank.translate(wtx, wty + 3.32, wtz); trimK.geo(tank, 0x7a5a3e, 0.25);
  const tankTop = new THREE.CylinderGeometry(1.26, 1.26, 0.05, 20); tankTop.translate(wtx, wty + 4.52, wtz); trimK.geo(tankTop, 0x6b4c34);
  for (const hy of [2.4, 3.1, 3.8, 4.4]) { const h = new THREE.CylinderGeometry(1.3, 1.3, 0.04, 20, 1, true); h.translate(wtx, wty + hy, wtz); metalK.geo(h, 0x1a1a1a); }
  const cone = new THREE.ConeGeometry(1.42, 0.95, 20); cone.translate(wtx, wty + 5.0, wtz); trimK.geo(cone, 0x4a3a2e, 0.2);
  const cone2 = new THREE.ConeGeometry(1.44, 0.2, 20); cone2.translate(wtx, wty + 4.7, wtz); snowK.geo(cone2, 0xffffff);

  // ---- Fire escape over the two bedroom windows
  for (let f = 0; f < FLOORS; f++) {
    const yp = GH + f * FH + 0.35;
    metalK.box(-2.6, yp - 0.05, 0.05, 2.6, yp, 1.15, IRON);
    snowTop(-2.6, yp, 0.05, 2.6, 1.15, 0.05);
    for (const yr of [0.5, 0.95]) {
      metalK.box(-2.62, yp + yr, 1.11, 2.62, yp + yr + 0.035, 1.15, IRON);
      metalK.box(-2.62, yp + yr, 0.05, -2.58, yp + yr + 0.035, 1.15, IRON);
      metalK.box(2.58, yp + yr, 0.05, 2.62, yp + yr + 0.035, 1.15, IRON);
    }
    for (let x = -2.6; x <= 2.61; x += 0.15) metalK.box(x - 0.01, yp, 1.12, x + 0.01, yp + 0.95, 1.14, IRON);
    for (let z = 0.15; z < 1.12; z += 0.15) { metalK.box(-2.61, yp, z - 0.01, -2.59, yp + 0.95, z + 0.01, IRON); metalK.box(2.59, yp, z - 0.01, 2.61, yp + 0.95, z + 0.01, IRON); }
    for (const x of [-2.4, 0, 2.4]) metalK.beam(x, yp - 0.04, 1.05, x, yp - 0.7, 0.02, 0.05, IRON);
    if (f < FLOORS - 1) {
      const y1 = yp + FH;
      for (const z of [0.4, 0.88]) metalK.beam(-2.2, yp, z, -0.2, y1, z, 0.05, IRON);
      for (let i = 1; i < 12; i++) { const t = i / 12; const x = -2.2 + 2.0 * t, y = yp + FH * t; metalK.box(x - 0.09, y - 0.015, 0.4, x + 0.09, y + 0.015, 0.88, IRON); }
      metalK.beam(-2.2, yp + 0.9, 0.9, -0.2, y1 + 0.9, 0.9, 0.035, IRON);
    } else {
      metalK.box(-2.4, yp, 0.4, -1.95, yp + 1.6, 0.44, IRON);
    }
  }
  for (const x of [1.95, 2.4]) metalK.box(x - 0.02, 2.7, 0.92, x + 0.02, GH + 0.35, 0.96, IRON);
  for (let y = 2.8; y < GH + 0.3; y += 0.3) metalK.box(1.95, y, 0.92, 2.4, y + 0.025, 0.96, IRON);

  // ---- Ground floor: deli, lobby, laundromat
  const GF = 0x313b37;
  trimK.box(-BW, 0, 0.02, -7.0, GH - 0.18, FZ, STONE, 0.2);
  trimK.box(7.0, 0, 0.02, BW, GH - 0.18, FZ, STONE, 0.2);
  trimK.box(-2.3, 0, 0.02, -0.75, GH - 0.18, FZ, STONE, 0.2);
  trimK.box(0.75, 0, 0.02, 2.3, GH - 0.18, FZ, STONE, 0.2);
  trimK.box(-0.75, 3.25, 0.02, 0.75, GH - 0.18, FZ, STONE, 0.2);
  for (const [a, b] of [[-7.0, -2.3], [2.3, 7.0]]) {
    trimK.box(a, 0, 0.0, b, 0.55, FZ, GF, 0.3);
    trimK.box(a, 3.25, 0.0, b, GH - 0.18, FZ, GF);
    trimK.box(a, 3.18, -0.05, b, 3.28, FZ + 0.05, GF);
    for (const x of [a, (a + b) / 2 - 0.4, b - 0.75, b]) trimK.box(x - 0.05, 0.55, -0.04, x + 0.05, 3.25, FZ + 0.06, GF);
    trimK.box(a, 0.52, -0.04, b, 0.6, FZ + 0.06, GF);
  }
  // storefront glass, with the shop door left open
  glassK.box(-7.0, 0.6, FZ + 0.12, -3.05, 3.18, FZ + 0.13, 0xffffff);
  glassK.box(-2.3 - 0.0, 2.75, FZ + 0.12, -3.05, 3.18, FZ + 0.13, 0xffffff);
  glassK.box(3.05, 0.6, FZ + 0.12, 7.0, 3.18, FZ + 0.13, 0xffffff);
  glassK.box(2.3, 2.75, FZ + 0.12, 3.05, 3.18, FZ + 0.13, 0xffffff);
  trimK.box(-3.05, 0.15, FZ + 0.1, -2.98, 2.75, FZ + 0.16, GF);
  trimK.box(2.98, 0.15, FZ + 0.1, 3.05, 2.75, FZ + 0.16, GF);
  trimK.box(-3.05, 2.7, FZ + 0.1, -2.3, 2.77, FZ + 0.16, GF);
  trimK.box(2.3, 2.7, FZ + 0.1, 3.05, 2.77, FZ + 0.16, GF);
  // lobby door frame and transom
  trimK.box(-0.75, 2.6, -0.04, 0.75, 2.72, FZ + 0.04, 0x262b29);
  trimK.box(-0.75, 0.15, -0.04, -0.7, 3.25, FZ + 0.04, 0x262b29);
  trimK.box(0.7, 0.15, -0.04, 0.75, 3.25, FZ + 0.04, 0x262b29);
  glassK.box(-0.7, 2.72, FZ + 0.12, 0.7, 3.2, FZ + 0.13, 0xffffff);
  trimK.box(-1.05, 3.25, -0.04, 1.05, 3.45, 0.16, STONE, 0.2);
  snowTop(-1.05, 3.45, -0.04, 1.05, 0.16);
  // door step
  trimK.box(-1.0, 0.0, 0.0, 1.0, SW_Y + 0.12, 0.55, 0xb2a894, 0.3);
  snowTop(-1.0, SW_Y + 0.12, 0.0, 1.0, 0.55, 0.03);
  B.lobbyDoors = [];
  for (const sd of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sd * 0.7, SW_Y + 0.12, FZ + 0.14);
    const dk = new Kit();
    const lx0 = sd < 0 ? 0 : -0.7, lx1 = sd < 0 ? 0.7 : 0;
    dk.box(lx0, 0, -0.03, lx1, 0.12, 0.03, 0x262b29);
    dk.box(lx0, 2.3, -0.03, lx1, 2.43, 0.03, 0x262b29);
    dk.box(lx0, 0, -0.03, lx0 + 0.08, 2.43, 0.03, 0x262b29);
    dk.box(lx1 - 0.08, 0, -0.03, lx1, 2.43, 0.03, 0x262b29);
    dk.box(lx0, 1.05, -0.035, lx1, 1.12, 0.035, 0xb59a5a);
    const dm = new THREE.Mesh(dk.build(), ext.trim);
    pivot.add(dm);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 2.18), ext.glass);
    gl.position.set((lx0 + lx1) / 2, 1.215, 0);
    pivot.add(gl);
    scene.add(pivot);
    B.lobbyDoors.push({ pivot, sd, open: 0 });
  }

  // signs and awning
  const deliSign = signTex('DELI  ·  GROCERY  ·  COFFEE', '#1f3b2d', '#f3e6c4');
  const laundrySign = signTex('SUDS & SPIN  LAUNDROMAT', '#23344f', '#f0f0e8');
  B.signs = [];
  for (const [tex, x0, x1] of [[deliSign, -7.0, -2.3], [laundrySign, 2.3, 7.0]]) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.62, 0.08), [ext.trim, ext.trim, ext.trim, ext.trim, mat, ext.trim]);
    paint(m.geometry, GF);
    m.position.set((x0 + x1) / 2, 3.72, 0.06);
    scene.add(m);
    B.signs.push(mat);
  }
  const awnTex = canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2ede2' : '#9b2a25'; g.fillRect(i * w / 16, 0, w / 16 + 1, h); } g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10); });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.45), new THREE.MeshStandardMaterial({ map: awnTex, roughness: 0.9, side: THREE.DoubleSide }));
  awn.position.set(-4.65, 3.06, 0.62);
  awn.rotation.x = -1.05;
  scene.add(awn);
  const awnSnow = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.45), ext.snow);
  awnSnow.position.set(-4.65, 3.1, 0.64); awnSnow.rotation.x = -1.05; awnSnow.scale.set(0.98, 0.98, 1);
  scene.add(awnSnow); B.decor.snow.push(awnSnow);
  const awnValance = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: 0x9b2a25, roughness: 0.9 }));
  awnValance.position.set(-4.65, 2.68, 1.25); scene.add(awnValance);
  // neon OPEN sign in the deli window
  const openTex = canvasTex(256, 96, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#ff3b3b'; g.lineWidth = 6; g.strokeRect(8, 8, 240, 80); g.fillStyle = '#ff5050'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OPEN', 128, 50); });
  B.openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshBasicMaterial({ map: openTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  B.openSign.position.set(-5.2, 1.9, FZ + 0.08);
  scene.add(B.openSign);

  // ---- Ground floor rooms
  buildLobby(B, scene, shared);
  buildDeli(B, scene, shared, rng);
  buildLaundry(B, scene, shared, rng);

  // ---- Street
  buildStreet(B, scene, ext, snowK, rng);

  // ---- Merge exterior kits
  const bg = brickK.build(); planarUV(bg, 0.5);
  B.brickMesh = new THREE.Mesh(bg, ext.brick); scene.add(B.brickMesh);
  scene.add(new THREE.Mesh(trimK.build(), ext.trim));
  scene.add(new THREE.Mesh(metalK.build(), ext.metal));
  const gm = new THREE.Mesh(glassK.build(), ext.glass); gm.renderOrder = 2; scene.add(gm);
  const sm = new THREE.Mesh(snowK.build(), ext.snow); scene.add(sm); B.decor.snow.push(sm);

  buildNeighbors(B, scene, rng);
  buildDecor(B, scene, rng);
  return B;
}

// ---- One apartment
function buildUnit(scene, rng, shared, floor, side, index) {
  const mirror = side === 1;
  const x0 = side ? 0 : -UW;
  const y = GH + floor * FH;
  const X = (lx) => (mirror ? x0 + (UW - lx) : x0 + lx);
  const Z = (lz) => FZ + lz;
  const W = (p) => [X(p[0]), Z(p[1])];
  const u = {
    index, floor, side, mirror, x0, y, name: `${floor + 2}${side ? 'B' : 'A'}`, X, Z, W,
    rooms: {}, windows: [], emitters: [], residents: [], pets: [], props: [],
    cx: X(UW / 2), frame: pick(rng, [0xeeeae2, 0xeeeae2, 0x2b3a2f, 0x3a2a22, 0xd8d0c0]),
  };
  const pal = {
    wall: pick(rng, PAL.wall), wall2: pick(rng, PAL.wall), floor: pick(rng, PAL.floor), sofa: pick(rng, PAL.sofa), rug: pick(rng, PAL.rug),
    duvet: pick(rng, PAL.duvet), wood: pick(rng, PAL.wood), wood2: pick(rng, PAL.wood), art: pick(rng, PAL.art), art2: pick(rng, PAL.art), cab: pick(rng, PAL.cab),
    blind: pick(rng, PAL.blind), curtain: rng() < 0.6 ? pick(rng, PAL.curtain) : null, temp: pick(rng, PAL.temp),
  };
  u.pal = pal;
  const lb = (k, ax, ay, az, bx, by, bz, hex, sh = 0) => k.box(X(ax), y + ay, Z(az), X(bx), y + by, Z(bz), hex, sh);
  const lgeo = (k, geo, lx, ly, lz, hex, sh = 0) => { paint(geo, hex, sh); geo.translate(X(lx), y + ly, Z(lz)); k.parts.push(geo); return geo; };
  const V = (lx, ly, lz) => new THREE.Vector3(X(lx), y + ly, Z(lz));

  for (const key of Object.keys(RDEF)) {
    const d = RDEF[key];
    const wx0 = Math.min(X(d.x0), X(d.x1)), wx1 = Math.max(X(d.x0), X(d.x1));
    const min = new THREE.Vector3(wx0, y, Z(d.z1)), max = new THREE.Vector3(wx1, y + CH, Z(d.z0));
    const room = new Room(key, u, min, max, shared, key === 'L' || key === 'B');
    u.rooms[key] = room;
    const k = new Kit();
    const doors = {};
    const mapZ = (gs) => gs.map(([a, b]) => [Z(a), Z(b)]);
    const mapX = (gs) => gs.map(([a, b]) => [X(a), X(b)]);
    if (d.doors.x0) doors[mirror ? 'xmax' : 'xmin'] = mapZ(d.doors.x0);
    if (d.doors.x1) doors[mirror ? 'xmin' : 'xmax'] = mapZ(d.doors.x1);
    if (d.doors.z1) doors.zmin = mapX(d.doors.z1);
    if (d.doors.z0) doors.zmax = mapX(d.doors.z0);
    const wallC = key === 'Ba' ? 0xdfe6e8 : key === 'B' ? pal.wall2 : pal.wall;
    const floorC = key === 'Ba' ? 0xcfd2d0 : pal.floor;
    shell(k, { x0: wx0, x1: wx1, z0: max.z, z1: min.z }, y, CH, doors, wallC, floorC, 0xf2efe8, { front: d.front, base: key === 'L' || key === 'B' });
    room.kit = k;
  }
  const kL = u.rooms.L.kit, kB = u.rooms.B.kit, kH = u.rooms.H.kit, kBa = u.rooms.Ba.kit;

  // Living room
  lb(kL, 1.1, 0, -1.2, 3.75, 0.015, -3.35, pal.rug);
  lb(kL, 0.1, 0, -1.2, 1.0, 0.4, -3.0, pal.sofa, 0.45);
  lb(kL, 0.1, 0.4, -1.2, 0.34, 0.88, -3.0, pal.sofa, 0.2);
  lb(kL, 0.1, 0.4, -1.2, 1.0, 0.62, -1.4, pal.sofa, 0.25);
  lb(kL, 0.1, 0.4, -2.8, 1.0, 0.62, -3.0, pal.sofa, 0.25);
  lb(kL, 0.34, 0.4, -1.4, 0.98, 0.5, -2.8, new THREE.Color(pal.sofa).multiplyScalar(1.15).getHex());
  lb(kL, 0.34, 0.5, -1.5, 0.48, 0.78, -1.85, pal.art2);
  lb(kL, 1.5, 0.37, -1.6, 1.95, 0.41, -2.6, pal.wood);
  for (const [lx, lz] of [[1.53, -1.63], [1.92, -1.63], [1.53, -2.57], [1.92, -2.57]]) lb(kL, lx - 0.02, 0, lz - 0.02, lx + 0.02, 0.37, lz + 0.02, pal.wood);
  lb(kL, 4.15, 0, -1.5, 4.56, 0.5, -2.7, pal.wood2, 0.35);
  lb(kL, 4.47, 0.58, -1.47, 4.53, 1.32, -2.73, 0x111214);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.66), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
  tvScreen.position.copy(V(4.465, 0.95, -2.1)); tvScreen.rotation.y = Math.PI / 2;
  scene.add(tvScreen); u.emitters.push(tvScreen);
  lb(kL, 0.27, 0, -0.8, 0.45, 0.03, -1.0, 0x2a2a2a);
  lb(kL, 0.34, 0, -0.88, 0.37, 1.38, -0.92, 0x2a2a2a);
  const floorShade = emitterMesh(new THREE.CylinderGeometry(0.15, 0.22, 0.3, 14).translate(...V(0.36, 1.45, -0.9).toArray()), scene);
  // kitchen
  lb(kL, 0.1, 0, -3.75, 0.8, 1.85, -4.45, pick(rng, [0xdfe2e4, 0xa8adb2, 0xe8e4da]), 0.15);
  lb(kL, 0.8, 0, -3.86, 2.7, 0.86, -4.45, pal.cab, 0.35);
  lb(kL, 0.78, 0.86, -3.82, 2.72, 0.91, -4.45, pick(rng, [0x2b2b2b, 0xd8d4cc, 0x6a6058]));
  lb(kL, 1.6, 0.91, -3.95, 2.2, 0.925, -4.35, 0x18181a);
  const burner = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  burner.rotation.x = -Math.PI / 2; burner.position.copy(V(1.75, 0.93, -4.05)); scene.add(burner);
  u.burner = burner;
  lb(kL, 0.8, 1.5, -4.12, 2.7, 2.2, -4.45, pal.cab, 0.1);
  lb(kL, 1.6, 1.85, -4.0, 2.2, 2.0, -4.45, 0x9aa0a6);
  lb(kL, 0.8, 0.91, -4.42, 2.7, 1.5, -4.45, pick(rng, [0xe8e8e2, 0x9fb7c0, 0xc9b9a0]));
  lb(kL, 1.7, 0.925, -4.0, 1.85, 1.05, -4.15, 0x4a4a4a);
  // a small table under the window, two chairs facing out at the street
  lb(kL, 2.72, 0.7, -0.06, 3.88, 0.74, -0.66, pal.wood);
  for (const tx of [2.78, 3.82]) for (const tz of [-0.1, -0.62]) lb(kL, tx - 0.025, 0, tz - 0.025, tx + 0.025, 0.7, tz + 0.025, pal.wood);
  for (const cx of [3.0, 3.6]) {
    lb(kL, cx - 0.2, 0.44, -0.75, cx + 0.2, 0.48, -1.15, pal.wood2);
    lb(kL, cx - 0.03, 0, -0.92, cx + 0.03, 0.44, -0.98, pal.wood2);
    lb(kL, cx - 0.19, 0.48, -1.13, cx + 0.19, 0.92, -1.17, pal.wood2);
  }
  lb(kL, 0.09, 1.25, -1.55, 0.12, 1.95, -2.65, pal.art);
  lb(kL, 0.085, 1.22, -1.52, 0.11, 1.98, -2.68, 0x1a1a1a);
  lb(kL, 4.5, 1.4, -0.4, 4.52, 2.0, -1.0, pal.art2);
  // plant (separate, hidden when the tree is up)
  const plantK = new Kit();
  lb(plantK, 4.15, 0, -0.3, 4.45, 0.35, -0.6, 0xa0583a, 0.3);
  lgeo(plantK, new THREE.IcosahedronGeometry(0.33, 0), 4.3, 0.72, -0.45, 0x3f6b35, 0.3);
  lgeo(plantK, new THREE.IcosahedronGeometry(0.24, 0), 4.25, 1.02, -0.4, 0x4f7d3f, 0.2);
  u.plant = new THREE.Mesh(plantK.build(), u.rooms.L.mat); scene.add(u.plant);
  // Bedroom
  lb(kB, 5.0, 0, -0.6, 7.3, 0.015, -3.05, pal.rug);
  lb(kB, 5.7, 0, -0.9, 7.4, 0.33, -2.5, pal.wood, 0.4);
  lb(kB, 5.75, 0.33, -0.95, 7.35, 0.53, -2.45, 0xf4f1ea);
  lb(kB, 5.68, 0.48, -0.87, 6.95, 0.62, -2.53, pal.duvet, 0.25);
  lb(kB, 6.95, 0.53, -1.0, 7.3, 0.68, -1.62, 0xf6f3ee);
  lb(kB, 6.95, 0.53, -1.78, 7.3, 0.68, -2.4, 0xf6f3ee);
  lb(kB, 7.35, 0, -0.85, 7.45, 1.15, -2.55, pal.wood2, 0.2);
  lb(kB, 7.0, 0, -0.4, 7.45, 0.55, -0.82, pal.wood, 0.3);
  lb(kB, 7.0, 0, -2.6, 7.45, 0.55, -3.02, pal.wood, 0.3);
  lb(kB, 7.17, 0.55, -0.56, 7.27, 0.75, -0.66, 0x2a2a2a);
  const bedShade = emitterMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.17, 12).translate(...V(7.22, 0.84, -0.61).toArray()), scene);
  lb(kB, 6.2, 0, -4.0, 7.45, 2.05, -4.45, pal.wood2, 0.2);
  lb(kB, 6.81, 0.1, -3.99, 6.84, 1.95, -4.0, 0x1a1a1a);
  lb(kB, 5.25, 0, -4.05, 6.1, 0.85, -4.45, pal.wood, 0.3);
  lb(kB, 5.45, 1.0, -4.41, 5.9, 1.65, -4.44, 0xa8b8c8);
  lb(kB, 7.42, 1.35, -1.2, 7.45, 1.95, -2.2, pal.art2);
  // Hall
  lb(kH, 0.1, 0, -5.3, 0.45, 0.8, -6.4, pal.wood);
  lb(kH, 0.1, 1.62, -5.6, 0.2, 1.67, -6.6, 0x3a3a3a);
  lb(kH, 0.12, 1.0, -5.75, 0.3, 1.6, -5.95, 0x3d4a6a);
  lb(kH, 1.6, 0, -7.9, 2.5, 2.1, -7.94, 0x6b4a32, 0.15);
  lb(kH, 2.35, 1.0, -7.86, 2.42, 1.06, -7.9, 0xb59a5a);
  lb(kH, 2.0, 0, -6.8, 3.2, 0.012, -7.6, pal.rug);
  // Bath
  lb(kBa, 4.9, 0, -7.2, 7.4, 0.55, -7.92, 0xf4f4f2, 0.3);
  lb(kBa, 6.8, 0, -5.0, 7.3, 0.45, -5.6, 0xf4f4f2, 0.3);
  lb(kBa, 5.0, 0, -4.85, 5.6, 0.85, -5.3, 0xf4f4f2, 0.3);
  lb(kBa, 5.0, 1.1, -4.8, 5.6, 1.7, -4.83, 0xb0c4d4);
  lb(kBa, 4.9, 0.55, -7.88, 7.4, 2.0, -7.92, 0xd0dfe4);

  // Lights
  const temp = pal.temp;
  const ceilShape = (lx, lz) => emitterMesh(new THREE.CylinderGeometry(0.2, 0.16, 0.07, 16).translate(...V(lx, CH - 0.04, lz).toArray()), scene);
  const cL = ceilShape(2.3, -2.3), cB = ceilShape(6.15, -2.2), cH = ceilShape(2.3, -6.3), cBa = ceilShape(6.1, -6.4);
  u.rooms.L.addLight(0, V(2.3, CH - 0.25, -2.3), temp, 6.5, cL, 'ceiling', 0xeeeeee);
  u.rooms.L.addLight(1, V(0.36, 1.45, -0.9), 0xffb070, 4.2, floorShade, 'lamp', 0xd8c8a8);
  u.rooms.L.addLight(2, V(4.1, 1.0, -2.1), 0x9ab0ff, 3.0, tvScreen, 'tv');
  u.rooms.B.addLight(0, V(6.15, CH - 0.25, -2.2), temp, 5.8, cB, 'ceiling', 0xeeeeee);
  u.rooms.B.addLight(1, V(7.15, 0.95, -0.65), 0xffa860, 3.0, bedShade, 'lamp', 0xe0d0b0);
  u.rooms.H.addLight(0, V(2.3, CH - 0.25, -6.3), temp, 4.5, cH, 'ceiling', 0xeeeeee);
  u.rooms.Ba.addLight(0, V(6.1, CH - 0.25, -6.4), 0xf2f6ff, 4.5, cBa, 'ceiling', 0xeeeeee);
  u.emitters.push(cL, cB, cH, cBa, floorShade, bedShade, burner);

  // Windows, curtains and blinds
  const acIdx = rng() < 0.4 ? (rng() < 0.5 ? 0 : 2) : -1; // never the window over the table
  for (let i = 0; i < WINS.length; i++) {
    const wdef = WINS[i];
    const room = u.rooms[wdef.room];
    const w = { room: wdef.room, x: X(wdef.cx), cx: wdef.cx, ac: i === acIdx, blindTarget: 0.08, blind: null };
    if (pal.curtain) {
      lb(room.kit, wdef.cx - 0.78, 0.3, -0.1, wdef.cx - 0.5, 2.72, -0.16, pal.curtain, 0.3);
      lb(room.kit, wdef.cx + 0.5, 0.3, -0.1, wdef.cx + 0.78, 2.72, -0.16, pal.curtain, 0.3);
      lb(room.kit, wdef.cx - 0.85, 2.74, -0.08, wdef.cx + 0.85, 2.77, -0.12, 0x2a2a2a);
    }
    const bg = new THREE.BoxGeometry(1.14, 1, 0.025); bg.translate(0, -0.5, 0); paint(bg, pal.blind);
    const blind = new THREE.Mesh(bg, room.mat);
    blind.position.copy(V(wdef.cx, HEAD - 0.03, -0.05));
    blind.scale.y = 0.08;
    scene.add(blind);
    w.blind = blind;
    lb(room.kit, wdef.cx - 0.6, HEAD - 0.08, -0.03, wdef.cx + 0.6, HEAD, -0.08, pal.blind);
    u.windows.push(w);
  }
  for (const key of Object.keys(u.rooms)) {
    const r = u.rooms[key];
    const m = new THREE.Mesh(r.kit.build(), r.mat);
    scene.add(m);
    r.mesh = m;
    r.kit = null;
  }

  // Navigation in world space
  u.nodes = {};
  for (const k in NODES) u.nodes[k] = W(NODES[k]);
  u.adj = {};
  for (const [a, b] of EDGES) { (u.adj[a] ||= []).push(b); (u.adj[b] ||= []).push(a); }
  u.spots = {};
  for (const k in SPOTS) {
    const s = SPOTS[k];
    const fx = mirror ? -s.face[0] : s.face[0];
    u.spots[k] = {
      key: k, room: s.room, at: W(s.at), via: (s.via || []).map(W), yaw: Math.atan2(fx, s.face[1]), pose: s.pose, seat: s.seat || 0,
      lie: s.lie ? W(s.lie) : null, lieYaw: Math.atan2(mirror ? 1 : -1, 0), lieYaw0: Math.atan2(mirror ? 1 : -1, 0), y: s.y || 0,
    };
  }
  u.claims = {};
  u.roomKeyAt = (p) => { for (const k in u.rooms) if (u.rooms[k].contains(p)) return k; return null; };
  u.bfs = (a, b) => {
    if (a === b) return [a];
    const prev = { [a]: null }; const q = [a];
    while (q.length) { const n = q.shift(); for (const m of u.adj[n] || []) if (!(m in prev)) { prev[m] = n; if (m === b) { const out = [b]; let c = n; while (c) { out.unshift(c); c = prev[c]; } return out; } q.push(m); } }
    return [a, b];
  };
  return u;
}

function buildLobby(B, scene, shared) {
  const min = new THREE.Vector3(-1.6, SW_Y, -6.5), max = new THREE.Vector3(1.6, GH - 0.2, FZ);
  const room = new Room('lobby', 'lobby', min, max, shared, true);
  const k = new Kit();
  shell(k, { x0: -1.6, x1: 1.6, z0: FZ, z1: -6.5 }, SW_Y, GH - 0.35, {}, 0xd8cdb6, 0xd9d2c3, 0xf0ece4, { base: true });
  k.box(-1.5, SW_Y, -0.6, 1.5, SW_Y + 0.012, -2.6, 0x7a2e2a);
  k.box(-1.55, 1.0, -1.2, -1.45, 1.95, -2.8, 0xa88a4e, 0.2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k.box(-1.452, 1.08 + j * 0.22, -1.27 - i * 0.38, -1.44, 1.24 + j * 0.22, -1.6 - i * 0.38, 0x7a6234);
  for (let i = 0; i < 10; i++) k.box(0.4, SW_Y, -3.15 - i * 0.28, 1.5, SW_Y + 0.18 * (i + 1), -3.43 - i * 0.28, 0x8a6a4a, 0.15);
  k.box(0.36, SW_Y, -3.1, 0.4, SW_Y + 2.7, -6.0, 0x5a4030);
  k.box(-1.5, SW_Y, -4.5, -0.9, SW_Y + 0.9, -5.0, 0x4a3a2a, 0.3);
  k.box(-1.3, SW_Y + 0.9, -4.6, -1.15, SW_Y + 1.25, -4.75, 0x3d6b35);
  room.mesh = new THREE.Mesh(k.build(), room.mat); scene.add(room.mesh);
  const em = emitterMesh(new THREE.SphereGeometry(0.17, 14, 10).translate(0, GH - 0.75, -2.4), scene);
  room.addLight(0, new THREE.Vector3(0, GH - 0.9, -2.4), 0xffd6a0, 3.4, em, 'ceiling', 0xf0e8d8);
  room.addLight(1, new THREE.Vector3(0, GH - 1.0, -5.0), 0xffd6a0, 1.6, null, 'ceiling');
  room.set(0, true); room.set(1, true);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6).translate(0, GH - 0.45, -2.4), room.mat);
  paint(cord.geometry, 0x222222); scene.add(cord);
  B.lobby = room; B.rooms.push(room); B.emitters.push(em);
}

function buildDeli(B, scene, shared, rng) {
  const min = new THREE.Vector3(-7.5, SW_Y, -8), max = new THREE.Vector3(-1.8, GH - 0.2, FZ);
  const room = new Room('deli', 'deli', min, max, shared, true);
  const k = new Kit();
  shell(k, { x0: -7.5, x1: -1.8, z0: FZ, z1: -8 }, SW_Y, GH - 0.35, {}, 0xe8e0cc, 0x8a7a68, 0xf4f2ec, { base: true });
  const prod = [0xd23a2a, 0xf0c030, 0x2a6ac0, 0x3aa050, 0xe07a20, 0xf2f2f2, 0x8a3a9a, 0x1a1a1a, 0xc0a070];
  const shelf = (x0, x1, z0, z1, h, faceZ) => {
    k.box(x0, SW_Y, z0, x1, SW_Y + h, z1, 0x6a5a4a, 0.3);
    for (let lv = 0; lv < 4; lv++) {
      const yy = SW_Y + 0.25 + lv * (h - 0.3) / 4;
      for (let x = x0 + 0.08; x < x1 - 0.1; x += 0.15 + rng() * 0.05) {
        const hh = 0.12 + rng() * 0.14;
        k.box(x, yy, faceZ - 0.02, x + 0.11, yy + hh, faceZ + (z0 < z1 ? 0.18 : -0.18), pick(rng, prod), 0.2);
      }
    }
  };
  shelf(-7.2, -2.2, -7.55, -7.95, 2.0, -7.55);
  shelf(-6.4, -3.6, -4.2, -4.5, 1.6, -4.2);
  shelf(-6.4, -3.6, -4.8, -4.5, 1.6, -4.8);
  k.box(-3.85, SW_Y, -1.6, -2.35, SW_Y + 1.0, -2.3, 0x5a3a2a, 0.3);
  k.box(-3.9, SW_Y + 1.0, -1.55, -2.3, SW_Y + 1.05, -2.35, 0xd8d0c0);
  k.box(-3.4, SW_Y + 1.05, -1.9, -3.05, SW_Y + 1.3, -2.15, 0x2a2a2a);
  k.box(-2.7, SW_Y + 1.05, -1.75, -2.45, SW_Y + 1.5, -2.0, 0xd23a2a);
  k.box(-7.45, SW_Y, -1.4, -6.95, SW_Y + 2.1, -3.8, 0x3a3a3c);
  for (let i = 0; i < 6; i++) k.box(-6.94, SW_Y + 0.2 + i * 0.32, -1.5, -6.92, SW_Y + 0.24 + i * 0.32, -3.7, 0x888888);
  room.mesh = new THREE.Mesh(k.build(), room.mat); scene.add(room.mesh);
  const fridgeGlow = emitterMesh(new THREE.PlaneGeometry(2.3, 1.9).rotateY(Math.PI / 2).translate(-6.93, SW_Y + 1.1, -2.6), scene);
  fridgeGlow.material.transparent = true; fridgeGlow.material.opacity = 0.55; fridgeGlow.material.blending = THREE.AdditiveBlending;
  const e1 = emitterMesh(new THREE.BoxGeometry(1.4, 0.05, 0.25).translate(-5.8, GH - 0.25, -2.5), scene);
  const e2 = emitterMesh(new THREE.BoxGeometry(1.4, 0.05, 0.25).translate(-3.6, GH - 0.25, -5.5), scene);
  room.addLight(0, new THREE.Vector3(-5.8, GH - 0.5, -2.5), 0xf2f8ff, 3.6, e1, 'ceiling', 0xeeeeee);
  room.addLight(1, new THREE.Vector3(-3.6, GH - 0.5, -5.5), 0xf2f8ff, 3.2, e2, 'ceiling', 0xeeeeee);
  room.addLight(2, new THREE.Vector3(-6.6, SW_Y + 1.1, -2.6), 0xcfe4ff, 1.4, fridgeGlow, 'lamp', 0x334455);
  B.deli = room; B.rooms.push(room); B.emitters.push(e1, e2, fridgeGlow);
}

function buildLaundry(B, scene, shared, rng) {
  const min = new THREE.Vector3(1.8, SW_Y, -8), max = new THREE.Vector3(7.5, GH - 0.2, FZ);
  const room = new Room('laundry', 'laundry', min, max, shared, true);
  const k = new Kit();
  shell(k, { x0: 1.8, x1: 7.5, z0: FZ, z1: -8 }, SW_Y, GH - 0.35, {}, 0xcfe0e4, 0xbfc6c4, 0xf4f6f6, { base: true });
  for (let i = 0; i < 8; i++) {
    const z0 = -1.4 - i * 0.78;
    k.box(6.8, SW_Y, z0, 7.45, SW_Y + 0.95, z0 - 0.72, 0xf2f2f0, 0.25);
    const d = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18); d.rotateZ(Math.PI / 2); d.translate(6.79, SW_Y + 0.55, z0 - 0.36); k.geo(d, 0x2a3440);
    k.box(6.82, SW_Y + 0.82, z0 - 0.1, 6.8, SW_Y + 0.9, z0 - 0.6, 0x9aa0a6);
  }
  for (let i = 0; i < 6; i++) {
    const x0 = 2.4 + i * 0.75;
    for (let lv = 0; lv < 2; lv++) {
      k.box(x0, SW_Y + lv * 0.85, -7.3, x0 + 0.7, SW_Y + 0.82 + lv * 0.85, -7.95, 0xe2e4e4, 0.2);
      const d = new THREE.CylinderGeometry(0.24, 0.24, 0.03, 18); d.rotateX(Math.PI / 2); d.translate(x0 + 0.35, SW_Y + 0.42 + lv * 0.85, -7.29); k.geo(d, 0x3a4048);
    }
  }
  k.box(3.6, SW_Y, -4.0, 5.6, SW_Y + 0.88, -5.0, 0xd8d4cc, 0.3);
  k.box(3.55, SW_Y + 0.88, -3.95, 5.65, SW_Y + 0.93, -5.05, 0xb8b4ac);
  for (const [x, z] of LAUNDRY.chairs) {
    k.box(x - 0.22, SW_Y + 0.42, z - 0.22, x + 0.22, SW_Y + 0.47, z + 0.22, 0xe07030);
    k.box(x - 0.24, SW_Y + 0.47, z - 0.22, x - 0.2, SW_Y + 0.9, z + 0.22, 0xe07030);
    k.box(x - 0.02, SW_Y, z - 0.02, x + 0.02, SW_Y + 0.42, z + 0.02, 0x555555);
  }
  k.box(3.8, SW_Y + 0.93, -4.3, 4.3, SW_Y + 1.1, -4.6, 0x6a8ac0);
  room.mesh = new THREE.Mesh(k.build(), room.mat); scene.add(room.mesh);
  const e1 = emitterMesh(new THREE.BoxGeometry(1.4, 0.05, 0.25).translate(3.6, GH - 0.25, -2.4), scene);
  const e2 = emitterMesh(new THREE.BoxGeometry(1.4, 0.05, 0.25).translate(5.6, GH - 0.25, -5.6), scene);
  room.addLight(0, new THREE.Vector3(3.6, GH - 0.5, -2.4), 0xeef6ff, 3.8, e1, 'ceiling', 0xeeeeee);
  room.addLight(1, new THREE.Vector3(5.6, GH - 0.5, -5.6), 0xeef6ff, 3.4, e2, 'ceiling', 0xeeeeee);
  B.laundry = room; B.rooms.push(room); B.emitters.push(e1, e2);
}

function buildStreet(B, scene, ext, snowK, rng) {
  const concrete = noiseTex(256, 256, '#a7a49c', 18, (g, w, h) => { g.strokeStyle = 'rgba(60,58,54,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); });
  const swMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 });
  const sw = new THREE.BoxGeometry(140, SW_Y, CURB_Z - 0.15); sw.translate(0, SW_Y / 2, (CURB_Z - 0.15) / 2); planarUV(sw, 1 / 1.6);
  scene.add(new THREE.Mesh(sw, swMat));
  const sw2 = new THREE.BoxGeometry(140, SW_Y, 5); sw2.translate(0, SW_Y / 2, 18.5); planarUV(sw2, 1 / 1.6);
  scene.add(new THREE.Mesh(sw2, swMat));
  B.sidewalkMat = swMat;
  const k = new Kit();
  k.box(-70, 0, CURB_Z - 0.15, 70, SW_Y + 0.01, CURB_Z + 0.1, 0xb8b4aa, 0.3);
  k.box(-70, 0, 15.9, 70, SW_Y + 0.01, 16.1, 0xb8b4aa, 0.3);
  for (let x = -70; x < 70; x += 6) k.box(x, 0.005, 9.3, x + 3, 0.012, 9.42, 0xe8e6de);
  k.box(-70, 0.005, 6.35, 70, 0.012, 6.43, 0xe8e6de);
  k.box(-70, 0.005, 12.4, 70, 0.012, 12.48, 0xe8e6de);
  for (let x = -4.5; x < 3.2; x += 0.6) k.box(x, 0.005, 4.3, x + 0.3, 0.012, 6.3, 0xd8c040);
  // hydrant, trash can, mailbox
  const hyd = new THREE.CylinderGeometry(0.13, 0.15, 0.7, 10); hyd.translate(4.2, SW_Y + 0.35, 3.5); k.geo(hyd, 0xb02a22, 0.3);
  const hydTop = new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); hydTop.translate(4.2, SW_Y + 0.7, 3.5); k.geo(hydTop, 0xb02a22);
  k.box(4.0, SW_Y + 0.45, 3.45, 4.4, SW_Y + 0.52, 3.55, 0xb02a22);
  const can = new THREE.CylinderGeometry(0.28, 0.25, 0.85, 12, 1, true); can.translate(-8.4, SW_Y + 0.43, 3.4); k.geo(can, 0x2f4a3a, 0.3);
  k.box(8.6, SW_Y, 3.3, 9.15, SW_Y + 1.1, 3.75, 0x2a4a8a, 0.3);
  const road = noiseTex(512, 512, '#3a3a3c', 22);
  const roadMat = new THREE.MeshStandardMaterial({ map: road, roughness: 0.92 });
  const rg = new THREE.PlaneGeometry(140, 12); rg.rotateX(-Math.PI / 2); rg.translate(0, 0, 10); planarUV(rg, 1 / 5);
  scene.add(new THREE.Mesh(rg, roadMat));
  B.roadMat = roadMat;
  // street lamps
  for (const x of [-10.5, 10.5, 30]) {
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 6.4, 8); pole.translate(x, 3.2, 3.6); k.geo(pole, 0x2a2e30);
    k.beam(x, 6.2, 3.6, x, 6.35, 2.5, 0.07, 0x2a2e30);
    k.box(x - 0.25, 6.15, 2.25, x + 0.25, 6.4, 2.85, 0x2a2e30);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.5), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    head.position.set(x, 6.13, 2.55); scene.add(head);
    const light = new THREE.PointLight(0xffc48a, 0, 20, 1.8);
    light.position.set(x, 5.9, 2.55);
    scene.add(light);
    B.lamps.push({ head, light });
  }
  // street trees
  for (const [x, z] of [[-14.5, 2.9], [14.0, 2.9], [-27, 2.9], [25, 2.9]]) {
    k.box(x - 0.6, SW_Y - 0.02, z - 0.6, x + 0.6, SW_Y + 0.02, z + 0.6, 0x3a2e24);
    const tr = new THREE.CylinderGeometry(0.1, 0.15, 3.2, 7); tr.translate(x, SW_Y + 1.6, z); k.geo(tr, 0x3a2e26);
    k.beam(x, 2.6, z, x - 0.9, 4.2, z + 0.2, 0.07, 0x3a2e26);
    k.beam(x, 2.9, z, x + 1.0, 4.4, z - 0.3, 0.07, 0x3a2e26);
    k.beam(x, 3.2, z, x + 0.2, 4.9, z + 0.6, 0.06, 0x3a2e26);
    const fk = new Kit();
    for (const [dx, dy, dz, r] of [[0, 4.4, 0, 1.4], [-0.9, 4.0, 0.3, 1.0], [0.9, 4.1, -0.2, 1.05], [0.2, 5.0, 0.2, 0.95], [-0.3, 3.7, -0.6, 0.85]]) {
      fk.geo(new THREE.IcosahedronGeometry(r, 1).translate(x + dx, dy, z + dz), 0xffffff, 0.35);
    }
    const fm = new THREE.Mesh(fk.build(), new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x4f7a3a, roughness: 0.9, flatShading: true }));
    scene.add(fm);
    B.decor.foliage.push(fm);
  }
  scene.add(new THREE.Mesh(k.build(), ext.trim));
}

function buildNeighbors(B, scene, rng) {
  B.neighbors = [];
  const defs = [
    { x0: -24, x1: -BW - 0.3, h: 13.6, base: 0xa07d5c, floors: 4, cols: 5, setback: -0.25 },
    { x0: BW + 0.3, x1: 24, h: 20.6, base: 0x5b4036, floors: 6, cols: 5, setback: -0.15 },
  ];
  for (const d of defs) {
    const w = d.x1 - d.x0;
    const bt = brickTextures(d.base, 31 + d.floors);
    bt.map.repeat.set(w / 2, d.h / 2); bt.bump.repeat.copy(bt.map.repeat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, d.h, 12), new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, roughness: 0.95 }));
    body.position.set((d.x0 + d.x1) / 2, d.h / 2, d.setback - 6);
    scene.add(body);
    const cw = 512, chh = Math.round(512 * d.h / w);
    const winRects = [];
    const gf = 4.0, fh = (d.h - gf - 0.8) / d.floors;
    for (let f = 0; f < d.floors; f++) for (let c = 0; c < d.cols; c++) {
      const cx = (c + 0.5) / d.cols * w, wy = gf + f * fh + 0.85;
      winRects.push({ x: cx - 0.6, y: wy, w: 1.2, h: 1.7, lit: rng() < 0.4, col: pick(rng, ['#ffcf8a', '#ffe0b0', '#ffd090', '#c8d8ff', '#ffb870']) });
    }
    const toPx = (r) => [r.x / w * cw, chh - (r.y + r.h) / d.h * chh, r.w / w * cw, r.h / d.h * chh];
    const mapC = document.createElement('canvas'); mapC.width = cw; mapC.height = chh;
    const g = mapC.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, cw, chh);
    for (const r of winRects) { const [x, y, ww, hh] = toPx(r); g.fillStyle = '#d8d0c0'; g.fillRect(x - 4, y - 4, ww + 8, hh + 8); g.fillStyle = '#1b2026'; g.fillRect(x, y, ww, hh); g.fillStyle = '#c9bba3'; g.fillRect(x - 6, y + hh + 2, ww + 12, 6); }
    g.fillStyle = '#2c2a28'; g.fillRect(0, chh - gf / d.h * chh, cw, gf / d.h * chh);
    g.fillStyle = '#121416'; g.fillRect(cw * 0.1, chh - 3.3 / d.h * chh, cw * 0.8, 2.6 / d.h * chh);
    const map = new THREE.CanvasTexture(mapC); map.colorSpace = THREE.SRGBColorSpace;
    const emC = document.createElement('canvas'); emC.width = cw; emC.height = chh;
    const em = new THREE.CanvasTexture(emC); em.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d.h), mat);
    plane.position.set((d.x0 + d.x1) / 2, d.h / 2, d.setback + 0.04);
    scene.add(plane);
    const nb = { mat, winRects, emC, em, toPx, chh, cw, gf, d };
    nb.redraw = () => {
      const e = emC.getContext('2d');
      e.fillStyle = '#000'; e.fillRect(0, 0, cw, chh);
      for (const r of nb.winRects) if (r.lit) { const [x, y, ww, hh] = toPx(r); e.fillStyle = r.col; e.fillRect(x, y, ww, hh); e.fillStyle = 'rgba(0,0,0,0.35)'; e.fillRect(x, y + hh * 0.48, ww, hh * 0.04); }
      e.fillStyle = '#ffeec8'; e.fillRect(cw * 0.1, chh - 3.3 / d.h * chh, cw * 0.8, 2.6 / d.h * chh * 0.2);
      em.needsUpdate = true;
    };
    nb.redraw();
    B.neighbors.push(nb);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.8 }));
    cap.position.set((d.x0 + d.x1) / 2, d.h + 0.1, d.setback + 0.1); scene.add(cap);
  }
  // far skyline
  const dots = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 16) if (Math.random() < 0.28) { g.fillStyle = pick(Math.random, ['#ffd9a0', '#ffe9c8', '#d8e4ff', '#ffc880']); g.fillRect(x, y, 8, 7); }
  });
  dots.wrapS = dots.wrapT = THREE.RepeatWrapping;
  B.skyline = new THREE.MeshStandardMaterial({ color: 0x23262c, emissiveMap: dots, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const w = range(rng, 10, 26), h = range(rng, 26, 70), x = range(rng, -110, 110), z = range(rng, -70, -150);
    const geo = new THREE.BoxGeometry(w, h, 14);
    const uv = geo.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * w / 16, uv.getY(j) * h / 32);
    const m = new THREE.Mesh(geo, B.skyline);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }
}

function buildDecor(B, scene, rng) {
  // Christmas trees in some living rooms, with string lights
  const treeLights = [0xff3a2a, 0x3aff5a, 0xffc040, 0x4a7aff, 0xff6ad0, 0xffffff];
  for (const u of B.units) {
    if (rng() < 0.45) continue;
    const g = new THREE.Group();
    const k = new Kit();
    const X = u.X, Z = u.Z, y = u.y;
    const cx = X(4.32), cz = Z(-0.5);
    const tr = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6); tr.translate(cx, y + 0.15, cz); k.geo(tr, 0x5a3a22);
    k.box(cx - 0.2, y, cz - 0.2, cx + 0.2, y + 0.2, cz + 0.2, 0xb02a22, 0.2);
    for (const [r, h, yy] of [[0.52, 0.8, 0.55], [0.43, 0.7, 0.95], [0.31, 0.6, 1.32], [0.19, 0.45, 1.62]]) { const c = new THREE.ConeGeometry(r, h, 10); c.translate(cx, y + yy, cz); k.geo(c, 0x24502e, 0.35); }
    const tm = new THREE.Mesh(k.build(), u.rooms.L.mat);
    g.add(tm);
    const N = 48;
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const mtx = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const t = i / N, hy = 0.25 + t * 1.55, rr = 0.5 * (1 - t) + 0.05, a = i * 2.4;
      mtx.makeTranslation(cx + Math.cos(a) * rr, y + hy, cz + Math.sin(a) * rr);
      im.setMatrixAt(i, mtx);
      c.set(treeLights[i % treeLights.length]);
      im.setColorAt(i, c);
    }
    g.add(im);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    star.position.set(cx, y + 1.9, cz); g.add(star);
    g.visible = false;
    scene.add(g);
    const base = [];
    for (let i = 0; i < N; i++) { im.getColorAt(i, c); base.push(c.clone()); }
    u.tree = { group: g, im, star, base, on: false };
    u.rooms.L.addLight(3, new THREE.Vector3(cx, y + 1.0, cz + 0.2), 0xffb090, 1.1, null, 'tree');
    B.decor.xmas.push(g);
  }
  // window string lights on a few windows
  const N = 400;
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const mtx = new THREE.Matrix4(), c = new THREE.Color();
  let n = 0;
  const wins = B.windows.filter((w) => !w.win.ac);
  const chosen = wins.filter(() => rng() < 0.3);
  for (const w of chosen) {
    const col = rng() < 0.5 ? null : new THREE.Color(0xffd890);
    const pts = [];
    for (let t = 0; t <= 1; t += 0.06) pts.push([w.x - 0.66 + t * 1.32, w.y0 + HEAD + 0.02 - Math.sin(t * Math.PI) * 0.08]);
    for (let t = 0.08; t <= 1; t += 0.1) { pts.push([w.x - 0.66, w.y0 + HEAD - t * 1.6]); pts.push([w.x + 0.66, w.y0 + HEAD - t * 1.6]); }
    for (const [x, yy] of pts) {
      if (n >= N) break;
      mtx.makeTranslation(x, yy, 0.05);
      im.setMatrixAt(n, mtx);
      c.copy(col || new THREE.Color(treeLights[n % 5])).multiplyScalar(2.2);
      im.setColorAt(n, c);
      n++;
    }
  }
  im.count = n;
  im.visible = false;
  scene.add(im);
  B.decor.xmas.push(im);
  B.windowLights = im;
  // wreath
  const wreath = new THREE.Group();
  const wm = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 20), new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.9 }));
  wm.position.set(0, 2.98, 0.0); wreath.add(wm);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xb01e1e }));
  bow.position.set(0, 2.72, 0.05); wreath.add(bow);
  wreath.visible = false; scene.add(wreath); B.decor.xmas.push(wreath);
  // pumpkins on the step
  const pk = new THREE.Group();
  B.candles = [];
  for (const [x, z, s] of [[-0.8, 0.35, 1], [-0.55, 0.38, 0.7], [0.8, 0.35, 0.9]]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0701a, roughness: 0.6 }));
    p.scale.y = 0.78; p.position.set(x, SW_Y + 0.12 + 0.13 * s, z); pk.add(p);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 5), new THREE.MeshStandardMaterial({ color: 0x3a4a20 }));
    st.position.set(x, SW_Y + 0.12 + 0.27 * s, z); pk.add(st);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.14 * s, 0.09 * s), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    face.position.set(x, SW_Y + 0.12 + 0.14 * s, z + 0.165 * s); pk.add(face);
    B.candles.push(face);
  }
  pk.visible = false; scene.add(pk); B.decor.halloween.push(pk);
}
