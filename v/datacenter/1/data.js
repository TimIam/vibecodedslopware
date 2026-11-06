// data.js — every table in DESIGN.md §3-§10, plus the id and shape rules of §14.1 and §16.
// Data only: the few functions at the bottom are pure generators for the footprint and lane arrays.
//
// Units: money $, power and heat kW, network Gbps, time s, distance m. Colours are 0xRRGGBB numbers.
// Every id is the GLB object name the scene instantiates (§14.1): srv_* pwr_* cool_* net_* stage_*
// con_* ms_* eff_* mit_* ev_* inc_*. Stage numbers are 1..5 (Garage, Colo, Warehouse, Hall, Campus).

export const SAVE_KEY = 'uptime_v1';
export const SIM_HZ = 10;
export const RACK_SLOTS = 8;
export const HUSTLE = 1;             // $ per Hustle tap (garage only)
export const REFRESH_REFUND = 0.25;  // of the removed tier's base price
export const TIER_VISIBLE_FRAC = 0.25; // tier shows (greyed) when max(run valuation, cash) >= 25% of base

export const START = { cash: 50, uptime: 100, racks: 1, stage: 1 };
export const START_CAPACITY = { power: 3, cooling: 1.5, network: 1 }; // wall outlet, garage door open, consumer router

// §2 one definition of the meter colours, used everywhere.
export const METER = { amber: 0.80, red: 1.00 };

// §2 efficiency = min(ratioP, ratioC, ratioN, 1) ^ EFFICIENCY_EXP with ratio_m = 1 / u_m, so 10% over on one meter
// costs 15% of income. Hall brightness and the "dimmed to N%" line both show this one number.
export const EFFICIENCY_EXP = 1.5;

// §2 uptime. uptimeMult = floor + (1 - floor) * (uptime/100)^2. While any meter is red: falls (1 - efficiency) * fallK
// per s. While any rack is dark: falls darkFall per dark rack (at most darkFallMax) and does not recover. Else +recover/s.
export const UPTIME = { start: 100, floor: 0.5, recover: 1.0, fallK: 1.0, darkFall: 0.25, darkFallMax: 1.0 };

// ---------------------------------------------------------------------------------------------
// §3 servers. payback is display only (base / inc). stresses is HUD copy.
export const LED_FAMILIES = {
  compute: { name: 'compute', colors: [0x58ff9a, 0x45e6ff] },
  data:    { name: 'data',    colors: [0xcfe9ff] },
  ai:      { name: 'AI',      colors: [0xff9b3d, 0xffd166] },
  exotic:  { name: 'exotic',  colors: [0xff5fd2, 0xd8d0ff] },
};

export const TIERS = [
  { id: 'srv_pizza_box', name: 'Pizza Box', base: 15, inc: 0.10, kw: 0.25, gbps: 0.05, growth: 1.07, payback: 150, stage: 1,
    led: { color: 0x58ff9a, family: 'compute' }, stresses: 'space', upgradeName: 'Pizza Box firmware',
    flavor: 'Dell R610. Has a dent. Fans sound like grief.' },
  { id: 'srv_blade', name: 'Blade', base: 100, inc: 0.9, kw: 1.5, gbps: 0.4, growth: 1.07, payback: 111, stage: 1, needBoxes: 6,
    led: { color: 0x45e6ff, family: 'compute' }, stresses: 'power', upgradeName: 'Blade BIOS mod',
    flavor: 'Sixteen computers pretending to be one.' },
  { id: 'srv_gpu_node', name: 'GPU Node', base: 1300, inc: 4.3, kw: 6, gbps: 1.5, growth: 1.10, payback: 302, stage: 2,
    led: { color: 0xcfe9ff, family: 'data' }, stresses: 'cooling', upgradeName: 'GPU undervolt (ironic)',
    flavor: 'It is 40% fans by weight.' },
  { id: 'srv_storage', name: 'Storage Array', base: 14000, inc: 28, kw: 8, gbps: 25, growth: 1.10, payback: 500, stage: 2,
    led: { color: 0xcfe9ff, family: 'data' }, stresses: 'network', upgradeName: 'Dedupe',
    flavor: "Everyone's photos. All of them." },
  { id: 'srv_ai_pod', name: 'AI Pod', base: 160000, inc: 160, kw: 40, gbps: 60, growth: 1.12, payback: 1000, stage: 3,
    led: { color: 0xff9b3d, family: 'ai' }, stresses: 'power + cooling', upgradeName: 'Pod liquid loop',
    flavor: 'Arrives on a truck, pre-blinking.' },
  { id: 'srv_sled', name: 'Hyperscale Sled', base: 1.9e6, inc: 760, kw: 120, gbps: 300, growth: 1.12, payback: 2500, stage: 4,
    led: { color: 0xffd166, family: 'ai' }, stresses: 'network', upgradeName: 'Sled photonics',
    flavor: 'You no longer buy servers. You buy weather.' },
  { id: 'srv_quantum', name: 'Quantum Annealer', base: 24e6, inc: 4000, kw: 300, gbps: 500, growth: 1.12, payback: 6000, stage: 4,
    led: { color: 0xff5fd2, family: 'exotic' }, stresses: 'cooling', upgradeName: 'Annealer recalibration',
    flavor: 'Colder than space. Warmer than the budget.' },
  { id: 'srv_orbital', name: 'Orbital Node', base: 300e6, inc: 20000, kw: 800, gbps: 2000, growth: 1.12, payback: 15000, stage: 5,
    led: { color: 0xd8d0ff, family: 'exotic' }, stresses: 'everything', upgradeName: 'Orbital laser link',
    flavor: 'Latency: one sky.' },
];

// §3 per-tier upgrades at 10/25/50/100/200 owned: x2 output, draw x1.3, cost = base * costMult[level].
export const UPGRADES = {
  thresholds: [10, 25, 50, 100, 200],
  costMult: [15, 75, 500, 1e4, 1e7],
  outputMult: 2,
  drawMult: 1.3,
  names: Object.fromEntries(TIERS.map(t => [t.id, t.upgradeName])),
};

// ---------------------------------------------------------------------------------------------
// §4 infrastructure. cap adds to its meter; draw is the kW a cooling unit pulls from power (0 otherwise).
// Garage items keep their caps (max) and growth; everything from the Colo on grows at 1.15.
// lane: where the unit stands (power = left wall, cooling = back wall, network = right wall, yard = outside the
// back wall). mount overrides the lane for rack-mounted gear. needsTier gates the row on one owned server.
// genset: true marks capacity that counts toward ev_grid_flicker's "gensets >= 20% of power capacity" defuse.
const G = 1.15;
export const INFRA = [
  // power
  { id: 'pwr_pdu', name: 'PDU', meter: 'power', cap: 4, draw: 0, base: 60, growth: 1.25, max: 6, stage: 1, lane: 'power', mount: 'rackSide',
    flavor: 'A metal strip of outlets with opinions.' },
  { id: 'pwr_subpanel', name: 'Subpanel', meter: 'power', cap: 12, draw: 0, base: 250, growth: 1.3, max: 3, stage: 1, lane: 'power',
    flavor: 'An electrician named Gus.' },
  { id: 'pwr_genset', name: 'Diesel Genset', meter: 'power', cap: 60, draw: 0, base: 3000, growth: G, stage: 2, lane: 'yard', genset: true,
    flavor: 'Yellow, loud, and legally a vehicle.' },
  { id: 'pwr_substation', name: 'Substation', meter: 'power', cap: 500, draw: 0, base: 400e3, growth: G, stage: 3, lane: 'yard',
    flavor: 'Has its own fence. The fence has its own sign.' },
  { id: 'pwr_hv_feed', name: 'HV Feed', meter: 'power', cap: 2000, draw: 0, base: 4.5e6, growth: G, stage: 4, lane: 'yard',
    flavor: 'The utility sent a man in a helmet to look at it and nod.' },
  { id: 'pwr_smr', name: 'SMR Reactor', meter: 'power', cap: 10000, draw: 0, base: 750e6, growth: G, stage: 5, lane: 'yard',
    flavor: 'The paperwork is the hard part. The uranium is easy.' },
  // cooling
  { id: 'cool_box_fan', name: 'Box Fan', meter: 'cooling', cap: 3, draw: 0.3, base: 30, growth: 1.25, max: 6, stage: 1, lane: 'cooling',
    flavor: 'Oscillates. Mostly toward the rack.' },
  { id: 'cool_window_ac', name: 'Window AC', meter: 'cooling', cap: 8, draw: 1.5, base: 160, growth: 1.3, max: 3, stage: 1, lane: 'cooling',
    flavor: 'Drips on Rack 2. Rack 2 is fine. Probably.' },
  { id: 'cool_split_ac', name: 'Split AC', meter: 'cooling', cap: 60, draw: 15, base: 3000, growth: G, stage: 2, lane: 'cooling',
    flavor: 'The outdoor half is inside. The landlord has questions.' },
  { id: 'cool_crac', name: 'CRAC', meter: 'cooling', cap: 500, draw: 125, base: 350e3, growth: G, stage: 3, lane: 'cooling',
    flavor: 'Sounds like the sea. A sea that bills monthly.' },
  { id: 'cool_chiller', name: 'Chiller Plant', meter: 'cooling', cap: 2000, draw: 400, base: 8e6, growth: G, stage: 4, lane: 'yard',
    flavor: 'Moves heat from where it is to where it is someone else’s problem.' },
  { id: 'cool_cryo', name: 'Cryo Plant', meter: 'cooling', cap: 8000, draw: 2000, base: 120e6, growth: G, stage: 4, lane: 'yard', needsTier: 'srv_quantum',
    flavor: 'Helium so cold it has stopped arguing.' },
  { id: 'cool_immersion', name: 'Immersion Farm', meter: 'cooling', cap: 10000, draw: 1000, base: 600e6, growth: G, stage: 5, lane: 'cooling',
    flavor: 'The servers are in oil now. They seem calmer.' },
  // network
  { id: 'net_switch', name: 'Switch', meter: 'network', cap: 2, draw: 0, base: 30, growth: 1.25, max: 6, stage: 1, lane: 'network', mount: 'rackTop',
    flavor: 'Eight ports. Seven work.' },
  { id: 'net_biz_fiber', name: 'Business Fiber', meter: 'network', cap: 10, draw: 0, base: 500, growth: 1.3, max: 3, stage: 1, lane: 'network',
    flavor: 'Business-class fiber. The business is you. The class is unclear.' },
  { id: 'net_fiber_uplink', name: 'Fiber Uplink', meter: 'network', cap: 100, draw: 0, base: 10000, growth: G, stage: 2, lane: 'network',
    flavor: 'A cabinet with one very important cable.' },
  { id: 'net_core_router', name: 'Core Router', meter: 'network', cap: 800, draw: 0, base: 300e3, growth: G, stage: 3, lane: 'network',
    flavor: 'Costs more than the building it is in.' },
  { id: 'net_ix_port', name: 'IX Port', meter: 'network', cap: 4000, draw: 0, base: 6e6, growth: G, stage: 4, lane: 'network',
    flavor: 'Four terabits of other people’s business.' },
  { id: 'net_cable_landing', name: 'Cable Landing', meter: 'network', cap: 25000, draw: 0, base: 450e6, growth: G, stage: 5, lane: 'network',
    flavor: 'Your cable has a name now. It is Marjorie.' },
];

// §4 efficiency upgrades change the math, not the income. target: heat | coolingDraw | net | coolingCap.
export const EFFICIENCY = [
  { id: 'eff_containment', name: 'Hot/cold containment', cost: 1000, stage: 2, effect: { target: 'heat', factor: 0.85 },
    flavor: 'Plastic curtains. Surprisingly effective. Surprisingly loud.' },
  { id: 'eff_vsd', name: 'Variable-speed fans', cost: 25000, stage: 3, effect: { target: 'coolingDraw', factor: 0.6 },
    flavor: 'The fans now slow down when nobody is hot. Revolutionary.' },
  { id: 'eff_compression', name: 'Compression', cost: 400000, stage: 4, effect: { target: 'net', factor: 0.8 },
    flavor: 'Same cats, fewer bits.' },
  { id: 'eff_economizer', name: 'Free-air economizer', cost: 5e6, stage: 4, effect: { target: 'coolingCap', factor: 1.25 },
    flavor: 'Opens a very large window when it is cold outside.' },
];

// §4 mitigations: one-off, each defuses one event (or, for Spares, speeds up hardware incidents).
export const MITIGATIONS = [
  { id: 'mit_ups', name: 'UPS', cost: 8000, stage: 2, defuses: 'ev_grid_flicker', flavor: 'A very heavy battery with a very small screen.' },
  { id: 'mit_dual_carrier', name: 'Dual-carrier', cost: 30000, stage: 3, defuses: 'ev_fiber_cut', flavor: 'Two backhoes would be needed now.' },
  { id: 'mit_scrubbing', name: 'Scrubbing', cost: 60000, stage: 3, defuses: 'ev_ddos', flavor: 'Someone else’s computers absorb the angry packets.' },
  { id: 'mit_spares', name: 'Spares closet', cost: 40000, stage: 3, defuses: null, hardwareResolveS: 5, flavor: 'One of everything. Two of nothing you need.' },
];

// §4 staff: incidents auto-resolve after max(autoMin, autoBase - autoPer * n) s; auto-fixes pay no tap bounty.
export const STAFF_RULES = { max: 5, autoBase: 20, autoPer: 4, autoMin: 2 };
export const STAFF = [
  { n: 1, name: 'Dale, your cousin', cost: 5000, stage: 2, flavor: 'He has a van.' },
  { n: 2, name: 'Night-shift tech', cost: 15000, stage: 2, flavor: 'Has a podcast. It is about the night shift.' },
  { n: 3, name: 'NOC engineer', cost: 45000, stage: 3, flavor: 'Owns four monitors and a posture.' },
  { n: 4, name: 'SRE', cost: 135000, stage: 3, flavor: 'Carries a pager ironically. It goes off sincerely.' },
  { n: 5, name: 'Site Reliability Priest', cost: 405000, stage: 3, flavor: 'Blesses the deploys. The deploys are fine now.' },
];

// ---------------------------------------------------------------------------------------------
// §5 stages. Layout convention (three.js, y up, camera at +Z):
//   - footprints[i] = [x, z, rotY] in reading order: front row first (largest z, nearest the camera), left to right
//     (x ascending). Rack pitch 0.8 m along a row (x); rows 2.4 m apart (z), centred on the origin.
//   - rotY 0 = the rack front faces +Z (toward the camera); rotY Math.PI = faces -Z.
//   - The front row (row 0) ALWAYS faces the camera, in every stage, so the nearest racks show their LEDs and the
//     garage racks keep their facing when they are carried into the Colo (§12: "your four racks, now white, in
//     footprints 0-3 and eight dark outlines behind them"). Facing alternates from the front: row 1 faces -Z, row 2
//     +Z, ... so rows 1&2 face each other across a cold aisle, rows 3&4 the next, and so on. With an even row count
//     the back row faces the back wall and shows only its back panel.
//   - aisles[] names the gap between consecutive rows: 'cold' (both fronts face it) or 'hot' (both backs). Aisle 0
//     (between rows 0 and 1) is therefore always hot, aisle 1 cold, alternating from there.
//     The hot side of any rack is behind it: at smaller z for rotY 0, larger z for rotY PI.
//   - size {w, d} is the hall interior (x extent, z extent) centred on the origin; the back wall is at z = -d/2.
//   - lanes: power along the left wall (x < 0, units face +X: rotY PI/2), cooling along the back wall (face +Z),
//     network along the right wall (face -X: rotY -PI/2), yard outside the back wall (z < -d/2, face +Z). The yard
//     is outside the glass / back door, so its span may exceed the hall width and does from the Colo on.
//     Each lane has exactly maxVisible spots; infra fills them in order and badges "xN" past the cap.
//   - lanePitch[lane] is the spot-to-spot distance in metres (span / (maxVisible - 1)). A unit's footprint along the
//     lane axis must fit in lanePitch * LANE_FIT: build_assets.py sizes each shared-mesh variant (net_ix_port x2.0,
//     net_cable_landing x2.5, cool_chiller x2.0, cool_cryo x3.0, pwr_hv_feed x1.6) for the smallest pitch it can
//     appear in, and scene.js scales a unit down uniformly if it would still overlap its neighbour. Tightest spots:
//     the Hall's side lanes at 0.93 m (so a network cabinet base is <= 0.42 m wide), yards >= 2.0 m from the Colo on.
//   - move is the cost to ENTER this stage (0 = the start stage): the Hall move is STAGES[3].move, paid while in the
//     Warehouse. carried = racks that arrive with the move (the garage's one free rack counts); toBuy = footprints -
//     carried. rackToast is keyed by the FOOTPRINT INDEX of the rack just bought: 2 = the garage's third rack ($43).
//     The Civic toast does not repeat §5's "two footprints appear": the garage is 1 x 4 and every unbought footprint
//     is outlined from boot, so after Rack 3 exactly one footprint is left; the beat is the car leaving.
const PITCH_X = 0.8, PITCH_Z = 2.4;
export const LANE_FIT = 0.9; // unit footprint along the lane axis <= lanePitch * LANE_FIT
const r3 = n => Math.round(n * 1000) / 1000;
const rowFacing = row => (row % 2 === 0) ? 0 : Math.PI;

function footprints(rows, cols) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push([r3((c - (cols - 1) / 2) * PITCH_X), r3(((rows - 1) / 2 - r) * PITCH_Z), rowFacing(r)]);
  }
  return out;
}

function aisles(rows) {
  const out = [];
  for (let r = 0; r + 1 < rows; r++) {
    // row r sits at larger z than row r+1; the aisle between them is cold when r faces -Z and r+1 faces +Z
    const cold = rowFacing(r) === Math.PI && rowFacing(r + 1) === 0;
    out.push({ z: r3(((rows - 1) / 2 - r - 0.5) * PITCH_Z), kind: cold ? 'cold' : 'hot' });
  }
  return out;
}

// n spots evenly spread over [-span/2, span/2] along `axis` ('x' or 'z'), the other coordinate fixed.
function line(n, axis, fixed, span, rotY) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * span;
    out.push(axis === 'x' ? [r3(t), r3(fixed), rotY] : [r3(fixed), r3(t), rotY]);
  }
  return out;
}

function lanes(n, { sideX, sideSpan, backZ, backSpan, yardZ, yardSpan }) {
  return {
    power: line(n, 'z', -sideX, sideSpan, Math.PI / 2),
    cooling: line(n, 'x', backZ, backSpan, 0),
    network: line(n, 'z', sideX, sideSpan, -Math.PI / 2),
    yard: line(n, 'x', yardZ, yardSpan, 0),
  };
}

const pitchOf = (n, span) => (n > 1 ? r3(span / (n - 1)) : span);
function lanePitch(n, { sideSpan, backSpan, yardSpan }) {
  return { power: pitchOf(n, sideSpan), cooling: pitchOf(n, backSpan), network: pitchOf(n, sideSpan), yard: pitchOf(n, yardSpan) };
}

function stage(n, { geo, ...def }) {
  const fp = footprints(def.rows, def.cols);
  return {
    ...def,
    stage: n, footprints: fp, aisles: aisles(def.rows), toBuy: fp.length - def.carried,
    lanes: lanes(def.maxVisible, geo), lanePitch: lanePitch(def.maxVisible, geo), shell: `stage_${n}.glb`,
  };
}

// keyColor / keyIntensity drive the stage key light (§15: one warm key per stage). Stages with white racks keep the key
// desaturated (min/max channel >= 0.45) so the racks read white: the Hall's saturated aisle blue lives in the shell's strip
// material and PALETTE.coldAisle, not in the key, or every rack, tile and wall turns one blue. The garage bulb is a PointLight
// (candela), the others are DirectionalLights, hence the 16 vs ~1.5.
// Garage rack steel. §15 says #1b1f27, but under the bulb and a #0b0e14 hemisphere ground that steel rendered as pure black
// (review: the front posts sampled rgb(0,0,0) against a (38,30,22) floor), so the §12 opening faded up on a silhouette.
// Lifted to a dark grey that still reads as black steel next to the white Colo racks; PALETTE.rackGarage is the same value.
const RACK_GARAGE = 0x343a46;
export const STAGES = [
  stage(1, { id: 'stage_garage', name: 'Garage', short: 'Garage', rows: 1, cols: 4, carried: 1, move: 0, rackBase: 40, rackGrowth: 1.08,
    slots: 1, maxVisible: 6, fog: 0.02, keyColor: 0xffd9a8, keyIntensity: 16, keyLight: 'bulb', rackColor: RACK_GARAGE,
    size: { w: 7, d: 6 }, geo: { sideX: 2.9, sideSpan: 4.0, backZ: -2.4, backSpan: 4.0, yardZ: -4.2, yardSpan: 4.0 },
    unlocks: ['srv_pizza_box', 'srv_blade', 'pwr_pdu', 'cool_box_fan', 'net_switch', 'pwr_subpanel', 'cool_window_ac', 'net_biz_fiber'],
    moveToast: null, rackToast: { 2: 'Sell the Civic. 212,000 miles. The driveway is yours.' } }),
  stage(2, { id: 'stage_colo', name: 'Strip-mall Colo, Cage 104', short: 'Colo', rows: 2, cols: 6, carried: 4, move: 2000, rackBase: 300, rackGrowth: 1.08,
    slots: 1, maxVisible: 8, fog: 0.012, keyColor: 0xcfe3ff, keyIntensity: 1.6, keyLight: 'fluorescents', rackColor: 0xd8dcdf,
    size: { w: 10, d: 9 }, geo: { sideX: 4.2, sideSpan: 7.0, backZ: -3.9, backSpan: 7.0, yardZ: -6.0, yardSpan: 14.0 },
    unlocks: ['srv_gpu_node', 'srv_storage', 'pwr_genset', 'cool_split_ac', 'net_fiber_uplink', 'eff_containment', 'mit_ups', 'staff'],
    moveToast: "Mom's not paying the power bill any more." }),
  stage(3, { id: 'stage_warehouse', name: 'Warehouse', short: 'Warehouse', rows: 3, cols: 12, carried: 12, move: 300e3, rackBase: 10e3, rackGrowth: 1.06,
    slots: 2, maxVisible: 12, fog: 0.006, keyColor: 0xfff3e6, keyIntensity: 1.6, keyLight: 'highbays', rackColor: 0xd8dcdf,
    size: { w: 18, d: 13 }, geo: { sideX: 8.0, sideSpan: 11.0, backZ: -5.8, backSpan: 14.0, yardZ: -8.5, yardSpan: 22.0 },
    unlocks: ['srv_ai_pod', 'pwr_substation', 'cool_crac', 'net_core_router', 'eff_vsd', 'mit_dual_carrier', 'mit_scrubbing', 'mit_spares'],
    moveToast: 'The forklift is yours now. So is the forklift’s insurance.' }),
  stage(4, { id: 'stage_hall', name: 'Purpose-built Hall', short: 'Hall', rows: 4, cols: 24, carried: 36, move: 20e6, rackBase: 250e3, rackGrowth: 1.05,
    slots: 2, maxVisible: 16, fog: 0.003, keyColor: 0xb8c4ff, keyIntensity: 1.3, keyLight: 'aisle strips', rackColor: 0xd8dcdf,
    size: { w: 26, d: 16 }, geo: { sideX: 11.8, sideSpan: 14.0, backZ: -7.2, backSpan: 22.0, yardZ: -10.5, yardSpan: 40.0 },
    unlocks: ['srv_sled', 'srv_quantum', 'pwr_hv_feed', 'cool_chiller', 'cool_cryo', 'net_ix_port', 'eff_compression', 'eff_economizer'],
    moveToast: 'Raised floor. Something now lives under it.' }),
  stage(5, { id: 'stage_campus', name: 'Campus, Hall A', short: 'Campus', rows: 6, cols: 40, carried: 96, move: 2e9, rackBase: 10e6, rackGrowth: 1.04,
    slots: 3, maxVisible: 20, fog: 0.0015, keyColor: 0x9fb4ff, keyIntensity: 1.6, keyLight: 'moonlight', rackColor: 0xd8dcdf,
    size: { w: 40, d: 22 }, geo: { sideX: 18.5, sideSpan: 19.0, backZ: -9.8, backSpan: 34.0, yardZ: -14.0, yardSpan: 56.0 },
    unlocks: ['srv_orbital', 'pwr_smr', 'cool_immersion', 'net_cable_landing'],
    moveToast: 'The garage is a monument now. Interns photograph it.' }),
];

// ---------------------------------------------------------------------------------------------
// §6 global upgrades: one per decade of run valuation, x1.25 income, cost = 60% of the threshold.
const GLOBAL_NAMES = ['Blanking panels', 'Cable management', 'Hot/cold aisle discipline', 'Monitoring stack', 'Containerization',
  'Spot market', 'Custom silicon', 'Edge PoPs', 'Sovereign cloud deals', 'Model hosting', 'Carbon credits', 'Orbital uplink',
  'Time-share compute', 'Everything-as-a-service', 'Post-scarcity compute'];
export const GLOBAL_COST_FRAC = 0.6;
export const GLOBALS = GLOBAL_NAMES.map((name, i) => ({
  id: `glb_${i + 1}`, name, threshold: 10 ** (i + 3), cost: GLOBAL_COST_FRAC * 10 ** (i + 3), mult: 1.25,
  flavor: i === 1 ? 'Zip ties are a love language.' : null,
}));

// ---------------------------------------------------------------------------------------------
// §7 contracts. Income multipliers stack additively (1 + sum(mult - 1)); per-meter demand factors multiply.
// sla: null or the uptime bar below which the contract pays base (contributes 0 to the sum). term is seconds of
// active play. needs gates the offer on owned servers of one tier.
// unlockRack: the board opens once the player OWNS this many racks (Rack 2 dropping in at ~3:10, §12); it is a count,
// not a footprint index.
// stresses: the meters ('power' | 'cooling' | 'network') whose demand factor is > 1, largest factor first (ties keep
// power, cooling, network order); [] for a contract that stresses nothing (Uncle Ray, County, the Ministry). Derived
// from the factors, so the §7 board rule ("at least one offer stresses a meter with headroom, u < headroomU") has
// one source: offer.stresses.some(m => u[m] < CONTRACT_RULES.headroomU).
// rerollMin: the manual reroll's cash floor (30 s of income otherwise), so a dark hall cannot fish for contracts for free.
export const CONTRACT_RULES = { unlockRack: 2, boardSize: 3, rerollEvery: 300, rerollCostSec: 30, rerollMin: 5, term: 600, headroomU: 0.80 };
const FACTOR_METER = { power: 'power', heat: 'cooling', net: 'network' };
const stressesOf = c => Object.entries(FACTOR_METER).filter(([k]) => c[k] > 1).sort((a, b) => c[b[0]] - c[a[0]]).map(([, m]) => m);
export const CONTRACTS = [
  { id: 'con_uncle_ray', name: "Uncle Ray's Dental", mult: 1.15, power: 1.0, heat: 1.0, net: 1.0, sla: null, stage: 1, term: 600,
    line: 'Two CU. He says the site is snappier. You did nothing.', expireToast: "Uncle Ray's term is up. He says thanks." },
  { id: 'con_minecraft', name: "Dave's Minecraft (11 boys)", mult: 1.3, power: 1.0, heat: 1.0, net: 1.5, sla: null, stage: 1, term: 600,
    line: 'They will DDoS each other.' },
  { id: 'con_frobcoin', name: 'FrobCoin', mult: 1.5, power: 1.2, heat: 1.4, net: 0.5, sla: null, stage: 1, term: 600,
    line: 'He is loud.' },
  { id: 'con_county', name: 'County Records Office', mult: 1.2, power: 0.8, heat: 0.8, net: 0.8, sla: 99, stage: 2, term: 600,
    line: 'Nothing ever happens. That is the contract.' },
  { id: 'con_cattube', name: 'CatTube', mult: 1.8, power: 1.0, heat: 1.0, net: 2.5, sla: 97, stage: 2, term: 600,
    line: 'Ninety percent of the internet is this.' },
  { id: 'con_weatherbot', name: 'Weatherbot ML', mult: 2.2, power: 1.3, heat: 1.3, net: 0.7, sla: 98, stage: 3, term: 600,
    line: 'Series B, burning.' },
  { id: 'con_black_friday', name: 'Black Friday burst', mult: 3.0, power: 1.2, heat: 1.2, net: 3.0, sla: null, stage: 3, term: 180,
    line: 'Twenty times your traffic, once.' },
  { id: 'con_halcyon', name: 'Halcyon Labs training run', mult: 3.0, power: 1.5, heat: 1.5, net: 0.5, sla: 98, stage: 4, term: 600,
    needs: { tier: 'srv_ai_pod', n: 10 }, line: "Pays in cash and 'equity'." },
  { id: 'con_hyperscaler', name: 'Hyperscaler overflow', mult: 2.0, power: 1.1, heat: 1.1, net: 2.0, sla: 99, stage: 4, term: 600,
    line: 'They call it partner capacity.' },
  { id: 'con_ministry', name: 'A Ministry (unspecified)', mult: 2.5, power: 1.0, heat: 1.0, net: 0.6, sla: 99.9, stage: 5, term: 600,
    line: 'They asked for a room with no windows. You have those.' },
].map(c => ({ ...c, stresses: stressesOf(c) }));

// ---------------------------------------------------------------------------------------------
// §8 incidents: one random lit rack goes amber; tap within tapWindow for max(bountyMin, bountySec * income).
// texts use {rack} for the 1-based rack number. inc_unplugged swaps to lateTexts from the Colo on.
export const INCIDENT_RULES = { start: 180, minGap: 60, maxGap: 120, tapWindow: 20, bountySec: 20, bountyMin: 5, maxOutstanding: 3,
  badgeBountyFrac: 0.5, flashHz: 2 }; // the three incidents waiting after an offline return: OFFLINE.returnIncidents
export const INCIDENTS = [
  { id: 'inc_disk', name: 'Disk failing', hardware: true, stage: { min: 1, max: 5 },
    texts: ['A disk in Rack {rack} is failing. Loudly.', 'SMART says the disk in Rack {rack} is fine. SMART is lying.'] },
  { id: 'inc_fan', name: 'Fan seized', hardware: true, stage: { min: 1, max: 5 },
    texts: ['A fan in Rack {rack} has seized. The others are compensating emotionally.', 'Fan 3 in Rack {rack} has stopped. Fan 3 was the good one.'] },
  { id: 'inc_cert', name: 'Cert expired', hardware: false, stage: { min: 1, max: 5 },
    texts: ['The certificate on Rack {rack} expired. It was set to expire. Nobody set a reminder.', 'TLS cert expired on Rack {rack}. Browsers are being dramatic about it.'] },
  { id: 'inc_firmware_tuesday', name: 'Firmware Tuesday', hardware: false, stage: { min: 1, max: 5 },
    texts: ['Firmware Tuesday. Rack {rack} is updating itself without consent.', 'A firmware update has made Rack {rack} a different rack.'] },
  { id: 'inc_unplugged', name: 'Unplugged', hardware: true, stage: { min: 1, max: 5 },
    texts: ['Mom unplugged Rack {rack} to vacuum.', 'Mom needed the outlet. Rack {rack} did not get a vote.'],
    lateTexts: ['The cleaner unplugged Rack {rack}.', 'A floor polisher is now using Rack {rack}’s outlet.'] },
  { id: 'inc_raccoon', name: 'Raccoon in the generator', hardware: true, stage: { min: 2, max: 5 },
    texts: ['A raccoon is in the generator. Rack {rack} is on the raccoon’s circuit.', 'The raccoon is back. It has brought a friend. Rack {rack} browned out.'] },
  { id: 'inc_wrong_rack', name: 'Wrong rack rebooted', hardware: true, stage: { min: 2, max: 2 },
    texts: ["The colo's tech rebooted the wrong rack. It was Rack {rack}.", 'The colo’s tech says Rack {rack} "looked like it needed it."'] },
  { id: 'inc_halcyon', name: "Halcyon's run went weird", hardware: false, stage: { min: 4, max: 5 },
    texts: ["Halcyon's run went weird on Rack {rack}. They call it emergent.", 'Rack {rack} is printing poetry. Halcyon says do not read it.'] },
];

// §8 events: one every minGap..maxGap s of active play, Colo onward (the breaker is scripted, garage only).
// effect.target: capacity | demand | income; effect.meter for capacity/demand. mitigation defuses the event.
// ev_ddos.scrubTarget is the unit that pulses red and takes the handScrub taps: the newest owned unit of that id.
// Before the first uplink (the Colo opens at ~11:00, the first net_fiber_uplink lands ~18:00) scrubFallback
// 'newestNetworkUnit' means the newest network-meter unit of any kind (a rack-top net_switch counts); with none owned
// the event toast's Fix button is the only hand scrub. scene.pick() raycasts that one unit besides the rack frames.
export const EVENT_RULES = { minGap: 240, maxGap: 360, minStage: 2 }; // the event toast's ring shows the time left of the whole event
export const EVENTS = [
  { id: 'ev_heatwave', name: 'Heatwave', duration: 120, effect: { meter: 'cooling', target: 'capacity', factor: 0.7 }, mitigation: null,
    tint: 0x3a1a08, text: 'Heatwave. The outside air is no longer on your side.', ticker: 'Record heat. The racks have noticed.' },
  { id: 'ev_grid_flicker', name: 'Grid flicker', duration: 60, effect: { meter: 'power', target: 'capacity', factor: 0.8 }, mitigation: 'mit_ups',
    altMitigation: { gensetShare: 0.2, toast: 'Generators kicked in.', uptimeBonus: 2 },
    text: 'Grid flicker. Something upstream sneezed.', ticker: 'Utility blames "a squirrel." The squirrel has not commented.' },
  { id: 'ev_fiber_cut', name: 'Fiber cut', duration: 45, effect: { meter: 'network', target: 'capacity', factor: 0.5 }, mitigation: 'mit_dual_carrier',
    text: 'Fiber cut. A backhoe found your cable.', ticker: 'Backhoe operator "did not see the flags." There were nine flags.' },
  { id: 'ev_ddos', name: 'DDoS', duration: 60, effect: { meter: 'network', target: 'demand', factor: 3 }, mitigation: 'mit_scrubbing',
    handScrub: { taps: 5 }, scrubTarget: 'net_fiber_uplink', scrubFallback: 'newestNetworkUnit',
    text: 'DDoS. The uplink cabinet is pulsing red. Tap it to scrub by hand.',
    ticker: 'Botnet targets you. Botnet is 11 boys and a Raspberry Pi.' },
  { id: 'ev_viral', name: 'Viral customer', duration: 90, effect: { meter: 'network', target: 'demand', factor: 2 }, mitigation: null,
    headroomBonus: { income: 1.5 }, text: 'A customer went viral. Network demand doubled.',
    ticker: 'Your customer is trending. Your switch is sweating.' },
  { id: 'ev_ai_boom', name: 'AI boom', duration: 180, effect: { meter: null, target: 'income', factor: 1.5 }, mitigation: null,
    text: 'AI boom. Everyone wants compute and nobody asks what for.', ticker: 'AI boom: investors buy anything with fans.' },
  { id: 'ev_crypto_bust', name: 'Crypto bust', duration: 180, effect: { meter: null, target: 'income', factor: 0.7 }, mitigation: null,
    text: 'Crypto bust. FrobCoin is now a lesson.', ticker: 'FrobCoin delisted. FrobCoin relisted. FrobCoin delisted.' },
  { id: 'ev_investor_visit', name: 'Investor visit', duration: 60, effect: { meter: null, target: 'income', factor: 3 }, mitigation: null,
    requires: { uptimeMin: 99 }, orbitS: 10, text: 'An investor is touring the hall. Look busy.',
    ticker: 'Investor "impressed by the lights." Term sheet pending.' },
  { id: 'ev_breaker', name: 'The breaker', duration: 5, effect: { meter: 'power', target: 'blackout', factor: 0 }, mitigation: null,
    scripted: true, stage: 1, once: true, trigger: 'powerDemand > powerCapacity', flag: 'breakerSeen',
    text: 'Breaker. Just the one; from here on, overdraw dims instead of trips.', ticker: 'Garage goes dark. Mother "not surprised."' },
];

// ---------------------------------------------------------------------------------------------
// §9 milestones: +1% income each, account level, card shown once. In §9 order, then the counters.
// ticker is the §18 reaction headline (UPPERCASE, one line) the ui feeds to the ticker when the card fires; the ui
// falls back to name.toUpperCase() for a milestone without one (every row below has one). fx / screenshot /
// softEnding mark the two big §9 beats.
// cond is one of this closed set (the sim evaluates it against state and sim.derived). Every type in
// MILESTONE_COND_TYPES is used by at least one milestone (data_check enforces it), so there are no dead evaluators:
//   {type:'servers', n}            servers currently installed in the run >= n (installed count, not run-lifetime `bought`)
//   {type:'tier', id, n}           servers of tier id currently installed >= n (econ_sim's used(S) count; Refresh lowers it)
//   {type:'incidents', n}          lifetime incidents fixed >= n
//   {type:'contracts', n}          lifetime contracts taken >= n
//   {type:'valuation', n}          run valuation >= n
//   {type:'stage', n}              run stage >= n
//   {type:'racks', n}              racks owned in the run >= n
//   {type:'rackFull', rack}        rack index `rack` has all 8 slots filled
//   {type:'allRacksFull', stage}   every footprint of stage `stage` is bought and full
//   {type:'noRedFor', s}           no meter red for s seconds of active play
//   {type:'uptimeFor', min, s}     uptime >= min for s seconds of active play
//   {type:'infra', id, n}          infra units of id owned >= n
//   {type:'exits', n}              lifetime exits >= n
//   {type:'staff', n}              staff hired >= n
//   {type:'meterAmber', meter}     that meter's u >= METER.amber at least once
//   {type:'breaker'}               the garage breaker fired
//   {type:'refresh'}               first Refresh performed
//   {type:'power', kw}             power capacity >= kw
export const MILESTONE_COND_TYPES = ['servers', 'tier', 'incidents', 'contracts', 'valuation', 'stage', 'racks', 'rackFull', 'allRacksFull',
  'noRedFor', 'uptimeFor', 'infra', 'exits', 'staff', 'meterAmber', 'breaker', 'refresh', 'power'];
export const MILESTONE_BONUS = 0.01;
const ms = (id, name, text, ticker, cond, extra) => ({ id, name, text, ticker, bonus: MILESTONE_BONUS, cond, ...extra });
export const MILESTONES = [
  ms('ms_lights_on', 'Lights On', 'One server. It is doing something. Probably.',
    'LOCAL GARAGE HUMS. NEIGHBOURS SUSPECT CRYPTO', { type: 'servers', n: 1 }),
  ms('ms_its_getting_warm_in_here', "It's Getting Warm In Here", 'Cooling is amber. The garage door is open. It is not enough.',
    'GARAGE REACHES "COSY." SERVERS DISAGREE', { type: 'meterAmber', meter: 'cooling' }),
  ms('ms_buy_a_fan', 'Buy a Fan', 'Three kilowatts of moving air, 0.3 kW of guilt.',
    'MAN BUYS FAN, CALLS IT "COOLING INFRASTRUCTURE"', { type: 'infra', id: 'cool_box_fan', n: 1 }),
  ms('ms_just_the_one', 'Just the One', 'You tripped the breaker. From here on, overdraw dims instead of trips.',
    'BREAKER TRIPS. LOCAL MAN LEARNS WHAT A KILOWATT IS', { type: 'breaker' }),
  ms('ms_first_gigabit', 'First Gigabit', "The installer asked what the rack was for. You said 'stuff.'",
    'GARAGE UPLINK HITS A GIGABIT. INSTALLER STILL UNSURE WHY', { type: 'infra', id: 'net_switch', n: 1 }),
  ms('ms_fill_rack_1', 'Fill Rack 1', 'Eight sleds, one Craigslist rack, no regrets yet.',
    'CRAIGSLIST RACK FULL. SELLER WANTS IT BACK', { type: 'rackFull', rack: 0 }),
  ms('ms_fix_5_incidents', 'Fix 5 Incidents', 'You have a tapping hand now.',
    'MAN FIXES FIFTH OUTAGE BY TAPPING IT. EXPERTS BAFFLED', { type: 'incidents', n: 5 }),
  ms('ms_first_contract', 'First Contract', 'Uncle Ray would like a receipt.',
    'UNCLE RAY SIGNS. REQUESTS RECEIPT', { type: 'contracts', n: 1 }),
  ms('ms_1000', '$1,000', 'Local man explains Kubernetes on date, is single again.',
    'GARAGE OPERATION CLEARS $1,000. DATE DOES NOT CALL BACK', { type: 'valuation', n: 1e3 }),
  ms('ms_sell_the_civic', 'Sell the Civic', '212,000 miles. The racks have 99.4%.',
    'LOCAL MAN SELLS CAR, KEEPS SERVERS', { type: 'racks', n: 3 }),
  ms('ms_fill_the_garage', 'Fill the Garage', 'Thirty-two servers. The bike lives outside now.',
    'GARAGE FULL. BIKE NOW LIVES OUTSIDE', { type: 'allRacksFull', stage: 1 }),
  ms('ms_hire_dale', 'Hire Dale', 'He has a van.',
    'COUSIN HIRED. VAN INCLUDED', { type: 'staff', n: 1 }),
  ms('ms_sign_the_lease', 'Sign the Lease', "Cage 104. Mom's not paying the power bill any more.",
    'LOCAL MAN LEASES CAGE. MOTHER RECLAIMS GARAGE', { type: 'stage', n: 2 }),
  ms('ms_100_servers', '100 Servers', 'A hundred machines. Several of them know your name.',
    '100 SERVERS. SEVERAL KNOW YOUR NAME', { type: 'servers', n: 100 }),
  ms('ms_10_minutes_with_no_red', '10 Minutes With No Red', 'Ten minutes with every meter under capacity. Frame it.',
    'TEN MINUTES WITHOUT A RED METER. PLAQUE ORDERED', { type: 'noRedFor', s: 600 }),
  ms('ms_100000', '$100,000', 'Six figures. The accountant is a spreadsheet.',
    'SIX FIGURES. ACCOUNTANT STILL A SPREADSHEET', { type: 'valuation', n: 1e5 }),
  ms('ms_out_of_the_cage', 'Out of the Cage', 'Your first GPU Node. It is 40% fans by weight.',
    'FIRST GPU NODE INSTALLED. IT IS MOSTLY FANS', { type: 'tier', id: 'srv_gpu_node', n: 1 }),
  ms('ms_first_storage_array', 'First Storage Array', "Everyone's photos. All of them.",
    "STORAGE ARRAY ONLINE. EVERYONE'S PHOTOS NOW YOUR PROBLEM", { type: 'tier', id: 'srv_storage', n: 1 }),
  ms('ms_make_me_a_million', 'Make Me a Million', 'One million dollars, on paper. The Exit is open.',
    'LOCAL MAN WORTH $1M ON PAPER, STILL HAS GARAGE SMELL', { type: 'valuation', n: 1e6 }, { fx: 'sweep', screenshot: true }),
  ms('ms_warehouse', 'Warehouse', 'Trusses, highbays, a loading door and a forklift you cannot drive.',
    'OPERATION MOVES TO WAREHOUSE. FORKLIFT UNDRIVEN', { type: 'stage', n: 3 }),
  ms('ms_first_megawatt', 'First Megawatt', 'One megawatt of capacity. The utility sent a fruit basket.',
    'FIRST MEGAWATT. UTILITY SENDS FRUIT BASKET', { type: 'power', kw: 1000 }),
  ms('ms_99_9_for_10_minutes', '99.9 for 10 Minutes', 'Three nines, ten minutes. The pager is quiet.',
    'THREE NINES FOR TEN MINUTES. PAGER SUSPICIOUSLY SILENT', { type: 'uptimeFor', min: 99.9, s: 600 }),
  ms('ms_first_exit', 'First Exit', 'Acquired. The garage smell did not transfer.',
    'ACQUIRED. GARAGE SMELL DID NOT TRANSFER', { type: 'exits', n: 1 }),
  ms('ms_the_hall', 'The Hall', 'Purpose-built. Blue tiles. Containment doors that hiss.',
    'PURPOSE-BUILT HALL OPENS. DOORS HISS ON CUE', { type: 'stage', n: 4 }),
  ms('ms_first_sled', 'First Sled', 'You no longer buy servers. You buy weather.',
    'FIRST HYPERSCALE SLED. OWNER "BUYS WEATHER NOW"', { type: 'tier', id: 'srv_sled', n: 1 }),
  ms('ms_four_nines', 'Four Nines', 'Thirty minutes at 99.99. The fifth nine is in a different building.',
    'FOUR NINES ACHIEVED. FIFTH NINE IN ANOTHER BUILDING', { type: 'uptimeFor', min: 99.99, s: 1800 }),
  ms('ms_first_refresh', 'First Refresh', 'Out with the old. The old was eleven months old.',
    'ELEVEN-MONTH-OLD SERVERS "LEGACY," SAYS OWNER', { type: 'refresh' }),
  ms('ms_campus', 'Campus', 'The garage is a monument now. Interns photograph it.',
    'CAMPUS OPENS. GARAGE DECLARED A MONUMENT', { type: 'stage', n: 5 }),
  ms('ms_marjorie', 'Marjorie', 'Your cable has a name now. It is Marjorie.',
    'CABLE LANDS. CABLE NAMED MARJORIE', { type: 'infra', id: 'net_cable_landing', n: 1 }),
  ms('ms_first_reactor', 'First Reactor', 'The town is fine with it.',
    'TOWN APPROVES REACTOR. TOWN GETS POOL', { type: 'infra', id: 'pwr_smr', n: 1 }),
  ms('ms_1_trillion', '$1 Trillion', 'A trillion dollars of lifetime revenue. The spreadsheet has retired.',
    '$1 TRILLION. SPREADSHEET RETIRES TO FLORIDA', { type: 'valuation', n: 1e12 }),
  ms('ms_you_are_the_cloud', 'You Are the Cloud', 'One quadrillion. There is no one left to sell to. The game continues.',
    'ANALYSTS CONFIRM: THE CLOUD IS YOU', { type: 'valuation', n: 1e15 }, { fx: 'orbit', softEnding: true }),
  // counters
  ms('ms_200_servers', '200 Servers', 'Two hundred. The hum has a chord now.',
    '200 SERVERS. HUM NOW A CHORD', { type: 'servers', n: 200 }),
  ms('ms_500_servers', '500 Servers', 'Five hundred. You have stopped naming them.',
    '500 SERVERS. OWNER STOPS NAMING THEM', { type: 'servers', n: 500 }),
  ms('ms_1000_servers', '1,000 Servers', 'A thousand machines. One of them is still the dented R610.',
    '1,000 SERVERS. DENTED R610 STILL IN SERVICE', { type: 'servers', n: 1000 }),
  ms('ms_fix_25_incidents', 'Fix 25 Incidents', 'Twenty-five fixes. Your tapping finger has a callus.',
    '25 INCIDENTS FIXED. TAPPING FINGER INSURED', { type: 'incidents', n: 25 }),
  ms('ms_fix_100_incidents', 'Fix 100 Incidents', 'A hundred incidents. None of them were your fault. Several were.',
    '100 INCIDENTS FIXED. "NONE MY FAULT," SAYS MAN AT FAULT', { type: 'incidents', n: 100 }),
  ms('ms_5_contracts', '5 Contracts', 'Five clients. Two of them are Dave.',
    'FIVE CLIENTS SIGNED. TWO ARE DAVE', { type: 'contracts', n: 5 }),
  ms('ms_25_contracts', '25 Contracts', 'Twenty-five signatures. One in crayon.',
    '25 CONTRACTS. ONE SIGNED IN CRAYON', { type: 'contracts', n: 25 }),
  ms('ms_10m', '$10M', 'Eight figures. The spreadsheet has an assistant.',
    'EIGHT FIGURES. SPREADSHEET HIRES ASSISTANT', { type: 'valuation', n: 1e7 }),
  ms('ms_first_pod', 'First Pod', 'Arrives on a truck, pre-blinking.',
    'AI POD DELIVERED PRE-BLINKING. TRUCK LEAVES', { type: 'tier', id: 'srv_ai_pod', n: 1 }),
  ms('ms_first_annealer', 'First Annealer', 'Colder than space. Warmer than the budget.',
    'ANNEALER COLDER THAN SPACE. BUDGET WARMER', { type: 'tier', id: 'srv_quantum', n: 1 }),
  ms('ms_first_orbital', 'First Orbital', 'Latency: one sky.',
    'ORBITAL NODE LIVE. LATENCY: ONE SKY', { type: 'tier', id: 'srv_orbital', n: 1 }),
  ms('ms_3_exits', '3 Exits', 'Three acquisitions. The lawyers have a group chat.',
    'THIRD ACQUISITION. LAWYERS FORM GROUP CHAT', { type: 'exits', n: 3 }),
  ms('ms_10_exits', '10 Exits', 'Ten Exits. You have been acquired by a shell that you own.',
    'TENTH EXIT. MAN ACQUIRED BY SHELL HE OWNS', { type: 'exits', n: 10 }),
];

// ---------------------------------------------------------------------------------------------
// §10 prestige. shares = floor(cbrt(valuation / 1e6)); each share +10% income forever.
// The Exit button glows when newTotal >= max(glowMin, glowFactor * current shares).
// runMinutes is the sim's "a run this size takes about N minutes from scratch" table ([valuation, minutes],
// greedy no-Exit run, 0 shares; interpolate in log(valuation)). Entries past $100B are extrapolated.
export const EXIT = {
  minValuation: 1e6, sharePer: 0.10, glowMin: 3, glowFactor: 2, formula: 'floor(cbrt(valuation / 1e6))',
  tooltipAt1M: '1 share. Hold to $27M for 3 and the Colo. Analysts suggest holding.',
  cinematic: { sweepS: 1.5, fadeS: 1.5 }, skylineMax: 6,
  runMinutes: [[1e6, 26], [1e7, 38], [1e8, 49], [1e9, 64], [1e10, 86], [1e11, 124], [1e12, 165], [1e15, 300]],
};

export const ACQUIRERS = [
  { id: 'acq_shell', name: 'a company that is legally a shell' },
  { id: 'acq_sovereign', name: 'a sovereign wealth fund' },
  { id: 'acq_oracle_adjacent', name: 'someone Oracle-adjacent' },
];

// §10 perks by shares owned (not spent), applied at run start. Start perks (the rows with a stage) do not stack: the
// highest one with shares <= owned wins and sets cash, stage and carried racks (3 shares: Colo, 4 racks, $2,500 -
// not $2,500 + $2,500). Perk 1's infra is reinstalled on EVERY run start once owned, Colo-or-later starts included
// (one fan, PDU and switch appear in the new hall). autoBuyer and offline apply on top of whichever start perk won.
export const PERKS = [
  { shares: 1, name: 'Angel money', text: '$2,500 angel money; garage pre-wired (fan, PDU, switch).', cash: 2500, stage: 1, racks: 1,
    infra: ['cool_box_fan', 'pwr_pdu', 'net_switch'] },
  { shares: 3, name: 'Colo start', text: 'Start in the Colo with 4 racks and $2,500.', cash: 2500, stage: 2, racks: 4 },
  { shares: 10, name: 'Warehouse start', text: 'Start in the Warehouse with 12 racks and $100,000.', cash: 100e3, stage: 3, racks: 12 },
  { shares: 30, name: 'Hall start', text: 'Start in the Hall with 36 racks and $1,000,000.', cash: 1e6, stage: 4, racks: 36 },
  { shares: 100, name: 'Campus start', text: 'Start in the Campus with 96 racks and $20,000,000.', cash: 20e6, stage: 5, racks: 96 },
  { shares: 300, name: 'Infrastructure auto-buyer', text: 'Buys the best-value fix when a meter hits amber.', autoBuyer: { at: METER.amber } },
  { shares: 1000, name: 'Night owl', text: 'Offline cap 24 h and the 20% tail becomes 50%.', offline: { capH: 24, tailRate: 0.5 } },
];

// §11 offline. earn = income * (fullRate * min(elapsed, fullRateH) + tailRate * max(0, elapsed - fullRateH)).
export const OFFLINE = { capH: 8, fullRateH: 2, fullRate: 0.5, tailRate: 0.2, valuationFrac: 0.25, returnIncidents: 3, countUpS: 2,
  saveEveryS: 5 };

// ---------------------------------------------------------------------------------------------
// §15 visual constants.
export const PALETTE = {
  bg: 0x07090f, floor: 0x11141b, concrete: 0x2a2f3a, rackGarage: RACK_GARAGE, rackWhite: 0xd8dcdf,
  incident: 0xffb347, dark: 0xff4d4d, coldAisle: 0x3b7bff, hotAisle: 0xff6a3b,
  hemiSky: 0x3a4a6a, hemiGround: 0x1a1f2a, hotFog: 0x3a1a08,
  meterGreen: 0x58ff9a, meterAmber: 0xffb347, meterRed: 0xff4d4d,
  trayCyan: 0x45e6ff, trayGold: 0xffd166, trayRed: 0xff4d4d, bootWhite: 0xffffff,
};
export const CAMERA = { fov: 32, fovPortrait: 40, azimuthDeg: 45, polarDeg: [30, 70], idleOrbitAfterS: 20, idleOrbitRadS: 0.03,
  tapMaxPx: 6, tapMaxMs: 500 }; // tapMaxMs is judged between the pointer events' own timestamps (§15), not frames
export const POST = { bloom: { strength: 0.8, radius: 0.35, threshold: 0.9, phoneStrength: 0.6 }, exposure: 1.05, minFps: 40, fpsGraceS: 3,
  fadeS: 1.0 };
export const LED = { bootWhiteS: 0.4, bootDelayS: 0.2, pulseBase: 0.85, pulseAmp: 0.15, pulseRad: 6, blinkProb: 0.1, incidentHz: 2,
  upgradePulseS: 2, milestoneBloom: 1.4, milestoneBloomS: 0.5 };
export const ANIM = { rackDropM: 3, rackDropS: 0.5, serverSlideS: 0.35, breakerS: 5, sweepRowS: 0.15 };

// §16 asset contract shared by build_assets.py, scene.js and tools/data_check.mjs (which diffs these lists against the
// top-level objects of the exported GLBs). Every name is the exact GLB object name:
//   - meshes: every top-level object in library.glb. §16's "floor_tile (solid and perforated)" and "wall_segment
//     (plain, door, glass)" are exported as one object per variant, so the variants are listed, not the family.
//   - shared: §16's separate objects over one mesh datablock, each with its node scale (the base is scale 1).
//   - shellObjects[n]: every top-level object in stage_n.glb. Stage props are not library meshes: props_stage_n is the
//     merged decor, prop_* are the separately moved or lit props (the Civic drives out; the monument and satellite are
//     Campus landmarks), floor / hot_tiles / walls are the shell meshes and shellEmpties are its anchors
//     (assets/ASSETS.md has their positions; tower_0..2 are the Campus's suggested cool_tower anchors).
const SHELL_MESHES = ['floor', 'hot_tiles', 'walls'];
const SHELL_EMPTIES = ['key_light', 'door', 'yard', 'cam_target'];
export const ASSETS = {
  library: 'library.glb',
  shells: STAGES.map(s => s.shell),
  envelope: { w: 0.52, d: 0.9, h: 0.20 },
  rack: { w: 0.6, d: 1.2, h: 2.0, base: 0.12, slotPitch: 0.22, slots: RACK_SLOTS, slotEmpties: Array.from({ length: RACK_SLOTS }, (_, i) => `slot_${i}`) },
  ledEmpties: ['led_0', 'led_1'],
  fanChild: 'fan_0',
  fanUnits: ['cool_box_fan', 'cool_crac', 'cool_tower'],
  tray: { id: 'net_tray_segment', w: 1.0, d: 0.3, h: 0.1 },
  materials: ['MAT_steel_dark', 'MAT_rack_white', 'MAT_concrete', 'MAT_plastic', 'MAT_glass', 'MAT_chainlink', 'MAT_led', 'MAT_coolant'],
  variants: {
    floor_tile: ['floor_tile_solid', 'floor_tile_perf'],
    wall_segment: ['wall_segment_plain', 'wall_segment_door', 'wall_segment_glass'],
  },
  shared: {
    srv_blade: { base: 'srv_pizza_box', scale: 1 },
    srv_sled: { base: 'srv_ai_pod', scale: 1 },
    cool_chiller: { base: 'cool_crac', scale: 2.0 },
    cool_cryo: { base: 'cool_crac', scale: 3.0 },
    pwr_hv_feed: { base: 'pwr_substation', scale: 1.6 },
    net_core_router: { base: 'net_fiber_uplink', scale: 1.5 },
    net_ix_port: { base: 'net_fiber_uplink', scale: 2.0 },
    net_cable_landing: { base: 'net_fiber_uplink', scale: 2.5 },
  },
  meshes: [
    'rack_frame',
    ...TIERS.map(t => t.id),
    ...INFRA.map(i => i.id),
    'cool_tower', 'net_tray_segment',
    'floor_tile_solid', 'floor_tile_perf', 'wall_segment_plain', 'wall_segment_door', 'wall_segment_glass', 'containment_panel',
    'skyline_campus', 'hall_shell_silhouette',
  ],
  shellEmpties: [...SHELL_EMPTIES, 'tower_0', 'tower_1', 'tower_2'],
  shellObjects: {
    1: [...SHELL_MESHES, ...SHELL_EMPTIES, 'props_stage_1', 'prop_civic'],
    2: [...SHELL_MESHES, ...SHELL_EMPTIES, 'glass', 'cage', 'props_stage_2'],
    3: [...SHELL_MESHES, ...SHELL_EMPTIES, 'glass', 'props_stage_3'],
    4: [...SHELL_MESHES, ...SHELL_EMPTIES, 'glass', 'props_stage_4'],
    5: [...SHELL_MESHES, ...SHELL_EMPTIES, 'glass', 'props_stage_5', 'prop_garage_monument', 'prop_satellite', 'tower_0', 'tower_1', 'tower_2'],
  },
};

// ---------------------------------------------------------------------------------------------
// §18 ticker. stage: {min, max} = the run stages (1..5) a line may show in, so garage-voice lines retire with the
// garage and every stage has its own mix; evergreen lines are 1..5 (§18 "weighted by stage"). The ui picks uniformly
// among lines eligible at the current stage that are not in account.tickerRecent (no repeat within noRepeatS;
// account level, survives Exits). The one line flagged opening:true is shown first on a fresh garage start (stage 1,
// runTime 0, no start perk) before the random picks begin, matching §12's 0:00 beat. Milestone and event reactions
// come from MILESTONES[].ticker and EVENTS[].ticker.
export const TICKER_RULES = { noRepeatS: 900 };
const T = (min, max, text, extra) => ({ stage: { min, max }, text, ...extra });
export const TICKER = [
  // garage voice: retires with the garage (the "garage back" line may follow you into the Colo)
  T(1, 1, 'Day 1. You have $50, a rack from Craigslist and your mother\'s electricity.', { opening: true }),
  T(1, 1, 'Craigslist seller: "rack has character." The character is rust.'),
  T(1, 1, 'Neighbour asks why the garage hums. You say "crypto." He leaves.'),
  T(1, 1, 'The box fan is load-bearing.'),
  T(1, 1, 'Power bill arrives. Mom reads it twice.'),
  T(1, 1, 'You have named the pizza boxes. This was a mistake.'),
  T(1, 1, 'The Civic has 212,000 miles and a check-engine light with seniority.'),
  T(1, 1, 'Local teen offers to "optimise your firewall" for $20.'),
  T(1, 1, 'The window AC drips on Rack 2. Rack 2 is fine. Probably.'),
  T(1, 1, 'Dave asks if the server can "go faster." You buy a fan.'),
  T(1, 1, "Uncle Ray's receptionist has bookmarked the status page."),
  T(1, 1, 'Your mother vacuumed around the rack. Around.'),
  T(1, 1, "Dave's boys have discovered port scanning."),
  T(1, 2, 'Your mother would like the garage back. You have shown her the valuation.'),
  // evergreen
  T(1, 5, "Uncle Ray says the site is 'snappier.' You did nothing."),
  T(1, 5, 'Analysts: the cloud is just computers. Stock falls.'),
  T(1, 5, 'FrobCoin up 400%. FrobCoin down 400%.'),
  T(1, 5, 'A fan has stopped. Somewhere. You can hear it not spinning.'),
  T(1, 5, 'Status page: all systems operational. The status page is hosted elsewhere.'),
  T(1, 5, 'Firmware Tuesday is every Tuesday. Also some Thursdays.'),
  T(1, 5, 'Zip ties: a love language.'),
  T(1, 5, 'Someone has labelled a cable DO NOT UNPLUG. It is unplugged.'),
  T(1, 5, 'The humming has a pitch now. The pitch is E.'),
  T(1, 5, 'A certificate expired. It was eleven months old. It had plans.'),
  T(1, 5, 'Uptime: a number that only goes down when someone is watching.'),
  T(1, 5, 'Blinkenlights report: blinking.'),
  T(1, 5, 'You dream in rack units.'),
  T(1, 5, 'Hot aisle, cold aisle, the aisle where you keep the snacks.'),
  T(1, 5, "An intern asked what the racks are for. You said 'stuff.'"),
  T(1, 5, 'Analysts coin "the fog of compute." Analysts have never seen a server.'),
  T(1, 5, 'Someone ran a cable through the ceiling tile. The ceiling tile is load-bearing now.'),
  T(1, 5, 'Monitoring says everything is green. Monitoring is colour-blind.'),
  // colo
  T(2, 2, "Cage 104's neighbour runs something that smells like ozone and secrets."),
  T(2, 2, 'The vending machine takes cards now. Progress.'),
  T(2, 2, 'The colo tech rebooted "a rack." He did not say whose.'),
  T(2, 5, 'County Records would like to confirm nothing happened. Nothing happened.'),
  T(2, 2, 'CatTube uploads: 40 hours a minute. Of cats. In the cage.'),
  T(2, 2, 'Your lease has a clause about "unusual odours." You have read it twice.'),
  T(2, 3, 'Dale has a van. Dale has brought the van.'),
  T(2, 2, 'The chain-link is load-bearing in a legal sense only.'),
  T(2, 3, 'GPU Node: 40% fans by weight, 60% invoice.'),
  T(2, 2, "Mom's not paying the power bill. Mom has made a cake."),
  // warehouse
  T(3, 5, 'Weatherbot predicts rain. Weatherbot is a radiator.'),
  T(3, 4, 'The AI Pod arrived pre-blinking. Nobody has configured it yet.'),
  T(3, 3, 'Forklift certified. Forklift not insured.'),
  T(3, 5, 'Black Friday: twenty times your traffic, once. You will remember it fondly in therapy.'),
  T(3, 5, 'A raccoon has been in the genset. The raccoon is doing well.'),
  T(3, 4, 'The Substation has its own fence. The fence has its own sign.'),
  T(3, 5, 'The night-shift tech has a podcast. It is about the night shift.'),
  T(3, 4, 'The CRAC sounds like the sea. A sea that bills monthly.'),
  T(3, 5, 'Series B closed. Weatherbot bought a wall of monitors and a second wall.'),
  T(3, 5, 'Spares closet audit: one of everything, two of nothing you need.'),
  // hall
  T(4, 5, "Halcyon's run went weird again. They call it expected emergent behaviour."),
  T(4, 5, 'The Hyperscaler calls it "partner capacity." Their lawyer calls it "our capacity."'),
  T(4, 4, 'Raised floor installed. Something now lives under it.'),
  T(4, 5, 'The Annealer is colder than space. The budget is warmer than the sun.'),
  T(4, 4, 'IX Port lit. Four terabits of other people\'s business.'),
  T(4, 5, 'Hyperscale Sled delivered by crane. The crane has a Sled now.'),
  T(4, 5, 'The Chiller plant has a name. Its name is "the Chiller plant."'),
  T(4, 5, 'SRE hired. Pager volume doubled, which is how you know it is working.'),
  T(4, 5, 'The Site Reliability Priest blessed the deploys. The deploys are fine now.'),
  T(4, 5, 'Four nines achieved. The fifth nine is in a different building.'),
  // campus
  T(5, 5, 'The Ministry has no comment. The Ministry has never had a comment.'),
  T(5, 5, 'Marjorie carries 4% of the internet and does not know.'),
  T(5, 5, 'Orbital Node online. Latency: one sky.'),
  T(5, 5, 'SMR permitted. The paperwork was the hard part. The uranium was easy.'),
  T(5, 5, 'The garage is a monument now. Interns photograph it. One cried.'),
  T(5, 5, 'A satellite blinks at you. You blink back. HR is informed.'),
  T(5, 5, 'The town is fine with the reactor. The town has a new pool.'),
  T(5, 5, 'Hall B is a silhouette. Hall C is a rumour.'),
  T(5, 5, 'The immersion farm is quiet. Too quiet. It is the oil.'),
  T(5, 5, 'Cooling towers steam at dawn. Tourists think it is a weather thing.'),
  T(5, 5, 'A sovereign wealth fund inquires about "the whole campus." You ask which one.'),
  T(5, 5, "The Ministry's room has no windows. It has requested fewer."),
];
