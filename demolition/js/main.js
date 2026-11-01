import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadAssets } from './kit.js';
import { World } from './world.js';
import { Systems } from './systems.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { HALL } from './config.js';

const status = document.getElementById('status');
const say = t => { status.textContent = t; };

async function boot() {
  say('Loading physics…');
  await RAPIER.init();
  say('Loading Blender assets…');
  const assets = await loadAssets(['rack', 'server1u', 'server2u', 'gpu4u', 'crac', 'pdu', 'ups', 'floor', 'overhead', 'containment', 'fire', 'light']);
  say('Building the hall…');

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa3ad); scene.fog = new THREE.FogExp2(0x9aa3ad, 0.012);
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 80); scene.add(camera);
  { const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55; pmrem.dispose(); } // metals need something to reflect

  const hemi = new THREE.HemisphereLight(0xe9f0ff, 0x4a4a48, 1.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(1.2, 14, 0.8); sun.target.position.set(0, 0, 0); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 10, bottom: -10, near: 1, far: 30 }); sun.shadow.camera.updateProjectionMatrix(); scene.add(sun);
  // kept visible at zero intensity so the light count (and every shader) is fixed from the first frame
  const emergency = []; for (const [x, z] of [[-11, -6], [11, 6], [0, 0], [-6, 6], [6, -6]]) { const l = new THREE.PointLight(0xfff0d0, 0, 12, 1.5); l.position.set(x, 3.3, z); scene.add(l); emergency.push(l); }

  const phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); phys.timestep = 1 / 60;
  const events = new RAPIER.EventQueue(true);
  const G = { THREE, R: RAPIER, scene, phys, ents: new Map(), assets, renderer, camera };
  G.hud = new HUD(); G.audio = new Audio(); G.fx = new FX(scene);
  G.setFog = d => { scene.fog.density = d; };
  // EPO drops the critical bus and the CRACs; the house lighting is on a separate panel and stays up.
  G.setBlackout = on => {
    for (const c of G.world.cracs) G.world.kits.panel_controls.setLeds(c.id, !on);
    for (const p of G.world.pdus) G.world.kits.door.setLeds(p.id, !on);
    for (const u of G.world.upss) { G.world.kits.ups_door.setLeds(u.id, !on); }
    for (const l of emergency) l.intensity = 0;
  };
  G.systems = new Systems(G);
  G.world = new World(G);
  window.G = G; // debugging handle
  G.player = new Player(G, camera);
  G.systems.init();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.85); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

  // overlays + pointer lock
  const start = document.getElementById('start'), paused = document.getElementById('paused');
  let started = false;
  // Pointer lock when the browser allows it; otherwise a "soft lock" (mouse look without capture, or arrow keys).
  const softLock = () => { G.player.locked = true; G.player.soft = true; started = true; start.classList.add('hide'); paused.classList.remove('show'); G.hud.log('Pointer lock unavailable here: look with the mouse over the canvas or the arrow keys. Esc pauses.'); };
  const lock = () => {
    let p; try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch (e) { softLock(); return; }
    if (p && p.catch) p.catch(() => { try { const q = canvas.requestPointerLock(); if (q && q.catch) q.catch(softLock); } catch { softLock(); } });
    setTimeout(() => { if (!G.player.locked) softLock(); }, 600);
  };
  document.getElementById('play').onclick = () => { G.audio.start(); lock(); };
  paused.onclick = () => lock();
  document.addEventListener('pointerlockchange', () => {
    G.player.locked = document.pointerLockElement === canvas; G.player.soft = false;
    start.classList.toggle('hide', G.player.locked || started); paused.classList.toggle('show', !G.player.locked && started && !G.systems.over);
    if (G.player.locked) started = true;
  });
  addEventListener('keydown', e => { if (e.code === 'Escape' && G.player.soft && G.player.locked && !G.systems.over) { G.player.locked = false; paused.classList.add('show'); } });
  if (new URLSearchParams(location.search).has('nolock')) document.getElementById('play').onclick = () => { G.audio.start(); softLock(); };
  G.gameOver = (cause, kind) => {
    if (G.systems.over) return; G.systems.over = true; if (kind === 'death') G.systems.dead = true;
    G.audio.setHorn(false); G.audio.setBeep(false); G.audio.stopAll();
    G.systems.facts = facts(G);
    setTimeout(() => { document.exitPointerLock(); G.hud.report(G.systems.snapshot(), cause); }, kind === 'death' ? 1200 : 200);
  };
  document.getElementById('again').onclick = () => location.reload();

  // loop
  let last = performance.now(), acc = 0; const step = 1 / 60;
  G.hud.log('Shift started. Everything in here is live. Tab shows the objectives.');
  function frame(now) {
    requestAnimationFrame(frame);
    if (renderer.domElement.width !== Math.floor(innerWidth * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(innerHeight * renderer.getPixelRatio())) {
      if (innerWidth > 0 && innerHeight > 0) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); }
    }
    if (innerWidth === 0 || innerHeight === 0) return;
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!G.player.locked && !G.systems.over) dt = 0;
    acc += dt; let n = 0;
    while (acc >= step && n < 4) {
      G.player.update(step);
      phys.step(events);
      events.drainContactForceEvents(e => G.world.contact(e.collider1(), e.collider2(), e.totalForceMagnitude()));
      G.world.update(step); G.systems.update(step);
      acc -= step; n++;
    }
    G.fx.update(dt || 0.001, G.systems.fires);
    G.hud.update(G.systems.snapshot(), dt || 0.001);
    composer.render();
  }
  say(''); start.classList.add('ready'); document.getElementById('play').disabled = false;
  requestAnimationFrame(frame);
}

function facts(G) {
  const s = G.systems.stats, out = [];
  out.push('Downtime is costed at $9,000 per minute, the Ponemon Institute’s average for a data-centre outage, weighted by the share of racks offline.');
  if (s.discharged) out.push('Clean-agent discharge really does kill hard drives: in 2016 an inert-gas test at ING’s Bucharest data centre destroyed dozens of drives with nozzle noise alone.');
  if (s.epo) out.push('An EPO drops every breaker in the room, including cooling. It exists for firefighters, and it has ended more careers than fires.');
  if (s.toppled) out.push('A populated 42U rack weighs 600 to 1,100 kg. Seismic and standard installs bolt them to the slab or stringers for exactly this reason.');
  if (s.maxInlet > 27) out.push('ASHRAE recommends 18 to 27 °C at the server inlet. Without cooling, a megawatt hall climbs a few degrees a minute.');
  if (G.systems.deathKind === 'arc') out.push('NFPA 70E arc-flash boundaries exist because 480 V switchgear can deliver a blast equivalent to several sticks of dynamite.');
  if (G.systems.deathKind === 'smoke') out.push('Most fire deaths are from smoke, not flame; burning cable jacketing produces hydrogen chloride and cyanide within seconds.');
  return out;
}

boot().catch(e => { console.error(e); say('Failed to start: ' + e.message); });
