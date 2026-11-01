// Mac TickCount emulation (60 Hz) and an async scheduler, so the ported code can keep the
// original's blocking loops ("while (TickCount() - 2 < start) {}") as `await waitUntil(...)`.
// Game timing runs off a timer; presentation runs on animation frames (so a hidden tab still
// advances, and a visible one shows every frame).

const t0 = performance.now();
export const tickCount = () => Math.floor((performance.now() - t0) * 60 / 1000);

let waiters = [];
const presenters = [];
export function onPresent(fn) { presenters.push(fn); }

function check() {
  if (!waiters.length) return;
  const now = tickCount();
  const ready = [];
  waiters = waiters.filter((w) => (w.tick <= now ? (ready.push(w), false) : true));
  for (const w of ready) w.resolve(now);
}
setInterval(check, 4);

function present() {
  for (const fn of presenters) fn();
  requestAnimationFrame(present);
}
requestAnimationFrame(present);

// Resolve at or after `tick`
export function waitUntil(tick) {
  return new Promise((resolve) => { waiters.push({ tick, resolve }); });
}
export function waitTicks(n) { return waitUntil(tickCount() + n); }
export function nextFrame() { return waitUntil(tickCount() + 1); }
export const delay = waitTicks;
