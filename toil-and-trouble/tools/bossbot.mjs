// Boss check: a scripted player grabs cauldrons and throws them at the Witchfinder, hopping his charges and
// stepping away from his flasks. Tells us whether the fight can be won and how long it takes.
//   node toil-and-trouble/tools/bossbot.mjs [runs]
import { createWorld, step } from '../js/world.js';
import { LEVELS } from '../js/levels.js';
const L = LEVELS.find((l) => l.boss);
const runs = +(process.argv[2] || 10);
let wins = 0;
for (let k = 0; k < runs; k++) {
  const g = createWorld(L, { lives: 5, cards: 0, letters: {} }, { nofx: true });
  let f = 0, hits = 0, hurts = 0, prevAct = 0, wait = (k * 7) % 23;
  while (f < 60 * 240 && g.state !== 'clear' && g.p.state !== 'dead') {
    const p = g.p, b = g.ents.find((e) => e.type === 'boss');
    const px = p.x + p.w / 2;
    const inp = {};
    if (!b) {
      const goal = g.ents.find((e) => e.type === 'goal');
      if (goal) { if (goal.x + 16 > px) inp.right = 1; else inp.left = 1; }
    } else {
      const bx = b.x + b.w / 2, dx = bx - px;
      const toward = b.mode === 'roll' && Math.sign(b.vx) === Math.sign(-dx);
      if (p.carry) {
        inp.act = 1;
        const face = dx > 0 ? 1 : -1;
        if (p.face !== face) inp[face > 0 ? 'right' : 'left'] = 1;
        else if (Math.abs(dx) < 150 && b.inv <= 0 && !b.dying && wait-- <= 0) { inp.act = 0; wait = 8 + (k * 5) % 20; }
      } else {
        const pots = g.ents.filter((e) => e.type === 'pot' && e.state === 'rest' && e.onGround && Math.abs(e.y + e.h - p.y - p.h) < 6);
        pots.sort((a, c) => Math.abs(a.x + 7 - px) - Math.abs(c.x + 7 - px));
        const pot = pots[0];
        if (pot) {
          const d = pot.x + 7 - px;
          if (Math.abs(d) > 8) inp[d > 0 ? 'right' : 'left'] = 1;
          if (Math.sign(dx) === Math.sign(d) && Math.abs(dx) < Math.abs(d) && Math.abs(dx) < 62 && (p.onGround || p.ride)) inp.jump = 1;
          else if (!prevAct && p.onGround && Math.abs(p.vx) < 0.6 && p.state === 'normal') inp.act = 1;
        } else inp[dx > 0 ? 'left' : 'right'] = 1;
      }
      if (toward && Math.abs(dx) < 64 + Math.abs(b.vx) * 10 && p.onGround) inp.jump = 1;
      if (toward && !p.onGround) inp[dx > 0 ? 'right' : 'left'] = 1;
      if (p.ride === b && b.mode === 'roll') inp[b.vx > 0 ? 'right' : 'left'] = 0;
      if (b.mode === 'slam' && b.modeT > 14 && b.modeT < 30 && p.onGround && Math.abs(dx) < 90) inp.jump = 1;
      if (b.mode === 'arm' && b.modeT > 30 && b.modeT < 46 && Math.abs(dx) < 80) inp[dx > 0 ? 'left' : 'right'] = 1;
      for (const s of g.ents) if (s.type === 'shot' && !s.landed && s.vy > 0 && Math.abs(s.x + s.vx * 12 - px) < 22) inp[s.x > px ? 'left' : 'right'] = 1;
      if (inp.jump && g.inp.jump && (p.onGround)) inp.jump = 0;
    }
    prevAct = inp.act || 0;
    step(g, inp); f++;
    for (const e of g.ev) { if (e.k === 'bossHit') hits++; if (e.k === 'lost') hurts++; }
    g.ev.length = 0;
  }
  const won = g.state === 'clear';
  if (won) wins++;
  const b = g.ents.find((e) => e.type === 'boss');
  console.log(`run ${k}: ${won ? 'WON' : g.p.state === 'dead' ? 'died (' + g.p.why + ')' : 'timeout'} in ${(f / 60).toFixed(1)}s, hits ${hits}, hurt ${hurts}, boss hp ${b ? b.hp : 0}`);
}
console.log(`${wins}/${runs} won`);
