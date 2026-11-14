// Builds a decorated tree from a design object. Units: inches, y up, floor at y=0.
// Tree-local front is +z (az = 0); az = atan2(x, z). Walls: back -z, left -x, right +x, front +z.
import * as THREE from 'three';
import { treeById, PALETTE, ORN_SIZES, LIGHTS } from './data.js';
import { needleTexture, glitterTexture, paperTexture, skirtTexture, cardTexture, glowSprite, rng } from './textures.js';
import { buildCustomMesh } from './custommodel.js';

export const WALL_AZ = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
const TAU = Math.PI * 2;
const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export { wrapPi };

// Visible arc given selected walls: one wall hides the back 90°, a corner hides 180°.
export function visibleArc(walls = []) {
  if (!walls.length) return { center: 0, half: Math.PI, hidden: null };
  if (walls.length === 1) { const w = WALL_AZ[walls[0]]; return { center: wrapPi(w + Math.PI), half: Math.PI * 0.75, hidden: { center: w, half: Math.PI / 4 } }; }
  const [a, b] = walls.map(w => WALL_AZ[w]);
  const bis = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
  return { center: wrapPi(bis + Math.PI), half: Math.PI / 2, hidden: { center: bis, half: Math.PI / 2 } };
}
export const inArc = (az, arc, pad = 0) => Math.abs(wrapPi(az - arc.center)) <= arc.half + pad;

const colorOf = c => (c && c[0] === '#') ? c : (PALETTE[c] || '#cccccc');

// ---------------- tree skeleton ----------------
export function treeShape(design) {
  const sp = treeById(design.species);
  const H = design.height, y0 = Math.max(6, H * 0.07), Rb = H * sp.width / 2;
  const R = y => (y < y0 - 2 || y > H) ? 0 : Rb * Math.pow(Math.max(0, (H - y) / (H - y0)), 0.92) * (y < y0 ? 0.6 : 1);
  return { sp, H, y0, Rb, R };
}

function genSkeleton(design) {
  const { sp, H, y0, Rb, R } = treeShape(design);
  const r = rng(design.seed || 1);
  const segs = []; // {a, b, rad}
  const trunkR = Math.max(0.8, H / 70);
  const tiers = Math.round(sp.tiers * Math.max(0.6, H / 84));
  const topY = H * 0.93;
  const addBranch = (y, az, len, elev, rad, sub) => {
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
    const start = new THREE.Vector3(Math.sin(az) * trunkR * 0.6, y, Math.cos(az) * trunkR * 0.6);
    // three-part branch with sag
    let p = start.clone();
    const pts = [p.clone()];
    for (let k = 1; k <= 3; k++) {
      const q = start.clone().addScaledVector(dir, len * k / 3);
      q.y -= sp.droop * len * (k / 3) * (k / 3) * 0.6 + (k / 3) * (k / 3) * len * 0.05;
      segs.push({ a: p.clone(), b: q.clone(), rad: rad * (1 - (k - 1) * 0.28), main: true });
      p = q; pts.push(q.clone());
    }
    if (!sub) return;
    const side = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const nsub = Math.max(2, Math.round(len / 5));
    for (let i = 1; i <= nsub; i++) {
      const t = 0.18 + 0.8 * i / (nsub + 0.5);
      const seg = Math.min(2, Math.floor(t * 3)), lt = t * 3 - seg;
      const base = pts[seg].clone().lerp(pts[seg + 1], lt);
      const s = i % 2 ? 1 : -1;
      const sl = Math.max(2.5, (1 - t) * len * 0.5 + 2.5) * (0.8 + r() * 0.4);
      const d2 = dir.clone().multiplyScalar(0.55).addScaledVector(side, s * 0.85).normalize();
      d2.y += 0.12 + (r() - 0.5) * 0.2; d2.normalize();
      const end = base.clone().addScaledVector(d2, sl);
      segs.push({ a: base, b: end, rad: rad * 0.35 });
    }
  };
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const y = y0 + (topY - y0) * Math.pow(f, 0.95) + (r() - 0.5) * 1.5;
    const n = Math.max(3, Math.round((8 - 4 * f) * sp.density));
    const off = i * 2.399963;
    for (let k = 0; k < n; k++) {
      const az = off + k * TAU / n + (r() - 0.5) * 0.5;
      const len = Math.max(3, R(y) * (0.9 + r() * 0.18));
      const elev = 0.1 + f * 0.45 - sp.droop * 0.8 + (r() - 0.5) * 0.12;
      addBranch(y, az, len, elev, Math.max(0.25, trunkR * 0.45 * (1 - f * 0.6)), true);
    }
    // internodal fill between whorls
    if (i < tiers - 1 && sp.id !== 'noble') {
      const yi = y + (topY - y0) / tiers * 0.5;
      for (let k = 0; k < Math.round(n * 0.6); k++) { const az = off + 1.1 + k * TAU / (n * 0.6) + r(); addBranch(yi, az, Math.max(2.5, R(yi) * (0.7 + r() * 0.2)), 0.25 + f * 0.4, 0.2, f < 0.85); }
    }
  }
  // leader
  segs.push({ a: new THREE.Vector3(0, topY - 4, 0), b: new THREE.Vector3(0, H, 0), rad: 0.3, leader: true });
  return { segs, trunkR, topY };
}

function segDist(p, s) {
  const ab = _v1.subVectors(s.b, s.a), ap = _v2.subVectors(p, s.a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-6, ab.lengthSq())));
  return _v3.copy(s.a).addScaledVector(ab, t).distanceTo(p);
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ---------------- materials ----------------
const matCache = new Map();
function finishMat(color, finish) {
  const key = color + finish;
  if (matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color(colorOf(color));
  let m;
  if (finish === 'matte') m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05 });
  else if (finish === 'glitter') m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.75, bumpMap: glitterTexture(), bumpScale: 0.6, roughnessMap: glitterTexture() });
  else if (finish === 'mercury') m = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.35), roughness: 0.22, metalness: 1, bumpMap: glitterTexture(), bumpScale: 0.15 });
  else if (finish === 'clear') m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1 });
  else m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05 });
  matCache.set(key, m); return m;
}
const goldCap = new THREE.MeshStandardMaterial({ color: '#c9a548', metalness: 1, roughness: 0.3 });
const silverCap = new THREE.MeshStandardMaterial({ color: '#cfd4d8', metalness: 1, roughness: 0.3 });

// ---------------- ornament geometry (origin = hook point) ----------------
const geoCache = new Map();
function cachedGeo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
function lathe(profile, seg = 24) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function extrudeShape(shape, depth) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 2, curveSegments: 10 }); g.center(); return g; }
function starShape(R, inner = 0.45, n = 5) { const s = new THREE.Shape(); for (let i = 0; i <= n * 2; i++) { const a = i * Math.PI / n + Math.PI / 2, rr = i % 2 ? R * inner : R; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); } return s; }
function heartShape(R) { const s = new THREE.Shape(); s.moveTo(0, -R); s.bezierCurveTo(R * 1.3, -R * 0.1, R * 0.9, R * 1.05, 0, R * 0.45); s.bezierCurveTo(-R * 0.9, R * 1.05, -R * 1.3, -R * 0.1, 0, -R); return s; }
let stripeTex = null;
function candyStripe() { if (stripeTex) return stripeTex; const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#c3192b'; for (let y = -64; y < 320; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 40); g.lineTo(64, y + 54); g.lineTo(0, y + 14); g.fill(); } stripeTex = new THREE.CanvasTexture(c); stripeTex.colorSpace = THREE.SRGBColorSpace; stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.repeat.set(1, 3); return stripeTex; }

export function makeOrnament(o, ctx = {}) {
  const g = new THREE.Group();
  const s = ORN_SIZES[o.size || 'M'] || 3;
  const mat = finishMat(o.color, o.finish);
  const cap = (y, w = s * 0.16) => { const m = new THREE.Mesh(cachedGeo('cap', () => new THREE.CylinderGeometry(1, 1, 1, 10)), o.color === 'silver' ? silverCap : goldCap); m.scale.set(w, w * 1.1, w); m.position.y = y; g.add(m); };
  const hook = new THREE.Mesh(cachedGeo('hook', () => new THREE.TorusGeometry(0.18, 0.04, 4, 10)), silverCap); hook.position.y = -0.18; g.add(hook);
  const add = (geo, m = mat, y = 0, sc = 1) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.scale.setScalar(sc); g.add(mesh); return mesh; };
  switch (o.type) {
    case 'ball': cap(-0.45); add(cachedGeo('sph', () => new THREE.SphereGeometry(1, 24, 16)), mat, -0.5 - s / 2, s / 2); break;
    case 'teardrop': cap(-0.45); add(cachedGeo('tear', () => lathe([[0, 0], [0.18, -0.15], [0.42, -0.6], [0.5, -1.05], [0.42, -1.4], [0.22, -1.62], [0, -1.7]])), mat, -0.5, s * 0.6); break;
    case 'finial': cap(-0.45); add(cachedGeo('fin', () => lathe([[0, 0], [0.2, -0.1], [0.5, -0.45], [0.18, -0.8], [0.4, -1.15], [0.12, -1.5], [0.05, -2.3], [0, -2.6]])), mat, -0.5, s * 0.5); break;
    case 'onion': cap(-0.45); add(cachedGeo('onion', () => lathe([[0, 0], [0.12, -0.1], [0.28, -0.35], [0.55, -0.75], [0.5, -1.05], [0.25, -1.3], [0.06, -1.6], [0, -1.8]])), mat, -0.5, s * 0.6); break;
    case 'icicle': add(cachedGeo('ici', () => { const q = new THREE.ConeGeometry(0.22, 2.4, 6, 1); q.rotateX(Math.PI); q.translate(0, -1.2, 0); return q; }), mat, -0.3, s * 0.75); break;
    case 'bell': cap(-0.35, s * 0.1); add(cachedGeo('bell', () => lathe([[0, 0], [0.18, -0.02], [0.3, -0.2], [0.34, -0.55], [0.45, -0.85], [0.62, -1.0], [0.6, -1.03], [0, -1.03]])), mat, -0.4, s * 0.75);
      add(cachedGeo('clap', () => new THREE.SphereGeometry(0.12, 8, 6)), goldCap, -0.4 - s * 0.75, s * 0.8); break;
    case 'snowflake': { const arms = cachedGeo('flake', () => { const parts = []; for (let k = 0; k < 6; k++) { const b = new THREE.BoxGeometry(0.08, 1, 0.05); b.translate(0, 0.5, 0); b.rotateZ(k * Math.PI / 3); parts.push(b); for (const sgn of [-1, 1]) { const t = new THREE.BoxGeometry(0.06, 0.32, 0.05); t.translate(0, 0.16, 0); t.rotateZ(sgn * 0.7); t.translate(0, 0.6, 0); t.rotateZ(k * Math.PI / 3); parts.push(t); } } return mergeGeos(parts); }); add(arms, mat, -0.3 - s / 2, s / 2); break; }
    case 'star': add(cachedGeo('starO', () => extrudeShape(starShape(1), 0.18)), mat, -0.3 - s / 2, s / 2); break;
    case 'heart': add(cachedGeo('heart', () => extrudeShape(heartShape(0.9), 0.3)), mat, -0.3 - s / 2, s / 2); break;
    case 'candycane': { const m = cachedGeo('cane', () => { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, -2.2, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(0.35, 0, 0), new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(-0.35, 0, 0), new THREE.Vector3(-0.45, -0.35, 0)]); return new THREE.TubeGeometry(curve, 40, 0.13, 8); });
      add(m, new THREE.MeshPhysicalMaterial({ map: candyStripe(), roughness: 0.2, clearcoat: 1 }), -0.2, s * 0.5); break; }
    case 'pinecone': { const col = new THREE.MeshStandardMaterial({ color: o.color === 'white' ? '#e9e6dc' : '#6e4524', roughness: 0.9, flatShading: true });
      for (let k = 0; k < 7; k++) { const f = k / 6; const m = add(cachedGeo('pc', () => new THREE.ConeGeometry(1, 0.6, 9, 1, true)), col, -0.4 - f * s * 0.9, 1); m.scale.set(s * 0.34 * Math.sin(0.4 + f * 2.4), s * 0.18, s * 0.34 * Math.sin(0.4 + f * 2.4)); m.rotation.y = k * 0.6; }
      if (o.finish === 'glitter') g.children.forEach(c => { if (c.material === col) c.material = finishMat('white', 'glitter'); }); break; }
    case 'gingerbread': { const sh = new THREE.Shape(); sh.absarc(0, 0.75, 0.35, 0, TAU); const body = new THREE.Shape(); body.moveTo(-0.25, 0.45); body.lineTo(-0.7, 0.3); body.lineTo(-0.7, 0.12); body.lineTo(-0.25, 0.15); body.lineTo(-0.45, -0.6); body.lineTo(-0.2, -0.65); body.lineTo(0, -0.2); body.lineTo(0.2, -0.65); body.lineTo(0.45, -0.6); body.lineTo(0.25, 0.15); body.lineTo(0.7, 0.12); body.lineTo(0.7, 0.3); body.lineTo(0.25, 0.45); body.lineTo(-0.25, 0.45);
      const geo = cachedGeo('ginger', () => { const a = new THREE.ExtrudeGeometry([sh, body], { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }); a.center(); return a; });
      add(geo, new THREE.MeshStandardMaterial({ color: '#a8642c', roughness: 0.85 }), -0.3 - s / 2, s / 1.7); break; }
    case 'bird': { const bm = finishMat(o.color, o.finish); const body = add(cachedGeo('sph', () => new THREE.SphereGeometry(1, 24, 16)), bm, 0.3, 1); body.scale.set(s * 0.22, s * 0.2, s * 0.38);
      const head = add(cachedGeo('sph', () => new THREE.SphereGeometry(1, 24, 16)), bm, 0.3 + s * 0.2, s * 0.14); head.position.z = s * 0.25;
      const tail = add(cachedGeo('tail', () => { const q = new THREE.ConeGeometry(0.5, 1.6, 4); q.rotateX(-Math.PI / 2 - 0.4); return q; }), bm, 0.4, s * 0.3); tail.position.z = -s * 0.42;
      const beak = add(cachedGeo('beak', () => { const q = new THREE.ConeGeometry(0.2, 0.6, 5); q.rotateX(Math.PI / 2); return q; }), goldCap, 0.3 + s * 0.2, s * 0.2); beak.position.z = s * 0.38;
      hook.visible = false; break; }
    case 'custom': { const asset = ctx.customs?.get(o.customId); if (asset) { const m = buildCustomMesh(asset); m.position.y = -0.4; g.add(m); cap(-0.35, 0.25); } else add(cachedGeo('sph', () => new THREE.SphereGeometry(1, 24, 16)), finishMat('silver', 'matte'), -0.5 - s / 2, s / 2); break; }
    default: add(cachedGeo('sph', () => new THREE.SphereGeometry(1, 24, 16)), mat, -0.5 - s / 2, s / 2);
  }
  g.userData.ornament = o;
  return g;
}

export function mergeGeos(geos) {
  // tiny non-indexed merge (position + normal) for our own primitives
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; parts.forEach(p => n += p.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  parts.forEach(p => { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}

// ---------------- strand paths ----------------
export function strandPath(shape, opts) {
  const { H, y0, R } = shape, r = rng(opts.seed || 7);
  const wraps = opts.wraps || 5, arc = opts.arc || { center: 0, half: Math.PI };
  const yTop = H * (opts.top ?? 0.88), yBot = y0 + 3;
  const inset = opts.inset ?? 1.0, out = opts.out ?? 0.6;
  const pts = [];
  const at = (y, az, extraIn = 0) => { const rr = R(y) * inset - extraIn + out; return new THREE.Vector3(Math.sin(az) * rr, y, Math.cos(az) * rr); };
  if (arc.half >= Math.PI - 1e-3) {
    const N = Math.round(wraps * 90), phase = r() * TAU;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = yTop - (yTop - yBot) * t, az = phase + t * wraps * TAU;
      let sagY = 0, sagIn = 0;
      if (opts.swag) { const per = TAU / Math.max(5, Math.round(6 + 4 * t)), f = (((az - phase) % per) + per) % per / per; sagY = -opts.swag * Math.sin(Math.PI * f); sagIn = opts.swag * 0.4 * Math.sin(Math.PI * f); }
      if (opts.jitter) sagIn += r() * opts.jitter;
      pts.push(at(y + sagY, az, sagIn));
    }
  } else { // serpentine across the visible face only
    const rows = Math.max(2, Math.round(wraps * 1.6));
    for (let k = 0; k < rows; k++) {
      const y1 = yTop - (yTop - yBot) * (k / rows), y2 = yTop - (yTop - yBot) * ((k + 1) / rows);
      const dir = k % 2 ? -1 : 1, N = 70;
      for (let i = 0; i <= N; i++) {
        const t = i / N, az = arc.center + dir * arc.half * 0.97 * (2 * t - 1), y = y1 + (y2 - y1) * t;
        let sagY = 0, sagIn = 0;
        if (opts.swag) { const f = (t * 4) % 1; sagY = -opts.swag * Math.sin(Math.PI * f); sagIn = opts.swag * 0.4 * Math.sin(Math.PI * f); }
        if (opts.jitter) sagIn += r() * opts.jitter;
        pts.push(at(y + sagY, az, sagIn));
      }
    }
  }
  return pts;
}
function resample(pts, step) {
  const out = [pts[0].clone()]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); acc += d; while (acc >= step) { acc -= step; const t = 1 - acc / d; out.push(pts[i - 1].clone().lerp(pts[i], t)); } }
  return out;
}

const LIGHT_COLS = { multi: ['#ff3b3b', '#3bff5a', '#3b7bff', '#ffb52e', '#d94bff'], warm: ['#ffcf7a'], cool: ['#e6f6ff'], red: ['#ff2a2a'], blue: ['#2a6bff'], redgreen: ['#ff2a2a', '#2aff4e'], purple: ['#b04bff'] };

function buildLights(shape, st, arc, group, updaters, extraSeed = 0) {
  const bulb = LIGHTS.bulbs.find(b => b.id === st.style) || LIGHTS.bulbs[0];
  const path = strandPath(shape, { wraps: st.wraps || 7, arc, seed: (st.seed || 3) + extraSeed, inset: 0.9, out: 0.2, jitter: 2.5, top: 0.92 });
  const pts = resample(path, bulb.size < 0.5 ? 3.2 : bulb.size < 0.8 ? 6 : 8);
  // cord
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), Math.min(1500, path.length * 2), 0.07, 3), new THREE.MeshStandardMaterial({ color: '#1d3a22', roughness: 0.8 }));
  group.add(cord);
  const cols = LIGHT_COLS[st.color] || LIGHT_COLS.multi;
  const geo = bulb.id === 'globe' ? new THREE.SphereGeometry(bulb.size, 10, 8) : new THREE.SphereGeometry(bulb.size * 0.6, 8, 6).scale(1, 1.7, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), pts.length);
  const base = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const posArr = new Float32Array(pts.length * 3), colArr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { const out = new THREE.Vector3(p.x, 0, p.z).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.add(new THREE.Vector3(0, 0.6, 0)).normalize()); m4.compose(p, q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m4); const c = new THREE.Color(cols[i % cols.length]); base.push(c); mesh.setColorAt(i, c); posArr.set([p.x, p.y, p.z], i * 3); });
  group.add(mesh);
  const halo = new THREE.BufferGeometry(); halo.setAttribute('position', new THREE.BufferAttribute(posArr, 3)); halo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const pm = new THREE.PointsMaterial({ size: bulb.size * 13 + 2, map: glowSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(halo, pm); group.add(points);
  const phases = pts.map((_, i) => (Math.sin(i * 91.7) * 43758.5) % 1);
  const tmp = new THREE.Color();
  const apply = (t) => {
    for (let i = 0; i < pts.length; i++) {
      let b = 1;
      switch (st.mode) {
        case 'glow': b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3)); break;
        case 'blink': b = ((Math.floor(t * 1.25) + i) % 2) ? 1 : 0.12; break;
        case 'twinkle': b = 0.45 + 0.55 * Math.max(0, Math.sin(t * (2 + phases[i] * 3) + phases[i] * 20)) ** 3; break;
        case 'chase': b = ((i - Math.floor(t * 6)) % 4 + 4) % 4 === 0 ? 1 : 0.2; break;
        case 'off': b = 0.18; break;
      }
      tmp.copy(base[i]).multiplyScalar(Math.max(0.15, b)); mesh.setColorAt(i, tmp);
      const hb = st.mode === 'off' ? 0 : b * b;
      colArr[i * 3] = base[i].r * hb; colArr[i * 3 + 1] = base[i].g * hb; colArr[i * 3 + 2] = base[i].b * hb;
    }
    mesh.instanceColor.needsUpdate = true; halo.attributes.color.needsUpdate = true;
  };
  apply(0);
  if (st.mode !== 'steady') updaters.push(apply);
}

function buildGarland(shape, st, arc, group) {
  const swag = st.style === 'ribbon' ? 3 : st.style === 'tinselg' ? 3.5 : 4.5;
  const path = strandPath(shape, { wraps: st.wraps || 4, arc, seed: st.seed || 11, swag, out: 1.2 });
  const col = colorOf(st.color === 'plaid' ? 'red' : st.color);
  if (st.style === 'beads' || st.style === 'wood' || st.style === 'popcorn') {
    const rad = st.style === 'wood' ? 0.55 : st.style === 'popcorn' ? 0.5 : 0.32;
    const pts = resample(path, rad * 2.05);
    const geo = st.style === 'popcorn' ? new THREE.IcosahedronGeometry(rad, 0) : new THREE.SphereGeometry(rad, 10, 8);
    const mat = st.style === 'beads' ? finishMat(st.color, 'shiny') : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: st.style === 'wood' ? 0.6 : 0.9, flatShading: st.style === 'popcorn' });
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length); const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(i, m4); if (st.style !== 'beads') mesh.setColorAt(i, new THREE.Color(st.style === 'popcorn' ? (i % 5 === 4 ? '#b0101e' : '#f6efd9') : col)); });
    group.add(mesh);
  } else if (st.style === 'ribbon') {
    const pts = resample(path, 0.6), w = 1.4, pos = [], uv = [], idx = [];
    let along = 0;
    pts.forEach((p, i) => { const n = new THREE.Vector3(p.x, 0, p.z).normalize(); const tan = (pts[i + 1] || p).clone().sub(pts[i - 1] || p).normalize(); const up = new THREE.Vector3().crossVectors(n, tan).normalize(); pos.push(p.x + up.x * w, p.y + up.y * w, p.z + up.z * w, p.x - up.x * w, p.y - up.y * w, p.z - up.z * w); if (i) along += p.distanceTo(pts[i - 1]); uv.push(along / 6, 0, along / 6, 1); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = st.color === 'plaid' ? new THREE.MeshStandardMaterial({ map: skirtTexture('plaid', '#a8141f', '#0c3a1e'), side: THREE.DoubleSide, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.35, metalness: st.color === 'gold' || st.color === 'silver' ? 0.7 : 0.1 });
    group.add(new THREE.Mesh(geo, mat));
  } else { // tinsel garland: core + fringe strands
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.25, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), path.length, 0.35, 5), mat));
    const pts = resample(path, 0.22), geo = new THREE.PlaneGeometry(0.09, 1.7); geo.translate(0, 0.85, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length * 2), m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), r = rng(st.seed || 5), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < pts.length * 2; i++) { const p = pts[i >> 1]; e.set(r() * TAU, r() * TAU, r() * TAU); q.setFromEuler(e); m4.compose(p, q, one); mesh.setMatrixAt(i, m4); }
    group.add(mesh);
  }
}

function buildTinsel(shape, skel, st, arc, group) {
  const r = rng(st.seed || 21), segs = skel.segs.filter(s => !s.main && !s.leader);
  const n = Math.round((st.amount || 1) * Math.min(900, segs.length * 0.9));
  const geo = new THREE.PlaneGeometry(0.12, 1); geo.translate(0, -0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.2, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const base = colorOf(st.color === 'rainbow' || st.color === 'holo' ? 'silver' : st.color);
  let k = 0;
  for (let tries = 0; k < n && tries < n * 4; tries++) {
    const s = segs[Math.floor(r() * segs.length)], p = s.a.clone().lerp(s.b, 0.4 + r() * 0.6);
    if (!inArc(Math.atan2(p.x, p.z), arc, -0.1)) continue;
    e.set((r() - 0.5) * 0.08, r() * TAU, (r() - 0.5) * 0.08); q.setFromEuler(e);
    m4.compose(p, q, new THREE.Vector3(1, 5 + r() * 7, 1)); mesh.setMatrixAt(k, m4);
    const c = st.color === 'rainbow' ? new THREE.Color().setHSL(r(), 0.85, 0.6) : st.color === 'holo' ? new THREE.Color().setHSL(0.5 + r() * 0.35, 0.5, 0.75) : new THREE.Color(base);
    mesh.setColorAt(k, c); k++;
  }
  mesh.count = k; group.add(mesh);
}

function buildTopper(tp, shape, group, updaters) {
  const g = new THREE.Group(), H = shape.H, s = Math.max(5, H * 0.09);
  const col = colorOf(tp.color === 'plaid' ? 'red' : tp.color);
  const metal = new THREE.MeshStandardMaterial({ color: col, metalness: 0.95, roughness: 0.25 });
  if (tp.type === 'star' || tp.type === 'litstar') {
    const m = new THREE.Mesh(extrudeShape(starShape(s * 0.55), s * 0.08), tp.type === 'litstar' ? new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.4 }) : metal);
    m.position.y = s * 0.55; g.add(m);
    if (tp.type === 'litstar') { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(s * 3); sp.position.y = s * 0.55; g.add(sp); updaters.push(t => sp.material.opacity = 0.7 + 0.3 * Math.sin(t * 2)); }
  } else if (tp.type === 'angel') {
    const robe = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: tp.color === 'gold' ? 0.6 : 0 });
    const dress = new THREE.Mesh(lathe([[0.05, 1.0], [0.18, 0.95], [0.25, 0.6], [0.45, 0.05], [0.5, 0], [0.0, 0]], 20), robe); dress.scale.setScalar(s); dress.position.y = -s * 0.15; g.add(dress);
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#f1cfb0', roughness: 0.6 })); head.position.y = s * 0.98; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(s * 0.14, 16, 12, 0, TAU, 0, 1.8), new THREE.MeshStandardMaterial({ color: '#d9b25a', roughness: 0.7 })); hair.position.y = s * 1.0; hair.rotation.x = -0.3; g.add(hair);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(s * 0.12, s * 0.015, 6, 24), goldCap); halo.rotation.x = Math.PI / 2; halo.position.y = s * 1.18; g.add(halo);
    const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.2, 0.5, 0.6, 0.55, 0.55, 0.1); wingShape.bezierCurveTo(0.45, -0.1, 0.25, -0.2, 0, 0);
    const wmat = new THREE.MeshStandardMaterial({ color: '#fbfbff', roughness: 0.5, side: THREE.DoubleSide, metalness: 0.2 });
    for (const sg of [-1, 1]) { const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), wmat); w.scale.set(s * sg, s, s); w.position.set(0, s * 0.6, -s * 0.12); w.rotation.y = sg * 0.5; g.add(w); }
    g.position.y = -s * 0.2;
  } else if (tp.type === 'bow') {
    const bm = tp.color === 'plaid' ? new THREE.MeshStandardMaterial({ map: skirtTexture('plaid', '#a8141f', '#0c3a1e'), roughness: 0.6, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
    for (const sg of [-1, 1]) { const loop = new THREE.Mesh(new THREE.TorusGeometry(s * 0.28, s * 0.07, 8, 20), bm); loop.scale.set(1, 0.6, 0.45); loop.position.set(sg * s * 0.27, s * 0.4, 0); loop.rotation.z = sg * 0.25; g.add(loop);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.18, s * 1.4), bm); tail.position.set(sg * s * 0.2, -s * 0.25, s * 0.06); tail.rotation.z = sg * 0.25; g.add(tail); }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 10, 8), bm); knot.position.y = s * 0.4; knot.scale.set(1, 1, 0.7); g.add(knot);
  } else if (tp.type === 'snowflake') {
    const flake = makeOrnament({ type: 'snowflake', color: tp.color, finish: 'glitter', size: 'XL' }); flake.scale.setScalar(s / 4.2); flake.position.y = s * 1.15; g.add(flake);
  } else { // glass spire
    const m = new THREE.Mesh(lathe([[0.0, 0], [0.18, 0.02], [0.2, 0.25], [0.35, 0.45], [0.12, 0.7], [0.28, 0.9], [0.06, 1.15], [0.03, 2.0], [0, 2.1]], 24), finishMat(tp.color, 'mercury')); m.scale.setScalar(s * 0.55); m.position.y = -s * 0.35; g.add(m);
  }
  g.position.y = H - 1.5;
  group.add(g);
}

function buildSkirt(sk, shape, group, wallDist) {
  const R = Math.max(14, Math.min(32, shape.H * 0.3)), seg = 120;
  const geo = new THREE.RingGeometry(2.5, R, seg, 6); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i); const rr = Math.hypot(x, z), th = Math.atan2(z, x), f = (rr - 2.5) / (R - 2.5);
    let y = 0.35 + (sk.style === 'fur' ? 1.2 : 0.7) * Math.sin(th * 13) * f * f + 0.6 * (1 - f);
    for (const [ax, sign] of wallDist) { const v = ax === 'x' ? x : z; const lim = sign * v - (wallLimit(wallDist) - 0.5); if (lim > 0) { if (ax === 'x') x -= sign * lim; else z -= sign * lim; y += lim * 0.8; } }
    p.setXYZ(i, x, y, z); uv.setXY(i, x / 24, z / 24);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: skirtTexture(sk.style, sk.color, sk.color2), roughness: sk.style === 'sequin' ? 0.35 : sk.style === 'velvet' ? 0.55 : 0.9, metalness: sk.style === 'sequin' ? 0.8 : 0, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(geo, mat));
  if (sk.style === 'velvet' || sk.style === 'quilted' || sk.style === 'knit') {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(R, 1.1, 6, 96), new THREE.MeshStandardMaterial({ color: sk.color2 || '#f7f7f2', roughness: 1 }));
    trim.rotation.x = Math.PI / 2; trim.position.y = 0.6; trim.scale.z = 0.7; if (!wallDist.length) group.add(trim);
  }
  return R;
}
let _wallLim = 99; function wallLimit() { return _wallLim; }

// ---------------- presents ----------------
export function layoutPresents(presents, shape, arc, wallDist, seed = 1) {
  const r = rng(seed), placed = [];
  const lim = wallDist.length ? _wallLim : 99;
  const order = presents.map((p, i) => i).sort((a, b) => (presents[b].w * presents[b].d) - (presents[a].w * presents[a].d));
  for (const i of order) {
    const p = presents[i]; if (p.x != null && p.fixed) { placed.push(p); continue; }
    const rad = Math.hypot(p.w, p.d) / 2;
    let best = null;
    for (let t = 0; t < 300; t++) {
      const az = arc.center + (r() * 2 - 1) * arc.half * 0.95, dist = 5 + rad * 0.7 + r() * (shape.Rb * 0.9);
      const x = Math.sin(az) * dist, z = Math.cos(az) * dist;
      if (wallDist.some(([ax, s]) => s * (ax === 'x' ? x : z) + rad * 0.8 > lim)) continue;
      if (placed.some(q => Math.hypot(q.x - x, q.z - z) < (rad + Math.hypot(q.w, q.d) / 2) * 0.82)) continue;
      // big boxes toward the back (away from the open side), small ones in front
      const score = -Math.abs(dist - (8 + rad)) - (Math.cos(az - arc.center) * (p.h > 8 ? -1 : 1)) * 3 + r();
      if (!best || score > best.score) best = { x, z, score };
    }
    if (!best) best = { x: (r() - 0.5) * 30, z: 20 + r() * 10 };
    p.x = best.x; p.z = best.z; p.rot = p.rot ?? (r() - 0.5) * 0.9; placed.push(p);
  }
}

function buildPresent(p, ctx) {
  const g = new THREE.Group();
  const img = p.paper.style === 'custom' ? ctx.papers?.get(p.paper.imgId) : null;
  const base = paperTexture(p.paper, img);
  const mats = [[p.d, p.h], [p.d, p.h], [p.w, p.d], [p.w, p.d], [p.w, p.h], [p.w, p.h]].map(([a, b]) => { const t = base.clone(); t.needsUpdate = true; t.repeat.set(a / 12, b / 12); return new THREE.MeshStandardMaterial({ map: t, roughness: p.paper.style === 'gold' || p.paper.style === 'silver' ? 0.3 : 0.7, metalness: p.paper.style === 'gold' || p.paper.style === 'silver' ? 0.6 : 0 }); });
  const box = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mats); box.position.y = p.h / 2; g.add(box);
  const rc = p.ribbon?.color || '#c3192b', rmat = new THREE.MeshStandardMaterial({ color: rc, roughness: 0.35, metalness: 0.3 });
  const rw = Math.max(0.6, Math.min(1.5, Math.min(p.w, p.d) * 0.1)), e = 0.06;
  const band = (alongX, off = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? p.w + e * 2 : rw, p.h + e * 2, alongX ? rw : p.d + e * 2), rmat); m.position.set(alongX ? 0 : off, p.h / 2, alongX ? off : 0); g.add(m); };
  const rs = p.ribbon?.style || 'cross';
  if (rs === 'cross') { band(true); band(false); }
  else if (rs === 'single') band(false);
  else if (rs === 'double') { band(true, -p.d * 0.2); band(true, p.d * 0.2); band(false, -p.w * 0.2); band(false, p.w * 0.2); }
  else if (rs === 'diagonal') { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(p.w, p.d) * 0.98, 0.04, rw), rmat); m.rotation.y = Math.atan2(p.d, p.w); m.position.y = p.h + e; g.add(m); }
  const bs = p.bow?.style || 'loopy', bc = p.bow?.color || rc, bmat = new THREE.MeshStandardMaterial({ color: bc, roughness: 0.35, metalness: 0.35, side: THREE.DoubleSide });
  const S = Math.max(1.5, Math.min(5, Math.min(p.w, p.d) * 0.32)), top = p.h + e;
  if (bs === 'loopy') { for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(S * 0.4, S * 0.1, 6, 16), bmat); l.scale.set(1, 0.55, 0.6); l.rotation.y = k * Math.PI / 2 + 0.4; l.rotation.z = 0.5; l.position.set(Math.cos(k * Math.PI / 2 + 0.4) * S * 0.3, top + S * 0.15, -Math.sin(k * Math.PI / 2 + 0.4) * S * 0.3); g.add(l); } }
  else if (bs === 'pull') { const geo = new THREE.TorusGeometry(S * 0.25, S * 0.06, 5, 12); const rr = rng(p.w * 31 + p.d); for (let k = 0; k < 14; k++) { const l = new THREE.Mesh(geo, bmat); l.position.set((rr() - .5) * S * 0.5, top + S * 0.25 + rr() * S * 0.3, (rr() - .5) * S * 0.5); l.rotation.set(rr() * 3, rr() * 3, rr() * 3); g.add(l); } }
  else if (bs === 'flat') { for (const sg of [-1, 1]) { const l = new THREE.Mesh(new THREE.TorusGeometry(S * 0.35, S * 0.08, 5, 16), bmat); l.scale.set(1, 0.4, 0.15); l.rotation.x = -Math.PI / 2; l.position.set(sg * S * 0.33, top + 0.1, 0); g.add(l); } }
  else if (bs === 'rosette') { const m = new THREE.Mesh(extrudeShape(starShape(S * 0.6, 0.6, 8), 0.3), bmat); m.rotation.x = -Math.PI / 2; m.position.y = top + 0.2; g.add(m); }
  else if (bs === 'curly') { for (let k = 0; k < 6; k++) { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3(Math.cos(k + t * 14) * 0.5 * (1 - t * 0.3), top - t * S * 1.4, Math.sin(k + t * 14) * 0.5).add(new THREE.Vector3(Math.cos(k) * t * S * 0.9, 0, Math.sin(k) * t * S * 0.9))); } const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.06, 3), bmat); g.add(m); } }
  if (bs !== 'none' && bs !== 'curly' && bs !== 'flat') { const knot = new THREE.Mesh(new THREE.SphereGeometry(S * 0.14, 8, 6), bmat); knot.position.y = top + S * 0.08; g.add(knot); }
  const cd = p.card;
  if (cd && cd.type !== 'none') {
    const tx = cardTexture(cd.type, cd.color || '#f5f0e0', cd.to || '', cd.from || '');
    const cm = new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8, side: THREE.DoubleSide });
    if (cd.type === 'note') { for (const sg of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), cm); pl.position.set(p.w * 0.25, top + 0.85, sg * 0.45); pl.rotation.x = sg * 0.45; g.add(pl); } }
    else { const w = cd.type === 'envelope' ? 4.5 : 2.6, h = cd.type === 'envelope' ? 3 : 1.6; const pl = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [cm, cm, cm, cm, cm, cm]); pl.position.set(Math.min(p.w / 2 - w / 2, 0.3 * p.w), Math.min(p.h - 0.2, h / 2 + 0.4), p.d / 2 + 0.15); pl.rotation.x = -0.12; g.add(pl); }
  }
  g.position.set(p.x, 0.6, p.z); g.rotation.y = p.rot || 0;
  g.userData.present = p;
  return g;
}

// ---------------- full design ----------------
export function wallAxes(walls) {
  return (walls || []).map(w => w === 'back' ? ['z', -1] : w === 'front' ? ['z', 1] : w === 'left' ? ['x', -1] : ['x', 1]);
}

export function buildDesign(design, ctx = {}) {
  const root = new THREE.Group();
  const shape = treeShape(design), { sp, H } = shape;
  const skel = genSkeleton(design);
  const updaters = [];
  const arc = visibleArc(design.walls);
  const wd = wallAxes(design.walls);
  _wallLim = shape.Rb + 3;

  // stand + trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(skel.trunkR * 0.5, skel.trunkR, H * 0.92, 10), new THREE.MeshStandardMaterial({ color: sp.artificial ? '#3b3b36' : '#5a3f2a', roughness: 0.95 }));
  trunk.position.y = H * 0.46; root.add(trunk);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 5, 20), new THREE.MeshStandardMaterial({ color: '#7d1a1a', roughness: 0.5, metalness: 0.2 })); stand.position.y = 2.5;
  if (!design.skirt) root.add(stand);

  // branches as instanced prisms
  const bgeo = new THREE.CylinderGeometry(0.7, 1, 1, 5, 1, true); bgeo.translate(0, 0.5, 0);
  const bmesh = new THREE.InstancedMesh(bgeo, new THREE.MeshStandardMaterial({ color: sp.artificial ? (sp.metal ? '#9aa4ab' : '#26301f') : '#3a2c1e', roughness: 0.9 }), skel.segs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  skel.segs.forEach((s, i) => { const d = s.b.clone().sub(s.a), L = d.length(); q.setFromUnitVectors(Y, d.normalize()); sc.set(s.rad, L, s.rad); m4.compose(s.a, q, sc); bmesh.setMatrixAt(i, m4); });
  root.add(bmesh);

  // foliage cards
  const flock = Math.max(design.flock || 0, sp.flock || 0);
  const ntex = needleTexture(sp.style, sp.color, sp.under, flock);
  const cardW = Math.min(9, Math.max(4.2, sp.needle * 4.6)) * (H / 84) ** 0.3, cardL = cardW * 1.7;
  const step = cardL * 0.38;
  const cards = [];
  for (const s of skel.segs) {
    const L = s.a.distanceTo(s.b), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (s.main && Math.hypot(s.a.x + (s.b.x - s.a.x) * t, s.a.z + (s.b.z - s.a.z) * t) < skel.trunkR * 3) continue; cards.push([s, t]); }
  }
  const fgeo = new THREE.PlaneGeometry(cardW, cardL); fgeo.translate(0, cardL * 0.4, 0);
  const fmat = new THREE.MeshStandardMaterial({ map: ntex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: sp.metal ? 0.25 : 0.85, metalness: sp.metal ? 0.9 : 0 });
  const per = 2;
  const fmesh = new THREE.InstancedMesh(fgeo, fmat, cards.length * per);
  const r = rng((design.seed || 1) * 7 + 3), white = new THREE.Color('#ffffff'), cc = new THREE.Color(), tipPts = [];
  let fi = 0;
  for (const [s, t] of cards) {
    const p = s.a.clone().lerp(s.b, t), dir = s.b.clone().sub(s.a).normalize();
    dir.y += 0.15; dir.normalize();
    for (let k = 0; k < per; k++) {
      q.setFromUnitVectors(Y, dir);
      const roll = new THREE.Quaternion().setFromAxisAngle(dir, (sp.style === 'fir' || sp.style === 'pe' || sp.style === 'cypress' || sp.style === 'noble' ? Math.PI / 2 + (r() - 0.5) * 0.7 : r() * Math.PI) + k * Math.PI / 2);
      q.premultiply(roll);
      m4.compose(p, q, sc.set(0.85 + r() * 0.3, 0.85 + r() * 0.3, 1)); fmesh.setMatrixAt(fi, m4);
      const rr = Math.hypot(p.x, p.z) / Math.max(1, shape.R(p.y));
      const shadeV = 0.42 + 0.58 * Math.min(1, rr) * (0.88 + r() * 0.2);
      cc.setRGB(shadeV, shadeV, shadeV);
      if (flock && dir.y > -0.1) cc.lerp(white, Math.min(0.6, flock * 0.15 * (0.5 + r())));
      fmesh.setColorAt(fi, cc); fi++;
    }
    if (t > 0.8 && !s.main) tipPts.push(s.b);
  }
  root.add(fmesh);
  if (sp.id !== 'noble' && !sp.metal && !sp.fiber) { // dense interior so you can't see straight through
    const pts = []; for (let i = 0; i <= 12; i++) { const y = shape.y0 + (H * 0.88 - shape.y0) * i / 12; pts.push(new THREE.Vector2(Math.max(0.5, shape.R(y) * 0.7), y)); }
    root.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.color).multiplyScalar(0.3), roughness: 1 })));
  }

  if (sp.fiber) { // glowing fiber tips
    const pos = new Float32Array(tipPts.length * 3), col = new Float32Array(tipPts.length * 3);
    tipPts.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, map: glowSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    root.add(pts); const tc = new THREE.Color();
    updaters.push(t => { for (let i = 0; i < tipPts.length; i++) { tc.setHSL((t * 0.08 + i * 0.013) % 1, 1, 0.55); col.set([tc.r, tc.g, tc.b], i * 3); } geo.attributes.color.needsUpdate = true; });
  }
  if (sp.prelit && !(design.strands || []).some(s => s.kind === 'lights')) buildLights(shape, { style: 'mini', color: 'warm', mode: 'steady', wraps: 9, seed: 99 }, arc, root, updaters);

  // strands
  (design.strands || []).forEach((st, i) => {
    const sarc = st.arc ? { center: st.arc.center, half: st.arc.half } : arc;
    if (st.kind === 'lights') buildLights(shape, st, sarc, root, updaters, i);
    else if (st.kind === 'garland') buildGarland(shape, st, sarc, root);
    else if (st.kind === 'tinsel') buildTinsel(shape, skel, st, sarc, root);
  });

  // ornaments
  const ornGroup = new THREE.Group(); root.add(ornGroup);
  const ornObjs = new Map();
  for (const o of design.ornaments || []) {
    const obj = makeOrnament(o, ctx);
    obj.position.copy(ornamentPos(o, shape));
    obj.rotation.y = Math.atan2(obj.position.x, obj.position.z) + (o.spin || 0);
    ornGroup.add(obj); ornObjs.set(o.id, obj);
  }
  if (design.topper) buildTopper(design.topper, shape, root, updaters);
  let skirtR = 0;
  if (design.skirt) skirtR = buildSkirt(design.skirt, shape, root, wd);
  if (design.presents?.length) {
    layoutPresents(design.presents, shape, arc, wd, design.seed || 1);
    for (const p of design.presents) root.add(buildPresent(p, ctx));
  }
  return {
    root, shape, skel, arc, ornGroup, ornObjs, skirtR, raycast: [fmesh, bmesh], wallLimit: shape.Rb + 3,
    update(t) { for (const u of updaters) u(t); },
    dispose() { root.traverse(o => { if (o.geometry && !o.geometry.userData?.shared && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose(); }); },
  };
}

export function ornamentPos(o, shape) {
  if (o.free) return new THREE.Vector3(o.free.x, o.free.y, o.free.z);
  const y = o.u * shape.H, R = shape.R(y), rr = o.rr * R;
  return new THREE.Vector3(Math.sin(o.az) * rr, y, Math.cos(o.az) * rr);
}
export function toOrnCoords(p, shape) {
  const y = p.y, R = Math.max(0.5, shape.R(y));
  return { u: y / shape.H, az: Math.atan2(p.x, p.z), rr: Math.hypot(p.x, p.z) / R };
}

// Distance from the ornament's hook to the nearest branch, minus foliage reach. > tol means floating.
export function attachGap(o, built) {
  const p = ornamentPos(o, built.shape);
  let best = Infinity;
  for (const s of built.skel.segs) { const d = segDist(p, s); if (d < best) best = d; }
  const reach = Math.min(4, Math.max(1.1, treeById(built.shape.sp.id).needle * 1.6)) + 0.8;
  return { gap: best - reach, pos: p };
}
export function nearestBranchPoint(p, built) {
  let best = Infinity, bp = null;
  for (const s of built.skel.segs) {
    const ab = s.b.clone().sub(s.a), t = Math.max(0, Math.min(1, p.clone().sub(s.a).dot(ab) / ab.lengthSq()));
    const c = s.a.clone().addScaledVector(ab, t), d = c.distanceTo(p);
    if (d < best) { best = d; bp = c; }
  }
  return bp;
}

// Sample decor attachment points on the outer canopy within the visible arc.
export function sampleCanopy(built, n, arc, seed = 1, minDist = 0) {
  const r = rng(seed), segs = built.skel.segs.filter(s => !s.leader), out = [];
  const { H } = built.shape;
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const s = segs[Math.floor(r() * segs.length)], t = 0.55 + r() * 0.45, p = s.a.clone().lerp(s.b, t);
    if (p.y > H * 0.9 || p.y < built.shape.y0 + 2) continue;
    const R = built.shape.R(p.y), rr = Math.hypot(p.x, p.z) / Math.max(1, R);
    if (rr < 0.68) continue;
    const az = Math.atan2(p.x, p.z);
    if (!inArc(az, arc, -0.08)) continue;
    if (minDist && out.some(o => o.distanceTo(p) < minDist)) continue;
    p.y -= 0.3;
    out.push(p);
  }
  return out;
}
