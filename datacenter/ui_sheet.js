// ui_sheet.js — the bottom sheet (right panel on desktop, §17): tabs Build / Infra / Contracts / Upgrades / Exit over
// sim.shopRows(tab, qty), the ×1 / ×10 / Max toggle, the contract board and slots, the Exit card with hold-to-confirm,
// the phone drag handle, meter-tap highlights and the long-press / hover flavor tooltip.
//
// Rendering rule (§17 performance): rows are rebuilt only when the row SET changes (ids, visibility, lock state); every
// other update writes text nodes and classes in place. The sheet refreshes at 10 Hz, not per frame.

import { fmtMoney, fmtPrice, fmtRate, fmtKw, fmtGbps, fmtMeter, fmtTime, fmtNum } from './util.js';
import { isPhone } from './ui_cards.js';

const REFRESH_MS = 100;
const BADGES_MS = 500; // the four other tabs' counts: a glance value, not a live one
const HOLD_MS = 1200;
const LONG_PRESS_MS = 450;
const SHEET_VH = 30; // the phone sheet's default height; keep in step with --sheet in index.html
const SHEET_TALL_VH = 72; // the tall snap's ceiling; SNAPS() lowers it so the Hustle row stays under the top panel
const CENTRE_ROW_PX = 64; // the 48 px Hustle / badge row plus its gaps, kept clear between the panel and the tall sheet
const TOASTS_MIN_PX = 120; // with less band than this above the Hustle row the toast column would climb onto the panel
const TABS = ['build', 'infra', 'contracts', 'upgrades', 'exit'];
const CAP = { power: 'Power', cooling: 'Cooling', network: 'Network' };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createSheet({ root = document, sim, data, audio, cards, reducedMotion = false }) {
  const sheet = root.querySelector('#sheet'), rowsEl = root.querySelector('#rows'), tabsEl = root.querySelector('#tabs');
  const qtyEl = root.querySelector('#qty'), title = root.querySelector('#sheetTitle'), handle = root.querySelector('#handle');
  const hint = root.querySelector('#refreshHint'), hud = root.querySelector('#hud');
  const tabBtns = Object.fromEntries(TABS.map(t => [t, tabsEl.querySelector(`[data-tab="${t}"]`)]));

  let tab = 'build', qty = 1, lastAt = -Infinity, badgesAt = -Infinity, key = null, refs = new Map(), builtTab = null;
  let hl = null, hlUntil = 0, hlScroll = false, refreshAvail = false;
  let exitHold = null;
  let suppressHover = false; // set by beginRebuild(); a pointermove over the rows clears it

  // ---- tabs and quantity ------------------------------------------------------------------------------------------
  function setTab(t) {
    if (!TABS.includes(t)) return;
    tab = t;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', k === t);
    qtyEl.hidden = !(t === 'build' || t === 'infra');
    key = null;
    update(performance.now(), true);
  }
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { setTab(b.dataset.tab); audio?.play('blip'); } });
  qtyEl.addEventListener('click', e => {
    const b = e.target.closest('[data-qty]');
    if (!b) return;
    qty = b.dataset.qty === 'max' ? 'max' : Number(b.dataset.qty);
    for (const x of qtyEl.children) x.classList.toggle('on', x === b);
    key = null;
    update(performance.now(), true);
  });

  // ---- generic rows (build / infra / upgrades) -------------------------------------------------------------------------
  function rowKey(r) { return `${r.id}|${r.visible ? 1 : 0}|${r.locked ? 1 : 0}|${r.full ? 1 : 0}`; }

  function detailText(r) {
    const parts = [];
    if (r.addNominal >= 0.005) parts.push(fmtRate(r.addNominal)); // below half a cent fmtRate prints "+$0.00/s"
    if (r.kind === 'infra') {
      parts.push(r.meter === 'network' ? `+${fmtGbps(r.addGbps)}` : `+${fmtKw(r.addKw)}`);
      if (r.addDraw > 0) parts.push(`draws ${fmtKw(r.addDraw)}`);
    } else {
      if (r.addKw > 0.0005) parts.push(`+${fmtKw(r.addKw)}`);
      if (r.addGbps > 0.0005) parts.push(`+${fmtGbps(r.addGbps)}`);
    }
    if (r.max != null && (r.kind === 'tier' || r.kind === 'infra' || r.kind === 'global')) parts.push(`${r.owned}/${r.max}`);
    return parts.join(' · ');
  }
  const overdrawText = o => (o ? `will overdraw: ${CAP[o.meter]} ${fmtMeter(o.demand, o.cap, o.meter)}` : '');
  function lockText(r) {
    if (r.locked) return r.locked;
    if (r.overdraw) return overdrawText(r.overdraw); // sim_shop only flags a meter the purchase pushes past red and makes worse
    return '';
  }
  function costText(r) {
    if (r.kind === 'move' && r.cost === 0) return '';
    const c = r.cost >= 999.5 ? fmtMoney(r.cost) : fmtPrice(r.cost);
    return r.qty > 1 ? `${c} ×${r.qty}` : c;
  }

  function makeRow(r) {
    const b = el('button', 'row');
    b.type = 'button';
    b.dataset.id = r.id;
    b.dataset.kind = r.kind;
    const rn = el('span', 'rn'), name = document.createTextNode(r.name), badge = el('b'), tags = el('span', 'tags');
    rn.append(name, badge, tags);
    const rc = el('span', 'rc'), rd = el('span', 'rd'), rl = el('span', 'rl');
    b.append(rn, rc, rd, rl);
    const ref = { el: b, name, badge, tags, rc, rd, rl, row: r };
    b.addEventListener('click', () => onRowClick(ref));
    attachTooltip(b, () => ref.row.flavor, () => tipExtra(ref.row));
    return ref;
  }
  // The amber line(s) under a row's flavour: the lock / overdraw reason, and for a cooling unit that draws power the
  // §12 PUE lesson (the Box Fan's 0.3 kW lands on the Power meter).
  function tipExtra(r) {
    const lines = [lockText(r)];
    if (r.kind === 'infra' && r.addDraw > 0) lines.push(`Cooling draws power: +${fmtKw(r.addDraw)} on the Power meter (PUE)`);
    return lines.filter(Boolean).join('\n');
  }

  function fillRow(ref, r) {
    ref.row = r;
    const b = ref.el;
    if (ref.name.data !== r.name) ref.name.data = r.name;
    const badge = r.badge ?? '';
    if (ref.badge.textContent !== badge) ref.badge.textContent = badge;
    const cost = costText(r);
    if (ref.rc.textContent !== cost) ref.rc.textContent = cost;
    const d = detailText(r);
    if (ref.rd.textContent !== d) ref.rd.textContent = d;
    const l = lockText(r);
    if (ref.rl.textContent !== l) ref.rl.textContent = l;
    const over = !!r.overdraw;
    b.classList.toggle('can', !!r.affordable && !over);
    b.classList.toggle('over', !!r.affordable && over);
    b.classList.toggle('locked', !!r.locked || !r.visible);
    const hlOn = hl && performance.now() < hlUntil && (r.cheapestFor === hl || r.bestValueFor === hl);
    b.classList.toggle('hl', !!hlOn);
    b.classList.toggle('best', !!hlOn && r.bestValueFor === hl);
    const want = hlOn ? (r.cheapestFor === hl && r.bestValueFor === hl ? 'cheapest · best value' : r.bestValueFor === hl ? 'best value' : 'cheapest') : '';
    if (ref.tags.dataset.t !== want) {
      ref.tags.dataset.t = want;
      ref.tags.textContent = '';
      if (want) ref.tags.appendChild(el('span', `tag ${r.bestValueFor === hl ? 'best' : 'cheap'}`, want));
    }
    if (hlOn && hlScroll) { hlScroll = false; b.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }); }
  }

  function onRowClick(ref) {
    const r = ref.row;
    if (ref.el.dataset.suppress) { delete ref.el.dataset.suppress; return; }
    // the tip owns its hide timer (cards.hideTipLater): the pointerup that preceded this click asked for a hide too,
    // and that request must not close the tip shown here
    if (r.locked) { cards.showTip(...centerOf(ref.el), r.locked); cards.hideTipLater(1200); return; }
    // ask the sim rather than the row snapshot (up to 100 ms old): cash that just landed counts
    const res = r.kind === 'reroll' ? sim.reroll() : sim.buy(r.id, qty);
    if (res.ok) {
      audio?.play(r.kind === 'rack' ? 'thud' : r.kind === 'move' ? 'register' : 'pop');
      update(performance.now(), true);
    } else if (res.reason === 'cash') {
      const need = r.kind === 'reroll' ? r.cost : sim.cost(r.id, qty);
      cards.showTip(...centerOf(ref.el), `Need ${fmtMoney(need)}`);
      cards.hideTipLater(1200);
    } else if (res.text) cards.toast(res.text, 'info', 2500);
  }

  // Infra and Upgrades tabs get section headers; Build is one list.
  function sectionOf(r) {
    if (tab === 'infra') return r.kind === 'infra' ? CAP[r.meter] : 'Mitigations & staff';
    if (tab === 'upgrades') return r.kind === 'upgrade' ? 'Tier upgrades' : r.kind === 'global' ? 'Global' : 'Efficiency';
    return null;
  }

  // A rebuild keeps the list where the player scrolled it (a lock flipping on row 3 must not jump the Infra tab back
  // to the top); only a tab change starts at the top.
  function beginRebuild() {
    const keep = builtTab === tab ? rowsEl.scrollTop : 0;
    builtTab = tab;
    refs = new Map();
    rowsEl.textContent = '';
    // whatever lands under a stationary mouse (the Build tab after an Exit, a new tab) gets a pointerenter it did not
    // ask for; no hover tip until the pointer actually moves
    suppressHover = true;
    cards.hideTip();
    return keep;
  }
  function endRebuild(keep) { if (keep) rowsEl.scrollTop = keep; }

  function renderRows(rows) {
    const visible = rows.filter(r => r.visible);
    const k = visible.map(rowKey).join(';') + `|${tab}|${qty}`;
    if (k !== key) {
      key = k;
      const keep = beginRebuild();
      let section = null;
      for (const r of visible) {
        const s = sectionOf(r);
        if (s && s !== section) { section = s; rowsEl.appendChild(el('h4', null, s)); }
        const ref = makeRow(r);
        refs.set(r.id, ref);
        rowsEl.appendChild(ref.el);
      }
      if (!visible.length) rowsEl.appendChild(el('div', 'empty', 'Nothing to buy here yet.'));
      endRebuild(keep);
    }
    for (const r of visible) { const ref = refs.get(r.id); if (ref) fillRow(ref, r); }
  }

  // ---- contracts ------------------------------------------------------------------------------------------------------
  function factorChips(r) {
    const out = [];
    for (const [k, label] of [['power', 'Power'], ['heat', 'Heat'], ['net', 'Net']]) {
      const v = r[k];
      if (v === 1) continue;
      out.push(el('span', v > 1 ? 'up' : 'down', `${label} ×${v}`));
    }
    if (r.sla != null) out.push(el('span', null, `SLA ${r.sla}`));
    if (r.term && r.term !== data.CONTRACT_RULES.term) out.push(el('span', null, `${Math.round(r.term / 60)} min term`));
    return out;
  }

  function renderContracts(rows) {
    const { run } = sim.state;
    const d = sim.derived;
    const slots = data.STAGES[run.stage - 1].slots;
    const offers = rows.filter(r => r.kind === 'contract');
    const reroll = rows.find(r => r.kind === 'reroll');
    const activeIds = run.contracts.active.map(a => a.id);
    const free = run.contracts.active.length < slots;
    const k = `contracts|${activeIds.join()}|${offers.map(o => `${o.id}:${o.affordable ? 1 : 0}:${o.overdraw ? 1 : 0}`).join()}|${slots}|${reroll?.visible ? 1 : 0}|${reroll?.affordable ? 1 : 0}`;
    if (k !== key) {
      key = k;
      const keep = beginRebuild();
      rowsEl.appendChild(el('h4', null, `Active · ${run.contracts.active.length}/${slots} slot${slots > 1 ? 's' : ''}`));
      for (let i = 0; i < slots; i++) {
        const a = run.contracts.active[i];
        if (!a) { rowsEl.appendChild(el('div', 'slot', 'Empty slot')); continue; }
        const c = data.CONTRACTS.find(x => x.id === a.id);
        const s = el('div', 'slot active');
        s.dataset.id = a.id;
        const ring = el('span', 'ring'), name = el('span', null, c?.name ?? a.id), sla = el('span', 'sla', c?.sla != null ? `SLA ${c.sla}` : ''), term = el('span', 'term');
        s.append(ring, name, sla, term);
        rowsEl.appendChild(s);
        refs.set(`slot:${a.id}`, { el: s, ring, term, sla, c });
      }
      rowsEl.appendChild(el('h4', null, 'Board'));
      if (!offers.length) rowsEl.appendChild(el('div', 'empty', reroll?.visible ? 'No offers right now. The board refills on its own.' : 'The board opens at Rack 2.'));
      for (const o of offers) {
        const card = el('div', 'offer');
        card.dataset.id = o.id;
        const name = el('span', 'on', o.name);
        name.appendChild(el('b', null, `×${o.mult}`));
        const take = el('button', 'take', 'Take');
        take.type = 'button';
        take.id = `take-${o.id}`;
        take.disabled = !o.affordable;
        if (o.locked) take.title = o.locked;
        take.addEventListener('click', () => {
          const res = sim.pickContract(o.id);
          if (res.ok) { audio?.play('register'); update(performance.now(), true); }
          else if (res.text) cards.toast(res.text, 'info', 2500);
        });
        const fx = el('span', 'fx');
        fx.append(...factorChips(o));
        // the gain and the overdraw numbers move with income between rebuilds (an offer lives up to 5 min), so they
        // are refreshed in place below rather than baked in here
        const gain = el('span', 'down', fmtRate(o.addNominal));
        gain.hidden = !(o.addNominal > 0.0005);
        fx.appendChild(gain);
        const line = el('span', 'line', o.flavor);
        card.append(name, take, fx, line);
        const ref = { el: card, gain, over: null, row: o };
        if (o.overdraw) { card.classList.add('over'); ref.over = el('span', 'line', overdrawText(o.overdraw)); card.appendChild(ref.over); }
        attachTooltip(card, () => ref.row.flavor, () => (ref.row.overdraw ? overdrawText(ref.row.overdraw) : ref.row.locked || ''));
        refs.set(`offer:${o.id}`, ref);
        rowsEl.appendChild(card);
      }
      if (reroll && reroll.visible) {
        const ref = makeRow(reroll);
        ref.el.id = 'reroll';
        refs.set('reroll', ref);
        rowsEl.appendChild(ref.el);
      }
      endRebuild(keep);
    }
    for (const a of run.contracts.active) {
      const ref = refs.get(`slot:${a.id}`);
      if (!ref) continue;
      ref.ring.style.setProperty('--p', Math.max(0, Math.min(1, a.termLeft / (ref.c?.term || 600))).toFixed(3));
      ref.term.textContent = fmtTime(a.termLeft);
      const dc = d.contracts.find(x => x.id === a.id);
      const miss = dc && dc.slaOk === false;
      ref.el.classList.toggle('miss', !!miss);
      ref.el.classList.toggle('ok', !!dc && dc.sla != null && dc.slaOk);
      if (ref.c?.sla != null) ref.sla.textContent = miss ? `SLA ${ref.c.sla} missed · pays base` : `SLA ${ref.c.sla}`;
    }
    for (const o of offers) {
      const ref = refs.get(`offer:${o.id}`);
      if (!ref) continue;
      ref.row = o;
      const g = fmtRate(o.addNominal);
      if (ref.gain.textContent !== g) ref.gain.textContent = g;
      const show = o.addNominal > 0.0005;
      if (ref.gain.hidden === show) ref.gain.hidden = !show;
      if (ref.over && o.overdraw) { const t = overdrawText(o.overdraw); if (ref.over.textContent !== t) ref.over.textContent = t; }
    }
    const rr = refs.get('reroll');
    if (rr && reroll) fillRow(rr, { ...reroll, name: 'Reroll the board', badge: `auto in ${reroll.badge}` });
  }

  // ---- exit -------------------------------------------------------------------------------------------------------------
  function renderExit(rows) {
    const p = rows.find(r => r.kind === 'exit');
    if (!p) return;
    const k = `exit|${p.available ? 1 : 0}|${p.glow ? 1 : 0}|${p.gained}|${p.perksUnlocked.map(x => x.shares).join()}`;
    if (k !== key) {
      key = k;
      const keep = beginRebuild();
      const box = el('div', 'exit');
      const kv = (label, id) => { const r = el('div', 'kv'); r.append(el('span', null, label), el('span', null, '')); r.lastChild.id = id; box.appendChild(r); return r.lastChild; };
      refs.set('val', { el: kv('Run valuation', 'exitVal') });
      refs.set('shares', { el: kv('Shares you would get', 'exitShares') });
      refs.set('mult', { el: kv('Income multiplier', 'exitMult') });
      refs.set('est', { el: kv('A run this size, from scratch', 'exitEst') });
      // the one action comes right after the four numbers so it is above the fold at the phone's default snap; the
      // status note, the perks and the hold hint follow it
      const btn = el('button', null);
      btn.id = 'exitBtn';
      btn.type = 'button';
      btn.append(el('i'), el('span', null, 'Exit'));
      btn.classList.toggle('avail', p.available);
      btn.classList.toggle('glow', p.glow);
      btn.setAttribute('aria-label', p.available ? 'Exit: press and hold to sell the company' : 'Exit: locked');
      box.appendChild(btn);
      const note = el('div', 'note');
      note.id = 'exitNote';
      box.appendChild(note);
      if (p.perksUnlocked.length) {
        const ul = el('ul', 'perks');
        ul.appendChild(el('li', null, 'Unlocks:'));
        for (const x of p.perksUnlocked) ul.appendChild(el('li', null, `${fmtNum(x.shares)} share${x.shares > 1 ? 's' : ''}: ${x.text}`));
        box.appendChild(ul);
      }
      box.appendChild(el('div', 'note', 'Hold the button to confirm. Everything in this run resets; shares, milestones and lifetime stats stay.'));
      rowsEl.appendChild(box);
      refs.set('btn', { el: btn, label: btn.lastChild });
      refs.set('note', { el: note });
      wireHold(btn);
      endRebuild(keep);
    }
    // shares print like the tab badge (fmtNum: "+10.3K"), never as a raw integer
    refs.get('val').el.textContent = fmtMoney(p.valuation);
    refs.get('shares').el.textContent = p.available ? `+${fmtNum(p.gained)} (${fmtNum(p.shares)} → ${fmtNum(p.newTotal)})` : `0 (needs ${fmtMoney(data.EXIT.minValuation)})`;
    refs.get('mult').el.textContent = `×${p.currentMult.toFixed(1)} → ×${p.newMult.toFixed(1)}`;
    refs.get('est').el.textContent = `about ${p.estMinutes} min`;
    const note = refs.get('note').el;
    note.textContent = !p.available ? p.locked || `Needs ${fmtMoney(data.EXIT.minValuation)} valuation`
      : !p.glow ? `${p.flavor} Glows at ${fmtNum(p.glowAtShares)} shares (${fmtMoney(p.glowAtValuation)}).`
      : `${fmtNum(p.gained)} share${p.gained > 1 ? 's' : ''} now. ${p.flavor}`;
    const b = refs.get('btn');
    b.label.textContent = p.available ? `Exit for +${fmtNum(p.gained)} share${p.gained > 1 ? 's' : ''}` : 'Exit';
    b.el.title = p.available && !p.glow ? data.EXIT.tooltipAt1M : '';
  }

  // Hold-to-confirm: a 1.2 s press fills the button; letting go early cancels.
  function wireHold(btn) {
    const start = e => {
      if (!btn.classList.contains('avail') || exitHold) return;
      btn.focus();
      try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      exitHold = { t0: performance.now(), raf: 0 };
      const step = now => {
        if (!exitHold) return;
        const k = Math.min(1, (now - exitHold.t0) / (reducedMotion ? 600 : HOLD_MS));
        btn.style.setProperty('--p', k.toFixed(3));
        if (k >= 1) { exitHold = null; btn.style.setProperty('--p', 0); doExit(); return; }
        exitHold.raf = requestAnimationFrame(step);
      };
      exitHold.raf = requestAnimationFrame(step);
    };
    const cancel = () => { if (!exitHold) return; cancelAnimationFrame(exitHold.raf); exitHold = null; btn.style.setProperty('--p', 0); };
    btn.addEventListener('pointerdown', start);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) btn.addEventListener(t, cancel);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (btn.classList.contains('avail')) doExit(); } });
  }
  function doExit() {
    const res = sim.exit();
    if (res.ok) { audio?.play('register'); key = null; setTab('build'); }
    else if (res.text) cards.toast(res.text, 'info', 2500);
  }

  // ---- tooltip: hover (mouse) or long-press (touch) --------------------------------------------------------------------
  // Every hide goes through cards.hideTipLater, which drops a request once a newer tip has been shown (a tap on Hustle
  // and then on a greyed row must not lose the row's reason to Hustle's 900 ms timer).
  rowsEl.addEventListener('pointermove', () => { suppressHover = false; }, { passive: true });
  function centerOf(node) { const r = node.getBoundingClientRect(); return [r.left + r.width / 2, r.top]; }
  function attachTooltip(node, text, extra) {
    let t = null, deferred = false; // deferred: entered while hover tips were suppressed; the first real move arms it
    // the row may have been rebuilt out of the DOM during the hover delay: a tip for a detached node would stick at 6,6
    const show = () => { if (!node.isConnected) return; const s = text(); if (s) cards.showTip(...centerOf(node), s, extra?.() || null); };
    const arm = () => { clearTimeout(t); t = setTimeout(show, 350); };
    // pointerenter lands before the pointermove of the same motion, so a row entered just after a rebuild waits for
    // the move rather than losing its tip until the next leave / enter
    node.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; if (suppressHover) deferred = true; else arm(); });
    node.addEventListener('pointermove', e => { if (deferred && e.pointerType === 'mouse') { deferred = false; arm(); } });
    node.addEventListener('pointerleave', () => { deferred = false; clearTimeout(t); cards.hideTip(); });
    node.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(t);
      // the row may be rebuilt under the finger, so the tip also times itself out
      t = setTimeout(() => { show(); node.dataset.suppress = '1'; cards.hideTipLater(2500); }, LONG_PRESS_MS);
    });
    for (const ev of ['pointerup', 'pointercancel']) node.addEventListener(ev, () => { clearTimeout(t); cards.hideTipLater(900); });
  }
  root.addEventListener('pointerup', () => cards.hideTipLater(900), true);

  // ---- phone drag handle: collapsed / default / expanded ----------------------------------------------------------------
  // The tall snap is 72vh at most, and lower on short phones: the measured HUD minus the top panel, the event toast
  // when one is up, the Hustle row and the ticker, so the row can never land on the meters. The toast column (docked
  // above the row) hides as body.sheetTall once the band left for it is too short, whichever snap the sheet is at.
  const ticker = root.querySelector('#ticker'), ev = root.querySelector('#eventToast');
  // px of HUD height the sheet may take before the Hustle row would touch the panel (or the event toast under it)
  function freePx() {
    const topH = parseFloat(getComputedStyle(root.documentElement).getPropertyValue('--topH')) || 110;
    const evH = ev.hidden ? 0 : ev.offsetHeight + 10;
    return hud.clientHeight - topH - 8 - evH - CENTRE_ROW_PX - ticker.offsetHeight;
  }
  const SNAPS = () => [96, Math.round(innerHeight * SHEET_VH / 100), Math.max(96, Math.min(Math.round(innerHeight * SHEET_TALL_VH / 100), freePx()))];
  const dragLayout = () => handle.offsetParent !== null; // the handle is display:none in the side layout
  function setTall(h) {
    const tall = dragLayout() && freePx() - h < TOASTS_MIN_PX;
    if (root.body.classList.contains('sheetTall') === tall) return;
    root.body.classList.toggle('sheetTall', tall);
    if (!tall) cards.nudge?.(); // strips held for the hidden toast column may show now
  }
  // A resize, a rotation or an event toast arriving moves the cap: a sheet parked above it comes down to it.
  function clampTall() {
    if (!phone || !dragLayout()) { setTall(0); return; }
    const cur = root.documentElement.style.getPropertyValue('--sheet');
    const h = cur.endsWith('px') ? parseFloat(cur) : SNAPS()[1];
    const cap = SNAPS()[2];
    if (h > cap + 1) root.documentElement.style.setProperty('--sheet', `${cap}px`);
    setTall(Math.min(h, cap));
  }
  let drag = null;
  handle.addEventListener('pointerdown', e => {
    drag = { y0: e.clientY, h0: sheet.getBoundingClientRect().height };
    sheet.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return;
    const h = Math.max(SNAPS()[0], Math.min(SNAPS()[2], drag.h0 + (drag.y0 - e.clientY)));
    root.documentElement.style.setProperty('--sheet', `${h}px`);
    setTall(h);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    sheet.classList.remove('dragging');
    const h = sheet.getBoundingClientRect().height;
    const snap = SNAPS().reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
    root.documentElement.style.setProperty('--sheet', snap === SNAPS()[1] ? `${SHEET_VH}vh` : `${snap}px`);
    setTall(snap);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // ---- the Refresh hint (§3): a line in the sheet head, next to the ×1 / ×10 / Max toggle it refers to, in both ------
  // layouts (a pill over the hall sat on the front row's lower slots on desktop and on the whole hall band on phones)
  let phone = null;
  function relayout() {
    phone = isPhone(root);
    clampTall();
  }
  relayout();
  // The hint reads "nothing to swap" when every server's next tier belongs to a later stage (the sim's planSwap skips
  // those), instead of inviting a tap that does nothing.
  function anySwappable() {
    const { run } = sim.state;
    const idx = new Map(data.TIERS.map((t, i) => [t.id, i]));
    for (const rack of run.racks) for (const id of rack.servers) {
      const next = id ? data.TIERS[idx.get(id) + 1] : null;
      if (next && next.stage <= run.stage) return true;
    }
    return false;
  }
  function hintText() {
    if (!anySwappable()) return 'Refresh: nothing to swap up until the next stage';
    return qty === 10 || qty === 'max' ? 'Refresh ×10: tap a rack, 10 swaps across its row, lowest tier first'
      : 'Refresh: tap a rack to swap its lowest tier up · ×10 / Max = 10 swaps';
  }

  // ---- per-tick ---------------------------------------------------------------------------------------------------------
  function update(now, force = false) {
    if (!force && now - lastAt < REFRESH_MS) return;
    lastAt = now;
    if (!drag) clampTall(); // the event toast (or the panel's height) may have changed since the last drag
    const { run } = sim.state;
    const st = data.STAGES[run.stage - 1];
    const t = `${st.short} · ${run.racks.length}/${st.footprints.length} racks`;
    if (title.textContent !== t) title.textContent = t;
    if (hl && now >= hlUntil) hl = null;
    const rows = sim.shopRows(tab, qty);
    if (tab === 'contracts') renderContracts(rows);
    else if (tab === 'exit') renderExit(rows);
    else renderRows(rows);
    if (force || now - badgesAt >= BADGES_MS) { badgesAt = now; updateTabBadges(rows); }
    const showHint = refreshAvail && tab === 'build';
    if (hint.hidden === showHint) hint.hidden = !showHint;
    if (showHint) { const h = hintText(); if (hint.textContent !== h) hint.textContent = h; }
  }

  function updateTabBadges(current) {
    for (const t of TABS) {
      const rows = t === tab ? current : sim.shopRows(t, 1);
      const n = tabBtns[t].querySelector('.n');
      let text = '';
      if (t === 'exit') { const p = rows[0]; text = p?.available ? `+${fmtNum(p.gained)}` : ''; tabBtns[t].classList.toggle('glow', !!p?.glow); }
      else if (t === 'contracts') { const free = rows.some(r => r.kind === 'contract' && r.affordable); text = free ? String(rows.filter(r => r.kind === 'contract').length) : ''; }
      else text = String(rows.filter(r => r.visible && r.affordable && !r.locked).length || '');
      if (n.textContent !== text) n.textContent = text;
    }
  }

  function highlight(meter) {
    hl = meter; hlUntil = performance.now() + 6000; hlScroll = true;
    setTab('infra');
  }

  return {
    update, setTab, highlight, relayout,
    get tab() { return tab; },
    get qty() { return qty; },
    get refreshQty() { return qty === 10 || qty === 'max' ? 10 : 1; },
    setRefreshAvailable(v) { refreshAvail = !!v; update(performance.now(), true); },
    invalidate() { key = null; },
    element: sheet,
  };
}
