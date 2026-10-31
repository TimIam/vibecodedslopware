// The page around the game screen: a Mac OS menu bar (the original's MENU 128..130 plus a View menu),
// on-screen touch controls for phones and tablets, and the screen size / scaling filter settings.

import { Prefs } from './game/state.js';
import { Input, UIState } from './core/input.js';
import { UIScale } from './core/qd.js';
import { register, Hooks } from './game/hooks.js';
import { postCommand, commandEnabled } from './game/commands.js';
import { Game } from './game/game.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- menu bar
// Shortcuts the browser lets a page take (Cmd/Ctrl + N, W, Q belong to the browser)
const SHORTCUTS = { s: 'save', o: 'restore', m: 'music', f: 'sound', i: 'options', p: 'pause' };
const sc = (k) => (IS_MAC ? '⌘' : 'Ctrl+') + k.toUpperCase();

// the Apple menu shows Harry's own application icon (icl8 128)
const APPLE_ICON = '<img src="img/harry-icon.png" width="18" height="18" alt="">';

const sep = { sep: true };
const MENUS = [
  { title: APPLE_ICON, label: 'Harry', items: [
    { label: 'About Harry the Handsome Executive…', cmd: 'about' },
    { label: 'Instructions…', cmd: 'instructions' },
  ] },
  { title: 'File', items: [
    { label: 'New Game', cmd: 'new' },
    sep,
    { label: 'Abort Game', cmd: 'abort', key: 'Esc' },
    sep,
    { label: 'Save Game…', cmd: 'save', key: sc('s') },
    { label: 'Save From Last Checkpoint…', cmd: 'saveCheckpoint' },
    { label: 'Restore Game…', cmd: 'restore', key: sc('o') },
    sep,
    { label: 'Quit', cmd: 'quit' },
  ] },
  { title: 'Game', items: [
    { label: 'Music', cmd: 'music', key: sc('m'), check: () => Prefs.music },
    { label: 'Sound Effects', cmd: 'sound', key: sc('f'), check: () => !Prefs.soundOff },
    sep,
    { label: () => (UIState.paused ? 'Resume' : 'Pause'), cmd: 'pause', key: sc('p') },
    { label: 'Show Map', cmd: 'map', key: 'Tab' },
    sep,
    { label: 'Options…', cmd: 'options', key: sc('i') },
  ] },
  { title: 'View', items: [
    { label: 'Actual Size (1:1)', set: ['scale', 1] },
    { label: 'Double Size (1:2)', set: ['scale', 2] },
    { label: 'Fill Window', set: ['scale', 'fit'] },
    sep,
    { label: 'Sharp Pixels', set: ['filter', 'nearest'] },
    { label: 'Sharp, Smoothed Edges', set: ['filter', 'sharp'] },
    { label: 'Smooth (Bilinear)', set: ['filter', 'smooth'] },
    sep,
    { label: 'Smooth Text', toggle: 'smoothText' },
    { label: 'Touch Controls: Automatic', set: ['touch', 'auto'] },
    { label: 'Touch Controls: Always', set: ['touch', 'on'] },
    { label: 'Touch Controls: Never', set: ['touch', 'off'] },
    { label: 'Touch Controls Over Screen', set: ['touchLayout', 'overlay'] },
    { label: 'Touch Controls Beside Screen', set: ['touchLayout', 'beside'] },
    sep,
    { label: () => (document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen'), action: toggleFullscreen,
      enabled: () => !!document.fullscreenEnabled },
  ] },
];

let openMenu = -1, hoverOpened = 0;

function itemState(it) {
  const label = typeof it.label === 'function' ? it.label() : it.label;
  let checked = false, enabled = true;
  if (it.check) checked = it.check();
  if (it.set) checked = Prefs[it.set[0]] === it.set[1];
  if (it.toggle) checked = !!Prefs[it.toggle];
  if (it.cmd) enabled = Game.display ? commandEnabled(it.cmd) : false;
  if (it.enabled) enabled = it.enabled();
  return { label, checked, enabled };
}

function runItem(it) {
  if (it.cmd) postCommand(it.cmd);
  else if (it.set) { Prefs[it.set[0]] = it.set[1]; Hooks.savePrefs(); Hooks.applyPrefs(); }
  else if (it.toggle) { Prefs[it.toggle] = !Prefs[it.toggle]; Hooks.savePrefs(); Hooks.applyPrefs(); }
  else if (it.action) it.action();
}

function buildMenuBar() {
  const bar = $('#menubar');
  MENUS.forEach((m, i) => {
    const t = document.createElement('div');
    t.className = 'mtitle';
    t.innerHTML = m.title;
    t.setAttribute('role', 'menuitem');
    t.setAttribute('aria-label', m.label || m.title);
    t.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (openMenu === i && performance.now() - hoverOpened > 400) showMenu(-1);
      else showMenu(i);
    });
    t.addEventListener('pointerenter', (e) => {
      if (openMenu >= 0 && openMenu !== i && e.pointerType === 'mouse') { showMenu(i); hoverOpened = performance.now(); }
    });
    m.el = t;
    bar.appendChild(t);
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#menubar, .mdrop')) showMenu(-1); });
  window.addEventListener('blur', () => showMenu(-1));
  window.addEventListener('keydown', (e) => { if (openMenu >= 0 && e.key === 'Escape') { showMenu(-1); e.stopPropagation(); } }, true);
}

function showMenu(i) {
  document.querySelectorAll('.mdrop').forEach((d) => d.remove());
  MENUS.forEach((m) => m.el.classList.remove('open'));
  openMenu = i;
  if (i < 0) return;
  const m = MENUS[i];
  m.el.classList.add('open');
  const drop = document.createElement('div');
  drop.className = 'mdrop';
  drop.setAttribute('role', 'menu');
  for (const it of m.items) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'msep'; drop.appendChild(s); continue; }
    const st = itemState(it);
    const row = document.createElement('div');
    row.className = 'mitem' + (st.enabled ? '' : ' disabled');
    row.setAttribute('role', 'menuitem');
    row.innerHTML = `<span class="mcheck">${st.checked ? '✓' : ''}</span><span class="mlabel"></span><span class="mkey"></span>`;
    row.querySelector('.mlabel').textContent = st.label;
    row.querySelector('.mkey').textContent = it.key || '';
    if (st.enabled) {
      row.addEventListener('pointerup', (e) => { e.preventDefault(); showMenu(-1); runItem(it); refocus(); });
    }
    drop.appendChild(row);
  }
  document.body.appendChild(drop);
  const r = m.el.getBoundingClientRect();
  drop.style.top = r.bottom + 'px';
  drop.style.left = Math.max(0, Math.min(r.left, window.innerWidth - drop.offsetWidth)) + 'px';
}

function refocus() { const c = $('#screen'); if (c) c.focus({ preventScroll: true }); }

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#app').requestFullscreen().then(refocus).catch(() => {});
}

// ---------------------------------------------------------------- touch controls
// Each pointer holds the action of the button under it, so a thumb can slide across the pad.
const held = new Map(); // pointerId -> action
function updateActions() {
  Input.actions.clear();
  for (const a of held.values()) if (a) Input.actions.add(a);
  document.querySelectorAll('[data-action]').forEach((b) => b.classList.toggle('down', Input.actions.has(b.dataset.action)));
}
function actionAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const b = el && el.closest('[data-action]');
  return b ? b.dataset.action : null;
}
function initTouch() {
  for (const pad of document.querySelectorAll('.pad')) {
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const tap = e.target.closest('[data-tap]');
      if (tap) { tapCommand(tap.dataset.tap); return; }
      held.set(e.pointerId, actionAt(e.clientX, e.clientY));
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      updateActions();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!held.has(e.pointerId)) return;
      held.set(e.pointerId, actionAt(e.clientX, e.clientY));
      updateActions();
    });
    const end = (e) => { if (held.delete(e.pointerId)) updateActions(); };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
function tapCommand(name) {
  if (name === 'pause') postCommand('pause');
  else if (name === 'esc') { // like pressing Escape: cancels dialogs, asks to abort a game
    Input.pushKey({ mac: 0x35, key: 'Escape' });
    if (UIState.inGame && !UIState.modal) postCommand('abort');
  } else if (name === 'enter') Input.pushKey({ mac: 0x24, key: 'Enter' });
}

function touchWanted() {
  if (Prefs.touch === 'on') return true;
  if (Prefs.touch === 'off') return false;
  return matchMedia('(pointer: coarse)').matches;
}

// ---------------------------------------------------------------- layout / scaling
function layout() {
  const app = $('#app'), main = $('#main'), stage = $('#stage');
  const touch = touchWanted(), overlay = touch && Prefs.touchLayout !== 'beside';
  app.classList.toggle('touch', touch);
  app.classList.toggle('overlay', overlay);
  const W = main.clientWidth, H = main.clientHeight;
  const landscape = W > H;
  app.classList.toggle('portrait', touch && !landscape);
  // touch button size: fits a thumb, shrinks on very small screens
  app.style.setProperty('--cell', Math.round(Math.min(62, Math.max(40, Math.min(W, H) * 0.13))) + 'px');
  let availW = W, availH = H;
  if (touch && !overlay) {
    const padW = Math.round(Math.min(200, Math.max(150, W * 0.19))), padH = Math.round(Math.min(260, Math.max(200, H * 0.36)));
    app.style.setProperty('--padw', padW + 'px');
    app.style.setProperty('--padh', padH + 'px');
    if (landscape) availW = W - 2 * padW;
    else availH = H - padH;
  }
  const fitW = Math.max(160, Math.min(availW, availH * 4 / 3));
  // (1:1 and 1:2 shrink to fit a smaller window)
  const w = Prefs.scale === 'fit' ? fitW : Math.min(640 * Prefs.scale, fitW);
  const dpr = window.devicePixelRatio || 1;
  stage.style.width = Math.floor(w) + 'px';
  stage.style.height = Math.floor(w * 3 / 4) + 'px';
  // With see-through touch controls and room to spare vertically (portrait, squarish screens): centre the
  // screen in the space above the controls if it fits there, otherwise push it up under the menu bar.
  let top = null;
  if (overlay) {
    const stageH = Math.floor(w * 3 / 4);
    const free = H - Math.max($('#padL').offsetHeight, $('#padR').offsetHeight);
    if (stageH <= free) top = Math.floor((free - stageH) / 2);
    else if (stageH < H) top = 0;
  }
  stage.style.alignSelf = top === null ? '' : 'start';
  stage.style.marginTop = top === null ? '' : top + 'px';
  const canvas = $('#screen');
  canvas.style.imageRendering = Prefs.filter === 'nearest' ? 'pixelated' : 'auto';
  if (Game.display) Game.display.setBackingScale(Prefs.filter === 'sharp' ? Math.ceil((w * dpr) / 640) : 1);
}

export function applyDisplayPrefs() { layout(); }

export function initShell() {
  buildMenuBar();
  initTouch();
  Input.onShortcut = (key) => {
    const cmd = SHORTCUTS[key];
    if (!cmd) return false;
    if (commandEnabled(cmd) || cmd === 'music' || cmd === 'sound') postCommand(cmd);
    return true;
  };
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe($('#main'));
  // dialogs enlarge themselves when the screen is shown small: measured when they open
  Object.defineProperty(UIScale, 'css', { get: () => $('#stage').getBoundingClientRect().width / 640 || 1 });
  document.addEventListener('fullscreenchange', layout);
  matchMedia('(pointer: coarse)').addEventListener?.('change', layout);
  // pause when the page is hidden (switching apps on a phone)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && UIState.inGame && !UIState.paused && !Input.capsLock) postCommand('pause');
  });
  // the original hid the cursor while playing (HideCursorSafe) and showed it for menus and dialogs
  setInterval(() => {
    $('#screen').classList.toggle('nocursor', UIState.inGame && !UIState.paused && UIState.modal === 0 && openMenu < 0);
  }, 200);
  layout();
}

register({ applyDisplayPrefs });
