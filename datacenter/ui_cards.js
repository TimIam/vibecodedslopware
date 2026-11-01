// ui_cards.js — the transient layer of the HUD (§17): toasts and the toast log, the event toast with its ring and
// Fix button, cards (milestone, offline return), the breaker overlay, banners (exit cinematic, Make Me a Million,
// You Are the Cloud), the long-press/hover tooltip and the pooled money pops. Everything here is plain DOM; nothing
// reads the sim except what the caller hands in.

import { fmtMoney } from './util.js';

const $ = (root, sel) => root.querySelector(sel);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// index.html sets two flags in the same media queries that move the panels, so the JS never guesses from the width:
// --layout 'sheet' (bottom sheet) | 'side' (right panel: desktop and landscape phones), and --phone 1 under 900 px
// (compact milestone strip, the Refresh hint in the sheet head) | 0 on desktop.
const cssVar = (root, name) => { try { return getComputedStyle(root.documentElement).getPropertyValue(name).trim(); } catch { return ''; } };
export const layoutOf = (root = document) => (cssVar(root, '--layout') === 'side' ? 'side' : 'sheet');
export const isPhone = (root = document) => cssVar(root, '--phone') !== '0';

export function createCards({ root = document, reducedMotion = false } = {}) {
  const toasts = $(root, '#toasts'), log = $(root, '#log'), cards = $(root, '#cards');
  const ev = $(root, '#eventToast'), evRing = ev.querySelector('.ring'), evText = ev.querySelector('.et'), evFix = ev.querySelector('.fix');
  const banner = $(root, '#banner'), breaker = $(root, '#breaker'), tip = $(root, '#tip'), pops = $(root, '#pops');
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, reducedMotion ? Math.min(ms, 1500) : ms); timers.add(t); return t; };

  // ---- toasts -------------------------------------------------------------------------------------------
  const MAX_TOASTS = 3, MAX_LOG = 8;
  function logLine(text, kind) {
    log.prepend(el('div', kind, text));
    while (log.children.length > MAX_LOG) log.lastChild.remove();
  }
  function toast(text, kind = 'info', ms = 4000) {
    if (!text) return;
    // the sim toasts an event's text as it starts; the event toast already shows it, so that one is log only
    if (kind === 'event' && evState && (evState.baseText === text || evText.textContent === text)) { logLine(text, kind); return; }
    const t = el('div', `toast panel ${kind}`, text);
    toasts.appendChild(t);
    const old = [...toasts.children].filter(c => c.classList.contains('toast')); // a milestone card may head the column
    while (old.length > MAX_TOASTS) old.shift().remove();
    later(() => { t.classList.add('out'); later(() => t.remove(), 450); }, ms);
    logLine(text, kind);
  }

  // ---- event toast (§8, §17): ring = time left, Fix = the one in-event action that applies ----------------
  // `suffix` spells out the bonus state ("Headroom held: income ×1.5.") after the event's own text.
  let evState = null; // { id, duration, baseText, onFix }
  function showEvent({ id, text, duration, bonus }, { fixLabel = null, onFix = null, suffix = '' } = {}) {
    evState = { id, duration: duration || 1, baseText: text || id, onFix };
    evText.textContent = (text || id) + (suffix || '');
    ev.classList.toggle('bonus', !!bonus);
    evFix.hidden = !onFix;
    evFix.textContent = fixLabel || 'Fix';
    ev.hidden = false;
    root.body.classList.add('eventOn');
  }
  function updateEvent(run) {
    if (!evState) return;
    const e = run?.event;
    if (!e || e.id !== evState.id) { hideEvent(); return; }
    evRing.style.setProperty('--p', Math.max(0, Math.min(1, e.tLeft / evState.duration)).toFixed(3));
  }
  function setFixLabel(label) { if (label) evFix.textContent = label; }
  function hideEvent() { evState = null; ev.hidden = true; root.body.classList.remove('eventOn'); }
  evFix.addEventListener('click', () => { evState?.onFix?.(); });

  // ---- cards: one at a time, queued. Phone: a milestone card is a strip at the bottom of the toast column (the
  // hall and the shop stay visible: the LEDs booting and the Civic leaving are the show). Desktop: the §17 centre
  // card. The offline return card takes the centre everywhere. Every card waits while a banner (the exit cinematic,
  // Make Me a Million) or the BREAKER overlay owns the centre; a strip bound for the toast column also waits while
  // the phone sheet is at its tall snap (the column is hidden there). hideBanner / setBreaker(false) / the sheet's
  // nudge() pump again.
  const queue = [];
  let showing = null; // { card, close, ms, timer }: the card on screen and its auto-hide
  // onClose runs once whichever way the card leaves (its button, the auto-hide, the queue moving on).
  function enqueue(build, ms, where = cards, onClose = null) { queue.push({ build, ms, where, onClose }); pump(); }
  function pump() {
    if (showing || !queue.length) return;
    if (!banner.hidden || !breaker.hidden) return;
    if (root.body.classList.contains('settingsOn')) return; // the settings sheet covers the centre; setCovered(false) pumps
    if (queue[0].where === toasts && root.body.classList.contains('sheetTall')) return;
    const { build, ms, where, onClose } = queue.shift();
    const card = build(close);
    // a burst of milestones (a dev give, an import) should not hold the screen for a minute
    const cur = { card, close, ms: ms ? (queue.length ? Math.min(ms, 2500) : ms) : 0, timer: null };
    showing = cur;
    if (where === toasts) toasts.prepend(card); else where.appendChild(card);
    arm(cur);
    function close() {
      if (showing !== cur) return;
      disarm(cur);
      card.remove();
      showing = null;
      try { onClose?.(); } catch (e) { console.warn('card onClose failed:', e?.message ?? e); }
      pump();
    }
    return card;
  }
  // The auto-hide pauses while the card is hidden under the BREAKER overlay, so the blackout does not eat its time.
  function arm(cur) { if (cur.ms && !cur.timer) cur.timer = later(() => { cur.timer = null; cur.close(); }, cur.ms); }
  function disarm(cur) { if (cur.timer) { clearTimeout(cur.timer); timers.delete(cur.timer); cur.timer = null; } }
  // Closes the card on screen (an Exit ends the run its card belonged to); queued cards wait for the banner as usual.
  function dismiss() { showing?.close(); }

  // The card follows the moment by a beat (the Civic backs out, the rack thuds, the LEDs boot) instead of landing on it.
  const MILESTONE_DELAY_MS = 1200;
  function milestone({ name, text, screenshot }, { onPhoto = null } = {}) {
    const build = close => {
      const c = el('div', 'card panel milestone');
      c.appendChild(el('div', 'kicker', 'Milestone · +1% income'));
      c.appendChild(el('h2', null, name));
      c.appendChild(el('p', null, text || ''));
      const actions = el('div', 'actions');
      if (screenshot && onPhoto) {
        const b = el('button', 'btn primary', '📷 Save a photo');
        b.id = 'msPhoto';
        b.addEventListener('click', e => { e.stopPropagation(); onPhoto(); close(); });
        actions.appendChild(b);
      }
      const ok = el('button', 'btn', 'Nice');
      ok.addEventListener('click', e => { e.stopPropagation(); close(); });
      actions.appendChild(ok);
      c.appendChild(actions);
      return c;
    };
    later(() => {
      // §17: the phone strip shows the name only, so the flavour line goes to the log (the log keeps it on desktop too);
      // logged even while the strip itself waits for the hidden toast column
      logLine(text ? `${name}: ${text}` : name, 'good');
      enqueue(build, screenshot ? 12000 : 5000, isPhone(root) ? toasts : cards);
    }, MILESTONE_DELAY_MS);
  }

  // §11: the number counts up over countUpS seconds; the caller spawns nothing, the sim already queued the incidents.
  // onClose fires when "Back to work" dismisses the card (ui.js passes sim.offlineAck, which lands the three incidents).
  function offline(summary, { countUpS = 2, onClose = null } = {}) {
    enqueue(close => {
      const c = el('div', 'card panel offline');
      c.id = 'offlineCard';
      c.appendChild(el('div', 'kicker', 'While you were away'));
      const big = el('div', 'big', fmtMoney(0));
      c.appendChild(big);
      const rest = (summary.text || '').replace(/^While you were away: \+\S+ in /, 'Away for ');
      c.appendChild(el('p', null, rest));
      const ok = el('button', 'btn primary', 'Back to work');
      ok.addEventListener('click', close);
      c.appendChild(ok);
      const t0 = performance.now(), ms = reducedMotion ? 1 : countUpS * 1000;
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        big.textContent = '+' + fmtMoney(summary.earn * (1 - (1 - k) ** 3));
        if (k < 1 && c.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      return c;
    }, 0, cards, onClose);
  }

  // ---- overlays and banners ---------------------------------------------------------------------------------
  // body.breakerOn hides a card already on screen under the blackout text; queued ones wait in pump().
  function setBreaker(on) {
    breaker.hidden = !on;
    root.body.classList.toggle('breakerOn', !!on);
    if (showing) (on ? disarm : arm)(showing);
    if (!on) pump();
  }
  // Another panel (the settings sheet, body.settingsOn) covers the centre: the card on screen is hidden by CSS and its
  // auto-hide pauses, queued cards wait; both resume when the cover lifts.
  function setCovered(on) {
    if (showing) (on ? disarm : arm)(showing);
    if (!on) pump();
  }

  // showBanner(title, sub, { ms, sticky, buttons, delayMs }). `buttons` = [{ label, primary, onClick }], each closes
  // the banner when pressed; `sticky` adds a "Keep going" button and, unless `ms` is given, no auto-hide. body.bannerOn
  // lets the CSS keep the toast column and centre card clear of it.
  let bannerTimer = null, bannerDelay = null;
  function showBanner(title, sub = '', { ms = null, sticky = false, buttons = null, delayMs = 0 } = {}) {
    if (bannerDelay) { clearTimeout(bannerDelay); timers.delete(bannerDelay); bannerDelay = null; }
    if (delayMs > 0) { bannerDelay = later(() => { bannerDelay = null; showBanner(title, sub, { ms, sticky, buttons }); }, delayMs); return; }
    banner.querySelector('h2').textContent = title;
    banner.querySelector('p').textContent = sub;
    const actions = banner.querySelector('.actions');
    actions.textContent = '';
    for (const b of buttons ?? (sticky ? [{ label: 'Keep going' }] : [])) {
      const btn = el('button', `btn${b.primary ? ' primary' : ''}`, b.label);
      btn.addEventListener('click', e => { e.stopPropagation(); hideBanner(); b.onClick?.(); });
      actions.appendChild(btn);
    }
    banner.hidden = false;
    root.body.classList.add('bannerOn');
    if (bannerTimer) { clearTimeout(bannerTimer); timers.delete(bannerTimer); bannerTimer = null; }
    const autoMs = ms ?? (sticky ? 0 : 5000);
    if (autoMs > 0) bannerTimer = later(hideBanner, autoMs);
  }
  function hideBanner() {
    banner.hidden = true;
    root.body.classList.remove('bannerOn');
    if (bannerTimer) { clearTimeout(bannerTimer); timers.delete(bannerTimer); bannerTimer = null; }
    pump();
  }

  // ---- tooltip: hover on desktop, long-press on touch ----------------------------------------------------------
  // The hide timer lives here, generation-stamped: every pointerup on the page asks for a hide 900 ms out, and a tip
  // shown after that request (a locked row's reason, "Need $X") must not be closed by it. showTip / hideTip bump the
  // generation, so only a hideTipLater() asked for the tip now on screen ever fires.
  let tipTimer = null, tipGen = 0;
  function showTip(x, y, text, extra = null) {
    clearTimeout(tipTimer); tipTimer = null; tipGen++;
    tip.textContent = '';
    tip.appendChild(document.createTextNode(text));
    if (extra) tip.appendChild(el('span', 'ov', extra));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, x - w / 2))}px`;
    tip.style.top = `${Math.max(6, y - h - 12)}px`;
  }
  function hideTip() { clearTimeout(tipTimer); tipTimer = null; tipGen++; tip.hidden = true; }
  function hideTipLater(ms) {
    const g = tipGen;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tipTimer = null; if (g === tipGen) hideTip(); }, ms);
  }

  // ---- money pops: pooled divs at the point the caller gives (scene.project(rack) or a button) ----------------
  const POOL = 24;
  const pool = [];
  function pop(text, x, y, kind = '') {
    let p = pool.find(d => !d.classList.contains('on'));
    if (!p) {
      if (pool.length >= POOL) { p = pool.shift(); pool.push(p); p.classList.remove('on'); }
      else { p = el('div', 'pop'); p.addEventListener('animationend', () => p.classList.remove('on')); pops.appendChild(p); pool.push(p); }
    }
    p.textContent = text;
    p.className = `pop ${kind}`;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    // restart the CSS animation even when the same div is reused back to back
    void p.offsetWidth;
    p.classList.add('on');
    if (reducedMotion) later(() => p.classList.remove('on'), 900);
  }

  function dispose() { for (const t of timers) clearTimeout(t); timers.clear(); clearTimeout(tipTimer); }

  return { toast, showEvent, updateEvent, hideEvent, setFixLabel, milestone, offline, dismiss, nudge: pump, setBreaker, setCovered, showBanner, hideBanner, showTip, hideTip, hideTipLater, pop, dispose,
    get busy() { return !!showing; }, get bannerOn() { return !banner.hidden; } };
}
