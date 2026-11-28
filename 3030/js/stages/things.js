// THINGS YOU CAN DO / CALIBRATION GAUNTLET: a microgame gauntlet in the Automator's lab.
// One word tells you what to do, a fuse tells you how long you have. Clear 16 with 4 lives;
// every 4 clears the tempo (and the song) goes up.
import { W, H, P, RAMP, rect, px, line, ellipse, ring, poly, sky, stars, mix, rampAt, dith, bake, blitFeet, spr, skyline, drawStrip } from '../gfx.js';
import { text, measure } from '../font.js';
import { blob, bust, CAST, DELTRON } from '../art.js';
import { topBar, hearts, Pops, Particles } from '../hud.js';
import { getSong } from '../songs.js';

const GOAL = 16, LIVES = 4, BASE_BPM = 96;
const SPEED = [1, 0.88, 0.76, 0.66];
const FLOOR = 196;
const ARROWS = ['up', 'down', 'left', 'right'];
const GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶' };
// A clean big arrow: shaft plus head, pointing dir, s = half size.
function bigArrow(g, cx, cy, dir, s, col, edge = P.ink) {
  const R = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const tr = (u, v) => [cx + R[0] * u - R[1] * v, cy + R[1] * u + R[0] * v];
  const pts = [tr(s, 0), tr(0, s), tr(0, s * 0.42), tr(-s, s * 0.42), tr(-s, -s * 0.42), tr(0, -s * 0.42), tr(0, -s)];
  const o = Math.max(1, Math.round(s / 10));
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) poly(g, pts.map(([x, y]) => [x + dx, y + dy]), edge);
  poly(g, pts, col);
}

// ----------------------------------------------------------------- sprites
const BRICK = spr(`
rrrrrrrkrrrrrrr
RRRRRRRkRRRRRRR
RRRRRRRkRRRRRRR
kkkkkkkkkkkkkkk
rrrkrrrrrrrkrrr
RRRkRRRRRRRkRRR
RRRkRRRRRRRkRRR
`, { r: '#ff6a5e', R: P.red, k: P.blood }, { outline: true });
const BOOMBOX = spr(`
....hhhhhhhhhhhh....
....h..........h....
kkkkkkkkkkkkkkkkkkkk
kSSSSSkcccccckSSSSSk
SsssssSkyyyykSsssssS
SsKKKsSkkkkkkSsKKKsS
SsKwKsSkbbbbkSsKwKsS
SsKKKsSkbbbbkSsKKKsS
SsssssSkkkkkkSsssssS
kSSSSSkkkkkkkkSSSSSk
kkkkkkkkkkkkkkkkkkkk
`, { h: P.s2, k: P.s0, S: P.s2, s: P.s1, K: P.ink, w: P.s3, c: P.cyan, y: P.amber, b: P.magenta }, { outline: true });

const DRONE = bake('things:drone', 30, 18, g => {
  blob(g, [{ x: 15, y: 10, rx: 9, ry: 6, h: 6 }], RAMP.steel, { rim: P.cyan });
  rect(g, 1, 4, 10, 1, P.s3); rect(g, 19, 4, 10, 1, P.s3);
  rect(g, 5, 4, 2, 3, P.s1); rect(g, 23, 4, 2, 3, P.s1);
  rect(g, 12, 10, 6, 3, P.ink); rect(g, 14, 11, 2, 1, P.red);
});

// ----------------------------------------------------------------- scenery
function room(g, wall, line2, floor) {
  rect(g, 0, 13, W, FLOOR - 13, wall);
  for (let x = 0; x < W; x += 16) rect(g, x, 13, 1, FLOOR - 13, line2);
  for (let y = 13; y < FLOOR; y += 16) rect(g, 0, y, W, 1, line2);
  rect(g, 0, FLOOR, W, H - FLOOR, floor); rect(g, 0, FLOOR, W, 1, mix(floor, P.white, 0.25));
  for (let x = 0; x < W; x += 24) rect(g, x, FLOOR + 3, 12, 1, mix(floor, P.ink, 0.3));
}
function deltron(g, x, y, moving, flip, t, jump = false) {
  const f = jump ? DELTRON[3] : moving ? DELTRON[1 + ((t * 8 | 0) % 2)] : DELTRON[0];
  ellipse(g, x, FLOOR + 1, 8, 2, mix(P.ink, P.s0, 0.5));
  blitFeet(g, f, x, y, flip);
}

// ----------------------------------------------------------------- microgames
// Each returns { cmd, dur, timeout: 'win'|'lose', update(dt, I, t) -> 'win'|'lose'|undefined, draw(g, t), auto(t) }.
const GAMES = {
  mash(ctx, L) {
    const dur = 4 * SPEED[L], need = Math.round(dur * (3.4 + 0.4 * L));
    let fill = 0, bounce = 0, tog = false;
    const rings = [];
    return {
      cmd: 'MASH!', cmdY: 64, dur, timeout: 'lose',
      update(dt, I) {
        if (I.hit('a')) { fill += 1 / need; bounce = 1; rings.push(0); ctx.sfx('tick'); }
        fill = Math.max(0, fill - 0.1 * dt); bounce *= Math.pow(0.001, dt);
        for (let i = rings.length - 1; i >= 0; i--) { rings[i] += dt; if (rings[i] > 0.5) rings.splice(i, 1); }
        if (fill >= 1) { ctx.sfx('power'); ctx.flash(0.4); return 'win'; }
      },
      draw(g, t) {
        rect(g, 0, 13, W, H - 13, '#1d1430');
        for (let y = 13; y < FLOOR; y += 8) for (let x = ((y >> 3) % 2) * 8; x < W; x += 16) { rect(g, x, y, 8, 8, '#271b40'); px(g, x + 2, y + 2, '#33245a'); }
        rect(g, 0, FLOOR, W, H - FLOOR, '#120c1e');
        const cx = 110, cy = 92 - bounce * 4;
        for (const r of rings) { g.globalAlpha = 1 - r / 0.5; ring(g, cx, cy, 20 + r * 120, P.magenta); g.globalAlpha = 1; }
        rect(g, cx - 1, cy + 22, 3, FLOOR - cy - 22, P.s2); rect(g, cx - 14, FLOOR - 4, 29, 4, P.s1);
        blob(g, [{ x: cx, y: cy, rx: 16, ry: 22, h: 14 }], RAMP.steel, { rim: P.magenta });
        for (let y = cy - 18; y < cy + 6; y += 3) for (let x = cx - 12; x < cx + 13; x += 3) if (((x - cx) / 13) ** 2 + ((y - cy + 4) / 20) ** 2 < 1) px(g, x, y, P.s0);
        rect(g, cx - 16, cy + 6, 33, 5, P.s1); rect(g, cx - 16, cy + 6, 33, 1, P.s3);
        // Level meter.
        const mx = 176, segs = 14;
        rect(g, mx - 3, 34, 30, segs * 10 + 6, P.ink);
        for (let i = 0; i < segs; i++) {
          const on = fill * segs > i, c = i > 10 ? P.red : i > 7 ? P.amber : P.lime;
          rect(g, mx, 37 + (segs - 1 - i) * 10, 24, 8, on ? c : mix(c, P.ink, 0.8));
          if (on) rect(g, mx, 37 + (segs - 1 - i) * 10, 24, 1, mix(c, P.white, 0.5));
        }
        text(g, 'MIC', mx + 12, 26, P.s3, { align: 'center' });
        if ((t * 6 | 0) % 2) text(g, 'Ⓐ Ⓐ Ⓐ', cx, FLOOR + 3, P.cream, { align: 'center' });
      },
      auto() { tog = !tog; return tog ? ['a'] : []; },
    };
  },

  catch(ctx, L) {
    const R = ctx.rng, dur = 4 * SPEED[L], fallT = dur * 0.78;
    let x = 40 + R() * 176, y = 22, vx = (R() < 0.5 ? -1 : 1) * (25 + R() * (20 + 18 * L));
    const vy = (180 - 22) / fallT, sp = 150 + 15 * L;
    let p = 128 + (R() * 2 - 1) * 60, flip = false, moving = false, got = false;
    const landX = () => { let lx = x, lv = vx; let ty = (180 - y) / vy; for (let i = 0; i < 200 && ty > 0; i++) { const st = Math.min(0.02, ty); lx += lv * st; if (lx < 16 || lx > 240) lv = -lv; ty -= st; } return lx; };
    return {
      cmd: 'CATCH!', cmdY: 96, dur, timeout: 'lose',
      update(dt, I) {
        if (got) return;
        const [ax] = I.axis(); moving = ax !== 0; if (ax) flip = ax < 0;
        p = Math.max(16, Math.min(240, p + ax * sp * dt));
        x += vx * dt; y += vy * dt;
        if (x < 16 || x > 240) { vx = -vx; x = Math.max(16, Math.min(240, x)); }
        if (y >= 172 && Math.abs(x - p) < 14) { got = true; ctx.sfx('coin'); return 'win'; }
        if (y > 190) { ctx.sfx('brick'); return 'lose'; }
      },
      draw(g, t) {
        room(g, '#2a5a66', '#336c7a', '#5a4034');
        for (let x = 20; x < W; x += 60) { rect(g, x, 30, 30, 20, '#1d4650'); rect(g, x + 2, 32, 26, 16, '#3fd0d822'); }
        deltron(g, p, FLOOR, moving, flip, t);
        const vxp = got ? p : x, vyp = got ? FLOOR - 30 : y;
        const w = got ? 7 : Math.max(1, Math.abs(Math.cos(t * 9)) * 7.5);
        ellipse(g, vxp, vyp, w + 1, 8.5, P.cream); ellipse(g, vxp, vyp, w, 7.5, P.ink); if (w > 3) { ellipse(g, vxp, vyp, w * 0.7, 5, '#2e2a44'); ellipse(g, vxp, vyp, w * 0.38, 2.8, P.amber); px(g, vxp - w * 0.5, vyp - 4, P.s3); }
        if (!got) { const s = Math.max(2, 9 - (180 - y) / 20); ellipse(g, x, FLOOR + 1, s, 1.5, '#241a18'); }
      },
      auto() { if (got) return []; const tx = landX(); return Math.abs(tx - p) > 3 ? [tx < p ? 'left' : 'right'] : []; },
    };
  },

  dodge(ctx, L) {
    const R = ctx.rng, dur = 4 * SPEED[L], every = 0.42 * SPEED[L] + 0.06, grav = 420 + 60 * L, sp = 150 + 15 * L;
    let p = 128, flip = false, moving = false, spawnT = 0.15;
    const bricks = [], dust = Particles();
    return {
      cmd: 'DODGE!', cmdY: 96, dur, timeout: 'win',
      update(dt, I, t) {
        const [ax] = I.axis(); moving = ax !== 0; if (ax) flip = ax < 0;
        p = Math.max(14, Math.min(242, p + ax * sp * dt));
        spawnT -= dt;
        if (spawnT <= 0 && t < dur - 0.6) { spawnT = every; const near = R() < 0.55; bricks.push({ x: Math.max(14, Math.min(242, near ? p + (R() * 2 - 1) * 26 : 14 + R() * 228)), y: 8, vy: 0 }); }
        dust.update(dt);
        for (let i = bricks.length - 1; i >= 0; i--) {
          const b = bricks[i]; b.vy += grav * dt; b.y += b.vy * dt;
          if (b.y + 8 >= FLOOR - 24 && b.y < FLOOR && Math.abs(b.x - p) < 12) { ctx.sfx('hurt'); ctx.shake(4); return 'lose'; }
          if (b.y >= FLOOR - 8) { dust.burst(b.x, FLOOR - 2, 8, [P.red, P.blood, P.tan], 50, 0.4, 200); ctx.sfx('brick', 0.6); bricks.splice(i, 1); }
        }
      },
      draw(g, t) {
        room(g, '#2a1a12', '#331f15', '#4a3a30');
        for (let x = 8; x < W; x += 40) { rect(g, x, 13, 24, 6, P.s1); rect(g, x + 2, 19, 20, 2, P.ink); }
        for (const b of bricks) { const s = Math.max(2, 9 - (FLOOR - b.y) / 18); ellipse(g, b.x, FLOOR + 1, s, 1.5, '#2a1e18'); }
        deltron(g, p, FLOOR, moving, flip, t);
        for (const b of bricks) g.drawImage(BRICK, Math.round(b.x - 8), Math.round(b.y));
        dust.draw(g);
      },
      auto() {
        const danger = x => { let d = 0; for (const b of bricks) { const tt = Math.max(0, ((FLOOR - 26) - b.y) / Math.max(40, b.vy + 1)); if (tt < 0.75 && Math.abs(b.x - x) < 22) d += 1 / (0.05 + tt); } return d; };
        let best = p, bs = danger(p) + 0.001;
        for (let x = 14; x <= 242; x += 6) { const s = danger(x) + Math.abs(x - p) * 0.004; if (s < bs) { bs = s; best = x; } }
        return Math.abs(best - p) > 3 ? [best < p ? 'left' : 'right'] : [];
      },
    };
  },

  stop(ctx, L) {
    const R = ctx.rng, dur = 4 * SPEED[L], w = 2.3 + 0.45 * L, ph = R() * 6.28;
    const c = (R() * 2 - 1) * 0.55, hw = 0.17 - 0.02 * L;
    let a = 0, done = false;
    const ang = v => -Math.PI / 2 + v * 1.05;
    return {
      cmd: 'STOP!', cmdY: 22, dur, timeout: 'lose',
      update(dt, I, t) {
        if (done) return;
        a = Math.sin(t * w + ph);
        if (I.hit('a')) { done = true; if (Math.abs(a - c) <= hw) { ctx.sfx('lock'); return 'win'; } ctx.sfx('miss'); return 'lose'; }
      },
      draw(g) {
        rect(g, 0, 13, W, H - 13, '#2a1810');
        for (let y = 13; y < H; y += 6) rect(g, 0, y, W, 1, '#331e14');
        const cx = 128, cy = 168, r = 96;
        rect(g, 22, 50, 212, 140, P.brown2); rect(g, 22, 50, 212, 2, P.brown3);
        rect(g, 30, 58, 196, 124, P.cream); rect(g, 30, 58, 196, 1, P.white);
        for (let v = -1; v <= 1.0001; v += 0.02) {
          const an = ang(v), inZone = Math.abs(v - c) <= hw, red = v > 0.72;
          for (let k = 0; k < 6; k++) px(g, cx + Math.cos(an) * (r - 18 + k), cy + Math.sin(an) * (r - 18 + k), inZone ? P.green : red ? P.red : P.s1);
        }
        for (let v = -1; v <= 1.0001; v += 0.2) { const an = ang(v); line(g, cx + Math.cos(an) * (r - 26), cy + Math.sin(an) * (r - 26), cx + Math.cos(an) * (r - 20), cy + Math.sin(an) * (r - 20), P.ink); }
        text(g, 'VU', cx, 140, P.brown1, { align: 'center', scale: 2 });
        const an = ang(a);
        line(g, cx, cy, cx + Math.cos(an) * (r - 10), cy + Math.sin(an) * (r - 10), P.ink);
        line(g, cx + 1, cy, cx + 1 + Math.cos(an) * (r - 10), cy + Math.sin(an) * (r - 10), P.blood);
        ellipse(g, cx, cy, 6, 6, P.s1); ellipse(g, cx - 1, cy - 1, 2, 2, P.s3);
        rect(g, 30, 168, 196, 14, P.brown1);
      },
      auto() { return !done && Math.abs(a - c) < hw * 0.35 ? ['a'] : []; },
    };
  },

  aim(ctx, L) {
    const R = ctx.rng, dur = 4.4 * SPEED[L], k = 0.9 + 0.25 * L, p1 = R() * 6.28, p2 = R() * 6.28, sp = 165 + 15 * L;
    let cx = 128, cy = 120, cd = 0, dx = 0, dy = 0, boom = 0, tog = false;
    const pos = t => [128 + 88 * Math.sin(t * 0.9 * k + p1), 100 + 50 * Math.sin(t * 1.35 * k + p2)];
    const fx = Particles();
    return {
      cmd: 'AIM!', cmdY: 160, dur, timeout: 'lose',
      update(dt, I, t) {
        fx.update(dt);
        if (boom) { boom += dt; return; }
        [dx, dy] = pos(t);
        const [ax, ay] = I.axis();
        cx = Math.max(8, Math.min(248, cx + ax * sp * dt)); cy = Math.max(24, Math.min(200, cy + ay * sp * dt));
        cd -= dt;
        if (I.hit('a') && cd <= 0) {
          cd = 0.2; ctx.sfx('shoot');
          if (Math.hypot(cx - dx, cy - dy) < 11) { boom = 0.001; ctx.sfx('boom'); ctx.shake(3); fx.burst(dx, dy, 24, [P.amber, P.orange, P.red, P.white], 90, 0.7, 60); return 'win'; }
        }
      },
      draw(g, t) {
        sky(g, 13, FLOOR - 13, [P.ink, P.deep, P.navy, P.indigo]);
        stars(g, t, { n: 30, seed: 21, y0: 14, y1: 120 });
        drawStrip(g, skyline(31, 60, P.deep, P.violet), t * 6, 140);
        rect(g, 0, FLOOR, W, H - FLOOR, P.ink);
        rect(g, 0, 13, W, 4, P.s1); rect(g, 0, FLOOR - 4, W, 4, P.s1);
        if (!boom) { g.drawImage(DRONE, Math.round(dx - 15), Math.round(dy - 10)); const rot = (t * 30 | 0) % 2; rect(g, Math.round(dx - 14 + rot * 2), Math.round(dy - 7), 8, 1, P.s4); rect(g, Math.round(dx + 6 - rot * 2), Math.round(dy - 7), 8, 1, P.s4); }
        fx.draw(g);
        const c = cd > 0 ? P.amber : P.red;
        ring(g, cx + 0.5, cy + 0.5, 9.5, c); rect(g, cx - 13, cy, 7, 1, c); rect(g, cx + 7, cy, 7, 1, c); rect(g, cx, cy - 13, 1, 7, c); rect(g, cx, cy + 7, 1, 7, c); px(g, cx, cy, c);
      },
      auto(t) {
        if (boom) return [];
        const [tx, ty] = pos(t + 0.08), out = [];
        if (tx < cx - 2) out.push('left'); else if (tx > cx + 2) out.push('right');
        if (ty < cy - 2) out.push('up'); else if (ty > cy + 2) out.push('down');
        tog = !tog;
        if (Math.hypot(cx - dx, cy - dy) < 7 && cd <= 0 && tog) out.push('a');
        return out;
      },
    };
  },

  jump(ctx, L) {
    const dur = 4 * SPEED[L], p = 62, v = (280 - p) / (dur * 0.55);
    let bx = 280, y = FLOOR, vy = 0, air = false, passed = false;
    const notes = [];
    return {
      cmd: 'JUMP!', cmdY: 70, dur, timeout: 'win',
      update(dt, I, t) {
        if (I.hit('a') && !air) { vy = -245; air = true; ctx.sfx('jump'); }
        if (air) { vy += 780 * dt; y += vy * dt; if (y >= FLOOR) { y = FLOOR; air = false; vy = 0; } }
        bx -= v * dt;
        if ((t * 5 | 0) !== ((t - dt) * 5 | 0)) notes.push({ x: bx, y: FLOOR - 18, t: 0 });
        for (const n of notes) { n.t += dt; n.y -= dt * 30; }
        if (!passed && Math.abs(bx - p) < 15 && y > FLOOR - 14) { ctx.sfx('hurt'); ctx.shake(4); return 'lose'; }
        if (!passed && bx < p - 18) { passed = true; ctx.sfx('coin'); return 'win'; }
      },
      draw(g, t) {
        room(g, '#1b1736', '#221d44', '#2b2340');
        for (let x = -((t * 120) % 32); x < W; x += 32) rect(g, x, FLOOR + 6, 16, 2, '#3a3058');
        deltron(g, p, y, !air, false, t, air);
        const wob = Math.round(Math.sin(t * 20) * 1);
        g.drawImage(BOOMBOX, Math.round(bx - 11), FLOOR - 13 + wob);
        for (const n of notes) if (n.t < 0.8) text(g, '♪', n.x, n.y, n.t < 0.4 ? P.amber : P.s2);
      },
      auto() { const tr = (bx - p) / v; return !air && tr < 0.3 && tr > 0 ? ['a'] : []; },
    };
  },

  press(ctx, L) {
    const R = ctx.rng, dur = 3 * SPEED[L], dir = ARROWS[R() * 4 | 0];
    let done = false, wrong = null;
    return {
      cmd: 'PRESS!', cmdY: 26, dur, timeout: 'lose',
      update(dt, I, t) {
        if (done || t < 0.15) return;
        for (const b of ARROWS) if (I.hit(b)) { done = true; if (b === dir) { ctx.sfx('good'); return 'win'; } wrong = b; ctx.sfx('miss'); return 'lose'; }
      },
      draw(g, t) {
        rect(g, 0, 13, W, H - 13, P.deep);
        for (let i = 6; i > 0; i--) { const s = ((i * 22 + t * 60) % 132); rect(g, 128 - s, 110 - s * 0.8, s * 2, s * 1.6, i % 2 ? P.navy : P.deep); }
        if (t < 0.15) return;
        const k = Math.min(1, (t - 0.15) * 8);
        rect(g, 128 - 40 * k, 110 - 40 * k, 80 * k, 80 * k, P.ink);
        if (k >= 1) bigArrow(g, 128, 110, dir, 30, wrong ? P.red : P.amber);
      },
      auto(t) { return t > 0.35 && !done ? [dir] : []; },
    };
  },

  sayit(ctx, L) {
    const R = ctx.rng, n = L >= 2 ? 4 : 3, dur = (3.4 + n * 0.35) * SPEED[L];
    const seq = Array.from({ length: n }, () => ARROWS[R() * 4 | 0]);
    let i = 0, bad = -1, last = 0, tog = false;
    return {
      cmd: 'SAY IT!', cmdY: 160, dur, timeout: 'lose',
      update(dt, I, t) {
        if (bad >= 0 || i >= n) return;
        for (const b of ARROWS) if (I.hit(b)) {
          if (b === seq[i]) { i++; ctx.sfx('blip'); ctx.sfx('move'); last = t; if (i >= n) { ctx.sfx('good'); return 'win'; } }
          else { bad = i; ctx.sfx('miss'); return 'lose'; }
          break;
        }
      },
      draw(g, t) {
        rect(g, 0, 13, W, H - 13, '#0d1a24');
        for (let x = 0; x < W; x += 12) rect(g, x, 13, 1, H - 13, '#14303c');
        g.drawImage(bust(CAST.automator, i < n && bad < 0 && (t * 8 | 0) % 2 === 0 && t < 0.8), 2, FLOOR - 104);
        const bw = 26 * n + 16, bx = 160 - bw / 2;
        rect(g, bx, 40, bw, 40, P.cream); rect(g, bx, 40, bw, 1, P.white); rect(g, bx, 79, bw, 1, P.tan);
        poly(g, [[bx + 8, 79], [bx + 22, 79], [bx - 6, 94]], P.cream);
        seq.forEach((d, k) => bigArrow(g, bx + 21 + k * 26, 60, d, 10, k < i ? P.green : k === bad ? P.red : P.navy, P.ink));
        for (let k = 0; k < n; k++) { const x = bx + 10 + k * 26; rect(g, x, 120, 22, 22, k < i ? P.green : k === bad ? P.red : P.s0); rect(g, x, 120, 22, 1, P.s2); if (k < i) bigArrow(g, x + 11, 131, seq[k], 8, P.white); }
        text(g, 'YOUR TURN', 160, 150, P.s3, { align: 'center' });
        void last;
      },
      auto(t) { tog = !tog; return tog && t > 0.3 && i < n && bad < 0 ? [seq[i]] : []; },
    };
  },

  tune(ctx, L) {
    const R = ctx.rng, dur = 4.5 * SPEED[L], need = 0.85 * Math.sqrt(SPEED[L]), k = 0.8 + 0.25 * L, ph = R() * 6.28, half = 12 - 1.5 * L;
    let y = R() < 0.5 ? 50 : 186, hold = 0, inBand = false;
    const band = t => 118 + 56 * Math.sin(t * k + ph);
    return {
      cmd: 'TUNE!', cmdY: 160, dur, timeout: 'lose',
      update(dt, I, t) {
        const [, ay] = I.axis();
        y = Math.max(34, Math.min(200, y + ay * 105 * dt));
        inBand = Math.abs(y - band(t)) <= half;
        if (inBand) hold += dt; else hold = Math.max(0, hold - dt * 0.6);
        if (inBand && (t * 10 | 0) !== ((t - dt) * 10 | 0)) ctx.sfx('blip');
        if (hold >= need) { ctx.sfx('perfect'); return 'win'; }
      },
      draw(g, t) {
        rect(g, 0, 13, W, H - 13, P.brown1);
        rect(g, 14, 24, 228, 182, P.brown2); rect(g, 14, 24, 228, 2, P.brown3);
        // Frequency scale.
        rect(g, 26, 30, 44, 172, P.ink);
        for (let yy = 34; yy <= 200; yy += 6) rect(g, 30, yy, (yy % 30 === 4) ? 14 : 7, 1, P.s2);
        const b = band(t);
        rect(g, 27, b - half, 42, half * 2, mix(P.green, P.ink, 0.45)); rect(g, 27, b - half, 42, 1, P.lime); rect(g, 27, b + half, 42, 1, P.lime);
        rect(g, 22, y - 1, 52, 3, P.red); rect(g, 22, y - 1, 52, 1, P.pink);
        // Scope.
        rect(g, 84, 38, 146, 108, '#031006'); rect(g, 84, 38, 146, 1, P.s1);
        const noise = Math.min(1, Math.abs(y - b) / 50);
        for (let x = 0; x < 146; x++) {
          const v = Math.sin(x * 0.18 + t * 12) * 22 * (1 - noise * 0.6) + (Math.sin(x * 1.7 + t * 50) * Math.sin(x * 0.31 - t * 31)) * 28 * noise;
          px(g, 84 + x, 92 + v, inBand ? P.lime : P.green);
        }
        g.globalAlpha = 0.2; for (let yy = 38; yy < 146; yy += 2) rect(g, 84, yy, 146, 1, P.ink); g.globalAlpha = 1;
        rect(g, 84, 160, 146, 10, P.ink); rect(g, 85, 161, Math.round(144 * Math.min(1, hold / need)), 8, inBand ? P.lime : P.green);
        text(g, inBand ? 'HOLD IT...' : 'FIND THE SIGNAL', 157, 178, inBand ? P.lime : P.s3, { align: 'center' });
      },
      auto(t) { const b = band(t + 0.05); return Math.abs(y - b) > 2.5 ? [b < y ? 'up' : 'down'] : []; },
    };
  },
};
const ORDER = Object.keys(GAMES);

const QUIPS_WIN = ['NICE.', 'CLEAN.', 'OKAY THEN.', 'AGAIN.', 'SMOOTH.', 'NOTED.', 'NOT BAD.'];
const QUIPS_LOSE = ['SLOPPY.', 'NOPE.', 'FOCUS!', 'OUCH.', 'TRY HARDER.'];

export default {
  id: 'things', track: 4, song: 'things', name: 'Things You Can Do', title: 'CALIBRATION GAUNTLET',
  blurb: 'The Automator wants to see what you can do. One word tells you what. The fuse tells you how long. Every four, it gets faster.',
  how: ['READ THE COMMAND', 'DO IT FAST', 'CLEAR 16 TESTS', '4 LIVES'],
  par: [0, 3300, 3700, 4000],
  make(ctx) {
    const R = ctx.rng;
    const cur = ctx.A.songInfo();
    if (cur && cur.id === 'things' && cur.bpm !== BASE_BPM) ctx.A.playSong(getSong('things'));
    let phase = 'intro', pt = 0, t = 0, level = 0, cleared = 0, lives = LIVES, score = 0, streak = 0, bestStreak = 0, played = 0;
    let game = null, gameId = '', gt = 0, outcome = null, quip = '', lastId = '';
    let bag = [];
    const pops = Pops();
    const nextId = () => {
      if (inst._force) return inst._force;
      if (!bag.length) { bag = ORDER.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = R() * (i + 1) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; } if (bag[bag.length - 1] === lastId) bag.unshift(bag.pop()); }
      return bag.pop();
    };
    const startGame = () => { gameId = nextId(); lastId = gameId; game = GAMES[gameId](ctx, level); gt = 0; phase = 'game'; pt = 0; played++; };
    const interDur = () => 1.35 * SPEED[level] + 0.25;
    const finish = res => {
      outcome = res; phase = 'post'; pt = 0;
      if (res === 'win') {
        cleared++; streak++; bestStreak = Math.max(bestStreak, streak);
        const bonus = game.timeout === 'lose' ? Math.round(50 * Math.max(0, 1 - gt / game.dur)) : 25;
        const gain = 100 + 50 * level + bonus;
        score += gain; pops.add('+' + gain, W / 2, 60, P.amber, 0.9);
        quip = QUIPS_WIN[R() * QUIPS_WIN.length | 0];
      } else {
        lives--; streak = 0; ctx.shake(3);
        quip = QUIPS_LOSE[R() * QUIPS_LOSE.length | 0];
      }
    };

    const inst = {
      result: null,
      update(dt) {
        t += dt; pt += dt; pops.update(dt);
        if (phase === 'intro') { if (pt > 1.6) { phase = 'inter'; pt = 0; quip = 'BEGIN.'; } return; }
        if (phase === 'inter') { if (pt > interDur()) startGame(); return; }
        if (phase === 'speedup') { if (pt > 1.7) { phase = 'inter'; pt = 0; quip = 'FASTER.'; } return; }
        if (phase === 'game') {
          gt += dt;
          const r = game.update(dt, ctx.I, gt);
          if (r) return finish(r);
          if (gt >= game.dur) { if (game.timeout === 'lose') ctx.sfx('miss'); return finish(game.timeout); }
          if (gt < game.dur && Math.ceil(game.dur - gt) !== Math.ceil(game.dur - gt + dt) && game.dur - gt < 3) ctx.sfx('tick', 0.6);
          return;
        }
        if (phase === 'post') {
          if (pt < 0.6) return;
          if (lives <= 0) {
            if (!inst.result) inst.result = { win: false, score, lines: [`CLEARED ${cleared}/${GOAL}`, `PLAYED ${played}`, `BEST STREAK ${bestStreak}`] };
            return;
          }
          if (cleared >= GOAL) {
            if (!inst.result) { const lb = lives * 200; score += lb; inst.result = { win: true, score, lines: [`CLEARED ${cleared}/${GOAL}`, `PLAYED ${played}`, `LIVES LEFT ${lives}  +${lb}`, `BEST STREAK ${bestStreak}`] }; }
            return;
          }
          if (outcome === 'win' && cleared % 4 === 0 && level < 3) {
            level++; phase = 'speedup'; pt = 0; ctx.sfx('power');
            ctx.A.playSong(getSong('things', BASE_BPM + 10 * level));
            return;
          }
          phase = 'inter'; pt = 0;
        }
      },
      // Test hooks: force the next microgame, read the state.
      _force: null,
      _dbg: () => ({ phase, gameId, gt, level, lives, cleared }),
      auto() { return phase === 'game' ? game.auto(gt) || [] : []; },
      draw(g) {
        if (phase === 'game' || phase === 'post') {
          game.draw(g, gt);
          drawFuse(g, phase === 'game' ? 1 - gt / game.dur : 0, gt, game.dur);
          if (phase === 'game' && gt < 0.65) drawCmd(g, game.cmd, gt, game.cmdY);
          if (phase === 'post') drawStamp(g, outcome, pt);
        } else drawLab(g, t, pt, phase, { lives, cleared, level, quip, outcome });
        pops.draw(g);
        topBar(g, 'THINGS YOU CAN DO', score, `${String(cleared).padStart(2, '0')}/${GOAL}`);
      },
    };
    return inst;
  },
};

// The big command word, WarioWare style.
function drawCmd(g, s, t, y0 = 70) {
  const k = Math.min(1, t * 9), y = y0 + Math.round((1 - k) * -40) + Math.round(Math.sin(t * 30) * (1 - k) * 4);
  const w = measure(s, 4) + 20;
  g.globalAlpha = 0.85; rect(g, W / 2 - w / 2, y - 6, w, 40, P.ink); g.globalAlpha = 1;
  rect(g, W / 2 - w / 2, y - 6, w, 2, P.amber); rect(g, W / 2 - w / 2, y + 32, w, 2, P.amber);
  text(g, s, W / 2, y, P.amber, { align: 'center', scale: 4, outline: P.blood });
}

// A fuse burning toward a bomb along the bottom.
function drawFuse(g, f, t, dur) {
  rect(g, 0, 207, W, 17, P.ink); rect(g, 0, 207, W, 1, P.s0);
  const x0 = 30, x1 = 244, xe = x0 + (x1 - x0) * Math.max(0, f);
  for (let x = x0; x < xe; x++) px(g, x, 215 + ((x >> 1) % 2), (x >> 2) % 2 ? P.tan : P.brown3);
  if (f > 0) { const fl = (t * 30 | 0) % 3; rect(g, xe - 1, 213 - fl, 3, 3 + fl, P.amber); px(g, xe, 212 - fl, P.white); }
  blob(g, [{ x: 18, y: 216, rx: 9, ry: 7, h: 7 }], [P.ink, P.s0, P.s1, P.s2, P.s3], { rim: P.red });
  rect(g, 24, 212, 5, 3, P.s1);
  const left = dur * Math.max(0, f);
  if (f > 0 && left < 3) text(g, String(Math.ceil(left)), 18, 213, P.amber, { align: 'center' });
}

function drawStamp(g, outcome, t) {
  const win = outcome === 'win', k = Math.min(1, t * 8);
  g.globalAlpha = 0.35 * k; rect(g, 0, 13, W, 194, win ? P.green : P.red); g.globalAlpha = 1;
  const s = win ? 'OK!' : 'MISS!';
  text(g, s, W / 2, 88, win ? P.lime : P.pink, { align: 'center', scale: 5, outline: P.ink });
}

// Between games: the lab monitor with hearts and the count, the Automator weighing in.
function drawLab(g, t, pt, phase, st) {
  rect(g, 0, 13, W, H - 13, '#0d1a24');
  for (let x = 0; x < W; x += 12) rect(g, x, 13, 1, 180, '#14303c');
  for (let y = 13; y < 193; y += 12) rect(g, 0, y, W, 1, '#14303c');
  rect(g, 0, 193, W, 31, P.brown1); rect(g, 0, 193, W, 2, P.brown3);
  // Monitor.
  const mx = 108, my = 30, mw = 136, mh = 104;
  rect(g, mx - 6, my - 6, mw + 12, mh + 12, P.s1); rect(g, mx - 6, my - 6, mw + 12, 2, P.s3);
  rect(g, mx, my, mw, mh, '#04120e');
  rect(g, mx + mw / 2 - 10, my + mh + 6, 20, 16, P.s0); rect(g, mx + mw / 2 - 26, my + mh + 20, 52, 4, P.s1);
  if (phase === 'speedup') {
    const on = (pt * 8 | 0) % 2;
    text(g, 'SPEED', mx + mw / 2, my + 26, on ? P.amber : P.red, { align: 'center', scale: 3 });
    text(g, 'UP!', mx + mw / 2, my + 54, on ? P.amber : P.red, { align: 'center', scale: 3 });
    text(g, `TEMPO ${96 + 10 * st.level} BPM`, mx + mw / 2, my + 88, P.lime, { align: 'center' });
  } else {
    text(g, phase === 'intro' ? 'CALIBRATION' : 'TEST', mx + mw / 2, my + 10, P.lime, { align: 'center' });
    text(g, phase === 'intro' ? `${GOAL} TESTS` : `${String(st.cleared + 1).padStart(2, '0')}/${GOAL}`, mx + mw / 2, my + 26, P.lime, { align: 'center', scale: phase === 'intro' ? 2 : 3 });
    for (let i = 0; i < LIVES; i++) {
      const x = mx + 22 + i * 26, y = my + 68, alive = i < st.lives;
      const breaking = !alive && i === st.lives && st.outcome === 'lose' && pt < 0.6;
      if (alive || breaking) {
        const sh = breaking ? Math.round(Math.sin(pt * 60) * 2) : 0;
        blob(g, [{ x: x + 5 + sh, y: y + 4, rx: 6, ry: 6, h: 5 }, { x: x + 13 + sh, y: y + 4, rx: 6, ry: 6, h: 5 }, { x: x + 9 + sh, y: y + 10, rx: 7, ry: 7, h: 5 }], RAMP.red, { rim: P.pink, clip: (xx, yy) => (yy - y) < 18 - Math.abs(xx - x - 9) });
        if (breaking) line(g, x + 9, y, x + 7, y + 14, P.ink);
      } else { ring(g, x + 9, y + 8, 7, P.s0); }
    }
    const lv = ['NORMAL', 'BRISK', 'FAST', 'FRANTIC'][st.level];
    text(g, `SPEED: ${lv}`, mx + mw / 2, my + 92, P.green, { align: 'center' });
  }
  g.globalAlpha = 0.18; for (let y = my; y < my + mh; y += 2) rect(g, mx, y, mw, 1, P.ink); g.globalAlpha = 1;
  // The Automator.
  const talk = pt < 0.5 && (t * 8 | 0) % 2 === 0;
  g.drawImage(bust(CAST.automator, talk), 4, 193 - 112 + 6);
  if (st.quip) {
    const w = measure(st.quip) + 12;
    rect(g, 8, 50, w, 14, P.cream); rect(g, 8, 63, w, 1, P.tan); poly(g, [[18, 64], [28, 64], [30, 72]], P.cream);
    text(g, st.quip, 14, 54, P.ink);
  }
}
