// Headless pacing bot: plays a whole game with simple rules and prints a timeline.
//   node wasteland/tools/bot.mjs [seed] [maxDays] [--quiet]
import { writeFileSync } from 'node:fs';
import { save, newGame, step, placeBuilding, queueClear, setResearch, recruit, renovate, needsReno, startMSV, canDispatch, dispatchMSV, canPlace, placeRoad, outpostOf } from '../js/world.js';
import { B, TECH, DAY, CHARTER, N, MSV } from '../js/data.js';

const seed = +(process.argv[2] || 1234), maxDays = +(process.argv[3] || 220), quiet = process.argv.includes('--quiet');
const G = newGame(seed);
const out = [];
const say = (m) => { out.push(`d${(G.t / DAY + 1).toFixed(1).padStart(5)}  ${m}`); if (!quiet) console.log(out[out.length - 1]); };
const ORDER = ['carpentry', 'civics', 'masonry', 'metal', 'agronomy', 'glass', 'commerce', 'electric', 'reconstruction', 'printing', 'indag', 'renew', 'battery', 'petro', 'retail', 'ev', 'msv'];
const first = new Set();
let lastLog = 0, dispatched = false, arrived = null;

function spot(s, type) {
  const op = outpostOf(G, s.id), [w, d] = B[type].size;
  for (let r = 2; r < 22; r++) for (let k = 0; k < 8 * r; k++) {
    const a = (k / (8 * r)) * Math.PI * 2, x = Math.round(op.x + 1 + Math.cos(a) * r - w / 2), y = Math.round(op.y + 1 + Math.sin(a) * r - d / 2);
    // leave a one-tile lane between buildings so people can walk
    let gap = true;
    for (let yy = y - 1; yy <= y + d && gap; yy++) for (let xx = x - 1; xx <= x + w && gap; xx++) if (xx >= 0 && yy >= 0 && xx < N && yy < N && G.bld[yy * N + xx] >= 0) gap = false;
    if (gap && canPlace(G, type, x, y, s.id).ok) return [x, y];
  }
  return null;
}
function tryBuild(s, type) {
  if (B[type].tech && !G.research.done[type === '' ? '' : B[type].tech]) return false;
  const p = spot(s, type);
  if (!p) return false;
  const r = placeBuilding(G, type, p[0], p[1], s.id);
  return r.ok;
}
const count = (s, t) => s.blds.filter((b) => b.type === t).length;
const pending = (s) => G.tasks.filter((t) => !t.dead && t.sid === s.id && t.kind !== 'clear').length;

function brain(s) {
  s.autoRecruit = s.sec < 2 + s.pop / 7;
  const op = outpostOf(G, s.id);
  if (!op) return;
  const clears = G.tasks.filter((t) => !t.dead && t.kind === 'clear' && t.sid === s.id).length;
  if (clears < 6) { const R = 4 + Math.min(10, Math.floor(G.t / 200)); queueClear(G, op.x - R, op.y - R, op.x + R + 1, op.y + R + 1); }
  if (pending(s) >= 2) return;
  const c = (t) => count(s, t), R = G.research.done;
  const food = s.res.food, rate = s.rate.food;
  const want = [];
  if (c('farm') < 1 || (rate < 3 && food < 60 && c('farm') < 6)) want.push('farm');
  if (s.house - s.civ < 3) want.push(R.reconstruction && c('tenement') < 6 ? 'tenement' : 'home');
  if (s.id === 0 && c('tinker') < 1) want.push('tinker');
  if (s.sec >= s.bunks - 1 && s.bunks < 2 + s.pop / 7) want.push(R.metal && s.pop > 40 ? 'barracks' : 'guard');
  if (s.id === 0 && c('salvage') < 1 && G.t > 60) want.push('salvage');
  if (s.id === 0 && c('tinker') < 2 && s.pop > 12) want.push('tinker');
  if (R.carpentry && c('lumber') < 1 + (s.pop > 30)) want.push('lumber');
  if (R.civics && c('school') < 1 && s.pop > 14) want.push('school');
  if (R.civics && c('park') < 1 + Math.floor(s.pop / 30)) want.push('park');
  if (R.masonry && c('quarry') < 1 + (s.pop > 35)) want.push('quarry');
  if (R.metal && c('smelter') < 1 + (s.pop > 40)) want.push('smelter');
  if (R.glass && c('glassworks') < 1 + (s.pop > 45)) want.push('glassworks');
  if (R.commerce && c('store') < 1 && s.pop > 20) want.push('store');
  if (R.agronomy && c('greenhouse') < 1 && s.pop > 18) want.push('greenhouse');
  if (R.electric && s.power.dem + 3 > s.power.sup && c('generator') < 3) want.push(R.renew ? (c('windmill') <= c('solar') ? 'windmill' : 'solar') : 'generator');
  if (R.printing && c('newspaper') < 1) want.push('newspaper');
  if (R.indag && c('factoryfarm') < 1) want.push('factoryfarm');
  if (R.battery && c('chickens') < 1) want.push('chickens');
  if (R.battery && c('cattle') < 1) want.push('cattle');
  if (R.renew && c('windmill') < 1) want.push('windmill');
  if (R.renew && c('solar') < 1) want.push('solar');
  if (R.petro && c('refinery') < 1) want.push('refinery');
  if (R.retail && c('mall') < 1) want.push('mall');
  if (R.ev && c('evplant') < 1) want.push('evplant');
  if (R.msv && c('vworks') < 1 && s.id === 0) want.push('vworks');
  if (s.pop >= s.popCap - 2 && R.commerce && c('stall') < 3) want.push('stall');
  if (s.pop >= s.popCap - 2 && R.civics) want.push('park');
  for (const t of want) if (tryBuild(s, t)) return;
  // spare materials: renovate
  if (G.t % 10 < 1) for (const b of s.blds) if (needsReno(G, b) && renovate(G, b.id).ok) break;
}

let next = 0;
while (G.t < maxDays * DAY) {
  step(G, 0.1);
  if (G.t < next) continue;
  next = G.t + 2;
  if (!G.research.cur) { const id = ORDER.find((k) => !G.research.done[k] && TECH[k].req.every((r) => G.research.done[r])); if (id) { setResearch(G, id); } }
  for (const s of G.settlements) { if (!s.blds) continue; brain(s); }
  // MSV
  for (const b of G.buildings) {
    if (b.dead || b.type !== 'vworks' || !b.built) continue;
    if (!b.msv && !dispatched) startMSV(G, b.id);
    if (b.msv && b.msv.ready && !dispatched) {
      for (let tries = 0; tries < 400 && !dispatched; tries++) {
        const x = 8 + Math.floor(Math.random() * (N - 16)), y = 8 + Math.floor(Math.random() * (N - 16));
        if (canDispatch(G, b.id, x, y).ok && dispatchMSV(G, b.id, x, y).ok) { dispatched = true; say(`MSV dispatched to ${x},${y}`); }
      }
    }
  }
  if (G.settlements.length > 1 && !arrived) { arrived = G.t; say(`New town founded: ${G.settlements[1].name}`); }
  for (const t in G.counts) if (G.counts[t] && !first.has(t)) { first.add(t); say(`first ${B[t].name}`); }
  while (lastLog < G.log.length) { const l = G.log[lastLog++]; if (/Research complete|RAIDERS|killed|looted|gave up|unfolded/.test(l.msg)) say(l.msg); }
  if (Math.floor(G.t) % (DAY * 10) < 2) {
    const s = G.settlements[0];
    say(`-- pop ${s.pop} (civ ${s.civ}/${s.house} sec ${s.sec}/${s.bunks} cap ${s.popCap}) food ${s.res.food | 0} (${s.rate.food.toFixed(1)}/d) scrap ${s.res.scrap | 0} wood ${s.res.wood | 0} stone ${s.res.stone | 0} metal ${s.res.metal | 0} glass ${s.res.glass | 0} plastic ${s.res.plastic | 0} kh ${s.kh.toFixed(1)}/d pow ${s.power.sup.toFixed(0)}/${s.power.dem.toFixed(0)} appeal ${s.appeal.toFixed(0)} hostiles ${G.units.filter((u) => u.kind === 'mutant' || u.kind === 'raider').length}`);
  }
  if (arrived && G.t > arrived + DAY * 15) break;
}
const done = CHARTER.filter((c) => c.test(G.counts, G)).length;
console.log(`\nseed ${seed}: day ${(G.t / DAY + 1).toFixed(0)}, charter ${done}/${CHARTER.length}, towns ${G.settlements.length}, pop ${G.settlements.map((s) => s.pop).join('+')}, killed ${G.stats.killed}, hostiles killed ${G.stats.hostilesKilled}, techs ${Object.keys(G.research.done).length}/${Object.keys(TECH).length}`);
if (quiet) console.log(out.filter((l) => /first|Research|MSV|founded|RAIDERS/.test(l)).slice(-12).join('\n'));
const si = process.argv.indexOf('--save');
if (si > 0) { writeFileSync(process.argv[si + 1], save(G)); console.log('saved', process.argv[si + 1]); }
void MSV; void placeRoad; void recruit;
