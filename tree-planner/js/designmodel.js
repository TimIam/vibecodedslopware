// Designed ornaments: shape presets, geometry, materials and the texture/row-stretch helpers the
// designer and the Tree Builder share. Origin is the hanging loop; the body hangs below it.
// Lathe profiles are 9 control points [r, y], y from 0 (top) to 1 (bottom), r as a fraction of height.
import * as THREE from 'three';
import { glitterTexture } from './textures.js';

export const TEX_W = 1024, TEX_H = 512;

const fn = (f, top) => Array.from({ length: 9 }, (_, i) => { const y = i / 8; return [i === 0 ? top : i === 8 ? 0 : +f(y).toFixed(3), y]; });
export const SHAPES = [
  { id: 'ball', label: 'Ball', kind: 'lathe', profile: fn(y => Math.sqrt(y * (1 - y)), 0.1) },
  { id: 'egg', label: 'Egg', kind: 'lathe', profile: fn(y => 0.36 * Math.sin(Math.PI * Math.pow(y, 0.75)) + 0.02, 0.08) },
  { id: 'teardrop', label: 'Teardrop', kind: 'lathe', profile: fn(y => 0.62 * Math.pow(y, 0.85) * Math.pow(1 - y, 0.55), 0.07) },
  { id: 'finial', label: 'Finial', kind: 'lathe', profile: [[0.07, 0], [0.2, 0.08], [0.3, 0.2], [0.24, 0.32], [0.12, 0.42], [0.18, 0.52], [0.08, 0.68], [0.03, 0.86], [0, 1]] },
  { id: 'onion', label: 'Onion dome', kind: 'lathe', profile: [[0.06, 0], [0.12, 0.1], [0.25, 0.28], [0.4, 0.48], [0.42, 0.58], [0.3, 0.72], [0.12, 0.84], [0.04, 0.93], [0, 1]] },
  { id: 'bell', label: 'Bell', kind: 'lathe', profile: [[0.08, 0], [0.17, 0.06], [0.2, 0.2], [0.22, 0.4], [0.27, 0.6], [0.36, 0.78], [0.46, 0.92], [0.47, 0.98], [0, 1]] },
  { id: 'lantern', label: 'Lantern', kind: 'lathe', profile: [[0.1, 0], [0.3, 0.04], [0.37, 0.14], [0.38, 0.5], [0.37, 0.86], [0.3, 0.96], [0.15, 0.99], [0.05, 1], [0, 1]] },
  { id: 'icicle', label: 'Icicle', kind: 'lathe', profile: [[0.08, 0], [0.12, 0.08], [0.11, 0.25], [0.09, 0.42], [0.07, 0.58], [0.05, 0.72], [0.03, 0.85], [0.015, 0.94], [0, 1]] },
  { id: 'disc', label: 'Flat round', kind: 'flat', width: 1 },
  { id: 'star', label: 'Star', kind: 'flat', width: 1.05 },
  { id: 'heart', label: 'Heart', kind: 'flat', width: 1 },
  { id: 'tree', label: 'Tree', kind: 'flat', width: 0.8 },
  { id: 'stocking', label: 'Stocking', kind: 'flat', width: 0.8 },
];
export const shapeById = id => SHAPES.find(s => s.id === id) || SHAPES[0];
export const CAP_COLORS = { gold: '#c9a548', silver: '#cfd4d8', copper: '#b8683c', black: '#222222' };

// Arc-length-spaced points along the (girth-scaled) profile, top first: [[r, y], ...]
export function spacedProfile(profile, n = 96, girth = 1) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r) * girth, y)));
  const pts = curve.getSpacedPoints(n).map(p => [Math.max(0, p.x), p.y]);
  pts[0][1] = 0; pts[pts.length - 1] = [0, 1];
  return pts;
}

// Flat shapes in units of height: x in [-w/2, w/2], y from 0 (top) to -1. cap = hanging point.
const FLAT = {
  disc: w => { const s = new THREE.Shape(); s.absellipse(0, -0.5, w / 2, 0.5, 0, Math.PI * 2, false, 0); return { s, cap: [0, 0] }; },
  star: w => { const s = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 0.21 : 0.5, x = Math.sin(a) * r * w, y = -0.5 + Math.cos(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } return { s, cap: [0, 0] }; },
  heart: w => { const P = (x, y) => [x * w, y], s = new THREE.Shape(); s.moveTo(0, -1);
    s.bezierCurveTo(...P(0.3, -0.75), ...P(0.5, -0.55), ...P(0.5, -0.3)); s.bezierCurveTo(...P(0.5, -0.12), ...P(0.4, 0), ...P(0.25, 0)); s.bezierCurveTo(...P(0.1, 0), ...P(0.02, -0.08), ...P(0, -0.18));
    s.bezierCurveTo(...P(-0.02, -0.08), ...P(-0.1, 0), ...P(-0.25, 0)); s.bezierCurveTo(...P(-0.4, 0), ...P(-0.5, -0.12), ...P(-0.5, -0.3)); s.bezierCurveTo(...P(-0.5, -0.55), ...P(-0.3, -0.75), 0, -1);
    return { s, cap: [0, -0.18] }; },
  tree: w => { const pts = [[0, 0], [0.55, -0.35], [0.3, -0.35], [0.8, -0.68], [0.5, -0.68], [1, -0.9], [0.12, -0.9], [0.12, -1], [-0.12, -1], [-0.12, -0.9], [-1, -0.9], [-0.5, -0.68], [-0.8, -0.68], [-0.3, -0.35], [-0.55, -0.35]];
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * w / 2, y))); return { s, cap: [0, 0] }; },
  stocking: w => { const P = (x, y) => [x * w, y], s = new THREE.Shape(); s.moveTo(...P(-0.3, 0)); s.lineTo(...P(0.15, 0)); s.lineTo(...P(0.15, -0.55));
    s.bezierCurveTo(...P(0.15, -0.62), ...P(0.5, -0.66), ...P(0.5, -0.82)); s.bezierCurveTo(...P(0.5, -0.98), ...P(0.32, -1), ...P(0.15, -1)); s.lineTo(...P(-0.1, -1));
    s.bezierCurveTo(...P(-0.25, -1), ...P(-0.3, -0.92), ...P(-0.3, -0.8)); s.lineTo(...P(-0.3, 0)); return { s, cap: [-0.075 * w, 0] }; },
};

function flatGeometry(id, w) {
  const { s, cap } = FLAT[id](w);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 28 });
  geo.translate(0, 0, -0.04);
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  return { geo, cap };
}

export function designMaterial(finish, map) {
  const base = { map };
  switch (finish) {
    case 'matte': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.78, metalness: 0.02 });
    case 'satin': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.42, metalness: 0.25 });
    case 'glitter': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.45, metalness: 0.6, bumpMap: glitterTexture(), bumpScale: 0.5, roughnessMap: glitterTexture() });
    case 'mercury': return new THREE.MeshStandardMaterial({ ...base, roughness: 0.24, metalness: 0.9, bumpMap: glitterTexture(), bumpScale: 0.12 });
    case 'clear': return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    default: return new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.12, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  }
}
export const FINISHES = [['shiny', 'Shiny glass'], ['matte', 'Matte'], ['satin', 'Satin'], ['glitter', 'Glitter'], ['mercury', 'Mercury glass'], ['clear', 'Clear glass']];

// Body width as a fraction of height.
export function profileWidth(recipe) {
  const sh = shapeById(recipe.shape);
  if (sh.kind === 'flat') return recipe.width ?? sh.width;
  return 2 * Math.max(...spacedProfile(recipe.profile, 64, recipe.girth || 1).map(p => p[0]));
}

// How much wider than tall a dab must be at texture row yc so it looks round on the ornament.
export function makeXs(recipe) {
  const sh = shapeById(recipe.shape);
  if (sh.kind === 'flat') { const k = TEX_W / ((recipe.width ?? sh.width) * TEX_H); return () => k; }
  const pts = spacedProfile(recipe.profile, 128, recipe.girth || 1);
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const N = pts.length - 1;
  return yc => { const r = pts[Math.max(0, Math.min(N, Math.round(yc / TEX_H * N)))][0]; return Math.max(0.25, Math.min(8, TEX_W * L / (2 * Math.PI * Math.max(0.015, r) * TEX_H))); };
}
export const isFlat = recipe => shapeById(recipe.shape).kind === 'flat';

export function buildDesigned(recipe, map) {
  const H = recipe.heightIn || 3.5, g = new THREE.Group(), sh = shapeById(recipe.shape), mat = designMaterial(recipe.finish, map);
  const capStyle = recipe.cap?.style || 'classic', capH = capStyle === 'none' ? 0 : H * 0.07;
  let body, capR;
  if (sh.kind === 'lathe') {
    const pts = spacedProfile(recipe.profile, 96, recipe.girth || 1);
    const lp = pts.slice().reverse().map(([r, y]) => new THREE.Vector2(Math.max(0.001, r) * H, -y * H));
    body = new THREE.Mesh(new THREE.LatheGeometry(lp, 64), mat);
    body.position.y = -capH * 0.85;
    capR = Math.max(0.05 * H, pts[0][0] * H * 1.08);
  } else {
    const { geo, cap } = flatGeometry(sh.id, recipe.width ?? sh.width); geo.scale(H, H, H);
    body = new THREE.Mesh(geo, mat);
    body.position.set(-cap[0] * H, -capH * 0.85 - cap[1] * H, 0);
    capR = 0.06 * H;
  }
  body.name = 'body'; g.add(body);
  if (capStyle !== 'none') {
    const cm = new THREE.MeshStandardMaterial({ color: CAP_COLORS[recipe.cap?.color] || CAP_COLORS.gold, metalness: recipe.cap?.color === 'black' ? 0.3 : 1, roughness: 0.3 });
    let cap;
    if (capStyle === 'crown') cap = new THREE.Mesh(new THREE.LatheGeometry([[capR * 1.15, -capH], [capR * 1.0, -capH * 0.7], [capR * 0.7, -capH * 0.45], [capR * 0.85, -capH * 0.2], [capR * 0.4, 0], [0.001, capH * 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 24), cm);
    else { cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, capH, 24), cm); cap.position.y = -capH / 2; }
    g.add(cap);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(capR * 0.4, capR * 0.09, 6, 18), cm); loop.position.y = capR * 0.3; g.add(loop);
  }
  return g;
}
