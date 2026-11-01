// scene.js — the 3D hall (DESIGN.md §14.6, §15). createScene({ canvas, data, assetsBase }) → scene object:
//   pick(x, y) → rackIndex | 'uplink' | null     focus(rack)      photo() → Promise<Blob>     setBloom(bool)
//   project(rack) → { x, y } CSS px               apply(eventName, payload)   (every §14.4 bus event; never throws)
//   (pick and project both use CSS px relative to the canvas, not the page)
//   setState(state, derived)                      resize()  dispose()  setQuality('high'|'low')  start()  stop()
//   setViewportBand(topPx, bottomPx)              portrait: the canvas band (under the top panel, above the sheet) the
//                                                 3D view is fitted to; ui.js calls it whenever the HUD height changes
// The sim owns `state`; the scene keeps the reference it was given and re-reads it when a stage change or Exit lands.
// Helpers: scene_assets.js (loading, bake, textures), scene_racks.js (racks/servers/LEDs), scene_world.js (shell,
// lights, trays, infra, skyline).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadGLB, createMaterialSet, createTextures, warnOnce } from './scene_assets.js';
import { createRackField } from './scene_racks.js';
import { createWorld } from './scene_world.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const LED_GAIN = 1.7;              // LED colour × gain so emissives clear the 0.9 bloom threshold
// Garage / Colo: 63° puts the horizon through the back opening about 8% under the frame top (the skyline silhouettes
// stand there) while the camera still looks 27° down at the racks, and the room props are the show. From the Warehouse
// on the rows are the show: at 27° a 2 m rack 2.4 m ahead hides the whole next camera-facing row (the line of sight
// drops 1.22 m per row), so only the front row's LEDs read; 48° (42° down) shows rows 0/2/4 lit with the unbought rows
// as outlines, which is §15's progress bar. Both sit inside §15's 30-70° clamp.
const DEFAULT_POLAR_DEG = 63, HALL_POLAR_DEG = 48;
const defaultPolar = s => (s.stage >= 3 ? HALL_POLAR_DEG : DEFAULT_POLAR_DEG);
// A rack frame is 0.6 m wide; a tap target needs ~44 px (§17), so focus() and the Hall/Campus pinch floor go to the
// distance where 1 m is 80 px (0.6 m = 48 px). A tap that misses every rack snaps to the nearest one within this
// many CSS px (about half a pitch at the Hall fit), since the Hall/Campus fits leave frames 17-28 px wide.
const TAP_PX_PER_M = 80, PICK_SNAP_PX = 22;
// Camera on the left (-x) side: the network lane along the right wall faces -x, so its cabinets (and the uplink's
// DDoS pulse) face the camera; the front rack row faces +z either way.
const DEFAULT_AZ_DEG = { landscape: -20, portrait: -42 };
const FIT_MARGIN = { garage: 1.06, hall: 1.0 };
// Portrait: until ui.js measures the HUD, the 3D view is fitted to this band of the canvas (fractions of its height):
// under the top panel (~160 px on a 792 px canvas) and above the 30vh sheet.
const DEFAULT_BAND = [0.2, 0.6];
const PHONE_MAX_CSS_PX = 700;      // narrower canvases start on the phone quality tier (§15: half-res bloom, strength 0.6)
const SLOW_FRAME_MS = 25, SLOW_FOR_S = 3, STARTUP_GRACE_S = 2;
// The adaptive quality steps are expected on slow GPUs (software rendering, low-end phones), so they are not warnings:
// they log only with ?debug, which keeps the console clean for the acceptance line. warnOnce stays for real failures.
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
// §15 HemisphereLight sky #3a4a6a / ground #0b0e14 at 0.6 in the garage, where the bulb is the only light; from the
// Colo on it is lifted and brightened so the camera-facing faces of the white racks fill to grey instead of taking
// the stage key's tint alone (navy in the Hall, beige in the Warehouse, near-black fronts).
const HEMI_HALL = { sky: 0x6a7a9a, ground: 0x1a1f2a, intensity: 1.0 };
const easeInOut = p => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export async function createScene({ canvas, data, assetsBase = './assets/' }) {
  const { STAGES, PALETTE, CAMERA, POST, ANIM, EXIT, OFFLINE } = data;

  // ---- renderer, scene, camera, post ----------------------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = POST.exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.info.autoReset = false;
  canvas.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const bg = new THREE.Color(PALETTE.bg), hotFog = new THREE.Color(PALETTE.hotFog), warmCol = new THREE.Color(0xff7a2a);
  scene.background = bg.clone();
  scene.fog = new THREE.FogExp2(bg.clone(), STAGES[0].fog);
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.6);
  const hemiSky = new THREE.Color(PALETTE.hemiSky);
  let hemiBase = 0.6;
  scene.add(hemi);
  function setHemiForStage(s) {
    const hall = s.stage >= 2;
    hemiSky.set(hall ? HEMI_HALL.sky : PALETTE.hemiSky);
    hemi.groundColor.set(hall ? HEMI_HALL.ground : PALETTE.hemiGround);
    hemiBase = hall ? HEMI_HALL.intensity : 0.6;
  }

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.4, 500);
  camera.position.set(6, 5, 10);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.minPolarAngle = THREE.MathUtils.degToRad(CAMERA.polarDeg[0]);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(CAMERA.polarDeg[1]);
  controls.minAzimuthAngle = -THREE.MathUtils.degToRad(CAMERA.azimuthDeg);
  controls.maxAzimuthAngle = THREE.MathUtils.degToRad(CAMERA.azimuthDeg);
  controls.target.set(0, 1, 0);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), POST.bloom.strength, POST.bloom.radius, POST.bloom.threshold);
  const outputPass = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(outputPass);

  // ---- assets ---------------------------------------------------------------------------------------------------------------------
  const textures = createTextures();
  const mats = createMaterialSet(textures);
  const lib = await loadGLB(assetsBase + data.ASSETS.library);
  const ctx = { data, lib, mats, scene, textures, assetsBase, camera };
  const rackField = createRackField(ctx);
  const world = createWorld(ctx);

  // ---- state -------------------------------------------------------------------------------------------------------------------------
  let state = null, derived = null;
  let stageDef = STAGES[0];
  let fitD = 10, portrait = false, booted = false, viewportHpx = 1, band = null;
  const env = { power: 0, cooling: 0, network: 0, efficiency: 1, blackout: false, simBlackout: false, viral: false, ddos: false, heatwave: false, warm: 0, gain: LED_GAIN };
  let fade = 1, trans = null;
  let bloomFlash = 0, userBloom = true, quality = 'high', autoQuality = true, autoLevel = 0;
  let frameEma = 16, slowAcc = 0, aliveS = 0;
  let idleT = 0, orbitDir = 1, orbitBoost = 0, userMoved = false;
  let focusAnim = null, focusedRack = null, look = null, breaker = null, frozen = false, running = false, lastMs = null;
  let refreshAvail = false, lastStaff = -1, lastMitN = -1;
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);
  const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();

  // ---- camera fit ---------------------------------------------------------------------------------------------------------------
  // §15 'the stage's rack bounding box plus one lane'. The camera distance is the closed-form smallest D along the
  // view direction that puts every corner of that box inside the frustum.
  function fitBox(s) {
    const box = new THREE.Box3();
    for (const f of s.footprints) box.expandByPoint(tmpV.set(f[0], 0, f[1]));
    if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 0, 2));
    const lane = 2.4;
    if (!portrait && s.stage >= 2) {
      // half a rack either side, the lane behind, a stride in front: the lit rows own the frame and the side lanes
      // still show at its edges because the azimuth is -20°
      box.min.x -= 0.6; box.max.x += 0.6; box.min.z -= lane; box.max.z += 0.9;
      box.min.y = 0; box.max.y = 2.3;
      return box;
    }
    box.min.x -= 0.3; box.max.x += 0.3; box.min.z -= 0.6; box.max.z += 0.6;
    if (portrait) {
      // short axis on portrait: fit the row depth and the middle of the rows; the row ends are a swipe away. The extra
      // stride in front pushes the rows into the upper part of the band, so the toast column and the milestone strip
      // ui.js docks at the band's bottom overlay the empty foreground floor, not the front row's lower half; kept
      // short (0.3 / 0.8 lanes) so a garage rack is ~120 px tall on a phone, not 97 px in the middle of the band.
      const cx = (box.min.x + box.max.x) / 2, hw = Math.max(1.6, (box.max.x - box.min.x) / 2 * 0.45);
      box.min.x = cx - hw; box.max.x = cx + hw;
      box.min.z -= lane * 0.3; box.max.z += lane * 0.8;
    } else {
      // the garage: the fans and ACs in the side lanes are the show, so both lanes are in frame
      const sideX = Math.abs(s.lanes?.power?.[0]?.[0] ?? (s.size.w / 2 - 0.6));
      box.min.x = Math.min(box.min.x, -sideX - 0.6); box.max.x = Math.max(box.max.x, sideX + 0.6);
      box.min.z -= lane; box.max.z += lane * 0.6;
    }
    box.min.y = 0; box.max.y = 2.6;
    return box;
  }

  function viewDir(azDeg, polarDeg) {
    const a = THREE.MathUtils.degToRad(azDeg), p = THREE.MathUtils.degToRad(polarDeg);
    return new THREE.Vector3(Math.sin(p) * Math.sin(a), Math.cos(p), Math.sin(p) * Math.cos(a));
  }

  function fitDistance(box, dir, margin) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    const centre = box.getCenter(new THREE.Vector3());
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, Y_AXIS).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    let D = 0;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      const d = c.dot(dir);
      D = Math.max(D, Math.abs(c.dot(right)) / tanH + d, Math.abs(c.dot(up)) / tanV + d);
    }
    return D * margin;
  }

  // the distance at which 1 m is TAP_PX_PER_M px in the fitted viewport (the portrait band or the whole canvas)
  function tapDistance() { return viewportHpx / (2 * TAP_PX_PER_M * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }

  function fitCamera(s, { azDeg = portrait ? DEFAULT_AZ_DEG.portrait : DEFAULT_AZ_DEG.landscape, polarDeg = defaultPolar(s), apply = true } = {}) {
    const box = fitBox(s);
    const dir = viewDir(azDeg, polarDeg);
    const D = fitDistance(box, dir, s.stage === 1 ? FIT_MARGIN.garage : FIT_MARGIN.hall);
    fitD = D;
    // from the Warehouse on a pinch can reach the tap distance (on a phone ~5.8 m, well under 0.35 × the Campus fit)
    controls.minDistance = s.stage >= 3 ? Math.min(D * 0.35, tapDistance()) : D * 0.35;
    controls.maxDistance = D * 1.45;
    if (apply) {
      const centre = box.getCenter(new THREE.Vector3());
      centre.y = Math.min(1.2, centre.y);
      controls.target.copy(centre);
      camera.position.copy(centre).addScaledVector(dir, D);
      controls.update();
      userMoved = false; look = null; focusAnim = null; focusedRack = null;
      world.layoutSkyline(); // the far silhouettes are sized against the fitted camera
    }
    return D;
  }
  // Ease back from a focus to the stage fit (same path as focus(), aimed at the fit centre at the fit distance), so
  // the next incident elsewhere is tappable in 3D again (§8 / §17) instead of the camera staying parked on one rack.
  function unfocus() {
    const centre = fitBox(stageDef).getCenter(new THREE.Vector3());
    centre.y = Math.min(1.2, centre.y);
    focusAnim = { from: controls.target.clone(), to: centre, t: 0, d0: controls.getDistance(), d1: fitD };
    focusedRack = null;
  }
  // Whether a rack stands inside the frame the player sees (the portrait band, or the whole canvas), 5% in from its
  // edges, under the current camera.
  function rackInView(rack) {
    const p = rackField.rackPosition(rack, new THREE.Vector3());
    if (!p) return false;
    p.project(camera);
    if (p.z >= 1) return false;
    const r = canvas.getBoundingClientRect();
    const x = (p.x + 1) / 2 * r.width, y = (1 - p.y) / 2 * r.height;
    const [top, bot] = portrait ? bandPx() : [0, r.height];
    const mx = 0.05 * r.width, my = 0.05 * (bot - top);
    return x > mx && x < r.width - mx && y > top + my && y < bot - my;
  }

  // px per metre at the fit distance, in the fitted viewport (the portrait band or the whole canvas)
  function pxPerM() { return viewportHpx / (2 * fitD * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); }

  // ---- rebuild from state ---------------------------------------------------------------------------------------------------------
  let rebuildSeq = 0;
  async function rebuildFromState() {
    const seq = ++rebuildSeq;
    env.heatwave = env.viral = env.ddos = false; // the sim ends the old run's event first; this is belt-and-braces for an Exit / reset / import
    stopBreaker();                               // likewise: a new run never fades up into the old run's blackout
    const run = state?.run;
    stageDef = STAGES[Math.min(STAGES.length, Math.max(1, run?.stage || 1)) - 1];
    setHemiForStage(stageDef);
    const D = fitCamera(stageDef);
    const racks = run?.racks?.length || 0;
    await world.setStage(stageDef, { civicPresent: racks < 3, fit: D });
    if (seq !== rebuildSeq) return;
    rackField.setStage(stageDef, { fitDist: D, pxPerM: pxPerM() });
    rackField.rebuild(run);
    lastStaff = Math.floor(run?.staff || 0); lastMitN = run?.mitigations?.length || 0;
    world.setInfra(run?.infra || {}, { racks, eff: run?.effUpgrades || [], mitigations: run?.mitigations || [], staff: lastStaff });
    world.setSkyline(state?.account?.skyline || 0);
    scene.fog.density = stageDef.fog;
    if (run?.event?.id) applyEventFlag(run.event.id, true);
  }

  function envFromDerived(d) {
    if (!d) return;
    env.power = d.power?.u ?? 0; env.cooling = d.cooling?.u ?? 0; env.network = d.network?.u ?? 0;
    env.efficiency = d.efficiency ?? 1; env.simBlackout = !!d.blackout;
  }

  // A rebuild is pending (or running) inside a transition: incremental bus events are dropped meanwhile, since the
  // rebuild at black re-reads the whole state against the new stage's footprints.
  const rebuildPending = () => !!trans && (trans.rebuild || trans.busy);

  function setState(newState, newDerived) {
    state = newState; derived = newDerived;
    envFromDerived(derived);
    if (rebuildPending()) return Promise.resolve(); // an Exit / stage fade will rebuild at black
    const p = rebuildFromState();
    if (!booted) { booted = true; fade = 0; beginTransition('boot'); }
    return p;
  }

  // ---- transitions ----------------------------------------------------------------------------------------------------------------
  // 'boot': fade up only. 'stage': 1 s out → rebuild at black → 1 s up. 'exit': LEDs sweep off row by row (1.5 s),
  // fade to black (1.5 s), rebuild, fade up. A stageChanged that lands during a transition joins it: during a fade-up
  // (boot, or the tail of a move/Exit) the fade turns back down from where it is and rebuilds at black; during a
  // running rebuild it queues one more, so the stage shown is always the one in state.
  function beginTransition(kind) {
    if (trans && kind === 'stage') {
      if (trans.phase === 'in') {
        trans.kind = 'stage'; trans.phase = 'out'; trans.outS = POST.fadeS; trans.inS = POST.fadeS;
        trans.t = (1 - fade) * trans.outS;
      }
      trans.rebuild = true;
      return;
    }
    if (kind === 'exit' && trans?.kind === 'exit') return;
    const rows = Math.max(1, stageDef.rows);
    trans = { kind, phase: kind === 'exit' ? 'sweep' : kind === 'boot' ? 'in' : 'out', t: 0, rebuild: kind !== 'boot', busy: false,
      outS: kind === 'exit' ? EXIT.cinematic.fadeS : POST.fadeS, inS: kind === 'boot' ? 1.2 : POST.fadeS, sweepS: EXIT.cinematic.sweepS };
    if (kind === 'exit') rackField.startSweep('off', { total: EXIT.cinematic.sweepS * (rows === 1 ? 0.6 : 1) });
  }

  function runRebuild() {
    trans.busy = true; trans.rebuild = false;
    rebuildFromState().catch(e => warnOnce('rebuild', 'rebuild failed', e)).finally(() => { if (trans) trans.busy = false; });
  }

  function updateTransition(dt) {
    if (!trans) return;
    trans.t += dt;
    if (trans.phase === 'sweep') { fade = 1; if (trans.t >= trans.sweepS) { trans.phase = 'out'; trans.t = 0; } }
    if (trans.phase === 'out') {
      fade = Math.max(0, 1 - trans.t / trans.outS);
      if (trans.t >= trans.outS) { trans.phase = 'black'; trans.t = 0; fade = 0; }
    }
    if (trans.phase === 'black') {
      fade = 0;
      if (!trans.busy) { if (trans.rebuild) runRebuild(); else { trans.phase = 'in'; trans.t = 0; } }
    }
    if (trans.phase === 'in') { fade = Math.min(1, trans.t / trans.inS); if (trans.t >= trans.inS) { fade = 1; trans = null; } }
  }

  // ---- breaker (§8): 5 s black, one swinging SpotLight ------------------------------------------------------------------------------
  const spot = new THREE.SpotLight(0xfff0d0, 0, 40, 0.3, 0.6, 1.4);
  spot.visible = false;
  scene.add(spot, spot.target);
  function startBreaker() {
    if (breaker) return;
    breaker = { t: 0 };
    spot.visible = true; spot.intensity = 320;
    spot.position.copy(camera.position).lerp(controls.target, 0.55);
    spot.position.y = Math.max(1.8, spot.position.y);
  }
  // The 5 s timer ends it; so does the sim (event{id:'ev_breaker', on:false} when a resetRun / Exit / import ends the
  // event early) and any rebuild.
  function stopBreaker() { breaker = null; spot.visible = false; spot.intensity = 0; }
  function updateBreaker(dt) {
    if (!breaker) return;
    breaker.t += dt;
    const t = breaker.t;
    spot.target.position.set(controls.target.x + 2.6 * Math.sin(1.7 * t), 0.7 + 0.4 * Math.sin(2.3 * t), controls.target.z - 0.5 + 1.3 * Math.cos(1.1 * t));
    if (t >= ANIM.breakerS) stopBreaker();
  }

  // ---- bus ----------------------------------------------------------------------------------------------------------------------------
  function applyEventFlag(id, on) {
    if (id === 'ev_heatwave') env.heatwave = on;
    else if (id === 'ev_viral') env.viral = on;
    else if (id === 'ev_ddos') env.ddos = on;
    else if (id === 'ev_investor_visit' && on) orbitBoost = 10;
    else if (id === 'ev_breaker') { if (on) startBreaker(); else stopBreaker(); }
  }

  // Portrait: the Civic backs out to the upper left, off the narrow frame, so the camera turns to watch it (§12 'the
  // hatchback backs out of frame') and returns; any touch cancels it.
  function lookAtCivic() {
    const c = world.civicPosition();
    if (!c) return;
    const to = controls.target.clone().lerp(new THREE.Vector3(c.x, 0.6, c.z), 0.55);
    look = { t: 0, from: controls.target.clone(), to, az0: controls.getAzimuthalAngle(), az1: THREE.MathUtils.degToRad(-12), inS: 0.5, holdS: 2.4, outS: 0.8 };
  }

  const incremental = fn => p => { if (rebuildPending()) return; fn(p); };
  const handlers = {
    serverAdded: incremental(p => rackField.addServer(p.rack, p.slot, p.tier, { animate: true })),
    serverSwapped: incremental(p => rackField.swapServer(p.rack, p.slot, p.to)),
    rackAdded: incremental(p => {
      rackField.addRack(p.rack, { animate: true });
      world.setRackCount(rackField.racks.length);
      if (p.rack === 2 && stageDef.stage === 1 && world.driveOffCivic() && portrait) lookAtCivic();
    }),
    rackDark: p => rackField.setDark(p.rack, p.dark),
    infraAdded: incremental(p => world.addInfra(p.id, p.count)),
    stageChanged: () => beginTransition('stage'),
    meters: p => {
      env.power = p.power?.u ?? env.power; env.cooling = p.cooling?.u ?? env.cooling; env.network = p.network?.u ?? env.network;
      env.efficiency = p.efficiency ?? env.efficiency; env.simBlackout = !!p.blackout;
    },
    cash: () => {},
    // a focus (the badge, §8) ends with its incident, or when a new one lands out of frame while nobody has orbited
    // since; a user orbit owns the camera until the next fit
    incident: p => {
      rackField.setIncident(p.rack, true);
      if (focusedRack !== null && p.rack !== focusedRack && !userMoved && !rackInView(p.rack)) unfocus();
    },
    incidentResolved: p => {
      rackField.setIncident(p.rack, false);
      if (p.rack === focusedRack && !userMoved) unfocus();
    },
    event: p => applyEventFlag(p.id, !!p.on),
    breaker: () => startBreaker(),
    upgrade: p => rackField.pulseTier(p.tier),
    global: () => { bloomFlash = Math.max(bloomFlash, 0.3); },
    milestone: p => {
      bloomFlash = data.LED.milestoneBloom - POST.bloom.strength;
      if (p.fx === 'sweep') rackField.startSweep('flash', { total: Math.max(0.6, ANIM.sweepRowS * Math.max(1, stageDef.rows)) });
      if (p.fx === 'orbit') orbitBoost = 12;
    },
    contractChanged: () => {},
    exit: () => beginTransition('exit'),
    // §11: black for the card's 2 s count-up, then rows cascade on. The boot rebuild may still be awaiting a shell
    // when this lands (a Warehouse-or-later save); rackField.rebuild() keeps an 'on' sweep across its clear.
    offline: () => rackField.startSweep('on', { total: 1.5, delay: OFFLINE.countUpS }),
    refreshAvailable: p => { refreshAvail = !!p.available; },
    toast: () => {},
  };

  function apply(name, payload) {
    const h = handlers[name];
    if (!h) return;
    try { h(payload || {}); }
    catch (e) { warnOnce('apply:' + name, `bus event ${name} threw`, e); }
  }

  // ---- hall-wide reads: lights, fog, bloom --------------------------------------------------------------------------------------------
  function updateReads(dt) {
    env.blackout = !!breaker || env.simBlackout;
    const eff = env.blackout ? 0 : THREE.MathUtils.clamp(env.efficiency, 0, 1);
    // §8/§15 'the hall tints warm': the sky light and the key light go toward a bright orange (the dark hot-fog colour
    // only read as 'slightly darker'), while the background and fog deepen toward it
    const warm = Math.min(1, THREE.MathUtils.clamp((env.cooling - 1) / 0.35, 0, 1) * 0.8 + (env.heatwave ? 0.8 : 0));
    env.warm = warm;
    // the §2 'dimmed to N%' curve shared with the key light (scene_world.js): squared, since a linear dim barely read after ACES
    hemi.intensity = env.blackout ? 0 : hemiBase * (0.1 + 0.9 * eff * eff) * (1 + 0.4 * warm);
    hemi.color.copy(hemiSky).lerp(warmCol, warm * 0.6);
    tmpC.copy(bg).lerp(hotFog, warm);
    scene.fog.color.copy(tmpC);
    scene.background.copy(tmpC);
    bloomFlash = Math.max(0, bloomFlash - dt * (0.6 / data.LED.milestoneBloomS));
    const base = quality === 'low' ? POST.bloom.phoneStrength : POST.bloom.strength;
    bloom.strength = base + bloomFlash;
    bloom.enabled = userBloom && autoLevel < 2;
    renderer.toneMappingExposure = POST.exposure * fade;
  }

  // ---- camera motion ------------------------------------------------------------------------------------------------------------------
  function orbitBy(ang) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(Y_AXIS, ang);
    camera.position.copy(controls.target).add(off);
  }
  function updateCamera(dt, realDt) {
    idleT += realDt;
    if (focusAnim) {
      focusAnim.t += dt;
      const p = Math.min(1, focusAnim.t / 0.6), e = 1 - (1 - p) ** 3;
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.lerpVectors(focusAnim.from, focusAnim.to, e);
      const dist = THREE.MathUtils.lerp(focusAnim.d0, focusAnim.d1, e);
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      if (p >= 1) focusAnim = null;
    }
    if (look) {
      look.t += dt; idleT = 0;
      const hold = look.inS + look.holdS;
      const p = look.t < look.inS ? easeInOut(look.t / look.inS) : look.t < hold ? 1 : 1 - easeInOut(Math.min(1, (look.t - hold) / look.outS));
      const dist = controls.getDistance(), polar = controls.getPolarAngle();
      controls.target.lerpVectors(look.from, look.to, p);
      const az = THREE.MathUtils.lerp(look.az0, look.az1, p);
      camera.position.copy(controls.target).addScaledVector(viewDir(THREE.MathUtils.radToDeg(az), THREE.MathUtils.radToDeg(polar)), dist);
      if (look.t >= hold + look.outS) look = null;
    }
    const spin = orbitBoost > 0 ? 0.15 : idleT > CAMERA.idleOrbitAfterS ? CAMERA.idleOrbitRadS : 0;
    if (spin > 0) {
      orbitBoost = Math.max(0, orbitBoost - dt);
      const az = controls.getAzimuthalAngle(), lim = controls.maxAzimuthAngle - 0.02;
      if (az >= lim) orbitDir = -1; else if (az <= -lim) orbitDir = 1;
      orbitBy(orbitDir * spin * dt);
    }
    controls.update();
  }
  controls.addEventListener('start', () => { idleT = 0; focusAnim = null; focusedRack = null; look = null; userMoved = true; });

  // ---- quality ---------------------------------------------------------------------------------------------------------------------------
  function applySizes() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return; // mid-relayout (pane collapsed, viewport switch): keep the last real sizes, a 0x0 target only logs GL errors
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio(), k = quality === 'low' ? 0.5 : 1;
    bloom.setSize(Math.max(1, Math.round(w * pr * k)), Math.max(1, Math.round(h * pr * k)));
  }
  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2));
    applySizes();
  }
  function updateAutoQuality(realDt) {
    aliveS += realDt;
    if (!autoQuality || aliveS < STARTUP_GRACE_S || autoLevel >= 2) return;
    frameEma += (realDt * 1000 - frameEma) * 0.1;
    if (frameEma > SLOW_FRAME_MS) slowAcc += realDt; else slowAcc = Math.max(0, slowAcc - realDt * 0.5);
    if (slowAcc > SLOW_FOR_S) {
      slowAcc = 0;
      // already on the phone tier: the 3 s rule goes straight to bloom off (§15), not through a second 3 s wait
      autoLevel = quality === 'low' ? 2 : autoLevel + 1;
      if (autoLevel === 1) setQuality('low');
      if (DEBUG) console.info('[scene] ' + (autoLevel === 1 ? 'slow frames: low quality' : 'still slow: bloom off'));
    }
  }
  // §15 'if a purchase does not change what you see, it is not in the game': hires emit no bus event, so the desk
  // follows run.staff from here (and the mitigation props follow run.mitigations as belt-and-braces to infraAdded).
  function syncExtras() {
    const run = state?.run;
    if (!run || rebuildPending()) return;
    const staff = Math.floor(run.staff || 0), mitN = run.mitigations?.length || 0;
    if (staff === lastStaff && mitN === lastMitN) return;
    lastStaff = staff; lastMitN = mitN;
    world.setExtras({ mitigations: run.mitigations || [], staff });
  }

  // On portrait the HUD covers the top panel and the bottom sheet (§17), so the camera is fitted to the band of the
  // canvas between them and the real canvas is a taller sub-window of that image (setViewOffset), offset so the
  // band's top is the fitted image's top. ui.js sets the band from its measured panels.
  // the portrait band as [top, bottom] CSS px of the canvas (ui.js's measurement, or the default fractions)
  function bandPx() {
    const h = canvas.clientHeight || window.innerHeight;
    const [t0, b0] = band || [h * DEFAULT_BAND[0], h * DEFAULT_BAND[1]];
    const topPx = THREE.MathUtils.clamp(Math.round(t0), 0, Math.max(0, h - 2));
    return [topPx, Math.max(topPx + 1, Math.min(h, Math.round(b0)))];
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    const wasPortrait = portrait;
    portrait = h > w;
    if (portrait) {
      const [topPx, botPx] = bandPx();
      const bandH = botPx - topPx;
      camera.setViewOffset(w, bandH, 0, -topPx, w, h);
      camera.aspect = w / bandH;
      viewportHpx = bandH;
    } else { camera.clearViewOffset(); camera.aspect = w / Math.max(1, h); viewportHpx = h; }
    camera.fov = portrait ? CAMERA.fovPortrait : CAMERA.fov;
    camera.updateProjectionMatrix();
    applySizes();
    if (wasPortrait !== portrait && booted) fitCamera(stageDef); else fitCamera(stageDef, { apply: false });
    rackField.setLedScale({ fitDist: fitD, pxPerM: pxPerM() });
  }
  function setViewportBand(topPx, bottomPx) {
    if (!Number.isFinite(topPx) || !Number.isFinite(bottomPx) || bottomPx - topPx < 40) return;
    const changed = !band || Math.abs(band[0] - topPx) > 1 || Math.abs(band[1] - bottomPx) > 1;
    band = [topPx, bottomPx];
    if (!changed) return;
    resize();
    if (portrait && !userMoved) fitCamera(stageDef); // nobody has orbited since the last fit: re-centre on the new band
  }
  window.addEventListener('resize', resize);

  const sizeTmp = new THREE.Vector2();
  // ---- frame ------------------------------------------------------------------------------------------------------------------------------
  function step(dt, realDt = dt) {
    updateTransition(dt);
    updateBreaker(dt);
    updateReads(dt);
    syncExtras();
    rackField.update(dt, env);
    env.rowLit = rackField.rowLit(); // the trays over a row glow by its lit share
    world.update(dt, env);
    updateCamera(dt, realDt);
    updateAutoQuality(realDt);
  }
  function render() {
    const size = renderer.getSize(sizeTmp);
    if (size.x < 2 || size.y < 2) return; // nothing to draw into yet (see applySizes)
    renderer.info.reset();
    composer.render();
  }
  function frame(nowMs) {
    const realDt = lastMs == null ? 1 / 60 : Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;
    step(frozen ? 0 : realDt, realDt);
    render();
  }
  function start() { if (running) return; running = true; lastMs = null; renderer.setAnimationLoop(frame); }
  function stop() { running = false; renderer.setAnimationLoop(null); }

  // ---- API ---------------------------------------------------------------------------------------------------------------------------------
  // x, y in CSS px relative to the canvas (the frame project() returns and main.js taps in; the canvas sits under
  // the 52 px site nav, so client coordinates would land a rack height too high).
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const rack = rackField.pick(raycaster);
    if (rack !== null && rack !== undefined) return rack;
    if (world.pickUplink(raycaster)) return 'uplink';
    return nearestRack(x, y, r);
  }
  // The rack whose on-screen frame (the vertical segment from 0.3 m to 1.9 m up its axis) is within PICK_SNAP_PX of
  // the tap, or null: the Hall / Campus fits leave frames narrower than a thumb, so a near miss still lands.
  function nearestRack(x, y, r) {
    let best = null, bestD = PICK_SNAP_PX;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const toPx = v => { v.project(camera); return v.z < 1 ? [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height] : null; };
    for (let i = 0; i < rackField.racks.length; i++) {
      const p = rackField.rackPosition(i, a);
      if (!p) continue;
      b.set(p.x, 1.9, p.z); p.y = 0.3;
      const A = toPx(a), B = toPx(b);
      if (!A || !B) continue;
      const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? THREE.MathUtils.clamp(((x - A[0]) * dx + (y - A[1]) * dy) / l2, 0, 1) : 0;
      const d = Math.hypot(x - (A[0] + t * dx), y - (A[1] + t * dy));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function projectPoint(p) {
    p.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height };
  }
  function project(rack) {
    const p = rackField.rackPosition(rack, tmpV);
    if (!p) return null;
    p.y = 2.1;
    return projectPoint(p);
  }
  function focus(rack) {
    const p = rackField.rackPosition(rack, new THREE.Vector3());
    if (!p) return;
    // portrait: aim at the rack's foot so the frame stands in the upper half of the band, above the docked toasts
    if (portrait) p.y = 0.3;
    idleT = 0; look = null;
    // half the fit, or closer when half the fit still leaves a rack under a thumb (the Hall / Campus, every phone)
    const d1 = Math.max(controls.minDistance, Math.min(fitD * 0.5, tapDistance()));
    focusAnim = { from: controls.target.clone(), to: p, t: 0, d0: controls.getDistance(), d1 };
    focusedRack = rack;
  }
  // §15 photo mode: composer.render() and toBlob in the same frame (no preserveDrawingBuffer). On portrait the camera
  // is fitted to the HUD band and the canvas is a taller sub-window of that image (resize), so the PNG is the band
  // alone; the whole canvas would be the hall in its top half over empty floor and a prop sliced by the frame edge.
  function photo() {
    render();
    if (!portrait) return new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
    const [t, b] = bandPx();
    const k = canvas.width / Math.max(1, canvas.clientWidth || canvas.width); // CSS px → drawing-buffer px
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = Math.max(1, Math.min(canvas.height, Math.round((b - t) * k)));
    c.getContext('2d').drawImage(canvas, 0, Math.round(t * k), canvas.width, c.height, 0, 0, canvas.width, c.height);
    return new Promise(res => c.toBlob(bl => res(bl), 'image/png'));
  }
  function setBloom(on) { userBloom = !!on; }
  function dispose() {
    stop();
    window.removeEventListener('resize', resize);
    controls.dispose();
    rackField.dispose(); world.dispose(); mats.dispose();
    for (const t of Object.values(textures)) t.dispose();
    bloom.dispose(); composer.dispose();
    renderer.dispose();
  }

  // phones start on the low tier (§15: half-res bloom at strength 0.6) instead of waiting 3 s of slow frames for it
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse || (canvas.clientWidth || window.innerWidth) < PHONE_MAX_CSS_PX) setQuality('low');

  // initial view: the garage, empty, before the first setState
  resize();
  await rebuildFromState();

  return {
    pick, focus, photo, setBloom, project, apply, setState, resize, dispose, setQuality, setViewportBand, start, stop,
    get quality() { return quality; }, get stage() { return stageDef.stage; }, get refreshAvailable() { return refreshAvail; },
    setAutoQuality(on) { autoQuality = !!on; },
    three: { renderer, scene, camera, controls, composer, bloom, rackField, world },
    debug: {
      step(seconds) { const n = Math.ceil(seconds * 60); for (let i = 0; i < n; i++) step(seconds / n, seconds / n); render(); },
      setFrozen(on) { frozen = !!on; },
      setView({ azimuthDeg, polarDeg, zoom = 1 } = {}) {
        const az = azimuthDeg ?? (portrait ? DEFAULT_AZ_DEG.portrait : DEFAULT_AZ_DEG.landscape), po = polarDeg ?? defaultPolar(stageDef);
        const dir = viewDir(az, po);
        camera.position.copy(controls.target).addScaledVector(dir, fitD * zoom);
        controls.update();
      },
      // every rack in the scene picked back at a point a tap lands on (the upper part of its camera-facing face, the
      // part a row in front does not cover) and at the money-pop point scene.project() gives: misses = racks a tap
      // there would not hit
      pickCheck() {
        const misses = [], missesTop = [], n = rackField.racks.length;
        for (let i = 0; i < n; i++) {
          const p = rackField.rackPosition(i, new THREE.Vector3());
          if (!p) { misses.push(i); missesTop.push(i); continue; }
          const q = projectPoint(new THREE.Vector3(p.x, 1.8, p.z + 0.58));
          if (pick(q.x, q.y) !== i) misses.push(i);
          const t = project(i);
          if (!t || pick(t.x, t.y) !== i) missesTop.push(i);
        }
        return { racks: n, misses, missesTop };
      },
      get env() { return env; }, get fade() { return fade; }, get transition() { return trans; }, get fitDistance() { return fitD; },
      get band() { return band ? [...band] : null; }, get pxPerM() { return pxPerM(); }, get ledWidth() { return rackField.ledWidth; },
      get tapDistance() { return tapDistance(); }, get polarDeg() { return THREE.MathUtils.radToDeg(controls.getPolarAngle()); },
      get minDistance() { return controls.minDistance; }, get breaker() { return !!breaker; },
      get focusedRack() { return focusedRack; }, get userMoved() { return userMoved; }, get distance() { return controls.getDistance(); },
      rackInView, unfocus,
      counts() { return { ...rackField.counts(), infra: world.unitCount(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
    },
  };
}
