// Headless balance bot for Boss Hours 2: patrols the path, fights whatever is near, shakes off the horse guy and
// picks level-up cards, then reports when the cards came, how rare they were, and how the run ended.
//   node boss-hours-2/tools/bot.mjs [runs=8] [minutes=40] [--idle] [--verbose]
// --idle only patrols (no abilities); --verbose lists every card taken; TRACE=<run> prints that run's state each minute.
import { createGame, step, pickCard, needsSlot, destRock, pathNearest, inZone, RARITY, pathDist, LEASH } from '../js/world.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const RUNS = Number(args[0] || 8), MINUTES = Number(args[1] || 40);
const IDLE = process.argv.includes('--idle'), VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 60;

function drive(g) {
  const b = g.boss, m = g.map;
  const foes = g.units.filter(u => !u.dead && !u.gone && u.state !== 'flee' && !(u.role === 'rider' && u.state === 'climb'));
  const near = foes.map(u => ({ u, d: Math.hypot(u.x - b.x, u.y - b.y) })).sort((a, c) => a.d - c.d);
  // walk the path toward the rock you are due at
  const here = pathNearest(m, b.x, b.y), i = m.pts.indexOf(here), R = destRock(g);
  const fwd = R === m.B ? 1 : -1;
  const tgt = m.pts[Math.max(0, Math.min(m.pts.length - 1, i + fwd * 9))];
  let ax = tgt.x - b.x, ay = tgt.y - b.y;
  if (Math.hypot(R.x - b.x, R.y - b.y) < 20) { ax = R.x - b.x; ay = R.y - b.y; }
  // once the 40-man is in, hunt down stragglers (staying on the leash) rather than pacing
  if (g.dir.final && near.length && near.length <= 8) { const f = near.find(e => pathDist(m, e.u.x, e.u.y) < LEASH - 8); if (f && f.d > 14) { ax = f.u.x - b.x; ay = f.u.y - b.y; } }
  const l = Math.hypot(ax, ay) || 1;
  ax /= l; ay /= l;
  // aim at the nearest few heroes, else down the path
  let mx = b.x + ax * 30, my = b.y + ay * 30;
  if (near.length && near[0].d < 70) {
    const k = near.slice(0, 4);
    mx = k.reduce((s, e) => s + e.u.x, 0) / k.length; my = k.reduce((s, e) => s + e.u.y, 0) / k.length;
  }
  const press = {}, hold = {};
  if (IDLE) return { mx, my, ax, ay, press, hold };
  const count = (ab, pad = 0) => foes.filter(u => inZone(g, ab, u.x, u.y, pad)).length;
  const within = r => near.filter(e => e.d < r).length;
  const fighting = g.parties.some(p => p.engaged);
  g.slots.forEach((ab, s) => {
    if (!ab || b.cd[ab] > 0) return;
    const want = {
      swipe: count('swipe') >= 1, stomp: count('stomp') >= 2, breath: count('breath', 4) >= 2, roar: within(g.abil.roar.range) >= 5 || (b.hp < b.maxhp * 0.35 && within(50) >= 2),
      tail: count('tail') >= 2, summon: fighting && within(90) >= 2, beam: count('beam') >= 3, ice: within(g.abil.ice.range) >= 3,
      charge: count('charge') >= 2, haste: !fighting,
    }[ab];
    if (want) press['slot' + s] = true;
  });
  if (g.units.some(u => u.role === 'rider' && u.state === 'climb') && b.cd.shake <= 0) press.shake = true;
  return { mx, my, ax, ay, press, hold };
}

// card policy: rarity first, then new abilities, then upgrades to what is slotted
function choose(g) {
  const cs = g.offer.cards;
  let best = 0, bs = -1;
  cs.forEach((c, i) => {
    let s = c.r * 3 + g.rng();
    if (c.kind === 'unlock') s += g.slots.includes(null) ? 6 : 1.5;
    if (c.kind === 'up') s += 2;
    if (c.kind === 'hp') s += 1.5;
    if (s > bs) { bs = s; best = i; }
  });
  let slot;
  if (needsSlot(g, best)) {
    // replace whatever has had the least put into it
    const inv = g.slots.map(k => g.inv[k] || 0);
    slot = inv.indexOf(Math.min(...inv));
  }
  return { i: best, slot };
}

function trace(g, minute) {
  const live = p => p.units.filter(u => !u.dead && !u.gone);
  console.log(`  t ${minute}  parties ${g.parties.map(p => p.type + ':' + live(p).length + (p.engaged ? 'E' : '') + ' ' + [...new Set(live(p).map(u => u.state))].join('/')).join(' | ')}` +
    `  laps ${g.lapsMap} final ${g.dir.final} adds ${g.adds.length} hp ${Math.round(g.boss.hp)}/${g.boss.maxhp} lvl ${g.lv.level}`);
}

const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const all = [];
for (let run = 0; run < RUNS; run++) {
  const g = createGame(1000 + run * 77);
  const levels = [], maps = [];
  let lastMap = 1, crashed = null, powerAt = {}, scoreAt = {};
  try {
    while (g.t < MINUTES * 60 && !g.over) {
      if (g.offer) {
        const why = g.offer.why, ch = choose(g), c = g.offer.cards[ch.i];
        levels.push({ t: g.t, why, r: c.r, title: c.title, rs: g.offer.cards.map(x => x.r) });
        const res = pickCard(g, ch.i, ch.slot);
        if (res !== true) throw new Error('pickCard returned ' + res);
        continue;
      }
      step(g, drive(g), DT);
      if (g.units.some(u => !u.dead && (Number.isNaN(u.x) || Number.isNaN(u.y)))) throw new Error('a hero has a NaN position');
      g.events.length = 0;
      if (g.map.n !== lastMap) { maps.push(g.t); lastMap = g.map.n; }
      const minute = Math.floor(g.t / 60);
      if (process.env.TRACE == run && scoreAt[minute] == null) trace(g, minute);
      if (scoreAt[minute] == null) scoreAt[minute] = Math.round(g.score / 1000);
      if (!powerAt[minute] && g.parties.length) powerAt[minute] = Math.max(...g.parties.map(p => p.power)).toFixed(2);
    }
  } catch (e) { crashed = e.stack; }
  const gaps = levels.filter(l => l.why === 'LEVEL UP').map((l, i, a) => l.t - (i ? a[i - 1].t : 0));
  const res = { run, t: g.t, over: g.over, score: Math.round(g.score), level: g.lv.level, cards: levels.length, maps: g.maps,
    rare: g.lv.rare, wipes: g.wipes, slots: g.slots.join(","), look: g.look, gaps, levels, mapTimes: maps.map(fmtT), crashed, powerAt };
  all.push(res);
  console.log(`run ${run}: ${g.over ? 'died' : 'alive'} at ${fmtT(g.t)}  score ${res.score}  lvl ${res.level}  cards ${res.cards}  maps cleared ${g.maps} (${res.mapTimes.join(" ")})  ` +
    `rarity ${g.lv.rare.join('/')}  wipes d${g.wipes.dungeon} r${g.wipes.raid} f${g.wipes.final} h${g.wipes.rider}  slots ${res.slots}`);
  console.log(`   first card ${levels[0] ? fmtT(levels[0].t) : '-'}; level-up gaps (s): ${gaps.map(x => Math.round(x)).join(' ')}`);
  console.log(`   score (k) by minute: ${Object.values(scoreAt).join(' ')}`);
  console.log(`   party power by minute: ${Object.entries(powerAt).map(([k, v]) => k + ':' + v).join(' ')}`);
  console.log(`   look: ${Object.entries(g.look).filter(([, v]) => v).map(([k, v]) => k + v).join(' ')}  maxhp ${g.boss.maxhp}`);
  if (VERBOSE) for (const l of levels) console.log(`     ${fmtT(l.t)} ${l.why.padEnd(12)} [${l.rs.map(r => RARITY[r].name[0]).join('')}] took ${RARITY[l.r].name} ${l.title}`);
  if (crashed) console.log('   CRASH', crashed);
}
const avg = f => (all.reduce((s, r) => s + f(r), 0) / all.length).toFixed(1);
console.log(`\nmean survival ${avg(r => r.t / 60)} min, cards ${avg(r => r.cards)}, maps ${avg(r => r.maps)}, crashes ${all.filter(r => r.crashed).length}`);
const tot = [0, 0, 0, 0]; for (const r of all) r.levels.forEach(l => l.rs.forEach(x => tot[x]++));
console.log(`rarity of all cards dealt: ${tot.map((n, i) => RARITY[i].name + ' ' + n).join(', ')}`);
