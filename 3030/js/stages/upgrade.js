// Track 08, Upgrade (A Brymar College Course): REWIRE 101.
// A rotate-the-tiles circuit puzzle. Each board is a random spanning tree of copper traces
// grown from the rhythm core on the left, with implants hanging off the right edge; every tile
// is then spun to a random angle. Turn tiles until current reaches every implant.
import { W, H, P, RAMP, canvas, rect, px, line, ellipse, ring, poly, rampAt, mix, dith, box } from '../gfx.js';
import { text, wrap } from '../font.js';
import { bust, CAST, blob } from '../art.js';
import { topBar, Pops, Particles, bar } from '../hud.js';

const T = 24;
const N = 1, E = 2, S = 4, Wb = 8;
const DIRS = [[N, 0, -1, S], [E, 1, 0, Wb], [S, 0, 1, N], [Wb, -1, 0, E]];
const cw = m => ((m << 1) | (m >> 3)) & 15;
const BOARDS = [{ c: 5, r: 4, k: 2 }, { c: 6, r: 5, k: 2 }, { c: 7, r: 5, k: 3 }];
const TIME = 150, BOARD_BONUS = 300;

// ----------------------------------------------------------------- generation
function genBoard(rnd, cols, rows, k) {
  const idx = (x, y) => y * cols + x;
  const sr = Math.floor(rnd() * rows);
  const sol = new Array(cols * rows).fill(0);
  const seen = new Array(cols * rows).fill(false);
  const edges = [];
  const push = (x, y) => {
    for (const [bit, dx, dy, opp] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[idx(nx, ny)]) edges.push([x, y, nx, ny, bit, opp]);
    }
  };
  seen[idx(0, sr)] = true; push(0, sr);
  // Randomised Prim's: a spanning tree over every cell, rooted at the core.
  while (edges.length) {
    const i = Math.floor(rnd() * edges.length), [x, y, nx, ny, bit, opp] = edges[i];
    edges.splice(i, 1);
    if (seen[idx(nx, ny)]) continue;
    seen[idx(nx, ny)] = true;
    sol[idx(x, y)] |= bit; sol[idx(nx, ny)] |= opp;
    push(nx, ny);
  }
  sol[idx(0, sr)] |= Wb;
  const rowsAvail = [...Array(rows).keys()];
  for (let i = rowsAvail.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rowsAvail[i], rowsAvail[j]] = [rowsAvail[j], rowsAvail[i]]; }
  const targets = rowsAvail.slice(0, k).sort((a, b) => a - b);
  for (const r of targets) sol[idx(cols - 1, r)] |= E;
  const cur = sol.map(m => { let v = m; const n = Math.floor(rnd() * 4); for (let i = 0; i < n; i++) v = cw(v); return v; });
  const b = { cols, rows, sr, sol, cur, targets, idx };
  // Cells on the solution's paths from the core to each implant (the bot fixes only these).
  const par = new Array(cols * rows).fill(-1), q = [idx(0, sr)], vis = new Set(q);
  while (q.length) {
    const i = q.shift(), x = i % cols, y = (i / cols) | 0;
    for (const [bit, dx, dy, opp] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = idx(nx, ny);
      if (!vis.has(j) && (sol[i] & bit) && (sol[j] & opp)) { vis.add(j); par[j] = i; q.push(j); }
    }
  }
  const path = new Set();
  for (const r of targets) { let i = idx(cols - 1, r); while (i >= 0) { path.add(i); i = par[i]; } }
  b.path = [...path];
  // Never hand out a board that is already solved.
  let guard = 0;
  while (power(b).lit.every(Boolean) && guard++ < 20) {
    const cand = b.path.filter(i => cw(b.cur[i]) !== b.cur[i]);
    const i = cand[Math.floor(rnd() * cand.length)];
    b.cur[i] = cw(b.cur[i]);
  }
  return b;
}

function power(b) {
  const { cols, rows, cur, idx } = b;
  const on = new Uint8Array(cols * rows);
  const st = idx(0, b.sr);
  if (cur[st] & Wb) {
    on[st] = 1;
    const q = [st];
    while (q.length) {
      const i = q.pop(), x = i % cols, y = (i / cols) | 0;
      for (const [bit, dx, dy, opp] of DIRS) {
        if (!(cur[i] & bit)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = idx(nx, ny);
        if (!on[j] && (cur[j] & opp)) { on[j] = 1; q.push(j); }
      }
    }
  }
  const lit = b.targets.map(r => !!(on[idx(cols - 1, r)] && (cur[idx(cols - 1, r)] & E)));
  return { on, lit };
}

// ----------------------------------------------------------------- tile art
const tileCache = new Map();
function tileImg(mask, lit) {
  const key = mask * 2 + (lit ? 1 : 0);
  let c = tileCache.get(key);
  if (c) return c;
  const [cv, g] = canvas(T, T);
  // PCB substrate, a little dithered.
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = 0.45 + ((x * 7 + y * 13) % 5) * 0.03 - (x === 0 || y === 0 ? 0.15 : 0) + (x === T - 1 || y === T - 1 ? -0.25 : 0);
    g.fillStyle = rampAt(['#06140c', '#0c2616', '#12361f', '#1a4a2a', '#25603a'], v, x, y);
    g.fillRect(x, y, 1, 1);
  }
  const c0 = T / 2;
  const core = lit ? [P.forest, P.green, P.lime, P.cream] : [P.gold0, P.gold1, P.gold2, P.gold3];
  const n = [N, E, S, Wb].filter(b => mask & b).length;
  for (const [bit, dx, dy] of DIRS) {
    if (!(mask & bit)) continue;
    const x0 = c0 - 2, y0 = c0 - 2;
    const len = 12;
    const rx = dx < 0 ? 0 : dx > 0 ? c0 - 2 : x0, ry = dy < 0 ? 0 : dy > 0 ? c0 - 2 : y0;
    const rw = dx ? len + 2 : 4, rh = dy ? len + 2 : 4;
    rect(g, rx, ry, rw, rh, core[0]);
    rect(g, rx + (dx ? 0 : 1), ry + (dy ? 0 : 1), dx ? rw : 2, dy ? rh : 2, core[2]);
    if (dx) rect(g, rx, ry + 1, rw, 1, core[3]); else rect(g, rx + 1, ry, 1, rh, core[3]);
  }
  // Via or component in the middle.
  if (n === 1) {
    rect(g, c0 - 5, c0 - 4, 10, 8, P.ink); rect(g, c0 - 5, c0 - 4, 10, 1, P.s1);
    for (let i = 0; i < 4; i++) { px(g, c0 - 4 + i * 3, c0 - 5, P.s3); px(g, c0 - 4 + i * 3, c0 + 4, P.s3); }
    px(g, c0 - 3, c0 - 2, lit ? P.lime : P.red);
  } else {
    ellipse(g, c0, c0, 4, 4, core[0]); ellipse(g, c0, c0, 3, 3, core[2]); ellipse(g, c0, c0, 1.5, 1.5, P.ink);
    px(g, c0 - 2, c0 - 2, core[3]);
  }
  // Solder dots in the corners.
  for (const [x, y] of [[2, 2], [T - 3, 2], [2, T - 3], [T - 3, T - 3]]) px(g, x, y, '#2f6f45');
  tileCache.set(key, cv);
  return cv;
}

// The professor, cropped to the head and shoulders.
function profCrop(talk) {
  return bust(CAST.professor, talk);
}

// Edge-safe buttons: one hit per press even when a press lands in two frames in a row
// (test-bot presses set during update do), plus menu-style auto-repeat.
function pad(I) {
  const last = {}, now = {}, held = {};
  return {
    frame(dt) {
      for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) {
        const h = I.hit(b);
        now[b] = h && !last[b]; last[b] = h;
        held[b] = I.down(b) ? (now[b] ? -0.3 : (held[b] ?? 0) + dt) : 0;
      }
    },
    hit: b => now[b],
    rep(b) { if (now[b]) return true; if (held[b] >= 0.09) { held[b] = 0; return true; } return false; },
  };
}

// ----------------------------------------------------------------- stage
export default {
  id: 'upgrade', track: 8, song: 'upgrade', name: 'Upgrade (A Brymar College Course)', title: 'REWIRE 101',
  blurb: 'Your implants are wired for obedience. Turn the circuit tiles to route rhythm from the core to every implant. Three boards, one bell.',
  how: ['◀▲▼▶ CURSOR', 'Ⓐ TURN RIGHT', 'Ⓑ TURN LEFT', 'LIGHT ALL IMPLANTS'],
  par: [900, 1250, 1600, 1950],
  make(ctx) {
    const I = pad(ctx.I);
    const pops = Pops(), parts = Particles();
    let bi = 0, board = genBoard(ctx.rng, BOARDS[0].c, BOARDS[0].r, BOARDS[0].k);
    let pw = power(board), litCount = pw.lit.filter(Boolean).length;
    let cx = 0, cy = board.sr, time = TIME, t = 0, cleared = 0, rotations = 0, idle = 0;
    let state = 'play', stT = 0, lastTick = 99;
    const anim = new Map();
    let msg = '', msgT = 0, talkT = 0;
    const say = s => { msg = s; msgT = 0; talkT = s.length / 40 + 0.2; };
    say('Route the current from the core to every implant. The bell is merciless.');
    let botRel = false;

    const geom = () => {
      const bw = board.cols * T, bh = board.rows * T;
      return { ox: Math.round((W - bw) / 2), oy: Math.round(20 + (5 * T - bh) / 2), bw, bh };
    };
    const rotate = dir => {
      const i = board.idx(cx, cy), m = board.cur[i];
      const nm = dir > 0 ? cw(m) : cw(cw(cw(m)));
      if (nm === m) { ctx.sfx('miss'); return; }
      board.cur[i] = nm; rotations++;
      anim.set(i, -dir * Math.PI / 2);
      ctx.sfx('flip');
      const np = power(board), nl = np.lit.filter(Boolean).length;
      if (nl > litCount) {
        ctx.sfx('power');
        const { ox, oy, bw } = geom();
        np.lit.forEach((l, k) => { if (l && !pw.lit[k]) { parts.burst(ox + bw + 12, oy + board.targets[k] * T + 12, 14, [P.lime, P.cyan, P.white], 70); pops.add('ONLINE', ox + bw + 12, oy + board.targets[k] * T, P.lime); } });
        if (nl < board.targets.length) say(['One implant online.', 'Current detected. Continue.', 'Good. Another.'][Math.min(2, nl - 1)]);
      }
      pw = np; litCount = nl;
      if (pw.lit.every(Boolean)) {
        cleared++; state = 'clear'; stT = 0;
        ctx.flash(0.5); ctx.sfx('coin');
        const { ox, oy, bw, bh } = geom();
        pops.add('+' + BOARD_BONUS, ox + bw / 2, oy + bh / 2, P.amber, 1.2);
        parts.burst(ox + bw / 2, oy + bh / 2, 30, [P.lime, P.amber, P.white, P.cyan], 110, 0.9);
        say(['Correct. Board two.', 'Adequate. Final exam.', 'Splendid! Class dismissed.'][cleared - 1]);
      }
    };

    const inst = {
      result: null,
      get dbg() { return { cx, cy, bi, state, time, board }; },
      update(dt) {
        t += dt;
        I.frame(dt);
        pops.update(dt); parts.update(dt);
        msgT += dt; talkT -= dt;
        for (const [i, a] of anim) { const na = a * Math.pow(1e-7, dt); if (Math.abs(na) < 0.02) anim.delete(i); else anim.set(i, na); }
        if (inst.result) return;
        if (state === 'clear') {
          stT += dt;
          if (stT > 1.3) {
            if (cleared >= BOARDS.length) {
              const left = Math.ceil(time);
              inst.result = { win: true, score: cleared * BOARD_BONUS + left * 10, lines: [`BOARDS ${cleared}/${BOARDS.length}`, `TIME LEFT ${left} S`, `TURNS ${rotations}`, `BONUS ${cleared * BOARD_BONUS}`] };
              return;
            }
            bi++;
            board = genBoard(ctx.rng, BOARDS[bi].c, BOARDS[bi].r, BOARDS[bi].k);
            pw = power(board); litCount = pw.lit.filter(Boolean).length;
            cx = 0; cy = board.sr; state = 'play'; anim.clear();
          }
          return;
        }
        time -= dt; idle += dt;
        if (time <= 20 && Math.ceil(time) !== lastTick) { lastTick = Math.ceil(time); ctx.sfx('tick'); }
        if (time <= 30 && time + dt > 30) say('Tick tock, Mr. Zero. The bell approaches.');
        if (idle > 9) { idle = 0; say('The bell does not wait for daydreamers.'); }
        if (time <= 0) {
          time = 0; ctx.sfx('alarm'); ctx.shake(4);
          say('BRRRING! Pencils down.');
          inst.result = { win: false, score: cleared * BOARD_BONUS, lines: [`BOARDS ${cleared}/${BOARDS.length}`, `IMPLANTS LIT ${litCount}/${board.targets.length}`, `TURNS ${rotations}`] };
          return;
        }
        let moved = false;
        if (I.rep('left')) { cx = Math.max(0, cx - 1); moved = true; }
        if (I.rep('right')) { cx = Math.min(board.cols - 1, cx + 1); moved = true; }
        if (I.rep('up')) { cy = Math.max(0, cy - 1); moved = true; }
        if (I.rep('down')) { cy = Math.min(board.rows - 1, cy + 1); moved = true; }
        if (moved) { ctx.sfx('move'); idle = 0; }
        if (I.hit('a')) { rotate(1); idle = 0; }
        else if (I.hit('b')) { rotate(-1); idle = 0; }
      },
      // Bot: walk to the nearest wrong tile on a solution path and turn it the short way.
      auto() {
        if (state !== 'play' || inst.result) return [];
        if (botRel) { botRel = false; return []; }
        let best = null, bd = 1e9;
        for (const i of board.path) {
          if (board.cur[i] === board.sol[i]) continue;
          const x = i % board.cols, y = (i / board.cols) | 0, d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d < bd) { bd = d; best = [x, y, i]; }
        }
        if (!best) return [];
        botRel = true;
        const [x, y, i] = best;
        if (x < cx) return ['left']; if (x > cx) return ['right'];
        if (y < cy) return ['up']; if (y > cy) return ['down'];
        let m = board.cur[i], n = 0;
        while (m !== board.sol[i] && n < 4) { m = cw(m); n++; }
        return [n === 3 ? 'b' : 'a'];
      },
      draw(g) {
        // Lecture hall: panelled wood.
        for (let x = 0; x < W; x++) { const v = 0.35 + ((x % 16) < 1 ? -0.2 : 0) + Math.sin(x * 0.7) * 0.04; g.fillStyle = rampAt([P.brown0, P.brown1, P.brown2, P.brown3], v, x, 0); g.fillRect(x, 13, 1, H - 13); }
        for (let y = 13; y < H; y += 3) for (let x = (y * 5) % 16; x < W; x += 16) px(g, x, y, P.brown0);
        const { ox, oy, bw, bh } = geom();
        // Board frame.
        box(g, ox - 30, oy - 6, bw + 60, bh + 12, '#0a1e12', P.s1, P.s3);
        rect(g, ox - 3, oy - 3, bw + 6, bh + 6, P.ink);
        // Tiles.
        for (let y = 0; y < board.rows; y++) for (let x = 0; x < board.cols; x++) {
          const i = board.idx(x, y), img = tileImg(board.cur[i], pw.on[i]);
          const a = anim.get(i);
          if (a) { g.save(); g.translate(ox + x * T + T / 2, oy + y * T + T / 2); g.rotate(a); g.drawImage(img, -T / 2, -T / 2); g.restore(); }
          else g.drawImage(img, ox + x * T, oy + y * T);
        }
        // Current pulses running along lit traces.
        for (let y = 0; y < board.rows; y++) for (let x = 0; x < board.cols; x++) {
          const i = board.idx(x, y);
          if (!pw.on[i] || anim.get(i)) continue;
          const m = board.cur[i], ph = (t * 1.6 + (x + y) * 0.35) % 1;
          for (const [bit, dx, dy] of DIRS) if (m & bit) px(g, ox + x * T + 12 + dx * ph * 11, oy + y * T + 12 + dy * ph * 11, P.white);
        }
        // Rhythm core on the left.
        const b = ctx.beat(), pulse = 1 - (b - Math.floor(b));
        const sy = oy + board.sr * T + 12, sx = ox - 16;
        rect(g, sx + 6, sy - 2, 10, 4, P.gold1); rect(g, sx + 6, sy - 1, 10, 2, pw.on[board.idx(0, board.sr)] ? P.lime : P.gold2);
        blob(g, [{ x: sx, y: sy, rx: 9, ry: 9, h: 8 }], RAMP.steel, { rim: P.magenta });
        ellipse(g, sx, sy, 5 + pulse * 1.5, 5 + pulse * 1.5, P.magenta); ellipse(g, sx, sy, 2, 2, P.pink);
        if (pulse > 0.75) ring(g, sx, sy, 10 + (1 - pulse) * 20, P.magenta);
        text(g, 'CORE', sx, sy + 11, P.pink, { align: 'center' });
        // Implants on the right.
        board.targets.forEach((r, k) => {
          const ty = oy + r * T + 12, tx = ox + bw + 14, on = pw.lit[k];
          rect(g, ox + bw, ty - 2, 6, 4, P.gold1); rect(g, ox + bw, ty - 1, 6, 2, on ? P.lime : P.gold2);
          blob(g, [{ x: tx, y: ty, rx: 8, ry: 7, h: 6 }], on ? RAMP.sea : RAMP.steel, { rim: on ? P.white : P.s3 });
          ellipse(g, tx, ty, 4, 4, P.ink); ellipse(g, tx, ty, 3, 3, on ? P.cyan : P.blood); px(g, tx - 1, ty - 1, on ? P.white : P.red);
          if (on && (t * 4 | 0) % 2) ring(g, tx, ty, 10, P.cyan);
        });
        // Cursor.
        if (state === 'play' && !inst.result) {
          const x0 = ox + cx * T - 1, y0 = oy + cy * T - 1, s = T + 1, c = (t * 4 | 0) % 2 ? P.amber : P.cream;
          for (const [qx, qy, hx, hy] of [[x0, y0, 1, 1], [x0 + s, y0, -1, 1], [x0, y0 + s, 1, -1], [x0 + s, y0 + s, -1, -1]]) {
            rect(g, hx > 0 ? qx : qx - 5, qy, 6, 1, c); rect(g, qx, hy > 0 ? qy : qy - 5, 1, 6, c);
          }
        }
        parts.draw(g); pops.draw(g);
        // Bottom panel: the professor and the bell.
        rect(g, 0, 146, W, H - 146, P.ink); rect(g, 0, 146, W, 1, P.brown3);
        box(g, 5, 150, 60, 70, P.deep, P.s1, P.s2);
        const talking = talkT > 0 && (t * 8 | 0) % 2 === 0;
        g.drawImage(profCrop(talking), 18, 4, 58, 68, 6, 151, 58, 68);
        box(g, 72, 152, 178, 36, '#1f3b2c', P.brown2, P.tan);
        const shown = msg.slice(0, Math.floor(msgT * 40));
        wrap(shown, 168).slice(0, 3).forEach((l, i) => text(g, l, 77, 156 + i * 10, '#e8f4ea'));
        text(g, 'PROF. BRYMAR', 72, 192, P.lime);
        const low = time < 20;
        bar(g, 100, 206, 148, time / TIME, low ? ((t * 4 | 0) % 2 ? P.red : P.amber) : P.lime, 'BELL');
        for (let k = 0; k < BOARDS.length; k++) { const c = k < cleared ? P.lime : k === bi ? P.amber : P.s1; rect(g, 196 + k * 18, 192, 14, 7, P.ink); rect(g, 197 + k * 18, 193, 12, 5, c); }
        topBar(g, 'REWIRE 101', Math.ceil(time) + ' S', `BOARD ${Math.min(bi + 1, 3)}/3`);
      },
    };
    return inst;
  },
};
