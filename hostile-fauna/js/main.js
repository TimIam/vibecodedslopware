// Boot, the frame loop, input, and (on localhost) a bot that can play every outing headless.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { S, clamp, angDiff, loadSave, saveGame } from './state.js';
import { buildWorld } from './world.js';
import { initFx, updateFx, setParticleScale } from './fx.js';
import { initProj, updateProj } from './proj.js';
import { updateEnemies } from './enemies.js';
import { P, initViewModel, updatePlayer, recompute } from './player.js';
import { startMission, updateMission, leaveMission } from './mission.js';
import { MISSIONS } from './missions.js';
import { initAudio, setCombat } from './audio.js';
import { gradePass, cleanPass, lens } from './post.js';
import * as ui from './ui.js';

const view = document.getElementById('view'), canvas = document.getElementById('game');
let renderer, composer, bloom, camera, vw = 1, vh = 1, last = 0, clock = 0, hadLock = false, bot = false;
const keys = new Set();
const I = S.I = { f: 0, r: 0, jump: false, sprint: false, fire: false, alt: false, blink: false, look: false, use: false, useHeld: false, weapon: -1, dx: 0, dy: 0 };

function boot() {
  loadSave();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  S.scene = new THREE.Scene();
  camera = S.camera = new THREE.PerspectiveCamera(80, 1, 0.08, 1800);
  S.scene.add(camera);
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(S.scene, camera));
  composer.addPass(cleanPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.42, 0.5, 1.0); bloom.enabled = S.save.opts.bloom; composer.addPass(bloom);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
  initFx(S.scene); initProj(S.scene); initViewModel(camera); recompute();
  ui.on.startMission = i => { hadLock = false; S.paused = false; startMission(i); S.mode = 'mission'; lock(); };
  ui.on.lock = lock;
  ui.on.bloom = v => { bloom.enabled = v; };
  ui.on.preview = () => { leaveMission(); if (!S.W) buildWorld({ ...MISSIONS[0], layout: MISSIONS[0].layout }); camera.children[0].visible = false; };
  ui.initUI();
  resize(); addEventListener('resize', resize);
  bindInput();
  document.getElementById('loading').remove();
  requestAnimationFrame(frame);
}

function resize() {
  vw = view.clientWidth; vh = view.clientHeight;
  renderer.setSize(vw, vh, false); composer.setSize(vw, vh);
  camera.aspect = vw / vh; camera.updateProjectionMatrix();
  setParticleScale(vh);
}

function lock() {
  if (bot) return;
  try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* needs a click; the pause screen asks for one */ }
}

function bindInput() {
  addEventListener('keydown', e => {
    if (S.mode !== 'mission') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyQ') I.blink = true;
    if (e.code === 'KeyE') I.look = true;
    if (e.code === 'KeyF') I.use = true;
    if (e.code === 'KeyV') I.alt = true;
    if (/^Digit[1-3]$/.test(e.code)) I.weapon = +e.code.slice(5) - 1;
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); I.fire = false; });
  canvas.addEventListener('mousedown', e => {
    if (S.mode !== 'mission') return;
    initAudio();
    if (document.pointerLockElement !== canvas) { lock(); return; }
    if (e.button === 0) I.fire = true; if (e.button === 2) I.alt = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) I.fire = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement === canvas && S.mode === 'mission' && !S.paused) { I.dx += e.movementX; I.dy += e.movementY; } });
  addEventListener('wheel', e => { if (S.mode === 'mission' && document.pointerLockElement === canvas) I.weapon = (P.weapon + (e.deltaY > 0 ? 1 : 2)) % 3; }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) { hadLock = true; S.paused = false; ui.showPause(false); }
    else if (S.mode === 'mission' && hadLock && !bot) { S.paused = true; I.fire = false; keys.clear(); setCombat(0); ui.showPause(true); }
  });
}

function readKeys() {
  I.f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  I.r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  I.jump = keys.has('Space'); I.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight'); I.useHeld = keys.has('KeyF');
}

function step(dt) {
  if (bot) botThink(dt); else readKeys();
  updatePlayer(dt);
  updateEnemies(dt, camera);
  updateProj(dt);
  updateMission(dt);
  updateFx(dt, camera, vw, vh);
  S.W.update(dt, S.time, camera);
  ui.updateHud(dt, camera, vw, vh);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; clock += dt;
  if (S.mode === 'mission' && !S.paused) step(dt);
  else if (S.M && S.mode !== 'conclave' && S.mode !== 'title') {   // dialogue, death, pause: the world idles
    if (bot) ui.botSkip();
    if (S.mode === 'dead') updatePlayer(0);
    updateFx(dt, camera, vw, vh); S.W.update(0, S.time, camera);
  } else if (S.W) {                                                  // title and Conclave: a slow look round the Garden
    const a = clock * 0.05 + 1.2;
    camera.position.set(Math.cos(a) * 62, S.W.height(Math.cos(a) * 62, Math.sin(a) * 62) + 13, Math.sin(a) * 62);
    camera.rotation.set(0, 0, 0); camera.lookAt(0, 7, 0); camera.fov = 62; camera.updateProjectionMatrix();
    updateFx(dt, camera, vw, vh); S.W.update(dt, clock, camera);
  }
  lens.update(dt, clock, S.W?.haze || 0, S.mode === 'mission' ? Math.min(1, Math.max(0, P.hurtT * 2)) : 0, vw / vh);
  composer.render();
}

// ------------------------------------------------------------------ the bot
// Plays like a patient beginner: shoots what it can see, walks at the next marker, presses F when asked.
const B = { stuck: 0, side: 1, tSide: 0, lx: 0, lz: 0, hold: 0, tries: 0, best: 1e9, seen: new WeakMap() };
function botThink(dt) {
  const M = S.M, W = S.W;
  I.f = I.r = 0; I.fire = false; I.jump = false; I.sprint = false; I.useHeld = false;
  if (!P.alive || !M) return;
  const ex = camera.position.x, ey = P.pos.y + 2.3, ez = camera.position.z;
  let tgt = null, td = 70;
  for (const e of S.enemies) {
    if (e.gone || (!e.alert && M.truce)) continue;
    const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    if (d < td && W.los(ex, ey, ez, e.pos.x, e.pos.y + e.def.h * 0.6, e.pos.z)) { td = d; tgt = e; }
  }
  const marks = M.cur?.marks?.(M) || [];
  let goal = null, gd = 1e9;
  for (const m of marks) { const d = Math.hypot(m.x - P.pos.x, m.z - P.pos.z); if (d < gd) { gd = d; goal = m; } }
  let ax, ay, az, shoot = false;
  if (tgt) {   // lead it, the way a person would
    const lp = B.seen.get(tgt) || { x: tgt.pos.x, z: tgt.pos.z }, k = td / 150 / Math.max(dt, 0.001);
    ax = tgt.pos.x + (tgt.pos.x - lp.x) * k; ay = tgt.pos.y + tgt.def.h * (tgt.def.shield ? 0.9 : 0.62); az = tgt.pos.z + (tgt.pos.z - lp.z) * k; shoot = true;
  }
  else if (goal?.t && gd < 40 && !goal.t.shielded && seesTarget(ex, ey, ez, goal.t)) { ax = goal.t.x; ay = goal.t.y + goal.t.cy; az = goal.t.z; shoot = true; td = gd; }
  else if (goal) { ax = goal.x; ay = ey; az = goal.z; }
  if (ax !== undefined) {
    const dx = ax - ex, dy = ay - ey, dz = az - ez, wy = Math.atan2(-dx, -dz), wp = Math.atan2(dy, Math.hypot(dx, dz));
    const err = angDiff(wy, P.yaw); P.yaw += err * Math.min(1, dt * 14); P.pitch += (wp - P.pitch) * Math.min(1, dt * 14);
    if (shoot && Math.abs(err) < 0.08) {
      const heavy = tgt?.def.shield && tgt.stun <= 0, crowd = tgt ? S.enemies.filter(o => !o.gone && o.pos.distanceTo(tgt.pos) < 6).length : 0;
      if (tgt && crowd >= 3 && P.pods > 0 && td > 9 && td < 34) { I.weapon = 2; I.fire = true; P.pitch += td * 0.012; }
      else if ((heavy || tgt?.def.big) && P.cells > 0) { I.weapon = 1; B.hold += dt; I.fire = B.hold < 1.25; if (B.hold > 1.3) B.hold = 0; }
      else { I.weapon = 0; I.fire = true; B.hold = 0; }
    }
    if (tgt) {
      I.f = td > 22 ? 1 : td < 9 ? -1 : 0; I.r = Math.sin(S.time * 1.7) > 0 ? 1 : -1;
      const close = S.enemies.filter(o => !o.gone && o.alert && Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z) < 13).length;
      if ((close >= 2 || tgt.mode === 'speech') && P.cdLook <= 0 && td < 15) I.look = true;
      if (td < 3.6) I.alt = true;
      if (P.hp < P.maxHp * 0.45 && P.cdBlink <= 0) { I.f = -1; I.blink = true; }
    } else {
      I.f = goal && gd < 2.2 && !goal.t ? 0 : 1; I.sprint = gd > 25;
      if (goal?.t && gd < 14 && !goal.t.shielded && seesTarget(ex, ey, ez, goal.t)) I.f = 0;
    }
  }
  if (M.holding) { I.useHeld = true; I.use = true; if (M.holding.hold) I.f = I.r = 0; }
  for (const e of S.enemies) { const q = B.seen.get(e); if (q) { q.x = e.pos.x; q.z = e.pos.z; } else B.seen.set(e, { x: e.pos.x, z: e.pos.z }); }
  // Unsticking: sidestep and hop.
  const moved = Math.hypot(P.pos.x - B.lx, P.pos.z - B.lz); B.lx = P.pos.x; B.lz = P.pos.z;
  if (I.f > 0 && moved < 2 * dt) { if ((B.stuck += dt) > 0.3) { B.tries++; B.tSide = 0.6 + B.tries * 0.8; B.side = -B.side; B.stuck = 0; } } else B.stuck = Math.max(0, B.stuck - dt);
  if (gd < B.best - 4 || gd > B.best + 30) { B.best = gd; B.tries = 0; }
  if (B.tSide > 0) { B.tSide -= dt; I.r = B.side; I.jump = true; I.f = B.tSide > 0.5 ? 0 : 1; }
}

function seesTarget(ex, ey, ez, t) {
  const dx = t.x - ex, dy = t.y + t.cy - ey, dz = t.z - ez, len = Math.hypot(dx, dy, dz);
  return S.W.ray(ex, ey, ez, dx / len, dy / len, dz / len, len) >= len - t.r - 0.4;
}

// ------------------------------------------------------------------ test hooks (see README)
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.__hf = {
    S, P, I, ui,
    start(i = 0) { document.getElementById('title').classList.remove('on'); ui.on.startMission(i); },
    bot(on = true) { bot = on; },
    step(n = 1, dt = 1 / 30) { for (let k = 0; k < n; k++) { if (S.mode === 'mission') step(dt); else if (bot) ui.botSkip(); } return this.state(); },
    tp(x, z, yaw = P.yaw, pitch = P.pitch) { P.pos.set(x, S.W.height(x, z), z); P.yaw = yaw; P.pitch = pitch; P.vel.set(0, 0, 0); },
    state() { const M = S.M; return { mode: S.mode, t: +S.time.toFixed(1), stage: M?.stage, obj: document.getElementById('objMine').textContent, hp: Math.round(P.hp), sh: Math.round(P.sh), enemies: S.enemies.filter(e => !e.gone).length, alert: S.enemies.filter(e => e.alert && !e.gone).length, pos: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)], stats: M?.stats, level: S.save.level, done: S.save.done }; },
    grant(pts = 12) { S.save.pts += pts; saveGame(); },
    render() { composer.render(); },
    info() { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); const r = renderer.info.render; renderer.info.autoReset = true; return { calls: r.calls, tris: r.triangles }; },
  };
}

boot();
