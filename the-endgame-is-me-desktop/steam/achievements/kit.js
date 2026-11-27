// Helpers for drawing the achievement icons with the game's own art. Every icon is drawn at 64×64 (one game pixel =
// one icon pixel) and exported at 256×256 (×4, nearest neighbour), the size Steam recommends.
// Served by the dev server from the repo root, so the game's modules are at /the-endgame-is-me/js/.

import { PAL, ICONS as ABIL_ICONS, drawText, textWidth, makeBossSprites, BOSS_DIRS, newCanvas } from '/the-endgame-is-me/js/art.js';
import { drawThing } from '/the-endgame-is-me/js/render.js';
import { isolate } from '/the-endgame-is-me/js/humanstiary.js';
import { CLASS, createGame, newParty, mkUnit } from '/the-endgame-is-me/js/world.js';
import { CRITTERS, addProp, KINDS } from '/the-endgame-is-me/js/props.js';

export const S = 64;
export { PAL, ABIL_ICONS, drawText, textWidth, CLASS, CRITTERS, KINDS };

export const put = (c, x, y, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); };
export const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export function line(c, x0, y0, x1, y1, col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(c, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col);
}
export function disc(c, cx, cy, r, col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) put(c, cx + x, cy + y, col);
}
export function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// the standard backdrop: a dark vertical gradient in a hue, a 2 px ink frame with a lighter inner bevel
export function backdrop(c, top = '#3a2a1e', bottom = '#140e0a', rim = '#6a5038') {
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    rect(c, 0, y, S, 1, mix(top, bottom, t));
  }
  rect(c, 0, 0, S, 2, PAL.ink); rect(c, 0, S - 2, S, 2, PAL.ink); rect(c, 0, 0, 2, S, PAL.ink); rect(c, S - 2, 0, 2, S, PAL.ink);
  rect(c, 2, 2, S - 4, 1, rim); rect(c, 2, 2, 1, S - 4, rim);
}
export function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// draws a canvas (or a region of one) at an integer scale, centred on (cx, cy)
export function blit(c, src, cx, cy, scale = 1, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  c.imageSmoothingEnabled = false;
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  c.drawImage(src, sx, sy, sw, sh, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
}
// whatever draw(ctx) paints around (x, y), cut to what it covered and blitted at scale centred on (cx, cy)
export function stamp(c, draw, cx, cy, scale = 1, opts) {
  const iso = isolate(100, 100, draw, opts);
  if (iso.empty) return;
  // copy out: isolate's scratch canvas is reused by the next call
  const w = iso.x1 - iso.x0 + 1, h = iso.y1 - iso.y0 + 1, cv = newCanvas(w, h);
  cv.getContext('2d').drawImage(iso.cv, iso.x0, iso.y0, w, h, 0, 0, w, h);
  blit(c, cv, cx, cy, scale);
  return { w: w * scale, h: h * scale };
}

// a stand-in game for drawing things in (never stepped)
let lab = null;
export function labGame() { if (!lab) { lab = createGame(7); lab.boss.x = 9000; lab.boss.y = 9000; lab.t = 0.3; } return lab; }

// a hero of a class ('warrior', 'priest', ..., 'king', 'rider' for the horse guy on his horse), facing (fx: 1 right, -1 left).
// extra is merged into the unit (dead: true, burn, etc.)
export function hero(c, cls, cx, cy, scale = 2, extra = {}) {
  const g = labGame(); g.units.length = 0; g.parties.length = 0;
  const p = newParty(g, cls === 'rider' ? 'rider' : 'dungeon');
  const u = mkUnit(g, p, cls, 100, 100);
  Object.assign(u, extra);
  if (cls === 'rider') {
    Object.assign(u, { state: 'arrive', mounted: true, grip: 100, hface: extra.face ?? 0, horse: { x: 100, y: 100, face: extra.face ?? 0, walk: 0 } });
    return stamp(c, x => drawThing.rider(x, u, g), cx, cy, scale);
  }
  return stamp(c, x => drawThing.unit(x, u, g), cx, cy, scale);
}
// an animal or townsperson: 'cow', 'pig', 'chicken', 'rat', 'villager', 'city_folk', 'cart', 'horse', 'fen_steer', 'fen_mino', 'evil_cow'
export function critter(c, kind, cx, cy, scale = 2, extra = {}) {
  const d = CRITTERS[kind] || {};
  const cr = { id: 1, kind, x: 100, y: 100, hx: 100, hy: 100, hp: d.hp, r: d.r, dead: false, gone: false, walk: 0, fx: 1, moving: false, tx: 100, ty: 100, scared: 0, hitT: 0, seed: 1, face: 0, ...extra };
  return stamp(c, x => drawThing.critter(x, cr, labGame()), cx, cy, scale);
}
// a level prop, standing: 'pine', 'oak', 'cottage', 'city_lamp', 'castle_tower', 'wl_tower', ... (big ones get scaled down: pass scale < 1)
export function prop(c, kind, cx, cy, scale = 1, extra = {}) {
  const g = labGame(); g.props.length = 0;
  let p; try { p = addProp(g, kind, 100, 100, extra); } catch { return; }
  const r = stamp(c, x => drawThing.prop(x, p, g), cx, cy, scale, { hx: 90, up: 130, down: 50 });
  g.props.length = 0;
  return r;
}
// the boss (the default brown look unless look is given), facing dir (0..31, 0 = right, 8 = down), walk frame 0..3, mouth open
export function boss(c, cx, cy, scale = 1, { dir = 8, frame = 0, mouth = false, look = {} } = {}) {
  const sp = makeBossSprites(look).get(((dir % BOSS_DIRS) + BOSS_DIRS) % BOSS_DIRS, (mouth ? 4 : 0) + frame);
  blit(c, sp, cx, cy, scale);
}
// one of the HUD's 8×8 ability icons ('swipe', 'stomp', 'breath', 'roar', 'tail', 'charge', 'summon', 'beam', 'ice', 'haste', 'fur', 'lock'), each '#' a scale×scale block
export function abilIcon(c, id, x, y, scale, col, shadow = PAL.ink) {
  const rows = ABIL_ICONS[id];
  for (let r = 0; r < rows.length; r++) for (let k = 0; k < rows[r].length; k++) if (rows[r][k] === '#') {
    if (shadow) rect(c, x + k * scale + 1, y + r * scale + 1, scale, scale, shadow);
    rect(c, x + k * scale, y + r * scale, scale, scale, col);
  }
}
// the game's pixel font (4 px a letter at scale 1), centred on cx
export function label(c, s, cx, y, col = PAL.cream, scale = 1) { drawText(c, s, Math.round(cx), y, col, { scale, align: 'center' }); }
