// One pad for everything: keyboard, gamepad and the on-screen touch pad all feed the same
// seven buttons. Presses are latched so a tap between two frames still counts, and each press
// remembers the music clock time it happened at, so rhythm games can judge it exactly.
import { clock } from './audio.js';

export const BTN = ['up', 'down', 'left', 'right', 'a', 'b', 'start'];
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', ShiftLeft: 'b', Enter: 'start', Escape: 'start', KeyP: 'start',
};

const held = { key: new Set(), touch: new Set(), pad: new Set() };
const latch = new Set();
const prev = new Set();
const cur = new Set();
const when = {};
const repeatT = {};
let anyPress = false;

function press(b) {
  if (!cur.has(b) && !isHeldRaw(b)) { latch.add(b); when[b] = clock(); anyPress = true; }
}
function isHeldRaw(b) { return held.key.has(b) || held.touch.has(b) || held.pad.has(b); }

export const I = {
  down: b => cur.has(b),
  hit: b => cur.has(b) && !prev.has(b) || latch.has(b),
  up: b => !cur.has(b) && prev.has(b),
  // Menu-style auto-repeat: true on the press and then every 0.09 s after a 0.3 s hold.
  rep: b => {
    if (I.hit(b)) { repeatT[b] = -0.3; return true; }
    if (!cur.has(b)) return false;
    repeatT[b] = (repeatT[b] ?? 0) + 1 / 60;
    if (repeatT[b] >= 0.09) { repeatT[b] = 0; return true; }
    return false;
  },
  when: b => when[b] ?? -1,
  any: () => anyPress,
  axis: () => [(cur.has('right') ? 1 : 0) - (cur.has('left') ? 1 : 0), (cur.has('down') ? 1 : 0) - (cur.has('up') ? 1 : 0)],
  // Test hooks call these instead of real events.
  // (Marks the button as already down this frame so the next poll doesn't count it twice.)
  set(b, on) { if (on) { press(b); held.key.add(b); cur.add(b); } else held.key.delete(b); },
  clearAll() { for (const k in held) held[k].clear(); latch.clear(); cur.clear(); prev.clear(); },
};

// Called once per fixed update, before the scene runs.
export function poll() {
  prev.clear(); for (const b of cur) prev.add(b);
  cur.clear();
  pollPads();
  for (const b of BTN) if (isHeldRaw(b) || latch.has(b)) cur.add(b);
}
// Called after the scene runs.
export function endFrame() { latch.clear(); anyPress = false; }

addEventListener('keydown', e => {
  if (e.target && e.target.closest && e.target.closest('.site-topbar')) return;
  const b = KEYS[e.code];
  if (!b) return;
  e.preventDefault();
  if (e.repeat) return;
  press(b); held.key.add(b);
});
addEventListener('keyup', e => { const b = KEYS[e.code]; if (b) held.key.delete(b); });
addEventListener('blur', () => { held.key.clear(); held.touch.clear(); });

// Gamepads: standard mapping, A/B on the bottom/right face buttons, start or select pauses.
const padPrev = new Set();
function pollPads() {
  held.pad.clear();
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const bt = i => p.buttons[i] && p.buttons[i].pressed;
    const ax = p.axes || [];
    if (bt(12) || ax[1] < -0.5) held.pad.add('up');
    if (bt(13) || ax[1] > 0.5) held.pad.add('down');
    if (bt(14) || ax[0] < -0.5) held.pad.add('left');
    if (bt(15) || ax[0] > 0.5) held.pad.add('right');
    if (bt(0) || bt(3)) held.pad.add('a');
    if (bt(1) || bt(2)) held.pad.add('b');
    if (bt(9) || bt(8)) held.pad.add('start');
  }
  for (const b of held.pad) if (!padPrev.has(b) && !held.key.has(b) && !held.touch.has(b)) { latch.add(b); when[b] = clock(); anyPress = true; }
  padPrev.clear(); for (const b of held.pad) padPrev.add(b);
}

// Touch pad: shown once the first touch lands.
export function initTouch(onFirst) {
  const pad = document.getElementById('pad');
  let shown = false;
  addEventListener('touchstart', () => { if (!shown) { shown = true; document.body.classList.add('touch'); onFirst && onFirst(); } }, { passive: true });
  const active = new Map(); // pointerId -> button
  const set = (el, on) => {
    const b = el.dataset.b;
    if (on) { press(b); held.touch.add(b); el.classList.add('on'); } else { held.touch.delete(b); el.classList.remove('on'); }
  };
  for (const el of pad.querySelectorAll('button')) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); active.set(e.pointerId, el); set(el, true); });
    const end = e => { if (active.get(e.pointerId) === el) { active.delete(e.pointerId); set(el, false); } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
}
