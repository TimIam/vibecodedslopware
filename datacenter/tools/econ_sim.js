#!/usr/bin/env node
'use strict';
// Independent economy sim for "UPTIME: Garage to Hyperscale" design doc.
// Greedy competent player: every second, evaluates every purchasable package
// (server [+rack][+stage move][+infra needed to stay <=100% on all meters],
// upgrade+infra, refresh, global) and picks min (wait-to-afford + payback).
// Never knowingly overdraws a meter (the UI warns), so uptime stays high.

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) return true; return isNaN(+v) ? v : +v; };

const SCHEDULE = opt('schedule', 'single');   // single | mixed
const HOURS = +opt('hours', 2);
const CONTRACTS = opt('contracts', 'best');    // best | none
const EVENTS = !!opt('events', false);
const INCIDENTS = !opt('noincidents', false);
let STACK = opt('stack', 'mult');            // mult | add
const EXIT_RULE = opt('exit', 'glow');         // glow | never
const PATCH = opt('patch', null);
const VERBOSE = !!opt('v', false);
const LOGBUYS = !!opt('buys', false);

// ---------------- CONFIG (doc numbers) ----------------
const CFG = {
  startCash: 50, hustle: 1, hustleRate: 2, hustleUntil: 120,
  growth: 1.07, rackGrowth: 1.08, drawMult: 1.3, effExp: 1.5,
  uptimeRecover: 0.2, uptimeFallK: 5, uptimeFloor: 0.25, visCash: false,
  shareBonus: 0.2, globalMult: 1.5, milestoneBonus: 0.01,
  offlineFrac: 0.5, offlineCapH: 8,
  incidentEvery: 90, incidentBountySec: 20, incidentMin: 5, incidentStart: 180,
  refreshRefund: 0.25,
  servers: [
    { name: 'Pizza Box', base: 15, inc: 0.10, kw: 0.25, gbps: 0.05, stage: 1 },
    { name: 'Blade', base: 120, inc: 0.9, kw: 1.5, gbps: 0.4, stage: 1, needBoxes: 6 },
    { name: 'GPU Node', base: 1300, inc: 7.5, kw: 6, gbps: 1.5, stage: 2 },
    { name: 'Storage Array', base: 14000, inc: 55, kw: 8, gbps: 25, stage: 2 },
    { name: 'AI Pod', base: 160000, inc: 400, kw: 40, gbps: 60, stage: 3 },
    { name: 'Sled', base: 1.9e6, inc: 3000, kw: 120, gbps: 300, stage: 4 },
    { name: 'Annealer', base: 24e6, inc: 24000, kw: 300, gbps: 500, stage: 4 },
    { name: 'Orbital', base: 300e6, inc: 200000, kw: 800, gbps: 2000, stage: 5 },
  ],
  upgThresh: [10, 25, 50, 100, 200],
  upgCost: [10, 50, 250, 1500, 10000],
  infra: [
    { name: 'PDU', meter: 'power', cap: 4, base: 60, growth: 1.25, max: 6, stage: 1 },
    { name: 'Subpanel', meter: 'power', cap: 12, base: 300, growth: 1.3, max: 3, stage: 1 },
    { name: 'Genset', meter: 'power', cap: 60, base: 3000, growth: 1.2, stage: 2, genset: true },
    { name: 'Substation', meter: 'power', cap: 500, base: 400e3, growth: 1.2, stage: 3 },
    { name: 'HV Feed', meter: 'power', cap: 2000, base: 4.5e6, growth: 1.2, stage: 4 },
    { name: 'SMR', meter: 'power', cap: 10000, base: 750e6, growth: 1.2, stage: 5 },
    { name: 'Box Fan', meter: 'cool', cap: 3, draw: 0.3, base: 30, growth: 1.25, max: 6, stage: 1 },
    { name: 'Window AC', meter: 'cool', cap: 8, draw: 1.5, base: 200, growth: 1.3, max: 3, stage: 1 },
    { name: 'Split AC', meter: 'cool', cap: 60, draw: 15, base: 3000, growth: 1.2, stage: 2 },
    { name: 'CRAC', meter: 'cool', cap: 500, draw: 125, base: 350e3, growth: 1.2, stage: 3 },
    { name: 'Chiller', meter: 'cool', cap: 2000, draw: 400, base: 8e6, growth: 1.2, stage: 4 },
    { name: 'Cryo', meter: 'cool', cap: 8000, draw: 2000, base: 120e6, growth: 1.2, stage: 4, needsAnnealer: true },
    { name: 'Immersion', meter: 'cool', cap: 10000, draw: 1000, base: 600e6, growth: 1.2, stage: 5 },
    { name: 'Switch', meter: 'net', cap: 2, base: 30, growth: 1.25, max: 6, stage: 1 },
    { name: 'Biz Fiber', meter: 'net', cap: 10, base: 500, growth: 1.3, max: 3, stage: 1 },
    { name: 'Fiber Uplink', meter: 'net', cap: 100, base: 10000, growth: 1.2, stage: 2 },
    { name: 'Core Router', meter: 'net', cap: 800, base: 300e3, growth: 1.2, stage: 3 },
    { name: 'IX Port', meter: 'net', cap: 4000, base: 6e6, growth: 1.2, stage: 4 },
    { name: 'Cable Landing', meter: 'net', cap: 25000, base: 450e6, growth: 1.2, stage: 5 },
  ],
  baseCap: { power: 3, cool: 1.5, net: 1 },
  effUpg: [ // index: 0 containment, 1 vsd, 2 compression, 3 economizer
    { name: 'Containment', cost: 1000, stage: 2 },
    { name: 'VSD fans', cost: 25000, stage: 3 },
    { name: 'Compression', cost: 400000, stage: 4 },
    { name: 'Economizer', cost: 5e6, stage: 4 },
  ],
  stages: [
    { name: 'Garage', racks: 4, move: 0, rackBase: 40 },
    { name: 'Colo', racks: 12, move: 2000, rackBase: 300 },
    { name: 'Warehouse', racks: 36, move: 100e3, rackBase: 4000 },
    { name: 'Hall', racks: 96, move: 2.5e6, rackBase: 60e3 },
    { name: 'Campus', racks: 240, move: 60e6, rackBase: 1.5e6 },
  ],
  globals: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17],
  globalCostFrac: 0.6,
  contracts: [
    { name: 'Uncle Ray', mult: 1.15, p: 1, h: 1, n: 1, sla: 0, stage: 1 },
    { name: "Dave's Minecraft", mult: 1.3, p: 1, h: 1, n: 1.5, sla: 0, stage: 1 },
    { name: 'FrobCoin', mult: 1.5, p: 1.2, h: 1.4, n: 0.5, sla: 0, stage: 1 },
    { name: 'County Records', mult: 1.2, p: .8, h: .8, n: .8, sla: 99, stage: 2 },
    { name: 'CatTube', mult: 1.8, p: 1, h: 1, n: 2.5, sla: 97, stage: 2 },
    { name: 'Weatherbot', mult: 2.2, p: 1.3, h: 1.3, n: .7, sla: 98, stage: 3 },
    { name: 'Halcyon', mult: 3.0, p: 1.5, h: 1.5, n: .5, sla: 98, stage: 4, needPods: 10 },
    { name: 'Hyperscaler', mult: 2.0, p: 1.1, h: 1.1, n: 2.0, sla: 99, stage: 4 },
    { name: 'Ministry', mult: 2.5, p: 1, h: 1, n: .6, sla: 99.9, stage: 5 },
  ],
  contractSlots: [1, 1, 2, 2, 3],
  contractDur: 600,
  qol: [ // one-off purchases a competent player makes when cost <= 60 s of income
    { name: 'Dale', cost: 5000, stage: 2 }, { name: 'UPS', cost: 8000, stage: 2 },
    { name: 'Night tech', cost: 15000, stage: 2 }, { name: 'Dual-carrier', cost: 30000, stage: 3 },
    { name: 'Spares', cost: 40000, stage: 3 }, { name: 'NOC', cost: 45000, stage: 3 },
    { name: 'Scrubbing', cost: 60000, stage: 3 }, { name: 'SRE', cost: 135000, stage: 3 },
    { name: 'Priest', cost: 405000, stage: 3 },
  ],
  perks: { 1: { cash: 2500, stage: 1, racks: 1 }, 3: { cash: 2500, stage: 2, racks: 4 }, 10: { cash: 100e3, stage: 3, racks: 12 }, 30: { cash: 3e6, stage: 4, racks: 36 }, 100: { cash: 50e6, stage: 5, racks: 96 } },
  visibleFrac: 0.25,
  qolSeconds: 60,
};

// ---------------- PATCHES (proposed fixes to test) ----------------
const PATCHES = {
  none: () => {},
  // uptime: gentler fall, faster recovery, higher floor
  uptime: () => { CFG.uptimeRecover = 1.0; CFG.uptimeFallK = 1.0; CFG.uptimeFloor = 0.5; },
  // visibility softlock fix: a tier is visible if valuation OR cash clears 25% of base
  vis: () => { CFG.visCash = true; },
  // upgrade costs that track the stack (x2 at 100/200 no longer free)
  upg: () => { CFG.upgCost = [10, 50, 300, 7500, 6e6]; },
  // globals x1.5 -> x1.3
  glob13: () => { CFG.globalMult = 1.3; },
  // globals every two decades
  glob2: () => { CFG.globals = [1e3, 1e5, 1e7, 1e9, 1e11, 1e13, 1e15, 1e17, 1e19]; },
  // extra contract slots stack additively
  add: () => { STACK = 'add'; },
  // stage gates scaled to real income at that point
  gates: () => { const m = [0, 2000, 300e3, 20e6, 2e9], r = [40, 300, 10e3, 250e3, 10e6]; CFG.stages.forEach((s, i) => { s.move = m[i]; s.rackBase = r[i]; }); },
  // infra growth 1.2 -> 1.15 beyond the garage
  infra115: () => { for (const it of CFG.infra) if (it.stage >= 2) it.growth = 1.15; },
  // late tiers priced for the multiplier they arrive under (same $/s, higher base)
  tierprice: () => { const f = [1, 1, 1, 1, 2, 4, 6, 10]; CFG.servers.forEach((s, i) => { s.base *= f[i]; }); },
  // steeper growth on tiers 5-8
  growth: () => { CFG.servers.forEach((s, i) => { if (i >= 4) s.growth = 1.09; }); },
  g110: () => { CFG.growth = 1.10; },
  g115: () => { CFG.growth = 1.15; },
  glob135: () => { CFG.globalMult = 1.35; },
  globtaper: () => { CFG.globalMult = 1.25; CFG.globalMults = [1.5, 1.5, 1.35]; },
  gmix: () => { const g = [1.07, 1.07, 1.10, 1.10, 1.12, 1.12, 1.12, 1.12]; CFG.servers.forEach((s, i) => { s.growth = g[i]; }); },
  gmix2: () => { const g = [1.07, 1.07, 1.09, 1.09, 1.11, 1.11, 1.12, 1.12]; CFG.servers.forEach((s, i) => { s.growth = g[i]; }); },
  glob125: () => { CFG.globalMult = 1.25; },
  ladder: () => { const inc = [0.10, 0.9, 4.3, 28, 160, 760, 4000, 20000]; CFG.servers.forEach((s, i) => { s.inc = inc[i]; }); },
  upg2: () => { CFG.upgCost = [15, 75, 500, 10000, 1e7]; },
  glow2: () => { CFG.glowFactor = 2; },
  g112: () => { CFG.growth = 1.12; },
  globlife: () => { CFG.globalsLifetime = true; },
  share10: () => { CFG.shareBonus = 0.10; },
  // offline: 50% for first 2h then 20%
  offline: () => { CFG.offlineTaper = true; },
  // perk start cash as a fixed fraction of the stage move (Hall $1M, Campus $20M)
  perkcash: () => { CFG.perks[30].cash = 1e6; CFG.perks[100].cash = 20e6; },
  // offline earnings credit only 25% to valuation (cash gets 100%)
  offval: () => { CFG.offlineValFrac = 0.25; },
  // garage price trims: Blade $100, Subpanel $250, Window AC $160
  garage: () => { CFG.servers[1].base = 100; CFG.infra[1].base = 250; CFG.infra[7].base = 160; },
  hustle2: () => { CFG.hustle = 2; },
  // per-stage rack growth 1.08/1.08/1.06/1.05/1.04
  rackg: () => { CFG.rackGrowthByStage = [1.08, 1.08, 1.06, 1.05, 1.04]; },
};
if (PATCH) { for (const p of String(PATCH).split(',')) { if (!PATCHES[p]) throw new Error('unknown patch ' + p); PATCHES[p](); } }

const NS = CFG.servers.length, NI = CFG.infra.length;
const H = 3600;

// ---------------- STATE ----------------
function mkState() {
  return {
    t: 0, active: 0, cash: CFG.startCash, val: 0, shares: 0, uptime: 100,
    stage: 1, racks: 1, racksBought: 0,
    owned: new Array(NS).fill(0), bought: new Array(NS).fill(0), upg: new Array(NS).fill(0),
    infra: new Array(NI).fill(0), effUpg: [false, false, false, false],
    globals: 0, milestones: new Set(), contracts: [], contractT: 0,
    qol: new Set(),
    spend: { servers: 0, upgrades: 0, infra: 0, racks: 0, moves: 0, globals: 0, refresh: 0, qol: 0 },
    exits: 0, runStart: 0, lastBuy: 0, incidents: 0, lastIncident: 0,
    overTicks: 0, ticks: 0, utilSum: 0, noRedSince: 0, hiUpSince: 0,
    evt: null, evtIdx: 0, lastEvt: 0,
  };
}
function clone(S) { return Object.assign({}, S, { owned: S.owned.slice(), bought: S.bought.slice(), upg: S.upg.slice(), infra: S.infra.slice(), effUpg: S.effUpg.slice() }); }
const used = S => S.owned.reduce((a, b) => a + b, 0);
const slots = S => S.racks * 8;
const serverCost = (S, t) => CFG.servers[t].base * Math.pow(CFG.servers[t].growth || CFG.growth, S.owned[t]);
const rackCost = S => CFG.stages[S.stage - 1].rackBase * Math.pow(CFG.rackGrowthByStage ? CFG.rackGrowthByStage[S.stage - 1] : CFG.rackGrowth, S.racksBought);
function visible(S, t) {
  const sv = CFG.servers[t];
  if (sv.stage > S.stage) return false;
  if (S.val < CFG.visibleFrac * sv.base && !(CFG.visCash && S.cash >= CFG.visibleFrac * sv.base)) return false;
  if (sv.needBoxes && Math.max(S.bought[0], S.owned[0]) < sv.needBoxes) return false; // run-lifetime count, as sim_shop.js
  return true;
}

function caps(S) {
  let p = CFG.baseCap.power, c = CFG.baseCap.cool, n = CFG.baseCap.net, coolDraw = 0, genset = 0;
  for (let i = 0; i < NI; i++) {
    const k = S.infra[i]; if (!k) continue; const it = CFG.infra[i];
    if (it.meter === 'power') { p += k * it.cap; if (it.genset) genset += k * it.cap; }
    else if (it.meter === 'cool') { c += k * it.cap; coolDraw += k * it.draw; }
    else n += k * it.cap;
  }
  if (S.effUpg[1]) coolDraw *= 0.6;
  if (S.effUpg[3]) c *= 1.25;
  return { p, c, n, coolDraw, genset };
}
function rawDemand(S) {
  let p = 0, n = 0;
  for (let t = 0; t < NS; t++) { if (!S.owned[t]) continue; const m = Math.pow(CFG.drawMult, S.upg[t]); p += S.owned[t] * CFG.servers[t].kw * m; n += S.owned[t] * CFG.servers[t].gbps * m; }
  return { p, n };
}
function demand(S, cf) {
  const r = rawDemand(S);
  let p = r.p * cf.p, h = r.p * cf.h, n = r.n * cf.n;
  if (S.effUpg[0]) h *= 0.85;
  if (S.effUpg[2]) n *= 0.8;
  return { p, h, n };
}
function contractFactors(S, uptime) {
  let mult = 1, p = 1, h = 1, n = 1, add = 0;
  for (const c of S.contracts) {
    const m = (c.sla && uptime < c.sla) ? 1.0 : c.mult;
    if (STACK === 'add') add += m - 1; else mult *= m;
    p *= c.p; h *= c.h; n *= c.n;
  }
  if (STACK === 'add') mult = 1 + add;
  return { mult, p, h, n };
}
function ratios(S, cf, evt) {
  const c = caps(S); const d = demand(S, cf);
  let cp = c.p, cc = c.c, cn = c.n, dn = d.n;
  if (evt) { if (evt.coolCap) cc *= evt.coolCap; if (evt.powCap) cp *= evt.powCap; if (evt.netCap) cn *= evt.netCap; if (evt.netDem) dn *= evt.netDem; }
  const pDem = d.p + c.coolDraw;
  return { rP: pDem > 0 ? cp / pDem : Infinity, rC: d.h > 0 ? cc / d.h : Infinity, rN: dn > 0 ? cn / dn : Infinity, pDem, d, c };
}
function efficiencyOf(S, cf, evt) { const r = ratios(S, cf, evt); return { eff: Math.pow(Math.min(r.rP, r.rC, r.rN, 1), CFG.effExp), r }; }
function globalFactor(n) { if (!CFG.globalMults) return Math.pow(CFG.globalMult, n); let f = 1; for (let i = 0; i < n; i++) f *= (CFG.globalMults[i] !== undefined ? CFG.globalMults[i] : CFG.globalMult); return f; }
function baseIncome(S) { let b = 0; for (let t = 0; t < NS; t++) b += S.owned[t] * CFG.servers[t].inc * Math.pow(2, S.upg[t]); return b; }
function incomeOf(S, uptime = S.uptime, evt = null) {
  const cf = contractFactors(S, uptime);
  const { eff } = efficiencyOf(S, cf, evt);
  const um = CFG.uptimeFloor + (1 - CFG.uptimeFloor) * Math.pow(uptime / 100, 2);
  let inc = baseIncome(S) * cf.mult * eff * um * (1 + CFG.shareBonus * S.shares) * globalFactor(S.globals) * (1 + CFG.milestoneBonus * S.milestones.size);
  if (evt && evt.incMul) inc *= evt.incMul;
  return inc;
}

// Buy the cheapest infra set that brings every meter to <=100% (cooling first since it draws power).
function fitInfra(S, cf, acc) {
  let cost = 0;
  for (let iter = 0; iter < 60; iter++) {
    const c = caps(S), d = demand(S, cf); const pDem = d.p + c.coolDraw;
    let meter = null, short = 0;
    if (c.c < d.h - 1e-9) { meter = 'cool'; short = d.h - c.c; }
    else if (c.n < d.n - 1e-9) { meter = 'net'; short = d.n - c.n; }
    else if (c.p < pDem - 1e-9) { meter = 'power'; short = pDem - c.p; }
    else return cost;
    let bestCover = null, bestRate = null;
    const consider = (price, gain, apply, label) => {
      if (gain <= 0) return;
      if (gain >= short) { if (!bestCover || price < bestCover.price) bestCover = { price, apply, label }; }
      else { const rate = price / gain; if (!bestRate || rate < bestRate.rate) bestRate = { price, apply, label, rate }; }
    };
    for (let i = 0; i < NI; i++) {
      const it = CFG.infra[i]; if (it.meter !== meter || it.stage > S.stage) continue;
      if (it.max && S.infra[i] >= it.max) continue;
      if (it.needsAnnealer && S.owned[6] === 0) continue;
      const price = it.base * Math.pow(it.growth, S.infra[i]);
      let gain = it.cap; if (meter === 'cool' && S.effUpg[3]) gain *= 1.25;
      consider(price, gain, () => { S.infra[i]++; }, it.name);
    }
    if (meter === 'cool' && !S.effUpg[0] && CFG.effUpg[0].stage <= S.stage) consider(CFG.effUpg[0].cost, 0.15 * d.h, () => { S.effUpg[0] = true; }, 'Containment');
    if (meter === 'cool' && !S.effUpg[3] && CFG.effUpg[3].stage <= S.stage) consider(CFG.effUpg[3].cost, 0.25 * c.c, () => { S.effUpg[3] = true; }, 'Economizer');
    if (meter === 'net' && !S.effUpg[2] && CFG.effUpg[2].stage <= S.stage) consider(CFG.effUpg[2].cost, 0.2 * d.n, () => { S.effUpg[2] = true; }, 'Compression');
    if (meter === 'power' && !S.effUpg[1] && CFG.effUpg[1].stage <= S.stage) consider(CFG.effUpg[1].cost, 0.4 * c.coolDraw, () => { S.effUpg[1] = true; }, 'VSD');
    const pick = bestCover || bestRate;
    if (!pick) return Infinity;
    pick.apply(); cost += pick.price; if (acc) { acc.infra += pick.price; acc.items.push(pick.label); }
  }
  return Infinity;
}

// ---------------- CANDIDATES ----------------
function genCandidates(S) {
  const out = [];
  const cf = contractFactors(S, 100);
  const I0 = incomeOf(S, 100);
  const push = (name, cost, S2, acc) => {
    if (!isFinite(cost) || cost <= 0) return;
    const dI = incomeOf(S2, 100) - I0;
    out.push({ name, cost, dI, S2, acc });
  };
  const stg = CFG.stages[S.stage - 1];
  const allBought = S.racks >= stg.racks;
  const full = used(S) >= slots(S);
  const newAcc = () => ({ servers: 0, upgrades: 0, infra: 0, racks: 0, moves: 0, globals: 0, refresh: 0, qol: 0, items: [] });

  for (let t = 0; t < NS; t++) {
    const sv = CFG.servers[t];
    if (visible(S, t)) {
      const S2 = clone(S); const acc = newAcc(); let cost = 0; let label = sv.name;
      if (used(S2) >= slots(S2) && !allBought) { const rc = rackCost(S2); cost += rc; acc.racks += rc; S2.racks++; S2.racksBought++; label += ' +rack'; }
      if (used(S2) < slots(S2)) {
        const sc = serverCost(S2, t); cost += sc; acc.servers += sc; S2.owned[t]++; S2.bought[t]++;
        cost += fitInfra(S2, cf, acc); push(label, cost, S2, acc);
      }
    }
    if (allBought && S.stage < 5) {
      const S2 = clone(S); const acc = newAcc(); acc.prevFill = used(S) / slots(S); S2.stage++; S2.racksBought = 0;
      const mv = CFG.stages[S2.stage - 1].move; let cost = mv; acc.moves += mv;
      if (visible(S2, t)) {
        if (used(S2) >= slots(S2)) { const rc = rackCost(S2); cost += rc; acc.racks += rc; S2.racks++; S2.racksBought++; }
        const sc = serverCost(S2, t); cost += sc; acc.servers += sc; S2.owned[t]++; S2.bought[t]++;
        cost += fitInfra(S2, contractFactors(S2, 100), acc);
        push('MOVE>' + CFG.stages[S2.stage - 1].name + ' +' + sv.name, cost, S2, acc);
      }
    }
  }
  for (let t = 0; t < NS; t++) {
    const u = S.upg[t]; if (u >= CFG.upgThresh.length || S.owned[t] < CFG.upgThresh[u]) continue;
    const S2 = clone(S); const acc = newAcc(); S2.upg[t]++;
    let cost = CFG.servers[t].base * CFG.upgCost[u]; acc.upgrades += cost;
    cost += fitInfra(S2, cf, acc); push('UPG ' + CFG.servers[t].name + ' x' + Math.pow(2, u + 1), cost, S2, acc);
  }
  if (allBought && full) {
    for (let t = 0; t < NS - 1; t++) {
      if (!S.owned[t]) continue;
      const N = t + 1;
      if (visible(S, N)) {
        const S2 = clone(S); const acc = newAcc();
        S2.owned[t]--; const refund = CFG.refreshRefund * CFG.servers[t].base * Math.pow(CFG.servers[t].growth || CFG.growth, S2.owned[t]);
        let cost = serverCost(S2, N) - refund; acc.refresh += cost; S2.owned[N]++; S2.bought[N]++;
        cost += fitInfra(S2, cf, acc); push('REFRESH ' + CFG.servers[t].name + '>' + CFG.servers[N].name, cost, S2, acc);
      }
      break; // only lowest tier owned
    }
  }
  if (S.globals < CFG.globals.length && (CFG.globalsLifetime ? (S.lifeVal || 0) : S.val) >= CFG.globals[S.globals]) {
    const S2 = clone(S); const acc = newAcc(); S2.globals++;
    const cost = CFG.globalCostFrac * CFG.globals[S.globals]; acc.globals += cost; push('GLOBAL #' + S2.globals, cost, S2, acc);
  }
  { const S2 = clone(S); const acc = newAcc(); const cost = fitInfra(S2, cf, acc); if (cost > 0 && isFinite(cost)) push('FIX ' + acc.items.join('+'), cost, S2, acc); }
  return out;
}

// ---------------- MILESTONES ----------------
const MS = [
  ['Lights On', S => used(S) >= 1],
  ['Getting Warm', (S, x) => x.rC < 1.25],
  ['Buy a Fan', S => S.infra[6] >= 1],
  ['Just the One', S => S.owned[1] >= 1],
  ['First Gigabit', S => S.infra[13] >= 1],
  ['Fill Rack 1', S => used(S) >= 8],
  ['Fix 5 Incidents', S => S.incidents >= 5],
  ['First Contract', S => S.contracts.length > 0],
  ['$1,000', S => S.val >= 1e3],
  ['Sell the Civic', S => S.racks >= 3],
  ['Fill the Garage', S => used(S) >= 32],
  ['Hire Dale', S => S.qol.has('Dale')],
  ['Sign the Lease', S => S.stage >= 2],
  ['100 Servers', S => used(S) >= 100],
  ['10 Min No Red', (S) => S.active - S.noRedSince >= 600],
  ['$100,000', S => S.val >= 1e5],
  ['Out of the Cage', S => S.owned[2] >= 1],
  ['First Storage Array', S => S.owned[3] >= 1],
  ['Make Me a Million', S => S.val >= 1e6],
  ['Warehouse', S => S.stage >= 3],
  ['First Megawatt', S => caps(S).p >= 1000],
  ['99.9 for 10 Min', S => S.active - S.hiUpSince >= 600],
  ['First Exit', S => S.exits >= 1],
  ['The Hall', S => S.stage >= 4],
  ['First Sled', S => S.owned[5] >= 1],
  ['Four Nines', S => S.active - S.hiUpSince >= 1800],
  ['Campus', S => S.stage >= 5],
  ['Marjorie', S => S.infra[18] >= 1],
  ['First Reactor', S => S.infra[5] >= 1],
  ['$1 Trillion', S => S.val >= 1e12],
  ['You Are the Cloud', S => S.val >= 1e15],
  ['200 Servers', S => used(S) >= 200], ['500 Servers', S => used(S) >= 500], ['1000 Servers', S => used(S) >= 1000],
  ['25 Incidents', S => S.incidents >= 25], ['100 Incidents', S => S.incidents >= 100],
  ['First Pod', S => S.owned[4] >= 1], ['First Annealer', S => S.owned[6] >= 1], ['First Orbital', S => S.owned[7] >= 1],
  ['$10M', S => S.val >= 1e7],
];

// ---------------- EVENTS ----------------
const EVENT_ROT = ['heatwave', 'flicker', 'fibercut', 'ddos', 'viral', 'aiboom', 'cryptobust', 'investor'];
function startEvent(S, name) {
  const c = caps(S);
  switch (name) {
    case 'heatwave': return { name, coolCap: 0.7, until: S.active + 120 };
    case 'flicker': if (S.qol.has('UPS') || c.genset >= 0.2 * c.p) return null; return { name, powCap: 0.8, until: S.active + 60 };
    case 'fibercut': if (S.qol.has('Dual-carrier')) return null; return { name, netCap: 0.5, until: S.active + 45 };
    case 'ddos': if (S.qol.has('Scrubbing')) return null; return { name, netDem: 3, until: S.active + 5 }; // tapped 5x by hand
    case 'viral': { const r = ratios(S, contractFactors(S, S.uptime), { netDem: 2 }); return { name, netDem: 2, incMul: (Math.min(r.rP, r.rC, r.rN) >= 1 ? 1.5 : 1), until: S.active + 90 }; }
    case 'aiboom': return { name, incMul: 1.5, until: S.active + 180 };
    case 'cryptobust': return { name, incMul: 0.7, until: S.active + 180 };
    case 'investor': return { name, incMul: S.uptime >= 99 ? 3 : 1, until: S.active + 60 };
  }
}

// ---------------- RUN ----------------
const fmt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + 'h' : '') + String(m).padStart(2, '0') + 'm' + String(x).padStart(2, '0') + 's'; };
const money = v => { if (v < 1000) return '$' + v.toFixed(v < 10 ? 2 : 0); const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = 0; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return '$' + v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + u[i]; };

const S = mkState();
const log = [];
const gaps = [];
const msTimes = {};
const snapshots = [];
const exitsLog = [];
let buysThisMinute = 0; const buysPerMinute = [];
let msFlashed = new Set();
const say = s => log.push(`${fmt(S.t)} ${s}`);
const runSay = s => say(`[run${S.exits + 1} ${fmt(S.active - S.runStart)}] ${s}`);

function chooseContracts(S) {
  if (CONTRACTS === 'none' || S.racks < 2) return;
  const allowed = CFG.contracts.filter(c => c.stage <= S.stage && (!c.needPods || S.owned[4] >= c.needPods));
  const k = CFG.contractSlots[S.stage - 1];
  const I = incomeOf(S);
  let best = { score: -Infinity, set: [], cost: 0, S2: null };
  const combos = [[]];
  const rec = (start, cur) => { if (cur.length >= k) return; for (let i = start; i < allowed.length; i++) { const nx = cur.concat([allowed[i]]); combos.push(nx); rec(i + 1, nx); } };
  rec(0, []);
  for (const set of combos) {
    const S2 = clone(S); S2.contracts = set; const acc = { infra: 0, items: [] };
    const cost = fitInfra(S2, contractFactors(S2, 100), acc);
    if (!isFinite(cost) || cost > S.cash) continue;
    const inc = incomeOf(S2, 100);
    const score = inc - cost / CFG.contractDur;
    if (score > best.score) best = { score, set, cost, S2, acc };
  }
  if (!best.S2) return;
  const names = best.set.map(c => c.name).join(' + ') || 'none';
  const prev = S.contracts.map(c => c.name).join(' + ') || 'none';
  if (best.cost > 0) { best.S2.cash = S.cash - best.cost; best.S2.spend = Object.assign({}, S.spend, { infra: S.spend.infra + best.cost }); best.S2.lastBuy = S.active; Object.assign(S, best.S2); }
  S.contracts = best.set; S.contractT = CFG.contractDur;
  if (names !== prev) runSay(`CONTRACT -> ${names}${best.cost > 0 ? ' (infra needed ' + money(best.cost) + ')' : ''}`);
}

function doExit(S) {
  const gain = Math.floor(Math.cbrt(S.val / 1e6));
  const runLen = S.active - S.runStart;
  const infraShare = S.spend.infra / Object.values(S.spend).reduce((a, b) => a + b, 0);
  const fill = used(S) / slots(S);
  exitsLog.push({ t: S.t, active: S.active, val: S.val, from: S.shares, to: S.shares + gain, runLen, stage: S.stage, income: incomeOf(S), infraShare, fill, servers: S.owned.slice() });
  say(`EXIT #${S.exits + 1}: valuation ${money(S.val)} shares ${S.shares} -> ${S.shares + gain} (run ${fmt(runLen)}, ${money(incomeOf(S))}/s, ${CFG.stages[S.stage - 1].name}, fill ${(fill * 100).toFixed(0)}%, infra ${(infraShare * 100).toFixed(0)}% of spend, servers [${S.owned.join(',')}])`);
  S.shares += gain; S.exits++;
  let perk = { cash: 0, stage: 1, racks: 1 };
  for (const k of Object.keys(CFG.perks).map(Number).sort((a, b) => a - b)) if (S.shares >= k) perk = CFG.perks[k];
  S.cash = Math.max(CFG.startCash, perk.cash); S.val = 0; S.uptime = 100; S.stage = perk.stage; S.racks = perk.racks; S.racksBought = 0;
  S.owned.fill(0); S.bought.fill(0); S.upg.fill(0); S.infra.fill(0); S.effUpg.fill(false); if (!CFG.globalsLifetime) S.globals = 0; S.contracts = []; S.contractT = 0;
  if (S.shares >= 1) { S.infra[0] = 1; S.infra[6] = 1; S.infra[13] = 1; }
  S.spend = { servers: 0, upgrades: 0, infra: 0, racks: 0, moves: 0, globals: 0, refresh: 0, qol: 0 };
  S.runStart = S.active; S.lastBuy = S.active; S.qol = new Set(); S.evt = null;
}

function tick(S) {
  const evt = S.evt && S.active < S.evt.until ? S.evt : null; if (S.evt && !evt) S.evt = null;
  const cfU = contractFactors(S, S.uptime);
  const { eff, r } = efficiencyOf(S, cfU, evt);
  const I = incomeOf(S, S.uptime, evt);
  S.cash += I; S.val += I; S.lifeVal = (S.lifeVal || 0) + I;
  if (S.stage === 1 && S.active - S.runStart < CFG.hustleUntil) { const h = CFG.hustle * CFG.hustleRate; S.cash += h; S.val += h; S.lifeVal += h; }
  if (INCIDENTS && S.active - S.runStart >= CFG.incidentStart && S.active - S.lastIncident >= CFG.incidentEvery) {
    const b = Math.max(CFG.incidentMin, CFG.incidentBountySec * I); S.cash += b; S.val += b; S.lifeVal += b; S.incidents++; S.lastIncident = S.active;
  }
  // uptime
  const minR = Math.min(r.rP, r.rC, r.rN);
  if (minR < 1) { S.uptime = Math.max(0, S.uptime - (1 - eff) * CFG.uptimeFallK); S.overTicks++; S.noRedSince = S.active; }
  else S.uptime = Math.min(100, S.uptime + CFG.uptimeRecover);
  if (S.uptime < 99.9) S.hiUpSince = S.active;
  S.ticks++; S.utilSum += isFinite(minR) ? Math.min(1 / minR, 2) : 0;
  // events
  if (EVENTS && S.stage >= 2 && !S.evt && S.active - S.lastEvt >= 300) {
    const name = EVENT_ROT[S.evtIdx++ % EVENT_ROT.length]; S.lastEvt = S.active;
    const e = startEvent(S, name); if (e) { S.evt = e; if (VERBOSE) runSay(`EVENT ${name}`); }
  }
  // contracts
  if (S.racks >= 2 && CONTRACTS !== 'none') {
    if (S.contractT <= 0 || (S.contracts.length === 0 && S.contractT < CFG.contractDur - 30)) chooseContracts(S);
    else if (S.contracts.length && eff < 0.95 && S.active % 60 === 0) { const fee = 30 * I; S.cash -= fee; S.spend.qol += fee; runSay(`REROLL (eff ${eff.toFixed(2)}, fee ${money(fee)})`); chooseContracts(S); }
    S.contractT--; }
  // QoL purchases
  for (const q of CFG.qol) if (!S.qol.has(q.name) && q.stage <= S.stage && q.cost <= CFG.qolSeconds * I && S.cash >= q.cost) { S.cash -= q.cost; S.spend.qol += q.cost; S.qol.add(q.name); S.lastBuy = S.active; }
  // milestones
  for (const [name, fn] of MS) if (!S.milestones.has(name) && fn(S, r)) { S.milestones.add(name); if (!(name in msTimes)) msTimes[name] = { t: S.t, active: S.active, run: S.exits + 1, income: I, val: S.val }; if (VERBOSE || !msFlashed.has(name)) { runSay(`* ${name}  (${money(S.val)} val, ${money(I)}/s)`); msFlashed.add(name); } }
  // greedy purchases (up to 6 per second)
  for (let k = 0; k < 6; k++) {
    const cands = genCandidates(S);
    let best = null;
    for (const c of cands) {
      if (c.dI <= 1e-12) continue;
      const wait = c.cost > S.cash ? (I > 0 ? (c.cost - S.cash) / I : Infinity) : 0;
      const score = wait + c.cost / c.dI;
      if (!best || score < best.score) best = Object.assign({ score, wait }, c);
    }
    if (!best || best.cost > S.cash) break;
    const gap = S.active - S.lastBuy;
    if (gap >= 240) gaps.push({ t: S.t, active: S.active, gap, bought: best.name, cost: best.cost, run: S.exits + 1 });
    // apply
    const S2 = best.S2; S2.cash = S.cash - best.cost; S2.lastBuy = S.active;
    for (const key of Object.keys(S.spend)) S2.spend[key] = S.spend[key] + (best.acc[key] || 0);
    Object.assign(S, S2);
    buysThisMinute++;
    if (LOGBUYS) runSay(`buy ${best.name} ${money(best.cost)} -> ${money(incomeOf(S, 100))}/s  cash ${money(S.cash)}  [P ${(1 / r.rP * 100).toFixed(0)}% C ${(1 / r.rC * 100).toFixed(0)}% N ${(1 / r.rN * 100).toFixed(0)}%]`);
    if (best.name.startsWith('MOVE')) runSay(`STAGE ${CFG.stages[S.stage - 1].name} (val ${money(S.val)}, ${money(incomeOf(S))}/s, fill of previous stage was ${(best.acc.prevFill * 100).toFixed(0)}%, infra share so far ${(100 * S.spend.infra / Object.values(S.spend).reduce((a, b) => a + b, 0)).toFixed(0)}%)`);
    if (best.name.startsWith('GLOBAL')) runSay(`GLOBAL x1.5 #${S.globals} ${money(best.cost)} -> ${money(incomeOf(S))}/s`);
    if (best.name.startsWith('UPG')) runSay(`${best.name} ${money(best.cost)} -> ${money(incomeOf(S))}/s`);
    if (best.name.startsWith('REFRESH') && VERBOSE) runSay(`${best.name} ${money(best.cost)}`);
    const sName = best.name.replace(/^MOVE>\w+ \+/, '').replace(/ \+rack$/, '');
    const ti = CFG.servers.findIndex(s => s.name === sName);
    if (ti >= 0 && S.owned[ti] === 1) runSay(`first ${sName} ${money(best.cost)} (val ${money(S.val)}, ${money(incomeOf(S))}/s)`);
    if (best.acc.racks > 0 && S.stage === 1) runSay(`Rack ${S.racks} ${money(best.acc.racks)}`);
  }
  // exit
  if (EXIT_RULE === 'glow' && S.val >= 1e6) {
    const gain = Math.floor(Math.cbrt(S.val / 1e6));
    if (S.shares + gain >= Math.max(3, (CFG.glowFactor || 1.5) * S.shares)) doExit(S);
  }
  S.t++; S.active++;
  if (S.active % 60 === 0) { buysPerMinute.push(buysThisMinute); buysThisMinute = 0; }
  if (S.active % 300 === 0) {
    snapshots.push({ infraShare: S.spend.infra / Math.max(1, Object.values(S.spend).reduce((a, b) => a + b, 0)), t: S.t, active: S.active, income: I, val: S.val, cash: S.cash, stage: S.stage, racks: S.racks, fill: used(S) / slots(S), util: { P: 1 / r.rP, C: 1 / r.rC, N: 1 / r.rN }, uptime: S.uptime, shares: S.shares, owned: S.owned.slice(), upg: S.upg.slice(), contracts: S.contracts.map(c => c.name).join('+') });
  }
}

function offline(S, secs) {
  const I = incomeOf(S);
  const d = Math.min(secs, CFG.offlineCapH * H);
  let earn = CFG.offlineFrac * I * d;
  if (CFG.offlineTaper) earn = I * (0.5 * Math.min(d, 2 * H) + 0.2 * Math.max(0, d - 2 * H));
  S.cash += earn; S.val += earn * (CFG.offlineValFrac ?? 1); S.lifeVal = (S.lifeVal || 0) + earn; S.t += secs;
  if (INCIDENTS) { const b = 3 * Math.max(CFG.incidentMin, CFG.incidentBountySec * I); S.cash += b; S.val += b; S.lifeVal += b; S.incidents += 3; }
  say(`OFFLINE ${fmt(secs)}: +${money(earn)} (saved ${money(I)}/s), cash now ${money(S.cash)}`);
}

// schedule
let sessions;
if (SCHEDULE === 'single') sessions = [{ play: HOURS * H, gap: 0 }];
else if (SCHEDULE === 'mixed') { sessions = [{ play: 2 * H, gap: 8 * H }]; for (let i = 0; i < 8; i++) sessions.push({ play: 1 * H, gap: i < 7 ? 8 * H : 0 }); }
else if (SCHEDULE === 'mixed2') { sessions = []; for (let i = 0; i < 20; i++) sessions.push({ play: 0.5 * H, gap: i < 19 ? 3 * H : 0 }); }
else throw new Error('schedule');

for (const s of sessions) { for (let i = 0; i < s.play; i++) tick(S); if (s.gap) offline(S, s.gap); }

// ---------------- REPORT ----------------
console.log(`=== UPTIME economy sim | schedule=${SCHEDULE} hours=${HOURS} contracts=${CONTRACTS} events=${EVENTS} incidents=${INCIDENTS} stack=${STACK} exit=${EXIT_RULE} patch=${PATCH || 'none'} ===`);
console.log('\n--- Milestone first-hit times (wall clock / active play) ---');
for (const [name] of MS) { const m = msTimes[name]; console.log(`${name.padEnd(22)} ${m ? fmt(m.t).padStart(9) + '  active ' + fmt(m.active).padStart(9) + '  run' + m.run + '  ' + money(m.income).padStart(9) + '/s  val ' + money(m.val) : '      --- not reached'}`); }
console.log('\n--- Event log ---');
for (const l of log) console.log(l);
console.log('\n--- Purchase gaps >= 4 min ---');
if (!gaps.length) console.log('none'); for (const g of gaps) console.log(`${fmt(g.t)} run${g.run}: ${fmt(g.gap)} with no purchase, then bought ${g.bought} for ${money(g.cost)}`);
console.log('\n--- Snapshots every 5 min (active) ---');
console.log('active    | wall      | income/s   | valuation | cash      | stage     | racks | fill | utilP utilC utilN | uptime | sh | infra | contracts | owned');
for (const s of snapshots) console.log(`${fmt(s.active).padStart(9)} | ${fmt(s.t).padStart(9)} | ${money(s.income).padStart(10)} | ${money(s.val).padStart(9)} | ${money(s.cash).padStart(9)} | ${CFG.stages[s.stage - 1].name.padEnd(9)} | ${String(s.racks).padStart(5)} | ${(s.fill * 100).toFixed(0).padStart(3)}% | ${(s.util.P * 100).toFixed(0).padStart(4)}% ${(s.util.C * 100).toFixed(0).padStart(4)}% ${(s.util.N * 100).toFixed(0).padStart(4)}% | ${s.uptime.toFixed(1).padStart(6)} | ${String(s.shares).padStart(2)} | ${(s.infraShare * 100).toFixed(0).padStart(4)}% | ${s.contracts.padEnd(22)} | [${s.owned.join(',')}] upg[${s.upg.join(',')}]`);
console.log('\n--- Buys per minute (active) ---');
console.log(buysPerMinute.map((b, i) => (i % 30 === 0 ? `\n${fmt(i * 60)}: ` : '') + String(b).padStart(3)).join(''));
console.log('\n--- Exits ---');
for (const e of exitsLog) console.log(`${fmt(e.t)} (active ${fmt(e.active)}): ${money(e.val)} shares ${e.from}->${e.to} run ${fmt(e.runLen)} stage ${CFG.stages[e.stage - 1].name} fill ${(e.fill * 100).toFixed(0)}% infra ${(e.infraShare * 100).toFixed(0)}%`);
const tot = Object.values(S.spend).reduce((a, b) => a + b, 0);
console.log('\n--- Final state ---');
console.log(`t=${fmt(S.t)} active=${fmt(S.active)} shares=${S.shares} exits=${S.exits} stage=${CFG.stages[S.stage - 1].name} racks=${S.racks} fill=${(used(S) / slots(S) * 100).toFixed(0)}% income=${money(incomeOf(S))}/s val=${money(S.val)} cash=${money(S.cash)} uptime=${S.uptime.toFixed(1)}`);
console.log(`owned=[${S.owned.join(',')}] upg=[${S.upg.join(',')}] infra=[${CFG.infra.map((it, i) => S.infra[i] ? it.name + ':' + S.infra[i] : '').filter(Boolean).join(' ')}] effUpg=[${S.effUpg.map((b, i) => b ? CFG.effUpg[i].name : '').filter(Boolean).join(',')}] globals=${S.globals} milestones=${S.milestones.size}`);
console.log(`spend this run: ${Object.entries(S.spend).map(([k, v]) => k + ' ' + (tot ? (100 * v / tot).toFixed(0) : 0) + '%').join(', ')}`);
console.log(`over-capacity ticks: ${(100 * S.overTicks / S.ticks).toFixed(1)}%  mean max-utilisation: ${(100 * S.utilSum / S.ticks).toFixed(0)}%`);
