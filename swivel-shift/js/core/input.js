// Keyboard state in Mac virtual key codes (what GetKeys/IsPressed sees), fed from DOM events.

const CODE_TO_MAC = {
  KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05, KeyZ: 0x06, KeyX: 0x07,
  KeyC: 0x08, KeyV: 0x09, IntlBackslash: 0x0a, KeyB: 0x0b, KeyQ: 0x0c, KeyW: 0x0d, KeyE: 0x0e, KeyR: 0x0f,
  KeyY: 0x10, KeyT: 0x11, Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit6: 0x16, Digit5: 0x17,
  Equal: 0x18, Digit9: 0x19, Digit7: 0x1a, Minus: 0x1b, Digit8: 0x1c, Digit0: 0x1d, BracketRight: 0x1e,
  KeyO: 0x1f, KeyU: 0x20, BracketLeft: 0x21, KeyI: 0x22, KeyP: 0x23, Enter: 0x24, KeyL: 0x25, KeyJ: 0x26,
  Quote: 0x27, KeyK: 0x28, Semicolon: 0x29, Backslash: 0x2a, Comma: 0x2b, Slash: 0x2c, KeyN: 0x2d,
  KeyM: 0x2e, Period: 0x2f, Tab: 0x30, Space: 0x31, Backquote: 0x32, Backspace: 0x33, Escape: 0x35,
  MetaLeft: 0x37, MetaRight: 0x37, ShiftLeft: 0x38, ShiftRight: 0x38, CapsLock: 0x39,
  AltLeft: 0x3a, AltRight: 0x3a, ControlLeft: 0x3b, ControlRight: 0x3b,
  NumpadDecimal: 0x41, NumpadMultiply: 0x43, NumpadAdd: 0x45, NumLock: 0x47, NumpadDivide: 0x4b,
  NumpadEnter: 0x4c, NumpadSubtract: 0x4e, NumpadEqual: 0x51, Numpad0: 0x52, Numpad1: 0x53,
  Numpad2: 0x54, Numpad3: 0x55, Numpad4: 0x56, Numpad5: 0x57, Numpad6: 0x58, Numpad7: 0x59,
  Numpad8: 0x5b, Numpad9: 0x5c, F5: 0x60, F6: 0x61, F7: 0x62, F3: 0x63, F8: 0x64, F9: 0x65,
  F11: 0x67, F13: 0x69, F14: 0x6b, F10: 0x6d, F12: 0x6f, F15: 0x71, Help: 0x72, Insert: 0x72,
  Home: 0x73, PageUp: 0x74, Delete: 0x75, F4: 0x76, End: 0x77, F2: 0x78, PageDown: 0x79, F1: 0x7a,
  ArrowLeft: 0x7b, ArrowRight: 0x7c, ArrowDown: 0x7d, ArrowUp: 0x7e,
};

export const MacKey = {
  Command: 0x37, Shift: 0x38, CapsLock: 0x39, Option: 0x3a, Control: 0x3b, Escape: 0x35,
  Space: 0x31, Return: 0x24, Tab: 0x30, Left: 0x7b, Right: 0x7c, Down: 0x7d, Up: 0x7e,
};

const down = new Uint8Array(128);
let capsLock = false;
const typed = []; // queue of {mac, char} keyDown events (for menus / text easter eggs)
let mouseDown = false, mouseClicks = [];

// What the UI is doing, for the menu bar / touch controls: inGame while GameLoop runs, modal > 0 while
// a dialog has the screen
export const UIState = { inGame: false, modal: 0, paused: false };

export const Input = {
  actions: new Set(),   // game actions held by the on-screen touch controls (see game/keys.js)
  onShortcut: null,     // (key, event) => true if a Cmd/Ctrl+key menu shortcut was handled
  isPressed(mac) { return mac === 0x39 ? capsLock : !!down[mac & 127]; },
  anyKeyDown() { for (let i = 0; i < 128; i++) if (down[i] && i !== 0x39) return true; return mouseDown || Input.actions.size > 0; },
  pushKey(ev) { typed.push(ev); },
  pushClick(pt) { mouseClicks.push(pt); },
  nextKey() { return typed.shift() || null; },
  flushEvents() { typed.length = 0; mouseClicks.length = 0; },
  get capsLock() { return capsLock; },
  set capsLock(v) { capsLock = v; },
  get mouseDown() { return mouseDown; },
  nextClick() { return mouseClicks.shift() || null; },
  macCode(code) { return CODE_TO_MAC[code]; },
};

export function attachInput(target, canvas) {
  target.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && Input.onShortcut && Input.onShortcut(e.key.toLowerCase(), e)) {
      e.preventDefault();
      return;
    }
    const m = CODE_TO_MAC[e.code];
    if (e.code === 'CapsLock') { capsLock = e.getModifierState ? e.getModifierState('CapsLock') : !capsLock; }
    if (m !== undefined) {
      if (!e.repeat) typed.push({ mac: m, key: e.key, cmd: e.metaKey || e.ctrlKey, opt: e.altKey, shift: e.shiftKey });
      down[m] = 1;
      e.preventDefault();
    }
  });
  target.addEventListener('keyup', (e) => {
    const m = CODE_TO_MAC[e.code];
    if (e.code === 'CapsLock' && e.getModifierState) capsLock = e.getModifierState('CapsLock');
    if (m !== undefined) { down[m] = 0; e.preventDefault(); }
  });
  target.addEventListener('blur', () => down.fill(0));
  if (canvas) {
    // pointer events cover mouse, pen and touch; positions are in 640x480 screen coordinates
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { h: Math.floor((e.clientX - r.left) * 640 / r.width), v: Math.floor((e.clientY - r.top) * 480 / r.height) };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      mouseDown = true; Input.mouse = pos(e); mouseClicks.push(pos(e));
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    const up = () => { mouseDown = false; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    canvas.addEventListener('pointermove', (e) => { Input.mouse = pos(e); });
    canvas.style.touchAction = 'none';
  }
}
