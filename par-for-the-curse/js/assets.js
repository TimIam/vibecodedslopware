// Loads the Blender-built GLBs and turns their materials into cel-shaded toon materials with ink
// outlines. Every asset is looked up by object name; a crude stand-in is used if one is missing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const tones = new Uint8Array([105, 105, 175, 175, 235, 235, 255, 255]);
export const gradientMap = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false; gradientMap.needsUpdate = true;

const matCache = new Map();
export function toon(color, o = {}) {
  const key = new THREE.Color(color).getHexString() + JSON.stringify(o);
  if (!o.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...o.params });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (!o.unique) matCache.set(key, m);
  return m;
}

const outlineCache = new Map();
export function outlineMat(thick, color = 0x2b2233) {
  const key = thick + ':' + color;
  if (outlineCache.has(key)) return outlineCache.get(key);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uThick: { value: thick } }]),
    vertexShader: `
      uniform float uThick;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position + normal * uThick;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      #include <fog_pars_fragment>
      void main(){
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
  });
  outlineCache.set(key, m);
  return m;
}

// Give a mesh (or every mesh in a tree) an inverted-hull ink outline.
export function addOutline(root, thick = 0.02, color) {
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline) meshes.push(o); });
  for (const m of meshes) {
    const ol = new THREE.Mesh(m.geometry, outlineMat(thick, color));
    ol.userData.isOutline = true; ol.castShadow = false; ol.receiveShadow = false;
    ol.raycast = () => {};
    m.add(ol);
  }
  return root;
}

// Material colour tweaks: the GLB colours come from Blender; nudge some for the toon ramp.
function convertMaterial(src, hasVC) {
  const c = src.color ? src.color.clone() : new THREE.Color(0xffffff);
  const name = (src.name || '').toLowerCase();
  const params = {};
  if (hasVC) params.vertexColors = true;
  const opts = { params };
  if (/gold|crown|trophy/.test(name)) { opts.emissive = c.clone().multiplyScalar(0.18); }
  if (/bumper_top|glow|lamp|light/.test(name)) { opts.emissive = c.clone(); opts.emissiveIntensity = 0.7; }
  if (/eye$|^eye|mouth/.test(name)) { const m = new THREE.MeshBasicMaterial({ color: c }); m.name = src.name; return m; }
  if (/eyewhite/.test(name)) { const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); m.name = src.name; return m; }
  const m = toon(c, opts);
  const out = matCache.get('named:' + name + c.getHexString() + hasVC) || m.clone();
  out.name = src.name;
  matCache.set('named:' + name + c.getHexString() + hasVC, out);
  return out;
}

export const lib = new Map();     // name -> Object3D template
export const manifest = {};

export async function loadAssets(base, onProgress) {
  const loader = new GLTFLoader();
  const files = ['golfer', 'clubs', 'props'];
  let done = 0;
  await Promise.all(files.map(async f => {
    try {
      const [gltf, json] = await Promise.all([
        loader.loadAsync(`${base}/${f}.glb`),
        fetch(`${base}/${f}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
      manifest[f] = json;
      for (const child of [...gltf.scene.children]) {
        child.traverse(o => {
          if (!o.isMesh) return;
          const hasVC = !!o.geometry.attributes.color;
          o.material = Array.isArray(o.material) ? o.material.map(m => convertMaterial(m, hasVC)) : convertMaterial(o.material, hasVC);
          o.castShadow = true; o.receiveShadow = true;
        });
        lib.set(child.name, child);
      }
    } catch (e) { console.warn('asset file missing', f, e.message); manifest[f] = {}; }
    done++; onProgress && onProgress(done / files.length);
  }));
}

// Clone an asset by name. opts.outline: ink thickness (0 for none). opts.unique: clone materials for recolouring.
export function make(name, opts = {}) {
  const t = lib.get(name);
  let o;
  if (t) {
    o = t.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    if (opts.unique) o.traverse(m => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone(); });
  } else o = standIn(name);
  if (opts.outline) addOutline(o, opts.outline);
  o.name = name;
  return o;
}
export const has = name => lib.has(name);

// Recolour every material whose name matches.
export function tint(root, name, color) {
  root.traverse(o => {
    if (!o.isMesh || o.userData.isOutline) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if ((m.name || '').toLowerCase() === name && m.color) m.color.set(color);
  });
}

// Crude stand-ins so the game still runs if an asset is missing.
function standIn(name) {
  const g = new THREE.Group();
  const add = (geo, color, y = 0) => { const m = new THREE.Mesh(geo, toon(color)); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  if (name.startsWith('tree')) { add(new THREE.CylinderGeometry(0.2, 0.3, 2.5), 0x8a5a33, 1.25); add(new THREE.SphereGeometry(1.6, 12, 10), 0x4caf50, 3.4); }
  else if (name === 'bush') add(new THREE.SphereGeometry(0.6, 10, 8), 0x3e9d47, 0.4);
  else if (name.startsWith('rock') || name === 'under_rock') { const m = add(new THREE.DodecahedronGeometry(name === 'under_rock' ? 0.5 : 0.8), 0x8d8379, name === 'under_rock' ? -0.5 : 0.5); if (name === 'under_rock') m.scale.set(1, 1, 1); }
  else if (name.startsWith('cloud')) { for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(2 + Math.random() * 1.5, 10, 8), 0xffffff, 0).position.set(i * 2 - 4, Math.random(), 0); }
  else if (name === 'flagpole') add(new THREE.CylinderGeometry(0.025, 0.025, 2.2), 0xffffff, 1.1);
  else if (name === 'flag_cloth') { const m = add(new THREE.PlaneGeometry(0.8, 0.5, 8, 5), 0xff3355); m.material = toon(0xff3355, { params: { side: THREE.DoubleSide } }); m.position.set(0.4, -0.25, 0); }
  else if (name === 'mushroom') { add(new THREE.CylinderGeometry(0.4, 0.5, 1), 0xf3ead8, 0.5); add(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe53935, 0.6).scale.y = 0.4; }
  else if (name === 'bumper') add(new THREE.CylinderGeometry(0.8, 0.8, 0.7, 20), 0xff4fa3, 0.35);
  else if (name === 'goose') { add(new THREE.SphereGeometry(0.25, 10, 8), 0xffffff, 0.35); add(new THREE.CylinderGeometry(0.05, 0.06, 0.35), 0xffffff, 0.65); }
  else if (name.startsWith('club_')) { const len = { club_driver: 0.8, club_iron: 0.72, club_wedge: 0.68, club_putter: 0.6 }[name] || 0.7; add(new THREE.CylinderGeometry(0.012, 0.012, len), 0xcccccc, -len / 2); add(new THREE.BoxGeometry(0.1, 0.05, 0.05), 0x333344, -len); }
  else if (name.startsWith('hand')) add(new THREE.SphereGeometry(0.05, 10, 8), 0xffffff, -0.04);
  else if (name === 'head') { add(new THREE.SphereGeometry(0.2, 16, 12), 0xf2c29b, 0.2); }
  else if (name === 'torso') add(new THREE.CapsuleGeometry(0.15, 0.1, 6, 12), 0x3d7bf7, 0.15);
  else if (name === 'hips') add(new THREE.CylinderGeometry(0.15, 0.14, 0.14, 14), 0xf4f1e8, -0.05);
  else if (name === 'upper_arm' || name === 'forearm') add(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), 0xf2c29b, -0.07);
  else if (name === 'thigh' || name === 'shin') add(new THREE.CapsuleGeometry(0.05, 0.08, 4, 8), 0xf2c29b, -0.06);
  else if (name.startsWith('shoe')) add(new THREE.BoxGeometry(0.1, 0.06, 0.16), 0x333333, -0.03);
  else if (name === 'spire') add(new THREE.CylinderGeometry(9, 20, 130, 14, 6), 0xb98a5e, 20);
  else if (name === 'trophy') add(new THREE.CylinderGeometry(0.5, 0.2, 1.5), 0xffc83d, 0.75);
  else if (name === 'cup_rim') add(new THREE.TorusGeometry(0.25, 0.02, 6, 20).rotateX(Math.PI / 2), 0xffffff, 0);
  else add(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0xff00ff, 0.25);
  return g;
}
