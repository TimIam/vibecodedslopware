// Player options: key bindings, music and sound volume, and whether music dips during stops.
// Gameplay keys are named actions (the stop's logical keys plus race and global ones); each
// is bound to one physical key code. Menus always answer to the arrows, Enter and Escape.
const KEY = 'pitcrew26.options.v1';

// [action, label, default code, zone]. Actions in zones that can be live at the same time
// may not share a key; the tyre picker overrides the box keys while it's open, so those two
// zones are allowed to overlap (by default they do: 1 and 2).
export const ACTIONS = [
  ['space', 'CATCH / RELEASE', 'Space', 'stop'],
  ['a', 'REAR JACK', 'KeyA', 'stop'],
  ['d', 'FRONT JACK', 'KeyD', 'stop'],
  ['q', 'GUN REAR LEFT', 'KeyQ', 'stop'],
  ['e', 'GUN FRONT LEFT', 'KeyE', 'stop'],
  ['z', 'GUN REAR RIGHT', 'KeyZ', 'stop'],
  ['c', 'GUN FRONT RIGHT', 'KeyC', 'stop'],
  ['s', 'FUEL (HOLD)', 'KeyS', 'stop'],
  ['x', 'BLOWER / FIRE', 'KeyX', 'stop'],
  ['w', 'DRIVER', 'KeyW', 'stop'],
  ['up', 'NOSE UP', 'ArrowUp', 'stop'],
  ['down', 'NOSE DOWN', 'ArrowDown', 'stop'],
  ['left', 'NOSE LEFT', 'ArrowLeft', 'stop'],
  ['right', 'NOSE RIGHT', 'ArrowRight', 'stop'],
  ['box7', 'BOX CAR 7', 'Digit1', 'box'],
  ['box11', 'BOX CAR 11', 'Digit2', 'box'],
  ['pick_soft', 'TYRES: SOFT', 'Digit1', 'pick'],
  ['pick_medium', 'TYRES: MEDIUM', 'Digit2', 'pick'],
  ['pick_hard', 'TYRES: HARD', 'Digit3', 'pick'],
  ['pick_wet', 'TYRES: WET', 'Digit4', 'pick'],
  ['pick_none', 'TYRES: NONE', 'Digit0', 'pick'],
  ['fullscreen', 'FULL SCREEN', 'KeyL', 'global'],
  ['mute', 'MUTE', 'KeyM', 'global'],
];
const ZONE = Object.fromEntries(ACTIONS.map(a => [a[0], a[3]]));
const NAME = Object.fromEntries(ACTIONS.map(a => [a[0], a[1]]));
const clash = (z1, z2) => !((z1 === 'box' && z2 === 'pick') || (z1 === 'pick' && z2 === 'box'));

const defaults = () => ({ binds: Object.fromEntries(ACTIONS.map(a => [a[0], a[2]])), music: 0.8, sfx: 0.9, duck: true });
export const opts = defaults();
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s) {
    if (s.binds) for (const k in opts.binds) if (typeof s.binds[k] === 'string') opts.binds[k] = s.binds[k];
    for (const k of ['music', 'sfx']) if (typeof s[k] === 'number') opts[k] = Math.max(0, Math.min(1, s[k]));
    if (typeof s.duck === 'boolean') opts.duck = s.duck;
  }
} catch (e) {}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) {} }
export function resetKeys() { opts.binds = defaults().binds; save(); }

// Numpad digits count as the same keys as the top row.
const norm = code => code.replace(/^Numpad(\d)$/, 'Digit$1');

// Every action bound to this physical key.
export function actionsFor(code) {
  const c = norm(code);
  return ACTIONS.filter(a => opts.binds[a[0]] === c).map(a => a[0]);
}

// Bind a key; anything that clashes with it gets this action's old key instead.
// Returns the names of the actions that were swapped, for the screen to mention.
export function bind(action, code) {
  code = norm(code);
  const old = opts.binds[action];
  const swapped = [];
  for (const [other] of ACTIONS) {
    if (other === action || opts.binds[other] !== code) continue;
    if (!clash(ZONE[action], ZONE[other]) && ZONE[action] !== ZONE[other]) continue;
    opts.binds[other] = old;
    swapped.push(NAME[other]);
  }
  opts.binds[action] = code;
  save();
  return swapped;
}

const NAMED = {
  Space: 'SPACE', Enter: 'ENTER', Backspace: 'BKSP', Tab: 'TAB', ShiftLeft: 'SHIFT', ShiftRight: 'RSHIFT',
  ControlLeft: 'CTRL', ControlRight: 'RCTRL', AltLeft: 'ALT', AltRight: 'RALT', CapsLock: 'CAPS',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Slash: '/', Period: '.',
  Comma: ',', Minus: '-', Equal: '=', Backquote: '`', Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END',
  PageUp: 'PGUP', PageDown: 'PGDN', NumpadAdd: 'N+', NumpadSubtract: 'N-', NumpadMultiply: 'N*', NumpadDivide: 'N/',
  NumpadDecimal: 'N.', NumpadEnter: 'NENT',
};
export function codeLabel(code) {
  if (!code) return '?';
  if (NAMED[code]) return NAMED[code];
  let m = code.match(/^Key([A-Z])$/); if (m) return m[1];
  m = code.match(/^Digit(\d)$/); if (m) return m[1];
  m = code.match(/^F(\d+)$/); if (m) return 'F' + m[1];
  return code.replace(/(Left|Right)$/, '').slice(0, 5).toUpperCase();
}
// The key shown for an action ('q', 'box7', 'pick_soft'...).
export const label = action => codeLabel(opts.binds[action]);
