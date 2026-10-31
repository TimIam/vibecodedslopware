// Bear Run: an endless downhill ski run with a bear on your tail.
// Everything is built from code (no model files): low-poly, vertex-coloured, flat shaded.
// World: metres, +Y up, downhill is -Z. Heading 0 points straight downhill.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

// ---------- tuning ----------
const SLOPE = 0.3;            // terrain drops 0.3 m per metre downhill
const G_ALONG = 9.8 * Math.sin(Math.atan(SLOPE));
const CHUNK = 50;             // chunk length along Z
const WIDTH = 130;            // ground width
const EDGE = 38;              // beyond |x| > EDGE the run banks up into forest
const AHEAD = 6, BEHIND = 2;  // chunks kept ahead of / behind the player
const BEAR_WAKES = 200;       // metres before the bear joins
// Riding model, shared by every ride. The rider has a facing (heading, where the skis, board,
// sled or paws point) and a travel direction (vdir). Steering turns the facing; the edges drag the
// travel direction after it, more slowly the faster you go. The difference is the slip angle: hold
// more than fallSlip while moving faster than fallSpeed for FALL_GRACE seconds and you fall. Below
// fallSpeed you only skid. Each ride tunes the numbers; unlocks are by the farthest distance ever
// reached in one run, saved in the browser.
const FALL_GRACE = 0.15;
const SCREAM_COOLDOWN = 7;    // seconds between screams the chaser will listen to
const SCREAM_FLINCH = 1.1;    // how long a scream stops the chaser
const RIDES = {
  skis: { name: 'Skis', icon: '\u26f7\ufe0f', unlock: 0, kind: 'skis',
    accel: 4.0, friction: 0.2, drag: 0.0055, dragTuck: 0.0038, tuck: 1.2, push: 4.5, pushMax: 15, stroke: true, plough: 6,
    fallSlip: 10, fallSpeed: 11, landSlip: 30, steer: 2.8, steerFade: 25, grip: 2.8, gripFade: 14, spin: 6.5, bodyR: 0.35, scrub: 1.5,
    chase: { base: 18, cap: 30 }, pursuer: 'bear',
    blurb: 'Tap to carve. Hold a turn at speed and the skis slide 10\u00b0 off your line, and down you go.',
    controls: '<kbd>W</kbd> pole push \u00b7 <kbd>S</kbd> snowplough \u00b7 <kbd>Shift</kbd> tuck \u00b7 <kbd>E</kbd> scream' },
  snowboard: { name: 'Snowboard', icon: '\ud83c\udfc2', unlock: 2000, kind: 'board',
    accel: 4.0, friction: 0.25, drag: 0.005, dragTuck: 0.0036, tuck: 1.0, push: 2.5, pushMax: 8, stroke: true, plough: 7,
    fallSlip: 14, fallSpeed: 9, landSlip: 40, steer: 3.4, steerFade: 22, grip: 3.0, gripFade: 16, spin: 8.5, bodyR: 0.35, scrub: 0.7,
    chase: { base: 18, cap: 30 }, pursuer: 'bear',
    blurb: 'Quicker spins and an edge that holds, until it catches: 14\u00b0 off your line above 32 km/h and you eat snow.',
    controls: '<kbd>W</kbd> skate push \u00b7 <kbd>S</kbd> heel-side scrub \u00b7 <kbd>Shift</kbd> tuck \u00b7 <kbd>E</kbd> scream' },
  snowmobile: { name: 'Snowmobile', icon: '\ud83d\udef7', unlock: 5000, kind: 'sled',
    accel: 1.5, friction: 0.6, drag: 0.0028, dragTuck: 0.0028, tuck: 0, push: 9, pushMax: 42, stroke: false, plough: 10,
    fallSlip: 24, fallSpeed: 13, landSlip: 45, steer: 2.0, steerFade: 30, grip: 1.9, gripFade: 18, spin: 3, bodyR: 0.7, scrub: 1.2,
    chase: { base: 22, cap: 36 }, pursuer: 'bear',
    blurb: 'Hold W for throttle. Heavy and fast; yank it past 24\u00b0 at speed and it rolls.',
    controls: '<kbd>W</kbd> throttle \u00b7 <kbd>S</kbd> brake \u00b7 <kbd>E</kbd> scream' },
  bear: { name: 'Bear', icon: '\ud83d\udc3b', unlock: 10000, kind: 'bear',
    accel: 2.0, friction: 0.5, drag: 0.004, dragTuck: 0.004, tuck: 0, push: 7, pushMax: 24, stroke: false, plough: 9,
    fallSlip: 40, fallSpeed: 14, landSlip: 60, steer: 3.2, steerFade: 40, grip: 3.0, gripFade: 40, spin: 4, bodyR: 0.6, scrub: 1.5,
    chase: { base: 17, cap: 28 }, pursuer: 'yeti',
    blurb: 'Paws grip anything. Something higher up the food chain has noticed.',
    controls: '<kbd>W</kbd> sprint \u00b7 <kbd>S</kbd> dig in \u00b7 <kbd>E</kbd> roar' },
};
const PURSUERS = { bear: { name: 'Bear', icon: '\ud83d\udc3b', a: 'A bear!' }, yeti: { name: 'Yeti', icon: '\ud83e\udd8d', a: 'A yeti!' } };
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xc9dbea);
scene.fog = new THREE.Fog(FOG, 45, 165);
scene.background = FOG.clone();

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x7d8ea6, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_OFFSET = new V3(-28, 55, 18);

// Sky dome: gradient, follows the camera.
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f78c0) }, mid: { value: new THREE.Color(0x9cc0e2) }, bot: { value: new THREE.Color(0xdfe9f3) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, mid, bot; varying vec3 vP;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(bot, mid, smoothstep(-0.05, 0.08, h));
        gl_FragColor = vec4(c, 1.); }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// ---------- helpers ----------
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function M(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(new V3(x, y, z), _q.clone().setFromEuler(_e.set(rx, ry, rz)), new V3(sx, sy, sz));
}
// One vertex-coloured, non-indexed piece.
function piece(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o); nor.set(p.attributes.normal.array, o); col.set(p.attributes.color.array, o);
    o += p.attributes.position.count * 3; p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const toonMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });
function shadowy(o) { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }

// ---------- terrain ----------
function height(x, z) {
  let h = z * SLOPE
    + 1.1 * Math.sin(x * 0.07 + z * 0.021)
    + 0.7 * Math.sin(z * 0.093 - x * 0.041)
    + 0.3 * Math.sin(x * 0.19 + z * 0.17);
  const e = Math.abs(x) - EDGE;
  if (e > 0) h += e * e * 0.035;
  return h;
}
function normalAt(x, z, out) {
  const d = 0.5;
  return out.set(height(x - d, z) - height(x + d, z), 2 * d, height(x, z - d) - height(x, z + d)).normalize();
}
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
const SNOW_A = new THREE.Color(0xffffff), SNOW_B = new THREE.Color(0xc9daec), _c = new THREE.Color(), _n = new V3();
function groundGeometry(i) {
  const g = new THREE.PlaneGeometry(WIDTH, CHUNK, 64, 26);
  g.rotateX(-Math.PI / 2);
  const zc = -(i + 0.5) * CHUNK;
  const p = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k) + zc;
    p.setXYZ(k, x, height(x, z), z);
    normalAt(x, z, _n); nrm.setXYZ(k, _n.x, _n.y, _n.z);
    // Bluer in hollows and on the banks, a little grain everywhere.
    const grain = (Math.sin(x * 1.7 + z * 2.3) * Math.sin(x * 0.9 - z * 1.3)) * 0.12;
    const t = THREE.MathUtils.clamp(0.25 + (1 - _n.y) * 3 + grain + Math.max(0, Math.abs(x) - EDGE) * 0.02, 0, 1);
    _c.copy(SNOW_A).lerp(SNOW_B, t);
    col[k * 3] = _c.r; col[k * 3 + 1] = _c.g; col[k * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// ---------- props (shared geometry) ----------
function coneLayer(parts, r, h, y, green) {
  parts.push(piece(new THREE.ConeGeometry(r, h, 7), green, M(0, y, 0, 1, 1, 1, 0, Math.random() * 3)));
  parts.push(piece(new THREE.ConeGeometry(r * 0.56, h * 0.42, 7), 0xf6f9fc, M(0, y + h * 0.29 + 0.02, 0, 1.05, 1, 1.05)));
}
function makeTree() {
  const parts = [piece(new THREE.CylinderGeometry(0.16, 0.24, 1.3, 6), 0x5b3d27, M(0, 0.65, 0))];
  coneLayer(parts, 1.65, 2.3, 1.9, 0x24503a);
  coneLayer(parts, 1.25, 2.0, 3.05, 0x2b5d42);
  coneLayer(parts, 0.85, 1.7, 4.1, 0x326a4a);
  parts.push(piece(new THREE.CylinderGeometry(1.5, 1.7, 0.18, 7), 0xe9f1f8, M(0, 0.05, 0)));
  return merge(parts);
}
function makeRock() {
  return merge([
    piece(new THREE.DodecahedronGeometry(1, 0), 0x737b86, M(0, 0.25, 0, 1.25, 0.75, 1.0, 0.3, 0.4, 0.1)),
    piece(new THREE.DodecahedronGeometry(0.85, 0), 0xf3f7fb, M(0.05, 0.62, 0, 1.15, 0.3, 0.92, 0.3, 0.4, 0.1)),
  ]);
}
function makeStump() {
  return merge([
    piece(new THREE.CylinderGeometry(0.42, 0.5, 0.6, 8), 0x6a4a31, M(0, 0.3, 0)),
    piece(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 8), 0xf3f7fb, M(0, 0.63, 0)),
  ]);
}
const TREE = makeTree(), ROCK = makeRock(), STUMP = makeStump();

function makeRamp() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(merge([
    piece(new THREE.BoxGeometry(3, 0.18, 4.4), 0xa6d6f5, M(0, 0, 0)),
    piece(new THREE.BoxGeometry(0.16, 0.34, 4.4), 0xe86a3a, M(-1.55, 0.08, 0)),
    piece(new THREE.BoxGeometry(0.16, 0.34, 4.4), 0xe86a3a, M(1.55, 0.08, 0)),
  ]), toonMat);
  deck.rotation.x = 0.26; // -Z end up (downhill end is the lip)
  deck.position.y = 2.2 * Math.sin(0.26) + 0.05;
  const base = new THREE.Mesh(merge([
    piece(new THREE.BoxGeometry(3, 1.0, 1.4), 0xeef4f9, M(0, 0.15, -1.6)),
    piece(new THREE.BoxGeometry(3, 0.6, 1.6), 0xeef4f9, M(0, -0.05, 0)),
  ]), toonMat);
  g.add(deck, base);
  return shadowy(g);
}
const FLAG_GEO = (() => {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.75, -0.22); s.lineTo(0, -0.46);
  return new THREE.ShapeGeometry(s);
})();
function makeGate(color) {
  const g = new THREE.Group();
  const flagMat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    pole.position.set(sx * 3, 0.95, 0);
    const flag = new THREE.Mesh(FLAG_GEO, flagMat);
    flag.position.set(sx * 3 + 0.04, 1.85, 0);
    flag.rotation.y = sx > 0 ? Math.PI : 0;
    g.add(pole, flag);
  }
  g.userData.flagMat = flagMat;
  return shadowy(g);
}

// ---------- rider and rides ----------
// Forward is -Z for every ride. A NEGATIVE rotation.x on the rider's body bends it forward.
function makeRider(withPoles) {
  const body = new THREE.Group();
  const bodyMesh = new THREE.Mesh(merge([
    piece(new THREE.BoxGeometry(0.16, 0.2, 0.3), 0x22282e, M(-0.13, 0.15, 0)),
    piece(new THREE.BoxGeometry(0.16, 0.2, 0.3), 0x22282e, M(0.13, 0.15, 0)),
    piece(new THREE.BoxGeometry(0.17, 0.62, 0.2), 0x1e2f55, M(-0.13, 0.52, -0.04, 1, 1, 1, -0.22)),
    piece(new THREE.BoxGeometry(0.17, 0.62, 0.2), 0x1e2f55, M(0.13, 0.52, -0.04, 1, 1, 1, -0.22)),
    piece(new THREE.BoxGeometry(0.46, 0.6, 0.28), 0xd8352c, M(0, 1.08, 0.02, 1, 1, 1, -0.18)),
    piece(new THREE.BoxGeometry(0.47, 0.08, 0.29), 0xf2f2f2, M(0, 0.93, 0.0, 1, 1, 1, -0.18)),
    piece(new THREE.BoxGeometry(0.3, 0.32, 0.12), 0x2d6f9a, M(0, 1.12, 0.2, 1, 1, 1, -0.18)),
    piece(new THREE.BoxGeometry(0.12, 0.55, 0.13), 0xd8352c, M(-0.3, 1.04, -0.08, 1, 1, 1, 0.5, 0, 0.18)),
    piece(new THREE.BoxGeometry(0.12, 0.55, 0.13), 0xd8352c, M(0.3, 1.04, -0.08, 1, 1, 1, 0.5, 0, -0.18)),
    piece(new THREE.BoxGeometry(0.13, 0.13, 0.13), 0x22282e, M(-0.34, 0.82, -0.26)),
    piece(new THREE.BoxGeometry(0.13, 0.13, 0.13), 0x22282e, M(0.34, 0.82, -0.26)),
    piece(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8), 0xf2c9a5, M(0, 1.43, -0.04)),
    piece(new THREE.SphereGeometry(0.16, 10, 8), 0xf2c9a5, M(0, 1.58, -0.05)),
    piece(new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x1f8a7a, M(0, 1.6, -0.03)),
    piece(new THREE.SphereGeometry(0.07, 8, 6), 0xf6f6f6, M(0, 1.79, 0.0)),
    piece(new THREE.BoxGeometry(0.3, 0.08, 0.06), 0xffa51f, M(0, 1.6, -0.2)),
  ]), toonMat);
  body.add(bodyMesh);
  const poles = [];
  if (withPoles) {
    // Poles hang from the hands and swing from there for a push.
    const poleGeo = merge([
      piece(new THREE.CylinderGeometry(0.012, 0.012, 1.15, 5), 0xb9c3cc, M(0, -0.55, 0)),
      piece(new THREE.TorusGeometry(0.05, 0.01, 4, 8), 0x22282e, M(0, -1.05, 0, 1, 1, 1, Math.PI / 2)),
    ]);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.34, 0.82, -0.26);
      const m = new THREE.Mesh(poleGeo, toonMat); m.rotation.z = -sx * 0.12; pivot.add(m);
      pivot.rotation.x = 0.55;
      body.add(pivot); poles.push(pivot);
    }
  }
  return { body, poles };
}
function makeSkier() {
  const root = new THREE.Group();
  // One ski, centred on its binding so it can pivot into a snowplough.
  const skiGeo = merge([
    piece(new THREE.BoxGeometry(0.11, 0.04, 1.75), 0xffc21a, M(0, 0.03, -0.05)),
    piece(new THREE.BoxGeometry(0.11, 0.04, 0.22), 0xffc21a, M(0, 0.08, -0.95, 1, 1, 1, 0.5)),
  ]);
  const skis = new THREE.Group();
  const skiL = new THREE.Mesh(skiGeo, toonMat), skiR = new THREE.Mesh(skiGeo, toonMat);
  skiL.position.x = -0.13; skiR.position.x = 0.13;
  skis.add(skiL, skiR);
  const { body, poles } = makeRider(true);
  root.add(skis, body);
  root.userData = { kind: 'skis', body, skis, skiL, skiR, poles };
  return shadowy(root);
}
function makeBoarder() {
  const root = new THREE.Group();
  const board = new THREE.Mesh(merge([
    piece(new THREE.BoxGeometry(0.3, 0.035, 1.5), 0x2d6f9a, M(0, 0.03, 0)),
    piece(new THREE.BoxGeometry(0.3, 0.035, 0.2), 0x2d6f9a, M(0, 0.07, -0.82, 1, 1, 1, 0.45)),
    piece(new THREE.BoxGeometry(0.3, 0.035, 0.2), 0x2d6f9a, M(0, 0.07, 0.82, 1, 1, 1, -0.45)),
    piece(new THREE.BoxGeometry(0.31, 0.01, 0.5), 0xffc21a, M(0, 0.052, 0)),
  ]), toonMat);
  const skis = new THREE.Group(); skis.add(board);
  // Sideways stance: the rider stands across the board, chest a little toward the nose.
  const stance = new THREE.Group(); stance.rotation.y = 1.05;
  const { body, poles } = makeRider(false);
  stance.add(body); root.add(skis, stance);
  root.userData = { kind: 'board', body, skis, skiL: null, skiR: null, poles };
  return shadowy(root);
}
function makeSnowmobile(colour) {
  const root = new THREE.Group(), hull = new THREE.Group();
  hull.add(new THREE.Mesh(merge([
    piece(new THREE.BoxGeometry(0.75, 0.32, 2.2), colour, M(0, 0.48, 0.05)),
    piece(new THREE.BoxGeometry(0.72, 0.26, 0.95), colour, M(0, 0.68, -0.72, 1, 1, 1, 0.28)),
    piece(new THREE.BoxGeometry(0.5, 0.16, 1.05), 0x22282e, M(0, 0.72, 0.4)),
    piece(new THREE.BoxGeometry(0.42, 0.3, 1.5), 0x1a1d21, M(0, 0.17, 0.45)),
    piece(new THREE.BoxGeometry(0.6, 0.36, 0.03), 0xbfe3ff, M(0, 1.02, -0.55, 1, 1, 1, -0.35)),
    piece(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), 0x22282e, M(0, 0.98, -0.32, 1, 1, 1, 0, 0, Math.PI / 2)),
    piece(new THREE.BoxGeometry(0.2, 0.06, 0.1), 0xffe397, M(0, 0.72, -1.2)),
  ]), toonMat));
  const skiGeo = merge([
    piece(new THREE.BoxGeometry(0.16, 0.05, 0.95), 0x22282e, M(0, 0.03, -0.05)),
    piece(new THREE.BoxGeometry(0.16, 0.05, 0.2), 0x22282e, M(0, 0.07, -0.55, 1, 1, 1, 0.5)),
    piece(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), 0x8a9099, M(0, 0.22, 0.05)),
  ]);
  const skiL = new THREE.Mesh(skiGeo, toonMat), skiR = new THREE.Mesh(skiGeo, toonMat);
  skiL.position.set(-0.42, 0, -1.0); skiR.position.set(0.42, 0, -1.0);
  hull.add(skiL, skiR);
  const { body, poles } = makeRider(false);
  body.scale.setScalar(0.85); body.position.set(0, 0.62, 0.35);
  hull.add(body); root.add(hull);
  root.userData = { kind: 'sled', body, hull, skis: null, skiL, skiR, poles };
  return shadowy(root);
}
// The yeti: what eats bears. Twice a bear's height, on two legs, arms that swing like a second pair.
// Built with the same inner/legs layout as the bear so animateBeast and rearBeast drive both.
function makeYeti() {
  const root = new THREE.Group(), inner = new THREE.Group();
  const fur = 0xe8eef5, shade = 0xc5d3e2, dark = 0x1a120c, face = 0x5b6b7c;
  inner.add(new THREE.Mesh(merge([
    piece(new THREE.SphereGeometry(1, 10, 8), fur, M(0, 1.95, 0, 1.0, 1.15, 0.8)),
    piece(new THREE.SphereGeometry(1, 10, 8), shade, M(0, 1.6, 0.3, 0.7, 0.6, 0.55)),
    piece(new THREE.SphereGeometry(0.58, 10, 8), fur, M(0, 3.1, 0.1)),
    piece(new THREE.SphereGeometry(1, 8, 6), face, M(0, 3.0, 0.5, 0.38, 0.32, 0.22)),
    piece(new THREE.SphereGeometry(0.07, 6, 5), dark, M(-0.15, 3.1, 0.68)),
    piece(new THREE.SphereGeometry(0.07, 6, 5), dark, M(0.15, 3.1, 0.68)),
    piece(new THREE.BoxGeometry(0.32, 0.07, 0.08), 0xf6f6f6, M(0, 2.86, 0.7)),
    piece(new THREE.ConeGeometry(0.2, 0.5, 5), fur, M(0, 3.6, -0.05)),
  ]), toonMat));
  const armGeo = merge([
    piece(new THREE.CylinderGeometry(0.2, 0.17, 1.5, 7), fur, M(0, -0.7, 0)),
    piece(new THREE.SphereGeometry(0.25, 7, 5), shade, M(0, -1.45, 0)),
  ]);
  const legGeo = merge([
    piece(new THREE.CylinderGeometry(0.28, 0.24, 1.3, 7), fur, M(0, -0.6, 0)),
    piece(new THREE.SphereGeometry(0.32, 7, 5), shade, M(0, -1.2, 0.12, 1, 0.5, 1.4)),
  ]);
  const legs = [];
  for (const [x, y, z, g] of [[-1.0, 2.45, 0.1, armGeo], [1.0, 2.45, 0.1, armGeo], [-0.42, 1.3, 0, legGeo], [0.42, 1.3, 0, legGeo]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    pivot.add(new THREE.Mesh(g, toonMat)); inner.add(pivot); legs.push(pivot);
  }
  root.add(inner); root.scale.setScalar(1.15);
  root.userData = { kind: 'yeti', inner, legs, body: inner, poles: [], skiL: null, skiR: null, skis: null };
  return shadowy(root);
}

// ---------- bear ----------
function makeBear() {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  const fur = 0x4e321e, light = 0x8a6440, dark = 0x1a120c;
  const body = new THREE.Mesh(merge([
    piece(new THREE.SphereGeometry(1, 10, 8), fur, M(0, 1.15, 0, 0.92, 0.86, 1.45)),
    piece(new THREE.SphereGeometry(1, 10, 8), fur, M(0, 1.6, 0.55, 0.78, 0.6, 0.75)),
    piece(new THREE.SphereGeometry(0.58, 10, 8), fur, M(0, 1.55, 1.55)),
    piece(new THREE.SphereGeometry(1, 8, 6), light, M(0, 1.4, 2.0, 0.3, 0.25, 0.4)),
    piece(new THREE.SphereGeometry(0.1, 6, 5), dark, M(0, 1.48, 2.37)),
    piece(new THREE.SphereGeometry(0.17, 6, 5), fur, M(-0.36, 2.02, 1.42)),
    piece(new THREE.SphereGeometry(0.17, 6, 5), fur, M(0.36, 2.02, 1.42)),
    piece(new THREE.SphereGeometry(0.09, 6, 5), light, M(-0.36, 2.03, 1.5)),
    piece(new THREE.SphereGeometry(0.09, 6, 5), light, M(0.36, 2.03, 1.5)),
    piece(new THREE.SphereGeometry(0.065, 6, 5), dark, M(-0.22, 1.68, 1.98)),
    piece(new THREE.SphereGeometry(0.065, 6, 5), dark, M(0.22, 1.68, 1.98)),
    piece(new THREE.SphereGeometry(0.2, 6, 5), fur, M(0, 1.2, -1.42)),
  ]), toonMat);
  inner.add(body);
  const legGeo = merge([
    piece(new THREE.CylinderGeometry(0.26, 0.2, 1.0, 7), fur, M(0, -0.45, 0)),
    piece(new THREE.SphereGeometry(0.25, 7, 5), fur, M(0, -0.95, 0.06, 1, 0.6, 1.3)),
  ]);
  const legs = [];
  for (const [x, z] of [[-0.48, 0.85], [0.48, 0.85], [-0.48, -0.85], [0.48, -0.85]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.05, z);
    pivot.add(new THREE.Mesh(legGeo, toonMat));
    inner.add(pivot); legs.push(pivot);
  }
  root.add(inner);
  root.scale.setScalar(1.15);
  root.userData = { kind: 'bear', inner, legs, body: inner, poles: [], skiL: null, skiR: null, skis: null };
  return shadowy(root);
}
// Gallop (or lumber) for anything with an inner body and four swinging limbs.
function animateBeast(ud, phase) {
  const s = Math.sin(phase * Math.PI);
  ud.legs[0].rotation.x = ud.legs[1].rotation.x = s * 0.85;
  ud.legs[2].rotation.x = ud.legs[3].rotation.x = -s * 0.85;
  ud.legs[1].rotation.x += 0.15; ud.legs[3].rotation.x += 0.15;
  ud.inner.position.y = Math.abs(Math.cos(phase * Math.PI)) * 0.18;
  ud.inner.rotation.x = s * 0.07;
}
function rearBeast(ud, r) { // startled, roaring or triumphant: up on the hind legs, front limbs raised
  ud.inner.rotation.x = -0.5 * r; ud.inner.position.y = 0.5 * r;
  ud.legs[0].rotation.x = ud.legs[1].rotation.x = -1.1 * r; ud.legs[2].rotation.x = ud.legs[3].rotation.x = 0.2 * r;
}

// ---------- chunks ----------

const chunks = new Map(); // index -> {ground, objs:[], meshes:[]}
let seed = 1;
const _m = new THREE.Matrix4();

function buildChunk(i) {
  const rnd = mulberry32(seed * 7919 + i * 104729);
  const ground = new THREE.Mesh(groundGeometry(i), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  const z0 = -i * CHUNK, objs = [], meshes = [ground];
  const free = (x, z, r) => objs.every(o => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + r + 1.6) ** 2);
  const spot = (xMin, xMax, r, zPad = 0) => {
    for (let k = 0; k < 12; k++) {
      const x = xMin + rnd() * (xMax - xMin), z = z0 - zPad - rnd() * (CHUNK - zPad);
      if (i === 0 && z > -25 && Math.abs(x) < EDGE) continue; // clear start area
      if (free(x, z, r)) return [x, z];
    }
    return null;
  };
  const trees = [], rocks = [], stumps = [];
  const diff = Math.min(1, i / 40);
  // Forest on the banks.
  for (let k = 0; k < 26; k++) {
    const side = k % 2 ? 1 : -1, s = spot(EDGE - 2, WIDTH / 2, 0.7);
    if (s) { s[0] *= side; trees.push(s); objs.push({ type: 'tree', x: s[0], z: s[1], r: 0.55, h: 5.5 }); }
  }
  const nTrees = 7 + Math.round(diff * 20 + rnd() * 4), nRocks = 2 + Math.round(diff * 4 + rnd() * 2), nStumps = Math.round(rnd() * 2 + diff * 2);
  for (let k = 0; k < nTrees; k++) { const s = spot(-EDGE, EDGE, 0.7); if (s) { trees.push(s); objs.push({ type: 'tree', x: s[0], z: s[1], r: 0.55, h: 5.5 }); } }
  for (let k = 0; k < nRocks; k++) { const s = spot(-EDGE + 2, EDGE - 2, 1.1); if (s) { rocks.push(s); objs.push({ type: 'rock', x: s[0], z: s[1], r: 1.05, h: 0.95 }); } }
  for (let k = 0; k < nStumps; k++) { const s = spot(-EDGE + 2, EDGE - 2, 0.5); if (s) { stumps.push(s); objs.push({ type: 'rock', x: s[0], z: s[1], r: 0.5, h: 0.65 }); } }
  const inst = (geo, list, scaleFn) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, toonMat, list.length);
    list.forEach(([x, z], k) => {
      const s = scaleFn();
      m.setMatrixAt(k, _m.compose(new V3(x, height(x, z) - 0.05, z), _q.setFromEuler(_e.set(0, rnd() * 6.28, 0)), new V3(s, s * (0.9 + rnd() * 0.25), s)));
    });
    m.castShadow = m.receiveShadow = true;
    m.computeBoundingSphere();
    scene.add(m); meshes.push(m);
  };
  inst(TREE, trees, () => 0.8 + rnd() * 0.55);
  inst(ROCK, rocks, () => 0.85 + rnd() * 0.3);
  inst(STUMP, stumps, () => 1);
  // Ramps and gates on the open run.
  if (i > 0 && rnd() < 0.42) {
    const s = spot(-EDGE + 6, EDGE - 6, 2.6, 6);
    if (s) {
      const r = makeRamp(); r.position.set(s[0], height(s[0], s[1]), s[1]);
      scene.add(r); meshes.push(r);
      objs.push({ type: 'ramp', x: s[0], z: s[1], r: 2.4, h: 0 });
    }
  }
  if (i > 0 && rnd() < 0.55) {
    const s = spot(-EDGE + 6, EDGE - 6, 3.2, 4);
    if (s) {
      const g = makeGate(rnd() < 0.5 ? 0xd9362b : 0x2a63c9); g.position.set(s[0], height(s[0], s[1]), s[1]);
      scene.add(g); meshes.push(g);
      objs.push({ type: 'gate', x: s[0], z: s[1], r: 3.2, h: 0, mesh: g, done: false });
      objs.push({ type: 'pole', x: s[0] - 3, z: s[1], r: 0.12, h: 1.9 }, { type: 'pole', x: s[0] + 3, z: s[1], r: 0.12, h: 1.9 });
    }
  }
  chunks.set(i, { objs, meshes });
}
function dropChunk(i) {
  const c = chunks.get(i); if (!c) return;
  for (const m of c.meshes) {
    scene.remove(m);
    if (m.isInstancedMesh) m.dispose();
    else if (m === c.meshes[0]) m.geometry.dispose();
    else m.traverse(o => { if (o.isMesh && o.geometry !== FLAG_GEO) o.geometry.dispose(); if (o.isMesh && o.material !== toonMat) o.material.dispose(); });
  }
  chunks.delete(i);
}
function updateChunks(z) {
  const cur = Math.floor(-z / CHUNK);
  for (let i = Math.max(0, cur - BEHIND); i <= cur + AHEAD; i++) if (!chunks.has(i)) buildChunk(i);
  for (const i of chunks.keys()) if (i < cur - BEHIND || i > cur + AHEAD) dropChunk(i);
}

// ---------- ski trails ----------
const TRAIL = 420;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(2 * TRAIL * 6 * 3);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setDrawRange(0, 0);
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0x9fb8d2, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
trail.frustumCulled = false;
scene.add(trail);
const samples = []; // {x,z,y,rx,rz,connect}
let lastStamp = null;
function stampTrail(x, z, heading, connect) {
  samples.push({ x, z, rx: Math.cos(heading), rz: Math.sin(heading), connect });
  if (samples.length > TRAIL) samples.shift();
  let o = 0;
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1], b = samples[k];
    if (!b.connect) continue;
    for (const off of [-0.13, 0.13]) {
      const w = 0.06;
      const ax0 = a.x + a.rx * (off - w), az0 = a.z + a.rz * (off - w), ax1 = a.x + a.rx * (off + w), az1 = a.z + a.rz * (off + w);
      const bx0 = b.x + b.rx * (off - w), bz0 = b.z + b.rz * (off - w), bx1 = b.x + b.rx * (off + w), bz1 = b.z + b.rz * (off + w);
      const ay0 = height(ax0, az0) + 0.03, ay1 = height(ax1, az1) + 0.03, by0 = height(bx0, bz0) + 0.03, by1 = height(bx1, bz1) + 0.03;
      trailPos.set([ax0, ay0, az0, bx0, by0, bz0, ax1, ay1, az1, ax1, ay1, az1, bx0, by0, bz0, bx1, by1, bz1], o);
      o += 18;
    }
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.setDrawRange(0, o / 3);
}

// ---------- particles ----------
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DOT = dotTexture();
const FLAKES = 1400, flakeBox = new V3(80, 40, 80);
const flakeGeo = new THREE.BufferGeometry(), flakePos = new Float32Array(FLAKES * 3), flakeSeed = new Float32Array(FLAKES);
for (let k = 0; k < FLAKES; k++) {
  flakePos[k * 3] = (Math.random() - 0.5) * flakeBox.x; flakePos[k * 3 + 1] = Math.random() * flakeBox.y; flakePos[k * 3 + 2] = (Math.random() - 0.5) * flakeBox.z;
  flakeSeed[k] = Math.random() * 100;
}
flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ size: 0.16, map: DOT, transparent: true, depthWrite: false, opacity: 0.9 }));
flakes.frustumCulled = false;
scene.add(flakes);

const SPRAY = 260;
const sprayGeo = new THREE.BufferGeometry(), sprayPos = new Float32Array(SPRAY * 3).fill(-1e4), sprayVel = new Float32Array(SPRAY * 3), sprayLife = new Float32Array(SPRAY);
sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ size: 0.28, map: DOT, transparent: true, depthWrite: false, color: 0xf4f8fc }));
spray.frustumCulled = false;
scene.add(spray);
let sprayNext = 0;
function emitSpray(x, y, z, vx, vy, vz, n, spread) {
  for (let k = 0; k < n; k++) {
    const i = sprayNext; sprayNext = (sprayNext + 1) % SPRAY;
    sprayPos[i * 3] = x; sprayPos[i * 3 + 1] = y; sprayPos[i * 3 + 2] = z;
    sprayVel[i * 3] = vx + (Math.random() - 0.5) * spread; sprayVel[i * 3 + 1] = vy + Math.random() * spread; sprayVel[i * 3 + 2] = vz + (Math.random() - 0.5) * spread;
    sprayLife[i] = 0.5 + Math.random() * 0.5;
  }
}
function updateParticles(dt, t) {
  for (let i = 0; i < SPRAY; i++) {
    if (sprayLife[i] <= 0) continue;
    sprayLife[i] -= dt;
    if (sprayLife[i] <= 0) { sprayPos[i * 3 + 1] = -1e4; continue; }
    sprayVel[i * 3 + 1] -= 9 * dt;
    sprayPos[i * 3] += sprayVel[i * 3] * dt; sprayPos[i * 3 + 1] += sprayVel[i * 3 + 1] * dt; sprayPos[i * 3 + 2] += sprayVel[i * 3 + 2] * dt;
  }
  sprayGeo.attributes.position.needsUpdate = true;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, hx = flakeBox.x / 2, hz = flakeBox.z / 2;
  for (let k = 0; k < FLAKES; k++) {
    const s = flakeSeed[k];
    let x = flakePos[k * 3] + Math.sin(t * 0.7 + s) * 0.4 * dt + 0.6 * dt, y = flakePos[k * 3 + 1] - (1.2 + (s % 1)) * dt, z = flakePos[k * 3 + 2];
    x = cx + ((((x - cx + hx) % flakeBox.x) + flakeBox.x) % flakeBox.x) - hx;
    z = cz + ((((z - cz + hz) % flakeBox.z) + flakeBox.z) % flakeBox.z) - hz;
    if (y < cy - 20) y += flakeBox.y; else if (y > cy + 20) y -= flakeBox.y;
    flakePos[k * 3] = x; flakePos[k * 3 + 1] = y; flakePos[k * 3 + 2] = z;
  }
  flakeGeo.attributes.position.needsUpdate = true;
}

// Distant peaks: drawn without fog and dragged along with the camera, so they read as far away.
const peaks = new THREE.Group();
{
  const rnd = mulberry32(42), parts = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2 + rnd() * 0.2, r = 430 + rnd() * 60, h = 70 + rnd() * 110, w = 70 + rnd() * 60;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    parts.push(piece(new THREE.ConeGeometry(w, h, 6), 0x8ea6c0, M(x, h / 2 - 40, z, 1, 1, 1, 0, rnd() * 3)));
    parts.push(piece(new THREE.ConeGeometry(w * 0.42, h * 0.42, 6), 0xf3f7fb, M(x, h - 40 - h * 0.21 + 0.5, z, 1.02, 1, 1.02, 0, rnd() * 3)));
  }
  const m = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
  peaks.add(m);
  scene.add(peaks);
}

// ---------- sound (tiny synth) ----------
let actx = null, muted = localStorage.getItem('bearrun-muted') === '1';
function audio() { if (!actx) { try { actx = new AudioContext(); } catch { actx = null; } } if (actx?.state === 'suspended') actx.resume(); return actx; }
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  const a = !muted && audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.25, freq = 900) {
  const a = !muted && audio(); if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start();
}
const sfx = {
  gate() { tone(880, 0.12, 'triangle', 0.12); setTimeout(() => tone(1320, 0.18, 'triangle', 0.12), 90); },
  jump() { tone(300, 0.25, 'sine', 0.1, 2.2); },
  land() { noise(0.15, 0.2, 700); },
  crash() { noise(0.45, 0.4, 1200); tone(160, 0.3, 'square', 0.06, 0.5); },
  trick() { [660, 880, 1100].forEach((f, k) => setTimeout(() => tone(f, 0.12, 'square', 0.05), k * 70)); },
  growl() { tone(78, 0.7, 'sawtooth', 0.12, 0.7); noise(0.6, 0.12, 300); },
  scream() {
    // Two detuned saws with a wobble, swooping up then cracking down: a proper cartoon shriek.
    const a = !muted && audio(); if (!a) return;
    const t = a.currentTime, g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.setValueAtTime(0.16, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    lfo.frequency.value = 9; lg.gain.value = 40; lfo.connect(lg); lfo.start(t); lfo.stop(t + 1.05);
    for (const d of [0, 7]) {
      const o = a.createOscillator(); o.type = 'sawtooth'; o.detune.value = d;
      o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1150, t + 0.25); o.frequency.setValueAtTime(1150, t + 0.6); o.frequency.exponentialRampToValueAtTime(380, t + 1.0);
      lg.connect(o.frequency); o.connect(g); o.start(t); o.stop(t + 1.05);
    }
    g.connect(a.destination);
  },
  hoarse() { noise(0.25, 0.1, 1800); },
};

// ---------- game state ----------
const player = { x: 0, z: -5, y: 0, vy: 0, v: 0, heading: 0, vdir: 0, slip: 0, slipT: 0, air: false, airT: 0, spin: 0, crashT: 0, steer: 0, pushPhase: 0, plough: 0, runPhase: 0 };
const bear = { on: false, x: 0, z: 0, phase: 0, rear: 0, flinch: 0 }; // the chaser, whatever it is this run
let state = 'title', score = 0, bonus = 0, best = Number(localStorage.getItem('bearrun-best')) || 0, growlT = 0, overT = 0;
let far = Number(localStorage.getItem('bearrun-far')) || 0; // farthest distance ever reached in one run: the unlock currency
let camMode = 0, camBlend = 0, camYaw = 0, bearPull = 0, bearGap = Infinity;
let screamCd = 0, screamT = 0; // scream cooldown and the time left on the scream pose
let rideId = RIDES[localStorage.getItem('bearrun-ride')]?.unlock <= far ? localStorage.getItem('bearrun-ride') : 'skis';
let V = RIDES[rideId], P = PURSUERS[V.pursuer];
// The player's mesh and the chaser's are built per ride and swapped on selection.
let skier = null, bearMesh = null;
function buildRide() {
  if (skier) scene.remove(skier);
  if (bearMesh) scene.remove(bearMesh);
  skier = V.kind === 'skis' ? makeSkier() : V.kind === 'board' ? makeBoarder() : V.kind === 'sled' ? makeSnowmobile(0x2a63c9) : makeBear();
  if (V.kind === 'bear') skier.scale.setScalar(1.0);
  bearMesh = V.pursuer === 'bear' ? makeBear() : makeYeti();
  bearMesh.visible = false;
  scene.add(skier, bearMesh);
  $('bearName').textContent = `${P.icon} ${P.name}`;
}
function selectRide(id) {
  if (!RIDES[id] || RIDES[id].unlock > far) return false;
  rideId = id; V = RIDES[id]; P = PURSUERS[V.pursuer];
  localStorage.setItem('bearrun-ride', id);
  buildRide(); renderRides();
  return true;
}
function renderRides() {
  const el = $('rides'); el.innerHTML = '';
  for (const [id, r] of Object.entries(RIDES)) {
    const b = document.createElement('button'); b.type = 'button';
    const locked = r.unlock > far;
    b.className = 'ride' + (id === rideId ? ' on' : '') + (locked ? ' locked' : '');
    b.innerHTML = `<span class="ri">${locked ? '🔒' : r.icon}</span><b>${r.name}</b><small>${locked ? `Reach ${r.unlock.toLocaleString()} m` : id === rideId ? 'Selected' : 'Unlocked'}</small>`;
    b.title = locked ? `Reach ${r.unlock.toLocaleString()} m in one run to unlock the ${r.name.toLowerCase()} (farthest so far: ${Math.round(far).toLocaleString()} m)` : r.blurb;
    b.addEventListener('click', () => { if (locked) { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 400); sfx.hoarse(); } else { selectRide(id); audio(); } });
    el.appendChild(b);
  }
  $('rideHelp').innerHTML = `<b>${V.icon} ${V.name}.</b> ${V.blurb}<br>${V.controls}`;
}
function noteDistance(dist) { // the unlock banners fire the moment a line is crossed, mid-run
  if (dist <= far) return;
  for (const r of Object.values(RIDES)) if (r.unlock > 0 && far < r.unlock && dist >= r.unlock) { banner(`${r.icon} ${r.name} unlocked!<small>pick it on the start screen</small>`, 2.2); sfx.trick(); }
  far = dist; localStorage.setItem('bearrun-far', String(Math.round(far)));
}


const keys = new Set();
const touch = { L: false, R: false, U: false, D: false };
const input = () => ({
  steer: (keys.has('ArrowRight') || keys.has('KeyD') || touch.R ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') || touch.L ? 1 : 0),
  push: keys.has('ArrowUp') || keys.has('KeyW') || touch.U,      // double-pole push
  plough: keys.has('ArrowDown') || keys.has('KeyS') || touch.D,  // snowplough
  tuck: keys.has('ShiftLeft') || keys.has('ShiftRight'),
});

const bannerEl = $('banner'); let bannerT = 0;
function banner(html, secs = 1.4) { bannerEl.innerHTML = html; bannerEl.classList.add('on'); bannerT = secs; }

function reset() {
  for (const i of [...chunks.keys()]) dropChunk(i);
  seed = (Math.random() * 1e9) | 0;
  Object.assign(player, { x: 0, z: -5, vy: 0, v: 0, heading: 0, vdir: 0, slip: 0, slipT: 0, air: false, airT: 0, spin: 0, crashT: 0, steer: 0, pushPhase: 0, plough: 0 });
  player.y = height(player.x, player.z);
  Object.assign(bear, { on: false, x: 0, z: 0, phase: 0, rear: 0, flinch: 0 });
  screamCd = 0; screamT = 0;
  bearGap = Infinity; bearPull = 0;
  bearMesh.visible = false; skier.visible = true;
  if (skier.userData.hull) skier.userData.hull.rotation.set(0, 0, 0);
  if (skier.userData.inner) { skier.userData.inner.rotation.set(0, 0, 0); skier.userData.inner.position.y = 0; }
  samples.length = 0; lastStamp = null; trailGeo.setDrawRange(0, 0);
  score = 0; bonus = 0; growlT = 0; camYaw = 0;
  $('bear').style.display = 'none';
  updateChunks(player.z);
  placeCamera(1, 1);
}
function start() {
  audio();
  reset();
  state = 'play';
  $('start').hidden = true; $('over').hidden = true;
  canvas.focus();
  banner('Go!', 0.9);
}

function crash() {
  if (player.crashT > 0) return;
  player.crashT = 1.3; player.v *= 0.1; player.spin = 0; player.slipT = 0;
  sfx.crash();
  emitSpray(player.x, player.y + 0.5, player.z, 0, 2, 0, 40, 4);
  banner('Wipeout!', 0.9);
}

function scream() {
  if (state !== 'play' || player.crashT > 0) return;
  if (screamCd > 0) { sfx.hoarse(); banner('…<small>(hoarse)</small>', 0.5); return; }
  screamCd = SCREAM_COOLDOWN; screamT = 0.7;
  if (V.kind === 'bear') { sfx.growl(); setTimeout(() => sfx.growl(), 120); } else sfx.scream();
  const cry = V.kind === 'bear' ? 'ROAR!' : 'HEEELP!';
  if (bear.on && bearGap < 70) { bear.flinch = SCREAM_FLINCH; banner(`${cry}<small>the ${P.name.toLowerCase()} hesitates</small>`, 1.2); }
  else banner(`${cry}<small>${V.kind === 'bear' ? 'the forest goes quiet' : 'nobody is coming'}</small>`, 1.4);
}

const _p = new V3(), _up = new V3(0, 1, 0), _yaw = new THREE.Quaternion(), _tilt = new THREE.Quaternion();

function step(dt, t) {
  const inp = input();
  const p = player;
  const prevZ = p.z;
  screamCd = Math.max(0, screamCd - dt); screamT = Math.max(0, screamT - dt);
  if (p.crashT > 0) {
    p.crashT -= dt;
    p.v = Math.max(0, p.v - 12 * dt);
    if (p.crashT <= 0) { p.crashT = 0; p.vdir = p.heading; p.slip = 0; p.slipT = 0; }
  } else if (p.air) {
    p.heading += inp.steer * V.spin * dt; p.spin += inp.steer * V.spin * dt;
  } else {
    p.steer += (inp.steer - p.steer) * Math.min(1, dt * 10);
    // Turning the skis is quick when slow and heavy when fast; the edges follow more slowly still.
    const steerRate = V.steer / (1 + p.v / V.steerFade), grip = V.grip / (1 + p.v / V.gripFade);
    if (inp.steer) p.heading += inp.steer * steerRate * dt;
    else p.heading += wrapAngle(p.vdir - p.heading) * Math.min(1, 2.0 * dt); // skis settle into the travel line
    if ((inp.tuck && V.tuck) || inp.plough) p.heading += wrapAngle(p.vdir - p.heading) * Math.min(1, 4 * dt); // a tuck or a plough lines you up
    if (p.v < 1) p.vdir = p.heading;
    else {
      const d = wrapAngle(p.heading - p.vdir);
      p.vdir += THREE.MathUtils.clamp(d, -grip * dt, grip * dt);
      p.vdir -= Math.sin(p.vdir) * 0.5 * dt; // the slope pulls your line downhill
    }
    p.heading = wrapAngle(p.heading); p.vdir = wrapAngle(p.vdir);
    p.slip = wrapAngle(p.heading - p.vdir);
    // Skidding scrubs speed; hold it too long at speed and you go down. Once a slide has started
    // fast it keeps counting even as the skid bleeds speed: scrubbing under the line does not save you.
    p.v = Math.max(0, p.v - Math.abs(Math.sin(p.slip)) * p.v * V.scrub * dt);
    if (Math.abs(p.slip) > THREE.MathUtils.degToRad(V.fallSlip) && (p.v > V.fallSpeed || p.slipT > 0)) { p.slipT += dt; if (p.slipT > FALL_GRACE) crash(); }
    else p.slipT = Math.max(0, p.slipT - dt * 2);
  }
  if (p.crashT <= 0) {
    let acc;
    const tuck = inp.tuck && V.tuck > 0;
    if (p.air) acc = -V.drag * p.v * p.v * 0.5;
    else {
      acc = V.accel * Math.cos(p.vdir) + (tuck ? V.tuck : 0) - V.friction - (tuck ? V.dragTuck : V.drag) * p.v * p.v;
      if (V.stroke) {
        // Pole push: each stroke shoves in its first half, then the poles swing forward for the next.
        if (inp.push) {
          p.pushPhase = (p.pushPhase + 1.7 * dt) % 1;
          acc += V.push * Math.max(0, 1 - p.v / V.pushMax) * Math.max(0, Math.sin(p.pushPhase * Math.PI * 2)) * 2;
        } else if (p.pushPhase > 0) p.pushPhase = p.pushPhase < 0.5 ? Math.min(1, p.pushPhase + 1.7 * dt) % 1 : (p.pushPhase + 1.7 * dt) % 1;
      } else if (inp.push) acc += V.push * Math.max(0, 1 - p.v / V.pushMax); // throttle, or a sprint
      if (inp.plough) acc -= V.plough;
    }
    p.v = Math.max(0, p.v + acc * dt);
  }
  const dx = Math.sin(p.vdir) * p.v * dt, dz = -Math.cos(p.vdir) * p.v * dt;
  p.x = THREE.MathUtils.clamp(p.x + dx, -WIDTH / 2 + 4, WIDTH / 2 - 4); p.z += dz;
  const g2 = height(p.x, p.z);
  if (p.air) {
    p.vy -= 20 * dt; p.y += p.vy * dt; p.airT += dt;
    if (p.y <= g2) {
      p.y = g2; p.air = false;
      p.heading = wrapAngle(p.heading);
      const slip = wrapAngle(p.heading - p.vdir);
      if (Math.abs(slip) > THREE.MathUtils.degToRad(V.landSlip) && p.v > 4) crash();
      else {
        p.vdir = p.heading; p.slip = 0; p.slipT = 0; // the skis bite and you carve off the way they point
        sfx.land(); emitSpray(p.x, g2 + 0.1, p.z, 0, 1.5, 0, 24, 3);
        const turns = Math.round(Math.abs(p.spin) / (Math.PI * 2));
        let pts = Math.round(p.airT * 25), msg = '';
        if (turns) { pts += turns * 150; msg = turns === 1 ? '360!' : `${turns * 360}!`; sfx.trick(); }
        if (p.airT > 0.6 || turns) { bonus += pts; banner(`${msg || 'Big air!'}<small>+${pts}</small>`, 1.1); }
      }
      p.spin = 0; lastStamp = null;
    }
  } else {
    p.y = g2; p.airT = 0;
  }
  p.plough += ((inp.plough && !p.air && p.crashT <= 0 ? 1 : 0) - p.plough) * Math.min(1, dt * 10);
  if (!p.air && p.crashT <= 0 && (keys.has('Space') || touch.J)) { keys.delete('Space'); touch.J = false; p.air = true; p.vy = 5.2; p.spin = 0; sfx.jump(); }

  // Obstacles, ramps and gates near the player.
  const ci = Math.floor(-p.z / CHUNK);
  for (let i = ci - 1; i <= ci + 1; i++) {
    const c = chunks.get(i); if (!c) continue;
    for (const o of c.objs) {
      const ddx = p.x - o.x, ddz = p.z - o.z;
      if (o.type === 'gate') {
        if (!o.done && prevZ > o.z && p.z <= o.z) {
          o.done = true;
          if (Math.abs(ddx) < 2.95) { bonus += 50; sfx.gate(); banner('Gate!<small>+50</small>', 0.8); o.mesh.userData.flagMat.color.set(0x3fbf6a); }
        }
        continue;
      }
      if (o.type === 'ramp') {
        if (!p.air && p.crashT <= 0 && Math.abs(ddx) < 1.5 && ddz < 1.6 && ddz > -2.4 && p.v > 4) {
          p.air = true; p.vy = 4 + p.v * 0.3; p.y = g2 + 0.9; p.spin = 0; sfx.jump();
        }
        continue;
      }
      const rr = o.r + V.bodyR;
      if (ddx * ddx + ddz * ddz < rr * rr && !(p.air && p.y - height(o.x, o.z) > o.h)) {
        // Bounce off: the travel direction reflects off the obstacle and loses speed. Whether you
        // fall is then the same rule as everywhere else: skis pointing the wrong way at speed.
        const d = Math.hypot(ddx, ddz) || 1, nx = ddx / d, nz = ddz / d;
        p.x = o.x + nx * rr; p.z = o.z + nz * rr;
        const vx = Math.sin(p.vdir) * p.v, vz = -Math.cos(p.vdir) * p.v, dot = vx * nx + vz * nz;
        if (dot < 0 && p.crashT <= 0) {
          const rx = vx - 1.6 * dot * nx, rz = vz - 1.6 * dot * nz; // partial restitution
          const speedBefore = p.v;
          p.v = Math.hypot(rx, rz) * 0.6;
          if (p.v > 0.5) p.vdir = Math.atan2(rx, -rz);
          emitSpray(p.x, p.y + 0.3, p.z, nx * 2, 1.5, nz * 2, 14, 2.5);
          p.slip = wrapAngle(p.heading - p.vdir);
          if (speedBefore > V.fallSpeed * 0.6 && Math.abs(p.slip) > THREE.MathUtils.degToRad(V.fallSlip)) crash();
          else if (speedBefore > 3) noise(0.12, 0.15, 500);
        }
      }
    }
  }

  // Bear.
  const dist = Math.max(0, -p.z - 5);
  noteDistance(dist);
  if (!bear.on && dist > BEAR_WAKES) {
    bear.on = true; bear.x = p.x * 0.5; bear.z = p.z + 60;
    bearMesh.visible = true; $('bear').style.display = 'block';
    banner(`${P.icon} ${P.a}<small>keep moving</small>`, 2); sfx.growl();
  }
  let gap = Infinity;
  if (bear.on) {
    const bx = p.x - bear.x, bz = p.z - bear.z;
    gap = Math.hypot(bx, bz);
    const base = Math.min(V.chase.cap, V.chase.base + dist / 350);
    let spd = base + Math.max(0, gap - 40) * 0.3;
    if (bear.flinch > 0) { bear.flinch -= dt; spd = 0; } // a scream stops it in its tracks for a moment
    const mv = Math.min(gap, spd * dt);
    bear.x += (bx / (gap || 1)) * mv; bear.z += (bz / (gap || 1)) * mv;
    bear.phase += spd * dt * 0.55;
    const gy = height(bear.x, bear.z);
    bearMesh.position.set(bear.x, gy, bear.z);
    bearMesh.rotation.y = Math.atan2(bx, bz);
    const ud = bearMesh.userData;
    animateBeast(ud, bear.phase);
    if (bear.flinch > 0) rearBeast(ud, Math.min(1, bear.flinch / SCREAM_FLINCH * 2.5) * Math.min(1, (SCREAM_FLINCH - bear.flinch) * 6)); // startled: rears back
    bearGap = gap;
    if (gap < 22) { growlT -= dt; if (growlT <= 0) { sfx.growl(); growlT = 1.6 + Math.random(); } }
    if (gap < 1.7 && p.y - height(p.x, p.z) < 1.4) caught();
    if (Math.random() < 0.3) emitSpray(bear.x, gy + 0.2, bear.z, 0, 1.4, 0, 1, 2);
  }

  // Trails and spray.
  if (!p.air && p.crashT <= 0) {
    if (!lastStamp || Math.hypot(p.x - lastStamp.x, p.z - lastStamp.z) > 0.45) {
      stampTrail(p.x, p.z, p.heading, !!lastStamp);
      lastStamp = { x: p.x, z: p.z };
    }
    if (p.v > 3 && p.plough > 0.5) {
      for (const side of [-1, 1]) emitSpray(p.x + Math.cos(p.heading) * 0.25 * side, p.y + 0.05, p.z + Math.sin(p.heading) * 0.25 * side,
        Math.cos(p.heading) * side * 2 + Math.sin(p.vdir) * p.v * 0.2, 1.2, Math.sin(p.heading) * side * 2 - Math.cos(p.vdir) * p.v * 0.2, 1, 1.2);
    }
    if (p.v > 5 && Math.abs(p.slip) > 0.06) {
      const side = p.slip >= 0 ? -1 : 1;
      emitSpray(p.x + Math.cos(p.heading) * 0.3 * side, p.y + 0.1, p.z + Math.sin(p.heading) * 0.3 * side,
        Math.cos(p.heading) * side * 3 + Math.sin(p.vdir) * p.v * 0.3, 1.6, Math.sin(p.heading) * side * 3 - Math.cos(p.vdir) * p.v * 0.3, Math.abs(p.slip) > 0.12 ? 4 : 2, 1.5);
    }
  }

  score = Math.round(dist) + bonus;
  // HUD
  $('dist').textContent = `${Math.round(dist)} m`;
  $('speed').textContent = Math.round(p.v * 3.6);
  $('score').textContent = score;
  if (bear.on) {
    $('gap').textContent = `${Math.round(gap)} m behind`;
    $('gapbar').style.width = `${THREE.MathUtils.clamp(100 - gap * 1.6, 3, 100)}%`;
    $('bear').classList.toggle('close', gap < 12);
  }
  updateChunks(p.z);
}

function caught() {
  state = 'caught'; overT = 1.4;
  sfx.growl(); setTimeout(() => sfx.growl(), 300);
  player.v = 0;
  if (score > best) { best = score; localStorage.setItem('bearrun-best', String(best)); }
}

function poseSkier(dt) {
  const p = player, ud = skier.userData, inp = input();
  skier.position.set(p.x, p.y, p.z);
  normalAt(p.x, p.z, _n);
  _yaw.setFromAxisAngle(_up, -p.heading);
  _tilt.setFromUnitVectors(_up, p.air ? _up : _n);
  skier.quaternion.copy(_tilt).multiply(_yaw);
  const body = ud.body, k = p.crashT > 0 ? Math.min(1, (1.3 - p.crashT) * 5) : 0;
  const pushing = inp.push && !p.air && p.crashT <= 0, strokeK = pushing ? Math.max(0, Math.sin(p.pushPhase * Math.PI * 2)) : 0;
  const lean = (-p.steer * 0.22 - p.slip * 0.8) * Math.min(1, p.v / 8);
  if (ud.kind === 'bear') {
    // Four legs, running as fast as you are. A roar is up on the hind legs. A crash is on its side.
    // The bear model faces +Z, so it sits turned round on the rider's -Z frame.
    ud.inner.rotation.y = Math.PI;
    p.runPhase += p.v * dt * 0.55;
    animateBeast(ud, p.v > 0.5 ? p.runPhase : 0);
    if (screamT > 0) rearBeast(ud, Math.min(1, screamT * 4));
    ud.inner.rotation.z += ((k ? 1.3 * k : lean * 0.6) - ud.inner.rotation.z) * Math.min(1, dt * 8);
    if (k) ud.inner.rotation.x = -0.2 * k;
    return;
  }
  if (ud.kind === 'sled') {
    // The hull banks into turns and rolls over in a crash; the front skis steer; the rider hunches over the bars.
    ud.hull.rotation.z += ((k ? 1.4 * k : lean * 0.9) - ud.hull.rotation.z) * Math.min(1, dt * 8);
    ud.hull.rotation.x += ((k ? -0.3 * k : pushing ? -0.04 : 0) - ud.hull.rotation.x) * Math.min(1, dt * 8);
    ud.skiL.rotation.y = ud.skiR.rotation.y = -p.steer * 0.45;
    body.rotation.x += ((screamT > 0 ? 0.3 : -0.45 - (pushing ? 0.15 : 0)) - body.rotation.x) * Math.min(1, dt * 8);
    body.rotation.z += (lean * 0.5 - body.rotation.z) * Math.min(1, dt * 8);
    return;
  }
  // Skis and board. A negative body rotation.x is a forward bend: tuck and pole push bend forward, a scream leans back.
  if (k) {
    body.rotation.set(-0.3 * k, 0, 1.4 * k);
    body.position.y = -0.1 * k;
    ud.skis.rotation.set(0, k * 0.8, 0);
  } else {
    const tuck = inp.tuck && V.tuck > 0 && !p.air ? 1 : 0;
    const bend = screamT > 0 ? 0.3 : tuck ? -0.45 : p.plough > 0.5 ? -0.3 : -0.12;
    body.rotation.x += (bend - body.rotation.x) * Math.min(1, dt * 8);
    body.rotation.x -= 0.5 * strokeK; // the push: drive forward and down over the poles
    body.rotation.z += (lean - body.rotation.z) * Math.min(1, dt * 8);
    body.rotation.y = 0;
    const sy = tuck || p.plough > 0.5 ? 0.82 : 1 - 0.12 * strokeK;
    body.scale.y += (sy - body.scale.y) * Math.min(1, dt * 8);
    body.position.y = 0;
    ud.skis.rotation.set(p.air ? -0.15 : 0, 0, 0);
  }
  if (ud.skiL) { // snowplough: tips together, tails apart
    ud.skiL.rotation.y = -0.38 * p.plough; ud.skiR.rotation.y = 0.38 * p.plough;
    ud.skiL.position.x = -0.13 - 0.06 * p.plough; ud.skiR.position.x = 0.13 + 0.06 * p.plough;
  } else if (!k) ud.skis.rotation.z = -0.35 * p.plough; // the board goes up on its heel edge to scrub
  // Poles: a stroke plants ahead and drives back, then swings forward again. Idle, they trail. Scream: overhead.
  const stroke = screamT > 0 ? -2.6 : pushing ? -0.35 + 0.75 * Math.cos(p.pushPhase * Math.PI * 2) : 0.55;
  for (const pole of ud.poles) pole.rotation.x += (stroke - pole.rotation.x) * Math.min(1, dt * 14);
}

const camLook = new V3(), _look = new V3(), _top = new V3(), _f = new V3();
function placeCamera(dt, snap = 0) {
  const p = player;
  camBlend += (camMode - camBlend) * Math.min(1, dt * 3);
  camYaw += (THREE.MathUtils.clamp(wrapAngle(p.vdir), -0.6, 0.6) - camYaw) * Math.min(1, dt * 1.8);
  const s = Math.sin(camYaw), c = Math.cos(camYaw);
  // Normal views: chase (behind and above) or top-down (high, a little upslope).
  const chase = _p.set(p.x - s * 8.5, 0, p.z + c * 8.5);
  chase.y = Math.max(p.y, height(chase.x, chase.z)) + 4.2;
  const top = _top.set(p.x, p.y + 30, p.z + 9);
  const want = chase.lerp(top, camBlend);
  _look.set(p.x + s * 7, 0, p.z - c * 7);
  _look.y = height(_look.x, _look.z) + 1.2;
  _look.lerp(_f.set(p.x, p.y, p.z - 6), camBlend);
  // The bear comes from uphill, behind a chase camera. While it closes in, frame both:
  // stand just behind the bear and look at the midpoint, higher the further apart they are.
  const pullTo = bear.on ? THREE.MathUtils.clamp((52 - bearGap) / 16, 0, 1) : 0;
  bearPull += (pullTo - bearPull) * Math.min(1, dt * 2);
  if (bearPull > 0.001) {
    const g = Math.min(bearGap, 52), by = height(bear.x, bear.z);
    const frameChase = _f.set(bear.x - s * 5, 0, bear.z + c * 5);
    frameChase.y = Math.max(by, height(frameChase.x, frameChase.z)) + 5 + g * 0.3;
    const frameTop = new V3((bear.x + p.x) / 2, Math.max(p.y, by) + 30 + g * 0.45, (bear.z + p.z) / 2 + 8);
    want.lerp(frameChase.lerp(frameTop, camBlend), bearPull);
    _look.lerp(new V3((bear.x + p.x) / 2, (by + p.y) / 2 + 1, (bear.z + p.z) / 2 - 2), bearPull);
  }
  if (snap) { camera.position.copy(want); camLook.copy(_look); }
  else { camera.position.lerp(want, 1 - Math.exp(-dt * 6)); camLook.lerp(_look, 1 - Math.exp(-dt * 8)); }
  camera.position.y = Math.max(camera.position.y, height(camera.position.x, camera.position.z) + 1.5);
  camera.lookAt(camLook);
  sky.position.copy(camera.position);
  peaks.position.copy(camera.position);
  sun.position.copy(skier.position).add(SUN_OFFSET);
  sun.target.position.copy(skier.position);
}

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect(document);
function frame(ts) {
  try {
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 1 / 20), t = timer.getElapsed();
    if (state === 'play') step(dt, t);
    else if (state === 'caught') {
      overT -= dt;
      bear.rear = Math.min(1, bear.rear + dt * 3);
      rearBeast(bearMesh.userData, bear.rear); bearMesh.userData.legs[0].rotation.x += Math.sin(t * 14) * 0.2;
      if (overT < 1.1) skier.visible = false;
      if (overT <= 0 && $('over').hidden) {
        $('final').textContent = score;
        $('overTitle').textContent = `The ${P.name.toLowerCase()} got you`;
        const next = Object.values(RIDES).find(r => r.unlock > far);
        $('overSub').textContent = (score >= best ? 'New best run! ' : `Best: ${best}. `) + (next ? `Reach ${next.unlock.toLocaleString()} m in one run to unlock the ${next.name.toLowerCase()} (farthest so far: ${Math.round(far).toLocaleString()} m).` : 'Everything is unlocked.');
        $('bestv').textContent = best;
        $('over').hidden = false;
        $('againBtn').focus();
      }
    } else if (state === 'title') {
      // Gentle idle cruise behind the title card.
      player.heading = player.vdir = Math.sin(t * 0.4) * 0.5; player.v = 9; player.runPhase += 9 * dt * 0.55;
      player.x += Math.sin(player.heading) * player.v * dt; player.z -= Math.cos(player.heading) * player.v * dt;
      player.y = height(player.x, player.z);
      updateChunks(player.z);
    }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('on'); }
    poseSkier(dt);
    placeCamera(dt);
    updateParticles(dt, t);
    renderer.render(scene, camera);
  } catch (err) {
    console.error(err);
  }
}

function resize() {
  const top = document.querySelector('.site-topbar')?.offsetHeight || 52;
  const w = innerWidth, h = Math.max(1, innerHeight - top);
  canvas.style.top = `${top}px`; canvas.style.height = `${h}px`;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- input ----------
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight']);
addEventListener('keydown', e => {
  if (e.target.closest?.('.site-topbar')) return;
  if (e.code === 'KeyC') { toggleCam(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.code === 'KeyE' && !e.repeat) { scream(); return; }
  if ((e.code === 'Enter' || e.code === 'Space') && state !== 'play') {
    if (state === 'title' || !$('over').hidden) { e.preventDefault(); start(); }
    return;
  }
  if (GAME_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) keys.add(e.code); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); touch.L = touch.R = touch.U = touch.D = false; });

function hold(id, k) {
  const el = $(id);
  const on = e => { e.preventDefault(); touch[k] = true; audio(); };
  const off = () => { if (k !== 'J') touch[k] = false; };
  el.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, off);
}
hold('tL', 'L'); hold('tR', 'R'); hold('tU', 'U'); hold('tD', 'D'); hold('tJ', 'J');
$('tE').addEventListener('pointerdown', e => { e.preventDefault(); audio(); scream(); });

function toggleCam() {
  camMode = camMode ? 0 : 1;
  $('camBtn').textContent = camMode ? '🎥 Top-down view' : '🎥 Chase view';
}
function toggleMute() {
  muted = !muted; localStorage.setItem('bearrun-muted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('camBtn').addEventListener('click', e => { toggleCam(); e.currentTarget.blur(); });
$('muteBtn').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
$('muteBtn').textContent = muted ? '🔇' : '🔊';
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('ridesBtn').addEventListener('click', () => { state = 'title'; $('over').hidden = true; reset(); renderRides(); $('start').hidden = false; });
$('bestv').textContent = best;

buildRide(); renderRides();
reset();
renderer.setAnimationLoop(frame);
if (import.meta.url.includes('localhost')) window.__bear = { player, bear, keys, chunks, start, step, frame, scream, selectRide, RIDES, get far() { return far; }, set far(v) { far = v; }, get skier() { return skier; }, get V() { return V; }, get state() { return state; }, toggleCam };
