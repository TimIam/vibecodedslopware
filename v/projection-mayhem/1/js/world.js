// The building: loads the Blender GLBs, dresses materials, paints the signs, places props, and answers the
// physical questions the rest of the game asks (where is the floor, what blocks me, how do I walk to X).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export let L = null;          // layout.json
export const W = {
  scene: null, lib: {}, shell: null, auds: {}, signs: {}, colliders: [], dyn: [], nav: null,
  interact: [],               // { obj (Object3D), kind, id, label(), act(), alt? }
  lights: {},
};

const loader = new GLTFLoader();
const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

// ------------------------------------------------------------------ procedural textures
function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const TEX = {};
function makeTextures() {
  TEX.carpet = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6e0d14'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < .5 ? '40,0,5' : '140,30,30'},${.15 + r() * .2})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = '#c9963a'; g.lineWidth = 3;
    for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]]) {
      g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx + 26, cy); g.lineTo(cx, cy + 26); g.lineTo(cx - 26, cy); g.closePath(); g.stroke();
      g.fillStyle = '#1d3a5a'; g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(201,150,58,.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  }, { repeat: true });
  TEX.carpetAud = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#26080c'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < .5 ? '0,0,0' : '90,20,30'},${.2 + r() * .2})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = 'rgba(200,140,40,.25)';
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 5, 0, 7); g.fill(); }
  }, { repeat: true });
  TEX.wallLobby = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a06c3c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,215,140,.35)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) {
      g.beginPath(); g.moveTo(x + 32, 0); g.lineTo(x + 32, h); g.stroke();
      for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(x, y + 32); g.quadraticCurveTo(x + 32, y, x + 64, y + 32); g.stroke(); }
    }
    const r = rng(3);
    for (let i = 0; i < 2000; i++) { g.fillStyle = `rgba(60,30,10,${r() * .08})`; g.fillRect(r() * w, r() * h, 3, 3); }
  }, { repeat: true });
  TEX.velvet = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#3a0408'); gr.addColorStop(.5, '#8a1320'); gr.addColorStop(1, '#3a0408');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: true });
  TEX.brick = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a3a30'; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let y = 0, row = 0; y < h; y += 16, row++) for (let x = -(row % 2) * 16; x < w; x += 32) {
      const v = 120 + r() * 50; g.fillStyle = `rgb(${v},${v * .38},${v * .26})`; g.fillRect(x + 1, y + 1, 30, 14);
    }
  }, { repeat: true });
  TEX.concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7d7a75'; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 5000; i++) { const v = 90 + r() * 70; g.fillStyle = `rgba(${v},${v},${v * .97},.25)`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: true });
  TEX.wood = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#5a2e14'; g.fillRect(0, 0, w, h);
    const r = rng(13);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,12,4,${.2 + r() * .3})`; g.lineWidth = 1 + r() * 2; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * .3, x - 6, h * .7, x + 3, h); g.stroke(); }
  }, { repeat: true });
}

// Triplanar world-space mapping for big boxy surfaces whose UVs are per-face 0..1 (Blender cube primitives).
function worldMap(m, tex, scale) {
  m.map = tex;
  m.color.set(0xffffff);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTriScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos; varying vec3 vTriN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed,1.0)).xyz; vTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos; varying vec3 vTriN; uniform float uTriScale;')
      .replace('#include <map_fragment>', `
        vec3 bw = abs(vTriN); bw = pow(bw, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 p = vTriPos * uTriScale;
        vec4 tx = texture2D(map, p.zy) * bw.x + texture2D(map, p.xz) * bw.y + texture2D(map, p.xy) * bw.z;
        diffuseColor *= tx;`);
  };
  m.needsUpdate = true;
}

// ------------------------------------------------------------------ signs
export function paintSign(name, w, h, draw) {
  const obj = W.signs[name];
  if (!obj) return;
  let tex = obj.userData.tex;
  if (!tex) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.flipY = false;
    obj.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    obj.userData.tex = tex;
  }
  const g = tex.image.getContext('2d');
  g.clearRect(0, 0, tex.image.width, tex.image.height);
  draw(g, tex.image.width, tex.image.height);
  tex.needsUpdate = true;
}
export function signTexture(name) { return W.signs[name]; }

function decoText(g, text, x, y, size, fill, { font = 'Georgia, serif', weight = 'bold', glow = null, align = 'center', stroke = null } = {}) {
  g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = glow; g.shadowBlur = size * .35; }
  if (stroke) { g.lineWidth = size * .08; g.strokeStyle = stroke; g.strokeText(text, x, y); }
  g.fillStyle = fill; g.fillText(text, x, y);
  g.shadowBlur = 0;
}
export { decoText };

// ------------------------------------------------------------------ load + build
export async function buildWorld(scene) {
  W.scene = scene;
  L = await (await fetch('layout.json')).json();
  makeTextures();
  const [shellG, libG] = await Promise.all([load('assets/shell.glb'), load('assets/library.glb')]);

  // library: keep each root as a template
  for (const o of [...libG.scene.children]) { W.lib[o.name] = o; }
  libG.scene.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const shell = shellG.scene;
  W.shell = shell;
  scene.add(shell);
  const matsDone = new Set();
  shell.traverse(o => {
    if (o.name.startsWith('aud_')) W.auds[+o.name.slice(4)] = o;
    if (o.isMesh) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (!matsDone.has(m)) { matsDone.add(m); dressMaterial(m); }
    }
    if (/^(sign_|menu_board|marquee_|blade_|coming_soon|soon_sign_|screen_no_|poster_)/.test(o.name)) W.signs[o.name] = o;
  });
  for (const o of Object.values(W.lib)) o.traverse(c => { if (c.isMesh) { const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach(m => { if (!matsDone.has(m)) { matsDone.add(m); dressMaterial(m); } }); } });

  buildLights(scene);
  placeProps(scene);
  buildColliders();
  buildNav();
  return W;
}

function dressMaterial(m) {
  const n = m.name;
  if (n === 'carpet') worldMap(m, TEX.carpet, 0.5);
  else if (n === 'carpet_aud') worldMap(m, TEX.carpetAud, 0.6);
  else if (n === 'wall_lobby') worldMap(m, TEX.wallLobby, 0.5);
  else if (n === 'brick') worldMap(m, TEX.brick, 0.5);
  else if (n === 'concrete') worldMap(m, TEX.concrete, 0.4);
  else if (n === 'wood' || n === 'wainscot') { worldMap(m, TEX.wood, 0.7); if (n === 'wainscot') m.color.set(0x8a5a3a); }
  else if (n === 'velvet' || n === 'wall_aud') { worldMap(m, TEX.velvet, n === 'velvet' ? 1.6 : 0.8); if (n === 'wall_aud') m.color.set(0x8a5560); }
  if (m.emissive && m.emissiveIntensity !== undefined && m.emissive.getHex() !== 0) m.toneMapped = true;
  if (n === 'glass') { m.transparent = true; m.opacity = 0.16; m.depthWrite = false; m.roughness = 0.05; m.metalness = 0.1; }
  if (n === 'screen') { m.color.set(0x111111); }
  if (n === 'bulb') m.emissiveIntensity = 1.6;
  if (n === 'lamp_warm') m.emissiveIntensity = 0.55;
  if (n === 'neon_red') m.emissiveIntensity = 1.6;
  if (n === 'aisle_light' || n === 'exit_green') m.emissiveIntensity = 0.8;
  if (n === 'wall_plain') m.color.multiplyScalar(0.6);
}

function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x2a1410, 0.55));
  const pl = (x, y, z, color, intensity, dist, name) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.set(x, y, z); scene.add(l); if (name) W.lights[name] = l; return l;
  };
  pl(0, 3.9, 6.5, 0xffc98a, 30, 16, 'lobby'); pl(0, 3.6, 10.2, 0xffc98a, 12, 9, 'lobby2');
  pl(-4.5, 2.6, 8, 0xffd6a0, 10, 7, 'box');
  pl(5, 2.6, 3.4, 0xffe0b0, 14, 8, 'con');
  pl(0, 2.6, -1.6, 0xffb070, 10, 14, 'hall');
  pl(-10, 5.2, -1.2, 0xbfd0ff, 6, 14, 'booth'); pl(10, 5.2, -1.2, 0xbfd0ff, 6, 14, 'booth2'); pl(0, 5.2, -0.4, 0xffe0c0, 6, 10, 'booth3');
  pl(-11, 2.8, 9, 0xfff0d0, 8, 7, 'office');
  pl(11, 3.1, 4, 0xe8f0ff, 10, 9, 'stock');
  pl(0, 2.6, 16, 0xffd0a0, 10, 14, 'street');
  // every auditorium gets a faint house light and a screen spill light (tinted by the picture)
  for (const a of L.auds) {
    W.lights['house_' + a.id] = pl(a.cx, 5.5, -9, 0xff9a60, 3, 14);
    W.lights['spill_' + a.id] = pl(a.cx, 3.2, -14.2, 0xffffff, 0, 16);
  }
  scene.fog = new THREE.Fog(0x05030a, 30, 70);
}

// ------------------------------------------------------------------ props
export function clone(name) {
  const t = W.lib[name];
  if (!t) { console.warn('missing asset', name); return new THREE.Group(); }
  return t.clone(true);
}
function put(name, x, y, z, ry = 0, s = 1) {
  const o = clone(name); o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); W.scene.add(o); return o;
}
export const P = {};   // named prop instances world/sim/booth use
function placeProps(scene) {
  const cc = L.conCounter, bc = L.boxCounter, bk = L.backCounter;
  P.regBox = put('register', -4.3, bc.h, bc.z0 + 0.3, Math.PI);
  P.regCon = put('register', 4.0, cc.h, cc.z0 + 0.3, Math.PI);
  P.popcorn = put('popcorn', 6.6, bk.h, (bk.z0 + bk.z1) / 2);
  P.popcornFill = P.popcorn.getObjectByName('popcorn_fill');
  P.soda = put('soda', 3.7, bk.h, (bk.z0 + bk.z1) / 2 + 0.05);
  put('cups', 4.8, bk.h, bk.z0 + 0.35); put('cups', 4.95, bk.h, bk.z0 + 0.3);
  for (let i = 0; i < 5; i++) put('bucket', 5.3 + i * 0.16, bk.h, bk.z0 + 0.3);
  P.computer = put('computer', L.computer.x, 0, L.computer.z, -Math.PI / 2);
  P.bench = put('bench', L.bench.x, L.booth.y, L.bench.z, -Math.PI / 2);
  P.pallet = put('pallet', L.pallet.x, 0, L.pallet.z);
  put('chandelier', 0, 4.25, 6.5); put('chandelier', 0, 4.25, 10.0, 0, 0.8);
  put('palm', -7.3, 0, 11.3); put('palm', 7.3, 0, 11.3); put('palm', 1.95, 0, 0.6);
  put('lobbybench', 7.4, 0, 8.0, -Math.PI / 2);
  put('trashbin', 1.9, 0, 6.6); put('trashbin', -2.4, 0, 1.0);
  // queue stanchions for the box office line
  for (const [x, z] of [[-3.5, 9.6], [-3.5, 10.6], [-2.5, 11.1]]) put('stanchion', x, 0, z);
  // candy display slots inside the glass case (6 kinds)
  P.candySlots = [];
  for (let i = 0; i < 6; i++) {
    const x = cc.x0 + 0.5 + i * 0.75;
    P.candySlots.push({ x, y: 0.74, z: (cc.z0 + cc.z1) / 2 + 0.1, items: [] });
  }
  // booth: film shelf near the bench
  P.shelfSpots = [];
  for (let i = 0; i < 8; i++) P.shelfSpots.push(new THREE.Vector3(-5.6 + (i % 4) * 0.9, L.booth.y + Math.floor(i / 4) * 0.2, 1.3));
  // street: a couple of parked decorations
  put('palm', -12, 0, 12.8); put('palm', 12, 0, 12.8);
}

// ------------------------------------------------------------------ colliders
// Boxes in world space; a mover collides if box.y1 > feet + STEP and box.y0 < feet + HEAD.
function C(x0, x1, z0, z1, y0 = 0, y1 = 8, tag) { const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, tag }; W.colliders.push(b); return b; }
function wallC(axis, fixed, u0, u1, y0, y1, gaps = [], t = 0.24) {
  const cuts = [u0, ...gaps.flat(), u1];
  for (let i = 0; i < cuts.length; i += 2) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a < 0.01) continue;
    if (axis === 'x') C(a, b, fixed - t / 2, fixed + t / 2, y0, y1); else C(fixed - t / 2, fixed + t / 2, a, b, y0, y1);
  }
}
function buildColliders() {
  const lob = L.lobby, hall = L.hall, off = L.office, sto = L.stock, st = L.stairs, A = L.aud, BY = L.booth.y;
  // lobby shell
  wallC('x', lob.z1, lob.x0, lob.x1, 0, 6, [L.frontDoor]);
  wallC('z', lob.x0, lob.z0 - 0.1, lob.z1, 0, 6, [off.door]);
  wallC('z', lob.x1, lob.z0 - 0.1, lob.z1, 0, 6, [sto.door]);
  wallC('x', 0, lob.x0, lob.x1, 0, 3.0, [L.arch]);
  for (const x of L.arch) C(x - 0.24, x + 0.24, 0.02, 0.5, 0, 3);
  // hall + booth
  wallC('x', 0, hall.x0, lob.x0, 0, 6.2); wallC('x', 0, lob.x1, hall.x1, 0, 6.2);
  wallC('z', hall.x0, hall.z0, 0, 0, 6.2); wallC('z', hall.x1, hall.z0, 0, 0, 6.2);
  const doors = L.auds.map(a => [a.cx + A.door.x0, a.cx + A.door.x1]);
  wallC('x', hall.z0, hall.x0, hall.x1, 0, 7, doors);
  // booth slab acts as ceiling for the hall (keeps the camera out of it) and as floor for the booth
  C(hall.x0, hall.x1, hall.z0, 0, 2.95, 3.2, 'slab');
  C(lob.x0, lob.x1, 0, L.booth.balconyZ1, 2.95, 3.2, 'slab');
  // balcony rail (gap at the stair top)
  C(st.x1 + 0.05, lob.x1, L.booth.balconyZ1 - 0.06, L.booth.balconyZ1 + 0.06, BY, BY + 1.1);
  // stairs: solid steps + the open-side handrail
  const n = st.steps, run = (st.zLow - st.zHigh) / n;
  for (let i = 0; i < n; i++) { const z0 = st.zLow - run * (i + 1); C(st.x0, st.x1, z0, z0 + run, 0, BY * (i + 1) / n, 'step'); }
  for (let i = 0; i < 8; i++) {
    const za = st.zLow - (st.zLow - st.zHigh) * i / 8, zb = st.zLow - (st.zLow - st.zHigh) * (i + 1) / 8;
    C(st.x1, st.x1 + 0.12, zb, za, BY * i / 8 + 0.3, BY * (i + 1) / 8 + 1.0);
  }
  // under the stairs from the lobby side (low part is a step, high part is a wall you walk under? no: closed)
  C(st.x1, st.x1 + 0.12, st.zHigh, st.zLow - 1.2, 0, 1.1);
  // office + stockroom
  wallC('x', off.z0, off.x0, off.x1, 0, 3.4); wallC('x', off.z1, off.x0, off.x1, 0, 3.4); wallC('z', off.x0, off.z0, off.z1, 0, 3.4);
  wallC('x', sto.z1, sto.x0, sto.x1, 0, 3.6); wallC('z', sto.x1, sto.z0, sto.z1, 0, 3.6); wallC('x', sto.z0, sto.x0, sto.x1, 0, 3.6);
  C(sto.x1 - 1.05, sto.x1, 0.3, 2.1, 0, 2.7); C(sto.x1 - 1.05, sto.x1, 5.9, 7.7, 0, 2.7);
  // counters
  const bc = L.boxCounter, cc = L.conCounter, bk = L.backCounter;
  C(bc.x0, bc.x1, bc.z0, bc.z1 + 0.05, 0, 2.4);
  C(cc.x0, cc.x1, cc.z0, cc.z1, 0, 1.1);
  C(bk.x0, bk.x1, bk.z0, bk.z1, 0, 1.3);
  C(L.computer.x - 0.45, L.computer.x + 0.45, L.computer.z - 0.85, L.computer.z + 0.85, 0, 1.2);
  C(L.bench.x - 0.35, L.bench.x + 0.35, L.bench.z - 0.75, L.bench.z + 0.75, BY, BY + 1.3);
  C(L.pallet.x - 0.6, L.pallet.x + 0.6, L.pallet.z - 0.55, L.pallet.z + 0.55, 0, 0.2);
  // auditoriums: side walls + front, the stage
  for (const a of L.auds) {
    const x0 = a.cx - A.w / 2, x1 = a.cx + A.w / 2;
    C(x0, x0 + 0.25, A.z1, A.z0, 0, 7); C(x1 - 0.25, x1, A.z1, A.z0, 0, 7);
    C(x0, x1, A.z1 - 0.2, A.z1 + 1.45, 0, 0.62, 'stage');
    a.soonC = C(a.cx + A.door.x0 - 0.2, a.cx + A.door.x1 + 0.2, hall.z0 - 0.15, hall.z0 + 0.2, 0, 3, 'soon');
    // seat rows (with the aisle on the right kept free)
    for (const zr of A.rows) C(a.cx + A.seatX0 - 0.32, a.cx + A.seatX0 + (A.seats - 1) * A.seatDX + 0.34, zr - 0.05, zr + 0.33, 0, 1.05, 'seats');
  }
  // street edge
  C(-30, 30, 17.6, 18, 0, 4); C(-14.2, -13.8, 12, 18, 0, 4); C(13.8, 14.2, 12, 18, 0, 4);
  C(-14, lob.x0, 11.9, 12.4, 0, 9); C(lob.x1, 14, 11.9, 12.4, 0, 9);
}
export function addCollider(x0, x1, z0, z1, y0, y1, tag) { return C(x0, x1, z0, z1, y0, y1, tag); }
export function removeCollider(b) { const i = W.colliders.indexOf(b); if (i >= 0) W.colliders.splice(i, 1); }

export function floorAt(x, z, feet) {
  const st = L.stairs, BY = L.booth.y, hall = L.hall, lob = L.lobby;
  let best = 0;
  const cand = y => { if (y <= feet + 0.55 && y > best) best = y; };
  if (x >= st.x0 - 0.05 && x <= st.x1 + 0.05 && z >= st.zHigh - 0.05 && z <= st.zLow) cand(BY * Math.min(1, Math.max(0, (st.zLow - z) / (st.zLow - st.zHigh))));
  if (x >= hall.x0 && x <= hall.x1 && z >= hall.z0 && z <= 0) cand(BY);
  if (x >= lob.x0 && x <= lob.x1 && z >= 0 && z <= L.booth.balconyZ1 + 0.02) cand(BY);
  return best;
}

// Move a circle of radius r at feet height y from (x,z) by (dx,dz), sliding along boxes. Returns new [x,z].
export function moveCircle(x, z, dx, dz, r, feet, head = 1.7) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let s = 0; s < steps; s++) {
    x += dx / steps; z += dz / steps;
    for (let it = 0; it < 2; it++) {
      for (const b of W.colliders) {
        if (b.disabled) continue;
        if (b.y1 <= feet + 0.45 || b.y0 >= feet + head) continue;
        const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
        const ox = x - cx, oz = z - cz, d2 = ox * ox + oz * oz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (r - d) / d; x += ox * p; z += oz * p; }
          else { // centre inside the box: push out along the shallowest axis
            const pl = x - b.x0, pr = b.x1 - x, pb = z - b.z0, pf = b.z1 - z, m = Math.min(pl, pr, pb, pf);
            if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r; else if (m === pb) z = b.z0 - r; else z = b.z1 + r;
          }
        }
      }
    }
  }
  return [x, z];
}

// ------------------------------------------------------------------ navigation graph (for the little people)
function buildNav() {
  const N = {}, E = [];
  const n = (id, x, z) => { N[id] = { id, x, z, adj: [] }; };
  const e = (a, b) => { E.push([a, b]); };
  const A = L.aud;
  n('street_l', -22, 14.6); n('street_r', 22, 14.6); n('door_out', 0, 13.3); n('door_in', 0, 10.9);
  n('lobby_front', 0, 9.6); n('lobby_mid', 0, 6.8); n('lobby_back', -0.2, 3.0);
  n('box_front', -4.3, 9.75); n('box_side', -6.9, 9.75); n('box_staff', -4.3, 7.85); n('box_back', -6.9, 7.85);
  n('office_door', -7.4, 8.6); n('office_in', -8.7, 8.6); n('computer', -10.8, 9.2);
  n('con_front', 4.0, 5.6); n('con_gate', 2.0, 4.6); n('con_gate_in', 2.1, 3.3); n('con_staff', 4.0, 3.5);
  n('popcorn', 6.4, 2.0); n('soda', 3.7, 2.0); n('stock_door', 7.5, 2.4); n('stock_in', 8.7, 2.4); n('pallet', 10.2, 5.0); n('stock_mid', 10.5, 2.4);
  n('arch_out', -0.2, 1.0); n('arch_in', -0.2, -1.0);
  n('stairs_bot', -7.15, 7.75); n('stairs_top', -7.15, 1.45);
  n('booth_mid', -0.2, 0.9); n('bench', 6.6, 0.9);
  e('street_l', 'door_out'); e('street_r', 'door_out'); e('door_out', 'door_in'); e('door_in', 'lobby_front');
  e('lobby_front', 'lobby_mid'); e('lobby_mid', 'lobby_back'); e('lobby_back', 'arch_out'); e('arch_out', 'arch_in');
  e('lobby_front', 'box_front'); e('box_front', 'box_side'); e('box_side', 'box_back'); e('box_back', 'box_staff'); e('box_back', 'office_door');
  e('office_door', 'office_in'); e('office_in', 'computer'); e('box_side', 'stairs_bot'); e('lobby_mid', 'stairs_bot');
  e('lobby_mid', 'con_front'); e('lobby_front', 'con_front'); e('lobby_mid', 'con_gate'); e('con_gate', 'con_gate_in'); e('con_gate_in', 'con_staff');
  e('con_staff', 'popcorn'); e('con_staff', 'soda'); e('con_staff', 'stock_door'); e('popcorn', 'stock_door'); e('stock_door', 'stock_in'); e('stock_in', 'stock_mid'); e('stock_mid', 'pallet');
  e('stairs_bot', 'stairs_top'); e('stairs_top', 'booth_mid'); e('booth_mid', 'bench');
  let prevHall = null;
  const sorted = [...L.auds].sort((a, b) => a.cx - b.cx);
  for (const a of sorted) {
    const k = a.id, x = a.cx + A.aisleX;
    n('hall_' + k, x, -1.6); n('audin_' + k, x, -4.3);
    n('proj_' + k, a.cx, 0.15);   // booth floor spot behind this screen's projectors (y = booth)
    N['proj_' + k].booth = true;
    e('hall_' + k, 'audin_' + k);
    if (prevHall) { e(prevHall, 'hall_' + k); }
    prevHall = 'hall_' + k;
    let prev = 'audin_' + k;
    A.rows.slice().reverse().forEach((zr, i) => { const id = `row_${k}_${i}`; n(id, x, zr + 0.62); e(prev, id); prev = id; });
  }
  // connect the arch to the two nearest hall nodes
  const halls = sorted.map(a => 'hall_' + a.id);
  for (const h of halls) if (Math.abs(N[h].x) < 8) e('arch_in', h);
  // booth walkway: chain of projector spots + the balcony
  const projs = sorted.map(a => 'proj_' + a.id);
  for (let i = 1; i < projs.length; i++) e(projs[i - 1], projs[i]);
  for (const p of projs) if (Math.abs(N[p].x) < 8) e('booth_mid', p);
  N.stairs_top.booth = N.booth_mid.booth = N.bench.booth = true;
  for (const [a, b] of E) { const d = Math.hypot(N[a].x - N[b].x, N[a].z - N[b].z); N[a].adj.push([b, d]); N[b].adj.push([a, d]); }
  W.nav = N;
}

export function navPath(from, to) {
  const N = W.nav;
  if (!N[from] || !N[to]) return [];
  const dist = { [from]: 0 }, prev = {}, open = new Set([from]);
  while (open.size) {
    let u = null, best = Infinity;
    for (const k of open) if (dist[k] < best) { best = dist[k]; u = k; }
    open.delete(u);
    if (u === to) break;
    for (const [v, d] of N[u].adj) {
      const nd = dist[u] + d;
      if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; open.add(v); }
    }
  }
  const out = []; let c = to;
  while (c) { out.unshift(c); c = prev[c]; if (c === from) { out.unshift(c); break; } }
  return out[0] === from ? out : [];
}
export function nearestNode(x, z, booth = null) {
  let best = null, bd = Infinity;
  for (const k in W.nav) { const nd = W.nav[k]; if (booth !== null && !!nd.booth !== booth) continue; const d = Math.hypot(nd.x - x, nd.z - z); if (d < bd) { bd = d; best = k; } }
  return best;
}

// ------------------------------------------------------------------ auditorium visibility
export function setAudUnlocked(k, on) {
  const a = L.auds.find(a => a.id === k);
  for (const nm of [`aud_${k}`, `screen_${k}`]) { const o = W.shell.getObjectByName(nm); if (o) o.visible = on; }
  for (const nm of [`soon_${k}`, `soon_sign_${k}`]) { const o = W.shell.getObjectByName(nm); if (o) o.visible = !on; }
  const door = W.shell.getObjectByName(`door_${k}`);
  if (door) door.visible = !on;
  if (a?.soonC) a.soonC.disabled = on;
  W.lights['house_' + k].visible = on;
  W.lights['spill_' + k].visible = on;
}
