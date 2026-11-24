// Driving Medic 14: vehicle dynamics, the chase and cab cameras, the lights and siren, traffic that mostly gets out
// of the way, satellite navigation and the minimap, collisions, and the ride quality the patient in the back feels.
//
// The truck is a 5.5 tonne box on a van chassis and drives like one: a dynamic bicycle model (front/rear slip angles,
// saturating tyres, less grip in the wet), a high centre of gravity that will lift the inside wheels, long braking
// distances. Tuning is in CAR below. Traffic drives the town's lane graph (town.nodes / town.edges), obeys its signals
// and stop signs, and reacts to the siren after a human reaction time; a share of drivers (difficulty) never notice.

import * as THREE from 'three';
import { G, U, updateRig } from './gfx.js';
import { Snd } from './audio.js';
import { $, keys, onKey, toast, layers, fmtClock, say } from './ui.js';
import { clamp, lerp, damp, makeRng, TAU } from './util.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const CAR = { mass: 5500, wheelbase: 4.0, a: 1.85, b: 2.15, iz: 5500 * 3.6, cgH: 1.25, track: 1.9, maxSteer: 0.56, power: 235000, maxForce: 17500, brake: 0.72 * 9.81, cdA: 4.6, roll: 0.016, muDry: 0.86, muWet: 0.56, cf: 9.5, cr: 11.5, top: 38 };
const GEARS = [0, 9, 16, 24, 33, 45];   // m/s at which the automatic changes up
const MPH = 2.23694;

export class Drive {
  constructor(game) {
    this.game = game; this.cam = new THREE.PerspectiveCamera(52, 1.6, 0.25, 6000); this.camMode = 0; this.active = false;
    this.s = { x: 0, z: 0, yaw: 0, vx: 0, vy: 0, r: 0, steer: 0, rollA: 0, pitchA: 0, rev: false }; this.lights = false; this.siren = 'off'; this.damage = 0; this.crashes = 0; this.crashT = 0;
    this.traffic = []; this.run = null; this.camPos = new THREE.Vector3(); this.camTgt = new THREE.Vector3(); this.rng = makeRng(77); this.t = 0; this.gear = 1; this.tipT = 0; this.mapZoom = 1;
    onKey(code => this.key(code));
  }

  async init(town, V, scene, rig, progress) {
    this.town = town; this.scene = scene; this.rig = rig; this.V = V;
    this.nodeById = new Map(town.nodes.map(n => [n.id, n])); this.edgeById = new Map(town.edges.map(e => [e.id, e]));
    for (const e of town.edges) { const a = this.nodeById.get(e.a), b = this.nodeById.get(e.b); e._a = a; e._b = b; if (!e.dir) { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; e.dir = { x: dx / l, z: dz / l }; e.length = e.length || l; } if (!e.length) e.length = Math.hypot(b.x - a.x, b.z - a.z); }
    // River-bank walls in the town's collision set run on across the bridge decks: mark any barrier that lies across
    // a carriageway so the truck can cross.
    { const list = []; let n = 0; for (const e of town.edges) { const hw = (e.width || 9) / 2 - 0.6; for (let t = 4; t < e.length - 4; t += 2) for (const off of [-hw * 0.6, 0, hw * 0.6]) { const px = e._a.x + e.dir.x * t - e.dir.z * off, pz = e._a.z + e.dir.z * t + e.dir.x * off; list.length = 0; town.colliders?.query(px, pz, 1.5, list); for (const c of list) { if (c.skip || (c.kind !== 'barrier' && c.kind !== 'building')) continue; const co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0), dx = px - c.x, dz = pz - c.z, lx = dx * co - dz * si, lz = dx * si + dz * co; if (Math.abs(lx) < c.hw + 0.3 && Math.abs(lz) < c.hd + 0.3) { c.skip = true; n++; } } } } if (n) console.info('[drive] ignoring', n, 'colliders that lie across a road'); }
    progress?.(0.1, 'Medic 14');
    const amb = this.amb = V.buildAmbulance({}); scene.add(amb.group);
    amb.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.dims = Object.assign({ length: 7.3, width: 2.4, wheelRadius: 0.4 }, amb.dims || {});
    // real lights: one pair of headlamp beams, two strobes, and a few street lamps borrowed from the town
    this.head = new THREE.SpotLight(0xfff1d6, 0, 120, 0.52, 0.6, 2); this.head.position.set(0, 1.0, (this.dims.length || 7.3) / 2 + 0.25); this.head.target.position.set(0, -0.4, 34); amb.group.add(this.head, this.head.target);
    // The light bar as two wide spots thrown outwards from the bar ends: they flash the street and the buildings, not
    // the truck's own roof or cab (a point light half a metre above white paint is a white-out).
    this.strobes = [];
    const aL = amb.anchors?.barL, aR = amb.anchors?.barR, hw = (this.dims.width || 2.4) / 2;
    for (const sx of [1, -1]) {
      const a = sx > 0 ? aL : aR, sp = new THREE.SpotLight(0xff0000, 0, 70, 1.25, 1, 1.8), base = a ? a.position.clone() : new THREE.Vector3(sx * 0.8, 3, 1.6);
      sp.position.set(sx * (hw + 0.35), base.y + 0.15, base.z); sp.target.position.set(sx * 14, 0.5, base.z + 7);
      (amb.body || amb.group).add(sp, sp.target); this.strobes.push(sp);
    }
    this.lampPool = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc27a, 0, 34, 1.8); scene.add(l); this.lampPool.push(l); }
    this.sceneLight = new THREE.SpotLight(0xfff6e8, 0, 30, 0.9, 0.6, 1.2); scene.add(this.sceneLight, this.sceneLight.target);
    this.cabGlow = new THREE.PointLight(0x9fd0ff, 0, 2.6, 1.6); if (amb.seat) { this.cabGlow.position.copy(amb.seat.position).add(new THREE.Vector3(-0.25, -0.45, 0.55)); (amb.seat.parent || amb.group).add(this.cabGlow); }
    // traffic pool
    this.extra = [];                     // parked cars as colliders: { x, z, hw, hd, rot }
    if (V.buildCar) {
      progress?.(0.3, 'Traffic');
      const types = (V.CAR_TYPES || ['sedan', 'suv', 'hatch', 'pickup', 'van']).filter(t => !/police|engine|bus|boxtruck/.test(t)); const cols = V.CAR_COLORS || [0xdadada, 0x1c1c1e, 0x8a8f96, 0x2c3e66, 0x7a1c1c];
      for (let i = 0; i < 30; i++) {
        try { const c = V.buildCar(types[i % types.length], { color: cols[Math.floor(this.rng() * cols.length)], seed: i + 1, lod: 1 }); c.group.visible = false; scene.add(c.group); this.traffic.push({ m: c, on: false, v: 0, s: 0, off: 0, wait: 0, hw: (c.dims?.width || 1.85) / 2, hd: (c.dims?.length || 4.6) / 2, pers: 0.88 + this.rng() * 0.2, aware: 0, oblivious: false }); } catch (e) { console.warn('car', e); break; }
        if (i % 6 === 5) { progress?.(0.3 + 0.4 * i / 30, 'Traffic'); await new Promise(r => setTimeout(r)); }
      }
      this.parkCars(town, V);
    }
    this.mapImg = town.map?.canvas || null;
    const sp = town.spawn || { x: 0, z: 0, heading: 0 }; this.place(sp.x, sp.z, sp.heading);
    progress?.(1, 'Ready');
  }

  // Parked cars: one InstancedMesh per body type, coloured per instance.
  parkCars(town, V) {
    const spots = town.parking || []; if (!spots.length) return;
    const types = ['sedan', 'suv', 'hatch', 'pickup', 'van', 'wagon'].filter(t => (V.CAR_TYPES || []).includes(t) || true); const cols = V.CAR_COLORS || [0xdadada, 0x1c1c1e, 0x8a8f96, 0x2c3e66, 0x7a1c1c, 0xf4f4f2];
    const byType = {}; const rng = makeRng(4242);
    for (const s of spots) { if (rng() > 0.56) continue; const t = types[Math.floor(rng() * types.length)]; (byType[t] = byType[t] || []).push(s); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    for (const t in byType) {
      let proto; try { proto = V.buildCar(t, { lod: 2, color: 0xffffff, seed: 3 }); } catch { continue; }
      let geo = proto.geometry || findMesh(proto.group)?.geometry; const mat = proto.material || findMesh(proto.group)?.material; if (!geo || !mat) continue;
      try { geo = toCreasedNormals(geo.clone(), 0.75); } catch { }               // smooth the facets of the cheap parked-car mesh, keep its real creases
      const list = byType[t], im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = true; im.receiveShadow = true;
      list.forEach((s, i) => { q.setFromAxisAngle(up, s.heading || 0); m4.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); const c = cols[Math.floor(rng() * cols.length)]; im.setColorAt(i, col.set(c)); this.extra.push({ x: s.x, z: s.z, hw: 0.95, hd: 2.3, rot: s.heading || 0, kind: 'car' }); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); this.scene.add(im);
    }
    this.extraGrid = new Map(); for (const c of this.extra) { const k = (Math.floor(c.x / 40) * 73856093) ^ (Math.floor(c.z / 40) * 19349663); (this.extraGrid.get(k) || this.extraGrid.set(k, []).get(k)).push(c); }
  }

  place(x, z, yaw) { Object.assign(this.s, { x, z, yaw: yaw || 0, vx: 0, vy: 0, r: 0, steer: 0 }); this.syncMesh(0); this.camPos.set(x - Math.sin(yaw) * 10, 4, z - Math.cos(yaw) * 10); }

  // ---------------------------------------------------------------- a run: drive to somewhere
  // run = { to: { x, z, label }, mode: 'response' | 'transport' | 'return', call (dispatch card), patient, partnerSay(text), onTick }
  start(run) {
    this.run = run; run.t = 0; run.smoothLoss = 0; run.crashes = 0; run.arrived = false; this.distTo = this.dijkstra(run.to);
    run.length = this.routeLength(); run.target = run.length / 13 + 20;
    this.active = true; this.game.grid?.(); layers('hudDrive'); G.view(this.scene, this.cam);
    $('#ride').classList.toggle('on', !!run.patient); this.card();
    Snd.setInterior(this.camMode === 1 ? 1 : 0.3); Snd.ambient(U.uNight.value > 0.5 ? 'townNight' : 'townDay'); Snd.music(run.mode === 'return' ? 'calm' : 'drive');
    $('#keysDrive').style.opacity = 1; clearTimeout(this.keyFade); this.keyFade = setTimeout(() => { $('#keysDrive').style.opacity = 0.25; }, 14000);
    return new Promise(res => { run.done = res; });
  }
  resumeRun() { this.active = true; layers('hudDrive'); G.view(this.scene, this.cam); Snd.setInterior(this.camMode === 1 ? 1 : 0.3); Snd.ambient(U.uNight.value > 0.5 ? 'townNight' : 'townDay'); Snd.music('drive'); }
  stop() { this.active = false; this.run = null; this.siren = 'off'; Snd.siren('off'); Snd.engine({ on: false, rpm: 0, load: 0, speed: 0 }); Snd.tires({ skid: 0, speed: 0, wet: 0 }); Snd.airhorn(false); $('#prompt').classList.remove('on'); }
  card() {
    const r = this.run, c = r.call; if (!c) { $('#callCard').innerHTML = `<div class="cap">${r.mode === 'return' ? 'Clear' : 'Transport'}</div><div class="nat">${r.title || ''}</div><div class="addr">${r.to.label || ''}</div><div class="meta"><span>Elapsed <b id="cT">0:00</b></span><span>Distance <b id="cD">--</b></span></div>`; return; }
    $('#callCard').innerHTML = `<div class="cap pri${c.pri}">Priority ${c.pri} &nbsp;·&nbsp; ${r.mode === 'response' ? 'Responding' : 'Transport'}</div><div class="nat">${c.nature}</div><div class="addr">${r.to.label || ''}</div><div class="meta"><span>Elapsed <b id="cT">0:00</b></span><span>Distance <b id="cD">--</b></span></div>`;
  }

  key(code) {
    if (!this.active || this.game.paused) return;
    if (code === 'KeyL') { this.lights = !this.lights; if (!this.lights) { this.siren = 'off'; } Snd.ui('tick'); return true; }
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { const m = { Digit1: 'wail', Digit2: 'yelp', Digit3: 'phaser' }[code]; this.siren = this.siren === m ? 'off' : m; if (this.siren !== 'off') this.lights = true; return true; }
    if (code === 'KeyC') { this.camMode = (this.camMode + 1) % 3; Snd.setInterior(this.camMode === 1 ? 1 : 0.3); return true; }
    if (code === 'KeyM') { this.mapZoom = this.mapZoom === 1 ? 0.45 : 1; return true; }
    if (code === 'KeyR') { if (Math.abs(this.s.vx) < 1.5) { this.s.rev = !this.s.rev; Snd.ui('tick'); } return true; }
    if (code === 'KeyE' && this.canArrive) { this.arrive(); return true; }
    if (code === 'KeyT' && this.run?.patient && this.run.onBack && Math.abs(this.s.vx) < 0.6) { this.active = false; this.siren = 'off'; Snd.siren('off'); Snd.engine({ on: false, rpm: 0, load: 0, speed: 0 }); $('#prompt').classList.remove('on'); this.run.onBack(); return true; }
  }
  arrive() { const r = this.run; if (!r || r.arrived) return; r.arrived = true; const out = { time: r.t, target: r.target, crashes: r.crashes, smooth: clamp(1 - r.smoothLoss), length: r.length }; Snd.handbrake(); const done = r.done; this.stop(); done(out); }

  // Test driver (window.__swm.auto(true)): follows the sat-nav line in the right-hand lane at a steady pace.
  autopilot() {
    const s = this.s, rt = this.rt || (this.rt = this.route()), pts = rt.pts, to = this.run.to, dTo = Math.hypot(to.x - s.x, to.z - s.z);
    // a point about 14 m along the route from here, pushed into the right-hand lane
    let need = 5.5 + Math.abs(s.vx) * 0.42, tx = to.x, tz = to.z, dirx = 0, dirz = 1;
    for (let i = 1; i < pts.length; i++) { const ax = i === 1 ? s.x : pts[i - 1].x, az = i === 1 ? s.z : pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az, L = Math.hypot(dx, dz) || 1; if (need <= L || i === pts.length - 1) { const t = Math.min(1, need / L); tx = ax + dx * t; tz = az + dz * t; dirx = dx / L; dirz = dz / L; const off = dTo < 45 ? 1.9 : (this.siren !== 'off' ? 0.35 : 1.9); if (i < pts.length - 1 || dTo > 30) { tx += -dirz * off; tz += dirx * off; } break; } need -= L; }
    const ex = tx - s.x, ez = tz - s.z, want = Math.atan2(ex, ez); let err = want - s.yaw; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    const turnSoon = rt.turn && rt.turn.dir !== 'straight' && rt.turn.dist < 14 + Math.abs(s.vx) * 2.2;
    const st = Math.max(-1, Math.min(1, err * 2.6)), vmax = Math.min(this.autoSpeed || 15, 5 + 16 * (1 - Math.min(1, Math.abs(err) * 1.8)), turnSoon ? 5.5 : 99, dTo < 60 ? 2.5 + dTo * 0.16 : 99);
    let stop = dTo < (this.run.radius || 16) - 6; const sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
    for (const c of this.traffic) { if (!c.on) continue; const fx = c.x - s.x, fz = c.z - s.z, ahead = fx * sn + fz * cs, lat = Math.abs(fx * cs - fz * sn); if (ahead > 2 && ahead < 9 + s.vx * 0.9 && lat < 1.75) stop = true; }
    return [!stop && s.vx < vmax ? 1 : 0, stop || s.vx > vmax + 2 ? 1 : 0, st];
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    dt = Math.min(dt, 0.05); this.t += dt;
    const s = this.s, run = this.run, wet = U.uWet.value;
    if (this.active && !this.game.paused) {
      let thr = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0, brk = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0; const hb = keys.has('Space');
      let st = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      if (this.auto) [thr, brk, st] = this.autopilot();
      const n = 4; for (let i = 0; i < n; i++) this.physics(dt / n, thr, brk, st, hb, wet);
      this.collide(dt);
      this.updateTraffic(dt);
      run.t += dt;
      // ride quality with someone in the back
      const ax = this.ax || 0, ay = s.vx * s.r, g = Math.hypot(ax, ay);
      if (run.patient) { run.smoothLoss += Math.max(0, g - 3.2) * dt * 0.035; run.patient.moving = clamp(g / 9); run.patient.tick(dt); run.onTick?.(dt, g); const sm = clamp(1 - run.smoothLoss); $('#rideBar').style.width = sm * 100 + '%'; $('#rideBar').style.background = sm > 0.7 ? 'var(--green)' : sm > 0.4 ? 'var(--amber)' : 'var(--red)'; $('#rideTxt').textContent = g > 5 ? 'Thrown around' : g > 3.2 ? 'Rough' : 'Smooth'; }
      this.hud(dt);
    }
    this.syncMesh(dt); this.updateLights(dt); if (this.active) { this.camera(dt); this.audio(dt); }
  }

  physics(dt, thr, brk, st, hb, wet) {
    const s = this.s, C = CAR, mu = lerp(C.muDry, C.muWet, clamp(wet)) * (this.surf === 'grass' ? 0.6 : 1);
    const speed = Math.abs(s.vx);
    // steering: slower and smaller at speed
    // full lock asks for about 0.55 g at any speed: a keyboard is all-or-nothing, a steering wheel is not
    const maxSteer = Math.min(C.maxSteer, Math.atan(0.5 * 9.81 * C.wheelbase / Math.max(speed * speed, 1)));
    s.steer = damp(s.steer, st * maxSteer, st ? 4.5 : 7, dt);
    // longitudinal
    const dirSign = s.rev ? -1 : 1; let F = 0;
    const drive = thr * Math.min(C.maxForce, C.power / Math.max(speed, 4)) * (s.rev ? 0.5 : 1) * (1 - this.damage * 0.45);
    if (thr && (s.vx * dirSign) < (s.rev ? 7 : C.top)) F += drive * dirSign;
    const drag = 0.5 * 1.2 * C.cdA * s.vx * speed + C.roll * C.mass * 9.81 * Math.sign(s.vx) * (speed > 0.05 ? 1 : 0) * (this.surf === 'grass' ? 5 : this.surf === 'sidewalk' ? 1.6 : 1);
    F -= drag; if (!thr && speed > 0.3) F -= Math.sign(s.vx) * 900;                      // engine braking
    let axBrake = 0; if (brk || hb) axBrake = Math.min(C.brake * (brk ? 1 : 0.55), mu * 9.81 * 0.95);
    let ax = F / C.mass;
    if (axBrake) { const dv = axBrake * dt; if (speed <= dv) { s.vx = 0; ax = 0; } else ax -= Math.sign(s.vx) * axBrake; }
    // lateral: dynamic bicycle above walking pace, kinematic below
    if (speed > 2.5) {
      const Fzf = C.mass * 9.81 * C.b / C.wheelbase, Fzr = C.mass * 9.81 * C.a / C.wheelbase;
      const af = Math.atan2(s.vy + C.a * s.r, speed) - s.steer * Math.sign(s.vx), ar = Math.atan2(s.vy - C.b * s.r, speed);
      const grip = hb ? 0.45 : 1;
      const Fyf = -mu * Fzf * Math.tanh(C.cf * af / mu), Fyr = -mu * grip * Fzr * Math.tanh(C.cr * ar / (mu * grip));
      const ay = (Fyf * Math.cos(s.steer) + Fyr) / C.mass;
      s.vy += (ay - s.vx * s.r) * dt; s.r += (C.a * Fyf * Math.cos(s.steer) - C.b * Fyr) / C.iz * dt * Math.sign(s.vx);
      this.slip = Math.max(Math.abs(af), Math.abs(ar)); this.ayG = (s.vx * s.r) / 9.81;
    } else { s.r = s.vx * Math.tan(s.steer) / C.wheelbase; s.vy = damp(s.vy, 0, 8, dt); this.slip = 0; this.ayG = 0; }
    s.vx += ax * dt; this.ax = damp(this.ax || 0, ax - (axBrake && speed > 0.2 ? 0 : 0), 12, dt);
    if (Math.abs(s.vx) < 0.05 && !thr) s.vx = 0;
    s.yaw += s.r * dt;
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    s.x += (s.vx * sin + s.vy * cos) * dt; s.z += (s.vx * cos - s.vy * sin) * dt;
    // a tall box on a narrow track: past ~0.7 g it goes up on two wheels
    const tipG = C.track / (2 * C.cgH) * 0.92;
    if (Math.abs(this.ayG) > tipG * 1.03) { this.tipT += dt * (Math.abs(this.ayG) / tipG); if (this.tipT > 0.8) this.wreck('rolled'); } else this.tipT = Math.max(0, this.tipT - dt * 2);
    s.rollA = damp(s.rollA, clamp(-this.ayG * 0.085 - Math.sign(this.ayG) * this.tipT * 0.14, -0.4, 0.4), 6, dt); s.pitchA = damp(s.pitchA, clamp(-(this.ax || 0) * 0.006, -0.05, 0.05), 5, dt);
  }

  wreck(how) {
    if (this.wrecked) return; this.wrecked = true; this.crashes++; (this.wrecks = this.wrecks || []).push(how + ' v=' + this.s.vx.toFixed(1) + ' ay=' + (this.ayG || 0).toFixed(2) + ' dmg=' + this.damage.toFixed(2)); if (this.run) { this.run.crashes += 2; this.run.smoothLoss += 0.6; this.run.t += 150; }
    Snd.crash(1); G.grade.uFlash.value = 0.5; this.s.vx = 0; this.s.vy = 0; this.s.r = 0; this.tipT = 0; this.damage = clamp(this.damage + 0.35);
    toast(how === 'rolled' ? 'You put a five-tonne ambulance on its side. Minutes lost while it is righted.' : 'Medic 14 is disabled. Minutes lost.', 'bad', 6);
    this.game.blackout?.(1400).then(() => { this.wrecked = false; this.damage = Math.min(this.damage, 0.7); });
  }

  collide(dt) {
    const s = this.s, town = this.town; const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const surf = town.surface ? town.surface(s.x, s.z) : 'road';
    if (surf !== this.surf) { if ((surf === 'sidewalk' || this.surf === 'sidewalk') && Math.abs(s.vx) > 2) { Snd.bump(clamp(Math.abs(s.vx) / 15)); if (this.run) this.run.smoothLoss += Math.abs(s.vx) * 0.004; s.vx *= 0.97; this.bumpT = 0.25; } this.surf = surf; }
    const b = town.bounds; if (b) { const m = 25; if (s.x < b.minX + m || s.x > b.maxX - m || s.z < b.minZ + m || s.z > b.maxZ - m) { s.x = clamp(s.x, b.minX + m, b.maxX - m); s.z = clamp(s.z, b.minZ + m, b.maxZ - m); s.vx *= 0.9; if (!this.edgeWarn || this.t - this.edgeWarn > 6) { this.edgeWarn = this.t; toast('County line. Halloran Falls is behind you.', 'bad'); } } }
    const cs = [], list = []; town.colliders?.query(s.x, s.z, 9, list);
    const k = (Math.floor(s.x / 40)), kz = Math.floor(s.z / 40); if (this.extraGrid) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.extraGrid.get(((k + i) * 73856093) ^ ((kz + j) * 19349663)); if (a) for (const c of a) list.push(c); }
    for (const c of this.traffic) if (c.on && Math.abs(c.x - s.x) + Math.abs(c.z - s.z) < 14) list.push(c);
    const R = this.dims.width / 2 + 0.05, half = this.dims.length / 2 - R;
    for (const off of [half, 0, -half]) cs.push({ x: s.x + sin * off, z: s.z + cos * off });
    for (const o of list) {
      if (o.skip) continue;
      if (o.kind === 'prop' && o.soft && Math.abs(s.vx) > 3) { const pr = (o._r || Math.max(o.hw || 0.2, o.hd || 0.2)) + R; let touch = false; for (const c of cs) if (Math.hypot(c.x - o.x, c.z - o.z) < pr) { touch = true; break; } if (!touch) continue; if (!o.hitT || this.t - o.hitT > 3) { o.hitT = this.t; if (this.hitLog) this.hitLog.push('soft ' + JSON.stringify(o, function (k, v) { return typeof v === 'number' ? Math.round(v * 10) / 10 : v; }).slice(0, 120) + ' surf=' + this.surf); Snd.crash(0.15); this.damage = clamp(this.damage + 0.01); s.vx *= 0.96; } continue; }
      const rot = o.rot ?? o.yaw ?? 0, co = Math.cos(rot), si = Math.sin(rot);
      for (const c of cs) {
        const dx = c.x - o.x, dz = c.z - o.z; const lx = dx * co - dz * si, lz = dx * si + dz * co;      // into the box frame
        const hw = o.hw, hd = o.hd; const px = clamp(lx, -hw, hw), pz = clamp(lz, -hd, hd); let ex = lx - px, ez = lz - pz; let d = Math.hypot(ex, ez);
        if (d >= R) continue;
        if (d < 1e-4) { const pxm = hw - Math.abs(lx), pzm = hd - Math.abs(lz); if (pxm < pzm) { ex = Math.sign(lx) || 1; ez = 0; d = -pxm; } else { ex = 0; ez = Math.sign(lz) || 1; d = -pzm; } } else { ex /= d; ez /= d; }
        const nx = ex * co + ez * si, nz = -ex * si + ez * co, pen = R - d;
        s.x += nx * pen; s.z += nz * pen; for (const c2 of cs) { c2.x += nx * pen; c2.z += nz * pen; }
        const vxw = s.vx * sin + s.vy * cos, vzw = s.vx * cos - s.vy * sin; const vn = vxw * nx + vzw * nz;
        if (vn < 0) {
          const nvx = vxw - nx * vn * 1.12, nvz = vzw - nz * vn * 1.12; s.vx = (nvx * sin + nvz * cos) * 0.93; s.vy = (nvx * cos - nvz * sin) * 0.6; s.r *= 0.6;
          const imp = -vn; if (imp > 1.2 && this.t - this.crashT > 0.5) { this.crashT = this.t; if (this.hitLog) this.hitLog.push((o.m ? 'traffic' : o.kind) + ' imp=' + imp.toFixed(1) + ' at ' + Math.round(s.x) + ',' + Math.round(s.z) + (o.m ? ' carV=' + o.v.toFixed(1) + (o.turn ? ' turning' : '') + (o.yielding ? ' yielding' : '') : ' hw=' + o.hw + ' hd=' + o.hd)); Snd.crash(clamp(imp / 16)); this.damage = clamp(this.damage + (imp / 30) ** 2 + 0.005); G.grade.uFlash.value = Math.min(0.3, imp / 60); if (imp > 3.5) { this.crashes++; if (this.run) { this.run.crashes++; this.run.smoothLoss += imp * 0.03; this.run.jolt?.(imp); } } if (o.m) { o.v = Math.max(0, o.v - imp); o.hit = this.t; o.wait = 6 + this.rng() * 6; Snd.carHorn(0); } amb_setDamage(this.amb, this.damage); if (this.damage >= 1) this.wreck('disabled'); }
        }
      }
    }
  }

  // ---------------------------------------------------------------- traffic
  lane(e, sign, i, sAlong, out) {
    const d = e.dir, dx = d.x * sign, dz = d.z * sign, start = sign > 0 ? e._a : e._b; const off = (e.median || 0) / 2 + (Math.min(i, (e.lanes || 1) - 1) + 0.5) * (e.laneWidth || 3.3);
    out.x = start.x + dx * sAlong - dz * off; out.z = start.z + dz * sAlong + dx * off; out.yaw = Math.atan2(dx, dz); out.dx = dx; out.dz = dz; return out;
  }
  spawnCar(c) {
    const s = this.s, edges = this.town.edges; let tries = 12;
    while (tries--) {
      const e = edges[Math.floor(this.rng() * edges.length)]; if (e.cls === 'alley') continue;
      const sign = this.rng() < 0.5 ? 1 : -1, ra = (sign > 0 ? e._a : e._b).radius || 8, rb = (sign > 0 ? e._b : e._a).radius || 8; if (e.length < ra + rb + 14) continue;
      const along = ra + 4 + this.rng() * (e.length - ra - rb - 10); this.lane(e, sign, Math.floor(this.rng() * (e.lanes || 1)), along, P1);
      const d = Math.hypot(P1.x - s.x, P1.z - s.z); if (d < 150 || d > 330) continue;
      if (this.traffic.some(o => o.on && Math.abs(o.x - P1.x) + Math.abs(o.z - P1.z) < 16)) continue;
      Object.assign(c, { on: true, e, sign, lane: Math.floor(this.rng() * (e.lanes || 1)), s: along, v: e.speed * 0.8, off: 0, wait: 0, turn: null, hit: 0, aware: 0, oblivious: this.rng() < (this.game.diff.oblivious ?? 0.12), next: null, stopT: 0 });
      c.m.group.visible = true; c.m.lights?.setHead?.(U.uNight.value > 0.35 ? 1 : 0); return true;
    }
    return false;
  }
  pickNext(c) {
    const node = c.sign > 0 ? c.e._b : c.e._a; const opts = (node.edges || []).map(id => this.edgeById.get(id)).filter(e => e && e !== c.e && e.cls !== 'alley');
    if (!opts.length) return null;
    // prefer going roughly straight on
    const cd = { x: c.e.dir.x * c.sign, z: c.e.dir.z * c.sign }; let best = null, bw = -1;
    for (const e of opts) { const sign = e._a === node ? 1 : -1; const dot = (e.dir.x * sign) * cd.x + (e.dir.z * sign) * cd.z; const w = (dot > 0.7 ? 3 : dot > -0.3 ? 1.2 : 0.05) * this.rng(); if (w > bw) { bw = w; best = { e, sign, dot }; } }
    return best;
  }
  updateTraffic(dt) {
    const s = this.s, town = this.town, night = U.uNight.value; const want = Math.round((night > 0.6 ? 10 : 22) * (this.game.diff.traffic ?? 1));
    let on = 0; for (const c of this.traffic) if (c.on) on++;
    this.spawnT = (this.spawnT || 0) - dt; if (on < Math.min(want, this.traffic.length) && this.spawnT <= 0) { this.spawnT = 0.25; const c = this.traffic.find(c => !c.on); if (c) this.spawnCar(c); }
    const sirenOn = this.siren !== 'off', warn = this.lights ? (sirenOn ? 1 : 0.45) : 0; const asin = Math.sin(s.yaw), acos = Math.cos(s.yaw), aspeed = Math.abs(s.vx);
    for (const c of this.traffic) {
      if (!c.on) continue;
      const e = c.e, endNode = c.sign > 0 ? e._b : e._a, rEnd = endNode.radius || 8, stopLine = e.length - rEnd - 1.5;
      let target = e.speed * c.pers;
      if (c.turn) {
        // through the junction on a curve
        const T = c.turn; T.t += dt * Math.max(2.5, c.v) / T.len; target = Math.min(target, 6.5);
        c.v = damp(c.v, target, 1.2, dt);
        if (T.t >= 1) { c.e = T.e; c.sign = T.sign; c.lane = Math.min(c.lane, (T.e.lanes || 1) - 1); c.s = (T.sign > 0 ? T.e._a : T.e._b).radius || 8; c.turn = null; c.next = null; }
        else { const u = T.t, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u; c.x = h00 * T.x0 + h10 * T.tx0 + h01 * T.x1 + h11 * T.tx1; c.z = h00 * T.z0 + h10 * T.tz0 + h01 * T.z1 + h11 * T.tz1; const du = 0.02, u2 = Math.min(1, u + du), g00 = 2 * u2 ** 3 - 3 * u2 * u2 + 1, g10 = u2 ** 3 - 2 * u2 * u2 + u2, g01 = -2 * u2 ** 3 + 3 * u2 * u2, g11 = u2 ** 3 - u2 * u2; c.yaw = Math.atan2(g00 * T.x0 + g10 * T.tx0 + g01 * T.x1 + g11 * T.tx1 - c.x, g00 * T.z0 + g10 * T.tz0 + g01 * T.z1 + g11 * T.tz1 - c.z) || c.yaw; }
      } else {
        this.lane(e, c.sign, c.lane, c.s, P1);
        // the siren: notice, then pull to the right and stop
        let yielding = false;
        const dx = s.x - P1.x, dz = s.z - P1.z, dist = Math.hypot(dx, dz);
        if (warn > 0 && dist < 95 * warn + 20 && !c.hit) {
          const heading = P1.dx * asin + P1.dz * acos, behind = (dx * P1.dx + dz * P1.dz) < 4, closing = aspeed > 2;
          const lateral = Math.abs(dx * -P1.dz + dz * P1.dx);
          const same = heading > 0.5 && behind && lateral < 14, oncoming = heading < -0.5 && !behind && lateral < 16;
          const nodeD = Math.hypot(endNode.x - s.x, endNode.z - s.z), cross = Math.abs(heading) <= 0.5 && nodeD < 75 && (e.length - c.s) < 45 && ((endNode.x - s.x) * asin + (endNode.z - s.z) * acos) > 0;
          if ((same || oncoming || cross) && closing) { c.aware += dt; const react = c.oblivious ? (cross ? 99 : 5.5) : 0.5 + (1 - warn) * 2.2 + c.pers * 0.6; if (c.aware > react) { yielding = true; if (cross) target = 0; else if (e.bridge || (e.lanes || 1) > 1 && c.lane === 0 && same) { c.offT = e.bridge ? 0.9 : 0; target = Math.max(target, e.speed * 1.1); yielding = false; c.clearing = true; } else { c.offT = Math.min(2.3, Math.max(0.8, (e.width || 9) / 2 - ((e.median || 0) / 2 + (c.lane + 0.5) * (e.laneWidth || 3.3)) - 0.9)); target = (c.off < c.offT - 0.25) ? 2.2 : (same ? 0 : Math.min(target, 3)); } } }
          else c.aware = Math.max(0, c.aware - dt * 0.5);
        } else c.aware = Math.max(0, c.aware - dt);
        if (!yielding && !c.clearing) c.offT = 0; c.clearing = false;
        c.off += clamp((c.offT || 0) - c.off, -1, 1) * Math.min(1, Math.abs(c.v) * 0.5 + 0.05) * dt * 1.4; c.yielding = yielding;
        // the junction ahead
        const toStop = stopLine - c.s;
        if (!c.next) c.next = this.pickNext(c) || 'dead';
        if (toStop < 40) {
          let hold = false;
          if (endNode.control === 'signal' && town.signal) { const sg = town.signal(endNode.id, e.id, this.t + (this.game.clockOffset || 0)); if (sg === 'r' || (sg === 'y' && toStop > c.v * 1.1)) hold = true; }
          else if ((endNode.control === 'stop') && (e.stopAt ? (c.sign > 0 ? e.stopAt.b : e.stopAt.a) : true)) { if (c.stopT < 1.4) hold = true; if (toStop < 1 && c.v < 0.3) c.stopT += dt; }
          if (c.next === 'dead') hold = true;
          // do not enter a junction another car is turning through, or the ambulance is in
          if (!hold && toStop < 6) { for (const o of this.traffic) if (o !== c && o.on && o.turn && o.turn.node === endNode && o.turn.t < 0.8) { hold = true; break; } if (Math.hypot(s.x - endNode.x, s.z - endNode.z) < rEnd + 4 && aspeed > 1) hold = true; }
          if (hold) target = Math.min(target, Math.max(0, toStop) * 0.9);
          if (hold && c.yielding && c.off < (c.offT || 0) - 0.25 && toStop > 1.5) target = Math.max(target, 1.6);
          if (c.next === 'dead' && toStop < 2) { c.on = false; c.m.group.visible = false; continue; }
        }
        // the car in front
        for (const o of this.traffic) { if (o === c || !o.on || o.turn || o.e !== e || o.sign !== c.sign || o.lane !== c.lane) continue; const gap = o.s - c.s - 5.2; if (gap > -2 && gap < 45) target = Math.min(target, Math.max(0, gap - 1.5) / 1.4 + o.v * 0.6 * (gap > 3 ? 1 : 0)); }
        // the ambulance in front (stopped at a scene, say)
        { const fx = s.x - P1.x, fz = s.z - P1.z, ahead = fx * P1.dx + fz * P1.dz, lat = Math.abs(fx * -P1.dz + fz * P1.dx); if (ahead > 0 && ahead < 28 && lat < 2.4) target = Math.min(target, Math.max(0, ahead - 9) / 1.3); }
        if (c.wait > 0) { c.wait -= dt; target = 0; }
        c.v = c.v < target ? Math.min(target, c.v + 2.3 * dt) : Math.max(target, c.v - (target === 0 && c.v > 6 ? 6.5 : 4.2) * dt);
        c.s += c.v * dt; c.x = P1.x - P1.dz * c.off; c.z = P1.z + P1.dx * c.off; c.yaw = P1.yaw;
        if (c.s >= stopLine + 1.4 && c.next && c.next !== 'dead') {
          const N = c.next, r2 = endNode.radius || 8; this.lane(N.e, N.sign, Math.min(c.lane, (N.e.lanes || 1) - 1), r2, P2);
          const len = Math.max(6, Math.hypot(P2.x - c.x, P2.z - c.z)), k = len * 0.9;
          c.turn = { e: N.e, sign: N.sign, node: endNode, t: 0, len, x0: c.x, z0: c.z, x1: P2.x, z1: P2.z, tx0: P1.dx * k, tz0: P1.dz * k, tx1: P2.dx * k, tz1: P2.dz * k }; c.stopT = 0;
          c.m.lights?.setIndicators?.(N.dot < 0.5 && cross2(P1, P2) > 0, N.dot < 0.5 && cross2(P1, P2) < 0);
        }
      }
      c.rot = c.yaw; const g = c.m.group; g.position.set(c.x, 0, c.z); g.rotation.y = c.yaw;
      const spin = c.v * dt / 0.33; if (c.m.wheels) for (const w of c.m.wheels) w.rotation.x += spin;
      c.m.lights?.setBrake?.(c.v < 0.5 || c.yielding); c.m.lights?.update?.(dt, this.t);
      const d2 = Math.hypot(c.x - s.x, c.z - s.z); if (d2 > 390) { c.on = false; g.visible = false; }
      else if (d2 < 14 && !c.passed && Math.abs(c.v - s.vx) > 6) { c.passed = true; Snd.passBy((c.x - s.x) * acos - (c.z - s.z) * asin > 0 ? -0.7 : 0.7, clamp(Math.abs(s.vx) / 30)); if (c.oblivious && this.rng() < 0.3) Snd.carHorn(0); } else if (d2 > 30) c.passed = false;
    }
  }

  // ---------------------------------------------------------------- navigation
  nearestEdge(x, z) { let best = null, bd = 1e9, bt = 0; for (const e of this.town.edges) { const ax = e._a.x, az = e._a.z, t = clamp(((x - ax) * e.dir.x + (z - az) * e.dir.z), 0, e.length), px = ax + e.dir.x * t, pz = az + e.dir.z * t, d = (x - px) ** 2 + (z - pz) ** 2; if (d < bd) { bd = d; best = e; bt = t; } } return { e: best, t: bt, d: Math.sqrt(bd) }; }
  dijkstra(to) {
    const dist = new Map(), ne = this.nearestEdge(to.x, to.z), pq = [[ne.t, ne.e._a], [ne.e.length - ne.t, ne.e._b]]; this.toEdge = ne;
    while (pq.length) { pq.sort((a, b) => a[0] - b[0]); const [d, n] = pq.shift(); if (dist.has(n.id)) continue; dist.set(n.id, d); for (const id of n.edges || []) { const e = this.edgeById.get(id); if (!e) continue; const m = e._a === n ? e._b : e._a; if (!dist.has(m.id)) pq.push([d + e.length * (e.cls === 'alley' ? 2.5 : e.cls === 'arterial' || e.cls === 'bypass' ? 0.85 : 1), m]); } }
    return dist;
  }
  route() {
    const s = this.s, to = this.run.to, D = this.distTo, ne = this.nearestEdge(s.x, s.z), pts = [{ x: s.x, z: s.z }], names = [];
    if (ne.e === this.toEdge.e) { pts.push({ x: to.x, z: to.z }); return { pts, turn: null, dist: Math.hypot(to.x - s.x, to.z - s.z) }; }
    const da = ne.t + (D.get(ne.e._a.id) ?? 1e9), db = ne.e.length - ne.t + (D.get(ne.e._b.id) ?? 1e9); let n = da < db ? ne.e._a : ne.e._b, prevE = ne.e, total = Math.min(da, db), guard = 80, turn = null;
    while (n && guard--) {
      pts.push({ x: n.x, z: n.z }); if (n === this.toEdge.e._a || n === this.toEdge.e._b) { if ((D.get(n.id) ?? 0) <= Math.max(this.toEdge.t, this.toEdge.e.length - this.toEdge.t) + 1) { if (!turn && prevE !== this.toEdge.e) turn = this.turnAt(pts, n, this.toEdge.e, prevE); break; } }
      let best = null, bd = 1e9, be = null; for (const id of n.edges || []) { const e = this.edgeById.get(id); if (!e) continue; const m = e._a === n ? e._b : e._a; const d = (D.get(m.id) ?? 1e9) + e.length * (e.cls === 'alley' ? 2.5 : e.cls === 'arterial' || e.cls === 'bypass' ? 0.85 : 1); if (d < bd) { bd = d; best = m; be = e; } }
      if (!best || (D.get(best.id) ?? 1e9) >= (D.get(n.id) ?? 1e9)) break;
      if (!turn && be !== prevE) { const tn = this.turnAt(pts, n, be, prevE); if (tn && (tn.dir !== 'straight' || be.name !== prevE.name)) turn = tn; }
      prevE = be; n = best;
    }
    pts.push({ x: to.x, z: to.z }); return { pts, turn, dist: total };
  }
  turnAt(pts, n, e, prevE) { const p = pts[pts.length - 2] || pts[0]; const inx = n.x - p.x, inz = n.z - p.z; const sign = e._a === n ? 1 : -1, ox = e.dir.x * sign, oz = e.dir.z * sign; const cr = inx * oz - inz * ox, dot = (inx * ox + inz * oz) / (Math.hypot(inx, inz) || 1); const dir = dot > 0.8 ? 'straight' : cr > 0 ? 'right' : 'left'; return { dir, name: e.name || '', dist: Math.hypot(n.x - this.s.x, n.z - this.s.z) }; }
  routeLength() { const r = this.route(); let L = 0; for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].z - r.pts[i - 1].z); return L; }

  hud(dt) {
    const s = this.s, run = this.run; $('#spd').textContent = Math.round(Math.abs(s.vx) * MPH);
    $('#pLights').classList.toggle('on', this.lights); $('#pSiren').classList.toggle('on', this.siren !== 'off'); $('#pGear b').textContent = s.rev ? 'R' : Math.abs(s.vx) < 0.1 && keys.has('Space') ? 'P' : 'D';
    $('#dmgBar').style.width = (1 - this.damage) * 100 + '%'; $('#dmgBar').style.background = this.damage < 0.35 ? 'var(--green)' : this.damage < 0.7 ? 'var(--amber)' : 'var(--red)';
    this.navT = (this.navT || 0) - dt; if (this.navT <= 0) { this.navT = 0.3; this.rt = this.route(); }
    const rt = this.rt; const dTo = Math.hypot(run.to.x - s.x, run.to.z - s.z);
    const cT = $('#cT'), cD = $('#cD'); if (cT) cT.textContent = fmtClock(run.t); if (cD) cD.textContent = dTo > 1000 ? (dTo / 1609).toFixed(1) + ' mi' : Math.round(dTo * 3.281 / 50) * 50 + ' ft';
    const gps = this.game.diff.gps !== false;
    const nav = $('#nav'); if (rt?.turn && gps) { nav.style.display = 'flex'; nav.querySelector('.arrow').textContent = { left: '↰', right: '↱', straight: '↑' }[rt.turn.dir]; nav.querySelector('b').textContent = rt.turn.name || (rt.turn.dir === 'straight' ? 'Continue' : 'Turn ' + rt.turn.dir); nav.querySelector('span').textContent = rt.turn.dist > 400 ? (rt.turn.dist / 1609).toFixed(1) + ' mi' : Math.round(rt.turn.dist * 3.281 / 50) * 50 + ' ft'; } else if (gps && dTo < 80) { nav.style.display = 'flex'; nav.querySelector('.arrow').textContent = '◎'; nav.querySelector('b').textContent = 'Arriving'; nav.querySelector('span').textContent = run.to.label || ''; } else nav.style.display = gps ? 'flex' : 'none';
    this.minimap(rt, gps);
    // arrival
    this.canArrive = dTo < (run.radius || 16) && Math.abs(s.vx) < 1; const pr = $('#prompt');
    if (this.canArrive) { pr.classList.add('on'); pr.innerHTML = `<kbd>E</kbd> ${run.mode === 'response' ? 'On scene: grab the kit' : run.mode === 'transport' ? 'Hand over to the emergency department' : (run.title ? 'On post' : 'Back in quarters')}`; }
    else if (dTo < 45) { pr.classList.add('on'); pr.textContent = Math.abs(s.vx) >= 1 ? 'Stop here' : 'A little closer'; }
    else if (run.patient && run.onBack && Math.abs(s.vx) < 0.6 && run.t > 4) { pr.classList.add('on'); pr.innerHTML = '<kbd>T</kbd> Stop here and climb in the back to treat'; } else pr.classList.remove('on');
  }
  minimap(rt, gps) {
    const cv = $('#mini canvas'), c = cv.getContext('2d'), W = cv.width, s = this.s, map = this.town.map; c.fillStyle = '#10151a'; c.fillRect(0, 0, W, W);
    const k = 1.15 * this.mapZoom * (1 - clamp(Math.abs(s.vx) / 60) * 0.3);                    // canvas px per metre
    c.save(); c.translate(W / 2, W * 0.62); c.rotate(s.yaw + Math.PI); c.scale(k, k);
    if (map?.canvas) { const ms = map.scale; c.drawImage(map.canvas, (map.minX - s.x), (map.minZ - s.z), map.canvas.width / ms, map.canvas.height / ms); }
    else { c.strokeStyle = '#3a4650'; c.lineWidth = 7; c.beginPath(); for (const e of this.town.edges) { c.moveTo(e._a.x - s.x, e._a.z - s.z); c.lineTo(e._b.x - s.x, e._b.z - s.z); } c.stroke(); }
    if (rt && gps) { c.strokeStyle = 'rgba(79,209,255,.95)'; c.lineWidth = 5 / Math.sqrt(k); c.lineJoin = 'round'; c.beginPath(); rt.pts.forEach((p, i) => i ? c.lineTo(p.x - s.x, p.z - s.z) : c.moveTo(p.x - s.x, p.z - s.z)); c.stroke(); }
    const to = this.run.to; c.fillStyle = '#ff4d43'; c.beginPath(); c.arc(to.x - s.x, to.z - s.z, 7 / k, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2 / k; c.stroke();
    for (const t of this.traffic) if (t.on) { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(t.x - s.x - 1.2, t.z - s.z - 1.2, 2.4, 2.4); }
    c.restore();
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2, W * 0.62 - 15); c.lineTo(W / 2 + 10, W * 0.62 + 11); c.lineTo(W / 2, W * 0.62 + 5); c.lineTo(W / 2 - 10, W * 0.62 + 11); c.closePath(); c.stroke(); c.fill();
    const g = c.createRadialGradient(W / 2, W / 2, W * 0.36, W / 2, W / 2, W * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)'); c.fillStyle = g; c.fillRect(0, 0, W, W);
  }

  // ---------------------------------------------------------------- visuals
  syncMesh(dt) {
    const s = this.s, a = this.amb; if (!a) return; a.group.position.set(s.x, 0, s.z); a.group.rotation.y = s.yaw;
    if (this.bumpT > 0) this.bumpT -= dt;
    if (a.body) { a.body.rotation.z = s.rollA; a.body.rotation.x = s.pitchA; a.body.position.y = (this.bumpT > 0 ? Math.sin(this.bumpT * 40) * 0.02 : 0); }
    const spin = s.vx * dt / (this.dims.wheelRadius || 0.4); if (a.wheels) for (const w of a.wheels) w.rotation.x += spin; if (a.steer) for (const p of a.steer) p.rotation.y = s.steer;
    if (a.wheel) a.wheel.rotation.z = -s.steer * 7; a.gauges?.setSpeed?.(Math.abs(s.vx) * 3.6); a.gauges?.setRpm?.(this.rpm || 0);
  }
  updateLights(dt) {
    const a = this.amb, L = a?.lights; if (!L) return; const night = U.uNight.value;
    L.setHead?.(night > 0.25 || U.uRain.value > 0.3 ? 1 : 0); L.setBrake?.(this.active && (keys.has('KeyS') || keys.has('Space'))); L.setReverse?.(this.s.rev); L.setEmergency?.(this.lights); L.update?.(dt, this.t);
    a.setWipers?.(U.uRain.value > 0.2);
    this.head.intensity = (night > 0.25 || U.uRain.value > 0.3) ? 330 * Math.max(night, 0.3) : 0;
    const sL = L.strobeL || L.strobe, sR = L.strobeR || L.strobe; const k = this.lights ? lerp(40, 240, night) : 0;
    if (sL) { this.strobes[0].color.copy(sL); this.strobes[0].intensity = k * Math.min(1, luma(sL)); } if (sR) { this.strobes[1].color.copy(sR); this.strobes[1].intensity = k * Math.min(1, luma(sR)); }
    if (L.strobe && this.lights) U.uStrobe.value.copy(L.strobe).multiplyScalar(0.35 * (0.3 + night)); else U.uStrobe.value.setRGB(0, 0, 0);
    // borrow the nearest street lamps as real lights
    this.lampT = (this.lampT || 0) - dt; const lamps = this.town?.lamps;
    if (lamps && night > 0.2) { if (this.lampT <= 0) { this.lampT = 0.3; const f = G.camera?.position || this.cam.position, best = []; for (let i = 0; i < lamps.length; i += 3) { const d = (lamps[i] - f.x) ** 2 + (lamps[i + 2] - f.z) ** 2; if (d < 70 * 70) best.push([d, i]); } best.sort((p, q) => p[0] - q[0]); this.lampPool.forEach((l, j) => { const b = best[j]; if (b) { l.position.set(lamps[b[1]], lamps[b[1] + 1] - 0.4, lamps[b[1] + 2]); l.userData.on = 1; } else l.userData.on = 0; }); } for (const l of this.lampPool) l.intensity = damp(l.intensity, l.userData.on ? 95 * night : 0, 4, dt); } else for (const l of this.lampPool) l.intensity = 0;
  }
  // Light the patient from the parked truck's scene lights (street calls).
  lightScene(pos, on) { const a = this.amb; this.sceneLight.intensity = on ? 42 * (0.1 + U.uNight.value) : 0; if (!on) return; this.sceneLight.position.set(this.s.x, 3.0, this.s.z); this.sceneLight.target.position.copy(pos); this.sceneLight.target.updateMatrixWorld(); a?.lights?.setSceneLights?.(true); }

  camera(dt) {
    const s = this.s, sin = Math.sin(s.yaw), cos = Math.cos(s.yaw), sp = Math.abs(s.vx), a = this.amb;
    if (this.camMode === 1 && a?.seat) {
      a.group.updateMatrixWorld(true); a.seat.getWorldPosition(this.cam.position); const look = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') && !this.canArrive ? 1 : 0);
      this.lookYaw = damp(this.lookYaw || 0, look * 1.1 + s.steer * 0.35, 5, dt); const y = s.yaw + this.lookYaw; this.camTgt.set(this.cam.position.x + Math.sin(y) * 10, this.cam.position.y - 0.55 + s.pitchA * 10, this.cam.position.z + Math.cos(y) * 10);
      this.cam.up.set(Math.sin(s.rollA) * cos, 1, -Math.sin(s.rollA) * sin).normalize(); this.cam.fov = 70; this.cam.near = 0.08;
      // the dash computer shows the same map as the HUD
      this.mdtT = (this.mdtT || 0) - dt; if (this.mdtT <= 0 && a.mdtCanvas) { this.mdtT = 0.25; const m = a.mdtCanvas.getContext('2d'), src = $('#mini canvas'); m.fillStyle = '#0b1014'; m.fillRect(0, 0, a.mdtCanvas.width, a.mdtCanvas.height); m.drawImage(src, 60, 90, 380, 238, 0, 0, a.mdtCanvas.width, a.mdtCanvas.height); if (a.mdtTexture) a.mdtTexture.needsUpdate = true; }
    } else {
      const back = this.camMode === 2 ? 16 : 10.6, up = this.camMode === 2 ? 8.5 : 4.7; const vyaw = s.yaw + clamp(Math.atan2(s.vy, Math.max(4, sp)) * 0.5, -0.3, 0.3) * 0;
      const want = _v.set(s.x - Math.sin(vyaw) * (back + sp * 0.06), up, s.z - Math.cos(vyaw) * (back + sp * 0.06)); this.camPos.x = damp(this.camPos.x, want.x, 5.5, dt); this.camPos.z = damp(this.camPos.z, want.z, 5.5, dt); this.camPos.y = damp(this.camPos.y, want.y, 4, dt);
      const shake = sp * 0.0009 + (this.bumpT > 0 ? 0.03 : 0) + (this.surf === 'grass' ? sp * 0.002 : 0);
      this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * shake, this.camPos.y + (Math.random() - 0.5) * shake, this.camPos.z); this.camTgt.set(s.x + sin * (8 + sp * 0.3), 1.6, s.z + cos * (8 + sp * 0.3)); this.cam.up.set(0, 1, 0); this.cam.fov = damp(this.cam.fov, 50 + clamp(sp / 35) * 13, 3, dt); this.cam.near = 0.3;
    }
    this.cam.lookAt(this.camTgt); this.cam.updateProjectionMatrix();
    if (a?.cab) a.cab.visible = true;
    if (this.cabGlow) this.cabGlow.intensity = this.camMode === 1 ? 0.5 + 1.1 * U.uNight.value : 0;
  }
  audio(dt) {
    const s = this.s, sp = Math.abs(s.vx), thr = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    let g = 1; while (g < 5 && sp > GEARS[g]) g++; if (g !== this.gear) { this.gear = g; } const lo = GEARS[g - 1], hi = GEARS[g]; this.rpm = damp(this.rpm || 0.1, s.rev ? clamp(0.15 + sp / 9) : clamp(0.16 + 0.72 * (sp - lo * 0.72) / (hi - lo * 0.72)) * (thr ? 1 : 0.8) + thr * 0.08, 6, dt);
    Snd.engine({ on: true, rpm: this.rpm, load: thr, speed: sp }); Snd.siren(this.siren); Snd.airhorn(keys.has('KeyH'));
    Snd.tires({ skid: clamp(((this.slip || 0) - 0.09) * 6) * clamp(sp / 8), speed: sp, wet: U.uWet.value }); Snd.wind(clamp(sp / 40) * (this.camMode === 1 ? 0.5 : 1) + (this.rig?.preset?.wind ? 0.3 : 0));
    Snd.rain(U.uRain.value); Snd.rainOnRoof(this.camMode === 1 ? U.uRain.value : 0); Snd.reverseBeeper(s.rev && sp > 0.2);
  }
}

const P1 = {}, P2 = {}, _v = new THREE.Vector3();
const cross2 = (a, b) => a.dx * b.dz - a.dz * b.dx;
const luma = c => Math.max(c.r, c.g, c.b);
function findMesh(g) { let m = null; g.traverse(o => { if (!m && o.isMesh) m = o; }); return m; }
function amb_setDamage(a, d) { try { a?.setDamage?.(d); } catch { } }
