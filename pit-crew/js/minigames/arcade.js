// The arcade: Toby off duty in a one-screen video arcade. Five cabinets run the little games from
// micro.js, full-screen behind a chunky bezel; the claw machine is its own view, from over his shoulder.
import { W, H, rect, ellipse, poly, shade, mix, canvas, dith, ditherRect } from '../gfx.js';
import { text, measure, wrap } from '../font.js';
import { PEOPLE } from '../data.js';
import { rename } from '../banter.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inR = (p, r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
const INK = '#0a0a10';
const ACCENT = ['#e8348c', '#18c8d8', '#f2c218', '#8a5cf0', '#ff8a1e'];

// What survives leaving the scene and coming back: high scores, tokens, the prize shelf, the heap.
const SESSION = { hi: {}, won: [], tokens: 5, change: 0, heap: null };

// The cabinets' games come from micro.js, which may not be there yet: placeholders stand in.
let CABS = [];
const loadMicro = () => import('./micro.js').then(m => { if (Array.isArray(m.CABINETS)) CABS = m.CABINETS; }).catch(() => {});
loadMicro();
function brokenGame() {
  let t = 0;
  return {
    score: 0,
    update(dt) { t += dt; },
    draw(c) {
      const bars = ['#e8342c', '#f2c218', '#38d860', '#18c8d8', '#2457d6', '#c828c8'];
      bars.forEach((col, i) => rect(c, i * 11, 0, 11, 30, col));
      rect(c, 0, 30, 64, 18, '#101018');
      if (t * 2 % 1 < 0.6) text(c, 'PLEASE', 32, 32, '#ffffff', { align: 'center' });
      text(c, 'STAND BY', 32, 40, '#ffd23a', { align: 'center' });
    },
  };
}
const SPARES = [0, 1, 2, 3, 4].map(i => ({ id: 'spare' + i, title: 'COIN-OP ' + (i + 1), make: brokenGame }));
const cabinet = i => CABS[i] || SPARES[i];

// ---------------------------------------------------------------- plushies (10x10, at most 100 px)
const PAL = { k: '#101014', K: '#2c2c34', y: '#f2c218', g: '#a0a6b0', w: '#f4f4fa', o: '#ff8a1e', Y: '#ffd23a', u: '#c8921e', d: '#5a3c10', T: '#16b3a3', D: '#1b3a6a', G: '#4cc84a', L: '#2f8f3a', B: '#b0703e', b: '#7a4a28', S: '#ffc83a', p: '#ff7aa8' };
const PLUSH = [
  { name: 'TYRE', art: ['..kkkkkk..', '.kKKKKKKk.', 'kKKyyyyKKk', 'kKykggkyKk', 'kKyggggyKk', 'kKygwwgyKk', 'kKyggggyKk', 'kKKyyyyKKk', '.kKKKKKKk.', '..kkkkkk..'] },
  { name: 'WHEEL NUT', art: ['...uuuu...', '..uYYYYu..', '.uYYuuYYu.', 'uYYudduYYu', 'uYuddddyYu', 'uYuddddyYu', 'uYYudduYYu', '.uYYuuYYu.', '..uYYYYu..', '...uuuu...'] },
  { name: 'LITTLE CAR', art: ['..........', '....DD....', '...TTTT...', 'oTTTTTTTTo', 'oTwTTTTwTo', '.kkTTTTkk.', 'kkkkTTkkkk', 'kggkkkkggk', '.kk....kk.', '..........'] },
  { name: 'FROG', art: ['.GG....GG.', 'GwkG..GkwG', 'GGGGGGGGGG', 'GGGGGGGGGG', 'GkGGGGGGkG', 'GGkkkkkkGG', '.GGGGGGGG.', '.LLGGGGLL.', 'LLL.GG.LLL', '..........'] },
  { name: 'DUCK', art: ['...YYYY...', '..YYYYYY..', '..YkYYkY..', '..YYooYY..', '...YYYY...', '.YYYYYYYY.', 'YYYYYYYYYY', 'YYYuuuuYYY', '.YYYYYYYY.', '..oo..oo..'] },
  { name: 'BEAR', art: ['.BB....BB.', 'BbBBBBBBbB', '.BBBBBBBB.', '.BkBBBBkB.', '.BBBwwBBB.', '.BBwkkwBB.', '..BBBBBB..', '.BBBBBBBB.', 'BBBbbbbBBB', '.BB....BB.'] },
  { name: 'STAR', art: ['....SS....', '....SS....', '...SSSS...', 'SSSSSSSSSS', '.SSkSSkSS.', '..SSSSSS..', '..SppppS..', '.SSS..SSS.', '.SS....SS.', 'S........S'] },
];
const plushCache = new Map();
function plushSpr(d, tone = 0) {
  const key = d + ':' + tone;
  if (plushCache.has(key)) return plushCache.get(key);
  const [c, b] = canvas(10, 10);
  PLUSH[d].art.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') rect(b, x, y, 1, 1, tone ? shade(PAL[ch], -0.1 * tone) : PAL[ch]); }));
  plushCache.set(key, c);
  return c;
}

// Depth in the claw machine: rows run back (0) to front (4), and the pile humps up in the middle.
const rowY = r => 136 + r * 17;
const mound = x => Math.max(0, 13 * (1 - ((x - 236) / 104) ** 2));
const plushY = p => rowY(p.row) - mound(p.x) - p.layer * 11;
const sortHeap = h => h.sort((a, b) => a.row - b.row || a.layer - b.layer || a.x - b.x);
function makeHeap() {
  let s = 4111;
  const r = n => { s = (s * 16807) % 2147483647; return s / 2147483647 * n; };
  const out = [];
  for (let row = 0; row < 5; row++) for (let x = 152 + row * 3; x < 328; x += 19 + r(4)) out.push({ x: Math.round(x + r(6) - 3), row, layer: 0, d: Math.floor(r(PLUSH.length)) });
  for (let i = 0; i < 24; i++) out.push({ x: Math.round(176 + r(120)), row: Math.floor(r(5)), layer: 1, d: Math.floor(r(PLUSH.length)) });
  return sortHeap(out);
}

// ---------------------------------------------------------------- sprites and backdrops (baked once)
function bakeCab(col, dead) {
  const [c, b] = canvas(34, 60);
  const lit = dead ? '#3a3648' : col;
  rect(b, 2, 2, 30, 58, INK);
  rect(b, 3, 3, 25, 56, '#221e38');
  rect(b, 28, 3, 3, 56, '#141228');
  rect(b, 3, 3, 28, 3, '#3a345a');
  rect(b, 4, 7, 24, 8, lit); rect(b, 4, 7, 24, 2, shade(lit, 0.4)); rect(b, 4, 14, 24, 1, shade(lit, -0.4));
  rect(b, 5, 16, 22, 19, '#08080e');
  rect(b, 7, 18, 18, 14, '#060814');
  rect(b, 4, 36, 24, 5, '#3a345a'); rect(b, 4, 36, 24, 1, '#5a5478');
  rect(b, 9, 37, 2, 3, INK); rect(b, 9, 36, 2, 1, '#e8342c');
  rect(b, 17, 38, 2, 2, '#ffd23a'); rect(b, 21, 38, 2, 2, '#38d860');
  rect(b, 4, 42, 24, 16, shade(lit, -0.62));
  for (let i = 0; i < 16; i++) rect(b, 4 + i * 1.5, 56 - i, 3, 1, shade(lit, -0.3));
  rect(b, 12, 45, 8, 8, '#14121f'); rect(b, 13, 46, 2, 5, dead ? '#333' : '#e8342c'); rect(b, 17, 46, 2, 5, dead ? '#333' : '#e8342c');
  rect(b, 29, 8, 1, 49, shade(lit, -0.5));
  if (dead) {
    rect(b, 7, 18, 18, 14, '#101018');
    rect(b, 9, 22, 18, 11, '#f0e6b8'); rect(b, 11, 25, 14, 1, '#b02818'); rect(b, 11, 28, 10, 1, '#b02818');
    rect(b, 13, 20, 8, 3, '#d8c88a');
  }
  return c;
}
function bakeClawSprite() {
  const [c, b] = canvas(54, 72);
  rect(b, 2, 0, 50, 72, INK);
  rect(b, 3, 1, 44, 70, '#3a1a68'); rect(b, 47, 1, 4, 70, '#22103e');
  rect(b, 4, 2, 42, 9, '#ffd23a'); rect(b, 4, 2, 42, 2, '#fff0a8'); rect(b, 4, 10, 42, 1, '#c89418');
  for (let x = 6; x < 46; x += 6) rect(b, x, 5, 3, 3, '#e8342c');
  rect(b, 5, 13, 40, 34, '#120a26'); rect(b, 6, 14, 38, 32, '#2a1a58');
  rect(b, 6, 38, 38, 8, '#1a1040');
  let s = 91;
  const r = n => { s = (s * 16807) % 2147483647; return Math.floor(s / 2147483647 * n); };
  const cols = ['#4cc84a', '#ffd23a', '#16b3a3', '#ff7aa8', '#b0703e', '#2c2c34'];
  for (let i = 0; i < 40; i++) rect(b, 7 + r(34), 34 + r(11), 3, 3, cols[i % 6]);
  rect(b, 24, 14, 1, 9, '#9aa0aa'); rect(b, 21, 23, 7, 2, '#c8ccd4'); rect(b, 20, 25, 2, 3, '#c8ccd4'); rect(b, 27, 25, 2, 3, '#c8ccd4');
  rect(b, 8, 15, 2, 12, '#ffffff'); rect(b, 12, 15, 1, 8, '#ffffff');
  rect(b, 4, 49, 42, 8, '#5a3a98'); rect(b, 4, 49, 42, 1, '#7a5ab8');
  rect(b, 10, 50, 2, 5, INK); rect(b, 10, 49, 2, 2, '#e8342c'); rect(b, 20, 51, 4, 3, '#38d860');
  rect(b, 32, 58, 12, 11, '#120a26'); rect(b, 33, 59, 10, 4, '#2a2040');
  return c;
}
function bakeFridge() {
  const [c, b] = canvas(36, 62);
  rect(b, 2, 0, 32, 62, INK);
  rect(b, 3, 1, 26, 60, '#c8d0dc'); rect(b, 29, 1, 4, 60, '#8a94a4');
  rect(b, 5, 3, 22, 7, '#e8342c'); text(b, 'SODA', 16, 3, '#ffffff', { align: 'center' });
  rect(b, 5, 12, 22, 40, '#66c8f0'); rect(b, 6, 13, 20, 38, '#9ae0ff');
  const cans = ['#e8342c', '#ff8a1e', '#38d860', '#f2c218', '#2457d6'];
  for (let y = 0; y < 4; y++) { rect(b, 6, 21 + y * 9, 20, 1, '#6a7a8a'); for (let x = 0; x < 5; x++) { rect(b, 7 + x * 4, 15 + y * 9, 3, 6, cans[(x + y * 2) % 5]); rect(b, 7 + x * 4, 15 + y * 9, 3, 1, '#e8eef6'); } }
  rect(b, 8, 13, 2, 38, 'rgba(255,255,255,.45)');
  rect(b, 25, 28, 2, 12, '#5a6470');
  rect(b, 5, 54, 22, 5, '#5a6470');
  return c;
}
function bakeChange() {
  const [c, b] = canvas(30, 54);
  rect(b, 2, 0, 26, 54, INK);
  rect(b, 3, 1, 21, 52, '#8a94a4'); rect(b, 24, 1, 3, 52, '#5a6470');
  rect(b, 3, 1, 24, 2, '#c8d0dc');
  rect(b, 6, 5, 15, 11, '#1a4a2a'); text(b, '$', 13, 7, '#7dff9a', { align: 'center' });
  rect(b, 7, 19, 13, 3, INK); rect(b, 8, 20, 11, 1, '#5a6470');
  rect(b, 9, 24, 9, 2, '#ffd23a');
  rect(b, 6, 30, 15, 12, '#2a2e38'); rect(b, 7, 31, 13, 10, '#101218'); rect(b, 7, 39, 13, 2, '#5a6470');
  rect(b, 5, 45, 17, 6, '#6a7484');
  return c;
}
function glow(b, x, y, w, len, col) {
  b.fillStyle = col;
  for (let py = y; py < y + len; py++) for (let px = x - w; px < x + w; px++) {
    if (dith(px, py, 0.62 * (1 - (py - y) / len) * (1 - Math.abs(px - x) / w))) b.fillRect(px, py, 1, 1);
  }
}
function bakeRoom(machines) {
  const [c, b] = canvas(W, H);
  rect(b, 0, 62, W, H - 62, '#1a1440');
  let s = 77;
  const r = n => { s = (s * 16807) % 2147483647; return s / 2147483647 * n; };
  const LOUD = ['#d02a7c', '#14a0b4', '#dcae18', '#6e38c4', '#2c9048'];
  for (let i = 0; i < 280; i++) {
    const x = r(W), y = 62 + r(H - 62), col = LOUD[i % 5], k = i % 4;
    if (k === 0) poly(b, [[x, y], [x + 11, y + 3], [x + 2, y + 11]], col);
    else if (k === 1) { ellipse(b, x, y, 6, 6, col); ellipse(b, x, y, 3.4, 3.4, '#1a1440'); }
    else if (k === 2) for (let j = 0; j < 8; j++) rect(b, x + j * 3, y + Math.round(Math.sin(j) * 3), 3, 2, col);
    else { rect(b, x, y, 3, 3, col); rect(b, x + 7, y + 5, 2, 2, '#f0e8d8'); }
  }
  rect(b, 0, 62, W, H - 62, 'rgba(14,8,34,.42)');
  // the wall
  rect(b, 0, 0, W, 62, '#241a44');
  for (let x = 0; x < W; x += 16) rect(b, x, 0, 1, 62, '#2c2150');
  rect(b, 0, 0, W, 3, '#120c28');
  rect(b, 0, 58, W, 5, '#120c28'); rect(b, 0, 58, W, 1, '#3a2c64');
  // posters, kept clear of the corner the Continue button uses
  [[6, 22, '#e8342c', '#ffd23a'], [370, 26, '#18c8d8', '#e8348c']].forEach(([x, y, a, z]) => { rect(b, x, y, 22, 30, INK); rect(b, x + 1, y + 1, 20, 28, a); poly(b, [[x + 3, y + 24], [x + 11, y + 6], [x + 19, y + 24]], z); });
  // the prize shelf
  ellipse(b, 456, 40, 44, 20, '#31245a');
  for (const y of [38, 56]) { rect(b, 410, y, 92, 3, '#6a4426'); rect(b, 410, y, 92, 1, '#9a6a3a'); rect(b, 410, y + 3, 92, 1, '#1a1030'); }
  for (const m of machines) if (m.col) glow(b, m.x, m.y + 2, m.kind === 'claw' ? 40 : 26, 44, m.col);
  // the room's edges
  rect(b, 0, 62, 14, H - 62, '#100c28'); rect(b, 498, 62, 14, H - 62, '#100c28');
  rect(b, 0, 274, W, 14, '#100c28');
  rect(b, 224, 274, 64, 14, '#3a2c64'); rect(b, 228, 276, 56, 12, '#6a5a2a');
  for (let i = 0; i < 4; i++) { // the corners of the room fall away into the dark
    const t = 0.42 - i * 0.1, d = i * 10;
    ditherRect(b, 14 + d, 62, 10, H - 62, '#050410', t); ditherRect(b, 488 - d, 62, 10, H - 62, '#050410', t);
    ditherRect(b, 14, 266 - d, W - 28, 8, '#050410', t);
  }
  return c;
}

// The over-the-shoulder view: a one-point hall of cabinets running off behind the claw machine.
const BTN = { x: 212, y: 228, w: 26, h: 22 };
function bakeClawView(hallDots) {
  const [c, b] = canvas(W, H);
  rect(b, 0, 0, W, H, '#070814');
  const VX = 56, VY = 106, F = 220;
  const P = (X, Y, z) => [VX + X * F / z, VY + Y * F / z];
  const fog = (col, z, k = 1) => mix(col, '#070814', Math.min(0.9, k * z / 46));
  const quad = (pts, col) => poly(b, pts.map(p => [Math.round(p[0]), Math.round(p[1])]), col);
  // carpet in big receding checks
  for (let z = 44; z >= 1.4; z -= 2) for (let X = -66; X < 66; X += 3) {
    const n = Math.round(z / 2) + Math.round(X / 3);
    const zn = Math.max(0.9, z - 2); // never reaches the camera: at z = 0 the row would be infinitely tall
    quad([P(X, 1, z), P(X + 3, 1, z), P(X + 3, 1, zn), P(X, 1, zn)], fog(n % 2 ? '#2c1c58' : '#1c1440', z));
  }
  // ceiling tiles of light, in long rows
  for (let z = 44; z >= 2.5; z -= 2.5) for (let X = -60; X <= 60; X += 7.5) {
    const col = fog('#fff2c8', z, 0.85);
    quad([P(X - 1, -3.4, z), P(X + 1, -3.4, z), P(X + 1, -3.4, z - 1.4), P(X - 1, -3.4, z - 1.4)], col);
  }
  const SCREENS = ['#18c8d8', '#e8348c', '#7dff9a', '#ffd23a', '#c8a0ff'];
  const rows = Array.from({ length: 18 }, (_, i) => 1.6 + i * 2.6);
  let n = 0;
  for (let z = 39; z >= 4.6; z -= 1.4) { // nothing nearer, or one cabinet would fill the side strip
    n++;
    if (n % 7 === 0) continue; // a cross aisle now and then
    for (const R of rows) for (const sd of [-1, 1]) {
      if (sd > 0 && z < 8.5) continue; // the strip right of the machine stays far away and busy
      const X0 = sd > 0 ? R : -R - 1, X1 = X0 + 1, near = sd > 0 ? X0 : X1, z1 = z + 1.2, top = -0.75, ft = 1;
      const body = sd > 0 ? '#2a2448' : '#332a58', screen = SCREENS[(n * 2 + Math.round(R) * 3 + (sd > 0 ? 1 : 0)) % 5], mq = ACCENT[(n + Math.round(R)) % 5];
      quad([P(near, top, z), P(near, top, z1), P(near, ft, z1), P(near, ft, z)], fog(body, z));
      quad([P(near, top, z), P(near, top, z1), P(near, -0.5, z1), P(near, -0.5, z)], fog(mq, z, 0.7));
      quad([P(near, -0.3, z + 0.2), P(near, -0.3, z1 - 0.2), P(near, 0.3, z1 - 0.2), P(near, 0.3, z + 0.2)], fog(screen, z, 0.55));
      const [lx, ty] = P(X0, top, z), [rx, by] = P(X1, ft, z);
      if (rx - lx >= 1) rect(b, lx, ty, rx - lx, by - ty, fog(shade(body, 0.16), z));
      const [mx, my] = P(near, 0, z + 0.6);
      if (z < 22 && mx >= 0 && mx < W && (mx < 100 || mx > 412)) hallDots.push({ x: Math.round(mx), y: Math.round(my), col: screen });
    }
  }
  // far-off signs and silhouettes down the aisle
  [[30, '#e8348c'], [20, '#18c8d8'], [12, '#ffd23a']].forEach(([z, col]) => {
    const [x0, y0] = P(-1.2, -2.6, z), [x1, y1] = P(1.2, -1.9, z);
    rect(b, x0, y0, x1 - x0, y1 - y0, col); rect(b, x0 + 1, y0 + 1, x1 - x0 - 2, 1, '#ffffff');
  });
  [[-0.5, 16], [0.4, 9], [-0.2, 6]].forEach(([X, z]) => {
    const [x, y] = P(X, 1, z), s = F / z;
    rect(b, x - s * 0.2, y - s * 1.45, s * 0.4, s * 1.45, '#04050c');
    ellipse(b, x, y - s * 1.6, s * 0.2, s * 0.22, '#04050c');
  });
  // cabinet glow spilling on the hall
  ditherRect(b, 88, 32, 16, 256, '#6a3ad8', 0.45); ditherRect(b, 408, 32, 16, 256, '#6a3ad8', 0.45);
  ditherRect(b, 112, 0, 288, 6, '#ffd23a', 0.3);
  // the machine itself
  rect(b, 102, 30, 308, 258, INK);
  rect(b, 104, 32, 304, 256, '#3a1a68');
  rect(b, 104, 32, 304, 2, '#6a3aa8');
  for (let y = 40; y < 288; y += 4) rect(b, 106, y, 2, 2, '#5a2a98'), rect(b, 404, y, 2, 2, '#5a2a98');
  // marquee
  rect(b, 118, 4, 276, 30, INK);
  rect(b, 120, 6, 272, 26, '#c81e3a'); rect(b, 120, 6, 272, 2, '#ff6a7a'); rect(b, 120, 30, 272, 2, '#7a1020');
  text(b, 'CLAW & ORDER', 256, 12, '#fff4c0', { align: 'center', scale: 2, shadow: '#5a0a18' });
  // the glass well, in perspective
  rect(b, 124, 40, 264, 172, '#0a0614');
  poly(b, [[126, 42], [386, 42], [364, 64], [148, 64]], '#1c1038');
  poly(b, [[126, 42], [148, 64], [148, 134], [126, 212]], '#2a1a50');
  poly(b, [[386, 42], [364, 64], [364, 134], [386, 212]], '#221444');
  rect(b, 148, 64, 216, 70, '#3a2a78');
  for (let i = 0; i < 26; i++) { const x = 154 + (i * 53) % 204, y = 68 + (i * 29) % 60; rect(b, x, y, 2, 2, i % 3 ? '#6a58b0' : '#ffd23a'); }
  poly(b, [[148, 134], [364, 134], [386, 212], [126, 212]], '#2c1c50');
  // the rails the gantry runs on
  poly(b, [[130, 46], [136, 46], [152, 62], [148, 62]], '#7a8290'); poly(b, [[382, 46], [376, 46], [360, 62], [364, 62]], '#7a8290');
  // the prize chute's far side
  rect(b, 344, 150, 40, 60, '#1a1038'); rect(b, 346, 152, 36, 56, '#0e0820');
  // lower front: control panel and base
  rect(b, 110, 214, 292, 46, '#5a3a98'); rect(b, 110, 214, 292, 2, '#8a68c8'); rect(b, 110, 258, 292, 2, '#2a1458');
  rect(b, 110, 260, 292, 28, '#2c1458');
  for (let i = 0; i < 18; i++) rect(b, 200 + i * 11, 283, 7, 2, '#3a1a68');
  rect(b, 160, 224, 26, 24, '#2a1458'); rect(b, 163, 241, 20, 4, INK);
  rect(b, BTN.x - 1, BTN.y - 1, BTN.w + 2, BTN.h + 2, INK); rect(b, BTN.x, BTN.y, BTN.w, BTN.h, '#2a1458');
  rect(b, 248, 222, 76, 30, INK); rect(b, 249, 223, 74, 28, '#180a06');
  rect(b, 332, 218, 62, 38, INK); rect(b, 333, 219, 60, 36, '#120a1c');
  text(b, 'PRIZE', 363, 208, '#ffd23a', { align: 'center' });
  return c;
}
function bakeGlass() {
  const [c, b] = canvas(W, H);
  // the chute's near side, then streaks across the whole front
  rect(b, 342, 148, 44, 4, '#ffd23a'); rect(b, 342, 148, 44, 1, '#fff0a8');
  rect(b, 342, 152, 2, 60, 'rgba(200,220,255,.55)'); rect(b, 384, 152, 2, 60, 'rgba(200,220,255,.55)');
  rect(b, 344, 152, 40, 56, 'rgba(160,200,255,.14)');
  rect(b, 350, 156, 2, 44, 'rgba(255,255,255,.3)');
  poly(b, [[150, 40], [186, 40], [130, 212], [124, 212], [124, 124]], 'rgba(255,255,255,.07)');
  poly(b, [[204, 40], [214, 40], [158, 212], [148, 212]], 'rgba(255,255,255,.06)');
  poly(b, [[340, 40], [388, 40], [388, 96]], 'rgba(255,255,255,.05)');
  return c;
}
// Toby from behind: the big shape in the corner. The joystick arm is drawn live.
function bakeForeground() {
  const [c, b] = canvas(W, H);
  const skin = PEOPLE.toby.skin, hair = PEOPLE.toby.hair, shirt = '#f2efe0', sd = '#c8c2a8';
  const body = [[-12, 288], [-12, 264], [26, 248], [100, 248], [150, 264], [196, 288]];
  poly(b, body.map(([x, y], i) => [x + (i < 2 ? -1 : 1), y - 1]), INK);
  poly(b, body, shirt);
  poly(b, [[-12, 276], [60, 268], [190, 288], [-12, 288]], sd);
  rect(b, 10, 268, 100, 5, '#ff8a1e'); rect(b, 10, 273, 100, 2, '#b85a10');
  poly(b, [[112, 250], [156, 264], [168, 288], [120, 288]], shirt);
  poly(b, [[112, 250], [156, 264], [168, 288], [158, 288], [140, 268]], sd);
  rect(b, 42, 236, 44, 14, shade(skin, -0.18)); rect(b, 34, 247, 60, 4, '#a8a288'); rect(b, 40, 246, 48, 3, shade(skin, -0.3));
  ellipse(b, 16, 208, 9, 13, INK); ellipse(b, 16, 208, 7, 11, skin); ellipse(b, 110, 208, 9, 13, INK); ellipse(b, 110, 208, 7, 11, skin);
  ellipse(b, 63, 198, 46, 49, INK);
  ellipse(b, 66, 197, 44, 47, mix(hair, '#ff70c8', 0.55));
  ellipse(b, 60, 200, 43, 46, hair);
  for (let i = 0; i < 34; i++) {
    const x = 24 + (i * 37) % 76, y = 162 + (i * 23) % 72;
    if (((x + 5 - 60) / 36) ** 2 + ((y - 200) / 40) ** 2 > 1) continue; // tufts stay on his head
    rect(b, x, y, 9, 2, shade(hair, i % 2 ? -0.18 : 0.14)); rect(b, x + 3, y + 2, 5, 2, shade(hair, -0.26));
  }
  for (let i = 0; i < 6; i++) rect(b, 38 + i * 8, 240 + (i % 3) * 2, 7, 3 + (i % 2) * 2, hair);
  return c;
}
function bakeBezel(col) {
  const [c, b] = canvas(W, H);
  rect(b, 0, 0, W, H, '#14111f');
  for (const sx of [0, 416]) {
    rect(b, sx, 0, 96, H, shade(col, -0.68));
    for (let i = 0; i < 40; i++) rect(b, sx, 244 - i * 6, 96, 3, i % 2 ? shade(col, -0.56) : shade(col, -0.74));
    rect(b, sx + 18, 66, 60, 52, '#0a0a10');
    for (let y = 70; y < 114; y += 5) for (let x = sx + 22; x < sx + 74; x += 5) rect(b, x, y, 3, 3, '#26242f');
    rect(b, sx + 12, 138, 72, 4, col); rect(b, sx + 12, 145, 50, 2, shade(col, 0.3));
  }
  rect(b, 88, 34, 336, 254, INK); rect(b, 90, 36, 332, 252, '#1e1a2c'); rect(b, 94, 38, 324, 250, '#050508');
  rect(b, 134, 2, 244, 32, INK); rect(b, 136, 4, 240, 28, col); rect(b, 136, 4, 240, 3, shade(col, 0.5)); rect(b, 136, 29, 240, 3, shade(col, -0.45));
  rect(b, 12, 8, 112, 22, INK); rect(b, 14, 10, 108, 18, '#180a06');
  rect(b, 388, 22, 112, 18, INK); rect(b, 390, 24, 108, 14, '#180a06');
  rect(b, 8, 252, 76, 26, '#0a0a10');
  return c;
}
function bakeCrt() {
  const [c, b] = canvas(320, 240);
  for (let y = 4; y < 240; y += 5) rect(b, 0, y, 320, 1, 'rgba(0,0,0,.24)');
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (let i = 0; i < 6; i++) {
    const w = 6 - i;
    rect(b, cx ? 320 - w * 2 : 0, cy ? 239 - i * 2 - 1 : i * 2, w * 2, 2, '#050508');
  }
  return c;
}

// ---------------------------------------------------------------- people in the room
const LOOK = {
  toby: () => ({ skin: PEOPLE.toby.skin, hair: PEOPLE.toby.hair, shirt: '#f2efe0', stripe: '#ff8a1e', pants: '#2f4a7a' }),
  lou: () => ({ skin: PEOPLE.lou.skin, style: 'bald', moustache: PEOPLE.lou.hair, shirt: '#2f6a4a', pants: '#3a3430' }),
  pip: () => ({ skin: PEOPLE.pip.skin, hair: PEOPLE.pip.hair, shirt: '#c83a4a', pants: '#26242e' }),
  kid: () => ({ skin: '#e0b090', hair: '#6a4426', cap: '#2457d6', shirt: '#ffd23a', pants: '#a06a3a' }),
};
function person(g, x, y, dir, walk, o) {
  x = Math.round(x); y = Math.round(y);
  const step = walk ? (Math.floor(walk) % 2 ? 1 : -1) : 0, side = dir === 1 || dir === 3, face = dir === 3 ? -1 : 1;
  ellipse(g, x, y, 8, 3, 'rgba(0,0,0,.42)');
  const paint = (ox, oy, ink) => {
    const R = (a, b, w, h, col) => { g.fillStyle = ink || col; g.fillRect(x + a + ox, y + b + oy, w, h); };
    if (side) { R(-3 + step * 2, -7, 4, 7, o.pants); R(-1 - step * 2, -7, 4, 7, shade(o.pants, -0.2)); R(-3 + step * 2, -1, 4, 1, INK); R(-1 - step * 2, -1, 4, 1, INK); }
    else { R(-4, -7, 3, step < 0 ? 6 : 7, o.pants); R(1, -7, 3, step > 0 ? 6 : 7, o.pants); R(-4, step < 0 ? -2 : -1, 3, 1, INK); R(1, step > 0 ? -2 : -1, 3, 1, INK); }
    R(-5, -16, 10, 10, o.shirt);
    if (o.stripe) R(-5, -12, 10, 2, o.stripe);
    if (side) { R(-1 - step, -15, 3, 4, shade(o.shirt, -0.14)); R(-1 - step, -11, 3, 4, o.skin); }
    else { R(-7, -15 + step, 2, 4, o.shirt); R(-7, -11 + step, 2, 4, o.skin); R(5, -15 - step, 2, 4, o.shirt); R(5, -11 - step, 2, 4, o.skin); }
    R(-4, -25, 8, 9, o.skin);
    if (o.cap) R(-5, -27, 10, 4, o.cap);
    else if (o.style !== 'bald') R(-5, -27, 10, 4, o.hair);
    if (dir === 0 && o.style !== 'bald') R(-5, -24, 10, 6, o.hair);
    if (side && o.style !== 'bald') R(face > 0 ? -5 : 3, -24, 2, 4, o.hair);
    if (o.cap && side) R(face > 0 ? 4 : -7, -24, 3, 1, o.cap);
    if (!ink) {
      if (dir === 2) { R(-3, -21, 2, 2, '#1a1010'); R(1, -21, 2, 2, '#1a1010'); if (o.moustache) R(-3, -19, 6, 1, o.moustache); }
      else if (side) { R(face > 0 ? 1 : -2, -21, 2, 2, '#1a1010'); if (o.moustache) R(face > 0 ? 0 : -4, -19, 4, 1, o.moustache); }
    }
  };
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(ox, oy, INK);
  paint(0, 0, null);
}
function bubble(g, x, y, str, head) {
  const lines = wrap(str, 132), w = Math.max(measure(head || ''), ...lines.map(l => measure(l))) + 10, h = lines.length * 9 + (head ? 17 : 8);
  const bx = Math.round(clamp(x - w / 2, 4, W - w - 4)), by = Math.round(clamp(y - h - 6, 24, H - h - 4));
  rect(g, bx - 1, by - 1, w + 2, h + 2, INK); rect(g, bx, by, w, h, '#f4f0e0'); rect(g, x - 2, by + h, 5, 3, '#f4f0e0'); rect(g, x - 1, by + h + 3, 3, 2, INK);
  let ty = by + 4;
  if (head) { text(g, head, bx + 5, ty, '#b02818'); ty += 9; }
  for (const l of lines) { text(g, l, bx + 5, ty, '#1a1830'); ty += 9; }
}
function attract(g, x, y, w, h, i, T, col) {
  rect(g, x, y, w, h, '#060814');
  for (let j = 0; j < 5; j++) {
    const a = T * (1.2 + i * 0.3) + j * 1.3 + i;
    rect(g, x + Math.floor((Math.sin(a) + 1) * 0.5 * (w - 3)), y + Math.floor(j * 3 + T * 6 * (1 + i % 2)) % h, 3, 2, j % 2 ? col : '#ffffff');
  }
  rect(g, x, y + (Math.floor(T * 11) % h), w, 1, 'rgba(255,255,255,.14)');
}

export default function make({ g, W: SW, H: SH, A }) {
  const sfx = (n, p) => { try { A.sfx(n, p); } catch (e) {} };
  const [mc, mg] = canvas(64, 48);
  mg.imageSmoothingEnabled = false;
  const hallDots = [];
  const cabSpr = ACCENT.map(c => bakeCab(c, false)), deadSpr = bakeCab('#555566', true);
  const clawSpr = bakeClawSprite(), fridgeSpr = bakeFridge(), changeSpr = bakeChange();
  const M = [
    { kind: 'soda', x: 42, y: 78, spr: fridgeSpr, hw: 16, hh: 12, label: 'SODA FRIDGE', col: '#3a9ae0' },
    { kind: 'cab', i: 0, x: 94, y: 78, spr: cabSpr[0], hw: 15, hh: 12, col: ACCENT[0] },
    { kind: 'cab', i: 1, x: 134, y: 78, spr: cabSpr[1], hw: 15, hh: 12, col: ACCENT[1] },
    { kind: 'cab', i: 2, x: 174, y: 78, spr: cabSpr[2], hw: 15, hh: 12, col: ACCENT[2] },
    { kind: 'dead', x: 216, y: 78, spr: deadSpr, hw: 15, hh: 12 },
    { kind: 'change', x: 262, y: 78, spr: changeSpr, hw: 13, hh: 12, label: 'CHANGE MACHINE', col: '#3ac868' },
    { kind: 'claw', x: 330, y: 78, spr: clawSpr, hw: 25, hh: 12, label: 'CLAW & ORDER', col: '#c858ff' },
    { kind: 'cab', i: 3, x: 218, y: 186, spr: cabSpr[3], hw: 15, hh: 12, col: ACCENT[3] },
    { kind: 'cab', i: 4, x: 256, y: 186, spr: cabSpr[4], hw: 15, hh: 12, col: ACCENT[4] },
  ];
  const NPC = [
    { x: 92, y: 138, dir: 1, look: LOOK.lou(), head: () => rename('BIG LOU'), says: () => `${PEOPLE.toby.name}! Two weeks off and you came to a room full of things to carry on with.`, phase: 0 },
    { x: 216, y: 102, dir: 0, look: LOOK.pip(), head: () => rename('PIP'), says: () => rename("It says out of order. It's lying. If Mags asks, I was at the gym."), phase: 2 },
    { x: 408, y: 176, dir: 3, look: LOOK.kid(), head: () => 'LOCAL KID', says: () => `Hey, are you ${PEOPLE.toby.name}? You dropped that wheel on telly.`, phase: 4 },
  ];
  const room = bakeRoom(M), bezels = ACCENT.map(bakeBezel), crt = bakeCrt();
  const clawBg = bakeClawView(hallDots), glass = bakeGlass(), fg = bakeForeground();
  const shelfT = PEOPLE.toby.name + "'S SHELF";
  const toby = { x: 256, y: 240, dir: 0, walk: 0, moved: false };
  let view = 'room', wipe = 0, near = null, say = null, coins = [], shake = 0;
  let cab = null, claw = null, wonVisit = 0;
  const label = m => (m.kind === 'cab' ? cabinet(m.i).title : m.label).toUpperCase();
  function plate(m) {
    const t = label(m), w = measure(t) + 46, x = clamp(m.x - w / 2, 4, 392 - w), y = Math.max(2, m.y - m.spr.height - 14);
    return { x: Math.round(x), y, w: Math.round(w), h: 13 };
  }
  const go = v => { view = v; wipe = 1; };
  function speak(line, t = 2.8) { say = { line, t }; }

  // ---------------------------------------------------------------- the room
  function solid(x, y) {
    if (x < 22 || x > 490 || y < 86 || y > 266) return true;
    if (M.some(m => x > m.x - m.hw - 4 && x < m.x + m.hw + 4 && y > m.y - m.hh - 2 && y < m.y + 3)) return true;
    return NPC.some(n => Math.abs(x - n.x) < 9 && y > n.y - 5 && y < n.y + 4);
  }
  function use(m) {
    if (m.kind === 'cab') openCab(m.i);
    else if (m.kind === 'claw') openClaw();
    else if (m.kind === 'soda') { sfx('clunk'); speak("It only ever has Diet Apricot. It's always Diet Apricot."); }
    else if (m.kind === 'change') {
      if (SESSION.change === 0) { SESSION.change = 1; sfx('clunk'); speak('It took the fiver. It is thinking about it. Maybe give it a thump.'); }
      else {
        SESSION.change = 0; SESSION.tokens += 6; shake = 0.35; sfx('thud'); sfx('good');
        for (let i = 0; i < 18; i++) coins.push({ x: m.x + 2, y: m.y - 16, vx: -80 + Math.random() * 160, vy: -90 - Math.random() * 90, t: 1.1 + Math.random() * 0.5 });
        speak(`A light thump. Six tokens. ${PEOPLE.toby.name} is good at this.`);
      }
    }
  }
  function updateRoom(dt, io) {
    const mx = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
    const my = (io.held('KeyS') || io.held('ArrowDown') ? 1 : 0) - (io.held('KeyW') || io.held('ArrowUp') ? 1 : 0);
    if (mx || my) {
      const k = (mx && my ? 0.72 : 1) * 104 * dt;
      if (mx && !solid(toby.x + mx * k, toby.y)) toby.x += mx * k;
      if (my && !solid(toby.x, toby.y + my * k)) toby.y += my * k;
      toby.dir = mx ? (mx > 0 ? 1 : 3) : my > 0 ? 2 : 0;
      toby.walk += dt * 9;
      toby.moved = true;
    } else toby.walk = 0;
    near = null;
    let best = 1e9;
    for (const m of M) {
      if (m.kind === 'dead') continue;
      if (Math.abs(toby.x - m.x) > m.hw + 6 || toby.y < m.y - 2 || toby.y > m.y + 28) continue;
      const d = Math.abs(toby.x - m.x) + Math.abs(toby.y - m.y);
      if (d < best) { best = d; near = m; }
    }
    if (near) {
      const r = plate(near), s = { x: near.x - near.spr.width / 2, y: near.y - near.spr.height, w: near.spr.width, h: near.spr.height };
      if (io.pressed('Space') || io.pressed('Enter') || (io.mouse.clicked && (inR(io.mouse, r) || inR(io.mouse, s)))) use(near);
    }
    if (say && (say.t -= dt) <= 0) say = null;
    shake = Math.max(0, shake - dt);
    for (const c of coins) {
      c.t -= dt; c.vy += 520 * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.y > 92) { c.y = 92; c.vy *= -0.42; c.vx *= 0.7; }
    }
    coins = coins.filter(c => c.t > 0);
  }
  function drawRoom(T) {
    g.drawImage(room, 0, 0);
    const flick = (T * 3.7) % 11 < 0.3;
    text(g, 'TOKEN GESTURE', 204, 3, flick ? '#6a3a5a' : '#ff5ab4', { align: 'center', scale: 2, shadow: flick ? null : '#5a1a50' });
    // the prize shelf
    if (!SESSION.won.length) text(g, 'NOTHING YET', 456, 47, '#7a6aa0', { align: 'center' });
    text(g, shelfT, 456, 22, '#a898c8', { align: 'center' });
    SESSION.won.slice(0, 16).forEach((d, i) => g.drawImage(plushSpr(d), 414 + (i % 8) * 11, i < 8 ? 28 : 46));
    if (SESSION.won.length > 16) text(g, '+' + (SESSION.won.length - 16), 500, 48, '#ffd23a', { align: 'right', shadow: INK });
    const all = [...M.map(m => ({ y: m.y, m })), ...NPC.map(n => ({ y: n.y, n })), { y: toby.y, toby: true }].sort((a, b) => a.y - b.y);
    for (const a of all) {
      if (a.m) {
        const m = a.m, sx = m.x - m.spr.width / 2 + (m.kind === 'change' && shake ? (Math.sin(T * 60) * 2 | 0) : 0), sy = m.y - m.spr.height;
        g.drawImage(m.spr, Math.round(sx), sy);
        if (m.kind === 'cab') { attract(g, sx + 7, sy + 18, 18, 14, m.i, T, ACCENT[m.i]); if (T * 1.2 % 1 < 0.5) rect(g, sx + 6, sy + 8, 2, 2, '#ffffff'); }
      } else if (a.n) person(g, a.n.x, a.n.y + (Math.sin(T * 2 + a.n.phase) > 0.6 ? -1 : 0), a.n.dir, 0, a.n.look);
      else person(g, toby.x, toby.y, toby.dir, toby.walk, LOOK.toby());
    }
    for (const c of coins) rect(g, c.x, c.y, 3, 3, '#ffd23a');
    const talker = NPC.find(n => Math.hypot(n.x - toby.x, n.y - toby.y) < 30);
    if (near) {
      const r = plate(near), t = label(near);
      rect(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, INK); rect(g, r.x, r.y, r.w, r.h, '#14182a');
      text(g, t, r.x + 5, r.y + 3, near.col || '#ffffff');
      const kx = r.x + r.w - 36;
      rect(g, kx, r.y + 2, 33, 9, T * 2 % 1 < 0.6 ? '#ffd23a' : '#c89418');
      text(g, 'SPACE', kx + 2, r.y + 3, '#14182a');
    }
    if (say) bubble(g, toby.x, toby.y - 30, say.line);
    else if (talker) bubble(g, talker.x, talker.y - 30, talker.says(), talker.head());
    rect(g, 4, 4, 110, 11, INK); rect(g, 5, 5, 108, 9, '#14182a');
    text(g, 'TOKENS ' + SESSION.tokens, 8, 6, '#ffd23a');
    text(g, 'WON ' + SESSION.won.length, 110, 6, '#c858ff', { align: 'right' });
    if (!toby.moved) text(g, 'WASD OR ARROWS TO WALK', SW / 2, 259, '#ffffff', { align: 'center', outline: INK });
  }

  // ---------------------------------------------------------------- a video cabinet
  function openCab(i) {
    loadMicro();
    const c = cabinet(i);
    let game = null;
    try { game = c.make(); } catch (e) { console.error('[arcade]', c.id, e); game = brokenGame(); }
    cab = { i, c, game, newHi: false };
    sfx('whoosh'); go('cab');
  }
  function updateCab(dt, io) {
    if (io.pressed('Escape')) { cab = null; sfx('whoosh'); go('room'); return; }
    try { cab.game.update(dt, io); } catch (e) { console.error('[arcade]', cab.c.id, e); cab.game = brokenGame(); }
    const s = Math.floor(Number(cab.game.score) || 0), id = cab.c.id;
    if (s > (SESSION.hi[id] || 0)) { SESSION.hi[id] = s; if (s > 0) cab.newHi = true; }
  }
  function drawCab(T) {
    const c = cab.c, col = ACCENT[cab.i % ACCENT.length];
    g.drawImage(bezels[cab.i % bezels.length], 0, 0);
    rect(mg, 0, 0, 64, 48, '#000000');
    try { cab.game.draw(mg); } catch (e) { console.error('[arcade]', c.id, e); cab.game = brokenGame(); }
    const smooth = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(mc, 96, 40, 320, 240);
    g.imageSmoothingEnabled = smooth;
    g.drawImage(crt, 96, 40);
    const title = c.title.toUpperCase(), scale = measure(title, 2) > 232 ? 1 : 2;
    text(g, title, 256, scale === 2 ? 11 : 15, '#ffffff', { align: 'center', scale, shadow: shade(col, -0.55) });
    text(g, 'HI ' + (SESSION.hi[c.id] || 0), 118, 15, cab.newHi && T * 3 % 1 < 0.5 ? '#ffffff' : '#ffb000', { align: 'right' });
    text(g, 'SCORE ' + Math.floor(Number(cab.game.score) || 0), 494, 28, '#ffb000', { align: 'right' });
    if (cab.newHi) text(g, 'NEW HIGH', 48, 36, T * 3 % 1 < 0.5 ? '#ffd23a' : '#ffffff', { align: 'center' });
    text(g, 'ESC', 46, 256, '#ffd23a', { align: 'center' });
    text(g, 'LEAVE', 46, 266, '#ffffff', { align: 'center' });
  }

  // ---------------------------------------------------------------- the claw machine
  const HOME = { x: 364, d: 0.92 }, HOVER = 82;
  const railY = d => 62 - d * 16;
  const surface = (x, d) => rowY(d * 4) - mound(x) - 8;
  function openClaw() {
    if (!SESSION.heap) SESSION.heap = makeHeap();
    claw = { st: 'idle', x: HOME.x, d: HOME.d, y: HOVER, open: 1, t: 0, target: HOVER, held: null, heldT: 0, slips: false, slipAt: 9, q: 0, sway: 0, mx: 0, mz: 0, msg: 'DROP WHEN READY', msgT: 2.4, prize: null, pop: 0, popD: 0, falls: [], tick: 0, shake: 0 };
    wonVisit = 0;
    sfx('whoosh'); go('claw');
  }
  function closeClaw() {
    if (claw.held) SESSION.heap.push({ x: clamp(Math.round(claw.x), 152, 328), row: clamp(Math.round(claw.d * 4), 0, 4), layer: 1, d: claw.held.d });
    for (const f of claw.falls) SESSION.heap.push({ x: f.tx, row: f.row, layer: 1, d: f.d });
    sortHeap(SESSION.heap);
    if (wonVisit) speak(wonVisit > 1 ? `${wonVisit} plushies. Worth every token.` : 'Worth every token.', 3.2);
    claw = null; sfx('whoosh'); go('room');
  }
  const note = (msg, t = 1.8) => { claw.msg = msg; claw.msgT = t; };
  function letGo(fromSlip) {
    const row = clamp(Math.round(claw.d * 4), 0, 4), tx = clamp(Math.round(claw.x), 152, 328);
    claw.falls.push({ x: claw.x, y: claw.y + 18, vy: 0, d: claw.held.d, row, tx, ty: rowY(row) - mound(tx) - 11 });
    claw.held = null;
    if (fromSlip) { sfx('miss'); note(['SO CLOSE.', 'THE CLAW GIVETH.', 'IT WAS NEVER YOURS.'][Math.floor(Math.random() * 3)]); }
  }
  function grab() {
    const rowF = claw.d * 4;
    let best = null, bestD = 18;
    for (const p of SESSION.heap) {
      const d = Math.hypot(p.x - claw.x, (p.row - rowF) * 15) - p.layer * 3;
      if (d < bestD) { best = p; bestD = d; }
    }
    if (!best) { note('CLOSED ON AIR.'); sfx('miss'); return; }
    SESSION.heap.splice(SESSION.heap.indexOf(best), 1);
    claw.held = best; claw.heldT = 0;
    claw.q = clamp(1 - bestD / 18, 0, 1);
    claw.slips = Math.random() < 0.6 - 0.5 * claw.q;
    claw.slipAt = 0.25 + Math.random() * 1.9;
    sfx('clunk');
  }
  function drop() {
    if (SESSION.tokens <= 0) { sfx('miss'); note('OUT OF TOKENS. THE CHANGE MACHINE MIGHT HELP.', 2.6); return; }
    SESSION.tokens--;
    claw.st = 'down'; claw.target = Math.max(HOVER + 6, surface(claw.x, claw.d) - 20);
    claw.msgT = 0;
    sfx('select'); sfx('whoosh');
  }
  function updateClaw(dt, io) {
    if (io.pressed('Escape')) { closeClaw(); return; }
    const C = claw;
    C.msgT = Math.max(0, C.msgT - dt); C.pop = Math.max(0, C.pop - dt); C.shake = Math.max(0, C.shake - dt);
    C.mx = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
    C.mz = (io.held('KeyS') || io.held('ArrowDown') ? 1 : 0) - (io.held('KeyW') || io.held('ArrowUp') ? 1 : 0);
    let vx = 0;
    if (C.held) {
      C.heldT += dt;
      if (C.slips && C.heldT >= C.slipAt) { letGo(true); C.shake = 0.3; }
    }
    if (C.st === 'idle') {
      vx = C.mx * 118;
      C.x = clamp(C.x + vx * dt, 150, 372);
      C.d = clamp(C.d + C.mz * 0.85 * dt, 0, 1);
      if (C.mx || C.mz) { C.tick -= dt; if (C.tick <= 0) { C.tick = 0.14; sfx('tick', 0.2); } }
      if (io.pressed('Space') || (io.mouse.clicked && inR(io.mouse, BTN))) drop();
    } else if (C.st === 'down') {
      C.y += 138 * dt;
      if (C.y >= C.target) { C.y = C.target; C.st = 'close'; C.t = 0; sfx('thud'); }
    } else if (C.st === 'close') {
      C.t += dt; C.open = Math.max(0, 1 - C.t / 0.34);
      if (C.t >= 0.42) { grab(); C.st = 'up'; }
    } else if (C.st === 'up') {
      C.y -= 96 * dt;
      if (C.y <= HOVER) { C.y = HOVER; C.st = 'carry'; }
    } else if (C.st === 'carry') {
      const dx = HOME.x - C.x, step = 128 * dt;
      vx = Math.abs(dx) < step ? dx / dt : Math.sign(dx) * 128;
      C.x += vx * dt;
      const dd = HOME.d - C.d;
      C.d += clamp(dd, -0.95 * dt, 0.95 * dt);
      if (Math.abs(C.x - HOME.x) < 0.5 && Math.abs(C.d - HOME.d) < 0.01) { C.x = HOME.x; C.d = HOME.d; C.st = 'release'; C.t = 0; }
    } else if (C.st === 'release') {
      C.t += dt; C.open = Math.min(1, C.t / 0.3);
      if (C.held) {
        C.prize = { x: C.x, y: C.y + 18, vy: 0, d: C.held.d };
        SESSION.won.push(C.held.d); wonVisit++;
        C.held = null; sfx('good');
      }
      if (C.t > 0.5 && !C.prize) C.st = 'idle';
    }
    C.sway += (clamp(vx * 0.05, -6, 6) - C.sway) * Math.min(1, 7 * dt);
    if (C.prize) {
      const p = C.prize;
      p.vy += 760 * dt; p.y += p.vy * dt;
      if (p.y > 204) { C.popD = p.d; C.pop = 2.4; C.prize = null; sfx('perfect'); note('GOT THE ' + PLUSH[p.d].name + '!', 2.4); }
    }
    for (const f of C.falls) {
      f.vy += 760 * dt; f.y += f.vy * dt; f.x += (f.tx - f.x) * Math.min(1, 9 * dt);
      if (f.y >= f.ty) { f.done = true; SESSION.heap.push({ x: f.tx, row: f.row, layer: 1, d: f.d }); sortHeap(SESSION.heap); sfx('thud'); }
    }
    C.falls = C.falls.filter(f => !f.done);
  }
  function drawPlush(p, y) {
    const tone = 4 - clamp(Math.round(p.row), 0, 4);
    g.drawImage(plushSpr(p.d, tone), Math.round(p.x - 10), Math.round(y - 20), 20, 20);
  }
  const seg = (ax, ay, bx, by, w, col) => poly(g, [[ax - w / 2, ay], [ax + w / 2, ay], [bx + w / 2, by], [bx - w / 2, by]], col);
  function clawHead(x, y, o, held) {
    const prong = (s, col, w) => { const kx = x + s * (7 + o * 10), tx = x + s * (2 + o * 9); seg(x + s * 5, y + 2, kx, y + 11, w, col); seg(kx, y + 11, tx, y + 21, w, col); };
    rect(g, x - 2, y + 2, 4, 14, INK);
    if (held) drawPlush({ ...held, row: 4 }, y + 26);
    for (const s of [-1, 1]) { prong(s, INK, 5); prong(s, '#b4bac6', 3); }
    rect(g, x - 1, y + 3, 2, 12, '#7a8290');
    rect(g, x - 8, y - 7, 16, 10, INK); rect(g, x - 7, y - 6, 14, 8, '#d0d6e0'); rect(g, x - 7, y - 6, 14, 2, '#f4f6fa'); rect(g, x - 7, y, 14, 2, '#7a8290');
    rect(g, x - 2, y - 3, 4, 3, '#e8342c');
  }
  function drawClaw(T, io) {
    const C = claw, rowF = C.d * 4;
    g.drawImage(clawBg, 0, 0);
    hallDots.forEach((d, i) => { if ((T * (1 + i % 3) + i * 0.7) % 1.7 < 0.8) rect(g, d.x, d.y, 2, 2, d.col); });
    for (let x = 124; x < 392; x += 11) rect(g, x, 8, 3, 3, Math.floor(T * 4 + x / 11) % 2 ? '#fff4c0' : '#7a1020');
    for (let x = 124; x < 392; x += 11) rect(g, x, 27, 3, 3, Math.floor(T * 4 + x / 11) % 2 ? '#7a1020' : '#fff4c0');
    const ry = Math.round(railY(C.d));
    rect(g, 132, ry - 2, 248, 5, INK); rect(g, 133, ry - 1, 246, 3, '#9aa2b0'); rect(g, 133, ry - 1, 246, 1, '#d0d6e0');
    for (const p of SESSION.heap) if (p.row <= rowF) drawPlush(p, plushY(p));
    const hx = Math.round(C.x + C.sway + (C.held && C.q < 0.45 ? Math.sin(T * 44) * 1.5 : 0) + (C.shake ? Math.sin(T * 70) * 2 : 0)), floor = rowY(rowF) - mound(C.x);
    ellipse(g, Math.round(C.x), Math.round(floor - 4), 12, 5, 'rgba(0,0,0,.5)');
    rect(g, Math.round(C.x) - 9, ry - 5, 18, 8, INK); rect(g, Math.round(C.x) - 8, ry - 4, 16, 6, '#e8342c'); rect(g, Math.round(C.x) - 8, ry - 4, 16, 2, '#ff8a7a');
    poly(g, [[C.x - 1, ry + 2], [C.x + 1, ry + 2], [hx + 1, C.y - 6], [hx - 1, C.y - 6]], '#c8ccd4');
    clawHead(hx, Math.round(C.y), C.open, C.held);
    for (const p of SESSION.heap) if (p.row > rowF) drawPlush(p, plushY(p));
    for (const f of C.falls) drawPlush({ d: f.d, row: 4 }, f.y + 12);
    if (C.prize) drawPlush({ d: C.prize.d, row: 4 }, C.prize.y + 12);
    g.drawImage(glass, 0, 0);
    if (C.msgT > 0) text(g, C.msg, 256, 192, C.msg.startsWith('GOT') ? '#ffd23a' : '#ffffff', { align: 'center', outline: INK });
    // the prize door swings up as it comes out
    if (C.pop > 0) {
      const up = clamp((2.4 - C.pop) * 8, 0, 1) * clamp(C.pop * 4, 0, 1);
      g.drawImage(plushSpr(C.popD), 348, 226 + (1 - up) * 16, 30, 30);
      rect(g, 333, 219, 60, 6 + (1 - up) * 30, '#3a2a58');
    } else { rect(g, 333, 219, 60, 36, '#3a2a58'); text(g, 'PUSH', 363, 233, '#8a78b0', { align: 'center' }); }
    rect(g, 333, 219, 60, 1, '#6a5a88');
    // tokens, won, joystick, button
    text(g, 'TOKENS', 254, 226, '#ffb000'); text(g, String(SESSION.tokens), 318, 226, '#ffd23a', { align: 'right' });
    text(g, 'WON', 254, 239, '#ff5a3a'); text(g, String(SESSION.won.length), 318, 239, '#ffd23a', { align: 'right' });
    const idle = C.st === 'idle', ready = idle && SESSION.tokens > 0;
    rect(g, BTN.x + 2, BTN.y + 2, BTN.w - 4, BTN.h - 4, ready && T * 2 % 1 < 0.55 ? '#ff5a4a' : '#a02018');
    rect(g, BTN.x + 3, BTN.y + 3, BTN.w - 6, 3, '#ff9a8a');
    const bx = 173 + (idle ? C.mx : 0) * 6, by = 230 + (idle ? C.mz : 0) * 3;
    poly(g, [[172, 243], [175, 243], [bx + 1.5, by], [bx - 1.5, by]], '#9aa0aa');
    ellipse(g, bx, by, 6, 6, INK); ellipse(g, bx, by, 5, 5, '#e8342c');
    text(g, 'ARROWS OR WASD: MOVE', 298, 263, '#d0c0f0', { align: 'center', outline: '#1a0838' });
    text(g, 'SPACE: DROP   ESC: BACK', 298, 274, '#d0c0f0', { align: 'center', outline: '#1a0838' });
    // Toby, then his arm reaching up to the stick
    const breath = Math.sin(T * 1.8) > 0.4 ? 1 : 0;
    g.drawImage(fg, 0, breath);
    const skin = PEOPLE.toby.skin;
    poly(g, [[119, 284], [163, 266], [bx + 11, by + 11], [bx - 10, by + 11]], INK);
    poly(g, [[121, 284], [161, 267], [bx + 10, by + 11], [bx - 9, by + 11]], skin);
    poly(g, [[121, 284], [138, 278], [bx - 2, by + 11], [bx - 9, by + 11]], shade(skin, -0.2));
    rect(g, bx - 11, by, 22, 13, INK); rect(g, bx - 10, by + 1, 20, 11, skin); rect(g, bx - 10, by + 1, 20, 2, shade(skin, 0.2));
    for (let i = 1; i < 4; i++) rect(g, bx - 10 + i * 5, by + 1, 1, 6, shade(skin, -0.3));
  }

  return {
    enter() { view = 'room'; wipe = 1; },
    update(dt, io) {
      wipe = Math.max(0, wipe - dt * 3.2);
      if (view === 'room') updateRoom(dt, io);
      else if (view === 'cab') updateCab(dt, io);
      else updateClaw(dt, io);
    },
    draw(T, io) {
      if (view === 'room') drawRoom(T);
      else if (view === 'cab') drawCab(T);
      else drawClaw(T, io);
      if (wipe > 0) { const h = Math.round(wipe * SH / 2); rect(g, 0, 0, SW, h, '#05060a'); rect(g, 0, SH - h, SW, h, '#05060a'); }
    },
    leave() { cab = null; if (claw) { closeClaw(); say = null; } },
  };
}
