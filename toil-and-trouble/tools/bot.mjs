#!/usr/bin/env node
// Solvability check: a best-first search over held-button macros, run on the real simulation (world.js), to show
// every level can be finished. It is a sanity check, not a proof: it ignores time when it marks places as seen.
//
//   node toil-and-trouble/tools/bot.mjs [levelId ...] [--budget 60000] [--from x,y] [--verbose]
//
// Prints, per level: solved or not, frames, cards, letters, whether the partner survived, and where it got stuck.
import { createWorld, step, STATS } from '../js/world.js';
import { allLevels } from '../js/worlds.js';
const LEVELS = allLevels();

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const BUDGET = +opt('budget', 60000);
const verbose = args.includes('--verbose');
const WAIT = args.includes('--wait');
const from = opt('from', null);

const K = 8;
const ACTIONS = [
  { right: 1 }, { right: 1, act: 1 }, { right: 1, jump: 1 }, { right: 1, act: 1, jump: 1 }, { right: 1, jump: 'tap' },
  { left: 1 }, { left: 1, jump: 1 }, { left: 1, act: 1, jump: 1 }, {}, { jump: 1 }, { act: 'tap', right: 1 }, { act: 'tap', left: 1 }, { right: 1, act: 'tap', jump: 'late' },
];

function clone(g) {
  const { def, press, rel, map, ...rest } = g;
  const c = structuredClone({ ...rest, map: { ...map, chars: null, spawns: null } });
  c.def = def; c.map.chars = map.chars; c.map.spawns = map.spawns;
  return c;
}
function run(g, a) {
  for (let i = 0; i < K; i++) {
    const inp = { left: a.left || 0, right: a.right || 0, up: 0, down: 0, act: 0, jump: 0, tag: 0, pause: 0 };
    if (a.act === 1) inp.act = 1; else if (a.act === 'tap') inp.act = i < 2 ? 1 : 0;
    if (a.jump === 1) inp.jump = 1; else if (a.jump === 'tap') inp.jump = i < 3 ? 1 : 0; else if (a.jump === 'late') inp.jump = i >= 4 ? 1 : 0;
    step(g, inp);
    g.ev.length = 0;
    if (g.p.state === 'dead' || g.state === 'clear' || g.p.state === 'warp') break;
  }
}

function solve(L) {
  const vertical = L.order === 'y';
  const runState = { lives: 5, cards: 0, letters: {} };
  const g0 = createWorld(L, runState, { nofx: true });
  if (from) { const [x, y] = from.split(',').map(Number); g0.p.x = x * 16; g0.p.y = y * 16 - g0.p.h; }
  const boss = (g) => g.ents.find((e) => e.type === 'boss');
  const score = L.boss
    ? (g) => { const b = boss(g); return (b ? (b.maxHp - b.hp) * 4000 : 30000 + g.p.x) + (g.partner ? 600 : 0) + (g.p.carry ? 150 : 0) + g.frame * 0.4; }
    : (g) => (vertical ? (g.map.hpx - g.p.y - g.p.h) * 1.0 : g.p.x) + (g.partner ? 40 : 0) - g.frame * 0.02;
  const key = (g) => {
    const p = g.p, b = L.boss && boss(g);
    return [Math.floor((p.x + p.w / 2) / 12), Math.floor((p.y + p.h) / 12), p.state === 'cannon' ? 'c' + Math.round((p.cannon?.ang || 0) * 4) : p.state, p.onGround ? 1 : 0, Math.round(p.vx / 1.4), p.carry ? 1 : 0,
      WAIT || L.boss ? Math.floor(g.frame / 20) % 15 : 0, b ? b.hp + ':' + Math.floor(b.x / 24) + b.mode[0] : '', L.boss ? (g.partner ? 1 : 0) : ''].join(',');
  };
  const seen = new Set([key(g0)]);
  let open = [{ g: g0, path: [], s: score(g0) }];
  let best = open[0], n = 0;
  while (open.length && n < BUDGET) {
    // pop best
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].s > open[bi].s) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    for (const a of ACTIONS) {
      if (cur.g.p.state === 'cannon' && a !== ACTIONS[8] && a !== ACTIONS[9]) continue;
      const g = clone(cur.g);
      run(g, a);
      n++;
      if (g.state === 'clear') return { ok: true, g, path: [...cur.path, a], n };
      if (g.p.state === 'dead' || g.p.state === 'warp') continue;
      const k = key(g);
      if (seen.has(k)) continue;
      seen.add(k);
      const node = { g, path: [...cur.path, a], s: score(g) };
      open.push(node);
      if (node.s > best.s) best = node;
    }
    if (open.length > 6000) { open.sort((a, b) => b.s - a.s); open.length = 3000; }
  }
  return { ok: false, g: best.g, path: best.path, n };
}

const list = ids.length ? LEVELS.filter((l) => ids.includes(l.id) || ids.includes(l.world)) : LEVELS.filter((l) => !l.isBoss);
for (const L of list) {
  const t0 = Date.now();
  const r = solve(L);
  const p = r.g.p;
  const where = `col ${Math.floor((p.x + p.w / 2) / 16)} row ${Math.floor((p.y + p.h - 1) / 16)}`;
  console.log(`${L.id.padEnd(8)} ${r.ok ? 'SOLVED' : 'STUCK '} frames ${String(r.g.frame).padStart(5)}  cards ${String(r.g.run.cards).padStart(3)}  letters ${r.g.letters.map((x) => (x ? 1 : 0)).join('')}  partner ${r.g.partner || '-'}  ${r.ok ? '' : 'furthest ' + where}  (${r.n} sims, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (verbose && !r.ok) console.log('  state', p.state, p.kind, 'x', p.x.toFixed(1), 'y', p.y.toFixed(1), 'boss hp', (r.g.ents.find((e) => e.type === 'boss') || {}).hp, 'pots', r.g.ents.filter((e) => e.type === 'pot').map((e) => e.state + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' '));
}
