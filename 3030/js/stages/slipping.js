// Track 14: Time Keeps On Slipping. CHRONO LOCK.
// The great clock is a stack of concentric gold rings, each spinning with one gap. Ⓐ stops the
// outermost moving ring: if its gap is under the 12 o'clock pointer it locks, otherwise it slips
// (jolts away and costs time). Lock every ring and the key slides down the channel. Five clocks.
// The rings are shaded per pixel into an ImageData buffer: the lighting stays put while the gap
// and the tick marks turn, the way a lit brass part looks spinning under a lamp.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, ball, sky, stars, hex, mix, spr, bake, dith } from '../gfx.js';
import { text, measure } from '../font.js';
import { topBar, bar, Pops, Particles, banner } from '../hud.js';
import { DELTRON } from '../art.js';

const CX = 128, CY = 124, R0 = 82, RFACE = 22;
const B = 172, HB = B / 2;                 // ring buffer box, centred on the clock
const TOP = -Math.PI / 2;                   // 12 o'clock
const TMAX = 30;

// Five clocks: ring count, base speed (rad/s), lock tolerance (rad), speed wobble, reversals.
const CLOCKS = [
  { n: 3, sp: [1.5, 1.9, 2.2], tol: 0.26, wob: 0, rev: false },
  { n: 4, sp: [1.9, 2.2, 2.5, 2.8], tol: 0.24, wob: 0, rev: false },
  { n: 4, sp: [2.3, 2.6, 2.9, 3.1], tol: 0.22, wob: 0.35, rev: false },
  { n: 5, sp: [2.5, 2.8, 3.0, 3.2, 3.4], tol: 0.2, wob: 0.5, rev: false },
  { n: 6, sp: [2.6, 2.9, 3.1, 3.3, 3.5, 3.7], tol: 0.19, wob: 0.75, rev: true },
];
const PERFECT = 0.06;

const wrapA = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

// ABGR for ImageData.
const u32 = c => { const [r, g, b] = hex(c); return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; };
const RAMPS = {
  gold: [P.gold0, P.gold1, P.gold2, P.gold3, P.cream].map(u32),
  lock: [P.gold1, P.gold2, P.gold3, P.cream, P.white].map(u32),
  slip: ['#2a0610', P.blood, P.red, '#ff6a5e', P.pink].map(u32),
  dim: [P.deep, P.gold0, P.gold0, P.gold1, P.gold2].map(u32),
};
const EDGE = u32(P.ice), EDGE2 = u32(P.cyan);

const KEY = spr(`
..ggg.......
.gGGGg......
gGg.gGg.....
gG...Gg.....
gGg.gGg.....
.gGGGgggggg.
..ggggGGGGGg
.......g.g.g
.......g.g..
`, { g: P.gold1, G: P.gold3 }, { outline: true });

// Background gears, baked once.
function gearArt(r, teeth, col, hole) {
  return bake(`gear:${r}:${teeth}:${col}`, r * 2 + 8, r * 2 + 8, g => {
    const c = r + 4;
    ellipse(g, c, c, r - 3, r - 3, col);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), w = Math.PI / teeth * 0.55;
      poly(g, [[c + Math.cos(a - w) * (r - 4), c + Math.sin(a - w) * (r - 4)], [c + Math.cos(a - w * 0.7) * r, c + Math.sin(a - w * 0.7) * r],
        [c + Math.cos(a + w * 0.7) * r, c + Math.sin(a + w * 0.7) * r], [c + Math.cos(a + w) * (r - 4), c + Math.sin(a + w) * (r - 4)]], col);
      void ca; void sa;
    }
    ellipse(g, c, c, hole, hole, P.ink);
    for (let i = 0; i < 5; i++) { const a = i * 1.2566; ellipse(g, c + Math.cos(a) * r * 0.55, c + Math.sin(a) * r * 0.55, r * 0.16, r * 0.16, P.ink); }
  });
}

export default {
  id: 'slipping', track: 14, song: 'slipping', name: 'Time Keeps On Slipping', title: 'CHRONO LOCK',
  blurb: 'The great clock is slipping. Stop each spinning ring with its gap under the pointer to lock the hours back in place.',
  how: ['Ⓐ STOP THE RING', 'GAP UNDER POINTER', 'SLIPS COST TIME', 'FIX 5 CLOCKS'],
  par: [0, 5200, 6800, 8400],
  make(ctx) {
    const { I, sfx } = ctx;
    const r = ctx.rng;
    const pops = Pops(), parts = Particles();
    const [buf, bg] = canvas(B, B);
    const img = bg.createImageData(B, B);
    const px32 = new Uint32Array(img.data.buffer);
    // Per-pixel polar coordinates and light, once.
    const N = B * B, pd = new Float32Array(N), pa = new Float32Array(N), pl = new Float32Array(N);
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
      const dx = x + 0.5 - HB, dy = y + 0.5 - HB, d = Math.hypot(dx, dy), i = y * B + x;
      pd[i] = d; pa[i] = Math.atan2(dy, dx); pl[i] = d > 0 ? (-dx * 0.6 - dy * 0.75) / d : 0;
    }
    const rk = new Int8Array(N), rl = new Float32Array(N), ru = new Float32Array(N);

    let clockI = 0, rings = [], active = 0, time = 22, t = 0, score = 0, locks = 0, perfects = 0, slips = 0, combo = 0;
    let lockout = 0, phase = 'spin', phaseT = 0, keyT = 0, assemble = 0, hop = 0, stumble = 0, faceSpin = 0, botWait = 0, botHeld = false;
    let ringW = 0, thick = 0;
    const inst = { result: null };

    function buildClock(i) {
      const c = CLOCKS[i];
      ringW = (R0 - RFACE - 4) / c.n; thick = Math.min(13, ringW - 3);
      rings = c.sp.map((s, k) => ({
        k, base: s, dir: (k % 2 ? -1 : 1) * (i > 0 && r() < 0.5 ? -1 : 1),
        ang: r() * Math.PI * 2, wph: r() * 6.28, wf: 0.7 + r() * 0.6, locked: false, slipT: 0, lockT: 0,
        outer: R0 - k * ringW, inner: R0 - k * ringW - thick, gap: c.tol + 0.035, ticks: 10 + k * 2,
      }));
      // Keep starting gaps away from the pointer so the first press is a real read.
      for (const g of rings) if (Math.abs(wrapA(g.ang - TOP)) < 0.8) g.ang += Math.PI;
      active = 0;
      for (let p = 0; p < N; p++) {
        const d = pd[p];
        rk[p] = -1;
        if (d > R0 || d < RFACE + 2) continue;
        const k = Math.floor((R0 - d) / ringW);
        if (k < 0 || k >= c.n) continue;
        const u = (R0 - k * ringW - d) / thick;
        if (u < 0 || u > 1) continue;
        rk[p] = k; ru[p] = u;
        // Tube shading: outer half faces out, inner half faces in, all of it faces up a little.
        const nr = (0.5 - u) * 1.5;
        rl[p] = Math.max(0, Math.min(0.999, 0.42 + nr * pl[p] * 0.55 + (1 - Math.abs(0.5 - u) * 2) * 0.2));
      }
      assemble = 0.6;
    }
    buildClock(0);

    function speed(g) {
      const c = CLOCKS[clockI];
      let w = g.base * (1 + c.wob * Math.sin(t * g.wf + g.wph));
      if (c.rev) w = g.base * (0.35 + 1.05 * Math.sin(t * g.wf * 0.8 + g.wph));
      return w * g.dir;
    }

    function press() {
      const g = rings[active], c = CLOCKS[clockI];
      const diff = Math.abs(wrapA(g.ang - TOP));
      if (diff <= c.tol) {
        const perfect = diff <= PERFECT;
        g.locked = true; g.lockT = 0.35; g.ang = TOP; combo++; locks++;
        const pts = (perfect ? 200 : 100) + Math.min(10, combo - 1) * 10;
        score += pts; time = Math.min(TMAX, time + (perfect ? 4 : 2.5));
        if (perfect) perfects++;
        pops.add(perfect ? 'PERFECT +' + pts : '+' + pts, CX, CY - g.inner + 8, perfect ? P.amber : P.cream);
        sfx('lock'); if (perfect) sfx('perfect');
        ctx.flash(perfect ? 0.35 : 0.18); ctx.shake(perfect ? 2 : 1);
        parts.burst(CX, CY - (g.outer + g.inner) / 2, perfect ? 18 : 10, [P.gold3, P.cream, P.amber], 70, 0.6, 160);
        hop = 0.35; lockout = 0.15;
        while (active < rings.length && rings[active].locked) active++;
        if (active >= rings.length) { phase = 'key'; keyT = 0; sfx('power'); }
      } else {
        // Slip: the ring jolts on and spins faster for a moment.
        g.slipT = 0.45; g.ang += g.dir * (0.9 + r() * 0.8); combo = 0; slips++;
        time -= 3; lockout = 0.4; stumble = 0.7;
        pops.add('SLIP! -3s', CX, CY - g.inner + 8, P.red);
        sfx('miss'); sfx('glitch'); ctx.shake(4);
        parts.burst(CX, CY - g.outer, 8, [P.red, P.pink], 60, 0.5, 120);
      }
    }

    inst.update = dt => {
      t += dt; phaseT += dt;
      pops.update(dt); parts.update(dt);
      if (hop > 0) hop -= dt; if (stumble > 0) stumble -= dt; if (lockout > 0) lockout -= dt; if (assemble > 0) assemble -= dt;
      faceSpin += dt * (stumble > 0 ? 18 : 2);
      for (const g of rings) {
        if (g.slipT > 0) g.slipT -= dt;
        if (g.lockT > 0) g.lockT -= dt;
        if (!g.locked) g.ang += speed(g) * dt * (g.slipT > 0 ? 2.2 : 1);
      }
      if (inst.result) return;
      if (phase === 'spin') {
        time -= dt;
        if (time <= 0) {
          time = 0;
          inst.result = { win: false, score, lines: [`CLOCKS ${clockI}/5`, `LOCKS ${locks}`, `PERFECT ${perfects}`, `SLIPS ${slips}`, 'TIME RAN OUT'] };
          return;
        }
        if (assemble <= 0 && lockout <= 0 && I.hit('a')) press();
      } else if (phase === 'key') {
        keyT += dt;
        if (keyT > 0.7 && phaseT > 0) {
          if (keyT - dt <= 0.7) { score += 500; time = Math.min(TMAX, time + 4); sfx('perfect'); ctx.flash(0.6); parts.burst(CX, CY, 40, [P.gold3, P.cream, P.white, P.amber], 110, 0.9, 60); pops.add('CLOCK FIXED +500', CX, CY + 30, P.amber, 1.4); }
        }
        if (keyT > 1.9) {
          clockI++;
          if (clockI >= CLOCKS.length) {
            const bonus = Math.floor(time) * 25;
            score += bonus;
            inst.result = { win: true, score, lines: ['CLOCKS 5/5', `LOCKS ${locks}`, `PERFECT ${perfects}`, `SLIPS ${slips}`, `TIME LEFT ${Math.floor(time)}s  +${bonus}`] };
            phase = 'done';
            return;
          }
          buildClock(clockI); phase = 'spin'; phaseT = 0;
        }
      }
    };

    // A competent bot: waits until the gap is a frame from the pointer, then taps.
    inst.auto = () => {
      if (phase !== 'spin' || assemble > 0 || lockout > 0) { botHeld = false; return []; }
      if (botHeld) { botHeld = false; return []; }
      const g = rings[active]; if (!g) return [];
      const err = (window.__d3 && window.__d3.botErr) || 0;
      const next = g.ang + speed(g) * (1 / 60) + err;
      if (Math.abs(wrapA(next - TOP)) < 0.012 + Math.abs(speed(g)) / 60 * 0.55) { botHeld = true; return ['a']; }
      return [];
    };

    function drawRings(g) {
      const c = CLOCKS[clockI];
      const scale = assemble > 0 ? 1 - assemble / 0.6 : 1;
      for (let p = 0; p < N; p++) {
        const k = rk[p];
        if (k < 0) { px32[p] = 0; continue; }
        const R = rings[k];
        if (scale < 1 && pd[p] > RFACE + (R0 - RFACE) * scale) { px32[p] = 0; continue; }
        const la = wrapA(pa[p] - R.ang);
        if (Math.abs(la) < R.gap) { px32[p] = 0; continue; }
        const isActive = k === active && phase === 'spin';
        const u = ru[p];
        if (isActive && (u < 0.09 || u > 0.91)) { px32[p] = ((p * 7 + (t * 30 | 0)) & 7) < 5 ? EDGE : EDGE2; continue; }
        const ramp = R.slipT > 0 ? RAMPS.slip : R.locked ? RAMPS.lock : (k > active && phase === 'spin') ? RAMPS.dim : RAMPS.gold;
        let v = rl[p];
        // Tick marks turn with the ring.
        const tick = ((la + Math.PI) * R.ticks / (Math.PI * 2)) % 1;
        if (u < 0.4 && tick < 0.12) v -= 0.3;
        if (R.lockT > 0) v += R.lockT * 1.4;
        const f = Math.max(0, Math.min(0.999, v)) * 4, i0 = f | 0;
        const x = p % B, y = (p / B) | 0;
        px32[p] = ramp[Math.min(4, i0 + (dith(x, y, f - i0) ? 1 : 0))];
      }
      bg.putImageData(img, 0, 0);
      g.drawImage(buf, CX - HB, CY - HB);
      void c;
    }

    inst.draw = g => {
      // Violet sky, stars, slow background gears.
      sky(g, 0, H, [P.ink, P.deep, P.navy, P.indigo, P.violet]);
      stars(g, t, { n: 70, seed: 14, y0: 14, y1: H, cols: [P.indigo, P.s2, P.s3, P.white] });
      for (const [x, y, rr, n, sp] of [[20, 200, 44, 16, -0.15], [236, 60, 36, 13, 0.2], [240, 206, 24, 10, -0.3], [14, 46, 20, 9, 0.35]]) {
        const gc = gearArt(rr, n, '#241d48', rr * 0.25);
        g.save(); g.translate(x, y); g.rotate(t * sp); g.drawImage(gc, -gc.width / 2, -gc.height / 2); g.restore();
      }
      // Bezel and numerals.
      ellipse(g, CX, CY, R0 + 9, R0 + 9, P.gold0);
      ellipse(g, CX, CY, R0 + 7, R0 + 7, '#1a1430');
      ring(g, CX, CY, R0 + 9, P.gold1);
      const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      for (let i = 1; i < 12; i++) {
        const a = TOP + i * Math.PI / 6, rr = R0 + 18;
        const x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
        if (y > H - 4 || y < 18) continue;
        text(g, NUM[i], x, y - 3, P.gold2, { align: 'center', shadow: P.ink });
      }
      // The keyhole channel under the pointer.
      g.globalAlpha = 0.45 + 0.25 * Math.max(0, 1 - (ctx.beat() % 1) * 4);
      rect(g, CX - 2, CY - R0 - 1, 5, R0 - RFACE + 2, P.cyan);
      g.globalAlpha = 1;
      drawRings(g);
      // Face: gold disc with a keyhole and spinning hands.
      g.drawImage(bake('slipface', 50, 50, fg => { ball(fg, 25, 25, RFACE, RFACE, [P.gold0, P.gold1, P.gold2, P.cream, P.white], { rim: P.amber }); ellipse(fg, 25, 21, 4, 4, P.ink); poly(fg, [[22, 22], [28, 22], [29, 32], [21, 32]], P.ink); }), CX - 25, CY - 25);
      const fixed = phase === 'key' && keyT > 0.7;
      const a1 = fixed ? TOP : faceSpin * 0.2, a2 = fixed ? TOP + 0.001 : faceSpin;
      line(g, CX, CY, CX + Math.cos(a1) * 12, CY + Math.sin(a1) * 12, P.blood);
      line(g, CX, CY, CX + Math.cos(a2) * 17, CY + Math.sin(a2) * 17, P.ink);
      ellipse(g, CX, CY, 2, 2, P.ink);
      // The key sliding down the channel.
      if (phase === 'key' || phase === 'done') {
        const k = Math.min(1, keyT / 0.7);
        const ky = CY - R0 - 16 + (R0 - 8) * k * k;
        g.save(); g.translate(CX, ky); g.rotate(Math.PI / 2); g.drawImage(KEY, -KEY.width / 2, -KEY.height / 2); g.restore();
        if (keyT > 0.7 && keyT < 1.9) banner(g, 'CLOCK FIXED!', CY + 40, P.amber);
      }
      // Pointer and Deltron on the bezel.
      const pb = Math.max(0, 1 - (ctx.beat() % 1) * 3);
      const py = CY - R0 - 11;
      poly(g, [[CX - 6, py], [CX + 6, py], [CX, py + 9]], pb > 0.3 ? P.white : P.red);
      poly(g, [[CX - 4, py + 1], [CX + 4, py + 1], [CX, py + 7]], P.red);
      const fr = stumble > 0 ? DELTRON[3] : hop > 0 ? DELTRON[3] : DELTRON[(t * 2 | 0) % 2 === 0 ? 0 : 0];
      const dx = CX - 26, dy = py + 9 - (hop > 0 ? Math.sin(hop / 0.35 * Math.PI) * 6 : 0);
      if (stumble > 0) { g.save(); g.translate(dx, dy - 2); g.rotate(-Math.min(1.4, (0.7 - stumble) * 6)); g.drawImage(fr, -fr.width / 2, -fr.height); g.restore(); }
      else g.drawImage(fr, Math.round(dx - fr.width / 2), Math.round(dy - fr.height));
      parts.draw(g); pops.draw(g);
      // HUD.
      topBar(g, 'CHRONO LOCK', score, `CLOCK ${Math.min(5, clockI + 1)}/5`);
      const low = time < 6;
      if (!low || (t * 4 | 0) % 2) text(g, 'TIME', 6, 16, low ? P.red : P.s3);
      bar(g, 32, 17, 120, time / TMAX, low ? P.red : time < 12 ? P.amber : P.cyan);
      if (combo > 1) text(g, `COMBO x${combo}`, 250, 26, P.amber, { align: "right", shadow: P.ink });
      // Rings left on this clock.
      for (let i = 0; i < rings.length; i++) rect(g, 160 + i * 7, 17, 5, 4, rings[i].locked ? P.gold3 : i === active ? P.cyan : P.s1);
    };
    return inst;
  },
};
