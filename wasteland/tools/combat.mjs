import { newGame, step, dev, recruit, outpostOf } from '../js/world.js';
const G = newGame(77), d = dev(G), s = G.settlements[0];
d.settlers(0, 6); for (let i = 0; i < 25; i++) step(G, 0.1);
s.res.food = 100; s.res.scrap = 100;
console.log(recruit(G, 0), recruit(G, 0));
for (let i = 0; i < 50; i++) step(G, 0.1);
const op = outpostOf(G, 0);
// three raiders 12 tiles out
for (let k = 0; k < 3; k++) { const at = d.spawn('raider'); }
let t0 = G.t;
for (let i = 0; i < 900; i++) {
  step(G, 0.1);
  if (i % 50 === 0) console.log((G.t - t0).toFixed(0), G.units.map(u => `${u.kind[0]}${u.hp | 0}${u.hidden ? 'h' : ''}${u.st ? ':' + u.st : ''}@${u.x.toFixed(0)},${u.y.toFixed(0)}`).filter(x => !x.startsWith('c')).join(' '));
}
console.log('killed', G.stats.killed, 'hostiles killed', G.stats.hostilesKilled);
