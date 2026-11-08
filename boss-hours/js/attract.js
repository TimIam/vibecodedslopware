// The title screen's attract mode: short random fights on random levels, with the boss playing by itself.

import { createGame, step, jumpToLevel, W, H, ABILITIES, newParty, mkUnit, applyLevels } from './world.js';
import { LEVELS } from './levels/index.js';
import * as P from './props.js';

const DT = 1 / 60;
const ACTIVE = ABILITIES.filter(a => !a.passive).map(a => a.id);
const OPENERS = ['swipe', 'stomp', 'breath', 'tail', 'beam', 'charge'];   // these do damage straight away
const RANGE = { swipe: 28, stomp: 32, breath: 58, tail: 26, beam: 150, charge: 55, ice: 40, roar: 80, summon: 220, haste: 220 };
const MELEE = ['warrior', 'rogue', 'berserker', 'paladin'], BACKLINE = ['priest', 'druid', 'mage', 'warlock', 'hunter'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
function shuffled(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// somewhere the boss can stand, on the part of the level the camera can show
function findSpot(g) {
  const m = g.map, a = m.arena, r = g.boss.r + 8;
  if (m.mode === 'patrol') { const p = pick(m.pts.slice(4, -4)); return { x: p.x, y: p.y }; }
  for (let i = 0; i < 40; i++) {
    const x = rnd(Math.max(a.x0 + 40, 40), Math.min(a.x1 - 40, m.w - 40)), y = rnd(Math.max(a.y0 + 36, 36), Math.min(a.y1 - 30, m.h - 30));
    if (g.props.some(p => p.state !== 'gone' && p.state !== 'down' && P.touches(p, x, y, r))) continue;
    if (g.water && P.hitsWater(g, x, y, r)) continue;
    return { x, y };
  }
  return { x: g.boss.x, y: g.boss.y };
}

// heroes bunch up where the opening attack is pointed, close enough that it lands on the first swing
function cast(g, p, classes, spot, aim) {
  const a = g.map.arena;
  classes.forEach(cls => {
    const ang = Math.random() < 0.7 ? aim.dir + rnd(-0.8, 0.8) : rnd(0, Math.PI * 2), d = rnd(10, aim.reach);
    const x = Math.max(a.x0, Math.min(a.x1, spot.x + Math.cos(ang) * d)), y = Math.max(a.y0, Math.min(a.y1, spot.y + Math.sin(ang) * d));
    const u = mkUnit(g, p, cls, x, y);
    u.state = 'fight';
    u.home = { x, y };
    u.slotA = ang;
    u.slotD = u.role === 'melee' || u.role === 'tank' ? rnd(0, 4) : rnd(34, 52);
    u.hp = u.maxhp = u.maxhp * rnd(0.3, 0.8);   // thin enough that some of them drop before the cut
  });
  p.engaged = true; p.engT = g.t;
  p.skill = { ...p.skill, dodge: 0.1 };   // nobody on the title has read the guide
}

// the cast of a segment: who turned up for this one
const SCENES = [
  (g, s, aim) => cast(g, newParty(g, 'dungeon'), ['warrior', pick(['priest', 'druid']), pick(MELEE), pick(BACKLINE), pick(BACKLINE)], s, aim),
  (g, s, aim) => cast(g, newParty(g, 'raid'), ['warrior', 'warrior', ...Array.from({ length: 12 }, () => pick([...MELEE, ...BACKLINE]))], s, aim),
  (g, s, aim) => cast(g, newParty(g, 'raid'), Array.from({ length: 9 }, () => pick(MELEE)), s, aim),
  (g, s, aim) => cast(g, newParty(g, 'raid'), Array.from({ length: 9 }, () => pick(BACKLINE)), s, aim),
  (g, s, aim) => {
    cast(g, newParty(g, 'dungeon'), ['paladin', pick(BACKLINE), pick(MELEE)], s, aim);
    const p = newParty(g, 'rider'), a = rnd(0, Math.PI * 2);
    const x = Math.max(g.map.arena.x0, Math.min(g.map.arena.x1, s.x + Math.cos(a) * 48)), y = Math.max(g.map.arena.y0, Math.min(g.map.arena.y1, s.y + Math.sin(a) * 48));
    const u = mkUnit(g, p, 'rider', x, y);
    Object.assign(u, { state: 'arrive', mounted: true, grip: 100, hface: 0, horse: { x, y, face: 0, walk: 0 } });
    p.engaged = true;
  },
];

export function createAttract(getLook) {
  let bag = [], last = 0, acc = 0;
  const log = [];   // recent segments; the tests read this
  const self = { g: null, t: 0, dur: 3, fresh: true, log, update, next };

  function nextOpener() {
    if (!bag.length) bag = shuffled(OPENERS);
    return bag.pop();
  }

  function next() {
    let n;
    do n = 1 + Math.floor(Math.random() * LEVELS.length); while (n === last);
    last = n;
    const g = createGame((Math.random() * 2 ** 32) >>> 0, getLook());
    if (n > 1) jumpToLevel(g, n);
    g.dir.final = true;   // the director stays home; this segment's cast is the whole cast
    const first = nextOpener();
    // at least three attacks that hurt; the utility ones come after them
    const hits = shuffled(OPENERS.filter(a => a !== first)).slice(0, 2);
    const extras = shuffled(ACTIVE.filter(a => a !== first && !hits.includes(a))).slice(0, 2);
    const kit = [first, ...hits, ...extras];
    g.owned = new Set(ACTIVE);
    g.slots = kit;
    g.lvl = Object.fromEntries(ACTIVE.map(a => [a, Math.floor(rnd(0, 3))]));
    applyLevels(g);
    const spot = findSpot(g), b = g.boss, m = g.map;
    const face = rnd(-3, 3);
    Object.assign(b, { x: spot.x, y: spot.y, face: first === 'tail' ? face + Math.PI : face, hp: b.maxhp });
    g.cam.x = m.scroll === 'x' || m.scroll === 'xy' ? Math.max(0, Math.min(m.w - W, b.x - W / 2)) : 0;
    g.cam.y = m.scroll === 'y' || m.scroll === 'xy' ? Math.max(0, Math.min(m.h - H, b.y - H / 2 - 8)) : 0;
    pick(SCENES)(g, spot, { dir: face, reach: Math.max(26, Math.min(62, RANGE[first] * 0.9)) });
    g.banner = null;
    self.g = g; self.t = 0; self.dur = rnd(2, 5); self.fresh = true;
    self.plan = { kit, at: 0.12, order: kit, i: 0 };
    self.rec = { level: n, dur: self.dur, cast: [], heroes: new Set(), damage: 0, killed: 0 };
    log.push(self.rec);
    if (log.length > 60) log.shift();
  }

  function stepOne() {
    const g = self.g, b = g.boss, plan = self.plan;
    const live = g.units.filter(u => !u.dead && !u.gone && u.role !== 'rider');
    const near = live.reduce((a, u) => !a || Math.hypot(u.x - b.x, u.y - b.y) < Math.hypot(a.x - b.x, a.y - b.y) ? u : a, null);
    const tx = near ? near.x : b.x + Math.cos(b.face) * 40, ty = near ? near.y : b.y + Math.sin(b.face) * 40;
    const id = plan.order[plan.i % plan.order.length], dist = Math.hypot(tx - b.x, ty - b.y) || 1;
    const inp = { mx: tx, my: ty, ax: 0, ay: 0, press: {}, hold: {} };
    if (id === 'tail') { inp.mx = b.x * 2 - tx; inp.my = b.y * 2 - ty; }
    if (dist > RANGE[id] * 0.8 && !b.act) { inp.ax = (tx - b.x) / dist; inp.ay = (ty - b.y) / dist; }
    if (!b.act && self.t >= plan.at && (dist <= RANGE[id] || self.t > plan.at + 0.5)) {
      b.cd[id] = 0;
      inp.press[`slot${g.slots.indexOf(id)}`] = true;
      self.rec.cast.push(id);
      plan.i++;
      plan.at = self.t + 0.25;
    }
    const before = new Map(g.units.map(u => [u, u.hp]));
    step(g, inp, DT);
    for (const [u, hp] of before) if (u.hp < hp) {
      self.rec.damage += Math.min(hp, hp - u.hp);
      self.rec.heroes.add(u.cls);
      if (u.dead) self.rec.killed++;
    }
    // nothing about this counts: the boss can't lose, the level can't end, and nobody hears it
    b.hp = b.maxhp; b.dead = false; b.evade = null;
    g.events.length = 0; g.banner = null; g.thought = null; g.clear = null; g.store = false; g.won = false; g.walkoff = null; g.over = false;
    g.texts = g.texts.filter(x => !String(x.s).startsWith('+'));   // damage numbers yes, score popups no
    self.t += DT;
  }

  function update(dt) {
    acc = Math.min(acc + dt, 6 * DT);
    while (acc >= DT) {
      if (self.t >= self.dur) next();
      stepOne();
      acc -= DT;
    }
  }

  next();
  return self;
}
