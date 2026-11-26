// input.js — keyboard, gamepads and on-screen touch buttons folded into one held-state snapshot per frame, plus
// button labels for whichever device was used last, and rumble.
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'Space', 'KeyK'], act: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyJ'], tag: ['KeyC', 'KeyL', 'KeyQ'],
  pause: ['Enter', 'Escape', 'KeyP'],
};
const held = new Set();
const touch = {};
let anyPress = null;
let lastDevice = 'keys';
let padKind = 'xbox';
let lastPad = -1;

export function initInput(el) {
  const all = new Set(Object.values(KEYS).flat());
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (all.has(e.code)) e.preventDefault();
    if (!e.repeat) anyPress?.(e.code);
    held.add(e.code); lastDevice = 'keys';
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('gamepadconnected', (e) => { lastDevice = 'pad'; lastPad = e.gamepad.index; padKind = kindOf(e.gamepad.id); });
  addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === lastPad) { lastPad = -1; if (lastDevice === 'pad') lastDevice = 'keys'; } });
  for (const b of document.querySelectorAll('[data-btn]')) {
    const k = b.dataset.btn;
    const on = (ev) => { ev.preventDefault(); touch[k] = true; b.classList.add('on'); anyPress?.('touch'); lastDevice = 'touch'; };
    const off = (ev) => { ev.preventDefault(); touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  }
  el?.addEventListener('pointerdown', () => anyPress?.('pointer'));
}
export function onAnyPress(f) { anyPress = f; }
export function device() { return lastDevice; }

function kindOf(id = '') {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  if (/054c|playstation|dualshock|dualsense|wireless controller/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'nin';
  return 'xbox';
}

// Standard mapping: 0 bottom face, 1 right face, 2 left face, 3 top face, 4/5 bumpers, 6/7 triggers, 8 select,
// 9 start, 10/11 stick clicks, 12-15 d-pad. Bottom = jump, left/right face or triggers = run/roll/grab (right face
// also backs out of menus), top face, bumpers or a stick click = swap witches, start/select = pause.
const padPrev = new Map();
const DEAD = 0.38;
export function readInput() {
  const s = {};
  for (const [k, codes] of Object.entries(KEYS)) s[k] = codes.some((c) => held.has(c)) || !!touch[k];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const b = (i) => { const x = gp.buttons[i]; return !!x && (x.pressed || x.value > 0.5); };
    let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    // some non-standard pads report the d-pad as a hat on axis 9
    if (gp.mapping !== 'standard' && gp.axes.length > 9) {
      const h = gp.axes[9];
      if (h > -1.1 && h < 1.1 && Math.abs(h) > 0.01) { const dir = Math.round((h + 1) * 3.5); ax = [0, 1, 1, 1, 0, -1, -1, -1][dir] ?? ax; ay = [-1, -1, 0, 1, 1, 1, 0, -1][dir] ?? ay; }
    }
    const p = {
      left: b(14) || ax < -DEAD, right: b(15) || ax > DEAD, up: b(12) || ay < -0.55, down: b(13) || ay > 0.55,
      jump: b(0), act: b(2) || b(1) || b(6) || b(7), tag: b(3) || b(4) || b(5) || b(10) || b(11), pause: b(9) || b(8),
    };
    const prev = padPrev.get(gp.index) || {};
    for (const k in p) if (p[k]) {
      s[k] = true;
      if (!prev[k]) { anyPress?.('pad'); lastDevice = 'pad'; lastPad = gp.index; padKind = kindOf(gp.id); }
    }
    padPrev.set(gp.index, p);
  }
  return s;
}

// short labels for prompts, for the device in use
const LABELS = {
  keys: { move: 'ARROWS', jump: 'Z', act: 'X', tag: 'C', pause: 'ESC', ok: 'Z', back: 'X' },
  touch: { move: 'PAD', jump: 'JUMP', act: 'RUN', tag: 'SWAP', pause: 'II', ok: 'JUMP', back: 'RUN' },
  xbox: { move: 'STICK', jump: 'A', act: 'X', tag: 'Y', pause: 'START', ok: 'A', back: 'B' },
  ps: { move: 'STICK', jump: 'CROSS', act: 'SQUARE', tag: 'TRIANGLE', pause: 'OPTIONS', ok: 'CROSS', back: 'CIRCLE' },
  nin: { move: 'STICK', jump: 'B', act: 'Y', tag: 'X', pause: '+', ok: 'B', back: 'A' },
};
export function label(k) { return (LABELS[lastDevice === 'pad' ? padKind : lastDevice] || LABELS.keys)[k] || k; }
export function controlsHint() {
  const L = (k) => label(k);
  return `${L('move')} MOVE  ${L('jump')} JUMP  ${L('act')} RUN/ROLL/GRAB  ${L('tag')} SWAP`;
}

// rumble on the pad in use (silently nothing where unsupported)
export function rumble(strong = 0.5, weak = 0.5, ms = 120) {
  if (lastDevice !== 'pad' || lastPad < 0 || !navigator.getGamepads) return;
  const gp = navigator.getGamepads()[lastPad];
  const act = gp && gp.vibrationActuator;
  if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
}
