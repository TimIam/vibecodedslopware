// TECH DEBT: a brick breaker in a code editor. The ball is a rubber duck, the paddle is a keyboard.
import { W, H, C, spr, particles } from '../gfx.js';

const L = 8, R = 248, TOP = 26, CW = 16, CH = 8, PY = 222;

const DUCK = spr(['.yyy.', 'yykyo', 'yyyy.', 'yyyyy', '.yyy.']);
const KEYS = t => spr(Array(6).fill(0).map((_, j) => j === 0 || j === 5 ? 'K'.repeat(t) : 'K' + (j % 2 ? 'Gg' : 'gG').repeat((t - 2) >> 1) + 'K'));
const PAD_W = { 22: KEYS(22), 34: KEYS(34), 50: KEYS(50) };

const LEVELS = [
  { name: 'HELLO WORLD', rows: ['.1.1.1.1.1.1.1.', '111111111111111', '222222222222222', '111111111111111', '111111111111111'] },
  { name: 'TODO', rows: ['222.111.22..111', '.2..1.1.2.2.1.1', '.2..1.1.2.2.1.1', '.2..1.1.2.2.1.1', '.2..111.22..111'] },
  { name: 'MERGE CONFLICT', rows: ['1111111.2222222', '.111111.222222.', '..11111.22222..', '...1111.2222...', '333333333333333', '...2222.1111...', '..22222.11111..'] },
  { name: 'SPAGHETTI', rows: ['1.2.3.1.2.3.1.2', '.1.2.3.1.2.3.1.', '2.3.1.2.3.1.2.3', '.2.3.1.2.3.1.2.', '3.1.2.3.1.2.3.1', '.3.1.2.3.1.2.3.'] },
  { name: 'THE MONOLITH', rows: ['....3333333....', '....3222223....', '....3211123....', '....3211123....', '....3211123....', '....3222223....', '...333333333...', '..11111111111..'] },
];

const TOKENS = { 1: [C.c, C.l, C.p], 2: [C.o], 3: [C.m] };
const POWERS = {
  F: { label: 'F', col: C.l, name: 'FORK', good: true },
  R: { label: 'R', col: C.c, name: 'REFACTOR', good: true },
  C: { label: 'C', col: C.n, name: 'COFFEE', good: true },
  S: { label: 'S', col: C.r, name: 'SCOPE CREEP', good: false },
};

export default {
  id: 'techdebt', title: 'TECH DEBT', genre: 'BRICK BREAKER',
  blurb: 'The codebase is a wall. Bounce a rubber duck off your keyboard until it is gone.',
  controls: ['LEFT RIGHT MOVE', 'Z LAUNCH THE DUCK'],
  create(a) {
    const fx = particles(a);
    let lvl = 0, lives = 3, bricks = [], balls = [], drops = [], padW = 34, padX = 111, stuck = true, banner = 80;
    let wideT = 0, slowT = 0, combo = 0, clearT = 0, botOff = 0;

    function load() {
      const def = LEVELS[lvl % LEVELS.length];
      bricks = [];
      def.rows.forEach((row, j) => [...row].forEach((c, i) => {
        if (c === '.') return;
        const hp = +c;
        bricks.push({ x: L + i * CW, y: TOP + j * CH, hp, tok: 3 + ((i * 7 + j * 3) % 8), col: a.pick(TOKENS[hp]) });
      }));
      balls = []; drops = []; padW = 34; wideT = slowT = 0; stuck = true; banner = 80; combo = 0;
    }
    const speed = () => Math.min(3.5, 2.4 + lvl * .16) * (slowT > 0 ? .68 : 1);
    function launch() {
      const ang = -Math.PI / 2 + (a.rand() - .5) * .9;
      balls = [{ x: padX + padW / 2, y: PY - 6, vx: Math.cos(ang), vy: Math.sin(ang) }];
      stuck = false; a.sfx('bounce');
    }
    function lifeLost() {
      a.sfx('die'); a.shake(4);
      if (--lives <= 0) return a.over(`DEBT REMAINING: ${bricks.length} LINES`);
      stuck = true; balls = []; drops = []; padW = 34; wideT = slowT = 0; combo = 0;
    }
    function hitBrick(b) {
      b.hp--; a.add(10 + 5 * Math.min(combo, 20)); combo++; a.sfx('brick');
      if (b.hp > 0) { b.col = a.pick(TOKENS[b.hp]); return; }
      bricks.splice(bricks.indexOf(b), 1);
      fx.burst(b.x + 8, b.y + 3, [b.col, C.G], 6, 1.2, 18);
      if (a.chance(.17)) { const type = a.pick(['F', 'F', 'R', 'R', 'C', 'S', 'S']); drops.push({ x: b.x + 2, y: b.y, type }); }
      if (!bricks.length) { a.add(500 + lvl * 250); clearT = 90; a.sfx('level'); }
    }
    function moveBall(o) {
      const v = speed(), steps = 4;
      for (let s = 0; s < steps; s++) {
        o.x += o.vx * v / steps;
        let b = bricks.find(q => o.x + 5 > q.x && o.x < q.x + 15 && o.y + 5 > q.y && o.y < q.y + 7);
        if (b) { o.x -= o.vx * v / steps; o.vx = -o.vx; hitBrick(b); }
        o.y += o.vy * v / steps;
        b = bricks.find(q => o.x + 5 > q.x && o.x < q.x + 15 && o.y + 5 > q.y && o.y < q.y + 7);
        if (b) { o.y -= o.vy * v / steps; o.vy = -o.vy; hitBrick(b); }
        if (o.x < L) { o.x = L; o.vx = Math.abs(o.vx); a.sfx('bounce'); }
        if (o.x + 5 > R) { o.x = R - 5; o.vx = -Math.abs(o.vx); a.sfx('bounce'); }
        if (o.y < 14) { o.y = 14; o.vy = Math.abs(o.vy); a.sfx('bounce'); }
        if (o.vy > 0 && o.y + 5 >= PY && o.y + 5 <= PY + 7 && o.x + 5 > padX && o.x < padX + padW) {
          const off = (o.x + 2.5 - (padX + padW / 2)) / (padW / 2), ang = off * 1.05;
          o.vx = Math.sin(ang); o.vy = -Math.cos(ang); o.y = PY - 5; combo = 0; a.sfx('bounce');
          botOff = (a.rand() - .5) * padW * .7;
        }
      }
    }
    load();

    return {
      update() {
        fx.update();
        if (banner > 0) banner--;
        if (clearT > 0) { if (--clearT === 0) { lvl++; load(); } return; }
        const v = a.held('left') ? -3.4 : a.held('right') ? 3.4 : 0;
        padX = Math.max(L, Math.min(R - padW, padX + v));
        if (wideT > 0 && --wideT === 0) padW = 34;
        if (slowT > 0) slowT--;
        if (stuck) { if (a.hit('a') || a.hit('up')) launch(); return; }
        for (const o of balls) moveBall(o);
        if (clearT) return;
        balls = balls.filter(o => o.y < H);
        if (!balls.length) return lifeLost();
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i]; d.y += 1;
          if (d.y + 7 >= PY && d.y < PY + 6 && d.x + 12 > padX && d.x < padX + padW) {
            drops.splice(i, 1);
            const p = POWERS[d.type];
            fx.pop(p.name, padX + padW / 2, PY - 12, p.col); a.sfx(p.good ? 'pick' : 'hit');
            if (d.type === 'F') {
              const extra = [];
              for (const o of balls.slice(0, 4)) { const s = Math.hypot(o.vx, o.vy), ang = Math.atan2(o.vy, o.vx) + .5; extra.push({ x: o.x, y: o.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s }); }
              balls.push(...extra);
            } else if (d.type === 'R') { padW = 50; wideT = 720; }
            else if (d.type === 'C') slowT = 540;
            else { padW = 22; wideT = 540; }
            padX = Math.min(padX, R - padW);
          } else if (d.y > H) drops.splice(i, 1);
        }
      },
      draw(g) {
        g.clear('#141828');
        g.rect(0, 10, L, H - 10, '#222842'); g.rect(R, 10, W - R, H - 10, '#222842');
        g.rect(0, 10, W, 4, '#222842');
        for (let i = 0; i < 26; i++) g.rect(1, 26 + i * 8, 5, 1, '#3a4266');
        for (const b of bricks) {
          g.rect(b.x, b.y, 15, 7, '#20263e');
          g.rect(b.x, b.y, 15, 1, b.col); g.rect(b.x, b.y + 6, 15, 1, b.hp > 1 ? b.col : '#20263e');
          g.rect(b.x + 1, b.y + 2, b.tok, 1, b.col); g.rect(b.x + 1, b.y + 4, 13 - b.tok, 1, b.col);
          if (b.hp > 1) g.rect(b.x + 12, b.y + 2, 2, 3, C.w);
        }
        for (const d of drops) {
          const p = POWERS[d.type];
          g.rect(d.x, d.y, 12, 7, p.col); g.text(p.label, d.x + 4, d.y, C.k);
        }
        const pad = PAD_W[padW] ?? PAD_W[34];
        g.spr(pad, padX, PY);
        for (const o of balls) g.spr(DUCK, o.x, o.y, o.vx < 0);
        if (stuck) g.spr(DUCK, padX + padW / 2 - 2, PY - 6);
        fx.draw(g);
        for (let i = 0; i < lives; i++) g.spr(DUCK, W - 12 - i * 8, 16);
        g.text(`LN ${lvl + 1}`, 10, 16, C.g);
        if (banner > 0 && !clearT) g.center(LEVELS[lvl % LEVELS.length].name, 132, C.y);
        if (clearT) g.center('MERGED TO MAIN', 120, C.l, 2);
        if (stuck && !banner) g.center('PRESS Z', 150, C.G);
      },
      bot() {
        if (stuck) return { a: !a.held('a') };
        let target = padX + padW / 2;
        const incoming = balls.filter(o => o.vy > 0).sort((p, q) => q.y - p.y)[0];
        if (incoming) target = incoming.x + 2 + botOff;
        const c = padX + padW / 2;
        return { left: target < c - 3, right: target > c + 3 };
      },
      state: () => ({ lvl, lives, bricks: bricks.length, balls: balls.length }),
    };
  },
};
