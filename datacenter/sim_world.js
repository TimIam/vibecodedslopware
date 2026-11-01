// sim_world.js — the systems that act on the run each tick: contracts (§7), incidents and events (§8), milestones (§9).
// Every function takes ctx = { state, data, rng, emit, derived(), recompute(), credit(n), spend(n), toast(text, kind) }
// from sim.js. No time or storage access here; `runTime` is the clock.

import { pick } from './util.js';
import { METERS, allFootprintsBought, allRacksFull, installedOf, rerollCost, int, nonneg } from './sim_core.js';

const rand = (rng, lo, hi) => lo + rng() * (hi - lo);

// ---------------------------------------------------------------------------------------------
// contracts (§7)

function eligibleContracts(ctx) {
  const { run } = ctx.state;
  const active = new Set(run.contracts.active.map(a => a.id));
  return ctx.data.CONTRACTS.filter(c => c.stage <= run.stage && !active.has(c.id)
    && (!c.needs || installedOf(run, c.needs.tier) >= c.needs.n));
}

// Fill the board to three distinct offers. The §7 rule: at least one offer stresses a meter with headroom (u < 0.80)
// whenever such a contract exists, so "which bottleneck would you rather have" is a real choice.
export function fillBoard(ctx) {
  const { run } = ctx.state;
  const { board } = run.contracts;
  const d = ctx.derived();
  const headroom = METERS.filter(m => d[m].headroom);
  const stresses = c => c.stresses.some(m => headroom.includes(m));
  const byId = Object.fromEntries(ctx.data.CONTRACTS.map(c => [c.id, c]));
  let changed = false;
  while (board.length < ctx.data.CONTRACT_RULES.boardSize) {
    const pool = eligibleContracts(ctx).filter(c => !board.includes(c.id));
    if (!pool.length) break;
    const needStress = !board.some(id => byId[id] && stresses(byId[id]));
    const stressing = pool.filter(stresses);
    const c = pick(ctx.rng, needStress && stressing.length ? stressing : pool);
    board.push(c.id);
    changed = true;
  }
  return changed;
}

export function rollBoard(ctx) {
  const { run } = ctx.state;
  run.contracts.board = [];
  run.contracts.boardAge = 0;
  if (run.racks.length >= ctx.data.CONTRACT_RULES.unlockRack) fillBoard(ctx);
  emitContracts(ctx);
}

export function emitContracts(ctx) {
  const { contracts } = ctx.state.run;
  ctx.emit('contractChanged', { active: contracts.active.map(a => ({ ...a })), board: contracts.board.slice() });
}

export function pickContract(ctx, id) {
  const { run } = ctx.state;
  const c = ctx.data.CONTRACTS.find(x => x.id === id);
  if (!c) return { ok: false, reason: 'unknown' };
  if (!run.contracts.board.includes(id)) return { ok: false, reason: 'not_offered' };
  const slots = ctx.data.STAGES[run.stage - 1].slots;
  if (run.contracts.active.length >= slots) return { ok: false, reason: 'slots', text: `${slots} contract slot${slots > 1 ? 's' : ''} at this stage` };
  run.contracts.active.push({ id, termLeft: c.term });
  run.contracts.board = run.contracts.board.filter(x => x !== id);
  ctx.state.account.lifetime.contracts++;
  fillBoard(ctx);
  ctx.recompute();
  ctx.toast(`${c.name} signed. ${c.line}`, 'good');
  emitContracts(ctx);
  return { ok: true };
}

export function reroll(ctx, manual) {
  const { run } = ctx.state;
  if (run.racks.length < ctx.data.CONTRACT_RULES.unlockRack) return { ok: false, reason: 'locked', text: 'The board opens at Rack 2' };
  let cost = 0;
  if (manual) {
    cost = rerollCost(ctx.data, ctx.derived()); // floored: a dark hall cannot fish for a contract for free
    if (cost > run.cash + 1e-9) return { ok: false, reason: 'cash' };
    ctx.spend(cost);
  }
  rollBoard(ctx);
  return { ok: true, cost };
}

export function tickContracts(ctx, dt) {
  const { run } = ctx.state;
  const rules = ctx.data.CONTRACT_RULES;
  let changed = false;
  for (const a of run.contracts.active.slice()) {
    a.termLeft -= dt;
    if (a.termLeft > 0) continue;
    run.contracts.active = run.contracts.active.filter(x => x !== a);
    const c = ctx.data.CONTRACTS.find(x => x.id === a.id);
    ctx.toast(c?.expireToast ?? `Term up: ${c?.name ?? a.id}. No hard feelings.`, 'info');
    changed = true;
  }
  if (run.racks.length >= rules.unlockRack) {
    run.contracts.boardAge += dt;
    if (run.contracts.boardAge >= rules.rerollEvery) { rollBoard(ctx); changed = false; }
    else if (fillBoard(ctx)) changed = true;
  }
  if (changed) emitContracts(ctx);
}

// ---------------------------------------------------------------------------------------------
// incidents (§8)

const litRacks = run => run.racks.map((r, i) => i).filter(i => !run.racks[i].dark && !run.racks[i].incident && run.racks[i].servers.some(Boolean));
const outstanding = run => run.racks.filter(r => r.incident).length;

export function spawnIncident(ctx, force = false) {
  const { run } = ctx.state;
  const rules = ctx.data.INCIDENT_RULES;
  if (!force && outstanding(run) >= rules.maxOutstanding) return false;
  const lit = litRacks(run);
  if (!lit.length) return false;
  const rack = pick(ctx.rng, lit);
  const flavors = ctx.data.INCIDENTS.filter(f => f.stage.min <= run.stage && run.stage <= f.stage.max);
  const f = pick(ctx.rng, flavors.length ? flavors : ctx.data.INCIDENTS);
  const texts = f.lateTexts && run.stage >= 2 ? f.lateTexts : f.texts;
  const flavor = pick(ctx.rng, texts).replace(/\{rack\}/g, String(rack + 1));
  run.racks[rack].incident = { id: f.id, t0: run.runTime, flavor };
  run.lastIncidentAt = run.runTime;
  ctx.emit('incident', { rack, flavor, id: f.id, hardware: !!f.hardware });
  return true;
}

// frac: share of the full bounty (1 on a timely tap, 0.5 via the badge); late (dark) and auto fixes pay 0.
// player: whether a tap did it (only taps count toward "incidents fixed").
export function resolveIncident(ctx, rack, { frac = 1, player = true } = {}) {
  const { run, account } = ctx.state;
  const r = run.racks[rack];
  if (!r || !r.incident) return { ok: false, reason: 'no_incident' };
  const rules = ctx.data.INCIDENT_RULES;
  const onTime = !r.dark && run.runTime - r.incident.t0 <= rules.tapWindow + 1e-6;
  let bounty = 0;
  if (player && onTime) {
    bounty = Math.max(rules.bountyMin, rules.bountySec * ctx.derived().income) * frac;
    ctx.credit(bounty);
  }
  const wasDark = r.dark;
  r.incident = null;
  r.dark = false;
  if (run.badgeFocus === rack) run.badgeFocus = null;
  if (player) account.lifetime.incidents++;
  if (wasDark) ctx.emit('rackDark', { rack, dark: false });
  ctx.emit('incidentResolved', { rack, bounty, late: !onTime, auto: !player });
  return { ok: true, bounty, late: !onTime };
}

export function tickIncidents(ctx, dt) {
  const { run } = ctx.state;
  const rules = ctx.data.INCIDENT_RULES, staffRules = ctx.data.STAFF_RULES;
  const spares = run.mitigations.includes('mit_spares') ? ctx.data.MITIGATIONS.find(m => m.id === 'mit_spares') : null;
  const staffAuto = run.staff > 0 ? Math.max(staffRules.autoMin, staffRules.autoBase - staffRules.autoPer * run.staff) : Infinity;
  for (let i = 0; i < run.racks.length; i++) {
    const r = run.racks[i];
    if (!r.incident) continue;
    const def = ctx.data.INCIDENTS.find(f => f.id === r.incident.id);
    const auto = Math.min(staffAuto, spares && def?.hardware ? spares.hardwareResolveS : Infinity);
    const age = run.runTime - r.incident.t0;
    if (age >= auto) { resolveIncident(ctx, i, { frac: 0, player: false }); continue; }
    // 1e-6 of slack: 200 ticks of 0.1 s sum to a hair over 20.0
    if (!r.dark && age > rules.tapWindow + 1e-6) { r.dark = true; ctx.emit('rackDark', { rack: i, dark: true }); }
  }
  // the three incidents that follow the offline card (§11), one per tick once the card has counted up
  if (run.pendingIncidents > 0 && run.runTime >= run.pendingIncidentsAt) {
    if (spawnIncident(ctx, true)) run.pendingIncidents--; else run.pendingIncidents = 0;
  }
  if (run.runTime >= run.nextIncidentAt) {
    const ok = spawnIncident(ctx);
    // no lit rack free (or three outstanding): try again shortly rather than skipping a whole cadence slot
    run.nextIncidentAt = run.runTime + (ok ? rand(ctx.rng, rules.minGap, rules.maxGap) : 5);
  }
}

export const oldestIncident = run => {
  let best = null;
  run.racks.forEach((r, i) => { if (r.incident && (best === null || r.incident.t0 < run.racks[best].incident.t0)) best = i; });
  return best;
};

// ---------------------------------------------------------------------------------------------
// events (§8)

export function fireBreaker(ctx) {
  const { run, account } = ctx.state;
  const def = ctx.data.EVENTS.find(e => e.id === 'ev_breaker');
  account.flags.breakerSeen = true;
  run.event = { id: def.id, tLeft: def.duration, handled: false, bonus: false, taps: 0 };
  run.noRedSince = run.runTime;
  ctx.emit('breaker', {});
  ctx.emit('event', { id: def.id, on: true, text: def.text, duration: def.duration, bonus: false });
}

// Returns 'started' | 'defused' | false. force skips the mitigation checks (dev.fireEvent).
export function startEvent(ctx, id, force = false) {
  const { run } = ctx.state;
  const def = ctx.data.EVENTS.find(e => e.id === id);
  if (!def) return false;
  if (def.scripted) { fireBreaker(ctx); return 'started'; }
  if (run.event) return false;
  const d = ctx.derived();
  if (!force) {
    if (def.mitigation && run.mitigations.includes(def.mitigation)) {
      const mit = ctx.data.MITIGATIONS.find(m => m.id === def.mitigation);
      ctx.toast(`${def.name}. ${mit?.name ?? 'Mitigation'} held.`, 'event');
      return 'defused';
    }
    if (def.altMitigation && d.genset > 0 && d.genset >= def.altMitigation.gensetShare * d.power.cap) {
      run.uptime = Math.min(100, run.uptime + (def.altMitigation.uptimeBonus || 0));
      ctx.toast(`${def.name}. ${def.altMitigation.toast}`, 'event');
      return 'defused';
    }
  }
  const bonus = def.requires ? run.uptime >= def.requires.uptimeMin
    : def.headroomBonus ? !!(def.effect.meter && d[def.effect.meter].headroom) : false;
  run.event = { id, tLeft: def.duration, handled: false, bonus, taps: 0 };
  ctx.recompute();
  ctx.emit('event', { id, on: true, text: def.text, duration: def.duration, bonus });
  ctx.toast(def.text, 'event');
  return 'started';
}

// quiet: the run is being replaced (Exit, reset, import), so the scene and ui get their event{on:false} but no toast.
export function endEvent(ctx, { quiet = false } = {}) {
  const { run } = ctx.state;
  if (!run.event) return;
  const def = ctx.data.EVENTS.find(e => e.id === run.event.id);
  const id = run.event.id;
  run.event = null;
  ctx.recompute();
  ctx.emit('event', { id, on: false });
  // the breaker's line lands when the lights come back (§8)
  if (!quiet && def?.id === 'ev_breaker') ctx.toast(def.text, 'event');
}

export function tapScrub(ctx) {
  const { run } = ctx.state;
  const def = run.event ? ctx.data.EVENTS.find(e => e.id === run.event.id) : null;
  if (!def || !def.handScrub || run.event.handled) return { ok: false, reason: 'no_ddos' };
  run.event.taps = int(run.event.taps) + 1;
  if (run.event.taps >= def.handScrub.taps) {
    ctx.toast('Scrubbed by hand. The packets have been asked to leave.', 'good');
    endEvent(ctx);
    return { ok: true, taps: def.handScrub.taps, done: true };
  }
  return { ok: true, taps: run.event.taps, done: false };
}

export function tickEvents(ctx, dt) {
  const { run } = ctx.state;
  const rules = ctx.data.EVENT_RULES;
  if (run.event) {
    run.event.tLeft -= dt;
    if (run.event.tLeft <= 0) endEvent(ctx);
  }
  if (run.stage < rules.minStage) return;
  if (run.nextEventAt == null) { run.nextEventAt = run.runTime + rand(ctx.rng, rules.minGap, rules.maxGap); return; }
  if (run.event || run.runTime < run.nextEventAt) return;
  const pool = ctx.data.EVENTS.filter(e => !e.scripted);
  startEvent(ctx, pick(ctx.rng, pool).id);
  run.nextEventAt = run.runTime + rand(ctx.rng, rules.minGap, rules.maxGap);
}

// ---------------------------------------------------------------------------------------------
// milestones (§9)

export function condMet(cond, ctx, d) {
  const { run, account } = ctx.state;
  switch (cond.type) {
    case 'servers': return d.installed >= cond.n;
    case 'tier': return (d.byTier[cond.id] || 0) >= cond.n;
    case 'incidents': return account.lifetime.incidents >= cond.n;
    case 'contracts': return account.lifetime.contracts >= cond.n;
    case 'valuation': return run.valuation >= cond.n;
    case 'stage': return run.stage >= cond.n;
    case 'racks': return run.racks.length >= cond.n;
    case 'rackFull': return !!run.racks[cond.rack] && run.racks[cond.rack].servers.every(Boolean);
    case 'allRacksFull': return run.stage === cond.stage && allFootprintsBought(ctx.data, run) && allRacksFull(run);
    case 'noRedFor': return run.runTime - run.noRedSince >= cond.s;
    case 'uptimeFor': return run.runTime - nonneg(run.uptimeBelow[String(cond.min)]) >= cond.s;
    case 'infra': return int(run.infra[cond.id]) >= cond.n;
    case 'exits': return account.lifetime.exits >= cond.n;
    case 'staff': return run.staff >= cond.n;
    case 'meterAmber': return !!run.amberSeen[cond.meter];
    case 'breaker': return account.flags.breakerSeen && !(run.event && run.event.id === 'ev_breaker');
    case 'refresh': return run.refreshes >= 1;
    case 'power': return d.rawCap.power >= cond.kw;
    default: return false;
  }
}

// A milestone the current run can still earn (goal cards skip the rest: the breaker in a Colo start, a stage already left).
// The breaker only fires while the run is still in the garage (sim.js tick), so once a garage start leaves without
// tripping it the card drops out instead of pointing at a wall outlet the Colo does not have; breakerSeen keeps it
// through the 5 s blackout, where the flag is set but the milestone is not yet earned.
export function reachable(ms, ctx) {
  const { run, account } = ctx.state;
  const c = ms.cond;
  if (c.type === 'breaker') return account.flags.breakerSeen || (run.startStage === 1 && run.stage === 1);
  if (c.type === 'allRacksFull') return c.stage >= run.stage;
  if (c.type === 'rackFull') return c.rack < ctx.data.STAGES[run.stage - 1].footprints.length;
  return true;
}

export function checkMilestones(ctx) {
  const { account } = ctx.state;
  const earned = new Set(account.milestones);
  const d = ctx.derived();
  let any = false;
  for (const ms of ctx.data.MILESTONES) {
    if (earned.has(ms.id) || !reachable(ms, ctx) || !condMet(ms.cond, ctx, d)) continue;
    account.milestones.push(ms.id);
    earned.add(ms.id);
    any = true;
    ctx.emit('milestone', { id: ms.id, name: ms.name, text: ms.text, ticker: ms.ticker, fx: ms.fx ?? null, screenshot: !!ms.screenshot, softEnding: !!ms.softEnding });
  }
  if (any) ctx.recompute();
  return any;
}

// §9 three cards, short / mid / long: the next unearned milestone in list order; the next beat after it in list order (a
// valuation, stage, hall-full or megawatt milestone under the Exit line); the nearest Exit-line milestone (valuation
// ≥ $1M or an Exit count), ranked by the valuation it takes, so the ladder reads $1M, $10M, First Exit, 3 Exits, $1T,
// the soft ending, 10 Exits rather than the list's tail order. A slot its class cannot fill, and every slot past three,
// takes the remaining milestones in list order. A fresh garage reads Lights On / $1,000 / Make Me a Million; a Colo
// start Hire Dale / $100,000 / Make Me a Million (§10).
const MID_TYPES = new Set(['valuation', 'stage', 'allRacksFull', 'power']);
export function goals(ctx, n = 3) {
  const earned = new Set(ctx.state.account.milestones);
  const E = ctx.data.EXIT;
  const open = ctx.data.MILESTONES.filter(ms => !earned.has(ms.id) && reachable(ms, ctx));
  const isLong = ms => ms.cond.type === 'exits' || (ms.cond.type === 'valuation' && ms.cond.n >= E.minValuation);
  const isMid = ms => MID_TYPES.has(ms.cond.type) && !isLong(ms);
  // §10 glow rule: the first Exit worth taking is glowMin shares (minValuation · glowMin³), every later one glowFactor×
  // the shares, so glowFactor³× the valuation
  const longAt = ms => (ms.cond.type === 'valuation' ? ms.cond.n : E.minValuation * E.glowMin ** 3 * (E.glowFactor ** 3) ** (ms.cond.n - 1));
  const out = [];
  if (n >= 1 && open.length) out.push(open[0]);
  if (n >= 2) { const mid = open.find(ms => !out.includes(ms) && isMid(ms)); if (mid) out.push(mid); }
  if (n >= 3) { const long = open.filter(ms => !out.includes(ms) && isLong(ms)).sort((a, b) => longAt(a) - longAt(b))[0]; if (long) out.push(long); }
  for (const ms of open) { if (out.length >= n) break; if (!out.includes(ms)) out.push(ms); }
  return out.slice(0, n);
}
