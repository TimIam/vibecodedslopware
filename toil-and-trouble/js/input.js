// input.js — keyboard, gamepad and on-screen touch buttons folded into one held-state snapshot per frame.
const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'Space', 'KeyK'], act: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyJ'], tag: ['KeyC', 'KeyL', 'KeyQ'],
  pause: ['Enter', 'Escape', 'KeyP'],
};
const held = new Set();
const touch = {};
let anyPress = null;
let lastDevice = 'keys';

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
  // touch buttons: any element with data-btn
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

let padPrev = {};
export function readInput() {
  const s = {};
  for (const [k, codes] of Object.entries(KEYS)) s[k] = codes.some((c) => held.has(c)) || !!touch[k];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const p = {
      left: b(14) || ax < -0.4, right: b(15) || ax > 0.4, up: b(12) || ay < -0.5, down: b(13) || ay > 0.5,
      jump: b(0), act: b(2) || b(1), tag: b(3) || b(4) || b(5), pause: b(9),
    };
    for (const k in p) if (p[k]) { s[k] = true; if (!padPrev[k]) { anyPress?.('pad'); lastDevice = 'pad'; } }
    padPrev = p;
  }
  return s;
}
