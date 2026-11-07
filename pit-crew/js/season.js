// Season calendars. A short season runs the six tracks with 3 extra laps each; a long
// season adds 6 laps and then goes round all six again with the weather and the time
// of day turned over from the first visit.
import { TRACKS } from './data.js';

const BASE_TIME = { harbour: 'day', forest: 'day', desert: 'dusk', alpine: 'day', neon: 'night', sunset: 'sunset' };
const FLIP = { day: 'night', night: 'day', dusk: 'night', sunset: 'night' };
export const TIME_NAME = { day: 'DAY', dusk: 'DUSK', sunset: 'SUNSET', night: 'NIGHT' };
export const MODES = { short: { name: 'SHORT SEASON', extra: 3 }, long: { name: 'LONG SEASON', extra: 6 } };

export const baseTime = track => BASE_TIME[track.theme];

export function variant(base, extra, second) {
  const laps = base.laps + extra, k = laps / base.laps;
  let weather = base.weather.map(w => ({ ...w, lap: Math.round(w.lap * k * 10) / 10 }));
  let mods = base.mods.slice();
  let time = BASE_TIME[base.theme];
  let blurb = base.blurb;
  if (second) {
    time = FLIP[time];
    const wasWet = weather.some(w => w.wet);
    if (wasWet) {
      weather = [];
      // the slippery guns came with the rain here; frozen ones (cold) stay
      mods = mods.filter(m => m !== 'rain' && !(m === 'slick' && !mods.includes('cold')));
    } else {
      const at = Math.round(laps * (0.36 + (TRACKS.indexOf(base) % 3) * 0.08) * 10) / 10;
      weather = [{ lap: at, wet: 1 }];
      if (!mods.includes('rain')) mods.push('rain');
    }
    mods = mods.filter(m => m !== 'night');
    if (time === 'night') mods.push('night');
    blurb = `Second visit, and it's a different place: a ${time === 'night' ? 'night' : time} race this time, ${wasWet ? 'and the forecast says dry' : 'with rain due part way through'}.`;
  }
  return { ...base, key: `${base.id}-${second ? 'b' : 'a'}${laps}`, laps, weather, mods, time, second, blurb, dryNow: second && base.weather.some(w => w.wet) };
}

export function calendar(mode = 'short') {
  const extra = (MODES[mode] || MODES.short).extra;
  const list = TRACKS.map(t => variant(t, extra, false));
  if (mode === 'long') list.push(...TRACKS.map(t => variant(t, extra, true)));
  return list;
}
