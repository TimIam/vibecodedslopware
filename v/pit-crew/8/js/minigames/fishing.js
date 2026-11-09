// Fly fishing on a mountain river. Three presses cast (start, power, accuracy) like a golf swing;
// a fly landing near a rise gets a take, then a strike and a short tussle on the same bar.
// Fish rise along the foam seam, so power says how far along it and accuracy says how far off it.
import { rect, ellipse, poly, shade, ditherRect, canvas, portrait, panel, bar } from '../gfx.js';
import { text, wrap, measure } from '../font.js';
import { PEOPLE, TEAMS } from '../data.js';
import { rename } from '../banter.js';

const INK = '#05060a';
const AX = 88, AY = 222;                   // the angler's waterline
const TOP = 138, XN = 150, XF = 476;       // top of the river; nearest and farthest cast
const BX = 128, BW = 256, ZX = 156, BY = 263, BH = 9; // the swing bar; ZX is the sweet spot
const seamY = x => 186 + 9 * Math.sin(x * 0.021 + 0.6) - (x - 140) * 0.075;
const xOf = p => XN + p * (XF - XN);
const pOf = x => (x - XN) / (XF - XN);
const ux = u => ZX + u * (BX + BW - ZX);   // swing marker: 0 at the sweet spot, 1 at the far end
const UMIN = (BX - ZX) / (BX + BW - ZX);
const mx = v => BX + v * BW;               // strike and fight marker: 0..1 across the whole bar
const ROCKS = [[246, 150, 13, 7], [340, 207, 15, 8], [430, 149, 11, 6], [470, 216, 20, 10], [198, 218, 14, 8], [404, 238, 12, 6]];

const SPECIES = [
  { name: 'BROOK TROUT', min: 6.5, max: 13, w: 1.2, back: '#34563f', side: '#6e8a52', belly: '#e0873f', spot: '#f2d45c', caps: ['Small, bright and furious. Toby feels seen.', 'Fits in a lunchbox. Would not go quietly.'] },
  { name: 'RAINBOW TROUT', min: 9, max: 21, w: 1, back: '#4a6a58', side: '#c4ccb4', belly: '#f0ece0', spot: '#26282c', band: '#dc5a7a', caps: ['A stripe down the side. Hargreaves asks what the sponsorship rate is.', 'All that livery and it still went for the cheap fly.'] },
  { name: 'GRAYLING', min: 9, max: 17, w: 0.8, back: '#47536a', side: '#a2aabb', belly: '#e0e4e8', spot: '#2a3040', sail: true, caps: ['That dorsal fin. Dev says it is costing it two tenths.', 'Smells faintly of thyme. Pip checks the fuel anyway.'] },
  { name: 'CUTTHROAT', min: 9, max: 20, w: 0.7, back: '#5a6a46', side: '#c8b878', belly: '#e8dca8', spot: '#2c2a1c', slash: true, caps: ['Named for the red at the throat, and for its contract talks.', 'Lou says he has worked with worse. He has.'] },
  { name: 'BROWN TROUT', min: 10, max: 25, w: 0.8, far: true, back: '#6a4a28', side: '#b08a48', belly: '#e8d8a0', spot: '#35200f', caps: ['Old, wily, unimpressed. Mags nods at it as an equal.', 'Pitted under the bank all season. A classic undercut.'] },
];
const JUNK = [
  { name: 'WHEEL NUT', junk: 'nut', caps: ['Left rear, by the look of it. Dev wants it logged.', 'So that is where it went. Nobody tell Hargreaves.'] },
  { name: 'ONE OLD BOOT', junk: 'boot', caps: ['One careful owner. Lou has already tried it on.', 'Fought harder than the last three trout.'] },
];
const NOPE_FAR = ['Nothing. The fish have read the reviews.', 'A lovely cast, into some lovely empty water.', 'Try nearer the rings.'];
const NOPE_NEAR = ['It looked. It declined.', 'A nose, a swirl, a no thank you.', 'So close the fish felt awkward.'];
const LOST = ['Gone. It was huge, obviously.', 'Off it goes, with your fly as a souvenir.', 'It got away. Nobody saw. It was huge.'];
const SPAT = ['It spat the fly. Fish do that.', 'Too slow. That one is telling its friends.'];

// Kept between visits, so stepping through the scenes does not lose the tally.
const log = { n: 0, best: 0, bestName: '' };

function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function bands(g, y0, y1, cols) {
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / (y1 - y0) * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(f));
    rect(g, 0, y, 512, 1, cols[i]);
    ditherRect(g, 0, y, 512, 1, cols[i + 1], f - i);
  }
}
function range(b, peaks, base, lit, dark, snow, snowDark, snowLine) {
  for (let x = 0; x < 512; x++) {
    let top = 1e9, pc = 0;
    for (const [c, t, s] of peaks) { const v = t + Math.abs(x - c) * s; if (v < top) { top = v; pc = c; } }
    const y = Math.round(top + Math.sin(x * 0.21) * 2 + Math.sin(x * 0.07 + 1) * 2.4 + Math.sin(x * 0.53));
    const east = x > pc + Math.sin(x * 0.13 + y * 0.2) * 7;
    rect(b, x, y, 1, base - y, east ? dark : lit);
    const line = Math.round(snowLine + Math.sin(x * 0.37) * 6 + Math.sin(x * 0.11) * 5);
    if (y < line) rect(b, x, y, 1, line - y, east ? snowDark : snow);
  }
}
function pine(b, x, base, h, dark, mid, lit, wf = 0.3) {
  rect(b, x - 1, base - 6, 3, 6, '#3a2a1c');
  const tiers = Math.max(2, Math.round(h / 13));
  for (let i = 0; i < tiers; i++) {
    const t0 = base - h + (h - 6) * i / tiers * 0.82, t1 = t0 + (h - 6) / tiers * 1.5;
    const hw = h * wf * (i + 1.4) / (tiers + 0.4);
    poly(b, [[x, t0], [x + hw, t1], [x - hw, t1]], dark);
    poly(b, [[x, t0 + 1], [x - hw * 0.1, t1 - 1], [x - hw * 0.92, t1 - 1]], mid);
    if (lit) poly(b, [[x - hw * 0.3, t0 + (t1 - t0) * 0.4], [x - hw * 0.45, t1 - 2], [x - hw * 0.88, t1 - 2]], lit);
  }
}
function rock(b, x, y, rx, ry) {
  ellipse(b, x + 1, y + ry * 0.7, rx + 2, ry * 0.5, '#123e58');
  ellipse(b, x, y, rx + 1, ry + 1, '#23262c');
  ellipse(b, x, y, rx, ry, '#5e6168');
  ellipse(b, x - rx * 0.2, y - ry * 0.25, rx * 0.72, ry * 0.62, '#868992');
  ellipse(b, x - rx * 0.35, y - ry * 0.45, rx * 0.34, ry * 0.26, '#aeb0b4');
  rect(b, x - rx, y + ry - 2, rx * 2, 2, '#3a4048');
}
function bakeCloud(r) {
  const [c, b] = canvas(96, 28);
  for (let i = 0; i < 7; i++) { const x = 16 + r() * 62, rad = 6 + r() * 9; ellipse(b, x, 19 - r() * 5, rad * 1.3, rad * 0.75, '#c8dcea'); }
  for (let i = 0; i < 7; i++) { const x = 16 + r() * 62, rad = 5 + r() * 8; ellipse(b, x, 15 - r() * 5, rad * 1.2, rad * 0.62, '#ffffff'); }
  return c;
}
function bake() {
  const r = rng(7741);
  const [sky, s] = canvas(512, 288);
  bands(s, 0, 132, ['#2f6fc8', '#478ad8', '#66a4e2', '#8ac0ea', '#b4d8ee', '#dceef2']);
  const [land, b] = canvas(512, 288);
  range(b, [[74, 44, 0.78], [168, 26, 0.95], [262, 54, 0.8], [352, 34, 0.9], [456, 50, 0.72]], 124, '#8aa2c0', '#6a82a6', '#f6fafc', '#c0d2e4', 74);
  range(b, [[24, 76, 0.7], [122, 66, 0.62], [226, 80, 0.7], [316, 68, 0.64], [420, 78, 0.6], [506, 70, 0.7]], 126, '#5f7c8e', '#4c6878', '#dfe8ee', '#a8bccb', 82);
  const hill = x => 104 + Math.sin(x * 0.017 + 2) * 7 + Math.sin(x * 0.05) * 3;
  for (let x = 0; x < 512; x++) { const y = Math.round(hill(x)); rect(b, x, y, 1, 132 - y, '#3f6a68'); }
  for (let x = -6; x < 520; x += 3 + r() * 4) { const h = 10 + r() * 9, y = hill(x) + 3; poly(b, [[x, y - h], [x + h * 0.3, y], [x - h * 0.3, y]], '#3f6a68'); }
  const hill2 = x => 117 + Math.sin(x * 0.024) * 5 + Math.sin(x * 0.07 + 1) * 2;
  for (let x = 0; x < 512; x++) { const y = Math.round(hill2(x)); rect(b, x, y, 1, 136 - y, '#2c5a48'); }
  for (let x = -6; x < 520; x += 4 + r() * 5) { const h = 15 + r() * 15, y = hill2(x) + 4; poly(b, [[x, y - h], [x + h * 0.28, y], [x - h * 0.28, y]], '#2c5a48'); poly(b, [[x, y - h], [x, y], [x - h * 0.28, y]], '#38704f'); }
  // water, darkening toward the viewer, with the bank's reflection and the seam
  bands(b, TOP, 288, ['#86cac8', '#54a8b6', '#2f8ea8', '#217898', '#186486', '#155070']);
  for (let y = 0; y < 16; y++) ditherRect(b, 0, TOP + y, 512, 1, '#2c6a58', 0.55 * (1 - y / 16));
  for (let x = 130; x < 508; x++) for (let j = -7; j <= 7; j++) ditherRect(b, x, Math.round(seamY(x)) + j, 1, 1, '#b4e4dc', 0.32 * (1 - Math.abs(j) / 7));
  for (let n = 0; n < 620; n++) { const y = TOP + 8 + r() * 142, x = r() * 512; rect(b, x, y, 3 + r() * 16, 1, y < 190 ? '#7cc8c8' : y < 240 ? '#4ea0b6' : '#3a88a4'); }
  for (const [x, y, rx, ry] of ROCKS) for (let k = 0; k < 5; k++) rect(b, x - rx - 4 - k * 7, y + ry - 3 + (k & 1) * 4 - 2, 12 - k * 2, 1, '#a8e0dc');
  // the far bank and its nearer pines
  for (let x = 0; x < 512; x++) {
    const y = Math.round(137 + Math.sin(x * 0.05) * 3 + Math.sin(x * 0.13 + 1) * 1.5 + Math.max(0, Math.sin(x * 0.019 - 1.2)) * 6);
    rect(b, x, y - 9, 1, 9, (x >> 3) % 3 ? '#6f8f46' : '#7f9c4e');
    rect(b, x, y - 2, 1, 3, r() < 0.3 ? '#c8bc9c' : '#a8987a');
  }
  for (let x = 40; x < 512; x += 16 + r() * 34) pine(b, x, 130 + r() * 2, 26 + r() * 20, '#183c30', '#245238', '#3a7048');
  for (const [x, y, rx, ry] of ROCKS) rock(b, x, y, rx, ry);
  // the near shingle and the pine on it
  const edge = x => 240 + x / 176 * 48;
  poly(b, [[0, 240], [60, 250], [116, 266], [176, 288], [0, 288]], '#8a7f68');
  poly(b, [[0, 240], [60, 250], [116, 266], [120, 269], [60, 253], [0, 244]], '#b8ac90');
  for (let i = 0; i < 260; i++) {
    const x = r() * 176, y = 240 + r() * 48;
    if (y < edge(x) + 3) continue;
    const w = 1 + r() * 4;
    ellipse(b, x, y, w, w * 0.6, ['#a89c84', '#6f6654', '#c4b89e', '#7f8088'][Math.floor(r() * 4)]);
  }
  rock(b, 42, 272, 22, 11);
  pine(b, 4, 268, 262, '#143428', '#1e4a34', '#346a44', 0.135);
  const clouds = [bakeCloud(r), bakeCloud(r), bakeCloud(r)];
  return { sky, land, clouds };
}

function drawFish(g, x, y, L, sp) {
  if (sp.junk === 'nut') {
    const pts = []; for (let i = 0; i < 6; i++) pts.push([x + Math.cos(i * 1.047) * 24, y + Math.sin(i * 1.047) * 20]);
    poly(g, pts.map(([a, c]) => [a + (a - x) * 0.1, c + (c - y) * 0.1]), INK); poly(g, pts, '#8a9098');
    poly(g, pts.slice(3).map(([a, c]) => [a, c]), '#b4bac2');
    ellipse(g, x, y, 11, 9, '#3a3e46'); ellipse(g, x, y, 7, 6, '#16181e');
    return;
  }
  if (sp.junk === 'boot') {
    poly(g, [[x - 18, y - 22], [x + 6, y - 22], [x + 8, y + 2], [x + 30, y + 8], [x + 32, y + 18], [x - 20, y + 18]], INK);
    poly(g, [[x - 16, y - 20], [x + 4, y - 20], [x + 6, y + 4], [x + 28, y + 10], [x + 30, y + 14], [x - 18, y + 14]], '#6a4a2c');
    rect(g, x - 19, y + 14, 50, 4, '#26201a'); rect(g, x - 14, y - 16, 14, 2, '#8a6a44');
    for (let i = 0; i < 4; i++) rect(g, x - 4, y - 12 + i * 5, 8, 1, '#d8c8a0');
    return;
  }
  const h = Math.max(3, L * 0.135);
  poly(g, [[x + L * 0.4, y], [x + L * 0.57, y - h * 1.15], [x + L * 0.53, y], [x + L * 0.57, y + h * 1.15]], INK);
  poly(g, [[x + L * 0.41, y], [x + L * 0.55, y - h * 0.95], [x + L * 0.51, y], [x + L * 0.55, y + h * 0.95]], shade(sp.back, 0.12));
  const dx = -L * 0.02, dh = sp.sail ? h * 2 : h * 1.45;
  poly(g, [[x + dx - L * 0.1, y - h + 1], [x + dx - L * 0.06, y - dh], [x + dx + L * (sp.sail ? 0.2 : 0.08), y - h + 1]], sp.sail ? '#6a3a62' : shade(sp.back, -0.2));
  ellipse(g, x, y, L / 2 + 1, h + 1, INK);
  ellipse(g, x, y, L / 2, h, sp.back);
  ellipse(g, x, y + h * 0.22, L / 2 - 1, h * 0.72, sp.side);
  ellipse(g, x, y + h * 0.62, L / 2 - L * 0.06, h * 0.36, sp.belly);
  if (sp.band) rect(g, x - L * 0.34, y - 1, L * 0.7, Math.max(2, h * 0.3), sp.band);
  const r = rng(L * 10 | 0);
  for (let i = 0; i < L * 0.32; i++) {
    const px = x - L * 0.3 + r() * L * 0.68, py = y - h * 0.7 + r() * h * 0.95;
    if (Math.abs(px - x) / (L / 2) > 0.92) continue;
    rect(g, px, py, L > 120 ? 2 : 1, L > 120 ? 2 : 1, sp.spot);
  }
  ellipse(g, x - L * 0.42, y - 1, h * 0.55, h * 0.62, shade(sp.back, 0.08));
  if (sp.slash) rect(g, x - L * 0.42, y + h * 0.45, L * 0.09, 2, '#d8321e');
  rect(g, x - L * 0.47, y + h * 0.15, L * 0.08, 1, INK);
  rect(g, x - L * 0.42, y - h * 0.32, 3, 3, '#f4f0d8'); rect(g, x - L * 0.42 + 1, y - h * 0.32 + 1, 2, 2, INK);
  poly(g, [[x - L * 0.2, y + h * 0.6], [x - L * 0.12, y + h * 1.2], [x - L * 0.08, y + h * 0.6]], shade(sp.belly, -0.2));
}

function ring(g, x, y, r, c) {
  const n = Math.max(10, Math.round(r * 4));
  g.fillStyle = c;
  for (let i = 0; i < n; i++) { const a = i / n * 6.283; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.42), 1, 1); }
}
function curve(g, ax, ay, cx, cy, bx, by, c, w = 1) {
  const n = Math.ceil(Math.abs(ax - bx) + Math.abs(ay - by) + 8);
  g.fillStyle = c;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    g.fillRect(Math.round(s * s * ax + 2 * s * t * cx + t * t * bx), Math.round(s * s * ay + 2 * s * t * cy + t * t * by), w, 1);
  }
}

export default function make(ctx) {
  const { g, W, H, A } = ctx;
  const who = pick(['mags', 'toby', 'lou', 'dev', 'pip']), me = PEOPLE[who];
  let art = null, phase = 'ready', pt = 0, clock = 0;
  let u = 0, pow = 0, acc = 0, lx = 0, ly = 0, fx = 0, fy = 0, flightDur = 1, rodA = 0.7, snag = false;
  let take = null, takeAt = 0, nearMiss = false, spawnIn = 0.3, hook = null, hx = 0, hy = 0;
  let mk = 0, mv = 0, zone = 0.5, zoneTo = 0.5, zoneW = 0.26, zoneIn = 0, landed = 0, holdLeft = 1, dur = 4, tickIn = 0;
  let msg = '', msgT = 0, msgC = '#fff', card = null;
  const rises = [], fx2 = [], streaks = [], flecks = [], twinkles = [], flies = [];
  const clouds = [{ i: 0, x: 40, y: 12, v: 3.5 }, { i: 1, x: 230, y: 34, v: 2.4 }, { i: 2, x: 400, y: 20, v: 3 }];

  const say = (s, c = '#fff', t = 2.6) => { msg = rename(s); msgC = c; msgT = t; };
  const set = p => { phase = p; pt = 0; };
  const tipOf = a => [AX + 11 + Math.sin(a) * 60, AY - 22 - Math.cos(a) * 60];
  function splash(x, y, n, spd = 40) {
    for (let i = 0; i < n; i++) { const a = -Math.random() * 3.14; fx2.push({ x, y, vx: Math.cos(a) * spd * Math.random(), vy: Math.sin(a) * spd * (0.5 + Math.random()), t: 0.3 + Math.random() * 0.4 }); }
  }
  function spawnRise() {
    for (let tries = 0; tries < 16; tries++) {
      const x = 176 + Math.random() * 290, y = seamY(x) + (Math.random() - 0.5) * 10;
      if (rises.some(q => Math.abs(q.x - x) < 44)) continue;
      if (ROCKS.some(([a, b, c]) => Math.hypot(a - x, (b - y) * 1.6) < c + 18)) continue;
      const big = clamp(pOf(x) * 0.7 + Math.random() * 0.4, 0, 1);
      const pool = SPECIES.filter(s => !s.far || big > 0.45);
      let w = pool.reduce((a, s) => a + s.w, 0) * Math.random(), sp = pool[0];
      for (const s of pool) { w -= s.w; if (w <= 0) { sp = s; break; } }
      rises.push({ x, y, age: 0, life: 8 + Math.random() * 7, next: 0, rings: [], nose: 0, big, sp });
      return;
    }
  }
  function landFly() {
    fx = lx; fy = ly; take = null; nearMiss = false;
    if (snag) { say('In the pines. The pines keep it.', '#ffb060'); A.sfx('thud'); set('retrieve'); pt = -0.8; return; }
    splash(fx, fy, 4, 22); A.sfx('blip', 900);
    let best = null, bd = 1e9;
    for (const q of rises) { const d = Math.hypot(q.x - lx, (q.y - ly) * 1.4); if (d < bd) { bd = d; best = q; } }
    const chance = bd <= 20 ? 1 : bd <= 46 ? 0.72 - (bd - 20) / 26 * 0.6 : 0;
    if (best && Math.random() < chance) { take = best; takeAt = 0.35 + Math.random() * 0.75; }
    else nearMiss = bd <= 46;
    set('drift');
  }
  function startStrike() {
    const q = take; take = null;
    rises.splice(rises.indexOf(q), 1);
    const junk = Math.random() < 0.06;
    const sp = junk ? pick(JUNK) : q.sp;
    const frac = junk ? 0.4 : clamp(Math.pow(Math.random(), 1.4) * 0.65 + q.big * 0.35, 0, 1);
    hook = { sp, frac, size: junk ? 0 : Math.round(lerp(sp.min, sp.max, frac) * 10) / 10 };
    hx = fx; hy = fy; splash(fx, fy, 16, 60);
    mk = Math.random(); mv = 2.1; zone = 0.3 + Math.random() * 0.4;
    A.sfx('ding'); set('strike');
  }
  function startFight(solid) {
    landed = solid ? 0.12 : 0; holdLeft = solid ? 1 : 0.55;
    mv = 0; mk = zone; zoneTo = zone; zoneIn = 0.4;
    zoneW = 0.3 - hook.frac * 0.11; dur = 3.2 + hook.frac * 3.2;
    say(solid ? 'HOOKED!' : 'Barely on. Careful.', solid ? '#7dff9a' : '#ffb060', 1.4);
    set('fight');
  }
  function land() {
    const { sp, size, frac } = hook;
    let isBest = false;
    if (!sp.junk) { log.n++; if (size > log.best) { isBest = log.n > 1; log.best = size; log.bestName = sp.name; } }
    A.sfx(isBest ? 'perfect' : 'good');
    card = { sp, size, frac, cap: rename(pick(sp.caps)), isBest, name: sp.name };
    set('caught');
  }

  return {
    enter() {
      art = bake();
      for (let i = 0; i < 80; i++) { const y = TOP + 6 + Math.random() * 142; streaks.push({ x: Math.random() * W, y, len: 3 + Math.random() * 12, v: 12 + (y - TOP) * 0.32 + Math.random() * 8, c: Math.random() < 0.4 ? '#c8f0ec' : '#6cb8c6' }); }
      for (let i = 0; i < 26; i++) flecks.push({ x: 130 + Math.random() * 380, j: (Math.random() - 0.5) * 8, v: 16 + Math.random() * 10, len: 2 + Math.random() * 5 });
      for (let i = 0; i < 46; i++) twinkles.push({ x: Math.random() * W, y: TOP + 4 + Math.random() * 108, p: Math.random() * 6.28, s: 1.5 + Math.random() * 2 });
      for (let i = 0; i < 14; i++) flies.push({ x: 170 + Math.random() * 320, y: 150 + Math.random() * 60, p: Math.random() * 6.28 });
    },
    update(dt, io) {
      clock += dt; pt += dt; msgT -= dt;
      const press = io.pressed('Space') || io.mouse.clicked;
      const hold = io.held('Space') || io.mouse.down;
      // the river
      for (const c of clouds) { c.x -= c.v * dt; if (c.x < -100) c.x = W + 10; }
      for (const s of streaks) { s.x -= s.v * dt; if (s.x + s.len < 0) s.x = W + Math.random() * 30; }
      for (const f of flecks) { f.x -= f.v * dt; if (f.x < 126) f.x = 508; }
      for (let i = fx2.length - 1; i >= 0; i--) { const p = fx2[i]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 150 * dt; if (p.t <= 0) fx2.splice(i, 1); }
      spawnIn -= dt;
      if (spawnIn <= 0 && rises.length < 3) { spawnRise(); spawnIn = 1.2 + Math.random() * 2.6; }
      for (let i = rises.length - 1; i >= 0; i--) {
        const q = rises[i];
        q.age += dt; q.next -= dt; q.nose -= dt;
        if (q.next <= 0 && q.age < q.life - 1) { q.rings.push(0); q.next = 0.9 + Math.random() * 0.8; q.nose = 0.28; splash(q.x, q.y, 2 + q.big * 3 | 0, 18); }
        q.rings = q.rings.map(a => a + dt).filter(a => a < 1.5);
        if (q.age > q.life && q !== take) rises.splice(i, 1);
      }
      // the rod follows the cast
      let want = 0.72;
      if (phase === 'power') want = lerp(0.4, -0.95, u);
      if (phase === 'accuracy') want = lerp(0.72, -0.95, clamp(u, 0, 1));
      if (phase === 'strike' || phase === 'fight') want = -0.12;
      rodA += (want - rodA) * Math.min(1, dt * 14);
      const [tx, ty] = tipOf(rodA);

      if (phase === 'ready') {
        if (press) { u = 0; A.sfx('select'); set('power'); }
      } else if (phase === 'power') {
        u += dt / 1.55;
        if (press || u >= 1) { pow = clamp(u, 0.04, 1); u = pow; A.sfx('tick', pow); set('accuracy'); }
      } else if (phase === 'accuracy') {
        u -= dt / 0.9;
        const over = u <= UMIN;
        if (press || over) {
          acc = over ? -0.62 : u;
          const e = Math.abs(acc);
          snag = acc > 0.55;
          lx = clamp(xOf(pow) - acc * 22, 124, 506);
          ly = snag ? TOP - 12 : clamp(seamY(lx) - (e < 0.04 ? 0 : acc * 110), TOP + 7, 246);
          if (e < 0.04) { A.sfx('perfect'); say('PERFECT CAST', '#7dff9a', 1.3); }
          else if (e < 0.14) A.sfx('good');
          else { A.sfx('clunk'); say(over ? 'LATE. VERY LATE.' : acc > 0 ? 'SLICED IT LONG' : 'HOOKED IT SHORT', '#ffb060', 1.4); }
          A.sfx('whoosh'); fx = tx; fy = ty; flightDur = 0.55 + pow * 0.5; set('flight');
        }
      } else if (phase === 'flight') {
        if (pt >= flightDur) landFly();
      } else if (phase === 'drift') {
        fx -= 9 * dt;
        if (take && pt >= takeAt) startStrike();
        else if (press) { A.sfx('move'); set('retrieve'); }
        else if (pt > 2.6) { if (!take) say(pick(nearMiss ? NOPE_NEAR : NOPE_FAR), '#d8e8f0'); set('retrieve'); }
      } else if (phase === 'retrieve') {
        if (pt > 0) { const f = Math.min(1, dt * 14); fx += (tx - fx) * f; fy += (ty - fy) * f; }
        if (pt > 0.45) set('ready');
      } else if (phase === 'strike') {
        mk += mv * dt;
        if (mk > 1) { mk = 2 - mk; mv = -mv; } if (mk < 0) { mk = -mk; mv = -mv; }
        zone = clamp(zone + Math.sin(clock * 3.1) * dt * 0.5, 0.14, 0.86);
        if (press) {
          const solid = Math.abs(mk - zone) <= 0.13;
          A.sfx(solid ? 'perfect' : 'thud'); splash(fx, fy, 10, 50); startFight(solid);
        } else if (pt > 2.4) { A.sfx('miss'); say(pick(SPAT), '#ffb060'); hook = null; set('retrieve'); }
      } else if (phase === 'fight') {
        mv += (hold ? 3.3 : -2.7) * dt;
        mv *= Math.pow(0.12, dt);
        mk += mv * dt;
        if (mk < 0) { mk = 0; mv = Math.max(0, -mv * 0.3); }
        if (mk > 1) { mk = 1; mv = Math.min(0, -mv * 0.3); }
        zoneIn -= dt;
        if (zoneIn <= 0) { zoneTo = 0.12 + Math.random() * 0.76; zoneIn = 0.6 + Math.random() * 1.1 - hook.frac * 0.2; if (Math.random() < 0.25 + hook.frac * 0.3) splash(fx, fy, 12, 55); }
        zone += clamp(zoneTo - zone, -dt * (0.42 + hook.frac * 0.3), dt * (0.42 + hook.frac * 0.3));
        const inZone = Math.abs(mk - zone) <= zoneW / 2;
        if (inZone) {
          landed += dt / dur; holdLeft = Math.min(1, holdLeft + dt * 0.1);
          tickIn -= dt;
          if (tickIn <= 0) { A.sfx('tick', landed); tickIn = 0.3; }
        } else { holdLeft -= dt / 2.1; landed = Math.max(0, landed - dt * 0.04); }
        const t = Math.min(0.85, landed);
        fx = lerp(hx, AX + 48, t) + (zone - 0.5) * 56 * (1 - t * 0.6);
        fy = Math.max(TOP + 8, lerp(hy, AY + 3, t) + Math.sin(clock * 5) * 3 * (1 - t));
        if (Math.random() < dt * 5) splash(fx, fy, 2, 28);
        if (landed >= 1) land();
        else if (holdLeft <= 0) { A.sfx('miss'); say(pick(LOST), '#ffb060', 3); splash(fx, fy, 14, 40); hook = null; set('retrieve'); }
      } else if (phase === 'caught') {
        fx = tx; fy = ty;
        if ((press && pt > 0.5) || pt > 14) { card = null; hook = null; A.sfx('select'); set('ready'); }
      }
    },
    draw() {
      const T = clock; // our own clock: the host calls draw without a time
      if (!art) return;
      g.drawImage(art.sky, 0, 0);
      for (const c of clouds) g.drawImage(art.clouds[c.i], Math.round(c.x), c.y);
      g.drawImage(art.land, 0, 0);
      // moving water, drawn only on the river and clear of the near shingle
      for (const s of streaks) { if (s.y > 240 + s.x / 176 * 48 - 2 && s.x < 200) continue; rect(g, s.x, s.y, s.len, 1, s.c); }
      for (const f of flecks) rect(g, f.x, seamY(f.x) + f.j, f.len, 1, '#f0fcf6');
      for (const k of twinkles) if (Math.sin(T * k.s + k.p) > 0.86 && !(k.x < 190 && k.y > 236)) rect(g, k.x, k.y, 2, 1, '#ffffff');
      for (const [x, y, rx, ry] of ROCKS) for (let i = 0; i < 4; i++) rect(g, x - rx - 3 - ((T * 18 + i * 9) % 16), y + ry - 2 + i * 2 - 3, 3 + (i & 1) * 3, 1, '#e8fbf6');
      // the rises
      for (const q of rises) {
        for (const a of q.rings) ring(g, q.x, q.y, 3 + a * (7 + q.big * 8), a < 0.7 ? '#f4fffa' : '#a8dcd8');
        if (q.nose > 0) { rect(g, q.x - 2, q.y - 3, 4, 3, shade(q.sp.back, -0.15)); rect(g, q.x + 2, q.y - 2, 2, 1, q.sp.side); }
      }
      for (const m of flies) { const x = m.x + Math.sin(T * 0.8 + m.p) * 16, y = m.y + Math.sin(T * 2.1 + m.p) * 6; rect(g, x, y, 1, 1, '#fff6cc'); }
      if (phase === 'power' || phase === 'accuracy') {
        const p = phase === 'power' ? clamp(u, 0, 1) : pow, x = xOf(p) - (phase === 'accuracy' ? u * 22 : 0);
        const y = phase === 'accuracy' ? seamY(x) - u * 110 : seamY(x);
        const c = '#ffe08a'; ring(g, x, y, 8, c); rect(g, x, y - 2, 1, 5, c); rect(g, x - 2, y, 5, 1, c);
      }
      // rod and line
      const [tx, ty] = tipOf(rodA), hx0 = AX + 11, hy0 = AY - 22, flex = phase === 'fight' ? 7 : 0;
      const tip = [tx + flex * 1.4, ty + flex];
      const line = '#f6f2d8';
      if (phase === 'ready' || phase === 'caught') { const sway = Math.sin(T * 1.5) * 3; curve(g, tip[0], tip[1], tip[0] + 2, tip[1] + 22, tip[0] + 8 + sway, tip[1] + 30, line); rect(g, tip[0] + 8 + sway, tip[1] + 30, 2, 2, '#ff5a2a'); }
      else if (phase === 'power' || phase === 'accuracy') { const back = 44 * clamp(u, 0, 1) + 8; curve(g, tip[0], tip[1], tip[0] - back * 0.4, tip[1] - 18, tip[0] - back, tip[1] + 6, line); }
      else if (phase === 'flight') {
        const f = pt / flightDur, x = lerp(tip[0], lx, f), y = lerp(tip[1], ly, f) - Math.sin(f * 3.14) * (22 + pow * 26);
        curve(g, tip[0], tip[1], lerp(tip[0], x, 0.45), Math.min(tip[1], y) - 12, x, y, line);
        rect(g, x - 1, y - 1, 2, 2, '#ff5a2a');
      } else if (phase === 'fight' || phase === 'strike') { const j = Math.sin(T * 60) * (phase === 'fight' ? 0.7 : 0); curve(g, tip[0], tip[1], (tip[0] + fx) / 2, (tip[1] + fy) / 2 + 1 + j, fx, fy, line); }
      else { curve(g, tip[0], tip[1], (tip[0] + fx) / 2, Math.max(tip[1], fy) + 6, fx, fy, line); rect(g, fx - 1, fy - 1, 3, 2, '#ff5a2a'); }
      if (phase === 'fight') {
        const sp = hook.sp, s = 0.5 + Math.sin(T * 9) * 0.5;
        if (!sp.junk) { rect(g, fx - 5, fy - 2, 10, 3, shade(sp.back, -0.1)); rect(g, fx + 5, fy - 3 - s * 2, 3, 4, sp.side); }
        ring(g, fx, fy + 1, 5 + s * 3, '#f4fffa');
      }
      if (phase === 'drift' && take && pt > takeAt - 0.25) ring(g, fx, fy, 4 + (pt % 0.3) * 20, '#ffffff');
      if (phase === 'strike') { const b = (T * 6 % 1) < 0.5; ring(g, fx, fy, 6, '#ffffff'); if (b) text(g, '!', fx - 1, fy - 22, '#ffd23a', { scale: 2, outline: INK }); }
      curve(g, hx0, hy0, hx0 + Math.sin(rodA) * 30, hy0 - Math.cos(rodA) * 30 + flex * 0.2, tip[0], tip[1], '#3a2412', 2);
      curve(g, lerp(hx0, tip[0], 0.55), lerp(hy0, tip[1], 0.55), lerp(hx0, tip[0], 0.75), lerp(hy0, tip[1], 0.75) + flex * 0.2, tip[0], tip[1], '#a08258');
      // the angler, waist deep, off duty
      const x = AX, y = AY, tm = TEAMS[0], wader = '#57653f';
      ring(g, x, y + 1, 11 + Math.sin(T * 2) * 1.4, '#c8f0ec');
      ditherRect(g, x - 7, y + 2, 14, 13, '#3e4a2c', 0.5);
      rect(g, x - 8, y - 18, 16, 19, INK); rect(g, x - 7, y - 17, 14, 18, wader); rect(g, x - 7, y - 17, 4, 18, shade(wader, 0.18)); rect(g, x + 4, y - 17, 3, 18, shade(wader, -0.25));
      rect(g, x - 9, y - 32, 18, 16, INK); rect(g, x - 8, y - 31, 16, 14, tm.c1); rect(g, x - 8, y - 31, 4, 14, shade(tm.c1, 0.25)); rect(g, x + 4, y - 31, 4, 14, shade(tm.c1, -0.25));
      rect(g, x - 5, y - 31, 3, 14, wader); rect(g, x + 2, y - 31, 3, 14, wader); rect(g, x - 7, y - 19, 14, 2, shade(wader, -0.3));
      rect(g, x - 11, y - 28, 4, 12, INK); rect(g, x - 10, y - 27, 2, 10, tm.c1); rect(g, x - 10, y - 18, 2, 2, me.skin);
      curve(g, x + 5, y - 28, x + 10, y - 26, hx0, hy0, INK, 4); curve(g, x + 5, y - 28, x + 10, y - 26, hx0, hy0, tm.c1, 2); rect(g, hx0 - 1, hy0 - 1, 4, 4, me.skin);
      rect(g, x - 6, y - 45, 13, 13, INK); rect(g, x - 5, y - 44, 11, 12, me.skin); rect(g, x + 4, y - 40, 2, 3, shade(me.skin, -0.2)); rect(g, x + 1, y - 40, 2, 2, INK);
      if (me.moustache) rect(g, x + 1, y - 36, 5, 2, me.hair);
      if (me.hair) { rect(g, x - 6, y - 41, 3, me.hairStyle === 'bob' ? 11 : 5, me.hair); }
      rect(g, x - 11, y - 45, 23, 2, INK); rect(g, x - 10, y - 45, 21, 1, '#d8c48a');
      rect(g, x - 6, y - 51, 13, 7, INK); rect(g, x - 5, y - 50, 11, 6, '#c8b070'); rect(g, x - 5, y - 46, 11, 1, tm.c2);
      for (const p of fx2) rect(g, p.x, p.y, 1, 1, p.t > 0.25 ? '#ffffff' : '#c8ecf0');
      // the scoreboard
      const name = rename(me.name);
      const sc = log.n ? `${name}   CAUGHT ${log.n}   BEST ${log.best.toFixed(1)} IN ${log.bestName}` : `${name}   NOTHING YET`;
      panel(g, 4, 4, Math.min(386, measure(sc) + 14), 15);
      text(g, sc, 11, 8, '#ffe9a8');
      if (msgT > 0) text(g, msg, 256, 236, msgC, { align: 'center', outline: INK });
      if (phase !== 'caught') this.drawBar(T);
      if (phase === 'caught' && card) this.drawCard(T);
    },
    drawBar(T) {
      panel(g, 118, 249, 276, 36);
      const label = (s, h, c = '#ffffff') => { text(g, s, BX, 253, c); text(g, h, BX + BW, 253, '#9aa8c8', { align: 'right' }); };
      rect(g, BX, BY, BW, BH, INK);
      rect(g, BX + 1, BY + 1, BW - 2, BH - 2, '#2a3044');
      if (phase === 'strike' || phase === 'fight') {
        const w = (phase === 'strike' ? 0.26 : zoneW) * BW, x = mx(zone) - w / 2;
        const inZ = phase === 'fight' && Math.abs(mk - zone) <= zoneW / 2;
        rect(g, x, BY + 1, w, BH - 2, inZ || phase === 'strike' ? '#38d860' : '#2a9a50');
        rect(g, x, BY + 1, w, 1, '#a8ffc0');
        rect(g, mx(mk) - 1, BY - 2, 3, BH + 4, INK); rect(g, mx(mk), BY - 1, 1, BH + 2, '#ffffff');
        if (phase === 'strike') label('STRIKE!', 'PRESS ON THE GREEN', (T * 6 % 1) < 0.5 ? '#ffd23a' : '#ffffff');
        else {
          text(g, 'LANDED', BX, 253, '#7dff9a'); bar(g, BX + 40, 253, 70, 7, landed, '#38d860');
          text(g, 'LINE', BX + 120, 253, '#ffb060'); bar(g, BX + 146, 253, 110, 7, holdLeft, holdLeft < 0.3 ? '#e8342c' : '#ff8a1e');
          text(g, 'HOLD TO REEL, LET GO TO EASE', 256, 274, '#9aa8c8', { align: 'center' });
        }
        return;
      }
      // the swing: power grows to the right of the sweet spot
      for (let i = 1; i <= 4; i++) rect(g, ux(i / 4), BY + 1, 1, BH - 2, '#465070');
      rect(g, ZX - 9, BY + 1, 18, BH - 2, '#38d860'); rect(g, ZX - 9, BY + 1, 18, 1, '#a8ffc0'); rect(g, ZX, BY + 1, 1, BH - 2, '#ffffff');
      for (const q of rises) { const x = ux(clamp(pOf(q.x), 0, 1)); rect(g, x - 1, BY + 1, 3, BH - 2, (T * 3 + q.x) % 1 < 0.5 ? '#ffd23a' : '#ff8a1e'); }
      if (phase === 'accuracy') rect(g, ux(pow) - 1, BY + 1, 2, BH - 2, '#ffffff');
      if (phase === 'power' || phase === 'accuracy') { rect(g, ux(u) - 2, BY - 2, 4, BH + 4, INK); rect(g, ux(u) - 1, BY - 1, 2, BH + 2, '#ffe08a'); }
      if (phase === 'ready') label('CAST TO THE RINGS', 'SPACE OR CLICK', '#ffe9a8');
      if (phase === 'power') label('POWER', 'PRESS TO SET', '#ffd23a');
      if (phase === 'accuracy') label('ACCURACY', 'PRESS ON THE GREEN', '#7dff9a');
      if (phase === 'flight' || phase === 'retrieve') label('...', '');
      if (phase === 'drift') label('WATCH THE FLY', 'PRESS TO LIFT OFF');
      text(g, 'ORANGE TICKS ARE FISH', 256, 274, '#9aa8c8', { align: 'center' });
    },
    drawCard(T) {
      const c = card, x = 112, y = 48, w = 288, h = 144;
      panel(g, x, y, w, h, { fill: '#1a2238' });
      g.drawImage(portrait(me), x + 12, y + 12);
      text(g, c.name, x + 54, y + 13, '#ffd23a', { scale: 2 });
      text(g, c.sp.junk ? 'NOT, STRICTLY, A FISH' : `${c.size.toFixed(1)} INCHES`, x + 54, y + 33, '#ffffff');
      if (c.isBest && (T * 4 % 1) < 0.65) text(g, 'NEW BEST', x + w - 12, y + 33, '#7dff9a', { align: 'right' });
      drawFish(g, x + w / 2, y + 80, c.sp.junk ? 0 : clamp(c.size * 8.5, 60, 236), c.sp);
      const lines = wrap(c.cap, w - 28);
      lines.slice(0, 2).forEach((s, i) => text(g, s, x + w / 2, y + 112 + i * 10, '#e8ecf8', { align: 'center' }));
      if ((T * 2 % 1) < 0.7) text(g, 'SPACE OR CLICK', x + w / 2, y + 133, '#9aa8c8', { align: 'center' });
    },
    leave() {},
  };
}
