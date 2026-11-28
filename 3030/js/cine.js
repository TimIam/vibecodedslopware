// Cinema scenes, Tecmo style: a framed picture in the top of a black screen, typed dialogue
// underneath with a blip per letter, portraits that talk while text types, hard cuts with a
// white flash, and the odd extreme close-up of a pair of eyes.
import { W, H, canvas, P, RAMP, rect, px, line, poly, ellipse, ring, ball, sky, stars, skyline, drawStrip, perisphere, frame, rng, rampAt, mix, ditherRect, bake, dith } from './gfx.js';
import { text, wrap, measure } from './font.js';
import { bust, CAST, blob, DELTRON } from './art.js';
import * as A from './audio.js';
import { getSong } from './songs.js';
import { I } from './input.js';

export const PW = 240, PH = 140;
const PX = 8, PY = 10;

// ----------------------------------------------------------------- painters
const shine = (g, x, y, w, h, c, a) => { g.globalAlpha = a; rect(g, x, y, w, h, c); g.globalAlpha = 1; };
function beam(g, x, y, ang, len, w, c, a) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  g.globalAlpha = a;
  poly(g, [[x, y], [x + dx * len + nx * w, y + dy * len + ny * w], [x + dx * len - nx * w, y + dy * len - ny * w]], c);
  g.globalAlpha = 1;
}
function crowd(g, t, y, n, cols, seed = 5, amp = 2) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * PW, s = 5 + r() * 4, ph = r() * 6.28, bob = Math.max(0, Math.sin(t * 6 + ph)) * amp;
    const c = cols[(r() * cols.length) | 0];
    ellipse(g, x, y - s * 1.6 - bob, s * 0.55, s * 0.6, c);
    poly(g, [[x - s, y + 10], [x - s * 0.8, y - s - bob], [x + s * 0.8, y - s - bob], [x + s, y + 10]], c);
    if (r() < 0.25) rect(g, x + s * 0.6, y - s * 2.6 - bob * 2, 2, s * 1.4, c);
  }
}

export const PAINT = {
  // Gradient wash, for portraits.
  grad(g, t, o) { sky(g, 0, PH, o.cols || [P.ink, P.deep, P.navy, P.indigo]); if (o.stars !== false) stars(g, t, { n: 40, seed: 9, y1: PH }); },

  // Radial speed lines behind a portrait: the big-moment look.
  speed(g, t, o) {
    sky(g, 0, PH, o.cols || [P.blood, P.red, P.orange, P.amber]);
    const r = rng(7), cx = o.cx ?? PW * 0.3, cy = PH * 0.45;
    for (let i = 0; i < 46; i++) {
      const a = r() * 6.283 + Math.sin(t * 0.7 + i) * 0.02, w = 0.5 + r() * 2.5;
      beam(g, cx, cy, a, 260, w, o.line || P.cream, 0.55);
    }
    g.globalAlpha = 0.5; ellipse(g, cx, cy, 30, 30, o.cols ? o.cols[3] : P.amber); g.globalAlpha = 1;
  },

  // The Corporate Institutional Bank of Time over the old fairgrounds.
  bank(g, t, o) {
    const broken = o.broken;
    sky(g, 0, 112, broken ? [P.indigo, P.violet, P.magenta, P.pink, P.amber, P.cream] : [P.ink, P.deep, P.navy, P.indigo, P.violet, P.magenta]);
    stars(g, t, { n: broken ? 10 : 50, seed: 4, y1: 70 });
    g.drawImage(perisphere(14, [P.deep, P.navy, P.indigo, P.violet, P.purple], P.magenta), 178, 56);
    drawStrip(g, skyline(11, 46, P.deep, broken ? P.amber : P.violet), t * 4, 78);
    // Searchlights.
    if (!broken) for (const [x, s] of [[70, 0.6], [170, -0.5]]) beam(g, x, 128, -Math.PI / 2 + Math.sin(t * s) * 0.5, 170, 14, P.cream, 0.12);
    // The tower: three stepped deco tiers and a spire.
    const cx = 120, tiers = [[84, 64, 140], [60, 40, 64], [38, 24, 40]];
    for (const [w, y0, y1] of tiers) {
      for (let x = 0; x < w; x++) {
        const f = x / w, v = 0.25 + (1 - f) * 0.45 - (x % 6 === 0 ? 0.15 : 0);
        for (let y = y0; y < y1; y++) { g.fillStyle = rampAt(RAMP.steel, v * (broken ? 1.1 : 0.85), cx - w / 2 + x, y); g.fillRect(cx - w / 2 + x, y, 1, 1); }
      }
      rect(g, cx - w / 2 - 2, y0, w + 4, 2, P.s3);
    }
    poly(g, [[cx - 4, 24], [cx, 2], [cx + 4, 24]], P.s2); line(g, cx, 2, cx, 24, P.s3);
    const r = rng(31);
    for (let y = 70; y < 136; y += 5) for (let x = cx - 38; x < cx + 38; x += 4) if (r() < 0.45) rect(g, x, y, 2, 3, broken ? P.s1 : (r() < 0.15 ? P.cream : P.amber));
    // The clock.
    ellipse(g, cx, 51, 12, 12, P.gold1); ellipse(g, cx, 51, 10, 10, broken ? P.s1 : P.cream);
    for (let i = 0; i < 12; i++) px(g, cx + Math.cos(i * 0.5236) * 8, 51 + Math.sin(i * 0.5236) * 8, P.ink);
    if (broken) { line(g, cx - 9, 45, cx + 3, 56, P.ink); line(g, cx + 3, 56, cx + 8, 48, P.ink); }
    else {
      const a1 = t * 0.6, a2 = t * 7.2;
      line(g, cx, 51, cx + Math.cos(a1) * 5, 51 + Math.sin(a1) * 5, P.ink);
      line(g, cx, 51, cx + Math.cos(a2) * 8, 51 + Math.sin(a2) * 8, P.red);
    }
    rect(g, cx - 34, 67, 68, 10, P.ink); rect(g, cx - 34, 67, 68, 1, P.gold1);
    text(g, 'BANK OF TIME', cx, 69, broken ? P.s2 : P.gold3, { align: 'center' });
    rect(g, 0, 136, PW, 4, P.ink);
  },

  // Inside the vault: shelves of hourglasses and the great round door.
  vault(g, t, o) {
    sky(g, 0, PH, [P.ink, P.deep, P.navy]);
    for (let row = 0; row < 4; row++) {
      const y = 18 + row * 32;
      rect(g, 0, y + 22, 120, 3, P.gold0);
      for (let i = 0; i < 9; i++) {
        const x = 6 + i * 13, sand = (Math.sin(i * 3 + row) * 0.5 + 0.5);
        rect(g, x, y, 9, 2, P.gold2); rect(g, x, y + 20, 9, 2, P.gold2);
        poly(g, [[x + 1, y + 2], [x + 8, y + 2], [x + 5, y + 11], [x + 4, y + 11]], '#3b3f62');
        poly(g, [[x + 4, y + 11], [x + 5, y + 11], [x + 8, y + 20], [x + 1, y + 20]], '#3b3f62');
        rect(g, x + 2, y + 20 - sand * 6, 5, sand * 6, P.amber);
        if ((t * 3 + i) % 2 < 1.6) px(g, x + 4, y + 12 + ((t * 20 + i * 5) % 7), P.amber);
      }
    }
    // Door.
    const cx = 182, cy = 70;
    ball(g, cx, cy, 52, 52, RAMP.gold, { rim: P.cream });
    ellipse(g, cx, cy, 40, 40, P.gold1);
    ball(g, cx, cy, 36, 36, [P.gold0, P.gold1, P.gold2, P.gold2, P.gold3]);
    for (let i = 0; i < 6; i++) { const a = i * 1.047 + t * (o.spin || 0.2); line(g, cx, cy, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, P.gold0); }
    ball(g, cx, cy, 9, 9, RAMP.steel);
    for (let i = 0; i < 3; i++) { g.globalAlpha = 0.6; rect(g, 0, 40 + i * 30 + Math.sin(t * 2 + i) * 6, PW, 1, P.red); g.globalAlpha = 1; }
  },

  // Mars: red dust and a probe calling home.
  mars(g, t) {
    sky(g, 0, 96, [P.ink, P.blood, P.red, P.orange, P.amber]);
    stars(g, t, { n: 20, seed: 12, y1: 50 });
    ellipse(g, 200, 24, 3, 3, P.cyan); px(g, 199, 23, P.ice);
    for (const [y, c, a, f] of [[84, P.brown1, 10, 0.03], [100, P.brown2, 7, 0.05], [118, P.brown3, 5, 0.08]]) {
      g.fillStyle = c;
      for (let x = 0; x < PW; x++) { const h = y + Math.sin(x * f + y) * a + Math.sin(x * f * 2.3) * a * 0.4; g.fillRect(x, h, 1, PH - h); }
    }
    // Lander.
    const lx = 140, ly = 104;
    line(g, lx - 14, ly + 12, lx - 8, ly, P.s3); line(g, lx + 14, ly + 12, lx + 8, ly, P.s3);
    blob(g, [{ x: lx, y: ly - 4, rx: 13, ry: 9, h: 8 }], RAMP.gold, { rim: P.amber });
    rect(g, lx - 2, ly - 22, 2, 10, P.s3);
    poly(g, [[lx - 10, ly - 26], [lx + 8, ly - 30], [lx + 2, ly - 18]], P.s4);
    for (let i = 0; i < 4; i++) { const r = ((t * 30 + i * 18) % 72); g.globalAlpha = 1 - r / 72; ring(g, lx, ly - 27, r, P.cyan); g.globalAlpha = 1; }
  },

  // A cell under the bank. o.portal opens a tear in the wall.
  prison(g, t, o) {
    rect(g, 0, 0, PW, PH, P.deep);
    for (let y = 0; y < PH; y += 8) for (let x = (y / 8 % 2) * 8; x < PW; x += 16) { rect(g, x, y, 15, 7, P.navy); rect(g, x, y, 15, 1, P.indigo); }
    rect(g, 0, 112, PW, 28, P.ink); rect(g, 0, 112, PW, 1, P.s0);
    if (o.portal) {
      const cx = 150, cy = 64;
      for (let i = 9; i > 0; i--) { const r = i * 5 + Math.sin(t * 5 + i) * 2; ellipse(g, cx, cy, r * 0.7, r, i % 2 ? (i % 4 === 1 ? P.magenta : P.violet) : (i % 3 ? P.cyan : P.ice)); }
      ellipse(g, cx, cy, 6, 9, P.white);
      for (let i = 0; i < 16; i++) { const a = t * 2 + i * 0.4, r = 20 + (i * 7 % 30); px(g, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r, P.ice); }
    }
    // A barred window of light.
    shine(g, 20, 20, 36, 24, P.cream, 0.18);
    for (let i = 0; i < 4; i++) rect(g, 24 + i * 9, 20, 2, 24, P.ink);
    // Deltron on the bunk.
    rect(g, 34, 96, 60, 6, P.brown1); rect(g, 34, 102, 4, 10, P.brown0); rect(g, 90, 102, 4, 10, P.brown0);
    g.drawImage(DELTRON[0], 56, 74);
    // Bars in front.
    for (let x = 6; x < PW; x += 20) { rect(g, x, 0, 4, PH, P.s1); rect(g, x, 0, 1, PH, P.s3); rect(g, x + 3, 0, 1, PH, P.ink); }
    rect(g, 0, 8, PW, 4, P.s1); rect(g, 0, 8, PW, 1, P.s3);
  },

  // Night city under a manhunt. o.mech walks a hijacked mech across the foreground.
  city(g, t, o) {
    sky(g, 0, 100, o.dawn ? [P.navy, P.indigo, P.violet, P.magenta, P.orange] : [P.ink, P.deep, P.navy, P.indigo]);
    stars(g, t, { n: 40, seed: 2, y1: 70 });
    ball(g, 190, 26, 14, 14, [P.s2, P.s3, P.s4, P.cream, P.white]);
    g.drawImage(perisphere(18, [P.deep, P.navy, P.navy, P.indigo, P.violet], P.violet), 20, 28);
    for (const [x, s] of [[40, 0.7], [120, -0.4], [200, 0.55]]) beam(g, x, 140, -Math.PI / 2 + Math.sin(t * s + x) * 0.6, 170, 10, P.ice, 0.1);
    drawStrip(g, skyline(21, 60, P.deep, P.violet), t * 3, 56);
    drawStrip(g, skyline(22, 50, '#120f22', P.magenta, { tall: 1.2 }), t * 8, 78);
    drawStrip(g, skyline(23, 30, P.ink, P.amber, { spires: false }), t * 16, 110);
    if (o.roof) { rect(g, 0, 118, PW, 22, P.ink); rect(g, 0, 118, PW, 2, P.s1); rect(g, 180, 90, 24, 28, P.ink); poly(g, [[176, 92], [192, 80], [208, 92]], P.ink); }
    if (o.mech) {
      const x = ((t * 22) % (PW + 80)) - 40, step = Math.sin(t * 4);
      blob(g, [{ x, y: 96, rx: 16, ry: 11, h: 10 }, { x: x + 4, y: 89, rx: 8, ry: 6, h: 6, z: 6 }], RAMP.steel, { rim: P.orange });
      for (const s of [-1, 1]) { const k = s * step * 5; line(g, x + s * 8, 104, x + s * 8 + k, 124, P.s2); rect(g, x + s * 8 + k - 4, 124, 9, 3, P.s1); }
      rect(g, x + 2, 88, 6, 2, P.cyan);
    }
  },

  // The Automator's lab: monitors, a mech arm, the decks.
  lab(g, t) {
    rect(g, 0, 0, PW, PH, '#0d1a24');
    for (let x = 0; x < PW; x += 12) rect(g, x, 0, 1, 100, '#14303c');
    for (let y = 0; y < 100; y += 12) rect(g, 0, y, PW, 1, '#14303c');
    for (let i = 0; i < 3; i++) {
      const x = 22 + i * 70, y = 18;
      rect(g, x - 2, y - 2, 56, 40, P.s1); rect(g, x, y, 52, 36, '#04120e');
      for (let k = 0; k < 52; k++) { const v = Math.sin(k * 0.4 + t * (3 + i) + i) * Math.sin(k * 0.13 + t) * 12; px(g, x + k, y + 18 + v, i === 1 ? P.magenta : P.lime); }
      for (let r = 0; r < 4; r++) rect(g, x + 2, y + 2 + r * 3, 8 + ((t * 7 + r * 5 + i * 3) % 14), 1, P.forest);
    }
    // Cable runs.
    for (let i = 0; i < 3; i++) { const x0 = 18 + i * 70; for (let x = 0; x < 60; x++) px(g, x0 + x, 60 + Math.sin(x / 60 * Math.PI) * (8 + i * 3), [P.red, P.amber, P.cyan][i]); }
    // Desk and turntables.
    rect(g, 0, 100, PW, 40, P.brown1); rect(g, 0, 100, PW, 2, P.brown3);
    for (const x of [60, 150]) {
      rect(g, x - 30, 92, 60, 12, P.s1); rect(g, x - 30, 92, 60, 1, P.s3);
      ellipse(g, x - 6, 97, 20, 5, P.ink);
      const a = t * 9; px(g, x - 6 + Math.cos(a) * 14, 97 + Math.sin(a) * 3.5, P.s3);
      ellipse(g, x - 6, 97, 4, 1.5, P.red);
      line(g, x + 18, 93, x + 6, 98, P.s4);
    }
    for (let i = 0; i < 8; i++) { const on = (t * 4 + i * 1.7) % 3 < 1.5; rect(g, 100 + i * 5, 106, 3, 2, on ? (i % 2 ? P.lime : P.red) : P.s0); }
  },

  // The Galactic Rhyme Federation arena.
  arena(g, t, o) {
    sky(g, 0, PH, [P.ink, P.deep, P.navy, P.indigo]);
    stars(g, t, { n: 30, seed: 8, y1: 40 });
    // Banner.
    rect(g, 30, 6, 180, 20, P.blood); rect(g, 30, 6, 180, 2, P.red); rect(g, 30, 24, 180, 2, P.ink);
    text(g, 'GALACTIC RHYME FEDERATION', 120, 13, P.gold3, { align: 'center', shadow: P.ink });
    // Lights.
    const cols = [P.magenta, P.cyan, P.amber, P.lime];
    for (let i = 0; i < 4; i++) beam(g, 30 + i * 60, 0, Math.PI / 2 + Math.sin(t * (0.8 + i * 0.2) + i) * 0.5, 150, 18, cols[i], 0.16);
    // Stage.
    poly(g, [[20, 96], [220, 96], [236, 110], [4, 110]], P.s1); rect(g, 4, 110, 232, 6, P.s0);
    for (let x = 24; x < 220; x += 14) rect(g, x, 97, 1, 12, P.s2);
    if (o.fight) {
      for (const [x, flip, c] of [[80, false, P.orange], [160, true, P.red]]) {
        blob(g, [{ x, y: 78, rx: 7, ry: 8, h: 6 }, { x, y: 66, rx: 5, ry: 5, h: 5, z: 3 }], [P.ink, P.deep, P.navy, P.indigo, P.violet], { rim: c });
        line(g, x + (flip ? -6 : 6), 72, x + (flip ? -12 : 12), 62, P.s3);
      }
    }
    crowd(g, t, 130, 40, [P.ink, '#0f0c1c', P.deep], 5, 3);
    if (o.flashy && (t * 4 | 0) % 2) shine(g, 0, 0, PW, PH, P.white, 0.08);
  },

  // St. Catherine Street after midnight: neon in the snow.
  street(g, t) {
    sky(g, 0, 60, [P.ink, P.deep, P.navy]);
    const signs = [['DISQUES', P.magenta], ['BAGELS', P.amber], ['DEPANNEUR', P.cyan], ['BILLARD', P.lime]];
    for (let i = 0; i < 4; i++) {
      const x = i * 62 - 4, h = 70 + (i % 2) * 14;
      rect(g, x, 104 - h, 60, h, i % 2 ? '#1b1630' : '#221c3a');
      for (let wy = 104 - h + 6; wy < 60; wy += 10) for (let wx = x + 6; wx < x + 54; wx += 12) rect(g, wx, wy, 6, 6, (wx * 3 + wy) % 7 < 2 ? P.amber : '#0f0c1c');
      rect(g, x + 4, 72, 52, 30, P.ink); rect(g, x + 6, 74, 48, 26, (i % 2) ? '#2c1b2e' : '#1a2a33');
      const [s, c] = signs[i], on = Math.sin(t * 9 + i * 7) > -0.9;
      rect(g, x + 4, 62, 52, 9, P.ink);
      text(g, s, x + 30, 63, on ? c : P.s0, { align: 'center' });
    }
    rect(g, 0, 104, PW, 36, '#14121f');
    for (let x = 0; x < PW; x += 30) rect(g, x + ((t * 40) % 30), 120, 14, 2, P.s1);
    // Reflections.
    for (let i = 0; i < 4; i++) { g.globalAlpha = 0.25; rect(g, i * 62 + 10, 108, 40, 2, signs[i][1]); rect(g, i * 62 + 18, 113, 24, 1, signs[i][1]); g.globalAlpha = 1; }
    // Walkers.
    for (let i = 0; i < 3; i++) { const x = ((t * (10 + i * 6) + i * 80) % (PW + 30)) - 15; blob(g, [{ x, y: 96, rx: 4, ry: 9, h: 4 }, { x, y: 84, rx: 3, ry: 3, h: 3, z: 2 }], [P.ink, P.ink, P.deep, P.navy, P.indigo]); }
    // Snow.
    const r = rng(77);
    for (let i = 0; i < 70; i++) { const x = (r() * PW + Math.sin(t + i) * 6) % PW, y = (r() * PH + t * (14 + r() * 12)) % PH; px(g, x, y, r() < 0.5 ? P.white : P.s3); }
  },

  // A television: o.show = 'ad' | 'news' | 'review'.
  tv(g, t, o) {
    rect(g, 0, 0, PW, PH, '#1a1220');
    for (let x = 0; x < PW; x += 6) rect(g, x, 0, 3, PH, '#1f1628');
    rect(g, 0, 122, PW, 18, P.brown1); rect(g, 0, 122, PW, 1, P.brown3);
    const x = 40, y = 8, w = 160, h = 112;
    rect(g, x, y, w, h, P.brown2); rect(g, x, y, w, 2, P.brown3); rect(g, x + w - 26, y + 14, 18, 84, P.brown1);
    for (let i = 0; i < 2; i++) { ellipse(g, x + w - 17, y + 28 + i * 18, 5, 5, P.s1); px(g, x + w - 18, y + 26 + i * 18, P.s3); }
    const sx = x + 8, sy = y + 8, sw = w - 40, sh = h - 16;
    const [sc, sg] = scratchCanvas(sw, sh);
    const show = o.show || 'ad';
    if (show === 'ad') {
      sky(sg, 0, sh, [P.red, P.orange, P.amber, P.cream]);
      for (let i = 0; i < 12; i++) beam(sg, sw / 2, sh / 2, i * 0.5236 + t, 120, 8, P.white, 0.25);
      const bob = Math.sin(t * 3) * 3;
      blob(sg, [{ x: sw / 2, y: sh / 2 + bob, rx: 16, ry: 26, h: 14, ey: 6 }], RAMP.red, { rim: P.white });
      rect(sg, sw / 2 - 16, sh / 2 - 6 + bob, 32, 12, P.cream);
      text(sg, 'NEW', sw / 2, sh / 2 - 3 + bob, P.red, { align: 'center' });
      if ((t * 2 | 0) % 2) text(sg, 'NEW!', 8, 6, P.white, { shadow: P.blood });
    } else if (show === 'news') {
      sky(sg, 0, sh, [P.navy, P.indigo, P.navy]);
      sg.drawImage(bust(CAST.anchor, (t * 8 | 0) % 2 === 0 && o.talking), sw / 2 - 48, 4);
      rect(sg, 0, sh - 18, sw, 18, P.red);
      const msg = 'FUGITIVE DELTRON ZERO STILL AT LARGE * BANK OF TIME SHARES UP 3000% * DANCING REPORTED IN SECTOR 9 * ';
      text(sg, msg + msg, 40 - ((t * 30) % measure(msg)), sh - 13, P.white);
      rect(sg, 0, sh - 18, 36, 18, P.white); rect(sg, 36, sh - 18, 1, 18, P.blood);
      text(sg, 'LIVE', 6, sh - 13, P.red);
    } else {
      sky(sg, 0, sh, [P.ink, P.deep, P.indigo]);
      for (let i = 0; i < 2; i++) { const cx = 34 + i * 54, cy = 40; ball(sg, cx, cy, 22, 22, RAMP.steel); for (let k = 0; k < 5; k++) { const a = t * (i ? -1 : 1) + k * 1.2566; ellipse(sg, cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 5, 5, P.ink); } ellipse(sg, cx, cy, 3, 3, P.ink); }
      text(sg, 'HEIST AT THE', sw / 2, 70, P.amber, { align: 'center' }); text(sg, 'BANK OF TIME', sw / 2, 80, P.amber, { align: 'center' });
    }
    // Scanlines and glass.
    sg.globalAlpha = 0.18; for (let yy = 0; yy < sh; yy += 2) { sg.fillStyle = P.ink; sg.fillRect(0, yy, sw, 1); } sg.globalAlpha = 1;
    g.drawImage(sc, sx, sy);
    rect(g, sx, sy, sw, 1, P.s3); px(g, sx + 4, sy + 4, P.white); px(g, sx + 5, sy + 4, P.white); px(g, sx + 4, sy + 5, P.white);
  },

  // Deep space; o.ship flies a ship through.
  space(g, t, o) {
    rect(g, 0, 0, PW, PH, P.ink);
    const r = rng(3);
    for (let i = 0; i < 90; i++) {
      const sp = 20 + r() * 120, x = (r() * PW * 2 - t * sp) % PW, y = r() * PH;
      const xx = (x + PW) % PW, L = sp / 30;
      rect(g, xx, y, Math.max(1, L), 1, sp > 100 ? P.white : sp > 60 ? P.s3 : P.s2);
    }
    ball(g, 200, 160, 90, 90, [P.ink, P.blood, P.brown1, P.orange, P.amber], { rim: P.cream });
    for (let i = 0; i < 5; i++) { const x = (i * 60 - t * 40) % 300 + 20, y = 30 + i * 17; ball(g, x, y, 5 + i % 3 * 2, 4 + i % 2 * 2, [P.ink, P.brown0, P.brown1, P.brown2, P.brown3]); }
    if (o.ship !== false) {
      const x = 90 + Math.sin(t) * 6, y = 64 + Math.cos(t * 1.3) * 4;
      for (let i = 0; i < 4; i++) rect(g, x - 26 - i * 6 - (t * 60 % 6), y - 1, 6, 3, [P.white, P.cyan, P.teal, P.navy][i]);
      blob(g, [{ x, y, rx: 20, ry: 6, h: 6, ey: 3 }, { x: x + 4, y: y - 5, rx: 8, ry: 4, h: 4, z: 4 }], RAMP.steel, { rim: P.orange });
      poly(g, [[x - 14, y + 3], [x - 4, y + 3], [x - 18, y + 12]], P.s1);
      rect(g, x + 2, y - 7, 6, 2, P.cyan);
    }
  },

  // The great clock of the city, slipping.
  clock(g, t, o) {
    sky(g, 0, PH, [P.ink, P.deep, P.indigo, P.violet]);
    const cx = 120, cy = 70;
    for (const [r, sp, n, c] of [[66, 0.2, 24, P.gold0], [52, -0.35, 18, P.gold1], [30, 0.7, 12, P.gold0]]) {
      ellipse(g, cx, cy, r, r, c);
      for (let i = 0; i < n; i++) { const a = t * sp + i * 6.283 / n; rect(g, cx + Math.cos(a) * r - 2, cy + Math.sin(a) * r - 2, 4, 4, c); }
    }
    ball(g, cx, cy, 44, 44, [P.gold1, P.gold2, P.cream, P.cream, P.white]);
    for (let i = 0; i < 12; i++) { const a = i * 0.5236 - 1.5708; text(g, ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'][i], cx + Math.cos(a) * 35, cy + Math.sin(a) * 35 - 3, P.brown1, { align: 'center' }); }
    const slip = o.slip ? Math.sin(t * 3) * 2 : 0;
    const a1 = t * 0.3 + slip, a2 = t * 4 + slip * 3;
    line(g, cx, cy, cx + Math.cos(a1) * 20, cy + Math.sin(a1) * 20, P.ink);
    line(g, cx + 1, cy, cx + 1 + Math.cos(a1) * 20, cy + Math.sin(a1) * 20, P.ink);
    line(g, cx, cy, cx + Math.cos(a2) * 32, cy + Math.sin(a2) * 32, P.red);
    ellipse(g, cx, cy, 3, 3, P.ink);
    if (o.slip) for (let i = 0; i < 3; i++) { g.globalAlpha = 0.2; const a = a2 - 0.15 * (i + 1); line(g, cx, cy, cx + Math.cos(a) * 32, cy + Math.sin(a) * 32, P.red); g.globalAlpha = 1; }
  },

  // The Assmann 640: a terminal with a face.
  computer(g, t, o) {
    rect(g, 0, 0, PW, PH, '#151a14');
    rect(g, 30, 6, 180, 126, P.s3); rect(g, 30, 6, 180, 2, P.s4); rect(g, 30, 130, 180, 2, P.s1);
    rect(g, 40, 14, 160, 100, '#031006');
    const c = o.red ? P.red : P.lime;
    for (const s of [-1, 1]) {
      const ex = 120 + s * 34, blink = (t % 4) < 0.12;
      rect(g, ex - 12, 40, 24, blink ? 2 : 18, c);
      if (!blink) rect(g, ex - 4 + Math.sin(t * 0.7) * 4, 46, 8, 8, '#031006');
    }
    const talk = o.talking;
    for (let x = 0; x < 100; x++) { const v = talk ? Math.sin(x * 0.5 + t * 20) * Math.sin(x * 0.07) * 9 * (0.5 + Math.random() * 0.5) : Math.sin(x * 0.2 + t * 2) * 1.5; px(g, 70 + x, 88 + v, c); }
    g.globalAlpha = 0.22; for (let y = 14; y < 114; y += 2) rect(g, 40, y, 160, 1, P.ink); g.globalAlpha = 1;
    text(g, 'ASSMANN 640', 120, 119, P.s1, { align: 'center' });
    for (let i = 0; i < 4; i++) rect(g, 176 + i * 6, 120, 3, 3, (t * 3 + i) % 4 < 1 ? P.red : P.s1);
  },

  // The Perisphere and Trylon at sunset.
  sunset(g, t, o) {
    sky(g, 0, 104, [P.navy, P.indigo, P.violet, P.magenta, P.orange, P.amber]);
    // Striped sun.
    const sy = 70 + (o.sink ? t * 3 : 0);
    for (let y = -28; y < 28; y++) { if (y > 4 && (y % 6) < (y - 4) / 5) continue; const hw = Math.sqrt(Math.max(0, 28 * 28 - y * y)); rect(g, 150 - hw, sy + y, hw * 2, 1, y < 0 ? P.amber : P.orange); }
    g.drawImage(perisphere(30, [P.ink, P.deep, P.deep, P.navy, P.indigo], P.orange), 30, 16);
    rect(g, 0, 104, PW, 36, P.ink);
    for (let y = 106; y < PH; y += 4) { g.globalAlpha = 0.3; rect(g, 120 - (y - 100) * 2, y, (y - 100) * 4, 1, P.orange); g.globalAlpha = 1; }
  },

  // A Brymar College lecture hall: chalkboard full of circuits.
  college(g, t) {
    rect(g, 0, 0, PW, PH, P.brown1);
    for (let x = 0; x < PW; x += 16) rect(g, x, 0, 1, PH, P.brown0);
    rect(g, 16, 10, 208, 92, P.brown3); rect(g, 20, 14, 200, 84, '#1f3b2c');
    const r = rng(41);
    for (let i = 0; i < 14; i++) { const x = 28 + r() * 180, y = 22 + r() * 66, w = 10 + r() * 30; line(g, x, y, x + w, y, '#cfe3d6'); line(g, x + w, y, x + w, y + 8 + r() * 10, '#cfe3d6'); if (r() < 0.5) ring(g, x, y, 3, '#cfe3d6'); }
    text(g, 'UPGRADE 101', 120, 18, P.cream, { align: 'center' });
    const blink = (t * 2 | 0) % 2;
    text(g, 'RHYTHM > OBEDIENCE', 120, 86, blink ? P.amber : '#cfe3d6', { align: 'center' });
    rect(g, 0, 112, PW, 28, P.brown2); rect(g, 0, 112, PW, 2, P.tan);
  },
};

let scratchC = null;
function scratchCanvas(w, h) {
  if (!scratchC || scratchC[0].width !== w || scratchC[0].height !== h) scratchC = canvas(w, h);
  scratchC[1].clearRect(0, 0, w, h);
  return scratchC;
}

// ----------------------------------------------------------------- player
// script: { track, title, song, shots: [{ bg, o, who, side, eyes, speaker, lines: [], fx }] }
export function cineScene(script, onDone) {
  const [pic, pg] = canvas(PW, PH);
  let shot = 0, line = 0, typed = 0, tShot = 0, tAll = 0, blipT = 0, flash = 0, card = script.track ? 2.4 : 0, done = false;
  const pages = () => script.shots[shot].lines || [];
  const startShot = () => { tShot = 0; line = 0; typed = 0; const fx = script.shots[shot].fx; if (fx === 'flash' || fx === 'shake') { flash = 1; A.sfx(fx === 'shake' ? 'boom' : 'whoosh'); } };
  const finish = () => { if (done) return; done = true; onDone(); };
  const cur = () => script.shots[shot];

  return {
    enter() {
      if (script.song) {
        const info = A.songInfo();
        if (!info || info.id !== script.song) A.playSong(getSong(script.song));
      }
      startShot();
    },
    autoPause() {},
    update(dt) {
      tAll += dt;
      if (card > 0) { card -= dt; if (I.hit('a') || I.hit('start')) card = 0; return; }
      tShot += dt;
      if (flash > 0) flash = Math.max(0, flash - dt * 3);
      if (I.hit('start')) { A.sfx('back'); return finish(); }
      const pg = pages(), page = pg[line] || '';
      if (typed < page.length) {
        typed = Math.min(page.length, typed + dt * 46);
        blipT -= dt;
        if (blipT <= 0 && page[Math.floor(typed)] !== ' ') { A.sfx('blip'); blipT = 0.05; }
        if (I.hit('a') || I.hit('b')) typed = page.length;
        return;
      }
      const adv = I.hit('a') || I.hit('b') || (!pg.length && tShot > (cur().t || 2.5));
      if (adv) {
        A.sfx('move');
        if (line + 1 < pg.length) { line++; typed = 0; }
        else if (shot + 1 < script.shots.length) { shot++; startShot(); }
        else finish();
      }
    },
    draw(g) {
      rect(g, 0, 0, W, H, P.ink);
      if (card > 0) return drawCard(g, script, tAll);
      const s = cur();
      const talking = typed < ((pages()[line]) || '').length;
      // Picture.
      pg.save();
      const sh = s.fx === 'shake' && tShot < 0.6 ? Math.round(Math.sin(tShot * 80) * 3 * (1 - tShot / 0.6)) : 0;
      pg.translate(sh, 0);
      const bg = PAINT[s.bg || 'grad'] || PAINT.grad;
      if (s.eyes) {
        PAINT.grad(pg, tAll, { cols: s.o?.cols || [P.ink, P.deep, P.ink], stars: false });
        const b = bust(CAST[s.who] || s.who, talking && (tAll * 8 | 0) % 2 === 0);
        pg.imageSmoothingEnabled = false;
        pg.drawImage(b, 24, 30, 48, 28, 0, 0, PW, PH);
        // Letterbox the eyes.
        rect(pg, 0, 0, PW, 20, P.ink); rect(pg, 0, PH - 20, PW, 20, P.ink);
      } else {
        bg(pg, tAll, Object.assign({ talking }, s.o || {}));
        if (s.who) {
          const b = bust(CAST[s.who] || s.who, talking && (tAll * 8 | 0) % 2 === 0);
          const slide = Math.max(0, 1 - tShot * 4) ** 2 * 60;
          const bx = s.side === 'R' ? PW - 104 + slide : 8 - slide;
          const by = PH - b.height + 2 + Math.round(Math.sin(tAll * 1.6) * 1);
          pg.drawImage(b, Math.round(bx), by);
        }
      }
      pg.restore();
      if (flash > 0) { pg.globalAlpha = flash; rect(pg, 0, 0, PW, PH, P.white); pg.globalAlpha = 1; }
      frame(g, PX, PY, PW, PH, P.s2, P.ink);
      g.drawImage(pic, PX, PY);
      // Dialogue.
      const page = pages()[line] || '';
      const spk = s.speaker ?? (s.who && CAST[s.who] ? CAST[s.who].name : '');
      if (spk) text(g, spk, 12, 158, s.col || P.amber);
      const lines = wrap(page, 232);
      let left = Math.floor(typed);
      lines.slice(0, 5).forEach((ln, i) => {
        const shown = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        text(g, shown, 12, 170 + i * 10, P.cream);
      });
      if (typed >= page.length && page) { if ((tAll * 3 | 0) % 2) text(g, '▼', 238, 210, P.amber); }
      text(g, 'START: SKIP', 12, 214, P.s0);
    },
  };
}

// Title card for a skit: track number and name, slid in.
export function drawCard(g, script, t) {
  rect(g, 0, 0, W, H, P.ink);
  const k = Math.min(1, t * 2.5);
  for (let i = 0; i < 14; i++) { const y = 40 + i * 10; g.globalAlpha = 0.25; rect(g, 0, y, W * k, 1, i % 2 ? P.violet : P.navy); g.globalAlpha = 1; }
  const x = -200 + 220 * Math.min(1, t * 3);
  text(g, 'TRACK ' + String(script.track).padStart(2, '0'), x, 76, P.amber, { scale: 2, shadow: P.blood });
  const ln = wrap(script.title, 220);
  ln.forEach((l, i) => text(g, l, W - x - 4, 102 + i * 12, P.cream, { align: 'right', shadow: P.navy }));
  rect(g, 20, 96, (W - 40) * k, 1, P.amber);
}
