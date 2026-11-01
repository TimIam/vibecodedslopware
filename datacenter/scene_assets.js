// scene_assets.js — GLB loading, the instancing bake, runtime canvas textures and fallbacks for scene.js.
//
// GLTFLoader turns a multi-primitive glTF mesh into a Group of one Mesh per material, which would cost one draw call
// per material per object. bake() flattens an object into ONE BufferGeometry whose plain materials become vertex
// colours on a shared "body" MeshStandardMaterial, keeping only the shading classes that need their own material
// (emissive LED strips, glow fixtures, glass, chain-link, the tintable hot-aisle tiles). A server tier is then one
// draw call for 1,920 instances, a shell floor one, an infra unit two or three.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const warned = new Set();
export function warnOnce(key, ...msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[scene]', ...msg);
}

// ---- loading ------------------------------------------------------------------------------------------------------
const loader = new GLTFLoader();
const cache = new Map();

// Resolves to the glTF scene (a Group whose children are the file's top-level objects); an empty Group on failure, so
// every lookup falls through to a fallback box instead of throwing.
export function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise(resolve => {
      loader.load(url, gltf => { gltf.scene.updateMatrixWorld(true); resolve(gltf.scene); }, undefined, err => {
        warnOnce('load:' + url, `could not load ${url}; using fallback boxes`, err?.message || err);
        resolve(new THREE.Group());
      });
    }));
  }
  return cache.get(url);
}

export function findObject(root, name) {
  return root.children.find(o => o.name === name) || null;
}

// Children that mark a point (empties) or a part: build_assets.py stamps userData.role because GLTFLoader renames
// repeated node names (led_0, led_0_2, ...).
export function childByRole(obj, role) {
  if (!obj) return null;
  for (const c of obj.children) if (c.userData?.role === role || c.name === role) return c;
  return null;
}

// ---- shading classes --------------------------------------------------------------------------------------------------
// MAT_glow_blue / MAT_glow_red are tinted glows: the Colo vending machine's product window and sign (§15 'a
// vending-machine glow') and the Hall's blue aisle strips. They keep their GLB emissive (strength 0.7, under the bloom
// threshold) instead of folding into the body class, which rendered them as flat slate panels by base colour.
const CLASS_BY_MAT = { MAT_led: 'led', MAT_glow: 'glow', MAT_glow_blue: 'glowBlue', MAT_glow_red: 'glowRed', MAT_glass: 'glass', MAT_chainlink: 'chainlink', MAT_tile_hot: 'hot' };
const CLASS_ORDER = ['body', 'led', 'glow', 'glowBlue', 'glowRed', 'glass', 'chainlink', 'hot'];
export const classOf = material => CLASS_BY_MAT[material?.name] || 'body';

// A fixture's housing is dark; only its lens emits. The glow fixtures are plain boxes and discs (the Hall's 19 m aisle
// strips, the Colo tubes, the highbay discs) emissive on every face, so from the 48° pitch of the Warehouse on their
// top faces read as white bars across the rows: up-facing fragments keep 15% of the emissive, which leaves the thin
// lit edge of each strip over its row and a dark housing above it.
function dimTopFaces(m) {
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= mix(1.0, 0.15, smoothstep(0.2, 0.7, dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))));');
  };
  m.customProgramCacheKey = () => 'dimTopFaces';
}

// One material per shading class, adopted from the first GLB material of that class seen (so emissive strength,
// opacity and double-sidedness come from build_assets.py), with the shared vertex-coloured body material.
export function createMaterialSet(textures) {
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
  const made = { body };
  const defaults = {
    led: () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.85, 0.92, 1.0), emissiveIntensity: 4, roughness: 0.4 }),
    glow: () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.595, 0.644, 0.7), roughness: 0.4 }),
    glowBlue: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.5, 0.6), emissive: new THREE.Color(0.55, 0.75, 1.0), emissiveIntensity: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    glowRed: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.6, 0.18, 0.05), emissive: new THREE.Color(1.0, 0.42, 0.12), emissiveIntensity: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    glass: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.52, 0.6), transparent: true, opacity: 0.18, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    chainlink: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.36, 0.38), transparent: true, side: THREE.DoubleSide, roughness: 0.8 }),
    hot: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.085, 0.08), roughness: 0.8 }),
  };
  function get(cls, src) {
    if (made[cls]) return made[cls];
    let m = src && src.isMeshStandardMaterial ? src.clone() : defaults[cls]();
    if (cls === 'glass') { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; }
    if (cls === 'chainlink') {
      m.transparent = true; m.side = THREE.DoubleSide; m.depthWrite = false; m.alphaTest = 0.08;
      m.map = textures.chainlink; m.alphaMap = textures.chainlink; m.opacity = 1;
      m.color.setRGB(0.5, 0.52, 0.55);
    }
    if (cls === 'hot') m.emissive = new THREE.Color(0, 0, 0);
    // matte housings: at the GLB's roughness 0.4 the key light's specular highlight turned the up-facing strips into
    // white bars from the 48° pitch, whatever their emissive or base colour did
    if (cls === 'glow' || cls === 'glowBlue' || cls === 'glowRed') { dimTopFaces(m); m.roughness = 0.9; }
    // build_assets.py gives the tinted glows a base that is already the tint (the body-class fallback renders by base
    // colour alone); with the emissive honoured, that slate base under the key light made the Hall's 19 m aisle
    // strips read as lit slabs from above, so the housing goes dark and only the emissive shows.
    if (cls === 'glowBlue' || cls === 'glowRed') m.color.multiplyScalar(0.25);
    m.userData.baseEmissive = m.emissiveIntensity; // the GLB's strength, which the scene dims with efficiency
    m.name = 'scene_' + cls;
    made[cls] = m;
    return m;
  }
  return { get, body, get glow() { return made.glow || get('glow'); }, get hot() { return made.hot || get('hot'); }, get led() { return made.led || get('led'); },
    get glowBlue() { return made.glowBlue || get('glowBlue'); }, get glowRed() { return made.glowRed || get('glowRed'); },
    dispose() { for (const m of Object.values(made)) m.dispose(); } };
}

// ---- the bake ---------------------------------------------------------------------------------------------------------
// Flattens `root` (a Mesh or Group from a GLB) into { geometry, materials, size, box }. Plain materials become vertex
// colours on matSet.body; special classes keep one group each, in CLASS_ORDER, so geometry.groups[i] uses materials[i].
//   relativeTo 'parent': vertices in the root's parent frame (keeps a variant's node scale; library objects)
//   relativeTo 'self':   vertices in the root's own frame (shell props that keep their placement on the Mesh)
//   skip(node):          subtree to leave out (fan children, which are instanced separately)
//   materialFor(cls, src): override for a class (a tray's scrolling strip, the uplink's pulsing LED)
export function bake(root, matSet, { relativeTo = 'parent', skip = null, materialFor = null } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  if (relativeTo === 'self') inv.copy(root.matrixWorld).invert();
  else if (root.parent) inv.copy(root.parent.matrixWorld).invert();

  const parts = [];
  const walk = node => {
    if (skip && node !== root && skip(node)) return;
    if (node.isMesh && node.geometry?.attributes?.position) parts.push(node);
    for (const c of node.children) walk(c);
  };
  walk(root);

  const byClass = Object.fromEntries(CLASS_ORDER.map(c => [c, []]));
  let vCount = 0, iCount = 0;
  for (const p of parts) {
    const g = p.geometry, n = g.attributes.position.count;
    vCount += n; iCount += g.index ? g.index.count : n;
    byClass[classOf(p.material)].push(p);
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  const geometry = new THREE.BufferGeometry();
  const materials = [], classes = [];
  const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const cls of CLASS_ORDER) {
    const list = byClass[cls];
    if (!list.length) continue;
    const start = io;
    for (const p of list) {
      const g = p.geometry, n = g.attributes.position.count;
      m4.copy(inv).multiply(p.matrixWorld);
      nm.getNormalMatrix(m4);
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      const c = p.material?.color || new THREE.Color(0.5, 0.5, 0.5);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m4);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        if (N) v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
        if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
      }
      // Chain-link quads come with degenerate UVs: project the diamond pattern from position (one cell per 12 cm).
      if (cls === 'chainlink') {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) { const x = pos[(vo + i) * 3], z = pos[(vo + i) * 3 + 2]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
        const alongX = maxX - minX >= maxZ - minZ;
        for (let i = 0; i < n; i++) {
          uv[(vo + i) * 2] = (alongX ? pos[(vo + i) * 3] : pos[(vo + i) * 3 + 2]) / 0.16;
          uv[(vo + i) * 2 + 1] = pos[(vo + i) * 3 + 1] / 0.16;
        }
      }
      if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
      else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
      vo += n;
    }
    const src = list[0].material;
    const mat = (materialFor && materialFor(cls, src)) || (cls === 'body' ? matSet.body : matSet.get(cls, src));
    geometry.addGroup(start, io - start, materials.length);
    materials.push(mat);
    classes.push(cls);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  return { geometry, materials, classes, size, box };
}

// One group of a baked geometry as its own compact geometry (only the vertices that group references), so a
// BatchedMesh per shading class can hold many unit types in one draw call.
export function subGeometry(geometry, start, count) {
  const I = geometry.index.array;
  const remap = new Map();
  const newIdx = [];
  for (let i = start; i < start + count; i++) {
    const old = I[i];
    let n = remap.get(old);
    if (n === undefined) { n = remap.size; remap.set(old, n); }
    newIdx.push(n);
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const src = geometry.attributes[name];
    const arr = new Float32Array(remap.size * src.itemSize);
    for (const [old, n] of remap) for (let k = 0; k < src.itemSize; k++) arr[n * src.itemSize + k] = src.array[old * src.itemSize + k];
    g.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
  }
  g.setIndex(remap.size > 65535 ? new THREE.Uint32BufferAttribute(newIdx, 1) : new THREE.Uint16BufferAttribute(newIdx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// { body, led, glow, glass, chainlink, hot } sub-geometries of a bake (missing classes absent).
export function splitByClass(baked) {
  const out = {};
  baked.geometry.groups.forEach(gr => { out[baked.classes[gr.materialIndex]] = subGeometry(baked.geometry, gr.start, gr.count); });
  return out;
}

// ---- fallbacks ---------------------------------------------------------------------------------------------------------
// Bounding sizes (W × H × D in metres) from assets/ASSETS.md, used when an object is missing from a GLB.
const FALLBACK_SIZE = {
  rack_frame: [0.6, 2.0, 1.2], pwr_pdu: [0.06, 1.9, 0.06], pwr_subpanel: [0.5, 2.1, 0.19], pwr_genset: [1.72, 1.73, 0.8],
  pwr_substation: [1.5, 1.47, 1.2], pwr_hv_feed: [2.4, 6.56, 3.52], pwr_smr: [2.24, 2.6, 2.92], cool_box_fan: [0.56, 0.64, 0.45],
  cool_window_ac: [0.6, 0.68, 0.81], cool_split_ac: [0.9, 1.9, 0.32], cool_crac: [0.8, 1.8, 0.92], cool_chiller: [1.92, 3.61, 1.83],
  cool_cryo: [2.46, 5.42, 2.77], cool_tower: [3.2, 3.4, 3.2], cool_immersion: [1.56, 1.85, 0.94], net_switch: [0.44, 0.04, 0.31],
  net_biz_fiber: [0.36, 2.23, 0.21], net_fiber_uplink: [0.4, 1.45, 0.71], net_core_router: [0.6, 2.17, 1.07], net_ix_port: [0.8, 2.9, 1.43],
  net_cable_landing: [1.0, 3.63, 1.78], net_tray_segment: [1.0, 0.1, 0.3], skyline_campus: [27, 10.4, 13], hall_shell_silhouette: [40, 11, 22],
  prop_civic: [1.9, 1.3, 4.3], prop_garage_monument: [7, 3, 6], prop_satellite: [3, 1, 2],
};
const fallbackMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.18, 0.2, 0.24), roughness: 0.85 });

// A box of the right size with its origin at the bottom centre, named like the missing object.
export function fallbackObject(name, data) {
  let s = FALLBACK_SIZE[name];
  if (!s && name.startsWith('srv_')) { const e = data?.ASSETS?.envelope || { w: 0.52, d: 0.9, h: 0.2 }; s = [e.w, e.h, e.d]; }
  if (!s) s = [1, 1, 1];
  const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), fallbackMaterial);
  m.position.y = s[1] / 2;
  const g = new THREE.Group();
  g.name = name;
  g.add(m);
  if (name.startsWith('srv_')) {
    for (let i = 0; i < 2; i++) { const e = new THREE.Object3D(); e.userData.role = `led_${i}`; e.position.set(-0.21 + 0.03 * i, s[1] * 0.7, s[2] / 2 + 0.002); g.add(e); }
  }
  if (name === 'rack_frame') {
    for (let i = 0; i < 8; i++) { const e = new THREE.Object3D(); e.userData.role = `slot_${i}`; e.position.set(0, 0.12 + 0.22 * i, 0.1); g.add(e); }
  }
  g.updateMatrixWorld(true);
  return g;
}

// Library object by name, or a fallback (warned once).
export function libraryObject(lib, name, data) {
  const o = findObject(lib, name);
  if (o) return o;
  warnOnce('missing:' + name, `library object "${name}" missing; using a fallback box`);
  const f = fallbackObject(name, data);
  lib.add(f); // so relativeTo 'parent' has a frame to bake against
  lib.updateMatrixWorld(true);
  return f;
}

// ---- runtime textures ---------------------------------------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Chain-link diamond: white lines on transparent, used as map + alphaMap (alpha reads the green channel).
export function chainlinkTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
  for (const d of [-64, 0, 64]) {
    g.beginPath(); g.moveTo(d, 0); g.lineTo(d + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(d + 64, 0); g.lineTo(d, 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dashed strip for the network trays: emissiveMap scrolled along u. 4 dashes per segment; `thin` is the Compression
// upgrade's read (same cats, fewer bits).
export function dashTexture({ thin = false } = {}) {
  const c = canvas(128, 8), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 8);
  g.fillStyle = '#fff';
  const w = thin ? 8 : 18, h = thin ? 4 : 6, y = thin ? 2 : 1;
  for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 4, y, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dashed outline for an unbought footprint (dark rectangle with a dim border).
export function outlineTexture() {
  const c = canvas(64, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(120,140,170,0.9)'; g.lineWidth = 4; g.setLineDash([8, 6]);
  g.strokeRect(3, 3, 58, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// "⚡×N" pill for a badge sprite (lane glyph + count); cached per text. The font shrinks until the text fits the pill.
const badgeCache = new Map();
export function badgeTexture(text) {
  if (badgeCache.has(text)) return badgeCache.get(text);
  // drawn at 2x so the glyph survives the sprite's ~50 px on-screen size
  const c = canvas(320, 144), g = c.getContext('2d');
  g.clearRect(0, 0, 320, 144);
  g.fillStyle = 'rgba(10,14,22,0.82)';
  g.beginPath(); g.roundRect(8, 8, 304, 128, 36); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#eef3ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 80;
  do { g.font = `bold ${size}px system-ui, "Segoe UI Symbol", sans-serif`; size -= 4; } while (g.measureText(text).width > 272 && size > 36);
  g.fillText(text, 160, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  badgeCache.set(text, t);
  return t;
}

export function createTextures() {
  return { chainlink: chainlinkTexture(), dash: dashTexture(), dashThin: dashTexture({ thin: true }), outline: outlineTexture() };
}
