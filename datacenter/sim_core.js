// sim_core.js — pure helpers for sim.js: fresh state, save migration, the §2 derived math and the §3-§6 price rules.
// Nothing here touches time, storage or randomness; everything takes `data` (the data.js module) explicitly so tests
// can swap tables.

export const METERS = ['power', 'cooling', 'network'];

// Finite non-negative number or the fallback. Every derived value and every saved number passes through this so a
// bad save or a division by zero can never put NaN into cash or a meter.
export const fin = (n, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? n : d);
export const nonneg = (n, d = 0) => Math.max(0, fin(n, d));
export const int = (n, d = 0) => Math.max(0, Math.floor(fin(n, d)));
const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);

// A savedAt below this (Sep 2001) is not a Date.now() stamp: an older build wrote performance.now() there, and treating
// it as an epoch would pay 8 h of offline earnings on every reload. Such a stamp reads as "unknown: no offline".
export const MIN_EPOCH_MS = 1e12;
export const saneEpoch = t => typeof t === 'number' && Number.isFinite(t) && t >= MIN_EPOCH_MS;

// Manual board reroll floor when income is 0 (all racks dark, blackout): data.CONTRACT_RULES.rerollMin overrides it.
export const REROLL_MIN = 5;

// ---------------------------------------------------------------------------------------------
// state (§14.2)

export function freshAccount(nowMs) {
  return {
    shares: 0, milestones: [], skyline: 0, flags: { breakerSeen: false },
    lifetime: { servers: 0, incidents: 0, contracts: 0, exits: 0, valuation: 0 },
    settings: { bloom: true, sound: true },
    tickerRecent: [],                  // [{ id, at }] with at in ms; the §18 15-minute rule (ids are 'tk_<index>')
    savedAt: nowMs,
    seed: (nowMs >>> 0) || 1,          // mulberry32 seed used when createSim() is given no rng
  };
}

export const newRack = data => ({ servers: new Array(data.RACK_SLOTS).fill(null), dark: false, incident: null });

export function freshRun(data, { stage = 1, racks = 1, cash = data.START.cash } = {}) {
  return {
    cash, valuation: 0, uptime: data.UPTIME.start, stage, runTime: 0, noRedSince: 0,
    startStage: stage,                 // the breaker only exists for runs that began in the garage
    racks: Array.from({ length: racks }, () => newRack(data)),
    racksBoughtThisStage: 0, infra: {}, bought: {}, upgrades: {}, globals: 0,
    effUpgrades: [], mitigations: [], staff: 0,
    contracts: { active: [], board: [], boardAge: 0 },
    event: null, lastIncidentAt: 0,
    nextIncidentAt: data.INCIDENT_RULES.start, nextEventAt: null,
    uptimeBelow: {},                   // { [minUptime]: runTime uptime was last below it } for uptimeFor milestones
    amberSeen: {},                     // { [meter]: true } for meterAmber milestones
    refreshes: 0, badgeFocus: null,
    pendingIncidents: 0, pendingIncidentsAt: 0, // the three incidents that follow the offline card
    openingShown: false,
    seenTiers: [],                     // tiers that have passed the §3 25% reveal this run: the Build row never blinks out again
  };
}

// ---------------------------------------------------------------------------------------------
// migrate (§14.7): the only place that knows older shapes. Returns a valid state or null.

export function migrate(raw, data, nowMs) {
  if (!isObj(raw)) return null;
  let s = raw, bareRun = false;
  if (fin(raw.v, 0) < 1) {
    // v0 blobs were the same two halves without a version field; a bare run (cash at the top level) also appeared.
    if (isObj(raw.account) && isObj(raw.run)) s = { v: 1, account: raw.account, run: raw.run };
    else if (typeof raw.cash === 'number') { s = { v: 1, account: {}, run: raw }; bareRun = true; }
    else return null;
  }
  if (!isObj(s.account) || !isObj(s.run)) return null;
  // The save signature: every blob the game ever wrote has these, `{}` / `{account:{},run:{}}` do not. Without it an
  // empty paste would "import" as a fresh account and wipe the real one.
  const accountLike = bareRun || typeof s.account.shares === 'number' || Array.isArray(s.account.milestones);
  const runLike = typeof s.run.cash === 'number' || Array.isArray(s.run.racks);
  if (!accountLike || !runLike) return null;
  return { v: 1, account: normalizeAccount(s.account, data, nowMs), run: normalizeRun(s.run, data) };
}

function normalizeAccount(a, data, nowMs) {
  const d = freshAccount(nowMs);
  const msIds = new Set(data.MILESTONES.map(m => m.id));
  const lt = a.lifetime && typeof a.lifetime === 'object' ? a.lifetime : {};
  const settings = a.settings && typeof a.settings === 'object' ? a.settings : {};
  return {
    shares: int(a.shares),
    milestones: Array.isArray(a.milestones) ? [...new Set(a.milestones.filter(id => msIds.has(id)))] : [],
    skyline: int(a.skyline),
    flags: { breakerSeen: !!(a.flags && a.flags.breakerSeen) },
    lifetime: { servers: int(lt.servers), incidents: int(lt.incidents), contracts: int(lt.contracts), exits: int(lt.exits), valuation: nonneg(lt.valuation) },
    settings: { bloom: settings.bloom !== false, sound: settings.sound !== false },
    tickerRecent: Array.isArray(a.tickerRecent)
      ? a.tickerRecent.filter(e => e && typeof e.id === 'string').map(e => ({ id: e.id, at: fin(e.at, 0) }))
      : [],
    savedAt: saneEpoch(a.savedAt) ? a.savedAt : nowMs, // a non-epoch stamp means "unknown": no offline earnings
    seed: int(a.seed, d.seed) || d.seed,
  };
}

function normalizeRun(r, data) {
  const stage = Math.min(5, Math.max(1, int(r.stage, 1) || 1));
  const d = freshRun(data, { stage });
  const tierIds = new Set(data.TIERS.map(t => t.id));
  const infraIds = new Set(data.INFRA.map(i => i.id));
  const conIds = new Set(data.CONTRACTS.map(c => c.id));
  const evIds = new Set(data.EVENTS.map(e => e.id));
  const incIds = new Set(data.INCIDENTS.map(i => i.id));
  const infraMax = Object.fromEntries(data.INFRA.map(u => [u.id, u.max ?? Infinity]));
  const upgMax = data.UPGRADES.thresholds.length;
  // positive integer counts over known ids, clamped per key: the §4 caps (99 Box Fans import as 6) and the five §3 levels
  const counts = (obj, ids, maxOf = () => Infinity) => {
    const out = {};
    if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) {
      if (!ids.has(k)) continue;
      const n = Math.min(int(v), maxOf(k));
      if (n > 0) out[k] = n;
    }
    return out;
  };
  const ids = (arr, set) => (Array.isArray(arr) ? [...new Set(arr.filter(id => set.has(id)))] : []);
  const maxRacks = data.STAGES[stage - 1].footprints.length;
  let racks = Array.isArray(r.racks) ? r.racks.slice(0, maxRacks).map(rk => {
    const servers = Array.isArray(rk?.servers) ? rk.servers.slice(0, data.RACK_SLOTS) : [];
    while (servers.length < data.RACK_SLOTS) servers.push(null);
    const inc = rk?.incident && typeof rk.incident === 'object' && incIds.has(rk.incident.id)
      ? { id: rk.incident.id, t0: nonneg(rk.incident.t0), flavor: String(rk.incident.flavor ?? '') } : null;
    return { servers: servers.map(id => (tierIds.has(id) ? id : null)), dark: !!rk?.dark && !!inc, incident: inc };
  }) : [];
  if (!racks.length) racks = [newRack(data)];
  const con = r.contracts && typeof r.contracts === 'object' ? r.contracts : {};
  const slots = data.STAGES[stage - 1].slots;
  const active = Array.isArray(con.active)
    ? con.active.filter(a => a && conIds.has(a.id)).slice(0, slots).map(a => ({ id: a.id, termLeft: nonneg(a.termLeft) })) : [];
  const activeIds = new Set(active.map(a => a.id));
  const board = ids(con.board, conIds).filter(id => !activeIds.has(id)).slice(0, data.CONTRACT_RULES.boardSize);
  const event = r.event && typeof r.event === 'object' && evIds.has(r.event.id) && fin(r.event.tLeft) > 0
    ? { id: r.event.id, tLeft: fin(r.event.tLeft), handled: !!r.event.handled, bonus: !!r.event.bonus, taps: int(r.event.taps) } : null;
  const below = {};
  if (r.uptimeBelow && typeof r.uptimeBelow === 'object') for (const [k, v] of Object.entries(r.uptimeBelow)) below[k] = nonneg(v);
  const amber = {};
  if (r.amberSeen && typeof r.amberSeen === 'object') for (const m of METERS) if (r.amberSeen[m]) amber[m] = true;
  const runTime = nonneg(r.runTime);
  return {
    ...d,
    cash: nonneg(r.cash, d.cash), valuation: nonneg(r.valuation), uptime: Math.min(100, nonneg(r.uptime, 100)),
    stage, runTime, noRedSince: Math.min(runTime, nonneg(r.noRedSince)),
    startStage: Math.min(stage, Math.max(1, int(r.startStage, stage) || stage)),
    racks, racksBoughtThisStage: int(r.racksBoughtThisStage),
    infra: counts(r.infra, infraIds, k => infraMax[k]), bought: counts(r.bought, tierIds), upgrades: counts(r.upgrades, tierIds, () => upgMax),
    globals: Math.min(data.GLOBALS.length, int(r.globals)),
    effUpgrades: ids(r.effUpgrades, new Set(data.EFFICIENCY.map(e => e.id))),
    mitigations: ids(r.mitigations, new Set(data.MITIGATIONS.map(m => m.id))),
    staff: Math.min(data.STAFF_RULES.max, int(r.staff)),
    contracts: { active, board, boardAge: nonneg(con.boardAge) },
    event, lastIncidentAt: nonneg(r.lastIncidentAt),
    nextIncidentAt: nonneg(r.nextIncidentAt, d.nextIncidentAt),
    nextEventAt: r.nextEventAt == null ? null : nonneg(r.nextEventAt),
    uptimeBelow: below, amberSeen: amber, refreshes: int(r.refreshes), badgeFocus: null,
    pendingIncidents: int(r.pendingIncidents), pendingIncidentsAt: nonneg(r.pendingIncidentsAt),
    openingShown: !!r.openingShown,
    seenTiers: ids(r.seenTiers, tierIds),
  };
}

// ---------------------------------------------------------------------------------------------
// §2 derived values. `what` is an optional what-if overlay used by the shop: { servers:[{id,n}], infra:{id:n},
// upgrades:{id:+levels}, eff:[ids], contracts:[ids] } — the result is what the meters would read after that purchase.

export function eventFactors(event, data) {
  const f = { cap: { power: 1, cooling: 1, network: 1 }, dem: { power: 1, cooling: 1, network: 1 }, income: 1, blackout: false };
  if (!event || event.handled || !(event.tLeft > 0)) return f;
  const def = data.EVENTS.find(e => e.id === event.id);
  if (!def) return f;
  const e = def.effect;
  if (e.target === 'blackout') f.blackout = true;
  else if (e.target === 'capacity') f.cap[e.meter] *= e.factor;
  else if (e.target === 'demand') f.dem[e.meter] *= e.factor;
  else if (e.target === 'income' && (!def.requires || event.bonus)) f.income *= e.factor;
  if (def.headroomBonus && event.bonus) f.income *= def.headroomBonus.income;
  return f;
}

export const uptimeMultOf = (uptime, data) => data.UPTIME.floor + (1 - data.UPTIME.floor) * (nonneg(uptime) / 100) ** 2;
export const colourOf = (u, data) => (u > data.METER.red ? 'red' : u >= data.METER.amber ? 'amber' : 'green');

// data → lookup tables, built once per data module (the shop derives ~45 what-ifs per 100 ms refresh).
const TABLES = new WeakMap();
function tables(data) {
  let t = TABLES.get(data);
  if (!t) {
    t = { tierById: Object.fromEntries(data.TIERS.map(x => [x.id, x])), conById: Object.fromEntries(data.CONTRACTS.map(c => [c.id, c])) };
    TABLES.set(data, t);
  }
  return t;
}

// One cheap walk of the racks: per-tier counts (all / lit), installed, dark racks, fullness. computeDerived does its
// math per tier from these, and a what-if can reuse the base derived's counts instead of walking 240 × 8 slots again.
export function countServers(run, data) {
  const { tierById } = tables(data);
  const byTier = {}, lit = {};
  let installed = 0, darkRacks = 0, full = run.racks.length > 0;
  for (const rack of run.racks) {
    if (rack.dark) darkRacks++;
    for (const id of rack.servers) {
      if (!id) { full = false; continue; }
      if (!tierById[id]) continue;
      byTier[id] = (byTier[id] || 0) + 1; installed++;
      if (!rack.dark) lit[id] = (lit[id] || 0) + 1; // a dark rack still draws (it is still racked); it just earns nothing
    }
  }
  return { byTier, lit, installed, darkRacks, full, racks: run.racks.length, slots: run.racks.length * data.RACK_SLOTS };
}

export function computeDerived(state, data, what = null, base = null) {
  const { run, account } = state;
  const { tierById, conById } = tables(data);
  const dm = data.UPGRADES.drawMult, om = data.UPGRADES.outputMult ?? 2;
  const upgOf = id => int(run.upgrades[id]) + int(what?.upgrades?.[id]);
  const counts = base?.counts && base.counts.racks === run.racks.length ? base.counts : countServers(run, data);
  const { byTier, installed, darkRacks, full } = counts;
  const extra = {};
  if (what?.servers) for (const { id, n } of what.servers) if (tierById[id]) extra[id] = (extra[id] || 0) + int(n);
  let baseIncome = 0, kw = 0, gbps = 0;
  for (const t of data.TIERS) {
    const all = (byTier[t.id] || 0) + (extra[t.id] || 0);
    if (!all) continue;
    const u = upgOf(t.id), m = dm ** u;
    kw += t.kw * m * all; gbps += t.gbps * m * all;
    baseIncome += t.inc * om ** u * ((counts.lit[t.id] || 0) + (extra[t.id] || 0));
  }

  const infraCount = id => int(run.infra[id]) + int(what?.infra?.[id]);
  const cap = { ...data.START_CAPACITY };
  let coolingDraw = 0, genset = 0;
  for (const u of data.INFRA) {
    const n = infraCount(u.id);
    if (!n) continue;
    cap[u.meter] += n * u.cap;
    if (u.meter === 'cooling') coolingDraw += n * (u.draw || 0);
    if (u.genset && u.meter === 'power') genset += n * u.cap;
  }
  const effs = new Set([...run.effUpgrades, ...(what?.eff || [])]);
  const effFactor = target => data.EFFICIENCY.reduce((f, e) => (effs.has(e.id) && e.effect.target === target ? f * e.effect.factor : f), 1);
  coolingDraw *= effFactor('coolingDraw');
  cap.cooling *= effFactor('coolingCap');

  let cp = 1, ch = 1, cn = 1, addMult = 0;
  const contracts = [];
  const activeList = [...run.contracts.active, ...(what?.contracts || []).map(id => ({ id, termLeft: null }))];
  for (const a of activeList) {
    const c = conById[a.id];
    if (!c) continue;
    cp *= c.power; ch *= c.heat; cn *= c.net;
    const slaOk = c.sla == null || run.uptime >= c.sla;
    if (slaOk) addMult += c.mult - 1;
    contracts.push({ id: c.id, slaOk, termLeft: a.termLeft, mult: c.mult, sla: c.sla });
  }
  const contractMult = 1 + addMult;

  const ev = eventFactors(run.event, data);
  const demand = {
    power: (kw * cp + coolingDraw) * ev.dem.power,
    cooling: kw * ch * effFactor('heat') * ev.dem.cooling,
    network: gbps * cn * effFactor('net') * ev.dem.network,
  };
  const out = {};
  const rawCap = { power: nonneg(cap.power), cooling: nonneg(cap.cooling), network: nonneg(cap.network) }; // before event factors
  let minRatio = 1, anyRed = false, worst = 'power', worstU = -1;
  for (const m of METERS) {
    const c = nonneg(cap[m] * ev.cap[m]), d = nonneg(demand[m]);
    const u = c > 0 ? d / c : 0;
    const ratio = u > 0 ? 1 / u : Infinity;
    minRatio = Math.min(minRatio, ratio);
    if (u > data.METER.red) anyRed = true;
    if (u > worstU) { worstU = u; worst = m; }
    out[m] = { cap: c, demand: d, u: fin(u), ratio, colour: colourOf(u, data), headroom: u < data.METER.amber };
  }
  const efficiency = fin(Math.min(minRatio, 1) ** data.EFFICIENCY_EXP, 1);
  const uptimeMult = uptimeMultOf(run.uptime, data);
  const stack = (1 + data.EXIT.sharePer * int(account.shares)) * data.GLOBALS[0].mult ** int(run.globals) * (1 + data.MILESTONE_BONUS * account.milestones.length);
  const nominal = nonneg(baseIncome * contractMult * uptimeMult * stack * ev.income);
  const income = ev.blackout ? 0 : nonneg(nominal * efficiency);
  return {
    ...out, rawCap, efficiency, uptimeMult, contractMult, contracts, stack, baseIncome: nonneg(baseIncome), nominal, income,
    installed, byTier, darkRacks, full, counts, genset, coolingDraw: nonneg(coolingDraw), blackout: ev.blackout, eventIncome: ev.income,
    slots: counts.slots, anyRed, worst, worstU: nonneg(worstU),
  };
}

// §7 manual reroll: 30 s of income, floored so a dark hall or a blackout cannot fish for contracts for free. During a
// blackout (income 0, racks lit) the nominal income is what 30 s would have earned.
export function rerollCost(data, d) {
  const rules = data.CONTRACT_RULES;
  const inc = d.income > 0 ? d.income : d.nominal;
  return Math.max(rules.rerollCostSec * nonneg(inc), fin(rules.rerollMin, REROLL_MIN));
}

// ---------------------------------------------------------------------------------------------
// prices (§3-§6)

// Sum of n prices base·g^(from) … base·g^(from+n−1).
export function geomSum(base, g, from, n) {
  let s = 0, c = base * g ** from;
  for (let i = 0; i < n; i++) { s += c; c *= g; }
  return s;
}

// Largest n (≤ limit) whose geometric price sum fits in cash.
export function geomMax(base, g, from, cash, limit) {
  let n = 0, s = 0, c = base * g ** from;
  while (n < limit && s + c <= cash + 1e-9) { s += c; c *= g; n++; }
  return n;
}

// counts (from countServers / derived.counts) is optional: with it these are O(1), without it one walk each.
export const installedOf = (run, tierId, counts = null) => (counts ? counts.byTier[tierId] || 0 : run.racks.reduce((n, r) => n + r.servers.filter(id => id === tierId).length, 0));
export const installedAll = (run, counts = null) => (counts ? counts.installed : run.racks.reduce((n, r) => n + r.servers.filter(Boolean).length, 0));
export const freeSlots = (run, counts = null) => (counts ? counts.slots - counts.installed : run.racks.reduce((n, r) => n + r.servers.filter(id => !id).length, 0));

export const tierPrice = (data, tier, run, k = 0) => tier.base * tier.growth ** (int(run.bought[tier.id]) + k);
export const infraPrice = (data, unit, run, k = 0) => unit.base * unit.growth ** (int(run.infra[unit.id]) + k);
export const rackPrice = (data, run, k = 0) => {
  const st = data.STAGES[run.stage - 1];
  return st.rackBase * st.rackGrowth ** (run.racksBoughtThisStage + k);
};
export const upgradePrice = (data, tier, level) => tier.base * data.UPGRADES.costMult[level];

// §3: a tier shows (greyed) once its stage is unlocked and max(run valuation, cash) ≥ 25% of base. The reveal is
// sticky for the run (run.seenTiers, kept by revealTiers) and anything already bought stays listed, so the three
// opening Pizza Boxes dropping cash to $1.78 never make the Blade and Pizza Box rows blink out of the Build tab.
export function tierVisible(data, tier, run) {
  if (tier.stage > run.stage) return false;
  if (int(run.bought[tier.id]) > 0 || (Array.isArray(run.seenTiers) && run.seenTiers.includes(tier.id))) return true;
  return Math.max(run.valuation, run.cash) >= data.TIER_VISIBLE_FRAC * tier.base;
}
export function revealTiers(data, run) {
  if (!Array.isArray(run.seenTiers)) run.seenTiers = [];
  for (const t of data.TIERS) if (!run.seenTiers.includes(t.id) && tierVisible(data, t, run)) run.seenTiers.push(t.id);
}
export const plural = (name, n) => (n === 1 ? name : /(x|s|ch|sh)$/.test(name) ? `${name}es` : `${name}s`);
// §3 "Blade additionally needs 6 Pizza Boxes": the run-lifetime count or the racked count, whichever is higher, so a
// garage refreshed to blades (boxes gone, bought stays) keeps the Blade row open in the Colo.
export function tierLocked(data, tier, run, counts = null) {
  if (!tier.needBoxes) return null;
  const box = data.TIERS[0];
  const have = Math.max(int(run.bought[box.id]), installedOf(run, box.id, counts));
  return have < tier.needBoxes ? `Needs ${tier.needBoxes} ${plural(box.name, tier.needBoxes)}` : null;
}

export const allFootprintsBought = (data, run) => run.racks.length >= data.STAGES[run.stage - 1].footprints.length;
export const allRacksFull = run => run.racks.length > 0 && run.racks.every(r => r.servers.every(Boolean));
export const refreshAvailable = (data, run) => allFootprintsBought(data, run) && allRacksFull(run);

// ---------------------------------------------------------------------------------------------
// §10 prestige helpers

export const sharesFor = (valuation, data) => (valuation >= data.EXIT.minValuation ? Math.floor(Math.cbrt(valuation / 1e6) + 1e-9) : 0);
export const exitGlows = (current, gained, data) => current + gained >= Math.max(data.EXIT.glowMin, data.EXIT.glowFactor * current);

// Highest start perk whose share threshold is met (they do not stack), or null for a plain garage start.
export function startPerk(data, shares) {
  let p = null;
  for (const perk of data.PERKS) if (perk.stage && shares >= perk.shares) p = perk;
  return p;
}

// "A run this size takes about N minutes from scratch": log-linear interpolation of EXIT.runMinutes.
export function estMinutes(valuation, data) {
  const tbl = data.EXIT.runMinutes;
  if (!(valuation > 0)) return tbl[0][1];
  const x = Math.log10(valuation);
  if (x <= Math.log10(tbl[0][0])) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    const [v0, m0] = tbl[i - 1], [v1, m1] = tbl[i];
    if (valuation <= v1) {
      const t = (x - Math.log10(v0)) / (Math.log10(v1) - Math.log10(v0));
      return Math.round(m0 + (m1 - m0) * t);
    }
  }
  return tbl[tbl.length - 1][1];
}

// §11 offline earnings for `elapsedS` seconds away at `income` $/s.
export function offlineEarn(income, elapsedS, data, perkOffline = null) {
  const o = { ...data.OFFLINE, ...(perkOffline || {}) };
  const e = Math.min(nonneg(elapsedS), o.capH * 3600);
  const full = o.fullRateH * 3600;
  return nonneg(income) * (o.fullRate * Math.min(e, full) + o.tailRate * Math.max(0, e - full));
}
