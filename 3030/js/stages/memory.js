// Track 20, "Memory Loss": HOLD ON. Concentration with a thief in it: flip cards to match the
// pairs of memories from the whole album, while the Bank's recall beam keeps swapping face-down
// cards behind your back (you see it coming, so you can follow them) and the edges go dark.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, ball, sky, stars, perisphere, mix, rampAt, dith } from '../gfx.js';
import { text } from '../font.js';
import { blob, HEART, VINYL } from '../art.js';
import { topBar, Particles, Pops, banner } from '../hud.js';

const CW = 36, CH = 42, GAP = 6;
const ROUNDS = [
  { cols: 4, rows: 3, time: 55, wipe: 13, swaps: 1 },
  { cols: 4, rows: 4, time: 75, wipe: 11, swaps: 2 },
  { cols: 5, rows: 4, time: 95, wipe: 9, swaps: 2 },
];
const NAMES = ['MECH', 'VINYL', 'HEART', 'MIC', 'FAIR', 'STAR', 'PLANET', 'CLOCK', 'SHIP', 'NOVA', 'GOGGLES', 'BELT', 'DISH', 'HOURGLASS'];

// 24x24 memory icons, drawn once.
let ICONS = null;
function icons() {
  if (ICONS) return ICONS;
  const mk = f => { const [c, g] = canvas(24, 24); f(g); return c; };
  ICONS = [
    mk(g => { blob(g, [{ x: 12, y: 9, rx: 8, ry: 6, h: 6 }], RAMP.steel, { rim: P.orange }); rect(g, 14, 6, 4, 2, P.cyan); for (const x of [8, 15]) { rect(g, x, 14, 2, 7, P.s2); rect(g, x - 2, 21, 6, 2, P.s1); } }),
    mk(g => { g.drawImage(VINYL, 0, 0, 16, 16, 2, 2, 20, 20); }),
    mk(g => { g.drawImage(HEART, 0, 0, HEART.width, HEART.height, 3, 4, 18, 16); }),
    mk(g => { blob(g, [{ x: 12, y: 8, rx: 6, ry: 6, h: 6 }], RAMP.steel, { rim: P.white }); for (let y = 4; y < 13; y += 2) rect(g, 7, y, 10, 1, P.s1); rect(g, 11, 14, 3, 6, P.s2); rect(g, 7, 20, 11, 2, P.s1); }),
    mk(g => { g.drawImage(perisphere(7, RAMP.steel, P.cyan), 0, 0); }),
    mk(g => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.5 : 10; pts.push([12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]); } poly(g, pts, P.gold2); poly(g, pts.slice(0, 5).concat([[12, 12]]), P.gold3); }),
    mk(g => { ball(g, 12, 12, 7, 7, [P.ink, P.blood, P.red, P.orange, P.amber]); for (let x = 1; x < 23; x++) { const y = 13 + (x - 12) * 0.25; if (Math.abs(x - 12) > 6 || y > 13) px(g, x, y, P.cream); } }),
    mk(g => { ellipse(g, 12, 12, 10.5, 10.5, P.gold0); ellipse(g, 12, 12, 9.5, 9.5, P.gold2); ellipse(g, 12, 12, 7.5, 7.5, P.white); for (let i = 0; i < 12; i++) px(g, 12 + Math.cos(i * 0.5236) * 6, 12 + Math.sin(i * 0.5236) * 6, P.s2); line(g, 12, 12, 12, 6, P.ink); line(g, 12, 12, 16, 13, P.red); px(g, 12, 12, P.ink); px(g, 9, 8, P.gold3); }),
    mk(g => { blob(g, [{ x: 13, y: 12, rx: 10, ry: 4, h: 4 }, { x: 14, y: 9, rx: 4, ry: 3, h: 3, z: 3 }], RAMP.steel, { rim: P.orange }); rect(g, 1, 11, 3, 3, P.cyan); poly(g, [[7, 14], [12, 14], [5, 20]], P.s1); }),
    mk(g => { blob(g, [{ x: 12, y: 13, rx: 9, ry: 10, h: 8 }], [P.ink, P.navy, P.violet, P.purple, P.pink]); blob(g, [{ x: 12, y: 13, rx: 6, ry: 7, h: 6, z: 3 }], RAMP.skinM); rect(g, 9, 12, 2, 1, P.ink); rect(g, 13, 12, 2, 1, P.ink); rect(g, 10, 16, 4, 1, P.red); }),
    mk(g => { rect(g, 2, 10, 20, 3, P.brown1); for (const x of [7, 17]) { ellipse(g, x, 11, 5, 5, P.gold1); ellipse(g, x, 11, 3.5, 3.5, P.teal); px(g, x - 1, 10, P.ice); } }),
    mk(g => { rect(g, 1, 8, 22, 9, P.brown1); rect(g, 1, 9, 22, 1, P.brown3); ball(g, 12, 12, 6, 6, RAMP.gold); text(g, '1', 11, 9, P.blood); }),
    mk(g => { ellipse(g, 11, 10, 8, 8, P.s3); ellipse(g, 11, 10, 6, 6, P.s1); line(g, 11, 10, 18, 3, P.s4); rect(g, 10, 17, 3, 5, P.s2); for (let i = 0; i < 3; i++) ring(g, 18, 3, 3 + i * 2, P.cyan); }),
    mk(g => { rect(g, 6, 3, 12, 2, P.gold2); rect(g, 6, 19, 12, 2, P.gold2); poly(g, [[7, 5], [17, 5], [12, 12]], '#46507a'); poly(g, [[12, 12], [17, 19], [7, 19]], '#46507a'); poly(g, [[9, 15], [15, 15], [17, 19], [7, 19]], P.amber); px(g, 12, 13, P.amber); }),
  ];
  return ICONS;
}
let BACK = null;
function cardBack() {
  if (BACK) return BACK;
  const [c, g] = canvas(CW, CH);
  rect(g, 0, 0, CW, CH, P.navy);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if ((x + y) % 6 === 0) px(g, x, y, P.indigo);
  rect(g, 2, 2, CW - 4, 1, P.gold1); rect(g, 2, CH - 3, CW - 4, 1, P.gold1); rect(g, 2, 2, 1, CH - 4, P.gold1); rect(g, CW - 3, 2, 1, CH - 4, P.gold1);
  ellipse(g, CW / 2, CH / 2, 9, 9, P.gold1); ellipse(g, CW / 2, CH / 2, 7, 7, P.cream);
  line(g, CW / 2, CH / 2, CW / 2, CH / 2 - 5, P.ink); line(g, CW / 2, CH / 2, CW / 2 + 4, CH / 2, P.ink);
  return (BACK = c);
}

export default {
  id: 'memory', track: 20, song: 'memory', name: 'Memory Loss', title: 'HOLD ON',
  blurb: 'The Bank is repossessing your memories. Match the pairs before time runs out. When the recall beam flashes, watch the red cards: they trade places.',
  how: ['◀▲▼▶ CURSOR', 'Ⓐ FLIP A CARD', 'MATCH THE PAIRS', 'WATCH THE SWAPS'],
  par: [2500, 4200, 5600, 6800],
  make(ctx) {
    const R = ctx.rng, IC = icons(), parts = Particles(), pops = Pops();
    let round = -1, cards = [], cols = 0, rows = 0, x0 = 0, y0 = 0, time = 0, maxTime = 1;
    let cur = 0, open = [], resolveT = 0, wipeT = 0, wipeWarn = 0, swapping = [], intro = 0, t = 0;
    let score = 0, streak = 0, matches = 0, misses = 0, swapsSeen = 0, done = false, cleared = 0;
    const seen = new Map();                         // bot memory: card id -> icon
    let botTarget = -1, botCool = 0;

    function deal(r) {
      round = r; const cfg = ROUNDS[r];
      cols = cfg.cols; rows = cfg.rows;
      const n = cols * rows, kinds = [];
      const pool = [...Array(IC.length).keys()];
      for (let i = pool.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      for (let i = 0; i < n / 2; i++) kinds.push(pool[i], pool[i]);
      for (let i = kinds.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      cards = kinds.map((k, i) => ({ id: r * 100 + i, k, flip: 0, to: 0, done: false, glow: 0 }));
      const tw = cols * CW + (cols - 1) * GAP, th = rows * CH + (rows - 1) * GAP;
      x0 = Math.round((W - tw) / 2); y0 = Math.round(18 + (200 - th) / 2);
      time = maxTime = cfg.time; wipeT = cfg.wipe; wipeWarn = 0; open = []; cur = 0; intro = 1.6; swapping = []; seen.clear();
    }
    const pos = i => [x0 + (i % cols) * (CW + GAP), y0 + Math.floor(i / cols) * (CH + GAP)];
    deal(0);

    function flipUp(i) {
      const c = cards[i];
      if (c.done || c.to === 1 || swapping.length || (open.length === 2 && resolveT > 0)) return;
      if (open.length === 2) { for (const j of open) cards[j].to = 0; open = []; }
      c.to = 1; open.push(i); seen.set(c.id, c.k); ctx.sfx('flip');
      if (open.length === 2) resolveT = 0.32;
    }
    function startWipe() {
      const down = cards.map((c, i) => i).filter(i => !cards[i].done && cards[i].to === 0 && !open.includes(i));
      if (down.length < 2) return;
      const n = Math.min(ROUNDS[round].swaps, Math.floor(down.length / 2));
      for (let i = down.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [down[i], down[j]] = [down[j], down[i]]; }
      swapping = [];
      for (let k = 0; k < n; k++) swapping.push([down[k * 2], down[k * 2 + 1]]);
      wipeWarn = 1.1;
      for (const [a, b] of swapping) { cards[a].glow = 1; cards[b].glow = 1; }
      ctx.sfx('alarm');
    }

    const inst = {
      result: null,
      update(dt) {
        t += dt;
        parts.update(dt); pops.update(dt);
        if (done) return;
        if (intro > 0) { intro -= dt; return; }
        time -= dt;
        for (const c of cards) { c.flip += Math.sign(c.to - c.flip) * Math.min(Math.abs(c.to - c.flip), dt * 7); c.glow = Math.max(0, c.glow - dt * 0.2); }
        if (time <= 0) { time = 0; done = true; ctx.sfx('glitch'); inst.result = { win: false, score, lines: lines('THE MEMORIES SLIPPED AWAY') }; return; }
        // The recall: warn, then swap, animated.
        if (wipeWarn > 0) {
          wipeWarn -= dt;
          if (wipeWarn <= 0) {
            for (const [a, b] of swapping) { [cards[a], cards[b]] = [cards[b], cards[a]]; cards[a].slide = { from: b, t: 0 }; cards[b].slide = { from: a, t: 0 }; }
            swapsSeen += swapping.length; swapping = []; ctx.sfx('glitch'); ctx.shake(2);
          }
        } else {
          wipeT -= dt;
          if (wipeT <= 0) { wipeT = ROUNDS[round].wipe; startWipe(); }
        }
        for (const c of cards) if (c.slide) { c.slide.t += dt * 2.5; if (c.slide.t >= 1) c.slide = null; }
        // Cursor.
        const cx = cur % cols, cy = Math.floor(cur / cols);
        if (ctx.I.rep('left')) { cur = cy * cols + (cx + cols - 1) % cols; ctx.sfx('move'); }
        if (ctx.I.rep('right')) { cur = cy * cols + (cx + 1) % cols; ctx.sfx('move'); }
        if (ctx.I.rep('up')) { cur = ((cy + rows - 1) % rows) * cols + cx; ctx.sfx('move'); }
        if (ctx.I.rep('down')) { cur = ((cy + 1) % rows) * cols + cx; ctx.sfx('move'); }
        if (ctx.I.hit('a') && !swapping.length) flipUp(cur);
        // Two open: match or not.
        if (open.length === 2 && resolveT > 0) {
          resolveT -= dt;
          if (resolveT <= 0) {
            const [a, b] = open, A = cards[a], B = cards[b];
            if (A.k === B.k) {
              A.done = B.done = true; open = []; streak++; matches++;
              const pts = 100 + (streak - 1) * 40; score += pts;
              for (const i of [a, b]) { const [px0, py0] = pos(i); parts.burst(px0 + CW / 2, py0 + CH / 2, 12, [P.amber, P.cream, P.pink], 70); }
              pops.add('+' + pts, pos(b)[0] + CW / 2, pos(b)[1], P.amber);
              ctx.sfx(streak > 1 ? 'perfect' : 'good');
              if (cards.every(c => c.done)) {
                cleared++;
                const bonus = Math.round(time) * 15; score += bonus;
                pops.add('TIME +' + bonus, W / 2, 110, P.lime, 1.3);
                ctx.sfx('win'); ctx.flash(0.5);
                if (round + 1 < ROUNDS.length) deal(round + 1);
                else { done = true; inst.result = { win: true, score, lines: lines('YOU HELD ON TO ALL OF IT') }; }
              }
            } else { streak = 0; misses++; resolveT = -0.7; ctx.sfx('miss'); }
          }
        } else if (open.length === 2 && resolveT < 0) {
          resolveT += dt;
          if (resolveT >= 0) { for (const j of open) cards[j].to = 0; open = []; }
        }
      },
      draw(g) {
        // A soft violet dream, darkening at the edges as time runs out.
        sky(g, 0, H, [P.ink, P.deep, P.navy, P.indigo, P.violet]);
        stars(g, t, { n: 50, seed: 44, drift: t * 6, cols: [P.s1, P.s2, P.pink] });
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          let [x, y] = pos(i);
          if (c.slide) { const [fx, fy] = pos(c.slide.from), k = c.slide.t, e = k * k * (3 - 2 * k); x = fx + (x - fx) * e; y = fy + (y - fy) * e - Math.sin(k * Math.PI) * 10; }
          const f = c.flip, wd = Math.max(2, Math.round(CW * Math.abs(1 - 2 * f)));
          const dx = Math.round(x + (CW - wd) / 2), dy = Math.round(y);
          rect(g, dx + 2, dy + 3, wd, CH, P.ink);
          if (f < 0.5) {
            g.drawImage(cardBack(), dx, dy, wd, CH);
            if (c.glow > 0 && (t * 10 | 0) % 2) { g.globalAlpha = 0.6; rect(g, dx, dy, wd, CH, P.red); g.globalAlpha = 1; }
          } else {
            rect(g, dx, dy, wd, CH, c.done ? '#fff4d6' : P.cream);
            rect(g, dx, dy, wd, 2, P.white); rect(g, dx, dy + CH - 2, wd, 2, P.tan);
            if (wd > 8) g.drawImage(IC[c.k], dx + Math.round((wd - 24) / 2), dy + 8, Math.min(24, wd), 24);
            if (c.done && wd > 20) text(g, NAMES[c.k].slice(0, 6), dx + wd / 2, dy + 33, P.brown2, { align: 'center' });
          }
          if (i === cur && !done) {
            const k = (t * 4 | 0) % 2 ? 1 : 0;
            rect(g, x - 2 - k, y - 2 - k, CW + 4 + k * 2, 1, P.amber); rect(g, x - 2 - k, y + CH + 1 + k, CW + 4 + k * 2, 1, P.amber);
            rect(g, x - 2 - k, y - 2 - k, 1, CH + 4 + k * 2, P.amber); rect(g, x + CW + 1 + k, y - 2 - k, 1, CH + 4 + k * 2, P.amber);
          }
        }
        // Memory loss: darkness creeps in from the edges as the clock drains.
        const loss = 1 - time / maxTime;
        if (loss > 0.25) {
          const reach = (loss - 0.25) * 70;
          g.fillStyle = P.ink;
          for (let y = 14; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            const e = Math.min(x, W - x, y - 14, H - y);
            if (e < reach && dith(x >> 1, y >> 1, 1 - e / reach)) g.fillRect(x, y, 2, 2);
          }
        }
        if (wipeWarn > 0) { g.globalAlpha = 0.25 * ((t * 8 | 0) % 2); rect(g, 0, 13, W, H, P.red); g.globalAlpha = 1; text(g, 'RECALL BEAM! WATCH THE RED CARDS', W / 2, 206, P.red, { align: 'center', shadow: P.ink }); }
        parts.draw(g); pops.draw(g);
        topBar(g, 'MEMORY LOSS', score, `ROUND ${round + 1}/3`);
        rect(g, 0, 13, W, 3, P.ink); rect(g, 0, 13, W * time / maxTime, 2, time / maxTime < 0.25 ? P.red : P.pink);
        if (intro > 0) banner(g, round === 0 ? 'HOLD ON' : `MEMORY ${round + 1}/3`, 98, P.pink);
      },
      // Bot: perfect memory (it watches the swaps too).
      auto() {
        if (done || intro > 0 || swapping.length || (open.length === 2)) return [];
        botCool -= 1 / 60;
        if (botCool > 0) return [];
        const known = new Map();
        cards.forEach((c, i) => { if (!c.done && seen.has(c.id) && !open.includes(i)) { const l = known.get(c.k) || []; l.push(i); known.set(c.k, l); } });
        if (botTarget < 0 || cards[botTarget].done || open.includes(botTarget)) {
          botTarget = -1;
          if (open.length === 1) {
            const k = cards[open[0]].k, l = (known.get(k) || []).filter(i => i !== open[0]);
            botTarget = l.length ? l[0] : cards.findIndex((c, i) => !c.done && !seen.has(c.id) && !open.includes(i));
          } else {
            for (const [, l] of known) if (l.length >= 2) { botTarget = l[0]; break; }
            if (botTarget < 0) botTarget = cards.findIndex(c => !c.done && !seen.has(c.id));
            if (botTarget < 0) botTarget = cards.findIndex(c => !c.done);
          }
        }
        if (botTarget < 0) return [];
        const tx = botTarget % cols, ty = Math.floor(botTarget / cols), cx = cur % cols, cy = Math.floor(cur / cols);
        botCool = 0.12;
        if (tx < cx) return ['left']; if (tx > cx) return ['right']; if (ty < cy) return ['up']; if (ty > cy) return ['down'];
        botTarget = -1; botCool = 0.2;
        return ['a'];
      },
    };
    function lines(msg) { return [msg, `PAIRS MATCHED ${matches}`, `ROUNDS CLEARED ${cleared}/3`, `MISMATCHES ${misses}`, `CARDS SWAPPED ${swapsSeen * 2}`]; }
    return inst;
  },
};
