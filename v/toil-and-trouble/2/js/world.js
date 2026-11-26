// world.js — Toil & Trouble simulation. No DOM, no audio: everything the game needs to say goes out through g.ev
// ({k:'sfx', n}, {k:'shake'}, {k:'clear'}, {k:'dead'}, {k:'bonus'}, ...), so the same code runs headless in node
// for the bots in tools/. Fixed 60 Hz steps; units are pixels and frames. Positions are box top-left.

export const T = 16;
export const W = 384, H = 216;

// tile types
export const EMPTY = 0, SOLID = 1, ONEWAY = 2, SPIKE = 3, WATER = 4, BREAK = 5, RAIL = 6, BACK = 7;
const TILE_OF = { '#': SOLID, '=': ONEWAY, '^': SPIKE, '~': WATER, H: BREAK, r: RAIL, ':': BACK };
const isSolid = (t) => t === SOLID || t === BREAK;
const isTop = (t) => t === ONEWAY || t === RAIL;

export const STATS = {
  mags: { w: 14, h: 26, walk: 1.6, run: 2.9, jump: -6.15, acc: 0.17, roll: 3.7, rollT: 26, throwV: 5.0, name: 'MAGS' },
  pip: { w: 10, h: 19, walk: 1.85, run: 3.3, jump: -6.55, acc: 0.21, roll: 4.0, rollT: 24, throwV: 4.4, name: 'PIP' },
};
const G_HOLD = 0.3, G_RISE = 0.64, G_FALL = 0.42, MAXFALL = 6.2, FLOAT_FALL = 0.9, FLOAT_T = 70;
const RAIL_SPEED = 3.3;

export const ENEMY = {
  friar: { w: 12, h: 21, spd: 0.5, stomp: 1, roll: 1, slap: 1, hp: 1, walk: 1 },
  deacon: { w: 14, h: 23, spd: 0.42, stomp: 1, roll: 0, slap: 1, hp: 1, walk: 1, shield: 1 },
  hedgehog: { w: 14, h: 11, spd: 0.6, stomp: 0, roll: 1, slap: 1, hp: 1, walk: 1 },
  slug: { w: 16, h: 9, spd: 0.25, stomp: 1, roll: 1, slap: 1, hp: 1, walk: 1 },
  bishop: { w: 20, h: 30, spd: 0.55, stomp: 1, roll: 0, slap: 0, hp: 2, walk: 1, heavy: 1 },
  acolyte: { w: 12, h: 21, spd: 0, stomp: 1, roll: 1, slap: 1, hp: 1, walk: 1 },
  crow: { w: 14, h: 10, stomp: 1, roll: 1, slap: 0, hp: 1, fly: 1 },
  wasp: { w: 12, h: 11, stomp: 0, roll: 0, slap: 0, hp: 1, fly: 1, sting: 1 },
  rider: { w: 20, h: 22, spd: 2.0, stomp: 1, roll: 0, slap: 0, hp: 1, walk: 1, cart: 1 },
};
const ENEMY_CH = { y: 'friar', d: 'deacon', h: 'hedgehog', s: 'slug', b: 'bishop', t: 'acolyte', k: 'crow', K: 'crow', w: 'wasp', W: 'wasp', u: 'rider' };

// ---------------------------------------------------------------------------------------------------------------
// level parsing

export function parseLevel(def) {
  const rows = def.rows.map((r) => r.replace(/\s+$/, ''));
  const cols = Math.max(...rows.map((r) => r.length));
  const nr = rows.length;
  const t = new Uint8Array(cols * nr);
  const chars = [];
  const spawns = [];
  for (let r = 0; r < nr; r++) {
    const row = rows[r].padEnd(cols, '.');
    chars.push(row);
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      if (TILE_OF[ch] !== undefined) t[r * cols + c] = TILE_OF[ch];
      else if (ch !== '.' && ch !== ' ') spawns.push({ ch, c, r });
    }
  }
  // order spawns in play order so per-instance option lists (cannons, movers, bonus) line up
  if (def.order === 'y') spawns.sort((a, b) => b.r - a.r || a.c - b.c);
  else spawns.sort((a, b) => a.c - b.c || a.r - b.r);
  return { cols, rows: nr, t, chars, spawns, wpx: cols * T, hpx: nr * T };
}

// ---------------------------------------------------------------------------------------------------------------
// world creation

let NEXT_ID = 1;
export function createWorld(def, run, opts = {}) {
  const map = parseLevel(def);
  const g = {
    def, map, run, opts,
    frame: 0, ev: [], fx: [], ents: [], trail: [],
    letters: run.letters?.[def.id] ? [...run.letters[def.id]] : [false, false, false, false],
    pageGot: false,
    check: opts.checkpoint || null,
    state: 'play', stateT: 0,
    cam: { x: 0, y: 0, look: 0 },
    chain: 0, chainT: 0,
    shake: 0,
    inp: blankInput(), prev: blankInput(),
    nofx: !!opts.nofx,
    bonus: def.bonusKind ? { kind: def.bonusKind, left: (def.time || 15) * 60, done: false, result: null } : null,
    hud: { cards: 0, lives: 0, letters: 0 },
    partner: opts.party ? opts.party[1] || null : 'pip',
    boss: null,
  };
  const lead = opts.party ? opts.party[0] : 'mags';
  const ord = { cannon: 0, bonus: 0, mover: 0, faller: 0 };
  let start = null;
  const used = new Set();
  for (const s of map.spawns) {
    const key = s.c + ',' + s.r;
    if (used.has(key)) continue;
    const x = s.c * T, y = s.r * T;
    const ch = s.ch;
    if (ch === 'S') { start = { x: x + 8, y: y + T }; continue; }
    if (ENEMY_CH[ch]) { addEnemy(g, ENEMY_CH[ch], x, y, ch, def.enemyOpts?.[ch]); continue; }
    switch (ch) {
      case 'o': add(g, { type: 'card', x: x + 3, y: y + 1, w: 10, h: 14, by: y + 3, ph: (s.c * 0.7 + s.r) % 6.28 }); break;
      case '%': add(g, { type: 'deck', x: x + 1, y: y + 1, w: 14, h: 14, by: y + 1 }); break;
      case '1': case '2': case '3': case '4': {
        const i = +ch - 1;
        if (!g.letters[i]) add(g, { type: 'letter', i, x: x + 2, y: y + 1, w: 12, h: 14, by: y + 1 });
        break;
      }
      case 'B': add(g, { type: 'rack', x: x + 1, y: y - 8, w: 14, h: 24 }); break;
      case '@': add(g, { type: 'cat', x: x + 1, y: y + 1, w: 14, h: 14, by: y + 1 }); break;
      case 'p': add(g, { type: 'page', x: x + 2, y: y + 1, w: 12, h: 14, by: y + 1, hidden: !!g.bonus && g.bonus.kind !== 'reach' }); break;
      case 'c': addPot(g, 'clay', x, y); break;
      case 'i': addPot(g, 'iron', x, y); break;
      case 'x': addPot(g, 'brew', x, y); break;
      case '+': addPot(g, 'partner', x, y); break;
      case '*': add(g, { type: 'check', x: x - 2, y: y - 6, w: 20, h: 22, on: false }); break;
      case 'G': add(g, { type: 'goal', x: x - 8, y: y - 10, w: 32, h: 26 }); break;
      case 'm': add(g, { type: 'shroom', x: x, y: y + 6, w: 16, h: 10, sq: 0 }); break;
      case 'O': case '?': {
        const isB = ch === '?';
        const o = (isB ? def.bonus : def.cannons)?.[isB ? ord.bonus++ : ord.cannon++] || {};
        add(g, {
          type: 'cannon', x: x - 2, y: y - 2, w: 20, h: 20, x0: x - 2, y0: y - 2,
          ang: ((o.dir ?? (isB ? -90 : 0)) * Math.PI) / 180, auto: !!o.auto, spin: o.spin || 0,
          sweep: o.sweep || null, move: o.move || null, room: isB ? (o.room ?? 0) : null, cool: 0, kick: 0,
          step: o.step || 0, delay: o.delay ?? 14,
        });
        break;
      }
      case 'M': case 'f': {
        let n = 1;
        const cap = ch === 'f' ? def.fallChunk || 3 : 99;
        while (map.chars[s.r][s.c + n] === ch && n < cap) { used.add(s.c + n + ',' + s.r); n++; }
        if (ch === 'M') {
          const o = def.movers?.[ord.mover++] || {};
          add(g, { type: 'plat', kind: 'mover', x, y, x0: x, y0: y, w: n * T, h: 8, dx: 0, dy: 0, mv: o, plat: true });
        } else add(g, { type: 'plat', kind: 'faller', x, y, x0: x, y0: y, w: n * T, h: 8, dx: 0, dy: 0, plat: true, fall: 0, vy: 0 });
        break;
      }
      case 'X': g.boss = add(g, makeBoss(x, y)); break;
      case 'D': add(g, { type: 'dropper', x, y, w: 16, h: 16 }); break;
      default: break;
    }
  }
  if (!start) start = { x: 40, y: map.hpx - 3 * T };
  const sp = opts.checkpoint || start;
  g.start = start;
  g.p = makePlayer(lead, sp.x, sp.y);
  if (def.rail) g.p.state = 'cart';
  if (opts.returnBlast) {
    const c = g.ents.find((e) => e.type === 'cannon' && e.room === opts.returnBlast.room);
    if (c) { enterCannon(g, c, true); c.fireT = 30; }
  }
  snapCam(g);
  return g;
}

function blankInput() { return { left: 0, right: 0, up: 0, down: 0, jump: 0, act: 0, tag: 0, pause: 0 }; }

function add(g, e) { e.id = NEXT_ID++; e.t = 0; g.ents.push(e); return e; }
function addPot(g, kind, x, y) {
  return add(g, { type: 'pot', kind, x: x + 1, y: y + 2, w: 14, h: 14, vx: 0, vy: 0, state: 'rest', bounces: 0, roll: 0, plat: kind === 'iron' });
}
function addEnemy(g, kind, x, y, ch, o = {}) {
  const S = ENEMY[kind];
  const e = add(g, {
    type: 'enemy', kind, x: x + (T - S.w) / 2, y: y + T - S.h, w: S.w, h: S.h, vx: 0, vy: 0,
    dir: o.dir ?? -1, hp: S.hp, x0: x + (T - S.w) / 2, y0: y + T - S.h, mode: ch === 'K' || ch === 'w' ? 'v' : 'h',
    range: o.range ?? (S.fly ? (ch === 'W' || ch === 'k' ? 56 : 36) : 0), cool: 60 + ((x / T) % 5) * 20, stun: 0,
  });
  if (S.fly) { e.y = y + 3; e.y0 = e.y; }
  if (kind === 'rider') e.dir = o.dir ?? -1;
  return e;
}
function makePlayer(kind, cx, bottom) {
  const S = STATS[kind];
  return {
    kind, x: cx - S.w / 2, y: bottom - S.h, w: S.w, h: S.h, vx: 0, vy: 0, face: 1,
    onGround: false, coyote: 0, jumpBuf: 0, jumping: false, state: 'normal', stateT: 0,
    rollT: 0, rollSpd: 0, carry: null, invuln: 0, floatT: 0, ride: null, pose: 'idle', poseT: 0, cannon: null,
    blastT: 0, slapT: 0, throwT: 0, prevBottom: bottom, landT: 0, cartSpd: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// tile queries and movement

export function tileAt(g, c, r) {
  const m = g.map;
  if (c < 0 || c >= m.cols) return r < m.rows ? SOLID : EMPTY;
  if (r < 0 || r >= m.rows) return EMPTY;
  return m.t[r * m.cols + c];
}
function setTile(g, c, r, v) { const m = g.map; if (c >= 0 && r >= 0 && c < m.cols && r < m.rows) { m.t[r * m.cols + c] = v; g.tilesDirty = true; } }

function moveBody(g, b, opts = {}) {
  b.hitWall = 0; b.hitCeil = false; b.wallTile = null;
  const wasGround = b.onGround;
  b.onGround = false;
  const prevBottom = b.y + b.h;
  if (b.vx > 14) b.vx = 14; else if (b.vx < -14) b.vx = -14; // never skip a tile
  // X
  if (b.vx) {
    let nx = b.x + b.vx;
    const r0 = Math.floor(b.y / T), r1 = Math.floor((b.y + b.h - 0.01) / T);
    if (b.vx > 0) {
      const c = Math.floor((nx + b.w - 0.01) / T);
      for (let r = r0; r <= r1; r++) if (isSolid(tileAt(g, c, r))) { nx = c * T - b.w; b.hitWall = 1; b.wallTile = [c, r]; break; }
    } else {
      const c = Math.floor(nx / T);
      for (let r = r0; r <= r1; r++) if (isSolid(tileAt(g, c, r))) { nx = (c + 1) * T; b.hitWall = -1; b.wallTile = [c, r]; break; }
    }
    b.x = nx;
  }
  // Y
  let ny = b.y + b.vy;
  const c0 = Math.floor(b.x / T), c1 = Math.floor((b.x + b.w - 0.01) / T);
  b.ride = null;
  if (b.vy >= 0) {
    const r = Math.floor((ny + b.h - 0.001) / T);
    const top = r * T;
    for (let c = c0; c <= c1; c++) {
      const tt = tileAt(g, c, r);
      if (isSolid(tt) || (isTop(tt) && !opts.noTop && prevBottom <= top + 0.5 + (wasGround ? 4 : 0))) {
        ny = top - b.h; b.vy = 0; b.onGround = true; break;
      }
    }
    if (!opts.noPlat) {
      for (const e of g.ents) {
        if (!e.plat || e === b || e.state === 'held' || e.dead) continue;
        if (b.x + b.w <= e.x + 1 || b.x >= e.x + e.w - 1) continue;
        const pt = e.y;
        if (prevBottom <= pt + 0.5 + Math.max(0, e.dy || 0) + (wasGround && b.rideId === e.id ? 4 : 0) && ny + b.h >= pt) {
          ny = pt - b.h; b.vy = 0; b.onGround = true; b.ride = e; break;
        }
      }
    }
  } else {
    const r = Math.floor(ny / T);
    for (let c = c0; c <= c1; c++) if (isSolid(tileAt(g, c, r))) { ny = (r + 1) * T; b.vy = 0; b.hitCeil = true; break; }
  }
  b.y = ny;
  b.rideId = b.ride ? b.ride.id : 0;
}

function overlap(a, b, m = 0) { return a.x + m < b.x + b.w && a.x + a.w - m > b.x && a.y + m < b.y + b.h && a.y + a.h - m > b.y; }
function boxFree(g, x, y, w, h) {
  const c0 = Math.floor(x / T), c1 = Math.floor((x + w - 0.01) / T), r0 = Math.floor(y / T), r1 = Math.floor((y + h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (isSolid(tileAt(g, c, r))) return false;
  return true;
}
function groundAhead(g, b, dir) {
  const fx = dir > 0 ? b.x + b.w + 1 : b.x - 1;
  const t = tileAt(g, Math.floor(fx / T), Math.floor((b.y + b.h + 2) / T));
  return isSolid(t) || isTop(t);
}

// ---------------------------------------------------------------------------------------------------------------
// events and fx

function sfx(g, n, o) { g.ev.push({ k: 'sfx', n, o }); }
export function fx(g, k, x, y, o = {}) {
  if (g.nofx) return;
  g.fx.push({ k, x, y, vx: o.vx || 0, vy: o.vy || 0, t: 0, life: o.life || 30, c: o.c, s: o.s || 1, g: o.g ?? 0, a: o.a || 0, txt: o.txt, kind: o.kind, face: o.face, pose: o.pose, spin: o.spin || 0 });
}
function burst(g, k, x, y, n, sp, o = {}) {
  if (g.nofx) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(g) * 0.6;
    const s = sp * (0.5 + rnd(g) * 0.7);
    fx(g, k, x, y, { ...o, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), life: (o.life || 24) + Math.floor(rnd(g) * 12) });
  }
}
// deterministic per-world rng for fx only (sim decisions use frame counts)
function rnd(g) { g._r = (Math.imul(g._r || 0x9e3779b9, 1664525) + 1013904223) >>> 0; return g._r / 4294967296; }

// ---------------------------------------------------------------------------------------------------------------
// step

export function step(g, input) {
  g.prev = g.inp; g.inp = { ...input };
  const I = g.inp, P = g.prev;
  const press = (k) => I[k] && !P[k];
  const rel = (k) => !I[k] && P[k];
  g.press = press; g.rel = rel;
  g.frame++; g.stateT++;
  if (g.shake > 0) g.shake--;
  if (g.chainT > 0 && --g.chainT === 0) g.chain = 0;

  if (g.state === 'clear') { g.p.pose = 'victory'; g.p.poseT++; updateFx(g); if (g.stateT === 1) g.ev.push({ k: 'clear' }); return; }

  for (const e of g.ents) if (e.type === 'plat') updatePlat(g, e);
  // carry riders
  const p = g.p;
  if (p.ride && !p.ride.dead) { p.x += p.ride.dx || 0; p.y += p.ride.dy || 0; }
  for (const e of g.ents) if (e.type === 'pot' || e.type === 'enemy') if (e.ride && !e.ride.dead) { e.x += e.ride.dx || 0; e.y += e.ride.dy || 0; }

  updatePlayer(g, I, press, rel);
  for (const e of g.ents) {
    e.t++;
    switch (e.type) {
      case 'enemy': updateEnemy(g, e); break;
      case 'pot': updatePot(g, e); break;
      case 'cannon': updateCannon(g, e, press); break;
      case 'shot': updateShot(g, e); break;
      case 'shroom': if (e.sq > 0) e.sq--; break;
      case 'rack': if (e.wait && !overlap(g.p, e)) e.wait = false; break;
      case 'boss': updateBoss(g, e); break;
      case 'partnerPop': updatePop(g, e); break;
      default: break;
    }
  }
  interact(g, press);
  if (g.bonus) updateBonus(g);
  g.ents = g.ents.filter((e) => !e.dead);
  trailPush(g);
  updateCam(g);
  updateFx(g);
}

function trailPush(g) {
  const p = g.p;
  g.trail.push({ x: p.x + p.w / 2, y: p.y + p.h, face: p.face, pose: p.pose, poseT: p.poseT, vis: ['normal', 'roll', 'slap'].includes(p.state), ground: p.onGround });
  if (g.trail.length > 40) g.trail.shift();
}

// ---------------------------------------------------------------------------------------------------------------
// player

function setKind(g, kind) {
  const p = g.p, S = STATS[kind];
  const bottom = p.y + p.h, cx = p.x + p.w / 2;
  const nx = cx - S.w / 2, ny = bottom - S.h;
  if (!boxFree(g, nx, ny, S.w, S.h)) return false;
  p.kind = kind; p.w = S.w; p.h = S.h; p.x = nx; p.y = ny;
  return true;
}

function updatePlayer(g, I, press, rel) {
  const p = g.p;
  const S = STATS[p.kind];
  p.stateT++; p.poseT++;
  if (p.invuln > 0) p.invuln--;
  if (p.throwT > 0) p.throwT--;
  p.prevBottom = p.y + p.h;

  if (p.state === 'dead') {
    p.vy = Math.min(p.vy + 0.25, 5); p.y += p.vy; p.pose = 'dead';
    if (p.stateT === 100) g.ev.push({ k: 'dead' });
    return;
  }
  if (p.state === 'cannon') { p.pose = 'hidden'; return; }
  if (p.state === 'warp') { p.pose = 'hidden'; return; }
  if (p.state === 'blast') { updateBlast(g, p); return; }
  if (p.state === 'cart') { updateCart(g, p, I, press); return; }
  if (p.mount) { updateRider(g, p, I, press); return; }

  const dirIn = (I.right ? 1 : 0) - (I.left ? 1 : 0);
  if (press('jump')) p.jumpBuf = 7; else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.onGround) { p.coyote = 7; p.floatT = 0; } else if (p.coyote > 0) p.coyote--;

  // tag swap
  if (press('tag') && g.partner && !p.carry && (p.state === 'normal' || p.state === 'roll')) {
    const old = p.kind;
    if (setKind(g, g.partner)) {
      g.partner = old; sfx(g, 'tagSwap');
      burst(g, 'star', p.x + p.w / 2, p.y + p.h / 2, 8, 1.6, { life: 16 });
      if (p.state === 'roll') p.state = 'normal';
    }
  }

  // roll / pickup / slap
  if (press('act') && !p.carry && p.state === 'normal') {
    const pot = p.onGround || p.coyote > 0 ? potInReach(g, p) : null;
    if (pot) { pickUp(g, pot); }
    else if (p.kind === 'mags' && I.down && p.onGround) { p.state = 'slap'; p.stateT = 0; p.vx = 0; sfx(g, 'roll'); }
    else if (p.onGround || p.coyote > 0) {
      p.state = 'roll'; p.stateT = 0; p.rollT = S.rollT; p.rollSpd = S.roll; p.rollAir = 0;
      if (dirIn) p.face = dirIn;
      sfx(g, 'roll');
    }
  }
  if (p.carry && rel('act')) throwPot(g, I.down);

  // horizontal motion
  if (p.state === 'roll') {
    p.rollT--;
    const k = p.rollT > 8 ? 1 : p.rollT / 8;
    p.vx = p.face * (p.rollSpd * k + S.walk * (1 - k));
    if (!p.onGround) p.rollAir++;
    if (p.rollT <= 0 || (p.rollAir > 16)) { p.state = 'normal'; }
    if (p.onGround && p.stateT % 6 === 0) fx(g, 'dust', p.x + p.w / 2, p.y + p.h, { vx: -p.face * 0.4, vy: -0.3, life: 14 });
  } else if (p.state === 'slap') {
    p.vx *= 0.7;
    if (p.stateT === 9) slapShock(g);
    if (p.stateT >= 24) p.state = 'normal';
  } else {
    const running = !!I.act;
    const max = (running ? S.run : S.walk) * (p.carry && p.kind === 'pip' ? 0.92 : 1);
    const acc = p.onGround ? S.acc * (running ? 1.15 : 1) : S.acc * 0.75;
    if (dirIn) {
      const along = p.vx * dirIn;
      if (along < 0 && p.onGround) p.vx += dirIn * acc * 1.8; // skid
      else if (along < max) p.vx = dirIn * Math.min(max, along + acc);
      else p.vx = dirIn * Math.max(max, along - (p.onGround ? 0.12 : 0.05)); // over speed after a roll or blast: ease down
      p.face = dirIn;
    } else {
      const fr = p.onGround ? 0.22 : 0.05;
      if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr;
    }
  }

  // jumping
  const canRollJump = p.state === 'roll' && !p.onGround && p.rollAir > 0;
  if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0 || canRollJump) && p.state !== 'slap') {
    p.vy = S.jump; p.jumping = true; p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
    if (p.state === 'roll') { p.state = 'normal'; p.vx = p.face * Math.max(Math.abs(p.vx), p.rollSpd * 0.95); }
    sfx(g, p.kind === 'pip' ? 'jumpPip' : 'jump');
    if (!g.nofx) for (let i = 0; i < 4; i++) fx(g, 'dust', p.x + p.w / 2 + (i - 1.5) * 3, p.y + p.h, { vx: (i - 1.5) * 0.4, vy: -0.4, life: 14 });
  }
  // gravity
  let grav;
  if (p.vy < 0) grav = I.jump && p.jumping ? G_HOLD : G_RISE;
  else grav = G_FALL;
  p.vy += grav;
  let maxFall = MAXFALL;
  if (p.kind === 'pip' && I.jump && p.vy > 0 && !p.onGround && !p.carry && p.state === 'normal' && p.floatT < FLOAT_T) {
    maxFall = FLOAT_FALL; p.floatT++; p.floating = true;
  } else p.floating = false;
  if (p.vy > maxFall) p.vy = maxFall;
  if (p.vy >= 0) p.jumping = false;

  const wasGround = p.onGround;
  moveBody(g, p);
  if (p.onGround && !wasGround && p.prevBottom < p.y + p.h - 0.5 + 6) {
    if (p.landT <= 0) { sfx(g, 'land'); for (let i = 0; i < 3; i++) fx(g, 'dust', p.x + p.w / 2 + (i - 1) * 4, p.y + p.h, { vx: (i - 1) * 0.6, vy: -0.25, life: 12 }); }
    p.landT = 8;
  }
  if (p.landT > 0) p.landT--;
  if (p.hitWall) { p.vx = 0; if (p.state === 'roll') p.state = 'normal'; }

  // pose
  let pose;
  if (p.state === 'roll') pose = 'roll';
  else if (p.state === 'slap') pose = 'slap';
  else if (!p.onGround) pose = p.floating ? 'float' : p.vy < 0 ? 'jump' : 'fall';
  else if (Math.abs(p.vx) < 0.15) pose = 'idle';
  else if (dirIn && Math.sign(p.vx) !== dirIn) pose = 'skid';
  else pose = Math.abs(p.vx) > STATS[p.kind].walk + 0.3 ? 'run' : 'walk';
  if (p.carry) pose = pose === 'idle' ? 'carryIdle' : ['walk', 'run', 'skid'].includes(pose) ? 'carryWalk' : 'carryJump';
  if (p.throwT > 0 && !p.carry) pose = 'throw';
  if (pose !== p.pose) { p.pose = pose; p.poseT = 0; }
  p.animSpd = Math.abs(p.vx);

  if (p.carry) positionCarry(g, p, p.carry);

  // hazards and pits
  hazards(g, p);
  if (p.y > g.map.hpx + 24) die(g, 'pit');
}

// riding a broom: quicker, a second jump in the air, a charge on the action button that bowls everything over
const BROOM = { walk: 2.2, run: 3.6, jump: -6.5, air: -5.6, acc: 0.24, dash: 5.2, dashT: 22, fall: 4.6 };
function updateRider(g, p, I, press) {
  const dirIn = (I.right ? 1 : 0) - (I.left ? 1 : 0);
  if (press('jump')) p.jumpBuf = 7; else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.onGround) { p.coyote = 7; p.airJump = false; } else if (p.coyote > 0) p.coyote--;
  if (press('tag') && p.onGround && p.state === 'normal') { p.mount = null; add(g, { type: 'rack', x: p.x + p.w / 2 - 7, y: p.y + p.h - 24, w: 14, h: 24, wait: true }); sfx(g, 'tagSwap'); return; }
  if (press('act') && p.state === 'normal') { p.state = 'dash'; p.stateT = 0; p.rollT = BROOM.dashT; if (dirIn) p.face = dirIn; sfx(g, 'roll'); }
  if (p.state === 'dash') {
    p.rollT--;
    p.vx = p.face * BROOM.dash * (p.rollT > 6 ? 1 : 0.5 + p.rollT / 12);
    if (g.frame % 2 === 0) fx(g, 'spark', p.x + p.w / 2 - p.face * 10, p.y + p.h - 4, { vx: -p.face * 1.4, vy: -0.4, life: 12, c: 'card' });
    if (p.rollT <= 0) p.state = 'normal';
  } else {
    const max = I.act ? BROOM.run : BROOM.walk;
    if (dirIn) {
      const along = p.vx * dirIn;
      if (along < max) p.vx = dirIn * Math.min(max, along + BROOM.acc * (along < 0 ? 1.8 : 1));
      else p.vx = dirIn * Math.max(max, along - 0.1);
      p.face = dirIn;
    } else { const fr = p.onGround ? 0.16 : 0.05; if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr; }
  }
  if (p.jumpBuf > 0) {
    if (p.onGround || p.coyote > 0) { p.vy = BROOM.jump; p.jumping = true; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; sfx(g, p.kind === 'pip' ? 'jumpPip' : 'jump'); }
    else if (!p.airJump) { p.vy = BROOM.air; p.jumping = true; p.airJump = true; p.jumpBuf = 0; sfx(g, 'bounce'); burst(g, 'star', p.x + p.w / 2, p.y + p.h, 8, 1.4, { life: 14 }); }
  }
  p.vy += p.vy < 0 ? (I.jump && p.jumping ? G_HOLD : G_RISE) : G_FALL * 0.85;
  if (p.vy > BROOM.fall) p.vy = BROOM.fall;
  if (p.vy >= 0) p.jumping = false;
  moveBody(g, p);
  if (p.hitWall) {
    if (p.state === 'dash' && p.wallTile && tileAt(g, p.wallTile[0], p.wallTile[1]) === BREAK) breakWall(g, p.wallTile[0], p.wallTile[1]);
    p.vx = 0; if (p.state === 'dash') p.state = 'normal';
  }
  const pose = p.state === 'dash' ? 'rideDash' : 'ride';
  if (pose !== p.pose) { p.pose = pose; p.poseT = 0; }
  p.animSpd = Math.abs(p.vx);
  if (!g.nofx && g.frame % 5 === 0) fx(g, 'spark', p.x + p.w / 2 - p.face * 12, p.y + p.h - 3, { vx: -p.face * 0.5, vy: 0.3, life: 16, c: 'card' });
  hazards(g, p);
  if (p.y > g.map.hpx + 24) die(g, 'pit');
}
function mountBroom(g, rack) {
  const p = g.p;
  rack.dead = true; p.mount = 'broom'; p.state = 'normal'; p.airJump = false;
  sfx(g, 'partnerFree');
  burst(g, 'star', p.x + p.w / 2, p.y + p.h / 2, 12, 1.8, { life: 20 });
  fx(g, 'text', p.x + p.w / 2, p.y - 8, { txt: 'BROOM!', life: 60, vy: -0.5 });
  g.ev.push({ k: 'mount' });
}
function dismount(g, src) {
  const p = g.p;
  p.mount = null; p.state = 'normal'; p.invuln = 100;
  p.vy = Math.min(p.vy, -3.5);
  p.vx = src ? Math.sign(p.x + p.w / 2 - src.x - src.w / 2 || -p.face) * 2.4 : -p.face * 1.6;
  sfx(g, 'hurt'); g.shake = 6;
  fx(g, 'flee', p.x + p.w / 2, p.y + p.h, { kind: 'broom', face: p.face, vx: -p.face * 2, vy: -4, g: 0.1, life: 100 });
  g.ev.push({ k: 'dismount' });
}

function hazards(g, p) {
  const c0 = Math.floor((p.x + 2) / T), c1 = Math.floor((p.x + p.w - 2) / T);
  const r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + p.h - 0.01) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = tileAt(g, c, r);
    if (t === SPIKE && p.y + p.h > r * T + 8) { hurt(g, 'spike'); if (g.p.state !== 'dead') p.vy = -5.2; return; }
    if (t === WATER && p.y + p.h > r * T + 7) {
      if (!g.nofx) for (let i = 0; i < 10; i++) fx(g, 'drop', p.x + p.w / 2, r * T + 6, { vx: (rnd(g) - 0.5) * 3, vy: -2 - rnd(g) * 2, g: 0.18, life: 30, c: g.def.theme });
      sfx(g, 'splash'); die(g, 'water'); return;
    }
  }
}

function potInReach(g, p) {
  let best = null, bd = 1e9;
  for (const e of g.ents) {
    if (e.type !== 'pot' || e.state === 'held' || e.state === 'thrown') continue;
    const reach = { x: p.x - 8, y: p.y, w: p.w + 16, h: p.h + 2 };
    if (!overlap(reach, e)) continue;
    const d = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) - (Math.sign(e.x + e.w / 2 - (p.x + p.w / 2)) === p.face ? 4 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function pickUp(g, pot) {
  const p = g.p;
  pot.state = 'held'; pot.vx = 0; pot.vy = 0; p.carry = pot; pot.ride = null;
  sfx(g, 'pickup');
  positionCarry(g, p, pot);
}
function positionCarry(g, p, pot) {
  if (p.kind === 'mags') { pot.x = p.x + p.w / 2 - pot.w / 2; pot.y = p.y - pot.h + 3; }
  else { pot.x = p.x + p.w / 2 - pot.w / 2 + p.face * 9; pot.y = p.y + p.h - pot.h - 3; }
}
function throwPot(g, gentle) {
  const p = g.p, pot = p.carry;
  if (!pot) return;
  p.carry = null; p.throwT = 12;
  const S = STATS[p.kind];
  pot.x = p.x + p.w / 2 - pot.w / 2 + p.face * (p.w / 2 + 6);
  pot.y = Math.min(pot.y, p.y + p.h - pot.h);
  if (!boxFree(g, pot.x, pot.y, pot.w, pot.h)) pot.x = p.x + p.w / 2 - pot.w / 2;
  if (gentle && p.onGround) { pot.state = 'rest'; pot.vx = 0; pot.vy = 0; pot.y = p.y + p.h - pot.h; sfx(g, 'land'); return; }
  pot.state = 'thrown'; pot.vx = p.face * S.throwV + p.vx * 0.25; pot.vy = p.onGround ? -1.2 : 0.6; pot.roll = 0; pot.bounces = 0; pot.thrownBy = p.kind;
  sfx(g, 'throw');
}
function dropCarry(g) {
  const p = g.p, pot = p.carry;
  if (!pot) return;
  p.carry = null; pot.state = 'thrown'; pot.vx = -p.face * 0.6; pot.vy = -2; pot.dropped = true;
}

function slapShock(g) {
  const p = g.p;
  g.shake = 8; sfx(g, 'stomp');
  const cx = p.x + p.w / 2, by = p.y + p.h;
  for (let i = -1; i <= 1; i += 2) for (let k = 0; k < 5; k++) fx(g, 'dust', cx + i * k * 9, by, { vx: i * (0.6 + k * 0.15), vy: -0.8 - k * 0.1, life: 18 });
  for (const e of g.ents) {
    if (e.type === 'enemy' && !e.dead && ENEMY[e.kind].slap && !ENEMY[e.kind].fly) {
      const ex = e.x + e.w / 2, ey = e.y + e.h;
      if (Math.abs(ex - cx) < 60 && Math.abs(ey - by) < 20) kill(g, e, Math.sign(ex - cx) || 1);
    }
    if (e.type === 'pot' && e.kind === 'partner' && e.state === 'rest' && Math.abs(e.x + 7 - cx) < 40 && Math.abs(e.y + e.h - by) < 12) breakPot(g, e);
  }
}

export function hurt(g, why, src) {
  const p = g.p;
  if (p.invuln > 0 || p.state === 'dead' || g.state !== 'play') return;
  if (p.state === 'cannon' || p.state === 'warp') return;
  if (p.mount) { if (why === 'spike') { p.vy = -5; } dismount(g, src); return; }
  if (p.carry) dropCarry(g);
  if (g.partner) {
    const lost = p.kind;
    const wasCart = p.state === 'cart';
    if (setKind(g, g.partner) || true) {
      if (p.kind === lost) { // couldn't swap (blocked): force it
        const S = STATS[g.partner]; p.kind = g.partner; p.w = S.w; p.y += p.h - S.h; p.h = S.h;
      }
      g.partner = null;
      p.invuln = 110; p.vy = Math.min(p.vy, -3.2);
      if (!wasCart) { p.state = 'normal'; p.vx = src ? Math.sign(p.x + p.w / 2 - src.x - src.w / 2 || -p.face) * 2.6 : -p.face * 1.4; }
      sfx(g, 'hurt');
      g.shake = 6;
      fx(g, 'flee', p.x + p.w / 2, p.y + p.h, { kind: lost, face: -p.face, vx: -p.face * 1.6, vy: -4.5, g: 0.12, life: 120 });
      g.ev.push({ k: 'lost', who: lost });
    }
    return;
  }
  die(g, why);
}

function die(g, why) {
  const p = g.p;
  if (p.state === 'dead') return;
  if (p.carry) dropCarry(g);
  p.mount = null; p.state = 'dead'; p.stateT = 0; p.vx = 0; p.vy = why === 'pit' || why === 'water' ? 0 : -5.5; p.why = why;
  if (why === 'pit' || why === 'water') p.y = Math.min(p.y, g.map.hpx + 40);
  g.ev.push({ k: 'dying', why });
  sfx(g, 'hurt');
}

// cannons -------------------------------------------------------------------------------------------------------
function enterCannon(g, c, silent) {
  const p = g.p;
  if (p.carry) dropCarry(g);
  if (p.mount) { p.mount = null; fx(g, 'flee', p.x + p.w / 2, p.y + p.h, { kind: 'broom', face: p.face, vx: -p.face * 1.5, vy: -3, g: 0.1, life: 90 }); }
  p.state = 'cannon'; p.cannon = c; p.vx = 0; p.vy = 0; p.stateT = 0;
  p.x = c.x + c.w / 2 - p.w / 2; p.y = c.y + c.h / 2 - p.h / 2;
  c.fireT = c.auto ? c.delay : -1; c.kick = 8;
  if (!silent) sfx(g, 'blastEnter');
  if (c.room !== null) c.warpT = 24;
}
function updateCannon(g, c, press) {
  if (c.cool > 0) c.cool--;
  if (c.kick > 0) c.kick--;
  // motion
  if (c.move) {
    const per = (c.move.period || 3) * 60, ph = ((g.frame % per) / per) * Math.PI * 2;
    const k = (1 - Math.cos(ph)) / 2;
    c.x = c.x0 + (c.move.dx || 0) * T * k; c.y = c.y0 + (c.move.dy || 0) * T * k;
  }
  if (c.spin) c.ang += (c.spin * Math.PI) / 180 / 60;
  if (c.sweep) {
    const [a0, a1, sec] = c.sweep;
    const k = (1 - Math.cos((g.frame / (sec * 60)) * Math.PI * 2)) / 2;
    c.ang = ((a0 + (a1 - a0) * k) * Math.PI) / 180;
  }
  if (c.step && g.frame % Math.round(c.step * 60) === 0 && g.p.cannon !== c) c.ang += Math.PI / 4;
  const p = g.p;
  if (p.state !== 'cannon' || p.cannon !== c) return;
  p.x = c.x + c.w / 2 - p.w / 2; p.y = c.y + c.h / 2 - p.h / 2;
  if (c.step && g.frame % Math.round(c.step * 60) === 0) c.ang += Math.PI / 4;
  if (c.room !== null) {
    if (--c.warpT === 0) { p.state = 'warp'; g.ev.push({ k: 'bonus', room: c.room }); sfx(g, 'bonusEnter'); }
    return;
  }
  if (c.fireT > 0) { if (--c.fireT === 0) fire(g, c); }
  else if (!c.auto && press('jump')) fire(g, c);
}
function fire(g, c) {
  const p = g.p;
  p.state = 'blast'; p.blastT = c.blast || 44; p.stateT = 0;
  const v = 7.2;
  p.vx = Math.cos(c.ang) * v; p.vy = Math.sin(c.ang) * v;
  p.face = Math.cos(c.ang) < -0.1 ? -1 : Math.cos(c.ang) > 0.1 ? 1 : p.face;
  p.x = c.x + c.w / 2 - p.w / 2 + Math.cos(c.ang) * 10; p.y = c.y + c.h / 2 - p.h / 2 + Math.sin(c.ang) * 10;
  c.cool = 24; c.kick = 10; p.cannon = null; p.jumping = false; p.floatT = 0;
  sfx(g, 'blastFire'); g.shake = 4;
  burst(g, 'smoke', c.x + c.w / 2 + Math.cos(c.ang) * 12, c.y + c.h / 2 + Math.sin(c.ang) * 12, 8, 1.2, { life: 26 });
}
export function fireCannonExternally(g, c) { fire(g, c); }
function updateBlast(g, p) {
  p.blastT--; p.pose = 'blast'; p.poseT++;
  if (!g.nofx && p.stateT % 2 === 0) fx(g, 'trail', p.x + p.w / 2, p.y + p.h / 2, { life: 14 });
  const vx0 = p.vx, vy0 = p.vy;
  moveBody(g, p, { noTop: p.vy < 0 });
  // keep momentum if we only grazed a one-way top
  const hit = p.hitWall || p.hitCeil || (p.onGround && vy0 > 0.5);
  if (p.onGround && vy0 >= -0.1 && Math.abs(vy0) < 0.5) { p.vy = vy0; p.onGround = false; }
  p.stateT++;
  // captured by another cannon
  for (const e of g.ents) if (e.type === 'cannon' && e.cool <= 0 && overlap(p, e, 4)) { enterCannon(g, e); return; }
  if (hit || p.blastT <= 0) {
    p.state = 'normal';
    if (!hit) { p.vx = vx0 * 0.55; p.vy = vy0 * 0.45; } else if (p.hitWall) p.vx = 0;
    p.vx = Math.max(-STATS[p.kind].run, Math.min(STATS[p.kind].run, p.vx));
  }
  hazards(g, p);
  if (p.y > g.map.hpx + 24) die(g, 'pit');
}

// rail cart -----------------------------------------------------------------------------------------------------
function updateCart(g, p, I, press) {
  const S = STATS[p.kind];
  if (press('jump')) p.jumpBuf = 6; else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
  const target = g.def.railSpeed || RAIL_SPEED;
  const dirIn = (I.right ? 1 : 0) - (I.left ? 1 : 0);
  p.cartSpd += ((target + dirIn * 0.6) - p.cartSpd) * 0.04;
  p.vx = p.cartSpd; p.face = 1;
  if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = -6.6; p.jumping = true; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; sfx(g, 'railJump');
  }
  p.vy += p.vy < 0 ? (I.jump && p.jumping ? G_HOLD : G_RISE) : G_FALL;
  if (p.vy > MAXFALL) p.vy = MAXFALL;
  if (p.vy >= 0) p.jumping = false;
  const wasGround = p.onGround;
  moveBody(g, p);
  if (p.onGround && !wasGround) { sfx(g, 'land'); burst(g, 'spark', p.x + p.w / 2, p.y + p.h, 6, 1.4, { up: 1, life: 12 }); }
  if (p.onGround && Math.floor(g.frame) % 12 === 0) sfx(g, 'rail');
  if (p.onGround && g.frame % 3 === 0) fx(g, 'spark', p.x + 2 + rnd(g) * 4, p.y + p.h, { vx: -1 - rnd(g), vy: -0.5 - rnd(g), life: 10 });
  if (p.hitWall > 0) { die(g, 'crash'); g.shake = 12; return; }
  p.pose = 'cart'; p.poseT++;
  hazards(g, p);
  if (p.y > g.map.hpx + 24) die(g, 'pit');
}

// platforms -----------------------------------------------------------------------------------------------------
function updatePlat(g, e) {
  const ox = e.x, oy = e.y;
  if (e.kind === 'mover') {
    const o = e.mv, per = (o.period || 4) * 60;
    const ph = (((g.frame + (o.phase || 0) * per) % per) / per) * Math.PI * 2;
    const k = o.loop ? ph / (Math.PI * 2) : (1 - Math.cos(ph)) / 2;
    e.x = e.x0 + (o.dx || 0) * T * k; e.y = e.y0 + (o.dy || 0) * T * k;
  } else if (e.kind === 'faller') {
    const p = g.p;
    if (!e.fall && p.ride === e) e.fall = 1;
    if (e.fall) {
      e.fall++;
      if (e.fall > 22) { e.vy = Math.min(e.vy + 0.25, 5); e.y += e.vy; }
      if (e.y > g.map.hpx + 40) e.dead = true;
    }
  }
  e.dx = e.x - ox; e.dy = e.y - oy;
}

// enemies -------------------------------------------------------------------------------------------------------
function updateEnemy(g, e) {
  const S = ENEMY[e.kind];
  if (e.stun > 0) e.stun--;
  if (e.flash > 0) e.flash--;
  if (S.fly) {
    const t = e.t;
    if (e.kind === 'crow') {
      if (e.mode === 'h') {
        const per = Math.max(60, (e.range * 4) / 0.8);
        const k = (((t + (e.x0 % 97)) % per) / per);
        const tri = k < 0.5 ? k * 2 : 2 - k * 2;
        const nx = e.x0 - e.range + tri * e.range * 2;
        e.dir = nx > e.x ? 1 : -1; e.x = nx; e.y = e.y0 + Math.sin(t / 14) * 3;
      } else { e.y = e.y0 + Math.sin(t / 40) * e.range; e.dir = g.p.x > e.x ? 1 : -1; }
      if (!g.nofx && t % 90 === 0 && Math.abs(g.p.x - e.x) < 200) sfx(g, 'crow');
    } else {
      if (e.mode === 'v') e.y = e.y0 + Math.sin(t / 32) * e.range;
      else { e.x = e.x0 + Math.sin(t / 45) * e.range; e.dir = Math.cos(t / 45) > 0 ? 1 : -1; e.y = e.y0 + Math.sin(t / 9) * 2; }
    }
    return;
  }
  if (e.kind === 'acolyte') {
    const dx = g.p.x - e.x;
    e.dir = dx > 0 ? 1 : -1;
    e.vy += 0.4; e.vx = 0; moveBody(g, e);
    if (e.cool > 0) e.cool--;
    else if (Math.abs(dx) < 230 && Math.abs(g.p.y - e.y) < 140 && g.p.state !== 'dead') {
      e.cool = 150; e.throwT = 18;
      const d = Math.max(40, Math.min(200, Math.abs(dx)));
      add(g, { type: 'shot', kind: 'torch', x: e.x + e.w / 2 - 4, y: e.y - 2, w: 8, h: 8, vx: e.dir * (d / 52), vy: -4.6, life: 400 });
      sfx(g, 'torch');
    }
    if (e.throwT > 0) e.throwT--;
    return;
  }
  // walkers
  let spd = S.spd * (e.angry ? 1.8 : 1);
  if (e.stun > 0) spd = 0;
  if (e.kind === 'rider') { e.vx = e.dir * spd; }
  else e.vx = e.dir * spd;
  e.vy += 0.4; if (e.vy > 6) e.vy = 6;
  moveBody(g, e);
  if (e.hitWall) { e.dir = -e.dir; if (e.kind === 'rider') e.vx = 0; }
  else if (e.onGround && e.kind !== 'rider' && !groundAhead(g, e, e.dir)) e.dir = -e.dir;
  if (e.y > g.map.hpx + 40) e.dead = true;
}

function updateShot(g, s) {
  s.life--;
  if (s.kind === 'torch') {
    if (s.landed) {
      if (s.life <= 0) { s.dead = true; sfx(g, 'fizzle'); burst(g, 'smoke', s.x + 4, s.y + 4, 4, 0.5, { life: 20, up: 0.5 }); }
      if (!g.nofx && g.frame % 4 === 0) fx(g, 'ember', s.x + 4, s.y + 2, { vx: (rnd(g) - 0.5) * 0.4, vy: -0.6, life: 20 });
      return;
    }
    s.vy += 0.22;
    s.x += s.vx; s.y += s.vy;
    const c = Math.floor((s.x + 4) / T), r = Math.floor((s.y + 8) / T);
    const t = tileAt(g, c, r);
    if (isSolid(t) || isTop(t)) { s.y = r * T - 8; s.landed = true; s.life = 70; s.vx = 0; s.vy = 0; }
    else if (t === WATER) { s.dead = true; sfx(g, 'fizzle'); }
    if (!g.nofx && g.frame % 2 === 0) fx(g, 'ember', s.x + 4, s.y + 4, { vx: -s.vx * 0.2, vy: -0.3, life: 16 });
    if (s.y > g.map.hpx + 20 || s.life <= 0) s.dead = true;
  } else if (s.kind === 'flask') {
    if (s.landed) { if (s.life <= 0) s.dead = true; return; }
    s.vy += 0.2; s.x += s.vx; s.y += s.vy;
    const c = Math.floor((s.x + 4) / T), r = Math.floor((s.y + 8) / T);
    if (isSolid(tileAt(g, c, r))) {
      s.landed = true; s.y = r * T - 6; s.h = 6; s.x -= 8; s.w = 24; s.life = 60;
      sfx(g, 'cauldronBreak');
      burst(g, 'drop', s.x + 12, s.y + 4, 10, 2, { up: 1.5, g: 0.15, life: 24, c: 'holy' });
    }
    if (s.y > g.map.hpx + 20) s.dead = true;
  } else if (s.kind === 'boom') {
    if (s.life <= 0) s.dead = true;
  }
}

function kill(g, e, dir = 1, how = 'hit') {
  if (e.dead) return;
  e.dead = true;
  sfx(g, 'enemyDie');
  burst(g, 'poof', e.x + e.w / 2, e.y + e.h / 2, 6, 0.9, { life: 20 });
  fx(g, 'corpse', e.x + e.w / 2, e.y + e.h, { kind: e.kind, face: e.dir, vx: dir * 1.4, vy: -4.2, g: 0.28, life: 90, spin: dir * 0.12 });
  g.ev.push({ k: 'kill', kind: e.kind, how });
}

// pots ----------------------------------------------------------------------------------------------------------
function updatePot(g, e) {
  if (e.state === 'held') return;
  const prevVx = e.vx;
  e.vy += 0.42; if (e.vy > 6.5) e.vy = 6.5;
  if (e.state === 'rest') {
    if (e.onGround) { e.vx *= 0.8; if (Math.abs(e.vx) < 0.05) e.vx = 0; }
    const ox = e.x, oy = e.y;
    moveBody(g, e);
    e.dx = e.x - ox; e.dy = e.y - oy;
  } else if (e.state === 'thrown') {
    const ox = e.x, oy = e.y;
    moveBody(g, e, { noPlat: false });
    e.dx = e.x - ox; e.dy = e.y - oy;
    if (e.onGround) { e.roll++; if (e.kind === 'iron' && e.roll % 10 === 0) sfx(g, 'rail'); }
    if (e.dropped && e.onGround) { e.state = 'rest'; e.dropped = false; }
    if (e.hitWall) {
      if (e.wallTile && tileAt(g, e.wallTile[0], e.wallTile[1]) === BREAK) breakWall(g, e.wallTile[0], e.wallTile[1]);
      if (e.kind === 'iron') {
        e.bounces++; e.vx = -prevVx * 0.92; sfx(g, 'ironClang'); g.shake = 3;
        burst(g, 'spark', e.hitWall > 0 ? e.x + e.w : e.x, e.y + e.h / 2, 6, 1.6, { life: 12 });
        if (e.bounces > 5 || Math.abs(e.vx) < 1) { e.state = 'rest'; e.vx = 0; }
      } else if (e.kind === 'brew') explode(g, e);
      else breakPot(g, e);
    }
    if (e.kind === 'brew' && e.onGround && e.roll > 150) explode(g, e);
  }
  if (e.y > g.map.hpx + 30) e.dead = true;
  // spikes / water don't hurt pots, but water swallows them
  const t = tileAt(g, Math.floor((e.x + e.w / 2) / T), Math.floor((e.y + e.h - 2) / T));
  if (t === WATER) { e.dead = true; sfx(g, 'splash'); fx(g, 'drop', e.x + 7, e.y + 10, { vy: -2, life: 20, g: 0.2, c: g.def.theme }); }
}
function breakPot(g, e) {
  if (e.dead) return;
  e.dead = true;
  sfx(g, 'cauldronBreak');
  g.shake = Math.max(g.shake, 3);
  if (!g.nofx) {
    for (let i = 0; i < 7; i++) fx(g, 'shard', e.x + 7, e.y + 7, { vx: (rnd(g) - 0.5) * 4, vy: -2 - rnd(g) * 3, g: 0.25, life: 50, spin: (rnd(g) - 0.5) * 0.5, kind: e.kind });
    for (let i = 0; i < 10; i++) fx(g, 'drop', e.x + 7, e.y + 4, { vx: (rnd(g) - 0.5) * 3, vy: -1 - rnd(g) * 2.5, g: 0.18, life: 30, c: e.kind === 'partner' ? 'pink' : 'brew' });
  }
  if (e.kind === 'partner') freePartner(g, e.x + 7, e.y + e.h);
}
function freePartner(g, x, y) {
  const lead = g.p.kind;
  const missing = lead === 'mags' ? 'pip' : 'mags';
  if (g.partner) { fx(g, 'text', x, y - 20, { txt: 'COVEN FULL', life: 60, vy: -0.4 }); return; }
  sfx(g, 'partnerFree');
  add(g, { type: 'partnerPop', kind: missing, x: x - 6, y: y - 20, w: 12, h: 20, vx: 0, vy: -4.5, t: 0 });
}
function updatePop(g, e) {
  e.vy += 0.3; e.y += e.vy;
  const p = g.p;
  const tx = p.x + p.w / 2 - p.face * 18;
  e.x += (tx - e.x) * 0.08;
  if (e.t > 34) { e.dead = true; g.partner = e.kind; g.ev.push({ k: 'joined', who: e.kind }); g.trail.length = 0; }
}
function breakWall(g, c, r) {
  // flood-fill connected breakable tiles
  const q = [[c, r]], seen = new Set();
  while (q.length) {
    const [cc, rr] = q.pop();
    const k = cc + ',' + rr;
    if (seen.has(k) || tileAt(g, cc, rr) !== BREAK) continue;
    seen.add(k); setTile(g, cc, rr, EMPTY);
    if (!g.nofx) for (let i = 0; i < 4; i++) fx(g, 'rubble', cc * T + 8, rr * T + 8, { vx: (rnd(g) - 0.5) * 3, vy: -1 - rnd(g) * 3, g: 0.25, life: 50, spin: rnd(g) - 0.5, c: g.def.theme });
    q.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
  }
  sfx(g, 'explosion'); g.shake = 8;
  g.ev.push({ k: 'secret' });
}
function explode(g, e) {
  if (e.dead) return;
  e.dead = true;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  sfx(g, 'explosion'); g.shake = 14;
  add(g, { type: 'shot', kind: 'boom', x: cx - 24, y: cy - 24, w: 48, h: 48, life: 24 });
  burst(g, 'fire', cx, cy, 18, 2.6, { life: 26 });
  burst(g, 'smoke', cx, cy, 10, 1.2, { life: 40, up: 0.6 });
  for (const o of g.ents) {
    if (o.dead) continue;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2, d = Math.hypot(ox - cx, oy - cy);
    if (d > 52) continue;
    if (o.type === 'enemy') kill(g, o, Math.sign(ox - cx) || 1, 'boom');
    else if (o.type === 'pot' && o.state !== 'held') { if (o.kind === 'brew') { o.state = 'thrown'; o.roll = 999; } else if (o.kind !== 'iron') breakPot(g, o); }
    else if (o.type === 'boss') bossHit(g, o);
  }
  const c0 = Math.floor((cx - 40) / T), c1 = Math.floor((cx + 40) / T), r0 = Math.floor((cy - 40) / T), r1 = Math.floor((cy + 40) / T);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(g, c, r) === BREAK) breakWall(g, c, r);
}

// interactions --------------------------------------------------------------------------------------------------
function interact(g, press) {
  const p = g.p;
  const alive = p.state !== 'dead' && p.state !== 'cannon' && p.state !== 'warp';
  for (const e of g.ents) {
    if (e.dead) continue;
    // thrown pots vs enemies
    if (e.type === 'pot' && e.state === 'thrown' && !e.dropped) {
      for (const o of g.ents) {
        if (o.dead || o === e) continue;
        if (o.type === 'enemy' && overlap(e, o, 1)) {
          kill(g, o, Math.sign(e.vx) || 1, 'pot');
          if (e.kind === 'brew') explode(g, e); else if (e.kind !== 'iron') { breakPot(g, e); break; }
        } else if (o.type === 'boss' && overlap(e, o, 2) && !o.dying) {
          bossHit(g, o);
          if (e.kind === 'brew') explode(g, e); else breakPot(g, e);
          break;
        } else if (o.type === 'pot' && o.kind === 'partner' && o.state === 'rest' && overlap(e, o)) { breakPot(g, o); if (e.kind !== 'iron') { breakPot(g, e); break; } }
      }
      if (e.dead) continue;
    }
    if (!alive) continue;
    if (!overlap(p, e)) {
      continue;
    }
    switch (e.type) {
      case 'card':
        e.dead = true; g.run.cards++; g.run.got = (g.run.got || 0) + 1; g.chain = Math.min(g.chain + 1, 20); g.chainT = 40; g.hud.cards = 120;
        sfx(g, 'wisp', { chain: g.chain });
        burst(g, 'spark', e.x + 4, e.y + 5, 5, 1.2, { life: 14, c: 'card' });
        lifeCheck(g);
        break;
      case 'deck':
        e.dead = true; g.run.cards += 10; g.run.got = (g.run.got || 0) + 10; g.hud.cards = 140; sfx(g, 'wispBunch');
        burst(g, 'spark', e.x + 7, e.y + 7, 12, 1.8, { life: 20, c: 'card' });
        lifeCheck(g);
        break;
      case 'letter':
        e.dead = true; g.letters[e.i] = true; g.hud.letters = 160;
        sfx(g, 'letter', { index: e.i });
        burst(g, 'star', e.x + 6, e.y + 7, 10, 1.6, { life: 22 });
        if (g.letters.every(Boolean)) { g.run.lives++; sfx(g, 'letterComplete'); g.hud.lives = 160; fx(g, 'text', e.x + 6, e.y - 4, { txt: 'B-R-E-W! 1UP', life: 90, vy: -0.4 }); }
        break;
      case 'rack':
        if (!e.wait && !p.mount && !p.carry && (p.state === 'normal' || p.state === 'roll')) mountBroom(g, e);
        break;
      case 'cat':
        e.dead = true; g.run.lives++; g.hud.lives = 160; sfx(g, 'life');
        fx(g, 'text', e.x + 7, e.y - 2, { txt: '1UP', life: 70, vy: -0.5 });
        burst(g, 'star', e.x + 7, e.y + 7, 10, 1.4, { life: 22 });
        break;
      case 'page':
        if (e.hidden) break;
        e.dead = true; g.pageGot = true; sfx(g, 'page'); g.ev.push({ k: 'page' });
        burst(g, 'star', e.x + 6, e.y + 7, 14, 1.8, { life: 26 });
        if (g.bonus) { g.bonus.done = true; g.bonus.result = 'win'; g.bonus.endT = 100; g.ev.push({ k: 'bonusResult', win: true }); }
        break;
      case 'check':
        if (!e.on) {
          e.on = true; g.check = { x: e.x + e.w / 2, y: e.y + e.h }; sfx(g, 'checkpoint');
          burst(g, 'bubble', e.x + 10, e.y + 6, 10, 1.2, { up: 0.8, life: 30 });
          g.ev.push({ k: 'checkpoint' });
        }
        break;
      case 'goal':
        if (g.state === 'play' && p.state !== 'blast') {
          g.state = 'clear'; g.stateT = 0; p.vx = 0; p.carry && dropCarry(g);
          sfx(g, 'checkpoint');
          burst(g, 'star', e.x + 16, e.y + 4, 20, 2.2, { life: 30 });
        }
        break;
      case 'shroom':
        if (p.vy > 0 && p.prevBottom <= e.y + 4 && p.state !== 'blast') {
          p.y = e.y - p.h; p.vy = g.inp.jump ? -9.4 : -7.6; p.jumping = true; p.onGround = false; e.sq = 10; p.floatT = 0;
          if (p.state === 'roll') p.state = 'normal';
          sfx(g, 'bounce');
        }
        break;
      case 'cannon':
        if (e.cool <= 0 && p.state !== 'cannon' && p.state !== 'cart' && overlap(p, e, 3)) enterCannon(g, e);
        break;
      case 'pot':
        if (e.state === 'held') break;
        if (e.kind === 'partner' && e.state === 'rest') {
          const stomp = p.vy > 0 && p.prevBottom <= e.y + 6;
          if (stomp || p.state === 'roll' || p.state === 'blast' || p.state === 'dash') { breakPot(g, e); if (stomp) { p.vy = g.inp.jump ? -6.4 : -4.2; p.jumping = true; } }
        }
        break;
      case 'enemy': touchEnemy(g, e); break;
      case 'shot':
        if (e.kind === 'torch' || e.kind === 'flask') hurt(g, 'shot');
        break;
      case 'boss': touchBoss(g, e); break;
      default: break;
    }
  }
}

function lifeCheck(g) {
  while (g.run.cards >= 100) { g.run.cards -= 100; g.run.lives++; g.hud.lives = 160; g.ev.push({ k: 'sfx', n: 'life' }); fx(g, 'text', g.p.x + g.p.w / 2, g.p.y - 6, { txt: '1UP', life: 70, vy: -0.5 }); }
}

function touchEnemy(g, e) {
  const p = g.p, S = ENEMY[e.kind];
  if (e.dead) return;
  const stomp = p.vy > 0.3 && p.prevBottom <= e.y + 7 && p.state !== 'blast';
  const bounce = () => { p.vy = g.inp.jump ? -6.6 : -4.3; p.jumping = true; p.y = Math.min(p.y, e.y - p.h); p.floatT = 0; if (p.state === 'roll') p.state = 'normal'; };
  if (p.state === 'dash') { if (S.sting) { hurt(g, 'enemy', e); return; } kill(g, e, p.face, 'broom'); return; }
  if (p.mount && stomp) { if (S.sting) { hurt(g, 'enemy', e); return; } sfx(g, 'stomp'); kill(g, e, p.face, 'stomp'); bounce(); return; }
  if (p.state === 'blast') {
    if (S.sting || S.heavy) { hurt(g, 'enemy'); return; }
    kill(g, e, Math.sign(p.vx) || 1, 'blast'); return;
  }
  if (p.state === 'cart') {
    if (stomp && S.stomp) { kill(g, e, 1, 'stomp'); bounce(); sfx(g, 'stomp'); return; }
    hurt(g, 'enemy'); return;
  }
  if (stomp) {
    if (!S.stomp) { hurt(g, 'spikes'); if (g.p.state !== 'dead') p.vy = -4; return; }
    sfx(g, 'stomp');
    const dmg = S.heavy && p.kind === 'mags' ? 2 : 1;
    e.hp -= dmg;
    if (e.hp <= 0) kill(g, e, p.face, 'stomp');
    else { e.angry = true; e.stun = 30; e.flash = 20; burst(g, 'star', e.x + e.w / 2, e.y, 6, 1.2, { life: 16 }); }
    bounce();
    return;
  }
  if (p.state === 'roll' || p.state === 'slap') {
    if (S.roll) {
      kill(g, e, p.face, 'roll');
      if (p.state === 'roll') { p.rollT = Math.max(p.rollT, 20); p.rollSpd = Math.min(p.rollSpd + 0.35, 5.2); }
      return;
    }
    if (S.shield) { // shield deflects the roll
      p.state = 'normal'; p.vx = -p.face * 2.6; p.vy = -2.5; e.stun = 20; sfx(g, 'ironClang');
      burst(g, 'spark', e.x + e.w / 2 - e.dir * 6, e.y + 10, 5, 1.4, { life: 10 });
      return;
    }
  }
  if (e.stun > 0 && !S.sting && !S.heavy) return;
  hurt(g, 'enemy', e);
}

// bonus rooms ---------------------------------------------------------------------------------------------------
function updateBonus(g) {
  const b = g.bonus;
  if (b.done) {
    if (--b.endT === 0) g.ev.push({ k: 'bonusEnd', win: b.result === 'win' });
    return;
  }
  b.left--;
  if (b.kind === 'collect' && !g.ents.some((e) => e.type === 'card' || e.type === 'deck')) revealPage(g);
  if (b.kind === 'stomp' && !g.ents.some((e) => e.type === 'enemy')) revealPage(g);
  if (b.left <= 0 && !b.done) {
    b.done = true; b.result = 'lose'; b.endT = 80; g.ev.push({ k: 'bonusResult', win: false });
  }
}
function revealPage(g) {
  for (const e of g.ents) if (e.type === 'page' && e.hidden) {
    e.hidden = false; sfx(g, 'letterComplete');
    burst(g, 'star', e.x + 6, e.y + 7, 14, 2, { life: 24 });
  }
}

// boss ----------------------------------------------------------------------------------------------------------
function makeBoss(x, y) {
  return { type: 'boss', x: x - 16, y: y - 20, w: 46, h: 36, vx: 0, vy: 0, hp: 6, maxHp: 6, dir: -1, mode: 'intro', modeT: 0, inv: 0, atk: 0, arm: 0, dying: false, onGround: false, plat: true, dx: 0, dy: 0 };
}
function updateBoss(g, b) {
  const ox = b.x, oy = b.y;
  bossThink(g, b);
  b.dx = b.x - ox; b.dy = b.y - oy;
}
function bossThink(g, b) {
  b.modeT++;
  if (b.inv > 0) b.inv--;
  const p = g.p;
  const spd = 0.8 + (b.maxHp - b.hp) * 0.18;
  const phase2 = b.hp <= 3;
  b.vy += 0.4;
  if (b.dying) {
    b.vx = 0; moveBody(g, b);
    if (b.modeT % 6 === 0) { burst(g, 'fire', b.x + rnd(g) * b.w, b.y + rnd(g) * b.h, 5, 1.6, { life: 20 }); sfx(g, 'explosion'); g.shake = 6; }
    if (b.modeT === 150) { sfx(g, 'bossDie'); burst(g, 'smoke', b.x + 24, b.y + 20, 24, 2, { life: 50 }); fx(g, 'flee', b.x + 24, b.y + 10, { kind: 'finder', face: 1, vx: 2.4, vy: -5, g: 0.2, life: 160 }); }
    if (b.modeT === 200) {
      b.dead = true;
      add(g, { type: 'goal', x: Math.min(g.map.wpx - 64, Math.max(32, b.x + 8)), y: b.y + b.h - 26, w: 32, h: 26, hoard: true });
    }
    return;
  }
  if (b.mode === 'intro') { b.vx = 0; moveBody(g, b); if (b.modeT > 90) setMode(b, 'roll'); return; }
  if (b.mode === 'roll') {
    b.vx = b.dir * spd;
    moveBody(g, b);
    if (b.hitWall) { b.dir = -b.dir; g.shake = 5; sfx(g, 'ironClang'); b.turnT = 24; }
    if (b.turnT > 0) { b.turnT--; b.vx = 0; }
    if (b.modeT > (phase2 ? 100 : 130)) {
      const pots = g.ents.filter((e) => e.type === 'pot' && !e.dead).length;
      const near = Math.abs(p.x - b.x - b.w / 2) < 90;
      setMode(b, pots === 0 ? 'slam' : near ? 'arm' : (b.atk++ % 2 ? 'flask' : 'slam'));
    }
  } else if (b.mode === 'arm') {
    b.vx = 0; moveBody(g, b);
    b.dir = p.x + p.w / 2 > b.x + b.w / 2 ? 1 : -1;
    b.arm = b.modeT < 40 ? b.modeT / 40 : b.modeT < 56 ? 1 + (b.modeT - 40) / 16 : Math.max(0, 2 - (b.modeT - 56) / 20);
    if (b.modeT === 46) sfx(g, 'throw');
    if (b.modeT > 44 && b.modeT < 58) {
      const ax = b.dir > 0 ? b.x + b.w : b.x - 44;
      if (overlap(p, { x: ax, y: b.y + 8, w: 44, h: 26 })) hurt(g, 'boss');
    }
    if (b.modeT > (phase2 && !b.second ? 70 : 80)) { if (phase2 && !b.second) { b.second = true; setMode(b, 'arm'); } else { b.second = false; setMode(b, 'roll'); } }
  } else if (b.mode === 'flask') {
    b.vx = 0; moveBody(g, b);
    const n = phase2 ? 5 : 3;
    if (b.modeT % 18 === 0 && b.modeT / 18 <= n) {
      const k = b.modeT / 18;
      const tx = p.x + p.w / 2 + (k - (n + 1) / 2) * 40;
      const dx = tx - (b.x + b.w / 2);
      add(g, { type: 'shot', kind: 'flask', x: b.x + b.w / 2 - 4, y: b.y - 6, w: 8, h: 8, vx: dx / 60, vy: -6, life: 300 });
      sfx(g, 'throw');
    }
    if (b.modeT > 18 * n + 40) setMode(b, 'roll');
  } else if (b.mode === 'slam') {
    b.vx = 0;
    if (b.modeT === 20) b.vy = -5;
    moveBody(g, b);
    if (b.modeT > 22 && b.onGround && !b.slammed) {
      b.slammed = true; g.shake = 16; sfx(g, 'bossHit');
      burst(g, 'dust', b.x + b.w / 2, b.y + b.h, 14, 2, { life: 24 });
      const drops = g.ents.filter((e) => e.type === 'dropper');
      const pots = g.ents.filter((e) => e.type === 'pot' && !e.dead).length;
      if (drops.length && pots < 2) {
        const far = drops.slice().sort((a, c) => Math.abs(c.x - b.x) - Math.abs(a.x - b.x));
        const d = far[(b.atk + g.frame) % Math.min(2, far.length)];
        const mercy = !g.partner && !g.ents.some((e) => e.type === 'pot' && e.kind === 'partner') && b.atk % 2 === 1;
        const pot = addPot(g, mercy ? 'partner' : b.atk % 3 === 2 ? 'brew' : 'clay', d.x, d.y);
        pot.state = 'thrown'; pot.dropped = true; pot.vx = 0; pot.vy = 0;
      }
      // shockwave hurts if grounded and close
      if (p.ride === b) { p.vy = -6; p.onGround = false; p.vx = (p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1) * 2.5; }
      else if (p.onGround && Math.abs(p.x + p.w / 2 - b.x - b.w / 2) < 70) hurt(g, 'boss');
    }
    if (b.modeT > 70) { b.slammed = false; setMode(b, 'roll'); }
  } else if (b.mode === 'hit') {
    b.vx = -b.dir * 2.2 * Math.max(0, 1 - b.modeT / 30); moveBody(g, b);
    if (b.modeT > 50) { b.dir = p.x > b.x ? 1 : -1; setMode(b, 'slam'); }
  }
}
function setMode(b, m) { b.mode = m; b.modeT = 0; b.arm = 0; }
function bossHit(g, b) {
  if (b.inv > 0 || b.dying) return;
  b.hp--; b.inv = 70; g.shake = 12;
  sfx(g, 'bossHit');
  burst(g, 'star', b.x + b.w / 2, b.y + 10, 12, 2, { life: 24 });
  g.ev.push({ k: 'bossHit', hp: b.hp });
  if (b.hp <= 0) { b.dying = true; b.modeT = 0; g.ev.push({ k: 'bossDown' }); }
  else { b.dir = g.p.x > b.x ? 1 : -1; setMode(b, 'hit'); }
}
function touchBoss(g, b) {
  const p = g.p;
  if (b.dying) return;
  if (p.ride === b) return;
  if (p.invuln > 0) { p.x += Math.sign(p.x + p.w / 2 - b.x - b.w / 2 || 1) * 2.5; return; }
  const stomp = p.vy > 0.3 && p.prevBottom <= b.y + 10;
  if (stomp) { p.vy = g.inp.jump ? -6.6 : -4.6; p.jumping = true; sfx(g, 'ironClang'); b.laugh = 40; return; }
  hurt(g, 'boss', b);
}

// camera --------------------------------------------------------------------------------------------------------
export function snapCam(g) {
  const p = g.p, m = g.map;
  g.cam.x = clamp(p.x + p.w / 2 - W / 2, 0, Math.max(0, m.wpx - W));
  g.cam.y = clamp(p.y + p.h - H * 0.62, 0, Math.max(0, m.hpx - H));
}
function updateCam(g) {
  const p = g.p, m = g.map, cam = g.cam;
  if (p.state === 'dead') return;
  const rail = p.state === 'cart';
  const lookT = rail ? 110 : p.state === 'blast' ? Math.sign(p.vx) * 70 : p.face * (Math.abs(p.vx) > 2 ? 56 : 36);
  cam.look += (lookT - cam.look) * (rail ? 0.1 : 0.035);
  const tx = clamp(p.x + p.w / 2 - W / 2 + cam.look, 0, Math.max(0, m.wpx - W));
  cam.x += (tx - cam.x) * (rail ? 0.5 : 0.2);
  if (Math.abs(tx - cam.x) > 140) cam.x = tx - Math.sign(tx - cam.x) * 140;
  // vertical: settle when grounded, chase when leaving the comfort band
  const by = p.y + p.h;
  let ty = cam.y;
  if (p.onGround || p.state === 'cannon' || p.state === 'blast' || p.floating) ty = by - H * 0.64;
  const top = cam.y + H * 0.22, bot = cam.y + H * 0.8;
  if (p.y < top) ty = Math.min(ty, p.y - H * 0.22);
  if (by > bot) ty = Math.max(ty, by - H * 0.8);
  ty = clamp(ty, 0, Math.max(0, m.hpx - H));
  cam.y += (ty - cam.y) * (p.state === 'blast' || by > bot ? 0.25 : 0.09);
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// fx ------------------------------------------------------------------------------------------------------------
function updateFx(g) {
  if (g.hud.cards > 0) g.hud.cards--;
  if (g.hud.lives > 0) g.hud.lives--;
  if (g.hud.letters > 0) g.hud.letters--;
  const out = [];
  for (const f of g.fx) {
    f.t++;
    f.vy += f.g; f.x += f.vx; f.y += f.vy; f.a += f.spin;
    if (f.k === 'dust' || f.k === 'smoke' || f.k === 'poof') { f.vx *= 0.92; f.vy *= 0.92; }
    if (f.t < f.life) out.push(f);
  }
  g.fx = out.length > 400 ? out.slice(out.length - 400) : out;
}

// helpers for main / bots ---------------------------------------------------------------------------------------
export function progress(g) { return (g.p.x + g.p.w / 2) / g.map.wpx; }
export function countWisps(def) { let n = 0; for (const r of def.rows) for (const ch of r) { if (ch === 'o') n++; if (ch === '%') n += 10; } return n; }
