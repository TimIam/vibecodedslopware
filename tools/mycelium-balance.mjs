// Headless balance check for mycelium/sim.js. Not part of the deploy.
//   node tools/mycelium-balance.mjs [kind] [difficulty] [minutes] [steer]
// `steer` = 1 paints attractant toward the nearest un-colonised food every 4s, like a player would.
import { Sim, W, H, FOOD, TPS } from '../mycelium/sim.js';

const kind = process.argv[2] || 'lawn', diff = Number(process.argv[3] || 0), mins = Number(process.argv[4] || 5), steer = process.argv[5] === '1';
const sim = new Sim(12345, kind, diff);
console.log(`plot=${kind} difficulty=${diff} steer=${steer} food cells=${[...sim.terrain].filter(t => t === FOOD).length}`);
const total = mins * 60 * TPS;
let lastLog = 0;
for (let t = 1; t <= total; t++) {
  sim.tick();
  if (steer && t % 120 === 0) {
    let best = -1, bi = -1;
    for (let i = 0; i < W * H; i++) if (sim.terrain[i] === FOOD && sim.hyph[0][i] <= 0) { const x = i % W, y = (i - x) / W; const v = sim.food[i] / (1 + Math.hypot(x - sim.core[0].x, y - sim.core[0].y) * .1); if (v > best) { best = v; bi = i; } }
    if (bi >= 0) sim.paint(bi % W, Math.floor(bi / W), false, .8);
  }
  if (t % (TPS * 30) === 0) {
    console.log(`${(t / TPS / 60).toFixed(1)}m  you: E=${sim.energy[0].toFixed(0)} cells=${sim.hyphCount[0]} tips=${sim.tips[0].length} spores=${sim.spores[0]} shrooms=${sim.shrooms.filter(m => !m.side).length} water=${sim.avgMoisture(0).toFixed(2)} | rival: E=${sim.energy[1].toFixed(0)} cells=${sim.hyphCount[1]} tips=${sim.tips[1].length} | grubs=${sim.grubs.length} weather=${sim.weather} state=${sim.state}`);
    for (const l of sim.log.slice(lastLog)) console.log('    ·', l.msg);
    lastLog = sim.log.length;
    if (sim.state !== 'play') break;
  }
}
console.log('result:', sim.state, sim.result);
