// DOZE THE CLOUD: drive a bulldozer through a data center campus before the injunction lands.
import { W, C, spr, turn, particles } from '../gfx.js';

const T = 12, OX = 8, OY = 34, COLS = 20, ROWS = 16;
const DIRT = 0, RACK = 1, WALL = 2, GEN = 3, COOL = 4, FENCE = 5, RUBBLE = 6, PUDDLE = 7;
const INFO = {
  [RACK]: { hp: 6, val: 400, label: '$400K', cols: [C.K, C.l, C.c] },
  [WALL]: { hp: 12, val: 50, label: '$50K', cols: [C.G, C.g] },
  [GEN]: { hp: 3, val: 800, label: '$800K', cols: [C.y, C.K] },
  [COOL]: { hp: 18, val: 1200, label: '$1.2M', cols: [C.w, C.s] },
  [FENCE]: { hp: 1, val: 5, label: '', cols: [C.G] },
};

const DOZER = spr(['y.yyyyyyyyy.y', 'YYYYYYYYYYYYY', '.KyyyyyyyyyK.', 'KKyyKKKKKyyKK', '.KyyKsssKyyK.', 'KKyyKsssKyyKK', '.KyyKKKKKyyK.', 'KKyyyyyyyyyKK', '.KyyyyyyyyyK.', 'KKyyyKgKyyyKK', '.KyyyyyyyyyK.', 'KKKKKKKKKKKKK']);
const DOZERS = [DOZER, turn(DOZER, 1), turn(DOZER, 2), turn(DOZER, 3)];
const CART = spr(['.KwwwwwK.', 'KKwwwwwKK', '.wwssswww', '.wwssswww', '.wrwbwrw.', '.wwwwwww.', 'KKwwwwwKK', '.KwwwwwK.']);
const ART = {
  [RACK]: spr(['KKKKKKKKKKKK', 'KkkkkkkkkkkK', 'KKKKKKKKKKKK', 'KkkkkkkkkkkK', 'KKKKKKKKKKKK', 'KkkkkkkkkkkK', 'KKKKKKKKKKKK', 'KkkkkkkkkkkK', 'KKKKKKKKKKKK', 'KkkkkkkkkkkK', 'KKKKKKKKKKKK', 'gggggggggggg']),
  [WALL]: spr(['GGGGGGGGGGGG', 'GwwwwwGwwwwG', 'GwwwwwGwwwwG', 'gggggggggggg', 'wwGwwwwwGwww', 'wwGwwwwwGwww', 'gggggggggggg', 'GwwwwwGwwwwG', 'GwwwwwGwwwwG', 'gggggggggggg', 'wwGwwwwwGwww', 'gggggggggggg']),
  [GEN]: spr(['KKKKKKKKKKKK', 'KyyyyyyyyyyK', 'KyKyKyKyKyyK', 'KyyyyyyyyyyK', 'KyyrrrrryyyK', 'Kyyrkkkkryyy', 'KyyrkkkkryyK', 'KyyrrrrryyyK', 'KyyyyyyyyyyK', 'KyKyKyKyKyyK', 'KyyyyyyyyyyK', 'KKKKKKKKKKKK']),
  [COOL]: spr(['...wwwwww...', '.wwGGGGGGww.', '.wGssssssGw.', 'wGssccccssGw', 'wGsccbbccsGw', 'wGscbbbbcsGw', 'wGscbbbbcsGw', 'wGsccbbccsGw', 'wGssccccssGw', '.wGssssssGw.', '.wwGGGGGGww.', '...wwwwww...']),
  [FENCE]: spr(['g...g...g...', '.g.g.g.g.g.g', '..g...g...g.', '.g.g.g.g.g.g', 'g...g...g...', '.g.g.g.g.g.g', '..g...g...g.', '.g.g.g.g.g.g', 'g...g...g...', '.g.g.g.g.g.g', '..g...g...g.', '.g.g.g.g.g.g']),
  [RUBBLE]: spr(['............', '..N.....n...', '.nNn.....g..', '..n...N.....', '.......nNn..', '...g....n...', '.N..........', 'nNn...n..N..', '.n...nNn....', '......n..g..', '..g.........', '............']),
  [PUDDLE]: spr(['............', '...ssss.....', '..sccccss...', '.scccccccs..', '.sccccccccs.', '..scccccccs.', '...sscccss..', '.....sss....', '............', '............', '............', '............']),
};
const SITES = ['ASHBURN ANNEX', 'ABILENE PHASE 2', 'QUINCY RIDGE', 'PRINEVILLE EAST', 'HYPERSCALE 9', 'THE BIG ONE'];

export default {
  id: 'doze', title: 'DOZE THE CLOUD', genre: 'DEMOLITION',
  blurb: 'Flatten every rack on site before the injunction arrives. Generators blow up. Plow carts head on.',
  controls: ['ARROWS DRIVE INTO THINGS', 'HOLD Z TO RAM'],
  create(a) {
    const fx = particles(a);
    let site = 0, grid, hps, racks = 0, time = 0, combo = 0, comboT = 0, carts = [], booms = [], spawnT = 200, clearT = 0, banner = 100, dmg = 0, fuel = 100, inv = 0;
    const dz = { x: 128, y: 200, dir: 0 };

    const at = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : grid[r][c]);
    const solid = t => t >= RACK && t <= FENCE;

    function stamp(x0, y0, w, h) {
      for (let r = y0; r < y0 + h; r++) for (let c = x0; c < x0 + w; c++) {
        const edge = r === y0 || r === y0 + h - 1 || c === x0 || c === x0 + w - 1;
        grid[r][c] = edge ? WALL : (c - x0) % 2 === 1 ? RACK : DIRT;
      }
      grid[y0 + h - 1][x0 + (w >> 1)] = DIRT;
    }
    function load() {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(DIRT));
      for (let c = 0; c < COLS; c++) { grid[0][c] = FENCE; if (Math.abs(c - 10) > 1) grid[ROWS - 1][c] = FENCE; }
      for (let r = 0; r < ROWS; r++) { grid[r][0] = FENCE; grid[r][COLS - 1] = FENCE; }
      const halls = Math.min(4, 2 + (site >> 1));
      const spots = [[2, 2], [11, 2], [2, 8], [11, 8]];
      spots.slice(0, halls).forEach(([cx, cy]) => {
        const w = 6 + a.rint(2), h = 4 + a.rint(2);
        stamp(cx + a.rint(1), cy, w, h);
        for (let i = 0; i < 2; i++) { const c = cx + a.rint(w), r = cy + h; if (at(c, r) === DIRT) grid[r][c] = GEN; }
        const c = cx + w; if (at(c, cy + 1) === DIRT) grid[cy + 1][c] = COOL;
      });
      hps = grid.map(row => row.map(t => (solid(t) ? INFO[t].hp : 0)));
      racks = grid.flat().filter(t => t === RACK).length;
      time = site === 0 ? 34 * 60 : time + (Math.max(5, 15 - site * 2) + racks * .12) * 60; // the clock tightens every site
      dz.x = 10 * T + 6; dz.y = (ROWS - 2) * T + 6; dz.dir = 0;
      carts = []; booms = []; spawnT = 200; banner = 100; combo = 0; inv = 0;
    }

    function wreck(c, r) {
      const t = grid[r][c];
      if (!solid(t)) return;
      const I = INFO[t], cx = OX + c * T + 6, cy = OY + r * T + 6;
      grid[r][c] = t === COOL ? PUDDLE : RUBBLE;
      if (I.label) {
        combo = Math.min(combo + 1, 16); comboT = 60;
        const mult = 1 + (combo >> 2);
        a.add(I.val * mult);
        fx.pop(mult > 1 ? `${I.label} X${mult}` : I.label, cx, cy - 6, t === RACK ? C.l : C.y, 34);
      }
      if (t === RACK) { racks--; fx.burst(cx, cy, I.cols, 8, 1.6, 26); a.sfx('crunch'); a.shake(2); }
      else if (t === GEN) booms.push({ c, r, t: 7 });
      else if (t === COOL) { fx.burst(cx, cy, I.cols, 22, 2.2, 34); a.sfx('splash'); a.shake(3); }
      else { fx.burst(cx, cy, I.cols, 4, 1, 16); if (t === WALL) a.sfx('crunch'); }
      if (racks <= 0 && !clearT) { clearT = 130; a.add(Math.floor(time / 60) * 100); a.sfx('level'); }
    }
    function explode(c, r) {
      a.sfx('boom'); a.shake(7);
      fx.burst(OX + c * T + 6, OY + r * T + 6, [C.y, C.o, C.r, C.K], 34, 2.8, 34, .02);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        if (i * i + j * j > 6) continue;
        const cc = c + i, rr = r + j;
        const t = at(cc, rr);
        if (!solid(t)) continue;
        if (t === COOL) { hps[rr][cc] -= 9; if (hps[rr][cc] <= 0) wreck(cc, rr); } else wreck(cc, rr);
      }
      for (let i = carts.length - 1; i >= 0; i--) if (Math.hypot(carts[i].x - (c * T + 6), carts[i].y - (r * T + 6)) < 30) crush(i);
    }
    function crush(i) {
      const k = carts[i]; carts.splice(i, 1);
      a.add(500); fx.pop('$500', OX + k.x, OY + k.y - 6, C.w, 30); fx.burst(OX + k.x, OY + k.y, [C.w, C.r, C.b], 10, 1.8, 20); a.sfx('crunch');
    }
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    function tileAt(px, py) { return [Math.floor(px / T), Math.floor(py / T)]; }
    function blockedBox(x, y, half) {
      for (const [px, py] of [[x - half, y - half], [x + half, y - half], [x - half, y + half], [x + half, y + half]]) {
        const [c, r] = tileAt(px, py);
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || solid(at(c, r))) return true;
      }
      return false;
    }
    load();

    return {
      update() {
        fx.update();
        if (banner) banner--;
        if (clearT) { if (--clearT === 0) { site++; load(); } return; }
        if ((time -= 1) <= 0) return a.over(`SERVED AT ${SITES[Math.min(site, SITES.length - 1)]}`);
        if (inv) inv--;
        if (comboT && --comboT === 0) combo = 0;

        for (let i = booms.length - 1; i >= 0; i--) if (--booms[i].t <= 0) { const b = booms[i]; booms.splice(i, 1); explode(b.c, b.r); }

        const want = a.held('up') ? 0 : a.held('right') ? 1 : a.held('down') ? 2 : a.held('left') ? 3 : -1;
        const ram = a.held('a') && fuel > 2 && want >= 0;
        fuel = ram ? fuel - .9 : Math.min(100, fuel + .35);
        if (want >= 0) {
          dz.dir = want;
          const dx = DX[want], dy = DY[want], v = ram ? 2.1 : 1.25, half = 5;
          // the two corners of the plow do the damage
          const fx0 = dz.x + dx * (half + 2), fy0 = dz.y + dy * (half + 2);
          const hit = [];
          for (const s of [-half + 1, half - 1]) {
            const [c, r] = tileAt(fx0 + (dy ? s : 0), fy0 + (dx ? s : 0));
            const t = at(c, r);
            if (solid(t) && !hit.some(h => h[0] === c && h[1] === r)) hit.push([c, r]);
          }
          if (hit.length) {
            for (const [c, r] of hit) {
              hps[r][c] -= ram ? 2 : 1;
              if ((dmg++ & 3) === 0) { fx.burst(OX + fx0, OY + fy0, [C.n, C.G, C.y], 2, 1.2, 12); a.shake(1); }
              if (hps[r][c] <= 0) wreck(c, r);
            }
          } else {
            const nx = dz.x + dx * v, ny = dz.y + dy * v;
            if (!blockedBox(nx, ny, half)) { dz.x = nx; dz.y = ny; }
            // slide past corners rather than sticking on them
            else if (dx) { const near = (Math.floor(dz.y / T) + .5) * T; dz.y += Math.sign(near - dz.y) * Math.min(1, Math.abs(near - dz.y)); }
            else { const near = (Math.floor(dz.x / T) + .5) * T; dz.x += Math.sign(near - dz.x) * Math.min(1, Math.abs(near - dz.x)); }
          }
        }

        if (--spawnT <= 0 && carts.length < 2 + site) { spawnT = Math.max(90, 260 - site * 30); carts.push({ x: 10 * T + 6, y: (ROWS - 1) * T + 4, axis: 0 }); }
        const spd = .62 + site * .05;
        for (let i = carts.length - 1; i >= 0; i--) {
          const k = carts[i], dx = dz.x - k.x, dy = dz.y - k.y;
          const tryMove = (mx, my) => { if (!blockedBox(k.x + mx, k.y + my, 3.5)) { k.x += mx; k.y += my; return true; } return false; };
          const horiz = Math.abs(dx) > Math.abs(dy);
          const moved = horiz ? tryMove(Math.sign(dx) * spd, 0) || tryMove(0, (dy >= 0 ? 1 : -1) * spd) : tryMove(0, Math.sign(dy) * spd) || tryMove((dx >= 0 ? 1 : -1) * spd, 0);
          if (!moved && a.chance(.02)) { k.x += a.rand() * 4 - 2; }
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            const facing = DX[dz.dir] * (k.x - dz.x) + DY[dz.dir] * (k.y - dz.y) > 2;
            if (facing) crush(i);
            else if (!inv) { inv = 40; time -= 180; fx.pop('-3 SEC', OX + dz.x, OY + dz.y - 10, C.r, 40); a.sfx('hit'); a.shake(3); carts.splice(i, 1); }
          }
        }
      },
      draw(g) {
        g.clear('#6a5230');
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const x = OX + c * T, y = OY + r * T, t = grid[r][c], n = (c * 31 + r * 17) % 9;
          g.rect(x, y, T, T, (c + r) & 1 ? '#7a6038' : '#73593a');
          if (n === 2) g.rect(x + 3, y + 7, 2, 1, C.N);
          if (t !== DIRT) g.spr(ART[t], x, y);
          if (t === RACK) for (let k = 0; k < 5; k++) if (((a.t >> 3) + c * 3 + r * 5 + k * 7) % 4) g.rect(x + 2 + (k * 5 + c) % 8, y + 1 + k * 2, 1, 1, ((c + k) & 1) ? C.l : C.c);
          if (t === COOL) { const w = (a.t >> 2) & 1; g.rect(x + 4 + w, y + 4, 2, 2, C.w); }
        }
        for (const k of carts) g.spr(CART, OX + k.x - 4, OY + k.y - 4);
        if (!(inv & 4)) g.spr(DOZERS[dz.dir], OX + dz.x - 6, OY + dz.y - 6);
        fx.draw(g);

        g.rect(0, 10, W, 22, C.k);
        const sec = Math.max(0, Math.ceil(time / 60));
        g.text('INJUNCTION', 4, 13, sec < 10 && (a.t & 16) ? C.r : C.G);
        g.text(`${sec}S`, 70, 13, sec < 10 ? C.r : C.w);
        g.text(`RACKS ${racks}`, 112, 13, C.l);
        g.textR(combo >= 4 ? `X${1 + (combo >> 2)}` : '', W - 4, 13, C.y);
        g.text('DIESEL', 4, 23, C.G);
        g.rect(46, 24, 60, 5, C.K); g.rect(46, 24, 60 * Math.max(fuel, 0) / 100, 5, fuel > 25 ? C.o : C.r);
        g.textR(SITES[Math.min(site, SITES.length - 1)], W - 4, 23, C.G);
        if (banner > 0 && !clearT) { g.center(`SITE ${site + 1}`, 112, C.y, 2); }
        if (clearT) g.center('SITE CLEARED', 112, C.l, 2);
      },
      bot() {
        // drive at the nearest rack, one axis at a time; everything in the way just gets plowed
        let best = null, bd = 1e9;
        grid.forEach((row, r) => row.forEach((t, c) => {
          if (t !== RACK) return;
          const d = Math.abs(c * T + 6 - dz.x) + Math.abs(r * T + 6 - dz.y);
          if (d < bd) { bd = d; best = { x: c * T + 6, y: r * T + 6 }; }
        }));
        if (!best) return {};
        const dx = best.x - dz.x, dy = best.y - dz.y, out = { a: fuel > 40 };
        if (Math.abs(dy) > 2 && Math.abs(dx) <= 2) { out[dy > 0 ? 'down' : 'up'] = true; return out; }
        if (Math.abs(dx) > 2) { out[dx > 0 ? 'right' : 'left'] = true; return out; }
        out[dy > 0 ? 'down' : 'up'] = true;
        return out;
      },
      state: () => ({ site, racks, time, carts: carts.length }),
    };
  },
};
