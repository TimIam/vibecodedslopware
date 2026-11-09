// BASS ACKWARDS: a day on the lake. Drop a line, hook something, and fight the tension gauge to land it.
import { W, C, spr, particles } from '../gfx.js';

const SURF = 62, FLOOR = 226, DAY = 100 * 60;

const S = {
  minnow: spr(['c..ssss.', 'ccsssksw', 'c..ssss.']),
  perch: spr(['....yyyyy...', 'o.yyNyNyyyy.', 'ooyyNyNyykyy', 'ooyyNyNyyyyw', 'o.yyyyyyyyy.', '....ooo.....']),
  bass: spr(['......EEE.......', 'E...EeeeeeeEE...', 'EE.EeEeEeEeeeEE.', 'EEEeeeeeeeeeekeE', 'EEEllEllElleeeew', 'EE.llllllllllll.', 'E....llllll.....', '......E.E.......']),
  pike: spr(['.......EE...............', 'E...eeeeeeeeeeeeeeee....', 'EEeelelelelelelelleeekeee', 'EEeeeeeeeeeeeeeeeeeeewwww', 'E...llllllllllllll......']),
  cat: spr(['.....KKK..........', 'K..KKgggKKKKK.....', 'KKKggggggggggKK.g.', 'KKKgggggggggggkKgg', 'KKKGGGGGGGGGGGGw..', 'K..GGGGGGGGGGG.g..', '.....K....K....g..']),
  angler: spr(['..........y.....', '.........o.y....', '......PPo.......', '....PPPPPPP.....', 'P..PPmPPPPPPP...', 'PPPPPPPPPPkkPPw.', 'PPPPPmPPPPPPPw.w', 'PPPPPPPPPPPPPPw.', 'P..PPPmPPPPPw.w.', '....PPPPPPPPPP..', '......PPP.......']),
  beast: spr([
    '...............BBBB.........................',
    '...........BBBBPPPPBBBBB....................',
    'B.......BBBPPPPPPPPPPPPPBBBBB...............',
    'BB....BBPPPPbPPPPbPPPPbPPPPPPBBBBB..........',
    'BBB.BBPPPPPPPPPPPPPPPPPPPPPPPPPPPPBBB.......',
    'BBBBPPPbPPPPbPPPPbPPPPbPPPPbPPPPPPPPBBB.....',
    'BBPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPyyPPPBB...',
    'BBPPbPPPPbPPPPbPPPPbPPPPbPPPPPPPPykkyPPPPB..',
    'BBPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPyyPPPPPPB.',
    'BBBBPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPw.w.w.',
    'BBB.BBPPgPgPgPgPgPgPgPgPgPgPgPgPgPPPPPk.....',
    'BB....BBgggggggggggggggggggggggggggPPPw.w.w.',
    'B.......BBggggggggggggggggggggggggPPPPPPPPB.',
    '...........BBBBgggggggggggggggPPPPPPPPBBB...',
    '...............BBBBB....BBBBBBBBBB..........',
  ]),
  boot: spr(['.NNNNN....', '.NnnnN....', '.NnnnN....', '.NnnnNNNN.', '.NnnnnnnnN', '.NnnnnnnnN', 'kkkkkkkkkk']),
  tire: spr(['...KKKKK...', '.KKgKgKgKK.', 'KKK.....KKK', 'gK.......Kg', 'KK.......KK', 'gK.......Kg', 'KKK.....KKK', '.KKgKgKgKK.', '...KKKKK...']),
  router: spr(['g..........g', '.g........g.', '..g......g..', 'KKKKKKKKKKKK', 'KlKyKlKKKKgK', 'KKKKKKKKKKKK']),
  jelly: spr(['..ppppp..', '.pwpppwp.', 'ppppppppp', 'mmmmmmmmm', '.p.m.p.m.', 'p..m.p..m', '.p.m..p.m', 'p...m.p..']),
  hook: spr(['.g.', '.g.', '.g.', 'g.g', 'g.g', '.g.']),
  boat: spr(['.................................n', 'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwn.', 'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..', '.nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn...', '.NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...', '..NNNNNNNNNNNNNNNNNNNNNNNNNNN.....']),
  // a raccoon in a bucket hat
  guy: spr(['...YYYYYY...', '..yyyyyyyy..', 'yyyyyyyyyyyy', '.KGGGGGGGGK.', '.KkkGGGGkkK.', '.KkwKGGwkkK.', '..GGGkkGGG..', '...bbbbbb...', '..bbbbbbbb..', '..bbbbbbbb..']),
  tree: spr(['....EE....', '..EEEEEE..', '.EEEEEEEE.', 'EEEEEEEEEE', '.EEEEEEEE.', 'EEEEEEEEEE', '....NN....']),
  weed: spr(['.e..', 'e.e.', '.e..', 'e...', '.e.e', '..e.', '.e..', 'e...']),
  spool: spr(['.nnn.', 'wwwww', 'wwwww', 'wwwww', '.nnn.']),
};

const KINDS = [
  { name: 'MINNOW', s: S.minnow, lb: [.1, .4], pts: 40, ppl: 60, top: 76, bot: 120, spd: 1.0, pow: .15, odds: 26 },
  { name: 'PERCH', s: S.perch, lb: [.4, 2], pts: 100, ppl: 60, top: 90, bot: 150, spd: .7, pow: .4, odds: 26 },
  { name: 'BASS', s: S.bass, lb: [2, 7], pts: 250, ppl: 60, top: 110, bot: 180, spd: .65, pow: .7, odds: 20 },
  { name: 'PIKE', s: S.pike, lb: [5, 14], pts: 500, ppl: 50, top: 120, bot: 195, spd: 1.2, pow: 1.1, odds: 10 },
  { name: 'CATFISH', s: S.cat, lb: [8, 30], pts: 700, ppl: 40, top: 185, bot: 215, spd: .4, pow: 1.3, odds: 9 },
  { name: 'ANGLER', s: S.angler, lb: [10, 25], pts: 1400, ppl: 60, top: 175, bot: 212, spd: .35, pow: 1.5, odds: 4, night: true },
  { name: 'OLD BOOT', s: S.boot, lb: [1, 1], pts: 10, ppl: 0, junk: true, odds: 3 },
  { name: 'TIRE', s: S.tire, lb: [12, 12], pts: 25, ppl: 0, junk: true, odds: 2 },
  { name: 'WIFI ROUTER', s: S.router, lb: [1, 1], pts: 300, ppl: 0, junk: true, odds: 1 },
];
const BEAST = { name: 'THE OLD ONE', s: S.beast, lb: [300, 900], pts: 4000, ppl: 8, top: 178, bot: 192, spd: .5, pow: 2.3, beast: true };

// dawn to night, stepped like an 8-bit palette swap
const SKIES = [
  { at: 0, sky: '#f0a0a0', band: '#f8d0a0', w: ['#4f86c8', '#2c5fa8', '#1c3f80'], trees: '#2a4a48' },
  { at: .18, sky: '#9ad8f8', band: '#c8ecfc', w: ['#3a9ad8', '#2c6fc0', '#1a3a88'], trees: '#2c7a44' },
  { at: .62, sky: '#7cc0f0', band: '#b8e0f8', w: ['#3a90d0', '#2868b4', '#183680'], trees: '#2c6e40' },
  { at: .78, sky: '#f08c50', band: '#f8c860', w: ['#c07858', '#6a5a90', '#2c2c70'], trees: '#3a3040' },
  { at: .9, sky: '#1a1a50', band: '#3a2a70', w: ['#1c2c70', '#141e58', '#0c1038'], trees: '#0c1028' },
];

export default {
  id: 'fishing', title: 'BASS ACKWARDS', genre: 'FISHING',
  blurb: 'One day on the lake. Land the big ones before dark and try not to snap your last line.',
  controls: ['ARROWS MOVE BOAT, DROP LINE', 'HOLD Z TO REEL, LET GO WHEN IT RUNS'],
  create(a) {
    const fx = particles(a);
    let day = DAY, mode = 'free', modeT = 0, lines = 3, caught = 0, best = null;
    let tension = 0, slack = 0, run = 0, nextRun = 0, card = null, zap = 0, beastDone = false;
    const boat = { x: 100, flip: false };
    const hook = { x: 0, y: SURF };
    const fish = [];
    let on = null;

    const frac = () => 1 - day / DAY;
    const tip = () => boat.x + (boat.flip ? -2 : 35);

    function spawn() {
      const night = frac() > .78;
      const pool = KINDS.filter(k => !k.night || night);
      let total = pool.reduce((s, k) => s + (k.night ? k.odds * 3 : k.odds), 0), roll = a.rand() * total, k = pool[0];
      for (const c of pool) { roll -= c.night ? c.odds * 3 : c.odds; if (roll <= 0) { k = c; break; } }
      if (k.junk) { fish.push({ k, x: 12 + a.rint(W - 40), y: FLOOR - k.s.h, dir: 1, y0: 0, phase: 0, junk: true, life: 900 }); return; }
      addSwimmer(k);
    }
    function addSwimmer(k) {
      const dir = a.chance(.5) ? 1 : -1;
      const y0 = k.top + a.rand() * (k.bot - k.top);
      fish.push({ k, x: dir > 0 ? -k.s.w : W, y: y0, y0, dir, phase: a.rand() * 6, spd: k.spd * (.8 + a.rand() * .4) });
    }
    for (let i = 0; i < 8; i++) { spawn(); const f = fish[fish.length - 1]; if (!f.junk) f.x = a.rand() * (W - 24); }

    const mouth = f => ({ x: f.dir > 0 ? f.x + f.k.s.w : f.x, y: f.y + f.k.s.h / 2 });

    function bite(f) {
      if (f.junk) return land(f, true);
      on = f; mode = 'fight'; modeT = 0; tension = .25; slack = 0; run = 0; nextRun = 70 + a.rint(90);
      a.sfx('bite'); fx.burst(hook.x, hook.y, C.w, 5, 1);
    }
    function land(f) {
      const [lo, hi] = f.k.lb, lb = lo + a.rand() * (hi - lo), pts = Math.round(f.k.pts + lb * f.k.ppl);
      a.add(pts); caught++;
      if (!f.k.junk && (!best || lb > best.lb)) best = { name: f.k.name, lb };
      card = { k: f.k, lb, pts };
      a.sfx(f.k.junk ? 'crunch' : 'level');
      fish.splice(fish.indexOf(f), 1);
      fx.burst(hook.x, SURF, [C.w, C.s], 14, 1.6);
      on = null; mode = 'show'; modeT = 0; hook.y = SURF;
    }
    function lose(text, snapped) {
      fx.pop(text, hook.x, Math.max(hook.y - 10, 30), snapped ? C.r : C.y, 60);
      fx.burst(hook.x, hook.y, snapped ? C.r : C.s, 8, 1.4);
      a.sfx(snapped ? 'snap' : 'splash');
      if (on) { on.dir = -on.dir; on.fleeing = true; on.spd = (on.k.spd + 1) * 1.5; on.y0 = on.y; on = null; }
      mode = 'free'; tension = 0; hook.y = SURF;
      if (snapped && --lines <= 0) end('OUT OF LINE');
    }
    function end(why) {
      a.over(best ? `BIGGEST: ${best.name} ${best.lb.toFixed(1)} LB` : why);
    }

    return {
      update() {
        fx.update(); modeT++;
        if (--day <= 0) return end('NOTHING BUT SUNBURN');

        if (fish.length < 13 && a.chance(.05)) spawn();
        if (!beastDone && frac() > .55 && a.chance(.0025)) { beastDone = true; addSwimmer(BEAST); }

        for (let i = fish.length - 1; i >= 0; i--) {
          const f = fish[i];
          if (f === on) continue;
          if (f.junk) { if (--f.life <= 0) fish.splice(i, 1); continue; }
          f.phase += .05;
          f.x += f.dir * f.spd;
          f.y = f.y0 + Math.sin(f.phase) * 3;
          const m = mouth(f), dx = hook.x - m.x, dy = hook.y - m.y;
          if (mode === 'free' && !f.fleeing && hook.y > SURF + 4 && Math.abs(dy) < 26 && Math.abs(dx) < 54) {
            if (dx * f.dir < 0 && Math.abs(dx) > 8) f.dir = -f.dir;
            f.y0 += Math.sign(dy) * .35;
          }
          if (f.x < -60 || f.x > W + 20) fish.splice(i, 1);
        }

        const move = () => {
          const v = a.held('left') ? -1 : a.held('right') ? 1 : 0;
          if (v) { boat.x = Math.max(4, Math.min(W - 38, boat.x + v * 1.1)); boat.flip = v < 0; }
        };

        if (mode === 'free') {
          move();
          if (zap > 0) { zap--; hook.y = Math.max(SURF, hook.y - 2.5); }
          else {
            if (a.held('down')) hook.y = Math.min(FLOOR - 6, hook.y + 1.3);
            if (a.held('up') || a.held('a')) hook.y = Math.max(SURF, hook.y - 1.5);
          }
          hook.x = tip();
          if (hook.y > SURF + 4 && !zap) {
            for (const f of fish) {
              if (f.fleeing) continue;
              const m = f.junk ? { x: f.x + f.k.s.w / 2, y: f.y + 3 } : mouth(f), reach = f.k.beast ? 11 : 7;
              if (Math.abs(m.x - hook.x) < reach && Math.abs(m.y - hook.y) < reach) { bite(f); break; }
            }
          }
        } else if (mode === 'fight') {
          const k = on.k, reeling = a.held('a') || a.held('up');
          if (run > 0) run--;
          else if (--nextRun <= 0) { run = 28 + a.rint(30); nextRun = (170 + a.rint(120)) / (.9 + k.pow * .25); a.sfx('hit'); }
          if (reeling) {
            hook.y -= (.95 - k.pow * .12) * (run ? .3 : 1); // reeling must outrun what a run pulls back, or big fish can't be landed
            tension += (.0075 + .004 * k.pow) * (run ? 2.6 : 1);
          } else {
            tension -= run ? .007 : .017;
            hook.y = Math.min(FLOOR - 6, hook.y + (run ? .3 + .12 * k.pow : .05 * k.pow));
          }
          tension = Math.max(0, tension);
          boat.x = Math.max(4, Math.min(W - 38, boat.x + Math.sin(modeT * .09) * k.pow * .2));
          hook.x = tip() + Math.sin(modeT * .25) * (run ? 3 : 1);
          on.dir = Math.sin(modeT * .05) > 0 ? 1 : -1;
          const m = mouth(on);
          on.x += hook.x - m.x; on.y += hook.y - m.y;
          if (tension >= 1) lose('SNAP!', true);
          else if (tension <= 0 && ++slack > 100) lose('THREW THE HOOK', false);
          else {
            if (tension > 0) slack = 0;
            if (hook.y <= SURF + 2) land(on);
          }
        } else if (mode === 'show') {
          move();
          hook.x = tip();
          if (modeT > 70) { mode = 'free'; card = null; }
        }

        // jellyfish drift up and down a column and sting the line
        if (fish.filter(f => f.jelly).length < 2 + (frac() > .5 ? 1 : 0) && a.chance(.01)) fish.push(jelly());
        for (const f of fish) if (f.jelly) {
          f.y = f.y0 + Math.sin(f.phase += .02) * 26;
          f.x += Math.sin(f.phase * .6) * .15;
          if (mode === 'free' && !zap && hook.y > SURF + 4 && Math.abs(f.x + 4 - hook.x) < 7 && Math.abs(f.y + 4 - hook.y) < 7) {
            zap = 60; fx.pop('ZAP!', hook.x, hook.y - 8, C.y, 40); fx.burst(hook.x, hook.y, [C.y, C.w], 10, 1.6); a.sfx('zap');
          }
        }
      },

      draw(g) {
        const f0 = frac();
        let sky = SKIES[0];
        for (const s of SKIES) if (f0 >= s.at) sky = s;
        g.rect(0, 10, W, SURF - 10, sky.sky);
        g.rect(0, SURF - 14, W, 14, sky.band);
        for (let i = 0; i < W; i += 4) if (i % 8 === 0) g.rect(i, SURF - 15, 2, 1, sky.band);
        // sun then moon, arcing across
        const night = f0 >= .9, arc = night ? (f0 - .9) / .1 : f0 / .9;
        const sx = arc * (W - 20) + 2, sy = 44 - Math.sin(arc * Math.PI) * 28;
        g.rect(sx, sy, 12, 12, night ? C.G : C.y); g.rect(sx - 1, sy + 2, 14, 8, night ? C.G : C.y); g.rect(sx + 2, sy - 1, 8, 14, night ? C.G : C.y);
        if (night) for (let i = 0; i < 26; i++) g.rect((i * 97) % W, 12 + (i * 53) % 30, 1, 1, C.w);
        for (let i = -6; i < W; i += 22) {
          const h = 8 + ((i + 6) * 7) % 10;
          g.rect(i, SURF - h, 18, h, sky.trees); g.rect(i + 3, SURF - h - 3, 12, 3, sky.trees);
        }
        // water in three stepped bands with dithered seams
        g.rect(0, SURF, W, 50, sky.w[0]); g.rect(0, SURF + 50, W, 56, sky.w[1]); g.rect(0, SURF + 106, W, FLOOR - SURF - 106, sky.w[2]);
        for (const [y, col] of [[SURF + 50, sky.w[0]], [SURF + 106, sky.w[1]]]) for (let x = 0; x < W; x += 2) g.rect(x + (y & 2), y, 1, 1, col);
        const wob = (modeT >> 4) & 1;
        for (let x = wob * 4; x < W; x += 16) g.rect(x, SURF, 8, 1, C.w);
        g.rect(0, FLOOR, W, 14, C.Y); for (let x = 0; x < W; x += 5) g.rect(x + (x & 3), FLOOR + 3 + (x * 3) % 7, 2, 1, C.n);
        for (let x = 12; x < W; x += 41) g.spr(S.weed, x, FLOOR - 8, ((x + (modeT >> 5)) & 1) === 0);

        for (const f of fish) {
          if (f.jelly) { g.spr(S.jelly, f.x, f.y); continue; }
          const blink = f === on && run && (modeT & 4);
          if (!blink) g.spr(f.k.s, f.x, f.y, f.dir < 0);
        }

        // boat, angler, rod, line
        const bx = boat.x | 0, bob = (modeT >> 5) & 1, by = SURF - 6 + bob;
        g.spr(S.guy, bx + 11, by - 10, boat.flip);
        g.spr(S.boat, bx, by, boat.flip);
        const hx = hook.x | 0, rodY = by - 14;
        g.line(bx + 18, by - 3, hx, rodY, C.n);
        g.line(hx, rodY, hx, hook.y, on ? (tension > .8 ? C.r : C.w) : C.G);
        g.spr(S.hook, hx - 1, hook.y);

        fx.draw(g);

        // day clock and spare lines, tension gauge during a fight
        const h24 = 6 + f0 * 15, hr = Math.floor(h24), label = `${hr % 12 || 12}:${String(Math.floor((h24 - hr) * 6)).padEnd(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
        g.text(label, 4, 12, night ? C.w : C.k);
        for (let i = 0; i < lines; i++) g.spr(S.spool, W - 10 - i * 8, 12);
        if (mode === 'fight') {
          const bx0 = 74, bw = 108;
          g.rect(bx0 - 2, 12, bw + 4, 11, C.k);
          g.rect(bx0, 14, bw * .82, 7, C.E); g.rect(bx0 + bw * .82, 14, bw * .18, 7, C.R);
          const col = tension > .82 ? C.r : tension < .08 ? C.c : C.l;
          g.rect(bx0, 14, Math.min(1, tension) * bw, 7, col);
          g.center(run ? 'IT RUNS! LET GO!' : tension < .08 ? 'SLACK! REEL!' : on.k.name, 26, run ? ((modeT & 8) ? C.r : C.w) : tension < .08 ? C.c : C.w);
        }
        if (card) {
          g.panel(64, 78, 128, 62);
          const s = card.k.s, sc = s.w > 24 ? 1 : 2;
          g.spr(s, 128 - s.w * sc / 2, 104 - s.h * sc / 2, false, sc);
          g.center(card.k.name, 86, C.y);
          g.center(`${card.lb.toFixed(1)} LB   +${card.pts}`, 126, C.w);
        }
      },

      bot() {
        if (mode === 'fight') return { a: tension < .6 && !run };
        if (mode !== 'free' || zap) return {};
        const hx = tip();
        let best2 = null, bv = 0;
        for (const f of fish) {
          if (f.jelly || f.fleeing || f.k.junk) continue;
          const v = (f.k.pts + 100) / (40 + Math.abs(f.x - hx) + Math.abs(f.y - hook.y) * .5);
          if (v > bv) { bv = v; best2 = f; }
        }
        if (!best2) return {};
        const m = mouth(best2), lead = m.x + best2.dir * best2.spd * 14;
        const out = { left: lead < hx - 3, right: lead > hx + 3 };
        if (m.y > hook.y + 3) out.down = true; else if (m.y < hook.y - 3) out.up = true;
        return out;
      },

      state: () => ({ mode, lines, caught, day, tension, best }),
    };

    function jelly() {
      const y0 = 110 + a.rand() * 70;
      return { jelly: true, k: { s: S.jelly }, x: 20 + a.rand() * (W - 50), y: y0, y0, phase: a.rand() * 6, fleeing: true, life: 1e9, dir: 1, spd: 0 };
    }
  },
};
