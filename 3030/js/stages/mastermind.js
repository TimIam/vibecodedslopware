// Track 10, Mastermind: VAULT CRACKER.
// Code-breaking at the Bank of Time. Dial in a four-symbol guess on the vault door and read the
// pins: red = right symbol in the right slot, white = right symbol in the wrong slot.
// Two vaults, ten guesses each; running dry trips the alarm (a strike, and a fresh code).
import { W, H, P, RAMP, canvas, rect, px, line, ellipse, ring, poly, ball, rampAt, mix, box, spr, bake } from '../gfx.js';
import { text, measure } from '../font.js';
import { blob } from '../art.js';
import { topBar, Pops, Particles, bar } from '../hud.js';

const TIME = 200, GUESSES = 10, STRIKES = 2;
const VAULTS = [{ slots: 4, syms: 6 }, { slots: 4, syms: 7 }];

// ----------------------------------------------------------------- icons
const PAL = {
  k: P.ink, g: '#2f2c46', r: P.red, w: P.pink, s: P.s3, S: P.s4, d: P.s1, o: P.orange, O: P.amber, c: P.cyan,
  b: P.brown1, y: P.gold2, Y: P.gold3, e: P.gold1, W: P.white, R: '#ff7a7a', C: P.cream, l: P.lime, L: '#e6ffb0', f: P.forest,
};
const ART = [
  // vinyl
  `...kkkkk...
.kkgggggkk.
.kgkkkkkgk.
kgkgggggkgk
kgkgrrrgkgk
kgkgrwrgkgk
kgkgrrrgkgk
kgkgggggkgk
.kgkkkkkgk.
.kkgggggkk.
...kkkkk...`,
  // mic
  `...sssss...
..sSdSdSs..
..sdSdSds..
..sSdSdSs..
...sssss...
....ddd....
....kkk....
....kgk....
....kgk....
....kkk....
...kkkkk...`,
  // mech
  `.....k.....
.....O.....
..ooooooo..
.oOOOOOOOo.
.oOcccccOo.
.oOcWcWcOo.
.oOcccccOo.
.oOOOOOOOo.
.oobbbbboo.
..obkbkbo..
...ooooo...`,
  // star
  `.....Y.....
....YYy....
....Yyy....
...Yyyye...
YYYYyyyyyye
.eYyyyyyye.
..eYyyyye..
..Yyyeyyy..
.Yyye.eyye.
.Yye...eye.
.ee.....ee.`,
  // eye
  `...........
....kkk....
..kkWWWkk..
.kWWcccWWk.
kWWcckkcWWk
kWWcckkcWWk
.kWWcccWWk.
..kkWWWkk..
....kkk....
...........
...........`,
  // alarm clock
  `.k.......k.
kRk.....kRk
.kkrrrrrkk.
.rrCCCCCrr.
.rCCCCkCCr.
.rCCCCkCCr.
.rCCkkkCCr.
.rCCCCCCCr.
.rrCCCCCrr.
..rrrrrrr..
.k.......k.`,
  // bolt
  `......lll..
.....lLl...
....lLl....
...lLl.....
..lLllllll.
..llllllLl.
......lLl..
.....lLl...
....lLl....
...lLl.....
...ll......`,
];
const ICON = ART.map(a => spr(a, PAL, { outline: true }));

function feedback(code, guess, nsym) {
  let red = 0, white = 0;
  const cc = new Array(nsym).fill(0), gc = new Array(nsym).fill(0);
  for (let i = 0; i < code.length; i++) { if (code[i] === guess[i]) red++; else { cc[code[i]]++; gc[guess[i]]++; } }
  for (let s = 0; s < nsym; s++) white += Math.min(cc[s], gc[s]);
  return [red, white];
}
function allCodes(slots, nsym) {
  const out = [];
  const n = nsym ** slots;
  for (let i = 0; i < n; i++) { const c = []; let v = i; for (let k = 0; k < slots; k++) { c.push(v % nsym); v = Math.floor(v / nsym); } out.push(c.reverse()); }
  return out;
}

// The door, baked once: gold disc, bolts round the rim, a riveted inner ring.
function doorImg(r) {
  return bake('mmdoor' + r, r * 2 + 6, r * 2 + 6, g => {
    const c = r + 3;
    ball(g, c, c, r, r, RAMP.gold, { rim: P.cream });
    ring(g, c, c, r - 7, P.gold0, 2);
    ball(g, c, c, r - 10, r - 10, [P.gold0, P.gold1, P.gold1, P.gold2, P.gold3]);
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; ball(g, c + Math.cos(a) * (r - 4), c + Math.sin(a) * (r - 4), 2.5, 2.5, RAMP.steel); }
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; px(g, c + Math.cos(a) * (r - 13), c + Math.sin(a) * (r - 13), P.gold3); }
  });
}

export default {
  id: 'mastermind', track: 10, song: 'mastermind', name: 'Mastermind', title: 'VAULT CRACKER',
  blurb: 'Every song ever recorded is locked in the Bank of Time. Crack two vault codes. Red pin: right symbol, right slot. White pin: right symbol, wrong slot.',
  how: ['◀ ▶ PICK A DIAL', '▲ ▼ TURN THE DIAL', 'Ⓐ TRY THE CODE', '10 TRIES A VAULT'],
  par: [600, 1150, 1500, 1900],
  make(ctx) {
    const I = pad(ctx.I);
    const pops = Pops(), parts = Particles();
    let vi = 0, cfg = VAULTS[0], code = null, guesses = [], dial = [], ang = [], sel = 0;
    let time = TIME, t = 0, strikes = 0, state = 'enter', stT = 0, scoreV = 0, totalGuesses = 0, lastTick = 99, opened = 0;
    let wheel = 0, wheelV = 0, revealed = null;
    let cands = null, botRel = false, botPlan = null;
    const newCode = () => {
      code = Array.from({ length: cfg.slots }, () => Math.floor(ctx.rng() * cfg.syms));
      guesses = []; revealed = null;
      cands = allCodes(cfg.slots, cfg.syms); botPlan = null;
    };
    const startVault = () => {
      cfg = VAULTS[vi];
      newCode();
      dial = new Array(cfg.slots).fill(0); ang = new Array(cfg.slots).fill(0); sel = 0;
      state = 'enter'; stT = 0;
    };
    startVault();
    const DX = 70, DY = 112, R = 54;
    const dialX = i => DX + (i - (cfg.slots - 1) / 2) * 25;

    const submit = () => {
      const g = dial.slice();
      const [red, white] = feedback(code, g, cfg.syms);
      guesses.push({ g, red, white });
      totalGuesses++;
      cands = cands.filter(c => { const [r2, w2] = feedback(c, g, cfg.syms); return r2 === red && w2 === white; });
      botPlan = null;
      state = 'reveal'; stT = 0; wheelV = 14;
      ctx.sfx('lock');
    };

    const inst = {
      result: null,
      get dbg() { return { code, state, guesses, strikes, vi, time }; },
      update(dt) {
        t += dt; I.frame(dt);
        pops.update(dt); parts.update(dt);
        for (let i = 0; i < cfg.slots; i++) { const target = dial[i] * Math.PI * 2 / cfg.syms; ang[i] += (target - ang[i]) * Math.min(1, dt * 14); }
        wheel += wheelV * dt; wheelV *= Math.pow(0.02, dt);
        if (inst.result) return;
        if (state !== 'open') {
          time -= dt;
          if (time <= 15 && Math.ceil(time) !== lastTick) { lastTick = Math.ceil(time); ctx.sfx('tick'); }
          if (time <= 0) {
            time = 0; ctx.sfx('alarm'); ctx.shake(5); ctx.flash(0.4);
            inst.result = { win: false, score: opened * 400, lines: [`VAULTS ${opened}/${VAULTS.length}`, `GUESSES ${totalGuesses}`, 'OUT OF TIME'] };
            return;
          }
        }
        stT += dt;
        if (state === 'enter') {
          if (I.rep('left')) { sel = (sel + cfg.slots - 1) % cfg.slots; ctx.sfx('move'); }
          if (I.rep('right')) { sel = (sel + 1) % cfg.slots; ctx.sfx('move'); }
          if (I.rep('up')) { dial[sel] = (dial[sel] + 1) % cfg.syms; ctx.sfx('tick'); }
          if (I.rep('down')) { dial[sel] = (dial[sel] + cfg.syms - 1) % cfg.syms; ctx.sfx('tick'); }
          if (I.hit('a')) submit();
          return;
        }
        if (state === 'reveal') {
          const last = guesses[guesses.length - 1], n = last.red + last.white;
          const k = Math.floor(stT / 0.14);
          if (k < n && Math.floor((stT - dt) / 0.14) < k) ctx.sfx(k < last.red ? 'good' : 'flip');
          if (stT > 0.14 * n + 0.35) {
            if (last.red === cfg.slots) {
              state = 'open'; stT = 0; opened++;
              const pts = Math.max(300, 1200 - 100 * guesses.length);
              scoreV += pts;
              ctx.sfx('power'); ctx.flash(0.6); ctx.shake(3);
              pops.add('VAULT OPEN +' + pts, DX, DY - 20, P.amber, 1.6);
              parts.burst(DX, DY, 40, [P.gold3, P.amber, P.white, P.cream], 120, 1.1);
            } else if (guesses.length >= GUESSES) {
              state = 'alarm'; stT = 0; strikes++; revealed = code.slice();
              ctx.sfx('alarm'); ctx.shake(5); ctx.flash(0.5);
              scoreV -= 300;
            } else state = 'enter';
          }
          return;
        }
        if (state === 'open') {
          if (stT > 0.5 && stT - dt <= 0.5) ctx.sfx('coin');
          if (stT > 2.2) {
            vi++;
            if (vi >= VAULTS.length) {
              const left = Math.ceil(time), tb = left * 4;
              inst.result = { win: true, score: Math.max(0, scoreV) + tb, lines: [`VAULTS ${opened}/${VAULTS.length}`, `GUESSES ${totalGuesses}`, `ALARMS ${strikes}`, `TIME BONUS ${tb}`] };
              return;
            }
            startVault();
          }
          return;
        }
        if (state === 'alarm') {
          if (stT > 2.6) {
            if (strikes >= STRIKES) {
              inst.result = { win: false, score: Math.max(0, scoreV) + opened * 0, lines: [`VAULTS ${opened}/${VAULTS.length}`, `GUESSES ${totalGuesses}`, `ALARMS ${strikes}`, 'SECURITY ARRIVED'] };
              return;
            }
            newCode(); state = 'enter'; stT = 0;
          }
        }
      },
      // Bot: always guess the first code still consistent with every pin so far.
      auto() {
        if (state !== 'enter' || inst.result) return [];
        if (botRel) { botRel = false; return []; }
        if (!botPlan) botPlan = guesses.length === 0 ? Array.from({ length: cfg.slots }, (_, i) => (i < cfg.slots / 2 ? 0 : 1)) : cands[0].slice();
        botRel = true;
        const i = dial.findIndex((d, k) => d !== botPlan[k]);
        if (i < 0) return ['a'];
        if (i !== sel) return [((i - sel + cfg.slots) % cfg.slots) <= cfg.slots / 2 ? 'right' : 'left'];
        const up = (botPlan[i] - dial[i] + cfg.syms) % cfg.syms;
        return [up <= cfg.syms / 2 ? 'up' : 'down'];
      },
      draw(g) {
        // Vault room: steel panels, rivets, a floor.
        for (let x = 0; x < W; x++) { const v = 0.3 + ((x % 32) < 2 ? 0.2 : 0) - ((x % 32) > 29 ? 0.15 : 0); g.fillStyle = rampAt(RAMP.steel, v * 0.8, x, 0); g.fillRect(x, 13, 1, 177); }
        for (let y = 24; y < 190; y += 28) for (let x = 6; x < W; x += 32) { px(g, x, y, P.s3); px(g, x + 20, y, P.s0); }
        rect(g, 0, 190, W, 34, P.s0); rect(g, 0, 190, W, 1, P.s2);
        for (let x = 0; x < W; x += 16) rect(g, x + ((x / 16) % 2) * 8, 196, 8, 1, P.s1);
        // Laser grid, drifting.
        g.globalAlpha = 0.35;
        for (let i = 0; i < 6; i++) { const o = (t * 14 + i * 46) % 280 - 20; line(g, o, 13, o - 60, 190, P.red); line(g, W - o, 13, W - o + 60, 190, P.red); }
        g.globalAlpha = 1;
        // Door (swings open on a crack).
        const dimg = doorImg(R);
        const openK = state === 'open' ? Math.min(1, stT / 0.7) : 0;
        if (openK > 0) {
          // The vault inside: shelves of gold records.
          ellipse(g, DX, DY, R, R, P.ink);
          for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) { const x = DX - 40 + k * 15, y = DY - 34 + r * 20; if ((x - DX) ** 2 + (y - DY) ** 2 < 46 * 46) { ellipse(g, x, y, 6, 6, P.gold1); ellipse(g, x, y, 2, 2, P.red); px(g, x - 2, y - 3, P.gold3); } }
          g.globalAlpha = 0.25 + Math.sin(t * 10) * 0.1; ellipse(g, DX, DY, R - 4, R - 4, P.amber); g.globalAlpha = 1;
          const w = Math.max(4, dimg.width * (1 - openK * 0.92));
          g.drawImage(dimg, DX - R - 3, DY - R - 3, w, dimg.height);
        } else g.drawImage(dimg, DX - R - 3, DY - R - 3);
        if (openK === 0) {
          // Plaque.
          rect(g, DX - 26, DY - 44, 52, 11, P.ink); rect(g, DX - 25, DY - 43, 50, 9, P.gold0);
          text(g, `VAULT ${vi + 1}`, DX, DY - 42, P.gold3, { align: 'center' });
          text(g, `TRY ${Math.min(guesses.length + 1, GUESSES)}/${GUESSES}`, DX, DY - 28, P.gold0, { align: 'center' });
          // Dial plate.
          const pw = cfg.slots * 25 + 10;
          rect(g, DX - pw / 2 - 1, DY - 15, pw + 2, 32, P.ink);
          for (let y = 0; y < 30; y++) { g.fillStyle = rampAt(RAMP.steel, 0.75 - y / 40, 0, y); g.fillRect(DX - pw / 2, DY - 14 + y, pw, 1); }
          for (let i = 0; i < cfg.slots; i++) {
            const x = dialX(i), on = i === sel && state === 'enter';
            ball(g, x, DY + 1, 11, 11, RAMP.steel, { rim: on ? P.amber : P.s4 });
            ellipse(g, x, DY + 1, 8, 8, P.cream);
            for (let k = 0; k < cfg.syms; k++) { const a = ang[i] - k * Math.PI * 2 / cfg.syms - Math.PI / 2; px(g, x + Math.cos(a) * 10, DY + 1 + Math.sin(a) * 10, k === 0 ? P.red : P.s0); }
            g.drawImage(ICON[dial[i]], x - 6, DY - 5);
            if (on && (t * 3 | 0) % 2 === 0) { text(g, '▲', x, DY - 23, P.amber, { align: 'center' }); text(g, '▼', x, DY + 16, P.amber, { align: 'center' }); }
          }
          // Handle wheel.
          const hx = DX, hy = DY + 34;
          ring(g, hx, hy, 9, P.gold0, 2);
          for (let k = 0; k < 3; k++) { const a = wheel + k * 2.094; line(g, hx, hy, hx + Math.cos(a) * 12, hy + Math.sin(a) * 12, P.gold0); ball(g, hx + Math.cos(a) * 13, hy + Math.sin(a) * 13, 2.5, 2.5, RAMP.steel); }
          ball(g, hx, hy, 3, 3, RAMP.steel);
        }
        // Ledger.
        box(g, 136, 18, 116, 192, '#e9dcb4', P.brown2, P.cream);
        text(g, 'LEDGER', 194, 22, P.brown1, { align: 'center' });
        rect(g, 140, 31, 108, 1, P.brown3);
        for (let r = 0; r < GUESSES; r++) {
          const y = 34 + r * 17, row = guesses[r];
          if (r % 2) rect(g, 138, y - 1, 112, 17, '#dfcfa2');
          text(g, String(r + 1).padStart(2, ' '), 150, y + 4, P.brown2, { align: 'right' });
          if (row) {
            row.g.forEach((s, i) => g.drawImage(ICON[s], 154 + i * 14, y + 1));
            const isLast = r === guesses.length - 1 && state === 'reveal';
            const shownN = isLast ? Math.floor(stT / 0.14) : 99;
            for (let k = 0; k < cfg.slots; k++) {
              const col = k < Math.min(shownN, row.red) ? P.red : k < Math.min(shownN, row.red + row.white) ? P.white : null;
              const cx = 214 + (k % 2) * 8, cy2 = y + 3 + Math.floor(k / 2) * 7;
              ellipse(g, cx, cy2, 3, 3, P.brown1);
              if (col) { ellipse(g, cx, cy2, 2.5, 2.5, col); px(g, cx - 1, cy2 - 1, col === P.red ? '#ff9a9a' : P.white); }
              else ellipse(g, cx, cy2, 1.5, 1.5, '#5a4630');
            }
            if (row.red === cfg.slots) text(g, '★', 240, y + 4, P.gold1);
          } else if (r === guesses.length && state === 'enter') {
            dial.forEach((s, i) => { g.globalAlpha = 0.35; g.drawImage(ICON[s], 154 + i * 14, y + 1); g.globalAlpha = 1; });
          }
        }
        // The code, shown after an alarm.
        if (revealed && state === 'alarm') {
          rect(g, 138, 188, 112, 20, P.blood); text(g, 'CODE', 144, 194, P.cream);
          revealed.forEach((s, i) => g.drawImage(ICON[s], 172 + i * 14, 191));
        }
        // Bottom left: alarms and the clock.
        text(g, 'ALARMS', 12, 182, P.s4);
        for (let k = 0; k < STRIKES; k++) { const on = k < strikes; ellipse(g, 58 + k * 12, 185, 4, 4, P.ink); ellipse(g, 58 + k * 12, 185, 3, 3, on ? ((t * 6 | 0) % 2 ? P.red : P.blood) : P.s1); }
        text(g, 'SYMBOLS', 80, 182, P.s4); text(g, String(cfg.syms), 124, 182, P.amber);
        const low = time < 30;
        bar(g, 40, 206, 88, time / TIME, low ? ((t * 4 | 0) % 2 ? P.red : P.amber) : P.cyan, 'TIME');
        // Alarm wash.
        if (state === 'alarm' && (t * 6 | 0) % 2) { g.globalAlpha = 0.25; rect(g, 0, 13, W, H - 13, P.red); g.globalAlpha = 1; }
        parts.draw(g); pops.draw(g);
        topBar(g, 'VAULT CRACKER', Math.ceil(time) + ' S', `VAULT ${Math.min(vi + 1, VAULTS.length)}/${VAULTS.length}`);
      },
    };
    return inst;
  },
};

// Edge-safe buttons with menu-style auto-repeat (see upgrade.js).
function pad(I) {
  const last = {}, now = {}, held = {};
  return {
    frame(dt) {
      for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) {
        const h = I.hit(b);
        now[b] = h && !last[b]; last[b] = h;
        held[b] = I.down(b) ? (now[b] ? -0.3 : (held[b] ?? 0) + dt) : 0;
      }
    },
    hit: b => now[b],
    rep(b) { if (now[b]) return true; if (held[b] >= 0.12) { held[b] = 0; return true; } return false; },
  };
}
