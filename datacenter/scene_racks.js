// scene_racks.js — racks, servers and LEDs as InstancedMeshes (§15): one rack frame set, one set per tier (capacity
// 1,920), one LED quad set (a status beacon per rack + 2 LEDs per server), footprint outlines and invisible pick
// proxies. Owns the rack-level visual state (dark, incident, boot flash, slide-in, drop, sweeps) and writes every LED
// colour each frame.
//
// Coordinates: a rack at footprint [x, z, rotY] has matrix T(x,0,z)·Ry(rotY); a server in slot s sits at the rack's
// slot_s empty; its LEDs at slot_s + the tier's led_0/led_1 offsets, read once from the GLB.

import * as THREE from 'three';
import { bake, libraryObject, childByRole, warnOnce } from './scene_assets.js';

const RACK_CAP = 240, SERVER_CAP = 1920;
// LED instance layout: [0, RACK_CAP) are the per-rack beacons (a 0.5 × 0.06 m bar at the rack's top front that
// carries the incident / dark / resolved read at any zoom), then two LEDs per server from LED_BASE.
const LED_BASE = RACK_CAP;
const LED_MIN_PX = 3.5;           // an LED quad is never narrower than this on screen at the fitted view
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const easeOutCubic = p => 1 - (1 - p) ** 3;
const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; };
const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
const key = (rack, slot) => rack * 8 + slot;

export function createRackField({ data, lib, mats, scene, textures }) {
  const { TIERS, PALETTE, LED, ANIM, RACK_SLOTS } = data;
  const group = new THREE.Group();
  group.name = 'racks';
  scene.add(group);

  // ---- rack frames -----------------------------------------------------------------------------------------------------
  const rackObj = libraryObject(lib, 'rack_frame', data);
  const slotPos = [];
  for (let i = 0; i < RACK_SLOTS; i++) {
    const e = childByRole(rackObj, `slot_${i}`);
    slotPos.push(e ? e.position.clone() : new THREE.Vector3(0, 0.12 + 0.22 * i, 0.1));
  }
  // the beacon bar sits on the front face of the rack's top panel, just proud of the front posts, so it reads from
  // the default pitch (inside the cabinet, behind the posts, the top panel's lip hides it)
  const rackDim = data.ASSETS?.rack || { d: 1.2, h: 2.0, base: 0.12 };
  const beaconPos = new THREE.Vector3(0, rackDim.h - rackDim.base / 2, rackDim.d / 2 + 0.012);
  // The frame keeps its two GLB materials: slot 0 is the paint (black steel ↔ white from the Colo on), slot 1 the trim.
  const paintDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rackGarage), roughness: 0.8, metalness: 0.2 });
  const paintWhite = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rackWhite).multiplyScalar(0.85), roughness: 0.85 });
  let frameGeom, frameMats;
  {
    const parts = [];
    rackObj.traverse(n => { if (n.isMesh) parts.push(n); });
    const paintPart = parts.find(p => p.material?.name === 'MAT_steel_dark') || parts[0];
    const b = bake(rackObj, mats);
    // bake() folds both GLB materials into one body group; re-split into paint + trim groups (plain materials, so the
    // vertex colours are ignored) so the Colo repaint is a material swap. Both parts are body class, so the bake kept
    // them in traversal order.
    frameGeom = b.geometry;
    frameGeom.clearGroups();
    let start = 0, paintRange = null;
    for (const p of parts) {
      const n = p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count;
      if (p === paintPart) paintRange = [start, n];
      start += n;
    }
    const total = start;
    if (paintRange) {
      if (paintRange[0] > 0) frameGeom.addGroup(0, paintRange[0], 1);
      frameGeom.addGroup(paintRange[0], paintRange[1], 0);
      if (paintRange[0] + paintRange[1] < total) frameGeom.addGroup(paintRange[0] + paintRange[1], total - paintRange[0] - paintRange[1], 1);
    } else frameGeom.addGroup(0, total, 0);
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.21, 0.23), roughness: 0.8 });
    frameMats = [paintDark, trim];
  }
  const frames = new THREE.InstancedMesh(frameGeom, frameMats, RACK_CAP);
  frames.name = 'rack_frames';
  frames.count = 0;
  frames.frustumCulled = false;
  group.add(frames);

  // Pick proxies: fat boxes on layer 1 (never rendered; the raycaster tests that layer only). 2.3 m tall so the
  // money-pop point scene.project() uses (rack top, y 2.1) is inside the box, not on its lid; the full 0.8 m pitch
  // wide so neighbours leave no gap along a row and a tap between two frames hits the nearer one (scene.js snaps a
  // miss above or below a row to the nearest rack).
  const proxyGeom = new THREE.BoxGeometry(0.8, 2.3, 1.3);
  proxyGeom.translate(0, 1.15, 0);
  const proxies = new THREE.InstancedMesh(proxyGeom, new THREE.MeshBasicMaterial(), RACK_CAP);
  proxies.layers.set(1);
  proxies.count = 0;
  proxies.frustumCulled = false;
  group.add(proxies);

  // Dark footprint outlines for footprints not yet bought.
  const outlineGeom = new THREE.PlaneGeometry(0.72, 1.32);
  outlineGeom.rotateX(-Math.PI / 2);
  const outlines = new THREE.InstancedMesh(outlineGeom, new THREE.MeshBasicMaterial({ map: textures.outline, transparent: true, opacity: 0.55, depthWrite: false }), RACK_CAP);
  outlines.count = 0;
  outlines.frustumCulled = false;
  outlines.renderOrder = -1;
  group.add(outlines);

  // ---- tiers -------------------------------------------------------------------------------------------------------------
  const tiers = TIERS.map((t, ti) => {
    const obj = libraryObject(lib, t.id, data);
    const b = bake(obj, mats, { skip: n => !n.isMesh && n.children.length === 0 });
    const mesh = new THREE.InstancedMesh(b.geometry, b.materials, SERVER_CAP);
    mesh.name = t.id;
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    const led = [0, 1].map(i => {
      const e = childByRole(obj, `led_${i}`);
      if (!e) warnOnce('led:' + t.id, `${t.id} has no led_${i} empty; using the default offset`);
      return e ? e.position.clone() : new THREE.Vector3(-0.21 + 0.03 * i, 0.13, 0.447);
    });
    return { id: t.id, index: ti, mesh, keys: [], color: new THREE.Color(t.led.color), led, pulseT: -1 };
  });
  const tierIndex = Object.fromEntries(tiers.map(t => [t.id, t.index]));

  // ---- LEDs --------------------------------------------------------------------------------------------------------------
  const ledGeom = new THREE.PlaneGeometry(1, 1);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const leds = new THREE.InstancedMesh(ledGeom, ledMat, LED_BASE + SERVER_CAP * 2);
  leds.name = 'leds';
  leds.frustumCulled = false;
  leds.setColorAt(0, new THREE.Color(0, 0, 0));
  leds.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const ledColors = leds.instanceColor.array;
  const ledPhase = new Float32Array(SERVER_CAP * 2);
  for (let i = 0; i < ledPhase.length; i++) ledPhase[i] = Math.random() * Math.PI * 2;
  {
    // every beacon is parked at scale 0 until its rack exists, so the draw count can always cover them
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < RACK_CAP; i++) leds.setMatrixAt(i, zero);
  }
  leds.count = LED_BASE;
  group.add(leds);
  let ledW = 0.03, ledH = 0.018;

  // ---- dust rings (rack drops) -------------------------------------------------------------------------------------------
  const rings = [];
  const ringGeom = new THREE.RingGeometry(0.35, 0.6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    // unlit, so the colour is the dust itself: a dim concrete grey, never a bright annulus on the floor
    const m = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.15, 0.14), transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    group.add(m);
    rings.push({ mesh: m, t: -1 });
  }

  // ---- state -------------------------------------------------------------------------------------------------------------
  let stage = data.STAGES[0];
  const racks = [];          // index = footprint index: { x, z, rotY, m: Matrix4, dark, incident, resolvedAt, dropT }
  const servers = new Map(); // key(rack,slot) → { tier, sid, bootAt, slideT, out: null | { t, next } }
  const sidFree = [];
  let sidTop = 0;
  let sweep = null;          // { kind: 'flash'|'off'|'on', t, rowDur, delay }
  let now = 0;
  const amber = new THREE.Color(PALETTE.incident), white = new THREE.Color(PALETTE.bootWhite), green = new THREE.Color(PALETTE.meterGreen), darkRed = new THREE.Color(PALETTE.dark);
  const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpM3 = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1);

  const rowOf = i => Math.floor(i / Math.max(1, stage.cols));
  const rows = () => Math.max(1, stage.rows);

  function allocSid() { return sidFree.length ? sidFree.pop() : sidTop++; }

  // ---- matrices ---------------------------------------------------------------------------------------------------------
  function rackMatrix(r, yOff = 0) {
    tmpQ.setFromAxisAngle(Y_AXIS, r.rotY);
    return tmpM.compose(tmpV.set(r.x, yOff, r.z), tmpQ, tmpS.set(1, 1, 1));
  }

  function writeServerMatrix(rack, slot, s, zOff = 0, yOff = 0) {
    const r = racks[rack];
    if (!r) return;
    const tier = tiers[s.tier];
    const base = rackMatrix(r, yOff);
    const sp = slotPos[slot];
    tmpM2.makeTranslation(sp.x, sp.y, sp.z + zOff).premultiply(base);
    tier.mesh.setMatrixAt(s.idx, tmpM2);
    tier.mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 2; i++) {
      const o = tier.led[i];
      tmpM2.makeTranslation(sp.x + o.x, sp.y + o.y, sp.z + o.z + zOff).premultiply(base).scale(tmpV.set(ledW, ledH, 1));
      leds.setMatrixAt(LED_BASE + s.sid * 2 + i, tmpM2);
    }
    leds.instanceMatrix.needsUpdate = true;
  }

  function writeRackMatrix(i, yOff = 0) {
    const r = racks[i];
    const m = rackMatrix(r, yOff);
    frames.setMatrixAt(i, m);
    proxies.setMatrixAt(i, m);
    frames.instanceMatrix.needsUpdate = true;
    proxies.instanceMatrix.needsUpdate = true;
    tmpM3.makeTranslation(beaconPos.x, beaconPos.y, beaconPos.z).premultiply(m).scale(tmpV.set(0.5, 0.06, 1));
    leds.setMatrixAt(i, tmpM3);
    leds.instanceMatrix.needsUpdate = true;
    for (let s = 0; s < RACK_SLOTS; s++) { const sv = servers.get(key(i, s)); if (sv) writeServerMatrix(i, s, sv, 0, yOff); }
  }

  function writeOutlines() {
    const fps = stage.footprints;
    let n = 0;
    for (let i = racks.length; i < fps.length; i++) {
      const [x, z, rotY] = fps[i];
      tmpQ.setFromAxisAngle(Y_AXIS, rotY);
      outlines.setMatrixAt(n++, tmpM.compose(tmpV.set(x, 0.012, z), tmpQ, tmpS.set(1, 1, 1)));
    }
    outlines.count = n;
    outlines.instanceMatrix.needsUpdate = true;
  }

  // ---- public mutations -----------------------------------------------------------------------------------------------
  function setStage(stageDef, { fitDist = 10, pxPerM = 90 } = {}) {
    stage = stageDef;
    frames.material[0] = stageDef.stage >= 2 ? paintWhite : paintDark;
    setLedScale({ fitDist, pxPerM });
  }

  // LED quads are sized in pixels, not metres: at least LED_MIN_PX wide at the fitted view (phones: 64 px/m in the
  // portrait garage would otherwise give 2.5 px specks under bloom's reach), and never smaller than the distance rule
  // that sizes the desktop halls. pxPerM is the fitted viewport's px per metre at the fit distance (scene.js).
  function setLedScale({ fitDist = 10, pxPerM = 90 } = {}) {
    const w = THREE.MathUtils.clamp(Math.max(fitDist * 0.004, LED_MIN_PX / Math.max(1e-3, pxPerM)), 0.028, 0.16);
    if (Math.abs(w - ledW) < 1e-4) return;
    ledW = w; ledH = w * 0.55;
    for (const [k, s] of servers) writeServerMatrix(Math.floor(k / 8), k % 8, s);
  }

  function clear() {
    const zero = tmpM.makeScale(0, 0, 0);
    for (let i = 0; i < racks.length; i++) leds.setMatrixAt(i, zero);
    racks.length = 0;
    servers.clear();
    sidFree.length = 0; sidTop = 0;
    for (const t of tiers) { t.mesh.count = 0; t.keys.length = 0; }
    frames.count = proxies.count = 0;
    leds.count = LED_BASE;
    leds.instanceMatrix.needsUpdate = true;
    sweep = null;
    writeOutlines();
  }

  function addRack(i, { animate = false } = {}) {
    if (racks[i]) return;
    const fp = stage.footprints[i];
    if (!fp) { warnOnce('fp:' + stage.id, `rack ${i} has no footprint in ${stage.id}`); return; }
    while (racks.length < i) addRack(racks.length); // keep the index dense
    const r = { x: fp[0], z: fp[1], rotY: fp[2] || 0, dark: false, incident: null, resolvedAt: -1, dropT: animate ? 0 : -1 };
    racks[i] = r;
    frames.count = proxies.count = racks.length;
    writeRackMatrix(i, animate ? ANIM.rackDropM : 0);
    writeOutlines();
  }

  function addServer(rack, slot, tierId, { animate = false } = {}) {
    if (!racks[rack]) addRack(rack);
    if (!racks[rack]) return; // no footprint for it in this stage (a rebuild is pending)
    const ti = tierIndex[tierId];
    if (ti === undefined) { warnOnce('tier:' + tierId, `unknown tier ${tierId}`); return; }
    const k = key(rack, slot);
    if (servers.has(k)) removeServer(rack, slot);
    const tier = tiers[ti];
    const s = { tier: ti, idx: tier.mesh.count, sid: allocSid(), bootAt: animate ? now + LED.bootDelayS : -Infinity, slideT: animate ? 0 : null, out: null };
    tier.keys[s.idx] = k;
    tier.mesh.count++;
    servers.set(k, s);
    leds.count = Math.max(leds.count, LED_BASE + (s.sid + 1) * 2);
    writeServerMatrix(rack, slot, s, animate ? 0.7 : 0);
  }

  function removeServer(rack, slot) {
    const k = key(rack, slot);
    const s = servers.get(k);
    if (!s) return;
    const tier = tiers[s.tier];
    const last = tier.mesh.count - 1;
    if (s.idx !== last) {
      // move the last instance into the hole
      tier.mesh.getMatrixAt(last, tmpM);
      tier.mesh.setMatrixAt(s.idx, tmpM);
      const lk = tier.keys[last];
      tier.keys[s.idx] = lk;
      servers.get(lk).idx = s.idx;
    }
    tier.keys.length = last;
    tier.mesh.count = last;
    tier.mesh.instanceMatrix.needsUpdate = true;
    tmpM.makeScale(0, 0, 0);
    leds.setMatrixAt(LED_BASE + s.sid * 2, tmpM); leds.setMatrixAt(LED_BASE + s.sid * 2 + 1, tmpM);
    leds.instanceMatrix.needsUpdate = true;
    sidFree.push(s.sid);
    servers.delete(k);
  }

  // Refresh: the old server slides back into the rack and fades (0.25 s), then the new one slides in.
  function swapServer(rack, slot, toTier) {
    const s = servers.get(key(rack, slot));
    if (!s) { addServer(rack, slot, toTier, { animate: true }); return; }
    s.out = { t: 0, next: toTier };
  }

  function setDark(rack, dark) { if (racks[rack]) racks[rack].dark = !!dark; }
  function setIncident(rack, on) {
    const r = racks[rack];
    if (!r) return;
    if (on) r.incident = { t0: now };
    else { if (r.incident) r.resolvedAt = now; r.incident = null; }
  }
  function pulseTier(tierId) { const t = tiers[tierIndex[tierId]]; if (t) t.pulseT = now; }

  // kind 'flash': a white wave front→back ($1M); 'off': rows go black front→back and stay black (exit, 1.5 s);
  // 'on': rows light front→back after `delay` (offline return).
  function startSweep(kind, { total = 1.5, delay = 0 } = {}) {
    sweep = { kind, t: -delay, rowDur: total / rows() };
  }
  function clearSweep() { sweep = null; }

  // Rebuild from a full run state, no animations. An 'on' sweep survives the clear: the §11 offline cascade is
  // started on the first sim tick, which can land while the boot rebuild still awaits a shell that was not preloaded
  // (a Warehouse-or-later save), and the racks must then stay black for the count-up and light row by row. An Exit's
  // 'off' sweep is dropped, as the comment in updateAnimations says.
  function rebuild(run) {
    const keep = sweep && sweep.kind === 'on' ? sweep : null;
    clear();
    sweep = keep;
    const list = run?.racks || [];
    for (let i = 0; i < list.length && i < stage.footprints.length; i++) {
      addRack(i);
      const r = racks[i];
      r.dark = !!list[i].dark;
      r.incident = list[i].incident ? { t0: now } : null;
      (list[i].servers || []).forEach((tierId, slot) => { if (tierId) addServer(i, slot, tierId); });
    }
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------------
  function sweepFactor(row) {
    if (!sweep) return 1;
    const t = sweep.t, start = row * sweep.rowDur;
    if (sweep.kind === 'off') return t >= start + sweep.rowDur ? 0 : 1;
    if (sweep.kind === 'on') return t >= start + sweep.rowDur ? 1 : 0;
    // flash: a 0.25 s white boost as the wave passes
    const d = t - start;
    return d >= 0 && d < 0.3 ? 1 + 3 * (1 - d / 0.3) : 1;
  }

  function updateAnimations(dt) {
    for (let i = 0; i < racks.length; i++) {
      const r = racks[i];
      if (r.dropT >= 0) {
        r.dropT += dt;
        const p = Math.min(1, r.dropT / ANIM.rackDropS);
        writeRackMatrix(i, Math.max(-0.03, ANIM.rackDropM * (1 - easeOutBack(p)))); // the back-overshoot is a 3 cm thud, not a sink
        if (p >= 1) { r.dropT = -1; spawnRing(r.x, r.z); }
      }
    }
    const swapsDone = [];
    for (const [k, s] of servers) {
      const rack = Math.floor(k / 8), slot = k % 8;
      if (s.out) {
        s.out.t += dt;
        const p = Math.min(1, s.out.t / 0.25);
        writeServerMatrix(rack, slot, s, -0.5 * easeOutCubic(p));
        if (p >= 1) swapsDone.push([rack, slot, s.out.next]);
        continue;
      }
      if (s.slideT !== null) {
        s.slideT += dt;
        const p = Math.min(1, s.slideT / ANIM.serverSlideS);
        writeServerMatrix(rack, slot, s, 0.7 * (1 - easeOutCubic(p)));
        if (p >= 1) s.slideT = null;
      }
    }
    for (const [rack, slot, next] of swapsDone) { removeServer(rack, slot); addServer(rack, slot, next, { animate: true }); }
    for (const r of rings) {
      if (r.t < 0) continue;
      r.t += dt;
      const p = r.t / 0.6;
      if (p >= 1) { r.t = -1; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(1 + 1.6 * easeOutCubic(p));
      r.mesh.material.opacity = 0.4 * (1 - p) ** 1.5;
    }
    if (sweep) {
      sweep.t += dt;
      const end = sweep.kind === 'flash' ? rows() * sweep.rowDur + 0.3 : rows() * sweep.rowDur;
      if (sweep.kind !== 'off' && sweep.t > end) sweep = null; // 'off' stays until the next rebuild
    }
  }

  function spawnRing(x, z) {
    const r = rings.find(q => q.t < 0) || rings[0];
    r.t = 0;
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.02, z);
    r.mesh.scale.setScalar(1);
  }

  // env: { efficiency, blackout, gain }
  function updateLeds(env) {
    const eff = Math.max(0, Math.min(1, env.efficiency ?? 1));
    const gain = env.gain ?? 1.6;
    const t = now;
    const sec = Math.floor(t), frac = t - sec;
    const incOn = Math.floor(t * LED.incidentHz * 2) % 2 === 0;
    let r = 0, g = 0, b = 0;
    // beacons: amber 2 Hz on an incident (bright enough to halo), green for 0.6 s after a fix, dim red while dark
    for (let i = 0; i < racks.length; i++) {
      const rk = racks[i];
      r = g = b = 0;
      if (env.blackout) { /* stays black */ }
      else if (rk.incident) { const f = incOn ? 2.2 : 0.2; r = amber.r * f; g = amber.g * f; b = amber.b * f; }
      else if (rk.dark) { r = darkRed.r * 0.4; g = darkRed.g * 0.4; b = darkRed.b * 0.4; }
      else if (rk.resolvedAt >= 0 && t - rk.resolvedAt < 0.6) { r = green.r * 1.5; g = green.g * 1.5; b = green.b * 1.5; }
      ledColors[i * 3] = r; ledColors[i * 3 + 1] = g; ledColors[i * 3 + 2] = b;
    }
    for (const [k, s] of servers) {
      const rack = racks[Math.floor(k / 8)];
      const tier = tiers[s.tier];
      const sw = sweepFactor(rowOf(Math.floor(k / 8)));
      for (let i = 0; i < 2; i++) {
        const li = s.sid * 2 + i, gi = LED_BASE + li;
        if (env.blackout || sw === 0 || !rack || rack.dark) { r = g = b = 0; }
        else if (rack.incident) {
          const f = incOn ? 1.6 : 0.1; // the on phase clears the bloom threshold so the amber halos
          r = amber.r * f; g = amber.g * f; b = amber.b * f;
        } else if (t < s.bootAt) { r = g = b = 0; }
        else if (t < s.bootAt + LED.bootWhiteS) { r = g = b = 1.2; }
        else {
          let f = LED.pulseBase + LED.pulseAmp * Math.sin(LED.pulseRad * t + ledPhase[li]);
          // 10% of LEDs double-blink once a second
          if (hash(li * 7.13 + sec * 0.37) < LED.blinkProb) {
            const o = hash(li * 3.1 + sec * 1.7) * 0.7, d = frac - o;
            if ((d >= 0 && d < 0.07) || (d >= 0.14 && d < 0.21)) f *= 0.1;
          }
          if (tier.pulseT >= 0) {
            const age = t - tier.pulseT;
            if (age < LED.upgradePulseS) f *= 1.6 + 0.4 * Math.sin(t * 20);
          }
          f *= eff;
          r = tier.color.r * f; g = tier.color.g * f; b = tier.color.b * f;
          if (rack.resolvedAt >= 0 && t - rack.resolvedAt < 0.6) {
            const m = 1 - (t - rack.resolvedAt) / 0.6;
            r += green.r * m * 1.5; g += green.g * m * 1.5; b += green.b * m * 1.5;
          }
          if (sw > 1) { r += (sw - 1) * 0.8; g += (sw - 1) * 0.8; b += (sw - 1) * 0.8; }
        }
        ledColors[gi * 3] = r * gain; ledColors[gi * 3 + 1] = g * gain; ledColors[gi * 3 + 2] = b * gain;
      }
    }
    leds.instanceColor.needsUpdate = true;
  }

  function update(dt, env) {
    now += dt;
    updateAnimations(dt);
    updateLeds(env);
  }

  // ---- queries --------------------------------------------------------------------------------------------------------------
  function rackPosition(i, out = new THREE.Vector3()) {
    const r = racks[i] || (stage.footprints[i] && { x: stage.footprints[i][0], z: stage.footprints[i][1] });
    return r ? out.set(r.x, 1.0, r.z) : null;
  }
  function pick(raycaster) {
    // InstancedMesh.raycast computes its bounding sphere once and never again, so a sphere frozen at the first tap
    // (one garage rack) would reject every rack added or moved since; 240 instances make the recompute trivial per tap.
    proxies.computeBoundingSphere();
    const hits = raycaster.intersectObject(proxies, false);
    return hits.length ? hits[0].instanceId : null;
  }
  function counts() {
    return { racks: racks.length, servers: servers.size, leds: leds.count, tiers: tiers.map(t => t.mesh.count) };
  }
  // Per row, the share of its footprints holding a lit rack (at least one server, not dark): the network trays over a
  // row glow by it (scene_world.js), so the hall reads as the progress bar row by row. The buffer is reused per frame.
  const rowLitBuf = new Float32Array(16), rackLit = new Uint8Array(RACK_CAP);
  function rowLit() {
    rackLit.fill(0);
    for (const k of servers.keys()) rackLit[Math.floor(k / 8)] = 1;
    const R = Math.min(rowLitBuf.length, rows()), C = Math.max(1, stage.cols);
    const out = rowLitBuf.subarray(0, R);
    out.fill(0);
    for (let i = 0; i < racks.length; i++) { const r = rowOf(i); if (rackLit[i] && !racks[i].dark && r < R) out[r] += 1; }
    for (let r = 0; r < R; r++) out[r] /= C;
    return out;
  }
  function dispose() {
    scene.remove(group);
    frameGeom.dispose(); proxyGeom.dispose(); outlineGeom.dispose(); ledGeom.dispose(); ringGeom.dispose();
    for (const t of tiers) t.mesh.geometry.dispose();
    paintDark.dispose(); paintWhite.dispose(); ledMat.dispose();
  }

  return { setStage, setLedScale, clear, rebuild, addRack, addServer, removeServer, swapServer, setDark, setIncident, pulseTier, startSweep, clearSweep,
    update, rackPosition, pick, counts, rowLit, dispose, get racks() { return racks; }, get time() { return now; }, get ledWidth() { return ledW; } };
}
