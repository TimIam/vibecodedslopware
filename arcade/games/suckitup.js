// SUCK IT UP: a robot vacuum works a dark office floor while the office cats hunt it. Laser pointers turn the tables.
import { C, spr, recolor, particles } from '../gfx.js';

const T = 12, OX = 2, OY = 26;
const MAP = [
  '#####################',
  '#o....#.......#....o#',
  '#.###.#.#####.#.###.#',
  '#...................#',
  '#.##.###.###.###.##.#',
  '#....#.........#....#',
  '####.#.###-###.#.####',
  '.....#.#     #.#.....',
  '####.#.#######.#.####',
  '#....#.........#....#',
  '#.##.###.###.###.##.#',
  '#...................#',
  '#.###.#.#####.#.###.#',
  '#...#...#...#...#...#',
  '#.#.###.#.#.#.###.#.#',
  '#o........D........o#',
  '#####################',
];
export const SUCK_MAP = MAP;
const COLS = MAP[0].length, ROWS = MAP.length, WRAP_R = 7, DOOR = { c: 10, r: 6 };
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

const VAC = [spr(['...KKKKK...', '.KKgggggKK.', '.KgGGGGGgK.', 'KgGGcccGGgK', 'KgGcwwwcGgK', 'KgGcwwwcGgK', 'KgGGcccGGgK', '.KgGGGGGgK.', '.KKgggggKK.', '...KKKKK...']),
  spr(['...KKgKK...', '.KKgggggKK.', '.KgGGGGGgK.', 'KgGGlllGGgK', 'gGGlwwwlGGg', 'KgGlwwwlGgK', 'KgGGlllGGgK', '.KgGGGGGgK.', '.KKgggggKK.', '...KKgKK...'])];
const CAT = [spr(['.k.......k.', '.kk.....kk.', '.kkkkkkkkk.', 'kkwykkkywkk', 'kkwkkkkkwkk', 'kkkkkpkkkkk', '.kkkkkkkkk.', '.kkkkkkkkk.', '..kkkkkkk..', '.k.k...k.k.']),
  spr(['.k.......k.', '.kk.....kk.', '.kkkkkkkkk.', 'kkwykkkywkk', 'kkwkkkkkwkk', 'kkkkkpkkkkk', '.kkkkkkkkk.', '.kkkkkkkkk.', '..kkkkkkk..', 'k...k.k...k'])];
const COATS = [
  { name: 'TUX', map: { k: 'K' }, aim: 'chase' },
  { name: 'GINGER', map: { k: 'o' }, aim: 'ahead' },
  { name: 'MOCHI', map: { k: 'G' }, aim: 'mood' },
  { name: 'CHONK', map: { k: 'P' }, aim: 'mirror' },
];
const SKINS = COATS.map(c => CAT.map(f => recolor(f, c.map)));
const SCARED = CAT.map(f => recolor(f, { k: 'B', y: 'r', p: 'w' }));
const LASER = spr(['..r..', '.rwr.', 'rwwwr', '.rwr.', '..r..']);
const PLANT = spr(['.e.e.', 'eeeee', '.eee.', '..n..', '.nnn.']);
const MONITOR = spr(['KKKKKK', 'KccccK', 'KcbccK', 'KKKKKK', '..KK..']);
const HOME_CORNERS = [{ c: 19, r: 1 }, { c: 1, r: 1 }, { c: 19, r: 15 }, { c: 1, r: 15 }];

export default {
  id: 'suckitup', title: 'SUCK IT UP', genre: 'MAZE CHASE',
  blurb: 'You are a robot vacuum. Clean the whole office. Avoid the cats until you find a laser pointer.',
  controls: ['ARROWS STEER', 'RED DOTS SEND CATS RUNNING'],
  create(a) {
    const fx = particles(a);
    let round = 1, lives = 3, dust, left, power = 0, chain = 0, clearT = 0, readyT = 90, deadT = 0, modeT = 0, napping = false, bg = null;
    const v = { x: 0, y: 0, dir: 3, want: 3, acc: 0, moving: false };
    let cats = [];

    const tile = (c, r) => { if (r === WRAP_R) c = (c + COLS) % COLS; return (MAP[r] && MAP[r][c]) ?? '#'; };
    const open = (c, r) => { const t = tile(c, r); return t !== '#' && t !== '-'; };
    const center = n => n * T + 6;
    const atCenter = e => e.x % T === 6 && e.y % T === 6;
    const cr = e => ({ c: Math.floor(e.x / T), r: Math.floor(e.y / T) });

    function fill() {
      dust = MAP.map(row => [...row].map(ch => (ch === '.' ? 1 : ch === 'o' ? 2 : 0)));
      left = dust.flat().filter(Boolean).length;
    }
    function place() {
      v.x = center(10); v.y = center(15); v.dir = 3; v.want = 3; v.acc = 0; v.moving = false;
      cats = COATS.map((coat, i) => ({ i, coat, x: center(8 + i + (i > 1 ? 1 : 0)), y: center(7), dir: 0, acc: 0, pen: 30 + i * 120, out: false, zoom: false }));
      power = 0; chain = 0; readyT = 90; modeT = 0; napping = false;
    }
    fill(); place();

    function step(e, speed, decide) {
      e.acc += speed;
      while (e.acc >= 1) {
        e.acc -= 1;
        if (atCenter(e)) decide(e);
        if (e.stopped) { e.acc = 0; return; }
        e.x += DX[e.dir]; e.y += DY[e.dir];
        if (e.x < 0) e.x += COLS * T;
        if (e.x >= COLS * T) e.x -= COLS * T;
      }
    }

    const dist2 = (c, r, tc, tr) => (c - tc) ** 2 + (r - tr) ** 2;

    function target(k) {
      const p = cr(v), corner = HOME_CORNERS[k.i];
      if (napping) return corner;
      switch (k.coat.aim) {
        case 'ahead': return { c: p.c + DX[v.dir] * 4, r: p.r + DY[v.dir] * 4 };
        case 'mood': { const here = cr(k); return dist2(here.c, here.r, p.c, p.r) > 36 ? p : corner; }
        case 'mirror': return { c: COLS - 1 - p.c, r: ROWS - 1 - p.r };
        default: return p;
      }
    }

    function catDecide(k) {
      const { c, r } = cr(k), back = (k.dir + 2) & 3;
      const exits = [0, 1, 2, 3].filter(d => d !== back && open(c + DX[d], r + DY[d]));
      if (!exits.length) { k.dir = back; return; }
      if (k.zoom) {
        // scatter away from the vacuum
        const p = cr(v);
        exits.sort((d1, d2) => dist2(c + DX[d2], r + DY[d2], p.c, p.r) - dist2(c + DX[d1], r + DY[d1], p.c, p.r));
        k.dir = a.chance(.8) ? exits[0] : a.pick(exits);
        return;
      }
      const t = target(k);
      exits.sort((d1, d2) => dist2(c + DX[d1], r + DY[d1], t.c, t.r) - dist2(c + DX[d2], r + DY[d2], t.c, t.r));
      k.dir = a.chance(.92) ? exits[0] : a.pick(exits);
    }

    function vacDecide(e) {
      const { c, r } = cr(e);
      if (open(c + DX[e.want], r + DY[e.want])) { e.dir = e.want; e.moving = true; e.stopped = false; return; }
      if (!open(c + DX[e.dir], r + DY[e.dir])) { e.stopped = true; e.moving = false; return; }
      e.stopped = false;
    }

    function updateCat(k) {
      if (k.pen > 0) { k.pen--; k.y = center(7) + (Math.sin(a.t * .15 + k.i) > 0 ? 1 : 0) - 0; k.bob = true; return; }
      if (!k.out) {
        // walk to the door column, then straight up through it
        k.bob = false;
        k.y = center(7);
        if (k.x !== center(DOOR.c)) { k.x += Math.sign(center(DOOR.c) - k.x); return; }
        k.out = true; k.x = center(DOOR.c); k.y = center(5); k.dir = a.chance(.5) ? 1 : 3; k.acc = 0;
        return;
      }
      const speed = k.zoom ? .68 : Math.min(1.14, .92 + round * .045) * (napping ? .85 : 1);
      step(k, speed, catDecide);
    }

    function caught() {
      lives--; deadT = 80; a.sfx('die'); a.shake(4);
      fx.burst(OX + v.x, OY + v.y, [C.G, C.c, C.w], 26, 2, 32, .02);
    }

    return {
      update() {
        fx.update();
        if (clearT) { if (--clearT === 0) { round++; fill(); place(); } return; }
        if (deadT) {
          if (--deadT === 0) { if (lives <= 0) return a.over(`LEFT ${left} PILES ON FLOOR ${round}`); place(); }
          return;
        }
        if (readyT) { readyT--; return; }

        const held = a.held('up') ? 0 : a.held('right') ? 1 : a.held('down') ? 2 : a.held('left') ? 3 : -1;
        if (held >= 0) {
          v.want = held;
          if (((v.dir + 2) & 3) === held && v.moving) { v.dir = held; }
        }
        step(v, 1.25 + Math.min(round, 6) * .02, vacDecide);
        if (v.stopped && atCenter(v)) { vacDecide(v); }

        const { c, r } = cr(v);
        const here = dust[r]?.[c];
        if (here && Math.abs(v.x - center(c)) < 5 && Math.abs(v.y - center(r)) < 5) {
          dust[r][c] = 0; left--;
          if (here === 2) { power = 420 - Math.min(round * 25, 220); chain = 0; a.add(50); a.sfx('pick'); for (const k of cats) if (k.out) { k.zoom = true; k.dir = (k.dir + 2) & 3; } }
          else { a.add(10); a.sfx('eat'); }
          if (!left) { clearT = 120; a.add(1000); a.sfx('level'); return; }
        }

        if (power > 0 && --power === 0) for (const k of cats) k.zoom = false;
        if (++modeT > (napping ? 300 : 1200)) { napping = !napping; modeT = 0; }
        for (const k of cats) updateCat(k);

        for (const k of cats) {
          if (!k.out) continue;
          if (Math.hypot(k.x - v.x, k.y - v.y) < 8) {
            if (k.zoom) {
              const pts = 200 * 2 ** chain; chain = Math.min(chain + 1, 3);
              a.add(pts); fx.pop(pts, OX + k.x, OY + k.y - 8, C.y, 40); fx.burst(OX + k.x, OY + k.y, [C.p, C.w], 14, 1.8, 24); a.sfx('boom');
              k.zoom = false; k.out = false; k.x = center(10); k.y = center(7); k.pen = 180;
            } else { caught(); return; }
          }
        }
      },
      draw(g) {
        if (!bg) bg = g.layer(COLS * T, ROWS * T, l => {
          l.clear('#2a3048');
          MAP.forEach((row, r) => [...row].forEach((ch, c) => {
            const x = c * T, y = r * T;
            if (ch !== '#') { l.rect(x, y, T, T, (c + r) & 1 ? '#343a56' : '#2e3450'); return; }
            const below = (MAP[r + 1]?.[c] ?? '#') === '#', above = (MAP[r - 1]?.[c] ?? '#') === '#';
            l.rect(x, y, T, T, C.N); l.rect(x, y, T, below ? T : 9, C.n);
            if (!above) l.rect(x, y, T, 2, C.t);
            const n = (c * 13 + r * 7) % 11;
            if (n === 3 && below && above) l.spr(PLANT, x + 3, y + 3);
            if (n === 6) l.spr(MONITOR, x + 3, y + 2);
          }));
          l.rect(DOOR.c * T, DOOR.r * T + 5, T, 2, C.p);
          l.text('NAP', 8 * T + 9, 7 * T + 2, '#4a5070');
        });
        g.clear(C.k);
        g.spr(bg, OX, OY);
        const blink = (a.t >> 4) & 1;
        dust.forEach((row, r) => row.forEach((d, c) => {
          if (!d) return;
          const x = OX + c * T + 6, y = OY + r * T + 6;
          if (d === 1) { g.rect(x - 1, y - 1, 2, 2, C.G); }
          else if (blink) g.spr(LASER, x - 2, y - 2);
        }));
        const fr = (a.t >> 3) & 1;
        for (const k of cats) {
          const art = k.zoom ? (power < 90 && blink ? SKINS[k.i] : SCARED) : SKINS[k.i];
          g.spr(art[fr], OX + k.x - 5, OY + k.y - 5);
        }
        if (!deadT) g.spr(VAC[fr], OX + v.x - 5, OY + v.y - 5);
        fx.draw(g);
        g.text(`FLOOR ${round}`, 2, 14, C.G);
        for (let i = 0; i < lives; i++) g.spr(VAC[0], 246 - i * 13, 12);
        if (power) { g.rect(90, 14, power / 420 * 80, 5, C.r); g.box(89, 13, 82, 7, C.K); }
        if (readyT) g.center('READY', 14 + 0, C.y);
        if (clearT && clearT & 16) g.center('SPOTLESS!', OY + 84, C.y, 2);
      },
      bot() {
        // breadth-first to the nearest dust, treating tiles beside a hunting cat as walls
        if (!atCenter(v) && !v.stopped) return {};
        const start = cr(v), danger = new Set();
        const hunters = cats.filter(k => k.out && !k.zoom);
        for (const k of hunters) {
          const q = cr(k);
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.abs(i) + Math.abs(j) <= 3) danger.add(`${q.c + i},${q.r + j}`);
        }
        const search = avoid => {
          const seen = new Set([`${start.c},${start.r}`]), q = [{ ...start, first: -1 }];
          while (q.length) {
            const n = q.shift();
            if (n.first >= 0 && dust[n.r]?.[n.c]) return n.first;
            for (let d = 0; d < 4; d++) {
              const c = n.r === WRAP_R ? (n.c + DX[d] + COLS) % COLS : n.c + DX[d], r = n.r + DY[d], key = `${c},${r}`;
              if (seen.has(key) || !open(c, r)) continue;
              if (avoid && danger.has(key)) continue;
              seen.add(key); q.push({ c, r, first: n.first < 0 ? d : n.first });
            }
          }
          return -1;
        };
        let d = search(true);
        if (d < 0) {
          let best = -1, far = -1;
          for (let k = 0; k < 4; k++) {
            if (!open(start.c + DX[k], start.r + DY[k])) continue;
            const score = Math.min(1e3, ...hunters.map(h => { const q = cr(h); return Math.abs(q.c - start.c - DX[k]) + Math.abs(q.r - start.r - DY[k]); }));
            if (score > far) { far = score; best = k; }
          }
          d = best;
        }
        return d < 0 ? {} : { [['up', 'right', 'down', 'left'][d]]: true };
      },
      state: () => ({ round, lives, left, power, cats: cats.map(k => ({ x: k.x, y: k.y, out: k.out })), vac: { x: v.x, y: v.y } }),
    };
  },
};
