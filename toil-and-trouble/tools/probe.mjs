// probe: drop the witch at a tile and run a script of inputs, logging state. Dev tool.
//   node toil-and-trouble/tools/probe.mjs <level> <col> <row> '<json script: [[frames,{input}],...]>'
import { createWorld, step } from '../js/world.js';
import { LEVELS } from '../js/levels.js';
const [id, c, r, script] = process.argv.slice(2);
const L = LEVELS.find((l) => l.id === id);
const g = createWorld(L, { lives: 5, cards: 0, letters: {} }, { nofx: true });
g.p.x = +c * 16 + 8 - g.p.w / 2; g.p.y = (+r + 1) * 16 - g.p.h;
let f = 0;
for (const [n, inp] of JSON.parse(script || '[[60,{}]]')) {
  for (let i = 0; i < n; i++) {
    step(g, inp); f++;
    const ev = g.ev.map((e) => e.k === 'sfx' ? e.n : e.k).join(' '); g.ev.length = 0;
    if (i % 6 === 0 || ev) console.log(String(f).padStart(4), 'col', ((g.p.x + g.p.w / 2) / 16).toFixed(1), 'row', ((g.p.y + g.p.h) / 16).toFixed(2), g.p.state, g.p.pose, 'vx', g.p.vx.toFixed(2), 'vy', g.p.vy.toFixed(2), ev);
    if (g.p.state === 'dead' && g.p.stateT > 2) { console.log('DEAD', g.p.why); process.exit(); }
  }
}
