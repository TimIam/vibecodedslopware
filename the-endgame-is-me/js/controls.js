// Bindings for the keyboard and the controller, which of the two was touched last, and the gamepad poll. Nothing in here
// touches the page; main.js reads it once per frame and menu.js shows it in the Controls panel. Saved as
// bosshours.controls.

import { SLOT_KEYS, KEY_HINT } from './world.js';

const KEY = 'bosshours.controls';
export const SLOTS = ['slot0', 'slot1', 'slot2', 'slot3', 'slot4'];
export const MOVES = ['up', 'down', 'left', 'right'];
// each role sits on one stick only: giving a stick the other's role swaps them
export const STICK_ROLES = { move: 'Move', tank: 'Turn and walk', aim: 'Face' };

// keyboard: one key per action. The arrows and F are spare ways in that only count while nothing else is bound to them
export const KB_DEFAULT = { slot0: 'KeyJ', slot1: 'KeyK', slot2: 'KeyQ', slot3: 'KeyE', slot4: 'KeyR', space: 'Space', up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' };
const KB_SPARE = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyF: 'slot1' };
// the menus and the game need these, so nothing can be bound to them
const KB_RESERVED = /^(Escape|Tab|Enter|NumpadEnter|KeyP|KeyM|F\d+|Meta|OS|Context|Alt|Control)/;

// controller: standard-mapping button numbers. Swipe and Fire Breath (slots 1 and 2) on the triggers (L2, R2), slots
// 3 and 4 on the bumpers (L1, R1), slot 5 on the right stick click; Roar / Shake on the left stick click
export const PAD_DEFAULT = { slot0: 6, slot1: 7, slot2: 4, slot3: 5, slot4: 11, space: 10, pause: 9 };
export const STICK_DEFAULT = { left: 'move', right: 'aim' };
// what the defaults were before (v19 and older, then v20): a save still on exactly one of these moves to the new ones
const PAD_OLD = [{ slot0: 10, slot1: 11, slot2: 5, slot3: 4, slot4: 7, space: 0, pause: 9 }, { slot0: 4, slot1: 5, slot2: 6, slot3: 10, slot4: 7, space: 0, pause: 9 }];
// (shoulders as L1/R1 and triggers as L2/R2, the way the Steam Deck marks them)
export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const PAD_SHORT = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'SEL', 'STA', 'L3', 'R3', 'DU', 'DD', 'DL', 'DR', 'HM'];
export const PAD_SELECT = 8, PAD_A = 0, PAD_B = 1;   // Select is always fullscreen; A and B always pick and go back in menus
const DPAD = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DEAD = 0.2;

// mode is only which one was used last (for the labels and for where the boss looks): both always work
const state = { mode: 'keyboard', kb: { ...KB_DEFAULT }, pad: { ...PAD_DEFAULT }, sticks: { ...STICK_DEFAULT } };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (s.mode === 'pad' || s.mode === 'keyboard') state.mode = s.mode;
  for (const a in KB_DEFAULT) if (typeof s.kb?.[a] === 'string' && !KB_RESERVED.test(s.kb[a])) state.kb[a] = s.kb[a];
  const old = (s.v || 1) < 2;
  const oldPad = (s.v || 1) < 3 && s.pad && PAD_OLD.some(o => Object.keys(o).every(a => s.pad[a] === o[a]));
  if (!oldPad) for (const a in PAD_DEFAULT) if (Number.isInteger(s.pad?.[a]) && s.pad[a] >= 0 && s.pad[a] < 17 && s.pad[a] !== PAD_SELECT) state.pad[a] = s.pad[a];
  const oldSticks = old && (!s.sticks || (s.sticks.left === 'move' && s.sticks.right === 'tank'));
  if (!oldSticks) for (const k in STICK_DEFAULT) if (STICK_ROLES[s.sticks?.[k]]) state.sticks[k] = s.sticks[k];
  if (state.sticks.left === state.sticks.right) state.sticks = { ...STICK_DEFAULT };
} catch {}

const listeners = new Set();
function changed() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 3, ...state })); } catch {}
  rebuild();
  for (const f of listeners) f();
}

// ------------------------------------------------------------------------------------------------ names

export function keyName(code) {
  if (!code) return '-';
  if (/^Key.$/.test(code)) return code.slice(3);
  if (/^Digit.$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  if (/^Arrow/.test(code)) return code.slice(5);
  const m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (m) return `${m[2]} ${m[1]}`;
  return { Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps', Backspace: 'Backspace' }[code] || code;
}
// three letters at most, in the pixel font's alphabet, for the slot boxes on the HUD
function keyShort(code) {
  if (code === 'Space') return 'SPC';
  const n = keyName(code).toUpperCase();
  if (n.length <= 3) return n;
  if (/^NUM /.test(n)) return 'N' + n.slice(4, 6);
  if (/ (SHIFT|CONTROL|ALT)$/.test(n)) return n[0] + n.split(' ')[1].slice(0, 2);
  return n.slice(0, 3);
}
export const padName = i => PAD_NAMES[i] ?? `Button ${i}`;

// what each slot (and Space) is called right now, short for the HUD and long for the menus
export function slotLabel(i, long = false) {
  const a = SLOTS[i];
  if (state.mode === 'pad') return long ? padName(state.pad[a]) : PAD_SHORT[state.pad[a]] ?? String(state.pad[a]);
  const mouse = ['LMB', 'RMB'][i];
  if (!long) return mouse || keyShort(state.kb[a]);
  return mouse ? `${mouse} / ${keyName(state.kb[a])}` : keyName(state.kb[a]);
}
export function spaceLabel(long = false) {
  if (state.mode === 'pad') return long ? padName(state.pad.space) : PAD_SHORT[state.pad.space];
  return long ? keyName(state.kb.space) : keyShort(state.kb.space);
}

// ------------------------------------------------------------------------------------------------ keyboard

let codeToAction = {};
function rebuild() {
  codeToAction = {};
  for (const [code, a] of Object.entries(KB_SPARE)) codeToAction[code] = a;
  for (const [a, code] of Object.entries(state.kb)) codeToAction[code] = a;   // a bound key beats a spare one
  // the HUD reads these straight out of world.js
  for (let i = 0; i < 5; i++) SLOT_KEYS[i] = slotLabel(i);
  KEY_HINT.space = spaceLabel(); KEY_HINT.shake = spaceLabel(true).toUpperCase();
}
rebuild();
export const keyAction = code => codeToAction[code];

// binding a key that is already taken swaps the two, so nothing is ever left unbound by accident
export function bindKey(action, code) {
  if (KB_RESERVED.test(code)) return false;
  const other = Object.keys(state.kb).find(a => state.kb[a] === code);
  if (other && other !== action) state.kb[other] = state.kb[action];
  state.kb[action] = code;
  changed();
  return true;
}
export function bindPad(action, button) {
  if (button === PAD_SELECT || button === 16) return false;
  const other = Object.keys(state.pad).find(a => state.pad[a] === button);
  if (other && other !== action) state.pad[other] = state.pad[action];
  state.pad[action] = button;
  changed();
  return true;
}
export function setStick(stick, role) {
  if (!STICK_ROLES[role]) return;
  const other = stick === 'left' ? 'right' : 'left';
  if (state.sticks[other] === role) state.sticks[other] = state.sticks[stick];
  state.sticks[stick] = role;
  changed();
}
export function resetKeys() { state.kb = { ...KB_DEFAULT }; changed(); }
export function resetPad() { state.pad = { ...PAD_DEFAULT }; state.sticks = { ...STICK_DEFAULT }; changed(); }
// whichever was touched last: the labels follow it, and so does where the boss looks (the mouse, or the sticks)
export function setMode(m) {
  if ((m !== 'pad' && m !== 'keyboard') || m === state.mode) return;
  state.mode = m;
  changed();
}
export const onChange = f => listeners.add(f);

// ------------------------------------------------------------------------------------------------ the gamepad

// one pad at a time: the first one with the standard layout, otherwise the first one at all
const pad = {
  connected: false, id: '', frame: 0,
  down: new Uint8Array(17), was: new Uint8Array(17),
  axes: new Float32Array(4),
};
const deadzone = (x, y) => {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;   // rescaled so just past the deadzone is just above zero
  return [x * k, y * k];
};
export function poll() {
  pad.frame++;
  pad.was.set(pad.down);
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of list) if (p && p.connected && (!gp || (p.mapping === 'standard' && gp.mapping !== 'standard'))) gp = p;
  pad.connected = !!gp;
  if (!gp) { pad.down.fill(0); pad.axes.fill(0); return pad; }
  pad.id = gp.id;
  for (let i = 0; i < 17; i++) { const b = gp.buttons[i]; pad.down[i] = b && (b.pressed || b.value > 0.5) ? 1 : 0; }
  const [lx, ly] = deadzone(gp.axes[0] || 0, gp.axes[1] || 0), [rx, ry] = deadzone(gp.axes[2] || 0, gp.axes[3] || 0);
  pad.axes[0] = lx; pad.axes[1] = ly; pad.axes[2] = rx; pad.axes[3] = ry;
  if (pad.down.some((d, i) => d && !pad.was[i]) || Math.hypot(lx, ly) > 0.3 || Math.hypot(rx, ry) > 0.3) setMode('pad');
  return pad;
}
export const hit = i => pad.down[i] && !pad.was[i];
export const held = i => !!pad.down[i];
export const stick = s => s === 'left' ? [pad.axes[0], pad.axes[1]] : [pad.axes[2], pad.axes[3]];
// the D-pad moves the boss unless something has been bound to it
export function dpad() {
  let x = 0, y = 0;
  for (const b in DPAD) {
    if (!pad.down[b] || Object.values(state.pad).includes(+b)) continue;
    const d = DPAD[b];
    x += d === 'right' ? 1 : d === 'left' ? -1 : 0; y += d === 'down' ? 1 : d === 'up' ? -1 : 0;
  }
  return [x, y];
}

addEventListener('gamepadconnected', () => { for (const f of listeners) f(); });
addEventListener('gamepaddisconnected', () => { for (const f of listeners) f(); });

// fullscreen: the desktop build asks its window; a browser only allows it from a real key press or click, and a
// controller button doesn't count, so then it says how instead
export function fullscreen() {
  if (window.slopDesktop?.fullscreen) { window.slopDesktop.fullscreen(); return Promise.resolve(true); }
  if (document.fullscreenElement) return document.exitFullscreen().then(() => true, () => false);
  const el = document.documentElement;
  return (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? Promise.reject()).then(() => true, () => false);
}

export const controls = {
  get mode() { return state.mode; },
  get kb() { return state.kb; }, get pad() { return state.pad; }, get sticks() { return state.sticks; },
  get gamepad() { return pad; },
};
