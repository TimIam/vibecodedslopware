// Asset kit: loads parts.glb, clones parts with per-ride paint, batches repeated props into InstancedMeshes,
// and paints canvas textures (signs, grass, asphalt, rust).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PARTS = {};
let BATCH = new Map();

export async function loadParts(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  for (const ob of gltf.scene.children) {
    ob.traverse(m => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const mt = m.material;
      if (mt.name === 'bulb') { mt.emissiveIntensity = 2.2; mt.toneMapped = true; }
      if (mt.name === 'glass') { mt.transparent = true; mt.opacity = 0.45; mt.envMapIntensity = 1.6; }
      if (mt.name === 'chrome' || mt.name === 'steel') mt.envMapIntensity = 1.3;
      if (mt.name === 'concrete') { mt.map = noiseTex('#a8a49c', 0.16, 256, 7); mt.color.set('#ffffff'); }
      if (mt.name === 'wood') { mt.map = woodTex(); mt.color.set('#ffffff'); }
      if (mt.name === 'brick') { mt.map = brickTex(); mt.color.set('#ffffff'); }
      if (mt.name.startsWith('paint')) { mt.roughnessMap = scuffTex(); mt.metalness = 0.2; mt.roughness = 0.5; }
    });
    PARTS[ob.name] = ob;
  }
  return PARTS;
}

const matCache = new Map();
function tinted(mt, color) {
  const key = mt.uuid + color;
  if (!matCache.has(key)) { const m = mt.clone(); m.color.set(color); matCache.set(key, m); }
  return matCache.get(key);
}

// Clone a part; paint = { a, b, canvas_a, canvas_b } colours replace those materials.
export function part(name, paint = null) {
  const src = PARTS[name];
  if (!src) throw new Error('missing part ' + name);
  const o = src.clone(true);
  if (paint) o.traverse(m => {
    if (!m.isMesh) return;
    const n = m.material.name;
    if (n === 'paint_a' && paint.a) m.material = tinted(m.material, paint.a);
    else if (n === 'paint_b' && paint.b) m.material = tinted(m.material, paint.b);
    else if (n === 'canvas_a' && paint.ca) m.material = tinted(m.material, paint.ca);
    else if (n === 'canvas_b' && paint.cb) m.material = tinted(m.material, paint.cb);
  });
  return o;
}

export function setMat(o, mat) { o.traverse(m => { if (m.isMesh) m.material = mat; }); return o; }

// ------------------------------------------------------------------------------------------------ batching
export function batchReset() { BATCH = new Map(); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function batchAdd(name, x, y, z, rotY = 0, sc = 1, color = null) {
  _q.setFromAxisAngle(_Y, rotY);
  _s.set(sc, sc, sc);
  _m.compose(_p.set(x, y, z), _q, _s);
  batchAddMatrix(name, _m, color);
}
const _Y = new THREE.Vector3(0, 1, 0);
export function batchAddMatrix(name, m, color = null) {
  if (!BATCH.has(name)) BATCH.set(name, { mats: [], colors: [] });
  const b = BATCH.get(name);
  b.mats.push(m.clone()); b.colors.push(color);
}
export function batchBuild(parent, paint = null) {
  for (const [name, b] of BATCH) {
    const src = paint?.[name] ? part(name, paint[name]) : PARTS[name];
    const meshes = [];
    src.updateMatrixWorld(true);
    src.traverse(m => { if (m.isMesh) meshes.push(m); });
    for (const m of meshes) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, b.mats.length);
      im.castShadow = true; im.receiveShadow = true;
      const local = m.matrixWorld;
      b.mats.forEach((mm, i) => im.setMatrixAt(i, _m.multiplyMatrices(mm, local)));
      if (b.colors.some(c => c)) b.colors.forEach((c, i) => im.setColorAt(i, new THREE.Color(c || '#ffffff')));
      im.computeBoundingSphere();
      parent.add(im);
    }
  }
  BATCH = new Map();
}

// ------------------------------------------------------------------------------------------------ textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rnd(seed) { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; }

export function noiseTex(base, amt = 0.15, size = 256, seed = 3) {
  const [c, g] = canvas(size, size); const r = rnd(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size / 6; i++) {
    const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${r() * amt})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c);
}

export function grassTex() {
  const s = 512, [c, g] = canvas(s, s), r = rnd(11);
  g.fillStyle = '#5d8a3a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) {
    const x = r() * s, y = r() * s, rr = 20 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const tone = r() < 0.5 ? '76,120,48' : '104,150,62';
    gr.addColorStop(0, `rgba(${tone},0.35)`); gr.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < 26000; i++) {
    const x = r() * s, y = r() * s, l = 2 + r() * 4;
    g.strokeStyle = `rgba(${r() < 0.5 ? '150,190,90' : '50,90,30'},${0.25 + r() * 0.35})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y - l); g.stroke();
  }
  return tex(c, 1);
}

export function asphaltTex() {
  const s = 256, [c, g] = canvas(s, s), r = rnd(5);
  g.fillStyle = '#7d766c'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) { const v = 70 + r() * 110; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.55)`; g.fillRect(r() * s, r() * s, 1.5, 1.5); }
  for (let i = 0; i < 14; i++) { const v = 90 + r() * 30; g.fillStyle = `rgba(${v},${v},${v},0.12)`; g.beginPath(); g.arc(r() * s, r() * s, 6 + r() * 26, 0, 7); g.fill(); }
  return tex(c, 1);
}

export function tileTex() {
  const s = 256, [c, g] = canvas(s, s), r = rnd(9);
  g.fillStyle = '#b9a58a'; g.fillRect(0, 0, s, s);
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 175 + r() * 30; g.fillStyle = `rgb(${v},${v - 18},${v - 42})`;
    g.fillRect(i * w + 1.5, j * w + 1.5, w - 3, w - 3);
  }
  return tex(c, 1);
}

export function rustTex() {
  const s = 256, [c, g] = canvas(s, s), r = rnd(21);
  g.fillStyle = '#6b3519'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 160; i++) {
    const x = r() * s, y = r() * s, rr = 4 + r() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = r() < 0.4 ? '201,110,48' : r() < 0.6 ? '60,30,16' : '150,74,30';
    gr.addColorStop(0, `rgba(${col},0.8)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return tex(c, 1);
}

function scuffTex() {
  const s = 128, [c, g] = canvas(s, s), r = rnd(4);
  g.fillStyle = '#5f5f5f'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) { const v = 60 + r() * 140; g.fillStyle = `rgba(${v},${v},${v},0.3)`; g.fillRect(r() * s, r() * s, 1 + r() * 3, 1); }
  return tex(c, 1, false);
}
function woodTex() {
  const s = 256, [c, g] = canvas(s, s), r = rnd(8);
  g.fillStyle = '#8a5a34'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '60,35,18' : '160,110,70'},${r() * 0.3})`; g.fillRect(0, y, s, 1 + r() * 2); }
  return tex(c, 1);
}
function brickTex() {
  const s = 256, [c, g] = canvas(s, s), r = rnd(13);
  g.fillStyle = '#d8cfc0'; g.fillRect(0, 0, s, s);
  for (let row = 0; row < 16; row++) for (let k = -1; k < 8; k++) {
    const v = 120 + r() * 40; g.fillStyle = `rgb(${v + 30},${v - 30},${v - 50})`;
    g.fillRect(k * 32 + (row % 2) * 16 + 1, row * 16 + 1, 30, 14);
  }
  return tex(c, 1);
}

export function rustMat() {
  if (!rustMat.m) rustMat.m = new THREE.MeshStandardMaterial({ map: rustTex(), roughness: 0.95, metalness: 0.35 });
  return rustMat.m;
}

// sign faces
export function signTex(lines, { w = 1024, h = 320, bg = '#1d2a44', fg = '#ffe9a8', font = 'Bungee, "Arial Black", sans-serif', border = '#ffcf4a', sub = null } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = Array.isArray(lines) ? lines : [lines];
  let size = h * (sub ? 0.42 : 0.5);
  g.font = `${size}px ${font}`;
  while (g.measureText(text[0]).width > w * 0.86 && size > 10) { size *= 0.92; g.font = `${size}px ${font}`; }
  g.fillText(text[0], w / 2, sub ? h * 0.42 : h * 0.53);
  if (sub) { g.font = `${h * 0.17}px "Barlow Condensed", Arial, sans-serif`; g.fillStyle = border; g.fillText(sub, w / 2, h * 0.76); }
  const t = tex(c); t.repeat.set(1, 1); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.flipY = false;
  return t;
}

export function heightSignTex(inches) {
  const [c, g] = canvas(512, 330);
  g.fillStyle = '#ffd23f'; g.fillRect(0, 0, 512, 330);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center';
  g.font = 'bold 52px "Barlow Condensed", Arial, sans-serif';
  g.fillText('YOU MUST BE', 256, 70); g.fillText('THIS TALL', 256, 128);
  g.font = 'bold 34px "Barlow Condensed", Arial, sans-serif';
  g.fillText('TO RIDE', 256, 172);
  g.font = 'bold 96px "Barlow Condensed", Arial, sans-serif';
  g.fillStyle = '#c8222a'; g.fillText(`${inches}"`, 256, 280);
  const t = tex(c); t.repeat.set(1, 1); t.flipY = false; return t;
}

export function faceMat(t) { return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.0, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.12 }); }

// Ring of markers etc. use a round sprite texture.
export function markerTex(state, label) {
  const s = 128, [c, g] = canvas(s, s);
  const col = state === 'bad' ? '#ff4b3a' : state === 'ok' ? '#57d38c' : state === 'seen' ? '#ffd166' : '#ffffff';
  g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fillStyle = 'rgba(10,14,24,0.72)'; g.fill();
  g.lineWidth = 10; g.strokeStyle = col; g.stroke();
  g.fillStyle = col; g.font = 'bold 50px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(state === 'bad' ? '✕' : state === 'ok' ? '✓' : label, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
