// Track 12, Madness: FUNK THE BROADCAST.
// A night plaza full of citizens hypnotized by the Bank's TV towers. Walk among them and fire
// funk pulses: a pulse on the beat spreads twice as wide. Touching a sleepwalker or standing in a
// tower's mind beam drains your sanity. Wake thirty of them.
import { W, H, P, RAMP, canvas, rect, px, line, ellipse, ring, poly, rampAt, mix, spr, bake, dith } from '../gfx.js';
import { text } from '../font.js';
import { blob, DELTRON } from '../art.js';
import { topBar, Pops, Particles, bar, beatLamp, banner } from '../hud.js';

const GOAL = 30, SPEED = 72, R_OFF = 32, R_ON = 66, COOLDOWN = 0.4, BEAT_WIN = 0.15;
const X0 = 8, X1 = 248, Y0 = 42, Y1 = 206;
const TOWERS = [{ x: 46, y: 70, w: 0.62, a: 0 }, { x: 212, y: 176, w: -0.55, a: 2.4 }, { x: 206, y: 66, w: 0.8, a: 4, late: 12 }];
const BEAM_LEN = 150, BEAM_HALF = 0.12;

// ----------------------------------------------------------------- sprites
const CIT = `
...cccc...
..cCCCCcc.
..vvvvvv..
..sssss...
...sss....
..jjjjjj..
.jJJJJJJj.
.jJJjjJJj.
.sjJJJJjs.
..jJJJJj..
..pppppp..
..pp..pp..
..pp..pp..
.kkk..kkk.
~
...cccc...
..cCCCCcc.
..vvvvvv..
..sssss...
...sss....
..jjjjjj..
.jJJJJJJj.
.jJJjjJJj.
.sjJJJJjs.
..jJJJJj..
..pppppp..
..pp...pp.
.pp....pp.
kkk....kkk`;
const AWAKE = `
...cccc...
..cCCCCcc.
..sesses..
..sssss...
...sTs....
s.jjjjjj.s
sjJJJJJJjs
.jJJjjJJj.
..jJJJJj..
..jJJJJj..
..pppppp..
..pp..pp..
..pp..pp..
.kkk..kkk.
~
...cccc...
..cCCCCcc.
..sesses..
..sssss...
...sTs....
..jjjjjj..
.jJJJJJJj.
sjJJjjJJjs
s.jJJJJj.s
..jJJJJj..
..pppppp..
.pp....pp.
.pp....pp.
kkk....kkk`;
const HYP_PAL = { c: P.navy, C: P.violet, v: P.magenta, s: '#8f5a36', j: P.deep, J: P.indigo, p: P.ink, k: P.ink };
const HYP = spr(CIT, HYP_PAL, { outline: true, frames: true });
const WAKE_COLS = [[P.blood, P.red], [P.forest, P.green], [P.teal, P.cyan], [P.gold1, P.amber], [P.violet, P.pink]];
const WAKE = WAKE_COLS.map(([d, l], i) => spr(AWAKE, { c: P.ink, C: [P.lime, P.orange, P.magenta, P.cyan, P.amber][i], s: i % 2 ? '#c48a5a' : '#8f5a36', e: P.ink, T: P.red, j: d, J: l, p: P.navy, k: P.ink }, { outline: true, frames: true }));

// The plaza, baked once: tiles, grout, a few lamp pools and planters.
function plaza() {
  return bake('madness-plaza', W, H, g => {
    for (let y = 13; y < H; y++) for (let x = 0; x < W; x++) {
      const tx = x >> 4, ty = (y - 13) >> 4, edge = (x & 15) === 0 || ((y - 13) & 15) === 0;
      const base = (tx + ty) % 2 ? 0.42 : 0.3;
      const glow = Math.max(0, 1 - Math.hypot(x - 128, y - 120) / 140) * 0.25;
      g.fillStyle = edge ? P.ink : rampAt([P.ink, P.deep, P.navy, P.indigo, P.violet], base + glow, x, y);
      g.fillRect(x, y, 1, 1);
    }
    // Central fountain basin (decorative, walkable).
    ellipse(g, 128, 124, 22, 12, P.s1); ellipse(g, 128, 123, 19, 10, P.navy); ellipse(g, 128, 122, 17, 8, '#2b3a7a');
    for (let i = 0; i < 9; i++) px(g, 118 + i * 2.5, 121 + (i % 2), P.ice);
    // Lamp pools.
    for (const [x, y] of [[20, 196], [236, 40], [130, 40], [24, 128]]) {
      for (let j = -14; j <= 14; j++) for (let i = -22; i <= 22; i++) { const d = (i / 22) ** 2 + (j / 14) ** 2; if (d < 1 && dith(x + i, y + j, (1 - d) * 0.5)) px(g, x + i, y + j, '#4a3f8a'); }
      rect(g, x - 1, y - 26, 2, 26, P.s1); rect(g, x - 3, y - 29, 6, 4, P.amber); px(g, x - 2, y - 28, P.cream);
    }
  });
}

function towerDraw(g, tw, t) {
  const { x, y } = tw;
  ellipse(g, x, y + 1, 9, 4, P.ink);
  rect(g, x - 2, y - 30, 4, 30, P.s1); rect(g, x - 2, y - 30, 1, 30, P.s3);
  // TV head.
  const tx = x - 15, ty = y - 52;
  rect(g, tx - 1, ty - 1, 32, 24, P.ink);
  for (let j = 0; j < 22; j++) { g.fillStyle = rampAt(RAMP.steel, 0.7 - j / 34, 0, j); g.fillRect(tx, ty + j, 30, 1); }
  const sx = tx + 3, sy = ty + 3, sw = 24, sh = 15;
  // Hypnotic spiral.
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const dx = i - sw / 2 + 0.5, dy = (j - sh / 2 + 0.5) * 1.4, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const v = Math.sin(r * 0.9 - t * 7 + a * 2);
    g.fillStyle = v > 0.3 ? P.magenta : v > -0.3 ? P.violet : P.ink;
    g.fillRect(sx + i, sy + j, 1, 1);
  }
  px(g, sx + 2, sy + 1, P.pink);
  line(g, x + 6, ty - 1, x + 12, ty - 9, P.s2); px(g, x + 12, ty - 10, (t * 3 | 0) % 2 ? P.red : P.blood);
}

// ----------------------------------------------------------------- stage
export default {
  id: 'madness', track: 12, song: 'madness', name: 'Madness', title: 'FUNK THE BROADCAST',
  blurb: "The Bank's TV towers have hypnotized the city. Walk among the sleepwalkers and fire funk pulses to wake them. A pulse on the beat spreads twice as wide.",
  how: ['◀▲▼▶ MOVE', 'Ⓐ FUNK PULSE', 'PULSE ON THE BEAT', 'DODGE THE BEAMS'],
  par: [3000, 3600, 4100, 4500],
  make(ctx) {
    const I = ctx.I;
    const pops = Pops(), parts = Particles();
    const me = { x: 128, y: 150, face: 1, walk: 0, hurtT: 9 };
    const cits = [], pulses = [];
    const towers = TOWERS.map(tw => ({ ...tw, on: !tw.late, flick: 0 }));
    let t = 0, sanity = 100, woken = 0, cool = 0, spawnT = 0.2, onBeats = 0, pulsesN = 0, streak = 0, bestStreak = 0, hurtSnd = 0, inBeam = false;
    let lastA = false, botA = false, botMove = [0, 0], botRetarget = 0;

    const spawn = () => {
      const side = Math.floor(ctx.rng() * 4);
      const x = side === 0 ? X0 - 6 : side === 1 ? X1 + 6 : X0 + ctx.rng() * (X1 - X0);
      const y = side === 2 ? Y0 - 4 : side === 3 ? Y1 + 8 : Y0 + ctx.rng() * (Y1 - Y0);
      cits.push({ x, y, state: 'hypno', t: ctx.rng() * 6, wob: ctx.rng() * 6.28, col: Math.floor(ctx.rng() * WAKE.length), sp: 15 + ctx.rng() * 6 + Math.min(12, woken * 0.4) });
    };
    for (let i = 0; i < 3; i++) spawn();

    const fire = () => {
      const pb = ctx.pressBeat('a'), err = Math.abs(pb - Math.round(pb));
      const on = err <= BEAT_WIN;
      pulses.push({ x: me.x, y: me.y - 8, r: 0, R: on ? R_ON : R_OFF, on, t: 0 });
      cool = COOLDOWN; pulsesN++;
      if (on) { onBeats++; streak++; bestStreak = Math.max(bestStreak, streak); ctx.flash(0.25); ctx.shake(2); ctx.sfx('power'); pops.add(streak > 2 ? `ON BEAT x${streak}` : 'ON BEAT!', me.x, me.y - 34, P.amber); }
      else { streak = 0; ctx.sfx('zap'); pops.add('OFF BEAT', me.x, me.y - 34, P.s3, 0.5); }
    };

    const inst = {
      result: null,
      sloppy: false, // test: a bot that ignores the beat
      get dbg() { return { me, sanity, woken, cits, towers, cool }; },
      update(dt) {
        t += dt;
        pops.update(dt); parts.update(dt);
        for (const p of pulses) { p.t += dt; p.r = Math.min(p.R, p.r + p.R * dt / 0.28); }
        for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i].t > 0.5) pulses.splice(i, 1);
        for (const c of cits) { c.t += dt; if (c.state !== 'hypno') c.wt += dt; }
        if (inst.result) return;

        // Move.
        let [ax, ay] = I.axis();
        if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }
        me.x = Math.max(X0, Math.min(X1, me.x + ax * SPEED * dt));
        me.y = Math.max(Y0, Math.min(Y1, me.y + ay * SPEED * dt));
        if (ax) me.face = ax;
        me.walk = ax || ay ? me.walk + dt : 0;
        for (const tw of towers) { if (!tw.on) continue; const dx = me.x - tw.x, dy = me.y - tw.y, d = Math.hypot(dx, dy); if (d < 10 && d > 0.01) { me.x = tw.x + dx / d * 10; me.y = tw.y + dy / d * 10; } }

        // Pulse (edge-safe: one pulse per press).
        const ah = I.hit('a'), aEdge = ah && !lastA; lastA = ah;
        cool -= dt;
        if (aEdge && cool <= 0) fire();

        // Wake anyone a ring passes over.
        for (const p of pulses) for (const c of cits) {
          if (c.state !== 'hypno') continue;
          if (Math.hypot(c.x - p.x, c.y - 6 - p.y) <= p.r + 3) {
            c.state = 'awake'; c.wt = 0; woken++;
            const pts = p.on ? 150 : 100;
            pops.add('+' + pts, c.x, c.y - 22, p.on ? P.amber : P.cream);
            parts.burst(c.x, c.y - 10, 10, [P.lime, P.cyan, P.amber, P.pink], 60, 0.6);
            sanity = Math.min(100, sanity + 3);
            ctx.sfx('coin', 0.7);
            if (woken === 12) { ctx.sfx('alarm'); pops.add('NEW TOWER!', 206, 40, P.red, 1.5); }
          }
        }

        // Towers and beams.
        inBeam = false;
        for (const tw of towers) {
          if (!tw.on && woken >= tw.late) { tw.on = true; tw.flick = 1; ctx.shake(3); }
          if (!tw.on) continue;
          tw.flick = Math.max(0, tw.flick - dt);
          tw.a += tw.w * dt * (1 + woken / 60);
          const dx = me.x - tw.x, dy = (me.y - 8) - (tw.y - 40), d = Math.hypot(dx, dy);
          let da = Math.atan2(dy, dx) - tw.a; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d > 12 && d < BEAM_LEN && Math.abs(da) < BEAM_HALF + 4 / d) inBeam = true;
        }

        // Citizens.
        let touching = false;
        spawnT -= dt;
        const hyp = cits.filter(c => c.state === 'hypno').length;
        if (spawnT <= 0 && hyp < Math.min(7, 3 + Math.floor(woken / 6))) { spawn(); spawnT = Math.max(1.4, 2.4 - woken * 0.035); }
        for (const c of cits) {
          if (c.state === 'hypno') {
            const dx = me.x - c.x, dy = me.y - c.y, d = Math.hypot(dx, dy) || 1;
            const wx = Math.cos(c.t * 0.7 + c.wob), wy = Math.sin(c.t * 0.9 + c.wob * 1.3);
            const kx = dx / d * 0.75 + wx * 0.45, ky = dy / d * 0.75 + wy * 0.45, kl = Math.hypot(kx, ky) || 1;
            c.x += kx / kl * c.sp * dt; c.y += ky / kl * c.sp * dt;
            c.y = Math.max(Y0 - 10, Math.min(Y1 + 10, c.y));
            if (d < 9) { touching = true; c.x -= dx / d * 18 * dt; c.y -= dy / d * 18 * dt; }
          } else if (c.state === 'awake') {
            if (c.wt > 1.1) { c.state = 'leave'; const ex = c.x < 128 ? -1 : 1; c.vx = ex * 42; c.vy = (ctx.rng() - 0.5) * 20; }
          } else { c.x += c.vx * dt; c.y += c.vy * dt; }
        }
        for (let i = cits.length - 1; i >= 0; i--) { const c = cits[i]; if (c.state === 'leave' && (c.x < -20 || c.x > W + 20)) cits.splice(i, 1); }
        // Keep sleepwalkers from stacking on top of each other.
        for (let i = 0; i < cits.length; i++) for (let j = i + 1; j < cits.length; j++) {
          const a = cits[i], b = cits[j]; if (a.state !== 'hypno' || b.state !== 'hypno') continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < 10 && d > 0.01) { const k = (10 - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
        }

        // Sanity.
        const drain = (touching ? 20 : 0) + (inBeam ? 17 : 0);
        if (drain) {
          sanity -= drain * dt; me.hurtT = 0;
          hurtSnd -= dt; if (hurtSnd <= 0) { ctx.sfx(inBeam && !touching ? 'glitch' : 'hurt'); hurtSnd = 0.35; ctx.shake(1.5); }
        } else { me.hurtT += dt; if (me.hurtT > 1.0) sanity = Math.min(100, sanity + 6 * dt); }

        if (woken >= GOAL) {
          const sec = Math.round(t), tb = Math.max(0, 110 - sec) * 10;
          const score = woken * 100 + onBeats * 25 + Math.round(sanity) * 5 + tb;
          inst.result = { win: true, score, lines: [`WOKEN ${woken}/${GOAL}`, `ON BEAT ${onBeats}/${pulsesN}`, `BEST STREAK ${bestStreak}`, `SANITY ${Math.round(sanity)}%`, `TIME ${sec} S`] };
          ctx.flash(0.5);
          for (const c of cits) if (c.state === 'hypno') { c.state = 'awake'; c.wt = 0; }
          return;
        }
        if (sanity <= 0) {
          sanity = 0; ctx.shake(5);
          inst.result = { win: false, score: woken * 100, lines: [`WOKEN ${woken}/${GOAL}`, `ON BEAT ${onBeats}/${pulsesN}`, 'YOUR MIND GOT BROADCAST'] };
        }
      },
      // Bot: keep clear of sleepwalkers and beams, close in on the nearest one, pulse on the beat.
      auto() {
        if (inst.result) return [];
        const out = [];
        let fx = 0, fy = 0, near = null, nd = 1e9;
        for (const c of cits) {
          if (c.state !== 'hypno') continue;
          const dx = me.x - c.x, dy = me.y - c.y, d = Math.hypot(dx, dy) || 1;
          if (c.x > X0 && c.x < X1 && c.y > Y0 && c.y < Y1 && d < nd) { nd = d; near = c; }
          if (d < 34) { fx += dx / d * (34 - d) / 8; fy += dy / d * (34 - d) / 8; }
        }
        if (near && nd > 40) { fx += (near.x - me.x) / nd; fy += (near.y - me.y) / nd; }
        for (const tw of towers) {
          if (!tw.on) continue;
          const dx = me.x - tw.x, dy = (me.y - 8) - (tw.y - 40), d = Math.hypot(dx, dy);
          if (d > BEAM_LEN + 10) continue;
          let da = Math.atan2(dy, dx) - tw.a; da = Math.atan2(Math.sin(da), Math.cos(da));
          const ahead = da * Math.sign(tw.w);
          if (ahead > -0.15 && ahead < 0.7) { const px2 = -dy / d * Math.sign(tw.w), py2 = dx / d * Math.sign(tw.w); fx += px2 * 1.6; fy += py2 * 1.6; }
        }
        fx += (128 - me.x) / 400; fy += (124 - me.y) / 400;
        botRetarget -= 1 / 60;
        if (botRetarget <= 0) { botMove = [Math.abs(fx) > 0.25 ? Math.sign(fx) : 0, Math.abs(fy) > 0.25 ? Math.sign(fy) : 0]; botRetarget = 0.1; }
        if (botMove[0] < 0) out.push('left'); if (botMove[0] > 0) out.push('right');
        if (botMove[1] < 0) out.push('up'); if (botMove[1] > 0) out.push('down');
        const b = ctx.beat(), off = Math.abs(b - Math.round(b));
        if (botA) botA = false;
        else if (inst.sloppy ? (cool <= 0 && near && nd < R_OFF * 0.8 && Math.random() < 0.1) : (cool <= 0 && off < 0.04 && near && nd < R_ON * 0.85)) { out.push('a'); botA = true; }
        return out;
      },
      draw(g) {
        g.drawImage(plaza(), 0, 0);
        const b = ctx.beat(), bf = b - Math.floor(b);
        if (bf < 0.12) { g.globalAlpha = (0.12 - bf) * 1.2; rect(g, 0, 13, W, H - 13, P.magenta); g.globalAlpha = 1; }
        // Beams under everything else.
        for (const tw of towers) {
          if (!tw.on) continue;
          const ox = tw.x, oy = tw.y - 40;
          const a0 = tw.a - BEAM_HALF, a1 = tw.a + BEAM_HALF;
          g.globalAlpha = 0.22 + Math.sin(t * 20) * 0.04;
          poly(g, [[ox, oy], [ox + Math.cos(a0) * BEAM_LEN, oy + Math.sin(a0) * BEAM_LEN], [ox + Math.cos(a1) * BEAM_LEN, oy + Math.sin(a1) * BEAM_LEN]], P.magenta);
          g.globalAlpha = 0.5;
          line(g, ox, oy, ox + Math.cos(tw.a) * BEAM_LEN, oy + Math.sin(tw.a) * BEAM_LEN, P.pink);
          g.globalAlpha = 1;
        }
        // Pulses.
        for (const p of pulses) {
          const k = 1 - p.t / 0.5;
          g.globalAlpha = Math.max(0, k);
          ring(g, p.x, p.y, p.r, p.on ? P.amber : P.cyan, p.on ? 3 : 2);
          if (p.r > 6) ring(g, p.x, p.y, p.r * 0.7, p.on ? P.cream : P.teal);
          if (p.on) for (let i = 0; i < 8; i++) { const a = i * 0.785 + p.t * 3; text(g, '♪', p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r - 3, P.amber, { align: 'center' }); }
          g.globalAlpha = 1;
        }
        // Sprites by depth.
        const list = [];
        for (const c of cits) list.push({ y: c.y, f: () => {
          const walkF = ((c.t * 4) | 0) % 2;
          if (c.state === 'hypno') {
            g.globalAlpha = 0.35 + Math.sin(c.t * 5) * 0.15; ellipse(g, c.x, c.y, 7, 3, P.magenta); g.globalAlpha = 1;
            const s = HYP[walkF];
            g.drawImage(s, Math.round(c.x - s.width / 2), Math.round(c.y - s.height + Math.sin(c.t * 3) * 0.6));
            if ((c.t * 2 + c.wob) % 4 < 0.6) text(g, 'z', c.x + 6, c.y - 22 - ((c.t * 6) % 4), P.pink);
          } else {
            ellipse(g, c.x, c.y, 6, 2, P.ink);
            const s = WAKE[c.col][c.state === 'awake' ? ((c.wt * 8) | 0) % 2 : walkF];
            const hop = c.state === 'awake' ? -Math.abs(Math.sin(c.wt * 12)) * 4 : 0;
            g.drawImage(s, Math.round(c.x - s.width / 2), Math.round(c.y - s.height + hop));
          }
        } });
        for (const tw of towers) if (tw.on || tw.flick) list.push({ y: tw.y, f: () => { if (tw.on) towerDraw(g, tw, t); } });
        list.push({ y: me.y, f: () => {
          ellipse(g, me.x, me.y, 6, 2, P.ink);
          const fr = me.walk ? 1 + (((me.walk * 8) | 0) % 2) : 0;
          const s = DELTRON[fr];
          const hurt = me.hurtT < 0.15 && (t * 20 | 0) % 2;
          g.save();
          if (me.face < 0) { g.translate(Math.round(me.x), 0); g.scale(-1, 1); g.drawImage(s, -Math.round(s.width / 2), Math.round(me.y - s.height)); }
          else g.drawImage(s, Math.round(me.x - s.width / 2), Math.round(me.y - s.height));
          g.restore();
          if (hurt) { g.globalAlpha = 0.6; ellipse(g, me.x, me.y - 12, 8, 12, P.magenta); g.globalAlpha = 1; }
          if (cool <= 0 && !inst.result) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 10); px(g, me.x, me.y - 30, P.amber); g.globalAlpha = 1; }
        } });
        list.sort((a, b2) => a.y - b2.y).forEach(o => o.f());
        parts.draw(g); pops.draw(g);
        // Madness creeping in as sanity falls.
        const mad = 1 - sanity / 100;
        if (mad > 0.3) { g.fillStyle = P.magenta; for (let y = 13; y < H; y += 2) for (let x = (y >> 1) % 2; x < W; x += 2) if (dith(x, y, (mad - 0.3) * 0.5)) g.fillRect(x, y, 1, 1); }
        if (inBeam && (t * 10 | 0) % 2) { g.globalAlpha = 0.15; rect(g, 0, 13, W, H - 13, P.magenta); g.globalAlpha = 1; }
        // HUD.
        rect(g, 0, 210, W, 14, P.ink); rect(g, 0, 210, W, 1, P.s0);
        bar(g, 46, 215, 110, sanity / 100, sanity < 30 ? ((t * 4 | 0) % 2 ? P.red : P.magenta) : P.lime, 'SANITY');
        if (streak > 1) text(g, `STREAK ${streak}`, 166, 214, P.amber);
        beatLamp(g, 242, 217, b, P.magenta);
        topBar(g, 'MADNESS', String(woken * 100 + onBeats * 25), `WOKE ${woken}/${GOAL}`);
        if (t < 2.5 && !inst.result) banner(g, 'WAKE THEM UP!', 92, P.amber);
      },
    };
    return inst;
  },
};
