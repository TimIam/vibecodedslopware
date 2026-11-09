// The Bar: a quiet snooker table in the back room of the crew's local, lit by one lamp.
// Solo and endless. Reds and colours alternate; a foul or a miss ends the break. See judge().
import { rect, ellipse, poly, shade, mix, dith, canvas, outline, carSprite } from '../gfx.js';
import { text } from '../font.js';
import { PEOPLE, TEAMS } from '../data.js';
import { rename } from '../banter.js';

// The playing surface, in screen pixels; the rail runs 12 px outside it.
const X0 = 76, Y0 = 82, TW = 360, TH = 180, X1 = X0 + TW, Y1 = Y0 + TH, MX = X0 + TW / 2, CY = Y0 + TH / 2;
const R = 4, BAULK = X0 + TW * 0.2, DR = 30;
const SPOTS = {
  yellow: [BAULK, CY + DR, 2, '#f2c218'], green: [BAULK, CY - DR, 3, '#1f9a48'], brown: [BAULK, CY, 4, '#8a4a22'],
  blue: [MX, CY, 5, '#2a62e0'], pink: [(MX + X1) / 2, CY, 6, '#f08aa8'], black: [X1 - 33, CY, 7, '#22222a'],
};
const COLOURS = Object.keys(SPOTS);
// Pocket centres with their capture radius.
const POCKETS = [[X0 - 2, Y0 - 2, 8], [MX, Y0 - 4, 7], [X1 + 2, Y0 - 2, 8], [X0 - 2, Y1 + 2, 8], [MX, Y1 + 4, 7], [X1 + 2, Y1 + 2, 8]];
// Six cushions, each a face with an angled jaw at both ends. The same points draw them and bounce the balls.
const CUSHIONS = [
  [[X0 + 5, Y0 - 7], [X0 + 12, Y0], [MX - 8.5, Y0], [MX - 6.5, Y0 - 7]],
  [[MX + 6.5, Y0 - 7], [MX + 8.5, Y0], [X1 - 12, Y0], [X1 - 5, Y0 - 7]],
  [[X0 + 5, Y1 + 7], [X0 + 12, Y1], [MX - 8.5, Y1], [MX - 6.5, Y1 + 7]],
  [[MX + 6.5, Y1 + 7], [MX + 8.5, Y1], [X1 - 12, Y1], [X1 - 5, Y1 + 7]],
  [[X0 - 7, Y0 + 5], [X0, Y0 + 12], [X0, Y1 - 12], [X0 - 7, Y1 - 5]],
  [[X1 + 7, Y0 + 5], [X1, Y0 + 12], [X1, Y1 - 12], [X1 + 7, Y1 - 5]],
];
const SEGS = [];
for (const c of CUSHIONS) for (let i = 0; i + 1 < c.length; i++) SEGS.push([c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]]);

const CHATTER = [
  'Lou: Toby, the pointy end goes towards the ball.',
  "Pip: Dev's working out the angles on a beer mat.",
  'Toby: Mags brought her headset. On holiday.',
  'Dev: Statistically, that red was always going in.',
  'Lou: Two whole weeks with no wheel guns. Bliss.',
  "Pip: Loser's buying the crisps, Toby.",
  "Dev: Don't tell Mags, but I like it here.",
];

let highBreak = 0; // survives leaving the bar and coming back

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function ballSprite(col, spec = '#ffffff') {
  const [c, b] = canvas(11, 11);
  const lit = shade(col, 0.35), dark = shade(col, -0.42);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    const nx = (x + 0.5 - 5.5) / 4.6, ny = (y + 0.5 - 5.5) / 4.6, d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2), l = -0.48 * nx - 0.58 * ny + 0.66 * nz;
    rect(b, x, y, 1, 1, l > 0.86 ? spec : l > 0.62 ? lit : l > 0.12 ? col : dark);
  }
  return c;
}

// A little off-duty crew member seen from the front, 22x44, feet at the bottom.
function figure(p, shirt, { sip = false, lean = 0, pint = true } = {}) {
  const [c, b] = canvas(22, 44);
  const cx = 11, top = 2;
  const off = row => Math.round(lean * (1 - row / 13));
  // legs
  rect(b, cx - 5, top + 22, 4, 13, '#2a3448'); rect(b, cx + 1, top + 22, 4, 13, '#2a3448');
  rect(b, cx - 1, top + 22, 1, 6, '#2a3448'); rect(b, cx - 5, top + 22, 1, 13, '#3a4660');
  rect(b, cx - 6, top + 35, 5, 3, '#1a1414'); rect(b, cx + 1, top + 35, 5, 3, '#1a1414');
  // torso, sheared a row at a time if they are leaning
  for (let r = 0; r < 13; r++) { rect(b, cx - 6 + off(r), top + 9 + r, 12, 1, r > 9 ? shade(shirt, -0.28) : shirt); rect(b, cx - 6 + off(r), top + 9 + r, 1, 1, shade(shirt, 0.25)); }
  const lx = lean;
  // arms
  rect(b, cx - 8 + lx, top + 10, 2, 11, shade(shirt, -0.15)); rect(b, cx - 8 + lx, top + 21, 2, 2, p.skin);
  if (sip) { rect(b, cx + 6 + lx, top + 11, 2, 6, shade(shirt, -0.15)); rect(b, cx + 3 + lx, top + 8, 4, 3, p.skin); }
  else { rect(b, cx + 6 + lx, top + 10, 2, 11, shade(shirt, -0.15)); rect(b, cx + 6 + lx, top + 21, 2, 2, p.skin); }
  if (pint) {
    const px = sip ? cx + 3 + lx : cx + 7 + lx, py = sip ? top + 3 : top + 17;
    rect(b, px, py, 4, 6, '#d89a30'); rect(b, px, py, 4, 2, '#f4ecd8'); rect(b, px + 3, py + 2, 1, 4, '#b07820');
  }
  // head
  const hx = cx - 4 + lean, hy = top;
  rect(b, hx, hy, 8, 9, p.skin); rect(b, hx + 6, hy + 2, 2, 7, shade(p.skin, -0.18));
  rect(b, hx + 2, hy + 4, 1, 2, '#1a1010'); rect(b, hx + 5, hy + 4, 1, 2, '#1a1010');
  rect(b, hx + 3, hy + 7, 2, 1, shade(p.skin, -0.45));
  const hc = p.hair;
  if (p.hairStyle === 'crop') { rect(b, hx, hy, 8, 3, hc); }
  if (p.hairStyle === 'mop') { rect(b, hx - 1, hy - 1, 10, 4, hc); rect(b, hx - 1, hy + 3, 2, 2, hc); rect(b, hx + 7, hy + 3, 2, 2, hc); }
  if (p.hairStyle === 'bald') { rect(b, hx, hy + 3, 1, 2, hc); rect(b, hx + 7, hy + 3, 1, 2, hc); rect(b, hx + 2, hy, 3, 1, shade(p.skin, 0.3)); }
  if (p.hairStyle === 'neat') { rect(b, hx, hy, 8, 2, hc); rect(b, hx, hy + 2, 2, 1, hc); }
  if (p.hairStyle === 'bob') { rect(b, hx - 1, hy - 1, 10, 3, hc); rect(b, hx - 1, hy + 2, 2, 6, hc); rect(b, hx + 7, hy + 2, 2, 6, hc); }
  if (p.glasses === 'round') { rect(b, hx + 1, hy + 3, 3, 1, '#14141a'); rect(b, hx + 4, hy + 3, 3, 1, '#14141a'); }
  if (p.glasses === 'safety') rect(b, hx + 1, hy + 3, 6, 1, '#8ac0e0');
  if (p.moustache) rect(b, hx + 1, hy + 6, 6, 1, hc);
  outline(c, '#120a08');
  return c;
}

function bakeBack(tm) {
  const [c, b] = canvas(512, 288);
  // wallpaper and dado
  rect(b, 0, 0, 512, 62, '#30201a');
  for (let x = 0; x < 512; x += 8) { rect(b, x, 0, 1, 46, '#3a271e'); for (let y = 4; y < 46; y += 10) rect(b, x + 4, y + (x % 16 ? 5 : 0), 1, 1, '#47301f'); }
  rect(b, 0, 46, 512, 16, '#3a2316'); rect(b, 0, 46, 512, 1, '#7a4c2a');
  for (let x = 4; x < 512; x += 28) { rect(b, x, 49, 24, 11, '#311c11'); rect(b, x, 49, 24, 1, '#22130b'); rect(b, x, 59, 24, 1, '#4a2e1c'); }
  // back bar: dark panel, mirror strip and two shelves of bottles, with a gap under the lamp
  rect(b, 108, 2, 288, 37, '#1e130e');
  for (const [x0, w] of [[112, 106], [288, 104]]) {
    rect(b, x0, 4, w, 33, '#3a3a40'); rect(b, x0, 4, w, 1, '#6e6a68');
    for (let i = 0; i < w + 28; i += 7) for (let k = 0; k < 8; k++) { const px = x0 + i - k * 2, py = 6 + k * 4; if (px >= x0 && px < x0 + w) rect(b, px, py, 1, 3, '#4c4c54'); }
    rect(b, x0, 20, w, 2, '#7a4c2a'); rect(b, x0, 36, w, 2, '#7a4c2a');
  }
  const INK = ['#2f6a3a', '#7a2a1c', '#c88a2a', '#d8d8c8', '#2a4a7a', '#8a5a18', '#4a2a50'];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [x0, w] of [[114, 102], [290, 100]]) for (const sy of [20, 36]) for (let x = x0; x < x0 + w - 5;) {
    const h = 9 + (rnd() * 4 | 0), col = INK[rnd() * INK.length | 0];
    rect(b, x + 1, sy - h, 2, 4, shade(col, -0.25)); rect(b, x, sy - h + 4, 4, h - 4, col); rect(b, x, sy - h + 4, 1, h - 4, shade(col, 0.35));
    rect(b, x, sy - 5, 4, 3, '#e8dcc0');
    x += 6 + (rnd() * 3 | 0);
  }
  // counter, with taps, a till and a brass foot rail
  rect(b, 100, 38, 304, 24, '#4a2a18'); rect(b, 100, 38, 304, 4, '#a06a3a'); rect(b, 100, 38, 304, 1, '#d8a060'); rect(b, 100, 42, 304, 1, '#2a160c');
  for (let x = 106; x < 400; x += 24) { rect(b, x, 45, 19, 12, '#3a2012'); rect(b, x, 45, 19, 1, '#2a160c'); rect(b, x, 56, 19, 1, '#5e3a22'); }
  rect(b, 100, 59, 304, 2, '#c8a050'); rect(b, 100, 59, 304, 1, '#ecd080');
  for (const x of [240, 252, 264]) { rect(b, x, 29, 3, 9, '#c8c8cc'); rect(b, x - 1, 25, 5, 5, ['#d42a24', '#16b3a3', '#f2c218'][(x - 240) / 12]); }
  rect(b, 342, 28, 18, 10, '#2a2a30'); rect(b, 344, 30, 14, 4, '#7ac08a');
  for (const x of [130, 160, 318, 376]) { rect(b, x, 32, 5, 6, '#d89a30'); rect(b, x, 32, 5, 2, '#f4ecd8'); }
  // stools in front of the counter, the table hides their feet
  for (const x of [146, 214, 298, 366]) { rect(b, x - 1, 62, 3, 8, '#7a7a84'); ellipse(b, x, 60, 10, 3.5, '#120a08'); ellipse(b, x, 59.5, 9, 2.5, '#8a2a20'); rect(b, x - 6, 59, 8, 1, '#c84a38'); }
  // chalkboard (the score is chalked on it live)
  rect(b, 6, 4, 92, 46, '#6a4226'); rect(b, 6, 4, 92, 1, '#a06a3a'); rect(b, 8, 6, 88, 42, '#1a2420');
  for (let y = 6; y < 48; y++) for (let x = 8; x < 96; x++) if (dith(x, y, 0.08)) rect(b, x, y, 1, 1, '#2a3630');
  // dartboard
  ellipse(b, 422, 40, 16, 16, '#100c0a');
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, d = Math.PI / 20; poly(b, [[422, 40], [422 + Math.cos(a - d) * 13, 40 + Math.sin(a - d) * 13], [422 + Math.cos(a + d) * 13, 40 + Math.sin(a + d) * 13]], i % 2 ? '#e8dcc0' : '#18140f'); }
  ellipse(b, 422, 40, 8.5, 8.5, '#b02818'); ellipse(b, 422, 40, 7, 7, '#e8dcc0'); ellipse(b, 422, 40, 3, 3, '#1f9a48'); ellipse(b, 422, 40, 1.5, 1.5, '#d42a24');
  for (let i = 0; i < 20; i += 2) { const a = i / 20 * Math.PI * 2; rect(b, 422 + Math.cos(a) * 11 | 0, 40 + Math.sin(a) * 11 | 0, 1, 1, '#d42a24'); }
  rect(b, 416, 22, 12, 2, '#6a4226');
  // framed team car
  rect(b, 449, 24, 58, 32, '#a06a3a'); rect(b, 449, 24, 58, 1, '#d8a060'); rect(b, 451, 26, 54, 28, '#16202c');
  rect(b, 451, 44, 54, 10, '#3a3e48');
  b.drawImage(carSprite(tm), 454, 30, 48, 20);
  // the shaded lamp over the table, with its glow on the wall
  rect(b, 255, 0, 2, 6, '#14100c');
  for (let y = 16; y < 62; y++) { const hw = 30 + (y - 16) * 0.8, t = 0.2 - (y - 16) / 260; for (let x = Math.round(256 - hw); x < 256 + hw; x++) if (dith(x, y, t) && (y >= 37 || x < 222 || x > 290 || y < 37)) rect(b, x, y, 1, 1, '#ffd890'); }
  poly(b, [[234, 6], [278, 6], [292, 17], [220, 17]], '#1a5a3a'); poly(b, [[234, 6], [278, 6], [284, 11], [228, 11]], '#2a7a50');
  rect(b, 220, 17, 72, 2, '#c8a050'); rect(b, 238, 19, 36, 1, '#ffe8a8');
  // floor: planks that catch the lamp near the table and fall away to the corners
  const FLOOR = ['#150d09', '#1f140e', '#2c1c13', '#3a2518', '#4a2f1d', '#5c3b24'];
  for (let y = 62; y < 288; y++) for (let x = 0; x < 512; x++) {
    const dx = Math.max(64 - x, 0, x - 448), dy = Math.max(70 - y, 0, y - 274);
    const fall = clamp(1 - Math.hypot(dx, dy) / 90, 0, 1), plank = (y % 13 === 0 ? -0.9 : 0) + ((x + (y / 13 | 0) * 37) % 64 === 0 ? -0.6 : 0);
    const v = clamp(fall * 4.4 + plank + 0.1, 0, 5), i = v | 0, f = v - i;
    rect(b, x, y, 1, 1, FLOOR[Math.min(5, i + (dith(x, y, f) ? 1 : 0))]);
  }
  // wall darkens away from the lamp
  for (let y = 0; y < 62; y++) for (let x = 0; x < 512; x++) { const f = Math.abs(x - 256) / 256; if (dith(x, y, f * f * 0.55)) rect(b, x, y, 1, 1, '#0a0606'); }
  // jukebox against the right-hand wall
  rect(b, 462, 62, 40, 58, '#120a08'); rect(b, 464, 64, 36, 54, '#5a2a18'); poly(b, [[464, 76], [470, 64], [494, 64], [500, 76]], '#c8a050');
  rect(b, 468, 78, 28, 14, '#2a1a30'); rect(b, 468, 96, 28, 2, '#c8a050'); rect(b, 470, 100, 24, 14, '#1a0f0a');
  for (let i = 0; i < 6; i++) rect(b, 472 + i * 4, 102, 2, 10, '#3a2412');
  // side table of pints in the left-hand corner
  ellipse(b, 32, 240, 18, 7, '#120a08'); ellipse(b, 32, 239, 17, 6, '#6a4226'); ellipse(b, 32, 238, 16, 5, '#8a5a30'); rect(b, 30, 244, 4, 20, '#3a2012');
  for (const [x, y] of [[26, 231], [36, 233]]) { rect(b, x, y, 5, 7, '#d89a30'); rect(b, x, y, 5, 2, '#f4ecd8'); }
  // the table
  const tx = X0 - 12, ty = Y0 - 12, tw = TW + 24, th = TH + 24;
  rect(b, tx - 1, ty + 4, tw + 2, th, 'rgba(0,0,0,0.5)');
  rect(b, tx - 1, ty - 1, tw + 2, th + 2, '#1a0c06'); rect(b, tx, ty, tw, th, '#6a3218');
  rect(b, tx, ty, tw, 2, '#b06a38'); rect(b, tx, ty, 2, th, '#9a5a2e'); rect(b, tx, ty + th - 2, tw, 2, '#3a1a0c'); rect(b, tx + tw - 2, ty, 2, th, '#3a1a0c');
  for (let y = ty + 3; y < ty + th - 3; y += 5) for (let x = tx + 3; x < tx + tw - 3; x += 9) if ((x * 3 + y * 7) % 11 < 4) rect(b, x, y, 5, 1, '#7a3e20');
  // cloth, brightest under the lamp
  const CLOTH = ['#114a2b', '#155c33', '#1a6e3d', '#1f8047', '#259151', '#2ea25a'];
  for (let y = Y0 - 7; y < Y1 + 7; y++) for (let x = X0 - 7; x < X1 + 7; x++) {
    const nx = (x - MX) / (TW * 0.58), ny = (y - CY) / (TH * 0.78);
    const v = clamp((1 - (nx * nx + ny * ny)) * 5.2, 0, 5), i = v | 0;
    rect(b, x, y, 1, 1, CLOTH[Math.min(5, i + (dith(x, y, v - i) ? 1 : 0))]);
  }
  // baulk line, D and spots
  rect(b, BAULK, Y0, 1, TH, '#8fd0a4');
  for (let a = Math.PI / 2; a < Math.PI * 1.5; a += 0.03) rect(b, BAULK + Math.cos(a) * DR, CY + Math.sin(a) * DR, 1, 1, '#8fd0a4');
  for (const k of COLOURS) rect(b, SPOTS[k][0], SPOTS[k][1], 1, 1, '#a8e0b8');
  // pockets go down before the cushions so the jaws sit over them
  for (const [x, y, r] of POCKETS) { ellipse(b, x, y, r + 3, r + 3, '#c8a050'); ellipse(b, x, y, r + 2, r + 2, '#2a1a10'); ellipse(b, x, y, r + 0.5, r + 0.5, '#050305'); }
  for (const pts of CUSHIONS) {
    poly(b, pts, '#1a7a44');
    const hor = pts[0][1] === pts[1][1] - 7 || pts[0][1] === pts[1][1] + 7;
    if (hor) rect(b, pts[1][0], pts[1][1] + (pts[1][1] < CY ? -1 : 0), pts[2][0] - pts[1][0], 1, '#35b56a');
    else rect(b, pts[1][0] + (pts[1][0] < MX ? -1 : 0), pts[1][1], 1, pts[2][1] - pts[1][1], '#35b56a');
  }
  return c;
}

export default function make(ctx) {
  const { g, A, W, H } = ctx;
  const CHALK = '#e8e4d0';
  let back, sprites, figs;
  let balls = [], white, state = 'aim', on = 'red', target = null, bk = 0, aim = 0, power = 0;
  let charging = null, shot = null, shots = 0, sinks = [], floats = [];
  let msg = null, chatT = 12, tickT = 0, thudT = 0, t = 0, lastX = -1, lastY = -1, cast = null;

  const nameOf = b => b.k.toUpperCase();
  const redsLeft = () => balls.filter(b => b.k === 'red' && b.on).length;
  const free = (x, y, self) => balls.every(b => !b.on || b === self || Math.hypot(b.x - x, b.y - y) >= 2 * R + 0.5);
  const say = (s, col = '#ffb838', life = 3.4) => { msg = { s, col, t: life }; };

  function rack() {
    balls = balls.filter(b => b === white);
    const add = (k, v, x, y, spr) => { const b = { k, v, x, y, vx: 0, vy: 0, on: true, spr }; balls.push(b); return b; };
    for (const k of COLOURS) add(k, SPOTS[k][2], SPOTS[k][0], SPOTS[k][1], sprites[k]);
    const gap = 2 * R + 0.3, ax = SPOTS.pink[0] + gap + 0.8;
    for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) add('red', 1, ax + i * gap * 0.866, CY + (j - i / 2) * gap, sprites.red);
  }
  function placeWhite() {
    white.on = true; white.vx = white.vy = 0;
    for (let i = 0; i < 40; i++) {
      const x = BAULK - 14 - (i % 5) * 3, y = CY + [9, -9, 0, 18, -18][(i / 5 | 0) % 5];
      if (free(x, y, white)) { white.x = x; white.y = y; return; }
    }
  }
  function respot(b) {
    b.on = true; b.vx = b.vy = 0;
    const opts = [SPOTS[b.k], ...COLOURS.slice().reverse().map(k => SPOTS[k])];
    for (const s of opts) if (free(s[0], s[1], b)) { b.x = s[0]; b.y = s[1]; return; }
    const s = SPOTS[b.k];
    for (let i = 1; i < 300; i++) for (const y of [s[1], s[1] + i % 40, s[1] - i % 40]) {
      const x = clamp(s[0] - i, X0 + R + 1, X1 - R - 1), yy = clamp(y, Y0 + R + 1, Y1 - R - 1);
      if (free(x, yy, b)) { b.x = x; b.y = yy; return; }
    }
  }
  function setOn(next) {
    on = next;
    target = on === 'seq' ? balls.filter(b => b.v > 1 && b.on).sort((a, b) => a.v - b.v)[0] || null : null;
  }

  function shoot() {
    const sp = 40 + Math.pow(power, 1.25) * 600;
    white.vx = Math.cos(aim) * sp; white.vy = Math.sin(aim) * sp;
    shot = { first: null, pots: [], time: 0 };
    state = 'roll'; shots++; power = 0; cast = null;
    A.sfx('thud');
  }

  // ---- physics, in small enough steps that nothing moves more than a pixel at a time
  function step(h) {
    for (const b of balls) {
      if (!b.on) continue;
      b.x += b.vx * h; b.y += b.vy * h;
      const v = Math.hypot(b.vx, b.vy);
      if (v < 2.5) { b.vx = b.vy = 0; continue; }
      const k = Math.max(0, v - (95 + 0.22 * v) * h) / v;
      b.vx *= k; b.vy *= k;
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        const d = Math.sqrt(d2) || 0.001, nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel >= 0) continue;
        const imp = -(1 + 0.94) * rel / 2;
        a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
        if (shot && !shot.first) { if (a === white) shot.first = b; else if (b === white) shot.first = a; }
        if (-rel > 18 && tickT <= 0) { A.sfx('tick', clamp(-rel / 500, 0, 1)); tickT = 0.035; }
      }
    }
    for (const b of balls) {
      if (!b.on) continue;
      for (const s of SEGS) rail(b, s);
      let near = false;
      for (const [px, py, r] of POCKETS) {
        const d = Math.hypot(b.x - px, b.y - py);
        if (d < 18) near = true;
        if (d < r) { pot(b, px, py); break; }
      }
      if (!b.on) continue;
      if (!near) { // a nudge from a crowded cluster must never push a ball through a cushion
        if (b.x < X0 + R) { b.x = X0 + R; b.vx = Math.abs(b.vx); } else if (b.x > X1 - R) { b.x = X1 - R; b.vx = -Math.abs(b.vx); }
        if (b.y < Y0 + R) { b.y = Y0 + R; b.vy = Math.abs(b.vy); } else if (b.y > Y1 - R) { b.y = Y1 - R; b.vy = -Math.abs(b.vy); }
      } else if (b.x < X0 - 14 || b.x > X1 + 14 || b.y < Y0 - 14 || b.y > Y1 + 14) {
        const [px, py] = POCKETS.reduce((m, p) => Math.hypot(b.x - p[0], b.y - p[1]) < Math.hypot(b.x - m[0], b.y - m[1]) ? p : m);
        pot(b, px, py);
      }
    }
  }
  function rail(b, s) {
    const ex = s[2] - s[0], ey = s[3] - s[1];
    const k = clamp(((b.x - s[0]) * ex + (b.y - s[1]) * ey) / (ex * ex + ey * ey), 0, 1);
    const cx = s[0] + ex * k, cy = s[1] + ey * k, dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
    b.x = cx + nx * R; b.y = cy + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    b.vx -= 1.74 * vn * nx; b.vy -= 1.74 * vn * ny; b.vx *= 0.985; b.vy *= 0.985;
    if (-vn > 30 && thudT <= 0) { A.sfx('clunk'); thudT = 0.07; }
  }
  function pot(b, px, py) {
    b.on = false; b.vx = b.vy = 0;
    sinks.push({ x: b.x, y: b.y, px, py, t: 0, spr: b.spr, col: b === white ? '#f4f0e0' : b.k === 'red' ? '#c8242c' : SPOTS[b.k][3] });
    if (shot) shot.pots.push(b);
    A.sfx('blip', 180);
  }
  function score(n, x, y) {
    bk += n;
    if (bk > highBreak) highBreak = bk;
    floats.push({ s: '+' + n, x, y, t: 0 });
  }

  // The shot is over: rule on it, respot what comes back, and set up the next ball on.
  function judge() {
    const { first, pots } = shot;
    const whiteIn = pots.includes(white), reds = pots.filter(b => b.k === 'red'), cols = pots.filter(b => b.v > 1);
    let foul = '';
    if (whiteIn) foul = 'WHITE IN THE POCKET';
    else if (!first) foul = 'MISSED EVERYTHING';
    else if (on === 'red' && first.k !== 'red') foul = 'HIT THE ' + nameOf(first) + ' FIRST';
    else if (on === 'colour' && first.k === 'red') foul = 'HIT A RED FIRST';
    else if (on === 'seq' && first !== target) foul = 'HIT THE ' + nameOf(first) + ' FIRST';
    else if (on === 'red' && cols.length) foul = 'POTTED THE ' + nameOf(cols[0]);
    else if (on === 'colour' && (reds.length || cols.length > 1)) foul = 'POTTED TOO MANY';
    else if (on === 'seq' && (pots.length > 1 || (pots.length === 1 && pots[0] !== target))) foul = 'WRONG COLOUR DOWN';
    const at = pots.length ? sinks[sinks.length - 1] || { px: MX, py: CY } : { px: MX, py: CY };
    if (foul) {
      for (const b of cols) respot(b);
      placeWhite();
      if (bk >= 10) say('FOUL: ' + foul + '. BREAK ENDS ON ' + bk, '#ff6a48');
      else say('FOUL: ' + foul, '#ff6a48');
      bk = 0;
      A.sfx('miss');
      setOn(redsLeft() ? 'red' : 'seq');
      return;
    }
    if (on === 'red' && reds.length) {
      score(reds.length, at.px, at.py); A.sfx('good'); setOn('colour');
    } else if (on === 'colour' && cols.length === 1) {
      score(cols[0].v, at.px, at.py); respot(cols[0]);
      A.sfx('good');
      setOn(redsLeft() ? 'red' : 'seq');
    } else if (on === 'seq' && pots.length === 1) {
      score(target.v, at.px, at.py); A.sfx('perfect');
      setOn('seq');
      if (!target) {
        rack(); placeWhite(); setOn('red');
        say('TABLE CLEARED. THE RACK GOES BACK ON.', '#8ae0a8', 4);
        A.sfx('ding');
      }
    } else {
      if (bk >= 5) say('BREAK ENDS ON ' + bk, '#ffb838');
      bk = 0;
      setOn(redsLeft() ? 'red' : 'seq');
    }
    if (bk === highBreak && bk >= 20 && pots.length) say('NEW HIGH BREAK: ' + bk, '#8ae0a8');
  }

  // ---- aiming
  function castAim() {
    const dx = Math.cos(aim), dy = Math.sin(aim);
    let best = 1e9, hit = null;
    for (const b of balls) {
      if (!b.on || b === white) continue;
      const fx = b.x - white.x, fy = b.y - white.y, tc = fx * dx + fy * dy;
      if (tc <= 0) continue;
      const perp2 = fx * fx + fy * fy - tc * tc, r2 = 4 * R * R;
      if (perp2 > r2) continue;
      const t1 = Math.max(0, tc - Math.sqrt(r2 - perp2));
      if (t1 < best) { best = t1; hit = b; }
    }
    // rails are marched rather than solved: 18 short segments, once a frame
    for (let d = 1; d < Math.min(best, 640); d += 1) {
      const x = white.x + dx * d, y = white.y + dy * d;
      for (const [px, py, r] of POCKETS) if (Math.hypot(x - px, y - py) < r) return { d, hit: null, x, y };
      for (const s of SEGS) {
        const ex = s[2] - s[0], ey = s[3] - s[1], k = clamp(((x - s[0]) * ex + (y - s[1]) * ey) / (ex * ex + ey * ey), 0, 1);
        if (Math.hypot(x - s[0] - ex * k, y - s[1] - ey * k) < R - 0.2) return { d, hit: null, x, y };
      }
    }
    return { d: best, hit, x: white.x + dx * best, y: white.y + dy * best };
  }
  function updateAim(dt, io) {
    const m = io.mouse;
    const moved = m.x !== lastX || m.y !== lastY;
    lastX = m.x; lastY = m.y;
    if (!charging && moved && Math.hypot(m.x - white.x, m.y - white.y) > 2) aim = Math.atan2(m.y - white.y, m.x - white.x);
    const turn = (io.held('ArrowRight') || io.held('ArrowDown') ? 1 : 0) - (io.held('ArrowLeft') || io.held('ArrowUp') ? 1 : 0);
    aim += turn * dt * 0.42;
    if (!charging && (m.clicked || io.pressed('Space'))) { charging = m.clicked ? 'mouse' : 'space'; power = 0; A.sfx('move'); }
    if (charging) {
      power = Math.min(1, power + dt / 1.15);
      const up = charging === 'mouse' ? (m.released || !m.down) : !io.held('Space');
      if (up) { charging = null; if (power > 0.02) shoot(); else power = 0; }
    }
    cast = castAim();
  }

  // Hard-edged line, one pixel at a time.
  const line = (x0, y0, x1, y1, col, w = 1) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) rect(g, x0 + (x1 - x0) * i / n - (w > 1 ? 0.5 : 0), y0 + (y1 - y0) * i / n, w, w, col);
  };
  function drawAim(T) {
    if (!cast) return;
    const c = Math.cos(aim), s = Math.sin(aim), start = 6, ph = (T * 24) % 6;
    for (let d = start + ph; d < cast.d; d += 6) rect(g, white.x + c * d, white.y + s * d, 2, 1, '#f4f0d0');
    for (let a = 0; a < 6.28; a += 0.4) rect(g, cast.x + Math.cos(a) * R, cast.y + Math.sin(a) * R, 1, 1, '#f4f0d0');
    if (cast.hit) {
      const nx = (cast.hit.x - cast.x) / (2 * R), ny = (cast.hit.y - cast.y) / (2 * R);
      for (let d = 2; d < 34; d += 3) rect(g, cast.hit.x + nx * (R + d), cast.hit.y + ny * (R + d), 2, 1, cast.hit.k === 'red' ? '#ff8a80' : mix(SPOTS[cast.hit.k][3], '#ffffff', 0.45));
      const tx = c - (c * nx + s * ny) * nx, ty = s - (c * nx + s * ny) * ny, tl = Math.hypot(tx, ty);
      if (tl > 0.08) for (let d = 3; d < 18; d += 4) rect(g, cast.x + tx / tl * d, cast.y + ty / tl * d, 1, 1, '#c8c8b8');
    }
  }
  function drawCue() {
    const c = Math.cos(aim), s = Math.sin(aim), gap = 7 + power * 26;
    const ax = white.x - c * gap, ay = white.y - s * gap, len = 150;
    const at = d => [ax - c * d, ay - s * d];
    line(...at(0), ...at(len), '#1a0c06', 2);
    line(...at(1), ...at(len * 0.55), '#e0c088');
    line(...at(len * 0.55), ...at(len), '#6a3218');
    line(...at(0), ...at(2), '#3a78d8');
    line(...at(2), ...at(4), '#f4f0e0');
  }

  return {
    enter() {
      const tm = TEAMS[0];
      back = bakeBack(tm);
      sprites = { red: ballSprite('#c8242c'), white: ballSprite('#f4f0e0'), black: ballSprite('#22222a', '#d8d8e8') };
      for (const k of COLOURS) if (!sprites[k]) sprites[k] = ballSprite(SPOTS[k][3]);
      const mk = (who, shirt, x, y, opts) => ({ who, x, y, frames: [figure(PEOPLE[who], shirt, opts), figure(PEOPLE[who], shirt, { ...opts, sip: true })], sipAt: 3 + Math.random() * 8, sip: 0 });
      figs = [
        mk('pip', '#b8345a', 176, 28, { lean: 2 }),
        mk('lou', '#3a4a6a', 334, 28, { lean: -2 }),
        mk('toby', '#d8a030', 18, 118, { pint: false }),
        mk('dev', '#4a7a5a', 488, 158, { lean: -1 }),
      ];
      white = { k: 'white', v: 0, x: 0, y: 0, vx: 0, vy: 0, on: true, spr: sprites.white };
      balls = [white];
      rack(); placeWhite(); setOn('red');
      aim = Math.atan2(CY - white.y, X1 - white.x);
    },
    update(dt, io) {
      t += dt;
      tickT -= dt; thudT -= dt;
      if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
      for (const f of floats) f.t += dt;
      floats = floats.filter(f => f.t < 1.1);
      for (const f of figs) {
        f.sipAt -= dt;
        if (f.sipAt <= 0) { f.sip = 1.1; f.sipAt = 7 + Math.random() * 14; }
        f.sip -= dt;
      }
      if (shots >= 3 && !msg) {
        chatT -= dt;
        if (chatT <= 0) { say(rename(CHATTER[Math.floor(Math.random() * CHATTER.length)]), '#c8b890', 4.5); chatT = 13 + Math.random() * 14; }
      }
      for (const s of sinks) s.t += dt;
      sinks = sinks.filter(s => s.t < 0.24 || state === 'roll');
      if (state === 'aim') { updateAim(dt, io); return; }
      shot.time += dt;
      const d = Math.min(dt, 1 / 20);
      let vmax = 0;
      for (const b of balls) if (b.on) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
      const n = clamp(Math.ceil(vmax * d), 1, 80);
      for (let i = 0; i < n; i++) step(d / n);
      if (shot.time > 16) for (const b of balls) b.vx = b.vy = 0;
      if (balls.every(b => !b.on || (b.vx === 0 && b.vy === 0))) {
        judge();
        sinks = sinks.filter(s => s.t < 0.24);
        state = 'aim';
        shot = null;
      }
    },
    draw() {
      const T = t; // our own clock: the host's draw() is called with no time argument
      g.drawImage(back, 0, 0);
      // jukebox lights chase while it plays
      for (let i = 0; i < 6; i++) { const on2 = (T * 2.4 + i) % 3 < 1.5; rect(g, 470 + i * 4, 80, 2, 10, on2 ? ['#ff5a48', '#ffd23a', '#48d8a8'][i % 3] : '#3a2a40'); }
      // the crew
      for (const f of figs) {
        const fy = Math.round(f.y + Math.sin(T * 1.3 + f.x) * 0.6);
        if (f.y > 80) ellipse(g, f.x, f.y + 40, 11, 3, 'rgba(0,0,0,0.4)');
        if (f.who === 'toby') { rect(g, f.x + 12, f.y - 12, 2, 54, '#1a0c06'); rect(g, f.x + 12, f.y - 11, 1, 30, '#e0c088'); rect(g, f.x + 12, f.y + 18, 1, 23, '#6a3218'); rect(g, f.x + 12, f.y - 13, 2, 2, '#3a78d8'); }
        g.drawImage(f.frames[f.sip > 0 ? 1 : 0], f.x - 11, fy);
      }
      // balls: shadows first so none falls across a neighbour
      for (const b of balls) if (b.on) ellipse(g, b.x + 1, b.y + 2, 4, 3, 'rgba(0,0,0,0.38)');
      if (state === 'aim') drawAim(T);
      for (const s of sinks) {
        const k = clamp(s.t / 0.22, 0, 1), r = 4 * (1 - k * 0.8);
        ellipse(g, s.x + (s.px - s.x) * k, s.y + (s.py - s.y) * k, r, r, s.col);
      }
      for (const b of balls) if (b.on) g.drawImage(b.spr, Math.round(b.x - 5.5), Math.round(b.y - 5.5));
      if (state === 'aim') drawCue();
      for (const f of floats) text(g, f.s, f.x, f.y - 8 - f.t * 16, '#ffe88a', { align: 'center', outline: '#14100c' });
      // the chalkboard
      text(g, 'BREAK', 13, 11, CHALK);
      text(g, bk, 91, 9, CHALK, { align: 'right', scale: 2 });
      text(g, 'HIGH', 13, 26, shade(CHALK, -0.2));
      text(g, highBreak, 91, 26, shade(CHALK, -0.2), { align: 'right' });
      const label = on === 'red' ? 'RED' : on === 'colour' ? 'ANY COLOUR' : target ? nameOf(target) : '';
      text(g, 'ON', 13, 39, '#ffd890');
      const icon = on === 'red' ? sprites.red : on === 'seq' && target ? target.spr : sprites.yellow;
      g.drawImage(icon, 26, 37);
      text(g, label, 40, 39, '#ffd890');
      // power, under the board
      rect(g, 8, 54, 88, 7, '#0a0604'); rect(g, 9, 55, 86, 5, '#2a1a12');
      if (charging || power > 0) {
        const w = Math.round(84 * power);
        rect(g, 10, 56, w, 3, power > 0.85 ? '#ff5a48' : power > 0.55 ? '#ffc23a' : '#58d878');
        rect(g, 10, 56, w, 1, '#ffffff');
      } else text(g, 'POWER', 36, 54, '#5a4436');
      // bottom line: the hint for the first few shots, then whatever is going on
      if (msg) text(g, msg.s, 256, 278, msg.col, { align: 'center', outline: '#0a0604' });
      else if (shots < 3) text(g, 'AIM WITH THE MOUSE.  HOLD CLICK OR SPACE, RELEASE TO SHOOT.  ARROWS FINE-TUNE.', 256, 278, '#c8b890', { align: 'center', outline: '#0a0604' });
    },
  };
}
