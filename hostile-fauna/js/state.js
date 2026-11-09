// Shared mutable state and small helpers. Every module imports S instead of importing each other's internals.

export const S = {
  mode: 'title',        // title | conclave | mission | dialog | debrief | dead
  paused: false,
  time: 0,              // mission clock, seconds
  scene: null, camera: null,
  W: null,              // world (terrain, colliders)
  P: null,              // player
  M: null,              // mission runtime
  enemies: [],
  targets: [],          // destructible objective props
  I: null,              // input (keys, mouse, or the bot)
  save: null,
};

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// Seeded generator, so each mission's scenery comes out the same every time.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ save
const KEY = 'hostilefauna.v1';
const fresh = () => ({ v: 1, xp: 0, level: 1, pts: 0, skills: {}, done: [], logs: [], slain: 0, returned: 0, ending: null, seenIntro: false, opts: { sens: 1, vol: 0.7, bloom: true } });

export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* corrupt or blocked: start over */ }
  S.save = Object.assign(fresh(), s && s.v === 1 ? s : {});
  S.save.opts = Object.assign(fresh().opts, S.save.opts);
  return S.save;
}
export function saveGame() { try { localStorage.setItem(KEY, JSON.stringify(S.save)); } catch { /* private mode */ } }
export function wipeSave() { S.save = fresh(); saveGame(); }

export const hasSkill = id => !!S.save.skills[id];
export const xpNeed = level => 150 + 70 * (level - 1);
export const MAX_LEVEL = 13;
