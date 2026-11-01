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
      if (/perf/.test(n)) { m.transparent = false; m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.depthWrite = true; }
      if (/glass/.test(n)) { m.transparent = true; m.opacity = 0.22; m.side = THREE.DoubleSide; m.depthWrite = false; }
      if (/led|screen|lens/.test(n)) { m.toneMapped = false; }
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
  constructor(meshes, capacity, scene, { shadow = true } = {}) {
    this.capacity = capacity; this.next = 0; this.dirty = false;
    this.ledOff = new Set();
    this.prims = meshes.map(m => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, capacity);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = shadow; im.receiveShadow = shadow;
      for (let i = 0; i < capacity; i++) im.setMatrixAt(i, ZERO);
      im.instanceMatrix.needsUpdate = true;
      scene.add(im);
      const n = (m.material && m.material.name) || '';
      return { mesh: im, isLed: /led|screen|lens/.test(n), name: n };
    });
  }
  alloc() { if (this.next >= this.capacity) throw new Error('kit full'); return this.next++; }
  set(i, m4) {
    const off = this.ledOff.has(i);
    for (const p of this.prims) p.mesh.setMatrixAt(i, off && p.isLed ? ZERO : m4);
    this.dirty = true;
  }
  hide(i) { for (const p of this.prims) p.mesh.setMatrixAt(i, ZERO); this.dirty = true; }
  setLeds(i, on, m4) {
    if (on) this.ledOff.delete(i); else this.ledOff.add(i);
    if (m4) this.set(i, m4);
    else for (const p of this.prims) if (p.isLed) { p.mesh.setMatrixAt(i, on ? this._peek(i) : ZERO); }
    this.dirty = true;
  }
  _peek(i) { const m = new THREE.Matrix4(); this.prims[0].mesh.getMatrixAt(i, m); return m; }
  commit() {
    if (!this.dirty) return;
    for (const p of this.prims) p.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
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
