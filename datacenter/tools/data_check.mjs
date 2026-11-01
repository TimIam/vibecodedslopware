#!/usr/bin/env node
// Consistency checks for datacenter/data.js and datacenter/util.js against DESIGN.md.
//   node datacenter/tools/data_check.mjs
// Exits 1 with a list of failures if anything is off; prints a short summary otherwise.
// Besides the §3-§18 tables it pins the review findings that were fixed (front-row facing, ticker stage ranges, lane
// pitch, contract stresses, milestone tickers, single-source constants, util edge cases) so they cannot regress.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as D from '../data.js';
import * as U from '../util.js';

const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const eq = (a, b, msg) => ok(Object.is(a, b) || a === b, `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const inRange = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
const assetPath = f => fileURLToPath(new URL(`../assets/${f}`, import.meta.url));

// §16 object names, copied from the design doc (independent of data.js's own ASSETS list). §16 writes "floor_tile (solid
// and perforated)" and "wall_segment (plain, door, glass)": one exported object per variant, so the variants are the names.
const LIBRARY_16 = [
  'rack_frame', 'srv_pizza_box', 'srv_blade', 'srv_gpu_node', 'srv_storage', 'srv_ai_pod', 'srv_sled', 'srv_quantum', 'srv_orbital',
  'pwr_pdu', 'pwr_subpanel', 'pwr_genset', 'pwr_substation', 'pwr_hv_feed', 'pwr_smr',
  'cool_box_fan', 'cool_window_ac', 'cool_split_ac', 'cool_crac', 'cool_chiller', 'cool_cryo', 'cool_tower', 'cool_immersion',
  'net_switch', 'net_biz_fiber', 'net_fiber_uplink', 'net_core_router', 'net_ix_port', 'net_cable_landing', 'net_tray_segment',
  'floor_tile_solid', 'floor_tile_perf', 'wall_segment_plain', 'wall_segment_door', 'wall_segment_glass', 'containment_panel',
  'skyline_campus', 'hall_shell_silhouette',
];
// §16 item 29: the stage shells hold the props (props_stage_N merged; prop_civic separate in stage 1; prop_garage_monument
// in stage 5). The satellite is §15's "a blinking satellite", exported as prop_satellite in stage 5.
const SHELL_16 = { 1: ['props_stage_1', 'prop_civic'], 2: ['props_stage_2'], 3: ['props_stage_3'], 4: ['props_stage_4'],
  5: ['props_stage_5', 'prop_garage_monument', 'prop_satellite'] };
// §16 shared-datablock pairs with their node scales (§16 items 2, 5, 12, 18, 24).
const SHARED_16 = { srv_blade: ['srv_pizza_box', 1], srv_sled: ['srv_ai_pod', 1], cool_chiller: ['cool_crac', 2.0], cool_cryo: ['cool_crac', 3.0],
  pwr_hv_feed: ['pwr_substation', 1.6], net_core_router: ['net_fiber_uplink', 1.5], net_ix_port: ['net_fiber_uplink', 2.0],
  net_cable_landing: ['net_fiber_uplink', 2.5] };

// Top-level nodes of a GLB (the objects build_assets.py exports), read straight from the file's JSON chunk.
function glbRoots(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const scene = json.scenes[json.scene ?? 0];
  return scene.nodes.map(i => json.nodes[i]);
}
const TICKER_SAMPLES_18 = [
  "Uncle Ray says the site is 'snappier.' You did nothing.",
  'Analysts: the cloud is just computers. Stock falls.',
  "Dave's boys have discovered port scanning.",
  'FrobCoin up 400%. FrobCoin down 400%.',
  'Your mother would like the garage back. You have shown her the valuation.',
  'Weatherbot predicts rain. Weatherbot is a radiator.',
  'The Ministry has no comment. The Ministry has never had a comment.',
  'Marjorie carries 4% of the internet and does not know.',
];
const OPENING_LINE_12 = "Day 1. You have $50, a rack from Craigslist and your mother's electricity.";
// 'upgrade' was dropped: nothing used it, so the sim would have carried a dead evaluator.
const COND_TYPES = ['servers', 'tier', 'incidents', 'contracts', 'valuation', 'stage', 'racks', 'rackFull', 'allRacksFull', 'noRedFor',
  'uptimeFor', 'infra', 'exits', 'staff', 'meterAmber', 'breaker', 'refresh', 'power'];
const METERS = ['power', 'cooling', 'network'];
const LANES = ['power', 'cooling', 'network', 'yard'];

// ---------- counts ----------
eq(D.TIERS.length, 8, 'TIERS count');
eq(D.STAGES.length, 5, 'STAGES count');
eq(D.CONTRACTS.length, 10, 'CONTRACTS count');
eq(D.GLOBALS.length, 15, 'GLOBALS count');
eq(D.EFFICIENCY.length, 4, 'EFFICIENCY count');
eq(D.MITIGATIONS.length, 4, 'MITIGATIONS count');
eq(D.STAFF.length, 5, 'STAFF count');
eq(D.PERKS.length, 7, 'PERKS count');
eq(D.EVENTS.length, 9, 'EVENTS count');
eq(D.INCIDENTS.length, 8, 'INCIDENTS count');
eq(D.ACQUIRERS.length, 3, 'ACQUIRERS count');
ok(D.TICKER.length >= 60, `TICKER has ${D.TICKER.length} lines, want >= 60`);
ok(D.MILESTONES.length >= 35, `MILESTONES has ${D.MILESTONES.length}, want >= 35`);
eq(D.INFRA.length, 19, 'INFRA count (6 power + 7 cooling + 6 network)');

// ---------- scalar constants ----------
eq(D.SAVE_KEY, 'uptime_v1', 'SAVE_KEY');
eq(D.SIM_HZ, 10, 'SIM_HZ');
eq(D.HUSTLE, 1, 'HUSTLE');
eq(D.REFRESH_REFUND, 0.25, 'REFRESH_REFUND');
eq(D.START_CAPACITY.power, 3, 'START_CAPACITY.power');
eq(D.START_CAPACITY.cooling, 1.5, 'START_CAPACITY.cooling');
eq(D.START_CAPACITY.network, 1, 'START_CAPACITY.network');
eq(D.START.cash, 50, 'START.cash');
eq(D.METER.amber, 0.8, 'METER.amber'); eq(D.METER.red, 1.0, 'METER.red');
eq(D.UPTIME.floor, 0.5, 'UPTIME.floor'); eq(D.UPTIME.recover, 1.0, 'UPTIME.recover'); eq(D.UPTIME.fallK, 1.0, 'UPTIME.fallK');
eq(D.UPTIME.darkFall, 0.25, 'UPTIME.darkFall'); eq(D.UPTIME.darkFallMax, 1.0, 'UPTIME.darkFallMax');
// §2 efficiency exponent is its own export, not an uptime constant
eq(D.EFFICIENCY_EXP, 1.5, 'EFFICIENCY_EXP');
ok(!('effExp' in D.UPTIME), 'UPTIME.effExp removed (EFFICIENCY_EXP is the single source)');
eq(D.OFFLINE.capH, 8, 'OFFLINE.capH'); eq(D.OFFLINE.fullRateH, 2, 'OFFLINE.fullRateH'); eq(D.OFFLINE.fullRate, 0.5, 'OFFLINE.fullRate');
eq(D.OFFLINE.tailRate, 0.2, 'OFFLINE.tailRate'); eq(D.OFFLINE.valuationFrac, 0.25, 'OFFLINE.valuationFrac');
eq(D.OFFLINE.returnIncidents, 3, 'OFFLINE.returnIncidents');
ok(!('offlineReturnCount' in D.INCIDENT_RULES), 'INCIDENT_RULES.offlineReturnCount removed (OFFLINE.returnIncidents is the single source)');
// §11 worked examples from the stated rule: 8 h pays 2.2 h; with the 1,000-share perk 8 h pays 4 h and 24 h pays 12 h
{
  const earnH = (h, o) => o.fullRate * Math.min(h, o.fullRateH) + o.tailRate * Math.max(0, h - o.fullRateH);
  const perk = { ...D.OFFLINE, ...D.PERKS.find(p => p.shares === 1000).offline };
  ok(near(earnH(8, D.OFFLINE), 2.2), 'offline: 8 h pays 2.2 h');
  ok(near(earnH(Math.min(8, perk.capH), perk), 4.0) && near(earnH(24, perk), 12), 'offline with perk: 8 h -> 4 h, 24 h -> 12 h');
}
eq(D.EXIT.minValuation, 1e6, 'EXIT.minValuation'); eq(D.EXIT.sharePer, 0.1, 'EXIT.sharePer');
eq(D.EXIT.glowMin, 3, 'EXIT.glowMin'); eq(D.EXIT.glowFactor, 2, 'EXIT.glowFactor');
ok(Math.floor(Math.cbrt(27e6 / 1e6)) === 3 && Math.floor(Math.cbrt(1.7e9 / 1e6)) === 11, 'cbrt share formula sanity');
eq(JSON.stringify(D.UPGRADES.thresholds), '[10,25,50,100,200]', 'UPGRADES.thresholds');
eq(JSON.stringify(D.UPGRADES.costMult), '[15,75,500,10000,10000000]', 'UPGRADES.costMult');
eq(D.UPGRADES.drawMult, 1.3, 'UPGRADES.drawMult');
// §3 rule: the Blade's first upgrade (10 owned) costs base x 15 = $1,500, the number §12 should quote
ok(D.TIERS.find(t => t.id === 'srv_blade').base * D.UPGRADES.costMult[0] === 1500, 'Blade BIOS mod costs $1,500');
for (const t of D.TIERS) ok(typeof D.UPGRADES.names[t.id] === 'string' && D.UPGRADES.names[t.id].length > 0, `UPGRADES.names missing ${t.id}`);

// ---------- ids: unique everywhere, right prefixes, mesh names ----------
const tables = { TIERS: 'srv_', INFRA: /^(pwr|cool|net)_/, STAGES: 'stage_', CONTRACTS: 'con_', MILESTONES: 'ms_', EFFICIENCY: 'eff_',
  MITIGATIONS: 'mit_', EVENTS: 'ev_', INCIDENTS: 'inc_', GLOBALS: 'glb_', ACQUIRERS: 'acq_' };
const allIds = new Map();
for (const [name, prefix] of Object.entries(tables)) {
  const seen = new Set();
  for (const row of D[name]) {
    ok(typeof row.id === 'string' && /^[a-z0-9_]+$/.test(row.id), `${name}: bad id ${JSON.stringify(row.id)}`);
    ok(prefix instanceof RegExp ? prefix.test(row.id) : row.id.startsWith(prefix), `${name}: ${row.id} lacks prefix ${prefix}`);
    ok(!seen.has(row.id), `${name}: duplicate id ${row.id}`); seen.add(row.id);
    ok(!allIds.has(row.id), `id ${row.id} appears in both ${allIds.get(row.id)} and ${name}`); allIds.set(row.id, name);
  }
}
const meshSet = new Set(LIBRARY_16);
for (const t of D.TIERS) ok(meshSet.has(t.id), `TIER ${t.id} is not a §16 mesh name`);
for (const i of D.INFRA) ok(meshSet.has(i.id), `INFRA ${i.id} is not a §16 mesh name`);
for (const m of LIBRARY_16) ok(D.ASSETS.meshes.includes(m), `ASSETS.meshes is missing §16 mesh ${m}`);
for (const m of D.ASSETS.meshes) ok(meshSet.has(m), `ASSETS.meshes has ${m}, which §16 does not list`);
eq(new Set(D.ASSETS.meshes).size, D.ASSETS.meshes.length, 'ASSETS.meshes unique');
// the generic family names are not objects: only their variants are
for (const fam of ['floor_tile', 'wall_segment']) {
  ok(!D.ASSETS.meshes.includes(fam), `ASSETS.meshes lists the family name ${fam} instead of its variants`);
  ok(Array.isArray(D.ASSETS.variants?.[fam]) && D.ASSETS.variants[fam].every(v => v.startsWith(fam + '_') && D.ASSETS.meshes.includes(v)), `ASSETS.variants.${fam}`);
}
eq(D.ASSETS.variants.floor_tile.length, 2, 'floor_tile has two variants (solid, perforated)');
eq(D.ASSETS.variants.wall_segment.length, 3, 'wall_segment has three variants (plain, door, glass)');
// stage props live in the shells, not the library
for (const [n, names] of Object.entries(SHELL_16)) {
  for (const p of names) {
    ok(!D.ASSETS.meshes.includes(p), `ASSETS.meshes lists ${p}, which is a stage_${n}.glb object`);
    ok(D.ASSETS.shellObjects?.[n]?.includes(p), `ASSETS.shellObjects[${n}] is missing ${p}`);
  }
}
eq(JSON.stringify(Object.keys(D.ASSETS.shellObjects ?? {})), '["1","2","3","4","5"]', 'ASSETS.shellObjects keyed by stage 1..5');
for (const [n, names] of Object.entries(D.ASSETS.shellObjects)) {
  eq(new Set(names).size, names.length, `ASSETS.shellObjects[${n}] unique`);
  for (const r of ['floor', 'hot_tiles', 'walls', 'key_light', 'door', 'yard', 'cam_target', `props_stage_${n}`]) ok(names.includes(r), `ASSETS.shellObjects[${n}] is missing ${r}`);
  for (const nm of names) ok(!D.ASSETS.meshes.includes(nm), `${nm} is listed as both a library mesh and a stage_${n} object`);
  if (+n >= 2) ok(names.includes('glass'), `stage_${n} shell has no glass (window strip / glass end wall)`);
}
ok(D.ASSETS.shellObjects[2].includes('cage'), 'the Colo shell has its chain-link cage');
for (const e of D.ASSETS.shellEmpties) ok(Object.values(D.ASSETS.shellObjects).some(names => names.includes(e)), `shellEmpties ${e} is in no shell`);
// shared datablocks: every §16 pair, base in the library, documented node scale
eq(JSON.stringify(Object.keys(D.ASSETS.shared).sort()), JSON.stringify(Object.keys(SHARED_16).sort()), 'ASSETS.shared lists the §16 pairs');
for (const [v, [base, scale]] of Object.entries(SHARED_16)) {
  eq(D.ASSETS.shared[v]?.base, base, `ASSETS.shared.${v}.base`);
  eq(D.ASSETS.shared[v]?.scale, scale, `ASSETS.shared.${v}.scale`);
  ok(D.ASSETS.meshes.includes(v) && D.ASSETS.meshes.includes(base), `ASSETS.shared.${v}: variant and base are library meshes`);
}

// ---------- the lists against the exported GLBs (assets/*.glb are committed; a rebuild that renames an object fails here) ----------
{
  const nodeName = n => n.name;
  let lib = null;
  try { lib = glbRoots(assetPath(D.ASSETS.library)); } catch (e) { ok(false, `cannot read ${D.ASSETS.library}: ${e.message}`); }
  if (lib) {
    const names = lib.map(nodeName);
    ok(sameSet(names, D.ASSETS.meshes), `library.glb objects differ from ASSETS.meshes: only in GLB [${names.filter(n => !D.ASSETS.meshes.includes(n))}], only in data.js [${D.ASSETS.meshes.filter(n => !names.includes(n))}]`);
    const byName = new Map(lib.map(n => [n.name, n]));
    for (const [v, { base, scale }] of Object.entries(D.ASSETS.shared)) {
      const a = byName.get(v), b = byName.get(base);
      ok(a && b && a.mesh !== undefined && a.mesh === b.mesh, `library.glb: ${v} does not share ${base}'s mesh datablock`);
      ok(a && near((a.scale ?? [1, 1, 1])[0], scale, 1e-6), `library.glb: ${v} node scale ${a?.scale?.[0] ?? 1}, data.js says ${scale}`);
    }
    for (const m of D.ASSETS.meshes) ok(byName.get(m)?.mesh !== undefined, `library.glb: ${m} has no mesh`);
  }
  for (const s of D.STAGES) {
    let roots = null;
    try { roots = glbRoots(assetPath(s.shell)); } catch (e) { ok(false, `cannot read ${s.shell}: ${e.message}`); }
    if (!roots) continue;
    const names = roots.map(nodeName), want = D.ASSETS.shellObjects[s.stage];
    ok(sameSet(names, want), `${s.shell} objects differ from ASSETS.shellObjects[${s.stage}]: only in GLB [${names.filter(n => !want.includes(n))}], only in data.js [${want.filter(n => !names.includes(n))}]`);
    for (const n of roots) {
      const isEmpty = D.ASSETS.shellEmpties.includes(n.name);
      ok(isEmpty === (n.mesh === undefined), `${s.shell}: ${n.name} ${isEmpty ? 'should be an empty' : 'should carry a mesh'}`);
    }
  }
}

// ---------- tiers ----------
const tierIds = new Set(D.TIERS.map(t => t.id));
for (const t of D.TIERS) {
  ok(inRange(t.stage, 1, 5), `TIER ${t.id} stage ${t.stage}`);
  for (const k of ['base', 'inc', 'kw', 'gbps', 'growth', 'payback']) ok(Number.isFinite(t[k]) && t[k] > 0, `TIER ${t.id}.${k}`);
  ok(Math.abs(t.base / t.inc - t.payback) / t.payback < 0.02, `TIER ${t.id} payback ${t.payback} vs base/inc ${(t.base / t.inc).toFixed(0)}`);
  ok(t.growth >= 1.05 && t.growth <= 1.2, `TIER ${t.id} growth ${t.growth}`);
  ok(Number.isInteger(t.led?.color) && inRange(t.led.color, 0, 0xffffff), `TIER ${t.id} led.color`);
  ok(D.LED_FAMILIES[t.led?.family]?.colors.includes(t.led.color), `TIER ${t.id} led colour ${t.led?.color?.toString(16)} not in family ${t.led?.family}`);
  for (const k of ['name', 'flavor', 'upgradeName', 'stresses']) ok(typeof t[k] === 'string' && t[k].length, `TIER ${t.id}.${k}`);
}
eq(D.TIERS.find(t => t.id === 'srv_blade')?.needBoxes, 6, 'Blade needBoxes');
ok(D.TIERS.filter(t => t.needBoxes != null).length === 1, 'only the Blade has needBoxes');
ok([...D.TIERS].every((t, i, a) => i === 0 || t.base > a[i - 1].base), 'TIERS ordered by base price');

// ---------- infra ----------
const infraIds = new Set(D.INFRA.map(i => i.id));
for (const i of D.INFRA) {
  ok(METERS.includes(i.meter), `INFRA ${i.id} meter ${i.meter}`);
  ok(LANES.includes(i.lane), `INFRA ${i.id} lane ${i.lane}`);
  ok(inRange(i.stage, 1, 5), `INFRA ${i.id} stage ${i.stage}`);
  ok(i.cap > 0 && i.base > 0 && i.growth > 1, `INFRA ${i.id} numbers`);
  ok(Number.isFinite(i.draw) && i.draw >= 0, `INFRA ${i.id} draw`);
  ok(i.meter === 'cooling' ? i.draw > 0 : i.draw === 0, `INFRA ${i.id} draw ${i.draw} for meter ${i.meter}`);
  ok(i.stage === 1 ? Number.isInteger(i.max) && i.max > 0 : i.max === undefined, `INFRA ${i.id} max/cap rule (garage items capped, others not)`);
  ok(i.stage === 1 ? [1.25, 1.3].includes(i.growth) : i.growth === 1.15, `INFRA ${i.id} growth ${i.growth}`);
  ok(i.mount === undefined || ['rackSide', 'rackTop'].includes(i.mount), `INFRA ${i.id} mount`);
  ok(i.needsTier === undefined || tierIds.has(i.needsTier), `INFRA ${i.id} needsTier ${i.needsTier}`);
  ok(typeof i.flavor === 'string' && i.flavor.length, `INFRA ${i.id} flavor`);
}
eq(D.INFRA.find(i => i.id === 'pwr_pdu')?.mount, 'rackSide', 'pwr_pdu mount');
eq(D.INFRA.find(i => i.id === 'net_switch')?.mount, 'rackTop', 'net_switch mount');
eq(D.INFRA.find(i => i.id === 'cool_cryo')?.needsTier, 'srv_quantum', 'cool_cryo needsTier');
for (const id of ['pwr_genset', 'pwr_substation', 'pwr_hv_feed', 'pwr_smr', 'cool_chiller', 'cool_cryo']) eq(D.INFRA.find(i => i.id === id)?.lane, 'yard', `${id} lane`);
const garageCapMax = m => D.INFRA.filter(i => i.stage === 1 && i.meter === m).reduce((a, i) => a + i.cap * i.max, D.START_CAPACITY[m]);
ok(garageCapMax('power') === 3 + 24 + 36, `garage max power ${garageCapMax('power')} kW`);

// ---------- flavor lines are not recycled as milestone cards for a different object ----------
// (net_biz_fiber once carried the First Gigabit card's sentence while the card's cond is the Switch)
{
  const msByText = new Map(D.MILESTONES.map(m => [m.text, m]));
  for (const row of [...D.TIERS, ...D.INFRA]) {
    const m = msByText.get(row.flavor);
    ok(!m || m.cond.id === row.id, `${row.id} flavor reuses milestone ${m?.id}'s text but that card is about ${m?.cond.id ?? m?.cond.type}`);
  }
  for (const s of D.STAFF) {
    const m = msByText.get(s.flavor);
    ok(!m || (m.cond.type === 'staff' && m.cond.n === s.n), `STAFF ${s.name} flavor reuses milestone ${m?.id}'s text`);
  }
}

// ---------- stages, footprints, lanes ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
ok(inRange(D.LANE_FIT, 0.5, 1), `LANE_FIT ${D.LANE_FIT}`);
D.STAGES.forEach((s, idx) => {
  eq(s.stage, idx + 1, `${s.id} stage index`);
  eq(s.shell, `stage_${idx + 1}.glb`, `${s.id} shell`);
  eq(s.footprints.length, s.rows * s.cols, `${s.id} footprints.length vs rows*cols`);
  eq(s.carried + s.toBuy, s.footprints.length, `${s.id} carried + toBuy`);
  ok([1, 2, 3].includes(s.slots), `${s.id} slots ${s.slots}`);
  ok(s.size?.w > 0 && s.size?.d > 0, `${s.id} size`);
  ok(s.fog > 0 && s.fog <= 0.02, `${s.id} fog ${s.fog}`);
  ok(Number.isInteger(s.keyColor), `${s.id} keyColor`);
  // The garage bulb is a PointLight (candela); the other keys are DirectionalLights (scene_world.js KEY_INTENSITY). Review
  // (round 3): a 12 cd bulb left the garage rack a silhouette; 16 lights its posts and keeps the garage dark, so 14 is the floor.
  ok(s.stage === 1 ? inRange(s.keyIntensity, 14, 40) : inRange(s.keyIntensity, 0.5, 3), `${s.id} keyIntensity ${s.keyIntensity}`);
  // Review finding: a saturated key (the Hall's old 0x3b7bff) turned the white racks, tiles and walls into one blue. Stages
  // with white racks keep the key's min/max channel >= 0.45; the saturated aisle blue stays in PALETTE.coldAisle for the strips.
  if (s.rackColor === D.PALETTE.rackWhite) {
    const ch = [16, 8, 0].map(sh => (s.keyColor >> sh) & 255);
    ok(Math.min(...ch) / Math.max(...ch) >= 0.45, `${s.id} keyColor #${s.keyColor.toString(16)} is too saturated for white racks`);
    ok(s.keyColor !== D.PALETTE.coldAisle, `${s.id} keyColor must not be the cold-aisle strip blue`);
  }
  ok(s.rackGrowth >= 1.04 && s.rackGrowth <= 1.08, `${s.id} rackGrowth`);
  // reading order: front row (largest z) first, x ascending within a row, rotY in {0, PI}
  for (let k = 0; k < s.footprints.length; k++) {
    const [x, z, rot] = s.footprints[k];
    ok(rot === 0 || rot === Math.PI, `${s.id} footprint ${k} rotY ${rot}`);
    ok(Math.abs(x) <= s.size.w / 2 - 0.3 && Math.abs(z) <= s.size.d / 2 - 0.6, `${s.id} footprint ${k} outside the hall`);
    if (k % s.cols) { ok(x > s.footprints[k - 1][0] && z === s.footprints[k - 1][1], `${s.id} footprint ${k} not left-to-right`); }
    else if (k) ok(z < s.footprints[k - s.cols][1], `${s.id} row ${k / s.cols} not behind the previous row`);
  }
  // 0.8 m pitch along x, 2.4 m between rows
  if (s.cols > 1) ok(near(s.footprints[1][0] - s.footprints[0][0], 0.8), `${s.id} rack pitch`);
  if (s.rows > 1) ok(near(s.footprints[0][1] - s.footprints[s.cols][1], 2.4), `${s.id} row pitch`);
  // facing: every row faces +Z (the camera) so every rack's LEDs are visible from the default view; the aisle kinds
  // are a floor pattern (aisle 0 hot, then alternating) baked into the stage shells, independent of the facing
  const rowRot = r => s.footprints[r * s.cols][2];
  for (let r = 0; r < s.rows; r++) eq(rowRot(r), 0, `${s.id} row ${r} must face +Z (the camera)`);
  ok(s.footprints.every((f, k) => f[2] === rowRot(Math.floor(k / s.cols))), `${s.id} every rack in a row shares its facing`);
  eq(s.aisles.length, Math.max(0, s.rows - 1), `${s.id} aisles count`);
  s.aisles.forEach((a, r) => {
    eq(a.kind, r % 2 ? 'cold' : 'hot', `${s.id} aisle ${r} kind`);
    ok(near(a.z, (s.footprints[r * s.cols][1] + s.footprints[(r + 1) * s.cols][1]) / 2), `${s.id} aisle ${r} z between its rows`);
  });
  if (s.rows > 1) eq(s.aisles[0].kind, 'hot', `${s.id} aisle 0 (behind the front row) is hot`);
  // lanes
  for (const lane of LANES) {
    const pts = s.lanes[lane];
    ok(Array.isArray(pts) && pts.length >= s.maxVisible, `${s.id} lane ${lane} has ${pts?.length} spots, want >= ${s.maxVisible}`);
    for (const p of pts) {
      ok(p.length === 3 && p.every(Number.isFinite), `${s.id} lane ${lane} bad spot ${JSON.stringify(p)}`);
      if (lane === 'yard') ok(p[1] < -s.size.d / 2, `${s.id} yard spot ${p} is inside the hall`);
      else ok(Math.abs(p[0]) < s.size.w / 2 && Math.abs(p[1]) < s.size.d / 2, `${s.id} lane ${lane} spot ${p} outside the hall`);
      for (const f of s.footprints) ok(dist(p, f) >= 0.7, `${s.id} lane ${lane} spot ${p} within 0.7 m of footprint ${f}`);
    }
    if (lane === 'power') ok(pts.every(p => p[0] < 0), `${s.id} power lane not along the left wall`);
    if (lane === 'network') ok(pts.every(p => p[0] > 0), `${s.id} network lane not along the right wall`);
    if (lane === 'cooling') ok(pts.every(p => p[1] < Math.min(...s.footprints.map(f => f[1]))), `${s.id} cooling lane not behind the back row`);
    // lanePitch is the real spot-to-spot distance, and units can be sized from it
    const axis = lane === 'power' || lane === 'network' ? 1 : 0;
    const measured = Math.abs(pts[1][axis] - pts[0][axis]);
    ok(near(s.lanePitch?.[lane], measured, 2.1e-3), `${s.id} lanePitch.${lane} ${s.lanePitch?.[lane]} vs measured ${measured.toFixed(3)}`);
    ok(pts.every((p, i) => i === 0 || near(Math.abs(p[axis] - pts[i - 1][axis]), measured, 2.1e-3)), `${s.id} lane ${lane} spots not evenly spaced`);
    ok(s.lanePitch[lane] >= 0.8, `${s.id} lanePitch.${lane} ${s.lanePitch[lane]} < 0.8 m (a rack width)`);
  }
  // yard units (genset .. cryo, scaled x1.6-x3.0 shared meshes) exist from the Colo on and need >= 2 m between spots
  if (s.stage >= 2) ok(s.lanePitch.yard >= 2.0, `${s.id} yard pitch ${s.lanePitch.yard} < 2.0 m: scaled yard units overlap`);
  if (s.stage >= 3) ok(s.lanePitch.cooling >= 1.25, `${s.id} cooling pitch ${s.lanePitch.cooling} < 1.25 m: CRACs overlap`);
  for (const id of s.unlocks) ok(id === 'staff' || allIds.has(id), `${s.id} unlocks unknown id ${id}`);
  // rackToast is keyed by footprint index of the rack just bought
  for (const k of Object.keys(s.rackToast ?? {})) ok(Number.isInteger(+k) && +k >= s.carried && +k < s.footprints.length, `${s.id} rackToast key ${k} is not a buyable footprint index`);
});
eq(JSON.stringify(D.STAGES.map(s => s.footprints.length)), '[4,12,36,96,240]', 'stage footprint totals');
// move = cost to ENTER the stage: the start stage is 0 and each later stage carries its own §5 move cost
eq(JSON.stringify(D.STAGES.map(s => s.move)), '[0,2000,300000,20000000,2000000000]', 'stage move costs (cost to enter)');
eq(JSON.stringify(D.STAGES.map(s => s.rackBase)), '[40,300,10000,250000,10000000]', 'stage rack bases');
eq(JSON.stringify(D.STAGES.map(s => s.maxVisible)), '[6,8,12,16,20]', 'stage maxVisible');
eq(JSON.stringify(D.STAGES.map(s => s.slots)), '[1,1,2,2,3]', 'contract slots per stage');
eq(JSON.stringify(D.STAGES.map(s => s.carried)), '[1,4,12,36,96]', 'racks carried into each stage');
// the garage's third rack (footprint 2) costs ~$43 (rackBase * growth^1; the first rack is free) and toasts the Civic
ok(near(40 * 1.08 ** 1, 43.2), 'Sell the Civic price');
ok(/Civic/.test(D.STAGES[0].rackToast?.[2] ?? ''), 'garage rackToast[2] is the Civic toast');
// a rack toast must not promise more footprints than are left: after footprint k, footprints.length - k - 1 remain
// (the garage is 1 x 4 and every unbought footprint is outlined from boot, so "Two footprints appear" after Rack 3 was wrong)
{
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  for (const s of D.STAGES) {
    for (const [k, text] of Object.entries(s.rackToast ?? {})) {
      const left = s.footprints.length - (+k) - 1;
      const m = /\b(one|two|three|four|five|six|\d+)\s+footprints?\b/i.exec(text);
      if (m) ok((WORDS[m[1].toLowerCase()] ?? +m[1]) === left, `${s.id} rackToast[${k}] says "${m[0]}" but ${left} footprint(s) remain`);
      ok(typeof text === 'string' && text.length > 0 && text.length <= 80, `${s.id} rackToast[${k}] length`);
    }
  }
  ok(!/Two footprints appear/.test(D.STAGES[0].rackToast[2]), 'Civic toast no longer claims two footprints appear');
}
ok(D.STAGES.slice(1).every(s => typeof s.moveToast === 'string' && s.moveToast.length) && D.STAGES[0].moveToast === null, 'moveToast on every entered stage');
ok(/Mom's not paying the power bill/.test(D.STAGES[1].moveToast), '§5 Colo lease toast');

// ---------- globals ----------
D.GLOBALS.forEach((g, i) => {
  eq(g.threshold, 10 ** (i + 3), `GLOBAL ${i} threshold`);
  ok(Math.abs(g.cost - 0.6 * g.threshold) < 1e-6 * g.threshold, `GLOBAL ${i} cost`);
  eq(g.mult, 1.25, `GLOBAL ${i} mult`);
  ok(typeof g.name === 'string' && g.name.length, `GLOBAL ${i} name`);
});

// ---------- contracts ----------
eq(D.CONTRACT_RULES.unlockRack, 2, 'CONTRACT_RULES.unlockRack (racks owned)');
eq(D.CONTRACT_RULES.headroomU, D.METER.amber, 'CONTRACT_RULES.headroomU is the amber threshold');
const FACTOR_METER = { power: 'power', heat: 'cooling', net: 'network' };
for (const c of D.CONTRACTS) {
  ok(inRange(c.stage, 1, 5), `CONTRACT ${c.id} stage ${c.stage}`);
  ok(c.mult > 1 && c.power > 0 && c.heat > 0 && c.net > 0, `CONTRACT ${c.id} factors`);
  ok(c.sla === null || (c.sla > 90 && c.sla < 100), `CONTRACT ${c.id} sla ${c.sla}`);
  eq(c.term, c.id === 'con_black_friday' ? 180 : 600, `CONTRACT ${c.id} term`);
  ok(typeof c.line === 'string' && c.line.length, `CONTRACT ${c.id} line`);
  if (c.needs) ok(tierIds.has(c.needs.tier) && c.needs.n > 0, `CONTRACT ${c.id} needs`);
  // stresses = meters with factor > 1, largest first (ties in power, cooling, network order)
  const want = Object.entries(FACTOR_METER).filter(([k]) => c[k] > 1).sort((a, b) => c[b[0]] - c[a[0]]).map(([, m]) => m);
  eq(JSON.stringify(c.stresses), JSON.stringify(want), `CONTRACT ${c.id} stresses`);
  ok(Array.isArray(c.stresses) && c.stresses.every(m => METERS.includes(m)), `CONTRACT ${c.id} stresses are meter names`);
}
eq(JSON.stringify(D.CONTRACTS.filter(c => c.stresses.length === 0).map(c => c.id)), '["con_uncle_ray","con_county","con_ministry"]', 'contracts that stress nothing');
eq(JSON.stringify(D.CONTRACTS.find(c => c.id === 'con_frobcoin').stresses), '["cooling","power"]', 'FrobCoin stresses heat first');
eq(JSON.stringify(D.CONTRACTS.find(c => c.id === 'con_weatherbot').stresses), '["power","cooling"]', 'Weatherbot tie keeps power first');
eq(D.CONTRACTS.find(c => c.id === 'con_halcyon')?.needs?.n, 10, 'Halcyon needs 10 AI Pods');
// §7 stacking examples
const cm = ids => 1 + ids.reduce((a, id) => a + D.CONTRACTS.find(c => c.id === id).mult - 1, 0);
ok(near(cm(['con_county', 'con_weatherbot']), 2.4), 'County + Weatherbot = x2.4');
ok(near(cm(['con_county', 'con_halcyon', 'con_ministry']), 4.7), 'County + Halcyon + Ministry = x4.7');
ok(near(D.CONTRACTS.find(c => c.id === 'con_weatherbot').power * D.CONTRACTS.find(c => c.id === 'con_halcyon').power, 1.95), 'Weatherbot + Halcyon power x1.95');

// ---------- events, incidents, mitigations, efficiency, staff, perks ----------
const mitIds = new Set(D.MITIGATIONS.map(m => m.id));
const evIds = new Set(D.EVENTS.map(e => e.id));
for (const e of D.EVENTS) {
  ok(e.duration > 0, `EVENT ${e.id} duration`);
  ok(e.mitigation === null || mitIds.has(e.mitigation), `EVENT ${e.id} mitigation ${e.mitigation}`);
  ok(e.effect && ['capacity', 'demand', 'income', 'blackout'].includes(e.effect.target), `EVENT ${e.id} effect.target`);
  ok(e.effect.target === 'income' ? e.effect.meter === null : METERS.includes(e.effect.meter), `EVENT ${e.id} effect.meter`);
  ok(typeof e.text === 'string' && e.text.length && typeof e.ticker === 'string' && e.ticker.length, `EVENT ${e.id} text/ticker`);
}
ok(evIds.has('ev_breaker') && D.EVENTS.find(e => e.id === 'ev_breaker').once === true, 'ev_breaker present and once');
{
  const ddos = D.EVENTS.find(e => e.id === 'ev_ddos');
  eq(ddos?.handScrub?.taps, 5, 'ev_ddos hand scrub taps');
  eq(ddos?.scrubTarget, 'net_fiber_uplink', 'ev_ddos scrubTarget');
  ok(infraIds.has(ddos?.scrubTarget) && D.INFRA.find(i => i.id === ddos.scrubTarget).meter === 'network', 'ev_ddos scrubTarget is a network unit');
  eq(ddos?.scrubFallback, 'newestNetworkUnit', 'ev_ddos scrubFallback (before the first uplink)');
}
for (const m of D.MITIGATIONS) {
  ok(inRange(m.stage, 1, 5) && m.cost > 0, `MIT ${m.id} stage/cost`);
  ok(m.defuses === null || evIds.has(m.defuses), `MIT ${m.id} defuses ${m.defuses}`);
}
eq(D.MITIGATIONS.find(m => m.id === 'mit_spares')?.hardwareResolveS, 5, 'Spares resolve 5 s');
for (const inc of D.INCIDENTS) {
  ok(typeof inc.hardware === 'boolean', `INC ${inc.id} hardware flag`);
  ok(inRange(inc.stage?.min, 1, 5) && inRange(inc.stage?.max, inc.stage.min, 5), `INC ${inc.id} stage range`);
  ok(Array.isArray(inc.texts) && inc.texts.length === 2 && inc.texts.every(t => typeof t === 'string' && t.length), `INC ${inc.id} needs two texts`);
  if (inc.lateTexts) ok(inc.lateTexts.length === 2, `INC ${inc.id} lateTexts`);
}
eq(D.INCIDENTS.filter(i => i.hardware).length, 5, 'five hardware incident flavors');
for (const e of D.EFFICIENCY) {
  ok(inRange(e.stage, 1, 5) && e.cost > 0, `EFF ${e.id} stage/cost`);
  ok(['heat', 'coolingDraw', 'net', 'coolingCap'].includes(e.effect?.target) && e.effect.factor > 0, `EFF ${e.id} effect`);
}
D.STAFF.forEach((s, i) => { eq(s.n, i + 1, `STAFF ${i} n`); ok(inRange(s.stage, 1, 5) && s.cost > 0, `STAFF ${s.name} stage/cost`); });
eq(JSON.stringify(D.STAFF.map(s => s.cost)), '[5000,15000,45000,135000,405000]', 'STAFF costs');
eq(JSON.stringify(D.PERKS.map(p => p.shares)), '[1,3,10,30,100,300,1000]', 'PERK thresholds');
for (const p of D.PERKS) {
  if (p.stage) ok(inRange(p.stage, 1, 5) && p.racks > 0 && p.cash > 0, `PERK ${p.shares} start fields`);
  if (p.infra) for (const id of p.infra) ok(infraIds.has(id), `PERK ${p.shares} infra ${id}`);
}
// start perks: one per stage, carried racks equal the stage's carried count, so "highest perk <= shares wins" is well defined
{
  const starts = D.PERKS.filter(p => p.stage);
  eq(JSON.stringify(starts.map(p => p.stage)), '[1,2,3,4,5]', 'one start perk per stage, ascending');
  for (const p of starts) eq(p.racks, D.STAGES[p.stage - 1].carried, `PERK ${p.shares} racks match stage ${p.stage} carried`);
  ok(D.PERKS.filter(p => p.infra).length === 1 && D.PERKS[0].infra.length === 3, 'only perk 1 installs infra (three garage units)');
}
for (const [v, min] of D.EXIT.runMinutes) ok(v > 0 && min > 0, 'EXIT.runMinutes entries');
ok(D.EXIT.runMinutes.every((e, i, a) => i === 0 || (e[0] > a[i - 1][0] && e[1] > a[i - 1][1])), 'EXIT.runMinutes monotonic');

// ---------- milestones ----------
const condTypes = new Set(COND_TYPES);
eq(JSON.stringify(D.MILESTONE_COND_TYPES), JSON.stringify(COND_TYPES), 'MILESTONE_COND_TYPES matches the documented set');
const usedCondTypes = new Set(D.MILESTONES.map(m => m.cond?.type));
for (const t of COND_TYPES) ok(usedCondTypes.has(t), `cond type '${t}' is listed but no milestone uses it (dead evaluator)`);
const tickers = new Set();
for (const m of D.MILESTONES) {
  ok(typeof m.name === 'string' && typeof m.text === 'string' && m.text.length, `MS ${m.id} name/text`);
  eq(m.bonus, 0.01, `MS ${m.id} bonus`);
  // §18: one reaction line per milestone, headline voice
  ok(typeof m.ticker === 'string' && m.ticker.length >= 10 && m.ticker.length <= 80, `MS ${m.id} ticker missing or odd length`);
  ok(m.ticker === m.ticker.toUpperCase(), `MS ${m.id} ticker is not a headline (uppercase): ${m.ticker}`);
  ok(!tickers.has(m.ticker), `MS ${m.id} ticker duplicates another`); tickers.add(m.ticker);
  ok(m.cond && condTypes.has(m.cond.type), `MS ${m.id} cond.type ${m.cond?.type} not allowed`);
  const c = m.cond || {};
  switch (c.type) {
    case 'servers': case 'incidents': case 'contracts': case 'valuation': case 'exits': case 'staff': case 'racks': ok(c.n > 0, `MS ${m.id} cond.n`); break;
    case 'stage': case 'allRacksFull': ok(inRange(c.stage ?? c.n, 1, 5), `MS ${m.id} cond stage`); break;
    case 'tier': ok(tierIds.has(c.id) && c.n > 0, `MS ${m.id} cond tier ${c.id}`); break;
    case 'infra': ok(infraIds.has(c.id) && c.n > 0, `MS ${m.id} cond infra ${c.id}`); break;
    case 'rackFull': ok(Number.isInteger(c.rack) && c.rack >= 0, `MS ${m.id} cond rack`); break;
    case 'noRedFor': ok(c.s > 0, `MS ${m.id} cond.s`); break;
    case 'uptimeFor': ok(c.min > 0 && c.min <= 100 && c.s > 0, `MS ${m.id} cond uptimeFor`); break;
    case 'meterAmber': ok(METERS.includes(c.meter), `MS ${m.id} cond meter`); break;
    case 'power': ok(c.kw > 0, `MS ${m.id} cond kw`); break;
    default: break;
  }
}
ok(!D.MILESTONES.some(m => m.ticker === undefined), 'every milestone carries a ticker line');
eq(D.MILESTONES[0].id, 'ms_lights_on', 'first milestone');
eq(D.MILESTONES.find(m => m.id === 'ms_make_me_a_million')?.cond.n, 1e6, '$1M milestone');
eq(D.MILESTONES.find(m => m.id === 'ms_make_me_a_million')?.ticker, 'LOCAL MAN WORTH $1M ON PAPER, STILL HAS GARAGE SMELL', '§9 $1M ticker');
ok(D.MILESTONES.find(m => m.id === 'ms_you_are_the_cloud')?.cond.n === 1e15, '$1Qa soft ending');
const order = ['ms_lights_on', 'ms_sell_the_civic', 'ms_sign_the_lease', 'ms_make_me_a_million', 'ms_first_exit', 'ms_campus', 'ms_you_are_the_cloud'];
ok(order.map(id => D.MILESTONES.findIndex(m => m.id === id)).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1])), '§9 milestone order');
// the §9 conds econ_sim.js uses
eq(JSON.stringify(D.MILESTONES.find(m => m.id === 'ms_out_of_the_cage')?.cond), '{"type":"tier","id":"srv_gpu_node","n":1}', 'Out of the Cage = first GPU Node');
eq(JSON.stringify(D.MILESTONES.find(m => m.id === 'ms_first_megawatt')?.cond), '{"type":"power","kw":1000}', 'First Megawatt = 1,000 kW capacity');
eq(JSON.stringify(D.MILESTONES.find(m => m.id === 'ms_four_nines')?.cond), '{"type":"uptimeFor","min":99.99,"s":1800}', 'Four Nines = 99.99 for 1800 s');

// ---------- ticker ----------
const eligible = st => D.TICKER.filter(t => t.stage.min <= st && st <= t.stage.max);
for (const t of D.TICKER) {
  ok(t.stage && inRange(t.stage.min, 1, 5) && inRange(t.stage.max, t.stage.min, 5), `TICKER bad stage range ${JSON.stringify(t)}`);
  ok(typeof t.text === 'string' && t.text.length > 8, `TICKER bad line ${JSON.stringify(t)}`);
  // garage-voice lines (eligible in the garage but not everywhere) retire by the Colo at the latest
  if (t.stage.min === 1 && t.stage.max < 5) ok(t.stage.max <= 2, `TICKER garage line lingers to stage ${t.stage.max}: ${t.text}`);
}
eq(new Set(D.TICKER.map(t => t.text)).size, D.TICKER.length, 'TICKER lines unique');
for (const s of TICKER_SAMPLES_18) ok(D.TICKER.some(t => t.text === s), `TICKER missing §18 sample: ${s}`);
for (let st = 1; st <= 5; st++) ok(eligible(st).length >= 20, `TICKER has only ${eligible(st).length} lines eligible in stage ${st}`);
ok(D.TICKER.filter(t => t.stage.max === 1).length >= 10, 'TICKER has >= 10 garage-only lines');
ok(D.TICKER.filter(t => t.stage.min === 1 && t.stage.max === 5).length >= 15, 'TICKER has >= 15 evergreen lines');
for (let st = 2; st <= 5; st++) ok(D.TICKER.filter(t => t.stage.min === st).length >= 8, `TICKER has fewer than 8 lines that start in stage ${st}`);
ok(!eligible(5).some(t => /garage|Mom |mother|Civic/.test(t.text) && t.stage.min === 1), 'no garage-voice line is eligible in the Campus');
{
  const opening = D.TICKER.filter(t => t.opening);
  eq(opening.length, 1, 'exactly one opening ticker line');
  eq(opening[0]?.text, OPENING_LINE_12, '§12 0:00 line is the opening line');
  eq(opening[0]?.stage.min, 1, 'opening line is a garage line');
}
eq(D.TICKER_RULES.noRepeatS, 900, 'TICKER no repeat within 15 minutes');

// ---------- palette, assets ----------
for (const [k, v] of Object.entries(D.PALETTE)) ok(Number.isInteger(v) && inRange(v, 0, 0xffffff), `PALETTE.${k}`);
eq(D.PALETTE.bg, 0x07090f, 'PALETTE.bg'); eq(D.PALETTE.incident, 0xffb347, 'PALETTE.incident'); eq(D.PALETTE.rackWhite, 0xd8dcdf, 'PALETTE.rackWhite');
// Review (round 3): #1b1f27 steel under a #0b0e14 hemisphere ground rendered the garage rack as a pure-black silhouette (its
// posts sampled rgb(0,0,0) beside a lit floor), so the steel, the ground and the bulb were lifted. The steel stays dark grey so
// the Colo repaint to rackWhite is still a visible change.
const maxChannel = c => Math.max((c >> 16) & 255, (c >> 8) & 255, c & 255);
ok(maxChannel(D.PALETTE.rackGarage) >= 0x30 && maxChannel(D.PALETTE.rackGarage) <= 0x60, `PALETTE.rackGarage #${D.PALETTE.rackGarage.toString(16)} must be dark grey: not black, not white`);
eq(D.STAGES[0].rackColor, D.PALETTE.rackGarage, 'stage_garage rackColor is PALETTE.rackGarage');
ok(maxChannel(D.PALETTE.hemiGround) >= 0x20 && maxChannel(D.PALETTE.hemiGround) < maxChannel(D.PALETTE.hemiSky), `PALETTE.hemiGround #${D.PALETTE.hemiGround.toString(16)} must sit above black and below hemiSky`);
eq(D.ASSETS.envelope.w, 0.52, 'envelope w'); eq(D.ASSETS.rack.slotPitch, 0.22, 'rack slot pitch');
eq(JSON.stringify(D.ASSETS.shells), '["stage_1.glb","stage_2.glb","stage_3.glb","stage_4.glb","stage_5.glb"]', 'ASSETS.shells');

// ---------- util ----------
const money = [[0, '$0.00'], [15, '$15.00'], [1300, '$1.30K'], [1.9e6, '$1.90M'], [300e6, '$300M'], [1e15, '$1.00Qa'],
  [99.99, '$99.99'], [99.995, '$100'], [100, '$100'], [999, '$999'], [999.5, '$1.00K'], [999.6, '$1.00K'], [999499, '$999K'], [12345, '$12.3K'],
  [-5, '-$5.00'], [NaN, '$0.00'], [undefined, '$0.00'], [1e9, '$1.00B'], [1e12, '$1.00T'], [1e18, '$1.00Qi'], [1e21, '$1.00Sx'], [1e24, '$1.00Sp'],
  [1e27, '$1.00Oc'], [1e30, '$1.00No'], [1e33, '$1.00Dc'], [6.8e12, '$6.80T'],
  // past the last suffix: whole numbers, never an exponent
  [1e36, '$1000Dc'], [1.5e38, '$150000Dc'], [9.995e35, '$1000Dc']];
for (const [n, want] of money) eq(U.fmtMoney(n), want, `fmtMoney(${n})`);
ok(!/e\+/.test(U.fmtMoney(1e40)) && !/e\+/.test(U.fmtNum(1e40)), 'no exponent notation past Dc');
eq(U.fmtRate(1200), '+$1.20K/s', 'fmtRate(1200)'); eq(U.fmtRate(0.1), '+$0.10/s', 'fmtRate(0.1)'); eq(U.fmtRate(-3), '-$3.00/s', 'fmtRate(-3)');
eq(U.fmtNum(0.25), '0.25', 'fmtNum(0.25)'); eq(U.fmtNum(12), '12', 'fmtNum(12)'); eq(U.fmtNum(1500), '1.50K', 'fmtNum(1500)'); eq(U.fmtNum(3.3), '3.3', 'fmtNum(3.3)');
// §12 shop prices in whole dollars: Pizza Boxes $15, 16, 17, 18, 20, 21; Blade 2 $107; racks $43, $47; firmware $225; Blanking panels $600
const price = [[15, '$15'], [16.05, '$16'], [17.17, '$17'], [18.38, '$18'], [19.67, '$20'], [21.04, '$21'], [107, '$107'], [43.2, '$43'], [46.656, '$47'],
  [225, '$225'], [600, '$600'], [999.4, '$999'], [999.5, '$1.00K'], [1300, '$1.30K'], [0, '$0'], [1, '$1'], [-5, '-$5'], [NaN, '$0.00']];
for (const [n, want] of price) eq(U.fmtPrice(n), want, `fmtPrice(${n})`);
eq(U.fmtTime(276), '4:36', 'fmtTime(276)'); eq(U.fmtTime(3960), '1h06m', 'fmtTime(3960)'); eq(U.fmtTime(7), '0:07', 'fmtTime(7)');
eq(U.fmtDuration(22320), '6h 12m', 'fmtDuration(22320)'); eq(U.fmtDuration(725), '12m 05s', 'fmtDuration(725)'); eq(U.fmtDuration(45), '45s', 'fmtDuration(45)');
eq(U.fmtKw(3.3), '3.3 kW', 'fmtKw(3.3)'); eq(U.fmtKw(3), '3.0 kW', 'fmtKw(3)'); eq(U.fmtKw(2000), '2.0 MW', 'fmtKw(2000)'); eq(U.fmtKw(1e7), '10.0 GW', 'fmtKw(1e7)');
eq(U.fmtGbps(1.1), '1.1 Gbps', 'fmtGbps(1.1)'); eq(U.fmtGbps(4000), '4.0 Tbps', 'fmtGbps(4000)'); eq(U.fmtGbps(25000), '25.0 Tbps', 'fmtGbps(25000)');
eq(U.fmtMeter(3.3, 3.0, 'power'), '3.3 / 3.0 kW', 'fmtMeter power'); eq(U.fmtMeter(1.1, 1.0, 'network'), '1.1 / 1.0 Gbps', 'fmtMeter network');
eq(U.fmtMeter(1800, 2000, 'cooling'), '1.8 / 2.0 MW', 'fmtMeter cooling MW'); eq(U.fmtMeter(1.25, 3, 'power'), '1.25 / 3.0 kW', 'fmtMeter two decimals');
// non-finite meter inputs read as 0, past-the-last-unit values print whole
eq(U.fmtKw(1e13), '10000 TW', 'fmtKw past TW'); eq(U.fmtGbps(1e12), '1000 Ebps', 'fmtGbps past Ebps');
eq(U.fmtKw(Infinity), '0.0 kW', 'fmtKw(Infinity)'); eq(U.fmtKw(NaN), '0.0 kW', 'fmtKw(NaN)'); eq(U.fmtKw(-4), '0.0 kW', 'fmtKw(-4)');
eq(U.fmtMeter(Infinity, 3, 'power'), '0.0 / 3.0 kW', 'fmtMeter(Infinity)'); eq(U.fmtMeter(null, undefined, 'network'), '0.0 / 0.0 Gbps', 'fmtMeter(null)');
eq(U.fmtPct(0.92), '92%', 'fmtPct(0.92)'); eq(U.fmtPct(Infinity), '0%', 'fmtPct(Infinity)'); eq(U.fmtPct(NaN), '0%', 'fmtPct(NaN)'); eq(U.fmtPct(1.234, 1), '123.4%', 'fmtPct digits');
eq(U.clamp(5, 0, 3), 3, 'clamp'); eq(U.lerp(0, 10, 0.25), 2.5, 'lerp'); eq(U.smoothstep(0, 1, 0.5), 0.5, 'smoothstep mid'); eq(U.smoothstep(0, 1, 2), 1, 'smoothstep clamp');
eq(U.smoothstep(1, 1, 1), 1, 'smoothstep degenerate at edge'); eq(U.smoothstep(1, 1, 0.5), 0, 'smoothstep degenerate below'); eq(U.smoothstep(1, 1, 2), 1, 'smoothstep degenerate above');
{
  const a = U.mulberry32(42), b = U.mulberry32(42);
  const seq = Array.from({ length: 1000 }, () => a());
  ok(seq.every(v => v >= 0 && v < 1), 'mulberry32 range');
  ok(seq.every(v => v === b()), 'mulberry32 deterministic');
  ok(new Set(seq).size > 990, 'mulberry32 not degenerate');
  ok(U.mulberry32(1.7)() === U.mulberry32(1)() && U.mulberry32(2 ** 32 + 1)() === U.mulberry32(1)(), 'mulberry32 seed is an unsigned 32-bit int (documented)');
  ok(U.mulberry32(1)() !== U.mulberry32(2)(), 'mulberry32 different seeds differ');
  const r = U.mulberry32(7);
  ok(['a', 'b', 'c'].includes(U.pick(r, ['a', 'b', 'c'])), 'pick');
  eq(U.pick(r, []), undefined, 'pick on empty');
  const items = [{ id: 'x', w: 0 }, { id: 'y', w: 5 }];
  ok(Array.from({ length: 50 }, () => U.weightedPick(r, items)).every(it => it.id === 'y'), 'weightedPick respects zero weight');
  eq(U.weightedPick(r, [{ id: 'x', w: 0 }, { id: 'y', w: 0 }]), undefined, 'weightedPick with all-zero weights returns undefined');
  eq(U.weightedPick(r, []), undefined, 'weightedPick on empty returns undefined');
  eq(U.weightedPick(r, [{ id: 'x', w: NaN }, { id: 'y', w: 1 }])?.id, 'y', 'weightedPick treats NaN weight as 0');
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[U.weightedPick(r, [{ id: 'a', w: 1 }, { id: 'b', w: 3 }]).id]++;
  ok(counts.b > counts.a * 2 && counts.b < counts.a * 4.5, `weightedPick 1:3 split came out ${counts.a}:${counts.b}`);
  eq(U.weightedPick(r, [{ id: 'a' }, { id: 'b' }], () => 2).id.length, 1, 'weightedPick custom weightOf');
}

// ---------- report ----------
if (fails.length) {
  console.error(`data_check: ${fails.length} of ${checks} checks FAILED`);
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log(`data_check: ${checks} checks passed — ${D.TIERS.length} tiers, ${D.INFRA.length} infra, ${D.STAGES.length} stages (${D.STAGES.map(s => s.footprints.length).join('/')} footprints), ` +
  `${D.CONTRACTS.length} contracts, ${D.MILESTONES.length} milestones (all with tickers), ${D.EVENTS.length} events, ${D.INCIDENTS.length} incidents, ${D.TICKER.length} ticker lines`);
