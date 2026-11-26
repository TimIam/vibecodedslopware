// gen.js — builds levels from a short recipe: a seeded run of set pieces (rolling runs, pits, subtle ledges,
// plateaus, cauldron fights, bounce caps, moving and crumbling ledges, cannon chasms, cracked-wall bonus alcoves,
// broom racks...) written into the same ASCII the hand-made levels use, so world.js, tiles.js and the bots treat
// them alike. Distances stay inside what the witches can jump; tools/bot.mjs checks every generated level.
//
// spec: { id, name, theme, kind: 'walk'|'ride'|'climb'|'boss', seed, len, diff (0..1), cannons (bool),
//         indoor (bool), foes: 'ydhskKtbwW...', world: 'hallo'|..., boss: kind, music }

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => new Array(w).fill('.')); }
  set(c, r, ch) { if (c >= 0 && r >= 0 && c < this.w && r < this.h) this.g[r][c] = ch; }
  get(c, r) { return c >= 0 && r >= 0 && c < this.w && r < this.h ? this.g[r][c] : '#'; }
  ground(c, s, to = this.h) { for (let r = s; r < to; r++) this.set(c, r, '#'); }
  rows() { return this.g.map((r) => r.join('')); }
}

export function buildLevel(spec) {
  if (spec.kind === 'boss') return buildBoss(spec);
  if (spec.kind === 'climb') return buildClimb(spec);
  if (spec.kind === 'ride') return buildRide(spec);
  return buildWalk(spec);
}

// ---------------------------------------------------------------------------------------------------------------
function buildWalk(spec) {
  const R = rng(spec.seed), pick = (a) => a[Math.floor(R() * a.length)], chance = (p) => R() < p;
  const W = spec.len || 300, H = 15, d = spec.diff ?? 0.3;
  const G = new Grid(W + 140, H);
  const foes = (spec.foes || 'yhk').split('');
  const walkers = foes.filter((f) => 'ydhsbt'.includes(f)), fliers = foes.filter((f) => 'kKwW'.includes(f));
  const out = { cannons: [], movers: [], bonus: [], rooms: [] };
  let c = 0, s = 12;
  const top = spec.indoor ? 2 : 0;
  const minS = spec.indoor ? 8 : 7, maxS = 13;
  if (spec.indoor) for (let x = 0; x < G.w; x++) { G.set(x, 0, '#'); G.set(x, 1, '#'); }
  const cards = (c0, r, n, arc = true) => { for (let i = 0; i < n; i++) { const rr = r - (arc ? Math.round(Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 2) : 0); if (G.get(c0 + i * 2, rr) === '.') G.set(c0 + i * 2, rr, 'o'); } };
  const lastEnemy = { c: -99 };
  const foe = (cc, r) => { if (cc - lastEnemy.c < 5 || !walkers.length) return; G.set(cc, r, pick(walkers)); lastEnemy.c = cc; };
  const flat = (n, rollEvery = 0) => {
    for (let i = 0; i < n; i++) {
      if (rollEvery && i > 0 && i % rollEvery === 0 && i < n - 2) { const ns = s + pick([-1, 1]); if (ns >= minS && ns <= maxS) s = ns; }
      G.ground(c, s); c++;
    }
  };
  // letters and specials spread through the level
  const marks = { 1: 0.16, 2: 0.4, 3: 0.64, 4: 0.86 };
  const placed = new Set();
  const due = () => { for (const k of Object.keys(marks)) if (!placed.has(k) && c >= marks[k] * W) return k; return null; };

  // start
  flat(7); G.set(2, s - 1, 'S');
  let checkpoint = false, bonusDone = !spec.bonusRoom, catDone = false, broomDone = !chance(0.55);
  const sections = ['run', 'pit', 'ledges', 'run', 'plateau', 'pots', 'pit', 'shroom', 'hogs', 'movers', 'run', 'fallers', 'valley', 'flyers', 'spikes'];
  if (spec.cannons) sections.push('cannons', 'cannons', 'cannonhop');
  while (c < W - 24) {
    const L = due();
    if (!checkpoint && c > W * 0.48) { flat(3); G.set(c - 2, s - 1, '*'); flat(3); checkpoint = true; continue; }
    if (!bonusDone && c > W * 0.25 && chance(0.25)) { bonusAlcove(); continue; }
    if (!broomDone && c > W * 0.3 && chance(0.2)) { flat(2); G.set(c, s - 1, 'B'); flat(4); broomDone = true; continue; }
    let kind = pick(sections);
    if (spec.cannons && c > W * 0.2 && !out.cannonsUsed && c > W * 0.35) kind = 'cannons';
    switch (kind) {
      case 'run': {
        const n = 8 + Math.floor(R() * 8);
        const c0 = c; flat(n, 3 + Math.floor(R() * 3));
        cards(c0 + 2, s - 3, Math.min(4, (n - 2) >> 1));
        if (chance(0.7)) foe(c0 + n - 3, s - 1);
        if (L) { G.set(c0 + (n >> 1), s - 4, L); placed.add(L); }
        break;
      }
      case 'pit': {
        const wdt = 2 + Math.floor(R() * (2 + d * 2));
        flat(3);
        const edge = s;
        if (wdt >= 5) { // a stepping stone, half hidden: a little ledge
          G.set(c + 2, edge - 2, '='); G.set(c + 3, edge - 2, '=');
        }
        cards(c, edge - 4, Math.max(2, wdt >> 1));
        if (L) { G.set(c + (wdt >> 1), edge - 5, L); placed.add(L); }
        c += wdt;
        s = Math.max(minS, Math.min(maxS, s + pick([-1, 0, 0, 1])));
        flat(3);
        break;
      }
      case 'ledges': {
        const c0 = c; flat(12, 4);
        const lr = s - 3, lc = c0 + 3 + Math.floor(R() * 3), lw = 2 + Math.floor(R() * 2);
        for (let i = 0; i < lw; i++) G.set(lc + i, lr, '=');
        cards(lc, lr - 1, lw, false);
        if (chance(0.5) && lr - 3 > top + 1) { const l2 = lc + lw + 1; for (let i = 0; i < 2; i++) G.set(l2 + i, lr - 3, '='); G.set(l2, lr - 4, L || (catDone ? 'o' : '@')); if (L) placed.add(L); else catDone = true; }
        else if (L) { G.set(lc, lr - 2, L); placed.add(L); }
        foe(c0 + 9, s - 1);
        break;
      }
      case 'plateau': {
        flat(3);
        const up = 2 + (chance(d) ? 1 : 0);
        const ns = Math.max(minS, s - up);
        if (ns === s) { flat(4); break; }
        s = ns; const c0 = c; flat(8 + Math.floor(R() * 6), 4);
        cards(c0 + 1, s - 2, 3, false);
        foe(c0 + 5, s - 1);
        if (L) { G.set(c0 + 4, s - 4, L); placed.add(L); }
        // step back down
        s = Math.min(maxS, s + 2); flat(2);
        break;
      }
      case 'valley': {
        s = Math.min(maxS, s + 1); const c0 = c; flat(6, 0); s = Math.max(minS, s - 2); flat(6, 3);
        cards(c0 + 1, s - 2, 4);
        break;
      }
      case 'pots': {
        const c0 = c; flat(14, 0);
        G.set(c0 + 1, s - 1, chance(0.75) ? 'c' : 'x');
        foe(c0 + 7, s - 1); lastEnemy.c = -99; foe(c0 + 11, s - 1);
        if (chance(0.35)) G.set(c0 + 13, s - 1, '+');
        break;
      }
      case 'hogs': {
        const c0 = c; flat(12, 4);
        if (foes.includes('h')) { G.set(c0 + 5, s - 1, 'h'); G.set(c0 + 10, s - 1, 'h'); } else foe(c0 + 6, s - 1);
        cards(c0 + 3, s - 3, 4);
        break;
      }
      case 'shroom': {
        const c0 = c; flat(10, 0);
        G.set(c0 + 3, s - 1, 'm');
        const hr = Math.max(top + 1, s - 8);
        for (let i = 0; i < 3; i++) G.set(c0 + 5 + i, hr + 1, '=');
        G.set(c0 + 6, hr, L || (catDone ? '%' : '@')); if (L) placed.add(L); else catDone = true;
        cards(c0 + 3, s - 5, 3, false);
        break;
      }
      case 'movers': {
        flat(3);
        const span = 8 + Math.floor(R() * 3 + d * 2);
        G.set(c + 1, s - 1, 'M'); G.set(c + 2, s - 1, 'M'); G.set(c + 3, s - 1, 'M');
        out.movers.push({ dx: span - 4, period: 3.6 + R() * 1.2 });
        cards(c + 2, s - 4, (span >> 1) - 1);
        if (L) { G.set(c + (span >> 1), s - 4, L); placed.add(L); }
        c += span; flat(4);
        break;
      }
      case 'fallers': {
        flat(3);
        const n = 2 + Math.floor(R() * 2 + d);
        for (let k = 0; k < n; k++) { const fc = c + 1 + k * 4; for (let i = 0; i < 3; i++) G.set(fc + i, s, 'f'); G.set(fc + 1, s - 2, 'o'); }
        c += 1 + n * 4 + 1; flat(4);
        break;
      }
      case 'spikes': {
        flat(3);
        const n = 6 + Math.floor(R() * 4);
        for (let i = 0; i < n; i++) { G.ground(c + i, s + 1); G.set(c + i, s, '^'); }
        const lr = s - 3;
        for (let i = 1; i < n - 1; i++) G.set(c + i, lr, '=');
        cards(c + 2, lr - 1, (n - 2) >> 1, false);
        c += n; flat(4);
        break;
      }
      case 'flyers': {
        const c0 = c; flat(12, 4);
        const fl = fliers.length ? pick(fliers) : 'k';
        G.set(c0 + 6, s - (fl === 'w' || fl === 'W' ? 3 : 4), fl);
        cards(c0 + 3, s - 3, 4);
        break;
      }
      case 'cannons': case 'cannonhop': {
        if (!spec.cannons) { flat(6); break; }
        cannonChasm(kind === 'cannonhop');
        out.cannonsUsed = true;
        break;
      }
    }
  }
  // any letters not yet placed go on the last stretch
  for (const k of ['1', '2', '3', '4']) if (!placed.has(k)) { flat(4); G.set(c - 2, s - 4, k); placed.add(k); }
  // goal
  flat(4); G.set(c + 3, s - 1, 'G'); flat(14);
  // pad
  while (c < G.w) { G.ground(c, s); c++; }
  return { ...meta(spec), rows: G.rows().map((r) => r.slice(0, c)), ...out };

  function cannonChasm(short) {
    flat(4);
    const lane = s - 3;
    const n = short ? 2 : 3 + (chance(d) ? 1 : 0);
    const gap = 8 + Math.floor(R() * 3);
    const c0 = c + 2;
    for (let k = 0; k < n; k++) {
      const cc = c0 + k * gap;
      const rr = k === 0 ? lane : lane - (k % 2 ? 2 : 0);
      G.set(cc, rr, 'O');
      const style = k === 0 ? 'first' : pick(['auto', 'spin', 'sweep', 'move', 'auto']);
      const nx = c0 + (k + 1) * gap, nr = k + 1 < n ? lane - ((k + 1) % 2 ? 2 : 0) : lane;
      const dir = Math.round((Math.atan2((nr - rr) * 16, (nx - cc) * 16) * 180) / Math.PI);
      const last = k === n - 1;
      const o = { dir: last ? 0 : dir, mount: k === 0 ? 'post' : pick(['chains', 'magic', 'chains']) };
      if (style === 'auto' || last) o.auto = true;
      else if (style === 'spin') o.spin = 100 + Math.floor(R() * 60);
      else if (style === 'sweep') o.sweep = [dir - 45, dir + 45, 2.2];
      else if (style === 'move') { o.move = { dx: 0, dy: -2, period: 2.4 }; o.mount = 'magic'; o.aim = [nx, nr]; }
      out.cannons.push(o);
      if (k + 1 < n) for (let i = 2; i < gap - 1; i += 2) G.set(cc + i, rr + Math.round(((nr - rr) * i) / gap), 'o');
    }
    // the chasm itself (empty), then landing ground well past the last cannon's reach
    const endC = c0 + (n - 1) * gap + 4;
    for (let x = c; x < endC; x++) { /* chasm */ }
    if (chance(0.5)) G.set(c0 + gap + 2, lane - 4, '%');
    c = endC; flat(26, 6);
  }
  function bonusAlcove() {
    // a raised hut with a cracked wall hiding a bonus cauldron; a cauldron to throw sits in front
    flat(2);
    G.set(c, s - 1, 'c'); flat(3);
    const c0 = c;
    for (let i = 0; i < 8; i++) { G.ground(c0 + i, s); G.set(c0 + i, s - 3, '#'); }
    G.set(c0, s - 1, 'H'); G.set(c0, s - 2, 'H'); G.set(c0 + 7, s - 1, '#'); G.set(c0 + 7, s - 2, '#');
    G.set(c0 + 4, s - 1, '?');
    c = c0 + 8;
    cards(c0 + 1, s - 5, 3, false);
    out.bonus.push({ room: out.rooms.length, ret: [c + 1, s - 1] });
    out.rooms.push(bonusRoom(spec, R, out.rooms.length));
    flat(4);
    bonusDone = true;
  }
}

function bonusRoom(spec, R, i) {
  const kinds = ['collect', 'stomp', 'reach'];
  const kind = kinds[(spec.seed + i) % 3];
  const rows = {
    collect: ['########################', '#......................#', '#..o.o.o..o.o..o.o.o...#', '#..=====........=====..#', '#......................#', '#.......o.o..o.o.......#', '#......=========.......#', '#..o...............o...#', '#.===.......p.......===#', '#......................#', '#..o.o.....m.....o.o...#', '#......................#', '#.S..o.o.o....o.o.o....#', '########################'],
    stomp: ['########################', '#......................#', '#......................#', '#...k..............k...#', '#......................#', '#..=====........=====..#', '#......................#', '#..........p...........#', '#.......========.......#', '#......................#', '#......................#', '#.S...y.....s....y.....#', '########################', '########################'],
    reach: ['########################', '#.........p............#', '#......=======.........#', '#......................#', '#..===..........===....#', '#......................#', '#.........====.........#', '#....m.................#', '#===..............====.#', '#......................#', '#........=====.........#', '#......................#', '#.S.......o.o.o.....m..#', '########################'],
  }[kind];
  return { bonusKind: kind, time: kind === 'reach' ? 12 : kind === 'stomp' ? 16 : 14, theme: 'bonus', music: 'bonus', rows };
}

function meta(spec) {
  return {
    id: spec.id, name: spec.name, theme: spec.theme, music: spec.music, blurb: spec.blurb || '', world: spec.world,
    rail: spec.kind === 'ride', railSpeed: spec.kind === 'ride' ? 3.2 + (spec.diff || 0) * 0.4 : undefined,
    order: spec.kind === 'climb' ? 'y' : undefined, boss: spec.boss, generated: true,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// cauldron ride: the overflowing cauldron slides along rolling ground on its own spill. Gaps to jump, piles that
// stop you cold, low beams you must NOT jump into, bells that open the gates further on, riders coming the other way.
function buildRide(spec) {
  const R = rng(spec.seed), pick = (a) => a[Math.floor(R() * a.length)], chance = (p) => R() < p;
  const W = spec.len || 320, H = 15, d = spec.diff ?? 0.3;
  const G = new Grid(W + 140, H);
  const indoor = spec.indoor;
  if (indoor) for (let x = 0; x < G.w; x++) { G.set(x, 0, '#'); G.set(x, 1, '#'); }
  let c = 0, s = 12;
  const flat = (n, roll = 0) => { for (let i = 0; i < n; i++) { if (roll && i && i % roll === 0 && i < n - 3) s = Math.max(10, Math.min(12, s + pick([-1, 1]))); G.ground(c, s); c++; } };
  flat(10); G.set(2, s - 1, 'S');
  const letters = ['1', '2', '3', '4']; let li = 0, check = false;
  while (c < W - 20) {
    if (!check && c > W / 2) { flat(4); G.set(c - 2, s - 1, '*'); flat(6); check = true; continue; }
    const k = pick(['gap', 'gap', 'block', 'beam', 'gate', 'rider', 'run', 'gap2']);
    switch (k) {
      case 'run': { const c0 = c; flat(10, 4); for (let i = 0; i < 4; i++) G.set(c0 + 2 + i * 2, s - 2, 'o'); break; }
      case 'gap': case 'gap2': {
        flat(4);
        const w = k === 'gap2' ? 5 + Math.floor(R() * 2) : 3 + Math.floor(R() * (2 + d));
        for (let i = 0; i < w; i += 1) G.set(c + i, s - 3 - Math.round(Math.sin((i / Math.max(1, w - 1)) * Math.PI) * 2), i % 2 ? '.' : 'o');
        if (li < 4 && chance(0.35)) { G.set(c + (w >> 1), s - 6, letters[li++]); }
        c += w; s = Math.max(10, Math.min(12, s + pick([-1, 0, 1]))); flat(4);
        break;
      }
      case 'block': flat(6); G.set(c, s - 1, 'Z'); flat(8); break;
      case 'beam': flat(6); G.set(c + 1, s - 5, 'L'); flat(12, 0); break;
      case 'gate': {
        flat(5); G.set(c, s - 5, 'Q'); for (let i = 0; i < 3; i++) G.set(c + i * 2 - 2, s - 2, 'o');
        flat(12); G.set(c, s - 1, 'V'); flat(6);
        break;
      }
      case 'rider': flat(6); G.set(c + 8, s - 1, 'u'); flat(14); break;
    }
  }
  while (li < 4) { flat(6); G.set(c - 3, s - 5, letters[li++]); }
  flat(6); G.set(c, s - 1, 'G'); flat(20);
  while (c < G.w) { G.ground(c, s); c++; }
  return { ...meta(spec), rows: G.rows().map((r) => r.slice(0, c)), cannons: [], movers: [], bonus: [], rooms: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// the rocket climb: a vertical level up a firework rocket's launch gantry. Zig-zag ledges, launch-pad bounces,
// lifts, and the wind.
function buildClimb(spec) {
  const R = rng(spec.seed), pick = (a) => a[Math.floor(R() * a.length)], chance = (p) => R() < p;
  const Wc = 26, Hr = spec.rows || 72;
  const G = new Grid(Wc, Hr);
  for (let r = 0; r < Hr; r++) { G.set(0, r, '#'); G.set(Wc - 1, r, '#'); }
  for (let x = 0; x < Wc; x++) { G.set(x, 0, '#'); G.set(x, Hr - 1, '#'); }
  G.set(3, Hr - 2, 'S');
  const movers = [];
  let r = Hr - 2, x = 6, dir = 1, li = 0, check = false;
  const letters = ['1', '2', '3', '4'];
  while (r > 16) {
    if (!check && r < Hr / 2) { const w = 8; const c0 = 9; r -= 3; for (let i = 0; i < w; i++) G.set(c0 + i, r, '='); G.set(c0 + 3, r - 1, '*'); check = true; x = c0 + w - 2; continue; }
    const k = pick(['ledge', 'ledge', 'ledge', 'pad', 'lift', 'foe']);
    if (k === 'pad') {
      // a launch pad (bounce cap) on a ledge, and a ledge high above it
      r -= 3;
      const c0 = Math.max(2, Math.min(Wc - 6, x + dir * 3));
      for (let i = 0; i < 3; i++) G.set(c0 + i, r, '=');
      G.set(c0 + 1, r - 1, 'm');
      const hr = r - 7, lc = Math.max(2, Math.min(Wc - 8, c0 - 1 + (c0 > Wc / 2 ? -1 : 1)));
      for (let i = 0; i < 5; i++) G.set(lc + i, hr, '=');
      for (let i = 0; i < 3; i++) G.set(c0 + 1, r - 3 - i * 2, 'o');
      r = hr; x = lc + 1;
      continue;
    }
    if (k === 'lift' && r > 14) {
      const c0 = dir > 0 ? Math.min(Wc - 6, x + 3) : Math.max(2, x - 6);
      r -= 3;
      for (let i = 0; i < 3; i++) G.set(c0 + i, r, 'M');
      movers.push({ dy: -5, period: 4.2 });
      r -= 5;
      const lc = Math.max(2, Math.min(Wc - 6, c0 + pick([-3, 3])));
      for (let i = 0; i < 4; i++) G.set(lc + i, r, '=');
      x = lc + 1; dir = -dir;
      continue;
    }
    r -= 3;
    const w = 3 + Math.floor(R() * 3);
    let c0 = x + dir * (3 + Math.floor(R() * 3));
    if (c0 < 2) { c0 = 2; dir = 1; } if (c0 + w > Wc - 2) { c0 = Wc - 2 - w; dir = -1; }
    for (let i = 0; i < w; i++) G.set(c0 + i, r, '=');
    G.set(c0 + (w >> 1), r - 1, 'o');
    if (k === 'foe') G.set(Math.min(Wc - 3, c0 + w + 2), r - 2, pick(['k', 'w', 'K']));
    if (li < 4 && chance(0.25)) G.set(c0, r - 2, letters[li++]);
    x = c0 + (dir > 0 ? w - 1 : 0);
  }
  // top platform and the goal
  r -= 3; for (let i = Math.max(2, x - 3); i < Math.min(Wc - 2, x + 4); i++) G.set(i, r, '=');
  r -= 3; for (let i = 6; i < 20; i++) G.set(i, r, '#'); G.set(12, r - 1, 'G');
  while (li < 4) G.set(7 + li * 3, r - 2, letters[li++]);
  const rows = G.rows().slice(Math.max(0, r - 6));
  rows[0] = '#'.repeat(Wc);
  return { ...meta(spec), rows, cannons: [], movers, bonus: [], rooms: [], order: 'y' };
}

// ---------------------------------------------------------------------------------------------------------------
function buildBoss(spec) {
  const fly = spec.boss === 'cupid';
  const rows = [
    '########################',
    '#......................#',
    '#........D....D........#',
    '#......................#',
    '#......................#',
    '#......................#',
    fly ? '#...O............O.....#' : '#......................#',
    '#......................#',
    '#..====..........====..#',
    '#......................#',
    '#......................#',
    '#.S..c...........X.....#',
    '########################',
    '########################',
  ];
  const cannons = fly ? [{ dir: -60, spin: 90, mount: 'magic' }, { dir: -120, spin: -90, mount: 'magic' }] : [];
  return { ...meta(spec), rows, cannons, movers: [], bonus: [], rooms: [], rolling: 0.4 };
}
