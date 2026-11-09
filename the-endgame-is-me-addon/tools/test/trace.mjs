// The reference run: the browser game's own modules under Node, same inputs as tools/test/trace.lua.
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const [seed = 1, level = 1, steps = 600, every = 20, kit = 0, hop = 0] = process.argv.slice(2).map(Number);
const here = path.dirname(fileURLToPath(import.meta.url));
// the Lua side keeps path distances as doubles and has no fused hypot, so the reference does the same
globalThis.Float32Array = Float64Array;
Math.hypot = (a, b, c) => Math.sqrt(a * a + b * b + (c === undefined ? 0 : c * c));
const W = await import(pathToFileURL(path.resolve(here, '../../../the-endgame-is-me/js/world.js')));
const g = W.createGame(seed);
if (level > 1) W.jumpToLevel(g, level);
if (kit > 0) {
  g.points = 1e9;
  for (const id of ['summon', 'beam', 'ice', 'charge', 'haste', 'tail', 'fur']) W.buyAbility(g, id);
  const all = ['swipe', 'stomp', 'breath', 'roar', 'summon', 'beam', 'ice', 'charge', 'haste', 'tail', 'fur'];
  all.forEach((id, j0) => { for (let k = 0; k < (kit + j0 + 1) % 4; k++) W.upgradeAbility(g, id); });
  const act = ['swipe', 'stomp', 'breath', 'roar', 'summon', 'beam', 'ice', 'charge', 'haste', 'tail'];
  for (let sl = 0; sl < 5; sl++) W.setSlot(g, sl, act[(kit * 3 + sl * 2) % 10]);
}
const r = x => String(Math.floor(x * 1e4 + 0.5));
const DT = 1 / 60, out = [];
for (let i = 0; i < steps; i++) {
  const b = g.boss, m = g.map;
  let ax, ay;
  if (m.A) {
    const d = g.lastMark === 'A' ? m.B : m.A, dx = d.x - b.x, dy = d.y - b.y;
    ax = dx > 1 ? 1 : dx < -1 ? -1 : 0; ay = dy > 1 ? 1 : dy < -1 ? -1 : 0;
  } else { ax = Math.floor(i / 200) % 3 - 1; ay = Math.floor(i / 300) % 3 - 1; }
  const press = {};
  if (i % 300 === 150) press.slot1 = true;
  if (i % 400 === 100) press.slot2 = true;
  if (i % 700 === 350) press.slot3 = true;
  if (i % 50 === 25) press.shake = true;
  if (kit > 0) {
    if (i % 90 === 10) press.slot0 = true;
    if (i % 230 === 60) press.slot4 = true;
    if (b.hp < b.maxhp * 0.5 && !b.dead) b.hp = b.maxhp;
  }
  W.step(g, { mx: b.x + ax * 30 + i % 7, my: b.y + ay * 30 + 1, ax, ay, press, hold: { slot0: true } }, DT);
  g.events.length = 0;
  if (hop > 0 && i % hop === hop - 1 && g.map.n < 7 && !g.boss.dead) g.clear = { t: 99 };
  if (g.store) W.nextMap(g);
  if (i % every === 0 || i === steps - 1) out.push([i, r(g.t), r(g.score), r(b.hp), r(b.x), r(b.y), g.units.length, g.parties.length, g.props.length, g.critters.length, g.parts.length, g.rng.rngState()].join(' '));
}
console.log(out.join('\n'));
