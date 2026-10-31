// Progress and settings, kept in this browser's localStorage under one key. Everything read back is
// checked, so a damaged or hand-edited save falls back to safe values instead of breaking the game.

export const SAVE_KEY = 'ambivalent.quarterly-rollout.v1';
export const SAVE_VERSION = 1;
const MAX_SECONDS = 10 * 60 * 60;

export function defaultSave() {
  return { version: SAVE_VERSION, unlocked: 1, best: {}, finished: false, lastLevel: 0, settings: { sound: true, music: true } };
}

const isInt = (n) => Number.isInteger(n);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function sanitizeSave(raw, levelIds) {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return d;
  const count = levelIds.length;
  if (isInt(raw.unlocked)) d.unlocked = clamp(raw.unlocked, 1, count);
  if (raw.best && typeof raw.best === 'object') {
    for (const id of levelIds) {
      const t = raw.best[id];
      if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t < MAX_SECONDS) d.best[id] = Math.round(t * 1000) / 1000;
    }
  }
  d.finished = raw.finished === true;
  if (isInt(raw.lastLevel)) d.lastLevel = clamp(raw.lastLevel, 0, d.unlocked - 1);
  if (raw.settings && typeof raw.settings === 'object') {
    if (typeof raw.settings.sound === 'boolean') d.settings.sound = raw.settings.sound;
    if (typeof raw.settings.music === 'boolean') d.settings.music = raw.settings.music;
  }
  return d;
}

export function loadSave(storage, levelIds) {
  try {
    const text = storage ? storage.getItem(SAVE_KEY) : null;
    if (!text) return defaultSave();
    return sanitizeSave(JSON.parse(text), levelIds);
  } catch (e) {
    return defaultSave();
  }
}

export function writeSave(storage, data) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

// A finished floor: keep the faster time, unlock the next floor, remember where to continue.
export function recordCompletion(data, levelIndex, seconds, levelIds) {
  const id = levelIds[levelIndex];
  const next = structuredClone(data);
  if (id === undefined || !(seconds > 0) || !Number.isFinite(seconds)) return next;
  const t = Math.round(seconds * 1000) / 1000;
  if (!(next.best[id] <= t)) next.best[id] = t;
  const count = levelIds.length;
  next.unlocked = clamp(Math.max(next.unlocked, levelIndex + 2), 1, count);
  next.lastLevel = clamp(levelIndex + 1, 0, count - 1);
  if (levelIndex === count - 1) next.finished = true;
  return next;
}

export function resetProgress(data) {
  const d = defaultSave();
  d.settings = { ...data.settings };
  return d;
}

export function withSettings(data, patch) {
  const next = structuredClone(data);
  for (const k of ['sound', 'music']) if (typeof patch[k] === 'boolean') next.settings[k] = patch[k];
  return next;
}
