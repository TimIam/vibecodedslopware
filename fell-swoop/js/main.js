// Fell Swoop: chop down trees with your hands on a heavy, physical axe.
import * as THREE from 'three';
import { buildWorld, makeRng, barkTexture, plaidTexture, softDotTexture } from './world.js';
import { Tree, barkMaterial, crushable, sliceH, GRID, CUT_HI } from './trees.js';
import { Axe, REACH } from './axe.js';
import { Arms } from './arms.js';
import { Sfx } from './audio.js';
import { Fx } from './fx.js';
import { Faller } from './faller.js';
import { Lumberjack } from './body.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));
const V = () => new THREE.Vector3();

// Renderer and scene ----------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 1, 0.03, 1500);
const world = buildWorld(scene, renderer);
const sfx = new Sfx();
const fx = new Fx(scene, softDotTexture());
const bark = barkTexture(makeRng(11));
const mats = {
  bark: barkMaterial(bark.map, bark.bump),
  cap: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  crown: crushable(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }), true),
  fronds: crushable(world.frondMat),
};
const axe = new Axe(scene);
// A ring on the ground round the tree you are locked onto.
const targetRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.13, 56).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.55, depthWrite: false }));
targetRing.renderOrder = 2; scene.add(targetRing);
const plaid = plaidTexture();
const arms = new Arms(scene, plaid);

// Settings, remembered per browser.
const SETTINGS_KEY = 'fellswoop.settings.v1';
const settings = { sens: 1, music: 0.5, sfx: 1, view: 'first', full: true, grip: 'R' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };

// The grip: which hand is on top of the handle, up by the head ('R' is the usual right-handed
// hold, left hand on the knob). The top hand's side is your strong side: you wind up further over
// that shoulder and swing hardest coming across from it; the backhand is lighter. X swaps, sliding
// the hands past each other on the handle, and for that moment one hand is off and the axe is weak.
if (settings.grip !== 'L') settings.grip = 'R';
const hand = () => (settings.grip === 'R' ? 1 : -1);
const grip = { u: { R: settings.grip === 'R' ? 1 : 0, L: settings.grip === 'R' ? 0 : 1 }, t: 0 };
const REGRIP = 0.35;  // seconds the hands take to change over
function swapGrip() {
  if (grip.t > 0 || player.dead) return;
  settings.grip = settings.grip === 'R' ? 'L' : 'R'; saveSettings(); syncSettingsUi();
  grip.t = REGRIP; sfx.yank();
  popup(settings.grip === 'R' ? 'right hand on top' : 'left hand on top', 'meh', settings.grip === 'R' ? 'wind up over your right shoulder' : 'wind up over your left shoulder');
}
function updateGrip(dt) {
  if (grip.t > 0) grip.t = Math.max(0, grip.t - dt);
  const k = 1 - grip.t / REGRIP, top = settings.grip, s = k * k * (3 - 2 * k);
  // Each hand slides along the handle from where it was to where it is going (0 knob, 1 top).
  grip.u[top] = s; grip.u[top === 'R' ? 'L' : 'R'] = 1 - s;
}

// The third-person body: Timberline's faller if it loads, a simple lumberjack until then.
const body = { fig: null, simple: new Lumberjack(scene, plaid) };
body.simple.setVisible(false);
new GLTFLoader().loadAsync('assets/faller.glb').then(gltf => {
  const fig = new Faller(gltf.scene);
  if (!fig.ok) return;
  fig.root.visible = false; scene.add(fig.root); body.fig = fig;
}).catch(() => { /* keep the simple body */ });

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
  if (!w || !h || (canvas.width === Math.floor(w * pr) && canvas.height === Math.floor(h * pr))) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

// State -----------------------------------------------------------------------
const G = {
  mode: 'title', trees: [], seed: 1, felled: 0, t: 0, timing: false, shake: 0,
  target: null, watch: null, watchT: 0, lookPt: V(), cool: {}, overT: 0,
  stats: null,
};
const B = { F: V(), R: V(), U: new THREE.Vector3(0, 1, 0) };
const basis = yaw => { B.F.set(-Math.sin(yaw), 0, -Math.cos(yaw)); B.R.set(Math.cos(yaw), 0, -Math.sin(yaw)); };
const player = {
  pos: V(), yaw: 0, vel: V(), sway: V(), swayV: V(), twist: 0, twistV: 0,
  stamina: 1, stumble: 0, dead: false, deadT: 0, stepD: 0, bob: 0, dip: 0,
};
const chest = V();
const keys = {};
const input = { lmb: false, locked: false, soft: false, sens: settings.sens, mAvg: 0 };
const SENS = 1 / 550;
const cursor = { x: 0.45, y: 0.12, sx: 0.45, sy: 0.12, px: 0.45, py: 0.12, vx: 0, vy: 0, bit: new THREE.Vector2(-1, 0) };
const AIM = { x: 0, y: -0.04 };
// Up and down get about as much arc per inch of mouse as side to side does.
const POSE = { PHI: 1.65, TH0: -0.28, TH_UP: 1.5, TH_DN: 1.0, RG: 0.4 };
const FF = 0.55;   // how much of the target's own motion the arms anticipate
const tgt = { com: V(), err: V(), vff: V(), q: new THREE.Quaternion(), angVel: V(), chest, wn: 15, zeta: 0.7, aMax: 160, alphaMax: 170, rollMax: 80, grav: 1, strength: 1 };
const pz = { d: V(), ephi: V(), eth: V(), grip: V(), X: V(), Z: V(), q: new THREE.Quaternion() };
const acc = { F: V(), Ty: 0, n: 0 };
const swing = { on: false, peak: 0, hit: false };
let pickupK = 1;
const env = { trees: [] };

const _v = V(), _w = V(), _f = V(), _hb = V(), _ht = V(), _sL = V(), _sR = V(), _pL = V(), _pR = V(), _look = V(), _eye = V(), _d = V(), _tmp = V();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m4 = new THREE.Matrix4();

// The clearing ------------------------------------------------------------------
function nearestTree(from = player.pos) {
  let best = null, bd = 1e9;
  for (const t of G.trees) if (t.state === 'standing') { const d = Math.hypot(t.x - from.x, t.z - from.z); if (d < bd) { bd = d; best = t; } }
  return best;
}
const yawTo = t => Math.atan2(-(t.x - player.pos.x), -(t.z - player.pos.z));
// Targeting: G.target is the tree you are locked onto, or null when you are turning freely (Q/E).
// Bearing is + to your left.
const bearing = t => wrapAng(yawTo(t) - player.yaw);
const standingNear = () => G.trees.filter(t => t.state === 'standing' && Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < 28);
// The tree you are most looking at, near ones first.
function treeAhead() {
  let best = null, bs = 1e9;
  for (const t of standingNear()) { const s = Math.abs(bearing(t)) + 0.04 * Math.hypot(t.x - player.pos.x, t.z - player.pos.z); if (s < bs) { bs = s; best = t; } }
  return best;
}
// Tab: lock onto the tree ahead, then step to the next one round to the right (Shift: left).
function cycleTarget(dir) {
  const list = standingNear(); if (!list.length) return;
  let next;
  if (!G.target || G.target.state !== 'standing') next = treeAhead();
  else {
    const b0 = bearing(G.target), ahead = t => (dir > 0 ? b0 - bearing(t) : bearing(t) - b0);
    const others = list.filter(t => t !== G.target).sort((a, b) => ((ahead(a) + 2 * Math.PI) % (2 * Math.PI)) - ((ahead(b) + 2 * Math.PI) % (2 * Math.PI)));
    next = others[0] || G.target;
  }
  setTarget(next);
}
function setTarget(t) {
  G.target = t; G.targetT = 0; player.gapPrev = t ? gapTo(t) : 9;
}
// The tree the cut readout and warnings are about: the one you are locked onto, or, turning
// freely, the one right in front of you.
function hudTree() {
  if (G.target) return G.target;
  const t = treeAhead();
  return t && Math.abs(bearing(t)) < 0.7 && gapTo(t) < 2.5 ? t : null;
}
// From your feet to the bark at chest height. Every kind of swing lands between lo and hi
// (tools/swingbot.js measures it); plant is where walking in stops you.
const CHOP = { lo: 0.82, hi: 1.13, plant: 0.97 };
const gapTo = t => Math.hypot(t.x - player.pos.x, t.z - player.pos.z) - t.radiusAt(1);

function newClearing(seed) {
  G.seed = seed;
  for (const t of G.trees) t.dispose();
  fx.clear();
  const rng = makeRng(seed * 7919 + 13);
  G.trees = [];
  for (let tries = 0; G.trees.length < 6 && tries < 800; tries++) {
    const a = rng() * Math.PI * 2, d = 3.5 + rng() * 11.5, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (G.trees.some(t => Math.hypot(t.x - x, t.z - z) < 5.4)) continue;
    const r0 = 0.15 + rng() * 0.05 + G.trees.length * 0.011;
    const height = 11 + r0 * 28 + rng() * 4;
    G.trees.push(new Tree(scene, mats, { x, z, r0, height, lean: (0.15 + rng() * 0.6) * Math.PI / 180, leanAng: rng() * Math.PI * 2, rng, id: G.trees.length }));
  }
  G.felled = 0; G.t = 0; G.timing = false; G.watch = null;
  G.stats = { swings: 0, bites: 0, bestBite: 0, bestSpeed: 0, misses: 0, total: 0, cm: 0, deaths: 0 };
  // Start at chopping distance from the smallest tree, facing it.
  const first = G.trees.reduce((a, b) => (a.r0 < b.r0 ? a : b));
  _v.set(-first.x, 0, -first.z); if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0); _v.normalize();
  player.pos.set(first.x, 0, first.z).addScaledVector(_v, first.radiusAt(1) + CHOP.plant);
  player.gapPrev = 0; player.plantT = 0;
  player.vel.set(0, 0, 0); player.sway.set(0, 0, 0); player.swayV.set(0, 0, 0); player.twist = player.twistV = 0;
  player.stamina = 1; player.stumble = 0; player.dead = false; player.deadT = 0; player.dip = 0;
  setTarget(first); player.yaw = yawTo(first); basis(player.yaw); G.tpYaw = null;
  G.lookPt.set(first.x, 0.95, first.z);
  cursor.x = cursor.sx = cursor.px = 0.45 * hand(); cursor.y = cursor.sy = cursor.py = 0.12; cursor.bit.set(-1, 0);
  sw.init = false; sw.dphi = sw.dth = 0; sw.phiU = null;
  chest.copy(player.pos).addScaledVector(B.U, 1.32).addScaledVector(B.F, 0.06);
  computeTarget(1 / 600);
  axe.place(tgt.com, pz.q);
  arms.setVisible(true);
  $('warn').textContent = '';
}

// Input -------------------------------------------------------------------------
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') $('mute').textContent = sfx.toggleMute() ? 'sound off' : '';
  if ((e.code === 'KeyT' || e.code === 'KeyV') && G.mode === 'play') { setView(VIEWS[(VIEWS.indexOf(settings.view) + 1) % VIEWS.length]); popup(VIEW_NAMES[settings.view], 'meh'); }
  if (e.code === 'BracketLeft') nudgeSens(1 / 1.15);
  if (e.code === 'BracketRight') nudgeSens(1.15);
  if (e.code === 'Escape' && input.soft && G.mode === 'play') setMode('paused');
  if (e.code === 'KeyX' && G.mode === 'play') swapGrip();
  if (e.code === 'Tab') { e.preventDefault(); if (G.mode === 'play' && !player.dead) cycleTarget(e.shiftKey ? -1 : 1); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.lmb = false; });
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  input.lmb = true;
  if (G.mode === 'play' && !input.locked) lock();
  if (G.mode === 'play' && axe.mode === 'free' && !player.dead) tryPickup();
});
addEventListener('mouseup', e => { if (e.button === 0) input.lmb = false; });
addEventListener('mousemove', e => {
  if (G.mode !== 'play' || player.dead) return;
  if (input.locked) {
    // Chrome on Windows sometimes reports one huge jump under pointer lock, worst with high-DPI,
    // high-polling mice: an event far bigger than the ones before it is dropped instead of
    // flinging the axe to the end of its swing. A real flick only loses its first event.
    const m = Math.hypot(e.movementX, e.movementY), spike = m > 12 * input.mAvg + 40;
    input.mAvg += (m - input.mAvg) * (spike ? 0.5 : 0.15);
    if (spike) return;
    limitSwing(cursor.x + e.movementX * SENS * input.sens, cursor.y - e.movementY * SENS * input.sens, 1, cursor);
  } else {
    // No pointer lock (the browser refused it, or Esc was pressed): the swing follows where the
    // pointer is on the game view, so the edge of the window is the edge of the swing.
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    const k = 1.6 * Math.sqrt(input.sens);
    limitSwing(nx * k, -ny * k + 0.1, 1, cursor);
  }
});

// How far a person can take an axe, in swing-space units (x round the body, y up and down):
// well back over either shoulder or high overhead, but not fully both at once, and never round
// behind the back. A rounded box (superellipse); slack > 1 is the give in the joints.
// The wind-up goes further over the top hand's shoulder than over the other one.
const LIMIT = { xTop: 1.5, xOff: 1.33, yU: 1.11, yD: 0.72, p: 3.2 };
function limitSwing(x, y, slack, out) {
  const nx = x / ((x * hand() > 0 ? LIMIT.xTop : LIMIT.xOff) * slack), ny = y / ((y > 0 ? LIMIT.yU : LIMIT.yD) * slack);
  const n = Math.pow(Math.abs(nx) ** LIMIT.p + Math.abs(ny) ** LIMIT.p, 1 / LIMIT.p);
  if (n > 1) { x /= n; y /= n; }
  out.x = x; out.y = y;
  return n > 1;
}
canvas.addEventListener('contextmenu', e => e.preventDefault());

function nudgeSens(k) { setSens(clamp(input.sens * k, 0.05, 3)); popup(`mouse ${Math.round(input.sens * 100)}%`, 'meh'); }
function setSens(v) { input.sens = settings.sens = v; saveSettings(); syncSettingsUi(); }
// T cycles first person, over the right shoulder, over the left shoulder, and back.
const VIEWS = ['first', 'third', 'left'], VIEW_NAMES = { first: 'first person', third: 'over the right shoulder', left: 'over the left shoulder' };
if (!VIEWS.includes(settings.view)) settings.view = 'first';
const thirdPerson = () => settings.view !== 'first';
function setView(v) { settings.view = v; saveSettings(); syncSettingsUi(); }

// Settings panel: lives in the title card and moves into the pause card.
function syncSettingsUi() {
  $('setSens').value = Math.round(settings.sens * 100); $('setSensV').textContent = `${Math.round(settings.sens * 100)}%`;
  $('setMusic').value = Math.round(settings.music * 100); $('setMusicV').textContent = `${Math.round(settings.music * 100)}%`;
  $('setSfx').value = Math.round(settings.sfx * 100); $('setSfxV').textContent = `${Math.round(settings.sfx * 100)}%`;
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === settings.view);
  for (const b of document.querySelectorAll('[data-full]')) b.classList.toggle('on', (b.dataset.full === '1') === settings.full);
  for (const b of document.querySelectorAll('[data-grip]')) b.classList.toggle('on', b.dataset.grip === settings.grip);
}
$('setSens').oninput = e => setSens(e.target.value / 100);
$('setMusic').oninput = e => { settings.music = e.target.value / 100; sfx.setMusicVolume(settings.music); saveSettings(); syncSettingsUi(); };
$('setSfx').oninput = e => { settings.sfx = e.target.value / 100; sfx.setSfxVolume(settings.sfx); saveSettings(); syncSettingsUi(); };
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => setView(b.dataset.view);
for (const b of document.querySelectorAll('[data-grip]')) b.onclick = () => { if (b.dataset.grip !== settings.grip) swapGrip(); syncSettingsUi(); };
for (const b of document.querySelectorAll('[data-full]')) b.onclick = () => {
  settings.full = b.dataset.full === '1'; saveSettings(); syncSettingsUi();
  if (!settings.full && document.fullscreenElement) document.exitFullscreen().catch(() => {});
};
sfx.sfxVol = settings.sfx; sfx.musicVol = settings.music;
syncSettingsUi();

function grab() {
  const soft = () => { input.soft = true; };
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(soft); } catch { soft(); } });
  } catch { soft(); }
}
// Capture the mouse, full screen by default: with the game filling the screen a fast flick has
// nowhere to escape to, onto another monitor or out of the window.
function lock() {
  input.lockAt = performance.now(); input.mAvg = 0;
  grab();
  if (settings.full && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  setTimeout(() => { if (!input.locked) input.soft = true; }, 1200);
}
document.addEventListener('fullscreenchange', () => {
  // Some browsers drop the mouse while the screen changes size: take it back.
  if (document.fullscreenElement && G.mode === 'play' && !input.locked) grab();
});
document.addEventListener('pointerlockchange', () => {
  input.locked = document.pointerLockElement === canvas;
  if (input.locked) input.soft = false;
  else if (G.mode === 'play') {
    input.lmb = false;
    // Lost while going full screen, not by Esc: try again rather than pausing.
    if (performance.now() - (input.lockAt || 0) < 1000) grab(); else setMode('paused');
  }
});

function setMode(m) {
  G.mode = m;
  $('title').hidden = m !== 'title'; $('paused').hidden = m !== 'paused'; $('over').hidden = m !== 'over';
  document.body.classList.toggle('playing', m === 'play');
  if (m === 'paused') $('pauseCard').insertBefore($('settings'), $('resume'));
  if (m === 'title') $('titleCard').insertBefore($('settings'), $('start'));
}
const startAudio = () => { sfx.init(); sfx.startMusic(); };
$('start').onclick = () => { startAudio(); setMode('play'); lock(); };
$('resume').onclick = () => { startAudio(); setMode('play'); lock(); };
$('restart').onclick = () => { startAudio(); newClearing(G.seed + 1); setMode('play'); lock(); };
$('again').onclick =() => { newClearing(G.lastDead ? G.seed : G.seed + 1); setMode('play'); lock(); };

// The swing ---------------------------------------------------------------------
// The mouse moves a point in a 2D "swing space": x sweeps the axe around your body,
// y raises and lowers it. The arms swing the axe toward that point around a sphere
// centred on your chest, so a lagging axe still travels the arc instead of cutting across it.
const thScale = th => (th > POSE.TH0 ? POSE.TH_UP : POSE.TH_DN);
function sphere(phi, th, d, ephi, eth) {
  const cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(th), st = Math.sin(th);
  d.copy(B.R).multiplyScalar(sp * ct).addScaledVector(B.F, cp * ct).addScaledVector(B.U, st);
  ephi.copy(B.R).multiplyScalar(cp).addScaledVector(B.F, -sp);
  eth.copy(B.R).multiplyScalar(-sp * st).addScaledVector(B.F, -cp * st).addScaledVector(B.U, ct);
}
// Handle along d, bit turned the way the wrists have it aimed.
function orient(d, ephi, eth, th, out) {
  pz.X.copy(ephi).multiplyScalar(cursor.bit.x * POSE.PHI * Math.cos(th)).addScaledVector(eth, cursor.bit.y * thScale(th));
  pz.X.addScaledVector(d, -pz.X.dot(d));
  if (pz.X.lengthSq() < 1e-8) pz.X.copy(ephi).multiplyScalar(-1);
  pz.X.normalize(); pz.Z.crossVectors(pz.X, d);
  _m4.makeBasis(pz.X, d, pz.Z);
  return out.setFromRotationMatrix(_m4);
}
// The wrists keep the bit pointed at the tree while the axe is away from it, and hold it
// steady while the axe is travelling toward it.
function updateBitAim(h, phiA, thA, dphi, dth) {
  const ax = phiA / POSE.PHI, ay = (thA - POSE.TH0) / thScale(thA);
  const vx = dphi / POSE.PHI, vy = dth / thScale(thA);
  const tx = AIM.x - ax, ty = AIM.y - ay, dist = Math.hypot(tx, ty), sp = Math.hypot(vx, vy);
  const striking = sp > 1.5 && (vx * tx + vy * ty) > 0.4 * sp * dist;
  let ax2 = 0, ay2 = 0, a = 0;
  if (sp > 1.5 && vx * tx + vy * ty > 0.2 * sp * dist) {
    // A swing at the tree from any direction (down from overhead, rising from low) leads with the
    // edge; winding up away from it, the edge stays facing the tree.
    a = Math.min(1, h * 14 * smooth(1.5, 4, sp)); ax2 = vx / sp; ay2 = vy / sp;
  } else if (dist > 0.3 && !striking) { a = Math.min(1, h * 7); ax2 = tx / dist; ay2 = ty / dist; }
  if (a > 0) {
    // Turn by angle: easing the vector straight across stalls when the new aim is right behind the
    // old one, as it is at the start of every backhand wind-up.
    const cur = Math.atan2(cursor.bit.y, cursor.bit.x), ang = cur + wrapAng(Math.atan2(ay2, ax2) - cur) * a;
    cursor.bit.set(Math.cos(ang), Math.sin(ang));
  }
}

const sw = { phi: 0, th: 0, dphi: 0, dth: 0, init: false };
const _da = V(), _epA = V(), _etA = V(), _rr = V();
function computeTarget(h) {
  const cx = cursor.sx, cy = cursor.sy;
  const phiT = cx * POSE.PHI, thT = POSE.TH0 + (cy > 0 ? cy * POSE.TH_UP : cy * POSE.TH_DN);
  sphere(phiT, thT, pz.d, pz.ephi, pz.eth);
  // Arms straighten as the axe goes up, so the hands pass over your head, not through your face.
  pz.grip.copy(chest).addScaledVector(pz.d, POSE.RG + 0.19 * smooth(0.25, 1.15, thT));
  orient(pz.d, pz.ephi, pz.eth, thT, pz.q);
  tgt.com.copy(axe.gripRel).applyQuaternion(pz.q).multiplyScalar(-1).add(pz.grip);
  if (sw.init) { sw.dphi += ((phiT - sw.phi) / h - sw.dphi) * 0.2; sw.dth += ((thT - sw.th) / h - sw.dth) * 0.2; }
  sw.phi = phiT; sw.th = thT; sw.init = true;
  // Where the axe actually is on its sphere, and how fast it is going round.
  _rr.subVectors(axe.x, chest); const r = Math.max(0.2, _rr.length()); _rr.divideScalar(r);
  // Track the angle round the body continuously: wrapped to ±180°, a swing that carried past your
  // side would look shortest the other way, round your back.
  const raw = Math.atan2(_rr.dot(B.R), _rr.dot(B.F));
  sw.phiU = sw.phiU == null ? raw : sw.phiU + wrapAng(raw - sw.phiU);
  const phiA = sw.phiU, thA = Math.asin(clamp(_rr.dot(B.U), -1, 1));
  sw.phiA = phiA; sw.thA = thA;
  sphere(phiA, thA, _da, _epA, _etA);
  const ctA = Math.max(0.15, Math.cos(thA));
  updateBitAim(h, phiA, thA, axe.v.dot(_epA) / (r * ctA), axe.v.dot(_etA) / r);
  const rt = tgt.com.distanceTo(chest);
  tgt.err.copy(_epA).multiplyScalar((phiT - phiA) * r * ctA).addScaledVector(_etA, (thT - thA) * r).addScaledVector(_da, rt - r);
  tgt.vff.copy(_epA).multiplyScalar(sw.dphi * FF * r * ctA).addScaledVector(_etA, sw.dth * FF * r);
  // Held out along the radius, bit aimed; it turns with the swing.
  orient(_da, _epA, _etA, thA, tgt.q);
  tgt.angVel.crossVectors(_da, axe.v).divideScalar(r);
}

// The axe itself can't be carried past what shoulders and wrists allow, however hard it is swung:
// past the limit it is put back on it and stops going further.
const _lim = { x: 0, y: 0 }, _jl = V();
function jointLimit() {
  _rr.subVectors(axe.x, chest); const r = _rr.length(); if (r < 0.2) return; _rr.divideScalar(r);
  const phi = sw.phiU + wrapAng(Math.atan2(_rr.dot(B.R), _rr.dot(B.F)) - sw.phiU), th = Math.asin(clamp(_rr.dot(B.U), -1, 1));
  const ax = phi / POSE.PHI, ay = (th - POSE.TH0) / thScale(th);
  if (!limitSwing(ax, ay, 1.08, _lim)) return;
  const thc = POSE.TH0 + _lim.y * (_lim.y > 0 ? POSE.TH_UP : POSE.TH_DN);
  sphere(_lim.x * POSE.PHI, thc, _da, _epA, _etA);
  _jl.copy(chest).addScaledVector(_da, r);
  _d.subVectors(axe.x, _jl); const L = _d.length();
  axe.x.copy(_jl); sw.phiU = _lim.x * POSE.PHI;
  if (L > 1e-6) { _d.divideScalar(L); const vo = axe.v.dot(_d); if (vo > 0) axe.v.addScaledVector(_d, -vo * 1.15); }
}

function updateDrive() {
  const tense = input.lmb && G.mode === 'play' && !player.dead;
  const st = 0.42 + 0.58 * smooth(0, 0.4, player.stamina);
  // Changing hands, one hand is off the handle (two hands hold about 1.4x what one does); and a
  // backhand, swinging toward the top hand's side, has less behind it than a forehand.
  const regrip = grip.t > 0 ? 1 / 1.4 : 1, back = 1 - 0.15 * smooth(1, 4, (sw.dphi || 0) * hand());
  const k = (tense ? 1 : 0.36) * st * (player.stumble > 0 ? 0.35 : 1) * pickupK * regrip * back;
  tgt.wn = tense ? 15 : 8; tgt.zeta = tense ? 0.7 : 0.62;
  tgt.aMax = 95 * k + 5; tgt.alphaMax = 170 * k + 6; tgt.rollMax = 80 * k + 8;
  tgt.grav = tense ? 1 : 0.92; tgt.strength = k;
  return tense;
}

function movePlayer(h) {
  if (player.dead || G.mode !== 'play') { player.vel.multiplyScalar(1 - Math.min(1, h * 8)); return; }
  // Q/E turn you, which lets go of the tree you were locked onto: walk and face anywhere.
  const turnKey = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if (turnKey && G.target) { setTarget(null); if (cooled('free', 1.5)) popup('free to turn', 'meh', 'Tab locks onto a tree'); }
  const t = G.target;
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  // Walking up to a tree you plant your feet at chopping distance; keep holding W to go closer.
  const gap = t ? gapTo(t) : 9;
  if (f > 0 && player.gapPrev > CHOP.plant && gap <= CHOP.plant && axe.mode !== 'stuck') {
    _d.set(player.pos.x - t.x, 0, player.pos.z - t.z).normalize();
    player.pos.set(t.x, 0, t.z).addScaledVector(_d, CHOP.plant + t.radiusAt(1));
    player.vel.set(0, 0, 0); player.plantT = 0.6;
  }
  player.gapPrev = gap;
  if (f > 0 && player.plantT > 0) { player.plantT -= h; f = 0; } else if (f <= 0) player.plantT = 0;
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const run = keys.ShiftLeft || keys.ShiftRight ? 2.2 : 1;
  const sp = 2.0 * run * (axe.mode === 'stuck' ? 0.35 : 1) * (player.stumble > 0 ? 0.5 : 1);
  _w.copy(B.F).multiplyScalar(f).addScaledVector(B.R, s);
  if (_w.lengthSq() > 1) _w.normalize();
  player.vel.lerp(_w.multiplyScalar(sp), Math.min(1, h * 10));
  const d0 = t ? Math.hypot(player.pos.x - t.x, player.pos.z - t.z) : 0;
  player.pos.addScaledVector(player.vel, h);
  // Strafing near a tree walks you around it rather than away from it.
  if (t && f === 0 && s !== 0 && d0 < 4) {
    _d.set(player.pos.x - t.x, 0, player.pos.z - t.z); const d1 = _d.length();
    if (d1 > 1e-3) player.pos.set(t.x, 0, t.z).addScaledVector(_d, d0 / d1);
  }
  const moved = player.vel.length() * h;
  player.stepD += moved; if (player.stepD > 0.75) { player.stepD = 0; sfx.step(); }
  player.bob += moved * 7.5;
  for (const tr of G.trees) {
    if (tr.state === 'falling' && !tr.stump) continue;
    const r = tr.radiusAt(0.5) + 0.32;
    _d.set(player.pos.x - tr.x, 0, player.pos.z - tr.z); const d = _d.length();
    if (d < r && d > 1e-4) player.pos.set(tr.x, 0, tr.z).addScaledVector(_d, r / d);
  }
  const R = Math.hypot(player.pos.x, player.pos.z); if (R > 19) player.pos.multiplyScalar(19 / R);
  // An axe stuck in the wood keeps you on the end of your arms.
  if (axe.mode === 'stuck') {
    axe.toWorld(axe.gripRel, _hb);
    _v.copy(player.pos).addScaledVector(B.U, 1.32 - player.dip).addScaledVector(B.F, 0.06).add(player.sway);
    _d.subVectors(_v, _hb); const d = _d.length();
    if (d > REACH + 0.05) { _d.multiplyScalar((d - REACH - 0.05) / d); player.pos.x -= _d.x; player.pos.z -= _d.z; }
  }
  if (t) {
    const turn = (axe.mode === 'stuck' ? 0.6 : 3.2) * h;
    player.yaw += clamp(wrapAng(yawTo(t) - player.yaw), -turn, turn);
  } else player.yaw += turnKey * (axe.mode === 'stuck' ? 0.6 : 2.2) * h;
}

function physicsStep(h) {
  const a = 1 - Math.exp(-h / 0.016);
  cursor.sx += (cursor.x - cursor.sx) * a; cursor.sy += (cursor.y - cursor.sy) * a;
  movePlayer(h);
  basis(player.yaw);
  const tense = updateDrive();
  // Putting your weight into a hard chop downward in front of you: knees and hips drop the
  // shoulders, quickly on the way down and back up at leisure.
  const dipT = axe.mode === 'held' ? 0.15 * smooth(2, 7, -axe.v.y) * smooth(1.3, 0.5, Math.abs(sw.phiA || 0)) * (tense ? 1 : 0.3) : 0;
  player.dip += (dipT - player.dip) * Math.min(1, h * (dipT > player.dip ? 14 : 3.5));
  chest.copy(player.pos).addScaledVector(B.U, 1.32 - player.dip).addScaledVector(B.F, 0.06).add(player.sway);
  if (pickupK < 1) pickupK = Math.min(1, pickupK + h * 1.6);
  computeTarget(h);
  axe.step(h, tgt, env);
  if (axe.mode === 'held') jointLimit();
  if (axe.mode !== 'free') {
    acc.F.sub(axe.F);
    _d.subVectors(axe.x, chest); _v.crossVectors(_d, axe.F).add(axe.T);
    acc.Ty -= _v.y;
  }
  acc.n++;
  const ex = axe.mode === 'free' ? 0 : Math.min(1.2, axe.effort || 0);
  if (tense) player.stamina -= (0.025 + 0.17 * ex * ex) * h;
  else player.stamina += 0.2 * h;
  player.stamina = clamp(player.stamina, 0, 1);
}

function updateBody(dt) {
  const n = Math.max(1, acc.n);
  _f.copy(acc.F).divideScalar(n).addScaledVector(axe.reachJ, 1 / Math.max(dt, 1e-3)); _f.y = 0;
  axe.reachJ.set(0, 0, 0);
  const ty = acc.Ty / n;
  acc.F.set(0, 0, 0); acc.Ty = 0; acc.n = 0;
  player.swayV.addScaledVector(_f, dt / 60).addScaledVector(player.sway, -70 * dt).multiplyScalar(Math.max(0, 1 - 9 * dt));
  player.sway.addScaledVector(player.swayV, dt);
  if (player.sway.length() > 0.12) player.sway.setLength(0.12);
  player.twistV += (ty / 30 - 80 * player.twist) * dt; player.twistV *= Math.max(0, 1 - 10 * dt);
  player.twist = clamp(player.twist + player.twistV * dt, -0.25, 0.25);
  if (player.stumble > 0) player.stumble -= dt;

  // Swings: from when the head gets moving to when it stops. A huge miss spins you round.
  const hs = axe.mode === 'held' ? axe.pointVel(axe.toWorld(axe.headRel, _tmp), _v).length() : 0;
  sfx.whoosh(axe.mode === 'held' ? hs : 0);
  if (!swing.on && hs > 9) { swing.on = true; swing.peak = hs; swing.hit = false; }
  if (swing.on) {
    swing.peak = Math.max(swing.peak, hs);
    if (hs < 3.5 || axe.mode !== 'held') {
      swing.on = false; G.stats.swings++;
      if (!swing.hit && swing.peak > 16.5 && axe.mode === 'held' && G.mode === 'play') {
        player.stumble = 0.9; player.twistV += 4 * Math.sign(player.twist || 1); sfx.whoa(); popup('whoa, big miss', 'bad');
      }
      if (!swing.hit) G.stats.misses++;
    }
  }
  G.headSpeed = hs;
}

// Events --------------------------------------------------------------------------
function popup(text, cls = '', sub = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls;
  el.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  $('pops').prepend(el);
  while ($('pops').children.length > 4) $('pops').lastChild.remove();
  setTimeout(() => el.remove(), 1500);
}
function cooled(key, t = 0.35) { const now = performance.now() / 1000; if ((G.cool[key] || 0) > now) return false; G.cool[key] = now + t; return true; }

// Straight down from overhead, the axe meets the trunk at the top of its arc unless you stand back.
const tooHigh = () => popup('too high', 'meh', G.target && gapTo(G.target) < CHOP.plant ? 'step back (S) for an overhead, or come in at an angle' : 'chop between knee and chest');
function handleAxeEvents() {
  for (const e of axe.events) {
    if (['bite', 'tap', 'glance', 'flat', 'nowood', 'handle', 'poll', 'cheek'].includes(e.type) && swing.on) swing.hit = true;
    switch (e.type) {
      case 'bite': {
        if (!G.timing) G.timing = true;
        const cm = e.depth * 100;
        sfx.chop(e.energy, e.depth);
        G.shake = Math.max(G.shake, 0.18 + Math.min(0.5, e.energy / 500));
        _v.copy(e.normal).multiplyScalar(0.9).addScaledVector(e.u, -0.6); _v.y += 0.35; _v.normalize();
        fx.woodChips(e.surf, _v, 3 + Math.min(10, Math.floor(e.removed / 18)), 1.6 + e.energy / 70);
        fx.barkBits(e.surf, _v, 2, 1.5);
        fx.puff(e.surf, 2, 0.12, 0xe6d3ad, 0.12, 0.15, 0.7);
        G.stats.bites++; G.stats.cm += cm; G.stats.bestBite = Math.max(G.stats.bestBite, cm); G.stats.bestSpeed = Math.max(G.stats.bestSpeed, e.speed);
        popup(cm >= 3.5 ? 'deep bite' : cm >= 1.2 ? 'bite' : 'nick', cm >= 3.5 ? 'great' : 'good', `${cm.toFixed(1)} cm · ${e.speed.toFixed(0)} m/s`);
        afterCut(e.tree);
        break;
      }
      case 'tap': sfx.chop(e.energy * 0.5, 0); if (cooled('tap')) popup('tap', 'meh', 'swing harder: wind up and hold the mouse button'); fx.barkBits(e.point, e.normal, 1, 1); if (e.depth > 0.002) afterCut(e.tree); break;
      case 'glance': sfx.glance(e.energy); if (e.energy > 20 && cooled('glance')) { if (e.tree && e.point.y > CUT_HI) tooHigh(); else popup('glanced off', 'bad', 'hit edge-first'); } fx.barkBits(e.point, e.normal, 3, 2); break;
      case 'flat': sfx.flat(e.energy); if (e.energy > 20) { G.shake += 0.2; if (cooled('flat')) popup('flat of the blade', 'bad'); } maybeDrop(e, 90); break;
      case 'nowood': sfx.flat(e.energy * 0.6); if (cooled('nowood')) { if (e.point.y > CUT_HI - 0.02) tooHigh(); else popup('too low', 'meh', 'chop between knee and chest'); } break;
      case 'handle':
        if (e.energy < 4) break;
        sfx.handle(e.energy); G.shake += Math.min(0.4, e.energy / 150); player.stamina -= Math.min(0.08, e.energy / 900);
        if (cooled('handle')) popup('handle!', 'bad', 'too close: step back'); maybeDrop(e, 55); break;
      case 'poll': case 'cheek': if (e.energy < 4) break; sfx.flat(e.energy); if (e.energy > 25 && cooled('clunk')) popup('clunk', 'bad', 'wrong end'); maybeDrop(e, 90); break;
      case 'dirt': if (e.energy > 3) sfx.dirt(e.energy); if (e.stuck) { popup('stuck in the dirt', 'meh', 'yank it out'); } fx.puff(e.point, 3, 0.18, 0x8d7756, 0.2, 0.3, 1); break;
      case 'yank': sfx.yank(); break;
      case 'wiggle': sfx.wiggle(); break;
      case 'clatter': if (e.energy > 2) sfx.handle(e.energy * 0.4); break;
      case 'dropped': popup('dropped it!', 'bad', 'walk over and click to pick it up'); break;
    }
  }
  axe.events.length = 0;
}

function maybeDrop(e, threshold) {
  if (axe.mode !== 'held' || input.lmb || e.energy < threshold) return;
  axe.drop();
}
function tryPickup() {
  _v.subVectors(axe.x, chest);
  if (_v.length() > 1.5) { if (cooled('far')) popup('too far to reach', 'meh'); return; }
  axe.mode = 'held'; axe.sleep = 0; pickupK = 0.15;
  sfx.yank();
}

function afterCut(tree) {
  const an = tree.analysis;
  if (an.ratio >= 1) startFall(tree);
  else if (an.ratio > 0.72 && !tree.creaked) { tree.creaked = true; sfx.creak(0.55); popup('it creaks…', 'warn'); }
}
function startFall(tree) {
  tree.startFall();
  sfx.creak(1); G.shake += 0.15;
  G.watch = tree; G.watchT = 0;
}

function handleTreeEvents(list) {
  for (const e of list) {
    const t = e.tree, dist = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
    if (e.type === 'go') { sfx.crack(); popup('TIMBER!', 'big'); }
    if (e.type === 'crash') {
      sfx.crash(dist); G.shake = Math.max(G.shake, clamp(1.4 - dist * 0.06, 0.3, 1.2));
      t.axisDir(_d);
      for (let s = 2; s < t.L; s += 1.6) {
        _v.copy(t.pivot).addScaledVector(_d, s); _v.y = 0.1;
        fx.puff(_v, 1, 1.1, 0xcab89a, 1.4, 0.5, 2.2);
        // Where the crown hits, branches break off and needles go everywhere.
        if (s > t.crownBase - t.breakH) {
          fx.needles(_v, B.U, 6, 3);
          t.crownPoint(s, _w); fx.branches(_w, B.U, 2 + Math.floor(Math.random() * 3), 3.2);
          fx.puff(_w, 1, 0.8, 0x56653f, 0.9, 0.4, 1.6);
        }
      }
    }
    if (e.type === 'snap') {
      sfx.snap(dist, e.big);
      fx.branches(e.point, B.U, e.big ? 3 : 1, e.big ? 2.6 : 1.8, e.big ? 1.4 : 1);
      fx.needles(e.point, B.U, e.big ? 6 : 3, 1.6);
    }
    if (e.type === 'bounce') sfx.thud();
    if (e.type === 'down') {
      G.felled++;
      if (G.felled >= G.trees.length && !player.dead) setTimeout(() => finish(), 1800);
    }
  }
}

function die() {
  if (player.dead) return;
  player.dead = true; player.deadT = 0; G.stats.deaths++;
  sfx.thud(); sfx.crash(1); G.shake = 1.5;
  if (axe.mode !== 'free') { axe.drop(); axe.v.set((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3); }
  arms.setVisible(false);
  popup('you were felled', 'big');
  setTimeout(() => showOver(true), 1900);
}
function finish() {
  if (G.mode !== 'play') return;
  showOver(false);
}
function showOver(dead) {
  const s = G.stats, hitPct = s.swings ? Math.round(100 * s.bites / Math.max(1, s.swings)) : 0;
  G.lastDead = dead;
  $('overT').textContent = dead ? 'Felled by your own tree.' : 'Clearing cleared.';
  $('overP').textContent = dead
    ? 'Trees fall toward the side you chop out. Notch the side you want it to land on, then finish it from the other side, and get out of the way.'
    : `${G.felled} trees down in ${fmtTime(G.t)}.`;
  $('overS').innerHTML = `<div><b>${G.felled}/${G.trees.length}</b><span>felled</span></div><div><b>${s.bites}</b><span>bites</span></div><div><b>${s.bestBite.toFixed(1)} cm</b><span>best bite</span></div><div><b>${hitPct}%</b><span>swings that bit</span></div>`;
  $('again').textContent = dead ? 'Try again' : 'New clearing';
  document.exitPointerLock?.();
  setMode('over');
}
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function dangerCheck() {
  let msg = '', cls = '';
  for (const t of G.trees) {
    if (t.state !== 'falling') continue;
    const rx = player.pos.x - t.pivot.x, rz = player.pos.z - t.pivot.z;
    const along = rx * t.fallDir.x + rz * t.fallDir.z, perp = Math.abs(rx * t.fallDir.z - rz * t.fallDir.x);
    if (along > -0.6 && along < t.L + 1.5 && perp < t.radiusAtS(Math.max(0, along)) + 0.8) { msg = 'MOVE! It’s coming down on you'; cls = 'hot'; }
  }
  const tr = hudTree();
  if (!msg && tr && tr.analysis.ratio > 0.55) {
    _v.set(player.pos.x - tr.x, 0, player.pos.z - tr.z).normalize();
    if (_v.x * tr.analysis.fx + _v.z * tr.analysis.fz > 0.64) msg = 'Careful: it will fall toward you';
  }
  const w = $('warn'); if (w.textContent !== msg) w.textContent = msg; w.className = 'hud ' + cls;
}

// Camera, arms, HUD ------------------------------------------------------------------
function updateCamera(dt) {
  basis(player.yaw);
  if (G.watch) {
    G.watchT += dt;
    if (G.watch.state === 'down') G.watchDown = (G.watchDown || 0) + dt; else G.watchDown = 0;
    if (G.watchDown > 1.6 || G.watchT > 14) { G.watch = null; G.watchDown = 0; }
  }
  const t = G.target;
  if (G.watch && G.watch.state !== 'standing' && Math.hypot(G.watch.x - player.pos.x, G.watch.z - player.pos.z) < 25) {
    const w = G.watch; w.axisDir(_d);
    _look.copy(w.pivot).addScaledVector(_d, Math.min(w.L * 0.45, 6 + G.watchT * 1.5));
  } else if (t) _look.set(t.x, 0.95, t.z);
  else _look.copy(player.pos).addScaledVector(B.F, 4).setY(1.2);
  G.lookPt.lerp(_look, 1 - Math.exp(-dt * 4));
  _eye.copy(player.pos).addScaledVector(B.U, 1.62 - player.dip * 0.85).addScaledVector(B.F, 0.03).addScaledVector(player.sway, 0.6);
  _eye.y += Math.sin(player.bob) * 0.012; _eye.addScaledVector(B.R, Math.cos(player.bob * 0.5) * 0.008);
  // Raising the axe straight overhead you lean back a touch and look up after it, so your arms go
  // up in front of you. A wind-up over a shoulder keeps your eyes on the tree.
  const raise = smooth(0.3, 1.3, G.camTh || 0) * smooth(1.0, 0.4, Math.abs(G.camPhi || 0));
  if (!G.watch && !player.dead) _eye.addScaledVector(B.F, -0.15 * raise).addScaledVector(B.U, -0.03 * raise);
  const dx = G.lookPt.x - _eye.x, dy = G.lookPt.y - _eye.y, dz = G.lookPt.z - _eye.z;
  let yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz)), roll = -player.sway.dot(B.R) * 0.6;
  // Your head turns a little after your hands, and comes back to the tree quickly as you swing.
  const follow = axe.mode !== 'free' && !player.dead;
  const phiT = follow ? clamp(sw.phiA || 0, -1.8, 1.8) : 0, thT = follow ? clamp((sw.thA || 0) - POSE.TH0, -0.6, 1.4) : 0;
  G.camPhi = (G.camPhi || 0) + (phiT - (G.camPhi || 0)) * (1 - Math.exp(-dt * (Math.abs(phiT) < Math.abs(G.camPhi || 0) ? 12 : 5)));
  G.camTh = (G.camTh || 0) + (thT - (G.camTh || 0)) * (1 - Math.exp(-dt * (thT < (G.camTh || 0) ? 12 : 5)));
  if (!G.watch) { yaw = player.yaw + player.twist * 0.5 - G.camPhi * 0.13; pitch = THREE.MathUtils.lerp(clamp(pitch * 0.72, -0.5, 0.15) + G.camTh * 0.08, 0.3, raise); }
  if (player.stumble > 0) roll += Math.sin(player.stumble * 14) * 0.03 * player.stumble;
  G.shake = Math.max(0, G.shake - dt * 2.8);
  const s = G.shake * G.shake * 0.03;
  yaw += (Math.random() - 0.5) * s; pitch += (Math.random() - 0.5) * s;
  if (thirdPerson()) {
    // Over the right (or left) shoulder, close enough to see the edge meet the wood, looking at
    // where it does; pulled back while a tree comes down.
    const side = settings.view === 'left' ? -1 : 1;
    G.tpSide = (G.tpSide ?? side) + (side - (G.tpSide ?? side)) * (1 - Math.exp(-dt * 6));
    G.tpYaw = G.tpYaw ?? player.yaw;
    G.tpYaw += wrapAng(player.yaw - G.tpYaw) * (1 - Math.exp(-dt * 5));
    G.tpBack = (G.tpBack ?? 0) + ((G.watch ? 1 : 0) - (G.tpBack ?? 0)) * (1 - Math.exp(-dt * 2));
    const tf = _v.set(-Math.sin(G.tpYaw), 0, -Math.cos(G.tpYaw)), tr = _w.set(-tf.z, 0, tf.x), wb = G.tpBack;
    // Far enough out to the side that your body is not between the camera and the cut.
    _eye.copy(player.pos).addScaledVector(tf, -1.85 - 0.8 * wb).addScaledVector(tr, (1.15 - 0.2 * wb) * G.tpSide).setY(1.75 + 0.5 * wb - player.dip * 0.5);
    _tmp.copy(player.pos).addScaledVector(tf, 1.0).addScaledVector(tr, 0.12 * G.tpSide).setY(1.15).lerp(G.lookPt, G.watch ? 0.85 : 0.15);
    const ex = _tmp.x - _eye.x, ey = _tmp.y - _eye.y, ez = _tmp.z - _eye.z;
    yaw = Math.atan2(-ex, -ez) + (Math.random() - 0.5) * s; pitch = Math.atan2(ey, Math.hypot(ex, ez)) + (Math.random() - 0.5) * s; roll = 0;
  } else if (player.dead) {
    player.deadT += dt; const k = smooth(0, 0.7, player.deadT);
    _eye.y = THREE.MathUtils.lerp(_eye.y, 0.22, k); roll += k * 1.25; pitch = THREE.MathUtils.lerp(pitch, 0.35, k);
  }
  camera.position.copy(_eye);
  camera.rotation.set(pitch, yaw, roll, 'YXZ');
}

// Third person: pose Timberline's faller on the axe (or the simple lumberjack if it hasn't loaded).
const _c = V(), _sh = V(), _pole = V(), _feet = [V(), V()], _poles = [V(), V()], _torsoTP = {};
// [side, forward, right] from where you stand; the hips sit about 15 cm behind that point. The
// foot on the top hand's side goes back, the other one forward.
const feet = () => { const h = hand(); return [[settings.grip, -0.19, 0.2 * h], [settings.grip === 'R' ? 'L' : 'R', 0.08, -0.19 * h]]; };
// Where one hand holds the handle, sliding between the knob and the top as you change grip.
const _rel = V();
const handPoint = (side, out) => axe.renderPoint(_rel.lerpVectors(axe.gripRel, axe.topRel, grip.u[side]), out);
function poseBody(dt) {
  const third = thirdPerson();
  const fig = body.fig;
  if (fig) fig.root.visible = third;
  body.simple.setVisible(third && !fig);
  arms.setVisible(!player.dead && (!third || !fig));
  if (!third) return;
  basis(player.yaw);
  const moving = Math.min(1, player.vel.length() / 2);
  if (!fig) { body.simple.update(player.pos, player.yaw, player.twist, player.sway, player.bob, moving, player.dead, dt); return; }
  const root = fig.root;
  root.position.copy(player.pos).add(player.sway).setY(0);
  root.rotation.set(0, Math.atan2(-B.F.z, B.F.x), 0);
  fig.rest();
  // Weight goes over the foot on the axe's side: back onto it in the wind-up, across in the swing.
  const walking = moving > 0.2 && axe.mode !== 'stuck';
  G.weight = (G.weight || 0) + ((walking || axe.mode === 'free' ? 0 : clamp((sw.phiA || 0) / 1.8, -1, 1) * 0.075) - (G.weight || 0)) * (1 - Math.exp(-dt * 7));
  if (walking) { fig.speed = player.vel.length(); fig.walk(dt); }
  else fig.chopStance(1.4 - player.dip, -clamp(sw.phiA || 0, -2.2, 2.2) * 0.56 - player.twist, 0.14 + Math.max(0, -(sw.thA || 0)) * 0.25 + player.dip * 1.6, G.weight);
  // Put the faller's shoulders where the swing's shoulders are, give or take the weight shift, so
  // the feet stay where they are planted.
  root.updateMatrixWorld(true);
  _sh.copy(player.pos).addScaledVector(B.U, 1.4 - player.dip).addScaledVector(B.F, -0.07).addScaledVector(B.R, walking ? 0 : G.weight * 0.65).add(player.sway).sub(fig.shoulders());
  root.position.x += _sh.x; root.position.z += _sh.z;
  if (player.dead) { G.deadFall = Math.min(1, (G.deadFall || 0) + dt * 2.2); root.rotateZ(-G.deadFall * 1.5); root.position.y += 0.12 * G.deadFall; }
  else G.deadFall = 0;
  root.updateMatrixWorld(true);
  if (!walking && !player.dead) {
    // Feet planted where you stand, whatever the hips do.
    fig.plantFeet(feet().map(([s, fx, fz], i) => {
      const at = _feet[i].copy(player.pos).addScaledVector(B.F, fx).addScaledVector(B.R, fz).setY(fig.ankleY);
      return [s, at, _poles[i].copy(at).addScaledVector(B.F, 0.8).addScaledVector(B.R, fz * 0.6).setY(0.6)];
    }));
  }
  if (axe.mode === 'free' || player.dead) fig.armsFree(0);
  else {
    fig.j.chest.getWorldPosition(_c); fig.torso(_torsoTP);
    fig.reach('R', handPoint('R', _ht), _pole.copy(_c).addScaledVector(B.R, 0.7).addScaledVector(B.F, -0.2).setY(_c.y - 0.45), _torsoTP);
    fig.reach('L', handPoint('L', _hb), _pole.copy(_c).addScaledVector(B.R, -0.6).addScaledVector(B.F, -0.2).setY(_c.y - 0.6), _torsoTP);
  }
  if (G.target) fig.look(_tmp.set(G.target.x, 1.0, G.target.z));
  else fig.look(_tmp.copy(player.pos).addScaledVector(B.F, 3).setY(1.0));
  fig.tick(dt);
}

const _tR = V(), _tF = V();
// Your own chest and head, which the first-person arms keep out of (see elbow.js). The head is
// drawn big so the elbows stay out of your face as well as out of your skull.
const _torsoFP = { c: V(), f: V(), r: V(), u: new THREE.Vector3(0, 1, 0), fx: -0.02, a: 0.12, b: 0.16, y0: -0.5, y1: 0.15, y2: 0.55, hr: 0.19 };
function updateArms() {
  basis(player.yaw);
  // The shoulders turn with the swing: back on the side you wind up to, round on the follow-through.
  const ta = G.shoulderTurn = (G.shoulderTurn || 0) + (clamp((sw.phiA || 0) * 0.5 * hand(), -1.0, 0.9) * hand() - (G.shoulderTurn || 0)) * 0.25;
  _tR.copy(B.R).multiplyScalar(Math.cos(ta)).addScaledVector(B.F, -Math.sin(ta));
  _tF.copy(B.F).multiplyScalar(Math.cos(ta)).addScaledVector(B.R, Math.sin(ta));
  if (axe.mode === 'free') {
    _hb.copy(chest).addScaledVector(B.F, 0.32).addScaledVector(B.U, -0.42).addScaledVector(B.R, -0.16);
    _ht.copy(chest).addScaledVector(B.F, 0.32).addScaledVector(B.U, -0.42).addScaledVector(B.R, 0.16);
  } else { handPoint('L', _hb); handPoint('R', _ht); }
  // A hand reaching across the chest brings its shoulder forward and in.
  const c = _torsoFP.c.copy(player.pos).addScaledVector(B.U, 1.25).add(player.sway);
  const across = (H, s) => clamp(-_d.subVectors(H, c).dot(_tR) * s / 0.35 + 0.25, 0, 1);
  const aL = across(_hb, -1), aR = across(_ht, 1);
  _sL.copy(player.pos).addScaledVector(B.U, 1.4 - player.dip - 0.012 * aL).addScaledVector(_tR, -0.19 + 0.035 * aL).addScaledVector(_tF, -0.07 + 0.075 * aL).add(player.sway);
  _sR.copy(player.pos).addScaledVector(B.U, 1.4 - player.dip - 0.012 * aR).addScaledVector(_tR, 0.19 - 0.035 * aR).addScaledVector(_tF, -0.07 + 0.075 * aR).add(player.sway);
  _torsoFP.f.copy(_tF); _torsoFP.r.copy(_tR);
  _pL.copy(_tR).multiplyScalar(-0.7).addScaledVector(B.U, -0.7).addScaledVector(_tF, -0.2);
  _pR.copy(_tR).multiplyScalar(0.7).addScaledVector(B.U, -0.7).addScaledVector(_tF, -0.2);
  arms.update([_sL, _sR], [_hb, _ht], [_pL, _pR], axe.renderQ, thirdPerson() ? null : camera.position, _torsoFP);
}

const cutCanvas = $('cut'), cutCtx = cutCanvas.getContext('2d');
let hudT = 0;
function drawCut() {
  const t = hudTree(), c = cutCtx, W = cutCanvas.width, H = cutCanvas.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
  if (!t) {
    c.font = '600 13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#4f4a3c';
    c.fillText(standingNear().length ? 'Tab: lock onto a tree' : '', W / 2, H / 2);
    return;
  }
  const an = t.analysis, k = an.cutFrac > 0.01 ? an.cutK : t.lastCutK, rk = t.radiusAt(sliceH(k));
  const s = (W * 0.36) / rk, NN = GRID * GRID;
  c.save(); c.translate(W / 2, H * 0.45);
  c.transform(B.R.x * s, -B.F.x * s, B.R.z * s, -B.F.z * s, 0, 0);
  c.fillStyle = '#3d2b20'; c.beginPath(); c.arc(0, 0, rk * 1.06, 0, Math.PI * 2); c.fill();
  const cs = t.cs;
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const idx = k * NN + i * GRID + j; if (!t.orig[idx]) continue;
    c.fillStyle = t.grid[idx] ? '#e2c48c' : '#1b1712';
    c.fillRect(t.cellX(i) - cs * 0.53, t.cellX(j) - cs * 0.53, cs * 1.06, cs * 1.06);
  }
  // Which way it would go if it went now.
  const r = an.ratio, col = r > 0.85 ? '#e0452b' : r > 0.55 ? '#e3a72f' : '#58a35b';
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3.5 / s; c.lineCap = 'round';
  const L = rk * (1.25 + 0.5 * Math.min(1, r)), ax = an.cx + an.fx * L, az = an.cz + an.fz * L;
  c.globalAlpha = 0.08 + 0.92 * smooth(0.28, 0.65, r);
  c.beginPath(); c.moveTo(an.cx, an.cz); c.lineTo(ax, az); c.stroke();
  const px = -an.fz, pzz = an.fx, hw = rk * 0.18;
  c.beginPath(); c.moveTo(ax + an.fx * hw * 1.4, az + an.fz * hw * 1.4); c.lineTo(ax + px * hw, az + pzz * hw); c.lineTo(ax - px * hw, az - pzz * hw); c.closePath(); c.fill();
  c.restore();
  // You, always at the bottom looking up at it.
  const g = gapTo(t), d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
  const ideal = g >= CHOP.lo && g <= CHOP.hi;
  c.fillStyle = ideal ? '#3f8a45' : '#8a7550';
  c.beginPath(); c.moveTo(W / 2, H - 30); c.lineTo(W / 2 - 7, H - 18); c.lineTo(W / 2 + 7, H - 18); c.closePath(); c.fill();
  c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = ideal ? '#2f6e35' : '#4f4a3c';
  c.fillText(g < CHOP.lo ? `${d.toFixed(1)} m · too close` : g > CHOP.hi ? (d > 3 ? `${d.toFixed(1)} m` : `${d.toFixed(1)} m · step in`) : `${d.toFixed(1)} m · in reach`, W / 2, H - 4);
}

function updateHud(dt) {
  const soft = G.mode === 'play' && !input.locked && !player.dead;
  document.body.classList.toggle('soft', soft); $('softnote').hidden = !soft;

  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  $('felled').textContent = `${G.felled}/${G.trees.length}`;
  $('time').textContent = fmtTime(G.t);
  $('bites').textContent = G.stats.bites;
  $('best').textContent = G.stats.bestBite ? `${G.stats.bestBite.toFixed(1)} cm` : '–';
  const st = $('stam').firstElementChild; st.style.width = `${Math.round(player.stamina * 100)}%`;
  $('stam').classList.toggle('low', player.stamina < 0.3);
  const strain = axe.mode === 'stuck' ? axe.stuck.strain : 0;
  $('stuck').style.opacity = axe.mode === 'stuck' ? 1 : 0;
  if (axe.mode === 'stuck') $('stuckT').textContent = input.lmb ? 'STUCK: pull it back out' : 'STUCK: hold the mouse button and pull back';
  $('stuck').firstElementChild.style.width = `${Math.round(Math.min(1, strain) * 100)}%`;
  const tr = hudTree(), left = G.trees.some(t => t.state === 'standing');
  $('strain').firstElementChild.style.width = tr ? `${Math.round(Math.min(1, tr.analysis.ratio) * 100)}%` : '0%';
  $('strainLbl').textContent = tr ? (tr.analysis.ratio > 0.85 ? 'about to go' : tr.analysis.cutFrac > 0.01 ? `${Math.round(tr.analysis.cutFrac * 100)}% cut` : 'untouched') : left ? 'no tree' : 'all down';
  drawCut();
  dangerCheck();
}

// Main loop ---------------------------------------------------------------------------
const treeEvents = [];
function update(dt) {
  if (G.mode === 'paused') return;
  const sub = Math.max(1, Math.ceil(dt * 600)), h = dt / sub;
  env.trees = G.trees.filter(t => Math.abs(t.x - player.pos.x) < 30 && Math.abs(t.z - player.pos.z) < 30);
  for (let i = 0; i < sub; i++) physicsStep(h);
  updateGrip(dt);
  updateBody(dt);
  handleAxeEvents();
  treeEvents.length = 0;
  for (const t of G.trees) t.updateFall(dt, treeEvents);
  handleTreeEvents(treeEvents);
  if (!player.dead) for (const t of G.trees) if (t.hitsPlayer(player.pos)) die();
  // Your tree is down: lock onto the one you are most facing. Turning freely, you stay free.
  if (G.target && G.target.state !== 'standing') setTarget(treeAhead());
  // The ring flashes bright when you switch trees, then settles.
  const tg = G.target; G.targetT = (G.targetT || 0) + dt;
  targetRing.visible = !!tg && G.mode === 'play' && !player.dead;
  if (tg) {
    const pulse = Math.exp(-G.targetT * 3);
    targetRing.position.set(tg.x, 0.03, tg.z); targetRing.scale.setScalar(tg.radiusAt(0.1) + 0.2 + 0.25 * pulse);
    targetRing.material.opacity = 0.32 + 0.5 * pulse;
  }
  if (G.timing && !player.dead && G.mode === 'play' && G.felled < G.trees.length) G.t += dt;
  fx.update(dt);
  axe.sync();
  poseBody(dt);
  updateArms();
  updateCamera(dt);
  world.follow(player.pos);
  sfx.tick();
}

let last = performance.now(), frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  resize();
  if (!frozen) update(dt);
  updateHud(dt);
  renderer.render(scene, camera);
}

newClearing(1);
setMode('title');
requestAnimationFrame(frame);

// Test hooks (local only).
if (/localhost|127\.0\.0\.1/.test(location.hostname)) {
  window.__fs = {
    G, axe, player, cursor, input, keys, tgt, pz, arms, body, grip, settings, newClearing, renderer, scene, camera, sfx, setMode,
    setCursor(x, y) { limitSwing(x, y, 1, cursor); },
    freeze(v = true) { frozen = v; },
    // Run the simulation forward without rendering: n frames of dt each.
    run(n = 1, dt = 1 / 60, each) { for (let i = 0; i < n; i++) { update(dt); if (each) each(i); } updateHud(1); renderer.render(scene, camera); },
    // Same, without drawing anything: for long headless stress runs.
    sim(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); },
  };
}
