// Player's own team: names for the team, drivers, principal and crew, plus the livery.
// Kept apart from the season save so a new season keeps your team.
import { TEAMS, DRIVERS, PEOPLE } from './data.js';
import { clearCaches, shade } from './gfx.js';
import { setNames } from './banter.js';

const KEY = 'pitcrew26.team.v1';

export const DEFAULT = {
  team: 'Brightwater Racing', d1: ['Nico', 'Okafor'], d2: ['Sanna', 'Lindqvist'], boss: 'Hargreaves',
  mags: 'Mags', toby: 'Toby', lou: 'Lou', dev: 'Dev', pip: 'Pip',
  c1: '#16b3a3', c2: '#ff8a1e', helmet: '#ffd23a',
};

// 16 livery colours, picked to read well against the grey pit lane.
export const PALETTE = [
  '#16b3a3', '#ff8a1e', '#ffd23a', '#e8342c', '#c2185b', '#8e44ad', '#2457d6', '#38a8f0',
  '#2f8f3a', '#9ad83a', '#f4f4f0', '#9aa0aa', '#3a3e48', '#14161c', '#8a5a2c', '#f2a8c8',
];

export const SCHEMES = [
  { name: 'TEAL', c1: '#16b3a3', c2: '#ff8a1e', helmet: '#ffd23a' },
  { name: 'SCARLET', c1: '#e8342c', c2: '#ffd23a', helmet: '#f4f4f0' },
  { name: 'MIDNIGHT', c1: '#14161c', c2: '#ffd23a', helmet: '#ffd23a' },
  { name: 'ROYAL', c1: '#2457d6', c2: '#f4f4f0', helmet: '#e8342c' },
  { name: 'GRAPE', c1: '#8e44ad', c2: '#9ad83a', helmet: '#f4f4f0' },
  { name: 'RACING GREEN', c1: '#2f8f3a', c2: '#ffd23a', helmet: '#ffd23a' },
  { name: 'BUBBLEGUM', c1: '#f2a8c8', c2: '#38a8f0', helmet: '#f4f4f0' },
  { name: 'SILVER', c1: '#9aa0aa', c2: '#14161c', helmet: '#38a8f0' },
];

export const FIELDS = [
  ['TEAM NAME', 'team'], ['CAR 7 FIRST NAME', 'd1.0'], ['CAR 7 SURNAME', 'd1.1'], ['CAR 11 FIRST NAME', 'd2.0'], ['CAR 11 SURNAME', 'd2.1'],
  ['TEAM PRINCIPAL', 'boss'], ['CREW CHIEF', 'mags'], ['TYRE CARRIER', 'toby'], ['FRONT JACK', 'lou'], ['CHIEF ENGINEER', 'dev'], ['REFUELLER', 'pip'],
];

const clone = o => JSON.parse(JSON.stringify(o));
export let team = clone(DEFAULT);
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s && typeof s === 'object') for (const k in DEFAULT) if (s[k] != null && typeof s[k] === typeof DEFAULT[k]) team[k] = s[k];
} catch (e) {}

export function get(key) { const [a, b] = key.split('.'); return b == null ? team[a] : team[a][+b]; }
export function set(key, v) { const [a, b] = key.split('.'); if (b == null) team[a] = v; else team[a][+b] = v; }
export function defaultOf(key) { const [a, b] = key.split('.'); return b == null ? DEFAULT[a] : DEFAULT[a][+b]; }

export function persist() { try { localStorage.setItem(KEY, JSON.stringify(team)); } catch (e) {} }
export function reset() { team = clone(DEFAULT); apply(); persist(); }

// "Brightwater Racing" -> "BRIGHTWATER" for banners and boards.
export function shortName(name) {
  const s = name.replace(/\s+(racing|motorsports?|gp|grand prix|team|f1|racing team)$/i, '').trim() || name;
  return s.toUpperCase().slice(0, 18);
}
const short = name => name.replace(/\s+(racing|motorsports?|gp|grand prix|team|f1|racing team)$/i, '').trim() || name;

export function apply() {
  const t = TEAMS[0];
  t.name = team.team;
  t.short = shortName(team.team);
  t.c1 = team.c1; t.c2 = team.c2; t.helmet = team.helmet; t.c3 = shade(team.c1, -0.6);
  for (const [i, k] of [[0, 'd1'], [1, 'd2']]) {
    const [first, last] = team[k];
    DRIVERS[i].name = `${first} ${last}`;
    DRIVERS[i].code = (last.replace(/[^A-Za-z]/g, '') || first).slice(0, 3).toUpperCase().padEnd(3, 'X');
  }
  PEOPLE.nico.name = team.d1[0].toUpperCase();
  PEOPLE.sanna.name = team.d2[0].toUpperCase();
  PEOPLE.boss.name = team.boss.toUpperCase();
  for (const k of ['mags', 'toby', 'dev', 'pip']) PEOPLE[k].name = team[k].toUpperCase();
  PEOPLE.lou.name = team.lou === 'Lou' ? 'BIG LOU' : team.lou.toUpperCase();
  // Lines are written with the default names; swap in the player's on the way out.
  setNames([
    ['Brightwater Racing', team.team], ['Brightwater', short(team.team)],
    ['Okafor', team.d1[1]], ['Lindqvist', team.d2[1]], ['Nico', team.d1[0]], ['Sanna', team.d2[0]],
    ['Hargreaves', team.boss], ['Mags', team.mags], ['Toby', team.toby], ['Lou', team.lou], ['Dev', team.dev], ['Pip', team.pip],
  ]);
  clearCaches();
}
