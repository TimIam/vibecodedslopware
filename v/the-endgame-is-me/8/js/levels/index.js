// The campaign, in order. Each level module exports:
//   n, id, name, sub (banner line), mode: 'patrol' | 'chaos' | 'timed'
//   kinds, critters, adds    — prop, critter and add definitions it introduces (see props.js and ADDS in world.js)
//   build(g, rng)            — returns the map: { w, h, scroll: 'none' | 'x' | 'y', start: { x, y, face }, ... } and
//                              fills the level with addProp / addCritter / makeWater (not used by 'patrol' levels)
//   update(g, dt, api)       — optional per-step logic; 'timed' levels end themselves with api.endLevel / api.win
//   hud(g)                   — optional progress line for the HUD
//   art: { ground(ctx, m, h), decorate(ctx, m, h), props: { kind: draw }, critters: { kind: draw }, adds: { kind: draw },
//          corpses: { kind: draw }, under(ctx, g, h), over(ctx, g, h), canopy: true|false }
// Modes: 'patrol' walks the rock-to-rock path (laps); 'chaos' fills a Chaos meter by wrecking the level (raids at 50%
// and 100%, beating the 100% raid ends the level); 'timed' sends raids on a timer and the level decides when it ends.

import clearing from './clearing.js';
import forest from './forest.js';
import farms from './farms.js';
import village from './village.js';
import wall from './wall.js';
import city from './city.js';
import castle from './castle.js';

export const LEVELS = [clearing, forest, farms, village, wall, city, castle];

export const levelFor = n => LEVELS[Math.min(n, LEVELS.length) - 1];
export const lastLevel = () => LEVELS.length;
