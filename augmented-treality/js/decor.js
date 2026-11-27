// Everything that goes on or under the tree. Each builder returns plain meshes with
// standard materials so the same objects render live, in WebXR, and in the GLB / USDZ files.
import * as THREE from 'three';
import { makeRng, lerp, clamp, merge, normalize } from './util.js';
import {
  candyStripe, tinselTexture, skirtTexture, weaveTexture, glitterTexture, baubleStripes,
  gingerTexture, paperTexture, glowTexture, PAPERS,
} from './textures.js';
import { surfacePoint } from './tree.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- materials
const mats = new Map();
function mat(key, make) { if (!mats.has(key)) { const m = make(); m.name = key; mats.set(key, m); } return mats.get(key); }

export const gold = () => mat('gold', () => new THREE.MeshStandardMaterial({ color: 0xd9ab4f, metalness: 1, roughness: 0.22 }));
export const silver = () => mat('silver', () => new THREE.MeshStandardMaterial({ color: 0xd6d8dc, metalness: 1, roughness: 0.18 }));
const wire = () => mat('wire', () => new THREE.MeshStandardMaterial({ color: 0x1a3320, roughness: 0.55 }));
const hookWire = () => mat('hook', () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.35 }));

export const FINISHES = { gloss: 'Glossy', mirror: 'Mirror', matte: 'Satin', glitter: 'Glitter', stripe: 'Striped' };

function finishMat(color, finish) {
  return mat(`orn:${color}:${finish}`, () => {
    const c = new THREE.Color(color);
    if (finish === 'mirror') return new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: 0.05 });
    if (finish === 'matte') return new THREE.MeshStandardMaterial({ color: c, metalness: 0.35, roughness: 0.55 });
    if (finish === 'glitter') return new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.5, roughnessMap: glitterTexture() });
    if (finish === 'stripe') return new THREE.MeshStandardMaterial({ color: c, map: baubleStripes(), metalness: 0.55, roughness: 0.12 });
    return new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.1 });
  });
}

// ---------------------------------------------------------------- ornaments
export const ORN_COLORS = [
  ['#b3121f', 'Cranberry'], ['#d9ab4f', 'Gold'], ['#c9ccd2', 'Silver'], ['#1f6b3a', 'Pine'], ['#1e4fa8', 'Cobalt'],
  ['#6a2c91', 'Plum'], ['#e07aa8', 'Bubblegum'], ['#f2efe6', 'Snow'], ['#b8693a', 'Copper'], ['#16808a', 'Teal'],
  ['#1a2340', 'Midnight'], ['#e8d3a2', 'Champagne'],
];

export const ORNAMENTS = {
  bauble: { label: 'Bauble', icon: '🔴', colors: true, finishes: true },
  finial: { label: 'Finial', icon: '💧', colors: true, finishes: true },
  icicle: { label: 'Icicle', icon: '🧊', colors: false },
  cane:   { label: 'Candy cane', icon: '🍬', colors: false },
  star:   { label: 'Star', icon: '⭐', colors: true },
  flake:  { label: 'Snowflake', icon: '❄️', colors: false },
  bell:   { label: 'Bell', icon: '🔔', colors: true },
  cone:   { label: 'Pinecone', icon: '🌰', colors: false },
  ginger: { label: 'Gingerbread', icon: '🍪', colors: false },
  pickle: { label: 'The pickle', icon: '🥒', colors: false },
  gift:   { label: 'Tiny gift', icon: '🎁', colors: true },
};

const geos = new Map();
function geo(key, make) { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); }

function hookMesh(len) {
  const g = geo('hook:' + len.toFixed(3), () => { const c = new THREE.CylinderGeometry(0.0007, 0.0007, len, 4, 1, true); c.translate(0, -len / 2, 0); return c; });
  return new THREE.Mesh(g, hookWire());
}

function capAndLoop(r) {
  const out = [];
  const cap = new THREE.Mesh(geo('cap', () => {
    const g = new THREE.CylinderGeometry(0.26, 0.3, 0.24, 10, 1); g.translate(0, 0.12, 0);
    const ring = new THREE.TorusGeometry(0.11, 0.03, 4, 10); ring.translate(0, 0.33, 0);
    return merge([g, ring]);
  }), gold());
  cap.scale.setScalar(r);
  out.push(cap);
  return out;
}

function lathe(key, pts, segs = 20) {
  return geo(key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs));
}

// Build one ornament. Its origin is where the hook meets the branch; it hangs down from there.
export function buildOrnament(o) {
  const g = new THREE.Group();
  const s = o.s ?? 1;
  const color = o.c || '#b3121f', finish = o.f || 'gloss';
  const hang = 0.018 + 0.012 * ((o.seed ?? 0.5));
  g.add(hookMesh(hang));
  const body = new THREE.Group();
  body.position.y = -hang;
  g.add(body);
  const add = (geom, material, y = 0) => { const m = new THREE.Mesh(geom, material); m.position.y = y; m.castShadow = true; body.add(m); return m; };
  switch (o.t) {
    case 'bauble': {
      const r = 0.042 * s;
      for (const m of capAndLoop(r)) { m.position.y = -0.36 * r; body.add(m); }
      add(geo('sphere', () => new THREE.SphereGeometry(1, 24, 16)), finishMat(color, finish), -1.3 * r).scale.setScalar(r);
      break;
    }
    case 'finial': {
      const r = 0.04 * s;
      for (const m of capAndLoop(r)) { m.position.y = -0.36 * r; body.add(m); }
      const pts = [[0, -3.2], [0.08, -2.8], [0.18, -2.2], [0.5, -1.6], [0.95, -1.0], [1.0, -0.6], [0.8, -0.25], [0.32, -0.08], [0.28, 0]];
      add(lathe('finial', pts, 24), finishMat(color, finish), -0.33 * r).scale.setScalar(r);
      break;
    }
    case 'icicle': {
      const L = 0.13 * s;
      const m = add(geo('icicle', () => {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(0.09 * Math.pow(1 - t, 0.8) + 0.002, -t)); }
        const lg = new THREE.LatheGeometry(pts.reverse(), 6, 0, Math.PI * 2);
        // twist the six ridges into a spiral
        const p = lg.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = -y * 5; const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)); }
        lg.computeVertexNormals();
        return lg;
      }), mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xe6f4ff, metalness: 0.65, roughness: 0.04, transparent: true, opacity: 0.6 })));
      m.scale.set(L, L, L); m.position.y = -0.0045 * s;
      for (const c of capAndLoop(0.012 * s)) { c.position.y = -0.0045 * s; body.add(c); }
      break;
    }
    case 'cane': {
      g.remove(g.children[0]); body.position.y = 0;
      const m = add(geo('cane', () => {
        const pts = [];
        for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; pts.push(new THREE.Vector3(0.022 - Math.cos(a) * 0.022, Math.sin(a) * 0.022 - 0.004, 0)); }
        pts.push(new THREE.Vector3(0.044, -0.03, 0), new THREE.Vector3(0.044, -0.13, 0));
        const curve = new THREE.CatmullRomCurve3(pts);
        const tg = new THREE.TubeGeometry(curve, 32, 0.0055, 8, false);
        const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i));
        tg.translate(-0.022, 0, 0);
        return tg;
      }), mat('cane', () => new THREE.MeshStandardMaterial({ map: candyStripe(), roughness: 0.25 })));
      m.scale.setScalar(s);
      m.rotation.y = (o.seed ?? 0.5) * 6.28;
      break;
    }
    case 'star': {
      const r = 0.045 * s;
      add(geo('starOrn', () => starGeometry(1, 0.42, 0.18, 5)), o.f === 'glitter' ? finishMat(color, 'glitter') : finishMat(color, 'mirror'), -r).scale.setScalar(r);
      break;
    }
    case 'flake': {
      const r = 0.05 * s;
      add(geo('flake', () => flakeGeometry(1, 0.06)), mat('flakeMat', () => new THREE.MeshStandardMaterial({ color: 0xf4f8ff, metalness: 0.75, roughness: 0.4, roughnessMap: glitterTexture() })), -r).scale.setScalar(r);
      break;
    }
    case 'bell': {
      const r = 0.035 * s;
      const pts = [[0, 0], [0.18, 0], [0.24, -0.1], [0.32, -0.45], [0.42, -0.8], [0.62, -1.05], [0.92, -1.18], [0.96, -1.24], [0.9, -1.22], [0.02, -1.0]].reverse();
      add(lathe('bell', pts, 24), finishMat(color, 'mirror'), -0.05 * r).scale.setScalar(r);
      add(geo('sphere', () => new THREE.SphereGeometry(1, 24, 16)), gold(), -1.2 * r).scale.setScalar(r * 0.16);
      break;
    }
    case 'cone': {
      const L = 0.075 * s;
      add(geo('pinecone', () => pineconeGeometry()), mat('cone', () => new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.85 })), -L * 0.05).scale.setScalar(L);
      break;
    }
    case 'ginger': {
      const h = 0.085 * s;
      const m = add(geo('ginger', () => gingerGeometry()), mat('ginger', () => new THREE.MeshStandardMaterial({ map: gingerTexture(), roughness: 0.8 })), -h);
      m.scale.setScalar(h);
      break;
    }
    case 'pickle': {
      const L = 0.1 * s;
      const m = add(geo('pickle', () => pickleGeometry()), mat('pickle', () => new THREE.MeshStandardMaterial({ color: 0x3f7d23, metalness: 0.45, roughness: 0.12 })), -L * 0.52);
      m.scale.setScalar(L); m.rotation.z = 0.25;
      for (const c of capAndLoop(0.012 * s)) { c.position.y = -0.0045 * s; body.add(c); }
      break;
    }
    case 'gift': {
      const a = 0.045 * s;
      buildGiftMesh({ w: a, h: a, d: a, paper: 'foil', c1: color, c2: '#ffffff', ribbon: '#d9ab4f' }, body, -a);
      break;
    }
  }
  g.rotation.y = (o.seed ?? 0.5) * Math.PI * 2;
  g.userData.ornament = true;
  return g;
}

function starGeometry(R, inner, depth, n) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? R * inner : R; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: R * 0.06, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function flakeGeometry(R, t) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const arm = new THREE.BoxGeometry(R, t * 1.3, t); arm.translate(R / 2, 0, 0); arm.rotateZ(a); parts.push(arm);
    for (const f of [0.5, 0.75]) for (const sd of [-1, 1]) {
      const l = R * (f === 0.5 ? 0.34 : 0.22);
      const b = new THREE.BoxGeometry(l, t, t); b.translate(l / 2, 0, 0); b.rotateZ(sd * 0.85); b.translate(R * f, 0, 0); b.rotateZ(a); parts.push(b);
    }
  }
  parts.push(new THREE.CylinderGeometry(R * 0.16, R * 0.16, t * 1.2, 6).rotateX(Math.PI / 2));
  return merge(parts);
}

function pineconeGeometry() {
  const parts = [], rng = makeRng(5);
  const scale = new THREE.SphereGeometry(1, 6, 4);
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1), y = -t;
    const rad = 0.3 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) + 0.04;
    const n = Math.max(5, Math.round(rad * 34));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + i * 0.4;
      const sg = scale.clone();
      sg.scale(0.1, 0.035, 0.08); sg.rotateZ(-0.5); sg.translate(rad, 0, 0); sg.rotateY(a); sg.translate(0, y + (rng() - 0.5) * 0.02, 0);
      parts.push(sg);
    }
  }
  const core = new THREE.SphereGeometry(1, 10, 8); core.scale(0.24, 0.5, 0.24); core.translate(0, -0.5, 0);
  parts.push(core);
  return merge(parts);
}

function gingerGeometry() {
  const s = new THREE.Shape();
  // a gingerbread person in a 1 x 1 box (UVs line up with the icing texture)
  s.moveTo(0.5, 1.0);
  s.absarc(0.5, 0.8, 0.17, Math.PI * 0.5, Math.PI * 1.3, false);
  s.lineTo(0.12, 0.62); s.quadraticCurveTo(0.04, 0.55, 0.12, 0.5); s.lineTo(0.33, 0.5);
  s.lineTo(0.3, 0.3); s.lineTo(0.16, 0.06); s.quadraticCurveTo(0.2, -0.02, 0.3, 0.02); s.lineTo(0.5, 0.24);
  s.lineTo(0.7, 0.02); s.quadraticCurveTo(0.8, -0.02, 0.84, 0.06); s.lineTo(0.7, 0.3); s.lineTo(0.67, 0.5);
  s.lineTo(0.88, 0.5); s.quadraticCurveTo(0.96, 0.55, 0.88, 0.62); s.lineTo(0.64, 0.66);
  s.absarc(0.5, 0.8, 0.17, Math.PI * 1.7, Math.PI * 2.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 });
  g.translate(-0.5, 0, -0.04);
  return g;
}

function pickleGeometry() {
  const g = new THREE.CapsuleGeometry(0.17, 0.6, 6, 14);
  const p = g.attributes.position, rng = makeRng(11);
  const bumps = Array.from({ length: 26 }, () => new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), d = v.clone().normalize();
    let bump = 0; for (const b of bumps) bump += Math.max(0, d.dot(b) - 0.93) * 0.5;
    const bend = v.y * v.y * 0.25;
    v.multiplyScalar(1 + bump); v.x += bend;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- lights
export const LIGHT_STYLES = {
  none:   { label: 'None', colors: [] },
  warm:   { label: 'Warm white', colors: ['#ffc965'], bulb: 'mini' },
  multi:  { label: 'Multicolour', colors: ['#ff2a1f', '#26d04a', '#1f6dff', '#ffc400', '#ff7a00', '#c93cff'], bulb: 'mini' },
  c9:     { label: 'Retro C9', colors: ['#e8262d', '#1f9e3c', '#1867d6', '#f5a623', '#f07ab0'], bulb: 'c9' },
  cool:   { label: 'Cool white', colors: ['#dcecff'], bulb: 'mini' },
  blue:   { label: 'Ice blue', colors: ['#2e7dff', '#8fd0ff'], bulb: 'mini' },
  candy:  { label: 'Candy cane', colors: ['#ff2236', '#fff2ea'], bulb: 'mini' },
  globes: { label: 'Fairy globes', colors: ['#ffbd5a'], bulb: 'globe' },
};
export const LIGHT_MODES = { steady: 'Steady', twinkle: 'Twinkle', chase: 'Chase', fade: 'Slow fade' };
export const DENSITY_LABELS = ['Tasteful', 'Festive', 'Visible from space', 'Call the power company'];

function bulbGeometry(kind) {
  return geo('bulb:' + kind, () => {
    if (kind === 'c9') {
      const pts = [[0, 0], [0.42, 0.05], [0.62, 0.3], [0.68, 0.6], [0.55, 1.05], [0.3, 1.4], [0, 1.55]].map(([x, y]) => new THREE.Vector2(x, y));
      const g = new THREE.LatheGeometry(pts, 10); g.scale(0.016, 0.026, 0.016); return g;
    }
    if (kind === 'globe') { const g = new THREE.SphereGeometry(0.007, 8, 6); g.translate(0, 0.008, 0); return g; }
    const pts = [[0, 0], [0.4, 0.15], [0.38, 0.72], [0, 1.15]].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 5); g.scale(0.0085, 0.012, 0.0085); return g;
  });
}
function socketGeometry(kind) {
  return geo('socket:' + kind, () => {
    const big = kind === 'c9';
    const g = new THREE.CylinderGeometry(big ? 0.007 : 0.0035, big ? 0.006 : 0.003, big ? 0.016 : 0.008, big ? 8 : 5, 1, true);
    g.translate(0, -(big ? 0.008 : 0.004), 0);
    return g;
  });
}

const bulbMats = new Map();
export function bulbMaterial(color) {
  if (!bulbMats.has(color)) {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.3, transparent: false });
    m.name = 'bulb-' + color;
    bulbMats.set(color, m);
  }
  return bulbMats.get(color);
}

// Lay a string of lights over the tree as a helix with equal spacing along the wire.
// Returns the meshes plus a list of bulbs (position, colour, phase) for halos and twinkling.
export function buildLights(info, L) {
  const style = LIGHT_STYLES[L.style] || LIGHT_STYLES.none;
  const group = new THREE.Group(); group.name = 'lights';
  const bulbs = [];
  if (!style.colors.length) return { group, bulbs };
  const rng = makeRng(L.seed ?? 3);
  const heightFt = info.H / 0.3048;
  const per = style.bulb === 'c9' ? 14 : 100;
  const N = Math.round(per * heightFt * (L.density ?? 1));
  const { yb, H, profile } = info;
  // Surface area of the outline and the spacing that covers it with N bulbs.
  let area = 0, slant = 0;
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const y0 = lerp(yb, H, i / steps), y1 = lerp(yb, H, (i + 1) / steps);
    const r0 = profile.r(y0), r1 = profile.r(y1), ds = Math.hypot(y1 - y0, r1 - r0);
    area += Math.PI * (r0 + r1) * ds; slant += ds;
  }
  const d = Math.sqrt(area / N);
  const turns = Math.max(3, slant / d);
  // March up the helix, dropping a bulb every d metres of wire.
  const pts = [];
  let s = 0, next = d * 0.5, prev = null, order = 0;
  const M = Math.ceil(turns * 90);
  for (let i = 0; i <= M; i++) {
    const f = 0.02 + 0.93 * (i / M), a = (i / M) * turns * Math.PI * 2;
    const p = surfacePoint(info, f, a, 1);
    if (prev) s += p.distanceTo(prev);
    prev = p;
    if (s >= next) {
      next += d * (0.85 + rng() * 0.3);
      const depth = 0.8 + rng() * 0.17;
      const q = surfacePoint(info, f, a + (rng() - 0.5) * 0.06, depth);
      const color = style.colors[order % style.colors.length];
      bulbs.push({ p: q, color, phase: rng(), order: order / N, gi: order % style.colors.length });
      pts.push(q.clone());
      order++;
    }
  }
  // Bulbs, merged per colour.
  const byColor = new Map();
  const tmp = new THREE.Object3D();
  for (const b of bulbs) {
    const out = new THREE.Vector3(b.p.x, 0, b.p.z).normalize();
    const dir = out.multiplyScalar(0.8).add(new THREE.Vector3((rng() - 0.5) * 0.6, 0.4 + rng() * 0.6, (rng() - 0.5) * 0.6)).normalize();
    tmp.position.copy(b.p); tmp.quaternion.setFromUnitVectors(UP, dir); tmp.updateMatrix();
    b.dir = dir;
    const bg = bulbGeometry(style.bulb).clone().applyMatrix4(tmp.matrix);
    const sg = socketGeometry(style.bulb).clone().applyMatrix4(tmp.matrix);
    if (!byColor.has(b.color)) byColor.set(b.color, { bulb: [], socket: [], meta: [] });
    const e = byColor.get(b.color);
    e.bulb.push(bg); e.socket.push(sg);
    e.meta.push([b.phase, b.order, b.gi, bg.attributes.position.count]);
  }
  const sockets = [];
  for (const [color, e] of byColor) {
    // Per-vertex bulb data for the live twinkle shader: phase, position on the string, colour group.
    const g = merge(e.bulb);
    const meta = new Float32Array(g.attributes.position.count * 3);
    let v = 0;
    for (const [ph, ord, gi, n] of e.meta) for (let k = 0; k < n; k++) { meta[v * 3] = ph; meta[v * 3 + 1] = ord; meta[v * 3 + 2] = gi; v++; }
    g.setAttribute('bulbMeta', new THREE.BufferAttribute(meta, 3));
    const m = new THREE.Mesh(g, bulbMaterial(color));
    m.name = 'bulbs-' + color; m.userData.bulbs = true;
    group.add(m);
    sockets.push(...e.socket);
  }
  const sm = new THREE.Mesh(merge(sockets), wire()); sm.name = 'sockets';
  group.add(sm);
  // The wire, threaded through every bulb.
  if (pts.length > 3) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tg = new THREE.TubeGeometry(curve, Math.min(3000, pts.length * 2), 0.0013, 3, false);
    const wm = new THREE.Mesh(tg, wire()); wm.name = 'wire';
    group.add(wm);
  }
  return { group, bulbs, styleBulb: style.bulb };
}

// Additive glow sprites, one per bulb. Live view and WebXR only; never exported.
export function buildHalos(bulbs, bulbKind) {
  const n = bulbs.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), meta = new Float32Array(n * 3);
  const c = new THREE.Color();
  bulbs.forEach((b, i) => {
    const p = b.p.clone().addScaledVector(b.dir, bulbKind === 'c9' ? 0.02 : 0.008);
    pos.set([p.x, p.y, p.z], i * 3);
    c.set(b.color); col.set([c.r, c.g, c.b], i * 3);
    meta.set([b.phase, b.order, b.gi], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('bulbMeta', new THREE.BufferAttribute(meta, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTexture() }, time: TWINKLE.time, mode: TWINKLE.mode, size: { value: bulbKind === 'c9' ? 0.07 : bulbKind === 'globe' ? 0.032 : 0.03 }, gain: TWINKLE.gain, scale: { value: 600 } },
    vertexShader: `
      attribute vec3 bulbMeta; attribute vec3 color;
      uniform float time, mode, size, scale; varying vec3 vCol; varying float vI;
      ${TWINKLE_GLSL}
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vI = twinkle(bulbMeta, time, mode);
        vCol = color;
        gl_PointSize = size * scale / -mv.z * (0.55 + 0.45 * vI);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float gain; varying vec3 vCol; varying float vI;
      void main(){
        float a = texture2D(map, gl_PointCoord).r;
        gl_FragColor = vec4((vCol * a * 0.85 + vec3(a * a * a) * 0.2) * vI * gain, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.name = 'halos'; pts.userData.liveOnly = true; pts.frustumCulled = false; pts.renderOrder = 10;
  return pts;
}

// Shared twinkle uniforms and the GLSL that turns (phase, order, group) into brightness.
export const TWINKLE = { time: { value: 0 }, mode: { value: 1 }, gain: { value: 1 } };
export const MODE_INDEX = { steady: 0, twinkle: 1, chase: 2, fade: 3 };
export const TWINKLE_GLSL = `
  float twinkle(vec3 m, float t, float mode){
    if (mode < 0.5) return 1.0;
    if (mode < 1.5) {
      float a = sin(t * (1.3 + m.x * 2.7) + m.x * 40.0) * 0.5 + 0.5;
      float b = sin(t * (0.6 + m.x * 1.1) + m.x * 17.0) * 0.5 + 0.5;
      return 0.25 + 0.75 * smoothstep(0.15, 0.95, a * b * 1.6);
    }
    if (mode < 2.5) return 0.2 + 0.8 * smoothstep(0.35, 0.65, fract(m.y * 160.0 - t * 1.4));
    return 0.25 + 0.75 * (sin(t * 0.9 + m.z * 2.094) * 0.5 + 0.5);
  }`;

// Make the live bulb materials pulse with the same function as the halos.
export function liveBulbMaterial(base) {
  const m = base.clone();
  m.name = base.name + '-live';
  m.onBeforeCompile = sh => {
    sh.uniforms.time = TWINKLE.time; sh.uniforms.mode = TWINKLE.mode;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 bulbMeta; uniform float time, mode; varying float vTw;
      ${TWINKLE_GLSL}`).replace('#include <begin_vertex>', `#include <begin_vertex>
      vTw = twinkle(bulbMeta, time, mode);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vTw;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vTw * 1.3; diffuseColor.rgb *= 0.35 + 0.65 * vTw;`);
  };
  return m;
}

// ---------------------------------------------------------------- garland
export const GARLANDS = {
  none:       { label: 'None' },
  gold:       { label: 'Gold tinsel', kind: 'tinsel', color: 0xd9ab4f },
  silver:     { label: 'Silver tinsel', kind: 'tinsel', color: 0xdfe3ea },
  red:        { label: 'Red tinsel', kind: 'tinsel', color: 0xc11a28 },
  beadsGold:  { label: 'Gold beads', kind: 'beads', color: 0xd9ab4f },
  beadsRed:   { label: 'Red beads', kind: 'beads', color: 0xb3121f },
  beadsPearl: { label: 'Pearls', kind: 'beads', color: 0xf3ece0, pearl: true },
  popcorn:    { label: 'Popcorn & cranberries', kind: 'popcorn' },
  ribbonRed:  { label: 'Velvet ribbon', kind: 'ribbon', fabric: 'velvet' },
  ribbonPlaid:{ label: 'Plaid ribbon', kind: 'ribbon', fabric: 'plaid' },
};

// The drape: a spiral that rests on the outer branch tips and sags between them.
function drapePath(info, wraps, rng) {
  const pts = [];
  const anchorsPerTurn = 5;
  const total = Math.round(wraps * anchorsPerTurn);
  const f0 = 0.88, f1 = 0.06;
  for (let k = 0; k < total; k++) {
    const fa = lerp(f0, f1, k / total), fb = lerp(f0, f1, (k + 1) / total);
    const aa = k / anchorsPerTurn * Math.PI * 2, ab = (k + 1) / anchorsPerTurn * Math.PI * 2;
    const ra = info.profile.r(lerp(info.yb, info.H, fa));
    const sag = 0.05 + 0.1 * (ra / info.R0);
    const segs = 10;
    for (let i = k ? 1 : 0; i <= segs; i++) {
      const t = i / segs;
      const f = lerp(fa, fb, t) - sag * 4 * t * (1 - t) / (info.H - info.yb);
      const a = lerp(aa, ab, t);
      const depth = 0.98 + 0.03 * Math.sin(t * Math.PI) - 0.04 * (1 - Math.sin(t * Math.PI));
      pts.push(surfacePoint(info, clamp(f, 0, 1), a, depth));
    }
  }
  return pts;
}

export function buildGarland(info, G) {
  const style = GARLANDS[G.style] || GARLANDS.none;
  const group = new THREE.Group(); group.name = 'garland';
  if (!style.kind) return group;
  const rng = makeRng(G.seed ?? 9);
  const pts = drapePath(info, G.wraps ?? 4, rng);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const length = curve.getLength();
  if (style.kind === 'tinsel') {
    const m = mat('tinsel:' + style.color, () => new THREE.MeshStandardMaterial({ color: style.color, metalness: 1, roughness: 0.28, map: tinselTexture(), alphaTest: 0.4 }));
    const n = Math.ceil(length / 0.02);
    const frames = curve.computeFrenetFrames(n, false);
    const pos = [], nor = [], uv = [], idx = [];
    const W = 0.055;
    for (let c = 0; c < 3; c++) {
      const rot = c * Math.PI / 3;
      for (let face = 0; face < 2; face++) {
        const base = pos.length / 3;
        for (let i = 0; i <= n; i++) {
          const t = i / n, p = curve.getPointAt(t);
          const N = frames.normals[i], B = frames.binormals[i];
          const across = N.clone().multiplyScalar(Math.cos(rot)).addScaledVector(B, Math.sin(rot));
          const nrm = new THREE.Vector3(p.x, 0.3, p.z).normalize();
          for (const k of [-1, 1]) {
            pos.push(p.x + across.x * W * k, p.y + across.y * W * k, p.z + across.z * W * k);
            nor.push(nrm.x, nrm.y, nrm.z);
            uv.push(k < 0 ? 0 : 1, t * length / 0.12);
          }
        }
        for (let i = 0; i < n; i++) {
          const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3;
          if (face === 0) idx.push(a, cc, b, b, cc, d); else idx.push(a, b, cc, b, d, cc);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
    group.add(mesh);
  } else if (style.kind === 'beads' || style.kind === 'popcorn') {
    const spacing = style.kind === 'beads' ? 0.021 : 0.024;
    const n = Math.floor(length / spacing);
    const bead = geo('bead', () => new THREE.IcosahedronGeometry(0.0095, 1));
    const pop = geo('popcorn', () => {
      const g = new THREE.IcosahedronGeometry(0.011, 1), p = g.attributes.position, r = makeRng(8);
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(0.75 + r() * 0.5); p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); return g;
    });
    const berry = geo('berry', () => new THREE.IcosahedronGeometry(0.0085, 1));
    const lists = { a: [], b: [] };
    const tmp = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt(i / n);
      tmp.position.copy(p); tmp.rotation.set(rng() * 6, rng() * 6, rng() * 6); tmp.updateMatrix();
      if (style.kind === 'beads') lists.a.push(bead.clone().applyMatrix4(tmp.matrix));
      else (i % 4 === 3 ? lists.b : lists.a).push((i % 4 === 3 ? berry : pop).clone().applyMatrix4(tmp.matrix));
    }
    const ma = style.kind === 'beads'
      ? mat('beads:' + style.color, () => new THREE.MeshStandardMaterial({ color: style.color, metalness: style.pearl ? 0.3 : 1, roughness: style.pearl ? 0.25 : 0.15 }))
      : mat('popcorn', () => new THREE.MeshStandardMaterial({ color: 0xf6ecd2, roughness: 0.9 }));
    const A = new THREE.Mesh(merge(lists.a), ma); A.castShadow = true; group.add(A);
    if (lists.b.length) { const B = new THREE.Mesh(merge(lists.b), mat('cranberry', () => new THREE.MeshStandardMaterial({ color: 0x9e0f1d, roughness: 0.2, metalness: 0.1 }))); group.add(B); }
    // the thread
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(3000, n), 0.0008, 3, false), mat('thread', () => new THREE.MeshStandardMaterial({ color: 0xe0d8c8, roughness: 0.9 }))));
  } else if (style.kind === 'ribbon') {
    const tx = skirtTexture(style.fabric);
    const m = mat('ribbon:' + style.fabric, () => new THREE.MeshStandardMaterial({ map: tx, roughness: style.fabric === 'velvet' ? 0.75 : 0.7, color: 0xffffff }));
    const n = Math.ceil(length / 0.02);
    const pos = [], nor = [], uv = [], idx = [];
    const W = 0.032;
    for (let face = 0; face < 2; face++) {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = curve.getPointAt(t), T = curve.getTangentAt(t);
        const out = new THREE.Vector3(p.x, 0, p.z).normalize();
        let side = new THREE.Vector3().crossVectors(T, out).normalize();
        const twist = Math.sin(t * length * 4) * 0.35;
        side.applyAxisAngle(T, twist);
        const nrm = new THREE.Vector3().crossVectors(side, T).normalize();
        if (nrm.dot(out) < 0) nrm.negate();
        for (const k of [-1, 1]) {
          pos.push(p.x + side.x * W * k + out.x * 0.006, p.y + side.y * W * k, p.z + side.z * W * k + out.z * 0.006);
          const nn = face ? nrm.clone().negate() : nrm;
          nor.push(nn.x, nn.y, nn.z);
          uv.push(k < 0 ? 0 : 0.25, t * length / 0.5);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3;
        if (face === 0) idx.push(a, cc, b, b, cc, d); else idx.push(a, b, cc, b, d, cc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------- toppers
export const TOPPERS = {
  star:     { label: 'Gold star', icon: '⭐' },
  glowstar: { label: 'Light-up star', icon: '🌟' },
  moravian: { label: 'Paper star', icon: '✴️' },
  angel:    { label: 'Angel', icon: '👼' },
  bow:      { label: 'Big bow', icon: '🎀' },
  flake:    { label: 'Snowflake', icon: '❄️' },
  pinecone: { label: 'One disappointing pinecone', icon: '🌰' },
  none:     { label: 'Nothing', icon: '∅' },
};

export function buildTopper(info, kind) {
  const g = new THREE.Group(); g.name = 'topper';
  const s = Math.pow(info.H / 2.1, 0.5);
  g.position.set(0, info.H - 0.03 * s, 0);
  g.scale.setScalar(s);
  if (kind === 'star' || kind === 'glowstar') {
    const m = kind === 'glowstar'
      ? mat('glowstar', () => new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc35a, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.2 }))
      : gold();
    const star = new THREE.Mesh(geo('topStar', () => starGeometry(0.13, 0.45, 0.025, 5)), m);
    star.position.y = 0.15; star.castShadow = true;
    g.add(star);
    g.add(new THREE.Mesh(geo('sleeve', () => { const c = new THREE.CylinderGeometry(0.012, 0.022, 0.1, 10); c.translate(0, 0.03, 0); return c; }), gold()));
    if (kind === 'glowstar') g.userData.glow = { y: 0.15 * s, color: 0xffc35a, size: 0.7 };
  } else if (kind === 'moravian') {
    const star = new THREE.Mesh(geo('moravian', () => stellated()), mat('paperstar', () => new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd88a, emissiveIntensity: 1.4, roughness: 0.6 })));
    star.position.y = 0.17; star.scale.setScalar(0.12);
    g.add(star);
    g.add(new THREE.Mesh(geo('sleeve', () => { const c = new THREE.CylinderGeometry(0.012, 0.022, 0.1, 10); c.translate(0, 0.03, 0); return c; }), gold()));
    g.userData.glow = { y: 0.17 * s, color: 0xffd88a, size: 0.8 };
  } else if (kind === 'angel') {
    const white = mat('angelGown', () => new THREE.MeshStandardMaterial({ color: 0xf8f3ea, roughness: 0.5, metalness: 0.1 }));
    const gown = new THREE.Mesh(lathe('gown', [[0, 0.2], [0.03, 0.19], [0.045, 0.12], [0.07, 0.04], [0.1, -0.03], [0.105, -0.05], [0.02, -0.05]].reverse(), 24), white);
    gown.position.y = 0.02; g.add(gown);
    const head = new THREE.Mesh(geo('sphere', () => new THREE.SphereGeometry(1, 24, 16)), mat('skin', () => new THREE.MeshStandardMaterial({ color: 0xf0c9a5, roughness: 0.6 })));
    head.scale.setScalar(0.032); head.position.y = 0.25; g.add(head);
    const hair = new THREE.Mesh(geo('sphere', () => new THREE.SphereGeometry(1, 24, 16)), gold());
    hair.scale.set(0.035, 0.03, 0.035); hair.position.set(0, 0.262, -0.006); g.add(hair);
    const halo = new THREE.Mesh(geo('halo', () => new THREE.TorusGeometry(0.035, 0.004, 6, 24).rotateX(Math.PI / 2)), mat('halo', () => new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94a, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.3 })));
    halo.position.y = 0.3; g.add(halo);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(geo('wing', () => wingGeometry()), mat('wing', () => new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.4, metalness: 0.25 })));
      w.position.set(0.012 * side, 0.18, -0.03); w.scale.set(side, 1, 1); w.rotation.y = side * 0.5;
      g.add(w);
    }
  } else if (kind === 'bow') {
    const red = mat('bowRed', () => new THREE.MeshStandardMaterial({ color: 0xa50f1d, roughness: 0.55, map: skirtTexture('velvet') }));
    buildBow(g, red, 0.16, 0.12);
  } else if (kind === 'flake') {
    const f = new THREE.Mesh(geo('flake', () => flakeGeometry(1, 0.06)), mat('bigflake', () => new THREE.MeshStandardMaterial({ color: 0xf0f6ff, metalness: 0.85, roughness: 0.35, roughnessMap: glitterTexture() })));
    f.scale.setScalar(0.15); f.position.y = 0.17; g.add(f);
  } else if (kind === 'pinecone') {
    const c = new THREE.Mesh(geo('pinecone', () => pineconeGeometry()), mat('cone', () => new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.85 })));
    c.scale.setScalar(0.085); c.rotation.z = 0.5; c.position.set(0.02, 0.075, 0); g.add(c);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function stellated() {
  const ico = new THREE.IcosahedronGeometry(0.45, 0);
  const p = ico.attributes.position, parts = [];
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const tip = a.clone().add(b).add(c).divideScalar(3).normalize().multiplyScalar(1.0);
    const g = new THREE.BufferGeometry().setFromPoints([a, b, tip, b, c, tip, c, a, tip]);
    g.computeVertexNormals(); parts.push(g);
  }
  return merge(parts);
}

function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(0.05, 0.08, 0.13, 0.12, 0.16, 0.08); s.bezierCurveTo(0.14, 0.05, 0.15, 0.02, 0.12, -0.01);
  s.bezierCurveTo(0.12, -0.04, 0.09, -0.06, 0.07, -0.08); s.bezierCurveTo(0.04, -0.06, 0.02, -0.03, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
  return g;
}

function buildBow(parent, material, size, y) {
  const loop = geo('bowLoop', () => { const t = new THREE.TorusGeometry(0.5, 0.16, 8, 24); t.scale(1, 0.55, 0.45); t.translate(0.5, 0, 0); return t; });
  for (const side of [-1, 1]) {
    const l = new THREE.Mesh(loop, material);
    l.scale.setScalar(size * 0.55); l.position.y = y; l.rotation.z = side > 0 ? 0.25 : Math.PI - 0.25;
    parent.add(l);
  }
  const knot = new THREE.Mesh(geo('sphere', () => new THREE.SphereGeometry(1, 24, 16)), material);
  knot.scale.set(size * 0.13, size * 0.12, size * 0.1); knot.position.y = y; parent.add(knot);
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(geo('tail', () => { const b = new THREE.BoxGeometry(0.16, 1, 0.02); b.translate(0, -0.5, 0); return b; }), material);
    tail.scale.setScalar(size * 0.9); tail.position.y = y; tail.rotation.z = side * 0.35; tail.rotation.y = side * 0.2;
    parent.add(tail);
  }
}

// ---------------------------------------------------------------- base: stand and skirt
export const STANDS = { bucket: 'Red stand', basket: 'Woven basket', crate: 'Wooden crate', none: 'Hidden' };
export const SKIRTS = { velvet: 'Red velvet', plaid: 'Tartan', knit: 'Cosy knit', burlap: 'Burlap', none: 'No skirt' };

export function buildBase(info, B) {
  const g = new THREE.Group(); g.name = 'base';
  const R0 = info.R0;
  const Rs = clamp(R0 * 0.75 + 0.1, 0.32, 0.8);
  if (B.skirt && B.skirt !== 'none') {
    const segs = 96, rings = 6;
    const pos = [], uv = [], idx = [];
    const inner = info.trunkR + 0.04;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, rr = lerp(inner, Rs, t);
      for (let i = 0; i <= segs; i++) {
        const a = i / segs * Math.PI * 2;
        const fold = Math.sin(a * 11) * 0.5 + 0.5;
        const rad = rr * (1 + 0.04 * Math.sin(a * 11 + 0.5) * t);
        const y = 0.004 + 0.035 * (1 - t) * (1 - t) + 0.018 * fold * Math.sin(Math.PI * Math.min(1, t * 1.2));
        pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
        uv.push(Math.cos(a) * rad * 2 + 0.5, Math.sin(a) * rad * 2 + 0.5);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sg.setIndex(idx); sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, mat('skirt:' + B.skirt, () => new THREE.MeshStandardMaterial({ map: skirtTexture(B.skirt), roughness: 0.92 })));
    sm.receiveShadow = true;
    g.add(sm);
    if (B.skirt === 'velvet' || B.skirt === 'knit') {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(Rs, 0.028, 8, 96).rotateX(Math.PI / 2), mat('fur', () => new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 1 })));
      trim.position.y = 0.012; trim.scale.set(1, 0.6, 1); trim.receiveShadow = true; trim.castShadow = true;
      g.add(trim);
    }
  }
  if (B.stand === 'bucket') {
    const red = mat('standRed', () => new THREE.MeshStandardMaterial({ color: 0x9c1a1a, metalness: 0.6, roughness: 0.35 }));
    const bowl = new THREE.Mesh(lathe('standBowl', [[0.02, 0.0], [0.15, 0.0], [0.18, 0.02], [0.2, 0.11], [0.19, 0.13], [0.06, 0.13]], 28), red);
    bowl.castShadow = true; g.add(bowl);
    const legMat = mat('standGreen', () => new THREE.MeshStandardMaterial({ color: 0x1d4d2a, metalness: 0.6, roughness: 0.4 }));
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(geo('leg', () => { const b = new THREE.BoxGeometry(0.17, 0.02, 0.035); b.translate(0.2, 0.01, 0); return b; }), legMat);
      leg.rotation.y = i * Math.PI / 2 + Math.PI / 4; g.add(leg);
    }
  } else if (B.stand === 'basket') {
    const h = clamp(info.yb * 0.9, 0.16, 0.3), r = clamp(R0 * 0.38, 0.2, 0.34);
    const cg = new THREE.CylinderGeometry(r, r * 0.88, h, 36, 1, true);
    const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * h * 4);
    cg.translate(0, h / 2, 0);
    const wm = mat('weave', () => new THREE.MeshStandardMaterial({ map: weaveTexture(), roughness: 0.9, side: THREE.FrontSide }));
    const outer = new THREE.Mesh(cg, wm); outer.castShadow = true; g.add(outer);
    const inner = new THREE.Mesh(cg.clone().scale(0.97, 1, 0.97), wm); inner.material = wm; flipFaces(inner.geometry); g.add(inner);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 48).rotateX(Math.PI / 2), mat('rim', () => new THREE.MeshStandardMaterial({ color: 0x8a6237, roughness: 0.8 })));
    rim.position.y = h; g.add(rim);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 24).rotateX(-Math.PI / 2), mat('soil', () => new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1 })));
    fill.position.y = h * 0.85; g.add(fill);
  } else if (B.stand === 'crate') {
    const h = clamp(info.yb * 0.85, 0.16, 0.3), w = clamp(R0 * 0.62, 0.32, 0.55);
    const wood = mat('crate', () => new THREE.MeshStandardMaterial({ color: 0xc19563, roughness: 0.8 }));
    for (let side = 0; side < 4; side++) for (let k = 0; k < 3; k++) {
      const plank = new THREE.Mesh(geo('plank', () => new THREE.BoxGeometry(1, 1, 1)), wood);
      plank.scale.set(w, h / 3 - 0.008, 0.02);
      plank.position.set(0, (k + 0.5) * h / 3, w / 2 - 0.01);
      const piv = new THREE.Group(); piv.rotation.y = side * Math.PI / 2; piv.add(plank); g.add(piv);
      plank.castShadow = true;
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.01, w - 0.04), mat('soil', () => new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 1 })));
    top.position.y = h * 0.92; g.add(top);
  }
  g.userData.skirtRadius = Rs;
  return g;
}

function flipFaces(geom) {
  const idx = geom.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const n = geom.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
}

// ---------------------------------------------------------------- gifts
const GIFT_COLORS = [
  ['#b3121f', '#f4e9c8', '#d9ab4f'], ['#1f6b3a', '#b3121f', '#f2efe6'], ['#1e4fa8', '#f2efe6', '#c9ccd2'],
  ['#f2efe6', '#b3121f', '#b3121f'], ['#6a2c91', '#d9ab4f', '#d9ab4f'], ['#d9ab4f', '#fff6dc', '#b3121f'],
  ['#16808a', '#f2efe6', '#f2efe6'], ['#1a2340', '#d9ab4f', '#d9ab4f'], ['#e07aa8', '#ffffff', '#ffffff'],
];

export function randomGift(rng) {
  const big = rng() < 0.25, flat = rng() < 0.25;
  const w = big ? 0.3 + rng() * 0.18 : 0.14 + rng() * 0.16;
  const d = big ? 0.26 + rng() * 0.14 : 0.12 + rng() * 0.14;
  const h = flat ? 0.06 + rng() * 0.05 : big ? 0.2 + rng() * 0.16 : 0.1 + rng() * 0.14;
  const [c1, c2, ribbon] = GIFT_COLORS[Math.floor(rng() * GIFT_COLORS.length)];
  return { w, h, d, paper: PAPERS[Math.floor(rng() * PAPERS.length)], c1, c2, ribbon, bow: rng() < 0.75 };
}

export function buildGiftMesh(gf, parent, y0 = 0) {
  const box = new THREE.BoxGeometry(gf.w, gf.h, gf.d);
  const uv = box.attributes.uv, p = box.attributes.position, n = box.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / 0.22, v / 0.22);
  }
  box.translate(0, gf.h / 2, 0);
  const paper = mat(`paper:${gf.paper}:${gf.c1}:${gf.c2}`, () => new THREE.MeshStandardMaterial({ map: paperTexture(gf.paper, gf.c1, gf.c2), roughness: gf.paper === 'foil' ? 0.25 : 0.6, metalness: gf.paper === 'foil' ? 0.7 : 0 }));
  const bm = new THREE.Mesh(box, paper); bm.position.y = y0; bm.castShadow = true; bm.receiveShadow = true;
  parent.add(bm);
  const rib = mat('ribbon:' + gf.ribbon, () => new THREE.MeshStandardMaterial({ color: gf.ribbon, roughness: 0.35, metalness: 0.3 }));
  const bw = Math.min(gf.w, gf.d) * 0.14;
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(gf.w + 0.003, gf.h + 0.003, bw).translate(0, gf.h / 2, 0), rib);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(bw, gf.h + 0.003, gf.d + 0.003).translate(0, gf.h / 2, 0), rib);
  r1.position.y = r2.position.y = y0;
  parent.add(r1, r2);
  if (gf.bow !== false) {
    const bg = new THREE.Group(); bg.position.y = y0;
    buildBow(bg, rib, Math.min(gf.w, gf.d) * 0.55, gf.h + 0.01);
    bg.children.forEach(c => { if (c.geometry === geos.get('tail')) c.visible = false; });
    bg.children = bg.children.filter(c => c.visible);
    parent.add(bg);
  }
  return parent;
}

export function buildGifts(info, gifts, skirtR) {
  const g = new THREE.Group(); g.name = 'gifts';
  for (const gf of gifts) {
    const one = new THREE.Group();
    buildGiftMesh(gf, one, 0);
    one.position.set(gf.x, gf.y ?? 0.01, gf.z);
    one.rotation.y = gf.ry ?? 0;
    one.userData.gift = true;
    g.add(one);
  }
  return g;
}

// Find a free spot on the skirt for a new present.
export function placeGift(info, gifts, gf, rng, skirtR) {
  const rIn = Math.max(info.trunkR + 0.18, 0.24), rOut = Math.max(rIn + 0.2, skirtR + 0.15);
  for (let tries = 0; tries < 80; tries++) {
    const a = rng() * Math.PI * 2, rad = lerp(rIn, rOut, Math.sqrt(rng()));
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const me = Math.hypot(gf.w, gf.d) / 2;
    let ok = true;
    for (const o of gifts) { if (o.stack) continue; const other = Math.hypot(o.w, o.d) / 2; if (Math.hypot(o.x - x, o.z - z) < (me + other) * 0.8) { ok = false; break; } }
    if (ok) { gf.x = x; gf.z = z; gf.y = 0.01; gf.ry = a + Math.PI / 2 + (rng() - 0.5) * 0.6; return gf; }
  }
  // Stack it on the biggest one.
  const base = gifts.filter(o => !o.stack).sort((p, q) => q.w * q.d - p.w * p.d)[0];
  if (base) { gf.x = base.x; gf.z = base.z; gf.y = (base.y ?? 0) + base.h + 0.002; gf.ry = base.ry + 0.4; gf.stack = true; gf.w = Math.min(gf.w, base.w * 0.8); gf.d = Math.min(gf.d, base.d * 0.8); }
  else { gf.x = rIn; gf.z = 0; gf.y = 0.01; gf.ry = 0; }
  return gf;
}

export { normalize };
