// The arcade: the Tyre Carrier, Front Jack and Refueller off duty in a one-screen video arcade, one of
// them under your control. Five cabinets run the little games from micro.js behind a chunky bezel,
// and the claw machine is a cabinet game too, with prizes that stack, ride the claw and fall.
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

// Inside the claw machine, in its own low-res pixels (shown 3x, as the cabinets show theirs 5x).
// Prizes are round for physics: they settle into a heap, follow the claw and fall when let go.
const KW = 107, KH = 80, K_FLOOR = 75, K_WALL = 83, K_WALL_TOP = 44, K_L = 3, K_R = 104, PR = 4.8, K_G = 250;
const K_RAIL = 6, K_HOVER = 16, K_HOME = 94, K_GRIP = 9;
function stepPrizes(list, h) {
  for (const p of list) { p.ox = p.x; p.oy = p.y; p.vy += K_G * h; p.x += p.vx * h; p.y += p.vy * h; p.touch = false; }
  for (let it = 0; it < 5; it++) for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 >= 4 * PR * PR) continue;
      const d = Math.sqrt(d2) || 0.01, push = (2 * PR - d) / 2, nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      a.touch = b.touch = true;
    }
    if (a.x < K_L + PR) { a.x = K_L + PR; a.touch = true; }
    if (a.x > K_R - PR) { a.x = K_R - PR; a.touch = true; }
    if (a.y > K_FLOOR - PR) { a.y = K_FLOOR - PR; a.touch = true; }
    // the wall between the heap and the prize chute, with a rounded top
    if (a.y > K_WALL_TOP && Math.abs(a.x - K_WALL) < PR + 1) { a.x = K_WALL + (a.ox < K_WALL ? -1 : 1) * (PR + 1); a.touch = true; }
    else { const dx = a.x - K_WALL, dy = a.y - K_WALL_TOP, d = Math.hypot(dx, dy); if (d < PR && d > 0) { a.x = K_WALL + dx / d * PR; a.y = K_WALL_TOP + dy / d * PR; a.touch = true; } }
  }
  let fast = 0;
  for (const p of list) {
    p.vx = (p.x - p.ox) / h; p.vy = (p.y - p.oy) / h;
    if (p.touch) p.vx *= 0.7;
    fast = Math.max(fast, Math.abs(p.vx), Math.abs(p.vy));
  }
  return fast;
}
function makeHeap() {
  let s = 4111;
  const r = n => { s = (s * 16807) % 2147483647; return s / 2147483647 * n; };
  const out = [];
  for (let row = 0; row < 4; row++) for (let x = K_L + 6 + (row % 2) * 4; x < K_WALL - 6; x += 10.2) out.push({ x: x + r(1.2), y: K_FLOOR - PR - row * 9.4, vx: 0, vy: 0, d: Math.floor(r(PLUSH.length)) });
  for (let i = 0; i < 300; i++) stepPrizes(out, 1 / 60);
  for (const p of out) p.vx = p.vy = 0;
  return out;
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

// Who's in, and what the other two say when you wander past. Names come from Team Setup.
const REGULARS = {
  toby: { head: () => rename('TOBY'), says: () => rename("I've carried four thousand tyres this year and I can't carry this high score.") },
  lou: { head: () => rename('BIG LOU'), says: me => `${PEOPLE[me].name}! Two weeks off and you came to a room full of things to carry on with.` },
  pip: { head: () => rename('PIP'), says: () => rename("It says out of order. It's lying. If Mags asks, I was at the gym.") },
};
const TELLY = { toby: 'You dropped that wheel on telly.', lou: 'You dropped that car on telly.', pip: 'You set that car on fire on telly.' };

export default function make({ g, W: SW, H: SH, A }) {
  const sfx = (n, p) => { try { A.sfx(n, p); } catch (e) {} };
  const [mc, mg] = canvas(64, 48);
  mg.imageSmoothingEnabled = false;
  const [kc, km] = canvas(KW, KH);
  // tonight's hero is one of the three, the other two are already here
  const me = ['toby', 'lou', 'pip'][Math.floor(Math.random() * 3)];
  const myName = () => PEOPLE[me].name;
  const others = ['lou', 'toby', 'pip'].filter(k => k !== me);
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
    ...others.map((k, i) => ({ x: i ? 216 : 92, y: i ? 102 : 138, dir: i ? 0 : 1, look: LOOK[k](), head: REGULARS[k].head, says: () => REGULARS[k].says(me), phase: i * 2 })),
    { x: 408, y: 176, dir: 3, look: LOOK.kid(), head: () => 'LOCAL KID', says: () => `Hey, are you ${myName()}? ${TELLY[me]}`, phase: 4 },
  ];
  const room = bakeRoom(M), bezels = ACCENT.map(bakeBezel), crt = bakeCrt();
  const clawBezel = bakeBezel('#c858ff');
  const shelfT = 'CREW PRIZE SHELF';
  const hero = { x: 256, y: 240, dir: 0, walk: 0, moved: false };
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
        speak(`A light thump. Six tokens. ${myName()} is good at this.`);
      }
    }
  }
  function updateRoom(dt, io) {
    const mx = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
    const my = (io.held('KeyS') || io.held('ArrowDown') ? 1 : 0) - (io.held('KeyW') || io.held('ArrowUp') ? 1 : 0);
    if (mx || my) {
      const k = (mx && my ? 0.72 : 1) * 104 * dt;
      if (mx && !solid(hero.x + mx * k, hero.y)) hero.x += mx * k;
      if (my && !solid(hero.x, hero.y + my * k)) hero.y += my * k;
      hero.dir = mx ? (mx > 0 ? 1 : 3) : my > 0 ? 2 : 0;
      hero.walk += dt * 9;
      hero.moved = true;
    } else hero.walk = 0;
    near = null;
    let best = 1e9;
    for (const m of M) {
      if (m.kind === 'dead') continue;
      if (Math.abs(hero.x - m.x) > m.hw + 6 || hero.y < m.y - 2 || hero.y > m.y + 28) continue;
      const d = Math.abs(hero.x - m.x) + Math.abs(hero.y - m.y);
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
    const all = [...M.map(m => ({ y: m.y, m })), ...NPC.map(n => ({ y: n.y, n })), { y: hero.y, hero: true }].sort((a, b) => a.y - b.y);
    for (const a of all) {
      if (a.m) {
        const m = a.m, sx = m.x - m.spr.width / 2 + (m.kind === 'change' && shake ? (Math.sin(T * 60) * 2 | 0) : 0), sy = m.y - m.spr.height;
        g.drawImage(m.spr, Math.round(sx), sy);
        if (m.kind === 'cab') { attract(g, sx + 7, sy + 18, 18, 14, m.i, T, ACCENT[m.i]); if (T * 1.2 % 1 < 0.5) rect(g, sx + 6, sy + 8, 2, 2, '#ffffff'); }
      } else if (a.n) person(g, a.n.x, a.n.y + (Math.sin(T * 2 + a.n.phase) > 0.6 ? -1 : 0), a.n.dir, 0, a.n.look);
      else person(g, hero.x, hero.y, hero.dir, hero.walk, LOOK[me]());
    }
    for (const c of coins) rect(g, c.x, c.y, 3, 3, '#ffd23a');
    const talker = NPC.find(n => Math.hypot(n.x - hero.x, n.y - hero.y) < 30);
    if (near) {
      const r = plate(near), t = label(near);
      rect(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, INK); rect(g, r.x, r.y, r.w, r.h, '#14182a');
      text(g, t, r.x + 5, r.y + 3, near.col || '#ffffff');
      const kx = r.x + r.w - 36;
      rect(g, kx, r.y + 2, 33, 9, T * 2 % 1 < 0.6 ? '#ffd23a' : '#c89418');
      text(g, 'SPACE', kx + 2, r.y + 3, '#14182a');
    }
    if (say) bubble(g, hero.x, hero.y - 30, say.line);
    else if (talker) bubble(g, talker.x, talker.y - 30, talker.says(), talker.head());
    rect(g, 4, 4, 110, 11, INK); rect(g, 5, 5, 108, 9, '#14182a');
    text(g, 'TOKENS ' + SESSION.tokens, 8, 6, '#ffd23a');
    text(g, 'WON ' + SESSION.won.length, 110, 6, '#c858ff', { align: 'right' });
    if (!hero.moved) text(g, 'WASD OR ARROWS TO WALK', SW / 2, 259, '#ffffff', { align: 'center', outline: INK });
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
  const BTN = { x: 440, y: 160, w: 48, h: 48 };
  function openClaw() {
    if (!SESSION.heap) SESSION.heap = makeHeap();
    claw = { st: 'idle', x: K_HOME, y: K_HOVER, vx: 0, vy: 0, open: 1, t: 0, target: K_HOVER, held: null, heldT: 0, slips: false, slipAt: 9, q: 0, sway: 0, mx: 0, msg: 'DROP WHEN READY', msgT: 2.4, pop: 0, popD: 0, tick: 0, shake: 0, awake: true, calm: 0 };
    wonVisit = 0;
    sfx('whoosh'); go('claw');
  }
  function closeClaw() {
    if (claw.held) { claw.held.vx = claw.held.vy = 0; SESSION.heap.push(claw.held); }
    if (wonVisit) speak(wonVisit > 1 ? `${wonVisit} plushies. Worth every token.` : 'Worth every token.', 3.2);
    claw = null; sfx('whoosh'); go('room');
  }
  const note = (msg, t = 1.8) => { claw.msg = msg; claw.msgT = t; };
  // Let go: the prize keeps the claw's speed, then gravity has it.
  function letGo(fromSlip) {
    const C = claw, p = C.held;
    p.vx = C.vx; p.vy = C.vy; p.falling = true;
    SESSION.heap.push(p);
    C.held = null; C.awake = true; C.calm = 0;
    if (fromSlip) { sfx('miss'); note(['SO CLOSE.', 'THE CLAW GIVETH.', 'IT WAS NEVER YOURS.'][Math.floor(Math.random() * 3)]); }
  }
  function grab() {
    const C = claw, gy = C.y + K_GRIP;
    let best = null, bestD = 9;
    for (const p of SESSION.heap) {
      const d = Math.hypot(p.x - C.x, p.y - gy);
      if (d < bestD) { best = p; bestD = d; }
    }
    if (!best) { note('CLOSED ON AIR.'); sfx('miss'); return; }
    SESSION.heap.splice(SESSION.heap.indexOf(best), 1);
    C.held = best; C.heldT = 0; C.awake = true; C.calm = 0; // the heap slumps into the gap
    C.q = clamp(1 - bestD / 9, 0, 1);
    C.slips = Math.random() < 0.6 - 0.5 * C.q;
    C.slipAt = 0.25 + Math.random() * 1.9;
    sfx('clunk');
  }
  function surfaceAt(x) {
    let top = K_FLOOR;
    for (const p of SESSION.heap) { const dx = Math.abs(p.x - x); if (dx < PR + 1) top = Math.min(top, p.y - Math.sqrt((PR + 1) ** 2 - dx * dx)); }
    return top;
  }
  function drop() {
    if (SESSION.tokens <= 0) { sfx('miss'); note('OUT OF TOKENS. TRY THE CHANGE MACHINE.', 2.6); return; }
    SESSION.tokens--;
    claw.st = 'down'; claw.target = clamp(surfaceAt(claw.x) - K_GRIP + 3, K_HOVER + 2, K_FLOOR - K_GRIP - 2);
    claw.msgT = 0;
    sfx('select'); sfx('whoosh');
  }
  function updateClaw(dt, io) {
    if (io.pressed('Escape')) { closeClaw(); return; }
    const C = claw, ox = C.x, oy = C.y;
    C.msgT = Math.max(0, C.msgT - dt); C.pop = Math.max(0, C.pop - dt); C.shake = Math.max(0, C.shake - dt);
    C.mx = (io.held('KeyD') || io.held('ArrowRight') ? 1 : 0) - (io.held('KeyA') || io.held('ArrowLeft') ? 1 : 0);
    if (C.st === 'idle') {
      C.x = clamp(C.x + C.mx * 40 * dt, K_L + 6, K_HOME + 2);
      if (C.mx) { C.tick -= dt; if (C.tick <= 0) { C.tick = 0.14; sfx('tick', 0.2); } }
      if (io.pressed('Space') || (io.mouse.clicked && inR(io.mouse, BTN))) drop();
    } else if (C.st === 'down') {
      C.y += 46 * dt;
      if (C.y >= C.target) { C.y = C.target; C.st = 'close'; C.t = 0; sfx('thud'); }
    } else if (C.st === 'close') {
      C.t += dt; C.open = Math.max(0, 1 - C.t / 0.34);
      if (C.t >= 0.42) { grab(); C.st = 'up'; }
    } else if (C.st === 'up') {
      C.y -= 32 * dt;
      if (C.y <= K_HOVER) { C.y = K_HOVER; C.st = 'carry'; }
    } else if (C.st === 'carry') {
      const dx = K_HOME - C.x, step = 43 * dt;
      C.x += Math.abs(dx) < step ? dx : Math.sign(dx) * step;
      if (Math.abs(C.x - K_HOME) < 0.2) { C.x = K_HOME; C.st = 'release'; C.t = 0; }
    } else if (C.st === 'release') {
      C.t += dt; C.open = Math.min(1, C.t / 0.3);
      if (C.held && C.t > 0.12) letGo(false);
      if (C.t > 0.5 && !SESSION.heap.some(p => p.x > K_WALL)) { C.st = 'idle'; C.open = 1; }
    }
    C.vx = (C.x - ox) / dt; C.vy = (C.y - oy) / dt;
    C.sway += (clamp(C.vx * 0.05, -2, 2) - C.sway) * Math.min(1, 7 * dt);
    if (C.held) {
      C.heldT += dt;
      // the prize goes wherever the claw goes
      C.held.x = C.x + C.sway; C.held.y = C.y + K_GRIP + 1;
      if (C.slips && C.heldT >= C.slipAt) { letGo(true); C.shake = 0.3; }
    }
    if (C.awake) {
      const fast = stepPrizes(SESSION.heap, Math.min(dt, 1 / 50));
      C.calm = fast < 7 ? C.calm + dt : 0;
      if (C.calm > 0.4) { C.awake = false; for (const p of SESSION.heap) p.vx = p.vy = 0; }
      for (const p of SESSION.heap) if (p.falling && p.touch && p.y > K_WALL_TOP) { p.falling = false; sfx('thud'); }
    }
    for (let i = SESSION.heap.length - 1; i >= 0; i--) {
      const p = SESSION.heap[i];
      if (p.x > K_WALL + 1 && p.y >= K_FLOOR - PR - 1.5) {
        SESSION.heap.splice(i, 1);
        SESSION.won.push(p.d); wonVisit++;
        C.popD = p.d; C.pop = 2.4; sfx('good'); sfx('perfect');
        note('GOT THE ' + PLUSH[p.d].name + '!', 2.4);
      }
    }
  }
  const pix = (m, x0, y0, x1, y1, col) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)); for (let i = 0; i <= n; i++) rect(m, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 1, 1, col); };
  function drawClawGame(T) {
    const C = claw, m = km;
    rect(m, 0, 0, KW, KH, '#1c0f3c');
    for (let i = 0; i < 46; i++) { const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12543.123; rect(m, 4 + Math.floor((a - Math.floor(a)) * 98), 9 + Math.floor((b - Math.floor(b)) * 62), 1, 1, i % 4 ? '#3a2a78' : '#ffd23a'); }
    // the chute behind its wall
    rect(m, K_WALL + 1, K_WALL_TOP, K_R - K_WALL - 1, K_FLOOR - K_WALL_TOP, '#0e0820');
    for (let i = 0; i < 3; i++) rect(m, K_HOME - 3 + i, 30 + i + Math.round((T * 3) % 2), 7 - i * 2, 1, '#ffd23a'); // "drops here" arrow
    rect(m, 0, K_FLOOR, KW, KH - K_FLOOR, '#3a1a68'); rect(m, 0, K_FLOOR, KW, 1, '#7a48c0');
    rect(m, 0, 0, K_L, KH, '#2a1458'); rect(m, K_R, 0, KW - K_R, KH, '#2a1458');
    // the rail along the top, with the carriage on it
    rect(m, K_L, 0, K_R - K_L, K_RAIL - 1, '#2a1458');
    rect(m, K_L, K_RAIL, K_R - K_L, 2, '#9aa2b0'); rect(m, K_L, K_RAIL, K_R - K_L, 1, '#d8dee8');
    for (const p of SESSION.heap) m.drawImage(plushSpr(p.d), Math.round(p.x - 5), Math.round(p.y - 5));
    const cx = Math.round(C.x), hx = Math.round(C.x + C.sway + (C.held && C.q < 0.45 ? Math.sin(T * 44) * 0.6 : 0) + (C.shake ? Math.sin(T * 70) : 0)), hy = Math.round(C.y);
    if (C.held) m.drawImage(plushSpr(C.held.d), Math.round(C.held.x - 5), Math.round(C.held.y - 5));
    pix(m, cx, K_RAIL + 2, hx, hy - 3, '#c8ccd4');
    rect(m, cx - 3, K_RAIL - 2, 7, 4, '#e8342c'); rect(m, cx - 3, K_RAIL - 2, 7, 1, '#ff8a7a');
    rect(m, hx - 3, hy - 3, 7, 4, '#d0d6e0'); rect(m, hx - 3, hy - 3, 7, 1, '#f4f6fa'); rect(m, hx - 3, hy, 7, 1, '#7a8290'); rect(m, hx, hy - 2, 1, 1, '#e8342c');
    const o = Math.max(C.open, C.held ? 0.55 : 0);
    for (const sd of [-1, 1]) {
      const jx = hx + sd * (3 + o * 3), jy = hy + 4, tx = hx + sd * (1 + o * 4), ty = hy + K_GRIP;
      pix(m, hx + sd * 2, hy + 1, jx, jy, '#b4bac6'); pix(m, jx, jy, tx, ty, '#e0e4ec');
    }
    // the glass wall of the chute, in front of everything
    rect(m, K_WALL - 1, K_WALL_TOP, 2, K_FLOOR - K_WALL_TOP, '#a8c0e8'); rect(m, K_WALL - 1, K_WALL_TOP, 2, 1, '#ffd23a');
    // streaks on the front glass
    for (let i = 0; i < 14; i++) { rect(m, 18 + i, 62 - i * 4, 1, 3, 'rgba(255,255,255,.08)'); rect(m, 66 + i, 46 - i * 3, 1, 2, 'rgba(255,255,255,.06)'); }
  }
  function drawClaw(T) {
    const C = claw;
    g.drawImage(clawBezel, 0, 0);
    drawClawGame(T);
    const smooth = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;
    g.drawImage(kc, 0, 0, 320 / 3, 80, 96, 40, 320, 240);
    g.imageSmoothingEnabled = smooth;
    g.drawImage(crt, 96, 40);
    text(g, 'CLAW & ORDER', 256, 11, '#ffffff', { align: 'center', scale: 2, shadow: shade('#c858ff', -0.55) });
    text(g, 'TOKENS ' + SESSION.tokens, 118, 15, SESSION.tokens ? '#ffb000' : '#ff5a3a', { align: 'right' });
    text(g, 'WON ' + SESSION.won.length, 494, 28, '#ffb000', { align: 'right' });
    if (C.msgT > 0) text(g, C.msg, 256, 62, C.msg.startsWith('GOT') ? '#ffd23a' : '#ffffff', { align: 'center', outline: INK });
    // the controls, on the cabinet either side of the screen
    const idle = C.st === 'idle', ready = idle && SESSION.tokens > 0;
    const stick = idle ? C.mx : 0, sx = 48 + stick * 13;
    ellipse(g, 48, 212, 25, 9, INK); ellipse(g, 48, 211, 23, 8, '#3a345a'); ellipse(g, 48, 210, 16, 5, '#14121f');
    poly(g, [[45, 211], [51, 211], [sx + 2, 182], [sx - 2, 182]], '#b4bac6');
    ellipse(g, sx, 177, 11, 11, INK); ellipse(g, sx, 177, 10, 10, '#e8342c'); ellipse(g, sx - 3, 173, 3, 3, '#ff9a8a');
    text(g, 'ARROWS OR', 48, 226, '#ffffff', { align: 'center' });
    text(g, 'WASD: MOVE', 48, 236, '#ffffff', { align: 'center' });
    const bcx = BTN.x + BTN.w / 2, bcy = BTN.y + BTN.h / 2;
    ellipse(g, bcx, bcy + 3, 24, 24, INK); ellipse(g, bcx, bcy + 2, 22, 22, '#6a1810');
    ellipse(g, bcx, bcy, 20, 20, ready && T * 2 % 1 < 0.55 ? '#ff5a4a' : '#b02818'); ellipse(g, bcx - 6, bcy - 7, 6, 4, '#ff9a8a');
    text(g, 'SPACE', bcx, 212, '#ffffff', { align: 'center' });
    text(g, 'DROP', bcx, 222, '#ffd23a', { align: 'center' });
    // the prize door
    rect(g, 437, 236, 54, 44, INK); rect(g, 438, 237, 52, 42, '#14101f');
    if (C.pop > 0) g.drawImage(plushSpr(C.popD), 449, 243, 30, 30);
    const up = C.pop > 0 ? clamp((2.4 - C.pop) * 8, 0, 1) * clamp(C.pop * 4, 0, 1) : 0;
    if (up < 1) { const dh = Math.round(42 * (1 - up)); rect(g, 438, 237, 52, dh, '#3a2a58'); rect(g, 438, 237 + dh - 1, 52, 1, '#6a5a88'); if (up === 0) text(g, 'PRIZE', 464, 254, '#a898c8', { align: 'center' }); }
    text(g, 'ESC', 46, 256, '#ffd23a', { align: 'center' });
    text(g, 'LEAVE', 46, 266, '#ffffff', { align: 'center' });
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
      else drawClaw(T);
      if (wipe > 0) { const h = Math.round(wipe * SH / 2); rect(g, 0, 0, SW, h, '#05060a'); rect(g, 0, SH - h, SW, h, '#05060a'); }
    },
    leave() { cab = null; if (claw) { closeClaw(); say = null; } },
  };
}
