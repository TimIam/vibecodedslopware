// scene_world.js — everything around the racks: the stage shell (floor, walls, props, glass, cage), the warm key
// light at the shell's key_light empty, the network trays above every rack row, infra units in their lanes, the
// "⚡×N" overflow badges, the skyline silhouettes added per Exit, the Civic that drives off at Rack 3, the efficiency
// upgrades' cues (containment panels, slower fans, thinner dashes, a cooler cooling lane), the procedural props for
// the mitigations and the staff desk (§16 gives them no mesh) and the hall-wide reads (hot-aisle tint, warm key
// light on a heatwave, tray colour/speed/alarm pulse with each row's strips scaled by its lit share, DDoS pulse, glow
// fixtures dimming with efficiency).
//
// Infra units live in BatchedMeshes (body / LED / glow / chain-link / fans): every unit type's baked geometry is
// added once, each owned unit is an instance, so twenty unit types in a Campus still cost a handful of draw calls.
// The fan parts are separate instances whose matrix is recomposed each frame (spin about the fan's local +Y,
// ASSETS.md).

import * as THREE from 'three';
import { bake, splitByClass, loadGLB, libraryObject, childByRole, badgeTexture, warnOnce } from './scene_assets.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TRAY_CAP = 512, TRAY_Y = 2.5, CONTAIN_CAP = 16;
const easeInQuad = p => p * p;
// Lane glyphs for the "×N" overflow badges, with the text-presentation selector so they stay monochrome glyphs.
const LANE_GLYPH = { power: '⚡︎', cooling: '❄︎', network: '⇅', yard: '▦' };
// Procedural props for the purchases §16 gives no mesh (albedo <= 0.6, flat colours like the library): the four
// mitigations stand in a lane like any unit, the staff desk (one lit monitor per hire) in the network lane, the only
// lane whose units face the camera and where a NOC belongs. They take lane spots in purchase order and count toward
// the lane's "×N" badge like a unit.
const MIT_LANE = { mit_ups: 'power', mit_dual_carrier: 'network', mit_scrubbing: 'network', mit_spares: 'cooling' };
const STAFF_MAX = 5, isStaffId = id => /^staff_[1-5]$/.test(id), staffId = n => `staff_${n}`;
const extraDef = id => (MIT_LANE[id] ? { lane: MIT_LANE[id] } : isStaffId(id) ? { lane: 'network' } : null);

export function createWorld({ data, lib, mats, scene, textures, assetsBase, camera = null }) {
  const { STAGES, INFRA, PALETTE, LANE_FIT } = data;
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  let stage = STAGES[0];
  let shellGroup = null;
  let empties = {};
  let civic = null, civicAnim = null;
  let satelliteLed = null;
  let rackCount = 0;
  let fitDist = 10;
  const eff = { containment: false, vsd: false, compression: false, economizer: false }; // §4 efficiency upgrades, each with a cue

  // ---- key light ---------------------------------------------------------------------------------------------------------
  const keyPoint = new THREE.PointLight(0xffffff, 0, 0, 2);
  const keyDir = new THREE.DirectionalLight(0xffffff, 0);
  keyDir.target.position.set(0, 0, 0);
  group.add(keyPoint, keyDir, keyDir.target);
  const keyBase = new THREE.Color(0xffffff); // the stage's key colour before the heatwave tint
  // The garage bulb is a PointLight (candela; irradiance = I / d²). Fluorescents, highbays, aisle strips and the moon
  // are distributed sources, so from the Colo on the key is a DirectionalLight from the key_light empty: a point
  // light a metre above white rack tops blows them out while the floor stays dark.
  const KEY_INTENSITY = { 1: 12, 2: 1.6, 3: 1.6, 4: 1.3, 5: 1.6 }; // fallback when a stage row has no keyIntensity
  // Garage fill: the faces the bulb cannot reach (the camera-left side panel, the rack interior) rendered rgb(0,0,0),
  // and the §15 hemisphere cannot help: at 0.6 it delivers ~1e-4 to a 0x343a46 steel face, and the intensity that
  // would (+24) tints the whole garage sky-blue. A weak bulb-coloured DirectionalLight from the camera side of the
  // default view (az -20°, scene.js) gives those faces a read while the bulb stays the only visible light source.
  const GARAGE_FILL = 1.2;

  // ---- trays -----------------------------------------------------------------------------------------------------------------
  // The tray's steel channel and its dashed strip are two InstancedMeshes over the same matrices: the strips carry a
  // per-instance colour that scales their emissive by the lit share of the row under them (rowLit, scene_racks.js), so
  // a row of outlines gets a quarter-bright strip and the ceiling reads as the progress bar too. three.js only
  // multiplies the diffuse by an instance colour; the hook below applies it to the emissive, and the channel stays on
  // the shared body material so the instance colour never darkens the steel.
  const trayLed = mats.led.clone();
  trayLed.name = 'tray_led';
  trayLed.emissiveMap = textures.dash;
  trayLed.emissive = new THREE.Color(PALETTE.trayCyan);
  trayLed.emissiveIntensity = 1;
  trayLed.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor;\n#endif');
  };
  trayLed.customProgramCacheKey = () => 'trayRowLit';
  const trayBake = bake(libraryObject(lib, 'net_tray_segment', data), mats);
  const trayParts = splitByClass(trayBake);
  trayBake.geometry.dispose();
  const trayStripGeom = trayParts.led || new THREE.BoxGeometry(0.96, 0.01, 0.16).translate(0, 0.02, 0); // the fallback box has no strip
  const trays = new THREE.InstancedMesh(trayStripGeom, trayLed, TRAY_CAP);
  trays.name = 'trays';
  trays.count = 0;
  trays.frustumCulled = false;
  trays.setColorAt(0, new THREE.Color(1, 1, 1));
  trays.instanceColor.setUsage(THREE.DynamicDrawUsage);
  group.add(trays);
  const trayBodies = trayParts.body ? new THREE.InstancedMesh(trayParts.body, mats.body, TRAY_CAP) : null;
  if (trayBodies) { trayBodies.name = 'tray_bodies'; trayBodies.count = 0; trayBodies.frustumCulled = false; group.add(trayBodies); }
  const cyan = new THREE.Color(PALETTE.trayCyan), gold = new THREE.Color(PALETTE.trayGold), red = new THREE.Color(PALETTE.trayRed), amber = new THREE.Color(PALETTE.meterAmber);
  let dashOffset = 0, traySegs = 1;
  const rowGlow = new Float32Array(16); // per row: 0.25 + 0.75 × lit share, as last written to the strips

  function layoutTrays() {
    const m = new THREE.Matrix4();
    // the strip widens with the fit distance so it stays 2-3 px at the Hall/Campus fits instead of blooming to a line
    const s = new THREE.Vector3(1, 1, THREE.MathUtils.clamp(fitDist / 12, 1, 3));
    let n = 0;
    const segs = Math.ceil(stage.cols * 0.8);
    const x0 = -(segs - 1) / 2;
    for (let r = 0; r < stage.rows; r++) {
      const z = stage.footprints[r * stage.cols]?.[1] ?? 0;
      for (let i = 0; i < segs && n < TRAY_CAP; i++) {
        m.makeTranslation(x0 + i, TRAY_Y, z).scale(s);
        trays.setMatrixAt(n, m);
        if (trayBodies) trayBodies.setMatrixAt(n, m);
        n++;
      }
    }
    traySegs = segs;
    trays.count = n;
    trays.instanceMatrix.needsUpdate = true;
    if (trayBodies) { trayBodies.count = n; trayBodies.instanceMatrix.needsUpdate = true; }
    rowGlow.fill(-1); // force a colour write on the next update
  }
  // env.rowLit (scene.js, from scene_racks.js rowLit()) → one emissive factor per row of strips; written only on change
  function updateTrayRows(rowLit) {
    let changed = false;
    for (let r = 0; r < stage.rows && r < rowGlow.length; r++) {
      const f = 0.25 + 0.75 * THREE.MathUtils.clamp(rowLit && r < rowLit.length ? rowLit[r] : 1, 0, 1);
      if (Math.abs(f - rowGlow[r]) > 1e-3) { rowGlow[r] = f; changed = true; }
    }
    if (!changed) return;
    for (let i = 0; i < trays.count; i++) trays.setColorAt(i, tmpC.setScalar(rowGlow[Math.min(rowGlow.length - 1, Math.floor(i / traySegs))]));
    trays.instanceColor.needsUpdate = true;
  }

  // ---- infra units -----------------------------------------------------------------------------------------------------------
  const infraById = Object.fromEntries(INFRA.map(i => [i.id, i]));
  // Status LEDs on infra units. build_assets.py gives the fiber cabinet a 0.03 × 0.15 m MAT_led bar (strength 4) that
  // net_core_router / net_ix_port / net_cable_landing scale to 0.375 m, so at strength 4 the network lane was a column
  // of white bloom blobs outshining every server LED; LED_REST keeps them lit and under the halo of a server LED, and
  // update() dims them with efficiency like the hall. The uplink's DDoS pulse (6 / 2) is unchanged.
  const LED_REST = 1.2;
  const uplinkLed = mats.led.clone(); uplinkLed.name = 'uplink_led'; uplinkLed.emissiveIntensity = LED_REST;
  const uplinkBase = uplinkLed.emissive.clone();
  const unitLed = mats.led.clone(); unitLed.name = 'unit_led'; unitLed.emissiveIntensity = LED_REST;
  const batches = {
    body: new THREE.BatchedMesh(512, 70000, 140000, mats.body),
    led: new THREE.BatchedMesh(512, 10000, 20000, unitLed),
    uplink: new THREE.BatchedMesh(64, 2000, 4000, uplinkLed),
    glow: new THREE.BatchedMesh(64, 2000, 4000, mats.glow), // lit screens on the procedural props: under the bloom threshold, dimmed like the fixtures
    chainlink: new THREE.BatchedMesh(64, 4000, 8000, mats.get('chainlink')),
    fan: new THREE.BatchedMesh(128, 8000, 16000, mats.body),
  };
  for (const [k, b] of Object.entries(batches)) { b.name = 'infra_' + k; b.frustumCulled = false; b.perObjectFrustumCulled = false; b.sortObjects = false; group.add(b); }
  const units = new Map(); // id → { geoms: {batchKey: geometryId}, fanGeom, fanLocal, width, height, inst: [{...ids, angle}], placements: [] }
  const laneLists = { power: [], cooling: [], network: [], yard: [] };
  const mounted = { rackSide: [], rackTop: [] };
  const badges = new Map(); // lane → Sprite
  const uplinkProxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  uplinkProxy.layers.set(1);
  uplinkProxy.name = 'uplink';
  group.add(uplinkProxy);
  let uplinkPlaced = false;
  const coolTint = new THREE.Color(0.72, 0.9, 1.15), whiteTint = new THREE.Color(1, 1, 1); // economizer: the cooling lane runs cooler

  // Containment panels (eff_containment): glass panels across both ends of every hot aisle. The Hall and Campus shells
  // already door their cold aisles in Blender, so the purchase closes the hot side.
  const containBake = bake(libraryObject(lib, 'containment_panel', data), mats);
  const containment = new THREE.InstancedMesh(containBake.geometry, containBake.materials, CONTAIN_CAP);
  containment.name = 'containment'; containment.count = 0; containment.frustumCulled = false; containment.renderOrder = 4;
  group.add(containment);

  // §15 'dripping window AC': the GLB bakes a static drop and a puddle into cool_window_ac, so the moving drop is a
  // scene instance per placed unit: it falls from the body's front lip (0.1, 0.26, 0.30 in the unit's frame; the
  // puddle is at z 0.42) to the floor on a DRIP_LOOP cycle, shrinking as it lands.
  const DRIP_CAP = 8, DRIP_FROM = new THREE.Vector3(0.1, 0.26, 0.3), DRIP_FALL = 0.24, DRIP_LOOP = 1.2, DRIP_FALL_S = 0.6;
  const coolant = new THREE.Color(0.06, 0.38, 0.6);
  const drips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.04, 0.025),
    new THREE.MeshStandardMaterial({ color: coolant, emissive: coolant, emissiveIntensity: 0.35, roughness: 0.3 }), DRIP_CAP);
  drips.name = 'drips'; drips.count = 0; drips.frustumCulled = false;
  group.add(drips);

  // ---- procedural props (mitigations, staff) ------------------------------------------------------------------------------
  // Prop parts are plain boxes; a material's name picks its shading class in the bake (scene_assets.js): 'body'
  // (vertex colour), 'led' (a status LED, batched with the unit LEDs) or 'glow' (a lit screen: under the bloom
  // threshold, so a desk of monitors is not a desk of bloom blobs).
  const propMats = new Map();
  function propMat(hex, kind = 'body') {
    const k = kind + hex;
    if (!propMats.has(k)) propMats.set(k, new THREE.MeshStandardMaterial({ name: kind === 'led' ? 'MAT_led' : kind === 'glow' ? 'MAT_glow' : 'MAT_prop', color: hex }));
    return propMats.get(k);
  }
  function propBox(g, w, h, d, x, y, z, hex, kind = 'body') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), propMat(hex, kind));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  // Origin at the bottom centre, front toward +Z, like every library unit (ASSETS.md).
  function extraProp(id) {
    const g = new THREE.Group();
    g.name = id;
    const steel = 0x1f232b, panel = 0x3a4049, dark = 0x14171d, conduit = 0x8a7a1f, band = 0x6a1d1d, handle = 0x8c8c8c, label = 0x5a4632;
    if (id === 'mit_ups') {                 // "A very heavy battery with a very small screen."
      propBox(g, 0.6, 1.4, 0.6, 0, 0.7, 0, steel);
      propBox(g, 0.5, 1.2, 0.02, 0, 0.7, 0.3, panel);
      propBox(g, 0.14, 0.08, 0.01, 0.1, 1.2, 0.315, 0x000000, 'glow');
      propBox(g, 0.03, 0.03, 0.01, -0.1, 1.2, 0.315, 0x000000, 'led');
      propBox(g, 0.2, 0.02, 0.01, -0.08, 0.35, 0.315, 0x000000, 'led');
    } else if (id === 'mit_dual_carrier') { // the second drop: a slim cabinet and its own conduit up to the trays
      propBox(g, 0.34, 1.5, 0.26, 0, 0.75, 0, steel);
      propBox(g, 0.26, 1.3, 0.02, 0, 0.75, 0.13, panel);
      propBox(g, 0.07, 1.0, 0.07, 0.1, 2.0, -0.05, conduit);
      propBox(g, 0.12, 0.03, 0.01, 0, 1.35, 0.145, 0x000000, 'led');
    } else if (id === 'mit_scrubbing') {    // "Someone else's computers absorb the angry packets."
      propBox(g, 0.5, 1.2, 0.5, 0, 0.6, 0, steel);
      propBox(g, 0.52, 0.12, 0.52, 0, 1.0, 0, band);
      propBox(g, 0.2, 0.02, 0.01, 0, 0.8, 0.255, 0x000000, 'led');
    } else if (id === 'mit_spares') {       // "One of everything. Two of nothing you need."
      propBox(g, 0.9, 2.0, 0.5, 0, 1.0, 0, panel);
      propBox(g, 0.02, 1.8, 0.02, 0, 1.0, 0.25, dark);
      for (const sx of [-0.06, 0.06]) propBox(g, 0.03, 0.2, 0.03, sx, 1.0, 0.26, handle);
      propBox(g, 0.4, 0.1, 0.01, 0, 1.78, 0.255, label);
    } else if (isStaffId(id)) {             // a NOC desk: one lit monitor per hire, a chair in front
      const n = Number(id.slice(6));
      propBox(g, 0.85, 0.04, 0.5, 0, 0.72, 0, label);
      for (const sx of [-0.38, 0.38]) propBox(g, 0.04, 0.7, 0.4, sx, 0.35, 0, dark);
      const slots = [[0, 0.95], [-0.28, 0.95], [0.28, 0.95], [-0.14, 1.22], [0.14, 1.22]];
      for (let i = 0; i < Math.min(n, slots.length); i++) {
        const [sx, sy] = slots[i];
        propBox(g, 0.26, 0.17, 0.02, sx, sy, -0.1, dark);
        propBox(g, 0.23, 0.14, 0.01, sx, sy, -0.085, 0x000000, 'glow');
        propBox(g, 0.03, 0.2, 0.03, sx, sy - 0.17, -0.12, dark);
      }
      propBox(g, 0.42, 0.04, 0.42, 0, 0.45, 0.5, steel);
      propBox(g, 0.42, 0.42, 0.04, 0, 0.68, 0.7, steel);
      propBox(g, 0.05, 0.43, 0.05, 0, 0.215, 0.5, dark);
    }
    g.updateMatrixWorld(true);
    return g;
  }

  function unitFor(id) {
    if (units.has(id)) return units.get(id);
    const extra = extraDef(id);
    const obj = extra ? extraProp(id) : libraryObject(lib, id, data);
    const fanNode = childByRole(obj, 'fan_0');
    const b = bake(obj, mats, { skip: n => n === fanNode });
    if (extra) obj.traverse(n => n.geometry?.dispose());
    const parts = splitByClass(b);
    const geoms = {};
    try {
      if (parts.body) geoms.body = batches.body.addGeometry(parts.body);
      if (parts.led) geoms[id === 'net_fiber_uplink' ? 'uplink' : 'led'] = batches[id === 'net_fiber_uplink' ? 'uplink' : 'led'].addGeometry(parts.led);
      if (parts.glow) geoms.glow = batches.glow.addGeometry(parts.glow);
      if (parts.chainlink) geoms.chainlink = batches.chainlink.addGeometry(parts.chainlink);
    } catch (e) { warnOnce('batch:' + id, `could not batch ${id}`, e); }
    let fanGeom = null, fanLocal = null;
    if (fanNode) {
      const fb = bake(fanNode, mats, { relativeTo: 'self' });
      try { fanGeom = batches.fan.addGeometry(fb.geometry); } catch (e) { warnOnce('batch:fan:' + id, `could not batch ${id}'s fan`, e); }
      fanLocal = obj.matrix.clone().multiply(fanNode.matrix);
    }
    const u = { id, geoms, fanGeom, fanLocal, width: b.size.x, height: b.size.y, inst: [], placements: [], lane: infraById[id]?.lane ?? extra?.lane ?? null };
    units.set(id, u);
    return u;
  }

  function ensureInstances(u, n) {
    while (u.inst.length < n) {
      const ids = { angle: Math.random() * 6.28 };
      for (const [k, gid] of Object.entries(u.geoms)) ids[k] = batches[k].addInstance(gid);
      if (u.fanGeom !== null) ids.fan = batches.fan.addInstance(u.fanGeom);
      u.inst.push(ids);
    }
  }

  function resetInfraLists() {
    for (const k in laneLists) laneLists[k].length = 0;
    mounted.rackSide.length = 0; mounted.rackTop.length = 0;
  }

  function pushInfra(id) {
    const def = infraById[id] || extraDef(id);
    if (!def) return false;
    if (def.mount === 'rackSide') mounted.rackSide.push(id);
    else if (def.mount === 'rackTop') mounted.rackTop.push(id);
    else (laneLists[def.lane] || laneLists.cooling).push(id);
    return true;
  }
  function countInfra(id) {
    let n = 0;
    for (const list of [...Object.values(laneLists), mounted.rackSide, mounted.rackTop]) for (const x of list) if (x === id) n++;
    return n;
  }

  const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function placeAt(u, x, y, z, rotY, scale) {
    tmpQ.setFromAxisAngle(Y_AXIS, rotY);
    const m = new THREE.Matrix4().compose(tmpV.set(x, y, z), tmpQ, tmpS.set(scale, scale, scale));
    u.placements.push(m);
    return m;
  }

  function layoutInfra() {
    for (const u of units.values()) u.placements.length = 0;
    for (const s of badges.values()) s.visible = false;
    uplinkPlaced = false;
    let uplinkM = null, newestNetM = null;

    for (const lane of Object.keys(laneLists)) {
      const list = laneLists[lane];
      const spots = stage.lanes?.[lane] || [];
      const maxV = Math.min(stage.maxVisible, spots.length);
      if (!maxV) continue;
      const pitch = stage.lanePitch?.[lane] ?? 2;
      list.forEach((id, i) => {
        const collapsed = list.length > maxV && i >= maxV - 1 && i !== list.length - 1;
        if (collapsed) return;
        const spot = spots[Math.min(i, maxV - 1)];
        const u = unitFor(id);
        const scale = Math.min(1, (pitch * LANE_FIT) / Math.max(0.05, u.width));
        const m = placeAt(u, spot[0], 0, spot[1], spot[2], scale);
        if (lane === 'network' && infraById[id]) newestNetM = { m, u }; // never the desk or a mitigation prop
        if (id === 'net_fiber_uplink') uplinkM = { m, u };
      });
      if (list.length > maxV) {
        const spot = spots[maxV - 1];
        const u = unitFor(list[list.length - 1]);
        badge(lane, `${LANE_GLYPH[lane] ?? ''}×${list.length - maxV + 1}`, spot[0], u.height, spot[1]);
      }
    }
    // rack-mounted gear: PDU k on the right flank of rack k, switch k on top of rack k (the newest rack if k is ahead)
    const fps = stage.footprints;
    const rackOf = k => fps[Math.min(k, Math.max(0, rackCount - 1))];
    mounted.rackSide.forEach((id, k) => {
      const fp = rackOf(k); if (!fp) return;
      const u = unitFor(id);
      const extra = k >= rackCount ? (k - rackCount + 1) * 0.08 : 0;
      tmpQ.setFromAxisAngle(Y_AXIS, fp[2]);
      tmpV.set(0.34 + extra, 0.05, 0.3).applyQuaternion(tmpQ);
      placeAt(u, fp[0] + tmpV.x, tmpV.y, fp[1] + tmpV.z, fp[2], 1);
    });
    mounted.rackTop.forEach((id, k) => {
      const fp = rackOf(k); if (!fp) return;
      const u = unitFor(id);
      const stack = k >= rackCount ? (k - rackCount + 1) * 0.05 : 0;
      tmpQ.setFromAxisAngle(Y_AXIS, fp[2]);
      tmpV.set(0, 2.0 + stack, 0.25).applyQuaternion(tmpQ);
      const m = placeAt(u, fp[0] + tmpV.x, tmpV.y, fp[1] + tmpV.z, fp[2], 1);
      if (!newestNetM && !uplinkM) newestNetM = { m, u };
    });
    // Campus cooling towers as props at the shell's tower_i empties
    if (stage.stage === 5) {
      const u = unitFor('cool_tower');
      for (let i = 0; i < 3; i++) { const e = empties[`tower_${i}`]; if (e) placeAt(u, e.x, e.y, e.z, 0, 1); }
    }
    for (const u of units.values()) {
      ensureInstances(u, u.placements.length);
      u.inst.forEach((ids, i) => {
        const on = i < u.placements.length;
        for (const k of Object.keys(u.geoms)) { batches[k].setVisibleAt(ids[k], on); if (on) batches[k].setMatrixAt(ids[k], u.placements[i]); }
        if (ids.fan !== undefined) batches.fan.setVisibleAt(ids.fan, on);
        if (on && u.lane === 'cooling' && infraById[u.id] && ids.body !== undefined) batches.body.setColorAt(ids.body, eff.economizer ? coolTint : whiteTint);
      });
    }
    // the DDoS hand-scrub target: the newest uplink, else the newest network unit (data.js EVENTS ev_ddos)
    const target = uplinkM || newestNetM;
    if (target) {
      target.m.decompose(uplinkProxy.position, uplinkProxy.quaternion, uplinkProxy.scale);
      uplinkProxy.scale.multiply(tmpV.set(Math.max(0.6, target.u.width), target.u.height, Math.max(0.6, target.u.width)));
      uplinkProxy.position.y += target.u.height / 2;
      uplinkPlaced = true;
    }
  }

  // A count chip sitting on the newest unit of a lane past maxVisible: 1.2 × 0.54 m at the garage fit, growing a little
  // with distance (never the 4 m chips that floated over the Campus racks).
  function badge(lane, text, x, y, z) {
    let s = badges.get(lane);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.renderOrder = 10;
      group.add(s);
      badges.set(lane, s);
    }
    s.material.map = badgeTexture(text);
    s.material.needsUpdate = true;
    const k = THREE.MathUtils.clamp(fitDist / 40, 0.5, 1.3);
    s.scale.set(1.2 * k, 0.54 * k, 1);
    s.position.set(x, y + 0.15, z);
    s.visible = true;
  }

  function layoutContainment() {
    let n = 0;
    if (eff.containment) {
      const xEnd = (stage.cols - 1) / 2 * 0.8 + 0.3 + 0.35; // just past the row's last rack
      tmpQ.setFromAxisAngle(Y_AXIS, Math.PI / 2);          // the 1.2 m panel spans the aisle gap (rows are 2.4 m apart, racks 1.2 m deep)
      for (const a of stage.aisles || []) {
        if (a.kind !== 'hot') continue;
        for (const side of [-1, 1]) {
          if (n >= CONTAIN_CAP) break;
          containment.setMatrixAt(n++, tmpM.compose(tmpV.set(side * xEnd, 0, a.z), tmpQ, tmpS.set(1, 1, 1)));
        }
      }
    }
    containment.count = n;
    containment.instanceMatrix.needsUpdate = true;
  }

  function setEff(list) {
    for (const k of Object.keys(eff)) eff[k] = false;
    for (const id of list || []) if (typeof id === 'string' && id.startsWith('eff_') && id.slice(4) in eff) eff[id.slice(4)] = true;
    applyEff();
  }
  function applyEff() {
    layoutContainment();
    const map = eff.compression ? textures.dashThin : textures.dash;
    if (trayLed.emissiveMap !== map) { trayLed.emissiveMap = map; trayLed.needsUpdate = true; }
  }

  // Full rebuild from a run: units in INFRA order, then the mitigations owned and the staff desk.
  function setInfra(counts, { racks, eff: effList, mitigations, staff } = {}) {
    if (racks !== undefined) rackCount = racks;
    if (effList !== undefined) setEff(effList);
    resetInfraLists();
    for (const def of INFRA) { const n = Math.max(0, Math.floor(counts?.[def.id] || 0)); for (let i = 0; i < n; i++) pushInfra(def.id); }
    for (const id of mitigations || []) if (MIT_LANE[id] && !countInfra(id)) pushInfra(id);
    const n = THREE.MathUtils.clamp(Math.floor(staff || 0), 0, STAFF_MAX);
    if (n > 0) pushInfra(staffId(n));
    layoutInfra();
  }
  function addInfra(id, count) {
    if (typeof id === 'string' && id.startsWith('eff_')) {
      if (id.slice(4) in eff) { eff[id.slice(4)] = true; applyEff(); layoutInfra(); }
      return;
    }
    if (MIT_LANE[id]) { if (!countInfra(id)) { pushInfra(id); layoutInfra(); } return; } // one prop per mitigation
    if (!infraById[id]) return; // staff and other non-unit ids: see setExtras
    const have = countInfra(id);
    const target = Math.max(have, Math.floor(count || have + 1));
    for (let i = have; i < target; i++) pushInfra(id);
    layoutInfra();
  }
  // The sim emits nothing for a hire (§14.4), so scene.js reads run.staff / run.mitigations and calls this when they
  // change: the desk swaps to the one with n monitors in place, a mitigation missing from the lanes is appended.
  function setExtras({ mitigations, staff } = {}) {
    let changed = false;
    for (const id of mitigations || []) if (MIT_LANE[id] && !countInfra(id)) { pushInfra(id); changed = true; }
    const n = THREE.MathUtils.clamp(Math.floor(staff || 0), 0, STAFF_MAX), want = n > 0 ? staffId(n) : null;
    const list = laneLists.network, i = list.findIndex(isStaffId);
    if (i >= 0 && list[i] !== want) { if (want) list[i] = want; else list.splice(i, 1); changed = true; }
    else if (i < 0 && want) { pushInfra(want); changed = true; }
    if (changed) layoutInfra();
  }
  function setRackCount(n) { rackCount = n; layoutInfra(); }

  // ---- skyline -----------------------------------------------------------------------------------------------------------------
  // §15 'a glowing campus silhouette' per Exit: the window strips are warm (distant lit windows, not the LED white)
  // and stay under the 0.9 bloom threshold everywhere (SKY_LED per stage, applied in layoutSkyline): at 1.4 the
  // Hall/Campus strips clipped to flat white boxes with a halo floating over the yard, and the garage's pair stands
  // 13 m from the camera, where even that bloomed into fat bars across the trays. Thin amber lines behind the yard
  // still read as a campus at night.
  const SKY_LED = [0, 0.75, 0.75, 0.5, 0.5, 0.5];
  const skyLed = mats.led.clone(); skyLed.name = 'skyline_led'; skyLed.emissiveIntensity = SKY_LED[1];
  skyLed.emissive.set(0xffd9a8);
  const skyBake = bake(libraryObject(lib, 'skyline_campus', data), mats, { materialFor: cls => (cls === 'led' ? skyLed : null) });
  const skyline = new THREE.InstancedMesh(skyBake.geometry, skyBake.materials, data.EXIT.skylineMax);
  skyline.name = 'skyline'; skyline.count = 0; skyline.frustumCulled = false;
  group.add(skyline);
  let skyCount = 0;
  const skyBadge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  skyBadge.visible = false;
  group.add(skyBadge);

  // The silhouettes stand where the frame actually looks through the back opening: at the default pitches (63° in
  // the garage, 48° from the Warehouse on) the frame's top edge is 11-26° below the horizon, so a far skyline is never
  // in view and the blocks stand just behind the yard instead. Garage: 27 m blocks at 0.12 are 3.2 m wide and fill
  // the lower half of the 4.6 m door; while the Civic is parked in the driveway the pair stands either side of it
  // (half-hidden by the jambs) instead of poking through its hood. Warehouse/Hall/Campus: a cluster SKY_GAP behind the
  // yard lane, centred where the door or glass looks from the default azimuth, scaled so the roofline sits under both
  // the frame top (SKY_NDC_TOP) and the opening's lintel, the sight line the 48° pitch makes the real limit (solved
  // against the live camera; capped per stage so a block never dwarfs the hall, the Campus cap at 1.0 so the tower
  // tops out above the SMR domes when the player tilts up to the horizon).
  const SKY_SCALE = [0, 0.12, 0, 0.5, 0.6, 1.0], SKY_H = 10.4, SKY_W = 27, SKY_D = 13, SKY_GAP = [0, 0, 0, 1.5, 2.0, 2.0], SKY_XC = 1.5, SKY_NDC_TOP = 0.95;
  // the back opening the skyline shows through, as its lintel height: the Warehouse's 4.5 m loading door, the Hall's
  // and the Campus's glass end walls under their 0.4 m head (build_assets.py STAGE_GEO / glass_back_wall)
  const OPENING_H = { 3: 4.5, 4: 5.6, 5: 7.6 };
  function roomAt(x, z) {
    if (!camera) return null;
    camera.updateMatrixWorld();
    let lo = 0, hi = 80;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; tmpV.set(x, mid, z).project(camera); if (tmpV.y < SKY_NDC_TOP) lo = mid; else hi = mid; }
    return lo;
  }
  // the tallest thing standing at z behind the back wall that the camera still sees under the lintel: the sight line
  // from the camera through the lintel, continued to z (null when the stage has no lintel rule or no camera)
  function sightHeightAt(z) {
    const H = OPENING_H[stage.stage];
    if (!camera || H === undefined) return null;
    const c = camera.position, zo = -(stage.size.d / 2 + 0.1);
    const k = (z - c.z) / (zo - c.z);
    return k > 0 ? c.y + (H - c.y) * k : null;
  }
  function layoutSkyline() {
    const max = data.EXIT.skylineMax;
    const n = Math.min(skyCount, max);
    const st = stage.stage;
    const show = st !== 2; // the Colo has a window strip only (§15)
    const yardZ = stage.lanes?.yard?.[0]?.[1] ?? -stage.size.d;
    const backZ = stage.lanes?.cooling?.[0]?.[1] ?? -stage.size.d / 2;
    const civicIn = st === 1 && !!civic && civic.visible;
    let z0, sc;
    if (st === 1) { z0 = backZ - 2.2; sc = civicIn ? 0.08 : SKY_SCALE[1]; }
    else {
      const cap = SKY_SCALE[st] ?? 0.5, gap = SKY_GAP[st] ?? 3;
      sc = cap;
      z0 = yardZ - gap - SKY_D / 2 * sc;
      for (let pass = 0; pass < 3; pass++) { // the room depends on z0, z0 on the scale: a few passes settle it
        let h = SKY_H * cap;
        const room = roomAt(SKY_XC, z0), sight = sightHeightAt(z0);
        if (room !== null && room > 0.5) h = Math.min(h, room);
        if (sight !== null) h = Math.min(h, sight * 0.9);
        sc = THREE.MathUtils.clamp(h / SKY_H, 0.08, cap);
        z0 = yardZ - gap - SKY_D / 2 * sc;
      }
    }
    skyLed.emissiveIntensity = SKY_LED[st] ?? 1.4;
    const m = new THREE.Matrix4(), s = new THREE.Vector3(sc, sc, sc);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1, k = Math.floor(i / 2);
      let x, z;
      if (st === 1) { x = civicIn ? side * 2.1 : side * (1.6 - 0.4 * k); z = z0 - 0.5 * k - (civicIn ? 0.3 : 0); }
      else { x = SKY_XC + side * (0.3 + 0.12 * k) * SKY_W * sc; z = z0 - k * (0.4 * SKY_D * sc + 1); }
      m.makeTranslation(x, 0, z).scale(s);
      skyline.setMatrixAt(i, m);
    }
    skyline.count = show ? n : 0;
    skyline.instanceMatrix.needsUpdate = true;
    if (show && skyCount > max) {
      skyBadge.material.map = badgeTexture(`+${skyCount - max}`);
      skyBadge.material.needsUpdate = true;
      const k = st === 1 ? 0.25 : sc;
      skyBadge.scale.set(9 * k, 4 * k, 1);
      skyBadge.position.set(st === 1 ? 0 : SKY_XC, (st === 1 ? 1.6 : 13) * k, z0 + (st === 1 ? -1.2 : 6 * sc));
      skyBadge.visible = true;
    } else skyBadge.visible = false;
  }
  function setSkyline(n) { skyCount = Math.max(0, Math.floor(n || 0)); layoutSkyline(); }

  // ---- shells ------------------------------------------------------------------------------------------------------------------
  const shellCache = new Map();
  function loadShell(n) {
    if (!shellCache.has(n)) shellCache.set(n, loadGLB(`${assetsBase}stage_${n}.glb`));
    return shellCache.get(n);
  }

  function isEmpty(node) { let has = false; node.traverse(c => { if (c.isMesh) has = true; }); return !has; }

  const civicLed = mats.led.clone(); civicLed.name = 'civic_led'; civicLed.emissiveIntensity = 0.6;
  // shell prop LEDs (bulb, beacons, vending, the Campus hall-shell window strips): lit, but not strength-4 bloom blobs
  const shellLed = mats.led.clone(); shellLed.name = 'shell_led'; shellLed.emissiveIntensity = 0.85;

  // Every shell object owns its baked geometry; only objects flagged ownMat (the grid, the fallback floor/wall) own
  // their material too, the rest share the material set.
  function disposeShell(g) {
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.userData.ownMat) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m?.dispose?.();
    });
  }

  function buildShell(gltfScene) {
    if (shellGroup) { group.remove(shellGroup); disposeShell(shellGroup); }
    shellGroup = new THREE.Group();
    shellGroup.name = 'shell';
    empties = {};
    civic = null; civicAnim = null; satelliteLed = null;
    const kids = [...gltfScene.children];
    if (!kids.length) {
      warnOnce('shell:' + stage.id, `shell for ${stage.id} is empty; using a fallback floor and back wall`);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(stage.size.w, 0.05, stage.size.d), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.floor), roughness: 0.9 }));
      floor.position.y = -0.025;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(stage.size.w + 0.4, 3, 0.2), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.concrete), roughness: 0.9 }));
      wall.position.set(0, 1.5, -stage.size.d / 2 - 0.1);
      floor.userData.ownMat = wall.userData.ownMat = true;
      shellGroup.add(floor, wall);
    }
    for (const node of kids) {
      if (isEmpty(node)) { empties[node.name] = node.position.clone(); continue; }
      let materialFor = cls => (cls === 'led' ? shellLed : null);
      if (node.name === 'prop_satellite') { satelliteLed = mats.led.clone(); satelliteLed.name = 'satellite_led'; materialFor = cls => (cls === 'led' ? satelliteLed : null); }
      if (node.name === 'prop_civic') materialFor = cls => (cls === 'led' ? civicLed : null);
      const b = bake(node, mats, { relativeTo: 'self', materialFor });
      const mesh = new THREE.Mesh(b.geometry, b.materials);
      mesh.name = node.name;
      mesh.position.copy(node.position); mesh.quaternion.copy(node.quaternion); mesh.scale.copy(node.scale);
      if (node.name === 'glass' || node.name === 'cage') mesh.renderOrder = 5;
      shellGroup.add(mesh);
      if (node.name === 'prop_civic') civic = mesh;
    }
    // faint 1 m grid on the hall floor (§15 palette)
    const span = Math.max(stage.size.w, stage.size.d) + 4;
    const grid = new THREE.GridHelper(span, span, 0x1a2029, 0x1a2029);
    grid.position.y = 0.006;
    grid.material.transparent = true; grid.material.opacity = 0.35;
    grid.userData.ownMat = true;
    shellGroup.add(grid);
    group.add(shellGroup);

    // key light at the shell's key_light empty
    const kp = empties.key_light || new THREE.Vector3(0, 3, 0);
    keyBase.set(stage.keyColor ?? 0xffffff);
    if (stage.stage === 1) {
      keyPoint.color.copy(keyBase); keyPoint.position.copy(kp); keyPoint.userData.base = stage.keyIntensity ?? KEY_INTENSITY[1];
      keyDir.color.copy(keyBase); keyDir.userData.base = GARAGE_FILL;
      keyDir.position.set(kp.x - 6, 1.5, kp.z + 3); // low and side-on toward the origin: -x sides and fronts, little on tops and floor
    } else {
      keyPoint.intensity = 0; keyPoint.userData.base = 0;
      keyDir.color.copy(keyBase); keyDir.userData.base = stage.keyIntensity ?? KEY_INTENSITY[stage.stage] ?? 1;
      // tilted toward the camera side so rack fronts catch some of it, not only the tops
      keyDir.position.set(kp.x + 2.5, Math.max(kp.y, 4), kp.z + (stage.stage === 5 ? 0 : 5));
    }
  }

  // Switch to a stage: resolves when the shell is in place (and the next stage's shell starts preloading).
  async function setStage(stageDef, { civicPresent = true, fit = 10 } = {}) {
    stage = stageDef;
    fitDist = fit;
    const g = await loadShell(stage.stage);
    buildShell(g);
    if (civic) civic.visible = stage.stage === 1 && civicPresent;
    layoutTrays();
    layoutInfra();
    layoutContainment();
    layoutSkyline();
    if (stage.stage < STAGES.length) loadShell(stage.stage + 1);
    return stage;
  }

  // ---- civic ---------------------------------------------------------------------------------------------------------------------
  function driveOffCivic() {
    if (!civic || !civic.visible || civicAnim) return false;
    civicAnim = { t: 0, z0: civic.position.z };
    return true;
  }
  function setCivic(present) { if (civic) { civic.visible = !!present; if (!present) civicAnim = null; layoutSkyline(); } }
  function civicPosition(out = new THREE.Vector3()) { return civic && civic.visible ? out.copy(civic.position) : null; }

  // ---- per-frame ----------------------------------------------------------------------------------------------------------------
  const hotBase = new THREE.Color(0.1, 0.085, 0.08), hotAisle = new THREE.Color(PALETTE.hotAisle), tmpC = new THREE.Color();
  const warmCol = new THREE.Color(0xff7a2a);
  const redTint = new THREE.Color(3, 0.2, 0.2);
  let t = 0, uplinkTinted = false;
  // env: { power, cooling, network: u's; efficiency; blackout; viral; ddos; heatwave; warm (0-1, scene.js) }
  function update(dt, env) {
    t += dt;
    const eff_ = env.blackout ? 0 : THREE.MathUtils.clamp(env.efficiency ?? 1, 0, 1);
    const coolU = Math.max(0, env.cooling ?? 0), netU = Math.max(0, env.network ?? 0);
    const warm = THREE.MathUtils.clamp(env.warm ?? 0, 0, 1);
    // hall brightness = efficiency (§2: one number with the 'dimmed to N%' line); squared because after ACES a linear
    // 0.6 only read a quarter darker: 0.6 → 0.42, 0.87 → 0.78. The key light warms with the hall on a heatwave /
    // cooling overdraw. scene.js dims the hemisphere light on the same curve; the LED gain keeps its own.
    const bright = 0.1 + 0.9 * eff_ * eff_;
    keyPoint.intensity = (keyPoint.userData.base || 0) * bright;
    keyDir.intensity = (keyDir.userData.base || 0) * bright;
    tmpC.copy(keyBase).lerp(warmCol, warm * 0.5);
    keyPoint.color.copy(tmpC); keyDir.color.copy(tmpC); // in the garage keyDir is the fill, so it warms with the bulb
    mats.glow.emissiveIntensity = env.blackout ? 0 : 0.2 + 0.5 * eff_; // fixtures read lit, not as white cut-outs
    const fixK = env.blackout ? 0 : 0.3 + 0.7 * eff_;
    mats.glowBlue.emissiveIntensity = (mats.glowBlue.userData.baseEmissive ?? 0.7) * fixK; // the vending window and sign
    mats.glowRed.emissiveIntensity = (mats.glowRed.userData.baseEmissive ?? 0.7) * fixK;
    unitLed.emissiveIntensity = LED_REST * fixK;
    // cooling: hot tiles are neutral in the green zone (§2 u < 0.8), warm through amber and only glow past 1.0
    const k = THREE.MathUtils.clamp((coolU - 0.8) / 0.3, 0, 1);
    mats.hot.color.lerpColors(hotBase, hotAisle, k * 0.55);
    mats.hot.emissive.copy(hotAisle).multiplyScalar(0.2 * THREE.MathUtils.clamp((coolU - 1) / 0.35, 0, 1) + (env.heatwave ? 0.35 : 0));
    // network: tray dashes scroll with u and follow the §2 meter thresholds exactly: cyan in the green zone, toward
    // amber through 0.8-1.0, red past 1.0 (fully red by 1.05, so '1.1 / 1.0 Gbps' pulses red, not pink); gold while a
    // viral customer is on. The strip dims with distance so colour survives the bloom at 2-3 px, and the base is kept
    // low enough that the dashes stay cyan (at 0.8 + 0.6u they clipped white and outshone every LED); each row's
    // strips are scaled again by the lit share of the row (updateTrayRows).
    const over = THREE.MathUtils.clamp((netU - 1.0) / 0.05, 0, 1);
    if (env.viral) tmpC.copy(gold); else tmpC.copy(cyan).lerp(amber, THREE.MathUtils.clamp((netU - 0.8) / 0.2, 0, 1));
    tmpC.lerp(red, over);
    trayLed.emissive.copy(tmpC);
    const far = THREE.MathUtils.clamp(14 / fitDist, 0.5, 1);
    const alarm = over > 0 ? 0.75 + 0.25 * Math.sin(t * 8) : 1;
    trayLed.emissiveIntensity = env.blackout ? 0 : (0.45 + 0.35 * Math.min(1.4, netU)) * far * alarm;
    updateTrayRows(env.rowLit);
    dashOffset = (dashOffset - dt * (0.25 + 1.6 * netU)) % 1; // wrapped: a float32 uvTransform stutters past ~1e5
    textures.dash.offset.x = dashOffset; textures.dashThin.offset.x = dashOffset;
    // fans spin with cooling u (variable-speed drives idle slower); the garage box fan also oscillates on its base
    const fanSpeed = (0.8 + 11 * Math.min(1.6, coolU)) * (eff.vsd ? 0.55 : 1);
    for (const u of units.values()) {
      const osc = u.id === 'cool_box_fan';
      if (u.fanGeom === null && !osc) continue;
      for (let i = 0; i < u.placements.length; i++) {
        const ids = u.inst[i];
        let base = u.placements[i];
        if (osc) {
          tmpM2.makeRotationY(0.5 * Math.sin(0.6 * t + i * 1.3)).premultiply(u.placements[i]);
          base = tmpM2;
          for (const key of Object.keys(u.geoms)) batches[key].setMatrixAt(ids[key], base);
        }
        if (u.fanGeom === null) continue;
        ids.angle += fanSpeed * dt;
        tmpM.makeRotationY(ids.angle).premultiply(u.fanLocal).premultiply(base);
        batches.fan.setMatrixAt(ids.fan, tmpM);
      }
    }
    // the window AC's drop: falls (easeInQuad) from the lip to the puddle, shrinks as it lands, then a gap before the next
    const ac = units.get('cool_window_ac');
    let nd = 0;
    if (ac) {
      for (let i = 0; i < ac.placements.length && nd < DRIP_CAP; i++) {
        const p = ((t + i * 0.41) % DRIP_LOOP) / DRIP_FALL_S;
        if (p > 1) continue;
        const sh = p > 0.8 ? 1 - 0.8 * (p - 0.8) / 0.2 : 1;
        tmpM.makeTranslation(DRIP_FROM.x, DRIP_FROM.y - DRIP_FALL * easeInQuad(p), DRIP_FROM.z).scale(tmpS.set(sh, sh, sh)).premultiply(ac.placements[i]);
        drips.setMatrixAt(nd++, tmpM);
      }
    }
    if (nd || drips.count) { drips.count = nd; drips.instanceMatrix.needsUpdate = true; }
    // DDoS: the uplink pulses red at 2 Hz (its LED strip, and a red tint on the whole cabinet so it reads from any side)
    const ddosOn = !!env.ddos && Math.floor(t * 4) % 2 === 0;
    if (env.ddos) { uplinkLed.emissive.copy(ddosOn ? red : uplinkBase); uplinkLed.emissiveIntensity = ddosOn ? 6 : 2; }
    else { uplinkLed.emissive.copy(uplinkBase); uplinkLed.emissiveIntensity = LED_REST * fixK; }
    if (ddosOn !== uplinkTinted) {
      uplinkTinted = ddosOn;
      const up = units.get('net_fiber_uplink');
      if (up && up.geoms.body !== undefined) for (let i = 0; i < up.placements.length; i++) batches.body.setColorAt(up.inst[i].body, ddosOn ? redTint : whiteTint);
    }
    if (satelliteLed) satelliteLed.emissiveIntensity = Math.floor(t * 1.5) % 2 === 0 ? 4 : 0.4;
    if (civicAnim && civic) {
      civicAnim.t += dt;
      const p = Math.min(1, civicAnim.t / 2.6);
      civic.position.z = civicAnim.z0 - 18 * easeInQuad(p);
      if (p >= 1) { civic.visible = false; civicAnim = null; layoutSkyline(); }
    }
  }

  function pickUplink(raycaster) { return uplinkPlaced && raycaster.intersectObject(uplinkProxy, false).length > 0; }

  function dispose() {
    scene.remove(group);
    trayStripGeom.dispose(); trayParts.body?.dispose(); skyBake.geometry.dispose(); containBake.geometry.dispose();
    for (const b of Object.values(batches)) b.dispose();
    drips.geometry.dispose(); drips.material.dispose();
    if (shellGroup) disposeShell(shellGroup);
    trayLed.dispose(); uplinkLed.dispose(); unitLed.dispose(); skyLed.dispose(); civicLed.dispose(); shellLed.dispose();
    for (const m of propMats.values()) m.dispose();
  }

  return { setStage, loadShell, setInfra, addInfra, setExtras, setRackCount, setSkyline, layoutSkyline, driveOffCivic, setCivic, civicPosition, update, pickUplink, dispose,
    get empties() { return empties; }, get stage() { return stage; }, get keyLight() { return stage.stage === 1 ? keyPoint : keyDir; },
    get eff() { return { ...eff }; },
    unitCount() { let n = 0; for (const u of units.values()) n += u.placements.length; return n; } };
}
