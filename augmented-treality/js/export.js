// GLB (Android Scene Viewer / ARCore / anything) and USDZ (iPhone AR Quick Look) files of a design.
// A clean model is built without the live-only extras, then flattened to one mesh per material
// so the viewer apps get a few dozen draw calls instead of a few thousand objects.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { TreeModel } from './build.js';
import { normalize } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function exportModel(design) {
  const model = new TreeModel({ live: false }).update(design);
  return flatten(model.root);
}

export function flatten(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse(o => {
    if (o.userData.liveOnly) { o.visible = false; return; }
    let hidden = false; for (let p = o; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden || !o.isMesh || o.isSprite) return;
    const m = o.material;
    if (!groups.has(m)) groups.set(m, []);
    const g = o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // A negative scale (mirrored wings) flips the winding: put it back.
    if (o.matrixWorld.determinant() < 0) flip(g);
    groups.get(m).push(indexed(normalize(g)));
  });
  const out = new THREE.Group();
  out.name = 'ChristmasTree';
  let tris = 0;
  for (const [m, list] of groups) {
    const g = mergeGeometries(list, false);
    if (!g) continue;
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, exportMaterial(m));
    mesh.name = (m.name || 'part').replace(/[^A-Za-z0-9_]/g, '_');
    out.add(mesh);
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  }
  out.userData.triangles = tris;
  return out;
}

function indexed(g) {
  if (!g.index) {
    const n = g.attributes.position.count, a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) a[i] = i;
    g.setIndex(new THREE.BufferAttribute(a, 1));
  }
  if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(g.index.array), 1));
  return g;
}

function flip(g) {
  const idx = g.index;
  if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else {
    for (const k of Object.keys(g.attributes)) {
      const at = g.attributes[k], s = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < s; c++) { const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t; }
    }
  }
}

// Viewer apps have their own lighting; make sure glowing things stay bright and nothing is double sided.
function exportMaterial(m) {
  const e = m.clone();
  e.side = THREE.FrontSide;
  e.onBeforeCompile = () => {};
  if (e.emissive && e.emissive.getHex() > 0) e.emissiveIntensity = Math.min(e.emissiveIntensity, 1);
  return e;
}

export async function toGLB(design) {
  const obj = exportModel(design);
  const ex = new GLTFExporter();
  const buf = await ex.parseAsync(obj, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  return { blob: new Blob([buf], { type: 'model/gltf-binary' }), triangles: obj.userData.triangles };
}

export async function toUSDZ(design) {
  const obj = exportModel(design);
  const ex = new USDZExporter();
  const data = await ex.parseAsync(obj, {
    quickLookCompatible: true,
    maxTextureSize: 1024,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
  });
  return { blob: new Blob([data], { type: 'model/vnd.usdz+zip' }), triangles: obj.userData.triangles };
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
