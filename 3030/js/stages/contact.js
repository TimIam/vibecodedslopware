// POSITIVE CONTACT / SCRATCH SIGNAL: the DJ cuts a signal for the underground. Notes slide
// down three lanes into the hit line by the decks: ▲ scratches the record forward, ▼ drags it
// back, Ⓐ cuts the fader. The chart is read off the song itself: the lead line's ups and downs
// in the hooks, the scratch track in the DJ breaks. Every hit is a scratch you hear and a pulse
// that flies out of the dish; misses bleed the SIGNAL meter. End above 70% and somebody answers.
import { W, P, RAMP, rect, px, line, ellipse, ring, poly, ball, sky, stars, mix, rampAt, bake, rng as mkrng } from '../gfx.js';
import { text, measure, wrap } from '../font.js';
import { blob } from '../art.js';
import { topBar, Pops, Particles, banner } from '../hud.js';

const HITX = 122, PXB = 34, LANE_Y = { up: 134, a: 160, down: 186 };
const LANE_COL = { up: P.cyan, a: P.amber, down: P.magenta };
const LANE_SFX = { up: 'rb', a: 'rc', down: 'rt' };
const PERFECT = 0.09, GOOD = 0.18;
const START_BEAT = 4, END_BEAT = 112, PASS_TO_WIN = 70;
const DISH = [52, 76], PLANET = [212, 54];

// Read a chart off the compiled song: [{ beat, type }].
function buildChart(c) {
  const notes = [];
  const passBeats = c.len / c.beatDur;
  const sections = [
    // pass, part index, which streams, density
    [0, 0, 'lead', 'quarters'], [0, 1, 'rb', 'quarters'], [0, 2, 'lead', 'all'], [0, 3, 'lead2', 'all'],
    [0, 4, 'rb', 'all'], [1, 0, 'lead', 'all'], [1, 1, 'rb', 'quarters'],
  ];
  for (const [pass, mi, stream, density] of sections) {
    const m = c.marks[mi], s0 = m.step, s1 = m.step + m.len, off = pass * passBeats;
    let prevM = null, prevType = 'down';
    const evs = c.events.filter(e => e.s >= s0 && e.s < s1);
    for (const e of evs) {
      const rel = e.s - s0, beat = e.t / c.beatDur + off;
      if (beat < START_BEAT || beat > END_BEAT - 1) continue;
      let type = null;
      if (stream === 'lead' || stream === 'lead2') {
        if (e.ch === stream && (density === 'all' || rel % 4 === 0)) {
          type = prevM == null ? 'up' : e.m > prevM ? 'up' : e.m < prevM ? 'down' : (prevType === 'up' ? 'down' : 'up');
          prevM = e.m; prevType = type;
        } else if (e.k === 'rc' || e.k === 'rs') type = 'a';
      } else {
        if (e.k === 'rb' && (density === 'all' || rel % 4 === 0)) { type = prevType === 'up' ? 'down' : 'up'; prevType = type; }
        else if (e.k === 'rc' && (density === 'all' || rel % 16 === 14)) type = 'a';
      }
      if (!type) continue;
      if (notes.length && Math.abs(notes[notes.length - 1].beat - beat) < 0.26) continue;
      notes.push({ beat, type, judged: null });
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return notes;
}

// Static art, baked once.
const SPACE = () => bake('contact:sky', W, 93, g => sky(g, 0, 93, [P.ink, P.deep, P.navy, P.indigo]));
const PLANET_ART = () => bake('contact:planet', 90, 60, g => {
  const px0 = 45, py0 = 30;
  ring(g, px0, py0, 40, mix(P.violet, P.ink, 0.4));
  ball(g, px0, py0, 26, 26, [P.ink, P.forest, P.teal, P.cyan, P.ice], { rim: P.lime });
  for (let a = 0; a < 6.283; a += 0.01) { const x = px0 + Math.cos(a) * 38, y = py0 + Math.sin(a) * 8; if (Math.sin(a) > 0 || Math.hypot(x - px0, y - py0) > 26) px(g, x, y, Math.sin(a) > 0 ? P.amber : P.gold1); }
});
const ROOF = () => bake('contact:roof', 110, 40, g => {
  rect(g, 0, 26, 110, 14, P.ink);
  for (let x = 0; x < 110; x += 14) rect(g, x, 22 - (x * 7 % 9), 12, 18, '#0f0c1c');
  const dx = 52, dy = 10;
  line(g, dx, dy + 2, dx - 4, 26, P.s2); line(g, dx, dy + 2, dx + 5, 26, P.s2);
  poly(g, [[dx - 12, dy - 6], [dx + 2, dy - 16], [dx + 10, dy + 4], [dx - 4, dy + 8]], P.s3);
  poly(g, [[dx - 9, dy - 4], [dx + 1, dy - 12], [dx + 7, dy + 2], [dx - 3, dy + 5]], P.s2);
  line(g, dx - 1, dy - 3, dx + 8, dy - 10, P.s4);
});
const RECORD = () => bake('contact:record', 92, 92, g => {
  const cx = 46, cy = 46, R = 44;
  ellipse(g, cx, cy, R + 2, R + 2, P.s2);
  ellipse(g, cx, cy, R, R, P.ink);
  for (let r = 16; r < R - 1; r += 3) ring(g, cx, cy, r, '#1f1c2e');
  ellipse(g, cx, cy, 14, 14, P.red); ring(g, cx, cy, 14, P.blood);
});
const BOOTH = () => bake('contact:booth', W, 118, g => {
  sky(g, 0, 118, [P.deep, P.navy, P.deep, P.ink]);
  for (let y = 0; y < 118; y += 8) for (let x = ((y >> 3) % 2) * 8; x < W; x += 16) { g.globalAlpha = 0.25; rect(g, x, y, 8, 8, P.indigo); g.globalAlpha = 1; }
});

export default {
  id: 'contact', track: 5, song: 'contact', name: 'Positive Contact', title: 'SCRATCH SIGNAL',
  blurb: 'The DJ cuts a signal for the underground. Scratch on the line to boost it. Finish above 70% and somebody out there answers.',
  how: ['▲ SCRATCH FORWARD', '▼ SCRATCH BACK', 'Ⓐ FADER CUT', 'HIT ON THE LINE'],
  par: [0, 12000, 18500, 26500],
  restartSong: true,
  make(ctx) {
    const c = ctx.song;
    const notes = buildChart(c);
    // The player is the scratch track: play the song without its own scratches.
    const quiet = Object.assign({}, c, { events: c.events.filter(e => !(e.k && e.k[0] === 'r')) });
    quiet.loopIndex = Math.max(0, quiet.events.findIndex(e => e.s >= c.loopStep));
    let swapped = false;
    let signal = 60, score = 0, combo = 0, maxCombo = 0, perfect = 0, good = 0, miss = 0, stray = 0;
    let phase = 'play', pt = 0, t = 0, frame = 0;
    let recA = 0, recV = 0, handY = 0, handT = 0, fader = 0, lastType = 'up';
    const pops = Pops(), parts = Particles();
    const packets = [], flashes = { up: 0, a: 0, down: 0 };
    let reply = 0;
    const lastHit = {};
    const hitOnce = b => { if (!ctx.I.hit(b)) return false; const dup = lastHit[b] === frame - 1; lastHit[b] = frame; return !dup; };
    const total = notes.length;
    const MSG = 'INCOMING: WE HEAR YOU, ZERO. EUROPA, THE MOON DOCKS AND THE WHALE CHOIR ARE TUNED IN. THE UNDERGROUND IS LISTENING.';

    function scratch(type, ok) {
      ctx.sfx(LANE_SFX[type], ok ? 1 : 0.5);
      recV += type === 'up' ? 9 : type === 'down' ? -9 : 0;
      handY = type === 'up' ? -9 : type === 'down' ? 9 : 0; handT = 0.18;
      if (type === 'a') fader = 1;
      lastType = type;
      flashes[type] = 1;
    }
    function judge(type, pb) {
      let best = null, bd = 1e9;
      for (const n of notes) { if (n.judged) continue; const d = Math.abs(n.beat - pb); if (d < bd) { bd = d; best = n; } if (n.beat > pb + 1) break; }
      if (!best || bd > GOOD) { stray++; signal -= 1.5; combo = 0; scratch(type, false); return; }
      if (best.type !== type) { best.judged = 'miss'; missNote(best, 'WRONG'); scratch(type, false); return; }
      const pf = bd <= PERFECT;
      best.judged = pf ? 'perfect' : 'good';
      if (pf) perfect++; else good++;
      combo++; maxCombo = Math.max(maxCombo, combo);
      const gain = (pf ? 100 : 50) + Math.min(combo, 40) * 2;
      score += gain;
      signal = Math.min(100, signal + (pf ? 3.2 : 2));
      scratch(type, true);
      ctx.sfx(pf ? 'perfect' : 'good', 0.35);
      pops.add(pf ? 'PERFECT' : 'GOOD', HITX + 4, LANE_Y[type] - 14, pf ? P.amber : P.lime, 0.5);
      parts.burst(HITX, LANE_Y[type], pf ? 10 : 5, [LANE_COL[type], P.white], 60, 0.4, 0);
      packets.push({ t: 0, col: LANE_COL[type], big: pf });
    }
    function missNote(n, label = 'MISS') {
      // The first few bars are forgiving while you find the groove.
      miss++; combo = 0; signal -= n.beat < 12 ? 2.5 : 5;
      pops.add(label, HITX + 4, LANE_Y[n.type] - 14, P.red, 0.5);
      parts.burst(DISH[0], DISH[1] - 8, 4, [P.s2, P.s1], 30, 0.4, 40);
    }

    const inst = {
      result: null,
      _dbg: () => ({ phase, pt, signal, total, perfect, good, miss }),
      update(dt) {
        frame++; t += dt; pt += dt;
        if (!swapped) { swapped = true; ctx.A.playSong(quiet, { at: ctx.A.songTime() }); }
        const b = ctx.beat();
        pops.update(dt); parts.update(dt);
        for (const k in flashes) flashes[k] = Math.max(0, flashes[k] - dt * 5);
        for (let i = packets.length - 1; i >= 0; i--) { packets[i].t += dt; if (packets[i].t > 1.1) packets.splice(i, 1); }
        // Record: spins at 33 rpm, scratches kick it.
        recV += (3.46 - recV) * Math.min(1, dt * 8);
        recA += recV * dt;
        handT -= dt; if (handT <= 0) handY *= Math.pow(0.001, dt);
        fader = Math.max(0, fader - dt * 5);

        if (phase === 'play') {
          for (const k of ['up', 'a', 'down']) if (hitOnce(k)) judge(k, ctx.pressBeat(k));
          for (const n of notes) { if (n.judged) continue; if (n.beat < b - GOOD - 0.02) { n.judged = 'miss'; missNote(n); } else break; }
          signal = Math.max(0, Math.min(100, signal));
          if (b < 20) signal = Math.max(5, signal);
          if (signal <= 0) { phase = 'lost'; pt = 0; ctx.sfx('lose'); ctx.shake(4); return; }
          if (b > END_BEAT && notes.every(n => n.judged)) {
            phase = signal >= PASS_TO_WIN ? 'answer' : 'lost'; pt = 0;
            if (phase === 'answer') { ctx.sfx('radio'); ctx.sfx('power'); ctx.flash(0.4); } else ctx.sfx('lose');
          }
          return;
        }
        if (phase === 'answer') {
          reply = Math.min(1, pt / 1.2);
          if ((pt * 3 | 0) !== ((pt - dt) * 3 | 0) && pt < 1.4) ctx.sfx('radio');
          if (pt > 5.2 || (pt > 1.5 && ctx.I.hit('a'))) finish(true);
          return;
        }
        if (phase === 'lost' && pt > 2.2) finish(false);
      },
      auto() {
        if (phase !== 'play') return [];
        const b = ctx.beat(), half = 1 / 60 / c.beatDur * 0.6;
        for (const n of notes) { if (n.judged) continue; if (n.beat - b <= half) return [n.type]; break; }
        return [];
      },
      draw(g) {
        const b = ctx.beat();
        drawSpace(g, t, b);
        g.drawImage(BOOTH(), 0, 106);
        drawDeck(g);
        drawHighway(g, b);
        parts.draw(g);
        pops.draw(g);
        // Signal meter.
        const mx = 70, mw = 120;
        rect(g, mx - 1, 17, mw + 2, 8, P.ink); rect(g, mx, 18, mw, 6, P.s0);
        const col = signal >= PASS_TO_WIN ? P.lime : signal > 35 ? P.amber : P.red;
        rect(g, mx, 18, Math.round(mw * signal / 100), 6, col); rect(g, mx, 18, Math.round(mw * signal / 100), 1, mix(col, P.white, 0.5));
        rect(g, mx + Math.round(mw * PASS_TO_WIN / 100), 15, 1, 12, P.white);
        text(g, 'SIGNAL', mx - 4, 18, P.s3, { align: 'right' });
        text(g, Math.round(signal) + '%', mx + mw + 4, 18, col);
        if (combo >= 5) text(g, `COMBO ${combo}`, 250, 112, combo >= 20 ? P.amber : P.cream, { align: 'right', shadow: P.ink });
        if (phase === 'play' && b < START_BEAT) { const n = Math.ceil(START_BEAT - b); text(g, n > 2 ? 'GET READY' : String(n), 184, 152, P.cream, { align: 'center', scale: 2, shadow: P.ink }); }
        if (phase === 'answer') drawAnswer(g);
        if (phase === 'lost') banner(g, signal <= 0 ? 'SIGNAL LOST' : 'NO ANSWER', 52, P.red);
        topBar(g, 'POSITIVE CONTACT', score, '');
      },
    };

    function finish(win) {
      if (inst.result) return;
      const acc = total ? Math.round((perfect + good * 0.5) / total * 100) : 0;
      const sigB = Math.round(signal) * 20;
      if (win) score += sigB;
      inst.result = {
        win, score,
        lines: [`PERFECT ${perfect}  GOOD ${good}`, `MISSED ${miss}  STRAY ${stray}`, `MAX COMBO ${maxCombo}`, `ACCURACY ${acc}%`, win ? `SIGNAL ${Math.round(signal)}%  +${sigB}` : `SIGNAL ${Math.round(signal)}%`],
      };
    }

    // -------- drawing
    function drawSpace(g, tt, b) {
      g.drawImage(SPACE(), 0, 13);
      stars(g, tt, { n: 50, seed: 55, y0: 14, y1: 104 });
      const [px0, py0] = PLANET;
      g.drawImage(PLANET_ART(), px0 - 45, py0 - 30);
      const [dx, dy] = DISH;
      g.drawImage(ROOF(), 0, 66);
      rect(g, dx + 8, dy - 12, 2, 2, (b % 1) < 0.2 ? P.white : P.red);
      // Packets flying to the planet.
      for (const p of packets) {
        const k = p.t / 1.1, x = dx + 9 + (px0 - 26 - dx - 9) * k, y = dy - 11 + (py0 - dy + 11) * k - Math.sin(k * Math.PI) * 14;
        for (let i = 0; i < 10; i++) px(g, x - i, y + Math.sin((x - i) * 0.9 + tt * 30) * (p.big ? 3 : 2), i < 3 ? P.white : p.col);
      }
      if (reply > 0) {
        for (let i = 0; i < 5; i++) { const r = ((tt * 60 + i * 30) % 150); g.globalAlpha = Math.max(0, 1 - r / 150) * reply; ring(g, px0, py0, 26 + r, P.lime, 2); g.globalAlpha = 1; }
      }
    }
    function drawDeck(g) {
      // Plinth.
      rect(g, 4, 112, 108, 108, P.s1); rect(g, 4, 112, 108, 2, P.s3); rect(g, 110, 112, 2, 108, P.s0);
      rect(g, 8, 116, 100, 100, P.s0);
      // Record.
      const cx = 56, cy = 162, R = 44;
      g.drawImage(RECORD(), cx - 46, cy - 46);
      for (const off of [0, Math.PI]) for (let r = 17; r < R - 2; r++) { const a = recA + off; px(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, '#4b4a66'); px(g, cx + Math.cos(a + 0.05) * r, cy + Math.sin(a + 0.05) * r, '#33314a'); }
      const la = recA; rect(g, cx + Math.cos(la) * 8 - 1, cy + Math.sin(la) * 8 - 1, 3, 3, P.cream);
      ellipse(g, cx, cy, 2, 2, P.s3);
      // Tone arm.
      ellipse(g, 100, 124, 5, 5, P.s3); line(g, 100, 124, 90, 176, P.s4); line(g, 101, 124, 91, 176, P.s2); rect(g, 86, 175, 7, 5, P.s3);
      // Crossfader.
      rect(g, 16, 208, 80, 4, P.ink); const fx = 56 + (fader > 0.3 ? -26 : 0) * fader;
      rect(g, fx - 5, 205, 10, 10, P.s3); rect(g, fx - 5, 205, 10, 1, P.white);
      // The DJ's hand on the vinyl.
      const hx = cx + 30, hy = cy - 8 + handY;
      blob(g, [{ x: hx, y: hy, rx: 9, ry: 7, h: 6 }, { x: hx - 9, y: hy - 2, rx: 6, ry: 3, h: 3, z: 3 }, { x: hx - 9, y: hy + 3, rx: 6, ry: 3, h: 3, z: 3 }, { x: hx + 10, y: hy + 4, rx: 8, ry: 6, h: 5 }], RAMP.skinL, { rim: P.lime });
      rect(g, hx + 13, hy - 1, 14, 12, P.s1); rect(g, hx + 13, hy - 1, 14, 2, P.s2);
    }
    function drawHighway(g, b) {
      rect(g, 114, 120, 142, 80, P.ink);
      for (const k of ['up', 'a', 'down']) {
        const y = LANE_Y[k];
        rect(g, 114, y - 11, 142, 22, mix(LANE_COL[k], P.ink, 0.86));
        rect(g, 114, y - 11, 142, 1, mix(LANE_COL[k], P.ink, 0.6));
      }
      // Beat lines.
      for (let i = Math.floor(b); i < b + 5; i++) { const x = HITX + (i - b) * PXB; if (x < 114 || x > 255) continue; rect(g, x, 123, 1, 74, i % 4 === 0 ? P.s1 : P.s0); }
      // Hit line and receptors.
      rect(g, HITX - 1, 120, 3, 80, P.s3);
      for (const k of ['up', 'a', 'down']) {
        const y = LANE_Y[k], fl = flashes[k];
        rect(g, HITX - 9, y - 9, 19, 18, fl > 0 ? mix(LANE_COL[k], P.white, fl * 0.6) : P.s0);
        rect(g, HITX - 9, y - 9, 19, 1, P.s2);
        drawGlyph(g, k, HITX, y, fl > 0 ? P.ink : LANE_COL[k]);
      }
      // Notes.
      for (const n of notes) {
        if (n.judged && n.judged !== 'miss') continue;
        const x = HITX + (n.beat - b) * PXB;
        if (x > 262) break;
        if (x < 104) continue;
        const y = LANE_Y[n.type], col = n.judged === 'miss' ? P.s1 : LANE_COL[n.type];
        rect(g, x - 8, y - 8, 17, 17, P.ink);
        rect(g, x - 7, y - 7, 15, 15, col); rect(g, x - 7, y - 7, 15, 2, mix(col, P.white, 0.5)); rect(g, x - 7, y + 6, 15, 2, mix(col, P.ink, 0.4));
        drawGlyph(g, n.type, x, y, P.ink);
      }
      rect(g, 112, 120, 2, 80, P.s1);
    }
    function drawGlyph(g, k, x, y, col) {
      if (k === 'a') { text(g, 'A', x, y - 3, col, { align: 'center' }); return; }
      // ▲ is narrow at the top, ▼ narrow at the bottom; a short stem trails behind.
      const up = k === 'up';
      for (let i = 0; i < 5; i++) rect(g, x - i, up ? y - 4 + i : y + 4 - i, i * 2 + 1, 1, col);
      rect(g, x - 1, up ? y + 1 : y - 4, 3, 3, col);
    }
    function drawAnswer(g) {
      const k = Math.min(1, pt * 3);
      rect(g, 14, 30, 228 * k, 68, P.ink); rect(g, 14, 30, 228 * k, 1, P.lime); rect(g, 14, 97, 228 * k, 1, P.lime);
      if (k < 1) return;
      text(g, 'POSITIVE CONTACT!', 128, 34, P.lime, { align: 'center' });
      const shown = MSG.slice(0, Math.floor(Math.max(0, pt - 0.4) * 40));
      wrap(shown, 216).slice(0, 5).forEach((l, i) => text(g, l, 20, 46 + i * 10, P.cream));
    }

    return inst;
  },
};
