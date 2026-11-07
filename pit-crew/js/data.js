// Teams, people, tyres and the season calendar. No DOM.

// Race sim runs in real seconds; everything shown to the player is in "TV seconds",
// so an honest 7 second scramble reads like a believable 2.4 s pit stop.
export const TV = 0.35;

export const TEAMS = [
  { id: 'brw', name: 'Brightwater Racing', short: 'BRIGHTWATER', c1: '#16b3a3', c2: '#ff8a1e', c3: '#0b3a44', helmet: '#ffd23a', pace: 18.0, crew: 1 },
  { id: 'krn', name: 'Krone Motorsport', short: 'KRONE', c1: '#c9cfd6', c2: '#1a1c22', c3: '#5c636e', helmet: '#e8e8e8', pace: 17.86 },
  { id: 'ros', name: 'Rossa Vento', short: 'ROSSA', c1: '#d42a24', c2: '#ffd400', c3: '#6a0f0c', helmet: '#ffffff', pace: 17.9 },
  { id: 'azv', name: 'Azure Volt', short: 'AZURE', c1: '#2457d6', c2: '#f2f2f2', c3: '#0f235a', helmet: '#ff5a2a', pace: 17.98 },
  { id: 'grh', name: 'Greenhollow GP', short: 'GREENHOLLOW', c1: '#2f8f3a', c2: '#e8c33a', c3: '#123d18', helmet: '#e8c33a', pace: 18.12 },
];

export const DRIVERS = [
  { code: 'OKA', name: 'Nico Okafor', num: 7, team: 0, skill: 0.0 },
  { code: 'LIN', name: 'Sanna Lindqvist', num: 11, team: 0, skill: 0.03 },
  { code: 'VAN', name: 'Marten Vandaal', num: 1, team: 1, skill: -0.05 },
  { code: 'REI', name: 'Elias Reiter', num: 4, team: 1, skill: 0.06 },
  { code: 'CAS', name: 'Luca Castiglione', num: 16, team: 2, skill: 0.0 },
  { code: 'MOR', name: 'Pietro Moretti', num: 55, team: 2, skill: 0.05 },
  { code: 'DUB', name: 'Remi Dubois', num: 10, team: 3, skill: 0.02 },
  { code: 'TAK', name: 'Haruto Takeda', num: 22, team: 3, skill: 0.06 },
  { code: 'PAR', name: 'Isla Parkes', num: 31, team: 4, skill: 0.0 },
  { code: 'SIL', name: 'Joao Silveira', num: 77, team: 4, skill: 0.07 },
];

export const COMPOUNDS = {
  soft:   { name: 'SOFT',   color: '#e8342c', wear: 0.115, pace: -0.009 },
  medium: { name: 'MEDIUM', color: '#f2c218', wear: 0.08,  pace: 0 },
  hard:   { name: 'HARD',   color: '#f4f4f0', wear: 0.058, pace: 0.009 },
  wet:    { name: 'WET',    color: '#2a7ff0', wear: 0.075, pace: 0 },
};
export const COMPOUND_ORDER = ['soft', 'medium', 'hard', 'wet'];

// Portrait specs are drawn by gfx.portrait(). Voice is the blip pitch for the typewriter.
export const PEOPLE = {
  mags: { name: 'MAGS', role: 'Chief Mechanic', skin: '#8a5a3c', hair: '#d8d8d8', hairStyle: 'crop', glasses: 'safety', headset: true, bg: '#3a2f4a', voice: 150 },
  toby: { name: 'TOBY', role: 'Tyre Carrier', skin: '#f0c4a0', hair: '#d8662a', hairStyle: 'mop', freckles: true, bg: '#2f4a3a', voice: 330 },
  lou:  { name: 'BIG LOU', role: 'Front Jack', skin: '#c88f62', hair: '#3a2416', hairStyle: 'bald', moustache: true, headset: true, bg: '#4a3a2a', voice: 110 },
  dev:  { name: 'DEV', role: 'Chief Engineer', skin: '#a8724c', hair: '#1a1410', hairStyle: 'neat', glasses: 'round', headset: true, mic: true, bg: '#26364a', voice: 210 },
  pip:  { name: 'PIP', role: 'Refueller', skin: '#b5835a', hair: '#141018', hairStyle: 'bob', fireproof: true, bg: '#4a2a2f', voice: 260 },
  nico: { name: 'NICO', role: 'Car 7', helmet: true, skin: '#6e4630', eyes: '#2a1a10', bg: '#123a40', voice: 180, num: 7 },
  sanna:{ name: 'SANNA', role: 'Car 11', helmet: true, skin: '#f2d2bc', eyes: '#4a8ad8', bg: '#123a40', voice: 240, num: 11 },
  boss: { name: 'HARGREAVES', role: 'Team Principal', skin: '#f0cfb4', hair: '#9aa0a8', hairStyle: 'slick', shades: true, suit: true, bg: '#2a2a2e', voice: 130 },
};

// Track maps are closed loops in a unit square; point 0 is the start/finish line on the pit straight.
// mods: tightLane (busier pit lane), rain (weather turns), slick (narrower gun window), sand (intake
// blow-out every stop), heat (narrow fuel band, overfill catches fire), cold (tyre blankets, frozen
// nuts), walls (wing damage), night (dark pit lane), doubleStack (both cars stop together).
export const TRACKS = [
  {
    id: 'porto', name: 'Porto Velluto', gp: 'Riviera Grand Prix', laps: 8, theme: 'harbour', par: 7.9,
    mods: ['tightLane'], weather: [], damage: 0.02, hints: true,
    blurb: 'Yachts, casinos and a pit lane as wide as a hallway. Watch the traffic before you release.',
    map: [[0.15,0.78],[0.5,0.82],[0.8,0.8],[0.9,0.64],[0.78,0.52],[0.84,0.32],[0.7,0.16],[0.52,0.24],[0.42,0.14],[0.24,0.2],[0.28,0.42],[0.12,0.5]],
  },
  {
    id: 'kessel', name: 'Kesselwald Ring', gp: 'Forest Grand Prix', laps: 9, theme: 'forest', par: 8.4,
    mods: ['rain', 'slick'], weather: [{ lap: 3.6, wet: 1 }], damage: 0.02,
    blurb: 'Pine forest, old tarmac, and a rain cloud with your name on it. Wets get slippery hands on the guns.',
    map: [[0.1,0.7],[0.45,0.8],[0.75,0.84],[0.9,0.7],[0.85,0.5],[0.66,0.46],[0.6,0.26],[0.78,0.14],[0.5,0.1],[0.3,0.22],[0.36,0.44],[0.14,0.46]],
  },
  {
    id: 'qasr', name: 'Qasr Dunes', gp: 'Desert Grand Prix', laps: 9, theme: 'desert', par: 8.6,
    mods: ['sand', 'heat'], weather: [], damage: 0.02,
    blurb: 'Dusk race in the dunes. Sand clogs the sidepods, and hot fuel does not forgive a sloppy fill.',
    map: [[0.08,0.8],[0.6,0.84],[0.9,0.76],[0.92,0.5],[0.7,0.4],[0.88,0.2],[0.6,0.1],[0.36,0.2],[0.44,0.42],[0.2,0.5],[0.1,0.62]],
  },
  {
    id: 'givre', name: 'Col du Givre', gp: 'Alpine Grand Prix', laps: 9, theme: 'alpine', par: 8.7,
    mods: ['cold', 'slick'], weather: [], damage: 0.025,
    blurb: 'Two thousand metres up. Wheel nuts freeze, and the tyres must leave their blankets at the right moment.',
    map: [[0.12,0.82],[0.5,0.86],[0.84,0.78],[0.72,0.6],[0.9,0.44],[0.76,0.24],[0.86,0.1],[0.54,0.12],[0.44,0.34],[0.22,0.26],[0.1,0.44],[0.2,0.62]],
  },
  {
    id: 'neon', name: 'Neon Harbour', gp: 'Night Grand Prix', laps: 10, theme: 'neon', par: 8.8,
    mods: ['night', 'walls', 'tightLane'], weather: [], damage: 0.09,
    blurb: 'A street race under the lights. The walls are close, so expect front wings in pieces.',
    map: [[0.1,0.84],[0.5,0.86],[0.86,0.84],[0.86,0.6],[0.66,0.6],[0.66,0.4],[0.88,0.36],[0.86,0.12],[0.4,0.12],[0.4,0.36],[0.14,0.4],[0.1,0.6]],
  },
  {
    id: 'isla', name: 'Isla Grande', gp: 'Season Finale', laps: 11, theme: 'sunset', par: 9.0,
    mods: ['doubleStack', 'rain', 'heat', 'tightLane'], weather: [{ lap: 5.2, wet: 1 }, { lap: 8.4, wet: 0 }], damage: 0.04,
    blurb: 'The decider. Both cars stop on the same lap, a squall rolls through mid-race, and everybody is watching.',
    map: [[0.1,0.76],[0.5,0.86],[0.82,0.82],[0.92,0.6],[0.8,0.36],[0.9,0.16],[0.64,0.12],[0.5,0.3],[0.32,0.14],[0.12,0.24],[0.24,0.48],[0.08,0.56]],
  },
];

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const MOD_INFO = {
  tightLane: ['TIGHT PIT LANE', 'Busy lane. Release on green only.', 'TIGHT LANE'],
  rain: ['RAIN EXPECTED', 'Box for WETS when the rain comes.', 'RAIN'],
  slick: ['SLIPPERY GUNS', 'Less forgiving timing ring on the guns.', 'SLIPPERY'],
  sand: ['SAND', 'Mash X to blow out the sidepods.', 'SAND'],
  heat: ['HEAT', 'Narrow fuel band. Overfill means fire.', 'HEAT'],
  cold: ['COLD', 'Frozen nuts. Pull blankets at the peak.', 'COLD'],
  walls: ['WALLS', 'Wing damage likely. Learn the arrows.', 'WALLS'],
  night: ['NIGHT RACE', 'Racing under the floodlights.', 'NIGHT'],
  doubleStack: ['DOUBLE STACK', 'Both cars pit on the same lap.', 'DOUBLE STACK'],
};
