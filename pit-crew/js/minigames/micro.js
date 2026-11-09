// Five tiny 4-bit microgames for the cabinets in the Summer Shutdown arcade.
// make() returns { update(dt, io), draw(c), score }; c is a 64x48 2D context, the whole screen.
// Each game hands cabinet() a small { score, reset(), step(dt, io), paint(c) }; step returns false at game over.
const W = 64, H = 48;
const BLACK = '#000000';
const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const mod = (v, m) => ((v % m) + m) % m;
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.floor(x), Math.floor(y), w, h); };

// 3x5 font: one octal digit per row.
const GLYPH = {
  0: '75557', 1: '26227', 2: '71747', 3: '71317', 4: '55711', 5: '74717', 6: '74757', 7: '71122', 8: '75757', 9: '75717',
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152',
  K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222',
  U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
};
function txt(c, s, x, y, col) {
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    const g = GLYPH[s[i]];
    if (!g) continue;
    for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if ((+g[r] >> (2 - b)) & 1) R(c, x + i * 4 + b, y + r, 1, 1, col);
  }
}
const mid = (c, s, y, col) => txt(c, s, (W - String(s).length * 4 + 1) >> 1, y, col);

// Bitmap sprite: one base-32 digit per row, w bits wide.
function spr(c, x, y, rows, col, w = 4) {
  for (let r = 0; r < rows.length; r++) {
    const v = parseInt(rows[r], 32);
    for (let b = 0; b < w; b++) if ((v >> (w - 1 - b)) & 1) R(c, x + b, y + r, 1, 1, col);
  }
}
const pips = (c, n, x, y, col) => { for (let i = 0; i < n; i++) R(c, x - i * 3, y, 2, 2, col); };
const moveX = io => (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
const moveY = io => (io.held('KeyS') || io.held('ArrowDown') ? 1 : 0) - (io.held('KeyW') || io.held('ArrowUp') ? 1 : 0);

// The shared shell: attract screen, play, game over, Space to restart.
function cabinet(title, ink, g) {
  let mode = 0, t = 0; // 0 attract, 1 playing, 2 game over
  const o = {
    score: 0,
    update(dt, io) {
      dt = dt > 0 ? Math.min(dt, 1 / 30) : 0;
      t += dt;
      if (mode === 1) {
        if (!g.step(dt, io)) { mode = 2; t = 0; }
        o.score = g.score;
      } else if (t > 0.5 && io.pressed('Space')) {
        g.reset(); o.score = 0; mode = 1; t = 0;
      }
    },
    draw(c) {
      R(c, 0, 0, W, H, BLACK);
      g.paint(c);
      if (mode === 1) return;
      R(c, 5, 11, 54, 24, BLACK);
      mid(c, mode === 2 ? 'GAME OVER' : title, 13, ink);
      if (mode === 2) mid(c, g.score, 20, ink);
      if (t > 0.5 && Math.floor(t * 2.5) % 2 === 0) mid(c, 'PRESS SPACE', 28, ink);
    },
  };
  return o;
}

// WALL BANGER: bounce a wheel nut off the jack and knock down the tyre stacks. H stacks take two hits.
function wallBanger() {
  const [TYRE, HARD, NUT, EDGE] = ['#ff8a1f', '#e8355a', '#fff0b8', '#2fb8c8'];
  const LAYOUTS = [
    ['XX....HXXX', 'XXX....HXX', '.XXX....HX', '..HXX....X', 'X..HXX....', 'XX..HXXX..'], // chicane
    ['HHHHHHHHHH', '.X.X..X.X.', 'XXXX..XXXX', '.X.X..X.X.', 'XX......XX', 'X........X'], // grandstand
    ['XX.XX.XX.X', 'XH.XH.XH.X', 'XX.XX.XX.X', '..........', 'HX.XX.XX.H', 'XX.XX.XX.X'], // pit boxes
    ['....HH....', '...XXXX...', '..XX..XX..', '.HX....XH.', '..XX..XX..', '...XXXX...'], // tyre on its side
  ];
  const BW = 6, BH = 3, BX = 2, BY = 8, COLS = 10, ROWS = 6, PY = 44;
  let px, pw, bx, by, vx, vy, sp, held, lives, lv, bricks;
  const serve = () => { held = true; pw = Math.max(8, 14 - lv); sp = Math.min(32 + lv * 5, 54); px = clamp(px, 1, W - 1 - pw); };
  const load = () => { bricks = LAYOUTS[lv % LAYOUTS.length].join('').split('').map(ch => (ch === 'H' ? 2 : ch === 'X' ? 1 : 0)); serve(); };
  const brickAt = (x, y) => {
    const col = Math.floor((x - BX) / BW), row = Math.floor((y - BY) / BH);
    return col >= 0 && col < COLS && row >= 0 && row < ROWS ? row * COLS + col : -1;
  };
  const smash = () => {
    for (const [ox, oy] of [[0, 0], [1.9, 0], [0, 1.9], [1.9, 1.9]]) {
      const i = brickAt(bx + ox, by + oy);
      if (i >= 0 && bricks[i] > 0) {
        bricks[i]--;
        g.score += 10 + lv * 5;
        sp = Math.min(sp + 0.5, 62);
        return true;
      }
    }
    return false;
  };
  const g = {
    score: 0,
    reset() { g.score = 0; lives = 3; lv = 0; px = 25; load(); bx = px + pw / 2 - 1; by = PY - 2; vx = vy = 0; },
    step(dt, io) {
      px = clamp(px + moveX(io) * 64 * dt, 1, W - 1 - pw);
      if (held) {
        bx = px + pw / 2 - 1; by = PY - 2;
        if (io.pressed('Space')) { const a = rnd(-0.5, 0.5); vx = sp * Math.sin(a); vy = -sp * Math.cos(a); held = false; }
        return true;
      }
      bx += vx * dt;
      if (bx < 1) { bx = 1; vx = Math.abs(vx); }
      else if (bx > W - 3) { bx = W - 3; vx = -Math.abs(vx); }
      else if (smash()) { bx -= vx * dt; vx = -vx; }
      by += vy * dt;
      if (by < 7) { by = 7; vy = Math.abs(vy); }
      else if (smash()) { by -= vy * dt; vy = -vy; }
      if (vy > 0 && by + 2 >= PY && by < PY + 2 && bx + 2 > px && bx < px + pw) {
        const a = clamp((bx + 1 - (px + pw / 2)) / (pw / 2), -1, 1) * 1.05; // further from the middle, flatter the bounce
        vx = sp * Math.sin(a); vy = -sp * Math.cos(a); by = PY - 2;
      }
      if (by > H) { lives--; serve(); return lives > 0; }
      if (bricks.every(b => b === 0)) { lv++; g.score += 50 * lv; load(); }
      return true;
    },
    paint(c) {
      txt(c, g.score, 1, 0, NUT);
      pips(c, lives, 61, 2, TYRE);
      R(c, 0, 6, W, 1, EDGE); R(c, 0, 6, 1, H - 6, EDGE); R(c, W - 1, 6, 1, H - 6, EDGE);
      bricks.forEach((b, i) => {
        if (!b) return;
        const x = BX + (i % COLS) * BW, y = BY + Math.floor(i / COLS) * BH;
        R(c, x, y, BW - 1, BH - 1, b > 1 ? HARD : TYRE);
        R(c, x + 2, y, 1, 1, BLACK);
      });
      R(c, px, PY, pw, 2, EDGE);
      R(c, px + 2, PY, pw - 4, 1, NUT);
      R(c, bx, by, 2, 2, NUT);
    },
  };
  g.reset();
  return cabinet('WALL BANGER', NUT, g);
}

// NUT RUN: a loose tyre rolls round the pit garage picking up dropped wheel nuts, chased by marshals.
function nutRun() {
  const [WALL, TYRE, MARSHAL, FUEL] = ['#1e8a52', '#f4f060', '#ff5cc8', '#66e8ff'];
  const MAP = [
    '################',
    '#......#.......#',
    '#.##.#.#.###.#.#',
    '#.#..#...#...#.#',
    '#.#.###.##.###.#',
    '#...#.......#..#',
    '###.#.##.##.#.##',
    '###...#...#...##',
    '#####...#...####',
    '################',
  ];
  const OY = 7;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const open = (c, r) => !!MAP[r] && MAP[r][c] === '.';
  const sx = a => a.c * 4 + a.dx * a.f * 4;
  const sy = a => a.r * 4 + a.dy * a.f * 4 + OY;
  let me, foes, nuts, left, lives, lv, fuel, chain, pause, clock;
  const near = (a, b, d) => Math.abs(sx(a) - sx(b)) + Math.abs(sy(a) - sy(b)) < d;
  const spawn = () => {
    me = { c: 8, r: 7, dx: 0, dy: 0, f: 0, wx: 0, wy: 0 };
    foes = [[3, 1], [11, 1], [7, 3]].slice(0, Math.min(3, 2 + lv)).map(([c, r], i) => ({ c, r, dx: 0, dy: 0, f: 0, wait: i * 1.2, flat: 0 }));
    fuel = 0;
  };
  const load = () => {
    nuts = MAP.map(row => row.split('').map(ch => (ch === '.' ? 1 : 0)));
    nuts[7][8] = 0;
    [[1, 5], [14, 1], [12, 7]].slice(0, lv < 2 ? 3 : 2).forEach(([c, r]) => { nuts[r][c] = 2; });
    left = nuts.reduce((n, row) => n + row.filter(v => v === 1).length, 0);
    spawn();
  };
  const advance = (a, spd, dt, turn) => {
    if (a.dx || a.dy) {
      a.f += spd * dt;
      if (a.f < 1) return;
      a.c += a.dx; a.r += a.dy; a.f -= 1;
    }
    turn(a);
    if (!a.dx && !a.dy) a.f = 0;
  };
  const steer = a => {
    const tries = a.dx ? [[0, a.wy], [a.wx, 0]] : [[a.wx, 0], [0, a.wy]];
    tries.push([a.dx, a.dy]);
    for (const [dx, dy] of tries) if ((dx || dy) && open(a.c + dx, a.r + dy)) { a.dx = dx; a.dy = dy; return; }
    a.dx = a.dy = 0;
  };
  const prowl = (m, scared) => {
    const opts = DIRS.filter(([dx, dy]) => open(m.c + dx, m.r + dy) && !(dx === -m.dx && dy === -m.dy && (dx || dy)));
    if (!opts.length) { m.dx = -m.dx; m.dy = -m.dy; return; }
    let pick = opts[Math.floor(Math.random() * opts.length)];
    if (scared || Math.random() < Math.min(0.5 + lv * 0.12, 0.9)) {
      let best = Infinity;
      for (const o of opts) {
        const d = ((m.c + o[0] - me.c) ** 2 + (m.r + o[1] - me.r) ** 2) * (scared ? -1 : 1);
        if (d < best) { best = d; pick = o; }
      }
    }
    m.dx = pick[0]; m.dy = pick[1];
  };
  const g = {
    score: 0,
    reset() { g.score = 0; lives = 3; lv = 0; pause = 0; chain = 0; clock = 0; load(); },
    step(dt, io) {
      clock += dt;
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) { if (lives <= 0) return false; spawn(); }
        return true;
      }
      fuel = Math.max(0, fuel - dt);
      const ix = moveX(io), iy = moveY(io);
      if (ix || iy) { me.wx = ix; me.wy = iy; }
      if ((me.dx && ix === -me.dx) || (me.dy && iy === -me.dy)) { me.c += me.dx; me.r += me.dy; me.f = 1 - me.f; me.dx = -me.dx; me.dy = -me.dy; }
      advance(me, 6.2, dt, steer);
      const here = nuts[me.r][me.c];
      if (here === 1) { nuts[me.r][me.c] = 0; left--; g.score += 5; }
      if (here === 2) { nuts[me.r][me.c] = 0; fuel = Math.max(2.5, 5.5 - lv * 0.4); chain = 0; g.score += 10; }
      const spd = Math.min(3.8 + lv * 0.4, 5.6);
      for (const m of foes) {
        if (m.wait > 0) { m.wait -= dt; continue; }
        if (m.flat > 0) {
          m.flat -= dt;
          if (m.flat <= 0 && near(m, me, 12)) m.flat = 0.4; // stays down until the tyre has rolled clear
          continue;
        }
        const scared = fuel > 0;
        advance(m, scared ? 2.6 : spd, dt, n => prowl(n, scared));
        if (near(m, me, 3)) {
          if (scared) { m.flat = 3; chain++; g.score += 50 * chain; }
          else { lives--; pause = 1; return true; }
        }
      }
      if (left <= 0) { lv++; g.score += 200; load(); pause = 0.01; }
      return true;
    },
    paint(c) {
      txt(c, g.score, 1, 0, TYRE);
      pips(c, lives, 61, 2, TYRE);
      const blink = Math.floor(clock * 6) % 2 === 0;
      for (let r = 0; r < MAP.length; r++) for (let q = 0; q < 16; q++) {
        const x = q * 4, y = OY + r * 4;
        if (MAP[r][q] === '#') R(c, x, y, 4, 4, WALL);
        else if (nuts[r][q] === 1) R(c, x + 1, y + 1, 2, 2, TYRE);
        else if (nuts[r][q] === 2 && blink) spr(c, x, y, 'efff', FUEL);
      }
      for (const m of foes) {
        if (m.flat > 0) R(c, sx(m), sy(m) + 3, 4, 1, FUEL);
        else spr(c, sx(m), sy(m), '6f69', fuel > 1.2 || (fuel > 0 && blink) ? FUEL : MARSHAL);
      }
      if (pause <= 0 || blink) spr(c, sx(me), sy(me), '6996', TYRE);
    },
  };
  g.reset();
  return cabinet('NUT RUN', TYRE, g);
}

// CONE ATTACK: a pit car clears staggered ranks of traffic cones. Cones drip oil; the low tyre walls erode.
function coneAttack() {
  const [CONE, CAR, WALL, OIL] = ['#ff6a2a', '#eaf6ff', '#4a90ff', '#c070ff'];
  const COLS = 7, CW = 7, CH = 6, CARY = 45;
  let car, cones, ox, oy, dir, tick, flip, shot, oil, walls, lives, lv, cool, inv, drop, pause, total;
  const kx = k => ox + k.c * CW + (k.r % 2) * 3;
  const ky = k => oy + k.r * CH;
  const wallAt = (x, y) => walls.findIndex(w => x >= w.x && x < w.x + 2 && y >= w.y && y < w.y + 2);
  const load = () => {
    const rows = lv >= 2 ? 4 : 3;
    cones = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) cones.push({ c, r });
    total = cones.length;
    ox = 8; oy = Math.min(8 + lv * 2, 14); dir = 1; tick = 0.6; flip = 0;
    shot = null; oil = []; drop = 1.2; walls = [];
    for (const x0 of [7, 27, 47]) for (let i = 0; i < 5; i++) {
      if (i > 0 && i < 4) walls.push({ x: x0 + i * 2, y: 36 });
      walls.push({ x: x0 + i * 2, y: 38 });
    }
  };
  const moveShot = d => {
    shot.y -= d;
    if (shot.y < 6) { shot = null; return; }
    const i = cones.findIndex(k => shot.x >= kx(k) && shot.x < kx(k) + 5 && shot.y >= ky(k) && shot.y < ky(k) + 4);
    if (i >= 0) { g.score += (total / COLS - cones[i].r) * 10; cones.splice(i, 1); shot = null; return; }
    const w = wallAt(shot.x, shot.y);
    if (w >= 0) { walls.splice(w, 1); shot = null; }
  };
  const march = () => {
    tick = Math.max(0.05, (0.1 + 0.5 * cones.length / total) / (1 + lv * 0.15));
    flip = 1 - flip;
    const lo = Math.min(...cones.map(kx)), hi = Math.max(...cones.map(kx)) + 5;
    if ((dir > 0 && hi + 2 > W - 1) || (dir < 0 && lo - 2 < 1)) { dir = -dir; oy += 2; } else ox += dir * 2;
    for (const k of cones) for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) { const w = wallAt(kx(k) + x, ky(k) + y); if (w >= 0) walls.splice(w, 1); }
    if (Math.max(...cones.map(ky)) + 4 >= CARY) { lives = 0; pause = 1; }
  };
  const g = {
    score: 0,
    reset() { g.score = 0; lives = 3; lv = 0; car = 29; cool = 0; inv = 0; pause = 0; load(); },
    step(dt, io) {
      if (pause > 0) { pause -= dt; return pause > 0 || lives > 0; }
      car = clamp(car + moveX(io) * 46 * dt, 1, W - 6);
      cool -= dt; inv -= dt; tick -= dt; drop -= dt;
      if (!shot && cool <= 0 && (io.held('Space') || io.pressed('Space'))) { shot = { x: car + 2, y: CARY - 1 }; cool = 0.22; }
      for (let i = 0; i < 3 && shot; i++) moveShot(74 * dt / 3);
      if (!cones.length) { lv++; g.score += 100 * lv; load(); pause = 0.7; return true; }
      if (tick <= 0) { march(); if (pause > 0) return true; }
      if (drop <= 0) {
        drop = rnd(0.5, 1.3) / (1 + lv * 0.2);
        if (oil.length < Math.min(2 + lv, 6)) {
          const col = cones[Math.floor(Math.random() * cones.length)].c;
          const k = cones.filter(n => n.c === col).reduce((a, b) => (b.r > a.r ? b : a));
          oil.push({ x: kx(k) + 2, y: ky(k) + 4 });
        }
      }
      const fall = Math.min(22 + lv * 3, 38) * dt;
      let crashed = false;
      oil = oil.filter(o => {
        o.y += fall;
        let w = wallAt(o.x, o.y + 2);
        if (w < 0) w = wallAt(o.x + 1, o.y + 2);
        if (w >= 0) { walls.splice(w, 1); const n = wallAt(o.x, o.y + 4); if (n >= 0) walls.splice(n, 1); return false; }
        if (inv <= 0 && o.y + 2 >= CARY && o.x + 2 > car && o.x < car + 5) { crashed = true; return false; }
        return o.y < H;
      });
      if (crashed) { lives--; inv = 1.6; pause = 0.7; oil = []; }
      return true;
    },
    paint(c) {
      txt(c, g.score, 1, 0, CAR);
      pips(c, lives, 61, 2, CAR);
      for (const k of cones) { spr(c, kx(k), ky(k), '4eev', CONE, 5); R(c, kx(k) + 1, ky(k) + 1 + flip, 3, 1, CAR); }
      for (const w of walls) R(c, w.x, w.y, 2, 2, WALL);
      for (const o of oil) R(c, o.x, o.y, 2, 2, OIL);
      if (shot) R(c, shot.x, shot.y, 1, 2, CAR);
      if (inv <= 0 || Math.floor(inv * 8) % 2 === 0) spr(c, car, CARY, 'evl', CAR, 5);
    },
  };
  g.reset();
  return cabinet('CONE ATTACK', CONE, g);
}

// SHRAPNEL: a tiny recovery ship sweeps up carbon-fibre shards that break into smaller, faster splinters.
function shrapnel() {
  const [SHIP, SHARD, BOLT, FLAME] = ['#f2f4ff', '#9d8cff', '#ffd24a', '#ff4f70'];
  const SIZES = [2, 3.5, 6], POINTS = [40, 20, 10];
  let s, rocks, bolts, lives, lv, cool, gap, dead, clock, burn;
  const near = (a, b) => Math.hypot(mod(a.x - b.x + W / 2, W) - W / 2, mod(a.y - b.y + H / 2, H) - H / 2);
  const rock = (tier, x, y, vx, vy) => {
    const n = tier ? 6 : 4, r = SIZES[tier];
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([TAU * i / n + rnd(-0.3, 0.3), r * (i % 2 ? rnd(0.35, 0.6) : rnd(0.9, 1.15))]); // spiky, not round
    return { tier, x, y, vx, vy, a: rnd(0, TAU), spin: rnd(-1.5, 1.5), pts };
  };
  const wave = () => {
    rocks = [];
    const speed = Math.min(5 + lv * 1.2, 16);
    for (let i = 0; i < Math.min(3 + lv, 7); i++) {
      let p = { x: 0, y: 0 };
      for (let t = 0; t < 16; t++) { p = { x: rnd(0, W), y: rnd(0, H) }; if (near(p, s) > 20) break; }
      const a = rnd(0, TAU), v = rnd(speed, speed * 1.8);
      rocks.push(rock(2, p.x, p.y, Math.cos(a) * v, Math.sin(a) * v));
    }
  };
  const centre = () => { s = { x: W / 2, y: H / 2 + 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2 }; };
  const split = i => {
    const k = rocks[i];
    rocks.splice(i, 1);
    g.score += POINTS[k.tier];
    if (!k.tier) return;
    for (const d of [-0.7, 0.7]) {
      const c = Math.cos(d) * 1.3, n = Math.sin(d) * 1.3;
      rocks.push(rock(k.tier - 1, k.x, k.y, k.vx * c - k.vy * n, k.vx * n + k.vy * c));
    }
  };
  const line = (c, x0, y0, x1, y1, col) => {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let i = 0; i <= n; i++) R(c, mod(Math.round(x0 + (x1 - x0) * i / n), W), mod(Math.round(y0 + (y1 - y0) * i / n), H), 1, 1, col);
  };
  const ring = (c, x, y, a, pts, col) => {
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      line(c, x + Math.cos(p[0] + a) * p[1], y + Math.sin(p[0] + a) * p[1], x + Math.cos(q[0] + a) * q[1], y + Math.sin(q[0] + a) * q[1], col);
    });
  };
  const g = {
    score: 0,
    reset() { g.score = 0; lives = 3; lv = 0; cool = 0; gap = 0; dead = 0; clock = 0; burn = false; bolts = []; centre(); wave(); },
    step(dt, io) {
      clock += dt;
      for (const k of rocks) { k.x = mod(k.x + k.vx * dt, W); k.y = mod(k.y + k.vy * dt, H); k.a += k.spin * dt; }
      bolts = bolts.filter(b => { b.x = mod(b.x + b.vx * dt, W); b.y = mod(b.y + b.vy * dt, H); b.life -= dt; return b.life > 0; });
      for (let b = bolts.length - 1; b >= 0; b--) {
        const i = rocks.findIndex(k => near(bolts[b], k) < SIZES[k.tier] + 1);
        if (i >= 0) { split(i); bolts.splice(b, 1); }
      }
      if (dead > 0) {
        dead -= dt;
        if (dead <= 0) { if (lives <= 0) return false; centre(); }
        return true;
      }
      s.a += moveX(io) * 4.6 * dt;
      burn = io.held('KeyW') || io.held('ArrowUp');
      if (burn) { s.vx += Math.cos(s.a) * 42 * dt; s.vy += Math.sin(s.a) * 42 * dt; }
      const drag = 1 - Math.min(0.4 * dt, 0.5);
      s.vx *= drag; s.vy *= drag;
      const v = Math.hypot(s.vx, s.vy);
      if (v > 48) { s.vx *= 48 / v; s.vy *= 48 / v; }
      s.x = mod(s.x + s.vx * dt, W); s.y = mod(s.y + s.vy * dt, H);
      s.inv -= dt; cool -= dt;
      if (cool <= 0 && bolts.length < 4 && (io.held('Space') || io.pressed('Space'))) {
        bolts.push({ x: s.x + Math.cos(s.a) * 4, y: s.y + Math.sin(s.a) * 4, vx: Math.cos(s.a) * 58 + s.vx * 0.5, vy: Math.sin(s.a) * 58 + s.vy * 0.5, life: 0.75 });
        cool = 0.2;
      }
      if (s.inv <= 0 && rocks.some(k => near(s, k) < SIZES[k.tier] * 0.8 + 1.5)) { lives--; dead = 1.2; bolts = []; burn = false; return true; }
      if (!rocks.length) { gap += dt; if (gap > 1.1) { gap = 0; lv++; s.inv = Math.max(s.inv, 1.5); wave(); } }
      return true;
    },
    paint(c) {
      for (const k of rocks) ring(c, k.x, k.y, k.a, k.pts, SHARD);
      for (const b of bolts) R(c, b.x, b.y, 1, 1, BOLT);
      if (dead <= 0 && (s.inv <= 0 || Math.floor(clock * 10) % 2 === 0)) {
        ring(c, s.x, s.y, s.a, [[0, 4], [2.5, 3.2], [Math.PI, 1.2], [-2.5, 3.2]], SHIP);
        if (burn && Math.floor(clock * 20) % 2 === 0) line(c, s.x - Math.cos(s.a) * 2, s.y - Math.sin(s.a) * 2, s.x - Math.cos(s.a) * 5, s.y - Math.sin(s.a) * 5, FLAME);
      }
      txt(c, g.score, 1, 0, BOLT);
      pips(c, lives, 61, 2, SHIP);
    },
  };
  g.reset();
  return cabinet('SHRAPNEL', SHARD, g);
}

// SCAFFOLD: a mechanic climbs the garage scaffold to the trophy while a loose stack keeps shedding tyres.
// Tyres roll down the top beam, split at the ridge, feed the valley and drop through its gap to the floor.
function scaffold() {
  const [GIRDER, LADDER, OVERALL, TYRE] = ['#e0a822', '#2fbf9f', '#6aa6ff', '#f2ece2'];
  const G = [[0, 45, 64, 45], [3, 33, 27, 37], [36, 37, 60, 33], [9, 27, 30.5, 23], [30.5, 23, 54, 27], [31, 15, 60, 10]];
  const surf = (s, x) => s[1] + (s[3] - s[1]) * (x - s[0]) / (s[2] - s[0]);
  const LADDERS = [[24, 0, 1], [50, 0, 2], [14, 1, 3], [44, 2, 4], [36, 4, 5]].map(([x, lo, up]) => ({ x, top: surf(G[up], x), bot: surf(G[lo], x) }));
  const TOP = G[5], TROPHY = 52, STACK = 58, JUMP = 44, GRAV = 176;
  let p, tyres, shed, lives, round, pause, hurt, clock, roundT;
  // The first girder at column x whose surface lies between y heights a and b, or -1.
  const girderAt = (x, a, b, skip = -1) => {
    let best = -1, top = Infinity;
    G.forEach((s, i) => {
      if (i === skip || x < s[0] || x > s[2]) return;
      const v = surf(s, x);
      if (v >= a && v <= b && v < top) { top = v; best = i; }
    });
    return best;
  };
  const place = () => { p = { x: 5, y: 45, vx: 0, vy: 0, air: false, lad: null, walk: 0 }; tyres = []; shed = 0.8; hurt = false; roundT = 0; };
  const interval = () => Math.max(0.85, 2.1 - round * 0.2) * rnd(0.8, 1.3);
  const movePlayer = (dt, io) => {
    const mx = moveX(io), my = moveY(io);
    p.walk += Math.abs(mx || my) * dt;
    if (p.lad) {
      p.y += my * 14 * dt;
      if (p.y <= p.lad.top) { p.y = p.lad.top; p.lad = null; }
      else if (p.y >= p.lad.bot) { p.y = p.lad.bot; p.lad = null; }
    } else if (p.air) {
      p.vx += (mx * 18 - p.vx) * Math.min(6 * dt, 1);
      p.x = clamp(p.x + p.vx * dt, 1.5, 62.5);
      const y0 = p.y;
      p.vy = Math.min(p.vy + GRAV * dt, 110);
      p.y += p.vy * dt;
      if (p.vy > 0) {
        const i = girderAt(p.x, y0 - 0.01, p.y);
        if (i >= 0) { p.y = surf(G[i], p.x); p.air = false; p.vy = 0; }
      }
      if (p.y > H) { p.y = 45; p.air = false; p.vy = 0; }
    } else {
      const lad = my && LADDERS.find(l => Math.abs(p.x - l.x) < 2.5 && Math.abs(p.y - (my < 0 ? l.bot : l.top)) < 2.5);
      if (lad) { p.x = lad.x; p.y = my < 0 ? lad.bot : lad.top; p.lad = lad; return; }
      const nx = clamp(p.x + mx * 18 * dt, 1.5, 62.5);
      const i = girderAt(nx, p.y - 2, p.y + 2);
      p.x = nx;
      if (i >= 0) p.y = surf(G[i], nx);
      else { p.air = true; p.vy = 0; p.vx = mx * 10; }
      if (!p.air && io.pressed('Space')) { p.air = true; p.vy = -JUMP; p.vx = mx * 18; }
    }
  };
  const moveTyres = dt => {
    const speed = Math.min(12 + round * 2.5, 28);
    tyres = tyres.filter(t => {
      if (t.air) {
        const y0 = t.y;
        t.vy = Math.min(t.vy + 150 * dt, 100);
        t.y += t.vy * dt; t.x += t.vx * dt;
        const i = girderAt(t.x, y0, t.y, t.skip);
        if (i >= 0) {
          const s = G[i];
          t.air = false; t.seg = i; t.y = surf(s, t.x); t.skip = -1;
          if (s[1] !== s[3]) t.d = s[3] > s[1] ? 1 : -1;
        }
      } else {
        const s = G[t.seg];
        t.x += t.d * speed * dt;
        if (t.x < s[0] || t.x > s[2]) {
          t.air = true; t.vy = 0; t.skip = t.seg;
          t.vx = s === TOP ? rnd(-7, 7) : t.d * 5; // off the top beam it can go either side of the ridge
        } else t.y = surf(s, t.x);
      }
      return t.x > -4 && t.x < W + 4 && t.y < H + 4;
    });
  };
  const g = {
    score: 0,
    reset() { g.score = 0; lives = 3; round = 1; pause = 0; clock = 0; place(); },
    step(dt, io) {
      clock += dt;
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) { if (lives <= 0) return false; place(); }
        return true;
      }
      roundT += dt;
      movePlayer(dt, io);
      moveTyres(dt);
      shed -= dt;
      if (shed <= 0) {
        shed = interval();
        if (tyres.length < 12) tyres.push({ x: STACK - 3, y: surf(TOP, STACK - 3), d: -1, seg: 5, air: false, vx: 0, vy: 0, skip: -1, jumped: false });
      }
      for (const t of tyres) {
        const dx = Math.abs(p.x - t.x), gap = t.y - p.y;
        if (t.y < p.y - 1 && !p.lad && !t.air) continue; // on the girder overhead: no bumping heads through steel
        if (dx < 2.5 && p.y > t.y - 3 && p.y - 5 < t.y) { lives--; hurt = true; pause = 1.1; return true; }
        if (p.air && !t.jumped && dx < 2 && gap >= 3 && gap < 9) { t.jumped = true; g.score += 20; }
      }
      if (Math.abs(p.x - TROPHY) < 3 && Math.abs(p.y - surf(TOP, TROPHY)) < 6) {
        g.score += 100 * round + Math.max(0, Math.floor(40 - roundT)) * 5;
        round++;
        pause = 1;
      }
      return true;
    },
    paint(c) {
      R(c, 3, 8, 22, 1, LADDER); R(c, 3, 8, 1, 10, LADDER); R(c, 24, 8, 1, 10, LADDER); // the garage's shutter door
      for (let y = 11; y < 18; y += 3) R(c, 4, y, 20, 1, LADDER);
      txt(c, 'R' + Math.min(round, 99), 40, 0, TYRE);
      for (const l of LADDERS) {
        R(c, l.x - 1, l.top, 1, Math.ceil(l.bot - l.top), LADDER); R(c, l.x + 1, l.top, 1, Math.ceil(l.bot - l.top), LADDER);
        for (let y = l.top + 2; y < l.bot; y += 3) R(c, l.x, y, 1, 1, LADDER);
      }
      for (const s of G) for (let x = Math.ceil(s[0]); x < s[2]; x++) R(c, x, Math.round(surf(s, x)), 1, 2, GIRDER);
      const base = Math.round(surf(TOP, STACK));
      const wob = shed < 0.35 && Math.floor(clock * 16) % 2 === 0 ? 1 : 0;
      spr(c, STACK - 1, base - 3, '757', TYRE, 3); spr(c, STACK - 1 + wob, base - 6, '757', TYRE, 3); spr(c, STACK - 1 - wob, base - 9, '757', TYRE, 3);
      if (pause <= 0 || hurt || Math.floor(clock * 8) % 2 === 0) spr(c, TROPHY - 2, Math.round(surf(TOP, TROPHY)) - 4, 've4e', GIRDER, 5);
      for (const t of tyres) spr(c, t.x - 1.5, t.y - 3, '757', TYRE, 3);
      if (!hurt || Math.floor(clock * 8) % 2 === 0) {
        const step = Math.floor(p.walk * 8) % 2;
        const x = Math.round(p.x), y = Math.round(p.y);
        R(c, x, y - 5, 1, 1, TYRE);
        R(c, x - 1, y - 4, 3, 2, OVERALL);
        R(c, x - 1, y - 2, 1, step ? 1 : 2, OVERALL);
        R(c, x + 1, y - 2, 1, step ? 2 : 1, OVERALL);
      }
      txt(c, g.score, 1, 0, OVERALL);
      pips(c, lives, 34, 1, OVERALL);
    },
  };
  g.reset();
  return cabinet('SCAFFOLD', GIRDER, g);
}

export const CABINETS = [
  { id: 'wall-banger', title: 'WALL BANGER', make: wallBanger },
  { id: 'nut-run', title: 'NUT RUN', make: nutRun },
  { id: 'cone-attack', title: 'CONE ATTACK', make: coneAttack },
  { id: 'shrapnel', title: 'SHRAPNEL', make: shrapnel },
  { id: 'scaffold', title: 'SCAFFOLD', make: scaffold },
];
