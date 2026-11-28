// VIRUS / PACKET SLITHER: snake on the Bank's network. The virus is a glitchy magenta packet
// trail on a circuit board; it grows by infecting server racks. Firewalls go up as the Bank
// notices, antivirus scanners patrol rows and columns: they kill on a head-on hit and cut the
// tail off if they cross your body.
import { W, P, RAMP, rect, px, line, ellipse, ring, poly, rng as mkrng, bake, mix, dith } from '../gfx.js';
import { text } from '../font.js';
import { blob } from '../art.js';
import { topBar, hearts, Pops, Particles, banner } from '../hud.js';

const COLS = 16, ROWS = 13, CS = 16, OY = 14;
const GOAL = 24, LIVES = 3;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const WALL_AT = { 3: 1, 7: 1, 11: 2, 15: 1, 19: 2 };   // infected count -> firewall segments to raise
const SCAN_AT = { 5: 1, 12: 1, 18: 1 };                // infected count -> scanners to add
const key = (x, y) => x + y * COLS;
const SPAWN_ROW = 6;

// The PCB: traces, vias and pads, baked once.
function board() {
  return bake('virus:pcb', W, ROWS * CS, g => {
    rect(g, 0, 0, W, ROWS * CS, '#0b211c');
    const r = mkrng(707);
    for (let y = 0; y < ROWS * CS; y++) for (let x = 0; x < W; x++) if (dith(x, y, 0.12) && ((x >> 4) + (y >> 4)) % 2) px(g, x, y, '#0e2722');
    // Traces run along the cell gutters and centres, with 45-degree doglegs.
    for (let i = 0; i < 46; i++) {
      let x = (r() * COLS | 0) * CS + 8, y = (r() * ROWS | 0) * CS + 8;
      const c = r() < 0.5 ? '#1a4537' : '#163c31';
      for (let s = 0; s < 6; s++) {
        const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][r() * 4 | 0], n = 8 + (r() * 30 | 0);
        for (let k = 0; k < n; k++) { if (x < 1 || y < 1 || x > W - 2 || y > ROWS * CS - 2) break; px(g, x, y, c); px(g, x + d[1], y + d[0], c); x += d[0]; y += d[1]; }
        if (r() < 0.3) { ring(g, x + 0.5, y + 0.5, 2.5, '#2b6b55'); px(g, x, y, '#0b211c'); }
      }
    }
    for (let i = 0; i < 30; i++) { const x = r() * W | 0, y = r() * ROWS * CS | 0; rect(g, x, y, 3, 2, '#7d6a2a'); px(g, x, y, '#c4a344'); }
    for (let i = 0; i < 8; i++) { const x = r() * (W - 30) | 0, y = r() * (ROWS * CS - 14) | 0; rect(g, x, y, 22, 10, '#101318'); for (let k = 0; k < 6; k++) { rect(g, x + 2 + k * 3, y - 2, 1, 2, '#9c8a52'); rect(g, x + 2 + k * 3, y + 10, 1, 2, '#9c8a52'); } }
  });
}

export default {
  id: 'virus', track: 7, song: 'virus', name: 'Virus', title: 'PACKET SLITHER',
  blurb: "Slide a virus through the Bank's network. Infect server racks to grow. Firewalls burn, scanners kill head-on and cut your tail.",
  how: ['◀▲▼▶ STEER', 'INFECT 24 SERVERS', 'AVOID FIREWALLS', '3 LIVES'],
  par: [0, 8000, 9200, 10200],
  make(ctx) {
    const R = ctx.rng;
    let snake, dir, queue, grow, moveT, frame = 0, t = 0;
    let infected = 0, score = 0, lives = LIVES, deaths = 0, cuts = 0;
    let phase = 'play', phaseT = 0, glitch = 0;
    const walls = new Set();
    const wallList = [];
    const scanners = [];
    const stains = [];
    let server = null, serverAge = 0;
    const pops = Pops(), parts = Particles();
    const lastHit = {};
    const hitOnce = b => { if (!ctx.I.hit(b)) return false; const dup = lastHit[b] === frame - 1; lastHit[b] = frame; return !dup; };

    const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    const onSnake = (x, y, from = 0) => { for (let i = from; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return i; return -1; };
    const scannerAt = (x, y) => scanners.findIndex(s => s.x === x && s.y === y);
    const rate = () => 6 + 3 * Math.min(1, infected / GOAL);

    function resetSnake() {
      snake = [{ x: 3, y: SPAWN_ROW }, { x: 2, y: SPAWN_ROW }, { x: 1, y: SPAWN_ROW }];
      dir = 'right'; queue = []; grow = 0; moveT = 0;
      // Clear scanners away from the spawn lane.
      for (const s of scanners) if (Math.abs(s.y - SPAWN_ROW) <= 1 && s.x < 9) placeScanner(s);
    }
    function freeCell(x, y) { return inside(x, y) && !walls.has(key(x, y)) && onSnake(x, y) < 0 && scannerAt(x, y) < 0 && !(server && server.x === x && server.y === y); }
    function connected() {
      // Every free cell must still be reachable: no sealed pockets.
      const seen = new Set(); let start = null, total = 0;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!walls.has(key(x, y))) { total++; if (!start) start = [x, y]; }
      const q = [start]; seen.add(key(...start));
      while (q.length) { const [x, y] = q.pop(); for (const d of Object.values(DIRS)) { const nx = x + d[0], ny = y + d[1]; if (inside(nx, ny) && !walls.has(key(nx, ny)) && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); q.push([nx, ny]); } } }
      return seen.size === total;
    }
    function freeNeighbours(x, y) { let n = 0; for (const d of Object.values(DIRS)) if (inside(x + d[0], y + d[1]) && !walls.has(key(x + d[0], y + d[1]))) n++; return n; }
    function placeServer() {
      const h = snake[0];
      let best = null;
      for (let tries = 0; tries < 400; tries++) {
        const x = R() * COLS | 0, y = R() * ROWS | 0;
        if (!freeCell(x, y) || freeNeighbours(x, y) < 2) continue;
        const d = Math.abs(x - h.x) + Math.abs(y - h.y);
        if (d >= 8) { best = { x, y }; break; }
        if (!best || d > best.d) best = { x, y, d };
      }
      server = best ? { x: best.x, y: best.y } : { x: 12, y: 3 };
      serverAge = 0;
    }
    function addWall() {
      const h = snake[0];
      for (let tries = 0; tries < 200; tries++) {
        const horiz = R() < 0.5, len = 3 + (R() * 2 | 0);
        const x0 = 1 + (R() * (COLS - 2 - (horiz ? len : 0)) | 0), y0 = 1 + (R() * (ROWS - 2 - (horiz ? 0 : len)) | 0);
        const cells = [];
        let ok = true;
        for (let i = 0; i < len; i++) {
          const x = x0 + (horiz ? i : 0), y = y0 + (horiz ? 0 : i);
          if (!freeCell(x, y) || (Math.abs(x - h.x) <= 3 && Math.abs(y - h.y) <= 3) || (y === SPAWN_ROW && x < 8)) { ok = false; break; }
          cells.push([x, y]);
        }
        if (!ok) continue;
        for (const [x, y] of cells) walls.add(key(x, y));
        if (!connected() || (server && freeNeighbours(server.x, server.y) < 2)) { for (const [x, y] of cells) walls.delete(key(x, y)); continue; }
        for (const [x, y] of cells) { wallList.push({ x, y, t: 0 }); parts.burst(x * CS + 8, OY + y * CS + 8, 5, [P.orange, P.amber, P.red], 40, 0.5, 20); }
        ctx.sfx('alarm', 0.5);
        return true;
      }
      return false;
    }
    function placeScanner(s) {
      const h = snake ? snake[0] : { x: 3, y: SPAWN_ROW };
      for (let tries = 0; tries < 300; tries++) {
        const x = R() * COLS | 0, y = R() * ROWS | 0;
        if (!freeCell(x, y) || Math.abs(x - h.x) + Math.abs(y - h.y) < 7 || Math.abs(y - SPAWN_ROW) <= 1 && x < 9) continue;
        const horiz = R() < 0.5;
        s.x = x; s.y = y; s.dx = horiz ? (R() < 0.5 ? 1 : -1) : 0; s.dy = horiz ? 0 : (R() < 0.5 ? 1 : -1); s.t = 0;
        return s;
      }
      s.x = 14; s.y = 1; s.dx = -1; s.dy = 0; s.t = 0;
      return s;
    }
    function scannerNext(s) {
      let nx = s.x + s.dx, ny = s.y + s.dy;
      if (!inside(nx, ny) || walls.has(key(nx, ny))) { s.dx = -s.dx; s.dy = -s.dy; nx = s.x + s.dx; ny = s.y + s.dy; }
      if (!inside(nx, ny) || walls.has(key(nx, ny))) return [s.x, s.y];
      return [nx, ny];
    }

    function die(why) {
      lives--; deaths++;
      ctx.sfx('hurt'); ctx.sfx('glitch'); ctx.shake(5); ctx.flash(0.5);
      for (const s of snake) parts.burst(s.x * CS + 8, OY + s.y * CS + 8, 3, [P.magenta, P.pink, P.violet, P.white], 70, 0.7, 60);
      pops.add(why, snake[0].x * CS + 8, OY + snake[0].y * CS - 4, P.red, 1.2);
      phase = lives > 0 ? 'dead' : 'over'; phaseT = 0;
    }
    function infect() {
      infected++;
      const gain = 100 + infected * 10;
      score += gain;
      grow += infected <= 12 ? 2 : 1;
      ctx.sfx('coin'); ctx.sfx('zap', 0.6);
      const cx = server.x * CS + 8, cy = OY + server.y * CS + 8;
      parts.burst(cx, cy, 14, [P.magenta, P.pink, P.white, P.violet], 70, 0.6, 30);
      pops.add('+' + gain, cx, cy - 6, P.pink);
      stains.push({ x: server.x, y: server.y, t: 0 });
      server = null;
      if (infected >= GOAL) { phase = 'win'; phaseT = 0; ctx.sfx('power'); glitch = 1; return; }
      for (let i = 0; i < (WALL_AT[infected] || 0); i++) addWall();
      for (let i = 0; i < (SCAN_AT[infected] || 0); i++) { scanners.push(placeScanner({})); ctx.sfx('alarm', 0.7); pops.add('SCANNER ONLINE', W / 2, OY + 20, P.cyan, 1.4); }
      placeServer();
    }

    function step() {
      // Take the next queued turn, or a held arrow.
      let nd = null;
      while (queue.length && !nd) { const q = queue.shift(); if (q !== dir && q !== OPP[dir]) nd = q; }
      if (!nd) for (const b of ['up', 'down', 'left', 'right']) if (ctx.I.down(b) && b !== OPP[dir] && b !== dir) { nd = b; break; }
      if (nd) dir = nd;
      const [dx, dy] = DIRS[dir];
      const h = snake[0], nx = h.x + dx, ny = h.y + dy;
      if (!inside(nx, ny)) return die('FIREWALLED');
      if (walls.has(key(nx, ny))) return die('FIREWALLED');
      const tailFree = grow === 0;
      const hit = onSnake(nx, ny);
      if (hit >= 0 && !(tailFree && hit === snake.length - 1)) return die('SELF-INFECTED');
      if (scannerAt(nx, ny) >= 0) return die('QUARANTINED');
      snake.unshift({ x: nx, y: ny });
      if (grow > 0) grow--; else snake.pop();
      score += 1;
      if (server && server.x === nx && server.y === ny) infect();
      // Trail sparkle.
      if (R() < 0.5) parts.burst(nx * CS + 8, OY + ny * CS + 8, 1, [P.magenta, P.pink], 20, 0.4, 0);
    }
    function moveScanners(dt) {
      for (const s of scanners) {
        s.t += dt;
        if (s.t < 1 / 3.2) continue;
        s.t = 0;
        const [nx, ny] = scannerNext(s);
        if (snake[0].x === nx && snake[0].y === ny) { s.x = nx; s.y = ny; return die('QUARANTINED'); }
        s.x = nx; s.y = ny;
        const i = onSnake(nx, ny, 1);
        if (i > 0) {
          const lost = snake.length - i;
          snake.length = Math.max(2, i);
          cuts++;
          ctx.sfx('glitch'); ctx.shake(2);
          pops.add('-' + lost + ' TAIL', nx * CS + 8, OY + ny * CS - 2, P.cyan);
          parts.burst(nx * CS + 8, OY + ny * CS + 8, 8, [P.cyan, P.ice, P.magenta], 50, 0.5, 30);
        }
      }
    }

    resetSnake();
    placeServer();

    const inst = {
      result: null,
      update(dt) {
        frame++; t += dt; phaseT += dt;
        pops.update(dt); parts.update(dt);
        if (glitch > 0 && phase !== 'win') glitch = Math.max(0, glitch - dt * 2);
        serverAge += dt;
        for (const w of wallList) w.t += dt;
        for (const s of stains) s.t += dt;
        if (phase === 'dead') { if (phaseT > 1.2) { resetSnake(); phase = 'play'; phaseT = 0; } return; }
        if (phase === 'over') { if (phaseT > 1.2 && !inst.result) inst.result = { win: false, score, lines: [`SERVERS ${infected}/${GOAL}`, `LIVES LOST ${deaths}`, `TAIL CUTS ${cuts}`] }; return; }
        if (phase === 'win') {
          glitch = Math.min(1, phaseT);
          if (phaseT > 2.2 && !inst.result) {
            const lifeB = lives * 1000, timeB = Math.max(0, Math.round((120 - t) * 25));
            score += lifeB + timeB;
            inst.result = { win: true, score, lines: [`SERVERS ${infected}/${GOAL}`, `LENGTH ${snake.length}`, `LIVES LEFT ${lives}  +${lifeB}`, `TIME ${t.toFixed(1)}S  +${timeB}`, `TAIL CUTS ${cuts}`] };
          }
          return;
        }
        for (const b of ['up', 'down', 'left', 'right']) if (hitOnce(b)) {
          const last = queue.length ? queue[queue.length - 1] : dir;
          if (b !== last && b !== OPP[last] && queue.length < 2) queue.push(b);
        }
        moveT += dt;
        const iv = 1 / rate();
        if (moveT >= iv) { moveT -= iv; step(); if (phase !== 'play') return; }
        moveScanners(dt);
      },

      // Bot: breadth-first path to the server around walls, body and scanners (and where
      // scanners step next); otherwise the move with the most room. Presses only on the frame
      // the virus is about to move, so its turns are never stale.
      auto() {
        if (phase !== 'play') return [];
        if (moveT + 1 / 60 < 1 / rate()) return [];
        const blocked = new Set(walls);
        for (let i = 0; i < snake.length - (grow ? 0 : 1); i++) blocked.add(key(snake[i].x, snake[i].y));
        for (const s of scanners) { blocked.add(key(s.x, s.y)); const c = { ...s }; const [nx, ny] = scannerNext(c); blocked.add(key(nx, ny)); }
        const h = snake[0];
        const order = [dir, ...['up', 'down', 'left', 'right'].filter(d => d !== dir && d !== OPP[dir])];
        const room = (x, y) => { const seen = new Set([key(x, y)]), q = [[x, y]]; while (q.length && seen.size < 60) { const [a, b] = q.pop(); for (const d of Object.values(DIRS)) { const nx = a + d[0], ny = b + d[1], k = key(nx, ny); if (inside(nx, ny) && !blocked.has(k) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } } return seen.size; };
        let choice = null;
        if (server) {
          const prev = new Map(), q = [];
          for (const d of order) { const nx = h.x + DIRS[d][0], ny = h.y + DIRS[d][1]; if (inside(nx, ny) && !blocked.has(key(nx, ny)) && !prev.has(key(nx, ny))) { prev.set(key(nx, ny), d); q.push([nx, ny]); } }
          while (q.length) {
            const [x, y] = q.shift();
            if (x === server.x && y === server.y) { choice = prev.get(key(x, y)); break; }
            for (const d of Object.values(DIRS)) { const nx = x + d[0], ny = y + d[1], k = key(nx, ny); if (inside(nx, ny) && !blocked.has(k) && !prev.has(k)) { prev.set(k, prev.get(key(x, y))); q.push([nx, ny]); } }
          }
          if (choice) { const nx = h.x + DIRS[choice][0], ny = h.y + DIRS[choice][1]; if (room(nx, ny) < snake.length / 2 + 3) choice = null; }
        }
        if (!choice) {
          let best = -1;
          for (const d of order) { const nx = h.x + DIRS[d][0], ny = h.y + DIRS[d][1]; if (!inside(nx, ny) || blocked.has(key(nx, ny))) continue; const r = room(nx, ny); if (r > best) { best = r; choice = d; } }
        }
        return choice && choice !== dir ? [choice] : [];
      },

      draw(g) {
        rect(g, 0, 0, W, 224, P.ink);
        g.drawImage(board(), 0, OY);
        // Infection stains spread under everything.
        for (const s of stains) {
          const r = Math.min(10, 3 + s.t * 12), cx = s.x * CS + 8, cy = OY + s.y * CS + 8;
          for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && dith(cx + x, cy + y, 0.35)) px(g, cx + x, cy + y, '#3a1640');
        }
        // Firewalls: burning brick blocks.
        for (const w of wallList) {
          const x = w.x * CS, y = OY + w.y * CS, k = Math.min(1, w.t * 3);
          const h = Math.round(16 * k);
          rect(g, x, y + 16 - h, 16, h, '#5a160e');
          for (let r = 0; r < h; r += 4) { const yy = y + 16 - h + r; rect(g, x, yy, 16, 1, '#2a0808'); for (let c = (r / 4 % 2) * 4; c < 16; c += 8) rect(g, x + c, yy, 1, 4, '#2a0808'); }
          rect(g, x + 1, y + 16 - h + 1, 14, 1, P.red);
          for (let i = 0; i < 4; i++) { const fx = x + 2 + i * 4, fh = 2 + ((t * 12 + i * 3 + w.x * 7) % 4 | 0); rect(g, fx, y + 16 - h - fh, 2, fh, i % 2 ? P.orange : P.amber); }
        }
        // Server rack.
        if (server) {
          const x = server.x * CS, y = OY + server.y * CS, pulse = (Math.sin(t * 6) + 1) / 2;
          ring(g, x + 8, y + 8, 9 + pulse * 3, mix(P.lime, P.ink, 0.5 + pulse * 0.3));
          rect(g, x + 2, y + 1, 12, 14, P.s1); rect(g, x + 2, y + 1, 12, 1, P.s3); rect(g, x + 13, y + 1, 1, 14, P.s0);
          for (let r = 0; r < 3; r++) { rect(g, x + 3, y + 3 + r * 4, 10, 3, P.s0); for (let i = 0; i < 3; i++) px(g, x + 5 + i * 3, y + 4 + r * 4, ((t * 8 + r + i * 2) | 0) % 3 ? P.lime : P.green); }
          if (serverAge < 0.4) ring(g, x + 8, y + 8, 4 + serverAge * 40, P.lime);
        }
        // Scanners: chrome domes with a sweeping beam ahead of them.
        for (const s of scanners) {
          const cx = s.x * CS + 8, cy = OY + s.y * CS + 8;
          g.globalAlpha = 0.22;
          for (let i = 1; i <= 2; i++) { const bx = (s.x + s.dx * i) * CS, by = OY + (s.y + s.dy * i) * CS; if (bx >= 0 && by >= OY && bx < W && by < OY + ROWS * CS) rect(g, bx + 1, by + 1, 14, 14, P.cyan); }
          g.globalAlpha = 1;
          blob(g, [{ x: cx, y: cy + 1, rx: 7, ry: 6, h: 6 }], RAMP.steel, { rim: P.cyan });
          const ex = cx + s.dx * 2, ey = cy + s.dy * 2;
          rect(g, ex - 2, ey - 1, 5, 2, P.ink); px(g, ex + ((t * 10 | 0) % 3) - 1, ey - 1, P.cyan);
          px(g, cx, cy - 6, (t * 4 | 0) % 2 ? P.red : P.s1);
        }
        // The virus.
        if (phase !== 'over' && !(phase === 'dead')) {
          const cols = [P.magenta, P.pink, P.violet, P.purple];
          for (let i = snake.length - 1; i >= 0; i--) {
            const s = snake[i], x = s.x * CS, y = OY + s.y * CS;
            const gl = ((t * 30 + i * 7) | 0) % 11 === 0 ? (((i * 13 + (t * 20 | 0)) % 3) - 1) * 2 : 0;
            const c = cols[(i + (t * 6 | 0)) % cols.length];
            const inset = i === 0 ? 1 : 2 + Math.min(2, i / Math.max(1, snake.length) * 3 | 0);
            rect(g, x + inset + gl, y + inset, 16 - inset * 2, 16 - inset * 2, c);
            // Bridge to the next segment.
            const n = snake[i + 1];
            if (n) { const bx = (s.x + n.x) / 2 * CS, by = OY + (s.y + n.y) / 2 * CS; rect(g, bx + 5, by + 5, 6, 6, c); }
            if (i > 0) { for (let k = 0; k < 4; k++) if (dith(x + k * 3, y + i, 0.5)) px(g, x + 4 + k * 2, y + 6 + (k % 2) * 3, P.ink); }
          }
          // Head: bright packet with a face.
          const h = snake[0], hx = h.x * CS, hy = OY + h.y * CS, [dx, dy] = DIRS[dir];
          rect(g, hx + 1, hy + 1, 14, 14, P.pink); rect(g, hx + 1, hy + 1, 14, 2, P.white);
          const ex = hx + 8 + dx * 3, ey = hy + 8 + dy * 3;
          rect(g, ex - 1 - dy * 3, ey - 1 - dx * 3, 2, 2, P.ink); rect(g, ex - 1 + dy * 3, ey - 1 + dx * 3, 2, 2, P.ink);
          if ((t * 3 | 0) % 2) rect(g, hx + 8 + dx * 7 - 1, hy + 8 + dy * 7 - 1, 2, 2, P.white);
        }
        parts.draw(g);
        pops.draw(g);
        // Glitch tearing on the win.
        if (glitch > 0) {
          const r = mkrng((t * 30) | 0);
          for (let i = 0; i < 10 * glitch; i++) { const y = OY + (r() * ROWS * CS | 0), h = 2 + (r() * 8 | 0), off = (r() * 30 - 15) * glitch; g.drawImage(g.canvas, 0, y, W, h, off, y, W, h); }
          g.globalAlpha = 0.2 * glitch; rect(g, 0, OY, W, ROWS * CS, P.magenta); g.globalAlpha = 1;
        }
        if (phase === 'win' && phaseT > 0.6) banner(g, 'NETWORK DOWN', 100, P.pink);
        if (phase === 'dead') banner(g, 'PACKET LOST', 100, P.red);
        topBar(g, 'VIRUS', score, `INFECTED ${String(infected).padStart(2, '0')}/${GOAL}`);
        hearts(g, lives, LIVES, 38, 2);
      },
    };
    return inst;
  },
};
