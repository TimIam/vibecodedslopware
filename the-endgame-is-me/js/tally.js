// Lifetime body counts for the Humanstiary: how many of each hero, pet and animal the boss has killed, and how many of
// each plant and building it has knocked down or burnt, over every run on this machine. Kept apart from the run's own
// save, so dying or starting over never loses them. Keys: 'u:<class>' for heroes and pets, 'c:<kind>' for animals,
// 'p:<kind>' for props. Only games main.js actually plays count (g.counts): the title screen's attract fights, the
// Hoard's demo reel and the Humanstiary's own specimens do not. No localStorage (headless tests) means nothing is kept.

const KEY = 'bosshours.tally.v1';
let t = null, timer = 0;

function load() {
  if (t) return t;
  try { t = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {}; } catch { t = {}; }
  return t;
}
export function flush() {
  timer = 0;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(load())); } catch { /* full or blocked: keep counting in memory */ }
}
// one more of key; written out a moment later, so a chain of kills is one write
export function tally(g, key) {
  if (!g.counts) return;
  const m = load();
  m[key] = (m[key] || 0) + 1;
  if (!timer && typeof setTimeout === 'function') timer = setTimeout(flush, 1500);
}
export const count = key => load()[key] || 0;

if (typeof addEventListener === 'function') addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); flush(); } });
