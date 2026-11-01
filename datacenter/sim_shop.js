// sim_shop.js — what the Build / Infra / Contracts / Upgrades / Exit tabs render, plus the price helpers behind buy():
// describe(id) is the one place that knows what an id is, what it costs for k more, how many can be bought and why
// a row is locked. shopRows() turns that into plain row objects the ui can render directly (§17).

import { fmtMoney } from './util.js';
import * as C from './sim_core.js';

const { METERS, int } = C;

// Every purchasable id → { kind, def, name, flavor, owned, max, visible, locked, price(k), limit, what(n) } or null.
// price(k) is the price of the (k+1)-th unit from here; limit is how many more could ever be bought right now;
// what(n) is the derived what-if overlay for buying n (for the overdraw warning and +$/s). counts (derived.counts or
// C.countServers) is optional: shopRows passes it so 40 rows do not each walk the racks.
export function describe(ctx, id, counts = null) {
  const { data } = ctx;
  const { run } = ctx.state;
  const stage = data.STAGES[run.stage - 1];
  const stageName = n => data.STAGES[n - 1]?.short ?? `stage ${n}`;
  const inf = Infinity;
  const cnt = counts ?? C.countServers(run, data);

  const tier = data.TIERS.find(t => t.id === id);
  if (tier) {
    const owned = C.installedOf(run, id, cnt);
    return {
      kind: 'tier', def: tier, name: tier.name, flavor: tier.flavor, owned, max: inf,
      visible: C.tierVisible(data, tier, run), locked: C.tierLocked(data, tier, run, cnt),
      price: k => C.tierPrice(data, tier, run, k), limit: C.freeSlots(run, cnt), fullReason: fullTierReason(data, run),
      what: n => ({ servers: [{ id, n }] }),
    };
  }
  const unit = data.INFRA.find(u => u.id === id);
  if (unit) {
    const owned = int(run.infra[id]);
    const max = unit.max ?? inf;
    let locked = null;
    if (unit.needsTier && C.installedOf(run, unit.needsTier, cnt) < 1) locked = `Needs a ${data.TIERS.find(t => t.id === unit.needsTier)?.name ?? unit.needsTier}`;
    else if (owned >= max) locked = 'Maxed';
    return {
      kind: 'infra', def: unit, name: unit.name, flavor: unit.flavor, owned, max, meter: unit.meter,
      visible: unit.stage <= run.stage, locked, price: k => C.infraPrice(data, unit, run, k), limit: Math.max(0, max - owned),
      what: n => ({ infra: { [id]: n } }),
    };
  }
  if (id === 'rack') {
    const total = stage.footprints.length;
    return {
      kind: 'rack', def: stage, name: 'Rack', flavor: run.stage === 1 ? 'Craigslist. Has character.' : 'Another footprint. Another hum.',
      owned: run.racks.length, max: total, visible: run.racks.length < total, locked: null,
      price: k => C.rackPrice(data, run, k), limit: Math.max(0, total - run.racks.length), fullReason: 'Every footprint is bought',
      what: () => null,
    };
  }
  if (id === 'move') {
    const next = data.STAGES[run.stage];
    if (!next) return { kind: 'move', def: null, name: 'Move', flavor: '', owned: 0, max: 0, visible: false, locked: 'This is the last hall', price: () => inf, limit: 0, what: () => null };
    return {
      kind: 'move', def: next, name: run.stage === 1 ? `Lease the ${next.short}` : `Move to the ${next.short}`, flavor: next.name,
      owned: 0, max: 1, visible: true, locked: C.allFootprintsBought(data, run) ? null : 'Buy every footprint first',
      price: () => next.move, limit: 1, what: () => null,
    };
  }
  if (id === 'global') {
    const g = data.GLOBALS[run.globals];
    if (!g) return { kind: 'global', def: null, name: 'Global', flavor: '', owned: run.globals, max: data.GLOBALS.length, visible: false, locked: 'Maxed', price: () => inf, limit: 0, what: () => null };
    return {
      kind: 'global', def: g, name: g.name, flavor: g.flavor ?? `×${g.mult} income. Every server, every contract.`,
      owned: run.globals, max: data.GLOBALS.length, visible: true,
      locked: run.valuation >= g.threshold ? null : `Needs ${fmtMoney(g.threshold)} valuation`,
      price: () => g.cost, limit: 1, what: () => ({ globals: 1 }),
    };
  }
  if (id.startsWith('upg:')) {
    const t = data.TIERS.find(x => x.id === id.slice(4));
    if (!t) return null;
    const level = int(run.upgrades[t.id]);
    const maxLevel = data.UPGRADES.thresholds.length;
    const owned = C.installedOf(run, t.id, cnt);
    const threshold = data.UPGRADES.thresholds[level];
    return {
      kind: 'upgrade', def: t, name: data.UPGRADES.names[t.id], flavor: `×${data.UPGRADES.outputMult ?? 2} ${t.name} output. Draw ×${data.UPGRADES.drawMult}: overclocked, runs hot.`,
      owned: level, max: maxLevel, tier: t.id, level,
      visible: level < maxLevel && C.tierVisible(data, t, run) && (owned > 0 || int(run.bought[t.id]) > 0),
      locked: level >= maxLevel ? 'Maxed' : owned >= threshold ? null : `Needs ${threshold} ${C.plural(t.name, threshold)}`,
      price: () => (level < maxLevel ? C.upgradePrice(data, t, level) : inf), limit: level < maxLevel ? 1 : 0,
      what: () => ({ upgrades: { [t.id]: 1 } }),
    };
  }
  const eff = data.EFFICIENCY.find(e => e.id === id);
  if (eff) {
    const owned = run.effUpgrades.includes(id) ? 1 : 0;
    return {
      kind: 'eff', def: eff, name: eff.name, flavor: eff.flavor, owned, max: 1, visible: eff.stage <= run.stage,
      locked: owned ? 'Owned' : null, price: () => eff.cost, limit: 1 - owned, what: () => ({ eff: [id] }),
    };
  }
  const mit = data.MITIGATIONS.find(m => m.id === id);
  if (mit) {
    const owned = run.mitigations.includes(id) ? 1 : 0;
    return {
      kind: 'mit', def: mit, name: mit.name, flavor: mit.flavor, owned, max: 1, visible: mit.stage <= run.stage,
      locked: owned ? 'Owned' : null, price: () => mit.cost, limit: 1 - owned, what: () => null,
    };
  }
  if (id === 'staff') {
    const next = data.STAFF[run.staff];
    const first = data.STAFF[0];
    if (!next) return { kind: 'staff', def: null, name: 'Staff', flavor: 'Fully staffed.', owned: run.staff, max: data.STAFF_RULES.max, visible: first.stage <= run.stage, locked: 'Maxed', price: () => inf, limit: 0, what: () => null };
    return {
      kind: 'staff', def: next, name: next.name, flavor: next.flavor, owned: run.staff, max: data.STAFF_RULES.max,
      visible: first.stage <= run.stage, locked: next.stage <= run.stage ? null : `Unlocks in the ${stageName(next.stage)}`,
      price: () => next.cost, limit: 1, what: () => null,
    };
  }
  return null;
}

// Why a server row is full, pointing at a row that is actually in the list: the Rack row hides once every footprint is
// bought, so a full hall is told to lease/move (the Build tab's own next step); the last hall can only Refresh.
function fullTierReason(data, run) {
  if (!C.allFootprintsBought(data, run)) return 'No empty slot. Buy a rack.';
  const next = data.STAGES[run.stage];
  if (next) return `No empty slot. ${run.stage === 1 ? 'Lease' : 'Move to'} the ${next.short}.`;
  return C.refreshAvailable(data, run) ? 'No empty slot. Refresh a rack.' : 'No empty slot.';
}

export function sumPrice(d, n) {
  let s = 0;
  for (let k = 0; k < n; k++) s += d.price(k);
  return s;
}

// Largest count purchasable now: limited by slots / caps and by cash.
export function maxAffordable(ctx, id, counts = null) {
  const d = describe(ctx, id, counts);
  if (!d || !d.visible || d.locked) return 0;
  const cash = ctx.state.run.cash;
  let n = 0, s = 0;
  while (n < d.limit && n < 100000) {
    const p = d.price(n);
    if (s + p > cash + 1e-9) break;
    s += p; n++;
  }
  return n;
}

// cost(id, qty): the price of qty more (Infinity when that many cannot be bought); 'max' prices what maxAffordable
// would buy, or one unit when nothing is affordable (so the greyed button still shows a number).
export function costOf(ctx, id, qty = 1, counts = null) {
  const d = describe(ctx, id, counts);
  if (!d) return Infinity;
  if (qty === 'max') { const n = maxAffordable(ctx, id, counts); return sumPrice(d, Math.max(1, n)); }
  const n = int(qty);
  if (n < 1 || n > d.limit) return n < 1 ? 0 : Infinity;
  return sumPrice(d, n);
}

// ---------------------------------------------------------------------------------------------
// rows

// The meter a what-if would push past red AND make worse, read off its already-computed derived (one computeDerived
// per row). With network already at 149% a Box Fan leaves it at 149%: the fan keeps its green glow and the Fiber
// Uplink is the amber-free fix that stands out.
function overdrawOf(ctx, after, base) {
  if (!after) return null;
  const red = ctx.data.METER.red;
  for (const m of METERS) {
    if (after[m].u > Math.max(red, (base?.[m]?.u ?? 0) + 1e-6)) return { meter: m, demand: after[m].demand, cap: after[m].cap, u: after[m].u };
  }
  return null;
}

// What-if derived for a purchase, started from the base derived's rack counts (no second walk of the hall).
const whatIf = (ctx, base, what) => C.computeDerived(ctx.state, ctx.data, what, base);

// { real, nominal }: what the purchase adds to income now (after efficiency, so an overdraw shows its true gain)
// and before efficiency (the "+$0.10/s" that floats up).
function incomeDelta(ctx, base, what, after) {
  if (!what) return { real: 0, nominal: 0 };
  if (what.globals) { const k = ctx.data.GLOBALS[0].mult - 1; return { real: base.income * k, nominal: base.nominal * k }; }
  after = after ?? whatIf(ctx, base, what);
  return { real: after.income - base.income, nominal: after.nominal - base.nominal };
}

function row(ctx, id, qty, base) {
  const counts = base.counts;
  const d = describe(ctx, id, counts);
  if (!d) return null;
  const { run } = ctx.state;
  let n = qty === 'max' ? maxAffordable(ctx, id, counts) : Math.min(Math.max(1, int(qty, 1)), Math.max(1, d.limit));
  if (qty === 'max' && n === 0) n = 1;
  const cost = d.visible && !d.locked && d.limit > 0 ? sumPrice(d, n) : (d.limit > 0 ? sumPrice(d, 1) : d.price(0));
  const purchasable = d.visible && !d.locked && d.limit > 0;
  const full = d.visible && !d.locked && d.limit <= 0; // out of slots / footprints, not gated: the greyed row keeps its numbers
  const what = purchasable || full ? d.what(n) : null;
  const after = what && !what.globals ? whatIf(ctx, base, what) : null;
  const delta = what ? incomeDelta(ctx, base, what, after) : { real: 0, nominal: 0 };
  const r = {
    id, name: d.name, kind: d.kind, cost: Number.isFinite(cost) ? cost : 0, qty: n,
    affordable: purchasable && cost <= run.cash + 1e-9, visible: d.visible,
    locked: d.locked ?? (full ? d.fullReason ?? 'Maxed' : null), full,
    overdraw: overdrawOf(ctx, after, base),
    addIncome: delta.real, addNominal: delta.nominal,
    addKw: 0, addGbps: 0, addDraw: 0, meter: d.meter ?? null,
    owned: d.owned, max: Number.isFinite(d.max) ? d.max : null,
    cheapestFor: null, bestValueFor: null, flavor: d.flavor ?? '', badge: null,
  };
  if (d.kind === 'infra') {
    if (d.meter === 'network') r.addGbps = d.def.cap * n; else r.addKw = d.def.cap * n;
    r.addDraw = (d.def.draw || 0) * n;
    r.badge = d.owned > 0 ? `×${d.owned}` : null;
  } else if (after) {
    r.addKw = after.power.demand - base.power.demand;
    r.addGbps = after.network.demand - base.network.demand;
  }
  if (d.kind === 'tier') r.badge = d.owned > 0 ? `×${d.owned}` : null;
  if (d.kind === 'upgrade') { r.badge = `Lv ${d.level}/${d.max}`; r.tier = d.tier; r.level = d.level; }
  if (d.kind === 'rack') r.badge = `${d.owned}/${d.max}`;
  if (d.kind === 'global') r.badge = `#${d.owned + 1}`;
  if (d.kind === 'staff') r.badge = `${d.owned}/${d.max}`;
  if ((d.kind === 'eff' || d.kind === 'mit') && d.owned) r.badge = 'Owned';
  return r;
}

export function shopRows(ctx, tab, qty = 1) {
  const { data } = ctx;
  const { run } = ctx.state;
  const base = ctx.derived();
  const rows = [];
  const add = id => { const r = row(ctx, id, qty, base); if (r) rows.push(r); };
  switch (tab) {
    case 'build':
      for (const t of data.TIERS) add(t.id);
      add('rack');
      add('move');
      break;
    case 'infra': {
      for (const u of data.INFRA) add(u.id);
      markFixes(ctx, rows);
      for (const m of data.MITIGATIONS) add(m.id);
      add('staff');
      break;
    }
    case 'upgrades':
      for (const t of data.TIERS) add(`upg:${t.id}`);
      add('global');
      for (const e of data.EFFICIENCY) add(e.id);
      break;
    case 'contracts': {
      const slots = data.STAGES[run.stage - 1].slots;
      const open = run.racks.length >= data.CONTRACT_RULES.unlockRack;
      const free = run.contracts.active.length < slots;
      for (const id of run.contracts.board) {
        const c = data.CONTRACTS.find(x => x.id === id);
        if (!c) continue;
        const what = { contracts: [id] };
        const after = whatIf(ctx, base, what);
        const delta = incomeDelta(ctx, base, what, after);
        rows.push({
          id, name: c.name, kind: 'contract', cost: 0, qty: 1, affordable: free, visible: true,
          locked: free ? null : `${slots} slot${slots > 1 ? 's' : ''} in use`, full: false,
          overdraw: overdrawOf(ctx, after, base), addIncome: delta.real, addNominal: delta.nominal, addKw: 0, addGbps: 0, addDraw: 0, meter: null,
          owned: 0, max: 1, cheapestFor: null, bestValueFor: null, flavor: c.line, badge: `×${c.mult}`,
          mult: c.mult, power: c.power, heat: c.heat, net: c.net, sla: c.sla, term: c.term, stresses: c.stresses.slice(),
        });
      }
      const rerollCost = C.rerollCost(data, base);
      rows.push({
        id: 'reroll', name: 'Reroll the board', kind: 'reroll', cost: rerollCost, qty: 1, affordable: open && rerollCost <= run.cash + 1e-9, visible: open,
        locked: open ? null : 'The board opens at Rack 2', full: false, overdraw: null, addIncome: 0, addNominal: 0, addKw: 0, addGbps: 0, addDraw: 0, meter: null,
        owned: 0, max: null, cheapestFor: null, bestValueFor: null, flavor: `${data.CONTRACT_RULES.rerollCostSec} s of income. Or wait: it rerolls every ${data.CONTRACT_RULES.rerollEvery / 60} min.`,
        badge: `${Math.max(0, Math.ceil(data.CONTRACT_RULES.rerollEvery - run.contracts.boardAge))}s`,
      });
      break;
    }
    case 'exit': {
      const p = exitPreview(ctx);
      rows.push({
        id: 'exit', name: 'Exit', kind: 'exit', cost: 0, qty: 1, affordable: p.available, visible: true,
        locked: p.available ? null : `Needs ${fmtMoney(data.EXIT.minValuation)} valuation`, full: false, overdraw: null,
        addIncome: 0, addNominal: 0, addKw: 0, addGbps: 0, addDraw: 0, meter: null,
        owned: p.shares, max: null, cheapestFor: null, bestValueFor: null,
        flavor: p.available && !p.glow ? data.EXIT.tooltipAt1M : `A run this size takes about ${p.estMinutes} minutes from scratch.`,
        badge: p.gained > 0 ? `+${p.gained}` : null, ...p,
      });
      break;
    }
    default: break;
  }
  return rows;
}

// Tapping a meter highlights its cheapest fix and its best-value fix (max capacity added / cost) among the infra rows.
function markFixes(ctx, rows) {
  for (const m of METERS) {
    const cands = rows.filter(r => r.kind === 'infra' && r.meter === m && r.visible && !r.locked);
    if (!cands.length) continue;
    const unit = r => ctx.data.INFRA.find(u => u.id === r.id);
    const price1 = r => C.infraPrice(ctx.data, unit(r), ctx.state.run, 0);
    let cheapest = cands[0], best = cands[0];
    for (const r of cands) {
      if (price1(r) < price1(cheapest)) cheapest = r;
      if (unit(r).cap / price1(r) > unit(best).cap / price1(best)) best = r;
    }
    cheapest.cheapestFor = m;
    best.bestValueFor = m;
  }
}

// Best-value available fix for one meter (the 300-share auto-buyer and the meter tap both want it).
export function bestFixFor(ctx, meter, counts = null) {
  let best = null, bestRate = 0;
  for (const u of ctx.data.INFRA) {
    if (u.meter !== meter) continue;
    const d = describe(ctx, u.id, counts);
    if (!d.visible || d.locked || d.limit <= 0) continue;
    const rate = u.cap / d.price(0);
    if (rate > bestRate) { bestRate = rate; best = u.id; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// §10 exit preview

export function exitPreview(ctx) {
  const { data } = ctx;
  const { run, account } = ctx.state;
  const shares = int(account.shares);
  const gained = C.sharesFor(run.valuation, data);
  const available = run.valuation >= data.EXIT.minValuation && gained >= 1;
  const newTotal = shares + gained;
  const glowAt = Math.max(data.EXIT.glowMin, data.EXIT.glowFactor * shares);
  const perksUnlocked = data.PERKS.filter(p => p.shares > shares && p.shares <= newTotal).map(p => ({ shares: p.shares, name: p.name, text: p.text }));
  return {
    available, glow: available && C.exitGlows(shares, gained, data), shares, gained, newTotal,
    newMult: 1 + data.EXIT.sharePer * newTotal, currentMult: 1 + data.EXIT.sharePer * shares,
    perksUnlocked, estMinutes: C.estMinutes(Math.max(run.valuation, data.EXIT.minValuation), data),
    valuation: run.valuation,
    glowAtShares: glowAt, glowAtValuation: Math.max(data.EXIT.minValuation, (glowAt - shares) ** 3 * 1e6),
  };
}
