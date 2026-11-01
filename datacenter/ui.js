// ui.js — the HUD (§17). Top bar (cash, $/s, valuation bar, three meters, contract chips, uptime, gear), the left
// goals + toast log, Hustle and the incident badge, the ticker, the settings sheet, money pops, and the dispatch of
// every §14.4 bus event to the right widget. The shop lives in ui_sheet.js, the transient layer in ui_cards.js.
//
//   const ui = createUI({ sim, scene, data, audio });
//   for (const name of EVENTS) sim.on(name, p => ui.handle(name, p));
//   loop: ui.update(performance.now());
//
// ui only reads sim.state / sim.derived and calls §14.5 actions; it never writes state.

import { fmtMoney, fmtRate, fmtMeter, fmtPct, fmtTime, fmtNum, clamp, SUFFIXES } from './util.js';
import { createCards, isPhone } from './ui_cards.js';
import { createSheet } from './ui_sheet.js';

const METERS = ['power', 'cooling', 'network'];
const TICKER_PX_PER_S = 70;
const TICKER_STATIC_S = 9;
const BANNER_DELAY_MS = 1200; // the $1M banner follows the LED sweep by a beat, like a milestone card
const POP_STACK_PX = 18;

const $ = (root, s) => root.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createUI({ sim, scene, data, audio = null, root = document, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches }) {
  const hud = $(root, '#hud'), top = $(root, '#top');
  const cashEl = $(root, '#cash'), rateEl = $(root, '#rate'), dimEl = $(root, '#dim'), valbar = $(root, '#valbar'), valtext = $(root, '#valtext');
  const meterEls = Object.fromEntries(METERS.map(m => { const b = $(root, `#meter-${m}`); return [m, { el: b, bar: b.querySelector('.track i'), val: b.querySelector('.mv'), pct: el('span') }]; }));
  for (const m of METERS) meterEls[m].el.querySelector('.ml').appendChild(meterEls[m].pct);
  const chips = $(root, '#chips'), uptimeEl = $(root, '#uptime');
  const goalsEl = $(root, '#goals'), leftToggle = $(root, '#leftToggle');
  const hustle = $(root, '#hustle'), badge = $(root, '#badge'), badgeN = badge.querySelector('.n'), badgeRing = badge.querySelector('.ring');
  const tickerEl = $(root, '#ticker'), tickerText = $(root, '#tickerText');
  const settings = $(root, '#settings'), gear = $(root, '#gear');

  const cards = createCards({ root, reducedMotion });
  const sheet = createSheet({ root, sim, data, audio, cards, reducedMotion });

  let lastCash = null, lastMeters = null, shownCash = sim.state.run.cash, lastT = null;
  let chipIds = null, goalIds = null; // null = rebuild even when the new set is empty
  let topMeasuredAt = 0, viewRectCache = null, phone = isPhone(root);

  // ---- helpers -----------------------------------------------------------------------------------------------------------
  const run = () => sim.state.run, acct = () => sim.state.account;
  function hudPoint(node) {
    const r = node.getBoundingClientRect(), h = hud.getBoundingClientRect();
    return { x: r.left + r.width / 2 - h.left, y: r.top - h.top };
  }
  // Money pops land at the rack's projection, clamped into the visible 3D area (a zoomed-in rack projects above the
  // top bar; on phones the sheet covers the bottom of the canvas). Measured once per frame: a Max buy asks many times.
  function viewRect() {
    if (viewRectCache) return viewRectCache;
    const h = hud.getBoundingClientRect(), t = top.getBoundingClientRect(), s = sheet.element.getBoundingClientRect();
    const bottomSheet = s.left - h.left < 1;
    viewRectCache = { left: 16, right: (bottomSheet ? h.width : s.left - h.left) - 16, top: t.bottom - h.top + 12, bottom: (bottomSheet ? s.top - h.top : h.height - 22) - 12 };
    return viewRectCache;
  }
  function rackPoint(rack) {
    let p = null;
    try { const q = scene.project(rack); if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) p = q; } catch { /* stub or scene hiccup */ }
    const v = viewRect();
    if (!p) return { x: (v.left + v.right) / 2, y: v.top + (v.bottom - v.top) * 0.4 };
    return { x: clamp(p.x, v.left, v.right), y: clamp(p.y, v.top, v.bottom) };
  }
  const colourOf = u => (u > data.METER.red ? 'red' : u >= data.METER.amber ? 'amber' : 'green');

  // ---- valuation bar: the next prestige step (Exit at $1M, then the glow valuation, then the next share) -------------------
  function valuationGoal() {
    const v = run().valuation;
    const min = data.EXIT.minValuation;
    if (v < min) return { at: min, label: `Exit at ${fmtMoney(min)}` };
    const p = sim.exitPreview();
    if (!p.glow && p.glowAtValuation > v) return { at: p.glowAtValuation, label: `${fmtNum(p.glowAtShares)} shares at ${fmtMoney(p.glowAtValuation)}` };
    const next = (p.gained + 1) ** 3 * 1e6;
    return { at: next, label: `+${fmtNum(p.gained + 1)} shares at ${fmtMoney(next)}` };
  }
  // The current valuation, never printed as the goal it has not reached: fmtMoney rounds $999,999 to "$1.00M", which
  // would read "$1.00M → Exit at $1.00M" beside a locked Exit. Below the goal and rounding onto it, the value is
  // floored to 3 significant figures ("$999K"), or 4 when the goal itself is not round ("$1.330B" under $1.331B).
  function fmtMoneyFloor(n, sig) {
    const step = 10 ** (Math.floor(Math.log10(n)) - (sig - 1));
    n = Math.floor(n / step) * step; // 999,999 → 999,000 before scaling, so it prints "$999K", not "$0.99M"
    let i = 0;
    while (n >= 999.5 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
    const digits = Math.max(0, sig - (n < 10 ? 1 : n < 100 ? 2 : 3));
    const k = 10 ** digits;
    return `$${(Math.floor(n * k + 1e-9) / k).toFixed(digits)}${SUFFIXES[i]}`;
  }
  function fmtBelow(v, at) {
    const s = fmtMoney(v), goal = fmtMoney(at);
    if (!(v < at) || s !== goal || v < 999.5) return s;
    for (const sig of [3, 4]) { const t = fmtMoneyFloor(v, sig); if (t !== goal) return t; }
    return s;
  }

  // ---- top bar ---------------------------------------------------------------------------------------------------------------
  function updateTop(now, dt) {
    const cash = lastCash?.cash ?? run().cash;
    if (reducedMotion || Math.abs(cash - shownCash) < 0.005 || Math.abs(cash - shownCash) > Math.max(1e6, cash * 4)) shownCash = cash;
    else shownCash += (cash - shownCash) * (1 - Math.exp(-dt * 9));
    const cashText = fmtMoney(shownCash);
    if (cashEl.textContent !== cashText) cashEl.textContent = cashText;
    const d = sim.derived;
    const rate = fmtRate(lastCash?.income ?? d.income);
    if (rateEl.textContent !== rate) rateEl.textContent = rate;
    // the phone cash row is one line that must never wrap (it would move the whole HUD): "dim 87%" fits beside a
    // 7-character cash figure; when even that is too long the CSS ellipsises its start, so the number survives
    const dim = d.blackout ? 'blackout' : d.efficiency < 0.9995 ? (phone ? `dim ${fmtPct(d.efficiency)}` : `dimmed to ${fmtPct(d.efficiency)}`) : '';
    if (dimEl.textContent !== dim) dimEl.textContent = dim;

    const goal = valuationGoal();
    const v = run().valuation;
    const lo = Math.log10(Math.max(50, data.START.cash)), hi = Math.log10(goal.at);
    const frac = clamp((Math.log10(Math.max(v, 1)) - lo) / Math.max(1e-9, hi - lo), 0, 1);
    valbar.style.transform = `scaleX(${frac.toFixed(4)})`;
    const vt = `${fmtBelow(v, goal.at)} → ${goal.label}`;
    if (valtext.textContent !== vt) valtext.textContent = vt;

    const m = lastMeters;
    for (const k of METERS) {
      const src = m?.[k] ?? d[k];
      const ref = meterEls[k];
      const col = colourOf(src.u);
      if (!ref.el.classList.contains(col)) { ref.el.classList.remove('green', 'amber', 'red'); ref.el.classList.add(col); }
      ref.bar.style.transform = `scaleX(${clamp(src.u, 0, 1).toFixed(4)})`;
      const text = fmtMeter(src.demand, src.cap, k);
      if (ref.val.textContent !== text) ref.val.textContent = text;
      const pct = fmtPct(src.u);
      if (ref.pct.textContent !== pct) ref.pct.textContent = pct;
    }

    const up = m?.uptime ?? run().uptime;
    const upText = up >= 99.995 ? '100%' : `${up >= 99.9 ? up.toFixed(2) : up.toFixed(1)}%`;
    if (uptimeEl.textContent !== upText) uptimeEl.textContent = upText;
    const upCls = up >= 99 ? 'good' : up >= 90 ? 'warn' : 'bad';
    if (!uptimeEl.classList.contains(upCls)) { uptimeEl.classList.remove('good', 'warn', 'bad'); uptimeEl.classList.add(upCls); }
    uptimeEl.title = `Uptime ${up.toFixed(2)} · income ×${d.uptimeMult.toFixed(2)}`;

    updateChips(d);
    if (now - topMeasuredAt > 500) { topMeasuredAt = now; measureTop(); }
  }

  function measureTop() {
    const h = top.offsetHeight;
    if (h) root.documentElement.style.setProperty('--topH', `${h}px`);
    sendBand();
  }
  // Portrait: the scene fits the hall to the band of the canvas between the top panel and the sheet
  // (scene.setViewportBand, §15); the HUD is the only one that knows where those are. The hud div covers the canvas
  // exactly, so hud-relative px are canvas px. Measured with the panel: every 500 ms, on resize and after a sheet drag.
  function sendBand() {
    if (typeof scene.setViewportBand !== 'function') return;
    const hr = hud.getBoundingClientRect(), tr = top.getBoundingClientRect(), sr = sheet.element.getBoundingClientRect(), kr = tickerEl.getBoundingClientRect();
    const bottomSheet = sr.left - hr.left < 1;
    const topPx = tr.bottom - hr.top + 8, bottomPx = (bottomSheet ? sr.top : kr.top) - hr.top;
    try { scene.setViewportBand(topPx, bottomPx); } catch { /* stub scene */ }
  }

  function updateChips(d) {
    const active = run().contracts.active;
    const ids = `${active.map(a => a.id).join()}|${run().mitigations.join()}|${run().staff}`;
    if (ids !== chipIds) {
      chipIds = ids;
      chips.textContent = '';
      for (const a of active) {
        const c = data.CONTRACTS.find(x => x.id === a.id);
        const chip = el('span', 'con');
        chip.dataset.id = a.id;
        chip.title = c ? `${c.name} ×${c.mult}${c.sla != null ? ` · SLA ${c.sla}` : ''}: ${c.line}` : a.id;
        chip.append(el('span', 'ring'), el('span', null, shortName(c?.name ?? a.id)), el('span', 'sla'));
        chips.appendChild(chip);
      }
      for (const g of guardChips()) chips.appendChild(g);
    }
    for (const a of active) {
      const chip = chips.querySelector(`.con[data-id="${a.id}"]`);
      if (!chip) continue;
      const c = data.CONTRACTS.find(x => x.id === a.id);
      chip.querySelector('.ring').style.setProperty('--p', clamp(a.termLeft / (c?.term || 600), 0, 1).toFixed(3));
      const dc = d.contracts.find(x => x.id === a.id);
      const miss = !!dc && dc.slaOk === false;
      chip.classList.toggle('miss', miss);
      chip.classList.toggle('ok', !!dc && dc.sla != null && dc.slaOk);
      const sla = c?.sla == null ? `×${c?.mult ?? ''}` : miss ? 'SLA missed' : `SLA ${c.sla} ✓`;
      const slaEl = chip.querySelector('.sla');
      if (slaEl.textContent !== sla) slaEl.textContent = sla;
    }
  }
  const shortName = n => n.replace(/\s*\(.*\)$/, '').split(' ').slice(0, 2).join(' ');
  // §15 'a purchase has to show': mitigations and staff get a HUD read beside the contract chips as well as their lane
  // props in the hall. One chip for the mitigations owned, one for the staff level; the title carries the detail.
  function guardChips() {
    const out = [];
    const mits = run().mitigations.map(id => data.MITIGATIONS.find(m => m.id === id)).filter(Boolean);
    if (mits.length) {
      const c = el('span', 'guard', mits.map(m => m.name).join(' · '));
      c.title = mits.map(m => `${m.name}: ${m.defuses ? `defuses ${data.EVENTS.find(e => e.id === m.defuses)?.name ?? m.defuses}` : `hardware incidents resolve in ${m.hardwareResolveS} s`}`).join('\n');
      out.push(c);
    }
    const n = run().staff;
    if (n > 0) {
      const s = data.STAFF[Math.min(n, data.STAFF.length) - 1], r = data.STAFF_RULES;
      const c = el('span', 'guard', `${s.name.split(',')[0]}${n > 1 ? ` · staff ×${n}` : ''}`);
      c.title = `${s.name}${n > 1 ? ` and ${n - 1} more` : ''}: incidents fix themselves after ${Math.max(r.autoMin, r.autoBase - r.autoPer * n)} s (no tap bounty)`;
      out.push(c);
    }
    return out;
  }

  for (const m of METERS) meterEls[m].el.addEventListener('click', () => { sheet.highlight(m); audio?.play('blip'); });

  // ---- left: goals + log -----------------------------------------------------------------------------------------------------
  function updateGoals() {
    const goals = sim.goals(3);
    const ids = goals.map(g => g.id).join();
    if (ids === goalIds) return;
    goalIds = ids;
    goalsEl.textContent = '';
    for (const g of goals) {
      const c = el('div', 'goal panel');
      c.dataset.id = g.id;
      c.append(el('b', null, g.name), el('span', null, goalHint(g)));
      goalsEl.appendChild(c);
    }
    setLeftLabel();
  }
  // Collapsed (the phone default) the chip carries the current goal, so one 28 px row replaces three cards.
  function setLeftLabel() {
    const collapsed = root.body.classList.contains('leftCollapsed');
    const first = goalsEl.firstChild?.querySelector('b')?.textContent;
    leftToggle.textContent = collapsed ? (first ? `Goals ▸ ${first}` : 'Goals ▸') : 'Goals ▾';
  }
  function goalHint(g) {
    const c = g.cond;
    switch (c.type) {
      case 'servers': return `Own ${c.n} server${c.n > 1 ? 's' : ''}`;
      case 'tier': return `Install ${c.n} ${data.TIERS.find(t => t.id === c.id)?.name ?? c.id}`;
      case 'incidents': return `Fix ${c.n} incident${c.n > 1 ? 's' : ''} by tapping`;
      case 'contracts': return `Take ${c.n} contract${c.n > 1 ? 's' : ''}`;
      case 'valuation': return `Reach ${fmtMoney(c.n)} valuation`;
      case 'stage': return `Move to the ${data.STAGES[c.n - 1]?.short ?? c.n}`;
      case 'racks': return `Own ${c.n} racks`;
      case 'rackFull': return `Fill all 8 slots of Rack ${c.rack + 1}`;
      case 'allRacksFull': return `Fill every rack in the ${data.STAGES[c.stage - 1]?.short ?? ''}`;
      case 'noRedFor': return `${fmtTime(c.s)} with no red meter`;
      case 'uptimeFor': return `Uptime ≥ ${c.min} for ${fmtTime(c.s)}`;
      case 'infra': return `Buy ${c.n > 1 ? `${c.n} ` : 'a '}${data.INFRA.find(u => u.id === c.id)?.name ?? c.id}`;
      case 'exits': return `${c.n} Exit${c.n > 1 ? 's' : ''}`;
      case 'staff': return 'Hire your first staff';
      case 'meterAmber': return `Push ${c.meter} into amber`;
      case 'breaker': return 'Overdraw the wall outlet';
      case 'refresh': return 'Refresh a rack';
      case 'power': return `Reach ${c.kw >= 1000 ? `${c.kw / 1000} MW` : `${c.kw} kW`} of power`;
      default: return g.text || '';
    }
  }
  leftToggle.addEventListener('click', () => { root.body.classList.toggle('leftCollapsed'); setLeftLabel(); });
  // the 232 px goals column opens by default only where the hall is wide enough to spare it (a 920 px canvas and up)
  if (!matchMedia('(min-width: 1180px)').matches) root.body.classList.add('leftCollapsed');
  setLeftLabel();

  // ---- bottom centre: Hustle and the incident badge ----------------------------------------------------------------------------
  hustle.addEventListener('click', () => {
    const res = sim.hustle();
    if (!res.ok) return;
    const p = hudPoint(hustle);
    cards.pop(`+${fmtMoney(res.amount)}`, p.x, p.y - 6);
    audio?.play('blip');
  });

  // §8: the first tap focuses the oldest incident (the sim marks run.badgeFocus, the scene moves the camera); the next
  // tap fixes it at half bounty, however long the player looked at the hall in between. The sim drops its focus mark
  // when that incident resolves or the oldest changes, so the badge is back to "focus" then; no timer here.
  badge.addEventListener('click', () => {
    const oldest = oldestIncident();
    if (oldest === null) return;
    if (run().badgeFocus === oldest) {
      const res = sim.tapBadge();
      if (res.ok && res.fixed) audio?.play('register');
      return;
    }
    sim.tapBadge();
    try { scene.focus(oldest); } catch { /* stub */ }
    audio?.play('blip');
  });
  function oldestIncident() {
    let best = null;
    run().racks.forEach((r, i) => { if (r.incident && (best === null || r.incident.t0 < run().racks[best].incident.t0)) best = i; });
    return best;
  }

  function updateCentre(now) {
    const r = run(), d = sim.derived;
    // Garage, or the §0.3 dead-hall fallback (no server, no income): the sim decides, the button follows.
    const garage = sim.hustleAvailable();
    if (hustle.hidden === garage) hustle.hidden = !garage;
    hustle.classList.toggle('pulse', garage && d.installed === 0 && !reducedMotion);
    const incidents = r.racks.filter(x => x.incident);
    const n = incidents.length;
    if (badge.hidden === (n > 0)) badge.hidden = n === 0;
    const oldest = n ? oldestIncident() : null;
    badge.classList.toggle('focused', oldest !== null && r.badgeFocus === oldest); // "tap again fixes it" while the sim holds the focus
    if (n) {
      const txt = String(n);
      if (badgeN.textContent !== txt) badgeN.textContent = txt;
      const inc = r.racks[oldest].incident;
      const left = r.racks[oldest].dark ? 0 : clamp(1 - (r.runTime - inc.t0) / data.INCIDENT_RULES.tapWindow, 0, 1);
      badgeRing.style.setProperty('--p', left.toFixed(3));
      badge.classList.toggle('dark', d.darkRacks > 0);
    }
  }

  // ---- ticker (§18): one 14 px line scrolling leftwards; reactions jump the queue --------------------------------------------
  const tickerQueue = [];
  let tickerX = 0, tickerW = 0, tickerStaticAt = -Infinity;
  function nextTickerLine() {
    let line = tickerQueue.shift();
    if (!line) { try { line = sim.tickerLine(); } catch { line = null; } }
    if (!line) line = { text: 'All systems operational. Probably.' };
    if (typeof line === 'string') line = { text: line };
    tickerText.textContent = '';
    if (line.bold) tickerText.appendChild(el('b', null, line.text)); else tickerText.textContent = line.text;
    tickerW = tickerText.offsetWidth;
    tickerX = tickerEl.clientWidth;
  }
  function updateTicker(now, dt) {
    if (reducedMotion) {
      if (now - tickerStaticAt > TICKER_STATIC_S * 1000 || (tickerQueue.length && now - tickerStaticAt > 2500)) { tickerStaticAt = now; nextTickerLine(); tickerX = 8; tickerText.style.transform = 'translateX(8px)'; }
      return;
    }
    if (!tickerW) nextTickerLine();
    tickerX -= TICKER_PX_PER_S * dt;
    if (tickerX + tickerW < 0) nextTickerLine();
    tickerText.style.transform = `translateX(${tickerX.toFixed(1)}px)`;
  }
  const pushTicker = (text, bold = true) => { if (text) tickerQueue.push({ text, bold }); };

  // ---- settings sheet --------------------------------------------------------------------------------------------------------------
  const setBloom = $(root, '#setBloom'), setSound = $(root, '#setSound'), saveText = $(root, '#saveText'), setInfo = $(root, '#setInfo');
  const setClaimRow = $(root, '#setClaimRow');
  let setInfoAt = -Infinity;
  function syncSettings() {
    const s = acct().settings;
    setBloom.classList.toggle('on', !!s.bloom); setBloom.setAttribute('aria-checked', String(!!s.bloom));
    setSound.classList.toggle('on', !!s.sound); setSound.setAttribute('aria-checked', String(!!s.sound));
    const lt = acct().lifetime;
    setInfo.textContent = `${acct().shares} share${acct().shares === 1 ? '' : 's'} · ${lt.exits} exit${lt.exits === 1 ? '' : 's'} · lifetime ${fmtMoney(lt.valuation)} · run ${fmtTime(run().runTime)} · ${saveLine()}`;
    setClaimRow.hidden = !sim.saveStatus.superseded;
  }
  // The save's health from sim.saveStatus: when it last wrote, then anything the player should act on.
  function saveLine() {
    const s = sim.saveStatus;
    const parts = [];
    if (s.lastSavedAt) {
      const ago = Math.max(0, Math.round((Date.now() - s.lastSavedAt) / 1000));
      parts.push(ago < 2 ? 'saved just now' : ago < 60 ? `saved ${ago} s ago` : `saved ${fmtTime(ago)} ago`);
    } else parts.push(`saves every ${data.OFFLINE.saveEveryS} s`);
    if (s.blocked) parts.push('storage blocked: export your save');
    if (s.failed) parts.push('saving failed: export your save');
    if (s.superseded) parts.push('paused: open in another tab');
    if (s.corruptSetAside) parts.push(`a corrupt save was set aside (${data.SAVE_KEY}_corrupt)`);
    return parts.join(' · ');
  }
  $(root, '#setClaim').addEventListener('click', () => {
    const res = sim.claimSave();
    if (res.ok) {
      // adopted: the newer tab's progress was taken over, so nothing of either tab was overwritten
      cards.toast(res.adopted ? "Playing here with the other tab's latest progress. The other tab is paused." : 'Playing here. The other tab is paused.', 'good');
      sheet.invalidate();
    }
    else cards.toast('Could not take the save back. Export it from here to be safe.', 'event');
    syncSettings();
  });
  // body.settingsOn hides the centre card (and the phone strip) under the sheet; ui_cards holds cards until it closes.
  function openSettings(on = settings.hidden) {
    settings.hidden = !on;
    root.body.classList.toggle('settingsOn', !!on);
    cards.setCovered(!!on);
    if (on) { syncSettings(); saveText.value = ''; }
  }
  gear.addEventListener('click', () => { openSettings(); audio?.play('blip'); });
  $(root, '#settingsClose').addEventListener('click', () => openSettings(false));
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !settings.hidden) openSettings(false); });
  setBloom.addEventListener('click', () => { const v = !acct().settings.bloom; sim.setSetting('bloom', v); try { scene.setBloom(v); } catch { /* stub */ } syncSettings(); });
  setSound.addEventListener('click', () => { const v = !acct().settings.sound; sim.setSetting('sound', v); if (v) { audio?.unlock(); audio?.play('blip'); } syncSettings(); });
  $(root, '#setPhoto').addEventListener('click', () => photo());
  $(root, '#setExport').addEventListener('click', () => {
    saveText.value = sim.exportSave();
    saveText.focus(); saveText.select();
    cards.toast('Save exported. Copy the text somewhere safe.', 'good');
  });
  $(root, '#setImport').addEventListener('click', () => {
    const res = sim.importSave(saveText.value);
    if (res.ok) { cards.toast('Save imported.', 'good'); openSettings(false); sheet.invalidate(); shownCash = run().cash; }
    else cards.toast(res.text || 'That is not a save.', 'event');
  });
  $(root, '#setReset').addEventListener('click', () => {
    if (!confirm('Reset this run? Shares, milestones and lifetime stats stay. Racks, servers, cash and valuation go.')) return;
    const res = sim.resetRun();
    if (res.ok) { cards.toast('Run reset. Back to the garage.', 'info'); openSettings(false); sheet.invalidate(); shownCash = run().cash; }
  });

  // §15 photo mode: hide the HUD, ask the scene for a frame, hand the player a PNG.
  async function photo() {
    root.body.classList.add('photo');
    let out = null;
    try {
      await new Promise(r => requestAnimationFrame(r));
      out = await scene.photo();
    } catch { out = null; }
    finally { root.body.classList.remove('photo'); }
    if (!out) { cards.toast('Photo mode needs the 3D scene.', 'info'); return false; }
    const url = out instanceof Blob ? URL.createObjectURL(out) : String(out);
    const a = el('a');
    a.href = url;
    a.download = `uptime-${fmtMoney(run().valuation).replace(/[^\w.]/g, '')}.png`;
    root.body.appendChild(a); a.click(); a.remove();
    if (out instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 5000);
    cards.toast('Photo saved.', 'good');
    audio?.play('register');
    return true;
  }

  // ---- event toast helpers (§8) -----------------------------------------------------------------------------------------------------
  // A hand-scrub tap (the Fix button, or the uplink cabinet in 3D via main.js) advances the button's count.
  function scrubbed(res) {
    const def = data.EVENTS.find(e => e.id === run().event?.id);
    if (res.ok && !res.done && def?.handScrub) cards.setFixLabel(`Scrub by hand (${res.taps}/${def.handScrub.taps})`);
  }
  function eventFix(id) {
    const def = data.EVENTS.find(e => e.id === id);
    if (!def) return {};
    if (def.handScrub) {
      return {
        fixLabel: `Scrub by hand (0/${def.handScrub.taps})`,
        onFix: () => {
          const res = sim.tapScrub();
          if (res.ok) { audio?.play('blip'); scrubbed(res); }
        },
      };
    }
    if (def.effect?.meter) return { fixLabel: 'Fix', onFix: () => sheet.highlight(def.effect.meter) };
    return {};
  }

  // The event toast names the bonus state (§8: "Rewards slack", "the uptime golden cookie"), not just a ring colour.
  function bonusSuffix(def, bonus) {
    if (!def) return '';
    if (def.headroomBonus) return bonus ? ` Headroom held: income ×${def.headroomBonus.income}.` : '';
    if (def.requires?.uptimeMin != null) return bonus ? ` Uptime ${def.requires.uptimeMin}+: income ×${def.effect?.factor ?? ''}.` : ` Uptime under ${def.requires.uptimeMin}: no bonus.`;
    return '';
  }

  // ---- money pops, coalesced per task: a Max buy emits one serverAdded per server inside one click handler; one pop
  // per tier ("+$0.10/s ×60") at the last rack instead of sixty, each forcing a layout.
  let popBatch = null; // { tiers: Map<tierId, {inc, n, rack}>, swaps: {n, rack}|null }
  function batched(fn) {
    if (!popBatch) { popBatch = { tiers: new Map(), swaps: null }; queueMicrotask(flushPops); }
    fn(popBatch);
  }
  function flushPops() {
    const b = popBatch;
    popBatch = null;
    if (!b) return;
    let i = 0;
    for (const t of b.tiers.values()) {
      const at = rackPoint(t.rack);
      cards.pop(t.n > 1 ? `${fmtRate(t.inc)} ×${t.n}` : fmtRate(t.inc), at.x, at.y - POP_STACK_PX * i++);
    }
    if (b.swaps) {
      const at = rackPoint(b.swaps.rack);
      cards.pop(b.swaps.n > 1 ? `refreshed ×${b.swaps.n}` : 'refreshed', at.x, at.y - POP_STACK_PX * i, 'cyan');
      audio?.play('pop');
    }
  }

  // ---- bus dispatch (§14.4) -----------------------------------------------------------------------------------------------------------
  const handlers = {
    cash: p => { lastCash = p; },
    meters: p => { lastMeters = p; },
    toast: p => cards.toast(p.text, p.kind),
    serverAdded: p => {
      const t = data.TIERS.find(x => x.id === p.tier);
      if (!t) return;
      const inc = t.inc * (data.UPGRADES.outputMult ?? 2) ** (run().upgrades[t.id] || 0);
      batched(b => { const e = b.tiers.get(t.id) ?? { inc, n: 0, rack: p.rack }; e.n++; e.rack = p.rack; b.tiers.set(t.id, e); });
    },
    serverSwapped: p => batched(b => { b.swaps = { n: (b.swaps?.n ?? 0) + 1, rack: p.rack }; }),
    rackAdded: p => { const at = rackPoint(p.rack); cards.pop(`Rack ${p.rack + 1}`, at.x, at.y, 'cyan'); },
    rackDark: p => { if (p.dark) { cards.toast(`Rack ${p.rack + 1} went dark. Tap it to bring it back.`, 'incident', 5000); audio?.play('alarm'); } },
    infraAdded: () => {},
    stageChanged: () => {
      // an Exit / reset / import ends the old run's event first (event{on:false}); belt-and-braces so no BREAKER overlay
      // or event toast outlives the run it belonged to. A stage move mid-event keeps both (the event is still running).
      if (!run().event) { cards.setBreaker(false); cards.hideEvent(); }
      sheet.invalidate(); chipIds = null; goalIds = null; shownCash = run().cash; sheet.update(performance.now(), true);
    },
    incident: p => { cards.toast(p.flavor, 'incident', 5000); audio?.play('alarm'); },
    incidentResolved: p => {
      const at = rackPoint(p.rack);
      if (p.bounty > 0) { cards.pop(`+${fmtMoney(p.bounty)}`, at.x, at.y, 'gold'); audio?.play('register'); }
      else if (!p.auto) cards.pop('fixed', at.x, at.y, 'cyan');
    },
    // §18: every event gets its reaction line on the ticker; the breaker's lands when the lights come back
    event: p => {
      const def = data.EVENTS.find(e => e.id === p.id);
      if (p.id === 'ev_breaker') { if (!p.on) { cards.setBreaker(false); pushTicker(def?.ticker); } return; }
      if (p.on) { cards.showEvent(p, { ...eventFix(p.id), suffix: bonusSuffix(def, p.bonus) }); pushTicker(def?.ticker); audio?.play('alarm'); }
      else cards.hideEvent();
    },
    breaker: () => { cards.setBreaker(true); audio?.play('thud'); },
    upgrade: p => { const t = data.TIERS.find(x => x.id === p.tier); cards.toast(`${p.name}: ×${data.UPGRADES.outputMult ?? 2} ${t?.name ?? p.tier} output. They run hotter now.`, 'good'); audio?.play('register'); },
    global: p => { cards.toast(`${p.name}: ×${data.GLOBALS[0].mult} income.`, 'good'); audio?.play('register'); },
    milestone: p => {
      pushTicker(p.ticker || p.name.toUpperCase());
      audio?.play('register');
      if (p.softEnding) {
        cards.milestone(p, { onPhoto: photo });
        cards.showBanner('You Are the Cloud', `${p.text} The game continues as a pure idle.`, { sticky: true });
        return;
      }
      // §9 Make Me a Million: the LED sweep, a banner and the one-tap photo land together; no queued card for this one
      if (p.fx === 'sweep' || p.screenshot) {
        cards.showBanner(p.name, p.text, { ms: 30000, delayMs: BANNER_DELAY_MS,
          buttons: [{ label: '📷 Save a photo', primary: true, onClick: photo }, { label: 'Nice' }] });
        return;
      }
      cards.milestone(p, { onPhoto: photo });
    },
    contractChanged: () => { sheet.invalidate(); },
    exit: p => {
      cards.showBanner(`Acquired by ${p.acquirer || 'a company that is legally a shell'}`, `+${fmtNum(p.gained)} share${p.gained === 1 ? '' : 's'} · ${fmtNum(p.shares)} total · +10% income each. New run.`, { ms: 6000 });
      cards.dismiss(); // a card of the run that just ended must not sit over the LED sweep; the queue waits for the banner
      pushTicker(`ACQUIRED FOR ${fmtMoney(p.valuation).toUpperCase()}. GARAGE SMELL DID NOT TRANSFER`);
      audio?.play('register');
    },
    offline: p => showOffline(p.summary),
    refreshAvailable: p => sheet.setRefreshAvailable(p.available),
  };
  function handle(name, payload) { handlers[name]?.(payload); }

  // §11: the three return incidents wait in the sim until the card is dismissed (their 20 s windows start then).
  function showOffline(summary) {
    if (!summary) return;
    cards.offline(summary, { countUpS: data.OFFLINE.countUpS, onClose: () => sim.offlineAck() });
    audio?.play('register');
  }

  // ---- frame -------------------------------------------------------------------------------------------------------------------------------
  function update(now) {
    const dt = lastT == null ? 0 : Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    viewRectCache = null;
    updateTop(now, dt);
    updateGoals();
    updateCentre(now);
    cards.updateEvent(run());
    updateTicker(now, dt);
    sheet.update(now);
    if (!settings.hidden && now - setInfoAt >= 1000) { setInfoAt = now; syncSettings(); } // "saved N s ago" and the save's health
  }

  function resize() { phone = isPhone(root); sheet.relayout(); measureTop(); tickerW = 0; viewRectCache = null; }
  addEventListener('resize', resize);
  measureTop();

  return {
    update, handle, resize, photo, showOffline, openSettings, scrubbed,
    setTab: t => sheet.setTab(t), openInfraFor: m => sheet.highlight(m), toast: (t, k) => cards.toast(t, k),
    get tab() { return sheet.tab; }, get qty() { return sheet.qty; }, get refreshQty() { return sheet.refreshQty; },
    cards, sheet,
  };
}
