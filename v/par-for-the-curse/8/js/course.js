// Mount Bogey: nine floating holes in a square spiral around a rock spire. Each hole climbs 7 m from
// its tee pad to its green pad, and hole n sits 28 m above hole n-4, so a ball that falls off an upper
// hole usually lands on an earlier one. Holes are written in a local frame: x runs from the tee pad
// centre (0) to the green pad centre (80), z points inward toward the spire, y is metres above the tee.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Collider, BALL_R } from './physics.js';
import { make, toon, addOutline, gradientMap, manifest } from './assets.js';
const pm = n => manifest.props?.objects?.[n] || {};

export const SIDE = 80, PAD = 9, RISE = 7, NHOLES = 9, CUP_R = 0.16, SEA_Y = -40;
const CORNERS = [[40, 40], [-40, 40], [-40, -40], [40, -40]];
const DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export function padPos(k) { const c = CORNERS[k % 4]; return new THREE.Vector3(c[0], k * RISE, c[1]); }

class Frame {
  constructor(i) {
    this.i = i;
    this.o = padPos(i - 1);
    const d = DIRS[(i - 1) % 4];
    this.f = new THREE.Vector3(d[0], 0, d[1]);
    this.in = new THREE.Vector3(-d[1], 0, d[0]);
    this.m = new THREE.Matrix4().makeBasis(this.f, UP, this.in).setPosition(this.o);
    this.q = new THREE.Quaternion().setFromRotationMatrix(this.m);
    this.inv = this.m.clone().invert();
    this.yaw = Math.atan2(this.f.x, this.f.z);
  }
  w(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.m); }
  local(p, out = new THREE.Vector3()) { return out.copy(p).applyMatrix4(this.inv); }
}
export const frames = [null]; for (let i = 1; i <= NHOLES; i++) frames.push(new Frame(i));

/* ---------------- materials ---------------- */
const GLSL_NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }
`;
function worldVaryings(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;\n' + GLSL_NOISE);
}
// Grass on top with mowing stripes, a darker lip, and banded sandstone cliffs on the sides.
function makeTerrain(g1, g2, stripes) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
  m.customProgramCacheKey = () => 'terrain' + g1 + g2;
  m.onBeforeCompile = sh => {
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec3 col; float up = vWN.y;
      float n = vnoise(vWP.xz * 0.35) * 0.6 + vnoise(vWP.xz * 1.9) * 0.4;
      if (up > 0.72) {
        float stripe = ${stripes ? 'step(0.5, fract((vWP.x + vWP.z) * 0.09))' : 'smoothstep(0.35, 0.75, vnoise(vWP.xz * 0.6))'};
        col = mix(s2l(vec3(${g1})), s2l(vec3(${g2})), stripe) * (0.9 + n * 0.2);
      } else if (up > 0.2) {
        col = s2l(vec3(0.29,0.60,0.21)) * (0.92 + n * 0.16);
      } else {
        float w = vnoise(vec2(vWP.x + vWP.z, vWP.y) * vec2(0.08, 0.5)) * 1.4;
        float band = fract(vWP.y * 0.32 + w);
        vec3 c1 = s2l(vec3(0.85,0.58,0.36)), c2 = s2l(vec3(0.74,0.47,0.29)), c3 = s2l(vec3(0.92,0.70,0.45));
        col = band < 0.4 ? c1 : (band < 0.75 ? c2 : c3);
        col *= 0.88 + vnoise(vec2(vWP.x + vWP.z, vWP.y) * 1.3) * 0.18;
        if (up < -0.5) col *= 0.55;
      }
      vec4 diffuseColor = vec4(diffuse * col, opacity);`);
  };
  return m;
}
export const terrainMat = makeTerrain('0.42,0.80,0.30', '0.35,0.71,0.25', true);
const roughMat = makeTerrain('0.30,0.62,0.22', '0.25,0.53,0.19', false);
const greenMat = (() => {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      float stripe = step(0.5, fract((vWP.x - vWP.z) * 0.6));
      vec3 col = mix(s2l(vec3(0.55,0.90,0.40)), s2l(vec3(0.49,0.84,0.35)), stripe) * (0.95 + vnoise(vWP.xz * 3.0) * 0.08);
      vec4 diffuseColor = vec4(diffuse * col, opacity);`);
  };
  return m;
})();
const sandMat = (() => {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = sh => {
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      float n = vnoise(vWP.xz * 6.0) * 0.5 + vnoise(vWP.xz * 1.2) * 0.5;
      float rake = smoothstep(0.35, 0.5, abs(fract((vWP.x + vWP.z * 0.3) * 1.6) - 0.5));
      vec3 col = s2l(vec3(0.98,0.86,0.58)) * (0.9 + n * 0.12) * (0.93 + rake * 0.07);
      vec4 diffuseColor = vec4(diffuse * col, opacity);`);
  };
  return m;
})();
const teeMat = toon(0x7fd65c, { params: { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } });
export const waterMat = (() => {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  m.userData.uTime = { value: 0 };
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = m.userData.uTime;
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec2 p = vWP.xz * 0.5;
      float n = vnoise(p + vec2(uTime * 0.3, uTime * 0.2)) + vnoise(p * 2.3 - vec2(uTime * 0.25, -uTime * 0.15)) * 0.6;
      float sparkle = smoothstep(1.12, 1.25, n);
      vec3 col = mix(s2l(vec3(0.20,0.62,0.86)), s2l(vec3(0.33,0.78,0.93)), smoothstep(0.6, 1.1, n)) + sparkle * 0.7;
      vec4 diffuseColor = vec4(diffuse * col, opacity);`);
  };
  return m;
})();
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const woodTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b8794a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#c4864f' : '#ad6f41'; g.fillRect(0, i * 32, w, 30);
    g.fillStyle = '#6e4325'; g.fillRect(0, i * 32 + 30, w, 2);
    for (let k = 0; k < 18; k++) { g.fillStyle = 'rgba(90,50,25,0.25)'; g.fillRect(Math.random() * w, i * 32 + 3 + Math.random() * 24, 20 + Math.random() * 60, 1.5); }
    g.fillStyle = '#5b3a20'; g.beginPath(); g.arc(12, i * 32 + 15, 2.2, 0, 7); g.arc(w - 12, i * 32 + 15, 2.2, 0, 7); g.fill();
  }
});
const woodMat = toon(0xffffff, { params: { map: woodTex } });
const stoneMat = toon(0xc9b9a6);
const beltTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffcc33';
  for (let y = 0; y < 2; y++) { g.beginPath(); const o = y * 64; g.moveTo(64, o + 8); g.lineTo(108, o + 40); g.lineTo(108, o + 56); g.lineTo(64, o + 24); g.lineTo(20, o + 56); g.lineTo(20, o + 40); g.fill(); }
});
const hazardTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#ffcf33'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2233';
  for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 64, h); g.lineTo(i * 32 + 64, h); g.fill(); }
});
const stripeTex = canvasTex(64, 16, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff4757'; g.fillRect(i * 16, 0, 16, h); } });

/* ---------------- course ---------------- */
export class Course {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.root = new THREE.Group(); scene.add(this.root);
    this.camBlockers = [this.root];   // what the camera may not pass through
    this.cartSpots = [];
    this.holes = []; this.zones = []; this.animators = []; this.winds = []; this.sensors = [];
    this.fx = { sound: () => {}, event: () => {} };
    this.t = 0;
    this.build();
    world.onContact = (c, vn, p) => this.contact(c, vn, p);
  }

  /* ----- builders, in hole-local coordinates ----- */
  frameGroup(F) { const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(F.m); this.root.add(g); return g; }
  block(H, x0, x1, z0, z1, y0, y1 = y0, o = {}) {
    const F = H.frame, thick = o.thick ?? 3, dx = x1 - x0, rise = y1 - y0;
    const ang = Math.atan2(rise, dx), L = Math.hypot(dx, rise), wz = z1 - z0;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const cl = new THREE.Vector3((x0 + x1) / 2 - nx * thick / 2, (y0 + y1) / 2 - ny * thick / 2, (z0 + z1) / 2);
    const lq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    const col = this.world.add(new Collider('box', { pos: F.w(cl.x, cl.y, cl.z), quat: F.q.clone().multiply(lq), half: new THREE.Vector3(L / 2, thick / 2, wz / 2), surf: o.surf || 'fairway', hole: H.i, belt: o.belt }));
    const mat = o.mat || (o.surf === 'wood' ? woodMat : o.surf === 'belt' ? this.beltMat() : terrainMat);
    const geo = new RoundedBoxGeometry(L, thick, wz, 2, Math.min(o.radius ?? 0.28, thick / 2 - 0.01, wz / 2 - 0.01));
    if (mat.map && mat !== terrainMat) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 4, uv.getY(i) * wz / 4); }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(cl); mesh.quaternion.copy(lq); mesh.receiveShadow = true;
    H.group.add(mesh);
    if (o.outline !== false) addOutline(mesh, 0.06);
    if (!o.noRock) this.underRocks(H.group, x0, x1, z0, z1, Math.min(y0, y1) - thick + 0.3, o.rockDepth);
    return col;
  }
  underRocks(group, x0, x1, z0, z1, y, depth) {
    const len = x1 - x0, n = Math.max(1, Math.round(len / 11));
    for (let k = 0; k < n; k++) {
      const r = make('under_rock');
      const seg = len / n;
      r.position.set(x0 + seg * (k + 0.5), y, (z0 + z1) / 2);
      const d = depth ?? (4 + Math.random() * 5) * Math.min(1.4, (z1 - z0) / 10 + 0.4);
      r.scale.set(seg * 1.08, d, (z1 - z0) * 1.02);
      r.rotation.y = Math.random() < 0.5 ? 0 : Math.PI;
      r.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      group.add(r);
    }
  }
  // A low wall from (x0,z0) to (x1,z1); o.y1 makes it climb a ramp (base height y at the start, y1 at the end).
  // Rough terraces either side of a fairway on the lower holes, so balls falling off the hole
  // four above land here instead of in the sea.
  shoulders(H, x0, x1, w, y0, y1 = y0, out = 11, sides = [-1, 1]) {
    for (const s of sides) {
      const za = s * w, zb = s * out;
      this.block(H, x0, x1, Math.min(za, zb), Math.max(za, zb), y0 - 0.35, y1 - 0.35, { surf: 'rough', mat: roughMat, thick: 2.6, rockDepth: 4 + Math.random() * 3 });
    }
  }
  wall(H, x0, z0, x1, z1, y, o = {}) {
    const F = H.frame, h = o.h ?? 0.6, t = o.t ?? 0.4, y1 = o.y1 ?? y;
    const run = Math.hypot(x1 - x0, z1 - z0), rise = y1 - y, len = Math.hypot(run, rise);
    const yaw = Math.atan2(z1 - z0, x1 - x0), pitch = Math.atan2(rise, run);
    const lq = new THREE.Quaternion().setFromAxisAngle(UP, -yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
    const cl = new THREE.Vector3((x0 + x1) / 2, (y + y1) / 2, (z0 + z1) / 2).add(new THREE.Vector3(0, h / 2, 0).applyQuaternion(lq));
    const surf = o.surf || (o.wood ? 'wood' : 'stone');
    this.world.add(new Collider('box', { pos: F.w(cl.x, cl.y, cl.z), quat: F.q.clone().multiply(lq), half: new THREE.Vector3(len / 2 + t / 2, h / 2, t / 2), surf, hole: H.i }));
    const mat = o.mat || (o.wood ? woodMat : stoneMat);
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(len + t, h, t, 2, Math.min(0.12, t / 2 - 0.01)), mat);
    mesh.position.copy(cl); mesh.quaternion.copy(lq); mesh.castShadow = true; mesh.receiveShadow = true;
    H.group.add(mesh); addOutline(mesh, 0.03);
    return mesh;
  }
  groundY(H, x, z, from = 40) {
    const p = H.frame.w(x, from, z);
    const g = this.world.groundAt(p.x, p.y, p.z, 80);
    return g ? g.y - H.frame.o.y : null;
  }
  prop(H, name, x, z, o = {}) {
    const y = o.y ?? this.groundY(H, x, z);
    if (y === null) return null;
    const p = make(name, { outline: o.outline ?? 0.035 });
    // Small or spindly props don't shove the camera around.
    if (/flowers|tee_marker|lamp|windsock|bush|rock_b/.test(name)) p.traverse(m => { m.raycast = () => {}; });
    p.position.set(x, y, z);
    p.rotation.y = o.rot ?? Math.random() * Math.PI * 2;
    const s = o.scale ?? (0.85 + Math.random() * 0.3); p.scale.setScalar(s);
    H.group.add(p);
    if (o.trunk) {
      const w = H.frame.w(x, y + 1.5, z);
      this.world.add(new Collider('cyl', { pos: w, r: o.trunk * s, hh: 1.5, surf: 'wood', hole: H.i, tag: 'tree' }));
    }
    return p;
  }
  // Ground decals for greens, bunkers, ponds and tees, plus the zones the physics reads.
  zone(H, type, x, z, r, o = {}) {
    const y = o.y ?? this.groundY(H, x, z, 30) ?? 0;
    const shape = new THREE.Shape();
    const seg = 40, wob = o.wobble ?? 0.12, rx = r, rz = o.rz ?? r, seed = Math.random() * 10;
    const radAt = a => 1 + Math.sin(a * 3 + seed) * wob * 0.6 + Math.sin(a * 5 + seed * 2) * wob * 0.4;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, k = radAt(a);
      const px = Math.cos(a) * rx * k, pz = Math.sin(a) * rz * k;
      i ? shape.lineTo(px, -pz) : shape.moveTo(px, -pz);
    }
    const geo = new THREE.ShapeGeometry(shape, 2); geo.rotateX(-Math.PI / 2);
    const mat = type === 'green' ? greenMat : type === 'sand' ? sandMat : type === 'water' ? waterMat : teeMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + (type === 'water' ? 0.012 : type === 'sand' ? 0.018 : 0.01), z);
    if (o.rot) mesh.rotation.y = o.rot;
    mesh.receiveShadow = true; H.group.add(mesh);
    if (type === 'sand') {
      // A soft darker rim around bunkers reads as a lip.
      const rim = new THREE.Mesh(geo, toon(0xc8a46a, { params: { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } }));
      rim.scale.set(1.08, 1, 1.08); rim.position.copy(mesh.position); rim.position.y -= 0.004; H.group.add(rim);
    }
    const wy = H.frame.o.y + y;
    this.zones.push({ type, frame: H.frame, x, z, rx: rx * 0.97, rz: rz * 0.97, y: wy, rot: o.rot || 0, radAt, hole: H.i });
    return mesh;
  }
  zoneAt(p) {
    let hit = null;
    for (const zn of this.zones) {
      if (Math.abs(p.y - BALL_R - zn.y) > 0.35) continue;
      const l = zn.frame.local(p, _a);
      let dx = l.x - zn.x, dz = l.z - zn.z;
      if (zn.rot) { const c = Math.cos(zn.rot), s = Math.sin(zn.rot); [dx, dz] = [dx * c - dz * s, dx * s + dz * c]; }
      const a = Math.atan2(dz / zn.rz, dx / zn.rx);
      const d = Math.hypot(dx / zn.rx, dz / zn.rz);
      if (d < zn.radAt(a)) { if (!hit || zn.type === 'water' || zn.type === 'sand') hit = zn; }
    }
    return hit;
  }
  beltMat() {
    if (!this._belt) { this._beltTex = beltTex.clone(); this._beltTex.needsUpdate = true; this._belt = toon(0xffffff, { unique: true, params: { map: this._beltTex } }); }
    return this._belt;
  }

  /* ----- moving things ----- */
  mover(H, { size, motion, mat, surf = 'fairway', tag, visual, under = true }) {
    const col = this.world.add(new Collider('box', { half: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2), surf, hole: H.i, tag, motion }));
    col.step(0, 1 / 60);
    let mesh = visual;
    if (!mesh) {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(0.25, size[1] / 2 - 0.01)), mat || terrainMat);
      body.receiveShadow = true; body.castShadow = true; addOutline(body, 0.05); mesh.add(body);
      if (under) {
        const r = make('under_rock'); r.position.y = -size[1] / 2 + 0.2; r.scale.set(size[0], 3 + size[0] * 0.3, size[2]); mesh.add(r);
      }
      const edge = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.04, 0.18, size[2] + 0.04), toon(0xffffff, { params: { map: hazardTex } }));
      edge.position.y = size[1] / 2 - 0.35; mesh.add(edge);
    }
    this.scene.add(mesh); this.camBlockers.push(mesh);
    this.animators.push(() => { mesh.position.copy(col.pos); mesh.quaternion.copy(col.quat); });
    return { col, mesh };
  }

  /* ----- contact effects ----- */
  contact(c, vn, p) {
    if (c.tag && this.hits.has(c.tag)) this.hits.get(c.tag)(c, vn, p);
    else if (vn > 2) this.fx.sound(c.surf === 'wood' ? 'wood' : c.surf === 'sand' ? 'sand' : 'thud', Math.min(1, vn / 14), p);
  }

  /* ----- the holes ----- */
  build() {
    this.hits = new Map();
    const H = [];
    for (let i = 1; i <= NHOLES; i++) H.push({ i, frame: frames[i], group: this.frameGroup(frames[i]) });
    this.H = H;
    this.buildPads();
    const builders = [this.hole1, this.hole2, this.hole3, this.hole4, this.hole5, this.hole6, this.hole7, this.hole8, this.hole9];
    builders.forEach((b, k) => b.call(this, H[k]));
    // Where the auto-aim points from each part of a hole (hole-local x, z): along the line you would
    // actually play, not straight at a flag round the corner.
    const aims = { 1: [[60, 0]], 2: [[34, 0], [50, 0], [64, 0]], 3: [[63, 0]], 4: [[40, 0], [62, 0]], 5: [[40, 0], [53, 0], [66, 0]],
      6: [[29, 0], [41, 0], [52, 0], [66, 0]], 7: [[32, 4.2], [67, 0]], 8: [[30, 0], [41, 0], [53.5, 0], [66, 0]], 9: [[37, 0], [60, 0]] };
    for (const [i, pts] of Object.entries(aims)) this.holes[i].aims = pts;
    this.cartPaths();
    this.decorate();
  }
  holeInfo(H, name, par, blurb) { Object.assign(H, { name, par, blurb }); this.holes[H.i] = H; }

  // Pad k is the green of hole k and the tee of hole k+1. Built in hole (k+1)'s frame where the pad is
  // centred on the origin, the next hole leaves along +x and the previous one arrives from +z.
  buildPads() {
    for (let k = 0; k <= NHOLES; k++) {
      const summit = k === NHOLES;
      const Hn = summit ? this.H[NHOLES - 1] : this.H[k];
      const ox = summit ? SIDE : 0, oy = summit ? RISE : 0;
      const P = { i: summit ? NHOLES : k + 1, frame: Hn.frame, group: Hn.group };
      this.block(P, ox - PAD, ox + PAD, -PAD, PAD, oy, oy, { thick: 4, rockDepth: 9 + Math.random() * 4 });
      if (k === 0) this.cartSpots.push({ p: Hn.frame.w(-5.2, 0, -5.6), yaw: Hn.frame.yaw });
      if (!summit) {
        // Tee box for hole k+1.
        const tee = { x: 5.5, z: -3.2 };
        this.zone(P, 'tee', tee.x, tee.z, 1.6, { y: 0, rz: 2.2, wobble: 0.02 });
        for (const s of [-1, 1]) { const m = this.prop(P, 'tee_marker', tee.x + 1.1, tee.z + s * 1.9, { y: 0, scale: 0.8, outline: 0.02 }); if (m) m.traverse(o => { if (o.isMesh && o.material.name === 'marker') o.material = toon(['#ff5d73', '#3fa7ff', '#ffd23f', '#a76bff'][k % 4]); }); }
        const Hnext = this.H[k];
        Hnext.tee = Hn.frame.w(tee.x, 0 + BALL_R, tee.z);
      }
      if (k > 0) {
        const Hprev = this.H[k - 1];
        // Green: the previous hole's ball rolls in from +z.
        const gx = summit ? 0 : -1.8, gz = summit ? 0 : 2.2;
        if (!summit) {
          this.zone(P, 'green', gx, gz, 5.2, { y: 0, wobble: 0.1 });
          const pins = [[-1, 1.2], [0.8, 2.5], [-2.2, 0.5], [0, 3], [-1.5, -0.5], [1.4, 1], [-2.6, 2.2], [0.4, -0.6]];
          const [px, pz] = pins[(k - 1) % pins.length];
          Hprev.cupLocal = { frame: Hn.frame, x: gx + px, z: gz + pz, y: 0 };
          this.makeCup(Hprev, Hn.frame.w(gx + px, 0, gz + pz));
          // Bunkers guarding the outer side of the green, and low walls on the outside edges of early pads.
          this.zone(P, 'sand', -6.2, -2.6, 1.7, { y: 0, rz: 1.2 });
          if (k <= 4) {
            this.wall(P, -PAD + 0.3, -PAD + 0.3, PAD - 0.3, -PAD + 0.3, 0, { h: 0.5 });
            this.wall(P, -PAD + 0.3, -PAD + 0.3, -PAD + 0.3, PAD - 0.3, 0, { h: 0.5 });
          }
        }
      }
      // Pad dressing.
      const dress = summit ? [] : [['bush', -7.6, -7.6], ['flowers', -7.8, 7.6], ['flowers', 7.6, -7.8], ['rock_b', -7.8, 6.2]];
      for (const [n, x, z] of dress) this.prop(P, n, ox + x, z, { y: oy, scale: 0.8 + Math.random() * 0.4 });
    }
    // The first tee gets a welcome sign, a cart and a lamp.
    const P0 = { i: 1, frame: this.H[0].frame, group: this.H[0].group };
    this.sign(P0, 2.5, -7.2, 0, ['WELCOME TO', 'MOUNT BOGEY', 'no refunds · no mulligans'], Math.PI * 0.08);
    this.prop(P0, 'lamp', 8, -8, { y: 0, scale: 1 });
  }
  makeCup(H, p) {
    const cup = new THREE.Group(); cup.position.copy(p);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b1420, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    hole.position.y = 0.012; cup.add(hole);
    const rim = make('cup_rim'); rim.position.y = 0.01; rim.scale.setScalar(CUP_R / 0.25); cup.add(rim);
    const pole = make('flagpole', { outline: 0.012 }); cup.add(pole);
    const cloth = make('flag_cloth', { outline: 0.01 });
    const at = pm('flagpole').flag_attach || [0.03, 2.12, 0];
    cloth.position.set(at[0], at[1], at[2]); cup.add(cloth);
    cloth.traverse(o => { if (o.isMesh && !o.userData.isOutline) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; const c = ['#ff3d6e', '#ffb627', '#36c5f0', '#9b5de5', '#2ec4b6', '#ff6b35', '#f15bb5', '#00bb72', '#ffd700'][H.i - 1]; o.material.color.set(c); } });
    this.wave(cloth);
    this.scene.add(cup);
    H.cupGroup = cup;
    H.cup = p.clone();
    H.pin = this.world.add(new Collider('cyl', { pos: p.clone().add(new THREE.Vector3(0, 1.1, 0)), r: 0.035, hh: 1.1, surf: 'pin', tag: 'pin', hole: H.i }));
    this.hits.set('pin', (c, vn, q) => { if (vn > 0.8) this.fx.event('pin', { p: q, v: vn }); });
  }
  // Flutter a cloth mesh in the vertex shader (stronger toward the free end, along +x).
  wave(obj, amp = 1) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      const apply = mm => {
        mm.onBeforeCompile = sh => {
          sh.uniforms.uTime = this.timeU;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float k = clamp(transformed.x * 1.4, 0.0, 1.0);
              transformed.z += sin(transformed.x * 7.0 - uTime * 7.0 + transformed.y * 2.0) * 0.07 * k * ${amp.toFixed(2)};
              transformed.y += sin(transformed.x * 5.0 - uTime * 5.0) * 0.02 * k;`);
        };
        mm.customProgramCacheKey = () => 'wave' + amp;
      };
      if (o.userData.isOutline) { o.visible = false; return; }
      apply(m);
    });
  }
  sign(H, x, z, y, lines, rot = 0) {
    const post = make('sign_post', { outline: 0.03 });
    post.position.set(x, y, z); post.rotation.y = rot; H.group.add(post);
    const info = pm('sign_board');
    const board = make('sign_board', { outline: 0.03 });
    const c = info.place_at || [0, 1.5, 0.01];
    board.position.set(c[0], c[1], c[2]); post.add(board);
    const tex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#fff6df'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a4b2a'; g.lineWidth = 14; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#4a2c18'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const sizes = lines.length === 3 ? [40, 66, 28] : [56, 40];
      let yy = lines.length === 3 ? 62 : 90;
      lines.forEach((t, i) => { g.font = `900 ${sizes[i] || 34}px "Trebuchet MS", system-ui`; g.fillText(t, w / 2, yy); yy += (sizes[i] || 34) + 18; });
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const face = new THREE.MeshToonMaterial({ map: tex, gradientMap });
    let found = false;
    board.traverse(o => { if (o.isMesh && !o.userData.isOutline && /face/i.test(o.material.name || '')) { o.material = face; found = true; } });
    post.traverse(m => { m.raycast = () => {}; });
    if (!found) board.traverse(o => { if (o.isMesh && !o.userData.isOutline) o.material = face; });
    return post;
  }
  windsock(H, x, z, w) {
    const pole = this.prop(H, 'windsock', x, z, { rot: 0, scale: 1 });
    if (!pole) return;
    const sock = make('windsock_sock', { outline: 0.015 });
    sock.traverse(o => { if (o.isMesh && !o.userData.isOutline) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; } });
    const at = pm('windsock').attach || [0, 2.85, 0];
    sock.position.set(at[0], at[1], at[2]); pole.add(sock);
    this.wave(sock, 0.6);
    let fs = w.local(), yaw = fs >= 0 ? -Math.PI / 2 : Math.PI / 2;
    this.animators.push((t, dt) => {
      // The wind here is sideways across the hole (hole-local z). The sock swings round to point
      // downwind, hangs limp in a lull and stands straight out in a strong gust.
      fs += (w.local() - fs) * Math.min(1, (dt || 0.016) * 3);
      const want = fs >= 0 ? -Math.PI / 2 : Math.PI / 2;
      yaw += (want - yaw) * Math.min(1, (dt || 0.016) * 2.5);
      sock.rotation.y = yaw;
      sock.rotation.z = -1.35 + Math.min(1, Math.abs(fs) / 3.5) * 1.3 + Math.sin(t * 9) * 0.03 * Math.min(1, Math.abs(fs) / 2);
    });
  }

  hole1(H) {
    this.holeInfo(H, 'Warm-Up Wobble', 4, 'Hit it up the hill. Gently. Or not.');
    this.block(H, 9, 30, -7, 7, 0);
    this.block(H, 30, 52, -7, 7, 0, 7, { noRock: true });
    this.underRocks(H.group, 30, 52, -7, 7, -2.5);
    this.block(H, 52, 71, -7, 7, 7);
    // The sea-side terrace is extra wide: it catches balls dropping out of the Pinball Palace gutter 28 m above.
    for (const [x0, x1, y0, y1] of [[9, 30, 0, 0], [30, 52, 0, 7], [52, 71, 7, 7]]) { this.shoulders(H, x0, x1, 7, y0, y1, 11, [1]); this.shoulders(H, x0, x1, 7, y0, y1, 15, [-1]); }
    this.wall(H, 9, -6.8, 30, -6.8, 0, { wood: true, h: 0.45 });
    this.wall(H, 52, -6.8, 71, -6.8, 7, { wood: true, h: 0.45 });
    this.zone(H, 'sand', 62, -3.5, 2.6, { rz: 1.6 });
    this.zone(H, 'sand', 20, 4.6, 1.8);
    this.prop(H, 'tree_round', 14, 5.6, { trunk: 0.35 });
    this.prop(H, 'tree_pine', 26, -5.6, { trunk: 0.35 });
    this.prop(H, 'tree_round', 57, 5.8, { trunk: 0.35 });
    this.prop(H, 'bush', 45, 6, {}); this.prop(H, 'bush', 38, -6.2, {}); this.prop(H, 'flowers', 11, -5, {});
    this.prop(H, 'rock_a', 68, 6, { scale: 0.7 });
    this.sign(H, 31, 6.4, 0.2, ['THIS IS THE', 'EASY ONE'], -Math.PI / 2 + 0.3);
  }
  hole2(H) {
    this.holeInfo(H, 'Windmill Steps', 5, 'Chip up the steps, then roll through the windmill.');
    this.block(H, 9, 26, -7, 7, 0);
    this.block(H, 26, 42, -6, 6, 3.5);
    this.block(H, 42, 71, -6, 6, 7);
    this.shoulders(H, 9, 26, 7, 0); this.shoulders(H, 26, 42, 6, 3.5); this.shoulders(H, 42, 71, 6, 7);
    this.zone(H, 'sand', 20, -4, 1.6);
    this.zone(H, 'water', 34, 3, 1.8, { rz: 1.3 });
    // The windmill: a tunnel through the base, sails sweeping anything lofted over it.
    const wx = 57;
    const base = make('windmill_base', { outline: 0.05 });
    base.position.set(wx, 7, 0); base.rotation.y = -Math.PI / 2; H.group.add(base);
    for (const s of [-1, 1]) {
      this.world.add(new Collider('box', { pos: H.frame.w(wx, 11, s * 1.45), quat: H.frame.q, half: new THREE.Vector3(1.9, 4, 0.62), surf: 'wood', hole: 2 }));
      this.wall(H, wx, s * 2.1, wx, s * 5.9, 7, { h: 1, wood: true });
    }
    this.world.add(new Collider('box', { pos: H.frame.w(wx, 11.6, 0), quat: H.frame.q, half: new THREE.Vector3(1.9, 3.4, 0.9), surf: 'wood', hole: 2 }));
    const hub = pm('windmill_base').hub || [0, 6.5, 2.2];
    const hubL = new THREE.Vector3(wx - hub[2], 7 + hub[1], hub[0]);
    const sails = make('windmill_blades', { outline: 0.04 });
    const sailPivot = new THREE.Group(); sailPivot.position.copy(hubL); sailPivot.rotation.y = -Math.PI / 2; sailPivot.add(sails); H.group.add(sailPivot);
    const hubW = H.frame.w(hubL.x, hubL.y, hubL.z);
    const axis = H.frame.f.clone();
    const SP = 0.9;
    for (let b = 0; b < 4; b++) {
      this.world.add(new Collider('box', {
        half: new THREE.Vector3(0.6, 2.4, 0.6), surf: 'wood', hole: 2, tag: 'sail',
        motion: (t, c) => {
          const a = -t * SP + b * Math.PI / 2;
          // Blade direction in the plane perpendicular to the hole: rotate "up" around the hole axis.
          const dir = _b.set(0, 1, 0).applyAxisAngle(axis, a);
          c.pos.copy(hubW).addScaledVector(dir, 3.0).addScaledVector(axis, -0.3);
          c.quat.setFromUnitVectors(UP, dir);
        },
      }));
    }
    this.hits.set('sail', (c, vn, p) => { this.fx.sound('wood', 1, p); this.fx.event('sail', { p }); });
    this.animators.push(t => { sails.rotation.z = t * SP; });
    this.prop(H, 'tree_pine', 12, 5.8, { trunk: 0.35 }); this.prop(H, 'tree_pine', 23, 6, { trunk: 0.35 });
    this.prop(H, 'bush', 30, -5.2, {}); this.prop(H, 'flowers', 39, 5, {}); this.prop(H, 'flowers', 47, -5, {});
    this.prop(H, 'tree_round', 66, 4.6, { trunk: 0.35 }); this.prop(H, 'rock_c', 64, -4.8, { scale: 0.7 });
    this.sign(H, 24.6, -6.2, 0, ['STEP UP.', 'USE A WEDGE'], 0.4);
  }
  hole3(H) {
    this.holeInfo(H, 'Mushroom Gorge', 4, 'Fly the gorge, or trust the mushrooms.');
    this.block(H, 9, 30, -7, 7, 0);
    this.block(H, 56, 71, -7, 7, 7, 7, { rockDepth: 12 });
    this.shoulders(H, 9, 30, 7, 0); this.shoulders(H, 56, 71, 7, 7);
    const shrooms = [[37, -2.5, -1.5], [47, 2.2, 2.2], [42, 5, 0.5]];
    for (const [x, z, top] of shrooms) {
      const m = make('mushroom', { outline: 0.04 });
      const capTop = pm('mushroom').cap_top ?? 1.2;
      m.position.set(x, top - capTop, z); H.group.add(m);
      const isl = make('under_rock'); isl.position.set(x, top - capTop + 0.1, z); isl.scale.set(2.6, 5, 2.6); H.group.add(isl);
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.3, 20), terrainMat); disk.position.set(x, top - capTop + 0.05, z); H.group.add(disk);
      const col = this.world.add(new Collider('cyl', { pos: H.frame.w(x, top - 0.25, z), r: 1.45, hh: 0.25, surf: 'mushroom', tag: 'shroom', hole: 3 }));
      col.mesh = m;
      this.animators.push((t, dt) => {
        m.userData.sq = Math.max(0, (m.userData.sq || 0) - dt * 3);
        const s = m.userData.sq;
        m.scale.set(1 + s * 0.25, 1 - s * 0.3 + Math.sin(s * 20) * s * 0.1, 1 + s * 0.25);
      });
    }
    this.hits.set('shroom', (c, vn, p) => { c.mesh.userData.sq = 1; this.fx.sound('boing', 1, p); this.fx.event('shroom', { p }); });
    this.zone(H, 'sand', 63, -4, 1.8);
    this.prop(H, 'tree_round', 12, -5.5, { trunk: 0.35 }); this.prop(H, 'tree_round', 22, 5.8, { trunk: 0.35 });
    this.prop(H, 'flowers', 27, -5.6, {}); this.prop(H, 'bush', 68, 5.6, {});
    this.sign(H, 28.5, -6.3, 0, ['MIND THE', 'GAP'], 0.5);
  }
  hole4(H) {
    this.holeInfo(H, 'Goose Lane', 5, 'The treadmill runs backwards. The geese bite.');
    this.block(H, 9, 30, -4, 4, 0);
    const ang = Math.atan2(7, 20);
    const beltV = new THREE.Vector3(-Math.cos(ang), -Math.sin(ang), 0).multiplyScalar(3.2);
    const bw = beltV.clone().transformDirection(H.frame.m).multiplyScalar(3.2);
    this.block(H, 30, 50, -3, 3, 0, 7, { surf: 'belt', belt: bw, noRock: true, thick: 1.2 });
    this.underRocks(H.group, 30, 50, -3, 3, -1.5, 5);
    this.block(H, 50, 71, -4, 4, 7);
    this.shoulders(H, 9, 30, 4, 0); this.shoulders(H, 30, 50, 3.45, 0, 7); this.shoulders(H, 50, 71, 4, 7);
    for (const s of [-1, 1]) this.wall(H, 30, s * 3.25, 50, s * 3.25, 0, { y1: 7, h: 0.5, mat: toon(0x8a93a6) });
    this.animators.push((t) => { if (this._beltTex) this._beltTex.offset.x = (t * 3.2 / 4) % 1; });
    this.wall(H, 9, -3.8, 22, -3.8, 0, { wood: true, h: 0.45 });
    this.wall(H, 55, 3.8, 71, 3.8, 7, { wood: true, h: 0.45 });
    const geese = [[19, 0, 5, 2.5, 0.5], [60, 0, 7, 2.6, 0.7], [64, 7, 4, 2.2, 1.1]];
    for (const [cx, base, rx, rz, sp] of geese) {
      const y0 = base === 0 ? 0 : 7, gz = make('goose', { outline: 0.02 });
      H.group.add(gz);
      const ph = Math.random() * 10;
      const pos = t => new THREE.Vector3(cx + Math.sin(t * sp + ph) * rx, y0, Math.sin(t * sp * 1.7 + ph) * rz * 0.9);
      const col = this.world.add(new Collider('cyl', {
        r: 0.32, hh: 0.4, surf: 'goose', tag: 'goose', hole: 4,
        motion: (t, c) => { const l = pos(t); c.pos.copy(H.frame.w(l.x, l.y + 0.4, l.z)); },
      }));
      col.goose = gz;
      this.animators.push(t => {
        const a = pos(t), b = pos(t + 0.05);
        gz.position.copy(a); gz.position.y += Math.abs(Math.sin(t * 9 + ph)) * 0.05;
        gz.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        gz.rotation.z = Math.sin(t * 9 + ph) * 0.12;
        const hk = gz.userData.honk || 0; if (hk > 0) { gz.userData.honk = hk - 0.016; gz.scale.setScalar(1 + Math.sin(hk * 30) * 0.08); }
      });
    }
    this.hits.set('goose', (c, vn, p) => { c.goose.userData.honk = 0.5; this.fx.sound('honk', 1, p); this.fx.event('goose', { p }); });
    this.prop(H, 'tree_pine', 12, 3.2, { trunk: 0.35, scale: 0.8 });
    this.prop(H, 'flowers', 26, -3.3, {}); this.prop(H, 'flowers', 53, -3.3, {});
    this.sign(H, 28, 3.6, 0, ['CAUTION:', 'GEESE'], -0.4);
  }
  hole5(H) {
    this.holeInfo(H, 'Pinball Palace', 5, 'Bumpers, a sweeper, and a gutter of doom.');
    this.block(H, 9, 46, -10, 10, 0, 0, { rockDepth: 10 });
    this.block(H, 46, 60, -2.5, 2.5, 0, 7, { noRock: true, surf: 'metal', mat: toon(0x9db4cf) });
    this.underRocks(H.group, 46, 60, -2.5, 2.5, -2, 4);
    this.block(H, 60, 71, -7, 7, 7);
    this.shoulders(H, 9, 46, 10, 0, 0, 12.5, [1]); this.shoulders(H, 60, 71, 7, 7);
    const neon = toon(0x7c4dff, { emissive: 0x7c4dff, emissiveIntensity: 0.35 });
    this.wall(H, 12, 9.8, 46, 9.8, 0, { h: 0.7, mat: neon, surf: 'rubber' });
    this.wall(H, 12, -9.8, 27, -9.8, 0, { h: 0.7, mat: neon, surf: 'rubber' });
    this.wall(H, 35, -9.8, 46, -9.8, 0, { h: 0.7, mat: neon, surf: 'rubber' });
    this.wall(H, 45.8, 2.7, 45.8, 9.8, 0, { h: 0.7, mat: neon });
    this.wall(H, 45.8, -2.7, 45.8, -9.8, 0, { h: 0.7, mat: neon });
    for (const s of [-1, 1]) this.wall(H, 46, s * 2.6, 60, s * 2.6, 0, { y1: 7, h: 0.4, mat: toon(0x5d6d85) });
    this.sign(H, 31, -9.2, 0, ['GUTTER', 'OF DOOM ↓'], 0.15);
    const bumpers = [[19, 4.5], [23, -5], [31, 6.5], [36, -2], [41, 5], [40, -7], [26, 1.5]];
    for (const [x, z] of bumpers) {
      const b = make('bumper', { outline: 0.03 }); b.position.set(x, 0, z); H.group.add(b);
      const col = this.world.add(new Collider('cyl', { pos: H.frame.w(x, 0.35, z), r: 0.8, hh: 0.35, surf: 'rubber', tag: 'bumper', hole: 5 }));
      col.mesh = b;
      this.animators.push((t, dt) => {
        const f = b.userData.flash = Math.max(0, (b.userData.flash || 0) - dt * 4);
        b.scale.set(1 + f * 0.15, 1 - f * 0.1, 1 + f * 0.15);
        b.traverse(o => { if (o.isMesh && o.material.emissive && /bumper_top/i.test(o.material.name)) o.material.emissiveIntensity = 0.6 + f * 2.5; });
      });
    }
    this.hits.set('bumper', (c, vn, p) => { c.mesh.userData.flash = 1; this.fx.sound('bumper', 1, p); this.fx.event('bumper', { p }); });
    // The sweeper: a striped bar spinning round a post in the middle of the floor.
    const sw = new THREE.Group();
    const bar = new THREE.Mesh(new RoundedBoxGeometry(11, 0.55, 0.5, 2, 0.15), toon(0xffffff, { params: { map: stripeTex } }));
    stripeTex.repeat.set(6, 1);
    bar.castShadow = true; addOutline(bar, 0.03); sw.add(bar);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.3, 16), toon(0xffcf33)); post.position.y = -0.1; post.castShadow = true; addOutline(post, 0.03); sw.add(post);
    const swP = new THREE.Vector3(30, 0.55, -1);
    const swC = this.world.add(new Collider('box', {
      half: new THREE.Vector3(5.5, 0.27, 0.25), surf: 'rubber', tag: 'sweeper', hole: 5,
      motion: (t, c) => { c.pos.copy(H.frame.w(swP.x, swP.y, swP.z)); c.quat.copy(H.frame.q).multiply(_q.setFromAxisAngle(UP, t * 1.1)); },
    }));
    this.world.add(new Collider('cyl', { pos: H.frame.w(swP.x, 0.55, swP.z), r: 0.4, hh: 0.6, surf: 'stone', hole: 5 }));
    sw.position.copy(swP); H.group.add(sw);
    this.animators.push(t => { sw.rotation.y = t * 1.1; });
    this.hits.set('sweeper', (c, vn, p) => { this.fx.sound('bumper', 0.8, p); this.fx.event('sweeper', { p }); });
    this.prop(H, 'tree_palm', 64, 5.5, { trunk: 0.3 }); this.prop(H, 'tree_palm', 66, -5.5, { trunk: 0.3 });
  }
  hole6(H) {
    this.holeInfo(H, 'Walk the Plank', 5, 'Two planks, a gusty wind, and railings with gaps in.');
    const W1 = 2.6, W2 = 2.2;   // plank half-widths
    this.block(H, 9, 20, -6, 6, 0);
    this.block(H, 20, 37.2, -W1, W1, 0, 3, { surf: 'wood', thick: 0.4, noRock: true, outline: true, radius: 0.08 });
    this.block(H, 37, 45, -4, 4, 3, 3, { rockDepth: 6 });
    this.block(H, 44.8, 60, -W2, W2, 3, 7, { surf: 'wood', thick: 0.4, noRock: true, radius: 0.08 });
    this.block(H, 60, 71, -6, 6, 7);
    // Low kick-rails stop a rolling ball going over the side, but each plank has a gap. Mind the gap.
    const y1 = x => (x - 20) / 17.2 * 3, y2 = x => 3 + (x - 44.8) / 15.2 * 4;
    for (const s of [-1, 1]) {
      for (const [a, b] of s < 0 ? [[20.4, 27.5], [30, 36.8]] : [[20.4, 31], [33.5, 36.8]]) this.wall(H, a, s * (W1 - 0.08), b, s * (W1 - 0.08), y1(a), { y1: y1(b), h: 0.22, t: 0.16, wood: true });
      for (const [a, b] of s < 0 ? [[45.2, 51], [53.5, 59.6]] : [[45.2, 55], [57, 59.6]]) this.wall(H, a, s * (W2 - 0.08), b, s * (W2 - 0.08), y2(a), { y1: y2(b), h: 0.22, t: 0.16, wood: true });
    }
    // Wind holds steady through a swing and the ball's flight; it is re-rolled between shots.
    const gust = { v: 1.5, range: [0.3, 1.7], local() { return this.v; } };
    this.winds.push({ hole: 6, gust, frame: H.frame, x0: 19, x1: 61, z0: -6, z1: 6, y0: -1, y1: 12, f: () => gust.local() });
    this.windsock(H, 17, -5.2, gust); this.windsock(H, 41, 3.2, gust); this.windsock(H, 63, 5.2, gust);
    // Rope posts along the planks.
    for (let x = 22; x < 60; x += 4) {
      if (x > 36 && x < 46) continue;
      const y = x < 38 ? y1(x) : y2(x);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6), toon(0x8b5a2b)); p.position.set(x, y + 0.3, s * ((x < 38 ? W1 : W2) - 0.05)); p.raycast = () => {}; H.group.add(p);
      }
    }
    this.prop(H, 'tree_pine', 11, 4.5, { trunk: 0.35 }); this.prop(H, 'rock_a', 13, -4.8, { scale: 0.6 });
    this.prop(H, 'flowers', 40, -2.2, {}); this.prop(H, 'tree_round', 68, -4.5, { trunk: 0.35 });
    this.sign(H, 18.5, 3.5, 0, ['MIND THE', 'GAPS.'], -0.3);
  }
  hole7(H) {
    this.holeInfo(H, 'Fire in the Hole', 4, 'Roll into the ring, then fire when the cannon swings through the red.');
    this.block(H, 9, 40, -7, 7, 0);
    this.block(H, 63, 71, -7, 7, 7, 7, { rockDepth: 10 });
    const cx = 35, cz = 4.2;
    const base = make('cannon_base', { outline: 0.03 }); base.position.set(cx, 0, cz); base.rotation.y = Math.PI / 2; H.group.add(base);
    const piv = pm('cannon_base').barrel_pivot || [0, 1, 0];
    const barrel = make('cannon_barrel', { outline: 0.03 });
    const bp = new THREE.Group(); bp.position.set(cx + piv[2], piv[1], cz - piv[0]); bp.rotation.y = Math.PI / 2; bp.add(barrel); H.group.add(bp);
    barrel.rotation.x = -0.6;
    this.cannonParts = { base, bp, barrel };
    this.world.add(new Collider('cyl', { pos: H.frame.w(cx, 0.6, cz), r: 0.9, hh: 0.6, surf: 'metal', hole: 7 }));
    // The catch ring in front of the cannon.
    const rx = cx - 3, rz = cz;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ring.position.set(rx, 0.02, rz); H.group.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 3).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a36 }));
    arrow.position.set(rx, 0.6, rz); H.group.add(arrow);
    this.animators.push(t => { ring.material.opacity = 0.55 + Math.sin(t * 6) * 0.3; arrow.position.y = 0.7 + Math.sin(t * 4) * 0.15; arrow.rotation.y = t * 2; });
    this.sensors.push({ kind: 'cannon', hole: 7, p: H.frame.w(rx, 0, rz), r: 1.6, barrel, pivot: bp, frame: H.frame, mouth: () => { barrel.updateWorldMatrix(true, false); const m = pm('cannon_barrel').muzzle || [0, 0, 1.4]; return new THREE.Vector3(m[0], m[1], m[2] + 0.3).applyMatrix4(barrel.matrixWorld); } });
    this.sign(H, 30.5, 6.6, 0, ['CANNON →', 'roll in, then time it'], -0.5);
    this.prop(H, 'tree_round', 13, 5.6, { trunk: 0.35 }); this.prop(H, 'tree_round', 19, 6.2, { trunk: 0.35 });
    this.prop(H, 'rock_b', 38.6, 6.2, { scale: 0.8 }); this.prop(H, 'flowers', 66, 5.8, {});
  }
  hole8(H) {
    this.holeInfo(H, 'Moving Day', 5, 'Platforms that will not sit still. Neither will you.');
    this.block(H, 9, 22, -6, 6, 0);
    this.block(H, 60, 71, -6, 6, 7);
    const F = H.frame, flat = new THREE.Quaternion();
    this.mover(H, { size: [6, 1.2, 6], motion: (t, c) => { c.pos.copy(F.w(30, 1.5 - 0.6, 5 * Math.sin(t * 0.7))); c.quat.copy(F.q); } });
    this.mover(H, { size: [6, 1.2, 6], motion: (t, c) => { c.pos.copy(F.w(41 + 2.5 * Math.sin(t * 0.55), 3.5 - 0.6, -2.5 * Math.cos(t * 0.7))); c.quat.copy(F.q); } });
    this.mover(H, { size: [6, 1.2, 6], motion: (t, c) => { c.pos.copy(F.w(53.5, 5.25 + 2.05 * Math.sin(t * 0.5) - 0.6, 0)); c.quat.copy(F.q); } });
    this.sign(H, 20, -5, 0, ['PLATFORMS', 'MOVE. DEAL.'], 0.3);
    this.prop(H, 'tree_pine', 12, 5, { trunk: 0.35 }); this.prop(H, 'bush', 68, -5, {});
    this.zone(H, 'sand', 65, 4, 1.6);
  }
  hole9(H) {
    this.holeInfo(H, 'The Summit', 6, 'Pegs, gusts, and a green that will not stop spinning.');
    this.block(H, 9, 24, -7, 7, 0);
    this.block(H, 24, 50, -4, 4, 0, 7, { noRock: true });
    this.underRocks(H.group, 24, 50, -4, 4, -2.5, 6);
    this.block(H, 50, 71, -6, 6, 7);
    const ang = Math.atan2(7, 26);
    let row = 0;
    for (let x = 28; x < 48; x += 2.6, row++) {
      for (let z = -3 + (row % 2) * 1.2; z <= 3; z += 2.4) {
        const y = (x - 24) / 26 * 7;
        const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.7, 12), toon(row % 2 ? 0xff5d73 : 0x36c5f0));
        peg.position.set(x, y + 0.3, z); peg.castShadow = true; peg.raycast = () => {}; addOutline(peg, 0.02); H.group.add(peg);
        this.world.add(new Collider('cyl', { pos: H.frame.w(x, y + 0.3, z), r: 0.19, hh: 0.4, surf: 'rubber', tag: 'peg', hole: 9 }));
      }
    }
    this.hits.set('peg', (c, vn, p) => this.fx.sound('peg', Math.min(1, vn / 8), p));
    this.zone(H, 'sand', 58, 3.8, 1.6); this.zone(H, 'sand', 58, -3.8, 1.6); this.zone(H, 'water', 66, 0, 1.3, { rz: 2.2 });
    const gust = { v: -2, range: [0.8, 4], local() { return this.v; } };
    this.winds.push({ hole: 9, gust, frame: H.frame, x0: 50, x1: 90, z0: -10, z1: 10, y0: 6, y1: 20, f: () => gust.local() });
    this.windsock(H, 52, 5.4, gust);
    // The summit green: a turntable with the cup near its rim.
    const F = H.frame, cx = SIDE, cz = 0, R = 7.4, top = RISE + 0.035, SP = 0.32;
    const tt = new THREE.Group();
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.3, 64), greenMat); disk.position.y = -0.15; disk.receiveShadow = true; tt.add(disk);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 6, 64).rotateX(Math.PI / 2), toon(0xffd700, { emissive: 0xffaa00, emissiveIntensity: 0.4 })); tt.add(rim);
    for (let k = 0; k < 16; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(k % 2 ? 0xff5d73 : 0xffffff, { emissive: k % 2 ? 0xff5d73 : 0xffffff, emissiveIntensity: 0.6 })); const a = k / 16 * Math.PI * 2; b.position.set(Math.cos(a) * R, 0.05, Math.sin(a) * R); tt.add(b); }
    tt.position.set(cx, top, cz); H.group.add(tt);
    this.world.add(new Collider('cyl', {
      r: R, hh: 0.4, surf: 'green', hole: 9, tag: 'turntable',
      motion: (t, c) => { c.pos.copy(F.w(cx, top - 0.4, cz)); c.quat.copy(F.q).multiply(_q.setFromAxisAngle(UP, t * SP)); },
    }));
    // Cup rides the turntable.
    const cupL = new THREE.Vector3(3.2, 0, 1.2);
    this.makeCup(H, F.w(cx + cupL.x, top, cupL.z));
    H.cupMoving = t => { const a = t * SP; return F.w(cx + cupL.x * Math.cos(a) + cupL.z * Math.sin(a), top, -cupL.x * Math.sin(a) + cupL.z * Math.cos(a)); };
    this.animators.push(t => { tt.rotation.y = t * SP; const p = H.cupMoving(t); H.cup.copy(p); H.cupGroup.position.copy(p); H.cupGroup.rotation.y = t * SP; H.pin.pos.copy(p).y += 1.1; H.pin.update(); });
    this.zones.push({ type: 'green', frame: F, x: cx, z: cz, rx: R, rz: R, y: F.o.y + top, rot: 0, radAt: () => 1, hole: 9 });
    const tr = make('trophy', { outline: 0.04 }); tr.position.set(cx + 6.8, RISE, -7); tr.scale.setScalar(1.4); H.group.add(tr);
    this.trophy = tr;
    this.world.add(new Collider('cyl', { pos: F.w(cx + 6.8, RISE + 1, -7), r: 0.7, hh: 1, surf: 'metal', hole: 9 }));
    this.sign(H, 73, -7.6, RISE, ['THE SUMMIT', 'you absolute legend'], 0.4);
    this.prop(H, 'lamp', 88, 8, { y: RISE, scale: 1 }); this.prop(H, 'lamp', 72, 8, { y: RISE, scale: 1 });
  }

  // Background: the spire, distant islands. (Sky, sea, clouds and balloons live in sky.js.)
  // A narrow road through hole-local points [x, y, z]: flat round landings at the points, joined by tilted
  // slabs that start and end at the landings' rims, so there is no lip anywhere. o.kicker leaves the last
  // landing off and ends in the open on the slope, as a ramp to jump from. o.cones: [segment, 0..1, side].
  road(H, pts, w, o = {}) {
    const F = H.frame, thick = 0.5, r = w * 0.46, last = pts.length - 1;
    const roadMat = this._roadMat || (this._roadMat = toon(0xffffff, { params: { map: canvasTex(128, 128, (g, cw, ch) => {
      g.fillStyle = '#c9a26b'; g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,85,45,.3)' : 'rgba(240,215,165,.35)'; g.fillRect(Math.random() * cw, Math.random() * ch, 2 + Math.random() * 9, 1 + Math.random() * 3); }
      g.fillStyle = '#efe2c2'; g.fillRect(0, 0, cw, 9); g.fillRect(0, ch - 9, cw, 9);
      g.fillStyle = '#ff5d73'; for (let i = 0; i < 2; i++) { g.fillRect(i * 64, 0, 30, 9); g.fillRect(i * 64, ch - 9, 30, 9); }
    }) } }));
    const nodeMat = toon(0xc9a26b);
    pts.forEach(([x, y, z], i) => {
      if (o.kicker && i === last) return;
      this.world.add(new Collider('cyl', { pos: F.w(x, y - thick / 2, z), r, hh: thick / 2, surf: 'fairway', hole: H.i, tag: 'road' }));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thick, 28), nodeMat);
      m.position.set(x, y - thick / 2, z); m.receiveShadow = true; addOutline(m, 0.05); H.group.add(m);
      const rock = make('under_rock'); rock.position.set(x, y - thick + 0.05, z); rock.scale.set(r * 2, 3.5, r * 2); H.group.add(rock);
    });
    for (let i = 0; i < last; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1], run0 = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / run0, dz = (bz - az) / run0, inA = r * 0.92, inB = o.kicker && i + 1 === last ? 0 : r * 0.92;
      const x0 = ax + dx * inA, z0 = az + dz * inA, x1 = bx - dx * inB, z1 = bz - dz * inB;
      const run = Math.hypot(x1 - x0, z1 - z0), rise = by - ay, L = Math.hypot(run, rise);
      const lq = new THREE.Quaternion().setFromAxisAngle(UP, -Math.atan2(dz, dx)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(rise, run)));
      const cl = new THREE.Vector3((x0 + x1) / 2, (ay + by) / 2, (z0 + z1) / 2).add(new THREE.Vector3(0, -thick / 2, 0).applyQuaternion(lq));
      this.world.add(new Collider('box', { pos: F.w(cl.x, cl.y, cl.z), quat: F.q.clone().multiply(lq), half: new THREE.Vector3(L / 2, thick / 2, w / 2), surf: 'fairway', hole: H.i, tag: 'road' }));
      const geo = new RoundedBoxGeometry(L, thick, w, 2, 0.08), uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * L / 2.5);
      const m = new THREE.Mesh(geo, roadMat);
      m.position.copy(cl); m.quaternion.copy(lq); m.receiveShadow = true; addOutline(m, 0.05); H.group.add(m);
      for (const [seg, t, side] of o.cones || []) {
        if (seg !== i) continue;
        const cx = x0 + (x1 - x0) * t - dz * side * (w / 2 - 0.3), cz = z0 + (z1 - z0) * t + dx * side * (w / 2 - 0.3), cy = ay + (by - ay) * t;
        this.cone(H, cx, cy, cz);
      }
    }
  }
  // A big fat traffic cone you have to steer round.
  cone(H, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(0.72);
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 16), toon(0xff7a2e)); body.position.y = 0.5; body.castShadow = true; addOutline(body, 0.025); g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.175, 0.16, 16), toon(0xffffff)); band.position.y = 0.55; g.add(band);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.72), toon(0xff7a2e)); foot.position.y = 0.03; g.add(foot);
    H.group.add(g);
    this.world.add(new Collider('cyl', { pos: H.frame.w(x, y + 0.45, z), r: 0.22, hh: 0.45, surf: 'stone', hole: H.i, tag: 'cone' }));
  }
  // The hard way up: skinny unfenced roads round every hole you can't otherwise cross. The caverns need a
  // run-up: hit the kicker fast enough to clear the gap, then swerve up the far side.
  cartPaths() {
    const [, H2, H3, , , , H7, H8, H9] = this.H;
    this.road(H2, [[13, -0.35, -9], [18, -0.35, -13], [28.5, 3.15, -13], [33, 3.15, -9]], 1.8);
    this.road(H2, [[35, 3.15, -9], [39.5, 3.15, -13], [50, 6.65, -13], [54, 6.65, -9]], 1.8);
    this.sign(H2, 12, -10.2, -0.35, ['CART PATH', 'keep left. or right.'], 0.5);
    this.road(H3, [[20, -0.35, -9], [31, 2.2, -9]], 1.9, { kicker: true });
    this.road(H3, [[38.5, 1.6, -9], [44, 2.6, -9], [48, 3.9, -12.5], [51.5, 5.5, -8.5], [55.4, 6.65, -10]], 2, { cones: [[1, 0.5, 1], [2, 0.5, -1]] });
    this.sign(H3, 18, -6.6, -0.05, ['BUILD SPEED', 'do not look down'], 0.5);
    this.road(H7, [[29, 0, -5], [39.5, 2, -5]], 1.9, { kicker: true });
    this.road(H7, [[46.5, 1.2, -5], [52.5, 3.2, -5], [56, 4.8, -8.7], [59, 6.05, -5.6], [62.7, 7, -5.4]], 2, { cones: [[1, 0.5, -1], [2, 0.5, 1]] });
    this.sign(H7, 27, -6.6, 0, ['FULL THROTTLE', 'then hairpins'], 0.5);
    // Hole 8's road has a hole in it: hit the kicker with some speed.
    this.road(H8, [[14, 0, -4], [26, 1.2, -10.5], [36, 3.6, -11]], 1.8, { kicker: true });
    this.road(H8, [[41.5, 3, -11], [52, 5.5, -11], [61, 7, -5]], 2, { cones: [[0, 0.5, 1]] });
    this.sign(H8, 12, -5.6, 0, ['ROAD OUT', 'floor it'], 0.5);
    this.road(H9, [[22, 0, -5.5], [30, 2.2, -9], [38, 3.6, -5.5], [46, 5.8, -9], [51.5, 7, -7.4], [52.5, 7, -5]], 1.7, { cones: [[1, 0.5, 1], [2, 0.55, -1]] });
    this.sign(H9, 20, -6.2, 0, ['LAST ROAD', 'no pressure'], 0.5);
  }
  decorate() {
    const sp = make('spire', { outline: 0.15 });
    sp.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.scene.add(sp); this.camBlockers.push(sp);
  }

  // Which hole is the ball playing? Strips and green pads belong to their hole; on a tee pad the
  // ball near the green belongs to the previous hole. The current hole wins ties.
  // Auto-aim target for a ball on hole i: the next waypoint at least 6 m ahead, else the cup.
  aimFor(i, p) {
    const H = this.holes[i]; if (!H) return null;
    const l = H.frame.local(p, _a);
    for (const [x, z] of H.aims || []) if (x > l.x + 6) return H.frame.w(x, 0, z);
    return H.cup;
  }
  holeAt(p, current) {
    const found = [];
    for (let i = 1; i <= NHOLES; i++) {
      const l = frames[i].local(p, _a);
      if (l.x < -PAD - 1.5 || l.x > SIDE + PAD + 1.5 || l.z < -PAD - 7 || l.z > PAD + 7 || l.y < -4 || l.y > RISE + 6) continue;
      if (l.x < PAD + 0.5 && i > 1) {
        const c = this.holes[i - 1].cupLocal;
        if (c && Math.hypot(l.x - c.x, l.z - c.z) < 6.8) { found.push(i - 1); continue; }
      }
      found.push(i);
    }
    if (found.includes(current)) return current;
    return found.length ? Math.min(...found) : null;
  }
  // New wind for every shot: a random strength in the hole's range, blowing either way.
  rerollWind() {
    for (const w of this.winds) { const [a, b] = w.gust.range; w.gust.v = (Math.random() < 0.5 ? -1 : 1) * (a + Math.random() * (b - a)); }
  }
  windFor(hole, out) {
    const w = this.winds.find(z => z.hole === hole);
    if (!w) return null;
    out.copy(w.frame.in).multiplyScalar(w.f());
    return w;
  }
  windAt(p, out) {
    out.set(0, 0, 0);
    for (const w of this.winds) {
      const l = w.frame.local(p, _a);
      if (l.x < w.x0 || l.x > w.x1 || l.z < w.z0 || l.z > w.z1 || l.y < w.y0 || l.y > w.y1) continue;
      out.addScaledVector(w.frame.in, w.f());
    }
    return out;
  }
  update(t, dt) {
    this.t = t;
    this.timeU.value = t;
    waterMat.userData.uTime.value = t;
    for (const a of this.animators) a(t, dt);
  }
  timeU = { value: 0 };
}
