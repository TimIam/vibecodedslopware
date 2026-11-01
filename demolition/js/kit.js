// GLB loading and instanced "kits": every primitive of a Blender object becomes one InstancedMesh,
// so 2,500 servers and 80 racks are a handful of draw calls, and any single instance can be
// re-posed when its physics body starts moving.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ZERO = new THREE.Matrix4().set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0);

export async function loadAssets(names, base = 'assets/') {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(names.map(n => new Promise((res, rej) => loader.load(`${base}${n}.glb`, g => {
    fixMaterials(g.scene); out[n] = g.scene; res();
  }, undefined, rej))));
  return out;
}

function fixMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const n = m.name || '';
      // cutoff sits below each mask's mean alpha so a minified perforated sheet fades to a solid dark panel instead of vanishing
      if (/perf/.test(n)) { m.transparent = false; m.alphaTest = /rack/.test(n) ? 0.3 : /gpu/.test(n) ? 0.4 : 0.5; m.side = THREE.DoubleSide; m.depthWrite = true; if (m.map) m.map.anisotropy = 8; }
      if (/glass/.test(n)) { m.transparent = true; m.opacity = 0.22; m.side = THREE.DoubleSide; m.depthWrite = false; }
      if (/led|screen|lens/.test(n)) { m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, 2.5); }
      m.envMapIntensity = 0.5;
    }
  });
}

/** Find the Blender object by name inside a loaded GLB and return its meshes (one per material). */
export function part(root, name) {
  let node = null;
  root.traverse(o => { if (!node && (o.name === name || o.name === name.replace(/\./g, ''))) node = o; });
  if (!node) throw new Error(`part ${name} not found`);
  const meshes = [];
  node.traverse(o => { if (o.isMesh) meshes.push(o); });
  return meshes;
}
export function firstPart(root) {
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); }); return meshes;
}

export class Kit {
  constructor(meshes, capacity, scene, { shadow = true, cast = shadow } = {}) {
    this.capacity = capacity; this.next = 0; this.dirty = false;
    this.ledOff = new Set(); this.touchedMin = Infinity; this.touchedMax = -1;
    this.prims = meshes.map(m => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, capacity);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = cast; im.receiveShadow = shadow;
      for (let i = 0; i < capacity; i++) im.setMatrixAt(i, ZERO);
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      const n = (m.material && m.material.name) || '';
      return { mesh: im, isLed: /led|screen|lens/.test(n), name: n };
    });
  }
  alloc() { if (this.next >= this.capacity) throw new Error('kit full'); return this.next++; }
  _touch(i) { if (i < this.touchedMin) this.touchedMin = i; if (i > this.touchedMax) this.touchedMax = i; this.dirty = true; }
  set(i, m4) {
    const off = this.ledOff.has(i);
    for (const p of this.prims) p.mesh.setMatrixAt(i, off && p.isLed ? ZERO : m4);
    this._touch(i);
  }
  hide(i) { for (const p of this.prims) p.mesh.setMatrixAt(i, ZERO); this._touch(i); }
  setLeds(i, on, m4) {
    if (on) this.ledOff.delete(i); else this.ledOff.add(i);
    if (m4) this.set(i, m4);
    else { const keep = this._peek(i); for (const p of this.prims) if (p.isLed) p.mesh.setMatrixAt(i, on ? keep : ZERO); }
    this._touch(i);
  }
  _peek(i) { let src = this.prims.find(p => !p.isLed) || this.prims[0]; const m = new THREE.Matrix4(); src.mesh.getMatrixAt(i, m); return m; }
  /** upload only the touched slice of each instance buffer (a loose server should not re-send 2,000 matrices) */
  commit() {
    if (!this.dirty) return;
    const start = this.touchedMin * 16, count = (this.touchedMax - this.touchedMin + 1) * 16;
    for (const p of this.prims) { const a = p.mesh.instanceMatrix; a.clearUpdateRanges(); a.addUpdateRange(start, count); a.needsUpdate = true; }
    this.dirty = false; this.touchedMin = Infinity; this.touchedMax = -1;
  }
}

/** Compose a Matrix4 from a Rapier body pose plus an optional local offset matrix. */
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
export function bodyMatrix(body, out, local) {
  const t = body.translation(), r = body.rotation();
  _p.set(t.x, t.y, t.z); _q.set(r.x, r.y, r.z, r.w);
  out.compose(_p, _q, _s);
  if (local) out.multiply(local);
  return out;
}
