// sim.js — the game simulation (DESIGN.md §2-§14). Owns `state`, runs a fixed 10 Hz step, recomputes `derived`
// every tick, emits the §14.4 events, answers the §14.5 actions and saves/loads/migrates the §14.7 blob.
//
//   import { createSim } from './sim.js';
//   const sim = createSim({ speed: 10 });
//   sim.on('cash', ({ cash, income }) => …);
//   requestAnimationFrame(function loop(t) { sim.update(performance.now()); requestAnimationFrame(loop); });
//
// Determinism: nothing in here calls Date.now() or Math.random(); time comes from now() and chance from rng, both
// injectable (the one exception is the per-tab save session id, which must differ between two tabs seeded alike and
// never touches gameplay; pass sessionId to pin it). Cash can never go negative or NaN (credit/spend guard every
// write; migrate() guards every read).
// stageChanged{from,to} means "rebuild the hall from sim.state": it follows a move, an Exit, a reset and an import,
// and the perk racks/gear of a new run are already in state when it fires (no rackAdded/infraAdded for them).
//
// Clocks: update(nowMs) runs on whatever clock the caller drives (main.js: performance.now()); now() is wall time
// (Date.now()). The save interval lives in the update() clock. account.savedAt is wall time and means "credited up to
// here": the last frame's wall time, or the last offline payment (load, resume). A save that lands after an unreported
// gap therefore keeps the gap payable, and update() pays any wall gap ≥ 60 s itself (system sleep with the tab in front).
//
// Saves and tabs: every save carries { id, at, gen } for the tab that wrote it. A tab that finds a newer session in
// storage stops saving and pauses ("open in another tab"); Exit / reset / import / claimSave() take the save back.

import * as DEFAULT_DATA from './data.js';
import { mulberry32, pick, fmtMoney, fmtPct, fmtDuration } from './util.js';
import * as C from './sim_core.js';
import * as W from './sim_world.js';
import * as S from './sim_shop.js';

const { METERS, fin, nonneg, int } = C;

const MAX_CATCHUP_MS = 2000;   // sim time one update() may advance (tab return, lag spike)
const OFFLINE_MIN_S = 60;      // shorter absences get no card and no earnings
const OFFLINE_ACK_FALLBACK_S = 90; // the return incidents wait for offlineAck() (the card's "Back to work") this long at most
const CORRUPT_KEY_SUFFIX = '_corrupt'; // an unreadable blob is parked under SAVE_KEY + this instead of being overwritten
const TOASTS = {
  saveFailed: 'Saving failed (storage full or blocked). Export your save from Settings.',
  saveBack: 'Saving works again.',
  superseded: 'This game is open in another tab. This tab is paused and no longer saves; close it, or reload to play here.',
  corrupt: 'The saved game could not be read. It was set aside and a fresh one started.',
  storageBlocked: 'This browser blocks site storage, so progress will not be kept between visits. Export your save from Settings.',
};

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}

// The page's localStorage, or null when there is none or the browser blocks site storage (Chrome "don't allow sites to
// save data", a sandboxed frame, Firefox dom.storage.enabled=false): there the property getter itself throws.
function siteStorage(key) {
  try {
    const s = globalThis.localStorage;
    if (s) { s.getItem(key); return s; }
  } catch { /* SecurityError: blocked */ }
  return null;
}

const toB64 = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]); return btoa(bin); };
const fromB64 = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).trim()), c => c.charCodeAt(0)));

let sessionSeq = 0;
function makeSessionId(nowMs) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? uuid.slice(0, 8) : `${(nowMs >>> 0).toString(36)}-${(++sessionSeq).toString(36)}`;
}
// Later generation wins; same generation → later start → id as the final tie-break. Never clock-dependent alone.
const newerSession = (a, b) => a.id !== b.id && (a.gen !== b.gen ? a.gen > b.gen : a.at !== b.at ? a.at > b.at : String(a.id) > String(b.id));

export function createSim({ data = DEFAULT_DATA, now = () => Date.now(), storage = null, rng = null, speed = 1, sessionId = null } = {}) {
  const realStorage = storage ?? siteStorage(data.SAVE_KEY);
  storage = realStorage ?? memoryStorage(); // blocked: the game runs on an in-memory store and says so once (below)
  const TICK_MS = 1000 / data.SIM_HZ, TICK_S = 1 / data.SIM_HZ;

  // ---- event bus -------------------------------------------------------------------------------
  const listeners = new Map();
  const on = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => off(name, fn); };
  const off = (name, fn) => { listeners.get(name)?.delete(fn); };
  const emit = (name, payload = {}) => {
    const set = listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); }
      catch (e) { setTimeout(() => { throw e; }, 0); } // a ui bug surfaces as a page error without killing the tick
    }
  };
  const toast = (text, kind = 'info') => emit('toast', { text, kind });

  // ---- state -------------------------------------------------------------------------------------
  let state = null, derived = null, offlineSummary = null, offlinePending = false;
  let lastWall = null;            // wall time the run is credited up to (see the header): save() stamps savedAt from it
  const pendingToasts = [];       // load-time messages, delivered on the first update() once listeners exist
  const session = { id: sessionId ?? makeSessionId(now()), at: now(), gen: 0 };
  const saveStatus = { failed: false, superseded: false, blocked: !realStorage, lastSavedAt: null, corruptSetAside: false, session };
  if (!realStorage) pendingToasts.push({ text: TOASTS.storageBlocked, kind: 'event' });
  const ctx = {
    get state() { return state; }, data, rng: null, emit, toast, now,
    derived: () => derived, recompute, credit, spend,
  };

  function recompute() {
    derived = C.computeDerived(state, data);
    C.revealTiers(data, state.run); // §3 reveal is sticky: a tier that has shown once stays in the Build tab
    return derived;
  }
  function credit(n) {
    n = nonneg(n);
    if (!n) return 0;
    state.run.cash = nonneg(state.run.cash + n);
    state.run.valuation = nonneg(state.run.valuation + n);
    state.account.lifetime.valuation = nonneg(state.account.lifetime.valuation + n);
    return n;
  }
  function spend(n) { state.run.cash = nonneg(state.run.cash - nonneg(n)); }

  function startRun() {
    const { account } = state;
    const perk = C.startPerk(data, account.shares);
    const run = C.freshRun(data, perk ? { stage: perk.stage, racks: perk.racks, cash: perk.cash } : {});
    const wired = data.PERKS.find(p => p.infra);
    if (wired && account.shares >= wired.shares) for (const id of wired.infra) run.infra[id] = 1;
    state.run = run;
    recompute();
    W.rollBoard(ctx);
    recompute();
  }

  function load() {
    let text = null, raw = null;
    try { text = storage.getItem(data.SAVE_KEY); } catch { text = null; }
    if (text) { try { raw = JSON.parse(text); } catch { raw = null; } }
    const migrated = raw ? C.migrate(raw, data, now()) : null;
    // this tab's save generation outranks whatever is stored, so an older tab's next autosave yields to it
    session.gen = int(raw?.account?.session?.gen) + 1;
    if (migrated) {
      state = migrated;
      // events do not run offline; a reload mid-event simply ends it (the breaker flag is already set)
      state.run.event = null;
      state.run.badgeFocus = null;
      recompute();
      applyOffline();
    } else {
      if (text) setAsideCorrupt(text);
      state = { v: 1, account: C.freshAccount(now()), run: null };
      startRun();
    }
    // the window up to now is paid (or there was none): stamp it in memory, so a resume() before the first autosave (a
    // tab that loaded hidden) pays only the time since, never this window again. The stored blob keeps its old stamp
    // until the first save, so a tab killed inside 5 s pays exactly once on the next load.
    creditedNow();
    recompute();
  }

  // Everything up to now is credited (paid or played): the point savedAt is measured from.
  function creditedNow() { lastWall = now(); state.account.savedAt = lastWall; }

  // A blob that parses as something other than a save (or not at all) is kept under a backup key rather than being
  // overwritten by the fresh account's first autosave; the player hears about it once the ui is listening.
  function setAsideCorrupt(text) {
    try { storage.setItem(data.SAVE_KEY + CORRUPT_KEY_SUFFIX, text); saveStatus.corruptSetAside = true; } catch { /* storage full or blocked */ }
    pendingToasts.push({ text: TOASTS.corrupt, kind: 'event' });
  }

  // §11: tapered earnings for the time away, 25% of them to valuation, a summary for the card, three incidents after it
  // (they wait for offlineAck(), the card's dismissal, so their 20 s windows do not run under the card).
  function applyOffline() {
    const { account, run } = state;
    const elapsed = C.saneEpoch(account.savedAt) ? (now() - account.savedAt) / 1000 : 0;
    if (!(elapsed >= OFFLINE_MIN_S)) return;
    // nothing earned (no lit server) means nothing to report: no "+$0.00" card, and the three return incidents
    // could not spawn anyway (they need a lit rack); the §12 opening is what a day-two untouched garage should see
    if (!(derived.income > 0)) return;
    const perk = data.PERKS.find(p => p.offline && account.shares >= p.shares)?.offline ?? null;
    const capped = Math.min(elapsed, (perk?.capH ?? data.OFFLINE.capH) * 3600);
    const d = derived;
    const earn = C.offlineEarn(d.income, elapsed, data, perk);
    run.cash = nonneg(run.cash + earn);
    const toVal = earn * data.OFFLINE.valuationFrac;
    run.valuation = nonneg(run.valuation + toVal);
    account.lifetime.valuation = nonneg(account.lifetime.valuation + toVal);
    // a card not yet shown (a tab that loaded hidden and was shown ≥ 60 s later) folds in: one card, the sum of both windows
    const prev = offlinePending ? offlineSummary : null;
    const sum = { elapsed: elapsed + (prev?.elapsed ?? 0), capped: capped + (prev?.capped ?? 0), earn: earn + (prev?.earn ?? 0), toValuation: toVal + (prev?.toValuation ?? 0) };
    const bottleneck = d.worstU > 0 ? { meter: d.worst, u: d.worstU } : null;
    const staffName = run.staff > 0 ? data.STAFF[0].name.split(',')[0] : null;
    const cap = METERS.map(m => m[0].toUpperCase() + m.slice(1));
    const text = `While you were away: +${fmtMoney(sum.earn)} in ${fmtDuration(sum.capped)}.`
      + (bottleneck ? ` Bottleneck while you were out: ${cap[METERS.indexOf(bottleneck.meter)]} (${fmtPct(bottleneck.u)}).` : '')
      + (staffName ? ` ${staffName} kept the lights on.` : '');
    offlineSummary = { ...sum, income: d.income, efficiency: d.efficiency, bottleneck, staff: run.staff, text };
    offlinePending = true;
    run.pendingIncidents = data.OFFLINE.returnIncidents;
    run.pendingIncidentsAt = run.runTime + OFFLINE_ACK_FALLBACK_S; // offlineAck() pulls this forward to "now"
    recompute();
  }

  // The ui calls this when the return card is dismissed: the three §11 incidents land on the next tick.
  function offlineAck() {
    const { run } = state;
    if (run.pendingIncidents > 0) run.pendingIncidentsAt = Math.min(run.pendingIncidentsAt, run.runTime);
    return { ok: true, pending: run.pendingIncidents };
  }

  // §11 for a tab that was hidden rather than closed (main.js: visibilitychange / pageshow). rAF was paused and the save
  // on hide stamped savedAt, so the time away is known: credit it the way a reload would (card, three incidents after
  // it) and restart the update() clock, so the next update() is a first frame (no 2 s catch-up on top, and the summary
  // goes out through the usual branch). Under 60 s away nothing happens; the save it writes means a second call
  // (pageshow after visibilitychange) credits nothing twice.
  // Like load(), a running event ends first (events do not run offline, §11 pays "at the saved income"): otherwise an
  // investor visit the tab was hidden on would pay ×3 for the whole credited window, and a blackout would pay $0.
  // Through the bus (not run.event = null) so the scene and ui drop their event flags.
  function resume() {
    if (saveStatus.superseded) return fail('superseded');
    const { account } = state;
    const elapsed = C.saneEpoch(account.savedAt) ? (now() - account.savedAt) / 1000 : 0;
    if (!(elapsed >= OFFLINE_MIN_S)) return { ok: true, offline: false, elapsed };
    endRunEvent();
    recompute();
    applyOffline();
    creditedNow();
    save();
    lastNow = null; accMs = 0;
    return { ok: true, offline: true, elapsed };
  }

  // "Play here" while the stored save is a newer tab's: play on from that progress instead of overwriting it with this
  // tab's stale copy (§14.7 "claims it back" is about the game, not this tab's state). Like load(): the time since that
  // save is paid as offline and the next update() is a first frame, so the card goes out the usual way.
  function adoptStored() {
    let raw = null;
    try { raw = JSON.parse(storage.getItem(data.SAVE_KEY)); } catch { raw = null; }
    const st = raw ? C.migrate(raw, data, now()) : null;
    if (!st) return false;
    const from = state.run.stage;
    endRunEvent();
    state = st;
    state.run.event = null;
    state.run.badgeFocus = null;
    recompute();
    applyOffline();
    creditedNow();
    W.checkMilestones(ctx);
    emit('stageChanged', { from, to: state.run.stage });
    W.emitContracts(ctx);
    refreshFlag();
    lastNow = null; accMs = 0;
    return true;
  }

  function claimSave() {
    const other = storedSession();
    const adopted = !!(other && newerSession(other, session) && adoptStored());
    const ok = save({ claim: true });
    return ok ? { ok, adopted } : fail(saveStatus.failed ? 'storage' : 'unknown');
  }

  // ---- save ---------------------------------------------------------------------------------------
  function storedSession() {
    try {
      const s = storage.getItem(data.SAVE_KEY);
      const sess = s ? JSON.parse(s)?.account?.session : null;
      return sess && typeof sess === 'object' ? { id: String(sess.id ?? ''), at: fin(sess.at), gen: int(sess.gen) } : null;
    } catch { return null; }
  }

  function setSuperseded(on) {
    if (saveStatus.superseded === on) return;
    saveStatus.superseded = on;
    if (on) toast(TOASTS.superseded, 'event');
  }

  // claim: a deliberate act in this tab (Exit, reset, import, claimSave) takes the save back from a newer tab.
  // Returns false when nothing was written: storage threw (toasted once, retried every interval) or a newer tab owns it.
  function save({ claim = false } = {}) {
    const other = storedSession();
    if (claim) {
      session.gen = Math.max(session.gen, int(other?.gen) + 1);
      session.at = now();
      setSuperseded(false);
    } else if (saveStatus.superseded) return false;
    else if (other && newerSession(other, session)) { setSuperseded(true); return false; }
    // credited-up-to, not the write time: a save that lands after an unreported gap (a lock whose hidden event only
    // fires at wake) keeps that gap payable by the resume() that follows
    state.account.savedAt = lastWall ?? now();
    state.account.session = { ...session };
    try {
      storage.setItem(data.SAVE_KEY, JSON.stringify(state));
    } catch {
      if (!saveStatus.failed) { saveStatus.failed = true; toast(TOASTS.saveFailed, 'event'); }
      return false;
    }
    saveStatus.lastSavedAt = now();
    if (saveStatus.failed) { saveStatus.failed = false; toast(TOASTS.saveBack, 'good'); }
    return true;
  }

  load();
  ctx.rng = rng ?? mulberry32(state.account.seed);
  // §18 the ticker draws from its own stream: the ui asks for a line whenever the last one scrolls off (frame rate, width,
  // reduced motion), so sharing ctx.rng would let browser timing move incidents and break a ?seed replay
  const tickerRng = mulberry32(state.account.seed ^ 0x9e3779b9);

  // ---- update loop ------------------------------------------------------------------------------
  let speedMul = Math.max(0, fin(speed, 1)), lastNow = null, accMs = 0, lastSaveAt = null, lastRefreshAvail = null;
  const uptimeMins = [...new Set(data.MILESTONES.filter(m => m.cond.type === 'uptimeFor').map(m => m.cond.min))];

  function update(nowMs) {
    nowMs = fin(nowMs, now());
    // §11 a wall-clock gap the tab never reported as hidden (system sleep with the tab in front; a lock whose hidden event
    // only fires at wake): pay it as resume() does instead of swallowing it in the 2 s catch-up and letting the autosave
    // stamp over it. resume() restarts the update() clock, so the next frame is a first frame (card, no catch-up).
    const wall = now();
    if (lastWall != null && wall - lastWall >= OFFLINE_MIN_S * 1000 && resume().offline) return;
    lastWall = wall;
    if (lastNow == null) {
      lastNow = nowMs; lastSaveAt = nowMs;
      while (pendingToasts.length) { const t = pendingToasts.shift(); toast(t.text, t.kind); }
      if (offlinePending) { offlinePending = false; emit('offline', { summary: offlineSummary }); }
      refreshFlag();
      emitMeters();
      return;
    }
    const dtMs = Math.max(0, nowMs - lastNow);
    lastNow = nowMs;
    if (saveStatus.superseded) { accMs = 0; emitMeters(); return; } // another tab owns the save: this one holds still
    accMs = Math.min(accMs + dtMs * speedMul, MAX_CATCHUP_MS);
    while (accMs >= TICK_MS - 1e-6) { accMs -= TICK_MS; tick(TICK_S); }
    // the interval runs on the update() clock; save() stamps savedAt from now() itself
    if (nowMs - lastSaveAt >= data.OFFLINE.saveEveryS * 1000) { lastSaveAt = nowMs; save(); }
  }

  function tick(dt) {
    const { run, account } = state;
    run.runTime = Math.round((run.runTime + dt) * 1000) / 1000; // ms precision: 0.1 s steps never drift
    recompute();
    // §8 the breaker: the first garage tick with powerDemand > powerCapacity, once per account, garage starts only
    if (run.stage === 1 && run.startStage === 1 && !account.flags.breakerSeen && !run.event && derived.power.demand > derived.power.cap) {
      W.fireBreaker(ctx);
      recompute();
    }
    credit(derived.income * dt);
    tickUptime(dt);
    W.tickContracts(ctx, dt);
    W.tickIncidents(ctx, dt);
    W.tickEvents(ctx, dt);
    autoBuyer();
    W.checkMilestones(ctx);
    // uptime (and anything the systems above changed) moved after the recompute at the top: refresh so the derived
    // values the ui reads for the rest of the frame match the state (a stale uptimeMult made every shop row show a
    // phantom "+$0.00/s" while uptime was recovering)
    recompute();
    refreshFlag();
    emitMeters();
  }

  // §2 uptime: falls (1 − efficiency)/s while any meter is red, 0.25/s per dark rack (max 1/s) with no recovery
  // while any rack is dark, otherwise recovers 1/s. Both falls add when both apply.
  function tickUptime(dt) {
    const { run } = state;
    const U = data.UPTIME;
    let fall = 0;
    if (derived.anyRed) { fall += (1 - derived.efficiency) * U.fallK; run.noRedSince = run.runTime; }
    if (derived.darkRacks > 0) fall += Math.min(U.darkFallMax, U.darkFall * derived.darkRacks);
    run.uptime = fall > 0 ? Math.max(0, run.uptime - fall * dt) : Math.min(100, run.uptime + U.recover * dt);
    run.uptime = fin(run.uptime, 100);
    for (const min of uptimeMins) if (run.uptime < min) run.uptimeBelow[String(min)] = run.runTime;
    for (const m of METERS) if (derived[m].u >= data.METER.amber) run.amberSeen[m] = true;
  }

  function emitMeters() {
    const d = derived;
    emit('meters', { power: d.power, cooling: d.cooling, network: d.network, efficiency: d.efficiency, uptime: state.run.uptime, blackout: d.blackout });
    emit('cash', { cash: state.run.cash, income: d.income, valuation: state.run.valuation });
  }

  function refreshFlag() {
    const avail = C.refreshAvailable(data, state.run);
    if (avail !== lastRefreshAvail) { lastRefreshAvail = avail; emit('refreshAvailable', { available: avail }); }
  }

  // 300-share perk: buy the best-value fix when a meter hits amber.
  function autoBuyer() {
    const perk = data.PERKS.find(p => p.autoBuyer);
    if (!perk || state.account.shares < perk.shares) return;
    for (const m of METERS) {
      if (derived[m].u < perk.autoBuyer.at) continue;
      const id = S.bestFixFor(ctx, m, derived.counts);
      if (id && S.costOf(ctx, id, 1, derived.counts) <= state.run.cash) { buy(id, 1); return; }
    }
  }

  // ---- purchases (§14.5) --------------------------------------------------------------------------
  const fail = (reason, text) => (text ? { ok: false, reason, text } : { ok: false, reason });

  function placeServer(tierId) {
    const { run } = state;
    for (let r = 0; r < run.racks.length; r++) {
      const slot = run.racks[r].servers.indexOf(null);
      if (slot < 0) continue;
      run.racks[r].servers[slot] = tierId;
      return { rack: r, slot };
    }
    return null;
  }

  function buy(id, qty = 1) {
    if (typeof id !== 'string') return fail('unknown');
    const d = S.describe(ctx, id);
    if (!d) return fail('unknown');
    if (d.limit <= 0) return fail('full', d.locked ?? d.fullReason ?? 'Maxed');
    if (!d.visible) return fail('locked', d.locked ?? 'Not available yet');
    if (d.locked) return fail('locked', d.locked);
    const n = qty === 'max' ? S.maxAffordable(ctx, id) : Math.min(int(qty, 1), d.limit);
    if (n <= 0) return fail(qty === 'max' ? 'cash' : 'qty');
    const cost = S.sumPrice(d, n);
    if (!(cost <= state.run.cash + 1e-9)) return fail('cash');
    spend(cost);
    applyPurchase(d, n);
    recompute();
    W.checkMilestones(ctx);
    refreshFlag();
    return { ok: true, qty: n, cost };
  }

  function applyPurchase(d, n) {
    const { run, account } = state;
    switch (d.kind) {
      case 'tier':
        for (let i = 0; i < n; i++) {
          const at = placeServer(d.def.id);
          if (!at) break;
          run.bought[d.def.id] = int(run.bought[d.def.id]) + 1;
          account.lifetime.servers++;
          emit('serverAdded', { rack: at.rack, slot: at.slot, tier: d.def.id });
        }
        break;
      case 'infra':
        run.infra[d.def.id] = int(run.infra[d.def.id]) + n;
        emit('infraAdded', { id: d.def.id, count: run.infra[d.def.id] });
        break;
      case 'rack':
        for (let i = 0; i < n; i++) {
          run.racks.push(C.newRack(data));
          run.racksBoughtThisStage++;
          const idx = run.racks.length - 1;
          emit('rackAdded', { rack: idx });
          const t = d.def.rackToast?.[idx];
          if (t) toast(t, 'good');
        }
        break;
      case 'move': {
        const from = run.stage;
        run.stage = d.def.stage;
        run.racksBoughtThisStage = 0;
        run.nextEventAt = null;
        recompute();
        W.rollBoard(ctx);
        emit('stageChanged', { from, to: run.stage });
        if (d.def.moveToast) toast(d.def.moveToast, 'good');
        break;
      }
      case 'global':
        run.globals++;
        emit('global', { n: run.globals, id: d.def.id, name: d.def.name });
        if (d.def.flavor) toast(d.def.flavor, 'good');
        break;
      case 'upgrade':
        run.upgrades[d.tier] = d.level + 1;
        emit('upgrade', { tier: d.tier, level: d.level + 1, name: d.name });
        break;
      case 'eff': run.effUpgrades.push(d.def.id); emit('infraAdded', { id: d.def.id, count: 1 }); break;
      case 'mit':
        // §15: a purchase has to show. The effect waits for its event, so the toast is the feedback (like staff);
        // infraAdded lets the scene hang a prop for it later (a UPS box in the power lane).
        run.mitigations.push(d.def.id);
        emit('infraAdded', { id: d.def.id, count: 1 });
        toast(`${d.def.name} installed. ${d.def.flavor}`, 'good');
        break;
      case 'staff':
        run.staff++;
        toast(`${d.def.name} hired. ${d.def.flavor}`, 'good');
        break;
      default: break;
    }
  }

  // §3 Refresh: swap the rack's lowest tier for the next tier at that tier's current price, refund 25% of the removed
  // tier's base. ×10 walks the tapped rack, then its row neighbours outward.
  function planSwap(rackIdx) {
    const { run } = state;
    const rack = run.racks[rackIdx];
    const order = data.TIERS.map(t => t.id);
    let best = null;
    rack.servers.forEach((id, slot) => {
      if (!id) return;
      const ti = order.indexOf(id);
      const next = data.TIERS[ti + 1];
      if (!next || next.stage > run.stage) return;
      if (!best || ti < best.ti || (ti === best.ti && slot < best.slot)) best = { ti, slot, from: id, next };
    });
    if (!best) return null;
    const refund = data.REFRESH_REFUND * data.TIERS[best.ti].base;
    return { slot: best.slot, from: best.from, to: best.next.id, cost: Math.max(0, C.tierPrice(data, best.next, run) - refund) };
  }

  function refreshOrder(rackIdx) {
    const st = data.STAGES[state.run.stage - 1];
    const row = Math.floor(rackIdx / st.cols), lo = row * st.cols, hi = lo + st.cols - 1;
    const out = [rackIdx];
    for (let k = 1; k < st.cols; k++) {
      if (rackIdx - k >= lo) out.push(rackIdx - k);
      if (rackIdx + k <= hi) out.push(rackIdx + k);
    }
    return out.filter(i => i < state.run.racks.length);
  }

  function refresh(rackIdx, qty = 1) {
    const { run, account } = state;
    rackIdx = int(rackIdx);
    if (!run.racks[rackIdx]) return fail('unknown');
    if (!C.refreshAvailable(data, run)) return fail('locked', 'Refresh needs every footprint bought and full');
    const want = qty === 10 ? 10 : 1;
    let swaps = 0, spent = 0;
    for (const r of refreshOrder(rackIdx)) {
      while (swaps < want) {
        const sw = planSwap(r);
        if (!sw) break;
        if (sw.cost > run.cash + 1e-9) { if (!swaps) return fail('cash'); return done(); }
        spend(sw.cost);
        spent += sw.cost;
        run.racks[r].servers[sw.slot] = sw.to;
        run.bought[sw.to] = int(run.bought[sw.to]) + 1;
        account.lifetime.servers++;
        run.refreshes++;
        swaps++;
        emit('serverSwapped', { rack: r, slot: sw.slot, from: sw.from, to: sw.to });
      }
      if (swaps >= want) break;
    }
    if (!swaps) return fail('nothing', 'Nothing in reach to refresh');
    return done();
    function done() { recompute(); W.checkMilestones(ctx); return { ok: true, swaps, cost: spent }; }
  }

  // ---- taps, contracts, events ------------------------------------------------------------------------
  function tapIncident(rack) {
    const res = W.resolveIncident(ctx, int(rack), { frac: 1, player: true });
    if (res.ok) { recompute(); W.checkMilestones(ctx); }
    return res;
  }

  // First tap: focus the oldest incident (the ui calls scene.focus(rack)); second tap: fix it at half bounty.
  function tapBadge() {
    const { run } = state;
    const oldest = W.oldestIncident(run);
    if (oldest === null) { run.badgeFocus = null; return fail('none'); }
    if (run.badgeFocus === oldest) {
      const res = W.resolveIncident(ctx, oldest, { frac: data.INCIDENT_RULES.badgeBountyFrac, player: true });
      recompute(); W.checkMilestones(ctx);
      return { ...res, rack: oldest, fixed: true };
    }
    run.badgeFocus = oldest;
    return { ok: true, rack: oldest, fixed: false };
  }

  // Garage verb, and the §0.3 fallback for a dead hall: a perk start that spent to $0 on racks and infra with no server
  // has no income, no incidents (they need a lit rack) and nothing buyable, so Hustle comes back until a server lands.
  function hustleAvailable() {
    const { run } = state;
    return run.stage === 1 || (derived.installed === 0 && derived.income === 0);
  }

  function hustle() {
    if (!hustleAvailable()) return fail('stage', 'Hustle is a garage thing');
    credit(data.HUSTLE);
    recompute();
    return { ok: true, amount: data.HUSTLE };
  }

  // ---- prestige (§10) --------------------------------------------------------------------------------
  // A running event ends (event{on:false}, no toast) before the run is replaced, so the scene drops its DDoS /
  // heatwave / viral flags and the ui its BREAKER overlay instead of keeping them for the next run.
  function endRunEvent() { if (state.run?.event) W.endEvent(ctx, { quiet: true }); }

  function exit() {
    const p = S.exitPreview(ctx);
    if (!p.available) return fail('locked', `Needs ${fmtMoney(data.EXIT.minValuation)} valuation`);
    const { account } = state;
    const from = state.run.stage;
    endRunEvent();
    account.shares += p.gained;
    account.lifetime.exits++;
    account.skyline++;
    emit('exit', { shares: account.shares, gained: p.gained, valuation: p.valuation, acquirer: pick(ctx.rng, data.ACQUIRERS)?.name ?? null });
    startRun();
    W.checkMilestones(ctx);
    emit('stageChanged', { from, to: state.run.stage });
    refreshFlag();
    lastWall = now(); // a new run is credited to now
    save({ claim: true });
    return { ok: true, shares: account.shares, gained: p.gained };
  }

  function resetRun() {
    const from = state.run.stage;
    endRunEvent();
    startRun();
    W.checkMilestones(ctx);
    emit('stageChanged', { from, to: state.run.stage });
    refreshFlag();
    lastWall = now();
    save({ claim: true });
    return { ok: true };
  }

  // ---- save / settings (§14.7) ---------------------------------------------------------------------------
  function exportSave() { save(); return toB64(JSON.stringify(state)); }

  function importSave(str) {
    let parsed;
    try { parsed = JSON.parse(fromB64(str)); }
    catch { try { parsed = JSON.parse(String(str)); } catch { return fail('corrupt', 'That is not a save'); } }
    const st = C.migrate(parsed, data, now());
    if (!st) return fail('corrupt', 'That is not a save');
    const from = state.run.stage;
    endRunEvent();
    state = st;
    state.run.event = null;
    state.run.badgeFocus = null;
    recompute();
    W.checkMilestones(ctx);
    lastWall = now();
    save({ claim: true });
    emit('stageChanged', { from, to: state.run.stage });
    W.emitContracts(ctx);
    refreshFlag();
    return { ok: true };
  }

  function setSetting(k, v) {
    if (!(k in state.account.settings)) return fail('unknown');
    state.account.settings[k] = !!v;
    save();
    return { ok: true };
  }

  // ---- ticker (§18) ---------------------------------------------------------------------------------------
  function tickerLine() {
    const { run, account } = state;
    const t = now();
    const keep = data.TICKER_RULES.noRepeatS * 1000;
    account.tickerRecent = account.tickerRecent.filter(e => t - e.at < keep);
    const recent = new Set(account.tickerRecent.map(e => e.id));
    const idOf = i => `tk_${i}`;
    let idx = -1;
    if (!run.openingShown && run.stage === 1 && !C.startPerk(data, account.shares)) {
      idx = data.TICKER.findIndex(l => l.opening);
      run.openingShown = true;
    }
    if (idx < 0 || recent.has(idOf(idx))) {
      const pool = data.TICKER.map((l, i) => i).filter(i => data.TICKER[i].stage.min <= run.stage && run.stage <= data.TICKER[i].stage.max && !recent.has(idOf(i)));
      if (!pool.length) return null;
      idx = pick(tickerRng, pool);
    }
    account.tickerRecent.push({ id: idOf(idx), at: t });
    return data.TICKER[idx].text;
  }

  // ---- dev ---------------------------------------------------------------------------------------------
  const dev = {
    give(cash) { credit(nonneg(cash)); recompute(); W.checkMilestones(ctx); return state.run.cash; },
    jump(stage) {
      const to = Math.min(data.STAGES.length, Math.max(1, int(stage, 1)));
      const from = state.run.stage;
      const run = state.run;
      run.stage = to;
      run.racksBoughtThisStage = 0;
      run.nextEventAt = null;
      while (run.racks.length < data.STAGES[to - 1].carried) run.racks.push(C.newRack(data));
      run.racks.length = Math.min(run.racks.length, data.STAGES[to - 1].footprints.length);
      recompute();
      W.rollBoard(ctx);
      W.checkMilestones(ctx);
      emit('stageChanged', { from, to });
      refreshFlag();
      return to;
    },
    time(seconds) { const n = Math.round(nonneg(seconds) * data.SIM_HZ); for (let i = 0; i < n; i++) tick(TICK_S); return state.run.runTime; },
    spawnIncident() { return W.spawnIncident(ctx, true); },
    fireEvent(id) { const r = W.startEvent(ctx, id, true); recompute(); return r; },
  };

  // ---- public surface --------------------------------------------------------------------------------
  const sim = {
    get state() { return state; },
    get derived() { return derived; },
    get offline() { return offlineSummary; },
    get speed() { return speedMul; },
    // { failed, superseded, blocked (site storage unavailable: in-memory store), lastSavedAt (epoch ms | null),
    // corruptSetAside, session } for the settings sheet
    get saveStatus() { return { ...saveStatus, session: { ...session } }; },
    data,
    on, off, update,
    setSpeed(n) { speedMul = Math.max(0, fin(n, 1)); return speedMul; },
    // visibilitychange / pagehide: the interval restarts in the update() clock, never in now()'s
    saveNow() { if (lastNow != null) lastSaveAt = lastNow; return save(); },
    // "Play here": take the save back from another tab (adopting its newer progress first) and resume
    claimSave,
    offlineAck, resume,
    buy, refresh, tapIncident, tapBadge, hustle,
    // the ui shows the Hustle button on exactly this (garage, or a dead hall with no server and no income)
    hustleAvailable,
    pickContract: id => { const r = W.pickContract(ctx, id); if (r.ok) W.checkMilestones(ctx); return r; },
    reroll: () => W.reroll(ctx, true),
    tapScrub: () => { const r = W.tapScrub(ctx); recompute(); return r; },
    exit, importSave, exportSave, resetRun, setSetting,
    cost: (id, qty = 1) => S.costOf(ctx, id, qty),
    maxAffordable: id => S.maxAffordable(ctx, id),
    shopRows: (tab, qty = 1) => S.shopRows(ctx, tab, qty),
    exitPreview: () => S.exitPreview(ctx),
    goals: (n = 3) => W.goals(ctx, n),
    tickerLine,
    dev,
  };
  return sim;
}

export { migrate, computeDerived, offlineEarn, sharesFor, estMinutes } from './sim_core.js';
