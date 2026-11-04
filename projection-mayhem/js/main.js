// Boot, render loop, first-person controller and the E-to-use interaction layer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, W, L, floorAt, moveCircle } from './world.js';
import { G, newGame, loadGame, hasSave, wipeSave, saveGame } from './state.js';
import * as sim from './sim.js';
import { S } from './sim.js';
import * as booth from './booth.js';
import * as ui from './ui.js';
import { UI } from './ui.js';
import { initAudio, updateAudio, sfx, setMuted, muted } from './audio.js';

const qs = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(20, +(qs.get('speed') || 1)));
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05030a);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
scene.add(camera);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ player
const PL = { x: 0, y: 0, z: 10.4, yaw: 0, pitch: -0.05, vy: 0, bob: 0 };
const EYE = 1.62, RADIUS = 0.3;
const keys = {};
let locked = false, started = false, frozen = false;
let cinematic = null;

addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea')) return;
  keys[e.code] = true;
  if (!started) return;
  if (e.code === 'Escape' && UI.modal) { ui.closeModal(); return; }
  if (ui.modalOpen() || cinematic) return;
  if (e.code === 'KeyE' && !e.repeat) useDown();
  if (e.code === 'KeyG') { if (G.carry) { sim.dropCarry(); sfx('stock'); } }
  if (e.code === 'KeyH') { document.exitPointerLock?.(); ui.handbook(); }
  if (e.code === 'KeyM') { setMuted(!muted); ui.toast(muted ? 'Sound off' : 'Sound on'); }
  if (e.code === 'KeyQ') { const k = boothScreen(); if (k && booth.motorKey(k)) sfx('clack'); }
  if (e.code === 'Space') { const k = boothScreen(); if (k && booth.changeKey(k)) sfx('clack'); e.preventDefault(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') useUp(); });
canvas.addEventListener('click', () => { if (started && !ui.modalOpen() && !cinematic) lock(); });
canvas.addEventListener('mousedown', e => { if (locked && e.button === 0) useDown(); });
canvas.addEventListener('mouseup', e => { if (e.button === 0) useUp(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; document.body.classList.toggle('locked', locked); });
// without pointer lock (embedded frames, or the user pressed Esc) dragging with a button held still looks around
let dragLook = false;
canvas.addEventListener('mousedown', () => { dragLook = true; });
addEventListener('mouseup', () => { dragLook = false; });
document.addEventListener('mousemove', e => {
  if (!locked && !(dragLook && started && !ui.modalOpen())) return;
  PL.yaw -= e.movementX * 0.0022;
  PL.pitch = Math.max(-1.45, Math.min(1.45, PL.pitch - e.movementY * 0.0022));
});
function lock() {
  const plain = () => { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {} };
  try { const p = canvas.requestPointerLock?.({ unadjustedMovement: true }); if (p?.catch) p.catch(plain); } catch { plain(); }
}
UI.onModalChange = open => { if (open) { document.exitPointerLock?.(); hold = null; } else if (started && !cinematic) lock(); };

// carried item shown in the lower right of the view
const carryHolder = new THREE.Group();
camera.add(carryHolder);
carryHolder.position.set(0.32, -0.34, -0.62);
UI.onCarry = obj => { carryHolder.clear(); if (obj) { obj.scale.setScalar(0.75); obj.rotation.set(0.2, -0.5, 0); carryHolder.add(obj); } };
const lamp = new THREE.PointLight(0xffe2c0, 0.5, 2.2); camera.add(lamp);

// ------------------------------------------------------------------ interaction
const ray = new THREE.Raycaster();
let target = null, hold = null;
function interMeshes() { const out = []; for (const d of W.interact) d.obj.traverse(c => { if (c.isMesh) out.push(c); }); return out; }
let meshCache = [], meshCount = -1;
function findTarget() {
  if (meshCount !== W.interact.length) { meshCache = interMeshes(); meshCount = W.interact.length; }
  camera.updateMatrixWorld();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = 2.8;
  const hits = ray.intersectObjects(meshCache, false);
  for (const h of hits) {
    let o = h.object; while (o && !o.userData.inter) o = o.parent;
    const d = o?.userData.inter;
    if (!d) continue;
    if (d.obj.parent === null) continue;
    const label = d.label?.();
    if (label) return { d, label, hold: (typeof d.hold === 'function' ? d.hold() : d.hold) || 0 };
  }
  return null;
}
function useDown() {
  if (!target) return;
  if (target.hold > 0) { hold = { d: target.d, t: 0, need: target.hold }; sfx('thread'); }
  else { target.d.act?.(); }
}
function useUp() { hold = null; }

function boothScreen() {
  if (PL.y < 2.5 || PL.z > 0.6) return null;
  let best = null, bd = 99;
  for (const s of G.screens) if (s.open) { const a = L.auds.find(a => a.id === s.id); const d = Math.abs(PL.x - a.cx); if (d < bd) { bd = d; best = s.id; } }
  return bd < 4.5 ? best : null;
}

// ------------------------------------------------------------------ OmniPlex roof sign + finale
let omniSign = null;
function buildOmniSign() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0d2a7a'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#ffffff'; g.font = 'bold 150px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#4aa0ff'; g.shadowBlur = 30; g.fillText('OMNIPLEX', 512, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.set(0, 1.75, 0.16);
  const back = new THREE.Mesh(new THREE.BoxGeometry(14.2, 3.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x223355, metalness: 0.6, roughness: 0.4 }));
  back.position.set(0, 1.75, 0);
  for (const x of [-5, 0, 5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), back.material); leg.position.set(x, -0.9, -0.1); grp.add(leg); }
  grp.add(back, face);
  grp.position.set(0, 10.4, 12.0);
  scene.add(grp);
  return grp;
}
UI.onFinale = on => {
  if (on) {
    document.exitPointerLock?.();
    if (!omniSign) omniSign = buildOmniSign();
    omniSign.visible = true;
    cinematic = { t: 0, dust: [] };
    document.getElementById('cine').classList.add('on');
    sfx('break');
  } else {
    cinematic = null;
    document.getElementById('cine').classList.remove('on');
    if (omniSign) { scene.remove(omniSign); omniSign = null; }
    PL.x = 0; PL.y = 0; PL.z = 10.4; PL.yaw = 0; PL.pitch = -0.05;
  }
};
function updateCinematic(dt) {
  const c = cinematic; c.t += dt;
  const T = c.t;
  camera.position.set(Math.sin(T * 0.2) * 2, 1.7, 27 - T * 0.4);
  camera.lookAt(0, 8, 12);
  if (T > 2) {
    const f = Math.min(1, (T - 2) / 2.2);
    omniSign.rotation.x = f * f * 1.4;
    omniSign.position.y = 10.4 - f * f * 9.8;
    omniSign.position.z = 12 + f * 3;
    camera.position.x += (Math.random() - 0.5) * 0.15 * f; camera.position.y += (Math.random() - 0.5) * 0.15 * f;
    if (f >= 1 && !c.landed) {
      c.landed = true; sfx('break'); sfx('stock');
      for (let i = 0; i < 60; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x8a8070, transparent: true, opacity: 0.6, depthWrite: false }));
        sp.position.set((Math.random() - 0.5) * 14, 0.5 + Math.random(), 14 + Math.random() * 3);
        sp.scale.setScalar(1 + Math.random() * 2);
        sp.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.2) * 3);
        scene.add(sp); c.dust.push(sp);
      }
    }
  }
  for (const d of c.dust) { d.position.addScaledVector(d.userData.v, dt); d.userData.v.multiplyScalar(0.97); d.material.opacity *= 0.985; d.scale.multiplyScalar(1.01); }
  if (T > 6.3) for (const d of c.dust) scene.remove(d);
}

// ------------------------------------------------------------------ update
function updatePlayer(dt) {
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const run = keys.ShiftLeft || keys.ShiftRight;
  const sp = (run ? 6.2 : 3.6) * dt;
  const sy = Math.sin(PL.yaw), cy = Math.cos(PL.yaw);
  let dx = (-sy * fwd + cy * str) * sp, dz = (-cy * fwd - sy * str) * sp;
  if (fwd && str) { dx *= 0.7071; dz *= 0.7071; }
  if (dx || dz) {
    [PL.x, PL.z] = moveCircle(PL.x, PL.z, dx, dz, RADIUS, PL.y);
    PL.bob += dt * (run ? 13 : 9);
  }
  const fy = floorAt(PL.x, PL.z, PL.y);
  if (fy > PL.y) PL.y += Math.min(fy - PL.y, dt * 6);
  else if (fy < PL.y) { PL.vy -= 20 * dt; PL.y = Math.max(fy, PL.y + PL.vy * dt); }
  if (PL.y <= fy + 1e-3) PL.vy = 0;
  camera.position.set(PL.x, PL.y + EYE + (dx || dz ? Math.sin(PL.bob) * 0.03 : 0), PL.z);
  camera.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
}

let last = performance.now(), simT = 0, raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const rdt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!frozen) step(rdt);
  composer.render();
}
function step(rdt) {
  const dt = rdt * SPEED;
  simT += dt;
  if (cinematic) { updateCinematic(rdt); sim.updateSim(0, simT); booth.updateBooth(0, simT); return; }
  const paused = started && ui.modalOpen() && !UI.splicing ? false : false;
  if (started && !ui.modalOpen()) updatePlayer(rdt);
  else camera.rotation.set(PL.pitch, PL.yaw, 0, 'YXZ');
  // which screens can be seen right now (inside the auditorium, or from the booth)
  for (const k in booth.B) booth.B[k].visible = false;
  for (const a of L.auds) if (PL.z < L.hall.z0 && Math.abs(PL.x - a.cx) < 3.5) booth.B[a.id].visible = true;
  const bs = boothScreen();
  if (bs) booth.B[bs].visible = true;
  sim.updateSim(dt, simT);
  booth.updateBooth(dt, simT);
  if (omniSign) omniSign.visible = !!G.flags.omni || !!cinematic;
  else if (G.flags.omni) omniSign = buildOmniSign();
  // interaction
  if (started && !ui.modalOpen()) {
    target = findTarget();
    if (hold) {
      if (!keys.KeyE && !mouseHeld()) hold = null;
      else if (!target || target.d !== hold.d) hold = null;
      else { hold.t += rdt; if (hold.t >= hold.need) { const d = hold.d; hold = null; d.act?.(); sfx('clack'); } }
    }
    ui.setPrompt(target?.label, target?.hold, hold ? hold.t / hold.need : 0);
  } else ui.setPrompt(null);
  ui.updateHUD(rdt, { pipScreen: bs && !booth.B[bs].show?.ended ? bs : null });
  // audio: clatter from running projectors near the player
  let near = 0;
  for (const k in booth.B) for (const P of Object.values(booth.B[k].P)) if (P.motor && P.obj && !P.digital) { const d = P.obj.position.distanceTo(camera.position); near = Math.max(near, Math.max(0, 1 - d / 9)); }
  const crowd = S.customers.filter(c => c.state !== 'seated').length;
  updateAudio(rdt, near, crowd);
}
let mouseDown = false;
canvas.addEventListener('mousedown', () => { mouseDown = true; });
addEventListener('mouseup', () => { mouseDown = false; });
function mouseHeld() { return mouseDown && locked; }

// ------------------------------------------------------------------ boot
async function boot() {
  resize();
  const [frames, splice] = await Promise.all([import('./frames.js').catch(e => { console.warn('frames.js', e); return null; }), import('./splice.js').catch(e => { console.warn('splice.js', e); return null; })]);
  booth.setFrames(frames || {});
  ui.setArt(frames || {}, splice);
  await buildWorld(scene);
  if (qs.has('reset')) wipeSave();
  const resumed = !qs.has('new') && hasSave() && loadGame();
  if (!resumed) newGame();
  S.ui = ui;
  booth.initBooth();
  sim.initSim();
  sim.settleDeliveries();
  ui.paintSigns();
  document.getElementById('loading').remove();
  const title = document.getElementById('title');
  title.classList.add('ready');
  document.getElementById('btnContinue').style.display = resumed ? '' : 'none';
  if (resumed) document.getElementById('btnContinue').textContent = `Continue (Day ${G.day})`;
  const go = async fresh => {
    initAudio();
    if (fresh && resumed) { wipeSave(); location.href = location.pathname + '?new'; return; }
    title.remove();
    started = true;
    lock();
    if (G.day === 1 && G.flags.tut === 0) { G.flags.tut = 1; await ui.intro(); }
    if (G.flags.omniPending && !G.flags.omni) sim.spawnChesler();
  };
  document.getElementById('btnNew').onclick = () => go(true);
  document.getElementById('btnContinue').onclick = () => go(false);
  requestAnimationFrame(t => { last = t; frame(t); });
}
boot().catch(e => { console.error(e); const l = document.getElementById('loading'); if (l) l.textContent = 'Failed to load: ' + e.message; });

// ------------------------------------------------------------------ test hooks
window.__pm = {
  get G() { return G; }, S, B: booth.B, W, PL, camera, ui, sim, booth,
  start() { const t = document.getElementById('title'); if (t) t.remove(); started = true; },
  tp(x, y, z, yaw = PL.yaw, pitch = PL.pitch) { PL.x = x; PL.y = y; PL.z = z; PL.yaw = yaw; PL.pitch = pitch; },
  freeze(on = true) { frozen = on; },
  step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) step(dt); },
  render() { composer.render(); },
  target() { const t = findTarget(); return t ? t.label : null; },
  use() { const t = findTarget(); if (t) t.d.act?.(); return t?.label; },
  key(code) { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); },
};
