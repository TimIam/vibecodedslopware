// Keyboard and touch input, reduced to a push direction, a queued spin, and named commands.

const DIRS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
};
const SPIN_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ']);
const COMMANDS = { KeyP: 'pause', Escape: 'pause', KeyR: 'restart', KeyM: 'mute', Enter: 'confirm' };

export function createInput(target, { onCommand, isPlaying }) {
  const held = new Set();
  const stick = { x: 0, y: 0 };
  let spinQueued = false;

  target.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('.site-topbar')) return;
    const dir = DIRS[e.code];
    if (dir) {
      held.add(dir);
      if (isPlaying()) e.preventDefault();
      return;
    }
    if (SPIN_KEYS.has(e.code)) {
      if (isPlaying()) { e.preventDefault(); if (!e.repeat) spinQueued = true; }
      return;
    }
    const cmd = COMMANDS[e.code];
    if (!cmd || e.repeat) return;
    // Enter on a focused button already clicks it
    if (cmd === 'confirm' && e.target && e.target.tagName === 'BUTTON') return;
    if (onCommand(cmd)) e.preventDefault();
  });
  target.addEventListener('keyup', (e) => {
    const dir = DIRS[e.code];
    if (dir) held.delete(dir);
  });
  globalThis.addEventListener?.('blur', () => { held.clear(); });

  return {
    read() {
      let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + stick.x;
      let y = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0) + stick.y;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      const spin = spinQueued;
      spinQueued = false;
      return { x, y, spin };
    },
    clear() { held.clear(); stick.x = 0; stick.y = 0; spinQueued = false; },
    queueSpin() { spinQueued = true; },

    // A thumb-stick: drag anywhere inside `zone`; the knob follows within its ring.
    attachStick(zone, knob) {
      let id = null;
      const update = (e) => {
        const r = zone.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
        let dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        stick.x = Math.abs(dx) < 0.15 ? 0 : dx;
        stick.y = Math.abs(dy) < 0.15 ? 0 : dy;
        knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
      };
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; stick.x = 0; stick.y = 0; knob.style.transform = '';
      };
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        id = e.pointerId;
        zone.setPointerCapture?.(id);
        update(e);
      });
      zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) update(e); });
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
    },
  };
}
