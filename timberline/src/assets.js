// Loads the Blender-built GLB models (assets/models). Every asset has a procedural fallback
// so the game still runs if a model is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rockMaterial } from './textures.js';

const NAMES = ['axe', 'chainsaw', 'harvester', 'wedge', 'crown_conifer', 'crown_broadleaf', 'rock', 'faller'];
const models = {};

function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    o.geometry.userData.shared = true; // clones and instances reuse it; disposeGeometry leaves it alone
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.name?.toLowerCase().includes('glass')) { m.transparent = true; m.opacity = Math.min(m.opacity ?? 1, 0.35); m.depthWrite = false; }
      if (m.name?.toLowerCase().match(/needle|leaf|foliage/)) m.side = THREE.DoubleSide;
    }
  });
}

export const assets = {
  loaded: [],
  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(NAMES.map(async (n) => {
      try {
        let gltf;
        try {
          const mod = await import(`../assets/web/${n}.js`); // base64-packed GLB (see tools/pack-models.cjs)
          const bin = Uint8Array.from(atob(mod.default), (c) => c.charCodeAt(0));
          gltf = await loader.parseAsync(bin.buffer, '');
        } catch {
          gltf = await loader.loadAsync(`assets/models/${n}.glb`);
        }
        fixMaterials(gltf.scene);
        models[n] = gltf.scene;
        this.loaded.push(n);
      } catch { /* fallback used */ }
      onProgress?.(++done / NAMES.length);
    }));
  },

  // Flattened mesh list with matrices relative to the model root (for instancing).
  parts(name, fallback) {
    const key = '_parts_' + name;
    if (this[key]) return this[key];
    const root = models[name];
    const out = [];
    if (root) {
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          if (mats.length > 1 && o.geometry.groups.length) {
            // split multi-material meshes so they can be instanced
            for (const g of o.geometry.groups) {
              const geo = o.geometry.clone(); geo.clearGroups();
              geo.setIndex(Array.from(o.geometry.index.array.slice(g.start, g.start + g.count)));
              out.push({ geometry: geo, material: mats[g.materialIndex], matrix: inv.clone().multiply(o.matrixWorld) });
            }
          } else out.push({ geometry: o.geometry, material: mats[0], matrix: inv.clone().multiply(o.matrixWorld) });
        }
      });
    }
    this[key] = out.length ? out : fallback();
    for (const p of this[key]) p.geometry.userData.shared = true;
    return this[key];
  },
  crownParts(kind) { return this.parts('crown_' + kind, () => (kind === 'conifer' ? fallbackConifer() : fallbackBroadleaf())); },
  // The same crowns with about a fifth of the triangles, for the background ring 50 m and more out in the haze.
  crownPartsFar(kind) {
    const key = '_far_' + kind;
    return (this[key] ||= this.crownParts(kind).map((p) => {
      const tris = (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3;
      if (tris < 200) return p;
      try {
        const g = mergeVertices(p.geometry.clone().deleteAttribute('normal')); // weld hard-edge splits so it can collapse across them
        const geometry = new SimplifyModifier().modify(g, Math.floor(g.attributes.position.count * 0.78));
        geometry.computeVertexNormals();
        geometry.userData.shared = true;
        return { ...p, geometry };
      } catch { return p; }
    }));
  },
  rockParts() {
    const parts = this.parts('rock', fallbackRocks);
    for (const p of parts) if (!p.centered) { p.matrix.elements[12] = 0; p.matrix.elements[14] = 0; p.centered = true; } // rocks are laid out side by side in the file
    return parts;
  },

  crown(kind) {
    const m = models['crown_' + kind];
    if (m) return m.clone(true);
    const g = new THREE.Group();
    for (const p of this.crownParts(kind)) { const mesh = new THREE.Mesh(p.geometry, p.material); mesh.applyMatrix4(p.matrix); mesh.castShadow = true; g.add(mesh); }
    return g;
  },
  chainsaw() {
    const m = models.chainsaw;
    const obj = m ? m.clone(true) : fallbackSaw();
    return { obj, bar: obj.getObjectByName('Bar'), chain: obj.getObjectByName('Chain') };
  },
  axe() { return models.axe ? models.axe.clone(true) : fallbackAxe(); },
  wedge() { return models.wedge ? models.wedge.clone(true) : fallbackWedge(); },
  faller() { return models.faller ? models.faller.clone(true) : null; },
  harvester() { return models.harvester ? models.harvester.clone(true) : fallbackHarvester(); },
  has(n) { return !!models[n]; },
};

// ---------------- fallbacks ----------------
function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position; let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + rnd() * amt, p.getY(i) + rnd() * amt * 0.6, p.getZ(i) + rnd() * amt);
  geo.computeVertexNormals();
  return geo;
}
function fallbackConifer() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x24402a, roughness: 0.95, flatShading: true });
  const out = [];
  const tiers = 9;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = 0.22 * (1 - t) + 0.02;
    const geo = jitter(new THREE.ConeGeometry(r, 0.22, 9, 2, true), r * 0.25, i + 3);
    const m = new THREE.Matrix4().makeTranslation(0, t * 0.88 + 0.11, 0);
    out.push({ geometry: geo, material: mat, matrix: m });
  }
  return out;
}
function fallbackBroadleaf() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3c5a26, roughness: 0.95, flatShading: true });
  const out = [];
  const blobs = [[0, 0.62, 0, 0.3], [0.17, 0.5, 0.05, 0.22], [-0.16, 0.52, -0.06, 0.23], [0.05, 0.42, 0.18, 0.2], [-0.05, 0.45, -0.18, 0.2], [0, 0.82, 0, 0.18]];
  blobs.forEach(([x, y, z, r], i) => {
    const geo = jitter(new THREE.IcosahedronGeometry(r, 2), r * 0.35, i + 7);
    out.push({ geometry: geo, material: mat, matrix: new THREE.Matrix4().makeTranslation(x, y, z) });
  });
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.CylinderGeometry(0.008, 0.02, 0.5, 5); geo.translate(0, 0.25, 0);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.6 * Math.cos(i * 1.6), i * 1.6, 0.6 * Math.sin(i * 1.6)));
    out.push({ geometry: geo, material: limbMat, matrix: m });
  }
  return out;
}
function fallbackRocks() {
  const mat = rockMaterial();
  return [0, 1, 2].map((i) => {
    const geo = jitter(new THREE.DodecahedronGeometry(0.5, 1), 0.18, i + 11); geo.translate(0, 0.35, 0);
    return { geometry: geo, material: mat, matrix: new THREE.Matrix4() };
  });
}
function fallbackSaw() {
  const g = new THREE.Group(); g.name = 'Chainsaw';
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8661c, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.35 });
  const body = new THREE.Group(); body.name = 'Body';
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.18), orange); housing.position.set(0.12, 0.08, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 16, Math.PI), black); handle.position.set(0.15, 0.18, 0); handle.rotation.y = Math.PI / 2;
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), black); rear.position.set(-0.04, 0.04, 0);
  body.add(housing, handle, rear);
  const barShape = new THREE.Shape(); barShape.moveTo(0, -0.035); barShape.lineTo(0.5, -0.025); barShape.absarc(0.5, 0, 0.025, -Math.PI / 2, Math.PI / 2); barShape.lineTo(0, 0.035);
  const barGeo = new THREE.ExtrudeGeometry(barShape, { depth: 0.006, bevelEnabled: false }); barGeo.translate(0.28, 0.04, -0.003);
  const bar = new THREE.Mesh(barGeo, steel); bar.name = 'Bar';
  const chainGeo = new THREE.ExtrudeGeometry(barShape, { depth: 0.009, bevelEnabled: false }); chainGeo.scale(1.02, 1.25, 1); chainGeo.translate(0.275, 0.04, -0.0045);
  const chain = new THREE.Mesh(chainGeo, black); chain.name = 'Chain';
  g.add(body, chain, bar);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function fallbackAxe() {
  const g = new THREE.Group(); g.name = 'Axe';
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.7 })); h.position.y = 0.4; h.name = 'Handle';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.03), new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.9, roughness: 0.4 })); head.position.set(0.05, 0.78, 0); head.name = 'Head';
  g.add(h, head); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function fallbackWedge() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.2, 0.012); s.lineTo(0.2, 0.016); s.lineTo(0, 0.035);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }); geo.translate(0, -0.017, -0.035);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf26b1d, roughness: 0.55 })); m.name = 'Wedge'; m.castShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
function fallbackHarvester() {
  const root = new THREE.Group(); root.name = 'Harvester';
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.35, roughness: 0.1 });
  const chassis = new THREE.Group(); chassis.name = 'Chassis'; root.add(chassis);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 7), paint); frame.position.y = 1.3; chassis.add(frame);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.2), paint); hood.position.set(0, 2.2, -2.2); chassis.add(hood);
  for (let i = 0; i < 8; i++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.6, 16), dark); w.rotation.z = Math.PI / 2;
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    w.position.set(side * 1.35, 0.62, [-2.8, -1.5, 1.4, 2.7][row]); w.name = 'Wheel_' + i; chassis.add(w);
  }
  const turret = new THREE.Group(); turret.name = 'Turret'; turret.position.set(0, 1.8, 1.2); chassis.add(turret);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.7), glass); cab.position.set(0, 1.0, 0.2); cab.name = 'Cab'; turret.add(cab);
  const boom1 = new THREE.Group(); boom1.name = 'Boom1'; boom1.position.set(0.9, 0.6, 0.5); turret.add(boom1);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 4.2), paint); b1.position.z = 2.1; boom1.add(b1);
  const boom2 = new THREE.Group(); boom2.name = 'Boom2'; boom2.position.z = 4.2; boom1.add(boom2);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 4.2), paint); b2.position.z = 2.1; boom2.add(b2);
  const head = new THREE.Group(); head.name = 'Head'; head.position.z = 4.2; boom2.add(head);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.6), paint); hb.position.y = -0.6; head.add(hb);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
