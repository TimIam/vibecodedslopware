// Headless balance check: the greedy advisor plays every mission N times.
//   node ceasefire/sim.mjs [games=10] [missionId]
import { MISSIONS } from './js/missions.js';
import { Game, advise } from './js/game.js';

const N = Number(process.argv[2] || 10), only = process.argv[3];
for (const m of MISSIONS) {
  if (only && m.id !== only) continue;
  const res = { win: 0, checkmate: 0, mandate: 0, self: 0 }, rounds = [], stars = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const g = new Game(m);
    let guard = 0;
    while (g.phase !== 'over' && guard++ < 1000) {
      if (g.phase === 'ai') g.aiMove();
      else g.act(advise(g));
    }
    const r = g.result;
    if (r.win) { res.win++; if (r.reason === 'self') res.self++; rounds.push(g.round - 1); stars.push(r.stars); }
    else res[r.reason]++;
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  console.log(`${m.id.padEnd(13)} win ${res.win}/${N} (self ${res.self})  mate ${res.checkmate}  expired ${res.mandate}  rounds ${avg(rounds)}  stars ${avg(stars)}  ${((Date.now() - t0) / N / 1000).toFixed(1)}s/game`);
}
