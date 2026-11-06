// Boss Hours: the whole simulation (the boss, the patrol, the parties, the director). No DOM, so it runs headless.
// One unit is one pixel: the arena is the 320×180 screen.

export const W = 320, H = 180;
export const A = { x: 92, y: 98 }, B = { x: 228, y: 98 };   // the rock, and the other rock
export const LANE = 11;        // half-width of the patrol path
export const LEASH = 60;       // farther than this from the path and you evade
export const ROCK_R = 4;       // the rocks are solid
export const TOUCH = 17;       // close enough to a rock to count as touching it
export const ARENA = { x0: 5, y0: 16, x1: W - 5, y1: H - 20 };
export const BOSS_HP = 4000, BOSS_SPEED = 23, BOSS_R = 10;
export const MULT_STEP = 0.25, MULT_MAX = 5;

export const ABIL = {
  swipe:  { cd: 0.7,  wind: 0.22, dur: 0.14, move: 0.55, range: 28, arc: 2.0, dmg: 110, kb: 16 },
  stomp:  { cd: 4.5,  wind: 0.85, dur: 0.2,  move: 0,    range: 37, dmg: 190, kb: 30 },
  breath: { cd: 9,    wind: 0.45, dur: 1.7,  move: 0.3,  range: 74, arc: 0.8, dmg: 40, dps: 95 },
  roar:   { cd: 16,   wind: 0.35, dur: 0.45, move: 0,    range: 92, fear: 3.2 },
  shake:  { cd: 0.32, wind: 0,    dur: 0.3,  move: 0,    range: 16, kb: 12 },
};
export const ORDER = ['swipe', 'stomp', 'breath', 'roar', 'shake'];

export const CLASS = {
  warrior:   { role: 'tank',   col: 'steel',  hp: 460, spd: 25, dmg: 14, rate: 1.2 },
  priest:    { role: 'healer', col: 'white',  hp: 70,  spd: 26, heal: 34, rate: 1.7 },
  druid:     { role: 'healer', col: 'orange', hp: 80,  spd: 26, heal: 28, rate: 1.5 },
  rogue:     { role: 'melee',  col: 'yellow', hp: 85,  spd: 28, dmg: 7,  rate: 0.9 },
  berserker: { role: 'melee',  col: 'red',    hp: 95,  spd: 27, dmg: 8,  rate: 1.1 },
  paladin:   { role: 'melee',  col: 'pink',   hp: 120, spd: 25, dmg: 7,  rate: 1.1 },
  mage:      { role: 'ranged', col: 'blue',   hp: 70,  spd: 26, dmg: 13,  rate: 1.8, bolt: 'frost' },
  warlock:   { role: 'ranged', col: 'purple', hp: 75,  spd: 25, dmg: 12,  rate: 1.6, bolt: 'shadow' },
  hunter:    { role: 'ranged', col: 'green',  hp: 80,  spd: 27, dmg: 9,  rate: 1.3, bolt: 'arrow' },
  pet:       { role: 'pet',    col: 'brown',  hp: 40,  spd: 40, dmg: 2,  rate: 0.9 },
  rider:     { role: 'rider',  col: 'tan',    hp: 100, spd: 30, dmg: 100, rate: 1.1 },
};

const SKILL = {
  raid:    { react: 0.24, dodge: 0.88, fire: 0.06 },
  dungeon: { react: 0.55, dodge: 0.6,  fire: 0.3 },
  rider:   { react: 0.22, dodge: 0.85, fire: 0 },
};
const PTS = { raid: 30, dungeon: 60, pet: 10, rider: 1500 };
const WIPE = { raid: 3000, dungeon: 400 };
const ENGAGE_R = 80;
const SIGIL = { x: -4, y: 0 };   // the weak spot on the boss's back, in boss-local pixels (x points at the head)
const HORSE_SPD = 64;

export const BOSS_NAMES = ['GORMUND THE UNBOTHERED', 'OLD BRISTLES', 'GRUBB, WARDEN OF TWO ROCKS', 'HAROLD',
  'MORVAK THE AMBLING', 'THE PACING ONE', 'BIG LOUIS', 'UNGOR, WHO WALKS'];

const BARK = {
  raidIdle: ['HEALERS READY?', 'BUFFS PLS', 'DONT PULL', 'WHO HAS FOOD', 'ONE SEC DOG', 'READY CHECK', 'AFK 1 MIN', 'IS IT TANK SWAP?'],
  raidFight: ['DPS!!', 'HEAL TANK', 'PUMP', 'NICE', 'KEEP DPS', 'STAY BEHIND', 'LUST?', 'WE GOT THIS', 'DONT PANIC', 'MELEE BEHIND'],
  stomp: ['SPREAD!', 'MOVE OUT', 'OUT OUT OUT', 'STOMP!'],
  frontal: ['FRONTAL!', 'DODGE', 'BREATH!', 'SIDESTEP'],
  roar: ['FEAR!', 'AAAA', 'NOT AGAIN', 'TREMOR?'],
  fire: ['ITS WARM', 'LOL', 'IM FINE', 'OOPS'],
  died: ['REZ PLS', 'LAG', 'WTF', 'RIP', 'I WAS MOVING', 'REZ?', 'TANK??'],
  pull: ['WHO PULLED', 'WTF', 'GO GO GO', 'PULLED!', 'OK WE GO'],
  evade: ['EVADE BUG?', 'IT RESET LOL', 'KITE IT BACK', 'LEASHED', 'REALLY?'],
  flee: ['WIPE IT!', 'RUN!', 'RUN OUT', 'RELEASE?'],
  dance: ['GG', 'EZ', 'LOOT!', 'NEED', '/DANCE', 'GZ', 'FUR IS MINE', 'ROLL NEED'],
  dungeonIdle: ['GOGO', 'PULL?', 'MANA', 'K', 'WAIT', 'ONE MORE', 'LOL'],
  dungeonFight: ['TANK??', 'HEAL PLS', 'LOL', 'OMG', 'SRY', 'AGGRO', 'OOM', 'NICE'],
  pet: ['PET!!!', 'HUNTER WTF', 'PET PULLED', 'SORRY PET'],
  thoughts: ['HM.', '*SNIFF*', 'NICE ROCK', 'OTHER ROCK', 'PATROL...', 'WHERE WAS I', '*YAWN*', 'THIS WAY', 'NO, THIS WAY', 'GOOD PATH', '...'],
};

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const turnToward = (a, target, max) => a + clamp(angDiff(target, a), -max, max);
export function segNearest(x, y) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const t = clamp(((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: A.x + dx * t, y: A.y + dy * t, t };
}
export const segDist = (x, y) => { const p = segNearest(x, y); return Math.hypot(x - p.x, y - p.y); };
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (g, arr) => arr[Math.floor(g.rng() * arr.length)];

export function createGame(seed = (Math.random() * 2 ** 32) >>> 0) {
  const rng = mulberry32(seed);
  return {
    seed, rng, t: 0,
    boss: {
      x: A.x + 26, y: A.y, face: 0, r: BOSS_R, hp: BOSS_HP, maxhp: BOSS_HP, act: null, queue: null,
      cd: { swipe: 0, stomp: 0, breath: 0, roar: 0, shake: 0 }, walk: 0, moving: false, evade: null, taunt: null,
      flash: 0, dead: false, deadT: 0, calmT: 99, name: BOSS_NAMES[Math.floor(rng() * BOSS_NAMES.length)],
    },
    units: [], parties: [], corpses: [], ghosts: [], fires: [], bolts: [], parts: [], texts: [], barks: [], rings: [],
    steps: [],                // footprints the renderer stamps into the worn path
    score: 0, mult: 1, laps: 0, kills: 0, wipes: { raid: 0, dungeon: 0, rider: 0 }, escaped: 0, patrolDist: 0,
    lastMark: null, onPatrol: false, offLane: 0,
    banner: null, thought: null, thoughtT: 4,
    dir: { next: 9, n: 0, lastRaid: -999 },
    blame: { raid: 0, dungeon: 0, rider: 0 }, // recent damage by party type, for the game over line
    events: [], shake: 0, over: false, nextId: 1,
  };
}

// ---------------------------------------------------------------------------------------------- the step

// input: { mx, my (aim, arena px), ax, ay (move, -1..1), press: {swipe,…} (edges), hold: {swipe} }
export function step(g, inp, dt) {
  g.t += dt;
  g.shake = Math.max(0, g.shake - dt);
  updateBoss(g, inp, dt);
  director(g, dt);
  for (const p of g.parties) updateParty(g, p, dt);
  for (const u of g.units) if (!u.dead) updateUnit(g, u, dt);
  separate(g);
  updateBolts(g, dt);
  updateFx(g, dt);
  g.units = g.units.filter(u => !u.dead && !u.gone);
  g.parties = g.parties.filter(p => !p.done);
  for (const k in g.blame) g.blame[k] *= Math.exp(-dt / 8);
  if (g.boss.dead) { g.boss.deadT += dt; if (g.boss.deadT > 4 && !g.over) { g.over = true; g.events.push('over'); } }
}

// ---------------------------------------------------------------------------------------------- boss

function updateBoss(g, inp, dt) {
  const b = g.boss;
  if (b.dead) return;
  for (const k in b.cd) b.cd[k] = Math.max(0, b.cd[k] - dt);
  b.flash = Math.max(0, b.flash - dt);
  b.calmT += dt;

  if (b.evade) {
    const dx = b.evade.x - b.x, dy = b.evade.y - b.y, d = Math.hypot(dx, dy);
    const s = Math.min(d, 62 * dt);
    if (d > 0.01) { b.x += dx / d * s; b.y += dy / d * s; b.face = turnToward(b.face, Math.atan2(dy, dx), 8 * dt); b.walk += s * 0.3; }
    b.hp = Math.min(b.maxhp, b.hp + (b.maxhp - b.hp) * 0.5 * dt);
    b.moving = true;
    if (d < 1) b.evade = null;
    return;
  }

  // facing: toward the mouse, unless a tank has taunted you
  let tx = inp.mx, ty = inp.my;
  if (b.taunt) {
    const u = b.taunt.u;
    b.taunt.t -= dt;
    if (u.dead || b.taunt.t <= 0) b.taunt = null; else { tx = u.x; ty = u.y; }
  }
  const channeling = b.act?.kind === 'breath' && b.act.fired;
  const turn = channeling ? 1.5 : b.taunt ? 7 : 5.5;
  if (Math.hypot(tx - b.x, ty - b.y) > 2) b.face = turnToward(b.face, Math.atan2(ty - b.y, tx - b.x), turn * dt);

  // abilities: a press during another action is queued briefly
  for (const k of ORDER) if (inp.press?.[k]) { if (!tryCast(g, k)) b.queue = { k, t: 0.3 }; }
  if (inp.hold?.swipe && !b.act) tryCast(g, 'swipe');
  if (b.queue) { b.queue.t -= dt; if (b.queue.t <= 0 || tryCast(g, b.queue.k)) b.queue = null; }

  // movement
  let mx = inp.ax || 0, my = inp.ay || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const sp = BOSS_SPEED * (b.act ? ABIL[b.act.kind].move : 1);
  const ox = b.x, oy = b.y;
  b.x = clamp(b.x + mx * sp * dt, ARENA.x0 + b.r, ARENA.x1 - b.r);
  b.y = clamp(b.y + my * sp * dt, ARENA.y0 + b.r, ARENA.y1 - b.r);
  for (const R of [A, B]) {   // rocks are solid
    const dx = b.x - R.x, dy = b.y - R.y, d = Math.hypot(dx, dy), min = b.r + ROCK_R;
    if (d < min && d > 0.001) { b.x = R.x + dx / d * min; b.y = R.y + dy / d * min; }
  }
  const moved = Math.hypot(b.x - ox, b.y - oy);
  b.moving = moved > 0.01;
  if (b.moving) {
    const before = Math.floor(b.walk / 4);
    b.walk += moved * 0.3;
    if (Math.floor(b.walk / 4) !== before) g.steps.push({ x: b.x, y: b.y, face: b.face, side: Math.floor(b.walk / 4) & 1 });
  }

  // patrol scoring
  const sd = segDist(b.x, b.y);
  g.onPatrol = sd < LANE;
  if (g.onPatrol) {
    g.score += moved * g.mult;
    g.patrolDist += moved;
    g.offLane = 0;
  } else {
    g.offLane += dt;
    if (g.offLane > 3) g.mult = Math.max(1, g.mult - 0.12 * dt);
  }
  for (const [name, R] of [['A', A], ['B', B]]) {
    if (g.lastMark !== name && Math.hypot(b.x - R.x, b.y - R.y) < TOUCH) {
      if (g.lastMark) {
        g.laps++;
        const pts = Math.round(100 * g.mult);
        g.score += pts;
        g.mult = Math.min(MULT_MAX, g.mult + MULT_STEP);
        text(g, R.x, R.y - 14, `+${pts}`, 'gold');
        text(g, R.x, R.y - 20, `AIMLESS X${g.mult.toFixed(2)}`, 'cream', 1.6);
        g.events.push('lap');
      }
      g.lastMark = name;
    }
  }
  if (sd > LEASH) startEvade(g);

  if (b.act) advanceAct(g, dt);

  // out of combat you lick your wounds
  const fighting = g.parties.some(p => p.engaged);
  if (!fighting && b.calmT > 4) b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.035 * dt);

  // idle thoughts
  g.thoughtT -= dt;
  if (g.thought) { g.thought.t += dt; if (g.thought.t > 2.4) g.thought = null; }
  if (g.thoughtT <= 0) {
    g.thoughtT = 7 + g.rng() * 7;
    if (!fighting) g.thought = { s: pick(g, BARK.thoughts), t: 0 };
  }
}

function startEvade(g) {
  const b = g.boss;
  const p = segNearest(b.x, b.y);
  b.evade = { x: p.x, y: p.y };
  b.act = null; b.taunt = null; b.queue = null;
  const lost = g.mult > 1;
  g.mult = 1;
  text(g, b.x, b.y - 18, 'EVADE', 'white', 1.6);
  if (lost) text(g, b.x, b.y - 24, 'AIMLESSNESS RESET', 'pink', 1.8);
  g.events.push('evade');
  for (const p of g.parties) if (p.engaged && p.type !== 'rider') { const u = alive(p)[0]; if (u) bark(g, u, pick(g, BARK.evade)); }
}

function tryCast(g, k) {
  const b = g.boss;
  if (b.act || b.evade || b.dead || b.cd[k] > 0) return false;
  const d = ABIL[k];
  b.act = { kind: k, t: 0, fired: false, tick: 0, fireT: 0 };
  b.cd[k] = d.cd;
  g.events.push('wind_' + k);
  // everybody sees the telegraph and decides whether they will move
  for (const u of g.units) {
    const sk = u.party.skill;
    u.willDodge = g.rng() < sk.dodge;
    u.react = g.t + sk.react * (0.7 + g.rng() * 0.7);
  }
  for (const p of g.parties) {
    if (p.type !== 'raid' || !p.engaged || g.rng() > 0.7) continue;
    const u = alive(p)[Math.floor(g.rng() * 3)];
    if (u && k === 'stomp') bark(g, u, pick(g, BARK.stomp));
    if (u && k === 'breath') bark(g, u, pick(g, BARK.frontal));
  }
  if (d.wind === 0) advanceAct(g, 0);
  return true;
}

function advanceAct(g, dt) {
  const b = g.boss, a = b.act, d = ABIL[a.kind];
  a.t += dt;
  if (!a.fired && a.t >= d.wind) { a.fired = true; fire(g, a.kind); }
  if (a.kind === 'breath' && a.fired) {
    a.tick -= dt;
    if (a.tick <= 0) {
      a.tick += 0.1;
      for (const u of g.units) if (hittable(u) && inZone(g, 'breath', u.x, u.y, 1)) hurt(g, u, d.dps * 0.1);
    }
    a.fireT -= dt;
    if (a.fireT <= 0 && g.fires.length < 40) {
      a.fireT += 0.11;
      const ang = b.face + (g.rng() - 0.5) * d.arc, dist = 16 + g.rng() * (d.range - 18);
      const x = b.x + Math.cos(ang) * dist, y = b.y + Math.sin(ang) * dist;
      if (x > 0 && x < W && y > 10 && y < H - 14) g.fires.push({ x, y, r: 3.5 + g.rng() * 2.5, t: 0, life: 7 + g.rng() * 2 });
    }
    for (let i = 0; i < 3; i++) {
      const ang = b.face + (g.rng() - 0.5) * d.arc, sp = 60 + g.rng() * 60;
      part(g, b.x + Math.cos(b.face) * 14, b.y + Math.sin(b.face) * 14, Math.cos(ang) * sp, Math.sin(ang) * sp,
        0.25 + g.rng() * 0.45, g.rng() < 0.5 ? 'flame' : 'ember');
    }
  }
  if (a.t >= d.wind + d.dur) b.act = null;
}

function fire(g, k) {
  const b = g.boss, d = ABIL[k];
  g.events.push(k);
  if (k === 'swipe' || k === 'stomp') {
    for (const u of g.units) {
      if (!hittable(u) || !inZone(g, k, u.x, u.y, 1)) continue;
      hurt(g, u, d.dmg);
      knock(u, b, d.kb);
    }
    if (k === 'stomp') {
      g.shake = 0.35;
      g.rings.push({ x: b.x, y: b.y, r: 4, max: d.range, t: 0, col: 'dust' });
      for (let i = 0; i < 28; i++) { const a = g.rng() * TAU, s = 30 + g.rng() * 50; part(g, b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10, Math.cos(a) * s, Math.sin(a) * s, 0.5, 'dust'); }
    } else {
      g.shake = Math.max(g.shake, 0.08);
      g.rings.push({ x: b.x, y: b.y, face: b.face, t: 0, col: 'slash' });
    }
  } else if (k === 'breath') {
    for (const u of g.units) if (hittable(u) && inZone(g, 'breath', u.x, u.y, 1)) hurt(g, u, d.dmg);
  } else if (k === 'roar') {
    g.shake = 0.25;
    g.rings.push({ x: b.x, y: b.y, r: 6, max: d.range, t: 0, col: 'roar' });
    for (const u of g.units) {
      if (u.role === 'rider' && u.state === 'climb') continue;
      if (Math.hypot(u.x - b.x, u.y - b.y) > d.range) continue;
      u.fear = d.fear * (0.8 + g.rng() * 0.4);
      u.cast = 0;
      if (u.role === 'rider' && u.mounted) u.state = 'orbit', u.orbitT = 1 + d.fear;
    }
    for (const p of g.parties) if (p.type === 'raid' && p.engaged) { const u = alive(p)[1]; if (u) bark(g, u, pick(g, BARK.roar)); }
  } else if (k === 'shake') {
    for (let i = 0; i < 14; i++) { const a = g.rng() * TAU, s = 25 + g.rng() * 30; part(g, b.x + Math.cos(a) * 9, b.y + Math.sin(a) * 9, Math.cos(a) * s, Math.sin(a) * s, 0.4, 'fur'); }
    for (const u of g.units) {
      if (u.role === 'rider' && u.state === 'climb') { shakeRider(g, u); continue; }
      if (hittable(u) && Math.hypot(u.x - b.x, u.y - b.y) < b.r + d.range - 8) knock(u, b, d.kb);
    }
  }
}

export function inZone(g, k, x, y, pad = 0) {
  const b = g.boss, d = ABIL[k];
  const dx = x - b.x, dy = y - b.y, dist = Math.hypot(dx, dy);
  if (dist > d.range + pad) return false;
  if (k === 'stomp' || k === 'roar' || k === 'shake') return true;
  if (dist < 6) return true;
  return Math.abs(angDiff(Math.atan2(dy, dx), b.face)) < d.arc / 2 + pad / dist;
}

// which telegraph the adventurers are currently trying to get out of
export function telegraph(g) {
  const a = g.boss.act;
  if (!a) return null;
  if (a.kind === 'breath') return 'breath';
  if ((a.kind === 'swipe' || a.kind === 'stomp') && !a.fired) return a.kind;
  return null;
}

function hurtBoss(g, amt, u) {
  const b = g.boss;
  if (b.evade || b.dead) return;
  b.hp -= amt;
  b.flash = 0.06;
  b.calmT = 0;
  g.blame[u.party.type] += amt;
  if (b.hp <= 0) {
    b.hp = 0; b.dead = true; b.act = null; b.taunt = null;
    g.events.push('bossdie');
    g.shake = 0.6;
    for (const p of g.parties) for (const v of alive(p)) if (g.rng() < 0.35) bark(g, v, pick(g, BARK.dance));
  }
}

// ---------------------------------------------------------------------------------------------- director

function edgeSpot(g, avoid) {
  for (let tries = 0; ; tries++) {
    const s = Math.floor(g.rng() * 4);
    const along = g.rng();
    let e;
    if (s === 0) e = { x: -8, y: 40 + along * 100, nx: 1, ny: 0 };
    else if (s === 1) e = { x: W + 8, y: 40 + along * 100, nx: -1, ny: 0 };
    else if (s === 2) e = { x: 30 + along * 260, y: 6, nx: 0, ny: 1 };
    else e = { x: 30 + along * 260, y: H + 4, nx: 0, ny: -1 };
    if (!avoid || tries > 6 || Math.hypot(e.x - g.boss.x, e.y - g.boss.y) > 110) return e;
  }
}

function director(g, dt) {
  const d = g.dir;
  if (g.boss.dead || g.t < d.next) return;
  if (g.units.length > 46 || g.boss.evade) { d.next = g.t + 4; return; }
  const riders = g.parties.filter(p => p.type === 'rider').length;
  const raidUp = g.parties.some(p => p.type === 'raid');
  const script = ['dungeon', 'rider', 'dungeon', 'raid'];
  let type = script[d.n];
  if (!type) {
    const r = g.rng();
    if (!raidUp && g.t - d.lastRaid > 100 && r < 0.45) type = 'raid';
    else if (riders < (d.n > 10 ? 2 : 1) && r < 0.7) type = 'rider';
    else type = 'dungeon';
  }
  if (type === 'raid') { spawnRaid(g); d.lastRaid = g.t; }
  else if (type === 'rider') spawnRider(g);
  else { spawnDungeon(g); if (d.n > 8 && g.rng() < 0.3) spawnDungeon(g, true); }
  d.n++;
  const gap = [30, 28, 30, 0][d.n - 1] ?? Math.max(15, 32 - d.n * 1.1) + g.rng() * 9;
  d.next = g.t + (type === 'raid' ? gap + 22 : gap);
}

function newParty(g, type) {
  // every party is a little better geared than the last
  const power = type === 'rider' ? 1 : 1 + g.dir.n * (type === 'raid' ? 0.07 : 0.06);
  const p = { id: g.nextId++, type, power, units: [], skill: SKILL[type], engaged: false, done: false, fleeing: false, t: 0, brez: type === 'raid' ? 1 : 0, deadList: [], barkT: 3 };
  g.parties.push(p);
  return p;
}

function mkUnit(g, p, cls, x, y) {
  const c = CLASS[cls];
  const u = {
    id: g.nextId++, party: p, cls, role: c.role, x, y, hp: c.hp * p.power, maxhp: c.hp * p.power, spd: c.spd, atk: g.rng() * c.rate, cast: 0,
    state: 'travel', kx: 0, ky: 0, hit: 0, dead: false, gone: false, moving: false, fx: 1, walk: g.rng() * 10,
    slotA: 0, slotD: 0, fear: 0, react: Infinity, willDodge: false, inFire: false, fireOk: false, tauntCd: 4 + g.rng() * 6,
  };
  g.units.push(u); p.units.push(u);
  return u;
}

function spawnDungeon(g, quiet) {
  const p = newParty(g, 'dungeon');
  const e = edgeSpot(g, true);
  const base = Math.atan2(e.y - g.boss.y, e.x - g.boss.x);
  const comp = ['warrior', g.rng() < 0.5 ? 'priest' : 'druid', g.rng() < 0.5 ? 'rogue' : 'berserker', 'mage', 'hunter'];
  comp.forEach((cls, i) => {
    const u = mkUnit(g, p, cls, e.x - e.nx * i * 3 + (g.rng() - 0.5) * 8, e.y - e.ny * i * 3 + (g.rng() - 0.5) * 8);
    u.slotA = u.role === 'melee' ? (g.rng() - 0.5) * 1.6 : base + (g.rng() - 0.5) * 1.6;
    u.slotD = u.role === 'healer' ? 52 + g.rng() * 8 : u.role === 'ranged' ? 44 + g.rng() * 12 : g.rng() * 3;
    u.home = { x: u.x + e.nx * 14, y: u.y + e.ny * 14 };
    if (cls === 'hunter') {
      const pet = mkUnit(g, p, 'pet', u.x, u.y);
      pet.slotA = (g.rng() - 0.5) * 2;
      pet.state = 'pull';
    }
  });
  const afk = alive(p).filter(u => u.role === 'ranged' || u.role === 'melee');
  if (g.rng() < 0.55) { const u = pick(g, afk); u.state = 'afk'; u.afk = 7 + g.rng() * 6; }
  if (!quiet) banner(g, 'A 5-MAN HAS ZONED IN', 'TANK, HEALER, THREE DPS. ONE IS AFK.');
  g.events.push('horn');
}

function spawnRaid(g) {
  const p = newParty(g, 'raid');
  const e = edgeSpot(g, true);
  // staging spot just inside the edge they came from
  const sx = clamp(e.x + e.nx * 40, 40, W - 40), sy = clamp(e.y + e.ny * 40, 48, H - 62);
  p.stage = { x: sx, y: sy };
  const base = Math.atan2(sy - g.boss.y, sx - g.boss.x);
  const comp = ['warrior', 'warrior', 'priest', 'priest', 'druid', 'priest', 'druid'];
  const melee = ['rogue', 'berserker', 'paladin'], ranged = ['mage', 'warlock', 'hunter'];
  for (let i = 0; i < 9; i++) comp.push(melee[i % 3]);
  for (let i = 0; i < 9; i++) comp.push(ranged[i % 3]);
  const px = -e.ny, py = e.nx;   // along the edge
  let tank = 0;
  comp.forEach((cls, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const ox = (col - 2) * 6, oy = row * 6;
    const u = mkUnit(g, p, cls, e.x + px * ox - e.nx * oy, e.y + py * ox - e.ny * oy);
    u.stage = { x: sx + px * ox - e.nx * oy * 0.8, y: sy + py * ox - e.ny * oy * 0.8 };
    if (u.role === 'tank') u.slot = tank++;
    u.slotA = u.role === 'melee' ? ((i % 9) / 8 - 0.5) * 2 : base + (g.rng() - 0.5) * 2.6;
    u.slotD = u.role === 'healer' ? 54 + g.rng() * 10 : u.role === 'ranged' ? 44 + g.rng() * 16 : g.rng() * 4;
  });
  p.leader = p.units[0];
  banner(g, 'A 25-MAN RAID HAS ENTERED', 'THEY HAVE WATCHED A GUIDE.');
  g.events.push('raidhorn');
}

function spawnRider(g) {
  const p = newParty(g, 'rider');
  const e = edgeSpot(g, false);
  const u = mkUnit(g, p, 'rider', e.x, e.y);
  u.state = 'arrive'; u.mounted = true; u.grip = 100; u.hface = 0;
  u.horse = { x: e.x, y: e.y, face: 0, walk: 0 };
  p.engaged = true;
  banner(g, 'A QUIET MAN ON A HORSE', 'HE WANTS TO CLIMB YOUR FUR.');
  g.events.push('neigh');
}

// ---------------------------------------------------------------------------------------------- parties

const alive = p => p.units.filter(u => !u.dead && !u.gone);

function engage(g, p, why) {
  if (p.engaged) return;
  p.engaged = true;
  p.countdown = null;
  for (const u of p.units) if (u.state === 'travel' || u.state === 'stage') u.state = 'fight';
  g.events.push('engage');
  const u = alive(p).find(v => v.role !== 'pet');
  if (u) bark(g, u, why === 'pet' ? pick(g, BARK.pet) : why === 'early' ? pick(g, BARK.pull) : p.type === 'raid' ? 'GO GO GO' : 'GOGO');
}

function updateParty(g, p, dt) {
  p.t += dt;
  const live = alive(p);
  if (!live.length) { finishParty(g, p); return; }
  if (p.type === 'rider') return;
  const b = g.boss;

  if (!p.engaged) {
    // anyone wandering too close, or a pet with ideas, starts the fight
    const near = live.find(u => u.state !== 'afk' && Math.hypot(u.x - b.x, u.y - b.y) < (p.type === 'raid' ? 52 : ENGAGE_R));
    if (near) engage(g, p, near.role === 'pet' ? 'pet' : p.type === 'raid' ? 'early' : 'near');
    else if (p.type === 'raid') {
      const staged = (live.every(u => u.state === 'stage') && p.t > 5) || p.t > 10;
      if (staged && !p.countdown) { p.countdown = 5.99; }
      if (p.countdown) {
        const before = Math.ceil(p.countdown);
        p.countdown -= dt;
        if (Math.ceil(p.countdown) !== before && p.countdown > 0) { g.events.push('tick'); banner(g, `PULL IN ${Math.ceil(p.countdown)}`, null, 1.1); }
        if (p.countdown <= 0) engage(g, p, 'timer');
      }
    }
  }

  p.barkT -= dt;
  if (p.barkT <= 0) {
    p.barkT = (p.type === 'raid' ? 2.6 : 4) + g.rng() * 3;
    const u = pick(g, live);
    if (u.role !== 'pet') {
      const list = p.type === 'raid' ? (p.engaged ? BARK.raidFight : BARK.raidIdle) : (p.engaged ? BARK.dungeonFight : BARK.dungeonIdle);
      bark(g, u, pick(g, list));
    }
  }

  // the battle res
  if (p.brez > 0 && p.engaged && !p.fleeing && p.deadList.length) {
    const healer = live.find(u => u.role === 'healer');
    const c = p.deadList.find(c => g.t - c.t > 4);
    if (healer && c && g.rng() < 0.3 * dt) {
      p.brez--;
      p.deadList.splice(p.deadList.indexOf(c), 1);
      const u = c.u;
      u.dead = false; u.hp = u.maxhp * 0.5; u.state = 'fight'; u.x = c.x; u.y = c.y; u.fear = 0;
      g.units.push(u);
      g.corpses = g.corpses.filter(k => k.u !== u);
      bark(g, healer, 'BREZ!');
      for (let i = 0; i < 12; i++) { const a = g.rng() * TAU; part(g, u.x, u.y - 2, Math.cos(a) * 18, Math.sin(a) * 18 - 10, 0.6, 'heal'); }
      g.events.push('rez');
    }
  }

  // morale
  if (p.engaged && !p.fleeing) {
    const flee = p.type === 'raid' ? live.length <= 3 : (live.length === 1 && live[0].role === 'healer' && p.units.length > 2);
    if (flee && g.rng() < 0.55) {
      p.fleeing = true;
      bark(g, live[0], p.type === 'raid' ? pick(g, BARK.flee) : 'NOPE');
      for (const u of live) { u.state = 'flee'; u.exit = nearestExit(u); }
    } else if (flee) p.fleeing = 'no';
  }
}

function finishParty(g, p) {
  p.done = true;
  const esc = p.units.filter(u => u.gone).length;
  if (esc && g.boss.dead) return;
  if (p.type === 'rider') {
    if (esc) return;
    g.wipes.rider++;
    banner(g, 'HORSE GUY DEFEATED', 'THE HORSE SEEMS RELIEVED.');
    g.events.push('wipe');
    return;
  }
  if (esc) {
    banner(g, esc === 1 ? 'ONE GOT AWAY' : `${esc} GOT AWAY`, 'NO WIPE BONUS. THEY WILL TELL OTHERS.');
    return;
  }
  const pts = Math.round(WIPE[p.type] * g.mult);
  g.score += pts;
  g.wipes[p.type]++;
  banner(g, p.type === 'raid' ? 'RAID WIPED' : 'PARTY WIPED', `+${pts}` + (p.type === 'raid' ? '  SEE YOU NEXT RESET' : ''));
  g.events.push('wipe');
}

function nearestExit(u) {
  const opts = [{ x: -12, y: u.y }, { x: W + 12, y: u.y }, { x: u.x, y: -12 }, { x: u.x, y: H + 12 }];
  return opts.reduce((a, c) => Math.hypot(c.x - u.x, c.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? c : a);
}

// ---------------------------------------------------------------------------------------------- units

function moveTo(u, tx, ty, spd, dt) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d < 0.6) { u.moving = false; return true; }
  const s = Math.min(d, spd * dt);
  u.x += dx / d * s; u.y += dy / d * s;
  u.moving = true;
  if (Math.abs(dx) > 0.3) u.fx = dx > 0 ? 1 : -1;
  u.walk += s * 0.5;
  return d < 2;
}
function moveDir(u, dx, dy, spd, dt) {
  const d = Math.hypot(dx, dy) || 1;
  u.x += dx / d * spd * dt; u.y += dy / d * spd * dt;
  u.moving = true;
  if (Math.abs(dx) > 0.1) u.fx = dx > 0 ? 1 : -1;
  u.walk += spd * dt * 0.5;
}
function clampArena(u) {
  u.x = clamp(u.x, ARENA.x0, ARENA.x1);
  u.y = clamp(u.y, ARENA.y0 - 6, ARENA.y1 + 8);
}
const hittable = u => !u.dead && !u.gone && !(u.role === 'rider' && u.state === 'climb');

function knock(u, b, kb) {
  const dx = u.x - b.x, dy = u.y - b.y, d = Math.hypot(dx, dy) || 1;
  u.kx += dx / d * kb * 5; u.ky += dy / d * kb * 5;
}

function escapeDir(g, k, u) {
  const b = g.boss, d = ABIL[k];
  const dx = u.x - b.x, dy = u.y - b.y, dist = Math.hypot(dx, dy) || 1;
  if (k === 'stomp') return { x: dx / dist, y: dy / dist };
  const ad = angDiff(Math.atan2(dy, dx), b.face);
  const radial = d.range + 4 - dist;
  const lateral = dist * (d.arc / 2 + 0.2 - Math.abs(ad));
  if (lateral < radial) { const s = ad >= 0 ? 1 : -1; return { x: -Math.sin(b.face) * s, y: Math.cos(b.face) * s }; }
  return { x: dx / dist, y: dy / dist };
}

function fireAt(g, x, y) {
  for (const f of g.fires) if (f.t < f.life - 0.4 && Math.hypot(x - f.x, y - f.y) < f.r) return f;
  return null;
}

function fightSpot(g, u) {
  const b = g.boss;
  let a, d;
  if (u.role === 'tank') { a = b.face + (u.slot ? 0.95 : 0); d = b.r + 5; }
  else if (u.role === 'melee' || u.role === 'pet') { a = b.face + Math.PI + u.slotA; d = b.r + 4 + u.slotD; }
  else { a = u.slotA; d = u.slotD; }
  return { x: clamp(b.x + Math.cos(a) * d, ARENA.x0, ARENA.x1), y: clamp(b.y + Math.sin(a) * d, ARENA.y0, ARENA.y1) };
}

function updateUnit(g, u, dt) {
  const b = g.boss, p = u.party;
  u.hit = Math.max(0, u.hit - dt);
  u.x += u.kx * dt; u.y += u.ky * dt;
  const k = Math.exp(-9 * dt); u.kx *= k; u.ky *= k;
  if (u.role === 'rider') { updateRider(g, u, dt); return; }
  if (b.dead) { u.moving = false; u.dance = (u.dance || g.rng() * 3) + dt; return; }

  // fire on the ground
  const f = fireAt(g, u.x, u.y);
  if (f) {
    if (!u.inFire) {
      u.inFire = true;
      u.fireOk = g.rng() < p.skill.fire;
      if (u.fireOk && g.rng() < 0.6) bark(g, u, pick(g, BARK.fire));
    }
    hurt(g, u, 32 * dt);
    if (u.dead) return;
  } else u.inFire = false;

  if (u.fear > 0) {
    u.fear -= dt; u.cast = 0;
    moveDir(u, u.x - b.x + Math.sin(g.t * 3 + u.id) * 20, u.y - b.y + Math.cos(g.t * 3 + u.id) * 20, u.spd * 1.1, dt);
    clampArena(u);
    return;
  }

  // telegraphs: get out (if you saw it, and you are the kind of person who moves)
  const tele = telegraph(g);
  if (tele && u.state !== 'afk') {
    const inside = inZone(g, tele, u.x, u.y, 4);
    if (tele === 'breath' && inside && !u.inCone) u.react = Math.max(u.react, g.t + p.skill.react * (0.4 + g.rng() * 0.5));
    u.inCone = inside;
    if (inside && u.willDodge && g.t >= u.react) {
      const e = escapeDir(g, tele, u);
      moveDir(u, e.x, e.y, u.spd * 1.8, dt);
      u.cast = 0;
      clampArena(u);
      return;
    }
  } else u.inCone = false;
  if (f && !u.fireOk) { moveDir(u, u.x - f.x, u.y - f.y, u.spd * 1.3, dt); u.cast = 0; return; }

  switch (u.state) {
    case 'afk':
      u.moving = false;
      u.afk -= dt;
      if (u.afk <= 0) { u.state = p.engaged ? 'fight' : 'travel'; bark(g, u, 'BACK'); }
      else if (!u.saidBrb && p.t > 1) { u.saidBrb = true; bark(g, u, 'BRB'); }
      if (u.home) moveTo(u, u.home.x, u.home.y, u.spd, dt);
      return;
    case 'pull': {
      moveTo(u, b.x, b.y, u.spd, dt);
      if (Math.hypot(u.x - b.x, u.y - b.y) < b.r + 8) { u.state = 'fight'; engage(g, p, 'pet'); }
      return;
    }
    case 'travel':
      if (p.type === 'raid') { if (moveTo(u, u.stage.x, u.stage.y, u.spd, dt)) u.state = 'stage'; }
      else moveTo(u, b.x, b.y, u.spd, dt);
      return;
    case 'stage':
      u.moving = false;
      return;
    case 'flee':
      moveTo(u, u.exit.x, u.exit.y, u.spd * 0.95, dt);
      if (u.x < -10 || u.x > W + 10 || u.y < -10 || u.y > H + 10) { u.gone = true; g.escaped++; }
      return;
  }

  // fight
  const s = fightSpot(g, u);
  const dist = Math.hypot(u.x - b.x, u.y - b.y);
  let there;
  if (u.role === 'ranged' || u.role === 'healer') {
    // casters plant their feet and only move when the spot has drifted a long way, or the boss is on top of them
    if (u.repos || Math.hypot(s.x - u.x, s.y - u.y) > 16 || dist < 22) u.repos = !moveTo(u, s.x, s.y, u.spd, dt);
    else u.moving = false;
    there = !u.repos;
  } else there = moveTo(u, s.x, s.y, u.spd, dt);
  clampArena(u);
  const c = CLASS[u.cls];
  if (u.role === 'tank' || u.role === 'melee' || u.role === 'pet') {
    if (dist < b.r + 7) {
      u.atk -= dt;
      if (u.atk <= 0) {
        u.atk = c.rate * (0.85 + g.rng() * 0.3);
        u.swing = 0.15;
        hurtBoss(g, c.dmg * p.power, u);
        if (g.rng() < 0.5) part(g, b.x + (u.x - b.x) * 0.7, b.y + (u.y - b.y) * 0.7, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.25, 'fur');
      }
    }
    if (u.role === 'tank') {
      u.tauntCd -= dt;
      if (u.tauntCd <= 0 && dist < 34 && !b.taunt && !b.evade) {
        u.tauntCd = 9 + g.rng() * 6;
        b.taunt = { u, t: 1.2 };
        g.events.push('taunt');
        text(g, u.x, u.y - 8, 'TAUNT', 'steelHi', 1);
      }
    }
  } else if (u.role === 'ranged') {
    if (there && dist < 84) {
      u.cast += dt;
      if (u.cast >= c.rate) {
        u.cast = 0;
        g.bolts.push({ x: u.x, y: u.y - 3, dmg: c.dmg * p.power, kind: c.bolt, u, t: 0 });
      }
    } else u.cast = 0;
  } else if (u.role === 'healer') {
    u.cast += dt;
    if (u.cast >= c.rate) {
      const tgt = alive(p).filter(v => v.hp < v.maxhp * 0.97 && Math.hypot(v.x - u.x, v.y - u.y) < 110)
        .sort((x, y) => x.hp / x.maxhp - y.hp / y.maxhp)[0];
      if (tgt) {
        u.cast = 0;
        tgt.hp = Math.min(tgt.maxhp, tgt.hp + c.heal * p.power);
        u.glow = 0.4;
        for (let i = 0; i < 4; i++) part(g, tgt.x + (g.rng() - 0.5) * 4, tgt.y - 2, 0, -10 - g.rng() * 10, 0.6, 'heal');
      } else u.cast = c.rate;
    }
  }
  u.swing = Math.max(0, (u.swing || 0) - dt);
  u.glow = Math.max(0, (u.glow || 0) - dt);
}

// ---------------------------------------------------------------------------------------------- the horse guy

function updateRider(g, u, dt) {
  const b = g.boss, sk = u.party.skill, h = u.horse;
  if (b.dead && u.state !== 'leave') { u.state = 'leave'; u.exit = nearestExit(u); if (u.mounted === false && u.state !== 'climb') u.mounted = true; }
  const ride = (tx, ty, spd) => {
    const ox = u.x, oy = u.y;
    moveTo(u, tx, ty, spd, dt);
    if (Math.hypot(u.x - ox, u.y - oy) > 0.01) h.face = Math.atan2(u.y - oy, u.x - ox);
    h.x = u.x; h.y = u.y; h.walk += Math.hypot(u.x - ox, u.y - oy);
  };
  const dodge = () => {
    const tele = telegraph(g);
    if (!tele) return false;
    if (inZone(g, tele, u.x, u.y, 6) && u.willDodge && g.t >= u.react) {
      const e = escapeDir(g, tele, u);
      ride(u.x + e.x * 20, u.y + e.y * 20, HORSE_SPD * 1.2);
      return true;
    }
    return false;
  };
  u.stab = Math.max(0, (u.stab || 0) - dt);

  switch (u.state) {
    case 'arrive': {
      const a = Math.atan2(u.y - b.y, u.x - b.x);
      ride(b.x + Math.cos(a) * 46, b.y + Math.sin(a) * 46, HORSE_SPD);
      if (Math.hypot(u.x - b.x, u.y - b.y) < 52) { u.state = 'orbit'; u.orbitT = 2.5 + g.rng() * 2; u.orbitDir = g.rng() < 0.5 ? -1 : 1; u.orbitA = a; }
      break;
    }
    case 'orbit': {
      if (dodge(0)) break;
      if (u.fear > 0) { u.fear -= dt; ride(u.x + (u.x - b.x), u.y + (u.y - b.y), HORSE_SPD); clampArena(u); break; }
      u.orbitA += u.orbitDir * 1.3 * dt;
      ride(clamp(b.x + Math.cos(u.orbitA) * 44, ARENA.x0, ARENA.x1), clamp(b.y + Math.sin(u.orbitA) * 44, ARENA.y0, ARENA.y1), HORSE_SPD);
      u.orbitT -= dt;
      if (u.orbitT <= 0) { u.state = 'charge'; if (g.rng() < 0.4) bark(g, u, '...'); }
      break;
    }
    case 'charge': {
      if (dodge(0)) break;
      const tx = b.x - Math.cos(b.face) * (b.r + 1), ty = b.y - Math.sin(b.face) * (b.r + 1);
      ride(tx, ty, HORSE_SPD * 1.15);
      if (Math.hypot(u.x - b.x, u.y - b.y) < b.r + 4 && !b.evade) {
        // grab the fur
        u.state = 'climb'; u.mounted = false; u.grip = 100;
        const dx = u.x - b.x, dy = u.y - b.y, c = Math.cos(-b.face), s = Math.sin(-b.face);
        let lx = dx * c - dy * s, ly = dx * s + dy * c;
        const l = Math.hypot(lx, ly) || 1; lx = lx / l * 9; ly = ly / l * 8;
        u.lx = lx; u.ly = ly;
        const ha = g.rng() * TAU;
        h.tx = clamp(b.x + Math.cos(ha) * 60, 20, W - 20); h.ty = clamp(b.y + Math.sin(ha) * 50, 26, H - 30);
        g.events.push('climb');
        bark(g, u, '*GRABS FUR*');
      }
      break;
    }
    case 'climb': {
      const dx = SIGIL.x - u.lx, dy = SIGIL.y - u.ly, d = Math.hypot(dx, dy);
      if (d > 1.2) { const s = Math.min(d, 2.8 * dt); u.lx += dx / d * s; u.ly += dy / d * s; }
      else {
        u.atk -= dt;
        if (u.atk <= 0) {
          u.atk = CLASS.rider.rate;
          u.stab = 0.25;
          hurtBoss(g, CLASS.rider.dmg, u);
          text(g, b.x, b.y - 16, `-${CLASS.rider.dmg}`, 'red', 0.9);
          g.shake = Math.max(g.shake, 0.15);
          g.events.push('stab');
        }
      }
      u.grip = Math.min(100, u.grip + 14 * dt);
      const c = Math.cos(b.face), s = Math.sin(b.face);
      u.x = b.x + u.lx * c - u.ly * s; u.y = b.y + u.lx * s + u.ly * c;
      u.walk += dt * 6;
      break;
    }
    case 'flung': {
      u.x += u.vx * dt; u.y += u.vy * dt;
      u.vx *= Math.exp(-5 * dt); u.vy *= Math.exp(-5 * dt);
      clampArena(u);
      u.flungT -= dt;
      if (u.flungT <= 0) { u.state = 'stun'; u.stunT = 2.4; }
      break;
    }
    case 'stun':
      u.moving = false;
      u.stunT -= dt;
      if (u.stunT <= 0) { u.state = 'tohorse'; g.events.push('whistle'); }
      break;
    case 'tohorse': {
      moveTo(u, h.x, h.y, CLASS.rider.spd, dt);
      clampArena(u);
      const ox = h.x, oy = h.y;
      const hd = Math.hypot(u.x - h.x, u.y - h.y);
      if (hd > 2) { h.x += (u.x - h.x) / hd * Math.min(hd, 50 * dt); h.y += (u.y - h.y) / hd * Math.min(hd, 50 * dt); h.face = Math.atan2(h.y - oy, h.x - ox); h.walk += Math.hypot(h.x - ox, h.y - oy); }
      if (hd < 3) { u.mounted = true; u.state = 'orbit'; u.orbitT = 1.5 + g.rng() * 1.5; u.orbitA = Math.atan2(u.y - b.y, u.x - b.x); u.orbitDir = g.rng() < 0.5 ? -1 : 1; g.events.push('neigh'); }
      break;
    }
    case 'leave':
      ride(u.exit.x, u.exit.y, HORSE_SPD);
      if (u.x < -10 || u.x > W + 10 || u.y < -10 || u.y > H + 10) u.gone = true;
      break;
  }
  // the horse wanders about while he is busy
  if (!u.mounted && u.state !== 'tohorse' && h.tx != null) {
    const dx = h.tx - h.x, dy = h.ty - h.y, d = Math.hypot(dx, dy);
    if (d > 1) { const s = Math.min(d, 40 * dt); h.x += dx / d * s; h.y += dy / d * s; h.face = Math.atan2(dy, dx); h.walk += s; }
    else if (g.rng() < 0.3 * dt) { h.tx = clamp(h.x + (g.rng() - 0.5) * 30, 20, W - 20); h.ty = clamp(h.y + (g.rng() - 0.5) * 20, 26, H - 30); }
  }
}

function shakeRider(g, u) {
  const b = g.boss;
  u.grip -= 30 + g.rng() * 18;
  if (u.grip > 0) {
    // he slides back down the fur, away from the weak spot
    const dx = u.lx - SIGIL.x, dy = u.ly - SIGIL.y, d = Math.hypot(dx, dy) || 1;
    u.lx = clamp(u.lx + dx / d * 2.5 + (g.rng() - 0.5) * 2, -11, 9);
    u.ly = clamp(u.ly + dy / d * 2.5 + (g.rng() - 0.5) * 2, -8, 8);
    return;
  }
  const c = Math.cos(b.face), s = Math.sin(b.face);
  let wx = u.lx * c - u.ly * s, wy = u.lx * s + u.ly * c;
  const l = Math.hypot(wx, wy);
  if (l < 1) { const a = g.rng() * TAU; wx = Math.cos(a); wy = Math.sin(a); } else { wx /= l; wy /= l; }
  u.state = 'flung'; u.flungT = 0.4;
  u.x = b.x + wx * (b.r + 3); u.y = b.y + wy * (b.r + 3);
  u.vx = wx * 110; u.vy = wy * 110;
  text(g, u.x, u.y - 8, 'SHAKEN OFF', 'cream', 1.2);
  g.events.push('fling');
}

// ---------------------------------------------------------------------------------------------- damage, death

function hurt(g, u, amt) {
  if (!hittable(u)) return;
  if (u.role === 'rider' && u.state === 'stun') amt *= 2;
  u.hp -= amt;
  if (amt > 5) u.hit = 0.12;
  if (u.hp <= 0) kill(g, u);
  else if (!u.party.engaged && amt > 5) engage(g, u.party, 'early');
}

function kill(g, u) {
  u.dead = true;
  const p = u.party;
  const base = u.role === 'pet' ? PTS.pet : PTS[p.type];
  const pts = Math.round(base * g.mult);
  g.score += pts;
  g.kills++;
  text(g, u.x, u.y - 6, `+${pts}`, u.role === 'rider' ? 'gold' : 'cream', u.role === 'rider' ? 1.6 : 0.9);
  g.events.push(u.role === 'rider' ? 'riderdie' : 'kill');
  for (let i = 0; i < 7; i++) { const a = g.rng() * TAU, s = 10 + g.rng() * 30; part(g, u.x, u.y - 1, Math.cos(a) * s, Math.sin(a) * s, 0.35, 'blood'); }
  const corpse = { u, x: u.x, y: u.y, cls: u.cls, t: 0 };
  g.corpses.push(corpse);
  if (g.corpses.length > 90) g.corpses.shift();
  if (u.role !== 'pet') g.ghosts.push({ x: u.x, y: u.y - 2, t: 0, vx: (g.rng() - 0.5) * 6 });
  p.deadList.push({ u, x: u.x, y: u.y, t: g.t });
  if (g.boss.taunt?.u === u) g.boss.taunt = null;
  if (p.type !== 'rider' && u.role !== 'pet' && g.rng() < 0.3) bark(g, { x: u.x, y: u.y - 4, dead: true }, pick(g, BARK.died));
  if (u.role === 'rider') {
    const h = u.horse;
    g.ghosts.push({ x: u.x, y: u.y - 2, t: 0, vx: 0 });
    g.parts.push({ horse: true, x: h.x, y: h.y, vx: (h.x < W / 2 ? -1 : 1) * 70, vy: 0, t: 0, life: 4, face: h.x < W / 2 ? Math.PI : 0, walk: h.walk });
  }
}

// ---------------------------------------------------------------------------------------------- projectiles and fx

function updateBolts(g, dt) {
  const b = g.boss;
  for (const o of g.bolts) {
    o.t += dt;
    const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
    const sp = o.kind === 'arrow' ? 150 : 100;
    o.vx = dx / d * sp; o.vy = dy / d * sp;
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (d < b.r - 1 || o.t > 2) {
      o.done = true;
      if (!b.dead) {
        hurtBoss(g, o.dmg, o.u);
        for (let i = 0; i < 3; i++) part(g, o.x, o.y, (g.rng() - 0.5) * 30, (g.rng() - 0.5) * 30, 0.25, o.kind);
      }
    }
  }
  g.bolts = g.bolts.filter(o => !o.done);
}

function updateFx(g, dt) {
  for (const p of g.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.horse) { p.vx *= Math.exp(-4 * dt); p.vy *= Math.exp(-4 * dt); } else p.walk += Math.abs(p.vx) * dt; }
  g.parts = g.parts.filter(p => p.t < p.life);
  for (const f of g.fires) f.t += dt;
  g.fires = g.fires.filter(f => f.t < f.life);
  for (const c of g.corpses) c.t += dt;
  g.corpses = g.corpses.filter(c => c.t < 40);
  for (const o of g.ghosts) { o.t += dt; o.y -= 7 * dt; o.x += o.vx * dt; }
  g.ghosts = g.ghosts.filter(o => o.t < 3.5);
  for (const t of g.texts) t.t += dt;
  g.texts = g.texts.filter(t => t.t < t.life);
  for (const k of g.barks) { k.t += dt; if (k.u && !k.u.dead && !k.u.gone) { k.x = k.u.x; k.y = k.u.y; } }
  g.barks = g.barks.filter(k => k.t < k.life);
  for (const r of g.rings) r.t += dt;
  g.rings = g.rings.filter(r => r.t < (r.col === 'slash' ? 0.18 : 0.45));
  if (g.banner) { g.banner.t += dt; if (g.banner.t > g.banner.dur) g.banner = null; }
}

function separate(g) {
  const us = g.units;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead || (a.role === 'rider')) continue;
    for (let j = i + 1; j < us.length; j++) {
      const c = us[j];
      if (c.dead || c.role === 'rider') continue;
      const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 9 && d2 > 0.0001) { const d = Math.sqrt(d2), push = (3 - d) * 0.5; a.x -= dx / d * push; a.y -= dy / d * push; c.x += dx / d * push; c.y += dy / d * push; }
    }
    // nobody stands inside the boss
    const b = g.boss, dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = b.r + 2;
    if (d < min && d > 0.001 && !b.dead) { a.x = b.x + dx / d * min; a.y = b.y + dy / d * min; }
  }
}

function part(g, x, y, vx, vy, life, kind) { if (g.parts.length < 400) g.parts.push({ x, y, vx, vy, t: 0, life, kind }); }
function text(g, x, y, s, col, life = 1.1) { g.texts.push({ x, y, s, col, t: 0, life }); }
function bark(g, u, s) {
  g.barks = g.barks.filter(k => k.u !== u);
  if (g.barks.length >= 6) g.barks.shift();
  g.barks.push({ u: u.dead ? null : u, x: u.x, y: u.y, s, t: 0, life: 2 });
}
function banner(g, s, sub, dur = 3.2) { g.banner = { s, sub, t: 0, dur }; }
