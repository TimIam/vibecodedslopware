#!/usr/bin/env node
// Tests for datacenter/sim.js against DESIGN.md.   node --test datacenter/tools/sim_test.mjs
// Everything runs on a fake clock and a seeded rng: no Date.now(), no Math.random(), no localStorage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, computeDerived, migrate, offlineEarn, sharesFor, estMinutes } from '../sim.js';
import { mulberry32 } from '../util.js';
import * as D from '../data.js';

const H = 3600;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const assertNear = (a, b, eps, msg) => assert.ok(near(a, b, eps), `${msg ?? ''}: got ${a}, want ${b} ±${eps}`);

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, dump: () => m.get(D.SAVE_KEY) };
}

// A sim on a fake clock. step(ms) advances wall time and calls update(); run(s, perTick) advances s seconds in 100 ms steps.
// t0 is an epoch (2023): a savedAt below 1e12 reads as "not a Date.now() stamp" and pays no offline earnings.
const T0 = 1_700_000_000_000;
function mkSim({ seed = 1, storage = memStorage(), t0 = T0, speed = 1, sessionId = null } = {}) {
  const clock = { t: t0 };
  const sim = createSim({ now: () => clock.t, storage, rng: mulberry32(seed), speed, sessionId });
  const events = [];
  const watch = ['serverAdded', 'serverSwapped', 'rackAdded', 'rackDark', 'infraAdded', 'stageChanged', 'incident', 'incidentResolved', 'event',
    'breaker', 'upgrade', 'global', 'milestone', 'contractChanged', 'exit', 'offline', 'refreshAvailable', 'toast'];
  for (const n of watch) sim.on(n, p => events.push({ n, p, t: sim.state.run.runTime }));
  sim.update(clock.t);
  const step = ms => { clock.t += ms; sim.update(clock.t); };
  const run = (seconds, perTick) => { const n = Math.round(seconds * 10); for (let i = 1; i <= n; i++) { step(100); if (perTick) perTick(i); } };
  const got = n => events.filter(e => e.n === n);
  return { sim, clock, storage, events, step, run, got };
}

// A garage state straight from §12: six Pizza Boxes, a Box Fan, and whatever else the caller adds.
function garageState(extra = {}) {
  const { sim } = mkSim();
  const run = sim.state.run;
  run.racks[0].servers = ['srv_pizza_box', 'srv_pizza_box', 'srv_pizza_box', 'srv_pizza_box', 'srv_pizza_box', 'srv_pizza_box', null, null];
  run.infra = { cool_box_fan: 1 };
  Object.assign(run, extra.run ?? {});
  Object.assign(sim.state.account, extra.account ?? {});
  return sim.state;
}

// ---------------------------------------------------------------------------------------------
test('§2 efficiency: power 3.3 / 3.0 kW (u 1.1) dims to 0.866', () => {
  const st = garageState();
  st.run.racks[0].servers[6] = 'srv_blade'; // 6 × 0.25 + 1.5 + fan 0.3 = 3.3 kW on a 3 kW outlet
  const d = computeDerived(st, D);
  assertNear(d.power.demand, 3.3, 1e-9, 'power demand');
  assertNear(d.power.u, 1.1, 1e-9, 'power u');
  assertNear(d.efficiency, 0.866, 1e-3, 'efficiency');
  assert.equal(d.power.colour, 'red');
  assertNear(d.cooling.u, 3.0 / 4.5, 1e-9, 'cooling u (fan adds 3 kW)');
  assert.equal(d.cooling.colour, 'green');
  assertNear(d.income, 1.5 * d.efficiency, 1e-9, 'income = $1.50 nominal × efficiency');
});

test('§2 uptimeMult(50) = 0.625, floor 0.5', () => {
  const st = garageState({ run: { uptime: 50 } });
  assertNear(computeDerived(st, D).uptimeMult, 0.625, 1e-12);
  st.run.uptime = 0;
  assertNear(computeDerived(st, D).uptimeMult, 0.5, 1e-12);
});

test('§7 contractMult stacks additively: County + Weatherbot = 2.4; an SLA miss contributes 0', () => {
  const st = garageState({ run: { stage: 3, contracts: { active: [{ id: 'con_county', termLeft: 100 }, { id: 'con_weatherbot', termLeft: 100 }], board: [], boardAge: 0 } } });
  assertNear(computeDerived(st, D).contractMult, 2.4, 1e-9);
  st.run.uptime = 98.5; // County wants 99, Weatherbot 98
  assertNear(computeDerived(st, D).contractMult, 2.2, 1e-9);
  st.run.uptime = 97;
  assertNear(computeDerived(st, D).contractMult, 1.0, 1e-9);
  // demand factors multiply regardless of SLA: power 0.8 × 1.3 = 1.04 on 1.5 kW of boxes plus the fan's 0.3
  assertNear(computeDerived(st, D).power.demand, 1.5 * 1.04 + 0.3, 1e-9);
});

test('§2 income multiplies shares, globals and milestones', () => {
  const st = garageState({ run: { globals: 1, infra: { cool_box_fan: 1, pwr_pdu: 1 } }, account: { shares: 2, milestones: ['ms_lights_on', 'ms_buy_a_fan', 'ms_1000'] } });
  st.run.racks[0].servers[6] = 'srv_blade';
  const d = computeDerived(st, D);
  assert.equal(d.efficiency, 1, 'PDU lifts power to 7 kW: no overdraw');
  assertNear(d.income, 1.5 * 1.2 * 1.25 * 1.03, 1e-9);
  assertNear(d.stack, 1.2 * 1.25 * 1.03, 1e-9);
});

test('§2 guards: zero capacity reads u 0, dark racks earn nothing but still draw', () => {
  const st = garageState();
  st.run.racks[0].dark = true; st.run.racks[0].incident = { id: 'inc_disk', t0: 0, flavor: 'x' };
  const d = computeDerived(st, D);
  assert.equal(d.income, 0);
  assertNear(d.cooling.demand, 1.5, 1e-9);
  assert.equal(d.darkRacks, 1);
  const empty = computeDerived({ ...st, run: { ...st.run, racks: [], infra: {} } }, D);
  assert.equal(empty.power.u, 0); assert.equal(empty.efficiency, 1); assert.equal(empty.income, 0);
});

// ---------------------------------------------------------------------------------------------
test('§3 cost growth per tier, qty sums, max, Refresh never lowers bought', () => {
  const { sim } = mkSim();
  assert.equal(sim.cost('srv_pizza_box', 1), 15);
  assertNear(sim.cost('srv_pizza_box', 3), 15 + 15 * 1.07 + 15 * 1.07 ** 2, 1e-9);
  assert.equal(sim.buy('srv_pizza_box', 3).ok, true);
  assertNear(sim.cost('srv_pizza_box', 1), 15 * 1.07 ** 3, 1e-9, 'fourth box');
  assertNear(sim.state.run.cash, 50 - sim.cost('srv_pizza_box', 0) - (15 + 15 * 1.07 + 15 * 1.07 ** 2) + 0, 1e-9);
  sim.dev.give(1000);
  assert.equal(sim.maxAffordable('srv_pizza_box'), 5, 'limited by the 5 free slots, not cash');
  assert.equal(sim.buy('srv_pizza_box', 'max').qty, 5);
  assert.equal(sim.buy('srv_pizza_box').reason, 'full');
  assert.equal(sim.cost('srv_pizza_box', 1), Infinity, 'no slot: Infinity');
  assert.equal(sim.state.run.bought.srv_pizza_box, 8);
  assert.equal(sim.state.account.lifetime.servers, 8);
});

test('§3 upgrade at 10 owned costs base×15, doubles output, draw ×1.3, and persists when Refresh drops the count', () => {
  const { sim } = mkSim();
  sim.dev.give(5000);
  assert.equal(sim.buy('upg:srv_pizza_box').reason, 'locked');
  sim.buy('srv_pizza_box', 8);
  sim.buy('rack'); sim.buy('srv_pizza_box', 2);
  assert.equal(sim.cost('upg:srv_pizza_box'), 225);
  const before = sim.derived.baseIncome, kwBefore = sim.derived.cooling.demand;
  const r = sim.buy('upg:srv_pizza_box');
  assert.equal(r.ok, true);
  assertNear(sim.derived.baseIncome, before * 2, 1e-9, 'output ×2');
  assertNear(sim.derived.cooling.demand, kwBefore * 1.3, 1e-9, 'heat ×1.3');
  assert.equal(sim.state.run.upgrades.srv_pizza_box, 1);
  // fill the garage so Refresh unlocks, then swap boxes for blades until fewer than 10 boxes remain
  sim.buy('rack'); sim.buy('rack');
  sim.dev.give(1e5);
  sim.buy('srv_pizza_box', 'max');
  assert.equal(sim.state.run.racks.length, 4);
  assert.equal(sim.derived.installed, 32);
  const avail = sim.refresh(0, 10);
  assert.equal(avail.ok, true);
  assert.equal(avail.swaps, 10);
  for (let r = 0; r < 4 && sim.derived.byTier.srv_pizza_box >= 10; r++) sim.refresh(r, 10);
  assert.ok(sim.derived.byTier.srv_pizza_box < 10, 'fewer than 10 boxes after Refresh');
  assert.equal(sim.state.run.upgrades.srv_pizza_box, 1, 'upgrade persists below its threshold');
  const row = sim.shopRows('upgrades').find(r => r.id === 'upg:srv_pizza_box');
  assert.equal(row.level, 1);
  assert.match(row.locked, /Needs 25/);
  assert.equal(sim.state.run.refreshes >= 10, true);
  assert.ok(sim.state.account.milestones.includes('ms_first_refresh'));
});

test('§3 Refresh: lowest tier first, 25% refund of the removed base, ×10 walks row neighbours outward', () => {
  const { sim, got } = mkSim();
  sim.dev.give(1e6);
  for (let i = 0; i < 3; i++) sim.buy('rack');
  sim.buy('srv_pizza_box', 'max');
  const cash0 = sim.state.run.cash;
  const bladePrice = 100 * 1.07 ** (sim.state.run.bought.srv_blade || 0); // cost() is Infinity with no free slot
  const r = sim.refresh(2, 1);
  assert.equal(r.ok, true);
  assertNear(cash0 - sim.state.run.cash, bladePrice - 0.25 * 15, 1e-9, 'price of the next tier minus 25% of the removed base');
  const sw = got('serverSwapped');
  assert.deepEqual(sw[0].p, { rack: 2, slot: 0, from: 'srv_pizza_box', to: 'srv_blade' });
  assert.equal(sim.state.run.racks[2].servers[0], 'srv_blade');
  // ×10 from rack 1 with 8 boxes left in it: 8 swaps there, then the neighbours (rack 0 first, then rack 2)
  const before = sw.length;
  sim.refresh(1, 10);
  const racks = got('serverSwapped').slice(before).map(e => e.p.rack);
  assert.equal(racks.length, 10);
  assert.deepEqual(racks.slice(0, 8), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(racks.slice(8), [0, 0]);
  assert.equal(sim.state.run.valuation, 1e6, 'refunds and spends never touch valuation');
});

test('§3 tier visibility: 25% of base via valuation or cash, stage gate, Blade needs 6 boxes', () => {
  const { sim } = mkSim();
  const row = id => sim.shopRows('build').find(r => r.id === id);
  const unsee = () => { sim.state.run.seenTiers = []; }; // probe the raw 25% rule, not the sticky reveal
  sim.state.run.cash = 20; sim.state.run.valuation = 0; unsee();
  assert.equal(row('srv_blade').visible, false, 'under 25% of $100');
  sim.state.run.cash = 25;
  assert.equal(row('srv_blade').visible, true, 'cash alone unlocks (perk starts have no valuation yet)');
  assert.equal(row('srv_blade').locked, 'Needs 6 Pizza Boxes');
  assert.equal(row('srv_gpu_node').visible, false, 'Colo tier hidden in the garage');
  sim.state.run.cash = 1e6;
  assert.equal(row('srv_gpu_node').visible, false);
  sim.dev.jump(2);
  assert.equal(row('srv_gpu_node').visible, true);
  assert.equal(row('srv_gpu_node').affordable, true);
  sim.state.run.cash = 100; sim.state.run.valuation = 324; unsee();
  assert.equal(row('srv_gpu_node').visible, false);
  sim.state.run.valuation = 325;
  assert.equal(row('srv_gpu_node').visible, true);
});

test('§3 reveal is sticky: the §12 opening (three boxes from $50) never blinks the Blade or Pizza Box rows out', () => {
  const { sim, run } = mkSim();
  const ids = () => sim.shopRows('build').filter(r => r.visible).map(r => r.id);
  assert.deepEqual(ids(), ['srv_pizza_box', 'srv_blade', 'rack', 'move'], 'at $50 both garage tiers show (Blade greyed)');
  sim.buy('srv_pizza_box'); sim.buy('srv_pizza_box');
  assert.ok(sim.state.run.cash < 25, `cash ${sim.state.run.cash} is under 25% of the Blade`);
  assert.deepEqual(ids(), ['srv_pizza_box', 'srv_blade', 'rack', 'move'], 'Blade stays after box 2');
  sim.buy('srv_pizza_box');
  assert.ok(sim.state.run.cash < 3.75 && sim.state.run.valuation === 0, `cash ${sim.state.run.cash}: under 25% of a box too`);
  assert.deepEqual(ids(), ['srv_pizza_box', 'srv_blade', 'rack', 'move'], 'both rows stay after box 3');
  run(10);
  assert.deepEqual(ids(), ['srv_pizza_box', 'srv_blade', 'rack', 'move']);
  assert.deepEqual(sim.state.run.seenTiers, ['srv_pizza_box', 'srv_blade']);
  // a bought tier is listed even with the list cleared; the list resets with the run and survives a save roundtrip
  sim.state.run.seenTiers = [];
  assert.equal(sim.shopRows('build').find(r => r.id === 'srv_pizza_box').visible, true, 'bought > 0 keeps it');
  const m = migrate(JSON.parse(JSON.stringify({ ...sim.state, run: { ...sim.state.run, seenTiers: ['srv_blade', 'nope'] } })), D, T0);
  assert.deepEqual(m.run.seenTiers, ['srv_blade']);
  sim.resetRun();
  assert.deepEqual(sim.state.run.seenTiers, ['srv_pizza_box', 'srv_blade'], 'a fresh $50 run re-reveals the two garage tiers');
});

// ---------------------------------------------------------------------------------------------
test('§14.3 placement: lowest rack with a free slot, lowest slot first; new rack = next footprint', () => {
  const { sim, got } = mkSim();
  sim.dev.give(1e4);
  sim.buy('srv_pizza_box', 2);
  assert.deepEqual(got('serverAdded').map(e => [e.p.rack, e.p.slot]), [[0, 0], [0, 1]]);
  sim.buy('rack');
  assert.deepEqual(got('rackAdded').map(e => e.p.rack), [1]);
  sim.buy('srv_pizza_box', 7);
  const placed = got('serverAdded').map(e => [e.p.rack, e.p.slot]);
  assert.deepEqual(placed.slice(2), [[0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 0]]);
  sim.state.run.racks[0].servers[3] = null; // a hole (never happens in play; Refresh swaps in place) fills first
  sim.buy('srv_pizza_box');
  assert.deepEqual(got('serverAdded').at(-1).p, { rack: 0, slot: 3, tier: 'srv_pizza_box' });
  assert.equal(sim.buy('rack', 5).qty, 2, 'racks are capped by footprints');
  assert.equal(sim.buy('rack').reason, 'full');
  assert.equal(sim.state.run.racksBoughtThisStage, 3);
  assert.equal(sim.cost('rack', 1), Infinity, 'no footprint left');
  const full = sim.shopRows('build').find(r => r.id === 'srv_pizza_box');
  assert.equal(full.full, false, 'slots remain');
  sim.buy('srv_pizza_box', 'max');
  const noSlot = sim.shopRows('build').find(r => r.id === 'srv_pizza_box');
  assert.equal(noSlot.full, true); assert.match(noSlot.locked, /No empty slot/); assert.ok(noSlot.addNominal > 0, 'greyed row keeps its +$/s');
  assert.equal(sim.buy('srv_pizza_box').reason, 'full');
});

test('§5 stage move needs every footprint bought (not full); racks carry over; board rerolls', () => {
  const { sim, got } = mkSim();
  sim.dev.give(1e5);
  assert.equal(sim.buy('move').reason, 'locked');
  sim.buy('rack', 3);
  assert.equal(sim.shopRows('build').find(r => r.id === 'move').locked, null);
  const cash = sim.state.run.cash;
  assert.equal(sim.buy('move').ok, true);
  assert.equal(sim.state.run.cash, cash - 2000);
  assert.equal(sim.state.run.stage, 2);
  assert.equal(sim.state.run.racks.length, 4);
  assert.equal(sim.state.run.racksBoughtThisStage, 0);
  assertNear(sim.cost('rack'), 300, 1e-9, 'Colo rack base');
  assert.deepEqual(got('stageChanged').at(-1).p, { from: 1, to: 2 });
  assert.ok(got('toast').some(e => /power bill/.test(e.p.text)));
  assert.ok(sim.state.run.contracts.board.length === 3);
  assert.ok(sim.state.account.milestones.includes('ms_sign_the_lease'));
  assert.equal(sim.buy('move').reason, 'locked', 'the Colo has 12 footprints');
});

test('§5 a full server row names a Build row that exists: Buy a rack, Lease / Move to, or Refresh in the last hall', () => {
  const { sim, run } = mkSim();
  sim.dev.give(1e4);
  const reason = () => sim.shopRows('build').find(r => r.id === 'srv_pizza_box').locked;
  sim.buy('srv_pizza_box', 'max');
  assert.equal(reason(), 'No empty slot. Buy a rack.', 'footprints left: the Rack row is there');
  sim.buy('rack', 3); sim.buy('srv_pizza_box', 'max');
  assert.equal(sim.shopRows('build').find(r => r.id === 'rack').visible, false, 'Garage 4/4: the Rack row is hidden');
  assert.equal(reason(), 'No empty slot. Lease the Colo.');
  assert.equal(sim.shopRows('build').find(r => r.id === 'srv_blade').locked, 'No empty slot. Lease the Colo.', 'every full tier row says it');
  assert.equal(sim.buy('srv_pizza_box').text, 'No empty slot. Lease the Colo.', 'buy() refuses with the same line');
  sim.buy('move');
  assert.equal(reason(), 'No empty slot. Buy a rack.', 'Colo 4/12 with the carried racks full');
  const fullRack = () => ({ servers: new Array(D.RACK_SLOTS).fill('srv_pizza_box'), dark: false, incident: null });
  sim.state.run.racks = Array.from({ length: 12 }, fullRack); run(0.1);
  assert.equal(reason(), 'No empty slot. Move to the Warehouse.');
  sim.dev.jump(5);
  sim.state.run.racks = Array.from({ length: D.STAGES[4].footprints.length }, fullRack); run(0.1);
  assert.equal(reason(), 'No empty slot. Refresh a rack.', 'the Campus has no next hall');
});

// ---------------------------------------------------------------------------------------------
test('§8 the breaker fires once, on the first garage tick with powerDemand > powerCapacity, and blacks out 5 s', () => {
  const { sim, run, got } = mkSim();
  sim.dev.give(500);
  sim.buy('srv_pizza_box', 6); sim.buy('cool_box_fan');
  assert.equal(sim.shopRows('build').find(r => r.id === 'srv_blade').overdraw.meter, 'power');
  sim.buy('srv_blade');
  assert.equal(got('breaker').length, 0, 'not before the next tick');
  run(0.1);
  assert.equal(got('breaker').length, 1);
  assert.equal(sim.state.account.flags.breakerSeen, true);
  assert.equal(sim.state.run.event.id, 'ev_breaker');
  assert.equal(sim.derived.income, 0, 'blackout: no income');
  assert.ok(!sim.state.account.milestones.includes('ms_just_the_one'), 'survive it first');
  assert.ok(sim.goals(D.MILESTONES.length).some(g => g.id === 'ms_just_the_one'), 'the goal stays reachable through the blackout');
  run(5);
  assert.equal(sim.state.run.event, null);
  assertNear(sim.derived.efficiency, 0.866, 1e-3, 'back dimmed to 87%');
  assert.ok(got('toast').some(e => /Breaker\. Just the one/.test(e.p.text)));
  assert.ok(sim.state.account.milestones.includes('ms_just_the_one'));
  assert.deepEqual(got('event').map(e => e.p.on), [true, false]);
  // more overdraw never trips it again
  sim.buy('srv_blade');
  run(2);
  assert.equal(got('breaker').length, 1);
  assert.ok(sim.state.run.uptime < 100, 'red power costs uptime instead');
});

test('§8 the breaker never fires in a Colo-or-later perk start', () => {
  const storage = memStorage();
  storage.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, account: { shares: 3 }, run: { cash: 50 } }));
  const { sim, run, got } = mkSim({ storage });
  sim.resetRun();
  assert.equal(sim.state.run.stage, 2);
  assert.equal(sim.state.run.startStage, 2);
  sim.dev.give(5000);
  assert.deepEqual(sim.state.run.infra, { cool_box_fan: 1, pwr_pdu: 1, net_switch: 1 }, 'perk 1 gear comes along');
  sim.buy('srv_gpu_node', 2); // 12 kW on the 3 kW outlet + the perk PDU's 4 kW: power red
  run(3);
  assert.ok(sim.derived.power.u > 1);
  assert.equal(got('breaker').length, 0);
  assert.equal(sim.state.account.flags.breakerSeen, false);
  assert.ok(!sim.goals(D.MILESTONES.length).some(g => g.id === 'ms_just_the_one'), 'goal cards skip the unavailable milestone');
});

test('§9 "Just the One" leaves the goal cards once a garage start leaves the garage without tripping the breaker', () => {
  const { sim, run, got } = mkSim();
  sim.dev.give(5000);
  // headroom first, servers second: the greedy path never overdraws, so the breaker never fires
  sim.buy('pwr_pdu', 2); sim.buy('cool_box_fan', 2); sim.buy('net_switch', 2);
  sim.buy('srv_pizza_box', 6); sim.buy('srv_blade', 2); sim.buy('rack', 3);
  run(1);
  assert.equal(got('breaker').length, 0);
  assert.equal(sim.state.account.flags.breakerSeen, false);
  assert.ok(sim.derived.power.u < 1);
  const onCards = () => sim.goals(D.MILESTONES.length).some(g => g.id === 'ms_just_the_one');
  assert.ok(onCards(), 'still in the garage: reachable, so among the goals');
  assert.equal(sim.buy('move').ok, true);
  assert.equal(sim.state.run.stage, 2);
  assert.ok(!onCards(), 'the Colo has no wall outlet: the card drops out');
  run(2);
  assert.ok(!onCards());
  assert.ok(!sim.state.account.milestones.includes('ms_just_the_one'), 'and it was not handed out either');
  sim.dev.jump(3);
  assert.ok(!onCards(), 'nor in the Warehouse');
  assert.equal(sim.goals().length, 3, 'three real goals fill the slots');
});

// ---------------------------------------------------------------------------------------------
test('§8 incident → dark → late fix; uptime falls 0.25/s per dark rack and does not recover', () => {
  const { sim, run, got } = mkSim();
  sim.dev.give(100); sim.buy('srv_pizza_box', 4);
  assert.equal(sim.dev.spawnIncident(), true);
  const inc = got('incident')[0].p;
  assert.equal(inc.rack, 0);
  assert.match(inc.flavor, /Rack 1/);
  assert.equal(sim.state.run.racks[0].incident.id, inc.id);
  run(20); // tapWindow is 20 s: still open at exactly 20
  assert.equal(sim.state.run.racks[0].dark, false);
  run(0.2);
  assert.equal(sim.state.run.racks[0].dark, true);
  assert.deepEqual(got('rackDark').at(-1).p, { rack: 0, dark: true });
  assert.equal(sim.derived.income, 0, 'a dark rack earns nothing');
  const u0 = sim.state.run.uptime;
  run(10);
  assertNear(u0 - sim.state.run.uptime, 2.5, 1e-6, '0.25/s while dark');
  const late = sim.tapIncident(0);
  assert.equal(late.ok, true); assert.equal(late.bounty, 0); assert.equal(late.late, true);
  assert.deepEqual(got('rackDark').at(-1).p, { rack: 0, dark: false });
  assert.equal(got('incidentResolved').at(-1).p.bounty, 0);
  assert.equal(sim.state.account.lifetime.incidents, 1, 'a late tap still counts as a fix');
  const u1 = sim.state.run.uptime;
  run(2);
  assertNear(sim.state.run.uptime - u1, 2, 1e-6, 'recovers +1/s once nothing is dark or red');
  assert.equal(sim.tapIncident(0).reason, 'no_incident');
});

test('§8 timely tap pays max($5, 20 s of income); badge focuses then fixes at half bounty; max 3 outstanding', () => {
  const { sim, run, got } = mkSim();
  sim.dev.give(3000);
  sim.buy('srv_pizza_box', 8); sim.buy('rack', 3); sim.buy('srv_pizza_box', 'max'); sim.buy('pwr_subpanel'); sim.buy('cool_box_fan', 2); sim.buy('cool_window_ac'); sim.buy('net_switch');
  sim.dev.spawnIncident();
  run(1);
  assert.equal(sim.derived.efficiency, 1, 'no overdraw in this setup');
  const income = sim.derived.income;
  assert.ok(income > 0.25, 'enough income for the 20 s rule to beat $5');
  const cash = sim.state.run.cash;
  const r = sim.tapIncident(got('incident')[0].p.rack);
  assertNear(r.bounty, 20 * income, 1e-6);
  assertNear(sim.state.run.cash - cash, r.bounty, 1e-6);
  // $5 floor
  sim.state.run.racks.forEach(rk => rk.servers.fill(null)); sim.state.run.racks[0].servers[0] = 'srv_pizza_box';
  sim.dev.spawnIncident(); run(0.1);
  assert.equal(sim.tapIncident(0).bounty, 5);
  // badge
  sim.state.run.racks.forEach(rk => rk.servers.fill('srv_pizza_box'));
  assert.equal(sim.tapBadge().reason, 'none');
  sim.dev.spawnIncident(); run(0.5); sim.dev.spawnIncident(); run(0.5);
  const oldest = got('incident').at(-2).p.rack;
  const b1 = sim.tapBadge();
  assert.deepEqual([b1.ok, b1.rack, b1.fixed], [true, oldest, false]);
  const inc2 = sim.derived.income;
  const b2 = sim.tapBadge();
  assert.equal(b2.fixed, true);
  assertNear(b2.bounty, Math.max(5, 20 * inc2) * 0.5, 1e-6, 'half bounty');
  // cap of three
  sim.dev.spawnIncident(); sim.dev.spawnIncident(); sim.dev.spawnIncident();
  sim.state.run.nextIncidentAt = 0;
  run(0.1);
  assert.equal(sim.state.run.racks.filter(rk => rk.incident).length, 4, 'dev spawns force past the cap; the scheduler does not add a fifth');
  assert.equal(sim.state.account.lifetime.incidents, 3);
});

test('§8 incidents start at 3:00 then every 60-120 s; staff auto-resolve max(2, 20−4n) s with no bounty; Spares 5 s', () => {
  const { sim, run, got } = mkSim({ seed: 3 });
  sim.dev.give(3000); sim.buy('srv_pizza_box', 8); sim.buy('rack'); sim.buy('srv_pizza_box', 8);
  run(179);
  assert.equal(got('incident').length, 0);
  const taps = [];
  run(600, () => { for (const [i, rk] of sim.state.run.racks.entries()) if (rk.incident) { sim.tapIncident(i); taps.push(sim.state.run.runTime); } });
  const times = got('incident').map(e => e.t);
  assertNear(times[0], 180, 0.2, 'first at 3:00');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 60 - 0.2 && times[i] - times[i - 1] <= 120 + 0.2, `gap ${i} = ${(times[i] - times[i - 1]).toFixed(1)}`);
  assert.ok(times.length >= 6 && times.length <= 11, `${times.length} incidents in 10 minutes`);
  assert.ok(sim.state.account.milestones.includes('ms_fix_5_incidents'));
  // staff: 1 hire → 16 s, no bounty, no "fixed" credit
  sim.dev.jump(2); sim.dev.give(1e6); assert.equal(sim.buy('staff').ok, true);
  const fixed = sim.state.account.lifetime.incidents, cash = sim.state.run.cash;
  sim.dev.spawnIncident(); run(15.9);
  assert.equal(sim.state.run.racks.some(rk => rk.incident), true);
  run(0.2);
  assert.equal(sim.state.run.racks.some(rk => rk.incident), false, 'auto-resolved at 16 s');
  assert.equal(sim.state.account.lifetime.incidents, fixed);
  assert.equal(got('incidentResolved').at(-1).p.bounty, 0);
  assert.ok(sim.state.run.cash >= cash, 'no bounty, no cost');
  for (let i = 0; i < 4; i++) { sim.dev.jump(3); sim.buy('staff'); }
  assert.equal(sim.state.run.staff, 5);
  sim.dev.spawnIncident(); run(1.9); assert.equal(sim.state.run.racks.some(rk => rk.incident), true); run(0.2);
  assert.equal(sim.state.run.racks.some(rk => rk.incident), false, 'five staff: 2 s floor');
  // spares: hardware flavors in 5 s even with no staff
  sim.state.run.staff = 0; sim.buy('mit_spares');
  let hw = null;
  for (let i = 0; i < 20 && hw === null; i++) { sim.dev.spawnIncident(); const e = got('incident').at(-1).p; if (e.hardware) hw = e.rack; else sim.tapIncident(e.rack); }
  assert.notEqual(hw, null);
  run(4.9); assert.ok(sim.state.run.racks[hw].incident); run(0.2); assert.equal(sim.state.run.racks[hw].incident, null);
});

test('§2 uptime falls (1 − efficiency)/s while red and recovers +1/s', () => {
  const { sim, run } = mkSim();
  sim.dev.give(1000); sim.buy('srv_pizza_box', 6); sim.buy('cool_box_fan'); sim.buy('srv_blade');
  sim.state.account.flags.breakerSeen = true; // skip the blackout beat; this test is about the slope
  run(0.1);
  const eff = sim.derived.efficiency;
  const u0 = sim.state.run.uptime;
  run(10);
  assertNear(u0 - sim.state.run.uptime, (1 - eff) * 10, 1e-6);
  sim.buy('pwr_pdu');
  const u1 = sim.state.run.uptime;
  run(1);
  assertNear(sim.state.run.uptime - u1, 1, 1e-6);
  run(60);
  assert.equal(sim.state.run.uptime, 100);
});

// ---------------------------------------------------------------------------------------------
test('§7 board opens at Rack 2 with three offers, one stressing a headroom meter; slots, terms, SLA, reroll', () => {
  const { sim, run, got } = mkSim({ seed: 5 });
  assert.equal(sim.pickContract('con_frobcoin').reason, 'not_offered');
  assert.equal(sim.reroll().reason, 'locked');
  sim.dev.give(500); sim.buy('srv_pizza_box', 8); sim.buy('rack');
  run(0.1);
  const board = sim.state.run.contracts.board;
  assert.equal(board.length, 3);
  assert.deepEqual([...board].sort(), ['con_frobcoin', 'con_minecraft', 'con_uncle_ray']);
  const d = sim.derived;
  const headroom = ['power', 'cooling', 'network'].filter(m => d[m].headroom);
  assert.ok(board.some(id => D.CONTRACTS.find(c => c.id === id).stresses.some(m => headroom.includes(m))), 'at least one offer stresses a headroom meter');
  const rows = sim.shopRows('contracts');
  assert.equal(rows.filter(r => r.kind === 'contract').length, 3);
  assert.equal(rows.at(-1).id, 'reroll');
  assert.equal(sim.pickContract('con_frobcoin').ok, true);
  assert.equal(sim.state.run.contracts.active[0].termLeft, 600);
  assert.equal(sim.pickContract('con_uncle_ray').reason, 'slots', 'one slot in the garage');
  assert.equal(sim.state.account.lifetime.contracts, 1);
  assert.ok(sim.state.account.milestones.includes('ms_first_contract'));
  assertNear(sim.derived.contractMult, 1.5, 1e-9);
  assertNear(sim.derived.cooling.demand, 8 * 0.25 * 1.4, 1e-9, 'FrobCoin heat ×1.4');
  assert.equal(sim.state.run.contracts.board.length, 2, 'FrobCoin left the board; only two others exist in the garage');
  // manual reroll costs 30 s of income
  const inc = sim.derived.income, cash = sim.state.run.cash;
  assert.equal(sim.reroll().ok, true);
  assertNear(cash - sim.state.run.cash, 30 * inc, 1e-6);
  assert.equal(sim.state.run.contracts.boardAge, 0);
  // term expires after 600 s of active play with a toast and no penalty
  run(599.8);
  assert.equal(sim.state.run.contracts.active.length, 1);
  run(0.3);
  assert.equal(sim.state.run.contracts.active.length, 0);
  assert.ok(got('toast').some(e => /Term up: FrobCoin/.test(e.p.text)));
  assert.ok(got('contractChanged').length >= 3);
  // the board rerolled itself at 5 minutes
  assert.ok(sim.state.run.contracts.boardAge < 300);
});

test('§7 Black Friday is a 3-minute term; Halcyon needs 10 AI Pods; later stages open two and three slots', () => {
  const { sim } = mkSim({ seed: 4 });
  sim.dev.jump(4); sim.dev.give(1e9);
  const seen = new Set();
  for (let i = 0; i < 40; i++) { sim.reroll(); sim.state.run.contracts.board.forEach(id => seen.add(id)); }
  assert.ok(seen.has('con_black_friday') && seen.has('con_hyperscaler') && seen.has('con_county'), [...seen].join());
  assert.ok(!seen.has('con_halcyon'), 'never offered without 10 pods');
  assert.ok(!seen.has('con_ministry'), 'Campus only');
  sim.buy('srv_ai_pod', 10);
  for (let i = 0; i < 40 && !seen.has('con_halcyon'); i++) { sim.reroll(); sim.state.run.contracts.board.forEach(id => seen.add(id)); }
  assert.ok(seen.has('con_halcyon'), 'offered once ten pods are racked');
  sim.state.run.contracts.board = ['con_black_friday', 'con_halcyon', 'con_county'];
  assert.equal(sim.pickContract('con_black_friday').ok, true);
  assert.equal(sim.state.run.contracts.active[0].termLeft, 180);
  assert.equal(sim.pickContract('con_halcyon').ok, true, 'two slots in the Hall');
  assert.equal(sim.pickContract('con_county').reason, 'slots');
  assertNear(sim.derived.contractMult, 1 + 2 + 2, 1e-9, 'Black Friday ×3 + Halcyon ×3 stack additively');
  assertNear(sim.derived.network.demand / computeDerived({ ...sim.state, run: { ...sim.state.run, contracts: { active: [], board: [], boardAge: 0 } } }, D).network.demand, 1.5, 1e-9, 'net 3.0 × 0.5');
});

// ---------------------------------------------------------------------------------------------
test('§8 events: one every 4-6 min from the Colo on; effects, mitigations, viral headroom, investor, DDoS scrub', () => {
  const { sim, run, got } = mkSim({ seed: 11 });
  run(400);
  assert.equal(got('event').length, 0, 'none in the garage');
  sim.dev.jump(2); sim.dev.give(1e5); sim.buy('srv_gpu_node', 2); sim.buy('pwr_genset'); sim.buy('cool_split_ac'); sim.buy('net_fiber_uplink');
  assert.equal(sim.buy('staff').ok, true, 'Dale auto-resolves the incidents nobody taps in this test');
  const t0 = sim.state.run.runTime;
  run(1200);
  assert.ok(sim.state.run.uptime > 95 && sim.derived.darkRacks === 0, `uptime ${sim.state.run.uptime}`);
  // every scheduled event toasts (started or defused: the genset covers 90% of power, so flickers are defused)
  const fired = got('toast').filter(e => e.p.kind === 'event').map(e => e.t);
  assert.ok(fired.length >= 3 && fired.length <= 5, `${fired.length} events in 20 min`);
  assert.ok(fired[0] >= t0 + 240 - 0.2 && fired[0] <= t0 + 360 + 0.2, `first at ${fired[0] - t0} s after entering the Colo`);
  for (let i = 1; i < fired.length; i++) assert.ok(fired[i] - fired[i - 1] >= 239.8 && fired[i] - fired[i - 1] <= 360.2 + 180, `gap ${i} = ${fired[i] - fired[i - 1]}`);
  const tEnd = sim.state.run.runTime;
  const starts = got('event').filter(e => e.p.on && e.t <= tEnd - 181);
  assert.ok(starts.length >= 1 && starts.every(e => got('event').some(x => !x.p.on && x.p.id === e.p.id && x.t > e.t)), 'every started event ends');
  // forced effects
  while (sim.state.run.event) run(1);
  const cap0 = sim.derived.cooling.cap;
  sim.dev.fireEvent('ev_heatwave');
  assertNear(sim.derived.cooling.cap, cap0 * 0.7, 1e-9);
  run(120.1);
  assert.equal(sim.state.run.event, null);
  assertNear(sim.derived.cooling.cap, cap0, 1e-9);
  sim.dev.fireEvent('ev_ddos');
  assertNear(sim.derived.network.demand, computeDerived({ ...sim.state, run: { ...sim.state.run, event: null } }, D).network.demand * 3, 1e-9);
  for (let i = 0; i < 4; i++) assert.equal(sim.tapScrub().done, false);
  assert.equal(sim.tapScrub().done, true);
  assert.equal(sim.state.run.event, null);
  assert.equal(sim.tapScrub().reason, 'no_ddos');
  // viral: headroom at hit → income ×1.5
  assert.ok(sim.derived.network.headroom);
  const inc0 = sim.derived.income;
  sim.dev.fireEvent('ev_viral');
  assert.equal(sim.state.run.event.bonus, true);
  assertNear(sim.derived.eventIncome, 1.5, 1e-9);
  assert.ok(sim.derived.income > inc0 * 1.4);
  while (sim.state.run.event) run(1);
  // investor: ×3 only at uptime ≥ 99
  sim.state.run.uptime = 98;
  sim.dev.fireEvent('ev_investor_visit');
  assert.equal(sim.derived.eventIncome, 1);
  while (sim.state.run.event) run(1);
  sim.state.run.uptime = 100;
  sim.dev.fireEvent('ev_investor_visit');
  assert.equal(sim.derived.eventIncome, 3);
  while (sim.state.run.event) run(1);
  // mitigations defuse: UPS vs grid flicker, gensets ≥ 20%, dual-carrier vs fiber cut
  sim.state.run.infra.pwr_genset = 0; sim.state.run.mitigations = []; sim.state.run.uptime = 90;
  const ctxEv = (id) => { const n = got('event').length; const res = sim.dev.fireEvent(id); return { res, started: got('event').length > n }; };
  assert.equal(ctxEv('ev_grid_flicker').started, true, 'force skips mitigations');
  while (sim.state.run.event) run(1);
  // the scheduler path honours them: emulate by calling startEvent through tickEvents with a mitigation owned
  sim.buy('mit_ups');
  sim.state.run.nextEventAt = sim.state.run.runTime;
  const before = got('event').length;
  // pick the flicker deterministically by stubbing the pool: run until a flicker is scheduled or 12 events pass
  let defused = false;
  for (let i = 0; i < 12 && !defused; i++) {
    sim.state.run.nextEventAt = sim.state.run.runTime; run(0.1);
    defused = got('toast').some(e => /Grid flicker\. UPS held/.test(e.p.text));
    while (sim.state.run.event) run(1);
  }
  assert.ok(defused, 'UPS held a grid flicker');
  assert.ok(!got('event').slice(before).some(e => e.p.id === 'ev_grid_flicker' && e.p.on), 'a defused flicker never starts');
});

test('§15 buying a mitigation shows: a toast with its line and infraAdded{id} for the scene', () => {
  const { sim, got } = mkSim();
  sim.dev.jump(2); sim.dev.give(1e5);
  const toasts = got('toast').length, infra = got('infraAdded').length;
  assert.equal(sim.buy('mit_ups').ok, true);
  const t = got('toast').slice(toasts);
  assert.equal(t.length, 1);
  assert.equal(t[0].p.text, 'UPS installed. A very heavy battery with a very small screen.');
  assert.equal(t[0].p.kind, 'good');
  assert.deepEqual(got('infraAdded').slice(infra).map(e => e.p), [{ id: 'mit_ups', count: 1 }]);
  assert.equal(sim.shopRows('infra').find(r => r.id === 'mit_ups').badge, 'Owned');
  assert.equal(sim.buy('mit_ups').reason, 'full', 'one-off');
  sim.dev.jump(3);
  assert.equal(sim.buy('mit_spares').ok, true);
  assert.match(got('toast').at(-1).p.text, /^Spares closet installed\. One of everything/);
});

// ---------------------------------------------------------------------------------------------
test('§9 goal cards: short = next in order, mid = next beat (valuation / stage / hall full / megawatt), long = the Exit line; the rest in order', () => {
  const { sim } = mkSim();
  const ids = D.MILESTONES.map(m => m.id);
  assert.deepEqual(sim.goals().map(g => g.id), ['ms_lights_on', 'ms_1000', 'ms_make_me_a_million'], 'a fresh garage');
  const all = sim.goals(ids.length).map(g => g.id);
  assert.equal(all.length, ids.length, 'everything is reachable in a fresh garage start');
  assert.deepEqual(all.slice(3), ids.filter(id => !all.slice(0, 3).includes(id)), 'past three: list order');
  assert.deepEqual(sim.goals(1).map(g => g.id), ['ms_lights_on']); assert.deepEqual(sim.goals(2).map(g => g.id), ['ms_lights_on', 'ms_1000']);
  // §10: a Colo start with everything up to Dale earned reads Hire Dale / $100,000 / Make Me a Million
  const storage = memStorage();
  storage.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, account: { shares: 3, milestones: ids.slice(0, ids.indexOf('ms_hire_dale')) }, run: { cash: 50 } }));
  const colo = mkSim({ storage }); colo.sim.resetRun();
  assert.equal(colo.sim.state.run.stage, 2);
  assert.ok(colo.sim.state.account.milestones.includes('ms_sign_the_lease'), 'the stage milestone lands at the start');
  assert.deepEqual(colo.sim.goals().map(g => g.id), ['ms_hire_dale', 'ms_100000', 'ms_make_me_a_million']);
  // past the million the mid card is the next beat (Warehouse) and the long card climbs the Exit line by the valuation
  // each step takes: $10M, First Exit ($27M glow), 3 Exits (8× that), $1T, the soft ending, 10 Exits
  colo.sim.state.run.valuation = 1e6; colo.run(0.1);
  const ladder = ['ms_10m', 'ms_first_exit', 'ms_3_exits', 'ms_1_trillion', 'ms_you_are_the_cloud', 'ms_10_exits'];
  for (const id of ladder) {
    assert.deepEqual(colo.sim.goals().map(g => g.id), ['ms_hire_dale', 'ms_warehouse', id]);
    colo.sim.state.account.milestones.push(id);
  }
  assert.deepEqual(colo.sim.goals().map(g => g.id), ['ms_hire_dale', 'ms_warehouse', 'ms_100_servers'], 'no Exit-line milestone left: list order fills the slot');
  // the mid class exhausted too: three in list order
  for (const m of D.MILESTONES) if (['valuation', 'stage', 'allRacksFull', 'power'].includes(m.cond.type)) colo.sim.state.account.milestones.push(m.id);
  assert.deepEqual(colo.sim.goals().map(g => g.id), ['ms_hire_dale', 'ms_100_servers', 'ms_10_minutes_with_no_red']);
});

test('§9 milestones: +1% each, emitted once, account level; goals() is a short / mid / long spread', () => {
  const { sim, run, got } = mkSim();
  assert.deepEqual(sim.goals().map(g => g.id), ['ms_lights_on', 'ms_1000', 'ms_make_me_a_million']);
  sim.buy('srv_pizza_box');
  assert.deepEqual(got('milestone').map(e => e.p.id), ['ms_lights_on']);
  assertNear(sim.derived.stack, 1.01, 1e-12);
  sim.buy('srv_pizza_box', 2);
  assert.equal(got('milestone').length, 1, 'once only');
  sim.dev.give(200); sim.buy('srv_pizza_box', 2); run(0.1);
  assert.ok(got('milestone').some(e => e.p.id === 'ms_its_getting_warm_in_here'), 'cooling amber at box 5');
  sim.buy('cool_box_fan');
  assert.ok(got('milestone').some(e => e.p.id === 'ms_buy_a_fan'));
  assert.deepEqual(sim.goals().map(g => g.id), ['ms_just_the_one', 'ms_1000', 'ms_make_me_a_million'], 'the short slot moves on, mid and long hold');
  sim.state.run.valuation = 1e6; run(0.1);
  const m = got('milestone').find(e => e.p.id === 'ms_make_me_a_million');
  assert.equal(m.p.fx, 'sweep'); assert.equal(m.p.screenshot, true);
  assertNear(sim.derived.stack, 1 + 0.01 * sim.state.account.milestones.length, 1e-12);
});

test('§6 globals: one per decade of valuation, ×1.25, cost 60% of the threshold', () => {
  const { sim, got } = mkSim();
  assert.equal(sim.buy('global').reason, 'locked');
  sim.dev.give(1000);
  assert.equal(sim.cost('global'), 600);
  assert.equal(sim.buy('global').ok, true);
  assert.deepEqual(got('global')[0].p.n, 1);
  assertNear(sim.derived.stack, 1.25 * (1 + 0.01 * sim.state.account.milestones.length), 1e-12);
  assert.equal(sim.buy('global').reason, 'locked', 'next needs $10K');
  assert.equal(sim.cost('global'), 6000);
});

// ---------------------------------------------------------------------------------------------
test('§11 offline: 8 h away pays 2.2 h of income, 25% of it to valuation, summary + three incidents after the card', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(2500); a.sim.buy('srv_pizza_box', 8); a.sim.buy('rack', 3); a.sim.buy('srv_pizza_box', 'max'); a.sim.buy('pwr_subpanel'); a.sim.buy('cool_box_fan', 3); a.sim.buy('net_switch');
  a.run(1);
  const income = a.sim.derived.income, cash = a.sim.state.run.cash, val = a.sim.state.run.valuation;
  assert.ok(income > 0 && a.sim.derived.efficiency === 1);
  a.sim.saveNow();
  assertNear(offlineEarn(1, 8 * H, D), 2.2 * H, 1e-6);
  assertNear(offlineEarn(1, 30 * H, D), 2.2 * H, 1e-6, 'capped at 8 h');
  assertNear(offlineEarn(1, 8 * H, D, D.PERKS.find(p => p.offline).offline), 4 * H, 1e-6, 'perk: 50% tail');
  assertNear(offlineEarn(1, 24 * H, D, D.PERKS.find(p => p.offline).offline), 12 * H, 1e-6, 'perk: 24 h cap');
  const b = mkSim({ storage, t0: a.clock.t + 8 * H * 1000 });
  const earn = income * 2.2 * H;
  assertNear(b.sim.state.run.cash, cash + earn, 1e-6 * earn, 'cash');
  assertNear(b.sim.state.run.valuation, val + 0.25 * earn, 1e-6 * earn, 'valuation gets 25%');
  const off = b.got('offline');
  assert.equal(off.length, 1, 'offline summary emitted on the first update');
  assertNear(off[0].p.summary.earn, earn, 1e-6 * earn);
  assert.match(off[0].p.summary.text, /While you were away: \+\$.* in 8h 00m\./);
  assert.match(off[0].p.summary.text, /Bottleneck while you were out: (Power|Cooling|Network) \(\d+%\)/);
  assert.equal(b.sim.offline.staff, 0);
  assert.equal(b.got('incident').length, 0, 'not before the card counts up');
  b.run(30);
  assert.equal(b.got('incident').length, 0, 'the card is still up (no offlineAck): their 20 s windows must not run under it');
  assert.equal(b.sim.offlineAck().pending, 3);
  b.run(0.3);
  assert.equal(b.got('incident').length, 3, 'three incidents right after "Back to work"');
  const t0 = b.got('incident')[0].t;
  assert.ok(b.got('incident').every(e => e.t >= t0 && e.t <= t0 + 0.2) && b.sim.state.run.racks.filter(r => r.incident).every(r => r.incident.t0 >= 30), 'windows start at dismissal');
  assert.equal(b.sim.offlineAck().pending, 0, 'idempotent');
  // a quick reload gives no card
  b.sim.saveNow();
  const c = mkSim({ storage, t0: b.clock.t + 20_000 });
  assert.equal(c.sim.offline, null);
  assert.equal(c.got('offline').length, 0);
  // a ui that never acknowledges still gets the beat: 90 s after load (the three saved incidents are tapped first so
  // three lit racks are free)
  c.sim.state.run.racks.forEach((r, i) => { if (r.incident) c.sim.tapIncident(i); });
  c.run(1); c.sim.saveNow();
  const dd = mkSim({ storage, t0: c.clock.t + 3 * H * 1000 });
  dd.run(89.5);
  assert.equal(dd.got('incident').length, 0);
  dd.run(1);
  assert.equal(dd.got('incident').length, 3, 'fallback without an ack');
});

test('§11 a savedAt that is not an epoch (an old performance.now() stamp) pays nothing instead of 8 h', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(500); a.sim.buy('srv_pizza_box', 6); a.sim.buy('cool_box_fan'); a.run(1); a.sim.saveNow();
  const blob = JSON.parse(storage.dump());
  blob.account.savedAt = 6040.39;
  storage.setItem(D.SAVE_KEY, JSON.stringify(blob));
  const cash = blob.run.cash;
  const b = mkSim({ storage, t0: a.clock.t + 8 * H * 1000 });
  assert.equal(b.sim.offline, null, 'no card');
  assert.equal(b.sim.state.run.cash, cash, 'no earnings');
  assert.equal(b.sim.state.account.savedAt, b.clock.t, 'stamp replaced by now');
  assert.equal(migrate({ v: 1, account: { shares: 0, savedAt: 123 }, run: { cash: 1 } }, D, T0).account.savedAt, T0);
  assert.equal(migrate({ v: 1, account: { shares: 0, savedAt: T0 + 5 }, run: { cash: 1 } }, D, T0).account.savedAt, T0 + 5);
});

test('§11 "Dale kept the lights on" when staffed', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.jump(2); a.sim.dev.give(1e5); a.sim.buy('srv_gpu_node'); a.sim.buy('cool_split_ac'); a.sim.buy('pwr_genset'); a.sim.buy('staff');
  a.run(1); a.sim.saveNow();
  const b = mkSim({ storage, t0: a.clock.t + 2 * H * 1000 });
  assert.match(b.sim.offline.text, /Dale kept the lights on\./);
  assert.equal(b.sim.offline.staff, 1);
});

// ---------------------------------------------------------------------------------------------
test('§11 resume(): a hidden tab credits ≥ 60 s away once on return, the next update() is a first frame; under 60 s nothing', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(2500); a.sim.buy('srv_pizza_box', 8); a.sim.buy('rack', 3); a.sim.buy('srv_pizza_box', 'max'); a.sim.buy('pwr_subpanel'); a.sim.buy('cool_box_fan', 3); a.sim.buy('net_switch');
  a.run(1);
  const income = a.sim.derived.income;
  assert.ok(income > 0 && a.sim.derived.efficiency === 1);
  // hidden 30 s: no card, no credit beyond the 2 s catch-up
  a.sim.saveNow();
  const cash0 = a.sim.state.run.cash;
  a.clock.t += 30_000;
  assert.deepEqual(a.sim.resume().offline, false);
  a.step(16);
  assert.equal(a.got('offline').length, 0);
  assert.ok(a.sim.state.run.cash - cash0 <= income * 2.1, 'at most the 2 s catch-up');
  // hidden 3 h: credited as a reload would be, once
  a.sim.saveNow();
  const cash1 = a.sim.state.run.cash, val1 = a.sim.state.run.valuation;
  a.clock.t += 3 * H * 1000;
  const tResume = a.clock.t;
  const r = a.sim.resume();
  assert.equal(r.ok && r.offline, true);
  assertNear(r.elapsed, 3 * H, 1e-6);
  const earn = offlineEarn(income, 3 * H, D);
  assertNear(a.sim.state.run.cash, cash1 + earn, 1e-6 * earn, 'credited');
  assertNear(a.sim.state.run.valuation, val1 + 0.25 * earn, 1e-6 * earn, '25% to valuation');
  assert.equal(a.sim.resume().offline, false, 'pageshow after visibilitychange: a second resume() credits nothing');
  assertNear(a.sim.state.run.cash, cash1 + earn, 1e-6 * earn, 'still credited once');
  assert.equal(JSON.parse(storage.dump()).account.savedAt, tResume, 'saved on resume with a fresh savedAt');
  assert.equal(a.got('offline').length, 0, 'the summary waits for the next update()');
  a.step(16);
  assert.equal(a.got('offline').length, 1, 'first frame after resume: the offline summary, no catch-up ticks');
  assertNear(a.sim.state.run.cash, cash1 + earn, 1e-6 * earn, 'no catch-up tick ran on that frame');
  assert.equal(a.sim.state.run.pendingIncidents, 3);
  a.run(5);
  assert.equal(a.got('incident').length, 0, 'the incidents wait for offlineAck()');
  a.sim.offlineAck(); a.run(0.3);
  assert.equal(a.got('incident').length, 3);
  // a tab another tab has superseded does not credit anything (it is paused)
  const other = mkSim({ storage, t0: a.clock.t + 1000 });
  other.run(5.1);
  a.step(5200);
  assert.equal(a.sim.saveStatus.superseded, true);
  const cashPaused = a.sim.state.run.cash;
  a.clock.t += 3 * H * 1000;
  assert.equal(a.sim.resume().ok, false);
  assert.equal(a.sim.state.run.cash, cashPaused);
});

test('§11 the window is paid once: load() stamps it, so a resume() before the first autosave (a tab that loaded hidden) pays only the time since', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(2500); a.sim.buy('srv_pizza_box', 8); a.sim.buy('rack', 3); a.sim.buy('srv_pizza_box', 'max'); a.sim.buy('pwr_subpanel'); a.sim.buy('cool_box_fan', 3); a.sim.buy('net_switch');
  a.run(1);
  const income = a.sim.derived.income, cash0 = a.sim.state.run.cash, val0 = a.sim.state.run.valuation;
  assert.ok(income > 0 && a.sim.derived.efficiency === 1);
  a.sim.saveNow();
  const stamp = JSON.parse(storage.dump()).account.savedAt;
  // the link opens in a background tab 3 h later: load() runs, rAF does not, then the first visibilitychange → resume()
  const clock = { t: a.clock.t + 3 * H * 1000 };
  const b = createSim({ now: () => clock.t, storage, rng: mulberry32(1) });
  const earn3 = offlineEarn(income, 3 * H, D);
  assertNear(b.state.run.cash, cash0 + earn3, 1e-6 * earn3, 'load() paid the window');
  assert.equal(b.state.account.savedAt, clock.t, 'and stamped it in memory');
  assert.equal(JSON.parse(storage.dump()).account.savedAt, stamp, 'the stored blob keeps the old stamp until the first save');
  assert.equal(b.resume().offline, false, 'nothing to pay again');
  assertNear(b.state.run.cash, cash0 + earn3, 1e-6 * earn3, 'paid once');
  assertNear(b.state.run.valuation, val0 + 0.25 * earn3, 1e-6 * earn3, 'valuation once');
  // the tab is looked at 2 h after it loaded: real time away, paid once, on the same card as the first window
  clock.t += 2 * H * 1000;
  const r = b.resume();
  assert.equal(r.offline, true); assertNear(r.elapsed, 2 * H, 1e-6);
  const earn2 = offlineEarn(income, 2 * H, D);
  assertNear(b.state.run.cash, cash0 + earn3 + earn2, 1e-6 * earn3, 'the second window only');
  assert.equal(JSON.parse(storage.dump()).account.savedAt, clock.t, 'saved on resume');
  const offs = []; b.on('offline', p => offs.push(p.summary));
  b.update(clock.t);
  assert.equal(offs.length, 1, 'one card');
  assertNear(offs[0].earn, earn3 + earn2, 1e-6 * earn3, 'the card sums both windows, matching the cash');
  assertNear(offs[0].elapsed, 5 * H, 1e-6);
  assert.match(offs[0].text, /in 5h 00m\./);
  assert.equal(b.state.run.pendingIncidents, 3, 'three incidents, not six');
  assert.equal(b.resume().offline, false, 'a pageshow right after credits nothing');
  // a tab killed inside its first 5 s never saved: the next load pays that stretch exactly once, from the stored stamp
  storage.setItem(D.SAVE_KEY, JSON.stringify({ ...JSON.parse(storage.dump()), account: { ...JSON.parse(storage.dump()).account, savedAt: stamp }, run: { ...JSON.parse(storage.dump()).run, cash: cash0, valuation: val0 } }));
  const c = mkSim({ storage, t0: clock.t });
  const earn5 = offlineEarn(income, 5 * H, D);
  assertNear(c.sim.state.run.cash, cash0 + earn5, 1e-6 * earn5, 'one 5 h window');
});

test('§11 a wall-clock gap with no visibilitychange (sleep with the tab in front; a lock whose hidden event fires at wake) is paid as offline', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(2500); a.sim.buy('srv_pizza_box', 8); a.sim.buy('rack', 3); a.sim.buy('srv_pizza_box', 'max'); a.sim.buy('pwr_subpanel'); a.sim.buy('cool_box_fan', 3); a.sim.buy('net_switch');
  a.run(5.1); // an autosave has stamped savedAt
  const income = a.sim.derived.income, cash0 = a.sim.state.run.cash, rt0 = a.sim.state.run.runTime, off0 = a.got('offline').length;
  const sinceSave = (a.clock.t - JSON.parse(storage.dump()).account.savedAt) / 1000;
  assert.ok(sinceSave >= 0 && sinceSave < 5);
  // Windows: performance.now() runs through sleep, so both clocks jump 3 h in one frame
  a.step(3 * H * 1000);
  const earn = offlineEarn(income, 3 * H + sinceSave, D);
  assertNear(a.sim.state.run.cash, cash0 + earn, 1e-6 * earn, 'paid as offline, not 2 s of catch-up');
  assert.equal(a.sim.state.run.runTime, rt0, 'no catch-up tick on the gap frame');
  assert.equal(JSON.parse(storage.dump()).account.savedAt, a.clock.t, 'saved with the window stamped');
  a.step(16);
  assert.equal(a.got('offline').length - off0, 1, 'one card on the next frame');
  assertNear(a.sim.offline.earn, earn, 1e-6 * earn);
  assert.equal(a.sim.state.run.pendingIncidents, 3);
  assert.equal(a.sim.resume().offline, false, 'a visibilitychange that arrives late pays nothing twice');
  a.run(1);
  assertNear(a.sim.state.run.runTime, rt0 + 1, 1e-6, 'then normal ticks');
  // macOS / Linux: performance.now() excludes sleep, so update() sees 16 ms while the wall moved 3 h
  const wall = { t: T0 }, perf = { t: 100 };
  const b = createSim({ now: () => wall.t, storage: memStorage(), rng: mulberry32(2) });
  b.update(perf.t);
  b.dev.give(500); b.buy('srv_pizza_box', 6); b.buy('cool_box_fan');
  for (let i = 0; i < 60; i++) { wall.t += 100; perf.t += 100; b.update(perf.t); }
  const incB = b.derived.income, cashB = b.state.run.cash, rtB = b.state.run.runTime;
  const sinceB = (wall.t - b.state.account.savedAt) / 1000;
  wall.t += 3 * H * 1000; perf.t += 16;
  b.update(perf.t);
  const earnB = offlineEarn(incB, 3 * H + sinceB, D);
  assertNear(b.state.run.cash, cashB + earnB, 1e-6 * earnB, 'the wall clock is what counts');
  assert.equal(b.state.run.runTime, rtB);
  wall.t += 16; perf.t += 16; b.update(perf.t);
  assertNear(b.offline.earn, earnB, 1e-6 * earnB);
  // Windows lock: the hidden event only fires at wake, so saveNow() lands after the gap. savedAt stays at the credited
  // time (not the write time) and the resume() that follows pays the window.
  const c = mkSim({ storage: memStorage() });
  c.sim.dev.give(500); c.sim.buy('srv_pizza_box', 6); c.sim.buy('cool_box_fan'); c.run(1);
  const incC = c.sim.derived.income, cashC = c.sim.state.run.cash, tC = c.clock.t;
  c.clock.t += 3 * H * 1000;
  assert.equal(c.sim.saveNow(), true);
  assert.equal(JSON.parse(c.storage.dump()).account.savedAt, tC, 'savedAt is the time credited up to');
  assert.equal(c.sim.saveStatus.lastSavedAt, c.clock.t, 'the settings line shows the write time');
  assert.equal(c.sim.resume().offline, true);
  const earnC = offlineEarn(incC, 3 * H, D);
  assertNear(c.sim.state.run.cash, cashC + earnC, 1e-6 * earnC, 'the locked hours are paid');
  assert.equal(JSON.parse(c.storage.dump()).account.savedAt, c.clock.t);
  // under a minute is still the catch-up: no card, and the autosave may stamp over it
  const d = mkSim({ storage: memStorage() });
  d.sim.dev.give(500); d.sim.buy('srv_pizza_box', 6); d.run(1);
  const rtD = d.sim.state.run.runTime, offD = d.got('offline').length;
  d.step(59_000); d.step(16);
  assertNear(d.sim.state.run.runTime, rtD + 2, 1e-6); assert.equal(d.got('offline').length, offD);
});

test('§11 resume() mid-event ends the event through the bus and pays the time away at the saved base income', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.jump(2); a.sim.dev.give(1e5);
  a.sim.buy('srv_gpu_node', 4); a.sim.buy('cool_split_ac'); a.sim.buy('pwr_genset'); a.sim.buy('net_fiber_uplink');
  a.run(1);
  assert.equal(a.sim.derived.efficiency, 1);
  const income = a.sim.derived.income;
  a.sim.state.run.uptime = 100;
  a.sim.dev.fireEvent('ev_investor_visit');
  assert.equal(a.sim.derived.eventIncome, 3, 'the golden cookie is running');
  assertNear(a.sim.derived.income, 3 * income, 1e-9);
  a.sim.saveNow();
  const cash1 = a.sim.state.run.cash, val1 = a.sim.state.run.valuation, events = a.got('event').length;
  a.clock.t += 3 * H * 1000;
  const r = a.sim.resume();
  assert.equal(r.ok && r.offline, true);
  assert.equal(a.sim.state.run.event, null, 'the event does not survive the absence');
  assert.deepEqual(a.got('event').slice(events).map(e => [e.p.id, e.p.on]), [['ev_investor_visit', false]], 'ended on the bus so scene and ui drop it');
  const earn = offlineEarn(income, 3 * H, D);
  assertNear(a.sim.state.run.cash, cash1 + earn, 1e-6 * earn, 'paid at the saved income, not ×3');
  assertNear(a.sim.state.run.valuation, val1 + 0.25 * earn, 1e-6 * earn);
  assertNear(a.sim.offline.earn, earn, 1e-6 * earn, 'the card agrees');
  assertNear(a.sim.offline.income, income, 1e-9);
  assert.equal(a.sim.derived.eventIncome, 1);
  // the penalty direction: hidden during the breaker blackout pays the dimmed income, not $0, and no breaker toast
  const b = mkSim({ storage: memStorage() });
  b.sim.dev.give(500); b.sim.buy('srv_pizza_box', 6); b.sim.buy('cool_box_fan'); b.sim.buy('srv_blade');
  b.run(0.1);
  assert.equal(b.sim.state.run.event?.id, 'ev_breaker');
  assert.equal(b.sim.derived.income, 0);
  const dimmed = computeDerived({ ...b.sim.state, run: { ...b.sim.state.run, event: null } }, D).income;
  assert.ok(dimmed > 0);
  b.sim.saveNow();
  const bToasts = b.got('toast').length;
  b.clock.t += 2 * H * 1000;
  assert.equal(b.sim.resume().offline, true);
  assert.equal(b.sim.state.run.event, null);
  assertNear(b.sim.offline.earn, offlineEarn(dimmed, 2 * H, D), 1e-9, 'the blackout does not zero the night');
  assert.ok(!b.got('toast').slice(bToasts).some(e => /Breaker\. Just the one/.test(e.p.text)), 'quiet end: no breaker line on return');
  assert.equal(b.got('event').at(-1).p.on, false);
});

test('§11 nothing earned, nothing reported: an untouched or all-dark hall gets no "+$0.00" return card', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.run(1); a.sim.saveNow();
  const b = mkSim({ storage, t0: a.clock.t + 8 * H * 1000 });
  assert.equal(b.sim.offline, null, 'no card');
  assert.equal(b.got('offline').length, 0);
  assert.equal(b.sim.state.run.pendingIncidents, 0, 'no return incidents queued (they need a lit rack anyway)');
  assert.equal(b.sim.state.run.cash, D.START.cash);
  assert.equal(b.sim.state.run.valuation, 0);
  // resume() the same way
  b.sim.saveNow(); b.clock.t += 8 * H * 1000;
  const tResume = b.clock.t;
  assert.equal(b.sim.resume().offline, true, 'the time away is acknowledged (savedAt moves on)');
  assert.equal(JSON.parse(storage.dump()).account.savedAt, tResume);
  assert.equal(b.sim.offline, null); b.step(16); assert.equal(b.got('offline').length, 0);
  // a hall whose every rack went dark earns nothing either
  const c = mkSim({ storage: memStorage() });
  c.sim.dev.give(100); c.sim.buy('srv_pizza_box', 4);
  assert.equal(c.sim.dev.spawnIncident(), true);
  c.run(20.2);
  assert.equal(c.sim.state.run.racks[0].dark, true); assert.equal(c.sim.derived.income, 0);
  c.sim.saveNow();
  const d = mkSim({ storage: c.storage, t0: c.clock.t + 8 * H * 1000 });
  assert.equal(d.sim.offline, null); assert.equal(d.sim.state.run.pendingIncidents, 0);
  assert.equal(d.sim.state.run.racks[0].dark, true, 'the dark rack is still there to late-tap');
});

test('§10 exit: shares = floor(cbrt(valuation/1e6)), glow at max(3, 2×current), perks, persists/resets table', () => {
  assert.equal(sharesFor(999_999, D), 0); assert.equal(sharesFor(1e6, D), 1); assert.equal(sharesFor(8e6, D), 2); assert.equal(sharesFor(27e6, D), 3);
  assert.equal(sharesFor(216e6, D), 6); assert.equal(sharesFor(1.7e9, D), 11); assert.equal(sharesFor(1e12, D), 100);
  assert.equal(estMinutes(1e6, D), 26); assert.equal(estMinutes(1e7, D), 38); assert.ok(estMinutes(3e6, D) > 26 && estMinutes(3e6, D) < 38);
  const { sim, run: advance, got } = mkSim();
  sim.dev.give(5e4); sim.buy('srv_pizza_box', 8); sim.buy('rack', 3); sim.buy('srv_pizza_box', 'max'); sim.buy('upg:srv_pizza_box'); sim.buy('cool_box_fan', 2); sim.buy('net_switch'); sim.buy('pwr_pdu'); sim.buy('global');
  advance(6); // red power trips the breaker and earns Just the One; cooling amber is seen
  sim.state.run.uptime = 90; sim.state.account.settings.sound = false;
  assert.equal(sim.exit().reason, 'locked');
  sim.state.run.valuation = 1e6;
  let p = sim.exitPreview();
  assert.deepEqual([p.available, p.glow, p.gained, p.newTotal], [true, false, 1, 1]);
  assert.equal(p.glowAtValuation, 27e6);
  assert.equal(sim.shopRows('exit')[0].flavor, D.EXIT.tooltipAt1M);
  sim.state.run.valuation = 27e6;
  p = sim.exitPreview();
  assert.deepEqual([p.available, p.glow, p.gained, p.newTotal, p.newMult], [true, true, 3, 3, 1.3]);
  assert.deepEqual(p.perksUnlocked.map(x => x.shares), [1, 3]);
  const milestones = sim.state.account.milestones.slice(), lifetime = { ...sim.state.account.lifetime };
  const r = sim.exit();
  assert.deepEqual([r.ok, r.shares, r.gained], [true, 3, 3]);
  assert.deepEqual(got('exit')[0].p.shares, 3);
  assert.deepEqual(got('stageChanged').at(-1).p, { from: 1, to: 2 });
  const { account, run } = sim.state;
  // persists
  assert.equal(account.shares, 3);
  assert.ok(milestones.every(id => account.milestones.includes(id)));
  assert.ok(account.milestones.includes('ms_first_exit'));
  assert.equal(account.lifetime.exits, 1);
  assert.equal(account.lifetime.servers, lifetime.servers);
  assert.equal(account.skyline, 1);
  assert.equal(account.settings.sound, false);
  // resets, with the 3-share Colo perk and perk 1's three garage units
  assert.equal(run.stage, 2); assert.equal(run.startStage, 2);
  assert.equal(run.racks.length, 4);
  assert.ok(run.racks.every(rk => rk.servers.every(s => s === null) && !rk.dark && !rk.incident));
  assert.equal(run.cash, 2500); assert.equal(run.valuation, 0); assert.equal(run.uptime, 100); assert.equal(run.runTime, 0); assert.equal(run.noRedSince, 0);
  assert.deepEqual(run.infra, { cool_box_fan: 1, pwr_pdu: 1, net_switch: 1 });
  assert.deepEqual([run.bought, run.upgrades, run.globals, run.effUpgrades, run.mitigations, run.staff], [{}, {}, 0, [], [], 0]);
  assert.deepEqual(run.contracts.active, []);
  assert.equal(run.contracts.board.length, 3, 'board rerolled for the Colo (4 racks ≥ 2)');
  assert.equal(run.event, null);
  assertNear(sim.derived.stack, 1.3 * (1 + 0.01 * account.milestones.length), 1e-12, '+10% per share');
  // glow rule now needs 6 total: $27M again
  sim.state.run.valuation = 8e6;
  assert.deepEqual([sim.exitPreview().gained, sim.exitPreview().glow], [2, false]);
  sim.state.run.valuation = 27e6;
  assert.equal(sim.exitPreview().glow, true);
  assert.deepEqual(sim.goals().map(g => g.id).slice(0, 1), ['ms_fix_5_incidents']);
});

test('§10 start perks do not stack; 1 share = garage with $2,500 and three units', () => {
  const storage = memStorage();
  storage.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, account: { shares: 1 }, run: { cash: 50 } }));
  const a = mkSim({ storage }); a.sim.resetRun();
  assert.deepEqual([a.sim.state.run.stage, a.sim.state.run.cash, a.sim.state.run.racks.length], [1, 2500, 1]);
  assert.deepEqual(a.sim.state.run.infra, { cool_box_fan: 1, pwr_pdu: 1, net_switch: 1 });
  storage.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, account: { shares: 35 }, run: { cash: 50 } }));
  const b = mkSim({ storage }); b.sim.resetRun();
  assert.deepEqual([b.sim.state.run.stage, b.sim.state.run.cash, b.sim.state.run.racks.length], [4, 1e6, 36]);
  assert.equal(b.sim.shopRows('build').find(r => r.id === 'srv_sled').visible, true, 'cash unlocks the Sled: no softlock');
});

// ---------------------------------------------------------------------------------------------
test('§14.7 save roundtrip, autosave every 5 s, export/import, migrate v0-less blob, corrupt JSON', () => {
  const storage = memStorage();
  const a = mkSim({ storage });
  a.sim.dev.give(300); a.sim.buy('srv_pizza_box', 6); a.sim.buy('cool_box_fan');
  a.run(4.9);
  assert.equal(storage.dump(), undefined, 'not yet');
  a.run(0.2);
  const blob = JSON.parse(storage.dump());
  assert.equal(blob.v, 1);
  assert.equal(blob.account.savedAt, a.clock.t - 100, 'saved on the tick that crossed 5 s');
  assert.deepEqual(blob.run.racks[0].servers.slice(0, 6), Array(6).fill('srv_pizza_box'));
  const exp = a.sim.exportSave();
  assert.match(exp, /^[A-Za-z0-9+/=]+$/);
  const b = mkSim({ storage: memStorage() });
  assert.equal(b.sim.importSave(exp).ok, true);
  const strip = s => JSON.parse(JSON.stringify({ ...s, account: { ...s.account, savedAt: 0, session: null } })); // per-tab fields
  assert.deepEqual(strip(b.sim.state), strip(a.sim.state));
  assert.deepEqual(b.got('stageChanged').at(-1).p, { from: 1, to: 1 });
  assert.equal(b.sim.importSave('not a save at all').reason, 'corrupt');
  assert.equal(b.sim.importSave(btoa('{"v":1,"account":5}')).reason, 'corrupt');
  // v0: no version field, partial shapes, junk inside
  const v0 = { account: { shares: 2, milestones: ['ms_lights_on', 'ms_bogus'], lifetime: { exits: 1 } },
    run: { cash: 123.5, stage: 2, racks: [{ servers: ['srv_gpu_node', 'nope', null] }, 'junk'], infra: { pwr_pdu: 2, bogus: 1 }, contracts: { active: [{ id: 'con_cattube', termLeft: 10 }, { id: 'con_county', termLeft: 10 }] }, uptime: 250, event: { id: 'ev_heatwave', tLeft: 5 } } };
  const m = migrate(v0, D, 5000);
  assert.equal(m.v, 1);
  assert.deepEqual([m.account.shares, m.account.milestones, m.account.lifetime.exits, m.account.lifetime.servers], [2, ['ms_lights_on'], 1, 0]);
  assert.deepEqual([m.run.cash, m.run.stage, m.run.racks.length], [123.5, 2, 2]);
  assert.deepEqual(m.run.racks[0].servers, ['srv_gpu_node', null, null, null, null, null, null, null]);
  assert.deepEqual(m.run.racks[1].servers, Array(8).fill(null));
  assert.deepEqual(m.run.infra, { pwr_pdu: 2 });
  assert.equal(m.run.contracts.active.length, 1, 'one slot in the Colo');
  assert.equal(m.run.uptime, 100);
  assert.equal(m.run.event.id, 'ev_heatwave');
  assert.equal(migrate('garbage', D, 0), null); assert.equal(migrate(null, D, 0), null); assert.equal(migrate([1], D, 0), null);
  assert.equal(migrate({ v: 1, account: 'x', run: {} }, D, 0), null);
  // corrupt storage → a fresh run, no throw; the blob is set aside under a backup key and the player is told once
  const bad = memStorage(); bad.setItem(D.SAVE_KEY, '{not json');
  const c = mkSim({ storage: bad });
  assert.equal(c.sim.state.run.cash, 50); assert.equal(c.sim.state.run.stage, 1);
  assert.equal(bad.getItem(`${D.SAVE_KEY}_corrupt`), '{not json', 'set aside, not overwritten');
  assert.equal(c.sim.saveStatus.corruptSetAside, true);
  assert.deepEqual(c.got('toast').filter(e => /could not be read/.test(e.p.text)).length, 1, 'toasted once the ui listens (first update)');
  c.run(5.1);
  assert.ok(JSON.parse(bad.dump()).run.cash < 50 + 1, 'the fresh account autosaves to the main key');
  assert.equal(bad.getItem(`${D.SAVE_KEY}_corrupt`), '{not json', 'the backup stays');
  // a v0 blob in storage loads through migrate
  const s0 = memStorage(); s0.setItem(D.SAVE_KEY, JSON.stringify(v0));
  const dd = mkSim({ storage: s0 });
  assert.equal(dd.sim.state.run.cash, 123.5); assert.equal(dd.sim.state.account.shares, 2);
  assert.equal(dd.sim.state.run.event, null, 'events do not run offline');
});

test('§14.7 migrate rejects blobs without a save signature: {} and friends can no longer wipe the account on import', () => {
  const { sim } = mkSim();
  sim.dev.give(5000); sim.buy('srv_pizza_box', 8); sim.buy('rack'); sim.state.account.shares = 7; sim.state.account.lifetime.exits = 2;
  const before = JSON.stringify(sim.state);
  for (const s of ['{}', 'e30=', '{"v":99,"account":[],"run":[]}', btoa('{"v":1,"account":{},"run":{}}'), '{"v":1,"account":{"shares":1},"run":{}}',
    '{"account":{},"run":{}}', '{"v":1,"account":{},"run":{"cash":5}}', 'garbage', '', '[]', 'null', '0', 'true', '"str"', '{"v":1}', 'bm90IGpzb24=', '%%%']) {
    const r = sim.importSave(s);
    assert.equal(r.ok, false, `accepted ${JSON.stringify(s)}`); assert.equal(r.reason, 'corrupt');
  }
  assert.equal(JSON.stringify(sim.state), before, 'nothing changed');
  assert.equal(sim.state.account.shares, 7);
  for (const s of ['{}', '{"v":99,"account":[],"run":[]}', '{"v":1,"account":{},"run":{}}', '{"v":1,"account":{"shares":1},"run":{}}', '{"v":1,"account":{},"run":{"cash":5}}', '{"account":{},"run":{}}']) assert.equal(migrate(JSON.parse(s), D, T0), null, s);
  // real shapes still pass: a current save, the minimal perk fixture, a v0 two-half blob, a v0 bare run
  assert.ok(migrate(JSON.parse(before), D, T0));
  assert.ok(migrate({ v: 1, account: { shares: 3 }, run: { cash: 50 } }, D, T0));
  assert.ok(migrate({ v: 1, account: { milestones: [] }, run: { racks: [] } }, D, T0));
  assert.ok(migrate({ account: { shares: 1 }, run: { cash: 1 } }, D, T0));
  assert.equal(migrate({ cash: 12, stage: 2 }, D, T0).run.cash, 12, 'v0 bare run (cash at the top level)');
  assert.equal(migrate({ stage: 2 }, D, T0), null, 'a bare object without cash is not a run');
  assert.equal(sim.importSave(btoa(before)).ok, true, 'a real export imports');
});

// ---------------------------------------------------------------------------------------------
test('§14.7 save clock: savedAt is always wall time even when update() runs on performance.now(); autosave survives saveNow()', () => {
  // main.js drives update(performance.now()) (small numbers since page load) while now() is Date.now()
  const storage = memStorage();
  const wall = { t: T0 }, perf = { t: 1234.5 };
  const sim = createSim({ now: () => wall.t, storage, rng: mulberry32(1) });
  const toasts = []; sim.on('toast', p => toasts.push(p.text));
  const step = ms => { wall.t += ms; perf.t += ms; sim.update(perf.t); };
  sim.update(perf.t);
  sim.buy('srv_pizza_box');
  for (let i = 0; i < 60; i++) step(100);
  let blob = JSON.parse(storage.dump());
  assert.ok(blob.account.savedAt >= T0 && blob.account.savedAt <= wall.t, `savedAt ${blob.account.savedAt} is an epoch, not ${perf.t}`);
  assert.equal(blob.account.savedAt, wall.t - 1000, 'stamped at the 5 s mark');
  // a tab switch: saveNow() must not poison the interval with a Date.now() value
  assert.equal(sim.saveNow(), true);
  const at = JSON.parse(storage.dump()).account.savedAt;
  assert.equal(at, wall.t);
  for (let i = 0; i < 100; i++) step(100);
  blob = JSON.parse(storage.dump());
  assert.ok(blob.account.savedAt > at, 'the periodic save fired again after saveNow()');
  assert.equal(blob.account.savedAt, wall.t, 'saves at +5 s and +10 s after the saveNow(): the last one on the final step');
  assert.equal(sim.saveStatus.lastSavedAt, blob.account.savedAt);
  // a second createSim over that storage (reload) sees seconds away, not 8 h
  const again = createSim({ now: () => wall.t + 5000, storage, rng: mulberry32(1) });
  assert.equal(again.offline, null, 'no "While you were away" after 6 s');
  assert.ok(Math.abs(again.state.run.cash - sim.state.run.cash) < 1);
  assert.deepEqual(toasts, []);
});

test('§14.7 save failures are surfaced once and retried: a throwing setItem toasts, recovery toasts back', () => {
  let fail = false;
  const inner = memStorage();
  const storage = { getItem: k => inner.getItem(k), setItem: (k, v) => { if (fail) throw new DOMException('quota', 'QuotaExceededError'); inner.setItem(k, v); }, removeItem: k => inner.removeItem(k), dump: inner.dump };
  const { sim, run, got } = mkSim({ storage });
  sim.buy('srv_pizza_box');
  fail = true;
  run(5.1);
  const failToasts = () => got('toast').filter(e => /Saving failed/.test(e.p.text));
  assert.equal(failToasts().length, 1);
  assert.equal(sim.saveStatus.failed, true);
  assert.equal(sim.saveNow(), false);
  assert.equal(sim.setSetting('bloom', false).ok, true, 'the setting applies in memory even when the save fails');
  run(30);
  assert.equal(failToasts().length, 1, 'quiet retries');
  assert.equal(storage.dump(), undefined, 'nothing written while failing');
  fail = false;
  run(5.1);
  assert.equal(sim.saveStatus.failed, false);
  assert.ok(got('toast').some(e => /Saving works again/.test(e.p.text)));
  assert.equal(JSON.parse(storage.dump()).account.settings.bloom, false, 'the retry wrote the current state');
});

test('§14.7 two tabs: the stale tab yields to the newer one, pauses and stops saving; Exit / reset / import / claimSave take it back', () => {
  const storage = memStorage();
  const A = mkSim({ storage, sessionId: 'A' });
  A.sim.dev.give(500); A.sim.buy('srv_pizza_box', 6); A.sim.buy('rack');
  A.run(5.1);
  assert.equal(JSON.parse(storage.dump()).run.racks.length, 2, "A's save");
  assert.deepEqual(JSON.parse(storage.dump()).account.session.id, 'A');
  // B opens later over the same storage (it loads A's state) and saves: it is the newer session
  const B = mkSim({ storage, sessionId: 'B', t0: A.clock.t });
  assert.equal(B.sim.state.run.racks.length, 2);
  assert.equal(B.sim.saveStatus.session.gen, A.sim.saveStatus.session.gen + 1);
  B.sim.buy('srv_pizza_box', 2);
  B.run(5.1);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'B');
  // A's next autosave (≤ 5 s) sees B's newer session: it stops saving, pauses and says so once
  A.sim.buy('srv_pizza_box');
  A.run(5.1);
  assert.equal(A.sim.saveStatus.superseded, true);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'B', 'A did not clobber B');
  assert.equal(A.got('toast').filter(e => /another tab/.test(e.p.text)).length, 1);
  const runTimeA = A.sim.state.run.runTime, cashA = A.sim.state.run.cash;
  A.run(10);
  assert.equal(A.sim.state.run.runTime, runTimeA, 'A holds still');
  assert.equal(A.sim.saveNow(), false, 'pagehide cannot clobber either');
  assert.equal(A.got('toast').filter(e => /another tab/.test(e.p.text)).length, 1, 'told once');
  assert.equal(A.sim.state.run.cash, cashA, 'paused: no income either');
  // B keeps saving
  B.run(5.1);
  assert.equal(JSON.parse(storage.dump()).run.racks[0].servers.filter(Boolean).length, 8, "B's state is the stored one");
  // a deliberate act in A takes the save back; B then yields on its next autosave
  assert.equal(A.sim.claimSave().ok, true);
  assert.equal(A.sim.saveStatus.superseded, false);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'A');
  A.run(1);
  assert.ok(A.sim.state.run.runTime > runTimeA + 0.5, 'A runs again');
  B.run(5.1);
  assert.equal(B.sim.saveStatus.superseded, true);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'A');
  assert.equal(B.sim.resetRun().ok, true, 'reset in B claims it back');
  assert.equal(B.sim.saveStatus.superseded, false);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'B');
  // a third tab opened over B's save outranks both
  const Cc = mkSim({ storage, sessionId: 'C', t0: B.clock.t });
  assert.ok(Cc.sim.saveStatus.session.gen > B.sim.saveStatus.session.gen);
  Cc.run(5.1);
  B.run(5.1); A.run(5.1);
  assert.equal(B.sim.saveStatus.superseded, true); assert.equal(A.sim.saveStatus.superseded, true);
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'C');
  assert.equal(A.sim.importSave(A.sim.exportSave()).ok, true, 'import claims too');
  assert.equal(JSON.parse(storage.dump()).account.session.id, 'A');
  // a save without a session (older build) never supersedes anyone
  const old = JSON.parse(storage.dump()); delete old.account.session; storage.setItem(D.SAVE_KEY, JSON.stringify(old));
  Cc.sim.claimSave(); Cc.run(5.1);
  assert.equal(Cc.sim.saveStatus.superseded, false);
});

test('§14.7 "Play here" picks up the newer tab\'s progress instead of overwriting it with this tab\'s stale state', () => {
  const storage = memStorage();
  const A = mkSim({ storage, sessionId: 'A' });
  A.sim.dev.give(500); A.sim.buy('srv_pizza_box', 6); A.sim.buy('cool_box_fan');
  A.run(5.1);
  // B opens over A's save, gets rich and autosaves; A's next autosave finds B newer and pauses
  const B = mkSim({ storage, sessionId: 'B', t0: A.clock.t });
  B.sim.dev.give(5000); B.sim.buy('rack', 3); B.sim.buy('srv_pizza_box', 'max'); B.sim.buy('pwr_subpanel');
  B.run(5.1);
  const storedB = JSON.parse(storage.dump());
  assert.equal(storedB.account.session.id, 'B'); assert.equal(storedB.run.racks.length, 4);
  A.run(5.1);
  assert.equal(A.sim.saveStatus.superseded, true);
  assert.ok(A.sim.state.run.cash < 1000 && A.sim.state.run.racks.length === 1, 'A is stale');
  const sc = A.got('stageChanged').length, cc = A.got('contractChanged').length;
  const r = A.sim.claimSave();
  assert.deepEqual([r.ok, r.adopted], [true, true]);
  assert.equal(A.sim.saveStatus.superseded, false);
  assert.equal(A.sim.state.run.racks.length, 4, "A plays on from B's progress");
  assertNear(A.sim.state.run.cash, storedB.run.cash, 1e-9, "B's cash");
  assert.equal(A.sim.state.run.bought.srv_pizza_box, storedB.run.bought.srv_pizza_box);
  assert.deepEqual(A.sim.state.account.milestones, storedB.account.milestones);
  const stored = JSON.parse(storage.dump());
  assert.equal(stored.account.session.id, 'A', 'A owns the save');
  assert.equal(stored.run.racks.length, 4, "and B's progress survived the claim");
  assertNear(stored.run.cash, storedB.run.cash, 1e-9);
  assert.equal(A.got('stageChanged').length, sc + 1, 'stageChanged: the scene rebuilds the hall from state');
  assert.ok(A.got('contractChanged').length > cc, 'the board is re-sent');
  A.run(1);
  assertNear(A.sim.state.run.runTime, storedB.run.runTime + 0.9, 1e-6, 'a first frame, then nine ticks: no catch-up, no double time');
  B.run(5.1);
  assert.equal(B.sim.saveStatus.superseded, true, 'B yields');
  // the newer tab was closed hours ago: the claim pays the time since its save as offline, once, with the card
  const Cc = mkSim({ storage, sessionId: 'C', t0: A.clock.t });
  Cc.sim.dev.give(1000); Cc.run(5.1);
  A.run(5.1); assert.equal(A.sim.saveStatus.superseded, true);
  const storedC = JSON.parse(storage.dump());
  assert.equal(storedC.account.session.id, 'C');
  A.clock.t += 2 * H * 1000;
  const since = (A.clock.t - storedC.account.savedAt) / 1000;
  const offs = A.got('offline').length;
  assert.equal(A.sim.claimSave().adopted, true);
  // at the saved income (uptime was mid-recovery at C's autosave, so not C's income a tick later)
  const earn = offlineEarn(computeDerived(migrate(storedC, D, A.clock.t), D).income, since, D);
  assert.ok(earn > 0);
  assertNear(A.sim.state.run.cash, storedC.run.cash + earn, 1e-6 * earn, "C's cash plus the night");
  assert.equal(JSON.parse(storage.dump()).account.savedAt, A.clock.t);
  A.step(16);
  assert.equal(A.got('offline').length, offs + 1, 'the return card');
  assertNear(A.sim.offline.earn, earn, 1e-6 * earn);
  assert.equal(A.sim.resume().offline, false, 'not paid twice');
  // nothing newer in storage: a plain claim keeps this tab's state
  const solo = mkSim({ storage: memStorage(), sessionId: 'S' });
  solo.sim.dev.give(123); solo.run(5.1);
  const cashS = solo.sim.state.run.cash;
  assert.deepEqual(solo.sim.claimSave(), { ok: true, adopted: false });
  assert.equal(solo.sim.state.run.cash, cashS);
});

test('§10/§14.4 Exit, reset and import end a running event with event{on:false} (scene flags, BREAKER overlay)', () => {
  const { sim, run, got } = mkSim({ seed: 11 });
  sim.dev.jump(2); sim.dev.give(1e5); sim.buy('srv_gpu_node', 2); sim.buy('pwr_genset'); sim.buy('cool_split_ac'); sim.buy('net_fiber_uplink');
  run(1);
  const onOff = id => got('event').filter(e => e.p.id === id).map(e => e.p.on);
  sim.dev.fireEvent('ev_ddos');
  assert.deepEqual(onOff('ev_ddos'), [true]);
  sim.state.run.valuation = 1e6;
  assert.equal(sim.exit().ok, true);
  assert.deepEqual(onOff('ev_ddos'), [true, false], 'the Exit ended the DDoS for the scene');
  assert.equal(sim.state.run.event, null);
  const evI = got('event').findIndex(e => e.p.id === 'ev_ddos' && !e.p.on), scI = got('stageChanged').length - 1;
  assert.ok(evI >= 0 && got('stageChanged')[scI].t === 0, 'the new run started after the event ended');
  // the breaker mid-blackout, then a reset: on:false reaches the ui (which hides #breaker on it), without its toast
  const fresh = mkSim();
  fresh.sim.dev.give(500); fresh.sim.buy('srv_pizza_box', 6); fresh.sim.buy('cool_box_fan'); fresh.sim.buy('srv_blade');
  fresh.run(0.5);
  assert.equal(fresh.sim.state.run.event?.id, 'ev_breaker');
  const toasts = fresh.got('toast').length;
  assert.equal(fresh.sim.resetRun().ok, true);
  assert.deepEqual(fresh.got('event').map(e => e.p.on), [true, false]);
  assert.ok(!fresh.got('toast').slice(toasts).some(e => /Breaker\. Just the one/.test(e.p.text)), 'quiet: no breaker line on a reset');
  assert.equal(fresh.sim.state.run.event, null);
  // import mid-heatwave
  const h = mkSim({ seed: 11 });
  h.sim.dev.jump(2); h.sim.dev.give(1e4); h.sim.buy('srv_gpu_node'); h.run(0.2);
  h.sim.dev.fireEvent('ev_heatwave');
  const exp = fresh.sim.exportSave();
  assert.equal(h.sim.importSave(exp).ok, true);
  const evs = h.got('event').filter(e => e.p.id === 'ev_heatwave').map(e => e.p.on);
  assert.deepEqual(evs, [true, false]);
  assert.equal(h.sim.state.run.event, null);
});

test('§7 manual reroll is never free: $5 floor with every rack dark, nominal income during a blackout', () => {
  const { sim, run } = mkSim({ seed: 5 });
  sim.dev.give(2000); sim.buy('srv_pizza_box', 8); sim.buy('rack'); sim.buy('srv_pizza_box', 8); sim.buy('cool_box_fan', 2); sim.buy('pwr_pdu');
  run(0.1);
  const inc = sim.derived.income;
  assert.ok(inc > 0 && inc * 30 > 5);
  let cash = sim.state.run.cash;
  assert.equal(sim.reroll().ok, true);
  assertNear(cash - sim.state.run.cash, 30 * inc, 1e-6, '30 s of income when lit');
  // every rack dark: income 0
  for (const r of sim.state.run.racks) { r.incident = { id: 'inc_disk', t0: 0, flavor: 'x' }; r.dark = true; }
  run(0.1);
  assert.equal(sim.derived.income, 0);
  assert.equal(sim.shopRows('contracts').find(r => r.kind === 'reroll').cost, 5, 'the row shows the floor');
  cash = sim.state.run.cash;
  const r = sim.reroll();
  assert.deepEqual([r.ok, r.cost], [true, 5]);
  assertNear(cash - sim.state.run.cash, 5, 1e-9);
  sim.state.run.cash = 4.99;
  assert.equal(sim.reroll().reason, 'cash', 'and it is enforced');
  // blackout (breaker): income 0 but the racks are lit, so 30 s of nominal income
  for (const r of sim.state.run.racks) { r.incident = null; r.dark = false; }
  sim.state.run.cash = 1e4;
  sim.dev.fireEvent('ev_breaker');
  run(0.1);
  assert.equal(sim.derived.income, 0); assert.ok(sim.derived.nominal > 0);
  cash = sim.state.run.cash;
  assert.equal(sim.reroll().ok, true);
  assertNear(cash - sim.state.run.cash, Math.max(5, 30 * sim.derived.nominal), 1e-6);
});

test('shopRows perf: a what-if from the base counts matches a fresh computeDerived; a full Campus refresh stays cheap', () => {
  const { sim } = mkSim();
  sim.dev.jump(5);
  const run = sim.state.run;
  while (run.racks.length < 240) run.racks.push({ servers: new Array(8).fill(null), dark: false, incident: null });
  const tiers = ['srv_orbital', 'srv_quantum', 'srv_sled', 'srv_ai_pod'];
  run.racks.forEach((r, i) => r.servers.fill(tiers[i % 4]));
  run.racks[3].dark = true; run.racks[3].incident = { id: 'inc_disk', t0: 0, flavor: 'x' };
  run.infra = { pwr_smr: 40, cool_immersion: 40, net_cable_landing: 40, pwr_hv_feed: 10, cool_chiller: 10 };
  run.upgrades = { srv_orbital: 2, srv_sled: 3 };
  run.contracts.active = [{ id: 'con_ministry', termLeft: 100 }, { id: 'con_hyperscaler', termLeft: 100 }, { id: 'con_halcyon', termLeft: 100 }];
  run.cash = 1e12;
  sim.dev.time(0.1);
  const base = sim.derived;
  assert.equal(base.installed, 1920); assert.equal(base.darkRacks, 1); assert.equal(base.counts.lit.srv_ai_pod, 480 - 8);
  for (const what of [{ servers: [{ id: 'srv_orbital', n: 3 }] }, { infra: { pwr_smr: 2 } }, { upgrades: { srv_quantum: 1 } }, { eff: ['eff_compression'] }, { contracts: ['con_county'] }]) {
    const a = computeDerived(sim.state, D, what), b = computeDerived(sim.state, D, what, base);
    for (const k of ['income', 'nominal', 'efficiency', 'installed']) assertNear(a[k], b[k], 1e-9 * Math.max(1, Math.abs(a[k])), `${JSON.stringify(what)} ${k}`);
    for (const m of ['power', 'cooling', 'network']) assertNear(a[m].u, b[m].u, 1e-12, `${JSON.stringify(what)} ${m}`);
  }
  // stale counts are not trusted when the rack count changed (the what-if server is not "installed")
  const st2 = { ...sim.state, run: { ...run, racks: run.racks.slice(0, 100) } };
  assert.equal(computeDerived(st2, D, { servers: [{ id: 'srv_orbital', n: 1 }] }, base).installed, 800, 'recounted for 100 racks');
  const N = 50;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) for (const tab of ['build', 'infra', 'contracts', 'upgrades', 'exit']) sim.shopRows(tab, 1);
  const perRefresh = (performance.now() - t0) / N;
  console.log(`\nshopRows all five tabs on a full Campus: ${perRefresh.toFixed(2)} ms per refresh\n`);
  assert.ok(perRefresh < 8, `${perRefresh.toFixed(2)} ms for all tabs (was ~14-19 ms)`);
});

test('cash never negative or NaN: hostile inputs, NaN qty, spending at the limit', () => {
  const { sim, run } = mkSim();
  assert.equal(sim.buy('srv_pizza_box', NaN).ok, true, 'NaN qty reads as 1');
  assert.equal(sim.buy('srv_pizza_box', -5).reason, 'qty');
  assert.equal(sim.buy(42).reason, 'unknown');
  assert.equal(sim.buy('nope').reason, 'unknown');
  sim.state.run.cash = 15 * 1.07 - 1e-10;
  assert.equal(sim.buy('srv_pizza_box').ok, true, 'float slack of 1e-9');
  assert.ok(sim.state.run.cash >= 0);
  sim.state.run.cash = NaN; run(0.1);
  assert.ok(Number.isFinite(sim.state.run.cash) && sim.state.run.cash >= 0, 'a NaN write heals on the next credit');
  sim.dev.give(-100); assert.ok(sim.state.run.cash >= 0);
  sim.setSpeed(NaN); assert.equal(sim.speed, 1);
  assert.equal(sim.setSetting('bloom', 0).ok, true); assert.equal(sim.state.account.settings.bloom, false);
  assert.equal(sim.setSetting('evil', 1).reason, 'unknown');
  assert.equal(sim.tapIncident(99).reason, 'no_incident');
  assert.equal(sim.refresh(0).reason, 'locked');
  assert.equal(sim.hustle().ok, true);
  sim.dev.jump(2); assert.equal(sim.hustle().reason, 'stage');
});

test('§0.3 Hustle comes back for a dead hall: a perk start spent to $0 with no server has no income and no incidents', () => {
  const storage = memStorage();
  storage.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, account: { shares: 3 }, run: { cash: 50 } }));
  const { sim, run, got } = mkSim({ storage });
  sim.resetRun();
  assert.equal(sim.state.run.stage, 2);
  assert.equal(sim.hustleAvailable(), true, 'no server yet: Hustle is the floor');
  // the reviewer's path: six racks, a Subpanel, a Box Fan → $11.72, 0 servers, income 0
  assert.equal(sim.buy('rack', 'max').qty, 6);
  assert.equal(sim.buy('pwr_subpanel').ok, true); assert.equal(sim.buy('cool_box_fan').ok, true);
  assertNear(sim.state.run.cash, 11.72, 0.01);
  assert.equal(sim.derived.installed, 0); assert.equal(sim.derived.income, 0);
  for (const tab of ['build', 'infra', 'upgrades']) assert.ok(!sim.shopRows(tab).some(r => r.affordable), `${tab}: nothing buyable`);
  const incidents = got('incident').length;
  run(300);
  assertNear(sim.state.run.cash, 11.72, 0.01, 'no income');
  assert.equal(got('incident').length, incidents, 'no incidents without a lit rack');
  // the board is no way out: the $5 reroll floor eats what is left and a contract pays nothing on zero servers
  assert.equal(sim.reroll().ok, true); assert.equal(sim.reroll().ok, true);
  assert.equal(sim.reroll().reason, 'cash');
  assertNear(sim.state.run.cash, 1.72, 0.01);
  assert.equal(sim.hustleAvailable(), true);
  let taps = 0;
  while (sim.state.run.cash < 15) { assert.equal(sim.hustle().ok, true); taps++; }
  assert.equal(taps, 14, 'fourteen tickets buy the first server');
  assert.equal(sim.buy('srv_pizza_box').ok, true);
  assert.ok(sim.derived.income > 0);
  assert.equal(sim.hustleAvailable(), false, 'a lit server: the hall is alive again');
  assert.deepEqual(sim.hustle(), { ok: false, reason: 'stage', text: 'Hustle is a garage thing' });
  // a dark-only hall is not dead: the late tap is free
  sim.dev.spawnIncident(); run(20.2);
  assert.equal(sim.derived.income, 0); assert.equal(sim.derived.installed, 1);
  assert.equal(sim.hustleAvailable(), false);
});

test('update(): 10 Hz accumulator, 2 s catch-up clamp, speed multiplier, dropped frames', () => {
  const { sim, clock } = mkSim();
  sim.buy('srv_pizza_box');
  sim.update(clock.t += 1000);
  assertNear(sim.state.run.runTime, 1, 1e-9);
  sim.update(clock.t += 59_000);
  assertNear(sim.state.run.runTime, 3, 1e-9, 'under a minute away advances only 2 s (a minute or more is the §11 offline path)');
  sim.update(clock.t += 33); sim.update(clock.t += 33); sim.update(clock.t += 34);
  assertNear(sim.state.run.runTime, 3.1, 1e-9, 'sub-tick frames accumulate without drift');
  sim.setSpeed(10);
  sim.update(clock.t += 100);
  assertNear(sim.state.run.runTime, 4.1, 1e-9, 'speed 10');
  sim.update(clock.t += 1000);
  assertNear(sim.state.run.runTime, 6.1, 1e-9, 'clamp applies to sim time');
  const ten = mkSim({ speed: 10 });
  ten.step(100);
  assertNear(ten.sim.state.run.runTime, 1, 1e-9);
});

// ---------------------------------------------------------------------------------------------
test('shopRows: overdraw warnings, +$/s, kW/Gbps, cheapest and best-value fixes, tabs', () => {
  const { sim } = mkSim();
  sim.dev.give(300); sim.buy('srv_pizza_box', 6); sim.buy('cool_box_fan');
  const build = Object.fromEntries(sim.shopRows('build').map(r => [r.id, r]));
  const blade = build.srv_blade;
  assert.equal(blade.kind, 'tier'); assert.equal(blade.visible, true); assert.equal(blade.locked, null);
  assert.deepEqual([blade.overdraw.meter, +blade.overdraw.demand.toFixed(2), blade.overdraw.cap], ['power', 3.3, 3]);
  assertNear(blade.addNominal, 0.9 * sim.derived.stack, 1e-9, 'nominal +$/s before the dimming');
  assertNear(blade.addIncome, 1.5 * sim.derived.stack * (1 / 1.1) ** 1.5 - 0.6 * sim.derived.stack, 1e-9, 'real +$/s after the dimming the warning is about');
  assert.ok(blade.addIncome > 0 && blade.addIncome < blade.addNominal);
  assertNear(blade.addKw, 1.5, 1e-9); assertNear(blade.addGbps, 0.4, 1e-9);
  assert.equal(build.srv_pizza_box.overdraw, null);
  assert.equal(build.srv_pizza_box.badge, '×6');
  const ten = sim.shopRows('build', 10).find(r => r.id === 'srv_pizza_box');
  assert.equal(ten.qty, 2, '×10 clamps to the two free slots');
  assertNear(ten.cost, sim.cost('srv_pizza_box', 2), 1e-9);
  const mx = sim.shopRows('build', 'max').find(r => r.id === 'srv_pizza_box');
  assert.equal(mx.qty, 2); assert.equal(mx.affordable, true);
  assert.equal(build.rack.cost, 40); assert.equal(build.rack.badge, '1/4');
  assert.equal(build.move.locked, 'Buy every footprint first'); assert.equal(build.move.cost, 2000);
  const infra = sim.shopRows('infra');
  const by = Object.fromEntries(infra.map(r => [r.id, r]));
  assert.equal(by.pwr_pdu.cheapestFor, 'power'); assert.equal(by.pwr_pdu.bestValueFor, 'power');
  assert.equal(by.pwr_subpanel.cheapestFor, null);
  assert.equal(by.cool_box_fan.cheapestFor, 'cooling'); assert.equal(by.net_switch.bestValueFor, 'network');
  assert.equal(by.cool_box_fan.addKw, 3); assert.equal(by.cool_box_fan.addDraw, 0.3); assert.equal(by.cool_box_fan.badge, '×1');
  assert.equal(by.net_switch.addGbps, 2);
  assert.equal(by.pwr_genset.visible, false, 'Colo unit hidden');
  assert.equal(by.staff.visible, false, 'Dale is a Colo hire');
  assert.ok(!infra.some(r => r.id === 'mit_ups' && r.visible));
  // a Window AC's 1.5 kW draw can itself overdraw power
  sim.buy('srv_blade'); sim.state.account.flags.breakerSeen = true;
  const ac = sim.shopRows('infra').find(r => r.id === 'cool_window_ac');
  assert.equal(ac.overdraw.meter, 'power');
  const upg = sim.shopRows('upgrades');
  assert.equal(upg.find(r => r.id === 'upg:srv_pizza_box').locked, 'Needs 10 Pizza Boxes');
  assert.equal(upg.find(r => r.id === 'global').locked, 'Needs $1.00K valuation');
  assert.equal(upg.find(r => r.id === 'eff_containment').visible, false);
  assert.equal(sim.shopRows('exit')[0].kind, 'exit');
  assert.deepEqual(sim.shopRows('contracts').map(r => r.id), ['reroll']);
  for (const tab of ['build', 'infra', 'upgrades', 'contracts', 'exit']) for (const r of sim.shopRows(tab)) {
    for (const k of ['id', 'name', 'kind', 'cost', 'qty', 'affordable', 'visible', 'locked', 'overdraw', 'addIncome', 'addKw', 'addGbps', 'owned', 'max', 'cheapestFor', 'bestValueFor', 'flavor', 'badge']) assert.ok(k in r, `${tab}/${r.id} lacks ${k}`);
    assert.ok(Number.isFinite(r.cost) && r.cost >= 0, `${tab}/${r.id} cost ${r.cost}`);
  }
});

test('§18 tickerLine: opening line first on a fresh garage start, no repeat within 15 minutes, stage-eligible', () => {
  const { sim, clock } = mkSim({ seed: 9 });
  assert.equal(sim.tickerLine(), D.TICKER.find(l => l.opening).text);
  const seen = new Set([D.TICKER.find(l => l.opening).text]);
  const eligible = D.TICKER.filter(l => l.stage.min <= 1).length;
  for (let i = 1; i < eligible; i++) {
    const line = sim.tickerLine();
    assert.ok(line && !seen.has(line), `repeat within 15 min: ${line}`);
    assert.ok(D.TICKER.find(l => l.text === line).stage.min <= 1, 'stage eligible');
    seen.add(line);
  }
  assert.equal(sim.tickerLine(), null, 'exhausted until lines age out');
  clock.t += 15 * 60 * 1000 + 1;
  assert.ok(sim.tickerLine(), 'lines age out after 15 minutes');
  assert.ok(sim.state.account.tickerRecent.length <= eligible);
  sim.dev.jump(5);
  for (let i = 0; i < 10; i++) { const l = sim.tickerLine(); if (l) assert.ok(D.TICKER.find(x => x.text === l).stage.max === 5, `garage voice in the Campus: ${l}`); }
});

test('§18 tickerLine never draws from the sim rng: extra ticker calls leave incidents, the board and a ?seed replay untouched', () => {
  const A = mkSim({ seed: 7 }), B = mkSim({ seed: 7 });
  for (const s of [A, B]) { s.sim.dev.give(3000); s.sim.buy('srv_pizza_box', 8); s.sim.buy('rack'); s.sim.buy('srv_pizza_box', 8); s.sim.buy('cool_box_fan', 2); s.sim.buy('pwr_pdu'); s.sim.buy('net_switch'); }
  const tapAll = s => () => s.sim.state.run.racks.forEach((r, i) => { if (r.incident) s.sim.tapIncident(i); });
  for (let i = 0; i < 3; i++) assert.ok(B.sim.tickerLine());
  A.run(400, tapAll(A)); B.run(400, tapAll(B));
  for (let i = 0; i < 5; i++) B.sim.tickerLine();
  A.run(200, tapAll(A)); B.run(200, tapAll(B));
  assert.ok(A.got('incident').length >= 3, `${A.got('incident').length} incidents`);
  assert.deepEqual(A.got('incident').map(e => [e.t, e.p.rack, e.p.id, e.p.flavor]), B.got('incident').map(e => [e.t, e.p.rack, e.p.id, e.p.flavor]));
  assert.equal(A.sim.state.run.nextIncidentAt, B.sim.state.run.nextIncidentAt);
  assert.deepEqual(A.sim.state.run.contracts.board, B.sim.state.run.contracts.board);
  assertNear(A.sim.state.run.cash, B.sim.state.run.cash, 1e-9);
  // the ticker's own stream is seeded from the account, so a reload reads the same lines in the same order
  const C1 = mkSim({ seed: 7 }), C2 = mkSim({ seed: 8 });
  assert.deepEqual([C1.sim.tickerLine(), C1.sim.tickerLine(), C1.sim.tickerLine()], [C2.sim.tickerLine(), C2.sim.tickerLine(), C2.sim.tickerLine()], 'same account seed (the fake clock), same lines whatever rng the sim was given');
});

test('blocked site storage (the localStorage getter throws) boots on an in-memory store, says so once, and plays', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const denied = () => { throw new DOMException('Failed to read the localStorage property from Window: Access is denied for this document.', 'SecurityError'); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: denied });
  try {
    const clock = { t: T0 };
    const sim = createSim({ now: () => clock.t, rng: mulberry32(1) }); // no storage given: the page's is probed
    const toasts = []; sim.on('toast', p => toasts.push(p));
    sim.update(clock.t);
    assert.equal(sim.saveStatus.blocked, true);
    assert.deepEqual(toasts.map(t => [t.kind, /blocks site storage/.test(t.text)]), [['event', true]], 'told on the first frame');
    assert.equal(sim.buy('srv_pizza_box').ok, true);
    for (let i = 0; i < 60; i++) { clock.t += 100; sim.update(clock.t); }
    assertNear(sim.state.run.runTime, 6, 1e-9, 'the game runs');
    assert.equal(sim.saveStatus.failed, false, 'the in-memory store takes the autosave');
    assert.equal(sim.saveNow(), true);
    assert.equal(toasts.length, 1, 'told once');
    assert.ok(sim.exportSave().length > 0, 'export still works');
    // a page with no localStorage at all is "blocked" too
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    const none = createSim({ now: () => clock.t, rng: mulberry32(1) });
    assert.equal(none.saveStatus.blocked, true);
    // a working store is used as is, with no warning
    const mem = memStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mem });
    const okSim = createSim({ now: () => clock.t, rng: mulberry32(1) });
    const okToasts = []; okSim.on('toast', p => okToasts.push(p)); okSim.update(clock.t);
    assert.equal(okSim.saveStatus.blocked, false); assert.deepEqual(okToasts, []);
    assert.equal(okSim.saveNow(), true); assert.ok(mem.dump());
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc); else delete globalThis.localStorage;
  }
  // an explicit store whose reads and writes throw is survived as before: fresh account, one "Saving failed" toast
  const bad = { getItem: denied, setItem: denied, removeItem: () => {} };
  const { sim: s2, run, got } = mkSim({ storage: bad });
  assert.equal(s2.saveStatus.blocked, false);
  assert.equal(s2.state.run.cash, 50);
  run(5.1);
  assertNear(s2.state.run.runTime, 5.1, 1e-9);
  assert.equal(got('toast').filter(e => /Saving failed/.test(e.p.text)).length, 1);
});

test('§3 the Blade gate counts run-lifetime boxes: a garage refreshed to blades keeps the Blade row open in the Colo', () => {
  const { sim } = mkSim();
  sim.dev.give(1e6);
  sim.buy('rack', 3); sim.buy('srv_pizza_box', 'max');
  assert.equal(sim.derived.byTier.srv_pizza_box, 32);
  for (let r = 0; r < 4; r++) assert.equal(sim.refresh(r, 10).ok, true);
  assert.deepEqual(sim.derived.byTier, { srv_blade: 32 });
  const blade = () => sim.shopRows('build').find(r => r.id === 'srv_blade');
  assert.equal(blade().locked, 'No empty slot. Lease the Colo.', 'full, not "Needs 6 Pizza Boxes"');
  assert.equal(sim.buy('move').ok, true); assert.equal(sim.buy('rack').ok, true);
  assert.deepEqual([blade().visible, blade().locked], [true, null], 'owns 32 blades: the row is open');
  assert.equal(sim.buy('srv_blade').ok, true);
  // the raw gate holds for a run that never had six boxes
  const fresh = mkSim();
  fresh.sim.state.run.cash = 100;
  assert.equal(fresh.sim.shopRows('build').find(r => r.id === 'srv_blade').locked, 'Needs 6 Pizza Boxes');
  // the racked count counts as well (a v0 save with boxes racked and no bought table)
  const s0 = memStorage(); s0.setItem(D.SAVE_KEY, JSON.stringify({ account: { shares: 0 }, run: { cash: 500, racks: [{ servers: Array(6).fill('srv_pizza_box').concat([null, null]) }] } }));
  const v0 = mkSim({ storage: s0 });
  assert.equal(v0.sim.state.run.bought.srv_pizza_box, undefined);
  assert.equal(v0.sim.shopRows('build').find(r => r.id === 'srv_blade').locked, null);
});

test('§4 importSave clamps infra per unit (99 Box Fans → 6) and upgrades to the five §3 levels', () => {
  const { sim } = mkSim();
  const blob = JSON.parse(JSON.stringify(sim.state));
  blob.run.infra = { cool_box_fan: 99, pwr_pdu: 7, pwr_subpanel: 3, net_switch: 0, bogus: 4 };
  blob.run.upgrades = { srv_pizza_box: 99, srv_blade: 2 };
  blob.run.stage = 2; blob.run.racks = Array.from({ length: 4 }, () => ({ servers: Array(8).fill('srv_pizza_box') }));
  assert.equal(sim.importSave(btoa(JSON.stringify(blob))).ok, true);
  assert.deepEqual(sim.state.run.infra, { cool_box_fan: 6, pwr_pdu: 6, pwr_subpanel: 3 }, 'garage caps hold; zero and unknown ids drop');
  assert.deepEqual(sim.state.run.upgrades, { srv_pizza_box: 5, srv_blade: 2 });
  assertNear(sim.derived.cooling.cap, 1.5 + 6 * 3, 1e-9, 'six fans of cooling, not 99');
  assertNear(sim.derived.coolingDraw, 6 * 0.3, 1e-9);
  assert.equal(sim.shopRows('infra').find(r => r.id === 'cool_box_fan').badge, '×6');
  // uncapped units pass through; migrate() alone agrees
  const m = migrate({ v: 1, account: { shares: 0 }, run: { cash: 1, stage: 3, infra: { pwr_genset: 40, cool_box_fan: 99 }, upgrades: { srv_gpu_node: 6 } } }, D, T0);
  assert.deepEqual(m.run.infra, { pwr_genset: 40, cool_box_fan: 6 });
  assert.deepEqual(m.run.upgrades, { srv_gpu_node: 5 });
});

test('§14.4 event names: only the documented bus names fire during a busy run', () => {
  const ok = new Set(['serverAdded', 'serverSwapped', 'rackAdded', 'rackDark', 'infraAdded', 'stageChanged', 'meters', 'cash', 'incident', 'incidentResolved',
    'event', 'breaker', 'upgrade', 'global', 'milestone', 'contractChanged', 'exit', 'offline', 'refreshAvailable', 'toast']);
  const storage = memStorage();
  const clock = { t: 0 };
  const sim = createSim({ now: () => clock.t, storage, rng: mulberry32(2) });
  const names = new Set();
  const origOn = sim.on;
  for (const n of ok) origOn(n, () => names.add(n));
  // meters and cash every tick
  let meters = 0, cash = 0;
  sim.on('meters', p => { meters++; assert.ok('power' in p && 'cooling' in p && 'network' in p && 'efficiency' in p); });
  sim.on('cash', p => { cash++; assert.ok(Number.isFinite(p.cash) && Number.isFinite(p.income) && Number.isFinite(p.valuation)); });
  sim.update(0);
  for (let i = 0; i < 100; i++) { clock.t += 100; sim.update(clock.t); }
  assert.equal(meters, 101); assert.equal(cash, 101);
});

// ---------------------------------------------------------------------------------------------
// §12 scripted first ten minutes. Hustle 2 taps/s to 2:00; six boxes, fan, blade (the breaker), PDU, blade, switch,
// Rack 2, FrobCoin; then the §19 greedy rule (min wait-to-afford + payback, fix a meter before overdrawing it) over
// boxes/blades/racks/firmware/global, saving for the lease once the garage is full. Incidents are tapped at once.

function cheapestFix(sim, meter, shortfall) {
  const rows = sim.shopRows('infra').filter(r => r.kind === 'infra' && r.meter === meter && r.visible && !r.locked);
  const covers = rows.filter(r => (meter === 'network' ? r.addGbps : r.addKw) >= shortfall);
  const pool = covers.length ? covers : rows;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (b.cost < a.cost ? b : a));
}

function playFirstTen(sim, clock, { until = 16 * 60 } = {}) {
  const beats = {};
  const mark = (k, t = sim.state.run.runTime) => { if (!(k in beats)) beats[k] = t; };
  sim.on('breaker', () => mark('breaker'));
  sim.on('rackAdded', ({ rack }) => mark(`rack${rack + 1}`));
  sim.on('stageChanged', ({ to }) => { mark(`stage${to}`); if (to === 2) mark('leaseAffordable'); }); // bought the tick it became affordable
  sim.on('milestone', ({ id }) => mark(id));
  sim.on('upgrade', ({ tier }) => mark(`upg:${tier}`));
  sim.on('global', () => mark('global1'));
  sim.on('contractChanged', ({ active }) => { if (active.length) mark('contract'); });
  let ticks = 0, boxesWhenAmber = null;
  const installed = id => sim.derived.byTier[id] || 0;
  while (sim.state.run.runTime < until && sim.state.run.stage === 1) {
    clock.t += 100; sim.update(clock.t); ticks++;
    const run = sim.state.run;
    if (run.runTime <= 120 && ticks % 5 === 0) sim.hustle();
    run.racks.forEach((r, i) => { if (r.incident) sim.tapIncident(i); });
    if (sim.derived.cooling.u >= 0.8 && boxesWhenAmber === null) { boxesWhenAmber = installed('srv_pizza_box'); mark('coolingAmber'); }
    if (run.contracts.board.length && !run.contracts.active.length) sim.pickContract(run.contracts.board.includes('con_frobcoin') ? 'con_frobcoin' : run.contracts.board[0]);
    for (let k = 0; k < 4 && policy(sim); k++);
    if (sim.derived.installed >= 32) mark('garageFull');
    if (sim.state.run.stage === 1 && sim.cost('move') <= run.cash && run.racks.length === 4) mark('leaseAffordable');
  }
  return { beats, boxesWhenAmber };
}

// One purchase attempt. Returns true if something was bought (so the caller tries again this tick).
function policy(sim) {
  const run = sim.state.run, d = sim.derived;
  const rows = Object.fromEntries([...sim.shopRows('build'), ...sim.shopRows('infra'), ...sim.shopRows('upgrades')].map(r => [r.id, r]));
  const boxes = d.byTier.srv_pizza_box || 0, blades = d.byTier.srv_blade || 0;
  const tryBuy = id => !!(rows[id]?.affordable && sim.buy(id).ok);
  // a red meter gets its cheapest fix before anything else (save for it)
  for (const m of ['power', 'cooling', 'network']) {
    if (d[m].u <= 1) continue;
    const fix = cheapestFix(sim, m, d[m].demand - d[m].cap);
    if (fix) return tryBuy(fix.id);
  }
  // §12 opening script
  if (boxes < 6) return tryBuy('srv_pizza_box');
  if (!run.infra.cool_box_fan) return tryBuy('cool_box_fan');
  if (blades < 1) return tryBuy('srv_blade'); // overdraws on purpose: the breaker beat
  if (d.installed >= 32 && run.racks.length === 4) return tryBuy('move'); // garage full: save for the lease
  // greedy: min(wait-to-afford + cost / Δincome) over servers (bundled with a rack and/or a fix), upgrades, globals
  const income = Math.max(d.income, 1e-6);
  const cands = [];
  const withFix = (r, ids, cost) => {
    if (r.overdraw) { const fix = cheapestFix(sim, r.overdraw.meter, r.overdraw.demand - r.overdraw.cap); if (fix) { ids.unshift(fix.id); cost += fix.cost; } }
    return cost;
  };
  for (const id of ['srv_blade', 'srv_pizza_box']) {
    const r = rows[id];
    if (!r?.visible || (r.locked && !r.full)) continue;
    const ids = [id];
    let cost = r.cost;
    if (r.full) { if (!rows.rack?.visible || rows.rack.locked) continue; ids.unshift('rack'); cost += rows.rack.cost; }
    cands.push({ ids, cost: withFix(r, ids, cost), dI: r.addNominal });
  }
  for (const id of ['upg:srv_pizza_box', 'upg:srv_blade', 'global']) {
    const r = rows[id];
    if (!r?.visible || r.locked) continue;
    const ids = [id];
    cands.push({ ids, cost: withFix(r, ids, r.cost), dI: r.addNominal });
  }
  let best = null;
  for (const c of cands) {
    if (!(c.dI > 0)) continue;
    const wait = Math.max(0, (c.cost - run.cash) / income);
    const score = wait + c.cost / c.dI;
    if (!best || score < best.score) best = { ...c, score };
  }
  if (!best || best.cost > run.cash) return false;
  let bought = false;
  for (const id of best.ids) bought = sim.buy(id).ok || bought;
  return bought;
}

test('§12 scripted first ten minutes: beats in order and within ±30% of the doc', () => {
  const { sim, clock } = mkSim({ seed: 12 });
  const { beats, boxesWhenAmber } = playFirstTen(sim, clock);
  const fmt = s => (s == null ? '--' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
  const table = Object.entries(beats).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${fmt(v)} ${k}`).join('\n');
  console.log(`\n§12 replay (seed 12):\n${table}\n`);
  // the beats
  assert.ok(boxesWhenAmber === 5 || boxesWhenAmber === 6, `cooling amber at box ${boxesWhenAmber}`);
  assert.ok('breaker' in beats, 'the breaker fired on the first Blade');
  assert.ok(beats.coolingAmber < beats.breaker, 'amber before the breaker');
  assert.ok(beats.breaker < beats.rack2, 'breaker before Rack 2');
  assert.ok(beats.rack2 <= beats.contract + 0.5, 'the board opens at Rack 2');
  assert.ok(beats.rack2 < beats.rack3 && beats.rack3 < beats.rack4 && beats.rack4 < beats.garageFull && beats.garageFull < beats.leaseAffordable, 'rack / fill / lease order');
  assert.ok(beats.ms_1000 < beats['upg:srv_pizza_box'] || Math.abs(beats.ms_1000 - beats['upg:srv_pizza_box']) < 60, '$1,000 then firmware');
  assert.ok(beats.global1 < beats.garageFull, 'Blanking panels before the garage fills');
  // ±30% on the doc's times for the named beats; the firmware upgrade is order-checked only (its slot depends on a
  // coin-flip in the greedy scoring: ~4:54 in econ_sim, ~7:30 here, both before Rack 4 fills)
  const within = (k, docS) => assert.ok(beats[k] >= docS * 0.7 && beats[k] <= docS * 1.3, `${k} at ${fmt(beats[k])}, doc ${fmt(docS)} ±30%`);
  within('breaker', 90);
  within('rack2', 190);
  within('ms_1000', 276);
  within('global1', 378);
  within('rack3', 407);
  within('rack4', 450);
  within('garageFull', 526);
  within('leaseAffordable', 639);
  assert.ok(beats['upg:srv_pizza_box'] < beats.garageFull, 'firmware before the garage fills');
  assert.equal(sim.state.run.stage, 2, 'leased');
  assert.ok(beats.stage2 <= 13 * 60, `lease at ${fmt(beats.stage2)}`);
  assert.ok(beats.ms_10_minutes_with_no_red == null || beats.ms_10_minutes_with_no_red >= 600);
  assert.ok(sim.state.account.milestones.includes('ms_fill_the_garage'));
  assert.ok(sim.state.account.milestones.includes('ms_sell_the_civic'));
  assert.ok(sim.state.run.uptime > 90, `uptime ${sim.state.run.uptime.toFixed(1)} after the garage`);
});

test('§12 replay is deterministic for a seed and stays in order across seeds', () => {
  const A = mkSim({ seed: 12 }), B = mkSim({ seed: 12 });
  assert.deepEqual(playFirstTen(A.sim, A.clock).beats, playFirstTen(B.sim, B.clock).beats);
  for (const seed of [1, 2, 3]) {
    const { sim, clock } = mkSim({ seed });
    const { beats } = playFirstTen(sim, clock);
    assert.ok(beats.coolingAmber < beats.breaker && beats.breaker < beats.rack2 && beats.rack2 < beats.rack3 && beats.rack3 < beats.rack4 && beats.rack4 < beats.garageFull && beats.garageFull < beats.leaseAffordable, `seed ${seed} order`);
    assert.ok(beats.leaseAffordable <= 13.5 * 60, `seed ${seed}: lease affordable at ${beats.leaseAffordable}`);
  }
});
