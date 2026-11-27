// Achievement icons, second half (see icons-a.js for the first). Each draws on a 64×64 context with the kit (kit.js):
// the game's own sprites at integer scales, plus a few hand-drawn pixel maps below.
import { newCanvas } from '/the-endgame-is-me/js/art.js';

// ------------------------------------------------------------------------------------------------ local helpers

let RIM = '#6a5038';
// the kit's backdrop, remembering its rim so reframe() can restore the frame after something has spilled over it
function bd(c, k, top, bottom, rim) { RIM = rim; k.backdrop(c, top, bottom, rim); }
function reframe(c, k) {
  const S = 64, ink = k.PAL.ink;
  k.rect(c, 0, 0, S, 2, ink); k.rect(c, 0, S - 2, S, 2, ink); k.rect(c, 0, 0, 2, S, ink); k.rect(c, S - 2, 0, 2, S, ink);
  k.rect(c, 2, 2, S - 4, 1, RIM); k.rect(c, 2, 2, 1, S - 4, RIM);
}
// draws into a scratch 64×64 canvas: returned so it can be outlined, tinted, flipped or turned before landing
function scratch(draw) {
  const cv = newCanvas(64, 64), x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  draw(x);
  return cv;
}
// lands a scratch canvas: optional ink outline, flips, quarter turns about (ox, oy), tint
function land(c, k, cv, { outline = null, fx = false, fy = false, rot = 0, ox = 32, oy = 32, tint = null, tintA = 1, alpha = 1 } = {}) {
  let src = cv;
  if (tint) {
    src = scratch(x => { x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = tintA; x.fillStyle = tint; x.fillRect(0, 0, 64, 64); });
  }
  if (fx || fy || rot) {
    const s0 = src;
    src = scratch(x => { x.translate(ox, oy); x.rotate(rot * Math.PI / 2); x.scale(fx ? -1 : 1, fy ? -1 : 1); x.drawImage(s0, -ox, -oy); });
  }
  if (outline) {
    const d = src.getContext('2d').getImageData(0, 0, 64, 64).data, A = (i, j) => i >= 0 && j >= 0 && i < 64 && j < 64 && d[(j * 64 + i) * 4 + 3] > 40;
    c.fillStyle = outline;
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) if (!A(i, j) && (A(i - 1, j) || A(i + 1, j) || A(i, j - 1) || A(i, j + 1))) c.fillRect(i, j, 1, 1);
  }
  c.globalAlpha = alpha; c.drawImage(src, 0, 0); c.globalAlpha = 1;
}
const ol = (c, k, draw, o = {}) => land(c, k, scratch(draw), { outline: k.PAL.ink, ...o });

// a pixel map: each character a scale×scale block of pal[ch]; '.' and ' ' clear
function pix(c, rows, pal, x, y, s = 1, flip = false) {
  const w = Math.max(...rows.map(r => r.length));
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]; if (!pal[ch]) continue;
      c.fillStyle = pal[ch];
      c.fillRect(Math.round(x + (flip ? w - 1 - rx : rx) * s), Math.round(y + ry * s), s, s);
    }
  });
}
const mapW = rows => Math.max(...rows.map(r => r.length));
// centred on (cx, cy)
const pixC = (c, rows, pal, cx, cy, s = 1, flip = false) => pix(c, rows, pal, Math.round(cx - mapW(rows) * s / 2), Math.round(cy - rows.length * s / 2), s, flip);

// the boss's adds (render.js ADD_ART), facing right
const ADD = {
  gnasher: ['.h..h.', 'kFFFFk', 'kfFFek', 'kfffFk', '.k..k.'],
  gnasherBite: ['.h..h.', 'kFFFFk', 'kfFFek', 'kfffFk', '..kk..'],
  spitter: ['..kkk..', '.kRRRk.', 'kRrRRek', 'kRrRRmk', 'kRRrRRk', '.kkkkk.'],
  spitterSpit: ['..kkk..', '.kRRRk.', 'kRrRRek', 'kRrRMMM', 'kRRrRRk', '.kkkkk.'],
  necro: ['..kkk..G', '.kPPPk.s', '.kPgPk.s', 'kPPPPPks', 'kPpPPPks', 'kPPPPPk.', '.kk.kk..'],
  skel_healer: ['..b.g', '.bbbg', '.HHH.', '.HHH.'],
  skel_king: ['.YCY.', '..b..', 'KYYY.', 'KYyY.', '.b.b.'],
};
const addPal = k => ({ k: k.PAL.ink, F: k.PAL.fur3, f: k.PAL.fur2, e: k.PAL.eye, h: k.PAL.horn, R: '#b8452a', r: '#7e2a18', m: '#3a120a', M: k.PAL.fire3,
  P: '#4a2a5e', p: '#2e1a3c', g: k.PAL.heal, s: k.PAL.brown, G: k.PAL.heal, b: k.PAL.bone, S: k.PAL.steelHi, c: k.PAL.shadow, W: '#ffffff',
  V: '#3a3f8e', H: '#2f7a48', T: k.PAL.tan, Y: k.PAL.gold, y: '#c8962a', C: '#e0403a', K: '#8a1e18' });
// bone cows and pigs (levels/farms.js)
const BONE_PAL = { b: '#e8e2cc', B: '#b8b09a', s: '#f2efe2', g: '#7cff8a', x: '#2a2420', h: '#a8977a' };
const SKEL_COW = ['.........h.h.', '.bbbbbbbbsss.', 'b.BxBxBxBsgss', '..BxBxBxB.ss.', '..bb...bb....', '..b.B..b.B...'];

// a sparkle: a plus with a white heart (big: longer arms and dim corners)
function star(c, k, x, y, col, big = false) {
  const p = (dx, dy, cc = col) => k.put(c, x + dx, y + dy, cc);
  p(-1, 0); p(1, 0); p(0, -1); p(0, 1);
  if (big) { p(-2, 0); p(2, 0); p(0, -2); p(0, 2); }
  p(0, 0, '#ffffff');
}
// a jagged bolt through pts: a glow two wide, a core one wide
function bolt(c, k, pts, core, glow) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = pts[i], [d, e] = pts[i + 1];
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) k.line(c, a + ox, b + oy, d + ox, e + oy, glow);
  }
  for (let i = 0; i + 1 < pts.length; i++) k.line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], core);
}
// a filled ellipse (outer ring col2 if given)
function oval(c, k, cx, cy, rx, ry, col, col2 = null, edge = 0.6) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2;
    if (d <= 1) k.put(c, cx + x, cy + y, col2 && d > edge ? col2 : col);
  }
}
// an elliptical ring
function ring(c, k, cx, cy, rx, ry, col) {
  const n = Math.ceil((rx + ry) * 4);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.put(c, cx + Math.round(Math.cos(a) * rx), cy + Math.round(Math.sin(a) * ry), col); }
}
// dizzy stars over a head
function dizzy(c, k, x, y) { k.put(c, x - 2, y + 1, k.PAL.gold); k.put(c, x + 2, y, k.PAL.gold); k.put(c, x, y - 1, '#fff2b0'); }
// fire: a cone from (x0, y0) to (x1, y1), w0 wide at the start and w1 at the end, noisy at the edges
function fireCone(c, k, x0, y0, x1, y1, w0, w1, seed = 1) {
  const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const F = ['#ffffff', k.PAL.fire3, k.PAL.fire2, k.PAL.fire1, k.PAL.fire0];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x - x0, dy = y - y0, t = (dx * ux + dy * uy) / L, d = Math.abs(dx * uy - dy * ux);
    if (t < 0 || t > 1.08) continue;
    const w = (w0 + (w1 - w0) * t) / 2, n = k.hash(x * 3 + seed, y * 5) * 0.45 + k.hash(x >> 1, (y >> 1) + seed) * 0.3;
    const r = d / w + n * 0.5 + (t > 1 ? (t - 1) * 8 : 0);
    if (r > 1.15) continue;
    k.put(c, x, y, F[Math.min(4, Math.floor(r * 3.2 + t * 1.2))]);
  }
}
// flame tongues standing on a line (x, y) w wide, up to h tall
function flames(c, k, x, y, w, h, seed = 3) {
  for (let i = 0; i < w; i++) {
    const t = Math.abs(i - (w - 1) / 2) / (w / 2), H = Math.round(h * (1 - t * 0.5) * (0.45 + 0.55 * k.hash(i + seed, seed * 7)));
    for (let j = 0; j < H; j++) {
      const f = j / Math.max(1, H);
      k.put(c, x + i, y - j, f < 0.3 ? k.PAL.fire1 : f < 0.65 ? k.PAL.fire2 : f < 0.9 ? k.PAL.fire3 : '#ffffff');
    }
    if (k.hash(i, seed) < 0.3) k.put(c, x + i, y - H - 2, k.PAL.ember);
  }
}
// a hero (or the boss, below) centred on (cx, cy) through a scratch canvas: turned by quarter turns (knocked flat, flung), flipped, outlined, tinted
function heroAt(c, k, cls, cx, cy, s, { rot = 0, fx = false, outline = null, extra = {}, tint = null, tintA = 1 } = {}) {
  const cv = scratch(x => k.hero(x, cls, 32, 32, s, extra));
  c.save(); c.translate(cx - 32, cy - 32); land(c, k, cv, { rot, fx, outline, tint, tintA }); c.restore();
}
function bossAt(c, k, cx, cy, opts = {}, how = {}) {
  const cv = scratch(x => k.boss(x, 32, 32, 1, opts));
  c.save(); c.translate(cx - 32, cy - 32); land(c, k, cv, how); c.restore();
}

// ------------------------------------------------------------------------------------------------ the icons

export const ICONS = {
  // the boss lunging in from the left into a crowd of heroes, all seeing stars
  STUNNING: (c, k) => {
    bd(c, k, '#5a4612', '#140e04', '#9a8030');
    // speed streaks behind
    for (const [y, l] of [[22, 10], [28, 14], [40, 12], [46, 8]]) k.rect(c, 2, y, l, 1, '#c8a848');
    bossAt(c, k, 20, 34, { dir: 0, frame: 2, mouth: true }, { outline: k.PAL.ink });
    // the impact
    star(c, k, 42, 34, k.PAL.gold, true);
    const cls = ['warrior', 'priest', 'mage', 'rogue', 'hunter', 'paladin', 'druid'];
    [[49, 13], [57, 21], [47, 26], [56, 35], [48, 45], [57, 50], [44, 56]].forEach(([x, y], i) => { heroAt(c, k, cls[i], x, y, 2, { outline: k.PAL.ink }); dizzy(c, k, x, y - 8); });
    reframe(c, k);
  },
  // the boss tearing along on Zoomies, a trail of flattened heroes behind it
  VROOM_VROOM: (c, k) => {
    bd(c, k, '#7a3a10', '#1a0804', '#c07030');
    k.rect(c, 2, 44, 60, 18, '#4a2610'); k.rect(c, 2, 44, 60, 1, '#8a5a30');
    // paw prints and the flattened, in a line back the way it came
    for (const [x, y] of [[6, 50], [16, 54], [36, 50], [46, 55]]) { k.put(c, x, y, k.PAL.blood); k.put(c, x + 1, y + 1, k.PAL.blood); k.put(c, x - 1, y + 2, k.PAL.blood); }
    for (const [cls, x, y, r] of [['mage', 10, 52, 1], ['priest', 26, 56, 3], ['rogue', 40, 51, 1], ['paladin', 54, 56, 3]]) {
      oval(c, k, x, y + 1, 5, 2, k.PAL.blood);
      heroAt(c, k, cls, x, y, 2, { rot: r, outline: k.PAL.ink });
    }
    for (const [y, x0, l] of [[12, 3, 12], [18, 6, 14], [25, 2, 16], [32, 5, 12], [38, 9, 10]]) { k.rect(c, x0, y, l, 1, '#ffd08a'); k.rect(c, x0 + l, y, 3, 1, '#fff2d0'); }
    bossAt(c, k, 38, 24, { dir: 0, frame: 1, mouth: true }, { outline: k.PAL.ink });
    reframe(c, k);
  },
  // the boss up top breathing a cone of fire across a row of thatch, trees and hay, all alight
  BURNINATE: (c, k) => {
    bd(c, k, '#5a140a', '#140402', '#a84a20');
    k.rect(c, 2, 46, 60, 16, '#2a1008');
    const burn = { burning: true, burnT: 2 };
    k.prop(c, 'pine', 9, 44, 1, burn); k.prop(c, 'cottage', 24, 50, 1, burn); k.prop(c, 'hay', 41, 54, 1, burn); k.prop(c, 'cottage', 54, 47, 1, burn);
    flames(c, k, 4, 38, 10, 12, 2); flames(c, k, 14, 46, 20, 14, 5); flames(c, k, 36, 54, 10, 10, 9); flames(c, k, 45, 44, 17, 15, 4);
    fireCone(c, k, 32, 22, 32, 50, 4, 34, 7);
    bossAt(c, k, 32, 2, { dir: 8, frame: 0, mouth: true }, { outline: k.PAL.ink });
    reframe(c, k);
  },
  // a wide swoosh of tail, heroes flung tumbling out of it
  WHIP_IT_GOOD: (c, k) => {
    bd(c, k, '#3e1a52', '#100614', '#7a5a9a');
    bossAt(c, k, 26, 22, { dir: 24, frame: 0 }, { outline: k.PAL.ink });
    // the sweep: a fat crescent under the boss, bright at its leading edge
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, a = Math.PI * (1.1 - t * 1.05), R = 22, w = 1 + t * 5;
      for (let j = 0; j < w; j += 0.5) {
        const x = 26 + Math.cos(a) * (R - j), y = 30 + Math.sin(a) * (R - j) * 0.8;
        k.put(c, x, y, j < 1 ? '#ffffff' : j < w * 0.5 ? '#e0c8ff' : '#9a70d0');
      }
    }
    const fl = [['warrior', 51, 32, 1], ['priest', 56, 45, 2], ['mage', 44, 54, 3], ['rogue', 30, 58, 1], ['hunter', 14, 56, 2], ['paladin', 6, 44, 3]];
    for (const [cls, x, y, r] of fl) heroAt(c, k, cls, x, y, 2, { rot: r, outline: k.PAL.ink });
    for (const [x, y] of [[57, 28], [60, 41], [49, 60], [20, 61], [4, 52]]) k.put(c, x, y, '#e0c8ff');
    reframe(c, k);
  },
  // the boss lands: shock rings in the dust, heroes knocked flat all round, seeing stars
  STOMP_STOMP: (c, k) => {
    bd(c, k, '#5a4428', '#140e08', '#9a7a50');
    oval(c, k, 32, 46, 29, 14, '#6a5434', '#5a4428', 0.75);
    ring(c, k, 32, 46, 28, 13, '#e8d8a8'); ring(c, k, 32, 46, 20, 9, '#c8b080'); ring(c, k, 32, 46, 12, 5, '#a89060');
    bossAt(c, k, 32, 22, { dir: 8, frame: 2 }, { outline: k.PAL.ink });
    const ko = [['warrior', 8, 44, 1], ['priest', 14, 55, 3], ['mage', 30, 59, 1], ['rogue', 47, 56, 3], ['hunter', 56, 46, 1], ['paladin', 52, 36, 3], ['druid', 10, 34, 1]];
    for (const [cls, x, y, r] of ko) { heroAt(c, k, cls, x, y, 2, { rot: r, outline: k.PAL.ink }); dizzy(c, k, x, y - 5); }
    reframe(c, k);
  },
  // three great claw rakes through a knot of heroes
  SLASHY: (c, k) => {
    bd(c, k, '#5a1414', '#180404', '#a04a40');
    const crowd = [['warrior', 18, 26], ['mage', 32, 20], ['priest', 46, 26], ['rogue', 13, 44], ['hunter', 27, 40], ['paladin', 41, 44], ['berserker', 53, 42]];
    for (const [cls, x, y] of crowd) heroAt(c, k, cls, x, y, 2, { outline: k.PAL.ink });
    for (let s = 0; s < 3; s++) {
      const x0 = 34 + s * 10, y0 = 4, x1 = 6 + s * 10, y1 = 60;
      for (let i = 0; i <= 70; i++) {
        const t = i / 70, bow = Math.sin(t * Math.PI) * 5, x = x0 + (x1 - x0) * t - bow, y = y0 + (y1 - y0) * t, w = Math.sin(t * Math.PI) * 2.4;
        for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) {
          const a = Math.abs(j) / Math.max(w, 0.5);
          if (a > 1) continue;
          k.put(c, x + j, y, a < 0.4 ? '#ffffff' : a < 0.8 ? '#ffc0b0' : '#e04030');
        }
      }
    }
    for (const [x, y] of [[12, 30], [24, 50], [50, 33], [44, 54], [58, 22]]) { k.put(c, x, y, k.PAL.blood); k.put(c, x + 1, y + 1, k.PAL.blood); }
    reframe(c, k);
  },
  // an ice floor full of heroes frozen into blocks
  BRRRRRR: (c, k) => {
    bd(c, k, '#2a6a90', '#061624', '#8ad0f0');
    // the floor: pale ice tiles with cracks
    for (let y = 26; y < 62; y++) for (let x = 2; x < 62; x++) {
      const n = k.hash(x >> 2, y >> 2), edge = (x + y * 2) % 11 === 0 || (x * 2 - y) % 13 === 0;
      k.put(c, x, y, edge ? '#8cc8de' : n < 0.5 ? '#4a8ab0' : '#5a9ac0');
    }
    const fr = [['warrior', 12, 34], ['mage', 28, 31], ['priest', 46, 34], ['rogue', 20, 50], ['paladin', 38, 49], ['hunter', 54, 51]];
    for (const [cls, x, y] of fr) {
      heroAt(c, k, cls, x, y, 2, { outline: k.PAL.ink });
      // the block of ice round them
      c.globalAlpha = 0.3; k.rect(c, x - 6, y - 8, 12, 16, '#dff4fb'); c.globalAlpha = 1;
      k.rect(c, x - 6, y - 8, 12, 1, '#ffffff'); k.rect(c, x - 6, y - 8, 1, 16, '#ffffff');
      k.rect(c, x + 5, y - 7, 1, 15, k.PAL.ice2); k.rect(c, x - 5, y + 7, 11, 1, k.PAL.ice2);
      k.put(c, x - 4, y - 6, '#ffffff'); k.put(c, x - 3, y - 5, '#ffffff');
    }
    k.abilIcon(c, 'ice', 24, 4, 2, '#ffffff', '#1a4a6a');
    reframe(c, k);
  },
  // a forked bolt raking down a line of heroes and a cow, each one x-rayed
  ZAP: (c, k) => {
    bd(c, k, '#0e2a3a', '#02080e', '#3ab0d0');
    // the beam comes down and forks to everyone
    bolt(c, k, [[30, 2], [34, 8], [28, 14], [33, 20], [30, 26]], '#ffffff', k.PAL.beam);
    bolt(c, k, [[30, 26], [22, 28], [18, 34], [12, 38]], '#ffffff', k.PAL.beam);
    bolt(c, k, [[30, 26], [34, 30], [30, 34], [32, 38]], '#ffffff', k.PAL.beam);
    bolt(c, k, [[30, 26], [40, 26], [46, 32], [52, 36]], '#ffffff', k.PAL.beam);
    bolt(c, k, [[18, 34], [8, 30], [6, 24]], '#ffffff', k.PAL.beam);
    bolt(c, k, [[46, 32], [54, 24], [58, 22]], '#ffffff', k.PAL.beam);
    const vic = [['warrior', 12, 48, 3], ['mage', 32, 50, 3], ['priest', 52, 48, 3], ['rogue', 6, 20, 2], ['hunter', 58, 18, 2]];
    for (const [cls, x, y, s] of vic) {
      // lit up: a glow round the body and sparks crackling off it
      const cv = scratch(q => k.hero(q, cls, 32, 32, s));
      c.save(); c.translate(x - 32, y - 32);
      land(c, k, scratch(q => land(q, k, cv, { outline: k.PAL.beam })), { outline: '#1a6a8a' });
      c.restore();
    }
    for (const [x, y] of [[4, 42], [20, 50], [26, 44], [38, 46], [46, 52], [60, 44], [12, 14], [52, 12]]) { k.put(c, x, y, '#ffffff'); k.put(c, x + 1, y - 1, k.PAL.beam); k.put(c, x - 1, y + 1, k.PAL.beam); }
    for (const [x, y] of [[22, 44], [42, 44], [20, 14], [44, 12], [24, 58], [42, 58]]) star(c, k, x, y, k.PAL.beam);
    reframe(c, k);
  },
  // eight Gnashers in a heap, with a heart over them
  LITTER: (c, k) => {
    bd(c, k, '#1e4a4a', '#061414', '#5a9a90');
    const P = addPal(k), s = 3;
    const pile = [[9, 44, 0, 0], [27, 45, 1, 1], [45, 44, 0, 1], [16, 33, 1, 0], [36, 32, 0, 0], [52, 31, 1, 1], [5, 30, 0, 1], [26, 21, 1, 1]];
    oval(c, k, 32, 57, 28, 4, '#0a2020');
    for (const [x, y, f, b] of pile) pix(c, b ? ADD.gnasherBite : ADD.gnasher, P, x, y, s, !!f);
    // a heart
    pix(c, ['.rr.rr.', 'rWrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: '#e8506a', W: '#ffffff' }, 44, 6, 2);
    reframe(c, k);
  },
  // a Spitter hocks one glob that bursts over four heroes
  UGH_EVERYWHERE: (c, k) => {
    bd(c, k, '#33461a', '#0a1004', '#7a9a40');
    const P = addPal(k), goo = '#9ae03a', gooD = '#2e5a10';
    pix(c, ADD.spitterSpit, P, 2, 36, 4);
    // the arc of the glob, dotted, up and over
    for (let i = 0; i <= 20; i++) { const t = i / 20, x = 30 + t * 14, y = 48 - Math.sin(t * Math.PI * 0.8) * 30; if (i % 2 === 0) { k.put(c, x, y, goo); if (i % 4 === 0) k.put(c, x + 1, y, gooD); } }
    // the splash: a burst of goo with droplets flying
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = 5 + (i % 3) * 2; k.line(c, 46, 22, 46 + Math.cos(a) * r, 22 + Math.sin(a) * r * 0.8, i % 2 ? goo : gooD); }
    k.disc(c, 46, 22, 3, goo); k.put(c, 45, 21, '#e8ffc0');
    // the heroes under it, dripping
    const vic = [['warrior', 36, 42], ['mage', 46, 38], ['priest', 56, 44], ['rogue', 47, 54]];
    for (const [cls, x, y] of vic) {
      heroAt(c, k, cls, x, y, 2, { outline: k.PAL.ink });
      k.rect(c, x - 3, y - 8, 6, 2, goo); k.put(c, x - 3, y - 6, goo); k.put(c, x - 3, y - 5, gooD); k.put(c, x + 2, y - 6, goo); k.put(c, x + 2, y - 5, goo); k.put(c, x + 2, y - 4, gooD);
      k.rect(c, x - 3, y + 3, 7, 1, gooD); k.rect(c, x - 2, y + 3, 4, 1, goo);
    }
    reframe(c, k);
  },
  // a bone cow, risen, eyes glowing green, the Necromancer behind it with his staff up
  ABOMINATION: (c, k) => {
    bd(c, k, '#2a1a3a', '#0a0612', '#6a4a8a');
    oval(c, k, 30, 52, 26, 6, '#1e4a22', '#14301a');
    for (const [x, y] of [[12, 12], [18, 8], [24, 14], [8, 22], [54, 20], [58, 30]]) star(c, k, x, y, k.PAL.heal);
    pix(c, ADD.necro, addPal(k), 46, 4, 2);
    // green raise beam from his staff to the cow
    for (let i = 0; i < 12; i++) k.put(c, 60 - i * 1.4, 6 + i * 1.8, i % 2 ? '#7cff8a' : '#c0ffc8');
    pixC(c, SKEL_COW, BONE_PAL, 30, 40, 4);
    // glow in the socket
    c.globalAlpha = 0.35; k.disc(c, 50, 34, 3, '#7cff8a'); c.globalAlpha = 1;
    reframe(c, k);
  },
  // the boss sealed in a bone priest's blue bubble, the bone priests below casting it
  UNHOLY: (c, k) => {
    bd(c, k, '#2a1a4a', '#0a0614', '#6a5aa0');
    bossAt(c, k, 32, 26, { dir: 8 }, { outline: k.PAL.ink });
    // the ward
    for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++) {
      const d = Math.hypot(x, y);
      if (d > 26) continue;
      const cx = 32 + x, cy = 28 + y;
      if (d > 24.8) k.put(c, cx, cy, '#bfe8ff');
      else if (d > 23.6) { c.globalAlpha = 0.6; k.put(c, cx, cy, '#6ab0ff'); c.globalAlpha = 1; }
      else { c.globalAlpha = 0.08 + 0.22 * (d / 24) ** 3; k.put(c, cx, cy, '#5b8cff'); c.globalAlpha = 1; }
      if (Math.abs(d - 20) < 0.7 && x < -4 && y < -4) k.put(c, cx, cy, '#ebf6ff');
    }
    const P = addPal(k);
    pix(c, ADD.skel_healer, P, 3, 46, 3); pix(c, ADD.skel_healer, P, 46, 46, 3, true);
    for (const [x, y] of [[18, 46], [46, 46]]) star(c, k, x, y, k.PAL.heal);
    reframe(c, k);
  },
  // "1M" over a heap of gold
  MEGA: (c, k) => {
    bd(c, k, '#5a3a14', '#140a04', '#e0b040');
    // the hoard: a dome of coins
    for (let y = 36; y < 62; y++) for (let x = 2; x < 62; x++) {
      const d = ((x - 32) / 34) ** 2 + ((y - 64) / 26) ** 2;
      if (d > 1) continue;
      const h = k.hash(x, y);
      k.put(c, x, y, (x + y * 3) % 5 === 0 ? '#8a5a14' : h < 0.15 ? '#fff2b0' : h < 0.6 ? k.PAL.gold : '#e0a830');
    }
    for (const [x, y, col] of [[14, 50, '#e0403a'], [44, 46, '#58b8ff'], [30, 56, '#7cff8a']]) { k.put(c, x, y, col); k.put(c, x + 1, y, col); k.put(c, x, y + 1, col); k.put(c, x + 1, y + 1, '#ffffff'); }
    k.label(c, '1M', 32, 8, k.PAL.gold, 5);
    for (const [x, y, b] of [[8, 10, 1], [56, 14, 1], [52, 36, 0], [10, 38, 0], [32, 40, 1]]) star(c, k, x, y, '#fff2b0', !!b);
    reframe(c, k);
  },
  // the boss bursting through the castle-front wall, stones flying
  SHAKA: (c, k) => {
    bd(c, k, '#3a4450', '#101214', '#8a96a0');
    const st = ['#55564f', '#7f7f74', '#aeac9b'];
    // what is left of the wall, left and right
    for (const [x0, x1] of [[2, 14], [50, 62]]) for (let y = 18; y < 50; y++) for (let x = x0; x < x1; x++) {
      const top = 18 + Math.floor(k.hash(x, 3) * 6) + (x0 === 2 ? (x - 2) : (61 - x)) * 0.8;
      if (y < top) continue;
      const brick = ((y >> 2) % 2 ? x + 2 : x) % 6 === 0 || y % 4 === 0;
      k.put(c, x, y, brick ? '#3a3a36' : st[Math.floor(k.hash(x >> 2, y >> 2) * 2) + 1]);
    }
    bossAt(c, k, 32, 30, { dir: 8, frame: 1, mouth: true }, { outline: k.PAL.ink });
    // rubble heap in front and blocks in the air
    for (let i = 0; i < 26; i++) { const x = 4 + k.hash(i, 1) * 56, y = 52 + k.hash(i, 2) * 8, w = 3 + Math.floor(k.hash(i, 3) * 3); k.rect(c, x, y, w, 3, '#3a3a36'); k.rect(c, x, y, w - 1, 2, st[1 + (i % 2)]); }
    for (const [x, y] of [[10, 8], [20, 4], [46, 6], [56, 10], [6, 14], [40, 2]]) { k.rect(c, x, y, 4, 3, '#3a3a36'); k.rect(c, x, y, 3, 2, st[2]); }
    reframe(c, k);
  },
  // the king, flattened to a rug on a chequered floor (shah mat: checkmate)
  SHAH_FLOOR_MAT: (c, k) => {
    bd(c, k, '#4a3410', '#140c04', '#e0b040');
    for (let y = 2; y < 62; y++) for (let x = 2; x < 62; x++) k.put(c, x, y, ((x - 2) >> 3) % 2 === ((y - 2) >> 3) % 2 ? '#d8c39a' : '#3a2a1a');
    // spread-eagle and paper thin: cape out behind, limbs splayed to the corners, crown squashed flat, eyes crossed out
    const KING = [
      'ss.................ss',
      '.ss......YCY......ss.',
      '..YY....YYYYY....YY..',
      '...YYKKKsssssKKKYY...',
      '....YKKKsXsXsKKKY....',
      '....KKKKsssssKKKK....',
      '...KKKYYYYYYYYYKKK...',
      '...KKKYYyYYYyYYKKK...',
      '...KKKYYYYYYYYYKKK...',
      '....KKYYYyYyYYYKK....',
      '....KKYYYYYYYYYKK....',
      '...KKYYYY...YYYYKK...',
      '..kYYYK.......KYYYk..',
      '.kkYY...........YYkk.',
    ];
    const pal = { Y: k.PAL.gold, y: '#c8962a', C: '#e0403a', K: '#8a1e18', s: k.PAL.skin, X: k.PAL.ink, k: k.PAL.ink };
    ol(c, k, x => pixC(x, KING, pal, 32, 33, 3));
    // the paw print he wears now
    c.globalAlpha = 0.5;
    for (const [x, y] of [[23, 30], [29, 27], [35, 27], [41, 30]]) k.disc(c, x, y, 2, '#2a1a0a');
    oval(c, k, 32, 39, 7, 5, '#2a1a0a');
    c.globalAlpha = 1;
    reframe(c, k);
  },
  // the City Wall's whole length knocked into stumps, one guard left asking
  ALL_OF_IT: (c, k) => {
    bd(c, k, '#4a5260', '#101216', '#9aa4b0');
    const st = ['#3a3a36', '#7f7f74', '#aeac9b'];
    // the stumps of towers and curtains along the horizon
    for (let x = 2; x < 62; x++) {
      const tower = [10, 31, 52].some(t => Math.abs(x - t) < 5);
      const h = tower ? 9 + Math.floor(k.hash(x, 1) * 6) : 2 + Math.floor(k.hash(x, 2) * 4);
      for (let y = 34 - h; y < 34; y++) k.put(c, x, y, (y % 3 === 0 || (x + (y >> 1)) % 5 === 0) ? st[0] : st[tower ? 2 : 1]);
    }
    k.rect(c, 2, 34, 60, 28, '#3a3428');
    for (let i = 0; i < 40; i++) { const x = 2 + k.hash(i, 5) * 58, y = 30 + k.hash(i, 6) * 10; k.rect(c, x, y, 3, 2, st[1 + (i % 2)]); k.put(c, x, y + 2, st[0]); }
    // where it all stood: the wall and its towers, dotted in like a ghost
    const ghost = (x, y) => { if ((x + y) % 2 === 0) k.put(c, x, y, '#c8d0dc'); };
    for (const t of [10, 31, 52]) {
      for (let y = 8; y < 26; y++) { ghost(t - 6, y); ghost(t + 6, y); }
      for (let x = t - 6; x <= t + 6; x++) ghost(x, 8);
      for (const x of [t - 6, t - 2, t + 2, t + 6]) for (let y = 5; y < 8; y++) ghost(x, y);
    }
    for (const [a, b] of [[2, 4], [16, 25], [37, 46], [58, 62]]) for (let x = a; x < b; x++) { ghost(x, 16); if (x % 4 === 0) { ghost(x, 15); ghost(x, 14); } }
    heroAt(c, k, 'warrior', 20, 52, 2, { outline: k.PAL.ink });
    k.label(c, '?!', 34, 42, k.PAL.gold, 2);
    reframe(c, k);
  },
  // "1000" over a field of fresh graves
  MILLICIDE: (c, k) => {
    bd(c, k, '#3a1a20', '#0c0406', '#9a4a50');
    k.rect(c, 2, 30, 60, 32, '#1e1a12');
    const grave = (x, y, s) => {
      pix(c, ['.kkk.', 'kGGGk', 'kGgGk', 'kgggk', 'kGgGk', 'kGGGk', 'kkkkk'], { k: k.PAL.ink, G: '#8a8a80', g: '#5a5a52' }, x, y, s);
      k.rect(c, x - s, y + 7 * s - 1, 7 * s, 1, '#3a2a1a');
    };
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6 + r; i++) {
      const s = r < 2 ? 1 : 2, gap = r < 2 ? 9 : 12;
      const x = 3 + (r % 2) * 4 + i * gap, y = 28 + r * 8 + (r > 1 ? (r - 2) * 4 : 0);
      if (x < 58) grave(x, y, s);
    }
    k.label(c, '1000', 32, 8, k.PAL.cream, 3);
    reframe(c, k);
  },
  // the boss, blood-spattered, eyes lit red, over a long tally of kills
  KILLING_MACHINE: (c, k) => {
    bd(c, k, '#5a0e0e', '#140202', '#c04040');
    for (let i = 0; i < 30; i++) { const x = 4 + k.hash(i, 9) * 56, y = 4 + k.hash(i, 8) * 40; k.put(c, x, y, k.PAL.blood); if (i % 3 === 0) k.put(c, x + 1, y, k.PAL.blood); }
    bossAt(c, k, 32, 24, { dir: 8, frame: 0, mouth: true }, { outline: k.PAL.ink });
    // the tally, scratched in bone
    for (let g = 0; g < 4; g++) {
      const x0 = 5 + g * 14;
      for (let i = 0; i < 4; i++) k.rect(c, x0 + i * 2, 50, 1, 9, k.PAL.bone);
      k.line(c, x0 - 1, 57, x0 + 8, 51, '#ffffff');
    }
    reframe(c, k);
  },
  // the boss coming down out of the sky like the meteor, a world of creatures looking up
  EXTINCTION_LEVEL: (c, k) => {
    bd(c, k, '#2a1a10', '#080404', '#e0b040');
    for (let i = 0; i < 18; i++) k.put(c, 3 + k.hash(i, 1) * 58, 3 + k.hash(i, 2) * 36, '#f4ecd2');
    // the world's curve
    for (let x = 2; x < 62; x++) { const y = 50 + Math.round(((x - 32) / 30) ** 2 * 6); k.rect(c, x, y, 1, 62 - y, '#2c4a2c'); k.put(c, x, y, '#56763a'); }
    fireCone(c, k, 34, 26, 0, -6, 30, 6, 3);
    bossAt(c, k, 36, 22, { dir: 4, frame: 0, mouth: true }, { outline: k.PAL.fire2 });
    k.critter(c, 'cow', 12, 52, 2); heroAt(c, k, 'warrior', 32, 54, 2, { outline: k.PAL.ink }); k.critter(c, 'chicken', 52, 53, 2);
    for (const x of [12, 32, 52]) k.label(c, '!', x + 1, 40, k.PAL.gold);
    reframe(c, k);
  },
  // the Bone King, the boss's trophy, haloed: the king is dead, long live the king
  REGICIDE: (c, k) => {
    bd(c, k, '#3a1a4a', '#0e0614', '#e0b040');
    for (let y = 2; y < 62; y++) for (let x = 2; x < 62; x++) {
      const d = Math.hypot(x - 32, y - 28);
      if (d < 22 && ((Math.atan2(y - 28, x - 32) * 8 / Math.PI) | 0) % 2 === 0) { c.globalAlpha = 0.25 * (1 - d / 22); k.put(c, x, y, '#ffd75a'); c.globalAlpha = 1; }
    }
    oval(c, k, 32, 58, 14, 2, '#1a0c20');
    const BONE_KING = [
      '....Y.Y.Y....',
      '....YCYCY....',
      '....YYYYY....',
      '....bbbbb....',
      '....bgbgb....',
      '....bbbbb....',
      '.....bxb.....',
      '..KK..b..KK..',
      '.KKbbbbbbbKK.',
      '.KK...b...KK.',
      '.KK.bbbbb.KK.',
      '.KKb..b..bKK.',
      '.KKb.bbb.bKK.',
      '.KK...b...KK.',
      '.KK..bbb..KK.',
      '.K...b.b...K.',
      '.....b.b.....',
      '....bb.bb....',
    ];
    ol(c, k, x => pixC(x, BONE_KING, { ...addPal(k), b: k.PAL.bone, g: k.PAL.heal, x: k.PAL.ink }, 32, 31, 3));
    star(c, k, 39, 4, '#ffffff', true);
    reframe(c, k);
  },
  // the Horse Guy, still in the saddle, raked by a swipe
  TOO_SLOW: (c, k) => {
    bd(c, k, '#2a5a6a', '#081418', '#7ab0c0');
    // the Horse Guy, side on, reaching out for a fistful of fur
    const HORSE = [
      '.......hh.............',
      '.......ss.............',
      '......TTTTTTS.........',
      '.......TT.............',
      '.......TT.........MM..',
      '..M...TTTT.......MMNN.',
      '.MM.NNTTNNNNNNNNMNNNNe',
      'MM.NNNTNNNNNNNNNNNNNNNN',
      'M..NNNTNNNNNNNNNN..NNnN',
      '...NNNNNNNNNNNNNN...nn.',
      '....NNNNNNNNNNNN.......',
      '....NN.N....NN.N.......',
      '....N..N....N..N.......',
      '....N..N....N...N......',
      '....D..D....D...D......',
    ];
    const hp = { h: k.PAL.hair, s: k.PAL.skin, T: k.PAL.tan, S: k.PAL.steelHi, M: k.PAL.mane, N: k.PAL.horse, n: k.PAL.horseD, D: k.PAL.ink, e: k.PAL.ink };
    ol(c, k, x => pixC(x, HORSE, hp, 28, 36, 2));
    // the tuft of fur he was going for
    pix(c, ['.F.F', 'FfFf', 'fFfF', 'FfF.'], { F: k.PAL.fur3, f: k.PAL.fur2 }, 54, 22, 2);
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, x = 50 - 36 * t + s * 6, y = 8 + 48 * t + Math.sin(t * Math.PI) * -3, w = Math.sin(t * Math.PI) * 1.6;
        for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) if (Math.abs(j) <= w) k.put(c, x + j, y, Math.abs(j) < 0.8 ? '#ffffff' : '#ffc0b0');
      }
    }
    reframe(c, k);
  },
  // an egg, cracked open, the boss's horns and eyes peeking out
  HATCHED_PERFECT: (c, k) => {
    bd(c, k, '#5a4010', '#140c02', '#e0b040');
    for (const [x, y, b] of [[10, 10, 1], [54, 12, 1], [8, 40, 0], [56, 44, 0], [48, 4, 0]]) star(c, k, x, y, '#fff2b0', !!b);
    // the lower shell
    const shell = (x, y) => { const d = ((x - 32) / 17) ** 2 + ((y - 38) / 22) ** 2; return d <= 1; };
    for (let y = 16; y < 62; y++) for (let x = 12; x < 52; x++) {
      if (!shell(x, y)) continue;
      const crack = 28 + ((x >> 2) % 2 ? 3 : 0);
      if (y < crack) continue;
      const edge = !shell(x - 1, y) || !shell(x + 1, y) || !shell(x, y + 1);
      k.put(c, x, y, edge ? k.PAL.ink : y === crack ? '#fffbe8' : x > 40 ? '#d8c8a0' : (k.hash(x >> 1, y >> 1) < 0.08 ? '#a8977a' : '#f2ead2'));
    }
    // the head coming out: brown fur, horns, eyes
    oval(c, k, 32, 27, 10, 6, k.PAL.fur3, k.PAL.fur2, 0.7);
    k.rect(c, 22, 30, 21, 1, k.PAL.fur1);
    // horns curling up out of the shell; the shell's cap sits on the right one like a hat
    ol(c, k, x => {
      pix(x, [
        'H....................H',
        'HH..................HH',
        '.HH................HH.',
        '.HHh..............hHH.',
        '..hhh............hhh..',
        '...hhh..........hhh...',
      ], { H: k.PAL.horn, h: k.PAL.hornD }, 21, 16, 1);
    });
    for (const x of [27, 36]) { k.rect(c, x, 25, 2, 2, k.PAL.eye); k.put(c, x, 25, '#ffffff'); }
    // bits of shell flying
    ol(c, k, x => { pix(x, ['..ww', '.www', 'wwd.'], { w: '#f2ead2', d: '#d8c8a0' }, 8, 20, 2); pix(x, ['ww..', 'www.', '.dww'], { w: '#f2ead2', d: '#d8c8a0' }, 48, 22, 2); pix(x, ['ww', 'wd'], { w: '#f2ead2', d: '#d8c8a0' }, 44, 10, 1); });
    reframe(c, k);
  },
  // a mushroom cloud with the boss's horns on it, over flattened walls and towers
  LUMBERING_NUKE: (c, k) => {
    bd(c, k, '#7a3a10', '#1a0804', '#e0a040');
    // flash ring on the ground
    oval(c, k, 32, 56, 28, 5, '#e0a040', '#8a4a14', 0.5);
    // the stem
    for (let y = 26; y < 56; y++) { const w = 4 + Math.round(((y - 26) / 30) ** 2 * 8); for (let x = -w; x <= w; x++) k.put(c, 32 + x, y, Math.abs(x) < w * 0.4 ? k.PAL.fire3 : Math.abs(x) < w * 0.75 ? k.PAL.fire2 : k.PAL.fire1); }
    // the cap
    for (let y = 6; y < 30; y++) for (let x = 6; x < 58; x++) {
      const d = ((x - 32) / 24) ** 2 + ((y - 20) / 11) ** 2 + (k.hash(x >> 1, y >> 1) - 0.5) * 0.25;
      if (d > 1) continue;
      k.put(c, x, y, d > 0.8 ? '#5a3020' : y > 24 ? k.PAL.fire1 : d < 0.3 ? k.PAL.fire3 : k.PAL.fire2);
    }
    // its horns and eyes
    ol(c, k, x => pix(x, ['H..........................H', 'HH........................HH', 'HH........................HH', '.HHh....................hHH.', '..hhh..................hhh..', '...hhh................hhh...'], { H: k.PAL.horn, h: k.PAL.hornD }, 18, 3, 1));
    for (const x of [25, 37]) { k.rect(c, x, 17, 3, 2, k.PAL.ink); k.put(c, x + 1, 17, '#ffffff'); }
    // rubble at the foot
    for (let i = 0; i < 18; i++) { const x = 4 + k.hash(i, 3) * 56, y = 55 + k.hash(i, 4) * 6; k.rect(c, x, y, 3, 2, '#3a3a36'); k.put(c, x, y, '#aeac9b'); }
    reframe(c, k);
  },
  // the boss in its secret cow skin, out in the dark fen, mooing
  MOO: (c, k) => {
    bd(c, k, '#183a36', '#04080a', '#4a8a80');
    for (const [x, y] of [[8, 46], [56, 30], [10, 14], [52, 54]]) { k.put(c, x, y, '#a8ffd8'); c.globalAlpha = 0.4; k.put(c, x - 1, y, '#a8ffd8'); k.put(c, x + 1, y, '#a8ffd8'); k.put(c, x, y - 1, '#a8ffd8'); k.put(c, x, y + 1, '#a8ffd8'); c.globalAlpha = 1; }
    bossAt(c, k, 30, 34, { dir: 8, look: { cow: true } }, { outline: k.PAL.ink });
    // the speech bubble
    k.rect(c, 37, 4, 22, 11, k.PAL.ink); k.rect(c, 38, 5, 20, 9, k.PAL.cream); k.rect(c, 40, 14, 3, 2, k.PAL.cream); k.put(c, 39, 16, k.PAL.cream);
    k.drawText(c, 'MOO.', 48, 7, k.PAL.ink, { align: 'center', shadow: false });
    reframe(c, k);
  },
  // two Suicide Steers up on their hind legs, dancing over the boss's body
  DANSE_MOOCABRE: (c, k) => {
    bd(c, k, '#3a1a4a', '#08040e', '#9a6ad0');
    // spotlight
    for (let y = 2; y < 62; y++) { const w = 6 + (y - 2) * 0.45; c.globalAlpha = 0.12; k.rect(c, 32 - w, y, w * 2, 1, '#ffe8ff'); c.globalAlpha = 1; }
    // the boss, belly up, darkened
    bossAt(c, k, 30, 52, { dir: 0 }, { fy: true, tint: '#6a6a7a', tintA: 0.45, outline: k.PAL.ink });
    k.critter(c, 'fen_steer', 16, 24, 2, { dance: { t: 0 } }); k.critter(c, 'fen_steer', 44, 24, 2, { dance: { t: 0.3 }, fx: -1 });
    // music
    pix(c, ['.kk', '.kk', '.k.', 'kk.', 'kk.'], { k: '#ffe8ff' }, 29, 8, 1); pix(c, ['.kkk', '.k.k', 'kk.k', 'kkkk'], { k: '#ffe8ff' }, 36, 14, 1);
    reframe(c, k);
  },
};
