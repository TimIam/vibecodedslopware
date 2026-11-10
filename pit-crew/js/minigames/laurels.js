// Rest On Your Laurels: the end of the season, the Team Principal's darkened home office, the
// trophies in their case, a glass of scotch and the cat with her kittens. No score. Pet the cat,
// pick up a kitten, press L for the laser pointer.
// The cat's face is 16x16, half the size of the 32x32 crew portraits; a kitten's is 9x8.
import { rect, ellipse, poly, shade, mix, dith, canvas, carSprite } from '../gfx.js';
import { text, measure, wrap } from '../font.js';
import { TEAMS } from '../data.js';
import { rename } from '../banter.js';

const FY0 = 186, FY1 = 268, FX0 = 22, FX1 = 362; // where the cats can go
const INK = '#120c0a';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- faces
const CAT_FACE = [
  '..k..........k..',
  '.kok........kok.',
  '.kpok......kopk.',
  '.kpookkkkkkoopk.',
  '.kooOoOooOoOook.',
  '.koooOoooOOoook.',
  'kooooooooooooook',
  'koeeEooooooEeeok',
  'koeEEooooooEEeok',
  'kOooooollooooOok',
  'kOoollllppllllOk',
  '.koolllkkllllok.',
  '.koollkllkllook.',
  '..kooolllloook..',
  '...kkoooooookk..',
  '.....kkkkkk.....',
];
const KIT_FACE = [
  'k.......k',
  'kpk...kpk',
  'kookkkook',
  'koooooook',
  'koEoooEok',
  'koolpOook',
  '.kolllok.',
  '..kkkkk..',
];
function bakeHeads(art, pal) {
  const make = rows => {
    const [c, b] = canvas(rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') rect(b, x, y, 1, 1, ch === 'k' ? INK : pal[ch]); }));
    return c;
  };
  const closed = art === CAT_FACE
    ? art.map((r, y) => y === 7 ? r.replace(/[eE]/g, 'o') : y === 8 ? r.replace(/[eE]/g, 'k') : r)
    : art.map(r => r.replace(/E/g, 'O'));
  const wide = art === CAT_FACE
    ? art.map(r => r.replace(/e/g, 'E'))
    : art.map((r, y) => y === 3 ? 'koEoooEok' : r);
  return { open: make(art), closed: make(closed), wide: make(wide) };
}

const MUM = { bw: 34, bh: 14, leg: 8, hs: 16, tail: 6, sz: 3, walk: 44, run: 150, reach: 56, jump: 190 };
const KID = { bw: 14, bh: 6, leg: 3, hs: 9, tail: 3, sz: 2, walk: 34, run: 128, reach: 24, jump: 130 };
const PALS = {
  mum: { o: '#b09a7c', O: '#6e5a44', l: '#ecdfc8', p: '#d88a8a', e: '#b8e070', E: '#101014' },
  ginger: { o: '#e09040', O: '#a85a20', l: '#f8e0b8', p: '#e89a9a', e: '#b8e070', E: '#101014' },
  snow: { o: '#e4e4e8', O: '#b0b0b8', l: '#ffffff', p: '#f0a8b0', e: '#90c8f0', E: '#101014' },
  smoke: { o: '#808590', O: '#55585f', l: '#c8ccd4', p: '#d88a8a', e: '#d8d870', E: '#101014' },
  patch: { o: '#3a3430', O: '#d88030', l: '#f4efe4', p: '#e89a9a', e: '#b8e070', E: '#f4efe4' },
};

// ---------------------------------------------------------------- the room
// Where each trophy stands: one per podium finish (both cars can earn one in the same race),
// along the middle shelf, then the bottom one, bunching up as the season fills them.
// The constructors' cup gets the top shelf to itself.
function trophySlots(data) {
  const list = (data && data.list) || [], out = [];
  const rows = list.length <= 6 ? [list] : [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))];
  rows.forEach((row, r) => {
    const n = row.length, sp = Math.min(31, 180 / Math.max(1, n - 1 || 1)), y = r ? 120 : 88;
    row.forEach((tr, i) => out.push({ ...tr, x: Math.round(256 + (i - (n - 1) / 2) * sp), y, big: 1 }));
  });
  if (data && data.champ) out.push({ champ: true, x: 256, y: 54, big: 1.4, tier: 1 });
  return out;
}
function cup(b, cx, base, tier, big = 1) {
  const col = big > 1 || tier === 1 ? '#ffd23a' : tier === 2 ? '#d8dce4' : '#c8804a';
  const dk = shade(col, -0.32), hi = shade(col, 0.55), s = big;
  rect(b, cx - 6 * s, base - 3 * s, 12 * s, 3 * s, '#3a2412'); rect(b, cx - 6 * s, base - 3 * s, 12 * s, 1, '#6a4426');
  rect(b, cx - 1 * s, base - 9 * s, 3 * s, 6 * s, dk); rect(b, cx - 3 * s, base - 5 * s, 7 * s, 2 * s, col);
  // handles first, so the bowl sits over their inner edge
  for (const sd of [-1, 1]) {
    const x = sd < 0 ? cx - 10 * s : cx + 7 * s;
    rect(b, x, base - 20 * s, 4 * s, 2 * s, dk); rect(b, x, base - 14 * s, 4 * s, 2 * s, dk); rect(b, sd < 0 ? x : x + 2 * s, base - 20 * s, 2 * s, 8 * s, col);
  }
  ellipse(b, cx + 0.5, base - 15 * s, 7 * s, 7 * s, col);
  rect(b, cx - 7 * s, base - 22 * s, 15 * s, 7 * s, col); rect(b, cx - 7 * s, base - 22 * s, 15 * s, 1 * s, hi);
  rect(b, cx - 4 * s, base - 20 * s, 2 * s, 8 * s, hi);
  rect(b, cx + 4 * s, base - 21 * s, 3 * s, 8 * s, dk);
}
function bakeRoom(data) {
  const [c, b] = canvas(512, 288);
  // oak panelling
  rect(b, 0, 0, 512, 172, '#1d1410');
  for (let x = 0; x < 512; x += 62) {
    rect(b, x, 0, 3, 164, '#120c09');
    for (const [y, h] of [[8, 78], [94, 62]]) { rect(b, x + 9, y, 46, h, '#251a13'); rect(b, x + 9, y, 46, 1, '#120c09'); rect(b, x + 9, y + h - 1, 46, 1, '#33241a'); rect(b, x + 9, y, 1, h, '#120c09'); rect(b, x + 54, y, 1, h, '#33241a'); }
  }
  rect(b, 0, 164, 512, 8, '#2e1e14'); rect(b, 0, 164, 512, 1, '#47301f');
  // a window on the moor, moon and all
  rect(b, 34, 18, 96, 104, '#0c0806');
  for (let y = 22; y < 118; y++) rect(b, 38, y, 88, 1, mix('#12204a', '#35507e', (y - 22) / 96));
  ellipse(b, 104, 44, 11, 11, '#d8e0f0'); ellipse(b, 108, 41, 8, 8, '#a8b8d8');
  for (let i = 0; i < 18; i++) rect(b, 40 + (i * 37) % 84, 24 + (i * 19) % 46, 1, 1, '#c8d4f0');
  for (let x = 38; x < 126; x++) { const y = Math.round(92 + 8 * Math.sin(x * 0.07 + 1) + 4 * Math.sin(x * 0.19)); rect(b, x, y, 1, 118 - y, '#0c1424'); }
  rect(b, 81, 22, 2, 96, '#0c0806'); rect(b, 38, 68, 88, 2, '#0c0806');
  for (const [x, w] of [[22, 22], [120, 22]]) { rect(b, x, 10, w, 122, '#3a1414'); for (let i = 0; i < w; i += 5) rect(b, x + i, 10, 2, 122, '#2a0e0e'); }
  rect(b, 18, 8, 128, 4, '#6a4426');
  // the team's car, framed
  rect(b, 396, 34, 72, 46, '#6a4426'); rect(b, 396, 34, 72, 1, '#a07040'); rect(b, 399, 37, 66, 40, '#1a1c24'); rect(b, 399, 66, 66, 11, '#2e3038');
  b.drawImage(carSprite(TEAMS[0]), 405, 43, 54, 22);
  // the trophy case: lit from inside, and the only bright thing in the room
  rect(b, 148, 8, 216, 160, '#0e0806'); rect(b, 150, 10, 212, 156, '#3a2414'); rect(b, 150, 10, 212, 2, '#6a4426');
  for (let y = 20; y < 124; y++) for (let x = 160; x < 352; x++) { const f = 1 - Math.hypot((x - 256) / 130, (y - 20) / 130); rect(b, x, y, 1, 1, f > 0.68 ? '#5a4a30' : f > 0.46 ? (dith(x, y, (f - 0.46) * 4.5) ? '#5a4a30' : '#46382a') : f > 0.15 ? (dith(x, y, (f - 0.15) * 3.2) ? '#46382a' : '#30261e') : '#30261e'); }
  rect(b, 158, 18, 196, 2, '#0e0806'); rect(b, 158, 124, 196, 2, '#0e0806'); rect(b, 158, 18, 2, 108, '#0e0806'); rect(b, 352, 18, 2, 108, '#0e0806');
  for (let x = 184; x < 340; x += 44) { rect(b, x, 20, 10, 2, '#fff2c0'); rect(b, x + 2, 22, 6, 1, '#d8c080'); }
  for (const y of [54, 88, 120]) { rect(b, 160, y, 192, 2, '#9ab0b8'); rect(b, 160, y, 192, 1, '#d8e4e8'); rect(b, 160, y + 2, 192, 1, 'rgba(0,0,0,.35)'); }
  // the big one on the top shelf, or the place it would have gone
  if (!(data && data.champ)) { rect(b, 238, 48, 36, 6, '#4a1a24'); rect(b, 238, 48, 36, 1, '#6a2a34'); }
  for (const s of trophySlots(data)) cup(b, s.x, s.y, s.tier, s.big);
  // glass
  poly(b, [[176, 20], [204, 20], [168, 122], [160, 122], [160, 66]], 'rgba(255,255,255,.05)');
  poly(b, [[318, 20], [330, 20], [292, 122], [280, 122]], 'rgba(255,255,255,.04)');
  rect(b, 256, 18, 1, 106, '#1a120e');
  // the plaque
  rect(b, 224, 128, 64, 20, '#0e0806'); rect(b, 225, 129, 62, 18, '#b89838'); rect(b, 225, 129, 62, 1, '#f0d878'); rect(b, 225, 146, 62, 1, '#7a5e18');
  for (const [x, y] of [[227, 131], [284, 131], [227, 144], [284, 144]]) rect(b, x, y, 1, 1, '#6a5010');
  text(b, '2026', 256, 131, '#2a1c08', { align: 'center', scale: 2 });
  // floorboards
  for (let y = 172; y < 288; y++) for (let x = 0; x < 512; x++) {
    const seam = y % 12 === 0 || (x + ((y / 12) | 0) * 41) % 78 === 0;
    rect(b, x, y, 1, 1, seam ? '#100a07' : dith(x, y, 0.3) ? '#2a1c12' : '#241810');
  }
  // the rug
  rect(b, 34, 182, 342, 92, '#3a1e12');
  for (let y = 184; y < 272; y++) for (let x = 36; x < 374; x++) {
    const ex = Math.min(x - 36, 373 - x), ey = Math.min(y - 184, 271 - y), e = Math.min(ex, ey);
    let col = dith(x, y, 0.4) ? '#6a2020' : '#5a1a1c';
    if (e < 3) col = '#2a1416'; else if (e < 6) col = dith(x, y, 0.5) ? '#a08040' : '#7a6230'; else if (e < 9) col = '#2a1416';
    else if (((x - 205) ** 2 / 9000 + (y - 228) ** 2 / 1000) < 1 && ((x + y) % 14 < 2 || (x - y + 400) % 14 < 2)) col = '#8a6a34';
    else if (((x + y) % 28 < 1 || (x - y + 400) % 28 < 1)) col = '#46181a';
    rect(b, x, y, 1, 1, col);
  }
  // moonlight through the window, lying across the boards and the rug
  for (let y = 174; y < 262; y++) { const k = (y - 174) / 88, x0 = Math.round(52 + k * 66), w = 80; for (let x = x0; x < x0 + w; x++) if (dith(x, y, 0.2)) rect(b, x, y, 1, 1, '#7a92c8'); }
  // food on one side of the room, water on the other: cats won't eat where they drink
  ellipse(b, FOOD.x, FOOD.y + 1, 10, 4, INK); ellipse(b, FOOD.x, FOOD.y, 9, 3.5, '#c8402a'); ellipse(b, FOOD.x, FOOD.y - 1, 7, 2.5, '#5a2a14');
  for (let i = 0; i < 9; i++) rect(b, FOOD.x - 5 + (i * 7) % 11, FOOD.y - 2 + (i % 2), 2, 1, i % 3 ? '#9a6a3a' : '#c88a4a');
  ellipse(b, WATER.x, WATER.y + 1, 10, 4, INK); ellipse(b, WATER.x, WATER.y, 9, 3.5, '#2a6ab0'); ellipse(b, WATER.x, WATER.y - 1, 7, 2.5, '#7ab8e8'); rect(b, WATER.x - 3, WATER.y - 2, 3, 1, '#d8f0ff');
  // the walk-in litter box beside the trophy case: a hooded tray with a door in the front
  { const x = BOX.x, y = BOX.y;
    rect(b, x - 18, y - 24, 36, 25, INK); rect(b, x - 17, y - 23, 34, 23, '#7a8a96'); ellipse(b, x, y - 22, 17, 6, '#7a8a96'); ellipse(b, x, y - 23, 15, 4, '#9aaab6');
    rect(b, x - 17, y - 4, 34, 4, '#5a6874'); rect(b, x - 17, y - 23, 34, 1, '#b8c6d0');
    ellipse(b, x, y - 9, 8, 8, INK); rect(b, x - 8, y - 9, 17, 9, INK); ellipse(b, x, y - 9, 7, 7, '#1a1a20'); rect(b, x - 7, y - 9, 15, 9, '#1a1a20');
    rect(b, x + 11, y - 18, 4, 2, '#5a6874'); }
  // the side table, its lamp, the decanter (the glass is drawn live)
  ellipse(b, 396, 186, 26, 9, INK); ellipse(b, 396, 184, 25, 8, '#4a2c18'); ellipse(b, 396, 183, 24, 7, '#6a4022'); rect(b, 392, 190, 8, 62, '#2e1c10'); rect(b, 392, 190, 2, 62, '#4a2c18'); ellipse(b, 396, 254, 16, 5, '#2e1c10');
  rect(b, 402, 164, 3, 18, '#b89838'); rect(b, 397, 180, 13, 3, '#b89838');
  poly(b, [[394, 150], [413, 150], [418, 164], [389, 164]], '#1f6a48'); poly(b, [[394, 150], [401, 150], [398, 164], [389, 164]], '#2f8a60');
  rect(b, 389, 164, 29, 1, '#ffe8a8');
  rect(b, 375, 168, 8, 3, '#d8e4f0'); rect(b, 377, 161, 4, 7, '#c8d8e8'); ellipse(b, 379, 175, 7, 7, '#c8d8e8'); ellipse(b, 379, 176, 5, 5, '#b06a1e'); ellipse(b, 377, 174, 2, 2, '#f0b860'); rect(b, 377, 158, 4, 3, '#e8f0f8');
  // his chair, from behind, with the top of his head showing over it
  ellipse(b, 462, 128, 17, 15, '#0a0a10'); ellipse(b, 462, 127, 16, 14, '#8a9098'); ellipse(b, 458, 123, 8, 6, '#b8bec6');
  for (let i = 0; i < 5; i++) rect(b, 450 + i * 5, 118 + (i % 2), 3, 14, '#707680');
  rect(b, 422, 134, 80, 118, INK); rect(b, 424, 136, 76, 114, '#4a1a1a'); ellipse(b, 462, 137, 38, 11, INK); ellipse(b, 462, 138, 37, 10, '#5a2020');
  rect(b, 424, 136, 3, 114, '#6a2a24');
  for (let y = 148; y < 244; y += 16) for (let x = 434 + (y % 32 ? 8 : 0); x < 494; x += 16) { rect(b, x, y, 3, 3, '#2e0e0e'); rect(b, x, y, 1, 1, '#7a3430'); }
  rect(b, 428, 250, 6, 12, '#1a100a'); rect(b, 490, 250, 6, 12, '#1a100a');
  // his elbow on the chair arm, sleeve and cuff
  rect(b, 410, 180, 18, 16, INK); rect(b, 412, 182, 15, 12, '#1c1c24'); rect(b, 412, 182, 15, 2, '#2e2e38'); rect(b, 406, 184, 8, 8, INK); rect(b, 407, 185, 6, 6, '#f0cfb4');
  rect(b, 414, 196, 16, 54, INK); rect(b, 416, 196, 12, 54, '#4a1a1a'); rect(b, 416, 196, 12, 2, '#6a2a24');
  // the lamp's pool, then the room falls away to black
  for (let y = 0; y < 288; y++) for (let x = 0; x < 512; x++) {
    const d = Math.hypot(x - 403, (y - 168) * 1.3);
    if (d < 104 && y > 8 && dith(x, y, 0.5 * (1 - d / 104))) rect(b, x, y, 1, 1, mix('#4a3018', '#3a2414', d / 104));
    const v = Math.hypot((x - 240) / 300, (y - 140) / 190);
    if (v > 0.72 && dith(x, y, Math.min(0.85, (v - 0.72) * 2.4))) rect(b, x, y, 1, 1, '#060406');
  }
  return c;
}

// ---------------------------------------------------------------- the cats
const FOOD = { x: 40, y: 200 }, WATER = { x: 356, y: 262 }, BOX = { x: 126, y: 186 };
const CHASING = new Set(['notice', 'stalk', 'chase', 'wiggle', 'pounce', 'bat']);
function newCat(kid, pal, x, y) {
  return { kid, P: kid ? KID : MUM, pal, heads: bakeHeads(kid ? KIT_FACE : CAT_FACE, pal), x, y, z: 0, vz: 0, vx: 0, vy: 0, jx: 0, flip: Math.random() < 0.5, s: 'sit', t: 1 + Math.random() * 2, step: 0, lag: 0.15 + Math.random() * 0.5, cool: 0, tx: x, ty: y };
}
const say = (c, s, t) => { c.s = s; c.t = t; };

export default function make(ctx) {
  const { g, W, H, A } = ctx;
  const sfx = (n, p) => { try { A.sfx(n, p); } catch (e) {} };
  const room = bakeRoom(ctx.data);
  const slots = trophySlots(ctx.data);
  const sparkles = slots.map(s => [s.x - Math.round(3 * s.big), s.y - Math.round(19 * s.big)]);
  const year = (ctx.data && ctx.data.year) || 2026;
  const ORD = { 1: 'WINNER', 2: 'SECOND', 3: 'THIRD' };
  const captionOf = s => s.champ ? ['CONSTRUCTORS CHAMPIONS', `${TEAMS[0].name.toUpperCase()}, ${year}`] : [`ROUND ${s.round}: ${s.track.toUpperCase()}`, `${ORD[s.tier]}: ${s.driver.toUpperCase()}`];
  const slotAt = (x, y) => slots.slice().reverse().find(s => Math.abs(x - s.x) <= 9 * s.big && y >= s.y - 23 * s.big && y <= s.y);
  const mum = newCat(false, PALS.mum, 170, 236);
  const kids = [newCat(true, PALS.ginger, 120, 250), newCat(true, PALS.snow, 214, 256), newCat(true, PALS.smoke, 250, 222), newCat(true, PALS.patch, 92, 216)];
  const cats = [mum, ...kids];
  mum.s = 'loaf'; mum.t = 3;

  let clock = 0, laser = false, firstLaser = true, held = null, petting = false, petT = 0, petLimit = 6, grumpy = 0, purrT = 0, heartT = 0, sentDone = false;
  let level = 1, toast = null, hint = 1;
  const hearts = [], zs = [], lastMouse = { x: 200, y: 220 };
  const CHIP = { x: 6, y: 6, w: 92, h: 15 }, GLASS = { x: 378, y: 160, w: 26, h: 24 };
  const glassX = 390, glassY = 170;
  const inside = (m, r) => m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h;
  const note = (s, t = 3.6) => { toast = { s: rename(s), t }; };
  const hitbox = c => {
    const P = c.P, w = c.s === 'sit' || c.s === 'pet' ? P.hs + 8 : P.bw + P.hs;
    return { x: c.x - w / 2, y: c.y - c.z - P.bh - P.leg - P.hs - 2, w, h: P.bh + P.leg + P.hs + 6 };
  };
  const heart = (x, y) => hearts.push({ x, y, t: 0, dx: (Math.random() - 0.5) * 14 });

  function toggleLaser() {
    laser = !laser;
    sfx('tick', laser ? 0.8 : 0.2);
    if (laser && firstLaser) { firstLaser = false; note('The board wishes to pursue this matter.'); }
    if (laser) { if (petting) { petting = false; if (mum.s === 'pet') say(mum, 'sit', 0.2); } }
  }
  function moveTo(c, tx, ty, v, dt) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return true;
    const k = Math.min(1, v * dt / d);
    c.x += dx * k; c.y += dy * k;
    if (Math.abs(dx) > 1.5) c.flip = dx < 0;
    c.step += v * dt * (c.kid ? 0.55 : 0.28);
    return false;
  }
  function pounce(c, tx, ty) {
    const P = c.P, air = 2 * P.jump / 520;
    c.vz = P.jump; c.jx = (tx - c.x) / air; c.jy = (ty - c.y) / air;
    say(c, 'pounce', air + 0.2);
    if (tx !== c.x) c.flip = tx < c.x;
  }
  function idleBrain(c, dt) {
    const P = c.P;
    if (c.s.startsWith('go-')) {
      if (moveTo(c, c.tx, c.ty, P.walk, dt) || c.t <= 0) {
        const job = c.s.slice(3);
        if (job === 'box') { say(c, 'inbox', 3 + Math.random() * 3); if (!c.kid) note('The board is in closed session.'); }
        else { c.flip = job === 'eat'; say(c, job, 3 + Math.random() * 3); }
      }
      return;
    }
    if (c.s === 'inbox' && c.t <= 0) { c.y = BOX.y + 8; say(c, 'sit', 1.5); sfx('tick', 0); return; }
    if (c.t > 0) {
      if (c.s === 'eat' && Math.random() < dt * 3) sfx('tick', -0.5);
      if (c.s === 'walk' || c.s === 'zoom') { if (moveTo(c, c.tx, c.ty, c.s === 'zoom' ? P.run * 0.8 : P.walk, dt)) c.t = 0; }
      if (c.s === 'nap' && Math.random() < dt * 0.7) zs.push({ x: c.x + 6, y: c.y - P.bh - 8, t: 0 });
      return;
    }
    const roomX = () => FX0 + 16 + Math.random() * (FX1 - FX0 - 32), roomY = () => FY0 + Math.random() * (FY1 - FY0);
    // now and then: a meal, a drink, or a visit to the box
    const errand = Math.random();
    if (errand < 0.09) { c.tx = FOOD.x + (c.kid ? 10 : 16); c.ty = FOOD.y + 2; c.flip = true; say(c, 'go-eat', 8); return; }
    if (errand < 0.16) { c.tx = WATER.x - (c.kid ? 10 : 16); c.ty = WATER.y - 2; c.flip = false; say(c, 'go-drink', 8); return; }
    if (errand < 0.2) { c.tx = BOX.x; c.ty = BOX.y + 2; say(c, 'go-box', 8); return; }
    if (!c.kid) {
      const r = Math.random();
      if (r < 0.34) { c.tx = roomX(); c.ty = roomY(); say(c, 'walk', 6); }
      else if (r < 0.64) say(c, 'loaf', 6 + Math.random() * 8);
      else if (r < 0.82) say(c, 'groom', 3 + Math.random() * 2);
      else say(c, 'sit', 2 + Math.random() * 3);
      return;
    }
    const r = Math.random();
    if (mum.s === 'loaf' && r < 0.3) { c.tx = clamp(mum.x + (Math.random() < 0.5 ? -30 : 30), FX0, FX1); c.ty = clamp(mum.y + 8, FY0, FY1); say(c, 'walk', 4); }
    else if (r < 0.5) { c.tx = clamp(mum.x + (Math.random() - 0.5) * 120, FX0, FX1); c.ty = clamp(mum.y + (Math.random() - 0.5) * 50, FY0, FY1); say(c, 'walk', 4); }
    else if (r < 0.68) { c.tx = roomX(); c.ty = roomY(); say(c, 'zoom', 2.2); }
    else if (r < 0.82) say(c, 'sit', 1 + Math.random() * 2);
    else say(c, 'nap', 3 + Math.random() * 5);
  }
  function chaseBrain(c, dot, dt) {
    const P = c.P, d = Math.hypot(dot.x - c.x, dot.y - c.y);
    if (!CHASING.has(c.s)) say(c, 'notice', c.lag);
    switch (c.s) {
      case 'notice': if (dot.x !== c.x) c.flip = dot.x < c.x; if (c.t <= 0) say(c, c.kid ? 'chase' : 'stalk', 9); break;
      case 'stalk':
        moveTo(c, dot.x, dot.y, 42, dt);
        if (d < P.reach) say(c, 'wiggle', 0.55); else if (d > 170) say(c, 'chase', 9);
        break;
      case 'chase':
        moveTo(c, dot.x, dot.y, P.run * (c.kid ? 0.85 + 0.25 * Math.sin(clock * 7 + c.lag * 9) : 1), dt);
        if (d < P.reach) say(c, 'wiggle', c.kid ? 0.14 + Math.random() * 0.2 : 0.4);
        break;
      case 'wiggle':
        if (dot.x !== c.x) c.flip = dot.x < c.x;
        if (c.t <= 0) pounce(c, dot.x, dot.y);
        break;
      case 'pounce':
        if (c.z <= 0 && c.vz === 0) { say(c, 'bat', 0.3 + Math.random() * 0.3); sfx('tick', c.kid ? 0.1 : 0); if (Math.hypot(dot.x - c.x, dot.y - c.y) < (c.kid ? 16 : 26)) heart(c.x, c.y - P.hs - P.bh - 6); }
        break;
      case 'bat':
        if (c.t <= 0) say(c, d < P.reach ? 'wiggle' : c.kid || d > 110 ? 'chase' : 'stalk', d < P.reach ? 0.3 : 9);
        break;
    }
  }

  return {
    enter() { clock = 0; },
    update(dt, io) {
      clock += dt;
      const m = io.mouse;
      lastMouse.x = m.x; lastMouse.y = m.y;
      if (toast && (toast.t -= dt) <= 0) toast = null;
      if (clock > 16) hint = Math.max(0, hint - dt * 0.6);
      if (clock > 25 && !sentDone) { sentDone = true; ctx.done(); }
      grumpy = Math.max(0, grumpy - dt);

      if (io.pressed('KeyL') || (m.clicked && inside(m, CHIP))) toggleLaser();
      if (m.clicked && inside(m, GLASS)) {
        if (level > 0.05) { level = Math.max(0, level - 0.25); sfx('blip', 200); if (level === 0) note('The glass is empty. The decanter is not.'); }
        else { level = 1; sfx('clunk'); note('Hargreaves pours another. The board abstains.'); }
      } else if (m.clicked && !laser && !inside(m, CHIP)) {
        // kittens come up in the hand, the cat gets stroked
        const kit = kids.filter(c => inside(m, hitbox(c))).sort((a, b) => b.y - a.y)[0];
        if (kit) { held = kit; kit.z = 0; kit.vz = 0; say(kit, 'held', 99); sfx('mew', 1100 + Math.random() * 300); if (Math.random() < 0.3) note('A junior member of the board has been called upstairs.'); }
        else if (inside(m, hitbox(mum)) && mum.z === 0) {
          if (grumpy > 0) { sfx('miss'); note('The board has no further comment at this time.'); }
          else { petting = true; petT = 0; petLimit = 5 + Math.random() * 5; say(mum, 'pet', 99); if (Math.random() < 0.4) note('Hargreaves reports to the board.'); }
        }
      }
      if (m.released) {
        if (held) { const c = held, fy = clamp(m.y + 12, FY0, FY1); c.x = clamp(c.x, FX0, FX1); c.z = Math.max(0, fy - m.y); c.y = fy; c.vz = 0; say(c, 'tumble', 0.7); held = null; sfx('mew', 900); }
        if (petting) { petting = false; if (mum.s === 'pet') say(mum, 'sit', 1.6); }
      }
      if (held) { held.x = clamp(m.x, 8, W - 8); held.y = clamp(m.y, 20, H - 6); }
      if (petting) {
        petT += dt; purrT -= dt; heartT -= dt;
        if (purrT <= 0) { purrT = 0.12; sfx('purr'); }
        if (heartT <= 0) { heartT = 0.55; heart(mum.x + (Math.random() - 0.5) * 16, mum.y - 44); }
        if (petT > petLimit) { petting = false; grumpy = 4; say(mum, 'swat', 0.7); sfx('mew', 420); note('The board has swatted the Team Principal.'); }
        if (!inside(m, hitbox(mum))) { petting = false; say(mum, 'sit', 1.6); }
      }
      const dot = laser && m.x >= 0 ? { x: clamp(m.x, FX0, FX1), y: clamp(m.y, FY0, FY1) } : null;
      for (const c of cats) {
        if (c === held) continue;
        c.t -= dt; c.cool = Math.max(0, c.cool - dt);
        if (c.z > 0 || c.vz !== 0) {
          c.vz -= 520 * dt; c.z += c.vz * dt;
          if (c.s === 'pounce') { c.x += c.jx * dt; c.y += c.jy * dt; }
          if (c.z <= 0) { c.z = 0; c.vz = 0; }
        }
        c.x = clamp(c.x, FX0, FX1); c.y = clamp(c.y, c.s.startsWith('go-') || c.s === 'eat' || c.s === 'inbox' ? 180 : FY0, FY1);
        if (c.s === 'pet') continue;
        if (c.s === 'inbox' && dot) { c.y = BOX.y + 8; say(c, 'sit', 0.2); }
        if (c.s === 'tumble' || c.s === 'swat') { if (c.t <= 0) say(c, 'sit', 0.8); continue; }
        if (dot && !(c === mum && grumpy > 0)) chaseBrain(c, dot, dt);
        else if (CHASING.has(c.s)) say(c, 'lost', 1 + Math.random());
        else if (c.s === 'lost') { if (c.t <= 0) say(c, 'sit', 1); }
        else idleBrain(c, dt);
      }
      // kittens at full tilt run into each other
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i], b = kids[j];
        if ((a.s === 'chase' || a.s === 'zoom') && (b.s === 'chase' || b.s === 'zoom') && !a.cool && !b.cool && Math.hypot(a.x - b.x, a.y - b.y) < 9) {
          say(a, 'tumble', 0.6); say(b, 'tumble', 0.6); a.cool = b.cool = 2.5; sfx('mew', 1300);
        }
      }
      for (const h2 of hearts) h2.t += dt;
      while (hearts.length && hearts[0].t > 1.3) hearts.shift();
      for (const z of zs) z.t += dt;
      while (zs.length && zs[0].t > 1.8) zs.shift();
    },
    draw() {
      const T = clock;
      g.drawImage(room, 0, 0);
      // trophies catch the light now and then
      sparkles.forEach(([x, y], i) => { const k = (T * 0.31 + i * 0.37) % 1; if (k < 0.09) { const s = k < 0.045 ? 2 : 1; rect(g, x - s, y, s * 2 + 1, 1, '#ffffff'); rect(g, x, y - s, 1, s * 2 + 1, '#ffffff'); } });
      // the scotch
      rect(g, glassX - 6, glassY - 1, 12, 13, INK); rect(g, glassX - 5, glassY, 10, 11, '#8a98a8');
      const fill = Math.round(8 * level);
      if (fill > 0) { rect(g, glassX - 4, glassY + 9 - fill, 8, fill, '#b86a1e'); rect(g, glassX - 4, glassY + 9 - fill, 8, 1, '#f0b860'); }
      rect(g, glassX - 3, glassY + 2, 3, 3, '#e8f0f8'); rect(g, glassX - 5, glassY + 9, 10, 2, '#c8d8e8');
      const list = [...cats].sort((a, b) => a.y - b.y).filter(c => c !== held && c.s !== 'inbox');
      for (const c of list) drawCat(c, T);
      if (held) drawCat(held, T);
      for (const z of zs) { g.globalAlpha = Math.max(0, 1 - z.t / 1.8); text(g, 'z', z.x + z.t * 8, z.y - z.t * 16, '#c8d4f0'); g.globalAlpha = 1; }
      for (const h2 of hearts) {
        const k = h2.t / 1.3, x = Math.round(h2.x + h2.dx * k), y = Math.round(h2.y - k * 26);
        g.globalAlpha = Math.max(0, 1 - k);
        rect(g, x - 2, y, 2, 2, '#ff6a8a'); rect(g, x + 1, y, 2, 2, '#ff6a8a'); rect(g, x - 2, y + 1, 5, 2, '#ff6a8a'); rect(g, x - 1, y + 3, 3, 1, '#ff6a8a'); rect(g, x, y + 4, 1, 1, '#ff6a8a');
        g.globalAlpha = 1;
      }
      for (const c of cats) if (c.s === 'lost') text(g, '?', c.x, c.y - c.P.bh - c.P.leg - c.P.hs - 8, '#ffd23a', { align: 'center', outline: INK });
      // the laser, from his hand to wherever the mouse is
      if (laser) drawDot();
      // a caption for whichever trophy the pointer is over
      const hov = slotAt(lastMouse.x, lastMouse.y);
      if (hov) {
        const [a, b2] = captionOf(hov), w = Math.max(measure(a), measure(b2)) + 12, x = clamp(Math.round(lastMouse.x + 10), 4, W - w - 4), y = clamp(Math.round(lastMouse.y + 12), 4, H - 30);
        rect(g, x - 1, y - 1, w + 2, 26, INK); rect(g, x, y, w, 24, '#2a1c10'); rect(g, x, y, w, 1, '#b89838');
        text(g, a, x + 6, y + 4, '#ffd23a'); text(g, b2, x + 6, y + 14, '#f0e4c8');
      }
      // laser switch
      rect(g, CHIP.x, CHIP.y, CHIP.w, CHIP.h, INK); rect(g, CHIP.x + 1, CHIP.y + 1, CHIP.w - 2, CHIP.h - 2, laser ? '#5a1414' : '#241a16');
      rect(g, CHIP.x + 3, CHIP.y + 2, 11, 11, '#ffffff'); rect(g, CHIP.x + 3, CHIP.y + 11, 11, 2, '#9aa0aa'); text(g, 'L', CHIP.x + 9, CHIP.y + 4, '#0a0a10', { align: 'center' });
      text(g, laser ? 'LASER ON' : 'LASER OFF', CHIP.x + 19, CHIP.y + 4, laser ? '#ff8a7a' : '#a89a88');
      if (toast) { g.globalAlpha = clamp(toast.t * 2, 0, 1); text(g, toast.s, 200, 276, '#f0e4c8', { align: 'center', outline: INK }); g.globalAlpha = 1; }
      else if (hint > 0) { g.globalAlpha = hint; text(g, 'HOLD CLICK: PET THE CAT, LIFT A KITTEN.   CLICK THE GLASS: SIP.', 200, 276, '#b8a890', { align: 'center', outline: INK }); g.globalAlpha = 1; }
    },
  };

  function drawDot() {
    const p = { x: Math.round(lastMouse.x), y: Math.round(lastMouse.y) };
    const fromX = 406, fromY = 188, n = Math.ceil(Math.hypot(p.x - fromX, p.y - fromY) / 3);
    g.globalAlpha = 0.22;
    for (let i = 0; i <= n; i++) rect(g, fromX + (p.x - fromX) * i / n, fromY + (p.y - fromY) * i / n, 1, 1, '#ff3a2a');
    g.globalAlpha = 0.35; rect(g, p.x - 3, p.y - 1, 7, 3, '#ff2a1a'); rect(g, p.x - 1, p.y - 3, 3, 7, '#ff2a1a');
    g.globalAlpha = 1; rect(g, p.x - 1, p.y - 1, 3, 3, '#ff3a2a'); rect(g, p.x, p.y, 1, 1, '#ffd8c8');
  }

  // ---- one cat, in whatever pose it's in: facing right unless flipped; feet at (x, y)
  function drawCat(c, T) {
    const P = c.P, kid = c.kid, x = Math.round(c.x), y = Math.round(c.y - c.z), s = c.s, o = c.pal.o, dk = c.pal.O, li = c.pal.l;
    let dir = c.flip ? -1 : 1;
    if (s !== 'held') ellipse(g, c.x, c.y, P.bw * 0.55, kid ? 2 : 4, 'rgba(0,0,0,.42)');
    const parts = [];
    const B = (dx, dy, w, h, col) => parts.push([dir > 0 ? dx : -dx - w, dy, w, h, col]);
    const bw = P.bw, bh = P.bh, half = bw >> 1;
    let hx = 0, hy = 0, eye = 'open', jig = 0;
    const tail = (bx, by, up) => { for (let i = 0; i < P.tail; i++) { const tx = bx - i * P.sz * 0.8, ty = by - i * P.sz * up + Math.sin(T * 2.4 + i * 0.7) * i * 0.6; B(Math.round(tx) - P.sz, Math.round(ty), P.sz, P.sz, i % 2 ? dk : o); } };
    if (s === 'sit' || s === 'pet' || s === 'groom' || s === 'swat' || s === 'lost' || s === 'notice') {
      const w = kid ? 9 : 19, h = kid ? 9 : 22;
      tail(w >> 1, -(kid ? 2 : 3), 0);
      B(-(w >> 1), -h, w, h, o);
      B(-(w >> 1) + (kid ? 2 : 4), -h + 2, w - (kid ? 4 : 8), h - (kid ? 3 : 5), li);
      B(-(w >> 1) + 1, -(kid ? 2 : 3), kid ? 2 : 5, kid ? 2 : 3, li); B((w >> 1) - (kid ? 3 : 6), -(kid ? 2 : 3), kid ? 2 : 5, kid ? 2 : 3, li);
      hx = 0; hy = -h - P.hs + (kid ? 3 : 6);
      if (s === 'pet') { eye = 'closed'; jig = Math.sin(T * 60) > 0 ? 1 : 0; }
      if (s === 'groom') { eye = 'closed'; if (Math.sin(T * 5) > -0.2) B((w >> 1) - 2, -h - 2, 4, 9, li); }
      if (s === 'swat') { eye = 'wide'; dir = 1; B(w >> 1, -h - 6, 14, 4, li); }
      if (s === 'notice' || s === 'lost') eye = 'wide';
    } else if (s === 'loaf' || s === 'nap') {
      tail(-half + 2, -3, 0);
      B(-half, -bh - (kid ? 1 : 3), bw, bh + (kid ? 1 : 3), o);
      for (let i = 0; i < 3; i++) B(-half + (kid ? 2 : 5) + i * (kid ? 3 : 9), -bh - (kid ? 1 : 3), kid ? 1 : 3, kid ? 3 : 8, dk);
      hx = dir * (half - (kid ? 2 : 4)); hy = -bh - P.hs + (kid ? 3 : 6); eye = 'closed';
    } else if (s === 'eat' || s === 'drink') {
      const by = -P.leg - bh;
      tail(-half, by + 1, 0.6);
      B(-half, by, bw, bh, o); B(-half + 2, by + bh - 2, bw - 4, 2, li);
      for (const lx of [-half + 1, -half + (kid ? 4 : 10), half - (kid ? 6 : 13), half - (kid ? 3 : 6)]) B(lx, by + bh, kid ? 2 : 4, P.leg, lx < 0 ? dk : o);
      for (let i = 0; i < 3; i++) B(-half + (kid ? 2 : 5) + i * (kid ? 4 : 10), by, kid ? 1 : 3, kid ? 3 : 7, dk);
      hx = dir * (half + (kid ? 2 : 4)); hy = by + Math.round(P.hs * 0.2) + (Math.floor(T * 6) % 2); eye = 'closed';
    } else if (s === 'tumble') {
      if (Math.floor(T * 12) % 2) dir = -dir;
      B(-half, -bh - 2, bw, bh, li);
      B(-half + 2, -bh - 5, 2, 3, o); B(-half + 6, -bh - 6, 2, 4, o); B(half - 7, -bh - 6, 2, 4, o); B(half - 3, -bh - 5, 2, 3, o);
      hx = dir * (half + 1); hy = -P.hs + 1; eye = 'wide';
    } else if (s === 'held') {
      B(-3, 2, 7, 9, o); B(-2, 2, 5, 7, li);
      B(-4, 9, 2, 5, o); B(3, 9, 2, 5, o); B(-1, 11, 2, 5, dk);
      hx = 0; hy = -7; eye = 'wide';
    } else if (s === 'pounce') {
      const by = -P.leg - bh + 2;
      tail(-half, by + 1, 0.25);
      B(-half - 2, by, bw + 4, bh - 1, o); B(-half, by + bh - 3, bw, 2, li);
      for (let i = 0; i < 3; i++) B(-half + 2 + i * (kid ? 4 : 10), by, kid ? 1 : 3, kid ? 3 : 7, dk);
      B(half + 2, by + bh - 4, kid ? 4 : 9, kid ? 2 : 3, li); B(-half - (kid ? 5 : 10), by + bh - 3, kid ? 4 : 9, kid ? 2 : 3, o);
      hx = dir * (half + (kid ? 3 : 6)); hy = by - P.hs * 0.55; eye = 'wide';
    } else {
      // standing, walking, stalking
      const moving = s === 'walk' || s === 'zoom' || s === 'chase' || s === 'stalk' || s.startsWith('go-');
      const low = s === 'stalk' || s === 'wiggle' ? (kid ? 1 : 5) : 0, leg = P.leg - low, by = -leg - bh;
      const wig = s === 'wiggle' ? Math.round(Math.sin(T * 44)) * (kid ? 1 : 2) : 0;
      const stepA = moving ? Math.round(Math.sin(c.step) * (kid ? 1 : 3)) : 0;
      tail(-half + wig, by + 1, low ? 0.15 : 1);
      const lw = kid ? 2 : 4;
      for (const [lx, sgn] of [[-half + 1, 1], [-half + (kid ? 4 : 10), -1], [half - (kid ? 6 : 13), 1], [half - (kid ? 3 : 6), -1]]) {
        const lift = sgn * stepA > 0 ? (kid ? 1 : 2) : 0, sw = sgn * stepA;
        B(lx + (lx < 0 ? wig : 0) + sw, by + bh, lw, leg - lift, lx < 0 ? dk : o);
        B(lx + (lx < 0 ? wig : 0) + sw, -lift - (kid ? 1 : 2), lw, kid ? 1 : 2, li);
      }
      B(-half + wig, by, half + 2, bh, o); B(0, by, half, bh, o);
      B(-half + 2 + wig, by + bh - 2, half, 2, li); B(0, by + bh - 2, half - 2, 2, li);
      for (let i = 0; i < 3; i++) B(-half + (kid ? 2 : 5) + i * (kid ? 4 : 10) + (i === 0 ? wig : 0), by, kid ? 1 : 3, kid ? 3 : 7, dk);
      if (s === 'bat') B(half + 1, by + 2 + (Math.floor(T * 14) % 2) * 3, kid ? 3 : 8, kid ? 2 : 3, li);
      hx = dir * (half + (kid ? 1 : 3)); hy = by - Math.round(P.hs * 0.55) + Math.round(low * 0.6) + (moving ? Math.round(Math.sin(c.step * 2) * 0.6) : 0);
      if (s === 'stalk' || s === 'wiggle' || s === 'chase') eye = 'wide';
    }
    g.fillStyle = INK;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (const [a, b, w, h] of parts) g.fillRect(x + a + ox + jig, y + b + oy, w, h);
    for (const [a, b, w, h, col] of parts) { g.fillStyle = col; g.fillRect(x + a + jig, y + b, w, h); }
    const head = c.heads[eye], hw = head.width;
    g.drawImage(head, x + hx - (hw >> 1) + jig, y + hy);
  }
}
