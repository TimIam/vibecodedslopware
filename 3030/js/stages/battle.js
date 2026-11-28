// Track 18, "Battlesong": TITLE FIGHT. A call-and-response rap battle. Each round MC Kilowatt
// spits a one-bar line (a rhythm of buttons); on the next bar you echo it back, on the beat.
// Every note he raps drops into your lane at once and scrolls a full bar toward the hit ring,
// so you see the whole line coming, with a 3-2-1 count before your turn. Timing is judged
// against the music clock at the moment the key went down. Win the crowd.
import { W, H, P, RAMP, canvas, rect, px, line, poly, ellipse, ring, sky, stars, mix, rng, outline } from '../gfx.js';
import { text, measure } from '../font.js';
import { blob, bust, CAST } from '../art.js';
import { topBar, Particles, Pops, beatLamp } from '../hud.js';

const START = 8, ROUNDS = 10, BTNS = ['up', 'down', 'left', 'right', 'a'];
const COL = { up: P.cyan, down: P.lime, left: P.pink, right: P.amber, a: P.red };
const PITCH = { up: 7, down: 0, left: 3, right: 5, a: 10 };   // semitones over E: a minor pentatonic voice
// Rhythm templates (16th steps in a bar), easy to hard: quarters, then eighths, and only a
// few sixteenth pairs in the last rounds.
const RHYTHMS = [
  [[0, 4, 8, 12]], [[0, 4, 8, 12]], [[0, 4, 6, 8, 12], [0, 4, 8, 10, 12]],
  [[0, 2, 4, 8, 12], [0, 4, 8, 12, 14]], [[0, 4, 6, 10, 12], [0, 2, 4, 8, 10]],
  [[0, 3, 6, 8, 12], [0, 4, 6, 8, 12, 14]], [[0, 2, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12]],
  [[0, 2, 4, 8, 10, 12, 14], [0, 3, 6, 8, 11, 12]], [[0, 2, 4, 6, 8, 10, 12], [0, 2, 3, 6, 8, 12, 14]],
  [[0, 2, 3, 6, 8, 10, 12, 14], [0, 3, 4, 6, 8, 11, 12, 14]],
];
const WIN = { perfect: 0.09, great: 0.16, ok: 0.26 };
// The lane: notes scroll left into the hit ring, one bar (4 beats) of lead time.
const HITX = 34, LANEY = 186, PXB = 52;

// Note icons: a lit disc with the arrow (or A) drawn dead centre. 17x17, centre pixel (8, 8).
const ICONS = {};
function icon(btn, state = '') {
  const k = btn + state;
  if (ICONS[k]) return ICONS[k];
  const [c, g] = canvas(17, 17);
  const base = state === 'miss' ? P.s1 : COL[btn];
  ellipse(g, 8.5, 8.5, 8.5, 8.5, P.ink);
  ellipse(g, 8.5, 8.5, 7.5, 7.5, base);
  ellipse(g, 7.5, 7, 5, 4.5, mix(base, P.white, 0.25));
  ellipse(g, 8.5, 8.5, 5.5, 5.5, base);
  px(g, 5, 4, P.white); px(g, 6, 4, P.white); px(g, 4, 5, P.white);
  const ink = state === 'miss' ? P.s0 : P.ink;
  const tri = pts => poly(g, pts, ink);
  // Arrows: a 9 px head plus a 3 px wide stem, centred on pixel (8, 8).
  if (btn === 'up') { tri([[8.5, 3.5], [13, 8.5], [4, 8.5]]); rect(g, 7, 8, 3, 5, ink); }
  if (btn === 'down') { tri([[8.5, 13.5], [13, 8.5], [4, 8.5]]); rect(g, 7, 4, 3, 5, ink); }
  if (btn === 'left') { tri([[3.5, 8.5], [8.5, 4], [8.5, 13]]); rect(g, 8, 7, 5, 3, ink); }
  if (btn === 'right') { tri([[13.5, 8.5], [8.5, 4], [8.5, 13]]); rect(g, 4, 7, 5, 3, ink); }
  if (btn === 'a') { text(g, 'A', 6, 5, ink); text(g, 'A', 7, 5, ink); }
  return (ICONS[k] = c);
}

// Full-body MCs on the stage, two poses each: mic down, mic up (rapping).
function mcSprite(kind, rapping) {
  const [c, g] = canvas(40, 56);
  const robot = kind === 'rival';
  const rim = robot ? P.red : P.cyan;
  const body = robot ? RAMP.steel : RAMP.cloth, legs = robot ? [P.ink, P.s0, P.s1, P.s2, P.s3] : [P.ink, P.deep, P.navy, P.indigo, P.violet];
  // Legs and shoes.
  for (const x of [15, 24]) blob(g, [{ x, y: 44, rx: 3.5, ry: 8, h: 3, ey: 3 }], legs, { rim });
  rect(g, 10, 51, 9, 4, robot ? P.s1 : P.white); rect(g, 21, 51, 9, 4, robot ? P.s1 : P.white); rect(g, 10, 54, 9, 1, P.ink); rect(g, 21, 54, 9, 1, P.ink);
  // Torso.
  blob(g, [{ x: 20, y: 30, rx: 10, ry: 10, h: 9, ey: 3 }], body, { rim });
  if (robot) { ellipse(g, 20, 29, 3, 3, P.red); px(g, 19, 28, P.pink); rect(g, 12, 36, 16, 2, P.s1); }
  else { line(g, 20, 22, 20, 39, P.ink); line(g, 18, 24, 17, 31, P.s3); line(g, 22, 24, 23, 31, P.s3); }
  // Head.
  if (robot) {
    blob(g, [{ x: 20, y: 13, rx: 7, ry: 7, h: 7 }], RAMP.steel, { rim });
    rect(g, 14, 11, 13, 4, P.ink); rect(g, 15, 12, 11, 2, P.red); line(g, 24, 6, 28, 1, P.s3); px(g, 28, 0, P.red);
  } else {
    blob(g, [{ x: 20, y: 13, rx: 8, ry: 8.5, h: 7 }], RAMP.cloth, { rim });
    blob(g, [{ x: 20, y: 14, rx: 5, ry: 6, h: 5, z: 4 }], RAMP.skinD);
    rect(g, 15, 12, 10, 2, P.ink); px(g, 23, 12, P.s3);
    rect(g, 11, 11, 3, 6, P.orange); rect(g, 26, 11, 3, 6, P.orange);
  }
  // Arms: free arm swings, mic arm raised when rapping.
  const arm = robot ? P.s2 : P.indigo;
  const face = robot ? -1 : 1, mx = 20 + face * 7;
  if (rapping) { line(g, 20 + face * 9, 24, mx + face * 2, 20, arm); line(g, 20 + face * 10, 24, mx + face * 3, 20, arm); rect(g, mx - 1, 15, 3, 5, P.s1); rect(g, mx - 1, 15, 3, 2, P.s3); }
  else { line(g, 20 + face * 9, 24, 20 + face * 11, 34, arm); line(g, 20 + face * 10, 24, 20 + face * 12, 34, arm); rect(g, 20 + face * 11, 34, 3, 4, P.s1); }
  line(g, 20 - face * 9, 24, 20 - face * 13, 32 - (rapping ? 10 : 0), arm); line(g, 20 - face * 10, 24, 20 - face * 14, 32 - (rapping ? 10 : 0), arm);
  return outline(c);
}

export default {
  id: 'battle', track: 18, song: 'battlesong', name: 'Battlesong', title: 'TITLE FIGHT',
  blurb: 'MC Kilowatt spits a line, and every note he raps slides into your lane. After his bar and a 3-2-1, hit each one as it reaches the ring. Win the crowd to win the belt.',
  how: ['WATCH HIS LINE', 'HIT AT THE RING', '◀▲▼▶ Ⓐ IN TIME', 'WIN THE CROWD'],
  par: [5000, 14000, 22000, 29000],
  restartSong: true,
  make(ctx) {
    const R = ctx.rng, parts = Particles(), pops = Pops();
    const ME = [mcSprite('me', false), mcSprite('me', true)], HIM = [mcSprite('rival', false), mcSprite('rival', true)];
    // Build the ten rounds.
    const rounds = [];
    for (let r = 0; r < ROUNDS; r++) {
      const tpl = RHYTHMS[r][(R() * RHYTHMS[r].length) | 0];
      const pool = r < 1 ? ['a'] : r < 3 ? ['up', 'down', 'a'] : BTNS;
      let last = null;
      const notes = tpl.map(st => {
        let b = pool[(R() * pool.length) | 0];
        if (r >= 2 && b === last && R() < 0.5) b = pool[(R() * pool.length) | 0];
        last = b;
        return { st, b };
      });
      const callAt = START + r * 8;
      rounds.push({ callAt, echoAt: callAt + 4, notes: notes.map(n => ({ ...n, beat: callAt + 4 + n.st / 4, hit: null, shown: false })) });
    }
    let hype = 0.5, score = 0, combo = 0, best = 0, t = 0, cutIn = null, lastRound = -1, done = false, crowdJump = 0;
    const tally = { perfect: 0, great: 0, ok: 0, miss: 0 };
    let scheduledCall = -1, botPress = new Set();

    const judgeLabel = { perfect: 'PERFECT', great: 'GREAT', ok: 'OK', miss: 'MISS' };
    const judgeCol = { perfect: P.amber, great: P.cyan, ok: P.lime, miss: P.red };
    function judge(n, kind) {
      n.hit = kind; tally[kind]++;
      if (kind === 'miss') { combo = 0; hype -= 0.035; ctx.shake(2); }
      else {
        combo++; best = Math.max(best, combo);
        const base = { perfect: 300, great: 200, ok: 100 }[kind];
        score += base + Math.min(combo, 30) * 10;
        hype += { perfect: 0.03, great: 0.02, ok: 0.008 }[kind];
        crowdJump = 1;
        parts.burst(HITX, LANEY, kind === 'perfect' ? 12 : 6, [COL[n.b], P.white], 70, 0.5);
        ringT = 1;
      }
      pops.add(judgeLabel[kind], HITX + 26, LANEY - 22, judgeCol[kind], 0.6);
      hype = Math.max(0, Math.min(1, hype));
    }
    let ringT = 0;
    const curRound = b => Math.max(-1, Math.min(ROUNDS - 1, Math.floor((b - START) / 8)));

    const inst = {
      result: null,
      rounds,   // for tests: the chart
      update(dt) {
        t += dt;
        const b = ctx.beat();
        crowdJump = Math.max(0, crowdJump - dt * 4);
        const ri = curRound(b), rd = rounds[ri];
        // New round: cut-in for the rival; at the echo bar, cut-in for Deltron.
        if (ri !== lastRound && ri >= 0) { lastRound = ri; cutIn = { who: 'rival', t: 0 }; }
        if (rd && b >= rd.echoAt - 1 && (!cutIn || cutIn.who !== 'deltron') && b < rd.echoAt - 0.5) cutIn = { who: 'deltron', t: 0 };
        ringT = Math.max(0, ringT - dt * 5);
        if (cutIn) { cutIn.t += dt; if (cutIn.t > 0.7) cutIn = null; }
        // The rival raps: schedule his voice on the beat once per round, reveal notes as he says them.
        if (rd) {
          if (scheduledCall !== ri) {
            scheduledCall = ri;
            for (const n of rd.notes) ctx.A.atBeat('voxBlip', 52 + PITCH[n.b], rd.callAt + n.st / 4, 0.2, 1.2);
            for (let k = 3; k >= 1; k--) ctx.A.atBeat('sqThin', k === 1 ? 91 : 86, rd.echoAt - k, 0.12, 0.9);
          }
          for (const n of rd.notes) if (!n.shown && b >= rd.callAt + n.st / 4) { n.shown = true; hype = Math.max(0.02, hype - 0.006); }
        }
        if (!done) {
          // Presses: match each to the nearest open note in the echo bar.
          for (const btn of BTNS) {
            if (!ctx.I.hit(btn)) continue;
            const pb = ctx.pressBeat(btn);
            ctx.A.noteNow('voxBlip2', 64 + PITCH[btn], 0.12, 1);
            let bestN = null, bestD = 9;
            for (const r of rounds) for (const n of r.notes) {
              if (n.hit) continue;
              const d = Math.abs(pb - n.beat);
              if (d < bestD) { bestD = d; bestN = n; }
            }
            if (bestN && bestD <= WIN.ok) {
              if (bestN.b !== btn) { judge(bestN, 'miss'); pops.add('WRONG BUTTON', HITX + 40, LANEY - 32, P.red, 0.7); }
              else judge(bestN, bestD <= WIN.perfect ? 'perfect' : bestD <= WIN.great ? 'great' : 'ok');
            } else if (rd && b >= rd.echoAt - 0.3) { hype = Math.max(0, hype - 0.006); pops.add('OFF BEAT', HITX + 30, LANEY - 22, P.s2, 0.4); }
          }
          // Notes that slipped past.
          for (const r of rounds) for (const n of r.notes) if (!n.hit && b > n.beat + WIN.ok) judge(n, 'miss');
          if (hype <= 0) { done = true; ctx.sfx('crowd'); inst.result = { win: false, score, lines: lines('BOOED OFF STAGE') }; }
          const endBeat = START + ROUNDS * 8;
          if (!done && b >= endBeat) {
            done = true;
            const win = hype >= 0.5;
            if (win) { score += Math.round(hype * 3000); ctx.sfx('crowd'); ctx.flash(0.6); }
            inst.result = { win, score, lines: lines(win ? 'CHAMPION OF THE GALAXY' : 'THE CROWD WENT HOME') };
          }
        }
        parts.update(dt); pops.update(dt);
      },
      draw(g) {
        const b = ctx.beat(), ri = curRound(b), rd = rounds[ri];
        // Arena.
        sky(g, 13, 140, [P.ink, P.deep, P.navy, P.indigo]);
        stars(g, t, { n: 30, seed: 18, y0: 14, y1: 60 });
        rect(g, 40, 20, 176, 16, P.blood); rect(g, 40, 20, 176, 1, P.red);
        text(g, 'GALACTIC RHYME FEDERATION', 128, 25, P.gold3, { align: 'center', shadow: P.ink });
        const lc = [P.magenta, P.cyan, P.amber, P.lime];
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 2 + Math.sin(t * (0.7 + i * 0.2) + i) * 0.45, x = 30 + i * 65;
          g.globalAlpha = 0.14 + (b % 1 < 0.15 ? 0.08 : 0);
          poly(g, [[x, 14], [x + Math.cos(a) * 140 - Math.sin(a) * 16, 14 + Math.sin(a) * 140 + Math.cos(a) * 16], [x + Math.cos(a) * 140 + Math.sin(a) * 16, 14 + Math.sin(a) * 140 - Math.cos(a) * 16]], lc[i]);
          g.globalAlpha = 1;
        }
        poly(g, [[16, 104], [240, 104], [252, 118], [4, 118]], P.s1); rect(g, 4, 118, 248, 4, P.s0);
        for (let x = 22; x < 236; x += 14) rect(g, x, 105, 1, 12, P.s2);
        // MCs: bob on the beat, lean in on their bar.
        const bob = k => Math.round(Math.abs(Math.sin(b * Math.PI)) * 2 * k);
        const hisTurn = rd && b < rd.echoAt, myTurn = rd && b >= rd.echoAt;
        for (const [x, on, c] of [[78, myTurn, P.cyan], [178, hisTurn, P.red]]) if (on) { g.globalAlpha = 0.2; ellipse(g, x, 104, 26, 6, c); g.globalAlpha = 1; }
        g.drawImage(ME[myTurn ? 1 : 0], 58, 50 - bob(myTurn ? 1.5 : 0.6));
        g.drawImage(HIM[hisTurn ? 1 : 0], 158, 50 - bob(hisTurn ? 1.5 : 0.6));
        // Crowd.
        const r = rng(9);
        for (let i = 0; i < 46; i++) {
          const x = r() * W, s = 5 + r() * 4, ph = r() * 6.28;
          const jump = Math.max(0, Math.sin(b * Math.PI * 2 + ph)) * (1 + crowdJump * 3) * (hype > 0.6 ? 1.5 : 1);
          const c = [P.ink, '#0f0c1c', P.deep][(r() * 3) | 0];
          const y = 140 - jump;
          ellipse(g, x, y - s * 1.6, s * 0.55, s * 0.6, c);
          poly(g, [[x - s, y + 8], [x - s * 0.8, y - s], [x + s * 0.8, y - s], [x + s, y + 8]], c);
          if (hype > 0.55 && r() < 0.4) rect(g, x + s * 0.5, y - s * 2.8, 2, s * 1.2, c);
        }
        // Hype meter: tug of war.
        rect(g, 20, 16, 216, 1, P.ink);
        const mx = 20 + 216 * hype;
        rect(g, 20, 14, mx - 20, 5, P.cyan); rect(g, mx, 14, 236 - mx, 5, P.red);
        rect(g, 20, 14, mx - 20, 1, P.ice); rect(g, mx - 1, 12, 3, 9, P.white);
        rect(g, 127, 12, 1, 9, P.ink);
        // The panel: label row, then the lane.
        rect(g, 0, 146, W, 78, P.ink); rect(g, 0, 146, W, 1, P.s1);
        const toGo = rd ? rd.echoAt - b : 9;
        let label = 'GET READY: KILOWATT GOES FIRST', lc2 = P.s3;
        if (rd && hisTurn) { label = toGo <= 3 ? 'YOUR TURN IN ' + Math.ceil(toGo) + '...' : "KILOWATT'S LINE: WATCH IT"; lc2 = toGo <= 3 ? P.amber : P.red; }
        else if (rd) { label = 'YOUR ECHO! HIT THEM AT THE RING'; lc2 = P.cyan; }
        if (rd && myTurn && b - rd.echoAt < 0.75) text(g, 'GO!', 128, 149, P.cyan, { align: 'center', scale: 2, shadow: P.ink });
        else text(g, label, 8, 150, lc2);
        text(g, 'ROUND ' + Math.max(1, ri + 1) + '/' + ROUNDS, 248, 150, P.s3, { align: 'right' });
        // Lane.
        const top = LANEY - 13, bot = LANEY + 13;
        rect(g, 0, top, W, bot - top, myTurn ? '#10213a' : '#160d22');
        rect(g, 0, top, W, 1, myTurn ? P.teal : P.s0); rect(g, 0, bot - 1, W, 1, myTurn ? P.teal : P.s0);
        // Beat lines scroll with the notes (bar lines brighter).
        for (let k = Math.floor(b) - 1; k <= b + 5; k++) {
          const x = Math.round(HITX + (k - b) * PXB);
          if (x < 0 || x > W) continue;
          const barLine = ((k - START) % 4 + 4) % 4 === 0;
          rect(g, x, top + 1, 1, bot - top - 2, barLine ? P.s2 : P.s0);
        }
        // Where his notes come from: a speaker at the right end.
        rect(g, 244, top + 2, 12, bot - top - 4, P.blood); rect(g, 245, top + 4, 10, bot - top - 8, P.red);
        for (let y = top + 6; y < bot - 6; y += 3) rect(g, 247, y, 6, 1, P.blood);
        // Hit ring.
        const pulse = (b % 1) < 0.15 ? 1 : 0;
        ring(g, HITX + 0.5, LANEY + 0.5, 12 + pulse + ringT * 2, myTurn || toGo <= 3 ? P.white : P.s2, 2);
        ring(g, HITX + 0.5, LANEY + 0.5, 9, myTurn ? P.cyan : P.s1);
        // Notes in flight: every note he has rapped, sliding toward its echo time.
        for (const r of rounds) for (const n of r.notes) {
          if (!n.shown || (n.hit && n.hit !== 'miss')) continue;
          const x = HITX + (n.beat - b) * PXB;
          if (x < -10 || x > 244) continue;
          g.drawImage(icon(n.b, n.hit === 'miss' ? 'miss' : ''), Math.round(x - 8), LANEY - 8);
        }
        // Countdown before your bar, GO! on the downbeat.
        if (rd && hisTurn && toGo <= 3 && toGo > 0) {
          const nn = Math.ceil(toGo), f = toGo - Math.floor(toGo);
          // The digit sits inside the ring, popping on each count.
          const pop = f > 0.8 ? 1 : 0;
          text(g, String(nn), HITX + 1, LANEY - 6 - pop, P.amber, { align: 'center', scale: 2, shadow: P.ink });
        }
        beatLamp(g, 128, 212, b, hisTurn ? P.red : P.cyan);
        text(g, combo > 2 ? 'COMBO ' + combo : '', 8, 209, P.amber);
        text(g, 'P' + tally.perfect + ' G' + tally.great + ' OK' + tally.ok + ' X' + tally.miss, 248, 209, P.s2, { align: 'right' });
        parts.draw(g); pops.draw(g);
        // Tecmo cut-in: a slanted panel with the MC's face.
        if (cutIn) {
          const k = Math.min(1, cutIn.t * 6) * Math.min(1, (0.7 - cutIn.t) * 6);
          const left = cutIn.who === 'deltron';
          const face = bust(left ? CAST.deltron : CAST.rival, (t * 10 | 0) % 2 === 0);
          const y0 = 34, h = 62, w = 150 * k;
          const x0 = left ? 0 : W - w;
          g.save();
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w, y0); g.lineTo(x0 + w - (left ? 14 : -14), y0 + h); g.lineTo(x0 - (left ? 14 : -14), y0 + h); g.closePath(); g.clip();
          rect(g, 0, y0, W, h, left ? P.navy : P.blood);
          for (let i = 0; i < 8; i++) rect(g, 0, y0 + i * 8 + ((t * 80) % 8), W, 1, left ? P.indigo : P.red);
          g.drawImage(face, 0, 14, 96, 60, left ? x0 + w - 110 : x0 + 14, y0 + 2, 96, 60);
          g.restore();
          if (k > 0.8) text(g, left ? 'ZERO!' : 'KILOWATT!', left ? 12 : W - 12, y0 + h - 12, P.white, { align: left ? 'left' : 'right', scale: 2, shadow: P.ink });
        }
        topBar(g, 'TRACK 18  BATTLESONG', score);
      },
      // Bot: press each echo note on its beat.
      auto() {
        const b = ctx.beat(), out = [];
        for (const r of rounds) for (const n of r.notes) {
          if (n.hit || botPress.has(n)) continue;
          if (b >= n.beat - 0.01 && b < n.beat + 0.1) { out.push(n.b); botPress.add(n); break; }
        }
        return out;
      },
    };
    function lines(msg) { return [msg, `PERFECT ${tally.perfect}`, `GREAT   ${tally.great}`, `OK      ${tally.ok}`, `MISSED  ${tally.miss}`, `BEST COMBO ${best}`]; }
    return inst;
  },
};
